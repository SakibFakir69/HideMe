import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { AdBanner } from '@/components/vault/ad-banner';
import { ChangeCodeModal } from '@/components/vault/change-code-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { formatBytes } from '@/components/vault/format';
import { ThemedView } from '@/components/themed-view';
import { ListRow } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { PREMIUM_FALLBACK_PRICE } from '@/constants/premium';
import { Fonts, Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getActiveAppIcon, type DisguiseIcon } from '@/lib/app-icon';
import { clearMarks, formatMs, getMarks, type PerfMark } from '@/lib/perf';
import { usePremium } from '@/lib/premium';
import {
  REMINDER_TIME_LABEL,
  getRemindersEnabled,
  setRemindersEnabled,
  syncBinReminder,
} from '@/lib/reminders';
import {
  setThemePref,
  useThemePref,
  type ThemePref,
} from '@/lib/theme-pref';
import { getAutoLockSeconds, type AutoLockSeconds } from '@/lib/vault-autolock';
import { getMasterKey, lock } from '@/lib/vault-session';
import { isBiometricAvailable, isBiometricEnabled, setBiometricEnabled, PBKDF2_ROUNDS } from '@/lib/vault-secret';
import { computeStats, eraseAllContents, errorMessage } from '@/lib/vault-store';

/** Compact trailing value, board style: "1 minute". */
function shortAutoLock(seconds: AutoLockSeconds | null): string {
  if (seconds === null) return '…';
  if (seconds === 0) return 'Immediately';
  if (seconds < 60) return `${seconds} sec`;
  return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
}

const THEME_LABEL: Record<ThemePref, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const ICON_LABEL: Record<DisguiseIcon, string> = {
  calculator: 'Calculator',
  notes: 'Notes',
  photos: 'Photos',
  weather: 'Weather',
  music: 'Music',
  hidden: 'Hidden',
};

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function VaultSettingsScreen() {
  const theme = useTheme();
  const themePref = useThemePref();
  const premium = usePremium();
  const { index, refresh } = useVaultIndex();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [changingCode, setChangingCode] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [autoLock, setAutoLock] = useState<AutoLockSeconds | null>(null);
  const [themeSheet, setThemeSheet] = useState(false);
  const [remindersOn, setRemindersOn] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [appIcon, setAppIcon] = useState<DisguiseIcon>(() => getActiveAppIcon());
  const [perfMarks, setPerfMarks] = useState<PerfMark[]>(() => getMarks());

  useEffect(() => {
    let cancelled = false;
    Promise.all([isBiometricAvailable(), isBiometricEnabled(), getAutoLockSeconds(), getRemindersEnabled()]).then(
      ([available, enabled, autoLockSeconds, remindersEnabled]) => {
        if (!cancelled) {
          setBiometricAvailable(available);
          setBiometricOn(enabled);
          setAutoLock(autoLockSeconds);
          setRemindersOn(remindersEnabled);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = index ? computeStats(index) : null;
  const binCount = index
    ? index.items.filter((item) => item.deletedAt !== undefined).length
    : 0;

  // The auto-lock, icon and paywall screens can change these while Settings
  // stays mounted in the tab stack; refresh on focus so values never go stale.
  useFocusEffect(
    useCallback(() => {
      void getAutoLockSeconds().then(setAutoLock);
      void getRemindersEnabled().then(setRemindersOn);
      setAppIcon(getActiveAppIcon());
      setPerfMarks(getMarks());
    }, []),
  );

  const toggleReminders = useCallback(
    async (value: boolean) => {
      if (remindersBusy) return;
      setRemindersBusy(true);
      try {
        const applied = await setRemindersEnabled(value);
        if (value && !applied) {
          setRemindersOn(false);
          Alert.alert(
            'Notifications are off',
            'Allow notifications for this app in system settings, then turn the reminder on again.',
          );
          return;
        }
        setRemindersOn(value);
        // Enabling must take effect immediately, not on the next index change.
        await syncBinReminder(value ? binCount : 0);
      } finally {
        setRemindersBusy(false);
      }
    },
    [binCount, remindersBusy],
  );

  const toggleBiometric = useCallback(
    async (value: boolean) => {
      if (biometricBusy) return;
      setBiometricBusy(true);
      try {
        if (value) {
          const confirmation = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Confirm it is you',
            cancelLabel: 'Cancel',
          });
          if (!confirmation.success) return;
          await setBiometricEnabled(true, getMasterKey());
        } else {
          await setBiometricEnabled(false);
        }
        setBiometricOn(value);
      } catch (error) {
        Alert.alert('Biometric unlock', errorMessage(error));
      } finally {
        setBiometricBusy(false);
      }
    },
    [biometricBusy],
  );

  const onErase = useCallback(async () => {
    const ok = await confirmDestructive(
      'Erase all contents',
      'Every file and folder in the vault will be permanently deleted. Your secret code stays set.',
      'Erase',
    );
    if (!ok) return;
    setErasing(true);
    try {
      await eraseAllContents(getMasterKey());
      await refresh();
    } catch (error) {
      Alert.alert('Could not erase', errorMessage(error));
    } finally {
      setErasing(false);
    }
  }, [refresh]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="Settings" onBack={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PremiumCard active={premium.active} onPress={() => router.push('/vault/premium')} />

          <Group title="Security">
            <ListRow
              icon="key-outline"
              title="Change secret code"
              subtitle="Files stay encrypted under the same key"
              divider
              onPress={() => setChangingCode(true)}
            />
            <ListRow
              icon="finger-print-outline"
              title="Biometric unlock"
              subtitle={
                biometricAvailable
                  ? biometricOn
                    ? 'Enabled — Face ID / fingerprint'
                    : 'Unlock with Face ID or fingerprint'
                  : 'No biometric enrolled on this device'
              }
              divider
              right={
                biometricAvailable ? (
                  <Switch
                    value={biometricOn}
                    onValueChange={(next) => void toggleBiometric(next)}
                    disabled={biometricBusy}
                    trackColor={{ false: theme.backgroundSelected, true: Palette.primary }}
                    thumbColor="#FFFFFF"
                  />
                ) : undefined
              }
            />
            <ListRow
              icon="timer-outline"
              title="Auto-lock timer"
              subtitle="Countdown, policy and ad pause"
              value={shortAutoLock(autoLock)}
              divider
              onPress={() => router.push('/vault/auto-lock')}
            />
            <ListRow
              icon="lock-closed-outline"
              title="Lock now"
              subtitle="Clears the key and decrypted cache"
              onPress={() => {
                lock();
                router.replace('/calculator-disguise');
              }}
            />
          </Group>

          <Group title="Privacy & disguise">
            <ListRow
              icon="apps-outline"
              title="App icon"
              subtitle="What the launcher shows"
              value={ICON_LABEL[appIcon]}
              divider
              onPress={() => router.push('/vault/app-icon')}
            />
            <ListRow
              icon="notifications-outline"
              title="Cleanup reminders"
              subtitle={`Daily at ${REMINDER_TIME_LABEL}${
                binCount > 0 ? ` · ${binCount} in Recently Deleted` : ' · only when the bin has items'
              }`}
              right={
                <Switch
                  value={remindersOn}
                  onValueChange={(next) => void toggleReminders(next)}
                  disabled={remindersBusy}
                  trackColor={{ false: theme.backgroundSelected, true: Palette.primary }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </Group>

          <Group title="Appearance">
            <ListRow
              icon="contrast-outline"
              title="Theme"
              subtitle="Match the system or pick one"
              value={THEME_LABEL[themePref]}
              onPress={() => setThemeSheet(true)}
            />
          </Group>

          <Group title="Storage">
            {stats ? (
              <>
                <ListRow
                  icon="albums-outline"
                  title={`${stats.itemCount} file${stats.itemCount === 1 ? '' : 's'}`}
                  subtitle={`${stats.folderCount} folder${stats.folderCount === 1 ? '' : 's'}`}
                  divider
                />
                <ListRow
                  icon="pie-chart-outline"
                  title={formatBytes(stats.totalBytes)}
                  subtitle="Encrypted on this device"
                  divider
                />
              </>
            ) : (
              <ListRow icon="albums-outline" title="Loading…" subtitle="" divider />
            )}
            <ListRow
              icon="trash-outline"
              title="Erase all contents"
              subtitle="Delete every file and folder"
              destructive
              loading={erasing}
              disabled={erasing}
              onPress={() => void onErase()}
            />
          </Group>

          <Group title="Encryption">
            <ListRow
              icon="shield-checkmark-outline"
              title="AES-256-CTR + HMAC-SHA256"
              subtitle="Per-file keys, encrypt-then-MAC"
              divider
            />
            <ListRow
              icon="speedometer-outline"
              title={`PBKDF2-SHA256 · ${PBKDF2_ROUNDS.toLocaleString('en-US')} rounds`}
              subtitle="Native derivation on Android 8+ and iOS"
            />
          </Group>

          <Group title="Performance">
            {perfMarks.length === 0 ? (
              <ListRow icon="stopwatch-outline" title="No timings yet" subtitle="Unlock the vault to record some" divider />
            ) : (
              perfMarks.map((entry, index) => (
                <ListRow
                  key={`${entry.name}-${index}`}
                  icon="stopwatch-outline"
                  title={entry.name}
                  subtitle={formatMs(entry.at)}
                  divider={index < perfMarks.length - 1}
                />
              ))
            )}
            <ListRow
              icon="refresh-outline"
              title="Clear timings"
              subtitle="Start measuring again"
              onPress={() => {
                clearMarks();
                setPerfMarks([]);
              }}
            />
          </Group>

          <Group title="About">
            <ListRow
              icon="information-circle-outline"
              title="HideMe"
              subtitle="No account, no cloud — everything stays here"
              value={`v${APP_VERSION}`}
            />
          </Group>

          <AdBanner />
        </ScrollView>
      </SafeAreaView>

      <ChangeCodeModal visible={changingCode} onClose={() => setChangingCode(false)} />

      <ActionSheetModal
        visible={themeSheet}
        title="Theme"
        actions={(['system', 'light', 'dark'] satisfies ThemePref[]).map((pref) => ({
          label: THEME_LABEL[pref],
          icon: (
            <Ionicons
              name={themePref === pref ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={themePref === pref ? Palette.primary : theme.text}
            />
          ),
          onSelect: () => setThemePref(pref),
        }))}
        onClose={() => setThemeSheet(false)}
      />
    </ThemedView>
  );
}

/** Board-style card: the section label lives inside the rounded container. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.groupHeader}>
        <Text style={[styles.groupTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** Gold-on-indigo upgrade card (§ design board: "Keep your data safe"). */
function PremiumCard({ active, onPress }: { active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Premium is active' : 'Upgrade to Premium'}
      style={({ pressed }) => [styles.premiumWrap, pressed && styles.pressed]}>
      <LinearGradient
        colors={active ? ['#064E3B', '#065F46'] : ['#1E2A78', '#5B21B6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.premiumCard}>
        <View style={[styles.crownWrap, active && styles.crownWrapActive]}>
          <Ionicons
            name={active ? 'checkmark-circle' : 'ribbon'}
            size={22}
            color={active ? '#6EE7B7' : '#FBBF24'}
          />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.premiumEyebrow, active && styles.premiumEyebrowActive]}>
            {active ? 'Thank you for supporting HideMe' : `Keep your data safe · ${PREMIUM_FALLBACK_PRICE}`}
          </Text>
          <Text style={styles.premiumTitle}>{active ? 'Premium is active' : 'Upgrade to Premium'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.75)" />
      </LinearGradient>
    </Pressable>
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
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
  },
  group: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.two + Spacing.one,
  },
  groupHeader: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  groupTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  premiumWrap: {
    borderRadius: 18,
    marginBottom: Spacing.two + Spacing.one,
    shadowColor: '#6366F1',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.45)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  crownWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.16)',
  },
  crownWrapActive: {
    backgroundColor: 'rgba(110,231,183,0.16)',
  },
  premiumEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 0.2,
    color: '#FBBF24',
  },
  premiumEyebrowActive: {
    color: '#6EE7B7',
  },
  premiumTitle: {
    fontFamily: Fonts.sansBold,
    fontSize: 17,
    color: '#FFFFFF',
    marginTop: 1,
  },
  pressed: {
    opacity: 0.85,
  },
  flex: {
    flex: 1,
  },
});
