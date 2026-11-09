---
title: 【微信】Protocol Explorer 把 TCP 握手画活 安全人该补这课
source: https://mp.weixin.qq.com/s/pgLnGPy1tOefxUQAJydEJQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T13:05:46+08:00
trace_id: 406cc9ef-eaf2-4734-83f0-c123aa7d78af
content_hash: 0ca947496c8ae7e3b5f7bb09797bf0049fbe6451d5b3b22741ae2eedd6761518
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
notion_page_id: 41375244-d011-8169-a438-faafadd49ff8
ioc: null
---

**网络安全老宋** *2026年11月9日 12:00*

**导语：** 你好，我是网络安全老宋。安全攻防干货准时送达！

网络安全老宋// 网站推荐 · 协议可视化

// 网站推荐 · 协议可视化

## Protocol Explorer 把 TCP 握手画活安全人该补这课

一个把网络协议"画给你看"的可视化工具，安全人入门、复习、面试前都该点一遍。

协议可视化TCP 握手安全运维

● **一句话精华**  
安全人缺的不是概念，是亲眼看见"包从哪来、到哪去"的那一下。

被问 TCP 三次握手只会背 SYN？我拿 Protocol Explorer 把包走了一遍，安全人缺的不是概念，是"看见包怎么走"的那一下。

今天把这把梯子，连同同类工具，一起交给你。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2a78c1e5ac384866.png)

▲ Protocol Explorer 协议可视化工具（封面）

## 00它到底解决了什么尴尬

学网络协议最常见的三个尴尬：书上讲得头头是道，一合书就忘了报文怎么走；知道 TCP 有三次握手，却说不清 SYN、SYN-ACK、ACK 各自带着什么信息；打开 Wireshark 全是十六进制，看得人想关机。

我见过太多安全新人，面试被问"TCP 为什么是三次不是两次"，张口就卡。不是不懂，是没真正"看见"过包。

Protocol Explorer 把"流程"和"报文"同时摊开在你面前：一边是动画演示数据包在客户端、路由器、DNS、服务器之间怎么跳，一边是类似抓包工具的列表——时间、源地址、目的地址、协议、摘要、大小，一眼能对上。

## 01打开后你会看到什么

默认是 HTTP · Web Communication 一条完整链路：先 DNS 解析，再 TCP 三次握手，最后 HTTP 请求 / 响应。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f73da4d6ead195c.png)

界面下方一张包列表，时间精确到毫秒级，和上方动画同步；能播放、单步、重置，还有速度控制。每个协议还有概览卡片：OSI 层级、默认端口、传输层（TCP/UDP）、数据格式、常见方法 / 报文类型、对应 RFC。

据公开资料，作者一共做了约 14 种协议，还会记录你看过哪些。站点目前是 alpha，作者是 Dilum Sanjaya，功能和协议列表可能还会补全——具体以线上为准，建议你点开自己核实。

## 02安全人为什么该用这把梯子

真实场景：护网值守时，一条告警说"外部大量 SYN 但没 ACK"。新人看不懂，分不清是扫描还是故障。你如果"看见过"三次握手每一步包长什么样，一眼就能判断这是 SYN Flood 试探，还是链路抖动。

排障同理。DNS 解析那一步源、目的搞反，你永远查不到为什么网站打不开。协议可视化先把链路骨架立起来，再上 Wireshark 看细节，效率翻倍。

攻防两端都要懂握手。中间人、会话劫持、TLS 拦截，本质都是在协议交互的某个环节插手。看不懂握手，就看不见攻击面。

我建议把它当面试前 15 分钟复习：把最熟的协议点两遍，比背八股有用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ab5da7418fca523b.png)

## 03同类工具怎么选

Protocol Explorer 不是独一份，按你的目的挑：

|     |     |
| --- | --- |
| 工具  | 特点 / 适合谁 |
| Protocol Explorer | 14 种协议动画 + 包列表，入门复习最快（本文主角） |
| Protocols Visualizer | 按 OSI 七层，可模拟 SYN Flood / ARP 欺骗，看"出事"长啥样 |
| SubnetLayer | 逐包拆解 TCP/IP/ARP/DNS/TLS，配讲解与排障实验，偏教学 |
| Protocol Hierarchy Explorer | 专注协议层级关系 IP→TCP→TLS→HTTP，建整体感 |
| 报文头部可视化 | IPv4/TCP/UDP 头部逐字段，改 TTL 看校验和实时变 |

注：同类工具功能以各自线上站点为准，本文未逐一实测，建议自行核实。

我的判断：入门和复习用 Protocol Explorer 最快；想看攻击模拟选 Protocols Visualizer；真排障还是 Wireshark + tcpdump 兜底。

## 04我见过的坑 & 使用小提示

别信"看一遍就懂协议"。动画里的都是理想路径，真实网络有重传、拥塞、各种异常分支——这些它不画，得靠抓包补。

先选你最熟的协议对照看 2～3 遍，再换下一个；注意界面上的 OSI 层级提示，建立"这一层干啥"的整体感。

alpha 版本，功能可能变，别把它当权威手册；真要写报告、取证，以 Wireshark 抓到的包为准。一句话：它是"先看懂再深挖"的那一层，不是 Wireshark 的替代品。

## 结尾：5 步把它用起来

下面这张清单可截图转发，下次排障、面试前翻出来照着点一遍：

|     |     |
| --- | --- |
| R1  | **打开默认 HTTP 链路** 先把 Protocol Explorer 默认链路点一遍，建立整体印象。 |
| R2  | **单步看握手** 调慢速，单步看 SYN / ACK 各自带的序列号。 |
| R3  | **记住 DNS 那步** 对照包列表，记住 DNS 解析那一步的源 / 目的 IP。 |
| R4  | **面试前 15 分钟** 拿它复习最熟的协议，比背八股有用。 |
| R5  | **真排障上 Wireshark** 动画只管"看见"，取证交给抓包。 |

觉得有用，点个「在看」，转发给那个面试前还在背口诀的兄弟；收藏这篇，下次排障前翻出来当路线图

```javascript
https://protocol-explorer-alpha.vercel.app/
https://bytelens.dev/visualize
```

## 读推荐阅读

这几篇相关的，建议一并看看（链接可直接复制）：

1\. [杀软当 DNS 防火墙？ 这个巧思有 3 道坎](https://mp.weixin.qq.com/s?__biz=MzAxMzIxMjM3Ng==&mid=2247487973&idx=3&sn=149930bfdb44fde57cb04d934fddbb7c&scene=21#wechat_redirect)

2\. [甲方运维：邮件头拆穿钓鱼 验证全过也拦不住的4类伪造](https://mp.weixin.qq.com/s?__biz=MzAxMzIxMjM3Ng==&mid=2247488004&idx=2&sn=3566374b313918fd0b33a7590a7b521b&scene=21#wechat_redirect)

3\. [甲方运维的工具箱 蓝队溯源 6 类开源利器，0 预算也能打](https://mp.weixin.qq.com/s?__biz=MzAxMzIxMjM3Ng==&mid=2247488077&idx=3&sn=502591f7d076071687a1c38af64069c4&scene=21#wechat_redirect)

4\. [还手画的网络拓扑图？三个月就过期了吧](https://mp.weixin.qq.com/s?__biz=MzAxMzIxMjM3Ng==&mid=2247487819&idx=2&sn=173d34e7d8abf12d9adedbb376bf77cc&scene=21#wechat_redirect)

5\. [运维兄弟：监控没告警，不等于没被打进来](https://mp.weixin.qq.com/s?__biz=MzAxMzIxMjM3Ng==&mid=2247488077&idx=2&sn=0aa9daba9b68a4b03a326f576d28b221&scene=21#wechat_redirect)

防御，不是在演练期间发现攻击，而是在演练开始前就把攻击面收敛到最小。

end

不想错过文章内容？读完请点一下 **“在看** **”**，加个 **“关注”**，您的支持是我创作的动力

期待您的一键三连支持（点赞、在看、分享~）
