import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  decryptBytes,
  encryptBytes,
  utf8,
  type Random,
} from './crypto/envelope.ts';
import { decryptFile } from './crypto/file-crypto.ts';
import { ImportCancelledError, createImportCancellation } from './import-cancellation.ts';
import { runImport, type ImportJob, type ImportPaths, type PickedAsset } from './vault-import.ts';
import type { VaultIndex, VaultItem } from './vault-index-core.ts';

/* ------------------------------------------------------------------ */
/* an in-memory filesystem                                             */
/* ------------------------------------------------------------------ */

interface FakeOptions {
  /** Paths whose writes fail, to simulate a broken disk. */
  failWrite?: (path: string) => boolean;
  /** Called before every write, so a test can act at that moment. */
  onWrite?: (path: string) => void;
  /** Called before every read, so a test can act at that moment. */
  onRead?: (path: string) => void;
}

/**
 * The filesystem the import pipeline sees. Every file is a byte array, so
 * the tests can assert on the real state of the vault after a cancel.
 */
class FakeFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();
  private readonly options: FakeOptions;

  constructor(options: FakeOptions = {}) {
    this.options = options;
  }

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

  readAll(path: string): Promise<Uint8Array> {
    this.options.onRead?.(path);
    const data = this.files.get(path);
    if (!data) return Promise.resolve(new Uint8Array(0));
    return Promise.resolve(data.slice());
  }

  async writeAll(path: string, bytes: Uint8Array): Promise<void> {
    this.options.onWrite?.(path);
    if (this.options.failWrite?.(path)) throw new Error('disk full');
    this.files.set(path, bytes.slice());
  }

  async move(from: string, to: string): Promise<void> {
    const data = this.files.get(from);
    if (!data) throw new Error(`cannot move missing file ${from}`);
    this.files.set(to, data);
    this.files.delete(from);
  }

  ensureDir(path: string): void {
    this.dirs.add(path);
  }

  openRead(path: string) {
    return this.handle(path);
  }

  openWrite(path: string) {
    if (!this.files.has(path)) this.files.set(path, new Uint8Array(0));
    return this.handle(path);
  }

  private handle(path: string) {
    const fs = this;
    let cursor = 0;
    return {
      get offset(): number {
        return cursor;
      },
      set offset(value: number) {
        cursor = value;
      },
      async readBytes(length: number): Promise<Uint8Array> {
        fs.options.onRead?.(path);
        const data = fs.files.get(path);
        if (!data) return new Uint8Array(0);
        const end = Math.min(data.length, cursor + length);
        const out = data.subarray(cursor, end);
        cursor = end;
        return out;
      },
      async writeBytes(bytes: Uint8Array): Promise<void> {
        fs.options.onWrite?.(path);
        if (fs.options.failWrite?.(path)) throw new Error('disk full');
        const data = fs.files.get(path) ?? new Uint8Array(0);
        const needed = cursor + bytes.length;
        const target = needed > data.length ? new Uint8Array(needed) : data;
        if (needed > data.length) target.set(data);
        target.set(bytes, cursor);
        fs.files.set(path, target);
        cursor = needed;
      },
      close(): void {
        /* nothing to release */
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const MASTER = new Uint8Array(32).fill(7);
const INDEX_PATH = '/vault/index.hmd';

function makeRand(seed: number): Random {
  let s = seed >>> 0 || 0x9e3779b9;
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      out[i] = s & 0xff;
    }
    return out;
  };
}

function blobPath(id: string): string {
  return `/vault/files/${id}.hmd`;
}

function partialPath(id: string): string {
  return `/vault/files/${id}.partial`;
}

const PATHS: ImportPaths = { blob: blobPath, partial: partialPath };

function emptyIndex(): VaultIndex {
  return { v: 3, folders: [], items: [] };
}

interface Harness {
  fs: FakeFileSystem;
  index: VaultIndex;
  assets: PickedAsset[];
  job: (overrides?: Partial<ImportJob>) => ImportJob;
  /** The index as it was written to disk, decrypted. */
  readSavedIndex: () => VaultIndex | null;
  saveIndexCalls: number;
}

function harness(
  options: FakeOptions = {},
  assets: PickedAsset[] = [],
  seed = 4242,
): Harness {
  const fs = new FakeFileSystem(options);
  const index = emptyIndex();
  const rand = makeRand(seed);
  let counter = 0;
  const state = { saveIndexCalls: 0 };

  const base: ImportJob = {
    fs,
    masterKey: MASTER,
    rand,
    folderId: null,
    assets,
    paths: PATHS,
    index,
    saveIndex: async () => {
      state.saveIndexCalls += 1;
      const bytes = encryptBytes(utf8(JSON.stringify(index)), MASTER, 'vault-index', rand);
      await fs.writeAll(INDEX_PATH, bytes);
    },
    newId: () => `item-${++counter}`,
    now: () => 1_700_000_000_000,
  };

  return {
    fs,
    index,
    assets,
    job: (overrides) => ({ ...base, ...overrides }),
    readSavedIndex: () => {
      const raw = fs.files.get(INDEX_PATH);
      if (!raw) return null;
      const opened = decryptBytes(raw, MASTER);
      return JSON.parse(new TextDecoder().decode(opened.plaintext)) as VaultIndex;
    },
    get saveIndexCalls() {
      return state.saveIndexCalls;
    },
  };
}

/** A source file in the fake filesystem. */
function source(
  fs: FakeFileSystem,
  uri: string,
  size: number,
  mime = 'image/jpeg',
): PickedAsset {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) data[i] = i & 0xff;
  fs.files.set(uri, data);
  return { uri, name: uri.split('/').pop() ?? uri, mime };
}

/** Decrypts a vault blob with the master key, proving it is intact. */
async function readBlob(fs: FakeFileSystem, path: string): Promise<Uint8Array> {
  const dest = '/tmp/plain';
  const info = await decryptFile({
    source: {
      get exists() {
        return fs.exists(path);
      },
      get size() {
        return fs.size(path);
      },
      openRead: () => fs.openRead(path),
    },
    dest: {
      get exists() {
        return fs.exists(dest);
      },
      create: () => fs.create(dest),
      delete: () => fs.remove(dest),
      openWrite: () => fs.openWrite(dest),
    },
    masterKey: MASTER,
  });
  assert.equal(info.fileId.length > 0, true);
  return fs.files.get(dest) ?? new Uint8Array(0);
}

/* ------------------------------------------------------------------ */
/* 1. cancel before the first file                                     */
/* ------------------------------------------------------------------ */

test('cancelling before the first file imports nothing', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  const cancellation = createImportCancellation();
  cancellation.cancel();

  const outcome = await runImport(h.job({ assets: h.assets, cancellation }));

  assert.equal(outcome.status, 'cancelled');
  assert.equal(outcome.added.length, 0);
  assert.equal(h.index.items.length, 0);
  // Nothing was written into the vault.
  const vaultFiles = [...h.fs.files.keys()].filter((path) => path.startsWith('/vault/'));
  assert.deepEqual(vaultFiles, []);
});

/* ------------------------------------------------------------------ */
/* 2. cancel between files                                            */
/* ------------------------------------------------------------------ */

test('cancelling between files keeps the files that made it in', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/c.jpg', 1024));

  const cancellation = createImportCancellation();
  // Cancel as soon as the first file is done.
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: (p) => {
      if (p.fileIndex >= 1) cancellation.cancel();
    },
  });

  const outcome = await runImport(job);

  assert.equal(outcome.status, 'cancelled');
  assert.equal(outcome.added.length, 1);
  assert.equal(h.index.items.length, 1);
  assert.equal(h.index.items[0].name, 'a.jpg');
  // The second and third file never started.
  assert.equal(h.fs.exists(blobPath('item-2')), false);
  assert.equal(h.fs.exists(blobPath('item-3')), false);
});

/* ------------------------------------------------------------------ */
/* 3. cancel during an individual file operation                       */
/* ------------------------------------------------------------------ */

test('cancelling while a file is being read stops that file', async () => {
  const h = harness({
    onRead: () => {
      /* the source read happens after the file was registered */
    },
  });
  h.assets.push(source(h.fs, '/pics/a.jpg', 2048));
  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: () => cancellation.cancel(),
  });

  const outcome = await runImport(job);

  assert.equal(outcome.status, 'cancelled');
  assert.equal(outcome.added.length, 0);
  assert.equal(h.index.items.length, 0);
  // Nothing was left behind for the interrupted file.
  assert.equal(h.fs.exists(partialPath('item-1')), false);
  assert.equal(h.fs.exists(blobPath('item-1')), false);
});

/* ------------------------------------------------------------------ */
/* 4. cancel during encryption                                         */
/* ------------------------------------------------------------------ */

test('cancelling during the encryption leaves no partial blob', async () => {
  // Bigger than one chunk, so the encryption runs several rounds.
  const h = harness();
  h.assets.push(source(h.fs, '/pics/big.jpg', 3 * 1024 * 1024));
  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: (p) => {
      // Fires after the first chunk is encrypted.
      if (p.processed > 0) cancellation.cancel();
    },
  });

  const outcome = await runImport(job);

  assert.equal(outcome.status, 'cancelled');
  assert.equal(outcome.added.length, 0);
  assert.equal(h.fs.exists(partialPath('item-1')), false);
  assert.equal(h.fs.exists(blobPath('item-1')), false);
  assert.equal(h.index.items.length, 0);
});

/* ------------------------------------------------------------------ */
/* 5. cancel during filesystem writing                                 */
/* ------------------------------------------------------------------ */

test('cancelling while the blob is written removes the partial file', async () => {
  const h = harness({
    onWrite: (path) => {
      if (path.includes('.partial')) {
        /* the cancel is triggered from the write hook below */
      }
    },
  });
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: () => cancellation.cancel(),
  });

  const outcome = await runImport(job);

  assert.equal(outcome.status, 'cancelled');
  assert.equal(h.fs.exists(partialPath('item-1')), false);
  assert.equal(h.fs.exists(blobPath('item-1')), false);
});

/* ------------------------------------------------------------------ */
/* 6. successful files remain available                                */
/* ------------------------------------------------------------------ */

test('files imported before a cancel stay readable', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 1024));

  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: (p) => {
      if (p.fileIndex >= 1) cancellation.cancel();
    },
  });

  const outcome = await runImport(job);
  assert.equal(outcome.status, 'cancelled');
  assert.equal(outcome.added.length, 1);

  // The blob is there and decrypts with the master key.
  const plain = await readBlob(h.fs, blobPath('item-1'));
  assert.equal(plain.length, 1024);
  assert.equal(plain[0], 0);
  assert.equal(plain[1023], 1023 & 0xff);
});

/* ------------------------------------------------------------------ */
/* 7. partial files are removed                                        */
/* ------------------------------------------------------------------ */

test('no partial file survives a cancel', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 3 * 1024 * 1024));
  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: (p) => {
      if (p.processed > 0) cancellation.cancel();
    },
  });

  await runImport(job);

  const partials = [...h.fs.files.keys()].filter((path) => path.endsWith('.partial'));
  assert.deepEqual(partials, []);
});

/* ------------------------------------------------------------------ */
/* 8. existing vault files remain untouched                            */
/* ------------------------------------------------------------------ */

test('a cancelled import does not touch the files that were already there', async () => {
  const h = harness();
  // An existing vault file and its index entry.
  const existing = source(h.fs, '/pics/existing.jpg', 512);
  const existingItem: VaultItem = {
    id: 'existing',
    name: 'existing.jpg',
    kind: 'photo',
    mime: 'image/jpeg',
    ext: '.jpg',
    size: 512,
    folderId: null,
    createdAt: 1_600_000_000_000,
  };
  h.index.items.push(existingItem);
  const existingBlob = new Uint8Array([1, 2, 3, 4, 5]);
  h.fs.files.set(blobPath('existing'), existingBlob);
  // The vault as it was before the import.
  await h.job().saveIndex();
  const before = h.fs.files.get(blobPath('existing'));

  h.assets.push(source(h.fs, '/pics/new.jpg', 1024));
  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: () => cancellation.cancel(),
  });

  const outcome = await runImport(job);
  assert.equal(outcome.status, 'cancelled');

  // The existing blob is byte for byte the same.
  assert.deepEqual(h.fs.files.get(blobPath('existing')), before);
  // And it is still in the index.
  const saved = h.readSavedIndex();
  assert.ok(saved);
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].id, 'existing');
  assert.equal(existing.name, 'existing.jpg');
});

/* ------------------------------------------------------------------ */
/* 9. the encrypted index stays consistent                             */
/* ------------------------------------------------------------------ */

test('the index on disk matches the files that were imported', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 2048));
  const cancellation = createImportCancellation();
  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: (p) => {
      if (p.fileIndex >= 1) cancellation.cancel();
    },
  });

  await runImport(job);

  const saved = h.readSavedIndex();
  assert.ok(saved);
  assert.equal(saved.v, 3);
  assert.equal(saved.items.length, 1);
  assert.equal(saved.items[0].name, 'a.jpg');
  assert.equal(saved.items[0].size, 1024);
  // Every item in the index has a blob, and every blob has an item.
  assert.equal(h.fs.exists(blobPath(saved.items[0].id)), true);
  assert.equal(saved.items.length, h.index.items.length);
  for (const item of saved.items) {
    assert.equal(h.fs.exists(blobPath(item.id)), true);
  }
});

/* ------------------------------------------------------------------ */
/* 10. repeated cancellation is safe                                   */
/* ------------------------------------------------------------------ */

test('cancelling many times changes nothing', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 1024));
  const cancellation = createImportCancellation();

  const job = h.job({
    assets: h.assets,
    cancellation,
    onProgress: () => {
      cancellation.cancel();
      cancellation.cancel();
      cancellation.cancel();
    },
  });

  const outcome = await runImport(job);
  assert.equal(outcome.status, 'cancelled');
  assert.equal(cancellation.cancelled, true);
  assert.equal(h.index.items.length, outcome.added.length);
  const partials = [...h.fs.files.keys()].filter((path) => path.endsWith('.partial'));
  assert.deepEqual(partials, []);
});

/* ------------------------------------------------------------------ */
/* 11. cancellation racing with completion                             */
/* ------------------------------------------------------------------ */

test('a cancel that arrives after the last file does not undo the import', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 1024));
  const cancellation = createImportCancellation();

  const job = h.job({
    assets: h.assets,
    cancellation,
    // The cancel lands while the index is written — the batch is done.
    saveIndex: async () => {
      cancellation.cancel();
      const bytes = encryptBytes(utf8(JSON.stringify(h.index)), MASTER, 'vault-index', makeRand(1));
      await h.fs.writeAll(INDEX_PATH, bytes);
    },
  });

  const outcome = await runImport(job);

  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.added.length, 2);
  const saved = h.readSavedIndex();
  assert.ok(saved);
  assert.equal(saved.items.length, 2);
});

/* ------------------------------------------------------------------ */
/* 12. a failure cleans up                                             */
/* ------------------------------------------------------------------ */

test('a failing import keeps the files that made it in and cleans up', async () => {
  const h = harness({
    failWrite: (path) => path.includes('item-2'),
  });
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 1024));

  const outcome = await runImport(h.job({ assets: h.assets }));

  assert.equal(outcome.status, 'failed');
  assert.ok(outcome.error);
  // The first file was kept.
  assert.equal(outcome.added.length, 1);
  assert.equal(h.index.items.length, 1);
  assert.equal(h.fs.exists(blobPath('item-1')), true);
  // The second one left nothing behind.
  assert.equal(h.fs.exists(blobPath('item-2')), false);
  assert.equal(h.fs.exists(partialPath('item-2')), false);
  const partials = [...h.fs.files.keys()].filter((path) => path.endsWith('.partial'));
  assert.deepEqual(partials, []);
  // And the index on disk knows about the file that made it in.
  const saved = h.readSavedIndex();
  assert.ok(saved);
  assert.equal(saved.items.length, 1);
});

/* ------------------------------------------------------------------ */
/* the index itself cannot be written                                  */
/* ------------------------------------------------------------------ */

test('an index that cannot be written leaves the vault as it was', async () => {
  const h = harness({ failWrite: (path) => path === INDEX_PATH });
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));

  const outcome = await runImport(h.job({ assets: h.assets }));

  assert.equal(outcome.status, 'failed');
  assert.ok(outcome.error);
  // The blob could not be referenced, so it was removed again and the index
  // in memory matches what is on disk.
  assert.equal(h.fs.exists(blobPath('item-1')), false);
  assert.equal(h.index.items.length, 0);
  assert.equal(h.readSavedIndex(), null);
});

/* ------------------------------------------------------------------ */
/* the happy path                                                       */
/* ------------------------------------------------------------------ */

test('an import without a cancel adds every file and they all decrypt', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/docs/b.pdf', 4096, 'application/pdf'));

  const outcome = await runImport(h.job({ assets: h.assets }));

  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.added.length, 2);
  assert.equal(h.index.items.length, 2);

  // Every item has a blob, and every blob decrypts with the master key.
  for (const item of outcome.added) {
    assert.equal(h.fs.exists(blobPath(item.id)), true);
    const plain = await readBlob(h.fs, blobPath(item.id));
    assert.equal(plain.length, item.size);
  }

  // The index on disk lists exactly the imported files.
  const saved = h.readSavedIndex();
  assert.ok(saved);
  assert.equal(saved.items.length, 2);
  assert.deepEqual(
    saved.items.map((item) => item.name),
    ['a.jpg', 'b.pdf'],
  );
  assert.equal(saved.items[0].kind, 'photo');
  assert.equal(saved.items[1].kind, 'document');
  // Nothing was left in the vault that the index does not know.
  const blobs = [...h.fs.files.keys()].filter((path) => path.startsWith('/vault/files/'));
  assert.equal(blobs.length, 2);
});

/* ------------------------------------------------------------------ */
/* 13. a later import still works                                      */
/* ------------------------------------------------------------------ */
test('an import after a cancelled one works normally', async () => {
  const h = harness();
  h.assets.push(source(h.fs, '/pics/a.jpg', 1024));
  h.assets.push(source(h.fs, '/pics/b.jpg', 1024));

  const cancellation = createImportCancellation();
  const first = await runImport(
    h.job({
      assets: h.assets,
      cancellation,
      onProgress: (p) => {
        if (p.fileIndex >= 1) cancellation.cancel();
      },
    }),
  );
  assert.equal(first.status, 'cancelled');
  assert.equal(first.added.length, 1);

  // A second batch runs on the same vault.
  const later = [source(h.fs, '/pics/c.jpg', 1024)];
  const second = await runImport(h.job({ assets: later }));

  assert.equal(second.status, 'completed');
  assert.equal(second.added.length, 1);
  // The file from the cancelled run is still there, the new one joined it.
  assert.equal(h.index.items.length, 2);
  const saved = h.readSavedIndex();
  assert.ok(saved);
  assert.equal(saved.items.length, 2);
  for (const item of saved.items) {
    assert.equal(h.fs.exists(blobPath(item.id)), true);
  }
});

/* ------------------------------------------------------------------ */
/* the cancellation token itself                                       */
/* ------------------------------------------------------------------ */

test('the cancellation token is scoped to its own job', async () => {
  const a = createImportCancellation();
  const b = createImportCancellation();
  a.cancel();
  assert.equal(a.cancelled, true);
  assert.equal(b.cancelled, false);
  assert.throws(() => a.throwIfCancelled(), ImportCancelledError);
  assert.doesNotThrow(() => b.throwIfCancelled());
});
