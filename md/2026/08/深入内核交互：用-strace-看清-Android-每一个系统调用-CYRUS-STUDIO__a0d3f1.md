---
title: 深入内核交互：用 strace 看清 Android 每一个系统调用 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E6%B7%B1%E5%85%A5%E5%86%85%E6%A0%B8%E4%BA%A4%E4%BA%92%E7%94%A8-strace-%E7%9C%8B%E6%B8%85-android-%E6%AF%8F%E4%B8%80%E4%B8%AA%E7%B3%BB%E7%BB%9F%E8%B0%83%E7%94%A8/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T13:54:14+08:00
trace_id: 729bce27-5278-4235-97e3-eb1cfdc643ed
content_hash: 6146222a67ffcda21c0143402713c5676766f6d421cd305fae0b0667f899e671
status: synced
tags:
  - Android逆向
  - 安全工具
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 在 Android 上使用 strace 需 root、关闭 SELinux 并重启 ART，以突破系统限制并实现对进程系统调用的实时监控和调试。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3b275244-d011-81b2-a4c4-e1e10569d92e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在 Android 上使用 strace 需 root、关闭 SELinux 并重启 ART，以突破系统限制并实现对进程系统调用的实时监控和调试。
> 
> - **使用前提：** 需要 `adb root` 并执行 `setenforce 0` 关闭 SELinux，然后 `stop`/`start` 重启运行时以移除 zygote 的 seccomp 过滤器，否则 strace 会被拦截。
> - **构建与部署：** 可从 AOSP `external/strace` 目录通过 `mmma -j6 external/strace` 编译，输出 `system/bin/strace`，再 `adb push` 到 `/data/local/tmp/` 并赋予执行权限。
> - **常用跟踪方式：** `-p $(pidof 包名) -f` 附加进程及子线程；`-e trace=open,openat` 等按系统调用类型过滤；`-P /proc/self/status` 按路径过滤；`-ewrite=all -eread=all` 可十六进制+ASCII dump 读写内容。
> - **统计与故障注入：** `-c -f` 可统计各 syscall 调用次数与耗时；`-e fault=openat` 注入故障使指定调用强制失败，用于测试错误处理逻辑和程序健壮性。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## strace 介绍

strace 是 Linux 下用于跟踪一个程序在运行时所发生的 **系统调用（system calls）** 和 **信号（signals）** 的调试工具。

它可以快速了解程序与内核之间的交互，是定位程序异常、分析行为、逆向工程等场景中的利器。

相关链接：

## Android 下使用 strace

在 Android 下使用 strace 的方式与 Linux 类似，但会受到 系统版本、SELinux、权限限制、是否 root 等因素的影响。

在 Android 设备上启用 strace 跟踪能力：

1.  启用 root 权限
    
2.  停用 SELinux
    
3.  重新启动 ART 以移除 seccomp 过滤器，否则此过滤器会阻止 strace 运行
    

让 ADB 服务以 root 权限运行，这是使用 strace 的前提。

```
adb root
```

关闭 SELinux 强制模式，变为宽松模式（permissive）：

```
adb shell setenforce 0
```

-   默认是 enforcing，会拦截一些 ptrace 和文件访问行为。
    
-   仅推荐在调试环境使用，调试完记得恢复：
    

```
adb shell setenforce 1
```

重启 runtime，从而移除 seccomp 限制（它在 zygote 初始化后加载）。

```
adb shell stop
adb shell start
```

seccomp（Secure Computing Mode）是 Linux 内核提供的一种系统调用过滤机制，可以限制一个进程可以执行哪些 syscall（系统调用）。

简单来说：它是一道“沙箱防火墙”，阻止某些系统调用的执行，以提高安全性。

seccomp 会阻止 ptrace / strace，导致调试失败。

如何查看 seccomp 是否启用？可以通过读取 /proc/<pid>/status 文件查看：

```
1|wayne:/ # cat /proc/$(pidof com.cyrus.example)/status | grep Seccomp
Seccomp:        0
```

如果输出为 0 ，说明当前 没有启用 seccomp。

| 值   | 含义  |
| --- | --- |
| 0   | 未启用 |
| 1   | strict 模式 |
| 2   | filter 模式（使用 BPF）✅ 常见 |

## strace 是否已安装？

检查 Android 系统中是否有内置 strace。

使用 adb shell 调用内置的 strace

```
adb shell strace
```

如果提示如下就是存在 strace。

```
(base) PS C:\Users\cyrus> adb shell strace
strace: must have PROG [ARGS] or -p PID
Try 'strace -h' for more information.
```

如果提示 not found 就是没有，需要自己去构建。

```
(base) PS C:\Users\cyrus> adb shell strace
/system/bin/sh: strace: inaccessible or not found
```

## 构建 strace

Android 中 strace 项目源码在 external/strace 路径下

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/45ff0f04ca3ad1a8.png)](data:image/png;base64,inline-199506B)

初始化编译环境和设置编译目标

```ruby
cyrus@*:/mnt/case_sensitive/lineage-17.1$ source build/envsetup.sh
cyrus@*:/mnt/case_sensitive/lineage-17.1$ breakfast wayne
```

执行下面的命令构建 strace

```
mmma -j6 external/strace
```

输出大概如下：

```swift
============================================
PLATFORM_VERSION_CODENAME=REL
PLATFORM_VERSION=10
LINEAGE_VERSION=17.1-20250807-UNOFFICIAL-wayne
TARGET_PRODUCT=lineage_wayne
TARGET_BUILD_VARIANT=userdebug
TARGET_BUILD_TYPE=release
TARGET_ARCH=arm64
TARGET_ARCH_VARIANT=armv8-a
TARGET_CPU_VARIANT=cortex-a73
TARGET_2ND_ARCH=arm
TARGET_2ND_ARCH_VARIANT=armv8-a
TARGET_2ND_CPU_VARIANT=kryo
HOST_ARCH=x86_64
HOST_2ND_ARCH=x86
HOST_OS=linux
HOST_OS_EXTRA=Linux-5.15.153.1-microsoft-standard-WSL2-x86_64-Ubuntu-22.04.3-LTS
HOST_CROSS_OS=windows
HOST_CROSS_ARCH=x86
HOST_CROSS_2ND_ARCH=x86_64
HOST_BUILD_TYPE=release
BUILD_ID=QQ3A.200805.001
OUT_DIR=out
PRODUCT_SOONG_NAMESPACES=vendor/xiaomi/sdm660-common device/xiaomi/sdm660-common device/xiaomi/wayne vendor/xiaomi/wayne-common hardware/qcom-caf/msm8998
============================================
$(shell date -u +%Y%m%d) was changed, regenerating...
$(shell date -u +%Y%m%d) was changed, regenerating...
[100% 517/517] writing build rules ...
build/make/core/base_rules.mk:510: warning: overriding commands for target `out/target/product/wayne/vendor/lib/libstdc++.so'
build/make/core/base_rules.mk:510: warning: ignoring old commands for target `out/target/product/wayne/vendor/lib/libstdc++.so'
build/make/core/base_rules.mk:510: warning: overriding commands for target `out/target/product/wayne/vendor/lib64/libstdc++.so'
build/make/core/base_rules.mk:510: warning: ignoring old commands for target `out/target/product/wayne/vendor/lib64/libstdc++.so'
out/target/product/wayne/obj/CONFIG/kati_packaging/dist.mk was modified, regenerating...
ninja: no work to do.

#### build completed successfully (04:48 (mm:ss)) ####
```

通过 find 命令查找 strace 可执行文件的输出路径

```swift
cyrus@*:/mnt/case_sensitive/lineage-17.1$ find out/target/product/wayne/ -name strace
out/target/product/wayne/system/bin/strace
out/target/product/wayne/obj/EXECUTABLES/strace_intermediates/strace
out/target/product/wayne/obj/PACKAGING/target_files_intermediates/lineage_wayne-target_files-eng.cyrus/SYSTEM/bin/strace
out/target/product/wayne/symbols/system/bin/strace
```

你应该能看到类似路径输出如下：

```
out/target/product/wayne/system/bin/strace 
```

如果你需要带符号的调试版本（用于 gdb 或分析）：

```
out/target/product/wayne/symbols/system/bin/strace
```

将编译好的 strace 推送到 Android 设备：

```swift
adb push out/target/product/wayne/system/bin/strace /data/local/tmp/
adb shell chmod +x /data/local/tmp/strace
adb shell /data/local/tmp/strace ls /data
```

## 附加到已有进程

根据包名获取 APP 的进程 id

```
pidof com.cyrus.example
```

附加到已有进程

```
strace -p $(pidof com.cyrus.example)
```

或者增加 -f 跟踪所有子线程/子进程

```
strace -p $(pidof com.cyrus.example) -f
```

关闭 strace

```
Ctrl + C
```

## 使用 strace 跟踪文件打开行为

```
strace -p $(pidof com.cyrus.example) -f -e trace=open,openat -s 200
```

说明：

-   \-e trace=open,openat：只显示 open() 和 openat() 系统调用（这两个负责文件的打开）
    
-   \-s 200：显示最多 200 字节的字符串（路径名可能被截断，默认是 32）
    

输出示例：

```
wayne:/ # strace -p $(pidof com.cyrus.example) -e trace=open,openat -s 200
strace: Process 23500 attached
openat(AT_FDCWD, "/data/app/com.cyrus.example-HKy_qrfC66RVURkEFlC2kQ==/lib/arm64/libsohooker.so", O_RDONLY) = -1 ENOENT (No such file or directory)
openat(AT_FDCWD, "/sdcard/Android/data/com.cyrus.example/files/plugin-debug.apk", O_RDONLY) = 56
```

## 跟踪 /proc/self/\* 的文件访问

使用 strace 跟踪 /proc/self/\* 下的文件读写行为，用于理解程序在访问自身进程信息（比如内存、fd、maps、cmdline、status 等）时的行为。

使用 strace -e trace=open,read,write 跟踪 /proc/self/\* 的文件访问

```
strace -p $(pidof com.cyrus.example) -f -e trace=open,openat,read,write -s 200
```

这会打印 /proc/self/\* 下所有文件打开、读取、写入操作。

示例输出：

```swift
openat(AT_FDCWD, "/proc/self/status", O_RDONLY) = 50
read(50, "Name:\tm.cyrus.example\nState:\tR (running)\nTgid:\t23500\nPid:\t23500\nPPid:\t727\nTracerPid:\t0\nUid:\t10146\t10146\t10146\t10146\nGid:\t10146\t10146\t10146\t10146\nNgid:\t0\nFDSize:\t128\nGroups:\t3003 9997 20146 50146 \nVmPe"..., 8192) = 910
openat(AT_FDCWD, "/proc/self/stat", O_RDONLY) = 50
read(50, "23500 (m.cyrus.example) R 727 727 0 0 -1 4211008 112715 562 257 0 1545 443 0 0 10 -10 18 0 8067151 5351768064 46604 18446744073709551615 429220208640 429220233376 548774957360 0 0 0 4612 1 1073775864 "..., 8192) = 314
read(50, "", 8192)                      = 0
openat(AT_FDCWD, "/proc/self/wchan", O_RDONLY) = 50
```

只想跟踪访问的是 /proc/self/ 哪些文件？你可以加上 grep 过滤：

```
strace -p $(pidof com.cyrus.example) -e trace=open,openat -s 200 2>&1 | grep /proc/
```

示例输出：

```css
wayne:/ # strace -p $(pidof com.cyrus.example) -e trace=open,openat -s 200 2>&1 | grep /proc/
openat(AT_FDCWD, "/proc/self/status", O_RDONLY) = 50
openat(AT_FDCWD, "/proc/self/stat", O_RDONLY) = 50
openat(AT_FDCWD, "/proc/self/wchan", O_RDONLY) = 50
```

## 内存相关的系统调用分析

内存相关的系统调用：

-   mmap / mmap2：建立一段新的内存映射。mmap2 是为了解决 32 位平台偏移量不够的问题而引入的系统调用（Linux 2.3.31 以后）。
    
-   munmap：解除一段已映射的虚拟内存，使对应虚拟地址空间可被回收。
    
-   mremap：改变一段已映射内存的大小或位置，可能移动到新的虚拟地址。
    
-   mprotect：修改已映射内存区域的访问权限（读 / 写 / 执行），常用于代码段保护或动态生成代码。
    
-   madvise：向内核提供这段内存的使用模式建议（顺序访问、随机访问、空闲释放等），以优化内存管理性能。
    
-   brk：调整进程堆（数据段末尾）的边界，早期 malloc 依赖此方式分配内存，现在更多使用 mmap。
    
-   mlock / munlock：锁定 / 解锁指定内存页，防止被换出到 swap 区（提高实时性或安全性）。
    
-   mincore：检查一段虚拟内存的页面是否已在物理内存中（可用于内存访问优化）。
    
-   msync：将内存映射的文件页同步到磁盘，确保数据持久化。
    

执行下面命令跟踪内存相关系统调用：

```
strace -f -tt -T -e trace=munmap,mmap,mprotect -p $(pidof com.ss.android.ugc.aweme)
```

-   \-f 跟踪子进程
    
-   \-tt 打印时间戳
    
-   \-T 打印系统调用耗时
    
-   \-e trace=… 只跟踪特定系统调用
    
-   \-p PID 附加到进程
    

输出如下：

```yaml
[pid  3744] 19:48:38.861003 mmap(NULL, 7500, PROT_READ|PROT_WRITE, MAP_SHARED, 271, 0) = 0x7e7ac10000 <0.000096>
[pid  3744] 19:48:38.861458 munmap(0x7e7ac10000, 7500) = 0 <0.000111>
[pid  3744] 19:48:38.872634 mmap(NULL, 8497, PROT_READ|PROT_WRITE, MAP_SHARED, 271, 0) = 0x7e70758000 <0.000170>
[pid  3744] 19:48:38.873145 munmap(0x7e70758000, 8497) = 0 <0.000203>
[pid  3005] 19:48:38.986215 mmap(NULL, 53248, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7e2c4c2000 <0.000226>
[pid  3005] 19:48:39.123144 munmap(0x7e2c4c2000, 53248) = 0 <0.000282>
[pid  3097] 19:48:39.587753 mmap(NULL, 131072, PROT_READ|PROT_WRITE, MAP_SHARED, 56, 0x3c000) = 0x7ffde0000 <0.000151>
[pid  3097] 19:48:39.590641 mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_SHARED, 56, 0x3d000) = 0x7fff90000 <0.000245>
[pid  4013] 19:48:40.020093 mprotect(0x7c9c8d1000, 4096, PROT_NONE) = 0 <0.000096>
[pid  4013] 19:48:40.020954 mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7e7ac10000 <0.000117>
[pid  2999] 19:48:40.157820 mmap(NULL, 1832, PROT_READ, MAP_SHARED, 40, 0xfc13000) = 0x7e7ac0c000 <0.000199>
[pid  2999] 19:48:40.158328 munmap(0x7e7ac0c000, 1832) = 0 <0.000174>
[pid  2999] 19:48:40.159786 mmap(NULL, 2588, PROT_READ, MAP_SHARED, 40, 0xfb4f000) = 0x7e7ac0c000 <0.000178>
[pid  2999] 19:48:40.160267 munmap(0x7e7ac0c000, 2588) = 0 <0.000206>
[pid  2999] 19:48:40.170036 mmap(NULL, 1832, PROT_READ, MAP_SHARED, 40, 0xfc13000) = 0x7e7ac0c000 <0.000239>
[pid  2999] 19:48:40.170567 munmap(0x7e7ac0c000, 1832) = 0 <0.000193>
[pid  2999] 19:48:40.175522 mmap(NULL, 2588, PROT_READ, MAP_SHARED, 40, 0xfb4f000) = 0x7e7ac0c000 <0.000179>
[pid  2999] 19:48:40.175968 munmap(0x7e7ac0c000, 2588) = 0 <0.000184>
[pid  2999] 19:48:40.179096 mmap(NULL, 331, PROT_READ, MAP_SHARED, 40, 0xfaf4000) = 0x7e7ac0c000 <0.000179>
[pid  2999] 19:48:40.179560 munmap(0x7e7ac0c000, 331) = 0 <0.000202>
[pid  4013] 19:48:40.344393 munmap(0x7e7ac10000, 8192) = 0 <0.000076>
[pid  3367] 19:48:40.345559 mprotect(0x7d29374000, 4096, PROT_NONE) = 0 <0.000060>
[pid  3367] 19:48:40.345866 mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7e7ac10000 <0.000096>
[pid  3367] 19:48:40.354333 munmap(0x7e7ac10000, 8192) = 0 <0.000056>
[pid  2999] 19:48:40.422156 mmap(NULL, 4087, PROT_READ, MAP_SHARED, 40, 0x107f1000) = 0x7e7ac11000 <0.000158>
[pid  2999] 19:48:40.465396 munmap(0x7e7ac11000, 4087) = 0 <0.000179>
[pid  2999] 19:48:40.486480 mmap(NULL, 932, PROT_READ, MAP_SHARED, 40, 0xff5e000) = 0x7e7ac11000 <0.000179>
[pid  2999] 19:48:40.487385 munmap(0x7e7ac11000, 932) = 0 <0.000162>
[pid  2999] 19:48:40.488551 mmap(NULL, 2844, PROT_READ, MAP_SHARED, 40, 0x10b5d000) = 0x7e7ac11000 <0.000164>
[pid  2999] 19:48:40.489309 munmap(0x7e7ac11000, 2844) = 0 <0.000159>
[pid  3097] 19:48:41.909911 mmap(NULL, 8454144, PROT_READ|PROT_WRITE, MAP_SHARED, 56, 0x4f000) = 0x7fd0f0000 <0.000447>
[pid  3097] 19:48:41.957715 mmap(NULL, 536576, PROT_READ|PROT_WRITE, MAP_SHARED, 56, 0x51000) = 0x7feef0000 <0.000128>
[pid  3097] 19:48:41.960561 mmap(NULL, 540672, PROT_READ|PROT_WRITE, MAP_SHARED, 56, 0x56000) = 0x7fe470000 <0.000182>
[pid  3097] 19:48:41.968075 mmap(NULL, 786432, PROT_READ|PROT_WRITE, MAP_SHARED, 56, 0x58000) = 0x7fe3b0000 <0.000125>
[pid  2999] 19:48:42.666578 --- SIGSEGV {si_signo=SIGSEGV, si_code=SEGV_MAPERR, si_addr=0x8} ---
[pid  3115] 19:48:42.709927 mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7e7ac10000 <0.000108>
[pid  3115] 19:48:42.710396 mmap(NULL, 1085440, PROT_NONE, MAP_PRIVATE|MAP_ANONYMOUS|MAP_NORESERVE, -1, 0) = 0x7dff67a000 <0.000088>
[pid  3115] 19:48:42.710591 mprotect(0x7dff67b000, 1077248, PROT_READ|PROT_WRITE) = 0 <0.000086>
strace: Process 9084 attached
[pid  9084] 19:48:42.712360 mmap(NULL, 36864, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7e70752000 <0.000032>
[pid  9084] 19:48:42.712463 mprotect(0x7e70752000, 4096, PROT_NONE) = 0 <0.000023>
[pid  9084] 19:48:42.712670 mmap(NULL, 16777216, PROT_NONE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7d8d9ab000 <0.000025>
[pid  9084] 19:48:42.712749 mprotect(0x7d8e6ea000, 8192, PROT_READ|PROT_WRITE) = 0 <0.000024>
[pid  9084] 19:48:42.712817 mprotect(0x7dff67b000, 4096, PROT_NONE) = 0 <0.000022>
[pid  3097] 19:48:43.616395 munmap(0x7fe180000, 610304) = 0 <0.000322>
[pid  3097] 19:48:43.617357 munmap(0x7fff80000, 8192) = 0 <0.000151>
```

## 保存日志到文件

通过 -o 重定向日志输出：

```
strace -p $(pidof com.cyrus.example) -f -e trace=open,openat -s 200 -o /data/local/tmp/strace.txt
```

拉取查看：

```
adb pull /data/local/tmp/strace.txt
```

## 统计系统调用

统计一个 Android APP 使用了哪些系统调用（syscalls）以及调用频率

```
strace -p $(pidof com.cyrus.example) -c -f
```

参数解释：

-   \-f：跟踪子线程或子进程
    
-   \-c：输出统计信息而不是每条系统调用
    

示例输出：

```yaml
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 47.74    5.493336        1751      3136        45 futex
 27.46    3.160002         693      4556           ioctl
 12.46    1.433334      477778         3         1 restart_syscall
  8.86    1.019997         347      2938           epoll_pwait
  0.46    0.053336          12      4185           close
  0.38    0.043331          13      3234           clock_gettime
  0.35    0.040001          20      1976           read
  0.35    0.039997          28      1398           write
  0.26    0.029997          12      2316      1610 recvfrom
  ...
------ ----------- ----------- --------- --------- ----------------
100.00   11.506670                 35996      3112 total
```

表格含义：

| 列名  | 含义  |
| --- | --- |
| % time | 每个 syscall 占总时间百分比 |
| seconds | 总耗时 |
| usecs/call | 平均每次 syscall 的耗时（微秒） |
| calls | 调用次数 |
| errors | 发生错误的调用次数 |
| syscall | 系统调用名 |

## 系统调用类型过滤

通过 -e trace=%类型 的方式，更高效地指定你关心的一类 syscall

```
strace -p $(pidof com.cyrus.example) -f -e trace=%file -s 200
```

**各类 syscall 类型说明：**

| 类型  | 含义  | 常见 syscall 示例 |
| --- | --- | --- |
| %clock | 与时间/时钟相关 | clock_gettime, gettimeofday, nanosleep, settimeofday |
| %creds | 与用户/组ID、权限等相关 | setuid, setgid, getuid, setresuid, capget, setgroups |
| %desc | 与文件描述符相关（不管有没有路径） | dup, dup2, close, fcntl, pipe, eventfd |
| %file | 接收文件路径参数的 syscall | open, openat, unlink, stat, rename, chmod, mkdir, rmdir |
| %fstat | fstat 和 fstatat 相关 | fstat, fstatat |
| %fstatfs | 获取文件系统信息（针对文件描述符） | fstatfs, fstatfs64, fstatvfs |
| %ipc | 进程间通信 syscall | shmget, shmat, msgsnd, semop, mq_open |
| %lstat | lstat 相关变种 | lstat, lstat64 |
| %memory | 内存管理相关 | mmap, munmap, brk, mprotect, mremap, mlock |
| %network | 网络相关调用 | socket, bind, listen, accept, connect, send, recv |
| %process | 进程控制相关 | fork, vfork, clone, execve, exit, wait4, kill, setns |
| %pure | 无参数、必定成功的 syscall | getpid、getpid、… |
| %signal | 信号处理相关 | sigaction, sigprocmask, rt_sigaction, kill, alarm, pause |
| %stat | stat 的系列变种 | stat, stat64, newfstatat, statx |
| %statfs | 获取文件系统信息（路径方式） | statfs, statfs64, statvfs |
| %%stat | 同 %stat（写法略有不同） | \-  |
| %%statfs | 同 %statfs（写法略有不同） | \-  |

## 只追踪指定路径的系统调用

\-P <path> 会让 strace仅显示访问该路径的系统调用（如 open, stat, mmap, read, write 等）。

```
strace -p $(pidof com.cyrus.example) -f -P /proc/self/status
```

可以追踪多个路径：

```ruby
strace -p $(pidof com.cyrus.example) -f -P /proc/self/status -P /proc/self/stat  -P /proc/self/wchan
```

## 十六进制 + ASCII dump 的形式显示数据内容

完整追踪 APP 中读写系统调用，并以十六进制 + ASCII dump 的形式显示数据内容，

```
strace -p $(pidof com.cyrus.example) -f -e trace=write,sendmsg,recvmsg,read -ewrite=all -eread=all
```

-   \-e trace=write,sendmsg,recvmsg,read：只追踪这 4 个系统调用：write、read（文件或管道 I/O）、sendmsg、recvmsg（socket 通信）
    
-   \-ewrite=all：对所有 write 系统调用的输出内容（无论写到哪里）做 hex + ASCII dump
    
-   \-eread=all：对所有 read / recvmsg 等读取的内容进行 hex + ASCII dump
    

## 系统调用故障注入 (syscall fault injection)

使用 strace 进行 **系统调用故障注入 (syscall fault injection)** 的实例，用来模拟某个系统调用（这里是 openat）总是失败的情况。

```
strace -p $(pidof com.cyrus.example) -f -e trace=openat -e fault=openat
```

-   \-e fault=openat：注入故障，对每次 openat() 调用，强制使其失败

通常用于 调试、测试错误处理逻辑、审计程序健壮性。

示例输出：

```python
139|wayne:/ # strace -p $(pidof com.cyrus.example) -f -e trace=openat -e fault=openat
strace: Process 29414 attached with 30 threads                            # 成功附加到主进程及其 30 个线程
[pid 29442] openat(AT_FDCWD, "/data/misc/profiles/cur/0/com.cyrus.example/primary.prof", O_RDWR|O_NOFOLLOW|O_CLOEXEC) = -1 ENOSYS (Function not implemented) (INJECTED)   # 注入 openat 故障，模拟文件不可用，可能影响 ART 配置加载
strace: Process 17090 attached                                            # 新线程 17090 被附加
strace: Process 17091 attached                                            # 新线程 17091 被附加
[pid 17090] +++ exited with 0 +++                                         # 线程 17090 正常退出
[pid 17091] +++ exited with 0 +++                                         # 线程 17091 正常退出
[pid 29414] --- SIGSEGV {si_signo=SIGSEGV, si_code=SEGV_MAPERR, si_addr=NULL} ---   # 主线程访问 NULL 地址导致段错误（崩溃）
[pid 29414] openat(AT_FDCWD, "/proc/self/status", O_RDONLY) = -1 ENOSYS (Function not implemented) (INJECTED)   # 注入 openat 错误，导致无法读取当前进程状态信息
[pid 29414] openat(AT_FDCWD, "/proc/self/stat", O_RDONLY) = -1 ENOSYS (Function not implemented) (INJECTED)     # 读取 stat 失败，可能影响线程状态或 CPU 统计
[pid 29414] openat(AT_FDCWD, "/proc/self/wchan", O_RDONLY) = -1 ENOSYS (Function not implemented) (INJECTED)    # 无法查看线程阻塞状态，影响诊断
strace: Process 17092 attached                                            # 新线程 17092 被附加
[pid 17092] openat(AT_FDCWD, "/proc/self/fd", O_RDONLY|O_CLOEXEC|O_DIRECTORY) = -1 ENOSYS (Function not implemented) (INJECTED)   # 访问文件描述符目录失败，可能导致资源清理逻辑出错
[pid 17092] openat(AT_FDCWD, "/dev/null", O_RDWR) = -1 ENOSYS (Function not implemented) (INJECTED)             # 打开 /dev/null 失败，影响一些安全写入逻辑
[pid 17092] openat(AT_FDCWD, "/sys/fs/selinux/null", O_RDWR) = -1 ENOSYS (Function not implemented) (INJECTED)  # SELinux 模拟设备访问失败，可能影响安全上下文设置
[pid 17092] --- SIGSEGV {si_signo=SIGSEGV, si_code=SEGV_MAPERR, si_addr=0x80} ---   # 子线程访问地址 0x80 触发段错误（非法访问）
[pid 17092] +++ killed by SIGSEGV +++                                     # 子线程 17092 因段错误被内核杀死
[pid 29414] --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_KILLED, si_pid=17092, si_uid=10146, si_status=SIGSEGV, si_utime=0, si_stime=61} ---   # 主线程收到子线程异常终止 (SIGSEGV) 的通知
```
