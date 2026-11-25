import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalcKey } from '@/components/calc-key';
import { ThemedText } from '@/components/themed-text';
import {
  VAULT_ACCENTS,
} from '@/constants/vault-theme';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { biometricLabel, t } from '@/lib/i18n';
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

export default function SetupSecretScreen() {
  const palette = useVaultPalette();
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
          message: t('setup.error.short', {
            min: MIN_CODE_LENGTH,
            remaining: MIN_CODE_LENGTH - f.entry.length,
          }),
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
          message: t('setup.error.mismatch'),
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
                t('setup.error.slow'),
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
          message: error instanceof Error ? error.message : t('setup.error.save'),
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
  const prompt = phase === 'confirm' ? t('setup.prompt.confirm') : t('setup.prompt.entry');
  const emptySlots = Math.max(0, MIN_CODE_LENGTH - entry.length);
  const actionLabel = phase === 'confirm' ? t('setup.action.confirm') : t('setup.action.set');
  const subtitle =
    phase === 'already-set'
      ? t('setup.alreadySet')
      : phase === 'working'
        ? t('setup.securing')
        : `${prompt} ${t('setup.range', { min: MIN_CODE_LENGTH, max: MAX_CODE_LENGTH })}`;
  const hint =
    message ||
    (phase === 'entry' || phase === 'confirm'
      ? t('setup.count', { count: entry.length, min: MIN_CODE_LENGTH })
      : '');

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* the light source in the top right corner — the vault's signature */}
      <LinearGradient
        colors={[palette.glow, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.1, y: 0.55 }}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.inner}>
          <View style={styles.titleRow}>
            <LinearGradient
              colors={VAULT_ACCENTS.emerald.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandBadge}>
              <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
            </LinearGradient>
            <ThemedText type="subtitle" style={[styles.title, { color: palette.text }]}>
              {t('setup.title')}
            </ThemedText>
          </View>

          <View style={styles.subtitleRow}>
            {phase === 'working' && <ActivityIndicator size="small" color={palette.accent} />}
            <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          </View>

          <View
            style={[
              styles.codeBox,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}>
            <Text
              style={[styles.codeText, { color: palette.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit>
              {phase === 'already-set'
                ? '••••••'
                : entry.length > 0
                  ? '•'.repeat(entry.length)
                  : ''}
              {phase !== 'already-set' && emptySlots > 0 ? (
                <Text style={{ color: palette.textSecondary }}>{'•'.repeat(emptySlots)}</Text>
              ) : null}
            </Text>
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
            {hint}
          </ThemedText>

          {biometricAvailable && phase !== 'already-set' && (
            <View
              style={[
                styles.biometricRow,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}>
              <Ionicons name="finger-print" size={18} color={palette.textSecondary} />
              <ThemedText type="small" style={styles.biometricLabel}>
                {t('setup.biometric', { biometric: biometricLabel() })}
              </ThemedText>
              <Switch
                value={biometricOptIn}
                onValueChange={setBiometricOptIn}
                disabled={phase === 'working'}
                accessibilityLabel={t('setup.biometric', { biometric: biometricLabel() })}
                trackColor={{ true: palette.accent, false: palette.chip }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={15} color={palette.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.warningText}>
              {t('setup.warning')}
            </ThemedText>
          </View>

          {phase === 'already-set' ? (
            <Pressable
              onPress={() => router.replace('/calculator-disguise')}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.doneButton,
                { backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="link">{t('setup.openCalculator')}</ThemedText>
            </Pressable>
          ) : (
            <View
              style={[
                styles.keypad,
                { opacity: phase === 'entry' || phase === 'confirm' ? 1 : 0.4 },
              ]}>
              {DIGIT_KEYS.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
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
              <View style={styles.row}>
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
    </View>
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
  topGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 260,
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
    width: 28,
    height: 28,
    borderRadius: 9,
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
    borderRadius: Radius.lg,
    borderWidth: 1,
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
    borderWidth: 1,
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
