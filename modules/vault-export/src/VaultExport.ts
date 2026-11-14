import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class VaultExportModule extends NativeModule<{}> {
  isAvailable(): boolean;
  /**
   * Asks the system for a destination and copies the file there.
   * Resolves with the content URI, or null when the user dismissed the picker.
   */
  saveAs(
    sourcePath: string,
    mimeType: string,
    suggestedName: string,
  ): Promise<string | null>;
}

const VaultExport = requireOptionalNativeModule<VaultExportModule>('VaultExport');

/** True when the platform can write a file to a place the user picks. */
export function isSaveAsAvailable(): boolean {
  try {
    return VaultExport?.isAvailable() === true;
  } catch {
    return false;
  }
}

/**
 * Saves a file into a location the user picks.
 *
 * Returns the content URI of the saved file, or null when the user
 * dismissed the picker.
 */
export async function saveAs(
  sourcePath: string,
  mimeType: string,
  suggestedName: string,
): Promise<string | null | undefined> {
  if (!VaultExport) return undefined;
  return VaultExport.saveAs(sourcePath, mimeType, suggestedName);
}

export default VaultExport;
