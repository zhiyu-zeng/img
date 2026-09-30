---
title: Windows Hello for Business - The Face Swap | Insinuator.net - Bold Statements
source: https://insinuator.net/2025/07/windows-hello-for-business-the-face-swap/
source_host: insinuator.net
clip_date: 2026-09-30T10:23:32+08:00
trace_id: 2e79bda4-ddbc-42ac-97b3-ec5da8a9fe7c
content_hash: 3a696514e425a4bcd27bf3ac3a801efb876e55dcd2b20079786ebec7c1023f43
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: ERNW Insinuator
ai_summary: |-
  WHfB 生物认证缺少外部熵，管理员可交换模板库中的 SID，让本地管理员与域用户面容互相解锁；微软预计不修复。
  - **架构缺陷：** WHfB 用面容/指纹/PIN 解锁客户端密钥，再签名进行 Kerberos PKINIT 或 Entra ID 认证；生物识别与认证仅松散耦合，且密钥派生缺少外部熵。
  - **数据库结构：** 模板库分为加密头、未加密管理头和加密模板记录；加密头保存模板密钥及数据库剩余部分的 SHA-256 完整性哈希，并由 CryptProtectData 加密，SYSTEM 权限可解密和篡改。
  - **SID 交换 PoC：** 两名用户注册后，交换各自 WINBIO_IDENTITY 中的 SID 并重算 SHA-256 哈希写回加密头；本地管理员面容即可解锁域用户，反向亦然。也可直接替换存储的生物特征或解密模板。
  - **披露结果：** 已向微软披露；因类似问题未解决且 Enhanced Sign-in Security 可缓解，作者预计微软不会修复。
  - **TPM 与根治：** TPM 非易失存储空间有限且访问无需秘密，用 TPM 保护密钥加密模板也只解决空间、不解决缺熵；唯一方向是让生物特征作为熵，但需大改架构。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-816a-b516-ed4b7afac48a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WHfB 生物认证缺少外部熵，管理员可交换模板库中的 SID，让本地管理员与域用户面容互相解锁；微软预计不修复。
> - **架构缺陷：** WHfB 用面容/指纹/PIN 解锁客户端密钥，再签名进行 Kerberos PKINIT 或 Entra ID 认证；生物识别与认证仅松散耦合，且密钥派生缺少外部熵。
> - **数据库结构：** 模板库分为加密头、未加密管理头和加密模板记录；加密头保存模板密钥及数据库剩余部分的 SHA-256 完整性哈希，并由 CryptProtectData 加密，SYSTEM 权限可解密和篡改。
> - **SID 交换 PoC：** 两名用户注册后，交换各自 WINBIO_IDENTITY 中的 SID 并重算 SHA-256 哈希写回加密头；本地管理员面容即可解锁域用户，反向亦然。也可直接替换存储的生物特征或解密模板。
> - **披露结果：** 已向微软披露；因类似问题未解决且 Enhanced Sign-in Security 可缓解，作者预计微软不会修复。
> - **TPM 与根治：** TPM 非易失存储空间有限且访问无需秘密，用 TPM 保护密钥加密模板也只解决空间、不解决缺熵；唯一方向是让生物特征作为熵，但需大改架构。

In the [last blog post](https://insinuator.net/2025/06/windows-hello-for-business-past-and-present-attacks/), we discussed the full authentication flow using Windows Hello for Business (WHfB) with face recognition to authenticate against an Active Directory with Kerberos and showcased existing and new vulnerabilities. In this blog post, we dive into the architectural challenges WHfB faces and explore how we can exploit them.

The majority of the work was conducted in the context of the “Windows Dissected” project. This project, funded by the BSI (German: “Bundesamt für Sicherheit in der Informationstechnik” – the German Federal Office for Information Security), has the goal to perform ” various in-depth security analyses of security-critical components and functions in Windows.” Over the next years we will discuss these results here once they are published.

## WHfB 认证流程

WHfB is Microsoft’s flagship product for passwordless authentication in Domains. This is in contrast to traditional authentication methods, which use passwords. If a user authenticates with a password, this password (more precisely, its hash) is used directly as an entropy source during the authentication procedure. With WHfB, the biometrics feature (such as face or fingerprint, as well as PIN) is used to “unlock” a key stored in the client. This key is then used to produce a signature for the Kerberos PKINIT authentication. The same procedure is done if you are [authenticating with CloudAp.dll against Entra ID](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/how-it-works-authentication#microsoft-entra-join-authentication-to-microsoft-entra-id). In this case, the signature is used to obtain the [PRT](https://learn.microsoft.com/en-us/entra/identity/devices/concept-primary-refresh-token), and the client signs a Nonce provided by Entra ID.

This architecture has some challenges. First, there is only a loose coupling between biometric identification and authentication. Additionally, there is no external entropy available to derive a cryptographic key at any point. Let’s set aside the first issue and focus on the second: missing entropy for cryptographic keys. Cryptographic keys play a major role when ensuring confidentiality of data when used in an encryption scheme. Microsoft documents that the biometric templates of the enrolled users are [stored encrypted](https://learn.microsoft.com/en-us/windows/security/identity-protection/hello-for-business/how-it-works#biometric-data-storage):

> “Each database file has a unique, randomly generated key that is encrypted to the system.”

## 模板数据库结构

Therefore, from this, we know that each database will have its unique key. The part regarding “encrypted to the system” sounds a bit more cryptic (slight pun intended). From a database layout and reverse engineering perspective, it is pretty clear what is meant. The database consists of three parts: an encrypted header that holds a key for encrypting the templates and a SHA-256 hash of the remainder of the database. This hash is used to ensure the integrity of the database. Next, an unencrypted header with version and management information. And finally, on one or more records with encrypted templates.

The encrypted header is encrypted using [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata), which encrypts data without requiring an explicit key. In the case of user accounts, the key is derived from the user’s password. For the NT SYSTEM\\AUTHORITY account on which the Windows biometric service runs, all information required to derive the key is stored in the system itself. This means that an administrative attacker can decrypt this header and access all information stored inside, as well as manipulate it.

For this first [Proof of Concept](https://github.com/ernw/insinuator-snippets/tree/master/TROOPERS25-WHfB) [1](#fn:1), we also decided to use system tools and APIs as much as possible. Like the storage adapter, we used [CryptUnprotectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata) directly and have not decided to reimplement its logic. Using the CryptUnprotectData function typically leaves plenty of detection possibilities, but it makes our lives easier because we can use the tools we have at hand. With this we have access to the encrypted header and the hash that ensures the integrity of the database. So far, we have not discussed the body of the database. It consists of one or more (depending on how many users are enrolled) records. Each [WINBIO_STORAGE_RECORD](https://learn.microsoft.com/de-de/windows/win32/api/winbio_adapter/ns-winbio_adapter-winbio_storage_record) structure has a [WINBIO_IDENTITY](https://learn.microsoft.com/en-us/windows/win32/secbiomet/winbio-identity) structure. This ties the user’s SID to the encrypted template stored in the record.

## SID 交换 PoC

For our initial Proof of Concept, which we used in the disclosure with Microsoft, we wanted something that required little effort to showcase. The scenario is the following: Two users are enrolled with WHfB. At least one user is a domain user, and the other user is a local administrator. Both are enrolled with WHfB. The database will now hold two WINBIO_STORAGE_RECORD structures. Our Proof of Concept now exchanges the SIDs from each of the WINBIO_IDENTITY structures with one another. Now, the local administrative user’s face will unlock the domain user, and vice versa. After swapping the SIDs, we need to recompute the SHA-256 hash and store it in the encrypted header.

This showcases how administrative attackers break the security model of WHfB in a Domain context. Further attacks are, of course, also possible. For example, an attacker could replace stored biometrics with their own biometrics. So, there is no need to exchange SIDs. Additionally, the stored template can be decrypted.

## 微软披露与修复

We disclosed our discovery to Microsoft. We have already stated that there are several prerequisites. As similar issues have not been resolved in the past, and with Enhanced Sign-in Security, there is an option within WHfB to mitigate the problem, we have already suspected that Microsoft will not attempt to resolve this issue.

In discussions surrounding this topic, some people were asking if Microsoft could use the TPM to protect the templates. Theoretically, there are some possibilities, but they do not offer any significant security benefits. The templates could be stored in the non-volatile storage of the TPM. First, there is only limited memory available, and the size is highly dependent on the TPM manufacturer. Furthermore, the client needs to access this data without providing any secrets, so in this case, an attacker would also be able to access this data. Instead of storing the templates directly in the non-volatile memory of the TPM, a more feasible approach would be to encrypt the templates using a key protected by the TPM. While this solves the problem of memory space, it does not address the issue of missing entropy.

## 熵缺失根治方案

The only solution would be to use the user’s biometrics as entropy. Microsoft uses this approach if a PIN is used to authenticate with WHfB. The research field “biometric cryptosystems” works on methods for biometric-dependent key release.[2](#fn:2) However, this would result in a massive overhaul of the system’s architecture.

Cheers!  
Till & Baptiste

1.  [Proof of Concept (PoC) on GitHub](https://github.com/ernw/insinuator-snippets/tree/master/TROOPERS25-WHfB) [↩](#fnref:1 "return to article")
    
2.  If you are interested in this topic “ [A survey on biometric cryptosystems and cancelable biometrics](https://jis-eurasipjournals.springeropen.com/articles/10.1186/1687-417X-2011-3) ” from 2011 takes a look into these systems. [↩](#fnref:2 "return to article")
