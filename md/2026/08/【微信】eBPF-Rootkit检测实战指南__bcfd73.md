---
title: 【微信】eBPF Rootkit检测实战指南
source: https://mp.weixin.qq.com/s/z2PQSBZwfiRHPMB3QEoinw
source_host: mp.weixin.qq.com
clip_date: 2026-08-07T09:01:46+08:00
trace_id: 2a96b5d4-7f74-47f9-aebe-b85dfe5f4960
content_hash: daf1f049ac7529bfc285239067c725cdd49a35171089a77b6509b4ef91af9009
status: synced
tags:
  - 微信
  - Linux安全
  - eBPF Rootkit
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: eBPF rootkit 通过滥用 bpf_probe_write_user、bpf_override_return、bpf_send_signal 等辅助函数逃避检测；防御者应在 BPF_PROG_LOAD 加载时刻捕获程序类型与 helper 位图，而非在运行后盘点。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3b575244-d011-81f3-91db-d4ed8beb35d3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> eBPF rootkit 通过滥用 bpf_probe_write_user、bpf_override_return、bpf_send_signal 等辅助函数逃避检测；防御者应在 BPF_PROG_LOAD 加载时刻捕获程序类型与 helper 位图，而非在运行后盘点。
> 
> - **VoidLink 篡改 Netlink：** 在 `__sys_recvmsg` 的 kretprobe 中，用 `bpf_probe_write_user` 增大待隐藏消息前一条 `nlmsghdr` 的长度字段，使 `NLMSG_NEXT` 跳过包含隐藏端口的消息；因长度精确对齐，`NLMSG_OK` 仍成立，`ss` 解析不报错。
> - **LinkPro 隐藏 eBPF 枚举：** 在 `sys_enter_bpf`/`__x64_sys_bpf` 的 kprobe/kretprobe 组合中，对 `BPF_PROG_GET_NEXT_ID` 等命令命中自身 ID 时用 `bpf_override_return(ctx, -ENOENT)` 截断枚举；实际验证发现列表会在该 ID 处直接终止，且依赖 `CONFIG_BPF_KPROBE_OVERRIDE`，并会向 `trace_pipe` 输出明文调试日志。
> - **Atomic Arch 击杀调试器：** 在 `sys_enter_ptrace` tracepoint 中检查 `PTRACE_ATTACH`/`PTRACE_SEIZE`，若目标 PID 在 `hidden_pids` map 中，则对调用进程发送 `SIGKILL`，使 gdb/strace 无故退出而目标进程不受影响。
> - **加载时指纹原理：** 这些技术都依赖罕见 helper 且仅以 kprobe/tracepoint 附加；eBPF 指令将 helper ID 编码在 `BPF_CALL` 的 imm 字段，验证器在 `check_helper_call()` 时仍保留原始 ID，Datadog WP 通过 `security_bpf_prog` LSM 和 `check_helper_call` kprobe 在加载时刻记录类型、附加类型、名称、tag 及 helper 位图。
> - **检测规则：** 三条规则均匹配 `BPF_PROG_LOAD` 并分别检查 `BPF_PROBE_WRITE_USER`、`BPF_OVERRIDE_RETURN`、`BPF_SEND_SIGNAL`/`BPF_SEND_SIGNAL_THREAD`；多个信号在一小时内并发出现时，关联规则可标记高置信度 rootkit 安装。

**云原生安全指北** *2026年8月7日 08:35*

> 注：本文翻译自 Datadog 的文章《Detection primitives for eBPF rootkits》 \[1\] ，可点击文末“阅读原文”按钮查看英文原文。

## 一、引言

在过去几年中，Linux恶意软件开发者开始使用eBPF rootkit来逃避传统和现代防御机制。在野发现的样本能够绕过长期以来被认为难以逃避的工具（如 `ss` ），以及那些假设攻击者无法触及内核级自检机制的工具（如 `bpftool` ）。它们还能挫败 `ptrace` 等常见的追踪原语。LinkPro \[2\] （译文详见： [LinkPro：针对云环境的eBPF rootkit剖析](https://mp.weixin.qq.com/s?__biz=MzIyMzM2MzE1OQ==&mid=2247484544&idx=1&sn=14c6e5bf123525953e46bd703a7145ca&scene=21#wechat_redirect) ）、VoidLink \[3\] （译文详见： [VoidLink：隐秘的云原生Linux恶意软件框架剖析](https://mp.weixin.qq.com/s?__biz=MzIyMzM2MzE1OQ==&mid=2247485069&idx=1&sn=23b45eab0c68baf15363d30bbf47806f&scene=21#wechat_redirect) ）以及最近的Atomic Arch \[4\] 攻击行动都采用了这些手法。

我们不打算逐一完整描述每个恶意软件家族，而是从每个家族中选取一个具有启发性的特性深入剖析，研究其技术原理、防御者应关注的数据以及我们据此构建的检测规则。先从VoidLink开始，它通过将一个调试辅助函数转化为精确的内存编辑器，找到了一种出人意料地干净利落的方式来向 `ss` 隐藏活跃连接。

### 1.1 VoidLink：bpf_probe_write_user()的巧妙利用

`bpf_probe_write_user()` 辅助函数允许从eBPF程序内部覆写用户空间内存。官方文档 \[5\] 将其描述为"调试、转移和操控半协作进程执行"的工具。这使其成为rootkit眼中极具吸引力的原语，VoidLink的开发者正是利用它来绕过 `ss` 。

`ss` 工具通过Netlink子系统获取打开的套接字统计信息。当运行 `ss -tn` 显示活跃TCP连接时，涉及三个系统调用：

1.  1\. `socket(AF_NETLINK, SOCK_RAW, NETLINK_INET_DIAG)` 打开一个原始Netlink套接字。 `AF_NETLINK` 告知内核这是一个通向内核子系统的IPC通道，而非网络套接字（socket）。
    
2.  2\. `sendmsg(fd, request)` 向内核发送结构化请求。消息包含两部分：（1）Netlink头部，指定消息类型（ `SOCK_DIAG_BY_FAMILY` ）和请求完整转储的标志（ `NLM_F_DUMP` ）；随后是（2） `inet_diag_req_v2` 请求体。该请求体设置三个字段：协议族（ `AF_INET` ）、协议（ `IPPROTO_TCP` ）和套接字ID（置零表示通配，匹配所有套接字）。
    
3.  3\. `recvmsg(fd, buffer)` 读取内核响应：一个由 `inet_diag_msg` 记录组成的多部分数据流，每个套接字对应一条记录，以 `NLMSG_DONE` 结尾。每条记录包含源/目的IP和端口、TCP状态、所属用户UID以及inode号。
    

内核将这些响应组织为TLV（类型，长度，值）消息链：每条消息以携带类型和长度的 `nlmsghdr` 头部开头，紧跟着是载荷。用户空间解析器通过 `NLMSG_OK` 和 `NLMSG_NEXT` 等宏遍历这条链，这些宏使用长度字段作为游标，从一条消息前进到下一条。

VoidLink需要在特定端口上隐藏连接，这是rootkit的标准功能。它在 `__sys_recvmsg` 的入口处放置一个 `kprobe` ，在系统调用运行前捕获用户空间缓冲区指针——这是唯一能获取系统调用参数的时机。配对的 `kretprobe` 在内核用套接字数据填充缓冲区之后、用户空间读取之前触发。此时， `bpf_probe_write_user` 就地篡改缓冲区：它会增大待隐藏消息 **前一条** 消息的长度字段，使膨胀后的长度完全吞掉被隐藏的消息，解析器的游标直接跳过它。

bpf_probe_write_user()篡改前后对比：nlmsg A的长度字段被增大，NLMSG_NEXT直接从A跳到C，完全跳过被隐藏的消息B

`NLMSG_NEXT` 按 `NLMSG_ALIGN(h->nlmsg_len)` 推进游标。当 `A.nlmsg_len=112` 时，游标从位置0直接跳到位置112，落在消息C上。而承载rootkit想要隐藏的端口的那条消息B，被完全跳过。

这个技巧不会破坏 `ss` 的解析，因为 `NLMSG_OK` 此时只检查一个关键条件： `nlmsg_len <= len` ，其中 `len` 是缓冲区剩余字节数。VoidLink将A的长度精确增大 `NLMSG_ALIGN(B.nlmsg_len)` ——即缓冲区中实际存在的字节大小——因此膨胀后的长度始终不会超出剩余空间。 `NLMSG_OK` 持续返回true， `NLMSG_NEXT` 正确落在下一条消息上，解析器既不会越界读取，也看不到任何不一致。从 `ss` 的角度看，消息A只是比平时稍长了一点。

### 1.2 LinkPro：bpf_override_return()的威力

`bpf_override_return()` 可以从eBPF程序内部替换内核函数的返回值。内核对此有严格限制：该辅助函数只能从附加到内核源码中标记为 `ALLOW_ERROR_INJECTION` 的函数上的 `kprobe` 类型程序中调用，且宿主机内核必须以 `CONFIG_BPF_KPROBE_OVERRIDE=y` 编译。在这些条件下，当 `kprobe` 触发时，该辅助函数将所选值写入保存的返回寄存器，并完全跳过原函数。对用户空间而言，看起来就像是内核本身产生了那个结果。内核团队设计此辅助函数是为了在 `bpf_trace` 风格的测试中进行故障注入，但对任何想让内核替自己撒谎的rootkit来说，这显然是一个诱人的原语。

LinkPro使用 `bpf_override_return()` 来隐藏自身的eBPF程序，使其无法被枚举。该恶意软件的Hide模块在 `sys_enter_bpf` （ `handleBpfEnter` ）上附加了一个跟踪点（tracepoint），监控三个枚举命令—— `BPF_PROG_GET_NEXT_ID` (11)、 `BPF_MAP_GET_NEXT_ID` (12)和 `BPF_LINK_GET_NEXT_ID` (31)——并将调用上下文暂存在以 `pid_tgid` 为键的map中。配对的 `kretprobe` 挂在 `__x64_sys_bpf` （ `handleBpfExit` ）上，在返回路径触发，取出暂存的上下文，读取内核即将返回给用户空间的 `next_id` ，并与 `main_ebpf_progs` （用户空间组件用LinkPro自身程序ID填充的允许列表）比对。匹配时，它调用 `bpf_override_return(ctx, -ENOENT)` 。调用者（ `bpftool` 、 `libbpf` 或任何遍历程序列表的工具）看到 `-ENOENT` ，就会认为没有更多条目了。

这个细节对检测工程师很重要。 `-ENOENT` 是 `GET_NEXT_ID` 遍历的自然终止符，因此在迭代的任何位置返回它都会停止枚举器，而不是跳过一条记录。我们在实际内核上验证了这一点：加载模块后，我们用单个良性程序ID填充 `main_ebpf_progs` ，运行 `bpftool prog list` ，观察到列表在该ID处被截断。所有更高ID的程序也消失了，无论它们是否在允许列表中。Hide模块的机制比开发者可能预期的更强大，但它也留下了清晰的检测信号：防御者将枚举结果与 `bpftool prog show id N` （该命令使用 `BPF_PROG_GET_FD_BY_ID` ，此hook不会拦截）进行对比，就能发现差异。

LinkPro还留下了看似无意的用户空间痕迹。 `handleBpfEnter` 和 `handleBpfExit` 都会调用 `bpf_printk` ，分别输出 `"BPF cmd: %d, start_id: %u"` 和 `"HIDING NEXT_ID: %u"` ，这些输出在每次被拦截的系统调用时以纯文本形式流向 `/sys/kernel/debug/tracing/trace_pipe` 。防御者和安全软件可以轻易发现这一点，但可能会将其视为恶意软件开发者的遗留物，因此不应将其作为主要检测机制。

```sql
---------------------------------------------------------------------------
kretprobe___x64_sys_bpf:0000000000002050
kretprobe___x64_sys_bpf:0000000000002050 LBB5_10:                                ; CODE XREF: handleBpfExit+138up j
kretprobe___x64_sys_bpf:0000000000002050                 mov            r2, r10
kretprobe___x64_sys_bpf:0000000000002058                 add            r2, -0xC
kretprobe___x64_sys_bpf:0000000000002060                 lddw           r1, 0
kretprobe___x64_sys_bpf:0000000000002070                 call           1
kretprobe___x64_sys_bpf:0000000000002078                 jeq            r0, 0, LBB5_9
kretprobe___x64_sys_bpf:0000000000002080                 ldxb           r1, [r0]
kretprobe___x64_sys_bpf:0000000000002088                 jne            r1, 1, LBB5_9
kretprobe___x64_sys_bpf:0000000000002090                 ldxw           r3, [r10-0xC]
kretprobe___x64_sys_bpf:0000000000002098                 lddw           r1, 26
kretprobe___x64_sys_bpf:00000000000020A8                 mov            r2, 19
kretprobe___x64_sys_bpf:00000000000020B0                 call           6        ; bpf_trace_printk("HIDING NEXT_ID: %u", 19, next_id): debug log confirming suppression;
kretprobe___x64_sys_bpf:00000000000020B0                                         ; visible in /sys/kernel/debug/tracing/trace_pipe
kretprobe___x64_sys_bpf:00000000000020B8                 mov            r1, r6
kretprobe___x64_sys_bpf:00000000000020C0                 mov            r2, -2   ; -ENOENT: the injected return value;
kretprobe___x64_sys_bpf:00000000000020C0                                         ; tells the caller the next_id does not exist
kretprobe___x64_sys_bpf:00000000000020C8                 call           58       ; call bpf_override_return(ctx, -ENOENT):
kretprobe___x64_sys_bpf:00000000000020C8                                         ; overwrites sys_bpf return value in pt_regs before userspace sees it.
kretprobe___x64_sys_bpf:00000000000020C8                                         ; Requires CONFIG_BPF_KPROBE_OVERRIDE.
kretprobe___x64_sys_bpf:00000000000020C8                                         ; Any tool calling BPF_PROG_GET_NEXT_ID/BPF_MAP_GET_NEXT_ID/BPF_LINK_GET_NEXT_ID
kretprobe___x64_sys_bpf:00000000000020C8                                         ; that receives this next_id will get -ENOENT and skip it, hiding the program from bpftool and libbpf enumeration.
kretprobe___x64_sys_bpf:00000000000020D0                 ja             LBB5_13
kretprobe___x64_sys_bpf:00000000000020D0 ; End of function handleBpfExit
kretprobe___x64_sys_bpf:00000000000020D0
kretprobe___x64_sys_bpf:00000000000020D0 ; end of 'kretprobe___x64_sys_bpf'
kretprobe___x64_sys_bpf:00000000000020D0
license:00000000000020D8 ; ===========================================================================LinkPro handleBpfExit()函数的注解反汇编
```

### 1.3 Atomic Arch：用bpf_send_signal()杀死进程

```sql
tp_syscalls_sys_enter_ptrace:0000000000000EE8 enter_ptrace:                           ; tracepoint: sys_enter_ptrace, kill callers trying to attach to hidden PIDs
tp_syscalls_sys_enter_ptrace:0000000000000EE8                 ldxdw          r2, [r1+0x10]
tp_syscalls_sys_enter_ptrace:0000000000000EF0                 jeq            r2, 0x4206, loc_F00 ; request == PTRACE_SEIZE (0x4206)?
tp_syscalls_sys_enter_ptrace:0000000000000EF8                 jne            r2, 0x10, unk_F50 ; request == PTRACE_ATTACH (0x10)?
tp_syscalls_sys_enter_ptrace:0000000000000F00
tp_syscalls_sys_enter_ptrace:0000000000000F00 loc_F00:                                ; CODE XREF: tp_syscalls_sys_enter_ptrace:0000000000000EF0up j
tp_syscalls_sys_enter_ptrace:0000000000000F00                 ldxdw          r1, [r1+0x18] ; load target pid from tracepoint ctx->pid (offset 0x18)
tp_syscalls_sys_enter_ptrace:0000000000000F08                 stxw           [r10-4], r1
tp_syscalls_sys_enter_ptrace:0000000000000F10                 mov            r2, r10
tp_syscalls_sys_enter_ptrace:0000000000000F18                 add            r2, -4
tp_syscalls_sys_enter_ptrace:0000000000000F20                 lddw           r1, 0    ; map fd: hidden_pids
tp_syscalls_sys_enter_ptrace:0000000000000F30                 call           1        ; bpf_map_lookup_elem(hidden_pids, &target_pid)
tp_syscalls_sys_enter_ptrace:0000000000000F38                 jeq            r0, 0, unk_F50 ; target pid not in hidden_pids, allow ptrace
tp_syscalls_sys_enter_ptrace:0000000000000F38 ; ---------------------------------------------------------------------------
tp_syscalls_sys_enter_ptrace:0000000000000F40                 db 0xB4                 ; mov32 r1, 9  [BPF_MOV32_IMM, unsupported by plugin] ; r1 = SIGKILL
tp_syscalls_sys_enter_ptrace:0000000000000F41                 db    1
tp_syscalls_sys_enter_ptrace:0000000000000F42                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F43                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F44                 db    9
tp_syscalls_sys_enter_ptrace:0000000000000F45                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F46                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F47                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F48 ; ---------------------------------------------------------------------------
tp_syscalls_sys_enter_ptrace:0000000000000F48                 call           0x6D     ; bpf_send_signal(SIGKILL), helper #109 (0x6D), kill the calling process
tp_syscalls_sys_enter_ptrace:0000000000000F48 ; ---------------------------------------------------------------------------
tp_syscalls_sys_enter_ptrace:0000000000000F50 unk_F50:        db 0xB4                 ; CODE XREF: tp_syscalls_sys_enter_ptrace:0000000000000EF8up j
tp_syscalls_sys_enter_ptrace:0000000000000F50                                         ; tp_syscalls_sys_enter_ptrace:0000000000000F38up j
tp_syscalls_sys_enter_ptrace:0000000000000F50                                         ; r0 = 0; exit
tp_syscalls_sys_enter_ptrace:0000000000000F51                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F52                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F53                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F54                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F55                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F56                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F57                 db    0
tp_syscalls_sys_enter_ptrace:0000000000000F58 ; ---------------------------------------------------------------------------
tp_syscalls_sys_enter_ptrace:0000000000000F58                 ret
tp_syscalls_sys_enter_ptrace:0000000000000F58 ; end of 'tp_syscalls_sys_enter_ptrace'
```

上述反汇编展示了eBPF辅助函数的另一种创造性用法。这个 `enter_ptrace` 程序附加到 `tp/syscalls/sys_enter_ptrace` tracepoint，使它在内核处理每个 `ptrace()` 调用之前就能观察到它们。程序首先检查 `request` 参数，仅在请求为 `PTRACE_ATTACH` 或 `PTRACE_SEIZE` 时才采取行动——这是将调试器或追踪工具附加到运行中进程的两种操作。任何其他 `ptrace` 操作（例如从已被追踪的进程中读取内存）都会正常进行。

当检测到附加尝试时，程序提取目标PID，并在 `hidden_pids` 中查找——这是嵌入在Atomic Arch攻击行动中的rootkit维护的map，保存着它所保护的进程PID。如果目标PID匹配，程序调用 `bpf_send_signal(9)` ，但它是向 **调用进程** 发送 `SIGKILL` ，而不是目标进程。它杀死的是调试器，而非调试器试图附加的进程。

因为这一切在内核中先于 `ptrace()` 执行，附加操作永远不会完成。从分析人员的角度看， `gdb` 或 `strace` 只是无缘无故地崩溃，没有任何可见迹象表明是eBPF rootkit导致的。

## 二、如何在eBPF程序行动之前观察它们

这三种技术有一个共同的结构性弱点：它们都依赖一小撮在生产环境追踪程序中几乎没有合法用途的eBPF辅助函数。再加上三者都仅以 `kprobe` 或 `tracepoint` 形式附加，指纹就变得足够精确，可以据此构建检测。这种组合（罕见的辅助函数+狭窄的程序类型）就是检测面。

要了解Datadog Agent的Workload Protection（WP） \[6\] 传感器如何捕获这个指纹，我们需要理解内核如何编码辅助函数调用，以及这种编码在何时可见。

当从C语言编译eBPF程序时，像 `bpf_map_lookup_elem(&my_map, &key)` 这样的调用不会变成普通的函数调用。eBPF没有链接器，也没有内核符号的概念。相反，编译器将该调用编码为一条 `BPF_CALL` 指令，其32位立即数字段保存一个小整数：一个 **helper ID**，即 `enum bpf_func_id` 中的某个值（例如 `BPF_FUNC_map_lookup_elem = 1` ）。通过 `bpf(2)` 系统调用到达内核的程序，本质上就是一个由8字节指令组成的数组：

bpf_insn指令将BPF_CALL的helper ID编码在32位imm字段中；验证器随后将该helper ID重写为可调用的地址

验证器分两个阶段将helper ID转换为可调用的内容。首先， `check_helper_call()` 向程序类型的ops表 `env->ops->get_func_proto(func_id, prog)` 请求一个 `struct bpf_func_proto` 。该结构体携带辅助函数的参数类型、返回类型，以及指向实际内核实现的函数指针 `fn->func` （例如 `bpf_map_lookup_elem` ）。验证器用它来做类型检查，但此时还不会修补指令。之后，在 `do_misc_fixups()` 中，它重写指令：

```rust
fn = env->ops->get_func_proto(insn->imm, env->prog);
insn->imm = fn->func - __bpf_call_base;
```

`imm` 只有32位，因此内核将辅助函数编码为相对固定锚点符号 `__bpf_call_base` 的 **有符号偏移量**。解释器和每个JIT后端都会加回 `__bpf_call_base` 以恢复真实地址。到程序运行时， `call #1` 已经变成了 `call <bpf_map_lookup_elem>` 。但在加载时的验证阶段，原始helper ID仍然位于 `insn->imm` 中，正是防御者可以读取的位置。

这种两阶段流程使得从另一个eBPF程序观察辅助函数成为可能。Datadog Agent的WP传感器用自己的探针包裹 `bpf(2)` 系统调用，并通过在系统调用 **期间** 触发的Linux Security Module（LSM）和验证器hook收集元数据来丰富每个事件：

WP传感器的加载时流水线：在系统调用入口缓存上下文，通过security_bpf_prog LSM hook读取程序身份，在验证器重写之前通过check_helper_call上的kprobe获取原始helper ID，然后在系统调用退出时将身份和辅助函数拼合为一个事件

具体来说：

-   • **程序类型（Program type）** 来自 `security_bpf_prog` LSM hook，其第一个参数是刚分配的 `struct bpf_prog` 。探针通过 `bpf_probe_read` 读取 `prog->type` 、 `prog->expected_attach_type` 、 `prog->aux->id` 、 `prog->aux->name` 和 `prog->tag` 。
    
-   • **辅助函数（Helpers）** 来自 `check_helper_call` 上的 `kprobe` ，它在 `do_misc_fixups` **之前** 触发，此时 `insn->imm` 仍保存着原始helper ID。随后，它将该辅助函数对应的位OR进每个PID系统调用缓存上的一个由三个 `u64` 组成的位图——这是一个紧凑的记录，标明程序调用了大约192个辅助函数中的哪些。
    
-   • **Agent将两者拼合。** 当同一次加载触发 `security_bpf_prog` 时，它将辅助函数位图连同类型、名称和tag一起复制到每条程序的记录中。在系统调用退出时，Agent发出一个携带程序完整指纹的事件：类型、附加类型、名称、tag、ID、关联的map元数据，以及它可调用的精确辅助函数集合。
    

加载时刻是内核视角下eBPF程序可被信任的最后一刻。一旦程序完成附加，检测器所依赖的假设就会崩塌：rootkit可以挂钩 `getdents` 来向用户空间枚举隐藏自身的文件描述符，篡改其他探针看到的 `bpf_get_current_pid_tgid` 结果，改写发往安全工具的系统调用返回值，将自己从 `bpf(BPF_PROG_GET_NEXT_ID)` 列表中剔除，甚至直接分离Agent自身的探针。此后进行的任何盘点，都是透过攻击者可以控制的透镜来观察。

而在加载时刻，这一切都还不可能发生。程序仍然是一块惰性的指令集合，正接受验证器的检查。它没有附加点，没有执行上下文，也无法干扰正在观察它的探针。在这一瞬间捕获的指纹（程序类型、附加类型、名称、tag、map引用，以及从其指令流中可触及的精确辅助函数集合）就是后续一切对比所依据的基准事实。在程序能够行动之前捕获它——仅此一次——正是下游检测得以实现的基础。

## 三、检测规则

加载时指纹可直接转化为检测规则。由于WP传感器在程序行动之前就捕获了辅助函数位图，一条检查 `BPF_PROBE_WRITE_USER` 的规则会在VoidLink的缓冲区篡改程序提交给内核的那一刻触发，远在它触碰Netlink响应之前：

```
bpf.cmd == BPF_PROG_LOAD && BPF_PROBE_WRITE_USER in bpf.prog.helpers
```

同样的原理能在加载时捕获LinkPro隐藏枚举的kretprobe：

```
bpf.cmd == BPF_PROG_LOAD && BPF_OVERRIDE_RETURN in bpf.prog.helpers
```

还能在干掉任何一个调试器之前捕获ptrace杀死的跟踪点（tracepoint）：

```
bpf.cmd == BPF_PROG_LOAD && (BPF_SEND_SIGNAL in bpf.prog.helpers || BPF_SEND_SIGNAL_THREAD in bpf.prog.helpers)
```

三条规则结构相同：它们匹配 `BPF_PROG_LOAD` 和特定的helper位，不依赖程序名称、进程树或任何运行中的rootkit可能破坏的可观察对象。当合法软件确实使用了这些辅助函数之一时，你可以缩小规则范围——例如按进程路径或名称排除已知的追踪框架——而不会削弱针对未知加载器的检测信号。

单条规则本身只能标记一次可疑加载。将它们串联为带有一小时时间窗口的关联规则，当两个或更多此类辅助函数的信号并发出现时——尤其是来自交互式shell、或位于全局可写目录中的二进制文件——就会产生高置信度的eBPF rootkit安装信号。这种关联捕获了每条独立规则仅能暗示的内容：一个需要写入用户空间内存、覆盖内核返回值 **并且** 杀死附加进程的程序，几乎不可能是追踪工具。而且Agent在程序有机会隐藏之前就已经记录下了证据。

## 四、结论

eBPF rootkit之所以行之有效，是因为它们将恶意软件的隐藏逻辑藏匿在受信任的组件中：系统调用返回路径、用户空间缓冲区、追踪接口和内核中介的枚举机制。VoidLink、LinkPro和Atomic Arch使用不同的辅助函数达成不同的效果，但它们都暴露了同一个防御机会：辅助函数能力在加载时即可获知——在程序能够附加并开始操控宿主回传数据之前。

检测工程师应将 `BPF_PROG_LOAD` 视为最高信任点，捕获完整的加载时指纹。对于 `bpf_probe_write_user()` 、 `bpf_override_return()` 和 `bpf_send_signal()` 等不常见的辅助函数，应保持警惕，尤其是当它们同时出现或源自可疑加载器时。防御者在加载时，即在rootkit运行并试图隐藏自己之前，拥有最高的检测概率。本文介绍的技术只是在野观察到的例子，但eBPF的能力确实极其强大，攻击者可以自由地发挥他们的创造力。我们完全有必要投入更多时间去预判攻击者未来可能如何利用eBPF达成自己的目的。

#### 引用链接

`[1]` 《Detection primitives for eBPF rootkits》: *https://securitylabs.datadoghq.com/articles/detection-primitives-for-ebpf-rootkits/*  
`[2]` LinkPro: *https://www.synacktiv.com/en/publications/linkpro-ebpf-rootkit-analysis*  
`[3]` VoidLink: *https://research.checkpoint.com/2026/voidlink-the-cloud-native-malware-framework/*  
`[4]` Atomic Arch: *https://www.sonatype.com/blog/atomic-arch-npm-campaign-adds-malicious-dependency*  
`[5]` 官方文档: *https://docs.ebpf.io/linux/helper-function/bpf_probe_write_user/*  
`[6]` Workload Protection（WP）: *https://docs.datadoghq.com/security/workload_protection/*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2e9f2afdf731583c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c19d0cf9f99f5dd4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cad7850d1297bc10.gif)

**交流群**

**知识库**

收录于云安全技术干货
