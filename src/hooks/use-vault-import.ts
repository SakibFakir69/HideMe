import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { errorMessage, importAssets, type ImportProgress, type PickedAsset } from '@/lib/vault-store';
import { getMasterKey } from '@/lib/vault-session';

export type ImportKind = 'media' | 'document';

export function useVaultImport(onImported?: () => Promise<void>) {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const runImport = useCallback(
    async (kind: ImportKind, folderId: string | null) => {
      if (busy) return;
      setBusy(true);
      try {
        console.log(`[import] pick start kind=${kind} folder=${folderId ?? 'root'}`);
        const assets = await pickAssets(kind);
        if (assets === null) {
          console.log('[import] picker cancelled');
          setBusy(false);
          return; // cancelled
        }
        if (assets.length === 0) {
          console.log('[import] picker returned 0 assets');
          Alert.alert('Nothing selected', 'No files were picked — try again and select at least one item.');
          setBusy(false);
          return;
        }
        console.log(`[import] picked ${assets.length} asset(s): ${assets.map((a) => `${a.name}(${a.mime}) ${a.uri.slice(0, 60)}`).join(' | ')}`);
        // Show the modal immediately — before the first chunk report — so the
        // gap (index load, dirs, header build) never looks frozen.
        setProgress({
          fileIndex: 0,
          fileCount: assets.length,
          processed: 0,
          fileBytes: 0,
          fraction: 0,
          phase: 'Preparing…',
        });
        await importAssets({
          masterKey: getMasterKey(),
          folderId,
          assets,
          onProgress: setProgress,
        });
        console.log('[import] completed ok');
        await onImported?.();
      } catch (error) {
        console.log(`[import] FAILED: ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}`);
        Alert.alert('Import failed', errorMessage(error));
      } finally {
        setProgress(null);
        setBusy(false);
      }
    },
    [busy, onImported],
  );

  return { busy, progress, importAssets: runImport };
}

/** Returns null when the user cancels the picker. */
async function pickAssets(kind: ImportKind): Promise<PickedAsset[] | null> {
  if (kind === 'media') {
    // Android ≤12 needs the runtime grant; 13+ uses the system photo picker
    // (returns granted automatically). iOS always needs the prompt.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    console.log(`[import] media permission granted=${permission.granted} canAskAgain=${permission.canAskAgain} status=${permission.status}`);
    if (!permission.granted) {
      throw new Error(
        'Photo library access is required to import media. Enable it in system Settings → Apps → HideMe → Permissions.',
      );
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      orderedSelection: true,
    });
    console.log(`[import] image picker canceled=${result.canceled} assets=${result.canceled ? 0 : result.assets.length}`);
    if (result.canceled) return null;
    return result.assets.map((asset, i) => {
      const isVideo = asset.type === 'video';
      const mime = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
      const name = asset.fileName?.trim() || `${isVideo ? 'video' : 'photo'}-${i + 1}${extFromMime(mime)}`;
      return {
        uri: asset.uri,
        name,
        mime,
        width: asset.width || undefined,
        height: asset.height || undefined,
        durationMs: asset.duration ?? undefined,
      };
    });
  }

  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
    type: '*/*',
  });
  console.log(`[import] doc picker canceled=${result.canceled} assets=${result.canceled ? 0 : result.assets.length}`);
  if (result.canceled) return null;
  return result.assets.map((asset, i) => ({
    uri: asset.uri,
    name: asset.name?.trim() || `document-${i + 1}`,
    mime: asset.mimeType || 'application/octet-stream',
  }));
}

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/heic') return '.heic';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'video/mp4') return '.mp4';
  return '';
}
