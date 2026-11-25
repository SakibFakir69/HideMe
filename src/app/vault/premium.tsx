import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Product } from 'expo-iap';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/gradient-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Radius, Spacing, Fonts, MaxContentWidth, Palette } from '@/constants/theme';
import { VAULT_ACCENTS, VAULT_TONES } from '@/constants/vault-theme';
import {
  PREMIUM_FALLBACK_PRICE,
  PREMIUM_ORIGINAL_PRICE,
  PREMIUM_PRODUCT_ID,
} from '@/constants/premium';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import {
  addPurchaseListeners,
  fetchPremiumProduct,
  purchasePremium,
  restorePremium,
} from '@/lib/iap';
import { usePremium } from '@/lib/premium';
import { priceAmount } from '@/lib/price-amount';

const BENEFITS = [
  {
    icon: 'ban-outline' as const,
    tone: VAULT_TONES.amber,
    title: 'Remove all ads',
    body: 'No banners or interstitials, anywhere.',
  },
  {
    icon: 'albums-outline' as const,
    tone: VAULT_TONES.violet,
    title: 'Unlimited vault organization',
    body: 'Keep as many files and folders as your device allows.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    tone: VAULT_TONES.green,
    title: 'Advanced security',
    body: 'The strongest unlock path and every future security upgrade.',
  },
  {
    icon: 'camera-reverse-outline' as const,
    tone: VAULT_TONES.amber,
    title: 'Intruder selfies',
    body: 'A wrong code silently photographs the snoop — encrypted, only you see it.',
  },
  {
    icon: 'swap-horizontal-outline' as const,
    tone: VAULT_TONES.violet,
    title: 'Decoy code',
    body: 'A second code opens an empty fake vault. Your real one stays invisible.',
  },
  {
    icon: 'cloud-upload-outline' as const,
    tone: VAULT_TONES.blue,
    title: 'Encrypted backups',
    body: 'Export the whole vault to one .hmb file you can store anywhere.',
  },
  {
    icon: 'headset-outline' as const,
    tone: VAULT_TONES.blue,
    title: 'Priority support',
    body: 'Get help first when something goes wrong.',
  },
];

type StoreStatus = 'connecting' | 'ready' | 'unavailable';

export default function PremiumScreen() {
  const palette = useVaultPalette();
  const premium = usePremium();
  const [product, setProduct] = useState<Product | null>(null);
  const [status, setStatus] = useState<StoreStatus>('connecting');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const fetched = await fetchPremiumProduct();
      if (!alive) return;
      setProduct(fetched);
      setStatus(fetched ? 'ready' : 'unavailable');
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return addPurchaseListeners(
      () => {
        setBusy(false);
        Alert.alert('Welcome to Premium', 'Ads are gone and every premium feature is unlocked.', [
          { text: 'Continue', onPress: () => router.back() },
        ]);
      },
      (message) => {
        setBusy(false);
        Alert.alert('Purchase failed', message);
      },
    );
  }, []);

  const price = product?.displayPrice ?? PREMIUM_FALLBACK_PRICE;

  // Discount badge only when the two prices are actually comparable numbers.
  const originalNum = priceAmount(PREMIUM_ORIGINAL_PRICE);
  const priceNum = priceAmount(price);
  const percentOff =
    originalNum > 0 && priceNum > 0 && priceNum < originalNum
      ? Math.round((1 - priceNum / originalNum) * 100)
      : null;

  const onBuy = async () => {
    if (busy || premium.active) return;
    setBusy(true);
    const result = await purchasePremium();
    setBusy(false);
    if (result === 'unavailable') {
      Alert.alert(
        'Store unavailable',
        `Premium could not start. Make sure "${PREMIUM_PRODUCT_ID}" is an active in-app product and that you are signed in to the store.`,
      );
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    const result = await restorePremium();
    setBusy(false);
    if (result === 'restored') {
      Alert.alert('Purchase restored', 'Premium is active on this account.', [
        { text: 'Continue', onPress: () => router.back() },
      ]);
    } else if (result === 'none') {
      Alert.alert('Nothing to restore', 'No previous premium purchase was found for this store account.');
    } else {
      Alert.alert('Store unavailable', 'The store could not be reached. Try again in a moment.');
    }
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
        <View style={styles.headerWrap}>
          <ScreenHeader title="Premium" onBack={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={VAULT_ACCENTS.emerald.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}>
            <Ionicons
              name="diamond"
              size={96}
              color="rgba(255,255,255,0.14)"
              style={styles.heroWatermark}
            />
            <View style={styles.crown}>
              <Ionicons name="diamond" size={30} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>{premium.active ? 'Premium is active' : 'Go Premium'}</Text>
            <Text style={styles.heroBody}>
              {premium.active
                ? 'Thank you for supporting HideMe. Everything below is unlocked.'
                : `Today only: ${price} instead of ${PREMIUM_ORIGINAL_PRICE}. One payment, yours for life.`}
            </Text>
          </LinearGradient>

          {premium.active && (
            <View style={[styles.activeCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Ionicons name="checkmark-circle" size={22} color={palette.accent} />
              <View style={styles.flex}>
                <ThemedText type="smallBold" style={{ color: palette.text }}>
                  Lifetime license
                </ThemedText>
                <ThemedText type="code" style={{ color: palette.textSecondary }}>
                  {premium.productId ?? PREMIUM_PRODUCT_ID}
                </ThemedText>
              </View>
            </View>
          )}

          <View style={[styles.benefits, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {BENEFITS.map((benefit, index) => (
              <View
                key={benefit.title}
                style={[
                  styles.benefitRow,
                  index < BENEFITS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: palette.border,
                  },
                ]}>
                <View style={[styles.benefitIcon, { backgroundColor: benefit.tone.wash }]}>
                  <Ionicons name={benefit.icon} size={18} color={benefit.tone.color} />
                </View>
                <View style={styles.flex}>
                  <ThemedText type="smallBold" style={{ color: palette.text }}>
                    {benefit.title}
                  </ThemedText>
                  <ThemedText type="code" style={[styles.benefitBody, { color: palette.textSecondary }]}>
                    {benefit.body}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>

          {!premium.active && (
            <View style={[styles.priceCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <View style={styles.priceRow}>
                <View style={styles.priceStack}>
                  {/* anchor price, struck through */}
                  <Text style={[styles.oldPrice, { color: palette.textSecondary }]}>
                    {PREMIUM_ORIGINAL_PRICE}
                  </Text>
                  <View style={styles.priceLine}>
                    <ThemedText type="subtitle" style={[styles.price, { color: palette.text }]}>
                      {price}
                    </ThemedText>
                    <ThemedText type="smallBold" style={{ color: palette.accent }}>
                      today
                    </ThemedText>
                  </View>
                  {percentOff !== null && (
                    <View style={styles.todayBadge}>
                      <Ionicons name="flash" size={12} color={Palette.error} />
                      <Text style={styles.todayBadgeText}>
                        TODAY ONLY · {percentOff}% OFF
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.priceMeta}>
                  <ThemedText type="smallBold" style={{ color: palette.text }}>
                    Lifetime
                  </ThemedText>
                  <ThemedText type="code" style={{ color: palette.textSecondary }}>
                    one-time payment
                  </ThemedText>
                </View>
              </View>

              {status === 'connecting' ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={palette.accent} />
                  <ThemedText type="small" style={{ color: palette.textSecondary }}>
                    Checking the store…
                  </ThemedText>
                </View>
              ) : null}

              <GradientButton
                label={premium.active ? 'Premium active' : `Unlock Premium · ${price}`}
                onPress={() => void onBuy()}
                loading={busy}
                disabled={premium.active || status === 'unavailable'}
              />

              {/* Setup instructions for whoever wires the product up — never
                  shown to a customer. Testing unlocks premium through
                  EXPO_PUBLIC_PREMIUM_GRANT=1 instead of this note. */}
              {__DEV__ && status === 'unavailable' && (
                <ThemedText type="code" style={[styles.storeNote, { color: palette.textSecondary }]}>
                  Dev: the store did not return “{PREMIUM_PRODUCT_ID}”. Create it as an in-app
                  product in Play Console, then relaunch — or set EXPO_PUBLIC_PREMIUM_GRANT=1.
                </ThemedText>
              )}

              <GradientButton
                label="Restore purchase"
                variant="ghost"
                onPress={() => void onRestore()}
                disabled={busy}
              />

              <ThemedText type="code" style={[styles.legal, { color: palette.textSecondary }]}>
                Payment is handled by your app store. The lifetime license follows your store
                account and can be restored on a new device.
              </ThemedText>
            </View>
          )}
        </ScrollView>
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
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    right: -18,
    bottom: -26,
  },
  crown: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroTitle: {
    fontFamily: Fonts.sansBold,
    fontSize: 26,
    color: '#FFFFFF',
  },
  heroBody: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    borderWidth: 1,
  },
  benefits: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitBody: {
    fontSize: 11,
    marginTop: 2,
  },
  flex: {
    flex: 1,
  },
  priceCard: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  priceStack: {
    flex: 1,
    gap: Spacing.one,
  },
  oldPrice: {
    fontFamily: Fonts.sans,
    fontSize: 20,
    lineHeight: 24,
    textDecorationLine: 'line-through',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  todayBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  todayBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.5,
    color: Palette.error,
  },
  price: {
    fontSize: 36,
    lineHeight: 44,
  },
  priceMeta: {
    gap: 0,
    paddingTop: 6,
    alignItems: 'flex-end',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  storeNote: {
    fontSize: 11,
    lineHeight: 16,
  },
  legal: {
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
});
