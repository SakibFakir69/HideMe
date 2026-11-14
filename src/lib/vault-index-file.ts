import { decryptBytes, encryptBytes, fromUtf8, utf8, type Random } from './crypto/envelope.ts';
import type { VaultFileSystem } from './vault-fs.ts';

/**
 * The encrypted index file.
 *
 * The index lists every item and folder, so losing it means losing the
 * vault. It is therefore written atomically — into a temporary file first,
 * then moved into place — and a failed write leaves the previous index
 * intact instead of a half-written one.
 *
 * The filesystem is injected, so this can be tested against an in-memory
 * implementation.
 */

export interface IndexFileLayout {
  /** Where the index lives. */
  index: string;
  /** The temporary file the index is written to first. */
  temp: string;
}

/** Encrypts and stores the index, atomically. */
export async function writeIndexFile(
  fs: VaultFileSystem,
  layout: IndexFileLayout,
  json: string,
  masterKey: Uint8Array,
  random: Random,
): Promise<void> {
  const bytes = encryptBytes(utf8(json), masterKey, 'vault-index', random);
  fs.remove(layout.temp);
  fs.create(layout.temp);
  try {
    await fs.writeAll(layout.temp, bytes);
    await fs.move(layout.temp, layout.index);
  } catch (error) {
    // The temporary file must not survive a failed write.
    fs.remove(layout.temp);
    throw error;
  }
}

/**
 * Reads and decrypts the index.
 *
 * Returns null when there is no index yet (a fresh vault). A wrong key or a
 * damaged file throws — the caller decides whether that is fatal.
 */
export async function readIndexFile(
  fs: VaultFileSystem,
  layout: IndexFileLayout,
  masterKey: Uint8Array,
): Promise<string | null> {
  if (!fs.exists(layout.index)) return null;
  const envelope = await fs.readAll(layout.index);
  const opened = decryptBytes(envelope, masterKey);
  return fromUtf8(opened.plaintext);
}
