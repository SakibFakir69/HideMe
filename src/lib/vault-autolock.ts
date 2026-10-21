import * as SecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';

import {
  DEFAULT_AUTOLOCK_SECONDS,
  isValidAutoLockSeconds,
  shouldAutoLock,
  type AutoLockSeconds,
} from './vault-autolock-core';
import { isUnlocked, lock } from './vault-session';

export {
  AUTOLOCK_OPTIONS,
  DEFAULT_AUTOLOCK_SECONDS,
  shouldAutoLock,
  type AutoLockSeconds,
} from './vault-autolock-core';

/**
 * Auto-lock: the vault locks itself shortly after the app leaves the
 * foreground. Threshold 0 ("Immediately") locks on the background event
 * itself; larger thresholds lock on return, using the timestamp recorded at
 * backgrounding. The threshold is a UI preference (not a secret) but lives
 * in SecureStore with the rest of the vault config.
 */

const STORAGE_KEY = 'vault.autolock';

let cachedThreshold: AutoLockSeconds = DEFAULT_AUTOLOCK_SECONDS;
let cacheLoaded = false;
let started = false;
let backgroundedAt: number | null = null;

async function readStoredSeconds(): Promise<AutoLockSeconds> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return DEFAULT_AUTOLOCK_SECONDS;
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw === null) return DEFAULT_AUTOLOCK_SECONDS;
    const parsed: unknown = JSON.parse(raw);
    return isValidAutoLockSeconds(parsed) ? parsed : DEFAULT_AUTOLOCK_SECONDS;
  } catch {
    return DEFAULT_AUTOLOCK_SECONDS;
  }
}

/** Current threshold, cached in memory. Loads from storage on first call. */
export async function getAutoLockSeconds(): Promise<AutoLockSeconds> {
  if (!cacheLoaded) {
    cachedThreshold = await readStoredSeconds();
    cacheLoaded = true;
  }
  return cachedThreshold;
}

export async function setAutoLockSeconds(seconds: AutoLockSeconds): Promise<void> {
  cachedThreshold = seconds;
  cacheLoaded = true;
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(seconds));
  } catch {
    // preference persistence is best-effort; in-memory value still applies
  }
}

function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'background') {
    if (!isUnlocked()) {
      backgroundedAt = null;
      return;
    }
    backgroundedAt = Date.now();
    if (cachedThreshold === 0) {
      // lock immediately; if JS suspends first, the active handler catches it
      lock();
      backgroundedAt = null;
    }
    return;
  }
  if (state === 'active') {
    if (backgroundedAt === null) return;
    const elapsed = Date.now() - backgroundedAt;
    backgroundedAt = null;
    if (!isUnlocked()) return;
    if (shouldAutoLock(elapsed, cachedThreshold)) lock();
  }
}

/**
 * Idempotent singleton: loads the threshold and subscribes to AppState.
 * Called once from the root layout.
 */
export function startAutoLockWatcher(): void {
  if (started) return;
  started = true;
  void getAutoLockSeconds(); // warm the cache
  AppState.addEventListener('change', handleAppStateChange);
}
