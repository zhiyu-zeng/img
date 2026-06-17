---
title: 【看雪】APatch KPM 开发：绕过 DirtySepolicy / Duck Detector 的 SELinux Root 检测
source: https://bbs.kanxue.com/thread-291665.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-17T21:01:13+08:00
trace_id: 61174bc4-59fd-4073-b987-ff73ab21a994
content_hash: fea77f31d7fa1ff045aec16f6022112edc3deb11ea39276cb46568437addb4df
status: summarized
tags:
  - 看雪
series: null
ai_summary: 通过在内核的 write syscall 入口拦截并过滤特定的 SELinux context 字符串，成功绕过了 DirtySepolicy 等用户态检测方案。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38275244-d011-8119-89a6-edc44209a4aa
---

> 💡 **AI 总结（key-points）**
>
> 通过在内核的 write syscall 入口拦截并过滤特定的 SELinux context 字符串，成功绕过了 DirtySepolicy 等用户态检测方案。
> 
> - **检测原理：** DirtySepolicy 与 Duck Detector 利用 App Zygote 进程的写权限，通过 write syscall 向内核发送包含 “magisk”、“ksu” 等关键字的查询字符串来探测 root。
> - **方案失败：** 初始的 inline hook 方案因内核 LTO（链接时优化）导致关键函数被内联，hook 回调无法触发；且修改 `security_compute_av_user` 等函数必然导致系统崩溃。
> - **最终方案：** 转向更稳定的 syscall 层，通过 `fp_hook_syscalln` 挂钩 `write` 系统调用，在用户态缓冲区复制到内核前进行字符串匹配。
> - **性能关键：** 必须在回调函数首部过滤掉标准输入输出（fd ≤ 2）及非常规大小的数据包，否则会导致系统因日志拦截等正常操作而卡死。
> - **实现效果：** 仅用 5184 字节的模块，通过无状态的字符串过滤，成功屏蔽了所有已知的脏 SELinux context 查询，不依赖进程识别。

## 摘要

Android Root 环境隐藏攻防已从用户态文件隐藏、进程隐藏演进到内核层 SELinux 策略检测。LSPosed 团队公开的 DirtySepolicy 方案利用 App Zygote 进程的 SELinux 查询权限，直接探测内核中是否存在 Magisk、KernelSU 等注入的"脏"策略规则，号称"用户态无法绕过"。本文记录基于 KernelPatch/APatch 框架开发 KPM 内核模块（ `kpm_selinux_filter` ）的完整过程：从 inline hook 方案出发，经历 30 余次迭代、内核崩溃和诊断调试，最终采用 syscall 层拦截方案，以 5184 字节的轻量模块实现了对 DirtySepolicy 和 Duck Detector 的完全绕过。

* * *

## 1\. 技术基础

### 1.1 KernelPatch / APatch 框架

KernelPatch 是一个 ARM64 Linux 内核热补丁框架，通过在合法内核镜像的 `load_payload` 段注入自定义 kpimg 二进制实现内核级代码执行。APatch 是基于 KernelPatch 的 Android Root 方案，支持动态加载 KPM（Kernel Patch Module）模块。

KPM 使用裸机 ARM64 交叉编译器（ `aarch64-none-elf-gcc` ）编译为可重定位 ELF 对象（`.kpm` ），由 kpimg 内置的模块加载器加载。生命周期通过特殊 ELF section 管理：

```c
KPM_NAME("module-name");
KPM_VERSION("1.0.0");
KPM_LICENSE("GPL");
KPM_INIT(init_function);   // section ".kpm.init"
KPM_EXIT(exit_function);   // section ".kpm.exit"
```

### 1.2 Hook 机制

KernelPatch 提供两种 hook 机制：

| 机制  | API | 原理  | 风险  |
| --- | --- | --- | --- |
| Inline Hook | `hook_wrapN()` | 修改目标函数指令序言，跳转到 trampoline | 修改代码，可能崩溃 |
| FP Hook | `fp_hook_syscalln()` | 替换 `sys_call_table` 中的函数指针 | 仅改一个指针，安全 |

两种 hook 均支持 before/after 回调，回调可修改参数（ `args->argN` ）、返回值（ `args->ret` ）或跳过原函数（ `args->skip_origin=1` ）。

内核符号通过 kfunc 机制按需解析。 **关键约定** ： `kfunc_def(name)` 声明不可加 `extern` ，否则编译器只生成声明不分配存储，`.kpm` 中符号标记为 `*UND*` ，KPatch 加载器报 `unknown symbol` 。

```c
// ❌ 错误 — extern 导致 *UND*，加载失败
extern int kfunc_def(strncpy_from_user)(...);

// ✅ 正确 — tentative definition → .bss，加载正常
int kfunc_def(strncpy_from_user)(...);
```

### 1.3 检测原理

DirtySepolicy 和 Duck Detector 利用 Android App Zygote 进程（ `u:r:app_zygote:s0` ）在 `doPreload()` 阶段的 SELinux 查询权限，通过以下方式探测注入的 sepolicy 规则：

| 检测方式 | 接口  | 检测内容 |
| --- | --- | --- |
| checkSELinuxAccess | Java API `SELinux.checkSELinuxAccess()` | 查询如 `untrusted_app → magisk:s0` 等规则是否 allow |
| contextExists | 写 `/proc/self/attr/current` 或 `/sys/fs/selinux/context` | 验证敏感 context（如 `u:r:magisk:s0` ）是否存在 |

规则示例：

```python
untrusted_app → magisk:s0          binder call       → Magisk 检测
untrusted_app → ksu_file:s0        file read         → KernelSU 检测
untrusted_app → lsposed_file:s0    file read         → LSPosed 检测
```

上述两种检测方式最终都通过 **write syscall** 将检测字符串送入内核——这是本方案的核心立足点。

* * *

## 2\. 方案探索

### 2.1 Inline Hook 尝试（v1.0–v2.5）

最初方案与同类 KPM 思路一致：用 `hook_wrap` 挂接 SELinux 内核函数，在函数内部修改参数或返回值来过滤查询。

目标 hook 点：

-   `security_context_to_sid` — 拦截 context 解析（先于 AV 查询）
-   `security_compute_av_user` — 拦截 selinuxfs access 写入
-   `security_setprocattr` — 拦截 /proc/self/attr/current 写入

**结果：模块加载成功，hook 回调从未触发。** 原因：GKI 内核启用了 LTO（链接时优化）， `security_context_to_sid` 被内联到唯一调用者 `sel_write_access` 中。inline hook 替换了导出符号地址处的指令，但内核内部调用根本不经过该地址：

```python
sel_write_access() {
    // security_context_to_sid 被 LTO 内联展开 — inline hook 永远拦截不到
    rc = sidtab_context_to_sid(...);
    ...
}
```

### 2.2 崩溃诊断

除 LTO 绕过问题外，部分函数的 inline hook 直接导致内核 panic。通过二分法逐一验证：

| 版本  | hook 组合 | 行为  | 结果  |
| --- | --- | --- | --- |
| v2.3.1 | setprocattr only, 空 callback | \-  | ✅   |
| v2.3.2 | compute\_av\_user only, 空 callback | \-  | ✅   |
| v2.3.4 | 双 hook, pr\_info only | 只读日志 | ✅   |
| v2.3.5 | 双 hook, BEFORE, avd->allowed=0 + skip\_origin | 修改输出 | ❌ 崩溃 |
| v2.4.0 | 双 hook, BEFORE, argX=1 改写 | 修改输入 | ❌ 崩溃 |
| v2.4.2 | setprocattr only, BEFORE, arg3=0 | 单 hook, 改输入 | ✅   |
| v2.4.4 | compute\_av\_user only, BEFORE, arg 改写 | 单 hook, 改输入 | ❌ 崩溃 |

**结论** ：

-   `security_setprocattr` 的 BEFORE arg 修改是安全的——但被 LTO 绕过，无实际作用
-   `security_compute_av_user` 的任何修改（BEFORE/AFTER/arg/avd/ret/skip\_origin 全覆盖）均导致内核 panic，崩溃发生在 hook 首次被触发时（约 30–50ms 后）。即使只改 BEFORE 的 `args->arg0` 这种"无害"操作也会崩溃。空 callback 完全正常，排除 hook 安装错误。疑与 ARM64 非标准函数序言或 CFI 有关。

### 2.3 转向 Syscall 层（v3.0–v3.2）

两个问题叠加意味着 **inline hook 路线在 `5.4.210-qgki` 上完全走不通** 。于是转向 `fp_hook_syscalln` ——已被 draw-bypass、hideproc 等模块验证安全的函数指针替换机制。

先后 hook 了 openat / write / read / writev / ioctl，追踪检测进程的 syscall 行为。关键发现：

1.  **App Zygote 进程（通过 kfunc `security_task_getsecid` 获取 SID=2165 识别）的 openat/write/read 记录始终为 0** ——App Zygote 不在 syscall 层操作 selinuxfs
    
2.  **`strncpy_from_user_nofault` 在此 5.4 内核上不存在** ——kfunc 指针为 `0x0000000000000000` 。替代方案 `strncpy_from_user` （会睡眠的版本）可用，且 write syscall 本身运行在进程上下文，调用安全
    
3.  **替换为 `strncpy_from_user` 后，成功捕获检测流量** 。DirtySepolicy 最终通过普通 `write()` syscall（fd=65，即 `/sys/fs/selinux/` 下的文件）将检测字符串送入内核
    

```python
BLOCK #1 fd=65: 'u:r:shell:s0 u:r:su:s0 2 2'
BLOCK #3 fd=65: 'u:r:app_zygote:s0 u:r:adbroot:s0 2 800000'
BLOCK #7 fd=65: 'u:r:app_zygote:s0 u:r:magisk:s0 2 800000'
```

### 2.4 性能踩坑

v3.3.0 上线后系统卡死重启——原因是未过滤 `fd ≤ 2` （stdout/stderr），KPatch 自身的日志输出（包含 "magisk"/"ksu" 关键字）被拦截了 38000+ 次，导致 write syscall 大面积失败。

修复： `fd <= 2` 直接跳过，payload 限制在 10–800 字节。优化后系统稳定。

* * *

## 3\. 最终实现（v4.0.0）

### 3.1 架构

```python
┌─────────────────────────────────────────────────┐
│  Userspace                                       │
│  org.lsposed.dirtysepolicy (AppZygote preload)   │
│    │                                              │
│    │  write("u:r:magisk:s0\n", fd=65)           │
│    ▼                                              │
├─────────────────────────────────────────────────┤
│  Kernel                                          │
│    fp_hook_syscalln(__NR_write, ...)             │
│    │                                              │
│    │  before_write:                              │
│    │    1. fd ≤ 2 → skip                          │
│    │    2. count ∉ [10, 800] → skip               │
│    │    3. strncpy_from_user() → kbuf             │
│    │    4. find_dirty(kbuf) ?                     │
│    │       Y → skip_origin=1, ret=-EINVAL         │
│    │       N → pass through                       │
│    ▼                                              │
│    sys_write() → selinuxfs handler               │
│    (仅干净写入到达此层)                              │
└─────────────────────────────────────────────────┘
```

### 3.2 核心代码（5184 字节）

```c
static void before_write(hook_fargs4_t *args, void *udata) {
    unsigned int fd    = (unsigned int)syscall_argn(args, 0);
    const char __user *ubuf = (const char __user *)syscall_argn(args, 1);
    long long count    = (long long)syscall_argn(args, 2);
    char kbuf[1024];
    long copied;
    (void)udata;

    // 快速路径：fd≤2（stdin/out/err），count 异常 → 直接放行
    if (fd <= 2 || !ubuf || count < 10 || count > 800) return;
    if (!kfunc(strncpy_from_user)) return;

    copied = kfunc(strncpy_from_user)(kbuf, ubuf,
              (long)(count < 800 ? count : 800));
    if (copied <= 0) return;

    // 滑动窗口匹配脏 context → 拦截
    if (find_dirty(kbuf, (unsigned long)copied)) {
        args->skip_origin = 1;
        args->ret = -22; /* -EINVAL */
    }
}
```

### 3.3 脏 Context 列表

```c
static const char *dirty_ctx[] = {
    /* Magisk */
    "u:r:magisk:s0", "u:object_r:magisk_file:s0",
    /* KernelSU + variants */
    "u:r:ksu:s0", "u:object_r:ksu_file:s0",
    "u:object_r:ksu_exec:s0", "u:object_r:ksu_tmpfs:s0",
    "u:object_r:ksu_device:s0", "u:r:ksud:s0",
    "u:r:ksu_daemon:s0", "u:object_r:ksud_file:s0",
    "u:object_r:ksud_exec:s0", "u:object_r:ksud_tmpfs:s0",
    /* LSPosed/Xposed */
    "u:object_r:lsposed_file:s0", "u:object_r:xposed_data:s0",
    "u:object_r:xposed_file:s0",
    /* su / adb root */
    "u:r:su:s0", "u:r:adbroot:s0",
    /* Duck Detector specific */
    "u:r:droidspacesd:s0", "u:r:msd_daemon:s0", "u:r:msd_app:s0",
    "u:r:duckdetector_dirty_policy_sentinel:s0",
    /* Common injection artifacts */
    "u:object_r:tmpfs:s0", "u:object_r:adb_data_file:s0",
};
```

### 3.4 性能优化要点

| 优化  | 说明  | 效果  |
| --- | --- | --- |
| `fd ≤ 2` 过滤 | 跳过 stdin/stdout/stderr | 消除 >99% 扫描（之前 38K 次卡死） |
| `10 ≤ count ≤ 800` | 排除单字节和大型 I/O | 进一步精简 |
| 滑动窗口匹配 | 栈缓冲区原地搜索，零额外分配 | O(n×m)，n,m 均极小 |
| `fp_hook_syscalln` | 只改一个指针，不改代码 | 无副作用 |

* * *

## 4\. 方案对比

|     | 最初方案（inline hook） | 最终方案（syscall hook） |
| --- | --- | --- |
| **Hook 位置** | 内核 SELinux 函数（深处） | write syscall（用户态入口） |
| **Hook 数量** | 4–5 个函数 | 1 个 syscall |
| **Hook 机制** | `hook_wrap` （修改代码） | `fp_hook_syscalln` （改指针） |
| **过滤方式** | 修改 avd->allowed / 覆盖返回值 | 读 write buffer → 匹配字符串 → 返回 -EINVAL |
| **调用者识别** | 需预计算脏 SID、缓存 App Zygote SID | 无需——脏内容不论谁写都拦 |
| **状态管理** | 有状态（SID 缓存） | 无状态 |
| **模块大小** | ~14KB | 5184 字节 |
| **LTO 影响** | 回调不触发 | 不受影响 |
| **`compute_av_user` 修改** | 100% 崩溃 | 不涉及 |

最初方案在 `5.4.210-qgki` 上被放弃的原因：

1.  **`security_compute_av_user` 的任何修改都导致内核崩溃** ——BEFORE/AFTER/arg/avd/ret/skip\_origin 全覆盖验证，无一例外
2.  **LTO 内联使 hook 回调从不触发** —— `security_context_to_sid` 等函数安装成功，但 kallsyms 地址不是实际调用入口

而 syscall 方案可行的原因：DirtySepolicy 无论走什么内核路径，数据都必须通过 `write()` syscall 进入内核——在城门设卡，不受城里修路（LTO 内联）的影响。

**适用场景** ：LTO 不激进的较新内核（≥5.10）可考虑 inline hook 方案以获得更细粒度的调用者区分；5.4 或 LTO 激进的内核推荐 syscall 方案。

* * *

## 5\. 局限性

1.  **脏 context 列表需手动维护** ：新 Root 方案可能引入新 context
2.  **仅拦截 write syscall** ：若检测工具改用 `writev` 、 `pwrite64` 等，需扩展覆盖
3.  **不区分调用者** ：对所有进程一视同仁。但正常进程不会写脏 context，实际无影响
4.  **内核版本依赖** ： `strncpy_from_user` 在 5.4 可用； `_nofault` 变体需 5.10+

* * *

## 6\. 总结

通过 30 余次迭代，从 inline hook 到 syscall 层的完整迁移，最终以 5184 字节的轻量模块成功绕过 DirtySepolicy 和 Duck Detector 的全部 SELinux 检测项。

核心经验：

-   **Inline hook 在 LTO 内核上不可靠** ——导出符号不等于实际调用入口
-   **Syscall 层是最可靠的拦截点** ——函数指针替换（ `fp_hook_syscalln` ）比代码修改（ `hook_wrap` ）更安全
-   **kfunc 符号不可加 `extern`** ——必须让编译器分配.bss 空间
-   **性能即正确性** ——回调在每次 write 时触发，必须在第一个 `if` 过滤掉绝大多数调用
-   **日志也会被拦截** ——fd≤2 过滤不仅是性能优化，更是功能正确性保障

### 加载

```bash
cd kpms/kpm_selinux_filter && make
adb push kpm_selinux_filter.kpm /data/local/tmp/
# 通过 APatch App: KPM 模块管理 → 加载
```

* * *

## 参考

-   [KernelPatch](https://bbs.kanxue.com/elink@a91K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6T1L8h3q4^5x3e0t1I4i4K6u0r3d9$3g2J5L8X3g2D9f1r3q4@1j5$3R3%60.) — ARM64 Linux 内核热补丁框架
-   [DirtySepolicy](https://bbs.kanxue.com/elink@1a6K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6x3f1#2m8G2M7$3g2V1i4K6u0r3c8r3W2J5N6s2W2e0k6i4m8G2L8r3W2U0P5b7%60.%60.) — LSPosed 团队的 App Zygote SELinux 检测方案
-   [Duck Detector PR#22](https://bbs.kanxue.com/elink@eb5K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6W2L8s2c8S2N6X3W2F1k6g2\)9J5c8V1c8#2j5$3E0Q4x3X3c8p5k6i4c8W2j5%4c8G2M7W2\)9J5k6q4u0W2k6X3q4U0N6r3!0J5K9h3&6Y4i4K6u0r3M7s2g2D9L8q4\)9J5c8U0t1J5) — eltavine 的 SELinux context 有效性检测
-   [看雪论坛：Android Root 环境隐藏：SELinux 查询探测与对抗](https://bbs.kanxue.com/thread-291232-1.htm) — selinux-query-guard KPM 方案参考

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#程序开发](https://bbs.kanxue.com/forum-161-1-124.htm) [#系统相关](https://bbs.kanxue.com/forum-161-1-126.htm)
