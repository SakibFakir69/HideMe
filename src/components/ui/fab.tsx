import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet } from 'react-native';

import { VAULT_ACCENTS, type VaultAccent } from '@/constants/vault-theme';
import { Radius } from '@/constants/theme';

interface FabProps {
  onPress: () => void;
  label?: string;
  /** The accent of the screen the button sits on. */
  accent?: VaultAccent;
}

/** Primary action FAB — bottom-right, the screen accent with a glow. */
export function Fab({ onPress, label = 'Add', accent = 'emerald' }: FabProps) {
  const tone = VAULT_ACCENTS[accent];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={tone.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    shadowColor: '#10B981',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  gradient: {
    width: 60,
    height: 60,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
