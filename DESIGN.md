# HideMe — Design Specification

> **Calculator. Vault. Your Privacy.**
> Source: design board (marketing presentation + 14 screens + design system).
> This document is the canonical reference for UI/design work in this repo.

---

## 1. Brand

| Item | Value |
|---|---|
| App name (store/UI) | Calculator (disguise) / HideMe (internal & marketing) |
| Tagline | Calculator. Vault. Your Privacy. |
| Positioning | A smart calculator that hides private photos, videos, files — in an encrypted, offline vault. |
| Voice | Short, confident, privacy-first. "Simple outside. Secure inside." / "100% Local — No Cloud. No Account. No Tracking." |
| Logo | Rounded square, indigo→violet gradient, `+ −` math glyphs fused with a padlock |
| Hero claims | Photos & Videos · Documents & Files · PIN & Biometric Lock · Offline & No Cloud · Auto Lock · No Accounts/No Tracking · Clean & Modern UI |

### Rule zero — the disguise
The calculator surface must be **visually anonymous**: no "HideMe" name, no logo, no vault hints. It must be indistinguishable from a stock calculator. All branding lives *inside* the vault and marketing assets only.

---

## 2. Design Principles

1. **Disguise first** — anything visible outside the vault leaks the secret.
2. **Dark-first** — slate-dark surfaces; light theme is a parity mode, not the lead.
3. **Local & trustworthy** — no cloud metaphors; transparency UI (timers, counts, lock state) builds trust.
4. **Value-exchange ads** — rewarded ads pause auto-lock; ads never cover destructive/selection actions.
5. **Thumb-zone primary** — full-width CTAs bottom-anchored; keypad and grids large-target.
6. **Consistent gradient language** — one indigo→violet gradient for identity moments (logo, FAB, hero, primary buttons).

---

## 3. Design Tokens

### Color

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#6366F1` | CTAs, active tabs, operator keys, links |
| `secondary` | `#8B5CF6` | Gradients, accents, highlights |
| `success` | `#10B981` | Unlock success, confirmations |
| `warning` | `#F59E0B` | Premium/crown, caution states |
| `error` | `#EF4444` | Delete, lockout, failures |
| `surface` | `#0F172A` | Base background (slate-900) |

**Derived (dark mode):**
- Elevated surface / card: `#1E293B` (slate-800)
- Border/divider: `#334155` (slate-700)
- Primary text: `#F8FAFC` (slate-50)
- Secondary text: `#94A3B8` (slate-400)
- Keypad number key: `#1E293B`; operator key: `primary`; equals: gradient `primary → secondary`

**Category tile palette (vault home):**

| Category | Color |
|---|---|
| Photos | Violet `#8B5CF6` |
| Videos | Blue `#3B82F6` |
| Documents | Emerald `#10B981` |
| Audio | Pink `#EC4899` |

**Light mode:** white/near-white surfaces (`#FFFFFF`, `#F8FAFC`), same indigo accents, slate-900 text.

### Typography — Inter (or system-equivalent)

| Style | Size / Weight |
|---|---|
| Display (countdown, result) | 40 / 700, tabular numerals |
| Heading L | 24 / 700 |
| Heading M | 20 / 600 |
| Heading S | 18 / 600 |
| Title | 16 / 600 |
| Body | 16 / 400 |
| Body S | 14 / 400 |
| Caption | 12 / 400 |
| Micro | 10 / 500 |

- Calculator result: right-aligned, scales down as digits grow.
- Use tabular figures for timers, item counts, calculator display.

### Iconography
Line style, consistent 1.5–2px stroke, rounded caps. Required set:
- **Secure:** shield, lock, fingerprint, crown (premium)
- **Media:** image, play/video, music note
- **Files:** document, folder, file-generic
- **System:** home, grid/files, gallery, settings, search, share, delete, more, back, plus

### Shape & Spacing
- Card radius: **16**; buttons: **12–14**; keypad keys / FAB: **circular**
- Grid: 4pt base; screen padding **16**; section gap **24**; card padding **16**
- FAB: 56dp, bottom-right, above tab bar; must not obscure last grid row

### Motion
- Unlock transition: success check → fade/slide into vault (interstitial slot, max 1/24h)
- Countdown: per-second tick, no layout shift
- Select-mode: banner + interstitials **disabled** instantly

---

## 4. Navigation

```
Root Stack
├── onboarding            (first run, marketing/trust story)
├── setup-secret          (create PIN + biometric opt-in)
├── calculator-disguise   (the only "outside" screen)
└── vault (guarded stack — redirects to calculator unless unlocked)
    ├── index             Vault Home
    ├── folder/[id]       Folder view
    ├── item/[id]         File preview
    ├── bin               Recently Deleted
    └── settings          Settings
```

**Design-board variant (proposed target):** bottom tab bar inside the vault — **Home · Files · Gallery · Settings** — with FAB for import. Reconcile with the stack model before implementation (see §8).

**Guard rules:** `PrivacyShield` (screenshot + app-switcher blocking) active on all vault routes while unlocked; auto-lock on background per user threshold.

---

## 5. Screen Specifications

### 5.1 Calculator (Disguise) — outside
- Anonymous dark calculator. Display top-right: expression line + result (`256 × 4` → `1,024`).
- Keypad 4×5: `C · % · ± · ÷` / `7 8 9 ×` / `4 5 6 +` / `1 2 3 −` / `0 . ⌫ =` (no duplicate keys).
- Number keys: circular, elevated slate; operators: primary; `=`: gradient.
- **Secret entry:** typing the secret numeric code then `=` triggers unlock; optional biometric prompt on success.
- States to design: empty, typing, computed, error (div-by-zero), long-number shrink, biometric prompt.

### 5.2 PIN / Biometric
- Padlock glyph, "Enter your PIN", 4+ dot indicator (supports 6–12 digits), 3×4 keypad, fingerprint button.
- States: default, mid-entry, **wrong PIN + lockout backoff countdown** (3 free attempts → 15s…15min), biometric fallback.

### 5.3 Vault Home
- Header: HideMe icon + title, search icon → inline search bar ("Search your files…", debounced).
- 2×2 category tiles: Photos / Videos / Documents / Audio — icon, name, item count.
- "Folders" list rows: name + item count + chevron.
- FAB `+` → import sheet. Tab bar: Home · Files · Gallery · Settings.
- States: empty vault (illustration + CTA), loading skeletons, search results.

### 5.4 Media Gallery
- Header: back, title, **Select** action. Filter chips: All · Photos · Videos.
- Responsive grid/masonry; video tiles show duration badge (`0:15`).
- Long-press or Select → multi-select mode (see 5.11).

### 5.5 Import Files
- Header: back + "Import Files". Search ("Search documents…").
- Source rows, each icon + title + subtitle:
  - Photos & Videos — From your photo library
  - Audio — MP3, WAV, etc.
  - Documents & other files — PDF, TXT, ZIP, APK, etc.
- Import shows a **progress modal** (per-file %, cancelable). Completion: toast/summary.
- **Cancel** (implemented): the modal carries a Cancel button while the batch runs.
  - *Importing* — progress bar, per-file %, current file name, **Cancel** enabled.
  - *Cancelling* — the button is disabled and reads "Cancelling…". The modal stays up
    until the cleanup finished; it is never dismissed early.
  - *Cancelled* — "Import cancelled" plus how many files made it into the vault,
    then **Done**. The files that were imported before the cancel are kept.
  - *Completed* — "Import complete" plus the number of files added, then **Done**.
  - *Failed* — the error, plus how many files were kept, then **Done**. Retrying is safe.
- Repeated taps on Cancel change nothing. Leaving the screen stops the batch at
  the next checkpoint; backgrounding the app does **not** cancel it.

### 5.6 Settings
- Section **Security** (fix typo "Securitory"):
  - Change PIN (opens confirm-current-PIN modal)
  - Biometric Unlock (switch)
  - Auto Lock (value: Immediately / 30s / 1min / 5min)
  - Notifications (switch — only if a real local-notification purpose exists)
  - About HideMe
- Section **Appearance:** Theme (System / Light / Dark)
- Bottom: premium/upgrade banner (crown, "Keep your data safe — Upgrade to Premium")
- Danger zone: **Erase all data** with typed confirmation (from current app; not on board).

### 5.7 Rewarded Ad — Pause Auto-lock
- Bottom sheet: close X, gradient gift badge, headline "Pause auto-lock for 1 hour", body
  "Watch a short ad and keep your vault unlocked for 1 hour.", safety note, **Watch ad · 1 hour free**,
  Maybe later.
- States: watching (native full-screen ad behind the sheet), success (green check + live `mm:ss`
  countdown), closed/unavailable (inline message, retry). Premium skips the sheet and grants instantly.
- On reward: the 1h pause starts and is reflected on the Auto Lock Timer screen.

### 5.8 Auto Lock Timer
- Header: back. Shield glyph. "Vault will lock in" + **large countdown `00:59:23`**.
- Helper: "Keep using the app to reset the timer."
- Button: **Lock Now** (full-width primary).
- States: counting down, paused-via-reward (show badge "Paused — 42:10 left"), paused-by-user.

### 5.9 Unlock Success
- Centered green check, "Welcome back!", "Your vault is now unlocked.", **Continue** button.
- Interstitial allowed here, capped **1 per 24h**; never in select mode.

### 5.10 File Preview
- Immersive black stage; a floating top chrome (back · filename · `type · size · dimensions · date` ·
  more) fades out while a video plays and comes back on pause; photos toggle it on tap.
- Video: never autoplays — first frame + "Tap to play", then native controls with fullscreen.
- Document: centred card with type icon, size/date and **Open document** (system preview sheet).
- Decryption owns the whole stage: percentage, pass label (verify → decrypt) and a thin progress bar.
- Header: filename + pager `1/5`; a sideways swipe on a photo pages to the neighbour (the gesture inside
  the page takes the touch, so the photo reports the swipe and the gallery moves the list), and at 1× only —
  a zoomed photo pans instead.
- Photos zoom: pinch (1×–4×), double-tap to toggle, clamped so the image cannot be dragged out of frame.
- Share/Delete live in the More sheet (Delete = move to bin); a persistent bottom bar (Share · Delete ·
  More) is still pending, P2.

### 5.11 Select Mode
- Header: back + "Select Items" + "N selected".
- Grid with checkmarks/selection rings. **Banner hidden, interstitials disabled.**
- Bottom action bar: Share · Delete · More (Move, Select all, Cancel).
- Destructive actions require confirmation.

### 5.12 Premium
- Crown glyph, "Go Premium", benefit checklist:
  - Remove all ads
  - Unlimited file storage *(reword — conflicts with "100% Local"; e.g., "Unlimited vault organization")*
  - Advanced security
  - Priority support
- Price: **$2.99 / Lifetime**. Button: **Get Premium**. Restore purchase link.

### 5.13 Privacy First (trust screen)
- Shield/lock glyph, **"100% Local"**, "No Cloud. No Account. No Tracking.", "Your privacy is our priority."
- Use in onboarding and/or Settings footer.

### 5.14 Onboarding / Setup (missing from board — required)
- Onboarding: 3 swipeable slides (disguise → vault → no-recovery) with gradient icon badges, dot pager,
  Skip and a single **Continue / Set up my code** CTA; closes into setup.
- Setup Secret: create 6-12 digit code + confirm step + biometric opt-in + "choose something memorable, it cannot be recovered" warning.

---

## 6. Component Inventory

| Component | Notes |
|---|---|
| `calc-key` | Circular key; variants: number / operator / equals / function |
| Category tile | Gradient/solid color, icon, label, count |
| List row | Icon + title + subtitle + trailing (chevron/switch/value) |
| Search bar | Debounced, inline-expandable |
| Filter chips | Single-select, pill, active = primary |
| FAB | 56dp, gradient, bottom-right |
| Tab bar | 4 tabs, active = primary + label |
| Bottom sheet / action sheet | Import sources, item "More" actions |
| Modal (confirm / name-prompt / progress) | Reused for delete, rename, import, change-PIN |
| Selection bar | Bottom, N selected, destructive styling for Delete |
| Toggle switch | Primary when on |
| Premium banner / crown card | Warning-tinted accent |
| Countdown display | Tabular, display size |
| Privacy shield overlay | Transparent; blocks screenshots/app-switcher |
| Ad banner | Collapsible; hidden in select mode |

---

## 7. Accessibility & Quality Bars

- Contrast ≥ 4.5:1 for body text on `surface`; secondary text ≥ 4.5:1 on cards.
- Touch targets ≥ 44×44dp; keypad keys ≥ 56dp.
- Support dynamic font scaling without clipping countdown/calculator display.
- Both themes must pass contrast; respect `prefers-reduced-motion`.
- Never rely on color alone for category/status (always pair with icon/label).

---

## 8. Known Issues / Open Decisions

**Fix (design errors):**
1. Calculator header must not show "HideMe" branding (§1 Rule zero).
2. Typo "Securitory" → **Security**.
3. Board numbering skips screen 5.
4. Mockup keypad has duplicate/incorrect keys (`% %`, `0 0`, `÷ × + ÷`).

**Reconcile with implementation:**
- Bottom tab bar (board) vs. current stack-only navigation.
- Audio category/player — not implemented.
- ~~Premium paywall ($2.99 lifetime)~~ — implemented: `/vault/premium` with store price, restore, local entitlement.
- ~~Auto Lock Timer countdown screen~~ — implemented: `/vault/auto-lock` (policy, live pause countdown, lock now).
- Gallery filter chips — not implemented.
- ~~Notifications toggle~~ — implemented: daily 09:00 cleanup reminder while the bin is non-empty (`lib/reminders.ts`).
- Launcher disguise (§5.x) — Calculator/Notes/Photos/Weather/Music icons, hide-all, dial-code restore. Not in the board; add a spec.
- Design board lacks: onboarding, setup-secret, folder detail, bin, lockout state, import progress, erase-all confirm — all exist (or are required) in code and need design coverage.
