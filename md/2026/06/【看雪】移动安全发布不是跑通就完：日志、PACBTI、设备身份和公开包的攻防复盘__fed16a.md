---
title: 【看雪】移动安全发布不是跑通就完：日志、PAC/BTI、设备身份和公开包的攻防复盘
source: https://bbs.kanxue.com/thread-291723.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-21T03:08:05+08:00
trace_id: 9449a8e3-3e62-46ac-97ec-9fb6016867d0
content_hash: 1932f5a026ad1c83575e4ca39a9cfc302a4ef966aa64cd04a52b46b749b17b42
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 移动安全产品的发布需要系统化的工程闭环，覆盖日志清理、架构兼容性、设备身份归并、证据脱敏和发布包验证，以防御攻击者利用残留信息或设计缺陷。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38575244-d011-81e7-b224-c143efe1826c
---

> 💡 **AI 总结（key-points）**
>
> 移动安全产品的发布需要系统化的工程闭环，覆盖日志清理、架构兼容性、设备身份归并、证据脱敏和发布包验证，以防御攻击者利用残留信息或设计缺陷。
> 
> - **日志门禁：** Release 包的诊断字符串（如日志、版本标记、探针语义）必须纳入发布前扫描门禁，命中敏感语义时应阻断发布，以避免为攻击者提供快速定位保护链路的线索。
> - **架构兼容性：** iOS 函数保护扩展到 arm64e 架构前，必须验证 PAC、BTI、代码签名和真机运行的兼容性；缺失任何一环都应 fail-closed，阻断商业交付，而非尝试理论 patch。
> - **设备身份归并：** 本地设备 ID（如 installId）的变化不能直接等同于风险；规范的身份应由服务端结合会话、历史图谱和反馈进行归并，客户端只提供证据而非权威判决。
> - **证据脱敏：** Support bundle 等设备证据应只包含状态、哈希摘要和短提示（hint），不能包含原始身份标识或凭据，需通过统一脱敏器在输出前处理。
> - **发布包验证：** SDK 发布前需验证公开包未混入私有代码、凭据或非目标平台资源，通过多环节门禁（如归档消费者冒烟测试）证明其安全性，功能跑通不等于发布就绪。

看雪版本面向攻防读者，重点保留脱敏案例、证据表、攻击成本变化和防守边界。

本文覆盖本轮 5 篇自有站原文的外部平台改写版本。每个小节都包含标题、原文链接、脱敏案例、事实依据、技术展开和可执行清单，适合人工发布。

## 1\. 日志没清干净，比没加固更危险：Android release 包为什么要做诊断面门禁？

原文链接： [android-release-diagnostic-string-log-surface-gate](https://bbs.kanxue.com/elink@27bK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2L8X3c8J5L8$3W2V1i4K6u0V1M7X3g2D9k6h3q4K6k6g2\)9J5k6r3c8A6j5h3N6F1L8%4y4@1K9h3y4Q4x3X3c8K6N6s2u0A6L8X3N6Q4x3X3c8D9L8$3N6Q4x3X3c8K6N6i4u0X3j5h3y4W2i4K6u0V1k6$3q4@1k6b7%60.%60.)

本节是 御盾 Android 的平台化改写，围绕“日志没清干净，比没加固更危险：Android release 包为什么要做诊断面门禁？”展开，保持单一主题边界。正文只讨论防守工程、证据治理、发布门禁、服务端解释和隐私边界，不输出攻击复现步骤或内部实现细节。

### 脱敏案例

某 Android 加固候选包在反调试、VMP 和自定义 linker 上都有基础能力，但 release 扫描仍发现诊断语义、探针痕迹和构建日志风险。攻击者不需要立即突破保护，只要根据这些语义定位加载阶段、桥接组件和运行时材料，就能缩短分析时间。  
复盘后，团队把日志和品牌残留从发布后优化提升为 gate：APK 静态面、运行时日志、CI stdout、证据包 Markdown、JSON 报告和 support bundle 都要扫描，命中敏感语义时 blocked。  
御盾 Android 在这个场景下的重点不是让 release 完全没有任何日志，而是让公开可见日志不暴露保护协议、密钥、路径、设备、样本、probe 语义、版本固定特征和客户上下文。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | QA closure consistency 记录 | 品牌与日志相关任务在事实源里显示 achieved/pass，说明发布体系已经把 brand/log 从普通备注提升为可闭合 gate。 | release 诊断面应进入发布门禁，不能只靠人工扫一眼或上线后再清理。 |
| 2   | QA closure consistency 记录 | 同一记录提示 assignment 状态与 gate 状态可能同时存在不同视图，但事实源 task/gate 是 achieved/pass。 | 发布审计要区分事实源状态、看板状态和人工备注，避免用陈旧视图误判 release 包。 |
| 3   | 敏感 stdout 卫生记录 | 某 stdout artifact 被标注为可能包含 credential export 语句，处理建议是不要阅读、复制或写入看板，并对 export/env 风格 secret 行做 redaction。 | release gate 不只查 APK 内容，也要查构建日志、证据包和报告输出是否泄露敏感语义。 |
| 4   | Android 加固缺口矩阵 | release 样本暴露较多诊断字符串和 probe 语义，日志安全管理被判定为部分偏弱。 | 诊断字符串会降低攻击者定位保护链路的成本，应在 release 构建中编号化、脱敏化或默认关闭。 |
| 5   | Android 加固缺口矩阵 | 矩阵把固定版本字符串、section marker、probe 字符串列为项目级独立特征残留。 | 稳定可识别特征会让攻击者快速判断保护方案和版本，应纳入 per-build 随机化与静态扫描。 |
| 6   | Android 加固缺口矩阵 | P0 建议包含移除或编号化 release 构建中的诊断字符串。 | 诊断面清理必须成为上线前强门禁，而不是文档优化项。 |

### 技术展开

#### 1\. 诊断字符串分级

把调试日志、错误码、probe、版本 marker、构建路径、品牌词和潜在凭据痕迹拆成不同风险等级。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 2\. 构建日志红线

CI stdout、artifact 摘要和证据包同样进入扫描，命中 export/env 风格 secret 行时禁止复制到报告。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 3\. release 静态扫描

对 APK、AAB、SO、assets、配置文件、README、support bundle 和生成报告做敏感语义扫描。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 4\. 编号化与灰度

保留必要诊断能力，但默认关闭明文，使用编号、hash、短 hint 和服务端受控开关。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

### 可执行清单

-   检查“日志没清干净，比没加固更危险：Android release 包为什么要做诊断面门禁？”是否只聚焦单一产品、单一平台或单一场景。
-   检查 御盾 Android 是否只输出 evidence，不输出最终业务 allow/reject/block。
-   检查客户后端是否具备合法版本集合、verdict 查询、feedback 和回滚开关。
-   检查 support bundle、证据包和公开文档是否已经脱敏。

## 2\. arm64e 不是多一个架构：iOS PAC/BTI 没验清楚，函数保护为什么必须 fail-closed？

原文链接： [ios-pac-bti-compatibility-fail-closed-gate](https://bbs.kanxue.com/elink@71dK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6A6L8%4y4Q4x3X3c8H3j5h3y4Q4x3X3c8T1N6r3W2Q4x3X3c8U0L8$3#2H3j5i4c8A6j5X3W2D9K9i4c8&6i4K6u0V1k6X3q4A6L8q4\)9J5k6r3y4D9L8%4y4W2k6q4\)9J5k6r3N6S2N6r3f1%60.)

本节是 御盾 iOS 的平台化改写，围绕“arm64e 不是多一个架构：iOS PAC/BTI 没验清楚，函数保护为什么必须 fail-closed？”展开，保持单一主题边界。正文只讨论防守工程、证据治理、发布门禁、服务端解释和隐私边界，不输出攻击复现步骤或内部实现细节。

### 脱敏案例

某 iOS 函数保护方案在 arm64 样本上可以完成静态演示，团队准备扩大到 arm64e。审计发现 PAC return path、BTI landing pad、branch island、unwind 和真机 smoke 都没有闭合。若继续 patch，最好的结果是偶发崩溃，最坏的结果是破坏代码签名和受保护路径。  
这不是再补一个兼容性测试的问题，而是保护链路是否能商业交付的问题。御盾 iOS 应把 PAC/BTI 作为门禁：未建模就跳过，未知指令就阻断，缺真机就不 ready。  
公开文章只描述防守侧 gate，不给出 patch 位置、指令 bytes、RVA 或 trampoline 细节。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | PAC/BTI 兼容边界 | 当前模型默认 staticPatchAllowed=false、trampolineAllowed=false、materializationAllowed=false，并列出 BTI landing pad、PAC return path 和真机 smoke 等 blocker。 | PAC/BTI 未证明时，函数保护不能用理论可 patch 冒充商业 ready。 |
| 2   | PAC/BTI 兼容边界 | 入口 patch、dispatcher 入口、arm64e indirect branch、PAC return path 和 branch island 都需要单独建模。 | iOS 函数保护不是替换几字节，而是要保持控制流、签名、返回路径和代码签名一致。 |
| 3   | arm64 指令分类方案 | 分类器只对 \_\_TEXT,\_\_text 中 4 字节对齐的 A64 指令字做保守分类，unknown 指令不得进入 patch/materialization。 | 指令分类是后续函数边界、PAC/BTI/unwind 建模的输入，不是商业完成证据。 |
| 4   | arm64 指令分类方案 | 分类族包含 pacBti、pacReturn、directBranch、indirectBranch、call、return、pcRelative、literalLoad、unknown 等。 | PC-relative、literal、branch、PAC/BTI 和 unknown 都可能阻断搬移、加密或 trampoline。 |
| 5   | 函数级加密方案 | 函数级加密只允许显式 selected target，不允许没有 target profile 的全量自动保护或 section linear fallback 商业 ready。 | 商业加固应基于稳定 target profile，而不是对整个 section 粗暴加密。 |
| 6   | 函数级加密方案 | 进入加密前必须确认函数起止、LC\_DATA\_IN\_CODE、section 边界、指令对齐和 unwind 兼容。 | 函数边界不稳定时必须 skipped/block，不能把崩溃风险转嫁给客户真机。 |

### 技术展开

#### 1\. 指令分类输入

先对 Mach-O \_\_TEXT,\_\_text 做脱敏指令族计数，为函数边界、PAC/BTI 和 unwind 兼容提供保守输入。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 2\. PAC/BTI blocker

BTI landing pad、PAC return path、indirect branch、branch island、code signing 和 real-device smoke 任一缺失都不能商业 ready。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 3\. selected target 策略

只保护明确 selected target，函数边界稳定、指令可建模、unwind 可兼容后才进入加密。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 4\. 真机闭环

重签后必须有安装、启动、受保护路径命中、崩溃摘要和设备矩阵，静态报告不能替代真机。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

### 可执行清单

-   检查“arm64e 不是多一个架构：iOS PAC/BTI 没验清楚，函数保护为什么必须 fail-closed？”是否只聚焦单一产品、单一平台或单一场景。
-   检查 御盾 iOS 是否只输出 evidence，不输出最终业务 allow/reject/block。
-   检查客户后端是否具备合法版本集合、verdict 查询、feedback 和回滚开关。
-   检查 support bundle、证据包和公开文档是否已经脱敏。

## 3\. 设备 ID 变了就换人吗？Android canonical identity 为什么必须由服务端归并？

原文链接： [android-canonical-device-id-stability-evidence](https://bbs.kanxue.com/elink@2d4K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2L8X3c8J5L8$3W2V1i4K6u0V1j5$3q4F1L8$3&6A6j5$3q4D9i4K6u0V1k6r3g2$3K9h3y4W2i4K6u0V1K9h3c8Q4x3X3c8K6N6r3q4T1K9h3I4A6N6s2W2Q4x3X3c8W2N6X3W2V1k6h3&6U0k6b7%60.%60.)

本节是 守界 Android 的平台化改写，围绕“设备 ID 变了就换人吗？Android canonical identity 为什么必须由服务端归并？”展开，保持单一主题边界。正文只讨论防守工程、证据治理、发布门禁、服务端解释和隐私边界，不输出攻击复现步骤或内部实现细节。

### 脱敏案例

某业务把本地设备 ID 当成账号安全主键，用户清除数据、换包重装或系统升级后出现新 ID，于是被当成新设备或风险设备。复盘发现本地 ID 只能说明安装层或当前观测层，无法代表服务端长期设备身份。  
守界 Android 的做法是将 installId、resolvedDeviceId、fingerprintHash、BoxId、canonicalDeviceIdSha256 分层。客户端提供证据，服务端结合握手、设备绑定、历史图谱和反馈归并 canonical identity。  
这个模型能同时处理卸载重装、系统重置、ROM 差异、模拟器、多开和网络失败，避免把 ID 变化直接解释成攻击。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | 设备身份协议 | installId 是 per-install 稳定 UUID，resolvedDeviceId 是当前最佳设备标识，fingerprintHash 只是相关性 hint。 | 本地身份层要分层使用，不能把任一字段当成最终业务身份。 |
| 2   | 设备身份协议 | canonical identity 明确归服务端所有，客户端提供的 canonical 值和 legacy header 最多是 claim。 | 服务端归并是设备图谱权威，客户端不能更新权威身份或直接产生 riskTags。 |
| 3   | 设备身份协议 | cloud-config 请求只能发送 SHA-256 身份摘要，不能发送 raw Device-Id、raw Install-Id、raw Canonical-Device-Id 或 risk/native risk headers。 | 控制平面不是身份绑定权威，公开 header 也必须脱敏。 |
| 4   | 稳定性测试脚本 | 稳定性脚本按 initial、clear\_data、reinstall、reboot 等阶段比较 canonicalDeviceId hash，并在无法生成时写 blocked，而不是造成功。 | 身份稳定性要用阶段化证据验证，不能凭一次安装结果下结论。 |
| 5   | 稳定性测试脚本 | 脚本会把 BoxId 替换成短 hint 或 hash，summary 只写 device serial hash 和阶段结论。 | 排障需要可关联，但公开材料不能保留完整身份或设备原始材料。 |
| 6   | 隐私边界 | Android SDK 允许输出 opaque BoxId、diagnostic status、redacted support bundle 和 evidence upload metadata，不允许输出 allow/reject/block/isFraud。 | 设备身份只能作为证据入口，最终动作必须在客户后端解释。 |

### 技术展开

#### 1\. 身份层分离

installId、resolvedDeviceId、fingerprintHash、BoxId 和 canonical identity 分别承担安装、观测、相关性、报告入口和服务端权威。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 2\. 稳定性阶段测试

按初次运行、清数据、重装、重启等阶段验证 canonical hash 是否稳定，缺材料时 blocked。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 3\. 隐私最小化

公开和控制平面只使用 hash、hint、status，不传 raw ID 或完整 BoxId。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 4\. 服务端归并

客户后端基于 session、device binding、证据族、反馈和历史图谱决定是否归并、挑战或复核。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

### 可执行清单

-   检查“设备 ID 变了就换人吗？Android canonical identity 为什么必须由服务端归并？”是否只聚焦单一产品、单一平台或单一场景。
-   检查 守界 Android 是否只输出 evidence，不输出最终业务 allow/reject/block。
-   检查客户后端是否具备合法版本集合、verdict 查询、feedback 和回滚开关。
-   检查 support bundle、证据包和公开文档是否已经脱敏。

## 4\. support bundle 不是日志打包：iOS 设备证据为什么要先脱敏再交付？

原文链接： [ios-support-bundle-redaction-diagnostic-boundary](https://bbs.kanxue.com/elink@b14K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6A6L8%4y4Q4x3X3c8K6N6i4m8H3L8%4u0@1i4K6u0V1j5Y4g2F1k6r3I4W2i4K6u0V1M7X3g2V1j5h3y4@1K9h3!0F1i4K6u0V1k6r3W2S2k6$3&6G2M7%4c8A6j5#2\)9J5k6r3u0G2N6h3&6V1j5i4u0&6)

本节是 守界 iOS 的平台化改写，围绕“support bundle 不是日志打包：iOS 设备证据为什么要先脱敏再交付？”展开，保持单一主题边界。正文只讨论防守工程、证据治理、发布门禁、服务端解释和隐私边界，不输出攻击复现步骤或内部实现细节。

### 脱敏案例

某客户要求把 iOS SDK 的完整日志包交给客服排查。安全评审发现，如果直接打包原始日志，可能包含 AppKey、设备标识、BoxId、endpoint、token 状态和内部事件。这样的 support bundle 虽然方便排查，却会变成新的隐私和安全风险。  
守界 iOS 的设计把 support bundle 限制在 hash、hint、status、family、source、trust 和 transport 类别。客服能知道 SDK 是否初始化、上报端点是否配置、证据族是否采集、BoxId 是否存在、最近 canonical hint 是否可用、传输错误属于哪类，但看不到原始身份和私有凭据。  
这个边界让客户支持、安全运营和合规团队能共享同一份材料，而不需要每次手工删日志。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | DiagnosticSnapshot 源码 | 诊断快照只包含 initialized、reportingEndpointHost、appKeyHash、evidenceFamilies、lastBoxIdHint 和 lastCanonicalDeviceIdHint。 | support bundle 应输出状态、hash 和 hint，不输出原始 AppKey、完整 BoxId 或完整 canonical id。 |
| 2   | Redactor 源码 | Redactor 提供 sha256Hex 和 hint 两类能力，短值直接返回 redacted，长值只保留前后短片段。 | 脱敏应成为 SDK 基础能力，而不是文档要求或人工处理。 |
| 3   | EvidenceEnvelope 源码 | iOS envelope 包含 schemaVersion、platform、sdkFamily、sdkVersion、generatedAtMillis、reportingMode、appKeyHash、installIdSha256、deviceContext、evidenceFamilies、evidenceEvents、attestationEvidence 和 diagnostics。 | 上报包应结构化且最小化，既能诊断也能控制隐私暴露。 |
| 4   | EvidenceEnvelope 源码 | DeviceContext 使用 deviceModelHash、bundleIdHash、teamIdHash 等 hash 字段；EvidenceEvent 带 source 和 trust，默认 client\_header/low。 | iOS 设备证据需要区分来源和信任等级，不能把客户端事件直接当权威。 |
| 5   | Attestation collector 源码 | App Attest 与 DeviceCheck 采集的是 support status、request status、challenge required 等状态，缺 server challenge 时不请求 token/assertion。 | support bundle 应说明能力和集成状态，而不是携带私有验证材料。 |
| 6   | Hosted reporting client 源码 | 公开托管上报使用 public\_hosted 模式，错误被映射为 transport、authFailed、serverError 等类别。 | support bundle 要把传输诊断和风险证据分开，便于客服与后端定位问题。 |

### 技术展开

#### 1\. 诊断快照最小化

DiagnosticSnapshot 只暴露初始化、host、appKeyHash、evidenceFamilies 和短 hint。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 2\. 通用脱敏器

Redactor 统一 hash 与 hint 规则，避免不同模块各自拼接原始字段。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 3\. 结构化 envelope

EvidenceEnvelope 用 schema、platform、families、events、attestation 和 diagnostics 表达事实。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 4\. 错误类别拆分

public hosted 上报把 transport、auth、server error 分开，support bundle 不把网络失败写成风险。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

### 可执行清单

-   检查“support bundle 不是日志打包：iOS 设备证据为什么要先脱敏再交付？”是否只聚焦单一产品、单一平台或单一场景。
-   检查 守界 iOS 是否只输出 evidence，不输出最终业务 allow/reject/block。
-   检查客户后端是否具备合法版本集合、verdict 查询、feedback 和回滚开关。
-   检查 support bundle、证据包和公开文档是否已经脱敏。

## 5\. SDK 能跑不代表能发布：Android 设备证据包为什么要证明“没有带出秘密”？

原文链接： [android-sdk-public-release-evidence-pack-no-secret-gate](https://bbs.kanxue.com/elink@79eK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2L8X3c8J5L8$3W2V1i4K6u0V1M7$3c8C8i4K6u0V1M7s2g2T1L8r3W2U0i4K6u0V1M7X3g2D9k6h3q4K6k6g2\)9J5k6r3g2$3K9h3c8W2L8X3y4W2i4K6u0V1M7r3q4U0K9#2\)9J5k6r3&6G2i4K6u0V1M7$3g2U0M7X3g2@1i4K6u0V1k6$3q4@1k6b7%60.%60.)

本节是 守界 Android 的平台化改写，围绕“SDK 能跑不代表能发布：Android 设备证据包为什么要证明“没有带出秘密”？”展开，保持单一主题边界。正文只讨论防守工程、证据治理、发布门禁、服务端解释和隐私边界，不输出攻击复现步骤或内部实现细节。

### 脱敏案例

某 SDK 在本地 sample app 中可以跑通 BoxId 返回和诊断输出，团队准备直接打包给客户。发布审查发现，能跑通只是功能结果，公开交付还要证明 archive 没有混入 server、iOS、Web、homepage、private detector、generated local files、local.properties、SecretKey 或 provider 凭据。  
守界 Android v0.4 的 release checklist 把这件事拆成 release readiness、public archive dry run、archive consumer smoke、publish workflow dry run、release candidate manifest、evidence pack schema、public commit scope 和 post-release consumption。任何一个 gate 失败，都不能靠人工说明继续。  
这个案例说明，SDK 发布的安全性不只在 SDK 代码里，也在发布流程里。公开包一旦带出私有材料，后续再修复也很难收回。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | Release Checklist | 本地 gate 要求 status 为 local-pass-with-external-blockers、failures 为 none、secret values printed 为 no，且 blockers 明确是外部材料。 | 公开发布可以承认外部 blocker，但不能用 dummy credential 或 synthetic success 伪装完成。 |
| 2   | Release Checklist | public archive dry run 要求排除 iOS、Web、server、homepage、private detector、generated build、local.properties 等内容。 | 公开 Android SDK 包必须有清晰发布范围，不能从混合工作区误带私有目录。 |
| 3   | Release Checklist | archive consumer smoke 要求无 symlink、脚本语法通过、提取包仍排除私有根，并扫描 forbidden public-boundary material。 | 发布包不仅要生成，还要模拟消费者视角复核。 |
| 4   | Release Readiness 脚本 | 脚本检查 README、release checklist、release notes、tag runbook、changelog、wrapper、matrix、Maven、archive、publish workflow、public commit scope 等 gate。 | SDK 发布要由多个结构化 gate 组成，不能只看单次构建成功。 |
| 5   | Release Readiness 脚本 | 脚本显式标注不启动付费设备、不打印 secrets，并把真实 provider、Central、ops、wrapper endpoint 等列为 external blockers。 | 外部依赖缺失时要透明记录 blocked，而不是在公开包里放测试凭据。 |
| 6   | Release Notes Draft | release notes 强调 SDK evidence-only，收集并上报设备/环境证据，返回 BoxId，最终业务决策留给客户后端。 | 公开 SDK 的定位必须和产品边界一致，不能把客户端包装成业务裁判。 |

### 技术展开

#### 1\. public archive 边界

只包含公开 Android SDK、sample、docs、workflow 和必要 wrapper skeleton，排除混合仓库的非公开材料。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 2\. release evidence pack

索引各组件 summary、git index snapshots、SHA-256、byte counts 和 redaction scan 结果。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 3\. 外部 blocker 透明化

真实 attestation provider、Maven Central、ops、backend endpoint 缺材料时写 external blocker。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

#### 4\. consumer smoke

从消费者视角解包、查 symlink、跑脚本语法、扫 forbidden material，证明发布包可安全交付。 外部平台发布时应继续坚持证据优先：先说明风险如何出现，再说明防守侧如何采集事实，最后说明服务端或发布门禁如何解释。不要把这部分写成产品口号，也不要输出内部规则、路径、样本或可直接复现的绕过细节。

这一层的落地检查可以写成四个问题：输入材料是什么，输出字段是什么，失败时怎么处理，谁负责复盘。只要其中一个问题答不上来，说明该能力还没有进入工程闭环。

### 可执行清单

-   检查“SDK 能跑不代表能发布：Android 设备证据包为什么要证明“没有带出秘密”？”是否只聚焦单一产品、单一平台或单一场景。
-   检查 守界 Android 是否只输出 evidence，不输出最终业务 allow/reject/block。
-   检查客户后端是否具备合法版本集合、verdict 查询、feedback 和回滚开关。
-   检查 support bundle、证据包和公开文档是否已经脱敏。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)
