---
title: 【先知】glibc 2.35 下无堆泄露的 tcache 劫持与 House of Apple 2
source: https://xz.aliyun.com/news/92964
source_host: xz.aliyun.com
clip_date: 2026-10-16T14:31:23+08:00
trace_id: 5d73a6e2-4cde-44d9-9b31-3bef571f16b3
content_hash: 19e01c1908b0634d6487777ebcbf2c869ca3e149d534fdf606843bff7c0b4200
status: synced
tags:
  - 先知
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 先知安全技术社区
ai_summary: glibc 2.35 无堆泄露：相邻同页 chunk 两次 free 后一次异或即可还原精确堆地址，毒化 tcache 改写 `_IO_2_1_stderr_`，经 House of Apple 2 从 `exit()` 拿 shell。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3fb75244-d011-812e-96d3-ddb866885269
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> glibc 2.35 无堆泄露：相邻同页 chunk 两次 free 后一次异或即可还原精确堆地址，毒化 tcache 改写 `_IO_2_1_stderr_`，经 House of Apple 2 从 `exit()` 拿 shell。
> 
> - **漏洞点：** `Delete` 只 `free` 不置空，留下悬垂指针；`show`/`edit` 仍可读写，构成 UAF（`edit` 尾补 `\0` 需布局避让）。
> - **libc 泄露：** free 一个 >0x410 的 chunk 进 unsorted bin，`fd`/`bk` 指向 `main_arena+0x60`，减去偏移即得基址。
> - **堆地址恢复：** tcache fd 为 `(pos>>12)^ptr`；先 free 的 chunk3 得 `fd3 = 自身>>12`（裸密钥），再 free 同页 chunk4 得 `fd4 = (>>12)^chunk3`，两者异或即 `chunk3` 精确地址；布局需同页且先 3 后 4。
> - **劫持目标：** 选 `_IO_2_1_stderr_` 而非 stdout——它在 `_IO_list_all` 链头且菜单流程不触碰，覆盖后程序能活到 `Exit → exit()`；stdout 会被 `memset` 后的 `printf` 提前破坏。
> - **House of Apple 2 要点：** vtable 须为合法 `_IO_wfile_jumps`（过校验）；实际调用落在不受校验的 `_wide_data->_wide_vtable+0x68`。条件：`_mode=0`、`write_ptr>write_base`、flags 去掉 `0x2/0x8/0x800` 三闸；用 `" sh"` 作 flags 兼命令串，`_lock` 指向可写零页。

一道很典型的"高版本 glibc 堆题"：UAF + Full RELRO + 2.35。官方预期解是 large bin attack 改写 `_IO_list_all` 后打 House of Apple，需要先泄出堆地址。我们队在场上走了一条更省事的路： **利用 tcache safe-linking 的编码结构，两次 free 后一次异或就恢复出精确堆地址，再把 tcache next 直接毒进** `_IO_2_1_stderr_` **，用 House of Apple 2 从** `exit()` **拿 shell**——全程不需要 large bin，也不需要任何独立的堆泄露原语。

本文按当时的推理顺序展开：漏洞定位 → libc 泄露 → 堆地址恢复（本文重点一）→ 目标选择 → House of Apple 2 逐字段构造（本文重点二）→ 完整利用与触发链验证，最后对比官方解法并总结。文中所有内存现场截图均来自本地复现（glibc 2.35-0ubuntu3.8 + gdb attach），exp 附完整源码。

## 1、题面与防护

菜单堆题，五个功能：Add / Delete / Show / Edit / Exit。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9eeb268417efd064.png)

`Add` 请求 size（合法范围 1~0x500）， `malloc(size)` 后 `memset` 清零、读入内容； `Delete` 直接 `free(content)` ； `Show` 用 `write(1, content, size)` 原样输出； `Edit` 原地 `read(0, content, size)` 并在尾部补 `\0` ； `Exit` 打印 `Bye!` 后走 `main` 返回 → `exit()` 。

防护与 libc 版本：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4f39de196ecebf16.png)

Full RELRO + Canary + NX + PIE，带 debug_info 未 strip——GOT 改写路线直接排除，出口只能在 libc 侧；Exit 菜单项是出题人留的"IO 退出路径"暗示。

## 2、漏洞定位：悬垂指针

三个关键函数的反汇编节选：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9e28943348804974.png)

`delete_note` 在 `free(notes[idx].content)` 之后 **没有把指针置空**， `notes[]` 里留下悬垂指针；而 `show_note` 直接 `write(1, content, size)` 、 `edit_note` 直接对原地址 `read` 。也就是说 **free 之后指针仍然可读可写**——标准的 UAF：

-   `show` 可以读 free 后 chunk 的 `fd` / `bk` （libc 指针、堆指针）→ 泄露；
-   `edit` 可以改 free 后 chunk 的 `fd` → tcache poisoning。

唯一要注意的坑： `edit` 会在 `content[size]` 补一个 `\0` （off-by-one 零字节），布置堆时要保证这个字节落在无害位置。

## 3、泄露 libc：unsorted bin

> free 掉一个大于 tcache 上限（0x410）的 chunk，它进 unsorted bin， `fd` / `bk` 指向 `main_arena+0x60` 。

申请 `0x500` 的 idx0 并 free， `show(0)` ：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/55867e3bf2c250df.png)

gdb 现场里 chunk0 的 `fd` / `bk` 相等且指向 `libc+0x21ace0` ，即 `main_arena(0x21ac80)+0x60` 。泄露值减去偏移得到 libc 基址，校验页对齐即可（如果非对齐说明拿到的是 `+0x70` ，通常是读偏了 8 字节）。

## 4、泄露堆：safe-linking 的"自异或"结构（重点一）

glibc 2.32 起 tcache/fastbin 的 fd 不再存明文指针，而是：

```c
#define PROTECT_PTR(pos, ptr)  ((size_t)(pos) >> 12) ^ ((size_t)(ptr))
```

常见做法是先泄出某个堆指针再解密 fd。但这题其实 **根本不需要**：safe-linking 的密钥就是"fd 字段所在地址右移 12 位"，而 **相邻两个 chunk 的地址高 56 位相同（同一 4K 页），右移 12 位后密钥相同**。于是连续 free 两个相邻的 0xf0 chunk：

-   `free(chunk3)` ：链表原来为空， `fd3 = PROTECT_PTR(&chunk3->next, NULL) = chunk3 >> 12` —— **密钥本身直接暴露**；
-   `free(chunk4)` ： `fd4 = PROTECT_PTR(&chunk4->next, chunk3) = (chunk4 >> 12) ^ chunk3` ；
-   两 chunk 同页 ⟹ `chunk3 >> 12 == chunk4 >> 12` ，于是：

```latex
fd3 ^ fd4 = (chunk3 >> 12) ^ (chunk4 >> 12) ^ chunk3 = chunk3
```

一次异或恢复出 chunk3 的 **精确地址**，无任何独立堆泄露原语。实测：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59e3ec1f867c3624.png)

内存里 `chunk3->fd = 0x555593052` （就是 `chunk3>>12` ）， `chunk4->fd = 0x5550c65c19a2` （ `(chunk4>>12)^chunk3` ），异或结果 `0x5555930529f0` 与 gdb 里 chunk3 的真实地址完全一致。

两个工程细节：一是布局上保证两个 0xf0 chunk 落在同一页（我们放在堆偏移 0x9f0/0xae0 处，天然同页）；二是 free 顺序必须先 3 后 4，让 chunk3 的"裸密钥"先落袋。

## 5、劫持目标：为什么是 \_IO_2_1_stderr\_

有了任意堆地址 + `edit` 改 fd，tcache poisoning 就位：把 idx4 的 fd 改成 `PROTECT_PTR(&chunk4->next, &_IO_2_1_stderr_)` ，两次 `malloc(0xE0)` 后第二次返回 `_IO_2_1_stderr_` 本体， `Add` 的读入内容直接覆盖整个 `_IO_FILE` 结构。

**为什么打 stderr 而不是 stdout？** 覆盖成功后程序还要继续跑菜单（ `printf` 菜单、 `printf("Content: ")` ）。 `Add` 拿到目标后会先 `memset(content, 0, size)` 再 `printf` ——如果目标是 `stdout` ，清零后第一次 `printf` 走 `_IO_file_overflow` 时结构已被破坏，随时可能死在半路。而 `stderr` 是无缓冲流、菜单流程根本不碰它，覆盖后程序照常运行，直到 `Exit` 触发 `exit()` → `_IO_cleanup` → `_IO_flush_all_lockp` 遍历 `_IO_list_all` 链（链头正是 `_IO_2_1_stderr_` ），我们的伪造结构才被消费。 **"打哪个 FILE"本质是在选"谁会在我们控制不了的时刻被 libc 自己调用"。**

另一个候选是官方解的 `_IO_list_all` （large bin attack 改链头指向堆上的 fake FILE），好处是 FILE 结构在堆上随便写，坏处是要多铺垫一次 large bin attack 并且需要堆地址泄露。我们已经能精确控制 `_IO_2_1_stderr_` 本体的 0xE0 字节，直接就地伪造更短。

## 6、House of Apple 2：逐字段推导（重点二）

目标很明确：让 `_IO_flush_all_lockp` 对我们的 fake FILE 调 `_IO_OVERFLOW(fp, EOF)` ，最终以 `fp` 为第一个参数调用 `system` 。但 2.35 的 `IO_validate_vtable` 会校验 vtable 落在 `__libc_IO_vtables` 段内—— **不能直接把 vtable 指向堆**。House of Apple 2（思路最初由 roderick01 在《House Of Apple 系列博客》中系统化，此处按本题约束重新推导）绕过点在于： **合法 vtable 用** `_IO_wfile_jumps` **，真正跳到 system 的那次间接调用发生在** `_wide_data->_wide_vtable` **上——这个指针不受校验**。

### 6.1 过 flush 的条件

`_IO_flush_all_lockp` （glibc 2.35）：

```c
if (((fp->_mode <= 0 && fp->_IO_write_ptr > fp->_IO_write_base)
     || (_IO_vtable_offset(fp) == 0 && fp->_mode > 0
         && fp->_wide_data->_IO_write_ptr > fp->_wide_data->_IO_write_base))
    && _IO_OVERFLOW(fp, EOF) == EOF)
```

走窄字符分支最省事： `_mode = 0` ， `_IO_write_ptr(0x28) = 1 > _IO_write_base(0x20) = 0` 。

### 6.2 overflow → wdoallocbuf → system

vtable 填 `_IO_wfile_jumps` 后， `_IO_OVERFLOW` 进入 `_IO_wfile_overflow` ，其开头两道闸：

```c
if (f->_flags & _IO_NO_WRITES)  return WEOF;      //不能带 0x8
if ((f->_flags & _IO_CURRENTLY_PUTTING) == 0
    || f->_wide_data->_IO_write_base == NULL) {
    if (f->_wide_data->_IO_write_base == NULL) {
        _IO_wdoallocbuf (f);                          // 闸2 通过后到这里
```

`_IO_wdoallocbuf` ：

```c
if (fp->_wide_data->_IO_buf_base) return;
if (!(fp->_flags & _IO_UNBUFFERED))                   //不能带 0x2
    if ((*(struct _IO_jump_t **) &fp->_wide_data->_wide_vtable->__doallocate)(fp, ...) != EOF)
```

最后一行就是对 `_wide_data->_wide_vtable + 0x68` （ `__doallocate` 槽位）的直接调用，参数一就是 `fp` 。 **全部控制点：** `_wide_data` **指向我们堆上的伪造结构，其** `_wide_vtable` **再指到堆上另一块，** `+0x68` **处放** `system` **。**

### 6.3 flags 为什么是 " sh"

命令字符串直接放进 flags 字段（fp 即 rdi）。 `"/bin/sh"` 的 `/` = 0x2f，二进制 `0010 1111` ——同时踩中 `_IO_UNBUFFERED(0x2)` 和 `_IO_NO_WRITES(0x8)` ，两道闸都过不去。换成 `" sh"` （0x20 0x73 0x68）：

-   flags = 0x00687320， `& 0x8 = 0` 、 `& 0x2 = 0` 、 `& 0x800 = 0` ，三道闸全过；
-   `system(" sh")` 中空格是 shell 的合法命令分隔符，效果等价 `system("sh")` 。

`_lock` 指向堆上全零区域即可（ `_IO_flockfile` 只做 CAS，可写就行）。最终落在 `_IO_2_1_stderr_` 上的布局：

|     |     |     |     |
| --- | --- | --- | --- |   
| 偏移  | 字段  | 值   | 作用  |
| 0x00 | `_flags` | `" sh\0"` | 闸1/闸2/命令字符串 |
| 0x20 | `_IO_write_base` | 0   | flush 条件 |
| 0x28 | `_IO_write_ptr` | 1   | flush 条件 |
| 0x88 | `_lock` | 堆上零页 | 锁可写 |
| 0xA0 | `_wide_data` | heap: fake_wd | 指向伪造宽结构 |
| 0xC0 | `_mode` | 0   | 走窄分支 |
| 0xD8 | `vtable` | `_IO_wfile_jumps` | 过 vtable 校验 |

伪造后的内存现场（gdb attach 实拍， `0x7f88d8e1b6a0` 即 `_IO_2_1_stderr_` ）：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c1529e531e5abd59.png)

`_flags` 处的 `0x687320` 就是 `" sh"` ， `+0xa0` 的 `_wide_data` 指向堆 `0x55556e93b7e0` ， `+0xd8` 的 vtable 是 `_IO_wfile_jumps` （libc+0x2170c0）。堆上 `fake_wd+0x18` 处放 `_IO_write_ptr=1` ， `fake_wd+0xe0` 是 `_wide_vtable` ， `fake_wd+0x168` （= wide_vtable+0x68）是 `system` 。

## 7、触发与验证

菜单选 5 → `puts("Bye")` → `main` 返回 → `exit()` 。在 `_IO_wfile_overflow` 和 `system` 下断点抓触发链：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/41e653b81c319360.png)

两次断点的回溯拼出完整链路：

```latex
exit
 └─ __run_exit_handlers → _IO_cleanup → _IO_flush_all_lockp
     └─ _IO_wfile_overflow(fake stderr)      [vtable = _IO_wfile_jumps]
         └─ _IO_wdoallocbuf
             └─ (wide_vtable + 0x68) == system
                 └─ x/s $rdi → _IO_2_1_stderr_: " sh"   ← 断点现场实拍
```

`x/s $rdi` 显示 rdi 精确落在 `_IO_2_1_stderr_` 的 `" sh"` 上，随后 shell 起来：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5d1acfd84a650e47.png)

本文链把"泄堆"和"打 FILE"都压缩到 tcache 机制本身

## 总结：

1.  **safe-linking 不是纯防御**：密钥（ `pos>>12` ）在链表首次 free 时会以"裸值"形式出现在 fd 里，相邻同页 chunk 连续两次 free 后一次异或即可恢复精确堆地址。凡是"UAF 可读 + 能连续 free 两个同页 chunk"的题，都可以用这一招省掉独立的堆泄露原语。
2.  **打哪个 FILE 是个工程决策**： `stdout` 会被菜单流程反复触碰（memset 清零后第一次 printf 就可能死）， `stderr` 在 `_IO_list_all` 链头且全流程无人使用，是"覆盖后还能活着走到 exit()"的稳妥目标。
3.  **House of Apple 2 的本质** 是"vtable 校验只覆盖 vtable 一个指针， `_wide_data->_wide_vtable` 是校验盲区"。三道闸（ `_IO_NO_WRITES` 、 `_IO_UNBUFFERED` 、 `_IO_CURRENTLY_PUTTING` ）全部可以用 flags 里的命令字符串本身（ `" sh"` ）绕过——数据即约束，这是 FILE 利用最优雅的地方。
