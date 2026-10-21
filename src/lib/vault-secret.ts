import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  MASTER_KEY_BYTES,
  aesGcmUnwrap,
  aesGcmWrap,
  base64ToBytes,
  bytesToBase64,
  utf8,
} from './crypto/envelope';

const STORAGE_KEY = 'vault.secret.v1';
const BIOMETRIC_KEY = 'vault.mk.biometric';
const ALGO = 'pbkdf2-sha256';
// 150k: OWASP's 600k figure targets server CPUs; on mobile (esp. emulator/dev
// JS threads) 600k took minutes. 150k keeps solid stretching at usable UX.
// Stored records carry their own `c`, so old setups keep their original cost.
export const PBKDF2_ROUNDS = 150_000;
const ITERATIONS = PBKDF2_ROUNDS;
const SALT_BYTES = 16;
const DK_BYTES = 64; // [0:32] = verify hash, [32:64] = key-encryption key
const DIGITS_RE = /^\d+$/;
const MK_AAD = utf8('hideme.vault.mk.v2');

export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 12;

export interface SecretRecord {
  v: number;
  algo: string;
  c: number;
  len: number;
  salt: string;
  hash: string;
  /** v2: master key wrapped by the PIN-derived KEK (base64 nonce||ct, AES-256-GCM) */
  mk?: { ct: string };
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function isValidCode(code: string): boolean {
  return (
    code.length >= MIN_CODE_LENGTH &&
    code.length <= MAX_CODE_LENGTH &&
    DIGITS_RE.test(code)
  );
}

const rand = (length: number): Uint8Array => Crypto.getRandomBytes(length);

async function derive(code: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, code, salt, {
    c: iterations,
    dkLen: DK_BYTES,
    // Yield to RN's event loop only every ~100ms of work: smaller ticks made
    // thousands of setTimeout hops whose Android timer latency dominated
    // total time (the "minutes to secure a PIN" bug).
    asyncTick: 100,
  });
}

function splitDerived(dk: Uint8Array): { hash: Uint8Array; kek: Uint8Array } {
  return { hash: dk.subarray(0, 32), kek: dk.subarray(32, 64) };
}

function wrapMasterKey(kek: Uint8Array, masterKey: Uint8Array): { ct: string } {
  const blob = aesGcmWrap(kek, masterKey, MK_AAD, rand);
  kek.fill(0);
  return { ct: bytesToBase64(blob) };
}

function unwrapMasterKey(mk: { ct: string }, kek: Uint8Array): Uint8Array {
  return aesGcmUnwrap(kek, base64ToBytes(mk.ct), MK_AAD);
}

let cachedRecord: SecretRecord | null = null;

async function loadRecord(): Promise<SecretRecord | null> {
  if (cachedRecord !== null) return cachedRecord;
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SecretRecord;
    if (parsed.algo !== ALGO || !parsed.salt || !parsed.hash) return null;
    cachedRecord = parsed;
    return cachedRecord;
  } catch {
    return null;
  }
}

async function persistRecord(record: SecretRecord): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(record));
  cachedRecord = record;
}

export async function hasSecret(): Promise<boolean> {
  return (await loadRecord()) !== null;
}

/**
 * Creates the secret code AND the vault master key in one pass.
 * Returns the master key so the caller can enter the unlocked session.
 */
export async function setupSecretCode(code: string): Promise<Uint8Array> {
  if (!isValidCode(code)) {
    throw new Error(
      `Code must be ${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits with no other characters.`,
    );
  }
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure storage is not available on this platform.');
  }
  if (await loadRecord()) {
    throw new Error('A secret code is already set.');
  }
  const salt = Crypto.getRandomBytes(SALT_BYTES);
  const { hash, kek } = splitDerived(await derive(code, salt, ITERATIONS));
  const masterKey = Crypto.getRandomBytes(MASTER_KEY_BYTES);
  const wrapped = wrapMasterKey(kek, masterKey);
  const record: SecretRecord = {
    v: 2,
    algo: ALGO,
    c: ITERATIONS,
    len: code.length,
    salt: toHex(salt),
    hash: toHex(hash),
    mk: wrapped,
  };
  await persistRecord(record);
  return masterKey;
}

/**
 * Verifies the code and returns the unwrapped master key, in one PBKDF2 pass.
 * v1 records (verify-hash only, no master key yet) are migrated to v2 here.
 * Returns null when the code does not match.
 */
export async function unlockWithSecretCode(candidate: string): Promise<Uint8Array | null> {
  try {
    const record = await loadRecord();
    if (!record) {
      console.log('[unlock] no record in storage');
      return null;
    }
    console.log(`[unlock] record len=${record.len} c=${record.c} hasMk=${!!record.mk}`);
    if (candidate.length !== record.len || !DIGITS_RE.test(candidate)) return null;
    const { hash, kek } = splitDerived(await derive(candidate, fromHex(record.salt), record.c));
    if (!constantTimeEqual(hash, fromHex(record.hash))) {
      kek.fill(0);
      return null;
    }
    if (record.mk) {
      const masterKey = unwrapMasterKey(record.mk, kek);
      kek.fill(0);
      return masterKey;
    }
    // v1 → v2 migration: this code was never paired with a master key (no
    // encrypted files exist yet), so create and wrap one now.
    const masterKey = Crypto.getRandomBytes(MASTER_KEY_BYTES);
    const wrapped = wrapMasterKey(kek, masterKey);
    await persistRecord({ ...record, v: 2, mk: wrapped });
    return masterKey;
  } catch {
    return null;
  }
}

/**
 * Changes the secret code by re-wrapping the existing master key under the
 * new code — encrypted files are untouched and stay readable.
 */
export async function changeSecretCode(oldCode: string, newCode: string): Promise<void> {
  if (!isValidCode(newCode)) {
    throw new Error(
      `Code must be ${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits with no other characters.`,
    );
  }
  const record = await loadRecord();
  if (!record) throw new Error('No secret code is set.');
  if (!record.mk) throw new Error('Initialize the vault by unlocking once with your code.');
  if (oldCode.length !== record.len || !DIGITS_RE.test(oldCode)) {
    throw new Error('Current code is incorrect.');
  }
  const old = splitDerived(await derive(oldCode, fromHex(record.salt), record.c));
  if (!constantTimeEqual(old.hash, fromHex(record.hash))) {
    old.kek.fill(0);
    throw new Error('Current code is incorrect.');
  }
  const masterKey = unwrapMasterKey(record.mk, old.kek);
  old.kek.fill(0);

  const salt = Crypto.getRandomBytes(SALT_BYTES);
  const next = splitDerived(await derive(newCode, salt, ITERATIONS));
  const wrapped = wrapMasterKey(next.kek, masterKey);
  await persistRecord({
    ...record,
    v: 2,
    c: ITERATIONS,
    len: newCode.length,
    salt: toHex(salt),
    hash: toHex(next.hash),
    mk: wrapped,
  });
}

/* ------------------------------------------------------------------ */
/* biometric slot                                                      */
/* ------------------------------------------------------------------ */

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const LocalAuthentication = await import('expo-local-authentication');
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return false;
    return (await SecureStore.getItemAsync(BIOMETRIC_KEY)) !== null;
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean, masterKey?: Uint8Array): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure storage is not available on this platform.');
  }
  if (enabled) {
    if (!masterKey || masterKey.length !== MASTER_KEY_BYTES) {
      throw new Error('Master key required to enable biometric unlock.');
    }
    await SecureStore.setItemAsync(BIOMETRIC_KEY, bytesToBase64(masterKey));
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
  }
}

/** Read the master key from the Keychain/Keystore-protected biometric slot. */
export async function loadBiometricKey(): Promise<Uint8Array | null> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    const raw = await SecureStore.getItemAsync(BIOMETRIC_KEY);
    if (!raw) return null;
    const key = base64ToBytes(raw);
    return key.length === MASTER_KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}
