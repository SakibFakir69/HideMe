import type { CryptoFileHandle } from './crypto/file-crypto.ts';

/**
 * The filesystem operations the import pipeline needs.
 *
 * The vault talks to the real filesystem through `expo-file-system`; the
 * tests use an in-memory implementation, so they can assert on the actual
 * file state after a cancel or a failure.
 *
 * Paths are opaque strings — absolute URIs in the app, plain keys in the
 * fake. Nothing here may delete more than the exact file it is given:
 * the vault holds the user's files.
 */
export interface VaultFileSystem {
  /** True when the file exists. */
  exists(path: string): boolean;
  /** Size in bytes, or null when it cannot be determined. */
  size(path: string): number | null;
  /** Creates the file, truncating it when it already exists. */
  create(path: string): void;
  /** Deletes the file. A missing file is not an error. */
  remove(path: string): void;
  /** Opens the file for reading. */
  openRead(path: string): CryptoFileHandle;
  /** Opens the file for writing, creating it when it does not exist. */
  openWrite(path: string): CryptoFileHandle;
  /** Reads the whole file. */
  readAll(path: string): Promise<Uint8Array>;
  /** Writes the whole file, replacing whatever was there. */
  writeAll(path: string, bytes: Uint8Array): Promise<void>;
  /** Moves a file, replacing the destination. */
  move(from: string, to: string): Promise<void>;
  /** Creates the directory (and its parents) when it does not exist. */
  ensureDir(path: string): void;
}
