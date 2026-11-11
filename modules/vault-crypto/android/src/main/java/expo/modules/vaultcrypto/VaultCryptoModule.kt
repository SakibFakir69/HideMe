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

    AsyncFunction("pbkdf2") { password: String, salt: ByteArray, iterations: Int, keyLength: Int ->
      require(iterations > 0) { "iterations must be positive" }
      require(keyLength > 0) { "keyLength must be positive" }

      val chars = password.toCharArray()
      val spec = PBEKeySpec(chars, salt, iterations, keyLength * 8)
      try {
        SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded
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
