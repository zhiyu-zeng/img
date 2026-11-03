---
title: 【微信】黑客滥用ARTEX AI Agent，自动化攻击活动目录并实施横向移动
source: https://mp.weixin.qq.com/s/sawvwC4QqdZKS6l45-tE4w
source_host: mp.weixin.qq.com
clip_date: 2026-11-03T19:04:22+08:00
trace_id: 34a39a5a-af07-45d1-a558-7c8866822774
content_hash: 05c5f7d1866c5b9f5e55c53ca92318620ecbb9fa8eaab831649cc8a7cb551737
status: synced
tags:
  - 微信
  - 威胁情报
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TL;DR：黑客正滥用开源多Agent工具ARTEX自动化活动目录攻击，数秒内完成Kerberoasting、DCSync窃密与向域控的横向移动。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40d75244-d011-8133-9386-df6cf6ed4f61
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：黑客正滥用开源多Agent工具ARTEX自动化活动目录攻击，数秒内完成Kerberoasting、DCSync窃密与向域控的横向移动。
> 
> - **工具架构：** ARTEX是Go语言编写的多Agent渗透测试与命令控制平台，将攻击拆分给6个子Agent，攻击者仅需设定目标和提供少量窃取凭证，工具即自动生成并执行后续全部攻击命令。
> - **攻击手法：** 自动对域控运行PowerShell脚本枚举托管服务账户、审查ADCS模板、跨林映射AD对象（单案例超11万个对象），随后执行Kerberoasting离线破解票据，运行DCSync窃取krbtgt密钥与域控哈希，再经Pass-the-Ticket、WinRM、哈希传递等方式横向移动。
> - **速度惊人：** 单轮攻击爆发仅持续2至25秒，一案例23秒产生27条事件记录；Wiz追踪的UNC7228（与微软STORM-0940特征重叠）从攻陷首个账户到获取深层权限最快仅15分钟。
> - **溯源与扩散：** 谷歌威胁情报团队与Mandiant在应急响应中发现滥用活动始于2026年8月下旬，受害行业覆盖政府、科技、化工、制造、电信；原作者已于10月从GitHub下架代码，但ScopeWeaver分叉及付费版ARTEX PRO仍在传播。
> - **防御要点：** 工具为速度牺牲隐蔽性（植入Webshell曾产生240条日志），但攻击者使用合法账户和常规管理工具，静态特征检测大多失效；建议隔离管理员系统、使用短期凭证、划分网络区域并监测异常行为。

**FreeBuf** *2026年11月3日 18:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif)

![ARTEX自动化活动目录攻击](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c81f7a041c859752.png)  

黑客目前正在使用名为ARTEX的开源AI工具，自动完成大部分网络入侵流程。该工具可绘制Windows网络拓扑、窃取服务账户密码。仅需极少人工干预，它就能尝试向域控制器横向移动。

整个攻击过程仅需数秒，而非数小时。ARTEX是一款多Agent渗透测试与命令控制平台，采用Go语言开发。安全团队开发这类工具的初衷是支撑渗透测试工作，如今犯罪分子及疑似国家背景的攻击组织却将其用于恶意攻击。

由于恶意分子滥用该工具发起攻击，原作者已于2026年10月将所有代码从GitHub下架。但社区分叉版本仍在广泛传播，包括ScopeWeaver以及名为ARTEX PRO的付费版本。

谷歌云旗下Google Threat Intelligence Group与Mandiant的研究人员在事件响应工作中发现了相关攻击活动。

研究人员观测到ARTEX的滥用活动始于2026年8月下旬，受害机构覆盖政府、科技、化工、制造、电信等多个行业。

微软也将该工具与一个中国背景攻击组织关联。该组织曾利用窃取的ConnectWise凭证，针对Microsoft 365租户发起攻击活动。

Part01

## 多Agent攻击流程

ARTEX拆分多子Agent执行攻击

ARTEX将攻击流程拆分给6个子Agent。攻击者只需设定攻击目标、提供部分窃取到的凭证，框架就会自动将目标转化为可执行命令。在多起案例中，入侵者仅向ARTEX提供有效登录凭证，就交由工具完成后续所有攻击阶段。

进入目标网络后，ARTEX会针对域控与联合服务器运行PowerShell脚本。这些脚本可校验用户名、枚举托管服务账户。除此之外，脚本还会审查活动目录证书服务模板。

这些脚本还能跨林映射数千个安全账户。在一起案例中，该工具拉取了超过11万个活动目录对象，读取了域管理员组的配置信息。

Kerberoasting是攻击流程中的关键步骤。ARTEX会针对关联服务名称的账户请求服务票据，攻击者可离线破解票据获取对应账户的密码。

这一手法与Ghost SPN Kerberoasting技术的基本原理一致，只是全程不需要人工参与，工具会自动完成所有操作。经过短暂的离线破解环节后，工具会运行DCSync脚本，窃取域krbtgt密钥、云同步凭证以及域控哈希值。

窃取这些哈希值的风险极高，攻击者可借此伪造票据。此前发布的攻击者冒充域控相关公开报告，已经对这一原理做过详细说明。

ARTEX还会尝试通过票据传递（Pass-the-Ticket）、WinRM、Kerberos中继、哈希传递（Pass-the-Hash）等方式横向移动到域控。在一起案例中，工具因Windows服务令牌限制未能成功攻击，端点防护拦截了其余所有尝试，最终防御者切断了被控服务器的网络连接。

Part02

## 攻击速度与隐蔽性

ARTEX攻击效率远超人工

谷歌威胁情报团队与Mandiant研究人员表示，该工具的运行速度是人工无法企及的。单轮活动爆发仅持续2至25秒，在一起案例中，工具23秒内就产生了27条事件记录。如果脚本体积过大，ARTEX会自动裁剪脚本，约10秒后就可以重新发起执行。

Wiz跟踪到一起谷歌命名为UNC7228的ARTEX攻击活动，该活动与微软命名的STORM-0940存在特征重叠。该攻击团伙通常从攻陷首个账户到获取系统深层权限仅需约4小时，最短一次仅耗时15分钟。

ARTEX的攻击操作并不追求隐蔽性。在一起案例中，工具尝试通过MySQL日志文件植入Webshell时产生了240条日志事件，不同子Agent的操作甚至出现相互覆盖的情况。

ARTEX为追求速度牺牲了隐蔽性，反而给防御方留下了明确的检测抓手。目前攻击组织使用这类AI Agent发起攻击的趋势正在持续扩散：Aur0ra勒索软件运营者就曾使用Cursor AI Agents获取域管理员权限，是同类攻击的典型案例。

这类工具并没有创造新的攻击方法，只是缩短了攻击链路串联所需的时间。对应的防御建议包括：隔离管理员系统、使用短期凭证、收紧访问权限、划分网络区域、监测异常行为。

由于攻击者使用合法账户和常规管理员工具开展活动，静态特征检测会漏掉大部分相关攻击行为。

Part03

## 失陷指标公布

ARTEX攻击失陷指标公布

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ec0ffa3c1fb8c085.png)

注：文中涉及的IP地址与域名均已做去激活处理（例如添加\_\[.\]\_标记），防止意外解析或自动跳转。请仅在MISP、VirusTotal或内部SIEM等受控威胁情报平台内恢复原始地址，开展相关分析工作。

参考来源：

Hackers Use ARTEX AI Agents to Automate Active Directory Attacks, Kerberoasting, and Lateral Movement

https://cybersecuritynews.com/hackers-use-artex-ai-agents/
