---
title: 【微信】FLOSS 2.0：新增紧字符串解混淆，平均提速 47%
source: https://mp.weixin.qq.com/s/13zQeHtEwg8aplqDed3xWg
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:09:56+08:00
trace_id: 76b7580c-0e28-4506-9747-eb97e51c9b7d
content_hash: 6e745c5689a66a2b75537c911272382775795b8cf88f9cacdc50b5bb2e26cce9
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 41175244-d011-8148-b2fd-c65b065db236
ioc:
  cves: []
  cwes: []
  hashes:
    - 2065157b834e1116abdd5d67167c77c6348361e04a8085aa382909500f1bbe69
    - 9a16a348d3f4e7da3e8746667624115f
  domains: []
  tools: []
  techniques: []
---

**赛博生存指南** *2026年11月6日 17:58*

> 原文：https://cloud.google.com/blog/topics/threat-intelligence/floss-version-2/  
> 作者：William Ballenthin、Moritz Raabe、Blaine Stancill（Mandiant）  
> 发布时间：2022-06-21  
> 翻译模型：Kimi-K3

编者按：FLOSS（FLARE Obfuscated String Solver）是 Mandiant FLARE 团队开源的恶意软件混淆字符串提取工具，至今仍是静态分析的标配（REMnux 内置）。这篇 2022 年的发布博文介绍了 2.0 版的核心更新：第四类字符串 tight strings 的解混淆、平均 47% 的提速、边分析边输出的实时结果，以及大幅精简的命令行。2.0 定下的字符串分类框架与 CLI 形态沿用至今，旧文新译，作为工具档案收录。

FLARE Obfuscated String Solver（FLOSS）帮助分析师从恶意软件样本中提取隐藏字符串，迄今已经很多年了。过去几个月，我们为它添加了新功能，也提升了性能。本文将分享这次令人兴奋的新功能与改进：一种新的字符串解混淆技术、更简化的用法，以及快得多的结果输出。我们还更新了 FLOSS 的 logo：

![FLOSS 新 logo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6cd12ab4a7997b8e.png)

## 回顾：FLOSS 从恶意软件中提取字符串

FLOSS 分析编译后的程序，识别其中可能负责解码数据的函数，并自动解出隐藏的字符串。最初，FLOSS 提取三大类字符串：原样包含在文件里的静态字符串（static strings）、由专门函数解码的编码字符串（encoded strings），以及逐段拼接出来的栈字符串（stack strings）。想了解更多背景或复习一下 FLOSS，请回顾我们的原始博文https://cloud.google.com/blog/topics/threat-intelligence/automatically-extracting-obfuscated-strings。

而这次发布，我们教会了 FLOSS 解码一整类全新的混淆字符串……

## 新的字符串解混淆：紧字符串（tight strings）

本次更新后，FLOSS 能处理一种额外的字符串混淆技术，我们称之为「紧字符串」（tight strings）。紧字符串是栈字符串与编码字符串的结合体：像栈字符串一样，它由一个个字节在运行时构造到栈上；又像编码字符串一样，这些字节在使用前要先经过解码。解码通常发生在一个「紧循环」（tight loop）里——一段短小的代码序列重复执行许多次，紧字符串因此得名。感谢 Blaine Stancill 想出这个贴切的名字，并实现了核心算法。

我们之所以要支持紧字符串，是因为它在 KEGTAP、BEERBOT、ANCHOR 等恶意软件家族https://cloud.google.com/blog/topics/threat-intelligence/kegtap-and-singlemalt-with-a-ransomware-chaser中非常普遍——仅 2021 年，我们就遇到了几十次。我们甚至怀疑，正是 FLOSS 在解混淆字符串上的成功，促使恶意软件作者发展出了紧字符串。还要说明的是，紧字符串也可能是有意写进二进制的——通过内联的字符串解码例程，比如 ADVobfuscatorhttps://github.com/andrivet/ADVobfuscator 项目提供的那类。

图 1 展示了一个恶意软件样本中的紧字符串实例，该样本的 MD5 为 9a16a348d3f4e7da3e8746667624115f，SHA256 为 2065157b834e1116abdd5d67167c77c6348361e04a8085aa382909500f1bbe69。

在上方的基本块中，恶意软件先把混淆后的字符串字节（0x6D、0x28、0x46……）依次存入连续的栈偏移（var_630、var_62F、var_62E……），然后反复执行第二个基本块来解码数据。

![图 1 反汇编](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1f4359f9a0303933.png)

图 1：紧字符串解码序列的反汇编示例（博客本身就很糊的图）

图 2 是这两个基本块的反编译结果。看牙医和静态逆向这段代码哪个更「享受」，恐怕难有定论——好在 FLOSS 现在能让你两个都不用受了（FLOSS 本意「牙线」，作者在玩双关——译者注）。与已有算法一样，我们对识别出的程序片段做模拟执行：FLOSS 在虚拟栈上构造出混淆数据，通过模拟执行这个紧循环完成解码，循环结束后从虚拟栈中提取字符串。

![图 2 反编译](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/89aa07b90b599f19.jpg)

图 2：紧字符串解码序列的反编译结果

这个例子里，FLOSS 恢复出了字符串 `InternetReadFile` ，恶意软件用它动态解析对应的 Windows API 函数。图 3 是 FLOSS 详细输出中恢复该字符串的记录。

![图 3 详细输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d35e6203059cab9.png)

图 3：FLOSS 紧字符串结果节选

## 其他改进

除了新增的字符串解混淆算法，我们还让已有的识别与模拟算法更可靠、更高效。FLOSS 结果里误报的解混淆字符串更少了——跑新版 FLOSS 时，你被垃圾输出分心的次数会更少。为此，我们加入了基于 FLIRT 签名的库函数识别，并改进了字符串的过滤与清洗方法。

模拟执行本身更快了，对不解码字符串的函数还会直接跳过模拟，两者叠加显著提升了 FLOSS 的整体运行速度。测试中我们观察到平均 47% 的提速！这意味着你能更快处理恶意软件，在大规模处理流水线里尤其明显。早期版本的 FLOSS 要等全部分析结束才给出结果。如图 4 所示，更新后的工具现在一边解出字符串一边输出，同时显示分析进度。我们发现这让工具的响应感好得多：能立刻看出它有没有在正常工作，人也更有耐心了（也可能只是看进度条走完的执念）。

最后，我们加入了更多 API 模拟 hook，并更新了模拟引擎和底层分析框架。所有改进合在一起，FLOSS 现在能模拟的恶意软件样本比以往更多！

## 更好用的命令行与结果输出

对 FLOSS 用户来说，新版大幅简化了命令行参数。提取全部字符串，像以前一样直接跑即可：

```
$ floss malware.exe
```

当你明确不关心某一类字符串时——比如想忽略静态字符串、只关注混淆字符串——现在可以用 `--no` 参数，例如不提取静态字符串：

```
$ floss malware.exe --no static
```

想只提取指定的某几类字符串，用 `--only` 选项：

```
$ floss malware.exe --only tight decoded
```

图 5 是新版 FLOSS 结果输出的示例。此前的 FLOSS 版本没能从这个文件中解出任何字符串。

```sql
FLARE FLOSS RESULTS (version 2.0.0)

+------------------------+------------------------------------------------+

| file path              | 2065157b834e1116abdd5d67167c77c6348361e04a8... |

| extracted strings      |                                                |

|  static strings        | Disabled                                       |

|  stack strings         | Disabled                                       |

|  tight strings         | 55                                             |

|  decoded strings       | 53                                             |

+------------------------+------------------------------------------------+

----------------------------

| FLOSS TIGHT STRINGS (55) |

----------------------------

%d%02d%02d
bcrypt.dll
BCryptOpenAlgorithmProvider
BCryptImportKeyPair
BCryptVerifySignature
BCryptCloseAlgorithmProvider
ReadFile
kernel32.dll
GetTempPathW
kernel32.dll
~pkg%d%S
Date
HttpQueryInfoA
wininet.dll
Set-Cookie
.bazar
%i.%i.%i.%i
Host: %s
update: %s
XTag
InternetQueryDataAvailable
wininet.dll
InternetReadFile
CoInitialize
ole32.dll
CoInitializeSecurity
GetTempPathW
kernel32.dll
GetTempFileNameW
http://127.0.0.1/pics.html
[…]

------------------------------

| FLOSS DECODED STRINGS (53) |

------------------------------
CoInitialize
ole32.dll
CoInitializeSecurity
CoCreateInstance
CoTaskMemFree
HEAD
HttpQueryInfoA
Date
wininet.dll
bcrypt.dll
BCryptOpenAlgorithmProvider
BCryptImportKeyPair
BCryptVerifySignature
BCryptCloseAlgorithmProvider
kernel32.dll
ReadFile
%d%02d%02d
CoInitialize
ole32.dll
Font Service
CoInitializeSecurity
CoCreateInstance

[…]
```

图 4：FLOSS 最终汇总结果输出

全部可用选项请运行 `floss -h` 查看帮助。

## FLOSS API 与集成

我们把 FLOSS 从 Python 2 迁移到了 Python 3（终于！）。这让 FLOSS 跟上了大多数现代 Python 项目，也让进一步提升性能成为可能。

如果你在更大的项目里把 FLOSS 当模块用，请注意许多 API 已经变化，你的工具多半需要相应更新。为了方便与其他工具集成、互操作，所有 FLOSS 结果都可以通过 `-j` 参数导出为 JSON 文档。这样你就能从任何编程语言把 FLOSS 当子进程调用，并以编程方式处理结果。

## 一起来用 FLOSS，以及致谢

感谢社区一直以来的支持、bug 报告与功能建议。这些年来，有几十人为 FLOSS 做过贡献。希望这次更新对你有用，也期待在 issue 区https://github.com/mandiant/flare-floss/issues听到你的反馈。全部发布版本见 releases 页面https://github.com/mandiant/flare-floss/releases，源代码在 GitHub 仓库https://github.com/mandiant/flare-floss。

## 译者解读

**「紧字符串」是混淆与解混淆军备竞赛的一环。** 作者的猜想值得玩味：FLOSS 把栈字符串和编码字符串解得太好，恶意软件作者便把两者拼起来——字节照常在栈上逐段构造，但用之前再过一个紧循环解码，手工静态分析的成本陡增（图 2 那段反编译就是劝退现场），而 FLOSS 的应对是把构造和解码一起模拟执行，把分析成本又压回零。还要注意 ADVobfuscator 这条线索：这类混淆并非恶意软件专属，正常商业软件也会用它保护字符串，所以解出紧字符串本身不是恶意指标，只是分析入口。

**2.0 奠定了现行 FLOSS 的形态。** static / stack / tight / decoded 四类字符串的划分、 `--only` / `--no` 的参数风格、 `-j` 导出 JSON 的集成方式，都是这一版定下来的，此后版本在这个框架上继续演进。仓库至今仍在活跃维护，本文译介时最新版为 v3.2.0（2026-10-16 发布，经 GitHub API 核实）。47% 的平均提速与边解码边输出，对单样本分析是体验改进，对流水线批量处理则是吞吐量改进。

**与本仓库已有内容的关系。** 《REMnux 静态属性分析工具盘点》（2026-08-11）已把 FLOSS 列在去混淆 / 字符串还原类工具里，本篇相当于它的官方 release notes，可对照着看；同属 Mandiant FLARE 团队的《TTD 调试手册》导读（2026-11-02）讲的是动态分析侧的录制回放，与 FLOSS 的静态字符串提取一静一动。

## 参考资源

-   FLOSS 2.0 发布博文（本文原文）：https://cloud.google.com/blog/topics/threat-intelligence/floss-version-2/
    
-   FLOSS 原始博文（2016）：https://cloud.google.com/blog/topics/threat-intelligence/automatically-extracting-obfuscated-strings
    
-   FLOSS 源码与全部版本：https://github.com/mandiant/flare-floss
    
-   KEGTAP / BEERBOT / ANCHOR 家族分析：https://cloud.google.com/blog/topics/threat-intelligence/kegtap-and-singlemalt-with-a-ransomware-chaser
    
-   ADVobfuscator（内联字符串混淆库）：https://github.com/andrivet/ADVobfuscator
    

工具技巧 · 目录
