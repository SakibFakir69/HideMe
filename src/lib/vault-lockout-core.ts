/**
 * Pure failed-PIN lockout policy — no platform imports, unit-testable
 * under node.
 *
 * First FREE_ATTEMPTS wrong codes cost nothing; every attempt after that
 * adds an exponentially growing delay, capped at MAX_DELAY_MS. The caller
 * persists the state (SecureStore) so a restart cannot reset the counter.
 */

export const FREE_ATTEMPTS = 3;
export const BASE_DELAY_MS = 15_000;
export const MAX_DELAY_MS = 15 * 60_000;

export interface LockoutState {
  /** consecutive failed attempts (cleared on success) */
  fails: number;
  /** epoch ms until which the PIN path stays locked out */
  until: number;
}

/** Delay imposed by the nth consecutive failure. */
export function backoffDelayMs(fails: number): number {
  if (fails <= FREE_ATTEMPTS) return 0;
  const over = fails - FREE_ATTEMPTS; // 1 for the 4th failure
  const delay = BASE_DELAY_MS * 2 ** (over - 1);
  return Math.min(delay, MAX_DELAY_MS);
}

/** Next state after one more failed attempt (now = epoch ms). */
export function computeFailure(state: LockoutState | null, now: number): LockoutState {
  const fails = (state?.fails ?? 0) + 1;
  return { fails, until: now + backoffDelayMs(fails) };
}

/** Milliseconds left in a lockout (0 when none / expired). */
export function remainingMs(state: LockoutState | null, now: number): number {
  if (!state) return 0;
  return Math.max(0, state.until - now);
}

export function isLockedOut(state: LockoutState | null, now: number): boolean {
  return remainingMs(state, now) > 0;
}
