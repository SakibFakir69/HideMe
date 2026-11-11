import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/vault/format';
import { SearchBar } from '@/components/vault/search-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fab } from '@/components/ui/fab';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { setBrowseList } from '@/lib/vault-browse';
import { searchItems, type VaultItem } from '@/lib/vault-store';

export default function FilesScreen() {
  const theme = useTheme();
  const { index, loading } = useVaultIndex();
  const [query, setQuery] = useState('');
  const effectiveQuery = useDebouncedValue(query, 250);

  const documents = useMemo(() => {
    if (!index) return [];
    // Everything that is not a photo or a video: documents and audio files.
    return searchItems(index, effectiveQuery.trim()).filter(
      (it) => it.kind === 'document' || it.kind === 'audio',
    );
  }, [index, effectiveQuery]);

  const totalBytes = useMemo(
    () => documents.reduce((n, it) => n + it.size, 0),
    [documents],
  );

  const open = useCallback(
    (item: VaultItem) => {
      // Remember what the user was looking at so the viewer can page
      // through the same set with a swipe.
      setBrowseList(documents.map((entry) => entry.id));
      router.push({ pathname: '/vault/item/[id]', params: { id: item.id } });
    },
    [documents],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <ThemedText type="subtitle" style={styles.title}>
                Files
              </ThemedText>
              <SearchBar value={query} onChange={setQuery} placeholder="Search files…" />
              <ThemedText type="code" themeColor="textSecondary">
                {`${documents.length} file${documents.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            loading ? undefined : (
              <View style={styles.emptyBox}>
                <Ionicons name="document-outline" size={30} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                  {effectiveQuery
                    ? 'Nothing matches your search.'
                    : 'No files yet.\nImport PDFs, text files, archives, audio and more.'}
                </ThemedText>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <View style={styles.iconCircle}>
                <Ionicons
                  name={item.kind === 'audio' ? 'musical-notes' : 'document-text'}
                  size={18}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.rowText}>
                <ThemedText type="small" numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                  {`${item.ext.replace('.', '').toUpperCase() || 'FILE'} · ${formatBytes(item.size)}`}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
        <Fab label="Import files" onPress={() => router.push('/vault/import')} />
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
    gap: Spacing.two,
    flexGrow: 1,
    // Keep the list aligned with the other vault screens on wide displays.
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerBlock: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: Fonts.sansBold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  separator: {
    height: 0,
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
  pressed: {
    opacity: 0.75,
  },
});
