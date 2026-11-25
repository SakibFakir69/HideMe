import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { RewardedPauseSheet } from '@/components/vault/rewarded-pause-sheet';
import { formatCountdown } from '@/components/vault/format';
import { Chip } from '@/components/ui/chip';
import { GradientButton } from '@/components/ui/gradient-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionTitle } from '@/components/ui/section-title';
import { AUTO_LOCK_PAUSE_MS } from '@/constants/ads';
import { Fonts, MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { usePremium } from '@/lib/premium';
import {
  AUTOLOCK_OPTIONS,
  getAutoLockOverrideUntil,
  getAutoLockSeconds,
  grantAutoLockPause,
  setAutoLockSeconds,
  type AutoLockSeconds,
} from '@/lib/vault-autolock';
import { lock } from '@/lib/vault-session';

const OPTION_LABEL = new Map<AutoLockSeconds, string>([
  [0, 'Immediately'],
  [30, '30 sec'],
  [60, '1 min'],
  [300, '5 min'],
]);

export default function AutoLockScreen() {
  const palette = useVaultPalette();
  const premium = usePremium();
  const [seconds, setSeconds] = useState<AutoLockSeconds | null>(null);
  const [pauseUntil, setPauseUntil] = useState(() => getAutoLockOverrideUntil());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [pauseSheetOpen, setPauseSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAutoLockSeconds().then((value) => {
      if (!cancelled) setSeconds(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pauseRemaining = Math.max(0, pauseUntil - now);
  const pauseActive = pauseRemaining > 0;

  // Tick only while a pause is running, so an idle screen costs nothing.
  useEffect(() => {
    if (!pauseActive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pauseActive]);

  const onSelectThreshold = useCallback(
    async (value: AutoLockSeconds) => {
      setSeconds(value);
      await setAutoLockSeconds(value);
      // "Immediately" is a security choice: an existing pause no longer applies.
      if (value === 0 && getAutoLockOverrideUntil() > Date.now()) {
        await grantAutoLockPause(0);
        setPauseUntil(0);
        setNow(Date.now());
      }
    },
    [],
  );

  const onPause = useCallback(async () => {
    if (busy) return;
    if (seconds === 0) {
      Alert.alert(
        'Auto-lock is set to Immediately',
        'The pause only affects timed auto-lock. Choose 30 seconds or more to use it.',
      );
      return;
    }
    // Premium includes the pause: no ad, no sheet.
    if (premium.active) {
      setBusy(true);
      try {
        const until = await grantAutoLockPause(AUTO_LOCK_PAUSE_MS);
        setPauseUntil(until);
        setNow(Date.now());
      } finally {
        setBusy(false);
      }
      return;
    }
    setPauseSheetOpen(true);
  }, [busy, premium.active, seconds]);

  const onPauseGranted = useCallback((until: number) => {
    setPauseUntil(until);
    setNow(Date.now());
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="Auto-lock timer" onBack={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.hero,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}>
            <View style={[styles.ring, { borderColor: pauseActive ? Palette.success : palette.border }]}>
              <Ionicons
                name={pauseActive ? 'time-outline' : 'lock-closed-outline'}
                size={20}
                color={pauseActive ? Palette.success : palette.textSecondary}
              />
              <Text style={[styles.countdown, { color: palette.text }]}>
                {pauseActive ? formatCountdown(pauseRemaining) : '—:—'}
              </Text>
              <Text style={[styles.ringLabel, { color: palette.textSecondary }]}>
                {pauseActive ? 'pause remaining' : 'no pause active'}
              </Text>
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.heroBody}>
              {seconds === null
                ? 'Loading your policy…'
                : seconds === 0
                  ? 'The vault locks the moment it leaves the foreground.'
                  : `The vault locks ${OPTION_LABEL.get(seconds)} after it leaves the foreground.`}
            </ThemedText>
          </View>

          <SectionTitle label="Policy" />
          <View style={styles.chipRow}>
            {AUTOLOCK_OPTIONS.map((option) => (
              <Chip
                key={option}
                label={OPTION_LABEL.get(option) ?? String(option)}
                active={seconds === option}
                onPress={() => void onSelectThreshold(option)}
              />
            ))}
          </View>

          <SectionTitle label="Pause" />
          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: palette.surfaceHigh }]}>
                <Ionicons
                  name={premium.active ? 'ribbon-outline' : 'gift-outline'}
                  size={20}
                  color={Palette.primary}
                />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {premium.active ? 'Pause for 1 hour' : 'Watch an ad · pause 1 hour'}
                </ThemedText>
                <ThemedText type="code" themeColor="textSecondary" style={styles.cardNote}>
                  {premium.active
                    ? 'Included with Premium — no ad needed.'
                    : 'Timed auto-lock is skipped until the timer runs out.'}
                </ThemedText>
              </View>
            </View>

            <GradientButton
              label={pauseActive ? 'Extend pause by 1 hour' : 'Pause for 1 hour'}
              onPress={() => void onPause()}
              loading={busy}
              disabled={busy || seconds === 0}
            />

            {pauseActive && (
              <GradientButton
                label="End pause now"
                variant="ghost"
                onPress={() => {
                  void grantAutoLockPause(0).then((until) => {
                    setPauseUntil(until);
                    setNow(Date.now());
                  });
                }}
              />
            )}
          </View>

          <SectionTitle label="Lock" />
          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                <Ionicons name="lock-closed-outline" size={20} color={Palette.error} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Lock the vault now</ThemedText>
                <ThemedText type="code" themeColor="textSecondary" style={styles.cardNote}>
                  Clears the master key and every decrypted cache immediately.
                </ThemedText>
              </View>
            </View>
            <GradientButton
              label="Lock now"
              variant="ghost"
              onPress={() => {
                lock();
                router.replace('/calculator-disguise');
              }}
            />
          </View>

          <View style={[styles.note, { backgroundColor: palette.surface }]}>
            <Ionicons name="information-circle-outline" size={18} color={palette.textSecondary} />
            <ThemedText type="code" themeColor="textSecondary" style={styles.noteText}>
              A pause is not a security downgrade you can forget about: “Immediately” always locks,
              and “Lock now” ignores any active pause.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>

      <RewardedPauseSheet
        visible={pauseSheetOpen}
        onClose={() => setPauseSheetOpen(false)}
        onGranted={onPauseGranted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  ring: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  countdown: {
    fontFamily: Fonts.mono,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 1,
  },
  ringLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroBody: {
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardNote: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
});
