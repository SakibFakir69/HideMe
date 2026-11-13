import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildZip, crc32, uniqueNames } from './zip.ts';

test('crc32 matches the known IEEE values', () => {
  assert.equal(crc32(new TextEncoder().encode('')), 0);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

test('the archive starts with a local file header', () => {
  const zip = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
});

test('the archive ends with the end-of-central-directory record', () => {
  const zip = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
  const end = zip.slice(zip.length - 22);
  assert.equal(end[0], 0x50);
  assert.equal(end[1], 0x4b);
  assert.equal(end[2], 0x05);
  assert.equal(end[3], 0x06);
  // entry count
  assert.equal(end[10], 1);
  assert.equal(end[8], 1);
});

test('the stored payload is present verbatim', () => {
  const payload = new TextEncoder().encode('hello vault');
  const zip = buildZip([{ name: 'note.txt', data: payload }]);
  const text = Buffer.from(zip).toString('binary');
  assert.ok(text.includes('note.txt'));
  assert.ok(text.includes('hello vault'));
});

test('the sizes in the local header match the payload', () => {
  const payload = new TextEncoder().encode('12345');
  const zip = buildZip([{ name: 'x.bin', data: payload }]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(18, true), payload.length); // compressed size
  assert.equal(view.getUint32(22, true), payload.length); // uncompressed size
  assert.equal(view.getUint16(26, true), 5); // name length ('x.bin')
});

test('duplicate names are made unique', () => {
  assert.deepEqual(uniqueNames(['a.jpg', 'a.jpg', 'b.jpg']), ['a.jpg', 'a (2).jpg', 'b.jpg']);
  assert.deepEqual(uniqueNames(['photo.png', 'photo.png']), ['photo.png', 'photo (2).png']);
  assert.deepEqual(uniqueNames(['noext', 'noext']), ['noext', 'noext (2)']);
});

test('an empty archive is still a valid archive', () => {
  const zip = buildZip([]);
  assert.equal(zip.length, 22);
});
