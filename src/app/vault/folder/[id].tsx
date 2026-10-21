import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { ImportProgressModal } from '@/components/vault/import-progress-modal';
import { NamePromptModal } from '@/components/vault/name-prompt-modal';
import { SearchBar } from '@/components/vault/search-bar';
import { Thumbnail } from '@/components/vault/thumbnail';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultImport } from '@/hooks/use-vault-import';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getMasterKey } from '@/lib/vault-session';
import { deleteFolder, renameFolder, searchItems } from '@/lib/vault-store';
import type { VaultItem } from '@/lib/vault-store';

const NUM_COLUMNS = 3;
const GRID_GAP = Spacing.two;

export default function FolderScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { index, error, loading, refresh } = useVaultIndex();
  const { busy: importing, progress, importAssets } = useVaultImport(refresh);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const folder = useMemo(
    () => index?.folders.find((f) => f.id === id) ?? null,
    [index, id],
  );

  const items = useMemo(() => {
    if (!index || !id) return [];
    const scoped = searchItems(index, query.trim(), id);
    return scoped;
  }, [index, id, query]);

  const columns = useMemo(() => {
    const width = Dimensions.get('window').width;
    const usable = Math.min(width, MaxContentWidth) - Spacing.three * 2;
    return Math.floor((usable - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);
  }, []);

  const onDelete = useCallback(async () => {
    if (!folder) return;
    const ok = await confirmDestructive(
      'Delete folder',
      `"${folder.name}" will be removed. Files inside move to All items.`,
    );
    if (!ok) return;
    try {
      await deleteFolder(getMasterKey(), folder.id);
      router.back();
    } catch (err) {
      Alert.alert('Could not delete folder', err instanceof Error ? err.message : String(err));
    }
  }, [folder]);

  if (!loading && !error && !folder) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <Header title="Folder" onBack={() => router.back()} />
          <View style={styles.emptyBox}>
            <ThemedText type="small" themeColor="textSecondary">
              This folder no longer exists.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <Header
        title={folder?.name ?? 'Folder'}
        onBack={() => router.back()}
        onMore={folder ? () => setSheetOpen(true) : undefined}
      />
      <SearchBar value={query} onChange={setQuery} placeholder="Search in this folder" />
      <View style={styles.actionRow}>
        <ActionButton
          icon="images-outline"
          label="Photo / video"
          onPress={() => void importAssets('media', id)}
          disabled={importing}
        />
        <ActionButton
          icon="document-outline"
          label="Document"
          onPress={() => void importAssets('document', id)}
          disabled={importing}
        />
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      );
    }
    if (items.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="folder-open-outline" size={34} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            {query ? 'Nothing matches in this folder.' : 'This folder is empty.'}
          </ThemedText>
        </View>
      );
    }
    return null;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <FlatList
          key={`cols-${NUM_COLUMNS}`}
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={items.length >= 1 ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          renderItem={({ item }) => <ItemTile item={item} size={columns} />}
          initialNumToRender={9}
          windowSize={7}
          removeClippedSubviews
        />
      </SafeAreaView>

      <ImportProgressModal progress={progress} />

      <ActionSheetModal
        visible={sheetOpen}
        title={folder?.name}
        actions={[
          {
            label: 'Rename folder',
            icon: <Ionicons name="pencil-outline" size={18} color={theme.text} />,
            onSelect: () => setRenaming(true),
          },
          {
            label: 'Delete folder',
            destructive: true,
            icon: <Ionicons name="trash-outline" size={18} color="#D9342B" />,
            onSelect: () => void onDelete(),
          },
        ]}
        onClose={() => setSheetOpen(false)}
      />

      <NamePromptModal
        visible={renaming}
        title="Rename folder"
        placeholder="Folder name"
        initialValue={folder?.name ?? ''}
        submitLabel="Rename"
        onClose={() => setRenaming(false)}
        onSubmit={async (value) => {
          if (!folder) return;
          await renameFolder(getMasterKey(), folder.id, value);
          await refresh();
        }}
      />
    </ThemedView>
  );
}

function Header({
  title,
  onBack,
  onMore,
}: {
  title: string;
  onBack: () => void;
  onMore?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        hitSlop={Spacing.two}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={20} color={theme.text} />
      </Pressable>
      <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
        {title}
      </ThemedText>
      {onMore ? (
        <Pressable
          onPress={onMore}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Folder actions"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.text} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

function ItemTile({ item, size }: { item: VaultItem; size: number }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/vault/item/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Thumbnail item={item} size={size} />
      <ThemedText type="code" numberOfLines={1} style={styles.tileName} themeColor="textSecondary">
        {item.name}
      </ThemedText>
    </Pressable>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Ionicons name={icon} size={15} color={theme.text} />
      <ThemedText type="small" numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    flexGrow: 1,
  },
  headerBlock: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    textAlign: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 40,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  tile: {
    gap: Spacing.one,
  },
  tileName: {
    fontSize: 10,
    lineHeight: 14,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
