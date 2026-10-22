---
title: "LG Updated Its “Adware” :: Xusheng Li"
source: https://xusheng.dev/posts/reversing/lg_monitor_app_manager_update/readme/
source_host: xusheng.dev
clip_date: 2026-10-22T10:30:30+08:00
trace_id: 7f304a16-c292-447c-9af7-88474d617797
content_hash: 47b1c7e33748287994e3c2a966f197e542595bc49c33afce274d3f35b196c21f
status: synced
tags:
  - Windows逆向
  - .NET逆向
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: TL;DR：LG 通过 Windows Update 推送新版 SoftwareComponent，把「静默装商店应用」的 INF 指令换成「自动执行混淆过的 .NET 弹窗程序」，虽有同意框，但代码仍在未征求同意前就运行。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 40175244-d011-81f1-8794-d1dab11fb595
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：LG 通过 Windows Update 推送新版 SoftwareComponent，把「静默装商店应用」的 INF 指令换成「自动执行混淆过的 .NET 弹窗程序」，虽有同意框，但代码仍在未征求同意前就运行。
> 
> - **旧机制：** 旧 INF 用 `SoftwareType=2` 加 `SoftwareID=pfn://LGElectronics.LGMonitorApp_cfnzzhwkr8z5w`，由 Windows 无提示安装商店应用。
> - **新机制：** 更新到 `2.0.2026.810` 后改用 `SoftwareType=1`，在设备安装期以提权方式执行 Driver Store 里的 `LGMonitorInstallManager.exe /driverflow /campaign:1 /delay:60 <DeviceInstanceID>`，系统事件 165 佐证。
> - **程序动作：** 这是被 Eazfuscator.NET 混淆的 2.2 MB .NET WinForms 程序；它复制自身到 Program Files、建全局 Run 项与卸载项「LG Monitor Software Notice」、写 `state.ini`、在用户会话再启一份、并建清理任务，等 60 秒后弹窗。
> - **抑制弹窗的条件：** 旧驱动包仍残留、商店应用已安装、本次 campaign 已回答或已有副本运行；作者本机未弹窗，正是旧驱动仍在 Driver Store 中压过新版。
> - **点“Install”之后：** 调 `winget install --id 9PM9N6F47JB8 --source msstore --silent`，装的仍是旧驱动曾直接安装的同一个 `LGElectronics.LGMonitorApp`；作者认为该流程仍未解决同意权问题，只需给下载链接即可。

LG has been under fire for what its devices do after people buy them. [Gamers Nexus found](https://www.youtube.com/watch?v=Q9uefFYe6bM) that some LG monitors caused Windows to install an LG app that promoted more software, including McAfee. More recently, its investigation [216,000,000 Spy TVs: The LG Smart TV Problem](https://www.youtube.com/watch?v=6IFVTcM28KA) examined LG’s Automatic Content Recognition and other privacy concerns. Different products, same question: **who decides what a device does after it enters your home?**

I [previously reversed LG’s Monitor App Installer](https://xusheng.dev/posts/reversing/lg_monitor_app_manager/readme/) and the driver that installed it. Today, Windows Update offered a new version of that SoftwareComponent. Given the recent criticism, I wanted to know what LG had changed.

![LG Electronics SoftwareComponent update](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3968dbae7aebf58c.png)

## Inside the update

I exported version `2.0.2026.810` from the Driver Store. It contains three files:

```text
LGMonitorAppSoftwareComponent.cat       11.2 KB
lgmonitorappsoftwarecomponent.inf        1.2 KB
LGMonitorInstallManager.exe              2.2 MB
```

Before the update, the old INF used a Store-app link:

```ini
[LG_Monitor_Control_Install]
SoftwareType=2
SoftwareID=pfn://LGElectronics.LGMonitorApp_cfnzzhwkr8z5w
```

`SoftwareType=2` tells Windows to install that Store package. This is how the old app arrived without a prompt.

The new INF removes that section and replaces it with this:

```ini
[LGMonitor_Install.Software]
AddSoftware=LGMonitorInstallManager,,LG_Monitor_InstallManager_Install

[LG_Monitor_InstallManager_Install]
SoftwareType      = 1
SoftwareBinary    = %13%\LGMonitorInstallManager.exe
SoftwareArguments = /driverflow,/campaign:1,/delay:60,<<DeviceInstanceID>>
SoftwareVersion   = 1.1.0.0
```

`SoftwareType=1` instead tells Windows to run a bundled Win32 executable. `%13%` is the Driver Store. Device Setup Manager event 165 recorded the exact launch:

```text
"C:\Windows\System32\DriverStore\FileRepository\
lgmonitorappsoftwarecomponent.inf_amd64_46db1b4b0dcddd74\
LGMonitorInstallManager.exe"
 /driverflow
 /campaign:1
 /delay:60
 SWD\DRIVERENUM\{3846ad8c-dd27-433d-ab89-453654cd542a}#LGMonitorApp&6&4c65595&0
```

The old driver automatically installed a Store app. The new driver automatically runs an EXE.

## What the new program does

`LGMonitorInstallManager.exe` is a.NET Framework WinForms application, version `2.0.2026.805`. It is obfuscated with **Eazfuscator.NET**: names are scrambled, strings encrypted, and anti-disassembly and anti-tamper protections enabled. That is an odd amount of protection for a consent dialog whose purpose is supposedly transparency.

I used [EazFixer](https://github.com/holly-hacker/EazFixer) to recover its strings, removed `SuppressIldasmAttribute` from an analysis copy, and disassembled the IL.

Windows launches `/driverflow` elevated during device installation. It exits if:

1.  an older LG SoftwareComponent package with the previous `pfn://` auto-install directive is still present;
2.  the user has already given a final answer for the current campaign.

Otherwise it:

1.  copies itself from the Driver Store to `C:\Program Files\LG Electronics\LGMonitorInstallManager`;
2.  creates a machine-wide `Run` entry so the question survives future logins;
3.  creates an Add/Remove Programs entry named **LG Monitor Software Notice**;
4.  creates `state.ini` under `C:\ProgramData\LG Electronics\LGMonitorInstallManager`;
5.  starts a second copy in the active user’s session with `/install /campaign:1 /delay:60`;
6.  creates a cleanup task that eventually removes the copied EXE, Run entry, uninstall entry, state, and task.

The user-session process waits **60 seconds**, checks again, and displays this:

![LG Monitor App Installer consent dialog](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/572f883c635deeb7.png)

## When the prompt appears and what Install does

The prompt is suppressed if the old LG driver is still present, the Store app is already installed, the user has already answered the current campaign, or another copy is running. This is why it initially did not appear on my PC: the old, outranked driver package was still in the Driver Store.

Clicking **Install** removes the temporary Run entry and starts this hidden child process:

```text
%LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe install \
  --id 9PM9N6F47JB8 \
  --source msstore \
  --accept-package-agreements \
  --accept-source-agreements \
  --silent
```

Store product `9PM9N6F47JB8` resolves to:

```text
Package: LGElectronics.LGMonitorApp
PFN:     LGElectronics.LGMonitorApp_cfnzzhwkr8z5w
Version: 1.2606.1601.0
Arch:    x86
```

That is the **same app the previous driver installed directly**. LG has simply inserted a consent dialog before it.

## Code and consent

LG seems to misunderstand the consent problem. Its earlier defense emphasized that McAfee was optional. Strictly speaking, that was true: the Monitor App installed itself silently, then asked about the next thing.

The new design moves that question one step earlier:

```text
Old:
driver -> automatically install LG Monitor App -> ask about more software

New:
driver -> automatically execute LG consent app -> ask to install LG Monitor App
```

This is an improvement: the full Store app is no longer installed before consent. But connecting a monitor still lets LG run an elevated program that copies itself into Program Files, creates persistence, and asks a marketing question. The question is more polite; the code that asks it still ran without asking.

A monitor should not need to run a two-megabyte obfuscated.NET program to ask whether I want another program. LG can simply link to its software and let me choose to get it.
