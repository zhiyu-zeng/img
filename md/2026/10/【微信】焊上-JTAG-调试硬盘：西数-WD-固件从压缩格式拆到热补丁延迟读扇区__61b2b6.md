---
title: 【微信】焊上 JTAG 调试硬盘：西数 WD 固件从压缩格式拆到热补丁延迟读扇区
source: https://mp.weixin.qq.com/s/zdlco2p-pfbVZKyNI8Vemg
source_host: mp.weixin.qq.com
clip_date: 2026-10-06T21:25:25+08:00
trace_id: e250eb18-c853-4370-b73f-c64b0f2f8b99
content_hash: 926d4b16e8c995c7fe13dcb5e0d2ff2f39300b9f01e33a65d215dcecde9d302a
status: synced
tags:
  - 微信
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 为卡 Xbox 360 读盘的竞态窗口，逆向西数 WD 硬盘固件：拆压缩段、焊 JTAG 调试活盘、用后门命令热补丁 RAM 延迟读扇区。
ai_summary_style: key-points
images_status:
  total: 25
  succeeded: 25
  failed_urls: []
notion_page_id: 3f175244-d011-81eb-8fde-f9ec94a5bf59
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
> 为卡 Xbox 360 读盘的竞态窗口，逆向西数 WD 硬盘固件：拆压缩段、焊 JTAG 调试活盘、用后门命令热补丁 RAM 延迟读扇区。
> 
> - **固件解包：** 西数镜像除首段 loader stub 外全部压缩，算法是改动过的 LZHUF（N 由 2048 改 4096、run length 改为减 THRESHOLD），故识别工具认不出，需反汇编后自行重实现。
> - **JTAG 调试：** 板上未贴的 38 针 MICTOR 即 JTAG，OpenOCD + FT232 可断进运行中的 MCU；盘须直连 SATA 发 ATA passthrough，否则超时掉盘、甚至 volmgr 蓝屏。
> - **后门命令：** 西数后门走 `SMART READ/WRITE LOG` 的厂商自定义页 `0xBE`，共 67 项 VSC 处理表；`DMA READ EXT` 并不走这条调用链。
> - **代码藏身处：** 读扇区处理函数不在固件镜像任何地址范围内，位于盘片服务区 overlay（编号 0x11），只能启动后 dump RAM 取得。
> - **热补丁顺序：** 先用 VSC 改 RAM，在 `sub_1671C` 挂钩空转（实测约 450ms，非预设 200ms）验证延迟有效，再考虑写回；对照实验中未改固件的盘利用也成功。

**黑卷的IoT攻防日记** *2026年10月6日 20:33*

## 焊上 JTAG 调试硬盘：西数 WD 固件从压缩格式拆到热补丁延迟读扇区

去年我在做 Xbox 360 的一个漏洞利用（后来变成大家期待的 softmod）时，需要改一块硬盘的固件，去卡一个竞态条件。这事把我拖进了坑：手头几块 HDD / SSD，怎么 dump、分析、现场 JTAG 调试、改固件，一路摸过来。这篇是系列第一篇，只讲在 **没有 AI 帮忙** 的前提下，怎么把西数硬盘固件拆开、看懂、改掉。下一篇再说怎么用 AI 做同类活，以及黑盒推未知指令集。

## 背景

要打的洞是主机从硬盘读数据时的竞态：读请求发出去，到盘回包之间，需要卡出一段足够长的窗口，利用才能稳定触发。当时我对变量理解不够，盘回得太快，窗口不够用。第一反应就是改固件：读到某个特定扇区时，故意拖几百毫秒。

网上改硬盘固件的文章不少，但很少能拿来直接跑。概念不新，我只需要先搞通一块盘，把 Xbox 利用做完，再考虑扩到别的型号。后来竞态用别的办法调准了，其实 **根本没必要改硬盘固件**——但这条旁支还是值得写下来。

从攻击和渗透测试角度看，改 HDD / SSD 固件很有意思。以前不愿碰，是因为嵌入式底下太复杂，逆向极吃时间。硬盘在微控制器层面到底怎么工作？盘片高速转、磁头读写，这种宏观说法人人都会；落到 MCU 上，多数人其实说不清。

我也不清楚。但我认定这个洞不能不打。挡在前面的如果是一块硬盘，那这块盘就得倒下。

## 试验对象

只要是容易买到、能改、能回刷的 HDD / SSD 都行。优先挑 Xbox 360 上常见的品牌（用利用的人多半手里就有一块），外加西数——以前碰过它们的后门厂商命令，能拿底层访问——再加两块手头的三星 SSD。受试对象如下：

![试验用硬盘与固态阵列](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eff0046e97dc3d28.jpg)

型号清单：

-   Samsung HM020GI
    
-   Hitachi HTS545032B9A300
    
-   Western Digital WD3200BEVT
    
-   Samsung PM871a
    

其中一块盘被「羞辱」得很彻底，是因为以前挂过坏的 USB 转接、又挂过坏的 SATA 口……盘本身其实是好的。

### 开干前先摸清路

先上网查这些型号：有没有固件 dump、有没有前人踩过的坑。HDD Guru 论坛上看了不少西数和日立的帖；还翻到 MalwareTech 改硬盘固件的系列，其中一句特别扎心：

\> 动手前我决定先读别人的研究，找个切入点。资源很多对吧？结果发现，我拿来当基础的那些研究，要么是错的，要么根本对不上这块盘。

我的体验一模一样：大多是十五年前的论坛帖，错的或不适用。但碎片拼起来还是能成图。对每块盘的打法是：

-   搞到固件：网上找现成镜像，或自己从盘里 dump。
    
-   塞进 IDA 能分析：压缩、加密都得先拆掉。固件都看不了，后面谈不上改。
    
-   找到回刷改过的固件的路：板载 Flash 手工烧录，或标准 / 后门命令。写不回去，这块盘直接出局。
    
-   分析固件，找到处理读请求的代码。关心的是主机用的 `DMA READ EXT` 。固件里多半有一张 ATA 命令处理表；找到表，就能摸到读命令处理函数，或至少有个起点。这步通常最难。
    
-   写补丁：读到指定扇区时插入几百毫秒延迟。
    
-   把改过的固件刷回盘。
    

## 拿到固件镜像

HDD Guru 上有人用 PC-3000（专业数据恢复设备，靠厂商私有命令诊断、修盘、dump 固件）上传过各种 dump。西数那块在论坛上找到了；发推后有人用手头的 PC-3000 帮我 dump 了 Samsung HM020GI。三星 PM871a 的固件在联想站上的升级工具里，一石二鸟：既有镜像，又能从工具里反出刷写命令。日立那块一直没找到固件，先搁着。

### 西数 WD

论坛上拼出镜像格式，再对着十六进制看了一会儿，结构大致是：

![固件镜像结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7d96a7231128970f.jpg)

很直白：扁平文件里一串静态基址的可执行 / 数据段，前面是段头；段头和数据块各自带 8 位累加校验。写了个 IDA loader 插件往里装，结果发现 **除第一段外全部压缩**。论坛碎片里说过：第一段是 loader stub，给 MCU bootloader 解压并加载剩余段用的——但没人说压缩算法是什么。

先拿压缩块跑识别工具，没结果。于是把第一段当 ARM 逆向。很多 HDD / SSD 的 MCU 是 ARM，还经常多核；这块西数只有一个 ARM 核，省事不少。几分钟后标出了段加载循环和负责解压的函数：

![段加载函数反汇编](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1f44a5d34be8649a.jpg)

解压例程反完，写出可工作的重实现。算法是 **LZHUF**，但改过两处，所以识别工具认不出来： `N` 从 2048 改成 4096；run length 计算是减 `THRESHOLD` 而不是加：

![LZHUF 算法的改动示例](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/873a148053a3a48e.jpg)

更新 IDA loader 后，整包固件按正确基址加载完毕，可以开分析了。

### 三星 PM871a

联想站上的固件 + 升级工具是好策略：OEM 升级工具往往自带解密 / 去混淆，并负责刷写。三星 SSD 固件常被混淆，这块用的是从工具里抠出来的 bit fiddling：

这类工具能覆盖二十多种三星 SSD（外加一堆光驱），拿来扩面很值。去混淆后的镜像前几 KB 像元数据，再往后能看到疑似段描述符：

![两个固件文件对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f44f0193fcf9b0c2.jpg) ![疑似段描述符的十六进制](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c8e5690bb90a70ac.jpg)

红标字节很像代码 / 数据段的内存地址——和 ARM Cortex-M3 内存图也对得上：

![ARM Cortex-M3 内存图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e7419e3e4ff376e.jpg)

再抠一会儿：各段偏移和大小按 16KB 块步进。又写了一个 IDA loader，整包加载完成。

前 28 字节那段长度很怪，可能是 SHA-224 或截断 SHA-256；对比两个同版本、不同形态（2.5" SATA vs M.2）的固件后，更像 **没有强公钥签名** （RSA / ECDSA），但也不能完全排除局部签名——先放下。

### 三星 HM020GI

dump 里能看到明文串和像机器码的东西，但怎么都反汇编不出对应架构。整文件还像是按字翻转过：

![字节翻转后的固件数据](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f979d1756ce91443.jpg)

可能是极冷门 ISA，甚至是 MCU 里跑的自定义字节码。这篇先搁着，第二部分再回来。

## 怎么刷回改过的固件

后面只展开西数这块——花时间最多，也没必要把同样步骤在每块盘上重复三遍。其它盘在第二部分再各自讲独特点。

刷固件三条路：

-   `DOWNLOAD MICROCODE`
    
    ATA 命令：最常见，现代盘升级多半走这条。
    
-   后门厂商命令：修盘 / 诊断，或主要靠盘片服务区 overlay 打补丁的型号。
    
-   板载串口：同样偏修盘 / 诊断。
    

### DOWNLOAD MICROCODE

主机和盘按 ATA 规范通信。 `download microcode` 用来上传新代码：带上尺寸等寄存器，把固件流进去（分块或 DMA），盘可能校验后再写入非易失存储。成功就通断电；失败可能变砖——通常还能救，但要各种硬核手段，普通用户做不了。OEM 升级工具本质就是在走这条命令。

### 后门厂商命令

很多西数盘从不发完整固件升级，而是把新代码写到盘片 **服务区** 里的 overlay / module。服务区平时不可见，里面有型号 / 序列号、几何、SMART，以及启动时加载进内存的补丁代码。PC-3000 里能看到一长串 module：

![PC-3000 显示西数服务区模块](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4b4fd807753688c4.jpg)

访问靠后门命令。西数走 `SMART READ/WRITE LOG` ：本来用来读写 SMART 页，参数里有个 8 位 log address。ATA 规范给了一段「厂商自定义」区间，修盘和诊断命令就藏在这里：

![ATA 规范中的 log address](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/08b59d3fce00a141.jpg)

### 物理串口

很多盘在 SATA 口旁边有 4 针 RS232，可以下修盘 / 诊断命令。厂商和型号命令集不同，有的网上有文档，有的只能挖固件。这篇先不展开串口，第二部分再说。

![硬盘串口接线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/094135b802c0d476.jpg)

### 西数板上的 SPI Flash

计划是用后门命令把改过的镜像写回去。解包 / 打补丁 / 重打包的 Python 脚本已经有了，缺的是写盘工具。怕的是：前几次补丁写砸，后门命令也跟着废，盘就回不来了——没有稳妥恢复手段，可能连续砖十几块才有进展。

好在西数主固件有两个落点：一是 MCU 内部 Flash（我这块在用）；二是部分型号板上的 **SPI Flash**，会覆盖内部 Flash。我这块没贴 SPI 芯片，但焊盘在，焊上芯片和几颗电阻，就能让 MCU 从 SPI 启动：

![SPI Flash 芯片位置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b6df50ad0594dabe.jpg)

计划：改固件先测 SPI；一旦刷成起不来或刷不进去，用外部编程器在线重刷。订了几颗合适的 SPI 芯片，等货期间先干分析。

## 分析固件

最难的一步：找到处理读请求的代码。这层固件几乎没有字符串可蹭，还散在多个内存段，有的段甚至不在镜像里。得换思路。

### 你调试过硬盘吗？

西数多数盘板子上有未贴的 38 针 MICTOR，就是 JTAG。焊几根线，就能对跑着硬盘的 MCU 做硬件级调试——对， **调试一块活硬盘**。

![JTAG 线焊在硬盘电路板上](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5daf70ebf77be06b.jpg)

能下断点、看内存和寄存器、单步，同时从 PC 发命令，价值极大。麻烦也不少：

-   盘要直接挂 PC 的 SATA，才能发 ATA 命令看断点是否命中（手头 USB 转接不支持 ATA passthrough）。
    
-   超时不回包，Windows 会当盘失踪，后续通信全挂，有的版本甚至 volmgr 直接蓝屏。
    
-   调试时盘偶尔会进怪状态，得断电重启才正常。
    

这是我第一次玩 JTAG，边学边试。OpenOCD + FT232 配了一通，总算连上并断进去：

![OpenOCD 连上硬盘 MCU](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b35f4ec99d7fd10c.jpg)

tap 配置大致参照 MalwareTech 的实验，但这块 MCU 略有不同；我只稳定认出了第一个核，有没有多核不清楚。下一步：写个小工具发命令。

### 厂商专用命令（VSC）

西数后门挂在 `SMART READ/WRITE LOG` 上，叫 vendor specific commands：读写固件、RAM、overlay、其它修盘诊断。眼下最有用的是 **读 RAM**。打法：在地址 `0x41414141` 下内存断点，再发读 RAM、地址同为 `0x41414141` ，断点应命中；看是谁在处理这条 VSC（也就是谁在处理 SMART READ LOG），顺着调用栈往上爬，找公共分发器，再摸到真正的读扇区处理。

发 VSC：构造 ATA passthrough，寄存器设成 SMART WRITE LOG，log page = `0xBE` （厂商自定义页，西数拿来当后门），再附带 1 个扇区的额外数据，里面是 VSC ID 和参数；读 RAM 还要带地址和长度。

![ATA passthrough 示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ba9706dc2351d9a3.jpg)

断点设好，跑测试程序发读 RAM VSC，命中：

![断点处的 GDB 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/877d629759c1edcb.jpg)

读 `0x41414141` 的指令在 `0xFFE1D780` ，落在固件代码段里。

### 钻进肚子里

围着触发断点的函数转几分钟，就能看清它怎么从 VSC 缓冲取参数、做内存读：

![读 RAM 命令处理的反汇编](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/17629b3120e1ddfa.jpg)

往上爬，找到一张 **67 项** 的 VSC 处理表——比预想的多：

![VSC 函数处理表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2a5e98bd0c264b0e.jpg)

调试时 dump 了栈顶 1KB，用来对付函数表间接调用。测试程序加了「读指定扇区」选项，在通向 `_vsc_read_write_memory` 的调用栈上打了几个断点，再跑读扇区—— **一个都不中**。试了很多次才发现：这条链只对 SMART READ LOG、SMART WRITE LOG、IDENTIFY 命中；读扇区用的 `DMA READ EXT` 走的是另一条路。

沿途有几块被到处引用的数组。dump 下来看，其中一个是 40 个元素、每元素 16 字节。摸清字段后打印出来：

![未知数组数据打印](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9979becafaaaf1e5.jpg)

第一列是指向更多数据的指针（暂时看不懂），第二列是函数指针。这些指针有的就在 VSC 调用栈上。阵列像是待处理请求列表，第二列有效地址指向处理函数。

再跑二十来次读扇区，把请求表「灌脏」，读请求对应的条目就露出来了：

![DMA READ EXT 的请求项](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/510651999663b3e9.jpg)

在这个函数上下断点，读扇区果然命中。问题只有一个： **这个函数不在固件镜像的任何地址范围里**，它在别处。

### 这代码跑哪儿去了？

前面说过服务区 overlay。西数爱把额外可执行代码塞进 overlay。启动时 MCU bootloader 把固件里特殊 bootstrap 段拷进 RAM 执行；bootstrap 再解压 / 拷贝镜像剩余段到各自基址；更晚些时候，带可执行代码的 overlay 才装进内存。

![固件与 overlay 模块的内存布局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/64c97936068d79d0.jpg)

overlay 也能用 VSC dump，懒得抠了，盘完全启动后直接 dump 含代码的那段 RAM。后来确认这块 overlay 编号是 `0x11` ，不重要。最后一步：给读扇区路径写延迟补丁。

## 打补丁

代码在 overlay 里，坏补丁比 SPI Flash 更难救。好在现在能用 VSC 改 RAM：先热补丁调通，再考虑写回盘片。

读扇区代码 dump 进 IDA，规划 hook。最终要识别正在读的扇区号，只对某一个扇区延迟；眼下先不管，把 hook 写通，确认利用 PoC 真的能吃延迟——否则前面全白做。找到合适的挂钩点：

![读扇区相关函数反汇编](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd8260aeca1d94a2.jpg)

主处理 `sub_16A5E` 循环调用 `sub_1671C` 真正干活。 `SataRequestArray` 就是前面那 40 元数组。循环从初始读请求开始，只要 `Unk4 != 0xFF` 就继续——大请求大概会拆成多个小请求。hook 放在 `sub_1671C` 靠前几条指令，比塞进循环体好塞。试错之后得到一段汇编：在 `sub_1671C` 里跳到 RAM 空闲洞，大约空转 ~200ms。延迟是拍脑袋算的，不精确，够用就行。测试程序流程：

-   循环 10 次读同一扇区，算平均耗时；
    
-   把补丁写进 RAM，让每次读都拖 ~200ms；
    
-   再跑一轮，比新的平均耗时。
    

结果：

![测试程序输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e6f1e67662cebfe.jpg)

第一，延迟不是 ~200ms，更像 ~450——说了是拍脑袋。第二，干净测试里除第一次外读时几乎是 0ms，多半打到缓存、不用寻道。延迟测试里第一次也是 0ms，可能还是缓存；后面几次都拖长了——这正是我要的。下一步：自上而下挂上 Xbox 利用，看延迟读能不能让洞稳定触发。

## 任务失败得很成功

利用怎么工作、文件怎么准备，花了几分钟想起来。试验布置很简单：

-   一块完全没改过的盘，外供电，只在 RAM 里预打延迟补丁——先别急着写回固件 / overlay；
    
-   盘用 SATA 数据线挂到 Xbox 360；主机启动会读某个扇区，同时后台在「搞事」（以后的文章再写）；
    
-   读够慢，利用就该触发，壳体光环整圈橙灯亮。
    

任何合格的假科学家都会先做对照：不改固件启动，确认利用 **仍然失败**；再改 / 不改来回多轮，建立对延迟补丁有效性的信心。

然后——连续高压工作一周、当时已经快 30 小时没睡——对照实验里， **硬盘完全没改，利用就成功了**。以为是运气，断电重启好几次，几乎次次中；盘也断电重启确认过。旁支到此结束，睡觉。醒来再查：为什么洞突然自己好使了。

## 结语

之后几天把 Xbox 360 那个洞周围的变量想明白了，再也没必要改硬盘固件。手头每块 HDD 都能打通；唯一例外是 SSD——回包太快，竞态不稳。这趟嵌入式深潜学到很多，对底层逆向更有底气。遗憾的是，我还是说不清硬盘到底怎么工作。出于好奇本可以再挖，但没硬动机，就搁下了。后来玩 AI 时又捡起来，想看黑盒分析嵌入式时 AI 能走到哪——敬请期待第二部分。

硬盘固件分析其实有人做过，但公开讨论极少。老盘信息要靠翻几十年含糊甚至错误的论坛帖，拼不出完整图。Travis Goodspeed 和 Sprite（Jeroen Domburg）有些有意思的公开材料（尤其 Travis 的反取证向）。信息少，部分原因是怕帮坏人做盘上恶意软件——有道理，但第二部分用 AI 辅助分析之后，这个担心会淡很多；何况硬盘恶意软件本来就存在（谢 NSA）。

与其继续捂着，我把写过的 IDA 和固件相关脚本开源了，方便别人也进这个坑：后门命令文档化、固件指纹、甚至反编译（毫无意义，我也绝不信）。代码在我的 GitHub，第二部分出来时会再更新。

源文作者开源了相关 IDA / 固件脚本，值得对照着读。

## 黑卷点评

焊 UART 打音箱、焊 JTAG 打硬盘，姿势不同，思路是通的：先找到 **能活着看代码执行** 的入口（串口、JTAG、厂商后门命令），再在「镜像里找不到的那段」里想办法——西数把关键路径丢进盘片服务区 overlay，和 IoT 里把逻辑塞进外部 SPI / 协处理器，是同一类坑。车联网、工控设备上的存储控制器、T-BOX 周边介质，同样可能藏着 SMART LOG 这类「厂商自定义」后门页；防御侧该默认它们存在，并在供应链和售后通道里管住刷写与调试接口。热补丁 RAM 验证、再考虑持久化，也是改固件时少砖机的基本纪律。仿真、fuzz 可以加速，真机断点和真实 ATA 时序，这一步暂时省不掉。

* * *

![免责声明与星球引流](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c71599ddc1dd749.jpg)

### 往期推荐

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485532&idx=1&sn=830a2906b6710b7fb97e14a1b4cbd62e&scene=21#wechat_redirect)
    
-   [拆机焊 UART 还不够：Nokia Beacon 1 从受限串口到 CGI 注入 + Qiling 算口令](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485552&idx=1&sn=e530240c9e9ca18dbd50c9a14c73017b&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
    
-   [拍桌子才出 root：FiberGateway GR241AG 从 UART 故障注入打到 MEO 公网 WiFi RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485879&idx=1&sn=1a549dff133bb8e302e078eee1369559&scene=21#wechat_redirect)
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9f4f4bfecd8fca87.png)
