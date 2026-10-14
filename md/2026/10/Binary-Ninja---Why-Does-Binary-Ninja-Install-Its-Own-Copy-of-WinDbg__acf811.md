---
title: Binary Ninja - Why Does Binary Ninja Install Its Own Copy of WinDbg?
source: https://binary.ninja/2026/10/13/why-binary-ninja-installs-windbg.html
source_host: binary.ninja
clip_date: 2026-10-15T00:59:57+08:00
trace_id: dab935a4-f93f-48c4-85d3-218f57953ae5
content_hash: 678b0b2c9e2c94c3a294bd9e02bb5a6f275cab8a6087be9c133fbe4cba64f3e6
status: synced
tags:
  - Windows逆向
  - 安全工具
series: null
feed_source: Binary Ninja Blog
ai_summary: Binary Ninja 必须自带一份 WinDbg：商店版 MSIX 中的 `dbgeng.dll` 带条件 ACL，要求调用进程持有 WinDbg 的包身份，普通桌面进程只能读不能映射为可执行代码。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f975244-d011-81a6-99af-cbbc771b4a62
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Binary Ninja 必须自带一份 WinDbg：商店版 MSIX 中的 `dbgeng.dll` 带条件 ACL，要求调用进程持有 WinDbg 的包身份，普通桌面进程只能读不能映射为可执行代码。
> 
> - **核心机制：** TTD 集成基于微软调试引擎，回放 trace 时需加载 WinDbg 附带的 `dbgeng.dll`、`dbghelp.dll`、`dbgcore.dll`、`dbgmodel.dll`。
> - **失败现象：** 用完整路径直接 `LoadLibrary` 加载 `C:\Program Files\WindowsApps\...\amd64\dbgeng.dll` 会返回 `ERROR_ACCESS_DENIED`；把整个 WinDbg 目录复制到桌面后再加载却成功，说明并非依赖缺失。
> - **真实原因：** 包的安全描述符含一条条件 ACE，仅当调用进程的访问令牌带有 `WIN://SYSAPPID` 属性且匹配 `Microsoft.WinDbg_8wekyb3d8bbwe` 时才授予执行权；该受保护属性由签名包启动的进程持有，应用无法自行冒充。
> - **复制为何有效：** ACL 是文件系统元数据而非 DLL 内嵌字节，复制后新文件继承目标目录的普通 ACL（`BUILTIN\Users` 的 `FR` 通用读取），于是可被映射为镜像。
> - **官方做法：** **Install WinDbg/TTD** 命令下载微软签名的 WinDbg MSIX 包，校验签名后解压到 `%APPDATA%\Binary Ninja\windbg`；使用路径为 *Debugger → Install WinDbg/TTD* 并重启 Binary Ninja。

Binary Ninja’s [Time Travel Debugging](https://docs.binary.ninja/guide/debugger/dbgeng-ttd.html) integration is [amazing](https://www.youtube.com/watch?v=xyueml4Kbak). A common question I get asked is why you have to [install WinDbg from within Binary Ninja](https://docs.binary.ninja/guide/debugger/dbgeng-ttd.html#install-windbg) instead of using an existing version from the Microsoft Store.

## 无法直接加载的原因

The short answer is that the WinDbg DLLs in `C:\Program Files\WindowsApps` cannot be loaded by `binaryninja.exe`.

But why not?

Binary Ninja’s TTD integration uses Microsoft’s debugging engine. When we replay a trace, our debugger loads DLLs shipped with WinDbg, including `dbgeng.dll`, `dbghelp.dll`, `dbgcore.dll`, and `dbgmodel.dll`. This gives us WinDbg’s TTD backend inside Binary Ninja’s debugger UI.

Modern WinDbg is distributed as an MSIX package through the Microsoft Store. On one of my test systems, its package was installed here:

```
C:\Program Files\WindowsApps\
    Microsoft.WinDbg_1.2606.22001.0_arm64__8wekyb3d8bbwe
```

The package even contained the x64 debugging engine we needed:

```
C:\Program Files\WindowsApps\
    Microsoft.WinDbg_1.2606.22001.0_arm64__8wekyb3d8bbwe\
    amd64\dbgeng.dll
```

When I was originally developing the TTD integration, I tried to have `binaryninja.exe` load those DLLs directly. However, a plain `LoadLibrary` using the complete path failed with `ERROR_ACCESS_DENIED`.

## 复制到桌面后加载成功

Initially I thought it was just a dependency issue, but then I copied the entire WinDbg folder to `Desktop\windbg` and tried the same `LoadLibrary` call again. Surprisingly, it worked. This puzzled me for a while, but since it didn’t block my development, I didn’t dig into it at the time.

Fast forward to this past August, when I prompted an LLM to investigate. Initially, it also suspected a dependency issue and tried loading the DLL with `LoadLibraryEx`. But after I pointed out the bizarre “copy, then successfully load” behavior, it checked the security descriptor and uncovered the real reason.

The two relevant access-control entries of the WinDbg package looked like this in [SDDL](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-definition-language):

```
(XA;OICI;0x1200a9;;;BU;
    (WIN://SYSAPPID Contains "Microsoft.WinDbg_8wekyb3d8bbwe"))
(A;OICI;FR;;;BU)
```

## 条件 ACE 与 SYSAPPID 身份

The second [ACE](https://learn.microsoft.com/en-us/windows/win32/secauthz/ace-strings) is ordinary: it grants `BUILTIN\Users` (`BU`) generic read access (`FR`). The first is a [conditional access-control entry](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-descriptor-definition-language-for-conditional-aces-): it grants rights including execute only when the calling process has a `WIN://SYSAPPID` security attribute containing `Microsoft.WinDbg_8wekyb3d8bbwe`. Windows places this protected attribute in the access token of a process launched as part of the signed WinDbg package; an application cannot simply claim the identity for itself.

This explains the apparently contradictory result. `binaryninja.exe` is a normal unpackaged desktop process, so it can read `dbgeng.dll` but lacks the WinDbg identity required to map it as executable code.

ACLs are filesystem metadata, not bytes embedded in the DLL, so a normal copy to the desktop creates new files with the destination directory’s ordinary ACLs. The copied `dbgeng.dll` contains the same code, but `binaryninja.exe` is now allowed to map it as an image.

## Binary Ninja 的自带安装方案

That is why Binary Ninja cannot simply discover the Store installation and load `dbgeng.dll` in place. Our **Install WinDbg/TTD** command downloads Microsoft’s WinDbg MSIX bundle, verifies that it is signed by Microsoft, and extracts it into Binary Ninja’s user data directory, normally:

```
%APPDATA%\Binary Ninja\windbg
```

To set it up, follow the [WinDbg/TTD installation instructions](https://docs.binary.ninja/guide/debugger/dbgeng-ttd.html#install-windbg): in the usual case, it is just **Debugger → Install WinDbg/TTD**, followed by restarting Binary Ninja.
