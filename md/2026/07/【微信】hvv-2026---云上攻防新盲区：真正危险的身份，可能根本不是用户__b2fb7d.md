---
title: 【微信】hvv 2026 - 云上攻防新盲区：真正危险的身份，可能根本不是用户
source: https://mp.weixin.qq.com/s/7guWyWyY04FZ1RkPnpSYrQ
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T08:44:52+08:00
trace_id: 6cab747b-1376-4435-9ac5-34817a739f47
content_hash: c35d05b7fb05c6e73b6e22fb18c9020aca13534adf6942c952078764bb2dacbf
status: summarized
tags:
  - 微信
  - 云身份安全
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 云安全边界应从监控用户登录转向审查服务身份替用户办事的信任关系，CVE-2025-55241 漏洞暴露了 Azure AD Graph 未绑定 Actor Token 租户一致性的缺陷，国内云需类似检查角色信任策略。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3a575244-d011-817a-b8c4-fc6ddd482edd
ioc:
  cves:
    - CVE-2025-53786
    - CVE-2025-55241
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 云安全边界应从监控用户登录转向审查服务身份替用户办事的信任关系，CVE-2025-55241 漏洞暴露了 Azure AD Graph 未绑定 Actor Token 租户一致性的缺陷，国内云需类似检查角色信任策略。
> 
> - **漏洞核心**：CVE-2025-55241 中，Azure AD Graph 未校验 Actor Token 来源租户与目标租户一致性，允许攻击者用自有租户 Token 模拟目标租户用户。
> - **攻击机制**：通过 Exchange Hybrid 证书获取 Actor Token，构造未签名模拟身份，绕过 MFA 和 Conditional Access，模拟全局管理员。
> - **关键教训**：云安全需关注“谁替谁办事”，临时凭证和角色信任策略易被滥用，权限提升发生在 Token 解释层而非登录层。
> - **国内云启示**：阿里云 RAM 角色、腾讯云 CAM 角色、华为云 IAM 委托存在类似信任机制，需检查信任主体绑定，防止过宽权限。
> - **防御建议**：审计服务身份调用链，确保日志能追溯原始主体，并限制角色信任策略以最小化跨账号风险。

**天黑说嘿话** *2026年7月22日 08:17*

如果你在国内做过云上 HVV 值守，下面这些东西大概率已经被盯得很紧：主账号异地登录、RAM/CAM/IAM 子账号提权、AK/SK 泄露、新增访问密钥、陌生 IP 调 OpenAPI。

但 Dirk-jan Mollema 这次挖到的链路，偏偏绕开了这些最熟悉的信号。

目标全局管理员没有登录，MFA 没有弹窗，Conditional Access 没有放过一台陌生设备。攻击者拿的是自己实验租户里的一张服务 Token，却曾经可以跑到另一个 Entra ID 租户里，替那里的任意用户说话。把 `nameid` 换成全局管理员对应的 `netId` ，Azure AD Graph 返回的就是管理员权限下的数据。

我第一次翻完这 74 页，印象最深的不是“Impersonating the Global Admin”那张成功截图，而是前一页的报错：

> User not found... but token accepted?

用户没找到，Token 却先被认了。

这句话几乎把整个漏洞说透：微软验了 Token 的签名，也认出了发起方是一项受信服务，但它没有把“这张 Token 从哪个租户来”与“它正准备替哪个租户的用户办事”牢牢锁在一起。

![AREA41 2026 原版演讲稿封面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/799cd6531938e217.jpg)

*图 1：AREA41 2026《Hacking Every Entra ID Tenant With Actor Tokens》原版封面。报告共 74 页，本文按研究过程还原，而不是逐页翻译。*

2026 年 6 月，Dirk-jan 在 AREA41 公开了《Hacking Every Entra ID Tenant With Actor Tokens》。研究从 Exchange Hybrid 服务器上的一张证书开始，沿着微软旧式 Service-to-Service 身份链一路往里走，最后碰到 Azure AD Graph 的跨租户校验缺口。微软给它分配了 **CVE-2025-55241** ，核心问题已在 2025 年 7 月修复。

这不是一篇“复现一个过期 CVE”的文章。真正值得国内云上团队细看的，是它揭出的那类问题：

**当云服务、云主机、混合组件或第三方平台可以代表账号获得临时身份时，安全边界已经从“谁拿到了密码”移到了“谁被允许替谁办事”。**

阿里云 RAM 角色、腾讯云 CAM 角色、华为云 IAM 委托的协议与微软 Actor Token 各不相同，公开资料也没有显示三家存在 CVE-2025-55241 这一实现缺陷。这里要类比的是信任形状：可信主体、角色或委托、临时凭证、目标资源之间，只要有一处绑定过宽、对象认错或旧接口少验了一个关系，攻击者拿到的就可能不是一台云主机，而是一段跨账号、跨服务的控制面权限。

国内云上演练经常把“账号是否登录”当成起点。这份 PPT 提醒我们，还有另一种起点：

```
服务凭据 / 实例身份 / 第三方委托
              ↓
       申请临时服务身份
              ↓
      代表用户或账号访问资源
```

接下来就沿着作者的原始研究路线，看清 Actor Token 到底是什么、Azure AD Graph 少验了哪层关系，以及这件事换成 RAM、CAM、IAM 的语言后，国内云上攻防该查什么。

* * *

## 74 页 PPT 其实只追了一个问题：云的安全边界到底画在哪

Dirk-jan 的研究不是从 Actor Token 开始，而是从 Entra Connect 和 Exchange Hybrid 这些“本地系统替云端做事”的组件开始。

传统认知里，本地 AD 与 Entra ID 中间有一道清晰边界：本地管理员权限很高，但云端租户仍有独立身份、独立策略和独立密钥。早期 Entra Connect 的高权限同步账号让这道边界变得很薄；微软持续收紧同步账号权限后，研究似乎走到了尽头。

![本地 AD 与 Entra ID 的安全边界假设](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/adaa9547515a17cf.jpg)

*图 2：PPT 第 6 页的原始假设——本地 Active Directory 与云端 Entra ID 之间应存在一条可验证的安全边界。后续研究不断追问：哪些混合组件仍横跨这条线？*

于是研究视角换了一个方向：除了同步服务，还有什么本地组件会以微软云服务的身份说话？

答案是 Exchange Hybrid。

整份 PPT 大致可以压缩成五段：

| 页码  | 研究阶段 | 真正要回答的问题 |
| --- | --- | --- |
| 4—18 | Entra Connect 旧权限回顾 | 本地同步身份是否仍能改写云端关键策略 |
| 19—28 | Exchange Hybrid 与共享服务主体 | 本地 Exchange 证书能代表哪个云端服务 |
| 29—43 | ACS、Actor Token 与 S2S 委派 | 微软后端如何替用户访问另一个服务 |
| 44—71 | Azure AD Graph 跨租户校验 | 为什么租户 A 的服务 Token 会被租户 B 接受 |
| 72—74 | 披露、修复与后续收口 | 微软最终在哪几层切断了这条链路 |

作者先从一台混合 Exchange 服务器上的证书入手。在旧式混合配置中，本地 Exchange 会持有与 Exchange Online 服务主体相关的证书凭据，用于 OAuth 与“丰富共存”场景。

![导出 Exchange Hybrid 证书的研究截图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d90cb8f2c75c954.jpg)

*图 3：PPT 展示的 Exchange Hybrid 证书导出界面。它是研究的起点：本地私钥一旦代表云端一方服务，边界就不再只是“本地账号同步到云”。*

这张图的重点不是“证书可以导出”，而是证书背后的身份语义：

> 一台本地 Exchange 服务器保存的私钥，曾经可以让持有者向云端证明“我是 Exchange Online 这个微软一方应用”。

从红队视角看，这是典型的控制面升级。拿到服务器权限只是主机失陷；拿到能代表一方服务的凭据，触碰的却是云身份信任。

![从 OAuth 入口追到服务凭据的思考链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dc79ee0751c98e58.jpg)

*图 4：作者的研究推导：共享 Exchange Online 服务主体存在本地重定向地址，本地 Exchange 可执行 OAuth，完成应用身份认证需要证书或密钥，因此继续追踪这些凭据还能用于哪些客户端凭据流程。*

不过，把这段历史直接总结成“攻破一台 Exchange，就能拿下所有租户”仍然失真。

作者后来明确说明：跨租户漏洞验证时，Actor Token 来自他自己的实验租户；在实验环境中，他也可以直接给 Exchange Online 服务主体添加凭据，并不依赖完整的混合 Exchange 部署。Exchange Hybrid 是他找到协议的入口， **不是 CVE-2025-55241 横跨任意目标租户的必要前置条件** 。

这一区分很关键：

-   **Exchange Hybrid 风险**
    
    解释了攻击者怎样接触一方应用凭据和 Actor Token 机制；
    
-   **Azure AD Graph 租户校验缺口**
    
    解释了为什么攻击者自有租户生成的 Token 会穿透到另一个租户。
    

两段接起来，才是完整故事。

* * *

## Actor Token 不是用户门票，而是“微软服务替用户办事”的委托书

正常用户访问云服务时，Token 里会写清楚谁登录、面向哪个资源、由哪个租户签发、拥有哪些权限。资源端再校验签名、受众、签发者、租户和主体。

Actor Token 处理的是另一类场景：Exchange Online 需要代表某个用户去访问 SharePoint、Azure AD Graph 或其他微软后端服务。用户本人不一定再次参与认证，于是后端服务需要一套 Service-to-Service，简称 S2S 的委派机制。

PPT 第 29 页把签发方指向旧式 Access Control Service，也就是 ACS。

![ACS 签发 Actor Token 的服务间通信流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/957a0e04d66ef018.jpg)

*图 5：本地 Exchange 向 ACS 请求 Actor Token，云端服务再把 Actor Token 与一个用户模拟身份组合起来访问其他资源。*

这套机制里实际叠了两层 JWT。

外层是 **Actor Token** ：

-   由 Entra ID/ACS 使用 RS256 签名；
    
-   `aud`
    
    指向要访问的微软资源，例如 Azure AD Graph；
    
-   `iss`
    
    和 `aud` 中都能看到签发租户信息；
    
-   有效期精确到 24 小时；
    
-   `trustedfordelegation=true`
    
    表示持有它的一方服务可以代表用户行动。
    

![解码后的 Actor Token](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/93c9b1feb4564797.jpg)

*图 6：PPT 中的 Actor Token。红框标出了 Azure AD Graph 受众、签发租户以及 `trustedfordelegation=true` 。外层 Token 本身带有微软签名。*

内层是 **Impersonation Token** ，也就是模拟身份 Token：

-   JWT 头部是 `alg: none` ；
    
-   内部嵌入已经签名的 Actor Token；
    
-   `nameid`
    
    指向将被模拟的用户；
    
-   `upn`
    
    、 `smtp` 、 `sip` 等字段由发起服务在本地填写；
    
-   这层没有独立签名。
    

![本地生成的未签名用户模拟 Token](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8afc1264a95e9272.jpg)

*图 7：Exchange Online 使用的未签名 Bearer Token。外层红框是嵌入的 Actor Token，下面的 UPN、SMTP、SIP 与 `nameid` 描述被模拟用户。*

看到 `alg: none` ，很多人第一反应是“JWT 未签名漏洞”。这个判断只说对了一半。

设计者的信任模型是： **内层身份描述虽然未签名，但它被一个已经签名、且允许委派的一方服务 Token 包裹。** 资源端信任的不是任意人提交的明文，而是“拥有合法 Actor Token 的微软服务有资格选择它要代表的用户”。

所以问题不只是少了一段签名。真正危险的是下面四件事叠在一起：

```
一方服务拥有广泛委派资格
        +
模拟用户的字段可在本地构造
        +
Token 24 小时内缺少即时撤销能力
        +
资源端没有把来源租户与目标租户牢牢绑定
```

![S2S Actor Token 的关键属性](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6f952088fe85b873.jpg)

*图 8：PPT 总结的 S2S Token 属性：24 小时有效、本地生成模拟身份、签发侧缺少有用日志、可代表租户内用户，并绕开普通用户的 Conditional Access 检查。*

在单租户模型里，这已经是一项高权限后端能力；一旦资源端把租户边界验松，影响就会从“这个服务可代表本租户用户”瞬间变成“这个服务可代表别的租户用户”。

* * *

## 真正致命的不是 Token 权限高，而是 Azure AD Graph 把两本户口簿串错了

2025 年 7 月，作者为了准备 Black Hat 与 DEF CON 演示，开始改动模拟身份 Token 里的不同字段，观察 Azure AD Graph 会拒绝什么。

他先为 Azure AD Graph 申请了 Actor Token。

![面向 Azure AD Graph 的 Actor Token](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e65e96ad97781f9f.jpg)

*图 9：PPT 中面向 `graph.windows.net` 的 Actor Token，受众已经从 Exchange 等资源切换到旧式 Azure AD Graph。*

接着，他没有改动带微软签名的外层 Actor Token，只把未签名模拟身份里的租户 ID 换成另一个测试租户。

![只修改内层模拟身份 Token 的租户 ID](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a1eaeaf9115a4296.jpg)

*图 10：外层签名 Token 仍来自租户 A，内层模拟身份却写成租户 B。按正常租户隔离逻辑，这里应直接因来源与目标不匹配而终止。*

预期结果应该是“租户不匹配”或“Token 无效”。实际返回却是： **用户不存在。**

![跨租户 Token 被接受后的用户不存在报错](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a711f99e88ce058d.jpg)

*图 11：错误信息的危险之处在于，它没有否定 Token，而是在目标租户里查找用户。换句话说，认证层已经接受了来自另一个租户的 Actor Token。*

这条报错几乎把漏洞根因直接写了出来：

```
预期校验：
签名有效
AND Actor Token 的来源租户 == 模拟身份的目标租户
AND 用户属于该租户

实际效果：
签名有效
AND 在“模拟身份指定的租户”里能找到对应 nameid/netId
```

中间最关键的绑定丢了：

```
actor_token.origin_tenant == impersonation_token.target_tenant
```

这不是“完全没验 Token”。Azure AD Graph 验证了微软签名，识别出这是可委派的一方服务，也尝试解析目标用户；它只是没有把 **谁获得了这张服务通行证** 与 **这张通行证正准备进入哪个租户** 锁成同一件事。

安全工程里最棘手的漏洞往往正是这种“每个字段都验了，但字段之间的关系没验”。

微软当前身份平台文档要求 API 同时验证受众、签发者、租户、主体以及 Actor 等声明。单项字段正确只是起点，跨字段的一致性才决定 Token 是否属于当前安全边界。

* * *

## UPN 在这里是烟雾弹，真正开门的是 netId

漏洞撞出来以后，攻击链还差一个目标用户标识。

很多 Entra 攻防人员习惯盯 `objectId` 、UPN 或邮箱地址。Azure AD Graph 在处理这类模拟身份 Token 时，真正关心的却是 `nameid` 。这个值对应旧 Azure AD Graph 用户对象里的 `netId` ，在用户 Token 中又会以 `puid` ，即 Passport UID 的形式出现。

作者验证了一个很反直觉的现象：

-   `upn`
    
    可以写成无意义字符串；
    
-   `sip`
    
    、 `smtp` 同样不是 Azure AD Graph 识别用户的关键；
    
-   只要 `nameid/netId` 对应目标租户里的真实用户，模拟身份就能成立。
    

这意味着攻击者不需要知道全局管理员密码，甚至不需要先拿到管理员 UPN。历史链路只需要：

```
TARGET_TENANT_ID
+
任意有效用户的 TARGET_NETID
+
攻击者自有租户签发的有效 ACTOR_TOKEN
```

拿任意普通用户身份进入目录读取面后，再查询角色成员及其 `netId` ，就能把模拟身份切换成全局管理员。

![使用 netId 模拟全局管理员](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b2230745f621392b.jpg)

*图 12：PPT 演示先获取目标全局管理员的 `netId` ，再用同一个 Actor Token 构造其模拟身份，随后由 Azure AD Graph 返回租户目录数据。*

这也是 CVE-2025-55241 危害极高的原因： **权限提升发生在 Token 解释层，而不是账号登录层。**

常规账号保护解决的是“怎样证明你是这个用户”；这条链路利用的却是“一个受信后端服务是否有权替这个用户说话”。两者处在不同控制平面。

PPT 把前置条件压缩成两个公开或可推导的值：目标租户 ID 与一个有效 `netId` 。

![跨租户模拟所需的两个标识](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/eca8691d32313d0c.jpg)

*图 13：PPT 列出的历史前置条件。租户 ID 可由公开域名解析， `netId` 则可能来自旧 Token、日志、截图或 B2B 对象关系。*

作者还指出 `netId` 具有递增特征，理论上可在历史接口上做范围探测。这里更值得关注的不是探测速度，而是一个架构教训： **内部遗留标识一旦承担身份绑定职责，就不应同时具备可预测、可外泄、跨租户复用三种属性。**

一个过期 Token 的签名即使早已失效，里面的 `puid` 仍可能泄露长期稳定的身份映射值。Token 脱敏如果只遮住签名、不处理声明内容，依旧会留下可复用情报。

* * *

## B2B 原本是协作关系，在这个漏洞里却变成了一张“租户跳板图”

`netId` 最“骚”的来源并不是爆破，而是 Entra B2B 自己维护的访客映射。

假设租户 B 的用户被邀请到租户 A。为了把 A 中的 Guest 对象与 B 中的 Home Account 对上，租户 A 的访客对象会在 `alternativeSecurityIds` 中保存用户在主租户里的身份映射，其中就包含 `netId` 。

![Guest 账户 alternativeSecurityIds 中的身份映射](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/11d2869f1e6ead9e.jpg)

*图 14：PPT 展示 Guest 对象的 `alternativeSecurityIds` 。它承担跨租户账号关联，历史漏洞却把这项正常设计转化成了 `netId` 情报源。*

于是邀请方向与攻击扩散方向形成了一个反向关系：

```
正常邀请：租户 B 的用户 → 成为租户 A 的 Guest
历史攻击：从租户 A 读取映射 → 回到租户 B 模拟其 Home Account
```

![B2B 邀请关系中的反向跨租户模拟](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2c591cae271155e1.jpg)

*图 15：资源租户 A 保存了来自主租户 B 的 Guest 映射。漏洞存在时，读取映射的一方可沿邀请关系反向定位用户的主租户身份。*

注意，B2B 设计本身不是这项 CVE 的根因。 `alternativeSecurityIds` 需要保存跨租户映射，才能让外部身份正确落到 Guest 对象。真正的问题仍是 Azure AD Graph 接受了来源租户不一致的 Actor Token。

但当两者叠加后，组织间协作关系就从“通讯录”变成了图数据库：

-   企业租户里通常存在供应商、外包、审计、客户和合作伙伴 Guest；
    
-   MSP 与安全服务商往往同时连接大量客户；
    
-   微软顾问、合作伙伴和大型客户之间存在复杂邀请关系；
    
-   任何一个节点读到的 `alternativeSecurityIds` ，都可能指向更多主租户。
    

PPT 第 71 页把这种扩散画成一张惊人的图：从一个普通租户跳到微软租户，再顺着 MSP 与合作伙伴关系接触更多客户。

![B2B 关系可能形成的租户级扩散图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bed9591ebd43f39e.jpg)

*图 16：作者对 B2B 信任图扩散的推演。它说明影响为何具备平台级规模，但这张图是协议与关系模型推导，并非对这些外部租户的实际入侵记录。*

这张图最容易被媒体过度解读。事实边界如下：

-   作者在自己拥有权限的多个测试租户里验证了跨租户读取与模拟；
    
-   B2B 的单步身份映射机制也在自有环境中验证；
    
-   作者没有沿现实合作关系批量访问外部租户数据；
    
-   “几分钟扩散到大量租户”是基于关系图密度与调用次数的技术推演；
    
-   国家云使用独立签名密钥，公共云跨到国家云的路径未测试，作者明确把相关判断标为推测。
    

把“已验证”“可推导”和“未测试”分开，反而更能看清漏洞的分量：它不需要靠夸张案例证明危害，协议本身已经给出了平台级失陷上限。

* * *

## MFA 为什么没有响？因为攻击从头到尾都没问过用户

许多复盘会在这里追问：如果全局管理员强制抗钓鱼 MFA、限制合规设备、禁止旧认证，这条链路为什么还成立？

因为这些控制围绕的是 **用户获得会话** 的过程：

```
用户登录
→ 密码 / 无密码凭据
→ MFA
→ Conditional Access
→ 设备、位置、风险判断
→ 签发用户 Token
```

Actor Token 走的是另一条路：

```
一方服务凭据
→ ACS / S2S Actor Token
→ 本地生成用户模拟身份
→ 资源端接受服务代表用户行动
```

第二条链路里没有新的交互式登录，也没有让被模拟用户完成 MFA。资源端看到的是“微软后端服务正在代表用户办事”，而不是“陌生设备上的用户正在登录”。

因此它天然绕开了很多人熟悉的身份告警：

-   不产生目标用户的异常登录事件；
    
-   不触发 MFA 挑战；
    
-   不经过用户设备合规判断；
    
-   Actor Token 在 24 小时有效期内缺少常规会话撤销抓手；
    
-   读取 Azure AD Graph 时缺少足够的 API 级租户审计。
    

这不表示 MFA 或 Conditional Access 价值下降。它说明云身份保护还要覆盖第三类主体： **机器身份与一方服务身份。**

微软在 2025 年 7 月公开的 High Privilege Access，简称 HPA 治理文章里，把这类问题定义为服务间存在过宽权限，服务可以在缺乏真实用户上下文证明的情况下代表任意用户。微软称其已处理超过 1000 个 HPA 场景，并投入 200 多名工程师重构服务间认证、最小权限和监控。

这组数字从侧面说明，Actor Token 不是一段孤立的旧代码，而是大型 SaaS 平台长期演进中“后端为了兼容和效率积累高权限捷径”的一个代表。

* * *

## 最危险的不是全程没日志，而是日志只在最后一刀出现

作者对可见性的描述非常克制：

-   Actor Token 签发没有租户管理员可用的日志；
    
-   未签名模拟身份在服务本地生成，也没有独立签发日志；
    
-   旧 Azure AD Graph 的读取缺少成熟 API 级审计；
    
-   真正修改目录对象时，通常会产生 Entra AuditLogs。
    

这会造成一种非常不利的时间线：

```
获得 Actor Token           目标租户看不见
定位普通用户 netId         可能看不见
读取目录与角色             可能看不见
切换为 Global Admin        可能看不见
创建账号/改应用/授予权限     这里才开始留下审计
```

即使最后一步留下日志，发起者字段也可能显得很古怪：被模拟全局管理员的 UPN 与 “Office 365 Exchange Online” 等一方应用显示名同时出现。不了解 Actor Token 的分析人员，很容易把它理解成“管理员通过 Exchange 做了正常变更”。

作者与防守研究人员给出了一条历史狩猎查询：

```rust
AuditLogs
| where not(OperationName has "group")
| where not(OperationName == "Set directory feature on tenant")
| where InitiatedBy has "user"
| where InitiatedBy.user.displayName has_any (
    "Office 365 Exchange Online",
    "Skype for Business Online",
    "Dataverse",
    "Office 365 SharePoint Online",
    "Microsoft Dynamics ERP"
)
```

这里排除部分组操作，是因为 Exchange 等产品确实会代表用户执行合法组管理。落地时更建议增加三层关联：

-   **对象敏感度**
    
    ：角色、服务主体凭据、应用权限、域、联合身份、Conditional Access 策略；
    
-   **发起者一致性**
    
    ：显示名是一方服务，UPN 却是高权限个人账号；
    
-   **后续行为**
    
    ：紧接着出现新身份登录、应用凭据认证、邮件或文件批量访问。
    

同时应保留一个判断边界：微软称其内部遥测没有发现 CVE-2025-55241 被实际滥用。狩猎命中只代表行为值得复核，不等于已经发现该漏洞攻击。

* * *

## 微软修的不是一个 if，而是三层旧信任

PPT 第 72 页给出了非常紧凑的披露时间线：

![CVE-2025-55241 披露与修复时间线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e8a336449d473227.jpg)

*图 17：作者公开的时间线。2025 年 7 月 14 日上报，7 月 17 日全球修复，8 月 6 日进一步阻断服务主体凭据为 Azure AD Graph 申请 Actor Token，9 月 4 日分配 CVE-2025-55241。*

修复可以分成三层理解。

### 资源端重新绑定租户

最直接的修复发生在 Azure AD Graph：资源端必须把 Actor Token 的来源租户与模拟身份的目标租户绑定，不再接受跨租户拼接。

这是 CVE-2025-55241 的核心修复，也是 2025 年 7 月 17 日快速全局上线的部分。

### 切断外部服务主体申请旧 Graph Actor Token 的路径

2025 年 8 月 6 日，微软进一步阻止使用存储在服务主体上的凭据为 Azure AD Graph 请求 Actor Token。这一步把攻击入口从“任何掌握相关一方应用凭据的租户”收回到微软内部受控服务。

即使未来别的资源端再出现类似租户绑定差错，外部持有者也少了一种获取高委派 Token 的方式。

### 淘汰共享 Exchange 身份，压缩后端 HPA

Exchange Hybrid 随后迁移到每个客户独立的专用应用，不再让所有租户围绕同一个 Exchange Online 共享服务主体建立高价值凭据关系。PPT 还指出，Actor Token 后续已不再被 Exchange Online 与 SharePoint Online 接受，后端使用范围持续缩减。

![Actor Token 与 Exchange Hybrid 的后续收口](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4a275ec1f67021bf.jpg)

*图 18：PPT 最后一页技术结论：Exchange Hybrid 必须使用拆分后的专用服务主体，共享服务主体退出；Exchange Online 与 SharePoint Online 不再接受 Actor Token，后端使用量继续下降。*

这三层分别对应三个工程问题：

| 层级  | 旧问题 | 收口方向 |
| --- | --- | --- |
| Token 校验 | 来源租户与目标租户没有强绑定 | 资源端做完整声明与关系校验 |
| Token 签发 | 外部服务主体凭据可获得高委派 Actor Token | 限制签发主体、受众与凭据类型 |
| 平台架构 | 多租户共享高价值一方服务身份 | 每租户专用应用、最小权限、持续监控 |

真正成熟的修复从来不是只补报错位置，而是同时减少同类漏洞再次出现时的爆炸半径。

* * *

## 别把 CISA 的紧急指令和这个 CVE 混成一件事

PPT 时间线在 2025 年 8 月 7 日写了 CISA Emergency Directive，容易让二手文章产生一个错误：把 CISA ED 25-02 直接说成针对 CVE-2025-55241。

它们有关联，但不是同一漏洞：

-   **CVE-2025-55241**
    
    ：本文讨论的 Actor Token 与 Azure AD Graph 跨租户校验问题；
    
-   **CVE-2025-53786**
    
    ：Exchange Hybrid 相关风险，触发 CISA 在 2025 年 8 月 7 日发布 ED 25-02，要求美国联邦机构处理本地 Exchange 与 Exchange Online 之间的高信任关系。
    

两者都触及 Exchange Hybrid、一方服务身份和云端信任，因此处在同一轮架构收口中。PPT 把 CISA 指令放进时间线，是因为它推动了 Exchange Hybrid 服务主体迁移，而不是给 CVE-2025-55241 换了一个编号。

这类交叉时间线最考验文章质量。只看一张 PPT 截图，很容易把“同月发生”写成“同一事件”；回到 CISA 公告与微软修复说明，才能把因果关系摆正。

* * *

## 把微软的 Logo 遮住，这条链在国内云上长什么样

先说清楚：下面不是给阿里云、腾讯云、华为云套漏洞编号，也不是声称它们存在 Actor Token 同类缺陷。三家的公开文档展示的是正常角色与委托机制。我们借这些机制做的是威胁建模： **同样一张“服务替账号办事”的信任图，放到国内云里会落在哪些对象上。**

微软这条历史链路可以写成：

```
Exchange Hybrid 证书
→ Exchange Online 一方服务身份
→ ACS 签发 Actor Token
→ 本地构造用户模拟身份
→ Azure AD Graph 接受跨租户上下文
```

换到国内常见云环境，名字会变，骨架并没有变：

```
云主机 / 容器 / CI/CD / SaaS / MSP
→ RAM角色 / CAM角色 / IAM委托
→ STS临时凭证
→ 代表当前账号访问另一个云服务或账号
```

真正该查的不是“有没有一张叫 Actor Token 的东西”，而是下面四个关系有没有被锁死：

| 该绑定的关系 | 配松后的结果 |
| --- | --- |
| 临时凭证属于哪个账号 | 账号 A 的身份上下文被带到账号 B |
| 哪个主体有权扮演角色 | 一个服务、整个账号或第三方平台获得过宽入口 |
| 角色能访问哪些资源 | 拿到一台主机后顺着角色摸到存储、数据库、密钥与审计 |
| 日志记录的是服务还是实际操作者 | 变更看起来像正常云产品代操作，人员责任链断掉 |

这四个问题，比死记某家云的产品名更重要。

### 阿里云：别只查 AK/SK，先看 RAM 角色到底信了谁

阿里云 RAM 角色的信任策略里， `Principal` 决定谁可以调用 `sts:AssumeRole` 。可信实体可以是另一个阿里云账号、指定 RAM 用户或角色、阿里云服务，也可以是 SAML 身份提供商。

这套设计本身就是为跨账号和服务代操作准备的。风险往往出在“为了省事，把可信主体写大了”。

例如，信任策略里的主体如果指向另一个账号的 `root` ，含义不是只信任那个账号的主账号，而是允许该账号下满足授权条件的 RAM 身份进入这条角色扮演链。再叠加一条宽泛的 `sts:AssumeRole` 权限，原本只给某套交付系统的通道，就可能被账号内更多身份使用。

国内攻防现场更值得查这些位置：

-   RAM 角色信任策略里是否出现整账号信任，而业务实际只需要一个角色；
    
-   SaaS、代维、审计、备份平台使用的跨账号角色有没有外部标识与来源约束；
    
-   ECS、函数计算、容器工作负载使用的实例角色是否顺手挂上了管理类系统策略；
    
-   服务关联角色的权限是否随着产品停用一起退出；
    
-   角色会话取得临时凭证后，ActionTrail 里能否还原到最初的人员、流水线或工作负载。
    

阿里云官方文档明确给出了可信实体为账号、云服务和身份提供商的不同信任策略形态，也说明服务关联角色的权限由对应云服务预定义。对防守方来说，最关键的不是这些角色“合不合法”，而是它们是否还与今天的业务边界一致。

### 腾讯云：CAM 文档已经把最危险的配置写在警告里

腾讯云 CAM 的角色同样分为信任策略与权限策略。信任策略决定谁是角色载体，权限策略决定角色能做什么。云服务或云资源可以通过 STS 获取周期轮换的临时密钥，再调用其他云产品 API。

腾讯云当前文档有一句很直白的提醒：给子账号授予未受限制的 `AssumeRole` 权限后，它可能扮演所有角色，包括服务角色与服务相关角色，极易造成越权。

这句话放到 HVV 场景里，含义很具体：低权限 CAM 子用户原本只负责一个项目，攻击者拿到它后，真正该枚举的并不是“这个用户直接绑定了哪些策略”，还要继续看它能扮演哪些角色、那些角色信了谁、角色背后又挂了哪些服务权限。

尤其要盯三类对象：

-   跨账号运维角色：信任的是整个主账号，还是精确到某个 CAM 子用户或角色；
    
-   第三方平台角色：创建时是否启用了外部 ID，避免多租户 SaaS 出现混淆代理人问题；
    
-   CVM 实例角色：拿到实例内代码执行后，元数据返回的临时密钥能访问哪些云 API。
    

Actor Token 事件里，攻击者从一张服务 Token 跨到了用户身份；在 CAM 场景里，更常见的现实问题是从一台 CVM 跨到实例角色，再从实例角色跨到 COS、云数据库、密钥管理或控制面。主机权限只是第一跳，角色权限才决定云上失陷半径。

### 华为云：委托不是“谁登录了”，而是“谁切换成了谁”

华为云 IAM 的委托与信任委托也遵循相似逻辑。信任委托可以授权给本账号 IAM 用户、另一个账号中的身份、应用程序或云服务；调用 STS `AssumeAgency` 后，得到一组短期 AK/SK 与 `security_token` ，后续访问权限由委托的身份策略和会话策略共同决定。

这里有一个很容易被值守人员忽略的点。华为云新版文档说明：使用 `AssumeAgency` 生成的临时凭证访问资源时，系统评估的是切换后的委托权限，而不是原始用户本身的权限。也就是说，只盯原始用户“看起来权限不高”没有太大意义，还要继续追它能切换到哪些委托。

华为云官方文档也专门提到 `external_id` 用于处理第三方服务商代管资源时的混淆代理人问题。这个设计和国内实际环境高度贴合：集团子公司、云 MSP、等保服务商、托管安全平台，往往通过委托批量管理多个账号。一条过宽的信任策略，影响的可能就不是一个项目，而是一批客户或子账号。

建议把下面几件事放进日常检查：

-   信任委托是否精确限制了调用账号、主体与外部 ID；
    
-   ECS 委托取得的临时 AK/SK 是否只覆盖当前工作负载所需资源；
    
-   CTS 是否记录了委托切换、临时凭证使用和后续敏感操作；
    
-   已下线的 MSP、外包、迁移工具是否仍保留委托关系；
    
-   会话策略是否真正缩小了委托固有权限，而不是每次直接继承全部权限。
    

### 三家云名字不同，最容易被忽略的都是“第二身份”

很多云上权限图有两层。

第一层是人们天天看的身份：主账号、子账号、IAM 用户、联邦用户。第二层则藏在业务背后：实例角色、服务角色、服务关联角色、委托、信任委托、工作负载身份、流水线凭据。

攻击者拿到第一层，蓝队通常很快能看到登录异常；拿到第二层，行为可能表现成：

-   某项云服务在正常调用另一个云服务；
    
-   某台云主机在使用自动轮换的临时凭证；
    
-   某家代维平台在执行客户授予的角色；
    
-   某个 CI/CD 流水线在发布资源；
    
-   某个联邦身份在切换角色或委托。
    

这些动作平时都合法。真正危险的是，日志里如果只剩下“角色做了什么”，却还原不出“谁让它做”，攻击就会被正常运维流量吞掉。

这正是 Actor Token 研究与国内云最值得连起来的地方： **不要只问凭证是否有效，还要问这张凭证背后的原始主体、目标账号和用户上下文是否仍然一致。**

* * *

## HVV 现场别先堆规则，先把一条真实信任链画出来

这份 PPT 看完后，最实用的动作不是再加一张 CVE 表，而是随便挑一个生产业务，把它的云身份调用画到最底。

比如一套部署在云主机上的备份系统：

```
值班人员
→ 堡垒机或流水线
→ 云主机实例身份
→ RAM/CAM角色或IAM委托
→ STS临时凭证
→ 对象存储
→ 密钥管理
→ 另一个账号的备份库
```

然后挨个问：

-   这台主机被拿下后，攻击者能从哪里取得临时凭证；
    
-   临时凭证的账号、项目、区域和资源范围是否足够窄；
    
-   信任策略信的是具体工作负载，还是整个账号或云服务；
    
-   第三方平台代入角色时，有没有每个客户独立的外部 ID；
    
-   角色权限最近一次复核是什么时候；
    
-   调用链跨了账号后，审计日志能否保留最初的人或工作负载；
    
-   回收人员账号时，对应的服务角色、委托、证书和流水线密钥是否一并退出。
    

国内很多单位的云上身份治理停在“主账号开 MFA、子账号不用永久 AK/SK”。这两件事当然要做，但它们只解决入口的一部分。临时凭证比长期密钥更容易轮换，却不会自动带来最小权限；角色比共享账号更容易审计，却不会自动保证信任主体写得够细。

把这次微软漏洞换成国内云的语言，真正值得演练的不是复刻 Actor Token，而是下面三类错位：

```
来源账号与目标账号错位
服务身份与实际操作者错位
角色的可信主体与业务主体错位
```

红队在自己的演练环境里验证这些关系，往往比继续扫一批 AK/SK 更接近云上控制面的真实风险；蓝队则应把 STS、AssumeRole、AssumeAgency、角色信任策略变更、服务关联角色创建、实例身份取证串进同一条时间线。

* * *

## 结尾：国内云真正要防的，不是一张叫 Actor Token 的票

Dirk-jan 这次最漂亮的一步，不是把 JWT 里的租户 ID 换掉，而是看到“User not found”后没有停。

普通测试者会认为用户填错了。他意识到另一件事：既然系统已经开始去目标租户里找用户，就说明来自别的租户的服务 Token 已经越过了第一道门。

这是一种很值得借鉴的云上研究方式。看到一个合法响应时，别只看权限够不够；看它究竟在哪个账号、哪个租户、以谁的身份完成了解析。看到一条正常云服务调用时，也别只看服务名；继续追到它背后的角色、委托、临时凭证和原始操作者。

今天在国内企业里，本地 AD、企业微信或钉钉身份、IDaaS、阿里云 RAM、腾讯云 CAM、华为云 IAM、Kubernetes ServiceAccount、CI/CD 和 MSP 代维账号，早就被接成一张网。真正的边界不在某个登录页面，而在每一条“允许 A 代表 B 去访问 C”的关系里。

微软这次出问题的是 Actor Token 与 Azure AD Graph。换到国内云，值得长期追问的是：

-   RAM 角色究竟信任了哪个账号里的哪些身份；
    
-   CAM 子用户还能扮演哪些服务角色；
    
-   IAM 用户可以切换到哪些委托；
    
-   云主机和容器里的临时凭证能摸到哪些控制面；
    
-   第三方代维退出后，那条跨账号信任有没有真的断；
    
-   审计日志里出现云服务名称时，背后究竟是谁发起的动作。
    

账号密码泄露，大家知道去重置。AK/SK 泄露，大家知道去轮换。

更麻烦的是第三种情况：凭证没泄露，系统也按设计工作，只是那份“谁可以代表谁”的设计已经比今天的业务边界大了一圈。

Actor Token 留给国内云上团队的提醒，可以压成一句话：

**别只盯谁登录了。先查谁正在替谁办事。**

* * *

## 资料与证据来源

-   Dirk-jan Mollema：AREA41 2026 官方 PPT《Hacking Every Entra ID Tenant With Actor Tokens》
    
-   Dirk-jan Mollema：One Token to rule them all — Actor Token 完整研究文章
    
-   Microsoft Security Blog：Enhancing Microsoft 365 security by eliminating high-privilege access
    
-   Microsoft Exchange Team：Exchange Server Security Changes for Hybrid Deployments
    
-   Microsoft Learn：Secure applications and APIs by validating claims
    
-   Microsoft MSRC：CVE-2025-55241
    
-   CISA：ED 25-02 — Mitigate Microsoft Exchange Vulnerability
    
-   阿里云 RAM：修改 RAM 角色的信任策略
    
-   阿里云 RAM：创建可信实体为阿里云服务的 RAM 角色
    
-   腾讯云 CAM：角色基本概念与信任策略
    
-   腾讯云 CAM：创建角色、跨账号与外部 ID
    
-   华为云 IAM：信任委托概述
    
-   华为云 IAM：获取临时安全凭证与 external_id
    

> 事实说明：CVE-2025-55241 的跨租户利用窗口已经修复。文中对阿里云、腾讯云、华为云的讨论是基于各家官方角色、委托与临时凭证机制做的信任链类比，不代表三家存在相同漏洞。B2B 大规模扩散与国家云影响继续按原作者标注为推演或未测试范围。
