---
title: Anti-debug techniques and the telemetry each one generates
source: https://dkom.dev/posts/anti-debug-telemetry/
source_host: dkom.dev
clip_date: 2026-11-16T10:32:45+08:00
trace_id: 6ded7a23-50aa-4c62-bbc8-41b8205dfbfe
content_hash: 46ff86e6e672666afa0b1705ee6b93c821e5007e64463350a4a86393236974aa
status: synced
tags: []
series: null
feed_source: dkom.dev·Windows内核/Hypervisor
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41a75244-d011-81ee-87ae-ff1d12f704cf
ioc: null
---

Every debugger check a sample runs generates some footprint, or it doesn’t. Which it is decides whether you build a detection or evade one. This post goes through ten techniques in roughly ascending order of forensic interest. For each one: the C implementation, the exact telemetry (or lack of it), and what a memory forensics tool sees.

Each check populates one field in a `DebugCheckResult` struct. No logging framework, no global state.

## Detection visibility map

Before getting into the techniques, here’s which checks are visible at which layer.

Detection visibility by layer Layer 1: Kernel ETW Kernel-Audit-API-Calls: opens and driver loads, not NtQIP none Layer 2: Sysmon Event 10 needs a handle open; snapshot opens none none Layer 3: User-mode hook EDR hooks NtQueryInformationProcess, GetThreadContext checks 3,4,5 check # kernel ETW Sysmon UM hook mem forensics 1 IsDebuggerPresent no no no PEB.BeingDebugged 2 PEB.NtGlobalFlag no no no PEB.NtGlobalFlag=0x70 3 NtQIP DebugPort no no yes DebugObject handle 4 NtQIP DebugObject no no yes DebugObject handle 5 GetThreadContext DR no no yes DR0-3 in CONTEXT 6 Process blacklist no no no \-- 7 GetTickCount64 no no no \-- 8 QueryPerfCounter no no no \-- 9 DebugBreak trap no no no \-- 10 OutputDebugString no no no \--

## Result struct

All ten checks write into a single `DebugCheckResult`. The caller decides what to do with the verdict.

```c
typedef struct {
    BOOL isDebuggerPresent;
    BOOL pebBeingDebugged;
    BOOL pebNtGlobalFlag;
    BOOL ntqipDebugPort;
    BOOL ntqipDebugObject;
    BOOL hardwareBreakpoints;
    BOOL debuggerProcess;
    BOOL tickCountAnomaly;
    BOOL perfCounterAnomaly;
    BOOL debugBreakConsumed;
    BOOL outputDbgStringTrick;
    ULONG_PTR dr0, dr1, dr2, dr3, dr6, dr7;
    ULONG     ntGlobalFlag;
    WCHAR     detectedProcess[MAX_PATH];
} DebugCheckResult;
```

## 1\. IsDebuggerPresent

```c
static void check_is_debugger_present(DebugCheckResult *r)
{
    r->isDebuggerPresent = IsDebuggerPresent();
}
```

`IsDebuggerPresent()` in kernel32.dll compiles to a two-instruction sequence: read GS:\[0x60\] to get the PEB pointer, read byte at PEB+0x002. No syscall, no kernel involvement.

Because it never crosses the kernel boundary, nothing in the default Windows telemetry stack fires. The only detection option is an EDR that hooks kernel32 or ntdll in user space. Any process with an EDR agent DLL loaded can catch this by inspecting the call, but nothing in ETW, WFP, or kernel callbacks touches it.

A memory forensics tool reading the live PEB will see `BeingDebugged = 0x01` when a debugger is attached. No current Volatility 3 plugin surfaces that byte on its own, so you read it out of the PEB yourself.

## 2\. PEB.BeingDebugged (direct read)

```c
static void check_peb_being_debugged(DebugCheckResult *r)
{
    PMYPEB peb = (PMYPEB)__readgsqword(0x60);
    r->pebBeingDebugged = (peb->BeingDebugged != 0);
}
```

Functionally identical to check 1. The difference is that a hook on `IsDebuggerPresent` returning a spoofed value won’t defeat a direct GS-relative read. If you’re a debugger trying to hide yourself by patching the API, a malware sample that reads the PEB directly bypasses the patch. Running both checks covers both evasion scenarios.

## 3\. PEB.NtGlobalFlag

```c
static void check_peb_nt_global_flag(DebugCheckResult *r)
{
    PMYPEB peb = (PMYPEB)__readgsqword(0x60);
    r->ntGlobalFlag    = peb->NtGlobalFlag;
    r->pebNtGlobalFlag = ((peb->NtGlobalFlag & DEBUGGER_HEAP_FLAGS) == DEBUGGER_HEAP_FLAGS);
}
```

`NtGlobalFlag` at PEB+0x0bc (x64 layout, confirmed against Windows 10 22H2 and Windows 11 23H2 PEB layout). The kernel sets bits `0x10 | 0x20 | 0x40` when a process is created under a debugger. These are the heap instrumentation flags: tail-check fill patterns, free-check fill, and parameter validation. They are not set when a debugger attaches to an already-running process.

This is often called the “NtGlobalFlag = 0x70” check, which is correct only when all three flags fire together. A process with `FLG_HEAP_ENABLE_TAIL_CHECK` set for other reasons (e.g. GFlags configuration) will produce a false positive.

No telemetry fires. This is a memory read.

## 4\. NtQueryInformationProcess

```c
typedef NTSTATUS (NTAPI *pfnNtQueryInformationProcess)(
    HANDLE ProcessHandle, ULONG ProcessInformationClass,
    PVOID ProcessInformation, ULONG ProcessInformationLength,
    PULONG ReturnLength);

static void check_ntqip(DebugCheckResult *r)
{
    pfnNtQueryInformationProcess NtQIP = (pfnNtQueryInformationProcess)
        GetProcAddress(GetModuleHandleW(L"ntdll.dll"),
                       "NtQueryInformationProcess");
    if (!NtQIP) return;

    /* ProcessDebugPort (7): returns -1 if any debugger is attached */
    ULONG_PTR debugPort = 0;
    NTSTATUS st = NtQIP(GetCurrentProcess(), 7,
                        &debugPort, sizeof(debugPort), NULL);
    if (NT_SUCCESS(st) && debugPort != 0)
        r->ntqipDebugPort = TRUE;

    /* ProcessDebugObjectHandle (30): STATUS_PORT_NOT_SET means clean */
    HANDLE debugObj = NULL;
    st = NtQIP(GetCurrentProcess(), 30,
               &debugObj, sizeof(debugObj), NULL);
    if (NT_SUCCESS(st) && debugObj != NULL) {
        r->ntqipDebugObject = TRUE;
        CloseHandle(debugObj);
    }
}
```

Two information classes matter here.

`ProcessDebugPort` (7): the kernel returns `-1` (as a `ULONG_PTR`) if any debugger is attached to the process, user-mode or kernel. `ProcessDebugObjectHandle` (30) returns the handle to the debug object; user-mode debuggers (x64dbg, WinDbg in user-mode) create a debug object, so both classes fire for them.

No default kernel ETW records this query. `Microsoft-Windows-Kernel-Audit-API-Calls` (GUID `{e02a841c-75a3-4fa7-afc8-ae09cf9b7f23}`) sounds like the provider that would, but on 24H2 it audits process and thread opens, driver loads, and image-notify registration, not `NtQueryInformationProcess`. None of its events carries a `ProcessInformationClass` field. Dump the manifest and check for yourself:

```powershell
$p = Get-WinEvent -ListProvider Microsoft-Windows-Kernel-Audit-API-Calls
$p.Id                                          # provider GUID
$p.Events | ForEach-Object {
    $f = [regex]::Matches($_.Template, 'name="(\w+)"') | ForEach-Object { $_.Groups[1].Value }
    "ID $($_.Id): $($f -join ', ')"
}
```

```text
e02a841c-75a3-4fa7-afc8-ae09cf9b7f23
ID 1: NotifyRoutineAddress, ReturnCode
ID 2: TargetProcessId, ReturnCode
ID 3: LinkSourceName, LinkTargetName, DesiredAccess, ReturnCode
ID 4: ReturnCode
ID 5: TargetProcessId, DesiredAccess, ReturnCode
ID 6: TargetProcessId, TargetThreatId, DesiredAccess, ReturnCode
ID 7: DriverName, ReturnCode
ID 8: DriverName, ReturnCode
```

Event 8 is a driver operation. There is no NtQIP event to subscribe to, and the provider exposes no `/Analytic` channel to enable.

The catch for checks 3 and 4 is a user-mode hook. EDRs hook `ntdll!NtQueryInformationProcess`, and the hook fires before the syscall. That is the only place a self-query of `ProcessDebugPort` or `ProcessDebugObjectHandle` shows up in the default stack, which makes these two user-mode detections, not kernel telemetry.

`STATUS_PORT_NOT_SET` (0xC0000353) on `ProcessDebugObjectHandle` is the clean return. Any success status paired with a non-null handle means a debug object exists.

> **Verify it yourself:** `Get-WinEvent -ListProvider Microsoft-Windows-Kernel-Audit-API-Calls` lists eight events and no `/Analytic` channel, and none of them takes a `ProcessInformationClass`. To watch the query itself, put an API monitor or an inline hook on `ntdll!NtQueryInformationProcess` and log calls with class 7 or 30 against the current process.

## 5\. Hardware debug registers

```c
static void check_hardware_breakpoints(DebugCheckResult *r)
{
    CONTEXT ctx;
    ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;

    if (!GetThreadContext(GetCurrentThread(), &ctx))
        return;

    r->dr0 = ctx.Dr0;  r->dr1 = ctx.Dr1;
    r->dr2 = ctx.Dr2;  r->dr3 = ctx.Dr3;
    r->dr6 = ctx.Dr6;  r->dr7 = ctx.Dr7;

    r->hardwareBreakpoints = (ctx.Dr0 || ctx.Dr1 || ctx.Dr2 || ctx.Dr3);
}
```

`GetThreadContext` with `CONTEXT_DEBUG_REGISTERS` causes the kernel to copy DR0-DR7 from the thread’s kernel-side context into the user-space `CONTEXT` struct. The six registers:

-   DR0-DR3: breakpoint linear addresses
-   DR6: debug status (which breakpoint fired, what condition)
-   DR7: control register -- enable bits per breakpoint, condition (execute/write/read-write), length

A non-zero value in any of DR0-DR3 means a hardware breakpoint is active on this thread at that address. DR7 bit 0 (L0) enables DR0, bit 2 (L1) enables DR1, and so on. The check looks at DR0-DR3 directly, which is sufficient to detect most debugger configurations.

**No ETW fires for `GetThreadContext`** on the call itself. However, `NtGetContextThread` is a syscall, and an EDR hook on that syscall stub in ntdll will see every call. The hook receives the thread handle and the `ContextFlags`. A hook looking for `CONTEXT_DEBUG_REGISTERS` in `ContextFlags` on a call where the handle resolves to the calling thread has almost zero false positive rate in production code.

The DR register values appear in any CONTEXT structure captured to disk. A minidump, a crash dump, or a live memory capture with Volatility will all preserve DR0-DR7.

## 6\. Process name blacklist

```c
static const WCHAR *g_DebuggerNames[] = {
    L"x64dbg.exe", L"ida.exe", L"ida64.exe",
    L"VsDebugConsole.exe", L"msvsmon.exe", L"windbg.exe",
};

static void check_process_blacklist(DebugCheckResult *r)
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snap == INVALID_HANDLE_VALUE) return;

    PROCESSENTRY32W pe;
    pe.dwSize = sizeof(pe);
    if (!Process32FirstW(snap, &pe)) { CloseHandle(snap); return; }

    do {
        for (int i = 0; i < DEBUGGER_COUNT; i++) {
            if (_wcsicmp(pe.szExeFile, g_DebuggerNames[i]) == 0) {
                r->debuggerProcess = TRUE;
                wcsncpy_s(r->detectedProcess, MAX_PATH, pe.szExeFile, _TRUNCATE);
                goto done;
            }
        }
    } while (Process32NextW(snap, &pe));
done:
    CloseHandle(snap);
}
```

`CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)` builds the process list without opening a handle to each process. It lives in kernel32, and there is no `NtCreateToolhelp32Snapshot` syscall behind it. Walking its call graph on 24H2 shows where the list actually comes from:

```text
kernel32!CreateToolhelp32Snapshot   (10.0.26100.9444)  reaches, in ntdll:
  NtQuerySystemInformation                        # the process list
  RtlQueryProcessDebugInformation / RtlCreateQueryDebugBuffer
  NtCreateSection / NtMapViewOfSection            # the snapshot buffer
  (no NtOpenProcess)
```

For `TH32CS_SNAPPROCESS` the list comes from `NtQuerySystemInformation`, so no per-process handle is opened.

**Sysmon Event ID 10 (ProcessAccess)** does not fire for this. Event 10 records `OpenProcess` -style handle opens, and `TH32CS_SNAPPROCESS` opens no per-process handle, so the enumeration is invisible to it no matter how the ProcessAccess rules are written. Telemetry on this check means hooking the enumeration path itself, `NtQuerySystemInformation` with `SystemProcessInformation`, which some EDRs watch and Sysmon does not cover.

The comparison uses `_wcsicmp` for case-insensitive matching -- debuggers can be renamed, so this check is trivially bypassed. It exists because it’s in the wild and generates specific telemetry you can detect, not because it’s a hard check to beat.

## 7\. GetTickCount64 timing

```c
static void check_tick_count(DebugCheckResult *r)
{
    ULONGLONG t1 = GetTickCount64();
    Sleep(10);
    ULONGLONG t2 = GetTickCount64();
    /* >100ms for a 10ms sleep: 10x inflation */
    r->tickCountAnomaly = ((t2 - t1) > 100);
}
```

Under a debugger, single-stepping or breakpoint handling inflates wall clock time between two measurements. We sleep for a known duration and check whether elapsed time is much larger than expected.

No telemetry. `GetTickCount64` reads `TickCountQuad` from `KUSER_SHARED_DATA` at virtual address `0x7FFE0320` -- a shared read-only page mapped into every process. No syscall. (`0x7FFE0000` is `TickCountLowDeprecated`, used by the deprecated 32-bit `GetTickCount`; `0x7FFE0014` is `SystemTime`.)

Timing checks have high false positive rates on VMs, sandboxes, and any machine under load. Use them as contributing signals, not definitive detections.

## 8\. QueryPerformanceCounter timing

```c
static void check_qpc_timing(DebugCheckResult *r)
{
    LARGE_INTEGER freq, t1, t2;
    QueryPerformanceFrequency(&freq);
    QueryPerformanceCounter(&t1);
    Sleep(1);
    QueryPerformanceCounter(&t2);

    LONGLONG elapsed_us = (t2.QuadPart - t1.QuadPart) * 1000000LL / freq.QuadPart;
    r->perfCounterAnomaly = (elapsed_us > 50000);
}
```

Same idea as check 7 but with sub-millisecond resolution. `QueryPerformanceCounter` on modern Intel hardware reads `KUSER_SHARED_DATA` fields and may issue RDTSC directly -- no syscall required in most configurations.

No telemetry. The sleep calls do invoke `NtDelayExecution`, which is visible to ETW, but there’s no event correlating the sleep duration to a timing check. An EDR can’t distinguish “malware timing itself” from “legitimate code sleeping” from a single `NtDelayExecution` call.

## 9\. DebugBreak exception trap

```c
static void check_debug_break(DebugCheckResult *r)
{
    r->debugBreakConsumed = FALSE;
    __try {
        DebugBreak();
    }
    __except (GetExceptionCode() == EXCEPTION_BREAKPOINT
              ? EXCEPTION_EXECUTE_HANDLER
              : EXCEPTION_CONTINUE_SEARCH) {
        r->debugBreakConsumed = TRUE;
    }
}
```

`DebugBreak()` issues INT3 (0xCC). Without a debugger, this generates `EXCEPTION_BREAKPOINT` (0x80000003). With a user-mode debugger attached, the debugger’s first-chance exception handler receives the `EXCEPTION_BREAKPOINT` before any VEH/SEH in the process. The debugger typically silently swallows it. In that case, the `__except` block in the process never sees it, and the flag stays at its initial value.

No ETW fires for the INT3 instruction itself. No Sysmon event covers it. An EDR that uses vectored exception handling internally may observe it, but there’s no standard telemetry event.

This technique is neutered by any VEH registered before this code runs that swallows `EXCEPTION_BREAKPOINT` silently.

## 10\. OutputDebugString last-error

```c
static void check_output_debug_string(DebugCheckResult *r)
{
    SetLastError(0xDEAD);
    OutputDebugStringW(L"probe");
    r->outputDbgStringTrick = (GetLastError() == 0);
}
```

Legacy check. The mechanism: `OutputDebugStringW` uses a shared memory protocol with the debugger. When no debugger is listening, the API checks for the `DBWIN_BUFFER_READY` event; it’s absent, so the function returns early without touching the last-error code. When a debugger is present, the function sends the string, and the kernel32 path resets last-error to 0.

This behaviour stopped working on Windows Vista and later. Microsoft’s updated implementation no longer reliably resets last-error through this path. Treat it as a legacy indicator only.

No telemetry fires.

## Building a detection

From the blue side, checks 3, 4, and 5 are the most actionable.

**Check 4 (NtQIP)** is the cleanest signal, but only from user space. There is no kernel ETW event for it, so the detection is a user-mode hook on `ntdll!NtQueryInformationProcess` that fires when a process queries class 7 or 30 against itself. Legitimate software querying those classes on itself is vanishingly rare, so the false positive rate stays low.

**Check 5 (DR registers)** is the most interesting EDR hook target. If you’re running an EDR with user-mode hooks, hooking `NtGetContextThread` and flagging calls where `ContextFlags & CONTEXT_DEBUG_REGISTERS` is set, and the handle resolves to the calling thread, is a near-zero false positive detection for anti-debug self-inspection.

**Check 6 (process enumeration)** is the hardest to see from default telemetry. `TH32CS_SNAPPROCESS` opens no handles, so Sysmon ProcessAccess never records it. Catching it means hooking `NtQuerySystemInformation` for `SystemProcessInformation` and correlating that with the process later matching debugger names, which is an EDR job in user space, not a Sysmon rule.

Checks 1, 2, 3 (PEB reads) and 7-10 (timing, exceptions, OutputDebugString) are only reliably detectable via memory forensics after the fact or via an EDR that instruments the specific API calls. They don’t surface in default ETW or Sysmon configurations.

## Source

Full compilable implementation (correct, no stubs): [anti_debug.c](https://dkom.dev/code/anti-debug-telemetry/anti_debug.c)

## Links

The injection techniques that follow on from detecting a debugger and trying to run anyway are covered in [process injection and Early Bird APC](https://dkom.dev/posts/process-injection-early-bird/). The x64 trampoline hooking that an EDR uses to hook `NtGetContextThread` and `NtQueryInformationProcess` in ntdll is the same mechanism described in [writing an x64 inline hook](https://dkom.dev/posts/inline-hook-x64-trampoline/).
