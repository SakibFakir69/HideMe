import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface VaultHeaderProps {
  /** The glyph in the app mark. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Two stops for the mark. */
  gradient: readonly [string, string];
  title: string;
  subtitle: string;
  /** A pill on the right — the gallery's "Select". */
  action?: ReactNode;
}

/**
 * The top of a vault screen: the app mark, the name and what the screen can
 * do from here.
 */
export function VaultHeader({ icon, gradient, title, subtitle, action }: VaultHeaderProps) {
  const palette = useVaultPalette();

  return (
    <View style={styles.row}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mark}>
        <Ionicons name={icon} size={22} color="#FFFFFF" />
      </LinearGradient>

      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subtitleRow}>
          <Text style={[styles.subtitle, { color: palette.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
          <Ionicons name="lock-closed" size={11} color={palette.textSecondary} />
        </View>
      </View>

      {action}
    </View>
  );
}

interface VaultSelectPillProps {
  label: string;
  /** True while the screen is in multi-select mode. */
  active?: boolean;
  onPress: () => void;
}

/** The "Select" pill in the gallery header. */
export function VaultSelectPill({ label, active = false, onPress }: VaultSelectPillProps) {
  const palette = useVaultPalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: palette.surface },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.pillLabel, { color: palette.text }]}>{label}</Text>
      <Ionicons name="checkmark-circle" size={17} color={palette.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 2,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 24,
    lineHeight: 29,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: 11,
  },
  pillLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.7,
  },
});
