---
title: 从 ARM64 页权限到读取结果：UROV-Z 实现解析与内核 Hook 方案比较
source: https://androidreverser-test.github.io/2026/11/12/urov-z-kernel-read-overlay.html
source_host: androidreverser-test.github.io
clip_date: 2026-11-12T17:16:45+08:00
trace_id: 681d95cc-aba2-4581-9570-63ebdc0ccb94
content_hash: d6f814491b26ff9586964c219b70748a8bdc95b6c27f8a35f86bba61ed8b4a0b
status: synced
tags: []
series: null
feed_source: null
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41675244-d011-81dd-a327-c32426c6e56a
ioc: null
---

同一段代码，CPU 执行的指令与程序读取到的字节，可以来自不同的视图。

[urov-lab](https://github.com/AndroidReverser-Test/urov-lab) 当前发布的 UROV-Z 1.0.0 就在验证这件事：保留 Android ARM64 用户进程的原始代码执行路径，为指定代码页的数据读取提供另一份内容。它依托 KernelPatch 运行，通过页权限异常、A64 指令模拟和内核读取路径的补充拦截实现读取覆盖。

这篇文章从一次具体读取出发，拆解页表、异常处理、影像更新、内核适配与资源回收，再与 `mkpms/wxshadow` 、 `xiaojianbang-stealth-hook` 、 `stealth-core` 和 `Android-hwbp-kernel-hook` 对比。讨论重点是各方案如何改变程序的观察结果，以及为此承担什么代价。

源码基线核对日期为 **2026 年 11 月 11 日**，实现详解于 **2026 年 11 月 12 日** 补充。UROV-Z 以本地 `kpms/urov-lab` 和当时已核对一致的公开提交为基准；其他项目同样固定到下列提交。本文进行了源码核对，运行数据引用仓库已有记录，没有重新执行设备测试或跨框架性能测试。文中的简化伪代码用于解释顺序与不变量，省略部分分支，不能直接作为内核实现使用。

| 项目  | 本文分析的提交 | 关注范围 |
| --- | --- | --- |
| UROV-Z 1.0.0 | [0647f40](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c) | PAGE_AP 读取覆盖、用户态 API、测试与审查记录 |
| mkpms | [29c4187](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow.c) | 其中的 wxshadow 模块 |
| xiaojianbang-stealth-hook | [92b36f5](https://github.com/xiaojianbang8888/xiaojianbang-stealth-hook/blob/92b36f52fd691fb478627adcc22bcb5b7f8b263f/kpm/hwbp.c) | HWBP 与 PTE/UXN 两条路径 |
| stealth-core | [8006477](https://github.com/1013503897/stealth-core/blob/80064779d48bf24ea207a3f67219f8a8a38c589b/kpm/shpte.c) | UXN、区域克隆、DBI 与 SSOL |
| Android-hwbp-kernel-hook | [2799d69](https://github.com/ankitrawatgit/Android-hwbp-kernel-hook/blob/2799d69be5f341c6818dc7c91dfe6ec1cad66d7c/kernel/ahwbp.c) | 独立 LKM 的 perf/HWBP 路径 |

**先看一个能区分“执行”和“读取”的实验。** UROV-Z 的测试汇编在文件映射的 `.text` 中准备了一个返回 `1235` 的函数，并在后面填入 `0x11` 。测试 App 随后为所在页注册替代影像；第一页的主要内容被设为 `0x6a` 。

注册前后，实验应观察到下面的变化：

| 操作  | 注册前 | 注册后 |
| --- | --- | --- |
| 调用 `uz_fixture()` | 返回 1235 | 仍返回 1235 |
| 通过 `LDRB` 读取 `base + 256` | 0x11 | 0x6a |
| 从目标页内的 `uz_self_read` 发起读取 | 0x11 | 0x6a |
| 对注册的两页做 CRC | 原始内容对应的 CRC | 与注册影像的 CRC 相同 |
| 注销后再次读取 | —   | 恢复原始内容 |

这里“修改读取返回值”的准确含义是：改变访存指令得到的数据，或者改变内核辅助读取交付的字节。框架的基础功能不以修改某个 C 函数的返回值为目标。比如 `LDR X2, [X0]` 得到的替代值进入 `X2` ；它不一定经过函数返回寄存器 `X0` 。

这个实验也说明，覆盖影像可以包含任意测试字节，不必是一份可执行代码。CPU 仍从原始映射取指。 [测试汇编](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/app/fixture.S) 与 [App 核心断言](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/app/app.c#L247) 给出了上述行为的直接依据。

**项目的三层结构分别处理内核机制、控制协议和验证。** `module/` 中是 KPM； `api/` 是可独立集成的用户态 C/C++ 接口； `app/` 提供普通 Android App 与汇编测试样本。

| 源码位置 | 主要职责 |
| --- | --- |
| `module/urov_z.c` | KPM 元信息、初始化、全局状态查询与退出 |
| `module/backend.c` | 注册、页表修改、异常、远程读取、映射和进程生命周期 |
| `module/decode.c` | 解析 A64 访存指令，计算有效地址、宽度和 writeback |
| `module/emulate.c` 、 `core_selftest.c` | 独立的通用寄存器模拟模型及核心自检 |
| `module/readers.h` | 两组 epoch 读者引用，控制影像何时可以复用 |
| `module/compat.h` 、 `btf.h` | 内核布局、函数签名、标志与页表几何校验 |
| `module/window.h` 、 `prewin.h` | LL/SC 前后指令窗口分析 |
| `api/include/urov/` 、 `api/src/urov.c` | 共享 ABI、认证与 typed API |
| `app/fixture.S` 、 `app/app.c` | 稳定的指令样本和端到端测试 |

KPM 的运行基础由 KernelPatch 提供：模块解析内核符号，通过 `hook_wrap` 挂接内核函数，通过 `fp_hook_syscalln` 挂接系统调用。项目构建脚本把代码编译为 AArch64 freestanding 对象，使用 `ld.lld -r` 生成可重定位的 `.kpm` 。它与按目标内核构建、通过 Linux 模块机制加载的普通 `.ko` 在装载方式上不同。 [模块入口](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/urov_z.c) 、 [构建脚本](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/build.ps1) 和 [hook 安装代码](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L6067) 可以连起来阅读。

需要区分通用模拟核心和实际异常路径：真实运行时由 `backend.c` 的 `uz_emulate_load` 调用解码器，并自行处理多页和 FPSIMD 提交；不能把较小的 `uro_emulate` 模型当作后端的全部能力。

当前 Z 版本从 UROV-Y 2.28.0 收敛而来，只保留 **PAGE_AP / all-callers**。旧分支的 BRK、UXN 后端与调用者策略不属于当前 Z 的可选模式。源码里保留的单步与指令窗口，是写入、独占序列的辅助机制。 [版本取舍说明](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/DESIGN.md) 。

**先把模块加载与页注册分开，才能读懂初始化代码。** `urov_z_backend_init` 的任务是搭好处理通道；此时还没有任何应用代码页被设置权限陷阱。它依次解析模块参数和密钥、运行核心自检、解析内核布局及函数、安装 hook，最后用 release store 发布 `g_ready=1` 。应用随后发来的 REGISTER 才建立会话并修改目标 PTE。

安装过程也区分必需机制和扩展能力。PAGE_AP 依赖 `do_mem_abort` 与 `handle_mm_fault` 两个入口：前者接住现有陷阱，后者在原生缺页重新建立 PTE 后补回陷阱。缺少其中的基础设施不能宣布 PAGE_AP 可用。remote-VM、GUP、FPSIMD、单步和 fork 快照等能力，则结合所需 helper 与 hook 的实际安装结果生成 capability。比如 `g_pin_ok` 同时要求 pin hook、FOLL_PIN 值、grab/unpin helper、页分配、页复制及 vmalloc-to-page 转换可用，不能只凭找到一个 `pin_user_pages_remote` 符号就置位 READV。 [初始化与 capability 构造](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L6028) 。

从这里可以得到一张更适合读源码的调用路线图：

```
加载：urov_z_backend_init → resolve_kernel → 安装 hook → g_ready
控制：prctl → uz_prctl_before → dispatch → do_register / do_set_page / release_session
直接读取：do_mem_abort → uz_abort_before → uz_emulate_load → uro_decode
                                                ↓
                                      read_range → 提交 GPR/FPSIMD
内核代读：remote-VM after / remote pin after / fast-GUP after
映射维护：syscall gates / handle_mm_fault before+after / copy_mm after
```

`hook_wrap` 回调中的 `skip_origin` 也有明确含义：置位表示此次调用由模块处理，不再执行原函数。普通 load 模拟成功后，寄存器已是“指令完成”的状态，继续让原 `do_mem_abort` 再处理同一异常就不正确。反之，非目标异常应保留原生分派，某些写入重试也需要 Linux 继续完成 COW。

**运行状态由会话、页描述符和子进程影像三部分组成。** `uz_session` 保存 owner `mm` 、 `tgid` 、generation、统计和页数组； `uz_page` 保存一页的地址、影像、映射身份和转换状态； `uz_shadow` 保存某个子 `mm` 对应的独立 image/snapshot。理解这些字段，比把后端看成一个全局“开关”更准确。

| 状态或字段 | 在调用链中的作用 |
| --- | --- |
| `g_ready` | 模块是否允许控制请求进入已准备好的后端 |
| `g_state` 、 `g_owner` | 当前是否存在 LIVE 会话，以及 owner 地址空间是谁 |
| `g_suspend` | 安装或退出期间暂停提供替代字节，已进入的受管读取可以使用原始快照 |
| `base` 、 `index` | 分别用于按虚拟地址查找、按调用者原始描述符序号更新 |
| `want` | 当前映射是否应当维持读取陷阱 |
| `armed` | 陷阱是否已安装；撤销时值 2 还表示等待 TLBI 完成的过渡阶段 |
| `dead` 、 `gone` | 分别表示覆盖已失效、原注册映射已消失或被替换 |
| `seq` 、 `replay` 、 `ext` | 分别协调原地影像写入、原生重放、外部写入待合并状态 |
| `vma_file/pgoff/start/end` | 保存注册映射身份，供 refault 与子映射关联使用 |

`want` 与 `armed` 分开的原因是：映射在逻辑上仍需要覆盖，PTE 却可能暂时被回收；相反，权限恢复和 TLB 传播期间，旧异常仍可能到达。 `dead` 也不等于 `gone` ：页还在，但辅助写入路径可能已放弃继续覆盖它。相关判断分散在异常、缺页和映射回调中，不能用一个布尔量概括。 [数据结构](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L219) 。

owner 绑定到 `mm` 而非单个线程号，因此共享地址空间的线程能读取同一会话。 `session_get_mm` 先检查 owner，再进入读者 epoch，进入后还要复核 `g_sess.mm` ；这第二次检查防止进入读者协议的过程中，会话已被切换。模块用 `get_task_mm` 持有引用， `mm_has_live_user` 因而检查 `mm_users > 1` ，区分“只剩模块保留的引用”和“地址空间仍有使用者”；这个数不能直接解释成线程数量。 [会话引用获取](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L465) 与 [进入读者协议](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L566) 。

**PAGE_AP 的核心是让数据读取产生异常，同时保留取指能力。** 在项目接受的 ARM64 stage-1 普通页表配置中，leaf PTE 的几个关键字段分别控制物理地址、EL0 数据权限和执行权限：

| 字段  | Linux 常用名称 | 与本方案的关系 |
| --- | --- | --- |
| 输出地址 | 页框地址字段 | 指向实际代码物理页 |
| AP\[1\]，bit 6 | `PTE_USER` | 控制 EL0 数据访问许可 |
| AP\[2\]，bit 7 | `PTE_RDONLY` | 参与只读权限编码 |
| UXN，bit 54 | `PTE_UXN` | 控制用户态禁止执行 |

普通用户 RX 页在满足其他条件时，具有 `PTE_USER=1` 、 `PTE_RDONLY=1` 、 `PTE_UXN=0` 。UROV-Z 清除 `PTE_USER` ，保留原物理页和执行权限，使 EL0 数据读取触发 permission fault。

Linux 的 [ARM64 页表字段定义](https://github.com/torvalds/linux/blob/v6.1/arch/arm64/include/asm/pgtable-hwdef.h) 和历史上的 [PAGE_EXECONLY 编码](https://github.com/torvalds/linux/blob/v5.4/arch/arm64/include/asm/pgtable-prot.h) 提供了这套位语义的参照。这里借用的是受支持配置下的底层 PTE 行为，不能据此推定所有 Android 内核的公共 `mprotect(PROT_EXEC)` 都提供相同效果。

`ap_arm_pages` 会先检查 VMA 和 PTE，再经 `page_update_bits` 更新权限，并调用 TLB 失效操作。原因是处理器可能缓存旧翻译与权限；只把内存中的 PTE 改掉，不能保证其他 CPU 立刻按新权限访问。 [页验证与 arm 实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1203) 。

这里没有把用户 VA 映射到 `image` 。原 PTE 的输出地址仍指向原代码物理页， `image` 是模块拥有的内核缓冲区。CPU 取指继续走原翻译；数据读取进入内核后，由软件把 image 中的字节转换为指令结果。因而这也不是修改磁盘上的 ELF、替换文件 page cache，或为进程安装另一套执行页表。

具体到位操作， `page_update_bits_locked` 的通用转换是：

```
next = (old | set_bits) & ~clear_bits

注册 arm：set_bits = 0，clear_bits = PTE_USER
          要求 old 有 PTE_USER | PTE_RDONLY
          拒绝 old 有 PTE_UXN | PTE_DBM
```

先检查 `required/forbidden` ，再基于刚读到的 `old` 构造 `next` ，可保留输出地址和其他无需修改的状态。写回使用 compare-exchange；如果硬件 AF 更新或内核路径先改了 PTE，就重新 walk 并计算，最多尝试四次，不能拿先前保存的一整项直接覆盖。返回值 0 表示无需修改，1 表示确实改动，负值表示拒绝或竞争失败。 [PTE 转换核心](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1258) 。

另一个顺序要求是先发布 `armed=1` ，再 CAS 清 AP。若反过来，另一 CPU 已经因新权限进入异常，而软件仍认为“这页尚未 armed”，就可能把模块制造的异常当成普通非法访问。CAS 失败后相应撤回标记。这种安排解释了它试图维护的不变量： **处理器能看到陷阱时，软件侧应已具备处理该陷阱的状态。** 它不能独自解决页表页脱离、回收和 VMA 生命周期问题；当前缺少完整原生 PTL 适配的限制，后文会单独讨论。

这个步骤还带来一个容易忽略的成本： **即使只覆盖页内 8 字节，权限陷阱仍以整页为单位。** 对该页其他字节的数据读取也可能进入异常处理，只是最后返回原始快照对应的内容。

应用注册代码页和替代影像

校验映射，复制 snapshot 与 image

清除 PTE 的 AP\[1\]，刷新 TLB

CPU 取指：执行原始代码

EL0 数据读取：permission fault

校验 mm、ESR、FAR 与目标页

从原指令构造访存模型

读取 image，必要时按页拼接

提交寄存器、writeback、PC

返回 EL0，继续下一条指令

**注册过程先建立可用状态，再公开替代值。** `do_register` 获取调用者的 `mm` 引用，验证描述符、页对齐和覆盖窗口，按地址排序并拒绝重复页。原输入数组中的序号会保留下来，因此后续 `SET_PAGE(index)` 使用的仍是调用者提供的序号。

目标通常是可读、可执行、当前不可写的普通文件映射。匿名 JIT 页、设备映射、huge/block 或 contiguous 等特殊页表形态不能直接套用这条路径。共享文件映射还有额外约束，不能把“文件映射”理解为全部文件页都可注册。

每个目标页的主存储包含七份页大小的缓冲区：

| 缓冲区 | 用途  |
| --- | --- |
| `image` | 当前提供给读取者的完整页影像 |
| `spare` | 准备下一版影像 |
| `snapshot` | 原生字节快照，提供原始视图与操作码 |
| `pre/post` | 原生写入重放前后的内容 |
| `ext_pre/ext_buf` | 外部写入的捕获与同步 |

影像会先以 snapshot 为底，再覆盖用户指定的窗口。安装陷阱期间，后端先允许读者使用原始快照；等所有页 arm 成功后才公开替代值。若中途失败，则执行恢复流程，避免留下没有对应处理状态的权限陷阱。 [注册与存储布局](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4322) 。

**沿 `do_register` 往下读，可以把注册拆成五个有因果关系的步骤。**

1.  **固定输入和地址空间。** 检查保留字段、页数上限、descriptor stride，取得当前任务的 mm 引用，然后把用户描述符复制到内核数组。排序发生在内核副本中；例如调用者输入 `[0x30000, 0x10000]` ，排序后先放 `0x10000` ，但它的 `index` 仍为 1。普通故障按 base 二分查找，SET_PAGE 则按原 index 找页。
2.  **拒绝无法用当前模型描述的映射。** `validate_target_vma` 要求整页落在 VMA 内，READ 与 EXEC 都存在，WRITE 不存在，并排除 PFNMAP、HUGETLB、IO、MIXEDMAP 等形态。若是共享映射，还要求该 VMA 恰好是一页且没有 MAYWRITE。后续 PTE 检查再排除非普通 leaf、contiguous、special、devmap 和 PROT_NONE；VMA 合法并不自动代表 PTE 合法。
3.  **构造完整页影像。** `page_build_image` 先通过内核访问 helper 读取真实页到 snapshot，再复制整页到 image，最后覆盖指定窗口。这也使目标页先经历正常的原生 fault-in。七个缓冲区位于同一 arena 中，单页描述符的起点是 `arena + 7 × i × page_size` 。arena 优先用页对齐的 vmalloc 存储，是为了后续能经 `vmalloc_to_page` 找到影像对应的 `struct page` 。
4.  **发布可处理异常的过渡状态。** generation 置为 1，设置 `g_suspend=1` 、LIVE 并打开 reader 入口，再建立辅助分支分析信息、逐页 arm。此时有些页可能已进入权限陷阱，有些还没有；已经陷入的读者先使用 snapshot，避免过早交付替代值。
5.  **完成或回滚。** 所有页 arm 成功才清 `g_suspend` 并返回 active 会话。修改 PTE 前的失败可以直接释放尚未启用的存储；部分页已 arm 后的失败必须经过 `release_session` ，先恢复陷阱。若恢复本身失败，错误需要保留给调用方，不能假设已经完全撤销。

这里两次 VMA 校验各有作用：准备影像时在 mmap 写锁内验证并记录身份，真正 arm 时再在锁内检查当前映射。中间复制用户页可以发生缺页与调度，因此不能把第一轮校验当作永久有效的凭证。即便第二轮校验存在，native PTE 锁的缺口也仍然存在。 [映射校验](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1203) 、 [影像构造](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4308) 与 [启用顺序](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4443) 。

窗口规则也应按 ABI 逐项理解：有效长度至少 8 字节，必须是 8 的倍数，且 `off <= page_size - len` ；这里没有额外要求 off 必须按 8 对齐。多页描述符的 `fake_len=0` 表示整页；旧式单页请求的 `length=0` 则表示默认 8 字节，内联数据最多 32 字节。两处“0”的语义不同。 [窗口与描述符验证](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4290) 与 [请求影像读取](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1140) 。

以 4 KiB 页、 `fake_off=0x100` 、 `fake_len=8` 为例，构造后的 image 是：

```
页内偏移       0 … 0xff       0x100 … 0x107       0x108 … 0xfff
snapshot       原始字节         原始字节              原始字节
image          原始字节         指定的 8 字节          原始字节
用户执行       └──────────── 原物理页，保持原代码 ─────────────┘
```

因此普通读取路径无需每次再判断某个字节是否处于 fake window；它取完整 image 的相应片段即可。窗口外“看起来仍是原始内容”，是构造影像时的结果。snapshot 在后续辅助写入路径中也可能更新，不应把这个名称理解成整个会话期间永远不变的文件备份。

**一次异常的工作量，远大于向寄存器写一个常量。** UROV-Z 在 `do_mem_abort` 的 before-hook 中接管符合条件的异常。主读取路径要求来自 AArch64 EL0 的 data abort，EC 为 `0x24` ，FSC 为 level-3 permission fault `0x0f` ；同时核对 FAR、异常附加信息、地址空间及覆盖页。普通读取还会排除写访问与 cache-maintenance 情形。其他异常继续交给 Linux。 [异常入口](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3897) ；Linux 原始分派参见 [ARM64 fault.c](https://github.com/torvalds/linux/blob/v6.1/arch/arm64/mm/fault.c) 。

这里的筛选是在回答两个不同问题： **异常是否由本模块负责，以及负责后能否正确完成指令。** 前者不成立就退出 hook，让 Linux 处理；后者不成立则不能假装读取已成功。

| 检查  | 原因  |
| --- | --- |
| `user_mode` 且非 compat | 当前解码和寄存器模型只针对 AArch64 EL0 |
| EC= `0x24` 、FSC= `0x0f` | 匹配来自低异常级的数据访问、末级权限错误；不是任意 page fault |
| 排除 FnV、S1PTW、EA 和不支持的 ISS2 | 不把无效 FAR、页表遍历或其他异常附加语义混入普通读取 |
| FAR 位于允许的用户地址区间 | 避免把内核地址或无法表示的用户地址当作目标 |
| owner/已知 child 与目标页身份匹配 | 相同数值的 VA，在另一个进程里可能表示完全不同的映射 |
| 普通读取排除 WnR、CM | 写入与 cache maintenance 不能按普通 load 提交 |

识别到受管页后，源码还先尝试 LSE atomic 辅助路径，再进入普通 load 模拟，因为某些读改写指令也可能以读异常形式报告。下面先沿最常用的普通 load 路径展开。

**先取对操作码，再谈解码。** 若故障 PC 位于普通未注册页，后端通过 nofault helper 读取该处 4 字节；若 PC 也位于注册页，则从该页的 **snapshot** 取操作码。替代 image 可能是一整页 `0x6a` ；拿它解码，就与 CPU 实际执行的 `LDR` 无关了。异常返回地址也仍在原代码地址空间中，不需要跳到用户 trampoline。 [操作码来源](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4022) 。

可以用一个贯穿后续讨论的例子理解：

```
页基址 B       = 0x10000，页大小 4096
PC             = B + 0x20
原始指令       = ldr x2, [x0]，操作码 0xf9400002
X0             = B + 0x100
image[0x100..] = 11 22 33 44 55 66 77 88
```

CPU 从原物理页取到 LDR，再在读取 `0x10100` 时进入异常。handler 从 `snapshot+0x20` 获得 `0xf9400002` ，从 `image+0x100` 获得替代数据。这两次取值刻意使用不同来源，正是“同一页既执行又自读”能够完成的原因。

**`uro_decode` 把指令转换成访存描述，不直接改变机器状态。** `uz_emulate_load` 先复制 X0–X30、SP、PC、PSTATE 到 `uro_regs model` ，然后调用解码器得到 `uro_load` 。这一中间结构的重要字段如下：

| 字段  | 含义  |
| --- | --- |
| `address` 、 `total` | 完整访存范围的起点和总字节数 |
| `size` 、 `count` | 每个元素的宽度，以及目标寄存器数量 |
| `rt/rt2` 、 `dest_bits` | 目标寄存器及其 32/64 位语义 |
| `sign_extend` | 是否先按源宽度进行符号扩展 |
| `rn` 、 `writeback` 、 `wb` | 基址寄存器，以及成功后是否写回、写回什么值 |
| `vector/multi` | 普通 GPR、单个/成对 SIMD，还是结构加载 |
| `nregs/selem/esize/elements/dst[]` | 多结构 SIMD 数据如何分配到 V 寄存器 |
| `excl/acquire` | 独占加载的额外语义，留给 LL/SC 辅助路径处理 |

解码器在局部 `load` 上工作，所有检查通过才执行 `*out = load` 。失败不会给调用者留下半个有效描述。它负责指令编码、地址算术与寄存器约束；映射是否受管、地址是否属于当前支持范围、FAR 是否一致，则留给后端验证。 [解码接口](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/decode.h) 与 [解码主函数](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/decode.c#L206) 。

以刚才的 `0xf9400002` 为例，Rt 来自低 5 位，得到 2；Rn 来自 bits 9:5，得到 0；size 来自 bits 31:30，得到 8 字节；imm12 为 0。因此得到 `address=X0` 、 `size=8` 、 `count=1` 、 `total=8` 、 `dest_bits=64` ，没有 writeback。若是 `ldr x2,[x0,#8]` ，编码中的 imm12 是 1，地址计算要乘以元素宽度 8，不能把 imm12 直接当成字节偏移。

不同寻址形式会产生不同的 `address` 与 `wb` ，这是模拟器最容易写错的地方：

| 形式  | 读取地址 | 成功后的基址变化 |
| --- | --- | --- |
| 无符号立即数偏移 | base + imm12 × 元素宽度 | 不回写 |
| LDUR 等非缩放偏移 | base + 有符号 imm9 | 不回写 |
| pre-index，例如 `[x0,#8]!` | 原 X0 + 8 | X0 = 原 X0 + 8 |
| post-index，例如 `[x0],#8` | 原 X0 | X0 = 原 X0 + 8 |
| 寄存器偏移 | base + 经 UXTW/LSL/SXTW/SXTX 扩展和缩放的偏移 | 不回写 |
| literal load | 当前指令 PC + sign_extend(imm19) × 4 | 没有基址寄存器回写 |
| LDP/LDPSW 等 pair | 按 pair 模式计算，连续取得两个元素 | pre/post 模式才回写 |

源码用“符号 + 无符号幅值”计算负偏移，避免 C 的负数左移和有符号溢出；加减前分别检查上溢、下溢。SP 作为 base 时先检查 **SP 本身** 的 16 字节对齐。寄存器编号 31 的含义还取决于位置：Rn 表示 SP，GPR 目标 Rt 表示 XZR/WZR、丢弃读取结果，寄存器偏移中的 Rm 表示零，而 SIMD 目标 31 是实际的 V31。不能统一写成 `regs[31]` 。 [地址计算辅助函数](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/decode.c#L15) 。

解码器还拒绝受约束的不确定组合，例如 GPR writeback 时 base 与目标重叠，或 pair 的两个目标相同。另一个需要对照后端的细节是 LDTR：通用 `uro_decode` 拒绝相应寻址模式，但 `uz_emulate_load` 会在 EL0 场景尝试 `uz_unprivileged_alias` ，将支持形式转换成相应非缩放 load 编码后重试。因此只看 `decode.c` 中某一句“不支持”，也不能完整判断运行路径。 [EL0 unprivileged-load 适配](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3772) 。

**地址验证必须覆盖整次访问，不能只检查 FAR 所在页。** 后端要求 `total` 在 1–64 字节内，完整 `[address,address+total)` 位于支持的用户范围；存在 writeback 时还验证 wb。 `uz_user_range` 采用 `bytes <= user_limit - addr` ，避免先做 `addr+bytes` 而产生整数回绕。解码器保留地址中的高位信息不代表后端接受所有 tagged/MTE 地址；这些仍受最终范围与配置限制。

FAR 也不是随意传入的地址标签。后端要求它落在解码出的完整访存范围中： `far >= address` 且 `far-address < total` 。FAR 不必等于起始地址，因为一次跨页访存可以在后面的页上发生异常。这个检查把“CPU 报告的访问”和“软件准备模拟的指令”关联起来，防止错误指令或寄存器状态造成无关读取。 [后端校验](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3798) 。

**跨页读取先拼接字节，再统一提交结果。** `read_range` 每轮计算当前页偏移与剩余长度：

```
cur = address + done
off = cur - page_base(cur)
seg = min(page_size - off, total - done)

该片段受管：page_view_mm → 父 image 或子 image；暂停时使用 snapshot
该片段未受管：nofault 用户内存读取
全部片段成功后：进入寄存器提交
```

例如 `ldp x2,x3,[x0]` ，X0= `0x10ff8` ，则 16 字节被拆成：

| 片段  | 地址  | 长度  | 来源  |
| --- | --- | --- | --- |
| 第一段 | `0x10ff8–0x10fff` | 8   | 页 `0x10000` 的 image 尾部 |
| 第二段 | `0x11000–0x11007` | 8   | 下一受管页的 image，或未注册页的 nofault 读取 |

两段先进入局部 `bytes[64]` ，然后才构造 X2、X3。若第二段读取失败，不能留下“X2 已改成替代值、X3 和 PC 还停在旧状态”的半条指令。这里保证的是软件提交顺序，不是两页共享同一 generation 的事务。nofault helper 也不会为了模拟一条指令而任意进入可睡眠缺页流程；若未受管的后一页无法立即读取，本实现可能返回失败，不能据此宣称所有原生可完成的跨页缺页都透明兼容。 [分段实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1080) 。

**GPR 提交不仅是 memcpy，还要重建 A64 的结果语义。** `uz_commit` 按小端序把每个元素组合成整数，先符号扩展，再根据目标宽度截成 32 位，最后写目标寄存器、处理 writeback，并令 PC 增加 4。

因此前面的 8 字节 `11 22 33 44 55 66 77 88` 最终使 X2= `0x8877665544332211` ；X0 保持 `0x10100` ，PC 从 `0x10020` 变为 `0x10024` 。若换成自检中的 `ldr x2,[x0],#8` ，操作码 `0xf8408402` ，读取的仍是旧 X0 指向的 8 字节，但成功后 X0 变为 `0x10108` 。 [GPR 提交](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1467) 与 [相应核心自检](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/core_selftest.c#L66) 。

同样读取一个 `0x80` 字节，结果则取决于指令：

| 指令  | 提交后从完整 X2 观察到的值 | 原因  |
| --- | --- | --- |
| `ldrb w2,[x0]` | `0x0000000000000080` | 无符号加载到 W2 |
| `ldrsb w2,[x0]` | `0x00000000ffffff80` | 先符号扩展成 32 位结果；写 W2 清 X2 高 32 位 |
| `ldrsb x2,[x0]` | `0xffffffffffffff80` | 符号扩展到 64 位 |

最后的 `commit_model` 只把 GPR、SP 和 PC 写回 `pt_regs` ，不写回 PSTATE；普通 load 不应改变 NZCV 条件码。源读取、解码或向量能力检查失败时，不会执行这一步。 `emulate_or_signal` 随后累加 failures，并请求 `SIGSEGV/SEGV_ACCERR` ；属于源读取失败时用失败片段地址报告，其他情形使用故障地址。这和“放开权限让未知 load 读到原值”有不同的行为，文章中的透明性结论必须以支持指令为前提。 [失败与信号路径](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3885) 。

**SIMD 路径要接入 Linux 的浮点上下文管理。** `pt_regs` 没有完整 V0–V31 内容，所以 `LDR Q` 或 `LD2` 的结果不能只更新通用寄存器。后端先确认 FPSIMD 布局与 helper 可用，通过 preserve helper 使任务状态可读取，再复制到一个 16 字节对齐的私有 `uz_fpstate` ，修改目标 V 寄存器，最后调用 update helper。使用私有副本是为了避免直接修改 task 保存区时，被内核自己的上下文保存覆盖。 [FPSIMD 保存和提交](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1504) 。

普通向量 load 按 size 填目标寄存器，较窄的形式清零其余高位。多个结构的加载还需要反交错，而非简单地把连续两块内存各放一个寄存器。例如：

```
ld2 {v0.8b, v1.8b}, [x0]
```

```
内存：a0 b0 a1 b1 a2 b2 … a7 b7
V0 ：a0 a1 a2 a3 a4 a5 a6 a7 | 高 64 位清零
V1 ：b0 b1 b2 b3 b4 b5 b6 b7 | 高 64 位清零
```

`uz_fp_commit_multi` 用 repeat `r` 、元素 `e` 、结构序号 `s` 计算源偏移： `((r × elements + e) × selem + s) × esize` ；目标是 `dst[r × selem + s]` 的 `e × esize` 位置。LD1 的多个寄存器对应 repeat，LD2–LD4 对应多路结构，这组字段使不同形式可以共用分配过程。 [结构加载解码](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/decode.c#L128) 与 [反交错提交](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1548) 。

向量提交必须先成功，才会更新 GPR 中的 writeback 和 PC。存在活动 SVE/SME 状态时，当前实现拒绝按普通 FPSIMD 路径改写；若无法从布局确认相应状态，而硬件又支持该扩展，也采取保守拒绝。single-lane 等未被解码器覆盖的形式不能由“支持 LD1–LD4”推导出来。模块使用 `-mgeneral-regs-only` 构建，也与通过内核 helper 显式管理用户向量状态的方式一致。

最后，统计字段应按源码含义阅读：使用替代视图完成的受管 load 累加 hits；暂停期间从 snapshot 完成的受管 load 可以累加 replays；模拟失败累加 failures。 **replays 计数并不专指执行过一次硬件单步**，不能把它直接当成 native replay 的次数。 [加载与计数出口](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3856) 。

**all-callers 取消的是读取者白名单。** 后端仍然需要 PC 来解码指令，也需要判断当前 mm、页身份和指令能力；它只是不会要求读者提前登记 PC、LR 或调用函数。因此，同一覆盖范围内，普通汇编、libc 的复制/比较、CRC 代码，都有机会通过同一套数据读取路径观察到替代影像。新的文件别名、直接文件读取或系统内任意设备访问，并不会自动继承这份视图。

**内核代读需要另外处理，因为它可能不经过 EL0 的数据异常。** 对用户地址执行 `LDR` ，与内核先取得物理页再复制内容，是两条不同路径。UROV-Z 为此补上了以下 hook：

| 读取路径 | UROV-Z 的处理位置与方式 |
| --- | --- |
| `/proc/<pid>/mem` 、使用相同 helper 的 ptrace 路径 | 在 remote-VM helper 成功返回后，覆盖已读取的内核缓冲区片段 |
| `process_vm_readv` | 在相关 remote GUP/pin helper 返回后，将成功 pin 的源页换成独立影像页 |
| `vmsplice` 等普通 fast-GUP 读者 | 将符合条件的源页替换成持有普通页引用的独立副本 |
| 写 GUP、长期 pin、未覆盖接口 | 按各自限制处理，不能概括为任意内核读取均被接管 |

remote-VM 路径保留 Linux 原有的访问控制与成功长度，只修改实际返回范围。模块自己的 snapshot 读取则通过按 task 管理的内部访问标记排除，否则复制“原始页”时可能把自己提供的影像再次复制进去。 [远程读取 hook](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4914) 。

更具体地说， `uz_kread_after` 运行在 native helper 返回之后：先看返回值是否大于 0，再按已选定的 5 参数或 6 参数 ABI 提取 mm、源地址、内核缓冲区及 flags。它用 native 返回的成功字节数作为覆盖范围，逐页与注册范围求交。假设请求从 `B+0xf0` 读 48 字节，native 实际只读出 20 字节，而 fake window 是 `B+0x100` 开始的 8 字节，那么有效返回区间只与窗口相交 4 字节；不能把另外 4 字节补成一次原本没有成功的读取。 [返回缓冲区分段覆盖](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4863) 。

内部访问标记解决的是递归语义问题：REGISTER 要借助同一个 access helper 取得原始内容，控制回复或辅助写入也可能使用它；如果它们被当成外部观察者，snapshot 就会被自己的 image 污染。 `uz_access_vm` 在 64 个槽中用 CAS 记录 current task，调用完成后 release 清空；after-hook 遇到当前 task 的标记就跳过。按 task 记录可以跨调度保持身份，槽耗尽则返回 EBUSY，不继续执行一次无法区分来源的内部访问。 [内部访问隔离](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L473) 。

readv 路径的关键是 **页引用类型与存储生命周期**。系统调用开始时保留 session reader；native pin 完成后，为覆盖页分配独立 order-0 页，复制影像，使用匹配的 grab/unpin helper 转移引用，最后由 native syscall 的 unpin 流程释放。这样，SET 或注销不会提前回收系统调用正在读取的来源。当前版本没有“重新读取用户 iovec，然后重写目的缓冲区”的兼容回退。 [readv 与 pin 实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4721) 。

**readv 换的是交给复制循环的源页对象。** 普通用户读取依赖 PTE 权限；GUP/pin 已经取得 `struct page *` 后，内核可以沿页对象复制数据，不需要再次执行 EL0 的 LDR。因此单独清 AP 无法改变这条路径的来源。

`uz_vm_readv_before` 为 current 保留 reader token，并建立 syscall 记录。 `uz_pin_after` 只处理有该记录的当前调用，检查 pin 成功页数、目标 mm 和 flags，逐页找到覆盖关系。每个替换页的引用转移可以按下表核对：

| 阶段  | 原生页 | 新的影像副本页 |
| --- | --- | --- |
| native pin 返回 | `pages[i]` 持有 native pin | 尚未分配 |
| `alloc_pages(..., order=0)` | 不变  | 持有分配产生的普通引用 |
| `copy_highpage` | 不变  | 填入完整 image 内容 |
| `try_grab_page(..., FOLL_PIN)` | 不变  | 再取得与调用者约定一致的 pin 引用 |
| `put_page(copy)` | 不变  | 释放分配引用，保留 pin |
| `unpin_user_page(pages[i])` 后替换数组项 | 释放本次 native pin | 成为新的 `pages[i]` |
| native 复制结束并 unpin | 本模块不再持有该次 pin | 最后按 pin 规则释放 |

这里使用 kernel grab/unpin helper，而非手写一个固定 refcount 增减数；不同内核的 pin 计数和返回类型需要按适配结果调用。临时副本也不会安装到目标进程页表，原始执行 PFN 保持不变。 [页替换与失败清理](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4746) 。

为什么不直接把 `vmalloc_to_page(image)` 返回给 syscall？因为 image 是会话的可复用存储：SET 会交换它，下一次更新会把退役 image 当 spare 重写，注销还会释放 arena。临时页把 syscall 持有的来源与模块缓冲区的后续复用分开；syscall reader 则保证复制来源及会话描述符在整个调用期间仍然有效。 `uz_vm_readv_after` 最后清记录并退出 reader。

若第 k 页分配失败， `uz_pin_after` 会清理本次 got 范围中的所有数组项：前面的替代页和后面的原生 pin 都按 unpin 规则释放，数组项归零并返回 ENOMEM。不能只释放新分配的那一页，也不能把剩余原始页混入一个声称覆盖成功的结果。这种失败处理保证的是本次 helper 不返回混杂页数组，不意味着一个已分批复制的多 iovec syscall 能撤回此前全部用户可见数据。

普通 GUP 的引用与 FOLL_PIN 的引用约定不同，不能用相同的减引用操作处理；LONGTERM 也代表更严格的生命周期要求。UROV-Z 的 fast-GUP 路径排除 PIN/LONGTERM/FAST_ONLY 等情形，复制失败会返回错误，而不是悄悄交出原始页。 [fast-GUP 实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4975) ；引用模型参见 [Linux pin_user_pages 文档](https://docs.kernel.org/core-api/pin_user_pages.html) 。

fast-GUP 的副本只需要普通页引用：分配页后复制 image， `put_page` 释放旧源页引用，再把新页放入数组，由调用者最终 `put_page` 。写 GUP 则不能交付副本，因为写入必须到达真实目标页；后端沿外部写入捕获/合并路径维护视图。对这些分支的区分，比把所有 `get_user_pages` 调用统称为“读取 hook”更有解释力。

仓库审查还记录过一个实际问题：某个 5.15 厂商内核上，readv 的 syscall hook 命中了，公开 pin wrapper 却没有命中。修复后优先选择经 BTF 签名验证的内部 GUP 入口，再按条件回退公开入口。LTO 内联是与观测一致的解释，报告没有声称已通过反汇编证明。这说明“函数存在且 hook 安装成功”与“真实数据路径经过它”必须分别验证。 [GUP 修复证据](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/AUDIT.md) 。

**控制协议解决谁能注册、更新哪一页、如何发现状态冲突。** 模块 hook `prctl` ，用户态库封装的传输形式为：

```c
syscall(__NR_prctl, option, magic, op, &request, sizeof(request));
```

ABI v1 的请求为 184 字节，页描述符为 32 字节。option 和 MAC key 由独立的 16 字节模块密钥派生，派生域使用 `UROVZ/1` ；magic 固定。SipHash-2-4 覆盖请求的前 176 字节，最后 8 字节保存 MAC。模块密钥与 KernelPatch 的 superkey 用途不同。 [共享 ABI](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/api/include/urov/abi.h) 、 [密钥派生](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/api/include/urov/auth.h) 与 [控制入口](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4658) 。

| 操作  | 应用侧目的 |
| --- | --- |
| QUERY | 获取页大小、最大页数、capability 与调用者状态 |
| REGISTER | 注册一个或多个目标页与影像 |
| SET | 更新单页会话的既有覆盖窗口 |
| SET_PAGE | 按原描述符序号更新某一页 |
| STATUS | 读取调用者会话状态、generation 与统计 |
| DEACTIVATE | 恢复页权限并释放会话 |

控制请求需要正确认证，但读取者无需持有模块密钥。会话控制权绑定 owner mm，同一地址空间中的线程共享它；全局当前最多一个会话，session ID 固定为 1。应用本身可以在普通 `untrusted_app` 域使用 API，前提是管理员已加载模块。

`uz_prctl_before` 的处理顺序可概括为三道检查。第一道是 transport：option、magic、op、结构大小与地址；第二道是复制后的请求内容：size/version/op 一致以及 MAC 正确；第三道是 `dispatch` 内的模块状态、控制锁和各操作自己的 ownership/generation 检查。前两道未匹配时直接返回 hook，不接管原生 prctl；正确认证后，模块才用 `skip_origin` 返回自己的结果。

在真正 dispatch 前，它还尝试把原请求写回一次，检查输出缓冲区当前是否可写。dispatch 结束后会把 `fake_addr/pages_addr` 清零，再复制结果给用户。预检和最终写回之间，另一个线程仍可能解除映射，因此预检无法构成输出内存永远可写的保证。 [完整控制分派](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4624) 。

SET 使用 `expected_generation` 检查版本，冲突返回 `EAGAIN` 。这能发现基于旧状态的更新，却不等于跨多页读取的快照事务。 `request_id` 只是关联字段，也不是防重放 nonce；MAC 认证的是请求结构，不是对请求指针所指向影像做一份不可变封存。调用期间缓冲区仍须保持有效且稳定。

generation 属于整个 session，而不是每页独立计数。例如两个线程都以 generation=7 更新不同页，第一个成功后 session 变为 8，第二个仍提交 7 就会得到 EAGAIN。 `g_ctrl_busy` 通过 try-lock 串行化这类操作，竞争时可以先得到 EBUSY；它并不让普通异常读取者停下来。应用需要分别理解“控制入口忙”“版本过期”和“读取仍在继续”这三件事。

用户态库统一返回 0 或负 errno，不自动重试 `EBUSY/EAGAIN` 。 `urov_request_init` 为每次操作清零并设置 ABI 头， `urov_call` 再把请求复制到局部 wire、计算 MAC 和调用 syscall，成功后才把 wire 交回调用者；typed API 的输出也只在成功时更新。每次重新构造请求可以避免把上次回复中的 capability 等输出字段误当成本次输入。 `EFAULT` 还有一个值得单独理解的情形：操作可能已经提交，只在最后写回结果时失败，此时应查询状态再决定是否重试。 `urov_client_destroy` 只清理客户端密钥，不会替应用注销内核会话。 [API 约定](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/api/include/urov/urov.h) 与 [请求封装实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/api/src/urov.c#L48) 。

**影像更新要同时解决发布顺序与旧缓冲区回收。** 后端在 spare 中构造完整的新页，通过原子交换发布 image 指针，再翻转 epoch，等待旧 epoch 的读者退出，最后才能把旧 image 作为下一次更新的 spare。

`readers.h` 把两组 31 位引用计数、1 位 epoch 和 1 位关闭标志放进同一个 64 位原子字。读者通过 CAS 进入当前 epoch，写者可以原子地切换 epoch 或关闭入口，避免“写者以为旧读者已经清空，另一个线程才进入旧 epoch”的交错。 [读者协议](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/readers.h) 与 [影像交换](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1154) 。

**SET_PAGE 重新生成完整 image，而不是对当前 image 叠加 patch。** `do_set_page` 先排空待合并的外部写入，再复制 snapshot 到 spare，最后把新的用户窗口填入 spare。它允许变更窗口的 off/len；旧窗口不属于新窗口的部分会回到 snapshot 对应字节。例如旧覆盖位于 `[0x100,0x108)` ，新覆盖改到 `[0x200,0x208)` ，本次更新后 `0x100` 处不再自动保留上次替代值。旧式 SET 则限定单页和既有窗口长度。 [SET 与 SET_PAGE](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4495) 。

以下时序解释为什么交换指针后还要等待。假设当前 image=A、spare=B、epoch=0：

后续读者 SET_PAGE 已进入的读者 后续读者 SET_PAGE 已进入的读者 epoch 0 引用加一，取得 A 在 B 中准备完整新内容 原子交换 image=B 翻转到 epoch 1 epoch 1 引用加一，读取 B 等待 epoch 0 归零 完成读取，退出 epoch 0 A 成为下一次更新的 spare 完成读取，退出 epoch 1

这不是等待“所有线程都停止读取”。writer 只等待翻转前那组计数，新读者可以继续使用 B；若 A 还被旧读者引用，就不能马上把它清空或用于下一次更新。源码的 `drain_readers` 用 `msleep(1)` 等待，没有“超过超时就强行回收”的分支，因而长时间持有 reader 的操作也会延长 SET 的完成时间。

原子状态字的布局和 token 可以写成：

```
bit 63       bit 62        bits 61..31       bits 30..0
CLOSED       当前 epoch    epoch 1 计数      epoch 0 计数

epoch 0 进入 token = 1
epoch 1 进入 token = 1 << 31
退出时对同一个原子字减去对应 token
```

读者 CAS 同时检验“入口没关闭、epoch 没变化、该组计数未满”并增加计数。writer 翻转或关闭后，使用旧状态的 CAS 会失败并重新读取，所以不存在“翻转已经结束，读者却成功登记到退役 epoch”的窗口。image 的 release 发布、epoch 的原子切换和 reader 的 acquire 操作共同约束可见顺序。

交换 image 与翻转 epoch 并非同一条指令，所以 **旧 epoch 的读者也可能读取到新 image**；这是允许的，writer 多等它一次即可。协议所需的方向是翻转后进入的新 epoch 读者使用已发布的新影像，而不是要求每个旧 epoch 读者都必须返回旧值。它没有向应用暴露 epoch，也不把 epoch 当业务版本号。

单段读取的 `page_view` 先取得一次 image 指针，然后复制所需片段；在仅有 SET 换页、没有辅助原地写入的条件下，该次片段不会读到一半旧缓冲区、一半复用后的新缓冲区。辅助写入另用 `seq` ：写前置奇数、内存屏障、修改 image/snapshot、再发布偶数；读者比较复制前后的序号，发现变化则重试，最多 64 次后退回 snapshot。由于 snapshot 也可能被辅助写入修改，这个兜底不是任意并发写入下的无撕裂证明。 [片段视图与原地写入](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L706) 。

这套协议首先保护的是 **缓冲区的生命期**。一次长 memcpy 包含多条 load，连续两条指令可以跨越一次 SET；跨页读取也可能跨越不同页的更新。不能从“双缓冲”推导出“整次业务读取一定来自同一 generation”，更不能把 epoch 当作页表锁或描述符排序锁。

| 机制  | 主要解决的问题 | 不应推导出的保证 |
| --- | --- | --- |
| 控制 try-lock | REGISTER、SET、注销及有关转换的串行化 | 所有普通读取都被锁住 |
| image 指针交换 + epoch | 先发布完整缓冲区，等旧引用结束后再复用 | 多指令、多页共享一个 generation |
| `seq` 有限重试 | 尝试检测部分辅助原地写入 | 任意 native 写入都是线性一致事务 |
| PTE CAS | 不直接覆盖已变化的 leaf 值 | 等价于 Linux 原生 PTL 与全部 MM 生命周期锁 |

内存成本也需要按实现计算。主影像池默认 8 MiB，每个目标页占七页，容量上限为：

```
有效目标页数 = min(max_pages, floor(max_kb × 1024 / (7 × page_size)))
```

默认预算下，4 KiB 页对应最多 292 个目标页，16 KiB 页对应 73 个。fork 池每个页槽还占 image/snapshot 两页，初始化按目标页数的四倍准备槽位，并受 16 MiB 字节上限和 4096 槽上限约束；LL/SC 分支分析 arena 另有 24 MiB 上限，临时 GUP 副本也另行分配。因此 `max_kb` 不能作为整个模块的总内存上限。 [预算与初始化](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L6028) 、 [fork 池分配](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4391) 与 [分支分析容量](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1683) 。

**映射生命周期决定陷阱能持续多久。** 文件页可能被丢弃后重新缺页，进程可能改权限、迁移映射或 fork。只在 REGISTER 时改一次 PTE，覆盖状态很快就可能与真实映射分离。

| 事件  | 当前实现的处理 |
| --- | --- |
| `mprotect/pkey_mprotect` | native 调用成功后更新期望状态；仍可读时重新 arm，PROT_NONE 暂停 |
| `MADV_DONTNEED` 后 refault | 在 `handle_mm_fault` 前后保存/核对身份并重新 arm |
| `munmap/MAP_FIXED/mremap` | native 成功后更新地址或标记映射消失 |
| fork | 为子 mm 建立私有影像快照，主动填充并 arm 子 PTE |
| owner 退出或 exec | 退出后的死亡会话由后续认证控制调用尝试回收；owner 自身 exec 另有门控释放路径 |
| DEACTIVATE | 等待辅助重放结束，恢复权限，刷新 TLB，关闭并清空读者后释放 |

**权限变化先由 Linux 决定结果，模块再维护覆盖状态。** 对 `mprotect/pkey_mprotect` ，不能在 before-hook 一看到目标范围就销毁会话：原生调用可能失败；即便成功，也可能只是把 RX 改为其他可读保护。after-hook 在 native 成功后调用 `ap_protection_update` ，逐页更新 want 和 armed，并按需要重新清 AP、刷新 TLB。长度 1 的成功 mprotect 同样影响整页，模块按被覆盖的页基址处理。

如果应用改成 PROT_NONE，Linux 已安装自己的禁止访问状态，模块暂停该页，不能替应用“修复”为可读；以后重新增加读取权限，才尝试 rearm。如果 PTE 当前不存在，则保留逻辑上的 want，等待后续 fault-in。遇到无法承载陷阱的 leaf 形态或相应更新失败，当前实现可以将该页标成 dead、回到原生视图，这也是查询状态和错误计数有价值的原因。 [权限更新](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1383) 。

**refault 回调维护的是重新生成的 PTE。** `MADV_DONTNEED` 、回收或其他原生路径可以移除旧 leaf，下一次访问由 Linux 根据 VMA 保护重新建立它；新 PTE 不会自动记住模块之前清过 AP。

`uz_mm_fault_before` 在 native `handle_mm_fault` 尚持有相应保护时，先捕获 mm、地址、fault flags、file、pgoff 和 VMA 范围。after-hook 检查返回状态，排除 ERROR、RETRY、COMPLETED 等不应继续按原 VMA 处理的结果，再依据保存的身份重新设置陷阱。尤其不能在 after-hook 无条件解引用 before 的 VMA 指针：较新的原生 fault 路径可能释放相关锁，使指针失效。普通 owner 查找和子映射 rearm 因而有不同入口。 [缺页前后回调](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4087) 。

回调还区分带 `pt_regs` 的用户 uaccess fault 与 GUP fault：写入者取得真实页后必须能完成写入，不能在错误时机反复重置权限，使 GUP 重试陷入循环。源码中这部分与外部写入捕获、slow-GUP after 协作，并非每次 `handle_mm_fault` 返回都无条件清 AP。

**fork 要复制影像语义，不能只依赖复制页表。** Linux 对一些文件映射可以省略页表复制，因此仅等待子进程继承父 PTE 并不可靠。当前实现把 fork 分为门控、影像创建和子 PTE 准备三个阶段：

1.  `uz_clone_before` 对共享 mm 的 CLONE_VM 直接沿共享会话语义处理；对 owner 创建独立 mm 的 fork，先取得控制锁并检查 copy_mm hook 和快照容量。控制锁一直保持到 clone after，避免 SET 或注销在复制期间改变会话。
2.  native `copy_mm` 成功后， `uz_copy_mm_after` 发现父 mm 是 owner，按 `(child_mm, 原 descriptor index)` 建立 `uz_shadow` 。每槽有独立 image/snapshot，创建时复制父视图；为每个 child 保留的一份 mm 引用放在其第一个槽中。
3.  在子任务开始运行前，通过内部 access helper 读取子原生页到 child snapshot，使必要文件页实际驻留，再清子 leaf 的 AP，完成 TLB 同步。即使 Linux 没有复制父 PTE，也能显式建立子陷阱。失败会标记 degraded，不能把拥有 fork hook 等同于所有异常资源场景都完成。

`uz_shadow_get` 用 `used: 0 → 2 → 1` 表示空闲、构造中、已发布：先 CAS 占槽，填好两个缓冲区、mm 与 index，最后 release 发布 used=1；查找只接受 used=1。这个小状态机防止普通查找把构造到一半的影像当成完整结果。 [clone 门控](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L5075) 、 [子影像创建](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L852) 与 [fork 后处理](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3718) 。

正常创建后，字节继承关系可以表示为：

```
fork 时父 image = A ──复制──> child image = A 的独立副本
之后父 SET       → 父 image = B，child image 仍保留 A
之后子合法写入   → 子真实页经 COW 变化，并更新子影像；不写入父 image
```

子映射可能在 fork 后被拆分或移动，因而不能总按父 base 查找。 `uz_page_by_identity` 计算当前地址对应的文件页号，与注册时的 `(struct file 指针, 文件页号)` 比较： `pgoff + ((page - vma_start) >> page_shift)` 。例如原映射 pgoff=100、目标是其中第 2 页，身份页号就是 102；子 VMA 拆分后若从该目标页开始，其 pgoff=102，计算结果仍相同。再结合 `uz_child_known` ，避免把无关进程碰巧同地址或重新打开同一路径的映射纳入会话。它匹配的是对象与偏移，不是文件名。 [子映射身份查找](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L963) 。

继承仍有明确边界：存活的子快照阻止 owner 注销，子进程再次创建独立 mm 的 fork 被拒绝，快照槽也不会在本会话内无限循环复用。此外，当前子映射处理仍引用父页描述符中的部分状态；父进程修改保护或移除映射后，子快照的持续行为并没有完整保证。后文的审查限制会解释这一点。

**注销需要同时收拢硬件权限和软件引用。** 若先释放 image 或移除异常处理，再恢复 PTE，另一个 CPU 可能撞上仍然存在的权限陷阱。 `release_session` 的顺序可以逐步对照源码：

1.  检查存活 child；存在则返回 EBUSY，保留它们需要的处理状态。
2.  阻止新的辅助 replay，并等待现有 replay 收敛；不能完成时返回 EBUSY。
3.  发布 `g_suspend=1` ，使过渡读取使用 snapshot；翻转 epoch 并等待之前已进入的操作退出，尤其要等旧 rearm 路径结束。
4.  `ap_disarm_pages` 清 want，恢复需要恢复的 AP。恢复中的页先标 `armed=2` ，保留处理旧权限异常的能力；广播 TLBI 完成后再置 armed=0。
5.  关闭 reader 入口，等待两组引用都归零，再发布 OFF。
6.  释放分支分析区、child 引用与影像池、父页数组和 arena，清 owner，最后 `mmput` 释放模块持有的 owner 引用。

第三步不能替代第五步：前者阻止已经在途的旧操作继续改变陷阱，后者保证最终释放时没有读者使用任何会话存储。若 AP 恢复失败，函数标记 degraded 并返回，保留存储；不能为了让注销“看起来成功”直接释放仍可能被异常处理访问的对象。 [注销实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4235) 与 [AP 撤销阶段](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1335) 。

代码还保留退役页基址与 `uz_repair_trap` ，用于识别并恢复特定遗留 AP 陷阱，使符合条件的指令可以原生重试。修复要求匹配已知范围、陷阱形态及可读映射等条件，不能对任意 permission fault 一律重新打开读取权限。 [遗留陷阱修复](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L667) 。

owner 自身 exec 与共享其 mm 的 vfork child exec 也不同：前者要替换会话地址空间，门控用 tgid 识别并尝试释放；后者切换到自己的新 mm 后，父进程仍应保留覆盖。普通 owner 退出没有同等的同步注销保证， `reap_dead_session` 在后续认证控制请求中根据 mm 使用状态尝试回收。 [exec 门控](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L5441) 与 [死亡会话回收](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4268) 。

**写入和原子序列使透明模拟明显变难。** 普通 RX 数据读取可以在异常中计算一次 load 的效果；但 `LDXR/STXR` 等独占序列还依赖硬件 exclusive monitor。异常介入会干扰 reservation，单纯恢复几个寄存器无法重建其他 CPU 的竞争历史。

**普通 store 先保持 Linux 的写入语义，再同步读取影像。** REGISTER 要求目标当前 RX；但会话存活期间，应用仍可能成功 mprotect 成可写。对于这种合法写入， `uz_store_emulate` 解码实际 store，检查所触及各页的 VMA 都允许写，取得 GPR 或 FPSIMD 源字节，再经 `uz_write_live` 调用内核访问路径写真实页，使原生 COW、dirty 与映射语义有机会按内核规则完成。随后同步 image/snapshot、重新 arm，并提交基址回写、PC 和所需指令缓存维护。写入与发布还由 `g_write_busy` 串行化。 [store 吸收](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L2980) 与 [真实页写入](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L2764) 。

如果 VMA 根本不允许写，模块把异常交给原生路径，保留本来应有的 SIGSEGV，不因一次被拒绝的非法写就主动取消覆盖。若合法 store 无法解码，则再尝试 native replay；辅助机制也不可用时，部分路径会恢复 AP、把 owner 页标为 dead，让原生写入继续。需要区分这些分支，才能判断某次写之后影像还是否有效。

**内核写入者需要另一套同步。** ptrace POKE、proc mem 写入等经过 remote helper 的路径，可以在成功返回后把已写字节同步到影像；而通过 GUP 获得页对象后再写入的路径，不能把目标页替换成读取副本。 `uz_ext_capture` 在写前保存真实页到 ext_pre；下一次相关读取调用 `uz_ext_drain` ，取得 ext_buf，与 ext_pre 比较，只将发生变化的连续字节区间合并进 image/snapshot，最后清待合并标记。

这里采用差分有具体目的：直接把整张真实页覆盖到 image，会连尚未被写入的 fake window 一并抹掉。差分保留那些未变化的替代字节；但它识别的是前后字节差异，不能由相等值还原“该位置曾被写过”的历史，也不是任意内核写入者的通用事务日志。 `ext_busy` 只让一个 drain 使用专用缓冲区，并不证明所有外部写入都已被串行化。 [外部写入捕获与合并](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L745) 。

**native replay 让硬件完成无法可靠重建的 store。** `uz_replay_begin` 记录 task、mm、原 PC 和受影响页，占用页的 replay 状态，暂时恢复 AP 并执行本地 TLB 同步，保存写前 pre，设置 MDSCR_EL1.SS 和返回 PSTATE 的 SS。它保留原 PC，让原生指令重试，必要的 COW 继续由 Linux 处理。

单步完成后，debug hook 捕获事件； `uz_replay_publish` 取得 post，对比 pre/post，仅发布变化片段； `uz_replay_end` 再清 AP、同步 TLB、归还 replay 记录。跨页 store 重试可以继续记录下一页，但有页数和重试上限。 `__switch_to` after-hook 用于任务迁移后的单步配置维护，debug 与 switch 两个 hook 都可用才启用这项能力。 [重放开始](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3232) 、 [差分发布与收尾](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3168) 与 [debug/switch 回调](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3675) 。

虽然单步配置与 task 有关，PTE 权限却属于整个 mm；在 replay 临时恢复 AP 的窗口，另一线程可能原生读到真实字节。模块自己的 writer 锁也不能阻止一个绕过其处理路径的内核或硬件观察者。因此“硬件帮忙执行一次”没有自动带来所有并发观察都透明的结论。

**LL/SC 桥接处理的是跨指令的独占序列。** 问题不只发生在受管页本身是独占变量时；独占变量可以在普通页，一条对受管代码页的读取却插在 LDXR 与 STXR 之间，触发的异常就可能破坏原本的独占上下文：

```
ldxr w1, [x9]       // x9 可以指向未注册的普通数据
ldrb w2, [x0]      // x0 指向受管代码页，这里发生异常
add  w1, w1, #1
stxr w3, w1, [x9]
```

若只模拟 LDRB 并返回，后面的 STXR 可能得到不同于无异常执行的失败结果。 `uz_llsc_prepare` 因而尝试向前查找独占加载；若故障指令本身就是 LDXR/LDXP，则直接使用解码得到的独占信息。查找会在 CLREX、其他独占 store 或异常类指令等边界处放弃；随后使用 `prewin.h` 的状态分析逆推基址，检查对齐与控制流入口是否满足条件。

只检查地址相邻的前序指令还不够：其他地址的一条分支可以直接跳进 LDRB，跳过 LDXR。为减少这种误判，REGISTER 构建可执行映射的直接分支目标信息，后续 executable 映射变化和 refault 继续补充；信息不完整时拒绝相应桥接。这个分支图服务于有界路径判断，不是面向所有间接跳转和动态代码的完整控制流证明。 [分支图用途](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1665) 与 [独占前窗口准备](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L2531) 。

普通 load 成功后， `uz_llsc_walk` 尝试解释后续窗口。得到可提交计划时， `uz_llsc_commit` 应用记录的写入、提交计划中的寄存器及必要屏障，把 STXR 状态寄存器置 0，并把 PC 放到 STXR 之后；不满足条件则尝试辅助单步，或放弃该计划。这个路径会处理比普通 load 更多的状态，包括计划中的 PSTATE，所以不能把前面“普通 load 不写 PSTATE”的结论套到整个后端。 [窗口提交](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L2628) 与 [异常后的路径选择](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4059) 。

LSE 的 LDADD、SWP、CAS/CASP 等则由单条读改写解码和辅助处理完成；CAS 比较失败仍是合法结果，要返回旧值而不写新值。这些实现与 writer 锁能覆盖特定模块内交错，但无法据此重建所有 CPU 的 reservation 冲突或内核外部写入历史。

所以，“代码中实现了原子指令相关逻辑”与“已实现完整 ARM64 内存模型”是两回事。本文讨论的主要验证范围仍是保持 RX 的代码页读取。 [重放入口](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L3232) 与 [现有审查限制](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/AUDIT.md) 。

**跨内核适配依赖实际类型信息。** UROV-Z 读取运行内核 BTF，解析 task、mm、VMA、FPSIMD 等成员偏移，检查 `pt_regs` 的关键布局，并验证相关函数的参数及返回类型。版本号只负责初步准入。

这里使用 BTF 的目的，是为本地执行的 KPM 获取结构与 ABI 信息；模块并没有把上述权限修改逻辑编译成 eBPF 程序。 `resolve_kernel` 首先接受 `5.4 <= version < 7.0` 的候选内核并验证页表配置，然后选择 live BTF 或 detached BTF，调用 `uz_layout_from_btf` 提取布局，最后解析可用符号和函数形状。版本检查通过，只代表可以继续做这些检查。

`uz_layout_from_btf` 并非只找一个同名字段就结束：它检查成员范围、宽度与对齐，兼容 `vm_flags/__vm_flags` 、 `mmap_lock/mmap_sem` 等命名差异，解析 task 中的 FPSIMD 位置。对后端直接使用的 `pt_regs` 前缀，还要求 regs、sp、pc、pstate 的偏移分别是 0、248、256、264。这样才能安全地把异常 hook 中的指针按当前编译结构解释。 [布局验证](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/compat.h#L190) 。

函数适配同时看参数和返回值。 `uz_btf_signature` 用简短的 shape 字符串表示 32/64 位整数、普通指针以及 mm/task/VMA/pt_regs 指针等，再与 BTF 原型比较。例如 `handle_mm_fault` 可识别三、四或五参数形式；remote GUP 的适配要区分有没有旧的 vmas 输出参数。抓住同名符号却用错参数寄存器，可能把 flags 当成指针，后果远超返回一个兼容性错误。 [函数形状校验](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/compat.h#L249) 。

校验策略并非“每个符号都必须有完整 BTF FUNC 记录”：对部分已知公共接口， `uz_symbol_abi` 在缺少原型时允许已知 ABI；公开 fault 入口缺原型时采用保守参数包装。私有 GUP 等内部入口则要求对应完整原型，不能只按版本号猜。描述其兼容性时应保留这个区别，BTF 也不会自动证明符号的内部行为与所有锁语义都符合预期。

这种做法在 GUP 上尤为重要：不同内核中的 FOLL 标志、helper 签名和返回类型可能不同。fast-GUP 的 int 返回值必须按 32 位有符号数解释；否则 W0 中的负 errno 可能被误判为正的页数。模块在审查中修复过这一问题。 [BTF 适配层](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/compat.h) 、 [符号选择](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L5674) 和 [修复记录](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/AUDIT.md) 。

一个具体例子是 `-ENOMEM=-12` ：32 位返回值在 W0 中为 `0xfffffff4` ，从整个 X0 直接当 64 位有符号 long 解释，可能成为正数 4294967284。 `uz_gup_after` 先转换为 `(int32_t)(uint32_t)args->ret` ，才能得到 -12 并停止处理。 `try_grab_page` 则有 bool 与 int 两种已适配返回约定：前者 false 表示失败，后者非零表示失败，条件也要分别写。 [GUP ABI 选择与标志解析](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L5787) 。

没有内置 BTF 时，可以提供同一次内核构建对应的 detached BTF 包；模块检查 GNU Build ID 是否匹配。Build ID 提供身份匹配，不提供文件签名或运行正确性证明。

页大小则通过 TCR_EL1 等配置校验。当前目标是 Linux 5.4–6.x、AArch64、普通 4 KiB/16 KiB 页；不接受 64 KiB、LPA2 等不支持配置。这里的“目标范围”还需要与实机证据分开理解。

`uz_geometry_from_tcr` 检查的也不只是一个 PAGE_SHIFT 常量。TG0 描述用户侧 granule，TG1 描述内核侧 granule，两个字段的编码并不相同：

| 接受的 TG0 / TG1 编码 | 得到的 page_shift | 每级索引步长 `page_shift - 3` |
| --- | --- | --- |
| TG0=0、TG1=2 | 12，即 4 KiB | 9 位，页表项每项 8 字节 |
| TG0=2、TG1=1 | 14，即 16 KiB | 11 位 |

实现根据 T0SZ 得到 `user_va_bits=64-T0SZ` 和用户地址上限，同时核对 TTBR0/TTBR1 的遍历深度相容性，因为宿主页表 walker 使用内核翻译深度来遍历 PGD。它还拒绝 DS/LPA2、超过当前支持范围的物理地址配置及其他不兼容扩展； `resolve_geometry` 进一步检查 SCTLR/TCR2。若只是把 `g_page_size` 改成 16384，却不核对 walker、地址掩码、ABI 查询和所有页内计算，不能构成完整 16 KiB 适配。 [TCR 几何校验](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/compat.h#L44) 与 [运行配置检查](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L5592) 。

**与 mkpms 比较时，应聚焦其中的 wxshadow 模块。** mkpms 是一组 KPM 示例的集合；与本话题直接相关的是 `kpms/wxshadow` ，不能把仓库中的所有 syscall/inline-hook 示例混成一个机制。

wxshadow 的主要目标是：让应用读取原始代码，执行带断点或 patch 的 shadow 代码。UROV-Z 的主要目标则是：保留原始代码执行，让数据读取观察到注册影像。两者都把读和执行分开，但变化发生在不同一侧。

| 视图  | UROV-Z | wxshadow |
| --- | --- | --- |
| 执行  | 原始代码物理页 | 写入 BRK/patch 的 shadow 页 |
| 数据读取 | 软件提供的注册影像 | 原始物理页 |
| 核心异常 | 数据 permission fault | 数据异常与取指异常之间的切换 |
| 主要用途 | 读取观察结果的受控测试 | 断点、寄存器干预与执行 patch |

wxshadow 在创建 shadow 页后，把 BRK 或自定义字节写进副本，激活时把目标 VA 的 PTE 指向 shadow PFN，并设置为仅执行。读取这页会触发异常，处理器转入内核，模块再把同一 VA 切回可读、不可执行的原始页。下一次从这页取指又会触发异常，再切回 shadow。实际转换由 `wxshadow_page_enter_original` 与 `wxshadow_page_resume_shadow` 等函数完成。 [页切换实现](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_pgtable.c#L559) 。

数据读取异常

取指异常

BRK 命中

原指令单步完成

SHADOW_X：shadow PFN，仅执行

ORIGINAL：original PFN，可读不可执行

STEPPING：原页可读可执行

BRK 命中后，wxshadow 可以修改配置的寄存器，临时恢复原页执行原指令，再由单步异常恢复 shadow。PATCH 接口则直接写入 shadow 内容，并不意味着所有自定义 patch 都逐条经过 BRK。写过的 shadow 还需要数据缓存与指令缓存同步，才能让 CPU 取到新指令。 [BRK/单步处理](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_handlers.c#L805) 、 [patch 路径](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_bp.c#L1080) 与 [缓存处理](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_internal.h) 。

**同页自读是两条路线最有解释力的对照。** 假设 `PC` 指向页 P 内的一条 load，而该 load 的数据地址也位于 P：

```
// PC 位于 P，X0 也指向 P 内的数据
ldrb w1, [x0]
```

在 wxshadow 的页切换模型里，P 指向 shadow 时可以取指，却不能完成数据读取；切到 original 后可以读数据，却不能从 P 取指。若重试时需要重新取指，就可能在两种状态之间反复切换。仓库 README 明确把同页自读列为限制，并记录了相应测试卡住的现象。 [项目说明](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/README.md) 。

UROV-Z 对已支持的 load 采用另一种完成方式：保留 P 的执行映射，在内核中从 snapshot 解码指令、从 image 取得字节，直接提交 `W1` 和下一条 PC。它无需为了完成这次读取，把 P 改成“可读但不可执行”的另一物理页。这里的优势成立于模拟器支持的指令与上下文；遇到未覆盖指令仍然需要失败处理。

**两者的内核代读策略也不同。** wxshadow hook `follow_page_pte` ，在 native helper 执行前暂时换回原始 PTE，使它取得原始页，之后恢复先前映射。这是一条基于页表切换的 GUP 隐藏路径。 [GUP before/after](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_handlers.c#L210) 与 [临时映射恢复](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_pgtable.c#L913) 。

UROV-Z 则分别处理 remote-VM 缓冲区、readv pin 页和普通 fast-GUP 页，并对后两者使用独立影像副本。差异在于：wxshadow 使某条取页路径得到原始页；UROV-Z 使受支持的读取路径得到注册内容。

据此可以判断它们的覆盖条件，却不能仅凭源码宣称某个设备上所有路径都已通过。尤其不能从“hook 了 follow_page_pte”推导“所有 fast-GUP 访问都会经过它”。UROV-Z 自己在厂商内核上的 wrapper 漏挂经历，已经说明了验证真实调用路径的必要性。

**生命周期与锁的对比必须落实到当前代码。** wxshadow 当前初始化优先 hook `dup_mmap` ，其次 `uprobe_dup_mmap` ；两者都不可用时，代码明确关闭 fork 保护，没有启用过于宽泛的 `copy_process` 回退。这与其模块 README 中仍列出的 copy_process 描述有所不同。 [当前安装逻辑](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow.c#L1500) 。

它的 fork 策略是在复制期间暂时恢复父原页，之后恢复父 shadow，目的是让子进程避免继承模块分配的 shadow PFN。UROV-Z 则显式构造子影像快照，并让子进程继续拥有受管读取视图。因此，“支持 fork”在这两个项目中描述的是不同的继承语义。 [wxshadow fork 回调](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_handlers.c#L552) 。

| 维度  | UROV-Z 1.0.0 | wxshadow，本文固定提交 |
| --- | --- | --- |
| 定位方式 | owner mm 内的注册页与覆盖窗口 | 指定 PID/地址的断点或 patch |
| 同页自读 | 支持的 load 在异常中完成 | README 明确列为限制 |
| 数据指令模拟 | 需要，指令覆盖决定能力 | 主读取路径重试原生指令 |
| 更新内容 | 注册 image；SET 带 generation | shadow 中的断点/patch 记录 |
| fork 目的 | 子进程继续读取独立快照 | 防止子进程继承 shadow PFN |
| 结构适配 | BTF 布局与签名校验 | KernelPatch 偏移信息加运行时扫描 |
| 页大小 | 动态验证 4 KiB/16 KiB；16 KiB 无实机证据 | 虽检测页表参数，多处仍固定 PAGE_SHIFT=12，不能据此认定完整 16 KiB 支持 |
| 页表并发 | CAS/RCU 与部分 mmap 锁；native PTL 不完整 | 模块自己的 per-page 逻辑锁；不等于 native PTL |

最后一行尤其重要。wxshadow 的内部头文件明确说明 `pte_lock` 只串行化自身转换； `get_user_pte` 不取得原生 PTE 锁， `pte_unmap_unlock` 在这里是空操作。UROV-Z 的 CAS 也不能替代完整的 Linux 页表生命周期协议。两者都不能仅凭“原子操作”或函数名中的 `locked` 推导出与内核回收、迁移并发时的完整安全性。 [wxshadow 锁定义](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_internal.h) 、 [页表 walker](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow_pgtable.c#L249) ；页大小依据见 [wxshadow.h](https://github.com/kkkbbb/mkpms/blob/29c4187ab945a73e15d28b9e7e81aadf2a260458/kpms/wxshadow/wxshadow.h) 。

**硬件断点提供另一种内核入口：xiaojianbang-stealth-hook。** 这个项目包含 HWBP 和 PTE/UXN 等多个部分，不能用一个“无痕 hook”标签替代实现分类。

它的 `hwbp.c` 通过 Linux perf/hardware-breakpoint 接口注册线程断点。目标地址命中后，callback 读取和修改寄存器；不同模式可以修改参数、让 PC 指向 trampoline，或者把 `X0` 设为指定结果并将 PC 转到 LR。入口与返回观察还可以通过移动同一个断点的位置实现。 [HWBP handler](https://github.com/xiaojianbang8888/xiaojianbang-stealth-hook/blob/92b36f52fd691fb478627adcc22bcb5b7f8b263f/kpm/hwbp.c#L224) 。

这条路径不需要为了普通读取而翻转目标代码页权限，因而适合围绕少量函数入口或返回点进行干预。它同时受硬件断点资源、线程覆盖以及入口/返回状态管理约束。它没有天然赋予任意数据 load 一份替代页影像，和 UROV-Z 的控制粒度不同。

同一项目的 `pte_hook.c` 则设置 UXN，通过 Android 的 `android_rvh_do_mem_abort` tracepoint 收到取指异常，再按 offset_map 将 PC 转到重编译代码。需要特别按当前实现理解其持续性：callback 会恢复原始 PTE，源码提供 `sh_pte_rearm` 在后续重新置位 UXN。因此不能把这个具体版本概括为“原页始终保持 UXN，每次调用都会自动重定向”。 [UXN callback](https://github.com/xiaojianbang8888/xiaojianbang-stealth-hook/blob/92b36f52fd691fb478627adcc22bcb5b7f8b263f/kpm/pte_hook.c#L173) 与 [rearm 操作](https://github.com/xiaojianbang8888/xiaojianbang-stealth-hook/blob/92b36f52fd691fb478627adcc22bcb5b7f8b263f/kpm/pte_hook.c#L318) 。

这也提醒我们，采用 vendor hook、直接 hook 或 perf API，属于异常入口与宿主兼容性的选择。某份源码对特定 CFI 环境的经验，不能扩展成对所有 Android 内核的结论。

**stealth-core 把执行重定向发展为区域克隆路线。** 在其主要 clone 路径中，原代码页设置 UXN，普通数据读取继续面对原始内容；EL0 取指异常由 `before_pf` 接管。命中替换入口时直接改变 PC，否则根据 offset_map 跳到对应克隆指令。该路径会跳过原 fault handler，并保留原页的 UXN 状态。 [异常路由](https://github.com/1013503897/stealth-core/blob/80064779d48bf24ea207a3f67219f8a8a38c589b/kpm/shpte.c#L958) 。

克隆代码不能简单逐字节复制。A64 的 ADR/ADRP、分支和 literal load 等操作依赖原 PC；搬到新地址后，需要重编译或重定位。项目的 `lib/dbi.c` 先计算输出布局与偏移表，再生成新指令。区域可以跨多页，用来处理跨页函数和区域内分支。 [DBI 实现](https://github.com/1013503897/stealth-core/blob/80064779d48bf24ea207a3f67219f8a8a38c589b/lib/dbi.c) 。

这条路线把复杂性放在 **执行流保持** 上；UROV-Z 则把主要复杂性放在 **访存结果重建** 上。克隆让执行地址与原始数据地址分离，有机会避免 wxshadow 的同一 VA 反复切页问题，但仍要保证 PC 相关语义、控制流、动态代码更新与资源回收正确。不能因为具备 clone 就推定任意自修改代码、原子序列或 PAC 形式都完全兼容。

stealth-core 还提供 SSOL，即 single-step-out-of-line：部分指令直接模拟，其他指令借助异地执行槽与单步完成。它是另一套后端，覆盖、成本和限制需要独立评估，不能把 region clone 的性质直接套给 SSOL。 [SSOL 实现入口](https://github.com/1013503897/stealth-core/blob/80064779d48bf24ea207a3f67219f8a8a38c589b/kpm/shpte.c#L551) 。

存储方式也要区分配置。项目提供无常规 VMA 的 ghost clone，但本文读取的 `lib/kpmhook.c` 中 `g_ghost` 默认是 0，由调用者选择启用。因此“支持 ghost 内存”不等于所有 API 调用默认都不创建匿名 RX clone。 [用户态配置](https://github.com/1013503897/stealth-core/blob/80064779d48bf24ea207a3f67219f8a8a38c589b/lib/kpmhook.c#L85) 。是否可被某种观察方式发现，仍须针对实际后端和配置验证。

**Android-hwbp-kernel-hook 展示了普通 LKM 形式的 HWBP 实现。** 它使用 `/dev/ahwbp` ioctl 控制，内核侧调用 `register_user_hw_breakpoint` ，不依赖 KernelPatch。其来源说明明确指出 HWBP 设计参考了 xiaojianbang-stealth-hook；它保留较窄的硬件断点功能，而没有把 ghost、PTE 和 DBI 层一起移植。 [项目说明](https://github.com/ankitrawatgit/Android-hwbp-kernel-hook/blob/2799d69be5f341c6818dc7c91dfe6ec1cad66d7c/README.md) 与 [断点注册代码](https://github.com/ankitrawatgit/Android-hwbp-kernel-hook/blob/2799d69be5f341c6818dc7c91dfe6ec1cad66d7c/kernel/ahwbp.c#L315) 。

`ahwbp_overflow` 可以修改入口参数、跳过函数，也可以在返回断点处记录或覆盖 `X0` 。普通代码字节继续保持原样，因此数据读取自然仍是原始内容；这不是对数据读取结果的页级覆盖。 [callback 实现](https://github.com/ankitrawatgit/Android-hwbp-kernel-hook/blob/2799d69be5f341c6818dc7c91dfe6ec1cad66d7c/kernel/ahwbp.c#L107) 。

这个项目也明确写出了几项边界：现有线程与后续线程分别处理，watch 通过轮询发现新线程；将入口断点移到 LR 等待返回期间，同线程递归调用可能无法被观察；主要处理整数/指针寄存器，不解码浮点/SIMD 参数和返回值。控制器的六地址限制是项目当前约束，不应写成所有 ARM64 CPU 统一具有六个可用槽位。 [限制说明](https://github.com/ankitrawatgit/Android-hwbp-kernel-hook/blob/2799d69be5f341c6818dc7c91dfe6ec1cad66d7c/README.md#limits-and-design-notes) 。

**把几种机制放在一张表里，可以看出它们处理的是不同问题。** 下表概括指定实现路径，不能当作五个项目已经同机跑过的功能排名；对应源码依据见前面的逐项分析。

| 方案/路径 | 主要拦截事件 | 常规数据读取视图 | 执行路径 | 主要复杂性 |
| --- | --- | --- | --- | --- |
| UROV-Z PAGE_AP | EL0 数据权限异常 | 支持范围内的注册影像 | 原代码 | load 语义、内核代读、影像生命周期 |
| wxshadow | 读/执行异常，BRK/step | 原始页 | shadow 中的代码 | PFN 切换、同页自读、页级并发 |
| xiaojianbang HWBP | 指定线程地址的硬件断点 | 原始代码内容 | 修改寄存器、跳转或原执行 | 槽位、线程与返回状态 |
| stealth-core region clone | UXN 引发的取指异常 | 原始代码内容 | 替换函数或 DBI clone | 指令重定位、偏移表、区域生命周期 |
| Android HWBP LKM | perf 管理的执行断点 | 原始代码内容 | 原执行或入口/返回干预 | 内核构建兼容、线程覆盖、硬件资源 |

同为内核模块，并不意味着它们都能替代 UROV-Z 的读取覆盖测试；同样，UROV-Z 也没有提供这些执行 hook 框架所有的函数替换能力。选型首先要明确需要改变的是 **读取到的字节、函数入口行为，还是执行路径**，然后再比较所需的平台和运行条件。

**现有验证支持的是受控场景的结论。** UROV-Z 的发布与审查文档给出了两台设备的运行证据，应与静态检查分开阅读：

| 环境  | 已有证据 | 可得出的结论 |
| --- | --- | --- |
| 小米 13 / fuxi，Android 13，Linux 5.15.74，4 KiB | live、detached BTF 各 73 项 App 检查通过；核心自检 4152 项 | 记录中的 RX 代码页读取场景通过 |
| Pixel 6 / oriole，Android 16，Linux 6.1.134，4 KiB | 当前发布版本的两种 BTF 路径各 73 项通过；核心自检 4152 项 | 当前 1.0.0 有该设备的运行证据 |
| GKI 6.12、6.18，4 KiB | 保存的 BTF 与结构兼容性检查 | 结构检查通过，不能代替实机运行 |
| GKI 6.18，16 KiB | 保存的 BTF 检查与面向 16 KiB 的构建安排 | 尚无对应 16 KiB 实机验证 |
| Linux 5.4 | 适配代码与合成签名检查 | 尚不能声称该内核已完成设备认证 |

来源分别为 [AUDIT.md](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/AUDIT.md) 、 [1.0.0 发布记录](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/RELEASE-1.0.0.md) 和 [设计说明](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/DESIGN.md) 。审查文档中保留了早期 Pixel 6 的旧基线描述；当前发布数据应以更晚的 release 记录为准。

73 项端到端检查覆盖原指令执行、目标页内部读取、跨页 LDP、SIMD、libc/CRC、proc mem/readv/vmsplice、generation 冲突、并发 SET、权限切换、refault、fork 快照和注销恢复。核心 4152 项则来自独立模型自检，主要检查解码/模拟结果与拒绝条件；它不等于“4152 种设备组合”或“所有 ARM64 指令均已测试”。 [核心自检实现](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/core_selftest.c) 。

Pixel 6 发布记录中，两轮并发测试分别完成 48 次 SET_PAGE，累计采样 833,189 和 863,852 次读取，未记录撕裂/失败样本。这是特定用例的正确性观测，不是吞吐率数据，也不是覆盖任意写入和映射竞争的证明。相比单看 PASS，总是更值得检查测试是否同时验证了“原始执行保留、读取影像生效、注销后恢复”。

**性能应按触发事件分析，当前没有可靠的跨框架倍数结论。** 根据上述实现，可以做如下定性推导：

| 路线  | 主要额外成本随什么增加 |
| --- | --- |
| UROV-Z | 对受管页的数据读取异常数量、指令模拟、页片段拼接和 GUP 副本数量 |
| wxshadow | 读/执行视图切换频率、TLBI，以及 BRK 和单步命中次数 |
| UXN + region clone | 从原地址进入受管区域的异常次数、重编译序列开销和区域管理 |
| HWBP | 已配置断点命中次数，以及线程和入口/返回状态维护 |

UROV-Z 的普通取指继续使用原映射，但这不等于整体运行“零开销”：全局 hook 的分派、注册/注销的 TLB 操作、数据异常和同步机制都会产生工作。反过来，wxshadow 在一次切换之后连续读取原页，和 UROV-Z 对多条 load 分别模拟，也有不同的成本曲线。

公平测量需要固定设备、内核、页大小、编译选项和访问序列，并区分同页/异页、标量/SIMD、纯读取/混合执行、是否启用日志。应该同时观察异常次数、CPU 时间、延迟分布与分配开销。本文没有这些同条件数据，因此不对几个框架给出“快几倍”的排名。

**当前 UROV-Z 的主要工程边界已经具体到可定位的代码。** 这些问题不是因为功能测试通过就自动消失：

1.  **原生页表和 VMA 锁适配不完整。** `page_update_bits_locked` 使用 walker 和 CAS，外围采用 RCU/关中断或部分 mmap 锁。CAS 可以避免直接覆盖某个已变化的值，却无法独自保证页表仍然挂接、VMA 仍然有效，或与回收、迁移路径完全串行化。Linux 的 [split page table lock 文档](https://docs.kernel.org/mm/split_page_table_lock.html) 描述了原生锁的职责；UROV-Z 仍缺少覆盖所有相关路径的已验证适配。
    
2.  **mremap 更新描述符时存在读者一致性问题。** `uz_mremap_update` 修改地址后调用 `uz_page_sort` ，逐字段移动含 image/snapshot 指针的描述符。普通异常读者不取得控制锁，epoch 只保护存储释放，不会把这个排序过程变成不可见事务。并发时可能观察到不一致的地址与影像组合。 [描述符更新](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L5291) 。
    
3.  **子快照与父映射状态没有完全分离。** 子 mm 虽然有自己的字节影像，异常查询仍会返回父会话页描述符，并依赖其中的 armed、want、dead/gone 等状态。父 SET 后子内容保持不变已有测试，父进程任意修改权限或解除映射后子快照仍然有效则没有完整保证。 [页身份查找](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L1006) 与 [异常路径](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/module/backend.c#L4022) 。
    
4.  **辅助写入与独占序列不具备完整透明性证明。** 部分写路径原地更新 image/snapshot，有限次 sequence 重试后的回退仍可能遇到并发写入；native replay 临时恢复权限也可能暴露原始值。LL/SC 的硬件历史无法仅靠前后指令扫描完整重建。它们应与保持 RX 的普通读取测试分开评估。
    
5.  **观察范围受到地址与访问路径限制。** 新别名、文件直接读取、DMA/长期 pin、未挂接的内核接口，以及 AArch32、未支持的 tagged/MTE 指针和 SVE/SME 负载，都不能从 all-callers 推导为受覆盖。异常时序与内核页表状态也仍然可观察。
    
6.  **卸载正确性依赖 KPM 宿主。** `sleepable-v2` 元数据不会自动升级旧 loader。旧宿主可能在不合适的上下文调用 exit，或不能可靠地尊重 exit 的失败结果。应先让 owner 完成 DEACTIVATE，确认全局 `ctl0 status` 为 `inactive pages=0 armed=0` ，再卸载；调用者局部 QUERY/STATUS 不能代替全局状态判断。
    

这些是 [仓库审查明确记录的未解决问题](https://github.com/AndroidReverser-Test/urov-lab/blob/0647f4091d1628b7265b504702989aa99345b843/AUDIT.md) ，并且在本文对应提交中仍可找到相关实现。相同标准也应适用于其他比较对象：模块自己的锁不自动等同于原生 PTL，具备 fork 回调不自动等同于完整继承，README 使用“无痕”一词也不构成不可检测证明。

**按需求选择机制，比按“内核级”标签选择更有效。** 如果实验问题是“让这段 RX 代码继续原样执行，同时让不同读取者看到指定字节”，UROV-Z 的 PAGE_AP 路线与问题直接对应，阅读重点应放在异常模拟、代读覆盖和状态恢复上。如果目标是隐藏的 BRK/执行 patch，可以研究 wxshadow 的 shadow 状态机，同时接受其同页自读限制。少量函数参数和返回值干预适合观察 HWBP 方案；需要较大范围的执行替换时，UXN 与 DBI 区域克隆提供了另一组设计取舍。

对于 UROV-Z 后续工程化，优先级较高的工作是补齐原生 PTL/VMA 适配、用可安全发布的描述符结构处理映射变化、让子 mm 的状态独立于父描述符，并用真实设备验证更广的内核和页大小组合。这些工作决定读取覆盖能否在复杂 Linux MM 生命周期中保持一致，而不仅是一次 load 能否返回预期测试值。
