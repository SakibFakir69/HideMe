import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Fonts, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search' }: SearchBarProps) {
  const palette = useVaultPalette();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}>
      <Ionicons name="search" size={17} color={palette.textSecondary} />
      <TextInput
        style={[styles.input, { color: palette.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.textSecondary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        blurOnSubmit={false}
        clearButtonMode="never"
        selectionColor={palette.accent}
        underlineColorAndroid="transparent"
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={Spacing.two}
          accessibilityRole="button"
          accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={17} color={palette.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    height: 48,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.sansMedium,
    fontSize: 15,
    padding: 0,
    paddingVertical: 0,
  },
});
