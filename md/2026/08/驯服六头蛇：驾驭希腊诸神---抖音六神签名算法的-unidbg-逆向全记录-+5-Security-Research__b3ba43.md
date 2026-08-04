---
title: 驯服六头蛇：驾驭希腊诸神 - 抖音六神签名算法的 unidbg 逆向全记录 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/douyin-sixgod-metasec-unidbg-reverse-engineering/
source_host: overkazaf.github.io
clip_date: 2026-08-04T11:16:53+08:00
trace_id: 2ed0d5b1-045e-43b6-94fb-bd2e19af8d4b
content_hash: 27cdeaade777f39cdb0a9a8f1de83aaf2efa516244894c7e5c76be5adde7b548
status: synced
tags:
  - Android逆向
  - 模拟执行
series: null
feed_source: overkazaf·逆向
ai_summary: 通过 unidbg 仿真突破抖音 v37.5 三层保护，提取全部六神签名，关键突破是环境变量门与配置 JSON 中 Java 层版本字段。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3b275244-d011-813a-a39f-e211879c2b45
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 unidbg 仿真突破抖音 v37.5 三层保护，提取全部六神签名，关键突破是环境变量门与配置 JSON 中 Java 层版本字段。
> 
> - **环境变量门：** Phase 2 初始化必须设置 `28d7fdd567361198183fa7b8e=a7`，该变量通过 JADX 反编译 `n3.a()` 类发现，未设置时始终返回失败。
> - **配置 JSON 逆向：** 17 个字段需精确匹配，核心发现 `sdkVersion` 应取 Java 静态字段值 `v06.05.40‑dy`，而非 native 解密出的 `v04.09.09.07‑bugfix`，否则 VM 执行 3173 条指令后静默失败。
> - **unidbg 仿真绕过：** 通过 patch 3 个自毁处理器（统一替换为 `adr x0,#0; ret`）、固定所有时间戳/UUID 消除随机分发、补全 50+ JNI 回调，使六神签名在无真机环境中确定性生成。
> - **保护评估：** 虽叠加 OLLVM + VM + JIT 与多种反仿真，但签名完全离线计算且无服务端 nonce，突破客户端配置后即可离线生成所有签名。

> **读完本文，你将获得：**
> 
> -   掌握 unidbg 仿真 Android native SO 的完整工作流：从环境搭建到签名输出
> -   学会应对 OLLVM + VM + JIT 三层防护的实战策略：不硬逆混淆，用仿真绕过
> -   理解字节跳动 MetaSec 签名体系（六神）的架构设计和初始化依赖链
> -   获得一套排查"仿真器崩溃"的系统方法：自毁处理器识别、环境变量门、配置字段逆向

## 〇、摘要

本文记录了对抖音（Douyin）v37.5.0 `libmetasec_ml.so` 的完整逆向工程过程，目标是通过 unidbg 仿真提取六神签名算法。笔者在两个完整周末内完成了以下突破：

1.  **三层防护突破**：识别并绕过了 OLLVM 控制流平坦化 + 自定义 VM 字节码解释器 + 运行时 JIT 代码生成的三重保护
2.  **自毁处理器中和**：定位并 patch 了 3 个自毁处理器（覆盖 ~71 个调用点），防止仿真器跳转到未映射地址导致崩溃
3.  **环境变量门发现**：通过 JADX 反编译发现了隐藏的环境变量 `28d7fdd567361198183fa7b8e=a7` ，这是 Phase 2 初始化的硬性前置条件
4.  **配置 JSON 逆向**：还原了 17 字段的配置 JSON 格式，其中 `sdkVersion` 字段必须使用 Java 层静态字段值（ `v06.05.40-dy` ）而非 native 解密值，这是整个研究的核心突破点
5.  **六神签名完整提取**：X-Gorgon、X-Khronos、X-Argus、X-Ladon、X-Helios、X-Medusa 全部成功生成

难度评估： **9/10**——笔者遇到的最复杂的商业 Android 保护方案之一。

* * *

## 一、路线总览

先用一张图说清楚整个初始化到签名输出的完整序列：

![初始化序列图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d90bf92e8b0ea735.png) *完整的 Phase 1→6 初始化序列。绿色高亮的 Phase 3（配置验证）是整个研究的核心突破点；蓝色高亮的最终输出包含全部六个签名参数。*

整个研究分为 **9 个递进的步骤**：

| 步骤  | 目标  | 方法  | 产出  |
| --- | --- | --- | --- |
| **① JNI 入口定位** | 找到 native 方法注册点 | unidbg RegisterNatives 日志 + JADX | 入口地址 `SO+0x271938` ，command 架构 |
| **② 自毁处理器中和** | 防止仿真器崩溃 | 反汇编 + 二进制 patch | 3 个处理器全部 NOP（ `adr x0, #0; ret` ） |
| **③ Vtable 校验绕过** | JNI_OnLoad 通过完整性检查 | `cbz` → 无条件 `b` patch | Phase 1 正常返回 |
| **④ 环境变量门** | Phase 2 不再走失败分支 | JADX 追踪 `n3.a()` | 设置 `28d7fdd567361198183fa7b8e=a7` |
| **⑤ 确定性分发** | 消除时间戳导致的随机分支 | 固定所有 JNI 时间/UUID 返回 | Phase 2 → 100% 返回 0 |
| **⑥ 配置 JSON 逆向** | Phase 3 通过 VM 验证 | JADX 逆向 17 个字段语义 | VM 执行 3173 条指令 → 返回 `true` |
| **⑦ 会话链建立** | Phase 4 返回有效 handle | Phase 3 成功为前提 | session = `0x12731000` |
| **⑧ JIT CAS 分析** | 确认签名计算正常收敛 | 指令 trace + CAS 日志 | 4 次迭代自然收敛 |
| **⑨ 六神输出** | 完整签名 | `getFeatureHash(0x2000006)` | 6 个签名头全部生成 |

每一步都依赖前一步的产出。 **步骤 ⑥** 是整个研究的瓶颈和突破点——17 个配置字段中任何一个错误都会导致 VM 静默失败，而最关键的字段值来自 Java 层静态变量而非 native 解密结果，这一发现需要跨越 Java/Native 两个分析维度。

* * *

## 二、引言

### 2.1 研究背景

“六神”——是中文互联网安全社区对字节跳动 API 签名体系的俗称。这套以希腊神话命名的签名参数，守护着全球最大的短视频平台的 API 接口。

#### 抖音/TikTok 的市场规模

在深入技术细节之前，有必要了解这套签名体系保护的是什么量级的业务：

| 平台  | 用户规模 | 数据来源 |
| --- | --- | --- |
| ![Douyin](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/71cc70522ebec091.bin) **抖音（中国）** | **DAU 7.66 亿+，MAU 超 10 亿**，覆盖中国 71% 人口 | [QuestMobile 2025 Q1](https://www.199it.com/archives/1753397.html) |
| ![TikTok](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/010b2c00388fb450.bin) **TikTok（国际）** | **MAU 19 亿+，DAU 11.2 亿** | [Demand Sage 2026](https://www.demandsage.com/tiktok-user-statistics/) |
| ![ByteDance](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/744a5189dd116c61.bin) **字节跳动整体** | **2025 年营收 $1860 亿**，估值 $5500 亿 | [Bloomberg 2025](https://www.bloomberg.com/news/articles/2025-12-19/tiktok-owner-bytedance-on-track-for-50-billion-profit-in-2025) |
| **抖音电商** | **2025 年 GMV 超 4 万亿元**，日均 125 万场电商直播 | [36Kr 2025](https://eu.36kr.com/en/p/3480136952077441) |

MetaSec SDK 不仅保护抖音，还部署在字节跳动全系 APP 中——TikTok、今日头条、西瓜视频、汽水音乐（Resso）、飞书（Lark）等，覆盖 **数十亿设备上的 API 调用**。理解这套签名体系的工作原理，对于评估其安全性具有重要意义。

#### 六神参数一览

| 参数名 | 希腊神话原型 | 功能  | 复杂度 |
| --- | --- | --- | --- |
| **X-Gorgon** | 蛇发女妖戈尔贡 | 核心请求签名 | ⭐⭐⭐ |
| **X-Khronos** | 时间之神克洛诺斯 | Unix 时间戳 | ⭐   |
| **X-Argus** | 百眼巨人阿耳戈斯 | 设备指纹 + 风控 | ⭐⭐⭐⭐⭐ |
| **X-Ladon** | 百头巨龙拉冬 | 设备绑定签名 | ⭐⭐⭐ |
| **X-Helios** | 太阳神赫利俄斯 | 环境验证 | ⭐⭐⭐⭐ |
| **X-Medusa** | 蛇发女妖美杜莎 | 主验证参数 | ⭐⭐⭐⭐⭐ |

六组签名参数由同一个 native 函数调用（ `cmd=0x2000006` ）一次性生成，藏在经过三层保护的 `libmetasec_ml.so` 深处。

![签名生成管线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b71a8c8c025e5e4f.png) *六神签名的并行生成管线。X-Argus 是最复杂的（SM3→Protobuf→Simon→XOR→AES→Base64 六阶段），X-Khronos 最简单（纯时间戳）。*

#### 笔者的研究动机

这一研究的起点并非"破解"——而是来自笔者在工作中遇到的一个实际场景： **客户端安全测试需要理解 API 签名的生成逻辑**，以评估签名方案对重放攻击、参数篡改和设备伪造的防御强度。

具体而言，笔者需要回答几个问题：

1.  六神签名是否绑定了设备硬件标识，还是纯软件生成？
2.  时间戳验证的窗口有多宽？
3.  会话 handle 是否跨进程/重启持久化？
4.  签名计算是否包含服务端下发的 nonce（挑战-应答）？

这些问题的答案决定了签名方案的实际安全等级。要回答它们，需要走完从 SO 加载到签名输出的完整链路——而字节跳动为这条链路设置了笔者遇到过的最复杂的防护。

### 2.2 目标与范围

| 项目  | 值   |
| --- | --- |
| **目标应用** | 抖音 (Douyin) v37.5.0 |
| **包名** | `com.ss.android.ugc.aweme` |
| **目标库** | `libmetasec_ml.so` （3.8 MB, ELF64 ARM64） |
| **仿真工具** | unidbg + Unicorn2 后端（Java 11） |
| **分析时间** | 2026-03-27 ~ 2026-03-29 |

最终目标：通过 unidbg 仿真完整的六神签名生成流程，产出可验证的 6 个签名头。

### 2.3 方法论：为什么选择 unidbg 而非纯算法还原

面对三层防护的 native 库，攻击路线的选择本身就是一个决策：

![攻击路线对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3e8a92ee3fb93667.png) *三条攻击路线的优劣对比。笔者选择了 Route C（unidbg 仿真），以可复现性和深度可观测性为核心考量。*

| 路线  | 方法  | 优点  | 缺点  |
| --- | --- | --- | --- |
| **A. 纯算法还原** | 逆向 SM3/Simon/AES，纯 Python 重写 | 完全脱离 native 依赖 | 需要提取密钥；OLLVM 使静态分析极难 |
| **B. Frida Hook** | 在真机上 hook 签名函数，RPC 转发 | 快速验证 | 依赖真机/模拟器；Anti-Frida 检测 |
| **C. unidbg 仿真** | 在 JVM 中加载 SO，模拟 ARM64 执行 | 无需真机；可复现；可 trace | 需要补全 JNI 环境；工程量大 |

笔者选择了 **路线 C**，原因有三：

1.  **可复现性**：unidbg 的执行是确定性的（固定时间戳后），同一输入永远产出同一签名，方便自动化测试
2.  **深度可观测**：可以在任意地址设置 hook，trace 每一条 ARM64 指令，这对理解 VM 内部逻辑至关重要
3.  **不依赖设备**：不需要 root 手机、不需要绕过 Anti-Frida，整个流程在 JVM 中完成

代价是需要手工补全 50+ 个 JNI 回调——但这个过程本身就是逆向分析的一部分，每个回调都揭示了签名算法对设备环境的依赖关系。

* * *

## 三、逆向前的知识准备

### 3.1 抖音签名架构：六神从何而来

抖音的每个 API 请求都在 HTTP Header 中携带六个签名参数。签名的生成链路如下：

```
Java 层
  └─ ms.bd.c.m.a(cmd, i2, handle, url, body)    ← JNI 桥
      └─ libmetasec_ml.so @ 0x271938             ← native 入口
          ├─ OLLVM 调度器 @ 0x173ec4             ← 控制流平坦化
          ├─ VM 字节码解释器 @ 0x1702a8           ← 自定义 VM
          ├─ JIT 代码生成 @ 0x12540000-0x12599000 ← 运行时生成
          └─ 返回 String[] {key, value, ...}      ← 六神签名对
```

生成代码经过 **OLLVM + 自定义 VM + JIT** 三层保护，static analysis 几乎不可能直接突破。

### 3.2 MetaSec 的 command 架构

`libmetasec_ml.so` 对外暴露单一 JNI 方法，通过 `cmd` 参数区分功能：

| Command | Hex | 功能  | 所属阶段 |
| --- | --- | --- | --- |
| Context Init | `0x1000003` | 传递 ApplicationContext | Phase 1 |
| String Decrypt | `0x1000001` | 解密 12,734 个加密字符串 | Phase 2.5 |
| Library Init | `0x5000001` | 库初始化 | Phase 2 |
| Config Verify | `0x4000001` | VM 保护的配置验证 | Phase 3 |
| Get Session | `0x4000002` | 返回会话 handle | Phase 4 |
| Set Device ID | `0x2000002` | 存储设备标识 | Phase 5 |
| Set Install ID | `0x2000003` | 存储安装标识 | Phase 5 |
| **getFeatureHash** | **`0x2000006`** | **生成六神签名** | **Phase 6** |

每个 Phase 之间存在 **严格的因果链**——Phase 3 不成功，Phase 4 返回 null，后续所有操作静默失败。

### 3.3 保护层分析

> 这是笔者遇到的最复杂的商业 Android 保护方案之一。

![保护层架构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22d1e4c0a708e7df.png) *MetaSec 的三层核心保护（OLLVM → VM → JIT）与五种辅助防御机制。注意层间的耦合关系：OLLVM 保护 VM 入口，VM 保护密钥操作，JIT 保护签名计算——静态分析无法穿透任何一层。*

| 保护层 | 实现方式 | 对分析的影响 |
| --- | --- | --- |
| **OLLVM CFF** | 控制流平坦化，主调度器在 `SO+0x173ec4` ，使用 `madd` / `mul` 哈希计算状态转移 | Ghidra/IDA 无法恢复原始控制流，每个函数退化为巨大 switch-case |
| **自定义 VM** | 字节码解释器在 `SO+0x1702a8` ，通过 `ubfx` / `and` / `orr` 位域提取解码 32 位指令字 | T-table 等常规模式识别失效，密钥操作编码为 VM 指令 |
| **JIT 代码生成** | Phase 2 在堆内存（ `0x12540000-0x12599000` ）动态生成可执行代码，包含 PLT stub 和 CAS 计算循环 | 静态二进制中 **不存在** 签名计算的代码——它在运行时才生成 |
| **自毁处理器** | 3 个 handler（ `SO+0x266a38/0x266b0c/0x266be0` ）跳转到未映射地址（0x1000/0x4000/0x8000），覆盖 ~71 个调用点 | 仿真器触发后直接 SEGFAULT，且不经过任何可 hook 的 exit 路径 |
| **自修改代码** | 运行时写入 `SO+0x18b054` （代码段的 null-check patching） | 需要预先将对应页面权限设为 RWX |
| **加密字符串** | 12,734 个字符串经过加密存储，通过 `cmd=0x1000001` 运行时解密 | 静态分析看不到任何有意义的字符串 |
| **反仿真** | 时间戳相关的分发路径选择；环境变量验证；检测到异常后静默 `exit(0)` | 最狡猾的防御——不抛异常、不打日志、直接退出，所有 hook 都捕获不到 |
| **JNI 混淆** | `RegisterNatives` 注册在 `java/lang/Object` 上（通过 `MS` → `i2` → `Object` 的超类遍历），而非声明类 | 常规 hook `RegisterNatives` 时，目标类名会误导分析者 |

笔者的切身体会：这些保护层不是独立生效的—— **OLLVM 使得定位 VM 入口需要动态 trace，VM 使得密钥不以明文存在，JIT 使得签名代码不在静态二进制中，自毁处理器阻止了 trace 本身**。层层嵌套，环环相扣。

* * *

## 四、逆向工程过程

### 4.1 实验环境

| 项目  | 配置  |
| --- | --- |
| 主机  | Ubuntu 22.04 LTS, x86_64, Dual Intel Xeon E5-2673 v4 (80 threads), 96GB RAM |
| 仿真框架 | unidbg + Unicorn2 后端，Java 11 (Temurin) |
| 反编译 | JADX（DEX → Java），radare2 5.8.9（SO 静态分析） |
| 辅助  | Capstone（JIT 代码反汇编），自定义 Java hook（指令 trace + CAS 分析） |

### 4.2 步骤 ①：JNI 入口定位

> 第一个问题是找到签名函数的 native 入口。字节跳动没有使用常规的静态注册（ `Java_com_xx_method` ），而是在 `JNI_OnLoad` 中动态注册——而且注册目标类经过了混淆。

unidbg 的 `RegisterNatives` 日志捕获到：

```
RegisterNatives(java/lang/Object, 1 method)
  a(IIJLjava/lang/String;Ljava/lang/Object;)Ljava/lang/Object;
  → RX@0x271938[libmetasec_ml.so]
```

目标类是 `java/lang/Object` ？这不合理。通过 JADX 反编译追踪，笔者发现了类层次遍历逻辑：native 代码调用 `FindClass("com/bytedance/mobsec/metasec/ml/MS")` ，然后 `GetSuperClass` 两次（ `MS` → `i2` → `Object` ），最后在 `Object` 上注册 native 方法。

**推断**：这是一种 JNI 混淆手法——将 native 方法注册在基类而非声明类上，使得监控 `RegisterNatives` 的工具记录到的类名（ `java/lang/Object` ）与实际调用类名（ `MS` ）不匹配。

native 入口的跳板代码在 `SO+0x271938` ：

```armasm
mov  x1, x0          ; x1 = JNIEnv
mov  w0, w2          ; w0 = cmd
sub  sp, sp, 0x50
bl   0x271978        ; get LR
add  x1, x1, 0x38   ; computed jump target
br   x1              ; → 0x173ec4 (OLLVM 主调度器)
```

所有功能（初始化、字符串解密、签名生成）都通过同一个入口进入，由 `cmd` 参数决定走哪条 OLLVM 分支。

### 4.3 步骤 ②：自毁处理器中和

> 首次运行 unidbg 加载 SO，仿真器立刻崩溃——跳转到未映射地址 0x1000。笔者需要找到并中和所有自毁处理器，才能让 JNI_OnLoad 正常完成。

三个自毁处理器结构相同（以 `SO+0x266a38` 为例）：

```armasm
str  xzr, [x29]      ; 清除栈帧
mov  x1, 0x2b
bl   0x266a64         ; get LR
add  x1, x0, 0x34    ; 计算跳转目标
br   x1               ; → 0x1000 (未映射!) → CRASH
```

**补丁策略**：将每个 handler 的前 8 字节替换为 `adr x0, #0; ret` ——返回 handler 自身地址（有效的 RX 内存），调用者解引用 `[x0+offset]` 时读到的是代码字节而非空指针，不会崩溃。

```java
byte[] adrRet = { 0x00, 0x00, 0x00, 0x10, 0xC0, 0x03, 0x5F, 0xD6 };
// 应用到所有 3 个 handler: 0x266a38, 0x266b0c, 0x266be0
```

~71 个调用点全部被这一个 patch 模式中和。

### 4.4 步骤 ③：Vtable 校验绕过

JNI_OnLoad 过程中， `SO+0x27eee8` 处有一个 vtable 完整性检查：

```armasm
blr  x8               ; call vtable[0x30]
cbz  w0, +0xc         ; if return 0 → success
mov  w22, -1           ; else → failure
```

由于 unidbg 的 vtable 布局与真实 ART VM 不同，这个检查总是失败。

**补丁**：将 `cbz` （条件跳转）替换为无条件 `b` ：

```java
byte[] branchAlways = { 0x03, 0x00, 0x00, 0x14 }; // b #12
```

### 4.5 步骤 ④：环境变量门——JADX 是罗塞塔石碑

> 解决了崩溃和校验问题后，Phase 2（ `0x5000001` ）能跑了，但总是走失败分支返回 -1。笔者尝试了 trace 分支条件、修改寄存器、甚至暴力搜索——全部无效。突破来自 JADX。

笔者注意到 JADX 反编译的 `ms.bd.c.n3` 类中有一段关键代码：

```java
public abstract class n3 {
    public static void a(Context context, String str) {
        Os.setenv("28d7fdd567361198183fa7b8e", "a7", true);
        new p3().a(context, str); // loads native library
    }
}
```

在加载 native 库 **之前**，Java 层设置了一个环境变量 `28d7fdd567361198183fa7b8e=a7` 。这个环境变量的名字本身就是一个哈希值——32 位十六进制，显然经过设计以逃避关键词搜索。

**验证**：在 unidbg 的 `AndroidElfLoader` 初始化阶段注入这个环境变量后：

```kotlin
[Before fix]
Phase 2 (0x5000001): dispatch → SO+0x2acca8 → GetStringUtfChars path
  return -1 (FAILURE) ✗

[After fix: setenv("28d7fdd567361198183fa7b8e", "a7")]  
Phase 2 (0x5000001): dispatch → SO+0x272fb4 → getBytes("utf-8") path
  return 0 (SUCCESS) ✓
```

一个环境变量，从 -1 到 0——Phase 2 的全部秘密。

**教训**：native 层的"不可能问题"，答案可能在 Java 层。 **JADX 是理解 MetaSec 的罗塞塔石碑**。

### 4.6 步骤 ⑤：确定性分发——消灭随机性

> Phase 2 解决后出现了新问题：同一代码跑 5 次，3 次成功 2 次失败。非确定性行为是仿真调试的大敌。

追踪发现，Phase 2 存在两条分发路径：

-   `SO+0x272fb4` → 使用 `getBytes("utf-8")` → **返回 0** （成功）
-   `SO+0x2acca8` → 使用 `GetStringUtfChars` → **返回 -1** （失败）

路径选择依赖于 `JNI_OnLoad` 回调中 `currentTimeMillis()` 的返回值——不同的时间戳导致不同的调度哈希，进而走不同的 OLLVM 分支。

**修复**：固定所有时间相关的 JNI 返回：

```java
// currentTimeMillis → 固定值
return DvmLong.valueOf(vm, 1710000000000L);
// UUID.randomUUID → 固定值
return UUID.fromString("12345678-1234-1234-1234-123456789abc");
```

修复后，Phase 2 在 5 次连续运行中 **100% 返回 0**。

**推断**：时间戳相关的路径选择是一种 anti-analysis 设计——在真实设备上两条路径功能等价（都能成功），但在调试环境中表现为非确定性行为，浪费逆向工程师的时间去追查"为什么有时成功有时失败"。

### 4.7 步骤 ⑥：配置 JSON 逆向——打开一切的钥匙

> 这是整个研究中最关键的一步。Phase 3（ `0x4000001` ）接受一个 JSON 数组作为配置，VM 会逐字段验证。17 个字段中任何一个错误都会导致 VM 静默失败——不是抛异常，不是返回错误码，而是进入无限循环或直接 `exit(1)` 。

**推断过程**：

![配置验证决策树](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/22e097e13f3f85c2.png) *Phase 3 配置验证的决策树。17 个字段中任何一个不匹配都会导致不同形式的失败——exit(1)、VM 无限循环或静默返回。绿色路径是唯一的成功路径。*

Phase 3 的行为随配置状态呈现清晰的三级响应：

| 配置状态 | native 反应 |
| --- | --- |
| 完全错误 | `ms_config.cc:41` → `exit(1)` |
| 部分正确 | `ms_config.h:254` → VM 进入无限循环 |
| **正确** | **VM 执行 3173 条指令 → 返回 `Boolean.TRUE`** |

笔者通过 JADX 追踪到 Java 层的配置构造函数 `AbstractC35230AAt.LIZIZ()` ：

```java
jSONArray.put(this.LIZ);       // [0]  appId = "1128"
jSONArray.put(this.LJII);      // [1]  channel = ""
jSONArray.put(this.LJI);       // [2]  altAppId = "1128"
jSONArray.put(this.LJIIIIZZ);  // [3]  license = package name
jSONArray.put(d4.a);           // [4]  sdkVersion ← Java 静态字段!
// ...
jSONArray.put(this.LJIIJ);     // [10] aid (int as string)
// ...
jSONArray.put(this.LJIIL);     // [12] versionCode
```

笔者在这一步花费了最多的时间。关键错误的修正过程：

| 字段  | 错误值 | 正确值 | 发现方式 |
| --- | --- | --- | --- |
| \[2\] altAppId | `""` | `"1128"` | JADX 追踪 `LJI` 字段赋值 |
| **\[4\] sdkVersion** | **`"v04.09.09.07-bugfix"`** | **`"v06.05.40-dy"`** | **`d4.a` 是 Java 静态字段，不是 native 解密结果** |
| \[10\] aid | `"-1"` | `"1128"` | 与 appId 相同 |
| \[12\] versionCode | `"99999"` | `"370500"` | App 的实际 versionCode |
| \[16\]\[1\] kSt value | `"v04.09.09.07-bugfix"` | `"v06.05.40-dy"` | 必须与 \[4\] 一致 |

**核心突破**：字段 \[4\] 的值来自 `d4.a` ——一个 Java 静态字段。笔者最初假设它应该与 native 解密出的 SDK 版本字符串一致（ `"v04.09.09.07-bugfix"` ），但 VM 始终拒绝。经过反复排查，笔者发现 `d4.a` 在 Java 层被初始化为 `"v06.05.40-dy"` ——一个完全不同的版本号。native 代码验证的是 **Java 层的值**，而非自身解密出的值。这两个"版本号"分别代表 MetaSec SDK 的 Java wrapper 版本和 native core 版本，VM 校验的是前者。

**最终正确配置**：

```json
["1128","","1128","com.ss.android.ugc.aweme","v06.05.****",
 "","","","","","1128","-1","37****","","0",
 [],["kSt","v06.05.****"]]
```

VM 执行结果：

```sql
[Phase 3] Config Verify (0x4000001)
  Input: ["1128","","1128","com.ss.android.ugc.aweme","v06.05.40-dy",
          "","","","","","1128","-1","370500","","0",[],["kSt","v06.05.40-dy"]]
  VM instruction count: 3173
  VM final state: HALT_OK
  Return value: Boolean.TRUE ✓

[Phase 4] Get Session (0x4000002)  
  Return value: Long(0x1273****)
  → JIT code region, valid session handle ✓
```

从 `exit(1)` 到无限循环到 `Boolean.TRUE` ——17 个字段的 **每一个** 都需要精确匹配。

### 4.8 步骤 ⑦-⑧：会话链与 JIT CAS 分析

Phase 3 成功后，Phase 4（ `0x4000002` ）立刻返回了有效的会话 handle `Long(0x12731000)` ——指向 JIT 代码生成区域的地址。

```
Phase 3 → true  →  Phase 4 → 0x12731000  →  getFeatureHash → 签名!
```

签名计算运行在 JIT 生成的代码中，包含一个原子 CAS（Compare-And-Swap）循环：

```armasm
0x12598a10: ldaxrh w12, [x21]     ; exclusive load (acquire)
0x12598a14: stxrh  w13, w28, [x21] ; exclusive store
0x12598a18: cbnz   w13, #-8       ; retry if store failed
0x12598a28: cmp    w20, w12, uxth  ; compare expected vs actual
0x12598a2c: b.eq   #0x12598ae4    ; match → done
            ...
0x12598ab8: b      #0x12598a10    ; loop back
```

笔者最初担心这是一个 anti-emulation 陷阱（单线程仿真器无法正确模拟多核 CAS），但实际观察到它在 **4 次迭代内自然收敛**：

```toml
[CAS #1] w20=0x2000 w12=0x2008 match=false
[CAS #2] w20=0x2000 w12=0x2008 match=false
[CAS #3] w20=0x2000 w12=0x2002 match=false
[CAS #4] w20=0x2000 w12=0x2000 match=true  ← 收敛
```

无需额外 patch。

### 4.9 步骤 ⑨：六神降临

所有前置步骤完成后， `getFeatureHash(0x2000006, 0, handle, url, body)` 返回了完整的六神签名。以下是 unidbg 的实际执行输出（敏感值已脱敏）：

```java
========== DouyinMetaSec 签名生成 ==========
[Phase 1] Context Init (0x1000003) ... OK
[Phase 2] Library Init (0x5000001) ... return 0 ✓
[Phase 2.5] String Decrypt (0x1000001) ... 12734 strings decrypted
[Phase 3] Config Verify (0x4000001) ... VM executed 3173 ops → true ✓
[Phase 4] Get Session (0x4000002) ... handle = 0x1273**** ✓
[Phase 5] Set DeviceID (0x2000002) ... OK
[Phase 6] getFeatureHash (0x2000006) ... CAS converged in 4 iterations

--- 六神签名输出 ---
X-Argus:   dP3H******Q==
X-Gorgon:  8404a048******bb0c48a8****f84ad865******
X-Helios:  a3fW******yg25KV9W******p3Vc1Swv4******
X-Khronos: 1774714228
X-Ladon:   u2iH******==
X-Medusa:  cf3H******iMoqS0hp******z9C+AAZrn7******YRYwy3t******
============================================
```

六个签名头，一次调用，全部就绪。

* * *

## 五、设备注册：六神签名的第一个战场

### 5.1 为什么设备注册是起点

> 设备注册是调用抖音 **任何** API 的硬性前提。没有完成注册获得 `device_id` 和 `install_id` ，后续所有接口都不会返回数据。而设备注册请求本身就需要六神签名——这意味着笔者的 unidbg 方案必须先通过这一关。

设备注册的完整数据流：

```
设备指纹采集 (40+ 字段)
    ↓
JSON 序列化
    ↓
GZIP 压缩
    ↓
TTEncrypt 加密 (AES-128-CBC, SHA-256 KDF)
    ↓
POST /service/2/device_register/
    ├── Header: X-Gorgon, X-Khronos (签名)
    ├── Header: X-SS-Stub = MD5(body)
    └── Body: TTEncrypt(GZIP(JSON))
    ↓
服务端返回
    ├── device_id_str
    ├── install_id_str
    └── ... (用于后续所有请求)
```

### 5.2 TTEncrypt：设备注册的加密信封

TTEncrypt 是字节跳动自研的请求体加密方案，用于保护 device_register 和其他敏感 API 的 POST body：

```python
def ttencrypt(compressed: bytes) -> bytes:
    seed = os.urandom(32)                              # 32 字节随机种子
    h1 = sha256(seed + FIXED_KEY).digest()             # FIXED_KEY = SHA 初始向量
    h2 = sha256(h1).digest()                           # 两轮 SHA-256 派生
    aes_key, aes_iv = h2[:16], h2[16:]                 # 前 16B = key, 后 16B = IV
    content_hash = sha256(compressed).digest()          # 内容完整性校验
    plaintext = content_hash + compressed               # hash || data
    ciphertext = AES_CBC(aes_key, aes_iv, plaintext)   # AES-128-CBC + PKCS7
    return HEADER + seed + ciphertext                   # 6B header + 32B seed + cipher
```

**关键发现**： `FIXED_KEY` 是 SHA-256 的初始向量常量（ `6a09e667bb67ae85...`），硬编码在 `libEncryptor.so` 中。笔者通过 unidbg 加载该 SO 验证了纯 Python 实现的正确性——两者对相同输入产出 **字节完美匹配** 的密文。

### 5.3 设备指纹：40+ 字段的工程

设备注册请求携带 40+ 个设备指纹字段。笔者构造的请求使用与 unidbg 仿真环境一致的设备参数（小米 11, Android 12）：

| 类别  | 关键字段 | 示例值 | 说明  |
| --- | --- | --- | --- |
| **设备标识** | openudid, cdid, clientudid | `随机 hex/UUID` | 每次注册生成新值 |
| **硬件信息** | device_model, cpu_abi | `M2102J2SC`, `arm64-v8a` | 必须与 unidbg 配置匹配 |
| **系统信息** | os_version, rom_version | `12`, `V13.0.5.0.SK******` | Android 版本 + MIUI 版本 |
| **网络环境** | carrier_region, mcc_mnc | `CN`, `46000` | 运营商信息 |
| **APP 信息** | aid, version_code, sig_hash | `1128`, `37****`, `aea615******` | 抖音 v37.5.0 标识 |
| **安全字段** | sdk_version | `v06.05.****` | 与配置 JSON field\[4\] 一致 |

**一个容易踩的坑**： `sig_hash` 字段是 APK 签名证书的 MD5 哈希。如果使用错误的 `sig_hash` ，设备注册会成功返回 `device_id` ，但该 `device_id` 会被标记为异常，后续 API 请求的风控评分会被降权。笔者最初忽略了这一点，直到发现 feed 接口返回的推荐内容质量明显低于正常设备后才排查到原因。

### 5.4 注册结果与端到端验证

```bash
========== 设备注册验证 ==========
[TTEncrypt] seed=random(32B), AES key derived, body encrypted
[Request]   POST https://log.snssdk.com/service/2/device_register/
[Headers]   X-Gorgon: 8404******0001******  X-Khronos: 17747*****
[Response]  HTTP 200
[Result]    device_id_str = "73049******49955"
            install_id_str = "73049******49956"
            ✓ 注册成功

========== Feed API 验证 ==========
[Request]   GET /aweme/v1/feed/?device_id=73049******
[Headers]   六神全量签名
[Response]  HTTP 200, aweme_list: 10 videos returned ✓

========== 搜索 API 验证 ==========
[Request]   GET /aweme/v1/general/search/?keyword=test
[Headers]   六神全量签名
[Response]  HTTP 200, data returned ✓
=================================
```

### 5.5 初始化序列总结

完整的初始化需要严格的 Phase 顺序：

```
Phase 1 (0x1000003) Context Init
    ↓
Phase 2 (0x5000001) Library Init → 返回 0
    ↓
Phase 2.5 (0x1000001) String Decrypt (12,734 strings)
    ↓
Phase 3 (0x4000001) Config Verify → 返回 true (3173 VM ops)
    ↓
Phase 4 (0x4000002) Get Session → 0x1273****
    ↓
Phase 5 (0x2000002/03) Set Device/Install ID
    ↓
getFeatureHash (0x2000006) → CAS 4 次迭代 → 六神签名
    ↓
TTEncrypt + device_register → device_id + install_id
    ↓
Feed / Search / 任意 API → 正常响应 ✓
```

任何一步失败，后续所有步骤 **静默失败**——不抛异常，不打日志，只是返回 null。

* * *

## 六、保护方案评估与难度对比

### 6.1 难度评分

| 保护维度 | 评分  | 说明  |
| --- | --- | --- |
| API/接口发现 | 6/10 | JNI 入口经混淆但 JADX 可追踪 |
| 认证/授权 | 8/10 | 多阶段严格顺序初始化 + 会话链 |
| 签名/加密 | 9/10 | 六重并发签名；JIT 计算；CAS 原子循环 |
| 防篡改/防调试 | 9/10 | 自毁处理器 ~71 处；静默 exit(0)；环境变量门 |
| 代码混淆 | 10/10 | OLLVM + VM + JIT 三层联防 |
| **综合** | **9/10** |     |

### 6.2 横向对比

| 目标  | 难度  | 核心保护 |
| --- | --- | --- |
| **抖音 MetaSec v37.5** | **9/10** | **OLLVM + VM + JIT + 自毁 + 反仿真** |
| TikTok（国际版） | 8/10 | 类似 MetaSec，但 VM 覆盖范围较小 |
| 微信 mmtls | 7/10 | 自研 TLS + native 密码学，无 VM 保护 |
| 美团 mtgsig | 6/10 | OLLVM + token，但初始化序列简单 |
| Bilibili sign | 4/10 | 标准 native 签名，轻度混淆 |

### 6.3 与开源社区工作的深度对比：为什么六神比"已公开的"难 10 倍

互联网上关于六神签名的文章和开源项目不在少数。但绝大多数都停留在以下两个层面：

**层面 1：旧版本 + 少量签名**

| 开源项目 | 目标版本 | 覆盖签名 | 方法  | 与 v37.5 的差距 |
| --- | --- | --- | --- | --- |
| [Mr-Abood/TikTok-Encryption](https://github.com/Mr-Abood/TikTok-Encryption) | TikTok ~v25 | X-Gorgon 单签名 | 纯算法还原 | **无 VM、无 JIT、无自毁处理器** |
| [gaplan/TikTok-X-Gorgon](https://github.com/gaplan/TikTok-X-Gorgon) | TikTok ~v25 | X-Gorgon 单签名 | 纯算法还原 | 同上  |
| [ssovit/x-gorgon-khronos-argus-ladon](https://github.com/ssovit/x-gorogn-khronos-argus-ladon) | TikTok ~v27 | 四神（不含 Helios/Medusa） | 纯算法 + Frida | **无 JIT 代码生成，无配置 JSON VM 验证** |
| dy233_androidNativeEmu_sign | 抖音 v23.3 | 六神（仿真） | AndroidNativeEmu | **v23.3 的保护层仅 OLLVM+VM，无 JIT 层** |

**层面 2：Frida hook 而非真正理解**

大量中文博客文章（知乎、CSDN、吾爱破解）描述的"六神算法逆向"实际上是：

1.  Root 手机 → Frida 附加 → hook `MSManager.tryAddSecurityFactor()` → 转发签名结果
2.  使用 [r0capture](https://github.com/nicehash/r0capture) 抓包 → 提取 header → 固定签名重放

这两种方法 **没有理解签名算法本身**——它们依赖真实设备和 Frida 运行时，一旦 App 更新或 Anti-Frida 升级就完全失效。

**笔者工作与上述方法的本质差异**：

| 维度  | 开源社区 (典型) | Frida hook 类文章 | **本研究** |
| --- | --- | --- | --- |
| 目标版本 | TikTok v25-27 / 抖音 v23.3 | 不固定 | **抖音 v37.5（2026 最新）** |
| 覆盖签名数 | 1-4 个 | 6 个（但非理解） | **6 个（理解生成链路）** |
| 保护层突破 | OLLVM（或不需要） | 无（Frida 绕过） | **OLLVM + VM + JIT 三层** |
| 是否需真机 | 部分需要 | **必须** | **不需要** |
| 是否可复现 | 部分可 | 换版本即失效 | **确定性执行，100% 可复现** |
| 对保护机制的理解 | 算法层 | 黑盒  | **架构层（9 步 patch + bypass）** |
| 设备注册 | 大多跳过 | 依赖真机 | **TTEncrypt + 注册全流程** |

**最关键的差异——版本跨越带来的保护升级**：

```
v23.3 (2023)    v27.9 (2024)    v33.x (2025)    v37.5 (2026)
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────────┐
│ OLLVM   │    │ OLLVM   │    │ OLLVM   │    │ OLLVM           │
│ VM      │    │ VM      │    │ VM      │    │ VM              │
│         │    │ 反仿真  │    │ 反仿真  │    │ JIT 代码生成 ← NEW│
│         │    │         │    │ 自毁    │    │ 自毁处理器 ×3   │
│         │    │         │    │         │    │ 反仿真(静默exit)│
│         │    │         │    │         │    │ 自修改代码      │
│         │    │         │    │         │    │ CAS 原子循环    │
└─────────┘    └─────────┘    └─────────┘    └─────────────────┘
  2 层防护       3 层防护       4 层防护       7+ 层防护
  开源可破       部分开源       极少公开       本文首次公开突破
```

v37.5 相比 v23.3 新增了 **至少 5 层防护**。dy233 的 v23.3 方案在 v37.5 上 **完全不可用**——不仅 patch 地址全部失效，连 JIT 代码生成这一整层都是全新的。笔者需要从零开始理解每一层新增的防护，这就是为什么难度从 6/10 跃升到 9/10。

### 6.4 攻防分析：做得好的 vs 做得不好的

| 做得好 | 做得不好 |
| --- | --- |
| VM + JIT + OLLVM 三层使静态分析近乎不可能 | 环境变量名 `28d7fdd567361198183fa7b8e` 是 Java 代码中的固定常量（JADX 可发现） |
| 时间戳相关分发制造非确定性行为 | 时间戳固定后，分发变成 100% 可预测 |
| 自毁处理器覆盖 ~71 个调用点 | 3 个 handler 共享相同结构，单一 patch 模式即可中和所有 |
| 配置 JSON 字段级验证拦截部分重构 | 无服务端 nonce 或挑战-应答；配置完全在客户端 |
| CAS 循环使用硬件原子指令 | 在单线程仿真器中 4 次迭代即收敛 |
| 静默 `exit(0)` 绕过所有 hook | —   |

最后一项——静默 `exit(0)` ——是笔者认为最精妙的设计。它绕过了 PLT hook、SVC handler、SecurityManager 和 Java 异常处理，让仿真器"无声无息"地结束。笔者花了相当长的时间才意识到"程序没有崩溃，它只是悄悄退出了"。

* * *

## 七、讨论与反思

### 7.1 关键教训

1.  **Java 层是罗塞塔石碑**。JADX 反编译的 `AbstractC35220AAs` 、 `AbstractC35230AAt` 、 `j2` 、 `s2` 、 `n3` 等类揭示了完整的初始化序列、配置格式和 command 码。Native 分析受阻时，答案几乎总是在 Java 层。
    
2.  **确定性是仿真调试的基石**。随机的时间戳和 UUID 导致了非确定性分发路径——在修复逻辑错误之前，必须先消灭所有随机性来源。
    
3.  **配置字段具有语义意义**。Native 代码不仅检查格式，还验证具体的字段值。 `d4.a` 作为 Java 静态字段（而非 native 解密值）是整个研究中影响最大的单一发现。
    
4.  **VM 保护 ≠ 无限循环**。 `SO+0x1702a8` 处的 VM 在收到正确输入后执行正确——“无限循环"实际上是 VM 因错误配置而反复执行错误处理路径。
    
5.  **JIT CAS 循环是红鲱鱼**。 `ldaxrh` / `stxrh` 循环看起来像 anti-emulation 陷阱，实际上是计算自然收敛。
    

### 7.2 AI 辅助的能力边界

笔者在研究过程中使用了 AI 辅助（Claude Code），以下是诚实的评估：

**AI 帮上忙的**：

-   JNI 回调补全：50+ 个 `callStaticMethod` / `callObjectMethod` 回调的模板代码生成
-   错误模式分析：将 native 日志中的 `ms_config.cc:41` 与配置字段关联
-   汇编解读：CAS 循环的 ARM64 指令语义解释

**AI 做不到的**：

-   发现环境变量门——需要在 JADX 输出的数万行 Java 代码中注意到 `Os.setenv` 调用
-   判断 `d4.a` 是 Java 层值而非 native 值——需要跨越 Java/Native 两个分析维度的推理
-   区分"真正的无限循环"和"VM 执行错误路径”——需要对 VM 行为的直觉判断

**结论与 Widevine 研究一致**：AI 是极好的副驾驶，但方向盘必须在人手上。

### 7.3 深层思考：MetaSec 的安全哲学

回顾整个逆向过程，笔者对 MetaSec 的保护设计有几点超越技术层面的思考：

#### 7.3.1 “纵深防御"vs"单点突破”

MetaSec 的设计哲学是 **纵深防御**——不依赖任何单一保护层，而是通过多层叠加提高攻击成本。这一策略在理论上是正确的（与 NIST 的 Defense-in-Depth 原则一致），但笔者的实际经验揭示了一个微妙的问题：

**多层防御的每一层都需要独立维护和更新。** 笔者观察到：

-   自毁处理器的 3 个 handler 共享相同结构——一旦攻破一个，其余两个免费
-   环境变量 `28d7fdd567361198183fa7b8e` 在 Java 层以明文存储——JADX 一搜即得
-   配置 JSON 的 17 个字段全部来自客户端——无服务端参与

这说明 **纵深防御的有效前提是层间正交**——每一层应该依赖不同的安全假设。当自毁处理器 × 3 共享同一结构，它本质上是"一层防御部署了三次"，而非"三层独立防御"。

#### 7.3.2 客户端签名的固有局限

笔者在 Widevine L3 研究中观察到类似的模式： **当所有密钥材料都在客户端时，安全性的天花板由混淆强度决定**。MetaSec 的六神签名也不例外——所有需要的信息（密钥、配置、算法）都在 APK 内部，签名生成不依赖服务端挑战。

这意味着：

| 攻击模型 | MetaSec 的防御 | 有效性 |
| --- | --- | --- |
| 自动化爬虫 | 签名验证 + 设备指纹 | 有效（提高攻击门槛） |
| 专业逆向 | OLLVM + VM + JIT | 暂时有效（如本文所示，可被突破） |
| 国家级攻击者 | —   | 无效（客户端不可能抵御国家级对手） |

**改进思路**：引入服务端参与的签名机制（类似 Google SafetyNet Attestation 或 Apple App Attest），使得即使客户端被完全逆向，攻击者仍需实时与服务端交互。代价是增加了延迟和离线不可用，但可以将安全边界从"客户端混淆强度"提升到"服务端验证逻辑"。

#### 7.3.3 OLLVM 在 2026 年的困境

笔者在本研究和 Widevine 研究中都遇到了 OLLVM 保护。一个值得关注的趋势是： **OLLVM 的保护效果正在被工具链进步所侵蚀**。

| 年份  | OLLVM 状态 | 攻击工具 |
| --- | --- | --- |
| 2017 | 几乎不可破 | 手动分析 |
| 2020 | 困难但可行 | angr + 符号执行 |
| 2023 | 中等难度 | D-810、ollvm-unflattener |
| 2026 | **可被绕过** | **unidbg 直接仿真执行，无需理解混淆代码** |

笔者的方法—— **不反混淆，直接仿真**——代表了一种范式转移：当混淆强到无法理解时，绕过理解本身。unidbg 不需要"读懂"OLLVM 平坦化的代码，它只需要"执行"它。这使得 OLLVM 从"阻止理解"退化为"阻止静态分析"——而仿真是动态的。

**对防御方的启示**：单纯堆叠代码混淆的边际收益正在递减。未来的保护需要转向 **服务端验证、硬件可信计算（TEE/SE）和行为分析**，而非仅依赖客户端混淆。

### 7.4 改进方案：如果笔者是 MetaSec 的架构师

基于本次逆向的发现，笔者对 MetaSec 提出以下改进建议（同时讨论每个方案的成本和可行性）：

#### 改进 1：服务端挑战-应答（影响最大）

```
当前:  签名 = f(url, body, device_info, client_keys)
改进:  签名 = f(url, body, device_info, client_keys, server_nonce)
```

**方案**：每次 API 请求前，客户端先向 `/challenge` 端点获取一个一次性 nonce，签名计算必须包含该 nonce。服务端验证时检查 nonce 的有效性和唯一性。

**效果**：即使攻击者完全逆向了签名算法，也无法离线批量生成签名——每个签名都需要一次服务端交互。

**成本**：每次 API 调用增加一次 RTT（~50ms），离线场景需要预缓存 nonce 池。对于抖音这种高频请求的场景（每次滑动触发多个 API），延迟成本不可忽视。

**可行性**：⭐⭐⭐（高延迟成本，但安全收益显著）

#### 改进 2：自毁处理器多态化

```
当前:  3 个 handler 共享相同结构 → 单一 patch 模式中和所有
改进:  每个 handler 使用不同的跳转计算方式 + 随机化目标地址
```

**方案**：编译时为每个 handler 生成不同的地址计算逻辑（ `adr` vs `ldr` vs `movz+movk` ），目标地址从固定的 0x1000/0x4000/0x8000 改为运行时计算。

**效果**：攻击者需要为每个 handler 单独分析和 patch，无法"一招通杀"。

**成本**：编译时模板化，几乎零运行时开销。

**可行性**：⭐⭐⭐⭐⭐（低成本高收益，最建议优先实施）

#### 改进 3：环境变量门动态化

```
当前:  固定 env var "28d7fdd567361198183fa7b8e" = "a7"（JADX 可见）
改进:  env var 名和值由服务端下发或设备绑定生成
```

**方案**：环境变量名通过 `HMAC(device_id, timestamp)` 动态生成，值通过加密的 SharedPreferences 存储，每次更新 MetaSec SDK 时轮换。

**效果**：Java 层不再有固定常量可搜索，攻击者需要逆向 HMAC 生成逻辑。

**成本**：中等工程量，需要修改 SDK 初始化流程。

**可行性**：⭐⭐⭐⭐（中等成本，显著提高门槛）

#### 改进 4：配置验证服务端化

```
当前:  配置 JSON 17 字段在客户端 VM 中验证
改进:  配置签名由服务端生成，客户端仅转发
```

**方案**：App 启动时向 `/config/sign` 端点发送设备信息，服务端返回签名后的配置 blob。客户端将此 blob 传递给 native 层，native 仅验证服务端签名而非逐字段校验。

**效果**：攻击者无法在不与服务端交互的情况下构造有效配置。17 个字段的逆向工作完全失去意义。

**成本**：需要服务端增加一个签名端点，客户端增加一次启动时请求。

**可行性**：⭐⭐⭐⭐（对笔者方法的最有效防御）

#### 改进 5：unidbg 检测

```
当前:  检测 Frida、Root、模拟器
改进:  增加 unidbg 特征检测
```

**方案**：利用 unidbg 的已知限制进行指纹检测：

-   `/proc/self/maps` 中缺少 `linker64` / `libc.so` 的真实路径
-   `getauxval(AT_HWCAP)` 返回不完整的 CPU feature flags
-   `pthread_create` 的线程 ID 分配模式与真实内核不同
-   `clock_gettime(CLOCK_MONOTONIC)` 的精度异常（unidbg 使用 Java `System.nanoTime()` ）

**效果**：迫使攻击者修改 unidbg 源码适配每一项检测，大幅提高迭代成本。

**成本**：需要持续研究 unidbg 的行为差异，维护检测规则。

**可行性**：⭐⭐⭐（军备竞赛性质，但短期有效）

#### 改进优先级总结

| 改进  | 安全收益 | 实施成本 | 优先级 |
| --- | --- | --- | --- |
| 自毁处理器多态化 | 中   | 极低  | **P0** |
| 环境变量动态化 | 中高  | 中   | **P1** |
| 配置验证服务端化 | 高   | 中   | **P1** |
| unidbg 特征检测 | 中   | 中   | **P2** |
| 服务端挑战-应答 | 极高  | 高   | **P3** （需产品权衡） |

### 7.5 AI 时代的防护新思路

2025-2026 年，AI Agent（如 Claude Code、Cursor、Devin）正在深刻改变逆向工程的攻防格局。笔者在本次研究中大量使用 AI 辅助生成 JNI 回调代码、分析 ARM64 指令语义、排查字节序错误——这些曾经需要数小时的"体力活"现在可以在几分钟内完成。

这意味着 **传统的"增加逆向工作量"防护策略的性价比正在急剧下降**。

#### 传统防护在 AI 时代的失效曲线

| 防护手段 | 无 AI 时的攻击成本 | 有 AI 时的攻击成本 | 衰减率 |
| --- | --- | --- | --- |
| OLLVM 控制流平坦化 | 数周静态分析 | unidbg 直接仿真， **零反混淆成本** | **~100%** |
| JNI 回调补全 | 每个回调 20-30 min | AI 生成模板 1-2 min | ~90% |
| 字符串加密 | 逐个分析解密函数 | AI 批量识别加密模式 | ~80% |
| 二进制 patch | 手动定位 + 编写 patch | AI 分析崩溃日志 + 建议 patch | ~70% |
| VM 字节码保护 | 需逆向指令集 | unidbg 当黑盒执行 | **~95%** |
| **服务端验证** | 需破解服务端逻辑 | **AI 无法绕过服务端** | **~0%** |
| **TEE/硬件绑定** | 需物理攻击 | **AI 无法突破硬件** | **~0%** |

规律很明显： **AI 大幅降低了客户端混淆类防护的成本，但对服务端验证和硬件绑定几乎无效**。

#### AI 时代的防护范式转移

笔者认为，面对 AI 辅助逆向的趋势，防护架构应从\*\*“让代码难以理解” **转向** “让正确执行依赖不可复制的上下文”\*\*：

**1\. 服务端参与的签名（Server-Assisted Signing）**

最根本的改变。将签名密钥的一部分放在服务端，客户端只持有半密钥。即使 AI 帮助攻击者完全理解了客户端算法，仍然无法在没有服务端交互的情况下生成有效签名。

```
传统:   sign = HMAC(client_key, request_data)
改进:   sign = HMAC(client_half ⊕ server_half, request_data)
          ↑ server_half 每次请求从服务端获取
```

**2\. 行为指纹替代代码混淆（Behavioral Fingerprinting）**

与其试图阻止 AI 理解代码，不如让 AI **无法模拟真实用户行为**：

-   触摸轨迹的贝塞尔曲线参数（人类滑动 vs 程序化调用）
-   传感器数据模式（陀螺仪、加速度计的微振动特征）
-   API 调用时序分布（真实用户的请求间隔符合特定统计分布）

AI 可以生成签名，但很难生成 **统计上与真实人类不可区分的行为序列**。

**3\. 基于 TEE 的设备证明（Device Attestation）**

Android 的 [Hardware-backed Keystore](https://developer.android.com/training/articles/keystore) + [Key Attestation](https://developer.android.com/training/articles/security-key-attestation) 已经提供了基础设施：

```
传统:  device_id = 软件生成的随机值（可伪造）
改进:  device_id = TEE 签名的证书链（需硬件参与，不可仿真）
```

Google 的 [Play Integrity API](https://developer.android.com/google/play/integrity) 正是这一方向的实践——它不依赖客户端混淆，而是依赖 **Google 服务端对设备完整性的背书**。unidbg 可以仿真 `libmetasec_ml.so` ，但无法仿真 TEE 中的密钥签名。

**4\. 签名算法的在线更新（OTA Algorithm Update）**

```
传统:  算法硬编码在 SO → 一次逆向终身有效
改进:  算法以加密字节码下发 → 服务端可随时更换算法
```

MetaSec 已经有 VM 字节码解释器——如果签名算法不是编译时嵌入，而是由服务端动态下发加密的 VM 字节码，那么攻击者每次逆向只对当前版本有效。这将攻防从"一次性逆向"转变为"持续对抗"。

#### AI 时代的攻防新平衡

笔者的判断：未来 2-3 年内， **纯客户端的代码混淆将不再是有效的安全边界**。AI 使得"理解混淆代码"的成本趋近于零（通过仿真绕过而非反混淆），而"堆叠混淆层数"的边际收益递减。

防护方需要接受一个现实： **客户端代码在 AI 面前是透明的**。安全边界必须转移到攻击者无法触及的地方——服务端逻辑、硬件可信根和行为统计模型。

这不是一个悲观的结论。恰恰相反，这是一个 **更清晰的安全模型**：不再寄希望于"攻击者看不懂代码"（希望终将破灭），而是构建"即使攻击者完全理解代码也无法突破"的防护体系。前者是 **安全通过模糊（Security through Obscurity）**，后者是 **密码学意义上的安全（Provable Security）**。

> 正如笔者在 Widevine 研究中的感悟：数学结构的不变性不随工具进化而改变。防护方应该依赖数学（密码学协议设计），而非依赖复杂度（代码混淆）。AI 可以穿透任何复杂度，但它穿透不了正确的密码学。

### 7.6 未来研究方向

-   **纯算法还原**：有了 unidbg 作为 ground truth，可以逐步将 SM3/Simon/AES 管线替换为纯 Python 实现，最终脱离 native 依赖。笔者已在 `/research/luna/six_gods/common/` 下完成了 SM3（3/3 测试通过）、Simon-128/256（NSA 向量通过）和 AES-128-CBC（NIST 向量通过）的纯 Python 实现，下一步是集成 Protobuf 序列化层
-   **X-Helios / X-Medusa 算法确认**：这两个参数的加密算法在 unidbg 中已能输出，但内部的密码学管线仍未完全理解——它们是否也使用 Simon？是否有独立的密钥派生？
-   **跨版本差分**：对比 v27.9、v33.x、v37.5 三个版本的 MetaSec SDK，系统性分析配置格式、密钥轮换和保护层演进
-   **Harness Engineering 自动化**：笔者已搭建了四层验证框架（L1 单元测试 → L2 样本重放 → L3 服务器验证 → L4 差分对比），目标是让 AI Agent 在此闭环中自主迭代还原纯算法实现——“人类搭 Harness，AI 跑还原”

* * *

## 八、相关工作与笔者贡献

### 8.1 研究时间线

| 时间  | 研究者/项目 | 成果  | 方法  | 公开程度 |
| --- | --- | --- | --- | --- |
| 2020 | [Citizen Lab](https://citizenlab.ca/) | 确认抖音/TikTok `libcms.so` 二进制完全一致 | 文件哈希比对 | 学术报告 |
| 2023 | [Mr-Abood/TikTok-Encryption](https://github.com/Mr-Abood/TikTok-Encryption) | X-Gorgon 0404 版完整实现（含置换表） | 静态逆向 | 开源 (MIT) |
| 2024 | [gaplan/TikTok-X-Gorgon](https://github.com/gaplan/TikTok-X-Gorgon) | X-Gorgon 0408 版简洁实现 | 静态逆向 | 开源  |
| 2024 | [ssovit/x-gorgon-khronos-argus-ladon](https://github.com/ssovit/x-gorogn-khronos-argus-ladon) | TikTok 四神 Python 实现 | 社区协作 | 开源 (MIT) |
| 2025 | dy233_androidNativeEmu_sign | 抖音 v23.3 X-Helios/X-Medusa 仿真 | AndroidNativeEmu | 部分公开 |
| 2025 | [zhkl0228/unidbg](https://github.com/zhkl0228/unidbg) | Android ARM 仿真框架 | Unicorn + DalvikVM | 开源 (Apache 2.0) |
| **2026.03** | **本研究** | **抖音 v37.5 全部六神完整提取** | **unidbg + JADX 联合分析** | **本文** |

### 8.2 笔者的借鉴与独立贡献

笔者的工作站在以上所有研究者的肩膀上。以下明确区分了 **借鉴了什么** 与 **笔者独立完成了什么**：

| 步骤  | 借鉴来源 | 笔者独立完成的 |
| --- | --- | --- |
| unidbg 框架搭建 | zhkl0228/unidbg 提供了仿真基础设施 | 针对 MetaSec v37.5 的 50+ JNI 回调补全、内存权限修复、pthread hook |
| X-Gorgon 算法理解 | Mr-Abood 的 0404 版实现提供了算法参考 | v37.5 版本的适配验证；确认签名格式未变 |
| X-Argus 密码学组件 | ssovit 的实现确认了 SM3+Simon+Protobuf+AES 管线 | 密钥来源追踪；sign_key 的 Java/Native 层差异分析 |
| 旧版仿真参考 | dy233 的 v23.3 AndroidNativeEmu 方案 | **从 v23.3 到 v37.5 的完整迁移：新版增加了 JIT 代码生成、自毁处理器、反仿真机制，旧版方案无法直接复用** |
| JNI 混淆识别 | —   | **完全独立发现：RegisterNatives 注册在 Object 而非 MS 类上的混淆手法** |
| 自毁处理器中和 | —   | **完全独立完成：3 个 handler 的定位、结构分析和统一 patch 策略** |
| **环境变量门** | —   | **完全独立发现： `28d7fdd567361198183fa7b8e=a7` ，通过 JADX 追踪 `n3.a()` 类发现** |
| **时间戳分发** | —   | **完全独立发现并解决：非确定性执行的根因分析和修复** |
| **配置 JSON 17 字段逆向** | —   | **完全独立完成：每个字段的语义还原，特别是 field\[4\] Java 层值 vs native 值的关键发现** |
| **六神完整提取** | —   | **首次在 v37.5 上完成全部 6 个签名的 unidbg 仿真输出** |

**笔者工作的核心价值** 在于：

1.  **版本跨越**：从 v23.3（2023 年版）跨越到 v37.5（2026 年最新版），防护层从"OLLVM + VM"升级为"OLLVM + VM + JIT + 自毁 + 反仿真"，旧方案完全失效
2.  **六神完整覆盖**：已有工作最多覆盖四神（X-Gorgon/X-Khronos/X-Argus/X-Ladon），笔者首次在 unidbg 上完整提取包括 X-Helios 和 X-Medusa 在内的全部六个签名
3.  **方法论记录**：从 JNI_OnLoad 到签名输出的 9 个步骤、5 次失败路径、3 个 patch 策略——完整的 **可复现** 技术记录，而非仅公布最终结果

### 8.3 致谢

-   **[zhkl0228](https://github.com/zhkl0228)** 维护的 unidbg 项目是本研究的基础设施，没有它就没有这项工作
-   **Mr-Abood** 和 **ssovit** 的开源实现为笔者理解六神算法结构提供了宝贵的参照
-   **dy233** 的 v23.3 仿真方案虽然无法直接复用于 v37.5，但为笔者提供了"unidbg 可以跑通 MetaSec"的信心——这在面对 9/10 难度时是重要的心理支撑

* * *

## 九、给感兴趣的读者

### 入门建议

如果你对 Android native 逆向感兴趣，笔者建议从简单目标开始：

| Level | 目标  | 学习重点 |
| --- | --- | --- |
| 1   | Bilibili sign | 基础 JNI hook + MD5/SHA 签名 |
| 2   | 美团 mtgsig | OLLVM 初体验 + token 机制 |
| 3   | 微信 mmtls | 自研协议逆向 + BoringSSL |
| 4   | TikTok 四神 | MetaSec 入门（国际版保护较弱） |
| 5   | **抖音六神** | **OLLVM + VM + JIT 三层突破** |

### 笔者不建议做的事情

本文的目的是记录逆向工程方法论，不是提供可直接使用的攻击工具。笔者不建议：

1.  使用签名绕过进行批量爬取——字节跳动的服务端风控（频率限制、设备指纹关联、行为分析）远比客户端签名复杂
2.  用于账号批量注册或营销欺诈——违反《计算机信息网络国际联网安全保护管理办法》和平台服务条款
3.  将本文的 patch 方案直接用于生产——字节跳动会定期更新 MetaSec SDK 版本，patch 地址随版本变化

* * *

## 十、结论

本文系统记录了对抖音 v37.5.0 `libmetasec_ml.so` 的完整逆向工程过程。笔者的主要贡献包括：

1.  识别并突破了 **OLLVM + 自定义 VM + JIT 代码生成** 的三层防护，这是笔者遇到的最复杂的商业 Android 保护方案之一
2.  发现了 **环境变量门** （ `28d7fdd567361198183fa7b8e=a7` ）、 **时间戳相关分发** 和 **静默 exit(0)** 三种 anti-analysis 机制
3.  完整还原了 **17 字段配置 JSON** 的语义，其中 `sdkVersion` 字段的 Java/Native 值差异是核心突破点
4.  通过 unidbg 成功提取了 **全部六个签名参数** （X-Gorgon、X-Khronos、X-Argus、X-Ladon、X-Helios、X-Medusa）

### 一个值得注意的设计问题

回顾整个保护方案，笔者认为字节跳动做了一个有趣的设计权衡： **配置验证完全在客户端**。

六神签名的生成不依赖服务端下发的任何动态挑战（nonce、token、challenge）——所有需要的信息都在 APK 内部。这意味着一旦逆向工程师理解了初始化序列，就可以在 **完全离线** 的环境中生成有效签名。

如果引入服务端 nonce（类似 Google reCAPTCHA 的挑战-应答模式），即使攻击者完全逆向了客户端算法，仍然需要实时与服务器交互——这会显著提高自动化攻击的成本。当然，这也会增加正常用户的延迟和离线场景的复杂度。

安全工程的永恒命题： **便利性与安全性的取舍**。字节跳动选择了在客户端堆叠防护层数（OLLVM + VM + JIT + 自毁 + 反仿真），而非在协议层引入服务端验证。这一选择使得防护的天花板由 **客户端混淆的强度** 决定——而正如本文所展示的，混淆终究可以被耐心和正确的方法论所穿透。
