---
title: 【微信】对一款 Linux 木马开源提示词的测评
source: https://mp.weixin.qq.com/s/9TD4XZ9MyfjT_n8qtx1pDQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-28T18:29:53+08:00
trace_id: 90ed456a-fdfe-4783-88c7-1129c29b08f3
content_hash: 1878afe0418b027c8e3ecafe7b7df9935d0fadb0d0b8a0a9fca0af12772760cb
status: synced
tags:
  - 微信
  - Linux安全
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Linux 版木马提示词约 15 分钟即可生成约 1700 行可编译 LKM，功能完整，本质是 Diamorphine 的增强变种，但新增能力实际价值有限、暴露面明显。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3e975244-d011-81b2-931e-fe3b7f8a3992
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Linux 版木马提示词约 15 分钟即可生成约 1700 行可编译 LKM，功能完整，本质是 Diamorphine 的增强变种，但新增能力实际价值有限、暴露面明显。
> 
> - **生成效率：** 比 Windows 版快得多，首次生成约 1700 行，含进程/文件/网络/模块自隐藏、提权、持久化与关机回写。
> - **控制通道：** 通过 hook kill syscall 单向通信，`kill -34/-35/-36/-37` 分别切换进程可见性、提权、模块可见性、端口可见性（端口号经 pid 传入）。
> - **实现要点：** getdents/getdents64 缓冲压缩隐藏 `crimson_` 前缀；复用废弃位 PF_INVISIBLE 标记进程再过滤 /proc；ftrace hook tcp/udp 的 seq_show；prepare_creds+commit_creds 提权；配置集中在 config.h。
> - **关键缺陷：** ss 走 netlink sock_diag 不经过 seq_show，比对即可穿透端口隐藏；/etc 下三处明文持久化（脚本、systemd unit、rc.local）是最大脚印；内核 6.11 起 sys_call_table 改写静默失效，三条"成功"信号全是假象。
> - **检测方法：** 直接 `kill -36 0` 后查看 lsmod 是否冒出模块；检查内核已挂载的 ftrace 回调；对比 ss 与 netstat、ls 与 stat、lsmod 与 /sys/module 等多组数据源。

**huasec** *2026年9月28日 18:05*

一、引言

上一篇 [对一款Windows木马开源提示词的测评](https://mp.weixin.qq.com/s?__biz=MzIyOTY1NDE5Mg==&mid=2247485577&idx=1&sn=be26c2eb3f2fccfd20a9e030d9bf2181&scene=21#wechat_redirect) 是Windows版提示词的分析，这一篇则是对Linux版提示词的测评和分析。

上一篇文章中对Windows版本的测试，从环境搭建到完成第一个Rootkit版本，花了3个多小时，而Linux版本则快得多，在给出了提示词文档后，只花了大概不到15分钟时间，就完成了整个项目的编写，当然代码量也小了很多，我这边第一次生成，代码量大概1700行。功能也齐全，可以进行进程、文件、网络以及内核模块自身的隐藏，同时也有持久化和关机回写功能。从能力上来说，和Windows版几乎如出一辙，只是因为所处操作系统不同，在实现原理上大相径庭。并且设置了兼容层和配置，可以轻易的通过修改.h源码实现后续兼容性问题和rootkit配置问题。

* * *

## 二、源码分析

## 2.1 样本功能

Linux 版的提示词文件为 crimson-kmod-agent-prompt.md。文档中并未直接指定生成的项目名称,因此命名随机性很强——本次测试中项目名为crimson。

其核心能力与实现原理概览:

|     |     |
| --- | --- |
| 能力  | 实现方式 |
| 文件名前缀隐藏 | getdents/getdents64 syscall hook + 缓冲区压缩 |
| 进程隐藏 | task->flags 置 PF_INVISIBLE + /proc 过滤 |
| 模块自隐藏 | 模块链表摘除 + 名称过滤 |
| TCP/UDP 端口隐藏 | ftrace hook {tcp,udp}{4,6}\_seq_show |
| 提权  | prepare_creds() + commit_creds() |
| 持久化 | .ko 写回 + 启动脚本 + systemd unit |

对 LKM(可加载内核模块)的控制指令:

```apache
kill -34 <pid>   切换进程在 /proc 中的可见性
kill -35 0       把调用进程提升为 root
kill -36 0       切换模块在 lsmod 中的可见性
kill -37 <port>  切换端口在 /proc/net 中的可见性（端口号经 pid 参数传入）
```

对于红队研发人员与蓝队资深取证人员而言,这套设计"眼熟"得很。分析完源码后几乎可以笃定:该项目脱胎于著名 Rootkit 工具Diamorphine(github.com/m0nad/Diamorphine)。

不过,Diamorphine 本身并不具备网络隐藏、持久化及关机回写能力。因此本样本可视为 Diamorphine 的一个增强变种。至于这种增强是否真有意义,值得深入探讨——文末将展开分析。

## 2.2 配置层

所有配置均集中于 config.h。这在便于统一配置的同时,也便于对固定取证线索的修改。从反取证角度看,是个不错的策略。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fe754246ddfaf31d.jpg)

## 2.3 Hook 方式

整个项目采用两种 Hook 方式:syscall hook与ftrace hook。该 Rootkit 最核心的隐藏能力与通信能力,均建立在这两类 Hook 之上。

## 2.4 通信的实现

样本通过 syscall hook 内核的 kill 函数,拦截并过滤应用层 kill 命令的消息,从而构建出一条单向的内核通信通道。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/616b425b06148d69.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/182b8505ec79349f.jpg)

真正的控制函数为 crimson_kill_ctl,通过传入的 pid 与 signal 进行分支判断。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/457164f2714d0118.jpg)

## 2.5 进程隐藏

进程隐藏分两步:先标记,后过滤。

第一步，标记:发生在 kill 信号的拦截处,把目标进程的 task->flags 翻转一个 PF_INVISIBLE 位。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e040435163a7d4c2.jpg)

PF_INVISIBLE(0x10000000)取自老内核 sched.h 中已废弃的位定义,现代内核不再使用,复用不会冲突。反过来说——"进程 flags 里出现内核已不使用的位"本身就是一条明确的检测线索。

第二步，过滤:复用文件隐藏的 getdents 通道,只是对 /proc 根目录多加一层判定。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bf4e5c300baa503d.jpg)

因此,进程隐藏本质是文件隐藏的特例——藏的是 /proc 下以 pid 命名的目录项。

## 2.6 网络隐藏

网络隐藏是 Diamorphine 所不具备的能力,走 ftrace 通道,Hook 的是 /proc/net/{tcp,tcp6,udp,udp6} 的渲染函数:

```cs
static struct ftrace_hook net_hooks[] = {
    HOOK("tcp4_seq_show", hacked_tcp4_seq_show, &orig_tcp4_seq_show),
    HOOK("tcp6_seq_show", hacked_tcp6_seq_show, &orig_tcp6_seq_show),
    HOOK("udp4_seq_show", hacked_udp4_seq_show, &orig_udp4_seq_show),
    HOOK("udp6_seq_show", hacked_udp6_seq_show, &orig_udp6_seq_show),
};
```

kill -37 <port>把端口号存进一张16 项的隐藏表;Hook 函数对每个 socket 比较源端口与目的端口,一旦命中就跳过该行不渲染。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ae26846776f579ec.jpg)

关键缺口:对 /proc/net/tcp 这一个视图,隐藏是有效的。但 ss 走的是 netlink sock_diag,完全不经过 seq_show,因此该方式防不住ss的检测。

## 2.7 文件/目录隐藏

文件隐藏是全项目实现最细致的部分。getdents 的 Hook 拿到原始返回缓冲后,把名字以 crimson\_ 魔术前缀开头的记录从缓冲区里"压"掉。压缩分首条与非首条两种情况处理。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/632e908843d6c651.jpg)

值得一提的是,它妥善处理了"整批被隐藏"的边界情况。getdents 分批返回,若某批记录全部命中过滤,直接返回 0 会被用户态当成 EOF——后果不是"藏了几个文件",而是目录被截断。实现上通过置 retry 标志重取下一批来规避:

```ruby
if (ret == 0) {
    kfree(kdirent);
    *retry = 1;
    return 0;
}
```

## 2.8 关机回写与持久化

关机回写与持久化是相对 Diamorphine 的另一处增强。触发点共有三个,互为关机回写和持久化是相对Diamorphine的另一处增强，触发点有三个，互为冗余：reboot系统调用hook（main.c:633）、优先级INT_MAX的重启通知链、以及rmmod卸载。三个入口都汇到do_persistence：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/431c2dcc995c2cd1.jpg)

write_self_ko 把模块加载时读进内存的.ko 原样写回 ko_path。攻击者加载完即可删除磁盘上的样本,模块在关机时自行把文件拼回来,达成"删文件不死"的效果。

setup_autostart 则铺设三层自启:/etc/crimson_load.sh、systemd unit 加启用链接、rc.local 追加。

比较有意思的是启用链接的做法:

```apache
call_usermodehelper(mkdir_argv[0], mkdir_argv, envp, UMH_WAIT_PROC);
call_usermodehelper(ln_argv[0], ln_argv, envp, UMH_WAIT_PROC);
```

在.wants/ 目录下放真实文件不算启用,必须是符号链接;它也没用 systemctl enable——那要求运行中的 manager 认识这个 unit,而从内核态直接 mkdir 加 ln -sf 建链接更稳。

实测:靶机重启7.5 秒后模块自动加载,自启与自隐藏无缝衔接。而 systemd 这条通道在提示词里只字未提(rc.local 出现 8 次、systemd 出现 0 次),是 AI 实测踩坑后自行补上的。

但这同样是全项目最大的暴露面:隐藏做到了getdents一级, /etc下三个文件却原样明摆在系统管理面上。持久化始终是这类木马脚印最大的一环。

* * *

## 三、如何检测

从整个实现这个木马把“枚举”堵得很严，除非直接知道隐藏了哪些文件、文件夹，或者知道模块名称，否则常规的枚举经检测不太容易发现端倪。

从之前的源码分析中可以发现，通过查看/etc目录下的可疑shell脚本以及查看rc.local是可以发现恶意持久化的，而且，通过ss与netstat的对比，也可以发现隐藏的网络连接。除此以外，通过测试，还发现有其他方式进行检测。在未知的情况下，可以尝试输入kill -36 0，查看有没有新的内核模块出现。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5654c284b5863e7.jpg)

由于项目本身利用 ftrace hook 实现网络隐藏,完全可以通过查看当前内核已挂载的 ftrace 回调钩子来定位:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/99e0ebddcdeb4eea.jpg)

通过以上方式,可以快捷、方便地定位内核问题。

* * *

## 四、提示词中的坑

和上一篇一样，提示词的坑也不少。比如，syscall表改写静默失效的问题。内核6.11起x86分派改为x64_sys_call()内部switch直调\__x64_sys\_\*，不再经过sys_call_table。表项确实写进去了（kcore读回是新值）、insmod成功、dmesg干净——三条“成功”信号全中，但其实功能是不生效的。

* * *

## 五、总结:增强是否有意义

回到开头留下的问题：相对Diamorphine的这些增强，是否有意义？我的看法是有限的。网络隐藏只挂seq_show一条通路，ss一比对就穿帮；持久化在/etc下留三处明文，是全项目暴露面积最大的一环。真正有工程价值的，反而是双通道syscall hook（表改写与ftrace wrapper并存，覆盖新旧两代内核）和“删盘不死”的关机回写。

对蓝队，这个样本把“单一数据源不可信”演练得很完整：ls对stat、ps对kill -0、/proc/net/tcp对ss、lsmod对/sys/module，每一组对照都是一条独立的发现路径。

而对"提示词生成木马"这件事本身,两篇测评的结论是一致的:

AI 把"写出能编译的代码"的成本压到了分钟级,但它写的世界,是提示词作者见过的世界——内核换了分派机制、CPU 换了安全特性、发行版换了自启方式,它统统不知道。

门槛降低的是"能跑",不是"能用";而蓝队要防的,从来都是"能用"。

本文所有测试均在隔离的虚拟机靶场中完成，仅用于授权环境下的安全研究与防御检测研究。

威胁分析 · 目录

作者提示: 个人观点，仅供参考
