import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ConfirmTypedModalProps {
  visible: boolean;
  title: string;
  message: string;
  /** The word the user has to type to unlock the destructive button. */
  phrase: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

/**
 * A destructive action that has to be confirmed by typing a word
 * (DESIGN.md §5.6: "Erase all with a typed confirmation").
 *
 * The button stays disabled until the phrase matches, so the action can
 * never be triggered by a stray tap on a modal.
 */
export function ConfirmTypedModal({
  visible,
  title,
  message,
  phrase,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmTypedModalProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the form whenever the modal opens (adjust-state-during-render
  // pattern — avoids setState-in-effect).
  const [prevOpen, setPrevOpen] = useState(visible);
  if (visible !== prevOpen) {
    setPrevOpen(visible);
    if (visible) {
      setText('');
      setBusy(false);
    }
  }

  const matches = text.trim().toUpperCase() === phrase.toUpperCase();

  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {message}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Type <ThemedText type="smallBold">{phrase}</ThemedText> to confirm.
          </ThemedText>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderBottomColor: theme.backgroundSelected },
            ]}
            value={text}
            onChangeText={setText}
            placeholder={phrase}
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void confirm()}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.backgroundSelected },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="small">Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => void confirm()}
              disabled={!matches || busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.submit,
                pressed && styles.pressed,
                (!matches || busy) && styles.disabled,
              ]}>
              <ThemedText type="small" style={styles.submitText}>
                {busy ? 'Working…' : confirmLabel}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    gap: Spacing.three,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  input: {
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    letterSpacing: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 36,
    justifyContent: 'center',
  },
  submit: {
    backgroundColor: Palette.error,
  },
  submitText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.45,
  },
});
