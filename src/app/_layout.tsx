import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { initAds } from '@/lib/ads';
import { syncPremiumFromStore } from '@/lib/iap';
import { loadPremium } from '@/lib/premium';
import { initReminders } from '@/lib/reminders';
import { loadThemePref, useThemePref } from '@/lib/theme-pref';
import { startAutoLockWatcher } from '@/lib/vault-autolock';

// Keep the native splash up until Inter is ready, so text never flashes in
// the system font first.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const pref = useThemePref();
  const colorScheme = pref === 'system' ? systemScheme : pref;
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    startAutoLockWatcher();
    // Load the local entitlement, reconcile it with the store (restores after
    // a reinstall), then start ads so premium users never initialise the SDK.
    void loadPremium()
      .then(() => syncPremiumFromStore())
      .then(() => initAds());
    void initReminders();
    void loadThemePref();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="calculator-disguise" />
          <Stack.Screen name="unlock-success" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="setup-secret" />
          <Stack.Screen name="vault" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
