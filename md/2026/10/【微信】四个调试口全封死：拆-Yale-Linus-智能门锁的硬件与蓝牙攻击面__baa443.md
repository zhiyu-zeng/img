---
title: 【微信】四个调试口全封死：拆 Yale Linus 智能门锁的硬件与蓝牙攻击面
source: https://mp.weixin.qq.com/s/s7qAchpyF2Y0AJi1MPzW0A
source_host: mp.weixin.qq.com
clip_date: 2026-10-22T14:29:45+08:00
trace_id: 98f0b2ea-3b52-4f7a-954c-33140c74da21
content_hash: f1cd50bc805f74717fcc845effce1693024a60ca8fed2bfebfeab26f2c6cbbbd
status: synced
tags:
  - 微信
  - 硬件逆向
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Yale Linus 智能门锁的 I2C、SPI、SWD、UART 四类调试接口全部被禁用，固件无法提取；蓝牙加密配置合格，但空口泄露了厂商与序列号，并暴露了多余服务。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 40175244-d011-819e-a632-e0cb9f0d768b
ioc:
  cves:
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Yale Linus 智能门锁的 I2C、SPI、SWD、UART 四类调试接口全部被禁用，固件无法提取；蓝牙加密配置合格，但空口泄露了厂商与序列号，并暴露了多余服务。
> 
> - **硬件路线：** Tarlogic 按 OWASP FSTM 流程先在官网、GitHub 和 Dialog/Renesas 论坛找固件资料，一无所获才拆机；主控 DA14680A（Cortex-M4，自带 BLE）同时管理传感器、电机和天线，控制它就等于控制整把锁。
> - **四个调试接口实测：** I2C 上只有磁力计、加速度计、LED 控制器和实时时钟，没有加密芯片；SPI 有 MISO、MOSI、SCK 丝印，但抓包表明固件不经过 SPI Flash；两组 SWD（正面排座、背面测试点）用 JTAG 调试器配合 SmartSnippets Toolbox 也读不出芯片 ID；UART 上电后收不到任何字节，四个接口全部无法进入。
> - **仅剩 chip-off：** 把 BGA 封装的 DA14680 焊下来直读芯片，难度高且有烤坏风险；BGA 本身构成一层额外防护。
> - **蓝牙配置：** 枚举 44 个 UUID，多数不可读且不可写；配对开启 Secure Connection 与 MITM 标志；应用层在链路加密之上再加一层编码（30 字节定长包、10 字节 ACK、特定句柄与 0x02 0x00 尾字节）。
> - **暴露项与生命周期风险：** Manufacturer Name 读出 “August Home Inc.”（August 贴牌），Serial Number 空口可读且 App 绑定仅需序列号，门锁还挂着用不上的 AVDTP；DA14680A 已标 NRND，且曾受 SweynTooth 畸形 BLE 包拒绝服务漏洞影响。

**黑卷的IoT攻防日记** *2026年10月22日 13:53*

先说结论：西班牙安全公司 Tarlogic 把一把 Yale Linus 智能门锁拆到只剩电路板，I2C、SPI、SWD、UART 四类口全部找到——然后全部碰壁。

没有 shell，没有 CVE，没有抽出固件。但这恰恰是一份难得的「防守样板」：每一步为什么打不进去，都写得清清楚楚。

更有意思的是蓝牙那一侧：加密配置挑不出毛病，锁却主动报出了自己的真实厂商、序列号，还挂着一个门锁根本用不上的音视频服务。

![拆一把智能门锁，四个口全碰壁](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d29b5953bc4075d.jpg)

## 第一步：先上网找固件

Tarlogic 走的是 OWASP FSTM（固件安全测试方法论）。按流程，第一步不是拆机，而是先去公开渠道找固件、原理图、泄露代码。

厂商官网、GitHub、GitLab、电子开发论坛，连主控芯片厂商 Dialog/Renesas 的论坛都翻了一遍，一无所获。

网上找不到，就只能从实物上找：把锁整个拆开，在板子上找 JTAG/SWD、UART、连着 Flash 的 SPI。

![门锁主板全貌：红圈是丝印标出的调试与总线测试点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/97a41ead56b466dd.jpg)

## 主控：一颗快退役的蓝牙芯片

板上的大脑是 Dialog（现 Renesas）的 **DA14680A**，Cortex-M4 内核，自带蓝牙低功耗。

它管着加速度计/陀螺仪、磁力计、LED 控制器、实时时钟和电流放大器，同时直接连着天线，负责 BLE 通信和开关锁电机——板上没有第二颗芯片能控制锁舌。

换句话说，拿下这颗芯片，就等于拿下了这把锁。

![主控 DA14680A 特写，BGA 封装](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fcccb6963283e3f2.jpg)

这颗芯片同时支持 SWD、UART、I2C、SPI 调试能力。研究员的思路很直接：挨个口试，看哪个没关。

## I2C：只有传感器在聊天

I2C 总线上抓到了 4 个设备的通信：磁力计、加速度计、LED 控制器、实时时钟。

I2C 上偶尔会挂加密芯片，里面存证书和密钥。可这把锁的 I2C 上没有。

![I2C 引线焊接](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3f680c92c8c12938.jpg) ![逻辑分析仪抓到的 I2C 帧](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/303d0b13b0c5bc7b.jpg)

## SPI：有丝印，没 Flash

板子上直接印着 MISO、MOSI、SCK，一眼就能认出 SPI。

研究员抓下了这组总线的通信帧，仔细看后发现：这不是读写 SPI Flash 的流量。固件不在这根线上走，这条路也断了。

![丝印清楚的 SPI 测试点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59a8c6ba10395fcf.jpg)

## SWD：两组口，一个都不应答

SWD 才是最值钱的口——它一旦开着，就能单步调试、直接读写芯片内部 Flash。

板上丝印标出了两组 SWD：正面一组、背面一组。背面只有测试点，得手工飞线；正面有专用排座，研究员焊了一个 FPC 转标准针座的转接板。

![背面 SWD 测试点飞线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39b8176a68cd2b99.jpg) ![正面印着 DEBUG 的 FPC 排座](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dbf6d8580f0cb181.jpg)

所有接法都试过了，用 JTAG 调试器配成 SWD 模式、配合原厂工具 SmartSnippets Toolbox，连芯片 ID 都读不出来。

研究员判断：要么走线没真正连到引脚，要么调试接口被机制性禁用了。

![SmartSnippets 读不到芯片标识](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0a11d23dfd7f5523.jpg)

## UART：上电一声不吭

最后是 UART。丝印 TX、RX 同样清楚，接上后却一个字节都没收到。

和 SWD 一样，大概率是量产固件关掉了调试输出。

![UART 测试点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a70b3d2a9183de74.jpg)

到这里，四个口全部走完。

![端口记分牌：每个口都找到了，每个口都没打开](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3e8e235ee5d4718e.jpg)

## 剩下的路：chip-off

既然所有接口都封死，想拿固件只剩一招：把 DA14680 从板子上焊下来，直接读芯片。

但它是 BGA 封装，引脚全在芯片肚子底下。拆焊难度大，还有把芯片烤坏的风险。Tarlogic 认为，BGA 本身就给这把锁加了一层安全。

## 真正的隐患：芯片生命周期

硬件篇里最值得厂商警惕的一点，不在接口，在芯片本身。

DA14680A 在原厂页面已被标成 **NRND** （不建议用于新设计）。而它曾受 **SweynTooth** 蓝牙漏洞影响——攻击者发畸形 BLE 包，就能让设备反复重启，造成拒绝服务。这个问题存在了两年多才在这颗芯片上补掉。

![原厂页面：DA14680 已标 NRND](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66ce8de22dd027ea.jpg)

研究员还找到视频：同款芯片、同一原始厂商的设备，在畸形包下循环重启。没升级固件的锁，就是这个下场。

## 蓝牙篇：44 个 UUID 挨个试

一周后的第二篇，Tarlogic 转向蓝牙。这把锁用的是 BLE 4.2，手机 App 靠它开门。

只需要锁的 MAC 地址，研究员用自研工具连上去，枚举所有服务、特征和描述符，对每一项都先读、再尝试写，验证权限配置。一共 44 个 UUID，大部分既不可读也不可写。

其中三个值得说。

**Manufacturer Name**：读出来是「August Home Inc.」。Yale Linus 其实是 August 贴牌，这条线索让研究员顺藤摸瓜，找到了 August 历史上的漏洞记录，包括 SweynTooth。

![厂商名字段暴露真实厂商 August Home](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4524b01dad4c76e9.jpg)

**Serial Number**：公开可读。而在 App 里绑定这把锁，唯一需要的就是序列号。云端虽有其他校验，但这项数据本不该在空口上暴露。

**AVDTP**：音视频流传输协议，一般出现在数码相框这类多媒体设备上。门锁挂着它，只是白白多了攻击面。

## 抓包：加密是做对了的

研究员再抓手机 App 和锁之间的通信，用 Wireshark 解析。

配对参数里，Secure Connection 和 MITM 防护标志都开着；锁没有按键，所以 Keypress 标志没设——合理。

![配对请求：Secure Connection 与 MITM 标志均开启](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3676e6260a49f3d.jpg)

通信在蓝牙链路加密之上，还加了一层应用层编码：发起方发 30 字节定长包，对方回 10 字节 ACK。锁发出的走句柄 0x0014、0x0019，手机发出的走 0x0012、0x0017，长包末两字节固定是 0x02 0x00。

![30 字节长包结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/320cd4a0b096d00c.jpg)

这层应用编码本身有没有弱点，研究员留作了后续课题。

![蓝牙侧：加密做对了，信息却漏了](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2d54722f87ca3015.jpg)

## 给厂商和审计者的清单

把两篇合起来看，这把锁的防守是及格以上的：调试口关了、主控 BGA、配对开到 4.2 能开的最高等级。

没做好的地方也很具体：丝印把每个测试点都标得明明白白；主控快停产；序列号空口可读；挂着用不上的 AVDTP。

![做对的四件事，没做好的四件事](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/62707c6cba80750c.jpg)

## 黑卷点评

![打不进去，也是一份好报告](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c5f40f584f0b4a7a.jpg)

IoT 圈的文章大多是「怎么打进去」，很少有人写「为什么没打进去」。这篇反而是我最想推荐给新人的一篇。

它把一次标准的硬件审计走完了：找资料、拆机、认芯片、挨个口测、记录失败原因、给出下一步代价。没打进去不是结束，而是把攻击成本量化成了「只能 chip-off」。

对厂商，丝印和多余服务是最便宜的修复；对审计者，别忽略芯片的生命周期，那往往是几年后的漏洞来源。

* * *

⚠️  
本人所有文章均为技术分享，均用于防御为目的的记录，请勿用于其他用途，否则后果自负。

![星球「黑卷的IoT攻防日记」](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/76162115a98b4757.jpg)

👇 扫码进星球「黑卷的IoT攻防日记」· 🎟 早鸟价 ¥98/年

**往期推荐**

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485429&idx=1&sn=5a4cdfd6982657765522258b8310892d&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
