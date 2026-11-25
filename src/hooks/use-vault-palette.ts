import { VAULT_DARK, VAULT_LIGHT, type VaultPalette } from '@/constants/vault-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemePref } from '@/lib/theme-pref';

/**
 * The palette the vault screens paint themselves with. It follows the app
 * theme, but it is not the app palette: the vault has its own surfaces and
 * its own accent.
 */
export function useVaultPalette(): VaultPalette {
  const systemScheme = useColorScheme();
  const pref = useThemePref();
  const scheme = pref === 'system' ? systemScheme : pref;
  return scheme === 'dark' ? VAULT_DARK : VAULT_LIGHT;
}
