import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/vault/format';
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
import { getMasterKey, lock } from '@/lib/vault-session';
import {
  createFolder,
  deleteFolder,
  renameFolder,
  searchItems,
} from '@/lib/vault-store';
import type { VaultFolder, VaultItem } from '@/lib/vault-store';

const NUM_COLUMNS = 3;
const GRID_GAP = Spacing.two;

export default function VaultHomeScreen() {
  const theme = useTheme();
  const { index, error, loading, refresh } = useVaultIndex();
  const { busy: importing, progress, importAssets } = useVaultImport(refresh);
  const [query, setQuery] = useState('');
  const [prompt, setPrompt] = useState<null | {
    mode: 'new-folder' | 'rename-folder';
    folder?: VaultFolder;
  }>(null);
  const [folderSheet, setFolderSheet] = useState<VaultFolder | null>(null);

  const folders = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    if (!q) return index.folders;
    return index.folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [index, query]);

  const items = useMemo(() => {
    if (!index) return [];
    return searchItems(index, query.trim());
  }, [index, query]);

  const columns = useMemo(() => {
    const width = Dimensions.get('window').width;
    const usable = Math.min(width, MaxContentWidth) - Spacing.three * 2;
    return Math.floor((usable - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);
  }, []);

  const onLock = useCallback(() => {
    lock();
  }, []);

  const confirmDeleteFolder = useCallback(
    async (folder: VaultFolder) => {
      const ok = await confirmDestructive(
        'Delete folder',
        `"${folder.name}" will be removed. Files inside move to All items.`,
      );
      if (!ok) return;
      try {
        await deleteFolder(getMasterKey(), folder.id);
        await refresh();
      } catch (err) {
        Alert.alert('Could not delete folder', err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <View style={styles.toolbarRow}>
        <ThemedText type="subtitle" style={styles.title}>
          Vault
        </ThemedText>
        <View style={styles.toolbarActions}>
          <IconButton icon="lock-closed-outline" label="Lock vault" onPress={onLock} />
          <IconButton
            icon="settings-outline"
            label="Settings"
            onPress={() => router.push('/vault/settings')}
          />
        </View>
      </View>

      <SearchBar value={query} onChange={setQuery} placeholder="Search files and folders" />

      <View style={styles.actionRow}>
        <ActionButton
          icon="folder-open-outline"
          label="Folder"
          onPress={() => setPrompt({ mode: 'new-folder' })}
        />
        <ActionButton
          icon="images-outline"
          label="Photo / video"
          onPress={() => void importAssets('media', null)}
          disabled={importing}
        />
        <ActionButton
          icon="document-outline"
          label="Document"
          onPress={() => void importAssets('document', null)}
          disabled={importing}
        />
      </View>

      {folders.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
            FOLDERS
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.folderRow}>
            {folders.map((folder) => (
              <Pressable
                key={folder.id}
                onPress={() =>
                  router.push({ pathname: '/vault/folder/[id]', params: { id: folder.id } })
                }
                onLongPress={() => setFolderSheet(folder)}
                style={({ pressed }) => [
                  styles.folderCard,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.folderCardTop}>
                  <Ionicons name="folder" size={22} color="#F2B84B" />
                  <Pressable
                    onPress={() => setFolderSheet(folder)}
                    hitSlop={Spacing.two}
                    accessibilityRole="button"
                    accessibilityLabel={`Actions for folder ${folder.name}`}>
                    <Ionicons name="ellipsis-horizontal" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
                <ThemedText type="small" numberOfLines={1} style={styles.folderName}>
                  {folder.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {!query && index && index.items.length > 0 && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          ALL ITEMS · {index.items.length} · {formatBytes(items.reduce((n, it) => n + it.size, 0))}
        </ThemedText>
      )}
      {query && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
          {items.length} RESULT{items.length === 1 ? '' : 'S'}
        </ThemedText>
      )}
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
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            {error}
          </ThemedText>
        </View>
      );
    }
    if (items.length === 0 && folders.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="shield-checkmark-outline" size={34} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            {query
              ? 'Nothing matches your search.'
              : 'Your vault is empty.\nImport photos, videos or documents — everything is encrypted on this device.'}
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

      <NamePromptModal
        visible={prompt !== null}
        title={prompt?.mode === 'rename-folder' ? 'Rename folder' : 'New folder'}
        placeholder="Folder name"
        initialValue={prompt?.folder?.name ?? ''}
        submitLabel={prompt?.mode === 'rename-folder' ? 'Rename' : 'Create'}
        onClose={() => setPrompt(null)}
        onSubmit={async (value) => {
          if (!prompt) return;
          if (prompt.mode === 'new-folder') {
            await createFolder(getMasterKey(), value);
          } else if (prompt.folder) {
            await renameFolder(getMasterKey(), prompt.folder.id, value);
          }
          await refresh();
        }}
      />

      <ActionSheetModal
        visible={folderSheet !== null}
        title={folderSheet?.name}
        actions={[
          {
            label: 'Rename folder',
            icon: <Ionicons name="pencil-outline" size={18} color={theme.text} />,
            onSelect: () => {
              if (folderSheet) setPrompt({ mode: 'rename-folder', folder: folderSheet });
            },
          },
          {
            label: 'Delete folder',
            destructive: true,
            icon: <Ionicons name="trash-outline" size={18} color="#D9342B" />,
            onSelect: () => {
              if (folderSheet) void confirmDeleteFolder(folderSheet);
            },
          },
        ]}
        onClose={() => setFolderSheet(null)}
      />
    </ThemedView>
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

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <Ionicons name={icon} size={18} color={theme.text} />
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
      <ThemedText type="small" numberOfLines={1} style={styles.actionLabel}>
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
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
  },
  toolbarActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  actionLabel: {
    flexShrink: 1,
  },
  section: {
    gap: Spacing.two,
  },
  folderRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  folderCard: {
    width: 104,
    padding: Spacing.two,
    borderRadius: Spacing.three,
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  folderCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between',
  },
  folderName: {
    maxWidth: '100%',
  },
  sectionLabel: {
    letterSpacing: 0.6,
    fontSize: 11,
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
