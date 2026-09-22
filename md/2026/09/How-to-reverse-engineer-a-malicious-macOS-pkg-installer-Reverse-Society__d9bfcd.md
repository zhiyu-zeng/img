---
title: How to reverse engineer a malicious macOS pkg installer? | Reverse Society
source: https://blog.reversesociety.co/blog/2025/how-to-reverse-engineer-malicious-macos-pkg-installer
source_host: blog.reversesociety.co
clip_date: 2026-09-22T10:20:46+08:00
trace_id: ae87a0e7-1401-4361-b7df-2ebfb0167498
content_hash: f2e1f1d5aecf74e236e57f21c4802f99a3074f6965151fd6f21cbebd3bba0acb
status: synced
tags:
  - macOS逆向
  - 恶意样本
series: null
feed_source: Reverse Society·iOS/macOS
ai_summary: 用 `pkgutil` 逐层展开嵌套 macOS `.pkg` 并解出 gzip+cpio 格式的 Payload，即可拿到恶意载荷与 pre/postinstall 脚本。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 7
  failed_urls:
    - /posts/pkg/suspicious-package-all-scripts.png
notion_page_id: 3e375244-d011-8193-9224-fa7a679f99be
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 `pkgutil` 逐层展开嵌套 macOS `.pkg` 并解出 gzip+cpio 格式的 Payload，即可拿到恶意载荷与 pre/postinstall 脚本。
> 
> - **包结构：** distribution 包可嵌套 component 包；component 由 Payload（落盘文件）、Scripts（preinstall/postinstall）与 PackageInfo（安装路径、标识、版本）组成；Bom 是文件清单，可用 lsbom 查看。
> - **pkgutil 关键命令：** `--check-signature` 显示签名被吊销（Developer ID Installer: weihui chen），`--payload-files` 列出安装后落盘的全部文件，`--expand` 只解出包结构而不展开内层，`--expand-full` 才会递归展开嵌套包，是处理复杂样本的核心。
> - **Payload 解包：** Payload 实为 gzip 压缩的 cpio 归档，依次执行 `gzip -dc Payload > Payload.cpio`、`cpio -i < Payload.cpio` 即可还原出 `/Library` 目录。
> - **样本结构：** `zmn2.0.6839.pkg` 内嵌 `config.pkg`，再内嵌 `program.pkg`，最终释放 `bin/` 与 `bin_arm/` 两套 `wsus` 及 libQQRobber、libWXRobber、libNTQQRobber 等 dylib，并用 LaunchDaemons 的 plist 实现持久化。
> - **隐藏与替代方案：** 对 `/usr/sbin/pkgutil` 执行 strings 可发现未文档化的 `--expand-full`、`--flatten-full`；`brew install --cask suspicious-package` 可图形化查看签名、全部文件、嵌套安装包与所有安装脚本。

[](https://blog.reversesociety.co/blog?tag=macos)

[macos](https://blog.reversesociety.co/blog?tag=macos)

[

pkg

](https://blog.reversesociety.co/blog?tag=pkg)[

installer

](https://blog.reversesociety.co/blog?tag=installer)[

reverse engineering

](https://blog.reversesociety.co/blog?tag=reverse%20engineering)[

malware

](https://blog.reversesociety.co/blog?tag=malware)

## The context: PasivRober

I spent a few hours this week trying to reverse engineer the PasivRober malware sample. I had the [writeup by Kandji](https://www.kandji.io/blog/pasivrobber) and the sample provided by Objective-See organization on GitHub.

The malware was hidden inside multiple nested `.pkg` installers, and I realized that there was no clear guide on how to extract payloads from malicious package installers. This is why I wanted to write this post - to explain the basics of how to extract payloads from malicious macOS package installers.

Today we'll talk about package installers, aka `.pkg` files, and how to properly extract their contents for analysis.

## What this post will and won't cover

**What we will do:**

-   Extract payload and scripts from package installers
-   Understand the structure of macOS package installers
-   Learn how to handle nested packages and complex installer structures

**What we won't do:**

-   Reverse engineer the PasivRober malware (the [Kandji post](https://www.kandji.io/blog/pasivrobber) is the gold standard for that)
-   Provide a full reverse engineering guide for package installers

This post focuses on the technical process of extracting package installer contents, which you can reuse with other malware.

## The PasivRober sample

First, I unzipped the malware sample which contains three files:

-   A README file which contains a link to the writeup
-   A binary named `wsus`
-   A package installer named `zmn2.0.6839.pkg`

> I'll understand later that the binary is contained in the package installer...

As I am in an isolated environment and also because I am curious to see what it looks like, I tried to open it with the classic double-click, but...

![impossible to open this pkg](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/494943e27c5e7466.png)

I am curious to understand how the operating system recognized it. Looking at the Xprotect logs, I can see that macOS performed a background analysis and detected it as malware. But maybe in another post...

The `.pkg` is now in the bin. I'll have to find another way to interact with it.

I would like to check the content of the installer. I naturally right-click, but I don't find the usual "Show Package Contents" option available. We need an alternative solution.

> Note: I'll learn later that the "Show Package Contents" is reserved for installers that are "legacy" (or "bundled").

## Manual package content extraction

If you are familiar with the macOS ecosystem, you probably already know that there is a `pkgutil` CLI.

There are a bunch of commands I would like to try. Let's start with `--check-signature`:

```bash
pkgutil --check-signature zmn2.0.6839.pkg
Package "zmn2.0.6839.pkg":
   Status: revoked signature
   Signed with a trusted timestamp on: 2024-04-19 10:28:49 +0000
   Certificate Chain:
    1. Developer ID Installer: weihui chen (QPV7YX8YQ9)
..
```

The second command I am interested in is the `--payload-files` command:

```bash
pkgutil --payload-files zmn2.0.6839.pkg
.
./Library
./Library/program.pkg
./Library/.temp
./Library/.temp/update_config_arm
./Library/.temp/update_config
./Library/LaunchDaemons
./Library/LaunchDaemons/com.myam.plist
```

We have a first view of the `Library` folder files contained in the package. We can already notice that there is another installer named `program.pkg`. We can also see that there is an `update_config` program, hard to say if it is a script or an executable at a glance. Finally, we have a `.plist` file which is probably related to a LaunchDaemon, probably used for persistence.

Now, I would like to extract those files and start my analysis. There is one last `pkgutil` command that will help me to do that:

```bash
pkgutil --expand zmn2.0.6839.pkg zmn2_pkg
```

The `--expand` should have expanded the package into `zmn2_pkg`. So let's inspect the content of it:

```bash
tree zmn2_pkg/
zmn2_pkg/
├── Distribution
├── Resources
│   └── en.lproj
│       └── Localizable.strings
└── config.pkg
    ├── Bom
    ├── PackageInfo
    ├── Payload
    └── Scripts
        ├── postinstall
        └── preinstall

5 directories, 7 files
```

First surprise, we don't find files and folder we saw in the previous command. This is due to the fact that this command simply extract the content of the package, while the `--payload-files` represent file that will be installed on the machine after the installer has finished.

Also, we have two nested installers here:

-   `zmn2.0.6839.pkg` which is a distribution installer
-   `config.pkg` which is a component package (the nested one)

> There is a third one called "bundled" or legacy.

What is the difference between these installers?

## Distribution installer vs Component installer

Before we start diving into installers, I'll skip the legacy one, as Apple started to deprecate them.

### Distribution

As the high-level package we met is a distribution one, let's start with that.

The most important thing to know about distribution packages is that they can contain other packages.

Let me show you an example:

![distribution-pkg-preview](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48745ee386926c45.png)

Here, you can select the package you would like to install.

Another particularity of the distribution package is that it can contain additional resources to customize the experience of the user during installation, like a license for instance.

### Component

The component package installer has two parts:

-   Payload: all the files that will be installed on the Mac. It could be a binary for instance, an application or a script.
-   Scripts: post and pre-install scripts (we had pre and postflight in legacy package installers)
-   PackageInfo: this is a plist file that contains information like where the package should be installed, the identifier and the version.

It could have one or the other or both.

> Note: Distribution installers could also contain Scripts and Payload.

### Flat!

At the beginning of my research, I read somewhere (sorry for the lack of precision) that these packages were called "flat packages". But what does flat mean?

The creator of the ["Packages"](http://s.sudre.free.fr/Software/Packages/about.html) application also wrote documentation about the [flat package format](http://s.sudre.free.fr/Stuff/Ivanhoe/FLAT.html).

> "This file is actually a xar archive."

I did not need to interact with `xar` directly, but I think that it is good to have it in mind.

Now let's try to extract the payload.

## Extract Payload

First, let's try to see what the Payload itself is:

```bash
file zmn2_pkg/config.pkg/Payload 
zmn2_pkg/config.pkg/Payload: gzip compressed data, from Unix, original size modulo 2^32 80451072
```

So let's decompress it with `gzip`. We'll use the following flags:

-   `-d` for decompress
-   `-c` for sending output to `stdout`

We'll redirect `stdout` to the `Payload.cpio` file:

```bash
gzip -dc Payload > Payload.cpio
```

You'll notice that I used the `.cpio` extension. Indeed, if you try to see what kind of file it is:

```bash
file Payload.cpio
Payload.cpio: ASCII cpio archive (pre-SVR4 or odc)
```

... you'll find that this is a `cpio` archive. According to Wikipedia:

> cpio is a general file archiver utility and its associated file format. It is primarily installed on Unix-like computer operating systems. The software utility was originally intended as a tape archiving program as part of the Programmer's Workbench (PWB/UNIX), and has been a component of virtually every Unix operating system released thereafter.

Darwin comes with its `cpio` command too:

```bash
where cpio
/usr/bin/cpio
```

We'll redirect the output of the `Payload.cpio` to the input of the `cpio` command by using the `-i` flag:

```bash
cpio -i < Payload.cpio
157131 blocks
```

Now I have a `/Library` folder. Let's see what we have inside:

```bash
tree Library/
Library/
├── LaunchDaemons
│   └── com.myam.plist
└── program.pkg
```

We are getting closer as we can see file names output by the `pkgutil --payload-files` we previously used.

Now that I am writing this post, I realize that the `--payload-files` was doing a kind of recursive job to extract each nested `.pkg` and `Payload`.

### Undocumented pkgutil commands

There is not a lot of content around pkg installers, but I found one really nice talk that mentioned some undocumented methods. You can watch this [macOS application packaging 101 video by Rich Trouton](https://www.youtube.com/watch?v=KAIqti-yvV0) for more details.

Let's try to find them by ourselves using the `strings` command:

```bash
strings /usr/sbin/pkgutil
@(#)PROGRAM:pkgutil  PROJECT:pkgutil-860
INSTALL_TARGET_VOLUME
help
debug
terse
...
flatten
flatten-full // Bingo!
expand
expand-full // Bingo!
```

We have two strings which seem to be flags. If we take the latter two, it seems that the `--expand` command we saw earlier has a `full` version.

Let's try that out:

```bash
pkgutil --expand-full zmn2.0.6839.pkg zmn2_pkg
```

Let's see what we have in there:

```bash
tree zmn2_pkg/
zmn2_pkg/
├── Distribution
├── Resources
│   └── en.lproj
│       └── Localizable.strings
└── config.pkg
    ├── Bom
    ├── PackageInfo
    ├── Payload
    │   └── Library
    │       ├── LaunchDaemons
    │       │   └── com.myam.plist
    │       └── program.pkg
    └── Scripts
        ├── postinstall
        └── preinstall

8 directories, 8 files
```

Now that I am writing this post, it makes a lot of sense as the `--payload-files` was able to give me the list of all nested files.

All nested files? We see here that the `program.pkg` is still not expanded...

## The last hidden pkg

```bash
pkgutil --expand-full program.pkg program_pkg
```

```bash
program_pkg/
├── Distribution
├── Resources
│   └── en.lproj
│       └── Localizable.strings
└── program.pkg
    ├── Bom
    ├── PackageInfo
    ├── Payload
    │   └── Library
    │       └── protect
    │           └── wsus
    │               ├── Config
    │               │   ├── CN
    │               │   │   ├── LocList.xml
    │               │   │   ├── MapString.Ini
    │               │   │   └── Plugin.ini
    │               │   ├── HtmlStyle
    │               │   │   ├── ChatInstall
    │               │   │   │   ├── SmartViewer
    │               │   │   │   │   └── SmartViewer.exe
    │               │   │   │   ├── install.bat
    │               │   │   │   └── uninstall.bat
    │               │   │   ├── chat.css
    │               │   │   ├── chatMsg.js
    │               │   │   ├── images
    │               │   │   │   ├── recive-bottom-other.gif
    │               │   │   │   ├── [... truncated]
    │               │   │   │   └── send-top.gif
    │               │   │   ├── style.css
    │               │   │   ├── test.mp4
    │               │   │   └── test.wav
    │               │   └── TableCfg.xml
    │               ├── Version.ini
    │               ├── bin
    │               │   ├── apse
    │               │   ├── center
    │               │   ├── com.myam.plist
    │               │   ├── goed
    │               │   ├── libCrashError.dylib
    │               │   ├── libDB.dylib
    │               │   ├── libFileSystem.dylib
    │               │   ├── libFmpExportDll.dylib
    │               │   ├── libIMKeyTool.dylib
    │               │   ├── libLogManager.dylib
    │               │   ├── libNTQQRobber.dylib
    │               │   ├── libPluginSDK.dylib
    │               │   ├── libQQRobber.dylib
    │               │   ├── libUtility.dylib
    │               │   ├── libWXRobber.dylib
    │               │   ├── libXml.dylib
    │               │   ├── libfun.dylib
    │               │   ├── liblz4.dylib
    │               │   ├── libuchardet.dylib
    │               │   ├── libwxworks.dylib
    │               │   ├── lipo
    │               │   ├── plugins
    │               │   │   ├── zero_1.0.gz
    │               │   │   ├── [...truncated]
    │               │   │   └── zero_6.0.gz
    │               │   ├── update_config
    │               │   └── wsus
    │               └── bin_arm
    │                   ├── [... Same as /bin]
    │                   └── wsus
    └── Scripts
        └── postinstall
```

I think that now we have extracted all that we need to start our analysis...

## Bom: the forgotten part of this post?

This post was mainly focused on the extraction of the payload and scripts, which is why I did not detail much about it.

According to the flat package format documentation, this is a "Bill of materials".

```bash
file Bom 
Bom: Mac OS X bill of materials (BOM) file
```

Let's see which commands could be related to `bom`:

```bash
man -k bom
```

Which outputs:

```bash
bom(5)                   - bill of materials
lsbom(8)                 - list contents of a bom file
mkbom(8)                 - create a bill-of-materials file
PPI::Token::BOM(3pm)     - Tokens representing Unicode byte order marks
```

First, I am curious to understand what it means. Let's take a look at the `bom` man page:

```bash
The Mac OS X Installer uses a file system "bill of materials" to determine which files to install, remove, or upgrade.
```

Not sure it would help much, but you can still inspect the content of it with the `lsbom` command.

Before we come to a conclusion, let's explore a nice tool.

## Suspicious Package: the easy way

It was really interesting to go through these concepts and new commands. It allowed me to better understand how a payload could be hidden in a package installer.

That being said, there is a simpler way to gather all this data without all the pain we had so far.

This is the time to introduce: "Suspicious Package".

You can install it through:

```bash
brew install --cask suspicious-package
```

Then you can open it from the location where your package is:

```bash
open /Applications/Suspicious\ Package.app/
```

Once open, you should see:

![suspicious package application main view](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2a814c1987fe522f.png)

You can select the installer of your choice:

![suspicious package info tab](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e078c9b86bab4417.png)

Here you'll see a summary of the installer, plus code signing information. There is also an "All files" tab:

![suspicious package all files tab](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/77382b2ffd00bcc8.png)

From there you can also open nested installers:

![suspicious package open nested installer](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed7601e2fbec31b7.png)

And finally, an "All scripts" tab where you can inspect pre and post-installation scripts:

![⚠️ 图片托管失败 · suspicious package all scripts view](/posts/pkg/suspicious-package-all-scripts.png)

![⚠️ 图片托管失败 · suspicious package all scripts view](https://blog.reversesociety.co/posts/pkg/suspicious-package-all-scripts.png)

## Conclusion

In this post, we've covered the essential techniques for extracting and analyzing malicious macOS package installers. Here's what we learned:

**Key takeaways:**

-   Package installers can contain nested structures that hide malicious payloads
-   `pkgutil` provides powerful commands for inspection and extraction
-   The `--expand-full` command is crucial for handling complex nested packages
-   Suspicious Package offers a user-friendly alternative for quick analysis

These techniques are fundamental for malware analysis on macOS. Whether you're analyzing PasivRober or any other malicious package installer, the same extraction process applies. The tools and commands we covered will help you understand what's inside these packages.

For deeper malware analysis, remember to check out the [Kandji writeup on PasivRober](https://www.kandji.io/blog/pasivrobber) and the [macOS application packaging video](https://www.youtube.com/watch?v=KAIqti-yvV0) for a deep dive into package installers.

References:

-   [Apple Package Installer Documentation](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution#Build-an-Installer-package)
-   [Flat format documentation](http://s.sudre.free.fr/Stuff/Ivanhoe/FLAT.html)
-   [Package Application](http://s.sudre.free.fr/Software/Packages/about.html)
-   [Suspicious Package Application](https://mothersruin.com/software/SuspiciousPackage/)
-   [PasivRober writeup by Kandji](https://www.kandji.io/blog/pasivrobber)
-   [YouTube video about pkg installers](https://www.youtube.com/watch?v=KAIqti-yvV0)
![Tony Gorez, Offensive Security Researcher](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e518e176c75b8261.png)
