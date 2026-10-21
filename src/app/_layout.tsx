import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { startAutoLockWatcher } from '@/lib/vault-autolock';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    startAutoLockWatcher();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="calculator-disguise" />
        <Stack.Screen name="setup-secret" />
        <Stack.Screen name="vault" />
      </Stack>
    </ThemeProvider>
  );
}
