---
title: 【先知】基于 nRF Sniffer 的 BLE 智能灯泡协议逆向与重放攻击
source: https://xz.aliyun.com/news/93036
source_host: xz.aliyun.com
clip_date: 2026-10-28T08:26:06+08:00
trace_id: d3e67316-228b-4c1c-b0b5-ff7b0b55efb5
content_hash: 387dbb677c95f29b7a3822fe58f51d290d0b8726d62cf7773e9b610e3ce871ba
status: synced
tags:
  - 先知
  - 协议分析
  - BLE
series: null
feed_source: 先知安全技术社区
ai_summary: TL;DR：用 nRF Sniffer 抓取 LifeSmart BLE 智能灯泡的控制指令，分析发现开关灯报文无校验、无加密，可直接重放实现无授权控制。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 40775244-d011-81a7-953e-f05a068a846d
ioc:
  cves: []
  cwes: []
  hashes:
    - "0e000000000000000000000403020181"
    - "0e000000000000000000000404020180"
    - "0e000000000000000000000405020180"
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：用 nRF Sniffer 抓取 LifeSmart BLE 智能灯泡的控制指令，分析发现开关灯报文无校验、无加密，可直接重放实现无授权控制。
> 
> - **定位指令方法：** 用 Wireshark 过滤 `btatt` 抓取 Write Request / Notification / Read Response，多次开关灯对比，得出海斯格式报文 `0e00000000000000000000040x02018y`，其中倒数第二个字节为每次递增的序号（并不校验），最后一字节 1=开灯、0=关灯。
> - **Handle 映射：** 0x0012 为 Write、0x0014 为 Read、0x0016 为 Notify，Service UUID 前缀 9fdc，Write Characteristic 前缀 ac7b。
> - **重放攻击成功：** 在 nRF Connect 中直接发送捕获的报文 `0e...405020180`，无需原厂 App 即可控制灯泡，说明协议缺少重放防护。
> - **抓包关键机制：** 必须 Wireshark + nRF52832 Dongle 并安装好 extcap 插件，在建立连接前启动抓包，利用 Follow Device 捕获 CONNECT_IND，才能跟踪跳频后的 ATT 数据流。
> - **修复建议：** 控制指令加入随机数/时间戳/会话校验、采用 Challenge-Response 验证来源合法性、启用 BLE Link Layer Encryption 并在配对后限制敏感 Characteristic 的访问权限。

**本文涉及的技术仅供安全研究与学习参考，请勿用于非授权的真实环境攻击。**

## 一、攻击环境

1.  目标设备：LIfeSmart 的某款智能灯泡
2.  手机端 LifeSmart App
3.  抓包工具：Wireshark 4.6.5 + nRF52832 Dongle
4.  发包工具：Android nRF Connect

## 二、BLE 协议

## 1\. BLE 通信流程

什么是BLE？

```plain
BLE是蓝牙低功耗的缩写，是一种专为低功耗应用设计的蓝牙技术标准，与传统蓝牙相比具有更低的功耗、较短的时间和简化的通信协议等
```

BLE工作过程如下：

**1、角色** BLE设备角色主要分为两种角色， `主机（Central）` 和 `从机（Peripheral）` ，当主机和从机建立连接之后才能相互收发数据  
**2、广播** 在BLE技术中，广播用于设备之间的发现和连接。当BLE设备处于广播模式时，它会周期性地发送广播包（Advertising Packets）来向周围的其他设备宣告自己的存在和提供的服务信息。广播数据包最多能携带31个字节的数据，广播包中通常包含设备的唯一标识符、设备类型、支持的服务等信息。

以下是广播在使用过程中的几个重要作用：

1.  **设备发现**：通过广播，其他设备可以扫描周围的信道，检测到广播的设备并获取其信息，从而实现设备之间的发现和识别。
2.  **建立连接**：当设备发送广播包时，其他设备可以解析其中的信息，确定是否与该设备建立连接。广播可以帮助设备快速建立连接，实现数据交换和通信。
3.  **节省能量**：相比于主动扫描或保持持续连接，使用广播可以有效地节省设备的电量。设备只需要定期发送广播包，而无需保持长时间的连接状态。
4.  **提供服务信息**：广播包中可以包含设备支持的服务、特征值等信息，帮助其他设备了解该设备的功能和可用服务，从而实现更加智能化的连接和交互。  
    **3、扫描** 扫描是主机监听从机广播数据包和发送扫描请求的过程，主机通过扫描，可以获取到从机的广播包以及扫描回应数据包，主机可以对已扫描到的从机设备发起连接请求，从而连接从机设备并通信。

**4、连接**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c1346ad5c3e783b.png)  
（图文部分参考自： [https://zhuanlan.zhihu.com/p/687355390）](https://zhuanlan.zhihu.com/p/687355390%EF%BC%89)

## 2\. ATT/GATT协议

[4\. 蓝牙协议ATT、GATT层介绍 — bluetoothlover_wiki 0.0.1 documentation](https://asfsdfasf.readthedocs.io/en/stable/01_helloworldzlg/02_introduce/03-%E8%93%9D%E7%89%99%E5%8D%8F%E8%AE%AEATT%E3%80%81GATT%E5%B1%82%E4%BB%8B%E7%BB%8D.html)

在这个蓝牙灯泡中，ATT/GATT交互流程

手机 App  
↓ Write Request (0x0012)  
灯泡  
↓ Write Response  
灯泡  
↓ Notification (0x0016)  
手机 App  
↓ Read Request (0x0014)  
灯泡  
↓ Read Response

## 三、nRF52832 BLE 抓包sniffer

## 为什么需要NRF Sniffer区抓包？

普通windows电脑并不能抓取大部分的BLE通信包，有如下原因：

1.  WIndows蓝牙适配器看不到空中的BLE数据包，而只能看到自己配对，自己参与的通信，例如手机与智能手环通信过程中，电脑只是旁观者，普通的蓝牙网卡看不到完整的通信过程，看不到连接建立后的数据
2.  由于BLE工作在2.4GHz频段，共有3个广播信道（37、38、39）和37个数据信道（0-36）。当配对连接建立后双方会按照算法不断地切换频道，每秒可切换数百次，普通的蓝牙适配器不知道当前在哪个信道也无法同步调频跟踪，所以无法完整监听  
    而nRF Sniffrer可以捕获广播包监听连接建立，同时跟踪调频将数据实时发送给wireshark

## nRF Sniffer如何配置？

首先安装wireshark，注意安装时候需要勾选Npcap和USBPcap  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/191c358fdefe19f1.png)

全部勾选即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/36a4a8e41e92d7a8.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a3e5a5f52dc05a13.png)

其他位置默认即可

注意wireshark最好以管理员模式启动，否则每个抓包节点会一直请求管理员权限

### 安装CP2102驱动

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4b8b0764cbde0768.png)

驱动下载链接：『来自123云盘用户15982553848的分享』CP210x_Universal_Windows_Driver.zip  
链接： [https://1836347495.share.123865.com/123pan/ji9fTd-5mRm3?pwd=V5AK#](https://1836347495.share.123865.com/123pan/ji9fTd-5mRm3?pwd=V5AK#)  
提取码：V5AK

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f5d93a7a1b9611c8.png)

点击选择解压的文件夹安装即可

## Wireshark设置nRF52832 Sniffer插件

打开wireshark：帮助 - 关于

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6d1ff46dee3233d5.png)

把解压内容文件夹extcap中的内容复制到步骤 的路径中。注意这个插件在网上流传版本似乎已经很是古老了，特别是对于与wireshark的插件竟然还在Python 2.7，并且与当前新版本的Wireshark并不能使用，所以我自行对插件进行了一些调整，在现版本下可以完美运行

下载链接： [https://github.com/vstralcn/nRF52832_WireShark_cap-](https://github.com/vstralcn/nRF52832_WireShark_cap-)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2d45e9edc34a563c.png)

在菜单栏中勾选插件：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f4c952b54f1d28de.png)

然后就可以抓包了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cb1aac1817d0a752.png)

## 四、攻击过程

## 1.启用Wireshark开启抓包

需要在建立连接前提前开启

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/126e65c81c304898.png)

## 2.锁定灯泡设备

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0bdbede12df2fbe5.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e68323cf9ff0a6f6.png)

BLE 建立连接后，应用层数据主要通过 ATT（Attribute Protocol）承载，因此使用：btatt 过滤ATT数据包，重点观察Write Request、Handle Value Notification、Read Response等GATT交互行为

## 3.追踪数据包

断开app与灯泡连接，然后重新启动

抓到来自灯泡和手机app的大量蓝牙数据包

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/274135fd8c268752.png)

等待指示灯信号稳定

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/40da03d0e54c96ca.png)

## 4.测试定位信号

重复开关灯捕获信号

关灯信号：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0f311b20673c3286.png)

开灯信号：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/05ad5b9ad09e59c3.png)

可以得出

关灯：0e00000000000000000000040 **50** 20 **180**  
开灯：0e00000000000000000000040 **60** 20 **181**

根据GATT数据包分析，可以得出Handle映射：

|     |     |
| --- | --- | 
| Handle | 作用  |
| 0x0012 | Write |
| 0x0014 | Read |
| 0x0016 | Notify |

Characteristic UUID：

|     |     |
| --- | --- | 
| 项目  | UUID |
| Service UUID | 9fdc... |
| Write Characteristic | ac7b... |

## 5.多次对比验证分析

第一次开灯：0e00000000000000000000040 **4** 02018 **1**  
第一次关灯：0e00000000000000000000040 **5** 02018 **0**  
第二次开灯：0e00000000000000000000040 **6** 02018 **1**  
第二次关灯：0e00000000000000000000040 **7** 02018 **0**  
第三次开灯：0e00000000000000000000040 **8** 02018 **1**  
第三次关灯：0e00000000000000000000040 **9** 02018 **0**

断开设备重新连接配对，然后开灯：  
1开：0e000000000000000000000403020181  
1关：0e000000000000000000000404020180

然而数据包中并没有0e00000000000000000000040 **1** 02018 **1** 和0e00000000000000000000040 **2** 02018 **0**

再次重新配对：

1关：0e00000000000000000000040 **3** 02018 **0**  
根据对比分析发现其实第七个数字并没有校验，只是app端发送时做了每一次递增，实则每次发送同样的也并没有影响，关键只在于最后一个字符为0 或者 1，为0则关灯，为1则点亮

## 6.重放

使用nRF Connect App，发送0e000000000000000000000405020180

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7a7be572ce4073aa.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f96dca5825720ea2.png)

在未使用原厂 App 的情况下，仅通过重放捕获到的 ATT Write Request，即可直接控制目标灯泡状态，说明该设备控制协议缺乏有效的重放防护机制。

## 五、技术点分析

## 1\. Follow Device 机制

由于 BLE 连接建立后会进行信道跳频，因此 Nordic Sniffer 必须提前锁定目标设备并捕获 CONNECT_IND，才能持续跟踪后续 ATT 数据流。

## 2\. 安全性修复分析

## 1\. Replay Attack 防护

当前 ATT Write Request可以直接重放，而没有任何保护措施，可以增加以下保护措施：

### 1.增加随机数 Nonce

当前协议中没有增加随机数或动态字段，攻击者可以直接重放历史 ATT Request即可控制设备，如果在控制指令中加入随机数、时间戳、会话表示，并在设备端校验有效性，从而避免重放攻击

### 2.Challenge-Response机制

在车机ECU，通过Challenge-Response机制进行验证UDS检测来源合法性，当设备在建立连接后，可先下发随机 challenge，由客户端基于 challenge 和共享密钥生成响应值，设备仅接受合法 challenge-response 计算结果，从而避免攻击者直接重放固定控制命令。

### 3\. 加密保护

启用 BLE Link Layer Encryption，并强制设备在配对完成后才能执行敏感控制操作。当前设备协议Characteristic 权限过宽。可以通过增加会话绑定限制
