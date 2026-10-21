import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_DELAY_MS,
  FREE_ATTEMPTS,
  MAX_DELAY_MS,
  backoffDelayMs,
  computeFailure,
  isLockedOut,
  remainingMs,
} from './vault-lockout-core.ts';

test('first FREE_ATTEMPTS failures cost nothing', () => {
  assert.equal(FREE_ATTEMPTS, 3);
  assert.equal(backoffDelayMs(0), 0);
  assert.equal(backoffDelayMs(1), 0);
  assert.equal(backoffDelayMs(2), 0);
  assert.equal(backoffDelayMs(3), 0);
});

test('delay starts at the 4th failure and doubles each time', () => {
  assert.equal(backoffDelayMs(4), 15_000);
  assert.equal(backoffDelayMs(5), 30_000);
  assert.equal(backoffDelayMs(6), 60_000);
  assert.equal(backoffDelayMs(7), 120_000);
  assert.equal(backoffDelayMs(8), 240_000);
  assert.equal(backoffDelayMs(9), 480_000);
});

test('delay is capped at 15 minutes forever after', () => {
  assert.equal(backoffDelayMs(10), 15 * 60_000);
  assert.equal(backoffDelayMs(11), MAX_DELAY_MS);
  assert.equal(backoffDelayMs(50), MAX_DELAY_MS);
  assert.equal(backoffDelayMs(1000), MAX_DELAY_MS);
});

test('backoff never exceeds the cap for any attempt count', () => {
  for (let fails = 0; fails <= 200; fails++) {
    assert.ok(backoffDelayMs(fails) <= MAX_DELAY_MS, `fails=${fails}`);
  }
});

test('computeFailure increments and applies delay from the current state', () => {
  const s1 = computeFailure(null, 1_000_000);
  assert.deepEqual(s1, { fails: 1, until: 1_000_000 });

  const s3 = computeFailure({ fails: 3, until: 0 }, 2_000_000);
  assert.deepEqual(s3, { fails: 4, until: 2_000_000 + BASE_DELAY_MS });

  const s4 = computeFailure(s3, 2_000_000);
  assert.equal(s4.fails, 5);
  assert.equal(s4.until, 2_000_000 + 30_000);
});

test('remainingMs counts down to zero and never goes negative', () => {
  const state = { fails: 4, until: 100_000 };
  assert.equal(remainingMs(state, 90_000), 10_000);
  assert.equal(remainingMs(state, 100_000), 0);
  assert.equal(remainingMs(state, 150_000), 0);
  assert.equal(remainingMs(null, 50_000), 0);
});

test('isLockedOut reflects remaining time', () => {
  const state = { fails: 4, until: 100_000 };
  assert.equal(isLockedOut(state, 99_999), true);
  assert.equal(isLockedOut(state, 100_000), false);
  assert.equal(isLockedOut(null, 0), false);
});
