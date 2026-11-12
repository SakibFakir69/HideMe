import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isAutoLockSuppressed, isPickerGraceActive, PICKER_GRACE_MS, shouldAutoLock } from './vault-autolock-core.ts';

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

test('rewarded pause suppresses timed auto-lock until overrideUntil', () => {
  const now = 1_000_000_000;
  const until = now + 3_600_000;
  assert.equal(isAutoLockSuppressed(now, until, 60), true);
  assert.equal(isAutoLockSuppressed(until - 1, until, 60), true);
  assert.equal(isAutoLockSuppressed(until, until, 60), false);
  assert.equal(isAutoLockSuppressed(until + 1, until, 60), false);
});

test('threshold 0 ("Immediately") is never suppressed by a pause', () => {
  const until = 1_000_000_000 + 3_600_000;
  assert.equal(isAutoLockSuppressed(1_000_000_000, until, 0), false);
});

test('inactive or invalid override does not suppress', () => {
  assert.equal(isAutoLockSuppressed(1_000_000, 0, 60), false);
  assert.equal(isAutoLockSuppressed(1_000_000, -5, 60), false);
  assert.equal(isAutoLockSuppressed(1_000_000, Number.NaN, 60), false);
});

test('picker grace is active only inside its window', () => {
  const now = 1_000_000_000;
  const until = now + PICKER_GRACE_MS;
  assert.equal(isPickerGraceActive(now, until), true);
  assert.equal(isPickerGraceActive(until - 1, until), true);
  assert.equal(isPickerGraceActive(until, until), false);
  assert.equal(isPickerGraceActive(until + 1, until), false);
});

test('picker grace ignores absent or invalid deadlines', () => {
  assert.equal(isPickerGraceActive(1_000, 0), false);
  assert.equal(isPickerGraceActive(1_000, -1), false);
  assert.equal(isPickerGraceActive(1_000, Number.NaN), false);
});

test('picker grace is long enough for a picker, short enough to stay safe', () => {
  assert.ok(PICKER_GRACE_MS >= 60_000);
  assert.ok(PICKER_GRACE_MS <= 5 * 60_000);
});
