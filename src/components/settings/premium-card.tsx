import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { PREMIUM_ORIGINAL_PRICE } from '@/constants/premium';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface PremiumCardProps {
  active: boolean;
  /** Fallback price when the store has not answered yet. */
  price?: string;
  onPress: () => void;
}

/** Concentric rings — the cheapest way to fake a soft glow without a blur. */
const GLOW_RINGS = [136, 122, 108, 96, 84, 74];

/**
 * The upgrade card at the top of the settings screen: a dark emerald slab
 * with the glowing shield badge on the left and the call to action on the
 * right.
 */
export function PremiumCard({ active, price, onPress }: PremiumCardProps) {
  const palette = useVaultPalette();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Premium is active' : 'Unlock Premium'}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={['#0C2B21', '#071A16']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        {/* the light source on the right of the card */}
        <LinearGradient
          colors={['transparent', 'rgba(34,197,94,0.22)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.badge}>
          {GLOW_RINGS.map((ring) => (
            <View
              key={ring}
              style={[styles.glowRing, { width: ring, height: ring, borderRadius: ring / 2 }]}
            />
          ))}
          <Ionicons
            name={active ? 'shield-checkmark' : 'shield-outline'}
            size={54}
            color={palette.accentBright}
          />
          <Ionicons
            name={active ? 'checkmark' : 'lock-closed'}
            size={18}
            color={palette.accentBright}
            style={styles.badgeMark}
          />
        </View>

        <View style={styles.text}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {active
              ? 'Thank you for supporting HideMe'
              : `Today ${price ?? ''} · was ${PREMIUM_ORIGINAL_PRICE}`}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {active ? 'Premium is active' : 'Unlock Premium'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {active ? 'Every premium feature is unlocked' : '👑 Unlock all features • Remove ads'}
          </Text>
        </View>

        <View style={styles.cta}>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  badge: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    backgroundColor: 'rgba(34,197,94,0.035)',
  },
  badgeMark: {
    position: 'absolute',
    top: 27,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(214,255,231,0.78)',
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 19,
    lineHeight: 25,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(214,255,231,0.72)',
  },
  cta: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pressed: {
    opacity: 0.85,
  },
});
