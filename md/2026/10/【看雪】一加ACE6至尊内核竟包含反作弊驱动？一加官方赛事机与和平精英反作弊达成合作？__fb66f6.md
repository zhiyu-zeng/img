---
title: 【看雪】一加ACE6至尊内核竟包含反作弊驱动？一加官方赛事机与和平精英反作弊达成合作？
source: https://bbs.kanxue.com/thread-293135.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T00:06:02+08:00
trace_id: 063be00c-cde1-4fb2-bc1c-f33487ddbca1
content_hash: 4aaafb2c97324df17713ec11ea01aab077f569a289d9c32c762ee07bbba643d0
status: synced
tags:
  - 看雪
  - 内核
  - 风控对抗
series: null
feed_source: 看雪·Android安全
ai_summary: 一加 Ace 6 Ultra 内核 `inte.ko` 为《和平精英》反外挂做内核完整性度量：哈希比对 sys_call_table 劫持与白名单 .ko，只检测上报不阻断。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-81c6-a377-cd5e7c174575
ioc:
  cves:
    - CVE-2021-0948
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 一加 Ace 6 Ultra 内核 `inte.ko` 为《和平精英》反外挂做内核完整性度量：哈希比对 sys_call_table 劫持与白名单 .ko，只检测上报不阻断。
> 
> - **模块构成：** `oplus_kernel_security_check.c` 单独编译为 `inte.ko`，同目录其余文件编成 `oplus_secure_guard_new.ko`；构建走 GKI Kleaf/Bazel，目录内 Makefile 为遗留配置。
> - **检测一·系统调用表：** 用临时 kprobe 偷 `kallsyms_lookup_name` 地址定位 `sys_call_table`，加载时算 SHA-256 存入 `__ro_after_init` 基线，之后每 1 小时重算比对，不一致才写 `/proc/inte_systbl` 事件 `<毫秒>:true`。
> - **检测二·内核模块：** kretprobe 挂 `load_module`，在模块 init 执行前对 ELF 整文件 4KB 分块算哈希（100ms 超时），手工解析 `.modinfo` 取模块名拼 `.ko`，查用户态下发的白名单（`[N][filename[40]][sha256[32]]`）；不在表或哈希不符才写 `/proc/inte_ko`。
> - **门控与局限：** 需守护进程 `oplus_kohashpro` 写 `/proc/inte_status=1` 才开始检测；正常无异常不写事件，但 seq_file 读取不消费、环形队列仅 10 条；检测不覆盖 inline hook/ftrace，表基线存在信任锚盲区。
> - **关联体系：** `oplus_secure_guard_new.ko` 另做 set*uid 提权、cred 篡改、非 init 重载 sepolicy、堆喷射、/data 执行检测，经 generic netlink 上报；bootloader 解锁（orange）则整体空转。

**分析对象**:`vendor/oplus/kernel/secureguard/gki2.0/rootguard_new/oplus_kernel_security_check.c`  
**仓库**:OnePlusOSS/android_kernel_modules_and_devicetree_oneplus_mt6993(分支 `oneplus/mt6993_b_16.0_ace_6_ultra`,机型一加 Ace 6 Ultra / 平板,联发科天玑 9400 平台,Android 16 / GKI 2.0 内核)  
https://github.com/OnePlusOSS/android_kernel_modules_and_devicetree_oneplus_mt6993/blob/oneplus/mt6993_b_16.0_ace_6_ultra/vendor/oplus/kernel/secureguard/gki2.0/rootguard_new/oplus_kernel_security_check.c

* * *

## 1\. 总体分析(TL;DR)

`oplus_kernel_security_check.c` 是 OPPO/一加 **SecureGuard(安全防护)体系** 中的一个 **独立小内核模块(编译产物 `inte.ko`,inte = integrity)**,文件头注释写明需求来源:

> *"和平精英需求-内核完整性检测,包括系统调用表劫持检测和 ko 完整性检测"* (第 6 行)

也就是说,这是为\*\*《和平精英》反外挂 **做的内核级完整性度量模块,只做** 检测与上报,不做阻断\*\*。它检测下面两个:

| 检测项 | 检测对象 | 检测原理 | 触发时机 |
| --- | --- | --- | --- |
| 系统调用表劫持 | `sys_call_table` 的全部 `__NR_syscalls` 个函数指针 | **基线哈希比对** (完整性度量):模块加载时对整张表做 SHA-256 快照作为基线,之后每小时重算一次比对 | 周期性(1 小时) |
| 恶意/被篡改内核模块(.ko) | 每次 `finit_module` / `init_module` 加载的 ELF 文件整体字节 | **kretprobe 劫持 `load_module` 函数入口**,在模块落库前对整个 ELF 分块计算 SHA-256,与用户态下发的 **白名单哈希表** 比对 | 实时(每次模块加载) |

检测结果写入两个 proc 文件(`/proc/inte_ko` 、 `/proc/inte_systbl`),由用户态守护进程 `oplus_kohashpro` 读取并上报云端风控,最终供游戏反外挂系统判定对局环境是否可信。(写入格式看2.3章节)

同一目录下其余文件编译成另一个模块 `oplus_secure_guard_new.ko`,是 SecureGuard 的主体:提权行为检测(set*uid 族)、运行时凭据(cred)篡改检测、SELinux 策略重载检测、堆喷射(heapspray)启发式检测、/data 分区可执行文件检测,并通过 generic netlink 把事件上报给用户态。两者共享同一套上报/门控基础设施。本报告第 3 章以 `inte.ko` 为主角,第 4 章分析关联模块。

* * *

## 2\. 代码组成与构建体系

### 2.1 两个内核模块

构建入口是 `BUILD.bazel → oplus_local_modules.bzl` (GKI Kleaf 构建体系),其中定义了两个 DDK 模块:

```python
define_oplus_ddk_module(
    name = "oplus_secure_guard_new",     # → oplus_secure_guard_new.ko
    srcs = native.glob(["*.c", "*.h"]),
    exclude = ["oplus_kernel_security_check.c"],   # ← 排除本次分析的主角
    local_defines = ["WHITE_LIST_SUPPORT", "CONFIG_OPLUS_FEATURE_SECURE_ROOTGUARD",
                     "CONFIG_OPLUS_FEATURE_SECURE_CAPGUARD", ...],
)
define_oplus_ddk_module(
    name = "inte",                        # → inte.ko
    srcs = native.glob(["oplus_kernel_security_check.c"]),
)
```

即:**`oplus_kernel_security_check.c` 单独编译为 `inte.ko`;目录中其余全部文件编译为 `oplus_secure_guard_new.ko`**,由 `ddk_copy_to_dist_dir(name = "oplus_secureguard")` 一并打包分发。目录里的 `Makefile` / `Kbuild` 是 out-of-tree `make` 的遗留配置(Kbuild 引用的 `oplus_security_init.o` 、 `oplus_hook.o` 、 `oplus_secure_debug.o` 在本目录并不存在),实际机型构建走 bazel。

### 2.2 文件清单

| 文件  | 所属模块 | 职责  |
| --- | --- | --- |
| `oplus_kernel_security_check.c` | **inte.ko** | 内核完整性检测(本报告主角) |
| `oplus_secureguard.c` | secure_guard_new.ko | 模块入口:初始化开机状态门控、kevent 通道、harden 检测 |
| `oplus_guard_general.c/.h` | 同上  | 公共基础:读 AVB 启动状态,`is_unlocked()` 判断 bootloader 是否解锁 |
| `oplus_kevent_upload.c/.h` | 同上  | generic netlink(`"secure_guard"` 协议族)事件上报通道 |
| `oplus_secure_harden.c/.h` | 同上  | **当前生效的检测主力**:sepolicy 重载、heapspray、execve、set*uid、cred 篡改五类 kprobe/kretprobe 检测 |
| `oplus_root_hook.c` | 同上  | (遗留)syscall 前后 uid 快照比对检测 handler,见 4.5 |
| `oplus_exec_hook.c` | 同上  | (遗留)execve 返回后路径检测 handler |
| `oplus_harden_hook.c` | 同上  | (遗留)set*uid syscall 号分发检测 handler |
| `Makefile` / `Kbuild` / `Kconfig` / `BUILD.bazel` / `*.bzl` | —   | 构建配置 |

上层 `gki2.0/Kconfig`:`OPLUS_KERNEL_SECURE_FEATURE` 默认 y;`gki2.0/Makefile`:`obj-y += rootguard/ rootguard_new/` (旧版 `rootguard` 与新版并存)。

### 2.3 写入格式

所谓“写入文件”其实是 **内核内存里的两个环形事件列表** (`systbl_events_list[10]` 和 `ko_events_list[10]`),每次读取 `/proc/inte_systbl` 或 `/proc/inte_ko` 时由 seq_file 动态渲染成文本， **每条事件占一行** (`ko_proc_show` / `systbl_proc_show` 中 `seq_printf(m, "%s\n", …)`,第 537、551 行)。两个文件的事件格式 **不一样**：

**`/proc/inte_systbl` (系统调用表被劫持)**——格式为 `<UNIX毫秒时间戳>:true`,由 `get_timestamp_and_true()` 拼出(第 201 行)：

```python
1759459200000:true
1759545600000:true
```

`:true` 是“检测结果”字段(这个机制里只会有 true,没有 false 分支)。

**`/proc/inte_ko` (未知或被篡改的模块)**——事件字符串就是 **模块文件名本身**，没有时间戳、没有结论字段(`hash_probe_entry` 第 474–483 行直接 `add_ko_event(ko_name_with_suffix)`):

```python
evil_rootkit.ko
oplus_tampered.ko
```

即“读到了哪个文件名，哪个文件名就可疑”，语义靠约定而非自描述。另外守护进程自己也可以通过写 `/proc/inte_ko` (首 u32 = 10000 的注入通道，第 601–620 行)往这个列表塞任意字符串。

### 2.4没检测到会不会写入？

**不会。** 两个检测点的代码里，事件写入全部只出现在“检测到异常”的分支，正常分支只打内核日志(`pr_info`,进 dmesg),不进 proc 事件列表：

-   systbl 检测(`check_task` 第 224–234 行)：哈希 **一致** 时什么都不做(只有每次执行前的 "Performing hourly check" 日志)；只有 `memcmp != 0` 才 `add_systbl_event` 。
-   ko 检测(`hash_probe_entry` 第 474–487 行)：哈希 **匹配** 时只 `pr_info("... hash verify succeed")`;只有“白名单查不到”或“哈希不等”两个分支才 `add_ko_event` 。

所以这两个 proc 文件是 **纯事件流**，语义上是“空 = 干净，有内容 = 出过事”。但有两个值得注意的副作用：

1.  **读取不消费**：seq_file 读不清列表，量产构建里也没有任何清空入口(唯一的 `trigger_clean_event_manual` 清空函数被 `#if CHECK_DEBUG` 包住，只在 userdebug 内核生效)。事件只在三种情况下消失：被新事件挤出环形队列(满 10 条丢最旧)、模块卸载、或 debug 构建手动清。因此“文件里有事件”不代表“现在有问题”，守护进程必须自己做去重——它无法区分“新事件”和“上次已读过的旧事件”。
2.  **开机阶段完全不写**:`boot_stage != 1` 时两个检测都直接跳过(第 213–217、414–417 行)，所以开机期间的加载行为既不检测也不记录。

* * *

## 3\. inte.ko(oplus_kernel_security_check.c)深度分析

### 3.1 整体架构

```python
开机                                   运行期
────                                  ──────
inte.ko init                          ┌──────────── 每小时 delayed work ───────────┐
  │                                   │ check_task():                              │
  ├─ kprobe 探测 kallsyms_lookup_name │   boot_stage==1 ?                          │
  │   地址 → 找到 sys_call_table      │   对活 sys_call_table 重算 SHA-256          │
  ├─ 对表快照 SHA-256 → 基线 hash      │   ≠ 基线 → 事件"<毫秒>:true"               │
  ├─ 注册 kretprobe on load_module    │   → /proc/inte_systbl                      │
  ├─ 创建 /proc/inte_ko|inte_systbl|  └────────────────────────────────────────────┘
  │        inte_status                        每次模块加载
  └─ 等待用户态                              load_module(info) 入口 kretprobe:
       │                                        hash(ELF 整文件, 4KB 分块, 100ms 超时)
       │                                        解析 .modinfo 取模块名 "xxx" → "xxx.ko"
       ▼                                        查白名单哈希表:
oplus_kohashpro(euid 1000)                        ├─ 不在表 → "未知 ko" 事件
  ├─ 开机完成 → 写 /proc/inte_status=1            ├─ hash 不符 → "被篡改 ko" 事件
  └─ 写 /proc/inte_ko 下发白名单                  └─ 相符 → 放行(仅 log)
     [N][filename[40] hash[32]] * N
       │                                    事件列表(环形,各 10 条)
       ▼                                          ▲
轮询 /proc/inte_ko、/proc/inte_systbl ─────────────┘
  → 上报云端风控 → 和平精英反外挂判定
```

### 3.2 检测一:系统调用表(sys_call_table)劫持检测

**检测对象**:`sys_call_table` ——arm64 内核中存放全部系统调用处理函数指针的数组(`sys_call_table[__NR_syscalls]`,约 450 项)。

**为什么检测它**:改写 `sys_call_table` 表项、把某个系统调用指向 rootkit 自己的函数,是 Linux LKM rootkit 最经典的持久化/隐藏手法(隐藏进程、隐藏文件、隐藏端口、给特定进程发 root 凭据等)。正常运行期间内核 **从不** 修改这张表(它在只读数据段,本来写它就需要先破解页表写保护),因此"哈希不变 ⇒ 未被劫持"是一个强不变式。

**检测原理(完整性度量/基线快照比对)**:

1.  **定位 sys_call_table** (`ko_integrity_init`,第 784–800 行)。GKI 内核自 5.7 起 `kallsyms_lookup_name` 不再导出给模块,代码用经典 workaround:注册一个只设 `symbol_name` 的临时 kprobe,内核会把解析出的符号地址填进 `kprobe.addr`,随后立刻注销:
    
    ```c
    static struct kprobe getname_kp = { .symbol_name = "kallsyms_lookup_name", };
    register_kprobe(&getname_kp);
    look_func = (ksym_lookup_name)getname_kp.addr;   // 偷到函数地址
    unregister_kprobe(&getname_kp);
    sys_call_table = (unsigned long *)look_func("sys_call_table");
    ```
    
2.  **建立基线** (第 807–814 行):把整张表拷贝到 `syscall_func_addr` 缓冲,用内核 crypto API(`crypto_alloc_shash("sha256")` + `crypto_shash_digest`)计算 SHA-256,存入 `__ro_after_init` 的 `hash_systbl_init` ——基线自身只读,防止被二次篡改。
    
3.  **周期复核** (`check_task`,第 209–238 行):`INIT_DELAYED_WORK` + `schedule_delayed_work`,`check_interval = 60*60*HZ` (1 小时,第 66 行)。每次先检查 `boot_stage` (见 3.4),然后 **对活的 `sys_call_table` 直接重算哈希** (`do_hash(sys_call_table, sizeof(syscall_func_addr), ...)`),`memcmp` 与基线比对:
    
    -   一致 → 无事发生;
    -   不一致 → 打印 `"syscall_tbl maybe modified."`,生成事件字符串 `"<UNIX 毫秒时间戳>:true"` (`get_timestamp_and_true`,第 193–207 行),追加进 `systbl_events_list` 。
4.  **事件队列**:`systbl_events_list[10]` 环形缓冲,满 10 条时释放最旧的一条、整体前移(`add_systbl_event`,第 139–169 行);用户态从 `/proc/inte_systbl` 读出(seq_file)。
    

**范围与边界**:

-   度量的是 **表本身** (指针数组),不覆盖函数体。若 rootkit 不动表、而是直接对 `sys_read` 等函数做 inline patch,或用 ftrace/livepatch 机制挂钩,本检测 **不覆盖** (与文件注释"系统调用表劫持检测"的定位一致)。
-   基线在 **inte.ko 自己被加载时** 采样。若 rootkit 在更早(如 init 之前的阶段)已改表,基线本身就是脏的,属于信任锚盲区。
-   1 小时的检查窗口意味着 **瞬时篡改** (改表→用完→恢复)可以在两次检查之间逃逸(TOCTOU)。这是周期采样型检测的固有局限——它的定位是给风控提供"长期驻留型 rootkit"的证据,而非实时拦截。

### 3.3 检测二:KO(内核模块)加载完整性检测

**检测对象**:所有经由 `finit_module` / `init_module` 系统调用进入内核的 `.ko` ELF 文件。覆盖两条路径:①未知模块(白名单外的模块被注入);②同名模块被篡改(重打包的恶意版本替换官方模块)。

**检测原理(kretprobe 挂 load_module + 整文件哈希 + 白名单比对)**:

1.  **挂点** (第 777–782 行):注册 kretprobe 到内核符号 `"load_module"` —— `kernel/module/main.c` 中模块加载的内部总入口(`finit_module → load_module(info, uargs, flags)`)。选择在 `load_module` 而不是 syscall 层挂钩,是因为这里拿到的 `struct load_info *info` 已包含完整的 ELF 临时拷贝,且此时模块尚未排版(layout)、尚未加入模块列表、尚未运行其 init—— **在恶意代码执行之前** 就完成度量。
    
2.  **取参数** (`hash_probe_entry`,第 411–491 行):kretprobe entry handler 中 `pr->regs[0]` 即 arm64 第一参数寄存器 x0 = `info` 指针。 `struct load_info` 是 GKI 不导出的内核内部结构,代码 **手抄了一份布局** (第 80–104 行,与内核 `kernel/module/internal.h` 的定义保持一致),取 `info->hdr` (整个 ELF 文件的临时 vmalloc 副本)和 `info->len` (文件总长)。
    
3.  **整文件 SHA-256** (第 443–459 行):按 4KB(`CHUNK_SIZE`)分块 `crypto_shash_update`,累计超过 **100ms** 视为大模块异常放弃(防止在系统调用上下文里卡死),最后 `crypto_shash_final` 。哈希对象是 **原始 ELF 文件字节**——一个字节被改都会导致哈希不同,不依赖任何语义解析。
    
4.  **提取模块名** (`get_modinfo_name_safe`,第 323–363 行):手工解析 ELF section header(`e_shoff` / `e_shnum` / `e_shstrndx`),要求 `.modinfo` 段 **恰好只有一个** (出现两个直接返回 NULL,防伪造),再在段内按 NUL 分隔的 tag 流里找 `name=` 前缀,得到内核模块名(如 `oplus_wlan`),拼成 `oplus_wlan.ko` 。配套的 `next_tag_safe` (第 308–321 行)用 `strnlen` 做了越界保护。
    
5.  **白名单比对**:
    
    -   查不到 → `"ko:[%s] hash not found, maybe unknown ko."` → 事件(未授权模块加载);
    -   查到但哈希不等 → `"hash diff, maybe modified ko."` → 事件(同文件名、不同内容 = 篡改);
    -   相等 → 仅打 `"hash verify succeed"` 日志,**不阻断加载**。
6.  **白名单从哪里来**:`inte_hash_table` 是 `DEFINE_HASHTABLE(…, 10)` (1024 桶)+ 读写锁,条目为 `{filename[40], hash[32]}` 。 **由用户态守护进程 `oplus_kohashpro` 写入** (第 578–670 行 `proc_write_ko`),二进制协议:
    
    ```python
    [u32 条目数 N (1..1000)] [ {char filename[40]; u8 sha256[32]} × N ]
    ```
    
    文件名先 `normalize_mod_name` 把 `-` 替换为 `_` (内核 `KBUILD_MODNAME` 用下划线,而磁盘文件名常为连字符),jhash 定桶后去重插入。守护进程显然是在启动时扫描系统分区内的官方 `.ko` (vendor/system 模块)预先算好哈希再喂给内核。
    
    另有一个复用通道:首 u32 等于 `KO_EVENT_FLAG` (10000,大于上限 1000 所以不与条目数语义冲突)时,后面是 `[len][string]`,守护进程可直接向内核事件列表注入事件字符串(第 601–620 行)。
    

**与检测一的协同**:两个检测共享 `boot_stage` 门控、SHA-256 tfm、事件环形队列、proc 读取接口,构成同一个"内核完整性度量 + 上报"框架。

### 3.4 用户态接口与信任模型

inte.ko 创建 3 个 proc 节点(第 749–774 行),owner 强制 root(`proc_set_user(…, KUIDT_INIT(0), …)`):

| 节点  | 权限  | 读   | 写   | 写入者校验 |
| --- | --- | --- | --- | --- |
| `/proc/inte_ko` | 0664 | ko 事件列表 | 白名单下发 / 事件注入(flag 10000) | `is_valid_sender()`:进程名必须为 `oplus_kohashpro` **且** euid==1000(第 500–514 行) |
| `/proc/inte_systbl` | 0664 | systbl 事件列表 | 仅 debug 构建可用(见下) | euid 0 或 1000 |
| `/proc/inte_status` | 0660 | —   | 写入 int 1 → `boot_stage=BOOT_COMPLETE` | euid 0 或 1000(第 703–721 行) |

-   **boot_stage 门控**:用户态(守护进程)在开机完成后写 `/proc/inte_status=1` 。开机阶段跳过 ko 哈希检测(第 414–417 行)——因为此时大量合法模块加载而白名单尚未下发,全部上报会淹没有效事件;小时级 systbl 检查同样等待该标志(第 213–217 行)。
-   **`CHECK_DEBUG` 自测通道** (第 38–44、674–701 行):只有当 `CONFIG_DYNAMIC_DEBUG && CONFIG_DEBUG_OBJECTS && CONFIG_DEBUG_KMEMLEAK` 同时开启(即 userdebug 构建)时,`/proc/inte_systbl` 才接受写入:`'0'` 手动触发一次校验;`'1'` 构造"把表项 0 改成 0"的假表做哈希,**验证检测逻辑确实能报警**;`'2'` 清空事件列表。user(量产)构建中写入是空操作——自测能力不暴露给量产环境。
-   **信任模型评估**:写 `/proc/inte_ko` 需要"进程名 + euid 1000"双条件,但进程名(`task->comm`)可被 `prctl(PR_SET_NAME)` 任意伪造,真正兜底的是 proc 节点 0664 root:root 的 DAC 限制(非 root 组基本写不进)。因此该模块的定位是 **检测/遥测型**:白名单本身的完整性最终由 AVB(系统分区只读校验)保证,内核只负责"比对 + 报告",**不依赖它做强制访问控制**。

### 3.5 数据流与消费端

```python
[inte.ko 内核事件] --/proc/inte_ko, /proc/inte_systbl--> [oplus_kohashpro 守护进程(euid 1000)]
      → 事件格式 "<unix毫秒>:true" → 经 OPPO 数据通道(DCS 埋点)上传云端风控
      → 和平精英对局内核验:检测到 sys_call_table 被劫持 / 存在篡改或未知内核模块
        → 判定内核级外挂(隐藏进程/透视/自瞄驱动等通常以此实现) → 封禁
```

注意读接口是 **非破坏性** 的(seq_file 只打印不清队列),事件靠 10 条环形覆盖淘汰,去重责任在用户态。

* * *

## 4\. 关联代码:oplus_secure_guard_new.ko 的检测体系

`oplus_secureguard.c` 是模块入口:`oplus_boot_state_init()` 读内核导出符号 `verified_bootstate` (AVB 启动验证状态),若为 `orange` (**bootloader 已解锁**)则整个模块 init 直接空转(第 26–31 行)——解锁设备被视为用户自担风险的合法场景,所有防护关闭;否则初始化 kevent 通道和 harden 检测。

### 4.1 事件上报通道(oplus_kevent_upload.c)

注册 generic netlink 协议族 `"secure_guard"` (第 107–117 行);用户态守护进程先发 `SECURE_GUARD_CMD_GENL_SENDPID` 上报自己的 PID,之后内核各检测点调用 `report_security_event(event_name, event_type, more)` (第 222–252 行),把 `kernel_packet_info{type, log_tag="kernel_event", event_id, payload}` 通过 `genlmsg_unicast` 发给守护进程,再转 DCS 上云。payload 统一格式:`$$uid@@…$$EVENT_TYPE@@…$$current_name@@…$$additional@@…` 。

### 4.2 当前生效的检测点(oplus_secure_harden.c)

| 检测点 | hook 位置(kprobe/kretprobe) | 检测逻辑 | 事件  |
| --- | --- | --- | --- |
| **SELinux 策略重载** | `sel_write_load` (`/sys/fs/selinux/load` 的写入口) | 只有 `init` 进程允许重载 sepolicy;其它进程调用 → 事件(第 319–331 行)。原理:exploit 提权后常替换/重载 SELinux 策略解除限制 | `spolicy_reload` |
| **堆喷射启发式** | `ip_setsockopt` (v4)、 `do_ipv6_setsockopt` (v6)、 `cpuinfo_open` | 对多播相关选项 `MCAST_MSFILTER(48)` / `MCAST_JOIN_GROUP(42)` / `IP_MSFILTER(41)` (第 333–362 行)按"同一父进程 10 秒内 >200 次"计数超限(第 137–311 行,阈值见 `oplus_secure_harden.h`)。原理:这些 setsockopt 选项是历史 LPE 漏洞的经典堆喷射/占位原语(如 CVE-2021-0948),高频调用是 exploit 特征统计 | `heapspray` |
| **execve 检查** | `do_execveat_common` 入口 | 取 `current->mm->exe_file` 的 `d_path`:不在 `/data` → 放行;`/data/local/tmp` 、 `/data/nativetest(64)` → 追加"root 子进程溯源"(子进程有 root 凭据而父/线程组没有 → `exec2` 事件);其它 `/data` 路径:非 root 执行 → `execve_report`,root 执行 → `execve_block` (此变体只报告不杀)(第 448–495 行)。原理:普通应用从 /data 临时目录执行二进制是提权链/外挂注入的典型落点 | `execve_report` / `execve_block` / `exec2` |
| **set*uid/gid 提权检测** | `__sys_setuid/setreuid/setresuid/setfsuid/setgid/setregid/setresgid/setfsgid` 8 个函数的 **pre** handler | 无 `CAP_SETUID` / `CAP_SETGID` 的 shell(uid 2000)/第三方应用(uid≥10000)进程试图把任一 id 设为 0 → 事件(第 712–838 行)。原理:合法提权必经 `capable()` 检查;内核漏洞提权通常绕不过这层,直接盯"参数值为 0"即可低误报捕获 | `root_check` |
| **cred 运行时篡改检测** | `capset` 、 `futex` 、 `ppoll` 、 `epoll_pwait` 、 `ioctl` 、 `rt_tgsigqueueinfo` 、 `nanosleep` 、 `rt_sigtimedwait` 8 个 syscall 的 **entry+ret** kretprobe | entry 时把 uid/euid/gid/egid 存入 `oplus_task_struct` 扩展字段(`sg_*`,来自 OPLUS 调度器头文件 `<linux/sa_common.h>`,第 556–591 行);ret 时比对,**任一 id 数值变小(朝 root 方向)** → 事件(第 593–605 行)。原理:针对"内核 UAF/竞态漏洞在系统调用执行期间异步篡改 cred 结构"的提权方式;所选 syscall 都是历史 exploit 常用的载体(阻塞、可中断、引用外部对象) | `root_check` |

一个值得注意的细节:`do_execveat_common` 的 entry handler 读到的 `current->mm->exe_file` 是 **发起 execve 时旧二进制** 的路径(此时 mm 尚未切换),而旧机制 `oplus_exec_hook.c` 的 ret handler 读到的是 **execve 成功后新二进制** 的路径——两代实现对"执行溯源"的时点语义不同。

### 4.3 遗留代码:tracepoint 机制的三份 handler

`oplus_root_hook.c` 、 `oplus_exec_hook.c` 、 `oplus_harden_hook.c` 定义了 `oplus_root_check_pre_handler` / `oplus_root_check_post_handler` / `oplus_exe_block_ret_handler` / `oplus_harden_pre_handler` 等 handler,但在 rootguard_new 中 **没有任何注册者** (`oplus_secureguard.c` 只初始化 kevent + harden)——它们是旧版 `rootguard` 目录的 tracepoint 机制遗存(Kbuild 里引用的 `oplus_security_init.o` / `oplus_hook.o` 也不存在了)。旧版的注册方式很有代表性(旧目录 `oplus_secure_hook.c`):因 GKI 不导出 `__tracepoint_sys_enter/exit`,代码以 `__tracepoint_dma_fence_emit` 的地址为起点,按 `sizeof(struct tracepoint)` 步长回退、用 `sprint_symbol` 逐个比对符号名,在 tracepoint 区段内 **扫描出** sys_enter/sys_exit 的地址,再 `tracepoint_probe_register` 挂载。

其中最有攻击者视角意义的逻辑保留在 `oplus_root_hook.c` 中(旧机制时代):

-   **syscall 前后 uid 快照比对** (第 109–187 行):pre 记录 uid/euid/gid/egid,post 比对,任一数值变小、且 syscall 号不属于 set*uid/set*gid 合法族、设备未解锁、原 uid 非 0 → 判定"非 setuid 系统调用导致的提权"(即内核漏洞利用)→ 上报 `root_check` **并 `send_sig(SIGKILL)` 直接击杀进程** (第 103–107 行)——这是整套体系里唯一有主动阻断的地方;
-   还检查 `addr_limit > KERNEL_ADDR_LIMIT(0x0000008000000000)` (5.4 前内核),即检测"用户进程 addr_limit 被改到内核段"的 classic 提权痕迹;
-   userdebug 构建(`WHITE_LIST_SUPPORT`)给父进程名为 `dumpstate` 的场景开白名单。

### 4.4 事件类型汇总

| event_id | type | 来源模块/函数 | 含义  |
| --- | --- | --- | --- |
| `root_check` | 0   | root_hook / secure_harden | uid/gid 非法提升(含 set*uid 族与 cred 运行时篡改) |
| (字符串事件) | 1   | kevent | 纯字符串 |
| `execve_report` / `execve_block` | 3   | exec_hook / secure_harden | 从 /data 执行二进制(报告/阻断) |
| `capa_harden` | 5   | harden_hook | 第三方应用带 CAP_SETUID 调 set*id(0) |
| `heapspray` | 6–12 | secure_harden | 多播 setsockopt / cpuinfo 打开频率异常 |
| `spolicy_reload` | 13  | secure_harden | 非 init 进程重载 SELinux 策略 |
| `exec2` | 14  | exec_hook / secure_harden | root 凭据的进程从 /data 临时目录执行 |
| `"<毫秒>:true"` (proc) | —   | **inte.ko** | sys_call_table 哈希变化 / 未知或被篡改 ko(不走 netlink,由守护进程轮询 proc) |

* * *

## 5\. 检测技术原理归纳

这套代码综合使用了四类内核自保护/反 rootkit 技术:

1.  **完整性度量(Integrity Measurement)**——inte.ko 的两项检测:对"正常运永不变"的关键数据(sys_call_table、白名单模块文件)取密码学基线(SHA-256),周期或事件驱动地重算比对。简单、低误报,但受限于采样窗口和基线建立时点。
2.  **不变式断言(Invariant Assertion)**——set*uid 检测:不加 CAP 的进程 uid→0 在正常系统里永不发生,一旦出现即异常。同理"非 setuid 系 syscall 导致 uid 变小"、"非 init 重载 sepolicy"。
3.  **行为统计启发式**——heapspray 检测:不识别具体漏洞,而是对 exploit 的必备动作(堆喷射原语的高频调用)做频率统计,以"同父进程 10s>200 次"为阈值。
4.  **关键路径拦截观测**——kretprobe/kprobe 挂在模块加载、execve、selinux load、set*id 等攻击必经 choke point,在恶意行为生效前(模块 init 执行前、策略生效前)完成观测。

配套的工程手法也值得注意:GKI 下符号不可达的三个 workaround——kprobe 借地址拿 `kallsyms_lookup_name` 、手抄 `struct load_info` 布局、(旧版)扫描 tracepoint 区段找 `sys_enter/exit`;以及 `__ro_after_init` 保护基线、 `memzero_explicit` 清理栈上 shash desc、100ms 分块哈希超时保护等。

## 6\. 强度与局限评估(防护研究视角)

**盲区/局限**:

1.  **inte.ko 只检测不阻断**——发现未知 ko/表劫持后仅记录事件,恶意模块照样加载运行,处置完全依赖云端风控事后判定;每小时一次的表校验可被"用时改、用完还原"的瞬时 hook 逃逸。
2.  **sys_call_table 哈希不覆盖函数体**——inline hook / ftrace / kprobe 恶用 / livepatch 等不改表的挂钩方式不在检测范围。
3.  **基线时点信任锚**——表基线在 inte.ko 加载时采样,更早发生的篡改不可见;ko 白名单由 euid 1000 + 可伪造的 comm 进程名下发(实际依赖 proc 节点 DAC 兜底),属于遥测级信任。
4.  **手抄 `load_info` 布局**——内核升级(如 `CONFIG_MODULE_DECOMPRESS` 、字段增删)会造成 ABI 漂移,导致解析失败或误读(代码已做 e_shnum/单.modinfo/strnlen 等防御,但布局漂移本身无版本协商)。若解析失败(get_modinfo_name_safe 返回 NULL)则 **跳过该模块的哈希校验**,不产生事件——潜在绕过点。
5.  **事件容量小(各 10 条)且读取非消费**——依赖守护进程及时轮询去重;ring 覆盖可能挤掉早期证据。
6.  **解锁 bootloader 即全关** (is_unlocked()=orange)——检测体系以 AVB 绿锁为前提。
7.  小瑕疵:`ko_integrity_init` 中 `proc_set_user` 在判空前调用(若 `proc_create` 失败返回 NULL 存在空指针风险,量产难触发);`is_valid_sender` 直接 `strcmp(task->comm,…)`,严格应先取 16 字节再强制 NUL。

**设计上的合理处**:模块加载前(pre-init)完成哈希;基线 `__ro_after_init`;userdebug 自测通道与量产隔离;ko 哈希带 100ms 超时避免卡死加载路径;事件双通道(proc 轮询 + genl)按实时性分层。

## 7\. 结语

该文件所在的 rootguard_new 目录是 OPPO/一加在 GKI 时代重构的"内核安全防护(SecureGuard)"套件:本次分析的 `oplus_kernel_security_check.c` (`inte.ko`)面向 **和平精英反外挂** 需求,用 SHA-256 基线比对检测 **sys_call_table 劫持**、用 kretprobe 挂 `load_module` 加白名单哈希检测 **恶意/篡改内核模块**;配套的 `oplus_secure_guard_new.ko` 则覆盖 **提权行为、cred 篡改、SELinux 策略重载、堆喷射、/data 执行** 等运行时攻击特征,并统一经 netlink/proc 上报云端。整体是一套 **以检测和遥测为主、极少阻断** 的纵深防御实现,定位于给应用层反外挂与云端风控提供"内核环境是否干净"的高置信信号,而非替代 SELinux/AVB 做强制访问控制。

不少 root 玩家表示，他们同样反感作弊行为，也理解游戏方维护公平环境的需要，只希望这类信号仅作为参考，不要直接等同于作弊证据。 --来自社区讨论

对于大部分的root方案都可能会导致被内核驱动反作弊检测，如KSU方案的LKM模式通过加载ko驱动实现的提取操作，而这正中了检测异常ko驱动这一环，且同时会检测是否有hook syscall这类关键通信点

如何处理呢，既然没有异常就不写入文件进行标记，那么可以通过模块使其保持干净状态，无法写入或者写就就秒删，也可以直接让系统服务读取文件被hook为文件不存在，综上，对于LKM内核态有着降维打击，但是在内核与系统再到游戏的桥梁其实十分脆弱

-   以上内容均基于对公开源代码的解读，实际请具体分析
