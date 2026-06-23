---
title: 【看雪】御盾加固Poc测试：静态看不到算法，动态也没闭合，但先别急着喊安全
source: https://bbs.kanxue.com/thread-291773.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-24T01:28:15+08:00
trace_id: 5498d414-7f38-4c90-b3a1-aa181b28da99
content_hash: a2cf8d435d93286ce623e1d518b14376cf42c5120bdaac6950d3b49cb2f57d8e
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 动态测试未还原御盾加固的核心算法，但成功防护的结论需等待对失败态、自动化业务验证及改包防护的进一步闭合证据。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38875244-d011-8191-b15f-f95a45df88e3
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 动态测试未还原御盾加固的核心算法，但成功防护的结论需等待对失败态、自动化业务验证及改包防护的进一步闭合证据。
> 
> - **静态分析：** 通过常规反编译（DEX、SO、资源等）未能直接观察到完整的业务签名算法，表明静态低成本还原路径未闭合。
> - **动态观测：** 使用模拟器、动态调试等常规手段进行入口探测和观测，未能捕获到可复用的真实业务算法输出。
> - **失败态风险：** 在风险环境下，动态测试中曾观察到状态型输出或中间态差异，此类失败态可能为攻击者提供分析线索，需作为风险点处理。
> - **业务完整性：** 在正常手机上业务流程可以正常闭环，但安全验证需要将其转化为自动化真机测试矩阵来证明无侵入性。
> - **改包防护：** 计划中的二次打包防护设计涵盖签名、包体、加载链等多个维度，目标是实现改包后的“失败-关闭”模式，但需在持有签名信息的情况下进行实测验证。

看雪版我会直接写测试现场：先拿业务入口做靶点，再看静态、启动链、native/VMP、动态返回和失败态。最有价值的结论不是“没有还原算法”，而是“哪些证据已经成立，哪些还不能下结论”。

## 现场记录：我先看了三个“不该马上庆祝”的点

我把这次测评当成一次 PoC 复盘，而不是产品宣传。报告里真正有价值的地方，不是“普通 Java 层没有完整算法”这句话，而是它后面跟着三个边界：常规动态路径没有闭合真实业务算法，但失败态出现过状态型输出；正常手机业务闭环存在，但还没变成自动化真机矩阵；二次打包方向已经进入 2.1 计划，但还需要证明持有签名信息时也不能进入真实保护态。

这三个边界让结论更可信。因为真实验收里，最怕的是把半截证据写成满分结论。静态看不到算法，只能说明普通反编译没有直接拿到完整逻辑；动态没有拿到业务输出，只能说明当前路径没有闭合；改包后失败，也要继续判断它是不是可解释的 fail-closed，而不是随机崩溃或业务不可用。把这些话写在前面，会比单纯说“无法绕过”更像一份真实测试记录。

## 证据与测评依据

下面这些证据都来自 Security 2.1 分析测试报告的公开安全部分。为了避免把测评材料变成定位材料，我只保留“观察到了什么、怎样复核、支撑什么判断、公开边界是什么”，不放真实路径、包名、类名、native 名、符号、偏移、hash、设备、命令、日志原文和真实业务输入输出。

| 证据  | 报告位置/来源类型 | 我看到的公开事实 | 为什么这条证据有用 | 公开边界 |
| --- | --- | --- | --- | --- |
| 1   | 静态路径复盘 | 业务签名入口没有以普通 Java 算法形态直接暴露。 | 说明不能只用“类名是否混淆”判断强度，要看完整算法是否低成本可恢复。 | 不公开反编译片段、类名、方法名和调用链。 |
| 2   | Manifest / 启动链观察 | 代理启动链、运行时类加载和 native bridge 参与初始化。 | 说明保护面前移到业务页面出现之前，PoC 要测启动与类加载阶段。 | 不公开组件名、authority、进程名和 Manifest 原文。 |
| 3   | native / VMP 观察 | 业务签名流程经过 native/VMP 保护链，静态面没有完整业务算法。 | 说明关键逻辑不再是普通 DEX 方法直接保留，PoC 要覆盖 native 侧元数据。 | 不公开 SO 名、符号、偏移、注册表和地址。 |
| 4   | 动态路径复盘 | 常规模拟器、动态观测和手工入口探测没有闭合真实签名算法。 | 说明当前常规路径没有形成可复用业务 oracle。 | 不公开工具命令、包名、设备、日志和注入过程。 |
| 5   | 返回值分类 | 风险环境下出现过状态型输出、输入相关中间态和 materializer 分支线索。 | 说明“没有拿到算法”还不够，失败态也可能指路。 | 不公开状态格式、样本值和分支标识。 |
| 6   | 业务无侵入 | 正常手机业务闭环存在，但需要自动化真机 gate。 | 说明安全强度不能以破坏业务为代价，正常路径必须可复测。 | 不公开账号、设备、真实输入输出向量。 |
| 7   | 二次打包方向 | 2.1 计划绑定签名、包体、加载链、native、assets 和运行时测量。 | 说明防重签不能只看证书摘要，要看改包后是否 fail-closed。 | 不公开 seal 文件名、摘要、封印算法和验证命令。 |
| 8   | Security 1.5 对比 | 旧基线范围更窄但 gate 更成熟；2.x 防护面更宽但还要收口。 | 说明当前不是“功能缺失”，而是候选强度要转成可交付证据。 | 不公开内部 gate 文件、构建路径和原始证据 hash。 |
| 9   | 脚本材料 | 报告给了静态表面扫描、动态观测骨架、返回值归类和 GateEvidence 模板。 | 说明本次不是口头判断，而是有可转门禁的工程材料。 | 只公开脱敏脚本形态，不公开目标参数。 |

## 原始报告事实映射

| 报告事实 | 公开表达 | 支撑的工程判断 | 不能往外写的部分 |
| --- | --- | --- | --- |
| 测试围绕一个 UI 触发的业务签名入口展开。 | 评测目标是真实业务入口，不是 demo 函数。 | PoC 必须围绕高价值业务资产。 | UI 文案、真实参数、类名、方法名。 |
| 静态分析按 DEX、SO、assets、Manifest、字符串和符号面展开。 | 静态不是只看反编译结果，而是看整个包面。 | 加固验收要覆盖承载形态和可解释线索。 | 文件名、hash、具体字符串和扫描输出。 |
| Java 层没有完整签名算法。 | 普通 Java 视角没有直接恢复完整业务逻辑。 | 静态低成本还原未闭合。 | 反编译截图和调用链。 |
| 业务逻辑进入 native/VMP。 | 关键路径被转移到更高成本保护链。 | PoC 要覆盖 native 入口和 metadata。 | native 名、符号、偏移、注册表。 |
| 常规动态路径没有复现真实业务输出。 | 动态观察未形成可复用算法结果。 | 当前路径未闭合，但不能绝对化。 | 动态命令、设备、日志、注入流程。 |
| 返回值曾出现状态型输出或中间态差异。 | 失败态可能成为 oracle。 | 失败路径必须进入 gate。 | 状态格式、样本值、分支标识。 |
| 用户确认正常手机可用。 | 正常业务闭环存在。 | 需要自动化真机矩阵证明无侵入。 | 真实业务向量和设备信息。 |
| 二次打包方向包含签名、包体、authority、runtime seal、tamper fail-closed。 | 改包防护要看组合证据。 | 不能只靠签名校验判断。 | seal 细节和验证命令。 |
| 报告给出 Security 2.1 迭代建议。 | 下一阶段重点是 oracle、入口、metadata、改包和真机 gate。 | 候选强度需要工程闭环。 | 内部任务文件和执行路径。 |

## 动态时间线

| 阶段  | 现场动作 | 观察结果 | 当时怎么判断 | 公开边界 |
| --- | --- | --- | --- | --- |
| 1   | 先固定业务签名入口。 | 入口来自真实业务流程。 | 不测玩具函数，先测有价值的业务点。 | 不公开 UI 文案和参数。 |
| 2   | 做 APK 包面检查。 | DEX、SO、assets、Manifest 都进入观察范围。 | 静态验收不能只看一个反编译窗口。 | 不公开文件清单和 hash。 |
| 3   | 反查普通 Java 视角。 | 没有看到完整业务签名算法。 | 静态低成本还原没有成功。 | 不公开反编译片段。 |
| 4   | 看启动链和运行时加载。 | 初始化链路和桥接参与承接。 | 保护发生在业务页面之前。 | 不公开组件和 bridge 名。 |
| 5   | 观察 native/VMP 参与。 | 关键路径进入更高成本保护层。 | native metadata 也要纳入 PoC。 | 不公开符号、偏移、SO 名。 |
| 6   | 做常规动态观察。 | 没有得到可复用真实业务输出。 | 当前动态路径未闭合算法。 | 不公开命令、设备和日志。 |
| 7   | 单独分类失败态。 | 状态型输出和输入相关差异仍要处理。 | 不能把失败态当安全成功。 | 不公开状态值和样本值。 |
| 8   | 对照正常设备路径。 | 正常业务闭环存在。 | 需要转成自动化真机 gate。 | 不公开真实业务向量。 |
| 9   | 延伸到二次打包。 | 改包防护要覆盖签名、包体、加载链、native、assets。 | 防重签不是一个摘要校验能解决。 | 不公开 seal 和验证命令。 |
| 10  | 归纳交付结论。 | 当前是商业候选强度，不是最终高端闭环。 | 需要同一 fresh 样本、同一 gate、同一证据口径。 | 不公开内部构建与任务数据。 |

## 代码证据 1：静态表面扫描的脱敏写法

报告里有静态扫描脚本，我不照抄内部样本参数，只保留它的验收思想：把 DEX、SO、assets、Manifest 和敏感 token 统一扫一遍，用来判断“静态可解释性”是否仍然偏高。

```python
# public_safe_surface_scan.py
# 防御侧 PoC 脚手架：只表达扫描思路，不包含真实样本路径、hash、文件名或命令。
from dataclasses import dataclass

@dataclass
class SurfaceEntry:
    kind: str
    encrypted_or_packed: bool
    exposes_business_token: bool
    exposes_runtime_hint: bool


def judge_static_surface(entries: list[SurfaceEntry]) -> list[str]:
    findings = []
    for item in entries:
        if item.kind == "dex" and item.exposes_business_token:
            findings.append("review-java-business-token")
        if item.kind == "native" and item.exposes_runtime_hint:
            findings.append("review-native-metadata")
        if item.kind == "asset" and not item.encrypted_or_packed:
            findings.append("review-asset-plaintext")
    return findings

# 公开报告只写 findings 的类别，不写真实文件名、摘要、路径和命中字符串。
```

## 代码证据 2：运行时观测只保留事件形态

报告里有动态观测骨架，覆盖应用 attach、库加载、JNI 注册等阶段。外部稿只适合保留“事件类别”，不应该给出包名、注入命令、目标方法或日志原文。

```javascript
// public_safe_runtime_observer.js
// 这是脱敏观测模型，不是可直接运行的目标脚本。
const events = [];

function record(type, fields) {
  events.push({
    type,
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, _]) => [k, "redacted"])
    )
  });
}

record("application_attach", { classLoader: "hidden" });
record("library_load", { libraryName: "hidden" });
record("jni_registration", { methodCount: "hidden" });
record("business_entry_seen", { entry: "hidden" });

console.log(JSON.stringify({ observer_coverage: events.map(e => e.type) }, null, 2));
```

## 代码证据 3：返回值分类，防止把 oracle 当算法

这段是我认为最关键的代码。它把返回值分成真实业务候选、状态型输出、fallback、空输出和未知输出。没有这一步，很多 PoC 会把“工具没拿到算法”误写成“加固已经成功”。

```python
# public_safe_return_classifier.py
# 输入输出均为脱敏样例，不含真实业务向量。
import re
from dataclasses import dataclass

HEX_LIKE = re.compile(r"^[0-9a-f]{32}$", re.I)
STATE_LIKE = re.compile(r"^(state|vm|runtime):[^:]+(:[^:]+){1,3}$", re.I)

@dataclass
class ReturnVerdict:
    category: str
    release_gate: str
    note: str


def classify_return(input_shape: str, output_shape: str) -> ReturnVerdict:
    if output_shape in {"", "null", "undefined"}:
        return ReturnVerdict("invalid", "block", "空输出不能算防护成功")
    if STATE_LIKE.match(output_shape):
        return ReturnVerdict("state-oracle", "block", "状态型输出可能指路")
    if input_shape == "numeric" and HEX_LIKE.match(output_shape):
        return ReturnVerdict("business-candidate", "needs-device-vector", "需与真机业务向量比对")
    if input_shape == "text" and output_shape == "same-as-input":
        return ReturnVerdict("business-branch", "needs-rule-confirmation", "可能是业务分支，不等于算法还原")
    return ReturnVerdict("unknown", "needs-review", "不能证明为真实业务输出")
```

## 代码证据 4：GateEvidence 的交付形态

PoC 最后不应该只交一句话，而要交一个能回归的证据对象。下面是公开安全模板，字段保留，敏感值全部脱敏。

```json
{
  "gate_id": "android-hardening-signature-entry-poc",
  "candidate": "redacted",
  "static_surface": "no complete ordinary Java algorithm observed",
  "runtime_observation": "common path did not close reusable business output",
  "failure_state": "state-like output must be removed before release",
  "repackaging": "modified package surface must fail closed",
  "no_intrusion": "normal-device business vector needs automation evidence",
  "public_boundary": [
    "no package name",
    "no class or method name",
    "no symbols or offsets",
    "no raw commands or logs",
    "no real business vectors"
  ],
  "verdict": "commercial candidate, not final high-end closure"
}
```

## 攻防逻辑：哪些结果能说明强，哪些不能

| 观察结果 | 能说明什么 | 不能说明什么 | 下一步 gate |
| --- | --- | --- | --- |
| 普通 Java 层没有完整算法 | 静态低成本还原没有闭合 | 不能证明 native/VMP 没有语义线索 | native metadata gate |
| 动态路径没有得到真实输出 | 常规路径没有形成可复用算法 | 不能证明失败态没有泄露方向 | oracle gate |
| 返回了状态型内容 | 保护层状态被观察到 | 不能当成业务输出或成功防护 | 禁止状态进入业务返回 |
| 正常手机可用 | 业务闭环方向正确 | 不能替代自动化矩阵 | 真机 no-intrusion gate |
| 改包方向有设计 | 具备 fail-closed 目标 | 不能替代持签名信息下的实测 | repackaging gate |
| 有静态和动态脚本 | 有工程化证据基础 | 不能替代同一候选版本全 gate | GateEvidence 归档 |

攻击者不一定从第一步就拿到完整算法。更常见的是先拿到入口方向，再拿到状态反馈，再通过输入差异判断分支，最后逐步缩小真实路径。所以我不喜欢把“动态没有输出”直接写成安全成功。真正可靠的结论应该是：动态没有闭合真实输出，同时失败态也没有给方向，正常设备还保持业务一致，改包路径也进入可解释的 fail-closed。

## 验收清单：拿这份记录去问供应商

-   证据 1：你测的是不是我的真实业务入口，而不是 demo 方法？
-   证据 2：普通 Java 视角是否还能恢复完整算法？
-   证据 3：启动链、类加载、native/VMP 是否纳入观察？
-   证据 4：动态路径是否拿到了可复用真实业务输出？
-   证据 5：失败态是否会稳定泄露 VM 状态、分支状态或 materializer 状态？
-   证据 6：空输出、崩溃、fallback 是否被排除在“防护成功”之外？
-   证据 7：正常设备业务向量是否稳定，是否有自动化矩阵？
-   证据 8：二次打包是否证明了 fail-closed，而不是随机失败？
-   证据 9：所有结论是否来自同一候选范围，而不是多个版本拼出来？
-   证据 10：对外材料是否清楚写了公开边界，避免泄露可复现链路？

## 我不会公开的内容

这类文章必须保留证据，但不能把内部测评变成攻击说明书。真实包名、类名、方法名、native 名、符号、偏移、hash、路径、设备、命令、日志原文、真实输入输出向量、patch 点和完整复现流程都不应该出现在外部平台。能公开的是测评顺序、证据类型、脱敏观察、工程判断、阻断条件和下一步 gate。

## 原文与延伸阅读

-   自有站原文： [Android 加固到什么程度才算商业级：御盾 Security 2.1 签名入口实测与动态 oracle 收口](https://bbs.kanxue.com/elink@15aK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6&6N6h3c8#2L8W2\)9J5k6s2y4W2j5%4g2J5K9i4c8&6x3U0q4Q4x3X3c8S2L8X3c8J5L8$3W2V1i4K6u0V1j5$3!0E0L8h3g2J5j5$3W2S2L8q4\)9J5k6r3S2S2M7X3c8W2L8X3W2F1k6#2\)9J5k6r3!0J5j5h3y4D9k6g2\)9J5k6r3N6S2N6r3f1%60.)
-   PoC 验收指南： [App 加固 PoC 验收指南](https://bbs.kanxue.com/elink@cfdK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2M7s2m8Q4x3X3c8Z5j5i4u0V1k6h3&6A6L8X3N6Q4x3X3c8H3L8$3y4Q4x3X3c8S2j5$3y4W2M7s2c8S2L8X3y4W2i4K6u0V1k6%4g2A6k6r3f1%60.)
-   产品页： [御盾 App 加固产品页](https://bbs.kanxue.com/elink@833K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6&6N6h3c8#2L8W2\)9J5k6r3q4H3M7q4\)9J5k6r3S2S2M7X3c8W2L8X3W2F1k6#2\)9J5k6s2m8J5L8$3c8#2j5%4b7%60.)
-   市场对比： [市场 App 加固产品对比框架](https://bbs.kanxue.com/elink@f48K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6E0L8$3u0A6L8r3g2Q4x3X3c8S2M7s2m8Q4x3X3c8Z5j5i4u0V1k6h3&6A6L8X3N6Q4x3X3c8E0j5i4u0C8k6i4c8Q4x3X3c8U0L8$3#2H3j5i4u0A6M7$3!0F1i4K6u0V1k6Y4u0S2L8h3g2%4L8%4u0C8)

## FAQ

### 这次是不是证明算法绝对安全？

不是。更准确的说法是：普通静态路径和常规动态路径没有闭合真实业务算法，但失败态 oracle、入口元数据、二次打包和真机自动化仍是后续 gate。

### 为什么要把失败态写这么重？

因为失败态会给方向。攻击者可能不需要马上拿到算法，只要能通过状态差异判断自己离真实路径有多近，就能继续收敛分析空间。

### 为什么要贴代码，又不贴真实脚本？

代码用于说明验收逻辑，不用于复现目标。公开安全代码应该表达分类方法、门禁结构和证据对象，不应该包含目标参数、真实命令或内部实现。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)
