package expo.modules.vaultcrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.NoSuchAlgorithmException
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.min

/**
 * Hardware-accelerated PBKDF2 for the vault PIN.
 *
 * The pure-JS implementation in `@noble/hashes` takes minutes on Hermes for
 * 210k rounds. Android's platform provider (Conscrypt on API 26+) runs the
 * same PBKDF2-HMAC-SHA256 in native code, which takes a few hundred
 * milliseconds for the same parameters and produces identical bytes.
 *
 * Devices older than Android 8 have no platform PBKDF2-HMAC-SHA256, and the
 * JS fallback there costs minutes per unlock. `javax.crypto.Mac` has shipped
 * HmacSHA256 since API 1, so the module derives the key itself with the same
 * construction (RFC 8018) when the platform provider is missing: still
 * native code, still off the JS thread, but seconds instead of minutes.
 *
 * Availability is reported to JS so it can fall back to the JS implementation
 * on old Android versions, iOS, web and Expo Go.
 *
 * The salt and the derived key travel as lowercase hex so every platform
 * shares one wire format and the representation matches the `salt`/`hash`
 * fields of the stored secret record.
 */
class VaultCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VaultCrypto")

    Function("isAvailable") {
      // Either the platform provider or the portable construction can derive
      // the key, and the portable path works on every Android version.
      hasPlatformProvider() || hasHmacSha256()
    }

    AsyncFunction("pbkdf2") { password: String, saltHex: String, iterations: Int, keyLength: Int ->
      require(iterations > 0) { "iterations must be positive" }
      require(keyLength > 0) { "keyLength must be positive" }

      val salt = hexToBytes(saltHex)
      val chars = password.toCharArray()
      val bytes = password.toByteArray(Charsets.UTF_8)
      try {
        val derived = if (hasPlatformProvider()) {
          val spec = PBEKeySpec(chars, salt, iterations, keyLength * 8)
          try {
            SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).encoded
          } finally {
            spec.clearPassword()
          }
        } else {
          pbkdf2Portable(bytes, salt, iterations, keyLength)
        }
        derived.toHex()
      } finally {
        chars.fill('\u0000')
        bytes.fill(0)
      }
    }
  }

  private companion object {
    /** PBKDF2-HMAC-SHA256 is available from Android 8.0 (API 26). */
    const val ALGORITHM = "PBKDF2WithHmacSHA256"
    const val HMAC_ALGORITHM = "HmacSHA256"
  }
}

/** Is the platform PBKDF2-HMAC-SHA256 provider present? */
private fun hasPlatformProvider(): Boolean {
  return try {
    SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
    true
  } catch (e: NoSuchAlgorithmException) {
    false
  }
}

/** Is the HMAC-SHA256 primitive present? It has shipped since API 1. */
private fun hasHmacSha256(): Boolean {
  return try {
    Mac.getInstance("HmacSHA256")
    true
  } catch (e: NoSuchAlgorithmException) {
    false
  }
}

/**
 * PBKDF2-HMAC-SHA256 (RFC 8018) built on `javax.crypto.Mac`.
 *
 * Used on Android versions without the platform PBKDF2 provider. The
 * password is the UTF-8 byte sequence, which is what the platform provider
 * and the JS implementation use as well, so all three agree on the output.
 */
private fun pbkdf2Portable(password: ByteArray, salt: ByteArray, iterations: Int, dkLen: Int): ByteArray {
  val mac = Mac.getInstance("HmacSHA256")
  mac.init(SecretKeySpec(password, "HmacSHA256"))
  val hLen = mac.macLength
  val blocks = (dkLen + hLen - 1) / hLen
  val out = ByteArray(dkLen)

  val block = ByteArray(salt.size + 4)
  salt.copyInto(block)

  for (index in 1..blocks) {
    block[salt.size] = (index ushr 24).toByte()
    block[salt.size + 1] = (index ushr 16).toByte()
    block[salt.size + 2] = (index ushr 8).toByte()
    block[salt.size + 3] = index.toByte()

    mac.reset()
    mac.update(block)
    var u = mac.doFinal()
    val t = u.copyOf()

    for (round in 2..iterations) {
      mac.reset()
      mac.update(u)
      u = mac.doFinal()
      for (i in t.indices) {
        t[i] = (t[i].toInt() xor u[i].toInt()).toByte()
      }
    }

    val offset = (index - 1) * hLen
    val length = min(hLen, dkLen - offset)
    System.arraycopy(t, 0, out, offset, length)
  }

  return out
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
