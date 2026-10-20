import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_CODE_LENGTH, MIN_CODE_LENGTH, changeSecretCode } from '@/lib/vault-secret';

type Phase = 'old' | 'new' | 'confirm' | 'busy';

interface ChangeCodeModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Change-code flow: current code → new code → confirm, one PBKDF2 pass at the
 * end (changeSecretCode re-wraps the master key; files stay untouched).
 */
export function ChangeCodeModal({ visible, onClose }: ChangeCodeModalProps) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('old');
  const [entry, setEntry] = useState('');
  const [old, setOld] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<TextInputInstance | null>(null);

  // Reset the flow whenever the modal opens (adjust-state-during-render).
  const [prevOpen, setPrevOpen] = useState(visible);
  if (visible !== prevOpen) {
    setPrevOpen(visible);
    if (visible) {
      setPhase('old');
      setEntry('');
      setOld('');
      setFirst('');
      setError('');
    }
  }

  useEffect(() => {
    if (!visible) return;
    // focus after the modal animation
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [visible]);

  const prompt =
    phase === 'old'
      ? 'Enter your current code'
      : phase === 'new'
        ? 'Enter a new code'
        : 'Re-enter the new code';

  const submit = () => {
    if (phase === 'busy') return;
    if (entry.length < MIN_CODE_LENGTH || entry.length > MAX_CODE_LENGTH || !/^\d+$/.test(entry)) {
      setError(`Use ${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits.`);
      return;
    }
    setError('');
    if (phase === 'old') {
      setOld(entry);
      setEntry('');
      setPhase('new');
      inputRef.current?.focus();
      return;
    }
    if (phase === 'new') {
      setFirst(entry);
      setEntry('');
      setPhase('confirm');
      inputRef.current?.focus();
      return;
    }
    if (entry !== first) {
      setEntry('');
      setFirst('');
      setPhase('new');
      setError('Codes did not match — choose the new code again.');
      inputRef.current?.focus();
      return;
    }
    const newCode = entry;
    setPhase('busy');
    setEntry('');
    changeSecretCode(old, newCode)
      .then(() => {
        onClose();
      })
      .catch((err: unknown) => {
        setPhase('old');
        setOld('');
        setFirst('');
        setError(err instanceof Error ? err.message : 'Could not change the code.');
        inputRef.current?.focus();
      });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Change secret code</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {phase === 'busy' ? 'Re-encrypting your key…' : prompt}
          </ThemedText>

          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.text, borderBottomColor: theme.backgroundSelected }]}
            value={entry}
            onChangeText={(next) => {
              setEntry(next.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH));
              setError('');
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={MAX_CODE_LENGTH}
            placeholder={'•'.repeat(MIN_CODE_LENGTH)}
            placeholderTextColor={theme.textSecondary}
            editable={phase !== 'busy'}
            onSubmitEditing={submit}
            returnKeyType="done"
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.error}>
            {error}
          </ThemedText>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              disabled={phase === 'busy'}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.backgroundSelected },
                pressed && styles.pressed,
                phase === 'busy' && styles.disabled,
              ]}>
              <ThemedText type="small">Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={phase === 'busy'}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.submit,
                pressed && styles.pressed,
                phase === 'busy' && styles.disabled,
              ]}>
              {phase === 'busy' ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <ThemedText type="small" style={styles.submitText}>
                  {phase === 'confirm' ? 'Change' : 'Next'}
                </ThemedText>
              )}
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
    fontSize: 22,
    letterSpacing: 4,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
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
    alignItems: 'center',
    minWidth: 92,
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
