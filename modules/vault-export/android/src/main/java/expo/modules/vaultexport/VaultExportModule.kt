package expo.modules.vaultexport

import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileInputStream

/**
 * Saves a prepared file into a location the user picks.
 *
 * Android's share sheet can send a file to another app, but it cannot write
 * to a folder the user owns — that needs the Storage Access Framework
 * (`ACTION_CREATE_DOCUMENT`). This module asks the system for a destination
 * and copies the file there.
 *
 * iOS does not need it: the share sheet already offers "Save to Files".
 */
class VaultExportModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingSource: String? = null

  override fun definition() = ModuleDefinition {
    Name("VaultExport")

    Function("isAvailable") {
      true
    }

    AsyncFunction("saveAs") { sourcePath: String, mimeType: String, suggestedName: String, promise: Promise ->
      if (pendingPromise != null) {
        promise.reject("E_ALREADY_PENDING", "Another save is already running.")
        return@AsyncFunction
      }

      val source = File(stripFileScheme(sourcePath))
      if (!source.exists()) {
        promise.reject("E_NO_FILE", "The file to save does not exist.")
        return@AsyncFunction
      }

      val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = if (mimeType.isBlank()) "application/octet-stream" else mimeType
        putExtra(Intent.EXTRA_TITLE, suggestedName)
      }

      pendingPromise = promise
      pendingSource = sourcePath

      appContext.throwingActivity.startActivityForResult(intent, CREATE_DOCUMENT_CODE)

      OnActivityResult { _, (requestCode, resultCode, data) ->
        if (requestCode != CREATE_DOCUMENT_CODE) {
          return@OnActivityResult
        }
        val promise = pendingPromise
        val sourcePath = pendingSource
        pendingPromise = null
        pendingSource = null
        if (promise == null) {
          return@OnActivityResult
        }
        if (resultCode != android.app.Activity.RESULT_OK || data?.data == null) {
          // The user dismissed the file picker — nothing was written.
          promise.resolve(null)
          return@OnActivityResult
        }

        val uri = data.data!!
        val source = sourcePath?.let { File(stripFileScheme(it)) }
        if (source == null || !source.exists()) {
          promise.reject("E_NO_FILE", "The file to save does not exist.")
          return@OnActivityResult
        }

        // The copy can be large, so it runs off the main thread.
        CoroutineScope(Dispatchers.IO).launch {
          try {
            val resolver = appContext.reactContext?.contentResolver
              ?: throw CodedException("E_NO_CONTEXT", "No context to write the file.")
            resolver.openOutputStream(uri)?.use { output ->
              FileInputStream(source).use { input -> input.copyTo(output) }
            } ?: throw CodedException("E_WRITE", "The chosen location could not be opened.")

            promise.resolve(uri.toString())
          } catch (error: Exception) {
            promise.reject("E_WRITE", error.message ?: "The file could not be saved.")
          }
        }
      }
    }
  }

  private fun stripFileScheme(path: String): String {
    return if (path.startsWith("file://")) path.removePrefix("file://") else path
  }

  private companion object {
    const val CREATE_DOCUMENT_CODE = 0x5645
  }
}
