import { Directory, File, Paths } from 'expo-file-system';

import { holdPlaintextPurge } from './vault-store';

export type ShareResult = 'shared' | 'unavailable' | 'failed';

/** Keeps the share sheet readable: no path separators, sane length, extension kept. */
function shareTargetName(name: string, ext: string): string {
  const safe = (name.trim() || 'file').replace(/[\\/:*?"<>|]/g, '_');
  const suffix = ext ? (ext.startsWith('.') ? ext : `.${ext}`) : '';
  const finished =
    suffix && !safe.toLowerCase().endsWith(suffix.toLowerCase()) ? `${safe}${suffix}` : safe;
  if (finished.length <= 80) return finished;
  const dot = finished.lastIndexOf('.');
  const base = dot > 0 ? finished.slice(0, dot) : finished;
  const tail = dot > 0 ? finished.slice(dot) : '';
  return `${base.slice(0, Math.max(1, 80 - tail.length))}${tail}`;
}

/**
 * Copies the decrypted file into the session cache under its real name, so
 * the share sheet (and the receiving app) sees `Holiday.jpg`, not `<id>.jpg`.
 * The copy lives in `vault-tmp`, which is purged on lock like every other
 * plaintext artefact.
 */
async function prepareShareCopy(file: File, name: string, ext: string): Promise<File> {
  const dir = new Directory(Paths.cache, 'vault-tmp');
  if (!dir.exists) dir.create();
  const target = new File(dir, shareTargetName(name, ext));
  if (target.exists) target.delete();
  await file.copy(target);
  return target;
}

/**
 * Hands a decrypted vault file to the system share sheet.
 *
 * `expo-sharing` is imported lazily so builds without the native module (and
 * web) report "unavailable" instead of crashing when the viewer mounts.
 */
export async function shareVaultFile(
  file: File,
  item: { name: string; ext: string; mime: string },
): Promise<ShareResult> {
  // Auto-lock may fire while the share sheet is open; keep the plaintext alive
  // until the handoff returns, then let the deferred purge run.
  const release = holdPlaintextPurge();
  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const target = await prepareShareCopy(file, item.name, item.ext);
    await Sharing.shareAsync(target.uri, {
      mimeType: item.mime || undefined,
      dialogTitle: `Share ${item.name}`,
    });
    return 'shared';
  } catch {
    return 'failed';
  } finally {
    release();
  }
}

/**
 * Shares a file that is already a readable temporary artefact (the export
 * archive), so it is handed over where it lies instead of being copied.
 */
export async function sharePreparedFile(
  file: File,
  options: { mime: string; title: string },
): Promise<ShareResult> {
  const release = holdPlaintextPurge();
  try {
    const Sharing = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    await Sharing.shareAsync(file.uri, {
      mimeType: options.mime || undefined,
      dialogTitle: options.title,
    });
    return 'shared';
  } catch {
    return 'failed';
  } finally {
    release();
  }
}
