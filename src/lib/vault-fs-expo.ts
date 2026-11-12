import { Directory, File, FileMode } from 'expo-file-system';

import type { CryptoFileHandle } from './crypto/file-crypto';
import type { VaultFileSystem } from './vault-fs';

/**
 * The real filesystem, backed by `expo-file-system`.
 *
 * Paths are absolute URIs (`file:///…`). The open modes live here rather
 * than in the crypto module, so the crypto module stays free of runtime
 * `expo-file-system` imports.
 */
export const expoFileSystem: VaultFileSystem = {
  exists(path: string): boolean {
    return new File(path).exists;
  },

  size(path: string): number | null {
    return new File(path).size;
  },

  create(path: string): void {
    const file = new File(path);
    if (file.exists) file.delete();
    file.create();
  },

  remove(path: string): void {
    const file = new File(path);
    if (file.exists) file.delete();
  },

  openRead(path: string): CryptoFileHandle {
    const handle = new File(path).open(FileMode.ReadOnly);
    return {
      get offset(): number {
        return handle.offset ?? 0;
      },
      set offset(value: number) {
        handle.offset = value;
      },
      readBytes: (length: number) => handle.readBytes(length),
      writeBytes: (bytes: Uint8Array) => handle.writeBytes(bytes),
      close: () => handle.close(),
    };
  },

  openWrite(path: string): CryptoFileHandle {
    const file = new File(path);
    if (!file.exists) file.create();
    const handle = file.open(FileMode.ReadWrite);
    return {
      get offset(): number {
        return handle.offset ?? 0;
      },
      set offset(value: number) {
        handle.offset = value;
      },
      readBytes: (length: number) => handle.readBytes(length),
      writeBytes: (bytes: Uint8Array) => handle.writeBytes(bytes),
      close: () => handle.close(),
    };
  },

  async readAll(path: string): Promise<Uint8Array> {
    return new File(path).bytes();
  },

  async writeAll(path: string, bytes: Uint8Array): Promise<void> {
    const file = new File(path);
    if (file.exists) file.delete();
    file.create();
    await file.write(bytes);
  },

  async move(from: string, to: string): Promise<void> {
    const target = new File(to);
    if (target.exists) target.delete();
    await new File(from).move(target);
  },

  ensureDir(path: string): void {
    const dir = new Directory(path);
    if (!dir.exists) dir.create({ intermediates: true });
  },
};
