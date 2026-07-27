---
title: HTB-Sauna：绕过“任性银行”的层层防线-先知社区
source: https://xz.aliyun.com/news/92558
source_host: xz.aliyun.com
clip_date: 2026-07-27T16:46:54+08:00
trace_id: 584b78aa-7aaa-4c44-95bf-7db662c2f9c6
content_hash: 057b5a659f8030cdc46ef6f9ae95be840c64b9c9ec180d65f73cdf335429c50d
status: synced
tags: []
series: null
feed_source: 先知安全技术社区
ai_summary: null
ai_summary_style: null
images_status:
  total: 11
  succeeded: 1
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/c1bc8754-44b2-3355-a808-29e15c67a32e
    - https://xz.aliyun.com/api/v2/files/41a65f87-ad62-3c36-b46c-3bc253037170
    - https://xz.aliyun.com/api/v2/files/cddb1e95-c039-35ed-83f0-973b70dbefaf
    - https://xz.aliyun.com/api/v2/files/51835528-7643-3877-b5e3-b236669b7e6c
    - https://xz.aliyun.com/api/v2/files/29fea93d-91f0-3060-a381-5174478917f0
    - https://xz.aliyun.com/api/v2/files/e9da70c0-5439-3d4f-9ef8-1e3ce65b1e2f
    - https://xz.aliyun.com/api/v2/files/e5984518-7aea-3524-b8a5-8ab3c3c8feb9
    - https://xz.aliyun.com/api/v2/files/aa3117b6-87ee-31df-8224-9a6f02e14b24
    - https://xz.aliyun.com/api/v2/files/3ea65e81-95f4-3a95-987b-4750653f28f5
    - https://xz.aliyun.com/api/v2/files/042c112a-8d78-38c8-b99f-585de044c332
notion_page_id: 3aa75244-d011-814d-8e44-dde821efc624
ioc: null
---

![file-20260720151537313.png](⚠️ https://xz.aliyun.com/api/v2/files/c1bc8754-44b2-3355-a808-29e15c67a32e)

一、Nmap

TCP 全端口扫描：

对开放端口进行详细扫描：

根据开放端口的情况，可以判断目标是 AD 中的 DC。

扫描结果中，暴露了域名：

添加到本地

hosts

文件当中：

nmap

扫描结果中，域名后面还额外跟上了“0.”，关于这个的解释可以看我另一篇

[

文章

](https://beini-faxianl.github.io/#/note/9)

的开头部分，这里不再赘述。

nmap

默认脚本扫描得到的结果中，还有一个信息：

签名验证开启，这意味着，我几乎无法实现 NTLM Relay 到 SMB。

二、TCP 80

与常规域靶机不同的是，本靶机开了 80 端口。

访问：

HTTP 服务是由 Microsoft-IIS 搭建的，版本号为 10.0。

浏览器访问：

![file-20260722163145724.png](⚠️ https://xz.aliyun.com/api/v2/files/41a65f87-ad62-3c36-b46c-3bc253037170)

其描述了一家 Egotistical Bank（任性的银行），其宗旨是“只在乎你的钱，不在乎服务”。用户甚至评价“自从在这家银行贷了款，连糖炒栗子都吃不起了”，这就是口碑（bushi）！

域渗透的信息搜集阶段，非常在乎有效用户信息，在

about.html

中能看到团队成员信息：

![file-20260722163711312.png](⚠️ https://xz.aliyun.com/api/v2/files/cddb1e95-c039-35ed-83f0-973b70dbefaf)

整理成 User 字典，其内容：

当然，这并不代表他们的系统用户名就是这样。

其他页面的内容没什么有价值的信息，其中的交互式元素（比如按钮），都是没有用或者后端无对应实现的。

三、枚举

尝试 smb 匿名枚举共享信息：

没有结果，尝试用

guest

用户 + 空密码：

依旧没有结果。

尝试 LDAP 匿名枚举用户：

依旧没有结果。

尝试 LDAP 匿名查询：

但依旧没有有效信息。

尝试

rpcclient

：

都是访问被拒绝。

四、Kerbrute

在 Kerberos 认证中，针对“存在的用户”与“不存在的用户”采取的响应是不同的。根据这个差异，即可实现暴力枚举域内有效用户。

我用的工具是

[

kerbrute

](https://github.com/ropnop/kerbrute)

。

下载并赋予执行权限：

运行：

从流量包中能更好地看清这一过程：

![file-20260722171903863.png](⚠️ https://xz.aliyun.com/api/v2/files/51835528-7643-3877-b5e3-b236669b7e6c)

可见，工具会不断地发送 AS-REQ，若用户并不存在，AS 会返回：

的错误提示。

而针对有效用户，分为两种响应。

字典中的用户的凭证都是未知的，因此只能发送“无需预认证”版的 AS-REQ。那么 AS 收到请求之后，若该用户真的开启了无需预认证，则正常返回 TGT，反之，则会返回报错信息：

![file-20260722172627136.png](⚠️ https://xz.aliyun.com/api/v2/files/29fea93d-91f0-3060-a381-5174478917f0)

从工具的结果中能看出命名规律，比如：

应该就是从：

改变而来。

因此，重新整理 User 字典：

五、AS-REP Roast

我在 Forest 靶机的讲解中详细介绍了 AS-REP 以及本地破解密码的原理，这里不赘述，感兴趣的朋友可以查看

[

文章

](https://beini-faxianl.github.io/#/note/0)

。

Roasting：

用 Hashcat 破解：

得到账密信息：

六、FSmith Shell

由于目标开放 5985 端口（WinRM 服务），我打算用

evil-winrm

工具获得一个 Powershell：

在 Desktop 目录能找到 User Flag：

在

C:\\inetpub\\wwwroot

中能看到网站的源码：

但是，并没有有价值的信息。

查看用户权限，以及组信息：

没有什么有意思的信息。

七、winPEAS

我打算上传

winPEASx64.exe

（本地权限提升路径枚举工具）：

运行之后，能看到很多的输出。不过好在，该工具会自动高亮重要的信息，能帮助我快速筛选信息。

在输出信息中能找到这么一段：

![file-20260722202748570.png](⚠️ https://xz.aliyun.com/api/v2/files/e9da70c0-5439-3d4f-9ef8-1e3ce65b1e2f)

又出现一个账密信息：

八、svc_loanmgr Shell

尝试用

evil-winrm

工具获得 Shell：

失败了。

我注意到用户目录中还有其他的用户：

尝试密码复用：

得到了

svc_loanmgr

的 Shell。

查看了组信息、权限信息、常见的几个目录，并没有发现什么有意思的信息。

九、BloodHound

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1cdcf601c4be4ea1.png)

我打算上传采集器（SharpHound）：

执行默认采集：

将生成的压缩包下载到攻击机：

上传到 BloodHound 上后，我通过搜索，先定位了当前用户：

![file-20260722204238414.png](⚠️ https://xz.aliyun.com/api/v2/files/e5984518-7aea-3524-b8a5-8ab3c3c8feb9)

选择其出边：

![file-20260722204336947.png](⚠️ https://xz.aliyun.com/api/v2/files/aa3117b6-87ee-31df-8224-9a6f02e14b24)

![file-20260722204315311.png](⚠️ https://xz.aliyun.com/api/v2/files/3ea65e81-95f4-3a95-987b-4750653f28f5)

可以发现，当前用户在域内同时拥有：

●

GetChanges

●

GetChangesAll

这两个权限。

根据 BloodHound 的描述：

![file-20260722204457377.png](⚠️ https://xz.aliyun.com/api/v2/files/042c112a-8d78-38c8-b99f-585de044c332)

如果同时具备 GetChanges 和 GetChangesAll 权限，用户可以模拟 DC 间的数据复制操作，从而获得敏感信息。

利用工具

secretsdump.py

：

通过 PtH 登入域管账号：

在 Desktop 目录中能找到 Root Flag：
