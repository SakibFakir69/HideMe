import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { VAULT_TONES, type VaultTone } from '@/constants/vault-theme';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** The hue of the icon tile. */
  tone?: VaultTone;
  title: string;
  subtitle?: string;
  /** Trailing value in a pill — "5 minutes", "Calculator", "System". */
  value?: string;
  /** Draw the small chevron on the trailing pill. */
  valueChevron?: boolean;
  /** Custom trailing content — a switch. */
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * One settings row: a raised card with a tinted icon tile, the title and the
 * subtitle on the left, and the value or the chevron on the right.
 */
export function SettingsRow({
  icon,
  tone = 'slate',
  title,
  subtitle,
  value,
  valueChevron = false,
  right,
  onPress,
  destructive = false,
  disabled = false,
}: SettingsRowProps) {
  const palette = useVaultPalette();
  const tint = VAULT_TONES[tone];

  const body = (
    <View style={styles.inner}>
      <View style={[styles.tile, { backgroundColor: tint.wash }]}>
        <Ionicons name={icon} size={21} color={destructive ? '#F87171' : tint.color} />
      </View>

      <View style={styles.text}>
        <Text
          style={[styles.title, { color: destructive ? '#F87171' : palette.text }]}
          numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && subtitle.length > 0 && (
          <Text style={[styles.subtitle, { color: palette.textSecondary }]} numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>

      {value !== undefined && value.length > 0 && (
        <View style={[styles.pill, { backgroundColor: palette.chip }]}>
          <Text style={[styles.pillLabel, { color: palette.text }]} numberOfLines={1}>
            {value}
          </Text>
          {valueChevron && (
            <Ionicons name="chevron-down" size={13} color={palette.textSecondary} />
          )}
        </View>
      )}

      {right}

      {onPress && !right && !value && (
        <Ionicons name="chevron-forward" size={17} color={palette.textSecondary} />
      )}
    </View>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: palette.surface, borderColor: palette.border },
          disabled && styles.disabled,
        ]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.three - 2,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 2,
  },
  tile: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15.5,
    lineHeight: 21,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 148,
  },
  pillLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
