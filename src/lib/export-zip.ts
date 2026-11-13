import { Directory, File, Paths } from 'expo-file-system';

import type { VaultItem } from './vault-index-core';
import { decryptToCache, errorMessage } from './vault-store';
import { getMasterKey } from './vault-session';
import { buildZip, uniqueNames, type ZipEntry } from './zip';

/**
 * Multi-file export.
 *
 * The system share sheet takes one file, so several vault items are packed
 * into a zip archive. The archive is written into `vault-tmp`, the folder
 * that is purged when the vault locks, and it is deleted with it.
 */

/** Above this the export is refused: the archive is built in memory. */
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

export type ExportResult =
  | { status: 'ok'; file: File; name: string; count: number }
  | { status: 'too-large'; message: string }
  | { status: 'failed'; message: string };

/**
 * Packs the items into a zip archive in the cache and returns it.
 *
 * The files are decrypted one by one and released as soon as they are in the
 * archive, so only one plaintext file is held in memory at a time.
 */
export async function exportItemsToZip(items: VaultItem[]): Promise<ExportResult> {
  if (items.length === 0) {
    return { status: 'failed', message: 'Nothing to export.' };
  }

  const totalBytes = items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return {
      status: 'too-large',
      message: `Those files are ${formatBytes(totalBytes)} — the export limit is ${formatBytes(
        MAX_TOTAL_BYTES,
      )}. Share fewer files at a time.`,
    };
  }

  try {
    const masterKey = getMasterKey();
    const names = uniqueNames(items.map((item) => item.name));
    const entries: ZipEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const name = names[i];
      if (!item || !name) continue;
      const plain = await decryptToCache(masterKey, item);
      entries.push({ name, data: await plain.bytes() });
    }

    const archive = buildZip(entries);

    const dir = new Directory(Paths.cache, 'vault-tmp');
    if (!dir.exists) dir.create();
    const name = `hideme-export-${stamp()}.zip`;
    const target = new File(dir, name);
    if (target.exists) target.delete();
    await target.write(archive);

    return { status: 'ok', file: target, name, count: entries.length };
  } catch (error) {
    return { status: 'failed', message: errorMessage(error) };
  }
}

/** `2026-11-13-1842` — sorts by time and reads well in a file list. */
function stamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
