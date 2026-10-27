import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const STORE_KEY = 'theme.pref';

let current: ThemePref = 'system';
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getThemePref(): ThemePref {
  return current;
}

export function setThemePref(pref: ThemePref): void {
  current = pref;
  emit();
  void SecureStore.setItemAsync(STORE_KEY, pref).catch(() => {
    // preference simply won't persist — UI keeps working
  });
}

/** Call once at app start; safe to call repeatedly. */
export async function loadThemePref(): Promise<ThemePref> {
  if (loaded) return current;
  loaded = true;
  try {
    const stored = await SecureStore.getItemAsync(STORE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      if (stored !== current) {
        current = stored;
        emit();
      }
    }
  } catch {
    // fall back to system
  }
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, getThemePref, getThemePref);
}
