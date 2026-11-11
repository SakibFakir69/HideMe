import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Thumbnail } from '@/components/vault/thumbnail';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VaultItem } from '@/lib/vault-store';

interface ItemTileProps {
  item: VaultItem;
  size: number;
  /** Receives the item so the caller can keep one stable callback for the whole grid. */
  onPress: (item: VaultItem) => void;
  onLongPress?: (item: VaultItem) => void;
  /** true while the grid is in multi-select mode */
  selectMode?: boolean;
  selected?: boolean;
}

/**
 * A single grid cell.
 *
 * Memoized on purpose: the index hook hands out a fresh array on every
 * mutation, so without this every tile in the grid re-renders whenever
 * anything in the vault changes. The item objects themselves keep their
 * identity, so unchanged tiles bail out of the render entirely.
 */
function ItemTileComponent({
  item,
  size,
  onPress,
  onLongPress,
  selectMode,
  selected,
}: ItemTileProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      accessibilityRole={selectMode ? 'checkbox' : 'button'}
      accessibilityState={selectMode ? { checked: selected ?? false } : undefined}
      accessibilityLabel={item.name}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View>
        <Thumbnail item={item} size={size} />
        {selected && (
          <View style={[styles.badge, { borderColor: theme.background }]}>
            <Ionicons name="checkmark" size={13} color="#ffffff" />
          </View>
        )}
      </View>
      <ThemedText type="code" numberOfLines={1} style={styles.tileName} themeColor="textSecondary">
        {item.name}
      </ThemedText>
    </Pressable>
  );
}

/**
 * The store mutates item records in place, so the object identity never
 * changes. Comparing the fields the tile actually renders keeps renames,
 * moves and deletions visible while unchanged tiles skip the re-render.
 */
function areEqual(prev: ItemTileProps, next: ItemTileProps): boolean {
  if (
    prev.size !== next.size ||
    prev.selectMode !== next.selectMode ||
    prev.selected !== next.selected ||
    prev.onPress !== next.onPress ||
    prev.onLongPress !== next.onLongPress
  ) {
    return false;
  }
  const a = prev.item;
  const b = next.item;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.size === b.size &&
    a.ext === b.ext &&
    a.folderId === b.folderId &&
    a.deletedAt === b.deletedAt &&
    a.durationMs === b.durationMs
  );
}

export const ItemTile = memo(ItemTileComponent, areEqual);

const styles = StyleSheet.create({
  tile: {
    gap: Spacing.one,
  },
  tileName: {
    fontSize: 10,
    lineHeight: 14,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
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
