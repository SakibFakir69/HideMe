import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isImportInterstitialDue } from './ads-cap-core.ts';

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
