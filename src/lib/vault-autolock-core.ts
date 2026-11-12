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

/**
 * A system picker (photo library, document picker) runs in its own activity,
 * so the app is backgrounded while the user browses their files. Locking then
 * would destroy the import on return. The grace is short and one-shot: the
 * vault still locks if the user wanders off from the picker.
 */
export const PICKER_GRACE_MS = 5 * 60_000;

/** Is the bounded picker grace still open at this instant? */
export function isPickerGraceActive(nowMs: number, graceUntilMs: number): boolean {
  if (!Number.isFinite(graceUntilMs) || graceUntilMs <= 0) return false;
  return nowMs < graceUntilMs;
}

/**
 * A rewarded pause suppresses *timed* auto-lock until overrideUntil.
 * Threshold 0 ("Immediately") is a deliberate security choice and is
 * never suppressed.
 */
export function isAutoLockSuppressed(
  nowMs: number,
  overrideUntilMs: number,
  thresholdS: number,
): boolean {
  if (thresholdS <= 0) return false;
  if (!Number.isFinite(overrideUntilMs) || overrideUntilMs <= 0) return false;
  return nowMs < overrideUntilMs;
}
