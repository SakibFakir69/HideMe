package expo.modules.vaultcrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.NoSuchAlgorithmException
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Hardware-accelerated PBKDF2 for the vault PIN.
 *
 * The pure-JS implementation in `@noble/hashes` takes minutes on Hermes for
 * 210k rounds. Android's platform provider (Conscrypt on API 26+) runs the
 * same PBKDF2-HMAC-SHA256 in native code, which takes a few hundred
 * milliseconds for the same parameters and produces identical bytes.
 *
 * Availability is reported to JS so it can fall back to the JS implementation
 * on older Android versions, iOS, web and Expo Go.
 *
 * The salt and the derived key travel as lowercase hex so every platform
 * shares one wire format and the representation matches the `salt`/`hash`
 * fields of the stored secret record.
 */
class VaultCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VaultCrypto")

    Function("isAvailable") {
      try {
        SecretKeyFactory.getInstance(ALGORITHM)
        true
      } catch (e: NoSuchAlgorithmException) {
        false
      }
    }

    AsyncFunction("pbkdf2") { password: String, saltHex: String, iterations: Int, keyLength: Int ->
      require(iterations > 0) { "iterations must be positive" }
      require(keyLength > 0) { "keyLength must be positive" }

      val salt = hexToBytes(saltHex)
      val chars = password.toCharArray()
      val spec = PBEKeySpec(chars, salt, iterations, keyLength * 8)
      try {
        SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded.toHex()
      } finally {
        spec.clearPassword()
        chars.fill('\u0000')
      }
    }
  }

  private companion object {
    /** PBKDF2-HMAC-SHA256 is available from Android 8.0 (API 26). */
    const val ALGORITHM = "PBKDF2WithHmacSHA256"
  }
}

/** Decodes a lowercase or uppercase hex string into bytes. */
private fun hexToBytes(hex: String): ByteArray {
  require(hex.length % 2 == 0) { "salt must be hex" }
  val out = ByteArray(hex.length / 2)
  for (i in out.indices) {
    val hi = hex[i * 2].digitToInt(16)
    val lo = hex[i * 2 + 1].digitToInt(16)
    out[i] = ((hi shl 4) or lo).toByte()
  }
  return out
}

/** Encodes bytes as lowercase hex. */
private fun ByteArray.toHex(): String {
  val out = StringBuilder(size * 2)
  for (byte in this) {
    val value = byte.toInt() and 0xff
    out.append(HEX[value shr 4])
    out.append(HEX[value and 0x0f])
  }
  return out.toString()
}

private const val HEX = "0123456789abcdef"
