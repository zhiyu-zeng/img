---
title: 【微信】TC/VC加密容器的密码破解（二）：测试验证
source: https://mp.weixin.qq.com/s/2HNo7zPury8BaY_w-a3N0A
source_host: mp.weixin.qq.com
clip_date: 2026-11-11T08:33:59+08:00
trace_id: e5dd9d7d-2d0a-4cc2-bd52-880d8643c0df
content_hash: 1c2a9de3d8a0c4c86874141fdaf6b806598fda1957c78976af7f067a3eb45fbf
status: synced
tags:
  - 微信
  - 密码学
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: TC/VC 容器密码破解已验证可行：需同时命中加密算法与哈希算法两个参数，纯 Python 工具 CPU 速度极慢、GPU 可达数十万次/秒。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41575244-d011-8188-b96d-e9137f3ac779
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TC/VC 容器密码破解已验证可行：需同时命中加密算法与哈希算法两个参数，纯 Python 工具 CPU 速度极慢、GPU 可达数十万次/秒。
> 
> - **双参数缺一不可：** TrueCrypt/VeraCrypt 卷中哈希算法（KDF，决定密钥派生）与加密算法（XTS 解密）相互独立，任何一项选错解密即失败；共 8 种加密组合（单/双混/三混）×3 种哈希（Ripemd-160/SHA-512/Whirlpool）。
> - **工具用法：** 纯 Python 无第三方依赖的 truecrypt_veracrypt_decrypt.py，支持 extract/verify/crack/decrypt 四个子命令；crack 可指定 `--type`、`--kdf`、`--xts`、`--iterations`、`--pim`、`--backend`（cpu/gpu）等参数。
> - **测试结果：** 8 种加密算法 × 3 种哈希组合均破解成功（如 `--type truecrypt --wordlist wordlist.txt` 得到 FOUND 密码），前提是字典包含正确密码。
> - **CPU 速度瓶颈：** 纯 Python PBKDF2 开销大——TrueCrypt XTS512 约 17.7 词/秒，错误密码最坏仅 0.23 词/秒；VeraCrypt XTS512 约 0.15 词/秒（655331 次迭代），1000 词需 1.8 小时。
> - **建议：** TrueCrypt 小词表可自动检测；大词表或 VeraCrypt 务必显式指定 `--kdf` 和 `--xts` 省数倍至数十倍时间；GPU（RTX 3060）下 TrueCrypt RIPEMD160 XTS1536 达 7.86 万次/秒，比 CPU 单进程快约 300~18 万倍。

**MicroPest** *2026年11月11日 00:14*

接着《 [TC/VC加密容器的密码破解](https://mp.weixin.qq.com/s?__biz=MjM5NDcxMDQzNA==&mid=2247491115&idx=1&sn=367bf8dd13c6066ebe9ac416d3218f45&scene=21#wechat_redirect) 》继续聊聊这个。

以Truecrypt为例：

它提供了8种加密算法，分别为：3种单加密（AES/Serpent/Twofish）、3种双混加密（AES-Twofish/Serpent-AES/Twofish-Serpent）、2种三混加密（AES-Twofish-Serpent/Serpent-Twofish-AES）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91f299be73153bfe.png)

哈希算法3种：Ripemd-160/SHA-512/Whirlpool。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/411f44d3b8004a56.png)

二、加密算法和哈希算法两者的关系

TrueCrypt/VeraCrypt 卷里有 **两个相互独立、缺一不可** 的密码学选择：

-   **哈希算法**
    
    → 决定"怎么从密码得到密钥"（密钥派生，KDF）
    
-   **加密算法**
    
    → 决定"怎么把密文解开"（XTS 加密/解密）
    

两者都必须与卷创建时的设置一致， **任何一个选错，解密都会失败**。所以"起决定作用"的其实是两个，不只是加密算法。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d129c2c1c0a506a2.png)

三、测试

我们完成了单加密算法、双混加密算法、3混加密算法共8种组合，以及3种哈希算法的字典密码破解测试。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/580f89ecbce31eb1.png)

1、全部用法：

python truecrypt_veracrypt_decrypt.py -h

usage: truecrypt_veracrypt_decrypt.py \[-h\] {extract,verify,crack,decrypt}...

TrueCrypt/VeraCrypt 解密工具（纯 Python 实现，无第三方依赖）

positional arguments:

{extract,verify,crack,decrypt}

extract 从容器提取 hash（等同 truecrypt2hashcat.py）

verify 验证密码

crack 从单词表破解

decrypt 解密数据（已知密码）

options:

\-h, --help show this help message and exit

2、字典破解---用法：

python truecrypt_veracrypt_decrypt.py crack -h

usage: truecrypt_veracrypt_decrypt.py crack \[-h\] \[--type {truecrypt,veracrypt}\] \[--kdf {ripemd160,sha512,whirlpool}\]\[--xts {512,1024,1536}\] \[--iterations ITERATIONS\] \[--pim PIM\] \[--boot\]\[--keyfile KEYFILE\] --wordlist WORDLIST \[--hash HASH\] \[--offset OFFSET\]\[--backend {cpu,gpu,auto}\] \[--device DEVICE\] \[--jobs JOBS\]\[--hashcat-path HASHCAT_PATH\] \[--timeout TIMEOUT\]\[container\]

3、测试结果，截图如下（单加密/双混加密/3混加密破解）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3fcebc3500b67ea5.png)

如1：3混加密算法的破解+RipeMD-160哈希算法（默认选择，上图）

python truecrypt_veracrypt_decrypt.py crack --type truecrypt --wordlist wordlist.txt 7-serpent-twofish-aes-whirlpool （用CPU破解）

FOUND: tl!qax@wsx-serpent-twofish-aes-whirlpool

如2：3混加密算法的破解+whirlpool哈希算法（下图）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ba6e8bdd2d33b4de.png)

破解结果如下图：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/385f5cc3c5d2348d.png)

python truecrypt_veracrypt_decrypt.py crack --type truecrypt --wordlist wordlist.txt --backend gpu 7-serpent-twofish-aes-whirlpool （用GPU破解）

FOUND: tl!qax@wsx-serpent-twofish-aes-whirlpool

通过测试，可以看出来，我们已完成了Truecrypt（VC应该也一样）容器文件的密码破解（理论上所有都可以，但密码字典要包含密码在内）。

四、速度

实测 `crack` 的实际破解速度（纯 Python 实现的 PBKDF2 是主要开销），用官方向量在不同配置下测量每个密码的耗时，换算成"次/秒"。

## 1、CPU速度测算

| 配置  | 词/秒 | 换算  |
| --- | --- | --- |
| **TrueCrypt**<br><br>XTS512（显式 `--kdf ripemd160 --xts 512` ） | ~ **17.7** | 1000 词 ≈ 57 秒 |
| TrueCrypt XTS1536（三级联，显式） | ~11.3 | 1000 词 ≈ 89 秒 |
| TrueCrypt 自动检测（正确密码命中即停） | ~11.3 | —   |
| TrueCrypt 自动检测（**错误密码**，最坏情况） | ~0.23 | 1000 词 ≈ 72 分钟 |
| **VeraCrypt**<br><br>XTS512（显式，655331 次迭代） | ~ **0.15** | 1000 词 ≈ 1.8 小时 |
| VeraCrypt 自动检测（错误密码） | ~0.06 | 1000 词 ≈ 4.6 小时 |

## 使用建议

-   小单词表（<5000 词）的 TrueCrypt 卷，自动检测即可，几分钟内跑完。
    
-   大单词表或 VeraCrypt 卷：务必 `--kdf` （如 `--kdf sha512` ）+ `--xts` 显式指定，能省几倍到几十倍时间。
    
-   追求最高速仍应使用 hashcat式的GPU/OpenCL，本脚本定位是"无依赖、可离线、教学/单机验证"。
    

### 2、GPU 速度测算（ RTX 3060 Laptop）

**基准吞吐（**「次/秒」= 每秒可尝试的密码个数；「每次耗时」= 试 1 个密码平均要多久）**：**

| 类型 / 算法 | 速度 (次/秒) | 每次耗时 |
| --- | --- | --- |
| TrueCrypt SHA512 XTS512 | 303,600 | 3.3 µs |
| TrueCrypt RIPEMD160 XTS512 | 196,800 | 5.1 µs |
| TrueCrypt RIPEMD160 XTS1536 | 78,600 | 12.7 µs |
| TrueCrypt Whirlpool XTS512 | 45,700 | 21.9 µs |
| VeraCrypt SHA512 XTS512 | 751 | 1.33 ms |
| VeraCrypt RIPEMD160 XTS512 | 703 | 1.42 ms |
| VeraCrypt SHA512 XTS1536 | 267 | 3.75 ms |
| VeraCrypt RIPEMD160 XTS1536 | 306 | 3.27 ms |
| VeraCrypt Whirlpool XTS512 | 121 | 8.26 ms |
| VeraCrypt Whirlpool XTS1536 | 12  | 83.3 ms |

换算关系： **1 次/秒 = 1 H/s**；µs=微秒（10⁻⁶ 秒），ms=毫秒（10⁻³ 秒）。XTS 位宽越大（512→1536）代表密码级联越复杂，速度越慢。

| 后端  | 速度 (次/秒) | 每次耗时 |
| --- | --- | --- |
| GPU（hashcat） | 78,600 | 12.7 µs |
| CPU 单进程 | ≈0.43 | ≈2.32 秒 |

**一句话结论**：GPU 端在 TrueCrypt RIPEMD160 场景可达 **7.8 万次/秒**，在 VeraCrypt 多级联场景约 **267~751 次/秒**；相比纯 Python CPU 单进程，整体提升约 **300 倍（常见卷）到 18 万倍（RIPEMD160 卷）**。
