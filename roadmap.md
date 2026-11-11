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
      drag-to-pan in the photo viewer, with the photo clamped to the viewport.

## Open

- [ ] **2. fix all type object import issue** — no `any` left in `src/`; keep
      it that way when adding code.
- [ ] **4. fix all type object sizing** — audit image aspect ratios and tile
      dimensions; the grid is still a fixed square crop (`contentFit="cover"`),
      DESIGN.md asks for a responsive masonry grid that keeps the real ratio.
- [ ] Swipe pager between sibling items in the viewer.
- [ ] Audio category + player (extend `ItemKind`, import, tile, viewer).
- [ ] Bulk share/export in select mode (no zip / multi-file share yet).
- [ ] Setup-secret visual pass (onboarding slides are done).
- [ ] Store-side purchase verification (entitlement is local for now).

## Later

- [ ] Instrument startup/unlock timing on release builds.
- [ ] Exclude `files/vault/` from Android backup (manifest has `allowBackup="true"`).
- [ ] iOS build config + EAS profiles (`development`, `preview`, `production`).

<!-- complete reamining part -->
<!-- after this work on ui ux -->
