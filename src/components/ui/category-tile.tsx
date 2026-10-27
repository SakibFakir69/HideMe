import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';

interface CategoryTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  color: string;
  active?: boolean;
  onPress: () => void;
}

/** Vault home category tile — solid color card with icon, name and count. */
export function CategoryTile({ icon, label, count, color, active, onPress }: CategoryTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active ?? false }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: color },
        active && styles.active,
        pressed && styles.pressed,
      ]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </View>
      <View style={styles.meta}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.count}>{count} item{count === 1 ? '' : 's'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.three,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  active: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    gap: 1,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: Fonts.sansBold,
  },
  count: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontFamily: Fonts.sansMedium,
  },
  pressed: {
    opacity: 0.85,
  },
});
