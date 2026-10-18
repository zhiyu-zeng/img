---
title: 【看雪】针对X***CODE-NEO自研壳的il2cpp.so提取
source: https://bbs.kanxue.com/thread-293263.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-18T19:34:12+08:00
trace_id: ccaa4851-63f5-43cf-a886-37f50128f0a5
content_hash: 2ee3c86e7a344dbae0146ece21fd34a0d69ddb31b30b66b0f6518eacaf7d2d35
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - Android逆向
series: null
feed_source: 看雪·Android安全
ai_summary: TARA-Unpack 把自研壳 libil2cpp.so 的提取从「运行时 hook 抓 Layer2 密钥」改为「静态 RSA 模幂还原」，因此能够离线、跨文件地解出 il2cpp.so。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fd75244-d011-8128-b7f9-dc0ce23df1c0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TARA-Unpack 把自研壳 libil2cpp.so 的提取从「运行时 hook 抓 Layer2 密钥」改为「静态 RSA 模幂还原」，因此能够离线、跨文件地解出 il2cpp.so。
> 
> - **两层架构：** 外层 SO 资源表 +0x18 处为 Layer1 IV、+0x2A 处为 Key（32B）、+0x60/+0x68 处为数据偏移与大小，用 AES-256-CBC 解出 Magic 为“TARA”、版本为 3 的容器；容器的 0x20 处是 128 字节 Layer2 密钥材料。
> - **密钥本质：** 0x20 处 128 字节并非 AES key，而是 RSA-1024 密文；用内置公钥算 `pow(blob, 65537, n)`，按 PKCS#1 v1.5 type-02 解出 32 字节消息，该消息正好是目标 ELF 头前 32 字节，即 Layer2 AES-256 密钥（IV 全零）。二进制只含公钥，因此可离线反向模幂。
> - **模数定位：** 128 字节模数（首字节 0xb2）在外层 SO 出现 3 次（0x1FE838/0x1FE992/0x1FCAE8），`00 01 00 01` 紧邻；采用「已知偏移优先 + 搜索指数 ±512 字节枚举窗口」两级策略，按最高位为 1、末字节奇数、大于密文过滤，PKCS#1 填充自校验使误判率约 2⁻¹⁶，45MB SO 上 0.01 秒内可定位。
> - **解压与产出：** 解密后是自定义 LZMA，须用反编译还原的 unpack.cpp，不能换用标准 lzma；45MB 壳 SO 约经 42MB TARA、17MB 阶段，解压出约 271MB、以 `\x7fELF` 开头的 libil2cpp_dec.so。
> - **工程化与限制：** 流程脚本 decrypt_tara.py 串联全流程，derive_key.py 独立验证，verify_so.py 做 51 项校验；输出缓冲改由 libil2cpp_size.bin 读取，MSVC 需 /bigobj 与 /utf-8；输出上限约 285MB（VirtualAlloc 一次性分配），若壳更换指数需同步改 RSA_E 与 RSA_N_OFFSETS。

原文链接：https://bbs.kanxue.com/thread-292061.html

（看雪论坛：《XX二游 消失的libil2cpp.so 提取与算法分析》，2026-7-17）

GitHub 仓库：https://github.com/Steve16234/TARA-Unpack

\---

## 概述

TARA-Unpack 是一个针对某 Android 二游 X\*\*\*CODE-NEO 保护壳的静态解密解压工具。其目标是从外层加固.so（如 libgedenedo.so、libhesissti.so）中还原被加密压缩的 libil2cpp.so，以便 Il2CppDumper、IDA 等工具继续分析。

技术源头是看雪论坛 Chxe 的《XX二游 消失的libil2cpp.so 提取与算法分析》。原作者完成了 Layer1（TARA 容器外层）的逆向分析，但 Layer2 密钥获取仍依赖运行时 hook，换文件即失效。Steve16234 的仓库在此基础上补全了 Layer2 密钥的静态派生，并将流程自动化，使工具具备跨文件、离线可用的能力。

\---

## 实现原理：两层嵌套加密架构

整体流程可概括为：

外层资源表 → Layer1 AES → TARA 容器 → Layer2 AES（RSA 派生密钥） → 自定义 LZMA → libil2cpp.so

Layer1：外层 SO 资源表与 AES-256-CBC

在外层加固 SO 尾部搜索明文字符串 libil2cpp.so，命中位置附近存在资源表：

相对偏移 内容

pos + 0x18 Layer1 IV（16 字节）

pos + 0x2A Layer1 Key（32 字节）

pos + 0x60 数据偏移（u64）

pos + 0x68 数据大小（u64）

使用上述 Key/IV 执行 AES-256-CBC 解密，得到 TARA 容器。原文对应调用为 aes_cbc_decrypt_wrapper，参数布局为 src, size, key(32B), 32, dst, size, iv(16B)。

TARA 容器结构

偏移 含义

0x00 Magic “TARA”（0x41524154）

0x04 版本号（实测为 3）

0x0C field：0x20 处密钥材料长度，也是 payload 相对偏移

0x10 压缩后大小

0x14 解压后大小

0x18 LZMA props（5 字节）

0x20 Layer2 密钥材料（RSA-1024 密文）

0x20 + field Layer2 密文（按 16 字节对齐）

Layer2：RSA-1024 密钥派生 → AES-256-CBC（IV=0）

TARA 头 0x20 处的 128 字节并非直接使用的 AES 密钥，而是经过 RSA 私钥运算后的密文。原文将这一步描述为“自定义 RSA 椭圆曲线算法” sub_53278，内部为大型 case 结构，用于生成 AES 密钥进行第二次解密。运行时使用内置 RSA 公钥 (n, e=65537) 还原真正密钥：

\`\`\`

m = pow(blob, 65537, n)

\`\`\`

还原结果 m 遵循 PKCS#1 v1.5 type-02 填充格式：

\`\`\`

00 02 || 93 字节随机 || 00 || 32 字节消息

\`\`\`

其中 32 字节消息部分恰好是目标 libil2cpp.so 的 ELF 头前 32 字节，也就是 Layer2 AES-256 密钥。Layer2 使用 AES-256-CBC，IV 为 16 个零。

设计巧思：二进制中只含公钥，私钥指数 d 不在文件中。但只要提取公钥，就可离线还原密钥——因为 RSA“加密”在数学上就是模幂运算，持有公钥即可反向执行。

自定义 LZMA 解压

Layer2 解密后的数据并非标准 LZMA 流。unpack.cpp 是从原 SO 反编译还原的解码器，不能用 Python lzma 或 7-Zip 替代。props 仍按标准格式解析（lc/lp/pb + dict size）。实测约 42 MB 输入可解压至约 271 MB。

\---

## 在原作者基础上的新增与修改

新增：Layer2 密钥的 RSA 静态派生（核心突破）

原文流程在 Layer2 处依赖运行时 hook aes_cbc_decrypt_wrapper 抓取密钥，根本缺陷是换文件即失效，每个新版本 SO 都需重新 hook，无法脱离动态环境。

本仓库逆向出 TARA 头 0x20 处 128 字节为 RSA 密文，并实现静态还原：提取外层 SO 公钥 (n, 65537)，对密文做模幂 pow(blob, e, n)，再按 PKCS#1 v1.5 解析出 32 字节 Layer2 key。这一步使工具从“必须动态运行”变为纯静态、离线、跨文件可用。

新增：RSA 模数全自动定位

公钥模数 n（128 字节，首字节 0xb2）在外层 SO 中出现 3 次：0x1FE838 / 0x1FE992 / 0x1FCAE8，且 00 01 00 01（即 65537）紧贴旁边。仓库实现两级模数定位策略：

1\. 已知偏移优先：直接尝试硬编码偏移，对当前版本最快。

2\. 通用启发式回退：全 SO 搜索 00 01 00 01，在每个命中点 ±512 字节内枚举候选窗口，按“最高位为 1、末字节为奇数、大于密文”过滤，逐一尝试模幂。合法 PKCS#1 v1.5 填充本身构成强自校验（误判概率约 2⁻¹⁶）。实测 45 MB SO 上两种路径均可在 0.01 秒内定位模数。

新增：自动化流水线与工程化修复

· decrypt_tara.py 主脚本：串联“资源表查找 → Layer1 → RSA 密钥派生 → Layer2 → 调用 unpack.exe”，支持交互式与全自动模式。

· derive_key.py：独立 RSA 密钥推导验证脚本，可单独运行查看中间结果。

· verify_so.py：对产物做 51 项完整性/可读性校验，覆盖 ELF 结构、节区表等。

· 构建修复：

· main.cpp 输出缓冲区大小改为从 libil2cpp_size.bin 读取（由脚本按 TARA 头 +0x14 写入），不再硬编码。

· unpack.cpp 是反编译巨型函数，MSVC 编译需加 /bigobj 和 /utf-8。

修改/澄清：Layer2 密钥的本质

原文将 hook 抓到的值直接视为 AES key。本仓库进一步揭示其派生路径：它并非随意生成的密钥，而是 PKCS#1 填充消息中的 ELF 头 32 字节。这一澄清是整个静态化方案成立的前提。

\---

## 使用方式与已知限制

依赖：Python 3.8+、pycryptodome、C++17 编译器（MSVC）。unpack.exe 必须与 decrypt_tara.py 同目录。

典型输出：45 MB 外层 SO → Layer1 解密得到约 42 MB TARA 容器 → Layer2 解密约 42 MB → LZMA 解压得到约 271 MB 的 libil2cpp_dec.so，以 \\x7fELF 开头。

已知限制：

· unpack.cpp 为反编译产物，可读性差，但功能与原 SO 一致。

· 输出上限约 285 MB，main.cpp 用 VirtualAlloc 一次性分配。

· RSA 模数定位依赖“模数在指数 65537 附近”。若未来版本更换指数，需同步修改 RSA_E 与 RSA_N_OFFSETS。

\---

总结

TARA-Unpack 在看雪原文分析基础上完成关键范式转换：将 Layer2 密钥获取从“运行时 hook”变为“静态 RSA 还原”，并配套实现模数自动定位、全流程脚本化和构建工程化。其价值不仅在于“能解当前文件”，更在于给出了不依赖动态环境、可随样本迭代持续工作的离线解密路径，从而真正实现“静态解压出真实 libil2cpp.so”。

[#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
