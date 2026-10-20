import type { ReactNode } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SheetAction {
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}

interface ActionSheetModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}

export function ActionSheetModal({ visible, title, subtitle, actions, onClose }: ActionSheetModalProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {title !== undefined && (
            <View style={styles.header}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {title}
              </ThemedText>
              {subtitle !== undefined && (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                  {subtitle}
                </ThemedText>
              )}
            </View>
          )}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => {
                onClose();
                // let the modal dismiss before the action runs (dialogs, navigation)
                setTimeout(() => {
                  try {
                    const result = action.onSelect() as void | Promise<void>;
                    if (result && typeof result.catch === 'function') {
                      result.catch((error: unknown) =>
                        Alert.alert('Action failed', error instanceof Error ? error.message : String(error)),
                      );
                    }
                  } catch (error) {
                    Alert.alert('Action failed', error instanceof Error ? error.message : String(error));
                  }
                }, 50);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.action,
                { borderTopColor: theme.backgroundSelected },
                pressed && { backgroundColor: theme.backgroundSelected },
              ]}>
              {action.icon}
              <ThemedText
                type="small"
                style={action.destructive ? styles.destructive : undefined}>
                {action.label}
              </ThemedText>
            </Pressable>
          ))}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.action,
              { borderTopColor: theme.backgroundSelected },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingBottom: Spacing.five,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 50,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  destructive: {
    color: '#D9342B',
    fontWeight: 700,
  },
});
