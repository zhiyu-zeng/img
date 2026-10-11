---
title: 【微信】从转向 ECU 抠出 AES 密钥：拆 2021 丰田 RAV4 的车载 SecOC（CAN 报文认证）
source: https://mp.weixin.qq.com/s/fk8PQ-UZbP6lCHMeeikImQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-11T09:30:52+08:00
trace_id: 853c514a-197f-467a-8f0a-cb08af4b31c4
content_hash: 82a53584761c81a9afdbc37a3b0cf3986e49053c116fa6f82d3731f947e513ef
status: synced
tags:
  - 微信
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 通过电压故障注入抽出 2021 RAV4 Prime 转向 ECU 固件完成逆向，再借 bootloader 刷写流程无签名校验的缺陷植入 shellcode，从 RAM 抠出 SecOC 的 AES 密钥，从而能对任意 ECU 伪造合法 CAN 报文。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 3f675244-d011-81be-94c2-dc12ae981d71
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过电压故障注入抽出 2021 RAV4 Prime 转向 ECU 固件完成逆向，再借 bootloader 刷写流程无签名校验的缺陷植入 shellcode，从 RAM 抠出 SecOC 的 AES 密钥，从而能对任意 ECU 伪造合法 CAN 报文。
> 
> - **攻击链：** 购买全新转向机备件 → 电压故障注入绕过 RH850/P1M-E 读保护抽固件 → 逆向定位密钥存放位置 → bootloader 刷写漏洞执行自定义代码 → 数秒内经 CAN 回传密钥，整车不改动。
> - **SecOC 机制：** AUTOSAR 用 AES-CMAC 加消息认证码，混入新鲜值（行程计数+重置计数+报文计数+重置标志）防重放；受 8 字节载荷限制，只能截断 MAC 与新鲜值低位；换件写钥依赖 SHE，用当前密钥或 `MASTER_ECU_KEY` 加密下发。
> - **真正死穴：** bootloader 自身不含擦写 Flash 代码，而是把 4KB 数据写入 RAM `0xFEBF0000` 后再请求擦除（Routine `0xff00`）即触发执行；其 payload 只校验 CRC32+CMAC，无非对称签名，抽到固件即可批量制造被认可的升级包。
> - **实现漏洞：** 该 ECU 无 HSM，AES 全软件实现，密钥明文存于 RAM 与数据 Flash；开机后前 1 秒不校验 SecOC；实现非标 SID `0xAB`/`0xBA`；仲裁 ID `0x13–0x1a` 可临时设新钥但仍需母钥；行程计数无防回滚。
> - **车型差异：** 2023 Corolla Cross 沿用同款 MCU 与几乎相同 bootloader 代码，拿代码执行更易（甚至免故障注入），但已启用片内 HSM 使密钥不可搬运；理论上可把 ECU 当签名预言机，或改固件关掉 SecOC；2024 Prius、Corolla 也已铺开 SecOC。

**黑卷的IoT攻防日记** *2026年10月11日 09:15*

先把结论摆上来：有人攻破了一台 2021 款丰田 RAV4 Prime 的电动助力转向控制器，从里面抠出了 SecOC 的 AES 密钥。拿到这把密钥，就能对车内任意 ECU 发出带合法 MAC 的 CAN 报文——车道保持、自适应巡航、自动紧急制动这些底盘功能，都能被外部指令触发。

![2021 RAV4 Prime 转向 ECU 的 PCB，主控是瑞萨 RH850/P1M-E](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a3e833ebe2299599.jpg)

作者的初衷其实很朴素：想在这台车上跑开源驾驶辅助 openpilot，必须先能往 CAN 上发合法报文。但这条路，恰好完整演示了一套「物理抽固件 + 软件逆向 + bootloader 利用」的整车攻击链。

## 整条链长什么样

![从一根转向机备件到伪造 CAN 报文的攻击链示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39a768fc072b01ad.jpg)

一句话概括：买一根转向机备件 → 故障注入抽固件 → 逆向定位密钥 → 用 bootloader 的刷写漏洞跑自己的代码 → 几秒钟把密钥从 CAN 回传出来。下面拆开讲。

## SecOC 到底是什么

SecOC 是 AUTOSAR 定义的车载安全通信标准，核心就一件事：给 CAN 报文加一个消息认证码（MAC），没有密钥的设备就发不出合法报文。这既挡住了攻击者，也顺带挡住了车主自己装第三方设备。

![SecOC 发送端与接收端的整体结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/81fb42fa2348756d.jpg)

早年的报文认证多用厂商自研校验算法，被逆出来就能伪造（Charlie Miller 和 Chris Valasek 当年就干过）。SecOC 改用标准的 AES-CMAC，算得快、很多芯片有硬件支持。代价是：一条标准 CAN 报文只有 8 字节载荷，MAC 只能截一小段放进去。

### 新鲜值：防重放的计数器

为了防止「录下来再重放」，MAC 计算里要混入一个单调递增、跨多次行车都不重复的计数器，叫新鲜值（Freshness Value）。

![新鲜值由行程计数、重置计数、报文计数和重置标志拼成](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3146f4080ac567bc.jpg)

它由四部分拼成：行程计数（每次启动 +1，由网关广播）、重置计数（固定间隔 +1）、报文计数（每发一条 +1，重置计数变化时清零），以及重置标志（重置计数的低几位，截断后也能对齐）。

### MAC 怎么算、怎么拼回报文

![把仲裁 ID、载荷、新鲜值拼起来算 MAC，再截断拼回报文](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/99c9137d90eea24f.jpg)

先把 CAN 仲裁 ID（地址）、载荷和新鲜值拼在一起，用 128 位 AES-CMAC 算出 MAC。真正发出去的报文，是载荷 + 新鲜值的低几位 + MAC 的高几位。接收端用自己的内部状态补齐完整新鲜值，再算一遍 MAC 对比。

### 密钥怎么更新

对称加密意味着所有 ECU 共享同一把密钥，又不能让攻击者轻易拿到。换新件时维修店要能给新 ECU 写入密钥，于是另一套标准 SHE（安全硬件扩展）规定：新密钥要用 ECU 里已有的密钥（当前 SecOC 密钥或永不更换的 `MASTER_ECU_KEY` ）加密下发。

![基于 SHE 的 SecOC 密钥更新流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/993ad2d16182b82b.jpg)

这样新 ECU 能解出新密钥，旁观换钥过程的攻击者却拿不到。听起来很稳——问题出在实现，不在标准。

## 目标硬件与抽固件

![目标硬件与固件提取关键信息](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2d7a6ffa3bd459ee.jpg)

2021 年初第一批带 SecOC 的丰田车刚上市，RAV4 Prime 是当时少数能买到的。可用 SecOC 的 ECU 有转向（EPS）、前视相机、动力总成，作者挑了转向：它要满足 ASIL-D 功能安全，多半用较老工艺、安全特性少，而且固件不大，逆向省事。

车太稀有，没有事故车拆件，作者干脆买了整根全新转向机备件（件号 44250-42310）。里面是瑞萨 RH850/P1M-E，调试口已锁——于是用电压故障注入绕过读保护，把固件抽了出来。抽出来的固件布局很典型：一个负责升级的独立 bootloader，加一个跑转向逻辑、也暴露 CAN 诊断接口的主应用。

## 逆向主应用：三条线索会师

![UDS 处理、CAN 收包、AES 常量三条线索在中间会师示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d7ca0ed73e6025bd.jpg)

逆向的窍门是找几个能对上的「锚点」，从两头往中间凑。作者有三条线索：一是 UDS 密钥更新例程（Routine Control `0x0110` ），靠错误码 `0x35` （密钥无效）、 `0x36` （次数超限）先钉出安全访问处理函数；二是 CAN 收包路径，顺着芯片手册里的 CAN 寄存器跟数据流到算 MAC 的地方；三是 AES 常量，因为没有 HSM、AES 全软件实现，用 `ghidra-findcrypt` 一把就能找到 AES S-Box。

![Ghidra 里标注出的 UDS 函数表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/27bbea193299b00f.jpg)

熬了很多个晚上、标注了 1000 多个函数后，整套 SecOC 校验逻辑被完全看懂，密钥明文就躺在 RAM 和数据 Flash 里（再强调一次：没用 HSM）。接下来只差一个任意读漏洞，或者一条关掉 SecOC 校验的路。但审计了 SecOC、UDS、CCP/XCP 调试协议一圈，并没有直接可用的洞。

### 几个值得记的发现

![审计中记录的四个有意思的点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3678d93c7b684744.jpg)

虽然没直接找到突破口，有几点很有意思：开机后前 1 秒根本不校验 SecOC，MAC 错误的报文照样被处理（时间硬编码，拉不长）；UDS 实现了非标 SID `0xAB` / `0xBA` ，处理 `BAENA` 、 `JTEKM` 这类 5 字符命令，用途不明；一组仲裁 ID `0x13–0x1a` 能临时设新密钥，但仍需 `ECU_MASTER_KEY` ；还有，行程计数没有防回滚。

## 转战 bootloader：刷写协议里藏着洞

应用里挖不动，作者把注意力转向 bootloader。它是独立程序，专门负责刷固件，刷失败就停在 bootloader 等你重刷。逆向完发现一个怪处：bootloader 自己不含擦写 Flash 扇区的底层代码，而是把要刷的数据准备好，再去调用一段位于特定 RAM 区域的函数。

换句话说：只要能把代码放进那段 RAM，再触发一次刷写/擦除，就能让它执行。

![六步把 shellcode 跑进转向 ECU 的流程示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c73a10029d55e4e8.jpg)

作者把整套状态机走通，复原出刷写流程：进 bootloader（SID `0x10` ）→ 安全访问登录（ `0x27` ）→ 写 AES 密钥材料（ `0x2E` ，DID `0x203/0x201/0x202` ）→ 上传 4KB 到 RAM `0xFEBF0000` （ `0x34/0x36/0x37` ，这里换成 shellcode）→ 校验 CRC+CMAC（Routine `0x10f0` ）→ 请求擦除任意区域（Routine `0xff00` ），触发 shellcode。

### 安全访问算法

![安全访问的 seed/key 计算示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5406767e6d95d778.jpg)

登录这一步略特别：请求 seed 时还要附带 16 字节数据，ECU 用一个内置 16 字节密钥把它加密，结果当派生密钥去解随机 seed，解出来才是登录 key。好在所有密钥材料都在抽出来的固件里。

### payload 怎么过校验

![payload 的结构与加密步骤示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b81c17a4ba3689f6.jpg)

上传的 payload 格式很讲究：偏移 `0xFD0` 放入口指针，偏移 `0xFE0` 放 CRC32 校验的起始地址和长度，bootloader 要求整块 CRC32 结果为 `0xFFFFFFFF` ，靠精心构造的填充值凑出来；再用从固件里挖到的另一把密钥派生出 key 算 CMAC 放末尾；最后整体 AES-CBC 加密。校验里没有任何非对称签名——这正是死穴：抽到固件，就能造出 ECU 认可的合法包。

## 写 shellcode 抠密钥

既然密钥在 RAM 和数据 Flash、bootloader 又不清 RAM，剩下的就是写段小代码把它们从 CAN 发出来、然后重启 ECU。作者用 Dockerfile 搭了 `v850-elf` 交叉编译器（只编第一阶段 gcc，不用标准库），用 C 写 shellcode 直接操作 CAN 外设寄存器， `-ffreestanding` 编译、 `objcopy` 转成裸二进制，再套上面那套 payload 封装发进去。

最终效果：几秒钟抠出 SecOC 密钥，整车不留任何改动。有了密钥，就能给任意 ECU 发合法报文，控制 LKA、ACC、AEB。

## 老车能打，新车呢

![软件 AES 无 HSM 与改用 HSM 的对比示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b65cea2fcd8dcb99.jpg)

作者总结，这次能成，栽在两个实现错误：一是 bootloader 上传的 payload 没有真正的非对称签名（本该用 PKCS#1 RSA 这类，让你抽到固件也造不出合法包）；二是没用 HSM 存密钥。

更新的车已经在变。2023 款 Corolla Cross 用的是几乎同款 MCU、同套 bootloader 代码，所以拿代码执行同样轻松、甚至不用故障注入就能抽固件；但它开始用芯片内 HSM，密钥搬不走了。理论上仍可破——有代码执行就能把 ECU 当「签名预言机」，让它替你签任意报文；实战上则要再研究 HSM 具体怎么用，或者退一步直接改固件关掉 SecOC。2024 款 Prius、Corolla 也陆续用上了 SecOC，值得继续跟。

## 黑卷点评

![黑卷点评：车端加密的三条实战红线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cdf9034db160cab2.jpg)

这篇是教科书级的「硬件入口 + 软件逆向」整车案例，和我平时做 IoT / 车联网实测的路径几乎一模一样。结合实战，我想强调三点：

一是 **加密不等于安全边界**。SecOC 用的是标准 AES-CMAC，算法没毛病，但密钥在软件里、明文躺 RAM，等于把门锁换好、钥匙却压在门口地垫下。我评估 T-BOX、网关、动力底盘域的报文认证时，第一句永远是：密钥存在哪，是不是进了 HSM。

二是 **没有安全启动，HSM 也会沦为签名机**。新车把密钥塞进 HSM 很好，但只要还能在 ECU 上跑代码，就能让它替你签任意报文。所以抽固件、看能不能拿代码执行，是我排进整车评估日程的固定项，而不是看到「有 HSM」就放心。

三是 **刷写入口的签名必须是非对称的**。这台 ECU 的 bootloader 只验 CRC 和 CMAC，而这些密钥都在固件里——抽一次固件，就能源源不断造合法升级包。做 GB 44495 / ISO 21434 陪跑时，我会专门盯 OTA 和诊断刷写：验不验签、是不是 RSA/ECDSA 这类非对称签名、能不能防回滚。

防御侧很直接：SecOC 密钥进 HSM、别留软件明文；开上安全启动与固件签名链；刷写 payload 用非对称签名并做防回滚；量产件关掉或熔断调试口；开机初期的「宽限窗口」别留成校验盲区。对车主想装第三方设备这件事，厂商也该给出官方、受控的授权通道，而不是逼大家去抠密钥。

* * *

![免责声明与星球引流](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/292bde22b12950bc.jpg)

### 往期推荐

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485532&idx=1&sn=830a2906b6710b7fb97e14a1b4cbd62e&scene=21#wechat_redirect)
    
-   [拍桌子才出 root：FiberGateway GR241AG 从 UART 故障注入打到 MEO 公网 WiFi RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485879&idx=1&sn=1a549dff133bb8e302e078eee1369559&scene=21#wechat_redirect)
    
-   [四根铜焊盘听出 root：TP-Link TL-WR845N UART 未认证调试口](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485877&idx=1&sn=80508f309304188b09a02e14d5a03733&scene=21#wechat_redirect)
