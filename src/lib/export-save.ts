import type { File } from 'expo-file-system';

import { isSaveAsAvailable, saveAs } from '../../modules/vault-export';

export type SaveAsResult = 'saved' | 'cancelled' | 'unavailable' | 'failed';

/** True when the platform can write a file to a place the user picks. */
export function canSaveAs(): boolean {
  return isSaveAsAvailable();
}

/**
 * Saves a prepared file into a location the user picks.
 *
 * Android needs the Storage Access Framework for this — the share sheet can
 * only hand a file to another app. iOS does not need it: the share sheet
 * already offers "Save to Files".
 */
export async function saveExportAs(
  file: File,
  name: string,
  mime: string,
): Promise<SaveAsResult> {
  if (!isSaveAsAvailable()) return 'unavailable';
  try {
    const uri = await saveAs(file.uri, mime, name);
    return uri ? 'saved' : 'cancelled';
  } catch {
    return 'failed';
  }
}
