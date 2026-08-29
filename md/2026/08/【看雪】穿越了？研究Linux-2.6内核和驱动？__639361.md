---
title: 【看雪】穿越了？研究Linux 2.6内核和驱动？
source: https://bbs.kanxue.com/thread-292803.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-29T10:58:13+08:00
trace_id: 560496d5-5edb-479f-a2a3-77f0b1ffc954
content_hash: bb9be2ed56fd1b57ac984a2d6bf73cc9715d7e50a129d038efddb0c3cf1125ae
status: synced
tags:
  - 看雪
  - 内核
  - QEMU
series: null
feed_source: 看雪·逆向工程
ai_summary: 搭建Linux2.6.32内核与驱动的调试环境：用Docker的Ubuntu12.04编译老内核和BusyBox，再通过QEMU+GDB实现源码级调试。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3cb75244-d011-81f7-bcc2-f5a151535de6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 搭建Linux2.6.32内核与驱动的调试环境：用Docker的Ubuntu12.04编译老内核和BusyBox，再通过QEMU+GDB实现源码级调试。
> 
> - **环境方案：** 用Docker运行Ubuntu12.04作为编译环境，因Linux2.6太老，新系统缺少匹配的编译条件。
> - **内核配置：** 使用linux-2.6.32.69源码，必须开启Kernel debugging、debug info、frame pointers，关闭Optimize for size，并把编译优化级别改为-O1。
> - **根文件系统：** 用BusyBox 1.20.2编译静态二进制，建立init、inittab、profile等文件，打包为initramfs.img供QEMU启动。
> - **启动与调试：** QEMU参数使用-s -S开启GDB调试口，串口用TCP 4444；GDB连接localhost:1234，执行set architecture i386、target remote localhost:1234后运行。
> - **源码级调试：** 将源码目录放入GDB，通过directory命令指向/root/Desktop/linux26/linux-2.6.32.69即可带代码调试。

都2026年了，现在研究Linux2.6还有意义吗？除了毛德操老师的书是2.4的，《深入Linux内核架构》，《Linux内核设计与实现》《深入理解LINUX内核》这些经典书都是2.6的，所以研究一下还是很有必要的。

1.

废话不多说，直接开干，本文创建Linux2.6的内核和驱动的GDB调试环境。先安装vmware虚拟机，然后安装Ubuntu24，这一步就不多介绍了。

2.

在Ubuntu24中安装Docker，这步就不多介绍了，很简单。

3.

Docker中启动虚拟机Ubuntu12.04，这是因为Linux2.6太老了，所以我们需要老的编译环境

```as3
docker run -it --name kernel_build -v /your/local/share:/shared ubuntu:12.04 /bin/bash
```

4.以下操作，在Ubuntu12.04中进行.

更新源：

```as3
cat << 'EOF' > /etc/apt/sources.list
deb http://old-releases.ubuntu.com/ubuntu precise main restricted universe multiverse
deb http://old-releases.ubuntu.com/ubuntu precise-updates main restricted universe multiverse
deb http://old-releases.ubuntu.com/ubuntu precise-security main restricted universe multiverse
EOF
```

5.安装依赖文件

```as3
apt-get update
 
apt-get install build-essential libncurses5-dev kernel-package fakeroot vim -y
```

6.进入/root目录，下载Linux2.6源码

```as3
curl -O https://www.kernel.org/pub/linux/kernel/v2.6/longterm/v2.6.32/linux-2.6.32.69.tar.xz
 
tar -xvf linux-2.6.32.69.tar.xz
 
cd linux-2.6.32.69
 
make ARCH=i386 i386_defconfig
```

## 配置内核调试选项

7.配置内核选项：

```as3
make ARCH=i386 menuconfig
```

保证以下3项为选中状态：

```as3
Kernel hacking  --->Kernel debugging 
Compile the kernel with debug info
Compile the kernel with frame pointers
```

去掉勾选这一项：

```as3
Optimize for size
```

8.修改内核根目录下的Makefile文件，保证编译出来的内核好调试

```as3
HOSTCFLAGS   = -Wall -Wmissing-prototypes -Wstrict-prototypes -O1 -fomit-frame-pointer
 
KBUILD_CFLAGS   += -O1
```

9.编译内核

```as3
make mrproper
 
make ARCH=i386 -j$(nproc) bzImage
```

10.Ubuntu24中安装qemu，这一步是为了在Ubuntu24中GDB调试Ubuntu12中编译的内核。

11.进入/root，编译安装BusyBox：

```as3
wget https://busybox.net/downloads/busybox-1.20.2.tar.bz2
 
tar -xvf busybox-1.20.2.tar.bz2
 
cd busybox-1.20.2
 
make defconfig
 
make menuconfig
```

修改BusyBox配置：

保证这一项被选中：

```as3
Busybox Settings  --->Build Options  --->[*] Build BusyBox as a static binary (no shared libs)
```

保证inetd这一项没有选中：

```as3
Networking Utilities  --->往下翻，找到 inetd
```

执行：

```as3
sed -i 's/CONFIG_FEATURE_HAVE_RPC=y/# CONFIG_FEATURE_HAVE_RPC is not set/' .config
sed -i 's/CONFIG_FEATURE_INETD_RPC=y/# CONFIG_FEATURE_INETD_RPC is not set/' .config
sed -i 's/CONFIG_IFUPDOWN_MAPPING=y/# CONFIG_IFUPDOWN_MAPPING is not set/' .config
```

保证.config中：

```as3
CONFIG_STATIC=y
CONFIG_EXTRA_CFLAGS="-m32 -march=i386"
CONFIG_EXTRA_LDFLAGS="-m32"
```

## 编译BusyBox根文件系统

编译BusyBox：

```as3
apt-get update
 
apt-get install gcc-multilib g++-multilib -y
 
make clean
 
make ARCH=i386 LDFLAGS="-m32" CFLAGS="-m32" -j$(nproc) install
```

复制文件：

```as3
cp -av /root/busybox-1.20.2/_install/* /root/my_rootfs/
 
cd /root/my_rootfs
 
mkdir -p dev proc sys mnt etc/init.d
```

编写init文件：

```as3
cat << 'EOF' > /root/my_rootfs/init
#!/bin/sh
 
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t 9p -o trans=virtio,version=9p2000 host_share /mnt
 
echo /sbin/mdev > /proc/sys/kernel/hotplug
mdev -s
mkdir -p /dev/pts
mount -t devpts devpts /dev/pts
 
clear
 
exec /sbin/init
EOF
```

编写inittab文件：

```as3
cat << 'EOF' > /root/my_rootfs/etc/inittab
::sysinit:/bin/dmesg
 
ttyS0::askfirst:-/bin/sh
EOF
```

编写profile文件：

```as3
cat << 'EOF' > /root/my_rootfs/etc/profile
export PS1='\w \$ '
 
cat /etc/issue
EOF
```

编写issue文件：

```as3
cat << 'EOF' > /root/my_rootfs/etc/issue
 
=============================================
   Welcome to BusyBox Linux 2.6!         
=============================================
EOF
```

创建/root/my_rootfs/dev下的两个文件：

```as3
mknod -m 666 ttyS0 c 4 64
mknod -m 600 console c 5 1
```

打包：

```as3
cd /root/my_rootfs/ && find . -print0 | cpio --null -ov --format=newc | gzip -9 > /root/initramfs.img
```

12.查看docker容器的ID:

```as3
docker ps -a
```

假设是：b50720f6ab74

13.将docker编译出的文件拷贝到Ubuntu24的中/root/Desktop/linux26中

```as3
docker cp b50720f6ab74:/root/linux-2.6.32.69/arch/x86/boot/bzImage .
docker cp b50720f6ab74:/root/linux-2.6.32.69/vmlinux .
docker cp b50720f6ab74:/root/initramfs.img .
```

## QEMU启动与GDB连接

14.在/root/Desktop/linux26中启动qemu

```as3
qemu-system-i386 -m 512M -cpu pentium3 -kernel bzImage -initrd initramfs.img -nographic -vga none -s -S -serial tcp:127.0.0.1:4444,server=on,wait=off,telnet=off -append "nokaslr earlyprintk=serial,ttyS0 console=ttyS0"
```

15.另一个终端中启动监控控制台

```as3
socat -,raw,echo=0 TCP:127.0.0.1:4444
```

16.在/root/Desktop/linux26中打开另一个终端中启动GDB

```as3
 gdb ./vmlinux
  
 输入：
 set architecture i386
  
 target remote localhost:1234
  
 c
```

当输入c并回车应该就能看见socat终端中输出系统打印内容了，这样就成功了。

17.将Linux的代码保存一份在Ubuntu24的/root/Desktop/linux26/linux-2.6.32.69中，在GDB调试时输入

```as3
directory /root/Desktop/linux26/linux-2.6.32.69
```

## 源码级调试

这样就能带代码调试了。
