import * as Crypto from 'expo-crypto';
import { File, FileMode, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { nativePbkdf2 } from '../../modules/vault-crypto';
import { decryptBytes, encryptBytes, utf8, type Random } from './crypto/envelope';
import { deriveKey } from './crypto/pbkdf2';
import type { SecretRecord } from './vault-secret';
import { masterKeyForRecord, PBKDF2_ROUNDS } from './vault-secret';
import { itemFile, loadIndex, type VaultIndex } from './vault-store';

/**
 * Encrypted backup: ONE shareable file the user can put anywhere (Drive,
 * Files, USB). Everything in it is either already encrypted with the vault
 * master key (the item blobs — copied verbatim, no extra space or time) or
 * wrapped with a key derived from the secret code (the header: secret record
 * + index, which carry file names). Restoring needs the code that was active
 * when the backup was made — no code, no data.
 *
 * File layout (`hideme-backup-YYYYMMDD.hmb`):
 *   [8 bytes  big-endian header-envelope length]
 *   [8 bytes  big-endian kdf-preamble length]
 *   [kdf preamble — clear JSON: { algo, c, salt } for the header key]
 *   [header envelope — AES envelope, key = PBKDF2(code, kdf.salt, kdf.c)]
 *   [blob payloads, in the header's listed order]
 *
 * The KDF parameters sit OUTSIDE the envelope because they are what turns
 * the typed code into the header key. A wrong code fails the envelope's
 * authenticated decryption — the index and record stay secret.
 */

const AAD = 'hideme.backup.v1';
const MAGIC = 'HMB1';
const CHUNK = 512 * 1024;

interface KdfPreamble {
  algo: 'pbkdf2-sha256';
  c: number;
  salt: string;
}

interface BackupHeader {
  v: 1;
  magic: string;
  app: 'hideme';
  createdAt: number;
  record: SecretRecord;
  index: VaultIndex;
  /** Blob payloads, in file order: itemId and its byte size. */
  blobs: { id: string; size: number }[];
}

const rand: Random = (length: number) => Crypto.getRandomBytes(length);

async function codeKeyFor(code: string, saltHex: string, rounds: number): Promise<Uint8Array> {
  const salt = new Uint8Array(saltHex.length / 2);
  for (let i = 0; i < salt.length; i++) {
    salt[i] = parseInt(saltHex.slice(i * 2, i * 2 + 2), 16);
  }
  const { key } = await deriveKey(code, salt, rounds, 32, nativePbkdf2);
  return key;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function be64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = v % 256;
    v = Math.floor(v / 256);
  }
  return out;
}

function parseBe64(bytes: Uint8Array): number {
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return value;
}

function backupName(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `hideme-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.hmb`;
}

/** Copies `size` bytes from src (at its current offset) into dest. */
async function copyChunked(
  src: { readBytes: (length: number) => Promise<Uint8Array> },
  dest: { writeBytes: (bytes: Uint8Array) => Promise<unknown> },
  size: number,
): Promise<void> {
  let remaining = size;
  while (remaining > 0) {
    const chunk = await src.readBytes(Math.min(CHUNK, remaining));
    if (chunk.length === 0) throw new Error('Backup file is truncated.');
    await dest.writeBytes(chunk);
    remaining -= chunk.length;
  }
}

/**
 * Builds the backup for the CURRENT (main) vault. `record` must be the real
 * secret record — its wrapped master key must match `masterKey`. Returns a
 * cache file ready for the share sheet.
 */
export async function exportBackup(
  masterKey: Uint8Array,
  record: SecretRecord,
  code: string,
): Promise<{ uri: string; name: string }> {
  if (!record.mk) throw new Error('Initialize the vault by unlocking once first.');
  // The typed code becomes the backup's key, but the item blobs stay wrapped
  // under the session's master key. If the code does not match the record the
  // resulting file could never be restored (or would restore garbage), so
  // verify it before writing anything.
  let codeKey: Uint8Array;
  try {
    codeKey = await masterKeyForRecord(record, code);
  } catch {
    // masterKeyForRecord speaks about "this backup"; on export the user typed
    // the code of the vault in front of them.
    throw new Error('Wrong code for this vault.');
  }
  let mismatch = codeKey.length !== masterKey.length ? 1 : 0;
  for (let i = 0; i < Math.min(codeKey.length, masterKey.length); i++) {
    mismatch |= codeKey[i] ^ masterKey[i];
  }
  codeKey.fill(0);
  if (mismatch !== 0) throw new Error('Wrong code for this vault.');
  const index = await loadIndex(masterKey);
  const createdAt = Date.now();
  const blobs: BackupHeader['blobs'] = [];
  for (const item of index.items) {
    const file = itemFile(item.id);
    if (file.exists && file.size !== null) {
      blobs.push({ id: item.id, size: file.size });
    }
  }

  const kdf: KdfPreamble = { algo: 'pbkdf2-sha256', c: PBKDF2_ROUNDS, salt: toHex(Crypto.getRandomBytes(16)) };
  const header: BackupHeader = {
    v: 1,
    magic: MAGIC,
    app: 'hideme',
    createdAt,
    record,
    index,
    blobs,
  };
  const key = await codeKeyFor(code, kdf.salt, kdf.c);
  const headerEnvelope = encryptBytes(utf8(JSON.stringify(header)), key, AAD, rand);
  const kdfBytes = utf8(JSON.stringify(kdf));

  const out = new File(Paths.cache, backupName(createdAt));
  if (out.exists) out.delete();
  out.create();
  const dest = out.open(FileMode.ReadWrite);
  try {
    await dest.writeBytes(be64(headerEnvelope.length));
    await dest.writeBytes(be64(kdfBytes.length));
    await dest.writeBytes(kdfBytes);
    await dest.writeBytes(headerEnvelope);
    for (const blob of blobs) {
      const src = itemFile(blob.id).open(FileMode.ReadOnly);
      try {
        await copyChunked(src, dest, blob.size);
      } finally {
        src.close();
      }
    }
  } finally {
    dest.close();
  }
  return { uri: out.uri, name: out.name };
}

/** Opens the share sheet for a backup file. */
export async function shareBackup(uri: string): Promise<void> {
  await Sharing.shareAsync(uri, {
    dialogTitle: 'Save your encrypted HideMe backup',
    mimeType: 'application/octet-stream',
  });
}

export interface ParsedBackup {
  createdAt: number;
  record: SecretRecord;
  index: VaultIndex;
  itemCount: number;
  masterKey: Uint8Array;
  /** Blob payloads listed in the header (items without a file were skipped at export). */
  blobs: { id: string; size: number }[];
  /** Streams one blob from the backup file into a vault destination file. */
  copyBlob: (itemId: string, dest: File) => Promise<void>;
  close: () => void;
}

/**
 * Verifies the typed code against a backup file and opens it for restore.
 * Throws a user-facing error for a wrong code or a foreign file. The blob
 * reads advance a shared offset, so `copyBlob` must be called for every item
 * of `index.items` exactly once, in order.
 */
export async function openBackup(uri: string, code: string): Promise<ParsedBackup> {
  const file = new File(uri);
  if (!file.exists) throw new Error('Backup file not found.');
  const src = file.open(FileMode.ReadOnly);
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    try {
      src.close();
    } catch {
      // already closed
    }
  };
  try {
    const head = await src.readBytes(16);
    if (head.length < 16) throw new Error('Not a HideMe backup file.');
    const headerLen = parseBe64(head.subarray(0, 8));
    const kdfLen = parseBe64(head.subarray(8, 16));
    if (
      headerLen <= 0 ||
      headerLen > 16 * 1024 * 1024 ||
      kdfLen <= 0 ||
      kdfLen > 4 * 1024
    ) {
      throw new Error('Not a HideMe backup file.');
    }
    const kdfBytes = await src.readBytes(kdfLen);
    if (kdfBytes.length < kdfLen) throw new Error('Backup file is truncated.');
    const kdf = JSON.parse(
      new TextDecoder().decode(kdfBytes),
    ) as KdfPreamble;
    if (kdf.algo !== 'pbkdf2-sha256' || typeof kdf.salt !== 'string' || typeof kdf.c !== 'number') {
      throw new Error('Not a HideMe backup file.');
    }

    const envelope = await src.readBytes(headerLen);
    if (envelope.length < headerLen) throw new Error('Backup file is truncated.');
    let header: BackupHeader;
    try {
      const key = await codeKeyFor(code, kdf.salt, kdf.c);
      header = JSON.parse(
        new TextDecoder().decode(decryptBytes(envelope, key).plaintext),
      ) as BackupHeader;
    } catch {
      throw new Error('Wrong code for this backup.');
    }
    if (header?.magic !== MAGIC || header.app !== 'hideme' || !header.record || !header.index) {
      throw new Error('Not a HideMe backup file.');
    }

    const masterKey = await masterKeyForRecord(header.record, code);
    let remaining = 0;
    let pendingId: string | null = null;

    return {
      createdAt: header.createdAt,
      record: header.record,
      index: header.index,
      itemCount: header.index.items.length,
      masterKey,
      blobs: header.blobs,
      copyBlob: async (itemId, dest) => {
        if (closed) throw new Error('Backup already closed.');
        const expected = header.blobs.find((b) => b.id === itemId);
        if (!expected) throw new Error(`Backup has no file for ${itemId}.`);
        if (pendingId !== null) throw new Error('Previous blob was not fully copied.');
        pendingId = itemId;
        remaining = expected.size;
        const destHandle = dest.open(FileMode.ReadWrite);
        try {
          while (remaining > 0) {
            const chunk = await src.readBytes(Math.min(CHUNK, remaining));
            if (chunk.length === 0) throw new Error('Backup file is truncated.');
            await destHandle.writeBytes(chunk);
            remaining -= chunk.length;
          }
        } finally {
          destHandle.close();
        }
        pendingId = null;
      },
      close: closeOnce,
    };
  } catch (error) {
    closeOnce();
    if (error instanceof Error && error.message) throw error;
    throw new Error('Could not open the backup file.');
  }
}
