import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { BrandGradient, Fonts, Radius, Spacing } from '@/constants/theme';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 'primary' = brand gradient, 'ghost' = transparent text button */
  variant?: 'primary' | 'ghost';
  style?: ViewStyle;
}

export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  style,
}: GradientButtonProps) {
  const inactive = disabled || loading;

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={onPress}
        disabled={inactive}
        accessibilityRole="button"
        style={({ pressed }) => [styles.ghost, style, pressed && styles.pressed, inactive && styles.inactive]}>
        <Text style={styles.ghostLabel}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      style={({ pressed }) => [style, pressed && styles.pressed, inactive && styles.inactive]}>
      <LinearGradient
        colors={[...BrandGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {label}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gradient: {
    borderRadius: Radius.md,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Fonts.sansBold,
  },
  ghost: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  ghostLabel: {
    color: '#B7BFCF',
    fontSize: 15,
    fontFamily: Fonts.sansSemiBold,
  },
  pressed: {
    opacity: 0.85,
  },
  inactive: {
    opacity: 0.5,
  },
});
