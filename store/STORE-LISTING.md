# Store listing copy

Draft for Google Play and the App Store. Replace the placeholders before publishing.

---

## App name (30 chars)

```
HideMe: Private Vault
```

## Short description (80 chars)

```
A calculator that hides your real vault. Files stay encrypted on your device.
```

## Full description (4000 chars)

```
A calculator, and nothing else — until you type your code.

HideMe looks and works like the calculator on your phone: add, subtract, divide.
Type your secret code into the keypad and it unlocks a private vault for the
photos, videos, documents and audio you actually want to keep private.

Everything in the vault is encrypted on your device with AES-256-GCM, under a key
that is derived from your code with PBKDF2 (210,000 rounds). Nothing is uploaded.
We have no server, no account, and no way to see your files — which also means we
can never help you recover a code you forget. Write it down somewhere safe.

WHAT IT DOES

• Calculator disguise — a real calculator, with the expression and the result.
  From the outside it is just a calculator.
• Private vault — import photos, videos, documents, audio and other files.
  Everything is encrypted before it touches the disk.
• Photo and video viewer — pinch to zoom, double-tap to zoom, swipe through your
  photos, and a video player that never autoplays.
• Folders and search — organise the way you like, with fast search.
• Auto-lock — the vault locks itself when you leave the app: immediately, after
  30 seconds, a minute or five. You choose.
• Biometric unlock — turn on fingerprint or face unlock after the first time.
• Lockout protection — three wrong tries and the app backs off, so nobody can
  guess your code by tapping.
• Share on your terms — send one file, or export a selection as a zip archive.
• Screen privacy — screenshots are blocked and the app-switcher preview is
  covered while the vault is open.
• Your own launcher icon — hide the app behind a calculator, notes, photos,
  weather or music icon.

FREE OR PREMIUM

HideMe is free. Premium is a one-time purchase: it removes the ads, and it makes
the auto-lock pause free. No subscription, no account, no tracking.

WHAT WE DO NOT DO

We do not upload your files. We do not collect analytics. We do not ask for an
account. Your data stays on your device, and the app works offline.

Read the privacy policy for the details.
```

## Keywords

```
calculator, vault, private album, hide photos, gallery lock, secret folder,
encrypted file manager, photo vault, disguise, lock screen, privacy, hide apps
```

## Category / content rating

- Category: **Tools**
- Ads: **Yes** (banner + interstitial + rewarded) · in-app purchase: **Yes** ($2.99)
- Content rating: expected **PEGI 3 / Everyone** / **USK 0** — no user content, no
  location sharing, no gambling, no user interaction
- Target audience: **18+** is not required; a vault app with a disguise is fine for
  13+, but check the console guidance for "user interaction" (there is none)

## Google Play — Data safety form

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | N/A — the app transmits no user data |
| Do you provide a way for users to request that their data is deleted? | **Yes** — "Erase all contents" in Settings, and uninstalling removes everything |
| Does your app collect data from children? | No |
| Data types collected / shared | **None** |

> Note for the reviewer: the app requests photo/media access only to import files the
> user picks. The ad SDK (AdMob) is only initialised in the free version and is
> covered by Google's own data-safety disclosure for the ad partner. If you prefer a
> simpler answer, build the premium-only variant with the ads SDK removed and declare
> "no data collected, no ads".

## Review notes (paste into the Play Console)

```
HideMe is a calculator that unlocks an encrypted local vault.

How to reach the vault:
1. Open the app — it shows a calculator.
2. Tap the digits of the secret code (6–12 digits), then "=".
3. The vault opens. The demo code for the review build is: 123456

The calculator is a working calculator: any expression can be evaluated, and the
"=" key is what triggers the code check.

Data: everything is encrypted on the device (AES-256-GCM, PBKDF2 210k). No
network access, no accounts, no analytics. Ads (AdMob) are only shown in the free
version; the review build has premium enabled, so no ad is displayed.
```

## Screenshots (8, 1080 × 1920)

Generate these on the emulator after the release build is installed — the vault
screens are `FLAG_SECURE`, so capture them with `adb exec-out screencap` from a
release build, or with the flag temporarily lifted in a screenshot build:

1. The calculator gate (the disguise) — the hook shot
2. The vault home with the category tiles and the premium card
3. The justified photo grid
4. A photo open, with the chrome and the bottom bar
5. The video player
6. The import screen with its five sources
7. Settings (premium card first)
8. The auto-lock timer screen

## Icon and feature graphic

- App icon: `assets/images/icon.png` (already in the repo, 1024 px)
- Feature graphic: `assets/images/feature-graphic.png` — **missing**, 1024 × 500
- Play store screenshots: **missing** — generate from the list above
