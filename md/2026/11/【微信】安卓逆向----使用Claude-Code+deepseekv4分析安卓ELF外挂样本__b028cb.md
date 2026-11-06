---
title: 【微信】安卓逆向 -- 使用Claude Code+deepseekv4分析安卓ELF外挂样本
source: https://mp.weixin.qq.com/s/rpiMlrRBdqg3_qG3W1IErg
source_host: mp.weixin.qq.com
clip_date: 2026-11-06T11:30:39+08:00
trace_id: d81462d0-e485-4201-bcf5-60d8bf6198d4
content_hash: cd78c3d1bcc5eb07cc186089ce0381c8ac6f8b78ca60b7e3981d5b6def95fa53
status: synced
tags:
  - 微信
  - Android逆向
  - AI辅助逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: AI工作流（Claude Code+deepseekv4+IDA MCP插件）完整逆向一款UE4射击游戏的安卓.so外挂，破解两层XOR加密，还原出武器注入、技能修改、ESP自瞄功能与6层反检测设计。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41075244-d011-8173-b414-e16be2a82f82
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> AI工作流（Claude Code+deepseekv4+IDA MCP插件）完整逆向一款UE4射击游戏的安卓.so外挂，破解两层XOR加密，还原出武器注入、技能修改、ESP自瞄功能与6层反检测设计。
> 
> - **加密体系：** 采用两层XOR加密——.init_array加载时自动解密（sub_2219C，60+单字节密钥经MOVI指令编码）+运行时三层混合解密（sub_2F6F8，1233次字节XOR+315次NEON块操作），自动化脚本共恢复155条字符串，含41个SurfaceFlinger符号和553字节反检测Shell脚本。
> - **读写分离架构：** 读内存75次/帧经内核模块IOCTL+ARM SMC/HVC访问物理内存，绕过用户态反作弊；写内存34次直接用SVC 0x10F（process_vm_writev）原始syscall，绕过libc hook，且内核模块被移除后写入功能仍可用。
> - **功能定位：** 核心函数sub_27D40（21,912字节、162基本块、圈复杂度106）集三大作弊于一体：6次覆写WeaponCoreComp2实现武器注入、18次改写技能字段（锁定连接数、无敌、无视范围检测）、Actor数组遍历+NEON MVP矩阵变换实现ESP透视与骨骼自瞄。
> - **反检测设计：** 入口偏移0xDE2E908实为DebugCanvas（0xDE5E908）减0x30000，刻意绕过GWorld监控；另有XOR加密敏感字符串、Shell脚本遍历/proc重建被删除的/dev设备节点、包名经ini配置可切换目标等共6层防护。
> - **AI工作流评价：** 优势在于跨文件上下文关联、模式识别（如MOVI→EOR解密模式）与通过MCP直接操作IDA并自我纠错（从PlayerController误判修正为GameCharacter）；局限是无动态分析能力、难抗CFG Flattening/VMP重度混淆。作者实测deepseekV4效果优于gpt5.3-codex和本地qwen3.5，但多个结构仍需人工修正。

**逆向有你** *2026年11月6日 10:06*

### 1\. 引言

本文记录了一次完整的安卓 ELF（.so）外挂样本逆向分析过程。样本是一个面向某 UE4 射击游戏的游戏作弊模块，基于 Unreal Engine 4 引擎开发。

传统逆向工程依赖人工阅读反汇编代码、逐条追踪指令流，分析周期通常以天甚至周计。本文展示如何利用 **AI 辅助逆向** 工作流——以 Claude Code（搭载 deepseekv4 模型）为核心，结合 IDA Pro MCP 插件实现 IDE 级交互，将分析效率提升到一个新的量级。

本次分析的完整文件包括：

-   `2026-04-28-182421-this-session-is-being-continued-from-a-previous-c.txt`
    
    — 完整的 AI 交互会话记录（分析流程的基础）
    
-   `sub_27D40_analysis.md`
    
    — 核心函数 sub_27D40 的深度分析文档（结论参考）
    
-   `report.md`
    
    — 样本整体逆向报告（结论参考）
    
-   `decoded_strings.txt`
    
    / `decoded_strings_full_v3.txt` — 解密后的字符串表
    
-   `decrypt_range.py`
    
    / `analyze_range.py` — 自动化解密脚本
    
-   `sub_2F6F8.json`
    
    / `sub_2F6F8.txt` / `sub_2F6F8_decompile.txt` — 第二解密函数的结构化分析
    
-   `sub2F6F8_byte_keys.txt`
    
    / `sub2F6F8_xmm_keys.txt` / `sub2F6F8_all_keys.txt` / `sub2F6F8_combined_keys.txt` — 解密密钥表
    
-   `SDK.txt`
    
    — 目标游戏的 UE4 SDK 偏移定义
    

### 2\. 使用工具

#### 2.1 Claude Code + deepseekv4-flash

Claude Code 是 Anthropic 推出的 AI 编程助手，运行在终端环境中，具备完整的文件系统读写、代码分析和工具调用能力。本次会话运行在 **deepseek-v4-flash** 模型上。

Claude Code 的核心能力在此次逆向中发挥了关键作用：

-   **大上下文窗口**
    
    ：可一次性载入 IDA Pro 导出的反汇编代码（如 `sub_2F6F8.txt` 达 87KB）、SDK 定义（SDK.txt 达 2.8MB），跨文件关联分析
    
-   **工具链集成**
    
    ：直接调用 Bash 运行 Python 解密脚本、读取分析结果、编辑文档
    
-   **多轮深度推理**
    
    ：从"这个函数在做什么"逐步深入到"这个偏移对应 SDK 中的哪个字段"，全程无需人工切换环境
    
-   **会话压缩（Baking）**
    
    ：长时间分析后自动压缩历史，提炼关键上下文继续推理，确保数小时分析过程中关键发现不丢失
    

#### 2.2 IDA Pro MCP 插件

IDA Pro（Interactive Disassembler Pro）是行业标准的二进制分析工具。MCP（Model Context Protocol）是 Anthropic 提出的 AI 工具集成协议。通过 IDA Pro MCP 插件，Claude Code 可以直接向 IDA 发起查询：

-   **goToDefinition**
    
    ：跳转到指定地址查看代码
    
-   **findReferences**
    
    ：查找某个地址的交叉引用（xref）
    
-   **hover**
    
    ：获取 IDA 对某条指令的类型/注释信息
    
-   **decompile**
    
    ：获取指定函数的伪代码
    

这意味着 Claude 不再是"阅读你粘贴的文本"，而是像逆向工程师一样 **亲自操作 IDA**——查看指令、追踪引用、验证猜想。整个分析过程中 Claude 通过 MCP 调用了 IDA 数十次，涵盖了从起始偏移确认到 SVC 写入上下文追踪的完整分析链。

#### 2.3 Python 自动化脚本

-   `decrypt_range.py`
    
    ：从 IDA 导出的原始加密字节，结合密钥表批量 XOR 解密
    
-   `analyze_range.py`
    
    ：利用已知密钥表对加密数据块进行自动评分和暴力破解
    

### 3\. 分析过程

#### 3.1 第一步：从字符串解密入手

分析的第一步是理解样本的 **字符串加密方案**。样本使用单字节 XOR 加密保护所有敏感字符串，通过 ARM NEON SIMD 指令以 16 字节块进行加解密。样本包含两层加密区域，分别在加载时和运行时解密。

##### 第一阶段解密：sub_2219C（.init_array 自动执行）

解密函数 `sub_2219C` （14,276 字节）通过 `.init_array` 在.so 加载时自动调用，解密 `.data` 段 0x47D000-0x49BDF0 范围的数据。使用 60+ 个不同的单字节 XOR 密钥，每个密钥通过 `MOVI Vd.16B, #imm` 指令编码在函数中。

从 `decoded_strings.txt` 可以看到关键解密结果：

```javascript
复制代码 隐藏代码
密钥 0x9B → "[-] Failed to get native window from surface"
密钥 0xDE → "[+] ANativeWindow created succes"
密钥 0xF9 → "ro.build.version"
密钥 0x0C → "[-] Unsupported system version:"
密钥 0x89 → "/system/lib64/li" (libgui.so)
密钥 0x61 → "reate surface con"
```

> **AI 工作流要点**：Claude 通过阅读 IDA 导出的反汇编代码，自动识别 MOVI 加载密钥 → LDR 加载数据 → EOR XOR 解密 → STR 写回的 4 步模式，无需人工逐条分析。

##### 第二阶段解密：sub_2F6F8（运行时三层混合解密）

不同于.init_array 中的自动解密， `sub_2F6F8` 在运行时通过 `thread_game_loop → game_loop_iteration → sub_2D2D8` 调用。它使用了 **三层混合解密方案**：

1.  **字节级 XOR**
    
    ：1233 次单字节 `LDRB + EOR + STRB` 操作
    
2.  **NEON veorq_s8**
    
    ：237 次 16 字节块 XOR 操作
    
3.  **NEON veor_s8**
    
    ：78 次 8 字节块 XOR 操作
    

总共 315 次 NEON 操作，覆盖约 4,296 字节（60% 的区域）。密钥直接编码在 `sub_2F6F8` 的指令中，解密操作存在控制流逻辑——并非所有字节都在同一路径解密。

通过 Python 脚本自动解密，最终恢复 **155 个字符串**，内容涵盖：

| 分类  | 内容  |
| --- | --- |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/887bf3e4b6109040.jpg)
| 程序包名 | `com.example.game` |
| 游戏引擎 | `libUE4.so`<br><br>(Unreal Engine 4) |
| Shell 脚本 | 完整的反检测 bash 脚本（553 字节） |
| 版本检测 | `uname -r \\| sed`<br><br>、 `dumpsys package \\| grep versionName` |
| 进程内存操作 | `process_vm_writev`<br><br>、 `/proc/self/maps` 、 `/proc/%d/maps` |
| 输入设备 | `/dev/input/event%d` |
| C++ 符号表 | **41 个完整 SurfaceFlinger API 符号** |
| ImGui | `ImGui`<br><br>、 `AImGui` 、 `Show` 、 `Hide` 、 `Apply` |

完整 41 个 SurfaceFlinger 符号覆盖了从创建表面、事务管理到渲染提交的完整管线，包括 `SurfaceComposerClient::createSurface` （6 个重载）、 `Transaction::setLayer/show/hide/apply` 、 `SurfaceControl::getSurface` 等。

#### 3.2 第二步：架构总览

通过 Claude Code 对反汇编代码的全局分析，样本采用清晰的模块化架构：

```
复制代码 隐藏代码
sub_1A410 (主入口)
  ├── sub_1D4B4 — Android 版本检测 + libgui/libutils 动态加载
  ├── sub_1A820 — FNV-1a 哈希表 + dlsym 函数解析
  ├── sub_22138 — SurfaceFlinger Overlay 渲染线程 (pthread_create)
  └── sub_2778C → sub_27D40 (每帧调用的核心作弊函数)
        └── sub_25CDC — 世界坐标→屏幕坐标矩阵变换
```

每个模块的用途通过 Claude Code 对 IDA 的交叉引用分析和代码路径追踪得以确认。

**初始化流程 sub_2D2D8** 揭示了外挂的启动过程：

1.  `popen("pidof com.example.game")`
    
    → 获取游戏 PID
    
2.  `ioctl(fd, req, {buf})`
    
    → 内核模块查询 libUE4.so 基址
    
3.  `sub_27A48("PAN_xxx.ini")`
    
    → 读配置文件（功能开关、热键、颜色等）
    

#### 3.3 第三步：核心函数 sub_27D40 深度分析

`sub_27D40` （0x27D40）是整个外挂的核心函数，大小 21,912 字节，包含 162 个基本块，圈复杂度高达 106。它集成了 **75 次 IOCTL 内存读取** 和 **34 次 process_vm_writev 内存写入**。

以下分析流程严格参考 `2026-04-28-182421-this-session-is-being-continued-from-a-previous-c.txt` 中的分析步骤。

##### 3.3.1 起始偏移匹配（分析过程的第一个转折点）

分析会话记录显示，第一个关键问题是：外挂读取的 `UE4_base + 0xDE2E908` 在 SDK 中找不到直接匹配。标准 UE4 偏移为 GWorld=0xDE5DFF8、DebugCanvas=0xDE5E908、GEngine=0xDE5AEC0 等，都与 0xDE2E908 存在差异。

Claude 没有停留在标准偏移上，而是逐一比对发现 **DebugCanvas=0xDE5E908 减去 0x30000 正好等于 0xDE2E908**。确认外挂通过基址修正指向 DebugCanvas——这是一个有意识的反检测设计，意在绕过对 GWorld 等热门全局变量的监控。

```
复制代码 隐藏代码
UE4_base + 0xDE2E908 ──[IOCTL #1]──→ Ptr1 (DebugCanvas全局)
  └─ Ptr1 + 0x20 ──[IOCTL #2]──→ Ptr2 (qword_49D6B0, 引擎核心结构)
      ├─ +0x30  → UWorld.PersistentLevel
      ├─ +0x2C0 → qword_49D6C8 → GameCharacter
      ├─ +0x370 → qword_49D7E0 → LocalPlayer
      └─ (Level→ActorCluster→Actors) → qword_49D7C0 = TArray<AActor*>
```

##### 3.3.2 IOCTL 链追踪

75 次 IOCTL 调用分为四个阶段：

**阶段 1（IOCTL #1-21）初始化链**：从 DebugCanvas 出发，通过级联指针读取获取引擎核心结构体。关键路径为 DebugCanvas → Ptr1 → Ptr2 → UWorld / GameCharacter / LocalPlayer。

**阶段 2（IOCTL #22-51）主数据读取**：使用阶段 1 存储的指针读取游戏数据字段，包括结构体头部、控制旋转、骨骼网格数据等。

**阶段 3（IOCTL #52-71）Actor 数组遍历**：遍历 ULevel 中的 Actor 数组，对每个 Actor 进行世界→屏幕投影和骨骼数据读取：

```
复制代码 隐藏代码
for i inrange(ActorCount):
    actor_ptr = read_ioctl(qword_49D7C0 + i*8)   # IOCTL #52
    world_pos = read_ioctl(actor_ptr + 0x150)      # Actor坐标
    rotation  = read_ioctl(actor_ptr + 0x30)       # Actor旋转
    bone_mtx1 = read_ioctl(actor_ptr + 0x660)      # 骨骼矩阵 #1
    bone_mtx2 = read_ioctl(actor_ptr + 0x690)      # 骨骼矩阵 #2
    bone_mtx3 = read_ioctl(actor_ptr + 0x6C0)      # 骨骼矩阵 #3
    bone_quat = read_ioctl(actor_ptr + 0xAE0)      # 骨骼四元数
    bone_pos  = read_ioctl(actor_ptr + 0xBA0)      # 骨骼位置
    screen_pos = sub_25CDC(world_pos, vp_matrix)   # 世界→屏幕变换
```

读取的偏移范围（+0x660 ~ +0xC00）远超标准 AActor 大小（~0x290），表明外挂直接读取 Character 子类中 **SkeletalMeshComponent** 的骨骼缓存矩阵，实现了骨骼自瞄（Bone Aimbot）和骨骼透视（Skeleton ESP）。

**阶段 4（IOCTL #72-75）收尾**：从 GameCharacter 读取 WeaponCoreComp1（+0x20B8）获取当前武器信息。

##### 3.3.3 sub_25CDC 矩阵变换算法

`sub_25CDC` （196 字节）使用 NEON SIMD 指令实现了标准 MVP 矩阵变换：

```
复制代码 隐藏代码
vec4 clipPos = VP_Matrix * Model_Matrix * vec4(worldPos, 1.0)
screenX = clipPos.x / clipPos.w * viewW/2 + viewW/2
screenY = -clipPos.y / clipPos.w * viewH/2 + viewH/2
```

Claude Code 通过阅读反汇编中的 NEON 指令（LD4 加载 4x4 矩阵、FMUL/FADD 乘加链），直接反向推导出这个 MVP 变换公式。

##### 3.3.4 34 次内存写入映射（最具突破性的发现）

分析中最关键的发现来自对 **34 次 SVC 0x10F（process_vm_writev）** 的追踪。从会话记录可以看到，Claude 首先通过 IDA MCP 查找所有 SVC 写入的上下文，然后逐一分析寄存器指向的地址和数据来源。

**阶段 A（8次）**：引擎核心结构体配置写入，偏移集中在 +0x2EC ~ +0x34C，值来自 `dword_47E544` 配置常量，用于控制 ESP/自瞄的开关和参数（FOV、视距等）。

**阶段 B 组1（2次）**：写 `LocalPlayer + 0x308/0x30C` — 玩家本地状态。

**阶段 B 组2（6次）**：写 `GameCharacter + 0x20C0 = WeaponCoreComp2`

会话记录中显示了关键的确认过程：Claude 在 SDK.txt 中搜索偏移 0x20B8 和 0x20C0，发现它们对应 WeaponCoreComp1 和 WeaponCoreComp2（武器槽组件指针）。这意味着外挂 **反复覆盖第二武器槽**，实现武器注入——无需拾取即可获得任意武器。

**阶段 B 组3（18次）**：写 `GameCharacter + 0x1C74 ~ 0x1CC0` 的英雄技能字段。

通过 SDK 字段匹配，主要写入目标包括技能连接数字段（+0x1C74，写入 100）、技能保护状态结构体（+0x1C88）、技能范围检测结构体（+0x1C9C）和技能召回标志（+0x1CAC）。

对应的 SDK 结构体定义为：

```cpp
复制代码 隐藏代码
structRepAbilityProtection {     // @ +0x1C88, size 0x14
    bool HasAbilityProtection;   // +0x00
    bool LeaveByAction;          // +0x01
    float ProtectionLeftSeconds; // +0x04
    Vector AbilityPosition;      // +0x08
};

structRepAbilityRangeTest {      // @ +0x1C9C, size 0x8
    bool IsOutOfValidRange;      // +0x00
    float OutOfRangeTestEndTime; // +0x04
};
```

> **AI 工作流要点**：会话记录中最能体现 AI 逆向威力的，是这个 SDK 字段匹配过程。Claude Code 一边通过 IDA MCP 追踪 SVC 调用上下文（哪个寄存器指向哪个地址），一边读取 SDK.txt 中的字段定义，通过偏移量匹配完成语义映射。从最初的"PlayerController"误判，到发现 WeaponCoreComp 修正为 GameCharacter，再到完整的技能字段映射——整个过程展示了 AI 的纠错和迭代推理能力。

#### 3.4 内存读写机制

分析揭示了一个精心设计的 **读写分离架构**：

```
复制代码 隐藏代码
读 (75x ioctl):
  外挂 .so → ioctl(fd, REQ_READ, &{game_addr}) → 内核模块 →
    ARM SMC/HVC → 读游戏进程物理内存 → 返回数据
  优点: 绕过所有用户态反作弊检测 (不触发 /proc/pid/mem 监控)

写 (34x process_vm_writev SVC0x10F):
  外挂 .so → SVC#0x10F(pid, iov, ...) → 直接写入游戏进程虚拟内存
  优点: Linux 原生 syscall，不依赖内核模块，绕过 libc hook
```

**读写分离的设计原因**：读操作频繁（75次/帧）且需要任意物理地址访问 → 使用内核模块性能更好；写操作频率低（仅修改关键值）→ 直接 syscall 更简单且减少内核模块的暴露面。即使内核模块被检测移除，写入功能依然可用。

#### 3.5 反检测机制

总结外挂使用的多层反检测策略（参考 `report.md` 中的完整分析）：

1.  **DebugCanvas 入口点**
    
    ：不从标准 GWorld 读取，绕过对热门全局变量的监控
    
2.  **内核模块 IOCTL 读内存**
    
    ：绕过所有用户态反作弊（不触发 `/proc/pid/mem` 监控）
    
3.  **process_vm_writev 写内存**
    
    ：原始 syscall 绕过 libc 函数 hook
    
4.  **XOR 字符串加密**
    
    ：所有敏感字符串（包名、路径、API 符号）静态加密
    
5.  **Shell 脚本设备节点恢复**
    
    ：检查 `/proc/*/fd/*` 中已删除的设备节点并重建
    
6.  **包名配置化**
    
    ：游戏包名通过配置文件 `PAN_xxx.ini` 设定，可切换目标
    

其中 Shell 脚本的反检测逻辑尤为精巧：

```bash
复制代码 隐藏代码
for file in /proc/*/fd/*; do
  link=$(readlink"$file" 2>/dev/null)
  if [[ "$link" == "/dev/$sbwj (deleted)" ]]; then
    open_file="$file"; break
  fi
done
if [[ -n "$open_file" ]]; then
  nhjd=$(echo"$open_file")
  sbid=$(ls -L -l "$nhjd" | sed 's/\([^,]*\).*/\1/' | sed 's/.*root //')
  rm -rf "/dev/$sbwj"
  mknod"/dev/$sbwj" c "$sbid" 0
fi
```

该脚本遍历所有进程的 fd 目录，查找指向已被删除的设备节点的符号链接，获取主设备号后重建 `/dev/` 下的节点，专门针对"删除 /dev/ 下设备节点使外挂无法访问硬件"的反作弊策略。

#### 3.6 SurfaceFlinger Overlay 渲染体系

样本通过 Android SurfaceFlinger API 创建硬件加速 ImGui Overlay，而不是使用传统的悬浮窗方案：

```
复制代码 隐藏代码
ImGui → SurfaceComposerClient::createSurface → SurfaceControl →
  SurfaceControl::getSurface → ANativeWindow →
    EGL (eglCreateWindowSurface → eglSwapBuffers) →
      OpenGL ES GPU 渲染
```

41 个完整的 SurfaceFlinger C++ mangled 符号通过两层 XOR 解密恢复，覆盖了从创建表面、设置图层/位置/矩阵到应用事务的完整渲染管线。这种方案比传统悬浮窗更难被检测，且性能更好（硬件合成）。

### 4\. 结论

#### 4.1 分析成果汇总

参考 `sub_27D40_analysis.md` 的完整分析和 `report.md` 的整体报告，本样本的核心结论如下：

| 分析项目 | 结果  |
| --- | --- |
| 样本类型 | ARM64 Android.so 动态库，~4.8MB |
| 目标平台 | 某 UE4 射击游戏 |
| 加密体系 | 两层 XOR 加密：.init_array 自动解密 + 运行时三层混合解密 |
| 解密成果 | 155 条字符串，含 41 个 SurfaceFlinger API 符号、553 字节 Shell 脚本 |
| 核心函数 | sub_27D40（21,912 字节，162 基本块，圈复杂度 106） |
| 内存读取 | 75 次 IOCTL/帧，通过内核模块 + ARM SMC/HVC |
| 内存写入 | 34 次 SVC 0x10F (process_vm_writev)，直接 syscall |
| 写入精确映射 | 8 次配置 + 2 次 LocalPlayer + 6 次 WeaponCoreComp2 + 18 次技能字段 |
| 实现功能 | ESP 透视 + 骨骼自瞄 + 武器注入 + 技能效果修改 |
| 渲染方式 | SurfaceFlinger + ImGui Overlay（硬件加速） |
| 矩阵变换 | sub_25CDC：NEON 优化 MVP 变换（196 字节） |
| 模块数量 | 6+ 协作模块：版本检测、哈希表 dlsym、渲染线程、初始化、核心、矩阵变换 |
| 反检测层数 | 6 层：间接入口点/内核模块读/原始 syscall 写/XOR 加密/设备节点恢复/配置化 |

#### 4.2 核心发现：武器注入 + 技能修改 + ESP/自瞄三合一

从 `sub_27D40_analysis.md` 的写入分析可知， `sub_27D40` **是一个面向 UE4 射击游戏的多功能作弊核心函数，集成了武器注入、技能效果修改、ESP 透视和自瞄功能。**

写入行为的 SDK 精确映射表明这不仅是 ESP/自瞄透视，更是一个武器+技能作弊器：

1.  **武器注入**
    
    ：6 次覆写 `WeaponCoreComp2` （+0x20C0），将任意武器组件指针注入角色第二武器槽
    
2.  **技能修改**
    
    ：18 次覆写技能相关字段，锁定技能连接数（+0x1C74 写入 100）、覆盖无敌状态（+0x1C88）、无视范围检测（+0x1C9C）、强制技能召回（+0x1CAC）
    
3.  **ESP + Aimbot**
    
    ：Actor 数组遍历 + sub_25CDC MVP 矩阵变换 + 0x660~0xC00 骨骼数据读取，实现方框透视、骨骼透视线、骨骼自瞄
    

#### 4.3 全局变量映射总结

经过 SDK 字段匹配修正后的最终映射关系（摘自 `sub_27D40_analysis.md` ）：

| 全局变量 | 类型  | 用途  |
| --- | --- | --- |
| `qword_49D6A8` | uint64 | UE4 基址 |
| `qword_49D6B0` | void\* | 引擎核心结构体（Ioctl 链根，阶段 A 写目标） |
| `qword_49D6C8` | GameCharacter\* | 游戏角色对象（含武器槽 WeaponCoreComp 和技能字段） |
| `qword_49D6D0` | CameraManager\* | 摄像机管理器（VP 矩阵来源） |
| `qword_49D7C0` | TArray\\<AActor\*\\> | Actor 数组（遍历目标） |
| `qword_49D7E0` | LocalPlayer\* | 本地玩家对象 |
| `dword_49D5F0` | pid_t | 游戏进程 PID |

#### 4.4 反检测体系总结

参考 `report.md` 的反检测分析，外挂构建了层次化防御体系：

-   **静态层**
    
    ：XOR 加密所有敏感字符串，密钥编码在指令中而非数据段
    
-   **访问层**
    
    ：不从标准 UE4 全局变量出发（防模式匹配），通过内核模块读内存（防用户态 hook），通过原始 syscall 写内存（防 libc hook）
    
-   **运行环境层**
    
    ：Shell 脚本恢复被反作弊删除的设备节点
    
-   **配置层**
    
    ：目标游戏包名和参数通过外部 ini 文件配置，可灵活切换
    

#### 4.5 AI 逆向工作流评价

从完整的会话记录 `2026-04-28-182421-this-session-is-being-continued-from-a-previous-c.txt` 可以总结 AI 辅助逆向的核心优势和局限：

**四大优势：**

-   **上下文关联能力**
    
    ：同时处理 IDA 反汇编、SDK 定义、解密脚本、分析文档等多个信息源，跨文件推理
    
-   **模式识别**
    
    ：快速识别 XOR 解密模式、IOCTL 调用模式、Actor 遍历循环等
    
-   **交互式探索**
    
    ：通过 MCP 插件直接操作 IDA，像人类分析师一样验证猜想
    
-   **纠错与迭代**
    
    ：从"PlayerController"误判到"WeaponCoreComp"修正为"GameCharacter"，展示了 AI 的纠错能力
    

**三大局限：**

-   缺乏运行时动态分析能力，对堆内存布局和多态分发无能为力
    
-   对重度混淆（CFG Flattening、VMP）的防御能力有限
    
-   需要人工验证关键结论，避免看似合理但错误的推理
    

#### 4.6 遗留问题

摘自 `sub_27D40_analysis.md` 中的未解决问题：

| 问题  | 原因  |
| --- | --- |
| Ptr2 具体指向什么结构体？ | 需要匹配版本的游戏符号表 |
| Actor +0x150 的具体语义？ | SDK 对应 NetTag(int)，可能被子类覆写 |
| 骨骼数据精确格式？ | 无运行时数据，难以确认 FTransform 精确布局 |
| 自瞄算法细节？ | 骨骼读取后的瞄准逻辑在 sub_27D40 后半段未完全追踪 |

### 5.作者碎碎念

这篇文章主要是尝试AI在游戏安全逆向方向的一些探索，在基础的AI逆向之上，结合游戏的SDK尝试去自动分析功能和修改点。从结果上来说表现还是比较一般，过程中还是有比较多结构是我自己手动修正的，它并没有能完全理解外挂的逻辑，也有可能是我的prompt有优化空间或者是使用的模型知识不够。  
这次除了用CC+deepseekV4，其实还用了一些其他模型进行尝试。gpt5.3-codex、5.4和本地的qwen3.5 9b/35b a3b试了一下，最后效果的话我感觉还是deepseekV4 flash/pro的效果最好，pro在SDK和游戏引擎上理解上会比flash强点，但是也差不太多。  
后续的话还有几个想尝试的方向，一个是把之前破解过游戏加密使用AI看看能不能复现一遍，过程中看看有没有卡点。还有就是看看能不能实现AI自动找服务器和客户端的一些可攻击的校验漏洞。

**·** **今 日 推 荐** **·**

|     |     |
| --- | --- |
| ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e4a3cfcd0d78c35.jpg) |     |
