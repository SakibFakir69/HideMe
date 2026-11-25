import type { VaultItem } from './vault-index-core';

/**
 * The layout maths of the justified photo grid — pure, so it can be tested
 * without a renderer.
 */

/** Gap between the tiles of a row — and between the rows themselves. */
export const GRID_GAP = 12;
/** The aspect ratio is clamped so one panorama cannot flatten a whole row. */
const MIN_ASPECT = 0.55;
const MAX_ASPECT = 2.1;

export interface GridRow {
  key: string;
  items: { item: VaultItem; width: number }[];
  height: number;
}

/** The real ratio of an item, or a square when it has no dimensions. */
export function aspectOf(item: VaultItem): number {
  if (!item.width || !item.height) return 1;
  const ratio = item.width / item.height;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, ratio));
}

/**
 * Splits the items into rows and works out the tile sizes.
 *
 * Every row keeps the real aspect ratio of its photos and fills the full
 * width: the row height comes from the items' ratios, so a row of landscape
 * photos is short and a row of portraits is tall. The height is kept inside a
 * sane band and the widths are scaled to the row width, which keeps the
 * right edge straight.
 */
export function buildRows(items: VaultItem[], columns: number, available: number): GridRow[] {
  const rows: GridRow[] = [];
  const perRow = Math.max(1, columns);

  for (let index = 0; index < items.length; index += perRow) {
    const slice = items.slice(index, index + perRow);
    if (slice.length === 0) continue;

    const aspects = slice.map(aspectOf);
    const sumAspect = aspects.reduce((total, ratio) => total + ratio, 0);
    const rowWidth = Math.max(1, available - GRID_GAP * (slice.length - 1));

    const square = available / perRow;
    const natural = rowWidth / sumAspect;
    const height = Math.round(Math.min(square * 1.75, Math.max(square * 0.72, natural)));

    // Scale the widths so the row still ends flush with the right edge.
    const raw = aspects.map((ratio) => ratio * height);
    const rawTotal = raw.reduce((total, value) => total + value, 0);
    const scale = rawTotal > 0 ? rowWidth / rawTotal : 1;

    rows.push({
      key: slice.map((entry) => entry.id).join('|'),
      height,
      items: slice.map((entry, position) => ({
        item: entry,
        width: Math.round((raw[position] ?? 0) * scale),
      })),
    });
  }

  return rows;
}
