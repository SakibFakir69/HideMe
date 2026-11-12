import { Ionicons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import type { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheetModal, type SheetAction } from '@/components/vault/action-sheet-modal';
import { AudioPlayer } from '@/components/vault/audio-player';
import { confirmDestructive } from '@/components/vault/confirm';
import { formatBytes, formatDate, formatDuration } from '@/components/vault/format';
import { NamePromptModal } from '@/components/vault/name-prompt-modal';
import { ZoomableImage, type SwipeDirection } from '@/components/vault/zoomable-image';
import { Fonts, Palette, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { shareVaultFile } from '@/lib/share';
import { getBrowseList } from '@/lib/vault-browse';
import { getMasterKey } from '@/lib/vault-session';
import {
  decryptToCache,
  errorMessage,
  moveItemToBin,
  moveItemToFolder,
  renameItem,
  restoreItem,
} from '@/lib/vault-store';
import type { VaultItem } from '@/lib/vault-store';

type DecryptState =
  | { phase: 'working'; percent: number; pass: 'verify' | 'decrypt' }
  | { phase: 'ready'; file: File }
  | { phase: 'error'; message: string };

const KIND_LABEL: Record<VaultItem['kind'], string> = {
  photo: 'Photo',
  video: 'Video',
  document: 'Document',
  audio: 'Audio',
};

/** "Photo · 2.4 MB · 0:42 · 1080×1920 · 12 Oct 2026" — one line of facts. */
function describeItem(item: VaultItem): string {
  const parts: string[] = [KIND_LABEL[item.kind], formatBytes(item.size)];
  const duration = formatDuration(item.durationMs);
  if (duration) parts.push(duration);
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`);
  parts.push(formatDate(item.createdAt));
  return parts.join('   ·   ');
}

function documentIcon(mime: string): keyof typeof Ionicons.glyphMap {
  if (mime.includes('pdf')) return 'document-text-outline';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('compressed')) {
    return 'file-tray-full-outline';
  }
  if (mime.startsWith('audio/')) return 'musical-notes-outline';
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'grid-outline';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'easel-outline';
  return 'document-outline';
}

export default function ItemScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { index, loading, refresh } = useVaultIndex();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [chromeShown, setChromeShown] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const listRef = useRef<FlatList<VaultItem> | null>(null);

  /**
   * The pages the user can swipe through: the list the grid was showing when
   * they tapped this item. The id list lives in memory (see `vault-browse`),
   * so the route stays short.
   */
  const browsePages = useMemo(() => {
    if (!index) return [];
    const byId = new Map(index.items.map((it) => [it.id, it]));
    const pages: VaultItem[] = [];
    for (const browseId of getBrowseList()) {
      const item = byId.get(browseId);
      if (item && item.deletedAt === undefined) pages.push(item);
    }
    return pages;
  }, [index]);

  const pages = useMemo(() => {
    if (browsePages.length > 0) return browsePages;
    // Opened directly (deep link) — there is nothing to page through.
    const single = index?.items.find((it) => it.id === id);
    return single ? [single] : [];
  }, [browsePages, index, id]);

  const currentIndex = useMemo(() => {
    const at = pages.findIndex((it) => it.id === id);
    return at >= 0 ? at : 0;
  }, [pages, id]);

  // FlatList captures `onViewableItemsChanged` when the list is created, so
  // this only needs to stay correct for the lifetime of the list.
  const handleViewableItemsChanged = useCallback<
    NonNullable<FlatList<VaultItem>['props']['onViewableItemsChanged']>
  >(
    ({ viewableItems }) => {
      const index = viewableItems[0]?.index;
      if (index === undefined || index === null) return;
      const next = pages[index];
      // Update as soon as the next page becomes visible — a video that is
      // being swiped away must stop playing right away, not after the
      // momentum settles.
      if (next && next.id !== id) router.setParams({ id: next.id });
    },
    [pages, id],
  );

  const item = pages[currentIndex] ?? null;

  // While a video plays the chrome fades out; for photos it is tap-toggled.
  const chromeVisible = item?.kind === 'video' ? !videoPlaying : chromeShown;
  const chromeOpacity = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    Animated.timing(chromeOpacity, {
      toValue: chromeVisible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [chromeOpacity, chromeVisible]);

  // Tapping the photo toggles the overlay chrome. Stable identity so the
  // zoom gesture does not re-register on every render.
  const toggleChrome = useCallback(() => {
    setChromeShown((visible) => !visible);
  }, []);

  /**
   * Moves the pager to a page.
   *
   * The list cannot be swiped by touch — a gesture handler inside a list
   * takes the touch before the list can scroll — so the photo reports the
   * swipe and the list is moved here.
   */
  const goToPage = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= pages.length) return;
      const nextItem = pages[nextIndex];
      if (!nextItem) return;
      setChromeShown(true);
      setVideoPlaying(false);
      router.setParams({ id: nextItem.id });
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    },
    [pages],
  );

  const handleSwipe = useCallback(
    (direction: SwipeDirection) => {
      goToPage(currentIndex + (direction === 'next' ? 1 : -1));
    },
    [currentIndex, goToPage],
  );

  const onShare = useCallback(async () => {
    if (!item) return;
    try {
      // Already decrypted by the stage, so this resolves from the cache.
      const file = await decryptToCache(getMasterKey(), item);
      const result = await shareVaultFile(file, {
        name: item.name,
        ext: item.ext,
        mime: item.mime,
      });
      if (result === 'unavailable') {
        Alert.alert(
          'Sharing isn’t available',
          'This build can’t open the system share sheet. Update the app and try again.',
        );
      } else if (result === 'failed') {
        Alert.alert('Could not share', 'The file couldn’t be handed to another app.');
      }
    } catch (error) {
      Alert.alert('Could not share', errorMessage(error));
    }
  }, [item]);

  const onDelete = useCallback(async () => {
    if (!item) return;
    const ok = await confirmDestructive(
      'Move to bin',
      `"${item.name}" will be kept in Recently deleted for 30 days, then deleted permanently.`,
    );
    if (!ok) return;
    const { id: deletedId, name: deletedName } = item;
    try {
      await moveItemToBin(getMasterKey(), deletedId);
      router.back();
      Alert.alert('Moved to bin', `"${deletedName}" will be permanently deleted in 30 days.`, [
        {
          text: 'Undo',
          onPress: () => {
            restoreItem(getMasterKey(), deletedId).catch((error) =>
              Alert.alert('Could not restore', errorMessage(error)),
            );
          },
        },
        { text: 'OK', style: 'cancel' },
      ]);
    } catch (error) {
      Alert.alert('Could not delete', errorMessage(error));
    }
  }, [item]);

  if (!loading && !item) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.missingHeader, { paddingTop: insets.top + Spacing.two }]}>
          <RoundButton icon="chevron-back" label="Back" onPress={() => router.back()} />
        </View>
        <View style={styles.centerFill}>
          <View style={styles.iconBadge}>
            <Ionicons name="document-outline" size={28} color="rgba(255,255,255,0.75)" />
          </View>
          <Text style={styles.stateTitle}>This file no longer exists</Text>
          <Text style={styles.stateMessage}>It may have been deleted or purged from the bin.</Text>
        </View>
      </View>
    );
  }

  const menuActions: SheetAction[] = [
    ...(item
      ? [
          {
            label: 'Share',
            icon: <Ionicons name="share-outline" size={18} color={theme.text} />,
            onSelect: () => void onShare(),
          },
        ]
      : []),
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
      label: 'Move to bin',
      destructive: true,
      icon: <Ionicons name="trash-outline" size={18} color="#EF4444" />,
      onSelect: () => void onDelete(),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.stage}>
        {pages.length === 0 ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color="rgba(255,255,255,0.6)" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            horizontal
            pagingEnabled
            // The photo reports the swipe and the list is moved here, so the
            // list must not scroll on its own: a scroll would interrupt the
            // gesture before it saw the whole drag.
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            data={pages}
            keyExtractor={(entry) => entry.id}
            extraData={currentIndex}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            initialScrollIndex={currentIndex}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={5}
            onViewableItemsChanged={handleViewableItemsChanged}
            onMomentumScrollEnd={(event) => {
              const next = Math.round(event.nativeEvent.contentOffset.x / width);
              const nextItem = pages[next];
              if (nextItem && nextItem.id !== id) {
                setChromeShown(true);
                setVideoPlaying(false);
                router.setParams({ id: nextItem.id });
              }
            }}
            renderItem={({ item: page, index: pageIndex }) => (
              <View style={{ width }}>
                <ViewerStage
                  item={page}
                  isActive={pageIndex === currentIndex}
                  onTapToggle={toggleChrome}
                  onSwipe={handleSwipe}
                  onVideoPlayingChange={setVideoPlaying}
                />
              </View>
            )}
          />
        )}
      </View>

      <Animated.View
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
        style={[StyleSheet.absoluteFill, { opacity: chromeOpacity }]}>
        <LinearGradient
          colors={['rgba(0,0,0,0.92)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']}
          locations={[0, 0.58, 1]}
          style={[styles.topScrim, { paddingTop: insets.top + Spacing.two }]}>
          <View style={styles.headerRow}>
            <RoundButton icon="chevron-back" label="Back" onPress={() => router.back()} />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {item?.name ?? 'File'}
              </Text>
              {item ? (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {describeItem(item)}
                  {pages.length > 1 ? `   ·   ${currentIndex + 1}/${pages.length}` : ''}
                </Text>
              ) : null}
            </View>
            {item ? (
              <RoundButton
                icon="ellipsis-horizontal"
                label="File actions"
                onPress={() => setMenuOpen(true)}
              />
            ) : (
              <View style={styles.roundButton} />
            )}
          </View>
        </LinearGradient>
      </Animated.View>

      <ActionSheetModal
        visible={menuOpen}
        title={item?.name}
        actions={menuActions}
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
    </View>
  );
}

/**
 * One page of the viewer: decrypts the item and renders its stage. Each page
 * owns its state, so swiping away and back re-reads the cached plaintext
 * instead of keeping every file decrypted in memory.
 */
function ViewerStage({
  item,
  isActive,
  onTapToggle,
  onSwipe,
  onVideoPlayingChange,
}: {
  item: VaultItem;
  isActive: boolean;
  onTapToggle: () => void;
  onSwipe: (direction: SwipeDirection) => void;
  onVideoPlayingChange: (playing: boolean) => void;
}) {
  const [decrypt, setDecrypt] = useState<DecryptState>({
    phase: 'working',
    percent: 0,
    pass: 'verify',
  });
  const [attempt, setAttempt] = useState(0);
  const percentRef = useRef(0);
  const lastPassRef = useRef<'verify' | 'decrypt'>('verify');

  useEffect(() => {
    let cancelled = false;
    percentRef.current = 0;
    lastPassRef.current = 'verify';
    decryptToCache(getMasterKey(), item, ({ processed, total }) => {
      if (cancelled || total <= 0) return;
      const next = Math.floor((processed / total) * 100);
      const pass: 'verify' | 'decrypt' = processed < total / 2 ? 'verify' : 'decrypt';
      if (next !== percentRef.current || pass !== lastPassRef.current) {
        percentRef.current = next;
        lastPassRef.current = pass;
        setDecrypt({ phase: 'working', percent: next, pass });
      }
    })
      .then((file) => {
        if (!cancelled) setDecrypt({ phase: 'ready', file });
      })
      .catch((error) => {
        if (!cancelled) setDecrypt({ phase: 'error', message: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [item, attempt]);

  const onRetry = useCallback(() => {
    percentRef.current = 0;
    lastPassRef.current = 'verify';
    setDecrypt({ phase: 'working', percent: 0, pass: 'verify' });
    setAttempt((value) => value + 1);
  }, []);

  let stage: ReactNode;
  if (decrypt.phase === 'working') {
    stage = <DecryptProgress percent={decrypt.percent} pass={decrypt.pass} name={item.name} />;
  } else if (decrypt.phase === 'error') {
    stage = (
      <ErrorState
        message={decrypt.message}
        onRetry={onRetry}
        onBack={() => router.back()}
        retryable
      />
    );
  } else if (item.kind === 'photo') {
    stage = (
      <ZoomableImage
        key={item.id}
        uri={decrypt.file.uri}
        onTap={onTapToggle}
        onSwipe={onSwipe}
        accessibilityLabel={`${item.name}. Tap to hide or show the controls, double tap to zoom.`}
      />
    );
  } else if (item.kind === 'video') {
    stage = (
      <VideoPlayerView
        key={item.id}
        uri={decrypt.file.uri}
        isActive={isActive}
        onPlayingChange={onVideoPlayingChange}
      />
    );
  } else if (item.kind === 'audio') {
    stage = (
      <AudioPlayer key={item.id} uri={decrypt.file.uri} name={item.name} isActive={isActive} />
    );
  } else {
    stage = (
      <DocumentView
        item={item}
        file={decrypt.file}
        onOpenError={(message) => Alert.alert('Could not open document', message)}
      />
    );
  }

  return <View style={styles.stage}>{stage}</View>;
}

/** Decryption is the first thing you see, so it gets the whole stage. */
function DecryptProgress({
  percent,
  pass,
  name,
}: {
  percent: number;
  pass: 'verify' | 'decrypt';
  name: string;
}) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.percent}>{percent}%</Text>
      <Text style={styles.progressLabel}>
        {percent === 0
          ? 'Preparing…'
          : pass === 'verify'
            ? 'Verifying integrity'
            : 'Decrypting'}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(3, percent)}%` }]} />
      </View>
      <Text style={styles.progressName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
  onBack,
  retryable,
}: {
  message: string;
  onRetry?: () => void;
  onBack: () => void;
  retryable?: boolean;
}) {
  return (
    <View style={styles.centerFill}>
      <View style={[styles.iconBadge, styles.iconBadgeDanger]}>
        <Ionicons name="alert-circle-outline" size={28} color="#FCA5A5" />
      </View>
      <Text style={styles.stateTitle}>Couldn’t open this file</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      <View style={styles.stateActions}>
        {retryable && onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Ionicons name="refresh" size={15} color="#FFFFFF" />
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}>
          <Text style={styles.ghostText}>Go back</Text>
        </Pressable>
      </View>
    </View>
  );
}

function VideoPlayerView({
  uri,
  isActive,
  onPlayingChange,
}: {
  uri: string;
  isActive: boolean;
  onPlayingChange: (playing: boolean) => void;
}) {
  // Deliberately no autoplay: opening a file should never start playing sound.
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer({ uri });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  // Lets the parent fade its chrome out while the video is playing and bring
  // it back on pause/end, so the overlay never fights the native controls.
  useEventListener(player, 'playingChange', ({ isPlaying }) => onPlayingChange(isPlaying));

  // A video that is not the current page must not keep playing in the
  // background while the user swipes through the gallery.
  useEffect(() => {
    if (!isActive) {
      player.pause();
      onPlayingChange(false);
    }
  }, [isActive, onPlayingChange, player]);

  const failed = status === 'error';
  const buffering = started && (status === 'loading' || status === 'idle');

  const start = () => {
    setStarted(true);
    player.play();
  };

  const retry = () => {
    setStarted(false);
    void player.replaceAsync({ uri });
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={started}
        fullscreenOptions={{ enable: true }}
        // TextureView lets our play overlay sit on top of the video surface.
        surfaceType="textureView"
      />

      {failed ? (
        <View style={[StyleSheet.absoluteFill, styles.stageOverlay]}>
          <View style={styles.iconBadge}>
            <Ionicons name="videocam-off-outline" size={26} color="rgba(255,255,255,0.75)" />
          </View>
          <Text style={styles.stateTitle}>This video can’t be played</Text>
          <Text style={styles.stateMessage}>
            The file may use a format this device doesn’t support.
          </Text>
          <View style={styles.stateActions}>
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Ionicons name="refresh" size={15} color="#FFFFFF" />
              <Text style={styles.primaryText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      ) : started ? (
        buffering ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.buffering]}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null
      ) : (
        <Pressable
          onPress={start}
          accessibilityRole="button"
          accessibilityLabel="Play video"
          style={({ pressed }) => [
            StyleSheet.absoluteFill,
            styles.stageOverlay,
            styles.playOverlay,
            pressed && styles.pressed,
          ]}>
          <View style={styles.playButton}>
            <Ionicons name="play" size={30} color="#FFFFFF" style={styles.playIcon} />
          </View>
          <Text style={styles.playHint}>Tap to play</Text>
        </Pressable>
      )}
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
    <View style={styles.centerFill}>
      <View style={styles.docCard}>
        <LinearGradient
          colors={['#6366F1', '#8B5CF6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.docIcon}>
          <Ionicons name={documentIcon(item.mime)} size={30} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.docKind}>
          {item.ext ? `${item.ext.toUpperCase()} file` : 'Document'}
        </Text>
        <Text style={styles.docMeta}>
          {formatBytes(item.size)} · {formatDate(item.createdAt)}
        </Text>
        <Pressable
          onPress={() => void open()}
          disabled={opening}
          accessibilityRole="button"
          accessibilityLabel="Open document"
          style={({ pressed }) => [
            styles.primaryButton,
            styles.openButton,
            pressed && styles.pressed,
            opening && styles.disabled,
          ]}>
          {opening ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="open-outline" size={16} color="#FFFFFF" />
          )}
          <Text style={styles.primaryText}>{opening ? 'Opening…' : 'Open document'}</Text>
        </Pressable>
        <Text style={styles.docHint}>
          Opens in another app · the file stays encrypted inside HideMe
        </Text>
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={Spacing.two}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
      <Ionicons name={icon} size={20} color="#FFFFFF" />
    </Pressable>
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
          color={item.folderId === null ? Palette.primary : theme.text}
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
          color={item.folderId === folder.id ? Palette.primary : theme.text}
        />
      ),
      onSelect: async () => {
        await moveItemToFolder(getMasterKey(), item.id, folder.id);
        await onChanged();
      },
    })),
  ];

  return (
    <ActionSheetModal visible={visible} title="Move to folder" actions={actions} onClose={onClose} />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  stage: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  stageOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: Spacing.four,
  },
  buffering: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // chrome
  topScrim: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.sans,
    fontSize: 12,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  missingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },

  // decrypt progress
  percent: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansBold,
    fontSize: 34,
    letterSpacing: -0.5,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },
  progressTrack: {
    width: 200,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginTop: Spacing.two,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#818CF8',
  },
  progressName: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: Fonts.mono,
    fontSize: 12,
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.five,
    textAlign: 'center',
  },

  // shared empty/error state
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: Spacing.one,
  },
  iconBadgeDanger: {
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderColor: 'rgba(239,68,68,0.35)',
  },
  stateTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  stateMessage: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 300,
  },
  stateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: Spacing.four,
    borderRadius: 21,
    backgroundColor: Palette.primary,
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemiBold,
    fontSize: 13,
  },
  ghostButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: Spacing.four,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  ghostText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
  },

  // video
  playOverlay: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    gap: Spacing.three,
  },
  playButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  playIcon: {
    marginLeft: 4,
  },
  playHint: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: Fonts.sansMedium,
    fontSize: 13,
    letterSpacing: 0.2,
  },

  // document
  docCard: {
    width: '86%',
    maxWidth: 340,
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  docIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  docKind: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
  },
  docMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: Fonts.sans,
    fontSize: 12,
    marginTop: 2,
  },
  openButton: {
    marginTop: Spacing.four,
    minWidth: 190,
    minHeight: 44,
    borderRadius: 22,
  },
  docHint: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: Spacing.three,
  },

  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
