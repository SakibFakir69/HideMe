// The explicit extension keeps this module loadable by `node --test`, which
// resolves ESM imports strictly.
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
} from './envelope.ts';

/**
 * Streaming file encryption/decryption for vault blobs.
 * 1 MiB chunks, bounded memory, progress callbacks.
 * Verify-then-decrypt: HMAC is checked over the full ciphertext before
 * a single plaintext byte is written.
 *
 * The module talks to the filesystem through the small interfaces below
 * instead of importing `expo-file-system`, so it stays loadable under
 * `node --test` and can be exercised against an in-memory filesystem.
 */

export const CHUNK_BYTES = 1024 * 1024;

/** A cursor on an open file. */
export interface CryptoFileHandle {
  /** Byte offset the next read or write happens at. */
  offset: number;
  readBytes(length: number): Promise<Uint8Array>;
  writeBytes(bytes: Uint8Array): Promise<void>;
  close(): void;
}

/** A file that is read from. */
export interface CryptoSourceFile {
  readonly exists: boolean;
  /** Size in bytes, or null when it cannot be determined. */
  readonly size: number | null;
  openRead(): CryptoFileHandle;
}

/** A file that is written to. */
export interface CryptoDestFile {
  readonly exists: boolean;
  create(): void;
  delete(): void;
  openWrite(): CryptoFileHandle;
}

export interface FileCryptoProgress {
  processed: number;
  total: number;
}

/**
 * Called between the stages of an operation. Throwing aborts it — the
 * import pipeline uses that to stop a long encryption.
 */
export type CancellationCheck = () => void;

export interface EncryptFileOptions {
  source: CryptoSourceFile;
  dest: CryptoDestFile;
  fileId: string;
  masterKey: Uint8Array;
  rand: Random;
  onProgress?: (p: FileCryptoProgress) => void;
  /** Checked before the file is touched and between every chunk. */
  checkCancelled?: CancellationCheck;
}

export interface DecryptFileOptions {
  source: CryptoSourceFile;
  dest: CryptoDestFile;
  masterKey: Uint8Array;
  onProgress?: (p: FileCryptoProgress) => void;
  /** Checked before the file is touched and between every chunk. */
  checkCancelled?: CancellationCheck;
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

function ensureMissing(file: CryptoDestFile): void {
  if (file.exists) file.delete();
  file.create();
}

export async function encryptFile(opts: EncryptFileOptions): Promise<number> {
  const { source, dest, fileId, masterKey, rand, onProgress, checkCancelled } = opts;
  checkCancelled?.();
  if (!source.exists) throw new VaultCryptoError('Source file does not exist.');
  const total = source.size ?? 0;
  const built = buildHead(fileId, total, masterKey, rand);
  const fileNonce = base64ToBytes(built.header.fn);
  const prefix = built.prefix;
  const mac = newMac(built.macKey).update(prefix);

  ensureMissing(dest);
  const out = dest.openWrite();
  const input = source.openRead();
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
      // Between chunks is the only safe place to abort: the file handle stays
      // valid and the caller can clean the partial file up.
      checkCancelled?.();
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

    // The MAC is only written once the whole ciphertext is on disk, so a
    // truncated blob can never pass the integrity check.
    checkCancelled?.();
    out.offset = prefix.length;
    await out.writeBytes(mac.digest());
    return plainDone;
  } finally {
    input.close();
    out.close();
  }
}

export async function decryptFile(opts: DecryptFileOptions): Promise<DecryptedFileInfo> {
  const { source, dest, masterKey, onProgress, checkCancelled } = opts;
  checkCancelled?.();
  if (!source.exists) throw new VaultCryptoError('Encrypted file does not exist.');

  const input = source.openRead();
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
      checkCancelled?.();
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
    const out = dest.openWrite();
    try {
      input.offset = parsed.cipherOffset;
      out.offset = 0;
      const fileNonce = base64ToBytes(parsed.header.fn);
      let plainDone = 0;
      while (plainDone < total) {
        checkCancelled?.();
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
