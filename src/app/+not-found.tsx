import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { VAULT_DARK } from '@/constants/vault-theme';

/**
 * Catch-all for any URL that matches no route.
 *
 * Expo Router's default reaction to an unmatched path is a red "Unmatched
 * route" screen, which is a dead end — on a first launch it would sit in front
 * of onboarding entirely. There is exactly one sensible destination: the boot
 * router at `/`, which decides between onboarding, first-time PIN setup and
 * the disguised gate. Sending unknown paths there turns every miss into the
 * correct first screen instead of an error.
 */
export default function NotFoundScreen() {
  useEffect(() => {
    router.replace('/');
  }, []);

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={VAULT_DARK.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VAULT_DARK.background,
  },
});
