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
| Media | `expo-image`, `expo-video`, `expo-audio` (playback only), `expo-image-manipulator` (thumbnails, EXIF strip) |
| Picking | `expo-image-picker`, `expo-document-picker` |
| Lock | `expo-local-authentication`, `expo-screen-capture` |
| Ads | `react-native-google-mobile-ads` (AdMob banner / interstitial / rewarded) |
| UI | `@expo/vector-icons`, `expo-linear-gradient`, `react-native-reanimated` |
| Gestures | `react-native-gesture-handler` (v3 hook API) + `react-native-worklets` |
| Native | `modules/app-icon` (launcher aliases), `modules/vault-crypto` (PBKDF2) |

No `ios/` directory is committed; Android native project is generated (CNG). Always add
packages with `npx expo install`, not `npm install`.

The two local Expo modules live in `modules/` and are autolinked:

| Module | Platforms | Purpose |
|---|---|---|
| `modules/app-icon` | Android | Five `activity-alias` launcher disguises, hide mode, `*#*#48263#*#*` restore receiver |
| `modules/vault-crypto` | Android, iOS | Native PBKDF2-HMAC-SHA256 (Conscrypt / CommonCrypto); salt and key travel as lowercase hex |

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
| Key derivation | `lib/crypto/pbkdf2.ts` | Pure PBKDF2-HMAC-SHA256 wrapper: platform provider first, JS fallback second, identical bytes |
| File streaming | `lib/crypto/file-crypto.ts` | Chunked encrypt/decrypt with progress; encrypt-then-MAC; integrity verified **before** plaintext is released |
| Secret / KEK | `lib/vault-secret.ts` | PBKDF2-SHA256 (**210k rounds**) → 64-byte DK: `[0:32]` verifier, `[32:64]` KEK that unwraps the master key. Android 8+ and iOS derive natively (`modules/vault-crypto`: platform PBKDF2, ~1 s); the JS fallback elsewhere produces identical bytes |
| Session | `lib/vault-session.ts` | In-memory master key only; `lock()` zeroizes and runs cleanups; external store for React |
| Storage | `lib/vault-store.ts` | Encrypted index + blobs, import pipeline, thumbnail cache, bin helpers; index schema v3 (`lib/vault-kinds.ts`) |
| Lockout | `lib/vault-lockout*.ts` | 3 free attempts, then 15s → 30s → … capped at 15 min; persisted across restarts |
| Auto-lock | `lib/vault-autolock*.ts` | AppState watcher; Immediately / 30s / 1min / 5min; rewarded pause (1h) with live countdown screen |
| Premium | `lib/premium.ts`, `lib/iap.ts` | Local entitlement in SecureStore + lazy `expo-iap` bridge (product `hideme_premium_lifetime`); gates ads and the pause |
| Reminders | `lib/reminders.ts` | `expo-notifications` daily local nudge (09:00) while the bin is non-empty; generic text, no vault wording |
| App icon | `modules/app-icon` + `plugins/with-launcher-disguise.js` | Five `activity-alias` disguises, hide mode, `*#*#48263#*#*` restore receiver |
| Calculator | `lib/calc-engine.ts` | Safe expression evaluator for the disguise (no `eval`) |
| Ads | Lazy AdMob init, unlock interstitial cap (1 / 24h, persisted), import interstitial every 2 imports (persisted counter), rewarded reward grant |
| Design tokens | `constants/theme.ts`, `hooks/use-theme.ts`, `lib/theme-pref.ts` | Palette + light/dark/system preference |

### Key derivation

`lib/crypto/pbkdf2.ts` is the single entry point for PBKDF2-HMAC-SHA256. It
prefers the platform provider and falls back to `@noble/hashes`; both paths
produce identical bytes, which the known-answer vectors in
`lib/crypto/pbkdf2.test.ts` pin to the published NIST/RFC 7914 values. The
native modules exchange the salt and the derived key as lowercase hex, so
Android and iOS share one wire format.

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
| Setup | 6–12 digit code, confirm step, unrecoverable-code warning, biometric opt-in |
| PIN unlock | PBKDF2 210k → AES-256-GCM master-key wrap, constant-time verify; native derivation on Android 8+ and iOS |
| Biometric unlock | Face ID / fingerprint; master key in Keychain/Keystore; enabled from Settings (with PIN confirmation)
| Lockout | 3 free attempts → exponential backoff (15s…15min), survives restart |
| Auto-lock | Immediately / 30s / 1min / 5min, configurable; rewarded-ad pause sheet (§5.7) grants 1h, free for premium |
| Privacy | Screenshot blocking + app-switcher shield while unlocked; restored for the gate |
| Import | Photos/videos (gallery or camera), documents, other files; per-file progress, cancelable |
| Organization | Folders, rename, move, search (debounced), storage stats |
| Viewers | Immersive black stage with tap-to-hide chrome; photos fit-to-screen with pinch-to-zoom, double-tap zoom and drag-to-pan (clamped to the viewport), swipe-pager through the list the grid was showing, video (`expo-video`, no autoplay, native controls + fullscreen, pauses when swiped away), documents open in the system preview sheet from a card; Share via the More sheet (`expo-sharing`) |
| Deletion | Move to bin, restore, permanent delete, erase-all; 30-day auto-expiry |
| Gallery | Responsive grid, duration badges, All/Photos/Videos chips, multi-select + bulk actions |
| Settings | Change code, biometric switch, auto-lock timer, theme (system/light/dark), app icon, reminders, storage, erase |
| Premium | $2.99 one-time (`hideme_premium_lifetime`), store-priced, restore purchase + silent launch-time store sync; removes banners/interstitials/rewarded ads and grants the 1h pause without an ad |
| Unlock success | Animated confirmation after PIN/biometric; Continue → vault (+ interstitial, capped 1/24h); premium CTA |
| Auto-lock timer | Dedicated screen: policy chips, live `mm:ss` pause countdown, pause/extend/end, lock now |
| Reminders | Daily 09:00 local notification while the bin has items; generic lock-screen text; permission handled in Settings |
| Launcher disguise | Calculator / Notes / Photos / Weather / Music aliases; hide-all mode; dial-code restore |
| Ads | Banner (hidden in select mode), interstitial after unlock (max 1/24h) and after every 2nd import, rewarded auto-lock pause; all skipped for premium |
| Audio | Own `audio` item kind, category tile, import row (audio-only picker), music icon in the grid and a player in the viewer (`expo-audio`, playback only — no mic permission) |
| Quality | Pure-core unit tests (envelope, PBKDF2 known-answer vectors, item kinds + index migration, lockout, auto-lock, bin, ad cap) |

### Partial

| Area | Gap |
|---|---|
| Bulk share | The viewer shares one file via the system sheet; select mode still lacks share/export (no zip/multi-file share) |
| Onboarding | 3 swipeable slides with brand gradient badges, pager dots, skip and a single CTA; setup-secret got the same treatment |

### Not built

| Feature | Reference |
|---|---|
| App hiding / cloning (Gaia-style) | Competitor feature, out of current product scope |
| Store-side purchase verification | Entitlement is local; no backend receipt validation yet |

---

## 6. Remaining work

### P0 — correctness & performance (from `roadmap.md`)

1. ~~**PIN setup flow**~~ — done: native PBKDF2 on Android 8+ **and iOS** (~1 s), both
   derivations run concurrently when the code changes, and the setup screen keeps the
   first code when the confirmation does not match.
2. ~~**Faster crypto**~~ — solved by the local `vault-crypto` Expo module: Android 8+
   uses the platform PBKDF2, iOS uses CommonCrypto; web keeps the JS fallback. All
   three produce identical bytes (pinned by known-answer tests).
3. ~~**Import/grid lag**~~ — done: grid tiles are memoized, thumbnails get their own
   decryption budget, and import overlaps thumbnail building with the next file.
4. ~~**"Instant show"**~~ — done: sized placeholder instead of a spinner, no filesystem
   stat during render, no layout jump when the thumbnail or the photo arrives.
5. **Type/object sizing** — the grid re-measures when the window changes size
   (`useGridColumns`: multi-window, foldable, tablet split view), and the lists
   are constrained to `MaxContentWidth` so the tiles fill their cells on wide
   displays. Still open: the grid is a fixed square crop (`contentFit="cover"`),
   while DESIGN.md asks for a responsive masonry grid that keeps the real ratio.
6. **Viewer polish** — pinch zoom, double-tap zoom and drag-to-pan ship, and
   the viewer pages through the items the grid was showing. Still to add:
   document scroll.
7. ~~**Type/import cleanup**~~ — no `any` left in `src/`; keep it that way.

### P1 — design-complete screens

1. ~~Audio category + player~~ — done: `audio` item kind (index schema v3, with a
   migration that re-files v2 audio from its mime), category tile, an
   audio-only import row, and a player in the viewer.
2. Bulk share/export in select mode (single-file share from the viewer now ships via `expo-sharing`).
3. ~~Setup-secret visual pass~~ — done: gradient badge, digit counter, the
   recovery warning the design canon asks for, and a biometric opt-in.
4. Premium receipt verification against the store (backend optional; the silent launch sync covers reinstall/device changes).
5. ~~**Viewer swipe pager**~~ — done: the grids record the list they were
   showing (`lib/vault-browse.ts`) and the viewer pages through it; a video
   that is swiped away stops playing immediately.

### P2 — hardening & ops

- ~~Instrument startup/unlock timing on release builds~~ — done: `lib/perf.ts`
  records the marks (app ready, unlock start/done, index loaded, setup done)
  and Settings → Performance shows them, so a release build can be measured on
  a real device where the debug logs are gone.
- ~~Android backup~~ — done: `plugins/with-vault-backup.js` replaces the
  backup rules with a merged set that excludes the vault directory and the
  SecureStore preferences from both cloud backup and device-to-device
  transfer. The master key is device-bound, so a copied vault would be
  unreadable anyway.
- ~~iOS build config + EAS profiles~~ — done: `ios.bundleIdentifier`,
  `supportsTablet` and `ITSAppUsesNonExemptEncryption` in `app.json`, plus
  `eas.json` with `development` / `preview` / `production` profiles.
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

## 9. Repository state (as of 2026-11-11)

The tree is clean. Recent commits:

- `1b1e3fc` — premium, launcher disguise, native PBKDF2 (Android), reminders, sharing.
- `205d0e2` — redesign wave.
- `5834a34` — first build done.

The latest wave (P0 performance pass) added:

- **New:** `modules/vault-crypto/ios/` (CommonCrypto PBKDF2), `lib/crypto/pbkdf2.ts`
  (+ known-answer tests), `components/vault/zoomable-image.tsx`.
- **Modified:** `vault-secret.ts` (single derivation entry point, concurrent code change),
  `setup-secret.tsx` (keep the first code on mismatch, digit counter, spinner),
  `item-tile.tsx` (memoized with a field comparator), `thumbnail.tsx` (no render-time
  filesystem stat, placeholder instead of spinner), `vault-store.ts` (separate thumbnail
  decryption budget, pipelined import), the three grid screens (stable callbacks),
  `_layout.tsx` (`GestureHandlerRootView`).

Verified on this wave: `tsc --noEmit`, `expo lint`, 49/49 unit tests,
`expo export --platform android` (2141 modules) and
`gradlew :vault-crypto:compileDebugKotlin` (BUILD SUCCESSFUL).
