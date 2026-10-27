/**
 * AdMob unit IDs.
 *
 * IMPORTANT: do not import `react-native-google-mobile-ads` from this file.
 * It is pulled in by the root layout at boot, and the SDK calls
 * `TurboModuleRegistry.getEnforcing('RNGoogleMobileAdsModule')` as soon as its
 * module graph is evaluated. In Expo Go — or a dev client built before the ads
 * package was installed — that throws during startup, so the whole app never
 * opens. The SDK is loaded lazily in `lib/ads-native.ts` instead.
 */

export const USE_TEST_ADS = __DEV__;

export const PRODUCTION_UNITS = {
  banner: 'ca-app-pub-6208140455870067/6422239351',
  interstitial: 'ca-app-pub-6208140455870067/2462638031',
  rewarded: 'ca-app-pub-6208140455870067/4937910484',
} as const;

/** Rewarded perk: length of the auto-lock pause granted for watching an ad. */
export const AUTO_LOCK_PAUSE_MS = 60 * 60 * 1000;
