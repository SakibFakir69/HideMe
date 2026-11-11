// Pure helpers for the vault index: file naming, search and statistics.
// No RN/expo imports (node --test compatible).

// The explicit extension keeps this module loadable by `node --test`, which
// resolves ESM imports strictly.
import { isDeleted } from './vault-bin-core.ts';

/**
 * The extension of an imported file.
 *
 * The name wins when it carries one — that is what the user sees. Mime is
 * only a fallback for files whose name has no extension.
 */
export function extFor(name: string, mime: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) return name.slice(dot).toLowerCase();
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}

/** The name shown in the vault; falls back to a numbered name. */
export function displayName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed || fallback;
}

export interface SearchableItem {
  id: string;
  name: string;
  folderId: string | null;
  deletedAt?: number;
}

export interface SearchableFolder {
  id: string;
  name: string;
}

/**
 * Items matching a query.
 *
 * `folderId` scopes the result to a single folder. Without one (or with
 * null) the search covers every folder. An item matches when its own name
 * contains the query or when the name of its folder does.
 */
export function searchItems<T extends SearchableItem>(
  items: T[],
  rawQuery: string,
  folders: SearchableFolder[] = [],
  folderId?: string | null,
): T[] {
  const scope = folderId === undefined ? null : folderId;
  const q = rawQuery.trim().toLowerCase();
  const scopeItems = items.filter(
    (it) => !isDeleted(it) && (scope === null || it.folderId === scope),
  );
  if (!q) return scopeItems;
  return scopeItems.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    const folder = folders.find((f) => f.id === item.folderId);
    return folder !== undefined && folder.name.toLowerCase().includes(q);
  });
}

export interface StorageStats {
  itemCount: number;
  folderCount: number;
  totalBytes: number;
}

/** Item and folder counts plus the size of everything that is not in the bin. */
export function computeStats(
  items: { size: number; deletedAt?: number }[],
  folderCount: number,
): StorageStats {
  let totalBytes = 0;
  let itemCount = 0;
  for (const item of items) {
    if (isDeleted(item)) continue;
    itemCount++;
    totalBytes += item.size;
  }
  return { itemCount, folderCount, totalBytes };
}

/**
 * Progress of an import batch, as a fraction between 0 and 1.
 *
 * `fileIndex` is the 0-based index of the file being processed and
 * `fileFraction` how far that file has come.
 */
export function importFraction(
  fileIndex: number,
  fileCount: number,
  fileFraction: number,
): number {
  if (fileCount <= 0) return 1;
  const clamped = Math.min(1, Math.max(0, fileFraction));
  return Math.min(1, (fileIndex + clamped) / fileCount);
}
