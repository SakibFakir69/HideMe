import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SelectionBarProps {
  count: number;
  /** number of selectable items currently visible (for the All action) */
  total: number;
  onCancel: () => void;
  onSelectAll: () => void;
  onMove: () => void;
  onDelete: () => void;
}

/** Bottom action bar shown while the grid is in multi-select mode. */
export function SelectionBar({
  count,
  total,
  onCancel,
  onSelectAll,
  onMove,
  onDelete,
}: SelectionBarProps) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={onCancel}
        hitSlop={Spacing.two}
        accessibilityRole="button"
        accessibilityLabel="Cancel selection"
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
        <Ionicons name="close" size={18} color={theme.text} />
      </Pressable>
      <ThemedText type="smallBold" numberOfLines={1}>
        {count} selected
      </ThemedText>
      {count < total && (
        <Pressable
          onPress={onSelectAll}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Select all"
          style={({ pressed }) => [styles.allBtn, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            All
          </ThemedText>
        </Pressable>
      )}

      <View style={styles.spacer} />

      <Pressable
        onPress={onMove}
        accessibilityRole="button"
        accessibilityLabel={`Move ${count} selected`}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Ionicons name="folder-outline" size={16} color={theme.text} />
        <ThemedText type="small">Move</ThemedText>
      </Pressable>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Move ${count} selected to bin`}
        style={({ pressed }) => [styles.action, styles.destructive, pressed && styles.pressed]}>
        <Ionicons name="trash-outline" size={16} color="#D9342B" />
        <ThemedText type="small" style={styles.destructiveText}>
          Delete
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allBtn: {
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
  },
  spacer: {
    flex: 1,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(127,127,127,0.14)',
  },
  destructive: {
    // tint comes from the red icon/label
  },
  destructiveText: {
    color: '#D9342B',
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.7,
  },
});
