import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { hasSecret } from '@/lib/vault-secret';

/**
 * App entry: send the user to first-time setup or the disguised gate.
 * Replaces the template's (tabs) group — this app has no tabs.
 */
export default function Index() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    hasSecret().then((exists) => {
      if (cancelled) return;
      router.replace(exists ? '/calculator-disguise' : '/setup-secret');
      setChecking(false);
    });
    return () => {
      cancelled = true;
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
