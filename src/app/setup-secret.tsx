import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalcKey } from '@/components/calc-key';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandGradient, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mark } from '@/lib/perf';
import {
  MAX_CODE_LENGTH,
  MIN_CODE_LENGTH,
  hasSecret,
  isBiometricAvailable,
  setupSecretCode,
  setBiometricEnabled,
} from '@/lib/vault-secret';
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

const BIOMETRIC_LABEL = Platform.OS === 'ios' ? 'Face ID' : 'fingerprint';

export default function SetupSecretScreen() {
  const theme = useTheme();
  const [form, setForm] = useState<FormState>({
    phase: 'checking',
    first: '',
    entry: '',
    message: '',
  });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOptIn, setBiometricOptIn] = useState(true);

  useEffect(() => {
    let mounted = true;
    // A rejected/hung store read must not leave the screen stuck on "checking".
    hasSecret()
      .then((exists) => {
        if (mounted) setForm((f) => ({ ...f, phase: exists ? 'already-set' : 'entry' }));
      })
      .catch(() => {
        if (mounted) setForm((f) => ({ ...f, phase: 'entry' }));
      });
    void isBiometricAvailable().then((available) => {
      if (mounted) setBiometricAvailable(available);
    });
    return () => {
      mounted = false;
    };
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
        return {
          ...f,
          message: `Use at least ${MIN_CODE_LENGTH} digits — ${MIN_CODE_LENGTH - f.entry.length} to go.`,
        };
      }
      if (f.phase === 'entry') {
        return { ...f, first: f.entry, entry: '', message: '', phase: 'confirm' };
      }
      if (f.entry !== f.first) {
        // The first code is still valid: only the confirmation has to be
        // retyped, so the user never re-enters 6–12 digits from scratch.
        return {
          ...f,
          entry: '',
          message: 'Codes did not match — enter it once more.',
          phase: 'confirm',
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
      async (masterKey) => {
        if (cancelled) return;
        // The master key only exists in memory right now, so this is the one
        // moment the biometric slot can be filled with it.
        if (biometricOptIn) {
          try {
            await setBiometricEnabled(true, masterKey);
          } catch {
            // Biometrics are a convenience — the code still opens the vault.
          }
        }
        if (cancelled) return;
        unlock(masterKey);
        mark('setup.done');
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
  }, [form.phase, form.entry, biometricOptIn]);

  const phase = form.phase;
  const entry = form.entry;
  const message = form.message;
  const prompt = phase === 'confirm' ? 'Re-enter to confirm' : 'Choose your secret code';
  const emptySlots = Math.max(0, MIN_CODE_LENGTH - entry.length);
  const actionLabel = phase === 'confirm' ? 'Confirm' : 'Set';
  const subtitle =
    phase === 'already-set'
      ? 'A secret code is already configured.'
      : phase === 'working'
        ? 'Securing your code…'
        : `${prompt} (${MIN_CODE_LENGTH}-${MAX_CODE_LENGTH} digits)`;
  const hint =
    message ||
    (phase === 'entry' || phase === 'confirm'
      ? `${entry.length} of at least ${MIN_CODE_LENGTH} digits`
      : '');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.inner}>
          <View style={styles.titleRow}>
            <LinearGradient
              colors={[...BrandGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandBadge}>
              <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
            </LinearGradient>
            <ThemedText type="subtitle" style={styles.title}>
              Vault setup
            </ThemedText>
          </View>

          <View style={styles.subtitleRow}>
            {phase === 'working' && <ActivityIndicator size="small" color={theme.tint} />}
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          </View>

          <View style={[styles.codeBox, { borderBottomColor: theme.backgroundSelected }]}>
            <Text
              style={[styles.codeText, { color: theme.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {phase === 'already-set'
                ? '••••••'
                : entry.length > 0
                  ? '•'.repeat(entry.length)
                  : ''}
              {phase !== 'already-set' && emptySlots > 0 ? (
                <Text style={{ color: theme.textSecondary }}>{'•'.repeat(emptySlots)}</Text>
              ) : null}
            </Text>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {hint}
          </ThemedText>

          {biometricAvailable && phase !== 'already-set' && (
            <View style={[styles.biometricRow, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="finger-print" size={18} color={theme.textSecondary} />
              <ThemedText type="small" style={styles.biometricLabel}>
                Also unlock with {BIOMETRIC_LABEL}
              </ThemedText>
              <Switch
                value={biometricOptIn}
                onValueChange={setBiometricOptIn}
                disabled={phase === 'working'}
                accessibilityLabel={`Also unlock with ${BIOMETRIC_LABEL}`}
                trackColor={{ true: theme.tint, false: theme.backgroundSelected }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={15} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.warningText}>
              Choose something memorable. If you lose this code, your files cannot be recovered.
            </ThemedText>
          </View>

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
                        minHeight={KEY_HEIGHT}
                        onPress={backspace}
                      />
                    ) : (
                      <CalcKey
                        key={key.label}
                        label={key.label}
                        variant="digit"
                        span={key.span}
                        minHeight={KEY_HEIGHT}
                        onPress={() => append(key.label)}
                      />
                    ),
                  )}
                </View>
              ))}
              <View style={[styles.row, { backgroundColor: theme.background }]}>
                <CalcKey
                  label={actionLabel}
                  variant="accent"
                  span={4}
                  minHeight={KEY_HEIGHT}
                  onPress={commit}
                />
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const LINE = 1;
/**
 * Shorter than the calculator disguise's keys: this screen carries extra rows
 * (biometric opt-in, recovery warning) and has to fit on short screens.
 */
const KEY_HEIGHT = 52;

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  brandBadge: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
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
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  biometricLabel: {
    flex: 1,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
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
    minHeight: KEY_HEIGHT,
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
