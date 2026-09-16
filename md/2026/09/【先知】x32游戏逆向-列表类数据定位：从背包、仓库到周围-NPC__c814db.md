---
title: 【先知】x32游戏逆向-列表类数据定位：从背包、仓库到周围 NPC
source: https://xz.aliyun.com/news/92844
source_host: xz.aliyun.com
clip_date: 2026-09-16T19:46:00+08:00
trace_id: 288acb87-071e-4232-b829-68c1823fa0fe
content_hash: 067ab0c1f070996d1ebb41274fe82c43f2a0ebc7119851c966708febc4a609d3
status: synced
tags:
  - 先知
  - 游戏安全
  - Windows逆向
series: null
feed_source: 先知安全技术社区
ai_summary: 用 Cheat Engine 锁定关键数值，再靠访问断点与堆栈回溯逐层上溯，可推出 32 位游戏背包、仓库、周围 NPC 三类列表数据的基址与多级偏移。
ai_summary_style: key-points
images_status:
  total: 31
  succeeded: 31
  failed_urls: []
notion_page_id: 3dd75244-d011-81a3-a511-e51e12977628
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 用 Cheat Engine 锁定关键数值，再靠访问断点与堆栈回溯逐层上溯，可推出 32 位游戏背包、仓库、周围 NPC 三类列表数据的基址与多级偏移。
> 
> - **突破口选取：** 选「自己能主动改、游戏里立刻可见变化」的量——背包反复改物品数量、仓库不断放入同一物品、选中 NPC 后改名，用「改值→再搜」筛到唯一地址。
> - **标准三步：** CE 锁地址 → 对读取该内存的指令下访问断点 → 回溯寄存器来源：数据来自 `[esp+xx]` 就去堆栈看它是哪个 call 的第几个参数，再返回上一层找该参数。
> - **偏移链结果：** 背包 `[[[[[[15282D8]+24]+90]+8]+14]+2c]+eax*4]`，物品数量 +70；仓库 `[[[[15282D8]+24]+90]+8]+38]+2c`；NPC 名字 `[[[[[15282D8]+24]+c]+74]+AC]+edi*4]+898`；注意目标数据在 `edi+8`，别漏加。
> - **卡点解法：** 回溯到 `[esp+2c]` 既非 call 参数、上下也无赋值（全局变量）时，可①对数据下访问断点；②在 CE 搜该地址反查持有者；③到 call 头部下断单步步过。前两条未走通，本文靠第三条发现 `edi+8` 即目标数据。
> - **注意点：** 每层回溯前先确认数据正确（可下条件断点验证），方向错了只会越追越远；背包与仓库中间多层结构重合，找到一类即可套用其余。

## 列表类数据定位：从背包、仓库到周围 NPC

## 1\. 背包数据分析

### 1.1 通过 CE 进行数据查询

通过不断改变背包中某个物品的数量来查找我们需要的数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c1d7079803d0dcce.png)

我这里是通过背包的血量道具直接搜索初始值，使用之后再次搜索新的值直接就能找到了

```plain
cmp dword ptr ds:[edi+70],1               |edi==31F32748
```

### 1.2 x32数据堆栈回溯

继续向上寻找 edi 的来源，发现 edi 来自 \[esp+84\]，我们去堆栈区看一下，发现是一个 call 的第一个参数，那我们继续向上找

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/76d226ec3d829bf1.png)

返到上一层我们发现上面的第一个 push 竟然是 push 0，这肯定不对，这个时候我们注意一下旁边的跳转线，估计一下应该就是从上面 jmp 下来的，应该是 push eax 才对，那我们继续去找 eax

**注意**：大家如果不确定可以通过下条件断点的方式来判断自己的分析正不正确，这里只需要好再 push eax 的位置下个条件断就能判断出来

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f128be44d5721ee8.png)

往上走没多远就发现了一个 call

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/079cd22817cc1f18.png)

这里下端也能发现确实 eax 是来自这个 call，那在该 call 出下断步进查看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/22ac20e94fb148cd.png)

跟进这个 call 我们也能发现最终数据来自 ecx，我们退出去看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1d08771910dd9406.png)

其实这个时候就能发现 ecx 已经不变化了，而且上方也显示 ecx 来自 \[esp+2c\]，而且我们发现它并不是某个 call 的参数或者什么，那就是一个全局变量嘛，我们先看看有没有直接对 \[esp+2c\] 的赋值

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/12fd464eacf7733f.png)

大家可以自己看一下，上下部分确实没有相关赋值，这里也给大家说一下相关方法

通过下图我们也能看到 edi+8 就是我们的数据，那我们就继续跟 edi 找 edi 的来源，这里我们其实也能看到 edi 来自 \[eax+14\]，eax 来自 \[eax+8\]，eax 来自上面的 call，我们进 call 看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/917e2b0c3afa8350.png)

进去可以发现确实是我们要的数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c49dd3aec8791709.png)

### 1.3 堆栈+偏移总结

那么背包的基址加偏移我们就能总结出来了：

但是这里我们要注意一点，我们找的 edi 的数据 +8 才是我们之前找的数据，一定要记得加上

```plain
[15282D8]+24]+90]+8]+14]+2c]+eax*4]
```

物品数量：+70

我们通过 CE 验证一下

这里我们就以第一个格子举例：  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/05d583dcef8bf2b9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b45000d76248e0cd.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/686acec0f725c68a.png)

确实没问题

那么这里我们找这个背包物品就成功了

## 2\. 仓库数据遍历

### 2.1 CE数据查找

我们接着按照这个思路趁热找一下仓库数据遍历

这里我也是通过不断向仓库中放入同一个物品找到了对应的地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70364f90a0f0462c.png)

### 2.2 x32数据堆栈回溯

这里我们发现也来自和背包相同的位置，我们继续向上看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/70c03a59fc1f7ea3.png)

发现也是来自 \[esp+84\]，继续去堆栈中向上找

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4b6cd71549611374.png)

发现这次直接来到了这里，那对应的数据肯定就是 eax 了，我们进上面的 call 看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b3d1a849908658b1.png)

这里还是一样的结构，那我们继续出去找 ecx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c836d6110b8a67bd.png)

发现来自于 \[esp+24\] 的位置，且堆栈数据还是全局变量，这里去上下找还是找不到还是去头部开始单步步过找相关数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bdf181d6e56c5af4.png)

这里找到 eax+8 就是我们对应的数据，那么继续去找 edi

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1b37ecfecfe15a4a.png)

发现来自 \[eax+8\]，进 call 去看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f18320de2e749464.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1dbf47231b1b5e50.png)

### 2.3 仓库数据总结

这里仓库的基址 + 偏移我们就得到了

```plain
[15282D8]+24]+90]+8]+38]+2c
```

## 3\. 周围怪物 NPC 数据分析

### 3.1 CE数据查找

我们再分析一个有关周围怪物的数据，突破口我这里是通过选中 NPC，修改 NPC 名字的方式来找的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cabb3547432d6c14.png)

### 3.2 x32数据堆栈回溯

找到突破口我们去 x32 中看一下，我们对该位置下个访问断，根据断点位置，我们去找对应的 eax ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7dcef958f89e38a5.png)

发现 eax 来自 ebp，ebp 来自 \[esp+C\] 我们下断可以看到来自于 call 的第一个参数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9260575d8f14017f.png)

返上去我们发现来自于一个 call eax，我们下断进去看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4527bba197875163.png)

进去发现来自 \[ecx+898\]，继续去找 ecx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/97f4652601921cf2.png)

退出去发现 ecx 来自 esi，esi 来自 \[eax+edi*4\]，eax 来自 \[ebx+AC\]，我们继续去找 ebx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b4bca2e9c6fde038.png)

这里也给大家看一下，我们可以看到 ebx 来自 \[esp+24\]，但是这里我们可以看一下堆栈

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b18f7623e921790f.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1613eb31a19d2bca.png)

这里我们返过去其实能够看到啥也没有，这里我们还是老样子去看有没有赋值或者其他的相关数据，这里我们也能看到最终来自 eax，我们进上面的 call 看看

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ac1f23f4d1aed8d8.png)

进去之后我们就能看到基址了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8329661545caec50.png)

### 3.3 关于怪物 NPC 的数据总结

到这里，我们关于怪物 NPC 的数据的基址加偏移就能确定了

怪物名字：

```plain
[15282D8]+24]+c]+74]+AC]+edi*4]+898
```

## 4\. 总结

这一篇找的三类数据——背包物品、仓库、周围怪物 NPC——目标各不相同，但走的是同一条路。

**第一步，先用 CE 把数值锁成一个地址。**

背包靠反复改变某个物品的数量，仓库靠不断放入同一个物品，怪物 NPC 靠选中后改名。思路是一样的： **找一个你能主动改变、且变化结果能立刻在游戏里看到的量**，然后「改值 → 再搜」，一轮轮筛到只剩少数候选。突破口选得好，后面能省一半力气。

**第二步，下访问断点，看是哪条指令在读这块内存。**

断下来之后，从这条指令往上找「持有该值的寄存器是从哪来的」。数据来自 `[esp+xx]` 就去堆栈区看它是哪个 call 的第几个参数，再返回上一层去找那个参数。返回之前务必先核对数据是对的。

**第三步，也是这篇真正想讲的：回溯断在半路时怎么办。**

背包这里就卡住了——追到最后发现数据来自 `[esp+2c]` ，而它既不是某个 call 的参数，上下也找不到任何赋值，是个全局变量。这种「堆栈数据找不到对应赋值」的情况，本文给了三条思路：

1.  对最后找到的数据下 **访问断点**，看能不能断出具体来源
2.  在 **CE 中搜索** 这个地址，反查谁持有它
3.  去 **call 的头部下断，单步步过** 执行，盯有没有和要找的数据相等或相近的值

前两条在这里都没走通，最后是第三条找到的：一路步过发现 `edi+8` 正是目标数据，再顺着 `edi` 的来源逐层往上回溯，整条链就串起来了。后面仓库和怪物 NPC 两节，遇到同样的卡点，用的也是这个办法。

这里我们可以总结一下：

-   突破口优先选「你能主动改、游戏里立刻能看到变化」的量——数量、名字、血量都行
-   回溯时每一步都先确认数据正确再往上走，方向错了只会越追越远
-   追不动了别硬追，多想想原因
-   三类数据的结构其实很像，背包和仓库连中间几层都重合——找到一类之后，其余的可以顺着同一套结构去套
