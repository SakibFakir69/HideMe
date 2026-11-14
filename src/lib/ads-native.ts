import type * as AdsSdk from 'react-native-google-mobile-ads';

import { PRODUCTION_UNITS, USE_TEST_ADS } from '@/constants/ads';
import { loadAdsSdk } from './ads-sdk-loader';

/**
 * Lazy loader for the Google Mobile Ads SDK.
 *
 * The SDK itself lives behind a platform loader (`ads-sdk-loader.native.ts`),
 * because its components import React Native internals that must not end up
 * in the web or server bundle. The native loader resolves the SDK lazily and
 * behind a try/catch, so a missing native side only disables the ads.
 */

export type AdsModule = typeof AdsSdk;
export type AdUnitKind = 'banner' | 'interstitial' | 'rewarded';

/** Returns the SDK, or null when this runtime has no Ads native module. */
export function getAdsModule(): AdsModule | null {
  return loadAdsSdk();
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
