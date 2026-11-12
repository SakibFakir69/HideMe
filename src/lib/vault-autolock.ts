import * as SecureStore from 'expo-secure-store';
import { AppState, type AppStateStatus } from 'react-native';

import {
  DEFAULT_AUTOLOCK_SECONDS,
  isAutoLockSuppressed,
  isPickerGraceActive,
  isValidAutoLockSeconds,
  PICKER_GRACE_MS,
  shouldAutoLock,
  type AutoLockSeconds,
} from './vault-autolock-core';
import { isUnlocked, lock } from './vault-session';

export {
  AUTOLOCK_OPTIONS,
  DEFAULT_AUTOLOCK_SECONDS,
  isAutoLockSuppressed,
  isPickerGraceActive,
  PICKER_GRACE_MS,
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
const OVERRIDE_KEY = 'vault.autolock.overrideUntil';

let cachedThreshold: AutoLockSeconds = DEFAULT_AUTOLOCK_SECONDS;
let cacheLoaded = false;
let started = false;
let backgroundedAt: number | null = null;
let overrideUntil = 0;
/** Bounded window during which a system picker may cover the app. */
let pickerGraceUntil = 0;

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
      // A picker owns the screen right now, so locking here would destroy the
      // import the user is in the middle of. The grace is short and one-shot:
      // staying away past it still locks (on return, or on the next event).
      if (isPickerGraceActive(Date.now(), pickerGraceUntil)) return;
      // lock immediately; if JS suspends first, the active handler catches it
      lock();
      backgroundedAt = null;
    }
    return;
  }
  if (state === 'active') {
    if (backgroundedAt === null) {
      // Returning from a picker without a background event: nothing to do,
      // but the grace must not leak into a later, unrelated background.
      pickerGraceUntil = 0;
      return;
    }
    const elapsed = Date.now() - backgroundedAt;
    const graced = isPickerGraceActive(Date.now(), pickerGraceUntil);
    backgroundedAt = null;
    pickerGraceUntil = 0;
    if (!isUnlocked()) return;
    // The user was browsing the photo library or a folder, not away from the
    // app — hand them back the vault they left.
    if (graced) return;
    // "Immediately" always locks; a rewarded pause only suppresses timed locks.
    if (isAutoLockSuppressed(Date.now(), overrideUntil, cachedThreshold)) return;
    if (shouldAutoLock(elapsed, cachedThreshold)) lock();
  }
}

/**
 * Opens the picker grace window. Called right before a system picker is
 * launched, so the vault survives the time the picker covers the app.
 */
export function beginPickerGrace(): void {
  pickerGraceUntil = Date.now() + PICKER_GRACE_MS;
}

async function loadOverride(): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    const raw = await SecureStore.getItemAsync(OVERRIDE_KEY);
    const parsed = Number(raw ?? 0);
    overrideUntil = Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
  } catch {
    overrideUntil = 0;
  }
}

/** Granted by a completed rewarded ad: pauses *timed* auto-lock until then. */
export async function grantAutoLockPause(durationMs: number): Promise<number> {
  overrideUntil = Date.now() + durationMs;
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(OVERRIDE_KEY, String(overrideUntil));
    }
  } catch {
    // persistence is best-effort; in-memory pause still applies
  }
  return overrideUntil;
}

/** Timestamp (ms) until which timed auto-lock is paused; 0 when inactive. */
export function getAutoLockOverrideUntil(): number {
  return overrideUntil;
}

/**
 * Idempotent singleton: loads the threshold and subscribes to AppState.
 * Called once from the root layout.
 */
export function startAutoLockWatcher(): void {
  if (started) return;
  started = true;
  void getAutoLockSeconds(); // warm the cache
  void loadOverride();
  AppState.addEventListener('change', handleAppStateChange);
}
