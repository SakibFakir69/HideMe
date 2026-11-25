/**
 * Pure frequency logic for fullscreen ads — unit-testable under node.
 *
 * The post-unlock ad has no cap: it shows on every unlock. Only the import
 * placement still follows a rule, so importing constantly cannot stack ads.
 */

/** Ads after imports: one interstitial per this many completed import batches. */
export const IMPORTS_PER_INTERSTITIAL = 2;

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
