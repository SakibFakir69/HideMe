import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * PBKDF2-HMAC-SHA256 key derivation.
 *
 * The pure-JS implementation in `@noble/hashes` takes tens of seconds on
 * Hermes for 210k rounds, so the app prefers a platform provider (Android's
 * Conscrypt, iOS' CommonCrypto) and falls back to JS when none is linked.
 * Both paths implement the same standard and produce identical bytes, so a
 * vault record stays portable across platforms.
 *
 * This module is pure (no react-native imports) so it runs under node tests.
 */

/**
 * Platform provider contract. Resolves null when the platform cannot derive
 * the key, which makes the caller fall back to the pure-JS implementation.
 */
export type NativePbkdf2Provider = (
  password: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
) => Promise<Uint8Array | null>;

/** OWASP's documented minimum for PBKDF2-HMAC-SHA256. */
export const PBKDF2_SHA256_ROUNDS = 210_000;

/** Which implementation produced the derived key. */
export type Pbkdf2Source = 'native' | 'js';

export interface DerivedKey {
  key: Uint8Array;
  source: Pbkdf2Source;
}

/** Pure-JS PBKDF2-HMAC-SHA256. */
export async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, password, salt, {
    c: iterations,
    dkLen,
    // Yield to RN's event loop only every ~100ms of work: smaller ticks made
    // thousands of setTimeout hops whose Android timer latency dominated
    // total time (the "minutes to secure a PIN" bug).
    asyncTick: 100,
  });
}

/**
 * Derives a key with the platform provider when it is available and returns
 * a correctly sized result, otherwise with the pure-JS implementation.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
  native?: NativePbkdf2Provider,
): Promise<DerivedKey> {
  if (native) {
    const key = await native(password, salt, iterations, dkLen);
    if (key && key.length === dkLen) {
      return { key, source: 'native' };
    }
  }
  return { key: await pbkdf2Sha256(password, salt, iterations, dkLen), source: 'js' };
}
