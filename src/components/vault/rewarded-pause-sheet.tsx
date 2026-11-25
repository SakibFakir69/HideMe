import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCountdown } from '@/components/vault/format';
import { GradientButton } from '@/components/ui/gradient-button';
import { AUTO_LOCK_PAUSE_MS } from '@/constants/ads';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { showRewardedAd } from '@/lib/ads';
import { grantAutoLockPause } from '@/lib/vault-autolock';

type Phase = 'intro' | 'watching' | 'success';

interface RewardedPauseSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fired once the pause is persisted, with its expiry timestamp. */
  onGranted: (until: number) => void;
}

/**
 * Design board §5.7 — the rewarded-ad bottom sheet. The ad itself is a native
 * full-screen overlay, so the sheet shows a "watching" state behind it and
 * turns into a live countdown once the reward lands.
 */
export function RewardedPauseSheet({ visible, onClose, onGranted }: RewardedPauseSheetProps) {
  const palette = useVaultPalette();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Re-opening the sheet always starts from the pitch, never a stale success.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPhase('intro');
      setError(null);
      setUntil(0);
    }
  }

  // Tick only while the success countdown is on screen.
  useEffect(() => {
    if (!visible || phase !== 'success') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, visible]);

  const watching = phase === 'watching';
  const close = useCallback(() => {
    if (!watching) onClose();
  }, [onClose, watching]);

  const watch = useCallback(async () => {
    if (watching) return;
    setError(null);
    setPhase('watching');
    try {
      const result = await showRewardedAd();
      if (result === 'earned') {
        const grantedUntil = await grantAutoLockPause(AUTO_LOCK_PAUSE_MS);
        setUntil(grantedUntil);
        setNow(Date.now());
        setPhase('success');
        onGranted(grantedUntil);
      } else if (result === 'closed') {
        setPhase('intro');
        setError('Watch the whole ad to earn the pause.');
      } else {
        setPhase('intro');
        setError('The ad isn’t ready yet — try again in a few seconds.');
      }
    } catch {
      setPhase('intro');
      setError('Couldn’t start the ad. Please try again.');
    }
  }, [onGranted, watching]);

  const remaining = Math.max(0, until - now);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          disabled={watching}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              paddingBottom: insets.bottom + Spacing.four,
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: palette.border }]} />

          <Pressable
            onPress={close}
            disabled={watching}
            hitSlop={Spacing.three}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Ionicons name="close" size={20} color={palette.textSecondary} />
          </Pressable>

          {phase === 'success' ? (
            <>
              <View style={styles.successBadge}>
                <Ionicons name="checkmark" size={34} color="#FFFFFF" />
              </View>
              <Text style={[styles.title, { color: palette.text }]}>Pause active</Text>
              <Text style={[styles.body, { color: palette.textSecondary }]}>
                Timed auto-lock is paused. Your vault stays unlocked for:
              </Text>
              <Text style={[styles.countdown, { color: palette.text }]}>
                {formatCountdown(remaining)}
              </Text>
              <GradientButton label="Done" onPress={onClose} style={styles.primary} />
            </>
          ) : (
            <>
              <View style={styles.giftWrap}>
                <LinearGradient
                  colors={[Palette.primary, Palette.secondary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.giftBadge}>
                  <Ionicons name="gift" size={30} color="#FFFFFF" />
                </LinearGradient>
              </View>

              <Text style={[styles.title, { color: palette.text }]}>
                Pause auto-lock for 1 hour
              </Text>
              <Text style={[styles.body, { color: palette.textSecondary }]}>
                Watch a short ad and keep your vault unlocked for an hour — even when you switch
                apps.
              </Text>

              <View style={[styles.note, { backgroundColor: palette.surfaceHigh }]}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={16}
                  color={palette.textSecondary}
                />
                <Text style={[styles.noteText, { color: palette.textSecondary }]}>
                  “Immediately” and Lock now always lock, even during a pause.
                </Text>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <GradientButton
                label={watching ? 'Ad playing…' : 'Watch ad · 1 hour free'}
                onPress={() => void watch()}
                loading={watching}
                style={styles.primary}
              />
              <GradientButton
                label="Maybe later"
                variant="ghost"
                onPress={onClose}
                disabled={watching}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    alignItems: 'center',
    gap: Spacing.two,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.two,
  },
  close: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftWrap: {
    marginTop: Spacing.three,
    borderRadius: 40,
    shadowColor: Palette.primary,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  giftBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBadge: {
    marginTop: Spacing.three,
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.success,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 20,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 320,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Radius.md,
    padding: Spacing.three,
    marginTop: Spacing.two,
    width: '100%',
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    fontFamily: Fonts.sansMedium,
    fontSize: 12,
    lineHeight: 17,
    color: Palette.warning,
    textAlign: 'center',
  },
  countdown: {
    fontFamily: Fonts.mono,
    fontSize: 36,
    letterSpacing: 1,
    marginTop: Spacing.one,
    marginBottom: Spacing.two,
  },
  primary: {
    width: '100%',
    marginTop: Spacing.two,
  },
  pressed: {
    opacity: 0.75,
  },
});
