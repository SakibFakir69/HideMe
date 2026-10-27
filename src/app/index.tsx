import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { hasOnboarded } from '@/lib/onboarding';
import { hasSecret } from '@/lib/vault-secret';

/** A boot that never resolves is worse than the wrong screen. */
const BOOT_TIMEOUT_MS = 3_000;

/**
 * App entry: send the user to onboarding, first-time setup, or the
 * disguised gate. Replaces the template's (tabs) group — no tabs here.
 */
export default function Index() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // SecureStore/Keystore can occasionally stall on a cold start (or on an
    // emulator without a secure lock screen). Falling back to the gate keeps
    // the app usable instead of leaving a spinner up forever.
    timer = setTimeout(() => {
      if (!active) return;
      active = false;
      setChecking(false);
      router.replace('/calculator-disguise');
    }, BOOT_TIMEOUT_MS);

    void (async () => {
      try {
        const exists = await hasSecret();
        if (!exists) {
          const onboarded = await hasOnboarded();
          if (!active) return;
          active = false;
          router.replace(onboarded ? '/setup-secret' : '/onboarding');
          return;
        }
        if (!active) return;
        active = false;
        router.replace('/calculator-disguise');
      } catch {
        if (!active) return;
        active = false;
        router.replace('/calculator-disguise');
      } finally {
        if (timer) clearTimeout(timer);
        setChecking(false);
      }
    })();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (checking) {
    return (
      <ThemedView style={styles.loading}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
