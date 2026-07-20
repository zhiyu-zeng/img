---
title: 【看雪】当反作弊打开 IDA，它先截图再重启：某粥巅峰VT外挂详细分析
source: https://bbs.kanxue.com/thread-292042.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-20T16:36:14+08:00
trace_id: 5c35c219-50cf-4794-aaeb-77372b6bda25
content_hash: 343fb7860a1c9a2953ce82dbb4fdf5b6331780bbf1cec539f4014cd094d7c58f
status: summarized
tags:
  - 看雪
  - 嵌套虚拟化
  - 外挂对抗
series: null
feed_source: 看雪·逆向工程
ai_summary: 该外挂利用硬件虚拟化技术构建隐蔽控制层，通过Intel VMX和AMD SVM将Windows降为Guest系统，实现主动取证、截图上传和系统复位等强反分析能力。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3a375244-d011-81a4-aca3-c47c81ef94dd
ioc:
  cves: []
  cwes: []
  hashes:
    - 0f2811985aa6d4354dd51126f41eb8299cad4a91a078059d751ba33d1aba938f
    - 2c5c7a862b0c1d4b90c286a47784b30641244008b4a555a479b37f0a0ba360bb
    - 9ec544607e6ab4924411135310732ef6025763336367df66251cbcc88275d8ff
    - e6e7ca56cdd9d7c0595caab7d8e5082e87c8b2250b33eea3abdb83bc9816d7d5
    - fe3363e025a759e525285fb8b54534c17e793767dc62721dfe602e366e94ae36
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 该外挂利用硬件虚拟化技术构建隐蔽控制层，通过Intel VMX和AMD SVM将Windows降为Guest系统，实现主动取证、截图上传和系统复位等强反分析能力。
> 
> - **双后端虚拟化架构：** 样本同时实现了完整的Intel VMX L0和AMD SVM L0 Hypervisor。在Intel侧，它进一步实现了Nested VMX，能够接管Guest系统的VMX指令并管理第二层虚拟机；AMD侧则已确认SVM L0与NPT支持，但未发现Nested SVM的闭环。
> - **Guest API Bridge机制：** 为在L0 Host层调用Windows内核API，样本设计了桥接机制。它通过读取GS Base判断当前执行环境（Host或Guest），在Host模式下，将API调用需求通过修改Guest的RIP/RSP和布置栈数据的方式“送回”Guest执行，完成后结果返回Host。
> - **主动取证与反分析：** 当检测到IDA、Wireshark等分析工具进程时，样本会立即同步从DWM/DirectX上下文截图（JPEG格式），并收集UserAssist、Prefetch等大量Windows历史痕迹。这些证据（截图、诊断文本、二进制数据）会通过POST请求上传至后端`/reportData`路径，上传窗口为90秒。
> - **实际作弊功能：** 核心Hypervisor最终服务于《三角洲行动》游戏的作弊功能。代码中包含自瞄、无后坐力、雷达/ESP、载具目标锁定等明确的功能配置字符串，并通过硬件虚拟化底层实现隐蔽的内存访问和内核绘制。

本文为外挂巡查系列第一篇文章，我们将以每月一款的频率分析盘错于各热门游戏的外挂，深入剖析技术原理

本样本将分三次披露，第一篇为概览，第二次为特别技术详细分析，第三次为技术对比溯源及作者追踪， **没错，这次我们会直接追踪作者**

\> **暂时隐去，待第三部分公布完整证据  
该作者皮皮，从事外挂作弊行业多年，覆盖多个腾讯游戏产品  
另外有件奇怪的事情，从去年11月以来，该外挂有时候会关闭登录2-3天，但外挂并未被检测拉闸，据知情人士透露是有人通知作者腾讯样本搜集人员已购买卡密拿到样本将开始分析，故关闭登录阻止分析，根据皮皮的从业经历，高度怀疑内部有人向他通风报信，存在利益链条**  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bae3d0a4a169d94d.webp)  
\> **所以才会急不可耐地跳出来进行指责**  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/82aecfab59e38100.webp)  
\> **我们潜伏于其网页端交流群内，并无人反馈封号，该作者因为工作经历，深知反作弊“面子学”**

## 简单说就是，这个外挂实现了嵌套虚拟化，所有的作弊行为在host里面完成，扫描并截图开挂用户电脑，上传外挂使用用户qq账号及其他信息，发现有分析工具会传到他的后台，已经属于反向反作弊了

\> **截至目前该外挂已关闭新用户注册，但仍保留存量用户并提供非法服务，明显的是该作者认为AXE并无能力对其进行检测**

Loader.sys是mapper驱动，第二篇会放出内嵌在里面的真实驱动

## 关键词速览：VMX/SVM双端，VMX嵌套虚拟化已实现，一切作弊操作位于VMX root/SVM Host内（不被任何nmi，apc检查，）干掉AXE全部截图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/74d6173c336cc476.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/88fa76178af371aa.webp)  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8b7c9ec2adcbf5c5.webp)

本外挂自去年11月被采集，至今已将近一年，外挂通过高度严格管理与特殊反分析技巧，很难被反作弊分析与处理，实现了长期稳定与巨额盈利

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0f98da8b71147599.webp)  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c772e34d57909df0.webp)

外挂后端登录地址为：https://d0784.com/Card/Login

所有版本都由网页端卡密注册下载，内置一个网页版本的聊天室，体现出高度定制性，但其后端协议存在漏洞，可通过技巧绕过验证（将在第三部分披露），经核实目前日激活量200-300，激活卡总数量超过2万张，结合聊天室内容与部分外挂群组信息交叉验证， **作者盈利2000万以上** （第三部分我们会放出详细证据）。

附件中bat为启动文件， **loader.sys为mapper驱动（混有大量hv字样内容，经分析无实际作用，仅为干扰分析）**

## 0\. 前言：当分析者也成了取证对象

假设你是反作弊分析人员。样本刚拖进 IDA，Wireshark 还开在旁边。对大多数驱动，这只是分析的开始；对这个样本，你打开工具的动作已经进入了它的业务流程。

进程名命中本地名单或服务端规则后， `sub_1400648C0` 会把目标交给 `sub_14007F370` 。它不急着退出，而是先从 DWM/WDDM DirectX 上下文同步生成 JPEG，把画面冻进全局缓冲区。Worker 随后采集进程、驱动、网络和 Windows 历史痕迹，把截图、诊断与冻结报告送往 `/reportData` 。父路径最多给它 90 秒；窗口耗尽后，代码再替换 IDTR、访问 CF9，尝试让机器失去现场。

更麻烦的是，这条“发现—截屏—取证—上传—掀现场”的链不在普通 WDM 回调里。它背后有 Intel VMX 和 AMD SVM 两套 L0，核心决策待在 Host；需要 Windows API 时，再通过 Guest API Bridge 把任务送回 Guest。

故事真正的入口反而很不起眼： `load.bat` ，只有 173 字节。

```bash
@echo off
setlocal
set "DIR=%~dp0"
pushd "%DIR%" || exit /b 1
"%SystemRoot%\System32\rundll32.exe" "%DIR%load.dll",R
set "RC=%ERRORLEVEL%"
popd
exit /b %RC%
```

表面上看，它只是让 `rundll32` 调用 `load.dll` 的导出函数 `R` 。继续往后翻， `load.dll` 里却同时摆着：

```
SYSTEM\CurrentControlSet\Services\
FsFilter78
FSFilter Infrastructure
ImagePath
Start
Group
ACE-BOOT.sys
```

再把 `RegCreateKeyW` 、 `RegSetKeyValueW` 、 `RegDeleteKeyW` 等导入和目录中的 `Loader.sys` 放到一起，外围链路的意图就很难装作没看见了：先争夺开机阶段的加载时机，再由 Loader 把真正的业务驱动映射进内核。

能够直接确认的是， `load.bat` 调用了 `load.dll,R` ； `load.dll` 具备创建驱动服务项所需的字符串和注册表 API； `Loader.sys` 与提取出的 inner driver 存在投递关系。loader.sys通过注册为boot驱动于ACE-BOOT前启动避开预启动监控

真正值得看的，是已经提取并修复 PE 元数据的 `dumped3_inner_ida_fixed.sys` 。我最初也把它归进“套 VT 的内核挂”一类，继续往下追才发现，这个标签太轻了：Intel 侧不只起了 VMX L0，还接管了 Guest 的整套 VMX 指令；AMD 侧另有 SVM/VMCB/NPT 后端；再往上，是共用的 Host Bridge、外挂业务、主机取证和后端风控。

它不是在外挂驱动里加了几条反调试，而是给外挂搭了一层自己的虚拟化操作系统。

* * *

## 1\. 六个结论，先把最离谱的摆在桌面上

三万多个函数很容易把人拖进细节。先不绕路，把决定这个样本威胁等级的六件事摆出来。

### 1.1 一份驱动，Intel/AMD 两套 L0

它不是 Intel-only，也不是检测到 AMD 就退回普通内核路径。

`sub_1401163C0` 查询 CPUID `0x8000000A` ，按逻辑处理器准备 VMCB、NPT 和 #VMEXIT 分发表；启动桩设置 `EFER.SVME` ，执行 VMSAVE，写入 `VM_HSAVE_PA` ，最后进入 `VMLOAD → VMRUN → VMSAVE` 循环。SVM #VMEXIT 进入 `sub_140116A20` ，再与 Intel VMX 路径汇合到同一套 Host 业务层。

能落锤的是 **AMD SVM L0 与 NPT** 。Nested SVM 不能顺手认领：Guest 的 `VMEXIT_VMRUN (0x80)` 当前仍走默认 `#UD` 注入。

### 1.2 Intel 侧不止 L0，它真的接管了 Guest 的 VMX

看到 VMLAUNCH 字符串不算 Nested，替 Guest 维护第二套 VMCS 才算。

VM-exit 表中，VMLAUNCH 指向 `sub_14012A310` ，VMRESUME 指向 `sub_14012AC10` ，两条路径最终进入 `sub_140126C20` 。这个函数含 **223 条 VMX 指令** ：VMREAD 保存原状态，VMCLEAR/VMPTRLD 切换 VMCS，VMWRITE 合成 Guest、Control、Host 字段，最后再次 VMLAUNCH。

再加上 VMPTRST 对主、次 VMCS 的判断和双分发表，Intel Nested VMX 的 Guest 指令接管、状态机、字段搬运和嵌套 VM-entry 已经闭环。

### 1.3 Windows 只是 Guest，Host 才是决策层

样本甚至把“我现在是不是在 Host”写进了自己的诊断报告。

`sub_14011FB10` 读取 `IA32_GS_BASE (0xC0000101)` 或执行 RDGSBASE； `CurrentIsInHost` 的赋值就是：

```c
CurrentIsInHost = (sub_14011FB10() == 0);
```

在当前 IDA 数据库中，这个环境判定有 515 个交叉引用。GS Base 为零时，代码处在样本定义的 Host 语境；作弊状态、内存翻译、取证与上报决策都以这条边界为中心展开。

### 1.4 Host 不能直接调 Windows API？它给自己修了一座桥

VMX root/SVM Host 不能把 Windows 内核 API 当普通本地函数调用，样本的办法是把调用“送回去”。

Guest API Bridge `sub_140121CD0` 在当前数据库中有 259 个交叉引用。它保存目标函数和最多 15 个参数，翻译 Guest 栈页，写入返回桥，改写 Guest RIP/RSP；翻译失败时，还会按当前后端设置 VM-entry/VMCB 异常字段，把 `#PF` 注回 Windows。API 在 Guest 执行，调用的编排权仍在 Host。

### 1.5 它不是防调试，而是在给分析人员建档

IDA、x64dbg、Wireshark 或 BurpSuite 命中后，第一步是同步留住画面。

`sub_14007F370` 立即调用 `sub_1400943C0` ，从 DWM/WDDM DirectX 上下文取出像素，重排成 RGB，以质量 `85` 编码 JPEG。Worker 随后把 `capture.jpg` 连同 `diag.txt` 、冻结报告上传到 `/reportData` 。

诊断内容还覆盖 UserAssist、AppCompatCache、MuiCache、AppSwitched、BAM、Recent、Prefetch、进程、驱动、服务、网络、QQ/MSDK、BootState 和 SMBIOS。工具退出了也不代表痕迹消失：它还会翻 Windows 的历史账本。

### 1.6 证据先送走，最后才轮到机器失去现场

`PsCreateSystemThread` 返回 0 代表成功，这个条件在这里非常关键。

Worker 创建成功后，父路径等待 **90 秒** ，把时间留给截图、诊断和冻结报告上传；Worker 自己完成或放弃上传后再等 3 秒。随后代码替换 IDTR，向 CF9 Reset Control Register 写入复位值，并保留疑似 `KeBugCheckEx` 的后备路径。

所以这不是上传线程和蓝屏线程的随机竞速，而是一扇有上限的证据外传窗口：先把现场带走，再把现场掀掉。

* * *

## 2\. 173 字节只是门铃：真正的东西藏在 inner 里

先别急着追 VMXON 或 VMRUN。这个样本的第一处误导，是让一条只有 173 字节的批处理看起来像全部入口；真正决定威胁等级的代码，还隔着 `load.dll` 、 `Loader.sys` 和一层被提取修复的 inner driver。

### 2.1 样本清单

| 文件  | 大小（字节） | SHA-256 | 角色  |
| --- | --- | --- | --- |
| `load.bat` | 173 | `0f2811985aa6d4354dd51126f41eb8299cad4a91a078059d751ba33d1aba938f` | 启动入口 |
| `load.dll` | 2,842,624 | `fe3363e025a759e525285fb8b54534c17e793767dc62721dfe602e366e94ae36` | 导出 `R` ，负责外围加载 |
| `Loader.sys` | 8,245,976 | `9ec544607e6ab4924411135310732ef6025763336367df66251cbcc88275d8ff` | Mapper/外层驱动 |
| `dumped3_inner_ida_fixed.sys` | 7,012,352 | `2c5c7a862b0c1d4b90c286a47784b30641244008b4a555a479b37f0a0ba360bb` | 本文重点 |

整个投递关系可以先画成这样：

```css
flowchart LR
    A[load.bat<br/>173 bytes] --> B[rundll32 load.dll,R]
    B --> C[创建/调整驱动服务<br/>高置信静态判断]
    C --> D[Loader.sys<br/>外围 Mapper]
    D --> E[dumped3_inner_ida_fixed.sys<br/>真正业务驱动]
    E --> F[VMP 入口]
    F --> G[VMX/SVM L0 + Intel Nested VMX]
    G --> H[外挂功能 / 反分析 / 取证上报]
```

先把两条证据边界钉死：

1.  `load.dll` 中的服务字符串、ACE 字符串和注册表 API 能证明其启动阶段意图，但“必然早于 ACE-BOOT”没有动态启动日志支持；
2.  inner 是从 Loader 映射对象中提取并修复的 PE。本文地址都以修复后的映像基址 `0x140000000` 为准，不代表它原始落盘时一定以标准驱动方式加载。

### 2.2 inner 的 PE 画像

| 属性  | 值   |
| --- | --- |
| 架构  | x86-64 |
| ImageBase | `0x140000000` |
| EntryPoint | `0x1401006B0` |
| SizeOfImage | `0xE828000` |
| IDA 识别函数 | 29,877 |
| 已命名函数 | 12,317 |
| 字符串 | 2,214 |
| 节区  | 8   |

文件本身只有约 6.69 MiB，虚拟映像却超过 232 MiB。主要原因是 `.data` 的虚拟范围异常庞大：

| 节区  | 范围  | 权限  | 大小  |
| --- | --- | --- | --- |
| `.text` | `0x140001000–0x140217000` | RX  | `0x216000` |
| `.rdata` | `0x140217000–0x140255000` | R   | `0x3E000` |
| `.data` | `0x140255000–0x14E3DF000` | RW  | `0xE18A000` |
| `.pdax` | `0x14E3DF000–0x14E3F1000` | R   | `0x12000` |
| `_XFS` | `0x14E3F1000–0x14E3F4000` | RX  | `0x3000` |
| `.CRT` | `0x14E3F4000–0x14E3F5000` | R   | `0x1000` |
| `_NPR` | `0x14E3F5000–0x14E3F6000` | RW  | `0x1000` |
| `.vbv0` | `0x14E3F6000–0x14E827000` | RX  | `0x431000` |

文件尺寸和虚拟映像的巨大落差，已经把保护器和运行时状态区暴露出来；`.vbv0` 更不是普通代码节，入口下一跳就会钻进去。接下来如果把这层软件虚拟机和硬件 Hypervisor 混为一谈，整篇分析都会从术语上跑偏。

* * *

## 3\. VMP 只是门帘，门后才是真正的 Hypervisor

`DriverEntry` 短得近乎挑衅：不初始化设备、不注册回调，只把分析者往下一层跳板推。

```c
// 0x1401006B0
NTSTATUS __stdcall __noreturn DriverEntry(...)
{
    sub_1400FFC10();
}
```

再跟一层：

```c
// 0x1400FFC10
void __noreturn sub_1400FFC10()
{
    __readeflags();
    sub_14E4B6F5A();       // 位于 .vbv0
    ((void (*)(void))loc_140097329)();
}
```

入口从正常 `.text` 很快跳进 `.vbv0` ，可以确认样本使用了 VMProtect 一类的软件代码虚拟化保护。这里最容易出现一个术语事故：看到 VMP 的“虚拟机”，又看到 VT-x 的“虚拟机”，最后把两者一起叫“嵌套虚拟化”。

实际上，这个样本里同时存在四件必须分开的东西：

| 层次  | 它是什么 | 证据  | 作用  |
| --- | --- | --- | --- |
| VMP 软件 VM | 字节码解释器/代码混淆 | `.vbv0` 入口跳板 | 阻碍静态分析 |
| Intel VMX L0 | CPU VMX root 控制层 | VMXON、VMLAUNCH、VM-exit dispatcher、EPT | 在 Intel CPU 上把 Windows 放进 Guest |
| AMD SVM L0 | CPU SVM Host 控制层 | EFER.SVME、VM_HSAVE_PA、VMRUN、VMCB、NPT | 在 AMD CPU 上把 Windows 放进 Guest |
| Intel Nested VMX | L0 模拟 L1 的 VMX 操作 | VMLAUNCH/VMRESUME exit handler、双 VMCS、字段搬运 | 允许 Intel Guest 内继续运行虚拟化层 |

当前文件完成的是 PE 容器级修复：IDA 能正常装载，VMP 入口能够识别，但这绝不等于所有虚拟函数都已语义级还原。好消息是，真正决定能力边界的 Hypervisor、反分析和上报逻辑，大量落在可读的 `.text` 中。门帘不用整块拆掉，我们已经能从门缝里看见 Intel 与 AMD 两套硬件后端。

* * *

## 4\. 一份驱动，两套后端：Intel 走 VMX，AMD 走 SVM

只搜 VMX 指令，会得到一个看似完整、其实漏掉半边的答案。这个 inner 没有要求用户必须用 Intel：它先按 CPU 能力分流，再让 VMCS/EPT 与 VMCB/NPT 两条路径汇入同一套 Host 控制面。

### 4.1 上游痕迹

样本中直接残留了：

```
https://github.com/jonomango/hv
```

以及一批高度一致的 `[hv]` 日志：

```
[hv] VMX not supported by CPUID
[hv] VMX not enabled outside SMX
[hv] VMXON failed
[hv] VMCLEAR failed
[hv] VMPTRLD failed
[hv] Wrote VMCS fields
[hv] VMLAUNCH failed. Instruction error = %lli
[hv] Launched VM on VCPU#%i
[hv] Successfully pinged the hypervisor
[hv] Mapped all of physical memory to address 0x%zX
```

公开的 [jonomango/hv](https://github.com/jonomango/hv) 是一个轻量级 x86-64 Intel VT-x Hypervisor。样本显然复用或深度改造了这套基础设施；但后面看到的 Nested、Host 调用桥和业务控制面已经远超一个原样搬运的开源 Demo，所以本文只把上游当作设计背景，不拿上游代码代替样本证据。

### 4.2 Intel VMX 启动链

`sub_14012E580` 是最直观的启动函数：

```c
// 0x14012E580，节选
cr0 = __readcr0();
cr4 = __readcr4();

__writecr0((cr0 | fixed0_cr0) & fixed1_cr0);
__writecr4((cr4 | fixed0_cr4 | CR4_VMXE) & fixed1_cr4);

revision_id = __readmsr(IA32_VMX_BASIC);
vmxon  [vcpu + 0x633710];       // 0x14012E6D7

setup_vmcs(vcpu);
vmlaunch;                       // 0x14012E757
```

正常启动后，Windows 从 L0 的视角变成 VMX non-root Guest。VM-exit 入口 `sub_14012D830` 会读取：

```
0x4402  VM_EXIT_REASON
0x681C  GUEST_RSP
0x681E  GUEST_RIP
0x6820  GUEST_RFLAGS
0x440C  VM_EXIT_INSTRUCTION_LEN
```

然后按 exit reason 进入 `funcs_14012D906[]` 。它不是只有一个 VMCALL 后门，而是一套完整的 VM-exit 控制面。

### 4.3 Intel 后端的基础能力

| 能力  | 代表证据 |
| --- | --- |
| 每 CPU 的 VCPU/VMCS | `Allocated %u VCPUs` 、per-VCPU 大结构 |
| EPT | INVEPT、 `EPT USED PAGES` 、EPT PTE 更新函数 `sub_140124CF0` |
| VPID | INVVPID、CR 写入处理 `sub_14012D2D0` |
| Guest 内存访问 | `read_guest_virtual_memory` 日志、地址翻译 `sub_14011C100` |
| 全物理内存映射 | `Mapped all of physical memory...` |
| 自定义 Hypercall | `sub_1401E0649` 执行 VMCALL，key= `0x6952695269695269` |
| 退出与恢复 | `sub_1401E0710` 执行 VMRESUME |

如果分析停在这里，最多只能说它有一个 Intel L0 Hypervisor。但样本没有把 AMD 用户扔回普通驱动路径：同一套 Host 控制面下面，还压着一套完整的 SVM/VMCB 后端。

### 4.4 AMD SVM：不是字符串兼容，而是能跑起来的第二套后端

如果只在二进制里搜 VMXON、VMREAD、VMWRITE，结论会直接错一半。样本用 `byte_14828F2FA` 区分两套硬件后端：该值进入 Intel 分支时，代码读写 VMCS；进入 AMD 分支时，同一批函数改为直接读写 VMCB，并通过 `sub_1401E0327` 回到 VMRUN 循环。

先把整个分叉画出来：

```rust
flowchart TB
    CPU{CPU 厂商与虚拟化能力} -->|Intel| VMX[Intel VMX L0<br/>VMCS + EPT]
    CPU -->|AMD| SVM[AMD SVM L0<br/>VMCB + NPT]
    VMX --> NVMX[Nested VMX<br/>已确认]
    SVM --> NSVM[Nested SVM<br/>未确认：Guest VMRUN → #UD]
    VMX --> HOST[共享 Host 控制面]
    SVM --> HOST
    HOST --> BRIDGE[Guest API Bridge<br/>sub_140121CD0]
    BRIDGE --> WIN[Windows Guest API]
    HOST --> OPS[作弊逻辑 / 主机取证 / 截图上传]
```

这张图里最重要的不是“同时支持两家 CPU”，而是两套硬件入口最终汇入同一套 Host 业务层。换了厂商，底层控制结构从 VMCS/EPT 变成 VMCB/NPT，外挂的取证、截图和上报逻辑并没有降级。

#### 4.4.1 从 CPUID 到 VMRUN，SVM 启动链是闭合的

`sub_1401163C0` 在 `0x1401164B2` 执行：

```
mov eax, 8000000Ah
cpuid
```

`0x8000000A` 是 AMD 的 SVM Revision and Feature Identification 叶。样本保存返回的版本、ASID 数量和能力位，然后按逻辑处理器准备 AMD 后端所需的大块状态、VMCB、Host Save Area、NPT 与拦截位图。

真正把处理器推进 SVM 模式的代码位于 `0x1401161E2` 一带：

```
1401161E2  mov     ecx, 0C0000080h    ; EFER
1401161E7  rdmsr
1401161F0  bts     rax, 0Ch           ; EFER.SVME = 1
1401161FC  wrmsr

1401162E3  mov     rax, [rdi+621080h]
1401162EA  vmsave rax
1401162ED  mov     rdx, [rdi+621078h]
1401162F4  mov     ecx, 0C0010117h    ; VM_HSAVE_PA
140116300  wrmsr
```

按照 AMD 的定义， `EFER.SVME` 是 SVM 总开关； `VM_HSAVE_PA` 保存一块 4KB Host State Save Area 的物理地址，第一次 VMRUN 前必须设置。样本不仅把两个条件都做了，还先用 VMSAVE 保存扩展 Host 状态，随后切换自己的 GDT/IDT 和 Host CR3，在 `0x14011634D` 调用 `0x1401E0280` 进入 SVM 汇编桩。

#### 4.4.2 VMLOAD、VMRUN、VMSAVE 组成了真正的 Guest 循环

`sub_1401E0288` 只有 159 字节，却是 AMD 后端的心跳：

```
1401E028C  vmload
1401E028F  vmrun
1401E0292  vmsave
             ; 保存 GPR/XMM
1401E02E0  call sub_140116A20
             ; 恢复 GPR/XMM
1401E0322  jmp  sub_1401E0288
```

VMRUN 从 RAX 取得 VMCB 物理地址并进入 Windows Guest；发生 #VMEXIT 后，处理器回到下一条 VMSAVE，样本保存寄存器现场，把控制交给 `sub_140116A20` ，处理完再恢复现场继续 VMRUN。

`sub_1401E0327` 则是从 Host 业务代码返回 AMD Guest 的恢复入口。更关键的是，它的调用者里直接出现了 `sub_140121670` 、 `sub_140121900` 和 Guest API Bridge `sub_140121CD0` 。换句话说，AMD 后端不是一座孤岛：Host 里编排 Windows API、注入 Guest 异常、翻译 Guest 页表的那套控制面，确实能沿 SVM 路径回到 Windows。

#### 4.4.3 退出表、MSR 拦截和 NPT 都不是空壳

`sub_140116A20` 从 `VMCB + 0x70` ，也就是 `a1 + 0x6070` 读取 EXITCODE。退出原因小于 `0x404` 时，它用 EXITCODE 直接索引 `funcs_140116AB3` ：

```c
exit_code = *(uint64_t *)(vcpu + 0x6070);

if (exit_code < 0x404)
    funcs_140116AB3[exit_code](vcpu, regs);
else
    inject_ud(vcpu);
```

表基址是 `0x14D293230` 。初始化函数先把 1028 个槽位全部填成默认 handler `sub_140116B60` ，随后再覆盖真正支持的退出类型：

| EXITCODE | AMD #VMEXIT | Handler | 样本行为 |
| --- | --- | --- | --- |
| `0x7B` | IOIO | `sub_1401176E0` | 接管端口 I/O |
| `0x7C` | MSR | `sub_140116D90` | 处理 EFER、VM_CR、VM_HSAVE_PA 等敏感 MSR |
| `0x81` | VMMCALL | `sub_140118380` | 进入 AMD Hypercall 路径 |
| `0x400` | Nested Page Fault | `sub_140116B70` | 处理 NPT 缺页与映射切换 |

NPT 也有完整落点。 `sub_140115620` 构造分层页表并建立大页映射， `sub_140116B70` 根据 NPF 的 EXITINFO 判断访问类型和映射状态， `sub_140115FC0` 在需要时更换 NPT 根、清理 VMCB 控制位并请求 TLB 刷新。

这里要把两个 “Nested” 拆开： **Nested Page Table 是 AMD 的二阶段地址翻译，相当于 Intel EPT；它不等于 Nested SVM。** 有 NPT，只能证明 L0 在翻译 Guest Physical Address，不能证明 Guest 里的 L1 还能再次执行 VMRUN 管理 L2。

#### 4.4.4 有 VMRUN，不代表它实现了 Nested SVM

判断 Nested SVM 最直接的办法，是看 Guest 执行 VMRUN 后，L0 有没有模拟下一层 VMCB。AMD 为这个事件定义的 EXITCODE 是 `0x80` ，对应槽位为：

```
0x14D293230 + 0x80 * 8 = 0x14D293630
```

当前数据库中， `0x14D293630` 没有专用 handler 覆盖；它仍然是初始化阶段填入的 `sub_140116B60` 。这个默认函数只做一件事：

```c
*(uint64_t *)(vcpu + 0x60A8) = 0x80000306;
```

`0x80000306` 解码后是 valid=1、type=3、vector=6，也就是向 Guest 注入 `#UD` 。相邻的 VMLOAD、VMSAVE 等 SVM 指令退出同样没有发现一套类似 `sub_140126C20` 的 VMCB 搬运和嵌套 VM-entry 逻辑。

因此，这里的证据等级必须分开写：

| 能力  | 结论  |
| --- | --- |
| Intel VMX L0 | 已确认 |
| Intel Nested VMX | 已确认 |
| AMD SVM L0 | 已确认 |
| AMD NPT | 已确认 |
| AMD Nested SVM | 未确认；当前静态证据显示 Guest VMRUN 进入默认 `#UD` 路径 |

AMD 后端已经足以把 Windows 放进 SVM Guest，并承载同一套 Host 控制面；但接下来要讲的真正嵌套虚拟化闭环，目前只在 Intel VMX 路径成立。

> **反作弊视角：** 不要把 `VMXON` 当成 VT 外挂的唯一入口。CPU 厂商判断、 `EFER.SVME` 、 `VM_HSAVE_PA` 、VMRUN/VMCB 与 NPT 同样应进入驱动静态特征和虚拟化异常遥测，否则 AMD 机器会成为天然盲区。

* * *

## 5\. 有了 VMRUN 就是 Nested SVM？恰恰相反，闭环只在 Intel

上一节已经证明 AMD 后端能执行 VMRUN，却也证明 Guest VMRUN 会落入默认 `#UD` 。真正跨过“L0 能跑”与“L0 能替 L1 再管一层”这道门槛的，是 Intel 路径。先把层级画清楚；VMP 软件 VM 不在图里，因为它是代码混淆，不是硬件虚拟化层。

```rust
flowchart TB
    HW[物理 CPU / VMX] --> L0[L0：外挂 Hypervisor<br/>VMX root，核心控制面]
    L0 --> PVMCS[Primary VMCS<br/>运行 Windows]
    PVMCS --> L1[L1：Windows Guest<br/>VMX non-root]
    L1 -->|执行 VMX 指令产生 VM-exit| NEST[Nested VMX 模拟器]
    NEST --> SVMCS[Secondary VMCS<br/>保存并合成嵌套状态]
    SVMCS --> L2[L2 Guest<br/>由 L1 虚拟化层管理]
    NEST -->|VMPTRST 判断当前 VMCS| DISP[主/次 VM-exit 分发表]
```

### 5.1 VM-exit 表里真的有 VMLAUNCH 和 VMRESUME

Intel 定义的基本 VM-exit reason 中，20 是 VMLAUNCH，24 是 VMRESUME。把 `funcs_14012D906` 按 8 字节指针解析后，相关条目如下：

| Exit reason | 指令  | Handler |
| --- | --- | --- |
| 18  | VMCALL | `sub_1401293D0` |
| 19  | VMCLEAR | `sub_14012A190` |
| **20** | **VMLAUNCH** | **`sub_14012A310`** |
| 21  | VMPTRLD | `sub_14012A3C0` |
| 22  | VMPTRST | `sub_14012A580` |
| 23  | VMREAD | `sub_14012A670` |
| **24** | **VMRESUME** | **`sub_14012AC10`** |
| 25  | VMWRITE | `sub_14012AA00` |
| 26  | VMXOFF | `sub_14012B0C0` |
| 27  | VMXON | `sub_14012B170` |

一个 L0 如果只想自己使用 VT-x，根本不需要为 Guest 的整套 VMX 指令准备 handler。这里从 VMCLEAR 到 VMXON 几乎齐全，已经是非常强的 Nested 信号。

### 5.2 VMLAUNCH/VMRESUME handler 不是空壳

`sub_14012A310` 会检查虚拟 VMCS 状态。状态允许时：

```c
// Guest 执行 VMLAUNCH
if (nested_vmcs_state == 1)
    return sub_140126C20(vcpu, 1);
else {
    set_vm_instruction_error(4);  // VMLAUNCH with non-clear VMCS
    advance_guest_rip();
}
```

`sub_14012AC10` 则是：

```c
// Guest 执行 VMRESUME
if (nested_vmcs_state == 8)
    return sub_140126C20(vcpu, 0);
else {
    set_vm_instruction_error(5);  // VMRESUME with non-launched VMCS
    advance_guest_rip();
}
```

错误码 4、5 与 Intel VM-instruction error 的语义相符。也就是说，它不仅拦住了指令，还在模拟 VMCS 生命周期和失败行为。

### 5.3 223 条 VMX 指令的 VMCS 搬运器

两条 handler 最终进入 `sub_140126C20` 。这个函数有 751 条机器指令，其中搜索到 223 条 VMX 指令。它先从当前 VMCS 读出大批字段，覆盖：

| 编码范围 | 类别  | 样本行为 |
| --- | --- | --- |
| `0x4800` 起 | 32-bit Guest State | 连续 VMREAD 到 VCPU 保存区 |
| `0x4000` 起 | 32-bit Control Fields | 读取并修正控制位 |
| `0x6000` 起 | Natural-width Control | 保存 CR mask/shadow 等状态 |
| `0x2000` 起 | 64-bit Control Fields | 保存 EPTP、MSR bitmap 等控制指针 |
| `0x2800` 起 | 64-bit Guest State | 保存 Guest PAT/EFER 等 |
| `0x0C00` 起 | 16-bit Host State | 保存 Host selector |
| `0x6C00` 起 | Natural-width Host State | 保存 Host CR、FS/GS、RSP、RIP 等 |

中间最关键的切换只有两条，却非常扎眼：

```
1401272BD  vmclear qword ptr [r12+636030h]
1401272EC  vmptrld qword ptr [r12+636030h]
```

切换后，它又用大量 VMWRITE 把刚才保存、合并后的字段写入 secondary VMCS。若是首次进入，函数尾部直接：

```
140127AD5  vmlaunch
```

这不是“为了兼容 VMX 而留了几个字符串”，而是在真正构造下一层可运行的 VMCS。

### 5.4 主、次 VMCS 各有一张分发表

总分发器 `sub_14012D830` 还存在以下逻辑：

```c
vmptrst(&current_vmcs);

if (current_vmcs == vcpu->primary_vmcs) {
    funcs_14012D906[exit_reason](vcpu);
} else {
    if (!funcs_14012D96B[exit_reason](vcpu))
        funcs_14012D906[exit_reason](vcpu);
}
```

这一步把证据补齐了：它知道当前退出来自 primary 还是 secondary VMCS，并为 secondary 状态准备了额外分发层。

到这里，Intel Nested VMX 才能写成 **已确认** ：Guest VMX 指令接管、虚拟 VMCS 状态机、主/次 VMCS 切换、字段合成和嵌套 VM-entry，五个环节都由样本直接闭环。这个结论绝不外推到 AMD Nested SVM；下一步更值得追的是，这个 L0 为什么需要替业务代码频繁调用 Windows。

* * *

## 6\. Windows 不是主人，而是它随叫随到的 Guest 服务端

Hypervisor 能拦截 Windows，不代表它能脱离 Windows。最反常的地方在于：样本把核心控制流留在 L0 Host，却把 Windows 内核当成一组需要时才调度的系统服务。

严格来说， `ZwQuerySystemInformation` 、 `PsCreateSystemThread` 仍必须在 Windows Guest 语境中执行；Intel VMX root 或 AMD SVM Host 都不能把这些内核代码当成本地普通函数随便调用。本文所说的“Host 主路径”，准确含义是： **状态管理、内存翻译和业务决策长期驻留 L0；碰到必须依赖 Windows 的动作，再通过后端适配把调用编排回 Guest，完成后返回 Host。**

### 6.1 它用 GS Base 判断自己在哪一边

```c
// sub_14011FB10 @ 0x14011FB10
uint64_t get_gs_base(void)
{
    if (!cpu_caps_initialized)
        init_cpu_caps();

    if (!has_fsgsbase)
        return __readmsr(0xC0000101);  // IA32_GS_BASE

    return __rdgsbase_u64();
}
```

正常 x64 Windows 内核里，GS Base 指向每 CPU 的 KPCR，不会是 0。公开上游 `jonomango/hv` 的 Host VMCS 初始化恰好执行：

```cpp
vmx_vmwrite(VMCS_HOST_FS_BASE, reinterpret_cast<size_t>(cpu));
vmx_vmwrite(VMCS_HOST_GS_BASE, 0);
```

样本的 `BootState` 又把 `GS_BASE == 0` 明确定义成 `CurrentIsInHost=1` 。上游设计、样本判断和诊断输出三者互相吻合。

### 6.2 515 个环境判断，259 个调用桥引用

拿一个真实调用点看最清楚。很多函数都会先解码一个 Windows API 地址，然后写成：

```c
if (sub_14011FB10()) {
    // GS Base != 0：当前在 Windows Guest，可直接调用
    status = decoded_windows_api(arg1, arg2, arg3, arg4);
} else {
    // GS Base == 0：当前在 L0 Host，走 Guest API Bridge
    status = sub_140121CD0(decoded_windows_api,
                           arg1, arg2, arg3, arg4,
                           0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}
```

这套双路径不只出现在 Hypervisor 初始化函数里。BootState 查询、内存分配释放、线程创建、延时、系统信息查询等大量位置都在使用。

### 6.3 Guest API Bridge 怎么工作

`sub_140121CD0` 接收一个目标 API 地址和最多 15 个参数。核心流程可以压缩成下面这张图：

```rust
sequenceDiagram
    participant H as L0 Host 逻辑
    participant B as sub_140121CD0 Bridge
    participant V as VMCS / VMCB 与 VCPU State
    participant G as Windows Guest

    H->>B: target_api + 最多15个参数
    B->>V: 保存目标与参数，取 Guest RIP/RSP/CR3
    B->>B: 翻译 Guest 栈虚拟地址
    alt 地址翻译成功
        B->>G: 向 Guest 栈写入返回桥地址
        B->>V: 按后端改写 Guest RIP/RSP
        B->>G: VMRESUME / VMRUN，执行 Windows API
        G-->>H: 返回值经桥接状态带回 Host
    else 地址翻译失败
        B->>V: 写 CR2，准备 #PF 注入信息
        B->>G: 恢复 Guest，让其处理页故障
    end
```

具体证据包括：

1.  入口先把 `a1` 到 `a16` 写入每线程/每 VCPU 状态区；
2.  Intel 分支读取 Guest CR3（VMCS `0x6802` ）；AMD 分支读取对应的 VMCB/VCPU 保存状态，随后取得 Guest RSP 并把新栈向下对齐；
3.  `sub_14011C100` 把 Guest 虚拟地址翻译到 Host 可访问映射；
4.  `sub_1401EA340` 把返回桥地址写到 Guest 栈；
5.  Intel 成功路径 VMWRITE `0x681E` （GUEST_RIP）和 `0x681C` （GUEST_RSP）；AMD 路径则改写对应 VMCB Guest State；
6.  翻译失败时写 CR2，并按当前后端准备异常注入字段；Intel VM-entry interruption-information 可见 `0x80000B0E` ，对应有效的 #PF 注入描述；
7.  Intel 状态就绪后由 `sub_1401E0710` 执行 VMRESUME；AMD 调用链则经 `sub_1401E0327` 回到 VMRUN 循环。

这座桥把架构关系彻底翻了过来：Host 不是 VM-exit 时看一眼寄存器的薄层，而是业务代码的主要运行环境；Windows 被降成了“需要系统服务时临时唤醒的 Guest 执行端”。后文所有“Host 主路径”都采用这个严格定义，不会把实际在 Guest 执行的 Windows API 冒充成 Host 本地调用。

> **反作弊视角：** 单看驱动对象、回调和导入表，很可能只看到被 Host 临时借用的 Windows 外壳。调查时应把异常 Guest RIP/RSP 改写、跨地址空间栈构造、CR2/#PF 注入，以及 VMRESUME/VMRUN 前后的调用编排串成一条行为链。

* * *

## 7\. 别被 Hypervisor 抢戏：它首先是个《三角洲行动》外挂

两套 L0、Nested VMX 和 Guest Bridge 很容易让人忘记最基本的问题：设计者费这么大力气，究竟要保护什么？inner 里的明文配置没有绕弯子：

```
DeltaForceMenuConfigV1
Aimbot
AimbotPredict
AimbotHotKey
AntiRecoil
AimbotVehicle
UseAimbotCurve
AimRadius
DrawMiniMapRadar
RenderDist
ShowAimRadius
```

| 功能面 | 样本证据 | 说明  |
| --- | --- | --- |
| 自瞄/预测 | `Aimbot` 、 `AimbotPredict` 、 `AimRadius` | 配置与业务结构已确认 |
| 后坐力控制 | `AntiRecoil` | 配置项已确认 |
| 雷达/ESP | `DrawMiniMapRadar` 、 `RenderDist` | 配置项已确认 |
| 载具目标 | `AimbotVehicle` | 配置项已确认 |
| 游戏内存访问 | EPT、Guest VA 翻译、CR3/进程结构 | 提供底层读写原语 |
| 内核绘制 | DWM PresentThread、SwapChain、D3D device/context | 绘制与截图共用图形上下文 |

图形状态诊断尤其详细：

```toml
[Wddm]
Mode=DwmSwapChain / WDDM32Overlay
DwmPID=%llu
DwmPresentThreadId=%llX
SwapChainClass=%llX
SwapChainGetBufferFn=%llX
UseDirect2D=%lu
FilterSwapChain=%d

DirectX=%llX
OverlaySwapChain=%llX
SwapChain=%llX
D3DDevice=%llX
D3DDeviceContext=%llX
MainRenderTargetView=%llX
```

这也解释了后面的截图为什么不需要再走一套 GDI 桌面抓屏：样本本来就掌握着 DWM/DirectX 的 SwapChain 与缓冲区。

所以，Hypervisor 不是脱离业务的技术展示，而是自瞄、雷达、内存访问和内核绘制的隐蔽底座。功能面确认以后，下一条线就顺理成章了：它如何判断是谁在盯着这套控制面。

* * *

## 8\. 第一张网：本地名单命中，远程规则还能随时加人

如果反分析只靠 14 个写死的进程名，改名就能绕过去。这个样本把名单拆成两层：驱动内置一批立即生效的目标，服务端再下发动态特征和额外取证动作。

### 8.1 硬编码工具表

`off_140225370` 指向 14 个字符串。 `sub_1400649F0` 会取得进程映像名，逐项执行不区分位置的子串搜索，命中后把数组索引当作 feature code 交给 `sub_1400648C0` 。

| Code | 匹配串 | 目标类别 |
| --- | --- | --- |
| 0   | `cheatengine` | 内存编辑器 |
| 1   | `x64dbg.exe` | 调试器 |
| 2   | `ida.exe` | 逆向工具 |
| 3   | `QQ1.exe` | 可疑重命名/环境指纹 |
| 4   | `QQMusic1.exe` | 可疑重命名/环境指纹 |
| 5   | `defenderdaemon` | 安全软件 |
| 6   | `WeChat1.exe` | 可疑重命名/环境指纹 |
| 7   | `Wireshark` | 抓包工具 |
| 8   | `tcpdump` | 抓包工具 |
| 9   | `Fiddler` | HTTP 代理 |
| 10  | `Charles` | HTTP 代理 |
| 11  | `BurpSuite` | HTTP 代理 |
| 12  | `Proxyman` | HTTP 代理 |
| 13  | `____Sunny.exe` | SunnyNet 相关代理 |

关键循环非常朴素：

```c
for (i = 0; i < 14; i++) {
    needle = normalize(off_140225370[i]);
    if (substring(process_name, needle))
        sub_1400648C0(i, process_object);
}

if (sub_140063E30(process_name))
    sub_1400648C0(101, process_object);
```

这里没有什么“AI 检测”，胜在覆盖面直接：调试、反编译、内存修改、抓包、代理，一个都不想让你开。

### 8.2 动态规则：名单可以从服务端更新

`sub_14007B900` 会以 `banned-features` 为动作名请求配置，成功后进入 `sub_140063FE0` 。解析结构为：

```json
{
  "data": {
    "features": [
      {"featureType": 1, "featureValue": "..."}
    ]
  }
}
```

`featureType` 的静态行为可以分成三类：

| Type | 行为  | 证据强度 |
| --- | --- | --- |
| 1   | 小写化后进入第一组字符串/哈希容器 | 已确认 |
| 2   | 小写化后进入第二组字符串/哈希容器 | 已确认 |
| 4   | 保存为需要额外取证的特征项，随后走二进制报告路径 | 已确认 |

进程名匹配函数 `sub_140063E30` 使用标准 64 位 FNV-1a：

```c
hash = 0xCBF29CE484222325;
for (byte : lowercase(process_name))
    hash = (hash ^ byte) * 0x100000001B3;
```

FNV-1a 只是快速哈希和桶定位，不是加密。厉害的不是哈希，而是后面的运营能力：本地驱动不升级，服务端也能换一批要抓的人。

### 8.3 Type-4 会额外上传二进制证据

动态规则解析完成后， `sub_14007B900` 紧接着调用 `sub_140078420` 。后者构造 `reportType=reportData` ，以 `application/octet-stream` 交给通用上传函数 `sub_140076D60` 。样本还保留了：

```
banned feature type4 matched
bannedFeatureMatched
```

因此它不是只给后端发一句“发现 IDA”，还为某些远程特征准备了原始二进制证据通道。

### 8.4 对 ACE 和录屏环境也有感知

样本中能直接找到：

```
ACE-BOOT.sys
ace-boot.sys
ACEHooked
HuyaPresenter.exe
DYToolEx.exe
obs.exe
obs64.exe
livehime.exe
```

ACE 字符串说明它明确知道对手是谁；直播/录屏进程则更像产品风控的一部分。部分分支仍需动态验证，不能只凭字符串把所有进程都写成“命中即重启”。但本地表、远程规则和 Type-4 二进制回传已经证明：它面对的不是一次性调试，而是一套可以持续运营的反分析策略。就算工具已经退出，第二张网还在等着翻历史记录。

* * *

## 9\. 第二张网：工具关了，它还会翻 Windows 的历史账

删进程、改文件名、关掉 IDA，现场就干净了吗？ `sub_14004FE60` 给出的答案是否定的。它不是简单枚举当前进程，而是一个把 Windows 主机当取证现场的统一诊断编排器。

它为每个采集器记录：

```
[DiagTime] Name=%s | ElapsedMs=%llu | AddedSize=%llu
[DiagTime] TotalMs=%llu | Size=%llu
```

然后把结果汇总成一份大诊断缓冲。Worker 紧急路径和正常会话路径都会调用它。

### 9.1 它到底收什么

| 采集项 | 代表函数 | 数据源 | 它想回答的问题 |
| --- | --- | --- | --- |
| UserAssist | `sub_140043800` | Explorer UserAssist | 哪些程序被用户启动过 |
| AppCompatCache | `sub_140043B40` | Session Manager AppCompatCache | 哪些可执行文件曾出现/运行 |
| AppCompat Store | `sub_1400512F0` | AppCompatFlags Store | 兼容性助手记录了什么程序 |
| MuiCache | `sub_1400515E0` | Shell MuiCache | 可执行文件路径及显示名痕迹 |
| AppSwitched | `sub_1400518D0` | FeatureUsage AppSwitched | 哪些窗口近期被切换过 |
| BAM | `sub_140044510` | `Services\bam\State\UserSettings` | 后台程序活动历史 |
| RecentFiles | `sub_14004EDD0` | 用户 Recent/.lnk | 最近打开过什么文件 |
| Prefetch | `sub_14004E270` | `C:\Windows\Prefetch` | 工具即使退出，是否留下预取记录 |
| Processes | `sub_14004FA40` | 系统进程枚举 | 当前还在运行什么 |
| Drivers | `sub_14004F6C0` | 已加载模块 | 是否加载了分析/反作弊驱动 |
| ServiceDrivers | `sub_14004C870` | CurrentControlSet Services | 安装过哪些服务和驱动 |
| TcpipNetwork | `sub_14004B000` | TCP/IP Interfaces | 网络与代理环境如何 |
| QQ  | `sub_140049E90` | Tencent/QQ 路径 | 用户目录与环境侧写 |
| MSDKRecord | `sub_14004F2B0` | Temp/MSDK | 游戏 SDK 临时记录 |
| BootState | `sub_14004D8B0` | KUSER_SHARED_DATA/系统查询 | 当前是否 Boot 驱动、HV、Host、Secure Boot/HVCI |
| Hardware | `sub_14010E920` | SMBIOS/硬件信息 | 机器与 HWID 环境 |
| WDDM | `sub_14004DCC0` | DWM/DirectX 状态 | 当前绘制与截图上下文 |

这张表里，前六项尤其狠。它们都是 Windows 取证里常用的历史痕迹。分析人员把 `ida.exe` 改名、用完后退出，甚至临时清掉当前进程，也不代表这些痕迹会一起消失。

### 9.2 进程和服务报告也不是只记一个名字

服务/驱动记录格式为：

```perl
[%04llu] Name=%s | Display=%s | Type=%08X | Start=%08X |
Error=%08X | LastWrite=%s | File=%s | ImagePath=%s | Signer=%s
```

进程枚举还会统计：

```
[Processes] Reported=%llu | ReportLimitSkipped=%llu |
MicrosoftSignerSkipped=%llu | ReportLimit=%llu
```

也就是说，它不只是“扫进程名”，而是在整理一份可以交给运营人员复核的环境报告：路径、签名者、启动类型、最后写入时间都尽量带上。

### 9.3 BootState 是整套架构留下的自白

`sub_14004D8B0` 输出：

```toml
[BootState]
IsCurrentBootDriver=%d
IsHvLoaded=%d
CurrentIsInHost=%d
TickCount64Ms=%llu
UptimeSeconds=%llu

SecureBootCapable=%d
SecureBootEnabled=%d
CodeIntegrityOptions=%08X
TestSigning=%d
DebugMode=%d
HvciKmci=%d
HvciStrict=%d
HvciIum=%d
```

普通外挂只需要找到游戏 PID；这个样本还要知道自己是不是 Boot 驱动、L0 是否启动、当前代码是否在 Host、HVCI 与测试签名是否开启。它收集的不是“游戏状态”，而是一份可以回放分析环境的档案。接下来那张截图，则把这份档案从文字证据变成了现场画面。

* * *

## 10\. IDA 刚启动，截图已经进了全局缓冲区

最容易看错的，不是 JPEG 编码，而是动作顺序。样本不是等异步线程慢慢判断后再截图；命中发生的同一条同步路径里，画面已经先被冻结，Worker 只负责把它和诊断材料一起送出去。

### 10.1 不是发现 IDA 后再慢慢截图，而是先把现场冻住

命中工具后， `sub_14007F370` 在创建 Worker 之前就执行：

```c
uint8_t *jpeg = NULL;
uint32_t jpeg_size = 0;

if (sub_1400943C0(qword_14026A988, &jpeg, &jpeg_size, 8)
    && jpeg && jpeg_size) {
    lock(screenshot_lock);
    old = global_jpeg;
    global_jpeg = jpeg;
    global_jpeg_size = jpeg_size;
    unlock(screenshot_lock);
    free(old);
}
```

这里的 `qword_14026A988` 就是诊断中打印的 DirectX 状态对象，内部包含 SwapChain、D3DDevice、D3DDeviceContext、RenderTarget 等指针。检测瞬间先同步生成 JPEG，再启动异步上报，能够避免分析人员在 Worker 真正运行前关闭窗口或切换桌面。

### 10.2 JPEG 生成链

`sub_1400943C0` 先调用 `sub_140094F80` 从 DirectX/WDDM 上下文抽取原始像素、宽和高。随后按像素执行近似下面的转换：

```c
raw = capture_directx_buffer(ctx, &width, &height);
rgb = alloc(width * height * 3);

for (i = 0; i < width * height; i++) {
    rgb[i*3 + 0] = raw[i*4 + 2];  // R
    rgb[i*3 + 1] = raw[i*4 + 1];  // G
    rgb[i*3 + 2] = raw[i*4 + 0];  // B
}

jpeg_encode_to_callback(width, height, 3, rgb, 85);
```

调用签名、回调写出方式和最后一个参数 `85` 都符合 JPEG 内存编码器的形态。最终输出不是 BMP，也不是屏幕句柄，而是一块可以直接作为 `image/jpeg` 上传的内存。

常规路径 `sub_140077F20` 也会调用同一截图函数并上传 `reportType=ss` ，说明截图既可周期执行，也可在检测命中后紧急执行。

### 10.3 Worker 的真实时序

旧式分析很容易在这里看错一个条件：Windows 的 `PsCreateSystemThread` 成功返回 `STATUS_SUCCESS` ，数值就是 0。样本代码是：

```c
status = PsCreateSystemThread(..., sub_14007ED20, ...);

if (status == 0)
    delay_ms(90000);       // 成功才等 90 秒

reset_sequence();
suspected_bugcheck(...);
```

所以真实流程是：

```rust
flowchart TD
    A[分析工具/动态规则命中] --> B[同步截取当前 DirectX 图像<br/>JPEG quality=85]
    B --> C[格式化 T&lt;code&gt;:&lt;process&gt;]
    C --> D{创建 Worker 成功?}
    D -->|是，STATUS_SUCCESS=0| E[父路径等待 90 秒<br/>上传看门狗]
    D -->|是| W[Worker sub_14007ED20]
    D -->|否| K[立即进入复位链]
    W --> W1[构建完整 diag]
    W1 --> W2[读取 needSs / needDiag 等服务端状态]
    W2 --> W3[上传 capture.jpg / reportType=ss]
    W3 --> W4[上传 diag.txt / reportType=diag]
    W4 --> W5[上传冻结报告 / reportType=ssfreeze]
    W5 --> W6[等待 3 秒]
    W6 --> K
    E --> K[替换 IDTR + CF9 + 后备崩溃]
```

90 秒不是为了拖延分析人员，而是给证据外传设定一个最长窗口。正常情况下，Worker 完成上传后会先进入自己的 3 秒延时和终止链；如果 Worker 卡住，父路径最多等 90 秒后兜底。

### 10.4 multipart 请求长什么样

通用上传函数 `sub_140076D60` 大小约 `0x11B8` ，手工拼接 multipart body。固定 boundary 为：

```
----AuthReportDataBoundary
```

核心字段如下：

| 字段  | 含义  |
| --- | --- |
| `softwareId` | 产品标识 |
| `softwareSessionToken` | 当前软件会话令牌 |
| `reportType` | `ss` / `ssfreeze` / `diag` / `reportData` |
| `description` | 报告描述 |
| `freezeCard` | 是否冻结卡密/会话 |
| `freezeReason` | 例如 `T2:ida.exe` |
| `timestamp` | 请求时间 |
| `nonce` | 随机数 |
| `signature` | 请求签名 |
| `file` | 实际附件 part |

重建后的截图请求大致为：

```haskell
POST /reportData HTTP/1.1
Content-Type: multipart/form-data; boundary=----AuthReportDataBoundary

------AuthReportDataBoundary
Content-Disposition: form-data; name="softwareId"

2
------AuthReportDataBoundary
Content-Disposition: form-data; name="reportType"

ssfreeze
------AuthReportDataBoundary
Content-Disposition: form-data; name="freezeReason"

T2:ida.exe
------AuthReportDataBoundary
Content-Disposition: form-data; name="file"; filename="capture.jpg"
Content-Type: image/jpeg

<JPEG bytes>
------AuthReportDataBoundary--
```

字段顺序会随报告类型变化，但 `reportType` 是字段值，附件 part 名固定为 `file` ，这一点可以从拼接代码直接确认。

### 10.5 三类附件

| reportType | 文件名 | Content-Type | 来源  |
| --- | --- | --- | --- |
| `ss` / `ssfreeze` | `capture.jpg` | `image/jpeg` | DWM/WDDM DirectX 截图 |
| `diag` | `diag.txt` | `text/plain; charset=utf-8` | `sub_14004FE60` 全量取证文本 |
| `reportData` | `report-data.bin` | `application/octet-stream` | Type-4 等二进制证据 |

服务端响应还包含 `needSs` 、 `needDiag` 、 `needOpenId` 、 `signatureWindowSeconds` 、 `expiresAtUtc` 等字段。截图和诊断并非只能由本地固定逻辑触发，后端也能参与控制。到这里，“发现分析者”已经变成一条完整的取证外传链，而不是普通的退出保护。

> **反作弊视角：** 内存中的 JPEG SOI、 `capture.jpg` 、固定 multipart boundary、 `ssfreeze` 、 `freezeReason` 与 `/reportData` 应组合观测；单独命中任何一项都可能误报，按同一进程/会话时序关联后价值会陡增。

* * *

## 11\. /reportData 背后：这不只是发卡后端，还是风控台

登录、配置和上传如果分开看，只像常见的外挂发卡系统；把动态名单、冻结原因和三类附件放回同一条调用链，后端的第二重身份才会露出来。

### 11.1 端点和域名

| 指标  | 值   | 置信度 |
| --- | --- | --- |
| 登录路径 | `/Card/Login` | 已确认明文 |
| 配置路径 | `/api/software` | 已确认明文 |
| 报告路径 | `/reportData` | 已确认明文 |
| 域名  | `d0784.com` 、 `http://www.d0784.com` | 已确认，嵌入证书 |
| 完整配置 URL | `https://www.d0784.com/api/software?softwareId=2` | 高置信，来自解码引导配置 |

`/api/software` 、 `banned-features` 和动态 `features[]` 让后端可以更新检测策略； `/reportData` 接收截图、诊断和二进制证据； `freezeCard` 、 `freezeReason` 又把处置结果与软件会话绑定。它的后端显然同时承担认证、配置和反分析风控。

### 11.2 内嵌证书

在 RVA `0x22FFF0` （文件偏移 `0x22EBF0` ）处存在一张 0x580 字节的 DER X.509 证书：

| 字段  | 值   |
| --- | --- |
| Subject CN | `d0784.com` |
| SAN | `d0784.com` 、 `http://www.d0784.com` |
| Issuer | Let's Encrypt R13 |
| 有效期 | 2026-04-22 12:15:19 UTC 至 2026-07-21 12:15:18 UTC |
| SHA-256 | `e6e7ca56cdd9d7c0595caab7d8e5082e87c8b2250b33eea3abdb83bc9816d7d5` |
| CRL | `http://r13.c.lencr.org/123.crl` |

证书被网络初始化链引用，具备证书固定或自带信任材料的强烈特征；但没有动态握手记录，不能把具体校验策略写死成“严格 pinning”。能够落锤的是：客户端已经把认证、策略下发、取证回传和冻结处置接成闭环，而上传完成之后还有最后一道更激进的现场处理。

* * *

## 12\. 证据送走以后，它还要把现场掀掉

普通反调试的终点是进程退出；这条链的终点却是整机失去可继续分析的状态。三个时间窗把意图写得很直白：给证据外传留机会，但不给分析者无限追下去的时间。

### 12.1 60 秒、90 秒、3 秒三个时间窗

| 时间  | 位置  | 含义  |
| --- | --- | --- |
| 60 秒 | `sub_14007F370` | 首次检测时间超过该窗口后再次进入，直接走终止路径 |
| 90 秒 | 父路径 | Worker 创建成功后的最长上传等待 |
| 3 秒 | Worker 尾部 | 完成/放弃上传后的短暂缓冲，然后终止 |

这三个数字合在一起看，设计思路很清楚：先抓现场、给上传时间，但不能无限卡住；一旦流程超时或完成，就尽快破坏分析环境。

### 12.2 LIDT + CF9

`sub_140063970` 只有 12 条指令：

```
140063970  sub   rsp, 18h
140063974  lea   rax, unk_14DD8B000
140063980  mov   eax, 0FFFh
140063989  lidt  fword ptr [rsp]
14006398D  mov   edx, 0CF9h
140063992  in    al, dx
140063993  or    al, 6
140063995  out   dx, al
140063996  add   rsp, 18h
14006399A  retn
```

它先把 IDTR 指向 `.data` 中的 `0x14DD8B000` ，limit 为 `0xFFF` ；静态文件中该区域为零，现有引用也都是 LIDT，没有发现直接写入。若运行时仍为空，后续中断会因无效门描述符产生异常级联，存在三重故障风险。

接着它读写 I/O 端口 `0xCF9` ，OR 上 `0x06` ，尝试触发 System Reset + Full Reset。函数本身会返回，因此调用者之后还会调用一个 5 参数的解码 API wrapper `sub_1401536B0` 。从签名、使用位置和“不应返回”的控制流看，它高度疑似 KeBugCheckEx，但在没有把该加密 API 槽最终解析到符号名前，本文保留“疑似”标签。

所以更严谨的表述是：

```
无效/替代 IDT 风险 → CF9 硬件复位尝试 → 疑似 BugCheck 后备
```

哪一层会在具体硬件、Hyper-V 或 VBS 环境里首先生效，需要动态实验。静态证据能够确认的是，替代 IDT 风险、CF9 硬件复位尝试和疑似 BugCheck 后备都位于检测响应路径中；这不是一句“自毁”字符串，而是一条等待上传窗口结束后真正会被调度的处置链。

* * *

## 13\. 给反作弊的落点：IOC 与复核索引

拆到这里，最怕的是文章很热闹、落地只剩一个随时会失效的域名。下面把文件、网络、启动痕迹和关键函数压成复核索引，便于把“虚拟化底座—分析者识别—证据外传—复位处置”重新串回检测规则。

### 13.1 文件指标

| 文件  | SHA-256 |
| --- | --- |
| `load.bat` | `0f2811985aa6d4354dd51126f41eb8299cad4a91a078059d751ba33d1aba938f` |
| `load.dll` | `fe3363e025a759e525285fb8b54534c17e793767dc62721dfe602e366e94ae36` |
| `Loader.sys` | `9ec544607e6ab4924411135310732ef6025763336367df66251cbcc88275d8ff` |
| `dumped3_inner_ida_fixed.sys` | `2c5c7a862b0c1d4b90c286a47784b30641244008b4a555a479b37f0a0ba360bb` |
| 内嵌 X.509 证书 | `e6e7ca56cdd9d7c0595caab7d8e5082e87c8b2250b33eea3abdb83bc9816d7d5` |

### 13.2 网络指标

```
d0784.com
http://www.d0784.com
/Card/Login
/api/software
/reportData
----AuthReportDataBoundary
softwareId
softwareSessionToken
reportType
freezeCard
freezeReason
timestamp
nonce
signature
```

### 13.3 外围启动指标

```
FsFilter78
FSFilter Infrastructure
SYSTEM\CurrentControlSet\Services\
ACE-BOOT.sys
```

这些字符串位于 `load.dll` 。具体服务值和加载先后仍建议结合离线注册表或 Procmon/boot trace 复核。

### 13.4 关键函数

| 地址  | 本文命名 | 作用  |
| --- | --- | --- |
| `0x1401006B0` | DriverEntry | 跳入 VMP 入口 |
| `0x14012E580` | L0 启动 | VMXON、VMCS setup、VMLAUNCH |
| `0x14012D830` | VM-exit dispatcher | 主/次 VMCS 分流、exit reason 分发 |
| `0x14012A310` | Nested VMLAUNCH handler | 模拟 L1 的 VMLAUNCH |
| `0x14012AC10` | Nested VMRESUME handler | 模拟 L1 的 VMRESUME |
| `0x140126C20` | Nested VMCS builder | 223 条 VMX 指令，切换并合成 secondary VMCS |
| `0x1401163C0` | AMD SVM 初始化 | CPUID `0x8000000A` 、per-CPU SVM 状态 |
| `0x1401E0288` | SVM Guest loop | VMLOAD、VMRUN、VMSAVE、#VMEXIT 调度 |
| `0x140116A20` | SVM #VMEXIT dispatcher | 读取 VMCB EXITCODE 并索引 1028 项分发表 |
| `0x140115620` | NPT builder | 构造 AMD 二阶段页表与大页映射 |
| `0x14011FB10` | Host detector | 读取 GS Base，0 表示 Host |
| `0x140121CD0` | Guest API Bridge | Host 向 Guest 调度 Windows API |
| `0x1400649F0` | Local blacklist scanner | 14 条硬编码进程名匹配 |
| `0x140063E30` | FNV matcher | 动态规则进程名匹配 |
| `0x140063FE0` | Feature parser | 解析 type 1/2/4 服务端规则 |
| `0x14004FE60` | Diag orchestrator | 编排主机取证采集器 |
| `0x1400943C0` | JPEG capture | DirectX 像素转 RGB，质量 85 编码 |
| `0x140076D60` | Report uploader | multipart `/reportData` |
| `0x14007F370` | Detection dispatcher | 同步截图、创建 Worker、90 秒看门狗 |
| `0x14007ED20` | Evidence Worker | 诊断、截图、冻结报告、终止 |
| `0x140063970` | Reset sequence | LIDT + CF9 复位尝试 |

> **反作弊视角：** 不要单押文件哈希或域名。更稳的规则应跨层组合：启动服务痕迹、VMX/SVM 特权指令与控制结构、Host/Guest 桥接行为、固定 multipart 字段，以及检测命中后的截图—上传—复位时序。

### 13.5 适合内存/字符串狩猎的组合特征

单条字符串容易误报，组合更有价值：

```
CurrentIsInHost + IsHvLoaded + DwmPresentThreadId
EFER.SVME + VM_HSAVE_PA + AuthReportDataBoundary
AuthReportDataBoundary + freezeReason + capture.jpg
ACEHooked + DeltaForceMenuConfigV1
read_guest_virtual_memory + EPT USED PAGES + Unhandled VMCALL
```

这些组合不是成品规则，却给出了比单点 IOC 更耐变的调查方向：底层虚拟化、游戏业务和风控上报同时出现时，误报空间会明显收窄。最后还要做一次反向审计，把文章没有证明的部分主动剔出去。

* * *

## 14\. 哪些仍然没有被证明

本文没有运行样本，也没有连接后端；以下内容仍需动态实验或更多材料，不能从“高置信”偷换成“已经发生”：

1.  **外围启动顺序** ： `load.dll` 的服务操作意图很强，但本文没有启动跟踪，不能证明每次都早于 ACE 组件；
2.  **Loader 细节** ：本文使用已提取的 inner 作为对象，没有完整展开 `Loader.sys` 的手工映射实现；
3.  **VMP 去虚拟化** ：已确认入口保护和容器修复，没有宣称完成所有 VMP handler/bytecode 的语义恢复；
4.  **AMD Nested SVM** ：AMD SVM L0 与 NPT 已确认，但 Nested SVM 没有形成 Guest VMRUN/VMCB 模拟闭环；当前 `0x80` 槽仍落入默认 `#UD` ；
5.  **后端行为** ：端点、字段和客户端解析已确认，但服务端实际策略、返回数据和当前在线状态没有验证；
6.  **截图内容** ：已确认从 DWM/WDDM DirectX 上下文生成 JPEG，具体捕获的是哪一帧、是否包含外挂叠加层，需要运行时帧抓取；
7.  **最终崩溃 API** ： `sub_1401536B0` 高度疑似 KeBugCheckEx wrapper，符号槽仍未完成动态解析；
8.  **终止效果** ：LIDT、CF9 和后备调用都存在，但在裸机、Hyper-V、VBS 下的先后效果可能不同。

这些限制不会冲掉已经闭合的证据链：Intel VMX L0 与 Nested VMX、AMD SVM L0 与 NPT、共享 Host 主路径、Guest API Bridge、主机取证、JPEG 截图和 multipart 上传，都能在样本自身找到落点。把“已确认”和“尚未确认”并排写清，才有资格进入最后的威胁判断。

* * *

## 15\. 结语：真正危险的不是 Ring 0，而是控制面换了主人

站在反作弊一侧，这次逆向最重要的收获不是又找到一个内核外挂，而是确认 Windows 已经不再掌握全部控制面。Intel 机器上是 VMX/EPT，AMD 机器上是 SVM/NPT；Intel 分支进一步实现 Nested VMX，AMD 分支则明确停在 Nested SVM 未确认的边界。换一颗 CPU，底层结构会变，Host 里的作弊、取证和上报决策不会消失。

Windows API 也没有因此失去价值，只是角色变了。Guest API Bridge 让 L0 可以改写 Guest RIP/RSP、布置参数和返回桥，再借 Windows 完成线程、查询和网络等系统服务。对传统驱动检测来说，眼前仍是一段 Windows 内核执行；对样本来说，真正发号施令的已经在 Host。

这套控制面最值得警惕的，是它把反分析做成了运营闭环：本地名单先抓现行，远程规则随时加目标，Windows 历史痕迹负责补账，DirectX 缓冲负责留下画面， `/reportData` 负责把截图、诊断和二进制证据送走。最后的 90 秒窗口、LIDT、CF9 和疑似 BugCheck 后备，则负责让分析者尽快失去现场。

```
发现工具
  → 冻结现场截图
  → 还原主机使用痕迹
  → 上传截图、诊断和二进制证据
  → 冻结会话
  → 尝试复位或崩溃系统
```

所以， `dumped3_inner_ida_fixed.sys` 最准确的定义，不是“带 VT 的三角洲内核挂”，而是：

> **一个以 VMX/SVM 双 L0 为执行底座、在 Intel 侧实现 Nested VMX、把 Windows 当作 Guest 服务端，并附带反分析情报闭环的外挂控制系统。**

对反作弊而言，可落地的防御不是再加一条 `VMXON` 特征，而是同时覆盖 VMX/SVM 两套启动面、Host/Guest 桥接异常、截图上报时序与复位前遥测留存，让控制面即使躲到 Ring -1，也无法把自己的行为链一起藏掉。

* * *

## 参考资料

-   [Intel® 64 and IA-32 Architectures Software Developer’s Manuals](https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html)
-   [AMD64 Architecture Programmer’s Manual, Volume 2: System Programming](https://docs.amd.com/v/u/en-US/24593_3.44_APM_Vol2)
-   [jonomango/hv — Lightweight Intel VT-x Hypervisor](https://github.com/jonomango/hv)

## \###### 通过追踪我们已完整掌握该外挂作者证据，详细过程将置于于第三部分

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm) [#软件保护](https://bbs.kanxue.com/forum-4-1-3.htm) [#VM保护](https://bbs.kanxue.com/forum-4-1-4.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm) [#病毒木马](https://bbs.kanxue.com/forum-4-1-6.htm)

* * *

## 评论

> **mknanren · 2 楼**
> 
> 1

> **wx_kx30880 · 3 楼**
> 
> 6666

> **hzqst · 4 楼**
> 
> 你发出来的东西你自己看得懂吗？  
>   
> \*\*一句话总结：说白了，不是看不懂，而是根本懒得看，要我帮你翻译成人类能看懂的版本吗？\*\*

> **蜜蜂啊 · 5 楼**
> 
> +1，都啥玩意，本来想看的，懒得看。

> **邪恶溯源者 · 6 楼**
> 
> 第一篇只用ace和作者本人知道是什么意思就行了，第二篇会非常详细  
> 简单说就是，这个外挂实现了嵌套虚拟化，所有的作弊行为在host里面完成，扫描并截图开挂用户电脑，上传外挂使用用户qq账号及其他信息，发现有分析工具会传到他的后台，已经属于反向反作弊了

> **moshuiD · 7 楼**
> 
> 疑似AI入侵了

> **互联网老司机 · 8 楼**
> 
> Ai功底

> **showmark · 9 楼**
> 
> AI分析 AI文章。

> **龟仙人 · 10 楼**
> 
> > [邪恶溯源者](https://bbs.kanxue.com/user-1083798.htm) 第一篇只用ace和作者本人知道是什么意思就行了，第二篇会非常详细简单说就是，这个外挂实现了嵌套虚拟化，所有的作弊行为在host里面完成，扫描并截图开挂用户电脑，上传外挂使用用户qq账号及其他信息，发现...
> 
> "所有的作弊行为在host里面完成"........你是认真的吗?认真搞笑的是嘛?

> **wx\_小白\_266 · 11 楼**
> 
> ,.

> **のばら · 12 楼**
> 
> 这文章我觉得不是给人类阅读的，实在不行AI写完再让AI翻译一遍再发吧。

> **zhanlanlan · 13 楼**
> 
> 学习

> **hzqst · 14 楼**
> 
> > [のばら](https://bbs.kanxue.com/user-891907.htm) 这文章我觉得不是给人类阅读的，实在不行AI写完再让AI翻译一遍再发吧。
> 
> 我用glm-5.2和ds分别尝试重新润色了一遍，还是一口一个说白了、不是而是、先说清楚 ![](https://bbs.kanxue.com/view/img/face/002.gif)
> 
> ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5df356a272136e19.webp)
> 
> ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/699d4945102d69c8.webp)

> **邪恶溯源者 · 15 楼**
> 
> > [龟仙人](https://bbs.kanxue.com/user-951105.htm) "所有的作弊行为在host里面完成"........你是认真的吗?认真搞笑的是嘛?
> 
> 他建了一个框架在host里面调用api函数，所有作弊都在host里面

> **R0g · 16 楼**
> 
> 样本不错

> **龟仙人 · 17 楼**
> 
> > [邪恶溯源者](https://bbs.kanxue.com/user-1083798.htm) 他建了一个框架在host里面调用api函数，所有作弊都在host里面
> 
> 你说它用host读数据做做hook是正常的,所有作弊都在host里面,你知道多大工作量吗?单单一个绘制的工作量就得顶到天上去.关键是他都上vt了,直接用vt给自己的作弊代码隐藏保护一下不就好了,直接在vt里面干这个事儿,我认为你跟作者其中得有个傻福.

> **wx_Dispa1r · 18 楼**
> 
> 1

> **veryluckko · 19 楼**
> 
> 2

> **ngcheukwai · 20 楼**
> 
> 看不懂 AI

> **Oxygen1a1 · 21 楼**
> 
> 不是哥们，你把自己和ai的聊天记录上传上去了?

> **v5w7crq3 · 22 楼**
> 
> 666

> **邪恶溯源者 · 23 楼**
> 
> 我的说法都是通过严格逆向得出的，而且作者这样做规避了nmi，pmi，apc检查

> **邪恶溯源者 · 24 楼**
> 
> 第二篇会详细分析你们觉得不可能的技术

> **邪恶溯源者 · 25 楼**
> 
> > [Oxygen1a1](https://bbs.kanxue.com/user-935881.htm) 不是哥们，你把自己和ai的聊天记录上传上去了?
> 
> 我第二篇还没写完，先发出来给你们看看  
> 另外你们ace放任一个外挂稳定一年，居然要靠我来曝光，已经是严重失职了，我会在三个月后继续追踪，看你们处理情况

## 附件

- [load.dll](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/fe3363e025a759e5.dll) （2.71MB，54次下载）
- [Loader.sys](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/9ec544607e6ab492.sys) （7.86MB，58次下载）
- [load.bat](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/07/0f2811985aa6d435.bat) （0.17kb，38次下载）
