import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Thumbnail } from '@/components/vault/thumbnail';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildRows, GRID_GAP, type GridRow } from '@/lib/photo-grid-core';
import type { VaultItem } from '@/lib/vault-store';

/** Horizontal padding of the grid, matching the screens that host it. */
export const GRID_PADDING = Spacing.three;

/** The width the grid can use on this screen. */
export function useGridWidth(): number {
  const { width: windowWidth } = useWindowDimensions();
  return Math.min(windowWidth, MaxContentWidth) - GRID_PADDING * 2;
}

/**
 * Splits the items into rows and works out the tile sizes.
 *
 * The maths lives in `lib/photo-grid-core` so it can be tested without a
 * renderer.
 */
export { buildRows };

interface PhotoRowProps {
  row: GridRow;
  onPress: (item: VaultItem) => void;
  onLongPress?: (item: VaultItem) => void;
  selectMode?: boolean;
  isSelected: (id: string) => boolean;
}

/** One row of the justified grid. */
export function PhotoRow({
  row,
  onPress,
  onLongPress,
  selectMode,
  isSelected,
}: PhotoRowProps) {
  return (
    <View style={[styles.row, { height: row.height }]}>
      {row.items.map(({ item, width }) => (
        <GridTile
          key={item.id}
          item={item}
          width={width}
          height={row.height}
          onPress={onPress}
          onLongPress={onLongPress}
          selectMode={selectMode}
          selected={isSelected(item.id)}
        />
      ))}
    </View>
  );
}

/** The rows for a list of items, for the screen that hosts the grid. */
export function usePhotoRows(items: VaultItem[], columns: number): GridRow[] {
  const available = useGridWidth();
  return useMemo(() => buildRows(items, columns, available), [items, columns, available]);
}

const GridTile = memo(function GridTile({
  item,
  width,
  height,
  onPress,
  onLongPress,
  selectMode,
  selected,
}: {
  item: VaultItem;
  width: number;
  height: number;
  onPress: (item: VaultItem) => void;
  onLongPress?: (item: VaultItem) => void;
  selectMode?: boolean;
  selected: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      accessibilityRole={selectMode ? 'checkbox' : 'button'}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      accessibilityLabel={item.name}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <Thumbnail item={item} size={0} width={width} height={height} />
      {width >= 88 && (
        <View style={styles.nameWrap} pointerEvents="none">
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      )}
      {selected && (
        <View style={[styles.badge, { borderColor: theme.background }]}>
          <Ionicons name="checkmark" size={13} color="#ffffff" />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  nameWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: Fonts.sansSemiBold,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
