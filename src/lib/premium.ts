import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { PREMIUM_PRODUCT_ID } from '@/constants/premium';

/**
 * Premium entitlement.
 *
 * The entitlement is a local, durable flag backed by SecureStore. Purchases are
 * verified by the store at purchase/restore time; this app has no backend, so
 * the flag is the source of truth for feature gating. It is deliberately not
 * tied to the vault master key, because premium must survive PIN changes.
 */

const STORAGE_KEY = 'premium.entitlement.v1';

export interface PremiumState {
  active: boolean;
  productId: string | null;
  purchasedAt: number | null;
  source: 'purchase' | 'restore' | null;
}

interface StoredEntitlement {
  active: boolean;
  productId: string;
  purchasedAt: number;
  source: 'purchase' | 'restore';
}

const INACTIVE: PremiumState = {
  active: false,
  productId: null,
  purchasedAt: null,
  source: null,
};

let state: PremiumState = INACTIVE;
let loaded = false;
let loading: Promise<void> | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Synchronous check for non-React callers (ads, import pipeline). */
export function isPremium(): boolean {
  return state.active;
}

export function getPremiumState(): PremiumState {
  return state;
}

/** React binding for settings/banner/paywall. */
export function usePremium(): PremiumState {
  return useSyncExternalStore(subscribe, getPremiumState, () => INACTIVE);
}

function parse(raw: string | null): PremiumState {
  if (!raw) return INACTIVE;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredEntitlement>;
    if (parsed.active !== true) return INACTIVE;
    return {
      active: true,
      productId: typeof parsed.productId === 'string' ? parsed.productId : PREMIUM_PRODUCT_ID,
      purchasedAt: typeof parsed.purchasedAt === 'number' ? parsed.purchasedAt : null,
      source: parsed.source === 'restore' ? 'restore' : 'purchase',
    };
  } catch {
    return INACTIVE;
  }
}

/** Loads the persisted entitlement once; safe to call from anywhere. */
export function loadPremium(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      // A dedicated env flag grants the entitlement locally so gated flows can
      // be verified without Play billing, which is unavailable in debug builds.
      // It is separate from EXPO_PUBLIC_CAPTURE_MODE (screenshots) so the free
      // tier can be inspected with screenshots enabled. Never persisted:
      // production bundles never set this env var.
      if (process.env.EXPO_PUBLIC_PREMIUM_GRANT === '1') {
        state = { active: true, productId: PREMIUM_PRODUCT_ID, purchasedAt: null, source: null };
        loaded = true;
        emit();
        return;
      }
      if (!(await SecureStore.isAvailableAsync())) return;
      state = parse(await SecureStore.getItemAsync(STORAGE_KEY));
    } catch {
      // storage unavailable → stay on the free tier
    } finally {
      loaded = true;
      emit();
    }
  })();
  return loading;
}

export function isPremiumLoaded(): boolean {
  return loaded;
}

async function persist(next: PremiumState): Promise<void> {
  state = next;
  emit();
  try {
    if (!(await SecureStore.isAvailableAsync())) return;
    const stored: StoredEntitlement = {
      active: next.active,
      productId: next.productId ?? PREMIUM_PRODUCT_ID,
      purchasedAt: next.purchasedAt ?? Date.now(),
      source: next.source ?? 'purchase',
    };
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // in-memory entitlement still applies for this session
  }
}

/** Grants premium after a verified purchase (or a successful restore). */
export async function grantPremium(
  source: 'purchase' | 'restore',
  productId: string = PREMIUM_PRODUCT_ID,
): Promise<void> {
  await persist({
    active: true,
    productId,
    purchasedAt: Date.now(),
    source,
  });
}

/** Clears the local entitlement (used by support/debug flows). */
export async function revokePremium(): Promise<void> {
  await persist(INACTIVE);
}
