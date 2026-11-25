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

import { PremiumCard } from '@/components/settings/premium-card';
import { SettingsRow } from '@/components/settings/settings-row';
import { SettingsSection } from '@/components/settings/settings-section';
import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { AdBanner } from '@/components/vault/ad-banner';
import { ChangeCodeModal } from '@/components/vault/change-code-modal';
import { ConfirmTypedModal } from '@/components/vault/confirm-typed-modal';
import { DecoyPinModal } from '@/components/vault/decoy-pin-modal';
import { formatBytes } from '@/components/vault/format';
import { PREMIUM_FALLBACK_PRICE } from '@/constants/premium';
import { Fonts, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getActiveAppIcon, type DisguiseIcon } from '@/lib/app-icon';
import {
  captureCount,
  isArmed as isIntruderArmed,
  setArmed as setIntruderArmed,
  wipeAll as wipeIntruderCaptures,
} from '@/lib/intruder';
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
import { getMasterKey, lock, useVaultDecoy } from '@/lib/vault-session';
import {
  hasDecoySecret,
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  removeDecoySecret,
  PBKDF2_ROUNDS,
} from '@/lib/vault-secret';
import { computeStats, eraseAllContents, errorMessage, wipeScope } from '@/lib/vault-store';

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
  const palette = useVaultPalette();
  const themePref = useThemePref();
  const premium = usePremium();
  const decoySession = useVaultDecoy();
  const { index, refresh } = useVaultIndex();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [changingCode, setChangingCode] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [autoLock, setAutoLock] = useState<AutoLockSeconds | null>(null);
  const [themeSheet, setThemeSheet] = useState(false);
  const [remindersOn, setRemindersOn] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [appIcon, setAppIcon] = useState<DisguiseIcon>(() => getActiveAppIcon());
  const [intruderOn, setIntruderOn] = useState(false);
  const [intruderBusy, setIntruderBusy] = useState(false);
  const [intruderCount, setIntruderCount] = useState(0);
  const [decoySet, setDecoySet] = useState(false);
  const [decoyModalOpen, setDecoyModalOpen] = useState(false);
  const [decoyRemoveOpen, setDecoyRemoveOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      isBiometricAvailable(),
      isBiometricEnabled(),
      getAutoLockSeconds(),
      getRemindersEnabled(),
      isIntruderArmed(),
      hasDecoySecret(),
    ]).then(
      ([available, enabled, autoLockSeconds, remindersEnabled, armed, decoy]) => {
        if (!cancelled) {
          setBiometricAvailable(available);
          setBiometricOn(enabled);
          setAutoLock(autoLockSeconds);
          setRemindersOn(remindersEnabled);
          setIntruderOn(armed);
          void captureCount().then(setIntruderCount);
          setDecoySet(decoy);
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
      void isIntruderArmed().then(setIntruderOn);
      void captureCount().then(setIntruderCount);
      void hasDecoySecret().then(setDecoySet);
    }, []),
  );

  /** Free users cannot enable premium-only features; this funnels them to the paywall. */
  const requirePremium = useCallback(
    (title: string, body: string): boolean => {
      if (premium.active) return true;
      Alert.alert(title, body, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go Premium', onPress: () => router.push('/vault/premium') },
      ]);
      return false;
    },
    [premium.active],
  );

  const toggleIntruder = useCallback(
    async (value: boolean) => {
      if (intruderBusy) return;
      if (value && !requirePremium('Intruder selfies', 'Premium captures a photo of anyone who enters a wrong code.')) {
        return;
      }
      setIntruderBusy(true);
      try {
        if (value) {
          const applied = await setIntruderArmed(true);
          if (!applied) {
            Alert.alert(
              'Camera needed',
              'Allow camera access so a wrong code can be captured. Nothing is ever recorded while the vault stays yours.',
            );
            return;
          }
        } else {
          await setIntruderArmed(false);
        }
        setIntruderOn(value);
        void captureCount().then(setIntruderCount);
      } finally {
        setIntruderBusy(false);
      }
    },
    [intruderBusy, requirePremium],
  );

  const onDecoyRow = useCallback(() => {
    if (decoySession) {
      Alert.alert('Not available here', 'Unlock with your real code to manage the decoy code.');
      return;
    }
    if (!decoySet && !requirePremium('Decoy code', 'Premium gives the decoy code its own fake vault.')) {
      return;
    }
    if (decoySet) {
      setDecoyRemoveOpen(true);
    } else {
      setDecoyModalOpen(true);
    }
  }, [decoySession, decoySet, requirePremium]);

  const onRemoveDecoy = useCallback(async () => {
    try {
      await removeDecoySecret();
      wipeScope('decoy');
      setDecoySet(false);
    } catch (error) {
      Alert.alert('Could not remove the decoy', errorMessage(error));
    }
  }, []);

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
      // The slot always holds the REAL vault's master key. Writing a decoy key
      // here would make biometric unlock open the wrong scope (and deleting it
      // would silently disable the owner's unlock).
      if (decoySession) {
        Alert.alert(
          'Not available here',
          'Unlock with your real code to change biometric unlock.',
        );
        return;
      }
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
    [biometricBusy, decoySession],
  );

  const onErase = useCallback(async () => {
    setErasing(true);
    try {
      await eraseAllContents(getMasterKey());
      // Evidence of break-in attempts belongs to the real vault. A decoy
      // session must never be able to destroy it (that would also let an
      // intruder erase the photos of themselves).
      if (!decoySession) {
        await wipeIntruderCaptures();
        setIntruderOn(false);
        setIntruderCount(0);
      }
      await refresh();
    } catch (error) {
      Alert.alert('Could not erase', errorMessage(error));
    } finally {
      setErasing(false);
    }
  }, [decoySession, refresh]);

  const switchColors = {
    false: palette.isDark ? 'rgba(148,163,184,0.25)' : 'rgba(15,23,42,0.12)',
    true: palette.accent,
  } as const;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      {/* the light source in the top right corner */}
      <LinearGradient
        colors={[palette.glow, 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.1, y: 0.55 }}
        style={styles.topGlow}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: palette.surface },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="chevron-back" size={22} color={palette.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
            Settings
          </Text>
          <Ionicons
            name="shield-checkmark"
            size={22}
            color={palette.accent}
            style={styles.headerBadge}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <PremiumCard
            active={premium.active}
            price={PREMIUM_FALLBACK_PRICE}
            onPress={() => router.push('/vault/premium')}
          />

          <SettingsSection
            icon="shield-checkmark-outline"
            title="Security"
            subtitle="Enhance your privacy and security"
          />
          <Group>
            {/* These two rows act on the REAL secret record and the REAL
                biometric slot. In a decoy session they would both leak the
                decoy (the "current code" would be rejected) and let a snoop
                overwrite/replace the owner's biometric key — so they are not
                part of the decoy's settings. */}
            {!decoySession && (
              <SettingsRow
                icon="code-slash"
                tone="green"
                title="Change secret code"
                subtitle="Files stay encrypted under the same key"
                onPress={() => setChangingCode(true)}
              />
            )}
            {!decoySession && (
              <SettingsRow
                icon="finger-print-outline"
                tone="violet"
                title="Biometric unlock"
                subtitle={
                  biometricAvailable
                    ? biometricOn
                      ? 'Enabled — Face ID / fingerprint'
                      : 'Unlock with Face ID or fingerprint'
                    : 'No biometric enrolled on this device'
                }
                right={
                  biometricAvailable ? (
                    <Switch
                      value={biometricOn}
                      onValueChange={(next) => void toggleBiometric(next)}
                      disabled={biometricBusy}
                      trackColor={switchColors}
                      thumbColor="#FFFFFF"
                    />
                  ) : undefined
                }
              />
            )}
            <SettingsRow
              icon="timer-outline"
              tone="blue"
              title="Auto-lock timer"
              subtitle="Countdown, policy and ad preference"
              value={shortAutoLock(autoLock)}
              valueChevron
              onPress={() => router.push('/vault/auto-lock')}
            />
            {!decoySession && (
              <SettingsRow
                icon="camera-reverse-outline"
                tone="amber"
                title="Intruder selfies"
                subtitle={
                  intruderOn
                    ? `${intruderCount} capture${intruderCount === 1 ? '' : 's'} stored`
                    : 'Front-camera photo on a wrong code'
                }
                right={
                  <Switch
                    value={intruderOn}
                    onValueChange={(next) => void toggleIntruder(next)}
                    disabled={intruderBusy}
                    trackColor={switchColors}
                    thumbColor="#FFFFFF"
                  />
                }
              />
            )}
            {!decoySession && (intruderOn || intruderCount > 0) ? (
              <SettingsRow
                icon="images-outline"
                tone="violet"
                title="View intruder photos"
                subtitle="Captures after failed unlock attempts"
                valueChevron
                onPress={() => router.push('/vault/intruder')}
              />
            ) : null}
            {!decoySession && (
              <SettingsRow
                icon="swap-horizontal-outline"
                tone="violet"
                title="Decoy code"
                subtitle={
                  decoySet
                    ? 'On — a second code opens a fake vault'
                    : 'A second code opens an empty vault'
                }
                value={decoySet ? 'On' : 'Off'}
                valueChevron
                onPress={onDecoyRow}
              />
            )}
            <SettingsRow
              icon="lock-closed-outline"
              tone="amber"
              title="Lock now"
              subtitle="Clears the key and decrypted cache"
              onPress={() => {
                lock();
                router.replace('/calculator-disguise');
              }}
            />
          </Group>

          <SettingsSection
            icon="eye-outline"
            title="Privacy & Disguise"
            subtitle="Keep your vault hidden"
          />
          <Group>
            <SettingsRow
              icon="apps"
              tone="blue"
              title="App icon"
              subtitle="What the launcher shows"
              value={ICON_LABEL[appIcon]}
              valueChevron
              onPress={() => router.push('/vault/app-icon')}
            />
            <SettingsRow
              icon="notifications-outline"
              tone="violet"
              title="Cleanup reminders"
              subtitle={`Daily at ${REMINDER_TIME_LABEL}${
                binCount > 0 ? ` · ${binCount} in Recently Deleted` : ' · only when the bin has items'
              }`}
              right={
                <Switch
                  value={remindersOn}
                  onValueChange={(next) => void toggleReminders(next)}
                  disabled={remindersBusy}
                  trackColor={switchColors}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </Group>

          <SettingsSection
            icon="color-palette-outline"
            title="Appearance"
            subtitle="Personalize your experience"
          />
          <Group>
            <SettingsRow
              icon="contrast-outline"
              tone="slate"
              title="Theme"
              subtitle="Match the system or pick one"
              value={THEME_LABEL[themePref]}
              valueChevron
              onPress={() => setThemeSheet(true)}
            />
          </Group>

          <SettingsSection
            icon="albums-outline"
            title="Storage"
            subtitle="What the vault holds right now"
          />
          <Group>
            {decoySession ? null : (
              <SettingsRow
                icon="cloud-download-outline"
                tone="green"
                title="Encrypted backup"
                subtitle="Export a .hmb file · restore with your code"
                valueChevron
                onPress={() => router.push('/vault/backup')}
              />
            )}
            {stats ? (
              <>
                <SettingsRow
                  icon="albums-outline"
                  tone="blue"
                  title={`${stats.itemCount} file${stats.itemCount === 1 ? '' : 's'}`}
                  subtitle={`${stats.folderCount} folder${stats.folderCount === 1 ? '' : 's'}`}
                />
                <SettingsRow
                  icon="pie-chart-outline"
                  tone="violet"
                  title={formatBytes(stats.totalBytes)}
                  subtitle="Encrypted on this device"
                />
              </>
            ) : (
              <SettingsRow icon="albums-outline" tone="blue" title="Loading…" subtitle="" />
            )}
            <SettingsRow
              icon="trash-outline"
              tone="amber"
              title="Erase all contents"
              subtitle="Delete every file and folder"
              destructive
              disabled={erasing}
              onPress={() => setEraseOpen(true)}
            />
          </Group>

          <SettingsSection
            icon="lock-closed-outline"
            title="Encryption"
            subtitle="How your files are protected"
          />
          <Group>
            <SettingsRow
              icon="shield-checkmark-outline"
              tone="green"
              title="AES-256-CTR + HMAC-SHA256"
              subtitle="Per-file keys, encrypt-then-MAC"
            />
            <SettingsRow
              icon="speedometer-outline"
              tone="blue"
              title={`PBKDF2-SHA256 · ${PBKDF2_ROUNDS.toLocaleString('en-US')} rounds`}
              subtitle="Native derivation on Android 8+ and iOS"
            />
          </Group>

          <SettingsSection
            icon="information-circle-outline"
            title="About"
            subtitle="No account, no cloud — everything stays here"
          />
          <Group>
            <SettingsRow
              icon="information-circle-outline"
              tone="slate"
              title="HideMe"
              subtitle="Private vault behind a calculator"
              value={`v${APP_VERSION}`}
            />
          </Group>

          <AdBanner />
        </ScrollView>
      </SafeAreaView>

      <ChangeCodeModal visible={changingCode} onClose={() => setChangingCode(false)} />

      <DecoyPinModal
        visible={decoyModalOpen}
        onClose={() => {
          setDecoyModalOpen(false);
          // The setup runs while the tab stays focused, so the focus refresh
          // won't fire — re-read the flag so the row flips to "On" right away.
          void hasDecoySecret().then(setDecoySet);
        }}
      />

      <ConfirmTypedModal
        visible={decoyRemoveOpen}
        title="Remove decoy code"
        message="The decoy code stops working and the fake vault space is deleted. Your real vault is untouched."
        phrase="REMOVE"
        confirmLabel="Remove decoy"
        onConfirm={onRemoveDecoy}
        onClose={() => setDecoyRemoveOpen(false)}
      />

      <ConfirmTypedModal
        visible={eraseOpen}
        title="Erase all contents"
        message="Every file and folder in the vault will be permanently deleted. Your secret code stays set."
        phrase="ERASE"
        confirmLabel="Erase everything"
        onConfirm={onErase}
        onClose={() => setEraseOpen(false)}
      />

      <ActionSheetModal
        visible={themeSheet}
        title="Theme"
        actions={(['system', 'light', 'dark'] satisfies ThemePref[]).map((pref) => ({
          label: THEME_LABEL[pref],
          icon: (
            <Ionicons
              name={themePref === pref ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={themePref === pref ? palette.accent : palette.text}
            />
          ),
          onSelect: () => setThemePref(pref),
        }))}
        onClose={() => setThemeSheet(false)}
      />
    </View>
  );
}

/** The rows of one group: separate cards with a small gap between them. */
function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 260,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: Fonts.sansBold,
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  headerBadge: {
    width: 40,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.two + 2,
  },
  group: {
    gap: Spacing.two + 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
