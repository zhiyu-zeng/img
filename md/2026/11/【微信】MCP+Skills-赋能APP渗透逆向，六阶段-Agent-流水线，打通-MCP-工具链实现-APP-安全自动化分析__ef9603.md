---
title: 【微信】MCP+Skills 赋能APP渗透逆向，六阶段 Agent 流水线，打通 MCP 工具链实现 APP 安全自动化分析
source: https://mp.weixin.qq.com/s/pfmWIgv03CtxdjQdyaaPRA
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T09:31:17+08:00
trace_id: 110eeba9-276f-4581-a03d-1aee6836e284
content_hash: db10de53ddabe9ea2ddf1bd7d3dbacc2617591a8fcb4ffb85122c332273899f8
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 33
  succeeded: 33
  failed_urls: []
notion_page_id: 41375244-d011-8173-8781-c674355806b8
ioc: null
---

**渗透安全HackTwo** *2026年11月9日 07:48*

**0x01 简介**

MCP+Skills 驱动的 APP 渗透逆向流水线，采用六阶段 Agent 架构，依靠总控规则调度任务，串联 Jadx、Burp、Ghidra 等 MCP 工具，完成静态侦察、流量代码对齐、SO/JNI 深度溯源、漏洞研判、POC 验证、报告输出全流程。配套本地索引脚本自动提取接口、密钥与 JNI 线索，支持步进、自动串联两种运行模式。结合实战样本还原签名逻辑，挖掘客户端高危漏洞，项目开源，将零散逆向经验固化为可复用、可自动继承的工程化安全分析流程。

> 本文内容仅用于网络安全技术学习与交流，所有操作均在授权测试环境下完成。严禁将文中技术用于未授权检测与非法攻击，违者责任自负。

现在只对常读和星标的公众号才展示大图推送，建议大家把 **渗透安全HackTwo **“设为星标”，否则可能就看不到了啦！****

参考文章：

```javascript
https://xz.aliyun.com/news/92020
https://www.hacktwohub.com/(HackTwoHub网安社区)
```

****末尾可领取挖洞资料/加圈子 #渗透安全HackTwo****

****0x02 正文详情****

> 面向移动安全分析场景的 6 阶段总控 Skill。用于统一调度 APK 静态侦察、流量与代码对齐、SO/JNI 深度分析、加密与漏洞综合分析、验证设计与报告交付流程。

### 1.1 痛点分析

随着移动端安全防护能力不断增强，传统 APK 逆向分析的难度也越来越高。无论是 Java / smali 层的代码梳理，还是抓包后的协议还原、native 层 so 深挖、加密参数分析、漏洞验证与报告交付，整个过程都高度依赖人工经验，并且工具分散、切换频繁、重复劳动严重。

尤其是在实际 APP 安全测试中，常常会遇到以下问题：

-   反编译代码量大，入口难找
-   抓包能看到请求，但看不清参数含义
-   `sign` 、 `data` 、 `encryptData` 等字段和代码难以联动
-   加密逻辑下沉到 JNI / so 后，Java 层分析断链
-   前面阶段找到了很多线索，后面却难以形成统一风险结论
-   最终输出报告时，又要重新整理证据、漏洞、接口、验证步骤

基于这些问题，我尝试通过skills构建 **一套六阶段、高度自动化的 APP 安全分析工作流**，把零散、重复、高度依赖经验的分析过程，变为可复用、可沉淀、可交接的自动化分析流程。。

### 1.2 架构设计

当前我设计的架构主要由以下几个核心模块构成：

-   **根总控 SKILL.md**：作为整个流程的调度中心，负责意图拦截、标准输入模板返回、任务路由分发以及阶段执行规则的约束 。
-   **6 个阶段 Agent**：针对移动安全分析全生命周期定制的规则集，涵盖了从第一阶段的 APK 静态侦察到第六阶段的安全报告汇总 。
-   **MCP 分阶段接入规范**：明确了 Jadx-MCP（静态分析）、Burp/Yakit-MCP（分析）以及 Ghidra/IDA-MCP（Native 深挖）在不同阶段的接入与调用标准 。
-   **本地索引脚本 (Python 探针)**：负责高覆盖率盲扫的工具集，包括接口提取 (`endpoint_extractor.py`)、硬编码扫描 (`secret_scanner.py`)、JNI 桥接索引以及目标 SO 自动收敛与加载工具 。
-   **统一的结构化输出设计**：通过规范化的 JSON 和 Markdown 产物，确保前序阶段的分析线索能够被后续 Agent 自动继承与深度联动 。

```perl
ai-mobile-reverse-skills/
├── SKILL.md                                  # 总控入口：阶段路由、输入模板、执行规则
├── README.md                                 # 使用手册：流程说明、完整示例、交互方式
├── agents/                                   # 六阶段 Agent 规则集
│   ├── agent-01-sample-recon.md              # 第一阶段：APK 静态侦察
│   ├── agent-02-protocol-mapper.md           # 第二阶段：流量与代码对齐
│   ├── agent-03-crypto-native-analyzer.md    # 第三阶段：SO / JNI 深度分析
│   ├── agent-04-crypto-vuln-analyzer.md      # 第四阶段：弱加密与高风险漏洞筛查
│   ├── agent-05-validation-designer.md       # 第五阶段：最小验证 POC 设计
│   └── agent-06-reporter.md                  # 第六阶段：安全报告汇总
├── docs/                                     # 阶段接入与补充文档
│   └── MCP-INTEGRATION.md                    # MCP 分阶段接入规范
├── templates/                                # 报告与复现模板
│   ├── mobile-reverse-report-template.md     # 移动安全报告模板
│   └── repro-steps-template.md               # 复现步骤模板
├── tools/                                    # 配套工具与模板资源
│   ├── frida/                                # Frida 相关模板
│   │   ├── README.md                         # Frida 模板说明
│   │   └── android_phase1_bypass.js          # Phase 1 运行时准备 / 观察模板
│   ├── poc_templates/                        # POC / 验证模板
│   │   ├── README.md                         # POC 模板说明
│   │   ├── CASE_README.md.tmpl               # 单漏洞验证说明模板
│   │   ├── frida_runtime_observe.js.tmpl     # Frida 运行时观察模板
│   │   └── python_http_validation.py.tmpl    # HTTP 验证脚本模板
│   └── scripts/                              # 本地索引脚本
│       ├── README.md                         # 脚本说明与 sample schema
│       ├── endpoint_extractor.py             # 接口 / URL / 字段线索提取
│       ├── env_guard_indexer.py              # Root / 代理 / Frida / SSL Pinning 线索提取
│       ├── native_bridge_indexer.py          # JNI / JSBridge / native crypto 线索提取
│       ├── secret_scanner.py                 # 硬编码密钥 / Token / 证书 / 云凭证扫描
│       ├── resolve_native_target.py          # 自动收敛第三阶段优先分析的 SO 目标
│       └── ghidra_target_loader.py           # 自动导入目标 SO 到 Ghidra 项目
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70c0cd47dcf24cdd.png)

体系架构设计图

## 2\. 体系设计思想

### 2.1 MCP：建立 AI 与本地工具之间的可控调用通道

**MCP（Model Context Protocol，模型上下文协议）** 是一套用于打通大模型与本地工具环境的通信协议，让 AI 能够安全、可控地调用 Jadx、Burp、Ghidra、IDA 等逆向工具，获取真实代码、流量、伪代码上下文，显著降低因上下文缺失导致的分析偏差与幻觉风险，实现 “工具能力→模型可用”。

在移动安全分析中，我当前体系主要依赖三类 MCP：

-   **Jadx 类 MCP (Phase 1 专属)**：聚焦 Java/Smali 层静态分析。赋予 AI 检索反编译代码、定位类/方法/关键字、提取 URL 协议，以及发现 `sign/token/native/WebView` 等关键入口的能力。
-   **Burp / Yakit 类 MCP (Phase 2 专属)**：聚焦流量与协议分析。允许 AI 读取抓包历史，提取 Header 与响应结构，对业务接口进行聚类，并实现代码与流量的联动映射。
-   **IDA / Ghidra 类 MCP (Phase 3 专属)**：聚焦 Native 层深挖。协助 AI 定位 JNI 入口，理解 SO 层伪代码，梳理交叉调用链，甚至静态推断加密算法候选及 Key/IV/Salt 的流向。

### 2.2 通用智能体：负责“理解、联动、归纳、输出”

MCP 解决的是“工具能力如何提供给 AI”，但真正做综合判断、阶段推进、结果沉淀的，还是大模型智能体本身。

在这套体系里，Codex / Cursor / Claude Code 这类智能体承担的核心工作包括：

-   理解 Java / smali / so 伪代码
-   把抓包字段映射回代码逻辑
-   归并多来源证据
-   判断加密与签名链路
-   输出结构化 JSON / Markdown
-   设计验证方案
-   生成标准化报告

**MCP 负责“连接工具”，Skills负责“规范流程”，AI 负责“完成分析”。**

### 2.3 AI Skills：让分析从“经验驱动”变成“规程驱动”

AI Skills 并非简单的大模型提示词，而是 **把移动 APP 安全测试的完整经验，拆解为阶段化、可路由、可继承的规则体系**。

这套Skills的重点不是写几个大 Prompt，而是把整个 APP 安全分析过程拆成多个 **阶段化 Agent**。

目前，主干工作流中已成功落地并固化了 6 个核心 Agent规范：

-   🔍agent-01-sample-recon（资产侦察与画像标定）
-   🌐agent-02-protocol-mapper（流量协议与代码级对齐）
-   ⚙️agent-03-crypto-native-analyzer（Native 层加解密深度溯源）
-   🛡️agent-04-crypto-vuln-analyzer（弱加密与核心漏洞综合研判）
-   🧪agent-05-validation-designer（无害化 POC 与验证逻辑）
-   📝agent-06-reporter（标准化安全报告自动化组装）

除 6 个阶段 Agent 外，根总控 SKILL.md 还承担阶段识别、输入模板返回、路径继承、统一输出根目录约束以及后续阶段自动衔接等职责，使这套 Skills 不只是规则集合，而是一套具备流程调度能力的工作流入口。

3\. 体系结构与实现思路

### 3.1 总控入口：SKILL.md

根 `SKILL.md` 是整个流程的唯一总控入口，它主要负责：

1.  识别用户当前要执行的阶段
2.  检查当前已有的材料和 MCP 是否满足要求
3.  返回标准输入模板
4.  将任务路由到对应阶段 Agent
5.  约束前后阶段的输入输出关系

例如，用户说一句：

```javascript
我需要分析xxxx的xxx逻辑
```

总控不会直接开跑，而是先返回输入模板，例如：

```makefile
step: 2
target_dir: /path/to/decompiled
output_dir: /path/to/output
mcp: burp/yakit/none
traffic_source: /path/to/traffic.json
```

用户补齐之后，再由总控路由到如 `agent-02-protocol-mapper` 执行。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8798d20b23f6aa98.png)

根 SKILL.md 负责识别用户当前要执行的阶段、返回标准输入模板和路由到对应 Agent，还负责维护当前任务的会话级上下文。用户通常只需在第一步明确一次 target_dir 与 output_dir，后续阶段默认继承相关路径与中间产物，不再要求重复输入。与此同时，output_dir 会被视为统一输出根目录，并默认按 step1 到 step6 组织各阶段产物，从而支持多阶段自动衔接。

### 3.2 流程运行机制：阶段控制与自动串联

与传统依赖“人工逐步切换工具、手动复制上下文”的分析不同， `ai-mobile-reverse-skills` 的价值在于：它通过的 **总控规则** 与 **阶段衔接协议**，将 6 个阶段化 Skills 编排成了一条编排成了一条 **可暂停、可继承、可自动推进** 的流水线工程。

在运行机制上，Skills支持“双轨执行模式”，以灵活适配不同复杂度的分析场景：

#### 3.3.1 逐阶段步进模式

-   **适用场景**：面对复杂加固业务，或分析结果极度不确定，需要人工精细化引导的情境。
-   **运行机制**：测试人员按阶段下发指令（如“仅执行静态侦察”）。在进入下一阶段前，流程会挂起，等待人工复核当前阶段的 JSON 产物。
-   **核心优势**：

-   每一步的中间推断都支持人工介入修正，防止 AI 产生逻辑幻觉。
-   便于在任意阶段停下来，调整分析焦点（如发现某个特定的加解密类后，手动修改入口点再继续）。

#### 3.3.2 自动串联模式

-   **适用场景**：前序基建材料，mcp服务器已就位，目标明确，希望最大化缩减人工流转成本的标准评估场景。涉及到自动化拉取so文件的步骤都需要有apk解包代码才能运行。
-   **运行机制**：skills通过校验前序产物（如检测到 `raw_endpoint.json` 已生成/burp-mcp已经运行），在条件满足时自动唤醒下一个 Agent。
-   **分布链路**：

-   **链路 A（分析闭环）：** 完成阶段 1 的 APK 静态侦察后（存在apk解包，apk反编译源码），配合手动绕过检测并成功抓包，skills将从阶段 2（流量对齐）自动接管；连续推演至阶段 6 输出最终报告。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c66aa98a29ba4b69.png)

-   **链路 B（验证闭环）：** 适用于前 3 个阶段深度分析已解决的场景。从阶段 4（人工确认漏洞）切入，skills会自动唤醒阶段 5（生成 POC）与阶段 6（排版报告），实现后续的工作流程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea560c4ec43658db.png)

-   **链路C（直通车）：** 已知app没有检测机制，且提前完成抓包，接入mcp，且获得apk解包，apk反编译源码，可以直接实现阶段 1 到阶段 6整个流程的自动化。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8dc8da598d84f937.png)

#### 3.3.3 关键架构特性：全局上下文与跨层推进

-   **会话级路径继承 (Session Context Inheritance)**：

不需要“多轮重复输入”。用户仅需在最初明确一次 `target_dir` 、 `traffic_source` 等核心环境变量，SKILL 总控会将其作为 **全局上下文** 自动注入给后续所有阶段。除非用户主动下达变更指令，否则系统会自动继承，实现“统一上下文驱动”。

-   **Native 分析链的自动推进**：

不需要人工翻找、提取 SO 文件的繁琐步骤。完成目标 APK 解包后，可获得 smali、SO 等文件，在阶段 2 顺藤摸瓜定位到 JNI 调用后， **工作流** 会自动收敛出对应的目标 SO 文件。随后，阶段 3 会利用本地脚本将该 SO 自动导入 Ghidra 项目，并唤醒 `ghidra-mcp` 接管分析。可以实现这部分的零干预。

#### 3.3.4 阶段总结：从“能分析”到“能推进”

这套运行机制的本质，是实现了移动安全测试从“多工具 + 多 Prompt 拼接”向“工程化工作流 (Agentic Workflow)”的跃迁。实现 **可分可合、可控可放、状态持久化。**

### 3.3 阶段 Agent：6 个阶段各司其职

当前 分为6 个阶段：

1.  APK 静态侦察
2.  流量与代码对齐
3.  SO / JNI 深度分析
4.  弱加密与高风险漏洞筛查
5.  最小验证 POC 设计
6.  安全报告汇总

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f302afca70b24629.png)

### 3.4 MCP 接入规范：每一步用什么 MCP

项目里存在 `MCP-INTEGRATION.md` ，按阶段规定：

-   Phase 1： `jadx-mcp` 或本地目录
-   Phase 2： `Burp MCP`  / `Yakit MCP`
-   Phase 3： `ida-mcp` / `ghidra-mcp`
-   Phase 4-6：以前序结果为主，必要时回看前序 MCP

这种设计的好处是：  
MCP 变成了“阶段工具”，而不是“泛用能力”。  
这样每一步该用什么、输出什么，会更清晰。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b07a5422b7e7e927.png)

### 3.5 本地脚本层：负责高覆盖率索引

除了 MCP 和 Agent，Skills里还有 6 个 Python 脚本：

1\. `endpoint_extractor.py` (网络与接口暴露面提取器)

-   **探测目标**：全面梳理 APP 的网络通信基建与系统级暴露面。

2\. `secret_scanner.py` (敏感凭据与硬编码资产扫描器)

-   **探测目标**：深挖硬编码在代码中的各类敏感信息与密码学材料。

3\. `native_bridge_indexer.py` (跨界桥接与底层算法索引器)

-   **探测目标**：打通 Java 层与底层（Native/Web）的交互链路，追踪加密逻辑的“下沉”线索。

4\. `env_guard_indexer.py` (环境对抗与安全防护检测器)

-   **探测目标**：摸排目标应用的安全防护水位，为后续抓包与动态调试提供排雷

5\. `resolve_native_target.py` (Native 目标推演与自动收敛器)

-   **核心作用：** 打破跨层分析时的“人工翻找与肉眼甄别”壁垒，在流量与代码对齐后，自动锁定后续需要优先逆向的底层 SO 目标。

6\. `ghidra_target_loader.py` (Ghidra 逆向工程自动加载与唤醒器)

-   **核心作用：** 实现跨工具链的“静默接管”，将底层逆向工作从“人工手动导入文件”平滑升级为“流水线自动喂入目标”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad55ac22f4c2e63d.png)

## 4\. 实战测试

### 4.1 测试背景

在对目标 APP 的业务接口进行黑盒测试过程中发现，核心请求均引入 `sign` 参数进行完整性校验。在未掌握签名生成规则的情况下，请求重放及参数篡改均被服务端拒绝，表现为典型的 **客户端签名防篡改机制**。

该机制直接阻断了常规业务安全测试路径，使得接口重放、参数污染及逻辑验证等测试手段无法继续推进，必须通过逆向分析还原签名生成链路，才能恢复测试能力。

进一步分析发现，该类签名通常具备以下特征：

-   参数参与计算（如 path / timestamp / token）
-   可能存在客户端加密或 Native 下沉逻辑
-   与运行环境或设备信息存在耦合

上述特征决定了分析过程需要同时打通 **静态代码、运行流量及 Native 层逻辑**，单一工具或单阶段分析难以形成有效闭环，所以使用了 MCP + AI Skills 的阶段化分析流程，对签名生成机制进行系统性还原，并在此基础上开展进一步的漏洞挖掘与验证。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1805a118527e5d91.png)

### 4.2 前置准备

配置好Codex或者Deepseek、GML等大模型（AI 总控）、jadx‑mcp（静态反编译）、burp‑mcp（流量分析）、ghidra‑mcp（SO 层逆向），具体操作这里不再展开，可自行搜索。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca30d612fbb476eb.png)

### 4.3 第一阶段-资产侦察

1.  通过相关技术手段获取 APK 的反编译结果与解包结果，并将相应材料路径输入分析流程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8c503921ba2880c7.png)

2.  分析结果显示，目标app不存在 Root、Frida/Xposed 或代理检测机制，也未对核心 OKHttp 链路实施 SSL Pinning 防护，因此可直接抓包。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/89680d1e6759974a.png)

3.  且第一阶段已定位疑似 sign 计算入口与 AES 相关 JNI / SO 候选接口，并初步锁定业务 sign 生成线索（md5Result）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/81e0c03bc11c41ca.png)

### 4.4 第二阶段-流量对齐

1.  启用 burp‑mcp 抓取业务数据包。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6290e7b4fc000dca.png)

2.  发送提示词让AI基于 burp-mcp 与反编译上下文，完成接口流量与 Java 层代码的对齐分析，溯源 sign 参数构造逻辑。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/093696dcdd41e445.png)

3.  该阶段最终梳理出核心业务接口，明确了接口鉴权方式与请求参数构成。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e4eadce57fe37916.png)

定位到了 sign 字段生成链路： `path+timestamp+token` 经 MD5 计算生成，关联具体 Java 代码调用位置。

### 4.5 第三阶段-底层溯源

1.  通过 ghidra‑mcp 对 APP `Secure.so` 文件做 Native 层逆向，追踪 JNI 调用与加密算法链路

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e4e9b80a54d04ca.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d641e629aaa79a13.png)

2.  so文件 使用了更具隐蔽性的 **动态注册** 机制。

-   **分析路径**：首先定位到 `JNI_OnLoad` 符号，这是 SO 加载时的初始化入口 。通过 `ghidra-mcp` 追踪其中的 `RegisterNatives` 调用，还原了 Java 层方法与 Native 层 C/C++ 符号的映射表 。
-   **精确标定结果**：

-   secure：映射至 Native 符号 `Secure.so!secure` ，偏移地址为 0x00106798。
-   secureData：映射至 Native 内部函数 `func_0x001018a0` （符号名为 `secureData` ），偏移地址为 0x00106a00。
-   decode：对应的 Native 实现符号为 `innoDecode` ，偏移地址为 0x0010da94。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/da4a0b8798fae97c.png)

3.  通过分析上述地址处的伪代码，勾勒出了 Native 层的算法画像：

-   **自定义块变换 (Custom Transform)**：从伪代码特征看，secureData 内部包含类似 S-box、CRC-like 校验及自定义块处理逻辑，更接近非标准的数据封装流程。
-   **隐藏的 MD5 助手**：在 `Secure.so!getMd5` 处， `ghidra-mcp` 识别出了标准的 **MD5 初始化常量 (0x67452301, 0xefcdab89等)** 和四轮运算逻辑。这说明 Native 层具备 MD5 相关实现能力，但在当前样本中未观测到其直接参与主业务 sign 计算。
-   **强环境绑定**：分析发现 Native 算法输入不仅包含业务明文，还强制读取了运行时 **UUID**、 **包签名 (package signature)** 以及 `/res/raw` 下的资源字节 。
-   **流量特征对齐**：在第二阶段（流量对齐）抓取的真实业务 HTTP 请求中， `sign` 字段呈现为标准的 **32 位十六进制 MD5 字符串**。
-   **算法结果冲突**：Native 层 `secureData` 的输出是 **原始字节流 (Raw Bytes)**。如果业务签名由 Native 生成，其必然存在一个“字节流 -> Hex字符串”的转换过程，但在对 Java 层拦截器代码的审计中，直接发现了完整的 `MD5(path + timestamp + token)` 拼装逻辑。
-   **结论判定**：通过对 Java 拦截器 `HTTPInterceptor` 与 `Md5Utils.getMd5Result` 的交叉验证，确认了主业务包的签名计算完全闭环在 Java 层。
-   **定位 SO 职能**： `libxxxSecure.so` 的存在并非为了计算主业务 `sign` ，而是作为一个 **安全/风控 SDK**，用于处理如 `encryptData` 等特定的风控字段，或在后台静默进行环境审计。示例如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea90da4f80d86735.png)

### 4.6 第四阶段-漏洞定性

1.  整合前 3 阶段数据，对加密体系、业务逻辑、客户端配置做全链路审计

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/17c8f69d9f6865e2.png)

2.  确认存在 **签名机制失效**：主业务 / 社区签名采用 MD5 算法，可在客户端直接重签，无有效防重放 / 会话绑定。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/436d7ab0bf0d5ef8.png)

3.  sign算法识别出来的同时也找到了其他安全问题

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59516f9febc23997.png)

### 4.7 第五阶段-验证设计

1.  遵循 **无害化验证** 原则，针对高危漏洞生成最小可复现 POC 脚本

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9139d633eafdd746.png)

2.  poc_scripts_index 中已生成用于 sign 还原与加解密验证的 Python 脚本。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6613161ae6d948c6.png)

### 4.8 第六阶段-报告输出

最后自动整合所有分析数据、漏洞证据、验证结果，生成完整安全报告

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c83117439ac859c.png)

### 4.9 结果分析

从本次实战结果来看，这套六阶段 Skills 流程的核心价值，不仅在于完成分析链路打通，更在于验证其在实际场景中 **具备发现高危安全风险的能力**。

首先，在分析层面，流程成功还原了目标 APP 的 `sign` 生成机制，使原本因签名校验而受阻的业务接口测试得以继续推进。这一点表明，该体系具备在存在客户端防护机制时，恢复测试路径的能力。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65b02f43a7033ab2.png)

更关键的是，在完成签名链路还原后，流程并未停留于机制分析，而是进一步对客户端进行全链路审计，并实际发现了多项高风险安全问题。例如：

-   核心云存储密钥被明文硬编码在 APP 客户端，攻击者通过简单反编译即可轻松提取，能完全控制 APP 关联的 UCloud 云存储桶，可任意读取、下载、删除、篡改所有存储数据 ；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61ac0c1e114dba9d.png)

-   支付宝核心 RSA 私钥被明文硬编码在客户端，攻击者提取私钥后，可离线生成任意金额、任意用途的合法支付订单，引发严重的资金安全危机与法律风险；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e39ad366fe3ca32.png)

-   APP 内 WebView 违规开启参数及文件域跨域权限，未做任何访问限制与校验，恶意网页可轻松绕过同源策略，读取手机本地 **文件**，包括应用私有目录、核心配置、用户数据库等，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82682d8a427db0bc.png)

这些问题均属于典型的高危风险，且可以在客户端侧直接利用，说明该流程不仅能够还原关键机制，还具备 **持续向深层风险挖掘的能力**。

## 5、当前不足与后续优化方向

围绕 AI Skills 在移动安全分析场景中的工程化落地，本质上是将原本依赖人工经验的分析流程，固化为可 **执行、可继承、可复用** 的规则体系，从当前实现看，该体系已较好解决了阶段组织、流程衔接与结果沉淀问题，但仍存在以下不足：

1.  **阶段化能力较强，动态适配能力仍有限**  
    当前 Skills 主要以预定义阶段规则驱动，适合标准化分析流程，但对异常分支、临时专项任务和复杂链路的灵活编排能力仍需增强。
2.  **实现了产物继承，但经验继承仍不充分**  
    现阶段已能复用前序阶段的分析结果与结构化产物，但对于失败路径、有效策略、高置信判断等经验信息，尚未形成更完善的沉淀与复用机制。
3.  **具备流程调度能力，但模块化程度仍可提升**  
    当前 Skills 已不再是简单 Prompt，而是具备输入输出约束与流程调度能力的规则体系；但协议分析、加密识别、JNI 溯源等能力仍更多依附于具体阶段，后续仍需进一步向细粒度、可组合的模块化 Skills 演进。
4.  **MCP 已解决工具接入问题，但协同效率仍可优化**  
    当前已实现 Jadx、Burp、Ghidra 等工具接入，但在调用粒度、上下文开销与跨工具线索传递效率方面，仍有进一步优化空间。
5.  **复杂对抗场景下仍存在边界**  
    对于重加固、强混淆、强环境绑定样本，以及高度依赖业务理解的逻辑型漏洞场景，当前体系仍需要较多人工参与。

后续打算优化的重点是继续增强 Skills 的 **模块化能力、经验沉淀能力、工具协同效率与复杂场景适配能力**，推动体系从“阶段化流程”进一步发展为“可持续积累的分析能力体系”。目前是先把移动安全分析过程中 **最容易断链、最依赖经验、最难复用** 的部分，转化为一套真正可落地的 Skills 体系，为后续更高层次的智能化能力打下基础。

相关SKILL下载

```javascript
链接：https://pan.quark.cn/s/8aa41aa8081e
```

## 0x03 总结本文的实现与思路，是对前辈经验和行业方法的一次学习与实践，若其中存在疏漏或不足之处，欢迎批评指正。目前也在继续尝试将这一体系进一步推向真正可落地的自动化方向，供更多安全研究与测试实践参考！🔥喜欢这类文章或挖掘SRC技巧文章师傅可以点赞转发支持一下谢谢！内部星球VIP介绍V1.5（更多未公开挖洞技术欢迎加入星球）如果你想学习更多另类渗透SRC/AI挖洞技术/攻防/免杀/应急溯源/赏金赚取/工作内推，欢迎加入我们内部星球可获得内部工具字典和享受内部资源/内部群🔥🚀1.每周更新1day/0day漏洞刷分上分，目前已更新至23794+;🧰2.包含网上的各种付费工具/各种Burp漏洞检测插件/fuzz字典/SRC挖洞SKILL等等;3.Fofa/Hunter/Ctfshow/360Quake/Shadon/零零信安/Zoomeye各种账号VIP会员共享等等;🎥5.最新SRC挖洞文库/红队/代审/免杀/逆向视频资源等等;🧪6.内部自动化漏扫赚赏金捡洞工具，免杀CS/Webshell工具等等;💡7.漏洞报告文库、利用AI挖洞技巧、共享SRC漏洞报告学习挖洞技巧；🎯6.最新0Day1Day漏洞POC/EXP分享地址（同步更新）;https://t.zsxq.com/jVcxV(全网最新最完整的漏洞库)🔥7.详情直接点击下方链接进入了解，后台回复" 星球 "获取优惠先到先得！后续资源会更丰富在加入还是低价！（即将涨价）以上仅介绍部分内容还没完！点击下方地址全面了解👇🏻👉点击了解加入-->>2026内部VIP星球福利介绍V1.5版本-1day/0day漏洞库及内部资源更新结尾获取方法回复"星球"加入内部知识星球解锁全部资源回复“渗透字典" 获取 一些字典已重新划分处理（需要内部专属fuzz字典可加入星球获取，内部字典多年积累整理好用！持续整理中！）回复“书籍" 获取 网络安全相关经典书籍电子版pdf最后必看 文章中的案例或工具仅面向合法授权的企业安全建设行为，如您需要测试内容的可用性，请自行搭建靶机环境，勿用于非法行为。如用于其他用途，由使用者承担全部法律及连带责任，与作者和本公众号无关。本项目所有收录的poc均为漏洞的理论判断，不存在漏洞利用过程，不会对目标发起真实攻击和漏洞利用。文中所涉及的技术、思路和工具仅供以安全为目的的学习交流使用。如您在使用本工具或阅读文章的过程中存在任何非法行为，您需自行承担相应后果，我们将不承担任何法律及连带责任。本工具或文章或来源于网络，若有侵权请联系作者删除，请在24小时内删除，请勿用于商业行为，自行查验是否具有后门，切勿相信软件内的广告！往期推荐1.内部VIP知识星球福利介绍V1.5版本0day推送渗透安全HackTwo微信号：关注公众号获取后台回复星球加入：知识星球扫码关注 了解更多上一篇文章：Nacos配置文件攻防思路总结|揭秘Nacos被低估的攻击面喜欢的师傅可以点赞转发支持一下

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b540bdb5d2fe6adf.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/475167c83dd90967.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cd7d8c4a05143f16.png)

挖洞技巧合集 · 目录

作者提示: 个人观点，仅供参考
