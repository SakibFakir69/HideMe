/**
 * Server-side purchase verification.
 *
 * The premium entitlement is a local flag, so a tampered device could flip it.
 * When a verification endpoint is configured, the purchase token is checked
 * against it and a negative answer revokes the entitlement.
 *
 * There is no backend in this repository. The endpoint is read from the
 * `EXPO_PUBLIC_PURCHASE_VERIFICATION_URL` environment variable; without it
 * nothing changes and the store stays the only authority. The contract the
 * endpoint has to answer is:
 *
 *   POST <url>
 *   { "productId": string, "platform": "android" | "ios", "token": string,
 *     "transactionId": string }
 *   -> 200 { "valid": boolean }
 *
 * The token is the store's purchase token (Android) or transaction id (iOS);
 * the endpoint is expected to check it with Google Play's or Apple's API.
 */

/** The endpoint, or null when the app runs without server verification. */
export function getVerificationUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_PURCHASE_VERIFICATION_URL;
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type VerificationOutcome =
  /** The endpoint confirmed the purchase. */
  | 'valid'
  /** The endpoint rejected the purchase — the entitlement is revoked. */
  | 'invalid'
  /** The endpoint could not be reached; the local state is kept. */
  | 'unverified'
  /** No endpoint is configured. */
  | 'skipped';

export interface PurchaseProof {
  productId: string;
  platform: 'android' | 'ios';
  /** The store's purchase token (Android) or transaction id (iOS). */
  token: string;
  transactionId: string;
}

/** Asks the endpoint whether the purchase is real. */
export async function verifyPurchase(proof: PurchaseProof): Promise<VerificationOutcome> {
  const url = getVerificationUrl();
  if (!url) return 'skipped';
  if (!proof.token) return 'unverified';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(proof),
        signal: controller.signal,
      });
      if (!response.ok) return 'unverified';
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object') return 'unverified';
      const valid = (body as { valid?: unknown }).valid;
      if (valid === true) return 'valid';
      if (valid === false) return 'invalid';
      return 'unverified';
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Offline or the endpoint is down: never revoke on a network failure.
    return 'unverified';
  }
}
