import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPlaintextGuard } from './vault-plaintext-guard.ts';

test('a purge runs right away when nothing is pinned', () => {
  const guard = createPlaintextGuard();
  let purged = 0;
  assert.equal(guard.requestPurge(() => { purged += 1; }), true);
  assert.equal(purged, 1);
});

test('a purge is deferred while a share is open', () => {
  const guard = createPlaintextGuard();
  let purged = 0;
  const release = guard.hold();
  assert.equal(guard.requestPurge(() => { purged += 1; }), false);
  assert.equal(purged, 0);
  assert.equal(guard.purgeDeferred, true);
  release();
  assert.equal(purged, 1);
  assert.equal(guard.purgeDeferred, false);
});

test('the purge waits for the last pin', () => {
  const guard = createPlaintextGuard();
  let purged = 0;
  const first = guard.hold();
  const second = guard.hold();
  guard.requestPurge(() => { purged += 1; });
  first();
  assert.equal(purged, 0);
  assert.equal(guard.holders, 1);
  second();
  assert.equal(purged, 1);
});

test('releasing twice does not purge twice', () => {
  const guard = createPlaintextGuard();
  let purged = 0;
  const release = guard.hold();
  guard.requestPurge(() => { purged += 1; });
  release();
  release();
  assert.equal(purged, 1);
  assert.equal(guard.holders, 0);
});

test('a purge after the release runs immediately', () => {
  const guard = createPlaintextGuard();
  const release = guard.hold();
  release();
  let purged = 0;
  assert.equal(guard.requestPurge(() => { purged += 1; }), true);
  assert.equal(purged, 1);
});

test('a deferred purge is replaced by the latest request', () => {
  const guard = createPlaintextGuard();
  const calls: string[] = [];
  const release = guard.hold();
  guard.requestPurge(() => calls.push('first'));
  guard.requestPurge(() => calls.push('second'));
  release();
  assert.deepEqual(calls, ['second']);
});
