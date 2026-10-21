import * as SecureStore from 'expo-secure-store';

import { computeFailure, type LockoutState } from './vault-lockout-core';

export {
  BASE_DELAY_MS,
  FREE_ATTEMPTS,
  MAX_DELAY_MS,
  backoffDelayMs,
  computeFailure,
  isLockedOut,
  remainingMs,
  type LockoutState,
} from './vault-lockout-core';

/**
 * Persistent failed-PIN lockout state. Stored in SecureStore so an attacker
 * cannot reset the backoff counter by force-quitting the app; cleared only
 * after a successful unlock.
 */

const STORAGE_KEY = 'vault.pin.lockout';

function isValidState(value: unknown): value is LockoutState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<LockoutState>;
  return (
    typeof state.fails === 'number' &&
    Number.isFinite(state.fails) &&
    state.fails > 0 &&
    typeof state.until === 'number' &&
    Number.isFinite(state.until)
  );
}

export async function getLockoutState(): Promise<LockoutState | null> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return null;
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function saveState(state: LockoutState | null): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    if (state === null) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } else {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // best-effort: an unpersisted failure still counts for this session
  }
}

/** Count one failed PIN attempt and return the resulting state. */
export async function recordPinFailure(): Promise<LockoutState> {
  const next = computeFailure(await getLockoutState(), Date.now());
  await saveState(next);
  return next;
}

/** Reset the counter after a successful unlock. */
export async function clearPinFailures(): Promise<void> {
  await saveState(null);
}
