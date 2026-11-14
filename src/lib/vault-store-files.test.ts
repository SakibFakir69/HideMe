import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { VaultFileSystem } from './vault-fs.ts';
import { deleteItemFiles, deleteItemsFiles, type ItemFileLayout } from './vault-store-files.ts';

/** An in-memory filesystem: the files are just paths. */
class FakeFs implements VaultFileSystem {
  readonly files = new Set<string>();

  exists(path: string): boolean {
    return this.files.has(path);
  }

  size(): number | null {
    return null;
  }

  create(path: string): void {
    this.files.add(path);
  }

  remove(path: string): void {
    this.files.delete(path);
  }

  openRead(): never {
    throw new Error('not used');
  }

  openWrite(): never {
    throw new Error('not used');
  }

  async readAll(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }

  async writeAll(): Promise<void> {
    // not used
  }

  async move(): Promise<void> {
    // not used
  }

  ensureDir(): void {
    // not used
  }
}

const layout: ItemFileLayout = {
  blob: (id) => `/vault/files/${id}.hmd`,
  thumb: (id) => `/vault/files/${id}.thumb.hmd`,
  plainThumb: (id) => `/vault-tmp/${id}.thumb.jpg`,
};

test('purging an item removes its blob and both thumbnails', () => {
  const fs = new FakeFs();
  fs.create('/vault/files/a.hmd');
  fs.create('/vault/files/a.thumb.hmd');
  fs.create('/vault-tmp/a.thumb.jpg');
  fs.create('/vault/files/b.hmd');

  deleteItemFiles(fs, layout, 'a');

  assert.equal(fs.exists('/vault/files/a.hmd'), false);
  assert.equal(fs.exists('/vault/files/a.thumb.hmd'), false);
  assert.equal(fs.exists('/vault-tmp/a.thumb.jpg'), false);
  // another item is untouched
  assert.equal(fs.exists('/vault/files/b.hmd'), true);
});

test('purging an item that has no files is not an error', () => {
  const fs = new FakeFs();
  assert.doesNotThrow(() => deleteItemFiles(fs, layout, 'missing'));
});

test('purging many items removes every one of them', () => {
  const fs = new FakeFs();
  for (const id of ['a', 'b', 'c']) {
    fs.create(`/vault/files/${id}.hmd`);
    fs.create(`/vault/files/${id}.thumb.hmd`);
  }

  deleteItemsFiles(fs, layout, ['a', 'b', 'c']);

  for (const id of ['a', 'b', 'c']) {
    assert.equal(fs.exists(`/vault/files/${id}.hmd`), false);
    assert.equal(fs.exists(`/vault/files/${id}.thumb.hmd`), false);
  }
});
