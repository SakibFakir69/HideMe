# Roadmap

Perf / polish punch list. Ordered by impact.

## Done

- [x] **1. fix pin set up enter pin (fast, and simple)** — iOS now derives PBKDF2
      natively through CommonCrypto (Android already used the platform
      provider), so setup/unlock is ~1 s instead of tens of seconds. Changing
      the code runs both derivations concurrently. The setup screen keeps the
      first code when the confirmation does not match, so only the second entry
      has to be retyped.
- [x] **3. fix instant show** — the grid renders a sized placeholder instead of
      a spinner, the thumbnail no longer stats the filesystem during render,
      and the photo viewer paints the decrypted frame without a layout jump.
- [x] **5. fix lagy problem** — grid tiles are memoized (renames/moves still
      update), thumbnail decryption has its own concurrency budget, and import
      overlaps thumbnail building with the next file's encryption.
- [x] **6. enc/dec make more faster** — native PBKDF2 on Android 8+ and iOS,
      JS fallback produces identical bytes (pinned by known-answer tests).
- [x] **7. view show perfect way** — pinch-to-zoom, double-tap zoom and
      drag-to-pan in the photo viewer, with the photo clamped to the viewport,
      plus a swipe pager through the items the grid was showing.
- [x] **4. fix all type object sizeing** — the grid re-measures when the
      window changes size (multi-window, foldable, tablet split view), and
      the list is actually constrained to `MaxContentWidth` so the tiles fill
      their cells on wide displays. The grid is still a fixed square crop
      (`contentFit="cover"`); DESIGN.md asks for a responsive masonry grid
      that keeps the real ratio.

## Open

- [ ] **2. fix all type object import issue** — no `any` left in `src/`; keep
      it that way when adding code.
- [ ] Masonry grid that keeps the real photo aspect ratio.
- [x] Audio category + player — `audio` item kind (index schema v3 with a
      migration), category tile, audio-only import row and a player in the
      viewer.
- [ ] Bulk share/export in select mode (no zip / multi-file share yet).
- [x] Setup-secret visual pass — gradient badge, digit counter with pending
      slots, the "choose something memorable, it cannot be recovered" warning
      the design canon asks for, and a biometric opt-in that fills the
      Keychain/Keystore slot while the master key is in memory.
- [ ] Store-side purchase verification (entitlement is local for now).

## Later

- [ ] Instrument startup/unlock timing on release builds.
- [x] Exclude `files/vault/` from Android backup — the vault directory and the
      SecureStore preferences are excluded from cloud backup and device-to-
      device transfer (`plugins/with-vault-backup.js`).
- [x] iOS build config + EAS profiles (`development`, `preview`, `production`).

<!-- complete reamining part -->
<!-- after this work on ui ux -->
