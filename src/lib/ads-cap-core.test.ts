import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canShowInterstitial, INTERSTITIAL_CAP_WINDOW_MS } from './ads-cap-core.ts';

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
