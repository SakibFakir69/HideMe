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
- [x] **6. enc/dec make more faster** — native PBKDF2 on Android 8+ and iOS, the
      Android module derives it itself on Android 7 and older (the JS fallback
      took minutes per unlock), and every implementation produces identical
      bytes (pinned by known-answer tests).
- [x] **7. view show perfect way** — pinch-to-zoom, double-tap zoom and
      drag-to-pan in the photo viewer, with the photo clamped to the viewport,
      plus a swipe pager through the items the grid was showing.
- [x] **4. fix all type object sizeing** — the grid re-measures when the
      window changes size (multi-window, foldable, tablet split view), the
      list is constrained to `MaxContentWidth`, and the media gallery uses a
      justified grid that keeps the real photo ratio instead of a square crop.

## Open

- [ ] **2. fix all type object import issue** — no `any` left in `src/`; keep
      it that way when adding code.
- [x] Masonry grid that keeps the real photo aspect ratio — the media gallery
      uses a justified grid whose rows fill the width and keep the real ratio
      of every photo.
- [x] Audio category + player — `audio` item kind (index schema v3 with a
      migration), category tile, audio-only import row and a player in the
      viewer.
- [x] Bulk share/export in select mode — the selection bar shares the
      selected items as a zip archive, written by a dependency-free ZIP writer.
- [x] Setup-secret visual pass — gradient badge, digit counter with pending
      slots, the "choose something memorable, it cannot be recovered" warning
      the design canon asks for, and a biometric opt-in that fills the
      Keychain/Keystore slot while the master key is in memory.
- [x] Store-side purchase verification — the client checks a purchase against
      a verification endpoint when one is configured; only an explicit
      rejection revokes the entitlement. A backend is still needed to make it
      bite.

### Gaps against DESIGN.md

- [x] **Cancelable import** (§5.5 asks for it) — done. The batch runs behind a
      per-job cancellation token: the file being encrypted is written to a
      `.partial` blob and only moved into place when it is whole, the files
      imported before the cancel are kept, the interrupted file leaves nothing
      behind, and the index is written once with the result. The modal
      distinguishes importing / cancelling / cancelled / completed / failed.
- [x] **Import completion summary** (§5.5) — done: a toast reports how many
      files were added, and it survives the screen that raised it.
- [x] **Import source rows** (§5.5 lists four: Photos & Videos / Documents /
      Audio / Other Files) — done: the screen offers five rows, including
      "Take a photo" and a separate "Other files" picker.
- [x] **Import from the camera** — done: the "Take a photo" row opens the
      camera and encrypts the result like any other import.
- [x] **The auto-lock kills imports that use a system picker** - the photo and
      document pickers run in their own activity, so the app is backgrounded
      while they are open, and the vault locked before the user came back.
      Fixed with a bounded picker grace: opening a system picker arms a
      five-minute, one-shot window in which the auto-lock does not fire, so
      "Immediately" no longer makes importing impossible. Leaving the picker
      for longer than the grace still locks.
- [x] **Erase-all with a typed confirmation** (§5.6) — done: the destructive
      button only unlocks when the word ERASE is typed.
- [x] **Share in select mode** (§5.11 wants Share · Delete · More) — done: the
      selection bar shares the selected items as a zip archive.
- [x] **Persistent bottom bar in the file preview** (§5.10, Share · Delete ·
      More) — done: the preview has the bar, and it fades with the chrome.
- [x] **Loading skeletons** (§5.3) — done: the grids draw breathing skeleton
      tiles while the index loads.

## Later

- [x] Instrument startup/unlock timing on release builds — the marks show up in
      Settings → Performance.
- [x] Exclude `files/vault/` from Android backup — the vault directory and the
      SecureStore preferences are excluded from cloud backup and device-to-
      device transfer (`plugins/with-vault-backup.js`).
- [x] iOS build config + EAS profiles (`development`, `preview`, `production`).
- [ ] Tests for the store's filesystem calls (needs a filesystem fake; the
      pure parts are covered already).

<!-- complete reamining part -->
<!-- after this work on ui ux -->
