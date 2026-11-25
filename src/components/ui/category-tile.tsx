import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';

interface CategoryTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** The big shape that sits behind the tile, half hidden by the gradient. */
  watermark: keyof typeof Ionicons.glyphMap;
  /** Two stops — the tile is a gradient, not a flat colour. */
  gradient: readonly [string, string];
  label: string;
  count: number;
  active?: boolean;
  onPress: () => void;
}

/**
 * Vault home category tile — a gradient card with a tinted icon, the name and
 * the count, and the big watermark that gives the tile its depth.
 */
export function CategoryTile({
  icon,
  watermark,
  gradient,
  label,
  count,
  active,
  onPress,
}: CategoryTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active ?? false }}
      accessibilityLabel={`${label}, ${count} items`}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name={watermark} size={104} color="rgba(255,255,255,0.16)" style={styles.watermark} />

      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={22} color="#FFFFFF" />
      </View>

      <View style={styles.meta}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.count} numberOfLines={1}>
          {count} item{count === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.chevron}>
        <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.92)" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: Spacing.three,
    gap: Spacing.three,
    minHeight: 132,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -14,
    bottom: -18,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    gap: 1,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 23,
    fontFamily: Fonts.sansBold,
  },
  count: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: Fonts.sansMedium,
  },
  chevron: {
    position: 'absolute',
    top: Spacing.three - 2,
    right: Spacing.three - 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pressed: {
    opacity: 0.88,
  },
});
