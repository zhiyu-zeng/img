---
title: 【微信】攻击停了，凭据风险没停：Azure APIM事件的真正“后半场”
source: https://mp.weixin.qq.com/s/i4mNp7AWRXH7gRXw6y9eSw
source_host: mp.weixin.qq.com
clip_date: 2026-11-27T13:30:15+08:00
trace_id: cb7956a4-7076-48a6-9e7b-61409e276b36
content_hash: 637757633f2160387a8b1c82d37559f188a19497b9d87348bee374f76126374e
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 42575244-d011-81ae-8c46-f625d2c70cfc
ioc: null
---

**奇安信威胁情报中心** *2026年11月26日 13:09*

威胁情报 · 云端管理面 · 凭据风险

攻击停了，凭据风险没停：

Azure APIM事件的真正“后半场”

从Equinor、Skagerak Energi事件，看云端管理面暴露后的轮换、追查与检测

· 威胁情报事件分析　·　本文已发布于NCC国家网络安全云社区https://nccsec.cn/security-community

11月20日，挪威能源企业Equinor宣布，针对其部分IT系统的网络攻击已经停止，生产保持正常，也没有发现数据被窃取或篡改的迹象。

如果只看企业通报，这起事件似乎已经结束。但挪威国家安全局（NSM）与微软随后给出的处置要求指向另一个重点： **云端未授权访问路径被关闭，只能阻断继续利用，不能让此前可能暴露的密钥、令牌和配置秘密自动失效。**

因此，这不是一起应以“病毒是否扩散”来衡量风险的事件。攻击者瞄准的是Azure API Management（APIM）中的凭据，而防守方真正需要完成的，是对整条凭据链的轮换与追踪。

01 先看结论：本次事件需要记住四点

1.  攻击核心是APIM Classic管理面。微软确认，相关问题可使未授权方在特定配置条件下访问部分管理功能，并执行包括秘密管理在内的管理操作。
2.  潜在暴露的不只是API订阅密钥。还包括Named Values中的秘密、身份提供者与OpenID Connect提供者的客户端秘密，以及调用直接管理API所用的令牌。
3.  受影响范围不能笼统写成“所有Azure APIM”。微软列出的受影响对象为未按文档安全最佳实践配置的APIM Classic Developer、Basic、Standard和Premium层级；Classic Consumption及全部APIM v2层级不受影响。
4.  服务端修复不等于客户侧处置完成。微软于11月19日关闭了未授权管理面访问路径，但明确提示，该操作不会自动使客户此前可能已经暴露的凭据失效。

需要区分技术影响范围与应急处置基线：微软圈定了存在风险的Classic层级和配置条件；NSM则建议所有使用Azure APIM的机构假定其秘密与Named Values已经暴露，并轮换全部令牌和秘密。对防守方而言，不能因为尚未收到通知，就把盘点和轮换搁置下来。

02 从企业警报到平台通告：事件时间线

|     |     |
| --- | --- |
| 时间（2026年） | 公开进展 |
| 11月17日 | Equinor检测到针对部分IT系统的持续网络攻击，随即组织处置并通知相关主管部门；当时未发现数据被窃取迹象，运营与生产未受影响。 |
| 11月18日 | Equinor表示已进一步掌握攻击方式和受影响系统，明确其并非病毒攻击，生产仍未受影响。微软于同日发现影响APIM Classic的安全问题。 |
| 11月19日 | 微软关闭相关未授权访问路径，并在适当情况下轮换由微软控制的密钥和凭据。Skagerak Energi更新事件进展，称正常运营与生产未受影响，仍无信息外泄迹象。 |
| 11月20日 | Equinor宣布攻击已经停止，未发现数据被窃取或篡改，也未发现对员工、合作伙伴或供应商造成负面影响；事件已报案。NSM开始公开发布APIM风险处置建议。 |
| 11月23日 | NSM更新通告，确认未知攻击者积极搜寻APIM中的访问令牌、秘密和Named Values，Equinor与Skagerak Energi属于受影响机构。BleepingComputer披露了微软Azure Service Health通告的跟踪编号MZK9-GH0及更多影响范围信息。 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0542e19bc26feaf0.png)

**图1｜Azure APIM Classic相关事件演进与处置时间线（2026年11月17—23日）**

图源：本文根据Equinor、Skagerak Energi、NSM及BleepingComputer公开信息整理绘制。

NSM表示，该问题由挪威能源行业较早发现，并赞扬Equinor在早期检测和信息共享方面的工作。受影响对象并不限于能源行业，也不限于挪威境内，但具体利用规模仍在调查中。

截至本文发布时，公开资料未给出CVE编号，也未公布攻击者身份。Equinor曾表示攻击看起来并非专门针对该公司，现有信息也不足以支持进一步归因。

03 为什么APIM一旦暴露，风险会越过API网关

APIM通常位于应用、服务与后端API之间，负责发布接口、执行认证授权、应用策略、路由请求和记录流量。很多团队把它理解为一个“API入口”，但攻击者更关注的是它同时保存的配置与信任关系。

这些信任关系大致分为四类：

|     |     |     |
| --- | --- | --- |
| 凭据或配置 | 在APIM中的作用 | 被滥用后的风险方向 |
| Named Values中的秘密 | 供APIM策略引用的键值配置，可能包含后端API密钥、连接串或其他敏感值 | 视具体值的内容，可用于认证到后端应用、服务或接口 |
| 身份提供者、OpenID Connect提供者的客户端秘密 | 支持相关应用或开发者门户的身份集成 | 可用于以应用身份获取访问权限，实际能力取决于应用授权 |
| Subscription Keys | API调用方访问产品或API时使用的订阅密钥 | 可在密钥对应范围内调用受保护API |
| 直接管理API令牌 | 对APIM实例执行直接管理操作 | 可能扩大对实例配置与秘密的管理能力 |

这条风险链可以概括为：  
**未授权访问管理功能 → 获取APIM配置中的秘密、密钥或令牌 → 使用仍然有效的凭据访问其对应服务。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/95e6f68f03cf370d.png)

**图2｜APIM Classic管理面攻击与凭据风险链**

图源：本文根据微软、NSM及Anders Kristiansen公开信息整理绘制。图中实线表示公开信息支持的攻击目标，虚线表示需要结合日志确认的后续使用场景。

云安全研究员Anders Kristiansen进一步指出，从APIM配置中取得的凭据可能直接被用于APIM之外的受保护服务。其实际可达范围由凭据权限、有效状态和目标服务的访问控制共同决定。

这也解释了一个看似矛盾的现象： **企业没有发现业务数据被窃取，不等于可以跳过凭据暴露处置。** 生产正常与数据未被篡改是业务影响结论；轮换秘密、追查凭据使用则是面向攻击持续性的事故响应动作，两者并不冲突。

04 关于漏洞根因，目前能确认到什么程度

微软公开通告的可靠信息是：特定配置条件下，APIM Classic存在未授权访问部分管理功能的问题，攻击者可能借此执行管理操作并访问实例中的秘密。

BleepingComputer提到，一名管理员曾将问题描述为“已弃用旧版API的零日认证绕过”，并声称相关接口缺少客户可用日志。但该说法来自管理员陈述，媒体未独立验证，微软也没有公开完整根因、利用请求或漏洞触发条件。

**直接管理API应当列入检查和收敛范围，但不能据此直接认定它就是本次事件的入口。** 同样，在官方技术细节发布前，不宜把“认证绕过”写成已经确认的漏洞机制。

05 应急处置：先封堵，再轮换，再追查

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2d80970bd83426ae.png)

**图3｜APIM客户侧应急处置闭环**

图源：本文根据NSM、Microsoft Learn及Anders Kristiansen公开的处置建议整理绘制。

1\. 盘点全部实例，并核查运行时版本

盘点范围应覆盖所有订阅和资源组，包括开发、测试、试点及长期无人维护的实例，同时查看Azure Service Health中是否收到MZK9-GH0相关通知。

NSM给出的版本检查方式为访问：

https://<your-gateway-hostname>/internal-status-0123456789abcdef

读取返回内容中的RuntimeVersion，按以下规则判断：

-   0.52系列：末位编号达到31936或更高，视为已修复；
-   0.53系列：末位编号达到31938或更高，视为已修复；
-   其他版本格式，例如0.53.4608.0或0.52.4150.0，属于不适用上述阈值的v2或Consumption层级，NSM称其不受此问题影响；
-   低于相应阈值的实例仍应视为存在风险，并联系服务提供商处理。

2\. 轮换必须在凭据源头完成

仅在APIM中重新粘贴同一个值，不构成轮换。建议按业务依赖制定切换计划，并确保旧凭据被撤销或失效：

-   轮换Named Values中保存的后端密钥、连接凭据和令牌；
-   轮换APIM引用的Key Vault秘密，并核查相关读取记录；
-   在对应应用注册中轮换身份提供者和OIDC客户端秘密，确认新凭据可用后删除或撤销旧凭据；
-   重新生成订阅的主、次密钥，协调API调用方完成平滑切换；
-   轮换直接管理API相关的租户访问密钥和令牌。

对订阅密钥等会影响业务调用的凭据，可以利用主、次密钥分批切换，但不能因担心中断而无限期保留旧密钥。

3\. 关闭不再需要的遗留访问路径

微软已于2025年3月15日终止对APIM直接管理API的支持。该接口默认禁用，但仍应检查每个实例；如已启用且无继续使用的必要，应关闭“Enable Management REST API”，并将相关工具迁移到基于Azure Resource Manager的管理API。

Anders Kristiansen提醒，支持终止不应被理解为所有既有端点都会自动消失。该直接管理接口不使用Entra ID和Azure RBAC，其调用也不会出现在ARM Activity Log中，因此不能用“活动日志没有记录”替代对接口状态和凭据使用情况的检查。

同时应审视旧版开发者门户：关闭不必要的注册入口，清理闲置身份提供者，检查产品是否要求订阅审批，并移除不再需要的APIM用户。

4\. 从APIM扩展到身份与下游资源

调查不应只搜索APIM资源本身，还应覆盖：

-   Entra服务主体登录日志，寻找关联应用从异常地址登录、访问异常资源的行为；
-   Key Vault审计日志，定位非预期身份执行的SecretGet、SecretList和SecretListVersions；
-   APIM网关日志，检查新出现的订阅标识、异常调用来源及追踪请求；
-   Microsoft Graph活动日志，确认关联应用是否调用了超出日常职责的接口；
-   后端API、Storage及其他业务系统的认证与访问日志。

需要先确认这些日志在事件时间窗内是否已经启用、实际写入哪张表，以及保留期是否覆盖调查区间。事件发生后才开启的日志，无法补回此前历史。

5\. 用Key Vault改善秘密管理，但不要把它当成万能隔离

微软建议使用Key Vault引用保存Named Values，以减少秘密直接嵌入APIM配置或策略的情况，并配合托管身份和最小权限访问。

但Key Vault引用不能替代APIM自身的权限控制。Anders Kristiansen指出，拥有策略编辑或请求追踪能力的主体，仍可能通过相关功能暴露秘密值。因此，策略编辑权限、追踪权限、Key Vault访问权限和审计日志必须一起收敛。

06 这起事件留下的三个防守启示

**第一，API资产管理必须同时覆盖数据面和管理面。** 只统计域名、接口和业务流量，会遗漏能够修改策略、读取秘密和管理订阅的控制入口。

**第二，没有恶意软件，不代表没有入侵路径。** 当攻击者利用云服务管理功能和有效凭据开展操作时，传统以终端样本、病毒传播和文件哈希为中心的排查方法很难覆盖全貌。

**第三，轮换凭据只是切断未来使用，不能替代历史调查。** 新密钥可以防止旧秘密继续被滥用，却无法回答旧秘密曾被谁使用、访问过哪些资源。只有将轮换记录与身份、密钥库、网关和后端日志关联起来，才能完成真正的事件闭环。

Equinor的攻击已经停止，但对所有使用APIM的组织而言，真正需要立即回答的问题仍然是： **我们的APIM里保存了什么，这些凭据能打开哪些系统，旧凭据是否已经完全失效？**

07 技术附录

附录A：MITRE ATT&CK技术映射

下表依据公开行为进行映射，并将已经披露的攻击目标与需要日志进一步确认的后续使用场景区分开来。

|     |     |     |     |
| --- | --- | --- | --- |
| 技术编号 | 技术名称 | 本事件中的映射依据 | 使用说明 |
| T1190 | Exploit Public-Facing Application，利用面向公众的应用程序 | 未授权方利用APIM Classic安全问题访问管理功能 | 用于描述初始访问的高层技术分类；不代表具体漏洞根因已经公开 |
| T1552 | Unsecured Credentials，不安全凭据 | 攻击者搜寻直接保存在APIM配置中的秘密和Named Values | 作为凭据暴露的父技术映射；该行为不是Cloud Instance Metadata API访问，因此不应误写为T1552.005；Key Vault中的秘密读取另见T1555.006 |
| T1528 | Steal Application Access Token，窃取应用程序访问令牌 | 未知攻击者积极搜寻访问令牌，微软列出直接管理API令牌等潜在暴露对象 | 对应以应用或API访问令牌为目标的凭据获取行为 |
| T1078.004 | Valid Accounts: Cloud Accounts，有效账户：云账户 | Anders Kristiansen公开的部分IP几乎专门出现在使用已窃取秘密的服务主体登录活动中 | 用于描述攻击者以合法云应用身份完成登录的后续访问方式 |
| T1550.001 | Use Alternate Authentication Material: Application Access Token，使用备用认证材料：应用程序访问令牌 | 已窃取令牌可能被直接用于访问其授权资源 | 仅在日志显示直接使用或重放已窃取令牌时采用；不能仅凭一次服务主体登录就套用该技术 |
| T1555.006 | Credentials from Password Stores: Cloud Secrets Management Stores，从密码存储区获取凭据：云秘密管理存储 | 调查范围包括APIM所引用的Azure Key Vault | 仅在SecretGet等记录证实秘密值被读取时映射；SecretList返回的是标识和元数据，不是秘密值 |

现有公开事实不支持额外添加数据渗出、破坏或勒索等影响类技术，上述映射也不代表Equinor或Skagerak Energi已经确认发生表中的全部后续行为。

附录B：失陷指标（IoC）

以下指标由云安全研究员Anders Kristiansen公开。其观测时间为 **2026年11月8日至21日，** 主要关联使用已窃取秘密的服务主体登录活动。

113.120.71\[.\]142

113.120.72\[.\]185

113.120.73\[.\]59

113.120.73\[.\]129

113.120.73\[.\]179

113.120.75\[.\]179

113.120.83\[.\]43

113.120.83\[.\]169

113.120.114\[.\]162

113.120.114\[.\]171

113.120.114\[.\]186

113.120.114\[.\]253

113.120.115\[.\]19

113.120.115\[.\]72

113.124.8\[.\]141

113.124.9\[.\]66

113.124.9\[.\]154

113.124.9\[.\]246

123.168.77\[.\]28

222.173.70\[.\]66

研究人员还观察到，攻击者使用下列网段中的其他地址：

113.120.0\[.\]0/16

113.124.0\[.\]0/16

123.168.0\[.\]0/16

120.221.0\[.\]0/16

222.173.70\[.\]0/24

另有两个地址被用于访问Key Vault、Storage和APIM网关，并伴随特定User-Agent：

|     |     |     |
| --- | --- | --- |
| 类型  | 指标  | 关联行为 |
| IPv4 | 23.162.24\[.\]134 | Key Vault、Storage及APIM网关访问 |
| IPv4 | 23.162.24\[.\]135 | Key Vault、Storage及APIM网关访问 |
| User-Agent | curl/7.88.1 | 与上述两个地址的相关访问活动同时出现 |

这些地址可能同时承载合法流量，curl/7.88.1也属于常见客户端标识。建议将其作为日志狩猎线索，与目标资源、调用身份、操作类型和时间线联合判断； **不建议仅凭网段或User-Agent直接封禁，也不应把单次命中等同于确认失陷。**

目前公开资料未提供可信的恶意域名、文件哈希或恶意样本指标。

附录C：日志检测与狩猎矩阵

|     |     |     |
| --- | --- | --- |
| 日志源／常见表 | 重点字段或操作 | 需要寻找的异常 |
| Azure Activity Log／AzureActivity | Caller、CallerIpAddress、OperationNameValue、ActivityStatusValue | 非预期主体执行namedValues/listValue、subscriptions/listSecrets、tenant/listSecrets、identityProviders/listSecrets，或修改策略、用户、身份提供者和门户设置 |
| APIM网关日志／ApiManagementGatewayLogs或AzureDiagnostics | ApimSubscriptionId、CallerIpAddress、ApiId、IsTraceRequested、IsTraceAllowed | 新出现的订阅标识、异常来源地址、突发API调用，以及非预期的追踪请求；订阅标识本身不是密钥 |
| Entra服务主体登录／AADServicePrincipalSignInLogs | AppId、ServicePrincipalName、IPAddress、Location、ResourceDisplayName、ResultType | APIM关联应用从基线外地址登录，短时访问多个异常资源，或在凭据轮换前后出现登录模式突变 |
| Key Vault审计／AZKVAuditLogs或AzureDiagnostics | OperationName、RequestUri、CallerIpAddress、<br><br>身份声明、HTTP状态码 | 非预期调用者成功执行SecretGet，或集中执行秘密列举；需将拒绝请求与成功读取分开统计 |
| Microsoft Graph活动／MicrosoftGraphActivityLogs | AppId、RequestUri、RequestMethod、ResponseStatusCode、IPAddress | 关联应用枚举用户、组、应用或服务主体，读取邮件，或执行其他超出日常职责的调用 |
| 开发者门户日志／APIMDevPortalAuditDiagnosticLog | RequestPath、RequestMethod、ResponseCode、HashedUserId | 本应停用的门户仍有活动，或出现注册、确认及账户变更请求；该表没有来源IP字段，需要与其他日志关联 |

检测落地时应先核对工作区的实际表结构和目标表模式。资源专用表与AzureDiagnostics的字段可能存在差异，直接复制查询而不做模式适配，容易产生漏报。

推荐按以下顺序串联线索：  
**APIM配置操作 → 门户或网关活动 → 应用登录 → Key Vault／Graph／后端资源访问。**

其中，直接管理API调用不会进入ARM Activity Log，不能把该日志源当作所有APIM管理访问的完整记录。

08 参考链接

1.  Equinor：Cyber-attack stopped  
    https://www.equinor.com/news/20261711-equinor-detected-cyber-attack
2.  挪威国家安全局（NSM）：NSM deler tiltak mot sårbarhet i Azure API Management  
    https://www.nsm.no/aktuelt/nsm-deler-tiltak-mot-sarbarhet-i-azure-api-management
3.  Skagerak Energi：Oppdatering på forsøk på cyberangrep  
    https://www.skagerakenergi.no/presse/pressemeldinger/oppdatering-pa-forsok-pa-cyberangrep
4.  BleepingComputer：Microsoft Azure flaw exploited to steal customers' API credentials  
    https://www.bleepingcomputer.com/news/security/microsoft-azure-flaw-exploited-to-steal-customers-api-credentials/
5.  The Register：Norway links energy firm cyberattacks to critical Azure API Management flaw  
    https://theregister.com/security/2026/11/23/norway-links-energy-firm-cyberattacks-to-critical-azure-api-management-flaw/5311598
6.  Anders Kristiansen：Azure API Management advisory—what to check and how to hunt after recent attacks  
    https://anderskristiansen.com/post/2026/apim-legacy-access/
7.  Microsoft Learn：Secure your Azure API Management deployment  
    https://learn.microsoft.com/en-us/azure/api-management/secure-api-management
8.  Microsoft Learn：How to use Named Values in Azure API Management policies  
    https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-properties
9.  Microsoft Learn：Direct management API retirement（March 2025）  
    https://learn.microsoft.com/en-us/azure/api-management/breaking-changes/direct-management-api-retirement-march-2025
10.  MITRE ATT&CK：T1190、T1552、T1528、T1078.004、T1550.001、T1555.006  
     https://attack.mitre.org/techniques/T1190/  
     https://attack.mitre.org/techniques/T1552/  
     https://attack.mitre.org/techniques/T1528/  
     https://attack.mitre.org/techniques/T1078/004/  
     https://attack.mitre.org/techniques/T1550/001/  
     https://attack.mitre.org/techniques/T1555/006/

安全事件分析研判 · 目录
