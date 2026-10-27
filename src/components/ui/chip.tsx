import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
}

/** Filter chip — gallery "All / Photos / Videos". */
export function Chip({ label, active = false, onPress }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.tint : theme.backgroundElement,
          borderColor: active ? theme.tint : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.label, { color: active ? '#FFFFFF' : theme.textSecondary }]} numberOfLines={1}>
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
