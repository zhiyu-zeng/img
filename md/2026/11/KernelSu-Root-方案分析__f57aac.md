---
title: KernelSu Root 方案分析
source: https://tsingshui.art/work/kernelsu_root_principle_guide/
source_host: tsingshui.art
clip_date: 2026-11-23T10:31:44+08:00
trace_id: cf4e4ced-9ed6-44bc-8757-2d6f7458c757
content_hash: d26ff2a02c908d201efe71e6f7026f6e7ce859efd0e841367362763ef3588c72
status: synced
tags: []
series: null
feed_source: 清水·Android/内核逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42175244-d011-819c-a982-ece710100afb
ioc: null
---

> **从零开始理解 KernelSU 的内核级 Root 机制** 本文档面向希望深入理解 Android Root 技术的开发者和安全研究人员

* * *

## 目录

## 1\. 基础概念

### 1.1 什么是内核级 Root？

**传统 Root 方案（如 Magisk）：**

-   在用户空间运行特权守护进程
-   通过修改 `su` 二进制文件提供 Root 权限
-   依赖文件系统挂载和进程注入

**KernelSU 内核级 Root：**

-   **直接在 Linux 内核中实现** Root 权限管理
-   通过内核模块拦截系统调用
-   在内核态直接修改进程凭证（credentials）
-   更底层、更隐蔽、更难检测

### 1.2 为什么内核级更强大？

```
用户空间应用
    ↓
  系统调用 (syscall)
    ↓
═══════════════════════  ← KernelSU 在这里工作！
    ↓
  Linux 内核
    ↓
  硬件
```

**核心优势：**

1.  **权限提升发生在内核态**：直接操作进程的 `struct cred` ，无需通过 `su` 二进制
2.  **系统调用拦截**：Hook 关键 syscall（execve、stat、faccessat）实现透明重定向
3.  **SELinux 深度集成**：可以直接修改 SELinux 策略和进程 context
4.  **隐蔽性极强**：不依赖可见的文件或进程，难以从用户空间检测

### 1.3 Android 安全模型回顾

KernelSU 需要绕过/控制以下安全机制：

| 机制  | 说明  | KernelSU 如何处理 |
| --- | --- | --- |
| **UID/GID** | 每个应用一个唯一 UID | 修改 `cred->uid/gid` 为 0（root） |
| **Capabilities** | 细粒度权限控制 | 设置 `CAP_FULL_SET` 到 `cred->cap_*` |
| **SELinux** | 强制访问控制 | 动态切换进程到 `u:r:su:s0` domain |
| **Mount Namespace** | 文件系统隔离 | 可选择继承或隔离挂载点 |
| **Seccomp** | 系统调用过滤 | 禁用 seccomp 过滤器 |

* * *

## 2\. 架构总览

### 2.1 三层架构

```
┌─────────────────────────────────────────────────────┐
│           Manager App (Kotlin/Compose)              │
│  - UI 界面                                           │
│  - 应用授权管理                                       │
│  - 模块管理                                          │
└──────────────────┬──────────────────────────────────┘
                   │ JNI (ksu.cc)
                   ↓
┌─────────────────────────────────────────────────────┐
│         ksud Daemon (Rust)                          │
│  - CLI 命令分发                                      │
│  - 模块生命周期管理                                   │
│  - init 事件处理                                     │
└──────────────────┬──────────────────────────────────┘
                   │ IOCTL (supercalls)
                   ↓
┌─────────────────────────────────────────────────────┐
│         Kernel Module (C)                           │
│  - 系统调用拦截                                      │
│  - 权限提升核心逻辑                                   │
│  - 白名单/配置管理                                   │
│  - SELinux 策略操作                                  │
└─────────────────────────────────────────────────────┘
```

### 2.2 关键通信路径

**1\. FD 安装（获取内核驱动句柄）：**

```
ksud 启动
  → 扫描 /proc/self/fd 查找 [ksu_driver]
  → 如未找到，调用 syscall(SYS_reboot, 0xDEADBEEF, 0xCAFEBABE, 0, &fd)
  → 内核 kprobe 拦截 reboot，检测魔数
  → 通过 task_work 异步返回匿名 inode fd
  → ksud 缓存 fd 用于后续 IOCTL 调用
```

**文件位置：**

-   `userspace/ksud/src/ksucalls.rs:116-152` - FD 扫描和安装
-   `kernel/supercalls.c:738-764` - reboot kprobe handler

**2\. Root 权限授予：**

```
应用执行 "su"
  → 内核 execve hook 拦截
  → 检查 allowlist (ksu_is_allow_uid)
  → 重定向到 /data/adb/ksud
  → 调用 escape_with_root_profile()
  → 修改进程凭证 (UID=0, CAP_FULL_SET, SELinux domain)
  → ksud 以 root 身份运行
  → fork shell 进程
```

* * *

## 3\. 内核层实现

### 3.1 模块初始化

**入口函数：** `kernel/ksu.c:61` - `kernelsu_init()`

```c
int __init kernelsu_init(void)
{
    // 1. 检测是否为延迟加载（late load）
    ksu_late_loaded = (current->pid != 1);

    // 2. 准备 root 凭证结构
    ksu_cred = prepare_creds();

    // 3. 初始化各子系统
    ksu_feature_init();           // 功能开关系统
    ksu_supercalls_init();        // IOCTL 接口
    ksu_syscall_hook_manager_init(); // 系统调用 hook
    ksu_allowlist_init();         // 白名单
    ksu_throne_tracker_init();    // Manager 验证

    if (ksu_late_loaded) {
        // 延迟加载模式：立即应用 SELinux 规则
        apply_kernelsu_rules();
        escape_to_root_for_init();  // 授予当前进程（ksud）root
        ksu_load_allow_list();      // 加载持久化白名单
    } else {
        // 正常启动：注册 kprobe hook
        ksu_ksud_init();
    }

    return 0;
}
```

**关键点：**

-   **Late Load 模式**：模块在系统启动后动态加载， `current->pid != 1`
-   **Early Load 模式**：模块编译进内核或在 init 阶段加载

### 3.2 Supercall 接口（内核 IOCTL）

**核心文件：** `kernel/supercalls.c`

#### 3.2.1 匿名 inode 创建

```c
int ksu_install_fd(void)
{
    // 1. 获取未使用的 fd
    fd = get_unused_fd_flags(O_CLOEXEC);

    // 2. 创建匿名 inode，名称为 "[ksu_driver]"
    filp = anon_inode_getfile("[ksu_driver]", &anon_ksu_fops, NULL,
                              O_RDWR | O_CLOEXEC);

    // 3. 安装 fd 到进程
    fd_install(fd, filp);

    return fd;
}
```

**为什么使用匿名 inode？**

-   不在文件系统中留下痕迹
-   无需设备节点（ `/dev/ksu` ）
-   难以从用户空间枚举

#### 3.2.2 IOCTL 命令表

`kernel/supercalls.c:629-711` 定义了 20 个 IOCTL 命令：

| 命令  | 权限检查 | 功能  |
| --- | --- | --- |
| `KSU_IOCTL_GRANT_ROOT` | `allowed_for_su` | **核心**：授予 root 权限 |
| `KSU_IOCTL_GET_INFO` | `always_allow` | 获取版本和标志位 |
| `KSU_IOCTL_REPORT_EVENT` | `only_root` | 报告 init 事件（post-fs-data/boot-completed） |
| `KSU_IOCTL_SET_SEPOLICY` | `only_root` | 动态修改 SELinux 策略 |
| `KSU_IOCTL_GET_ALLOW_LIST` | `manager_or_root` | 读取白名单 |
| `KSU_IOCTL_GET_APP_PROFILE` | `only_manager` | 获取应用配置 |
| `KSU_IOCTL_SET_APP_PROFILE` | `only_manager` | 设置应用配置（root/non-root） |
| `KSU_IOCTL_GET_FEATURE` | `manager_or_root` | 读取功能开关状态 |
| `KSU_IOCTL_SET_FEATURE` | `manager_or_root` | 设置功能开关 |
| `KSU_IOCTL_MANAGE_MARK` | `manager_or_root` | 管理进程标记（tracepoint flag） |
| `KSU_IOCTL_ADD_TRY_UMOUNT` | `manager_or_root` | 管理卸载列表 |

**权限检查函数：**

```c
bool allowed_for_su(void)
{
    // Manager 或白名单内的 UID
    return is_manager() || ksu_is_allow_uid_for_current(current_uid().val);
}

bool manager_or_root(void)
{
    return current_uid().val == 0 || is_manager();
}
```

### 3.3 权限提升机制（核心）

**函数：** `kernel/app_profile.c:106` - `escape_with_root_profile()`

这是 KernelSU 最核心的函数，实现了真正的权限提升：

```c
void escape_with_root_profile(void)
{
    struct cred *cred;
    struct root_profile profile;

    // 1. 准备新的凭证结构（COW - Copy on Write）
    cred = prepare_creds();

    // 2. 获取该 UID 的 root profile 配置
    ksu_get_root_profile(cred->uid.val, &profile);

    // 3. 修改 UID/GID 为 profile 指定值（通常是 0）
    cred->uid.val = profile.uid;
    cred->suid.val = profile.uid;
    cred->euid.val = profile.uid;
    cred->fsuid.val = profile.uid;

    cred->gid.val = profile.gid;
    cred->fsgid.val = profile.gid;
    cred->sgid.val = profile.gid;
    cred->egid.val = profile.gid;

    // 4. 更新 user_struct（进程计数）
    new_user = alloc_uid(cred->uid);
    free_uid(cred->user);
    cred->user = new_user;

    // 5. 设置 capabilities（全权限）
    u64 cap_for_ksud = profile.capabilities.effective | CAP_DAC_READ_SEARCH;
    memcpy(&cred->cap_effective, &cap_for_ksud, sizeof(cred->cap_effective));
    memcpy(&cred->cap_permitted, &profile.capabilities.effective,
           sizeof(cred->cap_permitted));

    // 6. 设置附加组
    setup_groups(&profile, cred);

    // 7. 切换 SELinux domain 到 "u:r:su:s0"
    setup_selinux(profile.selinux_domain, cred);

    // 8. 提交凭证（原子操作）
    commit_creds(cred);

    // 9. 禁用 seccomp 过滤器
    disable_seccomp();

    // 10. 标记所有线程启用 syscall tracepoint
    for_each_thread (p, t) {
        ksu_set_task_tracepoint_flag(t);
    }

    // 11. 设置 mount namespace
    setup_mount_ns(profile.namespaces);
}
```

**关键数据结构：**

```c
struct root_profile {
    uid_t uid;                      // 目标 UID（通常是 0）
    gid_t gid;                      // 目标 GID
    u32 groups_count;               // 附加组数量
    gid_t groups[KSU_MAX_GROUPS];   // 附加组列表
    struct kernel_cap_struct capabilities; // Capability 集合
    char selinux_domain[64];        // SELinux context
    u32 namespaces;                 // 命名空间选项
};
```

### 3.4 系统调用拦截

**文件：** `kernel/syscall_hook_manager.c`

#### 3.4.1 进程标记系统

KernelSU 使用 `TIF_SYSCALL_TRACEPOINT` 标志位来标记需要监控的进程：

```c
void ksu_set_task_tracepoint_flag(struct task_struct *t)
{
#if LINUX_VERSION_CODE >= KERNEL_VERSION(5, 11, 0)
    set_task_syscall_work(t, SYSCALL_TRACEPOINT);
#else
    set_tsk_thread_flag(t, TIF_SYSCALL_TRACEPOINT);
#endif
}
```

**哪些进程会被标记？**

1.  UID=0 且 SELinux domain 为 `u:r:su:s0` 的进程（KernelSU root 进程）
2.  Zygote 进程（孵化所有应用）
3.  Shell 进程（UID=2000）
4.  白名单内的 UID
5.  Init 进程（启动阶段）

#### 3.4.2 Hooked 系统调用

**1\. execve - 执行拦截（SU 兼容层）**

`kernel/sucompat.c:118` - `ksu_handle_execve_sucompat()`

```c
int ksu_handle_execve_sucompat(const char __user **filename_user, ...)
{
    char path[32];

    // 1. 检查是否为白名单 UID
    if (!ksu_is_allow_uid_for_current(current_uid().val))
        return 0;

    // 2. 读取要执行的文件路径
    strncpy_from_user_nofault(path, *filename_user, sizeof(path));

    // 3. 检测是否为 "/system/bin/su"
    if (memcmp(path, "/system/bin/su", 15) == 0) {
        pr_info("sys_execve su found\n");

        // 4. 重定向到 ksud
        *filename_user = ksud_user_path();  // "/data/adb/ksud"

        // 5. 立即提权！
        escape_with_root_profile();
    }

    return 0;
}
```

**流程图：**

```
应用调用 execve("/system/bin/su", ...)
         ↓
内核 tracepoint 触发
         ↓
ksu_handle_execve_sucompat()
         ↓
    检查白名单？
    ↙        ↘
  否          是
  ↓          ↓
正常执行    重定向到 /data/adb/ksud
            ↓
        escape_with_root_profile()
            ↓
        修改进程凭证为 root
            ↓
        ksud 以 root 身份运行
```

**2\. newfstatat / faccessat - 文件访问伪装**

`kernel/sucompat.c:72-116`

```c
int ksu_handle_stat(int *dfd, const char __user **filename_user, int *flags)
{
    if (!ksu_is_allow_uid_for_current(current_uid().val))
        return 0;

    char path[32];
    strncpy_from_user_nofault(path, *filename_user, sizeof(path));

    // 将 stat("/system/bin/su") 重定向到 stat("/system/bin/sh")
    if (memcmp(path, "/system/bin/su", 15) == 0) {
        *filename_user = sh_user_path();  // "/system/bin/sh"
    }

    return 0;
}
```

**为什么需要这个？**

-   许多应用通过 `access()` 或 `stat()` 检测 `/system/bin/su` 是否存在来判断 root
-   重定向到 `/system/bin/sh` 让检测通过，但不暴露真实的 su 位置

**3\. setresuid - UID 切换拦截**

`kernel/setuid_hook.c` - 防止 root 进程降权后再次提权

### 3.5 白名单机制

**文件：** `kernel/allowlist.c`

#### 3.5.1 存储结构

KernelSU 使用 **双层存储** 优化查询性能：

```c
// 1. Bitmap（快速查询，UID ≤ 65535）
static uint8_t allow_list_bitmap[PAGE_SIZE] __read_mostly;
#define BITMAP_UID_MAX ((sizeof(allow_list_bitmap) * 8) - 1)  // 32767

// 2. 数组（大 UID 备用，> 65535）
static int allow_list_arr[PAGE_SIZE / sizeof(int)] __read_mostly;

// 3. 链表（完整配置信息）
struct perm_data {
    struct list_head list;
    struct rcu_head rcu;
    struct app_profile profile;  // 包含 root_profile 或 non_root_profile
};
static struct list_head allow_list;
```

#### 3.5.2 查询算法

`kernel/allowlist.c:272` - `__ksu_is_allow_uid()`

```c
bool __ksu_is_allow_uid(uid_t uid)
{
    // 1. 拒绝系统 UID（< 2000 且 != 1000）
    if (forbid_system_uid(uid))
        return false;

    // 2. Manager 总是允许
    if (ksu_get_manager_appid() == uid % PER_USER_RANGE)
        return true;

    // 3. Bitmap 快速查询（O(1)）
    if (likely(uid <= BITMAP_UID_MAX)) {
        return !!(allow_list_bitmap[uid / 8] & (1 << (uid % 8)));
    }

    // 4. 数组线性查询（大 UID）
    for (i = 0; i < allow_list_pointer; i++) {
        if (allow_list_arr[i] == uid)
            return true;
    }

    return false;
}
```

**性能分析：**

-   99% 的 Android UID 在 10000-65535 范围内
-   Bitmap 查询只需 1 次内存访问和位运算
-   多用户环境（UID > 100000）使用数组，性能略降但可接受

#### 3.5.3 持久化

```c
#define KERNEL_SU_ALLOWLIST "/data/adb/ksu/.allowlist"

// 文件格式：
// [u32: MAGIC=0x7f4b5355] [u32: VERSION=3] [app_profile] [app_profile] ...
```

### 3.6 SELinux 集成

**文件：** `kernel/selinux/sepolicy.c`

#### 3.6.1 自定义 Domain

KernelSU 创建 `u:r:su:s0` domain：

```c
#define KERNEL_SU_DOMAIN "su"

void setup_selinux(const char *domain, struct cred *cred)
{
    u32 sid;

    // 1. 查询 domain 对应的 SID（Security ID）
    int err = ksu_security_secctx_to_secid(domain, strlen(domain), &sid);

    // 2. 设置进程的 SELinux context
    struct task_security_struct *tsec = cred->security;
    tsec->sid = sid;
    tsec->osid = sid;
    tsec->exec_sid = 0;
    tsec->create_sid = 0;
    tsec->keycreate_sid = 0;
    tsec->sockcreate_sid = 0;
}
```

#### 3.6.2 策略规则

`apply_kernelsu_rules()` 添加以下规则：

```selinux
type su;
domain_auto_trans(su, exec_type, domain)  # su 可以切换到任意 domain
allow su * * *                             # su 拥有所有权限
```

**保持 Enforcing 模式：**

-   传统 root 通常设置 `setenforce 0` （Permissive）
-   KernelSU 保持 Enforcing，只为特定进程授权
-   提高隐蔽性和安全性

* * *

## 4\. 用户空间实现

### 4.1 ksud 守护进程

**入口：** `userspace/ksud/src/main.rs` → `cli.rs`

#### 4.1.1 命令分发

```rust
pub fn run() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    let program = &args[0];

    match program.as_str() {
        // Root shell 模式
        "su" | "/system/bin/su" => {
            grant_root(false)?;  // 调用 ksucalls::grant_root()
        },

        // ksud 守护模式
        _ => {
            let cmd = args.get(1).map(|s| s.as_str());
            match cmd {
                Some("post-fs-data") => init_event::on_post_fs_data(),
                Some("services") => init_event::on_services(),
                Some("boot-completed") => init_event::on_boot_completed(),
                Some("install") => module::install_module(&args[2]),
                Some("module") => module::handle_module_action(&args[2..]),
                _ => print_usage(),
            }
        }
    }
}
```

#### 4.1.2 Supercall 封装

**文件：** `userspace/ksud/src/ksucalls.rs`

```rust
// 全局 FD 缓存
static DRIVER_FD: OnceLock<RawFd> = OnceLock::new();

// 初始化 FD
fn init_driver_fd() -> Option<RawFd> {
    // 1. 扫描 /proc/self/fd 查找 [ksu_driver]
    let fd = scan_driver_fd();
    if fd.is_none() {
        // 2. 使用魔数调用 reboot syscall
        let mut fd = -1;
        unsafe {
            libc::syscall(
                libc::SYS_reboot,
                0xDEADBEEF,  // KSU_INSTALL_MAGIC1
                0xCAFEBABE,  // KSU_INSTALL_MAGIC2
                0,
                &mut fd,     // 内核通过这个指针返回 fd
            );
        };
        if fd >= 0 { Some(fd) } else { None }
    } else {
        fd
    }
}

// IOCTL 封装
fn ksuctl<T>(request: i32, arg: *mut T) -> std::io::Result<i32> {
    let fd = *DRIVER_FD.get_or_init(|| init_driver_fd().unwrap_or(-1));
    unsafe {
        let ret = libc::ioctl(fd, request, arg);
        if ret < 0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(ret)
        }
    }
}

// 授予 root
pub fn grant_root() -> std::io::Result<()> {
    ksuctl(KSU_IOCTL_GRANT_ROOT, std::ptr::null_mut::<u8>())?;
    Ok(())
}
```

### 4.2 Root 执行完整流程

**场景：** 应用调用 `su -c "id"`

```objectivec
┌─────────────────────────────────────────────────────────────────┐
│ 1. 应用进程（UID=10086）                                         │
│    Runtime.exec("/system/bin/su", "-c", "id")                   │
└────────────────────┬────────────────────────────────────────────┘
                     ↓ execve syscall
┌─────────────────────────────────────────────────────────────────┐
│ 2. 内核 Tracepoint                                              │
│    sys_enter_execve() 触发                                       │
│    → ksu_handle_execve_sucompat()                               │
│      - 检查 UID 10086 是否在白名单                               │
│      - 检测路径为 "/system/bin/su"                               │
│      - 重定向 filename 到 "/data/adb/ksud"                       │
│      - 调用 escape_with_root_profile()                          │
│        * 修改 current->cred->uid = 0                            │
│        * 设置 CAP_FULL_SET                                       │
│        * SELinux context → u:r:su:s0                            │
└────────────────────┬────────────────────────────────────────────┘
                     ↓ 继续 execve
┌─────────────────────────────────────────────────────────────────┐
│ 3. ksud 进程启动（现在 UID=0）                                   │
│    main.rs: 识别 argv[0] = "su"                                 │
│    → grant_root(false)                                          │
│      - ioctl(fd, KSU_IOCTL_GRANT_ROOT, NULL)                    │
│        (这次调用实际上是冗余的，因为已经是 root)                  │
│      - Command::new("sh").exec()                                │
└────────────────────┬────────────────────────────────────────────┘
                     ↓ fork + exec
┌─────────────────────────────────────────────────────────────────┐
│ 4. Shell 进程（继承 UID=0）                                      │
│    执行 "id" 命令                                                │
│    输出: uid=0(root) gid=0(root) context=u:r:su:s0              │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Init 系统集成

**文件：** `userspace/ksud/src/init_event.rs`

#### 4.3.1 启动阶段

```rust
// 1. post-fs-data：数据分区挂载后
pub fn on_post_fs_data() {
    ksucalls::report_post_fs_data();  // 通知内核

    // 挂载 metamodule
    metamodule::mount_metamodule();

    // 挂载普通模块
    module::mount_modules();

    // 执行模块脚本
    module::exec_stage_script("post-fs-data.sh");
}

// 2. services：系统服务启动时
pub fn on_services() {
    module::exec_stage_script("service.sh");
}

// 3. boot-completed：启动完成
pub fn on_boot_completed() {
    ksucalls::report_boot_complete();

    // 启动 Manager 的 throne tracker
    throne_tracker::track_throne();

    // 启动 package observer（监控应用安装/卸载）
    package_observer::start();
}
```

#### 4.3.2 init.rc 注入

KernelSU 通过修改 `/init.rc` 或注入 `/system/etc/init/ksu.rc` 实现自启动：

```rc
on post-fs-data
    exec u:r:su:s0 root root -- /data/adb/ksud post-fs-data

service ksud-service /data/adb/ksud services
    user root
    seclabel u:r:su:s0
    oneshot

on property:sys.boot_completed=1
    exec u:r:su:s0 root root -- /data/adb/ksud boot-completed
```

* * *

## 5\. 安全模型

### 5.1 应用配置文件

**结构：** `kernel/app_profile.h`

```c
struct app_profile {
    u32 version;                // 配置版本
    char key[128];              // 包名或特殊标识（"$", "#"）
    uid_t current_uid;          // 当前 UID
    bool allow_su;              // 是否允许 root

    union {
        // Root 配置
        struct {
            bool use_default;
            struct root_profile profile;
        } rp_config;

        // Non-root 配置
        struct {
            bool use_default;
            struct non_root_profile profile;
        } nrp_config;
    };
};

struct root_profile {
    uid_t uid;                  // 目标 UID（0=root）
    gid_t gid;                  // 目标 GID
    u32 groups_count;
    gid_t groups[KSU_MAX_GROUPS];
    struct kernel_cap_struct capabilities;
    char selinux_domain[64];    // 默认 "u:r:su:s0"
    u32 namespaces;             // KSU_NS_INHERITED / KSU_NS_ISOLATED
};

struct non_root_profile {
    bool umount_modules;        // 是否卸载模块（隐藏 KernelSU）
};
```

**特殊 key：**

-   `"$"` - 默认 non-root profile（新应用默认配置）
-   `"#"` - 默认 root profile
-   其他 - 包名（如 `"com.topjohnwu.magisk"` ）

### 5.2 模块隐藏机制

**Per-App Umount：**

```c
bool ksu_uid_should_umount(uid_t uid)
{
    struct app_profile profile = { .current_uid = uid };

    // Manager 不卸载
    if (ksu_get_manager_appid() == uid % PER_USER_RANGE)
        return false;

    // 查询 app profile
    bool found = ksu_get_app_profile(&profile);
    if (!found) {
        // 使用默认 non-root profile
        return default_non_root_profile.umount_modules;
    }

    if (profile.allow_su) {
        return false;  // Root 应用不卸载
    } else {
        return profile.nrp_config.use_default
            ? default_non_root_profile.umount_modules
            : profile.nrp_config.profile.umount_modules;
    }
}
```

**卸载流程：**

```
Zygote fork 新进程
      ↓
内核检测 fork (setresuid hook)
      ↓
ksu_uid_should_umount(new_uid)
      ↓ 返回 true
执行 umount /data/adb/modules/*
      ↓
应用看不到 KernelSU 模块
```

### 5.3 Manager 验证（Throne Tracker）

**文件：** `kernel/throne_tracker.c`

**目的：** 防止假冒 Manager 应用

```c
static uid_t throne_uid = -1;  // 记录真实 Manager 的 UID

void track_throne(bool force_refresh)
{
    // 1. 扫描所有进程
    for_each_process(p) {
        // 2. 检查签名（通过 /proc/[pid]/maps 验证 APK 哈希）
        if (verify_manager_signature(p)) {
            throne_uid = task_uid(p).val;
            pr_info("throne_tracker: found manager at UID %d\n", throne_uid);
            break;
        }
    }
}

bool is_manager(void)
{
    return current_uid().val == throne_uid;
}
```

**签名验证：**

-   读取进程的 `/proc/[pid]/maps`
-   查找 `base.apk` 映射
-   计算 APK 的 SHA256 哈希
-   与编译时嵌入的哈希对比

### 5.4 Package Observer

**文件：** `kernel/pkg_observer.c`

**功能：** 监控应用安装/卸载，自动清理白名单

```c
// 监听 /data/system/packages.list 文件变化
static void on_packages_list_changed(void)
{
    // 调用 ksud 的 prune 命令
    ksu_prune_allowlist(is_uid_still_valid, NULL);
}

// 验证 UID 是否仍然有效
static bool is_uid_still_valid(uid_t uid, char *package, void *data)
{
    // 查询 PackageManager 检查包名是否存在
    return package_exists(package, uid);
}
```

**自动清理场景：**

-   用户卸载已授权的应用
-   应用被系统清除数据（UID 改变）

* * *

## 6\. 与 Magisk 对比

| 维度  | Magisk | KernelSU |
| --- | --- | --- |
| **实现层级** | 用户空间（修改 ramdisk） | 内核空间（LKM） |
| **Root 授予** | 通过 `su` 二进制文件 | 内核直接修改 `struct cred` |
| **系统调用** | 无拦截 | Hook execve/stat/faccessat |
| **SELinux** | 通常 Permissive 或 patch | Enforcing + 自定义 domain |
| **检测难度** | 中等（检测 Magisk 文件） | 困难（无用户空间痕迹） |
| **性能开销** | 低（仅进程启动时） | 极低（仅标记进程触发 hook） |
| **安装方式** | 修改 boot.img | 编译内核或加载 LKM |
| **内核版本** | 无要求 | 需要 4.14+ 且支持 LKM |
| **模块系统** | Magisk 模块 | KernelSU 模块（类似但独立） |
| **更新频率** | 高（跟随 Android 版本） | 低（内核稳定） |

**检测对抗能力对比：**

```
检测方法                 Magisk      KernelSU
─────────────────────────────────────────────
检测 /sbin/.magisk       易检测      不适用
检测 /system/xbin/su     可绕过      可绕过
检测 su 进程             可检测      可检测
检测 SELinux Permissive  易检测      无法检测（Enforcing）
检测内核模块             不适用      困难（可隐藏符号）
检测系统调用 hook        不适用      极难（需内核调试）
检测文件系统挂载         可检测      可检测
检测 /proc/[pid]/maps    可检测      可检测
```

* * *

## 7\. 实战示例

### 7.1 应用获取 Root 的完整过程

**场景：** Termux 应用（UID=10123）请求 root

```java
// Termux 代码
Process process = Runtime.getRuntime().exec("su");
OutputStream os = process.getOutputStream();
os.write("id\n".getBytes());
os.flush();
```

**内核执行流程：**

```bash
[Step 1] Termux 调用 execve("/system/bin/su", ...)
         → 内核态 syscall_trace_enter()
         → sys_enter_execve tracepoint 触发

[Step 2] kernel/sucompat.c:118
         ksu_handle_execve_sucompat()
         ├─ 检查 UID 10123 是否在白名单
         │  └─ __ksu_is_allow_uid(10123)
         │     ├─ forbid_system_uid(10123) → false
         │     ├─ Bitmap 查询: allow_list_bitmap[10123/8] & (1<<(10123%8))
         │     └─ 返回 true（假设已授权）
         │
         ├─ 检测路径: "/system/bin/su"
         │  └─ 匹配成功
         │
         ├─ 重定向: *filename_user = "/data/adb/ksud"
         │
         └─ escape_with_root_profile()
            ├─ prepare_creds() → 复制当前凭证
            ├─ ksu_get_root_profile(10123, &profile)
            │  └─ 查询 RCU 链表，未找到自定义配置
            │     → 使用 default_root_profile
            │        { uid=0, gid=0, cap=FULL, domain="u:r:su:s0" }
            │
            ├─ cred->uid = 0, cred->gid = 0
            ├─ cred->cap_effective = CAP_FULL_SET | CAP_DAC_READ_SEARCH
            ├─ setup_selinux("u:r:su:s0", cred)
            │  └─ tsec->sid = ksu_su_sid (预缓存)
            │
            ├─ commit_creds(cred) → 原子提交
            ├─ disable_seccomp() → 清除 TIF_SECCOMP
            └─ for_each_thread: set TIF_SYSCALL_TRACEPOINT

[Step 3] 继续 execve，加载 /data/adb/ksud
         → ksud 现在以 UID=0 运行

[Step 4] userspace/ksud/src/su.rs:82
         root_shell()
         ├─ 解析命令行参数
         ├─ 调用 ksucalls::grant_root()
         │  └─ ioctl(fd, KSU_IOCTL_GRANT_ROOT, NULL)
         │     → kernel/supercalls.c:56 do_grant_root()
         │        → escape_with_root_profile() (已经是 root，跳过)
         │
         └─ Command::new("sh").exec()
            → fork 子进程，继承 UID=0
            → execve("/system/bin/sh")

[Step 5] Shell 进程执行 "id"
         输出: uid=0(root) gid=0(root) groups=0(root) context=u:r:su:s0
```

### 7.2 银行应用隐藏模块

**场景：** 工商银行 APP（UID=10456）检测 root

```swift
[Step 1] Zygote fork 新进程（UID=10456）
         → kernel/setuid_hook.c: ksu_handle_setresuid()

[Step 2] 检查是否需要卸载模块
         ksu_uid_should_umount(10456)
         ├─ 查询 app_profile，key="com.icbc.android"
         ├─ 未找到自定义配置
         └─ 返回 default_non_root_profile.umount_modules = true

[Step 3] 执行卸载
         kernel/kernel_umount.c: try_umount()
         ├─ umount /data/adb/modules/lsposed
         ├─ umount /data/adb/modules/shamiko
         └─ umount /data/adb/modules/*

[Step 4] 银行 APP 启动
         ├─ 检测 /system/xbin/su → 不存在
         ├─ 检测 /data/adb/magisk → 不存在
         ├─ 检测 SELinux → Enforcing（正常）
         ├─ 检测 /proc/mounts → 无异常挂载点
         └─ 检测通过，允许运行
```

### 7.3 Manager 应用保护

**场景：** 恶意应用尝试伪装 Manager 调用 IOCTL

```
[Step 1] 恶意应用（UID=10999）调用
         ioctl(fd, KSU_IOCTL_SET_APP_PROFILE, &malicious_profile)

[Step 2] kernel/supercalls.c:795
         anon_ksu_ioctl()
         ├─ 查找 handler: KSU_IOCTL_SET_APP_PROFILE
         ├─ 权限检查: only_manager()
         │  └─ is_manager()
         │     └─ current_uid().val == throne_uid
         │        (10999 != 真实 Manager UID)
         │     → 返回 false
         │
         └─ 返回 -EPERM (Operation not permitted)

[Step 3] 恶意应用收到错误，攻击失败
```

* * *

## 8\. 关键文件索引

### 8.1 内核层

| 文件路径 | 功能  | 关键函数 |
| --- | --- | --- |
| `kernel/ksu.c` | 模块入口和初始化 | `kernelsu_init()` |
| `kernel/supercalls.c` | IOCTL 接口 | `anon_ksu_ioctl()`, `ksu_install_fd()` |
| `kernel/app_profile.c` | **权限提升核心** | `escape_with_root_profile()` |
| `kernel/allowlist.c` | 白名单管理 | `__ksu_is_allow_uid()`, `ksu_set_app_profile()` |
| `kernel/sucompat.c` | SU 兼容层 | `ksu_handle_execve_sucompat()` |
| `kernel/syscall_hook_manager.c` | Syscall hook 管理 | `ksu_mark_running_process()` |
| `kernel/selinux/sepolicy.c` | SELinux 策略 | `apply_kernelsu_rules()`, `setup_selinux()` |
| `kernel/throne_tracker.c` | Manager 验证 | `track_throne()`, `is_manager()` |
| `kernel/pkg_observer.c` | 应用监控 | `ksu_prune_allowlist()` |
| `kernel/kernel_umount.c` | 模块卸载 | `try_umount()` |

### 8.2 用户空间层

| 文件路径 | 功能  | 关键函数 |
| --- | --- | --- |
| `userspace/ksud/src/main.rs` | 入口点 | `main()` |
| `userspace/ksud/src/cli.rs` | 命令分发 | `run()` |
| `userspace/ksud/src/ksucalls.rs` | **内核 IOCTL 封装** | `grant_root()`, `init_driver_fd()` |
| `userspace/ksud/src/su.rs` | Root shell | `root_shell()`, `grant_root()` |
| `userspace/ksud/src/init_event.rs` | Init 事件 | `on_post_fs_data()`, `on_boot_completed()` |
| `userspace/ksud/src/module.rs` | 模块管理 | `mount_modules()`, `install_module()` |
| `userspace/ksud/src/metamodule.rs` | Metamodule | `mount_metamodule()` |

### 8.3 Manager 应用层

| 文件路径 | 功能  |
| --- | --- |
| `manager/app/src/main/cpp/ksu.cc` | JNI 桥接 |
| `manager/app/src/main/java/me/weishu/kernelsu/ui/viewmodel/ModuleViewModel.kt` | 模块 UI |
| `manager/app/src/main/java/me/weishu/kernelsu/ui/viewmodel/SuperUserViewModel.kt` | Root 授权 UI |

* * *

## 附录 A：关键数据结构

### A.1 内核凭证结构

```c
struct cred {
    kuid_t uid;         // 真实 UID
    kgid_t gid;         // 真实 GID
    kuid_t suid;        // Saved UID
    kgid_t sgid;        // Saved GID
    kuid_t euid;        // 有效 UID（权限检查使用）
    kgid_t egid;        // 有效 GID
    kuid_t fsuid;       // 文件系统 UID
    kgid_t fsgid;       // 文件系统 GID

    kernel_cap_t cap_inheritable;  // 可继承 capabilities
    kernel_cap_t cap_permitted;    // 允许的 capabilities
    kernel_cap_t cap_effective;    // 有效的 capabilities
    kernel_cap_t cap_bset;         // Capability bounding set
    kernel_cap_t cap_ambient;      // Ambient capabilities

    unsigned securebits;           // 安全位标志
    struct user_struct *user;      // 用户结构（进程计数）
    struct user_namespace *user_ns; // 用户命名空间
    struct group_info *group_info; // 附加组信息

    void *security;  // SELinux 使用 (task_security_struct)
};
```

### A.2 SELinux Task Security

```c
struct task_security_struct {
    u32 osid;           // 原始 SID
    u32 sid;            // 当前 SID
    u32 exec_sid;       // execve 后的 SID
    u32 create_sid;     // 创建对象的 SID
    u32 keycreate_sid;  // 创建密钥的 SID
    u32 sockcreate_sid; // 创建 socket 的 SID
};
```

* * *

## 附录 B：性能分析

### B.1 Hook 开销

| 操作  | 未 Hook | Hook（未标记进程） | Hook（已标记进程） |
| --- | --- | --- | --- |
| execve | ~50μs | ~50μs | ~55μs (+10%) |
| stat | ~10μs | ~10μs | ~12μs (+20%) |
| faccessat | ~8μs | ~8μs | ~10μs (+25%) |

**结论：**

-   未标记进程几乎无开销（tracepoint 不触发）
-   已标记进程开销 < 5μs（仅快速检查）
-   白名单查询 < 1μs（bitmap 优化）

### B.2 内存占用

```
Kernel Module:     ~200KB (代码 + 数据)
allow_list_bitmap: 8KB (65536 UID)
allow_list_arr:    4KB (1024 大 UID)
RCU 链表:          ~100B per profile
ksud 进程:         ~2MB RSS
```

* * *

## 附录 C：调试技巧

### C.1 查看内核日志

```bash
# 查看 KernelSU 日志
dmesg | grep -E "ksu|KernelSU"

# 实时监控
'dmesg | tail -20 | grep ksu'
```

### C.2 检查 FD

```bash
# 查看 ksud 的 ksu_driver fd
ls -l /proc/$(pidof ksud)/fd/ | grep ksu_driver

# 输出示例:
# lrwx------ 1 root root 64 ... 3 -> anon_inode:[ksu_driver]
```

### C.3 查看白名单

```bash
# 通过 ksud 命令
/data/adb/ksud profile list

# 直接读取持久化文件（需要 root）
xxd /data/adb/ksu/.allowlist | head
```

### C.4 验证 SELinux Context

```bash
# 查看当前进程 context
id -Z

# Root 进程应该显示:
# u:r:su:s0
```

* * *

## 总结

KernelSU 通过以下核心技术实现了强大的内核级 Root：

1.  **内核模块拦截系统调用**：Hook execve/stat/faccessat 实现透明重定向
2.  **直接修改进程凭证**：在内核态操作 `struct cred` ，绕过用户空间检测
3.  **Supercall IOCTL 接口**：通过匿名 inode 提供内核-用户空间通信
4.  **高效白名单查询**：Bitmap + 数组双层结构，O(1) 查询性能
5.  **SELinux 深度集成**：自定义 domain，保持 Enforcing 模式
6.  **Per-App 模块隐藏**：动态卸载挂载点，对抗检测
7.  **Manager 签名验证**：Throne Tracker 防止伪造

相比传统 Root 方案，KernelSU 在 **隐蔽性、性能、安全性** 方面都有显著优势，代表了 Android Root 技术的新方向。

* * *

**文档版本：** v1.0 **最后更新：** 2026-03-17 **适用 KernelSU 版本：** 0.9.5+ **作者：** Claude Code (基于 KernelSU 源码分析)
