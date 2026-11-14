import type { AdsModule } from './ads-sdk-loader';

/**
 * The web has no ads SDK: its components import React Native internals that
 * cannot be bundled for a browser or for the server bundle.
 *
 * The native implementation lives in `ads-sdk-loader.native.ts`; the shared
 * default in `ads-sdk-loader.ts` does the same thing, this file only makes
 * the intent explicit.
 */
export function loadAdsSdk(): AdsModule | null {
  return null;
}
