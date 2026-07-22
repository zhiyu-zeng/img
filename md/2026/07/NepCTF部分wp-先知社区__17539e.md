---
title: NepCTF部分wp-先知社区
source: https://xz.aliyun.com/news/92543
source_host: xz.aliyun.com
clip_date: 2026-07-22T11:56:55+08:00
trace_id: 1dd9902c-529e-492f-b7af-66bc87062c9c
content_hash: bd2d99b8689807d2c58ede11481f789fecced4d9c3271a367cb5d0638d90bed9
status: summarized
tags:
  - CTF
  - Web安全
series: null
feed_source: 先知安全技术社区
ai_summary: 本文是NepCTF多道赛题的解题报告，涵盖了Web、密码学、逆向工程和Pwn等多个方向的解题思路与关键技术点。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: null
ioc:
  cves: []
  cwes: []
  hashes:
    - 03d1f234392e97b26cbce3e32646c14d1232e0dd7ad63ac51b076abb13ba4a1a
    - 5e7edeb6e508aa9b872f663348fb564ff4b61089bea3e0d87115cef62ee82999
    - 7a670a3a9bacc118e7ba56d7c15f5e2184c0c1c253a9a78794840b1ee4401971
    - c1fd0742b35f96fd23c7b4434dd5b2afdd47a67f47b9249be9bee806a1037b64
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 本文是NepCTF多道赛题的解题报告，涵盖了Web、密码学、逆向工程和Pwn等多个方向的解题思路与关键技术点。
> 
> - **密码学攻击：** 多个Crypto题目利用了特定数学结构或协议漏洞，例如ezRSA3通过Williams p+1分解，LGC Attack结合Coppersmith攻击恢复RSA因子和LCG状态。
> - **Web安全漏洞：** WEB22利用二次SQL注入和SVG XXE的组合链；WEB58通过Vite开发服务器的HMR WebSocket `invoke` 通道读取服务器上的flag文件。
> - **逆向工程挑战：** 题目涉及多种逆向场景，包括compile_me_maybe的C++模板编译期VM、ZhiE的地图VM资源规划、以及对固件（如Telink TC32、ESP）的逆向分析。
> - **基础设施与组件漏洞：** 文档编辑系统利用Fastjson反序列化执行命令；IPC题目从固件逆向中发现JSON RPC方法存在命令注入，并通过覆盖关键二进制稳定回显。

NEPCTF WP

目录

1

NepClaw / NepClaw_revenge

2

ColorfulArray

3

compile_me_maybe

4

Crypto1 / ezRSA3

5

Crypto2 / Blind RAG

6

Crypto3 / LGC Attack

7

easyDilithium

8

ezgame

9

ISC1

10

LeakyRAG

11

MISC1

12

NepAPI

13

Pwn2

14

REverse1

15

REverse2

16

shadow_signal

17

true_ezgame

18

WEB22

19

WEB58

20

如烟大帝独断万古

21

文档编辑系统

22

虚验室制取稀硫酸

23

谁引闪了我的灯

24

问卷调查

25

这……这是js?

26

【Game】共生（本地）

27

web?re?

28

What's the IPC

29

ZhiE

1\. NepClaw / NepClaw_revenge

核心思路

题目服务把一个 coding agent 接到我们可控的 OpenAI-compatible provider 上，并给 agent 开了

bash,write

工具。解题关键不是让模型直接回答 flag，而是伪造 provider 返回的 tool call，让 agent 在题目容器内执行指定动作。

NepClaw

可以用一次牺牲式探测通过

bash

读取 flag 前半段和

/app/server.mjs

，再刷新一个干净实例，只调用

write

让 observer 判定页面 clean，从 HTTP 响应里拿后半段。

NepClaw_revenge

增加了 tool trace 审计，直接读文件会被判 hacked；但探测实例仍会把 tool result 回传给 provider，所以仍可先拿前半段，再用另一个只含

write -> index.html

的干净实例拿后半段。

关键步骤

1

实现

GET /v1/models

和

POST /v1/chat/completions

。

2

第一阶段返回

bash

tool call，读取

$NEPCLAW_FLAG_FILE

和

/app/server.mjs

。

3

第二阶段刷新实例，只返回

write(index.html)

，页面内容避免出现

flag

、

secret

、

token

、

leak

等敏感词。

4

拼接

splitFlag(flag)

拆出的前后两段。

一个 EXP 打两题的方式

这两个题可以共用同一个

nepclaw_provider_exp.mjs

，不需要维护两套 EXP。脚本的差异通过环境变量

PHASE

控制：

具体使用时不要理解成“一次运行直接拿完整 flag”，而是同一个 provider 脚本跑两轮：

1

probe

阶段用于牺牲实例。题目 agent 第一次请求 provider 时，EXP 返回

bash

tool call，读取

$NEPCLAW_FLAG_FILE

和

/app/server.mjs

。这一步会把 flag 前半段作为 tool result 回传到 provider 日志里。

2

刷新或重启题目容器，拿一个干净实例。

3

clean

阶段用于最终判定。EXP 只返回

write(index.html)

，写入无敏感词页面，避免 observer 因工具轨迹或页面内容判定 hacked。HTTP 响应/判定结果里会给出 flag 后半段。

4

将前半段和后半段按

splitFlag(flag)

的逻辑拼回完整 flag。

两题区别在审计强度：

●

NepClaw

审计较弱，但仍按

probe -> clean

两阶段跑最稳。

●

NepClaw_revenge

会检查 tool trace，直接在最终实例读文件会失败；必须把读文件动作放到牺牲实例，最终实例只执行

write(index.html)

。

Flag

完整 EXP

nepclaw_provider_exp.mjs

2\. ColorfulArray

核心思路

附件里的歌词文本不是重点。真正的校验逻辑藏在 FJM 高地址数据区中的一段 RV32 小端程序里。将这段程序提取并反汇编后，可以还原 flag 输入格式和 16-bit 状态机约束。

关键步骤

1

解包

colorful.fjm

，定位高地址区域中的 RV32 程序。

2

反汇编 RV32 代码，确认输入需要满足

NepCTF{...}

格式。

3

还原状态机转移和校验数组。

4

编写求解脚本恢复 flag body。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\ColorfulArray\\solve_colorfularray.py

3\. compile_me_maybe

核心思路

题目是 C++ 模板编译期 VM。

generated_witness.hpp

原本为空，

main.cpp

会打印

cmc::program<cmc::witness>::bytes

。真正约束在

include/vm.hpp

和

include/data.hpp

中：程序会先

static_assert(validate_witness<W>())

，要求 witness 满足公开约束。

VM 的寄存器状态最终要等于

data::checker_target

。由于

xori/addi/rotl/xorr/addr/swap/sbox/perm/mix/muli/not

等指令都可逆，因此可以从 target 反向执行 VM，恢复 64 字节 witness，再按加密输出逻辑解密 flag。

关键步骤

1

解析

checker_program

，每条 opcode 先异或

checker_opcode_mask(step)

解码。

2

从

checker_target

反向执行所有 VM 指令，恢复 16 个

u32

寄存器。

3

将寄存器按小端拼成 64 字节 witness。

4

复现

seed_from_witness

、

stream_byte

、

permutation

和

encrypted

的解密过程。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\compile_me_maybe\\solve_compile_me_maybe.py

4\. Crypto1 / ezRSA3

核心思路

源码构造 RSA 素数时使用：

所以

p + 1

完全由公开的小素数集合

sops

组成，适合 Williams p+1 分解。对随机 Lucas 参数执行指数迭代后，计算

gcd(V_M(P) - 2, N)

即可得到非平凡因子。

关键步骤

1

从

out.py

读取

sops

、

N

、

c

。

2

构造

M = 2 \* product(sops)

或逐因子做 Lucas 迭代。

3

计算

gcd(x - 2, N)

得到

p

。

4

常规 RSA 解密得到明文。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\Crypto1\\solve_ezrsa3.py

5\. Crypto2 / Blind RAG

核心思路

服务端对任意查询向量

q

直接返回：

由于查询没有随机拆分或加噪，查询 64 个标准基向量

e_i

就能逐行恢复

M1_inv

和

M2_inv

。随后可从数据库密文向量反推文档明文向量，并按题面给出的 AES-GCM key 派生方式解密文档。

关键步骤

1

对每个标准基向量调用

/query

，恢复两个逆矩阵。

2

对数据库中每条记录使用：

1

用 64 维向量派生 AES-256-GCM key。

2

按

nonce(12) || ciphertext || tag(16)

解密并搜索 flag。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\Crypto2\\solve_blind_rag.py

6\. Crypto3 / LGC Attack

核心思路

题目同时泄露了 RSA 因子高位和 LCG 截断状态。

p_high = p >> 502

泄露了 1024-bit 素数

p

的高位，低 502 bit 可用 known-MSB Coppersmith 恢复。拿到

p

后，

outputs\[i\] = state_i >> 256

泄露了 6 个 LCG 状态的高位，剩余低 256 bit 可以建格做 CVP 恢复。

关键步骤

1

用 Coppersmith 建模

p = (p_high << 502) + x

，求小根

x

。

2

验证

N % p == 0

，恢复 RSA 因子。

3

根据 LCG 递推关系把 6 个低位误差建成低维格。

4

用最近向量恢复

state_0

，由于

seed = bytes_to_long(flag.ljust(64, b'\\x00'))

，

state_0

即可还原 flag。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\Crypto3\\solve_lgc.py

7\. easyDilithium

核心思路

这是一个简化版 Dilithium/ML-DSA 签名服务。签名时服务端会输出接近临时向量

y

的 debug 值：

而真实签名满足：

噪声每个系数只在

\[-15,15\]

，私钥

s1

每个系数在

\[-2,2\]

。收集足够多次签名后，就能从带小噪声的线性方程中恢复

s1

，再伪造目标消息

Please give me the flag

的签名。

关键步骤

1

多次请求非目标消息签名，收集

(c, z, r)

。

2

由

z - r = c \* s1 - noise

建立近似线性关系。

3

统计/格恢复

s1

。

4

对目标消息构造合法签名并提交。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\easyDilithium\\solve_easyDilithium.py

8\. ezgame

核心思路

远程环境实际跑的是 LeakyRAG 服务。

flag_doc

虽然被标记为 protected，直接访问

/api/doc/flag_doc

会返回 403，但

/api/search

仍会计算并返回 protected 文档的余弦相似度分数。

只要让

flag_doc

出现在 top 20 结果里，分数就能作为内积 oracle 使用。对随机锚向量和每个标准基向量构造查询，即可恢复

flag_doc

的完整向量，再按附件中的解码逻辑还原 flag。

关键步骤

1

随机生成 64 维单位向量

q0

，直到

flag_doc

进入搜索结果。

2

对每个维度构造扰动查询，利用余弦相似度变化恢复向量分量。

3

重建

flag_doc

向量。

4

调用附件里的

decode()

得到 flag。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\ezgame\\solve_leakyrag_oracle.py

9\. ISC1

核心思路

从 pcap 里还原 HMI、控制器和各组件之间的 S7 写入点位，然后同步写多个组件 DB，构造“电梯开门仍上行并跨楼层”的异常状态。HMI 公告板随即显示 flag。

关键步骤

1

从正常 HMI 点击流量恢复

DB101

控制输入、门状态、楼层状态和 HMI 显示点位。

2

持续把门状态同步为

OPEN 100%

。

3

同时保持

motion=UP

，并把楼层从 1 跳到 3、4、5。

4

从 HMI TUI 公告板读取结果。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\different_rop\\ics_elevator_driver.py

10\. LeakyRAG

核心思路

flag_doc

受保护，直接读取返回 403，但

/api/search

仍会对所有文档计算余弦相似度。如果

flag_doc

进入 top 20，返回分数就等价于：

利用这个分数 oracle 可以恢复完整向量，再解码出 flag。

关键步骤

1

随机找一个能命中

flag_doc

的锚向量。

2

分别对 64 个维度加入扰动，利用分数变化解出每个分量。

3

重建向量后调用解码函数。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\LeakyRAG\\solve_leakyrag_oracle.py

11\. MISC1

核心思路

flag.txt

不是普通文本，而是 SIXEL 终端图像流。可见的

BsHU...{@}

是干扰项，真实 flag 在渲染出的图像底部。

关键步骤

1

确认文件以

ESC P q

开头、以

ESC \\

结尾，符合 SIXEL DCS 图像格式。

2

编写或使用 SIXEL 解码器处理调色板、repeat 命令、换行和 6 像素垂直 cell。

3

输出 PNG 后肉眼读取底部文字。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\MISC1\\sixel_to_png.py

12\. NepAPI

核心思路

目标是一个 OpenAI-compatible API 代理服务。枚举接口和模型列表后，可以发现默认 key 或默认路由能访问特殊模型

nepapi-flag-model

。调用 chat completion 即可让模型返回 flag。

关键步骤

1

访问模型列表，发现：

1

使用默认/泄露配置中的 API key 调用

/v1/chat/completions

。

2

指定

model=nepapi-flag-model

，读取返回内容。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\NepAPI\\solve_nepapi.py

13\. Pwn2

核心思路

shadow_signal

是 non-PIE、无 canary、NX 开启的 pwn 题。程序会泄漏 libc 指针，然后读取一个地址并

puts(ptr)

。传入坏地址可主动触发

SIGSEGV

，进入 signal handler。handler 中存在栈溢出，可以覆盖内核 signal frame，利用 SROP 做

open/read/write

读 flag。

关键步骤

1

通过程序打印的

stdout

指针计算 libc base。

2

传入非法地址触发

SIGSEGV

。

3

在 signal handler 的

read(0, rbp-0x110, 0x500)

中覆盖 signal frame。

4

第一段 SROP 跳到

read(0,.bss, 0x800)

布置第二阶段。

5

第二阶段在

.bss

上连续执行

open("flag") -> read(fd) -> write(1)

。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\Pwn2\\exp.py

14\. REverse1

核心思路

附件固件头部有

KNLT

标记，普通 ARM/RISC-V 反汇编不对。识别为 Telink TC32 固件后，使用 TC32 objdump 反汇编，在输入处理函数中找到 CRC-CCITT 校验和硬件 AES 调用。恢复 AES key 后解密数据区，得到两个并排 QR，扫码得到 flag。

关键步骤

1

用 Telink TC32 工具链反汇编固件。

2

在

0x26a0

输入处理函数中恢复 16 字节 key 的 CRC 约束。

3

从

0xdb8

附近确认硬件 AES 寄存器调用。

4

对

0x3470

开始的

0x3d0

字节做 AES-128-ECB 解密。

5

将解密结果还原成二维码并扫码。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\REverse1\\solve_unknownfirmware.py

15\. REverse2

更新提示: 本节保留的是早期候选路线记录。后续复核发现旧

pass.bin

退出码为

1

，不能作为最终 proof；已验证的

ret:0

提交物见第 29 节

ZhiE

。

核心思路

ZhiE

不是字符串 flag 题。附件程序读取

argv\[1\]

指向的文件，并把文件字节解释为地图行动；程序退出码为 0 即通关。最终提交/验证物是行动文件

pass.bin

，长度 105 字节。

关键步骤

1

静态提取

.data

中

27 \* 11 \* 11

的地图。

2

复刻解释器中的状态、钥匙、血量、攻击、防御、楼层移动和商店逻辑。

3

搜索一条能通过地图的行动序列。

4

写出

pass.bin

并运行

zhie pass.bin

，退出码为 0 即成功。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\REverse2\\solve_zhie.py

16\. shadow_signal

核心思路

同样利用 signal handler 栈溢出和 SROP。先触发异常进入 handler，再覆盖

rt_sigframe

，最终走 ORW 读取

/flag

。

关键步骤

1

利用 libc 泄漏确定

syscall; ret

、

rt_sigreturn

等 gadget。

2

让程序触发 signal handler。

3

溢出覆盖 signal frame，使内核

sigreturn

恢复到可控寄存器状态。

4

执行

open("/flag", 0, 0)

、

read

、

write

。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\shadow_signal\\exp.py

17\. true_ezgame

核心思路

题目是 40 轮石头剪刀布。服务端想用 RSA commitment 先承诺庄家出拳，但同时泄露每轮随机数

r

。由于庄家出拳只有 3 种，可以枚举三种候选，计算对应 commitment，提前知道庄家动作，然后每轮选择克制动作。

关键步骤

1

接收服务端给出的

r

和

commitment

。

2

对

dealer in {0,1,2}

枚举：

1

找到与服务端 commitment 匹配的庄家动作。

2

连赢 40 轮。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\true_ezgame\\solve_true_ezgame.py

18\. WEB22

核心思路

这是二次 SQL 注入加 SVG XXE 的链。注册时保存的邮箱域名会在

/user/<username>

的同域推荐查询中再次拼接使用，因此可以在邮箱域名里埋 UNION 注入，泄露 admin 密码。登录 admin 后，SVG 预览使用 lxml 解析 XML，可通过外部实体读取本地文件。

关键步骤

1

注册普通用户，但邮箱域名写入：

1

访问

/user/<new_username>

，推荐列表会渲染注入出的

admin / <password>

。

2

登录

/login

的 admin 账号。

3

上传含 XXE 的 SVG，在预览页读取

/etc/passwd

等文件。

当前状态

原 WP 记录的利用链已打通到 admin 和 XXE 本地文件读取，但 flag 尚未恢复。阻塞点是：直接 XXE 读取

/app/app.py

会被 XML 标记破坏，读取

/proc/self/environ

又受 NUL 字节影响；远程也不加载外部 DTD，CDATA wrapper 路线失败。

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\WEB22\\solve_web22.py

19\. WEB58

核心思路

附件是暴露到公网的 Vite dev server。容器启动脚本把环境变量中的 flag 写入

/flag

。Vite 6.4.1 的 HMR WebSocket invoke 通道可以调用

fetchModule

，从而读取

file:///flag?raw

。

关键步骤

1

从

/@vite/client

获取 HMR token。

2

连接 HMR WebSocket。

3

发送

vite:invoke

事件，调用

fetchModule

。

4

目标模块设为

file:///flag?raw

，Vite 会把

/flag

按 raw module 返回。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\WEB58\\solve_web58.js

20\. 如烟大帝独断万古

核心思路

附件是玄幻小说文本，题面提示“名讳也是尔等能直呼的”。文本中人物名和大量文字后面夹带了不可见 Unicode Variation Selector。

U+FE00..U+FE0F

正好能表示 16 个十六进制值，将其按半字节提取即可得到 flag。

关键步骤

1

解压得到

novel.txt

。

2

扫描文本中的 Variation Selector 字符。

3

将

U+FE00..U+FE0F

映射为

0..F

。

4

拼接十六进制并转字节，搜索

NepCTF{...}

。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\如烟大帝独断万古\\solve_ruyan.py

21\. 文档编辑系统

核心思路

题目是文档预览系统。普通用户只能通过

file_path

读取

upload

下的文件，管理员后台提供文档增删改接口。漏洞点在

/api/admin/doc/batchUpdate

：服务端对 JSON 使用 Fastjson

parseObject

，开启了

@type

解析，可以用

TemplatesImpl

初始化副作用执行命令。

最终命令把 flag 写入

upload/flag_out.txt

，再通过普通预览接口读取。

关键步骤

1

确认 create 接口会写入 upload 目录，因此 upload 可作为回显通道。

2

定位

batchUpdate

的 Fastjson 反序列化 sink。

3

构造

TemplatesImpl

payload 执行：

1

访问：

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\文档编辑系统\\solve_docpreview.py

22\. 虚验室制取稀硫酸

核心思路

题目给了稀硫酸反应釜的元数据和在线 SSH 靶机。通过 metadata 找到

/hardware/\*.snapshot

中各字段的 mmap 偏移，伪造传感器/SCADA 的安全观测值，同时把反应釜真实温度和液位推到危险区间。最后在 TUI 面板 recover 后读取公告板 flag。

关键步骤

1

从

source/\*/metadata.json

还原各设备状态字段和偏移。

2

让真实

reactor_vessel

满足温度超过 90、液位超过 100。

3

同时伪造传感器输出和 SIEM 状态，让面板观察到安全状态。

4

使用

tui:tui

登录面板，发送

r

触发 recover，读取公告板。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\虚验室制取稀硫酸\\solve_h2so4.py

23\. 谁引闪了我的灯

核心思路

附件中包含 ESP/固件相关数据和一张图片。最终提交验证的 flag 来自 JPEG COM 中的

ch18 id19

，而文件 EOI 后的

ch19 id18

是干扰方向。关键函数

sub_42002390

会构造 16 字节发射包，根据通道和 id 组合恢复正确值。

关键步骤

1

提取附件中的固件/图片数据。

2

逆向关键函数，确认通道和 id 的组合方式。

3

区分 JPEG COM 中的有效

ch18 id19

与 EOI 后的干扰

ch19 id18

。

4

运行脚本得到最终 flag。

复现

Flag

完整 EXP

D:\\Users\\Lenovo\\Desktop\\NEPCTF\\谁引闪了我的灯\\solve_light.py

24\. 问卷调查

这个没啥可说的

25\. 这……这是js?

核心思路

题目给的是 V8

d8

交互环境。服务端当前工作目录里存在名为

flag

的文件，但不能直接用普通 shell 读文件。关键点是动态

import()

会把目标文件当 JavaScript 模块解析；

flag

文件内容不是合法 JS，于是 V8 抛出语法错误时会把出错源码行一起打印出来，flag 就被错误回显带出。

关键步骤

1

连接远程

d8

shell。

2

输入

void import("./flag").catch(function(){})

。

3

import()

尝试解析

./flag

，触发

SyntaxError

。

4

错误信息中出现

//flag:1: SyntaxError: Unexpected token '{'

，下一行即 flag 内容。

复现

预期脚本会连到远程实例，发送动态导入 payload，并从返回内容中提取

NepCTF{...}

。

Flag

完整 EXP

js\\exp.py

26\. 【Game】共生（本地）

这个打游戏通关即可

27\. web?re?

核心思路

这题是 Web 和 Reverse 组合题。Web 部分先通过 SVG/XXE 和 PHP 反序列化链构造文件读取，再扩大到命令执行；拿到容器内命令执行后，发现异常 SUID 程序

xxd

，可用它读取 root 权限文件。最终 flag 不在普通文件里，而是藏在服务端的

sendthef1ag

Go 程序逻辑中：程序读取环境变量

SEND_KEY

，用

SHA256(SEND_KEY)

作为 ChaCha20 key、固定 nonce

nepctf2026!!

解密密文，再用

SHA1('-' + SEND_KEY)

派生循环异或掩码还原 flag。

关键步骤

1

目录和功能点探测，确认上传/预览 SVG 的解析面。

2

利用 SVG XXE 验证文件读取能力。

3

通过 PHP 反序列化析构链控制

$GLOBALS\['filename'\]

，让

readflag()

include 指定 GET 参数对应文件。

4

利用构造出的包含/读取原语推进到命令执行。

5

在容器中发现 SUID

xxd

，用

xxd /root/.bashrc

等方式读 root 可读文件，拿到

SEND_KEY

。

6

下载

sendthef1ag

，逆向 Go 程序中的 ChaCha20 + SHA1 mask 逻辑。

7

用

SEND_KEY

离线解密得到最终 flag。

反序列化链要点

匿名类析构时执行

readflag()

，而

readflag()

的实际 include 目标受全局变量和 GET 参数影响。payload 中通过重复键和引用槽位让对象提前析构，核心结构包括：

复现

脚本中已包含从 Web 入口到下载二进制、读取 key、解密 flag 的自动化逻辑。

web2_helper.py

和几个 PHP probe 是过程中用于确认反序列化/引用行为的辅助脚本。

Flag

完整 EXP

web2\\exploit_ret2shell.py

web2\\web2_helper.py

辅助探测脚本

web2\\anon_unserialize_probe.php

web2\\chain_probe.php

web2\\iterator_probe.php

web2\\ref_probe.php

28\. What's the IPC

核心思路

附件是 IPC/摄像头固件。解包后重点看

Kylin

服务和 ATE 测试接口，发现 UDP JSON RPC 方法

PTRfTxCali

会把请求里的

mp_rate

字段直接拼进 shell 命令，形如

rtwpriv wlan0 mp_rate <mp_rate>

，因此

mp_rate

可注入命令。为了稳定回显，脚本先把

/usr/sbin/rtwpriv

覆盖成自定义 shell 脚本，再调用

PTMpQuery

，服务端会执行

rtwpriv... mp_query

并把输出包在

success:<output>

中返回。

关键步骤

1

解包固件，定位用户态主服务

rootfs-user/bin/Kylin

。

2

通过 strings/disasm 找到 UDP JSON RPC 和 ATE 相关函数。

3

确认

PTRfTxCali

的

mp_rate

字段进入

system()

/shell 命令拼接，存在命令注入。

4

注入写文件命令，覆盖

/usr/sbin/rtwpriv

为

cat /root/flag.txt

脚本。

5

请求

PTMpQuery

，从 UDP 响应中读取脚本输出。

关键 payload 形态：

用于稳定回显的替换脚本：

复现

不同端口是不同远程实例，脚本支持通过

HOST

、

PORT

、

CMD

参数切换。

Flag

完整 EXP

Whats_the_IPC\\IPC(1).py

29\. ZhiE

核心思路

ZhiE

是文件驱动的地图 VM / 魔塔式资源规划逆向题，不是常规字符串校验。程序读取输入文件，把每个字节解释成一次行动：普通模式下高 4 位是

x

、低 4 位是

y

；

0xC1..0xC7

进入商店/传送状态机，

0xFF

退出状态机。目标不是打印 flag，而是让原 ELF 走到胜利分支并

exit(0)

，所以最终提交物是一个二进制行动文件。

关键步骤

1

静态提取

.data

中

27 \* 11 \* 11

的地图，并解析 switch/jump table。

2

复刻解释器：楼层、坐标、血攻防、金币、经验、三色钥匙、商店状态、隐藏 flag 和动态地图改写都要进状态。

3

识别隐藏事件链：

bd70 -> bd74

、21 层击杀

0x3B

改图、23 层

0xCA

/ 25 层

0xCB

置位，之后 22 层

0x18

打开 26 层终局怪。

4

用搜索脚本在可信 emulator 上扩展路线，再用原始 ELF 复核退出码。

5

旧

pass.bin

复核退出码为

1

，不能作为 proof；本次以

final (1).bin

作为较短的已验证通关文件。

已验证 payload

●

REverse2\\final (1).bin

:

1552

bytes, SHA-256

7a670a3a9bacc118e7ba56d7c15f5e2184c0c1c253a9a78794840b1ee4401971

WSL 原 ELF 复核结果：

其他本地文件状态：

●

REverse2\\final\_.bin

:

2064

bytes, SHA-256

c1fd0742b35f96fd23c7b4434dd5b2afdd47a67f47b9249be9bee806a1037b64

●

REverse2\\final_morepath_8192.bin

:

9744

bytes, SHA-256

03d1f234392e97b26cbce3e32646c14d1232e0dd7ad63ac51b076abb13ba4a1a

●

REverse2\\pass.bin

:

105

bytes, SHA-256

5e7edeb6e508aa9b872f663348fb564ff4b61089bea3e0d87115cef62ee82999

其中

final\_.bin

和

final_morepath_8192.bin

也能

ret:0

，但更长；

pass.bin

是旧候选，当前复核

ret:1

。

复现

若要重新跑搜索，可以先运行静态分析和 emulator，再跑搜索脚本：

solve_zhie.py

是旧候选 payload 生成脚本，保留在完整 EXP 中用于说明踩坑历史，不再作为最终通关脚本。

Flag / 提交物

本题没有字符串 flag；提交物为可使程序退出码为

0

的二进制行动文件：

完整 EXP

REverse2\\solve_zhie.py

REverse2\\analyze_zhie.py

REverse2\\emu_zhie.py

REverse2\\search_shop4.py

REverse2\\search_win_from_start.py

REverse2\\final (1).bin

完整 hex
