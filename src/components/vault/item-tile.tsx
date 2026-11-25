import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBytes } from '@/components/vault/format';
import { Thumbnail } from '@/components/vault/thumbnail';
import { Fonts, Spacing } from '@/constants/theme';
import type { VaultItem } from '@/lib/vault-store';

interface ItemTileProps {
  item: VaultItem;
  size: number;
  /** Receives the item so the caller can keep one stable callback for the whole grid. */
  onPress: (item: VaultItem) => void;
  onLongPress?: (item: VaultItem) => void;
  /** Opens the per-item actions. */
  onMore?: (item: VaultItem) => void;
  /** true while the grid is in multi-select mode */
  selectMode?: boolean;
  selected?: boolean;
}

const KIND_ICON: Record<VaultItem['kind'], keyof typeof Ionicons.glyphMap> = {
  photo: 'image',
  video: 'videocam',
  document: 'document-text',
  audio: 'musical-notes',
};

/**
 * A single grid cell: the file fills the tile, the name and the size sit on
 * a gradient at the bottom, and the "more" button opens the item actions.
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
  onMore,
  selectMode,
  selected,
}: ItemTileProps) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      accessibilityRole={selectMode ? 'checkbox' : 'button'}
      accessibilityState={selectMode ? { checked: selected ?? false } : undefined}
      accessibilityLabel={item.name}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Thumbnail item={item} size={size} radius={16} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        start={{ x: 0.5, y: 0.45 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.kindBadge}>
        <Ionicons name={KIND_ICON[item.kind]} size={12} color="#FFFFFF" />
      </View>

      {selected && (
        <View style={styles.selectedBadge}>
          <Ionicons name="checkmark" size={13} color="#FFFFFF" />
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.footerText}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.size} numberOfLines={1}>
            {formatBytes(item.size)}
          </Text>
        </View>
        {onMore && !selectMode && (
          <Pressable
            onPress={() => onMore(item)}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${item.name}`}>
            <Ionicons name="ellipsis-vertical" size={14} color="rgba(255,255,255,0.85)" />
          </Pressable>
        )}
      </View>
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
    prev.onMore !== next.onMore ||
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
    borderRadius: 16,
    overflow: 'hidden',
  },
  kindBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
    paddingBottom: Spacing.two,
  },
  footerText: {
    flex: 1,
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
  pressed: {
    opacity: 0.75,
  },
});
