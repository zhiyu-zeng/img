---
title: 【微信】绕过 Carbonara 补丁：拆 MediaTek DA2 堆溢出 heapb8 到任意代码执行
source: https://mp.weixin.qq.com/s/RE1g2wcOVHy41-HyjzjLqA
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T15:57:26+08:00
trace_id: 2bf2417b-4980-4a03-9aa0-023cc6e9bec8
content_hash: d22bc09492841fd0e7444f0291761567ecde4c1383ad3b0dfe88e055da040afd
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 在已打 Carbonara 补丁的联发科 V6 设备上，利用 DA2 USB 文件下载路径的堆溢出 heapb8 覆写 DPC 回调，可实现任意代码执行。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 40f75244-d011-817a-8996-fb1a6cf092cc
ioc:
  cves:
    - CVE-2025-20656
    - CVE-2025-20658
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 在已打 Carbonara 补丁的联发科 V6 设备上，利用 DA2 USB 文件下载路径的堆溢出 heapb8 覆写 DPC 回调，可实现任意代码执行。
> 
> - **漏洞根因：** `fp_read_host_file` 按主机声明的 advertised_size+4 分配缓冲，收包循环却按 packet_size（0x20000）读取、仅在收满声明长度时停止——声明 0x13FC 实发大包即可写穿相邻堆块头，且 USB 原始载荷每个字节（含空字节）均可控。
> - **利用链：** ARM64 上 `free()` 会把 alloc.size 写到 alloc.ptr+0x10，覆写下一块 ptr/size 即得任意写；再把位于 .bss 固定地址的 DPC.cb 改为 shellcode 地址，命令循环结束即跳入执行。
> - **烟雾弹：** XML 路径上 `mxml_escape` 固定 512 字节缓冲确可越界约 172 字节，但文件名是 XML 字符串、空字节进不去，拼不出假堆块头，属死胡同；花文件名与主动关闭 UART 日志皆为混淆。
> - **落地效果：** payload hakujoudai 先修复被破坏的堆并注册自定义命令再回到命令循环，经 penumbra 集成后可读写分区、刷镜像、解锁 bootloader；作者推断对应 CVE-2025-20658 / CVE-2025-20656。
> - **分析方法：** Chimera 有反分析，故用 Beagle USB 480 硬件旁路抓包，配合 UART 观察设备侧日志（BROM 115200 8N1、后续 921600），并需应对 `g_log_switch` 被关闭的情况。

**黑卷的IoT攻防日记** *2026年11月5日 14:53*

2025 年 9 月，GSM 工具 Chimera 悄悄宣称「世界首发」支持 Dimensity 9400 / 8400——而这些 SoC 上的 Download Agent，早在 Carbonara 补丁之后编译。

要么它绕过了补丁，要么手里捏着新洞。R0rt1z2 和 shomy 决定把这条路摸清楚。

![GitHub 评论：有人丢出 Chimera 的 USB 抓包](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0ccb5a0723215bcc.png)

几个月的 USB 抓包、连夜逆向、无数次回退之后，他们挖出了 **heapb8** （读作 heap-bait，「堆饵」）：DA2 USB 文件下载路径上的堆溢出，能在已打 Carbonara 的 V6 设备上拿到任意代码执行。

![攻击链示意：USB 多发 → 覆写块头 → DPC.cb → shellcode](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5badc6df82af38c3.png)

## 一、战场从 BROM 挪到了 DA2

联发科设备有两套 USB 下载面：BootROM 和 Preloader。前几年 MTKClient 一类工具，主打 BROM USB 栈漏洞。

新 SoC 上 BROM 洞基本被补完，不少 OEM 干脆关掉 BootROM USBDL，只剩 Preloader 这一条路。要刷机、要解锁，就得跟 Download Agent（DA）打交道。

![MediaTek 启动链示意：BROM / Preloader / DA1 / DA2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/812ee7079395ea42.png)

DA 是跑在设备上的小程序，负责 USB 通信和刷写。协议分三代：Legacy V3、XFlash V5、 **XML V6** （codename chimaera）。heapb8 盯的就是 V6 的 **DA2**。

上传 DA 时还要过 SBC / SLA / DAA 三道关。BROM 验完跳 DA1，DA1 再验完跳 DA2——真正干活的下载处理，就在 DA2 里。

## 二、抓 Chimera：Beagle + UART

目标机选 Nothing Phone 2A（Dimensity 7200）。Chimera 有反分析，Wireshark 直接挂容易翻车，于是上了 Total Phase Beagle USB 480 做硬件旁路抓包。

![Beagle USB 480 硬件抓包器](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a04e2c8d2094f9c5.jpg)

光看 USB 不够，还要看设备侧日志。板子背面两颗小焊盘就是 UART：BROM 115200 8N1，后续阶段 921600。

![Nothing Phone 2A 主板（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ff6df0eb7e928b16.jpg) ![UART 焊盘标注（示意）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/828fbc976a129438.jpg)

一个坑：DA 默认可能把 `g_log_switch` 关掉， `outchar()` 直接不往串口吐。Chimera 抓包里还能看到它主动关日志——防你对照。

![Data Center 打开 Beagle 专有抓包格式](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/336479b9677a62a2.png)

## 三、假洞与真洞：XML 烟雾弹

抓包里 Chimera 会发两次 `CMD:SECURITY-SET-ALLINONE-SIGNATURE` 。第一次文件内容居然像 ARM64 指令序言；第二次文件名塞满 `&` 一类特殊字符，然后 **中途 abort**。

AIO 命令会 `mxmlLoadString` 解析 XML，再 `fp_read_host_file` 拉文件。拉之前对文件名做 `mxml_escape` ——固定 **512 字节** 缓冲，特殊字符展开却不设界。一百多个 `&` 扩成 `&amp;`，就能越出约 **172 字节**。

![关键数字示意：V6 / 172B / 0x10 / 两条 CVE](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6474b8eb322e839d.png)

一开始所有人都以为 XML 展开就是 exploit。可文件名是 XML 字符串： **空字节进不去**，假堆块头拼不出来。白忙一场。

![XML 越界覆写块头示意（字节受限）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2903f4573846e3cf.png) ![真假洞示意：XML 死胡同 vs USB 多发](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2d5af87905a10227.png)

## 四、真杀伤：USB「少报多发」

回头看抓包：协议要求主机先声明文件长度。Chimera 声明只要 **0x13FC** 字节，DA 按宣称长度 +4 分配缓冲；实际却多塞数据，读循环按 **packet_size（0x20000）** 收包，只在 `bytes_received == advertised_size` 时停。

结果：缓冲按「小尺寸」开，写入按「大包」走——直接写穿下一块的 header。而且这是 **原始 USB 载荷**，每个字节（含空字节）都可控。

![堆布局示意：AIO 缓冲与相邻块](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae644824eeebe9ee.png)

ARM64 上， `free()` 会把 `alloc.size` 写到 `alloc.ptr + 0x10` 。溢出改掉下一块的 ptr / size，就变成 **任意写**。

写谁？DA2 命令循环末尾有个 **DPC（Deferred Procedure Call）** 结构，`.bss` 固定地址， `cb` 非空就会被调用。把 `dpc->cb` 改成 shellcode 地址，命令一结束就跳进去。

![堆转储：AIO 签名特征](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e79fef3ce25a9bde.jpg)

## 五、落地：NOP 雪橇 + hakujoudai

堆基址随机型/DA 版本变，AIO 缓冲位置也不稳。他们的懒办法：塞大约堆大小 10% 的 **NOP 雪橇** （量级 ~80MB），shellcode 放末尾， `dpc->cb` 指向雪橇 95% 处——滑到哪都进 payload。

![shellcode 块与 NOP 雪橇示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53d2ee85db8c61c4.png)

简化版甚至不用 Chimera 那套「花文件名」：一串 `A` 把 XML 节点分配到 AIO2 缓冲后面就够；特殊字符多半是故意混淆。

![不同利用路径对比示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d2b4d4796b6a2a6.png)

拿到执行后，payload 名叫 **hakujoudai（白杖代）**：先把被搞烂的堆修回去，再注册自定义命令，回到命令循环。penumbra 集成整条链，之后可读写分区、刷镜像，甚至在原厂 DA 会挡的机型上解锁 bootloader。

![penumbra 跑 HeapB8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a15a3ec7d504dad4.png) ![hakujoudai 修堆并注册命令（UART）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/812a16aa2df43550.png)

作者对照补丁，怀疑对应 **CVE-2025-20658** （逻辑问题）与 **CVE-2025-20656** （缺边界检查）——以官方描述为准，编号是推断。

## 黑卷点评

BROM 补完、OEM 关 USBDL 之后，真正还在干活的，是 **Preloader + DA2**。Carbonara 不是终点；GSM 工具「世界首发」新 SoC，往往说明下载面又被撕开一条缝。

-   **声明长度 ≠ 实际写入**
    
    。 `fp_read_host_file` 按 advertised 分配、按 packet 读取——少报多发就是洞。协议状态机要对齐看，不能只信 XML。
    
-   **混淆是给逆向准备的烟雾**
    
    。花文件名、垃圾 padding、主动关 UART，都会把你拖进 XML 死胡同；可控空字节在 USB 层。
    
-   **物理 USB + 未鉴权 DA 面**
    
    仍是量产与售后刷机的高频入口。升带 ALPS09474894 / ALPS09625423 的 DA；产线夹具别把「能进下载模式」当成默认可信。
    

补丁之后，战场在 DA2——堆饵已经抛下去了。

![黑卷点评示意：补丁之后战场在 DA2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/47bcbe2153d7f349.png)

* * *

⚠️  
本人所有文章均为技术分享，均用于防御为目的的记录，请勿用于其他用途，否则后果自负。

🔧 更多内容在星球「黑卷的IoT攻防日记」

这里长期更新，专注 IoT / 车联网 / 机器人 / AI 安全实战：

· 每天一篇一线漏洞拆解与复现思路，紧跟最新 CVE

· 累计整车实测 20+、IoT 组件 100+ 的经验沉淀与踩坑笔记

· 车联网 / V2X / 固件逆向 的资料、工具与字典

· 星球里提问，我 24 小时内必答，一起挖洞、上分、接项目

![星球「黑卷的IoT攻防日记」](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/74bd9299db9f7113.jpg)

👇 扫码进星球「黑卷的IoT攻防日记」· 🎟 早鸟价 ¥98/年

![知识星球付费二维码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffa283de4d072672.png)

**往期推荐**

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485429&idx=1&sn=5a4cdfd6982657765522258b8310892d&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
