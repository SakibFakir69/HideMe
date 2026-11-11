import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canShowInterstitial, INTERSTITIAL_CAP_WINDOW_MS, isImportInterstitialDue } from './ads-cap-core.ts';

test('first show is always allowed (never shown before)', () => {
  assert.equal(canShowInterstitial(1_000_000, 0), true);
  assert.equal(canShowInterstitial(1_000_000, -1), true);
  assert.equal(canShowInterstitial(1_000_000, Number.NaN), true);
});

test('second show within the 24h window is blocked', () => {
  const last = 1_000_000_000_000;
  assert.equal(canShowInterstitial(last, last), false);
  assert.equal(canShowInterstitial(last + 1, last), false);
  assert.equal(canShowInterstitial(last + INTERSTITIAL_CAP_WINDOW_MS - 1, last), false);
});

test('show allowed at/after the window boundary', () => {
  const last = 1_000_000_000_000;
  assert.equal(canShowInterstitial(last + INTERSTITIAL_CAP_WINDOW_MS, last), true);
  assert.equal(canShowInterstitial(last + INTERSTITIAL_CAP_WINDOW_MS + 1, last), true);
  assert.equal(canShowInterstitial(last + 7 * INTERSTITIAL_CAP_WINDOW_MS, last), true);
});

test('clock moved backwards past last show → conservative no', () => {
  const last = 1_000_000_000_000;
  assert.equal(canShowInterstitial(last - 1, last), false);
  assert.equal(canShowInterstitial(0, last), false);
});

test('import interstitial is due after every 2nd completed import', () => {
  assert.equal(isImportInterstitialDue(0), false);
  assert.equal(isImportInterstitialDue(1), false);
  assert.equal(isImportInterstitialDue(2), true);
  assert.equal(isImportInterstitialDue(3), false);
  assert.equal(isImportInterstitialDue(4), true);
  assert.equal(isImportInterstitialDue(6), true);
});

test('import interstitial ignores invalid counts/intervals', () => {
  assert.equal(isImportInterstitialDue(Number.NaN), false);
  assert.equal(isImportInterstitialDue(-2), false);
  assert.equal(isImportInterstitialDue(2, 0), false);
  assert.equal(isImportInterstitialDue(2, Number.NaN), false);
});
