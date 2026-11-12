import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImportProgressModal } from '@/components/vault/import-progress-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ListRow } from '@/components/ui/list-row';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultImport } from '@/hooks/use-vault-import';
import { useVaultIndex } from '@/hooks/use-vault-index';

export default function ImportScreen() {
  const theme = useTheme();
  const { refresh } = useVaultIndex();
  const { busy, state, cancel, dismiss, importAssets } = useVaultImport(async (outcome) => {
    await refresh();
    // A cancelled import keeps the screen open so another source can be
    // picked; a finished one goes back to the vault.
    if (outcome.status === 'completed') router.back();
  });

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <ScreenHeader title="Import Files" onBack={() => router.back()} />

          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <ListRow
              icon="images"
              iconColor="#8B5CF6"
              title="Photos & Videos"
              subtitle="From your photo library"
              divider
              disabled={busy}
              onPress={() => void importAssets('media', null)}
            />
            <ListRow
              icon="musical-notes"
              iconColor="#EC4899"
              title="Audio"
              subtitle="MP3, WAV, M4A, etc."
              divider
              disabled={busy}
              onPress={() => void importAssets('audio', null)}
            />
            <ListRow
              icon="document-text"
              iconColor="#10B981"
              title="Documents & other files"
              subtitle="PDF, TXT, ZIP, APK, etc."
              disabled={busy}
              onPress={() => void importAssets('document', null)}
            />
          </View>

          <View style={styles.note}>
            <Ionicons name="lock-closed" size={14} color={theme.textSecondary} />
            <ThemedText type="code" themeColor="textSecondary" style={styles.noteText}>
              Everything is encrypted on this device before it is added — nothing is uploaded.
            </ThemedText>
          </View>
        </View>
      </SafeAreaView>

      <ImportProgressModal state={state} onCancel={cancel} onDismiss={dismiss} />
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.four,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  noteText: {
    flex: 1,
    lineHeight: 17,
  },
});
