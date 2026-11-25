import * as Crypto from 'expo-crypto';
import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';

import { binEntries, expiredIds, isDeleted } from './vault-bin-core';
import {
  computeStats as computeStatsCore,
  searchItems as searchItemsCore,
  type VaultFolder,
  type VaultIndex,
  type VaultItem,
} from './vault-index-core';
import { mark } from './perf';
import {
  INDEX_VERSION,
  isSupportedIndexVersion,
  kindForMime,
  normalizeKind,
  type ItemKind,
} from './vault-kinds';
import {
  decryptBytes,
  encryptBytes,
  type Random,
} from './crypto/envelope';
import {
  decryptFile,
  type CryptoDestFile,
  type CryptoFileHandle,
  type CryptoSourceFile,
  type FileCryptoProgress,
} from './crypto/file-crypto';
import { expoFileSystem } from './vault-fs-expo';
import { readIndexFile, writeIndexFile, type IndexFileLayout } from './vault-index-file';
import { createPlaintextGuard } from './vault-plaintext-guard';
import { deleteItemFiles, type ItemFileLayout } from './vault-store-files';
import type { ImportCancellation } from './import-cancellation';
import { runImport, type ImportOutcome, type ImportPaths, type ImportProgress, type PickedAsset } from './vault-import';
import { onLock, setScopeHook } from './vault-session';

/**
 * Vault storage: app-private sandbox.
 *   <documents>/vault/index.hmd     encrypted index envelope
 *   <documents>/vault/files/<id>.hmd   encrypted content blobs
 *   <cache>/vault-tmp/...           decrypted plaintext (purged on lock)
 *
 * The DECOY vault is a completely separate encrypted space — same layout
 * under <documents>/vault-decoy/ — so a decoy session never touches (or even
 * discovers the existence of) the real index or blobs.
 */

export type { ItemKind, VaultFolder, VaultIndex, VaultItem };
export { INDEX_VERSION, kindForMime };
export type { ImportOutcome, ImportProgress, PickedAsset } from './vault-import';

const rand: Random = (length: number) => Crypto.getRandomBytes(length);

/** 'main' = the real vault; 'decoy' = the decoy PIN's fake vault. */
export type VaultScope = 'main' | 'decoy';

let activeScope: VaultScope = 'main';

/** Called by vault-session on every unlock/lock so paths follow the session. */
export function setVaultScope(scope: VaultScope): void {
  activeScope = scope;
}

setScopeHook((decoy) => {
  setVaultScope(decoy ? 'decoy' : 'main');
});

const cachedByScope = new Map<VaultScope, VaultIndex>();
const inflightDecrypts = new Map<string, Promise<File>>();
const inflightThumbs = new Map<string, Promise<File>>();

// Grids mount a decrypt per photo at once — unbounded parallel pure-JS crypto
// saturates the JS thread (janky UI, frozen spinners). Cap concurrency.
function createLimiter(limit: number) {
  let active = 0;
  const waiters: (() => void)[] = [];
  return {
    async acquire(): Promise<void> {
      if (active < limit) {
        active++;
        return;
      }
      await new Promise<void>((resolve) => {
        waiters.push(() => {
          active++;
          resolve();
        });
      });
    },
    release(): void {
      active--;
      waiters.shift()?.();
    },
  };
}

/** Full-file decrypts move megabytes through AES-CTR + HMAC in JS: keep them few. */
const decryptLimiter = createLimiter(2);
/** Thumbnails are ~10–20 KB, so many of them can overlap without stalling the UI. */
const thumbLimiter = createLimiter(4);

function emptyIndex(): VaultIndex {
  return { v: INDEX_VERSION, folders: [], items: [] };
}

function rootDir(): Directory {
  return new Directory(Paths.document, activeScope === 'decoy' ? 'vault-decoy' : 'vault');
}

function filesDir(): Directory {
  return new Directory(rootDir(), 'files');
}

function indexFile(): File {
  return new File(rootDir(), 'index.hmd');
}

/** Where the encrypted index lives, for the file layer. */
function indexLayout(): IndexFileLayout {
  return {
    index: indexFile().uri,
    temp: new File(rootDir(), 'index.hmd.tmp').uri,
  };
}

function tmpDir(): Directory {
  return new Directory(Paths.cache, 'vault-tmp');
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) dir.create();
}

export function itemFile(itemId: string): File {
  return new File(filesDir(), `${itemId}.hmd`);
}

/* ------------------------------------------------------------------ */
/* expo-file-system adapters                                           */
/* ------------------------------------------------------------------ */

/** Wraps an expo file handle in the small interface the crypto uses. */
function handleAdapter(handle: FileHandle): CryptoFileHandle {
  return {
    get offset(): number {
      return handle.offset ?? 0;
    },
    set offset(value: number) {
      handle.offset = value;
    },
    readBytes: (length: number) => handle.readBytes(length),
    writeBytes: (bytes: Uint8Array) => handle.writeBytes(bytes),
    close: () => handle.close(),
  };
}

/** An expo file seen as a read-only source. */
function cryptoSource(file: File): CryptoSourceFile {
  return {
    get exists(): boolean {
      return file.exists;
    },
    get size(): number | null {
      return file.size;
    },
    openRead: () => handleAdapter(file.open(FileMode.ReadOnly)),
  };
}

/** An expo file seen as a write target. */
function cryptoDest(file: File): CryptoDestFile {
  return {
    get exists(): boolean {
      return file.exists;
    },
    create: () => {
      if (file.exists) file.delete();
      file.create();
    },
    delete: () => {
      if (file.exists) file.delete();
    },
    openWrite: () => handleAdapter(file.open(FileMode.ReadWrite)),
  };
}

/**
 * v2 had no `audio` kind, so audio files were stored as documents. Re-derive
 * the kind from the mime so an existing vault categorizes them correctly.
 */
function normalizeItem(item: VaultItem): VaultItem {
  const kind = normalizeKind(item.kind, item.mime);
  return kind === item.kind ? item : { ...item, kind };
}

/* ------------------------------------------------------------------ */
/* index                                                               */
/* ------------------------------------------------------------------ */

/**
 * Removes the partial blobs of an import that was killed before it could
 * finish. Only files with the `.partial` suffix are touched — the vault
 * blobs are never part of this.
 */
function purgePartialBlobs(): void {
  const dir = filesDir();
  if (!dir.exists) return;
  try {
    for (const entry of dir.list()) {
      if (entry instanceof File && entry.name.endsWith('.partial') && entry.exists) {
        entry.delete();
      }
    }
  } catch {
    // best effort — a leftover temp file is not worth failing the vault over
  }
}

export async function loadIndex(masterKey: Uint8Array): Promise<VaultIndex> {
  const cached = cachedByScope.get(activeScope);
  if (cached) return cached;
  ensureDir(rootDir());
  ensureDir(filesDir());
  // An import that was killed mid-file left a partial blob behind.
  purgePartialBlobs();
  const json = await readIndexFile(expoFileSystem, indexLayout(), masterKey);
  if (json === null) {
    const empty = emptyIndex();
    cachedByScope.set(activeScope, empty);
    return empty;
  }
  let parsed: VaultIndex;
  try {
    parsed = JSON.parse(json) as VaultIndex;
  } catch {
    throw new Error('Vault index is corrupted.');
  }
  if (
    !isSupportedIndexVersion(parsed.v) ||
    !Array.isArray(parsed.folders) ||
    !Array.isArray(parsed.items)
  ) {
    throw new Error('Vault index is corrupted.');
  }
  const index: VaultIndex = {
    v: INDEX_VERSION,
    folders: parsed.folders,
    items: parsed.items.map(normalizeItem),
  };
  cachedByScope.set(activeScope, index);
  // The index is read once per session — this is the "vault ready" moment.
  mark('index.loaded');
  return index;
}

async function saveIndex(masterKey: Uint8Array): Promise<void> {
  const cached = cachedByScope.get(activeScope);
  if (!cached) throw new Error('Vault index is not loaded.');
  await writeIndexFile(
    expoFileSystem,
    indexLayout(),
    JSON.stringify(cached),
    masterKey,
    rand,
  );
  notifyIndexListeners();
}

/* Change notifications: every mutation persists through saveIndex, so all
 * mounted screens (grid, folder, bin, viewer) refresh via their hooks. */
type IndexListener = () => void;
const indexListeners = new Set<IndexListener>();

export function subscribeIndex(listener: IndexListener): () => void {
  indexListeners.add(listener);
  return () => {
    indexListeners.delete(listener);
  };
}

function notifyIndexListeners(): void {
  for (const listener of [...indexListeners]) listener();
}

export function peekIndex(): VaultIndex | null {
  return cachedByScope.get(activeScope) ?? null;
}

/* ------------------------------------------------------------------ */
/* folders                                                             */
/* ------------------------------------------------------------------ */

export async function createFolder(masterKey: Uint8Array, name: string): Promise<VaultFolder> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty.');
  const index = await loadIndex(masterKey);
  const folder: VaultFolder = {
    id: Crypto.randomUUID(),
    name: trimmed,
    createdAt: Date.now(),
  };
  index.folders.push(folder);
  await saveIndex(masterKey);
  return folder;
}

export async function renameFolder(masterKey: Uint8Array, folderId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be empty.');
  const index = await loadIndex(masterKey);
  const folder = index.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error('Folder not found.');
  folder.name = trimmed;
  await saveIndex(masterKey);
}

export async function deleteFolder(masterKey: Uint8Array, folderId: string): Promise<void> {
  const index = await loadIndex(masterKey);
  const at = index.folders.findIndex((f) => f.id === folderId);
  if (at < 0) throw new Error('Folder not found.');
  index.folders.splice(at, 1);
  for (const item of index.items) {
    if (item.folderId === folderId) item.folderId = null;
  }
  await saveIndex(masterKey);
}

export function getFolder(index: VaultIndex, folderId: string | null): VaultFolder | null {
  if (!folderId) return null;
  return index.folders.find((f) => f.id === folderId) ?? null;
}

/* ------------------------------------------------------------------ */
/* items                                                               */
/* ------------------------------------------------------------------ */

export interface ImportOptions {
  masterKey: Uint8Array;
  folderId: string | null;
  assets: PickedAsset[];
  onProgress?: (p: ImportProgress) => void;
  /** Cancels this import. Scoped to this batch. */
  cancellation?: ImportCancellation;
}

/**
 * Where an import writes its blobs: the final path of an item, and the
 * partial path the blob is written to before it is complete.
 */
const IMPORT_PATHS: ImportPaths = {
  blob: (itemId) => itemFile(itemId).uri,
  partial: (itemId) => new File(filesDir(), `${itemId}.partial`).uri,
};

/**
 * Imports a batch of files into the vault.
 *
 * The batch can be cancelled: the files that were imported before the
 * cancellation stay in the vault, the file that was interrupted leaves
 * nothing behind, and the index is written once with the result.
 */
export async function importAssets(opts: ImportOptions): Promise<ImportOutcome> {
  const { masterKey, folderId, assets, onProgress, cancellation } = opts;
  const index = await loadIndex(masterKey);
  if (folderId && !index.folders.some((f) => f.id === folderId)) {
    throw new Error('Folder not found.');
  }
  ensureDir(rootDir());
  ensureDir(filesDir());

  const outcome = await runImport({
    fs: expoFileSystem,
    masterKey,
    rand,
    folderId,
    assets,
    paths: IMPORT_PATHS,
    index,
    saveIndex: () => saveIndex(masterKey),
    buildThumb: (itemId, sourceUri) => buildThumbForImport(masterKey, itemId, sourceUri),
    newId: () => Crypto.randomUUID(),
    now: () => Date.now(),
    cancellation,
    onProgress,
  });

  return outcome;
}

/** Soft delete: move to Recently-deleted (bin); the encrypted file is kept until purge. */
export async function moveItemsToBin(masterKey: Uint8Array, ids: string[]): Promise<void> {
  const index = await loadIndex(masterKey);
  const set = new Set(ids);
  const at = Date.now();
  let matched = 0;
  let moved = 0;
  for (const item of index.items) {
    if (!set.has(item.id)) continue;
    matched++;
    if (isDeleted(item)) continue;
    item.deletedAt = at;
    moved++;
  }
  if (matched === 0) throw new Error('Item not found.');
  if (moved === 0) return;
  await saveIndex(masterKey);
}

export async function moveItemToBin(masterKey: Uint8Array, itemId: string): Promise<void> {
  return moveItemsToBin(masterKey, [itemId]);
}

/** Undo move-to-bin: clears deletedAt so items return to the vault. */
export async function restoreItems(masterKey: Uint8Array, ids: string[]): Promise<void> {
  const index = await loadIndex(masterKey);
  const set = new Set(ids);
  let matched = 0;
  let restored = 0;
  for (const item of index.items) {
    if (!set.has(item.id)) continue;
    matched++;
    if (!isDeleted(item)) continue;
    delete item.deletedAt;
    restored++;
  }
  if (matched === 0) throw new Error('Item not found.');
  if (restored === 0) return;
  await saveIndex(masterKey);
}

export async function restoreItem(masterKey: Uint8Array, itemId: string): Promise<void> {
  return restoreItems(masterKey, [itemId]);
}

/** Permanently delete a single bin entry (file + index row). */
export async function purgeItem(masterKey: Uint8Array, itemId: string): Promise<void> {
  const index = await loadIndex(masterKey);
  const at = index.items.findIndex((it) => it.id === itemId);
  if (at < 0) throw new Error('Item not found.');
  deleteItemFile(itemId);
  index.items.splice(at, 1);
  await saveIndex(masterKey);
}

/** Permanently delete everything in the bin. */
export async function emptyBin(masterKey: Uint8Array): Promise<void> {
  const index = await loadIndex(masterKey);
  if (!index.items.some(isDeleted)) return;
  for (const item of index.items) if (isDeleted(item)) deleteItemFile(item.id);
  index.items = index.items.filter((it) => !isDeleted(it));
  await saveIndex(masterKey);
}

/** 30-day retention sweep: hard-deletes bin entries past the limit. Returns purged ids. */
export async function purgeExpired(masterKey: Uint8Array, now = Date.now()): Promise<string[]> {
  const index = await loadIndex(masterKey);
  const ids = expiredIds(index.items, now);
  if (ids.length === 0) return [];
  const purged = new Set(ids);
  for (const id of ids) deleteItemFile(id);
  index.items = index.items.filter((it) => !purged.has(it.id));
  await saveIndex(masterKey);
  return ids;
}

/** Bin items (deleted items), newest deletion first. */
export function binItems(index: VaultIndex): VaultItem[] {
  return binEntries(index.items);
}

function deleteItemFile(itemId: string): void {
  // The blob and both thumbnails: a leftover thumbnail is a leftover copy of
  // the user's photo.
  deleteItemFiles(expoFileSystem, itemFileLayout(), itemId);
  inflightThumbs.delete(itemId);
  clearInflight(itemId);
}

/** The paths of the files an item owns. */
function itemFileLayout(): ItemFileLayout {
  return {
    blob: (itemId) => itemFile(itemId).uri,
    thumb: (itemId) => thumbCipherFile(itemId).uri,
    plainThumb: (itemId) => thumbPlainFile(itemId).uri,
  };
}

export async function renameItem(masterKey: Uint8Array, itemId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name cannot be empty.');
  const index = await loadIndex(masterKey);
  const item = index.items.find((it) => it.id === itemId);
  if (!item) throw new Error('Item not found.');
  item.name = trimmed;
  await saveIndex(masterKey);
}

export async function moveItemsToFolder(
  masterKey: Uint8Array,
  ids: string[],
  folderId: string | null,
): Promise<void> {
  const index = await loadIndex(masterKey);
  if (folderId && !index.folders.some((f) => f.id === folderId)) {
    throw new Error('Folder not found.');
  }
  const set = new Set(ids);
  let matched = 0;
  for (const item of index.items) {
    if (!set.has(item.id)) continue;
    matched++;
    item.folderId = folderId;
  }
  if (matched === 0) throw new Error('Item not found.');
  await saveIndex(masterKey);
}

export async function moveItemToFolder(
  masterKey: Uint8Array,
  itemId: string,
  folderId: string | null,
): Promise<void> {
  return moveItemsToFolder(masterKey, [itemId], folderId);
}

/* ------------------------------------------------------------------ */
/* search / stats                                                      */
/* ------------------------------------------------------------------ */

export interface SearchResult {
  items: VaultItem[];
  /** folderId filters (undefined = all), derived from name matches too */
  matchedFolderIds: Set<string>;
}

export function searchItems(index: VaultIndex, rawQuery: string, folderId?: string | null): VaultItem[] {
  return searchItemsCore(index.items, rawQuery, index.folders, folderId);
}

export interface StorageStats {
  itemCount: number;
  folderCount: number;
  totalBytes: number;
}

export function computeStats(index: VaultIndex): StorageStats {
  return computeStatsCore(index.items, index.folders.length);
}

export async function eraseAllContents(masterKey: Uint8Array): Promise<void> {
  const files = filesDir();
  if (files.exists) files.delete();
  const index = indexFile();
  if (index.exists) index.delete();
  removeRestoreScratch();
  cachedByScope.set(activeScope, emptyIndex());
  inflightDecrypts.clear();
  await saveIndex(masterKey);
}

/* ------------------------------------------------------------------ */
/* restore scratch space                                               */
/* ------------------------------------------------------------------ */

/**
 * Restore writes into a staging directory first, so a failed attempt never
 * costs the vault that is already on disk. Both scratch directories live
 * INSIDE the scope's root: `wipeScope` and `eraseAllContents` delete the root
 * wholesale and therefore clean them up too.
 */
function stagingDir(): Directory {
  return new Directory(rootDir(), 'files-restore');
}

function previousFilesDir(): Directory {
  return new Directory(rootDir(), 'files-prev');
}

function removeRestoreScratch(): void {
  for (const dir of [stagingDir(), previousFilesDir()]) {
    try {
      if (dir.exists) dir.delete();
    } catch {
      // best effort — a leftover scratch directory holds no live data
    }
  }
}

/** Removes a scope's entire encrypted space (used when a decoy is removed). */
export function wipeScope(scope: VaultScope): void {
  const previous = activeScope;
  activeScope = scope;
  try {
    const root = rootDir();
    if (root.exists) root.delete();
  } finally {
    activeScope = previous;
  }
  cachedByScope.delete(scope);
}

/**
 * Replaces the current vault's contents with a backup's contents. The blobs
 * in a backup are envelopes under the backup's master key, so restoring is a
 * verbatim copy: stage the blobs, swap them in, then write the backup's index.
 *
 * The staging step matters: `copyBlob` reads a stream the user handed us, and
 * a truncated file or a full disk fails halfway through. Deleting the current
 * blobs first would turn a bad backup into a permanently empty vault, so
 * nothing on disk is touched until every blob has been read successfully.
 *
 * Callers must already hold the lock or be about to lock (the backup's
 * record replaces the secret record in SecureStore).
 */
export async function restoreVaultContents(
  masterKey: Uint8Array,
  index: VaultIndex,
  copyBlob: (itemId: string, dest: File) => Promise<void>,
): Promise<void> {
  const root = rootDir();
  ensureDir(root);

  // 1. Read every blob into a staging directory. The live vault is untouched.
  const staging = stagingDir();
  if (staging.exists) staging.delete();
  staging.create();
  try {
    for (const item of index.items) {
      const dest = new File(staging, `${item.id}.hmd`);
      if (dest.exists) dest.delete();
      dest.create();
      await copyBlob(item.id, dest);
    }
  } catch (error) {
    try {
      if (staging.exists) staging.delete();
    } catch {
      // best effort — the current vault was never touched
    }
    throw error;
  }

  // 2. Swap: park the old blobs under a scratch name rather than deleting
  //    them, so the swap is reversible until the new index is on disk.
  const previous = previousFilesDir();
  if (previous.exists) previous.delete();
  const hadFiles = filesDir().exists;
  if (hadFiles) await filesDir().move(previous);
  try {
    // `staging` and `filesDir()` instances update their uri after a move, so
    // re-resolve the destination instead of reusing a stale handle.
    await staging.move(filesDir());
    inflightDecrypts.clear();
    inflightThumbs.clear();
    await writeIndexFile(
      expoFileSystem,
      indexLayout(),
      JSON.stringify({ ...index, v: INDEX_VERSION }),
      masterKey,
      rand,
    );
  } catch (error) {
    // 3. Roll back: drop the half-written blobs and put the old ones back.
    try {
      const broken = filesDir();
      if (broken.exists) broken.delete();
      if (hadFiles && previous.exists) await previous.move(filesDir());
    } catch {
      // the original failure is the one worth reporting
    }
    throw error;
  }

  // Success — the parked blobs are no longer needed.
  try {
    if (previous.exists) previous.delete();
  } catch {
    // best effort; `eraseAllContents`/`wipeScope` clean it up otherwise
  }
  cachedByScope.set(activeScope, {
    v: INDEX_VERSION,
    folders: index.folders,
    items: index.items.map(normalizeItem),
  });
  notifyIndexListeners();
}

/* ------------------------------------------------------------------ */
/* plaintext decryption cache (viewers)                                */
/* ------------------------------------------------------------------ */

export function plainFileFor(item: VaultItem): File {
  const ext = item.ext && item.ext.startsWith('.') ? item.ext : item.ext ? `.${item.ext}` : '';
  return new File(tmpDir(), `${item.id}${ext}`);
}

export function hasCachedPlain(item: VaultItem): boolean {
  return plainFileFor(item).exists;
}

/**
 * Decrypts an item into the session cache and returns the plaintext file.
 * Concurrent calls for the same item share one decryption.
 */
export function decryptToCache(
  masterKey: Uint8Array,
  item: VaultItem,
  onProgress?: (p: FileCryptoProgress) => void,
): Promise<File> {
  const cached = plainFileFor(item);
  if (cached.exists) return Promise.resolve(cached);

  const existing = inflightDecrypts.get(item.id);
  if (existing) return existing;

  const task = (async () => {
    await decryptLimiter.acquire();
    try {
      ensureDir(tmpDir());
      const source = itemFile(item.id);
      if (!source.exists) throw new Error('Encrypted file is missing from the vault.');
      const dest = plainFileFor(item);
      await decryptFile({
        source: cryptoSource(source),
        dest: cryptoDest(dest),
        masterKey,
        onProgress,
      });
      return dest;
    } finally {
      decryptLimiter.release();
    }
  })();

  inflightDecrypts.set(item.id, task);
  task.catch(() => clearInflight(item.id));
  return task;
}

function clearInflight(itemId: string): void {
  inflightDecrypts.delete(itemId);
}

const plaintextGuard = createPlaintextGuard();

export function purgeTempPlaintext(): void {
  // A share sheet may still be reading the file from another app: the lock
  // still happens, but deletion waits until the share returns.
  plaintextGuard.requestPurge(() => {
    inflightDecrypts.clear();
    inflightThumbs.clear();
    const tmp = tmpDir();
    if (tmp.exists) tmp.delete();
  });
}

/**
 * Pins the decrypted cache for the lifetime of a cross-app handoff (sharing).
 * Releasing replays a purge that a lock requested in the meantime.
 */
export function holdPlaintextPurge(): () => void {
  return plaintextGuard.hold();
}

/* ------------------------------------------------------------------ */
/* encrypted thumbnails (grid)                                         */
/* ------------------------------------------------------------------ */

const THUMB_MAX_DIM = 256;
const THUMB_COMPRESS = 0.7;

/** Encrypted downscaled JPEG next to the item blob: <id>.thumb */
export function thumbCipherFile(itemId: string): File {
  return new File(filesDir(), `${itemId}.thumb`);
}

/** Decrypted thumb in the session cache (purged on lock). */
export function thumbPlainFile(itemId: string): File {
  return new File(tmpDir(), `${itemId}.thumb.jpg`);
}

async function writeBytesToNewFile(file: File, bytes: Uint8Array): Promise<void> {
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
}

/** Downscale `sourceUri` to a small JPEG and encrypt it as the item's thumb. */
async function buildThumbFromUri(
  masterKey: Uint8Array,
  itemId: string,
  sourceUri: string,
): Promise<void> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const rendered = await ImageManipulator.manipulate(sourceUri)
    .resize({ width: THUMB_MAX_DIM })
    .renderAsync();
  const result = await rendered.saveAsync({ compress: THUMB_COMPRESS, format: SaveFormat.JPEG });
  try {
    const plain = new File(result.uri);
    const bytes = await plain.bytes();
    const envelope = encryptBytes(bytes, masterKey, `${itemId}.thumb`, rand);
    ensureDir(filesDir());
    await writeBytesToNewFile(thumbCipherFile(itemId), envelope);
  } finally {
    try {
      new File(result.uri).delete();
    } catch {
      // temp cleanup is best-effort
    }
  }
}

/** Import-time thumb generation — best-effort, never fails the import. */
async function buildThumbForImport(
  masterKey: Uint8Array,
  itemId: string,
  sourceUri: string,
): Promise<void> {
  await buildThumbFromUri(masterKey, itemId, sourceUri);
}

/**
 * Grid thumbnail for a photo. Resolution order:
 *  1. decrypted thumb already cached (instant)
 *  2. encrypted thumb exists → decrypt the small blob (milliseconds)
 *  3. legacy item without a thumb → full decrypt once, downscale, encrypt
 *     the thumb for next time (self-backfill); on any thumb failure falls
 *     back to the full plaintext so the grid still renders.
 * Concurrent calls for the same item share one task. Never holds a decrypt
 * slot while waiting on `decryptToCache` (that would deadlock the cap).
 */
export function loadThumb(masterKey: Uint8Array, item: VaultItem): Promise<File> {
  const existing = inflightThumbs.get(item.id);
  if (existing) return existing;

  const task = (async () => {
    ensureDir(tmpDir());
    const plain = thumbPlainFile(item.id);
    if (plain.exists) return plain;

    const cipher = thumbCipherFile(item.id);
    if (cipher.exists) {
      await thumbLimiter.acquire();
      try {
        const envelope = await cipher.bytes();
        const opened = decryptBytes(envelope, masterKey);
        await writeBytesToNewFile(plain, opened.plaintext);
        return plain;
      } finally {
        thumbLimiter.release();
      }
    }

    // Legacy backfill: full decrypt (self-capped) → downscale → encrypt.
    const full = await decryptToCache(masterKey, item);
    try {
      await buildThumbFromUri(masterKey, item.id, full.uri);
      return plain.exists ? plain : full;
    } catch {
      return full;
    }
  })();

  inflightThumbs.set(item.id, task);
  task.catch(() => inflightThumbs.delete(item.id));
  return task;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Safety net: plaintext cache and index cache never outlive a lock.
onLock(() => {
  purgeTempPlaintext();
  cachedByScope.clear();
});
