import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldAutoLock } from './vault-autolock-core.ts';

test('threshold 0 ("Immediately") locks for any non-negative elapsed time', () => {
  assert.equal(shouldAutoLock(0, 0), true);
  assert.equal(shouldAutoLock(1, 0), true);
  assert.equal(shouldAutoLock(86_400_000, 0), true);
});

test('negative elapsed times never lock (clock skew guard)', () => {
  assert.equal(shouldAutoLock(-1, 0), false);
  assert.equal(shouldAutoLock(-5000, 60), false);
});

test('below threshold does not lock', () => {
  assert.equal(shouldAutoLock(0, 30), false);
  assert.equal(shouldAutoLock(29_999, 30), false);
  assert.equal(shouldAutoLock(59_999, 60), false);
  assert.equal(shouldAutoLock(299_999, 300), false);
});

test('at or above threshold locks (inclusive boundary)', () => {
  assert.equal(shouldAutoLock(30_000, 30), true);
  assert.equal(shouldAutoLock(30_001, 30), true);
  assert.equal(shouldAutoLock(60_000, 60), true);
  assert.equal(shouldAutoLock(300_000, 300), true);
  assert.equal(shouldAutoLock(1_000_000, 300), true);
});
