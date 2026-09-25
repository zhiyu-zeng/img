---
title: When Your VPN Opens Your Private Network to the Public
source: https://www.hacktron.ai/blog/cve-2026-0265-panos-globalprotect-cas-auth-bypass
source_host: www.hacktron.ai
clip_date: 2026-09-25T10:23:10+08:00
trace_id: b7970c68-b7a3-41f6-9578-5177b373a724
content_hash: b75b37b53636d736d665a4afb9aed7a06b5f8d0380a744788c8f544ccaa1f69f
status: synced
tags:
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: Hacktron·漏洞/利用研究
ai_summary: PAN-OS 的 CAS SSO 存在 JWT 算法混淆：用 HS256 把公开签名证书当 HMAC 密钥，即可伪造令牌、冒充任意用户接入 GlobalProtect VPN。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e675244-d011-811b-a870-fc23b5bb32f4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> PAN-OS 的 CAS SSO 存在 JWT 算法混淆：用 HS256 把公开签名证书当 HMAC 密钥，即可伪造令牌、冒充任意用户接入 GlobalProtect VPN。
> 
> - **漏洞根因：** 代码解析 JWT 头后把 `alg` 字段直接传给校验函数，仅按算法字符串分派；HS256/384/512 走 HMAC 路径并把证书字节当密钥，全程不与密钥类型做交叉校验（默认应为 RS256）。
> - **利用链：** 网关下发的 outbound JWT 泄露设备序列号 → 用任意有效设备 mTLS 证书查询 license API 的 device 接口得到 `support_account_id`（即 CSP ID）→ 补齐 aud 等 claim 完成伪造。
> - **证书获取：** 与 Palo Alto 服务器通信（含 metadata 端点）走 mTLS，设备证书被加密；作者用 hook 底层加密函数 dump 设备证书，再从 `/api/v1/metadata` 的 `token_certs` 取签名证书链。
> - **调试验证：** 通过 EBS 快照去掉 product code 绕过 AWS 授权取得文件系统读写，并进一步拿到运行实例的 root；本地搭 CAS 反复对日志排错（时间戳、缺失属性）才跑通端到端利用。
> - **AI 作用域结论：** Claude Opus + Ghidra MCP 承担了脱壳、取根、架构梳理和脚本迭代等枯燥环节，但操作者仍须自建架构与关键校验点认知；启用 CAS 的旧版 PAN-OS 应立即升级。

While I’m not doing product work at Hacktron, which is like a week in a month, I’ve been using that time to ride the ai-assisted-research wave fascinated by the idea of pushing past what I’d normally do as a web security researcher, things like finding memory corruption bugs and exploiting them in OSS. Another area for me was enterprise apps that come with stripped binaries, and I was curious how I could leverage claude to go beyond and hack some of these. A few enterprise softwares are well known for shipping stripped binaries:

-   Palo Alto PAN-OS
-   F5
-   Fortinet

I started looking into each of them, got a VM running for all. The first challenge was simply jailbreaking the VM to get root access. I sat down with [claude opus](https://www.hacktron.ai/blog/i-let-claude-opus-to-write-me-a-chrome-exploit) 4.6 and wandered around until we found a way to get root into the VM while keeping the license valid on AWS. This is one area I found the LLM-assisted approach very useful. Previously this tedious task of setting up the software, jailbreaking etc would take lots of time. While working for httpvoid blog or at projectdiscovery, I’d see myself setting up software, finding ways around, hacky ways to get into VMs, etc. I think a lot of researchers would realize how tedious and often boring this process is, though however very important.

## Jailbreaking PAN-OS VM

The PAN-OS VM-Series runs as an AWS Marketplace AMI, which attaches a product code to the EBS snapshot. This prevents you from mounting the volume on a regular EC2 instance. To bypass this, Claude created a snapshot of the running PAN-OS instance, then used the EBS Direct APIs to write the blocks into a new snapshot. The new snapshot contains an identical block-level copy of the filesystem but has no product code attached to it. Then it created a volume from this clean snapshot, attached it to an EC2 instance, mounted it, and woot have full read access to the PAN-OS filesystem. However, this wasn’t enough for proper live env debugging and claude later managed to get direct root on a running instance, all without supervision from me, it just gave me what all I needed to start hacking, which was cool!

## Mapping Attack Surface

After getting the root shell access, my first prompt was to gather all running processes, get all configs, binaries related to them in a local dir, and start mapping out how everything is wired up. So I let claude go do this chore on its own and in the meantime I also started exploring on my own. I was mainly interested in finding attack surface that would affect the GlobalProtect portal, as enterprises don’t keep the PAN-OS management portal exposed, so I was not very interested in it or the PHP attack surface.

While looking into the auth mechanisms that we can attach to the GlobalProtect portal, SAML and CAS struck me as good candidates.

Initially I started working on SAML, as I’m quite familiar with it from hacking GitHub and GitLab SAMLs. It was fun to dive into a SAML implementation that’s behind binaries using Ghidra MCP, I assumed it would be tougher to navigate/reverse but a less explored attack surface. I did manage to find interesting things like the use of multiple XML libraries (libxml2, Xerces-C/OpenSAML (OSS)) where some functions were namespace-blind while others weren’t, creating inconsistency. As you might know working on SAML requires everything to align very properly and I figured maybe I should focus on other auth mechanism first and come back to this later. I believe there are bugs to be found here, or maybe Palo Alto team will find them given they have [Claude Mythos](https://www.hacktron.ai/blog/why-mythos-doesnt-matter-for-us) access.

## Architecture

Personally, I first like to understand what the architecture is like, what the trust boundaries are, what things talk to what. So after a few hours of poking around the box with claude, here’s the visual chart of how GlobalProtect auth works at a high level:

![GlobalProtect auth architecture](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c886550f3bbdd291.webp)

The sslmgr, authd, libauthd_mp, libpanmp_mp were interesting as they could have memory corruption bugs too, but coming from a web background, even if I find something, it would be hard for me to convert it to a full chain exploit. I did this for ghostscript and was able to create a 0day mitigation bypass exploit by babysitting claude and reading some blogs here and there for techniques, but having an OSS, proper debugging env, and a scripting language to exploit such bugs is I believe completely different and aids LLMs a lot… Not saying you can’t do it for remote binaries, but for me I’ll have to read a lot of blogs myself so I know my prompts are making sense and then babysit a lot to get to complete ASLR bypass exploits, so I focused on my hypothesis of where web bugs could be and targeted there.

## What is CAS?

CAS is Palo Alto’s cloud-hosted SSO broker. Instead of the firewall talking directly to an IdP (Okta, Azure AD), it redirects through cloud-auth-service.<region>.apps.paloaltonetworks.com, where you configure the IdP. After you auth with your IdP via SAML for example, it returns a signed JWT token (not SAML XML) back to the firewall. The firewall verifies the JWT using a signing certificate shared across all CAS-enrolled devices.

The firewall generates an outbound JWT containing session parameters (SID, Opaque, TID, PID), redirects to the CAS cloud portal, which redirects to the configured IdP. After completing auth, CAS redirects back with a signed JWT token. The firewall then verifies the inbound token signature and extracts the authenticated username.

![CAS authentication flow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7b297b3167f47143.webp)

This immediately struck me as good attack surface, because there are 2 points it can choke from an auth bypass perspective:

-   IdP to CAS Cloud verification
-   CAS Cloud to PAN-OS verification

The latter’s implementation lives in our VM, so that’s where I could take claude’s help and see how effective it can be in helping me reverse and potentially find a bug.

## Discovery

Well, in just a few minutes of using Ghidra MCP, Claude found what I firstly believed was a false positive, a textbook auth bypass via JWT algorithm confusion, using HS256 in place of the default RS256, and the implementation trusting it. This in 2026? I could not believe it. So I first asked it to do some static validations by calling the methods directly and checking. To my surprise it was indeed working, unless there was something upstream in callers that would prevent this, and there was no check at all.

```kotlin
// pan_jwt_verify
// Parses JWT header, extracts alg field, passes it DIRECTLY to pan_auth_verify

pan_auth_verify(
  jwt_struct->alg, // FROM PARSED JWT HEADER
  cert_pem,           // CAS signing certificate
  cert_len,           // strlen(cert)
  signing_input,      // header.payload
  input_len,
  signature           // base64url sig string
);

// pan_auth_verify
// Dispatches purely on the alg string, NO cross-check against key type

if (alg == "HS256" ||
    alg == "HS384" ||
    alg == "HS512") {

  // HMAC path: uses cert bytes as, the HMAC secret key
  _verify_sha_hmac(alg, key, key_len,
                   data, data_len, sig);

} else {

  // RSA/EC path: normal asymmetric
  _verify_sha_pem(alg, key, key_len,
                  data, data_len);
}
```

If you’re not familiar with jwt algorithm confusion, here’s the gist:

![JWT algorithm confusion explained](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/17e36983a9b234f5.webp)

So far this seemed to be a valid finding, but honestly I don’t trust LLMs until I do a proper verification on my own and quite honestly I’m so skeptical that I still ask my peers if I’m being dumb.

As a next step, I started setting up CAS on my instance. Honestly, due to how the setup works I got it wrong 1-2 times but eventually I did manage to set it up, and this was one of the hardest parts throughout this validation. The technical part was all claude figured with little to no help.

## Getting Certificates

Next thing after setup was getting the certificates and using them as HMAC keys with HS256. Now this was also a bit challenging because most communication to Palo Alto’s servers uses mTLS, including the metadata endpoint that provides the certs. The mTLS uses device certs, which were further encrypted and the decryption process was quite long. So brainstorming with claude, we settled on using hooks on the underlying crypto functions and dumping those device certs, PEMs and then using those we were able to hit the metadata endpoints and get the cert chain.

```swift
GET https://cloud-auth-service.us.apps.paloaltonetworks.com/api/v1/metadata

Response:
{
  "token_certs": [
    "-----BEGIN CERTIFICATE-----\nMIIF...cas-token-signer-1...\n-----END CERTIFICATE-----\n..."
  ]
}
```

Having managed to get the certs, claude wrote a script to check how the cert is being consumed and was able to complete the verification by reading logs and seeing at which step of auth it failed, like timestamp failures, missing properties etc. It went in a loop until it fixed everything and had a working exploit. This is especially the kind of work that bores me, the part where you know the bug exists but have to do debugging back and forth to complete all of the requirements to make the flow work end to end.

![Exploit verification](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9f08d0df0fac4a09.webp)

## Getting CSP ID

Now the last part. The `aud` claim in the forged JWT requires the CSP ID (kind of CAS account ID) tied to the target device.

Getting it is a two-step leak. First, the device serial number - when you initiate the SSO flow (GET /global-protect/login.esp), the portal returns an outbound JWT to be sent to CAS Cloud. Decoding the JWT payload reveals the SN claim containing the device serial number. With the serial number in hand, we can query the Palo Alto license API using any valid mTLS client certificate:

`GET https://license.api.paloaltonetworks.com/entitlements/v1/device?serialNumber=<SN>`

The response includes the full entitlement record with the `support_account_id` field. This means any registered PAN-OS device (or anyone with a leaked device mTLS cert) can resolve the CSP ID for any other device.

So the target leaks the serial number in the outbound JWT, the license API leaks the CSP ID from the serial number, and the attacker has all the claims needed to forge the JWT.

## Exploitation

Now knowing all details, my goal was to hijack the login process of the GlobalProtect client and connect to the VPN. All I had to know was the username, which generally is just the user’s email address!

![Exploitation step 1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/783e36832b640bef.webp)

![Exploitation step 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c0a9985861efd662.webp)

As this might still affect a few corps, I’m not disclosing the full exploit with device certs, CSP leaks, hijacking the login process and connecting to VPNs.

If you have PAN-OS running an older version with CAS enabled, please immediately update.

## Conclusion

Reverse engineering used to be a barrier to entry for these kinds of software, now throwing tokens to decompile the whole binary although expensive can result in opening massive attack surface.

If your defense in depth is to make attackers’ life harder then it doesn’t work anymore. Either ur defense in depth shouldn’t have opening or it’s better you avoid doing it altogether.

As a researcher do not leave understanding to model, navigating through complex software is a multi week work and it still requires the human to navigate the model to places and make it do its own thing, it’s important that operator has clear understanding of attack surfaces, architecture to make the best out of it, models are as good as the operator and the harness. The better you understand the arch, internal workings, choke points, the better you’d be able to use LLMs as tool to test your hypothesis of vulnerabilities.
