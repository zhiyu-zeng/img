---
title: 【看雪】Soapp：真机内目标 SO 重实现模拟器
source: https://bbs.kanxue.com/thread-293621.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-20T20:10:21+08:00
trace_id: 5712e554-95bc-40de-b733-8d06991c6371
content_hash: f74fb538403c1100d28a632ab6d11ae2859aae0f9672be2f1816afa574c8c322
status: synced
tags:
  - 看雪
  - Android逆向
  - 风控对抗
series: null
feed_source: 看雪·Android安全
ai_summary: Soapp 是一条“搬走身份而非搬走执行”的路线：把目标 SO 留在真机上原生运行，只为它伪造 App/设备身份视图，从而直接绕过针对模拟器的反仿真检测。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41e75244-d011-812f-9713-cbfc7e21f747
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Soapp 是一条“搬走身份而非搬走执行”的路线：把目标 SO 留在真机上原生运行，只为它伪造 App/设备身份视图，从而直接绕过针对模拟器的反仿真检测。
> 
> - **核心机制：** 为每个 so 实例构造假的 JNIEnv/JavaVM 函数表，表项指向生成的 ARM64 stub，按 TLS env 指针区分真假环境，Java 侧由 DvmSimulator 模拟对象世界。
> - **加载与多开：** 自研 ELF 加载器从 memfd/受控路径加载副本，soname 携带实例 id（如 `libtiny_2.so`）实现同进程多副本，并修补 solist/soload 使 `dl_iterate_phdr` 与 `/proc/self/maps` 自洽。
> - **双层 syscall 拦截：** 符号级 inline hook 之外叠加 seccomp RET_TRAP，内核态判定号区间，裸 `svc #0` 也无法绕过；文件域五类快照规则下沉 C，高频 maps/status 读取不经过 JVM。
> - **验证结果：** libtiny 对小红书线上接口 6/6 端点 HTTP 200，产出可用于生产验证的 `x-mini` 系列与 Shield 签名，init opcode 序列与真品逐 opcode 等价。
> - **相对 unidbg 的关键差异：** 真内核真硬件使 unicorn 计时特征、假内核行为、性能慢 1~2 个数量级、传感器空列表、TEE 信任链等检测点天然为真；部署单元是两百元二手安卓机而非模拟器池。其短板是缺少桌面级 IDA trace 调试、零硬件启动成本与确定性快照。

> 与 unidbg 同源异构的设备风控 SDK 仿真方案

## 一、这个项目是什么

Soapp 是一个运行在 **真实 Android 手机** 上的逆向仿真工程。它把so库从 App 里剥离出来，放进一个独立应用中 **原生运行**，并为它伪造出"我正运行在真机上的 App 里"的全部环境视图。当前尚未开源，很多地方还有改进的空间。

运行效果： `libtiny.so` 在完全不知情的前提下，为宿主 App 产出 **生产环境可验证的真实签名**——对小红书线上接口直接发起请求，6/6 端点 HTTP 200 通过，包括 `x-mini` 系列签名头（iid/sid/timestamp/sign/x-mini-\*）与 Shield 全链路签名（ `XYAAAA...`），签名上下文初始化序列（4 步 init opcode + L62/L63/L64/L68 收尾链）与真品行为逐 opcode 等价。

一句话定位： **Soapp 把 so 留在真机上进行模拟运行。**  
附上最新运行小红书的截图，全部签名都可以正常签出。  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e41ea237844159b7.webp)  
运行在手机上面的截图。  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53e30a20021899a6.webp)

## 二、整体架构

```python
┌─────────────────────────── Java 层 ───────────────────────────┐
│  engine/Engine          通用引擎：SPI 编排、多实例注册表、生命周期  │
│  spi/ 五接口             TargetConfig / TargetRules /           │
│                         TargetJniStubs / TargetDeviceProfile /  │
│                         TargetLauncher —— 换 so = 换一个 Target  │
│  targets/xhs/           XhsTarget + R7 opcode 映射（JSON 资源）  │
│  plugin/Tiny            JNI 仿真驱动：opcode 分发、采集、签名回调  │
│  jniproxy/              JNI 拦截层：fakeEnv/fakeVm 函数表、       │
│                         ARM64 stub 生成器、DvmSimulator 对象模型 │
│  core/elfloader/        自研加载器：memfd 加载、实例化 soname、    │
│                         solist 协议补丁、linker hook             │
│  web/                   调用so库方法的 HTTP 服务（会话式签名 API）        │
├─────────────────────────── C 层 ──────────────────────────────┤
│  seccomp_filter         RET_TRAP 号集（内核态拦截，raw svc 不可绕）│
│  syscall_trap + 8 TU    SIGSYS handler：文件域快照决策、ptrace/    │
│                         ioctl/connect 快路径、fd 代理数据面、      │
│                         phdr 改写、netlink 清洗、属性伪 prop_info  │
└───────────────────────────────────────────────────────────────┘
```

### 关键机制

1.  **JNI 拦截层**：为每个 so 实例构造假的 `JNIEnv` / `JavaVM` 函数表，表项指向生成的 ARM64 stub；stub 按 TLS 中的 env 指针区分"so 请求的是假环境"，上桥 Java 侧 `DvmSimulator` 完成对象模拟。so 读设备信息、查包名、反射调用，全部落在可编程的假 Java 世界上。
    
2.  **自研 ELF 加载器（dl_ext）**：绕过系统 linker 命名空间隔离，从 memfd/受控路径加载 so 副本；soname 携带实例 id（ `libtiny_2.so` ）实现同进程多副本共存；直接修补 solist/soload 协议让 `dl_iterate_phdr` 、 `/proc/self/maps` 视图自洽。
    
3.  **双保险 syscall 拦截**：符号级 inline hook（openat/stat/property/connect 等）+ 内核级 seccomp RET_TRAP（ `syscall()` 包装与裸 `svc #0` 都命中）。libtiny 大量使用裸 svc 反 hook，纯 inline hook 方案会漏；seccomp 在内核态判号区间，无法被用户态代码绕过。
    
4.  **文件域决策下沉 C**：伪文件规则（内容/重定向/目录映射/拒绝/链接改写五类快照表）下发进 C 全局表，SIGSYS handler 上下文 **直接决策返回，不经过 JVM**——高频 syscall（每秒数千次的 maps/status 读取）零 Java 往返；低频动态规则才回 Java worker 兜底。
    
5.  **真多开**：全链路去 static 化（Engine 注册表、per-instance 规则表/fd 表/DvmSimulator、TLS 实例路由），同一进程可并行运行 N 份完全隔离的 so 实例。
    

## 三、与 unidbg 的异曲同工

本项目早期直接参考过 unidbg 的实现（init opcode 序列即取自 unidbg 参考工程 `Libs.java` ），两者在设计语言上有大量同构概念：

| 概念  | unidbg | Soapp |
| --- | --- | --- |
| JVM 仿真 | `AbstractVM` / `DalvikVM64` | `DvmSimulator` |
| Java 值对象 | `DvmClass/DvmMethod/DvmObject/DvmField` | 同名同形（直接建模自 unidbg） |
| 参数编解码 | `Shorty` / `VaList` | `Shorty` / `JniArgs` （AAPCS64 va_list 解析） |
| native 方法分发 | `d1.d(int, Object[])` switch | `dispatchOpcode(long, Object[])` switch |
| 符号 hook | `HookListener` / `emulator.hook_add_new` | `SymbolHookRegistry` + `InstallableListener` （注释明言"对齐 unidbg HookListener 模式"） |
| 系统调用模拟 | `LinuxSyscall` 族 + `Svc` handler | `SyscallTrap` + `FileHook` 决策链 |
| 伪文件系统 | 手工挂 `/proc/stat` 、 `/proc/self/maps` 内容 | `MockFileSystem` + C 快照表 |
| poll/epoll | `IOMultiplexer` | poll 快路径（C 直通） |
| 设备画像 | `SystemInfo` / 手工 patch 点 | `TargetDeviceProfile` SPI |

理念上更是同源： **都不运行真 App，只把目标 native 库单独抠出来，喂给它一个可编程的"Android 假象"，榨取它的输出（签名/加密结果）**。函数级劫持、按需实现 JNI 回调、未处理调用打日志渐进补全——工作方法是同一套。

## 四、unidbg 做不到、本项目可以做到的

根本差异只有一条： **unidbg 的"Android"是 Java 写的用户态模拟器（unicorn/CAPSTONE 翻译执行 ARM 指令），Soapp 的"Android"是真内核真硬件——伪造的只是身份视图，不是执行环境。** 由此派生出 unidbg 无法跨越的鸿沟：

### 1\. 主动反仿真检测面（最致命）

libtiny 这类 SDK 的核心职能之一就是识别"我在模拟器/插桩环境里"。unidbg 需要逐个堵以下检测点，且永远堵不完：

-   unicorn 执行特征：指令级计时、 `clock_gettime` 粒度、SIGILL/SIGTRAP 时序
-   假内核行为： `uname` 、 `/proc/cpuinfo` 、AT_HWCAP、epoll/socketoption 的真实内核行为复刻
-   假 ptrace/进程视图与真 syscall 语义的偏差

Soapp 跑在真机上， **这些检测点天然为真**——CPU 是骁龙真核、调度器是真的、SELinux 上下文是真的、binder 驱动是真的。不存在"模拟得像不像"问题，只需要解决"身份对不对"问题。这是数量级的难度差异：unidbg 对抗的是整个仿真检测学科，Soapp 对抗的只是包名/签名/路径这一层身份。

### 2\. 真实网络出口与传输层指纹

Soapp 用手机的 4G/WiFi 真实协议栈出网：基站 IP、运营商属性、内核 TLS 行为、信号相关时序全部真实，与真品用户无法区分。

### 3\. 真传感器与硬件采集链

libtiny 采集 WiFi 扫描列表、蓝牙设备、传感器清单、GPU renderer、电话基站信息。unidbg 没有 WiFi 驱动、没有传感器 HAL、没有 RIL——只能返回"空列表"，而 **空列表本身就是检测特征** （真机上不可能扫不到任何 AP）。Soapp 里这些采集走真硬件真实返回，再经伪装层做一致性处理（如 netlink 清洗 VPN 网卡、属性表统一机型）。

### 4\. 性能与时序特征

unicorn 翻译执行比原生慢 1~2 个数量级。SDK 内嵌的哈希轮/加密轮计时探测在 unidbg 上要么超时要么露馅。Soapp 原生执行，耗时特征与真品 App 一致。

### 5\. 设备信任链类接口

签名链、部分设备认证接口依赖真机 keymaster/TEE 语义与设备状态一致性，仿真环境无法产出可信结果。

### 6\. 部署形态与成本

unidbg 规模化 = PC/服务器上的模拟器池——恰好是各家风控的打击对象（云手机/模拟器 IP 段整体降权）。Soapp 的部署单元是 **一台两百块的二手安卓机**：装机即用、真实设备指纹、真实住宅级网络，规模化形态就是"设备农场"这个风控最难处理的类别。

## 五、相对 unidbg 的工程优势

除仿真真实性外，本项目在工程层面也有独立优势：

1.  **Target 插件化**：五接口 SPI 把 so 专属逻辑（包名/路径映射/opcode 表/采集协议）与通用引擎彻底分离，engine 层禁止出现任何 so 特定字面量；接新目标 = 实现一个 Target 类。
2.  **版本适配资源外置**：opcode 映射 JSON 化 + 版本自检；unidbg 适配新版本需要改 Java 代码重新编译调试。
3.  **同进程多实例**：一份 APK 并行跑 N 个隔离签名引擎；unidbg 多实例靠多进程/JVM 堆复制，资源开销大得多。
4.  **决策下沉 + 双保险拦截**：高频 syscall 在内核态拦截、用户态 C 决策，不经 JVM——比 unidbg 的 Java syscall handler 快一个量级，且覆盖裸 svc。
5.  **端到端真实验证**：回归脚本直接对生产接口，"签名可用"由线上服务器裁决，而非本地自洽。
6.  **可观测体系**：EBADF 调用点审计、libc 观察 hook（参数语义解码：DIR 句柄还原目录路径、fd 还原文件路径）、日志总线，异常调用点可在 IDA 偏移级定位。

## 六、反过来：unidbg 仍然更强的地方（客观边界）

-   **PC 侧调试体验**：IDA/Ghidra 联动、指令级 trace、断点单步、内存监视——Soapp 在手机上调试的工具体验远不如桌面。
-   **零硬件启动成本**：跑一个样本不需要一台真机。
-   **确定性与快照**：仿真环境状态完全可控可重放；真机有温度、后台任务、OTA 等噪声。
-   **生态成熟度**：unidbg 社区积累的系统调用/机型库开箱即用；本项目所有仿真层自建。

## 七、总结

Soapp 与 unidbg 是同一问题（"让闭源 native SDK 在受控环境里为我产出结果"）的两个解法分支：unidbg 选择 **搬走执行**——把 so 拖进仿真世界，代价是要把整个世界的真实性都手工补出来；Soapp 选择 **搬走身份**——让 so 留在真实世界，只替换它眼中的"我是谁"。对于 libtiny 这种以反仿真为生的 SDK，后者把最难的仗（对抗检测学科）变成了不需要打的仗，这正是"真机重实现"路线的核心价值。
