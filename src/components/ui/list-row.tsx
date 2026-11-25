import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface ListRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** colored circle behind the row icon (board style) */
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** trailing value text like "1 minute" or "Dark" */
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** hairline divider under the row (cards with stacked rows) */
  divider?: boolean;
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  value,
  onPress,
  destructive,
  loading,
  disabled,
  divider,
}: ListRowProps) {
  const palette = useVaultPalette();
  const tint = destructive ? '#EF4444' : palette.text;

  const body = (
    <View style={styles.inner}>
      <View style={[styles.iconCircle, { backgroundColor: iconColor ?? palette.chip }]}>
        <Ionicons name={icon} size={17} color={iconColor ? '#FFFFFF' : tint} />
      </View>
      <View style={styles.text}>
        <ThemedText type="small" style={[destructive ? styles.destructive : undefined, { color: tint }]} numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle !== undefined && subtitle.length > 0 && (
          <ThemedText type="code" style={[styles.subtitle, { color: palette.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {loading && <ActivityIndicator size="small" color={palette.accent} />}
      {value !== undefined && (
        <ThemedText type="small" style={{ color: palette.textSecondary }} numberOfLines={1}>
          {value}
        </ThemedText>
      )}
      {right}
      {onPress && !right && !loading && (
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      )}
    </View>
  );

  const dividerStyle = divider
    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border }
    : undefined;

  if (!onPress)
    return <View style={[styles.row, styles.rowLast, dividerStyle]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        dividerStyle,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.three,
    minHeight: 60,
    justifyContent: 'center',
  },
  rowLast: {},
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
  subtitle: {
    fontSize: 11,
  },
  destructive: {
    color: '#EF4444',
    fontFamily: Fonts.sansBold,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
