import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { errorMessage, importAssets, type ImportProgress, type PickedAsset } from '@/lib/vault-store';
import { getMasterKey } from '@/lib/vault-session';

export type ImportKind = 'media' | 'document';

export function useVaultImport() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const runImport = useCallback(async (kind: ImportKind, folderId: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const assets = await pickAssets(kind);
      if (assets === null) {
        setBusy(false);
        return; // cancelled
      }
      if (assets.length === 0) {
        setBusy(false);
        return;
      }
      await importAssets({
        masterKey: getMasterKey(),
        folderId,
        assets,
        onProgress: setProgress,
      });
    } catch (error) {
      Alert.alert('Import failed', errorMessage(error));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }, [busy]);

  return { busy, progress, importAssets: runImport };
}

/** Returns null when the user cancels the picker. */
async function pickAssets(kind: ImportKind): Promise<PickedAsset[] | null> {
  if (kind === 'media') {
    if (Platform.OS === 'ios') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Photo library access is required to import media.');
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      orderedSelection: true,
    });
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
