import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { formatBytes } from '@/components/vault/format';
import { Thumbnail } from '@/components/vault/thumbnail';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { daysLeft } from '@/lib/vault-bin-core';
import { getMasterKey } from '@/lib/vault-session';
import {
  binItems,
  emptyBin,
  errorMessage,
  purgeItem,
  restoreItem,
} from '@/lib/vault-store';
import type { VaultItem } from '@/lib/vault-store';

const THUMB = 56;

export default function BinScreen() {
  const theme = useTheme();
  const { index, now } = useVaultIndex();
  const [sheetItem, setSheetItem] = useState<VaultItem | null>(null);

  const items = useMemo(() => (index ? binItems(index) : []), [index]);
  const totalBytes = useMemo(() => items.reduce((n, it) => n + it.size, 0), [items]);

  const onEmptyBin = async () => {
    if (items.length === 0) return;
    const ok = await confirmDestructive(
      'Empty bin',
      `Permanently delete ${items.length} file${items.length === 1 ? '' : 's'} (${formatBytes(totalBytes)})? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await emptyBin(getMasterKey());
    } catch (error) {
      Alert.alert('Could not empty bin', errorMessage(error));
    }
  };

  const onRestore = async (item: VaultItem) => {
    try {
      await restoreItem(getMasterKey(), item.id);
    } catch (error) {
      Alert.alert('Could not restore', errorMessage(error));
    }
  };

  const onDeleteForever = async (item: VaultItem) => {
    const ok = await confirmDestructive(
      'Delete permanently',
      `Delete "${item.name}" forever? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await purgeItem(getMasterKey(), item.id);
    } catch (error) {
      Alert.alert('Could not delete', errorMessage(error));
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerBlock}>
          <View style={styles.toolbarRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={Spacing.two}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold" style={styles.title}>
              Recently deleted
            </ThemedText>
            {items.length > 0 ? (
              <Pressable
                onPress={() => void onEmptyBin()}
                hitSlop={Spacing.two}
                accessibilityRole="button"
                accessibilityLabel="Empty bin"
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Ionicons name="trash-outline" size={18} color="#D9342B" />
              </Pressable>
            ) : (
              <View style={styles.iconButton} />
            )}
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Files stay here for 30 days, then are permanently deleted. Restore sends them back to
            the vault.
            {items.length > 0 ? ` · ${items.length} · ${formatBytes(totalBytes)}` : ''}
          </ThemedText>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="trash-outline" size={34} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Bin is empty.
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <BinRow item={item} now={now} onPress={() => setSheetItem(item)} />
          )}
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
        />
      </SafeAreaView>

      <ActionSheetModal
        visible={sheetItem !== null}
        title={sheetItem?.name}
        subtitle={
          sheetItem?.deletedAt !== undefined ? subtitleFor(sheetItem.deletedAt, now) : undefined
        }
        actions={[
          {
            label: 'Restore to vault',
            icon: <Ionicons name="arrow-undo-outline" size={18} color={theme.text} />,
            onSelect: async () => {
              if (sheetItem) await onRestore(sheetItem);
            },
          },
          {
            label: 'Delete forever',
            destructive: true,
            icon: <Ionicons name="trash-outline" size={18} color="#D9342B" />,
            onSelect: async () => {
              if (sheetItem) await onDeleteForever(sheetItem);
            },
          },
        ]}
        onClose={() => setSheetItem(null)}
      />
    </ThemedView>
  );
}

function subtitleFor(deletedAt: number, now: number): string {
  const left = daysLeft(deletedAt, now);
  if (left <= 0) return 'Deleting soon…';
  return left === 1 ? '1 day left' : `${left} days left`;
}

function BinRow({ item, now, onPress }: { item: VaultItem; now: number; onPress: () => void }) {
  const theme = useTheme();
  const left = item.deletedAt !== undefined ? daysLeft(item.deletedAt, now) : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Actions for ${item.name}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <Thumbnail item={item} size={THUMB} />
      <View style={styles.rowMeta}>
        <ThemedText type="small" numberOfLines={1}>
          {item.name}
        </ThemedText>
        <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
          {left <= 0 ? 'Deleting soon…' : left === 1 ? '1 day left' : `${left} days left`}
          {' · '}
          {formatBytes(item.size)}
        </ThemedText>
      </View>
      <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  headerBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    flex: 1,
    textAlign: 'center',
  },
  subtitle: {
    lineHeight: 17,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: Spacing.six,
    flexGrow: 1,
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.three,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.six * 2,
  },
  emptyText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
