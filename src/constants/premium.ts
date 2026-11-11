/**
 * Premium product configuration.
 *
 * The product id must exist in Google Play Console (Monetise → Products →
 * In-app products) and App Store Connect with the same id. A one-time,
 * non-consumable purchase unlocks premium forever.
 */
export const PREMIUM_PRODUCT_ID = 'hideme_premium_lifetime';

/** Shown until the store returns the localized price. */
export const PREMIUM_FALLBACK_PRICE = '$2.99';

/** Dial code that restores the launcher icon after "Hide app icon". */
export const RESTORE_DIAL_CODE = '*#*#48263#*#*';
