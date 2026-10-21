import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/**
 * Web variant: subscribe to the OS color scheme so statically rendered pages
 * hydrate without mismatches — the server snapshot is always 'light'.
 */
function subscribe(onStoreChange: () => void): () => void {
  const subscription = Appearance.addChangeListener(() => onStoreChange());
  return () => subscription.remove();
}

function getSnapshot(): 'light' | 'dark' {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

function getServerSnapshot(): 'light' {
  return 'light';
}

export function useColorScheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
