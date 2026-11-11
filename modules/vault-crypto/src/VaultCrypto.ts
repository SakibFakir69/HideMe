import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class VaultCryptoModule extends NativeModule<{}> {
  isAvailable(): boolean;
  pbkdf2(
    password: string,
    salt: Uint8Array,
    iterations: number,
    keyLength: number,
  ): Promise<Uint8Array>;
}

const VaultCrypto = requireOptionalNativeModule<VaultCryptoModule>('VaultCrypto');

/** True when the platform provides PBKDF2-HMAC-SHA256 (Android 8.0+). */
export function isNativePbkdf2Available(): boolean {
  try {
    return VaultCrypto?.isAvailable() === true;
  } catch {
    return false;
  }
}

/**
 * Derives `keyLength` bytes with the platform PBKDF2-HMAC-SHA256.
 * Returns null when the native module is missing or the platform provider
 * does not support the algorithm, so callers can fall back to JS.
 */
export async function nativePbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLength: number,
): Promise<Uint8Array | null> {
  if (!VaultCrypto) return null;
  try {
    const out: unknown = await VaultCrypto.pbkdf2(password, salt, iterations, keyLength);
    const bytes =
      out instanceof Uint8Array
        ? out
        : out instanceof ArrayBuffer
          ? new Uint8Array(out)
          : null;
    if (!bytes || bytes.length !== keyLength) return null;
    return bytes;
  } catch {
    return null;
  }
}

export default VaultCrypto;
