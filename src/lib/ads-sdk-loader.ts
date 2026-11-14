import type * as AdsSdk from 'react-native-google-mobile-ads';

/**
 * Loads the Google Mobile Ads SDK, or null when this platform has none.
 *
 * The default implementation (this file) never loads the SDK: it is the
 * fallback for platforms without an ads implementation. The native build
 * gets `ads-sdk-loader.native.ts`, which resolves the SDK lazily.
 *
 * The split exists because the SDK's components import React Native
 * internals. Bundling it for the web (and for the server bundle the release
 * build produces) fails, so the import has to live in a file only the
 * native platform resolves.
 */

export type AdsModule = typeof AdsSdk;

/** No SDK on this platform. */
export function loadAdsSdk(): AdsModule | null {
  return null;
}
