const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Keep the vault out of Android backups.
 *
 * The vault blobs are encrypted, but the master key lives in the Keystore
 * and is device-bound, so a copy in a cloud backup or a device-to-device
 * transfer would be unreadable anyway — and it would put the user's file
 * inventory on someone else's server.
 *
 * expo-secure-store already installs backup rules that keep its own
 * preferences out. A manifest can only point at one set of rules, so this
 * plugin replaces them with a merged set: the SecureStore exclusion is kept
 * and the vault directory is added.
 *
 * Must be listed *after* `expo-secure-store` in app.json, so it wins the
 * manifest attributes.
 */

const BACKUP_RULES = '@xml/hideme_backup_rules';
const DATA_EXTRACTION_RULES = '@xml/hideme_data_extraction_rules';
const RULE_FILES = ['hideme_backup_rules.xml', 'hideme_data_extraction_rules.xml'];

function withVaultBackupRules(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;
    application.$['android:fullBackupContent'] = BACKUP_RULES;
    application.$['android:dataExtractionRules'] = DATA_EXTRACTION_RULES;
    return config;
  });
}

function withVaultBackupRuleFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(resDir, { recursive: true });
      for (const file of RULE_FILES) {
        await fs.promises.copyFile(
          path.join(__dirname, 'backup-rules', file),
          path.join(resDir, file),
        );
      }
      return config;
    },
  ]);
}

module.exports = function withVaultBackup(config) {
  return withVaultBackupRuleFiles(withVaultBackupRules(config));
};
