const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Launcher-icon disguise (Android).
 *
 * The real activity loses its MAIN/LAUNCHER filter; five `activity-alias`
 * entries take its place, each with its own label and icon. The app toggles
 * them at runtime (modules/app-icon), and hiding the app means disabling all
 * five. `*#*#48263#*#*` brings the Calculator icon back.
 */

const DISGUISES = [
  { id: 'calculator', label: 'Calculator', drawable: 'ic_disguise_calculator', alias: 'CalculatorAlias' },
  { id: 'notes', label: 'Notes', drawable: 'ic_disguise_notes', alias: 'NotesAlias' },
  { id: 'photos', label: 'Photos', drawable: 'ic_disguise_photos', alias: 'PhotosAlias' },
  { id: 'weather', label: 'Weather', drawable: 'ic_disguise_weather', alias: 'WeatherAlias' },
  { id: 'music', label: 'Music', drawable: 'ic_disguise_music', alias: 'MusicAlias' },
];

const MAIN_ACTION = 'android.intent.action.MAIN';

function withLauncherAliases(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    const main = (application.activity ?? []).find(
      (activity) => activity.$?.['android:name'] === '.MainActivity',
    );
    if (main) {
      // The alias owns the launcher entry now; keeping MAIN here would show
      // two icons. Deep links and the exported activity stay untouched.
      main.$['android:exported'] = 'true';
      const filters = (main['intent-filter'] ?? []).filter(
        (filter) =>
          !(filter.action ?? []).some(
            (action) => action.$?.['android:name'] === MAIN_ACTION,
          ),
      );
      if (filters.length > 0) main['intent-filter'] = filters;
      else delete main['intent-filter'];
    }

    application['activity-alias'] = DISGUISES.map((disguise) => ({
      $: {
        'android:name': `.${disguise.alias}`,
        'android:targetActivity': '.MainActivity',
        'android:enabled': disguise.id === 'calculator' ? 'true' : 'false',
        'android:exported': 'true',
        'android:icon': `@drawable/${disguise.drawable}`,
        'android:roundIcon': `@drawable/${disguise.drawable}`,
        'android:label': disguise.label,
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': MAIN_ACTION } }],
          category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
        },
      ],
    }));

    return config;
  });
}

function withLauncherIcons(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const drawableDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'drawable',
      );
      await fs.promises.mkdir(drawableDir, { recursive: true });
      for (const disguise of DISGUISES) {
        const source = path.join(__dirname, 'launcher-icons', `${disguise.drawable}.xml`);
        await fs.promises.copyFile(source, path.join(drawableDir, `${disguise.drawable}.xml`));
      }
      return config;
    },
  ]);
}

module.exports = function withLauncherDisguise(config) {
  return withLauncherIcons(withLauncherAliases(config));
};

module.exports.DISGUISES = DISGUISES;
