---
title: The (Almost) Forgotten Vulnerable Driver
source: https://decoder.cloud/2025/01/09/the-almost-forgotten-vulnerable-driver/
source_host: decoder.cloud
clip_date: 2026-10-01T10:14:09+08:00
trace_id: 0c56446c-b0d2-4cb3-bf5e-c3befedaa69e
content_hash: 90fe4f621fed8ec4335242bef33188f4daebabab271222ec8b8558b4a9000eb2
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: Decoder·Windows认证
ai_summary: 被遗忘的 StopZilla 签名驱动仍未被拦截：其两个 IOCTL 存在任意地址"加 1"写入原语，可提权、关闭 LSASS 的 PPL，甚至把线程 PreviousMode 改为 0 获取内核权限。
ai_summary_style: key-points:weak
images_status:
  total: 21
  succeeded: 21
  failed_urls: []
notion_page_id: 3ec75244-d011-81aa-8cdc-d2e374b7c6da
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> 被遗忘的 StopZilla 签名驱动仍未被拦截：其两个 IOCTL 存在任意地址"加 1"写入原语，可提权、关闭 LSASS 的 PPL，甚至把线程 PreviousMode 改为 0 获取内核权限。
> 
> - **驱动现状：** StopZilla 签名驱动既不在 loldrivers 数据库，也未进微软驱动黑名单，AV/EDR 同样不拦截。
> - **漏洞点：** IOCTL 0x80002063 与 0x8000206F 使用 METHOD_NEITHER，把用户态输出缓冲区地址直接交给内核且不做校验。
> - **写入原语：** 驱动先写入初值 1，随后每次调用对同一地址 +1，反复调用即可把 4 字节字段逐字节改写。
> - **令牌提权：** 把当前进程 token 的 _SEP_TOKEN_PRIVILEGES 反复递增，可开启 SeCreateToken，配合 SeAssignPrimaryToken 得到 SeTcb。
> - **关闭 PPL：** 用 NtQuerySystemInformation 取 LSASS 的 _EPROCESS 地址，改 0x878 处 SignatureLevel（24H2 起为 0x5F8），清空保护后即可 dump 密码。
> - **PreviousMode：** 把自身线程 _KTHREAD 偏移 0x231 起的 PreviousMode 置 0，获得内核态信任，可全权限打开 SYSTEM（PID 4）。
> - **版本限制：** 24H2/Server 2025 上查询 LSASS 需额外 SeDebugPrivilege，且改 PreviousMode 会直接触发 previous mode mismatch 蓝屏。

Vulnerable Windows drivers remain one of the most exploited methods attackers use to gain access to the Windows kernel. The [list](https://www.loldrivers.io/) of known vulnerable drivers seems almost endless, with some not even blocked by AV/EDR solutions or included in Microsoft’s Driver Block List.

## 被遗忘的 StopZilla 驱动

Some time ago, I revisited an old [post](https://decoder.cloud/2019/07/04/creating-windows-access-tokens/) of mine about creating tokens by exploiting a signed vulnerable and dismissed driver, [StopZilla](https://www.stopzilla.com/). This vulnerable driver flew somehow under the radar; it’s still not blocked, not in the bad driver list, and even absent from the “ [loldrivers](https://www.loldrivers.io/) ” database, well at least for now

![😉](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f6b86554472159b7.png)

The author of the research found 9 vulnerabilities:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/923d36a2e409c80a.png)

\[[https://www.greyhathacker.net/?p=1025](https://www.greyhathacker.net/?p=1025)\]

## 可利用的 IOCTL 漏洞

The most interesting and easiest-to-exploit IOCTLs were 0x80002063 and 0x8000206F, as they provide arbitrary (albeit limited) write access through the output buffer without validating the address passed for the output buffer.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/89049f46ff76fd6e.png)

With **METHOD_NEITHER** the user-mode addresses are passed directly to the kernel space without validation which can lead to serious issues if not properly handled.

The exploitation of these IOCTLs relies on the driver setting an initial value of 1 and then incrementing it arbitrarily by 1 in successive calls to the return buffer passed from user mode:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53734c554742a713.png)

## 令牌权限递增提权

By passing the current process’s token address in the return buffer of the IOCTL call, the \_SEP_TOKEN_PRIVILEGES \_TOKEN structures would be overwritten multiple times with increments of 1. It’s worth noting that the `*uVar7*` variable is an unsigned int consisting of 4 bytes.

This driver vulnerability not only allowed the activation of the **SeCreateToken** privilege but, with a bit of patience, also granted access to more immediately useful privileges like **SeTcb**, especially when combined with the **SeAssignPrimaryToken** privilege:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9c457628d011fe49.png)

I was curious to understand if this vulnerability could be used for other scopes.

First of all I tried to unset the well-known **PPL** (Protected Process Light) in LSASS process.

With PPL enabled, trying to run mimikatz for dumping passwords will give us the expected Access Denied:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d6697c894dbe2076.png)

The significant fields in \_EPROCESS structure hold these values:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3445fca7e3600ef.png)

## 篡改签名级别关闭 PPL

In theory, if I were to pass the correct address of the \_EPROCESS structure with the offset 0x878 to the driver call, it would set the SignatureLevel to 1 and zero out the next three bytes, resulting in the value \[0x01, 0x00, 0x00, 0x00\]

Obtaining the \_EPROCESS address can be achieved by the **NtQueryInformation()** API call:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7f14c5a8efc032de.png)

Let’s se if it works:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2b9c1298a1a594f.png)

The 4 bytes were correctly overwritten:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/75c7db7c14da83f2.png)

And yes it worked!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7e2507af3fef7207.png)

This can also be observed using System Informer or similar tools. The Protection on the LSASS process is empty now

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2a7acec391f9bab.png)

So far, so good, but there are some caveats:

-   To use *NtQuerySystemInformation* to retrieve the address of the LSASS process, administrative privileges are required. However, note that only the **SeLoadDriver** privilege is needed to load and start the driver, even with newer restrictions requiring configurations to be under the HKEY_LOCAL_MACHINE\\SYSTEM hive. This is because there are still many writable locations within this hive accessible to standard users
-   Starting with Windows 11 24H2 / Windows Server 2025, enabling the `**SeDebugPrivilege**` is also needed for querying the LSASS process.
-   Offsets have changed as well in these versions. Although the **ReleaseId** under the registry key *HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion* still shows 2009, the **SignatureLevel** now starts at **0x05F8** instead of **0x0878.** Be sure to check the DisplayVersion to confirm if it’s **24H2**.

## 修改 PreviousMode 获内核权限

After this experiment, I became curious to see if I could take it a step further. Why not try setting the **PreviuosMode** of my process’s thread to **0**?

Setting it to `0` indicates **kernel-mode**, meaning the thread is considered to have been running in kernel mode prior to the current execution. Threads in kernel mode are trusted, bypass many of the validation checks required for user-mode threads, and are granted **full access to kerne** l space.

The offset in the \_KTHREAD structure for `*PreviousMode*` can be easily identified using tools like *WinDbg* and remains consistent up to Windows 11 24H2:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2a27139e8873f770.png)

In this case, we need to start at least at offset 0x231 as we need to set the `*PreviousMode*` to 0 and not to 1

This time, administrative privileges are not needed since the process is our own. All that’s required is to pass the handle of our current thread to *NtQuerySystemInformation*, provided, of course, that the driver is already running

To verify that we are truly in kernel mode, we will attempt to open the protected **SYSTEM** process (PID 4) with full access and if successful, the mission will be considered accomplished:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a5e5f9900d67ae7f.png)

And yes again it worked

![🙂](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c7a2c052f383509a.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/40f5f0498b1259a0.png)

With access to kernel space, a malicious actor could potentially do anything, such as disabling EDR, modifying system processes, and bypassing security controls. Luckily, many EDR solutions intercept these operations and block them before it’s too late.

## 24H2 上的限制与蓝屏

If you’re using Windows 11 24H2 or Windows Server 2025, no worries! All you’ll get is a nice blue screen letting you know about a previous mode mismatch.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/30c80409b40ddb27.png)

That’s all for now! This post was just to give an idea of how dangerous bad forgotten drivers can be, even with a stupid increment. I don’t claim to be an expert in this area, and if you want to dig deeper, there are plenty of resources out there.

For those looking to dive into this black magic, I highly recommend the excellent series of blog [posts](https://security.humanativaspa.it/exploiting-amd-atdcm64a.sys-arbitrary-pointer-dereference-part-1/) written by my talented friend Alessandro.

Huge thanks to my usual partner in crime, @splinter_code, for demystifying some Windows internals and helping me with my most hated tool, WinDbg!
