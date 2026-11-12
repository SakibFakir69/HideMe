import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/gradient-button';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ImportJobState } from '@/hooks/use-vault-import';

interface ImportProgressModalProps {
  /** null when no import is running. */
  state: ImportJobState | null;
  /** Asks the running import to stop. */
  onCancel: () => void;
  /** Closes the modal after the import reached a final state. */
  onDismiss: () => void;
}

/**
 * Progress of an import.
 *
 * The modal stays up until the import reached a final state: cancelling
 * shows what is happening, and the cancelled / completed / failed states
 * report what ended up in the vault before the user closes it.
 */
export function ImportProgressModal({ state, onCancel, onDismiss }: ImportProgressModalProps) {
  const theme = useTheme();
  const visible = state !== null;
  if (!state) return null;

  const percent = Math.round(state.fraction * 100);
  const importing = state.status === 'importing';
  const cancelling = state.status === 'cancelling';
  const running = importing || cancelling;

  const title = (() => {
    switch (state.status) {
      case 'importing':
        return 'Adding to vault';
      case 'cancelling':
        return 'Cancelling…';
      case 'cancelled':
        return 'Import cancelled';
      case 'completed':
        return 'Import complete';
      case 'failed':
        return 'Import failed';
    }
  })();

  const subtitle = (() => {
    switch (state.status) {
      case 'importing':
      case 'cancelling':
        return state.total > 0
          ? `Encrypting file ${Math.min(state.completed + 1, state.total)} of ${state.total}`
          : 'Preparing…';
      case 'cancelled':
        return state.completed > 0
          ? `${state.completed} of ${state.total} file${state.total === 1 ? '' : 's'} were added to your vault.`
          : 'No files were added to your vault.';
      case 'completed':
        return `${state.completed} file${state.completed === 1 ? '' : 's'} added to your vault.`;
      case 'failed':
        return state.completed > 0
          ? `${state.message ?? 'The import could not be finished.'}\n${state.completed} file${state.completed === 1 ? '' : 's'} stayed in your vault.`
          : (state.message ?? 'The import could not be finished.');
    }
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // While the import runs the modal must not go away — the cleanup is
      // still in flight. Afterwards the back button closes it.
      onRequestClose={running ? () => {} : onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.headerRow}>
            <ThemedText type="smallBold">{title}</ThemedText>
            {running && (
              <ActivityIndicator size="small" color={theme.tint} />
            )}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>

          {running && (
            <>
              <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.fill, { width: `${Math.max(2, percent)}%` }]} />
              </View>
              <View style={styles.metaRow}>
                <ThemedText type="code" themeColor="textSecondary">
                  {percent}%
                </ThemedText>
                {state.currentName ? (
                  <ThemedText
                    type="code"
                    themeColor="textSecondary"
                    numberOfLines={1}
                    style={styles.fileName}>
                    {state.currentName}
                  </ThemedText>
                ) : null}
              </View>
            </>
          )}

          {running ? (
            <Pressable
              onPress={onCancel}
              // Only the first tap does anything — the button is disabled
              // while the batch is stopping.
              disabled={cancelling}
              accessibilityRole="button"
              accessibilityLabel="Cancel import"
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: theme.border },
                pressed && styles.pressed,
                cancelling && styles.disabled,
              ]}>
              <Ionicons
                name="close-circle-outline"
                size={16}
                color={cancelling ? theme.textSecondary : theme.text}
              />
              <ThemedText type="small" style={styles.cancelLabel}>
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </ThemedText>
            </Pressable>
          ) : (
            <GradientButton label="Done" onPress={onDismiss} style={styles.doneButton} />
          )}
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
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: Spacing.one,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#6366F1',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  fileName: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cancelLabel: {
    fontFamily: Fonts.sansSemiBold,
  },
  doneButton: {
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
