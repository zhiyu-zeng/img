---
title: 【微信】安卓Pixel设备最新免解锁Root方案
source: https://mp.weixin.qq.com/s?__biz=MzU3MTY5MzQxMA==&mid=2247485467&idx=1&sn=9d5fd685054053ef5bba72c1c6c8b816&chksm=fdb99243aea4d87ce857af5899391e590c5a0c745a17355e974b4b1a436a3f10201e4e41c856
source_host: mp.weixin.qq.com
clip_date: 2026-09-16T16:43:03+08:00
trace_id: d538cfda-7709-4a54-b820-6ce8db081456
content_hash: ac2f8a65054aed394229e2c0aef87a7be288a73a074b0ae8f0deaff2b2a520dd
status: synced
tags:
  - 微信
  - Android逆向
  - 内核
series: null
feed_source: 公众号·软件安全与逆向分析（weread）
ai_summary: Pixel 设备无需解锁 Bootloader，借助 GhostLock（CVE-2026-43499）内核漏洞从普通 adb shell 获取当前开机周期的临时 Root，再由 KernelSU 接管应用授权。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dd75244-d011-813b-8de4-cb28c694c8f6
ioc:
  cves:
    - CVE-2026-43499
  cwes: []
  hashes:
    - 09230d2a4cfec4105348e94587af490aaed72fc5
    - 3bfdc63936dd4773109b7b8c280c0f3b5ae7d349
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Pixel 设备无需解锁 Bootloader，借助 GhostLock（CVE-2026-43499）内核漏洞从普通 adb shell 获取当前开机周期的临时 Root，再由 KernelSU 接管应用授权。
> 
> - **利用链三段：** 具体固件的漏洞利用 → 设备端建立临时 Root 服务 → 加载与管理器匹配的 KernelSU 模块；载荷为 `artifacts/exploits/*.so`（用户态），真正装入内核的是 `kernelsu.ko`，`ksud` 从已安装管理器 APK 中提取。
> - **漏洞原理：** futex PI 路径的 `remove_waiter()` 误围绕 `current` 而非 `waiter->task` 清理，遗留悬空 `pi_blocked_on` 形成 use-after-free；6.6 用 `pselect`、6.1 用 `tcp-zc` 做栈复用；先用 tracefs 的 `trace_pipe_raw` 泄漏内核文本基址，再经伪造 `ashmem_miscs[0].fops` 与签名相容的 configfs 函数建立内核读写。
> - **适配范围：** `data/targets.json` 登记 19 条设备/构建组合、18 种型号、5 个载荷组，但上游声明的真机验证对象只有 Pixel 7（`panther`）；自动匹配成功仅代表找到候选载荷，不证明兼容。
> - **运行与验收：** 需 Bash 4+、Python 3.11+、GNU 工具链与 NDK，源码固定到提交 `09230d2a`；离线用 `--print-contract` 检查 `entry.ghostlock@6.1` 等组合，正式运行加 `--recipe ghostlock`；分层验证 `ksud debug version`、管理器识别、`su -c id`。
> - **限制与风险：** Root 仅当前开机周期，重启即失效；ashmem 文件操作表共享会导致成功后延迟崩溃；上游修复版本为 6.1.175 / 6.6.140，OTA 的符号偏移或结构变化即可让旧载荷失效。

## 安卓 Pixel 设备最新免解锁 Root 方案

今年比较流行获取临时Root,这种方式隐蔽性更强！之前讲过高通8Gen5方案的临时Root，今天我们讲一个Pixel系列的临时Root方法。

Bootloader 保持锁定，原厂系统正常启动，随后从普通 `adb shell` 获得 Root—— `JingMatrix/pixel-ksu-root` 将这条路径组织成了可构建、可调度、可核验的工程实现。它利用 GhostLock 内核漏洞建立临时内核读写能力，提升设备端辅助进程的权限，再将 KernelSU 模块加载到正在运行的内核，由已安装的管理器接管应用授权。

这套方案的关键在于三个环节能否连续成立： **具体固件上的漏洞利用、临时 Root 服务的建立，以及与管理器匹配的 KernelSU 模块加载。** `data/targets.json` 连接了设备身份与利用载荷，也是理解项目适配方式的入口。项目说明

> 源码核验日期：2026-09-16。分析固定于上游提交 `09230d2a4cfec4105348e94587af490aaed72fc5` ，与核验时取得的 `main` 一致。下文依据源码、官方漏洞记录及宿主侧解析检查展开，未进行手机 Root 实测。“最新”指核验时的项目实现；固件适用范围以具体设备与构建为准。

## 1\. 方案背景：锁定启动链与运行期提权

### 1.1 Bootloader 锁定为什么没有阻止这条路径

Android Verified Boot 建立的是从信任根到各级启动组件、受验证分区的信任关系。锁定状态下，设备按照既定信任策略验证要加载的镜像。这项保证并不包含“通过验证的内核永远没有可利用的运行期缺陷”。Android 启动验证流程

`pixel-ksu-root` 的介入点位于 Android 启动之后。初始执行环境是已获授权的 ADB shell，载荷通过系统调用触达原厂内核的漏洞路径，在内存中改变权限相关状态。整个 Root 流程无需执行 Bootloader 解锁，也无需刷入修补后的 `boot.img` 或 `init_boot.img` 。

因此，设备可以同时处于“启动时加载了通过验证的原厂镜像”与“运行中的内核已经被利用”这两种状态。Bootloader 锁定、启动验证状态和当前进程权限，分别回答不同层次的问题。

| 层次  | 本方案中的状态 | 判断依据 |
| --- | --- | --- |
| 启动链 | 沿用原厂启动流程，流程不要求解锁或刷写启动镜像 | 启动组件与启动状态 |
| 初始入口 | 已授权计算机上的普通 ADB shell | 通常为 `uid=2000(shell)` |
| 权限建立 | 利用漏洞改写运行期内核状态 | 内核读写验证与临时 Root 检查 |
| Root 管理 | KernelSU 模块驻留内核，管理器处理授权 | 驱动响应、管理器识别与应用验证 |
| 持续时间 | 当前开机周期 | 重启后需重新建立这条权限链 |

这里的“免解锁”特指 Bootloader。执行前仍需能够操作设备、开启 USB 调试并授权计算机；项目不提供绕过锁屏认证的入口。

### 1.2 当前完成的是哪条利用链

当前默认方案为 **GhostLock，CVE-2026-43499**，漏洞位于 Linux futex 优先级继承与 rtmutex 清理路径。GhostLock 的原始研究由 NebuSec 公开，本仓库围绕 Pixel 增加了 ARM64 内核适配及 KernelSU 交接。原始漏洞研究

仓库同时收录了其他 CVE 的实验代码，但其存在不代表已有多套完成的 Pixel Root 方案。

上游将缺少 `CAP_SU` 交接能力的运行称为 `hunt` ：调度器收集和分类实验结果，跳过管理器识别、 `ksud` 提取及模块安装。POSIX CPU timer、Binder、Bad Epoll 等路径在当前基线下仍不能作为已完成的 Root 路径使用。研究状态

`CAP_SU` 、 `CAP_SLIDE` 、 `CAP_KRW_C` 是项目对阶段能力的命名。它们用于表达 Root 交接、内核地址和内核读写等成果，与 Linux 凭据中的 `CAP_SYS_ADMIN` 等 capability 位不是同一套机制。

## 2\. 工程架构：从宿主调度到内核模块

### 2.1 各组件的职责

项目入口 `pixel-ksu-root` 是 Bash 脚本。宿主负责编排，设备端辅助程序负责加载利用代码，KernelSU 负责后续 Root 管理。理解主路径可以从以下组件入手。

| 组件  | 主要职责 |
| --- | --- |
| `pixel-ksu-root` | 参数解析、环境检查、设备选择和最终结果报告 |
| `data/targets.json` | 设备构建、KMI、载荷组及构建代表目标的映射 |
| cves/targets/<设备-构建>/target.h | 对应内核的符号偏移、结构布局与利用参数 |
| `runner/recipes/`<br><br>、 `runner/stages/` | 声明阶段组合、源码集合、能力、运行方式与日志标记 |
| `runner/scripts/resolve-recipe.py` | 将目标、方案和阶段声明解析为一致的构建与运行配置 |
| `runner/scripts/build-payloads.sh` | 按载荷组构建，并将产物整理到 `artifacts/` |
| `runner/lib/` | 实现 ADB 交互、目标匹配、尝试循环、安装与清理 |
| `cves/kaslr/` | 获取当前启动的内核文本基址 |
| `cves/cve-2026-43499-ghostlock/` | GhostLock 利用、内核读写、权限修改及临时服务 |
| 已安装的 KernelSU 管理器 | 提供相应 `ksud` ，并在模块加载后接管授权 |

架构中的配置关系与执行关系如下。虚线表示配置输入，实线表示构建、调用或权限交接。宿主框架

### 2.2 利用.so 与 kernelsu.ko 的分工

`artifacts/exploits/*.so` 是 **Android 用户态共享库**。 `cve-helper` 通过 `dlopen()` 加载它，载荷构造函数启动漏洞利用。它虽能触发内核行为，本身仍运行于用户空间。

`kernelsu.ko` 才是最终装入内核的模块。仓库没有直接打包一份通用 `ksud` 或模块，而是从设备上已安装的管理器 APK 提取 `lib/arm64-v8a/libksud.so` ，由该程序完成匹配的 late-load。漏洞载荷负责取得安装所需的权限，KernelSU 负责把权限变成可由管理器控制的 Root 环境。载荷加载器、安装实现

### 2.3 一个方案，两套内核实现

`ghostlock.toml` 按 KMI 选择入口，并组合 `handoff.suhelper` 。两种入口实际编译的是不同源码集合。

| KMI | 入口阶段 | GhostLock 源码位置 | 默认栈复用方式 |
| --- | --- | --- | --- |
| `android14-6.1` | `entry.ghostlock@6.1` | `61/`<br><br>子目录 | `tcp-zc` |
| `android15-6.6` | `entry.ghostlock@6.6` | GhostLock 目录顶层 | `pselect` |

`cve-helper` 不依赖目标头文件，批量构建时只生成一次；利用 `.so` 则按偏移组分别生成。显式传入 `--recipe ghostlock` 时，宿主会先解析相应阶段声明。不传 `--recipe` 的运行使用脚本内置默认配置，省略了这一步声明解析。方案定义、6.1 阶段、6.6 阶段

## 3\. targets.json：适配落在具体内核构建上

### 3.1 从设备记录到载荷文件

以 Pixel 7 为例，目标记录包含五个字段。

```json
{"codename":"panther","build":"CP2A.260705.006","kernel":"6.1.157-android14-11-gbd23337e42e7-ab14791245","kmi":"android14-6.1","payload":"android14-6.1-a"}
```

| 字段  | 含义  | 使用位置 |
| --- | --- | --- |
| `codename` | 设备代号 | 与 `ro.product.device` 对照 |
| `build` | 系统构建标识 | 与 `ro.build.display.id` 对照 |
| `kernel` | 登记的内核版本字符串或前缀 | 提供内核匹配线索 |
| `kmi` | 内核模块接口分支 | 选择入口源码，并传入模块加载流程 |
| `payload` | 内核偏移组 | 关联 `payloads` 中的构建来源与文件名 |

对应的载荷组定义为：

```json
{"android14-6.1-a":{"kmi":"android14-6.1","build_from":"bluejay-CP2A.260705.006","file":"android14-6.1-a.so"}}
```

这表示：Pixel 7 被映射到 `android14-6.1-a.so` ；批量构建时，以 Pixel 6a 的 `bluejay-CP2A.260705.006` 为代表目标生成这份载荷。真正的符号地址和结构偏移保存在目标头文件中，JSON 负责将这些信息组织为可选择的构建单元。目标表、目标头文件说明

其中， `android14-6.1` 描述内核分支，不能直接换算为手机设置页面显示的 Android 大版本。KMI 兼容也不能替代对利用所依赖的内部地址、栈布局和分配器行为的核验。

### 3.2 登记范围与验证范围

当前 `targets.json` 有 **19 条设备与构建组合，覆盖 18 种型号，归入 5 个载荷组**。Pixel 6a 登记了两个系统构建。下表完整保留了设备到载荷的对应关系。目标表

| 设备  | 代号  | 登记构建 | 载荷组 |
| --- | --- | --- | --- |
| Pixel 6 | `oriole` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 6 Pro | `raven` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 6a | `bluejay` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 6a | `bluejay` | `CP1A.260405.005` | `android14-6.1-cp1a` |
| Pixel 7 | `panther` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 7 Pro | `cheetah` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 7a | `lynx` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 8 | `shiba` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 8 Pro | `husky` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 8a | `akita` | `CP2A.260805.005` | `android14-6.1-akita` |
| Pixel 9 | `tokay` | `CP2A.260705.006` | `android14-6.1-b` |
| Pixel 9 Pro | `caiman` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 9 Pro XL | `komodo` | `CP2A.260705.006` | `android14-6.1-b` |
| Pixel 9 Pro Fold | `comet` | `CP2A.260705.006` | `android14-6.1-a` |
| Pixel 9a | `tegu` | `CP2A.260705.006` | `android14-6.1-b` |
| Pixel 10 | `frankel` | `CP2A.260705.006` | `android15-6.6` |
| Pixel 10 Pro | `blazer` | `CP2A.260705.006` | `android15-6.6` |
| Pixel 10 Pro XL | `mustang` | `CP2A.260705.006` | `android15-6.6` |
| Pixel 10 Pro Fold | `rango` | `CP2A.260705.006` | `android15-6.6` |

**上游 README 明确声明的真机验证对象只有 `panther` ，即 Pixel 7。** 其余条目表示仓库已登记相应目标；上游声明这些目标均可构建，但这不等于逐型号、逐固件的真机成功记录。阶段文件中的概括性状态文字，也不能扩展为整张表的实测保证。验证范围说明

五个载荷组的构建来源如下。

| 载荷组 | `build_from` | 设备与构建组合数 |
| --- | --- | --- |
| `android14-6.1-a` | `bluejay-CP2A.260705.006` | 10  |
| `android14-6.1-b` | `komodo-CP2A.260705.006` | 3   |
| `android14-6.1-akita` | `akita-CP2A.260805.005` | 1   |
| `android14-6.1-cp1a` | `bluejay-CP1A.260405.005` | 1   |
| `android15-6.6` | `blazer-CP2A.260705.006` | 4   |

`-a` 、 `-b` 与 `-akita` 组虽然登记了相同的内核版本字符串，仍使用不同载荷。版本字符串是筛选线索，载荷复用需要更具体的镜像与目标参数依据。

### 3.3 自动匹配成功能证明什么

`runner/lib/select.sh` 中的 `resolve_target()` 按以下顺序选择首个候选项：

1.  同时匹配设备代号和构建号。
    
2.  仅匹配设备代号。
    
3.  匹配登记内核字符串在 `-g` 之前的前缀。
    
4.  无候选项时返回 `UNKNOWN` ，尽可能从运行内核提取 KMI。
    

能够解析运行内核的 KMI 时，函数会排除 KMI 不同的候选项；它没有验证完整内核镜像的哈希，也没有强制所有候选都满足构建号一致。目标选择实现

例如，给 `panther` 输入未登记构建、但仍属 `android14-6.1` 的内核字符串，函数仍可能返回 `android14-6.1-a.so` 。这个结果只说明调度器找到了候选载荷，不能证明该构建的利用兼容性。

实际运行应先核对设备与构建，再显式使用 `--recipe ghostlock` ，让方案解析器检查真实设备对应的目标目录。运行命令无需手工填写 `--target` ；该参数适合离线检查，填入别的设备目标会削弱原本的核验依据。

## 4\. GhostLock 的技术原理

### 4.1 错误的清理对象留下悬空 waiter

futex 的 PI（Priority Inheritance，优先级继承）机制需要维护线程之间的等待关系。等待线程进入相应路径时，会在自己的内核栈上创建 `rt_mutex_waiter` ，其 `task_struct.pi_blocked_on` 指向这个等待对象。

问题出现在代理加锁失败后的清理过程。 `remove_waiter()` 既用于普通等待路径，也用于 `rt_mutex_start_proxy_lock()` 的回滚。在代理路径中，正在执行代码的 `current` 是发起代理操作的线程，而 `waiter->task` 才是实际等待线程。旧实现错误地围绕 `current` 完成加锁和状态清理，导致实际等待线程的 `pi_blocked_on` 没有被清空。Linux 官方漏洞记录

等待线程退出相关系统调用后，原有栈帧结束生命周期，任务结构中的指针却仍指向这片内存。后续优先级链遍历再次解引用该指针时，读取到的可能已经是另一段系统调用写入的内容。这属于栈对象生命周期错误形成的 use-after-free。

修复需要让相关操作统一作用于真正的 `waiter->task` ，包括持有正确任务的 PI 锁、清除等待状态，以及后续优先级链处理。Android Common Kernel 的回补补丁也体现了同样的修正。Android 内核回补

### 4.2 地址准备：内核文本与可控对象是两件事

利用链首先需要知道内核代码在本次启动中被放到了哪里。目标头文件描述链接时的地址关系，KASLR 会在运行时引入随机偏移。项目用共用的 tracefs 路径恢复当前内核文本基址。

向 `trace_marker` 写入标记后，内核 trace 记录会包含 `tracing_mark_write` 内部的代码地址。格式化输出通常将其显示为符号，而 `trace_pipe_raw` 返回原始记录，其中保留了地址值。载荷在原始记录中定位标记，取得对应代码地址，再减去目标头文件提供的 `SLIDE_TRACE_MARK_IP_OFF` 。tracefs 实现

```
运行期文本基址 = trace 记录中的代码地址 − 该地址在镜像中的偏移运行期符号地址 = 运行期文本基址 + 符号在镜像中的偏移
```

地址形态和页内偏移会被检查后再使用。上游所称的 `write-free` ，指这个泄漏阶段不依靠漏洞改写内核对象；它仍会写入 trace 标记，并可能开启 `tracing_on` 。这一入口依赖目标系统对 shell 开放相应 tracefs 节点，不能推广成任意普通 App 都能访问。

另一项准备是获得能够承载伪造对象的内核内存。6.1 实现使用 KernelSnitch 的 futex 哈希侧信道定位 `mm_struct` 候选地址，再结合进程、 `memfd` 与 AF_UNIX socket 缓冲区的分配和释放，尝试让已知位置的页面被受控数据重新占用。前一阶段定位内核文本，这一阶段定位并布置动态对象，两者承担不同任务。页面准备实现

### 4.3 为什么 6.1 与 6.6 使用不同系统调用

让 `pi_blocked_on` 悬空，只提供了后续访问旧对象的机会。要把它变成利用能力，还必须使用户可控输入重新落到旧 waiter 所在的栈位置。

6.6 默认使用 `pselect` ：文件描述符位图被复制到 `core_sys_select()` 的栈缓冲区，合适位置的输入字节可被后续 PI 遍历解释为 waiter 字段。结果位图由内核初始化，因此整块栈缓冲区并非全部可控。

6.1 默认使用 `tcp-zc` ： `do_tcp_getsockopt()` 处理 `tcp_zerocopy_receive` 结构时形成另一种栈覆盖。该路径依赖相关结构字段的存在，阶段声明对适用内核版本设置了门槛。两种复用方式

这类重叠取决于具体内核编译产物的栈布局。源码同属一个版本系列，并不能保证栈帧深度相同； `PSELECT_SHIFT` 也只能表达已经确认的布局关系。目标适配必须先证明所选系统调用确实能覆盖关键字段。

### 4.4 从受约束写入到可验证的内核读写

GhostLock 的初始效果并不是直接获得任意地址读写。载荷先构造能够通过相关访问与一致性检查的 waiter、锁和红黑树节点，让 PI 链处理节点时产生受约束的指针写入。

Pixel 实现选择的重要目标是 `ashmem_miscs[0].fops` ：它保存 ashmem 设备共享的文件操作表指针。将该指针导向伪造表后，再打开设备，所得文件对象会保存对应 `f_op` 。随后利用链复用 `configfs_bin_write_iter` 、 `configfs_read_iter` 等具有相应函数签名的内核函数，建立初步读写能力。采用签名相容的调用目标，使这部分间接调用满足对应 CFI 检查；这里没有整体关闭 CFI。文件操作表利用

接下来， `install_pipe_physrw()` 把能力转移到 pipe 缓冲区相关的读写接口，并执行读回测试。只有验证通过，后续权限修改才有可依赖的内核访问能力。pipe 读写实现

| 阶段  | 建立的能力 | 仍需解决的问题 |
| --- | --- | --- |
| tracefs 地址泄漏 | 当前内核文本基址 | 尚不能读写任意内核对象 |
| 动态对象定位与页面准备 | 已知位置的伪造对象页 | 需要满足实际回收与占位条件 |
| waiter 栈复用与 PI 遍历 | 受约束的指针写入 | 写入目标及周边结构必须成立 |
| 伪造 `file_operations` | 经特定内核函数建立初步读写 | 需要读回证明，并恢复共享指针 |
| pipe 读写接口 | 后续权限修改使用的内核访问能力 | 仍需正确定位任务与凭据 |

6.1 源码还用 `kimage_t` 、 `krun_t` 与 `kdirect_t` 区分镜像地址、运行期地址和线性映射地址。pipe 读写接口使用 `kdirect_t` ，可以避免把不同地址空间中的数值仅按普通整数混用。地址类型定义

## 5\. Root 交接：从利用进程到 KernelSU

### 5.1 UID 0 只是权限状态的一部分

建立内核读写后， `install_android_root()` 创建用于接管权限的子进程，定位其任务和凭据对象，并调整 UID/GID、capability、SELinux 凭据及 seccomp 等状态。Android 的访问控制由多层机制共同决定，只改 UID 无法保证后续服务和模块加载顺利执行。权限修改实现

利用流程还会暂时改变 SELinux enforcing 状态。子进程随后建立临时 Root 服务，通过 Unix socket 执行授权请求。辅助程序读取连接方凭据并检查 UID；宿主默认传入 ADB shell 的 UID 2000 和已安装管理器的实际 UID。临时服务实现

此时获得的是为安装阶段服务的临时权限通道。KernelSU 接管后，应用应通过其管理器和正式 `su` 入口申请权限。

### 5.2 管理器、ksud 与模块必须衔接

`derive_ksud()` 通过 `pm path` 查找管理器 APK，将其拉回宿主，提取 `libksud.so` ，再以 `ksud-manager` 的名称推送到设备。安装器经临时 Root 服务运行 `late-load` ，传入识别出的 KMI 和管理器包名。模块安装实现

从已安装管理器取得 `ksud` ，是为了维持用户态程序、内核模块与管理器身份识别之间的匹配关系。随意混用其他构建的组件，可能导致模块虽已驻留，当前管理器却没有被正确识别。

项目的调度设计不绑定某个 KernelSU 分支；实际可用性仍取决于该版本管理器是否提供预期的原生库、KMI 模块、 `late-load` 和驱动查询接口。

### 5.3 验证与清理是交接的一部分

`late-load` 的后续初始化可能恢复 SELinux enforcing，使临时 Root 服务失效。因此，安装器从普通 shell 运行 `ksud debug version` ，以驱动返回的非零版本号判断模块是否已经响应，避免继续依赖即将退出的临时服务。驱动查询实现

利用阶段还会在 adbd 可见的挂载命名空间中，用 tmpfs 覆盖 `/apex/com.android.virt/bin` ，将临时 `su` 放入 PATH。若模块接管后覆盖挂载仍在，普通 `su` 可能继续连向已经退出的临时服务；原目录中的虚拟化相关程序也会被遮住。

`teardown_staging()` 因此尝试通过正式 Root 入口解除挂载并清理部分临时文件。该步骤是尽力清理，失败不一定改变整个脚本的成功返回值。验收时应分别确认驱动响应、管理器授权以及普通 shell 最终使用的 `su` 。清理实现

## 6\. 工具链与使用方法

以下以 **Linux x86_64 宿主、Pixel 7、 `CP2A.260705.006` 构建** 为例。其他设备应先找到自身对应的登记项。正式运行会按默认配置主动重启手机，应预先保存正在进行的工作和需要保留的数据。

### 6.1 准备依赖并固定源码

宿主需要 Bash 4 及以上、Python 3.11 及以上、GNU make、Git、unzip、ADB 与常用 GNU 命令行工具。Python 版本要求来自解析器直接导入的 `tomllib` ；Bash 脚本使用 `mapfile` ，构建和调度还使用 GNU 风格的 `stat` 、 `find` 、 `timeout` 等。构建脚本、方案解析器

原生载荷使用 Android NDK 交叉编译，Makefile 默认选择 `aarch64-linux-android35-clang` 。上游没有固定 NDK 修订号，也没有声明必须使用某个 Clang 主版本。macOS 自带的 Bash 与 BSD 工具不完整满足上述脚本要求；其他宿主需要自行补齐相应工具环境。

ADB 与 NDK 分别从 Android Platform-Tools 和 Android NDK 官方页面 获取。准备好依赖后，在新的工作目录中执行：

```bash
git clone https://github.com/JingMatrix/pixel-ksu-root.gitcd pixel-ksu-rootgit switch --detach 09230d2a4cfec4105348e94587af490aaed72fc5bash --versionpython3 -c 'import sys, tomllib; print(sys.version)'adb version
```

后续命令均在该仓库目录执行。固定提交可以让目标表、阶段定义与载荷源码保持一致；改用其他提交时，应重新检查其支持范围与接口。

### 6.2 记录设备身份

开启 USB 调试并在手机上授权计算机。先列出设备，再将实际序列号填入 `PIXEL_SERIAL` ；后续命令始终操作同一台设备。

```bash
adb devices -lPIXEL_SERIAL='替换为目标设备序列号'adb -s "$PIXEL_SERIAL" shell idadb -s "$PIXEL_SERIAL" shell getprop ro.product.deviceadb -s "$PIXEL_SERIAL" shell getprop ro.build.display.idadb -s "$PIXEL_SERIAL" shell uname -radb -s "$PIXEL_SERIAL" shell getprop ro.build.version.security_patchadb -s "$PIXEL_SERIAL" shell getprop ro.boot.flash.lockedadb -s "$PIXEL_SERIAL" shell getprop ro.boot.vbmeta.device_stateadb -s "$PIXEL_SERIAL" shell getprop ro.boot.verifiedbootstate
```

本例应对应 `panther` 、 `CP2A.260705.006` 及第 3 节登记的内核。普通调试入口通常显示 `uid=2000(shell)` ；原厂锁定设备常见启动属性为 `1` 、 `locked` 、 `green` 。这些属性用于记录设备报告的启动状态，不能单独证明其当前运行期安全性。

### 6.3 安装并确认管理器

从所用 KernelSU 项目的官方发行渠道取得兼容管理器。以官方包名 `me.weishu.kernelsu` 为例，将 APK 保存为当前目录的 `KernelSU.apk` 后执行：

```bash
adb -s "$PIXEL_SERIAL" install -r ./KernelSU.apkadb -s "$PIXEL_SERIAL" shell pm path me.weishu.kernelsuadb -s "$PIXEL_SERIAL" shell pm list packages -U me.weishu.kernelsu
```

应能查到 APK 路径及应用 UID。此时内核模块尚未加载，管理器显示未安装 KernelSU 可以是正常状态。若使用其他分支，后续 `--manager` 必须填写实际包名，并确认该版本满足第 5.2 节的接口要求。KernelSU 安装说明

### 6.4 在宿主检查阶段组合

以下命令只解析声明。显式提供 `--target` 后， `--print-contract` 不需要连接手机，也不会执行利用。

```
./pixel-ksu-root \    --recipe ghostlock \    --target panther-CP2A.260705.006 \    --print-contract
```

在本文基线下，应看到以下组合：

| 检查项 | 预期值 |
| --- | --- |
| 入口  | `entry.ghostlock@6.1` |
| 交接阶段 | `handoff.suhelper` |
| 调用方式 | `helper-preload` |
| 组合能力 | 包含 `CAP_SLIDE` 、 `CAP_KRW_C` 、 `CAP_SU` |
| 准备步骤 | 在正式尝试前重启 |

若需要机器可读结果，可直接运行解析器：

```
python3 runner/scripts/resolve-recipe.py \    --recipe ghostlock \    --target panther-CP2A.260705.006 \    --format json
```

离线输出中的管理器 UID 等运行期值可能为空，打印的底层调用模板不应直接拿到手机上执行。解析通过表明阶段组合与目标声明满足检查条件，后续仍需完成载荷构建和设备运行验证。

### 6.5 构建运行入口需要的产物

将 `ANDROID_NDK_HOME` 指向实际 NDK 安装目录，再执行批量构建。

```bash
export ANDROID_NDK_HOME='/替换为实际NDK绝对路径'"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin/aarch64-linux-android35-clang" --versionrunner/scripts/build-payloads.shls -lh artifacts/cve-helper artifacts/exploits/*.sofile artifacts/cve-helper artifacts/exploits/*.so
```

当前目标表应生成一个 `cve-helper` 和五个利用 `.so` ，设备端产物应为 AArch64 ELF。 `artifacts/` 是宿主运行入口实际读取的位置。

单独执行 `make -C cves TARGET=...` 时，产物留在 `cves/build/` ；只完成这一步还没有准备好批量脚本整理出的运行目录。 `make ... check` 虽不编译载荷，Makefile 解析时仍会检查 NDK 路径。未安装 NDK 时，可先使用上一节的离线解析器。Makefile、批量构建实现

### 6.6 执行 Root

确认设备构建、管理器和产物均匹配后，运行：

```
./pixel-ksu-root \    --serial "$PIXEL_SERIAL" \    --recipe ghostlock \    --manager me.weishu.kernelsu
```

这里省略 `--target` ，由脚本读取真实设备属性再解析方案。每台设备同时只运行一个调度器实例。

脚本会在首次主动重启前准备管理器 UID、 `ksud` 、辅助程序和利用载荷。这样即使重启后设备停留在锁屏界面，也无需重新依赖包管理器取得安装资料。取得临时 Root 后，调度器继续执行模块加载、驱动查询和临时挂载清理。

主要预算由环境变量控制，当前入口脚本的默认值如下。入口实现

| 变量  | 默认值 | 含义  |
| --- | --- | --- |
| `ROOT_MAX` | 4   | 可分类的正式尝试预算 |
| `PANIC_MAX` | 3   | 崩溃结果预算 |
| `REFUSED_MAX` | 3   | 载荷未正常开始的预算 |
| `SHOT_TIMEOUT` | 240 秒 | 无进展时的软超时判断 |
| `VERIFY_TRIES` | 12  | 模块加载后的驱动查询次数 |

`SHOT_TIMEOUT` 不是整个 Root 操作的总时限。调度器还会考虑进度、心跳、硬超时和准备步骤。默认主动重启也不能直接计为内核崩溃。

### 6.7 分层核对结果

先从普通 shell 检查驱动和命令入口：

```bash
adb -s "$PIXEL_SERIAL" shell /data/local/tmp/ksud-manager debug versionadb -s "$PIXEL_SERIAL" shell /data/local/tmp/ksud-manager debug infoadb -s "$PIXEL_SERIAL" shell command -v suadb -s "$PIXEL_SERIAL" shell getenforce
```

随后打开管理器，确认其识别到 KernelSU，并给需要使用 Root 的应用或 shell 授权，再验证：

```
adb -s "$PIXEL_SERIAL" shell su -c id
```

| 观察结果 | 证明的范围 |
| --- | --- |
| 临时服务返回 `uid=0` | 漏洞链已建立临时 Root 通道 |
| 驱动返回非零版本号 | KernelSU 模块已经响应 |
| 管理器识别成功 | 当前管理器与内核端身份衔接正常 |
| 授权后 `su -c id` 返回 `uid=0` | 实际调用者能够通过正式入口使用 Root |
| 持续使用期间无异常 | 为稳定性提供观察记录，仍需结合已知残留问题 |

如果 shell 尚未获准申请 Root， `su` 被拒绝不能单独推导出模块未加载；如果 `su` 仍指向临时覆盖目录，则应先检查交接清理是否完成。

## 7\. 运行流程与失败处理

### 7.1 调度器如何组织一次运行

下面的流程保留了两个提前结束点：已有 KernelSU 时直接检查并清理；已有临时 Root 时跳过漏洞尝试，进入安装。其余情况按预算执行泄漏与利用循环。运行入口、尝试循环

KASLR 基址缓存绑定当前启动。调度器使用 `/proc/stat` 中的 `btime` 判断启动是否变化；本利用树存在操作 `boot_id` 相关指针的路径，因此没有将该值作为缓存依据。重启后旧基址失效，需要重新取得。默认准备步骤会重启设备，不能将整个运行理解成只泄漏一次地址。启动识别实现

### 7.2 日志标记与权限结果分别判断

GhostLock 的阶段 `PASS` 标记可以来自成功的基址泄漏。调度器还通过 `root_oracle()` 独立查询临时 Root，防止把“某个阶段通过”直接当成“已经完成 Root”。

| 分类  | 含义与处理重点 |
| --- | --- |
| `PASS` | 命中阶段通过标记或独立成功检查；仍需看实际权限与模块结果 |
| `MISS` | 本次未达到目标，按当前预算决定后续 |
| `PANIC` | 观察到相应崩溃结果，收集前次启动记录并消耗崩溃预算 |
| `REFUSED` | 载荷未正常开始或被拒绝，先核对文件、调用环境与前置条件 |
| `PRECONDITION_FAIL` | 阶段条件检查失败，重复尝试不能代替修正条件 |
| `PARKED` | 到达期限但无法据现有信号证明可安全杀死进程，按恢复流程处理 |
| `HELD` | 仍持有内核钩子或相关对象，调度器返回供人工检查 |
| `DIRTY` | 记录到未完成的状态恢复，需要连同权限结果审阅 |

`RESTORED` 是恢复记录，不是另一个终结结果。当前实现中，即便恢复记录仍为 `DIRTY` ，独立检查若已证明获得 Root，循环也可能在打印警告后继续交接。成功返回值没有包含“所有受影响内核状态均已恢复”的承诺。分类与恢复逻辑

主要日志保存在 `logs/run-*.log` 、logs/shots/<本次运行>/index.tsv 及逐次尝试日志中。出现重启时，可结合以下信息区分主动重启与 panic：

```bash
adb -s "$PIXEL_SERIAL" shell getprop sys.boot.reason.lastadb -s "$PIXEL_SERIAL" shell cat /sys/fs/pstore/console-ramoops-0
```

在上游研究的系统策略下，shell 可以读取该已知名称的 pstore 文件，即使不能列出其目录。pstore 通常只保留最近一次启动的相关记录，连续重启可能覆盖需要分析的证据。

### 7.3 为什么成功后仍可能延迟崩溃

这条利用链的重要残留问题来自 ashmem 文件操作表的共享性质。

当 `ashmem_miscs[0].fops` 暂时指向伪造表时，其他线程若同时打开 ashmem，其新建文件对象也会复制该指针。恢复设备共享槽位，只能让之后的打开操作重新取得原始表；已经创建的文件对象仍可能保存伪造的 `f_op` 。

承载伪造表的页面随利用进程结束而被释放、复用后，这些文件在关闭或查询 `fdinfo` 等路径上仍可能访问失效内容。上游记录了脚本报告成功后较长时间才触发的崩溃。提前恢复共享指针、清理伪造表的 `owner` 字段能缩小风险窗口，但尚不能回收所有已扩散的引用。已知残留问题

因此，一次获得 Root 证明的是这次权限链成立。将其用于持续运行，还需要承认当前实现已有明确记录的稳定性限制。

## 8\. 重启、系统更新与适配边界

### 8.1 重启结束运行期 Root，普通文件仍可能保留

本方案没有建立跨重启自动加载这套内核权限的机制。重启会终止当前内核中的模块及利用产生的运行期状态，再次 Root 需要重新执行匹配的流程。

但工具会把文件推送到 `/data/local/tmp` ，管理器与 KernelSU 也可能保存配置、数据和日志。重启不会自动删除这些普通文件，也不会撤销取得 Root 后主动做过的文件修改。上游“不碰分区”的表述，应理解为该流程不依靠刷写启动镜像来建立 Root。安装与文件处理

同理，运行期获得写权限并不会改变下次启动的镜像验证规则。修改受验证内容后能否再次启动，仍由启动链决定。保持 Bootloader 锁定也不能直接推导出 Play Integrity、支付应用或 DRM 的统一结果。

### 8.2 系统更新可能同时改变漏洞与载荷条件

Linux 官方漏洞记录列出的修复版本包括 6.1 分支的 **6.1.175** 与 6.6 分支的 **6.6.140**；相应主线修复提交为 `3bfdc63936dd4773109b7b8c280c0f3b5ae7d349` 。Linux CNA 记录

这些版本号描述 Linux 上游分支的修复情况。Android 厂商可以独立回补补丁，Pixel OTA 是否包含修复，需要结合具体内核源码与厂商发布记录确认。不能仅凭安全补丁月份，或“版本号看起来小于某个值”，就断言设备可被利用。

即使漏洞路径尚未修复，OTA 引入的符号偏移、结构布局或编译变化也可能使旧载荷失效。设备代号不变、KMI 不变、自动匹配仍有结果，都不足以复用原先的适配结论。

### 8.3 新目标需要建立哪些依据

新增一行 JSON 只是登记工作。完整适配至少需要以下证据。

| 依据  | 需要确认的内容 |
| --- | --- |
| 镜像与符号 | 准确的设备构建、对应内核镜像、符号偏移及载荷复用关系 |
| 结构与分配器 | 任务、凭据、waiter、文件操作表等布局，以及实际 slab 对象步长 |
| 入口可达性 | tracefs 权限、系统调用条件、所选栈复用路径的实际重叠关系 |
| 运行结果 | 内核读回、临时 Root、模块响应、管理器授权与恢复记录 |

仓库的 `tools/pixel-image` 可以从官方 OTA 提取内核并推导相应偏移； `runner/scripts/harvest-live.sh` 用于采集设备资料， `offsets.report` 则记录推导结果与已登记参数的比较。部分动态资料需要已有 Root，离线镜像分析也无法替代所有运行验证。镜像分析工具、目标适配说明

`pixel-ksu-root` 展示了运行期漏洞、设备适配与 Root 管理如何衔接：启动链接受原厂镜像，漏洞改变当前内核的权限状态，KernelSU 将这份权限提供给经过授权的调用者。判断它是否适用于某台 Pixel，最终仍要落到准确的设备构建、真实的利用结果和完整的交接验证上。

## 参考资料

源码链接固定到本次核验提交；在线文档和漏洞记录可能继续更新。

1.  pixel-ksu-root 项目说明、targets.json、设备目标与偏移说明。
    
2.  宿主框架、方案解析器、构建脚本、Makefile。
    
3.  GhostLock 实现说明、NebuSec 原始漏洞研究、Linux 官方 CVE 记录、Android 内核回补。
    
4.  tracefs 地址泄漏、页面准备、文件操作表利用、pipe 读写、权限修改。
    
5.  临时 Root 服务、KernelSU 安装与清理、驱动与启动状态查询、尝试循环。
    
6.  Android 启动验证、KernelSU 安装文档、官方 Platform-Tools、官方 NDK。
    

排版完美的PDF见知识星球。
