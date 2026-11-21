---
title: "[Research] One Truth Prevails…? (EN)"
source: https://hackyboiz.github.io/2026/11/21/SeoPPak/Windows_Double_Fetch_Exploit/EN/
source_host: hackyboiz.github.io
clip_date: 2026-11-21T19:47:47+08:00
trace_id: 3a37b395-d8c4-4d46-ad96-2a1248353fe9
content_hash: adba06fc917229055a9e7ed05e90ae9ca58c6f367be0599e3b0f235c8f62cdf4
status: synced
tags:
  - 内核
  - 漏洞分析
series: null
feed_source: hackyboiz·Android/Windows/macOS漏洞
ai_summary: CVE-2024-30088 的同一个 double-fetch 固定字符串写入原语，用在 token 上能创建 SYSTEM 子进程，用在 I/O Ring 上则能扩展成内核任意读写并临时替换当前进程 token。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 41f75244-d011-814d-9c9a-d38098f95bb4
ioc:
  cves:
    - CVE-2024-30088
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CVE-2024-30088 的同一个 double-fetch 固定字符串写入原语，用在 token 上能创建 SYSTEM 子进程，用在 I/O Ring 上则能扩展成内核任意读写并临时替换当前进程 token。
> 
> - **漏洞原语：** `NtQueryInformationToken` 类 22 先在用户输出缓冲区构造 `UNICODE_STRING` 目标描述符，再交给 `RtlCopyUnicodeString`；用户线程改写 `MaximumLength`/`Buffer` 触发 write-then-read-back，但只能写入固定 32 字节 `TSA://ProcUnique`。
> - **Token 路径：** 把 `Buffer` 设为 `token+0x40-4` 覆盖 `Privileges`，由字符串算出的 Present/Enabled 掩码 bit 20 恰为 SeDebugPrivilege；`OpenProcess` 第 32 次打开 winlogon.exe，经 `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS` 产出 S-1-5-18、System 完整性子进程。
> - **I/O Ring 路径：** 从 `ring+0x9D` 起写，使 `RegBuffers`(+0xB8) 变成 `0x65007500`，落在 `VirtualAlloc` 预留区内，成为指向伪造注册缓冲区数组的指针；再用 `BuildIoRingReadFile`/`WriteFile` 取得内核写/读，临时替换当前进程 token 后回写还原。
> - **易错点：** race 成功日志不等于写入成功，必须回读 ring 字段；首个 I/O Ring 写被用于修复被覆盖的 event 指针；读文件前需 `SetFilePointer(..., FILE_BEGIN)`，否则进程 PID 全读成 0。
> - **结论：** 分歧不在竞争本身，而在于固定字符串最终落在哪个字段、该对象如何使用它；两条链都只改数据未改控制流，因此不能称作绕过 SMEP/CFG，也未测 HVCI/VBS、PatchGuard 与 Low integrity 下的地址限制绕过。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9b0663a7ee4d529.jpg)

Hello. The weather has turned quite cold lately - I hope everyone is keeping well.

I’m SeoPPak, and I joined Hackyboiz back in August 2026. Welcome to my very first research post! 😄

The first thing I learned after joining Hackyboiz was reproducing Windows 1-days, so it was only natural that I wanted to dig deeper into Windows - deep enough that I’ve started poking around the kernel as well.

As a first step, minzu and I are working on building a database of Windows kernel vulnerabilities, organized along the chain of **bug → obtainable primitive → target object → exploitation outcome**. Rather than simply collecting CVE numbers and whether reproduction succeeded, we wanted to accumulate material that can actually explain *under what conditions* a given read/write capability turns into privilege escalation.

Today I’ll take a deep dive into CVE-2024-30088 and compare how a single vulnerability leads to privilege escalation along two different paths.

The reversing of the vulnerable function and the contents of the patch were covered in more detail in my earlier “one line a day” analysis post. Here I’ll first summarize only **what we were able to write**, and then look at where that capability led in each case.

## 1\. The Same Starting Point

## 1-1. Double Fetch

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/04925290f51f37c8.png)

Both paths start from the same **Double Fetch-class race**. More precisely, it takes the form of a **write-then-read-back**, where the kernel writes a destination descriptor into a user buffer and then reads it again. After obtaining a fixed-string write via this race, the exploitation path diverges depending on which object that write is applied to.

-   **Token approach:** Align the fixed-string write with the token’s `Privileges` field to corrupt the privilege bits, then use the resulting process handle to spawn a SYSTEM child.
-   **I/O Ring approach:** Use the same write to corrupt the `RegBuffers` field of an I/O Ring object, expand it into arbitrary kernel read/write, and then swap the current process’s token.

The I/O Ring privilege escalation path was reproduced by referring to the Windows exploit chain presented in carrot_c4k3’s article *CVE-2024-30088 Pwning Windows Kernel @ Pwn2Own Vancouver 2024 (Plus Xbox)*, and the collateral-damage code that was later published for Xbox.

## 1-2. The Primitive Created by the Vulnerability

#### The Destination Descriptor in Token Information Queries

`NtQueryInformationToken(..., TokenAccessInformation = 22, ...)`, the function that queries a specified class of information from an access token, exports the token’s security attributes into a user output buffer. The kernel constructs a `UNICODE_STRING` destination descriptor that will receive the attribute name **inside the user buffer**, and then reuses it as the destination argument of `RtlCopyUnicodeString`, which copies the Unicode string. It is precisely in between these two steps that a user thread can change the descriptor’s `MaximumLength` and `Buffer`. This is where the write-then-read-back race condition pointed out by carrot_c4k3 arises.

How the copy length and address are determined matters as well. The copy length is the smaller of the source length and the destination’s `MaximumLength`, and the actual write location is the destination `Buffer`. According to Microsoft’s documentation, this function does not fix up the destination’s `MaximumLength` or `Buffer` on your behalf. So if the destination address changes while the descriptor in user memory is being re-read as-is, the location the kernel originally prepared and the location it actually copies to can end up different.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b091444eefe07a62.png)

```
Kernel: writes the destination UNICODE_STRING into the user output bufferUser thread: changes the length and pointer fields of that same descriptorKernel: reuses the modifiable descriptor in RtlCopyUnicodeString
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d9e580c85f55eb4f.png)

So does that mean we can write any value we like?

The name being copied is fixed as `TSA://ProcUnique`. Represented in UTF-16, that’s **32 bytes**. In other words, the capability obtained in the first stage is not an arbitrary 8-byte pointer write, but a **restricted write that overlays a known byte sequence at a location of our choosing**. Both of the following paths begin from the question of how to turn that constraint into something useful. (See carrot_c4k3’s analysis.)

### Conditions Shared Across the Experiments

To compute where to place the string, you first need to know the address of the target kernel object. Both pieces of code obtained handle information from Medium integrity using `NtQuerySystemInformation`, which queries a specified class of system information. The information classes differ, though. The token PoC uses `SystemExtendedHandleInformation` (64) to locate its own token address, while the helper in this port uses `SystemHandleInformation` (16) to find the I/O Ring and process object addresses.

**Token PoC**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e61a973bf826724.png)

**I/O Ring port**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cacec6b84cce1aa8.png)

A message saying the race succeeded is also hard to take as proof that privilege escalation actually happened. So for the first path I verified a handle to a process that previously could not be opened, plus the token of the newly created child; and for the second path I verified the re-read values of the ring fields and the current process’s token. Let’s now walk through each path.

## 2\. One Write Primitive, Two Branches of Exploitation

## 2-1. First Path: Leveraging Privileges

### The Core of the Short Path

The first method targets the **token object of the current process**. The racing thread repeatedly sets the `MaximumLength` of the descriptor in the output buffer to `2`, and `Buffer` to `token + 0x40 - 4`. On this build `_TOKEN.Privileges` sits at `+0x40`, so the start address is placed 4 bytes earlier so that the fixed string overwrites the privilege masks. The main thread calls `NtQueryInformationToken` with information class 22 on the same buffer 5,000 times. After one round of racing, it requests `PROCESS_ALL_ACCESS` on `winlogon.exe` via `OpenProcess`, and repeats until the handle opens.

```cpp
ULONGLONG value = kTokenAddr + 0x40 - 4;*(WORD*)(RaceAddr + 2) = 2;             // MaximumLength*(ULONGLONG*)(RaceAddr + 8) = value;     // Buffer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5549e6f0db8b2d3.png)

The `MaximumLength = 2` here may look a little odd.

Even though the racing thread writes `2`, that doesn’t mean the kernel read that value when deciding the copy length. If `2` had been applied, only 2 bytes starting at `token + 0x3C` would have been written, and `_TOKEN.Privileges` starting at `+0x40` would not have changed. The fact that the `winlogon.exe` handle opened is better explained by the kernel having used a copy length long enough to overwrite the privilege bits *together with* the modified `Buffer` address.

### What I Confirmed

So how did the run turn out? The `winlogon.exe` handle was denied through the 30th attempt, and opened on the 32nd. When I passed that handle into `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS` - the attribute that designates the parent when creating a child process - the child recorded LocalSystem’s SID (`S-1-5-18`) and System integrity (`S-1-16-16384`).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8cea415f9574d094.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6a3a32b3537460c.png)

On this path, **the entity that became SYSTEM is the newly created child process**. It is not the result of replacing the original process’s `_EPROCESS.Token` with a SYSTEM token.

## 2-2. Second Path: Building Read and Write

Now let’s look at the I/O Ring path I reproduced this time. I followed the chain presented by carrot_c4k3, but built a port suited to a desktop environment. Unlike the preceding token path, the ring object’s state had to be adjusted across several stages. I broke the process down into **address discovery → descriptor race → repairing the fields around the ring → verifying kernel read and write → token verification → restoration**.

### A. Address Discovery

The first thing we need is the address of the ring object. An I/O Ring is an interface that queues requests to handle asynchronous I/O. The port calls `CreateIoRing(IORING_VERSION_3, ...)` to create a ring, then locates the kernel `_IORING_OBJECT` address from the results of `NtQuerySystemInformation(SystemHandleInformation)` using that handle. So you need to be able to create a ring, and you also need to know the address of the object you’re going to modify. `CreateIoRing` is available from Windows build 22000 onward, so this path can’t be applied as-is in environments where the API doesn’t exist.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dc13f9ddc320d481.png)

### B. The Descriptor Race

Next is the location of the structure to race on. The existing PoC walks the private security attribute list to find the destination descriptor. In this port I instead first searched the output buffer for the UTF-16 byte sequence of `TSA://ProcUnique`, then searched again for the pointer field pointing at that address to determine the location of `Buffer`.

Even with the same vulnerable function and the same string, **the implementations diverge starting from how they locate the race target**!!

```c
/* The core relationship visible in the experimental port */magic_ptr = address_of_UTF16_name_in(output_buf);smash_ptr = address_of_pointer_to(magic_ptr, output_buf);smash_target = ring_addr + 0x9D;/* The racing thread repeats *smash_ptr = smash_target */
```

The code above is pseudocode that keeps only the search flow.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9180875ead1dd4db.png)

The actual port zeroes out the original name location right before the query, and after the query returns it checks whether it is still zero, recording a `race-observation`. But that is only an **observation that the copy did not land in the original buffer** - it is not proof that the desired value was written into the ring.

So later on I re-read the ring fields to confirm.

#### The Value Left Behind in the Registered Buffer Pointer

Knowing the address doesn’t mean you can write 32 bytes just anywhere. You have to compute **which field the fixed string lands in, and with what value**.

I confirmed `CompletionUserEvent` at `+0xA8`, `RegBuffersCount` at `+0xB0`, and `RegBuffers` at `+0xB8`. With a fresh ring object whose `RegBuffers` is initially 0, I aligned the string’s starting point at `ring + 0x9D`. Since `0xB8 - 0x9D = 0x1B`, the first byte of `RegBuffers` becomes the 28th byte of the string.

The `00 75 00 65 00` at the end of the string lands in the lower 5 bytes of the pointer, while the upper 3 bytes remain their original 0. Read as a little-endian value, that comes out to `0x0000000065007500`.

The port reserved user-space memory with `VirtualAlloc(0x65000000, 0x100000, ...)`, which allocates memory in the process’s virtual address space, and this address falls inside that region.

Even though the string we wrote was not ours to choose, the result is **a pointer to a fake registered-buffer array placed in user memory**!!

carrot_c4k3 gives an example where the string is placed **28 bytes before** the pointer, with the last 4 bytes forming the low address. The desktop port I reproduced starts writing at `+0x9D`, which is **27 bytes before** `RegBuffers`. That’s why the last 5 bytes overlap and the result becomes `0x65007500`. The principle is the same, but it’s more accurate to **distinguish the general alignment described in the article from the alignment in the actual port**.

```
ring + 0xB0  RegBuffersCount = 0x710069006e005500ring + 0xB8  RegBuffers      = 0x0000000065007500
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f93c7512e48f009b.png)

### C. Repairing the Fields Around the Ring

There’s a problem here: because the fixed 32-byte string is written over a contiguous range, not only `RegBuffers` but also the preceding `SignalCompletionEvent`, `CompletionUserEvent`, and `RegBuffersCount` get changed along with it.  
In particular, if a bogus pointer is left in `CompletionUserEvent`, problems can arise in the completion handling of ring operations.

carrot_c4k3 explains that he recovered the event pointer by taking advantage of **the ordering in which the first I/O Ring write is performed before it hits the problem in that completion path**.

So I likewise used the first I/O Ring operation right after the race not for the attack itself, but for **repairing the ring**.

Writing `0x20` bytes of zeros starting at `ring + 0x90` overwrites the event field region at `+0x90..+0xAF`. After that I re-read `RegBuffersCount` and `RegBuffers` to confirm the values - because `race-observation=1` alone tells you nothing about whether the ring fields you wanted actually changed.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2282a555c3377027.png)

```
race-observation=1 queries=2758initial repair write succeededkernel-read status=0RegBuffersCount=710069006e005500RegBuffers=0000000065007500
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c8234cf37aa5505.png)

What stands out in the log is that `RegBuffersCount` is not a sane count like `1`, but a huge value formed out of the string’s bytes. The port only uses the first entry of the fake array, and on this build the operations it needed succeeded in that state. Afterwards I also added steps to rewrite the corrupted event list links, and to zero out the registered-buffer-related fields before exiting.

### D. Verifying Kernel Read and Write

#### Building Read and Write with a Fake Registered Buffer

Now `RegBuffers` points to the user address `0x65007500`. The next step is to fill the first entry of the array there with a fake `_IOP_MC_BUFFER_ENTRY`.

In the port I also aligned the user-side `HIORING` ‘s `RegBufferArray` to the same address and set `BufferArraySize` to `0x1000`. Into the fake entry’s `Address` and `Length` go the kernel location and size to read from or write to.

The initial fixed-string write couldn’t record the token pointer we wanted directly, but once the ring uses this fake registered buffer, we move into a **stage where we can choose our target and read and write it**. This principle has been explained in earlier I/O Ring research as well.

`BuildIoRingReadFile` and `BuildIoRingWriteFile` are the functions that compose I/O Ring file read and write requests respectively. In the port I used them as follows to move data between a file and the fake registered buffer.

| Request used in the port | Movement between file and buffer | Effect obtained in the kernel |
| --- | --- | --- |
| `BuildIoRingReadFile` | temp file → fake registered buffer’s `Address` | write to a chosen kernel address |
| `BuildIoRingWriteFile` | fake registered buffer’s `Address` → temp file | read from a chosen kernel address |

The helper code still has `Pipe` left over in its variable names, but in this desktop port the actual transport medium is two temporary files created in `%TEMP%`.

The API names can make the direction confusing, but **the request that reads from a file into the kernel buffer is the kernel write**, and **the request that exports the kernel buffer’s contents into a file is the kernel read**.

#### Validating the Read Results

The first time I tried the token swap, I had to pause for a moment. The values coming back weren’t what I expected…

I got `kernel-read status=0` and confirmed `RegBuffers=0x65007500`, yet the PIDs read from both processes came back as 0. At that point I stopped execution without writing the token pointer. Looking at the log, **even if reading the ring fields succeeded, that doesn’t mean the process field values read afterwards are correct.**

```
kernel-read status=0 RegBuffers=0000000065007500process-object status=0/0process IDs SYSTEM=0 current=0chain_exit=8
```

Chasing down the cause, it turned out that when the file-based read helper (`ioring_read`) was called consecutively, the file pointer was not returning to the start. Because of that, the next call couldn’t read the file from the beginning.

In the port’s kernel read helper `ioring_read`, I inserted `SetFilePointer(hOutPipe, 0, NULL, FILE_BEGIN)` - which changes the file’s read position - before `ReadFile`. Happily, the next run correctly showed the SYSTEM process’s PID `4` and the current PID.

What I fixed here was not the vulnerability or the ring fields, but **the file-position handling in the helper that brings data from the temporary file into the user buffer**.

### E. Token Verification

We’re almost there. Now that the read values come back correctly, shall we move on to the token swap?

The port obtains the `_EPROCESS` addresses of PID 4 and the current process from the handle information, and uses I/O Ring reads to check each object’s `UniqueProcessId` (`+0x440`) and `Token` (`+0x4B8`).

After verifying that the PIDs are the expected values, I briefly wrote the SYSTEM token value into the current process’s token field. In that state I used `GetTokenInformation`, which queries a specified item from a token, to read the `TokenUser` and `TokenIntegrityLevel` of **the current process itself**.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6eaab3257bcf58dc.png)

In the final log, `token-user-is-LocalSystem=1` means the user SID matches LocalSystem, and `integrity-RID=16384` means System integrity level. On the first path, a **newly created child process** ran with a SYSTEM token. On this path, the token field of the **original, already-running process** briefly pointed at the SYSTEM token.

```
process IDs SYSTEM=4 current=6012token-user-is-LocalSystem=1 integrity-RID=16384
```

The token swap succeeded on two separate runs. The race query counts were `27,809` and `2,758` respectively, but those numbers alone can’t be used to compare success rates or the stability of the two approaches.

### F. Restoration

After checking the token state, I rewrote the saved original **`Token`** field value. I also re-read that same field to confirm it matched the previous value.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ae81b2d0f6004426.png)

```
restore-original-token=0 verify-read=0 matches=1restore-list=0 restore-registry=0 token-check=1chain_exit=0
```

In the final run, I **re-read the token pointer to confirm the restoration**.

## 3\. Comparing the Two Paths

## The Differences That Stand Out

Now let’s compare the two paths.

Both used the same 32-byte string, and both ended with SYSTEM privileges confirmed - but the capabilities obtained in between, and the steps that had to be taken, were quite different. Let me first lay out in a table what was shared and where things diverged.

| Stage | Existing token path | This I/O Ring path |
| --- | --- | --- |
| Entry point | Security attribute output of `NtQueryInformationToken` class 22 | Same |
| Value copied | `TSA://ProcUnique`, 32 bytes UTF-16LE | Same |
| Primitive | Restricted write with a chosen address | Same |
| Object addresses needed | Current token | Current I/O Ring, then two `_EPROCESS` |
| Finding the race target | Trace the destination descriptor through the private attribute list | Search the output buffer for the string and the pointer to it |
| Driving the race | Repeatedly modify `MaximumLength` and `Buffer` | Modify only `Buffer`, observe changes at the original string location |
| Write target | `_TOKEN.Privileges` minus `4` | `_IORING_OBJECT.RegBuffers` minus `0x1B` |
| Primitive obtained after the write | A powerful handle to a process that couldn’t be opened with existing privileges | Kernel read and write through the ring |
| Privilege escalation outcome | SYSTEM child process with `winlogon.exe` as parent | Temporary swap of the current process’s token |

The first three rows of the table are identical. The same function exports the same string, and a race changes where that string gets written. But looking at the code, the way addresses are obtained, the way the descriptor is located, and the field that gets modified all differ.

And **from the moment you choose the target of the first write, the purpose of the exploit genuinely diverges.** The token path changes the privilege bits themselves; the ring path redirects a pointer toward a user buffer to create read and write capability.

## How Were the Targets Chosen?

Why a token and an I/O Ring, of all things?

First, the token path didn’t require any arbitrary pointer value. If you place the string 4 bytes before `+0x40`, where `_TOKEN.Privileges` begins, the following pattern overlaps the consecutive 8-byte `Present` and `Enabled` masks. Both values were **computed** from the string and this build’s field layout. They are not values obtained by reading token memory directly at runtime.

```
Present  (+0x40) = 0x002f002f003a0041Enabled  (+0x48) = 0x0063006f00720050Both values have bit 20 = 1
```

In the WDK headers, `SE_DEBUG_PRIVILEGE` has the number `20`. Since bit 20 is 1 in both values, this layout reads as a design intended to turn on the present and enabled bits of `SeDebugPrivilege`. Microsoft’s `OpenProcess` documentation also explains that with this privilege enabled, the requested access rights can be obtained.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/00d1429f933d01ee.png)

This lines up nicely with the fact that the `winlogon.exe` handle opened, but this particular run’s logs contain no record of directly inspecting the modified token’s privilege masks.

The useful value found on the I/O Ring path was not a privilege bit but **an address that can point at a fake array**. With the upper bytes of `RegBuffers` at 0, overlapping the tail of the string onto the pointer’s lower bytes produces `0x65007500`. Because the port actually mapped that address, the ring was able to reference a fake registered buffer in user memory. In exchange, the problem of those 32 bytes also touching the neighboring event fields had to be solved. That’s why **the first repair write and the ring state check are indispensable on this path.**

In the end, what the two choices have in common is that both found **a field where even a fixed string produces a useful state**. In the token, the bit pattern translated directly into the privilege we needed; in the ring, the pointer pattern became the entrance to the next read/write capability. Since neither could write the desired SYSTEM token pointer from the start, each path had to take the intermediate capability it obtained and use it once more.

### Which Mitigations and Constraints Mattered

Mitigations and environmental conditions also influence these choices. That said, mixing what I confirmed in my own experiments, what carrot_c4k3 described, and what I simply haven’t measured would lead to overstated conclusions. In the table below I note which stage each condition affects, together with the extent to which I verified it.

| Condition | Effect on the two paths | Extent verified |
| --- | --- | --- |
| Patched copyout path | Capturing the user buffer’s descriptor into kernel-owned memory breaks the shared restricted write, stopping both paths at the first stage | Based on public analysis and existing patch analysis; the experiments in this post were performed on a vulnerable build |
| Non-disclosure of object addresses | Both paths need target addresses, so both use handle information queries | Address acquisition on a Medium integrity VM confirmed in code and logs |
| Address disclosure restrictions at Low integrity | carrot_c4k3’s Xbox path needed an extra address-acquisition stage because of the `ExIsRestrictedCaller` check, which determines whether the caller is restricted | This reproduction was at Medium integrity, so that bypass was not tested |
| Process access checks | On the first path, `PROCESS_ALL_ACCESS` on `winlogon.exe` must flip from denied to succeeding for the next stage to be possible | Handle success observed on attempt 32 in the final run. This does not imply success against protected processes in general |
| Adjacent I/O Ring fields | On the second path, the 32 bytes also change the event pointers, so the first write must be used to repair them | First repair write succeeded and registered-buffer fields re-read and confirmed |

It’s also worth noting why a `RegBuffers` pointing at a user address works at all on the I/O Ring path. carrot_c4k3 explains that because Windows **does not use SMAP**, a design in which the kernel reads a fake structure in user memory is possible. I did not separately instrument CPU protection bits on this VM, so there is no basis in this experiment for claiming that “SMAP was bypassed.”

Mitigations that **protect code execution and control flow**, such as SMEP, Kernel CFG, and CET, also need to be handled carefully when explaining these two results. Neither path changed the instruction pointer or executed user code in the kernel - they changed data fields. So it’s hard to say these protections were directly bypassed. Likewise, I **did not run comparative experiments with HVCI/VBS on versus off.** These logs alone cannot be generalized to whether this would succeed in an environment where they are enabled.

Kernel Patch Protection (PatchGuard) on x64 monitors changes to certain kernel code and structures. Here I swapped the token pointer only briefly and then restored it; I did not measure long-running execution or whether that field is among those checked. So I **will not conclude that PatchGuard was bypassed.** (See Microsoft’s explanation of x64 kernel restrictions.)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ccfbf8343959e7e.png)

The influence of address space layout randomization is relatively clear in both pieces of code. Neither hardcodes absolute addresses of kernel objects; instead they obtain addresses at runtime from handle information and add relative offsets. That still **does not mean KASLR itself was off, or that every address-disclosure restriction was overcome.** In particular, at Low integrity there are the additional restrictions carrot_c4k3 described, so I won’t stretch this Medium integrity result to cover the entire Xbox path.

### Why the Outcomes Differed

Looking again at the first path’s choice: after finding an alignment where the fixed string turns on the privilege bits, it reached a SYSTEM child using the `winlogon.exe` handle and Windows’ process creation functionality. The capability needed in the middle was **a powerful process handle**, so the number of steps is comparatively small. That said, it is a path that leans on that process’s access checks and on the conditions for child creation, and this run did not demonstrate a capability to read and write arbitrary kernel addresses.

The second path built a mappable pointer out of the tail of the string, and expanded the ring’s registered-buffer functionality into kernel read and write. With that capability it swapped the current process’s token. But before that it had to arrange the ring object’s layout, repair the surrounding fields, move data through files, and validate that the values read were correct. Restoring the token was necessary too. **The intermediate capability became stronger, but so did the amount of state to manage and the number of failure points.**

Of course, this doesn’t mean these two paths are the only ways to use CVE-2024-30088. What this comparison does show is **how each target received the same fixed string**, and what each chain required in order to hold together on the test build. The attempt counts of the two runs are measured in different units as well, so I won’t compare which path has the higher success rate.

## 4\. Wrapping Up

Let’s return to the original question. We started from a single vulnerability - so why did the privilege escalation methods differ?

The primitive on both paths was the very same **fixed-string write**. The token path carried those bytes into the privilege masks and on to a handle capable of creating a SYSTEM child; the I/O Ring path aligned them with the registered-buffer pointer and expanded into kernel read and write.

What I found most interesting in this reproduction is that **the preparation and verification required change depending on what you choose to target after the bug.**

The values the target field can accept, the fields that get corrupted alongside it, the conditions for obtaining object addresses, and the process whose privileges you check at the end were all different. In the end, what separated the two paths was less the race itself than **which field the fixed string gets recorded in, and how that object subsequently uses the value.**

Reproducing it myself, the two roads turned out to be more different than I expected.

The moment the ring fields read back correctly but the process PIDs came out as `0` especially got me - “I thought we were done here?” After tracking down the file pointer problem, the advice that it matters more to check **whether the values for the next stage actually arrived correctly** than to see a success message really hit home.

There were more detours than I anticipated, but that made it all the more fun. Thank you for reading this far! See you in the next post 😄

## Reference

-   [carrot_c4k3, CVE-2024-30088 Pwning Windows Kernel @ Pwn2Own Vancouver 2024 (Plus Xbox)](https://exploits.forsale/pwn2own-2024/)
-   [exploits-forsale/collateral-damage public code and MIT license](https://github.com/exploits-forsale/collateral-damage)
-   [tykawaii98/CVE-2024-30088 public PoC, the commit reviewed](https://github.com/tykawaii98/CVE-2024-30088/blob/bffcbbccac2f024024938a805ab32c693b260b91/poc/main.cpp)
-   [IBM X-Force, kernel read and write via I/O Ring registered buffers](https://www.ibm.com/think/x-force/patch-tuesday-exploit-wednesday-pwning-windows-ancillary-function-driver-winsock)
-   Microsoft: [RtlCopyUnicodeString](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/wdm/nf-wdm-rtlcopyunicodestring), [OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess), [CreateIoRing](https://learn.microsoft.com/en-us/windows/win32/api/ioringapi/nf-ioringapi-createioring)
-   Microsoft: [NtQuerySystemInformation](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntquerysysteminformation), [VirtualAlloc](https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-virtualalloc), [SetFilePointer](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfilepointer), [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation)
-   [Hackyboiz one-line-a-day: the vulnerable path and patch of CVE-2024-30088](https://hackyboiz.github.io/2026/10/21/SeoPPak/CVE-2024-30088/)
