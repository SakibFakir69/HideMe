import { useWindowDimensions } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';

/** Gap between grid tiles. */
export const GRID_GAP = Spacing.two;

/**
 * Tile width for a fixed-column grid.
 *
 * Uses `useWindowDimensions` instead of a one-off `Dimensions.get('window')`
 * so the grid re-measures when the window changes size — multi-window mode,
 * a foldable, a tablet split view. The previous version froze the portrait
 * size on the first render, which left gaps in a wider window and overflowed
 * in a narrower one.
 */
export function useGridColumns(columns: number, horizontalPadding = Spacing.three): number {
  const { width } = useWindowDimensions();
  const usable = Math.min(width, MaxContentWidth) - horizontalPadding * 2;
  return Math.max(1, Math.floor((usable - GRID_GAP * (columns - 1)) / columns));
}
