# Reverse Engineering Final Report

**Target**: `Calculator+Vault+-+App+Hider_3.16.7_249546e23_APKPure.xapk`
-> base APK `com.app.calculator.vault.hider` v3.16.7 (316070), 72,615,734 bytes,
SHA-256 `1FD8D1476AE0AC81321932B91E6E7451B0EF206EDAD4F172AA841F65412DC96E`,
35,344 classes, 2,291 resources, minSdk 23 / targetSdk 36.

**Method**: REA (`rea-agents@6.7.0` CLI) + `jadx-headless-mcp` 0.7.1
(SHA-256 `6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`).
96 evidence JSONs in `C:\Users\hp\AppData\Local\Temp\opencode\hideme-re\`
(full `evidence_id` per file; ledger in section 4).

**Claim discipline**: all findings are **static analysis** - no code was executed,
no runtime observation, no emulator. Tags used below:
**[O]** observation (shown verbatim in decompiled source/manifest),
**[I]** inference (logical conclusion), **[U]** unknown/unresolved.

---

## 1. The full unlock chain

### Phase A - Disguised entry
1. **[O]** No conventional MAIN activity; 17 `activity-alias` entries
(`com.android.launcher3.icon_disguise*` / `icon_origin`) carry MAIN/LAUNCHER +
custom category `com.prism.hider.vault.CATEGORY_VAULT_ENTRY` and target
`com.prism.hider.ui.UserTermsActivityGP`. *(pkg)*
2. **[O]** Only two components are tagged `<meta-data name="is_vault_activity">`:
`vault.calculator.Calculator` and `vault.calculator.VaultGateActivity`. *(pkg)*
3. **[O]** Manifest entry chain: `UserTermsActivity(CN/GP) -> SplashActivity ->
LoadingActivity -> GuideSetupPinActivity` (first run) / `Calculator` (returning);
`SetPinActivity` = singleInstance + noHistory + separate taskAffinity. *(pkg)*

### Phase B - Detection (the secret code)
4. **[O]** `Calculator.onCreate` guards `if (!commons.B.h().c(this)) throw
IllegalStateException("Vault not setup")` and attaches a TextWatcher created in
`Calculator.<init>` (field `f156154a = new Calculator$a(this)`).
*(m-onCreate, m-init)*
5. **[O]** `Calculator.onButtonClick` sets flag `f156168o = true` on pad-key
input; routes: number/dot -> append, `=` -> `h1()`, backspace -> `g1()`,
clear -> `f1()`. *(m-onButtonClick, m-h1, m-g1, m-f1)*
6. **[O]** The `=` path is pure math, NOT the unlock decision: `h1()` ->
state INPUT->EVALUATE -> `z.a` -> `z.b(expr, cb)` evaluates via
`org.javia.arity.Symbols` -> callback `Calculator.g0` updates the display only.
*(m-zb, m-g0)*
7. **[O] THE DETECTOR** - `Calculator$a.afterTextChanged`:
   ```java
   if (Calculator.this.f156168o                 // a pad key appended text
       && editable != null
       && sa.d.d(editable.length())             // allowed-length gate (values [U])
       && sa.d.b(Calculator.this).a(editable.toString())) {  // <- secret match
       Calculator.this.m1();                    // <- unlock trigger
   }
   ... l1(INPUT); f156159f.a(editable, this);   // normal re-eval for display
   ```
   *(m-a-after; sa.d fields/methods: class-sad)*
8. **[O] THE COMPARISON** - `sa.d.a(String)`:
   ```java
   String norm = com.prism.commons.utils.y.m(str);
   boolean match = f227429a != null && f227429a.equals(norm);  // stored vs typed
   if (match) B.h().a();
   return match;
   ```
   `f227429a` = in-memory stored secret, loaded by `sa.d.e`
   (`f227429a = u6.j.h(ctx)`). *(m-sada, m-sad-e, class-sad)*

### Phase C - Trigger -> transition
9. **[O]** `Calculator.m1()`: if intent lacks extra
`tag_not_need_jump_to_launcher` -> `n1()`, else log + `finish()`. *(m-m1)*
10. **[O]** `Calculator.n1()`: resolve `commons.f.f156375b`
("GlobalVaultListener"), call `.b(this)` if non-null (else log
"GlobalVaultListener Not Found"), then **`finish()`**. *(m-n1)*
11. **[O]** Listener implementations are functionally empty: complete incoming
trace of interface `commons.y` found exactly three implementors -
`commons.c.b` empty, `X9.h.b.b` empty, `commons.a.b.b` a null-guarded delegate
to another `y`. No `startActivity` is reachable from `n1` via the listener.
*(trace-cy2, m-cc-b, m-x9hb-b, m-cab-b)*

### Phase D - Lifecycle-driven vault opening
12. **[O]** ActivityLifecycleCallbacks hook
`commons.a.C0695a.onActivityResumed(Activity)` skips activities
`instanceof com.prism.hider.vault.commons.u` (log "skip vaultGhostUIActivity")
and otherwise calls `a.this.h(activity)`. The decoy launcher-target activities
`UserTermsActivity/CN/GP` reference `commons.u`.
*(m-resume, trace-cah, class-cu, trace-cu)*
13. **[O]** `commons.a.h(Activity)` ("certificateVault"): reads
`isSetup = commons.B.c(ctx)` (persisted `u6.j<Boolean>`) and
`certificated = commons.B.e(ctx)` (in-memory field `f156320a`), locally or via
remote `VaultProvider`; if `isSetup && !certificated` it logs
"certificateVault failed, start vaultUI" and invokes
`c(activity).launchVault(activity)`. *(m-cas-h, m-B-c, m-B-e)*
14. **[O]** `VaultUI.launchVault(Context)` has exactly ONE incoming call in the
whole APK (dex-level INVOKE_INTERFACE, classes6.dex offset 126): `commons.a.h`.
*(trace-ivaultui)*
15. **[O]** `CalculatorVaultUI.launchVault(Context)`: package check via
`commons.f.f156374a.b()`; same package -> `startActivity(new Intent(ctx,
VaultGateActivity.class))`, else cross-package via `commons.N.c(...)`.
*(m-launchVault)*
16. **[O]** `VaultGateActivity` is referenced only by `CalculatorVaultUI`.
*(trace-gate)*
17. **[O]** `VaultGateActivity.onCreate`: same "Vault not setup" guard, then
commits fragment `V0()`; `V0()` resolves a skin id from the intent extra or
`w.b().d(this)` and returns `w.a(id)`. *(m-gate-create, m-gate-V0)*
18. **[O]** `w` is a calculator-skin registry: `<clinit>` registers 7 entries
`calc_classic, ios, material, casio, neu, minimal, glass` -> factories
`calculator.p..v`; `w.a(id)` falls back to `new ClassicCalcSkinFragment()`;
`p.create()` -> `new ClassicCalcSkinFragment()`.
*(class-w, m-w-clinit, m-w-a, m-skinp)*
19. **[O] Both unlock surfaces end identically** - `VaultGateActivity.X0()`
== `Calculator.n1()`: extra `tag_not_need_jump_to_launcher` -> log + finish();
else `GlobalVaultListener.b(this)` + **`finish()`**. *(m-gate-X0 vs m-n1)*
20. **[I]** Neither unlock surface calls `startActivity`; hidden content is
therefore revealed either by `finish()` exposing an activity underneath, or by
an in-fragment UI swap inside the skin fragment. Which holds at runtime:
**[U]** (content host not yet identified).

### Phase E - Session certificate (when the gate re-opens)
21. **[O]** `commons.B` state: `b(ctx, Z)` persists the setup flag
(`u6.j<Boolean>.n`); `a()` sets `f156320a = true` (logs `VaultProvider.f156353g`);
`d()` sets it false (logs `VaultProvider.f156354h`).
*(m-cB-b, m-cB-a, m-cB-d, class-commonsB)*
22. **[O]** `a()` and `d()` are invoked ONLY from `VaultProvider.call()`
dispatch (dex offsets 102 / 90): certificate state is authoritative vault-side
in an exported provider (authority `...vault.provider`).
*(trace-cz-a, trace-cz-d, pkg)*
23. **[O]** Grant path: `SetPinActivity.Z0` (PIN-confirm dialog) ->
`commons.y.c(Context)` (sole external callers: `SetPinActivity.Z0` and
delegate `commons.a.b.c`) -> `X9.h.b.c` -> `commons.n.b` (grantCertificate,
sole bridge, zero direct-impl callers) -> `commons.a.b(Context)` (local model
grant or remote provider call). *(trace-ycx, trace-cn-b, trace-cab2, class-setpin)*
24. **[O]** Secret persistence: `sa.d.f(ctx, str)` transforms `y.m(str)`
(non-empty), writes `u6.j.n(ctx, str)`, caches `f227429a`, and sets
`commons.B.b(ctx, true)` (setup flag). *(m-sad-f)*

### Chain summary
```
pad key (f156168o=true) -> Calculator$a.afterTextChanged
   -> sa.d.d(len) && sa.d.b(ctx).a(text)
      -> stored(u6.j-backed).equals( y.m(text) )           <- DETECTION
   -> Calculator.m1() -> n1(): listener.b(no-op) + finish() <- TRIGGER
   -> resume -> C0695a.onActivityResumed (skip commons.u decoys)
      -> commons.a.h: isSetup && !certificated
         -> INVOKE_INTERFACE VaultUI.launchVault (1 callsite)
            -> CalculatorVaultUI -> Intent(VaultGateActivity)
               -> skin fragment (ClassicCalcSkin...)        <- GATE UI
   gate success -> X0() == n1(): listener.b + finish()      <- both surfaces
cert lifecycle: SetPin confirm -> grant -> B.a()=true;
                VaultProvider.call(revoke) -> B.d()=false
```

---

## 2. Crypto weakness assessment (unlock-secret verification)

> Scope: this assesses the UNLOCK-CODE VERIFICATION scheme only. Vault
> content-at-rest crypto (`com.prism.lib.pfs`, providers) has NOT been
> analyzed - [U].

Transform `y.m`, applied identically at STORE time (`sa.d.f`) and MATCH time
(`sa.d.a`):

```
y.m(str) -> y.j(str)                        (ev_4230fc0c, ev_6f343042)
  = y.l( g.j(str) )   g.j = str.getBytes(charset)            (ev_3b218195)
  y.h(bytes) = MessageDigest.getInstance("MD5").digest()      (ev_94a37e65)
  y.l = g.a(md5bytes) = lowercase hex, 2 chars per byte       (ev_e014ddbd, ev_efa26adb)
on Throwable -> fallback: Integer.toString(str.hashCode())    (ev_4230fc0c)
```

| # | Weakness | Evidence | Severity |
|---|----------|----------|----------|
| W1 | **MD5, unsalted, unkeyed** as a secret verifier - not a password hash: no per-secret salt, no work factor; identical codes produce identical digests on every device | ev_94a37e65 | High |
| W2 | **Offline brute force is trivial by construction**: stored value = 32-hex MD5 of a numeric code typed on a calculator keypad. 4 digits = 10^4, 6 digits = 10^6 candidates; GPU MD5 (~10^9-10^10/s) exhausts the whole space instantly; no salt means the entire digit domain can be precomputed once | ev_1c9cf2ad + ev_94a37e65 + analysis | Critical if readable |
| W3 | **Plaintext storage**: digest kept in a generic key-value store (`u6.j`) - no Android Keystore, no encrypted-prefs evidence; backend engine itself unidentified [U]. Extractable via root / ADB / filesystem, then attacked offline with no rate limit | ev_97efe34e, ev_5262ef5e, ev_7d44b7ed | High |
| W4 | **`String.hashCode()` fallback**: if the digest path throws, the stored secret degrades to a decimal rendering of Java's 32-bit signed `hashCode()` (only ~31 bits of entropy, notorious collision behavior, negative values possible). Failure is rare but silent - same fallback runs on the match side, so verification still "works" | ev_4230fc0c | Medium |
| W5 | **Early-exit comparison**: `String.equals` (not constant-time). Local-only attack surface, low practical impact, but a textbook deviation | ev_1c9cf2ad | Low |
| W6 | **Verification-shaped, not encryption-shaped**: `y.m` is a hash check (irreversible), yet it is applied to whatever the user typed as their "code"; combined with the length gate `sa.d.d(int)` (allowed lengths **[U]**, inventory only ev_6f327330) the effective secret space is keypad-bounded (digits/operators), i.e. PIN-level entropy at best | ev_6f327330 | by design |

**Bottom line**: the unlock scheme is a saltless MD5 PIN check over a plaintext
KV store - recoverable and instantly brute-forceable by anyone who reads the
preference file (root/backup). It does not protect a strong secret; it only
stops shoulder-surfing. The `hashCode()` fallback further guarantees a
worst-case ~2^31 search space even on total transform failure.

---

## 3. Architecture pattern

**Pattern: "Decoy front-end + lifecycle-guarded gate + provider-authoritative
session certificate", implemented as a modular-monolith with heavy process
virtualization.**

1. **Disguised entry (manifest-level decoy)**
   [O] 17 activity-aliases swap the launcher icon/target to a terms/splash
   flow; the vault is only reachable through components marked
   `is_vault_activity` (Calculator, VaultGateActivity). *(pkg, ev_499fd3dc)*

2. **Dual lock surfaces with one shared unlock routine**
   [O] Primary: `Calculator` (watcher-based detection). Secondary re-lock:
   `VaultGateActivity` (auto-opened when the session certificate is absent).
   Both terminate with byte-identical logic (listener notify + finish):
   `n1()` vs `X0()`. *(m-n1, m-gate-X0)*

3. **Detection by TextWatcher, not by button handler**
   [O] Unlock fires from `afterTextChanged` gated by an input-origin flag
   (`f156168o`), so any text mutation path can unlock; the math engine
   (`z` + javia.arity) is a pure decoy calculation layer.
   *(m-a-after, m-onButtonClick, m-zb)*

4. **Session certificate = in-memory flag, provider-authoritative**
   [O] `commons.B.f156320a` (certificated) is flipped only inside
   `VaultProvider.call()` (grant at PIN-set confirm via `SetPinActivity.Z0`,
   revoke via provider method `f156354h`). The exported provider sits behind
   signature-level permission `com.app.hider.vault.helper`.
   *(m-cB-a/d, trace-cz-a/d, trace-ycx, pkg)*

5. **Lifecycle-driven gating with a decoy marker**
   [O] Every resumed activity is checked by `C0695a.onActivityResumed`
   -> `commons.a.h`, except `instanceof commons.u` (the UserTerms decoys,
   "vaultGhostUIActivity"). Gate opens only when `isSetup && !certificated`.
   *(m-resume, m-cas-h, trace-cu)*

6. **Pluggable skin registry**
   [O] `w` maps 7 skin ids -> factory objects (`p..v`) -> fragments
   (fallback `ClassicCalcSkinFragment`); the gate's whole UI is one fragment
   selected by persisted config (`w.b().d`). Classic registry/strategy shape.
   *(m-w-clinit, m-w-a, m-skinp)*

7. **Global extension hook that ships empty**
   [O] `GlobalVaultListener` (`commons.f.f156375b`, type `commons.y`) is
   invoked on every unlock from both surfaces, but all three implementors
   are empty/delegating - a logging/extension seam with no functional effect
   in this build. Registration writer [U] (field writes not traceable;
   referencing classes: SettingActivity, SetPinActivity, commons.ui.c -
   ev_125e0454).

8. **Unlock = subtraction, not addition**
   [O]/[I] No unlock path starts an activity; success only `finish()`es the
   lock surface, implying content is pre-placed underneath or swapped in-place
   (content host [U]).

9. **Multi-process hardening around the vault core**
   [O] Separate daemon process (`DaemonAliveService`), notification listener,
   exported providers (vault, file-bridge, Gaia proxies), and a full
   virtualization fabric: 64 x Guest{Activity,Service,Dialog,InitializerProvider}
   stubs, `SandboxedProcessServiceStub.Sandbox500`, `SupervisorService`,
   `UnhideGuestService`, `IMPORT_APK` - i.e. app-hiding via containerized
   guest processes (Gaia), orthogonal to the photo/file vault (`lib.pfs`).
   *(pkg)*

10. **Debug backdoors present**
    [O] `com.prism.hider.debug.GALLERY` / `GUEST` classes +
    `GalleryControlReceiver` / `GuestControlReceiver` in the manifest (exported
    details in raw manifest). *(pkg)*

---

## 4. Evidence ledger

All IDs are full `evidence_id` values recorded in the JSON files under
`C:\Users\hp\AppData\Local\Temp\opencode\hideme-re\` (96 files total; the most
relevant are listed here). "ref" is the file stem used in sections 1-3.

| ref | evidence_id | proves |
|-----|-------------|--------|
| pkg | ev_499fd3dc9f75dd76da4db37cdbfa2141fed1d227d1ab8377977f423bf359a26a | package/version/permissions + full manifest (aliases, is_vault_activity, Gaia/daemon/pfs components) |
| class-Calc | ev_ce3579e8390abb12c8e30a521071f1e79a67fe8903451ae4f6d179bd930af884 | Calculator class inventory |
| m-init | ev_23c1accdb33839d750b7de992eaa8831547fcec9bba494eba43a15bce12f66bb | Calculator.<init> creates TextWatcher Calculator$a |
| m-onCreate | ev_c71d7196946d88f54257f101e14bd0a91ed83ea2d13338cc653f15d01a1fb3d1 | onCreate: "Vault not setup" guard + watcher attach |
| m-onButtonClick | ev_10204299482b46281e2f822e1c0642566c92d35348f6820049c4fc1b4f5916b3 | pad routing, sets input-origin flag f156168o |
| m-h1 | ev_67f7d670a9a9904195dc728299c87ead96cc522564abb0459ffb721ae46c51d2 | "=" -> EVALUATE -> z.a |
| m-g1 | ev_0d791ac49c1bb3165fc51f3d0d3fb708c0f23c675a9ccc40016df3101c5e8aeb | backspace handler |
| m-f1 | ev_8cff46f545d71c577db9c6b2db6263a23182789d996af4cbd107a4e583ffe683 | animated clear |
| m-za | ev_4315e5a371c6455f45a0f8ef32c930bc12dbcec0eb737b31d2cbecffd9c74378 | z.a evaluation entry |
| m-zb | ev_16756350f0575e9434dd1adbdee4dddc30a88b442f5921e7b2455f18f3af2fa4 | z.b: arity Symbols math eval, callback on result |
| m-g0 | ev_022937285feffc51bc2fa993347886f414215396154ae0b01434b62c11a5361a | g0: display-only result update |
| m-a-after | ev_563bd18c9e560dcfa05ff53e92632ee3bcbba5420c23cf920b6fded8a102e133 | DETECTOR: afterTextChanged gate -> m1() |
| class-sad | ev_6f3273306f911f94639970e7eaadd57b4ac1759fc9affcbd799920d28c7112de | sa.d fields (f227429a) + methods (a/b/d/e/f) |
| m-sada | ev_1c9cf2ad0d8d25d99afa2c708e3fbd0b1e948dd098d0084fd7ba8e8e1c316937 | sa.d.a: stored.equals(y.m(input)) + B.a() on match |
| m-sad-e | ev_5262ef5ebd8267aafbdb2433d1ed96933b195067b7331d8777406de8c0451668 | sa.d.e: load secret from u6.j |
| m-sad-f | ev_97efe34eae9ebcbfed444b7e1666af0a07b7b21fadde10f1128daefa6a74b999 | sa.d.f: transform+store secret, set setup flag |
| m-sad-init | ev_1beec3927329f9ae4a9b9e9b9a1558b1ed0e0e5fee20a112c72205e4dd056ca5 | sa.d constructor loads via e() |
| m-m1 | ev_dd1d007b38cb575b63c93fc6c9049703e4a26cdbc0bdb3a4b22b8ada7b44c990 | trigger branch on tag_not_need_jump_to_launcher |
| m-n1 | ev_667990fc1f1f931da0776ab867464cab5eccd1d4d166355ac0b369fc72991034 | n1: GlobalVaultListener.b + finish() |
| trace-cy2 | ev_7b4b30a19cf3522c564766d066cca88565204c41dbd8b6900f5e862c4fcbdde2 | commons.y implementor set (complete): 3 classes |
| m-cc-b | ev_2f7d7bab28dd28932d3b884c9c69452670284e4b211ae79424bdd3c5817ab4b5 | commons.c.b listener: empty body |
| m-x9hb-b | ev_9f5aeb9c9f6fa8041d1c0dc40e93f8abd944304c49038e9f3a2d01a285e7064a | X9.h.b.b listener: empty body |
| m-cab-b | ev_b4108950dcb11e7003a365a59c4696fede42f05fb8dd572f42dc6baaa33a11dd | commons.a.b.b listener: null-guarded delegate |
| m-resume | ev_888e3b8dd42cb91e5a3eaa76b5565b7f8f1d134f48a7254cd41849fa696a521b | C0695a.onActivityResumed: skip commons.u, call h() |
| trace-cah | ev_5e7fedb70459b49fba00c52c21fdb3ff4658fa817a264c6ccc475d36f61f1acc | sole caller of commons.a.h is the resume hook |
| class-cu | ev_a673efd6fcd94711dbf57d962b5f3805f12e4b58f0ebf8e3472659521cd4d69a | commons.u marker class |
| trace-cu | ev_a67e3eae27d608a53f01107cd05ab8b7fa07cf37c771b169cadf63ca4e4afb4e | commons.u referenced by UserTerms* decoys (complete) |
| m-cas-h | ev_e34d193cfff6501f728c9e462c245d4bbb54bd1a38e9ea2035588db7a81bab2a | certificateVault: setup&&!cert -> launchVault |
| m-B-c | ev_0926144d62f1095a091d25fb857b55338205c56fed98c2adc1793fe055c9f9bd | isSetup = u6.j<Boolean> read |
| m-B-e | ev_827edaa40ba14484acee5bfe09aa1a5cea83a0270f4cf241cf281028a26ad2f7 | certificated = in-memory f156320a |
| trace-ivaultui | ev_8d02f5b231ab8814c1cab2d72e6dda6f9fd86b2f7ceb4ea370f59b3ef42ee075 | VaultUI.launchVault: exactly 1 callsite (INVOKE_INTERFACE) |
| m-launchVault | ev_352389235ce1a05f208f5389f8f921834917e1891911da5cb83dfcb3736ba4c5 | CalculatorVaultUI: Intent(VaultGateActivity) or cross-package |
| trace-gate | ev_dda66d15e4d6d90ec941e60a466c5efd7e235c39847a0f3b85e1ab07649055ca | VaultGateActivity referenced only by CalculatorVaultUI |
| m-gate-create | ev_8011ee793d5342d633b25c0f5d02d915f3226861f860148949bd7877edafda09 | gate onCreate: guard + commit V0() |
| m-gate-V0 | ev_da1f2e432ee8ad49a0e35b8dd48b3ec43048e586d49634cf94c08bfbc6198d0f | V0: skin id -> w.a(id) fragment factory |
| class-w | ev_fc7067834e233a82c29f29cba011bd22bfe0038d1ed38340b5687de0b06eec3e | skin registry class w (List<w$b>, a(), b()) |
| m-w-clinit | ev_0c5c1ba182da6bf6c010cf025e7424c3cbfa059a8ef4f05dc06c2ac71de3b59f | 7 skins registered: calc_classic/ios/material/casio/neu/minimal/glass |
| m-w-a | ev_191532f5f4af21eee51afddd06887eadd9debfbae5cafabb7398d94159730746 | lookup + fallback ClassicCalcSkinFragment |
| m-skinp | ev_819df11ad2a6fd415c987e296ca737dc1b868d6c68427d25a8fbc4feabd89332 | factory p.create() -> new ClassicCalcSkinFragment() |

| ref | evidence_id | proves |
|-----|-------------|--------|
| class-gate | ev_05779297031338b36452c68b5b786b9d7fe53305c1399d96ee8ad45e34c2c5b3 | VaultGateActivity inventory (sa.c field, U0/V0/W0/X0, perms) |
| m-gate-U0 | ev_c52dce87abe3ef0065f5fe1b41dbb6abf033b68fbf6ac5dd100c9cf3ce466f32 | U0 synthetic accessor -> X0() |
| m-gate-X0 | ev_00c422d83749e2e9cc4c274103c58cbe1d24ab6c43ff496dc6d67611bd19f803 | gate unlock == Calculator.n1 (listener + finish) |
| class-commonsB | ev_c8ed13f49b5198c74b6951e7ed731378028a8bd81c1b69c63c12ee5638f03508 | commons.B fields (f156320a, u6.j) + a..h methods |
| m-cB-b | ev_6dfe40d56db222f8c4bb66bcb0ca5a81a59f3a0aaef4feedcffaf52166307498 | b(ctx,Z): persist setup flag in KV |
| m-cB-a | ev_61e4468c0add298a2400f38f26a269c719d284695e1e5fadce1bf915b7156b9d | a(): certificated = true (logs VaultProvider.f156353g) |
| m-cB-d | ev_d5b4960be507b8c461d9ca7c305837844098922bceee06c3d735d6dc0b2e7473 | d(): certificated = false (logs VaultProvider.f156354h) |
| trace-cz-a | ev_1ca5bfd7fb951755236b25f412bd30e78f5a63619b37668fca40b489498f990f | grant only from VaultProvider.call (offset 102, complete) |
| trace-cz-d | ev_bd079224476f61173835417bf85363432f9216e6b4e9775f76fecc4baf8fbd6e | revoke only from VaultProvider.call (offset 90, complete) |
| trace-ycx | ev_7f60cbe9bed98f780bbf5991462b984e6e2af4cdccbe2b3ff27a8607831fb8f0 | commons.y.c callers: SetPinActivity.Z0 + delegate (complete) |
| trace-cn-b | ev_dddf13bf925b8f57685b996b199c294d9686f761388d87d69c958fd2a006d501 | grantCertificate bridge: sole caller X9.h$b.c |
| trace-cab2 | ev_207d27cd41417fa85d27fa137b74ca2705975b430385360bff6bd810118e1435 | commons.a.b (grantCertificate impl): 0 direct callers |
| class-setpin | ev_a12784c430fe577f8c9e01062f5415dca514310663da7a65ff35736c7797f06d | SetPinActivity inventory (Z0 dialog handler) |
| m-ym | ev_4230fc0c9e0235e9ad6e522a1205344a7a9d1e01036c983d6b4c9add5fd044f9 | y.m -> j, Throwable fallback = hashCode decimal |
| m-yj | ev_6f3430424b41e21a1e97686b562e98e03e5101fb923167f41642afab899f10ed | y.j = l(g.j(str)) |
| m-gj | ev_3b2181951212417b532eafa19549c500702b2c3011dcee04bc6ea579b96d8c4a | g.j = str.getBytes(charset) |
| m-yh | ev_94a37e65c79539bf25f67b0b4cb4b44d6e09d5b2e1668c09fe6d83699f8050c6 | y.h = MessageDigest "MD5" |
| m-yl | ev_e014ddbd60541c4f3e54c30c2a9f6a74b86041ab5c16fa340b3cf319eee04a28 | y.l = g.a(h(bytes)) |
| m-ga | ev_efa26adbbc96a69a700ff1e2c6b9b7453b944b86bdcf2fdb933d91c0f1277f72 | g.a = lowercase hex encoder |
| class-u6j | ev_7d44b7ed4aaa1547fcf4158a79edec015452baeb8922c413fe2aa733fb9252c9 | u6.j generic typed KV wrapper (backend [U]) |
| trace-cf | ev_125e045400701d60fd11cc23e0d4a6d4bf5d040b37eec3b4a1a299155c8807e6 | commons.f referencers: listener-writer candidates |
| class-sac | ev_164a90f81ec8883218ce896ec80cb675ee1725f8d94fdebe2914140f6da0e48f | gate verifier sa.c (CancellationSignal, callback sa.c$c) |
| search-sac | ev_0d0273c8d4b72ee17abc4b15efc819814ed4d0d8e517b2be3e9f7dcc0fd2a3c2 | sa.c$c does not resolve as class (synthetic) |
| trace-yc | ev_4784c8be92b2c7c3f937afb218614384fa265f9d4a3634146dcbeb69f0b18c4f | utils.y.c is crypto helper, not cert path |
| class-calcP | ev_df8e6000ec49e33a3f30b1d644d7fe8610af961f4a98451d61fdd61b05069185 | skin factory p inventory |
| class-A | ev_2ac16e9b9c3918436ea5930424005bb2364d858a33851bd21b1c3635a65fdcf6 | A: glyph substitution map (decoy digit encoding) |
| search-calc | ev_91ee932946b6a7471e8492c400e657429065f2322c90002b196b34eef7f30504 | calculator-package class set |

---

## 5. Open unknowns (explicit)

1. **Vault content host [U]** - no unlock path calls `startActivity`; either
   `finish()` reveals a pre-placed activity or the skin fragment
   (`ClassicCalcSkinFragment`) hosts content in-place. Not yet determined.
2. **Revoke triggers [U]** - who calls `VaultProvider.call` with method
   `f156354h` (revoke) and when (background? timeout? process death?).
3. **`u6.j` storage backend [U]** - SharedPreferences vs MMKV vs custom;
   determines extraction path for W3.
4. **Length gate values [U]** - `sa.d.d(int)` body not decompiled (inventory
   only).
5. **Listener registration [U]** - writers of static field
   `commons.f.f156375b` (field writes are not traceable; candidates from
   referencing classes: SettingActivity, SetPinActivity, commons.ui.c).
6. **Gate verifier internals [U]** - `sa.c` flow (permission/biometric?
   CancellationSignal present) and its synthetic callback `sa.c$c` unresolved.
7. **Charset of `g.j` / exact `w.b().d` config key [U]** - minor.
8. **Not analyzed at all [U]**: content-at-rest crypto (`lib.pfs`), the Gaia
   virtualization stack internals (guest lifecycle, `UnhideGuestService`),
   icon-disguise switching code, daemon keep-alive logic, ad/telemetry
   networking, native libs in `config.arm64_v8a`.

**Coverage**: the unlock investigation (original question) is closed except
for items 1-6 above; the app as a whole remains largely un-analyzed beyond
manifest-level mapping.

*Generated from static REA/JADX evidence; all raw JSON retained in the temp
analysis directory for re-verification.*
