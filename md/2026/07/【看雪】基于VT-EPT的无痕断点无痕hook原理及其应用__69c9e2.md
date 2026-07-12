---
title: 【看雪】基于VT EPT的无痕断点无痕hook原理及其应用
source: https://bbs.kanxue.com/thread-291981.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-13T07:30:50+08:00
trace_id: 5331f5ab-64fd-4998-9069-695572f2e63b
content_hash: 280aab291d9af812e33823b7c62ad75c60ae354d6dc9536902dfacd77b845c99
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过硬件虚拟化（VT-x）与扩展页表（EPT）实现的监控和调试技术，能在不修改内核代码和关键数据结构的情况下完成Hook、断点设置与内存隐藏，从而规避传统检测。
ai_summary_style: key-points
images_status:
  total: 21
  succeeded: 0
  failed_urls:
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783891855432-9223f605-2316-4928-83c3-d05877144a98.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783891957005-1571905c-815c-4933-8ebf-6fd4f772ef2b.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783892319933-bf9ed075-4351-4870-a6be-f2d9576849de.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783892424777-890e2c9b-73c4-4ea1-9957-beed687263c4.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893331113-591eb87f-98f3-4b41-b9a9-9e8874ba12b5.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893087881-cdfbbb25-63d8-4729-b135-08a524c72b69.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893956114-757ca13e-7f98-403b-8479-f6abac1b62f6.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893996359-897c68e2-cc0f-4d4a-8643-5a108eb19595.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894002893-95bb1edb-29fb-458f-b50b-a473ec16ecb6.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894026421-79690c13-b634-464d-83c5-40f8d46f67be.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894102418-fa31e424-4728-4fae-9e5f-233b67f66948.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894509087-a54b15ff-00ac-48d1-b7d9-c07182d32149.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894561884-964c061d-7fec-473f-b2d1-b453afcaeb3d.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894785325-6fa1af75-80ac-44b2-a528-f62007e05581.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894898928-79fec08f-4128-40a6-8073-a8850bc88acf.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894994819-03c40941-ed9c-4305-b091-8aeb9a24a7de.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783896510547-ae38bc93-d55e-410a-8610-d0bcb4c8c058.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783896808208-ccc89e00-3fde-46bf-8996-b9d6e23abc32.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783897538719-4bbd4e39-e563-4cdb-bdb1-e822f8b91c3f.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783897649012-f58dbe36-7f2e-45c7-b603-145166bcbfd9.png
    - https://cdn.nlark.com/yuque/0/2026/png/44000843/1783897787241-8e135576-d551-4155-b2f7-c4297d1298de.png
notion_page_id: 39b75244-d011-8147-9739-dd65f0a29c15
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过硬件虚拟化（VT-x）与扩展页表（EPT）实现的监控和调试技术，能在不修改内核代码和关键数据结构的情况下完成Hook、断点设置与内存隐藏，从而规避传统检测。
> 
> - **VT-x与EPT基础：** Intel VT-x让目标内核运行在VMX Non-root环境，而监控程序运行在VMX Root。EPT作为二级页表，能精细控制Guest物理地址到Host物理地址的映射及读写执行权限，为无痕操作提供了硬件基础。
> - **无痕Hook原理：** 为同一Guest物理地址准备原始页和修改后的影子页。数据访问时映射到原始页，指令执行时映射到影子页。通过EPT违规触发VM-exit来动态切换页面，实现指令替换但读取时仍为原字节的“无痕”效果。
> - **无痕INT3断点：** 普通软件断点（0xCC）会直接修改目标代码字节，而EPT无痕断点仅在影子页中放置CC字节，原始数据页保持不变，因此内存扫描和完整性校验无法发现断点存在。
> - **自建调试器应用：** 利用上述技术可构建调试器。软件断点使用EPT隐藏INT3，硬件断点通过EPT监视实现（撤销页面权限触发VM-exit），突破传统调试寄存器数量限制，并可通过Hook调试体系函数或VMCALL进行通信。
> - **检测与规避思路：** 虚拟化本身可能被通过测量VM-exit开销（如rdtsc）等方式检测。规避方法是在VM-exit处理中对时间戳进行补偿，调整Guest读取的TSC值，以隐藏虚拟化痕迹。

**Intel VT-x（Intel Virtualization Technology）** ，是一组由 CPU 提供的硬件虚拟化能力。

它最初用于让一台物理计算机同时运行多个虚拟机。

Intel 对 VT 的定义是：通过处理器、芯片组和设备中的硬件辅助能力，让虚拟化软件更简单、可靠，并获得更好的性能。 [Intel 官方说明](https://bbs.kanxue.com/elink@eafK9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6%4N6%4N6Q4x3X3g2A6L8Y4c8W2L8q4\)9J5k6h3y4G2L8g2\)9J5c8X3y4G2L8Y4c8W2L8Y4c8Q4x3V1k6V1j5h3#2Q4x3V1k6%4N6%4N6Q4x3V1k6H3N6h3u0D9K9h3y4Q4x3V1k6#2M7#2\)9J5c8X3g2F1i4K6u0r3k6r3!0U0N6h3#2W2L8Y4c8K6i4K6u0r3j5i4m8H3L8r3W2U0j5i4c8A6L8$3&6Q4x3X3c8F1L8%4c8W2M7#2\)9J5c8Y4k6A6M7Y4c8#2j5h3I4A6P5X3q4@1K9h3!0F1i4K6u0V1N6r3g2U0K9r3&6G2L8r3!0Y4P5g2\)9J5k6r3k6D9k6i4S2E0K9h3N6J5j5i4c8A6L8$3&6Q4x3X3c8S2M7s2m8D9K9h3y4S2N6r3W2G2L8W2\)9J5k6r3&6G2N6r3g2Q4x3X3g2H3k6r3j5%60.)

## 1\. 虚拟化首先要解决什么问题

VT 出现之前：虚拟机主要靠软件“骗过”操作系统

早期 x86 虚拟化主要依靠软件模拟和动态二进制翻译。Hypervisor需要扫描并改写 Guest的敏感指令，同时维护影子页表，存在实现复杂、兼容性差和性能开销大的问题。

操作系统内核默认自己运行在最高权限，并认为 CR3、中断、物理内存和设备都归自己管理。可是一台机器同时运行多个 Guest OS 时，真正的硬件只有一套，Hypervisor 必须在软件层拦截并模拟这些敏感操作。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783891855432-9223f605-2316-4928-83c3-d05877144a98.png)

VT-x：把“拦截与切换”交给 CPU

Intel VT-x 在处理器里加入 VMX Root 与 VMX Non-root 两种运行环境。Guest 内核仍可保持 Ring 0 语义，但处于 VMX Non-root；遇到被 VMCS 配置为受控的操作时，CPU 自动保存 Guest 状态并 VM-exit 到 Hypervisor。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783891957005-1571905c-815c-4933-8ebf-6fd4f772ef2b.png)

## 2.虚拟化用于安全攻防

VT 不是为了 Hook 而设计的。它首先解决的是软件模拟虚拟机太复杂、太慢、兼容性难的问题；而 VM-exit 提供的系统外控制能力，后来才被安全研究用于监控和对抗。

早期内核研究经常直接修改内核代码、SSDT 或 IDT。到了 x64 Windows，Kernel Patch Protection（通常称为 PatchGuard）开始保护内核代码和关键结构；驱动若进行不受支持的运行时修改，可能触发 `CRITICAL_STRUCTURE_CORRUPTION` 。这不是说 Inline Hook 在物理上“绝对做不到”，而是它不再稳定、受支持，也更容易导致系统崩溃。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783892319933-bf9ed075-4351-4870-a6be-f2d9576849de.png)

安全研究人员由此把观察位置继续下移：让 Windows 内核运行在 VMX Non-root，而监控逻辑运行于 VMX Root。Hypervisor 不必直接改动 Guest 的关键结构，也能通过 VM-exit、MSR Bitmap 和 EPT控制 Guest行为。

早期使用MSR hook，实现ssdt表的hoook，后来使用ept机制实现任意位置的inline hook

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783892424777-890e2c9b-73c4-4ea1-9957-beed687263c4.png)

## 二. VT-EPT 无痕hook原理与无痕INT3原理

## 1.EPT介绍

EPT（Extended Page Tables，扩展页表）是Intel VT-x提供的一套“第二级页表”。开启后多了一层转换，且可以对EPT子叶设置权限，例如只读，只执行。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893331113-591eb87f-98f3-4b41-b9a9-9e8874ba12b5.png)

核心初始化代码

```rust
// 简化后的核心代码
// 1. 建立EPTP：指向EPT四级页表的PML4
__eptp eptp{};
eptp.memory_type     = 6; // WB
eptp.page_walk_length = 3; // 4-level EPT
eptp.pml4_address =
    MmGetPhysicalAddress(ept_page_table->pml4).QuadPart >> 12;

// 2. 普通EPT叶子初始映射真实物理页
ept_pte.read    = 1;
ept_pte.write   = 1;
ept_pte.execute = 1;
ept_pte.physical_address = host_physical_address >> 12;

// 3. VMCS允许使用Secondary Controls，并开启EPT
primary_controls.active_secondary_controls = true;
secondary_controls.enable_ept = true;

vmwrite(CONTROL_PRIMARY_PROCESSOR_BASED_VM_EXECUTION_CONTROLS,
        adjust_controls(primary_controls));
vmwrite(CONTROL_SECONDARY_PROCESSOR_BASED_VM_EXECUTION_CONTROLS,
        adjust_controls(secondary_controls));
vmwrite(CONTROL_EPT_POINTER, eptp.all);
```

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893087881-cdfbbb25-63d8-4729-b135-08a524c72b69.png)

EPT开启后，Guest通常仍按原样运行。只有Hypervisor主动修改某个EPT条目的PFN或R/W/X权限，才会出现访问拦截、读写保护或双视图Hook。

```
// 4. EPT violation处理入口
qualification = vmread(EXIT_QUALIFICATION);
guest_pa      = vmread(GUEST_PHYSICAL_ADDRESS);

if (qualification.execute_access) {
    // 处理执行权限或切换执行视图
}

// 修改EPT PTE后，让缓存中的旧翻译失效
invept_single_context(eptp.all);
```

## 2.利用EPT 实现无痕hook

经典 EPT Hook 为同一个 GPA 准备两个 HPA：原始页与修改后的影子页。数据访问映射原始页，指令取指映射影子页。扫描器读取目标地址时得到干净字节；CPU 执行同一地址时，却获取补丁、跳转桩或用户自定义机器码。(本质是利用ept违规触发vmexit事件在vmexit里切换影子页)

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893956114-757ca13e-7f98-403b-8479-f6abac1b62f6.png)

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783893996359-897c68e2-cc0f-4d4a-8643-5a108eb19595.png)

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894002893-95bb1edb-29fb-458f-b50b-a473ec16ecb6.png)

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894026421-79690c13-b634-464d-83c5-40f8d46f67be.png)

代码

```rust
target_page->execute = 0;
target_page->read    = 1;
target_page->write   = 1;

hooked_page_info->original_entry = *target_page; // 原始 PFN：RW / NX
hooked_page_info->changed_entry  = *target_page;
hooked_page_info->changed_entry.read    = 0;
hooked_page_info->changed_entry.write   = 0;
hooked_page_info->changed_entry.execute = 1;
hooked_page_info->changed_entry.physical_address =
    hooked_page_info->pfn_of_fake_page_contents;  // 影子 PFN：X-only
```

## 3.引入MTF超级单步解决读执行同页问题

如果影子页上的指令又读取同页常量，会出现“取指需要影子页、数据读取需要原始页”的同指令冲突。常见做法是临时放开原始页执行并设置 Monitor Trap Flag（MTF），只运行一条指令；随后在 MTF VM-exit 中重新收紧权限。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894102418-fa31e424-4728-4fae-9e5f-233b67f66948.png)

MTF 不是 Guest 的 TF不需要修改 Guest RFLAGS.TF，也不占用 DR0–DR7

MTF（Monitor Trap Flag）是 Intel VMX 的一项 VM-execution control。Hypervisor 在 VMCS 中打开它并执行 VM-entry 后，处理器让 Guest 前进到下一个指令边界，再产生 **Monitor Trap Flag VM-exit** 。它可以理解为“由 VMM 控制的单步执行”：临时放行一条 Guest 指令，指令完成后 CPU 自动把控制权交回 VMX Root。

CRC读取 → 原始页RW/NX → CRC得到原指令

CPU取指 → EPT Execute Violation → VM-exit

VT切换到影子页X-only → INVEPT → 执行影子代码

同页数据访问 → EPT Read/Write Violation

原始页临时RWX + 开启MTF → 完成一条指令

MTF VM-exit → 关闭MTF → 恢复原始页RW/NX

下一次取指再次触发EPT异常 → 切回影子页

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894509087-a54b15ff-00ac-48d1-b7d9-c07182d32149.png)

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894561884-964c061d-7fec-473f-b2d1-b453afcaeb3d.png)

## 4.EPT HIDE INT3

普通软件断点会把目标首字节改成 `0xCC` ，内存扫描和完整性校验都能发现变化。EPT 无痕 INT3 只在执行影子页中放入 CC；原始数据页不变，于是读内存看到原指令，CPU 取指却执行断点。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894785325-6fa1af75-80ac-44b2-a528-f62007e05581.png)

CPU 执行 `INT3` 产生 `#BP` 。若 VMCS Exception Bitmap 拦截向量 3，异常先进入 VMM。对于一字节 INT3，保存的 RIP 通常位于断点字节之后，因此匹配地址常使用 `guest_rip - 1` 。VMM 可以记录现场，恢复原指令并单步一次，再重新布置断点。

```
if (vector == BP && lookup_breakpoint(cr3, guest_rip - 1)) {
    record_guest_context();
    arm_single_step_for_original_instruction();
    return; // 不向 Guest 注入本框架自己的 #BP
}
reinject_original_exception(); // 不能吞掉其他调试器的断点
```

## 5.EPT 监视：模拟“无限硬件断点”

x86 调试寄存器只有 DR0–DR3 四个地址槽。EPT 监视不占用调试寄存器，而是撤销目标页的 R、W 或 X 权限，让匹配访问产生 VM-exit。监视数量受内存和性能限制，但不再受四个槽位限制，因此常被称为模拟无限硬件断点。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894898928-79fec08f-4128-40a6-8073-a8850bc88acf.png)

## 6.其他一些注意事项

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783894994819-03c40941-ed9c-4305-b091-8aeb9a24a7de.png)

因为vt虚拟化和硬件相关，本文讲解的是intel的ept，amd的虚拟化npt与之差异不能照搬(例如NPT不能单独设置只执行属性)

## 三.VT自建调试器原理

对于安全来说vt目前最大的用处就是反复折腾EPT这个机制做无痕hook外加vmexit的一些事件处理,做自建调试器或者guest监控工具。

vt自建调试器一般有两种思路，一种是hook windows dbg函数(因为windows不同版本略有差异这种需要符号解析或者特征码兼容不同版本)，自己管理调试对象，接管dbg函数，去掉调试标志位等一些检测点，本质还是走的windows调试体系，市面上一些出售的调试器大多数采用这种，称为“VT调试插件”，因为可以对接传统的CE，XDBG,OD，当这种传统调试器先设置硬件断点一般会调用SetThreadContext，通过ept hook SetThreadContext 探测他的行为是不是设置硬件断点转发到vt的ept 监视上。

第二种就是无附加调试，不走windows调试器体系，自己实现调试的重要功能，不过想获取调试事件例如模块加载，进程创建退出，这种还是需要hook dbg函数的，这种三环一般是自己实现的调试器，用专属的接口，不走windows标准调试器体系，这种缺点就是只符合个人使用习惯，且windows调试器体系很优秀很难做的比windows原生调试器体系好。

虽然每个人的思路都是不同的，但是无论选哪条路，核心都是利用ept hide 完成软件断点，和ept监视完成硬件断点。

## 1.断点

软件断点使用ept hide int3即可，硬件断点使用ept模拟监视

## 2.调试事件获取

使用ept hook对调试体系函数进行hook，也可以利用注册回调来监控一些模块，进程事件。

## 3.vt无痕读写

其实并不存在什么vt无痕读写，常说的vt无痕写，就是利用EPT影子页表无痕写代码段，怎么可能可以无痕写数据段呢。

无痕读也是遍历四级页表那一套，个人看来和普通驱动没任何区别，当然了因为第一种自建调试的读，使用的windows的附加读写，怕被检测可以替换成这种。

```kotlin
目标 PID
   ↓ 获取目标 CR3
遍历 Guest PML4/PDP/PDE/PTE
   ↓
GVA → GPA
   ↓ EPT 二阶段翻译
GPA → HPA
   ↓
VMX Root 映射物理页
   ↓
直接 memcpy 读取或写入

bool GuestVirtualToPhysical(uint64_t cr3, uint64_t gva, uint64_t* gpa)
{
    uint64_t pml4 = cr3 & ~0xFFF;

    pml4e = ReadPhysicalQword(pml4 + PML4_INDEX(gva) * 8);
    if (!pml4e.present) return false;

    pdpte = ReadPhysicalQword(PFN_BASE(pml4e) + PDP_INDEX(gva) * 8);
    if (!pdpte.present) return false;
    if (pdpte.large_1gb) {
        *gpa = PAGE_BASE_1GB(pdpte) + OFFSET_1GB(gva);
        return true;
    }

    pde = ReadPhysicalQword(PFN_BASE(pdpte) + PD_INDEX(gva) * 8);
    if (!pde.present) return false;
    if (pde.large_2mb) {
        *gpa = PAGE_BASE_2MB(pde) + OFFSET_2MB(gva);
        return true;
    }

    pte = ReadPhysicalQword(PFN_BASE(pde) + PT_INDEX(gva) * 8);
    if (!pte.present) return false;

    *gpa = PFN_BASE(pte) + PAGE_OFFSET(gva);
    return true;
}
```

## 4.vt隐藏内存

其实如果读懂上面的文章，你就知道怎么隐藏内存了，没错本质还是在折腾ept。

EPT 隐藏内存并不是把物理页从机器中删除，而是修改 Guest Physical Address 到 Host Physical Address 的第二阶段映射。Hypervisor 自己仍可在 VMX Root 中访问真实物理页；Guest 访问同一个 GPA 时，则可以被拒绝、映射到零页/诱饵页，或者根据当前 CR3 切换到不同视图。

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783896510547-ae38bc93-d55e-410a-8610-d0bcb4c8c058.png)

## 5.调试器展示

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783896808208-ccc89e00-3fde-46bf-8996-b9d6e23abc32.png)

## 6.CE破图标原理

经常看到易语言大手子说的CE破图标，以及某某驱动课程说的利用OB回调给CE提取，那么为啥CE获取不到图标呢。

```
OpenProcess
  ↓
NtQueryInformationProcess(ProcessBasicInformation)
  ↓
PEB.ProcessParameters
  ↓ ReadProcessMemory
RTL_USER_PROCESS_PARAMETERS.ImagePathName
  ↓
ExtractIcon
```

也就是说获取图标本质是拿peb结构体中的ImagePathName文件路径，再调用ExtractIcon获取文件图标，被阻断在模块快照被拒绝

## 7.vmcall无痕通信

`VMCALL` 是 Intel VMX 提供的 Hypercall 指令。Guest 在 VMX Non-root 执行它时，CPU 不会像普通函数调用那样跳到某个 Guest 地址，而是根据 VMCS 保存 Guest 状态并产生 **VM-exit reason 18** ，随后进入 Hypervisor 的 VM-exit 分发器。

常常会使用vmcall规定通信结构，例如RAX 放协议标识，RCX 放操作号，其余寄存器携带参数

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783897538719-4bbd4e39-e563-4cdb-bdb1-e822f8b91c3f.png)

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783897649012-f58dbe36-7f2e-45c7-b603-145166bcbfd9.png)

## 四.VT检测与过检测

![](⚠️ https://cdn.nlark.com/yuque/0/2026/png/44000843/1783897787241-8e135576-d551-4155-b2f7-c4297d1298de.png)

这种东西就是他检测哪里你vmexit中处理就好了，举一个最简单的例子，例如通过\__rdtsc/\__rdtscp检测vmexit开销，你就记录下vmeixt开销，再减掉就好了。如果想知道主流检测思路最好还是去逆向XXX

```rust
/ VM-exit 汇编入口尽可能早地记录时间
vcpu->exit_tsc = rdtsc_ordered();

uint64_t ReadVirtualTsc(Vcpu* vcpu)
{
    uint64_t now = rdtsc_ordered();
    uint64_t current_exit_cost = now - vcpu->exit_tsc;

    // 使用有界、平滑的估计，不能把中断或调度长尾全部当成VM-exit成本。
    vcpu->tsc_compensation +=
        BoundedEstimate(current_exit_cost, vcpu->exit_cost_history);

    uint64_t value = now - vcpu->tsc_compensation;
    value = max(value, vcpu->last_guest_tsc + 1); // 保证每vCPU单调
    vcpu->last_guest_tsc = value;
    return value;
}
```

[#系统底层](https://bbs.kanxue.com/forum-4-1-2.htm) [#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm)
