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
├── unlock-success.tsx           confirmation after unlock · capped interstitial on continue
└── vault/
    ├── _layout.tsx              guard: redirects to gate unless unlocked · PrivacyShield · bin reminder sync
    ├── (tabs)/
    │   ├── _layout.tsx          Home · Files · Gallery · Settings
    │   ├── index.tsx            Vault Home (categories, folders, search, FAB)
    │   ├── files.tsx            document list + search
    │   ├── gallery.tsx          media grid · All/Photos/Videos chips · multi-select
    │   └── settings.tsx         premium, security, appearance, disguise, storage, ads, erase
    ├── folder/[id].tsx          folder contents
    ├── item/[id].tsx            photo / video / document viewer + actions
    ├── bin.tsx                  Recently Deleted (30-day retention)
    ├── import.tsx               import sources + progress
    ├── premium.tsx              paywall · $2.99 lifetime · restore purchase
    ├── auto-lock.tsx            threshold + live pause countdown + lock now
    └── app-icon.tsx             launcher disguise picker + hide/restore
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
| Secret / KEK | `lib/vault-secret.ts` | PBKDF2-SHA256 (**210k rounds**) → 64-byte DK: `[0:32]` verifier, `[32:64]` KEK that unwraps the master key. Android 8+ derives via `modules/vault-crypto` (platform PBKDF2, ~1 s); JS fallback elsewhere produces identical bytes |
| Session | `lib/vault-session.ts` | In-memory master key only; `lock()` zeroizes and runs cleanups; external store for React |
| Storage | `lib/vault-store.ts` | Encrypted index + blobs, import pipeline, thumbnail cache, bin helpers |
| Lockout | `lib/vault-lockout*.ts` | 3 free attempts, then 15s → 30s → … capped at 15 min; persisted across restarts |
| Auto-lock | `lib/vault-autolock*.ts` | AppState watcher; Immediately / 30s / 1min / 5min; rewarded pause (1h) with live countdown screen |
| Premium | `lib/premium.ts`, `lib/iap.ts` | Local entitlement in SecureStore + lazy `expo-iap` bridge (product `hideme_premium_lifetime`); gates ads and the pause |
| Reminders | `lib/reminders.ts` | `expo-notifications` daily local nudge (09:00) while the bin is non-empty; generic text, no vault wording |
| App icon | `modules/app-icon` + `plugins/with-launcher-disguise.js` | Five `activity-alias` disguises, hide mode, `*#*#48263#*#*` restore receiver |
| Calculator | `lib/calc-engine.ts` | Safe expression evaluator for the disguise (no `eval`) |
| Ads | Lazy AdMob init, unlock interstitial cap (1 / 24h, persisted), import interstitial every 2 imports (persisted counter), rewarded reward grant |
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
| Auto-lock | Immediately / 30s / 1min / 5min, configurable; rewarded-ad pause sheet (§5.7) grants 1h, free for premium |
| Privacy | Screenshot blocking + app-switcher shield while unlocked; restored for the gate |
| Import | Photos/videos (gallery or camera), documents, other files; per-file progress, cancelable |
| Organization | Folders, rename, move, search (debounced), storage stats |
| Viewers | Immersive black stage with tap-to-hide chrome; photos fit-to-screen, video (`expo-video`, no autoplay, native controls + fullscreen), documents open in the system preview sheet from a card; Share via the More sheet (`expo-sharing`) |
| Deletion | Move to bin, restore, permanent delete, erase-all; 30-day auto-expiry |
| Gallery | Responsive grid, duration badges, All/Photos/Videos chips, multi-select + bulk actions |
| Settings | Change code, biometric switch, auto-lock timer, theme (system/light/dark), app icon, reminders, storage, erase |
| Premium | $2.99 one-time (`hideme_premium_lifetime`), store-priced, restore purchase + silent launch-time store sync; removes banners/interstitials/rewarded ads and grants the 1h pause without an ad |
| Unlock success | Animated confirmation after PIN/biometric; Continue → vault (+ interstitial, capped 1/24h); premium CTA |
| Auto-lock timer | Dedicated screen: policy chips, live `mm:ss` pause countdown, pause/extend/end, lock now |
| Reminders | Daily 09:00 local notification while the bin has items; generic lock-screen text; permission handled in Settings |
| Launcher disguise | Calculator / Notes / Photos / Weather / Music aliases; hide-all mode; dial-code restore |
| Ads | Banner (hidden in select mode), interstitial after unlock (max 1/24h) and after every 2nd import, rewarded auto-lock pause; all skipped for premium |
| Quality | Pure-core unit tests (envelope, lockout, auto-lock, bin, ad cap) |

### Partial

| Area | Gap |
|---|---|
| Audio | Import row folds audio into "Audio & other files"; no `audio` item kind, tile, or player |
| Bulk share | The viewer shares one file via the system sheet; select mode still lacks share/export (no zip/multi-file share) |
| Onboarding | 3 swipeable slides with brand gradient badges, pager dots, skip and a single CTA; setup-secret still needs the same visual pass |

### Not built

| Feature | Reference |
|---|---|
| App hiding / cloning (Gaia-style) | Competitor feature, out of current product scope |
| Store-side purchase verification | Entitlement is local; no backend receipt validation yet |

---

## 6. Remaining work

### P0 — correctness & performance (from `roadmap.md`)

1. **PIN setup flow** — make entering/confirming the code fast and simple (avoid re-derivation jank).
2. ~~**Faster crypto**~~ — solved by the local `vault-crypto` Expo module: Android 8+ uses the
   platform PBKDF2 (native, ~1 s); iOS/web keep the JS fallback with identical output.
3. **Import/grid lag** — commit `9cac511` fixed late decode/duplicate tiles; still tune concurrency
   and thumbnail cache (unbounded parallel pure-JS decrypt was the original cause).
4. **"Instant show"** — eliminate layout flash on first paint of grids/viewers.
5. **Type/object sizing** — audit prop types, image aspect ratios, and tile dimensions.
6. **Viewer polish** — the player/viewer now has a black stage, tap-to-hide chrome, no autoplay,
   fullscreen and a real document card; still to add: swipe pager, pinch zoom, document scroll.
7. **Type/import cleanup** — remaining `any`/loose imports.

### P1 — design-complete screens

1. Audio category + player (extend `ItemKind`, import, tile, viewer).
2. Bulk share/export in select mode (single-file share from the viewer now ships via `expo-sharing`).
3. Setup-secret visual pass (onboarding slides are done: swipeable, gradient badges, dot pager).
4. Premium receipt verification against the store (backend optional; the silent launch sync covers reinstall/device changes).
5. Viewer swipe pager + pinch zoom.

### P2 — hardening & ops

- Instrument startup/unlock timing on release builds (target: perceived instant).
- Android backup: manifest has `allowBackup="true"` (SecureStore already has exclusion
  rules, vault documents do not) — exclude `files/vault/` from backup or disable backup.
- Add iOS build config + EAS profiles (`development`, `preview`, `production`).
- Add tests for `vault-store` import/bin lifecycle (needs a filesystem fake).
- ~~Fix stale docs: `README.md` says PBKDF2 600k~~ — corrected to **210k** + native path note.

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
