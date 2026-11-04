---
title: You can hide an elephant in AndroidManifest.xml
source: https://blog.azzahid.com/posts/android-manifest-hide-payload/
source_host: blog.azzahid.com
clip_date: 2026-11-04T10:41:11+08:00
trace_id: feb7cca3-9061-4364-accd-989b24107720
content_hash: 65c231ff5487f5d86a374d44cefcc7b1cb194fab3125d5b674f369944ad87c46
status: synced
tags:
  - Android逆向
  - 协议分析
series: null
feed_source: Zahid·Android安全
ai_summary: AXML 清单声明大小之外的追加字节会被 Android 静默忽略，借此可在 AndroidManifest.xml 中藏匿任意数据，且应用仍正常安装、主流工具无法察觉。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-8141-bb38-d79a0ed042d3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AXML 清单声明大小之外的追加字节会被 Android 静默忽略，借此可在 AndroidManifest.xml 中藏匿任意数据，且应用仍正常安装、主流工具无法察觉。
> 
> - **格式背景：** APK 内的 AndroidManifest.xml 并非纯文本，而是 Google 未正式命名的二进制 AXML 格式，由构建工具 AAPT 预先编译成固定布局的 chunk 结构，运行时可 `mmap` 直接读取，省去每次启动解析 XML 的开销。
> - **隐藏原理：** 文件开头 4 字节字段声明总大小，Android 只解析声明范围内的内容；写入 chunk 之间或文件尾部的额外字节会被直接忽略，应用照常安装。
> - **写入方法：** 保持总大小字段指向原始结尾，其后追加 MAGIC 标记 + 小端 4 字节长度前缀 + payload，再重新打包、对齐并签名——签名必须最后执行，因为现代签名方案覆盖归档全部内容。
> - **读取方法：** Android 允许应用无限制读取自身 APK，运行时用 `ZipFile` 打开 `sourceDir`，取出 manifest 条目，定位标记后按长度前缀读出 payload。
> - **能力与局限：** 数据对 jadx、androguard 及已安装应用的可见结构完全隐形，大小仅受 APK 体积限制；唯一藏不住的是负责查找这些数据的代码本身。

The Android manifest is one of those corners of Android development and security that you rarely think about, because it just works.

Whether you are building apps or doing security research, you almost always meet it in plain text: in jadx, in Android Studio, in whatever tooling you reach for. It reads like an ordinary text file you can open, copy, or edit. That impression holds right up until you unzip an `.apk` directly and open `AndroidManifest.xml` in a text editor, at which point it falls apart. What you get is mostly garbled bytes with a few familiar words scattered through it, because the file on disk is not text at all. It is stored in a binary format that Google never officially named, though it gets called binary XML, compiled XML, or, most often in the community, AXML (Android XML).

Which raises the obvious question: why ship apps with this awkward format instead of the plain text that is so much easier to work with?

## 二进制化的原因

The answer is partly historical and partly the old tradeoff that what is easy for humans tends to be hard for machines. Early Android devices were underpowered, and parsing plain-text XML at runtime is not free. You have to tokenize it, validate it, build a DOM, intern strings, and repeat the whole sequence every time the file is read. On a phone with little RAM and a slow CPU, that cost lands in exactly the wrong place: at app startup, on every launch.

Android avoids it by paying the cost once, ahead of time, in the build tool AAPT (the Android Asset Packaging Tool), which compiles the XML into a binary AXML file. Reading that file later is closer to casting than to parsing. The format is chunk-based, built from fixed-layout structs, so Android can map it straight into memory with `mmap` and read it in place. There is more to it than that, but the rest is out of scope here.

## 解析器差异利用

This is also where the format gets interesting from a security angle, because every format carries its own opportunities for corruption and exploitation, and AXML is no exception. The dominant category is parser differentials: cases where Android’s on-device loader and third-party analysis tools disagree about what the manifest actually says. The usual play is to corrupt the file just enough that analysis tools choke and give up, while the runtime parses it without complaint.

I want to come at it from the opposite direction. Rather than corrupting the manifest to break parsers, I am interested in something far less documented: storing usable data inside the manifest where every parser is blind to it, while the app still installs cleanly. And reading it back, since there is little point in hiding something you can never recover.

The format itself suggests how. AXML is chunk-based, which means it declares up front how large it is and where it ends, and each internal section does the same. So the theory is simple: what happens if you write bytes past the point where the file claims to end? It turns out Android does not care. Extra data sitting between chunks, or appended to the tail of the file, is simply ignored.

## payload 写入方法

Concretely, that outer size lives in a 4-byte field near the start of the file. You leave it pointing at the original end of the manifest, then write your payload after that boundary, so everything you add falls outside what the file admits to containing:

```python
struct.pack_into("<I", m, 4, len(m))   # AXML's total-size field: still points at the real end
return bytes(m) + MAGIC + struct.pack("<I", len(payload)) + payload
```

The rest of the recipe is just packaging. Build an app, extract its compiled manifest, append the payload as above, put it back, then zip, align, and sign the APK. Signing has to come last, since modern signature schemes cover the archive’s contents, but once it does, every common tool and Android itself treats the result as though nothing had happened.

## payload 提取方法

Getting the data back out is easier than the hiding was, because Android lets an app read its own APK without restriction. The running process opens its own APK as a zip, pulls out the manifest entry, finds the marker, and reads the length-prefixed payload that follows it:

```kotlin
private fun extractFromOwnManifest(): ByteArray {
    val apk = ZipFile(applicationInfo.sourceDir)
    val manifest = apk.getInputStream(apk.getEntry("AndroidManifest.xml")).readBytes()
    val at = manifest.indexOf(MAGIC)
    if (at < 0) return ByteArray(0)
    val lenOff = at + MAGIC.size
    val n = ByteBuffer.wrap(manifest, lenOff, 4).order(LITTLE_ENDIAN).int
    return manifest.copyOfRange(lenOff + 4, lenOff + 4 + n)
}
```

The result is an app that carries arbitrary data invisible to jadx, androguard, and the installed app’s visible structure, bounded only by how large an APK you are willing to ship. There is exactly one thing you cannot hide. The data may be invisible, but the code that goes looking for it has to live somewhere, and that is where anyone watching closely will eventually look.
