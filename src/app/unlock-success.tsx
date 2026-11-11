import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/gradient-button';
import { Fonts, MaxContentWidth, Palette, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { maybeShowInterstitial } from '@/lib/ads';
import { usePremium } from '@/lib/premium';
import { useVaultUnlocked } from '@/lib/vault-session';

/**
 * Shown once after a successful unlock (PIN or biometric). The vault is already
 * open at this point; the screen is a calm confirmation before the user lands
 * on their files, and the natural place for the capped unlock interstitial.
 */
export default function UnlockSuccessScreen() {
  const theme = useTheme();
  const unlocked = useVaultUnlocked();
  const premium = usePremium();
  const [checkScale] = useState(() => new Animated.Value(0.6));
  const [checkOpacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        damping: 12,
        stiffness: 140,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkOpacity, checkScale]);

  if (!unlocked) return <Redirect href="/calculator-disguise" />;

  const onContinue = () => {
    router.replace('/vault');
    // Best-effort, capped at 1/24h; never blocks navigation.
    void maybeShowInterstitial();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.inner}>
        <View style={styles.center}>
          {!premium.active && (
            <View style={[styles.shieldBadge, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="shield-checkmark-outline" size={16} color={Palette.success} />
              <Text style={[styles.shieldText, { color: theme.textSecondary }]}>
                End-to-end encrypted on this device
              </Text>
            </View>
          )}

          <Animated.View
            style={[
              styles.checkOuter,
              {
                opacity: checkOpacity,
                transform: [{ scale: checkScale }],
              },
            ]}>
            <View style={styles.checkInner}>
              <Ionicons name="checkmark" size={54} color="#FFFFFF" />
            </View>
          </Animated.View>

          <ThemedText style={styles.title}>Welcome back!</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.body}>
            Your vault is now unlocked. Everything stays encrypted on this device.
          </ThemedText>

          <View style={[styles.tip, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="timer-outline" size={18} color={theme.tint} />
            <ThemedText type="code" themeColor="textSecondary" style={styles.tipText}>
              The vault locks again when the app goes to the background.
            </ThemedText>
          </View>
        </View>

        <View style={styles.actions}>
          <GradientButton label="Continue" onPress={onContinue} />
          <GradientButton label="Go Premium" variant="ghost" onPress={() => router.push('/vault/premium')} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    marginBottom: Spacing.five,
  },
  shieldText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 11,
  },
  checkOuter: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.16)',
    marginBottom: Spacing.three,
  },
  checkInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.success,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 28,
    lineHeight: 34,
  },
  body: {
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    marginTop: Spacing.four,
  },
  tipText: {
    fontSize: 11,
  },
  actions: {
    gap: Spacing.one,
  },
});
