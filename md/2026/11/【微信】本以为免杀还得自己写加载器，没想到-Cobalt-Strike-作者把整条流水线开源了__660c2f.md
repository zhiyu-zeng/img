---
title: 【微信】本以为免杀还得自己写加载器，没想到 Cobalt Strike 作者把整条流水线开源了
source: https://mp.weixin.qq.com/s/_FL4B_0RgRMQ0m90BDs-qg
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T15:08:33+08:00
trace_id: 042119cd-3b60-4b4a-83ee-6c5731bfb7a6
content_hash: ef6ae310ef8ac6f7d3885a2a628b5ab2994688b61577826cd37677f3e1046005
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-819f-bbf3-d0622df989f4
ioc: null
---

**星夜AI安全** *2026年11月10日 12:49*

## 本以为免杀还得自己写加载器，没想到 Cobalt Strike 作者把整条流水线开源了

2021 年，Cobalt Strike 的作者 Raphael Mudge 离开安全行业，之后很久都没再公开发声。

11 月初，圈子里突然都在聊他回来了。

带回来的不是新框架，是两个开源项目： **Tradecraft Garden** 和 **Crystal Palace**。他把自己攒了十几年的免杀手艺，拆成了一条可以复用的流水线，免费公开。

其中最扎眼的一个，藏在 10 月 29 日那次更新里，名字叫 **Dr. Call**。

它的思路一句话能说透： **先用假参数去调那个准备发 syscall 的函数，等 hook 看完假参数、转身要走 syscall 之前的那一刻，再把真参数换上去。**

⚡ 一句话：他改的不是你的功能，是你的出厂形态。

## 一、技术全貌：这是什么？ 📌

**作者**：Raphael Mudge，Cobalt Strike 作者，2021 年离开行业，现以"Adversary Fan Fiction Writers Guild"（aff-wg.org）名义持续输出研究。

**两个项目的关系**：

| 项目  | 定位  | 通俗理解 |
| --- | --- | --- |
| **Crystal Palace** | 链接器 + 链接脚本语言 + AOP 工具 | 专门为"位置无关代码"造的 **流水线** |
| **Tradecraft Garden** | 一批内存中的免杀 tradecraft，打包成加载器与共享库 | 一本 **公开的免杀菜谱** |

他给这套东西的定义很克制： **"security ground truth"（安全真值）**—— 免杀手艺应该独立于 C2 能力存在，攻防双方拿同一套东西当基准，谁也别把关键手法锁在商业产品里。

许可上，2025 年 10 月项目从 GPL 切到了更宽松的 **BSD**，理由直白：想让更多人用起来。

站点上最新的一版源码包标注为 **20261029**，对应的发布日志标题叫《Dr. Call will see you now》。

**Tradecraft Garden 里到底有什么**，分三层：

-   **Technique Hikes（技巧主线）**：COFF Mixing、 **Dr. Call**、Module Stomping、Page Streaming、Stack Cutting
    
-   **Common Ground（公共地基）**：Tradecraft Garden Library（libtcg），负责 DLL 加载、PICO 运行、PIC 的 printf 调试
    
-   **Learning Path（学习路径）**：12 个 Simple Loader 变体 —— 反射式 DLL 注入、资源掩码、指针打补丁、另类 API 哈希、执行护栏、内容变换、IAT Hook、PICO 能力、PICO/DLL 双模、x64 栈回溯数据生成、简单 PIC、简单 BOF
    

> 🌈
> 
> 金句收尾：十二个变体摆在那儿，等于把选择权全交给你了。

## 二、为什么这个技术值得终端安全的师傅停下来看一眼

因为它改变的是 **免杀的成本结构**。

过去写一个能扛住主流 EDR 的 UDRL（用户态反射式加载器），是一个人几个月的活：PE 解析、重定位、导入表解析、栈伪造、内存权限翻转，一套一套手写，代码还不能开源——一开源，行内那套特征库就跟着更新。

现在这套活被拆成了 **可组合的积木**。

社区的反应速度能说明问题：

-   **RastaMouse** 把它做成了 **Crystal-Kit**，直接挂进 Cobalt Strike 的 Aggressor 脚本，钩住 `BEACON_RDLL_GENERATE` （把 UDRL 换掉）和 `POSTEX_RDLL_GENERATE` （后渗透 DLL 加载也换掉）
    
-   **Lorenzo Meacci** 在这个框架上做出了 **模块重载、.pdata 注册做栈回溯、NtContinue 入口转移** 这些更硬核的规避研究
    
-   **memn0ps** 在 2026 年做了一次体系对比，把"单体 UDRL"和"Crystal Kit 模块化"两条路摆在同一张表上
    

三种风格的对比：

| 维度  | 传统单体 UDRL | Crystal Palace + Garden |
| --- | --- | --- |
| 代码形态 | 一个 PE，`.text` 抽出来当 shellcode | 一堆 `.o` + 一个 `.spec` 链接脚本 |
| API 解析 | 自己写 PEB 步行 / 哈希解析 | **链接期用 `MODULE$Function` 解析** |
| 免杀组件 | 焊死在加载器里 | **独立成 PICO，可整块替换** |
| 二进制变异 | 靠混淆器 | **链接期 `+mutate` / `+disco` 直接改** |
| 产物特征 | 每次相似 | **每次构建都不一样，静态特征一次作废** |
| 能不能开源 | 不能  | BSD，随便用 |

最后一行才是关键。

> 🌈
> 
> 金句收尾：能公开的免杀，才第一次有了行业通用标准。

## 三、技术原理解析 ✨

### 要点一：链接期 API 解析 —— 连 PEB 步行都不用写

Crystal Palace 的链接脚本里，API 是用 模块$函数 这个语法声明的：

```
KERNEL32$VirtualAlloc
KERNEL32$LoadLibraryA
```

链接器会把它解析成真实地址并塞进 PIC 的导入结构。 **攻击者一行 PEB 步行都不用写，产物里也不会出现 `GetProcAddress` + 哈希轮。**

顺带一提，链接脚本里还能直接声明 **用户自定义内建函数**：

```php
intrinsic "__foo" $VAR      # 把对 __foo() 的调用替换成 $VAR 的内容
catch "myfunc" "my_lsh"    # 给指定函数挂一个 LSH 异常处理器
```

### 要点二：PICO —— 把"跑起来的能力"和"躲检测的手艺"彻底拆开

**PICO（Position-Independent Code Object）** 是 Crystal Palace 的一个约定：把规范化过的 COFF 对象， **从一个 PIC 内部直接跑起来**。它不像 BOF 那样绑定 Beacon，因此可以脱离任何 C2 框架单独使用。

工程上的好处很直接： **换一套免杀组件，不用重写加载器。** 加载器负责把 DLL 弄进来、把 PICO 拉起来、调用 `setup_hooks` 之类初始化函数，剩下的交给 PICO。

```
加载器 (PIC)  ──►  PICO (免杀组件)
   │                      │
   ├─ 加载目标 DLL        ├─ IAT Hook
   ├─ 分配 RWX            ├─ 调用栈伪装
   └─ 调 setup_*          └─ 睡眠掩码
```

libtcg 把这套骨架做成公共库，DLL 加载、PICO 运行、调试输出都是现成的。

### 要点三：Dr. Call —— syscall 参数篡改，用假参数骗 hook

这是 10 月 29 日那版最狠的一个项目，思路来自 rad9800 几年前的 `TamperingSyscalls` 概念。

传统做法是 **换调用点**：直接 syscall、间接 syscall（Heaven's Gate / Halo's Gate），都是让 hook 根本看不到调用。

Dr. Call 不换调用点，它 **换参数**：

```
① 用假参数调用「准备发 syscall 的那个函数」
        ↓
   用户态 hook 在这里拦截 —— 看到的是假参数
        ↓
② 用 CPU Trap flag 单步执行，一路走到 syscall 指令前
        ↓
③ 此刻（就在 syscall 之前）把真参数写回寄存器
        ↓
④ 真正的 syscall 带着真参数进内核
```

**关键点在于异常载体。** 绝大多数用 CPU Trap / 硬件断点做单步的 PoC，都靠 **VEH（向量异常处理）** 接单步异常。Dr. Call 换成了 **LSH（Language-specific Handler）**。

LSH 是什么？这是 Crystal Palace 在实现 `.pdata` / `.xdata` 栈回溯元信息时的"顺手产物"。它的调用时序非常关键：

```
异常发生
  │
  ├─► VEH 先接手 ──► 如果 VEH 把异常吞了，LSH 永远不会被调用
  │
  └─► VEH 没吞 ──► OS 展开该线程的调用栈
                     │
                     └─► 逐帧查询栈回溯元信息（.pdata）
                          │
                          └─► 找到挂在该函数上的 LSH ──► 调用它
```

**LSH 只有在 VEH 放行之后才会被问到。** 这是一条 EDR 几乎没人监控的旁路。

原理示意（伪代码，仅用于说明机制，不是可编译载荷）：

```java
/* Dr. Call 机制示意（伪代码，非可编译载荷） */
void handler_for_a_syscall_calling_function(...)   /* LSH 回调 */
{
    if (即将执行的指令 == syscall) {
        把真参数写回 RCX / RDX / R8 / R9;
    }
}

/* 主流程 */
trap_flag_on();
用假参数调用(目标函数);        /* hook 在这里只能看到假参数 */
trap_flag_step_until_syscall(); /* 每一步异常交给上面的 LSH */
/* 到 syscall 前，真参数已经换上 */
```

作者在实现时踩到一个真实的坑，值得单独讲： **Win32 的展开器要求，挂了 LSH 的函数在 `call` 和 epilogue 之间至少要有一条指令**，否则 LSH 根本不触发。作者是靠"半夜给 AI 打电话"定位到这一条的，然后用 `ised` 工具往那个位置 **定点插一条 NOP** 来证明差别，最后干脆写了个检查器，把这种情况直接报成错误。

顺带一提，作者把这种经历叫"inconvenient happy accidents"，并感慨 bin2bin 仍然是一片雷区。

> 🌈
> 
> 金句收尾：hook 拦的是调用，篡改打的是参数。

## 四、实战应用场景

**环境搭建** （官方推荐 WSL，理由是交叉编译和链接脚本顺手）：

```bash
wsl --install
sudo apt-get update && sudo apt-get install mingw-w64 make openjdk-11-jdk zip

git clone https://github.com/rsmudge/tradecraft-garden
cd tradecraft-garden
./install          # 生成 ~/.local/bin/cpl 命令，并配好 tab 补全
```

**典型流水线**：

```
① 写 C 源码  ──►  ② 编成 COFF (.o)  ──►  ③ 用 .spec 链接  ──►  ④ 得到位置无关 blob
   src/loader.c      x86_64-w64-mingw32-      cpl link loader.spec      可直接注入的载荷
                     gcc -c -o loader.o        （+optimize 可选）
```

**不同免杀手段在防守侧留下的痕迹**，大致是这样：

| 手段  | 磁盘  | 用户态遥测 | 内核遥测 | 特征库价值 |
| --- | --- | --- | --- | --- |
| 传统 UDRL + 模块踩踏 | 无   | 中（IAT / 异常） | 高   | 中   |
| 链接期变异（ `+mutate` ） | 无   | 低   | 中   | **几乎归零** |
| PICO 拆分免杀组件 | 无   | 中   | 中   | 低   |
| **Dr. Call syscall 篡改** | 无   | **极低（参数不一致是唯一抓手）** | 中   | 低   |
| 改写 `.pdata` 挂 LSH | 无   | **极低** | 中   | 低   |

诚实标注边界：这套东西 **不能替代内核级遥测**。`.pdata` 被改写、异常链异常、参数不一致这些点，内核组件仍然看得见；它真正消掉的是 **用户态的静态特征和粗糙的行为规则**。

> 🌈
> 
> 金句收尾：它躲得过特征库，躲不过内核的记事本。

## 五、防御对抗建议 🔥

防守方的思路要跟着变： **从"认代码"转向"认不一致"**。

**1\. 参数一致性校验（优先级最高）**

用户态调用点传下去的参数，和最终进入内核的参数如果对不上，这是 Dr. Call 类手法留下的最硬痕迹。可行的观察点：ntdll stub 的返回地址是否落在预期模块、调用栈是否可回溯、参数寄存器在进入内核前是否发生过改写。

**2\. 异常链异常检测**

LSH 这条旁路现在几乎没人管。可查项：

-   同一线程内短时间内 **异常密度异常** （单步异常尤其明显）
    
-   **VEH 与 LSH 同时存在** 但 VEH 从未吞掉任何异常
    
-   `.pdata` / `.xdata` 区域在运行期被写入（**原本应当是只读映射**）
    

**3\. 离线审计 `.pdata`**—— 下面这段是纯标准库实现的只读审计脚本，专门找"哪些模块里挂了异常处理器"：

```python
# unwind_lsh_audit.py —— 只读审计：扫描指定 PE 文件的 .pdata，列出挂了异常处理器的函数
# 仅读取磁盘文件，不加载、不执行被检查的模块，也不需要任何特权。
# 用法: python unwind_lsh_audit.py C:\Windows\System32\ntdll.dll
import struct, sys

def read_u16(b, o): return struct.unpack_from("<H", b, o)[0]
def read_u32(b, o): return struct.unpack_from("<I", b, o)[0]

def audit(path):
    d = open(path, "rb").read()
    e_lfanew = read_u32(d, 0x3C)
    assert d[e_lfanew:e_lfanew+4] == b"PE\0\0", "不是 PE 文件"
    coff = e_lfanew + 4
    nsec = read_u16(d, coff + 2)
    opt_size = read_u16(d, coff + 16)
    opt = coff + 20
    magic = read_u16(d, opt)
    assert magic == 0x20B, "本脚本只处理 x64 (PE32+)"
    ddir = opt + 112                      # x64 数据目录起点
    exc_rva, exc_size = read_u32(d, ddir + 3*8), read_u32(d, ddir + 3*8 + 4)

    secs = []
    sh = opt + opt_size
    for i in range(nsec):
        o = sh + i*40
        name = d[o:o+8].rstrip(b"\0").decode("latin1")
        secs.append((name, read_u32(d, o+12), read_u32(d, o+8),
                     read_u32(d, o+20), read_u32(d, o+16)))  # va,vsize,rawsize,rawptr

    def rva2off(rva):
        for _n, va, vs, rs, rp in secs:
            if va <= rva < va + max(vs, rs):
                return rp + (rva - va)
        return None

    print("[*] 文件:", path)
    print("[*] 异常目录 RVA=0x%x size=0x%x" % (exc_rva, exc_size))
    if not exc_size:
        print("[!] 无 .pdata 异常目录"); return

    off = rva2off(exc_rva)
    if off is None:
        print("[!] 找不到 .pdata 对应的节"); return

    count, flagged = 0, []
    # x64 的 RUNTIME_FUNCTION 是 12 字节: BeginAddress / EndAddress / UnwindInfoAddress
    for i in range(exc_size // 12):
        b, e, uw = struct.unpack_from("<III", d, off + i*12)
        uoff = rva2off(uw)
        if uoff is None: continue
        count += 1
        ver_flags = d[uoff]
        flags = (ver_flags >> 3) & 0x3      # UNW_FLAG_EHANDLER = 1
        if flags & 1:
            ncodes = d[uoff+2]
            csize = ((ncodes + 1) & ~1) * 2
            handler_rva = uw + 4 + csize
            flagged.append((b, e, handler_rva))

    print("[*] RUNTIME_FUNCTION 条目: %d" % count)
    print("[*] 挂了异常处理器(UNW_FLAG_EHANDLER)的函数: %d" % len(flagged))
    for b, e, h in flagged[:20]:
        print("    RVA 0x%06x-0x%06x  -> handler @ 0x%06x" % (b, e, h))
    if len(flagged) > 20:
        print("    ... 其余 %d 条省略" % (len(flagged) - 20))
    print("[*] 提示: LSH 就寄生在这类条目上, 审计它是离线、可重复的。")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__); sys.exit(1)
    audit(sys.argv[1])
```

**4\. 不要只依赖单一层的 hook**

用户态 inline hook、IAT hook 都会被绕。真正能兜住的是 **内核侧的交叉验证**。

> 🌈
> 
> 金句收尾：认代码的时代过去了，认不一致的时代开始了。

## 六、技术延伸阅读

| 资源  | 地址  |
| --- | --- |
| Tradecraft Garden 主页 | https://tradecraftgarden.org/ \[1\] |
| 作者发布日志 | https://aff-wg.org/ \[2\] |
| 本次更新日志（2026-10-29） | https://aff-wg.org/2026/10/29/dr-call-will-see-you-now/ \[3\] |
| Dr. Call 项目页 | https://tradecraftgarden.org/drcall.html \[4\] |
| 源码仓库 | https://github.com/rsmudge/tradecraft-garden \[5\] |
| LSH 机制说明（2026-07-16） | https://aff-wg.org/2026/07/16/lsh-delish/ \[6\] |
| 栈回溯元信息（2026-06-01） | https://aff-wg.org/2026/06/01/relax-and-unwind-in-the-tradecraft-garden/ \[7\] |
| 不变量 YARA 生成器（2026-02-02） | https://aff-wg.org/2026/02/02/the-islands-of-invariance/ \[8\] |
| 原始思路来源 | https://github.com/rad9800/TamperingSyscalls \[9\] |

**一句话总结**：Mudge 把免杀从一门手艺，做成了一条可以公开复用的流水线；Dr. Call 则是这条流水线上第一个真正打到"用户态 hook 看错了参数"这个盲区的项目。

师傅们，看完觉得有启发，记得三连（点赞 + 在看 + 关注）。想深挖哪一块，评论区留言，师傅逐条看。

## 圈子介绍

现任职于某头部网络安全企业攻防研究部，核心红队成员。2021-2023年间累计参与40+场国家级、行业级攻防实战演练，精通漏洞挖掘、红蓝对抗策略制定、恶意代码分析、内网横向渗透及应急响应等技术领域。在多次大型演练中，主导突破多个高防护目标网络，曾获"最佳攻击手""突出贡献个人"等荣誉。

已产出的安全工具及成果包括：

-   多款主流杀软通杀工具（兼容卡巴斯基、诺顿、瑞星、360等终端防护，无感知运行，突破多引擎联合检测）
    
-   XXByPassBehinder v1.1 冰蝎免杀生成器（定制化冰蝎免杀工具，绕过主流终端防护与EDR动态检测，支持自定义载荷）
    
-   哥斯拉二开免杀定制版（二开优化，深度免杀，突破终端防护与EDR检测，适配多场景植入）
    
-   NeoCS4.9终极版（高级免杀加载工具，强化载荷注入与进程劫持，适配多系统版本，无兼容问题）
    
-   WinDump\_免杀版（浏览器凭证窃取工具，支持Chrome/Edge/Firefox等主流浏览器，一键提取敏感数据，免杀过防护）\_
    
-   fscan二开版（二开优化内网扫描工具，增强指纹精度、弱口令爆破与结果标准化输出，适配复杂内网）
    
-   RingQ加载器二开版（二开优化免杀加载器，支持Shellcode内存执行，绕过各类终端防护与EDR检测）
    
-   多款免杀Webshell集合（覆盖PHP/JSP/ASPX，过主流WAF与终端防护，适配不同Web场景）
    
-   免杀360专属加载器（支持Shellcode内存执行，针对性绕过360全系防护检测，无感知运行）
    
-   一键Kill 火绒 defender 工具 **HDKiller** （包含源码）
    
-   win11 一键kill 360工具 **InjectKill** （包含源码）
    
-   win11 一键kill defender工具 **win11_df-killer** （包含源码）
    
-   免杀火绒6.0内存防护加载器 **BypassMemLoader**
    
-   单文件过360 免杀loader **exe_bypass_360**
    
-   单文件过火绒 df 免杀loader **exe_bypass_df** (包含源码)
    
-   LNK钓鱼文件生成工具V1.0
    
-   EXE捆绑启动器 v2.0
    
-   火绒6内存免杀加载器 **bypasshr6**
    
-   火绒一键Kill专杀工具 **HRKiller**
    
-   Ring3 内存免杀工具 **Ring3bypasshr.exe**
    
-   win11 一键kill 360工具 **Kill360_V2**
    
-   win11 一键kill 360工具 **Kill360_V3.1**
    
-   win11 一键kill 360工具 **Kill360_V4**
    
-   **bypassEDR_hashdump_V1** bypass EDR 导出hash工具
    

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/20c4a96e6d20460b.jpg "image")

### 引用链接

\[1\] *https://tradecraftgarden.org/*

\[2\] *https://aff-wg.org/*

\[3\] *https://aff-wg.org/2026/10/29/dr-call-will-see-you-now/*

\[4\] *https://tradecraftgarden.org/drcall.html*

\[5\] *https://github.com/rsmudge/tradecraft-garden*

\[6\] *https://aff-wg.org/2026/07/16/lsh-delish/*

\[7\] *https://aff-wg.org/2026/06/01/relax-and-unwind-in-the-tradecraft-garden/*

\[8\] *https://aff-wg.org/2026/02/02/the-islands-of-invariance/*

\[9\] *https://github.com/rad9800/TamperingSyscalls*
