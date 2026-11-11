/**
 * Item kinds and the index schema.
 *
 * Pure (no react-native imports) so it runs under node tests.
 */

export type ItemKind = 'photo' | 'video' | 'document' | 'audio';

/**
 * Index schema version.
 *
 * v3 adds the `audio` kind. v2 had no audio kind, so audio files were filed
 * as documents; they are re-categorized from their mime on load.
 */
export const INDEX_VERSION = 3;
const LEGACY_INDEX_VERSION = 2;

/** The mime decides the kind of a freshly imported file. */
export function kindForMime(mime: string): ItemKind {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Re-derives the kind of an item stored under an older schema.
 *
 * v2 had no `audio` kind, so audio files were stored as documents. Their
 * mime still says `audio/*`, which is enough to file them correctly.
 */
export function normalizeKind(kind: ItemKind, mime: string): ItemKind {
  if (kind === 'document' && mime?.startsWith('audio/')) return 'audio';
  return kind;
}

/** True when a stored index version can still be read. */
export function isSupportedIndexVersion(version: unknown): boolean {
  return version === INDEX_VERSION || version === LEGACY_INDEX_VERSION;
}
