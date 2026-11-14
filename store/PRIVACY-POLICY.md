# Privacy Policy

**HideMe — Private Vault & Calculator**

Last updated: 14 November 2026

## The short version

HideMe stores your files encrypted on your device. Nothing is uploaded, nothing is
collected, and we cannot see your files, your photos or your code.

## What the app stores, and where

| What | Where | Why |
|---|---|---|
| Your files (photos, videos, documents, audio) | Encrypted inside the app's private storage on this device | Only you can decrypt them, with your secret code |
| Your secret code | Never stored — only a salted, stretched hash of it, and a copy of your master key wrapped with it | So the code itself cannot be recovered from the device |
| Your master key | In memory while the vault is unlocked, in the device keychain if you enable biometric unlock | The key has to be reachable to decrypt your files |
| The vault index (file names, types, sizes, dates) | Encrypted, in the app's private storage | It lists your files; it is encrypted like they are |
| Settings, theme, auto-lock policy, premium state | The device's secure storage | Remembering your preferences |
| Launch count and a "show ads" counter | The device's secure storage | Deciding when an ad may be shown |

## What leaves the device

Nothing, unless you ask it to.

- **Sharing** — when you share a file or an export, the file is handed to the app you
  pick (messaging, mail, cloud drives…). That app then has its own copy, and its own
  privacy policy.
- **Ads** — the free version shows ads from Google AdMob. The ad SDK sends the usual
  device and ad-request data to Google (IP address, device identifiers, ad interactions).
  If you buy premium, no ad SDK is initialised at all.
- **Crash and diagnostics** — we do not collect them. The app works fully offline.

## Permissions, and why

| Permission | Why |
|---|---|
| Photos and videos | To import the files you choose into the vault |
| Camera | Only when you use "Take a photo" in the import screen |
| Notifications | Only for the optional reminder that Recently deleted still holds files. The reminder is generic and never names your files. |
| Biometrics | To unlock the vault with your fingerprint or face when you enable it |

Permissions are asked for at the moment they are needed, and every one of them can be
refused — the app stays usable.

## What we cannot do

- We cannot open your vault, recover your code, or restore your files. The encryption
  key is derived from your secret code on your device; there is no copy anywhere else.
- We cannot see your file names, previews or contents.
- We do not have a server, an account system or an analytics backend.

## Data removal

Uninstalling the app removes the vault, the index and the preferences from the device.
"Erase all contents" in Settings deletes every file and folder but keeps your secret
code. Files in Recently deleted are deleted permanently after 30 days.

## Children

HideMe is not directed at children under 13, and we do not knowingly collect data from
them — we do not collect any data at all.

## Changes to this policy

If this policy changes, the date at the top changes with it. Material changes will be
mentioned in the app's release notes.

## Contact

Questions about this policy: **privacy@hideme.app** (replace with a real address before
you publish the app).
