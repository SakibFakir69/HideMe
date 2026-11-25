import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius } from '@/constants/theme';
import { VAULT_ACCENTS } from '@/constants/vault-theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

export type KeyVariant = 'digit' | 'fn' | 'op' | 'accent';

interface CalcKeyProps {
  label: string;
  onPress: () => void;
  variant?: KeyVariant;
  span?: number;
  /**
   * Minimum key height. The calculator disguise uses the taller default so it
   * reads like a real calculator; the setup screen needs shorter keys to fit
   * its extra rows on short screens.
   */
  minHeight?: number;
}

export function CalcKey({
  label,
  onPress,
  variant = 'digit',
  span = 1,
  minHeight,
}: CalcKeyProps) {
  const palette = useVaultPalette();

  const surface =
    variant === 'digit'
      ? palette.surface
      : variant === 'op'
        ? palette.accent
        : 'transparent';

  const foreground =
    variant === 'op' || variant === 'accent'
      ? '#FFFFFF'
      : variant === 'digit'
        ? palette.text
        : palette.textSecondary;

  const keyStyle = (
    pressed: boolean,
  ) => ({
    backgroundColor: surface,
    flexGrow: span,
    flexBasis: 0,
    opacity: pressed ? 0.7 : 1,
  });

  const labelNode = (
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
  );

  if (variant === 'accent') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.key,
          minHeight !== undefined && { minHeight },
          keyStyle(pressed),
        ]}>
        <LinearGradient
          colors={VAULT_ACCENTS.emerald.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.accentFill}>
          {labelNode}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.key,
        minHeight !== undefined && { minHeight },
        keyStyle(pressed),
      ]}>
      {labelNode}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  key: {
    flex: 1,
    minHeight: 62,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  accentFill: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    position: 'absolute',
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textAlign: 'center',
  },
  labelDigit: {
    fontFamily: Fonts.mono,
    fontSize: 25,
    fontVariant: ['tabular-nums'],
  },
  labelFn: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 21,
  },
});
