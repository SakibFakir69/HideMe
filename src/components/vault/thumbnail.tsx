import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/components/vault/format';
import { Fonts, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { getMasterKey } from '@/lib/vault-session';
import { loadThumb, type VaultItem } from '@/lib/vault-store';

interface ThumbnailProps {
  item: VaultItem;
  /** Square tile size. Ignored when `width`/`height` are given. */
  size: number;
  /** Explicit tile size, for grids that keep the real photo ratio. */
  width?: number;
  height?: number;
  /** Corner radius of the tile. */
  radius?: number;
}

/**
 * Grid thumbnail. Photos use the small encrypted thumb (decrypts in
 * milliseconds); items still warming from the legacy backfill path may
 * decrypt the full file once. Documents/videos render icons only.
 *
 * The tile is sized from the first frame and shows a dimmed placeholder
 * while the thumb decrypts, so the grid never flashes a spinner or shifts
 * the layout once the image arrives.
 */
export function Thumbnail({ item, size, width, height, radius = Spacing.two }: ThumbnailProps) {
  const palette = useVaultPalette();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const boxWidth = width ?? size;
  const boxHeight = height ?? size;

  useEffect(() => {
    if (item.kind !== 'photo') return;
    let cancelled = false;
    // No state reset here: the grid keys tiles by item id, so a different
    // item is a different component with fresh state.
    loadThumb(getMasterKey(), item)
      .then((file) => {
        if (!cancelled) setUri(file.uri);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  const duration = item.kind === 'video' ? formatDuration(item.durationMs) : null;

  return (
    <View
      style={[
        styles.box,
        styles.center,
        boxWidth > 0 && { width: boxWidth, height: boxHeight },
        { backgroundColor: palette.surface, borderRadius: radius },
      ]}>
      {item.kind === 'photo' &&
        (uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" transition={120} />
        ) : (
          <Ionicons
            name="image-outline"
            size={22}
            color={palette.textSecondary}
            style={failed ? undefined : styles.placeholder}
          />
        ))}
      {item.kind === 'video' && (
        <>
          <Ionicons name="play-circle" size={26} color={palette.textSecondary} />
          {duration && (
            <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
              <Text style={styles.durationText}>{duration}</Text>
            </View>
          )}
        </>
      )}
      {item.kind === 'document' && (
        <Ionicons name="document-text-outline" size={24} color={palette.textSecondary} />
      )}
      {item.kind === 'audio' && (
        <Ionicons name="musical-notes-outline" size={24} color={palette.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    opacity: 0.3,
  },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: Fonts.sansSemiBold,
  },
});
