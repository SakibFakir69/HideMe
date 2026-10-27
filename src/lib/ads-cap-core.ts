/**
 * Pure frequency-cap logic for fullscreen ads — unit-testable under node.
 */

/** Hard cap: at most one interstitial per rolling 24 hours. */
export const INTERSTITIAL_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * May an interstitial be shown right now, given the last show timestamp?
 * - never shown before → yes
 * - clock moved backwards past the last show → no (conservative)
 * - within the 24h window → no
 * - at/after the window → yes
 */
export function canShowInterstitial(nowMs: number, lastShownMs: number): boolean {
  if (!Number.isFinite(lastShownMs) || lastShownMs <= 0) return true;
  if (nowMs < lastShownMs) return false;
  return nowMs - lastShownMs >= INTERSTITIAL_CAP_WINDOW_MS;
}
