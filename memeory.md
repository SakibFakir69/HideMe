# App Memory - Calculator+Vault+App Hider (RE knowledge base)

> Persisted app details from static reverse engineering (REA 6.7.0 +
> jadx-headless-mcp 0.7.1). Companion docs: `RE-FINAL-REPORT.md` (full report
> with evidence IDs). Raw evidence: 96 JSONs in
> `C:\Users\hp\AppData\Local\Temp\opencode\hideme-re\`.

## Identity
- **Artifact**: `D:\All\dwonload\Calculator+Vault+-+App+Hider_3.16.7_249546e23_APKPure.xapk` (75.5 MB XAPK)
- **XAPK contents**: `com.app.calculator.vault.hider.apk` (base), `config.arm64_v8a.apk`, `config.xxhdpi.apk`, `icon.png`, `manifest.json`
- **Package**: `com.app.calculator.vault.hider` - versionName 3.16.7, versionCode 316070 (`249546e23` build tag)
- **Base APK**: 72,615,734 bytes, SHA-256 `1FD8D1476AE0AC81321932B91E6E7451B0EF206EDAD4F172AA841F65412DC96E`
- **App name** (store): "Calculator+Vault+ - App Hider"
- **minSdk 23 / targetSdk 36**, 35,344 classes, 2,291 resources, multidex (classes1..6+ seen; crypto in classes5, UI/vault in classes6)
- **Signature check**: not performed by tooling (`signature_verification: not_performed`)
- **Custom permission**: `com.app.hider.vault.helper` (signatureOrSystem) guards Gaia guest stubs + PermissionActivity

## Scale of permissions (198 total - notable)
- Storage/media: `MANAGE_EXTERNAL_STORAGE`, `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES/VIDEO/AUDIO`, `WRITE_MEDIA_STORAGE`, `QUERY_ALL_PACKAGES`
- Surveillance-adjacent: `CAMERA`, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `PACKAGE_USAGE_STATS`, `GET_TASKS`, `READ_CONTACTS`, `READ_CALENDAR`, `DETECT_SCREEN_CAPTURE`, `DETECT_SCREEN_RECORDING`, `USE_FINGERPRINT`
- Launcher spoofing: READ/WRITE_SETTINGS for ~30 OEM launchers (Huawei, Oppo, Vivo, Samsung, Qihoo, ADW, Apex, TSF, ...), `INSTALL/UNINSTALL_SHORTCUT`
- Persistence: `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, foreground services, `RUN_USER_INITIATED_JOBS`
- Ads/billing: `com.android.vending.BILLING`, Google Ad ID/AdServices, Facebook, C2DM
- Network: `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, NFC, Bluetooth (for ad SDKs)

## Manifest components (450 com.prism.* entries)
### Entry / disguise
- **17 activity-aliases**: `com.android.launcher3.icon_disguise*` + `icon_origin`; MAIN/LAUNCHER + category `com.prism.hider.vault.CATEGORY_VAULT_ENTRY` -> target `com.prism.hider.ui.UserTermsActivityGP` (all three UserTerms variants reference marker class `commons.u`)
- Entry chain: `UserTermsActivity(CN/GP|) -> SplashActivity -> LoadingActivity -> GuideSetupPinActivity` (first run) / `Calculator` (returning)
- `<meta-data name="is_vault_activity">` only on: `vault.calculator.Calculator`, `vault.calculator.VaultGateActivity`
- Other UI: `commons.ui.SetPinActivity` (singleInstance+noHistory, own taskAffinity), `hider.ui.SettingActivity`, `HowToHideActivity`, `GameActivity`, `ApkImportActivity`, `ApkAdActivity(V2)`, `DownloaderActivity`
- Debug backdoors: `com.prism.hider.debug.GALLERY` + `GalleryControlReceiver`, `GUEST` + `GuestControlReceiver`

### Vault core
- `vault.calculator.Calculator` (disguise lock screen), `vault.calculator.VaultGateActivity` (re-lock gate), `vault.commons.VaultProvider` (exported, authority `...vault.provider`, cert state authority)
- `lib.pfs` private file store: `PfsFileProvider`, `TempExportFileProvider`, `PreviewActivity`, `VideoPlayActivity` (content-side UI - not yet analyzed)

### Gaia virtualization (app hiding/cloning)
- 64 x each: `GuestActivityStub.Guest0..63(+R)`, `GuestServiceStub.Guest0..63`, `GuestDialogStub.Guest0..63(+R)`, `GuestInitializerProvider.Guest0..63` - all permission-gated
- Proxies: `Guest{JobService,Activity,Receiver,Service,Shortcut}Proxy`, `GuestStaticReceiverProxy`, `ResolverActivity`, `HostSupervisorChooserActivity`
- Services/providers: `gserver.SupervisorService`, `gserver.UnhideGuestService`, `SandboxedProcessServiceStub.Sandbox500` (isolated), `GaiaGuestContentProviderProxy` (supervisor process), `GProcessSupervisorProvider`, `GuestProcessTaskManagerProvider`, `Gaia32bit64bitProvider`, `DownloadProvider/Service`, `FileProviderHost/Proxy`
- Action `com.prism.gaia.action.IMPORT_APK`; debug `com.prism.hider.download.FileBridgeProvider`
- Gaia UI: `AppDetailsActivity`, `RunningProcessesActivity`, `EmptyActivity`

### Infrastructure
- Daemon: `daemon.foreground.DaemonAliveService(+.InnerService)` in `@string/daemon_process_name`
- `lib.notification.NotificationObserverService` (BIND_NOTIFICATION_LISTENER)
- `commons.activity.MainProcessProxyActivity`, `commons.ipc.MainProcessGServiceProvider`
- FusionAd SDK: `NativeInterstitialBaseActivity`, `WebViewInterstitialActivity`, `AdHistoryProvider` (signature)
- Ads SDKs present: AdMob/Google Ads, Meta FB, Unity Ads, Pangle (ByteDance 6.4.0.5), InMobi, Mintegral (mbridge), AppLovin-style mediation via fusionadsdk; Firebase (Crashlytics, Analytics, RemoteConfig); Play Billing 9.1.0

## Key classes (unlock system)
- `com.prism.hider.vault.calculator.Calculator` (+ inner `$a` TextWatcher = detector, `$CalculatorState`), `CalculatorVaultUI` (implements `commons.VaultUI`), `VaultGateActivity`, skins `p..v` (factories), `z`/`A`/`B` (eval engine, glyph map, VaultUI singleton)
- `sa.d` = secret store (fields `f227429a` stored code, `f227430b` = `u6.j<String>` KV); `sa.c` = gate verifier (CancellationSignal, synthetic callback `sa.c$c`)
- `com.prism.commons.utils.{y,g}` = digest/encoding utils (`y.m/h` = MD5 transform)
- `vault.commons`: `a` (+ lifecycle inner `C0695a`, delegate `a.b`), `B` (setup/cert flags), `f` (GlobalVaultListener holder `f156375b` + VaultUI holder `f156374a`), `p`, `y` (listener interface a/b/c), `z` (flag interface), `n` (grant bridge), `u` (decoy marker), `VaultUI`, `VaultProvider`, `N` (cross-package)
- `com.prism.hider.variant.b` = Dagger `VaultVariant` wiring (provides CalculatorVaultUI)

## Unlock chain (short form)
1. Launcher alias -> UserTerms -> ... -> `Calculator` (guard: `B.h().c()` or throw "Vault not setup")
2. Pad key sets flag `f156168o`; `Calculator$a.afterTextChanged` -> `sa.d.d(len)` gate + `sa.d.a(text)`
3. `sa.d.a`: `stored.equals(y.m(text))`; `y.m` = lowercase-hex(MD5(bytes(str))) with `Integer.toString(hashCode())` fallback; match -> `B.h().a()`
4. `m1()` -> (no extra `tag_not_need_jump_to_launcher`) -> `n1()`: `GlobalVaultListener.b()` (no-op impls) + `finish()`
5. Resume: `commons.a.C0695a.onActivityResumed` skips `instanceof commons.u` (UserTerms decoys) -> `commons.a.h`: if `isSetup && !certificated` -> "certificateVault failed, start vaultUI" -> `VaultUI.launchVault` (sole callsite) -> `CalculatorVaultUI.launchVault` -> `Intent(VaultGateActivity)` (same pkg or cross-pkg via `commons.N.c`)
6. Gate hosts skin fragment via registry `w` (7 skins: calc_classic/ios/material/casio/neu/minimal/glass -> `ClassicCalcSkinFragment` fallback); gate unlock `X0()` == `Calculator.n1()` (listener + finish)
7. Cert lifecycle: grant at `SetPinActivity.Z0` confirm -> `commons.y.c` -> `X9.h.b.c` -> `commons.n.b` (grantCertificate) -> `commons.a.b` -> `B.a()=true`; revoke/grant dispatched ONLY from `VaultProvider.call()` (offsets 90/102, methods `f156354h`/`f156353g`)

## Security observations
- Unlock crypto: unsalted MD5 hex, plaintext `u6.j` KV (backend unknown), 32-bit hashCode fallback -> brute-force trivial if KV readable (Critical per report W2)
- Unlock = finish() only, no startActivity -> content host unknown (in-fragment vs under-stack)
- GlobalVaultListener implementations all empty/delegate (extension seam only)
- Exported `VaultProvider` behind signature permission `com.app.hider.vault.helper`

## Processes (from manifest)
- Main app process; `@string/supervisor_process_name` (Gaia content proxy); `@string/daemon_process_name` (daemon); `:guest0..:guest63` (guest sandboxes); `Sandbox500` isolated process

## Tooling facts (for future sessions)
- Every REA command needs env inline (fresh shell): `$env:REA_JADX_MCP_JAR="$HOME\.local\share\rea\android\jadx-headless-mcp-0.7.1-all.jar"; $env:REA_JADX_OPERATION_TIMEOUT_MS='900000'`
- Use `npx -y rea-agents@6.7.0 <cmd> <apk> ... --format json | Out-File <file> -Encoding utf8` (PS `>` writes UTF-16 - unreadable by Read tool)
- Full report with all 74 evidence IDs: `RE-FINAL-REPORT.md` in this folder

## Open unknowns
1. Vault content host (skin fragment vs under-stack activity)
2. Who revokes cert (`VaultProvider.call(f156354h)` senders)
3. `u6.j` storage backend (SP vs MMKV)
4. `sa.d.d(int)` allowed length values
5. Writer of `commons.f.f156375b`
6. `sa.c` verifier internals (`sa.c$c` unresolved)
7. Not analyzed: pfs content crypto, Gaia internals, icon switching, daemon logic, ad/telemetry, native libs
