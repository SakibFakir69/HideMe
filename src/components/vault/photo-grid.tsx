import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { formatBytes } from '@/components/vault/format';
import { Thumbnail } from '@/components/vault/thumbnail';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
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
  const palette = useVaultPalette();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      accessibilityRole={selectMode ? 'checkbox' : 'button'}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      accessibilityLabel={item.name}
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <Thumbnail item={item} size={0} width={width} height={height} radius={16} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {width >= 88 && (
        <View style={styles.nameWrap} pointerEvents="none">
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.size} numberOfLines={1}>
            {formatBytes(item.size)}
          </Text>
        </View>
      )}
      {selected && (
        <View style={[styles.badge, { borderColor: palette.background }]}>
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
    marginBottom: GRID_GAP,
  },
  nameWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 1,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
    fontFamily: Fonts.sansSemiBold,
  },
  size: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 9.5,
    lineHeight: 13,
    fontFamily: Fonts.sans,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
