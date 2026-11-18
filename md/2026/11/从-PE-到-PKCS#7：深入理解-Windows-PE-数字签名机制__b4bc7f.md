---
title: 从 PE 到 PKCS#7：深入理解 Windows PE 数字签名机制
source: https://xiaodaozhi.com/security/482.html
source_host: xiaodaozhi.com
clip_date: 2026-11-18T10:34:31+08:00
trace_id: f25dc8d9-c93b-48f1-82d9-4650b16838ef
content_hash: 66006750c9c6efac0dfb5d91b586e4ca29b43fe6ca7ab6a33b27cbdc256c228e
status: synced
tags: []
series: null
feed_source: 小刀志·Windows/PE逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 41c75244-d011-810c-b6d3-dfbd99cfb203
ioc: null
---

AI 总结

本文以PESignAnalyzer项目演进为主线，系统梳理Windows PE数字签名的完整技术链，核心结论是数字签名验证并非单一布尔判断，而需分层解析格式、内容完整性、密码学签名、证书链、时间戳、吊销状态与平台策略七个独立层次。Windows Authenticode将签名存于PE文件末尾的Certificate Table（Security Directory的VirtualAddress实为文件偏移而非RVA），内为PKCS#7/CMS SignedData，其中SignerInfo通过Issuer与Serial Number关联X.509证书，项目借助CryptQueryObject与CryptMsgGetParam等CryptoAPI完成标准结构解析，仅对Authenticode摘要、Nested Signature、RFC 3161时间戳属性和Catalog成员做有限DER补充解析。关键论据包括：一、Authenticode哈希须排除CheckSum、Security Directory与Certificate Table，不能直接对整文件做SHA-256，重算摘要需与SpcIndirectDataContent记录值比对；二、项目坚持不调用WinVerifyTrust与任何CryptCATAdmin\* API，二进制仅导入kernel32、crypt32、advapi32，Catalog发现改为自行扫描CatRoot下.cat文件并用DER预筛选成员摘要，代价是冷扫描较慢；三、验证输出拆为contentDigest、cmsSignature、certificateChain、timestamp、revocation与overall六个独立字段，吊销检查支持none/cache/online三种模式，证据不足时返回indeterminate与退出码4，严格策略下不可视为valid。项目明确未复刻Windows Trust Provider全部平台策略，解析成功不等于内容未篡改、摘要匹配不等于CMS有效、链可信不等于吊销可知，各层结论必须分开处理。

大约十年前我写 PESignAnalyzer 时，最初的目标其实很直接：给定一个 Windows PE 文件，希望能够知道它由谁签署、使用了什么算法、对应什么证书、证书链是什么，以及签名有没有时间戳。

真正开始实现以后，事情很快变得复杂起来。

![深入理解 PE 数字签名机制](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e15a2396ae3a4b92.webp)

项目地址： [https://github.com/leeqwind/PESignAnalyzer](https://github.com/leeqwind/PESignAnalyzer)

最初版本的 PESignAnalyzer 主要解决“把签名信息读出来”这个问题。最近重新整理项目时，我又补上了 Authenticode 内容摘要、CMS 签名、时间戳、证书链、吊销状态和 Catalog 成员关系的验证，并且保留了一个明确约束： **不调用 `WinVerifyTrust` ，也不调用任何 `CryptCATAdmin*` API，最终二进制不导入 `Wintrust.dll` 。**

因此，现在再回头看这个项目，它已经不只是一个签名信息提取器，也可以作为一个实际案例，用来理解下面几个经常被混在一起的问题：

-   签名数据能不能正确解析；
    
-   文件内容有没有被修改；
    
-   CMS 密码学签名是否成立；
    
-   签名者证书链是否可信；
    
-   时间戳能否证明签名发生在证书有效期内；
    
-   吊销状态能否确定；
    
-   一个没有嵌入式签名的文件，是否由系统 Catalog 覆盖。
    

PE 文件的数字签名并不是简单地在文件末尾放一段 RSA 签名，再对整个 EXE 做一次 SHA-256。Windows Authenticode 把签名放进 PE 的 Certificate Table；Certificate Table 里面通常又是一份 PKCS#7/CMS SignedData；SignedData 中包含 SignerInfo、证书集合和各种 Attribute；SignerInfo 再通过 Issuer 和 Serial Number 与 X.509 证书关联起来。继续往下，还可能遇到 Counter Signature、RFC 3161 时间戳、Nested Signature，以及完全不同于 Embedded Signature 的 Catalog Signature。

因此，一个看起来很简单的问题：“这个 EXE 是谁签的？”实际上涉及多个层次：

![从 PE、Authenticode、CMS、SignerInfo 和 X.509 到 Windows Trust 的处理层次](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ba993b08883b12e.webp)

先解释几个贯穿全文的名词：

-   `Authenticode` 是 Windows 的代码签名机制，它定义 PE 摘要如何计算、签名数据如何封装、时间戳与 Catalog 如何参与验证。
    
-   `PKCS#7` 是一种加密消息封装格式；CMS（Cryptographic Message Syntax）是其后续标准化形式。两者在 Windows API 和日常讨论中经常一起出现。
    
-   `SignerInfo` 是 SignedData 中的签名者记录，包含签名者标识、摘要算法、签名值以及 signed/unsigned attributes。
    
-   `X.509` 是证书格式标准，用来表达公钥、Subject、Issuer、有效期和扩展字段等信息。
    
-   `Certificate Chain` 是从签名者证书，经中间 CA，最终追溯到根 CA 的认证路径。
    
-   `Timestamp` 用来证明某个签名在特定时间已经存在； `Nested Signature` 则表示一个签名结构里还封装了另一份签名。
    
-   `Windows Trust` 是 Windows Trust Provider 根据平台策略得出的结论。它不等同于“PKCS#7 数学签名验证成功”。
    

本文不会按 API 手册的顺序逐个介绍函数，而是沿着 PESignAnalyzer 当前的实现路径，从 PE 文件一直走到验证结果。

## 一、从一个 EXE 文件开始：数字签名到底在哪里

理解 Authenticode，第一步不是看证书，也不是看 RSA，而是先回到 PE 文件本身。

这里有一个容易踩坑的细节：普通 Data Directory 中的地址通常是 RVA，而 Security Directory 中的 `VirtualAddress` 实际上是 **文件偏移量**。

这意味着 Certificate Table 不属于正常装载到内存的 PE Section。它通常位于文件末尾，只在磁盘文件中保存签名数据：

```
DOS Header
NT Headers
.text
.rdata
.data
.rsrc
...
Certificate Table
```

这条路径对应 PE 文件自身携带的嵌入式签名：

![PE 文件经 Certificate Table 保存 Embedded Signature](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2d2e72324f27a0fc.webp)

Certificate Table 的基本容器是 `WIN_CERTIFICATE` ：

```cpp
typedef struct _WIN_CERTIFICATE {
    DWORD dwLength;
    WORD  wRevision;
    WORD  wCertificateType;
    BYTE  bCertificate[1];
} WIN_CERTIFICATE;
```

`bCertificate` 这个名字并不意味着里面直接放着一张 X.509 证书。对 Authenticode 来说，它通常承载一份 PKCS#7 SignedData：

![PE 文件中的 Attribute Certificate Table、WIN\_CERTIFICATE 与 PKCS#7 SignedData 层次](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6631720d22dbd82e.webp)

PE 格式在这里完成的任务只是告诉解析器：“文件的这个偏移处有一块证书表”。至于里面的 SignedData、SignerInfo、证书和属性如何解释，已经进入 CMS、ASN.1/DER 和 X.509 的世界。

## 二、从 CryptQueryObject 到 SignerInfo：让 CryptoAPI 解析标准结构

PESignAnalyzer 的一个基本设计原则，是尽可能把标准 PKCS#7 和 X.509 结构交给 Windows CryptoAPI，而不是自己重新实现通用 ASN.1 解码器。

`ASN.1` 用来描述数据结构， `DER` 是其确定性的二进制编码规则， `OID` 则用数字标识算法、属性和内容类型。PKCS#7/CMS、X.509 证书和 Authenticode 属性底层都大量依赖它们。

如果从零实现，很快就会把项目变成另一个 ASN.1、X.509 和 CMS 库。Windows 已经提供了这些能力，因此项目使用 `CryptQueryObject` 打开签名对象，并取得两个重要句柄：

-   `HCRYPTMSG` ：已经解码的 PKCS#7/CMS 消息；
    
-   `HCERTSTORE` ：消息携带的证书集合。
    

项目对 `CryptMsgGetParam` 做了一个“两次调用”封装：第一次获取所需大小，第二次分配内存并读取数据。

```cpp
BOOL MyCryptMsgGetParam(
    HCRYPTMSG hCryptMsg,
    DWORD dwParamType,
    DWORD dwIndex,
    PVOID *pParam,
    DWORD *dwOutSize
) {
    DWORD dwSize = 0;
    *pParam = NULL;
    if (!CryptMsgGetParam(hCryptMsg, dwParamType, dwIndex, NULL, &dwSize))
        return FALSE;

    *pParam = LocalAlloc(LPTR, dwSize);
    if (!*pParam)
        return FALSE;

    if (!CryptMsgGetParam(hCryptMsg, dwParamType, dwIndex,
        *pParam, &dwSize)) {
        LocalFree(*pParam);
        *pParam = NULL;
        return FALSE;
    }
    if (dwOutSize)
        *dwOutSize = dwSize;
    return TRUE;
}
```

通过 `CMSG_SIGNER_INFO_PARAM` ，文件中的 DER 字节会被还原为结构化的 `CMSG_SIGNER_INFO` ：

![SignerInfo 的主要字段及 SignerIdentifier 的证书定位信息](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5794236d967363a.webp)

这里最重要的内容包括：

-   Issuer 和 Serial Number：用于定位签名者证书；
    
-   HashAlgorithm：SignerInfo 使用的摘要算法；
    
-   EncryptedHash：签名值；
    
-   AuthAttrs：参与签名的属性；
    
-   UnauthAttrs：Counter Signature、RFC 3161、Nested Signature 等附加数据。
    

拿到 SignerInfo，才真正从“PE 文件解析”进入“签名消息解析”。

## 三、从 SignerInfo 到 X.509：证书关联不等于证书链验证

SignerInfo 并不是简单地内嵌一张签名者证书。它通常通过 Issuer 和 Serial Number 指向 SignedData 证书集合中的某张证书：

![SignerInfo 使用 Issuer 和 Serial Number 从证书存储定位 X.509 证书](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65c99fd47ab7f58f.webp)

PESignAnalyzer 使用 `CertFindCertificateInStore` 将两者关联起来，取得 `PCCERT_CONTEXT` 后，再读取 Subject、Issuer、Serial Number、Version、有效期、Thumbprint、签名算法和 CRL Distribution Points。

项目使用 `CERT_NODE_INFO` 表示一张证书：

```cpp
typedef struct _CERT_NODE_INFO {
    std::string SubjectName;
    std::string IssuerName;
    std::string Version;
    std::string Serial;
    std::string Thumbprint;
    std::string NotBefore;
    std::string NotAfter;
    std::string SignAlgorithm;
    std::wstring CRLpoint;
} CERT_NODE_INFO;
```

而 `SIGN_NODE_INFO` 表示一份签名及其相关证书：

```cpp
typedef struct _SIGN_NODE_INFO {
    std::string DigestAlgorithm;
    std::string Version;
    SIGN_COUNTER_SIGN CounterSign;
    std::list<CERT_NODE_INFO> CertChain;
} SIGN_NODE_INFO;
```

从证书的签发关系来看，一条典型的代码签名认证路径由叶子证书开始，经过一个或多个中间 CA，最终到达受信任的根 CA：

![代码签名证书、中间 CA 与根 CA 组成的证书链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/90c5d81920573b2d.webp)

图中的箭头表示验证时沿 Issuer 方向向信任锚追溯，并不表示把根证书包含在 SignerInfo 中。签名消息通常携带签名者证书和部分中间证书，而根证书是否可信，取决于本机的受信任根证书存储和证书链策略。

这里必须区分两件事：

1.  **为了展示信息而按 Issuer 关联证书**；
    
2.  **为了得出信任结论而构建并验证证书链**。
    

早期版本主要做第一件事。当前版本在 `--verify` 模式下还会调用 `CertGetCertificateChain` 构建证书链，再调用 `CertVerifyCertificateChainPolicy` 应用 `CERT_CHAIN_POLICY_AUTHENTICODE` 或时间戳策略。

因此，“输出里看到了根证书”并不自动意味着 `certificateChain: trusted` 。真正的链验证还需要检查签名、用途、有效期、根信任和策略；启用吊销检查时还要处理 CRL/OCSP 状态。

也不要把下面三个概念混为一谈：

-   SHA-256：摘要算法；
    
-   RSA：公钥算法；
    
-   sha256WithRSAEncryption：把 SHA-256 与 RSA 签名组合起来的算法标识。
    

它们都可能出现在同一份签名输出里，但描述的是不同层次。

## 四、Nested Signature、Counter Signature 与 RFC 3161

如果只需要解析一个 SignerInfo，项目并不会复杂到现在这个程度。真正麻烦的是 unsigned attributes 中还可能包含其他签名结构。

### 4.1 Nested Signature

Nested Signature 的本质，是一个签名结构中又包含另一份签名：

![外层 SignerInfo 通过 Unauthenticated Attributes 包含嵌套 PKCS#7 SignedData 及其 SignerInfo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/909b466c06d81d8f.webp)

项目会遍历 `UnauthAttrs` ，寻找 `szOID_NESTED_SIGNATURE` ，再把属性中的 DER 数据送回 CryptoAPI 解码：

![PESignAnalyzer 查找 Nested Signature 并交由 CryptoAPI 解析内层 PKCS#7 的流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/144bc7c9c79e72b8.webp)

旧版代码还处理了多个嵌套块和 8 字节对齐，避免把整个属性错误地当成单个 PKCS#7 对象。

### 4.2 旧式 Counter Signature

Counter Signature 不是另一份并列的软件签名，而是对主 SignerInfo 的签名值再次签名。项目查找 `szOID_RSA_counterSign` ，按 `PKCS7_SIGNER_INFO` 解码时间戳签名者。

![主 SignerInfo、Counter Signature 与时间戳 SignerInfo 的嵌套关系](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3cb0ebf89b0e778c.webp)

当前验证路径会使用 `CryptMsgVerifyCountersignatureEncodedEx` 验证 countersignature，而不只是把其中的 signingTime 显示出来。

### 4.3 RFC 3161

RFC 3161 时间戳不等同于旧式 countersignature。它包含 Time-Stamp Token 和 message imprint，用来证明某段数据在指定时间已经存在。

项目仍保留轻量 DER 遍历器，用于读取部分 Authenticode 特有结构；与此同时，真正的 RFC 3161 密码学验证交给 `CryptVerifyTimeStampSignature` 。验证成功后，还要单独构建时间戳签名者证书链。

这一步很关键。只从属性中读出一个时间字符串，不能证明时间戳有效。至少还要确认：

-   时间戳 message imprint 与主签名值匹配；
    
-   时间戳 CMS 签名有效；
    
-   TSA 证书具有时间戳用途；
    
-   TSA 证书链可信；
    
-   主签名者证书在该时间点有效。
    

轻量 DER 解析器只实现当前需要的 TLV 遍历，并对长度和偏移进行边界检查。它不是一个通用 ASN.1 库，也不应该被当作通用 ASN.1 库使用。

## 五、Authenticode Hash：为什么不能直接 SHA-256 整个文件

签名写入文件后，文件本身已经发生变化。如果签名数据也参与摘要计算，就会产生循环依赖：

![直接对整个文件计算摘要会导致签名写入后摘要变化并立即失效](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3f7b3ca54d79b1e3.webp)

所以 Authenticode 定义了专门的 PE 镜像摘要算法。计算时需要排除：

-   Security Directory 自身的目录项；
    
-   Certificate Table 中的签名数据。
    

其他应覆盖的文件内容则按 Authenticode 规则进入摘要。

-   `CryptAcquireContext`
    
-   `CryptCreateHash`
    
-   `CryptHashData`
    
-   `CryptGetHashParam`
    

嵌入式签名验证时，项目从 `SpcIndirectDataContent` 中提取签名时记录的摘要，与重新计算出的 PE 摘要比较：

![比较 SpcIndirectDataContent 中记录的摘要与当前 PE 重新计算的 Authenticode 摘要](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a6ddbc4b7eb7816.webp)

相等才能得到：

```
verification.contentDigest: valid
```

这解决的是“文件内容是否仍与签名时一致”。它与 CMS 签名值验证、证书链验证是三个不同检查。

还要继续区分：

-   普通文件 Hash；
    
-   Authenticode PE Hash；
    
-   Certificate Thumbprint；
    
-   CMS Signature Value。
    

它们都可能显示成十六进制字符串，但描述的对象完全不同。

## 六、Catalog Signature：不使用 CryptCATAdmin 如何自动查找

一个 PE 没有 Embedded Signature，不代表它一定没有可信签名。Windows 系统文件和驱动经常由外部 Catalog 覆盖：

![PE 文件通过 Authenticode 摘要关联 Catalog 成员及其 CMS 签名](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ff1703d1d295382.webp)

旧版 PESignAnalyzer 使用过：

-   `CryptCATAdminAcquireContext`
    
-   `CryptCATAdminCalcHashFromFileHandle`
    
-   `CryptCATAdminEnumCatalogFromHash`
    

这些 API 属于 WinTrust。当前版本为了满足“不使用任何 WinTrust API”的约束，已经移除它们，改成自行完成 Catalog 发现：

1.  为目标 PE 计算 SHA-256、SHA-1、SHA-384、SHA-512 候选 Authenticode 摘要；
    
2.  扫描 `%SystemRoot%\System32\CatRoot` 中已安装的 `.cat` 文件；
    
3.  用轻量 DER 结构筛选 Catalog 成员中的 SubjectIdentifier；
    
4.  对候选 Catalog 使用 `CryptQueryObject` 取得 CMS 内容；
    
5.  再次确认目标摘要确实是一个 Catalog 成员；
    
6.  启用 `--verify` 时，继续验证 Catalog CMS 签名、时间戳和证书链。
    

为了避免对数千个 Catalog 都做完整 CMS 解码，扫描阶段先做快速的 DER 成员摘要预筛选，只有命中的少量候选才进入 CryptoAPI 验证路径。

这样，下面的命令不再需要手工提供 Catalog 路径：

```powershell
.\PESignAnalyzer_VS2015_x64.exe --verify "C:\Windows\System32\notepad.exe"
```

典型结果类似：

```yaml
signtype: cataloged
catafile: C:\Windows\System32\CatRoot\{...}\....cat
verification.contentDigest: valid
verification.cmsSignature: valid
verification.certificateChain: trusted
verification.timestamp: valid
verification.revocation: not_checked
verification.overall: valid
```

这套实现的代价也很明确：因为没有使用 WinTrust 维护的 Catalog 索引，冷扫描或没有匹配项时会比系统索引查询更慢。 `--catalog` 可以显式指定 Catalog， `--embedded-only` 则可以禁止自动扫描。

## 七、从“读取信息”到“分层验证”

当前版本新增了标准化命令行参数：

```sql
Usage: PESignAnalyzer.exe [options] <file>

Options:
  -c, --catalog <file>  Use a specific catalog as fallback.
      --embedded-only   Require an embedded signature.
      --verify          Verify the Authenticode signature.
      --revocation <mode>
                        Revocation mode: none, cache, or online.
  -h, --help, /?        Show this help and exit.
  -V, --version         Show version information and exit.
      --                Stop processing options.
```

不加 `--verify` 时，程序保持原来的“分析并输出元数据”行为。加上 `--verify` 后，会输出几个相互独立的结果：

| 字段  | 含义  |
| --- | --- |
| `contentDigest` | PE 内容摘要是否匹配嵌入式签名或 Catalog 成员 |
| `cmsSignature` | CMS/PKCS#7 密码学签名是否有效 |
| `certificateChain` | 签名者证书链是否满足 Authenticode 策略 |
| `timestamp` | RFC 3161 或旧式时间戳是否有效 |
| `revocation` | `not_checked` 、 `good` 、 `revoked` 或 `unknown` |
| `overall` | `valid` 、 `invalid` 或 `indeterminate` |

吊销检查提供三种模式：

-   `none` ：不检查吊销，输出 `not_checked` ；
    
-   `cache` ：只使用本机缓存，不进行网络访问；
    
-   `online` ：允许获取 CRL/OCSP 信息。
    

`--revocation` 会隐含启用 `--verify` 。

当内容摘要、CMS、时间戳和证书链都有效，但吊销信息因为网络、缓存或 CA 服务不可用而无法确定时，结果会是：

```
verification.revocation: unknown
verification.overall: indeterminate
```

这不是“签名无效”，也不是“签名有效”。它表示当前证据不足以确认吊销状态。在严格安全策略中， `indeterminate` 不能被当成 `valid` 。

程序用退出码把这些状态区分开：

| 退出码 | 含义  |
| --- | --- |
| `0` | 分析或验证成功 |
| `1` | 未找到可读取的签名 |
| `2` | 命令行参数错误 |
| `3` | 签名验证失败 |
| `4` | 验证结果无法确定 |

## 八、不使用 WinTrust，是否就等于重新实现 Windows Trust？

答案是否定的。当前发布二进制的导入表只有：kernel32.dll、crypt32.dll、advapi32.dll。项目不导入 wintrust.dll，也不调用 `WinVerifyTrust` 或 `CryptCATAdmin*` 。但这不意味着它已经逐位复刻 Windows Explorer 或 WinVerifyTrust 的全部平台策略。

更准确的分层是：

1.  **格式解析**：PE、ASN.1、CMS 和 X.509 能否正确解析；
    
2.  **内容完整性**：Authenticode 摘要是否匹配；
    
3.  **密码学验证**：CMS 签名和时间戳签名是否成立；
    
4.  **证书链验证**：能否建立到受信任根，并满足代码签名或时间戳用途；
    
5.  **吊销判断**：证书是否被撤销，或者状态是否未知；
    
6.  **平台策略**：Windows Trust Provider 是否基于额外规则接受该对象。
    

PESignAnalyzer 当前覆盖前五层中的主要路径，并把结果拆开输出；它没有声称完全复制第六层的所有 Windows 平台策略。

这也是为什么 `PKCS7_verify()` 不能被简单理解为 `WinVerifyTrust()` 的跨平台版本。OpenSSL 很适合处理 ASN.1、X.509、CMS 和密码学验证，但 Windows 的证书存储、根信任、Catalog 数据库和平台策略仍需单独设计。

如果将来要做跨平台版本，可以把系统拆成：

![跨平台 Authenticode 验证架构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/284323de9c3bf1ab.webp)

OpenSSL 可以承担其中相当一部分格式和密码学能力，但 Trust Evaluator 仍需要明确的策略输入和分层结果。

## 九、回头看 PESignAnalyzer：几个值得保留的工程边界

重新整理项目后，我认为下面几个边界比“用了哪个 API”更重要。

### 9.1 标准格式交给成熟库，平台特有结构做有限补充

PKCS#7、CMS 和 X.509 主要交给 CryptoAPI；项目只对 Authenticode 摘要、Nested Signature、时间戳属性和 Catalog 成员做必要的补充解析。

### 9.2 所有来自文件的长度和偏移都必须验证

PE 偏移、DER Length、Section 数据和 Certificate Table 都由输入文件控制。任何 `offset + length` 在使用前都要检查溢出和缓冲区边界。解析器处理的不是“正常文件”，而是潜在的恶意输入。

### 9.3 解析结果和验证结果必须分开

程序能够显示 Subject、Issuer 和 Timestamp，不代表这些数据已经通过密码学验证。当前命令行明确要求使用 `--verify` 才进入验证路径，并输出各层状态。

### 9.4 未知状态不能被压缩成成功或失败

吊销服务不可用时，最准确的结果是 `indeterminate` 。把 unknown 当成 good 会放宽安全策略；把 unknown 当成 revoked 又会误报。调用方应该根据自己的风险模型处理退出码 4。

### 9.5 “不使用 WinTrust”是一项实现约束，不是等价性声明

这个约束迫使项目把摘要计算、Catalog 查找和各层验证过程显式化，因此更适合学习和诊断；与此同时，也必须诚实描述与 Windows 完整平台信任判断之间的边界。

当前还有一些明确限制：

-   Catalog 自动发现只扫描本机已经安装的系统 Catalog；其他 Catalog 需要通过 `--catalog` 指定；
    
-   不使用 WinTrust 索引，因此未命中的完整扫描可能较慢；
    
-   元数据提取支持多签名和嵌套签名，但当前验证汇总针对消息中选定的主签名者；
    
-   在线吊销结果依赖网络、代理、CA 的 CRL/OCSP 服务以及本机策略；
    
-   在把工具用作安全强制边界前，仍应结合部署环境和样本集进行验证。
    

## 结语

最初写 PESignAnalyzer 时，我只是想从 PE 文件里把数字签名信息读出来。重新整理之后，这个小工具已经把一条更完整的技术链显式呈现出来：

![PESignAnalyzer 从 PE 解析到策略结果的完整处理链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/568e37ef9bc99387.webp)

最重要的仍然不是记住这些结构的名字，而是不要把不同层次的结论混在一起：

-   解析成功，不代表内容没有被篡改。
    
-   内容摘要匹配，不代表 CMS 签名有效。
    
-   CMS 签名有效，不代表证书链可信。
    
-   证书链可信，不代表吊销状态一定可知。
    

这些检查都通过，也不等于已经复刻 Windows Trust Provider 的所有平台策略。

理解这些边界后，再看 Explorer 中一句简单的“数字签名正常”，背后就不再是一个模糊的布尔值，而是一套可以从文件字节、签名结构、证书身份、时间证明一直追踪到信任策略的完整技术体系。

## 参考资料

1.  [Microsoft Learn - PE Format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)  
    PE/COFF 格式、Security Directory、Attribute Certificate Table、WIN_CERTIFICATE 以及 Authenticode PE 镜像摘要规则。
    
2.  [Microsoft Learn - CMSG_SIGNER_INFO](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/ns-wincrypt-cmsg_signer_info)  
    SignerInfo 中 Issuer、Serial Number、算法、签名值和 Attributes 的结构定义。
    
3.  [Microsoft Learn - CryptMsgGetParam](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptmsggetparam)  
    从已解码的 PKCS#7/CMS 消息中获取 SignerInfo 和内容参数。
    
4.  [Microsoft Learn - CryptMsgControl](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptmsgcontrol)  
    使用 `CMSG_CTRL_VERIFY_SIGNATURE_EX` 验证 CMS 签名者。
    
5.  [Microsoft Learn - CertGetCertificateChain](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-certgetcertificatechain)  
    构建证书链、指定验证时间以及配置吊销检查。
    
6.  [Microsoft Learn - CertVerifyCertificateChainPolicy](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-certverifycertificatechainpolicy)  
    对证书链应用 Authenticode 和时间戳策略。
    
7.  [Microsoft Learn - CryptVerifyTimeStampSignature](https://learn.microsoft.com/en-us/windows/win32/api/wincrypt/nf-wincrypt-cryptverifytimestampsignature)  
    验证 RFC 3161 Time-Stamp Token、message imprint 和时间戳签名者。
    
8.  [IETF RFC 5280 - X.509 Certificate and CRL Profile](https://www.rfc-editor.org/info/rfc5280/)
    
9.  [Microsoft Learn - WinVerifyTrust](https://learn.microsoft.com/en-us/windows/win32/api/wintrust/nf-wintrust-winverifytrust)  
    用于理解密码学验证、证书链策略与 Windows 平台信任判断之间的区别。
