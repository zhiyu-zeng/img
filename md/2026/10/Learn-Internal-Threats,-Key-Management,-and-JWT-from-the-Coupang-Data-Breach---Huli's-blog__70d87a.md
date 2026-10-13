---
title: Learn Internal Threats, Key Management, and JWT from the Coupang Data Breach - Huli's blog
source: https://blog.huli.tw/2026/03/19/en/coupang-insider-kms-and-jwt/
source_host: blog.huli.tw
clip_date: 2026-10-13T10:24:55+08:00
trace_id: 62852cc5-6d1b-4d7e-bf52-700fa48b4595
content_hash: 49e9a25926577f20d26518a83be09048feea4167626de6bd37b83de526b8c5f5
status: synced
tags:
  - 密码学
  - 漏洞分析
series: null
feed_source: Huli·安全/逆向
ai_summary: 前 Coupang 员工在职时取得 JWT 签名密钥，离职后自行签发合法令牌冒充任意用户登录，本质是内部威胁叠加密钥管理与无状态 JWT 的设计缺陷。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-81c6-9dfb-d679468eab2c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 前 Coupang 员工在职时取得 JWT 签名密钥，离职后自行签发合法令牌冒充任意用户登录，本质是内部威胁叠加密钥管理与无状态 JWT 的设计缺陷。
> 
> - **攻击入口：** 攻击者为前 Staff 后端工程师，在职负责认证系统备份开发，掌握签名密钥后本地签发 token，服务端验签通过即放行，非外部漏洞利用。
> - **密钥生命周期：** 生成、存储、分发、使用、轮换、销毁六步任一环节出错都可能泄露；韩国 MSIT 报告指签名密钥本应只存在 KMS，却被硬编码在开发者笔电上。
> - **更安全做法：** 由 Secret Manager 直接生成密钥（如 `aws secretsmanager create-secret --generate-secret-string`），让"没人知道密钥是什么"；人员离职即轮换；把加解密/签名外包给 KMS（仅暴露 Encrypt、Decrypt、Sign、Verify），最终交给 HSM 硬件保护。
> - **Secret Manager 与 KMS 区别：** 前者解决机密信息的安全存放，后者围绕密钥全生命周期提供加解密与数字签名 API。
> - **JWT 额外风险：** 无状态 JWT 把用户数据放进 token，私钥泄露即可伪造身份；用非对称加密时公钥（jwks.json）被替换也能用自己的密钥对通过验签，只需抢一个时间窗口。

Since November last year, the data breach incident at Coupang has attracted considerable attention, partly due to the reportedly massive amount of leaked data, and partly because the company has a presence in Taiwan. As the investigation progresses, more and more details have emerged, even being described as like a movie plot, with efforts to retrieve hard drives from rivers.

Recently, I went back to review the reports from Korea and found them quite detailed, so I decided to write an article discussing how this whole incident technically occurred and what security aspects we should pay attention to.

## How Did They Get In?

First, let’s briefly summarize the events of the incident to provide a basic context before diving into the finer details.

Currently, there are two official statements from Taiwan:

1.  [Coupang Taiwan’s Latest Statement on the Recent Cybersecurity Incident in Coupang Korea](https://tw.coupangcorp.com/archives/5789/) (Published on 2025-12-25)
2.  [Coupang Taiwan: Update on the Data Breach Announced on November 29, 2025](https://tw.coupangcorp.com/archives/5954/) (Published on 2026-02-24)

However, more details can be found in this official statement available only in English and Korean: [Update on Coupang Korea Cybersecurity Incident](https://www.aboutcoupang.com/English/news/news-details/2025/update-on-coupang-korea-cybersecurity-incident/) (Published on 2025-12-29)

For those interested in more technical details, you will need to refer to the investigation report released by the Ministry of Science and ICT (MSIT) in Korea on February 10, which is extremely detailed: [Investigation Results on the Data Breach by a Former Coupang Employee](https://www.msit.go.kr/eng/bbs/view.do;jsessionid=iMyzX8C42zedbf27PtWxq844qjcyYy0VOCt74FEO.AP_msit_2?sCode=eng&mPid=2&mId=4&bbsSeqNo=42&nttSeqNo=1221&utm_source=perplexity). The technical details cited in this article will also come from this report.

The incident began on November 16, 2025, when Coupang received an email from the attacker, claiming that a large amount of personal data had been leaked due to a system vulnerability, along with relevant screenshots as proof.

Coupang immediately launched an investigation and began reviewing logs, discovering that data had indeed been stolen, leading to the news everyone has seen. The incident has now largely come to a close, and the relevant results can be found through official statements and news reports. This article will not discuss the results but will focus solely on the technical details.

Therefore, the question we are concerned with is: “How did this attacker get in?” Let’s first look at their identity.

> The attacker was identified as a former Coupang software developer (Staff Back-end Engineer) who, while employed at Coupang, was responsible for designing and developing user authentication systems for backup in the event of system failures.

The attacker was a former employee and was responsible for developing auth-related systems. The person who sent the email at the beginning is also this individual, but the report and news do not explain why they chose to expose their own attack.

In a normal login process, after verifying the username and password, the system issues an “electronic access badge” (as stated in the report), and then the server uses a signing key to verify whether this badge is legitimate. While working at Coupang, the attacker directly obtained this signing key, allowing them to locally sign a legitimate badge and log in as anyone.

This electronic access badge sounds a lot like a JWT token. I tried it myself on Coupang’s Taiwan website and found that the token used for identity verification is indeed a JWT token (CT_AT_TW). When decoded, it looks like this:

```json
{
  "aud": [
    "https://www.tw.coupang.com"
  ],
  "client_id": "4cb7da11-c6d6-4ca3-875f-332cf489d5d",
  "exp": 1773067653,
  "ext": {
    "LSID": "a3788aeb-239c-453d-cd90-72ac345aa431",
    "fiat": 1773064052
  },
  "iat": 1773064052,
  "iss": "https://mauth.tw.coupang.net/",
  "jti": "043c2c37-c373-4b75-abbc-ad8e646bb490",
  "nbf": 1773064052,
  "scp": [
    "openid",
    "offline",
    "core",
    "core-shared",
    "pay"
  ],
  "sub": "556683653781741"
}
```

Although I don’t know the internal technical implementation details of Coupang and can’t be 100% sure it’s a JWT token, since the mechanism of signing tokens for identity verification is most suitable with JWT tokens, let’s assume it’s a JWT token for now. Even if something else is used behind the scenes, the process should be similar.

At this point, it’s already quite clear how the attacker got in: they obtained the signing key (or you could also say the JWT secret) while still employed, so after leaving the company, they used this signing key to sign tokens themselves. The server verified it as legitimate and let them through, allowing them to log into someone else’s account. Once logged in, they could access personal information on pages like “my profile.”

So this is actually not an external attack; it wasn’t an external hacker exploiting a vulnerability in the auth system. Instead, it’s an insider threat, where a former employee used internal information obtained during their employment to breach the system.

Next, we can look at this issue from two angles: why an internal key was accessible to a developer, and the risks of using JWT tokens as an auth verification mechanism.

## Key Management Lifecycle

Keys are important; everyone knows this. The lifecycle of a key actually consists of several stages:

1.  Key Generation
2.  Key Storage
3.  Key Distribution
4.  Key Usage
5.  Key Rotation
6.  Key Destruction

The first step is to generate a secret key and ensure that the generation method is secure. This step usually emphasizes using secure algorithms, sufficiently random entropy, and a secure environment, etc. A problematic example would be using an insecure random number generator (like `Math.random()`) or generating the key in an insecure environment, such as on a developer’s local machine.

After generation, a secure location must be chosen for storage, such as an HSM or KMS. A counterexample would be storing it in plaintext on a specific machine.

Next, when the system needs to use this key, it must be able to securely transfer the key from the storage location to the usage location. A counterexample would be transmitting the key directly over HTTP on an internal network, where anyone intercepting the packets could see the plaintext key.

When using the key, it must be used correctly. The key should only be used for its intended purpose, and access should be restricted to those who can use it. For example, if I generate one key and every system uses the same one, that is an incorrect usage method. If it gets stolen, every system is compromised. There should be one key for auth, one for payment, or even multiple keys within the same system.

From Coupang’s public statement, it can be seen that although their auth key was leaked, payment-related services were unaffected, and no data was leaked. The investigation report from Korea also indicated that the impact was limited to pages like “My Information,” excluding payment-related information.

Finally, regarding key retirement, key rotation should be performed regularly to replace keys and limit the attack time window. After a key is completely destroyed, it must be ensured that it cannot be recovered, and that key should not be used again.

In this lifecycle, any step with an issue could lead to key leakage.

In the case of Coupang, since a former employee could access the key, it suggests that there was an error in the first two steps. The investigation report pointed out that the current employee’s computer also had this key:

> A forensic examination of laptops used by current developers confirmed that the signing key, which was required to be stored exclusively within the key management system, had also been stored locally on developer laptops (via hardcoding).

Many companies, when managing keys, may only consider half of the process. For example, they might know to use some Secret Manager or vault to store keys and securely transmit them for system use, but overlook other steps, such as key generation.

How was this key generated? Many companies might have a developer generate a key locally and then pass it to SRE, who configures it in the vault. In this process, the key has already been known to at least two internal employees, and there isn’t much logging available to check, as this occurs before the key is placed in the vault.

When the key is managed elsewhere, it is possible for SREs to have the permission to directly view the plaintext of the key and steal it. However, the vault system should have an access log that can be traced back. But if the logging occurs before the key is placed in, there will be no record, creating a security vulnerability.

Although the risk of insiders is relatively lower compared to other categories, as internal malfeasance is usually easier to detect and can lead to legal consequences, once it occurs, it can still cause significant damage to the company’s reputation, just like the recent Coupang incident.

## Safer Key Management Methods

Earlier, it was mentioned that many companies have no issues with key storage, but they do not do well in the key generation phase, allowing insiders to directly obtain the key, thus introducing internal risks.

Therefore, the safest method is “no one knows what this key is.”

“Anyone” includes SREs, CISO, CEO, or developers; no one knows what the key actually is.

For example, if you originally allowed SREs to generate the key themselves and then place it in AWS Secret Manager, you could change it to directly use the AWS Secret Manager’s [create-secret](https://docs.aws.amazon.com/secretsmanager/latest/userguide/create_secret.html) command to generate a key and store it:

```bash
aws secretsmanager create-secret \
  --name jwt-secret \
  --generate-secret-string '{"PasswordLength":64}'
```

(This is just an example using AWS; similar services from other clouds should be about the same.)

In this way, when the key is generated, no one will know its contents.

Although this method is already safer than the previous one, upon closer inspection, there are still a few issues.

First, the key stored in AWS Secret Manager can be read; if you have the `secretsmanager:GetSecretValue` permission, you can read it. So if an SRE has this permission or sets it for themselves through other means, they can still access it.

Second, since the system needs to use this key, it must be readable. If a developer modifies a piece of code to dump the key’s contents into the log during CI or system startup, they can still know the plaintext of the key.

Both of these methods will leave records, such as AWS permission change logs, key read logs, and code commit logs, etc. Moreover, the attack premise of the second method is not low; usually, code needs to go through PR review before being pushed to production, and it may also be directly caught by DLP when printed.

But regardless of whether evidence is left behind, the point is that if an insider is determined to do harm, they can still obtain it.

One solution is to start with key rotation. When personnel who can access the key leave, remember to rotate all related keys to prevent leakage. Although we cannot prevent current employees from doing harm, at least we ensure that they automatically lose all permissions after leaving, and any information or keys they accessed while employed can no longer be used.

If you want to be even safer, even current employees should not be allowed to touch the key. This means removing the premise that “the system needs to obtain the key to encrypt and decrypt,” and instead, moving the encryption and decryption process to another trusted location.

This is what KMS (Key Management Service) commonly does.

In this type of service, you cannot obtain the key; it only exposes a few APIs to you, such as:

1.  Encrypt
2.  Decrypt
3.  Sign
4.  Verify

So when you need to encrypt or decrypt, you call the KMS API and wait for the result. In this process, you do not need the key at all; from key generation to usage, everything is done within KMS.

In simple terms, it is about isolating these key-related operations into a subsystem.

However, merely isolating it into a subsystem does not fundamentally solve the problem; this subsystem will encounter the same issue: what if the KMS is compromised? Will the key be leaked?

If you want to ensure that the key is truly not leaked (as completely as possible, but certainly not 100%), the ultimate solution is to hand over key management to specialized hardware, namely HSM (Hardware Security Module). These hardware devices are specifically designed to protect keys and even consider the risk of physical attacks, similar to what you see in movies, where a safe detects an intrusion attempt and self-destructs.

However, enterprise-grade HSMs typically start at hundreds of thousands of TWD. Besides purchasing HSMs, cloud service KMS can also be paired with Cloud HSM. For example, AWS’s [KMS documentation](https://docs.aws.amazon.com/pdfs/kms/latest/cryptographic-details/kms-crypto-details.pdf) states:

> If the Origin is AWS_KMS, after the ARN is created, a request to an AWS KMS HSM is made over an authenticated session to provision a hardware security module (HSM) backing key (HBK).

Speaking of Secret Manager and KMS, the concepts are somewhat similar in certain aspects, so let’s briefly discuss the differences.

Secret Manager is solely responsible for managing secrets, which can be tokens for calling third-party APIs or passwords for logging into certain services. These are all secrets, but they are not necessarily “keys,” as the term “key” specifically refers to cryptographic keys.

Key Management Service, on the other hand, is dedicated to managing keys, providing APIs related to encryption, decryption, and digital signatures, revolving around keys. Therefore, it also considers the generation of keys and their entire lifecycle, which is the difference between Secret Manager and KMS.

In simple terms, Secret Manager addresses “how to securely store secret information,” while KMS addresses “how to securely manage and use cryptographic keys.”

However, why do we put so much effort into protecting this key? That’s because, in the case of a JWT token, once the private key is taken, it can directly forge the identity of any user to log in… etc. Isn’t that a bit strange?

## Additional Risks of Using JWT Tokens

In this classic article from 2016, [Stop using JWT for sessions](http://cryto.net/~joepie91/blog/2016/06/13/stop-using-jwt-for-sessions/), three terms are defined:

1.  Stateless JWT: session data is stored directly in the JWT
2.  Stateful JWT: only session ID is stored in the JWT
3.  Session token/cookie: traditional method, cookie stores session ID

What I want to discuss this time is mainly the first type.

In the first scenario, since the user’s data is stored directly in the JWT, if the JWT can be forged, it can lead to serious problems, just like this incident with Coupang.

However, if we use the traditional method or the second type, where we only store the session ID, since this is a random string, under unpredictable circumstances, attackers cannot do much more. Therefore, even if they obtain the key, they cannot directly forge identities.

In other words, the stateless JWT approach actually has a risk: if the key is stolen, it’s game over, so protecting the key becomes very important.

Another point to note is that if asymmetric encryption is used, in addition to protecting the private key, the public key also needs to be protected.

Huh? Why does the public key need protection?

Because the system uses the public key for verification, and this public key is usually placed at a fixed URL, such as.well-known/jwks.json.

If this URL is compromised, attackers can generate a new key pair and replace the public key, allowing them to pass with their own signed JWT token. Although all keys signed through legitimate channels will fail and the system will definitely raise an alarm, attackers still have a time window to successfully forge identities.

Therefore, both the private key and the public key need to be protected.

## Conclusion

In the past, the first reaction to security incidents was often external hacker intrusions, but this time we saw a real case of an insider. The identity of “internal employees” inherently has more privileges and access to more information, and “internal developers” have even more access, especially if they are “developers of the internal auth system.”

Even after leaving the company, they still know more internal details than others and can more easily exploit vulnerabilities from the outside (for example, by stealing a piece of code and exploiting a vulnerability to gain access, or using known but unpatched vulnerabilities, etc.).

From the investigation report in Korea, we, as outsiders, can also get a glimpse of the technical details, trying to piece together which systems had issues and how to improve.

I believe many companies have some issues in generating keys; I’ve seen many cases where developers or SREs generate them and then store them in Secret Manager. Many companies also lack the resources to set up a KMS (or some may not have thought about it or realized the need to do so). These are all risks and will be discussed under the framework of risk management. Many companies currently choose to accept the risk, acknowledging its existence but deciding not to address it due to the low probability of occurrence.

If there is indeed a former employee who manages to sneak out some data, similar incidents are likely to happen again.

While observing this incident, I couldn’t help but think of my previous experience working in cryptocurrency-related insurance, as managing keys is crucial for exchanges, especially the private keys of wallets, which directly relate to large sums of money. At that time, I also looked into many methods for protecting private keys, took a lot of notes, and learned many technical terms. The HSM, KMS mentioned in this article, or the DEK (Data Encryption Key), KEK (Key Encryption Key), and envelope encryption that weren’t mentioned, are all quite interesting.

If I can retrieve the notes I wrote in the past and the memories that are gradually fading, I will come back to write another article later.
