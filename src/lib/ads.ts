import type { InterstitialAd, RewardedAd } from 'react-native-google-mobile-ads';
import * as SecureStore from 'expo-secure-store';

import { canShowInterstitial } from './ads-cap-core';
import { getAdsModule, resolveUnitId, type AdsModule } from './ads-native';

/**
 * Module-level AdMob controller.
 *
 * The SDK is never imported at module scope: `getAdsModule()` resolves it
 * lazily and returns null when the native side is unavailable, so a missing
 * ads module can never prevent the vault from starting. Fullscreen ads are
 * imperative singletons (create → load → show); banners are mounted as
 * components. Nothing here may throw into a caller — ads are best-effort
 * decoration around a working vault.
 */

const LAST_INTERSTITIAL_KEY = 'ads.interstitial.lastShown';

let initPromise: Promise<AdsModule | null> | null = null;
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let lastInterstitialShownAt = 0;

let rewarded: RewardedAd | null = null;
let rewardedLoaded = false;
let rewardedEarned = false;

function ensureReady(): Promise<AdsModule | null> {
  if (!initPromise) {
    initPromise = (async () => {
      const ads = getAdsModule();
      if (!ads) return null;
      try {
        if (await SecureStore.isAvailableAsync()) {
          const raw = await SecureStore.getItemAsync(LAST_INTERSTITIAL_KEY);
          const parsed = Number(raw ?? 0);
          if (Number.isFinite(parsed) && parsed > 0) lastInterstitialShownAt = parsed;
        }
      } catch {
        // cap persistence is best-effort; in-memory cap still applies
      }
      try {
        await ads.MobileAds().initialize();
      } catch {
        // SDK failed to initialize (no Play Services, offline, …): show no ads
      }
      return ads;
    })();
  }
  return initPromise;
}

async function persistLastInterstitial(now: number): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(LAST_INTERSTITIAL_KEY, String(now));
  } catch {
    // best-effort
  }
}

function createInterstitial(ads: AdsModule): void {
  interstitial = ads.InterstitialAd.createForAdRequest(resolveUnitId('interstitial'));
  interstitial.addAdEventListener(ads.AdEventType.LOADED, () => {
    interstitialLoaded = true;
  });
  interstitial.addAdEventListener(ads.AdEventType.ERROR, () => {
    interstitialLoaded = false;
  });
  interstitial.addAdEventListener(ads.AdEventType.CLOSED, () => {
    interstitialLoaded = false;
    // keep the next one warm for the following opportunity
    interstitial?.load();
  });
  interstitial.load();
}

function createRewarded(ads: AdsModule): void {
  rewarded = ads.RewardedAd.createForAdRequest(resolveUnitId('rewarded'));
  rewarded.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
    rewardedLoaded = true;
  });
  rewarded.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
    rewardedEarned = true;
  });
  rewarded.addAdEventListener(ads.AdEventType.ERROR, () => {
    rewardedLoaded = false;
  });
  rewarded.addAdEventListener(ads.AdEventType.CLOSED, () => {
    rewardedLoaded = false;
    rewarded?.load();
  });
  rewarded.load();
}

/** Called once from the root layout. Preloads fullscreen inventory. */
export function initAds(): void {
  // Defer past first paint: the ads JS graph is large and its TurboModule must
  // stay off the critical startup path. `setTimeout(0)` still runs after the
  // first frame in React Native, but a short delay keeps unlock snappy too.
  setTimeout(() => {
    void ensureReady()
      .then((ads) => {
        if (!ads) return;
        createInterstitial(ads);
        createRewarded(ads);
      })
      .catch(() => {
        // ads unavailable; vault must keep working
      });
  }, 1_500);
}

/**
 * Show the unlock/import interstitial if the 24h cap allows and an ad is
 * already loaded. Never throws; never blocks navigation (call after it).
 * Delays ~800ms before showing so the destination screen feels instant.
 */
export async function maybeShowInterstitial(): Promise<void> {
  try {
    const ads = await ensureReady();
    if (!ads) return;
    const now = Date.now();
    if (!canShowInterstitial(now, lastInterstitialShownAt)) return;
    if (!interstitial) {
      createInterstitial(ads);
      return;
    }
    if (!interstitialLoaded) {
      interstitial.load();
      return;
    }
    const ad = interstitial;
    interstitialLoaded = false;
    lastInterstitialShownAt = now;
    void persistLastInterstitial(now);
    await new Promise<void>((resolve) => setTimeout(resolve, 800));
    await ad.show();
  } catch {
    // not loaded / declined / destroyed — never surface to the user
  }
}

export type RewardedResult = 'earned' | 'closed' | 'unavailable';

/**
 * Show the rewarded ad. Resolves 'earned' only when the SDK confirmed the
 * reward (EARNED_REWARD), 'closed' when the user skipped without earning,
 * 'unavailable' when nothing was ready. Callers must grant rewards only on
 * 'earned'. Reloads the next rewarded ad after close.
 */
export async function showRewardedAd(): Promise<RewardedResult> {
  try {
    const ads = await ensureReady();
    if (!ads) return 'unavailable';
    if (!rewarded) createRewarded(ads);
    if (!rewardedLoaded || !rewarded) return 'unavailable';
    const ad = rewarded;
    rewardedLoaded = false;
    rewardedEarned = false;
    await ad.show();
    return rewardedEarned ? 'earned' : 'closed';
  } catch {
    return 'unavailable';
  }
}
