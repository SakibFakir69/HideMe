import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Thumbnail } from '@/components/vault/thumbnail';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { VaultItem } from '@/lib/vault-store';

interface ItemTileProps {
  item: VaultItem;
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
  /** true while the grid is in multi-select mode */
  selectMode?: boolean;
  selected?: boolean;
}

export function ItemTile({ item, size, onPress, onLongPress, selectMode, selected }: ItemTileProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
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
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
