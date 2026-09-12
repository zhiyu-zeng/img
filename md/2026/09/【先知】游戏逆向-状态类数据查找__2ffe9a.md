---
title: 【先知】游戏逆向-状态类数据查找
source: https://xz.aliyun.com/news/92818
source_host: xz.aliyun.com
clip_date: 2026-09-12T17:23:58+08:00
trace_id: 4274e73c-2378-49be-8c6b-0a6eb2fa4392
content_hash: 1e4b2159784ebb8fe2e8e20f8de499f4d6e6056eb8fc7b8fb7115fda7dbb0c8d
status: synced
tags:
  - 先知
  - 游戏安全
  - Android逆向
series: null
feed_source: 先知安全技术社区
ai_summary: 状态类数据（0/1 布尔型）用 CE 变值筛选结合堆栈回溯定位基址加偏移，骑马与寻路两例分别得到静态偏移链。
ai_summary_style: key-points
images_status:
  total: 16
  succeeded: 16
  failed_urls: []
notion_page_id: 3d975244-d011-819d-9544-c4fa0cb85656
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 状态类数据（0/1 布尔型）用 CE 变值筛选结合堆栈回溯定位基址加偏移，骑马与寻路两例分别得到静态偏移链。
> 
> - **核心思路：** 状态类数据通常只有"是/否"两种取值，先用 CE 搜 0、切换状态后搜 1，反复筛选缩小范围。
> - **骑马状态：** 下断后只在下马时断下，上马不断不代表追错；应优先选跟随人物动画变化的那条数据。
> - **骑马回溯链：** 逐层追 ebx→ecx→`[esi+4]`→`[ebp+1c]`，最终追到 `[eax+A0]`，该 eax 由上一行 call 返回。
> - **寻路状态：** 寻路中搜 1、不寻路搜 0，可借打开其他面板等操作辅助筛除干扰数据；数据来自 `[esi+48]`。
> - **寻路偏移链：** 关键是找 esi 而非 ebx（该段汇编只在不符合寻路条件时赋值），最终得到 `[[[[[15282D8]+24]+90]+10]+20]+48`。

## 状态类数据查找

在了解完基础的数据类的数据查找方法和思路之后，这篇文章就给大家提供一下关于状态类数据我们的基本思路是怎样的，这里我们就拿骑马状态和寻路状态来给大家展示一下：

注意：在此之前我们先要想一下关于这种状态类数据我们该如何打开突破口？它不像基本数据那样有很多数据变化，一般来说这种数据只有或者不是两种状态，那么这个时候自然用0/1来表示是最方便简单的，那么我们就顺着这个思路去找：

## 1.1骑马状态搜索

依旧是先通过我们的CE工具来找突破口，我们可以先搜索0，然后骑上马之后去搜索1，这样不断搜索

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3c408bdfd9006cf8.png)

这里我们发现就剩这几个数据无法判断是具体是哪一个，这一其实如果真的判断不出来就需要我们自己一个一个去手动尝试了，不过我给大家一个提示，我们可以看一下人物的骑马状态，人物骑马是有一个动画的，这里面的数据有的是在点击骑马之后就直接变化的有的是在人物彻底骑上去才变化的，我既然找的是骑马状态那我肯定优先去找跟随人物变化的那个数据

## 1.2骑马状态堆栈回溯

这里我们通过ce搜到的地址去x32中找一下，发现来自ebx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b7b879e722a4fda4.png)

接着向上寻找（这里也要给大家提醒一下，这个数据在我们下断之后只有下马才会断，不要因为上马不断就以为自己追错了）发现来自ecx,下断满足条件之后去上一层寻找

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6529c68cb5d0a24d.png)

来到上一层发现ecx来自\[esi+4\],那接着去找esi

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1e5a4b2d15cc4a6.png)

发现来自于ecx,接着去上一层去找ecx==1049839C

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9413c4390f4f792e.png)

发现ecx来自\[ebp+1c\],ebx==10498380

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cc2c26891438c6c4.png)

接着去找ebx==10498380,发现来自ecx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7c8733a74b46fbf2.png)

返回上一层去寻找ecx,发现ecx来自eax,且eax来自于\[eax+A0\],且eax==115CA0D0,且eax来自于上一行的call ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9dc11617b79b3bbf.png)

我们在该处call下断进去看一下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e5a7e085492e8b6b.png)

到这里我们的基址加偏移就找到了

## 2.1寻路状态数据搜索

寻路状态我们依旧通过ce寻路中搜1，不寻路搜0，这里大家记得通过一些其他操作比如打开其他面板等筛选一下数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/16ba5c64a5aa20c1.png)

## 2.2寻路状态堆栈回溯

通过ce搜索到的数据地址对其下访问断点发现该数据来自\[esi+48\]

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1ecd5ffe22769b09.png)

这个时候我们需要去找esi,向上发现esi来自ecx，返到上一层去找ecx

注：这里我们解释一下为什么要去找esi而不是去找对应的ebx,这里是因为这个部分的整体汇编逻辑就是判断你的寻路状态，符合就不赋值，不符合就赋值，那么我们只需要找到该位置的基址加偏移查看该位置的数据即可

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/905cbc3223fca026.png)

发现ecx还在上一层，继续返，发现来自\[esi+20\]

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e0d9cdc2d89f852f.png)

继续向上寻找esi,发现esi来自ecx

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/24539395ae7c06cf.png)

继续向上返去寻找ecx,发现ecx来自\[eax+10\],eax==341EA720

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8563d12511e70111.png)

跟进上一行的call看一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/88320e7fe07e4086.png)

到这里我们就找到了我们需要的数据

\[15282D8\]+24\]+90\]+10\]+20\]+48

这里我们通过骑马状态和寻路状态展示了我们关于这类状态类数据的搜索办法，大家下去可以自己试一试，同时可以拓展一下是否在剧情中的状态查找

## 3.1总结

状态类数据的大致就这些，无非就是通过改变状态搜索不同的状态值来进行筛选，查找，大家自己多练习就行，下篇文章我们来给大家介绍一下关于背包仓库等物品的数据分析及查找
