import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Product } from 'expo-iap';

import { ThemedText } from '@/components/themed-text';
import { AdBanner } from '@/components/vault/ad-banner';
import { GradientButton } from '@/components/ui/gradient-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Palette, Radius, Spacing, Fonts, MaxContentWidth } from '@/constants/theme';
import {
  PREMIUM_FALLBACK_PRICE,
  PREMIUM_PRODUCT_ID,
} from '@/constants/premium';
import { useTheme } from '@/hooks/use-theme';
import {
  addPurchaseListeners,
  fetchPremiumProduct,
  purchasePremium,
  restorePremium,
} from '@/lib/iap';
import { usePremium } from '@/lib/premium';

const BENEFITS = [
  { icon: 'ban-outline', title: 'Remove all ads', body: 'No banners or interstitials, anywhere.' },
  {
    icon: 'albums-outline',
    title: 'Unlimited vault organization',
    body: 'Keep as many files and folders as your device allows.',
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Advanced security',
    body: 'The strongest unlock path and every future security upgrade.',
  },
  {
    icon: 'headset-outline',
    title: 'Priority support',
    body: 'Get help first when something goes wrong.',
  },
] as const;

type StoreStatus = 'connecting' | 'ready' | 'unavailable';

export default function PremiumScreen() {
  const theme = useTheme();
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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <View style={styles.headerWrap}>
        <ScreenHeader title="Premium" onBack={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <View style={styles.crown}>
            <Ionicons name="ribbon" size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>{premium.active ? 'Premium is active' : 'Go Premium'}</Text>
          <Text style={styles.heroBody}>
            {premium.active
              ? 'Thank you for supporting HideMe. Everything below is unlocked.'
              : 'One payment. No subscription. Yours for life.'}
          </Text>
        </LinearGradient>

        {premium.active && (
          <View style={[styles.activeCard, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="checkmark-circle" size={22} color={Palette.success} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">Lifetime license</ThemedText>
              <ThemedText type="code" themeColor="textSecondary">
                {premium.productId ?? PREMIUM_PRODUCT_ID}
              </ThemedText>
            </View>
          </View>
        )}

        <View style={[styles.benefits, { backgroundColor: theme.backgroundElement }]}>
          {BENEFITS.map((benefit, index) => (
            <View
              key={benefit.title}
              style={[
                styles.benefitRow,
                index < BENEFITS.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}>
              <View style={[styles.benefitIcon, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name={benefit.icon} size={18} color={Palette.primary} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{benefit.title}</ThemedText>
                <ThemedText type="code" themeColor="textSecondary" style={styles.benefitBody}>
                  {benefit.body}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>

        {!premium.active && (
          <View style={[styles.priceCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.priceRow}>
              <ThemedText type="subtitle" style={styles.price}>
                {price}
              </ThemedText>
              <View style={styles.priceMeta}>
                <ThemedText type="smallBold">Lifetime</ThemedText>
                <ThemedText type="code" themeColor="textSecondary">
                  one-time payment
                </ThemedText>
              </View>
            </View>

            {status === 'connecting' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.tint} />
                <ThemedText type="small" themeColor="textSecondary">
                  Checking the store…
                </ThemedText>
              </View>
            ) : null}

            <GradientButton
              label={premium.active ? 'Premium active' : `Get Premium · ${price}`}
              onPress={() => void onBuy()}
              loading={busy}
              disabled={premium.active || status === 'unavailable'}
            />

            {status === 'unavailable' && (
              <ThemedText type="code" themeColor="textSecondary" style={styles.storeNote}>
                The store did not return the premium product. Create “{PREMIUM_PRODUCT_ID}” as an
                in-app product in Play Console, then relaunch the app.
              </ThemedText>
            )}

            <GradientButton
              label="Restore purchase"
              variant="ghost"
              onPress={() => void onRestore()}
              disabled={busy}
            />

            <ThemedText type="code" themeColor="textSecondary" style={styles.legal}>
              Payment is handled by your app store. The lifetime license follows your store
              account and can be restored on a new device.
            </ThemedText>
          </View>
        )}

        <AdBanner />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  },
  benefits: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
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
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.two,
  },
  price: {
    fontSize: 36,
    lineHeight: 44,
  },
  priceMeta: {
    gap: 0,
    paddingTop: 6,
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
