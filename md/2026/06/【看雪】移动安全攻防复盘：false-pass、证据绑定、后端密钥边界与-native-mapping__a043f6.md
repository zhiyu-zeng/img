---
title: 【看雪】移动安全攻防复盘：false pass、证据绑定、后端密钥边界与 native mapping
source: https://bbs.kanxue.com/thread-291717.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-20T19:58:28+08:00
trace_id: 49428dfa-ef0f-475a-9465-ed30fa63319b
content_hash: d8a55a8d6663b13fb0c0976bdd1eb16a1cd55cc12e569167f7891a3ffee620f1
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 客户端只负责收集、保护、诊断和上报证据，而版本集合、最终裁决、反馈处理及业务动作等决策权必须保留在客户后端。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38575244-d011-818e-9142-f046f7f1e280
---

> 💡 **AI 总结（key-points）**
>
> 客户端只负责收集、保护、诊断和上报证据，而版本集合、最终裁决、反馈处理及业务动作等决策权必须保留在客户后端。
> 
> - **发布门禁核心：** 验收标准不是应用“能打开”或“能安装”，而是同一候选产物在静态、动态、组件、风险快照等多个维度上的完整证据链闭合，防止证据跨版本拼接导致的 false pass。
> - **密钥安全边界：** 服务端信任根（如 SecretKey）绝不能嵌入客户端应用（APK/IPA）。客户端只能提交低信任度的设备证据或标识（如 BoxId），由后端完成签名、查询裁决和业务决策。
> - **证据分类与信任：** 传输层故障（如网络超时、认证失败）必须与设备风险证据（如越狱、注入）分开上报和处理，避免将链路问题误判为安全威胁，并降低误报。
> - **反外挂策略：** 客户端检测到的异常（如 native mapping 命中）仅为证据片段，不能直接用于封号。最终处罚需由后端结合账号、会话、历史行为及多维证据图谱进行综合判定，并支持申诉闭环。

看雪版本面向攻防读者，强调脱敏案例、证据链断点和防守侧发布门禁，不公开可复现攻击细节。

本文覆盖本轮 5 篇自有站原文的外部平台改写版本，每个小节包含原文链接、脱敏案例、事实依据、技术展开和可执行清单。

## 1\. 能跑通的包为什么还不能上线：Android 加固发布门禁如何挡住 false pass？

原文链接： [android-false-pass-release-gate-same-candidate](https://bbs.kanxue.com/elink@2d6K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2L8X3c8J5L8$3W2V1i4K6u0V1k6X3q4D9M7$3g2Q4x3X3c8H3j5i4y4K6i4K6u0V1M7X3g2D9k6h3q4K6k6g2\)9J5k6r3N6S2N6r3g2Q4x3X3c8K6j5h3#2W2i4K6u0V1j5$3q4F1k6r3W2V1j5i4c8W2)

本节是 kanxue 平台改写，聚焦 御盾 Android 的单一主题。核心判断：Android 加固发布不是证明“包能打开”，而是证明同一候选产物在静态、动态、SO/provider、风险快照、业务 smoke 和性能口径上没有被错误晋级。

### 脱敏案例

某 Android 加固候选包在测试机上能启动，静态检查也有一部分绿色记录。交付团队如果只看“能打开”和“部分 pass”，就会把候选推进上线。但脱敏 no-mix 矩阵显示，静态 pass 来自旧候选，当前候选缺 signer、lineage、source-stamp，动态存活和 RiskSnapshot 也没有闭合。  
这个案例的风险在于 false pass 会污染后续判断。客户看到的是一个“已经验收”的保护包，实际却缺少 SO/provider、动态存活、业务 smoke 和性能 smoke 的同一候选证据。  
御盾 Android 应把 false pass 当成发布事故前置项处理：每次上线只接受同一候选的完整证据链，旧候选、静态片段、人工说明和未集成补丁都不能成为商业 ready。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | QA no-mix readiness 矩阵 | 矩阵把当前候选和旧候选分开记录，明确旧候选的静态通过不能导入当前候选的闭合链。 | 发布门禁必须禁止跨候选拼接证据，防止 false pass 进入上线流程。 |
| 2   | QA no-mix readiness 矩阵 | 当前候选存在 authority support\_waiting、final signer、lineage、source-stamp 输入缺失和 downstream rerun 要求。 | 构建 lineage 与签名材料缺失时，不能因为 APK 文件存在就认定可验收。 |
| 3   | QA no-mix readiness 矩阵 | 动态记录显示安装与启动可到达应用，但进程存活不足、运行时异常存在，RiskSnapshot 和 key\_delta 仍为空。 | 能启动不是动态闭合；风险快照缺失时业务 smoke 和性能 smoke 应保持 support\_waiting。 |
| 4   | QA no-mix readiness 矩阵 | SO/provider 侧存在 classloader mismatch、native bound 时序和 provider readback 阻塞。 | SO/provider 未通过时，不能用静态 DEX 或页面 smoke 代替 native 运行链证明。 |
| 5   | 架构合同审计 | 审计结论为 must\_rebuild：已有候选证明包装修复和静态 native-bridge 顺序，但没有证明后续 one-hop retry patch 集成到重建候选。 | 静态合同通过不能替代补丁集成和重建产物验证。 |
| 6   | 架构合同审计 | 审计记录明确没有写入 GateEvidence，也没有声称 QA gate pass。 | 门禁系统应允许“有发现但不晋级”的状态，避免报告文字被误读为通过。 |

### 技术展开

#### 1\. no-mix 候选隔离

把当前候选、旧候选、支持性证据和阻塞性证据分开，任何跨候选拼接都不得晋级。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“能跑通的包为什么还不能上线：Android 加固发布门禁如何挡住 false pass？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 2\. 动态存活与风险快照

启动成功后继续检查进程存活、运行时异常、RiskSnapshot、key\_delta 和材料生命周期。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“能跑通的包为什么还不能上线：Android 加固发布门禁如何挡住 false pass？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 3\. SO/provider 闭合

classloader、native bridge、provider readback 与材料绑定必须在同一候选上成立。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“能跑通的包为什么还不能上线：Android 加固发布门禁如何挡住 false pass？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 4\. 业务 smoke 延后

业务和性能 smoke 只有在静态、SO/provider、动态和风险前置证据闭合后才允许运行。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“能跑通的包为什么还不能上线：Android 加固发布门禁如何挡住 false pass？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

### 可执行清单

-   检查“能跑通的包为什么还不能上线：Android 加固发布门禁如何挡住 false pass？”是否只聚焦单一主题。
-   检查“android-false-pass-release-gate-same-candidate”证据是否包含 source、trust、freshness、version、channel、failure\_reason 和 server\_verdict。
-   检查 御盾 Android 客户端是否只上报 evidence，不输出最终 allow/reject/block。
-   检查 support bundle 是否脱敏，避免原始标识、私有规则、凭据和客户信息外泄。

## 2\. iOS 包能安装不代表可交付：protected IPA、runner 和 evidence bundle 为什么必须绑在一起？

原文链接： [ios-release-gate-evidence-binding-not-install-success](https://bbs.kanxue.com/elink@f16K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6A6L8%4y4Q4x3X3c8J5k6h3I4W2j5i4y4W2i4K6u0V1k6$3q4@1k6g2\)9J5k6r3g2$3K9h3c8W2L8X3y4W2i4K6u0V1j5X3W2F1k6r3W2F1k6#2\)9J5k6r3&6G2N6q4\)9J5k6r3W2F1M7%4c8S2L8r3I4Q4x3X3c8K6N6h3y4U0k6i4y4K6)

本节是 kanxue 平台改写，聚焦 御盾 iOS 的单一主题。核心判断：iOS 加固验收的核心不是“IPA 能安装”，而是每个 gate artifact 都能绑定到同一个 protected IPA、同一次 runner/session 和同一个 evidence bundle。

### 脱敏案例

某 iOS protected IPA 在一台设备上安装成功，团队准备把截图和安装记录作为交付证据。审计时发现，安装记录没有绑定同一 protected IPA 摘要，runner/session 不能追溯，静态逆向和动态逆向 gate 也没有相同 evidence bundle。  
如果真机 smoke 没有证明受保护函数命中、dispatcher/binding 命中、短窗口材料化和崩溃摘要，安装成功可能掩盖保护路径根本未执行。  
御盾 iOS 的做法是把 evidence binding 放在 release gate 前面：字段缺失、部分绑定、跨 gate 不一致或真实输入缺失，都保持 BLOCKED。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | iOS Release Gate 证据绑定校验 | 必要 gate artifact 不能只孤立输出 PASS，必须用脱敏字段绑定到同一个 protected IPA、同一次 runner/session、同一个 evidence bundle。 | iOS 发布验收要证明同一产物链，而不是展示多个无关联报告。 |
| 2   | iOS Release Gate 证据绑定校验 | 即使 6 个合成 gate artifact 都是 PASS 且绑定字段一致，当前阶段仍要求 commercialIosHardeningReady=false。 | 证据绑定只是基础设施，不能替代真实 runner 隔离、签名材料隔离、真机验收和逆向验收。 |
| 3   | iOS Release Gate 证据绑定校验 | 顶层 evidenceBinding 支持 BOUND\_CONSISTENT\_NOT\_COMMERCIAL\_READY、UNBOUND、PARTIAL、INCONSISTENT 等状态。 | 状态口径要区分一致但未商业 ready、缺字段、部分绑定和跨 gate 不一致。 |
| 4   | iOS Release Gate 证据绑定校验 | 每个 gate 必须提供 evidenceProducedAt 和自己的 gate 专属 evidence ref；缺失或跨 gate 不一致会 fail-closed。 | 发布门禁要阻断“看起来有报告但无法追溯”的交付。 |
| 5   | iOS Real Device Gate 合同 | 真机 gate 缺少真实 protected IPA、签名安装 gate、受控 runner、实体设备或云真机证据时，必须输出 BLOCKED 且 commercialReady=false。 | 安装成功不能独立代表真机商业验收，输入缺失应直接阻断。 |
| 6   | iOS Real Device Gate 合同 | 真机 smoke 子项包括 protectedIpaHash、installRecord、launchRecord、mainPathSmoke、protectedFunctionHit、protectedResourceHit、dispatcherBindingHit、shortWindowMaterialization、crashExitCode 和 deviceOsArchMatrix。 | 商业验收必须覆盖运行路径和保护命中，而不是只看安装结果。 |

### 技术展开

#### 1\. protected IPA 绑定

所有 gate 必须绑定同一个 protected IPA，不允许中间包、模拟器包、未签名包和真实交付包混用。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“iOS 包能安装不代表可交付：protected IPA、runner 和 evidence bundle 为什么必须绑在一起？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 2\. runner/session 绑定

runner 或 session 只输出不可逆绑定或脱敏引用，确保 gate 之间可追溯但不可复用。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“iOS 包能安装不代表可交付：protected IPA、runner 和 evidence bundle 为什么必须绑在一起？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 3\. evidence bundle 一致性

签名、真机、静态逆向、动态逆向、性能和 CI 证据都应指向同一证据包。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“iOS 包能安装不代表可交付：protected IPA、runner 和 evidence bundle 为什么必须绑在一起？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 4\. 真机 smoke 子项

安装、启动、主路径、受保护命中、dispatcher/binding、短窗口材料和崩溃摘要必须逐项记录。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“iOS 包能安装不代表可交付：protected IPA、runner 和 evidence bundle 为什么必须绑在一起？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

### 可执行清单

-   检查“iOS 包能安装不代表可交付：protected IPA、runner 和 evidence bundle 为什么必须绑在一起？”是否只聚焦单一主题。
-   检查“ios-release-gate-evidence-binding-not-install-success”证据是否包含 source、trust、freshness、version、channel、failure\_reason 和 server\_verdict。
-   检查 御盾 iOS 客户端是否只上报 evidence，不输出最终 allow/reject/block。
-   检查 support bundle 是否脱敏，避免原始标识、私有规则、凭据和客户信息外泄。

## 3\. 把 SecretKey 塞进 APK 的设备指纹，为什么从第一天就失守？

原文链接： [android-backend-wrapper-secret-boundary-not-in-apk](https://bbs.kanxue.com/elink@06aK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2L8X3c8J5L8$3W2V1i4K6u0V1j5X3q4U0K9$3g2F1k6q4\)9J5k6s2N6J5j5i4m8H3k6i4u0Q4x3X3c8K6k6h3y4J5k6i4c8Q4x3X3c8T1L8%4g2F1k6r3q4J5P5g2\)9J5k6r3&6G2N6q4\)9J5k6r3W2F1i4K6u0V1j5i4m8C8)

本节是 kanxue 平台改写，聚焦 守界 Android 的单一主题。核心判断：设备证据 SDK 的边界不是把签名能力带进 APK，而是让 APK 只交 evidence，客户后端用 SecretKey 查询 verdict、拉取报告、提交反馈并做业务决策。

### 脱敏案例

某团队为了省后端接入工作，计划把设备证据服务的 SecretKey 放进 Android App，由 App 直接调用 verdict 并根据返回结果 block 用户。这个设计看似减少接口，但等于把服务端信任根、策略入口和业务动作都放到最容易被逆向和 patch 的位置。  
脱敏 wrapper 合同给出的正确路径是：App 获取 BoxId 或上报 evidence，客户后端持有 SecretKey，后端查询 verdict、拉取 evidence report、提交 feedback label，再由客户业务系统决定观察、挑战、限速、复核或拒绝。  
守界 Android 的产品边界必须在接入文档中写清。SDK 越克制，后端越有解释空间；密钥越少出现在客户端，攻击者越难把移动端变成绕过服务端的入口。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | Backend Wrapper Contract | wrapper 的作用是帮助客户后端签名请求、查询 verdict/evidence、拉取 support bundle、提交 feedback label 和脱敏输出。 | wrapper 是后端能力，不是移动 SDK 能力。 |
| 2   | Backend Wrapper Contract | wrapper 明确不得运行在 Android App 内，不得嵌入 tenant SecretKey、provider credential、token 或真实 AppKey secret。 | 把密钥放进 APK 会把服务端信任根暴露给客户端逆向。 |
| 3   | Backend Wrapper Contract | 后端签名要求 timestamp、nonce 和请求体摘要，nonce 必须由安全随机源生成，timestamp 必须来自后端时钟。 | 请求签名要绑定服务端时间与随机性，不能依赖可被篡改的移动端时间。 |
| 4   | Backend Wrapper Contract | HTTP 认证或 clock-skew 要作为 transport error 暴露，而不是解释成设备风险结论。 | 传输失败和设备环境证据必须分开，避免网络或认证错误触发误判。 |
| 5   | Android Evidence Privacy Boundary | Android SDK 只允许输出 opaque BoxId、诊断状态、脱敏 support bundle 字段和 evidence 上传元数据，不允许输出 allow/reject/block/isFraud。 | 最终业务动作必须留在客户后端，SDK 不应成为裁判。 |
| 6   | Device Identity Protocol | riskTags 只由 server verdict path 产生；client header evidence 默认 source=client\_header、trust=low。 | 客户端上传的身份和证据只能作为低信任输入，不能更新权威身份或业务动作。 |

### 技术展开

#### 1\. 后端签名边界

SecretKey、nonce、timestamp、请求体摘要和 HMAC 签名只在客户后端生成。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“把 SecretKey 塞进 APK 的设备指纹，为什么从第一天就失守？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 2\. BoxId 查询路径

App 只传递 BoxId 或 evidence hint，客户后端调用 verdict/evidence/support bundle。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“把 SecretKey 塞进 APK 的设备指纹，为什么从第一天就失守？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 3\. transport diagnostic 分离

认证、时钟、TLS、超时和服务端错误进入传输诊断，不作为设备风险族。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“把 SecretKey 塞进 APK 的设备指纹，为什么从第一天就失守？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 4\. feedback 闭环

客户后端提交 fraud、false\_positive、false\_negative 等反馈标签，持续修正证据解释。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“把 SecretKey 塞进 APK 的设备指纹，为什么从第一天就失守？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

### 可执行清单

-   检查“把 SecretKey 塞进 APK 的设备指纹，为什么从第一天就失守？”是否只聚焦单一主题。
-   检查“android-backend-wrapper-secret-boundary-not-in-apk”证据是否包含 source、trust、freshness、version、channel、failure\_reason 和 server\_verdict。
-   检查 守界 Android 客户端是否只上报 evidence，不输出最终 allow/reject/block。
-   检查 support bundle 是否脱敏，避免原始标识、私有规则、凭据和客户信息外泄。

## 4\. 网络失败不是越狱：iOS evidence envelope 为什么要把 transport 和风险证据拆开？

原文链接： [ios-transport-diagnostic-not-jailbreak-evidence](https://bbs.kanxue.com/elink@a22K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6A6L8%4y4Q4x3X3c8@1M7X3q4F1M7%4m8G2M7Y4c8Q4x3X3c8V1K9h3q4Y4L8X3!0K6N6r3W2U0i4K6u0V1L8X3!0@1i4K6u0V1K9X3q4A6L8r3u0J5k6h3q4C8i4K6u0V1k6i4k6A6k6r3g2F1j5$3f1%60.)

本节是 kanxue 平台改写，聚焦 守界 iOS 的单一主题。核心判断：iOS transport failure 只能说明采集或上报链路异常，不能被解释成 jailbreak、tamper、hook 或设备不可信。

### 脱敏案例

某 iOS App 在弱网或服务端升级期间频繁出现 sense timeout，业务方想把 timeout 直接当成“疑似越狱或注入”处理。这个方案会把网络、认证、TLS、时钟和服务端错误全部混进风险判断，正常用户会被误伤。  
守界 iOS 的 envelope 把 transport 单独列为 evidence family。network\_timeout、auth\_failed、server\_5xx、timestamp\_skew 和 tls\_failure 只说明上报链路状态；jailbreak、Frida、tamper、attestation 各自有独立字段。  
public SDK 不输出 shouldBlock，也不暴露 raw token、完整 BoxId 或 SecretKey；客户后端可以根据业务价值决定是否重试、延迟、要求补证据或临时观察。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | iOS Evidence Extension Plan | iOS 最小闭环是 App 调用 sense，服务端返回 BoxId，客户后端查询 verdict 和 evidence report，最终业务决策留在客户后端。 | transport 异常只能影响证据链新鲜度，不能让客户端本地裁决。 |
| 2   | iOS Evidence Extension Plan | 公开 API 允许 diagnosticSnapshot、supportBundle、lastServerEvidence，但禁止 isJailbroken、isFridaDetected、isTampered、shouldBlock 和 riskLevel。 | SDK 不应把诊断状态或风险事实压成本地封禁按钮。 |
| 3   | iOS Evidence Extension Plan | Evidence taxonomy 将 identity、runtime、jailbreak、Frida/injection、tamper、attestation、transport 分成独立 family。 | 网络错误、越狱线索、注入线索和证明状态应分别上报。 |
| 4   | iOS Evidence Extension Plan | transport diagnostic 包括 network\_timeout、auth\_failed、server\_5xx、timestamp\_skew、tls\_failure，并明确 transport failure 不解释为 jailbreak、tamper 或 hook。 | 传输失败应进入重试、降级或补证据流程，而不是触发风险封禁。 |
| 5   | iOS Evidence Extension Plan | Cross-platform envelope 要求 unknown family 不能导致 server 500，client evidence 默认 trust=low，只进入 telemetry/provenance。 | 证据系统要能扩展字段并保持低信任输入边界。 |
| 6   | 后端 wrapper/隐私边界 | 认证或时钟错误应作为 transport errors 表达；support bundle 和日志不得输出完整 BoxId、raw token、SecretKey 或原始设备标识。 | 错误解释和脱敏输出必须同时设计，才能降低误报和泄漏风险。 |

### 技术展开

#### 1\. transport family 独立

timeout、auth\_failed、server\_5xx、timestamp\_skew 和 tls\_failure 只表达传输状态。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“网络失败不是越狱：iOS evidence envelope 为什么要把 transport 和风险证据拆开？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 2\. risk family 分层

jailbreak、Frida/injection、tamper、attestation 与 runtime evidence 分开上报。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“网络失败不是越狱：iOS evidence envelope 为什么要把 transport 和风险证据拆开？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 3\. low-trust client evidence

客户端 evidence 默认低信任，权威结果来自服务端 policy、verifier 或可信私有路径。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“网络失败不是越狱：iOS evidence envelope 为什么要把 transport 和风险证据拆开？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 4\. support bundle 脱敏

诊断包只输出 hash、hint、summary、status，不输出完整 BoxId、raw token、SecretKey 或原始标识。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“网络失败不是越狱：iOS evidence envelope 为什么要把 transport 和风险证据拆开？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

### 可执行清单

-   检查“网络失败不是越狱：iOS evidence envelope 为什么要把 transport 和风险证据拆开？”是否只聚焦单一主题。
-   检查“ios-transport-diagnostic-not-jailbreak-evidence”证据是否包含 source、trust、freshness、version、channel、failure\_reason 和 server\_verdict。
-   检查 守界 iOS 客户端是否只上报 evidence，不输出最终 allow/reject/block。
-   检查 support bundle 是否脱敏，避免原始标识、私有规则、凭据和客户信息外泄。

## 5\. memfd 命中就封号吗？Android 游戏反外挂为什么还要等服务端 verdict？

原文链接： [android-native-mapping-game-cheat-server-verdict](https://bbs.kanxue.com/elink@83eK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6V1N6h3&6Q4x3X3g2D9k6h3!0F1j5h3c8W2N6W2\)9J5k6h3y4G2L8g2\)9J5c8X3q4J5N6r3W2U0L8r3g2Q4x3V1k6S2L8X3c8J5L8$3W2V1i4K6u0V1L8X3q4@1K9i4k6W2i4K6u0V1L8h3q4H3M7r3W2F1k6#2\)9J5k6r3N6S2L8h3g2Q4x3X3c8U0K9r3g2S2N6q4\)9J5k6s2y4W2M7Y4k6W2M7W2\)9J5k6s2k6W2M7X3c8A6j5%4b7%60.)

本节是 kanxue 平台改写，聚焦 守界 Android 的单一主题。核心判断：native mapping 命中是重要反外挂证据，但它必须与 BoxId、账号、会话、对局、历史反馈和服务端 verdict 结合，不能在客户端直接封号。

### 脱敏案例

某手游在客户端检测到 memfd executable 或 deleted executable 后，准备直接封号。短期看这能快速打击一部分外挂，但也会带来误封：调试工具、兼容层、云手机、厂商安全组件、测试环境和被动注入都可能让 native mapping 呈现异常。  
守界 Android 的反外挂证据链把 native facts 放进服务端图谱。客户端上报 nativeFindingIds、nativeFactTags、nativeHighestSeverity 和 BoxId hint；客户后端结合账号、对局、排行榜、交易、速度窗口、设备历史和人工复核决定动作。  
这个模型不会削弱反外挂，反而让处罚更稳。攻击者需要同时伪造设备证据、账号行为和服务端历史；正常用户出现单点异常时也有申诉和回滚空间。

### 事实依据表

| #   | 来源类型 | 脱敏观察 | 工程判断 |
| --- | --- | --- | --- |
| 1   | Device Identity Protocol | native payload 会被解码为 nativeFindingIds、nativeFactTags 和 nativeHighestSeverity，例如 memfd executable、deleted executable、Frida evidence、unidbg runtime fact。 | native mapping 是证据族，需要服务端解释，不能在客户端本地封号。 |
| 2   | Device Identity Protocol | nativeRiskTags 是兼容别名，实际语义仍应映射到 nativeFactTags；riskTags 只由 server verdict path 产生。 | 字段命名不能误导业务方把 native facts 当成最终风险标签。 |
| 3   | Device Identity Protocol | legacy client-originated values 必须记录为低信任 telemetry，不能产生 authoritative risk tags、block tags、reject actions 或 canonical identity 更新。 | 客户端上报可以参与证据图谱，但不能更新权威身份或处罚动作。 |
| 4   | Android Evidence Privacy Boundary | Android evidence family 包括 hook、Frida、native mapping、runtime injection、Root/Magisk、ROM、attestation 和 transport diagnostics。 | 游戏反外挂需要多证据族组合，不能只看单一 native mapping 命中。 |
| 5   | Android Evidence Privacy Boundary | 服务端可聚合 Device Evidence Graph、velocity windows、customer evidence reports 和 feedback evaluation reports，并保留 source、trust、provenance。 | 处罚前要看设备图谱、速度窗口、账号关系和客户反馈，而不是本地瞬时事实。 |
| 6   | 动态风险门禁记录 | Hook/debug/injection 路径被反复标记为禁止或仅允许 debug-safe support，缺少完整 runtime closure 时保持 blocked。 | 反外挂取证不能为了证明检测命中而引入新的材料泄露或越界采集。 |

### 技术展开

#### 1\. native fact taxonomy

memfd、deleted executable、Frida、unidbg、tamper 等事实记录为 nativeFindingIds、nativeFactTags、nativeHighestSeverity。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“memfd 命中就封号吗？Android 游戏反外挂为什么还要等服务端 verdict？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 2\. server verdict 解释

riskTags、处罚标签、挑战动作和拒绝动作只由服务端根据业务上下文产生。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“memfd 命中就封号吗？Android 游戏反外挂为什么还要等服务端 verdict？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 3\. 游戏场景分级

登录、对局、结算、排行榜、交易和奖励使用不同阈值与复核流程。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“memfd 命中就封号吗？Android 游戏反外挂为什么还要等服务端 verdict？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

#### 4\. feedback 反哺

误封、确认作弊、人工复核和运营标签写回 evidence graph，持续调整策略。 外部发布时要讲清输入、处理、输出、失败动作和复盘指标。围绕“memfd 命中就封号吗？Android 游戏反外挂为什么还要等服务端 verdict？”，客户端或移动包只负责收集、保护、诊断和上报证据，客户后端负责版本集合、verdict、feedback、业务动作和回滚。

### 可执行清单

-   检查“memfd 命中就封号吗？Android 游戏反外挂为什么还要等服务端 verdict？”是否只聚焦单一主题。
-   检查“android-native-mapping-game-cheat-server-verdict”证据是否包含 source、trust、freshness、version、channel、failure\_reason 和 server\_verdict。
-   检查 守界 Android 客户端是否只上报 evidence，不输出最终 allow/reject/block。
-   检查 support bundle 是否脱敏，避免原始标识、私有规则、凭据和客户信息外泄。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#混淆加固](https://bbs.kanxue.com/forum-161-1-121.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)
