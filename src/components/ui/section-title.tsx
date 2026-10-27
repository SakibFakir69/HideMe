import { Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';

interface SectionTitleProps {
  label: string;
  action?: ReactNode;
  onAction?: () => void;
  actionLabel?: string;
}

/** Uppercase section label, board style: "FOLDERS" + optional trailing action. */
export function SectionTitle({ label, action, onAction, actionLabel }: SectionTitleProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      {action ??
        (onAction && actionLabel ? (
          <Pressable
            onPress={onAction}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
            <ThemedText type="small" style={styles.actionText}>
              {actionLabel}
            </ThemedText>
          </Pressable>
        ) : null)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  label: {
    letterSpacing: 0.8,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  action: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  actionText: {
    color: '#818CF8',
    fontFamily: Fonts.sansBold,
  },
  pressed: {
    opacity: 0.7,
  },
});
