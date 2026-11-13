import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface SkeletonGridProps {
  /** How many tiles a row holds. */
  columns: number;
  /** How many rows to draw. */
  rows?: number;
}

/**
 * Placeholder tiles for the moment before the index is loaded
 * (DESIGN.md §5.3 asks for skeletons instead of a spinner).
 *
 * The tiles breathe gently, so the screen looks alive while the vault is
 * still being read and decrypted.
 */
export function SkeletonGrid({ columns, rows = 3 }: SkeletonGridProps) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.75, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {Array.from({ length: columns }, (_, index) => (
            <Animated.View
              key={index}
              style={[
                styles.tile,
                { backgroundColor: theme.backgroundElement, opacity: pulse },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Radius.sm,
  },
});
