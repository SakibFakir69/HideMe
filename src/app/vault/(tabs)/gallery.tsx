import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Dimensions, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmDestructive } from '@/components/vault/confirm';
import { ItemTile } from '@/components/vault/item-tile';
import { SelectionBar } from '@/components/vault/selection-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Chip } from '@/components/ui/chip';
import { Fab } from '@/components/ui/fab';
import { SectionTitle } from '@/components/ui/section-title';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getMasterKey } from '@/lib/vault-session';
import { moveItemsToBin, restoreItems, searchItems, type VaultItem } from '@/lib/vault-store';

const NUM_COLUMNS = 3;
const GRID_GAP = Spacing.two;

type MediaFilter = 'all' | 'photo' | 'video';

export default function GalleryScreen() {
  const theme = useTheme();
  const { index, loading } = useVaultIndex();
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const selectMode = selected !== null;

  const items = useMemo(() => {
    if (!index) return [];
    const media = searchItems(index, '').filter((it) => it.kind !== 'document');
    return filter === 'all' ? media : media.filter((it) => it.kind === filter);
  }, [index, filter]);

  const columns = useMemo(() => {
    const width = Dimensions.get('window').width;
    const usable = Math.min(width, MaxContentWidth) - Spacing.three * 2;
    return Math.floor((usable - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);
  }, []);

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
      if (selectMode) toggleSelect(item.id);
      else router.push({ pathname: '/vault/item/[id]', params: { id: item.id } });
    },
    [selectMode, toggleSelect],
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          key={`cols-${NUM_COLUMNS}`}
          data={items}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={items.length >= 1 ? styles.gridRow : undefined}
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
            loading ? undefined : (
              <View style={styles.emptyBox}>
                <Ionicons name="images-outline" size={30} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  No photos or videos yet.{'\n'}Tap + to import them — everything is encrypted on
                  this device.
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <ItemTile
              item={item}
              size={columns}
              selectMode={selectMode}
              selected={selected?.has(item.id) ?? false}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
          )}
          initialNumToRender={12}
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
            onDelete={() => void onDeleteSelected()}
          />
        )}
        {!selectMode && <Fab label="Import files" onPress={() => router.push('/vault/import')} />}
      </SafeAreaView>
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
