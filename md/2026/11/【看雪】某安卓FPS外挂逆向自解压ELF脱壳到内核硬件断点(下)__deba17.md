---
title: 【看雪】某安卓FPS外挂逆向:自解压ELF脱壳到内核硬件断点(下)
source: https://bbs.kanxue.com/thread-293478.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-09T22:01:33+08:00
trace_id: a29c5f89-a6d5-4456-adf9-1264eee36a9e
content_hash: ddfdaba7799b1143cd8bd931e19584e6953575d2db9079bf701bd2dfa45a2bc4
status: synced
tags:
  - 看雪
series: 【看雪】某安卓FPS外挂逆向:自解压ELF脱壳到内核硬件断点
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41375244-d011-81dc-9b7e-f3312024fbd6
ioc:
  cves: []
  cwes: []
  hashes:
    - 984f8aaf6adfda7ffef9dfed944e7184f3a7d59cf6c43c964e5cf073a2a8d01e
  domains: []
  tools: []
  techniques: []
---

> **本文分析的是某款Android FPS游戏的外挂,该外挂在/data/local/tmp/ 下独立运行,采用了自解压ELF壳,并配合内核驱动挂载硬件断点篡改寄存器,从而实现了FPS游戏常规的底层功能(如无后座 范围)  
> 由于涉及自解压脱壳、驱动通信和硬件断点等多个技术环节,文章分为二篇连载:  
> (上)自解压ELF分析于与脱壳  
> (下)硬件断点与寄存器修改分析(本篇)**

## 0.驱动结论

| 问题  | 结论  |
| --- | --- |
| 驱动怎么进设备 | `5.15.ko.sh` 是自解压 shell 脚本，base64内嵌 `.ko` 落地就 `insmod` |
| 解开的东西是什么 | ET_REL 内核模块， `name=paradise` 和 `license=GPL` |
| 模块开始 | `vzalloc(0x350320)` 拿一块16槽×0x35030 的全局上下文 |
| 隐藏  | 摘链表 + 清 kprobe 黑名单 + 查 kallsyms 绕过导出限制 + CFI 打桩 |
| 用户态怎么找它 | 借 `reboot` 系统调用把 fd 塞回用户态， `anon_inode:[eventpoll]` |
| 功能入口 | 单字符设备 ioctl，28 条命令，全走 **有符号** 比较 |
| 核心功能 | 硬件断点（BRP/WRP）改写寄存器，配套指令模拟器单步 |
| 本体干什么 | 对 `com.xxxx.xxxx.xxxx` 的 `libUE4.so` 下断点改寄存器 |

我的手机内核版本是5.15  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8d0f3d482fe814fb.webp)

## 1.驱动文件5.15.ko.sh

拿到手是一个 481916 字节的 `.sh` 文件 前六行是：

```bash
#!/bin/sh
set -e
TMP=$(mktemp)
trap "rm -f \"$TMP\"" EXIT INT TERM
base64 -d <<'__EMBEDDED_KO_B64__' > "$TMP"
```

`set -e` + `mktemp` + `trap` 清理一次性释放写法，不落固定路径，运行没有临时文件，第 7 行到第 6257行是纯 base64，第 6258 行是 heredoc 结束符，之后才是真正的逻辑：

```bash
set +e
ERROR_MSG=$(insmod "$TMP" 2>&1)
INSMOD_STATUS=$?
set -e
```

注意 `set +e` 和 `set -e` 这一对，脚本开头开了 `set -e` ，如果直接 `insmod` 失败，脚本会在赋值那行之前就退出，用户看不到错误，作者手动关掉再打开，就是为了把 `insmod` 的 stderr 抓进变量再 `exit 1` ，成功分支则打一行中文提示

**开始解包：**

| 项   | 值   |
| --- | --- |
| 脚本  | 481916 B |
| base64 | 475020 字符 / 6251行，首行76字符，末行20字符 |
| 解出  | 356264 B |
| SHA-256 | `984f8aaf6adfda7ffef9dfed944e7184f3a7d59cf6c43c964e5cf073a2a8d01e` |

**解包就三行：**

```python
lines = open('5.15.ko.sh', encoding='utf-8').read().splitlines()
s = next(i for i, l in enumerate(lines) if l.startswith('base64 -d <<'))
e = next(i for i, l in enumerate(lines) if i > s and l.strip() == '__EMBEDDED_KO_B64__')
open('drv.ko', 'wb').write(base64.b64decode(''.join(lines[s+1:e])))
```

这里唯一的坑是 **别用正则跨行抓**，因为heredoc的结束符和脚本里注释提到的字符串长得一样，正则非贪婪匹配会在错误的位置截断，base64长度不是4的倍数就直接抛异常了，所以按行定位 `startswith` 就行了

## 2\. ET_REL 的读法

解出来的是 `.ko` ，也就是 **ET_REL**——可重定位目标文件，不是可执行文件

1.  所有 `val` 都是 **节内偏移**，不是虚拟地址，反汇编时把 `.text` 的 `sh_offset` 当基址加回去即可
2.  所有跨节引用都在 `.rela.*` 里，不在指令里，直接反汇编会看到一堆 `bl #0x1c` 这种自指的鬼东西，那个是重定位占位，不是真调用
3.  节名表在 `.shstrtab` ，得先读 `e_shstrndx` 才能把节名解出来  
    这份文件 43 个节，关键几个：
    
    | 节   | 偏移 / 大小 | 说明  |
    | --- | --- | --- |
    | `.text` | `0x6000` / `0x257F0` | 主代码，152 KB |
    | `.init.text` | `0x2B7F4` / `0xA8` | `init_module` |
    | `.exit.text` | `0x2B89C` / `0x6C` | `cleanup_module` |
    | `.rodata` | `0x1B10` / `0x362C` | 字符串与常量表 |
    | `.symtab` | `0x42F00` / `0x8D18` | 1,505 条符号 |
    | `.shstrtab` | `0x4BC18` / `0x1C1` | 节名， **排在 symtab 之后** |
    | `.strtab` | `0x4BDD9` / `0x380A` | 符号名 |
    | `.BTF` | `0x4F5E3` / `0x6F05` | 28 KB 类型信息，等于白送的结构体定义 |
    

`.shstrtab` 被扔到文件尾部，甚至排在自己的索引目标后面，正常 `readelf` 会按 `e_shstrndx` 找，不影响，但手工解析时如果默认节名表在最前面，就会读出一堆乱码然后误判节名表被破坏，我第一遍就栽在这，后来确认 `e_shstrndx=40` 指向 `0x4BC18` ，43 个名字全部正常  
重定位项是 24 字节：

```python
struct Elf64_Rela { u64 r_offset; u64 r_info; s64 r_addend; };
// r_info >> 32   → 符号表下标
// r_info & 0xFFFFFFFF → 重定位类型
```

`.symtab` 里178个 `FUNC` 、75 个 `OBJECT` ， `init_module` 和 `cleanup_module` 都在—— **这个模块没strip**，作者显然不担心静态分析  
`.modinfo` 里还有一行值得单独抄出来：

```python
import_ns=VFS_internal_I_am_really_a_filesystem_and_am_NOT_a_driver
```

这是AOSP GKI 给要碰VFS内部符号，但自己并不是文件系统的模块预留的namespace，那个长名字就是AOSP原文  
有意思的是这份模块并没真正用上它， `path_mount` 和 `path_umount` 都不在98个未定义符号里，调用点走的是运行 `kallsyms_lookup_name` ，实际手段是查表

```python
vermagic=5.15.202-android13-5.15.202_r00-dirty SMP preempt mod_unload modversions aarch64
```

## 3\. init_module

`.init.text` 只有0xA8字节，18 条重定位

```
0x0014  adrp x0, #0            ; "paradise" 横幅
0x001C  bl   _printk
0x0020  bl   init_arch
0x0024  cbnz w0, #0x58         ; 失败直接跳错误分支
0x0028  mov  w0, #0x320
0x002C  movk w0, #0x35, lsl #16   ; 0x350320
0x0030  bl   vzalloc
```

`0x350320` 拆开看：

```python
16 槽 × 0x35030 + 0x20 头 = 0x350300 + 0x20 = 0x350320
```

后面 `prepare_break_point_handlers @0x1E418` 只有0x15C字节，却把16个槽全部展开了， `n=1/2/3/4` 那几条：

```dockerfile
add x10, x0, #0x35, lsl #12 ; add x11, x10, #0x50   ; 0x35050 = 0x35030*1 + 0x20
add x8,  x0, #0x6a, lsl #12 ; add x9,  x8,  #0x80   ; 0x6A080 = 0x35030*2 + 0x20
add x10, x0, #0x9f, lsl #12 ; add x10, x10, #0xb0   ; 0x9F0B0 = 0x35030*3 + 0x20
add x11, x0, #0xd4, lsl #12 ; add x12, x11, #0xe0   ; 0xD40E0 = 0x35030*4 + 0x20
```

一路数到第 16 个： `#0x31b, lsl #12` + `#0x2f0` = `0x31B2F0` ，正好 `0x35030*15 + 0x20` ，中间 0x109 / 0x13e / 0x173 / 0x1a8 / 0x1dd / 0x212 / 0x247 / 0x27c / 0x2b1 / 0x2e6 ， `add xN, x0, #imm, lsl #12` 编码的立即数只有 12 位，所以 `n*0x35030+0x20` 被编译器拆成高1 位 + 低位两条指令，也说明结构体步长是编译器算出来的

每个槽干的： `ldr x12,[slot+0x18]` 看地址字段有没有填，填了就把 `.text+0x257E0` 这个 CFI 桩写进 `[slot]` （ `0x1E444` 的 `ADD_ABS_LO12_NC addend=0x257E0` ），桩体是 `bti c` + `b 0x1EB50` ，即 `sample_hbp_handler_entry`  
所以 `+0` 是 handler `+0x18` 是断点地址，用户只填地址，handler 由驱动统一盖  
全文件 `0x350320` 只出现两次， `vzalloc` 和 `cleanup` 里的 `memset` 清零  
分配成功后：

```
0x003C  adrp x8, #0            ; 全局上下文指针
0x0040  csel w19, w9, wzr, eq  ; w9 = -ENOMEM
0x0070  bl   paradise_supercalls_init
0x0074  bl   cfi_bypass
0x0078  mov  w1, w0
0x007C  bl   _printk           ; "cfi_bypass result: %d"
0x0088  bl   hide_module
```

顺序值得注意： `cfi_bypass` 在 `hide_module` **之前**，先把 CFI桩打好，把后面要调的受保护函数通了，再抹掉自己在模块链表里的痕迹，顺序反了的话， `hide_module` 之后有些依赖模块元数据的解析会失败

`.exit.text` 0x6C 字节，顺序是：

```python
printk("bye!") → paradise_gyro_exit → paradise_hwbp_cleanup → paradise_hide_cleanup
→ unregister_kprobe → mutex_lock(global) → shushu_touch_destroy
→ mutex_unlock → inline_hook_remove_all
```

卸载路径是完整对称的，陀螺仪钩子先拆、断点清理、隐藏恢复、kprobe注销、触摸子系统销毁、内联钩子， `mutex_lock` 只包住 `shushu_touch_destroy` ，说明那一个才是并发敏感的，其余各自内部加锁

## 4\. 隐藏四件套

**(1) `hide_module @0x5954` ——摘链表+自环**

```python
0x5970  mov  x0, x19
0x5974  bl   __list_del_entry_valid
0x5978  tbz  w0, #0, #0x5988     ; 链表项非法 → 跳过摘链
0x597C  ldp  x9, x8, [x19]       ; prev, next
0x5980  str  x8, [x9, #8]        ; prev->next = next
0x5984  str  x9, [x8]            ; next->prev = prev
0x5988  add  x0, x19, #0x48
0x598C  str  x19, [x19]          ; list->next = list
0x5990  str  x19, [x19, #8]      ; list->prev = list
0x5994  bl   kobject_del
```

标准 `list_del` 摘完会把 `next` / `prev` 写成 `LIST_POISON1/2` （ `0xdead000000000100` 那一类）,这里不这么干， `0x598C` / `0x5990` 两条把 **两个指针都指回自己**  
差别在于遍历者如果没做删除标记检查，会陷在这个自环节点上反复转，而不是一踩 `0xdead...` 就访问违例、触发 panic、把线索暴露出来,`kobject_del` 再把 `/sys/module/paradise` 摘掉， `lsmod` 也就看不到了  
顺带说 `tbz` 那条链表项已经非法时跳过摘链，但 **自环照样执行**  
`kobject_del @0x5994` 之后没有 `kfree` ，模块结构体本身还在，只是从可见链表和sysfs上消失了

**(2) `disable_kprobe_blacklist @0x51FC` ——清黑名单**  
`register_kprobe` 会拒绝在黑名单符号上下探针，而黑名单本身是个普通内核符号（ `kprobe_blacklist` ），同样没导出\\

第一步，把地址"骗"出来：

```dockerfile
0x5230  add  x0, sp, #8
0x5238  stp  xzr, xzr, [sp, #0x78]     ; 清 0x88 字节的 kprobe 结构
0x524C  stp  xzr, xzr, [sp, #0x18]
0x5254  stp  x8, xzr, [sp, #0x38]      ; +0x30 = 符号名指针
0x5258  bl   register_kprobe
0x525C  tbnz w0, #0x1f, #0x52a8        ; 负数 → 失败
0x5260  ldr  x8, [sp, #0x30]           ; kp.addr  ← 目标地址到手
0x5264  add  x0, sp, #8
0x5268  str  x8, [x19]                 ; 存进全局
0x526C  bl   unregister_kprobe
```

注册成功的那一刻 `kp.addr` 就是目标符号的地址,拿到后立刻注销，不在目标上留探针—— **只要地址就行了**

第二步，遍历链表清零：

```python
0x52BC  ldr  x8, [x0]
0x52C0  cmp  x8, x0
0x52C4  b.ne #0x5308                   ; 空链表直接走
...
0x5310  ldr  x8, [x8]                  ; next
0x5314  cmp  x8, x0                    ; 回到头 → 结束
0x531C  cbz  x8, #0x5310
0x5324  ldr  x10, [x9, #0x10]!         ; 节点 +0x10
0x5328  cbz  x10, #0x5310              ; 空则跳过
0x532C  ldr  x10, [x8, #0x18]          ; 节点 +0x18
0x5330  cbz  x10, #0x5310              ; 空则跳过
0x5334  add  w1, w1, #1                ; 计数
0x5338  stp  xzr, xzr, [x9]            ; 两个指针一起清
```

两个前置 `cbz` 说明它先确认 `+0x10` / `+0x18` 都非空才动手，遇到结构不一样的节点会跳过而不是写坏内存，计数就是日志里的 `Disabled %d kprobe blacklist entries`  
清空的后果是任何后来者（包括检测模块自己）再想往这批符号上下探针， `register_kprobe` 都不会再拦

**(3) kallsyms 查表——绕过 `EXPORT_SYMBOL`**  
模块实际要调的 `aarch64_insn_patch_text` 、 `swap_info` 、 `breakpoint_handler` 、 `path_mount` 、 `path_umount` 等，有一半没导出，作者注册了一个探针去抓 `kallsyms_lookup_name` 的地址，之后所有符号解析都走这条私有通道：

```python
[paradise] kallsyms_lookup_name_ex found at %p
```

拿不到就只打一条失败日志然后带错误码返回

**(4) `cfi_bypass @0x59AC` ——给受保护函数打BTI桩**

Android 13的内核开了 `CONFIG_CFI_CLANG` ，间接调用前有 `bti c` 检查，跨模块 `blr` 打到没有BTI落点的地址会直接触发 `CFI failure` ，做法是遍历一张24字节步长的表，逐项处理：

```
0x59F8  mov  w22, #0x18              ; 表项 24 字节
0x5A04  ldr  x8, [x28]               ; 符号解析器
0x5A0C  mul  x9, x19, x22
0x5A10  ldr  x27, [x26, x9]          ; 表项 +0 = 名字
0x5A18  blr  x8                      ; 解析成地址
0x5A24  tst  x0, #3                  ; 未对齐 → 报错
0x5A34  ldar w8, [x24]               ; 读目标首字
0x5A38  ldr  w9, [x23]               ; 读期望值
0x5A3C  cmp  w8, w9
0x5A40  b.ne #0x5a7c                 ; 不一致 → 打桩分支
```

`tst x0, #3` 是在查 AArch64 指令的 4 字节对齐——CRC 比对是按字逐条走的：

```dockerfile
0x5A48  add  x9, x24, #4
0x5A4C  add  x10, x23, #4
0x5A50  sub  x11, x25, #1
0x5A5C  ldar w12, [x9]
0x5A64  ldr  w13, [x10, x8, lsl #2]
0x5A68  add  x8, x8, #1
```

对照的函数首字+后续若干字的指，。一致就认为已经打过桩，走 `already patched` 不一致才改写 日志：

```python
patched %s with a BTI-compatible stub
%s already patched
```

`already patched` 这一支存在，说明这个函数是幂等的，模块被重复加载或反复调 `init`

## 5\. fd 双通道

模块要给用户态一个句柄，但 `ioctl` 得有 fd，正常做法是 `misc_register` 建 `/dev/xxx` ，那样 `ls /dev` 一眼就看见，这里用了

**(1) `paradise_install_fd @0x476C` ——伪装成 anon inode**

```dockerfile
0x479C  mov  w0, #0x80000        ; O_CLOEXEC
0x47A0  bl   get_unused_fd_flags
0x47B8  add  x0, x0, #0          ; "  [eventpoll]"  ← 名字
0x47BC  add  x1, x1, #0          ; paradise_anon_fops
0x47C4  movk w3, #8, lsl #16     ; 0x80002 = O_RDWR|O_CLOEXEC
0x47C8  bl   anon_inode_getfile
0x4834  str  x21, [x20, #0xD8]   ; file->private_data
0x4838  bl   fd_install
```

名字取 `[eventpoll]` ， `anon_inode_getfile` 会拼成 `anon_inode:[eventpoll]` 和 epoll 的 fd 长得一模一样 `/proc/<pid>/fd` 里看过去就是一串 epoll，检测脚本按名字过滤会直接漏掉，中间还有三次 `kmem_cache_alloc_trace` 和一次 `__kmalloc(0x80)` ，给 `private_data` 和 `used_pages` 数组用，四条失败串分别是 `failed to get unused fd` 、 `failed to create anon inode file` 、 `failed to allocate private data` 、 `failed to create used_pages arraylist`

**(2) `reboot_handler_pre @0x49F4` ——借 `reboot` 回传**

挂一个 `reboot` 的前置钩子，用户态调 `reboot()` 时把 fd 塞回去

```python
0x4A10  ldr  x8, [x19, #0x798]        ; x19=current → 权限结构
0x4A24  ldr  x8, [x1]                 ; x1=pt_regs, [x1]=regs[0]
0x4A28  mov  w10, #0x9c4d
0x4A2C  movk w10, #0x7a3b, lsl #16    ; 0x7A3B9C4D
0x4A40  mov  w10, #0x1d6b
0x4A44  movk w10, #0x2f8e, lsl #16    ; 0x2F8E1D6B
0x4A50  ldr  x22, [x8, #0x18]         ; 结构 +0x18：fd 回传地址
0x4A68  bl   kmem_cache_alloc_trace   ; 0xB20
0x4AB8  blr  x21                      ; task_work_add
```

两个魔数分别放在结构的 `+0` 和 `+8` ，对不上就走正常 `reboot` ，对上就把 fd 写到 `+0x18` 那个地址，靠 `task_work_add` 在返回用户态前完成，不能直接写在钩子里，那会儿还在内核上下文和目标 mm 未必是当前的

符号缺失时有明确降级日志 `[paradise] task_work_add not found, fd installation via reboot syscall will not work` 说明这条路是可选的，主路径仍是 anon inode

## 6\. ioctl：28 条命令

`paradise_anon_ioctl @0x3EB4` 1820 字节，正好到 `0x45D0` 所以那里是 `paradise_anon_open` 的入口，紧邻排布  
入口先过权限，再立栈 canary：

```
0x3ED4  mrs  x8, sp_el0
0x3ED8  mrs  x9, sp_el0
0x3EDC  ldr  x8, [x8, #0x5e0]      ; current->stack_canary
0x3EE4  ldr  x8, [x9, #0x798]      ; current->real_cred
0x3EE8  ldr  w9, [x8, #4]          ; cred->uid
0x3EEC  ldr  w8, [x8, #0x14]       ; cred->euid
0x3EF0  orr  w9, w9, w8
0x3EF4  cbnz w9, #0x45c4           ; 非 0 → -EPERM
```

`mrs x9, sp_el0` 取的是 `current` ， `[current+0x5e0]` 是每任务栈 canary，这也解释了为什么后面每次返回前都要 `cmp` 一遍再 `autiasp` ， `[current+0x798]` 是 `real_cred` ， `struct cred` 开头是 `atomic_t usage` ，占 4 字节，所以 `+4` 正好是 `uid` 、 `+0x14` 是 `euid` 两个 32 位值一对， `orr` 完直接判零，这个偏移随内核配置浮动，上机前按目标 `vmlinux` 的 BTF 复核一次， `orr` 完 `cbnz` 跳 `0x45C4` 的 `mov x0, #-1` ，即 `-EPERM`

三个入口用的是同一段判据，处理方式却不一样：

| 入口  | 判据  | 非 root 时 |
| --- | --- | --- |
| `paradise_anon_ioctl @0x3EB4` | `0x3ED4` – `0x3EF4` | 返回 `-1` （ `-EPERM` ） |
| `paradise_install_fd @0x476C` | `0x4784` – `0x4798` | 返回 `-1` （ `0x48CC` ） |
| `reboot_handler_pre @0x49F4` | `0x4A10` – `0x4A20` | `w0=0` 放行到真 `reboot` |

前两个是权限拒绝，第三个只是不给你塞 fd， `reboot` 照常执行

**这里是整篇最容易踩的坑**：

```
0x3F04  mov  x0, #-0x19        ; -ENOTTY
0x3F08  mov  w9, #0x5739
0x3F10  movk w9, #0xc020, lsl #16   ; 0xC0205739
0x3F14  cmp  w1, w9
0x3F1C  b.gt #0x3f9c
```

`b.gt` 是 **有符号** 大于， `0xC0205739` 当int32看是负数，所以分派树的结构是负的一大半在左子树，正的一小半在右子树，如果按无符号去遍历这棵树， **每一条都会走错分支**，最后全部落到 `-ENOTTY` ，然后你会得出这个ioctl什么都不干的

正确做法是 `struct.unpack('<i', ...)` 取出有符号值再比较，按有符号重建后，28 条命令全部解出：

| ioctl | 落点  | 语义  |
| --- | --- | --- |
| `0xC0105738` | `0x3F80` | `get_main_thread_elf0` ，要求 pid ≥ 1 |
| `0xC008573C` | `0x4288` | `bind_thread_pacga_key` |
| `0xC0105715` | `0x42B8` | `do_config_gyro_hook` |
| `0xC120570A` | `0x42D0` | `memset` + `copy 0x120` |
| `0xC1985728` | `0x432C` | `do_hwbp_set` |
| `0xC198572A` | `0x3FF8` | `paradise_hwbp_fill_config` + `copy_to_user 0x198` |
| `0xC004572D` | `0x4348` | `copy_from_user 4` |
| `0xC008570D` | `0x43D8` | `find_get_pid → pid_task` ，读 `+0x640` 判 mm |
| `0xC008570E` | `0x4084` | `do_hide_process` |
| `0xC0285709` | `0x440C` | `do_read_physical_memory` |
| `0xC028570C` | `0x4418` | `do_write_physical_memory` |
| `0xC104570B` | `0x40DC` | `copy 0x104` + `find_process_by_name` + `copy_to_user 0x104` |
| `0xC0105739` | `0x4430` | `get_thread_tpidr_el0` |
| `0xC0185713` | `0x4464` | `do_list_processes` |
| `0xC018572B` | `0x4148` | `do_hwbp_get_records` |
| `0xC2045716` | `0x4470` | `do_hide_path` |
| `0xC360572C` | `0x447C` | `do_hwbp_set_record` |
| `0x4018571F` | `0x4190` | `copy 0x18` ；type 限 2..4，位图页数下限 0x200 |
| `0x8008571E` | `0x4494` | `mutex` + `shushu_touch_init` + `copy_to_user` |
| `0xC0045729` | `0x420C` | `do_hwbp_remove` |
| `0xC020573A` | `0x44EC` | `copy_from_user 0x20` |
| `0xC020573B` | `0x424C` | `copy 0x20` + `get_thread_pacia_key` |

另 6条直接内联 `ret` 到 `0x4530` ，属于 **保留字**，命令被认领了但什么也不做，多半是留给旧版客户端的兼容占位

`0x4018571F` 有个位图算法：

```
ldrh w8, [sp, #0x20]
and  w9, w8, #0x3ff
tst  w8, #0x3ff
csel w19, #0x200, w9, eq     ; 对齐 0x200 页，最小 8192 字节
```

对齐到 0x200 页、下界 8192 字节，对上字符串 `bitmap size too small: %zu (minimum 8192)` ，这是进程列表的位图接口

字符串表里藏着两条名字`.rodata+0x41` = `path_umount` 、`.rodata+0x3AB` = `path_mount` ，两者都 **不在** 98个未定义符号里，所以不是链接期导入，是 `kallsyms_lookup_name` 现查现用： `0x739C` 起把 4 个 `movk` 拼成一个 64 位 CFI 类型 ID，配 `__cfi_slowpath_diag` 后 `blr x21` 间接调用，失败 `mount over %s failed: %d`

## 7\. 硬件断点：四层

**(1) `do_hwbp_set @0x1DDF0` ——收参数**

```
memset(sp, 0, 0x198)
copy_from_user(sp, arg, 0x198)
ldr w8, [sp]        ; pid，要求 ≥ 1
ldr w9, [sp, #4]    ; count，1..0x10
find_get_pid → get_pid_task
ldr w8, [task, #0x5dc]   ; task->pid 复核
memset(config, 0, 0x350320)
str w8, [x20, #0x10]     ; 条数
```

顺带说 `0x1DF8C` 那段 `madd x10, x11, x10, x12` ： `x10` 初值 `0xF555...F555` 就是 `-0xAAAA...AAAB` 的补码，算完只跟 0 比了一次（ `0x1DFAC cmp x10,x9` ，此时 `x9=0` ），不进循环步进，像 FORTIFY给栈上定长数组留的边界检查，不是 stride计算

**(2) `hw_breakpoint_parse @0xC5B0` ——翻译成控制字**

```
mov  w8, #-0x16              ; 预置 -EINVAL
ldr  w9, [x0, #8]            ; type
; 1..4 → 0x08000000 / 0x10000000 / 0x18000000
ldr  w9, [x0, #0xc]          ; len
; 1..8 → 0x80000 / 0x180000 / 0x380000 / ...
str  w9, [x1, #0x10]
```

这套位域是 **驱动自定义的中间表示**，不是 ARM 原生的 `DBGBCR` ，长度落在 bit 19..26，中间还有两道 `0xC6A8` 发现没设type就把长度强制成4字节 `0xC6E8` 再按 `[x0+0x18]` 把长度左移若干位

真正编码成 `DBGBCR` 是在写寄存器之前：

```python
0xCB20  lsr  w11, w8, #0xe
0xCB2C  and  w11, w11, #0x1fe0     ; BAS = (len >> 14) & 0x1FE0  -> bit 5..12
0xCB24  lsr  w12, w8, #0x18
0xCB30  and  w12, w12, #0x18       ; type 两位 -> bit 3..4
0xCB28  ubfx w8,  w8, #0x1d, #2    ; 高两位 -> PMC bit 1..2
0xCB38  orr  w11, w11, w12
0xCB40  bfi  w11, w8, #1, #2
0xCB44  orr  w8,  w11, #0x2000     ; 只有在 EL1 且 type==1 时补 bit 13
```

三段搬运，长度 nibble 从 bit 14 起右移落到 `BAS` ，type 两位右移 24 位落到 bit 3..4，另外两位补进 `PMC` ，最后按 `CurrentEL` 决定要不要置 bit 13

**(3) `write_wb_reg @0xC720` ——写寄存器**

```
add  w8, w1, w0
cmp  w8, #0x3f
b.hi #err                    ; "[paradise] attempt to write to unknown breakpoint register %d"
msr  dbgbvr0_el1, x2
```

64 项跳表，四组各16： `dbgbvr0-15` / `dbgbcr0-15` / `dbgwvr0-15` / `dbgwcr0-15` ， `w0` 是组号、 `w1` 是槽号，加起来超过 0x3F 就越界，用跳表而不是 `switch` ，是为了让每条 `msr` 落在独立的基本块里， `msr` 的寄存器名是 **立即数编码**，没法用寄存器间接寻址，只能展开

**(4) `start_task_run_monitor @0x1E574` ——开监听**

```dockerfile
0x1E5B8  mov  w10, #0x5030
0x1E5BC  add  x8,  x19, #0x20     ; 槽基址 = config + 0x20
0x1E5C0  mov  w9,  #0x10          ; 16 槽
0x1E5C4  movk w10, #3, lsl #16    ; stride 0x35030
0x1E5D8  cbz  x8,  #0x1E5CC
0x1E5DC  ldr  x11, [x8, #0x18]    ; 断点地址非空?
0x1E5E0  cbz  x11, #0x1E5CC
0x1E5E4  ldr  x11, [x8]           ; handler 非空?
0x1E5E8  cbz  x11, #0x1E5CC
0x1E600  mrs  x8, id_aa64dfr0_el1
0x1E604  ubfx w8, w8, #12, #4
0x1E608  add  w8, w8, #1          ; BRPs
0x1E610  mrs  x8, id_aa64dfr0_el1
0x1E614  ubfx w8, w8, #20, #4
0x1E618  add  w8, w8, #1          ; WRPs
```

先扫描16个槽，只处理handler 和地址都非空的项，全空则 `-EINVAL` ，然后读两次 `ID_AA64DFR0_EL1` ，把 BRP和WRP的数量各 `+1` 存进全局

`0x1E620 cbz x9, #0x1E674` 是重入判断，全局monitor指针已有值时不重复挂，直接把 BRP和WRP数写回 `config[0]` / `config[8]` ，返回 0，失败路径统一 `-0x16` ，也就是 `-EINVAL`

## 8\. 命中与模拟

断点命中后走 `work_trampoline_breakpoint @0xD110` ：

```dockerfile
ldr  w9, [x8, #0x10]              ; 目标 pid
mrs  x8, sp_el0
ldr  w8, [x8, #0x5dc]             ; 当前 pid
cmp  w9, w8                       ; 不匹配就放行
mov  w27, #0x5030
movk w27, #3, lsl #16             ; 0x35030
ldr  x21, [x0, #0x10]
add  x26, x8, #0x20
```

记录侧 `sample_hbp_handler_entry @0x1EB50` ：

```
ldr  w9, [x1, #0x20]      ; 条数
; stride 0x350，上限 0x35<<12 = 0x35000
; PC 存在 +0x50
str  x15, [x14, #0x50]
; 再 0x47 次循环，在 +0x30 写 0x47 字节位图
```

每条记录 0x350 字节，其中 `+0x30` 起 0x47 字节是 **命中位图**，位图的写法有点绕， `0x1EBDC lsr w15, w10, #2` 每 4 个计数复用同一个字节， `and w15, w8, #6` 取 2 bit 当字节内偏移，每次 `add w8, w8, #2` ，真正盖的标记是 `lsl w15, w13, w15` （ `w13 = 1` ），所以 0x47 个计数点压缩进 0x47/4 ≈ 18 个字节的 2-bit 槽

`0x1EB78 cmp x8, #0x35, lsl #12` 是遍历上限 `0x35000` ， `0x1EBA4` 那条命中就跳到 `+0x30` 的位图块， `str x9, [x1, #0x20]` 把条数写回去，是记录已用槽数的游标

单步靠 `emulate_insn @0xDA24` + `arm64_decode_insn @0x20028` + `arm64_decode_simd @0x21E6C` ，这是整个模块最大的单个函数，也是最能说明这不是普通外挂的地方，真要改寄存器，不能只靠断点停一下，停完得把那条指令 **自己执行一遍**，再把 PC 推到下一条，否则目标会，。所以作者在内核里写了一个 ARM64 指令模拟器，含 SIMD 解码

模拟器不支持的指令会打 `[paradise] instruction %x cannot be hijacked!`地址没对齐打 `[paradise] %s has an unaligned address: %px`

## 9\. 物理内存读写

`do_read_physical_memory` / `do_write_physical_memory` 是 `0xC0285709` / `0xC028570C` 两条，两者共用一套自定义寻址，传进来的 `x0` 不是虚拟地址， **高6位是设备索引，低 58 位是 PFN**，落盘是 `swap_write_page_direct @0x6D48`

```python
add   x8, x3, x2
cmp   x8, #1, lsl #12      ; 单次 <= 一页
lsr   x9, x0, #0x3a        ; 高 6 位 -> 设备索引
cmp   w9, #0x1d            ; 最多 30 项
ldr   x26, [x8, x9, lsl #3]
ldr   x8, [x26, #0xa0]     ; 表项 +0xa0 = block_device
ubfiz x25, x0, #3, #0x3a   ; 低 58 位 = PFN, x8 -> 扇区号
str   x25, [x23, #0x20]    ; bio->bi_iter.bi_sector
bl    submit_bio_wait
```

设备表指针来自 `.bss` 里的 `g_swap_info` RELA 在 `0x6D78` 记的是 `type=275 addend=0x30` ，符号落在 `.bss+0x30` ， `0x6D7C` 的 `LO12` 同址，这就是 `kallsyms` 惰性解析出来的 `swap_info` 数组基址，为空直接返回失败， `ubfiz x25, x0, #3, #0x3a` 把 PFN 乘 8 换成 512 字节扇区号写进 bio 的 `+0x20` ，再 `bio_alloc_bioset` + `bio_add_page` + `submit_bio_wait` 落盘， **绕开 page cache、 `mm` 和文件系统，直接对块设备发 IO** `len == 0x1000` 时另有一条 `memcpy` 分支

首次进函数时用 `kallsyms_lookup_name_ex` 惰性解析三个符号： `__arch_copy_to_user` 、 `__arch_copy_from_user` 、 `swap_info`

真正干活的在上一层 `do_write_physical_memory @0x68E8` ， `copy_from_user` 拿 0x28 字节请求 `find_get_pid` → `get_pid_task` → `get_task_mm` ， `lockfree_va_to_pa` 换出 PA，按 `0x1000 - (pa & 0xfff)` 切页，逐页 `__kmalloc` 中转、 `__arch_copy_from_user` 拷入（经函数指针 + `__cfi_slowpath_diag` 调用）、 `swap_write_page_direct` 落盘

读路径 `do_read_physical_memory @0x5DDC` 骨架相同，只是落地方式不同： `kmap_atomic` + `memcpy` + `__kunmap_atomic` ，收尾 `__free_pages` / `kfree`

`lockfree_va_to_pa` 本身 **没有** 内联页表遍历， `0x6BC4` / `0x6C00` / `0x6C28` 那三次 `ubfx …, #0x1e/#0x15/#0xc, #9` （bit30 / bit21 / bit12 各取 9 位，39 位 VA、3 级页表的切法），以及末尾 `ror` + `and x26, x8, #0xfc03ffffffffffff` 抽输出地址，是同一函数里 **另一条分支** 展开的；正常路径在 `0x6B14` 直接调 `lockfree_va_to_pa`

## 10\. PAC 套装

Android 13 的 arm64 开了指针认证，要改寄存器得先处理签名

`bind_thread_pacga_key @0x8678` ：

```python
0x0086E4  ldr  x8, [x19, #0x11d0]      ; 源线程 lo
0x0086E8  mrs  x10, sp_el0             ; 当前线程
0x0086EC  cmp  x20, x10
0x0086F0  str  x8, [x20, #0x11d0]      ; 无条件写目标 thread_struct
0x0086F4  ldr  x9, [x19, #0x11d8]      ; 源线程 hi
0x0086F8  str  x9, [x20, #0x11d8]
0x0086FC  b.ne #0x8710                 ; 目标不是自己 → 跳过 MSR
0x008700  msr  apgakeylo_el1, x8
0x008704  ldr  x8, [x20, #0x11d8]
0x008708  msr  apgakeyhi_el1, x8
0x00870C  isb
```

`x19` 是源线程的 `task_struct` ， `x20` 是目标， `0x11d0` / `0x11d8` 是 `thread_struct` 里的一对槽，从读写位置看是两半 PAC 密钥

这里有一层设计上的必然 `APGAKeyLo/Hi_EL1` 是 **当前 CPU 的寄存器**，不是 per-thread 状态，所以只有目标线程恰好就是调用者自己时，写 MSR 才有意义，否则写了也是给别的线程做嫁衣，代码里 `b.ne` 那一跳正是处理这个，跨线程只拷 `thread_struct` 里的存档，等目标线程被调度回来、上下文切换时自动装填

这条ioctl本质是把 A 线程的 PAC 密钥复制给 B 线程，让B线程用 A 的密钥签名，注入代码在 B 里构造返回地址时，只要套 A 的签名就能过 `autiasp` ，配套三个读接口 `get_thread_pacga_key @0x83D8` （ `0xC020573B` ）、 `get_thread_pacia_key @0x8528` 、 `get_thread_tpidr_el0 @0x8310` （ `0xC0105739` ），所以合起来是读密钥 → 改寄存器 → 重签名

## 11\. 本体out.elf

总结； **而本体就是利用驱动接口实现的,获取目标包名的PID随后获取基地址,再用基地址加偏移得到断点地址命中后更改寄存器即可,所以这里分析只做简单的分析,具体都是驱动来工作,而它就负责调用**

### 11.1 四步

```python
0x5B14  x1 = "com.tencent.tmgp.codev"   ; 0x38ED0
0x5B1C  bl   find_process               ; _IOW('T',0)  -> w0 = pid
0x5BC4  str  w0, [sp, #0x298]           ; driver+0xF8 = pid

0x5BD0  x1 = "libUE4.so"                ; 0x38F08
0x5BD8  bl   module_base                ; _IOW('T',1)  -> x0 = base
0x5BDC  str  x0, [sp, #0x350]

0x5C78  make_plan(Options, kOffsets, base, Plan)
```

`kOffsets @0x38508` 四个 u64，全部是 `libUE4.so` 内偏移：

```python
0x05F33D8C   0x05F34FEC   0x05C22EC0   0x099CA690
```

`add_point @0x3E90` 里只有一句是算术：

```
0x3EF8  add x2, x1, x0      ; addr = base + offset
```

到这一步，断点地址就有了,驱动要的 `{addr, type, len, idx}` 里的 `addr` 就是这么来的

### 11.2 功能表

`make_plan @0x4008` 把菜单里的三个开关展开成最多四个,`Options[4]` 是范围档位四组常量一一对应：

| 菜单  | 索引  | `libUE4.so` 偏移 | tag / field | 命中后写 |
| --- | --- | --- | --- | --- |
| 范围（危险） | `[0]` | `0x5F33D8C` | `0x230` / `0x35` | **v14** = 1.0 / 1.2 / 3.0 |
| └ 跟随项 | 随 `[0]` 追加 | `0x5F34FEC` | `0x160` / `0x28` | **v1** = 100.0 |
| 内透  | `[1]` | `0x5C22EC0` | `0x90` / `0x0F` | **X8** = 3 |
| 无后座 | `[2]` | `0x99CA690` | `0x90` / `0x0F` | **X8** = 0 |

服务档位三行：

```
0x4204  w0 = Options[4]
0x4210  == 0 -> 0x3F800000   ; 1.0f   小
0x4224  == 2 -> 0x40400000   ; 3.0f   大
0x422C  其余 -> 0x3F99999A   ; 1.2f   中
```

所以内透和无后座不是两套机制，是 **同一张 `Edit` 表的两行**，同一字段 `0x0F` 一个写 3 一个写 0，区别只在断点地

### 11.3 命中之后改的是哪个寄存器

`kRegisterMappings @0x38580` ，3 项 × 0x18，布局 `{u32 a; u32 pad; u64 b; u32 c; u32 d}` ：

| #   | a   | b   | c   | d   | 落到  |
| --- | --- | --- | --- | --- | --- |
| 0   | 0x0F | 0x090 | 0   | 8   | X8  |
| 1   | 0x35 | 0x230 | 1   | 0x0E | v14 |
| 2   | 0x28 | 0x160 | 1   | 1   | v1  |

`a` 比 `Edit+8` 、 `b` 比 `Edit+0` ，两项都对上才命中，落点由 `edit_snapshot @0x4448` 算，写模板只有一个 `store_value @0x670C` ：

```
c == 0  -> pt_regs + d*8
c != 0  -> pt_regs + (d + 0x12)*16     ; = 0x120 + d*16
0x670C     str w1, [x0]                ; 固定 32 位
```

前0x110字节是 31 个 `GPR + sp + pc + pstate` ，SIMD 区 16 字节对齐落到 0x120，所以 `d=0x0E` 是 `+0x200` = **v14**， `d=1` 是 `+0x130` = **v1**

\*\*不是 X30 \*\* 这里最容易踩的坑是把 `a` 当寄存器号， `0x35` 早就越过 X30 了，它是本体内部给可改字段编的ID，真实寄存器号是 `d` ，SIMD 项还得按 `pt_regs` 的 16 字节对齐再换算一次

`register_masks @0x433C` 用同一张表算 `1 << d` ， `c == 0` 落第一个出参、否则落第二个，两个掩码原样进 `BpModify`

### 11.4 一次命中闭环

每个线程一条 `0xCC8` 记录点块 `+0` 是地址、 `+8` 是 armed、 `+9` 起 0x320 字节现场， `update @0x8D90` 双层循环逐个 `arm_point`

```
0xA108  armed 就跳过
0xA14C  BpGetHitCount  {addr}            ; 命中数在 req+0x10
0xA208  BpGetHitItems  {addr,buf,0x338}  ; 条数在 req+0x18，必须恰好 1
0xA2AC  hit.tid == 0 或 == state->tid
0xA2FC  hit+8      == point.addr
0xA328  hit+0x118  == point.addr         ; regs.pc，备用判据
0xA3A0  memcpy(point+9, hit+0x18, 0x320)
0xA3C8  edit_snapshot    -> 0xA440 register_masks
0xA4CC  BpModify {addr, m1, m2, point+9}
0xA51C  armed = 1
0xA554  BpUninstall {addr}               ; 摘掉，防重复命中
0xA5BC  create_point(..., true)          ; 内部再 BpInstall
```

命中项 `0x338 = 0x18 + 0x320` ： `+0` tid、 `+8` addr、现场从 `+0x18` 起、 `regs.pc` 在 `+0x118`

所以它是 **把驱动回传的整份现场收下，改掉其中一个 32 位字段，连同两个掩码交回 `BpModify` ；成功后 `BpUninstall` 摘断点，再 `create_point` 重装一份**，等下一轮，驱动下次命中时拿这份现场覆盖 `pt_regs` ，并自己模拟掉被断点顶替的那条指令

本体剩下的都是外围，比如终端 UI、运行锁、信号处理、线程表同步等等
