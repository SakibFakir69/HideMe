import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { VAULT_DARK } from '@/constants/vault-theme';
import { getDevEntry } from '@/lib/dev-entry';
import { hasOnboarded } from '@/lib/onboarding';
import { purgeTempPlaintext } from '@/lib/vault-store';
import { hasSecret } from '@/lib/vault-secret';
import { isNativePbkdf2Available } from '../../modules/vault-crypto';

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

    // A cold start is always locked: drop any decrypted cache a killed session
    // (or an interrupted share) left behind before routing anywhere.
    purgeTempPlaintext();

    // The native PBKDF2 provider only exists in a real development build. In
    // Expo Go it is absent and every unlock silently drops to the pure-JS
    // implementation — 210k rounds then costs well over a minute instead of
    // ~2 s. Say so at boot instead of letting it look like a frozen app.
    if (__DEV__ && !isNativePbkdf2Available()) {
      console.warn(
        '[vault] VaultCrypto is not registered — PIN unlock will use pure-JS PBKDF2 and take over a minute. ' +
          'This is Expo Go (or a build made before modules/vault-crypto existed); open the development build instead.',
      );
    }

    // Dev builds can be sent straight to a screen — the first-run flow is
    // otherwise unreachable once the app is set up.
    const devEntry = getDevEntry();
    if (__DEV__) console.log('[dev-entry]', devEntry);
    if (devEntry) {
      if (!active) return;
      active = false;
      router.replace(`/${devEntry}`);
      return;
    }

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
      <View style={[styles.loading, { backgroundColor: VAULT_DARK.background }]}>
        <ActivityIndicator color={VAULT_DARK.accent} />
      </View>
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
