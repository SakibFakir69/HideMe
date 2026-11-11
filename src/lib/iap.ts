import type { Product, Purchase } from 'expo-iap';

import { PREMIUM_PRODUCT_ID } from '@/constants/premium';
import { grantPremium, isPremium } from './premium';

/**
 * Store bridge for the one-time premium purchase.
 *
 * `expo-iap` is loaded lazily so web builds, Expo Go and store-less builds can
 * still render the paywall (with a clear "unavailable" state) instead of
 * crashing while the module is missing.
 */

type IapModule = typeof import('expo-iap');

let connection: Promise<IapModule | null> | null = null;
let listenersBound = false;

const successListeners = new Set<(purchase: Purchase) => void>();
const errorListeners = new Set<(message: string) => void>();

function emitSuccess(purchase: Purchase): void {
  for (const listener of successListeners) listener(purchase);
}

function emitError(message: string): void {
  for (const listener of errorListeners) listener(message);
}

function bindListeners(iap: IapModule): void {
  if (listenersBound) return;
  listenersBound = true;

  iap.purchaseUpdatedListener((purchase) => {
    if (purchase.productId !== PREMIUM_PRODUCT_ID) return;
    // Grant first: the user paid, and a failed finish call must never hide the
    // entitlement. `finishTransaction` acknowledges to the store; on Android
    // an unfinished purchase is refunded after 3 days.
    void (async () => {
      await grantPremium('purchase', purchase.productId);
      try {
        await iap.finishTransaction({ purchase, isConsumable: false });
      } catch {
        // already finished / transient failure — entitlement stays granted
      }
      emitSuccess(purchase);
    })();
  });

  iap.purchaseErrorListener((error) => {
    if (iap.isUserCancelledError(error)) return;
    emitError(iap.getUserFriendlyErrorMessage(error));
  });
}

async function ensureConnection(): Promise<IapModule | null> {
  if (connection) return connection;
  connection = (async () => {
    try {
      const iap = await import('expo-iap');
      await iap.initConnection();
      bindListeners(iap);
      return iap;
    } catch {
      // Allow a later retry (Play Store may not be ready during startup).
      connection = null;
      return null;
    }
  })();
  return connection;
}

export type PurchaseResult = 'started' | 'cancelled' | 'unavailable' | 'owned';

/** Fetches the localized lifetime product, or null when the store has none. */
export async function fetchPremiumProduct(): Promise<Product | null> {
  const iap = await ensureConnection();
  if (!iap) return null;
  try {
    const result = await iap.fetchProducts({
      skus: [PREMIUM_PRODUCT_ID],
      type: 'in-app',
    });
    const products = Array.isArray(result) ? result : [];
    const match = products.find((product) => product.id === PREMIUM_PRODUCT_ID);
    return (match as Product | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function purchasePremium(): Promise<PurchaseResult> {
  const iap = await ensureConnection();
  if (!iap) return 'unavailable';
  try {
    await iap.requestPurchase({
      request: {
        apple: { sku: PREMIUM_PRODUCT_ID },
        google: { skus: [PREMIUM_PRODUCT_ID] },
      },
      type: 'in-app',
    });
    return 'started';
  } catch (error) {
    if (iap.isUserCancelledError(error as Parameters<typeof iap.isUserCancelledError>[0])) {
      return 'cancelled';
    }
    emitError(iap.getUserFriendlyErrorMessage(error as Parameters<typeof iap.getUserFriendlyErrorMessage>[0]));
    return 'unavailable';
  }
}

export type RestoreResult = 'restored' | 'none' | 'unavailable';

export async function restorePremium(): Promise<RestoreResult> {
  const iap = await ensureConnection();
  if (!iap) return 'unavailable';
  try {
    await iap.restorePurchases();
    const purchases = await iap.getAvailablePurchases();
    const owned = (purchases ?? []).find((p) => p.productId === PREMIUM_PRODUCT_ID);
    if (!owned) return 'none';
    await grantPremium('restore', owned.productId);
    try {
      await iap.finishTransaction({ purchase: owned, isConsumable: false });
    } catch {
      // entitlement already granted
    }
    return 'restored';
  } catch {
    return 'unavailable';
  }
}

/**
 * Silent launch-time reconciliation with the store, so premium follows the
 * account across a reinstall or a new device without the user hunting for
 * "Restore purchase". Only ever grants: a store hiccup or an offline launch
 * must never revoke an entitlement that is already stored locally.
 */
export async function syncPremiumFromStore(): Promise<void> {
  if (isPremium()) return;
  const iap = await ensureConnection();
  if (!iap) return;
  try {
    const purchases = await iap.getAvailablePurchases();
    const owned = (purchases ?? []).find((p) => p.productId === PREMIUM_PRODUCT_ID);
    if (!owned) return;
    await grantPremium('restore', owned.productId);
    try {
      await iap.finishTransaction({ purchase: owned, isConsumable: false });
    } catch {
      // entitlement already granted
    }
  } catch {
    // offline / store unavailable — keep the free tier for this launch
  }
}

/** Subscribe to purchase outcomes; returns an unsubscribe function. */
export function addPurchaseListeners(
  onSuccess: (purchase: Purchase) => void,
  onError: (message: string) => void,
): () => void {
  successListeners.add(onSuccess);
  errorListeners.add(onError);
  void ensureConnection();
  return () => {
    successListeners.delete(onSuccess);
    errorListeners.delete(onError);
  };
}
