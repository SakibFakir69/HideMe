import { File, FileMode } from 'expo-file-system';

import {
  ENVELOPE_MAGIC,
  MAC_BYTES,
  PREFIX_FIXED_BYTES,
  type Random,
  base64ToBytes,
  buildHead,
  constantTimeEqual,
  ctrCipherAt,
  newMac,
  parseHead,
  recoverFileKeys,
} from './envelope';

/**
 * Streaming file encryption/decryption for vault blobs.
 * 1 MiB chunks, bounded memory, progress callbacks.
 * Verify-then-decrypt: HMAC is checked over the full ciphertext before
 * a single plaintext byte is written.
 */

export const CHUNK_BYTES = 1024 * 1024;

export interface FileCryptoProgress {
  processed: number;
  total: number;
}

export interface EncryptFileOptions {
  source: File;
  dest: File;
  fileId: string;
  masterKey: Uint8Array;
  rand: Random;
  onProgress?: (p: FileCryptoProgress) => void;
}

export interface DecryptFileOptions {
  source: File;
  dest: File;
  masterKey: Uint8Array;
  onProgress?: (p: FileCryptoProgress) => void;
}

export interface DecryptedFileInfo {
  fileId: string;
  size: number;
}

export class VaultCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultCryptoError';
  }
}

function ensureMissing(file: File): void {
  if (file.exists) file.delete();
  file.create();
}

export async function encryptFile(opts: EncryptFileOptions): Promise<number> {
  const { source, dest, fileId, masterKey, rand, onProgress } = opts;
  if (!source.exists) throw new VaultCryptoError('Source file does not exist.');
  const total = source.size ?? 0;
  const built = buildHead(fileId, total, masterKey, rand);
  const fileNonce = base64ToBytes(built.header.fn);
  const prefix = built.prefix;
  const mac = newMac(built.macKey).update(prefix);

  ensureMissing(dest);
  const out = dest.open(FileMode.ReadWrite);
  const input = source.open(FileMode.ReadOnly);
  try {
    out.offset = 0;
    // writeBytes is async — every call must be awaited, or close() in finally
    // races pending writes and rejects with "file handle is closed".
    await out.writeBytes(prefix);
    await out.writeBytes(new Uint8Array(MAC_BYTES)); // mac placeholder, backfilled after the pass
    const ctStart = prefix.length + MAC_BYTES;

    input.offset = 0;
    let plainDone = 0;
    let written = 0;
    while (plainDone < total) {
      const want = Math.min(CHUNK_BYTES, total - plainDone);
      const chunk = await input.readBytes(want);
      if (chunk.length !== want) throw new VaultCryptoError('Source file is shorter than expected.');
      const ct = ctrCipherAt(built.encKey, fileNonce, plainDone).encrypt(chunk);
      mac.update(ct);
      out.offset = ctStart + written;
      await out.writeBytes(ct);
      written += ct.length;
      plainDone += chunk.length;
      onProgress?.({ processed: plainDone, total });
    }
    const extra = await input.readBytes(1);
    if (extra.length > 0) throw new VaultCryptoError('Source file is longer than expected.');

    out.offset = prefix.length;
    await out.writeBytes(mac.digest());
    return plainDone;
  } finally {
    input.close();
    out.close();
  }
}

export async function decryptFile(opts: DecryptFileOptions): Promise<DecryptedFileInfo> {
  const { source, dest, masterKey, onProgress } = opts;
  if (!source.exists) throw new VaultCryptoError('Encrypted file does not exist.');

  const input = source.open(FileMode.ReadOnly);
  try {
    input.offset = 0;
    const fixed6 = await input.readBytes(PREFIX_FIXED_BYTES);
    const headerLen = readHeaderLen(fixed6);
    const jsonBytes = await input.readBytes(headerLen);
    const parsed = parseHead(fixed6, jsonBytes);
    const prefix = concatPrefix(fixed6, jsonBytes);
    const storedMac = await input.readBytes(MAC_BYTES);
    if (storedMac.length !== MAC_BYTES) throw new VaultCryptoError('Vault envelope corrupted (mac).');

    const total = parsed.header.size;
    const { encKey, macKey } = recoverFileKeys(parsed.header, masterKey);

    // Pass 1 — authenticate the full ciphertext without writing anything.
    input.offset = parsed.cipherOffset;
    const verifier = newMac(macKey).update(prefix);
    let remaining = total;
    while (remaining > 0) {
      const chunk = await input.readBytes(Math.min(CHUNK_BYTES, remaining));
      if (chunk.length === 0) throw new VaultCryptoError('Vault envelope corrupted (truncated).');
      verifier.update(chunk);
      remaining -= chunk.length;
      onProgress?.({ processed: total - remaining, total: total * 2 });
    }
    if (!constantTimeEqual(storedMac, verifier.digest())) {
      throw new VaultCryptoError('Integrity check failed (HMAC mismatch).');
    }

    // Pass 2 — decrypt and write.
    ensureMissing(dest);
    const out = dest.open(FileMode.ReadWrite);
    try {
      input.offset = parsed.cipherOffset;
      out.offset = 0;
      const fileNonce = base64ToBytes(parsed.header.fn);
      let plainDone = 0;
      while (plainDone < total) {
        const chunk = await input.readBytes(Math.min(CHUNK_BYTES, total - plainDone));
        if (chunk.length === 0) throw new VaultCryptoError('Vault envelope corrupted (truncated).');
        const plain = ctrCipherAt(encKey, fileNonce, plainDone).encrypt(chunk);
        await out.writeBytes(plain);
        plainDone += chunk.length;
        onProgress?.({ processed: total + plainDone, total: total * 2 });
      }
    } finally {
      out.close();
    }
    return { fileId: parsed.header.id, size: total };
  } finally {
    input.close();
  }
}

function readHeaderLen(fixed6: Uint8Array): number {
  if (fixed6.length !== PREFIX_FIXED_BYTES) throw new VaultCryptoError('Vault envelope corrupted (head).');
  for (let i = 0; i < ENVELOPE_MAGIC.length; i++) {
    if (fixed6[i] !== ENVELOPE_MAGIC[i]) throw new VaultCryptoError('Vault envelope corrupted (magic).');
  }
  return (fixed6[4] << 8) | fixed6[5];
}

function concatPrefix(fixed6: Uint8Array, jsonBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(fixed6.length + jsonBytes.length);
  out.set(fixed6, 0);
  out.set(jsonBytes, fixed6.length);
  return out;
}
