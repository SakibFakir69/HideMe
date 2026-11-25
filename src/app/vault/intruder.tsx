import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/gradient-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { bytesToBase64 } from '@/lib/crypto/envelope';
import {
  deleteCapture,
  listCaptures,
  readCapture,
  type IntruderEntry,
} from '@/lib/intruder';

/** Cell thumbnail; 720px-wide captures stay cheap to decode as data URIs. */
const THUMB_PX = 72;

function formatWhen(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dataUri(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${bytesToBase64(bytes)}`;
}

export default function IntruderScreen() {
  const palette = useVaultPalette();
  const [entries, setEntries] = useState<IntruderEntry[]>([]);
  const [preview, setPreview] = useState<{ id: string; uri: string } | null>(null);

  useEffect(() => {
    void listCaptures().then(setEntries);
  }, []);

  const openPreview = useCallback(async (entry: IntruderEntry) => {
    const bytes = await readCapture(entry);
    if (!bytes) {
      Alert.alert('Unavailable', 'This capture could not be decrypted.');
      return;
    }
    setPreview({ id: entry.id, uri: dataUri(bytes) });
  }, []);

  const remove = useCallback((id: string) => {
    Alert.alert('Delete capture', 'This photo will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteCapture(id);
              setPreview((current) => (current?.id === id ? null : current));
              setEntries(await listCaptures());
            } catch (error) {
              Alert.alert(
                'Could not delete',
                error instanceof Error ? error.message : 'Try again.',
              );
            }
          })();
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="Intruder selfies" onBack={() => router.back()} />
        </View>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="camera-reverse-outline"
              size={44}
              color={palette.textSecondary}
              style={styles.emptyIcon}
            />
            <ThemedText type="smallBold">No captures yet</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>
              When someone enters a wrong code at the gate, the front camera silently
              takes their photo — it appears here, encrypted.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <CaptureRow entry={item} onOpen={openPreview} onRemove={remove} />
            )}
          />
        )}
      </SafeAreaView>

      {preview && (
        <View style={styles.previewBackdrop}>
          <Pressable
            style={styles.previewImageWrap}
            onPress={() => setPreview(null)}
            accessibilityRole="button"
            accessibilityLabel="Close preview">
            <Image source={{ uri: preview.uri }} style={styles.previewImage} contentFit="contain" />
          </Pressable>
          <GradientButton
            label="Delete capture"
            variant="ghost"
            onPress={() => remove(preview.id)}
          />
        </View>
      )}
    </View>
  );
}

/**
 * One capture row. It decrypts its own thumbnail in an effect — not during
 * the list render — so scrolling stays cheap and a missing/corrupt capture
 * is attempted once instead of on every parent render.
 */
function CaptureRow({
  entry,
  onOpen,
  onRemove,
}: {
  entry: IntruderEntry;
  onOpen: (entry: IntruderEntry) => void;
  onRemove: (id: string) => void;
}) {
  const palette = useVaultPalette();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readCapture(entry).then((bytes) => {
      if (active && bytes) setUri(dataUri(bytes));
    });
    return () => {
      active = false;
    };
  }, [entry]);

  return (
    <View style={[styles.row, { backgroundColor: palette.surface }]}>
      <Pressable
        onPress={() => onOpen(entry)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Capture from ${formatWhen(entry.at)}`}
        style={({ pressed }) => [
          styles.thumb,
          { backgroundColor: palette.surfaceHigh },
          pressed && styles.pressed,
        ]}>
        {uri ? (
          <Image source={{ uri }} style={styles.thumbImage} accessibilityLabel={undefined} />
        ) : (
          <Ionicons name="image-outline" size={20} color={palette.textSecondary} />
        )}
      </Pressable>
      <View style={styles.meta}>
        <ThemedText type="smallBold">{formatWhen(entry.at)}</ThemedText>
        <ThemedText type="code" themeColor="textSecondary">
          Encrypted capture
        </ThemedText>
      </View>
      <Pressable
        onPress={() => onRemove(entry.id)}
        accessibilityRole="button"
        accessibilityLabel="Delete capture"
        hitSlop={8}
        style={styles.delete}>
        <Ionicons name="trash-outline" size={20} color={Palette.error} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.lg,
  },
  thumb: {
    width: THUMB_PX,
    height: THUMB_PX,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  delete: {
    padding: Spacing.two,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  emptyIcon: {
    marginBottom: Spacing.one,
  },
  emptyBody: {
    textAlign: 'center',
    lineHeight: 20,
  },
  previewBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  previewImageWrap: {
    width: '100%',
    height: '70%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
