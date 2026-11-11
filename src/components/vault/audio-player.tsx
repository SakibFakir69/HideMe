import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Palette, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface AudioPlayerProps {
  uri: string;
  name: string;
  /** False when the viewer is showing another page — playback pauses. */
  isActive: boolean;
}

/** Seconds as `m:ss`, or `h:mm:ss` for long recordings. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/**
 * Audio playback for decrypted audio files.
 *
 * The file is decrypted into the session cache first, so the player only ever
 * reads the plaintext copy. Playback never starts on its own — the user
 * taps play, like everywhere else in this app.
 */
export function AudioPlayer({ uri, name, isActive }: AudioPlayerProps) {
  const theme = useTheme();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  // Media apps are expected to be heard even with the ringer on silent.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  }, []);

  useEffect(() => {
    if (!isActive) player.pause();
  }, [isActive, player]);

  const playing = status.playing;
  const duration = status.duration > 0 ? status.duration : 0;
  const position = Math.min(status.currentTime, duration || status.currentTime);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  const toggle = () => {
    if (playing) player.pause();
    else player.play();
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        <View style={[styles.artwork, { backgroundColor: 'rgba(236,72,153,0.16)' }]}>
          <Ionicons name="musical-notes" size={34} color="#EC4899" />
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>

        <View style={styles.track}>
          <View style={styles.trackFillTrack}>
            <View style={[styles.trackFill, { width: `${Math.max(1, progress * 100)}%` }]} />
          </View>
          <View style={styles.times}>
            <Text style={styles.time}>{formatTime(position)}</Text>
            <Text style={styles.time}>{duration > 0 ? formatTime(duration) : '--:--'}</Text>
          </View>
        </View>

        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}>
          <Ionicons name={playing ? 'pause' : 'play'} size={28} color="#FFFFFF" style={styles.playIcon} />
        </Pressable>

        <Text style={styles.hint}>
          {status.isLoaded ? 'Plays from the decrypted copy · stays on this device' : 'Loading…'}
        </Text>
      </View>
      <Text style={[styles.notice, { color: theme.textSecondary }]}>
        Audio files are decrypted on demand and never leave this device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  card: {
    width: '88%',
    maxWidth: 360,
    alignItems: 'center',
    padding: Spacing.four,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  artwork: {
    width: 92,
    height: 92,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  name: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansSemiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  track: {
    alignSelf: 'stretch',
    marginTop: Spacing.four,
    gap: 6,
  },
  trackFillTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Palette.primary,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.primary,
    marginTop: Spacing.four,
  },
  playIcon: {
    marginLeft: 3,
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: Fonts.sans,
    fontSize: 11,
    marginTop: Spacing.three,
    textAlign: 'center',
  },
  notice: {
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 300,
  },
  pressed: {
    opacity: 0.75,
  },
});
