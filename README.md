# Calculator (HideMe)

A privacy vault disguised as a calculator, built with [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction).

Type your secret code into the calculator keypad and the vault opens. Anyone else just sees a working calculator.

## Features

- Calculator disguise gate (real, working calculator)
- PIN unlock: PBKDF2-SHA256 (210k rounds, native on Android 8+ and iOS) → AES-256-GCM wrapped master key in SecureStore
- Files encrypted with AES-256-CTR + HMAC-SHA256 (per-file keys, encrypt-then-MAC, integrity checked before decrypt)
- Biometric unlock (Face ID / fingerprint) with key kept in Keychain/Keystore
- Auto-lock after backgrounding (Immediately / 30s / 1min / 5min, configurable in settings)
- Screenshot + app-switcher blocking while unlocked (restored for the locked calculator)
- Failed-PIN lockout: 3 free attempts, then exponential backoff (15s → 15min cap), persisted across restarts
- Folders, search, photo/video/document/audio import with progress
- Audio files get their own category and a player in the viewer (playback only — the app never asks for the microphone)
- Photo, video and document viewers (tap-to-hide chrome, no video autoplay, fullscreen, single-file share)
- Pinch-to-zoom, double-tap zoom and drag-to-pan in the photo viewer, plus a swipe pager through the files you were browsing
- Change code, lock-now, storage stats, erase-all in settings
- Premium (one-time $2.99): removes ads, unlocks the auto-lock pause without an ad, restore + silent launch-time store sync
- Unlock Success screen after PIN/biometric entry, with the capped unlock interstitial
- Dedicated Auto-lock Timer screen: policy, live pause countdown, rewarded pause, lock now
- Cleanup reminders: one generic daily notification while Recently Deleted holds items
- Launcher disguise: Calculator / Notes / Photos / Weather / Music icons, hide-the-icon mode, `*#*#48263#*#*` restore

## Get started

```bash
npm install
npx expo start
```

Native modules (`expo-local-authentication`, `expo-video`, …) require a development build — Expo Go will not run the unlock flow:

```bash
npx expo run:android
npx expo run:ios
# or: eas build --profile development
```

### Android SDK path (local only)

`android/` is generated and git-ignored, so Gradle needs a machine-local
`android/local.properties` (also ignored):

```properties
sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
```

`npx expo prebuild` regenerates the whole native folder and deletes this file —
recreate it afterwards, or export `ANDROID_HOME` instead.

## Commands

```bash
npx expo start          # dev server
npx expo lint           # eslint
npx tsc --noEmit        # typecheck
npx expo export -p web  # static web export
node --test src/lib/crypto/envelope.test.ts   # crypto unit tests

npx eas-cli build --profile development   # dev client (internal)
npx eas-cli build --profile preview       # release APK (internal)
npx eas-cli build --profile production    # store build
```

## Project layout

```
src/app/            routes (file-based routing)
  index.tsx         entry → setup or calculator gate
  calculator-disguise.tsx
  setup-secret.tsx
  vault/            vault home, folders, item viewer, settings
src/lib/            crypto core, secret/session, encrypted store
src/components/     UI (vault components under components/vault/)
modules/            local Expo modules (app-icon, vault-crypto native PBKDF2)
plugins/            config plugins (launcher disguise)
```
