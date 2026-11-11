import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/vault/format';
import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { AdBanner } from '@/components/vault/ad-banner';
import { confirmDestructive } from '@/components/vault/confirm';
import { ItemTile } from '@/components/vault/item-tile';
import { MoveItemsSheet } from '@/components/vault/move-items-sheet';
import { NamePromptModal } from '@/components/vault/name-prompt-modal';
import { SearchBar } from '@/components/vault/search-bar';
import { SelectionBar } from '@/components/vault/selection-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CategoryTile } from '@/components/ui/category-tile';
import { Fab } from '@/components/ui/fab';
import { SectionTitle } from '@/components/ui/section-title';
import {
  BrandGradient,
  CategoryColor,
  Fonts,
  MaxContentWidth,
  Radius,
  Spacing,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { GRID_GAP, useGridColumns } from '@/hooks/use-grid-columns';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { setBrowseList } from '@/lib/vault-browse';
import { getMasterKey, lock } from '@/lib/vault-session';
import {
  createFolder,
  deleteFolder,
  moveItemsToBin,
  renameFolder,
  restoreItems,
  searchItems,
} from '@/lib/vault-store';
import type { VaultFolder, VaultItem } from '@/lib/vault-store';

const NUM_COLUMNS = 3;
const FOLDER_ICON = '#3B82F6';

type Category = 'all' | 'photo' | 'video' | 'document';

export default function VaultHomeScreen() {
  const theme = useTheme();
  const { index, error, loading, refresh } = useVaultIndex();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [prompt, setPrompt] = useState<null | {
    mode: 'new-folder' | 'rename-folder';
    folder?: VaultFolder;
  }>(null);
  const [folderSheet, setFolderSheet] = useState<VaultFolder | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const selectMode = selected !== null;
  // Results recompute only after typing pauses — previous results stay
  // visible in the gap, so the grid never flashes empty mid-word.
  const effectiveQuery = useDebouncedValue(query, 250);

  // Stable callbacks: the grid re-renders on every index mutation, and new
  // function identities would defeat the memoized ItemTile.
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      if (!prev) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size > 0 ? next : null;
    });
  }, []);
  const startSelect = useCallback((id: string) => setSelected(new Set([id])), []);

  const handleItemLongPress = useCallback(
    (item: VaultItem) => startSelect(item.id),
    [startSelect],
  );

  const activeItems = useMemo(
    () => (index ? searchItems(index, '') : []),
    [index],
  );

  const counts = useMemo(() => {
    const base = { all: activeItems.length, photo: 0, video: 0, document: 0 };
    for (const item of activeItems) base[item.kind] += 1;
    return base;
  }, [activeItems]);

  const folders = useMemo(() => {
    if (!index) return [];
    const q = effectiveQuery.trim().toLowerCase();
    if (!q) return index.folders;
    return index.folders.filter((f) => f.name.toLowerCase().includes(q));
  }, [index, effectiveQuery]);

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of activeItems) {
      if (item.folderId) map.set(item.folderId, (map.get(item.folderId) ?? 0) + 1);
    }
    return map;
  }, [activeItems]);

  const items = useMemo(() => {
    if (!index) return [];
    const base = searchItems(index, effectiveQuery.trim());
    return category === 'all' ? base : base.filter((it) => it.kind === category);
  }, [index, effectiveQuery, category]);

  const handleItemPress = useCallback(
    (item: VaultItem) => {
      if (selectMode) {
        toggleSelect(item.id);
        return;
      }
      // Remember what the user was looking at so the viewer can page
      // through the same set with a swipe.
      setBrowseList(items.map((entry) => entry.id));
      router.push({ pathname: '/vault/item/[id]', params: { id: item.id } });
    },
    [selectMode, toggleSelect, items],
  );

  const selectAll = () => setSelected(new Set(items.map((it) => it.id)));

  const onDeleteSelected = useCallback(async () => {
    if (!selected || selected.size === 0) return;
    const ids = [...selected];
    const n = ids.length;
    const ok = await confirmDestructive(
      'Move to bin',
      `${n} file${n === 1 ? '' : 's'} will be kept in Recently deleted for 30 days, then deleted permanently.`,
    );
    if (!ok) return;
    try {
      await moveItemsToBin(getMasterKey(), ids);
      setSelected(null);
      Alert.alert(
        'Moved to bin',
        `${n} file${n === 1 ? '' : 's'} will be permanently deleted in 30 days.`,
        [
          {
            text: 'Undo',
            onPress: () => {
              restoreItems(getMasterKey(), ids).catch((err) =>
                Alert.alert('Could not restore', err instanceof Error ? err.message : String(err)),
              );
            },
          },
          { text: 'OK', style: 'cancel' },
        ],
      );
    } catch (err) {
      Alert.alert('Could not delete', err instanceof Error ? err.message : String(err));
    }
  }, [selected]);

  const columns = useGridColumns(NUM_COLUMNS);

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

  const gridLabel = effectiveQuery
    ? `${items.length} RESULT${items.length === 1 ? '' : 'S'}`
    : category === 'all'
      ? `ALL ITEMS · ${items.length} · ${formatBytes(items.reduce((n, it) => n + it.size, 0))}`
      : `${category.toUpperCase()}S · ${items.length}`;

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <View style={styles.toolbarRow}>
        <View style={styles.brandRow}>
          <LinearGradient
            colors={[...BrandGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandMark}>
            <Ionicons name="calculator" size={16} color="#FFFFFF" />
          </LinearGradient>
          <ThemedText type="subtitle" style={styles.title}>
            HideMe
          </ThemedText>
        </View>
        <View style={styles.toolbarActions}>
          <IconButton
            icon="trash-outline"
            label="Recently deleted"
            onPress={() => router.push('/vault/bin')}
          />
          <IconButton icon="lock-closed-outline" label="Lock vault" onPress={onLock} />
        </View>
      </View>

      <SearchBar value={query} onChange={setQuery} placeholder="Search your files…" />

      <View style={styles.tileGrid}>
        <View style={styles.tileRow}>
          <CategoryTile
            icon="image"
            label="Photos"
            count={counts.photo}
            color={CategoryColor.photo}
            active={category === 'photo'}
            onPress={() => setCategory((c) => (c === 'photo' ? 'all' : 'photo'))}
          />
          <CategoryTile
            icon="videocam"
            label="Videos"
            count={counts.video}
            color={CategoryColor.video}
            active={category === 'video'}
            onPress={() => setCategory((c) => (c === 'video' ? 'all' : 'video'))}
          />
        </View>
        <View style={styles.tileRow}>
          <CategoryTile
            icon="document-text"
            label="Documents"
            count={counts.document}
            color={CategoryColor.document}
            active={category === 'document'}
            onPress={() => setCategory((c) => (c === 'document' ? 'all' : 'document'))}
          />
          <CategoryTile
            icon="apps"
            label="All files"
            count={counts.all}
            color={CategoryColor.all}
            active={category === 'all'}
            onPress={() => setCategory('all')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionTitle
          label="Folders"
          actionLabel="＋ New"
          onAction={() => setPrompt({ mode: 'new-folder' })}
        />
        {folders.length > 0 ? (
          <View style={[styles.folderCard, { backgroundColor: theme.backgroundElement }]}>
            {folders.map((folder, i) => (
              <Pressable
                key={folder.id}
                onPress={() =>
                  router.push({ pathname: '/vault/folder/[id]', params: { id: folder.id } })
                }
                onLongPress={() => setFolderSheet(folder)}
                style={({ pressed }) => [
                  styles.folderRow,
                  i < folders.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.border,
                  },
                  pressed && styles.pressed,
                ]}>
                <View style={styles.folderIcon}>
                  <Ionicons name="folder" size={18} color={FOLDER_ICON} />
                </View>
                <View style={styles.folderText}>
                  <ThemedText type="small" numberOfLines={1}>
                    {folder.name}
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary">
                    {`${folderCounts.get(folder.id) ?? 0} item${
                      folderCounts.get(folder.id) === 1 ? '' : 's'
                    }`}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setFolderSheet(folder)}
                  hitSlop={Spacing.two}
                  accessibilityRole="button"
                  accessibilityLabel={`Actions for folder ${folder.name}`}>
                  <Ionicons name="ellipsis-horizontal" size={16} color={theme.textSecondary} />
                </Pressable>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        ) : (
          <ThemedText type="code" themeColor="textSecondary" style={styles.noFolders}>
            {effectiveQuery ? 'No folders match your search.' : 'No folders yet — create one to group files.'}
          </ThemedText>
        )}
      </View>

      <SectionTitle label={gridLabel} />
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={theme.tint} />
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
    if (items.length === 0 && (folders.length > 0 || !effectiveQuery)) {
      if (category !== 'all' || effectiveQuery) {
        return (
          <View style={styles.emptyBox}>
            <Ionicons name="search-outline" size={30} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              {effectiveQuery ? 'Nothing matches your search.' : 'No files in this category yet.'}
            </ThemedText>
          </View>
        );
      }
      if (folders.length > 0) return null;
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="shield-checkmark-outline" size={34} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
            Your vault is empty.{'\n'}Tap + to import photos, videos or documents — everything is
            encrypted on this device.
          </ThemedText>
        </View>
      );
    }
    return null;
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          key={`cols-${NUM_COLUMNS}`}
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={items.length >= 1 ? styles.gridRow : undefined}
          contentContainerStyle={[
            styles.listContent,
            selectMode && styles.listContentSelecting,
          ]}
          style={styles.listFlex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Pass an element (not a function) so the header keeps its identity
          // while `query` changes. A new function each keystroke made
          // FlatList remount the header — which blurred the search input and
          // closed the keyboard after the first word.
          ListHeaderComponent={renderHeader()}
          ListEmptyComponent={renderEmpty() ?? undefined}
          renderItem={({ item }) => (
            <ItemTile
              item={item}
              size={columns}
              selectMode={selectMode}
              selected={selected?.has(item.id) ?? false}
              onPress={handleItemPress}
              onLongPress={handleItemLongPress}
            />
          )}
          initialNumToRender={9}
          windowSize={7}
          removeClippedSubviews
          ListFooterComponent={selectMode ? undefined : <AdBanner />}
        />
        {selectMode && (
          <SelectionBar
            count={selected.size}
            total={items.length}
            onCancel={() => setSelected(null)}
            onSelectAll={selectAll}
            onMove={() => setMoveOpen(true)}
            onDelete={() => void onDeleteSelected()}
          />
        )}
        {!selectMode && (
          <Fab label="Import files" onPress={() => router.push('/vault/import')} />
        )}
      </SafeAreaView>

      <MoveItemsSheet
        visible={moveOpen}
        ids={selected ? [...selected] : []}
        onClose={() => setMoveOpen(false)}
        onChanged={() => {
          setMoveOpen(false);
          setSelected(null);
        }}
      />

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
            icon: <Ionicons name="trash-outline" size={18} color="#EF4444" />,
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 104,
    flexGrow: 1,
    // The tile width is computed for MaxContentWidth, so the list has to
    // actually be that wide — otherwise wide screens leave a gap per cell.
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  listContentSelecting: {
    paddingBottom: 96,
  },
  listFlex: {
    flex: 1,
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: Fonts.sansBold,
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
  tileGrid: {
    gap: Spacing.two,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  folderCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  folderIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(59,130,246,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderText: {
    flex: 1,
    gap: 1,
  },
  noFolders: {
    paddingHorizontal: Spacing.one,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
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
});
