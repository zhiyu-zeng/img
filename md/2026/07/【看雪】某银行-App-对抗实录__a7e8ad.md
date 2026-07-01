---
title: 【看雪】某银行 App 对抗实录
source: https://bbs.kanxue.com/thread-291846.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-01T21:08:57+08:00
trace_id: 15419443-ae97-4182-86c6-d008081977f1
content_hash: 1b4e49fc3f9b1cd2de30b33b07f03fb8cba51cf16fd19ef186087960557049ae
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 某银行 App 的严格风控通过安全 SDK 直接读取设备属性共享内存来检测环境，常规 hook 无效，需从系统初始化层面伪造属性值才能绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39075244-d011-81ab-9654-c2dccda673ae
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - bbs.kanxue.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 某银行 App 的严格风控通过安全 SDK 直接读取设备属性共享内存来检测环境，常规 hook 无效，需从系统初始化层面伪造属性值才能绕过。
> 
> - **遭遇问题：** 分析某银行 App 时，应用在启动后约 9 秒内会静默闪退，日志显示风控读取了系统属性后主动调用 `System.exit` 退出。
> - **监控工具：** 采用 eBPF 的 uprobe/kprobe 技术，从内核侧监控 App 行为，发现应用存在时序反调试（插桩过多会导致自杀加速）。
> - **观测检测：** 风控检测项包括全量读取系统属性、扫描大量 su/magisk 路径、遍历 `/proc/self/maps` 和进行大量线程巡检等，但单独修改属性 API 层的值无效。
> - **根本原因：** 使用 unidbg 分析发现，安全 SDK（某盾）在初始化时直接读取并解析 `/dev/__properties__` 属性共享内存，绕过了标准的系统属性 API 调用。
> - **绕过方法：** 修改 Android init 进程的源码（`property_service.cpp`），在系统启动阶段将关键属性（如 `ro.boot.verifiedbootstate`）从源头写入伪造的值（如 `green`），使得所有读取方式（包括直接读共享内存）都能获得伪造值。

> 说明：本文是基于乐佬的两篇某企业壳逆向帖子，我实践后对遇到的问题做的记录  
> 分析环境：Pixel 6 自编译 AOSP 15 。

## 1\. 谁在杀我

在实践乐佬的逆企业壳的帖子时，一打开最新版的某银行App，9秒后就闪退，上了反反调试的root检测，自编译特征去除后还是被杀。出师未接身先死，立马就激起我的斗志。

```bash
adb logcat -b crash -b main
```

| logcat | 含义  |
| --- | --- |
| `System.exit called, status: 0` + `Process ... has died` | **某 SDK 主动静默退出** （非崩溃） |
| `Fatal signal 11 (SIGSEGV)` / tombstone | **native 崩溃** |
| `ANR` / `lowmemorykiller` | 卡死 / 内存不足 |

抓到的关键片段（脱敏）：

```python
W/Risk-thread-Tas: avc denied  read /proc/version, /proc/tty/drivers    ← 风控读环境特征
W/getprop:         avc denied  read ro.debuggable / userdebug_or_eng_prop
I/<pkg>:           System.exit called, status: 0                          ← ★风控:主动静默退出
I/ActivityManager: Process <pkg> ... has died: fg TOP
```

在这个启动过程中，手机的去特征frida是没有开启的，也没有安装面具，LsPosed等。从日志中已暴露出是读了系统的debug属性闪退，本以为发现了就可以解决，哪想到...

### 修改system_property_api.cpp

在三个出口拦截：

-   \__system_property_get
-   \__system_property_read_callback（getprop 子进程走这条）
-   \__system_property_read

```python
// 只对目标 app 的 uid 返伪值，全局物理值不动
if (getuid() == 目标uid && name 命中 ro.debuggable 等) {
    return "0";      
}
```

> 我自己实现了一套类似xposed的框架，可以对属性进行拦截。

做了以上操作后，打开银行APP还是在9s内闪退，看样子不仅仅是这块检测。

## 2\. 上 eBPF

既然 frida 走不通、窗口又只有几秒，正确姿势是 **不进入目标进程** ，从 **内核侧** 监控风控读了什么。我是使用的是 **eBPF uprobe/kprobe**

### 2.1 为什么选择 eBPF uprobe/kprobe

-   **通过uprobe 挂 bionic libc 可以导出函数** ： `__system_property_get/find` 、 `access/faccessat/stat/lstat/fstatat/openat` 、 `execve/posix_spawn/fork` 、 `readlink*` ，可以通过过滤目标 app uid ，libc syscall 包装函数能直接拿路径参数 `char*` 。
-   **kprobe 挂内核 syscall 实现** ： `do_sys_openat2 / vfs_statx / do_group_exit / __arm64_sys_ptrace / tgkill` 。 **对 uprobe 功能的补充** ——VMP 代码会用 **直接 `svc` 绕过 libc** ，libc-uprobe 看不到，kprobe 在内核层能看到全部访问。

> GKI 5.10 踩坑：本机环境用 Debian chroot + bpftrace，两个必踩坑：① 必须 `mount --rbind /apex $ROOT/apex` （uprobe 要命中 app 实际映射的真实 libc inode，拷副本 inode 不同不触发）；② `export TMPDIR=/root` （chroot 默认 /tmp 不可写，否则解 kheaders 直接崩）。

### 2.2 新的问题：时序反调试

使用ebpf方案监控APP操作后出现以下的现象：

-   **15 探针 uprobe → 死亡时间从 ~9.5s 提前到 ~1.5s** ；
-   **探针（2 个）/ kprobe → 保持 ~9.5s** 。

说明它会 **测操作耗时** ，插桩拖慢了时间，应用就会自杀。\*\*所以检测要使用最少的探针 kprobe。

### 2.3 观测到的检测项

脱敏后简表：

| 检测位置 | 行为  | 备注  |
| --- | --- | --- |
| ① 系统属性 | bare `getprop` 子进程全量 dump（数十次）→ Java 层 grep；进程内 `__system_property_get` 读 `ro.debuggable/ro.secure/ro.boot.qemu/ro.build.fingerprint...`；指纹↔安全补丁交叉校验 | per-app 属性 hook 有效，但 **不阻止自杀** |
| ② 内核/启动参数 | 读 `/proc/version` （被 SELinux 挡）、 `/sys/fs/selinux/context` 、 `/sys/kernel/pid_max` | `/proc/version` 对 untrusted_app 零售机也被挡 → 非判别点 |
| ③ 文件/挂载 | `access()` 扫 **72 条** su/magisk 路径； `execve busybox/su/which` 遍历 PATH；exec `mount` + 读 `/proc/mounts` （overlayfs 审计） | su 被 DAC 拦住； |
| ④ 内存/进程 | 读 `/proc/self/maps` ×24（找非官方.so）； `/proc/self/task/*/status` **×678** 线程巡检（线程名 + 每线程 TracerPid）；ptrace 反注入 | frida 注入即在此被抓 → `SIGSEGV` |
| ⑤ 行为指纹 | `RustDeskDetector` connect `127.0.0.1:37527` （远控端口探测）；时序反调试 |     |

**观测能力边界** ：eBPF 能看到「读了什么」，但通过对这些读的值分析发现各项属性读取的 **都是正常值** ，让我一度怀疑是通过这些值拼接了出我的设备画像，通过服务端判断，然后自杀（通过关网验证并不是）。

* * *

## 3\. 上unidbg

在这里我将APP使用的某梆加固最为重点攻破对象，在疯狂的补完环境后，发现并不是在这里检测到环境异常而自杀。在这里一度想放弃。其中心酸不表。

### 3.1 罪魁祸首是某盾 libtong\*

某盾直接读 /dev/ **properties** ，属性 API hook 对它全失效。  
在此之前，我已经用 **per-app bionic hook** 把 `ro.debuggable` 等对目标 APP 返回0， **属性 API 层确实生效** ， **但自杀照旧。** 为什么？

unidbg 跑某盾 init 时抓到：

-   **init（INIT_ARRAY 构造器）里直接 `open("/dev/__properties__")`** ，把系统属性共享内存 **mmap 进来、走自实现的 trie 解析读属性** 。

即： **同盾不走 bionic 属性 API，直接读属性区原始共享内存。**

**结论** ：任何在 `__system_property_get` 函数层做的 hook（per-app bionic 伪装、frida hook 该导出、Xposed 改 `SystemProperties.get` ）—— **对某盾这类 SDK 一律无效** ，它读到的是内核/init 写进 `/dev/__properties__` 的 **真值** 。

* * *

### 3.2 问题修复

设备属性值：

```python
ro.boot.verifiedbootstate = orange     ← ★解锁标志（售卖机器 = green）
ro.boot.flash.locked      = 0          ←   售卖机器 = 1
sys.oem_unlock_allowed    = 1
ro.debuggable             = 1   
ro.secure = 1
```

在 **init 把 `androidboot.* → ro.boot.*` 映射写进属性区的那一步** 动手，在属性区里写入值 `green` ：

-   patch `system/core/init/property_service.cpp` ，在 `androidboot.verifiedbootstate → ro.boot.verifiedbootstate` 映射处改写为 `green` ；顺带 `flash.locked → 1` 、 `verifiedbooterror → ""` （源在 `/proc/bootconfig` ）。
-   因为改的是 **属性区内容真值** ，无论上层走 `__system_property_get` 还是 **直读 `/dev/__properties__`** ，读到的都是 `green` —— **对某盾的自解析同样有效** 。

**至此问题修复，应用启动不自杀**

* * *

*以上仅供安全研究与加固对抗技术交流，请勿用于任何非法用途。*

[#NDK分析](https://bbs.kanxue.com/forum-161-1-119.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm)
