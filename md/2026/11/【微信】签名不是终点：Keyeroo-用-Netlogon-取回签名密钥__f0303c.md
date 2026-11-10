---
title: 【微信】签名不是终点：Keyeroo 用 Netlogon 取回签名密钥
source: https://mp.weixin.qq.com/s/Oz_kObjpzDYeZGJMetR-6g
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:44:20+08:00
trace_id: 62fe94cc-1553-4598-98bd-7d86cd776995
content_hash: a240759290a8b8fd74deaa48ec1a33b17828c3489e0e44657c4bda61d4736cac
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41475244-d011-81f5-8653-dd7b9bba4e07
ioc:
  cves:
    - CVE-2026-70229
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**赛博57库** *2026年11月10日 05:00*

攻防技术 / 漏洞分析 · AD攻防工具/协议绕过PoC

LDAP 签名 · NTLM 中继 · Netlogon 预言机 · 会话密钥派生 · 检测工程

![签名不是终点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c213f25b1a3cfe75.jpg)

📌 本文怎么读

本文是继CVE-2026-70229漏洞被修复后，原漏洞发现者再次转换方向，采用不绕过签名，而是用 NTLMv1-ESS 降级 + 机器账户的 Netlogon 安全通道 'NetrLogonSamLogonWithFlags' 把受害者的 ExportedSessionKey 算回来，再以受害者身份正常签名, 补丁的身份计数器因此失效。本文按“ **这堵墙 → 补丁修了什么 → 换掉的问题 → 密钥算术 → 可观测痕迹 → 加固排序** ”拆解介绍。

## 引子：补丁只关掉了一条路

2026 年 10 月 13 日，微软把"一条 SASL 记录里塞两个 LDAP 消息"的漏洞修掉了。18 天后，同一个 GitHub 账号发布 Keyeroo：它不再伪造签名，而是走 Netlogon 把受害者自己的会话密钥要回来，然后以受害者的名义签字。

补丁改的是 LDAP 的一处校验：一条 SASL 记录如果在中途把连接的身份换掉，剩下的消息不再执行。它对应 CVE-2026-70229。SpecterOps 的 Raj Patel 在 10 月 23 日公开了完整的绕过路径与配套工具 Switcheroo，写法很取巧——把受害者的 NTLM AUTHENTICATE 和自己的 ModifyRequest 塞进同一条 SASL 记录，用攻击者自己那条连接的会话密钥签字。

## 一、这堵墙原本是怎么立起来的

先把签名键的来源说清楚，后面所有绕法都从这里开始。

NTLM 协商里如果带了 key exchange（ `NTLMSSP_NEGOTIATE_KEY_EXCH` ），客户端会生成一个 16 字节的 **ExportedSessionKey**，用密钥交换密钥（kxkey）做 RC4 加密后放进 AUTHENTICATE 消息的 SessionKey 字段。LDAP 的 SASL 层拿到 ExportedSessionKey 之后，按 RC4-HMAC 的规矩派生签名键：会话密钥拼上方向性 magic 常量，做一次 MD5。

中继者的困境就在这里：三个 NTLM 消息它能原样转发，但手里没有口令也没有 NT hash，算不出 SessionBaseKey，也就解不开那个加密的 session key，签不出任何一个合法记录。签名要求的强度不在于算法，而在于"这个键只有源和目标知道"。

Switcheroo 的巧劲在于绕开"知道键"这件事。它先用自己可控的凭据（甚至匿名 SASL 上下文）建一条已签名的 LDAP 连接，掌握会话密钥 X；然后把受害者的 Bind 和我们的 Modify 放进 **同一条** SASL 记录，用 X 签这条记录。

DC 的处理顺序是这样的（SpecterOps 逆出的调用链）：

`LDAP_CONN::ProcessRequestEx`

└── LDAP_REQUEST::DecryptSignedOrSealedMessage ← 用当前安全上下文的键验一次

└── LDAP_CONN::BindRequest ← 校验受害者凭据

        `└── MoveSecurityContext` 

             `/ InstallNewSecurityContext` 

             `/ SetSecurityContextAtts`

└── LDAP_CONN::ModifyRequest ← 记录里剩下的消息，以新身份执行

签名粒度是"记录"，不是"消息"。校验发生在记录到达时，身份切换发生在记录处理中途。于是一条用 X 签名的记录，前半段完成 Y 的绑定，后半段以 Y 的权限执行 —— 这就是当时能在"要求签名"的域控上写 RBCD 的原因。

微软的修法值得单独记一笔，因为它是典型的 TOCTOU 补法：

01 `ReceivedClientData` 收到数据时，把连接的 identity counter 快照一份塞进 request；

02 连接身份真正变化时（ `SetSecurityContextAtts` 安装受害者上下文）counter 自增；

03 `ProcessRequestEx` 处理完 Bind 再比对 request 里的快照和连接当前值，不相等就丢弃这条记录的剩余部分。

修得干净，但它修的是"实现假设"——一条记录里的身份是恒定的。它没有碰另一个假设："签名键可以被第三方取得"。

## 二、Keyeroo 把问题换掉了

Keyeroo 的出发点不是"没有键怎么签"，而是"能不能把键拿到"。而 NTLMv1 的协议设计里，答案就摆在服务器那一侧：v1 的响应只是 NT hash 和挑战的确定性函数，服务器知道 hash，所以服务器自己就能算出会话密钥。

于是整条链变成四步。

**第一步，剥掉挑战里的 TargetInfo。**

`def downgrade_challenge(challenge):`

    `source = ntlm.NTLMAuthChallenge()`

    `source.fromString(challenge.getData())`

    `source["flags"] &= ~ntlm.NTLMSSP_NEGOTIATE_TARGET_INFO`

    `source["TargetInfoFields"] = b""`

    `return source`

DC 发来的真挑战被转发给受害者之前，先清掉 `NTLMSSP_NEGOTIATE_TARGET_INFO` 标志、把 AV pair 列表置空。

**第二步，等受害者自己降级。**

没有 TargetInfo，客户端就算不出 NTLMv2 需要的 AV pair 和时间戳，只能回落到 NTLMv1-ESS。代码里的判定是硬的：

`if len(type3["ntlm"]) != 24 or not (type3["flags"] & ntlm.NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY):`

    `print(f"[-] Victim {victim} did not emit NTLMv1-ESS ...")`

    `return None, STATUS_ACCESS_DENIED`

24 字节的 NT response、带扩展会话安全标志，两个条件缺一不可。这是整条链的命门——受害者的 `LmCompatibilityLevel` 必须允许 v1（≤2）。

**第三步，把 Netlogon 当预言机用。**

这一步是全篇最值得看的地方。攻击者不需要知道受害者的口令，他只需要一个自己控制的机器账户，用它的口令或 hash 走机器账户的 Netlogon 安全通道，让域控替他校验受害者的 v1 响应：

`dce.bind(nrpc.MSRPC_UUID_NRPC)`

`client_challenge = os.urandom(8)`

`server_challenge = nrpc.hNetrServerReqChallenge(dce, NULL, machine + "\x00", client_challenge)["ServerChallenge"]`

`session_key = nrpc.ComputeSessionKeyStrongKey("", client_challenge, server_challenge, bytes.fromhex(machine_hash))`

`...`

`request = nrpc.NetrLogonSamLogonWithFlags()`

`request["ValidationLevel"] = nrpc.NETLOGON_VALIDATION_INFO_CLASS.NetlogonValidationSamInfo4`

`request["LogonLevel"] = nrpc.NETLOGON_LOGON_INFO_CLASS.NetlogonNetworkInformation`

`info["LmChallenge"] = hashlib.md5(target_challenge + bytes(type3["lanman"])[:8]).digest()[:8]`

`info["NtChallengeResponse"] = type3["ntlm"]`

`NetrLogonSamLogonWithFlags` 本来是"工作站把用户的网络登录请求转给 DC 校验"的合法接口，域控校验完会把 `UserSessionKey` 回填到 `ValidationSam4` 里。对 NTLMv1-ESS 来说，这个 base key 加上挑战和客户端挑战，就能推出 kxkey：

`kxkey = ntlm.hmac_md5(base_key, target_challenge + bytes(type3["lanman"])[:8])`

`encrypted = bytes(type3["session_key"])`

`key = ntlm.generateEncryptedSessionKey(kxkey, encrypted) if encrypted else kxkey  # RC4`

受害者在 AUTHENTICATE 里加密传过来的 ExportedSessionKey，就这么被解开了。注意这里的 `type3["lanman"][:8]` ——ESS 把客户端挑战藏在 LM response 的前 8 字节里，于是"服务器可计算的挑战"变成了 `MD5(server_challenge || client8)` 。这是一个纯粹的信息流问题：所有输入都在线上，所有密钥都能由知道 hash 的一方重算。

**第四步，用真钥匙签字。**

拿到 key 之后，补丁的身份计数器完全失效了——因为接下来要发的是独立的一条 SASL 记录，一个身份、一次签名、前后一致。Keyeroo 直接改 Impacket 的私有属性把签名层换掉：

`self.raw._LDAPConnection__spnego_cipher_blob = SPNEGOCipher(`

    `flags=type3["flags"], randomSessionKey=victim_key)`

`self.raw._LDAPConnection__auth_type = "NTLM-sasl"`

`self.raw._LDAPConnection__signing = True`

`self.raw._LDAPConnection__binded = True`

`self.raw.sequenceNumber = 0`

然后发 ModifyRequest。载荷三选一：写 `msDS-AllowedToActOnBehalfOfOtherIdentity` （RBCD，replace）、往 `msDS-KeyCredentialLink` 追加 KeyCredential（Shadow Credentials，add，并导出可直接换 PKINIT 的 PFX）、或任意属性任意值。

这一段的性质要说明白： **它不是绕过签名，是冒充。** 签名校验在 Keyeroo 这条路上完全正常工作，只不过校验的对象是受害者自己的密钥。这也是它绕开补丁的根本原因——补丁防的是"记录内身份跳变"，而这条路上身份从头到尾没跳过。

顺带一个工程细节值得记住：Keyeroo 没有 fork Impacket，它改的是 `relay_clients.PROTOCOL_CLIENTS["LDAP"]` 这个字典，然后 `runpy.run_path()` 把 `ntlmrelayx.py` 当脚本跑起来。要扩展 ntlmrelayx 的协议行为，最小侵入面就是这个 client 类，比维护一个 fork 划算得多。

![Keyeroo 攻击链四步](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df190a34fd49f9bd.jpg)

Keyeroo 攻击链四步

## 三、NTLMv1-ESS 的算术：密钥为什么能被算出来

把公式列出来，前面那些"为什么"就不用背了。

NTLMv1 的 NT response 是 24 字节：把 16 字节的 NTOWFv1 = MD5(UTF-16LE 口令) 补到 21 字节、拆成三把 7 字节 DES 密钥，对同一个 8 字节挑战各加密一次，三段拼起来就是 24 字节。整个过程只依赖口令和挑战，没有客户端随机性——同一口令在同一挑战下响应永远一样，这就是"相同挑战重放"的由来。

ESS 的改法是把客户端随机性塞进挑战：客户端自己生成 8 字节随机数，LM response 直接把它明文递过去（后面补 16 字节零），NT response 则改用 `MD5(server_challenge ‖ client8)[:8]` 当有效挑战。服务器拿得到这 8 个字节，所以照样能重算；kxkey 也跟着变成 `HMAC_MD5(base key, server_challenge ‖ client8)` （Keyeroo 的实现即此）。

|     |     |     |     |
| --- | --- | --- | --- |
| 量   | NTLMv1 | NTLMv1-ESS | NTLMv2 |
| 响应长度 | 24 字节 | 24 字节，末 8 字节为客户端随机 | 变长  |
| 有效挑战 | 服务器挑战 | MD5（服务器挑战 ‖ 客户端随机） | 服务器挑战 + 客户端块 |
| base key | NTOWFv1 | NTOWFv1 | HMAC_MD5（ResponseKeyNT, NTProofStr） |
| kxkey | base key | HMAC_MD5（base key, 挑战 ‖ 随机） | base key |
| 知道 hash 能自己算？ | 能   | 能   | 能   |

从表里能看出来，Keyeroo 依赖的不是某个实现缺陷，而是 v1 的结构性特征：会话密钥的每一个输入都在网络上，派生过程没有引入只有客户端才知道的秘密。

也正因为如此， **v2 走不通的原因不在这张表里，而在预言机那一侧**。公开材料只交代了 v1 的结果，没拆开 SamLogon 在 v2 路径上返回什么；代码里只有一道硬判断（ `len(type3["ntlm"]) != 24` 就拒）。本文把这一点标为 **unknown**，不拿推测当结论。

![NTLM 密钥派生关系](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9cd7e8b357ef08a.jpg)

NTLM 密钥派生关系

## 四、前置条件：这条链会在哪里断

工具能力再强，能落地的场景是被前置条件筛过的。按代码里的实际检查点列：

|     |     |     |
| --- | --- | --- |
| 条件  | 位置  | 不满足时的症状 |
| 受害者允许 NTLMv1 | `sendAuth()`<br><br>的 24 字节判定 | 打印 `did not emit NTLMv1-ESS` ，返回拒绝 |
| 一个可控机器账户 | `-oracle-machine`<br><br>\+ 口令或 hash | Netlogon RPC 绑定或认证失败 |
| 只能 SMB 被强制 | `sys.argv`<br><br>关掉其它 listener | WebDAV/HTTP 强制不生效 |
| 对目标对象有写权限 | `-modify-dn`<br><br>的 Modify 结果 | 结果码 50，权限不足 |
| 389/TCP 可达 | `ldap://`<br><br>硬编码 | TLS 下该手法直接不成立 |

机器账户这一条门槛比看上去低： `MachineAccountQuota` 默认 10，任意普通域用户都能自己造一个。而"受害者必须发 NTLMv1"这一条才是真正的分水岭，它对应注册表 `HKLM\SYSTEM\CurrentControlSet\Control\Lsa` 下的 `LmCompatibilityLevel` ，默认值就不该低于 3，现代 Windows 默认就是 NTLMv2。README 里作者还写了 Windows 11 / Server 2025 已经移除 NTLMv1（按作者表述引用，本文未在官方文档核实）。

这决定了对这条链的定性：它不是"人人可用的通杀"，而是"遗留环境专用"。而遗留环境的存量，恰恰是大多数域里没人算得清的那个数字。

## 五、痕迹：这条链在哪里留下可观测的东西

按"能被日志抓到"的顺序排，从协议层到目录层。

**1）网络层：一个没有 TargetInfo 的挑战。**

这是整条链唯一稳定的协议层指纹。Windows 服务端回 NTLM CHALLENGE 时通常都会带 AV pair（域名、机器名、时间戳），Keyeroo 必须把它剥掉才能逼出 v1-ESS。所以在 SMB 协商阶段看到"服务端自报 Windows，挑战里 AV pair 数量为 0"，就是一次针对性降级。

要注意误报边界：Java、Samba、部分网络设备的 NTLM 实现本来就不带 AV pair。收敛条件应该是"服务端是 Windows 域成员/域控，却回了一个空 TargetInfo"。

**2）DC 主机层：一个正常域里应该接近 0 的计数。**

域控上的 4624 登录类型 3，如果 `LmPackageName` 是 `NTLM V1` ，说明这次网络登录用的是 v1——这正是 Keyeroo 需要的那个受害者。这个数字本身就是风险度量：它约等于"域里有多少台机器愿意为攻击者降级"。

`SecurityEvent`

`| where EventID == 4624 and LogonType == 3`

`| where LmPackageName == "NTLM V1"`

`| summarize Hits=count(), First=min(TimeGenerated), Last=max(TimeGenerated)`

    `by TargetAccount, IpAddress, WorkstationName`

`| order by Hits desc`

配套看 4776（凭据校验）： `Package Name` 为 `MICROSOFT_AUTHENTICATION_PACKAGE_V1_0` 、 `Source Workstation` 是一个不该出现的工作站名。这一步对应 Netlogon 预言机的调用——域控替攻击者的机器账户校验了一个别人的登录。

**3）目录层：属性写入。**

5136 记录目录对象属性修改。Keyeroo 的两种默认载荷都会在这里露头：

`SecurityEvent`

`| where EventID == 5136`

`| where AttributeLDAPDisplayName in ("msDS-AllowedToActOnBehalfOfOtherIdentity", "msDS-KeyCredentialLink")`

`| project TimeGenerated, ObjectDN, AttributeLDAPDisplayName, AttributeValue, SubjectAccount`

这里有一个容易踩的坑：LDAP 写入落库时，5136 的主体常常记录成执行写入的那台 DC 的计算机账户，而不是被冒用的受害者身份。也就是说 Subject 看起来完全正常。判断要落在"对象 + 属性 + 值"上：谁给谁的 RBCD 加了哪个 SID、谁的 KeyCredentialLink 里多了一个 `B:828:` 开头的 DNWithBinary。上线前建议用一次受控写入先验证你们环境里 Subject 的真实表现，别把它当唯一判据。

**4）强制侧：一台机器账户在往外连 445。**

PetitPotam、PrinterBug、DFSCoerce 这一类的共性，是让受害者（通常是机器账户）主动连攻击机的 445。域内正常流量里，机器账户出站 445 的目标基本只有 DC 和文件服务器。Sysmon 事件 3 里 `Image` 为 System、 `DestinationPort` 为 445、目标是普通工作站网段，就是一条值得看的线。

![检测线索矩阵](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d7977a25c9a685a.jpg)

## 六、加固：按性价比排序，而不是按清单打勾

补丁当然要打，但要清楚它挡住的是什么。

|     |     |     |     |
| --- | --- | --- | --- |
| 顺序  | 动作  | 挡住什么 | 代价  |
| 1   | 打 KB5126646（2026-10-13）/ KB5122882（2026-09） | 挡住 Switcheroo 与 SMB 变体； **对 Keyeroo 无效** | 低，但不解决本文的问题 |
| 2   | `LmCompatibilityLevel ≥ 3`<br><br>（推荐 5：仅发送 NTLMv2，拒绝 LM 与 NTLM） | 让受害者根本发不出 v1-ESS，Keyeroo 断在第二步 | 中，老应用/老设备可能掉线 |
| 3   | Restrict NTLM 先审计、后拒绝 | 直接掐掉 LDAP 上的 NTLM 绑定 | 高，但这是根治 |
| 4   | `MachineAccountQuota = 0`<br><br>\+ 机器账户口令治理 | 抬高预言机门槛 | 低-中，但已有机器账户的攻击者不受影响 |
| 5   | 389/TCP 收口（只对管理网段开放） | 断掉传输面 | 中，取决于管理工具 |
| 6   | 上节四条遥测 | 打不了补丁时的兜底 | 低   |

排序的逻辑很简单：补丁是止血，关 v1 是拆路，监控是留证。只做第 1 项，等于承认"下次再有新写法就得再等一次月度更新"。

有一条容易被忽略的细节：SpecterOps 原文明确说过，LDAP 签名和通道绑定 **同时** 开启都挡不住这类攻击（因为攻击走 389 明文，通道绑定不适用），而 LDAPS/636 不受影响。所以"我们把签名和通道绑定都开了"不能作为结案理由。

## 七、三个视角，三句话

**红队看**：这条链的价值不在新原语，在响应速度。补丁 10 月 13 日发，10 月 31 日就有可用替代，中间只隔 18 天。AD 的攻击面里，"协议遗留"的修复周期比"实现缺陷"长一个数量级，这就是套利空间。

**蓝队看**：今天最该做的一件事不是去找 Keyeroo 的特征串（它没有稳定特征），而是把 4624 里 `NTLM V1` 的计数跑出来。这个数字直接等于"有多少台机器愿意为攻击者降级"，也直接决定这条链在你们域里是理论还是现实。

**管理者看**：补丁 SLA 通常写 30 天，而"关掉 NTLMv1"这类变更的排期常是 18 个月。攻击者正好住在这个时间差里。

## 结语

签名机制的假设是一句话：只有你和我知道这个键。补丁能修掉"一条记录里换身份"，修不掉"有人能替你算出这个键"。Keyeroo 的贡献不是又造了一个 relay 工具，而是把这句话写成了 480 行可执行的代码——顺手证明了一件事：在 NTLM 还活着的域里，签名是防线，不是终点。

⚠ 边界说明

本文面向授权环境下的攻防研究与防御建设：只做源码阅读、机制解释与检测/加固建议， **不复刻攻击步骤、不提供可直接运行的利用配置**。本刊未在真实域内复现该链；事件字段语义（尤其 5136 的 Subject）建议先用一次受控写入在自有环境验证，再据此调规则。
