---
title: 【先知】【勒索预警】Weax勒索病毒利用阿里云服务器攻击用友系应用，无中间件日志下完成完整溯源（附IOC）
source: https://xz.aliyun.com/news/92960
source_host: xz.aliyun.com
clip_date: 2026-10-15T16:43:47+08:00
trace_id: 744c9170-b21b-4fc3-970e-7e2630d2e5ad
content_hash: 5b165eb2b7e72ca45fabb9554e2eafd8626bf79dad90face4ca0e74521140923
status: synced
tags:
  - 先知
  - 恶意样本
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: Weax勒索家族利用用友U8 Cloud历史Nday漏洞入侵，在无中间件日志环境下，通过应用自身调用日志与文件时间戳取证完成全链路溯源。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3fa75244-d011-81b6-8dc6-df7146271006
ioc:
  cves: []
  cwes: []
  hashes:
    - 2eda5374953b4ff0605c413542a3beb0
    - eb8a0a9edf64c5fb3870969a749a93ab
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Weax勒索家族利用用友U8 Cloud历史Nday漏洞入侵，在无中间件日志环境下，通过应用自身调用日志与文件时间戳取证完成全链路溯源。
> 
> - **攻击入口：** 非0day，而是U8C未授权接口历史漏洞（反序列化/任意文件上传类），先用两个阿里云IP匿名探测 ExtSystemInvokeServer，再以 #UAP# 身份调用 `nc.itf.uap.sf.ILogin2Service.writeFlag` 落地木马。
> - **无日志溯源方法：** 中间件访问日志缺失时，改提取U8C应用自身服务调用日志（含五元组与方法名），以 readfromclientbytes（1780）远大于 writetoclientbytes（100）识别载荷投递特征，再用文件时间戳交叉验证。
> - **证据闭合点：** 木马 sol.jsp 修改时间 19:41:23 与 writeFlag 日志同秒、大小 1393 字节与读入 1780 字节同量级；但其创建时间显示 7 月 26 日，存在被篡改或早期入侵两种可能。
> - **木马性质：** sol.jsp 为异或混淆的JSP内存马加载器，敏感字符串（Unsafe、defineAnonymousClass）以数字数组混淆，从参数 java 接收字节码内存执行，是冰蝎/哥斯拉类典型结构。
> - **时间线：** 19:42:16 加密器 `UGTfsAcga.exe` 在 System32 运行（距木马落地53秒），19:42:17 起批量清除日志（事件ID 1102、104），19:42–20:47 全盘加密加 .weax，全程74分钟、晚间作案，指向国内人员。

## 写在前面

这是 Weaxor 勒索家族系列复盘的新一篇，事件发生在 2026 年 9 月 5 日晚间，被攻击的是一套通过动态域名映射到公网的用友 U8 Cloud 系统。

先说明结论：本次事件并不是 0day 攻击，而是利用公开历史漏洞的 Nday 攻击，漏洞本身并不新鲜。本次溯源真正的难点在于另一个层面，用友系的大部分应用默认不开启 Tomcat 等 Web 中间件日志，受害环境正是如此，常规的 Web 访问日志一条路直接断掉。我们最终通过上机提取应用自身产生的日志，从中匹配到关键调用特征，结合主机侧文件时间戳取证，完成了整条攻击链的还原。这个过程对同样部署用友系应用的企业有比较强的参考意义，所以整理成文。

## 一、攻击过程速览

先用一张时间线把全过程讲清楚，均为北京时间。

19:33:03 与 19:33:04，两个阿里云 IP 在一秒内先后对 U8 Cloud 的外部系统接口 ExtSystemInvokeServer 发起匿名探测，均未成功。

19:41:23，攻击者通过另一个阿里云 IP 以 UAP 平台内部身份调用登录服务 ILogin2Service.writeFlag 写入登录标志，同一时刻，JSP 木马 sol.jsp 落地到 U8C 的 Web 部署目录。

19:42:16，攻击者通过木马在 `C:\Windows\System32` 下投放并运行 Weaxor 家族加密器 UGTfsAcga.exe，距木马落地仅 53 秒。

19:42:17 起，Windows 安全审核日志及 System、Application、PowerShell 等日志被批量清除。

19:42 至 20:47，服务器各磁盘目录文件被批量加密并追加.weax 后缀，整个加密过程持续约 65 分钟。

先探测、后打击、即刻清日志，整套动作一气呵成，自动化工具链的特征非常明显。

## 二、没有中间件日志，如何锁定攻击者

正常情况下，溯源 Web 入侵首先翻 Tomcat 或中间件访问日志，但这套环境里什么都没有。我们转变思路，提取了 U8C 应用自身的服务调用日志，这类日志记录了每一次远程调用的五元组信息与方法名，价值极高。

关键记录共三条。前两条是 19:33 的匿名探测，调用的接口是 ExtSystemInvokeServer，userid 为 anonymous，请求耗时三百到五百毫秒，未读取或写入任何业务数据，属于典型的漏洞可用性探测。两个来源 IP 经威胁情报研判分别为北京与浙江杭州的阿里云节点，其中 8.130.89.29 有明确的漏洞利用行为历史，符合攻击者租用云主机做自动化探测的特征。

第三条是 19:41:23 的漏洞利用成功记录，也是全文最重要的一条日志。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ec1c875189f0fcb2.png)

U8 Cloud 应用日志，红框内自上而下为两条匿名探测记录与一条 writeFlag 利用成功记录

```plain
$$callid= $$userid= $$ts=2026-09-05 19:33:03 $$msg=thread=http-bio-8088-exec-7; begintime=2026-09-05 19:33:02;  costtime=515;   userid=anonymous;   remoteAddr=8.130.89.29:60308;   remoteCallMethod=invokeservlet-u8cloud_extsystem-u8c.server.extsystem.ExtSystemInvokeServer;    sqlcosttime=302;readresulttime=0;readrownum=0;readfromclienttime=1;writetoclienttime=0;writetoclientbytes=0;readfromclientbytes=0;notclosedconnectioncount=0 
$$callid= $$userid= $$ts=2026-09-05 19:33:04 $$msg=thread=http-bio-8088-exec-12;    begintime=2026-09-05 19:33:03;  costtime=386;   userid=anonymous;   remoteAddr=8.148.84.114:60309;  remoteCallMethod=invokeservlet-u8cloud_extsystem-u8c.server.extsystem.ExtSystemInvokeServer;    sqlcosttime=291;readresulttime=0;readrownum=0;readfromclienttime=1;writetoclienttime=0;writetoclientbytes=0;readfromclientbytes=0;notclosedconnectioncount=0 
$$callid=1785229443077-9310 $$userid=#UAP# $$ts=2026-09-05 19:41:23 $$msg=thread=http-bio-8088-exec-13; begintime=2026-09-05 19:41:23;  costtime=8; userid=#UAP#;   remoteAddr=39.98.64.130.60449;  remoteCallMethod=nc.itf.uap.sf.ILogin2Service.writeFlag;    sqlcosttime=0;readresulttime=0;readrownum=0;readfromclienttime=3;writetoclienttime=1;writetoclientbytes=100;readfromclientbytes=1780;notclosedconnectioncount=0 
```

把这条日志拆开看。remoteAddr 字段给出攻击者五元组来源 39.98.64.130，端口 60449；userid 为 #UAP#，说明攻击者已经拿到 UAP 平台的内部调用身份，不再是门外的匿名访客；remoteCallMethod 指向 ILogin2Service.writeFlag，即写入登录标志；costtime 仅 8 毫秒，一次干脆利落的内部调用；最值得琢磨的是 readfromclientbytes 为 1780，这次调用从客户端读入了 1780 字节的数据，而对应的 writetoclientbytes 只有 100 字节。一读一写之间，攻击者把接近 2 KB 的东西送进了服务器，只取回一个简短的确认，这正是投递载荷的通信特征。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3bc7eb7f04ad0e42.png)

威胁情报查询结果，漏洞利用来源 IP 39.98.64.130 为北京阿里云节点

应用日志只能证明调用行为本身，木马上传的 HTTP 过程因为没有中间件日志而无法直接呈现，所以我们用主机侧取证做交叉验证。通过 Everything 全盘检索 JSP 文件，在 U8C 的 Web 部署目录下找到 sol.jsp，查看文件属性，其修改时间为 2026 年 9 月 5 日 19:41:23，与 writeFlag 调用记录精确到同一秒，文件大小 1393 字节，与日志中读入的 1780 字节（含编码开销）处于同一量级，两条独立证据链就此闭合。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4efb5207a2d6e187.png)

Everything 检索结果，红框为 Web 目录下的木马 sol.jsp，修改时间 2026/9/5 19:41

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/829f8d323e558dbd.png)

sol.jsp 文件属性，修改时间 2026 年 9 月 5 日 19:41:23，与日志记录精确一致

有一处细节需要如实说明。该文件的创建时间显示为 2026 年 7 月 26 日，早于事发日期一个多月。文件时间戳可以被攻击者篡改以干扰溯源，这个创建时间的真实性存疑；但也不能完全排除 7 月 26 日前后已存在早期入侵痕迹的可能，我们已将这一时间点同步给受害单位做进一步核查。溯源工作的严谨之处就在于，证据能支撑到哪一步，结论就说到哪一步。

## 三、攻击入口的研判思路

很多同行关心一个问题，没有中间件日志，凭什么判断是历史漏洞而不是新的 0day。这里把排查思路完整分享一下，也是此类事件的通用方法论。

对 Java 应用发起溯源，我们的习惯是先排 Nday，再考虑 0day。原因很简单，从统计学上看，绝大多数勒索入侵用的都是已公开漏洞，0day 是少数派，先假设 0day 既不经济也容易把方向带偏。具体到一个 Java Web 应用，攻击者能拿到服务器权限的路径翻来覆去就是那几条。SQL 注入能否进一步命令执行，是否存在直接的命令执行漏洞，是否存在任意文件上传可以写入木马，又或是反序列化漏洞。排查动作就是对照这几条路径，逐一检索目标组件的公开漏洞记录，再回到日志里找匹配特征。

回到本案，用友 U8 Cloud 近年来已公开披露多起无需认证即可利用的历史漏洞，包括 ServiceDispatcher 接口反序列化、多处 Servlet 反序列化以及任意文件上传等，均可在目标服务器上执行代码或写入木马。攻击者先匿名探测外部接口、再以平台内部身份写入登录标志并落地木马的行为链，与利用 U8C 历史漏洞的攻击模式完全吻合。综合证据，我们将本次攻击研判为利用 U8C 未授权接口历史漏洞实施的入侵。

需要坦诚交代一个限制。应急处置后，受害方委托厂商重新部署了系统并更新全部官方补丁，原攻击环境已不存在，我们无法在测试环境中复测具体漏洞点，因此无法断言是哪一个编号的漏洞。把能确定的讲透，把不能确定的讲明，这是对读者负责，也是对溯源工作本身负责。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/81dc458999af6591.png)

用友工程师已确认打补丁，我方利用历史漏洞载荷测试未成功

## 四、木马 sol.jsp 是个什么东西

木马本体的技术细节这里不展开，只讲清两件事，让各位对这个威胁有正确认知。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f2545716a8b3bdf6.png)

木马 sol.jsp 文件内容，全部关键类名与方法名均以异或混淆的数组书写

第一，它做了对抗处理。木马中所有敏感字符串，包括 Unsafe、defineAnonymousClass 这类危险关键字，全部用异或运算混淆成数字数组，运行时才还原，专门规避基于明文特征的静态查杀。

第二，它本身只是个加载器。sol.jsp 从请求参数中接收攻击者动态传入的 Java 字节码，通过 Unsafe.defineAnonymousClass 在内存中直接定义匿名类执行，不落盘、不经过常规类加载。这种"传入页面上下文触发 equals"的结构，是冰蝎、哥斯拉等主流 JSP 内存马的典型特征。木马本体没有固定功能，攻击者每次连接都可以更换功能模块，这也是它能躲过常规文件扫描的原因。

## 五、53 秒完成投放，随后抹除痕迹

木马就位后的事态发展很快。19:42:16，加密器 `UGTfsAcga.exe` 在 System32 目录下运行，距木马落地 53 秒。19:42:17 起，安全审核日志（事件 ID 1102）与各系统日志文件（事件 ID 104）被批量清除，反溯源动作与加密动作几乎同步开始。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/470c35448241ca72.png)

程序执行审计记录，红框为加密器 UGTfsAcga.exe 于 19:42 在 System32 下运行

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ac0323c66bd1fe59.png)

Windows 事件日志，19:42:17 起安全审核日志与各日志文件被批量清除

19:42 至 20:47，全盘文件被批量加密并追加.weax 后缀，65 分钟后收工。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/98c39bed7880243c.png)

Everything 检索.weax 文件，各磁盘目录自 19:42 起被批量加密（敏感信息已打码）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1abd8f6b3a8155a0.png)

最后一批.weax 文件生成于 20:47，对应加密结束时间（敏感信息已打码）

从首次探测到加密结束，全程 74 分钟，且攻击发起时间是北京时间 19 点 33 分，晚 7 点之后。这个时间规律与我们在 Weax勒索病毒系列复盘中多次指出的特征一致，该家族的加密行动几乎全部安排在北京时间晚间，种种迹象高度指向国内人员作案。

## 六、IOC 清单

攻击源 IP：

|     |     |     |
| --- | --- | --- |  
| IP  | 归属  | 行为  |
| 8.130.89.29 | 北京阿里云 | 9 月 5 日 19:33:03 匿名探测 ExtSystemInvokeServer 接口 |
| 8.148.84.114 | 浙江杭州阿里云 | 9 月 5 日 19:33:04 匿名探测 ExtSystemInvokeServer 接口 |
| 39.98.64.130 | 北京阿里云 | 9 月 5 日 19:41:23 调用 ILogin2Service.writeFlag，漏洞利用成功 |

主机侧与网络侧痕迹：

|     |     |     |
| --- | --- | --- |  
| 类型  | 内容  | 文件MD5 |
| 木马文件 | Web 部署目录下 sol.jsp（异或混淆 JSP 内存马加载器，参数名 java） | 2eda5374953b4ff0605c413542a3beb0 |
| 加密器 | C:\\Windows\\System32\\UGTfsAcga.exe（Weaxor 勒索家族） | eb8a0a9edf64c5fb3870969a749a93ab |
| 加密文件特征 | 文件被追加.weax 后缀 | /   |
| 日志清除行为 | 事件 ID 1102（安全审核日志清除）、104（System 等日志清除） | /   |
| 被调用接口 | u8c.server.extsystem.ExtSystemInvokeServer（探测）、nc.itf.uap.sf.ILogin2Service.writeFlag（利用） | /   |

## 七、防护建议

第一，收敛暴露面，这是最有效的一条。本案的 U8 Cloud 通过动态域名直接映射到公网，等于把核心 ERP 摆在了攻击者的扫描器面前。ERP、财务、OA 这类系统原则上不应直接暴露公网，必须远程访问的，改为 VPN 或网关白名单，并对外部系统接口实施访问控制。该家族如今越来越倾向于 0day 攻击，偶尔穿插 Nday，补丁无法覆盖所有风险，收缩入口才是根本。

第二，把日志开起来，这是本案最直接的教训。如果受害环境开启了 Tomcat 访问日志并做了集中留存，溯源会顺利得多。建议开启 Web 中间件访问日志并异地留存 180 天以上，同时对事件 ID 1102、104 这类日志清除行为建立实时告警，攻击者抹痕迹的那一刻，就是你收到告警的那一刻。

第三，及时跟进官方补丁，确认核心数据有离线备份。用友官方对历史漏洞均有补丁，本案受害方事后已完成全量更新。备份仍是底线，这里不再展开。
