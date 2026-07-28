---
title: HTB-Cascade：从匿名 LDAP 到 AD 回收站的连锁提权-先知社区
source: https://xz.aliyun.com/news/92585
source_host: xz.aliyun.com
clip_date: 2026-07-28T15:54:26+08:00
trace_id: ffb5f9a2-adc4-4bdb-a491-b4074421f840
content_hash: 0477defeaec1243534dff8391d345a8328be2c5f5584a184ffbfd633d150c6af
status: synced
tags:
  - Windows逆向
  - .NET逆向
series: null
feed_source: 先知安全技术社区
ai_summary: 通过匿名LDAP查询泄露凭证，利用VNC解密和.NET逆向逐步获取权限，最终滥用AD回收站权限恢复管理员密码。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 1
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/d594bcbe-5644-3c3c-b51b-eca41d3d796e
    - https://xz.aliyun.com/api/v2/files/a3502328-d429-35cf-8146-c7d8c8c4be22
    - https://xz.aliyun.com/api/v2/files/937c38a4-7ed0-3d42-a225-0b14f12878e5
    - https://xz.aliyun.com/api/v2/files/b5bf1055-c6f2-31dd-9f27-b758bfce4df9
    - https://xz.aliyun.com/api/v2/files/55e93a86-e107-37ad-b40a-e1f0998425c9
    - https://xz.aliyun.com/api/v2/files/ec3c3265-eb1f-37b2-88dc-bf95628df853
notion_page_id: 3ab75244-d011-817d-91d7-e2759c2ddd13
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过匿名LDAP查询泄露凭证，利用VNC解密和.NET逆向逐步获取权限，最终滥用AD回收站权限恢复管理员密码。
> 
> - **初始凭证泄露：** 匿名LDAP枚举发现用户`r.thompson`的`description`属性中包含base64编码的密码`rY4n5eva`，但该账户无WinRM登录权限。
> - **VNC密码解密：** 利用`r.thompson`凭证访问SMB共享，在`VNC Install.reg`中发现加密密码。VNC使用DES算法，但其密钥比特序与标准相反，解密后得到`s.smith`的凭证。
> - **数据库密码提取：** 以`s.smith`身份登录后，其`Audit Share`权限暴露了SQLite数据库`Audit.db`。通过逆向共享中的`.NET`程序`CascAudit.exe`，在其解密函数处下断点动态调试，成功获取`ArkSvc`的密码。
> - **AD回收站提权：** `ArkSvc`属于`AD Recycle Bin`组，有权查询已删除的AD对象。通过命令恢复出已删除的`TempAdmin`账户密码，该密码与管理员密码相同，最终获得`Administrator`权限。

![file-20260721152752886.png](⚠️ https://xz.aliyun.com/api/v2/files/d594bcbe-5644-3c3c-b51b-eca41d3d796e)

一、Nmap

TCP 全端口扫描：

提取开放端口：

对开放的端口进行详细扫描：

根据端口的开放的情况判断，目标是 AD 中的 DC。

扫描结果中暴露了域名：

添加到本地的

hosts

文件中：

二、枚举

1、SMB

SMB 匿名枚举共享：

无输出。

用 guest 用户 + 空密码尝试：

依旧没有输出。

2、LDAP

LDAP 匿名枚举用户：

制作用户字典：

继续匿名进行查询：

结果有 6363 行：

我尝试过滤一些可能泄露凭证的关键字，比如：

最终：

去

results.txt

文件中检索：

找到：

解码后得到的密码是：

但是该账户并没有 WinRM 登录权限：

三、SMB again

用该凭证进行 SMB 共享枚举：

有四个可读的共享资源。

netexec

提供了一个 Spider Share 的功能，它需要你提供一个

pattern

参数，其部分源码：

当我提供：

的时候，检索的代码就变成：

这将匹配所有的文件。

先爬取 Data Share 中的文件：

过滤非目录的信息：

通过

smbclient

访问共享资源，查看上面看到的四个文件：

Meeting_Notes_June_2018.html

文件是 Steve Smith 向昨天开会开溜的员工 Ben 的一个对接记录：

![file-20260726103713768.png](⚠️ https://xz.aliyun.com/api/v2/files/a3502328-d429-35cf-8146-c7d8c8c4be22)

其中提到一个用于完成“网络迁移相关的所有任务”的临时账号：

还提到，其密码和普通管理员账号的密码相同。

ArkAdRecycleBin.log

该日志记录了

CASCADE\\ArkSvc

完成了对

TempAdmin

账号的清除：

dcdiag.log

是针对 DC 的诊断日志，其中并没有什么关键的信息。

VNC Install.reg

中能发现一串密码信息：

但这似乎并不能转换成对应的 ASCII 字符串：

似乎是经过加密的。

四、VNC

VNC 全称为“Virtual Network Computer”，一种能让你远程控制电脑的技术。

VNC Password 允许你“使用主机密码以外的密码”来远程访问计算机。

搜索：

能找到这篇

[

文章

](https://github.com/frizb/PasswordDecrypts)

，其提到 VNC Password 采用 DES 来加密，并且使用固定密钥。

按文档说的方法解密，得到：

VNC 早期的开源代码不方便找到，能看到社区根据早期代码进行后续维护的

[

项目

](https://github.com/TurboVNC/turbovnc)

，在

vncauth.c

文件中能看到硬编码的密钥信息：

也能看到用 DES 保护密码的函数：

这串信息：

转换成 16 进制是：

和之前使用的解密密钥不一致：

这是因为 VNC 对 DES 进行了微小的调整，在

./common/d3des/d3des.c

文件中能看到：

C 语言中，0开头的为 8 进制。

这和原始的（16 进制表示）：

刚好相反。

这意味着：

●

原先：先取最高位（bit7），再取 bit6 … 最后取最低位（bit0）

●

现在：先取最低位（bit0），再取 bit1 … 最后取最高位（bit7）

但 VNC 实现 DES 子密钥生成算法的时候，依旧采用了正常模式。这就导致填入的密钥要按比特反着写，即：

转换成十六进制：

这就是之前使用的正确的密钥了。

总之，我得到了一个新的凭证：

五、s.smith shell

利用

evil-winrm

工具获得 s.smith 的 Shell：

在 Desktop 目录中能找到 User Flag：

查看用户的组信息：

Audit Share 似乎和共享资源有关系，我打算用该凭证再用

smbmap

枚举一下共享资源：

该用户的确对一个叫

Audit$

的共享资源有读权限。

列举共享资源中的文件：

有一个数据库文件，而且使用的应该是 SQLite（文件名提示）。

查看：

根据字段名，

Ldap

表中有密码的相关信息：

base64 解码之后是乱码：

应该是被加密处理过的。

六、CascAudit.exe 逆向分析

在共享资源中，还能看到一个

CascAudit.exe

文件。

我打算将该共享资源中的所有信息都下载到本地：

Bat 脚本中写明了用法：

由于目录结构的改变，我应该执行：

运行：

![file-20260726154117923.png](⚠️ https://xz.aliyun.com/api/v2/files/937c38a4-7ed0-3d42-a225-0b14f12878e5)

我打算用

dnSpy

反编译这个文件。

其中有这么一段代码：

它从 Ldap 表中取出 Pwd 字段的值，并进行了解密操作：

我打算在：

这段代码下断点，这样我就可以查看解密后的值。

运行（注意指定参数）：

![file-20260726153706433.png](⚠️ https://xz.aliyun.com/api/v2/files/b5bf1055-c6f2-31dd-9f27-b758bfce4df9)

![file-20260726153737703.png](⚠️ https://xz.aliyun.com/api/v2/files/55e93a86-e107-37ad-b40a-e1f0998425c9)

密码为：

七、ArkSvc Shell

利用新获取的凭证，通过

evil-winrm

我可以获得其 Shell：

查看用户组信息：

他属于

AD Recycle Bin

组。

八、Root Flag

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1cdcf601c4be4ea1.png)

在 HackTricks 中有关于

AD Recycle Bin

组的滥用：

![file-20260726155856223.png](⚠️ https://xz.aliyun.com/api/v2/files/ec3c3265-eb1f-37b2-88dc-bf95628df853)

该组的成员允许读取已删除的 Active Directory 对象，这可能会泄露敏感信息。

运行命令后可以看到泄露的 TempAdmin 的密码：

之前看到的

ArkAdRecycleBin.log

和 HTML 文件中提到过：该用户已经被清除，并且其密码和普通管理员的密码是一致的。

尝试获取 administrator 的 Shell：

在 Desktop 目录中能找到 Root Flag：
