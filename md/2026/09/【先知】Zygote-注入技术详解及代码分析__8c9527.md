---
title: 【先知】Zygote 注入技术详解及代码分析
source: https://xz.aliyun.com/news/92747
source_host: xz.aliyun.com
clip_date: 2026-09-01T14:56:13+08:00
trace_id: b261bfc0-0ab0-4304-87dd-11bf3bcaec0d
content_hash: 084239a2c09c2ff3465db7bca9b64837d108debe2ab29dfc45ad1f3c3e910cc6
status: synced
tags:
  - 先知
  - Android逆向
  - Hook
series: null
feed_source: 先知安全技术社区
ai_summary: 通过 ptrace 向 Zygote 注入 SO，借助 fork 继承让所有应用自动加载并执行 Hook，一次注入全局生效。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ce75244-d011-814b-a58f-f99143a19a58
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 ptrace 向 Zygote 注入 SO，借助 fork 继承让所有应用自动加载并执行 Hook，一次注入全局生效。
> 
> - **核心原理：** Zygote 是所有 Android 应用进程的父进程，利用 Linux fork 写时复制机制，向 Zygote 注入的 SO 会被随后 fork 的每个应用继承，无需逐个注入。
> - **注入流程：** 先用 ptrace 附加目标 Zygote；构造参数并远程调用 mmap 分配可执行内存；用 PTRACE_POKEDATA 写入包含 dlopen/dlsym 的 ARM shellcode；将 PC 指向 shellcode 执行；最后 munmap 释放内存并恢复原寄存器、detach。
> - **关键实现：** getRemoteSymbolAddress 按“本地符号相对偏移 + 远程模块基址”计算远程函数地址；shellcode 用 BLX 间接调用 dlopen/dlsym/dlclose/dlerror；成功时 R0=0，失败时调用 dlerror 并将错误串放 R2。
> - **实测验证：** 在 MIUI14、armeabi-v7a 设备上，用 `./loader 1180 /data/local/tmp/zygote/testSo.so log args` 注入 32 位 Zygote（PID 1180），测试 SO 出现在 `/proc/1180/maps` 中，注入成功。
> - **适配要点：** Android 5.0+ 要求 PIE，需在 Android.mk 加 -fPIE -pie；注入需 root 权限，SELinux 可能需临时关闭；32 位注入器只能注入 32 位 Zygote。

## 一、Zygote 注入的整体流程

### 1.1 核心原理

Zygote 是 Android 系统中所有应用进程的"祖先"，通过 fork() 机制派生新进程。向 Zygote 注入模块后，后续所有由 Zygote 生成（fork）出的应用进程都会继承该模块，实现向派生模块注入的效果。

Zygote 是一个至关重要的系统级进程。fork 是 Linux 操作系统中的进程复用技术。如果进程 A 执行 fork 操作生成进程 B，那么进程 B 在创建时便拥有和进程 A 完全相同的模块信息（内存空间副本）。Zygote 注入正是利用了这一特性——由于 Zygote 属于系统级进程，其注入方式更加隐蔽，功能也更加强大。

### 1.2 流程详解

|     |     |     |
| --- | --- | --- |  
| 步骤  | 操作  | 说明  |
| 1   | 注入器 → Zygote进程 | 通过 ptrace 等调试手段，将模块A（通常是SO库）注入到 Zygote 进程空间 |
| 2   | Zygote携带模块 | Zygote 进程现在带有模块A，处于待命状态 |
| 3   | 启动进程B | 当用户启动任意应用（进程B）时，Zygote 执行 fork() 创建新进程 |
| 4   | 继承机制 | 由于 Linux 的写时复制（COW）机制，进程B自然继承了 Zygote 的内存空间，包括模块A |
| 5   | 劫持控制权 | 模块A在进程B中执行初始化逻辑，Hook 关键函数，劫持进程控制权 |
| 6   | 归还控制权 | 模块A完成 Hook 布置后，将执行权交还给进程B的正常代码，应用无感知启动 |

**关键优势**：无需对每个应用单独注入，利用 Zygote 的父进程特性实现批量覆盖。

## 二、注入器代码解析

注入器实现流程：

### 2.1 主入口函数：main()

```c
int main(int argc, char **argv)
{
    pid_t targetPid=0;
    int ret=0, nSelinuxFlag=0, i=0;
    char *pszLibraryName=NULL;
    char injectArg[256]={0};
    FILE *fp=NULL;
    
    //权限检查
    if (isUserValid() != 0) {
        return -1;
    }
    
    //参数检查
    if (argc < 4) {
        LOGE("arg list min len is invalid\n");
        return -1;
    }
    
    //获取目标PID
    targetPid = atoi(argv[1]);
    if (targetPid <= 0) {
        LOGE("target pid invalid\n");
        return -1;
    }
    
    //检查是否已注入
    if (getModuleBase(targetPid, basename(argv[2])) != (void *)-1) {
        LOGE("you have inject this library to maps\n");
        return 0;
    }
    
    //处理SELinux
    checkSelinuxSystem();
    nSelinuxFlag = getSelinuxFlag();
    setSelinuxFlag(0);  // 临时关闭SELinux
    
    //构建注入参数
    for (i = 4; i < argc; i++) {
        strcat(injectArg, argv[i]);
        if (i == argc -1) break;
        strcat (injectArg, " ");
    }
    
    //执行注入
    ret = injectProcess(targetPid, argv[2], argv[3], injectArg);
    
    //记录注入信息
    snprintf(injectArg, 255, INJECT_MAPS_PATH, targetPid);
    fp = fopen(injectArg, "w+");
    if (fp != NULL) {
        dumpProcessMaps(targetPid, fp);
        fclose(fp);
    }
    
    //恢复SELinux
    setSelinuxFlag(nSelinuxFlag);
    
    return ret;
}
```

### 2.2 核心注入函数：injectProcess()

#### 附加与准备

```c
static int injectProcess(pid_t pid, char *libraryPath, char *entryFunctionName, char *functionArg) {
    // 1. 附加到目标进程
    if (Attach(pid) < 0) return -1;
    
    // 2. 保存原始寄存器状态
    ret = GetRegs(pid, &orignalRegisters);
    if (!ret) {
        memcpy(&usingRegisters, &orignalRegisters, sizeof(orignalRegisters));
        
        // 3. 获取关键函数地址
        libcHandler = dlopen(LIBC_PATH, RTLD_NOW);
        mmap_self_addr = dlsym(libcHandler, MMAP_NAME);
        mmap_remote_addr = getRemoteSymbolAddress(pid, LIBC_PATH, mmap_self_addr);
        
        // 4. 准备调用远程mmap
        usingRegisters.uregs[0] = 0; 
        usingRegisters.uregs[1] = 0x4000;
        usingRegisters.uregs[2] = PROT_EXEC | PROT_READ | PROT_WRITE;
        usingRegisters.uregs[3] = MAP_ANONYMOUS | MAP_PRIVATE;
        usingRegisters.uregs[15] = (long)mmap_remote_addr;
        
        // 5. 调用远程mmap
        ret = invokeRemoteSyscall(pid, &usingRegisters);
```

#### 远程内存分配

```c
        //获取mmap返回值（分配的内存地址）
        ret = GetRegs(pid, &usingRegisters);
        mmap_return = (void *)(usingRegisters.uregs[0]); // R0存放返回值
        LOGE("call remote mmap res:%p\n", mmap_return);
```

#### Shellcode准备与注入

```c
        //获取dl系列函数地址
        linkerHandler = dlopen(LIBDL_NAME, RTLD_NOW);
        dlopen_self_addr = dlsym(linkerHandler, "dlopen");
        dlopen_remote_addr = getRemoteSymbolAddress(pid, LINKER_PATH, dlopen_self_addr);
        
        //准备shellcode
        memcpy(shellcodeDataBuffer, &_inject_code_start, 
               (&_inject_code_end - &_inject_code_start) * sizeof(uint32_t));
        
        //替换shellcode中的地址为远程地址
        *(uint32_t*)(shellcodeDataBuffer+(&_dlopen_addr - &_inject_code_start)*sizeof(uint32_t)) 
            = (uint32_t)dlopen_remote_addr;
        
        //写入参数
        strncpy(shellcodeDataBuffer+(&_so_path_value - &_inject_code_start)*sizeof(uint32_t), 
                libraryPath, 255);
        strncpy(shellcodeDataBuffer+(&_so_init_func_value - &_inject_code_start)*sizeof(uint32_t), 
                entryFunctionName, 255);
        
        //保存原始寄存器到shellcode中
        *(uint32_t*)(shellcodeDataBuffer+(&_saved_cpsr_value - &_inject_code_start)*sizeof(uint32_t)) 
            = orignalRegisters.uregs[16];
        memcpy(shellcodeDataBuffer+(&_saved_r0_pc_value - &_inject_code_start)*sizeof(uint32_t), 
               &(orignalRegisters.uregs[0]), 16 * sizeof(long));
        
        //将shellcode写入远程进程
        while (shellcodeDataIndex < 0x400 / sizeof(uint32_t)) {
            ptrace(PTRACE_POKEDATA, pid, 
                   (void *)(usingRegisters.uregs[13]+shellcodeDataIndex * sizeof(uint32_t)),
                   (void *)*(uint32_t *)((uint32_t *)shellcodeDataBuffer+shellcodeDataIndex));
            shellcodeDataIndex++;
        }
```

#### 执行Shellcode

```c
        //设置PC指向shellcode
        usingRegisters.uregs[15] = usingRegisters.uregs[13];
        usingRegisters.uregs[16] &= ~CPSR_T_MASK;  // 设置ARM模式
        
        //执行shellcode
        ret = invokeRemoteShellcode(pid, &usingRegisters);
        
        //检查执行结果
        ret = GetRegs(pid, &usingRegisters);
        if ((int)(usingRegisters.uregs[1]) == 1) {
            // dlopen失败，读取错误信息
            uint32_t *err_msg = (uint32_t *) calloc(0x101, 1);
            // 从远程进程读取错误信息
            free(err_msg);
        }
```

#### 清理与恢复

```c
        //释放分配的内存
        usingRegisters.uregs[0] = (long)mmap_return;
        usingRegisters.uregs[1] = 0x4000;
        usingRegisters.uregs[15] = (long)munmap_remote_addr;
        ret = invokeRemoteSyscall(pid, &usingRegisters);
        
        //恢复原始寄存器
        if (ptrace(PTRACE_SETREGS, pid, NULL, &orignalRegisters) < 0) {
            LOGE("restore original registers failed:%s\n", strerror(errno));
        }
    }
    return Detach(pid);
}
```

### 2.3 关键辅助函数

#### 2.3.1 远程系统调用执行

```c
static int invokeRemoteSyscall(pid_t pid, struct pt_regs *regs) {
    // 设置寄存器
    ret = ptrace(PTRACE_SETREGS, pid, NULL, regs);
    
    // 执行系统调用
    ret = ptrace (PTRACE_SYSCALL, pid, NULL, NULL);
    WaitPid(pid, &waitStatus, 0);
    
    // 再次触发，等待系统调用完成
    ret = ptrace (PTRACE_SYSCALL, pid, NULL, NULL);
    WaitPid(pid, &waitStatus, 0);
    
    return ret;
}
```

#### 2.3.2 远程Shellcode执行

```c
static int invokeRemoteShellcode(pid_t pid, struct pt_regs *regs) {
    // 设置寄存器
    ret = ptrace(PTRACE_SETREGS, pid, NULL, regs);
    
    // 继续执行（shellcode）
    ret = ptrace(PTRACE_CONT, pid, NULL, NULL);
    
    // 等待shellcode执行完成
    ret = WaitPid(pid, &waitStatus, 0);
    
    return ret;
}
```

#### 2.3.3 获取远程函数地址

```c
void *getRemoteSymbolAddress(pid_t pid, char *moduleName, void *selfSymbolAddress) {
    // 获取本地模块基址
    void *selfModuleBase = getModuleBase(-1, moduleName);
    // 获取远程模块基址
    void *remoteModuleBase = getModuleBase(pid, moduleName);
    
    // 计算相对偏移
    return (selfSymbolAddress - selfModuleBase + remoteModuleBase);
}
```

## 三、Shellcode分析

### 3.1 Shellcode结构

Shellcode是一个位置无关代码（PIC），主要功能包括：

1.  调用dlopen加载目标SO库
2.  调用dlsym获取入口函数地址
3.  执行入口函数
4.  保存和恢复寄存器状态

ARM 模式下所有指令固定为 4 字节长度，便于计算偏移地址；同时避免了 Thumb 模式下指令长度变化带来的复杂性，确保 `BLX` 指令的地址计算准确性。

### 3.2 全局符号导出

```plain
.global _inject_code_start
.global _inject_code_end
.global _dlopen_param2
.global _saved_cpsr_value
.global _dlopen_addr, _dlsym_addr, _dlclose_addr, _dlerror_addr
.global _so_path_addr, _so_init_func_addr, _so_func_arg_addr, _saved_r0_pc_addr
.global _so_path_value, _so_init_func_value, _so_func_arg_value, _saved_r0_pc_value
```

**符号分类与用途**：

|     |     |     |
| --- | --- | --- |  
| 类别  | 符号  | 用途  |
| **边界标记** | `_inject_code_start` / `_inject_code_end` | 标记 Shellcode 代码段的起止，用于计算代码大小和复制完整代码 |
| **函数地址占位符** | `_dlopen_addr`, `_dlsym_addr`, `_dlclose_addr`, `_dlerror_addr` | 存放动态链接器函数的远程地址，由注入器在运行时填充 |
| **参数地址指针** | `_so_path_addr`, `_so_init_func_addr`, `_so_func_arg_addr` | 指向实际参数字符串的地址，运行时填充 |
| **上下文保存** | `_saved_cpsr_value`, `_saved_r0_pc_addr`, `_saved_r0_pc_value` | 保存原始寄存器和程序状态寄存器，用于无痕恢复 |
| **参数字符串存储** | `_so_path_value`, `_so_init_func_value`, `_so_func_arg_value` | 实际的字符串数据缓冲区（各 256 字节） |

### 3.3 代码段执行流程详解

#### 动态库加载（dlopen）

```plain
_inject_code_start:
    /* ---- dlopen(so_path, RTLD_NOW) ---- */
    LDR     R0, _so_path_addr          /* const char *filename */
    LDR     R1, _dlopen_param2         /* int flag (RTLD_NOW) */
    LDR     R3, _dlopen_addr
    BLX     R3
```

|     |     |     |
| --- | --- | --- |  
| 寄存器 | 值   | 说明  |
| R0  | `_so_path_addr` 指向的内容 | SO 库文件的完整路径字符串地址，符合 ARM ABI 第一个参数传递规则 |
| R1  | `0x2` (RTLD_NOW) | 立即解析所有未定义符号，确保库加载时所有依赖都已解析，避免延迟绑定带来的不确定性 |
| R3  | `_dlopen_addr` 指向的内容 | dlopen 函数在目标进程中的实际地址，通过注入器的地址计算获得 |
| LR  | 下一条指令地址 | `BLX` 指令自动设置，用于函数返回 |

**关键指令解析**：

-   `LDR R0, _so_path_addr` ：加载的是地址 `_so_path_addr` 处存储的 32 位值（即实际字符串地址），而非 `_so_path_addr` 本身。这实现了间接寻址，允许注入器灵活配置参数位置。
-   `BLX R3` ：带链接的跳转并切换指令集。虽然此处目标是 ARM 代码，但 `BLX` 会根据目标地址最低位自动判断指令集状态（ARM/Thumb），确保兼容性。

#### 错误处理与句柄保存

```plain
    /* save handle */
    MOV     R4, R0
    CMP     R4, #0
    BEQ     _dlopen_fail
```

**错误处理机制**：

-   `dlopen` 成功时返回库句柄（非零值），失败时返回 `NULL` （0）
-   使用 R4 保存句柄（被调用者保存寄存器，符合 ARM ABI，确保后续调用不会破坏该值）
-   `BEQ` （Branch if Equal）：当 Z 标志位设置时跳转，即 R4 == 0 时跳转到错误处理分支

#### 符号解析（dlsym）

```plain
    /* ---- dlsym(handle, entry_func) ---- */
    MOV     R0, R4
    LDR     R1, _so_init_func_addr
    LDR     R3, _dlsym_addr
    BLX     R3

    CMP     R0, #0
    BEQ     _cleanup
```

**参数传递**：

-   R0：库句柄（由 dlopen 返回）
-   R1：入口函数名字符串地址（如 `"JNI_OnLoad"` 或自定义函数名）
-   R3：dlsym 函数地址

**执行逻辑**：查找 SO 库中指定的初始化函数地址。若找不到（返回 NULL），跳转到 `_cleanup` 进行资源释放，但不视为致命错误。

#### 入口函数执行

```plain
    /* ---- call entry_func(arg) ---- */
    LDR     R1, _so_func_arg_addr
    BLX     R0

    /* R0 is entry_func return value (ignored or logged) */
```

**执行流程**：入口函数接收单个字符串参数，返回整型值。返回值留在 R0 中，但 Shellcode 不处理该返回值，由注入器通过后续 `GetRegs` 读取。

#### 资源清理（dlclose）

```plain
_cleanup:
    /* ---- dlclose(handle) ---- */
    MOV     R0, R4
    LDR     R3, _dlclose_addr
    BLX     R3

    /* success */
    MOV     R0, #0
    B       _exit
```

**资源管理策略**：

-   无论入口函数是否成功执行，都调用 `dlclose` 释放库句柄
-   这是 **设计上的关键选择**：Shellcode 执行完后立即卸载 SO，但 SO 中的代码可能已通过 Hook 等方式驻留在目标进程中
-   设置 R0 = 0 表示成功退出码

#### 错误处理分支（dlopen 失败）

```plain
_dlopen_fail:
    /* ---- dlerror() ---- */
    LDR     R3, _dlerror_addr
    BLX     R3

    /* R0 = char* error string */
    MOV     R2, R0          /* 给 injector 用 */
    MOV     R0, #-1         /* return code */
```

**错误机制**：

-   调用 `dlerror()` 获取最后一次动态链接错误的描述字符串
-   将错误字符串地址保存到 R2（便于注入器通过 `GetRegs` 读取后进一步读取远程内存）
-   设置 R0 = -1 作为错误返回码

### 3.4 上下文恢复与无痕退出

```plain
_exit:
    /* restore CPSR */
    LDR     R1, _saved_cpsr_value
    MSR     CPSR_fsxc, R1

    /* restore registers */
    LDR     R0, _saved_r0_pc_addr
    LDMIA   R0, {R0-R12, LR}

    /* restore PC (last saved word) */
    LDR     PC, [R0, #(15*4)]
```

**恢复流程的技术细节**：

恢复程序状态寄存器（CPSR），恢复通用寄存器，恢复程序计数器（PC）

```plain
LDR     PC, [R0, #(15*4)]          /* PC = [R0 + 60] */
```

从保存区域的第 15 个槽位（偏移 60 字节）加载返回地址到 PC，使用 `LDR` 而非 `MOV` 加载 PC，避免流水线影响。

## 四、注入流程总结

### 4.1 完整注入过程

```plain
Phase 1: 附加与准备
    ↓
    1. ptrace(PTRACE_ATTACH, zygote_pid)
    2. waitpid() 等待目标进程暂停
    3. ptrace(PTRACE_GETREGS) 获取寄存器状态
    4. 解析/proc/[pid]/maps获取函数地址
    ↓
Phase 2: 内存分配
    ↓
    5. 构造mmap调用参数
    6. ptrace(PTRACE_SETREGS) 设置寄存器
    7. ptrace(PTRACE_SYSCALL) 执行mmap
    8. ptrace(PTRACE_GETREGS) 获取分配的内存地址
    ↓
Phase 3: Shellcode注入
    ↓
    9. 准备shellcode（包含dlopen调用）
    10. ptrace(PTRACE_POKEDATA) 写入shellcode
    11. 设置PC指向shellcode入口
    12. ptrace(PTRACE_CONT) 执行shellcode
    13. waitpid() 等待shellcode执行完成
    ↓
Phase 4: 清理恢复
    ↓
    14. ptrace(PTRACE_SETREGS) 恢复原始寄存器
    15. 调用munmap释放内存
    16. ptrace(PTRACE_DETACH) 分离进程
```

## 五、测试环节

### 5.1 编译与兼容性说明

#### 5.1.1 PIE（位置无关可执行文件）要求

从 Android 5.0（API 21）开始，系统要求所有可执行文件必须是位置无关可执行文件（PIE）。非PIE的二进制文件将被系统拒绝执行。

旧版注入器（如2016年使用旧版NDK编译的 `loader` ）没有启用PIE标志，在Android 5.0及以上系统可能无法运行。需要使用新版NDK，并在编译时添加 `-pie -fPIE` 标志。

```makefile
LOCAL_PATH := $(call my-dir)

# 只编译 32 位 ARM（与so文件架构匹配）
APP_ABI := armeabi-v7a

include $(CLEAR_VARS)

LOCAL_MODULE := loader
LOCAL_SRC_FILES := loader.c shellcode.s ctools.c log.c
LOCAL_LDLIBS := -llog

LOCAL_ARM_MODE := arm
# 添加 PIE 支持（Android 5.0+ 必需）
LOCAL_CFLAGS += -fPIE -Wno-int-to-pointer-cast -Wno-pointer-to-int-cast
LOCAL_LDFLAGS += -pie

include $(BUILD_EXECUTABLE)
```

修改mk文件，重新执行ndk-build命令进行编译；

### 5.2 实际测试案例

#### 5.2.1 测试环境准备

**硬件/软件环境**：

-   设备：MIUI14
-   Android版本：Android21以上版本，需支持32位应用
-   架构：armeabi-v7a

**文件准备**：

-   `loader` ：注入器（32位ARM，非PIE）
-   `testSo.so` ：测试用SO库（32位ARM）

#### 5.2.2 文件推送与权限设置

```bash
# 推送文件到设备
adb push loader /data/local/tmp/zygote/
adb push testSo.so /data/local/tmp/zygote/

# 添加执行权限
adb shell
mondrian:/data/local/tmp/zygote $ chmod +x *

# 验证文件权限
mondrian:/data/local/tmp/zygote $ ls -l
total 36
-rwxrwxrwx 1 shell shell 22748 2016-03-17 15:23 loader
-rwxrwxrwx 1 shell shell  9356 2016-03-16 17:24 testSo.so
```

#### 5.2.3 进程与架构分析

```bash
# 查看Zygote进程
mondrian:/data/local/tmp/zygote # ps -A | grep -E "zygote|PID"
USER           PID  PPID     VSZ    RSS WCHAN            ADDR S NAME
root          1179     1 6441196  94016 do_sys_poll         0 S zygote64
root          1180     1 1799588  38476 do_sys_poll         0 S zygote
webview_zygote 4223 1179 6370468  54168 do_sys_poll         0 S webview_zygote

# 检查文件架构
mondrian:/data/local/tmp/zygote # file /data/local/tmp/zygote/testSo.so
/data/local/tmp/zygote/testSo.so: ELF shared object, 32-bit LSB arm, dynamic (/system/bin/linker), stripped
mondrian:/data/local/tmp/zygote # file /data/local/tmp/zygote/loader
/data/local/tmp/zygote/loader: ELF executable, 32-bit LSB arm, dynamic (/system/bin/linker), stripped
```

**关键发现**：

-   `loader` 和 `testSo.so` 都是 **32-bit ARM** 架构
-   设备上有两个Zygote进程：

-   `zygote64` (PID 1179)：64位Zygote
-   `zygote` (PID 1180)：32位Zygote

-   由于我们的注入器和测试库都是32位，只能注入到32位的Zygote（PID 1180）

#### 5.2.4 执行注入

```bash
# 执行注入
mondrian:/data/local/tmp/zygote # ./loader 1180 /data/local/tmp/zygote/testSo.so log args
```

#### 5.2.5 监控日志输出

```bash
# 查看注入日志
adb logcat -s debug
```

**成功注入的输出**：

```bash
#示例输出
02-02 17:54:24.182 10603 10603 E debug   : inject arg:args
02-02 17:54:24.185 10603 10603 E debug   : attch pass
02-02 17:54:24.187 10603 10603 E debug   : call remote mmap res:0xecf03000
02-02 17:54:24.210  1180  1180 D debug   : Where am I?__from pid:1180
02-02 17:54:24.210 10603 10603 E debug   : call remote shellcode res:2
02-02 17:54:24.215 10603 10603 E debug   : inject finish
```

#### 5.2.6 验证注入结果

```bash
# 检查Zygote进程maps中是否包含testSo.so
mondrian:/data/local/tmp/zygote # cat /proc/1180/maps | grep testSo
d4f4f000-d4f50000 r-xp 00000000 fe:2a 91336                              /data/local/tmp/zygote/testSo.so
d4f50000-d4f51000 r--p 00000000 fe:2a 91336                              /data/local/tmp/zygote/testSo.so
```

**验证结果**：

1.  注入成功：testSo.so已加载到Zygote进程内存空间
2.  权限正确：代码段（r-xp）和只读数据段（r--p）权限设置正确
3.  地址分配：系统在d4f4f000-d4f51000地址范围分配了内存

#### 常见问题排查

|     |     |     |
| --- | --- | --- |  
| 问题  | 可能原因 | 解决方案 |
| 权限拒绝 | 非root权限运行 | 使用su命令执行 |
| 进程不存在 | PID错误 | 确认Zygote进程ID |
| 注入失败 | SELinux限制 | 临时关闭SELinux |
| 库未加载 | 路径错误 | 确认SO库路径 |
| 崩溃重启 | Hook冲突 | 检查Hook代码 |
| 无日志输出 | 日志级别 | 检查logcat过滤器 |
| 非PIE错误 | Android 5.0+ | 重新编译启用PIE |

## 六、总结

Zygote注入是一种强大的Android系统级Hook技术，通过利用Linux的进程fork机制和ptrace调试接口，实现了一次注入全局生效的效果。
