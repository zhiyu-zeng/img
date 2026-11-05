---
title: 【微信】移动端app逆向渗透测试Skills,一句话脱壳、逆向，过检测
source: https://mp.weixin.qq.com/s/PtOQY0un_r8upYg6_caA-g
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T10:32:00+08:00
trace_id: 22774c03-1fae-40e6-92cd-8cb5171d318a
content_hash: 1035eb6f0967681390550d437bbea04ccc82cc27dcfc2f03f02da7a1aa3ec045
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
notion_page_id: 40f75244-d011-8168-bc0e-d52c3633604d
ioc: null
---

**Hunter取证** *2026年11月5日 08:18*

MobileRE-Skill 是一个面向 AI Agent 的移动端逆向分析技能集。项目Agent 角色定义与 6 个技能，附带 23 个 Frida 模块、16 个二进制分析与修复工具，覆盖脱壳、反检测绕过、加密分析、行为摸底、Native 逆向与安全合规检测等场景。用户以一句话描述需求，由 Agent 按内置决策树自动完成分析全流程。本文基于该项目的本地代码副本，对项目定位、架构、技能类型、关键技术、安装与使用方法进行系统梳理。

* * *

## 1\. 核心事实速览

| 项目  | 内容  |
| --- | --- |
| 项目名称 | MobileRE-Skill |
| 项目定位 | 面向 AI Agent 的移动端逆向分析技能集（Agent Skills） |
| 最新版本 | v0.6.0（据 README 徽章与 Releases 链接） |
| 开源许可 |     |
| 代码托管 | github.com/index-login/MobileRE-Skill |
| 目标 Agent | Kilo（Agent 定义位于 `.kilo/agent/reverser.md` ） |
| 技能数量 | 6 个：frida-mobile-security / rev-dex-dumper / rev-symbol / rev-struct / rev-unicorn-debug / karpathy-guidelines |
| Frida 模块 | 23 个：monitors 14 个（纯观察）+ bypass 9 个（主动干预） |
| 二进制/修复工具 | 16 个（ `scripts/utils/` ）；另有 7 个独立检测/调试文件（ `frida-mobile-security/tools/` ） |
| 技巧域手册 | 9 篇（ `references/` ，覆盖脱壳、反检测、加密 Hook、行为分析、静态分析、Native 分析、故障诊断、API 参考、文章索引） |
| 主要适配平台 | Android（另附鸿蒙 HAP 包解析工具 `tools/hap_parser.py` ） |
| 前置条件 | Python 3.9+、Frida、ADB、root 测试机（部分场景需 SELinux Permissive） |

## 2\. 项目定位：给 AI Agent 的“逆向大脑”，而非脚本工具箱

### 2.1 这不是脚本合集

项目 README 开篇即明确定位：“一个让 AI Agent（Kilo）真正‘会逆向’的完整技能系统——不只是 Frida 脚本，而是覆盖静态分析、动态分析、脱壳、反检测、Native 逆向、安全合规的完整逆向工作流。”

从代码结构看，这一立场有对应的工程实现：

-   交付物是文档与定义，而非可执行程序：核心是 `.kilo/agent/reverser.md` （Agent 角色定义）与 `.kilo/skill/` 下的 SKILL.md（任务路由 + 决策树 + 模块目录）。
    
-   决策依据显式化：SKILL.md 内置“任务路由表”，将用户意图关键词映射到 9 个技巧域手册（ `references/` ），并按决策树选择模块组合。
    
-   反馈闭环：分析过程中遇到的决策树缺口、模块缺陷写入 `feedback/FEEDBACK.md` ，字段类型限定 5 种（decision-tree / module-bug / missing-module / doc / tool）。
    
-   结构遵循 Agent Skills 开放标准：“单 skill + references 分域 + 脚本共享”，脚本作为共享库被各技巧域引用，不复制、不重复造轮子。
    

### 2.2 与传统逆向工具箱的区别

| 维度  | 传统逆向工具箱 | MobileRE-Skill |
| --- | --- | --- |
| 使用者 | 人类工程师 | AI Agent（Kilo 等） |
| 交互方式 | 手敲命令 | 一句话描述需求 |
| 核心交付 | 脚本/工具 | Skill 文档 + Agent 定义（`.kilo/` ） |
| 决策依据 | 人的经验 | SKILL.md 决策树 |
| 反馈闭环 | 无   | Feedback 机制自动记录失败路径 |
| 静态分析 | 手动开 JADX | jadx-mcp 让 AI 直接读类源码 |

### 2.3 一次分析的完整闭环

据 `.kilo/agent/reverser.md` ，Agent 的工作流为：用户提需求 → 第一步调用 skill 工具加载 `frida-mobile-security` → 按 SKILL.md 任务路由表匹配意图并读取对应 `references/*.md` → 按决策树组合模块（ `utils.js` 始终首个加载）→ 输出结论标注代码位置（file:line）→ 分析完成后写入 <包名>/REPORT.md（含漏洞链描述、PoC、OWASP MASVS 映射）。其核心原则包括“攻击面优先，hook 在后”“静态找可能，动态验证实”“漏洞链思维”等。

## 3\. 架构拆解

### 3.1 总体架构（README 四层架构 + 合规检测）

| 层级  | 组成  | 职责  |
| --- | --- | --- |
| Agent 大脑层 | `.kilo/agent/reverser.md`<br><br>（角色定义）、`.kilo/skill/*/SKILL.md` （路由 + 决策树）、 `feedback/FEEDBACK.md` （反馈闭环） | 理解需求选技巧与模块，驱动全流程 |
| Frida 动态 Hook 层 | `monitors/`<br><br>14 个（纯观察）、 `bypass/` 9 个（主动干预）、 `core/utils.js` （公共工具） | 运行时插槽：监控、绕过、脱壳 |
| Python 二进制分析层 | `scripts/utils/`<br><br>16 个： `elfinfo.py` 、 `find_strref.py` 、 `find_branch_callers.py` 、 `fix_elf.py` 、 `fix_axml.py` 、 `scan_inline_svc.py` 、 `unpack.py` 等 | 离线 ELF/DEX 侦察、修复与重建 |
| MCP 集成层 | jadx-mcp、ghidra-mcp（经 `kilo.json` 配置） | AI 直接读 Java 源码 / 反汇编调试二进制 |
| 合规检测 | `tools/`<br><br>独立检测（注入/调试/签名/元数据）+ `checklist/` | 免 Frida 的前置检测与取证 |

### 3.2 目录结构（精简）

```sql
MobileRE-Skill/
|-- .kilo/
|   |-- agent/reverser.md           # Agent 角色定义（逆向分析研究员）
|   `-- skill/
|       |-- frida-mobile-security/  # 动态分析总控
|       |   |-- SKILL.md            # 总控：路由 + 决策树 + 模块目录
|       |   |-- references/         # 9 大技巧域手册
|       |   |-- scripts/              # core/monitors/bypass/utils/checklist
|       |   `-- tools/              # 独立检测工具（注入/调试/签名/元数据）
|       |-- rev-symbol/             # 无符号 .so 函数命名恢复
|       |-- rev-struct/             # 结构体恢复
|       |-- rev-unicorn-debug/      # Unicorn 模拟调试（uniharness.py）
|       |-- rev-dex-dumper/         # 内存 DEX 脱壳（panda + mem 双 dumper）
|       `-- karpathy-guidelines/    # 编码准则
|-- tools/hap_parser.py             # 鸿蒙 HAP 包解析
|-- requirements.txt                # Python 依赖
|-- AGENTS.md                       # 开发规范
`-- README.md / README.en.md
```

注： `kilo.json` （MCP 配置）与 `feedback/FEEDBACK.md` 按设计“本地保留，不入库”，克隆仓库后需自行创建。

## 4\. 技能类型分析

6 个技能可分为三类：总控型、专项能力型、规范辅助型。

| 技能  | 类型  | 职责  | 来源  |
| --- | --- | --- | --- |
| frida-mobile-security | 总控  | 任务路由 + 决策树 + 23 模块调度 + MCP 工具链 | 项目自研 |
| rev-dex-dumper | 专项  | 运行时内存 DEX 脱壳（ptrace-free 双工具交叉验证） | panda 为第三方二进制；mem-dex-dumper 为自研（附源码） |
| rev-symbol | 专项  | 无符号.so 函数命名恢复 | 改编自 P4nda0s/reverse-skills（MIT），上游面向 IDA，本项目迁移至 Ghidra MCP |
| rev-struct | 专项  | 结构体恢复（跨函数偏移访问聚合） | 同上  |
| rev-unicorn-debug | 专项  | Unicorn 离线模拟执行 native 函数 | 来源 P4nda0s/reverse-skills（MIT） |
| karpathy-guidelines | 规范  | 编码行为准则（4 条） | MIT |

### 4.1 总控型：frida-mobile-security

该技能是整个体系的入口。SKILL.md frontmatter 的 description 明确了触发场景（“绕过检测/闪退/脱壳/加密/抓包/行为摸底/内存扫描/分析 so/ELF 侠察/检查证书”等意图）。其内部组织有三层：

**（1）任务路由表**：意图关键词 → 技巧域 → 加载文件。例如“挂上 Frida 就闪退”路由到 `references/anti-detection.md` ；“脱壳”默认走 `scripts/utils/unpack.py` 一键流程。

| 技巧域手册 | 覆盖内容 |
| --- | --- |
| unpacking.md | 脱壳：一键流程、壳识别（一代/二代/三代）、产物验证 |
| anti-detection.md | 反检测：六阶段 Pipeline + 7 种实战绕过模式 |
| crypto-hook.md | 加密/功能 Hook：加解密自吐、内存扫描、SSL 忽略全层检测 |
| behavior-analysis.md | 行为分析：网络协议、跨组件污点追踪、多模块交叉分析 |
| static-analysis.md | 静态攻击面：导出组件枚举、序列化链路、WebView 审计（jadx-mcp） |
| native-analysis.md | SO 层分析：分层下钻、Dex2C 定位、JNI/RegisterNatives、Ghidra/unidbg |
| troubleshooting.md | 故障诊断：Hook 不生效、闪退、Constructor 窗口陷阱 |
| api-reference.md | Frida API 参考（写自定义 hook 时） |
| articles.md | 参考文章索引 |

**（2）模块库（ `scripts/` ）**：

-   `core/utils.js`
    
    ：公共工具（日志格式化/hexdump/backtrace 解析），硬性规则：必须作为第一个 `-l` 参数加载。
    
-   `monitors/`
    
    14 个（纯观察）： `crypto_monitor` （Java 加解密自吐）、 `native_crypto_monitor` （OpenSSL/BoringSSL）、 `native_hooker` （任意 native 函数）、 `ssl_plaintext` （OkHttp/Retrofit 明文）、 `memory_scanner` （内存敏感数据 + 密码输入监听）、 `file_monitor` 、 `network_monitor` À1 `thread_monitor` 、 `dl_monitor` 、 `proc_monitor` 、 `syscall_tracer` 、 `svc_tracer` 、 `intent_tracker` （跨组件污点）、 `jni_bridge_monitor` 。
    
-   `bypass/`
    
    9 个（主动干预）： `exit_blocker` （拦截 exit 系列保活）、 `thread_blocker` （阻断检测线程创建）、 `init_hook` （抢 `call_constructors` 时机）、 `frida_feature_hider` （隐藏 Frida 特征）、 `function_patcher` （已知偏移 NOP）、 `shellcode_detector` （定位 mmap+PROT_EXEC shellcode）、 `dlsym_tracer` 、 `so_loader_tracer` 、 `root_bypass` 。
    
-   `utils/`
    
    16 个： `unpack.py` （一键脱壳入口）、 `so_dump.js` 、 `dex_cache_dump.js` 、 `dex_finder.js` 、 `dex_defineclass_dump.js` 、 `codeitem_dump.js` 、 `dex_rebuilder.py` 、 `dex_dedupe.py` 、 `elfinfo.py` 、 `find_strref.py` 、 `find_branch_callers.py` 、 `fix_elf.py` 、 `fix_axml.py` 、 `patch_gadget_threadnames.py` 、 `scan_inline_svc.py` 、 `scan_register_natives.js` 。
    
-   其他： `checklist/` 2 个、 `templates/` 2 个； `tools/` 独立检测（无需 Frida）： `check-anti-inject.bat` 、 `debug-gdb.py` 、 `check-janus.bat` 、 `janus_check.py` 、 `GetAPKInfo.jar` 等。
    

设计特点：monitors 与 bypass 严格分离——前者只观察不改行为，后者只干预不监控，通过 `-l` 参数自由组合、互不依赖。

### 4.2 专项能力型（一）：rev-dex-dumper —— 内存 DEX 脱壳

特点是 **双工具交叉验证，且均不使用 ptrace**。

| 工具  | 读取路径 | 是否冻结目标 | 角色  |
| --- | --- | --- | --- |
| panda-dex-dumper | `/proc/<pid>/mem` | SIGSTOP/SIGCONT 冻结快照 | 主力  |
| mem-dex-dumper | `/proc/<pid>/mem`<br><br>或 `process_vm_readv(2)` | 不冻结 | 备选/交叉验证 |

技术意义：对于通过 `PTRACE_TRACEME` 占用 ptrace 槽位、监控 `TracerPid` 的反调试，ptrace 系 dumper 会被阻断，而这两个工具直接读进程内存，仍可工作。 `mem-dex-dumper` 为自研，随技能附源码（ `mem-dex-dumper.c` ）与 NDK 重编译命令；panda 为第三方二进制，只能规避不能修复。SKILL.md 同时给出完整工作流（推送 → 取 pid → dump → pull → 清理）与一张 Known issues 表（权限拒绝、vmreadv 被内核阻断、加固壳载荵未解密、dump 数少于 panda 的原因等）。

### 4.3 专项能力型（二）：rev-symbol —— 无符号函数恢复

解决的问题：so 被 strip 后只剩 `sub_X` / `FUN_X` 时如何恢复函数名。方法论步骤化：

-   内部特征分析：字符串常量、魔数（MD5 初值 `0x67452301` 、CRC32 `0xEDB88320` 、Base64 字符表、AES S-Box、zlib `0x789C` 等）、代码结构。
    
-   配对函数模式：malloc/free、lock/unlock、open/close、pthread_create/join 等成对出现的调用模式。
    
-   参数/返回值模式：如 `sub_XXX(2,1,0)` 对应 `socket(AF_INET, SOCK_STREAM, 0)` ；addrlen=16 对应 IPv4 connect/bind。
    
-   交叉引用分析：调用者/被调用者按导入表分类；仅有自动生成符号的调用者不计入，向上回溯最多 3 层。
    
-   兑底：Web 搜索魔数/代码模式。
    

数据源分离线与在线两条路： `elfinfo.py` / `find_strref.py` / `find_branch_callers.py` （离线、确定性）与 `ghidra_*` MCP 工具（伪代码、xref、重命名）。输出包含建议符号名、置信度（高/中/低）与推理过程。

### 4.4 专项能力型（三）：rev-struct —— 结构体恢复

通过跨函数聚合内存访问模式恢复结构体定义，六步：读目标函数（识别指针参数）→ 收集偏移访问（直接偏移/数组/嵌套结构）→ 遍历调用者（ `malloc(64)` 推结构体大小、调用前后操作）→ 遍历被调用者 → 聚合推断（偏移排序、大小 = 最大偏移 + 字段长、类型推断：函数指针/字符串指针/enum/计数器；识别 vtable、链表、引用计数）→ 在 Ghidra 中建结构体并重新反编译验证（字段名替换归偏移后暴露不一致的猜测，迭代至一致）。

### 4.5 专项能力型（四）：rev-unicorn-debug —— Unicorn 离线模拟执行

定位：不跑真机，在 PC 上用 Unicorn 加载 `.so` ，对 JNI/libc/syscall 打槽后直接执行目标函数。提供 `uniharness.py` harness 套件（ `map` / `map_elf` / `setup_stack` / `setup_tls` / `stub` / `hook` / `jni_env` / `call` 等助手），几行代码即可起一个模拟调用。细节亮点：

-   “先 raw 加载”原则：直接按原始字节映射，不解析 ELF 头，除非代码引用特定地址段。
    
-   JNIEnv slot 数学：函数表每项 8 字节、按 `jni.h` 声明序排列，slot 176 = `NewByteArray` 、184 = `GetByteArrayElements` 、208 = `SetByteArrayRegion` ；从反汇编推导（ `ldr x8, [x8, #1408]` → 1408 / 8 = 176）。
    
-   TLS/canary：映射 TLS 页并设 `TPIDR_EL0` ，栈保护检查即可通过。
    
-   迭代调试循环：跑 → 读回调 → 诊断（缺页/导入 stub/TLS fault/死循环）→ 修 → 重跑。
    
-   文档明确记录了一个易错点： `hook_add` 的 `end` 参数是闭区间，4 字节 stub 要用 `end = addr + size - 1` ，相邻 stub 差一就会互相串扰。
    

### 4.6 规范辅助型：karpathy-guidelines

改编自 Karpathy 的 4 条编码行为准则：先想后写（不假设、暴露不确定性）、简洁优先（最少代码、不写投机性代码）、精准修改（只动必须动的）、目标驱动执行（定义可验证的成功标准）。AGENTS.md 规定编写 Frida Agent 脚本时遵循该准则。这属于“元技能”——约束 Agent 的编码行为，减少 LLM 常见错误。

## 5\. 关键技术解析

### 5.1 一键脱壳：unpack.py 六步流水线

一条命令：python3 scripts/utils/unpack.py <包名> \[--out 输出目录\] \[--wait 120\]，内部线性自动执行：

-   **codeitem_dump whole**
    
    ：spawn 后 `loadClass` 全部类（默认回填函数体）→ dump 全部 DEX；
    
-   **dex_finder 补充**
    
    ：内存扫描 DexCache 未覆盖的 DEX（deepSearch 默认关，避免假 DEX 噪音）；
    
-   **自动 pull**
    
    ：产物从 app 私有目录 → /sdcard → 本地；
    
-   **默认 fix-checksum**
    
    ：壳修改内存后 checksum 必失效，不修复 jadx 会报 `Bad dex file checksum` ；
    
-   **去重**
    
    （ `dex_dedupe` ）：应对 frida-dexdump 对 OAT 缓存合并区重复 dump；
    
-   **方法体标记**
    
    ： `[OK]` 完整 / `[Dex2C]` native 占比高 / `[Skeleton]` 抽取未完成。
    

设计取舍：默认全量回填而非判断壳类型—— `loadClass` 对一代壳无害、对抽取壳必要。壳识别仍以 SO 文件名表兜底（ `libjiagu` =360、 `libshell*` / `libtup` =腾讯乐固、 `libDexHelper` =栖栖、 `libexec` / `libexecmain` =爱加密、 `libnaga` =娜达、 `libnesec` / `libsec2023` =网易易盾）。三代壳（VMP/Dex2C）脱壳无效，转 native-analysis 按需分析——文档明确“只标记不深挖”。

### 5.2 反检测：六阶段 Pipeline

Phase 1: exit_blocker + so_loader_tracer -> 定位检测 SO + 观察退出信号 |-- Branch A (thread detect): thread_blocker | -> function_patcher \`-- Branch B (init_array): init_hook (call_constructors) Phase 3: dlsym_tracer -> 运行时解密的符号 Phase 5: shellcode_detector -> mmap + PROT_EXEC shellcode Phase 6: function_patcher -> 对已知偏移精确 NOP

核心难点与对策（文档原样记载）：

-   普通 `android_dlopen_ext` hook 在 `call_constructors` 之后才触发，init_array 已执行完——必须用 `init_hook` 抢时机；
    
-   init_array 内联 `svc #0` 直接调 `exit_group` 可绕过 libc 层 hook—— `exit_blocker` 无 BLOCKED 日志时按分支 B 处理，用 `hasSvc0` 只 NOP 含 SVC 的函数；
    
-   加固壳场景不能全量 NOP init_array（壳的解密函数也在其中，误 patch 会 SIGILL）。
    

沉淀了 7 种实战绕过模式（死兆星线程检测、栖栖已知偏移、爱加密延迟阻断、init_array SVC、clone() 线程 + PROT_NONE 暗杀、Dialog 弹框绕过、TrustManagerImpl SSL 锁定），每种含来源文章、症状、原理、模块组合与注意事项。

### 5.3 分层下钻：六层模型

`Java/ObjC → JNI/Runtime → Native .so → libc → syscall → SVC #0` 。上层 hook 失效时逐层下钻，文档给出常见场景映射： `crypto_monitor` 无输出 → `native_hooker` ； `file_monitor` 无输出 → `syscall_tracer` ； `dl_monitor` 无输出 → 自定义 linker，转 `syscall_tracer` 的 mmap+PROT_EXEC 等。

### 5.4 Dex2C/VMP：四级分析优先级

① 动态 hook（默认、零成本，文档称 90% 场景到此为止）→ ② unidbg 模拟执行（复现算法）→ ③ Ghidra 伪代码（理解内部）→ ④ IDA（基本不用）。Dex2C 定位通过 `scan_register_natives.js` hook RegisterNatives 动态注册直接拿 `so+offset` 。

### 5.5 前置合规检测（无需 Frida）

`check-janus.bat` （元数据）→ `debug-gdb.py` （ptrace/TracerPid 反调试；注意：附加成功后目标被杀 = 检测到反调试，是正结论）→ `check-anti-inject.bat` （SO 注入检测）。Frida 挂载前还有 `fridainject.js` 作为 0 号判断：hook `Activity.onCreate` 弹窗，弹窗出现 = 注入成功无检测，不出现/被杀 = 存在检测转入 Pipeline。 `janus_check.py` 作为备选：不解析 Manifest，经 apksigner 验证 V1/V2/V3 签名方案，可免特爱加密类魔改 AXML。前置条件：root + SELinux Permissive。

## 6\. 安装与环境搭建

### 6.1 宿主机工具

| 工具  | 用途  |
| --- | --- |
| Python 3.9+ | 运行 Python 分析脚本 |
| Frida CLI | Frida 命令行工具（ `pip install frida-tools` ） |
| ADB | Android 调试桥（Android SDK Platform-Tools） |
| Android NDK | GDB 调试客户端 |
| Java Runtime | APK 信息提取（GetAPKInfo.jar） |
| JADX | Java 反编译 |
| Ghidra | 二进制分析 |

### 6.2 Python 依赖

pip install -r requirements.txt

| 包   | 用途  |
| --- | --- |
| `frida`<br><br>/ `frida-tools` | Frida 动态插槽 |
| `unicorn` | CPU 模拟执行（SO 离线分析 / 模拟调试） |
| `capstone` | 反汇编（模拟追踪/指令级调试） |
| `keystone-engine` | 汇编（模拟打槽） |
| `pyelftools` | ELF 解析（ `elfinfo.py` 等工具） |

### 6.3 MCP 配套（让 AI 直接读源码/反汇编）

通过 `kilo.json` 集成（本地保留、不入库，需自行配置）：

| MCP | 作用  | 项目地址 |
| --- | --- | --- |
| jadx-mcp | AI 直接读 Java 类源码（ `jadx_get_class_source` 等） | github.com/zinja-coder/jadx-ai-mcp |
| ghidra-mcp | AI 直接反汇编/调试二进制（ `ghidra_import_file` 等） | github.com/LaurieWired/GhidraMCP |

据 `reverser.md` ：jadx MCP 由 uv 托管、插件端口 8650；ghidra MCP 为 Python bridge，支持反编译 + 调试。

### 6.4 测试机准备

\# 1. 推送 frida-server（README 示例命名为 fuckserver） adb push frida-server-<版本>-android-arm64 /data/local/tmp/fuckserver adb shell "chmod 755 /data/local/tmp/fuckserver" adb shell "su -c '/data/local/tmp/fuckserver -D'" # 2. 推送 AndKittyInjector（注入检测用） adb push AndKittyInjector /data/local/tmp/AndKittyInjector adb shell "chmod 755 /data/local/tmp/AndKittyInjector" # 3. 推送 gdbserver64（调试检测用） adb push gdbserver64 /data/local/tmp/gdbserver64 adb shell "chmod 755 /data/local/tmp/gdbserver64"

`reverser.md` 另注明：frida-server 由用户自行管理，启动端口一般设为 8888，端口转发需用 `-H` 。设备以 arm64-v8a 为例，USB 直连用 `-U` ，多设备用 `-D <serial>` 。

### 6.5 安装步骤汇总

-   获取源码： `git clone https://github.com/index-login/MobileRE-Skill` （或下载 ZIP）；
    
-   安装依赖： `pip install -r requirements.txt` ；
    
-   配置 `kilo.json` （jadx-mcp / ghidra-mcp）并按需启动对应服务；
    
-   将项目置于 Kilo 工作区，Kilo 通过 `.kilo/` 目录识别 agent 与 skill；
    
-   测试机：root + SELinux Permissive，推送 frida-server 及各检测工具；
    
-   在 Kilo 中用一句话描述需求开始分析（Agent 会先加载 `frida-mobile-security` 技能）。
    

验证安装的快速自查： `frida --version` 、 `adb devices` 、 `python3 -c "import frida, unicorn, capstone, keystone, elftools"` 均无报错即表明基础环境就绪。

## 7\. 使用方式

### 7.1 方式一：自然语言驱动（主路径）

README 场景表全量：

| 场景  | 一句话需求 | Agent 会做什么 |
| --- | --- | --- |
| 加固脱壳 | “帮我脱壳这个 App” | 多种方式按场景选择：一键脱壳（默认回填/修复/去重/方法体标记）；或内存 DEX dump（panda/mem 双 dumper，反调试下更隐蔽） |
| 加密分析 | “看下这个 App 的加密算法和密钥” | Java + Native 双层加解密自吐，输出算法/密钥/IV/明文 |
| 反检测绕过 | “挂上 Frida 就闪退，帮我绕过” | 六阶段 Pipeline：定位检测 SO → 抢 init_array → 保活 → NOP 闪退函数 |
| 行为摸底 | “这个 App 偷偷干了什么” | 文件/网络/线程/进程/Intent 全程监控，输出行为画像 |
| Dex2C/VMP 分析 | “这个加密是 native 的，帮我分析逻辑” | 定位 `so+offset` ：hook 优先 / unidbg 复现 / Ghidra 伪代码 |
| 静态攻击面 | “帮我审计这个 App 的攻击面” | 从 Manifest 枚举 exported 组件/Provider/WebView，source→sink 追踪 |
| 安全合规测试 | “帮我检查这个 App 的安全合规” | 自动运行合规检测（注入/调试/WebView SSL/元数据），出具结果 |
| SO 符号/结构恢复 | “这个 so 去符号了，帮我还原函数名和结构体” | 离线 ELF 侠察 → Ghidra 交叉引用推理 → 重命名 + 结构定义 |
| 离线模拟执行 | “不跑真机，帮我模拟这个 native 函数” | Unicorn 加载.so，JNI/libc/syscall 打槽，直接跑目标函数拿结果 |

### 7.2 方式二：直接调用 Frida 模块（脱离 Agent）

SKILL.md 快速命令卡片：

\# 加解密自吐 frida -U -f com.app -l scripts/core/utils.js \\ -l scripts/monitors/crypto_monitor.js # 行为摸底（文件 + 网络 + 线程） frida -U -f com.app -l scripts/core/utils.js \\ -l scripts/monitors/file_monitor.js \\ -l scripts/monitors/network_monitor.js \\ -l scripts/monitors/thread_monitor.js # 反检测 Phase 1（保活 + 定位检测 so） frida -U -f com.app -l scripts/core/utils.js \\ -l scripts/bypass/exit_blocker.js \\ -l scripts/bypass/so_loader_tracer.js # HTTP 明文拦截 frida -U -f com.app -l scripts/core/utils.js \\ -l scripts/monitors/ssl_plaintext.js # 内存敏感数据扫描 frida -U -f com.app -l scripts/core/utils.js \\ -l scripts/monitors/memory_scanner.js

注意： `utils.js` 必须第一个加载； `-U` 为 USB 直连，多设备用 `-D <serial>` ，端口转发用 `-H` 。

### 7.3 方式三：Python 工作流模板

复制 `scripts/templates/analysis.py` → 改 `TARGET_PACKAGE` / `LOAD_MODULES` / `CONFIG_OVERRIDE` → 在 `CUSTOM_HOOK_SCRIPT` 写 app 专属逻辑 → 运行。模板自动处理加载顺序（utils.js 首加载 → monitors → bypass → 自定义脚本）；交互模式设 `TIMEOUT=0` + `LOG_TO_FILE=True` （需要用户在 app 上点击按钮触发行为时）。

### 7.4 运行时配置：CONFIG_OVERRIDE

所有模块接受统一配置注入机制：

var CONFIG_OVERRIDE = { file_monitor: { filterPath: \["/data/data/com.target/"\] }, network_monitor: { showPayload: true }, crypto_monitor: { showStack: true }, native_hooker: { targetLibs: \["libencrypt.so"\] }, init_hook: { onModuleInit: \[{ moduleName: "libDetect.so" }\], probeCallers: true, autoHideFrida: true }, thread_blocker: { blockCallers: \["libmsaoaidsec.so"\] }, };

模块导出标准接口（AGENTS.md）：模块定义 `CONFIG` 并允许 `CONFIG_OVERRIDE` 合并，不硬编码路径与参数。

### 7.5 输出产物

每个 App 一个 <包名>/ 目录： `REPORT.md` （漏洞链 + PoC + OWASP MASVS 映射）、 `monitor_*.js` / `bypass_*.js` 、 `poc_verify.py` 、提取的 `.so` 。 `reverser.md` 规定分析完成后必须执行清理：删迭代脚本与临时日志，保分析报告与 PoC。

## 8\. 设计原则与工程规范

-   单一职责：一个模块做一件事，不把监控和绕过混在一起；
    
-   可组合：模块通过 `-l` 参数组合，不互相依赖；
    
-   可观测：所有 hook 点必须有日志输出，不静默吞掉；
    
-   可复现：脚本能在其他设备上跑，不依赖特定路径硬编码；
    
-   最小权限：只 hook 需要的目标，不做全量扫描，除非明确要求。
    

Frida API 约定（AGENTS.md）： `Java.use()` 前查 `Java.available` ； `Module.findExportByName` 前查 `findBaseAddress` ；大量数据用 `send()` 而非 `console.log()` （后者走 stdout，大数据会丢）； `Interceptor.attach` 优于 `replace` （签名不匹配会崩）； `NativeCallback` 必须持有引用（否则 GC 回收后崩溃）；Stalker 只在必要时候用。以及一条非技术但重要的规定：需要用户在 app 上手动操作时，检测类脚本由用户自行执行（方便截图取证），Agent 不代跑。

* * *

以下为分析观点，基于上文所列项目文档得出，不代表项目官方立场。

## 9\. 分析观点：优势与使用边界

### 9.1 优势

-   经验资产化。反检测七模式、SSL 忽略全层检测表、壳识别表等原本散落在个人实战经验中的知识，被固化为决策树与速查表，Agent 每次执行都可复现——这是“工具箱”到“技能系统”的实质差别。
    
-   静态/动态/MCP 三路闭环。“静态找可能，动态验证实”配合 jadx-mcp/ghidra-mcp，把工具切换的时间成本降到一句对话。
    
-   差异化技术点明确：ptrace-free 双 dumper 交叉验证、 `call_constructors` 抢时机反检测、Unicorn 单函数离线模拟，都是针对真实对抗场景（反调试、加固）的解法，而非 demo 级脚本。
    
-   工程质量意识强。AGENTS.md 的模块接口标准、 `CONFIG_OVERRIDE` 、Feedback 闭环、“信息只存一份”等约束，在同类开源项目中少见。
    

### 9.2 使用边界

-   生态绑定较深：核心面向 Kilo Agent 的 `.kilo/` 结构与 skill 工具；迁移到其他 Agent 框架需要改造 Agent 定义与加载方式。
    
-   平台侧重 Android：README 场景与模块均面向 Android（iOS 仅在六层模型中出现 ObjC）；鸿蒙仅有 HAP 元数据解析工具，不构成完整鸿蒙逆向能力。
    
-   二进制工具受架构限制： `rev-dex-dumper` 的两个可执行文件仅 arm64/API 29，换 ABI 需按文档用 NDK 自行重编； `GetAPKInfo.jar` 依赖 Java Runtime。
    
-   环境门槛：root + SELinux Permissive 测试机是多项检测与脱壳流程的前置，模拟器或量产固件场景受限。
    
-   迭代期项目：版本号 0.6.0，API 与模块布局可能随版本变化； `kilo.json` 、 `FEEDBACK.md` 等关键文件不入库，复现环境需自行齐全。
    

## 10\. 合规与法律声明

靠谱AI中转站：https://all-in-ai.site
