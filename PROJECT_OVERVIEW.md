# HideMe — Project Overview

> **Calculator. Vault. Your Privacy.**
> A privacy vault disguised as a working calculator. Type the secret code on the
> keypad and the encrypted vault opens; anyone else just sees a calculator.

| | |
|---|---|
| App name (store/UI) | **Calculator** (disguise) · **HideMe** (internal/marketing) |
| Version | 1.0.0 |
| Platform | iOS + Android (Expo prebuild / EAS) |
| Android package | `com.sakibfakir.hideme` |
| Stack | Expo SDK **58** · React Native **0.88** · React **19.3** · Expo Router · TypeScript 6 |
| Status | Feature-complete core vault; UI/UX polish + monetization remaining |

---

## 1. Product concept

The app is anonymous outside the vault (rule zero: no branding, no vault hints on the
calculator screen) and fully branded inside it. All data is **local-only** — no account,
no cloud, no tracking. Encryption happens on device; nothing leaves the sandbox.

Inspired by a static reverse-engineering of the competitor app
*Calculator+Vault+App Hider 3.16.7*; the resulting knowledge base lives in
[`memeory.md`](./memeory.md) and [`RE-FINAL-REPORT.md`](./RE-FINAL-REPORT.md).
UI/UX canon lives in [`DESIGN.md`](./DESIGN.md).

---

## 2. Tech stack

| Concern | Choice |
|---|---|
| Runtime | Expo SDK 58, React Native 0.88, Hermes |
| Routing | Expo Router (file-based, typed routes, React Compiler enabled) |
| Crypto | `@noble/hashes` (PBKDF2, SHA-256, HMAC), `@noble/ciphers` (AES-CTR/GCM), `expo-crypto` RNG |
| Secrets | `expo-secure-store` (Keychain / Android Keystore) |
| Files | `expo-file-system` (new `File`/`Directory` API) |
| Media | `expo-image`, `expo-video`, `expo-image-manipulator` (thumbnails, EXIF strip) |
| Picking | `expo-image-picker`, `expo-document-picker` |
| Lock | `expo-local-authentication`, `expo-screen-capture` |
| Ads | `react-native-google-mobile-ads` (AdMob banner / interstitial / rewarded) |
| UI | `@expo/vector-icons`, `expo-linear-gradient`, `react-native-reanimated` |

No `ios/` directory is committed; Android native project is generated (CNG). Always add
packages with `npx expo install`, not `npm install`.

---

## 3. Routes

```
src/app/
├── _layout.tsx                  root Stack · starts auto-lock watcher, ads, theme pref
├── index.tsx                    entry: hasSecret? gate : (onboarded? setup : onboarding)
├── onboarding.tsx               first-run trust story
├── setup-secret.tsx             create 6–12 digit code (+ biometric opt-in)
├── calculator-disguise.tsx      the only "outside" screen · PIN entry + lockout UI
└── vault/
    ├── _layout.tsx              guard: redirects to gate unless unlocked · PrivacyShield
    ├── (tabs)/
    │   ├── _layout.tsx          Home · Files · Gallery · Settings
    │   ├── index.tsx            Vault Home (categories, folders, search, FAB)
    │   ├── files.tsx            document list + search
    │   ├── gallery.tsx          media grid · All/Photos/Videos chips · multi-select
    │   └── settings.tsx         security, appearance, storage, ads, erase
    ├── folder/[id].tsx          folder contents
    ├── item/[id].tsx            photo / video / document viewer + actions
    ├── bin.tsx                  Recently Deleted (30-day retention)
    └── import.tsx               import sources + progress
```

**Guard rules:** the vault stack subscribes to the in-memory session
(`useVaultUnlocked`) and hard-redirects to `/calculator-disguise` when locked.
`PrivacyShield` blocks screenshots and blanks the app-switcher preview while unlocked.

---

## 4. Architecture

| Layer | Files | Responsibility |
|---|---|---|
| Crypto primitives | `lib/crypto/envelope.ts` | Pure, node-testable envelope: AES-256-CTR + HMAC-SHA256, per-file key wrapped with AES-256-GCM (AAD-bound to file id) |
| File streaming | `lib/crypto/file-crypto.ts` | Chunked encrypt/decrypt with progress; encrypt-then-MAC; integrity verified **before** plaintext is released |
| Secret / KEK | `lib/vault-secret.ts` | PBKDF2-SHA256 (**210k rounds**) → 64-byte DK: `[0:32]` verifier, `[32:64]` KEK that unwraps the master key |
| Session | `lib/vault-session.ts` | In-memory master key only; `lock()` zeroizes and runs cleanups; external store for React |
| Storage | `lib/vault-store.ts` | Encrypted index + blobs, import pipeline, thumbnail cache, bin helpers |
| Lockout | `lib/vault-lockout*.ts` | 3 free attempts, then 15s → 30s → … capped at 15 min; persisted across restarts |
| Auto-lock | `lib/vault-autolock*.ts` | AppState watcher; Immediately / 30s / 1min / 5min; rewarded-ad pause (1h) |
| Calculator | `lib/calc-engine.ts` | Safe expression evaluator for the disguise (no `eval`) |
| Ads | `lib/ads.ts`, `constants/ads.ts` | Lazy AdMob init, interstitial cap (1 / 24h, persisted), rewarded reward grant |
| Design tokens | `constants/theme.ts`, `hooks/use-theme.ts`, `lib/theme-pref.ts` | Palette + light/dark/system preference |

### Storage layout (app-private sandbox)

```
<documents>/vault/index.hmd       encrypted index (folders + item metadata)
<documents>/vault/files/<id>.hmd  encrypted content blob
<cache>/vault-tmp/…               transient decrypted plaintext — purged on every lock
```

### On-disk envelope (v2)

```
MAGIC 'HMDL' (4) | headerLen u16-BE (2) | header JSON | mac (32) | ciphertext
```

- Header carries `v, alg, id, size, fn` (CTR nonce) and `fk` (GCM-wrapped per-file key).
- HMAC covers `MAGIC | headerLen | headerJSON | ciphertext`; the MAC field itself is excluded.
- Per-file key is wrapped under the master key with AES-256-GCM, AAD = `hideme.vault.v2:<fileId>`,
  so a blob cannot be swapped with another item's.

### Unlock flow (intentional difference from the RE'd app)

1. User types code on the calculator keypad and presses `=`.
2. `vault-secret.unlock` derives the KEK via PBKDF2 and compares the verifier in
   **constant time**.
3. The wrapped master key is unwrapped with AES-256-GCM and handed to `vault-session`
   (memory only).
4. Router enters `/vault`; auto-lock timer starts.

The RE'd competitor stored an unsalted MD5 of the PIN in plaintext (see report §2).
This project fixes that: salted PBKDF2 + wrapped master key + constant-time compare,
so the stored record alone cannot be brute-forced cheaply and never contains the key.

---

## 5. Feature status

### Built and working

| Area | Details |
|---|---|
| Disguise gate | Real calculator (expression + result, shrink-to-fit), anonymous dark UI |
| Setup | 6–12 digit code, confirm step, unrecoverable-code warning |
| PIN unlock | PBKDF2 210k → AES-256-GCM master-key wrap, constant-time verify |
| Biometric unlock | Face ID / fingerprint; master key in Keychain/Keystore; enabled from Settings (with PIN confirmation)
| Lockout | 3 free attempts → exponential backoff (15s…15min), survives restart |
| Auto-lock | Immediately / 30s / 1min / 5min, configurable; rewarded ad pauses timed lock 1h |
| Privacy | Screenshot blocking + app-switcher shield while unlocked; restored for the gate |
| Import | Photos/videos (gallery or camera), documents, other files; per-file progress, cancelable |
| Organization | Folders, rename, move, search (debounced), storage stats |
| Viewers | Image (fit-to-screen), video (`expo-video`), document decrypted then opened in the system preview sheet |
| Deletion | Move to bin, restore, permanent delete, erase-all; 30-day auto-expiry |
| Gallery | Responsive grid, duration badges, All/Photos/Videos chips, multi-select + bulk actions |
| Settings | Change code, biometric switch, auto-lock, theme (system/light/dark), storage, erase |
| Ads | Banner (hidden in select mode), interstitial on unlock/import only (max 1/24h), rewarded auto-lock pause |
| Quality | Pure-core unit tests (envelope, lockout, auto-lock, bin, ad cap) |

### Partial

| Area | Gap |
|---|---|
| Audio | Import row folds audio into "Audio & other files"; no `audio` item kind, tile, or player |
| Rewarded perk UX | Works via Settings button + system `Alert`; the designed modal sheet (§5.7) is missing |
| Select mode | Bulk move/delete exist; **share** does not (no `expo-sharing` / RN `Share`) |
| Onboarding | Screen exists (uncommitted) — needs copy/visual review against DESIGN.md §5.14 |

### Not built

| Feature | Reference |
|---|---|
| Premium paywall ($2.99 lifetime, restore purchase) | DESIGN.md §5.12, §8 |
| Auto-Lock Timer countdown screen (big `00:59:23`, paused badge, Lock Now) | DESIGN.md §5.8 — logic exists, UI missing |
| Unlock Success screen ("Welcome back!" + interstitial slot) | DESIGN.md §5.9 |
| Notifications toggle | Undecided purpose — implement local reminders or drop it |
| App hiding / cloning (Gaia-style) | Competitor feature, out of current product scope |
| Launcher icon disguise switching | Native work; currently one static "Calculator" icon |

---

## 6. Remaining work

### P0 — correctness & performance (from `roadmap.md`)

1. **PIN setup flow** — make entering/confirming the code fast and simple (avoid re-derivation jank).
2. **Faster crypto** — PBKDF2 210k on pure JS is slow on debug Hermes; profile release builds,
   consider native PBKDF2 (`react-native-quick-crypto`) rather than lowering iterations.
3. **Import/grid lag** — commit `9cac511` fixed late decode/duplicate tiles; still tune concurrency
   and thumbnail cache (unbounded parallel pure-JS decrypt was the original cause).
4. **"Instant show"** — eliminate layout flash on first paint of grids/viewers.
5. **Type/object sizing** — audit prop types, image aspect ratios, and tile dimensions.
6. **Viewer polish** — swipe pager, zoom, video controls, document scroll.
7. **Type/import cleanup** — remaining `any`/loose imports.

### P1 — design-complete screens

1. Auto-Lock Timer screen (§5.8).
2. Unlock Success screen (§5.9) with capped interstitial.
3. Rewarded-ad bottom sheet (§5.7).
4. Premium paywall (§5.12).
5. Audio category + player (extend `ItemKind`, import, tile, viewer).
6. Share/export for preview + select mode.
7. Onboarding visual pass + setup-secret redesign.

### P2 — hardening & ops

- Instrument startup/unlock timing on release builds (target: perceived instant).
- Android backup: manifest has `allowBackup="true"` (SecureStore already has exclusion
  rules, vault documents do not) — exclude `files/vault/` from backup or disable backup.
- Add iOS build config + EAS profiles (`development`, `preview`, `production`).
- Add tests for `vault-store` import/bin lifecycle (needs a filesystem fake).
- Fix stale docs: `README.md` says PBKDF2 **600k**, code uses **210k**.

---

## 7. Commands

```bash
npx expo start                 # dev server
npx expo run:android           # native dev build (required for ads/biometrics)
npx expo lint                  # eslint
npx tsc --noEmit               # typecheck
node --test src/lib/**/*.test.ts   # pure-core unit tests
npx expo-doctor                # dependency/config diagnosis
npx expo export -p web         # static web export (ads/crypto limited on web)
```

Ads and biometrics require a **development build** — Expo Go will not run the full unlock flow.

---

## 8. Documentation index

| File | Purpose |
|---|---|
| `README.md` | Quick start + feature list |
| `DESIGN.md` | Canonical UI/UX spec (tokens, 14 screens, components, a11y) |
| `roadmap.md` | Short perf/polish punch list |
| `memeory.md` | RE knowledge base for the competitor app |
| `RE-FINAL-REPORT.md` | Full static-analysis report (unlock chain, crypto weaknesses, evidence ledger) |
| `AGENTS.md` | Repo conventions for agents (Expo docs, commands, routing rules) |
| `PROJECT_OVERVIEW.md` | This document |

---

## 9. Repository state (as of 2026-10-27)

Last commit `first build done`. A large uncommitted wave sits on top:

- **New:** `onboarding.tsx`, `vault/(tabs)/_layout.tsx`, `files.tsx`, `gallery.tsx`,
  `vault/import.tsx`, `components/ui/*`, `components/vault/ad-banner.tsx`,
  `lib/ads.ts`, `lib/ads-cap-core.ts`, `constants/ads.ts`, `hooks/use-debounced-value.ts`,
  `DESIGN.md`, this file.
- **Modified:** tab-bar refactor (`vault/index.tsx` + `settings.tsx` moved into `(tabs)`),
  calculator gate, theme tokens, import hook, auto-lock, secret handling, store.

Recommended next step: commit the tab-bar + onboarding + ads wave before starting the
P0 performance work, so regressions remain bisectable.
