import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheetModal } from '@/components/vault/action-sheet-modal';
import { AdBanner } from '@/components/vault/ad-banner';
import { ChangeCodeModal } from '@/components/vault/change-code-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { formatBytes } from '@/components/vault/format';
import { ThemedView } from '@/components/themed-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SectionTitle } from '@/components/ui/section-title';
import { ListRow } from '@/components/ui/list-row';
import { AUTO_LOCK_PAUSE_MS } from '@/constants/ads';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { showRewardedAd } from '@/lib/ads';
import {
  setThemePref,
  useThemePref,
  type ThemePref,
} from '@/lib/theme-pref';
import {
  AUTOLOCK_OPTIONS,
  getAutoLockOverrideUntil,
  getAutoLockSeconds,
  grantAutoLockPause,
  setAutoLockSeconds,
  type AutoLockSeconds,
} from '@/lib/vault-autolock';
import { getMasterKey, lock } from '@/lib/vault-session';
import { isBiometricAvailable, isBiometricEnabled, setBiometricEnabled, PBKDF2_ROUNDS } from '@/lib/vault-secret';
import { computeStats, eraseAllContents, errorMessage } from '@/lib/vault-store';

/** Long form for the picker sheet. */
function describeAutoLock(seconds: AutoLockSeconds): string {
  if (seconds === 0) return 'Immediately';
  if (seconds < 60) return `After ${seconds} seconds`;
  return `After ${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
}

/** Compact trailing value, board style: "1 minute". */
function shortAutoLock(seconds: AutoLockSeconds): string {
  if (seconds === 0) return 'Immediately';
  if (seconds < 60) return `${seconds} sec`;
  return `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
}

const THEME_LABEL: Record<ThemePref, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function VaultSettingsScreen() {
  const theme = useTheme();
  const themePref = useThemePref();
  const { index, refresh } = useVaultIndex();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [changingCode, setChangingCode] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [autoLock, setAutoLock] = useState<AutoLockSeconds | null>(null);
  const [autoLockSheet, setAutoLockSheet] = useState(false);
  const [themeSheet, setThemeSheet] = useState(false);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [pauseLabel, setPauseLabel] = useState<string | null>(null);

  const refreshPauseLabel = useCallback(() => {
    const until = getAutoLockOverrideUntil();
    if (until > Date.now()) {
      const at = new Date(until);
      setPauseLabel(
        `Active — resumes at ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`,
      );
    } else {
      setPauseLabel(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isBiometricAvailable(), isBiometricEnabled(), getAutoLockSeconds()]).then(
      ([available, enabled, autoLockSeconds]) => {
        if (!cancelled) {
          setBiometricAvailable(available);
          setBiometricOn(enabled);
          setAutoLock(autoLockSeconds);
          refreshPauseLabel();
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [refreshPauseLabel]);

  const stats = index ? computeStats(index) : null;

  const onWatchAd = useCallback(async () => {
    if (rewardBusy) return;
    setRewardBusy(true);
    try {
      const result = await showRewardedAd();
      if (result === 'earned') {
        const until = await grantAutoLockPause(AUTO_LOCK_PAUSE_MS);
        const at = new Date(until);
        setPauseLabel(
          `Active — resumes at ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`,
        );
        Alert.alert(
          'Auto-lock paused',
          'Timed auto-lock is off for the next hour. "Lock now" and the "Immediately" setting still lock the vault.',
        );
      } else if (result === 'closed') {
        Alert.alert('No reward', 'Watch the full ad to earn the auto-lock pause.');
      } else {
        Alert.alert('Ad not ready', 'The reward ad is still loading — try again in a few seconds.');
      }
    } finally {
      setRewardBusy(false);
    }
  }, [rewardBusy]);

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

        <ScrollView contentContainerStyle={styles.content}>
          <SectionTitle label="Security" />
          <Card>
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
                    trackColor={{ true: Palette.primary }}
                  />
                ) : undefined
              }
            />
            <ListRow
              icon="timer-outline"
              title="Auto-lock"
              value={autoLock !== null ? shortAutoLock(autoLock) : '…'}
              divider
              onPress={() => setAutoLockSheet(true)}
            />
            <ListRow
              icon="gift-outline"
              title="Pause auto-lock for 1 hour"
              subtitle={pauseLabel ?? 'Watch a short ad to earn it'}
              divider
              loading={rewardBusy}
              disabled={rewardBusy}
              onPress={() => void onWatchAd()}
            />
            <ListRow
              icon="lock-closed-outline"
              title="Lock now"
              subtitle="Clears the key and encrypted cache"
              onPress={() => {
                lock();
                router.replace('/calculator-disguise');
              }}
            />
          </Card>

          <SectionTitle label="Appearance" />
          <Card>
            <ListRow
              icon="contrast-outline"
              title="Theme"
              value={THEME_LABEL[themePref]}
              onPress={() => setThemeSheet(true)}
            />
          </Card>

          <SectionTitle label="Storage" />
          <Card>
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
                  subtitle="Total size of encrypted files"
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
          </Card>

          <SectionTitle label="Encryption" />
          <Card>
            <ListRow
              icon="shield-checkmark-outline"
              title="AES-256-CTR + HMAC-SHA256"
              subtitle="Per-file keys, encrypt-then-MAC"
              divider
            />
            <ListRow
              icon="speedometer-outline"
              title={`PBKDF2-SHA256 · ${PBKDF2_ROUNDS.toLocaleString('en-US')} rounds`}
              subtitle="Derives the key from your code"
            />
          </Card>

          <AdBanner />
        </ScrollView>
      </SafeAreaView>

      <ChangeCodeModal visible={changingCode} onClose={() => setChangingCode(false)} />

      <ActionSheetModal
        visible={autoLockSheet}
        title="Auto-lock"
        actions={AUTOLOCK_OPTIONS.map((option) => ({
          label: describeAutoLock(option),
          icon: (
            <Ionicons
              name={autoLock === option ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={autoLock === option ? Palette.primary : theme.text}
            />
          ),
          onSelect: async () => {
            setAutoLock(option);
            await setAutoLockSeconds(option);
          },
        }))}
        onClose={() => setAutoLockSheet(false)}
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

function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>;
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
    paddingBottom: Spacing.six,
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.three,
  },
});
