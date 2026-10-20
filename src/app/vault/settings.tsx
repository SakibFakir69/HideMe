import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChangeCodeModal } from '@/components/vault/change-code-modal';
import { confirmDestructive } from '@/components/vault/confirm';
import { formatBytes } from '@/components/vault/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useVaultIndex } from '@/hooks/use-vault-index';
import { getMasterKey, lock } from '@/lib/vault-session';
import { isBiometricAvailable, isBiometricEnabled, setBiometricEnabled } from '@/lib/vault-secret';
import { computeStats, eraseAllContents, errorMessage } from '@/lib/vault-store';

export default function VaultSettingsScreen() {
  const theme = useTheme();
  const { index, refresh } = useVaultIndex();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [changingCode, setChangingCode] = useState(false);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([isBiometricAvailable(), isBiometricEnabled()]).then(([available, enabled]) => {
      if (!cancelled) {
        setBiometricAvailable(available);
        setBiometricOn(enabled);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = index ? computeStats(index) : null;

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
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={Spacing.two}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold" style={styles.headerTitle}>
            Settings
          </ThemedText>
          <View style={styles.iconButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Section label="SECURITY">
            <Row
              icon="key-outline"
              title="Change secret code"
              subtitle="Files stay encrypted under the same key"
              onPress={() => setChangingCode(true)}
            />
            <Row
              icon="finger-print-outline"
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
                    trackColor={{ true: '#208AEF' }}
                  />
                ) : undefined
              }
            />
            <Row
              icon="lock-closed-outline"
              title="Lock now"
              subtitle="Clears the key and encrypted cache"
              onPress={() => {
                lock();
                router.replace('/calculator-disguise');
              }}
            />
          </Section>

          <Section label="STORAGE">
            {stats ? (
              <>
                <Row
                  icon="albums-outline"
                  title={`${stats.itemCount} file${stats.itemCount === 1 ? '' : 's'}`}
                  subtitle={`${stats.folderCount} folder${stats.folderCount === 1 ? '' : 's'}`}
                />
                <Row
                  icon="pie-chart-outline"
                  title={formatBytes(stats.totalBytes)}
                  subtitle="Total size of encrypted files"
                />
              </>
            ) : (
              <Row icon="albums-outline" title="Loading…" subtitle="" />
            )}
            <Row
              icon="trash-outline"
              title="Erase all contents"
              subtitle="Delete every file and folder"
              destructive
              disabled={erasing}
              right={erasing ? <ActivityIndicator size="small" color="#D9342B" /> : undefined}
              onPress={() => void onErase()}
            />
          </Section>

          <Section label="ENCRYPTION">
            <Row
              icon="shield-checkmark-outline"
              title="AES-256-CTR + HMAC-SHA256"
              subtitle="Per-file keys, encrypt-then-MAC"
            />
            <Row
              icon="speedometer-outline"
              title="PBKDF2-SHA256 · 600,000 rounds"
              subtitle="Derives the key from your code"
            />
          </Section>
        </ScrollView>
      </SafeAreaView>

      <ChangeCodeModal visible={changingCode} onClose={() => setChangingCode(false)} />
    </ThemedView>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
        {label}
      </ThemedText>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  title,
  subtitle,
  onPress,
  right,
  destructive,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const body = (
    <View style={styles.rowInner}>
      <Ionicons name={icon} size={18} color={destructive ? '#D9342B' : theme.text} />
      <View style={styles.rowText}>
        <ThemedText type="small" style={destructive ? styles.destructiveText : undefined}>
          {title}
        </ThemedText>
        {subtitle !== undefined && subtitle.length > 0 && (
          <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        )}
      </View>
      {right}
      {onPress && !right && <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />}
    </View>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.backgroundSelected },
        disabled && styles.disabled,
      ]}>
      {body}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    textAlign: 'center',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
    paddingTop: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    letterSpacing: 0.6,
    fontSize: 11,
  },
  card: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: Spacing.three,
    minHeight: 56,
    justifyContent: 'center',
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  destructiveText: {
    color: '#D9342B',
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.5,
  },
});
