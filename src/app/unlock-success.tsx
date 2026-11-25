import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { VAULT_TONES } from '@/constants/vault-theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { maybeShowInterstitial } from '@/lib/ads';
import { t } from '@/lib/i18n';
import { usePremium } from '@/lib/premium';
import { useVaultUnlocked } from '@/lib/vault-session';

/**
 * Shown once after a successful unlock (PIN or biometric). The vault is already
 * open at this point; the screen is a calm confirmation before the user lands
 * on their files, and the natural place for the capped unlock interstitial.
 */
export default function UnlockSuccessScreen() {
  const palette = useVaultPalette();
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
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* the light source in the top right corner — the vault's signature */}
      <LinearGradient
        colors={[palette.glow, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.1, y: 0.55 }}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={[styles.inner, { maxWidth: MaxContentWidth }]}>
          <View style={styles.center}>
            {!premium.active && (
              <View
                style={[
                  styles.shieldBadge,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                ]}>
                <Ionicons name="shield-checkmark" size={16} color={palette.accentBright} />
                <Text style={[styles.shieldText, { color: palette.text }]}>
                  {t('welcome.badge')}
                </Text>
              </View>
            )}

            <Animated.View
              style={[
                styles.orbRing,
                {
                  opacity: checkOpacity,
                  transform: [{ scale: checkScale }],
                },
              ]}>
              <LinearGradient
                colors={['#34D399', '#059669']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.orb}>
                <Ionicons name="checkmark" size={58} color="#FFFFFF" />
              </LinearGradient>
            </Animated.View>

            <Text style={[styles.title, { color: palette.text }]}>{t('welcome.title')}</Text>
            <Text style={[styles.body, { color: palette.textSecondary }]}>
              {t('welcome.body')}
            </Text>

            <View
              style={[styles.tip, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={[styles.tipTile, { backgroundColor: VAULT_TONES.violet.wash }]}>
                <Ionicons name="timer" size={17} color={VAULT_TONES.violet.color} />
              </View>
              <View style={[styles.tipDivider, { backgroundColor: palette.border }]} />
              <Text style={[styles.tipText, { color: palette.textSecondary }]}>
                {t('welcome.tip')}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onContinue}
              accessibilityRole="button"
              accessibilityLabel={t('welcome.cta')}
              style={({ pressed }) => [styles.ctaWrap, pressed && styles.pressed]}>
              <LinearGradient
                colors={['#7C3AED', '#2563EB']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.cta}>
                <Text style={styles.ctaLabel}>{t('welcome.cta')}</Text>
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => router.push('/vault/premium')}
              accessibilityRole="button"
              accessibilityLabel={t('welcome.premium')}
              style={({ pressed }) => [
                styles.ghost,
                { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.ghostLabel, { color: palette.text }]}>{t('welcome.premium')}</Text>
              <Ionicons name="diamond-outline" size={18} color={palette.text} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

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
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two + 2,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two - 2,
    paddingHorizontal: Spacing.three + 2,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginBottom: Spacing.four,
  },
  shieldText: {
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  orbRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.14)',
    shadowColor: '#10B981',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    marginBottom: Spacing.three,
  },
  orb: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 30,
    lineHeight: 37,
  },
  body: {
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 21,
    fontFamily: Fonts.sans,
    fontSize: 15,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginTop: Spacing.four,
    alignSelf: 'stretch',
  },
  tipTile: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: -Spacing.one,
  },
  tipText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
  },
  actions: {
    gap: Spacing.two,
  },
  ctaWrap: {
    shadowColor: '#7C3AED',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cta: {
    minHeight: 56,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansBold,
    fontSize: 17,
  },
  ghost: {
    minHeight: 54,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1,
  },
  ghostLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
});
