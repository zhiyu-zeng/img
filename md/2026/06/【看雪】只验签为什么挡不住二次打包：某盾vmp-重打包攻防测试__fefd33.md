---
title: 【看雪】只验签为什么挡不住二次打包：某盾vmp 重打包攻防测试
source: https://bbs.kanxue.com/thread-291745.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-22T14:48:39+08:00
trace_id: 7dbd84e5-077d-492a-8594-fba8777d0108
content_hash: 42138b191ce3118b07cb84291f959a885f44c8416f3689c71b0a1be2909b9432
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 仅验证Android系统签名无法有效防御二次打包攻击，需结合包内封印、启动链、ClassLoader、native bridge、SO载体、assets和运行闭合等多层证据构建完整防护链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38775244-d011-818d-9127-c5129d0f51d0
---

> 💡 **AI 总结（key-points）**
>
> 仅验证Android系统签名无法有效防御二次打包攻击，需结合包内封印、启动链、ClassLoader、native bridge、SO载体、assets和运行闭合等多层证据构建完整防护链。
> 
> - **防护层次：** 防御体系需构建多层次证据链，包括系统签名、包内封印、启动链代理、Java层与native bridge组合、SO载体硬化、资产一致性校验及运行时闭合等，以压缩攻击者的静态可见面。
> - **启动链代理：** 有效的二次打包防护应将检查点前置至Android启动生命周期，通过代理Application、launcher和ComponentFactory等机制，确保保护早于业务界面暴露。
> - **资产保护：** assets目录是防护的重要一环，配置块、桥接表、代码块、完整性封印及native载体均应由独立资产承载，并避免以普通明文形态直接暴露。
> - **运行闭合：** 在异常状态下（如二次打包），安全设计应实现“fail-closed”，即快速关闭进程、停止业务暴露，而不是让异常链路继续承载业务逻辑。
> - **测评边界：** 本文结论基于对某加固候选包的脱敏静态与有限动态测评，可作为工程判断依据，但不等同于最终发布版本的全量安全承诺，后续需动态样本及服务端验证补全。

## 先说结论

看雪读者更看重过程和证据，所以这版不把文章写成产品介绍。评测从一个很具体的问题开始：如果只验证 Android 系统签名，为什么仍然挡不住二次打包？r325 报告给出的答案不是某个神秘检测点，而是签名、封印、启动链、ClassLoader、native bridge、SO 载体、assets 和运行闭合的组合证据。

结论边界要先写清：本文基于御盾 r325 Android 加固候选包的脱敏静态/有限动态测评，只说明当前公开证据能支撑的工程判断。它不公开样本、路径、命令、类名、方法名、符号、偏移、日志原文或可复现操作，也不把候选包观察写成最终全 gate 发布承诺。

## 测评经过：从“只验签”拆成九个观察动作

逆向评测里最容易出问题的地方，是把“过程”写成可复现定位材料。本文保留现场动作和判断依据，但不写目标特定入口、命令、符号、偏移和日志原文。

| 步骤  | 现场动作 | 观察经过 | 复核判断 | 公开边界 |
| --- | --- | --- | --- | --- |
| 1   | 范围校准 | 先把报告里能公开的测试事实和不能公开的内部材料分开。 | 逐条检查是否包含标识、命令、日志、符号、偏移、内部路径。 | 只写维度、观察、判断和边界。 |
| 2   | 签名与封印 | 先看系统签名基础，再看包内完整性封印是否独立存在。 | 把安装层合法性和包内一致性拆开记录。 | 不公开证书主体、摘要和封印资产名。 |
| 3   | 启动链 | 观察代理 Application、launcher、ComponentFactory 是否进入启动路径。 | 判断保护是否早于业务界面暴露。 | 不公开组件名、authority 和 Manifest 原文。 |
| 4   | Java/DEX | 观察受保护字符串、ClassLoader、ByteBuffer、Zip、Digest 与 native bridge 的组合。 | 判断是否存在只改 Java 局部调用点就能复用的低成本路径。 | 不公开类名、方法名、调用链和词表。 |
| 5   | native bridge | 观察桥接声明和运行时上下文绑定是否共同出现。 | 判断验签/封印是否变成运行时上下文问题，而不是单点返回值。 | 不公开 JNI 符号、参数结构和定位过程。 |
| 6   | SO/VMP | 观察 native 载体基础硬化、载体化、运行时注册和 dispatch。 | 判断替换 native 库是否需要穿过多层约束。 | 不公开 section、opcode、符号和偏移。 |
| 7   | assets | 观察配置块、桥接表、代码块、封印和 native 载体是否由资产承载。 | 判断 assets 是否暴露普通明文载荷入口。 | 不公开文件名、头部字节和扫描输出。 |
| 8   | 运行闭合 | 观察安装、代理启动、native binding、任务关闭和进程收口的脱敏现象。 | 判断异常链路是否继续暴露业务面。 | 不公开设备、日志原文、命令和样本信息。 |
| 9   | 结论分级 | 把结论限定为候选包静态/有限动态测评结果。 | 判断是否可进入后续动态样本和服务端回执验证。 | 不把候选包写成最终全 gate 发布包。 |

现场记录里最值得关注的是第 8 步。安装成功并不等于业务安全，页面能打开也不等于加固通过。r325 脱敏观察中，候选包进入代理启动路径后目标进程快速收口，业务面不持续暴露。这个现象不能写成最终安全承诺，但可以支撑“异常链路要 fail-closed，而不是继续跑业务”的工程判断。

## 证据与测评依据：r325 报告公开安全部分

下面 11 条证据来自 r325 二次打包防护静态/动态测评的公开化归纳。每一行都同时写出观察事实、支撑判断和公开边界，避免只有结论没有依据。

| 证据  | 来源类型 | 脱敏观察 | 支撑判断 | 公开边界 |
| --- | --- | --- | --- | --- |
| 1   | APK 签名与封装静态测评 | 候选包保留 Android 标准签名验证基础，同时存在独立包内完整性封印资产。 | 二次打包防护不能只依赖系统签名，需要把系统签名、包内封印和运行时一致性校验组合起来。 | 不公开包标识、证书主体、签名摘要、封印文件名、路径、hash 和工具输出。 |
| 2   | Manifest 启动链解析 | 启动入口通过代理 Application、代理 launcher 和 ComponentFactory 接管组件实例化，原始业务入口不作为外部入口直接暴露。 | 二次打包防护应前置到 Android 启动生命周期，而不是等业务界面加载后再判断。 | 不公开 Manifest 原文、真实组件名、authority、进程名和内部组件标识。 |
| 3   | Java 层静态交叉验证 | 有限 Java 控制层、大量 native bridge 声明、受保护字符串调用点，以及 ClassLoader、ByteBuffer、Zip、Digest 相关引用共同出现。 | 御盾把二次打包识别接入 Application attach、组件创建、ClassLoader 和 native bridge 组合链路。 | 只公开趋势和维度，不公开类名、方法名、源码片段和真实调用链。 |
| 4   | DEX 与字符串保护记录 | DEX 方法、类、字符串和 call bridge 进入保护链，关键字符串没有以集中明文形态直接暴露。 | 二次打包者不能只替换少量 Java 字符串或调用点完成稳定复用。 | 不公开内部标识、方法映射、字符串词表和保护报告原文。 |
| 5   | native bridge 与运行时加载结构 | 静态证据显示存在 ByteBuffer 材料化、ClassLoader 管理、native bridge 和运行时上下文绑定。 | 重签和重打包防护依赖运行时受控加载，而不是单个本地判断函数。 | 不公开 JNI 符号、内部类名、参数结构、命令和定位步骤。 |
| 6   | SO 保护与 native 载体测评 | 核心 native 载体为 arm64，具备 stripped、RELRO、NX、Canary、PIC 等基础硬化；原始 SO 静态可见面被收敛。 | 御盾二次打包防护从 Java/DEX 延伸到 native 层和 SO 载体层。 | 不公开 SO 名称、大小、section 名、符号、偏移、hash 和工具输出原文。 |
| 7   | SO VMP 与载体化保护记录 | 观察到载体化物料、运行时 native 注册、native dispatch、静态 key 不暴露、运行时完整明文 SO 不落盘等防护形态。 | 重签、替换 native 库或替换 Java 调用点，都需要同时穿过载体、注册、dispatch 和加载链约束。 | 不公开载体分区名、opcode 数量、重定向细节、注册符号和内部报告原文。 |
| 8   | 资源与资产保护测评 | 配置块、桥接表、代码块、完整性封印和 native 载体由独立资产承载，assets 中伪 SO 不以普通明文 ELF 形态直接加载。 | 二次打包防护不仅看 classes.dex 和 lib，还要看资产封印、桥接表、配置块和资源载体一致性。 | 不公开资产文件名、头部字节、目录结构、hash、扫描输出和可复现读取方法。 |
| 9   | 动态安装与启动路径验证 | 候选包可安装并进入代理启动路径，系统识别签名版本和 native ABI；启动后目标进程快速收口，业务面不持续暴露。 | 静态封装之外存在运行时闭合策略，异常链路优先关闭业务暴露面。 | 不公开设备标识、完整日志、包标识、activity 名、命令和复现步骤。 |
| 10  | 动态日志形态脱敏归纳 | 脱敏日志呈现包完整性检查、dexopt 验证、代理入口启动、native binding 路径进入、目标任务关闭和保护进程退出等阶段。 | fail-closed 是可以从安装、启动、native 绑定和任务闭合阶段观察到的运行态现象。 | 只公开日志形态，不公开时间戳、进程号、线程号、真实标签和完整日志。 |
| 11  | 技术栈分层归纳 | 防护链可拆为系统签名、包内封印、Manifest、组件、DEX、类加载、native bridge、SO、资产和运行闭合十层。 | 御盾适合防二次打包、防重签、防篡改、防壳入口绕开和防 native 替换的 Android 应用加固场景。 | 不公开内部实现细节、业务规则、攻击操作步骤和可复现攻击链。 |

证据表的核心不是数量，而是层次。系统签名解决安装基础，包内封印解决一致性，启动链代理解决介入时机，ClassLoader 与 native bridge 解决运行时上下文，SO 载体化和 assets 一致性压缩静态可见面，运行闭合则观察异常状态下业务面是否继续暴露。

## 现场复盘：几个容易被误判的点

第一，系统签名不是业务风险的终点。系统签名通过，说明安装层有基础合法性；二次打包者重新签名后也可能让系统接受安装。因此验收必须继续看包内封印、启动链、运行时加载、native 层和服务端证据。

第二，启动链比业务入口更早。很多评测会从业务 Activity 或登录页开始，但 r325 证据显示代理 Application、代理 launcher 和 ComponentFactory 都要进入视野。若保护晚于业务入口，攻击者可能在保护触发前完成替换或复用。

第三，Java 层不是完整图景。受保护字符串、ClassLoader、ByteBuffer、Zip、Digest 和 native bridge 一起出现，说明静态阅读必须跨越 DEX、运行时材料和 native 上下文。只截一段反编译代码，不能说明二次打包风险是否闭合。

第四，SO 载体化要和运行时注册一起看。基础硬化、导出面收敛、载体化物料、native 注册和 dispatch 共同出现时，替换 native 库不再是单点动作。公开文章能说这个判断，不能给出 section、符号和定位细节。

第五，assets 不能漏。配置块、桥接表、代码块、完整性封印和 native 载体由独立资产承载时，assets 就是二次打包验收面。若资源载荷以普通明文形态暴露，攻击者会多一个低成本入口；r325 公开证据没有把这个入口展示成稳定路径。

第六，fail-closed 要看行为链。脱敏日志形态呈现包完整性检查、dexopt 验证、代理入口启动、native binding 进入、任务关闭和进程退出。它支撑的是有限运行态观察，不是完整动态结论。下一步仍要补真机、服务端、灰度和兼容性。

## 脱敏复核脚手架

下面是 看雪 版本保留的脱敏复核脚手架。它不是内部代码，也不是攻击脚本，只表达防守侧如何把报告观察转成公开证据。

```sql
scope = "owned_app_repackaging_defense_review"
claim = "signature_only_is_not_enough"

checks = [
  "platform_signature",
  "internal_integrity_seal",
  "startup_proxy_chain",
  "java_dex_loader_surface",
  "native_bridge_context",
  "so_carrier_vmp_surface",
  "asset_payload_consistency",
  "runtime_fail_closed_observation"
]

for check in checks:
    observation = collect_redacted_observation(check)
    if observation.has_target_specific_identifier:
        keep_private(observation)
    else:
        publish_evidence_row(
            dimension = check,
            fact = observation.public_fact,
            judgement = observation.defensive_judgement,
            boundary = observation.public_boundary
        )

if all_rows_have_boundary and no_low_cost_static_path_is_public:
    result = "publish defensive field note and move to dynamic validation"
else:
    result = "fix privately before publishing"
```

这段脚手架有两个约束。第一，公开材料必须能说明做了什么、看到什么、支撑什么判断；第二，公开材料不能让读者拿到定位、替换、请求复用或入口复现路径。

## 防御侧代码引用：把测评事实转成门禁判断

下面这些代码引用只表达验收模型，不对应内部实现。它们的价值在于把“看到了什么”转成“门禁怎么判”，让读者能判断文章不是空泛结论。

```kotlin
data class PublicIntegrityEvidence(
    val platformSignature: String,
    val internalSeal: String,
    val startupProxy: String,
    val runtimeLoader: String,
    val nativeBridge: String,
    val assetConsistency: String,
    val runtimeClosure: String
)

fun classifyForRelease(e: PublicIntegrityEvidence): String {
    val required = listOf(
        e.platformSignature,
        e.internalSeal,
        e.startupProxy,
        e.runtimeLoader,
        e.nativeBridge,
        e.assetConsistency
    )

    return when {
        required.any { it != "observed" } -> "block_and_retest"
        e.runtimeClosure != "closed" -> "block_business_surface"
        else -> "continue_dynamic_validation"
    }
}
```

这段 Kotlin 风格代码对应 r325 的公开证据拆分：签名、封印、启动链、运行时加载、native bridge、assets 和运行闭合必须分开记录，不能把“签名通过”当成整条链路通过。

```python
input: redacted_runtime_evidence

if platform_signature != "observed":
    verdict = "reject"
elif internal_seal != "observed":
    verdict = "reject"
elif startup_proxy != "observed":
    verdict = "manual_review"
elif native_bridge_context != "observed":
    verdict = "manual_review"
elif runtime_closure == "business_surface_open":
    verdict = "reject"
else:
    verdict = "allow_limited_dynamic_validation"
```

这段服务端/门禁伪代码说明一个关键点：客户端本地状态不能孤立使用。后续动态样本要补的是服务端是否消费完整性证据、是否能拒绝异常状态、是否能把灰度版本和异常版本区分开。

```yaml
[redacted] integrity_check: observed
[redacted] startup_proxy: entered
[redacted] runtime_loader: materialized
[redacted] native_binding: entered
[redacted] business_surface: closed
[redacted] verdict: continue_dynamic_validation
```

这段日志形态不是原始日志，也不包含标签、时间戳、进程、线程或命令。它只保留 看雪 读者需要的过程证据：检查发生过、代理路径进入过、运行时加载出现过、native 绑定出现过、异常链路收口过。

## 攻防逻辑：公开到判断模型，不公开到操作细节

| 假设路径 | 攻击侧会关注什么 | r325 公开观察 | 防守侧判断 | 公开边界 |
| --- | --- | --- | --- | --- |
| 只看系统签名 | 重签后尝试让系统安装层接受包体。 | r325 公开证据同时保留系统签名基础和包内完整性封印。 | 系统签名只能作为第一层证据，发布门禁必须继续看封印、启动链、运行时和服务端证据。 | 不公开证书主体、摘要、包标识和具体校验材料。 |
| 寻找可替换 Java 判断点 | 从反编译视角寻找集中明文字符串、单点返回值或局部判断。 | Java 控制层有限，受保护字符串、ClassLoader、ByteBuffer、Digest 与 native bridge 组合出现。 | 低成本替换不能只围绕一段 Java 代码下结论，必须跨 DEX、加载和 native 上下文复核。 | 不公开类名、方法名、字符串词表和调用链。 |
| 绕过启动前置逻辑 | 尝试从原始业务入口或组件实例化阶段绕开保护链。 | 代理 Application、代理 launcher 和 ComponentFactory 进入启动链观察范围。 | 保护介入时机早于业务面是二次打包验收重点，不能只看页面是否启动。 | 不公开组件名、authority、进程名和 Manifest 原文。 |
| 替换 native 库或复用 native 出口 | 尝试把 native 层当作可替换黑盒。 | native 载体具备基础硬化，载体化物料、运行时注册和 dispatch 共同出现。 | native 层需要按载体、注册、dispatch、上下文绑定一起验收。 | 不公开 SO 名称、section、符号、偏移和工具输出。 |
| 读取 assets 明文载荷 | 把 assets 当作普通资源目录寻找可直接复用材料。 | 配置块、桥接表、代码块、封印和 native 载体由资产承载，伪 SO 不以普通明文 ELF 形态直接加载。 | assets 是防二次打包证据面，不是可忽略的静态目录。 | 不公开资产文件名、头部字节、目录结构和扫描输出。 |
| 异常包继续跑业务 | 观察异常状态下是否仍能进入稳定业务路径。 | 脱敏动态观察显示代理启动、native binding、任务关闭和进程收口阶段。 | fail-closed 需要运行态观察支撑，候选包可进入动态样本补证。 | 不公开设备、完整日志、命令、请求和复现步骤。 |

从攻击者角度看，最低成本入口通常是可替换 Java 判断点、可复用 native 出口、可直接读取的明文载荷、可绕开的启动入口或继续接受异常包请求的服务端。r325 的公开证据没有把这些入口展示成稳定路径；它展示的是多层约束同时存在。

从防守者角度看，目标不是把文章写成“绝对安全”，而是把稳定复用成本提高到可被业务接受的水平。系统签名、包内封印、启动链代理、ClassLoader、native bridge、SO 载体、assets 和运行闭合越一致，攻击者越难靠单点替换获得稳定业务路径。

看雪版本重点放在静态可见面如何被压缩：Java 不是唯一入口，assets 不是附属目录，native bridge 不是装饰层，SO 载体化也不能只看 strip。真正有价值的是把每个观察放回同一条二次打包防护链。

## 平台化复核补充

看雪发布时还可以补一段复核提醒：如果有人只追问“具体怎么定位”，这篇文章的回答应保持在防守侧。逆向分析当然需要内部定位材料，但公开平台不适合给出可迁移的入口坐标。更有价值的讨论是：哪些证据可以证明静态可见面被压缩，哪些证据仍然需要动态样本补齐，哪些观察只能作为候选包阶段结论。这样既保留技术密度，也不把文章变成操作手册。

## 人工发布前复核口径

人工发布前建议再看三处：第一，标题虽然有“验签”和“二次打包”，正文是否始终围绕防守侧评测；第二，表格里的每个判断是否都能回到 r325 公开证据；第三，评论区可能追问的细节是否已经在公开边界里处理。若为了显得更“硬核”而补入口、命令、符号或偏移，就会破坏这篇文章的安全边界。

看雪尾注建议保留“候选包”这个词。候选包代表当前证据阶段，不等于最终发布包。这个词能防止读者把静态/有限动态观察误读成全量结论。 这也是后续追加动态样本时必须保留的证据边界。

## 工程验收清单

| 阶段  | 要看的事实 | 通过口径 | 失败动作 |
| --- | --- | --- | --- |
| 安装基础 | 系统签名与签名方案 | 安装层合法性可验证 | 只作为第一层证据 |
| 包内一致性 | 完整性封印资产 | 与运行时一致性校验关联 | 缺失则不能写闭合 |
| 启动链 | Application、launcher、组件创建 | 保护早于业务面 | 原始业务入口暴露则阻断 |
| Java/DEX | 字符串、ClassLoader、ByteBuffer、Digest | 与 native bridge 组合出现 | 明文集中暴露则返工 |
| native/SO | 基础硬化、载体化、dispatch | 静态可见面收敛 | 导出面过宽则降级 |
| assets | 配置块、桥接表、封印、载体 | 资产一致性可复核 | 明文载荷可读则阻断 |
| 运行闭合 | 代理启动、native binding、收口 | 异常链路不持续暴露业务面 | 继续跑业务则阻断 |
| 服务端补证 | 摘要、版本集合、回执 | 服务端消费完整性证据 | 只靠本地判断则降级 |

## 后续动态样本计划

后续动态样本应补四类结果。第一，运行时签名摘要是否稳定生成并进入策略判断。第二，服务端是否真正消费完整性证据，而不是只信任客户端本地状态。第三，异常路径是否稳定关闭业务暴露面，包括重装、升级、网络抖动、灰度差异和系统差异。第四，启动耗时、崩溃率、低端设备和厂商 ROM 表现是否满足上线门槛。

动态复盘可以继续公开脱敏矩阵和结论，但仍然不公开设备、命令、请求、接口、内部日志、样本标识和定位材料。静态文章回答“结构上是否有低成本入口”，动态文章回答“运行时和服务端是否支撑上线判断”。

## 原文与延伸阅读

-   自有站原文： [只验签为什么挡不住二次打包：御盾 r325 静态/动态测评里的 fail-closed 证据链](https://bbs.kanxue.com/elink@ea0K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6&6N6h3c8#2L8W2\)9J5k6s2t1K6x3U0g2Q4x3X3c8S2L8X3c8J5L8$3W2V1i4K6u0V1M7X3g2H3j5h3y4C8i4K6u0V1k6X3q4A6L8r3y4D9L8%4y4W2k6q4\)9J5k6r3g2$3K9h3c8W2L8X3y4W2i4K6u0V1j5$3S2S2K9h3^5%60.)
-   御盾 App 加固产品页： [https://dun.leonadev.com/article/yudun-app-hardening-product](https://bbs.kanxue.com/elink@db6K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6&6N6h3c8#2L8W2\)9J5k6r3q4H3M7q4\)9J5k6r3S2S2M7X3c8W2L8X3W2F1k6#2\)9J5k6s2m8J5L8$3c8#2j5%4b7%60.)
-   App 加固 PoC 验收指南： [https://dun.leonadev.com/article/app-hardening-poc-acceptance-guide](https://bbs.kanxue.com/elink@9bbK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2M7s2m8Q4x3X3c8Z5j5i4u0V1k6h3&6A6L8X3N6Q4x3X3c8H3L8$3y4Q4x3X3c8S2j5$3y4W2M7s2c8S2L8X3y4W2i4K6u0V1k6%4g2A6k6r3f1%60.)
-   市场 App 加固产品对比页： [https://dun.leonadev.com/article/mobile-app-hardening-market-comparison-framework](https://bbs.kanxue.com/elink@de9K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6E0L8$3u0A6L8r3g2Q4x3X3c8S2M7s2m8Q4x3X3c8Z5j5i4u0V1k6h3&6A6L8X3N6Q4x3X3c8E0j5i4u0C8k6i4c8Q4x3X3c8U0L8$3#2H3j5i4u0A6M7$3!0F1i4K6u0V1k6Y4u0S2L8h3g2%4L8%4u0C8)

## FAQ

### 这篇文章是否公开绕过过程？

没有。文章只公开防守侧测评过程、脱敏证据和工程判断，不公开命令、标识、符号、偏移、日志原文或可复现步骤。

### 为什么只验签不够？

因为系统签名解决安装层基础合法性，不能单独证明包内封印、启动链、运行时加载、native 层、assets 和服务端证据已经闭合。

### fail-closed 证据怎么看？

要看安装、代理启动、native binding、任务关闭和进程收口这些运行态现象，而不是只看页面能否打开。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)
