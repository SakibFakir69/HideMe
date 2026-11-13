import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissToast, useToasts, type ToastTone } from '@/lib/toast';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';

const VISIBLE_MS = 3200;

const TONE_ICON: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  neutral: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  error: 'alert-circle-outline',
};

const TONE_COLOR: Record<ToastTone, string> = {
  neutral: Palette.primary,
  success: Palette.success,
  error: Palette.error,
};

/**
 * Renders the global toasts at the bottom of the screen.
 *
 * Mounted once in the vault layout so a message raised by a screen that is
 * already closed still reaches the user.
 */
export function ToastHost() {
  const toasts = useToasts();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 72 }]}>
      {toasts.map((toast) => (
        <ToastRow key={toast.id} id={toast.id} message={toast.message} tone={toast.tone} />
      ))}
    </View>
  );
}

function ToastRow({ id, message, tone }: { id: number; message: string; tone: ToastTone }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [offset] = useState(() => new Animated.Value(12));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(offset, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) dismissToast(id);
        },
      );
    }, VISIBLE_MS);

    return () => clearTimeout(timer);
  }, [id, offset, opacity]);

  return (
    <Animated.View
      style={[styles.toast, { opacity, transform: [{ translateY: offset }] }]}
      pointerEvents="none">
      <Ionicons name={TONE_ICON[tone]} size={18} color={TONE_COLOR[tone]} />
      <Text style={styles.message} numberOfLines={3}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.two,
    zIndex: 50,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: 420,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    backgroundColor: '#1E293B',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  message: {
    flex: 1,
    color: '#F8FAFC',
    fontFamily: Fonts.sansMedium,
    fontSize: 14,
    lineHeight: 19,
  },
});
