import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeStats,
  displayName,
  extFor,
  importFraction,
  searchItems,
} from './vault-index-core.ts';

const FOLDERS = [
  { id: 'f1', name: 'Receipts' },
  { id: 'f2', name: 'Holidays' },
];

const ITEMS = [
  { id: 'a', name: 'Invoice.pdf', folderId: 'f1' },
  { id: 'b', name: 'Beach.jpg', folderId: 'f2' },
  { id: 'c', name: 'notes.txt', folderId: null },
  { id: 'd', name: 'Old.pdf', folderId: 'f1', deletedAt: 1_700_000_000_000 },
];

test('extFor prefers the extension in the name', () => {
  assert.equal(extFor('photo.JPG', 'image/jpeg'), '.jpg');
  assert.equal(extFor('archive.tar.gz', 'application/gzip'), '.gz');
  assert.equal(extFor('report.pdf', 'application/pdf'), '.pdf');
});

test('extFor falls back to the mime when the name has no extension', () => {
  assert.equal(extFor('photo', 'image/jpeg'), '.jpg');
  assert.equal(extFor('photo', 'image/png'), '.png');
  assert.equal(extFor('doc', 'application/pdf'), '.pdf');
  assert.equal(extFor('binary', 'application/octet-stream'), '');
});

test('extFor ignores a leading dot and a trailing dot', () => {
  // A dotfile has no extension, so the mime decides.
  assert.equal(extFor('.hidden', 'image/png'), '.png');
  assert.equal(extFor('trailing.', 'image/png'), '.png');
  assert.equal(extFor('.hidden', 'application/octet-stream'), '');
});

test('displayName falls back when the name is blank', () => {
  assert.equal(displayName('  Photo.jpg ', 'file-1'), 'Photo.jpg');
  assert.equal(displayName('   ', 'file-1'), 'file-1');
});

test('searchItems with an empty query returns every active item', () => {
  const found = searchItems(ITEMS, '', FOLDERS);
  assert.deepEqual(
    found.map((it) => it.id),
    ['a', 'b', 'c'],
  );
});

test('searchItems matches the item name case-insensitively', () => {
  const found = searchItems(ITEMS, 'beach', FOLDERS);
  assert.deepEqual(
    found.map((it) => it.id),
    ['b'],
  );
});

test('searchItems also matches the name of the folder', () => {
  const found = searchItems(ITEMS, 'receipts', FOLDERS);
  assert.deepEqual(
    found.map((it) => it.id),
    ['a'],
  );
});

test('searchItems scopes to a folder when one is given', () => {
  const inFolder = searchItems(ITEMS, '', FOLDERS, 'f1');
  assert.deepEqual(
    inFolder.map((it) => it.id),
    ['a'],
  );
  // Without a folder id the search covers every folder.
  const everywhere = searchItems(ITEMS, '', FOLDERS, null);
  assert.deepEqual(
    everywhere.map((it) => it.id),
    ['a', 'b', 'c'],
  );
});

test('searchItems never returns items that are in the bin', () => {
  const found = searchItems(ITEMS, 'old', FOLDERS);
  assert.deepEqual(found, []);
});

test('computeStats counts the active items and their size', () => {
  const stats = computeStats(
    [
      { size: 100 },
      { size: 250 },
      { size: 999, deletedAt: 1 },
    ],
    3,
  );
  assert.deepEqual(stats, { itemCount: 2, folderCount: 3, totalBytes: 350 });
});

test('importFraction spans the whole batch', () => {
  assert.equal(importFraction(0, 4, 0), 0);
  assert.equal(importFraction(0, 4, 0.5), 0.125);
  assert.equal(importFraction(1, 4, 0), 0.25);
  assert.equal(importFraction(3, 4, 1), 1);
  assert.equal(importFraction(0, 0, 0), 1);
});

test('importFraction never leaves the 0..1 range', () => {
  assert.equal(importFraction(0, 2, 5), 0.5);
  assert.equal(importFraction(9, 2, 0), 1);
  assert.equal(importFraction(0, 2, -1), 0);
});
