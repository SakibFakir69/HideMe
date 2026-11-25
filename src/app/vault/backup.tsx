import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';

import { ThemedText } from '@/components/themed-text';
import { GradientButton } from '@/components/ui/gradient-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { Fonts, MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import { useVaultPalette } from '@/hooks/use-vault-palette';
import { beginPickerGrace, clearPickerGrace } from '@/lib/vault-autolock';
import {
  exportBackup,
  openBackup,
  shareBackup,
  type ParsedBackup,
} from '@/lib/backup';
import { usePremium } from '@/lib/premium';
import { currentSecretRecord, adoptSecretRecord } from '@/lib/vault-secret';
import { getMasterKey, isDecoyVault, lock } from '@/lib/vault-session';
import { restoreVaultContents } from '@/lib/vault-store';

/**
 * Encrypted backup: one `.hmb` file the user owns. Export streams the real
 * vault into a single file (premium); restore picks the file back up, asks
 * for the code that made it, and REPLACES the current vault (free).
 */

type Pending =
  | { kind: 'export' }
  | { kind: 'restore'; uri: string; name: string };

export default function BackupScreen() {
  const palette = useVaultPalette();
  const premium = usePremium();
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [restorePhrase, setRestorePhrase] = useState('');
  const inputRef = useRef<TextInputInstance | null>(null);

  // Leaving the screen with a verified file still open must release its
  // handle (close() is idempotent, so the explicit closes stay harmless).
  useEffect(() => {
    return () => {
      parsed?.close();
    };
  }, [parsed]);

  const closeCodeModal = useCallback(() => {
    setPending(null);
    setCode('');
  }, []);

  const onExport = useCallback(() => {
    if (!premium.active) {
      Alert.alert('Encrypted backup', 'Exporting backups is a premium feature.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go Premium', onPress: () => router.push('/vault/premium') },
      ]);
      return;
    }
    setCode('');
    setPending({ kind: 'export' });
    setTimeout(() => inputRef.current?.focus(), 250);
  }, [premium.active]);

  const onPickRestore = useCallback(async () => {
    // The document picker is a system activity: it backgrounds the app, where
    // timed auto-lock would fire and silently drop the picked file. Arm the
    // same bounded grace the import flow uses.
    beginPickerGrace();
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });
    } catch (error) {
      // No picker was shown, so the grace has nothing to cover.
      clearPickerGrace();
      Alert.alert(
        'Could not open the file picker',
        error instanceof Error ? error.message : 'Try again.',
      );
      return;
    }
    if (result.canceled || !result.assets?.length) {
      // A cancelled picker never backgrounds the app on some platforms, so
      // close the grace here instead of leaving auto-lock suppressed.
      clearPickerGrace();
      return;
    }
    const asset = result.assets[0];
    setCode('');
    setPending({ kind: 'restore', uri: asset.uri, name: asset.name ?? 'backup.hmb' });
    setTimeout(() => inputRef.current?.focus(), 250);
  }, []);

  const submitCode = useCallback(async () => {
    if (!pending || busy) return;
    if (!/^\d{6,12}$/.test(code)) {
      Alert.alert('Wrong format', 'The code is 6–12 digits.');
      return;
    }
    if (pending.kind === 'export') {
      if (isDecoyVault()) {
        Alert.alert('Decoy vault', 'Backups only cover the real vault. Unlock with your real code first.');
        closeCodeModal();
        return;
      }
      setBusy('export');
      try {
        const record = await currentSecretRecord();
        if (!record) throw new Error('No secret code is set.');
        const { uri } = await exportBackup(getMasterKey(), record, code);
        closeCodeModal();
        try {
          await shareBackup(uri);
        } finally {
          // The share sheet has its own copy: no plaintext-name file lingers
          // in the app's cache.
          try {
            new File(uri).delete();
          } catch {
            // best effort
          }
        }
      } catch (error) {
        Alert.alert('Export failed', error instanceof Error ? error.message : 'Try again.');
      } finally {
        setBusy(null);
      }
      return;
    }
    // restore: verify the code against the file before any confirm
    setBusy('open');
    try {
      const opened = await openBackup(pending.uri, code);
      setParsed(opened);
      closeCodeModal();
    } catch (error) {
      Alert.alert(
        'Cannot restore',
        error instanceof Error ? error.message : 'This file is not a HideMe backup.',
      );
    } finally {
      setBusy(null);
    }
  }, [busy, closeCodeModal, code, pending]);

  const onConfirmRestore = useCallback(async () => {
    if (!parsed || busy) return;
    setBusy('restore');
    try {
      if (isDecoyVault()) {
        Alert.alert('Decoy vault', 'Restoring happens in the real vault. Unlock with your real code first.');
        return;
      }
      // Items whose blob never made it into the file are skipped; the rest
      // replace the current vault wholesale.
      const blobIds = new Set(parsed.blobs.map((blob) => blob.id));
      const index = {
        ...parsed.index,
        items: parsed.index.items.filter((item) => blobIds.has(item.id)),
      };
      await restoreVaultContents(parsed.masterKey, index, parsed.copyBlob);
      // The restored record may use a different code — adopt it wholesale.
      await adoptSecretRecord(parsed.record);
      parsed.close();
      setParsed(null);
      lock();
      Alert.alert(
        'Vault restored',
        `Restored ${index.items.length} item${index.items.length === 1 ? '' : 's'}. Unlock with the backup's code.`,
        [{ text: 'OK', onPress: () => router.replace('/calculator-disguise') }],
      );
    } catch (error) {
      // A failed blob copy leaves the read offset mid-stream — retrying on
      // the same handle would copy wrong bytes. Force a fresh open instead.
      parsed.close();
      setParsed(null);
      setRestorePhrase('');
      Alert.alert('Restore failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  }, [busy, parsed]);

  const prompt =
    pending?.kind === 'export'
      ? 'Enter your secret code to encrypt the backup header'
      : 'Enter the code that created this backup';

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.headerWrap}>
          <ScreenHeader title="Encrypted backup" onBack={() => router.back()} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
                <Ionicons name="cloud-upload-outline" size={20} color={Palette.success} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Export a backup</ThemedText>
                <ThemedText type="code" themeColor="textSecondary" style={styles.cardNote}>
                  One .hmb file with every item, fully encrypted. Premium.
                </ThemedText>
              </View>
            </View>
            <GradientButton
              label={premium.active ? 'Export backup' : 'Export backup · Premium'}
              onPress={onExport}
              loading={busy === 'export'}
            />
          </View>

          <View style={[styles.card, { backgroundColor: palette.surface }]}>
            <View style={styles.cardRow}>
              <View style={[styles.cardIcon, { backgroundColor: 'rgba(59,130,246,0.14)' }]}>
                <Ionicons name="cloud-download-outline" size={20} color={Palette.primary} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">Restore from a backup</ThemedText>
                <ThemedText type="code" themeColor="textSecondary" style={styles.cardNote}>
                  Replaces the current vault. Needs the backup&apos;s code. Free.
                </ThemedText>
              </View>
            </View>
            <GradientButton
              label="Choose backup file"
              variant="ghost"
              onPress={() => void onPickRestore()}
              loading={busy === 'open'}
            />
          </View>

          <View style={[styles.note, { backgroundColor: palette.surface }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.textSecondary} />
            <ThemedText type="code" themeColor="textSecondary" style={styles.noteText}>
              The backup is unreadable without its code — not even HideMe can open it. Keep the
              code and the file in different places.
            </ThemedText>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* code entry, shared by export and restore */}
      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={closeCodeModal}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

          <View style={[styles.modalCard, { backgroundColor: palette.surface }]}>
            <ThemedText type="smallBold">
              {pending?.kind === 'export' ? 'Export backup' : 'Restore backup'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {pending?.kind === 'restore' ? `${pending.name}\n` : ''}
              {prompt}
            </ThemedText>
            <TextInput
              ref={inputRef}
              style={[styles.codeInput, { color: palette.text, borderBottomColor: palette.surfaceHigh }]}
              value={code}
              onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, 12))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={12}
              placeholder="••••••"
              placeholderTextColor={palette.textSecondary}
              editable={busy === null}
              onSubmitEditing={() => void submitCode()}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={closeCodeModal}
                disabled={busy !== null}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalButton,
                  { backgroundColor: palette.surfaceHigh },
                  pressed && styles.pressed,
                  busy !== null && styles.disabled,
                ]}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void submitCode()}
                disabled={busy !== null}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalSubmit,
                  pressed && styles.pressed,
                  busy !== null && styles.disabled,
                ]}>
                {busy !== null ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <ThemedText type="small" style={styles.modalSubmitText}>
                    {pending?.kind === 'export' ? 'Export' : 'Verify'}
                  </ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* restore confirmation */}
      <Modal
        visible={parsed !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          parsed?.close();
          setParsed(null);
        }}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface }]}>
            <ThemedText type="smallBold">Restore this backup?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Created {new Date(parsed?.createdAt ?? 0).toLocaleString()} ·{' '}
              {parsed?.itemCount ?? 0} item{(parsed?.itemCount ?? 0) === 1 ? '' : 's'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Every file in the CURRENT vault is deleted and replaced. Your code becomes the
              backup&apos;s code. Type RESTORE to confirm.
            </ThemedText>
            <TextInput
              style={[styles.phraseInput, { color: palette.text, borderBottomColor: palette.surfaceHigh }]}
              value={restorePhrase}
              onChangeText={setRestorePhrase}
              placeholder="RESTORE"
              placeholderTextColor={palette.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={busy === null}
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  parsed?.close();
                  setParsed(null);
                  setRestorePhrase('');
                }}
                disabled={busy !== null}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalButton,
                  { backgroundColor: palette.surfaceHigh },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="small">Cancel</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => void onConfirmRestore()}
                disabled={busy !== null || restorePhrase.trim().toUpperCase() !== 'RESTORE'}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalDanger,
                  pressed && styles.pressed,
                  (busy !== null || restorePhrase.trim().toUpperCase() !== 'RESTORE') && styles.disabled,
                ]}>
                <ThemedText type="small" style={styles.modalSubmitText}>
                  {busy === 'restore' ? 'Restoring…' : 'Restore'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.one,
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
  flex: {
    flex: 1,
  },
  note: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalCard: {
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.three,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  codeInput: {
    fontFamily: Fonts.mono,
    fontSize: 22,
    letterSpacing: 4,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
  },
  phraseInput: {
    fontFamily: Fonts.sansMedium,
    fontSize: 16,
    letterSpacing: 1,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 92,
  },
  modalSubmit: {
    backgroundColor: '#22C55E',
  },
  modalDanger: {
    backgroundColor: Palette.error,
  },
  modalSubmitText: {
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
