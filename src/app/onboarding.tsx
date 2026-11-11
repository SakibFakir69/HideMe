import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientButton } from '@/components/ui/gradient-button';
import { BrandGradient, Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { markOnboarded } from '@/lib/onboarding';

interface Page {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const PAGES: Page[] = [
  {
    icon: 'calculator-outline',
    title: 'A calculator, nothing more',
    body: 'It really is one — add, subtract, divide. Nobody glancing at your screen sees a vault.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Your code opens the vault',
    body: 'Type your secret code into the calculator to reveal an encrypted vault for photos, videos and documents. Everything stays on this device.',
  },
  {
    icon: 'warning-outline',
    title: 'There is no password reset',
    body: 'Files are encrypted with a key only your code can open. Lose the code and the files are unrecoverable — write it down somewhere safe.',
  },
];

export default function OnboardingScreen() {
  const theme = useTheme();
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <LinearGradient
              colors={[...BrandGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandBadge}>
              <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
            </LinearGradient>
            <ThemedText type="smallBold">HideMe</ThemedText>
          </View>
          <Pressable
            onPress={finish}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <ThemedText type="small" themeColor="textSecondary">
              Skip
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          style={styles.pager}>
          {PAGES.map((item) => (
            <View key={item.title} style={[styles.slide, { width }]}>
              <LinearGradient
                colors={[...BrandGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBadge}>
                <Ionicons name={item.icon} size={38} color="#FFFFFF" />
              </LinearGradient>
              <ThemedText type="title" style={styles.title}>
                {item.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
                {item.body}
              </ThemedText>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((item, index) => (
              <Pressable
                key={item.title}
                onPress={() => goTo(index)}
                hitSlop={Spacing.two}
                accessibilityRole="button"
                accessibilityLabel={`Go to page ${index + 1}`}>
                <View
                  style={[
                    styles.dot,
                    index === page
                      ? [styles.dotActive, { backgroundColor: Palette.primary }]
                      : { backgroundColor: theme.backgroundSelected },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <GradientButton
            label={isLast ? 'Set up my code' : 'Continue'}
            onPress={onNext}
            style={styles.cta}
          />
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {isLast ? 'Takes about a minute.' : 'Swipe or tap continue.'}
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
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
  iconBadge: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
    shadowColor: Palette.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 15,
    maxWidth: 340,
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
  cta: {
    width: '100%',
    maxWidth: 420,
  },
  hint: {
    fontSize: 12,
    fontFamily: Fonts.sans,
  },
  pressed: {
    opacity: 0.75,
  },
});
