---
title: "Two Oracles to Get One Key: A tale of recovering a symmetric key from an encrypt-only firmware update scheme"
source: https://www.ioactive.com/two-oracles-recovering-aes-firmware-key/
source_host: www.ioactive.com
clip_date: 2026-11-11T01:15:17+08:00
trace_id: d081d282-e917-4ba1-a5b9-a54752cea687
content_hash: 8cb22bb1cf8f492c0845b3b51d0959960e310e3f36033b5f080864c7ddb64f5c
status: synced
tags:
  - 协议分析
  - 漏洞分析
series: null
feed_source: IOActive·硬件/漏洞研究
ai_summary: 该设备固件更新用"私钥在设备、公钥保密"的非常规设计，作者用两个预言机（modulus 比较预言机 + PKCS#1 v1.5 填充预言机）完整还原出 AES 固件加密密钥。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41475244-d011-8191-a948-d835692b31b9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该设备固件更新用"私钥在设备、公钥保密"的非常规设计，作者用两个预言机（modulus 比较预言机 + PKCS#1 v1.5 填充预言机）完整还原出 AES 固件加密密钥。
> 
> - **第一个预言机：** OpenSSL 遇到 c ≥ n 时返回 "data too large for modulus" 错误；更新 API 泄露该错误，等于对保密的模数 n 给出是/否比较信号。
> - **恢复公钥方法：** 对 k 位区间做二分搜索，最小"报错"值即 n 本身，约每密钥位一次查询；指数 e 取 OpenSSL 默认 65537，(n, e) 即完整公钥。
> - **第二个预言机：** 有了公钥即可对 PKCS#1 v1.5 做 Bleichenbacher 填充预言机攻击，提交所选密文的倍数，依据解密块是否以 00 02 头有效来逐步收窄明文区间。
> - **关键结果：** 该系统的 RSA 块封装的正是 AES 固件密钥本身，因此 Bleichenbacher 恢复的明文直接就是目标对称密钥，无需拿到私钥。
> - **背景：** 固件为 OpenSSL 混合（信封）加密，带 Salted__ 魔数；这是设备唯一剩余的远程攻击面，作者借鉴了 Dennis Yurichev 的攻击参考实现并适配。

![Two Oracles to Get One Key: A tale of recovering a symmetric key from an encrypt-only firmware update scheme](https://www.ioactive.com/wp-content/uploads/2026/11/Two-Oracles-One-Golden-Key-1024x576.png)

Two Oracles to Get One Key: A tale of recovering a symmetric key from an encrypt-only firmware update scheme

***Can an RSA public key be recovered if it’s never published?*** Yes, if the system leaks whether a submitted value exceeds the modulus. That yes/no signal allows a binary search that recovers the modulus in roughly one query per key bit, and with the standard exponent of 65537, the full public key follows.

***Why does recovering the public key matter?*** It enables a Bleichenbacher padding oracle attack against PKCS#1 v1.5, which here recovered the AES key used to encrypt the firmware.

One of the most satisfying moments in vulnerability research is when you find a way around a show-stopper and manage to fully compromise a system. This post covers a specific situation I was investigating a few years ago: a device so well-secured that its only remaining remote attack vector was the firmware update mechanism. Yet within hours, I’d recovered the full AES key the system relied on. What follows is the technique I used to do it.

It was a kind of “weird” setup. The system shipped its firmware as an encrypted binary blob. Specifically, an RSA hybrid (envelope) encrypted blob that combined an AES-encrypted payload with the corresponding AES key encrypted via public-key crypto. It carried the magic Salted\_\_, so I knew OpenSSL was being used somewhere in the toolchain.

The manufacturer had chosen to use public/private key cryptography in an unusual way: the private key was kept inside the device, and the public key was never published, they kept it to themselves. I guess they’d probably thought this design was secure because it behaves like one that has two secret keys: one to encrypt the AES key, and the other to decrypt it.

In practice, however, the system leaked some errors through its update API, which let me discover the padding it used. I was pretty happy to see that padding was PKCS#1 v1.5, the mode that is vulnerable to a padding oracle attack. The only problem: to actually mount that attack, you need the public key. Why? Because it holds both the exponent and the modulus, which are necessary to carry out the right calculations while mounting the padding attack. Except in this case, the public key was never published.

After submitting multiple modifications of the encrypted firmware looking for edge cases, I noticed the system returned a different error when I submitted some specific malformed messages. Reproducing a similar setup offline, I worked out that it was complaining about the submitted data being too large for the modulus. But wait, what does that actually mean?

## The modulus, and why it matters

An RSA public key is really just two integers, written (n, e). The exponent e is almost always **65537** (0x10001), it’s OpenSSL’s default and is also, for practical purposes, fixed. The modulus n is the product of two secret primes, n = p · q, and its bit length is the key size. Encryption itself is a single modular exponentiation:

```
c = m^e mod n          # m = padded message, c = ciphertext
```

Because every operation is reduced modulo n, OpenSSL first checks that the number you submit is smaller than n. Anything equal to or larger than the modulus cannot be a valid RSA block, so it is rejected before the private-key operation with a specific error data too large for modulus error. In other words, for any value c I chose, the endpoint was telling me whether c >= n: a yes/no comparison against the one number the vendor was trying to keep secret.

Using this oracle on the update API, I came up with a simple method to recover the modulus of the key pair. And since the exponent that OpenSSL uses is known, solving for n meant I could fully reconstruct the public key.

## Recovering the modulus with a binary search

The key observation is that the comparation “is c >= n?” is false for every value below the modulus, and true for everything at or above it. Therefore, the smallest value the oracle calls “too large” is the modulus itself. Using an implementation similar to the below pseudocode, I started quering the oracle with values. If the system returned an error, I would move to the lower half. If it passed the filter, I’d move to the upper half, get the middle value, and then query again. I did this until I could narrow it down to the exact byte that would return an error but the same value minus 1 would pass the filter.

```
lo = 2**(bits-1)          # a real modulus has its top bit set
hi = 2**bits - 1
while hi - lo > 1:
    mid = (lo + hi) / 2
    if too_large(mid):    # oracle: is mid >= n ?
        hi = mid
    else:
        lo = mid
n = hi                    # the smallest 'too large' value is n itself
```

*Figure 1. Aa binary search over the k-bit range converges on n in about k queries, one per bit.*

![Figure 2. Flow Diagram of the queries used to recover the actual modulus. The flow begins with the most significant byte and then moves to the next one, continuing until we have fully recovered the modulus.](https://www.ioactive.com/wp-content/uploads/2026/11/Figure-1-728x1024.png)

Figure 2. Flow Diagram of the queries used to recover the actual modulus. The flow begins with the most significant byte and then moves to the next one, continuing until we have fully recovered the modulus.

*Figure 2. Flow Diagram of the queries* *used to* *recover the actual modulus.* *The flow begins* *with the most significant byte and then* *moves* *to the next one, continuing* *until we have fully recovered* *the modulus.*

## The second oracle: Bleichenbacher on the padding

In the final step, we’re essentially turning the padding check into a second oracle. You submit chosen multiples of the captured ciphertext, and for each one, the endpoint tells you whether the decrypted block begins with the valid 00 02 header of a well-formed v1.5 block. Every “valid” answer confines the unknown plaintext to a narrower numeric interval; iterating the construction shrinks that interval, multiple by multiple, until a single value is left.

Note that this attack doesn’t reveal the actual private key but the plaintext it’s trying to protect. In this specific scheme, the RSA block actually wraps the AES firmware key itself. So, the plaintext Bleichenbacher recovers is not some intermediate secret, it’s the exact symmetric key I’d been after from the start.

I did not reinvent the wheel here: I simply followed Dennis Yurichev’s clear reference write-up of the attack, then adapted my implementation to match this device’s padding oracle error.

The post [Two Oracles to Get One Key: A tale of recovering a symmetric key from an encrypt-only firmware update scheme](https://www.ioactive.com/two-oracles-recovering-aes-firmware-key/) appeared first on [IOActive](https://www.ioactive.com/).
