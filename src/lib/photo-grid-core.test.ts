import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aspectOf, buildRows, GRID_GAP } from './photo-grid-core.ts';
import type { VaultItem } from './vault-index-core.ts';

function item(id: string, width?: number, height?: number): VaultItem {
  return {
    id,
    name: `${id}.jpg`,
    kind: 'photo',
    mime: 'image/jpeg',
    ext: '.jpg',
    size: 1000,
    folderId: null,
    createdAt: 0,
    width,
    height,
  };
}

test('items without dimensions are square', () => {
  assert.equal(aspectOf(item('a')), 1);
});

test('the real ratio is used, clamped to a sane band', () => {
  assert.equal(aspectOf(item('a', 2000, 1000)), 2);
  assert.equal(aspectOf(item('b', 1000, 2000)), 0.55);
  assert.equal(aspectOf(item('c', 100, 10000)), 0.55);
  assert.equal(aspectOf(item('d', 10000, 100)), 2.1);
});

test('a row fills the whole width', () => {
  const available = 360;
  const rows = buildRows([item('a', 2000, 1000), item('b', 1000, 1000)], 3, available);
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  const total = row.items.reduce((sum, entry) => sum + entry.width, 0) + GRID_GAP;
  assert.ok(Math.abs(total - available) <= 2, `row was ${total} wide, expected ${available}`);
});

test('the last row with fewer items still fills the width', () => {
  const available = 360;
  const rows = buildRows([item('a'), item('b'), item('c'), item('d')], 3, available);
  assert.equal(rows.length, 2);
  const last = rows[1]!;
  assert.equal(last.items.length, 1);
  assert.ok(Math.abs(last.items[0]!.width - available) <= 2);
});

test('a row of portraits is taller than a row of landscapes', () => {
  const available = 360;
  const landscape = buildRows([item('a', 2000, 1000), item('b', 2000, 1000)], 2, available)[0]!;
  const portrait = buildRows([item('c', 1000, 2000), item('d', 1000, 2000)], 2, available)[0]!;
  assert.ok(portrait.height > landscape.height);
});

test('the row height stays inside the band', () => {
  const available = 360;
  const square = available / 3;
  const tiny = buildRows([item('a', 10000, 100)], 3, available)[0]!;
  const huge = buildRows([item('b', 100, 10000)], 3, available)[0]!;
  assert.ok(tiny.height <= Math.round(square * 1.75));
  assert.ok(huge.height >= Math.round(square * 0.72));
});

test('every item ends up in exactly one row', () => {
  const items = Array.from({ length: 7 }, (_, i) => item(`i${i}`, 1000, 1000 + i * 100));
  const rows = buildRows(items, 3, 360);
  const ids = rows.flatMap((row) => row.items.map((entry) => entry.item.id));
  assert.deepEqual(ids, items.map((entry) => entry.id));
});

test('an empty list produces no rows', () => {
  assert.deepEqual(buildRows([], 3, 360), []);
});
