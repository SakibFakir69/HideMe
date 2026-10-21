import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalcKey } from '@/components/calc-key';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_CODE_LENGTH, MIN_CODE_LENGTH, hasSecret, setupSecretCode } from '@/lib/vault-secret';
import { unlock } from '@/lib/vault-session';

type Phase = 'checking' | 'entry' | 'confirm' | 'already-set' | 'working';

interface FormState {
  phase: Phase;
  first: string;
  entry: string;
  message: string;
}

const DIGIT_KEYS: { label: string; span?: number }[][] = [
  [{ label: '1' }, { label: '2' }, { label: '3' }],
  [{ label: '4' }, { label: '5' }, { label: '6' }],
  [{ label: '7' }, { label: '8' }, { label: '9' }],
  [{ label: '⌫' }, { label: '0', span: 2 }],
];

export default function SetupSecretScreen() {
  const theme = useTheme();
  const [form, setForm] = useState<FormState>({
    phase: 'checking',
    first: '',
    entry: '',
    message: '',
  });

  useEffect(() => {
    hasSecret().then((exists) =>
      setForm((f) => ({ ...f, phase: exists ? 'already-set' : 'entry' })),
    );
  }, []);

  const append = (digit: string) => {
    setForm((f) => {
      if (f.phase !== 'entry' && f.phase !== 'confirm') return f;
      return {
        ...f,
        message: '',
        entry: f.entry.length >= MAX_CODE_LENGTH ? f.entry : f.entry + digit,
      };
    });
  };

  const backspace = () => {
    setForm((f) => {
      if (f.phase !== 'entry' && f.phase !== 'confirm') return f;
      return { ...f, message: '', entry: f.entry.slice(0, -1) };
    });
  };

  const commit = () => {
    setForm((f) => {
      if (f.phase !== 'entry' && f.phase !== 'confirm') return f;
      if (f.entry.length < MIN_CODE_LENGTH) {
        return { ...f, message: `Use at least ${MIN_CODE_LENGTH} digits.` };
      }
      if (f.phase === 'entry') {
        return { ...f, first: f.entry, entry: '', message: '', phase: 'confirm' };
      }
      if (f.entry !== f.first) {
        return {
          ...f,
          first: '',
          entry: '',
          message: 'Codes did not match — start over.',
          phase: 'entry',
        };
      }
      return { ...f, phase: 'working', message: '' };
    });
  };

  useEffect(() => {
    if (form.phase !== 'working') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Surface a real hang (e.g. emulator Keystore stalling) instead of an
    // endless "Securing…". Normal phones finish in 1–2s, well under 90s.
    const raced = Promise.race([
      setupSecretCode(form.entry),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                'Securing took too long. If you are on an emulator, try a physical device; otherwise retry.',
              ),
            ),
          90_000,
        );
      }),
    ]);
    raced.then(
      (masterKey) => {
        if (cancelled) return;
        unlock(masterKey);
        router.replace('/vault');
      },
      (error) => {
        if (cancelled) return;
        setForm({
          phase: 'entry',
          first: '',
          entry: '',
          message: error instanceof Error ? error.message : 'Could not save the code.',
        });
      },
    );
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [form.phase, form.entry]);

  const phase = form.phase;
  const entry = form.entry;
  const message = form.message;
  const prompt = phase === 'confirm' ? 'Re-enter to confirm' : 'Choose your secret code';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.inner}>
          <ThemedText type="subtitle" style={styles.title}>
            Vault setup
          </ThemedText>
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.subtitle}>
            {phase === 'already-set'
              ? 'A secret code is already configured.'
              : phase === 'working'
                ? 'Securing your code…'
                : `${prompt} (${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits)`}
          </ThemedText>

          <View style={[styles.codeBox, { borderBottomColor: theme.backgroundSelected }]}>
            <Text
              style={[styles.codeText, { color: theme.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {phase === 'already-set'
                ? '••••••'
                : entry.length > 0
                  ? '•'.repeat(entry.length)
                  : ' '}
            </Text>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {message}
          </ThemedText>

          {phase === 'already-set' ? (
            <Pressable
              onPress={() => router.replace('/calculator-disguise')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.doneButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="link">Open calculator</ThemedText>
            </Pressable>
          ) : (
            <View
              style={[
                styles.keypad,
                { backgroundColor: theme.backgroundSelected, opacity: phase === 'entry' || phase === 'confirm' ? 1 : 0.4 },
              ]}>
              {DIGIT_KEYS.map((row, rowIndex) => (
                <View
                  key={rowIndex}
                  style={[styles.row, { backgroundColor: theme.background }]}>
                  {row.map((key) =>
                    key.label === '⌫' ? (
                      <CalcKey
                        key="back"
                        label="⌫"
                        variant="fn"
                        onPress={backspace}
                      />
                    ) : (
                      <CalcKey
                        key={key.label}
                        label={key.label}
                        variant="digit"
                        span={key.span}
                        onPress={() => append(key.label)}
                      />
                    ),
                  )}
                </View>
              ))}
              <View style={[styles.row, { backgroundColor: theme.background }]}>
                <CalcKey label="Set" variant="accent" span={4} onPress={commit} />
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const LINE = 1;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  inner: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
    marginTop: Spacing.four,
  },
  subtitle: {
    textAlign: 'center',
  },
  codeBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.two,
  },
  codeText: {
    fontFamily: Fonts.mono,
    fontSize: 32,
    letterSpacing: 4,
  },
  message: {
    textAlign: 'center',
    minHeight: 20,
  },
  keypad: {
    flex: 1,
    gap: LINE,
    padding: LINE,
    justifyContent: 'flex-end',
    marginBottom: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    gap: LINE,
    minHeight: 56,
  },
  doneButton: {
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
    marginTop: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
