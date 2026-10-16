---
title: 【看雪】手动脱壳：如何寻找并修复 Stolen Code
source: https://bbs.kanxue.com/thread-293243.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-16T22:23:46+08:00
trace_id: 59010aae-447c-465e-8115-a2f21046d94d
content_hash: 0daa0f0db9df8a7cae442967629ea897f8dc3c169785470520ba2ef992b2d569
status: synced
tags:
  - 看雪
  - 脱壳与加固
  - 反调试
series: null
feed_source: 看雪·加壳脱壳
ai_summary: 针对 ACProtect 壳无痕偷取 OEP 指令、假 OEP 处毫无痕迹的情况，用最后一次异常法定位假 OEP，再对比"假程序"与带壳程序的栈状态反推出被偷代码位置，抓取后回填补丁完成脱壳。
ai_summary_style: key-points
images_status:
  total: 20
  succeeded: 20
  failed_urls: []
notion_page_id: 3fb75244-d011-8180-9555-d82be027c6ff
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 针对 ACProtect 壳无痕偷取 OEP 指令、假 OEP 处毫无痕迹的情况，用最后一次异常法定位假 OEP，再对比"假程序"与带壳程序的栈状态反推出被偷代码位置，抓取后回填补丁完成脱壳。
> 
> - **壳的行为：** ACProtect 把 OEP 处原始指令搬到壳内执行，执行完销毁痕迹再跳到假 OEP，因此特征码搜索完全失效（壳边解密边运行，搜到前已销毁）。
> - **定位假 OEP：** esp 定律会跑飞，改用最后一次异常法，按两次 F9 停在最后异常，从栈中 SEH 链取出 handler 地址（示例 00415938）；不要下软件断点以免触发断点检测，改用硬件断点或内存访问断点，用后删除。
> - **内存断点技巧：** 不能直接对 .text 段下内存执行断点（会崩溃），先下内存读取断点让壳自行解密，且需反复重复设置。
> - **导入表修复：** Scylla/ImportREC 对加密导入表修复不全，作者自写工具输入导入表地址、模拟跟踪取得真实 API 地址并写回，无法识别的项直接剪切。
> - **抓取与回填：** 壳必须把栈恢复成"被偷指令执行完毕"的状态；用跑不起来的假程序记录阶段一栈状态，带壳程序阶段四与之相同，二者 return address 均为 75C65D49，以此为特征反推 call's ebp 栈地址并下硬件写入断点，即可抓到 push ebp 开头的 Stolen Code，最后补到假 OEP 之前并用相对地址修改入口。

**0x01.解释**

网上关于 32 位壳的脱壳教程大多使用 OD，我想用 x32dbg 演示。本文会完整走一遍脱壳流程，虽然网上有很多相似的教程，但本题的核心不在流程本身，而在于：当程序到达假 OEP 后，如何定位并还原被偷取的 Stolen Code，最终找到真正的 OEP。

**0x02.了解Stolen Code**

经典的 Stolen Code（被偷取的代码）：壳把程序原始入口点（OEP）处的若干条指令"搬走"到壳自己的内存空间里执行，然后在原位置留下一个跳转指令，指向壳中保存的这些指令。这种做法比较好追踪，因为在假 OEP 处会留下明显的跳转痕迹。

而这里讲述的是稍难得一种，不会在假OEP留下痕迹，这样太明显了，OEP 处的原始指令完全在壳内部执行，执行完毕后壳将相关痕迹清理掉，跳到假OEP。所以这里我们就要找到合适得时机抓到这个指令。

**0x03.查壳**

相信大家脱壳的第一步都是查壳，这题也不例外。这是一个ACProtect的壳。 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ff7e97df8543dc53.webp)

**0x04.寻找OEP**

## 最后一次异常法定位OEP

这里用不了esp定律法，因为会跑飞，尽管这里有pushad。这里我用的是最后一次异常法。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a35bb9046c6c1459.webp)

当按三次F9后，程序就跑起来了，所以我们这里按两次F9，停再最后一次异常，两次异常后就会停在这里。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/eb4a39109f6f557b.webp)

然后我们到栈里查看 SEH 链，找到异常发生时系统会调用的那个 handler

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4d09018935ebbcab.webp)

很显然，这里的hanlder的地址在00415938位置，最好不要直接跳到该地址下软件断点（小心断点检测）。下硬件断点或者在该内存下内存访问断点。再F9，停在这里。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b441e69c76d6d31.webp)

或者

硬件断点

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/52f81dc14224fba9.webp)

养成好习惯，把我们下过的断点给全部删除掉。

之后我们不能直接在.text段下内存执行断点，要不然会触发异常奔溃。这时我们得先让壳运行一会儿。我们可以往这块内存下内存读取断点，因为这个壳会读取自己这块内存的代码，然后便运行边解密。 **注意这里要重复设置。** ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cc003ce91fd73064.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0e33d532aee22427.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/003d885b4c65d984.webp)

这个OEP一看就是假的，通常OEP都是push ebp开头的。但是这里我们不要着急，先尝试修复。

**0x05修复程序**

## 加密导入表修复

我们这里直接用x32dbg自带的Scylla工具dump出程序，尝试获取导入表，这里我试过不管用Scylla还是ImportREC工具获取导入表，他总是修复不完全或者干脆修复不了(因为这里的导入表稍微做了加密的），所以我这里直接写了一个工具，功能：输入导入表地址，模拟跟踪导入表，获取真实API地址，然后再写会导入表，这样Scylla工具就可以直接识别到导入表。（工具我放到下面了，需要源代码的伙伴可以私信我)。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/df6ee0c4d6d540a0.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c9e2d1870f9625fa.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b751b6d54cc8aed.webp)

还有一个无法识别的直接剪切掉，这样scylla就可以识别到了。接下来我们直接修复导入表。但是这样虽然修复了导入表，但是程序还是运行不起来，因为OEP头部的指令被偷走了，所以接下来就是重头戏，如何抓到真实OEP。（修复完后不要急着把该程序结束掉，后面会用到)

**0x06寻找Stolen Code**

众所周知程序OEP的开头一般是push ebp开头，这时我们就会想到直接特征码搜索，但是对于这个壳是行不通的，因为这个壳它是边解密边运行，运行完再销毁掉。等我们去搜索 Stolen Code 的特征码时，壳早就把它销毁了。所以这个时候我们就想到push ebp这个操作会压栈，我们找到这个栈位置然后再下硬件写入断点是不是可以抓到了。但是我们怎么找到那个栈的位置呢？这时我们就要用到前面修复的那个运行不起来的程序（这里我称之为假程序）。

壳在做完自己的工作后，必须保证栈的状态和原程序执行到同一位置时一致。否则控制权交还给程序后，程序会立刻崩溃。所以不管壳在中间做了多少事——搬走 OEP 处的指令、执行完被搬走OEP指令、再执行自己的代码、跳到假OEP——最终它都得把栈恢复成“被偷走的那些代码执行完毕之后”应有的状态。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/558ddf05b54dace8.webp)

## 栈状态对比锁定偷取代码

有图可知，不管阶段三做了什么，到达阶段四(假的OEP)的状态和阶段二的栈的状态是一样的。但是我们修复的那个假程序初始状态是直接从阶段一开始的，他是跳过了阶段二和阶段三，栈的状态是错误的。  
那么接下来思路就很清晰了，我们可以直接到阶段一或者阶段一前面的时候，在return addres1的上面下一个硬件写入断点，就可以停到阶段二，而阶段二的代码也就刚刚执行push ebp，这样我们就抓到了Stolen Code。

我们该如何找到call's ebp1栈的位置呢？别忘了我们先前的那个假OEP，虽然跑不起来。但是我们只要他到假入口点时的状态。记住x32dbg只要设置入口断点，我们把这个假程序加载到x32dbg中。这时，假程序的栈状态就是上图中阶段一，记录下来。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e197303e6c782e28.webp)

还记得我们第一次加载的那个带壳程序吗(不会直接把他关掉了吧？），他现在处于上图的阶段四，栈的状态是和阶段二是相等的。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d0d9442464e142f1.webp)

观察两处栈的状态，可以发现 return address 为 `75C65D49` 。这里两处的栈地址虽然相同，但我不能保证脱其他壳时也会一样，所以不能依赖这个固定的绝对地址。我们应该以 `75C65D49` 这个 return address 为特征，反推出 `call's ebp` 所在的栈地址。

既然已经获取道路75c65D49这个特征，那么我们可以通过此特征找到call's ebp的栈地址了，下硬件写入断点，抓取push ebp(Stolen Code)。  
**0x07抓取Stolen Code**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9bafc7599ac98794.webp)

可以重复我上面的脱壳操作，直到执行了多次内存读取断点后那一步下断点。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/96044360c6a40e20.webp)

我们观察此处的代码特征，很想被偷走的OEP指令，popad还原寄存器指令，然后执行Stolen Code，再pushad，保存寄存器状态方便后续销毁此处代码。如果觉得还不保险，可以执行完这几处的代码，看看栈的状态与你将要到达的假OEP栈的状态是否一样。

**0x08真正修复程序**

## 补丁回填与入口修正

最后也就是将此处的代码添加到假OEP上面，打好补丁，修改好入口地址(记得要用相对地址)脱壳成功了。  
**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cde2c6ebe658a171.webp)**

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1a4ff67e1ebe4a54.webp)**

**![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/37085ce01a73ef44.webp)**

## 附件

- [工具+题目.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/342aafa86a76c0b2.zip) （513.95kb，0次下载）
