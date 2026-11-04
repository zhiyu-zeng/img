---
title: YouTube
source: https://qbtau.in/posts/onelist_ctf/
source_host: qbtau.in
clip_date: 2026-11-04T10:44:45+08:00
trace_id: e9cf58b0-b7d3-4c48-8690-9a7050d8d9bf
content_hash: fa6acdd9733447489af660a7489a61b6e43f6c585e52af1335fd585fa8701755
status: synced
tags:
  - Android逆向
  - CTF
series: null
feed_source: Abhi·Frida/Android
ai_summary: OneList 安卓 CTF 系列题解：用静态 grep、Manifest 元数据、多层编码还原与资产隐写 AES 解密逐步拿下 CYWR 旗标。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-811f-92d9-edc492c9b701
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> OneList 安卓 CTF 系列题解：用静态 grep、Manifest 元数据、多层编码还原与资产隐写 AES 解密逐步拿下 CYWR 旗标。
> 
> - **静态搜索破前三题：** 用 APKEditor 反编译后 grep "CYWR"，Flag 1 明文藏在 strings.xml；Flag 2 是 strings.xml 中 base64 编码的 `build_config`；Flag 3 藏在 AndroidManifest.xml 的 `com.onelist.build.config` meta-data 十六进制值中，xan/hex 解码即得。
> - **Flag 5 多层链还原：** 从 gh.smali 中的可疑 hex 串入手，用 jadx 理清处理链：两字符切分→hex 转 byte→UTF-8 解码→可打印 ASCII 区凯撒位移 `((c+14)%94)+33`→base64 解码。
> - **Flag 7 走捷径：** 解密密钥依赖 targetSdkVersion 与包名长度计算，但代码异常时有回退值 53，作者直接跳过逆向，用 [低字节, 高字节, 66] 三字节循环 XOR 解密。
> - **Flag 8 资产隐写：** icon.jpg 尾部追加分号分隔的两段 base64（AES key 与 IV），配合 kZ 类中硬编码密文，以 AES/CBC/NoPadding 解出 flag。
> - **方法论：** 全程优先静态分析（grep smali + jadx 交叉对照），回避动态调试；工具链为 APKEditor、jadx、xmllint、Python。

## OneList CTF Writeup

Write-ups for the OneList CTF

You can find CTF details [here](https://github.com/cywr/android-re-ctfs/tree/main/onelist) or at CyberWave [Trainings](https://training.cyberwave.network/challenges?c=Reverse).

## 🎯 Challenge Categories

### Static Analysis (Flags 1-5)

-   **Flag 1**: Basic string discovery
-   **Flag 2**: Encoded configuration data
-   **Flag 3**: Metadata analysis
-   **Flag 4**: Algorithm identification and reversal
-   **Flag 5**: Multi-layer obfuscation

### Dynamic Analysis (Flags 6-10)

-   **Flag 6**: Runtime behavior analysis
-   **Flag 7**: Database interaction patterns
-   **Flag 8**: Advanced cryptography and hidden assets
-   **Flag 9**: Code loading mechanisms and obfuscation
-   **Flag 10**: Native code analysis with steganography

**Flag Format:** `CYWR{...}`

* * *

## OneList CTF #1

**Challenge Title:** First Steps  
**Category:** Rev  
**Description:** Welcome to the OneList Android CTF! This progressive challenge series will take you from beginner to expert Android reverse engineering.  
**Hint:** Start with the most obvious places where developers store text content.

### Solution

Let’s decompile the APK, I’ll be using [apkeditor](https://github.com/REAndroid/APKEditor) here:

```bash
 ┬─[abhi@termux::~/onelistctf]─[]
╰─> alias jjar
alias jjar='java -jar'
 ┬─[abhi@termux::~/onelistctf]─[]
╰─> jjar apkeditor.jar d -i app-release.apk -o decompiled/
00.000 I: [DECOMPILE] Using: APKEditor version 1.4.4, ARSCLib version 1.3.8
                  -t = xml            
           -load-dex = 3              
            -dex-lib = internal       
      -comment-level = detail         
                  -i = app-release.apk
                  -o = decompiled     
 ____________________________________ 
00.026 I: [DECOMPILE] Loading ...
00.211 I: [DECOMPILE] Decompiling to xml ...
00.559 I: [DECOMPILE] Initializing android framework ...
00.560 I: [DECOMPILE] Loading android framework for version: 34
00.681 I: [DECOMPILE] Initialized framework: android-34 (14)
00.705 I: [DECOMPILE] [SANITIZE]: Sanitizing paths ...
00.713 I: [DECOMPILE] Validating resource names ...
00.778 I: [DECOMPILE] All resource names are valid
00.778 I: [DECOMPILE] Decode: archive-info.json
00.783 I: [DECOMPILE] Decode: uncompressed-files.json
00.798 I: [DECOMPILE] Decoding: AndroidManifest.xml
00.875 I: [DECOMPILE] public.xml: com.lolo.io.onelist -> package_1
00.908 I: [DECOMPILE] Res files: resources
02.007 I: [DECOMPILE] Loading full dex files: 1                                               
03.132 I: [DECOMPILE] Baksmali ...
09.416 I: [DECOMPILE] Extracting root files ...
09.484 I: [DECOMPILE] Dumping signatures ...
09.484 I: [DECOMPILE] Saved to: decompiled
```

From challenge categories, we can infer that the first flag is based on simple string discovery i.e, we might be able to find the flag by searching for the string `CYWR` in the decompiled directory.

```bash
╰─> grep -R "CYWR" decompiled/
decompiled/resources/package_1/res/values/strings.xml:  <string name="ctf_flag_1">CYWR{welcome_to_onelist_ctf}</string>
grep: decompiled/root/lib/armeabi-v7a/libonelist_native.so: binary file matches
grep: decompiled/.cache/classes.dex: binary file matches
decompiled/smali/classes/cM.smali:    const-string v11, "CYWR"
```

and, we got the first flag, `CYWR{welcome_to_onelist_ctf}`.

* * *

## OneList CTF #2

**Challenge Title:** Build Secrets  
**Category:** Rev  
**Description:** Developers often store configuration data in various formats throughout their applications.  
**Hint:** Build configurations might contain processed strings. Look for validation functions.

### Solution

Hmm… From challenge description, hint & the category details, we can infer that the flag this time is going to be encrypted and has something to do with build configs which is being validated by some validation function. Let’s do some search for strings matching `build`:

```bash
╰─> grep -Ri '"build' decompiled/
decompiled/resources/package_1/res/values/strings.xml:  <string name="build_config">Q1lXUntiYXNlNjRfYnVpbGRfY29uZmlnX2ZvdW5kfQ==</string>
decompiled/resources/package_1/res/values/public.xml:  <public id="0x7f100027" type="string" name="build_config" />
decompiled/root/kotlin-tooling-metadata.json:  "buildSystem": "Gradle",
decompiled/root/kotlin-tooling-metadata.json:  "buildSystemVersion": "8.6",
decompiled/root/kotlin-tooling-metadata.json:  "buildPlugin": "org.jetbrains.kotlin.gradle.plugin.KotlinAndroidPluginWrapper",
decompiled/root/kotlin-tooling-metadata.json:  "buildPluginVersion": "1.9.22",
decompiled/smali/classes/N8.smali:    const-string v0, "buildId"
decompiled/smali/classes/l7.smali:    const-string v2, "build_version"
decompiled/smali/classes/L9.smali:    const-string v1, "BuildIdMappingForArch{arch="
decompiled/smali/classes/Df.smali:    const-string v3, "buildId"
decompiled/smali/classes/Q8.smali:    const-string v0, "buildVersion"
decompiled/smali/classes/rG.smali:    const-string v2, "build_config"
decompiled/smali/classes/bk.smali:    const-string v2, "buildIdMappingForArch"
decompiled/smali/classes/bk.smali:    const-string v8, "buildVersion"
decompiled/smali/classes/O8.smali:    const-string v0, "buildIdMappingForArch"
decompiled/smali/classes/l9.smali:    const-string v0, "buildVersion"
decompiled/smali/classes/a8.smali:    const-string v2, "build_version"
```

Voila, we have the flag, stored in `strings.xml` file with name `"build_config"`, looking at it looks like a **base64** encoded string which again confirms it:

```bash
╰─> echo Q1lXUntiYXNlNjRfYnVpbGRfY29uZmlnX2ZvdW5kfQ== | base64 -d
CYWR{base64_build_config_found}
```

* * *

## OneList CTF #3

**Challenge Title:** Important Files  
**Category:** Rev  
**Description:** Android applications contain various important configuration files that define application behavior and metadata.  
**Hint:** Look for suspicious values in application metadata that don’t appear to be standard configuration.

### Solution

From challenge description & it’s category info, we can infer the *important configuration files* is pointing to `AndroidManifest.xml` file as the category info reveals it has something to do with Metadata.

So, let’s search for all the `meta-data` tags in `AndroidManifest.xml` file.

```bash
╰─> xmllint --xpath "//meta-data" decompiled/AndroidManifest.xml 
<meta-data android:name="com.onelist.build.config" android:value="435957527b6d616e69666573745f73636f70655f616e616c797369737d"/>
<meta-data android:name="com.onelist.api.version" android:value="v1.5.2"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.crashlytics.FirebaseCrashlyticsKtxRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.crashlytics.CrashlyticsRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.sessions.FirebaseSessionsRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.installations.FirebaseInstallationsKtxRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.installations.FirebaseInstallationsRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.ktx.FirebaseCommonLegacyRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.FirebaseCommonKtxRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="com.google.firebase.components:com.google.firebase.datatransport.TransportRegistrar" android:value="com.google.firebase.components.ComponentRegistrar"/>
<meta-data android:name="androidx.emoji2.text.EmojiCompatInitializer" android:value="androidx.startup"/>
<meta-data android:name="androidx.lifecycle.ProcessLifecycleInitializer" android:value="androidx.startup"/>
<meta-data android:name="androidx.profileinstaller.ProfileInstallerInitializer" android:value="androidx.startup"/>
<meta-data android:name="com.google.android.gms.version" android:value="@integer/google_play_services_version"/>
<meta-data android:name="backend:com.google.android.datatransport.cct.CctBackendFactory" android:value="cct"/>
```

From the output we see that meta-data value of `com.onelist.build.config` looks kinda like HEX, let’s try to decode it.

```bash
╰─> echo 435957527b6d616e69666573745f73636f70655f616e616c797369737d | xxd -r -p
CYWR{manifest_scope_analysis}
```

and we have the flag.

* * *

## OneList CTF #5

**Challenge Title:** Multi-Layer Processing  
**Category:** Rev  
**Description:** Complex data processing chains require systematic analysis approaches to understand the transformation steps.  
**Hint:** Migration or validation signatures often use complex processing. Work backwards from the final algorithm.

### Solution

First, let’s download the APK and decompile it using `jadx`. Since the description infers that there’s going to be some kind of algorithm to process data, that too in chains, so we’ll be needing jadx decompiled output.

```bash
╰─> jadx app-release.apk -d jad_dec
```

We’ll look for strings like `valid` / `invalid` which might indicate the validation logic.

```bash
╰─> grep -R '"invalid' decompiled/
decompiled/smali/classes/gh.smali:    const-string v6, "invalid"
decompiled/smali/classes/EO.smali:    const-string v1, "invalid size"
decompiled/smali/classes/EO.smali:    const-string p2, "invalid buffersIterator"
decompiled/smali/classes/Em.smali:    const-string v0, "invalid node depth"
decompiled/smali/classes/Em.smali:    const-string v0, "invalid node depth"
decompiled/smali/classes/Ft.smali:    const-string v2, "invalid FocusDirection"
decompiled/smali/classes/J20.smali:    const-string v2, "invalid lineSpacingMultiplier value"
decompiled/smali/classes/J20.smali:    const-string v2, "invalid ellipsizedWidth value"
decompiled/smali/classes/J20.smali:    const-string v2, "invalid width value"
decompiled/smali/classes/J20.smali:    const-string v2, "invalid maxLines value"
decompiled/smali/classes/J20.smali:    const-string v2, "invalid end value"
decompiled/smali/classes/J20.smali:    const-string v2, "invalid start value"
decompiled/smali/classes/IC.smali:    const-string v1, "invalid afterContentPadding"
decompiled/smali/classes/IC.smali:    const-string v1, "invalid beforeContentPadding"
decompiled/smali/classes/x2.smali:    const-string v16, "invalid weight 1.0; must be greater than zero"
decompiled/smali/classes/androidx/recyclerview/widget/i.smali:    const-string v2, "invalid position "
decompiled/smali/classes/androidx/recyclerview/widget/LinearLayoutManager.smali:    const-string v1, "invalid orientation:"
decompiled/smali/classes/androidx/recyclerview/widget/StaggeredGridLayoutManager.smali:    const-string p2, "invalid orientation."
decompiled/smali/classes/Od.smali:    const-string v0, "invalid position"
decompiled/smali/classes/Ki.smali:    const-string v0, "invalid ImeAction"
decompiled/smali/classes/AW.smali:    const-string v4, "invalid metadata codepoint length"
decompiled/smali/classes/o3.smali:    const-string v0, "invalid ImeAction"
decompiled/smali/classes/Be.smali:    const-string p2, "invalid parameter type. Must be one and instanceof LifecycleOwner"
decompiled/smali/classes/Be.smali:    const-string p2, "invalid parameter type. second arg must be an event"
decompiled/smali/classes/Fp.smali:    const-string p1, "invalid orientation"
```

let’s start from the first result, `decompiled/smali/classes/gh.smali` file, not gonna bother wasting time by opening each file, let’s look for surrounding few lines to see if we it looks interesting:

```bash
'"invalid"'
    .line 785
    check-cast v3, LxW;

    .line 787
    move-object/from16 v6, p2

    .line 789
    check-cast v6, LyN;

    .line 791
    const-string v6, "invalid"

    .line 793
    const-string v8, "22603d29263f45402b293937343e685f7d7335372a3e754b2b252a5f29617d402a283d4637226c6c"

    .line 795
    :try_start_0
    invoke-static {v8}, LP20;->k0(Ljava/lang/String;)Ljava/util/ArrayList;

    .line 798
    move-result-object v8
```

Aha, that string does looks interesting, much like a hex string, time to spin up jadx decompiled java representation of this code.

```java
// gh.java
// ... (redacted for brevity)
case 7:
    C2461xW c2461xW = (C2461xW) obj;
    String str2 = "invalid";
    try {
        ArrayList k0 = P20.k0("22603d29263f45402b293937343e685f7d7335372a3e754b2b252a5f29617d402a283d4637226c6c");
        ArrayList arrayList = new ArrayList(AbstractC1562lf.n0(k0));
        Iterator it = k0.iterator();
        while (it.hasNext()) {
            String str3 = (String) it.next();
            AbstractC0887cl.z(16);
            arrayList.add(Byte.valueOf((byte) Integer.parseInt(str3, 16)));
        }
        String str4 = new String(AbstractC1410jf.L0(arrayList), AbstractC0392Pd.a);
        StringBuilder sb = new StringBuilder();
        int length = str4.length();
        for (int i6 = 0; i6 < length; i6++) {
            char charAt = str4.charAt(i6);
            if ('!' <= charAt && charAt < 127) {
                sb.append((char) (((charAt + 14) % 94) + 33));
            } else {
                sb.append(charAt);
            }
        }
        str2 = new String(Base64.decode(sb.toString(), 0), AbstractC0392Pd.a);
    } catch (Exception unused) {
    }
// ... (redacted for brevity)
```

our target string is first being converted to a list of strings by `P20.k0`, let’s see what that method does:

```java
// P20.k0 in P20.java
public static ArrayList k0(String str) {
    int i;
    int i2;
    int length = str.length();
    int i3 = length / 2;
    int i4 = 0;
    if (length % 2 == 0) {
        i = 0;
    } else {
        i = 1;
    }
    ArrayList arrayList = new ArrayList(i3 + i);
    while (i4 >= 0 && i4 < length) {
        int i5 = i4 + 2;
        if (i5 >= 0 && i5 <= length) {
            i2 = i5;
        } else {
            i2 = length;
        }
        arrayList.add(str.subSequence(i4, i2).toString());
        i4 = i5;
    }
    return arrayList;
}
```

What this method does is taking a string and splitting it into a list of strings of length 2, if the string length is odd, the last element will be of length 1. For example, if the input string is `abcde`, the output will be `["ab", "cd", "e"]`. So, in our case for:

```java
ArrayList k0 = P20.k0("22603d29263f45402b293937343e685f7d7335372a3e754b2b252a5f29617d402a283d4637226c6c");
```

It’ll return:

```fallback
['22', '60', '3d', '29', '26', '3f', '45', '40', '2b', '29', '39', '37', '34', '3e', '68', '5f', '7d', '73', '35', '37', '2a', '3e', '75', '4b', '2b', '25', '2a', '5f', '29', '61', '7d', '40', '2a', '28', '3d', '46', '37', '22', '6c', '6c']
```

python code to do this:

```python
hex_str = "22603d29263f45402b293937343e685f7d7335372a3e754b2b252a5f29617d402a283d4637226c6c"
chunks = [hex_str[i:i+2] for i in range(0, len(hex_str), 2)]
```

After that

-   it iterates through each 2-character string in the `ArrayList`.
-   each 2-character string is converted to an integer using `Integer.parseInt(str3, 16)`.
-   then each integer is converted into a byte using `Byte.valueOf((byte) ...)` .
-   then we have a list of bytes which is converted into a byte array using `L0` method.

```java
// AbstractC1410jf.L0
public static byte[] L0(List list) {
    byte[] bArr = new byte[list.size()];
    Iterator it = list.iterator();
    int i = 0;
    while (it.hasNext()) {
        bArr[i] = ((Number) it.next()).byteValue();
        i++;
    }
    return bArr;
}
```

So, the `L0` method is just converting a list of bytes into a byte array. Let’s complete the python code to do the same.

```python
byte_values = [int(chunk, 16) for chunk in chunks]
byte_arr = bytes(byte_values)
```

-   then we’ve string conversion from bytes `String str4 = new String(AbstractC1410jf.L0(arrayList), AbstractC0392Pd.a);`, looking at value of field `a`:

```java
public abstract class AbstractC0392Pd {
    public static final Charset a = Charset.forName("UTF-8");
```

confirms that the charset is UTF-8. So, we can complete the python code as follows:

```python
str = byte_arr.decode("utf-8")
```

-   next we’ve a for loop, looking carefully it seems like Caesar Cipher because of the character shift logic. For each character that is a printable ASCII character (from ‘!’ to 126), it applies a character shift. The formula `((charAt + 14) % 94) + 33` \[modulo 94, range 33–12 6\] shifts the character by a certain amount within its range of 94 possible characters.

So, we can complete the python code as follows:

```python
def shift_char(c):
    if '!' <= c < chr(127):
        return chr(((ord(c) + 14)% 94) + 33)
    return c

shifted = ''.join(shift_char(c) for c in str)
```

-   and finally we have a simple base64 decoding. So, we can complete our python script to get the flag:

```python
import base64

hex_str = "22603d29263f45402b293937343e685f7d7335372a3e754b2b252a5f29617d402a283d4637226c6c"
chunks = [hex_str[i:i+2] for i in range(0, len(hex_str), 2)]

byte_values = [int(chunk, 16) for chunk in chunks]
byte_arr = bytes(byte_values)

str = byte_arr.decode("utf-8")

def shift_char(c):
    if '!' <= c < chr(127):
        return chr(((ord(c) + 14)% 94) + 33)
    return c

shifted = ''.join(shift_char(c) for c in str)

flag = base64.b64decode(shifted).decode("utf-8")
print(flag)
```

running the script gives us the flag:

```bash
CYWR{hex_rot47_base64_chain}
```

* * *

## OneList CTF #7

**Challenge Title:** Persistent Storage  
**Category:** Rev  
**Description:** Complex data processiAdvanced behavioral analysis with persistent storage and complex data protection schemes.  
**Hint:** Special application states might trigger validation. Look for storage entries with unusual characteristics.

### Solution

Starting from challenge 6, category details reveals they require dynamic analysis.

Well, solving this was stroke of luck for me. and anyway who cares about usre engagement triggering, dynamic analysis and all that 😂. Also I’m not really a fan of dynamic analysis.If you remember our first step for flag 1, we have these outputs from outrgrep search of string:

```bash
╰─> grep -R "CYWR" decompiled/
decompiled/resources/package_1/res/values/strings.xml:  <string name="ctf_flag_1">CYWR{welcome_to_onelist_ctf}</string>
grep: decompiled/root/lib/armeabi-v7a/libonelist_native.so: binary file matches
grep: decompiled/.cache/classes.dex: binary file matches
decompiled/smali/classes/cM.smali:    const-string v11, "CYWR"
```

If you notice carefully we have another result to string `CYWR` in smali at `decompiled/smali/classes/cM.smali`, let’s check it out.

```bash
'"CYWR"'
    const-string v11, "CYWR"

    .line 204
    invoke-static {v10, v11}, LX20;->g0(Ljava/lang/String;Ljava/lang/String;)Z

    .line 207
    move-result v10

    .line 208
    if-eqz v10, :cond_8

    .line 210
    invoke-virtual {v8}, Lfz;->d()Z

    .line 213
    move-result v8

    .line 214
    if-eqz v8, :cond_8

    .line 216
    goto :goto_4

    .line 217
    :cond_9
    move-object v7, v1

    .line 218
    :goto_4
    check-cast v7, Lfz;

    .line 220
    if-eqz v7, :cond_e

    .line 222
    new-instance v5, Ljz;

    .line 224
    iget-object v7, v9, LcM;->a:Landroid/content/Context;

    .line 226
    const-string v8, "765915677b305a6f2f6a65746a767401682442342b48"

    .line 228
    :try_start_0
    invoke-static {v8}, LP20;->k0(Ljava/lang/String;)Ljava/util/ArrayList;
```

We see kind of similar pattern as 5th challenge here, if we look at it’s java representation through jadx:

```java
try {
    ArrayList k0 = P20.k0("765915677b305a6f2f6a65746a767401682442342b48");
    ArrayList arrayList2 = new ArrayList(lf.n0(k0));
    Iterator it2 = k0.iterator();
    while (it2.hasNext()) {
        String str2 = (String) it2.next();
        cl.z(16);
        arrayList2.add(Byte.valueOf((byte) Integer.parseInt(str2, 16)));
    }
    byte[] L0 = jf.L0(arrayList2);
    try {
        i2 = context.getApplicationInfo().targetSdkVersion + X20.j0(X20.j0(context.getPackageName(), ".debug", ""), ".tst", "").length();
    } catch (Exception unused) {
        i2 = 53;
    }
    byte b2 = (byte) (i2 & 255);
    byte b3 = (byte) ((i2 >> 8) & 255);
    ArrayList arrayList3 = new ArrayList(L0.length);
    int length = L0.length;
    int i6 = 0;
    int i7 = 0;
    while (i7 < length) {
        byte b4 = L0[i7];
        int i8 = i6 + 1;
        int i9 = i6 % 3;
        if (i9 != 0) {
            if (i9 != 1) {
                b = 66;
            } else {
                b = b3;
            }
        } else {
            b = b2;
        }
        arrayList3.add(Character.valueOf((char) (b ^ b4)));
        i7++;
        i6 = i8;
    }
    str = jf.B0(arrayList3, "", (String) null, (String) null, (xv) null, 62);
} catch (Exception unused2) {
    str = "error";
}
```

and indeed it looks similar to challenge 5 just the decryption logic has been changed. And talk about the value of i2? well if an exception occurs there’s already a fallback with value `53` so who’s gonna waste their time understanding the logic of `X20.j0` and reversing it, we just write a simple python script:

```python
hex_string = "765915677b305a6f2f6a65746a767401682442342b48"
encrypted_bytes = bytes.fromhex(hex_string)
i2 = 53
b2 = i2 & 0xFF
b3 = (i2 >> 8) & 0xFF
key_pattern = [b2, b3, 66]
decrypted_chars = []
for i, byte in enumerate(encrypted_bytes):
    xor_key = key_pattern[i % 3]
    decrypted_char = chr(byte ^ xor_key)
    decrypted_chars.append(decrypted_char)
flag = ''.join(decrypted_chars)
print(flag)
```

running which gives us the flag:

```bash
CYWR{room_e6_v64hfw4i}
```

* * *

## OneList CTF #8

**Challenge Title:** Asset Analysis  
**Category:** Rev  
**Description:** Advanced challenge combining UI interactions with hidden data extraction from application assets.  
**Hint:** UI elements might have hidden functionality. Assets can contain more than their apparent purpose.

Once again, who cares about dynamic analysis, title says it has something to do with assets, we take a look inside assets of the app:

```bash
╰─> grep -R "icon.jpg" decompiled/
decompiled/root/META-INF/CERT.SF:Name: assets/icon.jpg
decompiled/root/META-INF/MANIFEST.MF:Name: assets/icon.jpg
decompiled/uncompressed-files.json:    "assets/icon.jpg",
grep: decompiled/.cache/classes.dex: binary file matches
decompiled/smali/classes/oZ.smali:    const-string v2, "icon.jpg"
```

we get one usage ins `oZ.smali`, let’s see what it holds:

```java
public static final C1845pN d(C1781oZ c1781oZ) {
    C1845pN c1845pN;
    c1781oZ.getClass();
    try {
        InputStream open = c1781oZ.f.getAssets().open("icon.jpg");
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream(Math.max(8192, open.available()));
        AbstractC0413Py.B(open, byteArrayOutputStream);
        byte[] byteArray = byteArrayOutputStream.toByteArray();
        open.close();
        byte[] L0 = AbstractC1410jf.L0(C8.X(byteArray));
        Charset charset = AbstractC0392Pd.a;
        List A0 = P20.A0(new String(L0, charset), new String[]{";"});
        if (A0.size() == 2) {
            String str = (String) A0.get(0);
            String str2 = (String) A0.get(1);
            c1845pN = new C1845pN(new String(Base64.decode(str, 0), charset), new String(Base64.decode(str2, 0), charset));
        } else {
            c1845pN = new C1845pN("fallback_key", "fallback_iv");
        }
        return c1845pN;
    } catch (IOException unused) {
        return new C1845pN("fallback_key", "fallback_iv");
    }
}
```

It reads the `icon.jpg` file from the assets folder, converts it into a byte array, and then processes this array to extract two strings. The byte array is converted to a UTF-8 string, which is then split into a list of strings using `;` as a delimiter. If the resulting list contains exactly two strings, they are Base64 decoded and used to create a `C1845pN` object. If not the fall back values `fallback_key` and `fallback_iv` are used.

So this reveals this method `d` is part of the encryption process to get `key` & `iv`, guess seems like going to be `AES` related. We still need our actual encrypted cipher, to find that we can search for the usages of this method:

```bash
╰─> grep -R "LoZ;->d(LoZ;)" decompiled/
decompiled/smali/classes/kZ.smali:    invoke-static {p1}, LoZ;->d(LoZ;)LpN;
```

let’s analyse what’s happening in `kZ` class through jadx:

```java
public final Object r(Object obj) {
    AbstractC1377jB.O(obj);
    try {
        C1845pN d = C1781oZ.d(this.o);
        AbstractC0439Qy.w((String) d.k, (String) d.l);
        return C0997e90.a;
    } catch (Exception e) {
        return new Integer(Log.e("OneList_System", "Data processing error", e));
    }
}
```

SO the values (key & iv) are being used inside `AbstractC0439Qy.w`, looking at it’s decompiled code:

```java
public static void w(String str, String str2) {
    try {
        Charset charset = AbstractC0392Pd.a;
        byte[] bytes = str.getBytes(charset);
        if (bytes.length != 16) {
            if (bytes.length < 16) {
                int length = 16 - bytes.length;
                int length2 = bytes.length;
                bytes = Arrays.copyOf(bytes, length2 + length);
                System.arraycopy(new byte[length], 0, bytes, length2, length);
            } else {
                bytes = C8.W(bytes, new C2416wy(0, 15, 1));
            }
        }
        SecretKeySpec secretKeySpec = new SecretKeySpec(bytes, "AES");
        byte[] bytes2 = str2.getBytes(charset);
        if (bytes2.length != 16) {
            if (bytes2.length < 16) {
                int length3 = 16 - bytes2.length;
                int length4 = bytes2.length;
                bytes2 = Arrays.copyOf(bytes2, length4 + length3);
                System.arraycopy(new byte[length3], 0, bytes2, length4, length3);
            } else {
                bytes2 = C8.W(bytes2, new C2416wy(0, 15, 1));
            }
        }
        IvParameterSpec ivParameterSpec = new IvParameterSpec(bytes2);
        byte[] decode = Base64.decode("vZnAenSqeZZk0z69SDsvOBSggL6DAVnXV3LGGtqGlzk=", 2);
        Cipher cipher = Cipher.getInstance("AES/CBC/NoPadding");
        cipher.init(2, secretKeySpec, ivParameterSpec);
        cipher.doFinal(decode);
    } catch (Exception unused) {
    }
}
```

seems like this is basically `AES/CBC` decode method, good thing we got our cipher text here. So, we’ve our `key`, `iv` & `cipher`, let’s get the flag now.

We can write a very simple python script to decrypt the flag.

```python
import base64

with open("icon.jpg", "rb") as f:
    data = f.read()if len(data) >= 50:
    used = data[-49:]
else:
    used = data

s = bytes(used).decode("utf-8")
key_b64, iv_b64 = s.split(";")
key = base64.b64decode(key_b64)
iv = base64.b64decode(iv_b64)

# Pad or truncate key and iv
key = (key + b"\x00" * 16)[:16]
iv = (iv + b"\x00" * 16)[:16]

ciphertext = base64.b64decode("vZnAenSqeZZk0z69SDsvOBSggL6DAVnXV3LGGtqGlzk=")

from Crypto.Cipher import AES

cipher = AES.new(key, AES.MODE_CBC, iv)
plaintext = cipher.decrypt(ciphertext)
print(plaintext)
```

running which gives us our flag:

```bash
╰─> cd decompiled/root/assets
 ┬─[abhi@termux:~/OneList/root/assets]─[]
╰─> python t.py
b'CYWR{asset_steganography_master}'
```

* * *
