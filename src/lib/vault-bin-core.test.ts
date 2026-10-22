import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_RETENTION_DAYS,
  BIN_RETENTION_MS,
  activeEntries,
  binEntries,
  daysLeft,
  expiredIds,
  isDeleted,
  isExpired,
} from './vault-bin-core.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

test('isDeleted: only positive numeric deletedAt counts', () => {
  assert.equal(isDeleted({ deletedAt: NOW }), true);
  assert.equal(isDeleted({ deletedAt: 1 }), true);
  assert.equal(isDeleted({ deletedAt: undefined }), false);
  assert.equal(isDeleted({ deletedAt: 0 }), false);
  assert.equal(isDeleted({}), false);
});

test('activeEntries keeps order and drops bin items', () => {
  const entries = [
    { id: 'a', deletedAt: undefined },
    { id: 'b', deletedAt: NOW },
    { id: 'c' },
    { id: 'd', deletedAt: NOW + 5 },
  ];
  assert.deepEqual(
    activeEntries(entries).map((it) => it.id),
    ['a', 'c'],
  );
});

test('binEntries sorts newest deletion first', () => {
  const entries = [
    { id: 'old', deletedAt: NOW - 10 * DAY },
    { id: 'live' },
    { id: 'new', deletedAt: NOW - 1 * DAY },
    { id: 'mid', deletedAt: NOW - 5 * DAY },
  ];
  assert.deepEqual(
    binEntries(entries).map((it) => it.id),
    ['new', 'mid', 'old'],
  );
});

test('isExpired: exactly 30 days expires, just under does not', () => {
  assert.equal(isExpired({ deletedAt: NOW - BIN_RETENTION_MS }, NOW), true);
  assert.equal(isExpired({ deletedAt: NOW - BIN_RETENTION_MS + 1 }, NOW), false);
  assert.equal(isExpired({ deletedAt: NOW - (BIN_RETENTION_DAYS - 1) * DAY }, NOW), false);
  assert.equal(isExpired({ deletedAt: NOW - 31 * DAY }, NOW), true);
});

test('isExpired: future deletedAt (clock skew) never expires; live entries never expire', () => {
  assert.equal(isExpired({ deletedAt: NOW + DAY }, NOW), false);
  assert.equal(isExpired({ deletedAt: NOW + 40 * DAY }, NOW), false);
  assert.equal(isExpired({}, NOW), false);
  assert.equal(isExpired({ deletedAt: undefined }, NOW), false);
});

test('expiredIds returns only expired bin ids', () => {
  const entries = [
    { id: 'fresh', deletedAt: NOW - DAY },
    { id: 'stale', deletedAt: NOW - 30 * DAY },
    { id: 'ancient', deletedAt: NOW - 45 * DAY },
    { id: 'live' },
  ];
  assert.deepEqual(expiredIds(entries, NOW), ['stale', 'ancient']);
  assert.deepEqual(expiredIds([], NOW), []);
});

test('daysLeft: boundaries at 30, mid, and <1 day', () => {
  assert.equal(daysLeft(NOW, NOW), BIN_RETENTION_DAYS);
  assert.equal(daysLeft(NOW - 15 * DAY, NOW), 15);
  assert.equal(daysLeft(NOW - 29 * DAY, NOW), 1);
  // 1 hour left -> ceil(1/24) = 1 day (show "1 day" until truly gone)
  assert.equal(daysLeft(NOW - 30 * DAY + 60 * 60 * 1000, NOW), 1);
  // 25 hours left -> ceil(25/24) = 2
  assert.equal(daysLeft(NOW - 30 * DAY + 25 * 60 * 60 * 1000, NOW), 2);
});

test('daysLeft: expired clamps to 0, never negative; future clamps to 30', () => {
  assert.equal(daysLeft(NOW - 30 * DAY, NOW), 0);
  assert.equal(daysLeft(NOW - 90 * DAY, NOW), 0);
  assert.equal(daysLeft(NOW + 5 * DAY, NOW), BIN_RETENTION_DAYS);
});
