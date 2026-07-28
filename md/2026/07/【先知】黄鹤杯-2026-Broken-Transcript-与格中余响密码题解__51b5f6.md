---
title: 【先知】黄鹤杯 2026 Broken Transcript 与格中余响密码题解
source: https://xz.aliyun.com/news/92584
source_host: xz.aliyun.com
clip_date: 2026-07-28T17:14:11+08:00
trace_id: de5b6ee2-8f31-413a-956a-293563dd81fc
content_hash: 461971dbb31dcedaddb496b9f3bfc1d4117b02d08073990244cedb8c092f1f1a
status: synced
tags:
  - 先知
  - 密码学
  - CTF
series: null
feed_source: null
ai_summary: 通过12条模不同素数的p高位泄漏记录进行CRT合并，恢复RSA素数p的高704位，再利用Coppersmith方法求出低320位完成解密；类Dilithium格签名因缺少误差项，可利用A·s=t的精确等式直接解线性方程组恢复私钥。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3ab75244-d011-8153-a0e0-d174627b6b7e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过12条模不同素数的p高位泄漏记录进行CRT合并，恢复RSA素数p的高704位，再利用Coppersmith方法求出低320位完成解密；类Dilithium格签名因缺少误差项，可利用A·s=t的精确等式直接解线性方程组恢复私钥。
> 
> - **CRT合并条件：** 12条state=1记录中模数m均为约60—61位素数且两两互素，乘积比特数超704位，因此可通过中国剩余定理唯一确定p的高704位upper。
> - **Coppersmith小根求解：** 令p = upper·2³²⁰ + x，其中0 ≤ x < 2³²⁰，在模n下构造一元多项式，用small_roots(epsilon=0.02, beta≈0.49)成功解出低320位，恢复完整私钥。
> - **格签名破绽：** 签名验证等式可化简为A·y + c·(A·s - t)，只有当A·s = t精确成立时才能通过，方案缺少Dilithium中的误差项和高低舍入，导致私钥可解。
> - **线性方程组构造：** 将2×2多项式矩阵A的各块转为64×64负循环卷积矩阵，拼成128×128大矩阵B，右端为公钥t的128个系数，在模q下高斯消元求得私钥s的全部系数，且每个系数均在[-2,2]内，与参数eta=2一致。
> - **验证流程：** 恢复出的私钥成功通过verifier.py的open_sealed流程，HMAC标签校验通过，证明完全正确并解出flag。

## 黄鹤杯密码详解

## Broken Transcript

```plain
E = 65537
PRIME_BITS = 1024      # p、q 各 1024 位，n 为 2048 位
LOW_BITS   = 320       # 泄露 p 的高位，低 320 位被截断
ROW_COUNT  = 12        # 12 条 state=1 记录（真实数据）
DECOY_COUNT= 3         # 3 条 state=0 记录（干扰）
y = (a * upper_limb + b) % modulus     # state = 1，共 12 行
y = (a * stale_limb + b) % modulus     # state = 0，共 3 行（stale = 旧 q >> 320）
```

每个 modulus 由 nextprime 生成，约为 2^60~2^61

所以可以先用 CRT 精确还原 p 的高位，再用 Coppersmith 恢复缺失的低位。

**基本过程**

1.对每条 state=1 记录，由 y ≡ a·upper + b (mod m) 反解：upper ≡ (y − b) · a⁻¹ (mod m)

12 个模数互不相同（均为素数，两两互素），其乘积约为 731 位 > 704 位。因此对 12 个余数做中国剩余定理（CRT）合并，即可在模 ∏m 下唯一确定 upper = p >> 320（恰好 704 位）。

2.已知 p = upper·2³²⁰ + low，其中 0 ≤ low < 2³²⁰，未知量 low 只有 320 位，远小于 p 位数的一半。构造模 p（p | n）下的一元多项式：

f(x) = upper·2³²⁰ + x (mod p), |x| < X = 2³²⁰，用 LLL 格归约（Sage 的 small_roots）在 beta≈0.49 下求小根，得到 low，从而恢复完整的 p。

3.RSA解密

**exp**

```python
#sage
import json
with open("/mnt/d/做题/平时/Broken Transcript/Broken Transcript/output.txt") as f:
    data = json.load(f)
n = data["n"]
e = data["e"]
c = data["c"]
limb_bits = data["limb_bits"]   # 320
rows = data["rows"]
residues = []
moduli = []
for r in rows:
    if r["state"] != 1:
        continue
    m = r["m"]; a = r["a"]; b = r["b"]; y = r["y"]
    ai = inverse_mod(a, m)
    x = (ai * ((y - b) % m)) % m
    residues.append(Integer(x))
    moduli.append(Integer(m))
M = prod(moduli)
upper = Integer(CRT_list(residues, moduli))
P.<x> = PolynomialRing(Zmod(n))
f = upper * (2^limb_bits) + x
f = f.monic()
beta = 0.49
X = 2^limb_bits
roots = f.small_roots(X=X, beta=beta, epsilon=0.02)
print( roots)
if roots:
    low = int(roots[0])
    p = upper * (2^limb_bits) + low
    assert n % p == 0, "p does not divide n"
    q = n // p
    print("p =", p)
    print("q =", q)
    phi = (p - 1) * (q - 1)
    d = inverse_mod(e, phi)
    m_int = power_mod(c, d, n)
    flag = int(m_int).to_bytes((int(m_int).bit_length() + 7) // 8, "big")
    print(flag)
else:
    print("No roots found")

```

## 格中余响

这是一个类 CRYSTALS-Dilithium 的格签名方案，工作在负循环多项式环R_q = Z_q\[x\] / (x^64 + 1)

可整理出验证等式：c = sparse_challenge(mu) Az = A · z ct = c · t w = Az - ct

由于签名时 z = y + c·s（y 为随机 nonce），代回得：w = A·z - c·t = A·(y + c·s) - c·t = A·y + c·(A·s - t)

要使验证通过，必须满足关键关系：t = A · s

A·s = t 是一个精确等式 —— 没有 Dilithium 中的 s2 误差项，也没有高低位舍入。这正是本题的“破绽”。

**基本过程**

1.按 verifier.py 中 expand_matrix 的方式，用 rho 通过 SHAKE-256 展开出 2×2 的多项式矩阵 A。

2.多项式 a 乘以 s 在 R_q 中是负循环卷积。对应的 64×64 矩阵为：

M\[i\]\[j\] = a\[i-j\] 当 i >= j  
M\[i\]\[j\] = -a\[i-j+64\] 当 i < j (负循环，越界变号)

3.把 A 的 4 个多项式块各自转成 64×64 矩阵，拼成 128×128 的大矩阵 B，未知量为 s 的 128 个系数，右端为 t 的 128 个系数：

B · \[s0 | s1\]^T = \[t0 | t1\]^T (mod q)

4.对 B 在模素数 q 下做高斯消元求解，得到唯一解，再做中心化（映射到 \[-q/2, q/2\]）。

求得的解每个系数都落在 \[-2, 2\]，与 eta=2 完全吻合 —— 这是 s 正确的第一重佐证。

随后直接调用 verifier.py 的 open_sealed 流程，HMAC tag 校验通过，说明恢复出的 s 与真实私钥完全一致。

**exp**

```python
import json, base64, hashlib, hmac

base = "D:/做题/平时/格中余响/格中余响/"
pub = json.load(open(base + "public.json", encoding="utf-8"))
n = pub["n"]
q = pub["q"]
k = pub["k"]
l = pub["l"]
def expand_matrix(rho, n, q, k, ell):
    matrix = []
    for row in range(k):
        cr = []
        for col in range(ell):
            stream = hashlib.shake_256(rho + b"|A|" + bytes([row, col])).digest(n * 3)
            poly = [int.from_bytes(stream[3*i:3*i+3], "little") % q for i in range(n)]
            cr.append(poly)
        matrix.append(cr)
    return matrix

A = expand_matrix(base64.b64decode(pub["rho"]), n, q, k, l)
t = pub["t"]
def mulmat(a):
    M = [[0]*n for _ in range(n)]
    for kk in range(n):
        for j in range(n):
            d = kk - j
            if d >= 0:
                M[kk][j] = a[d] % q         
            else:
                M[kk][j] = (-a[d+n]) % q      
    return M
B = [[0]*(l*n) for _ in range(k*n)]
rhs = [0]*(k*n)
for r in range(k):
    for c in range(l):
        M = mulmat(A[r][c])
        for i in range(n):
            for j in range(n):
                B[r*n+i][c*n+j] = (B[r*n+i][c*n+j] + M[i][j]) % q
    for i in range(n):
        rhs[r*n+i] = t[r][i] % q
def modinv(a, m): return pow(a % m, m-2, m)
N = len(B)
Aug = [B[i][:] + [rhs[i]] for i in range(N)]
row = 0
for col in range(N):
    piv = next((rr for rr in range(row, N) if Aug[rr][col] % q != 0), None)
    if piv is None:
        raise RuntimeError("singular at col %d" % col)
    Aug[row], Aug[piv] = Aug[piv], Aug[row]
    inv = modinv(Aug[row][col], q)
    Aug[row] = [(x*inv) % q for x in Aug[row]]
    for rr in range(N):
        if rr != row and Aug[rr][col] % q != 0:
            f = Aug[rr][col]
            Aug[rr] = [(Aug[rr][t2] - f*Aug[row][t2]) % q for t2 in range(N+1)]
    row += 1
    if row == N: break
def center(x): return x - q if x > q // 2 else x
cs = [center(Aug[i][N] % q) for i in range(N)]
s = [cs[0:n], cs[n:2*n]]
print(s[0])
print(s[1])
def serialize_s(s):
    return b"".join(int(x).to_bytes(1, "little", signed=True)
                    for poly in s for x in poly)

def open_sealed(pub, s):
    blob = base64.b64decode(pub["sealed"])
    salt, tag, ct = blob[4:20], blob[20:36], blob[36:]
    seed = hashlib.sha256(serialize_s(s) + b"|ge-zhong-yu-xiang|v1").digest()
    mac_key = hashlib.sha256(seed + salt + b"|mac").digest()
    exp = hmac.new(mac_key, salt + ct, hashlib.sha256).digest()[:16]
    if not hmac.compare_digest(tag, exp):
        raise ValueError("state rejected")
    ks = hashlib.shake_256(seed + salt + b"|stream").digest(len(ct))
    return bytes(x ^ y for x, y in zip(ct, ks))

print(open_sealed(pub, s).decode())
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/734de580338d0320.png)

## 总结

针对这次题目来看，纯手作的话难度还是比较大的，主要还是防AI，第一个考点就是常见的RSA的coppersmith解法，还算可以，第二个是针对的一个格签名方案来的，难度相对比较大，我感觉未来密码学的考察方向还是以RSA、格密码和流密码为主，毕竟是时代的发展趋势。
