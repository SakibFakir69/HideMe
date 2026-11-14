import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readIndexFile, writeIndexFile } from './vault-index-file.ts';
import type { VaultFileSystem } from './vault-fs.ts';

/**
 * A minimal in-memory filesystem: enough to exercise the index file the way
 * the store does.
 */
class FakeFs implements VaultFileSystem {
  readonly files = new Map<string, Uint8Array>();

  exists(path: string): boolean {
    return this.files.has(path);
  }

  size(path: string): number | null {
    return this.files.get(path)?.length ?? null;
  }

  create(path: string): void {
    this.files.set(path, new Uint8Array(0));
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

  async readAll(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (!data) throw new Error(`missing file ${path}`);
    return data.slice();
  }

  async writeAll(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, bytes.slice());
  }

  async move(from: string, to: string): Promise<void> {
    const data = this.files.get(from);
    if (!data) throw new Error(`cannot move missing file ${from}`);
    this.files.set(to, data);
    this.files.delete(from);
  }

  ensureDir(): void {
    // directories are not modelled
  }
}

const layout = { index: '/vault/index.hmd', temp: '/vault/index.hmd.tmp' };
const masterKey = new Uint8Array(32).fill(7);
let counter = 0;
const random = (length: number): Uint8Array => {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (counter + i) % 256;
  counter += 1;
  return out;
};

test('the index round-trips through the file', async () => {
  const fs = new FakeFs();
  const json = JSON.stringify({ v: 3, folders: [], items: [] });
  await writeIndexFile(fs, layout, json, masterKey, random);
  assert.equal(await readIndexFile(fs, layout, masterKey), json);
});

test('no index yet reads as null', async () => {
  const fs = new FakeFs();
  assert.equal(await readIndexFile(fs, layout, masterKey), null);
});

test('the index file is encrypted, not plain text', async () => {
  const fs = new FakeFs();
  const json = JSON.stringify({ v: 3, folders: [], items: [{ id: 'secret' }] });
  await writeIndexFile(fs, layout, json, masterKey, random);
  const raw = Buffer.from(fs.files.get(layout.index)!).toString('binary');
  // The envelope header carries the file id in the clear (it is
  // authenticated, not encrypted); the payload must not be readable.
  assert.ok(!raw.includes('secret'));
  assert.ok(!raw.includes('"items"'));
});

test('the temporary file is gone after a successful write', async () => {
  const fs = new FakeFs();
  await writeIndexFile(fs, layout, '{}', masterKey, random);
  assert.equal(fs.exists(layout.temp), false);
  assert.equal(fs.exists(layout.index), true);
});

test('a failed write keeps the previous index and drops the temporary file', async () => {
  const fs = new FakeFs();
  const json = JSON.stringify({ v: 3, folders: [], items: [] });
  await writeIndexFile(fs, layout, json, masterKey, random);

  const failing: VaultFileSystem = {
    ...fs,
    writeAll: async () => {
      throw new Error('disk full');
    },
    // keep the prototype methods of the fake
    exists: fs.exists.bind(fs),
    readAll: fs.readAll.bind(fs),
    move: fs.move.bind(fs),
    remove: fs.remove.bind(fs),
    create: fs.create.bind(fs),
    size: fs.size.bind(fs),
    ensureDir: fs.ensureDir.bind(fs),
    openRead: fs.openRead.bind(fs),
    openWrite: fs.openWrite.bind(fs),
  };

  await assert.rejects(
    () => writeIndexFile(failing, layout, '{"v":3}', masterKey, random),
    /disk full/,
  );
  // The old index is intact and readable.
  assert.equal(await readIndexFile(fs, layout, masterKey), json);
  assert.equal(fs.exists(layout.temp), false);
});

test('a wrong key cannot read the index', async () => {
  const fs = new FakeFs();
  await writeIndexFile(fs, layout, '{"v":3}', masterKey, random);
  const wrongKey = new Uint8Array(32).fill(9);
  await assert.rejects(() => readIndexFile(fs, layout, wrongKey));
});

test('a damaged index file is rejected', async () => {
  const fs = new FakeFs();
  await writeIndexFile(fs, layout, '{"v":3}', masterKey, random);
  const raw = fs.files.get(layout.index)!;
  raw[10] = raw[10]! ^ 0xff; // flip a byte in the ciphertext
  fs.files.set(layout.index, raw);
  await assert.rejects(() => readIndexFile(fs, layout, masterKey));
});
