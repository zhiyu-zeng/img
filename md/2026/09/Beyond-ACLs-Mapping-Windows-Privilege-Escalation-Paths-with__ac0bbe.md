---
title: "Beyond ACLs: Mapping Windows Privilege Escalation Paths with"
source: https://www.synacktiv.com/en/publications/beyond-acls-mapping-windows-privilege-escalation-paths-with-bloodhound.html
source_host: www.synacktiv.com
clip_date: 2026-09-16T13:48:56+08:00
trace_id: 8958c345-ce53-44d9-9d7b-f96f0a38dbd7
content_hash: cd85054efa85cf9236eb99d797d725b43b8617c278c70ea246b6970df1bab1e3
status: synced
tags:
  - 漏洞分析
  - Windows逆向
series: null
feed_source: Synacktiv
ai_summary: Windows 特权可绕过 ACL 检查，结合 BloodHound 枚举域内特权与登录权限，即可绘制隐藏的本地提权路径。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3dd75244-d011-81ce-9c36-c46331fdc4d2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Windows 特权可绕过 ACL 检查，结合 BloodHound 枚举域内特权与登录权限，即可绘制隐藏的本地提权路径。
> 
> - **令牌机制：** 访问令牌记录 SID、类型、组与特权；常规访问检查比对令牌与 DACL，但特权可完全绕过（如 SeBackupPrivilege 能读取任意文件）。
> - **高价值特权：** SeDebugPrivilege 可获取任意进程/线程句柄，用于注入 shellcode 或转储 LSASS；SeImpersonatePrivilege 与 SeAssignPrimaryTokenPrivilege 可配合 Potato 家族窃取服务令牌提权。
> - **登录权限：** SeInteractiveLogonRight（本地）、SeRemoteInteractiveLogonRight（RDP）、SeNetworkLogonRight、SeServiceLogonRight、SeBatchLogonRight 决定初始访问；SeDeny* 优先于允许，可阻断 PsExec 等横向移动。
> - **UAC 过滤：** 管理员交互登录时 lsass 生成完整令牌，并经 ntdll!NtFilterToken 产生过滤令牌来启动 explorer.exe，子进程默认继承低权令牌，故枚举特权必须在提权上下文进行。
> - **采集方式：** 解析 GPO 的 GptTmpl.inf（隐蔽、低权限、可能漏配），或经 RPC 调用 LsaEnumerateAccountsWithUserRight 逐机询问 LSA（噪音大、需本机管理员）；两者已随 BloodHound/SharpHound 补丁实现。

Windows privileges are special rights that grant processes the ability to perform sensitive operations. Some privileges allow bypassing standard Access Control List (ACL) checks, which can lead to significant security implications.

While privileges like SeDebugPrivilege, SeImpersonatePrivilege or SeBackupPrivilege are frequently used by attackers to escalate their privileges, it is also possible for defenders to leverage logon rights privileges to limit lateral movement. With our pull requests in BloodHound, SharpHound and SharpHoundCommon, it is now possible to enumerate which privileges and logon rights are assigned to users and machines across the network and thus identify local privilege escalations paths.

## Introduction

Windows Privileges are special rights that grant users the ability to perform sensitive, system-wide operations. In some specific cases, they can even completely override standard Access Control List (ACL) checks.

This post will dive into the architecture of Windows access tokens and their associated privileges, we will also see how [BloodHound](https://github.com/SpecterOps/BloodHound) can be leveraged to map these high-value privileges across an entire domain, revealing hidden pathways to privilege escalation.

## Access Tokens 101

Before diving into privilege escalation vulnerabilities related to Windows privileges, it is important to first understand how access tokens work. If you are already familiar with these concepts, feel free to skip ahead.

Access tokens are Windows objects that describe the **security context** of a process or thread. They are used to represent the identity of a user on a machine, here is a non-exhaustive list of attributes that access tokens have:

-   SID: The unique identifier of the user represented by the token.
-   Type: The type of access token (primary or impersonation).
-   Groups: The groups of the user described by the token.
-   Privileges: The privileges of the user, this is the main field of interest in our case.

Access tokens can easily be inspected using Process Hacker:

![View on an access token using Process Hacker](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6ab2f22bda15a55c.webp)

View on an access token using Process Hacker.

Every time a process or thread tries to access a resource like a file, registry key or any object securable with a DACL, the Windows kernel checks the caller’s access token against the DACL of the object that is being accessed to determine whether to grant or deny access.

A Discretionary Access Control List (DACL) is a type of ACL, an ACL is a windows structure that contains multiple Access Control Entry (ACE). In the context of a DACL, ACEs are used to determine if a principal should be allowed or not to perform an action on an object and work according to the following (simplified) schema:

![Simplified process of access checking on Windows](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb066b837967de38.webp)

Simplified process of access checking on Windows

The other possible type of ACL is called System Access Control List (SACL), it works the same way as a DACL except that its purpose is to log access.

This is how access checking on Windows *usually* works. However, as always, there are exceptions. Such exceptions occur because of Windows privileges, which may allow to completely bypass ACL checks! The implications are detailed in the next section.

## Access Token Privileges

While DACLs determine a user’s rights to interact with an object, privileges operate on a different, more powerful level.

A privilege is a special right granted to an account to perform a sensitive, system-wide operation. Some privileges allow to completely bypass ACL checks.

For example, if a user’s access token includes the **SeBackupPrivilege**, which allows users to backup files and directories, this user will be able to read any file on the system, even if the file’s DACL explicitly denies them access. Windows grants this right to ensure that backup software can function regardless of individual file permissions.

Let us now cover how certain privileges can be maliciously abused to escalate local privileges.

### SeDebugPrivilege

**SeDebugPrivilege** is a good example of a privilege that can be easily abused, as its name suggests it was created to allow the debugging of Windows objects such as processes or threads. Under the hood, this privilege allows its owner to completely bypass checks related to getting a handle onto a process or thread. Thanks to this privilege, you can retrieve a handle onto *any* process or thread. This handle may then be used to perform actions on the process or thread, such as terminate it, read its memory, change its access token, etc.

As you may have guessed, this privilege leaves an attacker with multiple possibilities to elevate their privileges, here is a non-exhaustive list:

-   Write a shellcode to a privileged process’ memory and then create a thread to execute this shellcode. The shellcode will run with the same privileges as the targeted process.
-   Dump LSASS memory and use mimikatz to retrieve credentials.

Another approach could be to retrieve the access token of a process using `advapi32!OpenProcessToken` and then impersonate this token. However, having access to a token object does not mean you can use it. Indeed, token assignment checks are strict and restrictive, denying the described approach. Fortunately, this token assignment check can be bypassed using the `SeImpersonatePrivilege` or `SeAssignPrimaryTokenPrivilege` privilege as demonstrated in the next section.

### SeImpersonatePrivilege & SeAssignPrimaryTokenPrivilege

The `SeImpersonatePrivilege` privilege is perhaps the most (in)famous Windows privilege due to how often it is exploited by attackers to escalate their privileges. Indeed, this privilege is often used by IIS, MSSQL and other Windows services, so when getting Remote Code Execution (RCE) on a windows host through these services, attackers often get this privilege. This privilege allows a thread to impersonate the access token of any user.

However, how can such token be retrieved in the first place? As we have seen, if we have the `SeDebugPrivilege` privilege, we can easily obtain a token using `advapi32!OpenProcessToken`. But what if it is not the case? In such cases, exploits from the Potato family can be used. They usually consist in coercing a privileged process into authenticating to an attacker controlled server and impersonate the privileged process’ token.

The `SeAssignPrimaryTokenPrivilege` privilege works similarly to the `SeImpersonatePrivilege` privilege, but with one minor difference: the type of possible token to use. Indeed, `SeImpersonatePrivilege` allows a thread to temporarily adopt an impersonation token while `SeAssignPrimaryTokenPrivilege` allows for the creation of a new process using a primary token.

> A primary access token is associated with a process and represents the security context of the user running this process, whereas an impersonation access token is used by a thread within a process to temporarily adopt a different security context, typically to access resources on behalf of a client.

There are a lot of more interesting privileges like `SeLoadDriverPrivilege`, `SeBackupPrivilege`, `SeCreateTokenPrivilege`, etc. that can be leveraged for privilege escalation to talk about, but they will not be covered in this article. Instead, let us now talk about logon rights.

### Logon Rights

While privileges determine what a process can do once it is running, logon rights define how a user account is allowed to gain initial access to a computer. These rights are enforced using security policies through the Local Security Authority (LSA). If a user does not have the necessary logon right, the LSA will reject the logon attempt before an access token is even generated, effectively preventing the user from performing any action on the system.

Here is the list of available logon rights and their effect:

-   `SeInteractiveLogonRight`: This right determines which accounts can log on **locally** on a computer.
-   `SeRemoteInteractiveLogonRight`: This right determines which accounts can log on **remotely** using for example the **Remote Desktop Protocol (RDP)**.
-   `SeNetworkLogonRight`: This right is used to allow accessing a computer from the network (e.g. access shares, RPC interfaces).
-   `SeServiceLogonRight`: This allows an account to log on as a service, this is vital for service accounts as it allows them to run as background services. This does not mean the account can create nor start services.
-   `SeBatchLogonRight`: This allows an account to be used by a scheduled task. This does not mean the account can create new scheduled tasks.

On the other hand, all of these rights have their opposite which denies authentication instead (e.g. `SeDenyInteractiveLogonRight`, `SeDenyNetworkLogonRight`, etc.), deny rights have precedence over allow rights.

While these rights cannot be abused, they are important to understand because they define the way you can access systems. Having a good understanding of these rights can be even more impactful for defenders because if well configured, they can help to prevent lateral movement.

For example, in my lab, the user `nioz` is Domain Admin and so should by default be able to access any machine on the network. However, the `SeDenyNetworkLogonRight` privilege has been added to this user on the `pki` machine. This prevents this user from being able to access its SMB shares and RPC and is a really effective way to prevent lateral movement for defenders.

![Local Security Policy configured to prevent the user 'nioz' from logging in from the network](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0cbd69fc82532bb6.webp)

Local Security Policy configured to prevent the user 'nioz' from logging in from the network.

This prevents this account from performing lateral movement techniques such as PsExec because the user can not create the service nor drop a file via SMB.

![User 'nioz' denied from accessing a machine because of insufficient logon rights](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/043adf4057c37d2e.webp)

User 'nioz' denied from accessing a machine because of insufficient logon rights.

### Restricting Privileges via User Account Control (UAC)

User Account Control (UAC) is a well-known Windows feature that is used to enforce the principle of least privilege to processes. Its goal is to ensure that programs run with the minimum permissions they need to function. When a program wants to perform an action that could affect the entire system (such as installing a software or changing a system setting), UAC steps in and asks the user for permission.

Under the hood, when a **privileged** user successfully logs in interactively, the `lsass.exe` process, which was handling the user’s authentication, will create two access tokens for the session.

The first one is a highly privileged token representing the user’s full security context.

On the other hand, the second token, the filtered one, is created by passing the privileged token through the `ntdll!NtFilterToken` function. This call removes sensitive privileges and set administrative SID groups to "Deny only" to create a less privileged access token. This token is then used to create a `explorer.exe` process for the session of the user.

The access token of a `explorer.exe` process can be verified using Process Hacker:

![Token of the explorer.exe process](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1e998e257c77579.webp)

Token of the explorer.exe process

From there, `explorer.exe` will be the parent process of your newly spawned process and as all Windows processes inherit the access token of their parent by default, these will be low privileged too. Thus, when looking for local privilege escalation opportunities, you should always list your token’s privileges in an elevated context. Otherwise, you will always miss impactful privileges.

To create a new process with a highly privileged token, you must “Run the process as Administrator”. From there, the request is handled by the Application Information Service which launches the secure Consent UI desktop and displays the famous UAC prompt. The user must then authorize the action by clicking “Yes” or by providing credentials if configured this way. If authorized, the system retrieves the original, unfiltered access token that was generated at logon and uses it to launch the process.

However, despite the fact that this architecture may look secure, UAC has never really been a problem for attackers as it is subject to a lot of [bypasses](https://github.com/hfiref0x/UACME).

## Collecting privileges

Now that the impacts of privileges and logon rights on Windows environment have been explained, let us see how it is possible to remotely gather these rights. There are two main ways of collecting them and both of these methods have been implemented through this SharpHoundCommon [Pull Request](https://github.com/SpecterOps/SharpHoundCommon/pull/256):

-   Parse domain GPOs and collect privileges from the `GptTmpl.inf` file.
-   Connect to each system remotely via RPC and ask the LSA for each user privilege using for example the `advapi32!LsaEnumerateAccountsWithUserRight` Windows API.

Both methods have advantages and downsides. For instance, connecting remotely to each system is noisy and requires local admin privileges on the machine. On the other hand, parsing GPOs is stealth and only needs a low privileged user. However, you may miss some privileges if they were not applied using GPOs.

### Collecting privileges by parsing GPOs

Collecting privileges by parsing GPOs is relatively easy and can be done with a few LDAP queries. For the sake of this demonstration, we will perform the queries manually with [ldeep](https://github.com/franc-pentest/ldeep), but the process can easily be automated.

The first step is to enumerate the domain’s GPOs and their location.

```bash
$ ldeep ldap -u lowpriv -p [REDACTED] -d lab.local -s ldap://192.168.90.212 search "(objectCategory=groupPolicyContainer)" displayname,gPCFileSysPath
[{
  "displayName": "LocalPrivileges",
  "dn": "CN={61BAD2C5-75EE-425F-A839-7F2C73F9026C},CN=Policies,CN=System,DC=lab,DC=local",
  "gPCFileSysPath": "\\\\lab.local\\SysVol\\lab.local\\Policies\\{61BAD2C5-75EE-425F-A839-7F2C73F9026C}"
},
{
  "displayName": "Default Domain Controllers Policy",
  "dn": "CN={6AC1786C-016F-11D2-945F-00C04fB984F9},CN=Policies,CN=System,DC=lab,DC=local",
  "gPCFileSysPath": "\\\\lab.local\\sysvol\\lab.local\\Policies\\{6AC1786C-016F-11D2-945F-00C04fB984F9}"
},
{
  "displayName": "Default Domain Policy",
  "dn": "CN={31B2F340-016D-11D2-945F-00C04FB984F9},CN=Policies,CN=System,DC=lab,DC=local",
  "gPCFileSysPath": "\\\\lab.local\\sysvol\\lab.local\\Policies\\{31B2F340-016D-11D2-945F-00C04FB984F9}"
}]
```

Once the base location of GPOs is known, it is possible to query each GPO `GptTmpl.inf` file and check if some privileges are defined within. This file is located in the `\\dc01.lab.local\SYSVOL\lab.local\Policies\{61BAD2C5-75EE-425F-A839-7F2C73F9026C}\MACHINE\Microsoft\Windows NT\SecEdit` folder.

```bash
$ smbclient.py lab.local/lowpriv:[REDACTED]@192.168.90.212
# cd lab.local\Policies\{61BAD2C5-75EE-425F-A839-7F2C73F9026C}\MACHINE\Microsoft\Windows NT\SecEdit\
# cat GptTmpl.inf
[Unicode]
Unicode=yes
[Registry Values]
MACHINE\System\CurrentControlSet\Services\NTDS\Parameters\LDAPServerIntegrity=4,1
MACHINE\System\CurrentControlSet\Services\Netlogon\Parameters\RequireSignOrSeal=4,1
MACHINE\System\CurrentControlSet\Services\LanManServer\Parameters\RequireSecuritySignature=4,1
MACHINE\System\CurrentControlSet\Services\LanManServer\Parameters\EnableSecuritySignature=4,1
[Privilege Rights]
SeAssignPrimaryTokenPrivilege = *S-1-5-20,*S-1-5-19
SeAuditPrivilege = *S-1-5-20,*S-1-5-19
SeBackupPrivilege = *S-1-5-32-549,*S-1-5-32-551,*S-1-5-32-544
SeBatchLogonRight = *S-1-5-32-559,*S-1-5-32-551,*S-1-5-32-544
SeChangeNotifyPrivilege = *S-1-5-32-554,*S-1-5-11,*S-1-5-32-544,*S-1-5-20,*S-1-5-19,*S-1-1-0
SeCreatePagefilePrivilege = *S-1-5-32-544
SeDebugPrivilege = *S-1-5-32-544
SeIncreaseBasePriorityPrivilege = *S-1-5-90-0,*S-1-5-32-544
SeIncreaseQuotaPrivilege = *S-1-5-32-544,*S-1-5-20,*S-1-5-19
SeInteractiveLogonRight = *S-1-5-9,*S-1-5-32-550,*S-1-5-32-549,*S-1-5-32-548,*S-1-5-32-551,*S-1-5-32-544
SeLoadDriverPrivilege = *S-1-5-32-550,*S-1-5-32-544
SeMachineAccountPrivilege = *S-1-5-11
SeNetworkLogonRight = *S-1-5-32-554,*S-1-5-9,*S-1-5-11,*S-1-5-32-544,*S-1-1-0
SeProfileSingleProcessPrivilege = *S-1-5-32-544
SeRemoteShutdownPrivilege = *S-1-5-32-549,*S-1-5-32-544
SeRestorePrivilege = *S-1-5-32-549,*S-1-5-32-551,*S-1-5-32-544
SeSecurityPrivilege = *S-1-5-32-544
SeShutdownPrivilege = *S-1-5-32-550,*S-1-5-32-549,*S-1-5-32-551,*S-1-5-32-544
SeSystemEnvironmentPrivilege = *S-1-5-32-544
SeSystemProfilePrivilege = *S-1-5-80-3139157870-2983391045-3678747466-658725712-1809340420,*S-1-5-32-544
SeSystemTimePrivilege = *S-1-5-32-549,*S-1-5-32-544,*S-1-5-19
SeTakeOwnershipPrivilege = *S-1-5-32-544
SeUndockPrivilege = *S-1-5-32-544
SeEnableDelegationPrivilege = *S-1-5-32-544
[Version]
signature="$CHICAGO$"
Revision=1
```

As you can see the `LocalPrivileges` GPO has a `GptTmpl.inf` file, this might not be the case of all GPOs. This file is a **Security Configuration File** and so is composed of sections and key pairs. The sections defined within this file may vary but in the context of this article, only the **Privilege Rights** section is interesting and is self-explanatory: privilege names are mapped to a comma separated list of Security Identifiers (SIDs).

The next step is to query Organizational Units’ `gPLink` property to know to which OUs are the GPOs mapped to.

```bash
$ ldeep ldap -u lowpriv -p [REDACTED] -d lab.local -s ldap://192.168.90.212 search "(&(objectCategory=organizationalUnit)(gPLink=*))" gPLink
[{
  "dn": "OU=AmazingComputers,DC=lab,DC=local",
  "gPLink": "[LDAP://cn={61BAD2C5-75EE-425F-A839-7F2C73F9026C},cn=policies,cn=system,DC=lab,DC=local;0]"
},
{
  "dn": "OU=Domain Controllers,DC=lab,DC=local",
  "gPLink": "[LDAP://CN={6AC1786C-016F-11D2-945F-00C04fB984F9},CN=Policies,CN=System,DC=lab,DC=local;0]"
}]
```

In our case, we can see that the `LocalPrivileges` GPO is linked to the `AmazingComputers` Organizational Unit. Finally, we can list the computers of this OU:

```bash
$ ldeep ldap -u lowpriv -p [REDACTED] -d lab.local -s ldap://192.168.90.212 -b "OU=AmazingComputers,DC=lab,DC=local" search "(objectCategory=computer)" sAMAccountName
[{
  "dn": "CN=SCCM,OU=AmazingComputers,DC=lab,DC=local",
  "sAMAccountName": "SCCM$"
},
{
  "dn": "CN=PKI,OU=AmazingComputers,DC=lab,DC=local",
  "sAMAccountName": "PKI$"
}]
```

By iterating this process over all GPOs, we will be aware of the privileges applied to principals on machines.

### Connect to each system remotely to map local privileges

The other reliable way to map local privileges is to connect directly to the machines and ask the LSA. This can be done through the following function over RPC:

```c
NTSTATUS LsaEnumerateAccountsWithUserRight(
  LSA_HANDLE          PolicyHandle,
  PLSA_UNICODE_STRING UserRight,
  PVOID               *Buffer,
  PULONG              CountReturned
);
```

This function requires a handle onto a Local Security Policy object and will return users that have the queried privilege. Thus, to enumerate all users with local privileges on a machine you must loop through a list of privileges and call this function multiple times.

## Manipulating privileges using BloodHound

Let us now see a real world example on how BloodHound can be used to enumerate privileges and then abuse them.

As can be seen below, the `synacktiv` user has the `SeBackupPrivilege` privilege and the `CanRDP` right on the `PKI.LAB.LOCAL` and `SCCM.LAB.LOCAL` machines. As the `SeBackupPrivilege` privilege allows its owner to read any file or hive from the registry, it can be exploited to gain administrative privileges on a machine by reading sensitive hives such as the `SAM` and `SYSTEM` hives. In our scenario, we will first access the machine using `RDP` and then perform a backup of the `SAM` and `SYSTEM` hives to get the local administrator’s NT hash.

!['Synacktiv' user rights over lab machines](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1815cc4c89e5daf0.webp)

'Synacktiv' user rights over lab machines

The first step is to connect to the machine using RDP:

![RDP window to connect to PKI.LAB.LOCAL](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fa68c3fc6499189a.webp)

RDP window to connect to PKI.LAB.LOCAL

Once this is done, launch an elevated PowerShell instance (otherwise your access token will not have `SeBackupPrivilege`).

![Extracting sensitives hives from Windows](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/361c43ad218e361f.webp)

Extracting sensitives hives from Windows

Then, transfer the hives to your attacker system and use `secretsdumps.py` to parse them:

![Local secrets extraction from the SAM and SECURITY hives](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/964eaf2fc60d9be9.webp)

Local secrets extraction from the SAM and SECURITY hives.

## Conclusion

In this post, we explained the inner workings of Windows access tokens and explored how specific privileges fundamentally alter a user’s security context, allowing them to bypass traditional ACL restrictions.

On the other hand, logon rights can be equally useful to defenders. Indeed, by carefully controlling these, organizations can dramatically decrease the chances of an attacker’s pivoting through their internal Active Directory infrastructure. Our bloodhound [Pull Request](https://www.synacktiv.com/en/publications/beyond-acls-mapping-windows-privilege-escalation-paths-with-bloodhound#https://github.com/SpecterOps/BloodHound/pull/1999) allows both attackers and defenders to identify local privilege escalation opportunities through Windows privileges and see the associated attack paths.
