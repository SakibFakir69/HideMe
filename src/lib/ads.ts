import type { InterstitialAd, RewardedAd } from 'react-native-google-mobile-ads';
import * as SecureStore from 'expo-secure-store';

import { canShowInterstitial, isImportInterstitialDue } from './ads-cap-core';
import { getAdsModule, resolveUnitId, type AdsModule } from './ads-native';
import { isPremium } from './premium';

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
const IMPORT_COUNT_KEY = 'ads.imports.completed';

let initPromise: Promise<AdsModule | null> | null = null;
let interstitial: InterstitialAd | null = null;
let interstitialLoaded = false;
let lastInterstitialShownAt = 0;
let completedImports = 0;

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
          const [lastRaw, importsRaw] = await Promise.all([
            SecureStore.getItemAsync(LAST_INTERSTITIAL_KEY),
            SecureStore.getItemAsync(IMPORT_COUNT_KEY),
          ]);
          const parsed = Number(lastRaw ?? 0);
          if (Number.isFinite(parsed) && parsed > 0) lastInterstitialShownAt = parsed;
          const imports = Number.parseInt(importsRaw ?? '', 10);
          if (Number.isFinite(imports) && imports > 0) completedImports = imports;
        }
      } catch {
        // cap persistence is best-effort; in-memory counters still apply
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

async function persistCompletedImports(count: number): Promise<void> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    await SecureStore.setItemAsync(IMPORT_COUNT_KEY, String(count));
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
  // Premium removes every ad: no SDK init, no preload, nothing to leak.
  if (isPremium()) return;
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
 * Unlock interstitial: shown after a successful unlock when the rolling 24h
 * cap allows and an ad is already loaded. Never throws; never blocks
 * navigation (call after it). Delays ~800ms so the destination screen feels
 * instant.
 */
export async function maybeShowInterstitial(): Promise<void> {
  try {
    if (isPremium()) return;
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
    lastInterstitialShownAt = now;
    void persistLastInterstitial(now);
    await presentLoadedInterstitial();
  } catch {
    // not loaded / declined / destroyed — never surface to the user
  }
}

/** Present the already-loaded interstitial singleton, if any. */
async function presentLoadedInterstitial(): Promise<void> {
  const ad = interstitial;
  if (!ad || !interstitialLoaded) return;
  interstitialLoaded = false;
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  await ad.show();
}

/**
 * Import interstitial: counts completed import batches (one picker session =
 * one import) and shows a fullscreen ad after every 2nd import. This path is
 * intentionally separate from the unlock cap — the 24h limit only applies to
 * the post-unlock ad, so a user who imports regularly still sees the
 * configured import placement. Call once after an import actually completed.
 */
export async function maybeShowImportInterstitial(): Promise<void> {
  try {
    if (isPremium()) return;
    const ads = await ensureReady();
    if (!ads) return;
    completedImports += 1;
    void persistCompletedImports(completedImports);
    if (!isImportInterstitialDue(completedImports)) return;
    if (!interstitial) {
      createInterstitial(ads);
      return;
    }
    if (!interstitialLoaded) {
      interstitial.load();
      return;
    }
    await presentLoadedInterstitial();
  } catch {
    // never surface an ad failure to the user
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
    // Premium includes the auto-lock pause without watching an ad.
    if (isPremium()) return 'earned';
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
