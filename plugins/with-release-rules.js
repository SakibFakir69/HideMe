const { withDangerousMod, withGradleProperties } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Keep the release build from crashing on startup.
 *
 * The release build is minified (R8). The ads SDK pulls in WorkManager, which
 * keeps its state in a Room database, and R8 strips the generated
 * implementation: the app then dies before the first screen with "Failed to
 * create an instance of androidx.work.impl.WorkDatabase". The debug build is
 * not minified, so the crash only ever shows up in the build you ship.
 *
 * This plugin writes the keep rules into the generated ProGuard file and
 * turns the shrinker on, so a fresh `expo prebuild` cannot lose either.
 */

const RULES = `
# WorkManager (pulled in by the ads SDK) keeps its state in a Room database.
# R8 strips the generated implementation, and the app then crashes on startup
# with "Failed to create an instance of androidx.work.impl.WorkDatabase" -
# only in a minified release build.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep @androidx.room.Entity class * { *; }
-keep class androidx.work.impl.** { *; }
-keep class androidx.work.impl.model.** { *; }
-dontwarn androidx.work.**
-dontwarn androidx.room.**

# The ads SDK resolves its native side and its view classes by name.
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**
`;

const MARKER = '# hideme: keep the release build alive';

/** Writes the rules into the generated ProGuard file, once. */
function withProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const proguard = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );
      let current = '';
      try {
        current = await fs.promises.readFile(proguard, 'utf8');
      } catch {
        current = '';
      }
      if (current.includes(MARKER)) return config;
      const next = `${current}\n${MARKER}${RULES}\n`;
      await fs.promises.writeFile(proguard, next, 'utf8');
      return config;
    },
  ]);
}

/** The release build is the one that ships, so it is the one that is minified. */
function withMinifiedRelease(config) {
  return withGradleProperties(config, (config) => {
    const item = config.modResults.find(
      (entry) => entry.type === 'property' && entry.key === 'android.enableMinifyInReleaseBuilds',
    );
    if (item) {
      item.value = 'true';
      return config;
    }
    config.modResults.push({
      type: 'property',
      key: 'android.enableMinifyInReleaseBuilds',
      value: 'true',
    });
    return config;
  });
}

module.exports = function withHideMeReleaseRules(config) {
  return withProguardRules(withMinifiedRelease(config));
};
