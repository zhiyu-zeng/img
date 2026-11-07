---
title: 【微信】OpenSSH发布紧急补丁，修复Alpine Linux长密码绕过SSH认证漏洞
source: https://mp.weixin.qq.com/s/DMHdKRcSDzzt1Qh8mDRe7g
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:11:13+08:00
trace_id: 8a9298dd-c66f-4760-b63c-4638765c1f40
content_hash: ee651c588f26cafc9c9eb4db1271f7abaed517c1da770fbc358c72d41f00d50c
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
notion_page_id: 41175244-d011-81a3-8cac-db5c696e3eae
ioc:
  cves:
    - CVE-2016-6210
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**FreeBuf** *2026年11月6日 18:00*

![FreeBuf](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7c122de5d3efe346.gif) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d8c5e21bff91c5f.png)

在部分运行标准openssh-server软件包的Alpine Linux服务器上，攻击者可登录无密码账户（如仅配置SSH密钥登录的账户）。攻击者只需具备服务器网络访问权限、掌握目标账户名，输入长度在257到1024字节之间的密码就可以完成登录。

OpenSSH将该漏洞评级为严重，于今日发布10.6p2版本封堵漏洞。Alpine已为所有3.16及以上版本发布修复包。

该攻击的触发需要满足三个条件：OpenSSH服务端（sshd）未通过PAM接口校验密码、已开启密码登录、设备上至少存在一个设置了密码的账户。Alpine的openssh-server软件包默认编译时未启用PAM支持，且密码登录功能默认开启。

OpenSSH项目的Damien Miller表示，该漏洞源于sshd与Alpine底层使用的C语言库musl的交互逻辑问题。非Linux系统、基于glibc的Linux系统，以及通过PAM校验密码的系统均不受影响。

Damien Miller建议所有运行受影响系统的用户："立即设置PasswordAuthentication=no，或直接禁用这些系统的SSH服务。"目前尚未发现利用该漏洞发起的攻击。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b30e9730ef9351b.png)

Part01

四类条件同时满足即暴露

Alpine发布的安全公告列出了四项判定条件，服务器同时满足所有条件时即存在风险：

-   运行未启用PAM编译的openssh-server软件包，或运行openssh-server-pam但配置了UsePAM no。
    
-   PasswordAuthentication配置为yes，这是OpenSSH的默认值。
    
-   存在密码字段为\*的账户，即未设置密码的账户。
    
-   至少有一个本地账户的密码哈希以$5$或$6$开头。
    

攻击者还需要掌握一个无密码账户的用户名。只要设备上存在一个设置了密码的账户，所有无密码账户都会暴露。公告显示，该攻击单次连接就能100%成功。

在Alpine系统中，未设置密码的账户包括以下几类：

-   通过adduser命令未设置密码创建的仅密钥登录用户，或通过usermod -p '\*'命令配置的用户。
    
-   通过musl-nscd从目录服务同步的用户，这类用户没有shadow条目。
    
-   root账户：从Alpine 3.16版本开始，基础镜像中的root账户默认配置为root:\*。
    
-   使用tiny-cloud构建的官方云镜像中的alpine用户。
    

root账户受默认配置PermitRootLogin prohibit-password保护，只有管理员设置PermitRootLogin yes时，才能直接登录root账户。但如果可被攻击的账户能通过doas等方式提权至root，这层保护就会失效。

3.18.11到3.24.3版本的tiny-cloud镜像，默认为alpine用户配置了免密doas权限。这类镜像首次启动时是安全的，但一旦设备上出现任意$6$哈希（例如管理员设置控制台密码后），就会面临攻击风险。攻击者可登录alpine账户，再通过doas提权至root。

未运行sshd的容器、配置了PasswordAuthentication no的系统，以及通过cloud-init初始化（自动写入该配置）的云镜像不受影响。/etc/shadow中密码字段为!的锁定账户不受影响，不存在任何$格式密码哈希的设备也不受影响。

该漏洞并非Alpine独有。发现并上报漏洞的Wakefield机构研究员Özgün Kültekin在技术分析中指出，其他基于musl的系统（包括OpenWrt、Buildroot、Yocto）也需要开展排查。

OpenWrt的文档显示，系统默认使用Dropbear处理SSH连接，他确认Dropbear不受该漏洞影响。只有当管理员在OpenWrt上手动安装OpenSSH服务端时，才可能存在该漏洞风险。

Part02

升级软件包重启服务可修复

在Alpine系统上，修复流程为先更新软件包再重启服务——升级软件包不会自动重启正在运行的sshd进程，具体步骤如下：

-   更新软件包：执行命令apk upgrade -U -a。
    

-   重启sshd服务：执行命令rc-service sshd restart。
    

3.21.10、3.22.8、3.23.8、3.24.4这几个点发布版本已预装修复后的软件包。3.16到3.21分支虽已过支持周期，但也同步推送了修复包。

若云实例基于版本号低于上述点发布版的tiny-cloud镜像创建，仍需手动更新，或采用下文的配置缓解方案。

如果用户自行编译OpenSSH，10.6p2版本已包含该修复补丁，具体可查看版本发布说明。

如果暂时无法升级，关闭密码登录功能也能阻断攻击。操作前需先确认SSH密钥登录正常，且在验证新登录成功前不要关闭当前会话。之后设置PasswordAuthentication no，通过sshd -t命令检查配置无误，重启sshd服务就能生效。

安全公告提供了相关配置命令，可在/etc/ssh/sshd_config.d目录下新增配置片段——Alpine 3.19及以上版本的默认配置会自动读取该目录下的文件。命令还会将/etc/ssh/sshd_config中所有PasswordAuthentication配置行（包括Match块内的相关行）从yes改为no。配置完成后，执行sshd -T | grep -i passwordauthentication命令，输出结果应为passwordauthentication no。

公告建议管理员检查/var/log/messages日志，查找sshd进程输出的Accepted password for记录，确认是否有无密码账户（如alpine、root或仅密钥登录用户）被登录。对于已暴露的设备，还需排查doas使用记录、近期新建的用户、文件及授权密钥。

公告明确指出："如果无法排除已被登录的可能，需按设备已失陷进行处置。"

Part03

长密码触发musl库报错

哈希比对逻辑被绕过

未启用PAM时，sshd会自行完成密码校验。它调用C库函数crypt()将用户输入的密码转换为存储格式的哈希值，再与账户存储的密码字段进行比对。

无密码账户的密码字段仅为\*，长度过短无法存储哈希所需的随机盐值，因此sshd会借用其他有有效哈希账户的盐值完成计算。

对于$5$和$6$类型的哈希，musl的crypt()函数会拒绝处理长度超过256字节的密码，返回 *表示错误。这个返回值* 刚好和无密码账户存储的\*匹配，sshd就会判定认证通过，允许登录。而可利用的密码长度上限为sshd自身设定的单密码1024字节限制。

这一问题源于musl库2012年8月9日的一次变更：当时由于大量程序未校验crypt()调用失败的情况，开发团队将调用失败的返回值从NULL改为"不可匹配的哈希值"。2012年8月29日，musl又新增了256字节的密码长度限制，用于防范拒绝服务攻击。

而sshd借用盐值的逻辑，来自2016年7月15日OpenSSH为修复CVE-2016-6210所做的变更——该漏洞允许攻击者枚举系统中存在的用户名。Özgün Kültekin指出，本次的认证绕过问题从那时起就已存在。

10.6p2版本的代码修改为：当账户存储的密码字段长度短于4个字符时，sshd直接判定比对不通过。OpenSSH表示这只是临时缓解方案，根本原因不在sshd本身。Alpine的稳定版软件包也搭载了针对该问题的补丁。

Part04

团队快速响应发布修复

Damien Miller带领的团队本周早些时候获悉该漏洞，第一时间开发并推送了修复补丁。他在发布公告中表示："团队现在认为，长时间的漏洞保密期存在风险，反而主要给攻击者提供便利。因为近期我们观察到，AI Agent仅需数小时就能重新发现同类漏洞。"

截至今日，该漏洞尚未分配CVE编号。

参考来源：

OpenSSH Issues Emergency Fix for Flaw Letting Long Passwords Bypass SSH Auth on Alpine Linux

https://thehackernews.com/2026/11/openssh-issues-emergency-fix-for-flaw.html
