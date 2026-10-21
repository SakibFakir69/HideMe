/**
 * Pure auto-lock policy — no platform imports, unit-testable under node.
 */

export const AUTOLOCK_OPTIONS = [0, 30, 60, 300] as const;
export type AutoLockSeconds = (typeof AUTOLOCK_OPTIONS)[number];
export const DEFAULT_AUTOLOCK_SECONDS: AutoLockSeconds = 60;

/** Should the vault lock given this elapsed time away from the foreground? */
export function shouldAutoLock(elapsedMs: number, thresholdS: number): boolean {
  if (elapsedMs < 0) return false;
  if (thresholdS <= 0) return true;
  return elapsedMs >= thresholdS * 1000;
}

export function isValidAutoLockSeconds(value: unknown): value is AutoLockSeconds {
  return typeof value === 'number' && (AUTOLOCK_OPTIONS as readonly number[]).includes(value);
}
