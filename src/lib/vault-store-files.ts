import type { VaultFileSystem } from './vault-fs';

/**
 * The files an item owns.
 *
 * Every item has an encrypted blob and an encrypted thumbnail; a thumbnail
 * that was already decrypted also has a plaintext copy in the cache. Purging
 * an item has to remove all three — a leftover thumbnail is a leftover copy
 * of the user's photo.
 *
 * The paths are injected so this can be tested against an in-memory
 * filesystem.
 */

export interface ItemFileLayout {
  /** The encrypted blob of an item. */
  blob(itemId: string): string;
  /** The encrypted thumbnail of an item. */
  thumb(itemId: string): string;
  /** The decrypted thumbnail in the cache (only exists while it is warm). */
  plainThumb(itemId: string): string;
}

/** Removes the encrypted blob and both thumbnails of an item. */
export function deleteItemFiles(
  fs: VaultFileSystem,
  layout: ItemFileLayout,
  itemId: string,
): void {
  fs.remove(layout.blob(itemId));
  fs.remove(layout.thumb(itemId));
  fs.remove(layout.plainThumb(itemId));
}

/** Removes the files of many items at once (the bin, the expiry sweep). */
export function deleteItemsFiles(
  fs: VaultFileSystem,
  layout: ItemFileLayout,
  itemIds: string[],
): void {
  for (const id of itemIds) deleteItemFiles(fs, layout, id);
}
