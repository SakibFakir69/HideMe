import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
}

/** Filter chip — gallery "All / Photos / Videos". */
export function Chip({ label, active = false, onPress }: ChipProps) {
  const palette = useVaultPalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? palette.accent : palette.surface,
          borderColor: active ? palette.accent : palette.border,
        },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.label, { color: active ? '#FFFFFF' : palette.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.three,
    height: 34,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.sansSemiBold,
  },
  pressed: {
    opacity: 0.8,
  },
});
