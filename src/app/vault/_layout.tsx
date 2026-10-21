import { Redirect, Stack } from 'expo-router';

import { PrivacyShield } from '@/components/vault/privacy-shield';
import { useVaultUnlocked } from '@/lib/vault-session';

export default function VaultLayout() {
  const unlocked = useVaultUnlocked();
  if (!unlocked) return <Redirect href="/calculator-disguise" />;
  return (
    <>
      <PrivacyShield />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="folder/[id]" />
        <Stack.Screen name="item/[id]" />
        <Stack.Screen name="settings" />
      </Stack>
    </>
  );
}
