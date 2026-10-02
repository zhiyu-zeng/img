---
title: Hyper-V Research | r0keb
source: https://r0keb.github.io/posts/Hyper-V-Research/
source_host: r0keb.github.io
clip_date: 2026-10-02T10:15:48+08:00
trace_id: 68febb41-538e-43ab-a0ee-4372da67a7c3
content_hash: dcbe698ae51e35ba963e10cbb09dcaf8d84cbfc152e5e782fd24c13f65faf105
status: synced
tags:
  - Windows逆向
  - 内核
series: null
feed_source: r0keb·Windows内核/虚拟化
ai_summary: Hyper-V 是微软 Type-1 虚拟机监控器，由 hvloader.dll 加载 hvix64.sys，为 VBS、HVCI 提供根基并划分 VTL 隔离层。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3ed75244-d011-81e2-8597-c12b2144c5de
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Hyper-V 是微软 Type-1 虚拟机监控器，由 hvloader.dll 加载 hvix64.sys，为 VBS、HVCI 提供根基并划分 VTL 隔离层。
> 
> - **类型区分：** Type 1 裸机虚拟化层（Ring -1，权限高于内核），Type 2 通常跑在 Ring 0 的 `.sys`。
> - **加载两阶段：** hvloader 先用 CPUID 识别厂商与 VMX 支持，再按平台选 `Hvix64/Hvax64/Hvaa64.exe`；阶段一建虚拟化程序页表，阶段二在 Winload 末期禁用中断与分页，经 `HvlpTransferToHypervisorViaTransitionSpace` 在 1MB 下切换到独立地址空间。
> - **关键调用链：** `OslpMain` → `OslPrepareTarget` → `OslArchHypervisorSetup` → `HvlpLoadHvLoader`（动态解析 HvlLoadHypervisor 等导出）→ `HvlpLoadHypervisor`。
> - **VTL 分级：** VTL admin（hvix64.sys，全控 RAM/EPT）、VTL 0（ntoskrnl.exe 及驱动）、VTL 1（securekernel.exe + skci.dll，承载 HVCI 与 Credential Guard），VTL 1 内存受 EPT 保护且对内核不可见。
> - **hypercall 机制：** `ShvlpInitializeHypercallSupport` 写 MSR 0x40000000/0x40000001 启用并映射调用页，`HvcallCodeVa` 即调用入口；`ShvlNotifyLongSpinWait` 以调用号 0x10008 发起。

Good morning! In today’s blog I’m going to introduce one of my favorite topics in all of computer science, programming, and low-level computing, hypervisors. In this case, the Windows hypervisor, Hyper-V. We’ll see how it works, its logic, its adaptation to cybersecurity, VBS, and we’ll reverse-engineer some functions.

## Hypervisors

Let’s start by making the distinction between two types of hypervisors:

-   Type 1: which is a bare-metal hypervisor, a sort of Ring -1 program that runs with higher privilege than the OS kernel.
-   Type 2: it usually runs in Ring 0, having the same privilege as the OS kernel, so in Windows it could be a `.sys` PE file.

Let’s move on to what we’re interested in: the Windows hypervisor and where VBS, HVCI, and kCFG are built upon.

### Hyper-V

As I said, Hyper-V is Microsoft’s hypervisor, and it is the foundation for Virtualization Based Security (**VBS**), which has many technologies under its cloak.

One of the strongest mitigations is HVCI, which cannot run without the hypervisor enabled.

Now, let’s see it schematically: [![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b8b242d341d96b18.png)](https://r0keb.github.io/imgs/blog/9HyperVResearch/20250805191759.png)

The “parent” (therefore the one with the highest privileges) in the architecture is the hypervisor, which is initialized by `Hvloader.dll`. This module loads and starts Hyper-V and the **Secure Kernel**. Its first task is to detect the version of the hypervisor it will load. It does so by selecting the appropriate **`Hv*64.exe`** file:

-   `Hvix64.exe` – Intel Systems.
-   `Hvax64.exe` – AMD Systems.
-   `Hvaa64.exe` – ARM64 Systems.

Next, it parses the VSM policy and loads `securekernel.exe`.  
The hypervisor is loaded in two phases. The first begins in `Winload.exe` right after the initialization of the NT Loader Block. The **`HvLoader`** (which we’ll look at shortly) detects the target platform thanks to the `CPUID` assembly instruction.

#### CPUID

**Brief aside**  
The `CPUID` instruction belongs to the x86 instruction set, and depending on the value of the registers at execution time, it will return different results. All of them are related to information about the architecture or CPU. It has many functionalities, so many that I won’t list them all here but you can find the complete glossary on this [web page](https://www.felixcloutier.com/x86/cpuid).  
What I would like to do is give an example of retrieving information with `CPUID`:

```cpp
...
BOOL HardwareComp() {

    CpuComp();

    printf("\n[CPU String] -> %s\n", SysType);

    if (strcmp(SysType, "GenuineIntel") != 0) {
        printf("\n[ERROR CPU NOT COMPATIBLE]\n");
        return FALSE;
    }

    printf("\nChecking if it is VMX Enable...\n");

    if (VmxEnComp() == 1) {
        printf("[TRUE]\n");
    }
    else {
        printf("[FALSE]\n");
        getchar();
        return FALSE;
    }

    return TRUE;
}
...
```

This is the wrapper for the assembly functions **`CpuComp()`** and **`VmxEnComp()`**:

```nasm
...
    ; When called with EAX = 0, CPUID returns the vendor
    ; ID string in EBX, EDX and ECX.Writing these to memory
    ; in this order results in a 12 - character string

    ;       MSB         LSB
    ; EBX = 'u' 'n' 'e' 'G'
    ; EDX = 'I' 'e' 'n' 'i'
    ; ECX = 'l' 'e' 't' 'n'

    CpuComp proc

        xor eax, eax
        cpuid

        mov eax, ebx

        mov SysType[0], al
        mov SysType[1], ah

        
        shr eax, 16
        
        mov SysType[2], al
        mov SysType[3], ah

        
        mov eax, edx

        mov SysType[4], al
        mov SysType[5], ah
        
        shr eax, 16

        mov SysType[6], al
        mov SysType[7], ah    
        

        mov eax, ecx

        mov SysType[8], al
        mov SysType[9], ah
        
        shr eax, 16

        mov SysType[10], al
        mov SysType[11], ah
        mov SysType[12], 00h

        ret

    CpuComp endp
...
```

Now, the next function is not as easy to understand at first glance:

```nasm
...
    VmxEnComp proc

        xor eax, eax
        inc eax

        cpuid

        mov eax, ecx
        bt eax, 5
        jc TrueVmxEn
        xor eax, eax

        exit:
            ret

        TrueVmxEn:
            nop
            xor eax, eax
            inc eax
            jmp exit

    VmxEnComp endp
...
```

But if we look at the table of return values for `CPUID` when `eax` = 1, we’ll see the following:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b4a86dd7c83e99a3.png)](https://r0keb.github.io/imgs/blog/9HyperVResearch/20250805203105.png)

`A value of 1 indicates that the processor supports this technology.`

Which is exactly what we’d like to know, if it supports VMX instruction set.

Now that we’ve briefly covered `CPUID`, we can continue.

### Hyper-V loader

After the **`HvLoader`** detects the target platform via the `CPUID` assembly instruction, it copies the UEFI physical memory map. Then, the **`HvLoader`** loads the corresponding hypervisor version (PE file) into memory and checks that everything is in order. There are two phases:

-   In phase 1, the hypervisor page table hierarchy is built, containing only the mapping of the hypervisor image.
-   Phase 2 starts during the final stages of Winload, when UEFI firmware boot services are discarded. At this point, **`HvLoader`** copies the physical address range of UEFI Runtime Services into the hypervisor loader block, captures the processor state, disables interrupts, the debugger \[:(\], and paging. Then it calls **`HvlpTransferToHypervisorViaTransitionSpace`** to transfer the execution flow to below the 1MB mark. The code located in that megabyte can change the page tables, re-enable paging, and switch to the hypervisor code, effectively creating two distinct address spaces. Once the hypervisor starts, it uses the previously saved processor context to redirect execution back to Winload. In other words, we have just turned the initializing Windows instance into a VM with this sequence.

That said, let’s reverse-engineer some `winload.exe` functions I found interesting.

To avoid shooting in the dark, we’ll start from the **`OslpMain()`** function:

```cpp
__int64 __fastcall OslpMain(_DWORD *a1)
{
  int v2; // eax
  __int64 v3; // rcx
  __int64 v4; // rdx
  unsigned int v5; // edx
  __int16 Buf1; // [rsp+50h] [rbp-B0h] BYREF
  char v8; // [rsp+52h] [rbp-AEh]
  __int128 v9; // [rsp+53h] [rbp-ADh] BYREF
  char v10[2608]; // [rsp+70h] [rbp-90h] BYREF
  char v11; // [rsp+AB8h] [rbp+9B8h] BYREF

  v11 = 0;
  memset(v10, 0, sizeof(v10));
  if ( (unsigned int)((__int64 (__fastcall *)(char *, __int64 (__fastcall **)(), void *, __int64))SymCryptGcmExpandKey)(
                       v10,
                       SymCryptAesBlockCipher_Fast,
                       &SymCryptTestKey32,
                       16i64) )
    ((void (__fastcall __noreturn *)(_QWORD))SymCryptFatal)('gcm0');
  SymCryptGcmEncrypt(
    (unsigned int)v10,
    (unsigned int)&unk_18018FD08,
    12i64,
    0i64,
    0,
    (int)&SymCryptTestMsg3,
    (char *)&Buf1,
    3,
    &v9);
  if ( memcmp(&Buf1, &unk_18018F588, 0x13ui64) )
    ((void (__fastcall __noreturn *)(_QWORD))SymCryptFatal)('gcm1');
  if ( (unsigned int)((__int64 (__fastcall *)(unsigned int, unsigned int, int, _DWORD, _DWORD, __int64, __int64, int, __int64))SymCryptGcmDecrypt)(
                       (unsigned int)v10,
                       (unsigned int)&unk_18018FD08,
                       12,
                       0,
                       0,
                       (__int64)&Buf1,
                       (__int64)&Buf1,
                       3,
                       (__int64)&v9)
    || Buf1 != SymCryptTestMsg3
    || v8 != 99 )
  {
    ((void (__fastcall __noreturn *)(_QWORD))SymCryptFatal)('gcm2');
  }
  v2 = OslPrepareTarget(a1, &v11);
  v4 = (unsigned int)v2;
  if ( v2 >= 0 && v11 )
    v4 = (unsigned int)((__int64 (__fastcall *)(__int64, _QWORD))OslExecuteTransition)(v3, (unsigned int)v2);
  ((void (__fastcall *)(__int64, __int64))OslVsmScrubSecrets)(v3, v4);
  return v5;
}
```

This function performs some encryption and decryption operations, then transitions the system and clears test data using **`OslVsmScrubSecrets`**, which essentially zeroes out memory, as shown here:

```cpp
void *OslVsmScrubSecrets()
{
  void *result; // rax
  unsigned int *v1; // rdi

  result = OslContext;
  v1 = (unsigned int *)*((_QWORD *)OslContext + 21);
  if ( v1 )
  {
    result = 0i64;
    memset(v1, 0, *v1);
  }
  if ( OslVsmTpmBindingInfo )
  {
    result = 0i64;
    memset(OslVsmTpmBindingInfo, 0, *(unsigned int *)OslVsmTpmBindingInfo);
  }
  if ( OslVsmHvCrashDumpEncryptionKey )
  {
    result = 0i64;
    memset(OslVsmHvCrashDumpEncryptionKey, 0, *(unsigned int *)OslVsmHvCrashDumpEncryptionKey);
  }
  if ( OslVsmSkCrashDumpEncryptionKey )
  {
    result = 0i64;
    memset(OslVsmSkCrashDumpEncryptionKey, 0, *(unsigned int *)OslVsmSkCrashDumpEncryptionKey);
  }
  if ( OslVsmCrashDumpEncryptionKeyUse )
  {
    result = 0i64;
    memset(OslVsmCrashDumpEncryptionKeyUse, 0, *(unsigned int *)OslVsmCrashDumpEncryptionKeyUse);
  }
  return result;
}
```

But what really interests us is the call to **`OslPrepareTarget()`**, a rather large function that, as we see below, calls **`OslArchHypervisorSetup`**:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/16656108504ff754.png)](https://r0keb.github.io/imgs/blog/9HyperVResearch/20250805212403.png)

#### OslArchHypervisorSetup

This is a small function that, as its name implies, handles hypervisor setup:

```cpp
__int64 __fastcall OslArchHypervisorSetup(int a1, __int64 a2, unsigned int a3, unsigned int a4)
{
  __int64 v7; // rdx
  int HypervisorLaunchType; // edi
  __int64 v9; // r8
  signed int HvLoader; // eax
  __int64 v11; // rdx
  __int64 v12; // rcx
  __int64 v13; // rbx
  __int64 v14; // rcx
  int v15; // eax
  __int64 v17; // [rsp+20h] [rbp-288h] BYREF
  __int64 v18[78]; // [rsp+30h] [rbp-278h] BYREF

  v17 = 0i64;
  if ( a1 )
  {
    HypervisorLaunchType = 0;
    if ( byte_1801ADCA7 )
    {
      memset(v18, 0, 0x26Cui64);
      v13 = *(_QWORD *)(a2 + 0xF0) + 0x9C8i64;
      ((void (__fastcall *)(_QWORD, __int64 *))qword_1801ADCE0)(0i64, v18);
      v14 = v18[1];
      *(_QWORD *)(v13 + 0x18) = v18[2];
      *(_QWORD *)(v13 + 0x20) = v18[3];
      v15 = v18[0];
      *(_DWORD *)(v13 + 4) = v18[0];
      *(_DWORD *)v13 = v15;
      *(_QWORD *)(v13 + 0x10) = v14;
      *(_QWORD *)(v13 + 8) = v14;
    }
  }
  else
  {
    HypervisorLaunchType = OslGetHypervisorLaunchType(&v17);
    if ( HypervisorLaunchType >= 0 )
    {
      if ( v17 )
      {
        LOBYTE(v9) = 4;
        byte_1801ADCBC = 1;
        HvLoader = HvlpLoadHvLoader(a3, v7, v9);
        HypervisorLaunchType = HvLoader;
        if ( HvLoader < 0 )
        {
          BlLogDiagWrite(0x40300058u, HvLoader);
        }
        else
        {
          HypervisorLaunchType = HvlpLoadHypervisor(a3, a2, a4);
          if ( HypervisorLaunchType >= 0 )
          {
            byte_1801ADCA7 = 1;
            BlSiHandleHypervisorLaunchEvent(v12, v11);
          }
        }
      }
      else
      {
        return 0xC0000001;
      }
    }
  }
  return (unsigned int)HypervisorLaunchType;
}
```

#### OslGetHypervisorLaunchType

The first function called is **`OslGetHypervisorLaunchType()`**, which is quite interesting because it reveals several things:

```cpp
__int64 __fastcall OslGetHypervisorLaunchType(_QWORD *a1)
{
  int BootOptionInteger; // edi

  BootOptionInteger = 0;
  if ( (BlVsmpSystemPolicy & 0x1000000000000i64) != 0 )
  {
    *a1 = 2i64;
  }
  else
  {
    *a1 = 0i64;
    if ( (int)BlGetBootOptionInteger((__int64)qword_1801E2CB8, 620757120i64) < 0 )
    {
      BootOptionInteger = BlGetBootOptionInteger((__int64)qword_1801E2CB8, 620757232i64);
      if ( BootOptionInteger >= 0 && *a1 == 1i64 )
      {
        HviGetHypervisorFeatures();
        *a1 = 2i64;
      }
    }
    else
    {
      return 0xC0000001;
    }
  }
  return (unsigned int)BootOptionInteger;
}
```

As we see, it calls **`HviGetHypervisorFeatures`**, a function that performs checks with `CPUID` using `rax` = 3, which, as stated in the earlier link:

> `EAX Reserved. EBX Reserved. ECX Bits 00-31 of 96-bit processor serial number. (Available in Pentium III processor only; otherwise, the value in this register is reserved.) EDX Bits 32-63 of 96-bit processor serial number. (Available in Pentium III processor only; otherwise, the value in this register is reserved.) **NOTES:** Processor serial number (PSN) is not supported in the Pentium 4 processor or later. On all models, use the PSN flag (returned using CPUID) to check for PSN support before accessing the feature.`

```cpp
void HviGetHypervisorFeatures()
{
  _DWORD *v0; // r10
  char v1; // al
  __int64 _RAX; // rax
  __int64 _RAX; // rax
  __int64 _RDX; // rdx
  __int64 _RCX; // rcx
  __int64 _RBX; // rbx

  HviIsHypervisorMicrosoftCompatible();
  if ( v1 )
  {
    _RAX = 0x40000003i64;
    __asm { cpuid }
    *v0 = _RAX;
    v0[1] = _RBX;
    v0[2] = _RCX;
    v0[3] = _RDX;
  }
  else
  {
    *(_QWORD *)v0 = 0i64;
    *((_QWORD *)v0 + 1) = 0i64;
  }
}
```

But even more interesting is **`HviIsHypervisorMicrosoftCompatible`**

```cpp
void HviIsHypervisorMicrosoftCompatible()
{
  char v0; // al
  __int64 _RAX; // rax

  HviIsAnyHypervisorPresent();
  if ( v0 )
  {
    _RAX = 0x40000001i64;
    __asm { cpuid }
  }
  _report_securityfailure();
}
```

Which in turn calls **`HviIsAnyHypervisorPresent`**

```cpp
void HviIsAnyHypervisorPresent()
{
  __int64 _RAX; // rax
  __int64 _RCX; // rcx
  __int64 _RAX; // rax

  _RAX = 1i64;
  __asm { cpuid }
  if ( (int)_RCX < 0 )
  {
    _RAX = 0x40000001i64;
    __asm { cpuid }
  }
  _report_securityfailure();
}
```

All these functions ensure the proper features are present via `CPUID`, as we saw earlier, since you can’t just execute code blindly. Programs are like blind androids, you can’t expect them to “see” for you. They just execute, read, and write, but never truly perceive (for now).

#### HvlpLoadHvLoader

The next function we’ll take a closer look at is **`HvlpLoadHvLoader`**, which loads the loader:

```cpp
__int64 __fastcall HvlpLoadHvLoader(unsigned int a1, __int64 a2, __int64 a3)
{
  __int64 ExportedRoutineByName; // rbx
  char v4; // si
  int HvLoaderDll; // edi

  ExportedRoutineByName = 0i64;
  v4 = a3;
  if ( (a3 & 4) != 0 )
  {
    HvLoaderDll = ((__int64 (*)(void))HvlpLoadHvLoaderDll)();
    if ( HvLoaderDll < 0 )
      return (unsigned int)HvLoaderDll;
    v4 &= 0xFBu;
  }
  LOBYTE(a3) = v4;
  HvLoaderDll = HvlpLoadHvLoaderDll(a1, a2, a3);
  if ( HvLoaderDll >= 0 )
  {
    if ( (v4 & 1) == 0 )
    {
      if ( qword_1801ADCD8 )
      {
        qword_1801ADD00 = RtlFindExportedRoutineByName(qword_1801ADCD8, "HvlRescindVsm");
        if ( qword_1801ADD00 )
        {
          if ( qword_1801ADCD8 )
          {
            qword_1801ADCE0 = RtlFindExportedRoutineByName(qword_1801ADCD8, "HvlLaunchHypervisor");
            if ( qword_1801ADCE0 )
            {
              if ( qword_1801ADCD8 )
              {
                qword_1801ADCF8 = RtlFindExportedRoutineByName(qword_1801ADCD8, "HvlLoadHypervisor");
                if ( qword_1801ADCF8 )
                {
                  if ( qword_1801ADCD8 )
                  {
                    qword_1801ADCE8 = RtlFindExportedRoutineByName(qword_1801ADCD8, "HvlRegisterRuntimeRange");
                    if ( qword_1801ADCE8 )
                    {
                      if ( qword_1801ADCD8 )
                      {
                        qword_1801ADD08 = RtlFindExportedRoutineByName(qword_1801ADCD8, "HvlExchangeDispatchInterface");
                        if ( qword_1801ADD08 )
                          return (unsigned int)HvLoaderDll;
                      }
                      else
                      {
                        qword_1801ADD08 = 0i64;
                      }
                    }
                  }
                  else
                  {
                    qword_1801ADCE8 = 0i64;
                  }
                }
              }
              else
              {
                qword_1801ADCF8 = 0i64;
              }
            }
          }
          else
          {
            qword_1801ADCE0 = 0i64;
          }
        }
      }
      else
      {
        qword_1801ADD00 = 0i64;
      }
      return 0xC000007A;
    }
    if ( qword_1801ADCD8 )
      ExportedRoutineByName = RtlFindExportedRoutineByName(qword_1801ADCD8, "HvlPreloadHypervisor");
    qword_1801ADCF0 = ExportedRoutineByName;
    return ExportedRoutineByName == 0 ? 0xC000007A : 0;
  }
  return (unsigned int)HvLoaderDll;
}
```

As we see, this function calls **`HvlpLoadHvLoaderDll`**, which we’ll check shortly. For the rest, it obtains the routines `HvlRescindVsm`, `HvlLaunchHypervisor`, `HvlLoadHypervisor`, `HvlRegisterRuntimeRange` and `HvlExchangeDispatchInterface` at execution time.

```cpp
__int64 __fastcall HvlpLoadHvLoaderDll(unsigned int a1, __int64 a2, char a3)
{
  wchar_t *Buffer; // rbx
  char v6; // di
  unsigned int v8; // esi
  UNICODE_STRING UnicodeString; // [rsp+40h] [rbp-20h] BYREF
  UNICODE_STRING v10; // [rsp+50h] [rbp-10h] BYREF
  __int64 v11; // [rsp+98h] [rbp+38h] BYREF

  v11 = 0i64;
  Buffer = 0i64;
  v10.Buffer = 0i64;
  *(_QWORD *)&UnicodeString.Length = 0i64;
  *(_QWORD *)&v10.Length = 0i64;
  UnicodeString.Buffer = 0i64;
  v6 = a3 & 4;
  if ( (a3 & 4) != 0 )
  {
    if ( (unsigned int)OslArchDetectUpdateLibrary(&v10, 1) == 0xC00000BB )
      goto LABEL_11;
    Buffer = v10.Buffer;
  }
  if ( !BlAppendUnicodeToString(&UnicodeString, OslSystemRoot) )
  {
    LODWORD(Buffer) = 0xC0000001;
    goto LABEL_6;
  }
  if ( !v6 )
  {
    if ( BlAppendUnicodeToString(&UnicodeString, L"system32\\hvloader.dll") )
    {
      v8 = 0x208070;
      goto LABEL_19;
    }
LABEL_17:
    LODWORD(Buffer) = 0xC0000001;
    goto LABEL_11;
  }
  if ( !BlAppendUnicodeToString(&UnicodeString, L"system32\\") || !BlAppendUnicodeToString(&UnicodeString, Buffer) )
    goto LABEL_17;
  v8 = 0x8070;
LABEL_19:
  if ( (a3 & 1) == 0
    || (LODWORD(Buffer) = BlLdrPreloadImage(a1, UnicodeString.Buffer, 0i64, 0i64, 0, 0i64, 0i64), (int)Buffer >= 0) )
  {
    if ( (a3 & 2) != 0 )
    {
      LODWORD(Buffer) = 0xC000007A;
    }
    else
    {
      LODWORD(Buffer) = BlLdrLoadDll(a1, UnicodeString.Buffer, v8, &v11);
      if ( (int)Buffer >= 0 )
      {
        if ( v6 )
          HvlpSecureFirmwareDllBase = v11;
        else
          qword_1801ADCD8 = v11;
        goto LABEL_11;
      }
    }
  }
LABEL_6:
  if ( v6 && ((_DWORD)Buffer == 0xC000000F || (_DWORD)Buffer == 0xC0000428 || (_DWORD)Buffer == 0xC0000605) )
    LODWORD(Buffer) = 0;
LABEL_11:
  RtlFreeAnsiString(&UnicodeString);
  RtlFreeAnsiString(&v10);
  return (unsigned int)Buffer;
}
```

#### HvlpLoadHypervisor

```cpp
__int64 __fastcall HvlpLoadHypervisor(unsigned int a1, __int64 a2, unsigned int a3)
{
  int appended; // edi
  unsigned int v6; // edx
  _QWORD *v7; // rax
  _QWORD *v8; // rcx
  int v9; // eax
  unsigned int v10; // eax
  __int64 v11; // rdx
  int v12; // edx
  __int64 v14[3]; // [rsp+38h] [rbp-D0h] BYREF
  __int128 v15; // [rsp+50h] [rbp-B8h]
  __int64 v16; // [rsp+60h] [rbp-A8h] BYREF
  const wchar_t *v17; // [rsp+68h] [rbp-A0h]
  __int64 v18[78]; // [rsp+78h] [rbp-90h] BYREF
  wchar_t Dst[256]; // [rsp+2E8h] [rbp+1E0h] BYREF

  *(_QWORD *)&v15 = 0i64;
  DWORD2(v15) = 0;
  v17 = 0i64;
  HIDWORD(v14[0]) = 0;
  HIDWORD(v18[0]) = 0;
  if ( (int)OslHiveFindSkuType(a3, (__int64)&v16) >= 0 )
  {
    appended = BlAppendBootOptionString((__int64)&BlpApplicationEntry, 570425618, v17);
    if ( appended < 0 )
      return (unsigned int)appended;
  }
  memset(v18, 0, sizeof(v18));
  v14[1] = (unsigned int)OslSystemHiveHandle;
  v14[2] = a2 + 32;
  v15 = 0i64;
  v14[0] = a1;
  v6 = _mm_cvtsi128_si32((__m128i)0i64) & 0xFFFFFFF7 | (8 * (OslIsHhrPrepare & 1));
  LODWORD(v15) = v6 ^ ((unsigned __int8)v6 ^ (unsigned __int8)(*(_DWORD *)(*(_QWORD *)(a2 + 0xF0) + 0xDA4i64) >> 0xB)) & 4;
  LODWORD(v15) = ((unsigned int)Feature_OfflineDumpRedaction__private_IsEnabledDeviceUsageNoInline() != 0 ? 0x20 : 0) | v15 & 0xFFFFFFDF;
  appended = ((__int64 (__fastcall *)(__int64 *, __int64 *, char *, __int64 *))qword_1801ADCF8)(
               v14,
               &qword_1801ADCD0,
               &byte_1801ADCA5,
               v18);
  if ( appended < 0 )
    return (unsigned int)appended;
  if ( HIDWORD(v18[77]) )
  {
    v7 = (_QWORD *)(*(_QWORD *)(a2 + 0xF0) + 0xEC8i64);
    v8 = (_QWORD *)*v7;
    if ( (_QWORD *)*v7 != v7 )
    {
      while ( v8[4] != *(__int64 *)((char *)&v18[0x4A] + 4) )
      {
        v8 = (_QWORD *)*v8;
        if ( v8 == v7 )
          goto LABEL_9;
      }
      *((_DWORD *)v8 + 0x12) = HIDWORD(v18[0x4B]);
      *((_DWORD *)v8 + 0x13) = v18[0x4C];
      *((_DWORD *)v8 + 0xC) = HIDWORD(v18[0x4C]);
      *((_DWORD *)v8 + 0xD) = v18[0x4D];
      v9 = HIDWORD(v18[0x4D]);
      *((_DWORD *)v8 + 0xA) |= 3u;
      *((_DWORD *)v8 + 0x11) = v9;
    }
  }
LABEL_9:
  if ( LOBYTE(v18[4]) )
  {
    v10 = v18[0x48];
    if ( LODWORD(v18[0x48]) )
    {
      if ( HIDWORD(v18[7]) != -1 )
      {
        swprintf_s(Dst, 0x100ui64, L"%d");
        HvlpAddStringBootOption(a2, 0x220000F9, Dst);
        v10 = v18[0x48];
      }
      if ( v10 > 0x100 )
        goto LABEL_23;
      memmove(Dst, &v18[8], v10);
      v11 = 570425696i64;
      goto LABEL_22;
    }
    if ( v18[5] == 3 )
    {
      if ( LODWORD(v18[6]) || __PAIR64__(HIDWORD(v18[6]), 0) != LODWORD(v18[7]) )
      {
        swprintf_s(Dst, 0x100ui64, L"%d.%d.%d");
        goto LABEL_17;
      }
      if ( HIDWORD(v18[7]) != -1 )
      {
        swprintf_s(Dst, 0x100ui64, L"%d");
LABEL_17:
        v11 = 0x220000F9i64;
LABEL_22:
        HvlpAddStringBootOption(a2, v11, Dst);
      }
    }
  }
LABEL_23:
  byte_1801ADCA6 = LODWORD(v18[0x4A]) != 0;
  if ( LODWORD(v18[0x4A]) )
  {
    *(_DWORD *)(*(_QWORD *)(a2 + 0xF0) + 0x9F8i64) = v18[0x4A];
    *(_QWORD *)(*(_QWORD *)(a2 + 0xF0) + 0x9F0i64) = v18[0x49];
  }
  if ( (v18[2] & 1) != 0 )
  {
    v12 = 5;
    if ( (v18[2] & 2) == 0 )
      v12 = 4;
    BlSiEnterInsecureStateEx(0, v12, 0i64, 0i64, 0);
  }
  return (unsigned int)appended;
}
```

### Partitions

A partition is essentially an allocated physical memory space, from address 0x0 to 0x\*, and this is important because Hyper-V creates several partitions to maintain optimal OS security.

In this case, we have two main partitions (though there can be more), the **root partition** (host) and the **child partition** (guest). The root partition controls the running machine, which is important because it has control over each child partition and receives certain intercepts (notifications) for specific events that occur in the child partition.

Note what I just said: intercepts. The child partition will never execute code without informing the root partition of what it’s doing.

There are several reasons why child partition execution may be interrupted, you can check them in [Intel’s manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html):

```cpp
#define EXIT_REASON_EXCEPTION_NMI       0
#define EXIT_REASON_EXTERNAL_INTERRUPT  1
#define EXIT_REASON_TRIPLE_FAULT        2
#define EXIT_REASON_INIT                3
#define EXIT_REASON_SIPI                4
#define EXIT_REASON_IO_SMI              5
#define EXIT_REASON_OTHER_SMI           6
#define EXIT_REASON_PENDING_VIRT_INTR   7
#define EXIT_REASON_PENDING_VIRT_NMI    8
#define EXIT_REASON_TASK_SWITCH         9
#define EXIT_REASON_CPUID               10
#define EXIT_REASON_GETSEC              11
#define EXIT_REASON_HLT                 12
#define EXIT_REASON_INVD                13
#define EXIT_REASON_INVLPG              14
#define EXIT_REASON_RDPMC               15
#define EXIT_REASON_RDTSC               16
#define EXIT_REASON_RSM                 17
#define EXIT_REASON_VMCALL              18
#define EXIT_REASON_VMCLEAR             19
#define EXIT_REASON_VMLAUNCH            20
#define EXIT_REASON_VMPTRLD             21
#define EXIT_REASON_VMPTRST             22
#define EXIT_REASON_VMREAD              23
#define EXIT_REASON_VMRESUME            24
#define EXIT_REASON_VMWRITE             25
#define EXIT_REASON_VMXOFF              26
#define EXIT_REASON_VMXON               27
#define EXIT_REASON_CR_ACCESS           28
#define EXIT_REASON_DR_ACCESS           29
#define EXIT_REASON_IO_INSTRUCTION      30
#define EXIT_REASON_MSR_READ            31
#define EXIT_REASON_MSR_WRITE           32
#define EXIT_REASON_INVALID_GUEST_STATE 33
#define EXIT_REASON_MSR_LOADING         34
#define EXIT_REASON_MWAIT_INSTRUCTION   36
#define EXIT_REASON_MONITOR_TRAP_FLAG   37
#define EXIT_REASON_MONITOR_INSTRUCTION 39
#define EXIT_REASON_PAUSE_INSTRUCTION   40
#define EXIT_REASON_MCE_DURING_VMENTRY  41
#define EXIT_REASON_TPR_BELOW_THRESHOLD 43
#define EXIT_REASON_APIC_ACCESS         44
#define EXIT_REASON_ACCESS_GDTR_OR_IDTR 46
#define EXIT_REASON_ACCESS_LDTR_OR_TR   47
#define EXIT_REASON_EPT_VIOLATION       48
#define EXIT_REASON_EPT_MISCONFIG       49
#define EXIT_REASON_INVEPT              50
#define EXIT_REASON_RDTSCP              51
#define EXIT_REASON_VMX_PREEMPTION_TIMER_EXPIRED     52
#define EXIT_REASON_INVVPID             53
#define EXIT_REASON_WBINVD              54
#define EXIT_REASON_XSETBV              55
#define EXIT_REASON_APIC_WRITE          56
#define EXIT_REASON_RDRAND              57
#define EXIT_REASON_INVPCID             58
#define EXIT_REASON_RDSEED              61
#define EXIT_REASON_PML_FULL            62
#define EXIT_REASON_XSAVES              63
#define EXIT_REASON_XRSTORS             64
#define EXIT_REASON_PCOMMIT             65
```

This code comes from the fantastic blog by [Rayanfam](https://rayanfam.com/topics/hypervisor-from-scratch-part-5) ([Intel80x86](https://x.com/Intel80x86)), where we can see the defined reasons for which control could be handed to the root partition.

This is partly done to ensure high modularity and make it work like a microkernel.

The child partition can be any operating system (in this case, of course, Windows) running in parallel with the root partition.

### Hypervisor Startup

Once **`HvLoader`** loads the hypervisor image based on the CPU (`hvix64.sys` is loaded in this case, since we’re on an Intel processor) and creates the hypervisor loader block, it captures the processor context needed by the hypervisor for its first virtual processor. It then switches to a new address space and transfers execution to the hypervisor image by calling the entry point **`KiSystemStartup`**, which prepares the processor to run the hypervisor and initializes the `CPU_PLS` data structure representing a physical processor. Once in memory and given execution flow, it becomes the base of the system and controls the VTLs. But you may ask: What are VTLs? Excellent question.

VTLs (**Virtual Trust Levels**) are logically isolated levels within the system, created, managed, and implemented by the hypervisor (`hvix64.sys`). They allow executing code in isolation with different privilege levels.

We have:

-   **VTL admin** or `hvix64.sys`: Manages the VTLs and runs below the operating system. This is essentially “God mode”: full control over RAM, registers, CPU contexts, memory management, EPT access, isolation, VTL transitions. It is invisible and inaccessible from the OS since it was loaded in the boot sequence.
-   **VTL 0**: Normal privilege, simply the privilege of the running operating system. In this case, it would be `ntoskrnl.exe` with the corresponding drivers, running in ring 0 and isolated in its sandbox by the VTL admin.
-   **VTL 1** or `securekernel.exe`: Runs a secure kernel in a separate space with the integrity module `skci.dll` and runs Credential Guard and HVCI. It cannot be directly accessed from VTL 0 or any ring 0 code, has its own EPT-protected memory space, and is unmapped.

**`hvix64.sys`** does not appear in the Windows driver tree (nor in the SCM) because it runs beneath the operating system.

And since we’ve mentioned VTL 1, let’s briefly look at the binary in charge of it, `securekernel.exe`. Remember, VTL 1 is a minimalistic kernel with a higher privilege level than the VTL 0 machine, tasked with maintaining system integrity.

#### Secure Kernel Initialization

To begin, the entry point is **`SkiSystemStartup`**, the function responsible for initialization.

```cpp
NTSTATUS __stdcall SkiSystemStartup(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath)
{
  int v2; // ebx
  NTSTATUS inited; // r8d
  unsigned __int64 v5; // rdi
  int v6; // eax
  __int64 v7; // rdx
  __int64 v8; // rcx
  __int64 v9; // rcx
  unsigned int *v10; // rcx
  int v11; // edx
  __int64 v12; // rax
  __int64 v13; // rdx
  void *v14; // rdi
  void *v15; // rdi
  void *v16; // rdi

  v2 = (int)RegistryPath;
  _security_init_cookie();
  if ( ((__int64)DriverObject[4].DriverStartIo & 0x2000) != 0 )
  {
    SkInfiniteLoop = 1;
    while ( SkInfiniteLoop == 1 )
      ;
  }
  if ( v2 == 0x8B8 )
  {
    SkeLoaderBlock = (__int64)DriverObject;
    SkiInitializeSystemTsc((__int64)DriverObject);
    SkInitTraceLoggining((__int64)DriverObject, 0i64);
    v5 = __rdtsc();
    *(_QWORD *)(*(_QWORD *)(*(_QWORD *)(SkeLoaderBlock + 48) + 0xF0i64) + 0xDC0i64) = __rdtsc();
    SkiSetFeatureBits();
    SkeProcessorBlock[0] = (__int64)&SkiInitialPrcbStorage;
    SkeProcessorBlockVp[0] = (__int64)&SkiInitialPrcbStorage;
    inited = ShvlInitSystem(0);
    if ( inited >= 0 )
    {
      SkhalSetFeatureBits();
      v6 = SkmmInitSystem(0, 0i64);
      inited = v6;
      if ( v6 >= 0 )
      {
        ((void (__fastcall *)(__int64, __int64, _QWORD))SkiArchPhase0Init)(v8, v7, (unsigned int)v6);
        inited = SkeStartProcessor(0i64);
        if ( inited >= 0 )
        {
          v9 = *(_QWORD *)(SkeLoaderBlock + 0x48);
          SkImageBase = *(_QWORD *)(v9 + 0x30);
          SkImageSize = *(_DWORD *)(v9 + 0x40);
          SkpsSystemDirectoryTableBase = *(_QWORD *)(SkeLoaderBlock + 0x58);
          IumpCompactServiceTable();
          SkiCompactSecureServiceTable();
          v10 = (unsigned int *)&SkiEnclaveServices;
          v11 = 4;
          do
          {
            v12 = *v10++;
            *((_DWORD *)SkiSecureServiceTable + v12) |= 0x10u;
            --v11;
          }
          while ( v11 );
          inited = SkInitSystem(0, 0i64);
          if ( inited >= 0 )
          {
            *(_QWORD *)(*(_QWORD *)(*(_QWORD *)(SkeLoaderBlock + 0x30) + 0xF0i64) + 0xDC8i64) = __rdtsc();
            SkWritePerfTraceEntry(0, 0, __rdtsc() - v5);
            inited = ShvlInitializeVtl1();
            if ( inited >= 0 )
              return inited;
          }
        }
      }
    }
  }
  else
  {
    inited = 0xC0000022;
  }
  if ( SkPhase1InitStatus >= 0 )
  {
    v13 = SkeLoaderBlock;
    if ( SkeLoaderBlock )
    {
      v14 = *(void **)(SkeLoaderBlock + 0x5A8);
      if ( v14 )
        memset(v14, 0, *(unsigned int *)(SkeLoaderBlock + 0x5B0));
      v15 = *(void **)(v13 + 0x580);
      if ( v15 )
        memset(v15, 0, *(unsigned int *)(v13 + 0x588));
      v16 = *(void **)(v13 + 0x778);
      if ( v16 )
        memset(v16, 0, *(unsigned int *)(v13 + 0x780));
      memset((void *)v13, 0, 0x8B8ui64);
    }
  }
  return inited;
}
```

The important code is the following, as it is the core of `securekernel.exe` initialization itself:

```cpp
...
  if ( v2 == 0x8B8 )
  {
    SkeLoaderBlock = (__int64)DriverObject;
    SkiInitializeSystemTsc((__int64)DriverObject);
    SkInitTraceLoggining((__int64)DriverObject, 0i64);
    v5 = __rdtsc();
    *(_QWORD *)(*(_QWORD *)(*(_QWORD *)(SkeLoaderBlock + 48) + 0xF0i64) + 0xDC0i64) = __rdtsc();
    SkiSetFeatureBits();
    SkeProcessorBlock[0] = (__int64)&SkiInitialPrcbStorage;
    SkeProcessorBlockVp[0] = (__int64)&SkiInitialPrcbStorage;
    inited = ShvlInitSystem(0);
    if ( inited >= 0 )
    {
      SkhalSetFeatureBits();
      v6 = SkmmInitSystem(0, 0i64);
      inited = v6;
      if ( v6 >= 0 )
      {
        ((void (__fastcall *)(__int64, __int64, _QWORD))SkiArchPhase0Init)(v8, v7, (unsigned int)v6);
        inited = SkeStartProcessor(0i64);
        if ( inited >= 0 )
        {
          v9 = *(_QWORD *)(SkeLoaderBlock + 0x48);
          SkImageBase = *(_QWORD *)(v9 + 0x30);
          SkImageSize = *(_DWORD *)(v9 + 0x40);
          SkpsSystemDirectoryTableBase = *(_QWORD *)(SkeLoaderBlock + 0x58);
          IumpCompactServiceTable();
          SkiCompactSecureServiceTable();
          v10 = (unsigned int *)&SkiEnclaveServices;
          v11 = 4;
          do
          {
            v12 = *v10++;
            *((_DWORD *)SkiSecureServiceTable + v12) |= 0x10u;
            --v11;
          }
          while ( v11 );
          inited = SkInitSystem(0, 0i64);
          if ( inited >= 0 )
          {
            *(_QWORD *)(*(_QWORD *)(*(_QWORD *)(SkeLoaderBlock + 0x30) + 0xF0i64) + 0xDC8i64) = __rdtsc();
            SkWritePerfTraceEntry(0, 0, __rdtsc() - v5);
            inited = ShvlInitializeVtl1();
            if ( inited >= 0 )
              return inited;
          }
        }
      }
    }
  }
  else
  {
    inited = 0xC0000022;
  }
...
```

##### SkiInitializeSystemTsc

The first function called is **`SkiInitializeSystemTsc`**:

```cpp
__int64 __fastcall SkiInitializeSystemTsc(__int64 a1)
{
  __int64 v1; // rax
  __int64 v2; // rax
  __int64 v3; // rax
  int v4; // ecx
  __int64 result; // rax

  if ( a1 )
  {
    v1 = *(_QWORD *)(a1 + 48);
    if ( !v1 || (v2 = *(_QWORD *)(v1 + 0xF0)) == 0 || (v3 = *(_QWORD *)(v2 + 0x9C0)) == 0 )
      v3 = 1000000000i64;
    qword_1401238C8 = v3;
    goto LABEL_10;
  }
  if ( (ShvlpPartitionPrivilegeMask & 0x200) == 0 )
  {
    v3 = qword_1401238C8;
LABEL_10:
    v4 = 1;
    goto LABEL_11;
  }
  v3 = 10000000i64;
  v4 = 2;
LABEL_11:
  qword_1401238D0 = v3;
  result = 0i64;
  SkeTscInfo = v4;
  return result;
}
```

This function attempts to read a ticks-per-second frequency value `( !v1 || (v2 = *(_QWORD *)(v1 + 0xF0)) == 0 || (v3 = *(_QWORD *)(v2 + 0x9C0)) == 0 )` and if it does not exist or is 0, it defaults to `1000000000i64`, which corresponds to 1 GHz (1 tick = 1 ns). It then checks the partition privileges with `ShvlpPartitionPrivilegeMask` and sets `SkeTscInfo`.

##### SkiSetFeatureBits

Next, we have **`SkiSetFeatureBits`**, which is responsible for gathering information using the `CPUID` instruction:

```cpp
__int64 SkiSetFeatureBits()
{
  __int64 v0; // rdi
  int v6; // r10d
  __int64 v12; // r9
  __int64 v13; // rcx
  unsigned __int64 v14; // rax
  __int64 result; // rax
  int v16; // [rsp+20h] [rbp-40h] BYREF
  unsigned int v17; // [rsp+24h] [rbp-3Ch] BYREF
  int v18; // [rsp+28h] [rbp-38h] BYREF
  int v19; // [rsp+2Ch] [rbp-34h] BYREF
  __int128 v20; // [rsp+30h] [rbp-30h]

  v16 = 0;
  v17 = 0;
  v18 = 0;
  v19 = 0;
  v0 = 0i64;
  v20 = 0i64;
  SkiGetProcessorSignature(&v16, &v18, (int *)&v17, &v19);
  _RAX = 0i64;
  __asm { cpuid }
  v6 = _RCX;
  if ( (unsigned int)_RAX < 7 )
  {
    LODWORD(_RDX) = HIDWORD(v20);
    LODWORD(_RBX) = DWORD1(v20);
  }
  else
  {
    _RAX = 7i64;
    __asm { cpuid }
  }
  if ( (unsigned int)(v16 - 1) > 1 )
    goto LABEL_16;
  if ( (_RBX & 0x80u) != 0i64 )
    SkeFeatureBits |= 1ui64;
  if ( (_RBX & 0x100000) != 0 )
    SkeFeatureBits |= 0x200000000ui64;
  if ( (_RBX & 0x200) != 0 )
    SkeFeatureBits |= 0x40000000000000ui64;
  if ( (_RBX & 1) != 0 )
    SkeFeatureBits |= 0x10000000ui64;
  if ( (_RBX & 0x800000) != 0 )
    SkeFeatureBits |= 0x800000000ui64;
  if ( v16 != 2 )
LABEL_16:
    v0 = 32i64;
  if ( (_RBX & 0x400) != 0 )
    SkeFeatureBits |= 0x200000000000ui64;
  v12 = v0 | 8;
  if ( (_RDX & 0x400) == 0 )
    v12 = v0;
  if ( (v6 & 0x20000) != 0 )
    SkeFeatureBits |= 0x40000000000ui64;
  if ( (unsigned int)(v16 - 2) <= 1 )
  {
    SkeKvaLeakage = 2;
    if ( v18 == 6 )
    {
      if ( v16 == 2 )
      {
        if ( v17 <= 0x36 )
        {
          v13 = 0x6000C010000000i64;
          if ( _bittest64(&v13, v17) )
            goto LABEL_33;
        }
      }
      else if ( v17 == 13 )
      {
LABEL_33:
        SkeKvaLeakage = 0;
        goto LABEL_34;
      }
    }
    if ( (_RDX & 0x20000000) != 0 )
    {
      v14 = __readmsr(0x10Au);
      if ( (v14 & 1) != 0 )
      {
        SkeKvaLeakage = 1;
        if ( v12 != 8 )
          goto LABEL_33;
      }
    }
  }
LABEL_34:
  result = 9i64;
  SkeProcessorRevision = v19 | ((_WORD)v17 << 8);
  SkeCpuVendor = v16;
  SkeProcessorLevel = v18;
  SkeProcessorArchitecture = 9;
  return result;
}
```

The first thing it does is call **`SkiGetProcessorSignature`**, which gathers CPU information, and then calls `cpuid` with `rax` set to 7, setting the variable `SkeFeatureBits` and also `SkeKvaLeakage`.

This is **`SkiGetProcessorSignature`**, which retrieves the `CpuVendor` (as mentioned before) and gathers CPU details by calling `CPUID` with `rax` set to 1:

```cpp
__int64 __fastcall SkiGetProcessorSignature(_DWORD *a1, int *a2, int *a3, _DWORD *a4)
{
  int CpuVendor; // r10d
  __int64 _RAX; // rax
  __int64 result; // rax
  int v14; // edx
  int v15; // ecx

  CpuVendor = SkiGetCpuVendor();
  _RAX = 1i64;
  __asm { cpuid }
  if ( (BYTE1(result) & 0xF) == 0xF )
  {
    v14 = (unsigned __int8)((unsigned int)result >> 20) + 0xF;
    v15 = (unsigned __int64)(result & 0xF0 | ((unsigned int)result >> 8) & 0xF00) >> 4;
  }
  else
  {
    v14 = BYTE1(result) & 0xF;
    v15 = (unsigned __int8)result >> 4;
  }
  if ( (CpuVendor == 2 || CpuVendor == 3) && v14 == 6 )
    v15 |= ((unsigned int)result >> 12) & 0xF0;
  if ( a1 )
    *a1 = CpuVendor;
  if ( a2 )
    *a2 = v14;
  if ( a3 )
    *a3 = v15;
  if ( a4 )
    *a4 = result & 0xF;
  return (unsigned int)result;
}
```

And as we can see, indeed **`SkiGetCpuVendor`** calls `CPUID` with `rax` set to 0 to obtain the vendor:

```cpp
__int64 SkiGetCpuVendor()
{
  char Str1[16]; // [rsp+20h] [rbp-28h] BYREF

  _RAX = 0i64;
  __asm { cpuid }
  *(_DWORD *)&Str1[4] = _RBX;
  *(_DWORD *)&Str1[8] = _RDX;
  *(_DWORD *)&Str1[12] = _RCX;
  if ( !strncmp(&Str1[4], "AuthenticAMD", 0xCui64) )
    return 1i64;
  if ( !strncmp(&Str1[4], "GenuineIntel", 0xCui64) )
    return 2i64;
  if ( !strncmp(&Str1[4], "HygonGenuine", 0xCui64) )
    return 1i64;
  if ( !strncmp(&Str1[4], "CentaurHauls", 0xCui64) )
    return 3i64;
  return strncmp(&Str1[4], "  Shanghai  ", 0xCui64) == 0 ? 3 : 0;
}
```

##### ShvlInitSystem

Then **`ShvlInitSystem`** is called:

```cpp
__int64 __fastcall ShvlInitSystem(int a1)
{
  int v1; // ecx
  int VsmCapabilities; // ebx
  __int128 v4; // [rsp+20h] [rbp-28h] BYREF

  *((_QWORD *)&v4 + 1) = 0i64;
  if ( a1 )
  {
    v1 = a1 - 1;
    if ( v1 )
    {
      if ( v1 == 1 )
      {
        if ( (ShvlpFlags & 1) == 0
          && (!(unsigned int)SkmiAllocatePhysicalPage(0i64, 0, (ULONG_PTR *)&ShvlpSynicMessagePfn)
           || !(unsigned int)SkmiAllocatePhysicalPage(0i64, 0, (ULONG_PTR *)&ShvlpVpAssistPfn)) )
        {
          return 0xC0000017i64;
        }
        VsmCapabilities = ShvlpInitializeHypercallPages((__int64)KeGetPcr()->NtTib.ExceptionList);
        if ( VsmCapabilities >= 0 )
        {
          if ( !SkmmClaimMappedPage(ShvlpHypercallCodePage, 0, 0)
            || (ShvlpFlags & 1) != 0 && ShvlpReferenceTscPage && !SkmmClaimMappedPage(ShvlpReferenceTscPage, 0, 0) )
          {
            return 0xC0000043;
          }
          else
          {
            return 0;
          }
        }
      }
      else
      {
        return 0xC00000BB;
      }
    }
    else
    {
      ShvlStartProcessor((__int64)KeGetPcr()->NtTib.ExceptionList);
      ShvlpInitializeHypercallSupport(1);
      VsmCapabilities = ShvlpInitializeVsmCodeArea();
      if ( VsmCapabilities >= 0 )
      {
        VsmCapabilities = ShvlpQueryVsmCapabilities();
        if ( VsmCapabilities >= 0 )
        {
          *(_QWORD *)&v4 = (2 * (SkmmDefaultVtlProtection & 0xF | (8i64 * (ShvlpFlags & 4)))) | 0x21;
          VsmCapabilities = ShvlSetVpRegister(0xFFFFFFFE, 0xFF, 0xD0007, &v4);
          if ( VsmCapabilities >= 0 )
          {
            ShvlpInitializeReferenceTsc();
            if ( (ShvlpHardwareFeatures & 0x10000) != 0 )
              ShvlpFlags |= 8u;
          }
        }
      }
    }
  }
  else
  {
    v4 = 0i64;
    ShvlpPageDirectoryBase = *(_QWORD *)(SkeLoaderBlock + 0x58);
    ((void (__fastcall *)(__int128 *))HviGetHypervisorFeatures)(&v4);
    if ( (v4 & 0x100000000000i64) != 0 )
      ShvlpFlags |= 1u;
    ((void (__fastcall *)(void *))HviGetHypervisorFeatures)(&ShvlpHypervisorFeatures);
    *(_DWORD *)(SkeProcessorBlock[0] + 0x80) = 0xF;
    *(_QWORD *)(SkeProcessorBlock[0] + 0x88) = *(_QWORD *)(SkeLoaderBlock + 0x10);
    ShvlpInitializeHypercallSupport(0);
    VsmCapabilities = ShvlpDetermineEnlightenments();
    if ( VsmCapabilities >= 0 )
    {
      VsmCapabilities = ShvlpQueryVsmCapabilities();
      if ( VsmCapabilities >= 0 )
      {
        ShvlpIoInterceptListLock = 0;
        return (unsigned int)SkPhase1InitStatus;
      }
    }
  }
  return (unsigned int)VsmCapabilities;
}
```

This function is responsible for initializing secure kernel phases, configuring VSM, and setting up hypercalls.

The interesting thing about this function is that it is divided into phases depending on the value of `a1`.

The first highly relevant function related to hypercalls is **`ShvlpInitializeHypercallSupport`**, which prepares the hypercall page:

```cpp
__int64 __fastcall ShvlpInitializeHypercallSupport(int a1)
{
  __int64 (__fastcall *v1)(_QWORD, _QWORD, _QWORD); // rbx
  __int64 result; // rax

  if ( a1 )
  {
    ShvlpRegisterForHypercallSupport();
    SkmmMapBootPage(ShvlpHypercallCodePage, ShvlpCodePa >> 12, 17);
    HvcallCodeVa = (__int64 (__fastcall *)(_QWORD, _QWORD, _QWORD))ShvlpHypercallCodePage;
    return SkeFlushCurrentTb(1i64);
  }
  else
  {
    ShvlpHypercallCodePage = *(_QWORD *)(SkeLoaderBlock + 8);
    v1 = (__int64 (__fastcall *)(_QWORD, _QWORD, _QWORD))ShvlpHypercallCodePage;
    result = SkmmGetPhysicalAddress(ShvlpHypercallCodePage);
    ShvlpCodePa = result;
    HvcallCodeVa = v1;
  }
  return result;
}
```

Again, depending on `a1`, it will do one thing or another. If `a1` is `0`, it obtains the virtual address of the hypercall code page and stores it in `ShvlpHypercallCodePage`, then obtains the physical address and stores it in `ShvlpCodePa`, then stores the virtual address in **`HvcallCodeVa`**, which is the function pointer to the hypercalls (as we’ll see shortly):

```cpp
...
    ShvlpHypercallCodePage = *(_QWORD *)(SkeLoaderBlock + 8);
    v1 = (__int64 (__fastcall *)(_QWORD, _QWORD, _QWORD))ShvlpHypercallCodePage;
    result = SkmmGetPhysicalAddress(ShvlpHypercallCodePage);
    ShvlpCodePa = result;
    HvcallCodeVa = v1;
...
```

If `a1` is not `0`, it calls **`ShvlpRegisterForHypercallSupport`**, which writes to an MSR to enable hypercalls in the processor, then maps the hypercall code page into memory:

```cpp
...
    ShvlpRegisterForHypercallSupport();
    SkmmMapBootPage(ShvlpHypercallCodePage, ShvlpCodePa >> 12, 17);
    HvcallCodeVa = (__int64 (__fastcall *)(_QWORD, _QWORD, _QWORD))ShvlpHypercallCodePage;
    return SkeFlushCurrentTb(1i64);
...
```

**`ShvlpRegisterForHypercallSupport`** looks like this:

```cpp
unsigned __int64 ShvlpRegisterForHypercallSupport()
{
  unsigned __int64 v0; // rax
  unsigned __int64 result; // rax

  __writemsr(0x40000000u, 0x1040A000065F4ui64);
  v0 = __readmsr(0x40000001u);
  result = ((unsigned __int64)HIDWORD(v0) << 32) | (unsigned int)v0 | 1;
  if ( (ShvlpFlags & 1) != 0 )
    ShvlpCodePa = result & 0xFFFFFFFFFFFFF000ui64;
  else
    result = result & 0xFFF | ShvlpCodePa & 0xFFFFFFFFFFFFF000ui64;
  __writemsr(0x40000001u, result);
  return result;
}
```

Lastly, it’s worth noting that **`ShvlInitSystem`** also executes **`ShvlpInitializeHypercallPages`**, which allocates and assigns memory for the pages used by hypercalls.

To wrap up, I’d like to look at **`ShvlNotifyLongSpinWait`**, which simply calls `HvcallInitiateHypercall(0x10008i64, a1, 0i64)`:

```cpp
__int64 __fastcall ShvlNotifyLongSpinWait(unsigned int a1)
{
  return HvcallInitiateHypercall(0x10008i64, a1, 0i64);
}
```

Which in turn calls the previously mentioned **`HvcallCodeVa`**:

```cpp
__int64 __fastcall HvcallInitiateHypercall(__int64 a1, __int64 a2, __int64 a3)
{
  return HvcallCodeVa(a1, a2, a3);
}
```

It resides in memory and would require debugging to dive deeper into the internals.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/50a24debfdcd8ccb.png)](https://r0keb.github.io/imgs/blog/9HyperVResearch/20250809174240.png)

## Conclusion

This has been a light introduction to the vast world of Hyper-V, VBS, and hypervisor-related technology in Windows.

In upcoming posts, I plan to create POCs with exploits and dig deeper into the initialization of both the hypervisor (`hvix64.exe`) and VTL 1 (`securekernel.exe`).

## References

-   Windows Internals 2 7th edition
-   [Intel’s manual](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
-   [Hypervisor From Scratch](https://rayanfam.com/topics/hypervisor-from-scratch-part-1) ([Intel80x86](https://x.com/Intel80x86))

## Closing

Good morning, and in case I don’t see ya: Good afternoon, good evening, and good night!
