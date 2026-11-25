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
import { Fonts, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import {
  MAX_CODE_LENGTH,
  MIN_CODE_LENGTH,
  setupDecoySecret,
} from '@/lib/vault-secret';

type Phase = 'verify' | 'new' | 'confirm' | 'busy';

interface DecoyPinModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Decoy-PIN setup: verify the real code → choose the decoy code → confirm.
 * The decoy gets its OWN master key, so a decoy session opens a separate,
 * empty-looking encrypted space. The decoy code must differ from the real one.
 */
export function DecoyPinModal({ visible, onClose }: DecoyPinModalProps) {
  const palette = useVaultPalette();
  const [phase, setPhase] = useState<Phase>('verify');
  const [entry, setEntry] = useState('');
  const [real, setReal] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<TextInputInstance | null>(null);

  // Reset the flow whenever the modal opens (adjust-state-during-render).
  const [prevOpen, setPrevOpen] = useState(visible);
  if (visible !== prevOpen) {
    setPrevOpen(visible);
    if (visible) {
      setPhase('verify');
      setEntry('');
      setReal('');
      setFirst('');
      setError('');
    }
  }

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, [visible]);

  const prompt =
    phase === 'verify'
      ? 'Confirm your real code to continue'
      : phase === 'new'
        ? 'Choose the decoy code'
        : 'Re-enter the decoy code';

  const submit = () => {
    if (phase === 'busy') return;
    if (entry.length < MIN_CODE_LENGTH || entry.length > MAX_CODE_LENGTH || !/^\d+$/.test(entry)) {
      setError(`Use ${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits.`);
      return;
    }
    setError('');
    if (phase === 'verify') {
      setReal(entry);
      setEntry('');
      setPhase('new');
      inputRef.current?.focus();
      return;
    }
    if (phase === 'new') {
      if (entry === real) {
        setError('The decoy code must be different from your real code.');
        return;
      }
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
      setError('Codes did not match — choose the decoy code again.');
      inputRef.current?.focus();
      return;
    }
    const decoyCode = entry;
    setPhase('busy');
    setEntry('');
    setupDecoySecret(decoyCode, real)
      .then(() => {
        onClose();
      })
      .catch((err: unknown) => {
        setPhase('verify');
        setReal('');
        setFirst('');
        setError(err instanceof Error ? err.message : 'Could not set the decoy code.');
        inputRef.current?.focus();
      });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <ThemedText type="smallBold">Decoy code</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {phase === 'busy' ? 'Creating the decoy vault…' : prompt}
          </ThemedText>

          <TextInput
            ref={inputRef}
            style={[styles.input, { color: palette.text, borderBottomColor: palette.surfaceHigh }]}
            value={entry}
            onChangeText={(next) => {
              setEntry(next.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH));
              setError('');
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={MAX_CODE_LENGTH}
            placeholder={'•'.repeat(MIN_CODE_LENGTH)}
            placeholderTextColor={palette.textSecondary}
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
                { backgroundColor: palette.surfaceHigh },
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
                  {phase === 'confirm' ? 'Set decoy' : 'Next'}
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
    fontFamily: Fonts.mono,
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
    backgroundColor: '#22C55E',
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
