---
title: Frida Android Spawn 机制分析
source: https://tsingshui.art/work/android/frida-spawn-android/
source_host: tsingshui.art
clip_date: 2026-11-23T10:33:08+08:00
trace_id: eb6e8f32-3c43-481c-a1ca-4a0ae5cdd799
content_hash: 6ab7df6e4d30a81c08d499748582b3539898011a200891d2b37e95667061de42
status: synced
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42175244-d011-8115-a697-c29424221ad7
ioc: null
---

## 前言

在对 Android App 做动态分析时， `frida.spawn()` 是最常用的入口之一——它能在 App 任何业务代码执行前完成 hook 植入。但这个"暂停再注入"的过程，底层究竟是怎么做到的？

Frida 在 Android 上的 spawn 实现分两条路径：

-   **路径 B（二进制文件）**：目标以 `/` 开头，走 `fork + ptrace + execve` ，和 Linux 通用逻辑一致。
-   **路径 A（App 包名）**：目标不以 `/` 开头，走 `RoboLauncher + Zymbiote` ，这是 Android 专有的实现。

本文只讲路径 A。源码基于 `frida-core` ，核心文件： `src/linux/linux-host-session.vala` 。

* * *

## 整体思路

Android App 的进程由 zygote fork 出来。Frida 的策略是： **提前在 zygote 里埋钩子**，这样每次 zygote fork 新 App 进程时，钩子自动继承到子进程，Frida 就能在 App 任何代码执行前拿到控制权。

这个钩子载体叫 **Zymbiote**，是一段平台相关的 ELF blob（ARM64/ARM/x86_64/x86），在 frida-server 启动时就写进 zygote 的内存空间，等待被 fork 进任意 App 进程。

整体流程分四个阶段：

```
0. frida-server 启动   — preload：向 zygote 注入 Zymbiote，建立 socket server
1. spawn() 调用        — 通过 ActivityManager 触发 zygote fork
2. Zymbiote 拦截       — 在新进程里连回 Frida，raise(SIGSTOP) 自我暂停
3. resume()            — 注入 agent，回滚 patch，SIGCONT 放行
```

* * *

## frida-server 启动：preload

Zymbiote 注入 **不等 `spawn()` 调用**，而是在 frida-server 启动、监听端口就绪后立即异步执行（ `control-service.vala:127` ）。这个 preload 优化的目的是把耗时的注入操作提前做掉，让第一个 `spawn()` 请求到来时无需等待。

frida-server 提供了 `--disable-preload` （ `-P` ）参数，关闭后推迟到第一次 `spawn()` 时才注入。

preload 做两件事：

**1\. 建立 Unix socket server**

创建一个抽象域 socket，地址格式为 `/frida-zymbiote-<UUID>` ，用于后续接收 Zymbiote 的连接回报。这个地址会被写进 Zymbiote payload 的配置区，让它知道往哪里连。

**2\. 向 zygote 写入 Zymbiote**

枚举系统进程，找到 `zygote` 、 `zygote64` 、 `usap32` 、 `usap64` ，对每个执行注入：

```
SIGSTOP 冻结 zygote
  ↓
轮询 /proc/[pid]/stat，等状态变为 'T'
  ↓
通过 /proc/[pid]/mem 直接写入 Zymbiote payload（ELF blob）
  ↓
劫持两个函数指针：
  android.os.Process.setArgV0()  →  frida_zymbiote_replacement_setargv0
  selinux_android_setcontext()   →  frida_zymbiote_replacement_setcontext
  ↓
SIGCONT 恢复 zygote
```

注入 **Zymbiote** 全程通过 `/proc/[pid]/mem` 直接写内存，不需要 ptrace。被劫持的原始字节会记录下来，供后续回滚。

Zymbiote payload 的配置区里预先嵌入了：

-   socket 地址（64 bytes）
-   payload 自身的 base 地址和大小
-   `selinux_android_setcontext` 和 `Process.setArgV0` 的原始地址
-   12 个 libc 函数的地址（ `mprotect` 、 `socket` 、 `connect` 、 `sendmsg` 、 `recv` 、 `raise` 等）

* * *

## 第一阶段：触发 App 启动

客户端调用 `frida.spawn("com.example.app")` 后，Frida 通过 `AndroidHelperClient` 向 helper service 发 JSON 请求：

```go
["stop-package",   package, uid]   // 先停掉已有实例，确保干净启动
["start-activity", package, ...]   // 通知 ActivityManager 启动 App
```

ActivityManager 通知 zygote fork 新进程。由于 Zymbiote 已经在 zygote 内存里，fork 出来的子进程天然继承了它。

* * *

## 第二阶段：Zymbiote 拦截新进程

新进程在 Android runtime 初始化阶段，会调用 `android.os.Process.setArgV0()` 设置进程名，这是每个 App 进程启动流程里的固定步骤，时机早于 `Application.onCreate()` ，也早于任何 so 的 `JNI_OnLoad` 。

此时命中 Zymbiote 的 hook（ `zymbiote.c` ）：

```c
// frida_zymbiote_replacement_setargv0 核心逻辑（伪代码）

// 连接 RoboLauncher 的 socket
int fd = socket(AF_UNIX, SOCK_STREAM, 0);
connect(fd, server_addr, ...);

// 发送 hello：{pid, ppid, package_name}
sendmsg(fd, &hello_msg, 0);

// 等待 ACK
recv(fd, &ack, 1, 0);
close(fd);

// 清理自身占用的内存
mprotect(payload_base, payload_size, original_prot);
free(package_name);

// 自我暂停，等待 Frida 完成后续操作
raise(SIGSTOP);
```

`raise(SIGSTOP)` 是 Zymbiote **自己发给自己** 的，进程挂在这里，等待 Frida 回滚 zygote 里的函数指针 patch，再由 Frida 发 `SIGCONT` 放行。

对 App 而言，这一切发生在业务代码执行之前，完全无感。

* * *

## 第三阶段：注入 agent 与恢复

RoboLauncher 的 socket server 收到 Zymbiote 的 hello 后（ `linux-host-session.vala:1967` ）：

1.  解析 `{pid, ppid, package_name}` ，resolve Promise， `spawn()` 返回 PID 给调用方
2.  此时新进程仍在等待 ACK，处于活跃状态（尚未 SIGSTOP）

调用方拿到 PID 后，执行 agent 注入。注入阶段 **需要 ptrace**： `ptrace(SEIZE/ATTACH)` attach 目标进程，操控寄存器，驱动目标进程执行 `dlopen` 加载 `frida-agent.so` ，完成后 detach。内存写入优先尝试 `process_vm_writev` （kernel >= 3.2），失败才退回 `ptrace(POKEDATA)` 。

注入完成后调用 `resume(pid)` ，触发 `ZymbioteConnection.resume()` （ `linux-host-session.vala:2090` ）：

```vala
// 1. 发送 ACK，Zymbiote 收到后开始清理并 raise(SIGSTOP)
yield conn.output_stream.write_async ({ 0x42 });

// 2. 等 socket 关闭（Zymbiote close(fd) 后 read 返回 EOF）
yield conn.input_stream.read_async (buf, 1);

// 3. 轮询 /proc/[pid]/stat，等状态变为 'T'
yield wait_until_stopped (pid);

// 4. 回滚 zygote 里的函数指针 patch
patches.revert ();

// 5. SIGCONT 放行
Posix.kill (pid, Posix.Signal.CONT);
```

**为什么要等 SIGSTOP 之后再回滚 patch？**

Zymbiote 收到 ACK 后，会先用 `mprotect` 恢复 payload 内存的保护属性、 `free` package_name 字符串，这些操作依赖 payload 里存储的函数地址。只有 Zymbiote 完成自身清理并 `raise(SIGSTOP)` 后，Frida 才能安全地回滚 zygote 里的函数指针——否则 patch 一旦提前回滚，Zymbiote 还在执行中却找不到原始函数地址，会直接崩溃。

**host 如何感知 SIGSTOP？**

`wait_until_stopped()` 不用 ptrace，而是轮询 `/proc/[pid]/stat` ，等进程状态字段变为 `T` ，使用指数退避轮询（0/1/2/5/10/20/50/250 ms）。

* * *

## 完整时序

```
RoboLauncher新 App 进程zygoteRoboLauncher新 App 进程zygotefrida-server 启动时 preload/proc/[pid]/mem 写入 Zymbiote劫持 setArgV0 / setcontext等待 spawn() 调用...start_package()setArgV0() 命中 Zymbiote hookresolve Promise，spawn() 返回 PIDptrace(SEIZE/ATTACH)写入 agent.so，远程 dlopenptrace detachmprotect 恢复内存保护free package_name，close socketraise(SIGSTOP)轮询 /proc/[pid]/stat 等 'T'patches.revert() 回滚函数指针App 正常运行SIGSTOP（冻结 zygote）SIGCONT（恢复 zygote）fork()connect + hello {pid, ppid, package}ACK (0x42)SIGCONT（放行）
```

* * *

## 几个细节

**为什么选 `setArgV0` 作为 hook 点？**

`Process.setArgV0()` 在 zygote 特化（specialization）阶段被调用，时机非常早，早于 `Application.onCreate()` ，也早于任何 so 的 `JNI_OnLoad` 。同时它在每个 App 进程里必然调用一次，是个可靠的拦截点。

**USAP（Unspecialized App Process）**

Android 10+ 引入了 USAP 池，预先 fork 好一批未特化的进程，App 启动时直接从池里取，跳过 zygote fork 的开销。Frida 也对 `usap32` / `usap64` 做了同样的 Zymbiote 注入，确保从 USAP 池启动的 App 同样能被拦截。

**Chrome Zygote**

Chrome 有自己的 zygote 进程用于 fork 渲染进程。 `handle_zymbiote_connection()` 里对此有特殊处理：如果连上来的是 Chrome zygote，Frida 继承父进程的 patch 记录但不发 ACK，让它继续跑——Chrome zygote 不是 spawn 目标，不需要暂停。

**Zymbiote hook 是一次性的**

`ZymbiotePatches` 记录了所有被修改的内存地址和原始字节。 `revert()` 把它们全部还原。一个 App 进程对应一次 hook，resume 之后 zygote 里的函数指针恢复原样，不影响后续其他 App 的启动。

* * *

## 小结

路径 A 的核心设计思路是：利用 zygote fork 模型，把注入时机前置到 frida-server 启动阶段，再通过 Zymbiote 在子进程里自主完成暂停和上报，避免了对运行中 App 的外部干预。

各阶段手段汇总：

| 阶段  | 手段  |
| --- | --- |
| 向 zygote 写入 Zymbiote | `/proc/[pid]/mem` 直接写，无 ptrace |
| 感知进程暂停 | 轮询 `/proc/[pid]/stat` |
| 进程暂停 | Zymbiote 自己 `raise(SIGSTOP)` |
| 进程恢复 | `SIGCONT` |
| 注入 frida-agent.so | ptrace（SEIZE/ATTACH + 寄存器操控 + 远程 dlopen） |

理解这套机制，对于分析 Frida 检测方案、绕过 spawn gate、或者自己实现类似的早期注入框架都有直接参考价值。
