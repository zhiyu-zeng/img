---
title: 【微信】SSHole漏洞遭攻击者扫描利用，部分Linux账户可被超长密码绕过认证
source: https://mp.weixin.qq.com/s/4A_COg04I_8Xei0KMWNZiw
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T09:45:54+08:00
trace_id: 2eea2a7e-42d3-488c-af5f-d225ee825f48
content_hash: 717294fcf9c5366d94bb88bd3920196ca6c759ad8aca8b7b212426fb659bbb16
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41475244-d011-8160-9d40-c936626682e9
ioc: null
---

**FreeBuf** *2026年11月9日 19:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif)

![OpenSSH SSHole漏洞](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8110d47c1bc0a947.png)

Part01

攻击者开始利用SSHole漏洞

SANS互联网风暴中心最新研究显示，攻击者已开始针对影响特定OpenSSH服务器的SSHole认证绕过漏洞发起攻击。

远程攻击者可利用该漏洞访问部分禁用密码登录的Linux账户。整个过程不需要掌握有效凭证，也无需持有SSH密钥，只要提交长度异常的密码即可。

SANS研究员Johannes Ullrich通报，11月5日研究人员首次观测到明确的漏洞利用尝试，攻击者使用的密码完全由重复的"A"字符构成。

他部署的Cowrie SSH蜜罐当天记录到232次超长密码请求，11月6日这一数字上升到713次。这些数据仅统计可疑请求数量，不代表确认入侵的次数，也不对应独立攻击者的数量。

超长密码请求活动最早出现在11月1日。在他看来，这些早期请求更像是存在缺陷的暴力破解脚本产生的流量，并非针对SSHole漏洞的蓄意利用。部分脚本甚至会把下载命令填入密码字段。由于Cowrie仅能记录密码的前255个字符，研究人员无法完整分析长度超过该阈值的攻击尝试。

发起扫描的主要来源IP包括213.86.169.133、152.233.50.185、92.255.57.7，分别记录到48次、44次、43次攻击尝试。他怀疑部分蜜罐已被成功登录，但报告中并未确认存在成功建立的会话。现有证据只能证明攻击者正积极尝试利用该漏洞，攻击的实际影响范围目前仍无法确定。

Part02

SSHole漏洞细节公开

该漏洞由研究员Özgün Kültekin披露，仅影响特定配置的OpenSSH实例：运行环境使用musl libc，且密码校验环节未启用Linux登录框架PAM。

正如Cybersecurity News此前OpenSSH相关报道所述，成功利用该漏洞还需满足多个条件。首先是服务端已启用密码认证，其次是目标账户的存储密码字段为\*，最后是本地存在另一个配置了有效SHA-crypt密码哈希的账户。

研究员在技术披露中解释了漏洞的成因。当用户提交的密码长度超过256字节时，musl的crypt()函数会返回 *表示错误。OpenSSH会将该返回值与目标账户存储的* 值匹配，进而允许登录。已公开的攻击有效长度范围为257字节到1024字节。持有有效密码哈希的账户不会被这种方式绕过认证。

Part03

官方发布修复补丁

OpenSSH 10.6p2版本已修复该漏洞，Alpine也已发布补丁包。管理员应安装对应发行版的更新，并重启sshd服务。

如果暂时无法安装补丁，将PasswordAuthentication参数设为no即可阻断该攻击路径。StepSecurity的测试也证实，密码校验环节启用PAM时同样可防御该攻击。管理员需要注意核对包版本，因为反向移植的修复补丁可能仍保留旧版本的OpenSSH标识。

管理员应排查仅允许密钥登录的账户的成功密码登录记录，重点关注同一会话内先出现登录失败、随后认证通过的情况。此前SSH蜜罐相关研究早已证明，登录后的行为监控十分关键。

现有证据无法证明SSH存在会向GitHub泄露密码或API密钥的配置选项。该说法与本次认证绕过漏洞无关，不应出现在相关报道的标题中。

参考来源：

Hackers Begin Exploiting OpenSSH SSHole Authentication Bypass Vulnerability

https://cybersecuritynews.com/openssh-sshole-flaw-exploited/
