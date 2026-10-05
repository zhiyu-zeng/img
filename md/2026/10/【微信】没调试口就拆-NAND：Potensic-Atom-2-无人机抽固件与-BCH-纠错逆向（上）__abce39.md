---
title: 【微信】没调试口就拆 NAND：Potensic Atom 2 无人机抽固件与 BCH 纠错逆向（上）
source: https://mp.weixin.qq.com/s/Hd3qRRYvFvWN5C7bkCaYJQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-05T08:53:22+08:00
trace_id: 08479f22-6968-479a-8982-dde81bd78c1d
content_hash: b5f36ae4c5e1ba1cf629190108b8a6c2ac6851809f39e7c344a172b81231c519
status: synced
tags:
  - 微信
  - 硬件逆向
  - 漏洞分析
series: 【微信】没调试口就拆 NAND：Potensic Atom 2 无人机抽固件与 BCH 纠错逆向
feed_source: 公众号聚合·Doonsec
ai_summary: Potensic Atom 2 无人机无 JTAG/UART、升级包加密，拆下 SPI NAND 抽出 544 MiB 镜像，通过熵分析定位 ECC 交错布局并爆破 BCH 参数，修正 24.7 万个位错误后解出完整 UBIFS 文件系统。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 3f075244-d011-8192-8605-c0194efaec22
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
> Potensic Atom 2 无人机无 JTAG/UART、升级包加密，拆下 SPI NAND 抽出 544 MiB 镜像，通过熵分析定位 ECC 交错布局并爆破 BCH 参数，修正 24.7 万个位错误后解出完整 UBIFS 文件系统。
> 
> - **抽取路径：** 官方固件需无人机+遥控器序列号且加密，板面无调试口，只能热风枪拆 MXIC MX35UF4GE4AD（8-WSON，SPI 接口，环氧树脂点胶），商用编程器全不匹配，改用 ESP32 照数据手册发 SPI 命令自写 dump 脚本，得 131072 页 ×（4096+256）字节。
> - **位翻转处理：** 同一芯片三次 dump 的 MD5 各不相同，SPI 无完整性校验；多读几遍做逐位多数表决可消除传输错误，Python 用 numpy 内存映射（memmap）避免 512 MiB 级数据卡死。
> - **ECC 布局：** 把页按偏移算熵，发现高熵段为 1028B 用户数据+28B ECC 重复三次、再 1014B+28B，另有 142B 未用；最终以 SoC 手册的 ECC 布局图为准，NAND 片内 ECC 可忽略，还夹有 BB（坏块标记）与 CTRL 字节，第四段碎片且乱序需单独映射。
> - **BCH 爆破：** 由布局推出每组 224 校验位、m=14、t=16（与手册“16-Bit/1KB”吻合），枚举 14 次本原多项式时用 `range(2**14+1, 2**15, 2)` 只取奇数避开 bchlib 崩溃，叠加位序反转/字节序反转/半字节互换/取反的前后变换组合，22 秒得出 prim_poly=17475 及前后变换均为“位序反转+取反”。
> - **最终结果：** 131072 页中 61387 页含错（46.83%），共修正 247134 个位错误（0.0054%），单块最高 9 个错误；ubi_reader 从三个文件系统中成功提取两个并拿到文件，足以逆出固件解密逻辑。

**黑卷的IoT攻防日记** *2026年10月3日 16:36*

## 没调试口就拆 NAND：Potensic Atom 2 无人机抽固件与 BCH 纠错逆向（上）

德国安全团队 Neodyme 拿一台 **Potensic Atom 2** 航拍无人机（外形和 DJI Mini 4K 几乎一个模子）做硬件研究：官方固件包要序列号才能下、还加了密，板子上又找不到 JTAG/UART，于是直接 **热风枪拆下 SPI NAND**，用 **ESP32 自写读卡脚本** 抽出 544 MiB 原始镜像。真正的硬骨头在后面：读出来的数据有随机位翻转、OOB 区和用户数据交错排布、SoC 用的 BCH 纠错参数手册里只字未提——作者靠熵分析摸清布局，再 **暴力枚举本原多项式 + 前后变换**，22 秒爆出 ECC 参数，修正了 24.7 万个位错误，最终把 UBIFS 文件系统完整解出来。全文较长，分上下两篇：上篇是完整实战流程（拆机 → 抽 NAND → 修位翻转 → 摸 ECC 布局 → 爆破 BCH 参数 → 解出 UBIFS）；下篇是作者附录里的三份完整脚本和 BCH 背后的多项式代数推导。脚本保留原样，可直接拿去复用。

## 引子

2025 年 7 月，Neodyme 的几个人在慕尼黑聚了一次，集中对一批 IoT 设备做安全研究：蓝牙耳机、门锁，还有无人机。其中一台就是 **Potensic Atom 2**——一款带三轴云台 4K 相机的航拍无人机，遥控器接你自己的手机、配合厂商私有 App 使用。飞过 DJI Mini 4K 的人，看到它会觉得非常眼熟。

![Potensic Atom 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/250c701cb3829e0f.jpg)

Potensic Atom 2

本文是 **两篇系列** 的第一篇：这一篇讲怎么拆机、怎么从 NAND 芯片里把固件抽出来；下一篇讲怎么分析无人机固件、App 和遥控器，并找到几个后门和漏洞。

### 目标：拿到固件

准备打一台设备时，最重要的信息之一就是它的固件。想逆向无人机上跑的软件、在里面找洞，首先你得有一份它的拷贝。

拿固件有好几条路，有的侵入性小，有的更有效。

运气好的话，可以直接从厂商官网 **下载固件升级包**。但这类升级接口往往没有公开文档，可能藏在鉴权后面，也可能是加密的。加密固件也不是没用——你“只要”把设备端的解密流程逆出来就行。Atom 2 的情况是：下载升级包需要一组有效的无人机 *和* 遥控器序列号， **而且** 升级包本身是加密的。手里没有解密逻辑，这条路在前期研究里就先搁置了。

另一条非常舒服的路，是利用暴露在外的 **调试接口**，比如 JTAG 或 UART。但这些接口经常没文档、没丝印，或者在量产版里直接被砍掉了。Atom 2 上我们一个都没找到。

最后一条路虽然不一定每次都成功，但永远可以试：把整颗 NAND 芯片焊下来， **逐字节把固件 dump 出来**。风险是手一抖就可能把 NAND 芯片和/或整块板子搞坏。另外有些设备（比如现代智能手机）会用存放在 TPM 之类地方的密钥加密持久化存储，这种情况下光拆 NAND，拿到的只是一堆没法用的密文。好在后面会看到，Atom 2 的 NAND 内容并没有加密。

## Dump NAND 芯片

Dump 一颗 NAND 芯片基本都是同一个套路：

1.  识别 NAND 芯片
    
2.  把它从板子上拆下来
    
3.  搞清楚 NAND 芯片的数据引脚和通信协议
    
4.  把 NAND 芯片接到某种读取设备上
    
5.  读出 NAND 内容
    
6.  把读出来的内容重组成可用的固件——通常包含一个或多个文件系统
    

### 识别 NAND 芯片

Atom 2 里有好几块板子：

![无人机顶面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4d7eb6f15792823f.jpg)

无人机顶面

![无人机底面，主板和部分屏蔽罩已拆掉](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fbbbb12d680a966b.jpg)

无人机底面，主板和部分 RF 屏蔽罩已经拆掉

我们主要关心的是 **主板**，NAND flash 就在上面。主板上有好几个金属 RF 屏蔽罩，照片里已经被我们撬掉或剪开了。

大部分芯片可以靠丝印识别出来。虽然我们主要盯的是 NAND，但把其他芯片也认一遍，后面逆向时会更容易对上号。尤其是大致知道用的是哪颗 SoC，这一点非常关键，后文就会看到。

*（注：下面的丝印和照片不一定完全对得上。我们手上有好几台无人机，丝印大多抄自第一台，照片大多拍的是第二台。）*

### 主板正面

![主板正面，所有屏蔽罩已拆](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d83b0e85b961739e.jpg)

主板正面，所有 RF 屏蔽罩已拆除

**SoC（片上系统，也就是“主控那颗大的”）**

-   丝印：23AP10 VTQMSQKJYJ 4978-CN B3
    
-   没找到完全一致的型号，但这篇文章提到了 21AP10，页面标题是 21AP10 SS928 平替SD3403V100 海思 SOC芯片——也就是一颗海思的移动相机 SoC。
    
-   它挨着两颗外置 RAM 和 NAND flash，是 SoC 也说得通。
    
-   在前代 Atom 的拆机帖里，用的是 `HiSilicon Hi 3559 camera MCU` 。
    
-   我们找到了海思 Hi3519 V100 的数据手册——先凑合用着，足够接近了。
    

**RAM**

-   丝印：SEC340 K4A8G16 5WC BCTD G2F9190AC
    
-   数据手册网上能找到。
    

**ARM Cortex-M4**

-   丝印：GD32F470 VGH6 BUMK618 AL2451 GigaDevice ARM
    
-   数据手册网上能找到。
    
-   SD 卡槽在背面，这颗可能跟 SD 卡相关。
    

**未知芯片**

-   丝印：V2 2441TM4N190.00。 `2441TM` 这个名字在一些大华 WizSense 监控摄像头里出现过，不确定有没有关系。
    
-   另有 2 颗丝印为 8285HE 426656 CS2441 的芯片。
    

### 主板背面

![主板背面，所有屏蔽罩已拆](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9c118d4299b9a077.jpg)

主板背面，所有 RF 屏蔽罩已拆除

**NAND flash**

-   丝印：MXIC X243662 MX35UF4GE4AD-241 5P231800A1
    
-   数据手册网上能找到。
    

**RAM**

-   丝印：SEC407 K4A8G16 5WC BCTD G2K43304C
    
-   和正面那颗同款。
    

**ARM Cortex-M4**

-   丝印：F460JEUA P8VR4400 2416021
    
-   不清楚具体干什么用。
    
-   网上能找到 HC32 **F460JEUA** -QFN48TR 的数据手册（看起来够接近？）。
    

**WLAN + 蓝牙**

-   RTL8821CS
    
-   数据手册网上能找到。
    

### 把 NAND 从板子上拆下来

认出 NAND 之后，把板子固定好，其余元件用耐高温胶带贴起来做隔热。

![无人机和主板，部分区域贴了耐高温胶带](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e041b03841cbade.jpg)

无人机和主板，部分区域贴了耐高温胶带。找调试引脚那阵子，主板还通过排线连着机身。

一般来说，拆芯片就是热风枪加助焊剂的事。但照片里能看出来，这颗芯片其实是用胶（大概率是环氧树脂） **粘在主板上的**。如果你想让芯片固定得更牢、不完全依赖焊点来承力（也避免焊点被拉裂），可以这么做；或者你 *只* 给 NAND 点胶，目的就是让研究员更难把 NAND 撬下来 dump 你的固件。

总之，拿锋利的小刀划了几刀、加热、再加 *大量* 助焊剂之后，这小东西终于完整地下来了。

*（顺带下来的还有几颗超小的电阻——被我的镊子碰掉，然后立刻找不着了。这块主板就此报废。不过别担心，靠着买了 ~~两~~ 三台的魔法，无人机我们照样能飞。）*

![芯片中间有一块大接地焊盘](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a80e295a4f5d94a9.jpg)

可以看到这颗芯片中间有一大块接地焊盘，能把大量热量导到主板的地平面上——这也让拆焊变得更难一点。

### 搞清楚 NAND 的数据引脚和通信协议

根据 MX35UF4GE4AD 的数据手册，这颗 flash 有 24-pin BGA 和 8-pin WSON 两种封装，我们手上这颗是 WSON。看一眼引脚定义就知道，这颗 NAND 走的是 SPI：

-   **CS#**
    
    ：片选（Chip Select）
    
-   **SI**
    
    ：串行数据输入
    
-   **SO**
    
    ：串行数据输出
    
-   **SCLK**
    
    ：时钟输入
    
-   **WP#**
    
    ：写保护
    
-   **HOLD#**
    
    ：保持
    
-   **VCC**
    
    ：电源（1.8 V）
    
-   **GND**
    
    ：地
    
-   **DNU**
    
    ：不要使用（Do Not Use）
    

那就往每个引脚上焊一根细铜线，再用热熔胶糊住，防止线被扯断。

![飞好线的 NAND 芯片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0f14bef74df36535.jpg)

飞好线的 NAND 芯片

其实 8-WSON 芯片是有专用烧录座的：把芯片夹进去，就能引出好接线的排针。可惜我们带去的座子没一个合适，只好用老派做法。

### 把 NAND 接到读取设备上

SPI 很好打交道。它有两根主数据线 **SI** 和 **SO** （Serial In/Out），你也会看到它们被叫作 “MOSI” 和 “MISO”（主出从入 / 主入从出）。顾名思义，SPI 是主从架构：微控制器主导通信，外设负责响应。

好在这次我们扮演的是微控制器那一端，所以控制权很大。尤其是时钟（**SCLK**）在我们手里。和嵌入式硬件通信，有时难就难在它跑得太快；而 SPI 可以把时钟降到你想要的任意速度。

SPI 是总线协议，同一组数据线上可以挂不止一个从设备。为了避免冲突，每个设备都有自己的一根“片选”线（**CS**）。主设备想跟某个从设备说话时，就把对应的 CS 拉 *低*；CS 为 *高* 的设备完全不响应。

市面上当然有各种高级编程器，能让 SPI dump NAND 变得简单直接。问题是，我们一台都 *没* 搞定：要么物理上插不上，要么速度太快，要么因为某些我们也没搞懂的奇怪原因失败。于是我们照着数据手册里的 SPI 命令， **在 ESP32 上写了自己的 dump 脚本**，通过 USB 串口把数据转发到电脑上。

这样拿到了一份 544 MiB 的 dump，包含 131,072 个页，每页 4096+256 字节。 *（这个“+256”后面还会再说。）*

先用 `binwalk` 看看这份 flash dump 里有什么：

![原始 NAND dump 的 binwalk 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e14b0909ffb0424.png)

原始 NAND dump 的 binwalk 输出

漂亮！能看到一段完整的 ASCII 版权字符串，说明 *多少* 有点东西成功了。镜像末尾还有一堆 UBIFS 镜像，好东西应该都在那儿！

用 `dd` 把它们切出来，再用 ubi_reader 看看里面：

![用 dd 从 NAND dump 里切出第一个 UBI 镜像](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4ad9081014ce615a.png)

用 dd 从 NAND dump 中切出第一个 UBI 镜像。偏移和 binwalk 输出对不上，是因为为了提速用了更大的块大小（bs=1024）。

![ubi\_reader 找到三个文件系统，但还没提取出文件就崩了](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e7fef3fc92bbe5ce.png)

ubi_reader 找到了三个文件系统，但还没提取出任何文件就崩了

嗯，不行。剧透：切出来的镜像是坏的。

如果你干过这种野路子，一定知道一个烦人的小现象：把铜线直接焊在芯片上、插到 ESP32 的引脚上跑 SPI——而 SPI **本身没有任何完整性校验**。

### 随机位翻转

下面是对同一颗 NAND 芯片做的三次 dump：

![同一颗 NAND 三次 dump 的 MD5 各不相同](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/35ce11cca75cb4c8.png)

同一颗 NAND 芯片三次 dump 的 MD5 都不一样，说明读取过程引入了位错误。

从芯片读 4 MiB 数据，收到的位并不全对。没有额外信息的话，你几乎没法知道哪些对、哪些错。运气好的话，dump 出来的数据还能“用”——文件系统能挂载、文件能浏览——但到了后面，你根本分不清正在逆的那个怪函数是真的怪，还是随机位翻转把 CPU 指令搞乱了。

一个比较简单但耗时的绕法：把 flash *多读几遍* （至少三次），对每一位做多数表决。位翻转是随机的、也不算频繁，同一位被连续打中两次的概率就低得多。

小技巧：如果用 Python，记得上 numpy，用数组和内存映射文件来处理。否则哪怕只是 512 MiB 的 flash dump，也会非常费时间、费内存。

```python
import numpy as np
import sys

if len(sys.argv) != 4:
    print(f"Usage: {sys.argv[0]} dump1 dump2 dump3", file=sys.stderr)
    sys.exit(1)

dump_filenames = sys.argv[1:]

a, b, c = [np.memmap(f, dtype=np.uint8, mode="r") for f in dump_filenames]

majority = np.memmap(
    "dump-majority-voting.bin",
    dtype=np.uint8,
    mode="write",
    shape=(a.size,),
)

# quick three-way majority voting
majority[:] = np.where(
    (a == b) | (a == c) | (b != c),
    a,
    b,
)
```

![多数表决后得到一个新的 MD5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ab206b5af950903f.png)

多数表决之后得到一个新的 MD5，继续多读几份样本，这个值也保持稳定。

难道就没有更好的办法吗？有。另外顺便说一句——即使多数表决完全正确，flash 内容依旧是坏的。这个后面再说。

试着处理多数表决后的 dump：

![多数表决后 NAND dump 的 binwalk 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6b997331d9577f28.png)

多数表决后 NAND dump 的 binwalk 输出

![ubi\_reader 解析依然失败](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/31539cf9bdcd2730.png)

ubi_reader 解析 UBI 镜像依然失败——这次连文件系统都没找到（wtf？）

## 带外字节（OOB）与 ECC 的麻烦

有件事我们一直悄悄跳过了：NAND 芯片会区分“用户数据”和“额外数据”。上面那份 dump 里，我们天真地把它们全拼在一起，假设 4096+256 字节的页大小有某种意义。当然，并没有。

另外，多数表决这种 hack 显然也不是操作 NAND 的“正确”姿势。就算是装在正经主板上的正经 SoC，也没法在一颗会产生它检测不到、也纠正不了的随机位翻转的 flash 上跑系统。问题在于，NAND 天生就是不完美的存储介质。多数表决只能纠正 dump 过程中的传输错误，对 **已经存储在芯片上** 的位错误毫无办法！存储单元里的位可能随时间衰减，CPU 写入时也可能出现传输错误。

这个问题当然早就众所周知，所以厂商总会在用户数据旁边留出额外空间做“纠错”。这些额外字节叫作“带外（out-of-band）”字节，用来实现 **纠错码** （Error Correction Codes，ECC）。

### NAND 芯片手册里的 ECC

这颗 flash 芯片自带纠错算法，会预留一部分空间存 ECC。它的组织方式是：

-   2048 个块，每块
    
-   64 页，每页
    
-   4096 字节用户数据 + 256 字节“额外”数据（即带外字节）
    
-   \=> 用户数据共 512 MiB（芯片容量是 4 Gb，不是 4 GB）
    
-   \=> 额外数据共 32 MiB
    

如果启用了片内 ECC，这些额外字节中有一部分会被拿来存 ECC。

当时我们天真地以为每一页就是：

-   4096 字节用户数据，后面跟着
    
-   256（或更少？）字节 ECC，覆盖前面那 4096 字节。
    

但很快就发现，被归为“额外数据”的那些序列里居然有 **可读字符串**！这基本说明它们不是 ECC 数据。

![页内 0x1000 及以上地址属于额外数据](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/87774e20a8935345.png)

页内地址 0x1000（= 4096）及以上属于额外数据

还能看到，用户数据内部有些地方的字符串会突然被截断。这说明我们假设的 ECC 布局是错的。花了好一阵子，我们才搞清楚到底漏了什么。

![字符串 “ignoring the CPU number” 在 0x824 处被截断](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4dcaa0fa605bfbe4.png)

字符串 “ignoring the CPU number” 在 0x824 处被截断

![字符串 “IRQ\_WAKE\_THREAD” 在 0x824 处被截断](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d42cf085a814324.png)

字符串 “IRQ_WAKE_THREAD” 在 0x824 处被截断

### 熵分析

结果发现，ECC 布局并不是简单的“4096 字节用户数据 + 256 字节 ECC”。把所有页并排放在一起，对页内每个第 n 个字节计算熵，会发现有好几段高熵区：

![按页内偏移计算的熵分布](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ef80742228117956.png)

按页内偏移统计的熵分布

为什么看熵？因为我们预期用户数据里时不时会有 ASCII 文本（低熵），而 ECC 数据大多是看起来随机的字节（高熵）。

上图说明页内大致是“约 1 KiB 用户数据 + 28 字节 ECC”这样的分段。具体来说：

-   1028 B 用户数据 + 28 B ECC
    
-   1028 B 用户数据 + 28 B ECC
    
-   1028 B 用户数据 + 28 B ECC
    
-   1014 B 用户数据 + 28 B ECC
    
-   142 B 未使用
    

为什么是这么奇怪的数值？用的又是哪种 ECC 算法？我们 *可以* 先不管，直接把用户数据段抠出来拼在一起。我就不再贴更多 `binwalk` 和 `dd` 截图了，直接 *告诉* 你：这样也拼不出可读的 UBIFS 镜像。好在下一节就能找到这些数值的解释！

### SoC 手册里的 ECC

到这一步，我们已经在不稳定的读取方案和 ECC 布局上折腾了很久。然后才发现，早点去翻 *对的* 文档，本可以省下大量时间。因为 SoC *也* 在做 ECC，不只是 NAND 芯片。实际上，NAND 芯片自己的 ECC 功能完全可以忽略。

SoC 的数据手册列出了几种可选的 ECC 布局，其中一种是这样的：

![SoC 手册中的 ECC 布局示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cf71727d95ef354e.png)

SoC 数据手册中的一种 ECC 布局

这和我们的发现完美吻合，另外还多了之前没认出来的 BB（坏块标记，bad blocks）和 CTRL（某种控制字节？）区域。

照着这张图，把所有 ECC、BB 和 CTRL 段剪掉，就能重建出纯粹的 512 MiB 用户数据。

```python
import sys

import numpy as np

if len(sys.argv) != 2:
    print(f"Usage: {sys.argv[0]} dump", file=sys.stderr)
    sys.exit(1)

dump_filename = sys.argv[1]

PAGE_SIZE_WITH_EXTRA = 4352
PAGE_SIZE_USER_DATA = 4096

user_data_slices = [
    slice(0, 1028),
    slice(1056, 2084),
    slice(2112, 3140),
    slice(3168, 4096),
    slice(4098, 4182),
]

dump = np.memmap(dump_filename, dtype=np.uint8, mode="r")
num_pages = dump.size // PAGE_SIZE_WITH_EXTRA
dump_pages = dump.reshape(num_pages, PAGE_SIZE_WITH_EXTRA)

out = np.memmap(
    "dump-user-data.bin",
    dtype=np.uint8,
    mode="write",
    shape=(num_pages, PAGE_SIZE_USER_DATA),
)
out_pages = out.reshape(num_pages, PAGE_SIZE_USER_DATA)

offset = 0
for s in user_data_slices:
    s_len = s.stop - s.start
    # note: this is an array operation,
    # so we only need to do this once per slice
    out_pages[:, offset : offset + s_len] = dump_pages[:, s]
    offset += s_len
```

![正确拼接用户数据后的 binwalk 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bb71815501334f7f.png)

正确去碎片化后的用户数据区 binwalk 输出

![ubi\_reader 仍然提取不出文件，但至少又能看到一个文件系统](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4f9f691ff445e0fa.png)

ubi_reader 仍然提取不出文件——但至少又能看到其中一个文件系统了

嘿，看这个！又能解出一个文件系统了——虽然还有些错误。看看里面有什么：

![解出来的文件系统是空的](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f9bc1023d13b3148.png)

解出来的文件系统是空的……

唉，可恶。UBIFS 镜像现在至少在语法上 *有点* 对了，但坏得依然足以让里面一个文件都没有。为什么？

要知道，我们现在看到的， *正是* SoC 从 NAND 读出数据后会看到的内容。 *而且* 我们还做了逐字节多数表决——我们这份甚至比 SoC 看到的还干净。

**但是**，谁也不能保证 *NAND 芯片上* 本身没有随机位翻转——也就是说，翻转可能发生在 *写入*、拆焊，或者两者之间的任何时候！

所以看来绕不过去了：必须真正实现 ECC 算法，把 flash dump 里的位翻转纠正过来。问题是： **SoC 跑的到底是哪种 ECC 算法？** 可惜数据手册对此只字未提，只能自己摸。

### 逆向 ECC 算法速成

NAND 上常见的 ECC 算法用的是 BCH 码，由下面这些参数决定：

1.  校验位（parity bits）的数量。
    
2.  纠错能力 `t` ：同一个数据块里最多能同时出现多少个位翻转，超过就“坏透了”，ECC 无法纠正。
    
3.  方程里使用的本原多项式（primitive polynomial）。不知道这是什么的话，暂时就把它当成一个整数参数。
    
4.  计算校验位 *之前*，数据是否、以及如何被变换。
    
5.  计算出校验位 *之后*，校验位是否、以及如何被变换。
    

(1) 和 (2) 可以从 flash dump 推出来。(3)、(4)、(5) 要么找到 SoC 的代码（如果它是软件实现的话）把 ECC 算法逆出来——要么直接暴力枚举。

#### 校验位数量

从 SoC 手册里看到，一共有 112 字节的 ECC / 校验位。但 flash 上的碎片化布局暗示：实际上是 4 组、每组 28 字节的 ECC，各自覆盖一段不同的用户数据。注意这只是有根据的猜测，不一定对；如果后面卡住了，应该考虑推翻这个假设。剧透：我们猜对了。

也就是说，每组有 **224 个校验位** （= 28 字节）。

#### 纠错能力

只要做一个非常合理的假设，这部分就能直接算出来。每段用户数据是 1028 字节，也就是 8224 位。要把这 8224 位表示成一个二元多项式，至少需要 14 次：

-   `2^13 = 8192`
    
    ← 太小
    
-   `2^14 = 16384`
    
    ← 够用！
    

所以本原多项式至少是 14 次（ `m >= 14` ）。

纠错能力由次数 `m` 和校验位数量共同决定。校验位相对 `m` 越多，纠错能力 `t` 越高：

`t = parity_bits / m`

已知 `parity_bits` 固定为 224，再假设工程师把 `t` 取到了最大，就能得出 `m = 14` ，以及

`t = 224 / 14 = 16`

也就是说，每段被覆盖的用户数据最多能纠正 16 个位翻转，再多这段就救不回来了。

`t = 16` 也和 SoC 手册里 ECC 一节的描述吻合：“16-Bit/1KB Error Correction Performance”（见上面那张图）。所以我们相当确信这个假设成立。

#### 本原多项式

这个不知道，只能暴力枚举。因为它是 *二元* 多项式，通常用位向量或者干脆用一个整数来表示。既然 `m = 14` ，那多项式的第 14 位必须是 1，且第 14 位是最高的置位：

`2^14 <= prim_poly < 2^15`

完全在可爆破范围内。

#### 编码前与编码后的变换

有几种变换很常见：要么在计算校验位（“编码”） *之前* 作用在用户数据上，要么在算出校验位 *之后* 作用在校验位上。例如：

-   位序反转
    
-   字节序反转
    
-   高低半字节互换
    
-   取反
    

为什么要这么干？举个例子，其中一种组合对 NAND 存储就特别有用。NAND 页被擦除后读出来全是 `0xFF` 。问题是，一个全 `0xFF` 的页会是：

-   用户数据 = `0xFFFF...`
    
-   ECC = `0xFFFF...`
    

而这 *不是* 一个合法的校验值，也就是说一个干干净净刚擦除的页，会被读成充满错误。原因是：

`parity(0xFF...) != 0xFF...`

但可以耍个小花招：编码前先把用户数据取反，编码后再把校验位取反：

```
user_data            = 0xFF...

inverted_user_data   = 0x00...

parity_bits          = parity(inverted_user_data)
                     = parity(0x00...)
                     = 0x00...

inverted_parity_bits = 0xFF...
```

注意，全零页的校验值 *就是* 全零：

`parity(0x00...) == 0x00...`

所以只要 ECC 算法带上这两次取反，一个刚擦除的页（ `0xFF...`）就会有合法的校验值（ `0xFF...`），SoC 的纠错逻辑就不用为擦除页做特殊处理。

好，回到眼前的算法。我们怎么知道工程师选的就是这两次取反？我们不知道！只能把这些变换全试一遍，看哪个能对上。这 4 种变换的组合数量很少，完全可以暴力枚举。

### 暴力枚举 ECC 参数

总结一下：要验证猜测的参数，需要一段没有错误的用户数据，对它生成 ECC，再看是否和从 NAND 上读到的 ECC 一致。所以爆破脚本要做的是：

1.  找一段没有位翻转的“好”用户数据，以及对应的 ECC 段。
    
2.  遍历所有可能的变换。
    
3.  遍历所有 14 次的可能本原多项式。
    
4.  每轮对这段用户数据生成 ECC，如果和已有 ECC 一致，参数就找到了。
    

#### 挑一段“好”的用户数据

我们需要一段用户数据和它对应的 ECC，且都没有位翻转。可怎么知道某段没有位翻转？不知道！这里 *可以* 耍点小聪明，比如挑一段文字很多的区域，检查文字是否通顺。但偷懒的办法一样好用：多试几段，祈祷其中一段是对的。 *继续爆破，没错。*

```python
PAGE_SIZE = 4096 + 256
SLICE_DATA_0 = slice(0, 1028)
SLICE_ECC_0 = slice(1028, 1056)

def main():
    if len(sys.argv) != 2:
        print(
            f"Usage: {sys.argv[0]} full_flash_dump.bin "
            f"(with {PAGE_SIZE} byte pages)",
            file=sys.stderr,
        )
        sys.exit(1)

    f = open(sys.argv[1], "rb")

    while (page := f.read(PAGE_SIZE)) != b"":
        user_data = page[SLICE_DATA_0]
        known_ecc = page[SLICE_ECC_0]

        # ...
```

如上面脚本所示，我们每页只看第一段，然后直接跳到下一页。当时还不完全确定哪些 ECC 字节覆盖哪些用户数据段——尤其是第 4 段看起来是碎片化的。但我们坚持假设：前 1028 字节用户数据由前 28 字节 ECC 覆盖。剧透：猜对了。再剧透一次：前 3 页的第一段都有位翻转，第 4 页是好的。

#### 遍历所有可能的变换

我们会尝试 4 种变换：

-   位序反转
    
-   字节序反转
    
-   高低半字节互换
    
-   取反
    

```python
def reverse_bit_order(b: bytes) -> bytes:
    # credit to this hack at
    # https://graphics.stanford.edu/~seander/bithacks.html#ReverseByteWith64BitsDiv
    return bytes((x * 0x0202020202 & 0x010884422010) % 1023 for x in b)

def reverse_byte_order(b: bytes) -> bytes:
    return b[::-1]

def swap_nibbles(b: bytes) -> bytes:
    return bytes((x >> 4 | x << 4) & 0xFF for x in b)

def invert(b: bytes) -> bytes:
    return bytes(x ^ 0xFF for x in b)
```

对这些变换，我们要所有可能的子集和排列，但同一轮里不重复使用同一种变换。

```python
TRANSFORMATIONS = [reverse_bit_order, reverse_byte_order, swap_nibbles, invert]

def all_transformation_sequences():
    """
    :return:  Iterator over all possible subsets and
              orderings of transformations
              (without duplicate transformations).
    """
    for transformation_count in range(0, len(TRANSFORMATIONS)):
        for subset in itertools.combinations(TRANSFORMATIONS, transformation_count):
            for permutation in itertools.permutations(subset):
                yield permutation
```

然后把这些组合分别当作前置变换和后置变换跑一遍：

```yaml
# try all combinations of pre-transformations
for pre_transform_seq in all_transformation_sequences():
    user_data_transformed = user_data
    for pre_transform in pre_transform_seq:
        user_data_transformed = pre_transform(user_data_transformed)

    ecc = bch.encode(user_data_transformed)

    # try all combinations of post-transformations
    for post_transform_seq in all_transformation_sequences():
        ecc_transformed = ecc
        for post_transform in post_transform_seq:
            ecc_transformed = post_transform(ecc_transformed)

        if ecc_transformed == known_ecc:
            # success
            ...
```

注意有些组合是等价的：

```
reverse_bit_order(invert(data)) == invert(reverse_bit_order(data))
```

不过我们没去做这方面的优化。

#### 遍历所有 14 次本原多项式

有三种做法：

1.  简单但慢
    
2.  数学很重但快
    
3.  好得多的办法：和 (1) 一样简单、和 (2) 一样快
    

当然，前期研究时我们用的是 (1)，因为有时候动脑子比让电脑低效地算更费时间。事后我花了好几个小时啃多项式代数，琢磨出了 (2)，还挺得意——结果紧接着就发现了 (3)，简单得多、效果一样好……算了，至少重温了一遍大一大二的线性代数。

**(1) 简单但慢**

最简单的办法是把所有 14 次多项式都试一遍。用整数表示的话，就是 `range(2**14, 2**15)` 里的所有整数。这样 *最终* 一定能覆盖到正确的本原多项式，但对很多非本原多项式，bchlib 会直接 SIGSEGV 把整个脚本带崩。

一个糙快猛的绕法是：每个候选多项式都起一个新进程，这样主脚本不会挂。前期研究时我们就是这么干的。能用——但要起一万六千多个进程，所以有点慢。不过也没 *慢到* 没法用，实践中这个办法是可行的。

**(2) 数学很重但快**

*正规* 做法是只把本原多项式传给 BCH 的构造函数。可怎么知道一个整数代表的多项式是不是本原的？靠大量数学。如果你（像当初的我一样）不熟悉多项式代数，但又很想知道原理，可以看下篇里的 **多项式代数小绕路**。

剧透：要动很多脑子，而在我的测试里只比 (3) 快大约 5%。

**(3) 简单又快**

结果发现，bchlib 只在常数项为 0 的多项式上崩溃，也就是偶数。所以只要用 `range(2**14 + 1, 2**15, 2)` ，不用折腾多进程、也不用算数学，直接就能跑。

对很多非本原多项式它仍然会抛运行时错误，用 try-except 接住就行：

```
for prim_poly in range(2**14 + 1, 2**15, 2):
    try:
        bch = bchlib.BCH(t=16, prim_poly=prim_poly)
    except RuntimeError:
        continue
```

#### 校验生成的 ECC

这一步很直接，不用多解释。

完整的 **ECC 爆破脚本** 见下篇（附录）。

```
Trying page 0, userdata segment 0
Trying page 1, userdata segment 0
Trying page 2, userdata segment 0
Trying page 3, userdata segment 0
========== ECC parameters found!
- prim_poly = 17475
- pre_transform_seq = (<function reverse_bit_order at 0x7f7ff1f8f560>, <function invert at 0x7f7ff1f8fd80>)
- post_transform_seq = (<function reverse_bit_order at 0x7f7ff1f8f560>, <function invert at 0x7f7ff1f8fd80>)
- time to brute force: 0:00:22.094555
```

### 还原完整固件

ECC 参数有了，来重组整个固件吧！只剩一个小细节要搞清楚：

哪段用户数据由哪段 ECC 覆盖？已经确认第一段用户数据由前 28 字节 ECC 覆盖，第二、第三段也是同样的对应关系。第四段有点绕：它由 928+84 字节用户数据组成，周围还夹着 BB 和 CTRL 字节。这是怎么回事？经过一番试错、再对照 SoC 数据手册，终于弄清了这一段的 ECC 是怎么算的。

![ECC 字节与被覆盖字节的映射](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b04720e67a27daa.png)

ECC 字节与其覆盖字节的映射关系。第四段是碎片化且乱序的。

接下来只要对每一页套用这个规则——瞧——完整固件 dump 到手。🎉

**最终还原脚本** 见下篇（附录）。

```yaml
> python restore_from_flash_dump.py ../majority-voting/dump-majority-voting.bin

[   0 % ] Extracted page        1 /   131072 (no errors)
[   0 % ] Extracted page        2 /   131072 (errors in page: 5)
[   0 % ] Extracted page        3 /   131072 (errors in page: 6)

...
[ 100 % ] Extracted page   131070 /   131072 (no errors)
[ 100 % ] Extracted page   131071 /   131072 (no errors)
[ 100 % ] Extracted page   131072 /   131072 (no errors)

======== DONE EXTRACTING
- Total pages: 131072
- Pages with errors: 61387 (46.83 %)
- Total bit errors: 247134 (0.0054 %)
- ECC polynomial: 17475
- Correction capacity per chunk: 16
- Highest error count in a single chunk: 9 (56.25 %)
```

再看这个文件的 binwalk 输出，好了 *太多*，看起来确实没有错误了：

![纠错后的 binwalk 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/474766979003c582.png)

纠错后的 binwalk 输出。注意 binwalk 对结果的把握大了很多（绿色文字）。

再用 ubi_reader 提取第一个 UBIFS 镜像，终于得到一个能用的文件系统！

![ubi\_reader 终于从三个文件系统里提取出两个，带文件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/88e544878932fd36.png)

ubi_reader 终于从三个文件系统中提取出两个，而且有文件了！

ubi_reader 在 UBIFS 镜像后段仍然会报错，但这次提取已经足够开始逆向成功解出来的文件了。尤其是，足够把 **固件解密逻辑** 逆出来！

敬请期待无人机系列的 **第二篇**：我们会深入 Potensic Atom 2 的逆向和漏洞分析！

## 黑卷点评：这篇对做车联网/无人机硬件的意义

-   **没有调试口 ≠ 没有攻击面**
    
    ：厂商砍掉 UART/JTAG、给 NAND 点环氧胶、升级包加密，只能抬高门槛。一颗未加密的 SPI NAND 拆下来，整个文件系统和固件解密逻辑就都暴露了，后续 OTA 包也就跟着能解。
    
-   **ESP32 自制读卡器是现场兜底方案**
    
    ：商用编程器夹具不匹配、速度不对时，降低 SCLK、照手册发 SPI 命令自己读，配合多次读取 + 多数表决消除传输误码。
    
-   **ECC 布局以 SoC 手册为准**
    
    ：主控做 ECC 时，NAND 片内 ECC 可以不管。OOB 与用户数据交错、坏块标记和控制字节夹在中间，是很多“镜像解不开”的根因。
    
-   **BCH 参数可以直接爆**
    
    ：从布局推出校验位和 t，再枚举 14 次本原多项式 × 取反/位序等变换组合，几十秒就能出结果；这套思路可以迁移到同类海思方案的摄像头、行车记录仪等设备上。
    
-   **防御侧**
    
    ：存储加密（密钥放在 SoC eFuse/TEE 里）比点胶有效得多；固件解密密钥不要以明文形式落在同一颗 flash 的文件系统里。
    

📌 **下篇预告**：作者附录里的三份完整脚本（最终还原 / ECC 爆破 / 本原多项式生成器），外加从模运算一路讲到本原多项式的 BCH 数学推导，下篇见。

![星球引流卡片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1a27958927417eb8.png)

## 往期推荐

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485532&idx=1&sn=830a2906b6710b7fb97e14a1b4cbd62e&scene=21#wechat_redirect)
    
-   [拍桌子才出 root：FiberGateway GR241AG 从 UART 故障注入打到 MEO 公网 WiFi RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485879&idx=1&sn=1a549dff133bb8e302e078eee1369559&scene=21#wechat_redirect)
    
-   [拆机焊 UART 还不够：Nokia Beacon 1 从受限串口到 CGI 注入 + Qiling 算口令](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485552&idx=1&sn=e530240c9e9ca18dbd50c9a14c73017b&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
