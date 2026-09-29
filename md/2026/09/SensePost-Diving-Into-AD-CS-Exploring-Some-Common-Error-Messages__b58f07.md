---
title: "SensePost | Diving Into AD CS: Exploring Some Common Error Messages"
source: https://sensepost.com/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/
source_host: sensepost.com
clip_date: 2026-09-29T10:14:47+08:00
trace_id: 9a43b26e-0419-498e-9b46-73f0cae143ef
content_hash: f040ab811691b546d826408eb909f5da53fc3bfebb5b5ead494600a52b8357c6
status: synced
tags:
  - 漏洞分析
  - 协议分析
series: null
feed_source: SensePost·红队研究
ai_summary: AD CS 证书滥用非常依赖 Kerberos PKINIT 流程，作者在实验环境复现了三个常见报错的真实成因：EKU 用途不符、CA 不被信任、DC 缺少有效证书。
ai_summary_style: key-points
images_status:
  total: 30
  succeeded: 30
  failed_urls: []
notion_page_id: 3ea75244-d011-816c-a68f-c2a49ca922d7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AD CS 证书滥用非常依赖 Kerberos PKINIT 流程，作者在实验环境复现了三个常见报错的真实成因：EKU 用途不符、CA 不被信任、DC 缺少有效证书。
> 
> - **两阶段模型：** 签发阶段走 `\pipe\cert` RPC 与模板权限/策略模块校验，报错通常很明确；认证阶段走 PKINIT，KDC 会额外校验证书用途与被信任状态，多数"看不懂"的报错都出在这里。
> - **KDC_ERR_INCONSISTENT_KEY_PURPOSE：** 用仅含 server authentication EKU 的证书做客户端登录会被拒；KDC 只看证书自身 EKU，不回溯模板——所以模板改成 server-only 后，旧证书仍可用于登录，只有新签发的证书才会失败。结论：ESC1 证书必须带 client authentication EKU。
> - **KDC_ERROR_CLIENT_NOT_TRUSTED：** 证书未链接到 KDC 信任的 CA。DC 的信任 CA 来自注册表 `HKLM\SOFTWARE\Microsoft\EnterpriseCertificates\NTAuth\Certificates`，同步失败或多林多 CA 架构下各 DC 信任集不一致时最常见；certipy 的 ca 命令只能看 AD 侧信息，单台 DC 需登录查注册表。
> - **KDC_ERR_PADATA_TYPE_NOSUPP：** 报错有误导性，并非 AS-REQ 的 PADATA 本身出错，而是 DC 未安装（或证书已过期）Domain Controller / DC Authentication 证书；CA 侧仍会正常签发新证书，但无法用于 PKINIT。
> - **绕过思路：** PKINIT 走不通时可改用 Schannel/LDAPS 认证（Pass-the-Cert，passthecert.py），只需 DC 装有过期亦可的 DC 证书，即可在无有效 CA/DC 证书的情况下以域管身份操作，但仅限 LDAPS 交互。

Abuse of Active Directory Certificate Services (AD CS) has become a staple of our internal network assessment methodology. In fact, I can’t recall an internal I’ve done in the past two or more years that didn’t feature ADCS abuse in some manner or another.

We can all agree that when AD CS abuse works as intended, it is fantastic. As Tinus Green stated in his [BSides talk](https://youtu.be/xnXbla5col8?t=2476), AD CS abuse is the teleport scroll to the top of the mountain. It allows us to rapidly gain high-privileged access to the domain and, from there, can target more lucrative objectives.

Unfortunately, the inverse is also true. One often encounters errors while attempting to abuse AD CS. Certificate templates might be slightly misaligned with the true misconfigurations, or user privileges might be disallowing minor steps. Not to mention that the client’s Active Directory environment could have sophisticated security solutions present, blocking the abuse—looking at you, [Semperis](https://www.semperis.com/).

Tooling such as [Certify](https://github.com/GhostPack/Certify) and [certipy](https://github.com/ly4k/Certipy) have evolved to provide more descriptive error messages lately. Yet, they still leave a lot to be desired. Often, when you encounter an error with these tools, it’s somewhat ambiguous and unclear what caused it. Is it one of the many flags I mistyped, the domain credentials I got the syntax wrong, or am I not correctly connecting to the CA server? Add in the complexity of remote testing via a VPN and SOCKS proxy, and you are in a world of hurt trying to diagnose what is going wrong.

During two recent internal assessments, I encountered several error messages (see below) that outright baffled me. The certificate templates checked out, my domain privileges were as expected, and tool invocation was aligned with how I’ve used them before—or, simply, I copied/pasted a known-good command. So… why were I getting these, and what do they mean?

```rust
Got error while trying to request TGT: Kerberos SessionError: KDC_ERR_INCONSISTENT_KEY_PURPOSE(Certificate cannot be used for PKINIT client authentication)

Got error while trying to request TGT: Kerberos SessionError: KDC_ERROR_CLIENT_NOT_TRUSTED(Reserved for PKINIT)

Got error while trying to request TGT: Kerberos SessionError: KDC_ERR_PADATA_TYPE_NOSUPP(KDC has no support for padata type)
```

While it would have been easy to dismiss the error messages and move on to the next tool or concept, I decided to investigate this further. I wanted to replicate the exact error messages in my test Active Directory lab, which would give me insight into what was causing them and what they represented.

In this blog post, I’ll share the insights I gleaned from my test AD lab. It will start with a basic overview of the AD CS certificate request sequence and then pivot to the PKINIT authentication process. With the foundation established, it will showcase individual scenarios for how the error messages mentioned above could occur.

*Note: A large portion of the research and blog post content showcased here is inspired by Will Schroeder and Lee Christensen’s original AD CS [whitepaper](https://posts.specterops.io/certified-pre-owned-d95910965cd2) and more recent [blog post](https://posts.specterops.io/certificates-and-pwnage-and-patches-oh-my-8ae0f4304c1d). The PKINIT explanation is largely attributed to [@\_ethicalchaos\_](https://twitter.com/_ethicalchaos_) [attacking smart card based Active Directory networks](https://ethicalchaos.dev/2020/10/04/attacking-smart-card-based-active-directory-networks/) blog post.*

## A Foundational Understanding of AD CS: A Quick 101 Introduction

AD CS is a server role that functions as Microsoft’s public key infrastructure (PKI) implementation. As expected, it integrates tightly with Active Directory. It enables issuing certificates, which are X.509-formatted digitally signed electronic documents that can be used for authentication (the central area of focus for us in this blog post).

It can be misleading, but the last sentence above hints towards two separate processes that contribute to how AD CS actually works:

1.  There is a process for generating the certificate, which is typically where certificate templates and requests come in.
2.  There is a separate authentication process that occurs with an issued certificate—this is where PKINIT authentication occurs.

### Certificate Issuance

In Will Schroeder and Lee Christensen’s original AD CS whitepaper, they share the below diagram that showcases how the process of generating a certificate is accomplished:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a04343255ad38c1a.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/d2b5ca33bd970f64a6301fa75ae2eb22.png)

When a domain user or computer wants a new AD CS certificate generated. It first creates a public-private key pair, and the public key is placed in a certificate signing request (CSR) message along with other details, such as the subject of the certificate and the certificate template name. They then send the CSR to the CA server. The CA server then checks if they are allowed to request the certificate. If so, it determines if it will issue a certificate by looking up the certificate template AD object. If permitted, the CA generates and signs the certificate using its private key and returns it to the user/computer.

From the description above, the CA performs two initial checks based on the CSR that is being received:

1.  It checks if the user or computer can request certificates—this is typically done as an SMB authentication request to the ‘\\pipe\\cert’ RPC endpoint.
2.  It checks whether the user or computer is allowed to receive the certificate based on the certificate template’s properties—this is typically referred to as the policy module check.

Error messages pertaining to the first step above are typically relatively easy to spot. Here is an example where a CSR has been requested, but the wrong user credentials were supplied:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f1864a49c8f92d3f.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/534ea2218df55232f652fb48370e1539.png)

Notice in the error output how the \\pipe\\cert RCP endpoint is listed along with a failed SMB connection error.

Error messages regarding the second step are also quite verbose in the latest version of certipy. The tooling was updated recently to indicate that the template disallowed the certificate to be requested:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/280edbf6e477f666.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/c8217bc0451c4636b96311f1c8a4d325.png)

In the case above, the ESC1 certificate template’s permissions were modified to disallow enrollment as follows:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cecf380d30bb4521.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/44dd830d88c55c5a53e7ce44206e37e1.png)

*Note: Older versions of Certipy or other tooling, such as Certi, still refer to the above issue as a policy module error. Regardless, it ultimately relates to the permissions set on the certificate template.*

While the errors above are related to the certificate’s issuing, it is essential to remember that this is only the first step in the AD CS process flow. When a certificate has been correctly issued, the next step would be authentication.

### PKI Authentication

Active Directory largely relies on Kerberos for its authentication purposes. When a user supplies valid credentials, a Ticket-Granting Ticket (TGT) is issued, and later, a Ticket-Granting Service Ticket (TGS) might be issued depending on the service the domain user or computer wants to reach.

Before 2006, certificate-based authentication was not integrated directly into the Kerberos authentication protocol used in Windows environments. Instead, other authentication mechanisms (i.e., SSL/TLS) were used alongside Kerberos to support certificate-based authentication. Users would insert their smart cards into card readers attached to their computers, and the operating system would use the certificates stored on the smart cards for authentication purposes.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8cb7c60ae3c2109c.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/3ef26ec0aa7fff1c8577c9cbc4e39e21.png)

*Note: AD CS-based certificates are synonymous with smartcard authentication in Windows environments. Thus, one often will see references to smart cards while working with AD CS.*

With the release of [RFC 4556](https://datatracker.ietf.org/doc/html/rfc4556) in 2006, certificate-based authentication became integrated directly into the Kerberos authentication protocol. RFC 4556 – more commonly known as PKINIT – allows clients to obtain Kerberos tickets using their X.509 certificates, thus enabling certificate-based authentication within the Windows authentication framework without relying on separate mechanisms like SSL/TLS or smart cards.

PKINIT relies on a pre-existing Kerberos concept known as pre-authentication. Users who request a TGT (called an AS-REQ request) do not supply their actual password in the request. Instead, a timestamp is introduced into the request, encrypted with their password. The KDC can confirm whether the legitimate password was supplied by establishing its own timestamp using the user’s NTLM hash. If the timestamp matches, the user supplied the correct password and an AS-REP response is returned.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3e0c120cb1fffc78.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/dfefbabd8f40bae58745b3e345b99ab4.png)

*Note: The encrypted timestamp is stored in a specific section of the AS-REQ; called the PA-DATA section. You might recall seeing a reference to this at the start of the blog post. We will be revisiting this during one of the AD CS error conditions later!*

AD CS—or then PKI—authentication leverages this same concept. Instead of encrypting the timestamp with the user’s password, it uses the private key belonging to the selected certificate. Since the KDC and the CA server have access to the certificate’s public key, it can verify the legitimacy of the certificate being employed.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7463080d124614ea.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/5c0f5ece05a1623bb0c6ce9714ab9d0b.png)

From here on, everything else remains the same. The user or computer will have a valid TGT that can be used to request TGS tickets. The certificate is no longer used for the lifetime of the TGT and will generally remain valid for 7 days before the private key for the certificate is needed again.

With a rudimentary understanding of PKINIT now in place. It is vital to understand that many of the error conditions encountered while abusing AD CS certificates ultimately relate to the above-mentioned sequence. The KDC forms a major part of the authentication sequence and performs several checks. These include:

1.  Checking whether the client is using a certificate issued for the purpose it is being used for. As certificates can have different uses, the KDC must ensure that the certificate can be used for authentication (typically referred to as either client- or server-based authentication).
2.  Checking whether the certificate’s subject and the certificate itself are trusted. This is typically done by verifying that the domain account exists against Active Directory and consulting the CA server to check if it has knowledge of the certificate being used. The CA server would also verify that the certificate was issued by one of its registered CAs.

Coincidentally, the error messages briefly shared at the start of the blog post relate to one or more of these checks that the KDC is performing. But before we jump ahead, let’s explore each error message to better understand what it represents and why it occurs.

## Exploring the PKINIT Error Messages

### Error #1: Inconsistent Key Purpose

As outlined in the preceding section, the KDC must check that the certificate presented by a user or computer is being used for its intended purpose.

When abusing AD CS, we typically want to obtain a valid TGT from the KDC. This implies that we are raising an authentication attempt. Depending on the nature of our target, this would warrant either client authentication to a domain user account or server authentication to a computer account.

In the following example, we are attempting to abuse an ESC1-based certificate template. We start by raising a CSR to the CA server using the certipy tool:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/edd1ce6e4d91982c.png)

In the above case, the supplied user credentials were correct and the user had enrollment rights to the certificate template. Not to mention, it held permission to supply the alternate subject name (SAN).

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a676d04497ca65b3.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/761f1ee6e94662c59d1a4a5db231b756.png)

It is important to note that the certificate template (ESC1) has been configured for client authentication only:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f56c530c27e58ab.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/a82a07bb63f82214e98f6df1560d4aec.png)

With the above in mind, we can verify that the certificate which was issued indeed only has the singular purpose listed:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/572667eeb223c8bc.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/64d9ce0465570fccc58d7ea2abd7e68c.png)

The question now turns to what happens when we attempt authentication against the Domain Controller with the issued certificate? In the below scenario, we are opting to use the certificate to authenticate against the Domain Administrator account (PLAK\\administrator). This would classify as a valid client authentication attempt for the issued certificate. As such, we can get a valid TGT for the domain account and get its associated NTLM hash.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/989d2399fbd2812b.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/999151233c2826e3b4f90fd651ff49e9.png)

Now, you might say, what happens when we authenticate as the DC computer account instead? Would that not classify as server authentication? The answer is no. Whether we use a user or computer account, it remains client authentication. As such, the sequence still runs successfully if the computer account is used:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/07438471edaa781e.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/59e553ae9f6e63337558cb058e08e4a3.png)

Hmmm… interesting. Let’s now consider a scenario where the certificate template has been modified to only allow server authentication:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/928bc5f4819868f0.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/de527d68cd38a71ae89f8c9eafacfd83.png)

Our original certificate was intended for client authentication; as such, we now should have a conflict when the KDC checks the purpose for which the certificate is being used… Hold on to your seat!

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a963052f4223a0a0.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/c196ced3e16c2c2198de29f1665516dd.png)

Wait a minute! The certificate was accepted, and we still received the NTLM hash. Hmmm, should somebody call Microsoft for a CVE?Maybe not.

Our certificate was still accepted due to the properties it holds. At present, the certificate still shows the purpose of client authentication:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/572667eeb223c8bc.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/64d9ce0465570fccc58d7ea2abd7e68c.png)

The KDC only checked that the Extended Key Usage (EKU) matched the certificate’s purpose. It did not check the certificate template and its application policies. In fact, the certificate does not indicate which template it originates from.

*Note: I replicated the sequence even without the computer account present in the certificate. I also tried restarting the AD CS service and the DC controller as a whole. I was still able to get the hashes, as shown above.*

The only way the KDC might be able to restrict this usage is if it contacted the CA server to check which template the certificate was issued from and what purpose the template allows:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b90d23f2878f80a8.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/b85c9959713903ba85b56c228893c0f2.png)

According to Microsoft documentation, the above check doesn’t seem to be a paramount consideration. Instead, it states that the administrator is responsible for revoking erroneous certificates when a certificate template is changed. In this case, I simply played the role of an uninformed administrator and didn’t perform the revocation step – indeed, not something that would happen in the real world, right? But, I digress.

If we forego the above weirdness, what happens if we generate a new certificate based on the updated (server authentication only) template? Firstly, the newly generated certificate’s EKU is different:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/287fa067e080c0de.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/a45d68e2ed7189a1e8d906c4e46a4c0e.png)

Upon attempting to authenticate with this new certificate, the KDC correctly detects that the EKU does not entail client authentication. As such, it rejects usage of the certificate:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a1978b5ac44dafbb.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/9ca33a02454684d58a3e998dfe3ebc92.png)

Notice how the KDC or Kerberos error message indicates that our certificate is being used for the wrong purpose. More importantly, the KDC reports that the certificate cannot be used for client authentication.

This then brings us to an important point for AD CS abuse: The certificate we generate as part of the ESC1 sequence must have client authentication in its EKU. Without it, we won’t be able to authenticate to the KDC and cannot generate the TGT and TGS we require.

### Error #2: Client Not Trusted

Another common error encountered during AD CS abuse is a KDC message indicating that the client cannot be trusted (KDC_ERROR_CLIENT_NOT_TRUSTED).

In their most recent [AD CS blog post](https://specterops.io/blog/2022/11/09/certificates-and-pwnage-and-patches-oh-my/), Will Schroeder and Lee Christensen explain that this error typically occurs when the issued certificate does not chain to a CA the KDC trusts.

DCs sync the trusted CAs periodically from Active Directory and store their thumbprint in a local registry key at HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\EnterpriseCertificates\\NTAuth\\Certificates. If the synchronisation fails, the KDC might hold a different collection of trusted CAs. This mismatch might account for the “client not trusted” error message.

Another possibility I encountered during a recent internal assessment is when you have multiple KDCs and different CAs—think of different forest trusts across a large organisation. A DC might not trust all CAs. For example, a DC might be configured to only trust its local domain’s CA and not all other CAs across the other forests. As such, you can issue a valid certificate but only authenticate to a few local DCs.

Since replicating a local multi-forest AD lab is rather tricky, I’ll opt here to illustrate the “client not trusted” error message using a more unconventional approach. To start, I’ll generate a certificate as per usual:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/92ea87bc8a463130.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/2a9e7e3cba34e84d1f6873dd48ed5a24.png)

*Note: I switched the ESC1 certificate template back to supporting client authentication.*

Next, we’ll use Rogan’s [Apostille](https://github.com/sensepost/apostille) application to impersonate the issued certificate—we are essentially cloning the properties of the certificate into a new self-signed certificate:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7f3b292de2c59ae8.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/af61e79a87dcaccc839294f8a65afa33.png)

With the cloned certificate generated, we convert the PEM formatted certificate and key back to a PFX using OpenSSL:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3c5d554d6e939eb2.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/e88278997eab2ac8f3ca486944e6891f.png)

At this stage, we have a client authentication certificate for a valid domain user account. However, we issued it, not the officially trusted CA. As such, if we were to use it in an authentication attempt, the KDC should reject it:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0be8cbbeb1ba0ab9.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/2d01b027aa7120bc7673e187419f4577.png)

As seen above, the KDC compared our certificate’s issuer to its local NTAuth store. Since the certificate was self-signed, the NTAuth store obviously didn’t have the CA thumbprint, and the authentication attempt was rejected.

Similar to the first error message explored in the previous section, this “client not trusted” message also holds some implications. While we might be able to generate a valid certificate, it does not mean that all DCs will automatically trust it. It depends mainly on the subset of CAs that the DC trusts. These subsets can be highly tricky in multi-forest environments, as one forest might not trust the CAs in another. One might even have it (as I’ve seen) that DCs inside a forest can also have differences in their trusted CAs.

Certipy does have a “ca” command that allows insight into the trusted CAs. However, it generally tries to pull the Active Directory’s trusted CAs, not what the individual DCs allow. I might be incorrect here, but the only way I’ve found to verify the individual DCs is by directly logging into them and navigating the registry.

### Error #3: No Support for PADATA Type

The next error we’ll explore is extremely common and has plagued me on several internal and red team assessments, most notably the PADATA error.

If we recall the AD CS introduction section at the beginning of the blog post, we learned that certificate-based (PKI) authentication depends on the encryption of a timestamp in the Kerberos AS-REQ request. This encrypted timestamp is stored in the PADATA of the AS-REQ request.

For reference, I’ll re-post the image that was shown earlier:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3e0c120cb1fffc78.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/dfefbabd8f40bae58745b3e345b99ab4.png)

The PADATA error message returned by the KDC while attempting authentication with a valid certificate is often very confusing and outright misleading:

```
Got error while trying to request TGT: Kerberos SessionError: KDC_ERR_PADATA_TYPE_NOSUPP(KDC has no support for padata type)
```

The error message would have one think that an error occurred with the PADATA section of the AS-REQ request. While this might be true (in rare circumstances), it actually points to an issue in the interaction between the KDC and the CA.

The following section from the Microsoft [documentation](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/auditing/event-4771) helps clarify this:

> Smart card logon is being attempted and the proper certificate cannot be located.
> 
> This problem can happen because the wrong certification authority (CA) is being queried or the proper CA cannot be contacted in order to get Domain Controller or Domain Controller Authentication certificates for the domain controller.
> 
> It can also happen when a domain controller doesn’t have a certificate installed for smart cards (Domain Controller or Domain Controller Authentication templates).

To better understand the reasoning for the PADATA error, it is important to first look at the certificate-issuing process:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a04343255ad38c1a.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/d2b5ca33bd970f64a6301fa75ae2eb22.png)

See in step 4 how the CA server signs the generated certificate with its own private key. This signing requires the CA server to hold a valid certificate. It does not validate nor interact with the DC’s certificate – if any.

Let’s explore the following scenario. In my AD lab, I have a DC that’s got a Domain Controller and CA certificate that expired on March 27th:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/51686ac978cdfafb.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/2d1546018316fbc4e01b9acd0ec45343.png)

On April 8th, I requested the AD CS service to issue a new certificate based on the ESC1 certificate template:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c39459068931be90.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/62be5224769c94cb5a7479ad44596485.png)

In the above screenshot, notice how the CA server still issued a certificate even though the environment held expired certificates. Hmmm, seems rather strange—perhaps another CVE is present here? Maybe not…

While a valid client authentication certificate has now been issued, the more pressing question is whether it could still be used. Let’s pass this certificate to the KDC while requesting a TGT as the Domain Administrator account:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e2ec40affd8dc139.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/afb28e5c812a1d73f0dcf5c87a0356b8.png)

Aha. Even though we have a valid certificate, the KDC rejected it and returned the dreaded PADATA error. This was returned because the KDC checked to ensure it was holding a valid Domain Controller or Domain Controller Authentication certificate. However, the certificate had already expired in this case, leaving it invalid for use.

## Sidebar: PKI Authentication without KDC Interaction

For a long time, security researchers believed the PADATA error represented the end of the attack chain. Since the KDC doesn’t hold access to a valid Domain Controller or Domain Controller Authentication certificate, all PKI authentication would fail. However, this was not entirely true.

The KDC is contacted as part of the Kerberos pre-authentication sequence. While this constitutes the modern PKI authentication flow, it’s not the only way it can occur on Windows. Before RFC 4556, PKI authentication on Windows involved other services, namely SSL/TLS. Upon exploring these services, researchers [found](https://offsec.almond.consulting/authenticating-with-certificates-when-pkinit-is-not-supported.html) that the SSL/TLS service (in particular, Schannel) does not involve the KDC. As such, a vector was born (nowadays referred to as Pass-the-Cert) whereby PKI authentication was still possible.

Here, I’ll demonstrate abuse of the Schannel service using the [PassTheCert](https://github.com/AlmondOffSec/PassTheCert/blob/main/Python/passthecert.py) script:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e467ec83994fde6a.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/d9aa5a53923f10dd7ee8253e8d1df4db.png)

The screenshot shows a successful authentication attempt to the DC and that we are now running in the context of the Domain Administrator. Keep in mind that the certificate being used here is the exact same one as was used for the PADATA error demonstration above.

Neither the CA nor DC held valid certificates when running the Pass-the-Cert attack above. Since the Schannel service was abused, authentication occurred directly against the DC’s LDAPS service. The LDAPS service only verified that the certificate’s SAN was a valid domain account; otherwise, no further validation was performed.

The caveat to this approach is that the DC must have either a Domain Controller or Domain Controller Authentication certificate installed—regardless of its validity. Furthermore, you only get LDAPS access, which implies that only a limited set of interactions could be raised while impersonating the Domain Administrator account.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0bcd301051b5c89d.png)](https://sensepost.com/img/pages/blog/2025/diving-into-ad-cs-exploring-some-common-error-messages/15d4036b60fe61629f7cef6cfe664c18.png)

*Note: I was the original author of the LDAP shell functionality for the [PassTheCert](https://github.com/AlmondOffSec/PassTheCert/commit/f12278e16a4903727a8dd8061b108cfdcb152052) script, but it already existed in the Impacket library.*

## Conclusion

While performing internal and red team engagements, we frequently encounter error messages. Sometimes, these are straightforward and easy to diagnose, while others require more in-depth analysis. Often, this in-depth analysis reveals new opportunities – as this blog post has shown.

This blog post briefly examined AD CS and some of the frequently encountered errors. AD CS continues to be a major factor in modern-day Active Directory compromises. Understanding its inner workings and how to avoid some scenarios will likely remain very beneficial.

As seen in the post, many error messages returned by tools, such as Certify and certify, can be traced back to the Kerberos pre-authentication (PKINIT) sequence. This may include using a certificate with the wrong EKU set or one for which the CA is not trusted. Even worse, you might be running into the dreaded PADATA issue, in that the DC does not have a valid Domain Controller certificate.

If you have further questions about AD CS or ideas for the few strange Windows observations I made in this blog post, please reach out to me via DM. I’m happy to chat about it and maybe even collaborate on further AD CS compromises.

Until next time… happy hacking!
