---
title: "Linux Anti-Debugging & Memory Dump Prevention: ptrace + prctl in x64 Assembly | EDR Evasion | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/anti-analysis/
source_host: netacoding.com
clip_date: 2026-10-01T10:16:04+08:00
trace_id: 405d677e-128e-47d5-9d62-9020a3679a7b
content_hash: 61260bb7c6c25aa25cc8faa64f110372cd2de8a96dfe808e4231a9d692bd3ca3
status: synced
tags:
  - Linux安全
  - 反调试
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 纯 x64 汇编利用 Linux 内核自带的 ptrace 与 prctl 机制，让进程阻止调试器附加并禁止核心转储，从而实现低层自防护与反取证。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-81c7-8c54-e3f60596f990
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 纯 x64 汇编利用 Linux 内核自带的 ptrace 与 prctl 机制，让进程阻止调试器附加并禁止核心转储，从而实现低层自防护与反取证。
> 
> - **反调试原理：** 内核规定一个进程同时只能被一个 tracer 追踪，进程启动时对自己调用 `PTRACE_TRACEME`，后续 gdb/strace 附加会返回 EPERM。
> - **系统调用混淆：** 代码不直接写死 `sys_ptrace` 编号 101，而是运行时用 `mov rax, 91` 加 `add rax, 10` 计算得出，以绕过 YARA 等静态签名扫描。
> - **结果检测：** 调用后检查 `rax`，若为负值说明已被追踪，跳转 `_exit` 用 `sys_exit`（rax=60）以退出码 1 结束进程。
> - **防内存转储：** 调用 `prctl`（syscall 157），`rdi=4`（`PR_SET_DUMPABLE`）、`rsi=0`（`SUID_DUMP_DISABLE`），在内核层面禁止为本进程生成 core dump。
> - **效果与边界：** 该设置使非 root 用户也无法读取进程内存；配合 fork 守护化并伪装成 systemd-resolved 等合法服务，可显著增大分析难度，但基于 eBPF 的内核级 EDR 仍能拦截系统调用。

## Research Context

In cybersecurity research and Red Team simulations, developing custom tools requires a deep understanding of host-based evasion. When an agent lands on a target system, modern Blue Teams and Endpoint Detection and Response (EDR) solutions will attempt to attach a disassembler or a debugger to analyze the suspicious process.

How do these processes defend themselves against analysis? In this article, we will explore the technical details of how the Linux kernel’s own mechanisms—ptrace and prctl—can be utilized for process self-defense, strictly using pure x64 Assembly.

### 1\. Preventing Debuggers with ptrace

In Linux environments, tools like gdb or strace rely on the ptrace (Process Trace) system call to inspect the internal state and system calls of a process. However, the Linux kernel enforces a golden rule: A process can only be traced by one tracer at a time.

This architectural constraint can be leveraged for defensive research. If an application sends a PTRACE_TRACEME command to itself the moment it starts, it effectively blocks any external analyst or tool from attaching to it. If an attempt is made, the operating system simply returns an EPERM (Operation not permitted) error.

Here is how this logic is implemented in pure x64 Assembly:

```nasm
_anti_debug:

    ; Dynamically calculating Syscall 101 to evade static analysis

    mov rax, 91         

    add rax, 10         ; rax = 101 (sys_ptrace)

    

    xor rdi, rdi        ; arg1 = 0 (PTRACE_TRACEME)

    xor rsi, rsi        ; arg2 = 0

    xor rdx, rdx        ; arg3 = 0

    xor r10, r10        ; arg4 = 0

    syscall

    

    ; Result check (If already being traced, rax returns negative)

    test rax, rax       

    js _exit            ; If negative, debugger detected! Terminate the process.

    ret

_exit:

    mov rax, 60         ; sys_exit

    mov rdi, 1          ; Exit with error code

    syscall
```

A key detail in the code above is that we avoid writing the sys_ptrace syscall number (101) directly into the code. Instead, we calculate it dynamically at runtime (91 + 10). This simple operation, known as Syscall Obfuscation, is a highly effective technique for bypassing static signature scans, such as YARA rules.

### 2\. Preventing Memory Dumps with prctl

We successfully blocked the debugger, but what if an incident responder takes a core dump of the process memory? When a RAM image is captured, all dynamically resolved strings, IP addresses, or command outputs become completely visible to the investigator.

To mitigate this, we can turn to prctl (syscall 157), the process control mechanism of the Linux kernel. By passing the PR_SET_DUMPABLE argument with a value of 0 to the prctl function, we give the kernel a strict directive: “Forbid the creation of core dumps for this process at the OS level.”

The implementation is quite minimal:

```nasm
_disable_memory_dump:

    mov rax, 157        ; sys_prctl

    mov rdi, 4          ; arg1 = 4 (PR_SET_DUMPABLE)

    mov rsi, 0          ; arg2 = 0 (SUID_DUMP_DISABLE)

    syscall

    ret
```

Once this function is executed, even users without root privileges are restricted from accessing the memory of your process. When combined with a process that runs in the background (daemonized via fork) and masquerades as a legitimate system service (like systemd-resolved), this technique creates a significant blind spot for analysts.

## Operational Security (OPSEC) and Conclusion

Developing a tool that secures itself by communicating directly with the kernel, without even relying on the standard libc library, elevates the code from a standard script to a work of low-level engineering.

Naturally, modern and advanced EDR solutions operating at the Kernel level (via eBPF) have the capability to intercept system calls. However, understanding and utilizing the ptrace and prctl combination is an excellent baseline technique for evading manual analysis by Incident Response teams and traditional antivirus software.

## ⚠️ Legal Disclaimer

This project is created for educational purposes and security research only. Unauthorized access to computer systems is illegal. The author is not responsible for any misuse of this tool. Operating this tool on networks you do not own is strictly prohibited.

**MITRE ATT&CK:** [T1622](https://attack.mitre.org/techniques/T1622/) · [T1497](https://attack.mitre.org/techniques/T1497/) · [T1562](https://attack.mitre.org/techniques/T1562/)

## Related

-   [Solving IP Endianness in x64 Assembly: A Single-Pass Algorithm](https://netacoding.com/posts/algorithmforprinting-ip_addresses/)
-   [VESQER: A DPCM+RLE Hybrid Compressor in Pure x64 Assembly](https://netacoding.com/posts/compressdpcm-rle/)
-   [Building a Low-Level ICMP Sniffer in x64 Assembly (Raw Sockets)](https://netacoding.com/posts/icmp_sniffer/)
