import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/components/vault/format';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getMasterKey } from '@/lib/vault-session';
import { decryptToCache, hasCachedPlain, plainFileFor, type VaultItem } from '@/lib/vault-store';

interface ThumbnailProps {
  item: VaultItem;
  size: number;
}

/**
 * Grid thumbnail. Photos are decrypted into the session cache on demand
 * (and only then — videos/documents never decrypt for the grid).
 */
export function Thumbnail({ item, size }: ThumbnailProps) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(() =>
    item.kind === 'photo' && hasCachedPlain(item) ? plainFileFor(item).uri : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (item.kind !== 'photo' || uri) return;
    let cancelled = false;
    decryptToCache(getMasterKey(), item)
      .then((file) => {
        if (!cancelled) setUri(file.uri);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.kind, uri]);

  const duration = item.kind === 'video' ? formatDuration(item.durationMs) : null;

  return (
    <View
      style={[
        styles.box,
        styles.center,
        size > 0 && { width: size, height: size },
        { backgroundColor: theme.backgroundElement },
      ]}>
      {item.kind === 'photo' &&
        (uri ? (
          <Image source={{ uri }} style={styles.image} contentFit="cover" transition={120} />
        ) : failed ? (
          <Ionicons name="image-outline" size={22} color={theme.textSecondary} />
        ) : (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ))}
      {item.kind === 'video' && (
        <View style={styles.center}>
          <Ionicons name="play-circle" size={26} color={theme.textSecondary} />
          {duration && (
            <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.65)' }]}>
              <Text style={styles.durationText}>{duration}</Text>
            </View>
          )}
        </View>
      )}
      {item.kind === 'document' && (
        <Ionicons name="document-text-outline" size={24} color={theme.textSecondary} />
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
  badge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  durationText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 600,
  },
});
