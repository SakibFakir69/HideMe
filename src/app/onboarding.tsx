import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
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
    title: 'Looks like a calculator',
    body: 'It is one. A fully working calculator is the disguise — nobody peeking over your shoulder will find anything else.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Your code opens a hidden vault',
    body: 'Type your secret code into the calculator and it unlocks an encrypted vault for photos, videos and documents. Everything stays on this device.',
  },
  {
    icon: 'warning-outline',
    title: 'There is no password reset',
    body: 'Your files are encrypted with a key only your code can open. Lose the code and the files are unrecoverable — write it down somewhere safe.',
  },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const current = PAGES[page];
  const isLast = page === PAGES.length - 1;

  const finish = () => {
    void markOnboarded().finally(() => router.replace('/setup-secret'));
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <View style={styles.spacer} />
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

        <View style={styles.body}>
          <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name={current.icon} size={40} color="#6366F1" />
          </View>
          <ThemedText type="title" style={styles.title}>
            {current.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
            {current.body}
          </ThemedText>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === page ? '#6366F1' : theme.backgroundSelected },
                ]}
              />
            ))}
          </View>
          <Pressable
            onPress={() => (isLast ? finish() : setPage(page + 1))}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Set up secret code' : 'Next'}
            style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
            <ThemedText type="small" style={styles.nextText}>
              {isLast ? 'Set up my code' : 'Next'}
            </ThemedText>
          </Pressable>
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
    paddingHorizontal: Spacing.four,
  },
  topRow: {
    flexDirection: 'row',
    paddingTop: Spacing.two,
  },
  spacer: {
    flex: 1,
  },
  skip: {
    padding: Spacing.two,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 22,
    textAlign: 'center',
  },
  text: {
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  next: {
    backgroundColor: '#6366F1',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.six,
    minHeight: 44,
    justifyContent: 'center',
  },
  nextText: {
    color: '#ffffff',
    fontFamily: Fonts.sansBold,
  },
  pressed: {
    opacity: 0.75,
  },
});
