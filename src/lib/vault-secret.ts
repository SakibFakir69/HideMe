import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { nativePbkdf2 } from '../../modules/vault-crypto';
import {
  MASTER_KEY_BYTES,
  aesGcmUnwrap,
  aesGcmWrap,
  base64ToBytes,
  bytesToBase64,
  utf8,
} from './crypto/envelope';
import { deriveKey } from './crypto/pbkdf2';

const STORAGE_KEY = 'vault.secret.v1';
const DECOY_STORAGE_KEY = 'vault.secret.decoy.v1';
const BIOMETRIC_KEY = 'vault.mk.biometric';
const ALGO = 'pbkdf2-sha256';
// 210k: OWASP's 2023+ documented minimum for PBKDF2-SHA256. Android runs this
// through the platform provider (native, ~1 s); Hermes/iOS/web fall back to
// the pure-JS implementation, which is much slower but produces identical
// bytes, so records stay portable across platforms.
// Stored records carry their own `c`, so old setups keep their original cost.
export const PBKDF2_ROUNDS = 210_000;
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
  // The platform provider (Android's Conscrypt, iOS' CommonCrypto) runs the
  // same PBKDF2-HMAC-SHA256 natively in a fraction of the time the pure-JS
  // implementation needs on Hermes, and produces identical bytes so records
  // stay portable. Everything else falls back to the JS implementation.
  const started = Date.now();
  const { key, source } = await deriveKey(code, salt, iterations, DK_BYTES, nativePbkdf2);
  if (__DEV__) {
    console.log(`[vault] PBKDF2 ${iterations} iters via ${source} in ${Date.now() - started} ms`);
  }
  return key;
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
const cachedByStore = new Map<string, SecretRecord>();

async function loadRecord(): Promise<SecretRecord | null> {
  if (cachedRecord !== null) return cachedRecord;
  return loadRecordFrom(STORAGE_KEY, cachedByStore);
}

async function loadRecordFrom(
  storageKey: string,
  cache: Map<string, SecretRecord> | null,
): Promise<SecretRecord | null> {
  const cached = cache?.get(storageKey) ?? null;
  if (cached) return cached;
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    const raw = await SecureStore.getItemAsync(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SecretRecord;
    if (parsed.algo !== ALGO || !parsed.salt || !parsed.hash) return null;
    cache?.set(storageKey, parsed);
    return parsed;
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
    if (!record) return null;
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
 * Derives the master key an arbitrary record describes (used by backup
 * restore: the header carries the secret record from when the backup was
 * made, which may use a different code than the current one).
 */
export async function masterKeyForRecord(
  record: SecretRecord,
  code: string,
): Promise<Uint8Array> {
  if (record.algo !== ALGO || !record.mk) {
    throw new Error('Backup secret record is not supported.');
  }
  if (code.length !== record.len || !DIGITS_RE.test(code)) {
    throw new Error('Wrong code for this backup.');
  }
  const { hash, kek } = splitDerived(await derive(code, fromHex(record.salt), record.c));
  if (!constantTimeEqual(hash, fromHex(record.hash))) {
    kek.fill(0);
    throw new Error('Wrong code for this backup.');
  }
  const masterKey = unwrapMasterKey(record.mk, kek);
  kek.fill(0);
  return masterKey;
}

/** The current real secret record (backup export embeds it in the header). */
export async function currentSecretRecord(): Promise<SecretRecord | null> {
  return loadRecord();
}

/**
 * Replaces the real secret record with one from a backup header. The biometric
 * slot holds the OLD master key, so it is cleared — the user re-enables it
 * against the restored key.
 */
export async function adoptSecretRecord(record: SecretRecord): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(record));
  cachedRecord = record;
  cachedByStore.set(STORAGE_KEY, record);
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
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
  const salt = Crypto.getRandomBytes(SALT_BYTES);
  // Both derivations are CPU-bound and independent, so they run concurrently:
  // the platform provider overlaps them and the wall-clock cost of a code
  // change drops from two serial PBKDF2 passes to roughly one.
  const [oldDerived, nextDerived] = await Promise.all([
    derive(oldCode, fromHex(record.salt), record.c),
    derive(newCode, salt, ITERATIONS),
  ]);
  const old = splitDerived(oldDerived);
  if (!constantTimeEqual(old.hash, fromHex(record.hash))) {
    old.kek.fill(0);
    nextDerived.fill(0);
    throw new Error('Current code is incorrect.');
  }
  const masterKey = unwrapMasterKey(record.mk, old.kek);
  old.kek.fill(0);

  const next = splitDerived(nextDerived);
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
/* decoy code                                                          */
/* ------------------------------------------------------------------ */

const decoyCache = new Map<string, SecretRecord>();

export async function hasDecoySecret(): Promise<boolean> {
  return (await loadRecordFrom(DECOY_STORAGE_KEY, decoyCache)) !== null;
}

/**
 * Creates the decoy record with its OWN master key, so the decoy vault is a
 * separate encrypted space. Requires the real code (a thief with the phone
 * must not be able to plant a decoy) and a decoy code different from it.
 */
export async function setupDecoySecret(decoyCode: string, realCode: string): Promise<void> {
  if (!isValidCode(decoyCode)) {
    throw new Error(
      `Code must be ${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits with no other characters.`,
    );
  }
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure storage is not available on this platform.');
  }
  if (await hasDecoySecret()) {
    throw new Error('A decoy code is already set.');
  }
  const record = await loadRecord();
  if (!record) throw new Error('No secret code is set.');

  // Verify the real code, then prove the decoy differs from it: derive the
  // decoy code with the real record's parameters and compare verify hashes.
  // Two independent derivations run concurrently (≈ one wall-clock pass).
  const [realDerived, decoyOnRealSalt] = await Promise.all([
    derive(realCode, fromHex(record.salt), record.c),
    derive(decoyCode, fromHex(record.salt), record.c),
  ]);
  const real = splitDerived(realDerived);
  if (!constantTimeEqual(real.hash, fromHex(record.hash))) {
    real.kek.fill(0);
    throw new Error('Current code is incorrect.');
  }
  const sameAsReal = constantTimeEqual(decoyOnRealSalt.subarray(0, 32), real.hash);
  real.kek.fill(0);
  if (sameAsReal) {
    throw new Error('The decoy code must be different from your real code.');
  }

  // Same construction as the real secret: decoy code → decoy KEK → decoy mk.
  const salt = Crypto.getRandomBytes(SALT_BYTES);
  const decoyDerived = await derive(decoyCode, salt, ITERATIONS);
  const { hash, kek } = splitDerived(decoyDerived);
  const masterKey = Crypto.getRandomBytes(MASTER_KEY_BYTES);
  const wrapped = wrapMasterKey(kek, masterKey);
  const decoyRecord: SecretRecord = {
    v: 2,
    algo: ALGO,
    c: ITERATIONS,
    len: decoyCode.length,
    salt: toHex(salt),
    hash: toHex(hash),
    mk: wrapped,
  };
  await SecureStore.setItemAsync(DECOY_STORAGE_KEY, JSON.stringify(decoyRecord));
  decoyCache.set(DECOY_STORAGE_KEY, decoyRecord);
}

export async function removeDecoySecret(): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) return;
  await SecureStore.deleteItemAsync(DECOY_STORAGE_KEY);
  decoyCache.delete(DECOY_STORAGE_KEY);
}

/**
 * Verifies a candidate against the DECOY record and returns the decoy master
 * key. Returns null when no decoy is set or the code does not match.
 */
export async function unlockWithDecoyCode(candidate: string): Promise<Uint8Array | null> {
  try {
    const record = await loadRecordFrom(DECOY_STORAGE_KEY, decoyCache);
    if (!record || !record.mk) return null;
    if (candidate.length !== record.len || !DIGITS_RE.test(candidate)) return null;
    const { hash, kek } = splitDerived(await derive(candidate, fromHex(record.salt), record.c));
    if (!constantTimeEqual(hash, fromHex(record.hash))) {
      kek.fill(0);
      return null;
    }
    const masterKey = unwrapMasterKey(record.mk, kek);
    kek.fill(0);
    return masterKey;
  } catch {
    return null;
  }
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
