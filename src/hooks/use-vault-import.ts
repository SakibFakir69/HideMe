import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { errorMessage, importAssets, type PickedAsset } from '@/lib/vault-store';
import { getMasterKey } from '@/lib/vault-session';
import { maybeShowImportInterstitial } from '@/lib/ads';
import { createImportCancellation, type ImportCancellation } from '@/lib/import-cancellation';
import { showToast } from '@/lib/toast';
import { beginPickerGrace, clearPickerGrace } from '@/lib/vault-autolock';

export type ImportKind = 'media' | 'camera' | 'audio' | 'document' | 'other';

/**
 * The MIME types the "Documents" row offers. "Other files" takes anything,
 * so this only narrows the common document formats.
 */
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/epub+zip',
  'application/json',
  'text/plain',
  'text/markdown',
  'text/csv',
];

export type ImportJobStatus =
  | 'importing'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'failed';

export interface ImportJobState {
  status: ImportJobStatus;
  /** Files that were added to the vault. */
  completed: number;
  /** Files in the batch. */
  total: number;
  /** 0..1 across the whole batch. */
  fraction: number;
  /** The file that is being processed. */
  currentName: string | null;
  /** The failure message, when the status is 'failed'. */
  message: string | null;
}

/** What the caller gets when the job is dismissed. */
export interface ImportOutcomeSummary {
  status: 'completed' | 'cancelled' | 'failed';
  completed: number;
  total: number;
  message: string | null;
}

export function useVaultImport(
  onImported?: (outcome: ImportOutcomeSummary) => void | Promise<void>,
) {
  const [state, setState] = useState<ImportJobState | null>(null);
  const [busy, setBusy] = useState(false);
  // The cancellation token belongs to the running job only — a second import
  // gets its own, so one cancellation can never reach another operation.
  const cancellationRef = useRef<ImportCancellation | null>(null);
  const summaryRef = useRef<ImportOutcomeSummary | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Leaving the screen stops the batch at the next checkpoint. The
      // cleanup still runs — the files that made it in are kept.
      cancellationRef.current?.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    const cancellation = cancellationRef.current;
    // Ignore repeated requests: the job is already stopping.
    if (!cancellation || cancellation.cancelled) return;
    setState((prev) =>
      prev && prev.status === 'importing' ? { ...prev, status: 'cancelling' } : prev,
    );
    cancellation.cancel();
  }, []);

  const dismiss = useCallback(() => {
    const summary = summaryRef.current;
    summaryRef.current = null;
    setState(null);
    if (summary) {
      // The summary survives the screen that raised it: the toast lives in the
      // vault layout, so the user still sees what was added.
      if (summary.status === 'completed') {
        showToast(
          `${summary.completed} file${summary.completed === 1 ? '' : 's'} added to your vault.`,
          'success',
        );
      } else if (summary.status === 'cancelled') {
        showToast(
          summary.completed > 0
            ? `Import cancelled — ${summary.completed} file${summary.completed === 1 ? '' : 's'} kept.`
            : 'Import cancelled.',
        );
      } else {
        showToast(summary.message ?? 'The import could not be finished.', 'error');
      }
      void onImported?.(summary);
    }
  }, [onImported]);

  const runImport = useCallback(
    async (kind: ImportKind, folderId: string | null) => {
      // One import at a time — the source rows are disabled while busy, but
      // a double tap can still land twice.
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const cancellation = createImportCancellation();
      cancellationRef.current = cancellation;
      try {
        const assets = await pickAssets(kind);
        if (assets === null) return; // the picker was dismissed
        if (assets.length === 0) {
          Alert.alert(
            'Nothing selected',
            'No files were picked — try again and select at least one item.',
          );
          return;
        }

        // Show the modal immediately — before the first chunk report — so the
        // gap (index load, dirs, header build) never looks frozen.
        setState({
          status: 'importing',
          completed: 0,
          total: assets.length,
          fraction: 0,
          currentName: assets[0]?.name ?? null,
          message: null,
        });

        const outcome = await importAssets({
          masterKey: getMasterKey(),
          folderId,
          assets,
          cancellation,
          onProgress: (progress) => {
            if (!mountedRef.current) return;
            setState((prev) =>
              prev && prev.status === 'importing'
                ? {
                    ...prev,
                    completed: progress.fileIndex,
                    fraction: progress.fraction,
                    currentName: progress.fileName ?? prev.currentName,
                  }
                : prev,
            );
          },
        });

        if (!mountedRef.current) return;
        const failed = outcome.status === 'failed';
        const summary: ImportOutcomeSummary = {
          status: outcome.status,
          completed: outcome.added.length,
          total: assets.length,
          message: failed ? errorMessage(outcome.error) : null,
        };
        summaryRef.current = summary;
        setState({
          status: outcome.status,
          completed: outcome.added.length,
          total: assets.length,
          fraction: outcome.status === 'completed' ? 1 : 0,
          currentName: null,
          message: summary.message,
        });

        if (outcome.status === 'completed') {
          // Every 2nd completed import shows an interstitial (separate from
          // the once-per-24h unlock ad). Fire-and-forget: navigation must not
          // wait.
          void maybeShowImportInterstitial();
        }
      } catch (error) {
        if (!mountedRef.current) return;
        const summary: ImportOutcomeSummary = {
          status: 'failed',
          completed: 0,
          total: 0,
          message: errorMessage(error),
        };
        summaryRef.current = summary;
        setState({
          status: 'failed',
          completed: 0,
          total: 0,
          fraction: 0,
          currentName: null,
          message: summary.message,
        });
      } finally {
        busyRef.current = false;
        cancellationRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    },
    [],
  );

  return { busy, state, cancel, dismiss, importAssets: runImport };
}

/** Returns null when the user cancels the picker. */
async function pickAssets(kind: ImportKind): Promise<PickedAsset[] | null> {
  // The permission prompt and the picker are both system activities: they
  // put the app in the background, where the auto-lock would fire. Arm the
  // grace before the first of them, not just before the picker.
  beginPickerGrace();
  try {
    return await openPicker(kind);
  } catch (error) {
    // No picker was shown, so the grace has nothing to cover.
    clearPickerGrace();
    throw error;
  }
}

async function openPicker(kind: ImportKind): Promise<PickedAsset[] | null> {
  if (kind === 'media') {
    // Android ≤12 needs the runtime grant; 13+ uses the system photo picker
    // (returns granted automatically). iOS always needs the prompt.
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Photo library access is required to import media. Enable it in system Settings → Apps → Calculator → Permissions.',
      );
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

  if (kind === 'camera') {
    // The camera is the system camera app, so the app does not hold the
    // camera permission itself — only the runtime grant is asked for.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Camera access is required to take a photo. Enable it in system Settings → Apps → Calculator → Permissions.',
      );
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    const mime = asset.mimeType ?? 'image/jpeg';
    return [
      {
        uri: asset.uri,
        name: asset.fileName?.trim() || `photo${extFromMime(mime)}`,
        mime,
        width: asset.width || undefined,
        height: asset.height || undefined,
      },
    ];
  }

  if (kind === 'audio') {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: 'audio/*',
    });
    if (result.canceled) return null;
    return result.assets.map((asset, i) => ({
      uri: asset.uri,
      name: asset.name?.trim() || `audio-${i + 1}`,
      mime: asset.mimeType || 'audio/mpeg',
    }));
  }

  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: true,
    type: kind === 'document' ? DOCUMENT_TYPES : '*/*',
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
