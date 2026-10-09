---
title: 【先知】ELF COPY 重定位下的权限位改写
source: https://xz.aliyun.com/news/92903
source_host: xz.aliyun.com
clip_date: 2026-10-09T14:44:18+08:00
trace_id: 76498f41-5904-4443-b0d8-038beaa09e26
content_hash: 5f60e066e84205e79a380b88cac54280afc9b7d6f1aca210d19d25a6b605d8f7
status: synced
tags:
  - 先知
  - Linux安全
  - 漏洞分析
series: null
feed_source: 先知安全技术社区
ai_summary: 主程序直接引用共享库变量会触发 `R_X86_64_COPY`，把权限位副本搬进主程序可写的 `.bss`，使授权状态可被改写或在两端分裂。
ai_summary_style: key-points
images_status:
  total: 41
  succeeded: 41
  failed_urls: []
notion_page_id: 3f475244-d011-81ca-89ef-f51b08e6d58a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 主程序直接引用共享库变量会触发 `R_X86_64_COPY`，把权限位副本搬进主程序可写的 `.bss`，使授权状态可被改写或在两端分裂。
> 
> - **成因：** 可执行文件直接引用共享库导出的数据符号时，链接器生成 `R_X86_64_COPY`，加载器把初值拷入主程序 `.bss` 副本，库内 GOT 引用也改指它；函数取址则统一到主程序 canonical PLT 入口。
> - **可写面：** 副本落在 `.bss`，天生可写且不在 `GNU_RELRO` 覆盖范围内，Full RELRO 也保护不到；主程序越界写 `stash[-8]` 即可让 `check_capability(0x40)` 由 DENIED 翻为 GRANTED。
> - **默认绑定 vs `-Bsymbolic`：** 默认绑定下库函数经 GOT 解析到主程序副本，读到 `0x41`；`-Bsymbolic`/protected 使符号不可抢占，GOTPCRELX 被 relax 成 `lea` 直拨，库读自己的 `0x1`——同进程两份状态，同一逻辑判定结果相反。
> - **误区：** PIE 不免疫 COPY（改为链接时偏移），`-Bsymbolic` 也不消除主程序 COPY；只有不声明 `extern` 变量、纯走函数接口的程序才无 COPY。
> - **排查修复：** 用 `readelf -sW` 找 `OBJECT GLOBAL DEFAULT` 导出、`readelf -rW` 找 `R_X86_64_COPY`；提供方以 `-fvisibility=hidden` 或 protected 隐藏数据符号（链接期即报 undefined reference），只放行 API 函数。结论仅适用 x86-64 Linux。

> 主程序把共享库中的 `capability_mask` 写成 `0x41` 后，库函数会读到更新值，还是继续读到 `0x01` ？答案不在变量名里，而在 ELF 重定位与符号绑定生成的地址关系中。

## 把名词先捋顺

|     |     |     |
| --- | --- | --- |  
| 名词  | 白话解释 | 角色  |
| 共享库（`.so` ） | 相当于"零件仓库"：编译好的函数和变量，供多个程序共用 | `provider.c` 编译出的 `libcapability.so` ，是权限位的"原始产地" |
| 符号（symbol） | 变量名和函数名的统称，是链接时用来"对暗号"的名字 | 主角 `capability_mask` 就是一个变量符号 |
| 重定位（relocation） | 编译期地址还没定，链接期/加载期按规则把地址"填进去" | `R_X86_64_COPY` 就是一条特殊重定位 |
| GOT（全局偏移表） | 相当于"电话簿/查号台"：程序运行时查这张表，才知道外部符号的真实地址 | 默认绑定时，库函数通过查号台找到权限位地址 |
| PLT（过程链接表） | 相当于"中转站"：调用外部函数时先经过的跳板 | canonical PLT 的主角 |
| `.bss` 段 | 程序里"只声明、没给初始值"的存储区，运行时清零， **天生可写** | COPY 副本的落点，安全隐患的核心现场 |
| PIE / 非 PIE | 程序加载地址是否随机化（ASLR 的前提）。非 PIE 的地址是固定的 | 非 PIE 提供最直观的固定地址 |
| `-Bsymbolic` | 链接共享库时的选项：让库内引用"不查号台、直接找自己人" | 制造"两份状态"的开关 |
| COPY relocation | 加载器把共享库变量的初始值复制到主程序分配好的存储里，之后所有引用都指向主程序这份 | 核心对象 |

共享库是"房东"，变量是"租客"。正常情况租客住在房东的房子里；COPY relocation 干的事，是 **把租客强行搬到主程序家里**，还通知所有人"以后去主程序家找人"。而 `-Bsymbolic` 干的事，是房东自己留了把备用钥匙——主程序家有一份，房东家也有一份， **两份状态从此各说各话**。

## 实验环境

|     |     |
| --- | --- | 
| 项   | 值   |
| 发行版 | Kali GNU/Linux Rolling 2026.1 |
| 内核  | Linux 6.19.11+kali-amd64 |
| 架构  | x86_64 |
| GCC | gcc (Debian 15.2.0-16) 15.2.0 |
| Binutils / ld | GNU ld (GNU Binutils for Debian) 2.46 |
| readelf | GNU readelf (GNU Binutils for Debian) 2.46 |
| glibc | ldd (Debian GLIBC 2.43-4) 2.43 |

## 越过接口：主程序直接改写权限位

### 共享库 provider.c

共享库定义权限位 `capability_mask` ，初始值 `0x01` ，并暴露三个函数：取地址、读值、写值。

```c
#include <stdint.h>

int capability_mask = 0x01;

int *provider_mask_address(void) {
    return &capability_mask;
}

int provider_mask_value(void) {
    return capability_mask;
}

void provider_mask_set(int value) {
    capability_mask = value;
}
```

### 主程序 direct_consumer.c

主程序不走共享库的写接口，而是声明 `extern int capability_mask` ， **直接读写这个变量**，赋值前后各打印一次地址和值。

```c
#include <stdio.h>

extern int capability_mask;
int *provider_mask_address(void);
int provider_mask_value(void);

int main(void) {
    printf("phase=before main_addr=%p main_value=0x%x lib_addr=%p lib_value=0x%x\n",
           (void *)&capability_mask, capability_mask,
           (void *)provider_mask_address(), provider_mask_value());
    capability_mask = 0x41;
    printf("phase=after main_addr=%p main_value=0x%x lib_addr=%p lib_value=0x%x\n",
           (void *)&capability_mask, capability_mask,
           (void *)provider_mask_address(), provider_mask_value());
    return 0;
}
```

> `capability_mask = 0x41` 这一行，主程序打算绕过 `provider_mask_set` 直接改权限位。这在语法上完全合法——变量是全局的、默认可见的。 **问题从这一步就埋下了**：主程序在编译期就握有对权限位的直接写入路径。

### 编译成目标文件并观察重定位

```bash
# 编译直接访问主程序对象
gcc -fno-pie -O0 -g -Wall -Wextra -Werror -c direct_consumer.c -o direct_consumer.o
# 编译位置无关共享库对象
gcc -fPIC -O0 -g -Wall -Wextra -Werror -c provider.c -o provider.o
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cb74448fa37cf97e.png)

```bash
# 打印主程序对象中 capability_mask 的重定位
readelf -rW direct_consumer.o | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d950062232b8737.png)

这五条记录对应主程序对权限位的五次引用。 `R_X86_64_PC32` （相对地址）和 `R_X86_64_32` （绝对地址）说明主程序 **直接用指令访问这个变量**，而不是像调用函数那样走 PLT/GOT。重点看偏移 `0x3c` 那条：它对应 `capability_mask = 0x41` 的写入。也就是说，主程序对象文件里白纸黑字写着"我要把 0x41 写到 capability_mask 指向的地址"。

```bash
# 打印共享库对象中经 GOT 访问权限位的重定位
readelf -rW provider.o | grep R_X86_64_REX_GOTPCRELX
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b5c6eabac4cfb445.png)

共享库这边完全是另一条路—— `R_X86_64_REX_GOTPCRELX` 表示它通过 GOT（查号台）间接访问权限位：先查表拿到地址，再读那个地址。 **为什么这个区别是关键？** 因为"查号台"是可以被改写的：加载器解析符号时，完全可以把查号台指向主程序的副本。共享库代码没有变，读到的却是别人家的地址。

把主程序的引用落到具体指令上：

```bash
# 反汇编主程序对象并显示重定位附注
objdump -dr -M intel direct_consumer.o
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/75547ce3f4de9fbc.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8db687d4840d5829.png)

看 `3a` 处的指令 `mov DWORD PTR [rip+0x0],0x41` ——编译器把常量 `0x41` 直接写进 `capability_mask` 重定位确定的地址，前后没有任何接口调用、没有校验。前后的 `mov eax,[rip+...]` （ `18` 、 `53` 处）又在读同一个变量。 **主程序对权限位的读写是实打实的直接内存操作**。链接器将决定这些地址最终指向哪里。

## 户口迁移：权限位住进主程序.bss

### 构建共享库和非 PIE 主程序

发行版 gcc 默认启用 PIE（ `-fPIE -pie` ），构造非 PIE 主程序时必须显式传入链接选项 `-no-pie` ，否则 ELF 头类型会是 `DYN (Position-Independent Executable)` 。文章后续所有对照程序的文件类型均以 `readelf -h` 的 `Type` 字段为准。

```bash
# 构建默认绑定共享库
gcc -fPIC -O0 -g -Wall -Wextra -Werror -shared provider.c -Wl,-soname,libcapability.so -o libcapability.so
# 构建直接访问共享库数据的非 PIE 主程序
gcc -no-pie -O0 -g -Wall -Wextra -Werror direct_consumer.c -L. -lcapability -Wl,-rpath,'$ORIGIN' -o direct_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4112a9072f55fc20.png)

```bash
# 验证 ELF 类型：非 PIE 是 EXEC（后文 PIE 对照程序会是 DYN）
readelf -h direct_consumer | grep 类型
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66f25dbbe6bfc6a4.png)

### 看动态重定位表：COPY 出现了

```bash
# 打印最终程序中 capability_mask 的动态重定位
readelf -rW direct_consumer | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/aa7a239de4218f65.png)

链接器没有把共享库里的变量地址直接填进主程序指令，而是生成了 `R_X86_64_COPY` 。这条记录的意思是： **加载程序时，把共享库中** `capability_mask` **的初始值（** `0x01` **）复制到主程序地址** `0x404028` **，以后所有对** `capability_mask` **的引用都指向这里**。权限位的"户籍"从此迁到主程序。

地址关系示意：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/72857f35aa36511e.svg)

### 动态符号表：符号的户籍已经改了

```bash
# 查询 capability_mask 的动态符号地址、大小和节索引
readelf -sW direct_consumer | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c1dfacc90bbff3b7.png)

动态符号表里 `capability_mask` 的地址是 `0x404028` 、节索引是 `25` ——它现在以 **主程序符号** 的身份存在。共享库仍然是初始值的提供者，但运行时所有人认的都是主程序这份。

### .bss 段：天生可写、还在 RELRO 保护范围之外

```bash
# 查询主程序的 bss 节
readelf -SW direct_consumer | grep -E '\.(bss|dynbss)'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11903a4f1498ccb1.png)

节索引 25 正是 `.bss` ，标志 `WA` = 可写（W）+ 已分配（A）。三个关键点：

1.  `.bss` **的用途就是放"运行时才存在"的变量**，天然可写。权限位副本落在这里，意味着它 **不需要任何特殊权限操作就能被改写**。
2.  `.bss` **不在 RELRO 保护范围内**。看程序头里的 `GNU_RELRO` 段边界：

```bash
# 查询 GNU_RELRO 段边界
readelf -lW direct_consumer | grep GNU_RELRO
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5f74de1e92574cc8.png)

`GNU_RELRO` 从 `0x403dd8` 起只覆盖 `0x000228` 字节（到 `0x404000` 为止），让 GOT/重定位表附近的一小段映射变成只读； `0x404028` 落在这段只读范围 **之外** （还差 `0x28` 字节），所以 **即使开启 Full RELRO，COPY 副本依然可写**。这是很多人在"已经开了 RELRO"之后仍然中招的原因。

3.  **副本虽是 NOBITS，运行前却读到** `0x1` ：`.bss` 在文件里不占空间（ `NOBITS` ），加载时内核把映射页清零；但动态链接器处理 COPY 重定位时，会把共享库的初始值 `0x01` **拷入** 这块副本——清零发生在拷贝之前，COPY 之后 `capability_mask` 读到的是 `0x1` 。这也解释了为什么有初始值的变量也能"落 `.bss` "：链接器只需要在可写段里占个位（ `NOBITS` 占位），初值由加载器在运行时写入，文件里无需存储。顺带说明：`.bss` 节总大小是 8 字节而 `capability_mask` 只有 4 字节，多出的 4 字节是主程序其他未初始化全局（编译产物），动态符号表只登记权限位这一个符号。

### 反汇编：指令已经指向主程序副本

```bash
# 定位 main 中读取、取址和写入 capability_mask 的指令
objdump -d -M intel direct_consumer | sed -n '/<main>:/,/ret/p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8bba3edd74a72ec5.png)

`40115e` 的 `mov eax,[rip+0x2ec4]` 注释直接标出 `# 404028 <capability_mask>` ； `401184` 的 `mov DWORD PTR [rip+0x2e9a],0x41` 同样指向 `# 404028` ， `401164` 的 `lea rsi,[rip+0x2ebd]` 又在取同一个地址。主程序 **取地址、读值、写值全部对准** `0x404028` ——这就是它自己的 `.bss` 副本。没有异常访问、没有越界，全是合法指令。

### 加载段权限：副本所在的映射可写

```bash
# 查询主程序的可加载段权限
readelf -lW direct_consumer | grep -A2 -B1 ' RW '
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dd35b81dc286b87e.png)

`0x404028` 落在从 `0x403dd8` 开始的 `RW` 映射里。指令能直接把 `0x41` 写进副本，依赖的就是这段 **正常可写** 的段权限。到这里，权限位从"共享库里的私有数据"变成"主程序可写段里的一块普通变量"，路径完全闭合。

## 默认绑定之下：库函数跟着副本走

### 运行程序，看两端地址

```bash
# 打印赋值前后主程序与共享库函数的地址和值
./direct_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e8ece669bd93c5ae.png)

这是最关键的一张运行结果。赋值前，主程序和库函数返回的 **地址相同** （都是 `0x404028` ）；赋值后， **库函数读到的值也变成了** `0x41` 。换句话说：主程序直接写 `0x41` ，连共享库自己的 `provider_mask_value()` 都跟着看到 `0x41` 。

> 为什么？
> 
> 因为符号解析有个规则： **可执行文件里的符号定义优先级最高**。加载器解析 `capability_mask` 时，发现主程序里有 COPY 副本（动态符号表里的定义），于是共享库内部通过 GOT（查号台）的引用也被解析到 `0x404028` 。库函数的代码一行没改，读到的却是主程序家的地址。

这背后是符号 interposition（抢占）机制：动态链接器在 **全局作用域** （global scope）内解析符号，可执行文件的符号优先级最高， `LD_PRELOAD` 注入的库甚至能抢占可执行文件之外的符号——默认绑定的共享库天生接受这种"被顶替"的规则。

查号台（GOT）原本登记的是"权限位在共享库 `0x4008` "，COPY 之后查号台被改成"权限位在主程序 `0x404028` "。库函数打电话前先查号台，结果打到主程序家去了。

## 备用钥匙：-Bsymbolic 撕裂同一份状态

### 构建对照程序

```bash
# 构建库内符号优先绑定的共享库
gcc -fPIC -O0 -g -Wall -Wextra -Werror -shared provider.c -Wl,-soname,libcapability_symbolic.so -Wl,-Bsymbolic -o libcapability_symbolic.so
# 使用同一份直接访问主程序源码完成链接
gcc -no-pie -O0 -g -Wall -Wextra -Werror direct_consumer.c -L. -lcapability_symbolic -Wl,-rpath,'$ORIGIN' -o direct_symbolic_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a28073da5c45b5b5.png)

### 主程序照样有 COPY

```bash
# 打印符号绑定对照程序中的 capability_mask 重定位
readelf -rW direct_symbolic_consumer | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9583a9503bec8ac8.png)

`-Bsymbolic` **不会消除主程序的 COPY 副本**。它管的是"共享库内部怎么引用自己的符号"，管不了"主程序怎么引用共享库的符号"。主程序源码没变，COPY 照常生成。

### 对比两个库的反汇编：查号台 vs 直拨

```bash
# 反汇编默认共享库的 provider_mask_value
objdump -d -M intel libcapability.so | sed -n '/<provider_mask_value>:/,+7p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/65451240fdf91cea.png)

```bash
# 反汇编符号绑定共享库的 provider_mask_value
objdump -d -M intel libcapability_symbolic.so | sed -n '/<provider_mask_value>:/,+7p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b7cf3aac2036040f.png)

两段代码只差一条指令，语义天差地别：

-   默认库： `mov rax,[rip+0x2eb7]` —— **先查 GOT 槽** （ `# 3fc8` ），再从查到的地址取值。GOT 槽可以被加载器改写，所以最终可能指向主程序副本。
-   `-Bsymbolic` 库： `lea rax,[rip+0x2ef7]` —— **直接计算库内地址** （ `# 4008 <capability_mask>` ），不经过查号台。加载器改不了这条指令的结果。

**为什么会出现"查号台 vs 直拨"？** 这正是 `R_X86_64_REX_GOTPCRELX` 的 relax（松弛化）机制：默认绑定下 `capability_mask` 可被外部抢占（preemptible），GOT 取址 **不 relax**，运行时必须经查号台解析； `-Bsymbolic` 让库内符号变为不可抢占（non-preemptible），链接器据此把 GOTPCRELX **relax 成直接** `lea` **取址**，不再依赖 GOT。protected 可见性的符号同理——库内访问同样可以被 relax 成直拨（见后文）。

**一个查号、一个直拨，就是两份状态的根源。**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7a651cc7d8bfedaa.svg)

### 运行：两份状态当场分裂

```bash
# 打印符号绑定对照下两端地址和值
./direct_symbolic_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6965d123cfc5d00d.png)

主程序的写入已生效（ `main_value=0x41` ），但库函数返回的地址是 `0x7fb21e3dc008` （共享库映射内），值还是 `0x1` 。同一时刻、同一个进程里， `capability_mask` 有两个值。 **这不是数据竞争，是链接方式造成的状态分裂**：主程序相信 `0x41` ，共享库相信 `0x1` 。任何以"两端状态一致"为前提的判断都会出错。

## 同一个逻辑，两种判决：GRANTED 还是 DENIED

前面看到的是"地址不同、数值不同"，还没回答安全问题： **权限判断到底会得出什么结论？** 给共享库加一个授权判定函数，让后果直接现形。

### auth_provider.c：带授权判定的共享库

```c
#include <stdint.h>

int capability_mask = 0x01;

int *provider_mask_address(void) {
    return &capability_mask;
}

int provider_mask_value(void) {
    return capability_mask;
}

void provider_mask_set(int value) {
    capability_mask = value;
}

/* 授权判定：要求 capability_mask 达到 required 才放行 */
int check_capability(int required) {
    return capability_mask >= required;
}
```

### auth_consumer.c：绕过接口直接改权限位

```c
#include <stdio.h>

extern int capability_mask;
int *provider_mask_address(void);
int provider_mask_value(void);
int check_capability(int required);

int main(void) {
    /* 模拟攻击者/低权限代码不经接口直接改写权限位 */
    capability_mask = 0x41;
    printf("main_value=0x%x lib_value=0x%x check(0x40)=%s\n",
           capability_mask, provider_mask_value(),
           check_capability(0x40) ? "GRANTED" : "DENIED");
    return 0;
}
```

> `check_capability(0x40)` 的语义是"权限位达到 `0x40` 才放行"。主程序把权限位改成 `0x41` 后调用它—— **同一个二进制逻辑，只改链接选项，判定结果完全相反**。

```bash
# 构建授权判定共享库（默认 + -Bsymbolic）
gcc -fPIC -O0 -g -Wall -Wextra -Werror -shared auth_provider.c -Wl,-soname,libauth.so -o libauth.so
gcc -fPIC -O0 -g -Wall -Wextra -Werror -shared auth_provider.c -Wl,-soname,libauth_symbolic.so -Wl,-Bsymbolic -o libauth_symbolic.so
# 同一份主程序源码完成两种链接
gcc -no-pie -O0 -g -Wall -Wextra -Werror auth_consumer.c -L. -lauth -Wl,-rpath,'$ORIGIN' -o auth_consumer
gcc -no-pie -O0 -g -Wall -Wextra -Werror auth_consumer.c -L. -lauth_symbolic -Wl,-rpath,'$ORIGIN' -o auth_symbolic_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d53b3e0a3b8d1821.png)

两个程序都生成了相同的 COPY 记录：

```bash
# 两个变体的 COPY 记录完全一致
readelf -rW auth_consumer | grep capability_mask
readelf -rW auth_symbolic_consumer | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c9056bceb09d0e34.png)

运行两个变体：

```bash
./auth_consumer
./auth_symbolic_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0552f4b9d51af29e.png)

两个可执行文件 **只差一个链接选项**，授权判定却一个放行、一个拒绝：

-   **默认绑定（GRANTED）**：主程序写的 `0x41` 同时成了共享库的判定依据。 `check_capability` 读的是 `0x404028` （主程序副本），攻击者改主程序内存 = 直接改权限状态。 **权限决策被降级成"读主程序内存里的一块可写数据"**。
-   `-Bsymbolic` **（DENIED）**：共享库坚持读自己的 `0x1` ，判定拒绝；主程序却看到 `0x41` 。两端对同一请求的授权结论不一致，任何依赖两端状态一致性的审计逻辑都会错乱。

### 把攻击场景说完整：越界写窗口覆盖副本

前面 `auth_consumer.c` 是"调用方主动赋值"，还不是漏洞利用。主程序有个 **未检查边界的写入窗口**，攻击者通过越界写把权限位副本改掉，授权判定从 `DENIED` 翻转为 `GRANTED` 。

```c
/* vuln_consumer.c */
#include <stdio.h>
#include <stdlib.h>

extern int capability_mask;
int check_capability(int required);
int stash[16];   /* 攻击者可控的写入目标 */

int main(int argc, char **argv) {
    int idx = 0;
    printf("before: check(0x40)=%s mask=%p stash=%p delta=%ld\n",
           check_capability(0x40) ? "GRANTED" : "DENIED",
           (void *)&capability_mask, (void *)stash,
           (long)&capability_mask - (long)stash);
    if (argc > 1)
        idx = atoi(argv[1]);          /* 攻击者控制的下标，无边界检查 */
    stash[idx] = 0x41;                /* 越界写：idx=-8 时命中 capability_mask */
    printf("after:  check(0x40)=%s\n",
           check_capability(0x40) ? "GRANTED" : "DENIED");
    return 0;
}
```

构建并确认 COPY 记录：

```bash
# 构建带漏洞主程序（默认绑定，非 PIE）
gcc -no-pie -O0 -g -Wall -Wextra -Werror vuln_consumer.c -L. -lauth -Wl,-rpath,'$ORIGIN' -o vuln_consumer
readelf -rW vuln_consumer | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8a880e20164e9870.png)

链接布局把权限位副本放在 `stash` 前面： `capability_mask @ 0x404040` 、 `stash @ 0x404060` ，两者只差 32 字节（8 个 `int` ）—— `stash[-8]` 这个越界下标正好落在 `capability_mask` 上。

运行利用：

```bash
# 攻击者以下标 -8 越界写入
./vuln_consumer -8
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/498b32340e552dbf.png)

越界写入前，授权检查是 `DENIED` ； `stash[-8] = 0x41` 把 `0x41` 写进 `0x404040` 的权限位副本后，同一个 `check_capability(0x40)` 变成 `GRANTED` 。攻击者 **没有碰共享库映射、没有对抗 RELRO、不需要任何特殊权限**——只是用主程序自己的越界写漏洞，改写了主程序 `.bss` 里那块被 COPY 搬来的权限状态。 `-Bsymbolic` 也不救场，它只是把"直接提权"变成"状态分裂"，两种都不是安全状态。

## 函数的户口问题：canonical PLT entry

COPY 处理的是数据符号。 **函数符号** 被主程序当成数据引用（取地址）时，存在同源的姊妹机制：canonical PLT entry。

### 为什么函数也有"户口问题"

主程序里写 `saved_fn = get_mask;`（把共享库函数地址存进变量），在链接器眼里这和"直接读写共享库变量"是同一种行为： **可执行文件直接引用了共享库的符号**。对数据符号，链接器生成 COPY；对函数符号，链接器把该函数的 canonical（权威）地址固定在主程序 `.plt` 的一个专用入口上——所有对该函数的调用和取址都先经过这个入口。

### func_provider.c 与 func_addr_consumer.c

```c
/* func_provider.c */
int capability_mask = 0x01;

int get_mask(void) {
    return capability_mask;
}
```

```c
/* func_addr_consumer.c */
#include <stdio.h>

int get_mask(void);
int (*saved_fn)(void);   /* 把函数地址存入数据变量，构成数据引用 */

int main(void) {
    saved_fn = get_mask;
    printf("saved_fn=%p call_result=%d\n", (void *)saved_fn, saved_fn());
    return 0;
}
```

```bash
# 构建共享库与非 PIE 主程序
gcc -fPIC -O0 -g -Wall -Wextra -Werror -shared func_provider.c -Wl,-soname,libfunc.so -o libfunc.so
gcc -fno-pic -no-pie -O0 -g -Wall -Wextra -Werror func_addr_consumer.c -L. -lfunc -Wl,-rpath,'$ORIGIN' -o func_addr_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/502c796491691566.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/858ab68c7998417d.png)

```bash
# 函数取址产生的动态重定位
readelf -rW func_addr_consumer | grep get_mask
# 动态符号表中 get_mask 的 canonical 地址
readelf -sW func_addr_consumer | grep get_mask
# 主程序 .plt 中为 get_mask 准备的入口
objdump -d -M intel func_addr_consumer | sed -n '/<get_mask@plt>:/,+3p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/758559c36aeb8086.png)

三行输出拼出完整故事：

1.  `readelf -rW` ：函数取址通过 `R_X86_64_JUMP_SLOT` 完成，但符号值填的是 `0x401030` —— **主程序的地址**；
2.  `readelf -sW` ： `get_mask` 类型 `UND` （未定义），地址却也是 `0x401030` ——它被"canonical 化"到主程序 `.plt` ；
3.  反汇编： `0x401030` 正是 `.plt` 里为 `get_mask` 准备的入口，先查 GOT（ `404000` 槽），再决定跳到哪。

运行结果印证：

```bash
# 运行时保存的函数指针
./func_addr_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8558300860eda8fa.png)

主程序保存的函数指针就是 `0x401030` （主程序 `.plt` 入口），而不是共享库里的真实实现地址。 **所有参与者对** `get_mask` **的地址认知都被统一到这个入口**，再经 GOT 跳到共享库实现。

### 数据 COPY 与函数 canonical PLT 对照

|     |     |     |     |     |
| --- | --- | --- | --- | --- |    
| 符号类型 | 主程序直接引用 | 动态重定位 | canonical 位置 | 安全/行为关注点 |
| 数据对象（ `capability_mask` ） | 读写变量 | `R_X86_64_COPY` | 主程序 `.bss` 副本 | 权限状态被搬进调用方可写内存 |
| 函数（ `get_mask` ） | 取地址存入变量 | `R_X86_64_JUMP_SLOT` （canonical PLT） | 主程序 `.plt` 入口 | 函数指针相等性（ `fn == expected` ）语义被改写；多个 DSO 的函数指针都被统一解析到主程序 canonical 入口 |

数据 COPY 是"租客搬到主程序家"，canonical PLT 是"名人的对外住址统一登记在主程序中转站"。两者同一个根因： **可执行文件直接引用共享库的导出符号**。对安全审计而言，数据 COPY 带来可写副本（主角）；canonical PLT 主要影响函数指针比较和多 DSO 间的符号解析次序。排查共享库边界时，两类引用要一起看。

## 守规矩的调用方：函数接口让 COPY 无从生成

### accessor_consumer.c

对照程序不声明 `extern int capability_mask` ，只调用共享库的三个函数。

```c
#include <stdio.h>

int *provider_mask_address(void);
int provider_mask_value(void);
void provider_mask_set(int value);

int main(void) {
    printf("phase=before lib_addr=%p lib_value=0x%x\n",
           (void *)provider_mask_address(), provider_mask_value());
    provider_mask_set(0x41);
    printf("phase=after lib_addr=%p lib_value=0x%x\n",
           (void *)provider_mask_address(), provider_mask_value());
    return 0;
}
```

```bash
# 构建只调用共享库函数的 PIE 程序
gcc -fPIE -pie -O0 -g -Wall -Wextra -Werror accessor_consumer.c -L. -lcapability -Wl,-rpath,'$ORIGIN' -o accessor_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bc2425ad8ecc0685.png)

### 变量名不再进入主程序的重定位表

```bash
# 查询函数接口程序中的 capability_mask 重定位
readelf -rW accessor_consumer | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fe17cdf5b3e8def1.png)

没有任何输出—— `capability_mask` 没有进入主程序的动态重定位表，主程序不再直接引用这个变量，COPY 副本自然无从产生。

### 运行：地址始终在共享库

```bash
# 打印共享库函数返回的地址和值
./accessor_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/531bc4a7b24080b6.png)

赋值前后地址都是 `0x7f3669748008` （共享库映射内），值从 `0x1` 变 `0x41` 。主程序通过 `provider_mask_set` 修改的是 **共享库持有的那一份状态**——没有副本、没有分裂、没有降权。

## 体检发布物：两条 readelf 命令见分晓

### 检查共享库是否导出"默认可见的可变对象"

```bash
# 查询共享库导出的默认可见对象
readelf -sW libcapability.so | grep 'OBJECT  GLOBAL DEFAULT.*capability_mask'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fcaf17187de34feb.png)

`OBJECT GLOBAL DEFAULT` 三连意味着"这是个默认可见的全局变量"。它本身不是漏洞—— **风险出现在"共享库导出了它"和"调用方对它产生了 COPY"同时成立**。 `accessor_consumer` 也链接这份库，但主程序不直接引用变量，就没有 COPY。

### 给所有可执行文件做 COPY 扫描

先构建 PIE 对照程序并确认类型：

```bash
# 构建 PIE 主程序（链接选项 -fPIE -pie）
gcc -fPIE -pie -O0 -g -Wall -Wextra -Werror direct_consumer.c -L. -lcapability -Wl,-rpath,'$ORIGIN' -o direct_pie_consumer
# 验证 ELF 类型：PIE 是 DYN
readelf -h direct_pie_consumer | grep 类型
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0f130f2a15319637.png)

```bash
# 打印每个可执行文件中的 COPY 重定位
for file in direct_consumer direct_symbolic_consumer direct_pie_consumer accessor_consumer auth_consumer auth_symbolic_consumer; do
    printf 'file=%s\n' "$file"
    readelf -rW "$file" | grep R_X86_64_COPY || true
done
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7750b8ae7a251f44.png)

1.  **PIE 也救不了**： `direct_pie_consumer` 是 PIE 程序（ `Type: DYN` ），照样有 COPY——只是 Offset 和符号值都写成链接时偏移 `0x4028` ，运行时加载器再加基址。 **"上 PIE" 不等于 "免疫 COPY"**。
2.  `-Bsymbolic` **也救不了**： `direct_symbolic_consumer` 、 `auth_symbolic_consumer` 照样有 COPY。
3.  **唯一没有 COPY 的是** `accessor_consumer` ——因为它根本不把变量当作自己的数据符号使用。

> COPY relocation 是 x86-64 动态链接的实现特性，AArch64/RISC-V 等工具链通常不生成 COPY（共享库数据引用走 GOT 间接或直接报错），上述结论适用 x86-64 Linux。

所以排查口诀是： **先看共享库导出了什么可变对象，再看调用方有没有对它们产生 COPY 记录**。两个条件同时满足，就回到源码确认该对象是否承载权限、开关、策略等安全状态。

## 源头断根：让符号对调用方隐身

工程方案管不住调用方，那就在 **源头** 断掉：编译共享库时让可变对象默认不可见。

```bash
# 隐藏可见性编译共享库
gcc -fPIC -O0 -g -Wall -Wextra -Werror -fvisibility=hidden -shared provider.c -Wl,-soname,libhidden.so -o libhidden.so
# capability_mask 不再以 GLOBAL 身份出现
readelf -sW libhidden.so | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/06d3d962bc0707c2.png)

`GLOBAL` 变成了 `LOCAL` 。这个符号还在，但 **已经退出对外可见名单**——外部程序无法在链接时解析它。此时任何调用方试图直接链接 `capability_mask` 都会在链接期失败：

```bash
# 直接访问源码链接隐藏库
gcc -no-pie -O0 -g -Wall -Wextra -Werror direct_consumer.c -L. -lhidden -Wl,-rpath,'$ORIGIN' -o hidden_link_test
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/902aac7de221dc38.png)

链接器报 `undefined reference` ——调用方连编译链接这关都过不去，COPY 重定位 **根本没有机会生成**。这就是"断根"：从链接阶段就禁止外部解析。

**但粗粒度** `-fvisibility=hidden` **有代价**：它把库里的 **所有** 符号都隐藏了，包括 API 函数（上面的报错里 `provider_mask_value` 、 `provider_mask_address` 也一起 undefined）。正确做法是配合显式放行：

```c
/* 数据符号保持隐藏，API 函数显式导出 */
int capability_mask = 0x01;                              /* 不导出，外部不可见 */

__attribute__((visibility("default")))
int provider_mask_value(void) {                          /* 导出，外部可调用 */
    return capability_mask;
}
```

或者用链接脚本（version script，如 `local: *;` 配合显式 `global:` 名单）精确控制导出名单，只放行 API 函数、封死数据符号。原则一句话： **默认隐藏，只放行函数接口，可变数据一律不导出**。符号可见性因此成为共享库真正的安全边界——它决定哪些符号能被外部解析、哪些 COPY 记录会被制造出来。

## protected：比隐藏更精确的"半断根"

`-fvisibility=hidden` 连函数也一起藏了，代价太大。 `protected` 可见性是更精细的中间档： **数据防 COPY、函数仍可导出调用**。

把共享库中的 `capability_mask` 声明为 `protected` ：

```c
/* prot_provider.c */
__attribute__((visibility("protected")))
int capability_mask = 0x01;

int *provider_mask_address(void) { return &capability_mask; }
int provider_mask_value(void) { return capability_mask; }
void provider_mask_set(int value) { capability_mask = value; }
```

```bash
# 构建 protected 数据符号的共享库
gcc -fPIC -O0 -g -Wall -Wextra -Werror -shared prot_provider.c -Wl,-soname,libprot.so -o libprot.so
# 动态符号表确认可见性
readelf -sW libprot.so | grep capability_mask
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fb6708932d49e080.png)

主程序仍写 `extern int capability_mask` 直接引用，链接直接失败：

```bash
gcc -no-pie -O0 -g -Wall -Wextra -Werror direct_consumer.c -L. -lprot -Wl,-rpath,'$ORIGIN' -o direct_prot_consumer
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a8d23771133097a1.png)

GNU ld 拒绝为 protected 数据符号生成 COPY relocation（"non-copyable protected symbol"）。因为 protected 语义要求"库内访问与外部访问必须一致"，COPY 会制造主程序副本、破坏这一致性——链接器宁可报错也不迁就。

共享库内部对 `capability_mask` 的访问则全部 relax 成直接取址，不再经 GOT：

```bash
# protected 库内 provider_mask_value：lea 直拨 0x4008
objdump -d -M intel libprot.so | sed -n '/<provider_mask_value>:/,+7p'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/23785092ec3cacc2.png)

`provider_mask_set` 同样是 `lea` 直拨 `0x4008` ，与 `-Bsymbolic` 库的表现一致——这正印证了前面的 GOTPCRELX relax： **不可抢占的符号，库内访问都被链接器 relax 成直拨**。

## 排查清单与总结

### 排查清单

遇到"共享库导出状态、主程序直接引用"的代码，按这个顺序查：

1.  **查导出**： `readelf -sW 库.so | grep 'OBJECT GLOBAL DEFAULT'` ——找出默认可见的可变对象；
2.  **查 COPY**：对每个可执行文件 `readelf -rW 程序 | grep R_X86_64_COPY` ——看哪些可变对象被复制进主程序；
3.  **判断敏感度**：被 COPY 的对象里，有没有权限位、长度、开关、策略标志这类安全决策状态；
4.  **确认读取路径**： `objdump -d -M intel 库.so` 看库内函数是"查 GOT"还是"直接 lea"——默认绑定下库函数可能跟着主程序副本走；
5.  **修复**：调用方改用函数接口（工程层），提供方 `-fvisibility=hidden` + 显式放行 API（架构层），双管齐下。

### 核心结论

**真正危险的不是一条** `R_X86_64_COPY` **记录，而是安全决策使用的状态在装载过程中悄悄换了持有者。**

-   共享库负责定义 `capability_mask` ，主程序却可能在自己的 `.bss` 获得可写副本；
-   默认绑定让库函数一起读取这份副本——权限状态的控制权落到调用方手里，权限判定降级为"读主程序内存里的一块可写数据"；
-   `-Bsymbolic` 只是让库内函数改读自己的那份，一份状态拆成两份，授权判定可以在 `GRANTED` 和 `DENIED` 之间翻转；
-   PIE 不免疫 COPY，RELRO 保护不了 `.bss` 副本；
-   能收进函数接口的状态，就不该暴露成让调用方直接寻址的数据符号；能在源头隐藏的符号，就不该出现在对外可见名单里。

链接方式改变的不只是性能，还有安全决策状态的归属。

## 资料来源

System V ABI：Relocation  
[https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.reloc.html](https://refspecs.linuxfoundation.org/elf/gabi4+/ch4.reloc.html)

Oracle Linker and Libraries Guide：Copy Relocations  
[https://docs.oracle.com/cd/E19957-01/806-0641/chapter4-12/index.html](https://docs.oracle.com/cd/E19957-01/806-0641/chapter4-12/index.html)

glibc Manual：The `.got` and `.plt` sections / Symbol resolution  
[https://www.gnu.org/software/libc/manual/](https://www.gnu.org/software/libc/manual/)
