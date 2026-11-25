import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImportProgressModal } from '@/components/vault/import-progress-modal';
import { Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { useVaultImport } from '@/hooks/use-vault-import';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { t } from '@/lib/i18n';

/** One import source: its gradient, its tile and what it opens. */
const SOURCES: {
  key: string;
  gradient: [string, string];
  icon: keyof typeof Ionicons.glyphMap;
  watermark: keyof typeof Ionicons.glyphMap;
  /** i18n keys for the card's title and subtitle */
  titleKey: string;
  subtitleKey: string;
  kind: 'media' | 'camera' | 'audio' | 'document' | 'other';
}[] = [
  {
    key: 'media',
    gradient: ['#7C3AED', '#8B5CF6'],
    icon: 'images',
    watermark: 'image',
    titleKey: 'import.media.title',
    subtitleKey: 'import.media.subtitle',
    kind: 'media',
  },
  {
    key: 'camera',
    gradient: ['#1D4ED8', '#3B82F6'],
    icon: 'camera',
    watermark: 'camera',
    titleKey: 'import.camera.title',
    subtitleKey: 'import.camera.subtitle',
    kind: 'camera',
  },
  {
    key: 'audio',
    gradient: ['#DB2777', '#EC4899'],
    icon: 'musical-notes',
    watermark: 'musical-notes',
    titleKey: 'import.audio.title',
    subtitleKey: 'import.audio.subtitle',
    kind: 'audio',
  },
  {
    key: 'document',
    gradient: ['#059669', '#10B981'],
    icon: 'document-text',
    watermark: 'document-text',
    titleKey: 'import.document.title',
    subtitleKey: 'import.document.subtitle',
    kind: 'document',
  },
  {
    key: 'other',
    gradient: ['#1E3A8A', '#3B82F6'],
    icon: 'folder-open',
    watermark: 'folder-open',
    titleKey: 'import.other.title',
    subtitleKey: 'import.other.subtitle',
    kind: 'other',
  },
];

export default function ImportScreen() {
  const palette = useVaultPalette();
  const { refresh } = useVaultIndex();
  const { busy, state, cancel, dismiss, importAssets } = useVaultImport(async (outcome) => {
    await refresh();
    // A cancelled import keeps the screen open so another source can be
    // picked; a finished one goes back to the vault.
    if (outcome.status === 'completed') router.back();
  });

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* the light source in the top right corner — the vault's signature */}
      <LinearGradient
        colors={[palette.glow, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.1, y: 0.55 }}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Five tall source cards do not fit a small phone: scroll instead of
            clipping the last one (and the encryption note) off-screen. */}
        <ScrollView
          contentContainerStyle={[styles.content, { maxWidth: MaxContentWidth }]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('import.back')}
              style={({ pressed }) => [
                styles.back,
                { backgroundColor: palette.surface },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="chevron-back" size={20} color={palette.text} />
            </Pressable>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: palette.text }]}>{t('import.title')}</Text>
              <View style={styles.subtitleRow}>
                <Text style={[styles.subtitle, { color: palette.textSecondary }]}>
                  {t('import.subtitle')}
                </Text>
                <Ionicons name="lock-closed" size={12} color={palette.textSecondary} />
              </View>
            </View>
            <View style={styles.backSpacer} />
          </View>

          <View style={styles.sources}>
            {SOURCES.map((source) => (
              <SourceCard
                key={source.key}
                source={source}
                disabled={busy}
                onPress={() => void importAssets(source.kind, null)}
              />
            ))}
          </View>

          <View
            style={[
              styles.note,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}>
            <View style={[styles.noteTile, { backgroundColor: palette.accentWash }]}>
              <Ionicons name="lock-closed" size={14} color={palette.accentBright} />
            </View>
            <Text style={[styles.noteText, { color: palette.textSecondary }]}>
              {t('import.note')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <ImportProgressModal state={state} onCancel={cancel} onDismiss={dismiss} />
    </View>
  );
}

/** One gradient source card with its watermark and chevron. */
function SourceCard({
  source,
  disabled,
  onPress,
}: {
  source: (typeof SOURCES)[number];
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${t(source.titleKey)} — ${t(source.subtitleKey)}`}
      style={({ pressed }) => [styles.cardWrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={source.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}>
        <Ionicons
          name={source.watermark}
          size={86}
          color="rgba(255,255,255,0.14)"
          style={styles.watermark}
        />
        <View style={styles.tile}>
          <Ionicons name={source.icon} size={24} color={source.gradient[0]} />
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{t(source.titleKey)}</Text>
          <Text style={styles.cardSubtitle}>{t(source.subtitleKey)}</Text>
        </View>
        <View style={styles.chevronCircle}>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 260,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: {
    width: 44,
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 24,
    lineHeight: 29,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 18,
  },
  sources: {
    gap: Spacing.two + 2,
  },
  cardWrap: {
    borderRadius: Radius.lg + 8,
  },
  card: {
    borderRadius: Radius.lg + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    minHeight: 88,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -12,
    bottom: -22,
  },
  tile: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 1,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontFamily: Fonts.sansBold,
    fontSize: 19,
    lineHeight: 24,
  },
  cardSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: Fonts.sans,
    fontSize: 13.5,
    lineHeight: 18,
  },
  chevronCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
  },
  noteTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
});
