---
title: 【看雪】Forti8.0固件解包
source: https://bbs.kanxue.com/thread-292786.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-26T18:35:10+08:00
trace_id: a44fb823-46f9-487e-a2f9-35f13ff83c93
content_hash: 0bf7fda74bfc37e2dcc8ba1cccdefb10d7bb16df44c0054b593092528a93a0ad
status: synced
tags:
  - 看雪
  - 固件逆向
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: 新版 FortiOS 固件将对称密钥改为 RSA-2048 签名块包裹，并用高度魔改的 RC4 替代 ChaCha20；逆向还原公钥与密钥后，可完整解密 rootfs.gz。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c875244-d011-81ce-b155-f7f159a302ac
ioc:
  cves: []
  cwes: []
  hashes:
    - 0d8d2bca4cd928c9f874e4f6d5a81460257c31c6ce2cc09b49f772878e08bea0
    - 169577a860171de17019ee1ce7c89e6f44833b959104e4e0b61525c214ea68ae
    - 1ea548d27df49aabe469a07b1c222506aac5032544de5605992f9c8ecafe2d40
    - 31c6c1e3e33f19f477e38cb15845dfc919c60d0ce33975e34a63815bb8bcb47c
    - 4fdca8ac8f30c64053c00a045fa876f2b3c2d0aa2d82b64842e2c6b43c7a4a6c
    - 5e6faf48b11d26399209d792018729e1af9040c14026250ef18da11ebe14a8f9
    - b9d2f002b2772da82796e755dcfd238dd563611c323175ed4e238b23eb76d6fa
    - d4557bc902597e15b8c5a38c18217fb0e9f77ee1f3e50cee4d57166dc6fa358b
    - ee0a6fb93ea9cc5149a62ab2685b44ecfb43be3185d3976b0ce58e6bc9a2b01f
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 新版 FortiOS 固件将对称密钥改为 RSA-2048 签名块包裹，并用高度魔改的 RC4 替代 ChaCha20；逆向还原公钥与密钥后，可完整解密 rootfs.gz。
> 
> - **算法变更：** 新版 x86_64 固件不再明文硬编码 ChaCha20 的 Key/IV，而是将 32 字节核心 RC4 Key 经私钥加密成 256 字节 RSA 签名块，附加在加密 rootfs 文件末尾；解密核心使用基于 RC4 的变体流密码，KSA 阶段按 `key[i & 0x1F]` 参与打乱，PRGA 阶段通过 `idx1=(j>>3)^(i<<5)`、`idx2=(i>>3)^(j<<5)`、`^0xAA` 等操作生成密钥流。
> - **关键定位：** 通过对 `machine_halt()`/`panic()` 交叉引用回溯，定位到校验函数 `sub_FFFFFFFF81710483()`；其中的 270 次 XOR 循环实际是在还原 RSA-2048 公钥，而非直接给出解密密钥。
> - **密钥获取：** 内核 `.init.data` 段的 32 字节 `byte_FFFFFFFF8179A2C0` 只是静态异或混淆种子，用于还原 270 字节硬编码密文得到 RSA 公钥；文件末尾 256 字节 RSA 密文经 `pow(c,e,n)` 解出 96 字节载荷，切片校准后得到核心 RC4 Key：`1EA548D2...FE2D40`。
> - **排错要点：** Python 大端转换与 C 指针偏移导致 Key 错位 1 字节，需按 PKCS#1 v1.5 填充边界将切片定位到缓冲区最后 32 字节；正确对齐后，固件主体 SHA256 与 RSA 块中释放的预期哈希完全匹配。
> - **自动化结果：** 提供的 Python 脚本可导入 RSA 公钥、RSA 解密尾部、用自定义变体 RC4 解密主体；最终 `file` 确认输出为 gzip 压缩数据，rootfs 解密成功。

在嵌入式固件分析和安全测试中，解密固件的根文件系统（rootfs）通常是进行白盒审计的第一步。

此前，GreyNoise Labs 曾发表过一篇关于《Decrypting FortiOS 7.0.x》的博客，指出旧版 7.0.x 固件使用标准的 ChaCha20 算法对 `rootfs.gz` 进行加密，且 32 字节的 Key 和 16 字节的 IV 均以明文形式硬编码在内核（ `flatkc` ）的静态内存中，通过 `lief` 和 `objdump` 就能轻松提取并解密。

但在面对飞塔后续更新的某新版固件（x86_64 架构）时，当我们再次尝试寻找经典的 ChaCha20 常量字符串 `"expand 32-byte k"` 时，却发现它消失了——飞塔官方在最新版本中彻底重构了固件的安全启动（Secure Boot）与完整性校验矩阵。

## 0x1 新版固件的算法演进

通过逆向其内核引导加载流程，我们发现新版固件主要有两处重大改动：

### 0x1.1 放弃硬编码，引入"非对称密钥包裹矩阵"

新版固件不再直接在内存中暴露明文对称密钥，而是引入了 RSA-2048 签名与密钥释放机制。在核心函数 `sub_FFFFFFFF81710483()` 中，固件将解密主文件系统所需的 32 字节核心密钥通过私钥加密，作为一整段 256 字节的 RSA 签名块，强行拼接在加密的 `rootfs.gz` 文件最末尾。

### 0x1.2 放弃 ChaCha20，引入"高度魔改的变体 RC4"

在最终的解密核心函数 `sub_FFFFFFFF81710334()` 中，飞塔彻底废弃了 ChaCha20 与标准 AES，转而采用了一种高度定制化、基于经典 RC4 算法演变而来的流密码。整体分为两个阶段：

-   KSA（密钥调度）阶段：标准 RC4 初始化 256 字节 S 盒。但在打乱 S 盒时，利用我们释放出的 32 字节核心 Key 进行 `i % 32` （即 `n256_1 & 0x1F` ）的循环置换。
-   PRGA（密钥流生成）阶段：这是混淆力度最高的地方。不同于普通 RC4 在交换 `S[i]` 和 `S[j]` 后直接查表输出，飞塔在此处引入了复杂的位移干扰与双重 S 盒交叉索引：

-   计算两个非线性的动态索引： `idx1 = (j >> 3) ^ (i << 5)` ， `idx2 = (i >> 3) ^ (j << 5)` 。
-   将两个索引对应在 S 盒中的值相加，并对索引执行 `^ 0xAA` 异或混淆。
-   最终将三个不同的 S 盒查表分量异或组合，生成终极的密钥流字节。

## 0x2 获取证书和种子

> 网络安全设备在引导阶段遵循一个铁律：签名只要校验失败，设备必须立刻锁死。

我们首先在 IDA 的核心内核镜像中搜索系统停机函数（如 `machine_halt()` 或 `panic()` ）。通过对 `machine_halt()` 进行交叉引用回溯，可以非常轻松地锁定负责固件安全验证的关键核心函数 —— `sub_FFFFFFFF81710483()` 。

顺着校验函数往下看，虽然满眼都是未命名变量，但其密码学特征非常明显：一个长达 270 次的 `for` 循环，内部带有 `& 0x1F` （即循环模 32）的异或操作。而在该循环正下方，紧跟了一个典型的外部密码学调用：

```
rsa_parse_pub_key(v36, n6291648_1, 270);
```

这个显眼的函数名瞬间暴露了意图：上面的 XOR 循环，实际上是在还原即将被解析的 RSA 公钥。在 IDA 中双击循环里的两个源数据指针：

-   解密种子：指向 `.init.data` 段的 `byte_FFFFFFFF8179A2C0` 。我们在 IDA 中选中这连续的 32 字节，右键导出为 Hex 数组。
-   混淆证书：指向紧邻的 `byte_FFFFFFFF8179A1A0` 。同样操作，连续向下截取 270 字节的硬编码密文。

## 0x3 逆向过程中的问题与调试

在还原这段加密矩阵的过程中，我们遇到了两个经典的密码学对抗与排错点：

### 0x3.1 问题一：误把"混淆种子"当成最终密钥

内核数据段中有一个硬编码的 32 字节数组 `byte_FFFFFFFF8179A2C0` （如 `5C 19 C6 E1 ...`）。许多人会误以为这就是解密大包的 Key，但通过逆向发现，它其实只是一个静态异或混淆种子。

内核在启动时，用它对另一段 270 字节的硬编码密文进行循环 XOR 异或，其真实目的仅仅是为了在内存中还原出那把 RSA-2048 公钥。

### 0x3.2 问题二：数学对齐中的偏移隐患

当我们成功截获了文件末尾的 256 字节 RSA 密文，并用还原出的公钥执行标准模幂运算 `m = c^e mod n` 后，解密出了一段 96 字节的有效载荷。

在最初编写脚本时，由于 Python 的 `pow(c, e, n)` 在大端序转换时会在高位自动补 `0x00` ，而 C 语言内核指针在读取缓冲区（ `v11 + 223` ）时具有独特的架构对齐方式，导致切片出来的 Key 整体向左错位了 1 个字节，解密出来的文件始终是一堆无序的二进制乱码。

通过重新推演 PKCS#1 v1.5 的填充边界，我们将切片精确校准到缓冲区的最后 32 字节，终于锁定了真正的核心 RC4 Key：

```
1EA548D27DF49AABE469A07B1C222506AAC5032544DE5605992F9C8ECAFE2D40
```

## 0x4 自动化解密脚本

当密钥边界完全对齐、飞塔变体 RC4 的索引优先级被用 Python 完美重构后，计算出的固件主体实际 SHA256 哈希，与从 RSA 签名块中动态释放出的预期哈希实现了 100% 的完美匹配。

完整的自动化解密与还原脚本如下：

```python
import hashlibfrom Crypto.PublicKey import RSA

CERT_FILE = "forti_pubkey.der"ROOTFS_ENCRYPTED_FILE = "rootfs.gz"  # 你的原始加密固件文件ROOTFS_DECRYPTED_FILE = "rootfs_decrypted.gz"rootfs_tail_hex = (    "31C6C1E3E33F19F477E38CB15845DFC919C60D0CE33975E34A63815BB8BCB47C"
    "4FDCA8AC8F30C64053C00A045FA876F2B3C2D0AA2D82B64842E2C6B43C7A4A6C"
    "169577A860171DE17019EE1CE7C89E6F44833B959104E4E0B61525C214EA68AE"
    "D4557BC902597E15B8C5A38C18217FB0E9F77EE1F3E50CEE4D57166DC6FA358B"
    "5E6FAF48B11D26399209D792018729E1AF9040C14026250EF18DA11EBE14A8F9"
    "B9D2F002B2772DA82796E755DCFD238DD563611C323175ED4E238B23EB76D6FA"
    "EE0A6FB93EA9CC5149A62AB2685B44ECFB43BE3185D3976B0CE58E6BC9A2B01F"
    "0D8D2BCA4CD928C9F874E4F6D5A81460257C31C6CE2CC09B49F772878E08BEA0")def fortnite_custom_rc4_decrypt(ciphertext: bytes, key: bytes) -> bytes:    # KSA 阶段：初始化并打乱 S 盒
    S = list(range(256))
    j = 0
    for i in range(256):
        j = (j + S[i] + key[i & 0x1F]) & 0xFF
        S[i], S[j] = S[j], S[i]    # PRGA 阶段：生成魔改密钥流并原位解密
    plaintext = bytearray(len(ciphertext))
    i = 0
    j = 0

    for idx, ciphertext_byte in enumerate(ciphertext):
        i = (i + 1) & 0xFF
        old_si = S[i]
        j = (j + old_si) & 0xFF
        old_sj = S[j]

        S[i], S[j] = old_sj, old_si

        comp_x = S[(j + old_sj) & 0xFF]

        idx1 = ((j >> 3) ^ (i << 5)) & 0xFF
        idx2 = ((i >> 3) ^ (j << 5)) & 0xFF

        sum_idx = (S[idx1] + S[idx2]) & 0xFF
        comp_y = S[(sum_idx ^ 0xAA) & 0xFF]

        comp_z = S[(old_sj + old_si) & 0xFF]
        keystream_byte = comp_x ^ ((comp_y + comp_z) & 0xFF)

        plaintext[idx] = ciphertext_byte ^ keystream_byte    return bytes(plaintext)print("正在解析 RSA 公钥证书...")with open(CERT_FILE, "rb") as f:
    pub_key = RSA.import_key(f.read())
n = pub_key.n
e = pub_key.eprint(f"成功提取 N (前16位): {hex(n)[:18]}...")print("正在执行 RSA 模幂运算解密尾部数据...")
c_tail = int.from_bytes(bytes.fromhex(rootfs_tail_hex), byteorder='big')
m_tail_int = pow(c_tail, e, n)
m_tail_bytes = m_tail_int.to_bytes(256, byteorder='big')

expected_sha256 = m_tail_bytes[-96:-64]
real_rc4_key = m_tail_bytes[-32:]print(f"\n提取到预期 SHA256 : {expected_sha256.hex()}")print(f"提取到核心 RC4 Key: {real_rc4_key.hex()}")print("\n正在读取并校验固件主体...")with open(ROOTFS_ENCRYPTED_FILE, "rb") as f:
    full_data = f.read()

encrypted_body = full_data[:-256]
actual_sha256 = hashlib.sha256(encrypted_body).digest()print(f"主体的实际 SHA256 : {actual_sha256.hex()}")if actual_sha256 == expected_sha256:    print("SHA256 校验完美通过！边界对齐 100% 正确！")else:    print("警告：SHA256 校验不匹配。正在检查边界状态...")print("\n正在激活自定义变体 RC4 引擎解密全盘文件系统...")
decrypted_body = fortnite_custom_rc4_decrypt(encrypted_body, real_rc4_key)with open(ROOTFS_DECRYPTED_FILE, "wb") as f:
    f.write(decrypted_body)print(f"\n解密全部完成！文件已保存为: {ROOTFS_DECRYPTED_FILE}")
```

脚本全量运行后，执行 `file` 命令检查新生成的固件：

```
$ file rootfs_decrypted.gz
rootfs_decrypted.gz: gzip compressed data, last modified...
```

至此，新版固件的根文件系统成功完成解密。
