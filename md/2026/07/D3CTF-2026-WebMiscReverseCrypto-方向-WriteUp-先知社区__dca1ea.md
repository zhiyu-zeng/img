---
title: D3CTF 2026 Web/Misc/Reverse/Crypto 方向 WriteUp-先知社区
source: https://xz.aliyun.com/news/92588
source_host: xz.aliyun.com
clip_date: 2026-07-28T16:25:04+08:00
trace_id: 5f1514c8-28fa-48eb-b37e-3b076f07ffaa
content_hash: 37f431f2cf4cf0b42a410755a66d8746c703a5cebfdeaab7e9c0ca5c10a5dac5
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: 本文记录了 D3CTF 2026 中 Crypto/Reverse/Misc/Web 方向的解题过程，综合运用代数求解、模拟执行、状态搜索、半关闭探测与 Web 提权等技术。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ab75244-d011-8179-afec-e4a4959713f6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 本文记录了 D3CTF 2026 中 Crypto/Reverse/Misc/Web 方向的解题过程，综合运用代数求解、模拟执行、状态搜索、半关闭探测与 Web 提权等技术。
> 
> - **Crypto-超定方程直接求解：** 在 GF(3) 上对 53 个二次方程使用 msolve 的 F4 算法，参数变量 x30 的根逐个恢复 31 位三进制向量，无需私钥即可解密 flag。
> - **Reverse-模拟执行绕过 Mach IPC：** iOS Mach-O 中包含 RC4 解密函数，用 Unicorn 装载二进制、将 IPC 收发替换为本地 actor 处理器，完成 288 轮状态校验后直接解密出 40 字节 flag。
> - **Misc-魔方线序探测与代理半关闭区分：** 通过 shadow 结果映射转动命令到物理置换，再用外部 C++ beam/mitm 搜索满足 oracle 的移动序列；gost 与 frp 通过 TCP 半关闭后是否得到 400 响应区分。
> - **Web-旧接口授权链恢复：** 从 sqlite_dbpage 提取已删除抓包，发现 `/dddddtestStat` 接口，利用 ECDH+AES-GCM 加密网关调用该接口获取 exchangeTicket 换得管理员 token，进而读取 `/api/flag`。
> - **Web-Service Worker 预加载窃取：** 利用路径编码绕过作用域限制，注册 Service Worker 控制 `/u/admin/`，启用 navigationPreload 获取 bot 对 dashboard 的导航响应，窃取私有部署记录。

Crypto

D3HFERP

题目描述

附件给出

chall.sage

、

pubkey.txt

与

ciphertext.txt

。题目在 GF(3) 上构造 31 个输入变量、53 个输出方程的混合 HFE/UOV 公钥映射，公开密钥由一组二次多项式组成。

ciphertext.txt

中有 7 个密文块，每块是 53 个 GF(3) 元素。目标是恢复加密的 flag。

源码中的公钥加密为：

,其中

。

明文编码函数

blocks()

会把

len(flag).to_bytes(2, "little") + flag

解释为小端整数，再依次取三进制最低位，每 31 个三进制位组成一个输入向量。

分析过程

pubkey.txt

的首行给出参数

3 31 53

。随后每个方程占三行：上三角二次型、31 个线性系数和常数项。因为源码保存的是对称矩阵

的上三角部分，恢复多项式时必须注意非对角项在

中出现两次：

直接对单个块建立这 53 个二次方程，并增加域方程

即可把解限制在 GF(3)。本题虽然带有 HFE/UOV 结构，但在这个参数下系统高度超定；使用

msolve

的 F4 实现可以直接得到每个块的唯一 GF(3) 解，无需恢复私钥变换

。

下面的脚本把指定密文块转换为

msolve

的输入格式。它读取附件原始文件，按上述系数关系输出 53 个方程和 31 个域方程。

将脚本和题目附件放在同一目录，依次生成七个系统：

msolve

可以从其发布源码构建，或使用已构建二进制。每个块执行：

首块的 F4 过程首先产生如下关键规模：

所有七个输出均为零维、次数为 1 的参数化解。

msolve

输出中的

result\[1\]\[4\]

标识参数变量；本题为

x30

。

result\[1\]\[5\]\[1\]\[0\]

是该块的消元多项式

，其根为

。其余 30 个坐标是常数多项式，但按

msolve

的参数化约定需要取相反数。

这里不能把参数变量固定为一个常数。七个块的参数根分别为：

以下脚本读取七个

block\*.out

，恢复完整的 31 元向量，拼接三进制位并按源码的 little-endian 规则转回字节：

运行输出为：

前两个字节

26 00

是小端长度

38

，与后续 flag 字节数一致。因此最终得到：

Reverse

PacMan

题目描述

附件为 iOS 应用

pacman.ipa

。解压后只有

Payload/MachActorVM.app/MachActorVM

和

Info.plist

；后者给出的显示名为

Pac-Man

，可执行文件名为

MachActorVM

。应用表面上是一个迷宫游戏，界面文本包含：

目标是恢复程序在通关后的真实输出。

分析过程

IPA 本质上是 ZIP 文件，可以先解出 Mach-O：

可执行文件是未加密的 ARM64 Mach-O。

\__objc_methlist

中的

ViewController

方法给出了游戏主线：

restartGame

、

directionUp

、

directionDown

、

directionLeft

、

directionRight

、

stepGame:

和

updateWithFrame:

。迷宫位于

\__TEXT,\__cstring

，共 25 列、13 行；

stepGame:

会将方向传给

0x100007a68

，该函数维护位置、分数、豆子数和步数。分数达到

10000

时，全局完成标志被置位。

updateWithFrame:

在完成标志置位后调用

0x100005c7c

。这个函数并不直接显示结果，而是进行 288 轮状态校验，最后在

0x100006a1c

解密 40 字节数据。该函数的结构是标准 RC4：先以八字节状态构造长度 256 的置换表，再对

\__TEXT,\__cstring + 0x3a0

的密文执行 PRGA。密文为：

难点在于

0x100005c7c

通过 Mach message 与四个 actor 交互。对应的请求函数是

0x100006384

，它按记录首字段选择 actor；actor 的三个核心处理器位于

0x100005f18

、

0x100006100

和

0x100006290

。这些处理器以及 RC4 都在附件自身的代码段中，不依赖 iOS UI。因而可以在 Unicorn 中装载 Mach-O，并把 IPC 收发改为直接跳转到同一二进制中的 actor 处理器。这样保留题目中的状态链和 RC4 计算，只替换宿主系统无法提供的 Mach IPC 外壳。

下面脚本以解压后的

Payload/MachActorVM.app/MachActorVM

为输入。需要安装

unicorn

：

关键输出如下：

脚本返回值为

1

，说明

0x100005c7c

完成了全部状态校验；打印内容来自其末尾调用的 RC4 解密函数，且长度恰好为内置密文的 40 字节。因此最终 flag 为：

Misc

PRISM's end BLACKBOX

题目描述

题目无附件，只给出一个交互式 TLS 服务：

连接后服务端显示

PRISM's end BLACKBOX

，要求先回传一段反转后的

mirror token

，随后进入一个七层 seal 的交互系统。每个 opening 都会给出当前扫描到的 24 个 sticker id、允许的转动次数、剩余

shadow

次数、目标类型和校验规则。目标是在每个 opening 中用合法转动把当前扫描面调整到 oracle 给出的目标状态，连续打开 7 个 seal 后得到最终结果。

分析过程

连上服务后先处理登录握手。服务端 banner 中有一行：

把

<token>

反转后发送即可进入命令行。实际交互中确认可用命令主要有：

look ids

可以读出六个面共 150 个 sticker 的完整状态；

scan ids

给出当前 opening 需要匹配的 24 个扫描槽位；

oracle

给出本轮目标；

shadow

不改变真实状态，只返回某个转动后的状态哈希；

turn

才真正执行转动；

verify

用于提交当前 opening。

题目中的转动命令每个 opening 都会随机改线，直接把

turn roll low +

理解成固定物理动作会失败。解决办法是先建立一份物理转动库，再用本轮的

shadow

结果反推出命令映射。对完整状态

state

执行物理转动后，服务端使用下面的哈希作为

shadow

trace：

实际复现时先保存一组校准数据：在同一初始状态下依次执行 9 个基础物理转动，记录每次

look ids

的完整状态。对相邻状态比较即可得到每个基础动作的 150 位 permutation，反向动作取逆置换。随后每个 opening 用 5 次

shadow

探测：

把返回 trace 与本地物理转动库逐一比对，可以确定三件事：输入轴到物理轴的置换、输入层到物理层的置换，以及每个轴的正负号。

low

、

mid

两层观测到后，缺失的输入层和物理层由三层集合差直接补出。日志中一轮 wiring 的输出形如：

有了本轮 18 个命令对应的真实 permutation 后，所有 oracle 都可以转化为“若干 sticker 当前所在位置需要移动到若干目标位置”的搜索问题。前几层 oracle 类型较简单：

其中

selected_slots

和

locked_match

都是精确位置匹配；

required_ids

只要求指定 id 出现在 24 个扫描位置中。后续出现的

cycle_program

和

local_delta

会给出若干 cycle。服务端标注

cycle_order = left_to_right

，实际含义是 cycle

(a b c)

中原来在

a

的 id 移到

b

，原来在

b

的 id 移到

c

，原来在

c

的 id 移到

a

。因此目标扫描数组可按下面方式生成：

最后一层出现新的目标类型：

这个类型等价于

selected_slots = 00 01... 23

，即 24 个扫描槽位全部精确匹配

target_ids

。

位置搜索可以先把目标 id 映射成当前完整状态中的位置，再把扫描槽位映射成完整状态中的目标位置：

深度较浅时用双向 meet-in-the-middle。seal5、seal6 中有些目标需要 17 到 20 步，Python 搜索会很慢，因此使用 C++ 写了两个辅助程序：

exact_mitm

负责 12 步以内精确双向搜索，

beam_search

负责在 20/22 步预算内做较宽的启发式 beam。编译命令为：

beam 的评分只依赖当前匹配数量和每个 sticker 到目标位置的单点最短距离，不使用服务端额外信息：

由于外部 C++ 求解可能运行几十秒，期间连接空闲会被服务端断开。实际脚本在等待子进程结束时每 15 秒发送一次只读的

scan ids

作为 keepalive；该命令不会改变状态，也不会消耗 turn budget。

关键交互脚本的主循环如下，省略的函数分别负责解析 oracle、构造 wiring、调用 C++ 搜索并返回 move 列表：

运行方式如下。脚本目录中需要放置校准得到的

calibration4.txt

，以及编译好的

exact_mitm

、

beam_search

：

关键输出可以看到最后一层三个 opening 都是

full_scan_match

，并分别被 11、11、10 步解出：

因此最终结果为：

Proxyport

题目描述

题目给出两个

ncat --ssl

入口，一个是转发服务，一个是交互判题服务：

实际连接时，

rile4iqb4ji6bkdx6gutkldm4f4.cloud.d3c.tf

会返回 PoW banner，因此它是交互判题端；另一个入口作为转发端使用。

交互端连接后先要求完成 PoW，然后进入 20 轮判断。每轮最多允许 5 次 probe，需要判断当前转发端背后使用的是

gost

还是

frp

：

正常提交 PoW 后会进入轮次：

分析过程

PoW 的输入是交互端给出的十六进制字符串

prefix

和自己提交的十进制字符串后缀直接拼接，即

sha256(prefix || suffix)

，满足前 26 bit 为 0 后提交。每次连接的

prefix

会变化，后面的脚本会自动搜索可用后缀。

完成 PoW 后先用普通 HTTP 请求验证转发端的基本行为：

完整请求会被正常转发到后端，返回的是同一类 HTTP 响应，因此无法区分

gost

和

frp

。本题真正有差异的是 TCP 半关闭语义：向代理发送一个没有以空行结束的 HTTP 请求头，然后让

ncat

因 stdin EOF 关闭发送方向。该行为会把“客户端已经不会再发送更多字节”这个状态暴露给代理。

探测命令如下：

实测差异稳定：

出现

400 Bad Request

时说明半关闭被继续传给后端，后端确认请求头已经结束但格式不完整，因此可以判断为

gost

。如果 2 秒内没有任何响应，说明后端仍在等待后续请求头字节，判为

frp

。这里探测端使用

ncat --ssl

而不是 Python 的

SSLSocket.shutdown()

，是因为后者会额外影响 TLS close_notify/半关闭行为，和题目给出的

ncat

交互模型不完全一致。

关键脚本

下面脚本用 Python 维护交互端 TLS 连接，PoW 完成后每轮调用一次

ncat --ssl

探测转发端；每轮只消耗 1 次 probe，低于题目限制的 5 次。

运行方式：

一次完整求解的关键输出如下。每轮的

400

表示判

gost

，

timeout

表示判

frp

：

最终得到：

Web

Ghost Zero

题目描述

题目只给出一个站点：

主页是一个搜索框，正常搜索会返回动漫条目。题目的最终目标是获取

/api/flag

返回的 flag。

分析过程

先确认服务在线：

返回：

前端搜索功能本身就是注入点。直接把查询内容替换为联合查询，可以枚举表名：

关键输出如下：

继续读取建表语句，确认隐藏表

q_8f3c1a72d90e4b65

的字段名为

r4

：

关键输出：

读取隐藏表内容后，可以拿到四个 pcap 元数据和下载路径：

关键输出中包含：

这四份抓包只能看到公开接口和两段 ECDH + AES-GCM 加密通信，单靠它们无法直接恢复明文。继续向下挖数据库页内容，隐藏点出现在

sqlite_dbpage

。读取第 5 页原始页数据：

返回的十六进制页数据里能直接看到一条已经删除的 JSON 记录，关键片段如下：

根据这条残留记录下载删除抓包：

输出哈希与数据库页中的记录一致：

再用

tshark

提取这份抓包中的 HTTP 明文请求和响应：

关键输出如下：

这一步证明了解题链路并不是去破解当前的 ECDH 或 RSA，而是找到一个旧的引导接口：先调用

/ddddddtestStat

拿

exchangeTicket

，再把 ticket 送到

/api/auth/exchange

换成管理员 token。

但直接访问当前实例的

/ddddddtestStat

并不存在，前面的抓包也说明正常前端通信都经过

/api/gateway

。因此接下来要做的是复现前端的加密传输，看看旧接口是不是被藏在 gateway 的

target

字段后面。

本题前端的核心流程是：

1

POST /api/session/guest

领取 guest access token。

2

POST /api/transport/bootstrap

用浏览器生成的 P-256 公钥与服务端做 ECDH。

3

使用 HKDF-SHA256 从共享秘密和

salt

派生

ghost-packet:c2s

、

ghost-packet:s2c

两把 AES-GCM 密钥。

4

按前端稳定序列化规则加密

{"target":...,"body":...}

，再发往

/api/gateway

。

下面的脚本完整复现了这一流程，并直接命中隐藏 target

/ddddddtestStat

，随后再调用

/api/auth/exchange

与

/api/flag

：

运行：

实际输出如下。先是 guest token 与 ECDH 协商结果：

再是隐藏接口

/ddddddtestStat

经由 gateway 返回的解密结果：

把这个

exchangeTicket

交给

/api/auth/exchange

后，服务端返回管理员 access token：

解码这枚 JWT 的 payload 可以看到

role

已经是

admin

，

sub

为

ops-root

。最后带着它请求

/api/flag

：

因此本题的关键不是硬解加密流量，而是通过 SQL 注入挖出隐藏抓包，再从删除抓包中恢复旧版授权链，最后在当前实例的加密网关里命中隐藏 target

/ddddddtestStat

，用它合法领取

exchangeTicket

并换取管理员 token。

最终结果为：

Scope Drift

题目描述

题目提供名为MiniStatic的静态托管站点，复现实例为

https://rtunnctcmlteigsea76pzn7lshy.cloud.d3c.tf

。访客只能向

/u/guest/

上传静态文件，并可通过

/bot

提交一个

guest

页面供

reviewer

访问。

reviewer

打开提交页面后，会继续访问私有的

/u/admin/dashboard

。目标是利用该浏览器流程读取

dashboard

中的部署记录。

分析过程

上传接口对路径只进行了一次解码并检查是否仍位于

/u/guest/

。因此将脚本上传到

/u/guest/%252e%252e/admin/preload.js

时，文件列表中保存的路径是

/u/guest/%2e%2e/admin/preload.js

。在浏览器中注册脚本时使用单层编码路径：

URL规范化会将该脚本URL解释为

/u/admin/preload.js

。未显式指定

scope

时，Service Worker默认作用域就是脚本所在目录

/u/admin/

，因此

guest

页面可以控制之后对

/u/admin/dashboard

的导航请求。

直接在

worker

中使用

fetch(event.request)

读取

dashboard

会得到未授权响应。同一实例上将普通

fetch

结果写回

webhook

，关键输出如下：

这里不能丢弃浏览器在

worker

接管前已经发出的导航请求：在

activate

事件中启用

navigationPreload

后，导航请求对应的真实预加载响应可由

event.preloadResponse

取得。该响应与普通

worker

内

fetch

不是同一条请求路径。

bot

访问

guest

页面、

worker

激活、

bot

导航到

dashboard

的时序由题目流程保证。

worker

对

/u/admin/dashboard

的

fetch

事件只读取

event.preloadResponse

，复制响应体后通过题目提供的

/webhook/guest

写回。下面的PowerShell脚本完成上传、提交和结果读取；将

$base

改为当前实例即可复现。

运行后先看到

worker

已启用

navigationPreload

：

dashboard

导航的预加载响应状态为

200

，响应体包含

reviewer

的私有部署记录：

因此最终flag为：
