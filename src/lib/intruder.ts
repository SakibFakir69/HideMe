import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import {
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  encryptBytes,
  type Random,
} from './crypto/envelope';

/**
 * Intruder selfies: when a wrong code is entered at the gate, the front
 * camera silently captures one photo. Captures are encrypted with a
 * dedicated key (SecureStore) — the vault master key is NOT available while
 * locked, and this feature must work in exactly that state.
 *
 * Layout: <documents>/intruder/meta.json  (plain list of entries, ids+times)
 *         <documents>/intruder/<id>.jpg.enc (encrypted ~720px JPEG)
 */

const ENABLED_KEY = 'intruder.enabled.v1';
const PHOTO_KEY = 'intruder.key.v1';
/** Keep the newest N captures — the oldest are deleted. */
const MAX_ENTRIES = 20;

export interface IntruderEntry {
  id: string;
  /** Epoch ms of the failed attempt. */
  at: number;
}

const rand: Random = (length: number) => Crypto.getRandomBytes(length);

function dir(): Directory {
  return new Directory(Paths.document, 'intruder');
}

function metaFile(): File {
  return new File(dir(), 'meta.json');
}

interface MetaFile {
  v: number;
  entries: IntruderEntry[];
}

async function readMeta(): Promise<MetaFile> {
  const file = metaFile();
  if (!file.exists) return { v: 1, entries: [] };
  try {
    const parsed = JSON.parse(await file.text()) as MetaFile;
    if (!Array.isArray(parsed.entries)) return { v: 1, entries: [] };
    return { v: 1, entries: parsed.entries.filter((e) => typeof e?.id === 'string') };
  } catch {
    return { v: 1, entries: [] };
  }
}

function writeMeta(meta: MetaFile): void {
  const d = dir();
  if (!d.exists) d.create();
  metaFile().write(JSON.stringify(meta));
}

export async function isArmed(): Promise<boolean> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return false;
    return (await SecureStore.getItemAsync(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Whether the device granted camera permission (requested at arm time). */
export async function hasCameraPermission(): Promise<boolean> {
  try {
    const Camera = (await import('expo-camera')).Camera;
    return (await Camera.getCameraPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Arms the feature. Requests camera permission first — the prompt belongs in
 * Settings, never on the disguised gate screen.
 * Returns false when permission was denied (feature stays off).
 */
export async function setArmed(enabled: boolean): Promise<boolean> {
  if (!(await SecureStore.isAvailableAsync())) return false;
  if (enabled) {
    const Camera = (await import('expo-camera')).Camera;
    const { granted } = await Camera.requestCameraPermissionsAsync();
    if (!granted) return false;
    // A capture key must exist before the first capture; a vault key is not
    // usable here (the vault is locked when intrusions happen).
    if ((await SecureStore.getItemAsync(PHOTO_KEY)) === null) {
      await SecureStore.setItemAsync(PHOTO_KEY, bytesToBase64(Crypto.getRandomBytes(32)));
    }
  }
  await SecureStore.setItemAsync(ENABLED_KEY, enabled ? '1' : '0');
  return true;
}

function b64ToBytes(b64: string): Uint8Array {
  return base64ToBytes(b64);
}

async function captureKey(): Promise<Uint8Array | null> {
  try {
    const raw = await SecureStore.getItemAsync(PHOTO_KEY);
    if (!raw) return null;
    const key = b64ToBytes(raw);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/** All captures, newest first. */
export async function listCaptures(): Promise<IntruderEntry[]> {
  return (await readMeta()).entries;
}

export async function captureCount(): Promise<number> {
  return (await readMeta()).entries.length;
}

/**
 * Encrypts and stores one capture (a temp photo URI from the camera). The
 * source file is deleted afterwards — no plaintext intruder photo lingers.
 * Never throws into the unlock flow: failures are swallowed.
 */
export async function recordCapture(sourceUri: string): Promise<void> {
  try {
    const key = await captureKey();
    if (!key) return;
    const source = new File(sourceUri);
    if (!source.exists) return;

    // Downscale: intruder evidence needs a face, not megabytes.
    const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
    const rendered = await ImageManipulator.manipulate(sourceUri)
      .resize({ width: 720 })
      .renderAsync();
    const result = await rendered.saveAsync({ compress: 0.5, format: SaveFormat.JPEG });
    try {
      const plain = new File(result.uri);
      const bytes = await plain.bytes();
      const id = Crypto.randomUUID();
      const entry: IntruderEntry = { id, at: Date.now() };
      const envelope = encryptBytes(bytes, key, 'intruder.capture.v1', rand);
      const d = dir();
      if (!d.exists) d.create();
      const dest = new File(d, `${id}.jpg.enc`);
      if (dest.exists) dest.delete();
      dest.create();
      await dest.write(envelope);

      const meta = await readMeta();
      meta.entries.unshift(entry);
      // Trim the oldest captures; their files go with them.
      while (meta.entries.length > MAX_ENTRIES) {
        const oldest = meta.entries.pop();
        if (oldest) deleteCaptureFile(oldest.id);
      }
      writeMeta(meta);
    } finally {
      try {
        new File(result.uri).delete();
      } catch {
        // best effort
      }
    }
  } catch {
    // A failed capture must never disturb the unlock attempt it witnessed.
  } finally {
    try {
      const source = new File(sourceUri);
      if (source.exists) source.delete();
    } catch {
      // best effort
    }
  }
}

function deleteCaptureFile(id: string): void {
  try {
    const file = new File(dir(), `${id}.jpg.enc`);
    if (file.exists) file.delete();
  } catch {
    // best effort
  }
}

/** Decrypts one capture to bytes (for the viewer screen). */
export async function readCapture(entry: IntruderEntry): Promise<Uint8Array | null> {
  try {
    const key = await captureKey();
    if (!key) return null;
    const file = new File(dir(), `${entry.id}.jpg.enc`);
    if (!file.exists) return null;
    const envelope = await file.bytes();
    return decryptBytes(envelope, key).plaintext;
  } catch {
    return null;
  }
}

/** Deletes one capture (file + entry). Resolves after the metadata is written. */
export async function deleteCapture(id: string): Promise<void> {
  const meta = await readMeta();
  const next = meta.entries.filter((entry) => entry.id !== id);
  writeMeta({ v: 1, entries: next });
  deleteCaptureFile(id);
}

/** Disarms and wipes everything (used by "Erase all contents" too). */
export async function wipeAll(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ENABLED_KEY, '0');
  } catch {
    // best effort
  }
  const d = dir();
  if (d.exists) d.delete();
}
