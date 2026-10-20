import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { File } from 'expo-file-system';
import { VideoView, useVideoPlayer } from 'expo-video';

import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { formatBytes, formatDate } from '@/components/vault/format';
import { NamePromptModal } from '@/components/vault/name-prompt-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getMasterKey } from '@/lib/vault-session';
import { deleteItem, decryptToCache, errorMessage, moveItemToFolder, renameItem } from '@/lib/vault-store';
import type { VaultItem } from '@/lib/vault-store';

type DecryptState =
  | { phase: 'working'; percent: number }
  | { phase: 'ready'; file: File }
  | { phase: 'error'; message: string };

export default function ItemScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { index, loading, refresh } = useVaultIndex();
  const [decrypt, setDecrypt] = useState<DecryptState>({ phase: 'working', percent: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const percentRef = useRef(0);

  const item = useMemo(() => index?.items.find((it) => it.id === id) ?? null, [index, id]);

  // Reset the viewer whenever the item reference changes
  // (adjust-state-during-render — avoids setState-in-effect).
  const [prevItem, setPrevItem] = useState<VaultItem | null>(item);
  if (item !== prevItem) {
    setPrevItem(item);
    setDecrypt({ phase: 'working', percent: 0 });
  }

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    percentRef.current = 0;
    decryptToCache(
      getMasterKey(),
      item,
      ({ processed, total }) => {
        if (cancelled || total <= 0) return;
        const next = Math.floor((processed / total) * 100);
        if (next !== percentRef.current) {
          percentRef.current = next;
          setDecrypt({ phase: 'working', percent: next });
        }
      },
    )
      .then((file) => {
        if (!cancelled) setDecrypt({ phase: 'ready', file });
      })
      .catch((error) => {
        if (!cancelled) setDecrypt({ phase: 'error', message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const onDelete = useCallback(async () => {
    if (!item) return;
    const ok = await confirmDestructive('Delete permanently', `Delete "${item.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteItem(getMasterKey(), item.id);
      router.back();
    } catch (error) {
      Alert.alert('Could not delete', errorMessage(error));
    }
  }, [item]);

  if (!loading && !item) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <Header title="File" onBack={() => router.back()} />
          <View style={styles.centerBox}>
            <ThemedText type="small" themeColor="textSecondary">
              This file no longer exists.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Header
          title={item?.name ?? 'File'}
          onBack={() => router.back()}
          onMore={item ? () => setMenuOpen(true) : undefined}
        />

        <View style={[styles.stage, { backgroundColor: theme.backgroundElement }]}>
          {!item || decrypt.phase === 'working' ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                {!item
                  ? 'Loading…'
                  : decrypt.phase === 'working' && decrypt.percent > 0
                    ? `Decrypting ${decrypt.percent}%`
                    : 'Decrypting…'}
              </ThemedText>
            </View>
          ) : decrypt.phase === 'error' ? (
            <View style={styles.centerBox}>
              <Ionicons name="alert-circle-outline" size={30} color="#D9342B" />
              <ThemedText type="small" themeColor="textSecondary" style={styles.errorText}>
                {decrypt.message}
              </ThemedText>
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [styles.smallButton, { backgroundColor: theme.backgroundSelected }, pressed && styles.pressed]}>
                <ThemedText type="small">Go back</ThemedText>
              </Pressable>
            </View>
          ) : item.kind === 'photo' ? (
            <Image
              source={{ uri: decrypt.file.uri }}
              style={styles.image}
              contentFit="contain"
              transition={150}
            />
          ) : item.kind === 'video' ? (
            <VideoPlayerView uri={decrypt.file.uri} />
          ) : (
            <DocumentView
              item={item}
              file={decrypt.file}
              onOpenError={(message) => Alert.alert('Could not open document', message)}
            />
          )}
        </View>

        {item && (
          <View style={styles.meta}>
            <ThemedText type="small" numberOfLines={1}>
              {item.name}
            </ThemedText>
            <ThemedText type="code" themeColor="textSecondary">
              {item.mime} · {formatBytes(item.size)} · {formatDate(item.createdAt)}
            </ThemedText>
          </View>
        )}
      </SafeAreaView>

      <ActionSheetModal
        visible={menuOpen}
        title={item?.name}
        actions={[
          {
            label: 'Rename',
            icon: <Ionicons name="pencil-outline" size={18} color={theme.text} />,
            onSelect: () => setRenaming(true),
          },
          {
            label: 'Move to folder',
            icon: <Ionicons name="folder-outline" size={18} color={theme.text} />,
            onSelect: () => setMoving(true),
          },
          {
            label: 'Delete',
            destructive: true,
            icon: <Ionicons name="trash-outline" size={18} color="#D9342B" />,
            onSelect: () => void onDelete(),
          },
        ]}
        onClose={() => setMenuOpen(false)}
      />

      <NamePromptModal
        visible={renaming}
        title="Rename file"
        placeholder="File name"
        initialValue={item?.name ?? ''}
        submitLabel="Rename"
        onClose={() => setRenaming(false)}
        onSubmit={async (value) => {
          if (!item) return;
          await renameItem(getMasterKey(), item.id, value);
          await refresh();
        }}
      />

      <MoveToFolderSheet
        visible={moving}
        item={item}
        onClose={() => setMoving(false)}
        onChanged={refresh}
      />
    </ThemedView>
  );
}

function MoveToFolderSheet({
  visible,
  item,
  onClose,
  onChanged,
}: {
  visible: boolean;
  item: VaultItem | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const { index } = useVaultIndex();
  if (!item || !index) return null;

  const actions = [
    {
      label: 'All items (no folder)',
      icon: (
        <Ionicons
          name={item.folderId === null ? 'radio-button-on' : 'radio-button-off'}
          size={18}
          color={item.folderId === null ? '#208AEF' : theme.text}
        />
      ),
      onSelect: async () => {
        await moveItemToFolder(getMasterKey(), item.id, null);
        await onChanged();
      },
    },
    ...index.folders.map((folder) => ({
      label: folder.name,
      icon: (
        <Ionicons
          name={item.folderId === folder.id ? 'radio-button-on' : 'radio-button-off'}
          size={18}
          color={item.folderId === folder.id ? '#208AEF' : theme.text}
        />
      ),
      onSelect: async () => {
        await moveItemToFolder(getMasterKey(), item.id, folder.id);
        await onChanged();
      },
    })),
  ];

  return <ActionSheetModal visible={visible} title="Move to folder" actions={actions} onClose={onClose} />;
}

function VideoPlayerView({ uri }: { uri: string }) {
  const theme = useTheme();
  const [firstFrame, setFirstFrame] = useState(false);
  const player = useVideoPlayer({ uri }, (p) => {
    p.play();
  });

  return (
    <View style={styles.videoWrap}>
      {!firstFrame && (
        <View style={[styles.centerBox, StyleSheet.absoluteFill]}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      )}
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
        onFirstFrameRender={() => setFirstFrame(true)}
      />
    </View>
  );
}

function DocumentView({
  item,
  file,
  onOpenError,
}: {
  item: VaultItem;
  file: File;
  onOpenError: (message: string) => void;
}) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const can = await file.canPreview();
      if (!can) {
        onOpenError('No app on this device can open this file type.');
        return;
      }
      await file.preview({ title: item.name, mimeType: item.mime || undefined });
    } catch (error) {
      onOpenError(errorMessage(error));
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.centerBox}>
      <Ionicons name="document-text-outline" size={44} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.docName}>
        {item.name}
      </ThemedText>
      <ThemedText type="code" themeColor="textSecondary">
        {item.mime} · {formatBytes(item.size)}
      </ThemedText>
      <Pressable
        onPress={() => void open()}
        disabled={opening}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.openButton,
          pressed && styles.pressed,
          opening && styles.disabled,
        ]}>
        <Ionicons name="eye-outline" size={16} color="#ffffff" />
        <ThemedText type="small" style={styles.openButtonText}>
          {opening ? 'Opening…' : 'Open document'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function Header({
  title,
  onBack,
  onMore,
}: {
  title: string;
  onBack: () => void;
  onMore?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onBack}
        hitSlop={Spacing.two}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="chevron-back" size={20} color={theme.text} />
      </Pressable>
      <ThemedText type="smallBold" numberOfLines={1} style={styles.headerTitle}>
        {title}
      </ThemedText>
      {onMore ? (
        <Pressable
          onPress={onMore}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="File actions"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.text} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    textAlign: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  videoWrap: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  docName: {
    textAlign: 'center',
    fontWeight: 700,
    color: undefined,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: '#208AEF',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
    minHeight: 40,
  },
  openButtonText: {
    color: '#ffffff',
  },
  meta: {
    gap: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  errorText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  smallButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
