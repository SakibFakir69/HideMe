import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  /** center the title like a modal/stack header */
  centerTitle?: boolean;
}

export function ScreenHeader({ title, onBack, right, centerTitle = true }: ScreenHeaderProps) {
  const palette = useVaultPalette();
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: palette.surface },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="chevron-back" size={20} color={palette.text} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
      <ThemedText
        type="smallBold"
        style={[styles.title, { color: palette.text }, !centerTitle && styles.titleLeft]}
        numberOfLines={1}>
        {title}
      </ThemedText>
      <View style={styles.rightSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'flex-end',
  },
  title: {
    flex: 1,
    fontSize: 17,
    textAlign: 'center',
  },
  titleLeft: {
    textAlign: 'left',
  },
  pressed: {
    opacity: 0.7,
  },
});
