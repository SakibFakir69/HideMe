import {
  encryptFile,
  type CancellationCheck,
  type CryptoDestFile,
  type CryptoSourceFile,
  type FileCryptoProgress,
} from './crypto/file-crypto.ts';
import { ImportCancelledError, type ImportCancellation } from './import-cancellation.ts';
import type { Random } from './crypto/envelope.ts';
import { extFor, importFraction } from './vault-index-core.ts';
import { kindForMime } from './vault-kinds.ts';
import type { VaultIndex, VaultItem } from './vault-index-core.ts';
import type { VaultFileSystem } from './vault-fs.ts';

/**
 * The import pipeline.
 *
 * The batch is processed one file at a time. Every file is encrypted into a
 * partial blob first and only moved to its final path once it is complete,
 * so the vault never holds a half-written blob. The items are added to the
 * index and the index is written once, at the end — a cancelled or failed
 * import still keeps the files that made it in, and never leaves an index
 * entry without a file.
 *
 * Pure (no react-native imports) so it runs under node tests against an
 * in-memory filesystem.
 */

export interface PickedAsset {
  uri: string;
  name: string;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ImportProgress {
  /** 0-based index of the file being processed */
  fileIndex: number;
  fileCount: number;
  /** bytes processed within the current file */
  processed: number;
  /** total bytes of the current file */
  fileBytes: number;
  /** 0..1 across the whole batch */
  fraction: number;
  /** the name of the file being processed */
  fileName?: string;
  /** transient label shown instead of the file label */
  phase?: string;
}

export type ImportStatus = 'completed' | 'cancelled' | 'failed';

export interface ImportOutcome {
  status: ImportStatus;
  /** The items that were added to the vault. */
  added: VaultItem[];
  /** The failure, when the status is 'failed'. */
  error?: unknown;
}

/** Where the blobs of an import live. */
export interface ImportPaths {
  /** The final path of an item's encrypted blob. */
  blob(itemId: string): string;
  /** The path the blob is written to before it is complete. */
  partial(itemId: string): string;
}

export interface ImportJob {
  fs: VaultFileSystem;
  masterKey: Uint8Array;
  rand: Random;
  folderId: string | null;
  assets: PickedAsset[];
  paths: ImportPaths;
  /** The index the imported items are added to. */
  index: VaultIndex;
  /** Writes the index. Called once, after the last file. */
  saveIndex: () => Promise<void>;
  /** Builds the thumbnail of an imported photo. Best effort. */
  buildThumb?: (itemId: string, sourceUri: string) => Promise<void>;
  /** Creates the id of a new item. */
  newId: () => string;
  /** The current time, for the item record. */
  now: () => number;
  /** Cancels this job. Scoped to this job only. */
  cancellation?: ImportCancellation;
  onProgress?: (p: ImportProgress) => void;
}

/** Removes a file, ignoring failures — cleanup must never mask the real error. */
function safeRemove(fs: VaultFileSystem, path: string): void {
  try {
    if (fs.exists(path)) fs.remove(path);
  } catch {
    // best effort
  }
}

function sourceOf(fs: VaultFileSystem, uri: string): CryptoSourceFile {
  return {
    get exists(): boolean {
      return fs.exists(uri);
    },
    get size(): number | null {
      return fs.size(uri);
    },
    openRead: () => fs.openRead(uri),
  };
}

function destOf(fs: VaultFileSystem, path: string): CryptoDestFile {
  return {
    get exists(): boolean {
      return fs.exists(path);
    },
    create: () => fs.create(path),
    delete: () => fs.remove(path),
    openWrite: () => fs.openWrite(path),
  };
}

/**
 * Runs an import batch.
 *
 * Never throws: a cancelled or failed batch is reported through the outcome
 * so the caller can show it. The files that were imported before the
 * interruption stay in the vault.
 */
export async function runImport(job: ImportJob): Promise<ImportOutcome> {
  const { fs, assets, paths, cancellation, onProgress } = job;
  const added: VaultItem[] = [];
  const thumbTasks: Promise<void>[] = [];
  // The file that was being worked on when the batch stopped.
  let currentName = '';

  const commit = async (): Promise<void> => {
    if (added.length === 0) return;
    for (const item of added) job.index.items.push(item);
    try {
      await job.saveIndex();
    } catch (error) {
      // The index on disk does not know about these files: roll the
      // in-memory copy back and remove the blobs, so nothing is left
      // dangling. Only this import's own files are touched.
      for (const item of added) {
        const at = job.index.items.lastIndexOf(item);
        if (at >= 0) job.index.items.splice(at, 1);
      }
      for (const item of added) safeRemove(fs, paths.blob(item.id));
      throw error;
    }
  };

  try {
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      currentName = asset.name || asset.uri;
      // Before every file: a cancelled batch never starts another one.
      cancellation?.throwIfCancelled();

      const id = job.newId();
      const blobPath = paths.blob(id);
      const partialPath = paths.partial(id);
      const report = (p: FileCryptoProgress) =>
        onProgress?.({
          fileIndex: i,
          fileCount: assets.length,
          processed: p.processed,
          fileBytes: p.total,
          fraction: importFraction(i, assets.length, p.total > 0 ? p.processed / p.total : 0),
          fileName: asset.name,
        });
      const checkCancelled: CancellationCheck = () => cancellation?.throwIfCancelled();

      let size = 0;
      try {
        size = await encryptFile({
          source: sourceOf(fs, asset.uri),
          dest: destOf(fs, partialPath),
          fileId: id,
          masterKey: job.masterKey,
          rand: job.rand,
          onProgress: report,
          checkCancelled,
        });
        // Between the stages: the blob is complete but not in the vault yet.
        checkCancelled();
        // The blob only appears at its final path once it is whole.
        await fs.move(partialPath, blobPath);
      } catch (error) {
        // Remove what the interrupted file left behind. Both paths belong to
        // this import only — the id was just created for this file.
        safeRemove(fs, partialPath);
        safeRemove(fs, blobPath);
        throw error;
      }

      const item: VaultItem = {
        id,
        name: asset.name.trim() || `file-${i + 1}`,
        kind: kindForMime(asset.mime),
        mime: asset.mime,
        ext: extFor(asset.name, asset.mime),
        size,
        folderId: job.folderId,
        createdAt: job.now(),
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
      };
      // The blob exists, so the item is valid from here on.
      added.push(item);

      if (item.kind === 'photo' && job.buildThumb) {
        // Thumbnail building runs mostly in native code (decode → resize →
        // JPEG), so it overlaps with the JS-side encryption of the following
        // file instead of running strictly after it.
        thumbTasks.push(
          job.buildThumb(item.id, asset.uri).catch(() => {
            // Best-effort: a missing thumb only means the grid falls back to
            // the slower full-decrypt path once (and builds the thumb then).
          }),
        );
      }

      onProgress?.({
        fileIndex: i + 1,
        fileCount: assets.length,
        processed: 0,
        fileBytes: 0,
        fraction: (i + 1) / assets.length,
        fileName: asset.name,
      });
    }

    await Promise.all(thumbTasks);
    await commit();
    return { status: 'completed', added };
  } catch (error) {
    // Keep the files that made it in before the interruption.
    try {
      await commit();
    } catch (commitError) {
      // The index could not be written, so the files that made it in are not
      // reachable and were removed again. Report it as a failure.
      return {
        status: 'failed',
        added: [],
        error: new Error(
          `The imported files could not be saved: ${messageOf(commitError)}`,
        ),
      };
    }
    if (error instanceof ImportCancelledError) {
      return { status: 'cancelled', added };
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[vault] import failed', error);
    return {
      status: 'failed',
      added,
      error: new Error(`Could not encrypt "${currentName}": ${messageOf(error)}`),
    };
  }
}

/** The message of an unknown error. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
