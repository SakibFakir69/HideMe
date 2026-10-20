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
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface NamePromptModalProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}

export function NamePromptModal({
  visible,
  title,
  placeholder,
  initialValue = '',
  submitLabel = 'Save',
  onSubmit,
  onClose,
}: NamePromptModalProps) {
  const theme = useTheme();
  const [text, setText] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset form state whenever the modal opens (adjust-state-during-render
  // pattern — avoids setState-in-effect).
  const [prevOpen, setPrevOpen] = useState(visible);
  if (visible !== prevOpen) {
    setPrevOpen(visible);
    if (visible) {
      setText(initialValue);
      setError('');
      setBusy(false);
    }
  }

  const submit = async () => {
    const value = text.trim();
    if (value.length === 0 || busy) {
      if (value.length === 0) setError('Enter a name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
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
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderBottomColor: theme.backgroundSelected },
            ]}
            value={text}
            onChangeText={(next) => {
              setText(next);
              setError('');
            }}
            placeholder={placeholder}
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCapitalize="sentences"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
            {error}
          </ThemedText>
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
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.submit,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}>
              <ThemedText type="small" style={styles.submitText}>
                {busy ? 'Working…' : submitLabel}
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
    fontSize: 16,
    fontWeight: 500,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  error: {
    minHeight: 18,
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
    backgroundColor: '#208AEF',
  },
  submitText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
