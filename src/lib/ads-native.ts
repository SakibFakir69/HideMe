import type * as AdsSdk from 'react-native-google-mobile-ads';

import { PRODUCTION_UNITS, USE_TEST_ADS } from '@/constants/ads';

/**
 * Lazy loader for the Google Mobile Ads SDK.
 *
 * The SDK's native TurboModule is resolved eagerly (`getEnforcing`) the moment
 * its JS module graph is evaluated. A normal static import would therefore
 * crash the app during boot whenever the native side is missing — Expo Go, a
 * stale dev client built before the package was added, or a web build. Requiring
 * it behind a try/catch keeps the vault usable and simply disables ads.
 */

export type AdsModule = typeof AdsSdk;
export type AdUnitKind = 'banner' | 'interstitial' | 'rewarded';

let cached: AdsModule | null | undefined;

/** Returns the SDK, or null when this runtime has no Ads native module. */
export function getAdsModule(): AdsModule | null {
  if (cached !== undefined) return cached;
  try {
    // Static string keeps Metro bundling it; the try/catch stops the native
    // module lookup from tearing down the JS context.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function isAdsAvailable(): boolean {
  return getAdsModule() !== null;
}

const TEST_KEYS: Record<AdUnitKind, 'BANNER' | 'INTERSTITIAL' | 'REWARDED'> = {
  banner: 'BANNER',
  interstitial: 'INTERSTITIAL',
  rewarded: 'REWARDED',
};

/** Production unit in release builds, Google's test unit in development. */
export function resolveUnitId(kind: AdUnitKind): string {
  const ads = getAdsModule();
  if (USE_TEST_ADS && ads) {
    return ads.TestIds[TEST_KEYS[kind]];
  }
  return PRODUCTION_UNITS[kind];
}
