import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INDEX_VERSION,
  isSupportedIndexVersion,
  kindForMime,
  normalizeKind,
} from './vault-kinds.ts';

test('kindForMime maps the mime to the item kind', () => {
  assert.equal(kindForMime('image/jpeg'), 'photo');
  assert.equal(kindForMime('image/png'), 'photo');
  assert.equal(kindForMime('video/mp4'), 'video');
  assert.equal(kindForMime('video/quicktime'), 'video');
  assert.equal(kindForMime('audio/mpeg'), 'audio');
  assert.equal(kindForMime('audio/mp4'), 'audio');
  assert.equal(kindForMime('application/pdf'), 'document');
  assert.equal(kindForMime('application/zip'), 'document');
  assert.equal(kindForMime('application/octet-stream'), 'document');
});

test('normalizeKind re-files audio that was stored as a document', () => {
  assert.equal(normalizeKind('document', 'audio/mpeg'), 'audio');
  assert.equal(normalizeKind('document', 'audio/x-m4a'), 'audio');
});

test('normalizeKind leaves every other kind alone', () => {
  assert.equal(normalizeKind('document', 'application/pdf'), 'document');
  assert.equal(normalizeKind('photo', 'image/jpeg'), 'photo');
  assert.equal(normalizeKind('video', 'video/mp4'), 'video');
  assert.equal(normalizeKind('audio', 'audio/mpeg'), 'audio');
});

test('the index schema accepts the current and the legacy version', () => {
  assert.equal(INDEX_VERSION, 3);
  assert.equal(isSupportedIndexVersion(3), true);
  assert.equal(isSupportedIndexVersion(2), true);
  assert.equal(isSupportedIndexVersion(1), false);
  assert.equal(isSupportedIndexVersion(undefined), false);
});
