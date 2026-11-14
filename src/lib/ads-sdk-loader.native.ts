import type { AdsModule } from './ads-sdk-loader';

/**
 * The native ads SDK loader.
 *
 * The SDK's native TurboModule is resolved eagerly (`getEnforcing`) the moment
 * its JS module graph is evaluated. A normal static import would therefore
 * crash the app during boot whenever the native side is missing — Expo Go, a
 * stale dev client built before the package was added, or a web build.
 * Requiring it behind a try/catch keeps the vault usable and simply disables
 * ads.
 */

let cached: AdsModule | null | undefined;

/** Returns the SDK, or null when this runtime has no Ads native module. */
export function loadAdsSdk(): AdsModule | null {
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
