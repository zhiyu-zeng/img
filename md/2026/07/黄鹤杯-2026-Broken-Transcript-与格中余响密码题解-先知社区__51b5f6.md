---
title: 黄鹤杯 2026 Broken Transcript 与格中余响密码题解-先知社区
source: https://xz.aliyun.com/news/92584
source_host: xz.aliyun.com
clip_date: 2026-07-28T15:53:33+08:00
trace_id: 850d8b76-25b9-4b22-89e6-9f610ae67067
content_hash: 6f86168322f802a93d59edc6f93820cf2b8ba72df8a758145c0007c0d243b941
status: synced
tags:
  - 密码学
  - CTF
series: null
feed_source: 先知安全技术社区
ai_summary: RSA素数生成漏洞借助中国剩余定理与Coppersmith方法破解；格签名方案因缺少误差项可解方程完全恢复私钥。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 0
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/cfac5330-8e9a-3758-8e98-4887edfd6f8a
notion_page_id: 3ab75244-d011-81fa-ab05-dea2c6c7cfcd
ioc:
  cves: []
  cwes: []
  hashes:
    - 34212c88c0778f5e5949cd422e303b86
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> RSA素数生成漏洞借助中国剩余定理与Coppersmith方法破解；格签名方案因缺少误差项可解方程完全恢复私钥。
> 
> - **CRT还原高位：** 12个由nextprime生成、互不相同的模数乘积超过704位，从state=1记录反解upper的12个余数做中国剩余定理合并，唯一确定p的高704位。
> - **Coppersmith恢复低位：** 构造多项式f(x)=upper·2^320 + x (mod p)，设定X=2^320，用LLL格归约（small_roots, beta≈0.49）求出320位低位low，获得完整p并解密RSA。
> - **格签名等式漏洞：** 验证流程要求w=Az-ct，代入z=y+cs导出关键关系t=A·s，该等式缺少Dilithium中的误差项与高低位舍入，构成致命弱点。
> - **线性方程组求解私钥：** 将A的4个多项式块转成64×64矩阵并拼接为128×128矩阵B，建立B·[s0|s1]^T=[t0|t1]^T (mod q)，高斯消元得唯一解s，系数均落在[-2,2]，HMAC标签校验通过证实私钥正确。

黄鹤杯密码详解

Broken Transcript

每个 modulus 由 nextprime 生成，约为 2^60~2^61

所以可以先用 CRT 精确还原 p 的高位，再用 Coppersmith 恢复缺失的低位。

基本过程

1.对每条 state=1 记录，由 y ≡ a·upper + b (mod m) 反解：upper ≡ (y − b) · a⁻¹ (mod m)

12 个模数互不相同（均为素数，两两互素），其乘积约为 731 位 > 704 位。因此对 12 个余数做中国剩余定理（CRT）合并，即可在模 ∏m 下唯一确定 upper = p >> 320（恰好 704 位）。

2.已知 p = upper·2³²⁰ + low，其中 0 ≤ low < 2³²⁰，未知量 low 只有 320 位，远小于 p 位数的一半。构造模 p（p | n）下的一元多项式：

f(x) = upper·2³²⁰ + x (mod p), |x| < X = 2³²⁰，用 LLL 格归约（Sage 的 small_roots）在 beta≈0.49 下求小根，得到 low，从而恢复完整的 p。

3.RSA解密

exp

格中余响

这是一个类 CRYSTALS-Dilithium 的格签名方案，工作在负循环多项式环R_q = Z_q\[x\] / (x^64 + 1)

可整理出验证等式：c = sparse_challenge(mu) Az = A · z ct = c · t w = Az - ct

由于签名时 z = y + c·s（y 为随机 nonce），代回得：w = A·z - c·t = A·(y + c·s) - c·t = A·y + c·(A·s - t)

要使验证通过，必须满足关键关系：t = A · s

A·s = t 是一个精确等式 —— 没有 Dilithium 中的 s2 误差项，也没有高低位舍入。这正是本题的“破绽”。

基本过程

1.按 verifier.py 中 expand_matrix 的方式，用 rho 通过 SHAKE-256 展开出 2×2 的多项式矩阵 A。

2.多项式 a 乘以 s 在 R_q 中是负循环卷积。对应的 64×64 矩阵为：

M\[i\]\[j\] = a\[i-j\] 当 i >= j

M\[i\]\[j\] = -a\[i-j+64\] 当 i < j (负循环，越界变号)

3.把 A 的 4 个多项式块各自转成 64×64 矩阵，拼成 128×128 的大矩阵 B，未知量为 s 的 128 个系数，右端为 t 的 128 个系数：

B · \[s0 | s1\]^T = \[t0 | t1\]^T (mod q)

4.对 B 在模素数 q 下做高斯消元求解，得到唯一解，再做中心化（映射到 \[-q/2, q/2\]）。

求得的解每个系数都落在 \[-2, 2\]，与 eta=2 完全吻合 —— 这是 s 正确的第一重佐证。

随后直接调用 verifier.py 的 open_sealed 流程，HMAC tag 校验通过，说明恢复出的 s 与真实私钥完全一致。

exp

![34212c88c0778f5e5949cd422e303b86.png](⚠️ https://xz.aliyun.com/api/v2/files/cfac5330-8e9a-3758-8e98-4887edfd6f8a)

总结

针对这次题目来看，纯手作的话难度还是比较大的，主要还是防AI，第一个考点就是常见的RSA的coppersmith解法，还算可以，第二个是针对的一个格签名方案来的，难度相对比较大，我感觉未来密码学的考察方向还是以RSA、格密码和流密码为主，毕竟是时代的发展趋势。
