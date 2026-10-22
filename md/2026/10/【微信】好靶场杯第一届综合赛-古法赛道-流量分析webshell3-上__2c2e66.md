---
title: 【微信】好靶场杯第一届综合赛-古法赛道-流量分析webshell3-上
source: https://mp.weixin.qq.com/s/53Z48tB8wbFw3i2h6klMCw
source_host: mp.weixin.qq.com
clip_date: 2026-10-22T23:34:42+08:00
trace_id: f8538293-51e3-4184-a703-ab30424cabca
content_hash: 2099da5cf7339ec0b1dce6f6b55a8e00dc805b344b5f6f0bcb380f3315da625f
status: synced
tags:
  - 微信
  - 协议分析
  - CTF
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** 通过 Wireshark 分析一段 WordPress 站点遭 fscan 扫描、CVE 漏洞上传 Webshell 的流量，逐步定位攻击者 IP、工具、漏洞路径与木马地址，属于典型流量取证 CTF 题。"
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 40175244-d011-81f8-ae94-ef327f754b29
ioc:
  cves:
    - CVE-2026-1555
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 通过 Wireshark 分析一段 WordPress 站点遭 fscan 扫描、CVE 漏洞上传 Webshell 的流量，逐步定位攻击者 IP、工具、漏洞路径与木马地址，属于典型流量取证 CTF 题。
> 
> - **攻击链起点：** 攻击者 192.168.99.28 先访问受害机 192.168.99.59 遍历路径，查找账号信息文件；确认受害 IP 时，直接沿用该流向即可判断。
> - **扫描工具识别：** 过滤攻击者 ip 后可见“ICMP 全网段探活 → 批量端口扫描 → 服务识别”的行为序列，据此判定为 fscan；存活主机共 6 台（.58/.59/.60/.61/.62/.128），开放端口 80、445、135、139、3306、5985。
> - **指纹与漏洞：** 用 `http.response.code==200&&ip.addr==受害IP` 过滤，查看最大响应包得到 nginx/1.15.11；WordPress 主题 WebStack-1.2024 存在任意文件上传漏洞 CVE-2026-1555，触发点为 `io_img_upload()`，利用路径为 `wp-admin/admin-ajax.php?action=img_upload`。
> - **上传与利用：** 追踪 POST 流发现 UA 为 `curl/8.5.0`、原始文件名 `web.php`；木马落地为 `http://192.168.99.28/wp-content/uploads/2026/06/20260617192508_4dc56fd5.php`（注意目标域名实为攻击者 IP）。
> - **管理工具判断：** 依据 XOR 加密的请求/响应密文与 `getBasicsInfo` 等特征判定为哥斯拉；文中附菜刀、冰蝎、哥斯拉、蚁剑在加密方式、木马特征、流量特征、默认 UA 上的对比表。

**内存余响** *2026年10月22日 22:47*

## 1.提交攻击者IP地址

过滤http

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2df541445fa1fe4.png)

看到192.168.99.28向192.168.99.59发送请求遍历路径查看账号信息文件

答案：192.168.99.28

## 2.提交受害服务器 IP 地址

见上题

答案：192.168.99.59

## 3.攻击者使用什么工具进行了内网资产探测？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6bf4a31c4d9f22a1.png)

过滤攻击者ip

我们可以看到这个攻击者先对整个192.168.99.0/24进行探活，之后批量进行端口扫描

这种“先探活、再扫端口、再识别服务”的行为特征是 fscan

答案：fscan

## 4.攻击者内网扫描了哪些存活主机 IP？（从小到大，逗号分隔）

扫描就是icmp协议

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a38b69aebb1a6d07.png)

因为是存活的主机，会给攻击机响应，所以过滤ip.dst

答案：192.168.99.58，192.168.99.59，192.168.99.60，192.168.99.61，192.168.99.62，192.168.99.128

## 5.受害服务器开放了哪些端口？

找开放端口就过滤

tcp.flags.ack==1&&tcp.flags.syn==1

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/864d071f4ffb3ad1.png)

可以看到开放端口有80，445，135，139，3306，5985

## 6.受害服务器 Web 中间件及版本是什么？

常见web中间件:nginx,apache,tomcat

过滤找一条最大的包

http.response.code==200&&ip.addr==192.168.99.59

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11f085965620c369.png)

答案：nginx/1.15.11

## 7.受害服务器使用的 WordPress 主题名称和版本号是什么？

WordPress 是一个用 PHP + MySQL 开发的开源内容管理系统（CMS）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2a797e326c461464.png)

过滤包含主题

在这里就可以看到主题名称和版本号

答案：WebStack-1.2024

## 8.攻击者利用了哪个 CVE 漏洞？

从上一题我们知道主题是WebStack-1.2024

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0017ede69d36d0c2.png)

在网上搜索就可以知道是任意文件上传漏洞

答案：CVE-2026-1555

## 9.攻击者漏洞利用的完整请求路径（含参数）是什么？

根据上一题我们已经知道是那个cve漏洞

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b393a93fc2f07f86.png)

漏洞造成的原因是因为io_img_upload()这个函数，我们再过滤post请求的时候可以发现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eed1cbde97bfb8b1.png)

所以完整的请求路径就是wp-admin/admin-ajax.php?action=img_upload

## 10.攻击者上传 Webshell 时使用的客户端工具是什么？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e6c7ebe03ee503a0.png)

追踪流

还找到了文件名是web.php

答案：User-Agent: curl/8.5.0

## 11.攻击者上传的 Webshell 在服务器上的完整 URL 是什么？

可以看到上传的webshell就在这下面

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/735366f72fc7c0ea.png)

这里还要带上前面的ip

所以完整的就是

答案：http://192.168.99.28/wp-content/uploads/2026/06/20260617192508_4dc56fd5.php

## 12.攻击者上传的 Webshell 原始文件名是什么？

见10题

答案：web.php

## 13.攻击者使用的 Webshell 管理工具是什么？

webshell管理工具就是一类用于批量连接、控制和管理 Webshell 的软件

也就是蚁剑，中国菜刀，哥斯拉，冰蝎这种

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/54d193fbc400dbef.png)

典型的哥斯拉特征

四种主流 Webshell 管理工具的特征对比如下

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| 工具  | 通信加密 | 一句话木马特征 | 流量特征 | 默认 UA |
| 中国菜刀 (Cknife) | 弱/可自定义（Base64、chr 拼接） | 短小，大量 \`@eval\`/\`assert\`+\`$\_POST\` | POST 体有明显的 Base64 + \`;\` 分隔参数 | 无固定特征，可自定义 |
| 冰蝎 (Behinder) | AES 加密（动态密钥协商） | 固定代码结构，带 \`session\_start\` | 首次请求有密钥交换（返回 16 位密钥），后续全是密文 | 默认 Java 类 UA，但可改 |
| 哥斯拉 (Godzilla) | XOR 异或加密（自定义密钥） | 含 XOR \`encode\` 函数、\`getBasicsInfo\` | POST 体为 XOR 密文，响应也是密文 | 可自定义 |
| 蚁剑 (AntSword) | 可自定义编码器（默认 Base64） | \`eval/assert\` + 解码函数 | POST 体带明显 Base64 特征，结构规整 | 默认 \`antSword/v...\` 可识别 |
