import { Modal, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ImportProgress } from '@/lib/vault-store';

interface ImportProgressModalProps {
  progress: ImportProgress | null;
}

export function ImportProgressModal({ progress }: ImportProgressModalProps) {
  const theme = useTheme();
  const visible = progress !== null;
  const percent = Math.round((progress?.fraction ?? 0) * 100);
  const fileLabel =
    progress?.phase ??
    (progress && progress.fileCount > 0
      ? `Encrypting file ${Math.min(progress.fileIndex + 1, progress.fileCount)} of ${progress.fileCount}`
      : 'Encrypting…');

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Adding to vault</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {fileLabel}
          </ThemedText>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <ThemedText type="code" themeColor="textSecondary">
            {percent}%
          </ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#208AEF',
    borderRadius: 4,
  },
});
