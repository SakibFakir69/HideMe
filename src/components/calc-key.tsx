import { Pressable, StyleSheet, Text, useColorScheme } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type KeyVariant = 'digit' | 'fn' | 'op' | 'accent';

interface CalcKeyProps {
  label: string;
  onPress: () => void;
  variant?: KeyVariant;
  span?: number;
}

const ACCENT_LIGHT = '#B87D24';
const ACCENT_DARK = '#E8A33D';
const ON_ACCENT = '#161006';

export function CalcKey({ label, onPress, variant = 'digit', span = 1 }: CalcKeyProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const accent = scheme === 'dark' ? ACCENT_DARK : ACCENT_LIGHT;

  const surface =
    variant === 'accent'
      ? accent
      : variant === 'digit'
        ? theme.background
        : variant === 'op'
          ? theme.backgroundSelected
          : theme.backgroundElement;

  const foreground =
    variant === 'accent' ? ON_ACCENT : variant === 'digit' ? theme.text : theme.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.key,
        { backgroundColor: surface, flexGrow: span, flexBasis: 0 },
        pressed && styles.pressed,
      ]}>
      <Text
        style={[
          styles.label,
          variant === 'digit' ? styles.labelDigit : styles.labelFn,
          { color: foreground },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 0,
    paddingHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.55,
  },
  label: {
    textAlign: 'center',
  },
  labelDigit: {
    fontFamily: Fonts.mono,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
  },
  labelFn: {
    fontSize: 20,
    fontWeight: '600',
  },
});
