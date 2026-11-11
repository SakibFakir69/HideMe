import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradientButton } from '@/components/ui/gradient-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionTitle } from '@/components/ui/section-title';
import { RESTORE_DIAL_CODE } from '@/constants/premium';
import { Fonts, MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getActiveAppIcon,
  isAppIconNative,
  setActiveAppIcon,
  type DisguiseIcon,
} from '@/lib/app-icon';

interface DisguiseOption {
  id: Exclude<DisguiseIcon, 'hidden'>;
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const OPTIONS: DisguiseOption[] = [
  {
    id: 'calculator',
    label: 'Calculator',
    caption: 'The default disguise',
    icon: 'calculator-outline',
    color: '#6366F1',
  },
  {
    id: 'notes',
    label: 'Notes',
    caption: 'A plain notes app',
    icon: 'document-text-outline',
    color: '#F59E0B',
  },
  {
    id: 'photos',
    label: 'Photos',
    caption: 'A gallery app',
    icon: 'image-outline',
    color: '#2563EB',
  },
  {
    id: 'weather',
    label: 'Weather',
    caption: 'A forecast app',
    icon: 'partly-sunny-outline',
    color: '#0EA5E9',
  },
  {
    id: 'music',
    label: 'Music',
    caption: 'A player app',
    icon: 'musical-notes-outline',
    color: '#7C3AED',
  },
];

export default function AppIconScreen() {
  const theme = useTheme();
  const supported = isAppIconNative();
  const [active, setActive] = useState<DisguiseIcon>(() => getActiveAppIcon());
  const [busy, setBusy] = useState<DisguiseIcon | null>(null);

  const apply = (id: DisguiseIcon) => {
    if (!supported || busy !== null) return;
    setBusy(id);
    const ok = setActiveAppIcon(id);
    setBusy(null);
    if (!ok) {
      Alert.alert('Could not change the icon', 'This build does not expose the launcher aliases.');
      return;
    }
    setActive(id);
  };

  const confirmHide = () => {
    if (!supported || busy !== null) return;
    Alert.alert(
      'Hide the app icon?',
      'The app disappears from your home screen and app drawer. To bring it back, open the Phone app and dial the code below, then press call.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide icon',
          style: 'destructive',
          onPress: () => apply('hidden'),
        },
      ],
    );
  };

  const activeLabel = supported
    ? active === 'hidden'
      ? 'Hidden'
      : (OPTIONS.find((option) => option.id === active)?.label ?? 'Calculator')
    : 'Unavailable';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="App icon" onBack={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View
            style={[
              styles.hero,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={[styles.preview, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons
                name={!supported ? 'phone-portrait-outline' : active === 'hidden' ? 'eye-off-outline' : 'apps-outline'}
                size={34}
                color={active === 'hidden' && supported ? theme.textSecondary : Palette.primary}
              />
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold">
                {!supported
                  ? 'Native module required'
                  : active === 'hidden'
                    ? 'App icon hidden'
                    : `Visible as ${activeLabel}`}
              </ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.heroNote}>
                {!supported
                  ? 'This build cannot change its launcher icon.'
                  : active === 'hidden'
                    ? 'Restore it with the dial code below.'
                    : 'Change what people see on your home screen.'}
              </ThemedText>
            </View>
          </View>

          {!supported && (
            <View style={[styles.notice, { backgroundColor: 'rgba(245,158,11,0.14)' }]}>
              <Ionicons name="warning-outline" size={18} color={Palette.warning} />
              <ThemedText type="code" style={[styles.noticeText, { color: theme.text }]}>
                Icon switching needs the native module. Build a development client
                (`npx expo run:android`) — Expo Go cannot change its launcher icon.
              </ThemedText>
            </View>
          )}

          <SectionTitle label="Disguise" />
          <View style={styles.grid}>
            {OPTIONS.map((option) => {
              const selected = active === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => apply(option.id)}
                  disabled={!supported || busy !== null}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: selected ? option.color : theme.border,
                    },
                    pressed && styles.pressed,
                    (!supported || busy !== null) && styles.disabled,
                  ]}>
                  <View style={[styles.tileIcon, { backgroundColor: option.color }]}>
                    <Ionicons name={option.icon} size={26} color="#FFFFFF" />
                  </View>
                  <ThemedText type="smallBold" style={styles.tileLabel}>
                    {option.label}
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.tileCaption}>
                    {option.caption}
                  </ThemedText>
                  {selected && (
                    <View style={[styles.check, { backgroundColor: option.color }]}>
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          <SectionTitle label="Hiding" />
          <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                <Ionicons name="eye-off-outline" size={20} color={Palette.error} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Hide the app icon</ThemedText>
                <ThemedText type="code" themeColor="textSecondary" style={styles.cardNote}>
                  Removes the icon from the launcher. The app keeps working and stays installed.
                </ThemedText>
              </View>
            </View>

            {active === 'hidden' ? (
              <GradientButton
                label="Restore Calculator icon"
                onPress={() => apply('calculator')}
                disabled={!supported || busy !== null}
              />
            ) : (
              <GradientButton
                label="Hide app icon"
                variant="ghost"
                onPress={confirmHide}
                disabled={!supported || busy !== null}
              />
            )}
          </View>

          <View
            style={[
              styles.dialCard,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            <View style={styles.dialHeader}>
              <Ionicons name="keypad-outline" size={18} color={theme.tint} />
              <ThemedText type="smallBold">Restore code</ThemedText>
            </View>
            <Text style={[styles.dialCode, { color: theme.text }]} selectable>
              {RESTORE_DIAL_CODE}
            </Text>
            <ThemedText type="code" themeColor="textSecondary" style={styles.dialNote}>
              Dial this in the Phone app like a call and press call. It re-enables the Calculator
              icon without opening the app. Works on most Android phones; some carriers block
              secret codes.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  preview: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNote: {
    fontSize: 11,
    marginTop: 2,
  },
  notice: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  noticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  tileLabel: {
    fontSize: 13,
  },
  tileCaption: {
    fontSize: 10,
    lineHeight: 14,
  },
  check: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.55,
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardNote: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  dialCard: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  dialHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dialCode: {
    fontFamily: Fonts.mono,
    fontSize: 22,
    letterSpacing: 1.5,
  },
  dialNote: {
    fontSize: 11,
    lineHeight: 17,
  },
  flex: {
    flex: 1,
  },
});
