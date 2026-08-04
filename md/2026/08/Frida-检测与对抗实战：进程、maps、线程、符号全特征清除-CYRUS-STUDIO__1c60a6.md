---
title: Frida 检测与对抗实战：进程、maps、线程、符号全特征清除 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/frida-%E6%A3%80%E6%B5%8B%E4%B8%8E%E5%AF%B9%E6%8A%97%E5%AE%9E%E6%88%98%E8%BF%9B%E7%A8%8Bmaps%E7%BA%BF%E7%A8%8B%E7%AC%A6%E5%8F%B7%E5%85%A8%E7%89%B9%E5%BE%81%E6%B8%85%E9%99%A4/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:12:38+08:00
trace_id: 343b8e17-e4ea-4bb3-b71c-3268d5a6ce0f
content_hash: b481f8a64a60fce88bd390db05427fab3458708a1b7c39289395fc1046d591b6
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 通过修改Frida源码消除进程、文件名、符号、线程名等特征，可使定制的frida-server绕过常规检测。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3b275244-d011-8101-861d-d8c0cb49bcf5
ioc:
  cves: []
  cwes: []
  hashes:
    - 1201454c917174cec7e233041799d2c457f947a2
    - 3def865cf83963b099e0c37d5ab159d1e415951b
    - 4f05cb60ce97660189962bfcf7ffca15e182848e
    - 88e78178f786bf8cea2172ed6aeff335f30dd299
    - bc9f17ee233deb6cee53b5379db8b21ca6dce602
    - d48df0a7c0791a1e58bf9e5598a19e59652d90f5
    - d742ef8ab032876514fd7d0a0fcc41093e80d25c
    - ddd0f5875c08edc005e9f89f7fdb7b0928fac4dc
    - f61148b9a0b980c6400479c34ee8d059dfb510d6
    - fd52f64f49fbbde2820e02e6e6dd3aafd1ac0ce6
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过修改Frida源码消除进程、文件名、符号、线程名等特征，可使定制的frida-server绕过常规检测。
> 
> - **检测方法：** 常见检测包括通过ps命令或/proc/pid/comm、cmdline扫描frida进程名；对默认端口27042发起TCP连接；使用ptrace或读取/proc/self/status中的TracerPid识别调试器；遍历/proc/self/map查找“frida”“gum-js”等字符串，以及检查线程名“gum-js-loop”“gmain”“gdbus”等。
> - **frida:rpc字符串隐藏：** 在rpc.vala中将硬编码的“frida:rpc”改为运行时由Base64动态解码生成，避免静态字符串匹配。
> - **文件名与符号伪装：** 在linux-host-session.vala中用随机UUID替换frida-agent*.so文件名，并将dlsym查找的入口符号“frida_agent_main”改为“main”；通过Python脚本（lief）批量将ELF中所有包含“frida”的符号名替换为随机字符串，并将.rodata中的“FridaScriptEngine”等关键字符串等长反转。
> - **线程名与进程名抹除：** 编译阶段用sed全局替换ELF中的“gum-js-loop”“gmain”“gdbus”为随机串；在gum.c和frida-glue.c中调用g_set_prgname将进程名伪装为普通名称（如“ggbond”）。
> - **maps与socket特征清除：** 将memfd_create的name固定为“jit-cache”隐藏maps中的memfd特征；删除unix抽象socket路径的“frida-”前缀；放宽协议校验使通信在异常干预下不断开。实际测试中定制后的frida-server可成功Hook目标应用，并使本地检测全通过。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 常见 Frida 检测方法

## 进程检测

可以通过 ps 命令检查是否存在 frida 进程

```
vangogh:/ # su -c "ps -A -o PID,NAME,ARGS" | grep frida
 4159 grep                        grep frida
 5908 10                          10 unix:abstract=/frida-d007576e-c54b-4d95-a136-b9ae2a8b9b18
16079 10                          10 unix:abstract=/frida-d9961233-953d-43b2-9e0b-4290e7782e72
```

或者扫描 /proc/pid 下的 comm 或 cmdline 文件内容检查是否存在 frida 进程

-   /proc/\[pid\]/comm：进程的 **短名称**
    
-   /proc/\[pid\]/cmdline：进程的 **完整启动参数**
    

通过 ps -A | grep frida 命令找到 frida-server 进程 id 为 5632

```yaml
1|vangogh:/ # ps -A | grep fs
root           165     2       0      0 ecryptfs_threadfn   0 S [ecryptfs-kthrea]
root           304     2       0      0 rescuer_thread      0 I [ufs_pm_qos_0]
root           306     2       0      0 rescuer_thread      0 I [ufs_recovery_wq]
root           307     2       0      0 rescuer_thread      0 I [ufs_clk_gating_]
root           308     2       0      0 rescuer_thread      0 I [ufs_clkscaling_]
root           655     2       0      0 issue_checkpoint_thread 0 S [f2fs_ckpt-259:6]
root           656     2       0      0 issue_flush_thread  0 S [f2fs_flush-259:]
root           657     2       0      0 issue_discard_thread 0 S [f2fs_discard-25]
root           658     2       0      0 gc_thread_func      0 S [f2fs_gc-259:65]
root           944     2       0      0 rescuer_thread      0 I [ipa_ut_dbgfs]
vendor_rfs    1086     1 2251048   2888 do_sys_poll         0 S tftp_server
system        1550     1 2336992   5340 binder_ioctl_write_read 0 S perfservice
root          5632     1 2275756   6928 do_sys_poll         0 S frida-server
root         24446     2       0      0 worker_thread       0 I [kworker/u16:8-ufs_pm_qos_0]
root         25294     2       0      0 worker_thread       0 I [kworker/u16:14-ufs_clkscaling_0]
```

进入 5632 进程目录可以看到有 comm 和 cmdline 文件

```bash
vangogh:/ # cd /proc
vangogh:/proc # ls | grep 5632
5632
vangogh:/proc # cd 5632
vangogh:/proc/5632 # ls
attr        coredump_filter   fdinfo     mountinfo   oom_score_adj  sched_boost_period_ms  sf_binder_task  syscall
autogroup   cpuset            io         mounts      pagemap        sched_group_id         smaps           task
auxv        critical_rt_task  limits     mountstats  personality    sched_init_task_load   smaps_rollup    time_in_state
cgroup      cwd               loginuid   net         reclaim        sched_low_latency      stack           timerslack_ns
clear_refs  environ           map_files  ns          root           sched_wake_up_idle     stat            wchan
cmdline     exe               maps       oom_adj     sched          schedstat              statm
comm        fd                mem        oom_score   sched_boost    sessionid              status
```

读取 comm 和 cmdline 文件内容

```
vangogh:/proc/5632 # cat comm
frida-server

vangogh:/proc/5632 # cat cmdline
/data/local/tmp/frida-server-l0.0.0.0:27042
```

但由于 hidepid，app内 只能看到自己进程 + 少量系统进程，其他 UID 的进程 完全不可见，除非有 root 权限。

hidepid 是 Linux 在挂载 /proc 时的权限控制参数（Android 默认常见为 hidepid=2），用于限制普通进程查看其他进程的信息；

获取 root 权限并通过 ps 命令获取完整进程列表：

```cpp
/**
 * 通过 su 执行 ps 获取完整进程列表
 */
static std::vector<std::string> scanByRoot(const std::vector<std::string> &keywords) {
    std::vector<std::string> results;

    // 构造 grep 正则
    std::string pattern;
    for (size_t i = 0; i < keywords.size(); i++) {
        pattern += keywords[i];
        if (i != keywords.size() - 1) pattern += "|";
    }

    std::string cmd = "su -c \"ps -A -o PID,NAME,ARGS\"";

    LOGD("exec: %s", cmd.c_str());

    FILE *fp = popen(cmd.c_str(), "r");
    if (!fp) {
        LOGD("popen failed");
        return results;
    }

    char buffer[512];
    while (fgets(buffer, sizeof(buffer), fp)) {
        std::string line(buffer);

        // 打印所有进程
        LOGD("ps: %s", line.c_str());

        if (!containsKeyword(line, keywords)) continue;

        // 简单解析：PID 在第一列
        std::istringstream iss(line);
        std::string pid, name, args;
        iss >> pid >> name;

        // 剩余部分就是 args（可能为空）
        std::getline(iss, args);

        // 去掉前导空格
        if (!args.empty() && args[0] == ' ') {
            args.erase(0, args.find_first_not_of(' '));
        }

        if (!pid.empty() && !name.empty()) {
            LOGD(">>> HIT pid=%s, name=%s, args=%s", pid.c_str(), name.c_str(), args.c_str());
            results.emplace_back(pid + ":" + name + ":" + args);
        }
    }

    pclose(fp);
    return results;
}
```

## 端口检测（27042）

Frida 默认端口：27042，通过对指定端口发起一次 TCP 连接来判断端口是否被占用。

```cpp
#include <jni.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <fcntl.h>


extern "C"
JNIEXPORT jboolean JNICALL
Java_com_cyrus_example_fridadetector_core_checks_PortCheck_checkPort(
        JNIEnv *env,
        jobject thiz,
        jint port) {

    int sock = socket(AF_INET, SOCK_STREAM, 0);
    if (sock < 0) {
        return JNI_FALSE;
    }

    struct sockaddr_in sa{};
    sa.sin_family = AF_INET;
    sa.sin_port = htons(port);
    inet_aton("127.0.0.1", &sa.sin_addr);

    int result = connect(sock, (struct sockaddr *) &sa, sizeof(sa));

    if (result == 0) {
        close(sock);
        return JNI_TRUE;
    }

    close(sock);
    return JNI_FALSE;
}
```

## 调试检测

### 1\. ptrace

通过调用 ptrace(PTRACE_TRACEME) 判断当前进程是否已被调试器附加：

如果当前进程 **已经被调试** （Frida / gdb）：

-   内核会拒绝 → 返回 -1
    
-   errno = EPERM
    

否则调用成功

```cpp
#include <jni.h>
#include <sys/ptrace.h>
#include <errno.h>
#include <unistd.h>
#include <android/log.h>

#define TAG "PtraceCheck"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

extern "C"
JNIEXPORT jboolean JNICALL
Java_com_cyrus_example_fridadetector_core_checks_DebugCheck_isBeingTraced(
        JNIEnv *env,
        jobject thiz) {

    errno = 0;

    // 尝试声明自己被 trace
    long result = ptrace(PTRACE_TRACEME, 0, nullptr, nullptr);

    if (result == -1) {
        LOGD("ptrace failed, errno=%d", errno);

        // EPERM：已经被其他调试器附加（典型 Frida / gdb）
        if (errno == EPERM) {
            LOGD(">>> DETECTED: already being traced");
            return JNI_TRUE;
        }
    } else {
        // 成功说明当前未被 trace，需要 detach 避免影响后续
        ptrace(PTRACE_DETACH, 0, nullptr, nullptr);
    }

    return JNI_FALSE;
}
```

errno 是内核返回的“失败原因编码”，定义如下：

```cpp
#define EPERM   1   // Operation not permitted（操作不被允许）
#define ENOENT  2   // No such file or directory（文件或目录不存在）
#define ESRCH   3   // No such process（进程不存在）
#define EINTR   4   // Interrupted system call（系统调用被信号中断）
#define EIO     5   // I/O error（输入输出错误）
#define ENXIO   6   // No such device or address（设备或地址不存在）
#define E2BIG   7   // Argument list too long（参数列表过长）
#define ENOEXEC 8   // Exec format error（可执行文件格式错误）
#define EBADF   9   // Bad file descriptor（错误的文件描述符）
#define ECHILD  10  // No child processes（没有子进程）
#define EAGAIN  11  // Try again（资源暂时不可用，需重试）
#define ENOMEM  12  // Out of memory（内存不足）
#define EACCES  13  // Permission denied（权限被拒绝）
#define EFAULT  14  // Bad address（非法内存地址）
#define ENOTBLK 15  // Block device required（需要块设备）
#define EBUSY   16  // Device or resource busy（设备或资源忙）
#define EEXIST  17  // File exists（文件已存在）
#define EXDEV   18  // Cross-device link（跨设备链接）
#define ENODEV  19  // No such device（设备不存在）
#define ENOTDIR 20  // Not a directory（不是目录）
#define EISDIR  21  // Is a directory（是目录）
#define EINVAL  22  // Invalid argument（无效参数）
#define ENFILE  23  // File table overflow（系统文件表已满）
#define EMFILE  24  // Too many open files（进程打开文件过多）
#define ENOTTY  25  // Not a typewriter（不支持的 ioctl 设备）
#define ETXTBSY 26  // Text file busy（文本文件被占用）
#define EFBIG   27  // File too large（文件过大）
#define ENOSPC  28  // No space left on device（设备空间不足）
#define ESPIPE  29  // Illegal seek（非法 seek 操作）
#define EROFS   30  // Read-only file system（只读文件系统）
#define EMLINK  31  // Too many links（链接数过多）
#define EPIPE   32  // Broken pipe（管道破裂）
#define EDOM    33  // Math argument out of domain（数学参数超出定义域）
#define ERANGE  34  // Math result not representable（数学结果超出范围）
```

但在 Android 上 ptrace 经常被 seccomp（secure computing mode） 限制。

 [![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/33616d244355f897.png)](data:image/png;base64,inline-39622B)seccomp 拦截了 ptrace syscall，并返回一个“权限被拒绝”的 errno

当你在 App 中执行：

```
ptrace(PTRACE_TRACEME, ...)
```

实际会触发一个 **syscall: ptrace**

为什么 Android 要限制 ptrace？

因为 ptrace 可以：

-   attach 任意进程
    
-   修改寄存器 / 内存
    
-   实现调试、注入（Frida 就是基于它）
    

系统策略：普通 app ≈ 禁用 ptrace

出于安全考虑，所以有 seccomp 这种内核级 syscall 过滤机制，

### 2\. TracerPid

通过读取 /proc/self/status 中的 TracerPid 字段判断是否存在调试器（非 0 表示被调试）；

相比 ptrace，该方法不依赖 syscall，不易被 seccomp/SELinux 限制或 hook，因此更稳定可靠。

```cpp
/**
 * TracerPid 检测
 */
extern "C"
JNIEXPORT jint JNICALL
Java_com_cyrus_example_fridadetector_core_checks_DebugCheck_getTracerPid__(
        JNIEnv *env,
        jobject thiz) {

    std::ifstream status("/proc/self/status");
    if (!status.is_open()) {
        LOGD("open /proc/self/status failed");
        return -1;
    }

    std::string line;
    while (std::getline(status, line)) {
        if (line.find("TracerPid:") == 0) {

            int tracerPid = atoi(line.substr(10).c_str());

            LOGD("TracerPid=%d", tracerPid);

            if (tracerPid != 0) {
                LOGD(">>> tracer detected (pid=%d)", tracerPid);
            }

            return tracerPid;
        }
    }

    return 0;
}
```

可以通过 strace 查看 frida-server 的 ptrace 调用

```
vangogh:/data/local/tmp # strace -f -e ptrace ./frida-server
```

frida 的 ptrace 调用相关源码：frida\\subprojects\\frida-core\\src\\linux\\frida-helper-backend.vala

但是 Frida **不会长期依赖 ptrace，** 不会长期占用 TracerPid，因此该方法不一定有效，需要增加内存检测手段。

## maps 检测

/proc/\[pid\]/maps 是进程的内存映射表，记录了当前进程加载的所有模块（so、dex、匿名映射等）及其地址范围和权限信息。

而 Frida 在注入时通常会加载诸如 frida-agent、libfrida-gadget.so、gum-js-loop 等特征模块或字符串，因此只需遍历 maps 内容并匹配这些关键字，就可以检测 Frida 的存在。

```bash
vangogh:/ # pidof com.cyrus.example
4639
vangogh:/ # cd /proc/4639
vangogh:/proc/4639 # cat maps | grep frida
71290ee000-7129b1c000 r--p 00000000 00:01 4581721                        /memfd:frida-agent-64.so (deleted)
7129b1d000-712a85d000 r-xp 00a2e000 00:01 4581721                        /memfd:frida-agent-64.so (deleted)
712a85d000-712a92e000 r--p 0176d000 00:01 4581721                        /memfd:frida-agent-64.so (deleted)
712a92f000-712a94a000 rw-p 0183e000 00:01 4581721                        /memfd:frida-agent-64.so (deleted)
```

代码实现如下：

```kotlin
package com.cyrus.example.fridadetector.core.checks

import android.util.Log
import com.cyrus.example.fridadetector.model.CheckResult
import com.cyrus.example.fridadetector.model.CheckType
import java.io.File

object MapsCheck {
    fun check(): CheckResult {
        return try {
            val maps = File("/proc/self/maps").readText()

            Log.i("MapsCheck", "maps:${maps}")

            val detected = listOf(
                "frida",
                "gum-js",
                "gmain"
            ).any { maps.contains(it, true) }

            CheckResult(
                CheckType.MAPS,
                !detected,
                if (detected) "Frida string in maps" else "OK"
            )
        } catch (e: Exception) {
            CheckResult(CheckType.MAPS, true, "Error")
        }
    }
}
```

## 完整源码

Android 完整源码地址： [https://github.com/CYRUS-STUDIO/AndroidExample](https://github.com/CYRUS-STUDIO/AndroidExample)

## Frida 检测对抗

以下修改基于 Frida 16.7.19，不同版本可能略有差异。

Frida源码下载和编译参考： [Frida 源码编译全流程：自己动手编译 frida-server](https://cyrus-studio.github.io/blog/posts/frida-%E6%BA%90%E7%A0%81%E7%BC%96%E8%AF%91%E5%85%A8%E6%B5%81%E7%A8%8B%E8%87%AA%E5%B7%B1%E5%8A%A8%E6%89%8B%E7%BC%96%E8%AF%91-frida-server/)

## 修改前准备

### 1\. 切换目标版本

切换到目标版本

```bash
git checkout 16.7.19
```

同步 submodule（关键）

```bash
git submodule update --init --recursive --force
```

检测子模块是否已经同步

```bash
cyrus:~/frida$ git submodule status
 ddd0f5875c08edc005e9f89f7fdb7b0928fac4dc releng (ddd0f58)
 bc9f17ee233deb6cee53b5379db8b21ca6dce602 subprojects/frida-clr (16.7.19)
 4f05cb60ce97660189962bfcf7ffca15e182848e subprojects/frida-core (4f05cb60)
 fd52f64f49fbbde2820e02e6e6dd3aafd1ac0ce6 subprojects/frida-go (v0.7.2-1-gfd52f64)
 88e78178f786bf8cea2172ed6aeff335f30dd299 subprojects/frida-gum (88e78178)
 d742ef8ab032876514fd7d0a0fcc41093e80d25c subprojects/frida-node (16.7.19)
 3def865cf83963b099e0c37d5ab159d1e415951b subprojects/frida-python (16.7.19)
 1201454c917174cec7e233041799d2c457f947a2 subprojects/frida-qml (16.7.19)
 d48df0a7c0791a1e58bf9e5598a19e59652d90f5 subprojects/frida-swift (16.7.19)
 f61148b9a0b980c6400479c34ee8d059dfb510d6 subprojects/frida-tools (13.7.1-15-gf61148b)
```

### 2\. 创建开发分支

1.  frida-core

```bash
cd subprojects/frida-core
git checkout -b cyrida-16.7.19
```

2.  frida-gum

```bash
cd ../frida-gum
git checkout -b cyrida-16.7.19
```

3.  回到主仓库

```bash
cd ~/frida
git checkout -b cyrida-16.7.19
```

## 消除 frida:rpc 特征

源文件路径：frida\\subprojects\\frida-core\\lib\\base\\rpc.vala

把 frida:rpc 的核心特征字符串从“静态可见”变成“运行时生成”，从而绕过基于字符串特征的检测。

```lua
/**
 * 动态构造 "frida:rpc"
 *
 * @param quote 是否返回带引号的字符串：
 *               true  -> "\"frida:rpc\""
 *               false -> "frida:rpc"    
 */
public string getRpcStr(bool quote){
    string result = (string) GLib.Base64.decode((string) GLib.Base64.decode("Wm5KcFpHRTZjbkJq"));
    if(quote){
       return "\"" + result + "\"";
    }else{
       return result;
    }
}
```

替换点：

| 原始  | 修改后 |
| --- | --- |
| “frida:rpc” | getRpcStr(false) |
| “"frida:rpc"” | getRpcStr(true) |

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cd0821bf458b4bda.png)](data:image/png;base64,inline-258178B)

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5bb1685750d94fb1.png)](data:image/png;base64,inline-136218B)

提交修改

```bash
cd ~/frida/subprojects/frida-core

git add lib/base/rpc.vala
git commit -m "string frida rpc"
```

## 消除 frida-agent\*.so 文件名

源文件路径：frida\\subprojects\\frida-core\\src\\linux\\linux-host-session.vala

消除 frida-agent\*.so 这一强特征文件名，用随机名替代，从而绕过基于文件名的检测。

agent 文件名随机化（UUID）

 [![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d3067838660b84ba.png)](data:image/png;base64,inline-261130B)修改后的源码如下：

```php

#if HAVE_EMBEDDED_ASSETS
          var blob32 = Frida.Data.Agent.get_frida_agent_32_so_blob ();
          var blob64 = Frida.Data.Agent.get_frida_agent_64_so_blob ();
          var emulated_arm = Frida.Data.Agent.get_frida_agent_arm_so_blob ();
          var emulated_arm64 = Frida.Data.Agent.get_frida_agent_arm64_so_blob ();

          // 随机前缀
          var random_prefix = GLib.Uuid.string_random ();

          agent = new AgentDescriptor (PathTemplate (random_prefix + "-<arch>.so"),
             new Bytes.static (blob32.data),
             new Bytes.static (blob64.data),
             new AgentResource[] {
                    new AgentResource (random_prefix + "-arm.so", new Bytes.static (emulated_arm.data), tempdir),
                    new AgentResource (random_prefix + "-arm64.so", new Bytes.static (emulated_arm64.data), tempdir),
             },
             AgentMode.INSTANCED,
             tempdir);
#endif
```

get_emulated_agent_path（避免仍用 frida-agent-\*）

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/558809f9616436ce.png)](data:image/png;base64,inline-254254B)

修改后源码如下：

```typescript
protected override string? get_emulated_agent_path (uint pid) throws Error {
    unowned string arch_suffix;
    switch (cpu_type_from_pid (pid)) {
       case Gum.CpuType.IA32:
          arch_suffix = "arm";
          break;
       case Gum.CpuType.AMD64:
          arch_suffix = "arm64";
          break;
       default:
          throw new Error.NOT_SUPPORTED ("Emulated realm is not supported on this architecture");
    }

    // 从 agent.resources 动态匹配（不再使用硬编码）
    AgentResource? resource = agent.resources.first_match (r => r.name.has_suffix ("-" + arch_suffix + ".so"));
    if (resource == null)
       throw new Error.NOT_SUPPORTED ("Unable to handle emulated processes due to build configuration");

    return resource.get_file ().path;
}
```

提交修改：

```bash
git add src/linux/linux-host-session.vala
git commit -m "frida agent so randomize"
```

## 消除 frida_agent_main 符号

把 frida_agent_main 这个强特征导出符号彻底移除，并伪装成普通 main，同时批量抹除所有 symbol 中的 “frida” 字符串。

Frida 注入流程本质：

```
dlopen(frida-agent.so)
        ↓
dlsym("frida_agent_main")
        ↓
call(...)
```

vala 修改 = 改 dlsym 查找的名字

ELF 修改 = 改 symbol 实际名字

两者必须一致

### 1\. 修改 Vala

需要修改的 vala 文件

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/809c4fda9318ab5e.png)](data:image/png;base64,inline-149906B)

修改入口函数名，把 frida_agent_main 改为 main；

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dbfb2fcd411c78fa.png)](data:image/png;base64,inline-135330B)

### 2\. 修改 ELF

在 embed-agent.py 同级目录下新建一个 python 脚本，用于批量抹除 frida-agent.so 中 所有 symbol 中的 “frida” 字符串。

obfuscate_agent_symbols.py

```typescript
import lief
import sys
import random
import os

def log_color(msg):
    print(f"\033[1;31;40m{msg}\033[0m")

if __name__ == "__main__":
    input_file = sys.argv[1]
    random_charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

    log_color(f"[*] Patch frida-agent: {input_file}")

    binary = lief.parse(input_file)

    if not binary:
        log_color(f"[*] Not elf, exit")
        exit()

    random_name = "".join(random.sample(random_charset, 5))
    log_color(f"[*] Patch `frida` to `{random_name}`")

    for symbol in binary.symbols:
        if symbol.name == "frida_agent_main":
            symbol.name = "main"

        if "frida" in symbol.name:
            symbol.name = symbol.name.replace("frida", random_name)

        if "FRIDA" in symbol.name:
            symbol.name = symbol.name.replace("FRIDA", random_name)

    binary.write(input_file)
```

在 frida\\subprojects\\frida-core\\src\\embed-agent.py 中把 obfuscate_agent_symbols.py 自动嵌入到构建流程中，在生成 frida-agent.so 后立即进行二进制级“去特征处理”。

```python
elif host_os in {"linux", "android"}:
    for agent, flavor in [(agent_modern, "64"),
                          (agent_legacy, "32"),
                          (agent_emulated_modern, "arm64"),
                          (agent_emulated_legacy, "arm")]:
        embedded_agent = priv_dir / f"frida-agent-{flavor}.so"
        if agent is not None:
            shutil.copy(agent, embedded_agent)
        else:
            embedded_agent.write_bytes(b"")
        
        # === 新增：调用 obfuscate_agent_symbols.py ===
        import os
        custom_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "obfuscate_agent_symbols.py")
        return_code = os.system(f"python3 {custom_script} {str(priv_dir / f'frida-agent-{flavor}.so')}")
        
        if return_code == 0:
            print("obfuscate_agent_symbols finished")
        else:
            print("obfuscate_agent_symbols error. Code:", return_code)
        # === 新增结束 ===

        embedded_assets += [embedded_agent]
```

提交修改：

```bash
git add \
  src/agent-container.vala \
  src/darwin/darwin-host-session.vala \
  src/freebsd/freebsd-host-session.vala \
  src/linux/linux-host-session.vala \
  src/qnx/qnx-host-session.vala \
  src/windows/windows-host-session.vala \
  tests/test-agent.vala \
  tests/test-injector.vala \
  src/obfuscate_agent_symbols.py \
  src/embed-agent.py
git commit -m "symbol frida_agent_main to main"
```

## 抹除 gum-js-loop 线程名特征

通过修改 ELF 中的 “gum-js-loop” 字符串，间接改变 Frida 运行时线程名，从而绕过基于线程名的检测。

在 obfuscate_agent_symbols.py 中增加下面的代码：

```python
# thread gum_js_loop
random_name = "".join(random.sample(random_charset, 11))
log_color(f"[*] Patch `gum-js-loop` to `{random_name}`")
os.system(f"sed -b -i s/gum-js-loop/{random_name}/g {input_file}") # 把 gum-js-loop 替换成随机字符串
```

提交修改

```bash
git add src/obfuscate_agent_symbols.py
git commit -m "thread gum_js_loop"
```

## 抹除 gmain 线程名特征

把 ELF 中所有 “gmain” 字符串替换为随机字符串。在 obfuscate_agent_symbols.py 中增加下面的代码：

```python
# thread gmain
random_name = "".join(random.sample(random_charset, 5))
log_color(f"[*] Patch `gmain` to `{random_name}`")
os.system(f"sed -b -i s/gmain/{random_name}/g {input_file}")
```

提交修改

```bash
git add src/obfuscate_agent_symbols.py
git commit -m "thread gmain"
```

## 抹除 gdbus 线程名特征

在整个 ELF 二进制中查找字符串 “gdbus”，并用随机字符串全局替换，从而隐藏线程/组件特征。

在 obfuscate_agent_symbols.py 中增加下面的代码：

```python
# thread gdbus
random_name = "".join(random.sample(random_charset, 5))
log_color(f"[*] Patch `gdbus` to `{random_name}`")
os.system(f"sed -b -i s/gdbus/{random_name}/g {input_file}")
```

提交修改

```bash
git add src/obfuscate_agent_symbols.py
git commit -m "thread gdbus"
```

## .rodata 字符串

通过在.rodata 段中定位 Frida 相关字符串，并用“等长反转字符串”覆盖，达到隐藏特征同时不破坏 ELF 结构的目的。

```python
all_patch_string = ["FridaScriptEngine", "GLib-GIO", "GDBusProxy", "GumScript"]
for section in binary.sections:
    if section.name != ".rodata":
        continue
    for patch_str in all_patch_string:
        addr_all = section.search_all(patch_str)
        for addr in addr_all:
            patch = [ord(n) for n in list(patch_str)[::-1]]
            log_color(f"[*] Patching section name={section.name} offset={hex(section.file_offset + addr)} orig:{patch_str} new:{''.join(list(patch_str)[::-1])}")
            binary.patch_address(section.file_offset + addr, patch)
```

最终效果大概如下：

```
FridaScriptEngine
↓
enignEtpircSadirF
```

-   不改变 ELF 结构
    
-   不影响偏移
    
-   不破坏引用关系
    
-   不需要重定位
    

提交修改

```bash
git add src/obfuscate_agent_symbols.py
git commit -m ".rodata frida string"
```

## obfuscate_agent_symbols.py

obfuscate_agent_symbols.py 完整源码如下：

```python
import lief
import sys
import random
import os

def log_color(msg):
    print(f"\033[1;31;40m{msg}\033[0m")

if __name__ == "__main__":
    input_file = sys.argv[1]
    random_charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

    log_color(f"[*] Patch frida-agent: {input_file}")

    binary = lief.parse(input_file)

    if not binary:
        log_color(f"[*] Not elf, exit")
        exit()

    random_name = "".join(random.sample(random_charset, 5))
    log_color(f"[*] Patch `frida` to `{random_name}`")

    for symbol in binary.symbols:
        if symbol.name == "frida_agent_main":
            symbol.name = "main"

        if "frida" in symbol.name:
            symbol.name = symbol.name.replace("frida", random_name)

        if "FRIDA" in symbol.name:
            symbol.name = symbol.name.replace("FRIDA", random_name)

    all_patch_string = ["FridaScriptEngine", "GLib-GIO", "GDBusProxy", "GumScript"]
    for section in binary.sections:
        if section.name != ".rodata":
            continue
        for patch_str in all_patch_string:
            addr_all = section.search_all(patch_str)
            for addr in addr_all:
                patch = [ord(n) for n in list(patch_str)[::-1]]
                log_color(f"[*] Patching section name={section.name} offset={hex(section.file_offset + addr)} orig:{patch_str} new:{''.join(list(patch_str)[::-1])}")
                binary.patch_address(section.file_offset + addr, patch)

    binary.write(input_file)

    # thread gum_js_loop
    random_name = "".join(random.sample(random_charset, 11))
    log_color(f"[*] Patch `gum-js-loop` to `{random_name}`")
    os.system(f"sed -b -i s/gum-js-loop/{random_name}/g {input_file}") # 把 gum-js-loop 替换成随机字符串

    # thread gmain
    random_name = "".join(random.sample(random_charset, 5))
    log_color(f"[*] Patch `gmain` to `{random_name}`")
    os.system(f"sed -b -i s/gmain/{random_name}/g {input_file}")

    # thread gdbus
    random_name = "".join(random.sample(random_charset, 5))
    log_color(f"[*] Patch `gdbus` to `{random_name}`")
    os.system(f"sed -b -i s/gdbus/{random_name}/g {input_file}")

    log_color(f"[*] Patch Finish")
```

## 放宽协议校验，避免异常中断

源文件路径：frida\\subprojects\\frida-core\\src\\droidy\\droidy-client.vala

在 Droidy（Frida 的 Android 设备通信层）中 **放宽协议校验，避免异常中断**。修改如下：

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3775eca71565f0b3.png)](data:image/png;base64,inline-119682B)

一些反 Frida / 对抗环境会，主动干扰通信：

-   插入异常 packet
    
-   发送非预期 command
    
-   打乱通信顺序
    

将协议层的“异常即中断”改为“异常忽略”，提高 Frida 在异常或对抗环境下的通信稳定性。

提交修改：

```bash
git add src/droidy/droidy-client.vala
git commit -m "Relax protocol validation to avoid unexpected interruptions."
```

## 进程级特征伪装

源文件路径：

-   frida\\subprojects\\frida-gum\\gum\\gum.c
    
-   frida\\subprojects\\frida-core\\src\\frida-glue.c
    

通过 g_set_prgname 修改进程名，将 frida-agent 伪装成普通程序（如 ggbond），绕过基于进程名的检测。

g_set_prgname 是 GLib 提供的 API：

```
void g_set_prgname (const gchar *prgname);
```

用于设置当前进程的名字。

gum.c

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e6e0ec6896fad8f.png)](data:image/png;base64,inline-134210B)

frida-glue.c

[![word/media/image10.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1041d1a4be4b9b18.png)](data:image/png;base64,inline-178082B)

提交修改：

```bash
git add src/frida-glue.c
git commit -m "process_name"

cd ~/frida/subprojects/frida-gum
git add gum/gum.c
git commit -m "process_name"
```

## 隐藏 maps（memfd）特征

memfd 是 Linux 提供的一种“仅存在于内存中的文件”，可用于存储和执行代码，Frida 利用它实现无文件落地的 so 注入，但其 name 会暴露在 /proc/maps 中成为检测点。

将 memfd_create 的 name 从包含 frida 特征的字符串，改为 “jit-cache”（把 Frida 行为伪装成“系统正常行为”），从而隐藏 Frida 在 /proc/self/maps 中的关键特征。

[![word/media/image11.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a25c01c9d8dfce18.png)](data:image/png;base64,inline-160022B)

源文件路径：frida\\subprojects\\frida-core\\src\\linux\\frida-helper-backend.vala

修改前：

```
private int memfd_create (string name, uint flags) {
    return Linux.syscall (SysCall.memfd_create, name, flags);
}
```

修改后：

```
private int memfd_create (string name, uint flags) {
    return Linux.syscall (SysCall.memfd_create, "jit-cache", flags);
}
```

提交修改：

```bash
git add src/linux/frida-helper-backend.vala
git commit -m "memfd jit cache"
```

## 抹除 “frida-” socket 前缀

Frida 在建立通信时会创建一个 **Unix abstract socket**：

```
string socket_path = "/frida-" + Uuid.string_random ();
```

Linux 表现为：

```
unix:abstract=/frida-xxxx
```

当启动 frida-server 后，通过 ps 命令可以看到：

```
vangogh:/proc/27743 # ps -A -o PID,NAME,ARGS | grep frida
22357 10                          10 unix:abstract=/frida-84ebe7df-f80f-4cb0-b852-2241dbd346b4
22613 10                          10 unix:abstract=/frida-3c1d0033-6980-42cc-b8ac-02809cd8382d
```

这个 frida 特征来自 Unix abstract socket（frida-xxxx），这是运行时生成的，可以通过修改源码中的 socket 命名逻辑彻底消除。

源文件路径：

-   frida\\subprojects\\frida-core\\src\\linux\\frida-helper-backend.vala
    
-   frida\\subprojects\\frida-core\\src\\linux\\frida-helper-process.vala
    

直接把 “frida-” 前缀 删除掉，修改如下：

frida-helper-backend.vala

[![word/media/image12.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1359d311fb147d6f.png)](data:image/png;base64,inline-110438B)

frida-helper-process.vala

[![word/media/image13.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/31cfdfd69f4c2b09.png)](data:image/png;base64,inline-140198B)

提交修改：

```bash
git add \
  src/linux/frida-helper-backend.vala \
  src/linux/frida-helper-process.vala
git commit -m "remove soket name prefix"

cd ~/frida
git add \
  subprojects/frida-core \
  subprojects/frida-gum
git commit -m "anti frida detection"
```

## 编译 frida-server

安装 lief

```
python3 -m pip install lief
```

验证：

```
python3 -c "import lief; print(lief.__version__)"
```

重新编译 frida

```
# 1. 清理旧构建
rm -rf build

# 2. 配置（Android）
./configure --host=android-arm64

# 3. 编译
make
```

编译完成

```swift
cyrus:~/frida$ make
INFO: autodetecting backend as ninja
INFO: calculating backend command to run: /home/cyrus/frida/deps/toolchain-linux-x86_64/bin/ninja
[258/298] Generating subprojects/frida-core/src/frida-data-agent with a custom command
[*] Patch frida-agent: subprojects/frida-core/src/frida-data-agent-blob.S.p/frida-agent-64.so
[*] Patch `frida` to `JebEa`
[*] Patching section name=.rodata offset=0x1c3612 orig:FridaScriptEngine new:enignEtpircSadirF
[*] Patching section name=.rodata offset=0x1d1430 orig:FridaScriptEngine new:enignEtpircSadirF
[*] Patching section name=.rodata offset=0x1d8365 orig:GLib-GIO new:OIG-biLG
[*] Patching section name=.rodata offset=0x1946fa orig:GDBusProxy new:yxorPsuBDG
[*] Patching section name=.rodata offset=0x1c3718 orig:GDBusProxy new:yxorPsuBDG
[*] Patching section name=.rodata offset=0x1aed35 orig:GumScript new:tpircSmuG
[*] Patching section name=.rodata offset=0x20e82c orig:GumScript new:tpircSmuG
[*] Patching section name=.rodata offset=0x235eec orig:GumScript new:tpircSmuG
[*] Patching section name=.rodata offset=0x2439d9 orig:GumScript new:tpircSmuG
[*] Patch `gum-js-loop` to `vBuEgneMWtj`
[*] Patch `gmain` to `uBmwx`
[*] Patch `gdbus` to `ctdDE`
[*] Patch Finish
[*] Patch frida-agent: subprojects/frida-core/src/frida-data-agent-blob.S.p/frida-agent-32.so
[*] Patch `frida` to `NRXct`
[*] Patching section name=.rodata offset=0xcc9d1 orig:FridaScriptEngine new:enignEtpircSadirF
[*] Patching section name=.rodata offset=0xda256 orig:FridaScriptEngine new:enignEtpircSadirF
[*] Patching section name=.rodata offset=0xe1161 orig:GLib-GIO new:OIG-biLG
[*] Patching section name=.rodata offset=0x9e93a orig:GDBusProxy new:yxorPsuBDG
[*] Patching section name=.rodata offset=0xccad7 orig:GDBusProxy new:yxorPsuBDG
[*] Patching section name=.rodata offset=0xb887c orig:GumScript new:tpircSmuG
[*] Patching section name=.rodata offset=0x1158a2 orig:GumScript new:tpircSmuG
[*] Patching section name=.rodata offset=0x13cb44 orig:GumScript new:tpircSmuG
[*] Patching section name=.rodata offset=0x14a2a5 orig:GumScript new:tpircSmuG
[*] Patch `gum-js-loop` to `JydDgHiCeGf`
[*] Patch `gmain` to `tYMPy`
[*] Patch `gdbus` to `dJTEL`
[*] Patch Finish
[*] Patch frida-agent: subprojects/frida-core/src/frida-data-agent-blob.S.p/frida-agent-arm64.so
[*] Not elf, exit
[*] Patch frida-agent: subprojects/frida-core/src/frida-data-agent-blob.S.p/frida-agent-arm.so
[*] Not elf, exit
obfuscate_agent_symbols finished
obfuscate_agent_symbols finished
obfuscate_agent_symbols finished
obfuscate_agent_symbols finished
[298/298] Generating subprojects/frida-core/src/api/frida-core-api with a custom command
```

在 build 目录下找到 frida-server

[![word/media/image14.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/de77cc574b7a7bf4.png)](data:image/png;base64,inline-40278B)

## 测试对抗效果

把定制的 frida-server 推送到设备并启动，通过 frida hook 当前 app 成功，并且 rpc 通信正常执行。

```bash
(frida17) PS D:\Python\anti-app\frida17\native> frida -H 127.0.0.1:1234 -F
     ____
    / _  |   Frida 16.7.19 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to 127.0.0.1:1234 (id=socket@127.0.0.1:1234)
[Remote::AndroidExample ]-> Frida.version
"16.7.19"
```

app 中 frida 特征检测全通过。

[![word/media/image15.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/07bd68c41d9b1cbd.png)](data:image/png;base64,inline-110794B)

某充电APP检测到 frida 后会自动退出APP

[![word/media/image16.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/89b2df3b4bccae70.png)](data:image/png;base64,inline-169790B)

换定制的 frida-server 后能正常 Hook

[![word/media/image17.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/91f8f45dffebd2d0.png)](data:image/png;base64,inline-122614B)

## 打一个 patchs

查看 commit 日志

```bash
git log --oneline --decorate --graph
```

frida-core 从 b93d3254 开始导出 patch

```
cyrus:~/frida/subprojects/frida-core$ git log --oneline --decorate --graph
* 8fe3dbbe (HEAD -> cyrida-16.7.19) remove soket name prefix
* 7d3259f6 string frida rpc
* e2d7b964 memfd jit cache
* 1303afd4 process_name
* bf00791b Relax protocol validation to avoid unexpected interruptions.
* 6520e8c7 thread gdbus
* c5cb2c37 thread gmain
* 6230fce6 thread gum_js_loop
* ed561f84 .rodata frida string
* 7d5a49b6 symbol frida_agent_main to main
* b93d3254 frida agent so randomize
...
```

导出到 cyrida/patches/frida-core

```swift
cyrus:~/frida/subprojects/frida-core$ git format-patch b93d3254^ -o /home/cyrus/cyrida/patches/frida-core
/home/cyrus/cyrida/patches/frida-core/0001-frida-agent-so-randomize.patch
/home/cyrus/cyrida/patches/frida-core/0002-symbol-frida_agent_main-to-main.patch
/home/cyrus/cyrida/patches/frida-core/0003-.rodata-frida-string.patch
/home/cyrus/cyrida/patches/frida-core/0004-thread-gum_js_loop.patch
/home/cyrus/cyrida/patches/frida-core/0005-thread-gmain.patch
/home/cyrus/cyrida/patches/frida-core/0006-thread-gdbus.patch
/home/cyrus/cyrida/patches/frida-core/0007-Relax-protocol-validation-to-avoid-unexpected-interr.patch
/home/cyrus/cyrida/patches/frida-core/0008-process_name.patch
/home/cyrus/cyrida/patches/frida-core/0009-memfd-jit-cache.patch
/home/cyrus/cyrida/patches/frida-core/0010-string-frida-rpc.patch
/home/cyrus/cyrida/patches/frida-core/0011-remove-soket-name-prefix.patch
```

frida-gum 从 62d75bfd 开始导出 patch

```
cyrus:~/frida/subprojects/frida-gum$ git log --oneline --decorate --graph
* 62d75bfd (HEAD -> cyrida-16.7.19) process_name
```

导出到 cyrida/patches/frida-gum

```swift
cyrus:~/frida/subprojects/frida-gum$ git format-patch 62d75bfd^ -o /home/cyrus/cyrida/patches/frida-gum
/home/cyrus/cyrida/patches/frida-gum/0001-process_name.patch
```

Push Patches

```bash
cd ~cyrida

git init
git add .
git commit -m "cyrida patches based on frida 16.7.19"
git tag 16.7.19
git branch -M main
git remote add origin https://github.com/CYRUS-STUDIO/Cyrida.git
git push -u origin main
```

项目开源地址： [https://github.com/CYRUS-STUDIO/Cyrida](https://github.com/CYRUS-STUDIO/Cyrida)

## apply patchs

apply 之前先切换到对应的版本

```bash
git checkout 16.7.19
git submodule update --init --recursive --force
```

应用 frida-core patches

```yaml
cyrus:~/frida$ cd ~/frida/subprojects/frida-core
cyrus:~/frida/subprojects/frida-core$ git am ~/cyrida/patches/frida-core/*.patch
Applying: frida agent so randomize
Applying: symbol frida_agent_main to main
Applying: .rodata frida string
Applying: thread gum_js_loop
Applying: thread gmain
Applying: thread gdbus
/home/cyrus/frida/.git/modules/frida-core/rebase-apply/patch:27: trailing whitespace.

warning: 1 line adds whitespace errors.
Applying: Relax protocol validation to avoid unexpected interruptions.
Applying: process_name
/home/cyrus/frida/.git/modules/frida-core/rebase-apply/patch:14: trailing whitespace.

warning: 1 line adds whitespace errors.
Applying: memfd jit cache
Applying: string frida rpc
Applying: remove soket name prefix
```

应用 frida-gum patches

```ruby
cyrus:~/frida/subprojects/frida-core$ cd ~/frida/subprojects/frida-gum
cyrus:~/frida/subprojects/frida-gum$ git am ~/cyrida/patches/frida-gum/*.patch
Applying: process_name
```

注意：patch 属于哪个 repo，就在哪个 repo 里 apply，如果 patch 失败必须先 abort 然后重新来一遍：

```bash
git am --abort
```

相关链接：
