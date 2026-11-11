/**
 * Pure frequency-cap logic for fullscreen ads — unit-testable under node.
 */

/** Hard cap: at most one interstitial per rolling 24 hours after unlock. */
export const INTERSTITIAL_CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Ads after imports: one interstitial per this many completed import batches. */
export const IMPORTS_PER_INTERSTITIAL = 2;

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

/**
 * Is an import interstitial due after `completedImports` successful imports?
 * Imports are counted per completed batch (one picker session), not per file.
 * The first import never shows an ad; every 2nd, 4th, 6th … does.
 */
export function isImportInterstitialDue(
  completedImports: number,
  every: number = IMPORTS_PER_INTERSTITIAL,
): boolean {
  if (!Number.isFinite(completedImports) || completedImports <= 0) return false;
  if (!Number.isFinite(every) || every < 1) return false;
  return completedImports % every === 0;
}
