---
title: 无痕 hook 检测 - Yuuki
source: https://yuuki.cool/posts/shadowdetect/shadowdetect/
source_host: yuuki.cool
clip_date: 2026-09-24T10:52:38+08:00
trace_id: 7e28ecc2-5241-4311-9a0e-87d90792206d
content_hash: 84384722d3123a6595a004575191ff48dce6ef7ddba12ed472c284be058a7a45
status: synced
tags:
  - Hook
  - Android逆向
series: null
feed_source: Yuuki·移动安全
ai_summary: 影子页 Hook 把原始页与可执行影子页挂到同一虚拟地址、只在内核改 PTE，因此外部读内存或算 CRC 永远看到干净代码，只有把探针塞进被 Hook 函数内部、在同一页上边执行边读才可能暴露它。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e575244-d011-812e-8b6b-d274fb99ae55
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 影子页 Hook 把原始页与可执行影子页挂到同一虚拟地址、只在内核改 PTE，因此外部读内存或算 CRC 永远看到干净代码，只有把探针塞进被 Hook 函数内部、在同一页上边执行边读才可能暴露它。
> 
> - **实现原理：** 原始页保存干净指令、用户层可读但带 UXN 不可执行；影子页复制自原始页并写入 Hook、可执行但不可作数据读取。读该页触发 Data Abort 时 PTE 切回原始页，取指时因 UXN 触发 Instruction Abort 再切回影子页，VMA 始终是 `r-xp`，`maps` 里无痕迹。
> - **与传统 inline hook 的区别：** 传统方案改入口字节（如 `B`、`LDR+BR`）或替换成 `BRK`，检测函数可与被检测函数毫无调用关系，读函数头或做 CRC 即可；影子页下外部读取拿到的本来就是原始页，所以探针必须内联进被检测函数并与其入口位于同一页。
> - **低风险检测：** 用 `ADR+LDR` 同页读 canary 会在两个 PTE 状态间反复触发异常，可能超时甚至把内核搞崩，不宜常跑；更温和的是对比「先批量读再批量执行」与「逐次读一次执行一次」的中位数耗时，并减去其他页面控制函数的基线，切页成本膨胀很明显。
> - **其他检测：** `mprotect(PROT_READ)` �are让内核按 VMA 重建权限，若保留当前影子 PFN，第二次整页复制就能读到 patch；两个线程绑不同 CPU 并发读与执行会争用同一 PTE；fork 处理只恢复父进程，父子进程调用目标函数时会出现可观测差异。
> - **组合与边界：** 先跑影响最小的读执行耗时，超阈值再用并发读执行复测互证；mprotect 与 fork 更像针对 wxshadow 实现的检测而非底层原理检测。若 Hook 直接替换目标函数且永不回到原函数，函数内探针就没有执行机会。

## 基于影子页的无痕 Hook 检测

## 0x00 前言

好久没水文了，水一下

这篇主要聊一种比较有意思的无痕 Hook。用户层读内存时看到的是原始页，CPU 真执行到对应内存时，用的却是另一张写过 Hook 的影子页。两张物理页挂在同一个虚拟地址后面，所以不管是读函数头还是做 CRC，看到的都还是原来的内容

思路主要参考 [这篇文章及相关开源实现](https://bbs.kanxue.com/thread-290304.htm) ，下文统一叫它「参考方案」。为什么参考这篇，因为它最早，尊重原创好吧🫡，不然以后没有开源代码抄了，也没好文看了

本文提到的检测方案都是实践过并且有效的，但是测试的日子有点久远了，而且是用朋友手机测的，截图啥的找不到了，就不贴了

## 0x01 Hook 原理

在说影子页之前，还是先从传统 inline hook 开始。赶时间的可以直接跳到检测部分，不过前面这段不长

传统 inline hook 的流程应该都比较熟了：先备份目标函数入口即将被覆盖的指令，再把入口改成一条跳往 Hook 函数的分支。如果后面还要执行原函数，就在 trampoline 里执行被覆盖的指令，然后跳回目标函数剩余部分

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/28491b7eb1871b66.webp)

以 ARM64 为例，跳转目标在约 ±128 MiB 内时，一条 `B` 就够了；距离比较远时，可以用 `LDR + BR` 再跟一个地址常量。具体用哪一种不重要，反正入口字节是真的变了

所以针对这种 Hook 的检测也很直接。可以在任意函数里读取目标函数头，检查是否出现异常分支，也可以直接对内存中的代码段做 CRC

```c
bool entry_changed(const void *target,
                   const uint8_t expected[16])
{
    uint8_t current[16];
    memcpy(current, target, sizeof(current));
    return memcmp(current, expected, sizeof(current)) != 0;
}
```

这里有一个特点，检测函数和被检测函数在调用关系上可以完全无关。函数 A 不需要调用函数 B，也能读取 B 的指令并判断它有没有被修改

那么怎么绕过这种检测呢？一个比较自然的方向，是不再靠正常 patch 分支接管执行流，而是利用异常

比如 uprobe 会把目标指令替换成 `BRK` ，CPU 执行到这里时触发异常，内核拿到控制权，再处理后面的单步执行。虽然 `BRK` 本身还是能被 CRC 发现，但它说明了一件事：想接管执行流，不一定非要在原流程里放一条跳转

顺着这个思路继续往下，可以用 `mprotect` 把目标函数所在页面改成不可执行。CPU 取指时触发权限异常，用户层的 `SIGSEGV` 处理器检查当前 PC，命中目标函数就修改信号上下文，把 PC 转到 Hook 函数。原始指令没有被 patch，直接读入口或者算 CRC，结果自然还是正常的，这个方案也比较有趣，当然放到现在来看他已经很过时了，但是如果是在十年前，我应该很难想到这种跳出传统框架的思路

这种方案确实解决了代码校验的问题，但痕迹也比较明显。 `mprotect` 改的不只是页表权限， [VMA](https://docs.kernel.org/mm/process_addrs.html) 也会跟着变。原来连续的 `r-xp` 映射，可能会在 `/proc/self/maps` 里变成 `r-x / r-- / r-x` ；检测方也可以查询 `SIGSEGV` 处理器，或者尝试把页面权限改回去

知道原理以后，对应的检测其实不难想。真正麻烦的是，在不知道有这种实现之前，一般不会无缘无故去查这些东西。很多检测说到底还是信息差

上面的用户层方案，简单来讲就是把目标页改成不可执行，等 CPU 执行到这里时触发异常，再从异常里接管 PC。那有没有办法保留这套思路，同时又不让 VMA 发生变化？

参考方案的做法是直接在内核里修改目标地址的 [PTE](https://docs.kernel.org/translations/zh_CN/mm/page_tables.html) 。 `maps` 展示的是 VMA 里的信息，CPU 最终使用的却是页表里的 PFN 和权限。只改 PTE，VMA 仍然可以保持原来的 `r-xp` ，解决了 maps 里有痕迹的问题

如果直接把 PC 改到另一块代码页，新的问题又来了。执行地址变了， `B/BL` 、 `ADR/ADRP` 、 `LDR literal` 这些 PC 相对指令都可能要重写，整页处理起来很容易漏东西。 [珍惜大佬的文章](https://bbs.kanxue.com/thread-290718.htm) 介绍了这个方案，但是这种方案需要修整页的指令，在我看来可能不是那么稳定。当然这种方案也是可以检测到的，下次有机会再水。参考方案没有换虚拟地址，而是给同一个虚拟地址准备了两张物理页

![1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a2bcd48972925b01.webp)

原始页保存干净指令，用户层可读，但是带 `UXN` ，不能执行；影子页从原始页复制出来，再写入 Hook，用户层可以执行，但是不能当作普通数据读取。抽掉不同内核版本里的细节以后，大概就是下面两个状态

```c
static void map_original(struct shadow_page *p)
{
    uint64_t entry = make_pte(p->original_pfn);
    entry |= PTE_USER | PTE_RDONLY | PTE_UXN;
    set_target_pte(p->va, entry);
    flush_tlb_page(p->va);
}

static void map_shadow(struct shadow_page *p)
{
    uint64_t entry = make_pte(p->shadow_pfn);
    /* 不给用户层数据访问权限，保留执行能力 */
    set_target_pte(p->va, entry);
    flush_tlb_page(p->va);
}
```

读取目标地址时，影子页会触发 Data Abort，异常处理把 PTE 切到原始页，CRC 最后拿到的还是干净指令。执行目标地址时，原始页因为 `UXN` 触发 Instruction Abort，异常处理再把 PTE 切回影子页，Hook 也就生效了

两张页共用同一个虚拟地址，原来的 PC 相对指令不需要整页重定位。我第一次看到这个方案时就觉得很巧妙，因为它不是想办法伪造 CRC，而是让 CRC 从一开始就读了另一张页。反观我之前的思路，是通过文件重定向来做的，这波还是学生思维了

## 0x02 检测原理

到这里先别急着写检测代码，我们先看一下它和普通 inline hook 有什么差别

前面说过，传统 inline hook 的检测函数可以放在任意位置，因为它只需要读取目标函数的静态字节。但是影子页不一样，站在外面读取目标函数时，对方本来就准备把原始页给你看，继续校验多少次都没有太大意义

所以要检测这种方案，我们需要把探针直接放进被检测函数，并且保证探针和函数入口位于同一页。只有目标函数真的运行起来，我们才有机会在影子页上执行，才有机会在执行的时候，再对当前页发起一次数据读取

这个限制看起来比传统 CRC 大一些，不过也没什么办法。毕竟对方都已经在内核里控制页表了，而我们检测端只是一个普通用户进程，如果啥手段都不让用，那跟让人单挑坦克没啥区别了

下面用到的探针都很短，可以直接内联到业务函数。比较关键的一段是 `ADR + LDR` ：先拿到同页 canary 的地址，再读取它

```c
#define SHADOW_CANARY UINT64_C(0x534841444f575047)

#define SAME_PAGE_READ()                                                   \
    __extension__({                                                        \
        uint64_t value;                                                    \
        __asm__ volatile(                                                  \
            "adr x9, 1f\n"                                                \
            "ldr %0, [x9]\n"                                             \
            "b 2f\n"                                                     \
            ".balign 8\n"                                                \
            "1: .quad 0x534841444f575047\n"                               \
            "2:\n"                                                       \
            : "=r"(value)                                                 \
            :                                                             \
            : "x9", "memory");                                           \
        value;                                                             \
    })
```

代码写在同一个函数里，不代表最后一定落在同一页。实际使用时还要检查运行时地址，或者通过链接布局把探针固定住。下面这些检测方法，利用的其实都是同一个点：一个虚拟地址同一时刻只有一个 PTE，它没办法既指向可读的原始页，又指向可执行的影子页。但这个点又是这种方案的底层原理，那就很舒服了

## 0x03 检测方法

### 0x03.1 同页自读

最直接的办法，也是最容易想到的办法，作者在 README 里也提到了这个限制。核心是让一段正在执行的代码读取它自己所在的页面

![2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/82c7f2db27b1d5af.webp)

正常页面本来就同时可读、可执行， `LDR` 会直接把 canary 读出来。影子页这里就比较麻烦了：

1.  CPU 正在影子页上执行 `LDR`
2.  影子页不可读，触发 Data Abort，PTE 被切到原始页
3.  异常返回后，CPU 还要重新取刚才那条 `LDR`
4.  原始页带 `UXN` ，取指再次触发 Instruction Abort，PTE 又被切回影子页
5.  回到第一步

同一条指令会在两个页面状态之间来回触发异常，一直找不到一个既能取指、又能完成读取的状态。最后可能表现为超时、异常退出，也可能被某些实现兜底成错误返回值

这项检测最接近影子页本身的问题，但是风险也最高。线程如果一直卡在内核异常路径里，用户层定时器和信号未必能及时把它拉回来，可能会导致内核崩溃。朋友帮我测的时候就是内核直接崩了，不过崩了也是检测到了，起码 hook 没法继续工作了。这个方法不建议每次业务调用都跑

### 0x03.2 读执行耗时

如果不想直接碰上面的异常循环，可以换一个温和一点的办法，只测页面在读取和执行之间切换的成本

一组先连续读取 N 次，再连续执行 N 次；另一组每读取一次就执行一次。前者通常只需要在两个阶段的边界切页，后者几乎每轮都要处理异常、改 PTE、刷 TLB

```c
/* batch：先读完，再执行 */
for (uint32_t i = 0; i < count; ++i)
    sum += *instruction;
for (uint32_t i = 0; i < count; ++i)
    sum += function(i);

/* alternating：每读一次就执行一次 */
for (uint32_t i = 0; i < count; ++i) {
    sum += *instruction;
    sum += function(i);
}
```

只比较一次耗时可能不稳。实际使用时最好先预热，多轮采样取中位数，再找一个位于其他页面、逻辑相同的控制函数跑一遍。最后看目标页在交替模式下多出来的那部分成本是否超过阈值，当前这里时间膨胀倍率是比较夸张的，用来检测还是很稳定的

```c
uint64_t target_cost = positive_delta(
    median(alternating_target), median(batch_target));
uint64_t control_cost = positive_delta(
    median(alternating_control), median(batch_control));

uint64_t switch_cost = positive_delta(target_cost, control_cost);
```

### 0x03.3 重建权限

参考方案隐藏影子页的前提是 VMA 描述的还是正常映射，只在下面偷偷换了 PTE。那我们也可以反过来走一次正常的 `mprotect` 路径，让内核根据 VMA 重新处理页权限

顺序不能乱。先读取整页，让当前 PTE 指向原始 PFN，同时保存一份干净内容；然后执行同页探针，把映射切回影子 PFN；最后调用 `mprotect(PROT_READ)` ，再读取一次整页

```c
copy_page_volatile(clean, page, page_size);  // original PFN
same_page_anchor();                          // shadow PFN

mprotect(page, page_size, PROT_READ);
copy_page_volatile(exposed, page, page_size);
mprotect(page, page_size, old_prot);

bool suspicious = memcmp(clean, exposed, page_size) != 0;
```

如果 `mprotect` 重建权限时保留了当前 PTE 里的影子 PFN，原本不可读的影子页就会被临时改成可读，第二次复制可以直接看到里面的 patch

这项比较依赖具体实现，而且真的会修改页面权限，所以应该放在后面执行。原权限要完整保存，恢复失败也要单独处理，不能测完以后就放那不管了。不过这个检测点实际上是很容易处理的，这个懂的都懂，怎么处理不细说了

### 0x03.4 并发读执行

这个检测比较苛刻一些，但是挺稳定的。同一个进程里的线程共用一套页表，所以可以开两个线程，一个持续读取目标页，另一个持续执行同页探针，并尽量把它们绑到不同 CPU

```c
/* reader */
for (uint32_t i = 0; i < rounds; ++i)
    read_sum += *(volatile uint32_t *)same_page_probe;

/* executor */
for (uint32_t i = 0; i < rounds; ++i)
    result_sum += same_page_probe(i);
```

读取线程想要原始页，执行线程想要影子页，争用的还是同一个 PTE。实现处理正确时，主要表现是跨核切页和 TLB 同步带来的额外耗时；如果连返回值都开始异常，那说明里面还有竞态

### 0x03.5 fork

参考方案对 fork 做了专门处理。它在复制页表以前，先把父进程里的影子映射暂时恢复成原始页；复制结束以后只恢复父进程，避免子进程继承私有影子 PFN，把 RSS、rmap 之类的内存记账搞乱

![3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/584bef9c650910f0.webp)

把保护性判断省掉以后，关键过程大概就是这样：

```c
pause_parent_shadow_pages(oldmm);
pid_t pid = fork();
resume_parent_shadow_pages(oldmm);  // 只恢复父进程
```

这个处理解决了 fork 的稳定性，不过也留下了父子进程差异。父进程继续运行在影子页上，子进程拿到的只有复制时那张原始页

检测时需要注意，父子两边必须调用真正被 Hook 的目标函数，不能随便放一段在原始页和影子页里完全相同的探针。否则两边当然会得到一样的结果，这项检测也就没有意义了

```c
sample_target(input);  // 先让父进程进入稳定状态
pid_t pid = fork();

if (pid == 0) {
    struct sample child = sample_target(input);
    write(pipe_fd[1], &child, sizeof(child));
    _exit(0);
}

struct sample parent = sample_target(input);
```

如果 Hook 改变了返回值或者某个可观察副作用，父子差异会很直接；如果 Hook 保持了业务语义，就只能多跑几轮，比较耗时之类的弱信号。但是实测下来，即使是 onEnter，onLeave 里打个 log ，也能检测到不同，不知道什么原因。 当然这个也可以在内核里处理的，如何处理也是懂的都懂

### 0x03.6 其他

空白太小写不下了…

## 0x04 怎么组合

上面这些检测只是理论上的，真实场景可以不必每一项都跑，一方面是成本不一样，另一方面是有些检测本身就会改变当前的页表状态，乱序执行反而会互相干扰

正常情况下可以先跑读执行耗时，这个对业务影响最小，当前方案下时间膨胀也比较明显。如果结果超过阈值，再用并发读执行复测一次。两项看的都是切页成本，但是触发方式不同，结果能互相对上，基本就不是普通调度抖动了

`mprotect` 和 fork 的问题实际上当前设计完全可以解决，严格来讲不能算是针对这种 hook 底层原理的检测，更像是针对 wxshadow 的检测

当然这些方案也都有边界。Hook 如果直接替换目标函数，并且永远不回到原函数，放在函数内部的探针根本没有执行机会，也就检测不到了。但是考虑到成本，一般只会在重要的函数里插入检测探针，重要的函数通常实现比较复杂，hook 时大概率是需要调原函数的

## 0x05 小结

中秋节快乐😋

[](#)

Twikoo 评论管理

密码
