---
title: KCTF 2025 参赛 Writeup 分析汇总
source: https://bin4re.github.io/blog/2025/09/09/kctf_2025_contest_problem_writeup_summary/
source_host: bin4re.github.io
clip_date: 2026-09-23T10:52:26+08:00
trace_id: 0247f11d-48e9-42df-b7ab-06a3cc853b68
content_hash: 927e1ad30829940710a061c4d203f93694e9d962d8c21622dd922d653026344b
status: synced
tags:
  - CTF
  - AI辅助逆向
series: null
feed_source: bin4re·Android/Windows RE
ai_summary: KCTF 2025 中借助 LLM 解出十题中的六题并拿下一血，显示 LLM 已显著降低二进制 CTF 逆向门槛。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e475244-d011-8173-923a-c122c24ca8f0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> KCTF 2025 中借助 LLM 解出十题中的六题并拿下一血，显示 LLM 已显著降低二进制 CTF 逆向门槛。
> 
> - **LLM 直解范围：** 第二、七、九题算法较直接，LLM 可短时间直解；第八题 VM Pwn 也借 LLM 实现任意读写。
> - **第二题关键：** 三维迷宫 9×10×3，路径由 0-9a-z 每两字符表示坐标，起点值 11278、终点 8114，路径点须为两个不同素数积，曼哈顿移动；补充迷宫大小后 Gemini 2.5 Pro 给出正确 Python。
> - **第七/九题技巧：** 第七题将 stat 栈变量类型改为 int 后反编译清爽；第九题 .NET+Python 混淆经 Enigma Virtual Box 打包，用 pyinstxtractor、evbunpack 解包，最后 dnspy 附加进程从内存保存模块取得 .NET 逻辑。
> - **第四题：** 修改 Base64+AES，TLS 回调初始化常量与反调试，核心算法藏 VEH 并用 int3 触发；比较为 `Encrypt(Encrypt(Encrypt(UserName))) == Decrypt(Serial)`，可调试改次数或对比标准 AES 定位密钥拓展修改。
> - **第六题：** 易语言混淆调用 `sub_123540D0` 可令 IDA 反编译引擎内部错误失效；交叉引用定位混淆和关键函数，下断点回溯；有人用 Binary Ninja 自定义易语言调用约定，ebx 传数组指针、ecx 返回结果。

其实我已经四五年没打过 CTF了，今年参与看雪 CTF 2025 就是想亲自感受下 LLM 对 CTF 比赛二进制方向解题的影响，在 LLM 的辅助下十道题目解答了六道，还拿下一道题目的一血。LLM 进步如此之快，最大的感受是现在靠算法给 CTF 逆向题目上强度与难度已经不容易了，这是出题人亟需面对和思考的问题。

比赛信息和相关题目文件可在 [https://ctf.kanxue.com/game-team_list-21-41.htm](https://ctf.kanxue.com/game-team_list-21-41.htm) 中找到。

## LLM 直解

第二题、第七题和第九题的算法都比较直接，没有什么混淆，通过 LLM 是可以在短时间内完成解答的，以及第八题是一道 VM Pwn，尽管我不熟 Pwn，但是还是借助 LLM 做到了实现任意读写。

## 第一题 签到

rust 语言写的程序，函数反编译内容和字符串结构都看着乱乱的，直接交叉引用成功输出字符串，定位到 ascii 码值比较函数 `sub_140001560` ，丢给 LLM 让整理出来比较的 flag 字符串即可。

## 第二题 初窥门径

先试着直接向三个 LLM(Gemini 2.5 Pro、Deepseek-V3、GPT-5) 提问反编译的功能函数，基本都能分析出实现的是一个三维迷宫，但不太能每次都准确判断出迷宫大小。后尝试，在单次提问中除提供关键反编译代码和数据外，再指出三维迷宫大小，Gemini 2.5 Pro 就直接给出了正确求解 flag 的 python 代码。使用 LLM 进行问题解决时，添加一些已进行的确定性分析内容，会有更好的回答效果。

题目为三位迷宫，规则为:

```
1.  迷宫大小: 9 (X) x 10 (Y) x 3 (Z)。
2.  路径表示: 由 `0-9a-z` 构成的字符串，每两个字符代表一个坐标点 (X, Y, Z)。
3.  起点: 对应的值为 `11278`。
4.  终点: 对应的值为 `8114`。
5.  路径点: 对应的值必须能分解为两个不同的素数之积。
6.  移动: 每次只能在 X, Y, Z 轴上移动一格（曼哈顿距离为1）。
```

详细 LLM 问答见： [\[原创\]KCTF 2025 第二题 WriteUp - LLM 一击直解](https://bbs.kanxue.com/thread-288101.htm)

出题人思路： [\[原创\]2025 KCTF提交防守题目\[设计思路+源码\]](https://bbs.kanxue.com/thread-287585.htm)

## 第七题 危局初现

又是直接的算法题，又是 LLM 一击直解。

题目给了执行文件、QNX系统虚拟机，Vmware 打开后进入 `/root` 目录，可执行题目文件 `guess` 。

由于用了 `stat` 函数，IDA 将 `[esp+204h] [ebp-90h]` 处的栈变量识别成了 `stat` 结构体，所以反编译满屏看着很混乱，如果直接将这样的反编译代码给 LLM，效果并不太好。

按 `Y` 修改类型为 `int` 反编译输出便可清爽起来，提交给 LLM 也能一击直解了。

详细 LLM 问答见： [\[原创\]KCTF 2025 第七题 WriteUp - LLM 一击直解](https://bbs.kanxue.com/thread-288272.htm)

出题人思路： [KCTF2025题目提交- 第七题 危局初现 设计思路](https://bbs.kanxue.com/thread-287792.htm)

## 第九题 智斗邪首

一道增加了分析障碍的算法题，LLM 一眼识破障眼法，告诉最终的核心内容，拿到算法代码后 LLM 又直接给出了解题代码，在 LLM 帮助下我仅一小时十多分便完成解题拿下一血。

向 LLM 提交程序的字符串和导入表内容，LLM 轻松地判断出来程序是.NET 和 Python 混淆编程并经过打包的， `Enigma Protector` 壳的话，如果看防守方出题规则可以知道是不让用第三方保护加壳的，简单搜下 `Enigma Virtual Box` 看到出现 `解包` 字样，判断程序只是进行了打包操作。

搜索到 Python 解包工具 [pyinstxtractor](https://github.com/extremecoders-re/pyinstxtractor) ，解包出相关文件夹和文件，注意到关键文件 `20250805Calc-pub.pyc` ，可反编译。搜素到 `Enigma Virtual Box` 解包工具 [evbunpack](https://github.com/mos9527/evbunpack) ，解包出 `dnlib.dll` 和 `htg_Crackme.exe` ，分析发现后者不能识别为.NET 程序。稍加思索，决定换种方法试下，使用 dnspy 选择附加到进程，点击 `调试->窗口->模块` 找到 `htg_Crackme.exe` ，选中右击 `从内存中打开模块` ，及 `保存模块` ，成功获取到可以直接分析的.NET 代码逻辑。

详细 LLM 问答见： [\[原创\]KCTF 2025 第九题 WriteUp - LLM 一血直解](https://bbs.kanxue.com/thread-288339.htm)

出题人思路： [\[原创\]Reverse-伪斐波那契数列 （第九题 智斗邪首设计思路）](https://bbs.kanxue.com/thread-287721.htm)

## 分析解答

## 第四题 血色试炼

题目的核心算法是通过修改的 Base64 和 AES 组合成的加密与解密算法，来验证用户输入的 UserName 和 Serial 是否匹配。在 main 函数执行前，利用 TLS 回调来完成加解密常量的初始化和反调试检查，在 main 函数中未直接调用核心算法函数，而是将其藏在向量化异常处理器（VEH）中，通过 int 3 指令主动触发异常来执行。

会对 UserName 进行三次 Encrypt 操作（sub_14000618C），对 Serial 进行一次 Decrypt 操作（sub_140005D6C），最终在 main 函数进行 `Encrypt(Encrypt(Encrypt(UserName))) == Decrypt(Serial)` 的比较。

理清整体过程后求解过程有两种：

```
1. 技巧解法，调试修改 Encrypt 操作的次数，由三次变成四次，得到的结果直接就是 Serial 了。

2. 调试分析，修改过的 Base64 和 AES 算法，Base64 比较容易调试明白怎么改的，AES 环节步骤多，需要一步步来，可以对比着标准实现从密钥拓展部分调试，看哪一环节结果不一致，定位到再具体调试那个环节函数。 
```

比赛时候我是通过稍微绕些的技巧解法求解的： [\[原创\]KCTF 2025 第四题 WriteUp](https://bbs.kanxue.com/thread-288175.htm) ，赛后看了下 [别的 Writeup](https://bbs.kanxue.com/thread-288176.htm#msg_header_h2_9) 说 AES 修改的地方密钥拓展，于是回顾温习了下 AES 加密的细节基础知识，又重新分析调试了下，发现对加密过程很熟悉的话，还是比较容易调试对比定位到改了哪里的，所以说基本功要扎实，平时不能偷懒。

出题人思路及源码文件： [\[原创\]2025 KCTF 题目提交\[ 第四题 血色试炼设计思路\]](https://bbs.kanxue.com/thread-286500.htm)

## 第六题 秘辛揭露

题目是使用易语言写的，加了混淆，特征是会调用 `sub_123540D0` 函数，如果尝试反编译这个函数调用的上下文函数，IDA 会报一个内部错误，继而反编译引擎失效，不能再反编译新的函数。

混淆直接让 IDA 反编译引擎宕机还是比较能唬住人的，但是仔细看下几处混淆附近的汇编指令，会发现混淆模板比较单一，而且特征很明显，会调用 `sub_123540D0` ，对其进行交叉引用分析，便可定位所有影响分析的混淆处，同时被混淆的地方也几乎就是关键函数，下断点回溯分析也是能相当快定位到核心算法代码，随后借助 LLM 分析算法加上调试，解题还是比较轻松的。

我的详细分析过程见： [\[原创\]KCTF 2025 第六题 WriteUp](https://bbs.kanxue.com/thread-288245.htm) 。赛后看了下出题人的思路： [\[原创\]KCTF-第六题 秘辛揭露 设计思路](https://bbs.kanxue.com/thread-287961.htm) ，发现心思还是比较多的，只不过做题的人不管那么多三七二一，源码看着乱就调试汇编看内存，解答出来题目拿到分是最重要的，很多细节就略过了。

不过还是有高手注意到里面的细节的，比如 HHHso 就在 [他的 Writeup](https://bbs.kanxue.com/thread-288246.htm#msg_header_h2_10) 中介绍了怎么使用 Binary Ninja 自定义不常见的调用约定，像题目文件一些是函数易语言自己的调用约定，用 ebx 传入一维或多维数组指针，ecx 返回结果。
