---
title: "LSA Internals: Authentication, Logon Sessions, and Credential Guard"
source: https://blog.yunolay.com/lsa-internals-authentication-logon-sessions-credential-guard/
source_host: blog.yunolay.com
clip_date: 2026-10-13T10:17:58+08:00
trace_id: a2be4344-18ea-4c48-b3bf-358594cf1b67
content_hash: f613ba4ac12c5b071f62f3a244217afaab7c480496a6d423f248769d9dcca2ba
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: Yunolay·Windows内核/逆向
ai_summary: LSASS 承担登录验证、令牌签发与登录会话管理，凭据集中在内存中；RunAsPPL 与 Credential Guard 通过拒绝句柄、把密钥移入 VTL1 来防读取。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-8117-8ab5-ed4d5dd6e290
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> LSASS 承担登录验证、令牌签发与登录会话管理，凭据集中在内存中；RunAsPPL 与 Credential Guard 通过拒绝句柄、把密钥移入 VTL1 来防读取。
> 
> - **职责与身份：** lsass.exe 由 wininit.exe 启动、以 NT AUTHORITY\SYSTEM 运行，负责登录校验、生成访问令牌、执行本地安全策略、管理登录会话，并加载分发认证包。
> - **可插拔认证包：** LSA 经 SSPI 加载 MSV1_0（NTLM 与本地账户校验）、Kerberos、Negotiate、WDigest、CredSSP、TSpkg；WDigest 曾缓存明文等价凭据，现代系统默认关闭。
> - **登录会话：** 每次成功认证产生一个 LUID 标识的登录会话，令牌的 Authentication ID 即此 LUID，多个令牌可共享同一会话；类型 2/10（交互、RDP）保留的凭据材料多于类型 3（网络）。
> - **秘密存放位置：** 认证包在 LSASS 内存中保存会话期凭据材料；缓存域凭据以加盐哈希存于注册表；LSA secrets（机器账户口令、服务账户口令、DPAPI 密钥）位于 SECURITY hive。
> - **防护与防御性核查：** RunAsPPL 让无同级签名的 SYSTEM 进程无法以 PROCESS_VM_READ 打开 LSASS；Credential Guard 将密钥移入 VTL1 的 LSAIso，VTL0 内核亦不可达；可只读检查 RunAsPPL 注册表值、Win32_DeviceGuard 的 SecurityServicesRunning=1、WDigest UseLogonCredential=0，并审计 4624/4672/4634 事件。

If any single process is the beating heart of Windows security, it is the **Local Security Authority Subsystem Service**— `lsass.exe`. It validates every logon, builds the access tokens that the rest of the system checks (the subject of an earlier article in this series), tracks logon sessions, and holds the secrets needed to keep a session authenticated. Started by `wininit.exe` early in boot, as we saw when tracing the Windows boot path, LSASS sits at the exact point where “who is this user” becomes “what may this user do.” This article dissects how LSA authenticates, where it keeps its secrets, and — most importantly — the modern protections that guard it.

## LSASS Responsibilities

LSASS is not a single-purpose service; it is the executive branch of the Windows security model in user mode. Its core duties are:

-   **Logon validation**— checking presented credentials against a local account database (the SAM) or, on a domain member, brokering validation with a domain controller.
-   **Token generation**— after a successful logon, constructing the **access token** that carries the user’s SID, group SIDs, privileges, and integrity level. Every process the user launches inherits a copy of that token.
-   **Security policy enforcement**— applying the local security policy: privilege assignment, audit policy, and account restrictions.
-   **Logon session management**— creating and tearing down logon sessions and the credential material bound to them.
-   **Hosting authentication packages**— loading and dispatching to the pluggable providers that actually implement protocols like NTLM and Kerberos.

Because it performs all of these, LSASS necessarily runs as `NT AUTHORITY\SYSTEM` and holds highly sensitive material in its address space — which is exactly why it is both critical and heavily targeted.

## Authentication Packages (SSPs)

LSA does not hard-code any one authentication protocol. Instead it loads **Security Support Providers (SSPs)**— DLLs that implement the **SSPI** (Security Support Provider Interface), Windows’ abstraction for authentication. When a client and server negotiate a logon, they speak SSPI and LSA routes the exchange to the appropriate package. The common providers are:

-   **MSV1_0**— the NTLM authentication package, and the validator for local accounts.
-   **Kerberos**— the preferred domain protocol, issuing and validating tickets.
-   **Negotiate**— a pseudo-package that picks Kerberos when possible and falls back to NTLM.
-   **WDigest**— a legacy provider; historically it cached plaintext-equivalent credentials in memory, which is why disabling it is now standard hardening.
-   **CredSSP**— used by RDP/Remote Desktop with Network Level Authentication to delegate credentials.
-   **TSpkg**— Terminal Services package.

A package’s job is to take the presented material (a password hash, a ticket, a challenge response), verify it, and hand LSA a validated logon from which a token can be built. The pluggable design is powerful — but it also means LSASS keeps each package’s working secrets in memory for the life of the session.

## Logon Sessions

Each successful authentication creates a **logon session**, identified by a **LUID** (Locally Unique Identifier). This is the same value that appears in a token as its **Authentication ID**— the link between a token and the logon that produced it, which we met in the access-tokens article. Several tokens can share one logon session, which is how a user’s many processes all trace back to a single logon.

Logon sessions are typed, and the **logon type** matters enormously for both behavior and detection:

-   **Interactive (type 2)**— a user logging on at the console.
-   **Network (type 3)**— authenticating to access a resource (a file share) without an interactive session; typically no long-lived credentials are cached.
-   **Batch (type 4)**— scheduled tasks.
-   **Service (type 5)**— service accounts started by the SCM.
-   **RemoteInteractive (type 10)**— RDP logons.

Interactive and RemoteInteractive logons generally cause more credential material to be retained in memory than network logons — a distinction defenders use when reasoning about exposure.

## Where Secrets Live

To keep a session usable without re-prompting for a password on every action, LSA retains various secrets. Conceptually — and this is a map of *what exists and why*, not a how-to — that includes:

-   **Credential material held by packages** in LSASS memory for the duration of a logon session (for example, the keys Kerberos needs to request service tickets).
-   **Cached domain credentials**— verifiers that let a domain user log on to a laptop that is currently offline. These are stored in the registry in a salted, hashed form, not as reusable passwords.
-   **LSA secrets**— machine account passwords, service account passwords, and DPAPI keys, persisted under the `SECURITY` hive (the registry internals article covered how hives and cells work).

The takeaway is architectural: an attacker who can read LSASS memory or the `SECURITY` hive is after this material. The rest of this article is about why that is hard on a properly configured modern system.

## Protecting LSASS

Windows layers several defenses specifically around LSASS:

-   **RunAsPPL (Protected Process Light).** When enabled, LSASS runs as a protected process — the protection level recorded in its `EPROCESS` that we discussed in the processes article. Even a `SYSTEM` -level process without an equal-or-higher signer level cannot open a handle to LSASS with sensitive access such as `PROCESS_VM_READ`. This blocks the straightforward “open LSASS and read its memory” approach at the handle-acquisition step.
-   **Credential Guard.** Building on Virtualization-Based Security and Virtual Trust Levels (covered in the kernel-protections article), Credential Guard moves the most sensitive secrets out of the normal `lsass.exe` in VTL0 and into an isolated trustlet, **LSAIso**, running in the secure world (VTL1). The normal kernel — and therefore even `SYSTEM` code with a kernel read primitive in VTL0 — cannot reach VTL1 memory. Secrets are used across the boundary via controlled calls rather than being exposed.
-   **Disabling WDigest.** On modern Windows WDigest credential caching is off by default; keeping it off prevents a plaintext-equivalent secret from ever being cached.

These are complementary: RunAsPPL raises the bar for user-mode access, while Credential Guard removes the most valuable secrets from the reachable address space entirely.

## Inspecting LSA Configuration (Defensive)

From a defender’s chair, the useful work is verifying that these protections are on and that logon activity is audited. All of the following are read-only, monitoring-oriented checks:

```
# Is LSASS running as a Protected Process Light? (1 = enabled)
reg query HKLM\SYSTEM\CurrentControlSet\Control\Lsa /v RunAsPPL

# Is Credential Guard configured and running?
Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard |
  Select-Object SecurityServicesConfigured, SecurityServicesRunning
# SecurityServicesRunning containing 1 indicates Credential Guard is active.

# Confirm WDigest is not caching credentials (UseLogonCredential should be 0 or absent)
reg query HKLM\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest /v UseLogonCredential

# Review logon activity in the Security event log:
#   4624 = successful logon (check the LogonType field)
#   4672 = special privileges assigned at logon (admin-equivalent logons)
#   4634 = logoff
wevtutil qe Security /q:"*[System[(EventID=4624)]]" /c:5 /rd:true /f:text
```

Auditing logon events (4624/4672/4634) and correlating logon types is the backbone of detecting anomalous authentication — for example, unexpected network or RemoteInteractive logons for a privileged account.

## Security Relevance

LSASS is consistently the highest-value target on a compromised host precisely because it concentrates authentication secrets. Understanding that shapes defensive priorities. Because reading a process’s memory requires first opening a handle to it, endpoint tools watch closely for a non-security process opening `lsass.exe` with `PROCESS_VM_READ` — an application of the handle-and-object model from the Object Manager article. The mitigations covered above are the counter-moves: **RunAsPPL** denies the handle, **Credential Guard** empties the prize by relocating secrets to VTL1, turning **WDigest off** removes cached plaintext, and Microsoft’s **attack-surface-reduction** rules can block untrusted access to LSASS outright. Layered together with LSASS process-access auditing, they convert what was once a trivial post-exploitation step into a noisy, well-defended one. The internals matter for defense: you cannot tune the alerts or choose the right hardening without knowing what LSA holds and how it is reached.

## Conclusion

LSA is where identity is minted: it validates logons through pluggable SSPs, binds them into logon sessions keyed by a LUID, issues the tokens the whole system checks, and safeguards the secrets that keep sessions alive. Modern Windows wraps it in Protected Process Light and Credential Guard so that even a highly privileged attacker faces real obstacles rather than an open memory space. Having mapped how authentication and its secrets are structured and defended, the series turns next to how Windows groups and constrains processes at scale — **job objects and server silos**.

## You Might Also Like

This article is part of the Windows Internals series. These related deep-dives cover adjacent parts of the system:

-   [Windows Security Internals: Access Tokens, SIDs, and DACLs](https://blog.yunolay.com/windows-access-tokens-sids-and-dacls/)
-   [Modern Windows Kernel Protections: PatchGuard, DSE, and HVCI](https://blog.yunolay.com/modern-windows-kernel-protections-patchguard-dse-hvci/)
-   [Windows Registry Internals: Hives, Cells, and the Configuration Manager](https://blog.yunolay.com/windows-registry-internals-hives-cells-configuration-manager/)
-   [Windows Services and the Service Control Manager](https://blog.yunolay.com/windows-services-and-the-service-control-manager/)

投稿 [LSA Internals: Authentication, Logon Sessions, and Credential Guard](https://blog.yunolay.com/lsa-internals-authentication-logon-sessions-credential-guard/) は [Yunolay's Blog](https://blog.yunolay.com/) に最初に表示されました。
