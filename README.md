# HideMe

A privacy vault disguised as a calculator, built with [Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction).

Type your secret code into the calculator keypad and the vault opens. Anyone else just sees a working calculator.

## Features

- Calculator disguise gate (real, working calculator)
- PIN unlock: PBKDF2-SHA256 (600k rounds) → AES-256-GCM wrapped master key in SecureStore
- Files encrypted with AES-256-CTR + HMAC-SHA256 (per-file keys, encrypt-then-MAC, integrity checked before decrypt)
- Biometric unlock (Face ID / fingerprint) with key kept in Keychain/Keystore
- Auto-lock after backgrounding (Immediately / 30s / 1min / 5min, configurable in settings)
- Screenshot + app-switcher blocking while unlocked (restored for the locked calculator)
- Failed-PIN lockout: 3 free attempts, then exponential backoff (15s → 15min cap), persisted across restarts
- Folders, search, photo/video/document import with progress
- Photo, video and document viewers
- Change code, lock-now, storage stats, erase-all in settings

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

## Commands

```bash
npx expo start          # dev server
npx expo lint           # eslint
npx tsc --noEmit        # typecheck
npx expo export -p web  # static web export
node --test src/lib/crypto/envelope.test.ts   # crypto unit tests
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
```
