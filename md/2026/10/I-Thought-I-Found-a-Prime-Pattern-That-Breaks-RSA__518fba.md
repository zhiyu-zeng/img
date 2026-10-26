---
title: I Thought I Found a Prime Pattern That Breaks RSA
source: https://osandamalith.com/2026/07/17/i-thought-i-found-a-prime-pattern-that-breaks-rsa/?utm_source=rss&utm_medium=rss&utm_campaign=i-thought-i-found-a-prime-pattern-that-breaks-rsa
source_host: osandamalith.com
clip_date: 2026-10-26T10:35:03+08:00
trace_id: 5655dadd-56fc-4d42-aa27-37001a0e4b2e
content_hash: 7f8e880989b9b7b41679d457cceea7da2eddd7fc4e5f413747bb2845dd08c86d
status: synced
tags:
  - 密码学
  - RSA
series: null
feed_source: Osanda·逆向/安全研究
ai_summary: 数字根素数规律真实存在但对分解RSA无用：实测零剔除候选、仅含2.6比特信息；RSA安全完全悬于φ(N)保密这一个铰链。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40575244-d011-8110-98e1-dff5ad8e070c
ioc:
  cves:
    - CVE-2022-26320
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 数字根素数规律真实存在但对分解RSA无用：实测零剔除候选、仅含2.6比特信息；RSA安全完全悬于φ(N)保密这一个铰链。
> 
> - **安全根源：** 私钥满足 d ≡ e⁻¹ mod φ(N)，而 φ(N)=(p-1)(q-1) 必须分解 N 才能算出；作者2017年的玩具方案把求逆模数换成公开的 N，私钥一行欧几里得即得——RSA的全部防线就是 N 与 φ(N) 之间的缝隙。
> - **模式失效原因：** 6个数字根恰好构成 mod 9 的乘法群（拉丁方结构），任意 dr(p) 都存在合法伙伴，兼容表每行"恰好6对"正证明了零排除；dr(N) 只等于 N mod 9，信息量 log₂6 ≈ 2.6 比特，对1024位问题杯水车薪。
> - **消融实测：** 删除数字根约束使程序快2.03×（Python）、1.07–1.09×（RTX 5090 CUDA）；先前1.6×加速被随机分桶（抛硬币）完全复现，真正来源是乱序扫描而非数学；52位测试密钥用4.1秒破解。
> - **算力天花板：** 5090每秒3070亿次试除仅把可破位右移27比特，满载百年也只能到143位；按Landauer极限破解RSA-2048约需10²⁸⁵焦耳，超过10²¹⁵个可观测宇宙的质量能量。
> - **真实攻击面：** 现实中RSA失陷均源于流程而非数学——熵不足致多设备共享素数（一次gcd双双沦陷）、开发者取 nextprime(p) 遭Fermat分解秒破（CVE-2022-26320打印机密钥即此例）。

I didn’t. But working out *why* taught me more about RSA than any tutorial ever did, because it forced me to find the exact spot where the security lives and poke it.

This post builds RSA from nothing, walks up to that spot, and then documents — with real code, real timings, and a real GPU — everything that happens when you push on it. If you can follow a bit of modular arithmetic, you can follow all of it.

* * *

## The impossible-sounding problem

Normal encryption has an obvious flaw. If I scramble a message with a key, you need the same key to unscramble it — so I have to get the key to you somehow. But if I could send you a key secretly, I could just send the message secretly and skip the whole thing.

Public-key cryptography solves this with something that sounds like a contradiction:

> A key that **locks** but cannot **unlock**.

I publish my locking key to the entire world. Anyone can lock a message to me. **Nobody can unlock it — not even them, not even holding the locking key.** Only my separate, secret unlocking key works.  
  
RSA does this. The trick is finding an operation that’s easy to do and hard to undo.

## Clock arithmetic

Everything happens **modulo** some number. If you can read a clock, you already know this.

On a 12-hour clock, 5 hours after 9 o’clock is 2 o’clock — because \\(9 + 5 = 14\\) and \\(14-12=2\\).

$$9 + 5 \\equiv 2 \\pmod{12}$$

The notation \\(a \\equiv b \\pmod{N}\\) means “\\(a\\) and \\(b\\) leave the same remainder when divided by \\(N\\).”

Why does this matter? Because **modular arithmetic destroys information**. On a clock, 2 o’clock could have come from 2, or 14, or 26, or 38. The answer doesn’t tell you where you started. That one-way fog is what we build the lock from.

The key operation is **modular exponentiation**:

$$c \\equiv m^e \\pmod{N}$$

Computing it forward is fast even for enormous numbers — to get \\(m^{65537}\\) you square about 17 times, not multiply 65537 times. Going *backwards*, given \\(c\\), \\(e\\), \\(N\\), is the **discrete logarithm problem**, and nobody knows how to do it efficiently.

## Euler’s theorem, the engine

Here’s the 18th-century mathematics that makes RSA work.

**Euler’s totient** \\(\\varphi(N)\\) counts the integers up to \\(N\\) sharing no factor with \\(N\\). For a prime, everything below it qualifies:

$$\\varphi(p) = p – 1$$

And for \\(N = p \\cdot q\\) with distinct primes, the totient is multiplicative:

$$\\varphi(N) = (p-1)(q-1)$$

**Euler’s theorem** says that whenever \\(\\gcd(a, N) = 1\\):

$$a^{\\varphi(N)} \\equiv 1 \\pmod{N}$$

Raise anything to the power \\(\\varphi(N)\\) and you land back on 1. Exponents wrap around with period \\(\\varphi(N)\\) — a second clock, hiding inside the first.

**This is the whole secret.** Messages live on a clock of size \\(N\\). *Exponents* live on a clock of size \\(\\varphi(N)\\). And:

> \\(N\\) is public. \\(\\varphi(N)\\) is not.

To compute \\(\\varphi(N) = (p-1)(q-1)\\) you must know \\(p\\) and \\(q\\). Anyone can see \\(N\\); only its owner knows how it factors.

**Everyone can do arithmetic on the outer clock. Only you can do arithmetic on the inner one.**

## Building it

1.  Pick two large secret primes \\(p\\) and \\(q\\) (512 bits each for RSA-1024).
2.  Compute \\(N = p \\cdot q\\). **Public.**
3.  Compute \\(\\varphi(N) = (p-1)(q-1)\\). **Secret.**
4.  Choose \\(e\\) with \\(\\gcd(e, \\varphi(N)) = 1\\). Usually 65537. **Public.**
5.  Compute \\(d \\equiv e^{-1} \\pmod{\\varphi(N)}\\). **Secret.**

Publish \\((e, N)\\). Guard everything else.

**Encrypt:** \\(c \\equiv m^e \\pmod N\\) **Decrypt:** \\(m \\equiv c^d \\pmod N\\)

**Why decryption works.** Since \\(ed \\equiv 1 \\pmod{\\varphi(N)}\\), write \\(ed = 1 + k\\varphi(N)\\):

$$c^d \\equiv (m^e)^d = m^{1 + k\\varphi(N)} = m \\cdot \\left(m^{\\varphi(N)}\\right)^k \\equiv m \\cdot 1^k = m \\pmod N$$

Euler’s theorem does all the work. Encryption and decryption are inverses *because their exponents are inverses on the hidden clock*.

## Where the security actually lives

Look hard at the definition of \\(d\\):

$$d \\equiv e^{-1} \\pmod{\\varphi(N)}$$

\\(e\\) is public. Inverting it is trivial — extended Euclid, microseconds. The *only* thing between an attacker and your private key is that they don’t know **which clock to invert on**.

That’s it. That’s all of it:

$$  
\\fbox{$\\varphi(N)\\text{ is secret, and computing it requires factoring }N$}  
$$

The attack chain is short:

$$\\text{factor } N;\\longrightarrow; p, q;\\longrightarrow; \\varphi(N);\\longrightarrow; d;\\longrightarrow; \\text{read everything}$$

Every link but the first is instant. **The entire fortress rests on one hinge.**

### What it looks like when the hinge is missing

Years ago I posted a [toy “RSA”](https://osandamalith.com/2017/08/30/a-basic-rsa-encrypter/) using multiplication instead of exponentiation:

$$\\text{Enc}(m) = m \\cdot e \\bmod N, \\qquad \\text{Dec}(c) = c \\cdot d \\bmod N$$

Correctness needs \\(e \\cdot d \\equiv 1 \\pmod N\\). My example: \\(e = 3\\), \\(d = 171\\), \\(N = 256\\). Check: \\(3 \\times 171 = 513 = 2(256) + 1\\).

Compare the two definitions:

| scheme | private key satisfies | inversion modulus | status | attacker must |
| --- | --- | --- | --- | --- |
| Toy | d = e⁻¹ mod N | N   | **public** | run Euclid — trivial |
| RSA | d = e⁻¹ mod φ(N) | φ(N) | **secret** | factor N — hard |

One symbol differs. In the toy, the modulus you invert against is *printed on the public key*, so \\(d = 3^{-1} \\bmod 256 = 171\\) falls out for anyone. **RSA is exactly the gap between \\(N\\) and \\(\\varphi(N)\\), and nothing else.**

* * *

## Part II — The pattern

## Digital roots

Sum a number’s digits. Sum again. Repeat to one digit:

$$1763 \\to 1+7+6+3 = 17 \\to 1+7 = 8$$

It looks like numerology. It’s arithmetic in disguise:

$$\\mathrm{dr}(n) \\equiv n \\pmod 9$$

with 9 standing in for 0. **Why:** \\(10 \\equiv 1 \\pmod 9\\), so every power of ten collapses:

$$\\sum_i a_i 10^i \\equiv \\sum_i a_i \\cdot 1^i = \\sum_i a_i \\pmod 9$$

## The observation

Take any prime above 3. Its digital root is only ever:

$${1, 2, 4, 5, 7, 8}$$

Never 3, 6, or 9. Forever.

**Why:** \\(\\mathrm{dr}(n) \\in {3,6,9} \\iff 3 \\mid n\\), and a prime above 3 isn’t divisible by 3. That’s the entire mechanism. (The prime 3 itself is the exception.)

If you’ve met the fact that every prime \\(> 3\\) has the form \\(6k \\pm 1\\), this is the same statement in base 10. Hold that thought — it comes back and it hurts.

## The idea

Digital roots are **multiplicative**:

$$\\mathrm{dr}(a \\cdot b) \\equiv \\mathrm{dr}(a) \\cdot \\mathrm{dr}(b) \\pmod 9$$

$$11 \\times 13 = 143, \\quad \\mathrm{dr}(11)=2,\\; \\mathrm{dr}(13)=4, \\quad 2 \\times 4 = 8, \\quad \\mathrm{dr}(143) = 8 \\quad \\text{✓}$$

So for \\(N = pq\\), the digital root of the modulus **constrains the digital roots of its factors**.

### A worked example

Take two primes and build their product by hand:

$$p = 41, \\qquad q = 43$$

Their digital roots:

$$\\mathrm{dr}(41) = 4+1 = 5, \\qquad \\mathrm{dr}(43) = 4+3 = 7$$

Multiply the roots, not the primes:

$$5 \\times 7 = 35;\\longrightarrow; 3+5 = 8$$

Now the actual product:

$$41 \\times 43 = 1763;\\longrightarrow; 1+7+6+3 = 17;\\longrightarrow; 1+7 = 8 \\quad\\text{✓}$$

**8 either way.** You can predict the digital root of a 4-digit product from two single digits, without doing the multiplication.

It holds at any size. Here’s the 52-bit key I break later in this post:

$$p = 46{,}031{,}351, \\qquad q = 59{,}885{,}027$$  
$$\\mathrm{dr}(p) = 5, \\qquad \\mathrm{dr}(q) = 8, \\qquad 5 \\times 8 = 40 \\longrightarrow 4$$  
$$N = 2{,}756{,}588{,}697{,}481{,}477;\\longrightarrow; \\mathrm{dr}(N) = 4 \\quad\\text{✓}$$

### Running it backwards

That’s the direction that matters. **We don’t know \\(p\\) and \\(q\\) — we only know \\(N\\).** But the relation runs both ways.

Given \\(\\mathrm{dr}(N) = 8\\), which pairs could have produced it? Enumerate the units:

| dr(p) | dr(q) | product | dr  |
| --- | --- | --- | --- |
| 1   | 8   | 8   | 8 ✓ |
| 2   | 4   | 8   | 8 ✓ |
| 4   | 2   | 8   | 8 ✓ |
| 5   | 7   | 35  | 8 ✓ |
| 7   | 5   | 35  | 8 ✓ |
| 8   | 1   | 8   | 8 ✓ |

Six pairs out of thirty-six possible. **So five-sixths of the combinations are impossible**— and if we bucket every candidate prime by its digital root, surely we only need to search the buckets those six pairs permit?

That was the idea. A 6× win on the problem the internet’s security rests on.

## The two tables

**Table 2 — compatibility.** For each \\(r = \\mathrm{dr}(N)\\), every ordered pair \\((a,b)\\) of units with \\(a \\cdot b \\equiv r \\pmod 9\\):

| r = dr(N) | compatible ordered pairs (dr(p), dr(q)) |
| --- | --- |
| 1   | (1,1) (2,5) (4,7) (5,2) (7,4) (8,8) |
| 2   | (1,2) (2,1) (4,5) (5,4) (7,8) (8,7) |
| 4   | (1,4) (2,2) (4,1) (5,8) (7,7) (8,5) |
| 5   | (1,5) (2,7) (4,8) (5,1) (7,2) (8,4) |
| 7   | (1,7) (2,8) (4,4) (5,5) (7,1) (8,2) |
| 8   | (1,8) (2,4) (4,2) (5,7) (7,5) (8,1) |

Note the row lengths: **exactly six, every time.** Not “at most six” — exactly. That detail is the whole story, and I missed it for weeks.

**Table 1 — prime buckets** (up to 200 as illustration):

| dr  | primes ≤ 200 |
| --- | --- |
| 1   | 19, 37, 73, 109, 127, 163, 181, 199 |
| 2   | 2, 11, 29, 47, 83, 101, 137, 173, 191 |
| 4   | 13, 31, 67, 103, 139, 157, 193 |
| 5   | 5, 23, 41, 59, 113, 131, 149, 167 |
| 7   | 7, 43, 61, 79, 97, 151 |
| 8   | 17, 53, 71, 89, 107, 179, 197 |

The prime 3 gets no bucket — divisibility by 3 is checked before the tables are consulted.

* * *

## Part III — Two algorithms

## Version 1: sieve and buckets

```python
#!/usr/bin/env python3
"""
Digital-root pairing constraint — bucket implementation.
Author: Osanda Malith Jayathissa (@OsandaMalith)
"""
import math


def digital_root(n):
    return 0 if n == 0 else 1 + (n - 1) % 9


# Table 2: product digital root -> the (root_p, root_q) pairs that produce it.
# Roots coprime to 3 (a number's dr is a multiple of 3 iff the number is).
ROOTS = [1, 2, 4, 5, 7, 8]
PAIR_TABLE = {}
for a in ROOTS:
    for b in ROOTS:
        PAIR_TABLE.setdefault(digital_root(a * b), []).append((a, b))


def is_prime(n):
    """Deterministic Miller-Rabin for n < 3.3e24 with these witnesses."""
    if n < 2:
        return False
    for p in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % p == 0:
            return n == p
    d, s = n - 1, 0
    while d % 2 == 0:
        d //= 2
        s += 1
    for a in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(s - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True


# Table 1: mark off composites up to `limit`, bucketing survivors by digital root.
# bytearray scales to large limits where a list of bools would blow up memory.
# Sieving and bucketing share one pass -- no second traversal.
def prime_buckets(limit):
    flags = bytearray([1]) * (limit + 1)
    flags[0:2] = b"\x00\x00"
    buckets = {r: [] for r in ROOTS}
    for n in range(2, limit + 1):
        if flags[n]:
            if n * n <= limit:
                # len(range(...)) is O(1); len(flags[n*n::n]) would COPY the
                # slice just to measure it -- ~115 MB of garbage at 52 bits.
                flags[n*n::n] = bytearray(len(range(n*n, limit + 1, n)))
            dr = digital_root(n)
            if dr in buckets:
                buckets[dr].append(n)
    return buckets


def factor_using_tables(N, verbose=True):
    """Return (p, q) with p*q == N, or (None, None) if N is prime.

    NOTE: for a true semiprime, q = N/p is automatically prime. For N with
    three or more prime factors the returned q may be COMPOSITE -- the caller
    is told via the `q_is_prime` flag printed below.
    """
    for small in (2, 3):                       # small primes the dr-buckets exclude
        if N % small == 0:
            if verbose:
                print(f"  divisible by {small} -> tables not needed")
            return small, N // small

    drN = digital_root(N)
    buckets = prime_buckets(math.isqrt(N) + 1)  # isqrt is exact for big N;
                                                # int(math.sqrt(N)) is WRONG >= 54 bits
    if verbose:
        print(f"  digital root of N: {drN}")
        print(f"  candidate root pairs: {PAIR_TABLE[drN]}")

    for dr_p, dr_q in PAIR_TABLE[drN]:
        for p in buckets[dr_p]:
            if p * p > N:
                break
            # the digital_root(N//p) test below can never fail: if p divides N
            # then N = p*q is a true integer product, so dr(p)*dr(q) = dr(N)
            # holds automatically and dr_q is forced. Kept to match the spec.
            if N % p == 0 and digital_root(N // p) == dr_q:
                if verbose:
                    print(f"  hit in bucket ({dr_p},{dr_q})")
                return p, N // p
    return None, None


EXAMPLES = [
    (3038099,            "small semiprime, both factors coprime to 6"),
    (829348951,          "different root pair (dr 4)"),
    (4295229443,         "factors near 2^16"),
    (10969629647,        "6-digit factors"),
    (15485863,           "prime N -> no split found"),
    (89999999100000051,  "hits the /3 shortcut, tables never run"),
]

for N, note in EXAMPLES:
    print(f"N = {N}   ({note})")
    p, q = factor_using_tables(N)
    if p:
        tag = "" if is_prime(q) else "   <-- q is COMPOSITE (N was not a semiprime)"
        print(f"  -> {p} x {q}{tag}\n")
    else:
        print("  -> no factors (N is prime)\n")
```

**Pseudocode:**

```lua
ALGORITHM  PairingConstraint-Buckets(N)
INPUT   N = p·q, a semiprime
OUTPUT  (p, q), or FAIL

 1  if N mod 2 = 0: return (2, N/2)
 2  if N mod 3 = 0: return (3, N/3)
 3
 4  r     <- dr(N)                                  ▷ O(log N)
 5  pairs <- { (a,b) in U×U : a·b = r (mod 9) }     ▷ O(1),  |pairs| = 6
 6  S     <- Sieve(floor(sqrt N))                   ▷ O(sqrt N · log log sqrt N)
 7  B[u]  <- { p in S : dr(p) = u }   for u in U    ▷ O(sqrt N / log N),  O(sqrt N) SPACE
 8
 9  for (a, b) in pairs:                            ▷ 6 iterations
10      for p in B[a] while p² <= N:                ▷ |B[a]| ~ pi(sqrt N)/6
11          if N mod p = 0:                         ▷ the only real work
12              q <- N / p
13              if dr(q) = b: return (p, q)
14  return FAIL

where U = {1, 2, 4, 5, 7, 8}, the units mod 9
```

**Complexity:**

|     | time | space |
| --- | --- | --- |
| sieve to √N | O(√N log log √N) | **O(√N)** |
| bucketing | O(√N / log N) | O(√N) |
| searching | O(π(√N)) ≈ O(√N / log N) | —   |
| **total** | **O(√N log log N)** | **O(√N)** |

The sieve dominates both columns. The search — the part I cared about — is the cheapest thing in the table.

## Version 2: the wheel

The O(√N) space bothered me. I was materialising every prime below √N to walk through them once. So: drop the sieve, generate candidates on the fly, keep nothing.

```python
def factor_wheel(N):
    """Factor a semiprime by 6k+/-1 trial division. Constant memory."""
    if N % 2 == 0:
        return 2, N // 2
    if N % 3 == 0:
        return 3, N // 3

    limit = math.isqrt(N)
    p, step = 5, 2
    while p <= limit:
        if N % p == 0:
            return p, N // p
        p += step
        step = 6 - step      # +2, +4, +2, +4 ... skips multiples of 2 and 3
    return None, None
```

**Pseudocode:**

```r
ALGORITHM  PairingConstraint-Streaming(N)
INPUT   N = p·q, a semiprime
OUTPUT  (p, q), or FAIL

 1  if N mod 2 = 0: return (2, N/2)
 2  if N mod 3 = 0: return (3, N/3)
 3
 4  r       <- dr(N)                                ▷ O(log N)
 5  pairs   <- { (a,b) in U×U : a·b = r (mod 9) }   ▷ O(1)
 6  allowed <- { a : (a,b) in pairs }               ▷ the constraint
 7
 8  p <- 5;  step <- 2                              ▷ NO SIEVE. O(1) SPACE.
 9  while p <= sqrt(N):
10      if dr(p) in allowed:                        ▷ the constraint, inline
11          if N mod p = 0:
12              q <- N / p
13              if (dr(p), dr(q)) in pairs: return (p, q)
14      p    <- p + step
15      step <- 6 - step                            ▷ +2, +4, +2, +4 ...
16  return FAIL
```

|     | time | space |
| --- | --- | --- |
| **streaming** | **O(√N)** | **O(1)** |

Line 15 is the whole trick. That toggle walks 5, 7, 11, 13, 17, 19, 23, 25 — every number that isn’t a multiple of 2 or 3. Twelve lines, two integers in memory, no preprocessing.

I was pleased with that toggle. I’d derived it from the observation that every prime above 3 has the form \\(6k \\pm 1\\).

### It has a name

It’s called **wheel factorization**, and it’s been in the textbooks since the 1970s.

Pick a wheel modulus \\(w\\) = the product of the first few primes; generate only the residues coprime to \\(w\\). My toggle is the \\(w = 6\\) wheel — the smallest useful one. The standard version uses \\(w = 30 = 2 \\times 3 \\times 5\\) and walks eight residues.

I hadn’t heard of it. I derived it, and it was already fifty years old.

That was the first honest signal I’d had. **If a technique feels elegant and obvious in retrospect, someone found it decades ago.**

* * *

## Part IV — Why it can’t work

## The picture

The multiplication table of \\({1,2,4,5,7,8}\\) modulo 9:

| ×   | 1   | 2   | 4   | 5   | 7   | 8   |
| --- | --- | --- | --- | --- | --- | --- |
| **1** | 1   | 2   | 4   | 5   | 7   | 8   |
| **2** | 2   | 4   | 8   | 1   | 5   | 7   |
| **4** | 4   | 8   | 7   | 2   | 1   | 5   |
| **5** | 5   | 1   | 2   | 7   | 8   | 4   |
| **7** | 7   | 5   | 1   | 8   | 4   | 2   |
| **8** | 8   | 7   | 5   | 4   | 2   | 1   |

**Every row contains all six values exactly once.** Every column too. It’s a **Latin square**— what the multiplication table of a *group* always looks like.

Those six residues are the **units modulo 9**, \\((\\mathbb{Z}/9\\mathbb{Z})^{\\times}\\): the residues coprime to 9. There are \\(\\varphi(9) = 6\\), forming a cyclic group generated by 2:

$$2^1=2,; 2^2=4,; 2^3=8,; 2^4 \\equiv 7,; 2^5 \\equiv 5,; 2^6 \\equiv 1 \\pmod 9$$

Go back and look at Table 2. Every row had exactly six pairs — and *this* is why. Each row of the Latin square hits every value once, so for any target \\(r = \\mathrm{dr}(N)\\) you can reach it from **every** starting \\(\\mathrm{dr}(p)\\). Six starting points, six pairs, no exceptions.

## The proof

Pick any candidate \\(p\\) with \\(\\mathrm{dr}(p) = u\\). What must its partner’s root be?

$$u \\cdot \\mathrm{dr}(q) \\equiv \\mathrm{dr}(N) \\pmod 9 \\quad\\Longrightarrow\\quad \\mathrm{dr}(q) \\equiv \\mathrm{dr}(N) \\cdot u^{-1} \\pmod 9$$

**In a group, every element has an inverse.** So \\(u^{-1}\\) always exists, the partner root always exists, and it’s always a unit.

> **No candidate \\(p\\) is ever excluded, because a valid partner \\(q\\) always exists.**

Exhaustively:

| dr(N) | possible dr(p) | ruled out |
| --- | --- | --- |
| 1   | 1, 2, 4, 5, 7, 8 | none |
| 2   | 1, 2, 4, 5, 7, 8 | none |
| 4   | 1, 2, 4, 5, 7, 8 | none |
| 5   | 1, 2, 4, 5, 7, 8 | none |
| 7   | 1, 2, 4, 5, 7, 8 | none |
| 8   | 1, 2, 4, 5, 7, 8 | none |

Every case. Nothing ruled out, ever.

Feed the table \\(\\mathrm{dr}(N)\\) and it tells you that \\(\\mathrm{dr}(p) \\in {1,2,4,5,7,8}\\) — which is just *“\\(p\\) is a prime other than 3.”* **You knew that before you built it. The table returns its own input.**

The `digital_root(q) == dr_q` check is a no-op too. If \\(q = N/p\\) is an integer, \\(N = pq\\) is a true product, so \\(\\mathrm{dr}(p)\\cdot\\mathrm{dr}(q) \\equiv \\mathrm{dr}(N)\\) *automatically*— `dr_q` is forced. Across every factorization I ran: **zero rejections.**

The reason is almost funny: the very group structure that makes the pattern elegant is what guarantees it’s useless. The Latin square is *pretty* and *empty* for the same reason.

## Counting the information

\\(\\mathrm{dr}(N)\\) tells you exactly one thing: \\(N \\bmod 9\\). You can’t extract more from a quantity than it contains. Knowing \\(N \\bmod 9\\) narrows the pair from 36 possibilities to 6:

$$\\log_2!\\left(\\frac{36}{6}\\right) = \\log_2 6 \\approx 2.6 \\text{ bits}$$

For RSA-2048, \\(p\\) is ~1024 bits. You need ~ **1024 bits** of information. You have **2.6**.

Stacking helps less than you’d hope. Add mod 8, mod 5, mod 7, CRT them together — the bits accumulate **linearly** while the search space grows **exponentially**.

## Where dr can attach at all

One structural fact kills every variant in advance. Digital-root multiplicativity requires a **true integer product**. Modular reduction destroys it: if \\(c = a \\cdot b \\bmod M\\) then \\(c = ab – Mk\\), so

$$c \\equiv \\mathrm{dr}(a)\\mathrm{dr}(b) – (M \\bmod 9)\\cdot k \\pmod 9$$

and \\(k\\) depends on the secret. The relation dies unless \\(9 \\mid M\\).

Audit the whole cryptosystem:

| expression in RSA | kind | does dr apply? |
| --- | --- | --- |
| N = p · q | **true integer product** | **yes** |
| c = mᵉ mod N | reduced | no  |
| s = m^d mod N | reduced | no  |
| e · d ≡ 1 mod φ(N) | reduced | no  |

**Exactly one foothold in all of RSA**— and it’s the one just proven worthless.

## “But quantum computers—”

**Shor’s algorithm doesn’t search for \\(p\\) at all.** It picks random \\(a\\) and uses the quantum Fourier transform to find the **period** \\(r\\) of \\(a^x \\bmod N\\); then \\(\\gcd(a^{r/2} \\pm 1, N)\\) hands you a factor. No candidate list, no buckets, **nothing to filter**.

Grover, which *does* search, gives only a quadratic speedup: \\(2^{512}\\) oracle calls for RSA-2048 — about \\(10^{127}\\) ages of the universe. A 6× filter leaves you \\(10^{127}\\) ages of the universe.

* * *

## Part V — The tests

Everything above is argument. Here is measurement. All figures from my own machine and my own RTX 5090.

## Test 1: Version 1 breaks a 52-bit key

Same key for both versions, so the comparison is exact:

```toml
N   = 2,756,588,697,481,477   PUBLIC   (52 bits)
e   = 65,537                  PUBLIC
c   = 2,465,655,241,275,296   (ciphertext of b'Osanda')
```

The attacker has `c`, `e`, `N` and nothing else. Version 1:

```sql
  dr(N) = 4
  Table 2 says (dr(p), dr(q)) must be one of:
    [(1, 4), (2, 2), (4, 1), (5, 8), (7, 7), (8, 5)]

  sieving every prime below sqrt(N) = 52,503,225 ...

  primes sieved and bucketed : 3,142,101
  candidates divided         : 2,033,815

  p = 46,031,351   (dr = 5)
  q = 59,885,027   (dr = 8)
  correct? True
  d recovered? True    plaintext = b'Osanda'

  ----------------------------------------------------
  sieve + bucket build       |    5.203 s
  search                     |    0.313 s
  ----------------------------------------------------
  TOTAL                      |    5.640 s
  peak memory                |    180.5 MB
```

**A real key, genuinely broken, message recovered.** Note the split: the sieve took **5.203s** and the search took **0.313s**. The part I cared about is 5% of the runtime. The other 95% is building the list of primes I then walk through once.

Note also that the pair which fired was \\((5, 8)\\) — \\(\\mathrm{dr}(p)=5\\), \\(\\mathrm{dr}(q)=8\\), exactly as the worked example in Part II predicted.

## Test 2: Version 2 breaks the same key

Same N, same ciphertext, same constraint. No sieve.

```sql
  dr(N) = 4
  Table 2 says (dr(p), dr(q)) must be one of:
    [(1, 4), (2, 2), (4, 1), (5, 8), (7, 7), (8, 5)]

  no sieve. streaming 6k+/-1 candidates up to 52,503,225 ...

  allowed dr(p) values       : [1, 2, 4, 5, 7, 8]
  candidates generated       : 15,343,783
  candidates passing filter  : 15,343,783
  rejected by the constraint : 0

  p = 46,031,351   q = 59,885,027
  correct? True
  d recovered? True    plaintext = b'Osanda'

  ----------------------------------------------------
  sieve + bucket build       |     none
  search                     |    4.126 s
  ----------------------------------------------------
  TOTAL                      |    4.126 s
  peak memory                |      0.0 MB
```

**1.37× faster on 0 MB instead of 180 MB.** The rewrite worked. Dropping the sieve was the right call — I pay 7.5× more division tests (15.3M vs 2.0M, because the wheel tests composites like 25 and 35) and still come out ahead, because *finding* the primes cost more than *using* them saved.

But look at three lines in that output:

```
  allowed dr(p) values       : [1, 2, 4, 5, 7, 8]
  candidates passing filter  : 15,343,783
  rejected by the constraint : 0
```

`allowed` is **every unit**. The filter passed **all 15,343,783** candidates and rejected **zero**.

## Test 3: The control

Same wheel. Every line of digital-root code deleted.

```
  p = 46,031,351   q = 59,885,027   correct? True
  candidates divided : 15,343,783   (identical: True)
  TOTAL              : 2.028 s

  with the constraint    :    4.126 s
  constraint deleted     :    2.028 s
  -> removing my idea is   2.03x FASTER
```

Identical candidates. Identical answer. **Half the time.**

The three-way scoreboard, same key, same machine, same conditions:

| version | time | memory | vs best |
| --- | --- | --- | --- |
| V1 — buckets (sieve) | 5.640 s | 180.5 MB | 2.78× slower |
| V2 — same constraint, wheel | 4.126 s | 0 MB | 2.03× slower |
| **V2 with my idea deleted** | **2.028 s** | **0 MB** | **fastest** |

Read the last two rows. My rewrite was a real improvement — and the fastest version of my own algorithm is the one with **my contribution removed**.

The constraint rejected 0 of 15,343,783 candidates and charged a modulo for every one of them.

## Test 4: Does the digital root do anything? (CPU)

The question that matters. I benchmarked my bucketed version against plain trial division on 150 balanced semiprimes, counting division tests. It won — **0.616×**, a 1.6× speedup. I believed it.

Then I ran the control. Keep the algorithm **identical**— same six buckets, same walk order, same division test — but assign primes to buckets **at random**. Meaningless labels. A coin flip. No mathematics at all.

| method | avg division tests | ratio |
| --- | --- | --- |
| trial division (ordered) | 3179.4 | 1.000× |
| **digital-root buckets** | **1957.0** | **0.616×** |
| **random (meaningless) buckets** | **2082.3** | **0.655×** |

**The coin flip gets the same speedup.**

The ~6% gap isn’t information — it’s bucket balance. Digital-root buckets come out near-equal-sized (Dirichlet’s theorem); random assignment gives lumpy ones, and lumpy is slightly worse.

The 1.6× comes from **not scanning in sorted order**. Trial division tests 2, 3, 5, 7, 11… in increasing order, and for a balanced semiprime \\(p\\) sits just under √N — the very *end* of that scan. Sorted order is worst-case by construction. Any reordering beats it. Digital roots reorder. Coin flips reorder. Both win identically.

Theory predicts it exactly: walk buckets until you hit the right one, on average 3.5 of 6 → **3.5/6 = 0.583×**. Observed: 0.616 and 0.655.

## Test 5: Which trial division does it beat?

First, theory. What fraction of integers below √N does each method examine?

| method | density | vs naive |
| --- | --- | --- |
| naive (every integer) | 1.000 | 1.00× |
| odds only | 0.500 | 2.00× |
| 6k±1 wheel (mod 6) | 0.333 | 3.00× |
| **mine (mod 6 + dr filter)** | **0.333** | **3.00×** |
| mod-30 wheel (2, 3, 5) | 0.267 | 3.75× |

Rows 3 and 4 are **identical**. The digital-root filter removes *nothing* the wheel hadn’t — because \\(6k \\pm 1\\) is never divisible by 3, so every candidate already has \\(\\mathrm{dr} \\in {1,2,4,5,7,8}\\) by construction.

Instrumented:

```
wheel candidates generated up to 2,000,000 : 666,666
rejected by the digital-root filter         : 0
```

Zero out of 666,666. `step = 6 - step` and `dr(p) ∈ {1,2,4,5,7,8}` are **the same statement**, and I was executing both.

Measured — same semiprimes, same answers, only the generator differs:

| method | total time | vs naive | vs 6k±1 |
| --- | --- | --- | --- |
| naive (every integer) | 0.1651s | 1.00× | 0.38× |
| odds only | 0.0831s | 1.99× | 0.76× |
| 6k±1 wheel | 0.0629s | **2.62×** | 1.00× |
| **mine (wheel + dr)** | **0.1401s** | **1.18×** | **0.45×** |
| mod-30 wheel | 0.0656s | 2.52× | 0.96× |

So, honestly:

-   **vs naive trial division: 1.18× faster.** True — and the wheel is doing all of it.
-   **vs “skip the even numbers”: 0.59×.** I lose to the single dumbest optimisation in arithmetic.
-   **vs the same wheel with the digital roots deleted: 0.45×.** Removing my idea makes my program **2.2× faster**.
-   **vs a 1970s textbook wheel: 0.47×.**

I independently derived wheel factorization — the correct optimisation — then bolted onto it the exact thing that made it redundant.

## Test 6: The same ablation, in hardware

To rule out interpreter overhead, I wrote both as CUDA kernels — byte-for-byte identical except four lines:

```
unsigned int dr = 1u + (unsigned int)((c - 1ULL) % 9ULL);
if (dr==1u||dr==2u||dr==4u||dr==5u||dr==7u||dr==8u) {
    if (N % c == 0ULL) atomicMin(hit, c);
}
```

Both generate identical candidates, so candidates-per-second is exactly the right metric. On an RTX 5090 (34.2 GB, 170 SMs, CC 12.0), across repeated runs:

| kernel | candidates/sec |
| --- | --- |
| wheel6 alone | 307,275,033,038 |
| wheel6 + dr filter | 283,159,763,477 |

**Deleting the digital-root filter makes it 1.07–1.09× faster on GPU.**

**7% slower in hardware, 129% slower in Python.** The gap is itself informative: on GPU the kernel is dominated by the expensive 64-bit `N % c`, and `% 9` compiles to a cheap multiply-and-shift. In CPython, `digital_root()` is an interpreted function call. Different bottleneck, same verdict — on both architectures, removing my idea makes the program faster.

A cost of 7% or 129%, in exchange for zero candidates eliminated, is the same trade at different exchange rates.

## Test 7: The wall

From my measured 42 ns per candidate:

| N bits | time to break |
| --- | --- |
| **52** | **0.93 seconds** ← the demo above |
| 64  | 59.7 seconds |
| 80  | 4.2 hours |
| 96  | 45.3 days |
| 128 | 8,145 years |
| 512 | 10⁵² ages of the universe |
| 1024 | 10¹²⁹ ages of the universe |
| **2048** | **10²⁸³ ages of the universe** |

52 bits is a second. 96 bits is a month and a half. 128 bits outlives civilisation — and that’s only **76 bits** past the key I just broke. I’m not 40× short of RSA-2048. I’m 2⁹⁹⁸ short.

## Test 8: Pointing it at a real 1024-bit key

```
  dr(N) = 2
  compatible pairs: [(1, 2), (2, 1), (4, 5), (5, 4), (7, 8), (8, 7)]
  ^ the tables work fine. They always work. That was never the problem.

  limit = isqrt(N) + 1  =  a 512-bit number ~ 10^153
  sieve = [True] * (limit + 1)
    memory needed : ~10^154 bytes
    atoms in the observable universe : ~10^80

  calling generate_primes(limit)...
  OverflowError: cannot fit 'int' into an index-sized integer
```

It doesn’t run slowly. It fails on the **first line of the sieve**, before testing a single candidate. √N exceeds Python’s maximum list index by a factor of 10¹³⁵.

And note the first two lines: the digital-root machinery handled a 308-digit modulus perfectly. **The tables were never the bottleneck. They work at any size, and they do nothing at any size.**

## Test 9: “Just use a GPU”

My first GPU benchmark used cupy array ops and reported 8.4 billion tests/sec. That number was wrong — it materialises a 16M-element array and writes every remainder to VRAM, so it measured memory bandwidth, not arithmetic. Rewritten as a fused CUDA kernel:

```
  CPU (pure Python)          :          28,726,346 tests/sec
  GPU (fused kernel, 5090)   :     307,275,033,038 tests/sec
```

**307 billion trial divisions per second.** 10,700× the CPU.

What’s it worth? Cost scales as \\(2^{\\text{bits}/2}\\), so a speedup \\(s\\) buys \\(2\\log_2 s\\) bits:

$$2 \\cdot \\log_2(10{,}700) \\approx 26.8 \\text{ bits}$$

**The 5090 moves the wall 27 bits to the right.** I need 900 more.

Sit with that. Fixing my benchmark made the GPU **36× faster**— and it bought **11 additional bits**. Going from 8.4 billion to 307 billion operations per second turns 16 bits into 27. That is the entire shape of the problem in one line.

| compute budget | largest N |
| --- | --- |
| 1 hour | ~103 bits |
| 1 day | ~112 bits |
| 1 year | ~129 bits |
| **100 years** | **~143 bits** |

**Run the fastest consumer GPU on earth flat out for a century and you reach 143-bit keys.**

There’s a second problem even if the arithmetic worked. CUDA’s largest native integer is `uint64`, so `N % candidate` requires \\(N < 2^{64}\\). Beyond that you need multi-precision kernels and throughput collapses. **The GPU speedup exists precisely in the range where you don’t need it, and evaporates in the range where you do.**

## Test 10: The physics

“Fine — but a real cracking rig? Against RSA-2048?”

$$\\pi(2^{1024}) \\approx \\frac{2^{1024}}{1024 \\cdot \\ln 2} \\approx 10^{305} \\text{ candidates}$$

At my measured 307 billion/sec:

| rig | time to factor RSA-2048 |
| --- | --- |
| my one RTX 5090 | 10²⁷⁹ ages of the universe |
| an 8-GPU cracking rig | 10²⁷⁸ ages of the universe |
| 1 million GPUs | 10²⁷³ ages of the universe |
| every GPU ever manufactured | 10²⁷⁰ ages of the universe |
| **one GPU per atom in the Earth** | **10²²⁹ ages of the universe** |

Read that column, not the rows. **One** GPU to **a billion** moves you from 10²⁷⁹ to 10²⁷⁰ — nine orders of magnitude off two hundred and seventy-nine. Converting the entire planet, atom by atom, into RTX 5090s gets you to 10²²⁹.

There is no rig. But it’s worse than that, because the question stops being about engineering.

### Landauer’s limit

Erasing one bit at temperature \\(T\\) costs at minimum

$$E\_{\\min} = k_B T \\ln 2 \\approx 2.87 \\times 10^{-21} \\text{ J at } 300\\text{K}$$

Be absurdly generous — assume an entire trial division costs **one bit flip**. Then RSA-2048 needs

$$10^{305} \\times 2.87 \\times 10^{-21} \\approx 10^{285} \\text{ joules}$$

|     | energy |
| --- | --- |
| total lifetime output of the Sun | 10⁴⁴ J |
| mass-energy of the observable universe | 10⁷⁰ J |
| **required** | **10²⁸⁵ J** |

|     | needed |
| --- | --- |
| Suns | 10²⁴¹ |
| **observable universes** | **10²¹⁵** |

You would need to convert **10²¹⁵ observable universes** entirely into computation — at the theoretical minimum energy per operation, with no waste, at one bit per division.

So the answer to “won’t a cracking rig help?” isn’t *no*. It’s that the question has left engineering entirely.

**Trial division against RSA is not a software problem. It is a physical impossibility.**

* * *

## Part VI — What actually breaks RSA

None of it involves patterns in primes.

**Small modulus.** Just factor it. That’s this entire post.

**Primes too close together.** If someone picks \\(q = \\text{nextprime}(p)\\), then N sits barely above a perfect square:

$$N = \\left(\\frac{p+q}{2}\\right)^2 – \\left(\\frac{q-p}{2}\\right)^2 = a^2 – b^2 = (a-b)(a+b)$$

Start at \\(a = \\lceil\\sqrt N\\rceil\\) and walk up, testing whether \\(a^2 – N\\) is a perfect square. If \\(p\\) and \\(q\\) are close, \\(b\\) is tiny and you land in **one step**. Not hypothetical — in 2022 Hanno Böck found keys in production printers that fell to exactly this (CVE-2022-26320).

**Two keys sharing a prime.** An embedded device generating a key on first boot, before it’s gathered entropy, can produce a modulus sharing a prime with another device’s. Both look fine. Both are 2048-bit. Then:

$$\\gcd(N_1, N_2) = p;\\Longrightarrow; q_1 = N_1/p, \\quad q_2 = N_2/p$$

One gcd. Both keys dead. Euclid’s algorithm from 300 BC, in microseconds. This is *“Ron was wrong, Whit is right”* (Lenstra et al., 2012) and *Mining Your Ps and Qs* (Heninger et al., 2012) — internet-wide scans found tens of thousands of TLS and SSH hosts sharing factors.

**The pattern in the failures:** every real break attacks a **procedure**, not the mathematics.

> **RSA doesn’t fall to clever patterns in strong keys. It falls to keys that were generated badly.**

Factoring stayed hard the whole time. What failed was an RNG with no entropy, or a developer choosing `nextprime(p)` because it was convenient.

* * *

## Part VII — The true hinge

The pattern I found was real. The modular groups were real. The code ran, and it cracked a 52-bit key in 640 milliseconds and read the message back.

And the whole thing is worth **2.6 bits** against a **1024-bit** problem.

That gap — between an observation being *true* and being *useful*— is where most amateur cryptanalysis lives. The pattern isn’t wrong. It’s just small, and RSA is very, very large. This is the anatomy of an educational mistake, and I’d rather write it up than quietly delete the repo.

## Three numbers that looked like results

Three times in this project I produced a number I believed:

1.  **A 1.6× speedup**— that a coin flip reproduced exactly.
2.  **A “faster” algorithm**— that was faster because a bug made it fail on 46% of inputs.
3.  **Microsecond timings on 57-bit numbers**— because those numbers had factors of 3 and 7.

Each time the number was real. Each time, the thing I thought produced it wasn’t.

The ten lines that killed the first one were the lines that replaced my clever idea with a coin flip. That’s an **ablation**: hold everything constant, remove only the part you think is doing the work, and see whether the result survives. If it survives, your part wasn’t the cause.

It’s routine in machine-learning research and almost entirely absent from amateur number theory — which is exactly why the internet is full of prime-pattern factoring schemes that were never asked the only question that matters: *compared to what?*

**If the simple baseline runs faster, your clever idea was never an optimisation. It was a tax on your hardware.**

## What RSA actually rests on

The thing worth internalising is the shape of the security argument. RSA isn’t secure because exponentiation is confusing, or because the numbers are big and scary. It rests on a single hinge:

$$d \\equiv e^{-1} \\pmod{\\varphi(N)}$$

The modulus \\(N\\) is published to the world. But the clock you decrypt on — \\(\\varphi(N) = (p-1)(q-1)\\) — is secret, and the only way to find it is to factor \\(N\\).

My own timings proved it better than any argument could: factoring was **100.00%** of the attack. Recovering \\(d\\) and decrypting the message took 16 microseconds and rounded to zero. One hinge; everything hanging off it is free.

Change \\(\\varphi(N)\\) to \\(N\\) and it’s broken in a line — that’s my 2017 toy. Pick \\(p\\) and \\(q\\) badly and it falls to Fermat or a gcd — that’s every real-world RSA failure on record. Keep that one hinge intact and no digit trick, no prime pattern, no 5090, and no quantum search will touch it.

When RSA keys fail in the wild, it is never because someone found a clever digit pattern or a faster wheel. It’s bad entropy, or a developer who reached for `nextprime(p)` because it was convenient.

**The lock isn’t the arithmetic. It’s the gap between \\(N\\) and \\(\\varphi(N)\\).**

* * *

*Prior art: the digital-root-of-primes pattern is documented empirically at [Revoledu](https://people.revoledu.com/kardi/tutorial/DigitSum/digital-root-prime.html), framed there as an unproven conjecture from a finite sample — the one-line proof above settles it. [“Digital Roots and their Properties”](https://www.academia.edu/10228439/Digital_Roots_and_their_Properties) makes the factorization/crypto connection directly; this post is, in effect, the ablation that position never received. For the genre of publishing RSA attacks that don’t work, see [The ray attack](https://arxiv.org/pdf/cs/0307029). For the weak-key attacks that do, see [When RSA Fails](https://arxiv.org/pdf/2512.22720).*
