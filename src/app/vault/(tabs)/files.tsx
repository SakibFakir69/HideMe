import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatBytes } from '@/components/vault/format';
import { AdBanner } from '@/components/vault/ad-banner';
import { SearchBar } from '@/components/vault/search-bar';
import { VaultHeader } from '@/components/vault/vault-header';
import { Fab } from '@/components/ui/fab';
import { VAULT_ACCENTS } from '@/constants/vault-theme';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { setBrowseList } from '@/lib/vault-browse';
import { searchItems, type VaultItem } from '@/lib/vault-store';

export default function FilesScreen() {
  const palette = useVaultPalette();
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
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <VaultHeader
                icon="document-text"
                gradient={VAULT_ACCENTS.emerald.gradient}
                title="Files"
                subtitle="Your private documents"
              />
              <SearchBar value={query} onChange={setQuery} placeholder="Search files…" />
              <Text style={[styles.meta, { color: palette.textSecondary }]}>
                {`${documents.length} file${documents.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
              </Text>
            </View>
          }
          ListEmptyComponent={
            loading ? undefined : (
              <View style={styles.emptyBox}>
                <Ionicons name="document-outline" size={30} color={palette.textSecondary} />
                <Text style={[styles.emptyText, { color: palette.textSecondary }]}>
                  {effectiveQuery
                    ? 'Nothing matches your search.'
                    : 'No files yet.\nImport PDFs, text files, archives, audio and more.'}
                </Text>
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
                { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor:
                      item.kind === 'audio' ? VAULT_ACCENTS.violet.wash : VAULT_ACCENTS.emerald.wash,
                  },
                ]}>
                <Ionicons
                  name={item.kind === 'audio' ? 'musical-notes' : 'document-text'}
                  size={18}
                  color={item.kind === 'audio' ? VAULT_ACCENTS.violet.bright : VAULT_ACCENTS.emerald.bright}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: palette.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowMeta, { color: palette.textSecondary }]} numberOfLines={1}>
                  {`${item.ext.replace('.', '').toUpperCase() || 'FILE'} · ${formatBytes(item.size)}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={<AdBanner />}
        />
        <Fab accent="emerald" label="Import files" onPress={() => router.push('/vault/import')} />
      </SafeAreaView>
    </View>
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
  meta: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  rowMeta: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
  },
  separator: {
    height: Spacing.two,
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
    fontFamily: Fonts.sans,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.75,
  },
});
