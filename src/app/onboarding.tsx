import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  VAULT_ACCENTS,
  VAULT_CATEGORIES,
  VAULT_TONES,
  type VaultTone,
} from '@/constants/vault-theme';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { t } from '@/lib/i18n';
import { markOnboarded } from '@/lib/onboarding';

interface Page {
  icon: keyof typeof Ionicons.glyphMap;
  /** i18n keys for the title and body */
  titleKey: string;
  bodyKey: string;
  /** The hue of the page's icon tile — the settings rows' language. */
  tone: VaultTone;
}

const PAGES: Page[] = [
  {
    icon: 'calculator-outline',
    titleKey: 'onboarding.p1.title',
    bodyKey: 'onboarding.p1.body',
    tone: 'green',
  },
  {
    icon: 'lock-closed-outline',
    titleKey: 'onboarding.p2.title',
    bodyKey: 'onboarding.p2.body',
    tone: 'violet',
  },
  {
    icon: 'warning-outline',
    titleKey: 'onboarding.p3.title',
    bodyKey: 'onboarding.p3.body',
    tone: 'amber',
  },
];

export default function OnboardingScreen() {
  const palette = useVaultPalette();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);

  const isLast = page === PAGES.length - 1;

  const finish = useCallback(() => {
    void markOnboarded().finally(() => router.replace('/setup-secret'));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setPage(index);
      scrollRef.current?.scrollTo({ x: index * width, animated: true });
    },
    [width],
  );

  const onNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    goTo(page + 1);
  }, [finish, goTo, isLast, page]);

  const onMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
      const clamped = Math.min(PAGES.length - 1, Math.max(0, index));
      setPage(clamped);
    },
    [width],
  );

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
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <LinearGradient
              colors={VAULT_ACCENTS.emerald.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandBadge}>
              <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
            </LinearGradient>
            <Text style={[styles.brandName, { color: palette.text }]}>HideMe</Text>
          </View>
          <Pressable
            onPress={finish}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.skip')}
            style={({ pressed }) => [
              styles.skip,
              { backgroundColor: palette.surface },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.skipLabel, { color: palette.textSecondary }]}>
              {t('onboarding.skip')}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          style={styles.pager}>
          {PAGES.map((item, index) => {
            const tone = VAULT_TONES[item.tone];
            return (
              <View key={item.titleKey} style={[styles.slide, { width }]}>
                {index === 0 ? (
                  <CalcDemo active={page === 0} />
                ) : (
                  <View style={[styles.iconGlow, { shadowColor: tone.color }]}>
                    <LinearGradient
                      colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.iconBadge, { borderColor: tone.wash }]}>
                      <View style={[styles.iconTile, { backgroundColor: tone.wash }]}>
                        <Ionicons name={item.icon} size={34} color={tone.color} />
                      </View>
                    </LinearGradient>
                  </View>
                )}
                <Text style={[styles.title, { color: palette.text }]}>{t(item.titleKey)}</Text>
                <Text style={[styles.text, { color: palette.textSecondary }]}>
                  {t(item.bodyKey)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((item, index) => (
              <Pressable
                key={item.titleKey}
                onPress={() => goTo(index)}
                hitSlop={Spacing.two}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.page.aria', { page: index + 1 })}>
                <View
                  style={[
                    styles.dot,
                    index === page
                      ? [styles.dotActive, { backgroundColor: palette.accent }]
                      : { backgroundColor: palette.chip },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? t('onboarding.cta.finish') : t('onboarding.cta.next')}
            style={({ pressed }) => [styles.ctaWrap, pressed && styles.pressed]}>
            <LinearGradient
              colors={VAULT_ACCENTS.emerald.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}>
              <Text style={styles.ctaLabel}>
                {isLast ? t('onboarding.cta.finish') : t('onboarding.cta.next')}
              </Text>
              <Ionicons
                name={isLast ? 'lock-closed' : 'arrow-forward'}
                size={18}
                color="#FFFFFF"
              />
            </LinearGradient>
          </Pressable>
          <Text style={[styles.hint, { color: palette.textSecondary }]}>
            {isLast ? t('onboarding.hint.finish') : t('onboarding.hint.swipe')}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const DEMO_CODE = ['1', '2', '3', '4', '5', '6'];
const DEMO_DIGIT_MS = 240;
const DEMO_HOLD_MS = 1600;

/**
 * The "how it works" demo for the calculator page: a mini calculator types
 * the secret code, presses "=", and the display flips into the unlocked
 * vault — then resets and loops. Pauses while the page is off-screen.
 */
function CalcDemo({ active }: { active: boolean }) {
  const palette = useVaultPalette();
  const [typed, setTyped] = useState(0);
  // Animated values live in lazy state — they are stable and never re-created.
  const [eqGlow] = useState(() => new Animated.Value(0));
  const [reveal] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (alive) fn();
      }, ms);
    };

    const loop = () => {
      if (!alive) return;
      setTyped(0);
      reveal.setValue(0);
      eqGlow.setValue(0);

      DEMO_CODE.forEach((_, i) => {
        schedule(() => setTyped(i + 1), (i + 1) * DEMO_DIGIT_MS);
      });

      const eqAt = DEMO_CODE.length * DEMO_DIGIT_MS + 160;
      schedule(() => {
        Animated.sequence([
          Animated.timing(eqGlow, { toValue: 1, duration: 110, useNativeDriver: true }),
          Animated.timing(eqGlow, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
      }, eqAt);

      schedule(() => {
        Animated.timing(reveal, { toValue: 1, duration: 380, useNativeDriver: true }).start();
      }, eqAt + 320);

      schedule(loop, eqAt + 320 + DEMO_HOLD_MS);
    };

    loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, eqGlow, reveal]);

  const keypad: string[][] = [
    ['1', '2', '3', '4'],
    ['5', '6', '7', '8'],
    ['9', '0', '⌫', '='],
  ];

  return (
    <View
      style={[styles.demoCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
      accessibilityLabel={t('onboarding.demo.aria')}>
      {/* the display: calculator line crossfading into the vault grid */}
      <View style={[styles.demoDisplay, { backgroundColor: palette.backgroundDeep }]}>
        <Animated.View
          style={[styles.demoDisplaySide, { opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
          <Text style={[styles.demoExpr, { color: palette.textSecondary }]} numberOfLines={1}>
            {typed < DEMO_CODE.length ? DEMO_CODE.slice(0, Math.max(typed - 3, 0)).join('') : ''}
          </Text>
          <Text style={[styles.demoValue, { color: palette.text }]} numberOfLines={1}>
            {DEMO_CODE.slice(0, typed).join('') || '0'}
          </Text>
        </Animated.View>
        <Animated.View
          style={[
            styles.demoDisplaySide,
            styles.demoVault,
            { opacity: reveal },
          ]}>
          <View style={styles.demoGrid}>
            {Object.values(VAULT_CATEGORIES).map((category) => (
              <LinearGradient
                key={category.icon}
                colors={category.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.demoTile}>
                <Ionicons name={category.icon} size={14} color="#FFFFFF" />
              </LinearGradient>
            ))}
          </View>
          <View style={styles.demoUnlockRow}>
            <Ionicons name="checkmark-circle" size={13} color={palette.accent} />
            <Text style={[styles.demoUnlockText, { color: palette.textSecondary }]}>
              {t('onboarding.demo.unlock')}
            </Text>
          </View>
        </Animated.View>
      </View>

      <View style={styles.demoKeys}>
        {keypad.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.demoRow}>
            {row.map((key) => {
              const isEq = key === '=';
              return (
                <View
                  key={key}
                  style={[
                    styles.demoKey,
                    {
                      backgroundColor: isEq ? 'transparent' : palette.backgroundDeep,
                      borderColor: palette.border,
                    },
                  ]}>
                  {isEq ? (
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          borderRadius: 10,
                          backgroundColor: palette.accent,
                          opacity: eqGlow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.95] }),
                        },
                      ]}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.demoKeyLabel,
                      { color: isEq ? '#FFFFFF' : palette.textSecondary },
                    ]}>
                    {key}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: Fonts.sansBold,
    fontSize: 15,
  },
  skip: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  skipLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13.5,
  },
  pager: {
    flex: 1,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  iconGlow: {
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  iconBadge: {
    width: 104,
    height: 104,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTile: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 25,
    lineHeight: 31,
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 15,
    maxWidth: 340,
    fontFamily: Fonts.sans,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 22,
  },
  ctaWrap: {
    width: '100%',
    maxWidth: 420,
    shadowColor: '#10B981',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cta: {
    minHeight: 54,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    flexDirection: 'row',
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: Fonts.sansBold,
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  pressed: {
    opacity: 0.8,
  },
  demoCard: {
    width: 250,
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.three - 2,
    gap: Spacing.two,
    shadowColor: '#10B981',
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  demoDisplay: {
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
  },
  demoDisplaySide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one + 2,
  },
  demoVault: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 0,
  },
  demoExpr: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    minHeight: 12,
  },
  demoValue: {
    fontFamily: Fonts.mono,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  demoGrid: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 5,
  },
  demoTile: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoUnlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  demoUnlockText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
  },
  demoKeys: {
    gap: Spacing.one + 2,
  },
  demoRow: {
    flexDirection: 'row',
    gap: Spacing.one + 2,
  },
  demoKey: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  demoKeyLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
  },
});
