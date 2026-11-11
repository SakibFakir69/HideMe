import CommonCrypto
import ExpoModulesCore

/**
 * Native PBKDF2-HMAC-SHA256 for the vault PIN.
 *
 * The pure-JS implementation in `@noble/hashes` takes tens of seconds on
 * Hermes for 210k rounds. iOS ships CommonCrypto's PBKDF2, which runs the
 * same PBKDF2-HMAC-SHA256 in native code in a fraction of a second and
 * produces byte-identical output to the Android platform provider and to the
 * JS fallback, so vault records stay portable across platforms.
 *
 * The salt and the derived key travel as lowercase hex so both native
 * platforms share one wire format, no binary bridging is needed, and the
 * representation matches the `salt`/`hash` fields of the stored secret
 * record.
 */
public final class VaultCryptoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VaultCrypto")

    Function("isAvailable") { () -> Bool in
      // CommonCrypto has shipped PBKDF2 since iOS 5 and there is no algorithm
      // variant to probe for, so "the module is linked" is the availability
      // check. The JS side falls back to `@noble/hashes` when this is absent.
      true
    }

    AsyncFunction("pbkdf2") {
      (password: String, saltHex: String, iterations: Int, keyLength: Int) throws -> String in
      guard iterations > 0 else {
        throw VaultCryptoException("iterations must be positive")
      }
      guard iterations <= Int(UInt32.max) else {
        throw VaultCryptoException("iterations must fit in an unsigned 32-bit integer")
      }
      guard keyLength > 0 else {
        throw VaultCryptoException("keyLength must be positive")
      }
      guard let salt = hexToBytes(saltHex) else {
        throw VaultCryptoException("salt must be valid hex")
      }

      // PBKDF2 consumes the password as bytes. UTF-8 matches the Android
      // platform provider (Conscrypt) and `@noble/hashes`, so all three
      // implementations agree on the output for the same input.
      let passwordBytes = Array(password.utf8)
      var derived = [UInt8](repeating: 0, count: keyLength)

      let status: Int32 = salt.withUnsafeBytes { rawSalt -> Int32 in
        let saltPointer = rawSalt.baseAddress?.assumingMemoryBound(to: UInt8.self)
        return passwordBytes.withUnsafeBufferPointer { passwordBuffer -> Int32 in
          let passwordPointer = passwordBuffer.baseAddress?.withMemoryRebound(
            to: Int8.self,
            capacity: passwordBytes.count
          )
          return derived.withUnsafeMutableBytes { derivedBuffer -> Int32 in
            guard let derivedPointer = derivedBuffer.baseAddress?.assumingMemoryBound(to: UInt8.self) else {
              return Int32(kCCParamError)
            }
            return CCKeyDerivationPBKDF(
              CCPBKDFAlgorithm(kCCPBKDF2),
              passwordPointer,
              passwordBytes.count,
              saltPointer,
              salt.count,
              CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
              UInt32(iterations),
              derivedPointer,
              keyLength
            )
          }
        }
      }

      guard status == kCCSuccess else {
        throw VaultCryptoException("PBKDF2 failed with status \(status)")
      }
      return bytesToHex(derived)
    }
  }
}

/// Failure raised for invalid arguments or a CommonCrypto error.
internal final class VaultCryptoException: GenericException<String> {
  override public var reason: String {
    return param
  }
}

/// Decodes a lowercase or uppercase hex string into bytes. Returns nil on any
/// invalid character or an odd number of characters.
private func hexToBytes(_ hex: String) -> [UInt8]? {
  let chars = Array(hex.utf8)
  guard chars.count % 2 == 0 else { return nil }
  var out = [UInt8]()
  out.reserveCapacity(chars.count / 2)
  var high: UInt8?
  for char in chars {
    let value: UInt8
    switch char {
    case 0x30...0x39: value = char - 0x30 // 0-9
    case 0x61...0x66: value = char - 0x61 + 10 // a-f
    case 0x41...0x46: value = char - 0x41 + 10 // A-F
    default: return nil
    }
    if let pending = high {
      out.append(pending << 4 | value)
      high = nil
    } else {
      high = value
    }
  }
  return high == nil ? out : nil
}

/// Encodes bytes as lowercase hex.
private func bytesToHex(_ bytes: [UInt8]) -> String {
  let alphabet: [Character] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b", "c", "d", "e", "f"]
  var out = ""
  out.reserveCapacity(bytes.count * 2)
  for byte in bytes {
    out.append(alphabet[Int(byte >> 4)])
    out.append(alphabet[Int(byte & 0x0f)])
  }
  return out
}
