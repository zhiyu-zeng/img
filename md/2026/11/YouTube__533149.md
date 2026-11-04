---
title: YouTube
source: https://qbtau.in/posts/sigmatcher/
source_host: qbtau.in
clip_date: 2026-11-04T10:19:39+08:00
trace_id: 8157f419-b6f1-484f-b303-e1279aadee7e
content_hash: bbb4093e3502e9ac29e7470a1c7a23c4a368e83e4ca3302a111d37f7b867a95d
status: synced
tags:
  - Android逆向
  - 安全工具
series: null
feed_source: Abhi·Frida/Android
ai_summary: Sigmatcher 是一款通过 YAML 签名规则在混淆或版本变更的 APK 中自动匹配 Java 类与方法新旧名称的工具。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-8199-9c70-f00f2f91186e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Sigmatcher 是一款通过 YAML 签名规则在混淆或版本变更的 APK 中自动匹配 Java 类与方法新旧名称的工具。
> 
> - **依赖与安装：** Sigmatcher 依赖 `ripgrep` 和 `apktool`，可用 `pip install -U git+https://github.com/oriori1703/sigmatcher.git` 从源码安装，termux 下 ripgrep 可用 `pkg install ripgrep`。
> - **工作原理：** 先用 apktool 反编译目标 APK，通过 grep 找到类中稳定不变的字符串（如示例中仅出现在 UserConfig.smali 里的 `"loginTime"`）写成 regex 签名，`count` 字段指定匹配需出现的次数；再运行 `sigmatcher analyze app.apk --signatures xxx.yaml` 分析。
> - **实战结果：** 在 Graph Messenger（Telegram 非官方客户端）中，`org.telegram.messenger.UserConfig` 类被混淆为 `tD`；`isPremium()Z` 方法通过匹配 `iget-object`/`iget-boolean` 指令的正则（限定 TLRPC$User 字段和 Z 返回类型）被成功定位为新名 `O`。
> - **输出与缓存：** 支持 `--output-format` 切换 enigma、jadx、legacy 等输出格式（jadx 格式可直接导入重命名）；首次运行会解码 APK 缓存至 `$HOME/.cache/sigmatcher`，可用 `sigmatcher cache clean` 清理。
> - **同类工具：** DexKit 是另一个选择，但专门面向 XPosed 模块开发场景。

## Sigmatcher: Effortlessly Matching Java Classes and Methods Across APK Versions

I’ve been there, countless times wrestling with obfuscated or version-changed APKs, hunting for specific classes or methods. Manually analyzing code became a tedious nightmare.

I was quite fed up with this and decided to write a tool that would help me find the exact match of a class or method in an APK. But, guess what, just as I was about to start writing the tool, I found [Sigmatcher](https://github.com/oriori1703/sigmatcher) by [Ori Perry](https://github.com/oriori1703) on GitHub. Actually, there was another tool which I knew about since a long time but it was specifically for XPosed modules ([DexKit](https://github.com/LuckyPray/DexKit)), make sure to check it out if you are working with XPosed modules.

## 🎥 Video Tutorial

If you’d prefer a visual guide, I’ve created a [short video](https://youtu.be/vCi-mu46crE) that walks you through the process. Watch the video below for instructions:

## Installation

Sigmatcher depends on `ripgrep` and `apktool` to work. Make sure you have them installed before proceeding.

-   `ripgrep` installation guide: [ripgrep](https://github.com/BurntSushi/ripgrep?tab=readme-ov-file#installation). It’s very simple to install on termux as well (`pkg install ripgrep`).
-   `apktool` installation guide: [apktool](https://apktool.org/docs/install).

**Installing Sigmatcher:** I usually prefer installing packages from source.

```bash
pip install -U git+https://github.com/oriori1703/sigmatcher.git
```

## Quick Usage

1.  **Create a Signature File (.yaml):** These files define the patterns Sigmatcher uses. Specify classes, methods, fields, and version-specific details. See below for the format.
    
2.  **Analyze an APK:**
    
    ```bash
    sigmatcher analyze path/to/your/app.apk --signatures path/to/your/signature_file.yaml
    ```
    

Ok, let’s get started with it in detail.

One of the many apps I’ve worked on that constantly changes its class and method names is [Graph Messenger](https://play.google.com/store/apps/details?id=ir.ilmili.telegraph), an unofficial client for Telegram.

Let’s start by creating a signature file for it. I’ll take `isPremium()Z` method inside Telegram as an example here. This method is responsible for checking if the user is a premium user or not. In telegram, this method is under `org.telegram.messenger.UserConfig` class.

```yaml
- name: "UserConfig"
  package: "org.telegram.messenger"
```

Ok so that was the first step. But since graph usually changes it’s class names as well, we’ll need to find something that doesn’t change and use that as signature for the class.

```bash
 ┬─[abhi@termux:~]─[]
╰─> apktool d 'Telegram.apk' -r --no-assets -o Telegram_decompiled/
I: Using Apktool 2.11.1 on Telegram.apk with 8 threads
I: Baksmaling classes.dex...
I: Baksmaling classes2.dex...
I: Baksmaling classes5.dex...
I: Baksmaling classes4.dex...
I: Baksmaling classes3.dex...
I: Copying raw resources...
I: Copying raw manifest...
I: Copying original files...
I: Copying lib...
I: Copying unknown files...
 ┬─[abhi@termux:~]─[]
╰─> find Telegram_decompiled/ -type f -name UserConfig.smali
Telegram_decompiled/smali/org/telegram/messenger/UserConfig.smali
 ┬─[abhi@termux:~]─[]
╰─> grep -RE '".*"' Telegram_decompiled/smali/org/telegram/messenger/UserConfig.smali
.source "SourceFile"
            "Landroid/util/LongSparseArray<",
            "Lorg/telegram/messenger/SaveToGallerySettingsHelper$DialogException;",
            ">;"
            "Landroid/util/LongSparseArray<",
            "Lorg/telegram/messenger/SaveToGallerySettingsHelper$DialogException;",
            ">;"
            "Landroid/util/LongSparseArray<",
            "Lorg/telegram/messenger/SaveToGallerySettingsHelper$DialogException;",
            ">;"
    const-string v2, "selectedAccount"
    const-string v2, "registeredForPush"
    const-string v2, "lastSendMessageId"
    const-string v2, "contactsSavedCount"
    const-string v2, "lastBroadcastId"
    const-string v2, "lastContactsSyncTime"
    const-string v2, "lastHintsSyncTime"
    const-string v2, "draftsLoaded"
    const-string v2, "unreadDialogsLoaded"
    const-string v2, "ratingLoadTime"
    const-string v2, "botRatingLoadTime"
    const-string v2, "webappRatingLoadTime"
    const-string v2, "contactsReimported"
    const-string v2, "loginTime"
    const-string v2, "syncContacts"
    const-string v2, "suggestContacts"
    const-string v2, "hasSecureData"
    const-string v2, "notificationsSettingsLoaded4"
    const-string v2, "notificationsSignUpSettingsLoaded"
    const-string v2, "autoDownloadConfigLoadTime"
    const-string v2, "hasValidDialogLoadIds"
    const-string v2, "sharingMyLocationUntil"
    const-string v2, "lastMyLocationShareTime"
    const-string v2, "filtersLoaded"
    const-string v2, "premiumGiftsStickerPack"
    const-string v2, "lastUpdatedPremiumGiftsStickerPack"
# ... (redacted for brevity)
    const-string p1, ""
            "(I",
            "Landroid/util/LongSparseArray<",
            "Lorg/telegram/messenger/SaveToGallerySettingsHelper$DialogException;",
            ">;)V"
    const-string v2, "_"
 ┬─[abhi@termux:~]─[]
╰─> grep -R '"loginTime"' 'Telegram_decompiled/'
Telegram_decompiled/smali/org/telegram/messenger/UserConfig.smali:    const-string v2, "loginTime"
Telegram_decompiled/smali/org/telegram/messenger/UserConfig.smali:    const-string v2, "loginTime"
```

From the analysis, we could say that `loginTime` only appears in `UserConfig.smali`. So, we can use this as our signature rule for this class.

now our updated signature rule is:

```yaml
- name: "UserConfig"
  package: "org.telegram.messenger"
  signatures:
    - signature: 'loginTime'
      type: regex
      count: 2
```

`count` is the number of times the match should happen for it to be considered a match.

ok let’s try to run it:

```bash
 ┬─[abhi@termux:~/sigmatch]─[]
╰─> sigmatcher analyze 'Telegraph_T11.9.1 - P11.20.0_apks.apk' --signatures graph.yaml
I: Using Apktool 2.11.1 on Telegraph_T11.9.1 - P11.20.0_apks.apk with 8 threads
I: Baksmaling classes.dex...
I: Baksmaling classes2.dex...
I: Baksmaling classes5.dex...
I: Baksmaling classes4.dex...
I: Loading resource table...
I: Baksmaling classes3.dex...
I: Baksmaling classes6.dex...
I: Baksmaling classes7.dex...
I: Decoding file-resources...
I: Loading resource table from file: /home/abhi/.local/share/apktool/framework/1.apk
I: Baksmaling classes8.dex...
I: Baksmaling classes9.dex...
I: Baksmaling assets/audience_network.dex...
I: Decoding values */* XMLs...
I: Decoding AndroidManifest.xml with resources...
I: Regular manifest package...
I: Copying original files...
I: Copying assets...
I: Copying lib...
I: Copying unknown files...
{
    "UserConfig": {
        "original": {
            "name": "UserConfig",
            "package": "org.telegram.messenger"
        },
        "new": {
            "name": "tD",
            "package": "org.telegram.messenger"
        },
        "matched_methods": [],
        "matched_fields": []
    }
}
```

For the first time you’ll run `sigmatcher` it’ll decode the APK and store it under temporary directory `$HOME/.cache/sigmatcher`, after that it’ll use the decoded APK from the cache.

And we have it, our new package name is `org.telegram.messenger` and the new class name is `tD`.

let’s find the `isPremium` method in the `tD` class.

```smali
.method public isPremium()Z
    .locals 1

    iget-object v0, p0, Lorg/telegram/messenger/UserConfig;->currentUser:Lorg/telegram/tgnet/TLRPC$User;

    if-nez v0, :cond_0

    const/4 v0, 0x0

    return v0

    :cond_0
    iget-boolean v0, v0, Lorg/telegram/tgnet/TLRPC$User;->premium:Z

    return v0
.end method
```

So, `isPremium` has return type of bool (`Z`) and a field from TLRPC class named `premium` which is also a bool (`Z`). Also to make our match exact we’ll include the `currentUser` field from `UserConfig` class as well.

our new rule will look like this:

```yaml
- name: "UserConfig"
  package: "org.telegram.messenger"
  signatures:
    - signature: 'loginTime'
      type: regex
      count: 2
  methods:
    - name: "isPremium"
      return_type: "Z"
      signatures:
        - signature: 'iget-object ([v|p]\d+), ([v|p]\d+), Lorg/telegram/messenger/.*;->\w+:Lorg/telegram/tgnet/TLRPC\$User;'
          type: regex
          count: 1
        - signature: 'iget-boolean ([v|p]\d+), ([v|p]\d+), Lorg/telegram/tgnet/TLRPC\$User;->\w+:Z'
          type: regex
          count: 1
```

Now, let’s run the sigmatcher again:

```bash
 ┬─[abhi@termux:~/sigmatch]─[]
╰─> sigmatcher analyze 'Telegraph_T11.9.1 - P11.20.0_apks.apk' --signatures graph.yaml

{
    "UserConfig": {
        "original": {
            "name": "UserConfig",
            "package": "org.telegram.messenger"
        },
        "new": {
            "name": "tD",
            "package": "org.telegram.messenger"
        },
        "matched_methods": [
            {
                "original": {
                    "name": "isPremium",
                    "argument_types": "",
                    "return_type": "Z"
                },
                "new": {
                    "name": "O",
                    "argument_types": "",
                    "return_type": "Z"
                }
            }
        ],
        "matched_fields": []
    }
}
```

We can change the output format as well using `--output-format` flag.

```bash
 ┬─[abhi@termux:~/sigmatch]─[]
╰─> sigmatcher analyze 'Telegraph_T11.9.1 - P11.20.0_apks.apk' --signatures graph.yaml
--output-format enigma
CLASS org/telegram/messenger/tD org/telegram/messenger/UserConfig
        METHOD O isPremium ()Z
 ┬─[abhi@termux:~/sigmatch]─[]
╰─> sigmatcher analyze 'Telegraph_T11.9.1 - P11.20.0_apks.apk' --signatures graph.yaml
--output-format jadx
{
    "codeData": {
        "renames": [
            {
                "new_name": "org.telegram.messenger.UserConfig",
                "node_ref": {
                    "ref_type": "CLASS",
                    "decl_class": "org.telegram.messenger.tD"
                }
            },
            {
                "new_name": "isPremium",
                "node_ref": {
                    "ref_type": "METHOD",
                    "decl_class": "org.telegram.messenger.tD",
                    "short_id": "O()Z"
                }
            }
        ]
    }
}
 ┬─[abhi@termux:~/sigmatch]─[]
╰─> sigmatcher analyze 'Telegraph_T11.9.1 - P11.20.0_apks.apk' --signatures graph.yaml
--output-format legacy
{
    "UserConfig": {
        "className": "org.telegram.messenger.tD",
        "fields": {},
        "methods": {
            "isPremium": "O"
        }
    }
}
```

That’s it, we have successfully matched the `UserConfig` class and the `isPremium` method. The newer name of the class is `tD` and the newer name of the method is `O`.

After you’re done you can clear the cache by running `sigmatcher cache clean` or by manually removing the cache directory mentioned ealier.

You can similarly make rules for fields as well. Read more about signature rule format [here](https://github.com/oriori1703/sigmatcher?tab=readme-ov-file#creating-signature-files).

That’s all for this blog, hope you enjoyed it. If you have any questions, feel free to ask in the comments. Happy reversing!
