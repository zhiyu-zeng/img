---
title: MbedTLS Security Audit - Quarkslab's blog
source: http://blog.quarkslab.com/mbedtls-security-audit.html
source_host: blog.quarkslab.com
clip_date: 2026-10-21T00:45:01+08:00
trace_id: d1cda369-cf84-4145-8508-de16c289d700
content_hash: cc2240c85769d6ce9fb57f55180b56a022a0d142d030b352f26f7a364c98c9cf
status: synced
tags:
  - 漏洞分析
  - 密码学
series: null
feed_source: Quarkslab
ai_summary: MbedTLS 4.0 架构重构（密码层拆分为 TF-PSA-Crypto）经 OSTIF 委托 Quarkslab 审计，仅发现 1 个高危和 1 个低危漏洞，整体质量获肯定。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ff75244-d011-817a-ac78-d95ca1aa2a6c
ioc:
  cves: []
  cwes: []
  hashes:
    - 0fe989b6b514192783c469039edd325fd0989806
    - 29160dd877d29658279fd683b2ae57b320ddcf09
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> MbedTLS 4.0 架构重构（密码层拆分为 TF-PSA-Crypto）经 OSTIF 委托 Quarkslab 审计，仅发现 1 个高危和 1 个低危漏洞，整体质量获肯定。
> 
> - **架构变化：** 密码学层被抽出为独立库 TF-PSA-Crypto（实现 Arm PSA Crypto API v1.2），配置拆成 `mbedtls_config.h`（TLS/X.509）与 `psa/crypto_config.h`（密码原语），RNG 回调全部移除，任何操作前必须调用 `psa_crypto_init()`。
> - **审计目标：** 覆盖信任边界与 PSA API 集成正确性、密钥属性（用途/算法/生命周期）是否被正确设置与强制、SSL/DTLS 会话序列化与恢复及 X.509 解析和密钥库的内存安全、默认配置安全姿态、TLS 1.2/1.3 与 DTLS 规范符合性。
> - **漏洞统计：** 共 5 项发现——1 高危、1 低危、3 项信息级；审计对象为 Mbed TLS 提交 `0fe989b6` 与子模块 TF-PSA-Crypto 提交 `29160dd8`，所有相关发现均已修复。
> - **高危项：** `mbedtls_ssl_context_load()`（`library/ssl_tls.c:5002`）存在 CID 堆缓冲区溢出。
> - **低危与信息级：** `mbedtls_pk_verify()`（`tf-psa-crypto/extras/pk.c`）接受 BER 编码签名，可能导致签名可延展，该问题由引入 Project Wycheproof 测试向量发现；TLS 1.3 0-RTT 早期数据无抗重放保护但文档未充分提示；另有 CMAC 密码支持文档与实现不一致、`compat.sh` 的 DTLS 1.2 测试在 Docker 镜像中因 IPv6 localhost 解析失败。

At the request of the [Open Source Technology Improvement Fund](https://ostif.org/) (OSTIF), Quarkslab performed a security audit of [mbedTLS](https://www.trustedfirmware.org/projects/mbed-tls/), evaluating the security of the changes in version 4.0.

* * *

## Introduction

[Mbed TLS](https://www.trustedfirmware.org/projects/mbed-tls/) is a widely deployed open-source TLS, DTLS, and X.509 library maintained by Trusted Firmware, targeting constrained and embedded environments. It is used as the cryptographic backbone of products across the IoT, automotive, and industrial sectors, and forms the TLS layer for projects such as the Trusted Firmware family.

Version 4.0 represents the most significant architectural change in the project's history. The cryptographic layer has been extracted into a standalone library, TF-PSA-Crypto, which implements the [PSA Cryptography API v1.2](https://arm-software.github.io/psa-api/crypto/1.2/) as specified by Arm. The Mbed TLS repository now consumes TF-PSA-Crypto as a submodule, and the configuration space has been split across two header files: `mbedtls_config.h` for the TLS and X.509 options, and `psa/crypto_config.h` for the cryptographic primitives. All RNG callbacks have been removed in favor of a mandatory call to `psa_crypto_init()` before any operation.

The Open Source Technology Improvement Fund (OSTIF) commissioned Quarkslab to perform a security audit of this new architecture.

## Scope

The primary objectives of this audit are:

-   *Architectural transition review.* Assess the security implications of the Mbed TLS 3.x to 4.0 split, focusing on the trust boundary between the TLS layer and TF-PSA-Crypto, the correctness of the PSA API integration, and whether the removal of the legacy crypto paths introduces new attack surface.
    
-   *PSA API usage correctness.* Verify that key attributes (usage flags, permitted algorithms, lifetimes) are correctly set and enforced throughout the TLS and X.509 code paths, and that the mandatory `psa_crypto_init()` dependency is properly documented and enforced.
    
-   *Memory safety.* Identify memory corruption vulnerabilities in the SSL/DTLS context management (in particular, session serialization and resumption), the X.509 parsing subsystem, and the PSA key store.
    
-   *Default configuration posture.* Review the security of the default build configuration, including enabled cipher suites, protocol versions, key exchange algorithms, and compile-time options that may expose users to risk without explicit opt-in.
    
-   *Protocol compliance.* Identify deviations from the TLS 1.2 (RFC 5246), TLS 1.3 (RFC 8446), and DTLS specifications that have security consequences.
    

The engagement covers:

-   *Mbed TLS* at commit `0fe989b6b514192783c469039edd325fd0989806`.
-   *TF-PSA-Crypto* (integrated submodule) at commit `29160dd877d29658279fd683b2ae57b320ddcf09`.

The complete technical report, including our findings and recommendations, is available in Quarkslab's [public reports repository](https://github.com/quarkslab/public-reports).

## Findings

The table below summarizes the findings of the audit. A total of 5 vulnerabilities were identified: 1 of high severity, 1 of low severity, and 3 informational ones.

| ID  | Title | Severity | Perimeter |
| --- | --- | --- | --- |
| HIGH-1 | CID Buffer Overflow in \`mbedtls\_ssl\_context\_load()\` | High | \`library/ssl\_tls.c:5002\` |
| LOW-4 | \`mbedtls\_pk\_verify()\` accepts BER-encoded signatures | Low | \`tf-psa-crypto/extras/pk.c\` |
| INFO-2 | No Anti-Replay Protection for TLS 1.3 0-RTT Early Data | Info | \`include/mbedtls/ssl.h:5166\` |
| INFO-3 | Mismatch in CMAC cipher support between the documentation and the implementation. | Info | TF-PSA-Crypto documentation |
| INFO-5 | \`compat.sh\` DTLS 1.2 tests fail on the \`mbedtls-test\` Docker image due to IPv6 \`localhost\` resolution | Info | mbedtls-test Docker images, \`compat.sh\` |

> **Note:** All relevant findings have since been resolved.

## Conclusion

The audit identified a few vulnerabilities with only two non-informational ones, and the auditors were overall very satisfied with the quality of the product in general, and this version's changes in particular.

The *high* and *low* vulnerabilities are related to a heap buffer overflow and potential signature malleability, respectively, with the second one being identified thanks to the integration of integration of Project Wycheproof test vectors into the test suite.

An informational finding documents the absence of any anti-replay protection for TLS 1.3 0-RTT early data, a known limitation that is currently not surfaced in the public-facing documentation in a way that prevents inadvertent misuse. Auditors have proposed improvements to the existing fuzzing harnesses and corpora, along with an integration of the #anv test suite into the CI/CD pipeline.

We would like to thank the Mbed TLS maintainers for their responsiveness and collaboration throughout the audit process, as well as the OSTIF team for their continuous support.
