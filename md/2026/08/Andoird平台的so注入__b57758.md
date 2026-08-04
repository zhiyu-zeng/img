---
title: Andoird平台的so注入
source: https://yuuki.cool/posts/injectso/injectso/
source_host: yuuki.cool
clip_date: 2026-08-04T10:40:12+08:00
trace_id: 650b2239-76cd-4c19-9c48-78090b61d469
content_hash: 6119853a55a5b35beb4823a58ac6a56e5131c5a41082207c90ed2ae75f44f5a8
status: synced
tags:
  - Android逆向
  - Hook
series: null
feed_source: Yuuki·移动安全
ai_summary: 通过 ptrace 远程调用目标进程的 dlopen，可以将自定义 so 注入到 Android 应用进程，核心环节包括寄存器劫持、地址计算、路径写入与 SELinux 模式切换。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-81e8-a7e7-d0f753488611
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 ptrace 远程调用目标进程的 dlopen，可以将自定义 so 注入到 Android 应用进程，核心环节包括寄存器劫持、地址计算、路径写入与 SELinux 模式切换。
> 
> - **注入本质：** 把自定义 so 加载到目标进程的地址空间，主流方式有注入 zygote（利用 fork 继承）或通过 ptrace 直接注入。
> - **远程调用原理：** 利用 ptrace 修改目标进程的 pc 与寄存器（ARM64 下参数通过 x0‑x7 传递），将 pc 设置为 dlopen 地址，让目标进程执行加载逻辑。
> - **函数地址获取：** 先在本进程 dlopen/dlsym 算出偏移，再叠加上目标模块基址（读取 /proc/{pid}/maps）；也可直接解析磁盘 ELF 获取偏移。
> - **内存写入与安全配置：** 远程调用 mmap 分配可写内存，用 PTRACE_POKEDATA 写入 so 路径；注入前将 SELinux 切为 permissive 模式（写入 /sys/fs/selinux/enforce）。
> - **痕迹残留：** attach 模式会在 maps 与 solist 中留下 so 路径，可通过随机文件名或自定义 linker 缓解，但 dlopen 仅允许加载特定目录下的 so。

前言：由于安卓的进程隔离机制，我们在hook或操作其他进程时，往往需要先把so注入到目标进程

## 0x01 什么是so注入

一句话概括下来就是 `把自己的so加载到目标进程的地址空间`

## 0x02 主流的注入方式

据我所知，目前只有两种：

1.  注入zygote进程
2.  通过ptrace直接注入目标进程

先来聊聊第一点吧，我们知道安卓中所有应用进程都 `fork` 自 `zygote` 进程，所以直接把so注入zygote进程，app在启动时会fork zygote，从而达到注入的目。那zygisk是如何注入进zygote进程的呢，其实也是通过 `ptrace` 哈哈哈。所以写zygisk模块可以轻松帮我们注入自己的so。同理，用xposed插件也可以，而且更简单。这里不细说，我们主要聊一聊第二种方式

## 0x03 如何使用ptrace注入so

既然要使用ptrace，那么我们就得先知道ptrace是什么东西

### 0x03.1 什么是ptrace

ptrace是Linux内核提供的一种进程跟踪和调试工具。通过ptrace，注入进程可以附加到目标进程，读取或修改其寄存器和内存状态。本项目利用PTRACE_ATTACH附加目标进程、PTRACE_GETREGSET和PTRACE_SETREGSET操作寄存器，以及PTRACE_PEEKDATA和PTRACE_POKEDATA读写内存，这些功能为我们后续远程调用目标进程里的函数奠定了基础

### 0x03.2 使用ptrace注入so

知道了ptrace是干什么的，现在就能来注入so了。既然要把自己的so塞到目标进程里，那么直接远程调用对应进程的dlopen加载我们自己的so不就好了吗~。这就是我们的终极目标了

#### 那我们就先来实现一下远程调用：

```rust
    bool ProcessUtils::SetupRemoteCall(RemoteCallContext* ctx, uint64_t func_addr,
                                       const std::vector<uint64_t>& args) {
        // 复制原始寄存器
        ctx->regs = ctx->orig_regs;

        // 设置栈指针 - 确保16字节对齐
        ctx->regs.sp = (ctx->orig_regs.sp - 0x100) & ~0xF;

        // 设置参数（ARM64前8个参数通过x0-x7传递）
        for (size_t i = 0; i < args.size() && i < 8; i++) {
            ctx->regs.regs[i] = args[i];
        }

        // 如果参数超过8个，需要压栈
        if (args.size() > 8) {
            MemoryUtils memory_utils;
            uint64_t stack_addr = ctx->regs.sp;
            for (size_t i = 8; i < args.size(); i++) {
                if (!memory_utils.WriteProcessMemory(ctx->pid, stack_addr, &args[i], sizeof(uint64_t))) {
                    LOGE("Failed to write stack argument %zu", i);
                    return false;
                }
                stack_addr += sizeof(uint64_t);
            }
        }

        // 设置PC指向目标函数
        ctx->regs.pc = func_addr;

        // 设置返回地址为0，这样函数返回时会触发SIGSEGV
        ctx->regs.regs[30] = 0;  // x30是链接寄存器(LR)

        LOGD("Setting up remote call: PC=0x%lx, SP=0x%lx", ctx->regs.pc, ctx->regs.sp);

        return SetRegisters(ctx->pid, &ctx->regs);
    }
```

原理就是通过设置pc(程序计数器)指向目标函数的地址。比如我们要远程调用dlopen，就得先拿到dlopen的地址，然后将参数写入对应寄存器，再修改pc指针指向dlopen的地址即可

#### 现在远程调用是解决了，该解决dlopen的地址问题了：

我们知道，内存中的函数地址是由基地址(函数所在的so的起始地址)+偏移地址(函数相对于so的偏移)确定的，而同一个so的函数在不同进程里和在磁盘中的偏移是一样的。所以我们有两种办法拿到函数的真实地址(准确来说是相对于so的偏移地址)

1.  直接解析磁盘文件，比如dlopen函数，我们可以解析磁盘里的libc.so，找到dlopen的偏移，然后加上基地址，就是真实地址了，即 target_real_addr = target_base + offset
2.  在自己的进程中dlopen目标函数所在的so，然后使用dlsym查找，但是这里dlsym查找到的是对应函数在自己进程的绝对地址，所以需要额外的计算，即 target_real_addr = dlsym_res - my_base + target_base，这种方式就无需解析elf了，更简单实用

获取基地址就没啥好说的了，用户层直接读/proc/{pid}/maps就行了

```rust
uint64_t ProcessUtils::GetModuleBase(pid_t pid, const std::string& module_name) {
        char maps_path[256];
        snprintf(maps_path, sizeof(maps_path), "/proc/%d/maps", pid);

        LOGD("GetModuleBase: pid=%d, module=%s", pid, module_name.c_str());

        std::ifstream maps(maps_path);
        if (!maps.is_open()) {
            LOGE("Failed to open %s: %s", maps_path, strerror(errno));
            return 0;
        }

        std::string line;
        bool found = false;
        while (std::getline(maps, line)) {
            if (line.find(module_name) != std::string::npos &&
                line.find(" r-xp ") != std::string::npos) {  // 只查找可执行段
                // 解析基址
                uint64_t base;
                if (sscanf(line.c_str(), "%lx", &base) == 1) {
                    maps.close();
                    LOGD("  Found module %s at base 0x%lx", module_name.c_str(), base);
                    LOGD("  Map line: %s", line.c_str());
                    return base;
                }
            }
        }

        maps.close();
        LOGD("  Module %s not found in process %d", module_name.c_str(), pid);
        return 0;
    }

```

```cpp
uint64_t Injector::GetRemoteAddress(pid_t pid, const std::string& module_name,
                                        const std::string& func_name) {
        LOGD("GetRemoteAddress: module=%s, function=%s", module_name.c_str(), func_name.c_str());

        // 获取目标进程中的模块基址
        uint64_t remote_base = process_utils_.GetModuleBase(pid, module_name);
        if (remote_base == 0) {
            LOGD("  Module %s not found in process %d", module_name.c_str(), pid);
            return 0;
        }

        // 获取本地进程中的模块基址
        uint64_t local_base = process_utils_.GetModuleBase(getpid(), module_name);
        if (local_base == 0) {
            LOGD("  Module %s not found in local process", module_name.c_str());

            // 对于loader模块，尝试动态加载
            if (module_name.find("yuuki_transit") != std::string::npos ||
                module_name == LOADER_PATH) {
                LOGD("  Trying to load loader module locally to get function offset");

                void* handle = dlopen(LOADER_PATH, RTLD_NOW | RTLD_LOCAL);
                if (handle) {
                    void* func = dlsym(handle, func_name.c_str());
                    if (func) {
                        // 再次获取本地基址
                        local_base = process_utils_.GetModuleBase(getpid(), "yuuki_transit.so");
                        if (local_base == 0) {
                            local_base = process_utils_.GetModuleBase(getpid(), LOADER_PATH);
                        }

                        if (local_base != 0) {
                            uint64_t offset = (uint64_t)func - local_base;
                            uint64_t remote_addr = remote_base + offset;
                            dlclose(handle);
                            LOGD("  Found %s at offset 0x%lx, remote addr: 0x%lx",
                                 func_name.c_str(), offset, remote_addr);
                            return remote_addr;
                        }
                    }
                    dlclose(handle);
                }
            }

            return 0;
        }
```

#### 写入so路径：

值得注意的是，我们在使用dlopen的时候需要传入so的路径，这个值是一个字符串，更准确的来讲，dlopen接收到的字符串的首地址。所以我们需要远程把so的路径写入到目标进程中。我们可以借助ptrace的PTRACE_POKEDATA实现写入，在此之前，我们得获取一块稳定已知的可写内存，所以还需要远程调用一次mmap，远程调用函数的逻辑和上面一样，直接用就行

```cpp
    bool MemoryUtils::WriteWord(pid_t pid, uint64_t addr, long value) {
        if (ptrace(PTRACE_POKEDATA, pid, addr, value) == -1) {
            LOGE("PTRACE_POKEDATA failed at 0x%lx: %s", addr, strerror(errno));
            return false;
        }
        return true;
    }
```

```cpp
    bool MemoryUtils::WriteProcessMemory(pid_t pid, uint64_t addr, const void* buf, size_t size) {
        LOGD("WriteProcessMemory: pid=%d, addr=0x%lx, size=%zu", pid, addr, size);

        const uint8_t* src = (const uint8_t*)buf;
        size_t remaining = size;

        while (remaining > 0) {
            size_t to_write = (remaining > sizeof(long)) ? sizeof(long) : remaining;

            long data = 0;
            if (to_write < sizeof(long)) {
                // 需要先读取原始数据，保持未修改的字节
                if (!ReadWord(pid, addr, &data)) {
                    LOGE("  Failed to read original data at 0x%lx", addr);
                    return false;
                }
            }

            memcpy(&data, src, to_write);

            if (!WriteWord(pid, addr, data)) {
                LOGE("  Failed to write at 0x%lx", addr);
                return false;
            }

            src += to_write;
            addr += to_write;
            remaining -= to_write;
        }

        LOGD("  Successfully wrote %zu bytes", size);
        return true;
    }
```

#### selinux模式切换：

这样主要的逻辑就全都实现了，剩下的就是处理selinux相关代码，通过修改 `/sys/fs/selinux/enforce` 文件的值实现enforce和permissive模式的切换

```cpp
    bool SELinuxUtils::SetEnforcing() {
        LOGI("Setting SELinux to enforcing mode");
        return SetEnforceStatus(1);
    }

    bool SELinuxUtils::SetPermissive() {
        LOGI("Setting SELinux to permissive mode");
        return SetEnforceStatus(0);
    }

    int SELinuxUtils::GetEnforceStatus() {
        LOGD("Checking SELinux enforce status...");

        std::ifstream enforce_file("/sys/fs/selinux/enforce");
        if (!enforce_file.is_open()) {
            LOGD("  /sys/fs/selinux/enforce not found, trying old path...");
            // 尝试旧路径
            enforce_file.open("/selinux/enforce");
            if (!enforce_file.is_open()) {
                LOGD("  SELinux appears to be disabled");
                return -1;
            }
        }

        int status;
        enforce_file >> status;
        enforce_file.close();

        LOGD("  SELinux enforce status: %d (%s)", status,
             status == 1 ? "enforcing" : status == 0 ? "permissive" : "unknown");

        return status;
    }

    bool SELinuxUtils::SetEnforceStatus(int status) {
        // 需要root权限
        int fd = open("/sys/fs/selinux/enforce", O_WRONLY);
        if (fd < 0) {
            // 尝试旧路径
            fd = open("/selinux/enforce", O_WRONLY);
            if (fd < 0) {
                LOGE("Failed to open SELinux enforce file: %s", strerror(errno));
                return false;
            }
        }

        char status_str[2];
        snprintf(status_str, sizeof(status_str), "%d", status);

        ssize_t written = write(fd, status_str, 1);
        close(fd);

        if (written != 1) {
            LOGE("Failed to write SELinux enforce status: %s", strerror(errno));
            return false;
        }

        LOGI("SELinux enforce status set to %d", status);
        return true;
    }
```

## 0x04 小结

这只是实现了最简单最基础的attach模式so注入，会留下痕迹，虽然痕迹不多，但是都比较致命，基本上有检测的app注入进去就会挂掉。spawn模式下一次再介绍吧，至于隐藏痕迹，我感觉用户层也没啥好隐藏的，Memory Remapping依然会带来新的检测点，处理solist和maps里注入so的路径完全可以通过自定义linker来加载规避掉，但这会带来较差的兼容性和比较大的工程量。最简单的就是进到内核层操作seq_file来处理maps里的信息，但是我感觉只要路径正常，so名称随机，maps和solist不处理也没啥问题，但是dlopen只能加载那几个路径下的so哈哈哈哈
