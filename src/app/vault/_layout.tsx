import { Redirect, Stack } from 'expo-router';

import { BinReminderSync } from '@/components/vault/bin-reminder-sync';
import { PrivacyShield } from '@/components/vault/privacy-shield';
import { ToastHost } from '@/components/ui/toast-host';
import { useVaultUnlocked } from '@/lib/vault-session';

export default function VaultLayout() {
  const unlocked = useVaultUnlocked();
  if (!unlocked) return <Redirect href="/calculator-disguise" />;
  return (
    <>
      <PrivacyShield />
      <BinReminderSync />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="folder/[id]" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="bin" />
        <Stack.Screen name="import" />
        <Stack.Screen name="premium" />
        <Stack.Screen name="auto-lock" />
        <Stack.Screen name="app-icon" />
        <Stack.Screen name="intruder" />
        <Stack.Screen name="backup" />
      </Stack>
      <ToastHost />
    </>
  );
}
