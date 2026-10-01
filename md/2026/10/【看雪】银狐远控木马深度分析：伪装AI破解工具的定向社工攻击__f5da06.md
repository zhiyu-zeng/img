---
title: 【看雪】银狐远控木马深度分析：伪装AI破解工具的定向社工攻击
source: https://bbs.kanxue.com/thread-293117.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-01T13:55:49+08:00
trace_id: 85430e48-b83a-4a8b-ad38-f822d4ba0d25
content_hash: 29b89c1bb7509c0912654b68d7da3c0b7087c05b63e9ec6bd8d0ae129e465a1f
status: synced
tags:
  - 看雪
  - 恶意样本
  - 协议分析
series: null
feed_source: 看雪·逆向工程
ai_summary: 伪装成"GPT-6.0/Cursor 破解工具"的压缩包释放的 cursor.exe，实为银狐远控加载器，通过注册表自启并从腾讯云 C2 拉取二阶段 PE。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3ec75244-d011-8177-a216-fd3980c8f18c
ioc:
  cves: []
  cwes: []
  hashes:
    - 4c905d4637b5fdf61f0abd33927b1ac5
    - 8bf4356b94909590ed12cbfc8841d3b504eab07b22274a1cd79e3cf601e8dd55
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 伪装成"GPT-6.0/Cursor 破解工具"的压缩包释放的 cursor.exe，实为银狐远控加载器，通过注册表自启并从腾讯云 C2 拉取二阶段 PE。
> 
> - **样本：** cursor.exe（原名"远控样本.exe"），195,584 字节，MD5 `4c905d4637b5fdf61f0abd33927b1ac5`，x64 MSVC 编译，无 overlay 与内嵌 payload，是纯 loader；落地 `%LOCALAPPDATA%\Temp\HotWater\`。
> - **反分析：** 隐藏控制台；配置整体 `wcsrev` 反转存放于 `.data`，注册表路径与 7 个注入 API 名全部栈上拼装，IAT 仅暴露 GetModuleHandleA/LoadLibraryA/GetProcAddress；payload 内存以 `buf[i]=i^0xA5` 二次覆写。
> - **C2 协议：** 原始 TCP 连 `106.55.224.100:8083`；帧头 10 字节 session key（timeGetTime+`0x77A5`）与 6 字节 tail（`(i+3*key[i%10]+17)&0xFF`），payload 按 `(key+91)&0xFF` 异或；beacon 魔数 `0x0171`，心跳 `0xB1`/10 秒，200 次失败切备用 C2。
> - **载荷执行：** 默认 `s7=0` 反射加载 PE（从 offset 0x80 扫 MZ/PE），或 `s7=1` 镂空 `tracerpt.exe`；先搜索 `qklogintagx1` 打 0x12A0 字节配置补丁。
> - **缓存与处置：** `HKCU\QkNetK1\1` 缓存 payload、`\IpDate` 动态更新 C2、`HKLM\SOFTWARE\QkHostCfg_v1` 存配置副本；防御重点为监控 `Run\WinHostSvc`、异常 `tracerpt.exe` 子进程，并清除上述键值后全盘排查。

## 一、事件概述

2026 年 9 月，某 QQ 编程技术交流群（195 人）中，用户 上传了一个名为 **"热开水2.0破甲gpt6.0全破cursor全破.rar"** 的压缩包（7.8 MB，14 次下载），声称可破解 Cursor 编辑器和 GPT-6.0 的付费限制。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/25109aa354cd0a76.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f97c505aea768266.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6c3bece5890e928b.webp)

实际上，该压缩包释放的 `cursor.exe` （191 KB）是一个 **银狐（Silver Fox）远控木马加载器**，伪装成 Cursor 程序图标，落地路径为：

```
C:\Users\<user>\AppData\Local\Temp\HotWater\cursor.exe
```

受害者双击后，木马隐藏控制台窗口，在后台完成：

1.  **配置解密**— 从自身 `.data` 段反转并解析 C2 地址
2.  **持久化**— 写入 `HKCU\...\Run\WinHostSvc` 实现开机自启
3.  **C2 连接**— 通过原始 TCP 连接腾讯云 `106.55.224.100:8083`
4.  **Payload 投递**— 接收远端 PE 文件，通过进程镂空或反射加载执行

任务管理器启动项中出现的 **"Msdnloader"** 条目即为该木马的持久化痕迹。

**攻击链时间线：**

| 时间  | 事件  |
| --- | --- |
| 2026-09-12 | 木马编译（内嵌 build date: 2026.9.12） |
| 2026-09-12 | "Te amo" 在 QQ 群上传 rar 压缩包 |
| 2026-09-18 20:39 | cursor.exe 落地到受害者 Temp\\HotWater 目录 |
| 2026-10-01 | 分析时 C2 端口仍开放，但控制端已下线 |

## 二、样本基本信息以及多引擎文件在线检测查杀

| 属性  | 值   |
| --- | --- |
| 文件名 | cursor.exe（原始名: 远控样本.exe） |
| 大小  | 195,584 字节 (191 KB) |
| MD5 | `4c905d4637b5fdf61f0abd33927b1ac5` |
| SHA256 | `8bf4356b94909590ed12cbfc8841d3b504eab07b22274a1cd79e3cf601e8dd55` |
| CRC32 | `0x9020B8B` |
| 架构  | x64 PE (IMAGE_FILE_MACHINE_AMD64) |
| 编译器 | MSVC (PlatformToolset v143 / VS 2022) |
| 链接库 | CRT 静态链接，WS2_32.dll / USER32 / ADVAPI32 / WINMM / KERNEL32 |
| 入口点 | `start` (0x140006304) → `_tmainCRTStartup` → `wmain` |
| ImageBase | 0x140000000 |
| ImageSize | 0x37000 (225 KB) |

**PE 节表：**

| 节名  | 虚拟地址 | 原始大小 | 内容  |
| --- | --- | --- | --- |
| .text | 0x1000 | 0x11000 | 代码段，全部恶意逻辑 |
| .rdata | 0x12000 | 0x4C00 | 导入表 / vtable / 常量 |
| .data | 0x17000 | 0x2000 | 加密配置 blob + 全局变量 |
| .pdata | 0x1D000 | 0xE00 | 异常处理表 |
| .rsrc | 0x1E000 | 0x16800 | 图标资源 (6个图标，伪装 Cursor) |
| .reloc | 0x35000 | 0x600 | 重定位表 |

无 overlay（文件末尾无附加数据），无嵌入 payload——此样本是纯 loader，二阶段 payload 从 C2 下发或注册表缓存读取。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/85275f301cd0f8c4.webp)

## 三、行为分析

### 3.1 启动流程

```
start()
  └─ _tmainCRTStartup()
       └─ wmain()                                    [0x1400044D0]
            ├─ SetUnhandledExceptionFilter()           ← 反调试 + 崩溃转储
            ├─ ShowWindow(GetConsoleWindow(), SW_HIDE)  ← 隐藏控制台
            ├─ DecryptAndParseConfig()                 ← wcsrev 解密C2配置  [0x140003AB4]
            ├─ CreateThread(C2WorkerThread)             ← 主工作线程    [0x140004300]
            └─ WaitForSingleObject(INFINITE)            ← 阻塞等待
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/087bcab8e9a8ee23.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2b69de3c861d0c1e.webp)

### 3.2 反分析手法

| 手法  | 实现细节 |
| --- | --- |
| 隐藏窗口 | `ShowWindow(GetConsoleWindow(), SW_HIDE)` 用户看不到任何界面 |
| 反调试 | `TopLevelExceptionFilter` 中 `IsDebuggerPresent()` 检测，有调试器则不写 dump |
| 崩溃转储 | `DbgHelp.dll!MiniDumpWriteDump` 写 `!analyze -v-YYYYMMDD-HHMMSS.dmp` ，供攻击者远程诊断 |
| 动态 API | 进程注入用的 7 个 kernel32 API 全部通过索引+栈上拼字符串+ `GetProcAddress` 解析，IAT 中不可见 |
| 配置混淆 | 配置串以 `wcsrev()` 整体反转存储，所有注册表键名 / 值名栈上拼装，静态扫描无法提取字符串 |
| 内存擦除 | Payload 执行后用 `buf[i] = i ^ 0xA5` 覆写原始内存，另起线程 200ms 后二次覆写 |

### 3.3 持久化

`InstallPersistence_RunKey` (0x140003EC0) 在 `g_PersistenceFlag_s9 == 1` 时执行：

-   **注册表路径**: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
-   **值名**: `WinHostSvc`
-   **值数据**: 自身 exe 完整路径（ `GetModuleFileNameW` ）

注册表键名通过栈上 DWORD 数组拼装宽字符，尽管不是传统加密，但静态字符串搜索无法命中。任务管理器启动项可见条目名称可能显示为 "Msdnloader" 或文件名本身。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bad5f07778592821.webp)

持久化函数：栈上拼装 Run 键路径 + WinHostSvc 值名

### 3.4 网络行为

样本仅导入 `WS2_32.dll` （原始 socket），不使用 HTTP。网络行为特征：

-   向 `106.55.224.100:8083` 发起 TCP 连接
-   开启 TCP Keepalive（180s 间隔 / 5s 重试）
-   收发缓冲区 256 KB，超时 30s
-   每 10 秒发送 1 字节心跳 (0xB1)，60 秒无响应则断开重连

## 四、配置解密机制

### 4.1 存储与解密

配置存储在 `.data` 段全局变量 `g_ConfigBlob_Reversed` （VA `0x140017080` ，0x7D0 字节），以 **UTF-16LE 宽字符串整体反转** 形式存储。这不是传统加密，但足以让静态字符串搜索完全失效。

**解密流程** (`DecryptAndParseConfig`, 0x140003AB4)：

1.  仅执行一次（ `g_ConfigParsed_Once` 标志保护）
2.  `_wcsrev()` 原地反转整个宽字符串
3.  `ConfigParser_ExtractField()` (0x140003994) 按 `key:value|` 格式逐条提取
4.  检查 `HKCU\QkNetK1\IpDate` 注册表值，若存在则覆盖静态配置（C2 动态更新机制）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f4062ff7fdc6129d.webp)

配置解密函数：wcsrev + 按 k7:/m3:/n8: 等 key 逐条提取

### 4.2 配置格式

文件中原始字节（反转前）：

```powershell
1:9s|0:8s|0:7s|0:6s|0:5s|0:4s|0:3s|0:7r|21.9 .6202:6r|0.1:5r|认默:4r|1:3r|1:2r|1:0n|08:5m|1.0.0.721:9k|1:9n|8888:4m|1.0.0.721:8k|1:8n|3808:3m|001.422.55.601:7k|
```

`wcsrev()` 后的明文：

```
|k7:106.55.224.100|m3:8083|n8:1|k8:127.0.0.1|m4:8888|n9:1|k9:127.0.0.1|m5:80|n0:1|r2:1|r3:1|r4:默认|r5:1.0|r6:2026.9.12|r7:0|s3:0|s4:0|s5:0|s6:0|s7:0|s8:0|s9:1
```

### 4.3 完整配置字段表

| 键   | 全局变量 | 值   | 含义  |
| --- | --- | --- | --- |
| k7  | g_C2_HostA_k7 | **106.55.224.100** | 主 C2 IP（腾讯云） |
| m3  | g_C2_PortStrA_m3 | **8083** | 主 C2 端口 |
| n8  | g_C2_EnableA_n8 | 1   | 启用标志 |
| k8  | g_C2_HostB_k8 | 127.0.0.1 | 备用 C2（占位） |
| m4  | g_C2_PortStrB_m4 | 8888 | 备用端口 |
| n9  | g_C2_EnableB_n9 | 1   | 启用标志 |
| k9  | g_C2_HostC_k9 | 127.0.0.1 | 第三 C2（占位） |
| m5  | g_C2_PortStrC_m5 | 80  | 第三端口 |
| n0  | g_C2_EnableC_n0 | 1   | 启用标志 |
| r2  | g_InitDelaySec_r2 | 1   | 初始延迟（秒） |
| r3  | g_ReconnectDelaySec_r3 | 1   | 重连间隔（秒） |
| r4  | g_GroupName_r4 | **默认** | 分组/战役标签 |
| r5  | g_Version_r5 | 1.0 | 版本号 |
| r6  | g_BuildDate_r6 | 2026.9.12 | 编译日期 |
| r7  | g_Flag_r7 | 0   | 标志位 |
| s7  | g_ProcessHollowFlag_s7 | **0** | 0=反射加载, 1=进程镂空 |
| s9  | g_PersistenceFlag_s9 | **1** | 1=写 Run 注册表自启动 |

### 4.4 C2 轮转策略

`C2WorkerThread` 无限循环中：

-   每次循环 **交替** 使用配置组 A (`g_C2_HostToggle` 取反) 和配置组 B
-   每 **200 次失败** 后切换到配置组 C，计数器归零
-   每次重连间隔 `Sleep(r3 * 1000)` = 1 秒

## 五、C2 通信协议逆向

### 5.1 帧格式

双向统一格式，每个 TCP 帧结构如下：

```
偏移    大小    内容
[0:4]   4B     frame_size (uint32 LE, 含头部 20 字节)
[4:14]  10B    session_key (明文, 客户端生成)
[14:20] 6B     derived_tail (从 key 确定性计算)
[20:]   NB     XOR 加密的 payload
```

### 5.2 Session Key

连接时由客户端生成 10 字节 key，服务端从第一个帧的 `[4:14]` 读取：

```
key[0:4]  = timeGetTime() 的 LE 编码 (系统启动后毫秒数)
key[4:8]  = 00 00 00 00
key[8:10] = 0x77 0xA5  (硬编码常量)
```

### 5.3 Tail 生成算法

`DeriveFrameTail6Bytes` (0x1400013E8)：

```
for (i = 0; i < 6; i++)
    tail[i] = (i + 3 * key[i % 10] + 17) & 0xFF;
```

### 5.4 Payload XOR 加解密

`XorKeyDerive_AddConst91` (0x140001000) 返回 `(byte + 91) & 0xFF` 。

Keystream 生成规则：

```
payload[0] ^= (key[0] + 91) & 0xFF
payload[i] ^= (key[(i-1) % 7] + 91) & 0xFF    // i >= 1
```

前 7 字节的 key 参与循环，加解密对称（异或）。

### 5.5 握手流程

```haskell
Client                              Server (106.55.224.100:8083)
  |                                    |
  |--- TCP connect ------------------->|
  |                                    |
  |--- Frame(beacon: 0x71 0x01) ------>|  ← 魔数 0x0171 (369)
  |    帧头包含 session key明文          |    服务端读取 key
  |                                    |
  |<-- Frame(cmd=0x65, identifier) ----|  ← "你有缓存的 payload 吗?"
  |                                    |
  |--- Frame(0x72 + 0xA44B config) --->|  ← "没有，请发送"
  |                                    |
  |<-- Frame(header + PE body) --------|  ← Payload 下发
  |                                    |
  |--- Frame(0xB1) every 10s --------->|  ← 心跳保活
  |<-- Frame(0xB1) --------------------|  ← 心跳响应
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3876b5b529fb1d59.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5dd90becb7adaa14.webp)

### 5.6 命令分发

`CmdHandler_DispatchPayload` (0x140002920) 根据解密后 payload 第一字节分发：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/42c947c124d31bc5.webp)

| 命令字节 | 含义  | 处理  |
| --- | --- | --- |
| 0xB1 | 心跳  | 直接返回 |
| 0x65 (101) | 查询缓存 | 读 `HKCU\QkNetK1\1` ，匹配则执行缓存，否则发 'r' 请求 |
| 其他  | payload 下发 | 头 0xA44B 存元数据，其余为 PE body，缓存到注册表后执行 |

## 六、Payload 加载机制

样本本身 **不包含内嵌 payload**，二阶段 PE 文件通过 C2 TCP 通道下发，或从注册表缓存 `HKCU\QkNetK1\1` 读取。

### 6.1 Payload 结构

```
[0]           1B    命令字节 (非 0x65/0xB1)
[1:0xA45]     0xA44B 元数据头 (含配置、payload 大小等)
[0xA45:]      NB    PE body (可能前缀填充，实际 MZ 从 offset 0x80+ 开始)
```

### 6.2 加载流程

`CmdHandler_LoadAndExecutePayload` (0x140002644) 的完整逻辑：

**步骤 1: 配置注入**

-   在 payload 中搜索 `"qklogintagx1"` 标签（银狐家族特征标记）
-   找到后将 0x12A0 字节的运行时配置 patch 到该位置
-   写配置副本到 `HKLM\SOFTWARE\QkHostCfg_v1` (REG_BINARY)

**步骤 2A: 进程镂空（ `g_ProcessHollowFlag_s7 == 1` 时）**

`ProcessHollowing_InjectTracerpt` (0x140002300)：

1.  动态解析 7 个 kernel32 API（见第七节）
2.  `CreateProcessA("tracerpt.exe", CREATE_SUSPENDED | CREATE_NO_WINDOW)` — 傲偶进程为系统自带白文件
3.  `VirtualAllocEx` 在傲偶进程分配 RW 内存
4.  `WriteProcessMemory` 写入 payload
5.  `VirtualProtectEx` 改为 PAGE_EXECUTE_READ
6.  `GetThreadContext` / `SetThreadContext` 修改主线程 RIP 指向 payload
7.  `ResumeThread` 恢复执行

Payload 加载主逻辑：搜索 qklogintagx1 → patch 配置 → 注入/反射加载

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b9af49e583b64cc.webp)

进程镂空：动态解析 7 个 API → 创建 tracerpt.exe → 注入 → ResumeThread

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/85c7118e05f33a2a.webp)

反射 PE 加载器：验证 MZ/PE/AMD64 → 映射节区 → 重定位 → IAT → DllMain

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7dc06c4201c32488.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/69a172c2ccab24f8.webp)

**步骤 2B: 反射 PE 加载（ `s7 == 0` 时，本样本默认路径）**

`ReflectivePELoader_MapAndExec` (0x1400035C8)：

1.  `ScanForEmbeddedMZPE` 从 offset 0x80 起扫描 `MZ` + `PE\0\0` 签名
2.  验证 `IMAGE_FILE_MACHINE_AMD64` (0x8664)
3.  `VirtualAlloc(ImageSize, PAGE_READWRITE)` 分配连续内存
4.  `ReflectivePE_MapSections` 映射各节区
5.  `ReflectivePE_ProcessRelocations` 处理基址重定位
6.  `ReflectivePE_ResolveImports` 解析 IAT（传入 `LoadLibraryA` / `GetProcAddress` / `FreeLibrary` ）
7.  `ReflectivePE_ProtectSections` 按节区属性设置页保护
8.  `ReflectivePE_RegisterExceptions` 注册异常处理表
9.  调用 `DllMain(DLL_PROCESS_ATTACH)` 或入口点

**步骤 3: 内存清除**

-   `XorWipeMemory`: `buf[i] = i ^ 0xA5` 覆写原始 payload 内存
-   另起 `DelayedXorWipeThread`: 200ms 后二次覆写（双重清除，防内存 dump）

### 6.3 Payload 缓存机制

| 注册表路径 | 用途  |
| --- | --- |
| `HKCU\QkNetK1\1` | 缓存完整 payload (header + PE body)，避免每次重新下载 |
| `HKCU\QkNetK1\IpDate` | C2 动态配置更新（覆盖静态 k7/m3 等） |
| `HKLM\SOFTWARE\QkHostCfg_v1` | 运行时配置副本 (0x12A0 字节 REG_BINARY) |

动态 API 解析：按索引栈上拼 API 名 → GetProcAddress

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2646031aa4dd160a.webp)

内存擦除：buf\[i\] = i ^ 0xA5 反取证

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9ff48405d8151fd2.webp)

## 七、动态 API 解析与反检测

进程镂空所需的 7 个 kernel32 API 均通过 `DynResolve_Kernel32API` (0x14000208C) 动态解析，避免在 IAT 中暴露：

```cpp
// 伪代码: 根据索引在栈上拼装 API 名称再 GetProcAddress
FARPROC DynResolve_Kernel32API(HMODULE hKernel32, int index) {
    char name[24] = {0};
    switch (index) {
        case 0: strcpy(name, "CreateProcessA");     break;
        case 1: /* 拼装 */ name = "VirtualAllocEx";     break;
        case 2: strcpy(name, "WriteProcessMemory"); break;
        case 3: /* DWORD常量 + suffix */ "GetThreadContext";  break;
        case 4: /* DWORD常量 + suffix */ "SetThreadContext";  break;
        case 5: strcpy(name, "ResumeThread");        break;
        case 6: /* 拼装 */ name = "VirtualProtectEx";    break;
    }
    return GetProcAddress(hKernel32, name);
}
```

| 索引  | API 名称 | 注入用途 |
| --- | --- | --- |
| 0   | CreateProcessA | 创建 suspended tracerpt.exe |
| 1   | VirtualAllocEx | 在傰儶进程分配内存 |
| 2   | WriteProcessMemory | 写入 payload |
| 3   | GetThreadContext | 读取线程上下文 |
| 4   | SetThreadContext | 修改 RIP 指向 payload |
| 5   | ResumeThread | 恢复傰儶进程执行 |
| 6   | VirtualProtectEx | 修改页属性为可执行 |

**规避效果：** IAT 中仅可见 `GetModuleHandleA` / `LoadLibraryA` / `GetProcAddress` 这三个无害函数，无法通过导入表扫描发现进程注入行为。

同样的栈上拼装技术也用于：

-   注册表路径 `Software\Microsoft\Windows\CurrentVersion\Run` （DWORD 数组拼宽字符）
-   值名 `WinHostSvc` （ `wmemcpy` 从常量复制）
-   `kernel32.dll` 字符串（ `strcpy` 栈上构造）
-   `tracerpt.exe` 傰儶进程名（ `strcpy` 栈上构造）
-   `DbgHelp.dll` / `MiniDumpWriteDump` （ `wmemcpy` + `qmemcpy` ）
-   注册表键 `QkNetK1` 、值 `IpDate` 、 `QkHostCfg_v1` （宽字符常量，但分散在多个函数中）

## 八、IOC 汇总

### 网络指标

| 类型  | 指标  | 说明  |
| --- | --- | --- |
| C2 IP | `106.55.224.100` | 腾讯云，主 C2 |
| C2 端口 | `8083` | TCP 原始协议 |
| 备用 C2 | `127.0.0.1:8888` | 占位，可被动态更新 |
| 备用 C2 | `127.0.0.1:80` | 占位  |
| Beacon 魔数 | `0x0171` (369) | TCP 帧 payload 前 2 字节 |
| 心跳字节 | `0xB1` | 每 10 秒发送 |

### 文件指标

| 类型  | 指标  |
| --- | --- |
| SHA256 | `8bf4356b94909590ed12cbfc8841d3b504eab07b22274a1cd79e3cf601e8dd55` |
| MD5 | `4c905d4637b5fdf61f0abd33927b1ac5` |
| 文件名 | cursor.exe / 远控样本.exe |
| 大小  | 195,584 字节 |
| 落地路径 | `%LOCALAPPDATA%\Temp\HotWater\cursor.exe` |

### 主机指标

| 类型  | 指标  | 说明  |
| --- | --- | --- |
| 持久化键 | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\WinHostSvc` | 开机自启 |
| 配置存储 | `HKCU\QkNetK1\IpDate` | C2 动态更新 |
| Payload 缓存 | `HKCU\QkNetK1\1` | 二阶段 PE 缓存 (REG_BINARY) |
| 全局配置 | `HKLM\SOFTWARE\QkHostCfg_v1` | 运行时配置 (REG_BINARY) |
| 傰儶进程 | `tracerpt.exe` | 系统自带白文件 |
| Dump 文件 | `!analyze -v-YYYYMMDD-HHMMSS.dmp` | 崩溃转储文件名模式 |
| Payload 标签 | `qklogintagx1` | 银狐家族特征标记 |
| 分组名 | `默认` | 战役/分组标签 |
| 版本  | `1.0` | 样本版本号 |
| 编译日期 | `2026.9.12` | 内嵌配置 |

## 九、YARA 规则

```swift
rule SilverFox_Loader_QkNet {
    meta:
        description = "Silver Fox (银狐) RAT loader - QkNet variant"
        author      = "Malware Analysis"
        date        = "2026-10-01"
        hash        = "8bf4356b94909590ed12cbfc8841d3b504eab07b22274a1cd79e3cf601e8dd55"
        family      = "SilverFox/银狐"
        reference   = "kanxue"

    strings:
        // wcsrev'd config blob pattern: pipe-delimited reversed keys
        // "7k|" at end = reversed "k7:" prefix (UTF-16LE)
        $cfg_k7_rev = { 37 00 6B 00 7C 00 }  // "7k|" (reversed k7)
        $cfg_m3_rev = { 33 00 6D 00 7C 00 }  // "3m|" (reversed m3)
        $cfg_r2_rev = { 32 00 72 00 7C 00 }  // "2r|" (reversed r2)
        $cfg_s9_rev = { 39 00 73 00 7C 00 }  // "9s|" (reversed s9)

        // Registry key names (wide strings, stack-built but
        // fragments visible in .rdata)
        $reg_qknet  = "QkNetK1" wide
        $reg_ipdate = "IpDate" wide
        $reg_qkcfg  = "QkHostCfg_v1" wide

        // XOR wipe pattern: buf[i] = i ^ 0xA5
        $xor_wipe = { 32 C1 34 A5 88 01 FF C1 }
        // ^ xor al, cl; xor al, 0xA5; mov [rcx], al; inc ecx

        // Session key hardcoded tail bytes 0x77 0xA5
        $key_tail = { C7 .. .. 00 00 77 A5 }

        // Beacon magic 369 = 0x0171
        $beacon = { 66 C7 .. 71 01 }

        // Heartbeat byte 0xB1
        $heartbeat = { C6 .. B1 }

        // Dynamic API: "ualAllocEx" partial (VirtualAllocEx
        // with first 4 chars overwritten by DWORD)
        $dynapi_valloc = "ualAllocEx" ascii
        $dynapi_wpm    = "WriteProcessMemory" ascii
        $dynapi_resume = "ResumeThread" ascii

        // tracerpt.exe puppet process
        $puppet = "tracerpt.exe" ascii

    condition:
        uint16(0) == 0x5A4D and
        filesize < 500KB and
        (
            (2 of ($cfg_*) and 1 of ($reg_*)) or
            (3 of ($dynapi_*, $puppet) and $xor_wipe) or
            ($key_tail and $beacon and 2 of ($reg_*))
        )
}
```

## 十、总结与防御建议

本样本是银狐家族的典型 Loader，通过伪装 AI 破解工具在编程技术群中定向投毒。整体架构成熟，反检测手法全面，但并非高度复杂——用的是经典但有效的技术组合。

**银狐家族确认依据：**

-   `QkNetK1` / `QkHostCfg_v1` / `qklogintagx1` 的 "Qk" 前缀命名体系
-   `WinHostSvc` Run 键持久化名称
-   `tracerpt.exe` 傀儡进程选择
-   `wcsrev()` 配置反转 + pipe-delimited 格式
-   自定义 TCP 帧协议 + XOR 加密

**检测建议：**

1.  **注册表监控**: 告警 `HKCU\QkNetK1` 键创建、 `HKCU\...\Run\WinHostSvc` 写入、 `HKLM\SOFTWARE\QkHostCfg_v1` 写入
2.  **网络检测**: TCP 连接到 `106.55.224.100:8083` ，特别是帧头固定尾部 `0x77 0xA5` 的流量特征
3.  **进程行为**: 非系统组件创建 suspended `tracerpt.exe` 子进程
4.  **文件系统**: `%LOCALAPPDATA%\Temp\HotWater\` 目录下可执行文件
5.  **内存特征**: 进程内存中 `qklogintagx1` 字符串（payload 注入后短暂可见）

**应急响应：**

1.  删除 `HKCU\...\Run\WinHostSvc` 持久化条目
2.  删除 `HKCU\QkNetK1` 整个键（含缓存 payload）
3.  删除 `HKLM\SOFTWARE\QkHostCfg_v1`
4.  终止任何连接 `106.55.224.100` 的进程
5.  检查是否有 `tracerpt.exe` 子进程在运行（正常情况不会自动启动）
6.  全盘扫描确认无其他残留

**安全提示：** 不要从 QQ 群、贴吧、Telegram 等渠道下载所谓的 AI 破解工具 / 激活工具。正规软件应从官方渠道获取。所有“破甲”“全破”工具均应视为高危文件，在沙箱环境中验证后再决定是否使用。

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm) [#病毒木马](https://bbs.kanxue.com/forum-4-1-6.htm)

## 附件

- [样本.bin](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/8bf4356b94909590.bin) （191.00kb，0次下载）
