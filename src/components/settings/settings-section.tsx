import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';

interface SettingsSectionProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}

/**
 * Section header: the accent icon, the group name and one line that says
 * what the group is for.
 */
export function SettingsSection({ icon, title, subtitle }: SettingsSectionProps) {
  const palette = useVaultPalette();

  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={20} color={palette.accent} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        {subtitle !== undefined && subtitle.length > 0 && (
          <Text style={[styles.subtitle, { color: palette.textSecondary }]}>{subtitle}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    marginTop: Spacing.four,
    marginBottom: Spacing.three - 2,
    paddingHorizontal: Spacing.one,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 18,
    lineHeight: 23,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
