import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class VaultCryptoModule extends NativeModule<{}> {
  isAvailable(): boolean;
  pbkdf2(
    password: string,
    saltHex: string,
    iterations: number,
    keyLength: number,
  ): Promise<string>;
}

const VaultCrypto = requireOptionalNativeModule<VaultCryptoModule>('VaultCrypto');

const HEX_ALPHABET = '0123456789abcdef';

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const value = bytes[i];
    out += HEX_ALPHABET[value >> 4] + HEX_ALPHABET[value & 0x0f];
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = HEX_ALPHABET.indexOf(hex[i * 2]);
    const lo = HEX_ALPHABET.indexOf(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) return null;
    out[i] = (hi << 4) | lo;
  }
  return out;
}

/** True when the platform provides PBKDF2-HMAC-SHA256 (Android 8+, iOS). */
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
    const out: unknown = await VaultCrypto.pbkdf2(
      password,
      bytesToHex(salt),
      iterations,
      keyLength,
    );
    if (typeof out !== 'string') return null;
    const bytes = hexToBytes(out);
    if (!bytes || bytes.length !== keyLength) return null;
    return bytes;
  } catch {
    return null;
  }
}

export default VaultCrypto;
