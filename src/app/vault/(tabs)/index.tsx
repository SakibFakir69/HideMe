import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
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
import { SkeletonGrid } from '@/components/vault/skeleton-grid';
import { Thumbnail } from '@/components/vault/thumbnail';
import { VaultHeader } from '@/components/vault/vault-header';
import { CategoryTile } from '@/components/ui/category-tile';
import { Fab } from '@/components/ui/fab';
import { VAULT_ACCENTS, VAULT_CATEGORIES } from '@/constants/vault-theme';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { GRID_GAP, useGridColumns } from '@/hooks/use-grid-columns';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { usePremium } from '@/lib/premium';
import { shareVaultFile } from '@/lib/share';
import { setBrowseList } from '@/lib/vault-browse';
import { getMasterKey, lock } from '@/lib/vault-session';
import {
  createFolder,
  decryptToCache,
  deleteFolder,
  moveItemToBin,
  moveItemsToBin,
  renameFolder,
  restoreItems,
  searchItems,
} from '@/lib/vault-store';
import type { VaultFolder, VaultItem } from '@/lib/vault-store';

const NUM_COLUMNS = 3;
const FOLDER_ICON = '#3B82F6';
/** Free tier keeps a small number of folders; Premium is unlimited. */
const FREE_FOLDER_LIMIT = 3;

type Category = 'all' | 'photo' | 'video' | 'document' | 'audio';
type ViewMode = 'grid' | 'list';

export default function VaultHomeScreen() {
  const palette = useVaultPalette();
  const premium = usePremium();
  const { index, error, loading, refresh } = useVaultIndex();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [view, setView] = useState<ViewMode>('grid');
  const [prompt, setPrompt] = useState<null | {
    mode: 'new-folder' | 'rename-folder';
    folder?: VaultFolder;
  }>(null);
  const [folderSheet, setFolderSheet] = useState<VaultFolder | null>(null);
  const [itemSheet, setItemSheet] = useState<VaultItem | null>(null);
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

  const activeItems = useMemo(() => {
    if (!index) return [];
    return searchItems(index, '');
  }, [index]);

  const counts = useMemo(() => {
    const base = { all: activeItems.length, photo: 0, video: 0, document: 0, audio: 0 };
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

  const totalSize = useMemo(() => items.reduce((n, it) => n + it.size, 0), [items]);

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

  // Free tier: a small folder quota. Premium removes it — this is the
  // "Unlimited vault organization" benefit on the paywall.
  const openNewFolderPrompt = useCallback(() => {
    if (!premium.active && folders.length >= FREE_FOLDER_LIMIT) {
      Alert.alert(
        'Folder limit reached',
        `Free HideMe keeps up to ${FREE_FOLDER_LIMIT} folders. Go Premium for unlimited folders and organization.`,
        [
          { text: 'Maybe later', style: 'cancel' },
          { text: 'Go Premium', onPress: () => router.push('/vault/premium') },
        ],
      );
      return;
    }
    setPrompt({ mode: 'new-folder' });
  }, [premium.active, folders.length]);

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

  const onShareItem = useCallback(async (item: VaultItem) => {
    try {
      const file = await decryptToCache(getMasterKey(), item);
      const result = await shareVaultFile(file, {
        name: item.name,
        ext: item.ext,
        mime: item.mime,
      });
      if (result === 'unavailable') {
        Alert.alert('Sharing isn’t available', 'This build can’t open the system share sheet.');
      } else if (result === 'failed') {
        Alert.alert('Could not share', 'The file couldn’t be handed to another app.');
      }
    } catch (error) {
      Alert.alert('Could not share', error instanceof Error ? error.message : String(error));
    }
  }, []);

  const onBinItem = useCallback(async (item: VaultItem) => {
    const ok = await confirmDestructive(
      'Move to bin',
      `"${item.name}" will be kept in Recently deleted for 30 days, then deleted permanently.`,
    );
    if (!ok) return;
    try {
      await moveItemToBin(getMasterKey(), item.id);
      await refresh();
      Alert.alert('Moved to bin', `"${item.name}" will be permanently deleted in 30 days.`, [
        {
          text: 'Undo',
          onPress: () => {
            restoreItems(getMasterKey(), [item.id]).catch((err) =>
              Alert.alert('Could not restore', err instanceof Error ? err.message : String(err)),
            );
          },
        },
        { text: 'OK', style: 'cancel' },
      ]);
    } catch (error) {
      Alert.alert('Could not delete', error instanceof Error ? error.message : String(error));
    }
  }, [refresh]);

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
      } catch (error) {
        Alert.alert('Could not delete folder', error instanceof Error ? error.message : String(error));
      }
    },
    [refresh],
  );

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <VaultHeader
        icon="calculator"
        gradient={VAULT_ACCENTS.emerald.gradient}
        title="HideMe"
        subtitle="Your private vault"
        action={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/vault/bin')}
              accessibilityRole="button"
              accessibilityLabel="Recently deleted"
              style={({ pressed }) => [
                styles.headerAction,
                { backgroundColor: palette.surfaceHigh },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="trash-outline" size={19} color={palette.text} />
            </Pressable>
            <Pressable
              onPress={onLock}
              accessibilityRole="button"
              accessibilityLabel="Lock vault"
              style={({ pressed }) => [
                styles.headerAction,
                { backgroundColor: palette.surfaceHigh },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="lock-closed" size={19} color={palette.text} />
            </Pressable>
          </View>
        }
      />

      <SearchBar value={query} onChange={setQuery} placeholder="Search your files…" />

      <View style={styles.tileGrid}>
        <View style={styles.tileRow}>
          <CategoryTile
            icon={VAULT_CATEGORIES.photo.icon}
            watermark={VAULT_CATEGORIES.photo.watermark}
            gradient={VAULT_CATEGORIES.photo.gradient}
            label="Photos"
            count={counts.photo}
            active={category === 'photo'}
            onPress={() => setCategory((c) => (c === 'photo' ? 'all' : 'photo'))}
          />
          <CategoryTile
            icon={VAULT_CATEGORIES.video.icon}
            watermark={VAULT_CATEGORIES.video.watermark}
            gradient={VAULT_CATEGORIES.video.gradient}
            label="Videos"
            count={counts.video}
            active={category === 'video'}
            onPress={() => setCategory((c) => (c === 'video' ? 'all' : 'video'))}
          />
        </View>
        <View style={styles.tileRow}>
          <CategoryTile
            icon={VAULT_CATEGORIES.document.icon}
            watermark={VAULT_CATEGORIES.document.watermark}
            gradient={VAULT_CATEGORIES.document.gradient}
            label="Documents"
            count={counts.document}
            active={category === 'document'}
            onPress={() => setCategory((c) => (c === 'document' ? 'all' : 'document'))}
          />
          <CategoryTile
            icon={VAULT_CATEGORIES.audio.icon}
            watermark={VAULT_CATEGORIES.audio.watermark}
            gradient={VAULT_CATEGORIES.audio.gradient}
            label="Audio"
            count={counts.audio}
            active={category === 'audio'}
            onPress={() => setCategory((c) => (c === 'audio' ? 'all' : 'audio'))}
          />
        </View>
      </View>

      <View style={styles.sectionRow}>
        <Ionicons name="folder-outline" size={23} color={palette.accent} />
        <View style={styles.sectionText}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Folders</Text>
          <Text style={[styles.sectionSubtitle, { color: palette.textSecondary }]} numberOfLines={2}>
            {folders.length > 0
              ? !premium.active && folders.length >= FREE_FOLDER_LIMIT
                ? `${folders.length} of ${FREE_FOLDER_LIMIT} — Premium unlocks unlimited`
                : `${folders.length} folder${folders.length === 1 ? '' : 's'}`
              : 'No folders yet — create one to group files.'}
          </Text>
        </View>
        <Pressable
          onPress={openNewFolderPrompt}
          accessibilityRole="button"
          accessibilityLabel="New folder"
          style={({ pressed }) => [
            styles.newButton,
            { backgroundColor: palette.accentWash },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="add" size={16} color={palette.accent} />
          <Text style={[styles.newButtonLabel, { color: palette.accent }]}>New</Text>
        </Pressable>
      </View>

      {folders.length > 0 && (
        <View style={[styles.folderCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
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
                  borderBottomColor: palette.border,
                },
                pressed && styles.pressed,
              ]}>
              <View style={styles.folderIcon}>
                <Ionicons name="folder" size={18} color={FOLDER_ICON} />
              </View>
              <View style={styles.folderText}>
                <Text style={[styles.folderName, { color: palette.text }]} numberOfLines={1}>
                  {folder.name}
                </Text>
                <Text style={[styles.folderMeta, { color: palette.textSecondary }]}>
                  {`${folderCounts.get(folder.id) ?? 0} item${
                    folderCounts.get(folder.id) === 1 ? '' : 's'
                  }`}
                </Text>
              </View>
              <Pressable
                onPress={() => setFolderSheet(folder)}
                hitSlop={Spacing.two}
                accessibilityRole="button"
                accessibilityLabel={`Actions for folder ${folder.name}`}>
                <Ionicons name="ellipsis-horizontal" size={16} color={palette.textSecondary} />
              </Pressable>
              <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.sectionRow}>
        <Ionicons name="grid-outline" size={23} color={palette.accent} />
        <View style={styles.sectionText}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>All Items</Text>
          <Text style={[styles.sectionSubtitle, { color: palette.textSecondary }]} numberOfLines={1}>
            {`${items.length} · ${formatBytes(totalSize)}`}
          </Text>
        </View>
        <View style={[styles.viewToggle, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Pressable
            onPress={() => setView('grid')}
            accessibilityRole="button"
            accessibilityLabel="Grid view"
            accessibilityState={{ selected: view === 'grid' }}
            style={[
              styles.toggleButton,
              view === 'grid' && { backgroundColor: palette.accentWash },
            ]}>
            <Ionicons
              name="grid"
              size={15}
              color={view === 'grid' ? palette.accent : palette.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={() => setView('list')}
            accessibilityRole="button"
            accessibilityLabel="List view"
            accessibilityState={{ selected: view === 'list' }}
            style={[
              styles.toggleButton,
              view === 'list' && { backgroundColor: palette.accentWash },
            ]}>
            <Ionicons
              name="list"
              size={16}
              color={view === 'list' ? palette.accent : palette.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyBox}>
          <SkeletonGrid columns={NUM_COLUMNS} rows={3} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyBox}>
          <Text style={[styles.emptyText, { color: palette.textSecondary }]}>{error}</Text>
        </View>
      );
    }
    if (items.length === 0 && (folders.length > 0 || !effectiveQuery)) {
      if (category !== 'all' || effectiveQuery) {
        return (
          <View style={styles.emptyBox}>
            <Ionicons name="search-outline" size={30} color={palette.textSecondary} />
            <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
              {effectiveQuery ? 'Nothing matches your search.' : 'No files in this category yet.'}
            </Text>
          </View>
        );
      }
      if (folders.length > 0) return null;
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="shield-checkmark-outline" size={34} color={palette.textSecondary} />
          <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
            Your vault is empty.{'\n'}Tap + to import photos, videos or documents — everything is
            encrypted on this device.
          </Text>
        </View>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* the light source in the top right corner */}
      <LinearGradient
        colors={[palette.glow, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.15, y: 0.55 }}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          key={`view-${view}`}
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={view === 'grid' ? NUM_COLUMNS : 1}
          columnWrapperStyle={view === 'grid' && items.length >= 1 ? styles.gridRow : undefined}
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
          renderItem={({ item }) =>
            view === 'grid' ? (
              <ItemTile
                item={item}
                size={columns}
                selectMode={selectMode}
                selected={selected?.has(item.id) ?? false}
                onPress={handleItemPress}
                onLongPress={handleItemLongPress}
                onMore={setItemSheet}
              />
            ) : (
              <VaultListRow
                item={item}
                selectMode={selectMode}
                selected={selected?.has(item.id) ?? false}
                onPress={handleItemPress}
                onLongPress={handleItemLongPress}
                onMore={setItemSheet}
              />
            )
          }
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
          if (prompt.mode === 'rename-folder') {
            if (prompt.folder) await renameFolder(getMasterKey(), prompt.folder.id, value);
          } else {
            await createFolder(getMasterKey(), value);
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
            icon: <Ionicons name="pencil-outline" size={18} color={palette.text} />,
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

      <ActionSheetModal
        visible={itemSheet !== null}
        title={itemSheet?.name}
        actions={[
          {
            label: 'Open',
            icon: <Ionicons name="open-outline" size={18} color={palette.text} />,
            onSelect: () => {
              if (itemSheet) handleItemPress(itemSheet);
            },
          },
          {
            label: 'Share',
            icon: <Ionicons name="share-outline" size={18} color={palette.text} />,
            onSelect: () => {
              if (itemSheet) void onShareItem(itemSheet);
            },
          },
          {
            label: 'Move to bin',
            destructive: true,
            icon: <Ionicons name="trash-outline" size={18} color="#EF4444" />,
            onSelect: () => {
              if (itemSheet) void onBinItem(itemSheet);
            },
          },
        ]}
        onClose={() => setItemSheet(null)}
      />
    </View>
  );
}

/** The list view of the same items: one row per file. */
function VaultListRow({
  item,
  selectMode,
  selected,
  onPress,
  onLongPress,
  onMore,
}: {
  item: VaultItem;
  selectMode: boolean;
  selected: boolean;
  onPress: (item: VaultItem) => void;
  onLongPress: (item: VaultItem) => void;
  onMore: (item: VaultItem) => void;
}) {
  const palette = useVaultPalette();
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      accessibilityRole={selectMode ? 'checkbox' : 'button'}
      accessibilityState={selectMode ? { checked: selected } : undefined}
      accessibilityLabel={item.name}
      style={({ pressed }) => [
        styles.listRow,
        { backgroundColor: palette.surface, borderColor: palette.border },
        pressed && styles.pressed,
      ]}>
      <Thumbnail item={item} size={46} radius={13} />
      <View style={styles.listRowText}>
        <Text style={[styles.listRowName, { color: palette.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.listRowMeta, { color: palette.textSecondary }]} numberOfLines={1}>
          {`${item.kind} · ${formatBytes(item.size)}`}
        </Text>
      </View>
      {selectMode ? (
        selected && (
          <View style={styles.listRowCheck}>
            <Ionicons name="checkmark" size={13} color="#FFFFFF" />
          </View>
        )
      ) : (
        <Pressable
          onPress={() => onMore(item)}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${item.name}`}>
          <Ionicons name="ellipsis-vertical" size={16} color={palette.textSecondary} />
        </Pressable>
      )}
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
  topGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 260,
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
    paddingBottom: Spacing.one,
  },
  tileGrid: {
    gap: Spacing.three - 2,
  },
  tileRow: {
    flexDirection: 'row',
    gap: Spacing.three - 2,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 2,
    paddingHorizontal: Spacing.one,
    marginTop: Spacing.one,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionText: {
    flex: 1,
    gap: 1,
  },
  sectionTitle: {
    fontFamily: Fonts.sansBold,
    fontSize: 16,
    lineHeight: 21,
  },
  sectionSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newButtonLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    padding: 3,
  },
  toggleButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
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
  folderName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
  folderMeta: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.two + 2,
    marginBottom: Spacing.two,
  },
  listRowText: {
    flex: 1,
    gap: 1,
  },
  listRowName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14.5,
  },
  listRowMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  listRowCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
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
    fontFamily: Fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.75,
  },
});
