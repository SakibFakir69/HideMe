/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemePref } from '@/lib/theme-pref';

export function useTheme() {
  const systemScheme = useColorScheme();
  const pref = useThemePref();
  const scheme = pref === 'system' ? systemScheme : pref;
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return Colors[theme];
}
