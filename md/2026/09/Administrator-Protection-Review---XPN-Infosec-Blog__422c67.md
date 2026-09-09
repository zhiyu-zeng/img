---
title: Administrator Protection Review - XPN Infosec Blog
source: https://blog.xpnsec.com/administrator-protection/
source_host: blog.xpnsec.com
clip_date: 2026-09-09T10:30:22+08:00
trace_id: a6bba967-9cd5-4c98-8b64-dbc52f28571a
content_hash: 3b7406a242f0cd5122f44f43542fe19f945d6d8fb46387a1bd08585d69bc35d6
status: synced
tags:
  - Windows安全
  - UAC绕过
series: null
feed_source: XPN·Adam Chester
ai_summary: Windows 11 管理员保护通过独立管理员账户和取消自动提升来减少 UAC 绕过面，但部分已有绕过技术仍有效，且会形成第三种高完整性令牌状态。
ai_summary_style: key-points
images_status:
  total: 24
  succeeded: 24
  failed_urls: []
notion_page_id: 3d675244-d011-81e6-b23e-fa9086fa7990
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 11 管理员保护通过独立管理员账户和取消自动提升来减少 UAC 绕过面，但部分已有绕过技术仍有效，且会形成第三种高完整性令牌状态。
> 
> - **设计目标：** 管理员保护明确移除 EXE autoelevate 与 COM elevate 后门，用户会看到更多 consent 弹窗，但 Microsoft 称会比 Vista 时代少很多。
> - **影子管理员机制：** 高权限操作在用户首次提权时创建 `admin_<用户名>` 单独账户；SAM 注册表中的 `ShadowAccountBackLink`/`ForwardLinkSid` 将普通用户与影子管理员 SID 关联；LSASS 验证券为 `SYSTEM` 完整性且调用进程必须位于仅含 `Consent.exe` 的白名单，才允许通过 `LogonUserExExW` 生成令牌。
> - **残留绕过：** 现有基于 `LocalAccountTokenFilterPolicy` 的 SMB 与 SSPI 方法仍可生成“用户自身的高完整性令牌”，而非影子管理员令牌，因此当前存在 medium integrity、影子管理员 high integrity、旧式 UAC high integrity 三种令牌状态。
> - **RunOnce 自动提升：** HKLM 下 Run/RunOnce 注册表项仍会被 explorer 通过 `AicProcessRunOnce` 自动提权，前提是攻击者需要管理员权限写入该键，重启登录后即可获得影子管理员 shell。
> - **枚举与风险：** 可通过影子管理员账户是否存在来匿名判断某管理员曾否认证过该主机；若系统允许空密码，则可用影子账户空密码远程认证，但获得的令牌会被过滤。

I started researching Administrator Protection a few months back, but I must admit that I never really believed that it would ever make it to a release build of Windows in its current form.

Then I saw a post on BlueSky announcing that it is in-fact coming to Windows 11, and soon:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ea56580d55c8a2f0.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image1_hu_b2b77bc4c36b0c30.avif)

In this post, I’ll be dumping my research into Windows Administrator Protection. There isn’t anything too groundbreaking here as I only touched this technology on a surface level for tooling compatibility testing, but the hope is that anyone else diving into this area will find the content useful.

**Note: Administrator Protection is still in active development and everything shown in this post is subject to change as this feature develops.**

## What is Admin Protection and Why Not Use UAC?

You can play around with Admin Protection on the canary build of Windows 11. I warn you in advance, you’ll see those elevation prompts more than before! And that’s by design; Microsoft created Administrator Protection to explicitly eliminate UAC backdoors, which means:

-   **No EXE autoelevate backdoors**
-   **No COM elevate backdoors**

These workarounds were implemented as a method of avoiding the UAC elevation prompt from appearing too often after users complained during Vista’s UAC debut. Microsoft has since reversed course by outwardly calling out the increase in elevation prompts in their release post:

> With Administrator protection, auto-elevation is removed. Users will notice an increase in consent prompts, though many fewer than the Vista days as much work has been done to clean up elevation points in most workflows.

So other than the removal of backdoors, what else separates Administrator Protection from UAC?

Well, the big one is that **split tokens are (mostly) gone**. Previously under UAC, there were two distinct token states. An administrative user would have a token in medium integrity with all administrative privileges and security groups stripped away. After the user consents to a UAC prompt (e.g., consent.exe) the system grants a high integrity token that restores all privileges and groups. The caveat here is in the filtering, as both tokens belonged to the same user account. In Admin Protection mode, you now have a completely separate admin account with a prefix of `admin_`. In the case of my Windows system, `xpn` has a corresponding `admin_xpn` account when I need the admin privileges and security groups typically granted to a high integrity token. In the Admin Protection world, this is called a **Shadow Admin account**.

## Existing Research

Before I dig too deep into this, I wanted to give a shoutout to Rudy Ooms at Call4Cloud. When I started looking into Shadow Admin accounts, [his was the first blog post](https://call4cloud.nl/local-administrator-protection-privilege-protection/) that I found and it covered Administrator Protection back in October 2024 in a lot of detail.

The reason that I continued beyond this post was because I wanted to understand the operational limitations and our tooling requirements for engagements (we like to be prepared). But I wanted to make it clear that Rudy’s post set the pace and is recommended reading.

Additionally, Microsoft released a detailed post called “ [Introducing Administrator Protection](https://techcommunity.microsoft.com/blog/microsoft-security-blog/evolving-the-windows-user-model-%E2%80%93-introducing-administrator-protection/4370453) ”.

There are sections from Microsoft’s post where “bypasses” were called out which were bugging me, mainly because I wanted to understand why known vulnerabilities still existed.

The reason that I also reference this is because it actually dives into a lot of details of the new functionality, including gaps in its implementation. Kudos for Microsoft being upfront about their design process.

## What Makes a Shadow Admin Account?

Administrator Protection revolves around the concept of a Shadow Admin account. If we take a look in the service account manager (SAM) hive, we see that the Shadow Admin is just a standard administrator account with a few additional attributes set against it:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/086f854f5d96dad2.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image2_hu_1cdd30d141a62971.avif)

It is actually the `ShadowAccountBackLink` key which links to the security identifier (SID) of the regular user account which determines if an account is classed as a shadow admin or not. Without this key being set, the account is just another admin account and is subject to token filtering.

We can see that this is the case in `samsrv.dll - SamrIsShadowAdminAccount`, which checks if this registry value is present:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a419ed948e11b84.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image3_hu_f82437b981ce68cd.avif)

We can use `samlib.dll - SamiIsShadowAdminAccount` programmatically to determine if a SID is a Shadow Admin account:

```c
typedef NTSYSAPI NTSTATUS(*p_SamIsShadowAdminAccount)(
	PSID sid,
	void* out1,
	void* out2,
	void* out3
	);

void *modHandle = (void*)LoadLibraryA("samlib.dll");

p_SamIsShadowAdminAccount _SamIsShadowAdminAccount;
_SamIsShadowAdminAccount = (p_SamIsShadowAdminAccount)GetProcAddress((HMODULE)modHandle, "SamiIsShadowAdminAccount");
	
if (_SamIsShadowAdminAccount == NULL)
{
	std::cout << "Failed to get address of SamIsShadowAdminAccount\n";
	return 1;
}
	
void* out1 = NULL;
void* out2 = NULL;
void* out3 = NULL;

PSID sid;

// SID to check
if (ConvertStringSidToSidA("S-1-5-21-1524884646-3830121960-1456475082-1003", &sid) == 0) {
	std::cout << "ConvertStringSidToSid failed\n";
	return 1;
}

NTSTATUS status = _SamIsShadowAdminAccount(sid, &out1, &out2, &out3);
if (status != 0) {
	 printf("Cannot find SID\n");
	 return;
}
	
if (out1 != (void*)0) {
	  printf("This is a shadow admin account\n");
} else {
	  printf("Not a shadow admin account\n");
}
```

## How are Shadow Admin Accounts Created?

Shadow Admin accounts are actually created on first use. If we have a user named `build`, then `admin_build` will actually be created upon elevation.

To do this, Rudy Ooms notes that the `ShadowAdmin::CreateShadowAdminAccount` method is called from `samsrv.dll`.

From an RPC perspective, the entry method called is `SamrFindOrCreateShadowAdminAccount` and can be invoked with the `samlib.dll - SamiFindOrCreateShadowAdminAccount` API method:

```c
typedef NTSYSAPI NTSTATUS(*p_SamiFindOrCreateShadowAdminAccount) (
	void* DomainHandle,
	void **out1,
	void** out2
);

void *modHandle = (void*)LoadLibraryA("samlib.dll");

p_SamiFindOrCreateShadowAdminAccount _SamFindOrCreateShadowAdminAccount;
_SamFindOrCreateShadowAdminAccount = (p_SamiFindOrCreateShadowAdminAccount)GetProcAddress((HMODULE)modHandle, "SamiFindOrCreateShadowAdminAccount");
if (_SamFindOrCreateShadowAdminAccount == NULL) {
	return 1;
}

void *modHandle = (void*)LoadLibraryA("samlib.dll");
if (modHandle == NULL) {
	return 1;
}

// SID to create ShadowAdmin account for
if (ConvertStringSidToSidA("S-1-5-21-3889136333-1358944941-3928491093-1001", &sid) == 0) {
	return 1;
}
	
void* arg1 = NULL;
void* arg2 = NULL;
	
NTSTATUS status = _SamFindOrCreateShadowAdminAccount((void*)(sid), &arg1, &arg2);
if (status != 0) {
	printf("SamiFindOrCreateShadowAdminAccount returned: %x\n", status3);
}
```

## How Do Users Get a Shadow Account Token?

As with UAC, `Consent.exe` is responsible for creating an access token for the Shadow Admin account. This is done via `LogonUserExExW`. And, as seen below, no password is passed:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4acfcae6c962a537.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image4_hu_f653b26991ce934c.avif)

From within `lsass.exe`, `lsasrv.dll` is responsible for validating that the `LogonUserExExW` is coming from a permitted process. Within the `LsapCanLogonShadowAdmin` function, a check is first completed to make sure that the incoming request is from a process with a token set to `SYSTEM` integrity.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/853f4e194a1f383b.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image5_hu_7bb2870ac6fc9b8.avif)

Next, the calling process needs to be in a allowlist. This is done in the `LsapIsProcessOnShadowAdminAllowList`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/840069377605ce65.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image6_hu_79a4f6156c12cee6.avif)

At the time of checking, only `Consent.exe` is present in the list. This is a nice set of checks because, if you were `SYSTEM`, you could generate your own access to the `admin_` account.

## How Does LSASS Know Which Shadow Admin Account to Use?

Within the SAM hive, there is a registry value of `ShadowAccountForwardLinkSid` associated with the SID of the Shadow Admin user account.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/456ba8912680c368.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image7_hu_6e3e36f2520e67d8.avif)

The corresponding Shadow Admin account will have a `ShadowAccountBackLinkSid` registry value pointing to the SID of the account.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70d374f7ee2e18e6.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image8_hu_6d83a971413227c9.avif)

As a fun experiment, you can actually update the `ShadowAccountForwardLinkSid` to point to any account Shadow Admin SID. You will need to reboot the system as the SID is cached in the local security authority subsystem service (LSASS); however, upon elevation, you’ll find that elevated processes spawn as another account.

Below we can see this in action, where `build2` spawns an elevated process as `admin_build` as we switch out the SID.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/583d4f8c2e5678b9.gif)

This will only work for other Shadow Admin accounts, as the `LogonUserExExW` uses a blank password.

## Logging In As a Shadow Admin

If the account is determined to be a Shadow Admin, we cannot log in as this account using methods such as `runas /user:admin_test` due to the default blank password requirement.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5d16c7579d6d2bee.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image10_hu_8168fd122d062d7f.avif)

But even if we allow this, we will get an Access Denied warning.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/696f66c41435363e.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image11_hu_fb41f9cf6bd20834.avif)

If we remove the `ShadowAccountBackLinkSid` registry value and enable the ability for passwordless login, we can login fine with a blank password.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e1765f45acb9fb81.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image12_hu_95ab2e3e775955d9.avif)

Obviously, this means that `LogonUserW` will work as:

```c
LogonUser(L"admin_build", L".", L"", LOGON32_LOGON_INTERACTIVE, LOGON32_PROVIDER_DEFAULT, &hToken)
```

## Noted Bypasses – LocalAccountTokenFilterPolicy

There are still bypasses for Admin Protection, as Microsoft noted in their blog post [here](https://techcommunity.microsoft.com/blog/microsoft-security-blog/evolving-the-windows-user-model-%E2%80%93-introducing-administrator-protection/4370453). So, if things are so locked down, why does this work?

The two bypasses Microsoft called out are James Forshaw’s “ [Bypassing UAC in the Most Complex Way Possible](https://www.tiraniddo.dev/2022/03/bypassing-uac-in-most-complex-way.html) ” and SplinterCode’s “ [Bypassing UAC with SSPI Datagram Context](https://splintercod3.blogspot.com/p/bypassing-uac-with-sspi-datagram.html) ” techniques.

These both have one thing in common: they take advantage of `LocalAccountTokenFilterPolicy`.

If we pull apart `lsasrv.dll`, we find the referenced `LsaISetSupplimentalTokenInfo` function referenced in James’ post. This is called by the `msv1_0 - SsprHandleAuthenticationMessage` function upon establishing a connection.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/418b7a54b00eae7e.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image13_hu_bcf6272529501f1e.avif)

This function is responsible for determining if our network access is downgraded to use the medium integrity token.

This area of code doesn’t look like it has been updated with the introduction of Administrator Protection, which means that existing “bypasses” still exist. The reason I put that in quotes is because you actually end up in a state where the token created is just a high integrity token for the user; not the `admin_` shadow admin account.

For example, if we access the `ADMIN$` share using a domain admin account over a remote SMB connection, we see that access is on behalf of the user, not the Shadow Admin account.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7837220c5111495f.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image14_hu_714d830604556338.avif)

Similarly, if we use something like [wmiexec.py](http://wmiexec.py/) to spawn a new process, that process will end up running with High Integrity within its own user account; not as a Shadow Admin account.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/23f51299aad9d54c.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image15_hu_457110890f7f47f6.avif)

So, actually, what we have now are **three states** with the introduction of Administrator Protection:

-   The typical UAC style medium integrity token
-   The `admin_` Shadow Account high integrity token
-   The old UAC type high integrity token

Things will potentially change as this tech evolves, but it answers the question that I had as to why this change didn’t fix those existing vulnerabilities.

## Noted Bypasses – RunOnce

Microsoft also noted RunOnce as an auto-elevate method for Admin Protection.

> It should be noted that not all auto-elevations have been removed. Namely, the Run and RunOnce registry keys found in the HKEY_LOCAL_MACHINE hive will still auto-elevate as needed. Appropriately, these keys are ACL’d such that only an administrator can modify them.

We can see this is the case by adding a new registry key.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2462cc3bbeb5cc14.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image16_hu_d962c5dbcd79dbdd.avif)

On reboot and login, we get a Shadow Admin shell.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da868ec1d63a7972.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image17_hu_6470a53944330fb9.avif)

This works using the existing `RaiProcessRunOnce` RPC method invoked from `explorer.exe` ’s `AicProcessRunOnce`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1ac9054297a283d3.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image18_hu_712c6d9379266bcd.avif)

This RPC method is exposed via `AppInfo` service as it always was in UAC. The parameters passed to this method do not unfortunately influence the command executed, meaning that we would need admin access to write to the `RunOnce` registry key.

## UIAccess Bypasses

As noted in Microsoft’s documentation, UIAccess Bypasses are partially prevented as current “UAC” based UIAccess elevations use auto-elevation of privileged processes before hijacking the UI. If, however, a legitimate app has been elevated, UIAccess can still be used to interact with the Window.

A good example is the [UIAccess DLLHijack](https://github.com/R41N3RZUF477/QuickAssist_UAC_Bypass/tree/main) from R41N3RZUF477. We need to modify the `OskSupport` dynamic-link library (DLL) to send keys, but we see that this works just fine.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ee7c1ae7bf24e3c.gif)

## Fingerprinting Users & Blank Passwords

Shadow Admins give us a shot at anonymously enumerating if an admin has previously authenticated to a host.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2ca52a1c83010d97.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image20_hu_a1c5883c274bfaed.avif)

If the admin user has never authenticated to the host, you’ll just get the regular Access Denied error.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/039754a31408a465.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image21_hu_afb35e9320cdc313.avif)

This, of course, also means that if (for some reason) blank passwords are allowed on the host, then you have the ability to authenticate to the host remotely as the admin account without a password.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/884642013c95ffe7.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image22_hu_7b4a5ea50da3fb42.avif)

For example, if we use `smbclient.py`, we can access the server without a password.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/811b7f673bdc8588.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image23_hu_3a31f13ba2cd3a00.avif)

However, and unfortunately, our token is going to be filtered 😟

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dadb6828b39d63f8.webp)

![](https://blog.xpnsec.com/img/administrator-protection/image24_hu_f7713921890a03dd.avif)

## Reflections and Conclusions

So, what do we have (other than a trail of “out of scope” UAC bypasses now being used to create a feature based off the hard work of researchers)?

Essentially, we have separate Admin accounts now for elevated actions. We also still have a weird scenario in which UAC elevated tokens do exist for admin sessions, but this feels like an unfinished feature at the moment. It will be interesting to see what happens when this rolls out in release.

What will also be interesting is that now files written to the users profile locations such as Desktop, Downloads etc., will belong to separate accounts depending on if the `CreateFile` was completed as an elevated user or not.
