---
title: 【微信】绕过所有计划任务检测：Windows 藏着的第二套调度器
source: https://mp.weixin.qq.com/s/S9UGO5fjqaI4pzGzL6pzgQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T12:35:25+08:00
trace_id: 08607edd-0be8-4673-b373-d4254da95f1e
content_hash: e2b572c04f55dd542305fff282e9e0cc5b5fe1afcd1b428bac81d1d474f2f2f5
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-818b-bc63-eb9b939bc3a2
ioc: null
---

**星夜AI安全** *2026年11月18日 11:10*

## 绕过所有计划任务检测：Windows 藏着的第二套调度器

2026 年 11 月 18 日凌晨，国资国企网络威胁信息共建共享平台（SEID）刊出一篇实战复盘。

主角不是新木马，也不是新内核漏洞，而是 Windows 自带的一个组件： **WPTaskScheduler**。

它有独立的 RPC 接口，独立的注册表位置，独立的任务命名规则。

你的 schtasks 看不到它，任务计划程序的管理界面也看不到它。

但它照样能把一个程序留在这台机器上，日复一日地执行。

⚡ 一句话：它不新增服务、不改 Run 键，它只是借 Windows 自带的那套几乎没人看的第二调度器，把程序悄悄留在原地。

**金句收尾**：清掉任务计划不等于清掉持久化，系统里的门从来就不止一扇。

## 一、技术全貌：这是什么？

### 1.1 一次来自国资一线的样本共享

先把来源摆清楚。本次分析的全部素材来自 SEID 社区成员的主动提交与共享，由中国石油网络安全专家中心上报。SEID 是国资国企专属的国家级威胁情报共享实战平台，覆盖情报研判、样本分析、漏洞排查三条线。

原文说明：平台收到可疑样本后，经关联分析与逆向研判，确认黑灰产在针对企业终端的投递活动中使用了一种区别于传统计划任务的隐蔽持久化技术，并选取两类活跃样本做完整链路还原。本文引用的技术事实均出自该文。

### 1.2 WPTaskScheduler 到底是什么

按原文的表述，WPTaskScheduler 是 Windows 系统中的 **任务调度组件**，具备三样东西：

-   **独立的 RPC 管理接口**，不经过任务计划程序对外暴露的那套 COM 接口；
    
-   **独立的存储位置**，不在常规的计划任务注册表路径下；
    
-   **独立的触发方式**，由系统调度组件负责管理和触发执行。
    

关键信息就三条，但每一条都是检测盲区的成因。常规检测盯的是「任务计划程序」这一个语义位置，而攻击者干脆绕开了它，走另一套同样属于系统、同样具备调度能力、却几乎没人写规则的通道。

### 1.3 注册表里它长什么样

原文给出的任务记录存储路径是：

```
HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\WPTaskScheduler\Schedules
```

子项以 GUID 作为标识，相关任务名称可采用 `SimpleActivityScheduleTimer_{GUID}` 格式。任务配置与运行状态等信息 **以二进制形式存储**，由系统调度组件负责管理和触发执行。

这里有两个细节值得单独拎出来。

第一，路径里是 `Schedule` 目录，但 **不是** `Schedule\TaskCache` 。这一点是后面所有排查建议的技术基础：很多检测规则写死了 `TaskCache` 前缀，于是这类任务直接从规则视野里消失了。

第二，配置是二进制格式。终端安全产品读注册表时，多半只解析结构化的键值对，二进制 blob 要么被跳过，要么被当作不可读内容直接放行。

**金句收尾**：不是藏得多深，是根本不在你查的那张表里。

## 二、为什么这个技术如此重要

### 2.1 盲区的成因：防守方在查语义，攻击方在换语义

传统 Windows 持久化检测的逻辑链路是：任务计划程序 COM 接口 → `TaskCache` 注册表树 → `taskschd.dll` 的 API 调用 → `taskhostw.exe` 进程执行。

这条链路本身没问题，问题是它 **默认所有任务都从同一个入口进来**。WPTaskScheduler 不是这个入口。

原文在动态分析中发现：系统服务进程 `svchost.exe` 在创建上述任务注册表项时，其调用栈中出现了 `RPCRT4.dll` 的 `NdrServerCall2` 、 `NdrStubCall2` 以及 `WPTaskScheduler.dll` 等模块。这表明相关注册表操作 **发生在 RPC 服务端处理过程中**，任务注册行为是通过 WPTaskScheduler 的 RPC 机制实现的。

换句话说，规则里如果写的是「哪个进程调用了任务计划 API」，这里根本不会触发，因为这条路径 **压根没有调用任务计划 API**。

### 2.2 关键差异对照

原文明确指出：与传统 Windows 计划任务相比，该机制在 **任务注册接口、存储位置及管理方式** 等方面存在差异，相关任务可能无法通过常规任务计划程序管理工具直接发现，容易形成安全监测盲区，增加恶意持久化行为的发现和溯源难度。

| 对比维度 | 传统 Windows 计划任务 | WPTaskScheduler |
| --- | --- | --- |
| 注册接口 | 任务计划程序 COM 接口 | 独立 RPC 接口，UUID `33D84484-3626-47EE-8C6F-E7E98B113BE1` |
| 接口版本与规模 | —   | RPC 接口版本 2.0，含 13 个 RPC 方法 |
| 存储位置 | `Schedule\TaskCache`<br><br>任务树 | `Schedule\WPTaskScheduler\Schedules` |
| 任务标识 | 任务路径 + 名称 | GUID 作为子项标识 |
| 任务命名 | 任务文件夹路径形式 | `SimpleActivityScheduleTimer_{GUID}` |
| 配置格式 | 结构化 XML | 二进制形式存储 |
| 管理工具可见性 | 任务计划程序可直接列出 | 常规工具无法直接发现 |
| 触发执行 | `taskhostw.exe` | 系统调度组件管理并触发 |
| 检测抓手 | API 调用、注册表树、进程链 | RPC 调用栈 + 专用注册表路径 |

### 2.3 RPC 接口的结构

原文进一步对相关进程暴露的 RPC 接口做了枚举，发现其加载的 `WPTaskScheduler.dll` 注册了 **版本为 2.0 的 RPC 接口**，接口 UUID 为：

```
33D84484-3626-47EE-8C6F-E7E98B113BE1
```

该接口包含 **13 个 RPC 方法**。这说明 WPTaskScheduler 通过独立的 RPC 服务端接口向调用方提供任务管理能力，是一套完整可用的任务系统，而不是某个边角功能。

对一个防守方来说，这条信息的价值在于： **你可以写规则了**。UUID 稳定、13 个方法有限、Opnum 0 是首次注册任务用的方法号，这些都是确定性特征。

### 2.4 在野情况

原文对两个样本都做了活跃度判断。样本一（伪装成 FinalShell、XShell 等运维工具安装程序）经关联分析与历史样本溯源显示， **该类样本最早可追溯至 2026 年 4 月，且目前仍处于活跃状态**。

口径要讲清楚：这是原文的溯源结论，不是我们独立验证的感染规模统计。原文没有给出受感染终端数量。

**金句收尾**：一台机器装了 7 个研发工具不代表它是开发机，但一台机器只跑 gcc.exe 也不代表它干净。

## 三、技术原理解析 📌

### 3.1 服务端：任务是怎么被写进注册表的

原文对任务持久化逻辑的分析给出了一条清晰的调用链：

`sub_180020A28` 通过 `sub_180020900` 操作注册表 → 打开 `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\WPTaskScheduler\Schedules` 父键 → 调用 `sub_180020FDC` **将任务标识格式化为 `{GUID}` 字符串** → 通过 `RegCreateKeyExW` 创建或打开对应任务子键。

这一段的信息量在于：子项名字不是随意的—— **服务端代码里有一个格式化函数专门拼出来的**，客户端必须先生成 GUID、服务端才能接受，两边约定的是同一套命名契约。同时， `RegCreateKeyExW` 是完全正常的 Win32 API，不触发异常行为检测，这也是这条链路在行为层面几乎无声的原因。

同时， `RegCreateKeyExW` 是 **完全正常的 Win32 注册表 API**，不触发任何异常行为检测。这也解释了为什么这条链路在行为层面几乎无声。

### 3.2 客户端：ncalrpc 绑定与 Opnum 0

样本一侧的实现同样被原文完整还原。 `CreateAndExecuteTask` 的流程是：

1.  调用 `rpc_bind_task_scheduler` ，通过 `RpcStringBindingComposeW` 和 `RpcBindingFromStringBindingW` 构建基于 **ncalrpc 协议** 的本地 RPC 绑定；
    
2.  调用 `CoCreateGuid` 生成唯一任务标识，通过 `StringFromGUID2` 转换为字符串，与固定前缀 `SimpleActivityScheduleTimer_` 拼接形成任务名称；
    
3.  完成任务参数构造后，调用 `rpc_create_task_call` ，通过 **`NdrClientCall3`** 向 RPC 接口的 **Opnum 0** 方法提交任务标识、任务名称及执行路径等信息，实现任务注册请求。
    

继续追踪 RPC 客户端接口描述结构，提取到的接口 UUID 为 `33D84484-3626-47EE-8C6F-E7E98B113BE1` ，与服务端完全一致。

这里有几个技术点值得展开：

**ncalrpc 是什么。** 它是 NCACN_NL（NC Named Pipe Local Transport）协议的别称，即基于命名管道的本地 RPC 传输。它不走 TCP，不产生网络流量，所以任何依赖网络侧检测的方案在这里完全失效。检测只能落在本机的 RPC 调用栈上。

**为什么是 Opnum 0。** NDR（Network Data Representation）运行时按序号分派方法。客户端用 `NdrClientCall3` 提交参数，服务端 `NdrServerCall2` 解析参数，两侧必须对同一个 Opnum 达成一致。Opnum 0 是这套接口里第一个方法，也正是任务注册请求。

**前缀为什么是 `SimpleActivityScheduleTimer_` 。** 命名带上 `SimpleActivityScheduleTimer` 这种系统内部味道，是典型的「伪装成系统组件产物」手法。这与攻击者把自己的文件名改成 `codex.exe` 是同一类思路，只是这里伪装的是任务命名空间。

### 3.3 两段式投递：Rust 原生加载器 +.NET 载荷

样本二展示了更完整的投递链，结构相当讲究。

**初始阶段** 是一个经混淆的 **Rust 原生加载器**。它根据自身运行路径选择两种模式：

-   **不在安装路径时** （首次运行）：把自身复制到伪装成 **Windows Delivery Optimization 缓存** 的目录， **伪造 1601 年创建时间**，同时 **向文件追加高熵填充**，并创建 WPTaskScheduler 任务实现持久化；
    
-   **已在安装路径再次运行时** （二次运行）：在内存中加载基于 **.NET 的 PCLoader**，并解密出最终的 **PureRAT** 载荷及相关配置文件。
    

这里有四个细节，每一个都在针对性地对抗一类检测：

| 伪装动作 | 对抗的检测方向 |
| --- | --- |
| 目录名伪装成 Delivery Optimization 缓存 | 路径信誉类规则；正常更新缓存目录不应出现随机后缀目录 |
| 伪造 1601 年创建时间 | 时间戳异常类规则；1601 是 FILETIME 纪元起点，正常文件不会出现 |
| 追加高熵填充 | 文件大小与熵值统计；同目录其他文件不会这样 |
| 分两段、第二次才解密真实载荷 | 静态扫描与沙箱；首轮行为完全良性 |

**1601 年时间戳** 是这里最有代表性的一手。那是 Windows FILETIME 的纪元起点，很多工具解析时间戳失败时会回落到这个值，于是它反而显得「像系统生成的」。

**金句收尾**：把第一次运行伪装成安装，把第二次运行伪装成正常启动，中间那一段才是真正的入口。

## 四、实战应用场景 🌟

### 4.1 完整攻击链路还原

综合原文两类样本，这条链路的完整形态是这样的：

**投递** → 运维工具安装包（FinalShell / XShell 伪装）或混淆的 Rust 原生加载器 → 用户执行

**落地** → 复制到伪装目录（C:\\ProgramData\\Delivery Optimization\\<16 位十六进制>），伪造 1601 年时间戳，追加高熵填充

**持久化** → 通过 ncalrpc 绑定调用 WPTaskScheduler RPC 接口 Opnum 0，注册 `SimpleActivityScheduleTimer_{GUID}` 任务

**二次执行** → 任务触发加载器 → 加载器在内存中解密并加载.NET PCLoader → 释放 PureRAT 载荷与配置

**驻留** → 样本一额外写入 `KongKeylogger*.txt` 、 `Programs\Bv\aste` 、注册表 `HKCU\SOFTWARE\KongClient`

原文在样本一中还发现，攻击者在注册表项、文件路径等多处使用 **"Kong" 关键字**，呈现出一定的共性特征。

### 4.2 与传统持久化手段的绕过效果对比

| 维度  | 计划任务（schtasks） | 注册表 Run 键 | 服务注册 | WPTaskScheduler |
| --- | --- | --- | --- | --- |
| 是否新增服务 | 否   | 否   | 是   | 否   |
| 是否新增自启动项 | 是   | 是   | 是   | 否   |
| 常规 EDR 行为规则命中 | 高   | 高   | 高   | 低   |
| `schtasks /query`<br><br>可见 | 是   | 不适用 | 不适用 | 否   |
| 任务计划程序界面可见 | 是   | 不适用 | 不适用 | 否   |
| 沙箱行为触发 | 中   | 低   | 中   | 低   |
| 落地文件痕迹 | 需要  | 需要  | 需要  | 依赖前置投递 |

关键点在于： **它没有创造任何新的攻击能力**，复用的全是系统自带能力。正因如此，它不需要改代码、不需要提权、不需要打补丁、不需要下载驱动。这是一条「零新增资产」的持久化路径，最难的部分不是检测这个组件，而是意识到存在这样一个组件。

这是一条「零新增资产」的持久化路径。对防守方来说，最难的部分不是检测这个组件，而是意识到 **存在这样一个组件**。

### 4.3 无害的只读自检脚本

下面这个脚本只做读取：枚举 WPTaskScheduler 注册表树、列出任务子项、匹配命名规则。 **不创建、不修改、不删除任何注册表键**，可以在任意终端安全沙箱里跑。

```python
# -*- coding: utf-8 -*-
"""WPTaskScheduler 隐蔽持久化 - 只读自检脚本

用途：枚举 WPTaskScheduler 注册表下的任务子项，匹配 SimpleActivityScheduleTimer_ 命名规则
安全：全程只读。不创建、不修改、不删除任何注册表键值，不调用 RPC，不触发任务
环境：Windows 10/11、Server 2016+，Python 3.8+
"""
import winreg
import re
import sys
import json
import datetime

PATHS = [
    (winreg.HKEY_LOCAL_MACHINE,
     r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\WPTaskScheduler\Schedules",
     "HKLM"),
    (winreg.HKEY_CURRENT_USER,
     r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\WPTaskScheduler\Schedules",
     "HKCU"),
]

# 服务端 sub_180020FDC 拼出的任务标识格式：{GUID}
GUID_RE = re.compile(r"^\{[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}\}$")
# 客户端拼接的固定前缀
NAME_RE = re.compile(r"^SimpleActivityScheduleTimer_[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$")

def enumerate_tasks(root, subkey, label):
    found = []
    try:
        key = winreg.OpenKey(root, subkey, 0, winreg.KEY_READ)
    except OSError as exc:
        print("[i] %s 不可读: %s" % (label, exc))
        return found

    with key:
        idx = 0
        while True:
            try:
                child = winreg.EnumKey(key, idx)
            except OSError:
                break
            idx += 1

            matched = bool(GUID_RE.match(child)) or bool(NAME_RE.match(child))
            entry = {
                "hive": label,
                "name": child,
                "matches_known_pattern": matched,
                "values": {},
            }
            try:
                with winreg.OpenKey(key, child, 0, winreg.KEY_READ) as ck:
                    vi = 0
                    while True:
                        try:
                            vname, vdata, _ = winreg.EnumValue(ck, vi)
                        except OSError:
                            break
                        vi += 1
                        # 只保留标量，二进制 blob 只记长度，不落内容
                        if isinstance(vdata, bytes):
                            entry["values"][vname] = "<binary %d bytes>" % len(vdata)
                        else:
                            entry["values"][vname] = vdata
            except OSError:
                entry["values"] = {"<unreadable>": True}
            found.append(entry)
    return found

def main():
    results = []
    for root, subkey, label in PATHS:
        results.extend(enumerate_tasks(root, subkey, label))

    now = datetime.datetime.now().isoformat(timespec="seconds")
    print("=" * 64)
    print("WPTaskScheduler 只读自检  时间: %s" % now)
    print("=" * 64)

    if not results:
        print("[OK] 未发现 WPTaskScheduler 任务子项（仅代表当前账户可见范围）")
        return 0

    flagged = [r for r in results if r["matches_known_pattern"]]
    print("共发现任务子项 %d 个，其中命中已知命名模式 %d 个" % (len(results), len(flagged)))
    for r in results:
        mark = "[!]" if r["matches_known_pattern"] else "[ ]"
        print("%s %s\\%s" % (mark, r["hive"], r["name"]))
        for k, v in r["values"].items():
            print("      %s = %s" % (k, v))

    if flagged:
        print("\n[!] 命中项需要人工确认：确认是否为业务自身调度任务，")
        print("    重点核对任务路径指向的可执行文件签名与落地路径。")
    else:
        print("\n[i] 本次扫描未见命中模式条目。")
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

### 4.4 批量排查的 PowerShell 侧补充

如果要在批量终端上跑，下面这组命令只读取注册表与服务状态，同样不做任何写入：

```powershell
# 1) 确认 WPTaskScheduler 组件是否在本机存在
Get-ChildItem -Path 'C:\Windows\System32\WPTaskScheduler.dll' -ErrorAction SilentlyContinue |
    Select-Object FullName, Length, LastWriteTime

# 2) 列出任务子项，只读
$base = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\WPTaskScheduler\Schedules'
if (Test-Path $base) {
    Get-ChildItem $base | Select-Object PSChildName, Name
} else {
    Write-Output '[i] 未发现 WPTaskScheduler 任务根键'
}

# 3) 命中命名模式的条目
Get-ChildItem $base -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -like 'SimpleActivityScheduleTimer_*' } |
    Select-Object PSChildName

# 4) 全盘搜索同一组件被哪些进程加载（需加载相应模块枚举权限）
Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Modules.FileName -like '*WPTaskScheduler.dll' } |
    Select-Object ProcessName, Id, Path
```

**金句收尾**：查不到任务不代表没有任务，可能只是它不在你打开的那本字典里。

## 五、防御对抗建议 🔥

### 5.1 厂商侧：把 RPC 调用栈做成检测规则

最有效的一条规则抓手，就是原文已经给出的那个确定性特征—— **`RPCRT4.dll` 的 `NdrServerCall2` / `NdrStubCall2` 出现在调用栈中，同时进程加载了 `WPTaskScheduler.dll`**。

这比「注册表里出现某个 GUID」更稳，因为规则不依赖命名格式的任何变化。

### 5.2 Sigma 规则示例

```yaml
title: Windows WPTaskScheduler 隐蔽持久化任务注册
id: 9a6f2c31-4e57-4d0b-9c3e-7f1a2b8c5d40
status: experimental
description: >
  检测通过 WPTaskScheduler 独立 RPC 接口注册计划外调度任务的行为。
  传统任务计划程序与 TaskCache 检测无法覆盖该路径。
references:
  - https://cn-sec.com/archives/5587367.html
logsource:
  product: windows
  category: registry_set
detection:
  selection_wptaskscheduler:
    TargetObject|contains: '\Schedule\WPTaskScheduler\Schedules\'
  filter_known_prefix:
    TargetObject|contains: '\SimpleActivityScheduleTimer_'
  condition: selection_wptaskscheduler and not filter_known_prefix
fields:
  - Image
  - TargetObject
  - Details
falsepositives:
  - 极少数自研调度组件复用该系统接口
level: high
tags:
  - attack.persistence
  - attack.t1053
```

### 5.3 用户侧缓解措施

按优先级排列：

1.  **盘一遍注册表**。在资产平台上把 `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\WPTaskScheduler\Schedules` 纳入每日采集基线，与 `TaskCache` 并列。这是投入最小、见效最快的一条。
    
2.  **核对每一条任务的执行路径**。原文排查建议里给出的终端侧可疑文件路径可以直接作为初始线索：
    
    -   C:\\ProgramData\\Delivery Optimization\\<16 位十六进制>
        
    -   `C:\ProgramData\KongKeylogger*.txt`
        
    -   C:\\Users\\<用户名>\\AppData\\Local\\Programs\\Bv\\aste
        
    -   注册表 `HKCU\SOFTWARE\KongClient`
        
    
3.  **给 `svchost.exe` 加载 `WPTaskScheduler.dll` 这件事做告警**。正常业务里这个组合出现频率应当极低。
    
4.  **清理顺序要正确**。先断掉任务的执行路径，再删注册表项。反过来做，任务仍可能被触发。
    
5.  **防守侧要有反制意识**。这类技术的通用套路是「换一个语义位置」，所以检测规则不能只盯一个入口。常规计划任务、服务、注册表自启动、计划任务之外的调度器，应当作为一个整体来建模。
    

### 5.4 检测规则的思路整理

| 层次  | 检测对象 | 具体抓手 | 可靠性 |
| --- | --- | --- | --- |
| 进程  | RPC 服务端调用栈 | `RPCRT4.dll!NdrServerCall2`<br><br>\+ `WPTaskScheduler.dll` 同时出现 | 高   |
| 注册表 | 任务子项创建 | `Schedule\WPTaskScheduler\Schedules\{GUID}`<br><br>新增 | 高   |
| 注册表 | 命名模式 | `SimpleActivityScheduleTimer_*` | 中（可被改前缀绕过） |
| 文件  | 落地目录 | Delivery Optimization\\<16位十六进制><br><br>、 `Programs\Bv\aste` | 中（依赖样本家族） |
| 文件  | 时间戳 | 创建时间等于 FILETIME 纪元起点 1601 年 | 中（需基线） |
| 网络  | —   | 无。本链路走 ncalrpc 本地命名管道，不产生外联 | 不可用 |

最后一行是最容易被忽略的： **这条链路上没有网络特征**。任何以出站流量为前提的检测方案，在这里都是空转。

**金句收尾**：最难防的不是绕过，是那个你压根没写进检测矩阵的入口。

## 六、技术延伸阅读

### 6.1 原始出处与参考

-   SEID / 中国石油网络安全专家中心：《隐秘的持久化：黑灰产滥用 Windows 内部任务调度机制实施恶意驻留》，2026-11-18，cn-sec.com 转载，原文首发于微信公众号（中资网安）
    
-   SEID 平台：国资国企专属国家级威胁情报共享实战平台
    

### 6.2 值得延伸的技术点

-   **NDR 运行时与 Opnum 分派**： `NdrClientCall3` / `NdrServerCall2` 是 RPC 调用标准入口，理解 Opnum 与接口 UUID 的对应关系是读懂所有 RPC 样本的基础
    
-   **Windows 任务调度子系统全景**： `Schedule` 目录下的多套机制并存，是理解这类盲区的背景知识
    

### 6.3 后续动作

师傅们，这类技术的特征是「换个语义位置就能复用系统能力」，成本极低。后续我们会把同类未覆盖的 Windows 调度与触发机制做成一张排查清单。

看完觉得有启发，记得三连（点赞 + 在看 + 关注）。评论区聊聊你那边见过的最隐蔽的持久化位置是什么，我挑有意思的写进下一期。

## 圈子介绍

现任职于某头部网络安全企业攻防研究部，核心红队成员。2021-2023年间累计参与40+场国家级、行业级攻防实战演练，精通漏洞挖掘、红蓝对抗策略制定、恶意代码分析、内网横向渗透及应急响应等技术领域。在多次大型演练中，主导突破多个高防护目标网络，曾获"最佳攻击手""突出贡献个人"等荣誉。

已产出的安全工具及成果包括：

-   多款主流杀软通杀工具（兼容卡巴斯基、诺顿、瑞星、360等终端防护，无感知运行，突破多引擎联合检测）
    
-   XXByPassBehinder v1.1 冰蝎免杀生成器（定制化冰蝎免杀工具，绕过主流终端防护与EDR动态检测，支持自定义载荷）
    
-   哥斯拉二开免杀定制版（二开优化，深度免杀，突破终端防护与EDR检测，适配多场景植入）
    
-   NeoCS4.9终极版（高级免杀加载工具，强化载荷注入与进程劫持，适配多系统版本，无兼容问题）
    
-   WinDump\_免杀版（浏览器凭证窃取工具，支持Chrome/Edge/Firefox等主流浏览器，一键提取敏感数据，免杀过防护）\_
    
-   fscan二开版（二开优化内网扫描工具，增强指纹精度、弱口令爆破与结果标准化输出，适配复杂内网）
    
-   RingQ加载器二开版（二开优化免杀加载器，支持Shellcode内存执行，绕过各类终端防护与EDR检测）
    
-   多款免杀Webshell集合（覆盖PHP/JSP/ASPX，过主流WAF与终端防护，适配不同Web场景）
    
-   免杀360专属加载器（支持Shellcode内存执行，针对性绕过360全系防护检测，无感知运行）
    
-   一键Kill 火绒 defender 工具 **HDKiller** （包含源码）
    
-   win11 一键kill 360工具 **InjectKill** （包含源码）
    
-   win11 一键kill defender工具 **win11_df-killer** （包含源码）
    
-   免杀火绒6.0内存防护加载器 **BypassMemLoader**
    
-   单文件过360 免杀loader **exe_bypass_360**
    
-   单文件过火绒 df 免杀loader **exe_bypass_df** (包含源码)
    
-   LNK钓鱼文件生成工具V1.0
    
-   EXE捆绑启动器 v2.0
    
-   火绒6内存免杀加载器 **bypasshr6**
    
-   火绒一键Kill专杀工具 **HRKiller**
    
-   Ring3 内存免杀工具 **Ring3bypasshr.exe**
    
-   win11 一键kill 360工具 **Kill360_V2**
    
-   win11 一键kill 360工具 **Kill360_V3.1**
    
-   win11 一键kill 360工具 **Kill360_V4**
    
-   **bypassEDR_hashdump_V1** bypass EDR 导出hash工具
    

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/20c4a96e6d20460b.jpg "image")
