---
title: ValleyRAT masquerading as adware
source: https://securelist.com/valleyrat-backdoor-adware/121175/
source_host: securelist.com
clip_date: 2026-09-11T10:31:38+08:00
trace_id: 4b629bd0-26f0-4004-a58b-cce0dc81d77b
content_hash: f118f22dc069e9151120c0d24a7b77aade58bfd513b692a00b6df5c7ecfe7b63
status: synced
tags:
  - 恶意样本
  - 漏洞分析
series: null
feed_source: Kaspersky Securelist
ai_summary: 广告软件安装包实为 ValleyRAT 后门的投放载体，借合法签名的 QN Wallpaper 实施 DLL 侧加载，2026 年已感染超 1500 名用户，主要位于中国和印度。
ai_summary_style: key-points
images_status:
  total: 25
  succeeded: 25
  failed_urls: []
notion_page_id: 3d875244-d011-819f-849f-ff27087f69ae
ioc:
  cves: []
  cwes: []
  hashes:
    - 07ddbbe2c71c45577a7a4fbcdba0df91
    - 48826d5ca845979d2e6ebd66dc1aae90
    - 6c158c0f8e029342192d4f0d72e102b7
    - 7ad1e3ef4e6d9d636c9e7e967733850e
    - 96b4c1d0683dce22bd3223e1e40689c1
    - 9a71d6a41cd258b9e89cdc5fc224de73
    - 9b86d3ab6cef15c633933fbbeab39c0a
    - c24e99f9437feacaa63766a3cde3fe3d
    - edfdc30cbd85879776b8f735ea7de1f1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 广告软件安装包实为 ValleyRAT 后门的投放载体，借合法签名的 QN Wallpaper 实施 DLL 侧加载，2026 年已感染超 1500 名用户，主要位于中国和印度。
> 
> - **伪装机制：** 安装器按文件名后缀（DD/GG/HY）分别安装钉钉、Chrome 或跳转腾讯会议下载页，用以转移注意力；实际均释放被篡改的 QN Wallpaper 并写入注册表自启。
> - **侧加载链：** 恶意 `libcef.dll` 被 QnWallpaper.exe / QnwPlayer.exe 加载，导出函数被置入无限睡眠，真正恶意逻辑在 DllMain 触发，另留有未被调用的 RunDLL 入口。
> - **提权与载荷：** 非管理员时用 runas 重新拉起进程；载荷为 AES 加密 DLL，在 QnWallpaper 中取自 PeLoader 文件、在 QnwPlayer 中取自资源段，仅 C2 配置不同。
> - **反清除设计：** 注入 svchost 重启进程（PAGE_NOACCESS + 挂起线程 60 秒后恢复执行）、可配置将自身标记为 critical 进程（终止即蓝屏）、未处理异常时重启，并检测分析类窗口。
> - **能力：** 用 DirectInput8 记录按键与焦点窗口、抓取剪贴板、收集系统信息，支持关机重启、截屏、清日志、更新 C2、下载执行模块（shellcode 走 svchost 进程镂空）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a304b450f8facd9e.jpg)

Attackers typically try to pass off malware as legitimate applications or as potentially unwanted programs that users deliberately search for and download, such as cheats or cracks. They often rely on ad and affiliate networks to deliver their creations to victims’ devices. This post examines a less conventional case: a well-known backdoor distributed under the guise of adware. The attackers may have chosen this distribution method because the adware was signed by the developer. On top of that, users often manually add these apps to exclusions, so their useful features don’t get blocked.

Some time ago, a client asked us to analyze a file with the MD5 hash c24e99f9437feacaa63766a3cde3fe3d and add it to our detection database. We initially classified it as adware, but a cursory analysis turned up suspicious network activity, which prompted us to dig deeper. It turned out the sample did far more than serve ads. In fact, its advertising functionality doesn’t even work; instead, it triggers an infection chain that delivers the ValleyRAT backdoor.

## Malicious installer

The file the client shared with us turned out to be an installer that performed different actions depending on the two-letter suffix used in the file name, positioned just before the numeric string.

|     |     |
| --- | --- |
| **Installer name** | **What it does** |
| FS_SETUP_DD_173.exe | Installs DingTalk, a workplace collaboration platform |
| FS_SETUP_GG_173.exe | Installs Google Chrome |
| FS_SETUP_HY_173.exe | Opens hxxps://meeting\[.\]tencent\[.\]com/download/ |

These actions are most likely designed to divert the user’s attention away from the sample’s malicious functionality. Regardless of the file name, the installer deploys a modified Chinese desktop wallpaper management tool called QN Wallpaper (hxxps://qnwallpaper\[.\]keansoft\[.\]cn/) and adds it to the registry’s autorun entries.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6a06c51cdc5f3147.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145143/valleyrat-backdoor1.png)

The original version of QN Wallpaper is genuine adware: on installation, it delivers bundled partner apps to the device and then displays ad banners to the user. In this case, however, the attackers use it to carry out [DLL sideloading](https://encyclopedia.kaspersky.com/glossary/dll-sideloading/), a technique that allows malicious code to run under the guise of a signed process by way of a malicious DLL.

The QN Wallpaper modules, along with the malicious components, are unpacked to C:\\Program Files\\QNWallpaper\\5.4.0.1662\\<random string of letters and digits>. The following files are saved in that directory:

|     |     |     |
| --- | --- | --- |
| **File name** | **MD5** | **Purpose** |
| 1.zip | 7ad1e3ef4e6d9d636c9e7e967733850e | Archive containing the adware files QnWallpeper.exe and QnwPlayer.exe, along with the modules needed to run them |
| 7z.dll | 96b4c1d0683dce22bd3223e1e40689c1 | 7z archiver library |
| 7z.exe | 9b86d3ab6cef15c633933fbbeab39c0a | Archiver |
| chrome_elf.dll | edfdc30cbd85879776b8f735ea7de1f1 | Library used to launch Electron-based applications |
| libcef.dll | 07ddbbe2c71c45577a7a4fbcdba0df91 | Malicious library |
| PeLoader | 48826d5ca845979d2e6ebd66dc1aae90 | File containing the encrypted backdoor |
| QnWallpaper.exe | 6c158c0f8e029342192d4f0d72e102b7 | Adware module |
| QnwPlayer.exe | 9a71d6a41cd258b9e89cdc5fc224de73 | Adware module |
| <random string of letters and digits>Nedca.exe | c24e99f9437feacaa63766a3cde3fe3d | Malicious installer copy |

After unpacking, the installer uses the DisableAntiSpyware registry key to disable Windows Defender and then launches QnWallpaper.exe.

[![Disabling Windows Defender](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/891d57bc5116d11b.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145233/valleyrat-backdoor2.png)

Disabling Windows Defender

## DLL Sideloading via libcef.dll

QnWallpaper.exe has dependencies in libcef.dll, so this library gets loaded when the process starts. QnWallpaper.exe also launches QnwPlayer.exe, which likewise calls libcef.dll.

QnWallpaper and QnwPlayer won’t actually function correctly, because the functions exported from libcef.dll are put into an infinite sleep. However, in case that sleep is ever interrupted, the attackers have implemented a function that loads all the necessary functions from the original library into memory, provided it can locate that library on the system.

[![Example of an exported function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f3295c96a8d1d7d3.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145303/valleyrat-backdoor3.png)

Example of an exported function

[![Loading functions from the original libcef.dll](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/81bad01c88e5c29f.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145342/valleyrat-backdoor4.png)

Loading functions from the original libcef.dll

The malicious functionality in libcef.dll is invoked by a call to DllMain, which runs automatically when the library is loaded. That said, alongside the original exports, the library also contains a function named RunDLL, which likewise initiates execution of the malicious code. QnWallpaper never calls this function. We suspect the attackers intended to invoke it manually via rundll32 or planned to use a separate executable for this purpose, one that wasn’t included in the package downloaded by the sample.

[![The RunDLL function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/96b44cb5999e5f94.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145418/valleyrat-backdoor5.png)

The RunDLL function

### Running the malicious code

When the library is loaded, code runs that ensures QnWallpaper.exe persists at startup: it adds a file extension association and drops a file with the corresponding extension in C:\\Documents and Settings\\<username>\\Start Menu\\Programs\\Startup\\.

This is followed by a chain of wrapper functions whose main job is to call the next one. Execution eventually reaches the function that contains the actual malicious code. For convenience, we’ll refer to it as mw_entry.

Inside mw_entry, the malware checks two things:

-   Whether the current user belongs to the Administrators group
-   Which process the DLL is running inside

[![Checking for administrator privileges](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/50d71335e34d4832.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145447/valleyrat-backdoor6.png)

Checking for administrator privileges

If the user isn’t a member of the Administrators group, the program attempts to obtain administrator privileges by using the runas utility.

[![Relaunching the process to obtain administrator privileges](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d33bc2d4b905840e.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145529/valleyrat-backdoor7.png)

Relaunching the process to obtain administrator privileges

Once it has administrator privileges, the malicious code determines which process the DLL has been loaded into, and selects the payload accordingly:

-   If the library is running inside QnWallpaper.exe, the payload is loaded from the PeLoader file.
    
    [![Encrypted payload](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56a04dc80fb8d5e6.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145608/valleyrat-backdoor8.png)
    
    Encrypted payload
    
-   If the library is running inside QnwPlayer.exe, the payload is loaded from libcef.dll resources.
    
    [![Retrieving the payload from a resource](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3040c83f64a28eb1.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145739/valleyrat-backdoor9.png)
    
    Retrieving the payload from a resource
    

Both payloads are AES-encrypted DLLs that contain the ValleyRAT backdoor. The only difference between them is their configuration, specifically, the C2 server addresses. After decryption, libcef.dll checks the magic signatures in the resulting PE file’s headers to confirm the sample is valid. If this check fails, the library releases its resources and takes no further action.

[![Validating the PE file headers after decryption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7b1c8b86a0546c7b.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145859/valleyrat-backdoor10.png)

Validating the PE file headers after decryption

If the headers check out, libcef.dll loads the payload into the process’s memory space and hands control over to the backdoor by calling DllMain.

[![Calling DllMain](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0be00213092504aa.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28145936/valleyrat-backdoor11.png)

Calling DllMain

## ValleyRAT

ValleyRAT begins its operation by parsing its configuration, which consists of key:value pairs concatenated into a single string. To obfuscate this configuration, the attackers wrote the string in reverse.

[![Obfuscated configuration](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ea68e48c4d7cecf6.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150003/valleyrat-backdoor12.png)

Obfuscated configuration

During parsing, the backdoor restores the correct character order and reads the key values one by one. The set of keys is the same regardless of which process the backdoor is running in.

[![Parsing the configuration](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/216e74db3598fb24.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150034/valleyrat-backdoor13.png)

Parsing the configuration

Some of the configuration fields are listed below:

|     |     |
| --- | --- |
| **Key** | **Description** |
| p?  | C2 server IP address |
| o?  | C2 server port |
| t?  | Protocol (1: TCP, 0: UDP) |
| dd  | Sleep duration before executing the main code |
| cl  | Sleep duration after receiving the corresponding command from the server |
| bz  | Configuration creation date |
| bh  | Whether to mark the current process as critical (so that terminating it triggers a blue screen of death) Possible values: 1: yes, 0: no |
| ll  | Whether to check for running security/traffic-analysis tools/processes (1: check, 0: do not check) |
| sh  | Whether to inject code into svchost that will restart the malicious process (1: inject, 0: do not inject) |

The backdoor uses several techniques to protect its process. Some are configuration-dependent, while others are always applied:

-   Injecting code into svchost to restart the process: a configurable option. The backdoor allocates memory inside the svchost process, injects code into it, and sets PAGE_NOACCESS permissions on the memory page containing the injected data. It then creates a suspended thread, waits 60 seconds, grants read, write, and execute permissions on the page, and resumes the thread.
    
    [![Injecting code into svchost](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/850313f39a2503cf.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150122/valleyrat-backdoor14.png)
    
    Injecting code into svchost
    
    The function injected into the process has a single job: restart the backdoor if its execution is interrupted for any reason.
    
    [![Injected function](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5dbb7a14d451f2a3.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150154/valleyrat-backdoor15.png)
    
    Injected function
    
-   Marking its own process as critical (so that terminating it triggers a blue screen of death): a configurable option.
    
    [![Setting its own process as critical](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9e017cdbe7afcd7f.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150224/valleyrat-backdoor16.png)
    
    Setting its own process as critical
    
-   Restarting on an unhandled exception. This protection mechanism is always active, regardless of the backdoor’s configuration.
    
    [![Restarting on exceptions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/655e5d082c6a1cb5.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150254/valleyrat-backdoor17.png)
    
    Restarting on exceptions
    

The backdoor also has spyware functionality. While running, it tracks keystrokes and the currently focused window by using functions from the DirectInput8 library. It also captures clipboard contents. All collected data is saved to a file on disk.

[![Capturing clipboard data](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/278cbc07e2c45f64.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150326/valleyrat-backdoor18.png)

Capturing clipboard data

If the ll key in the configuration is set to 1, ValleyRAT periodically checks for active windows belonging to applications that could be used to analyze processes or traffic. Window enumeration is done via the EnumWindows function, using the following callback:

[![Window name checks](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/76aac287cebd1a18.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150400/valleyrat-backdoor19.png)

Window name checks

After completing these checks, the backdoor collects system information, including:

-   Host name
-   Host IP addresses
-   User idle time
-   Detailed Windows version information (ProductName, EditionId, DisplayVersion)
-   Number of CPU cores
-   Free disk space
-   Graphics adapter
-   Currently focused window and its title
-   System bitness
-   Language settings
-   Path to the system directory

On command, the backdoor can perform the actions typical of this malware category:

-   Rebooting the computer
-   Shutting down the computer
-   Taking a screenshot
-   Wiping logs
-   Updating its C2 addresses
-   Downloading additional modules
-   Sending keylogger logs along with clipboard contents

[![Snippet of the command handler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/82f9273ace42ae74.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150440/valleyrat-backdoor20.png)

Snippet of the command handler

Let’s take a closer look at the module-loading functionality. Upon receiving the corresponding command with a link from its operator, the backdoor downloads the file at that link and executes it. The download can come from either the C2 server or a third-party address.

[![The DownloadPeFile function is responsible for downloading a PE file](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d3bb05b891d8fc0b.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150518/valleyrat-backdoor21.png)

The DownloadPeFile function is responsible for downloading a PE file

[![The DownloadAndExecute function calls DownloadPeFile, then launches the downloaded module](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f58f48a0c8b5c744.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150610/valleyrat-backdoor22.png)

The DownloadAndExecute function calls DownloadPeFile, then launches the downloaded module

Additional modules can take the form of purpose-built dynamic libraries or shellcode. If the payload is shellcode, the backdoor uses [process hollowing](https://attack.mitre.org/techniques/T1055/012/) with svchost to launch the module.

[![Implementation of the process hollowing technique](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d684da8c20325e3f.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150658/valleyrat-backdoor23.png)

Implementation of the process hollowing technique

If the module is a dynamic library, the backdoor loads the PE file into its own process, calls DllMain, and searches for a Main function among the exported functions. Once Main has been called, the library is unloaded from memory.

[![Calling DllMain after the backdoor loads the PE file](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a9c8eafb81a0b072.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/08/28150727/valleyrat-backdoor24.png)

Calling DllMain after the backdoor loads the PE file

## Targets and attribution

Over the course of 2026, we detected the ValleyRAT backdoor and its associated malware more than 100,000 times, with more than 1500 unique users affected, primarily in China and India.

This attack geography, combined with the use of the ValleyRAT backdoor, points to [Silver Fox](https://securelist.com/tr/silver-fox-tax-notification-campaign/120038/), a known operator of this malware family, as the likely group behind the campaign.

## Conclusion

This case is a clear example of how adware and affiliate networks can turn out to be far more dangerous than they appear. ValleyRAT is a sophisticated backdoor capable of collecting sensitive data such as keystrokes and clipboard contents, taking screenshots, and delivering additional malicious modules. The attackers exploited a well-known adware application to run the backdoor under the guise of a signed process, which complicates detection.

Motivated by both cyberespionage and financial gain, Silver Fox targets organizations across multiple countries. To stay protected, organizations should keep [employee cybersecurity awareness](https://www.kaspersky.com/enterprise-security/security-awareness?icid=gl_sl_lnk-security-awareness_sm-team_df95e80a3921c34d) up to date and enforce clear policies on the use of third-party software on work devices.

For individual users, we recommend avoiding the installation of software with a questionable reputation, and, even more importantly, never adding such software to your security solutions’ exclusion lists.
