import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import type { File } from 'expo-file-system';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheetModal, type SheetAction } from '@/components/vault/action-sheet-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { PhotoRow, usePhotoRows } from '@/components/vault/photo-grid';
import { SelectionBar } from '@/components/vault/selection-bar';
import { SkeletonGrid } from '@/components/vault/skeleton-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { Fab } from '@/components/ui/fab';
import { SectionTitle } from '@/components/ui/section-title';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { GRID_GAP } from '@/hooks/use-grid-columns';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { canSaveAs, saveExportAs } from '@/lib/export-save';
import { exportItemsToZip } from '@/lib/export-zip';
import { sharePreparedFile } from '@/lib/share';
import { showToast } from '@/lib/toast';
import { setBrowseList } from '@/lib/vault-browse';
import { getMasterKey } from '@/lib/vault-session';
import { moveItemsToBin, restoreItems, searchItems, type VaultItem } from '@/lib/vault-store';

const NUM_COLUMNS = 3;

type MediaFilter = 'all' | 'photo' | 'video';

export default function GalleryScreen() {
  const theme = useTheme();
  const { index, loading } = useVaultIndex();
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [sharing, setSharing] = useState(false);
  const [exported, setExported] = useState<{ file: File; name: string; count: number } | null>(null);
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const selectMode = selected !== null;

  const items = useMemo(() => {
    if (!index) return [];
    // The gallery is photos and videos; audio and documents live in the
    // vault home grid.
    const media = searchItems(index, '').filter(
      (it) => it.kind === 'photo' || it.kind === 'video',
    );
    return filter === 'all' ? media : media.filter((it) => it.kind === filter);
  }, [index, filter]);

  // The grid keeps the real photo ratio: every row is justified to the full
  // width, so the tiles are not a uniform square crop.
  const rows = usePhotoRows(items, NUM_COLUMNS);

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

  const handlePress = useCallback(
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

  const handleLongPress = useCallback((item: VaultItem) => {
    setSelected(new Set([item.id]));
  }, []);

  const onDeleteSelected = async () => {
    if (!selected || selected.size === 0) return;
    const ids = [...selected];
    const n = ids.length;
    const ok = await confirmDestructive(
      'Move to bin',
      `${n} file${n === 1 ? '' : 's'} will be kept in Recently deleted for 30 days.`,
    );
    if (!ok) return;
    try {
      await moveItemsToBin(getMasterKey(), ids);
      setSelected(null);
      Alert.alert('Moved to bin', `${n} file${n === 1 ? '' : 's'} moved to Recently deleted.`, [
        {
          text: 'Undo',
          onPress: () => {
            restoreItems(getMasterKey(), ids).catch((err) =>
              Alert.alert('Could not restore', err instanceof Error ? err.message : String(err)),
            );
          },
        },
        { text: 'OK', style: 'cancel' },
      ]);
    } catch (err) {
      Alert.alert('Could not delete', err instanceof Error ? err.message : String(err));
    }
  };

  const onShareSelected = async () => {
    if (!selected || selected.size === 0 || !index) return;
    const chosen = index.items.filter((item) => selected.has(item.id));
    if (chosen.length === 0) return;
    setSharing(true);
    try {
      const result = await exportItemsToZip(chosen);
      if (result.status !== 'ok') {
        Alert.alert(
          result.status === 'too-large' ? 'Export too large' : 'Could not export',
          result.message,
        );
        return;
      }
      // The archive is ready: let the user send it somewhere or write it to a
      // place they own.
      setExported({ file: result.file, name: result.name, count: result.count });
      setExportSheetOpen(true);
    } catch (err) {
      Alert.alert('Could not export', err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  };

  const onExportShare = useCallback(async () => {
    if (!exported) return;
    const shared = await sharePreparedFile(exported.file, {
      mime: 'application/zip',
      title: `Share ${exported.count} file${exported.count === 1 ? '' : 's'}`,
    });
    if (shared === 'unavailable') {
      Alert.alert('Sharing isn’t available', 'This build can’t open the system share sheet.');
    } else if (shared === 'failed') {
      Alert.alert('Could not share', 'The archive could not be handed to another app.');
    }
  }, [exported]);

  const onExportSave = useCallback(async () => {
    if (!exported) return;
    const result = await saveExportAs(exported.file, exported.name, 'application/zip');
    if (result === 'unavailable') {
      Alert.alert('Saving isn’t available', 'This build can’t write to a chosen location.');
    } else if (result === 'failed') {
      Alert.alert('Could not save', 'The archive could not be written to that location.');
    } else if (result === 'saved') {
      showToast(`Saved ${exported.name}`, 'success');
    }
  }, [exported]);

  const exportActions: SheetAction[] = useMemo(() => {
    if (!exported) return [];
    const actions: SheetAction[] = [
      {
        label: 'Share archive',
        icon: <Ionicons name="share-outline" size={18} color={theme.text} />,
        onSelect: () => void onExportShare(),
      },
    ];
    if (canSaveAs()) {
      actions.push({
        label: 'Save to a file…',
        icon: <Ionicons name="save-outline" size={18} color={theme.text} />,
        onSelect: () => void onExportSave(),
      });
    }
    return actions;
  }, [exported, onExportSave, onExportShare, theme.text]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          key={`cols-${NUM_COLUMNS}`}
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={[styles.listContent, selectMode && styles.listContentSelecting]}
          style={styles.listFlex}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.toolbarRow}>
                <ThemedText type="subtitle" style={styles.title}>
                  Gallery
                </ThemedText>
                {items.length > 0 && (
                  <ThemedText
                    type="small"
                    style={styles.selectAction}
                    onPress={() => setSelected(selectMode ? null : new Set())}>
                    {selectMode ? 'Cancel' : 'Select'}
                  </ThemedText>
                )}
              </View>
              <View style={styles.chips}>
                <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
                <Chip
                  label="Photos"
                  active={filter === 'photo'}
                  onPress={() => setFilter('photo')}
                />
                <Chip
                  label="Videos"
                  active={filter === 'video'}
                  onPress={() => setFilter('video')}
                />
              </View>
              <SectionTitle
                label={`${items.length} item${items.length === 1 ? '' : 's'}`}
              />
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <SkeletonGrid columns={NUM_COLUMNS} rows={3} />
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="images-outline" size={30} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  No photos or videos yet.{'\n'}Tap + to import them — everything is encrypted on
                  this device.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item: row }) => (
            <PhotoRow
              row={row}
              selectMode={selectMode}
              isSelected={(id) => selected?.has(id) ?? false}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
          )}
          initialNumToRender={6}
          windowSize={7}
          removeClippedSubviews
        />
        {selectMode && selected.size > 0 && (
          <SelectionBar
            count={selected.size}
            total={items.length}
            onCancel={() => setSelected(null)}
            onSelectAll={() => setSelected(new Set(items.map((it) => it.id)))}
            onMove={undefined}
            onShare={sharing ? undefined : () => void onShareSelected()}
            onDelete={() => void onDeleteSelected()}
          />
        )}
        {!selectMode && <Fab label="Import files" onPress={() => router.push('/vault/import')} />}
      </SafeAreaView>

      <ActionSheetModal
        visible={exportSheetOpen}
        title={exported ? `${exported.count} file${exported.count === 1 ? '' : 's'} exported` : undefined}
        subtitle={exported?.name}
        actions={exportActions}
        onClose={() => setExportSheetOpen(false)}
      />
    </ThemedView>
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
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: Fonts.sansBold,
  },
  selectAction: {
    color: '#818CF8',
    fontFamily: Fonts.sansBold,
    fontSize: 15,
    paddingHorizontal: Spacing.one,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
