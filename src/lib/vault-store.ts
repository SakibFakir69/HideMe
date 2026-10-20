import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import {
  decryptBytes,
  encryptBytes,
  fromUtf8,
  utf8,
  type Random,
} from './crypto/envelope';
import { decryptFile, encryptFile, type FileCryptoProgress } from './crypto/file-crypto';
import { onLock } from './vault-session';

/**
 * Vault storage: app-private sandbox.
 *   <documents>/vault/index.hmd     encrypted index envelope
 *   <documents>/vault/files/<id>.hmd   encrypted content blobs
 *   <cache>/vault-tmp/...           decrypted plaintext (purged on lock)
 */

export type ItemKind = 'photo' | 'video' | 'document';

export interface VaultFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface VaultItem {
  id: string;
  name: string;
  kind: ItemKind;
  mime: string;
  ext: string;
  size: number;
  folderId: string | null;
  createdAt: number;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface VaultIndex {
  v: 2;
  folders: VaultFolder[];
  items: VaultItem[];
}

export interface PickedAsset {
  uri: string;
  name: string;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface ImportProgress {
  /** 0-based index of the file being encrypted */
  fileIndex: number;
  fileCount: number;
  /** bytes within the current file */
  processed: number;
  fileBytes: number;
  /** 0..1 across the whole batch */
  fraction: number;
}

const rand: Random = (length: number) => Crypto.getRandomBytes(length);

let cachedIndex: VaultIndex | null = null;
const inflightDecrypts = new Map<string, Promise<File>>();

function emptyIndex(): VaultIndex {
  return { v: 2, folders: [], items: [] };
}

function rootDir(): Directory {
  return new Directory(Paths.document, 'vault');
}

function filesDir(): Directory {
  return new Directory(rootDir(), 'files');
}

function indexFile(): File {
  return new File(rootDir(), 'index.hmd');
}

function tmpDir(): Directory {
  return new Directory(Paths.cache, 'vault-tmp');
}

function ensureDir(dir: Directory): void {
  if (!dir.exists) dir.create();
}

function ensureIndexFile(): File {
  ensureDir(rootDir());
  const f = indexFile();
  if (f.exists) f.delete();
  f.create();
  return f;
}

export function itemFile(itemId: string): File {
  return new File(filesDir(), `${itemId}.hmd`);
}

export function kindForMime(mime: string): ItemKind {
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

function extFor(name: string, mime: string): string {
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) return name.slice(dot).toLowerCase();
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}

/* ------------------------------------------------------------------ */
/* index                                                               */
/* ------------------------------------------------------------------ */

export async function loadIndex(masterKey: Uint8Array): Promise<VaultIndex> {
  if (cachedIndex) return cachedIndex;
  ensureDir(rootDir());
  const f = indexFile();
  if (!f.exists) {
    cachedIndex = emptyIndex();
    return cachedIndex;
  }
  const env = await f.bytes();
  const opened = decryptBytes(env, masterKey);
  let parsed: VaultIndex;
  try {
    parsed = JSON.parse(fromUtf8(opened.plaintext)) as VaultIndex;
  } catch {
    throw new Error('Vault index is corrupted.');
  }
  if (parsed.v !== 2 || !Array.isArray(parsed.folders) || !Array.isArray(parsed.items)) {
    throw new Error('Vault index is corrupted.');
  }
  cachedIndex = parsed;
  return cachedIndex;
}

async function saveIndex(masterKey: Uint8Array): Promise<void> {
  if (!cachedIndex) throw new Error('Vault index is not loaded.');
  const bytes = encryptBytes(utf8(JSON.stringify(cachedIndex)), masterKey, 'vault-index', rand);
  const f = ensureIndexFile();
  await f.write(bytes);
}

export function peekIndex(): VaultIndex | null {
  return cachedIndex;
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
}

export async function importAssets(opts: ImportOptions): Promise<VaultItem[]> {
  const { masterKey, folderId, assets, onProgress } = opts;
  const index = await loadIndex(masterKey);
  if (folderId && !index.folders.some((f) => f.id === folderId)) {
    throw new Error('Folder not found.');
  }
  ensureDir(rootDir());
  ensureDir(filesDir());

  const added: VaultItem[] = [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const id = Crypto.randomUUID();
    const source = new File(asset.uri);
    const dest = itemFile(id);
    const report = (p: FileCryptoProgress) =>
      onProgress?.({
        fileIndex: i,
        fileCount: assets.length,
        processed: p.processed,
        fileBytes: p.total,
        fraction: assets.length === 0 ? 1 : (i + (p.total > 0 ? p.processed / p.total : 0)) / assets.length,
      });
    let size = 0;
    try {
      size = await encryptFile({
        source,
        dest,
        fileId: id,
        masterKey,
        rand,
        onProgress: report,
      });
    } catch (error) {
      if (dest.exists) dest.delete();
      const label = asset.name || asset.uri;
      throw new Error(`Could not encrypt "${label}": ${errorMessage(error)}`);
    }
    const item: VaultItem = {
      id,
      name: asset.name.trim() || `file-${i + 1}`,
      kind: kindForMime(asset.mime),
      mime: asset.mime,
      ext: extFor(asset.name, asset.mime),
      size,
      folderId,
      createdAt: Date.now(),
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
    };
    index.items.push(item);
    added.push(item);
    onProgress?.({
      fileIndex: i + 1,
      fileCount: assets.length,
      processed: 0,
      fileBytes: 0,
      fraction: (i + 1) / assets.length,
    });
  }
  await saveIndex(masterKey);
  return added;
}

export async function deleteItem(masterKey: Uint8Array, itemId: string): Promise<void> {
  const index = await loadIndex(masterKey);
  const at = index.items.findIndex((it) => it.id === itemId);
  if (at < 0) throw new Error('Item not found.');
  const file = itemFile(itemId);
  if (file.exists) file.delete();
  index.items.splice(at, 1);
  await saveIndex(masterKey);
  clearInflight(itemId);
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

export async function moveItemToFolder(
  masterKey: Uint8Array,
  itemId: string,
  folderId: string | null,
): Promise<void> {
  const index = await loadIndex(masterKey);
  if (folderId && !index.folders.some((f) => f.id === folderId)) {
    throw new Error('Folder not found.');
  }
  const item = index.items.find((it) => it.id === itemId);
  if (!item) throw new Error('Item not found.');
  item.folderId = folderId;
  await saveIndex(masterKey);
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
  const scope = folderId === undefined ? null : folderId;
  const q = rawQuery.trim().toLowerCase();
  const scopeItems = scope ? index.items.filter((it) => it.folderId === scope) : index.items;
  if (!q) return scopeItems;
  return scopeItems.filter((item) => {
    if (item.name.toLowerCase().includes(q)) return true;
    const folder = getFolder(index, item.folderId);
    return folder !== null && folder.name.toLowerCase().includes(q);
  });
}

export interface StorageStats {
  itemCount: number;
  folderCount: number;
  totalBytes: number;
}

export function computeStats(index: VaultIndex): StorageStats {
  let totalBytes = 0;
  for (const item of index.items) totalBytes += item.size;
  return { itemCount: index.items.length, folderCount: index.folders.length, totalBytes };
}

export async function eraseAllContents(masterKey: Uint8Array): Promise<void> {
  const files = filesDir();
  if (files.exists) files.delete();
  const index = indexFile();
  if (index.exists) index.delete();
  cachedIndex = emptyIndex();
  inflightDecrypts.clear();
  await saveIndex(masterKey);
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
    ensureDir(tmpDir());
    const source = itemFile(item.id);
    if (!source.exists) throw new Error('Encrypted file is missing from the vault.');
    const dest = plainFileFor(item);
    await decryptFile({ source, dest, masterKey, onProgress });
    return dest;
  })();

  inflightDecrypts.set(item.id, task);
  task.catch(() => clearInflight(item.id));
  return task;
}

function clearInflight(itemId: string): void {
  inflightDecrypts.delete(itemId);
}

export function purgeTempPlaintext(): void {
  inflightDecrypts.clear();
  const tmp = tmpDir();
  if (tmp.exists) tmp.delete();
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Safety net: plaintext cache and index cache never outlive a lock.
onLock(() => {
  purgeTempPlaintext();
  cachedIndex = null;
});
