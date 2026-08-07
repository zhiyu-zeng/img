---
title: 【微信】ApoorvCTF Rust语言逆向实战
source: https://mp.weixin.qq.com/s/h-rQjdzGQxoSXOSGFlvEBw
source_host: mp.weixin.qq.com
clip_date: 2026-08-07T18:01:03+08:00
trace_id: 38c97666-0cd3-40a8-ba4a-debf33913f94
content_hash: 3c0b263719b041362fe412b95f0dbb418f9a3d84f6557ce49bf64725c9c70e9c
status: synced
tags:
  - 微信
  - CTF
  - Rust逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一道ApoorvCTF的Rust逆向题，通过动态调试和汇编回溯定位AES解密逻辑，静态patch绕过字符检查后直接运行得到flag。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 3b575244-d011-81e9-995b-c65dffcc438a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一道ApoorvCTF的Rust逆向题，通过动态调试和汇编回溯定位AES解密逻辑，静态patch绕过字符检查后直接运行得到flag。
> 
> - **考点：** 国外CTF中Rust逆向侧重汇编流程分析，F5伪代码可读性差，采用动态调试为主。
> - **关键判断：** main函数if比较处区分成功/失败，失败分支调用check1/check2，用于检测输入字符串的字符类型。
> - **回溯方法：** 对解密输出相关标签反复按X交叉引用，最终定位到AES-128-CBC模式，需要key、IV、密文才能解出明文。
> - **patch思路：** 不写解密脚本，直接用NOP填充绕过check1和check2两个检查，让程序自动走到解密输出流程。
> - **结果：** 运行patch后的程序输出flag：apoorvctf{P4tch_1t_L1k3_1t's_HOt}，体现国外CTF更重逆向本身而非加密。

**蚁景网络安全** *2026年8月7日 17:35*

之前参加过的国外的比赛，名称叫：ApoorvCTF

看一下老外的比赛跟我们有什么不同，然后我根据国内比赛对比发现，他们考点还是很有意思的，反正都是逆向，哈哈哈

## Rusty Vault

题目描述：

In the heart of an abandoned shrine, there’s an old, rusted vault said  
to guard an unspeakable secret. Many have tried to unlock it, but the  
door’s demands are strange and no key seems to fit.

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/081ba6f50ece09e4.webp)

进入main函数，开始分析

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8f3469b2641d9433.webp)

这个命名方式，大概率是Rust语言

## Rust逆向调试方法

对于rust语言逆向，一般采用动态调试分析的方法

主要还是看汇编，因为F5根本看不出来啥东西。。。

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cb66917afc4250c3.webp)

从if比较处，可以看到成功和失败两个结果

那么这个比较绝对很关键

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f559bad0ae952a34.webp)

进入后发现，啥也没啊？

坏了，得看汇编，为代码估计又出问题了

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/568236bb6f0ed6c7.webp)

发现了check2，果然为代码啥也看不到

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5d88a6d0b6ca62bf.webp)

对比check1-2

发现是在检测输入的字符串的字符类型，还是冲突的，不管了继续分析

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0650e6d39aeafd53.webp)

下面可以看到失败

往下滑动可以看到成功

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/da2518e8c181c865.webp)

什么意思？

我猜测这题是改条件，然后动态输出flag？还有这好事

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/db5b8cb1463f42b1.webp)

后面都是正常输出flag了

## 回溯定位解密逻辑

那么我们现在去解密的地方回溯，估计我要改一些判断，改变流程，让程序正常走到解密的地方，然后输出flag

教大家一个回溯方法

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9459a7c115107028.webp)

对标签疯狂X键，交叉引用定位回溯

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/43b6e431312beb32.webp)

最终定位到密文，发现是aes_128_cbc模式

需要：key+IV+密文=明文

这是一种思路，大家可以尝试

本文修改流程，让他自动输出明文

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/919be4e53070c00a.webp)

现在的思路就是：

x键回溯定位关键标签，修改关键判断

让程序自动走向解密

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/53347a1acbfda7cb.webp)

## patch绕过检查

nop掉check1 和 check2

让他们走向自动解密的方向

![image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a33ba9ece8b7f48b.webp)

最终运行程序得到flag，静态patch流程，绕过check1-chekc2

```
apoorvctf{P4tch_1t_L1k3_1t's_HOt}
```

这在我们国内比赛还是很少见到的，国内大概率要写脚本解密，或许国内认为加密才是CTF的重点。国外侧重逆向本身，如果可以patch修改流程得到flag，为什么要去写解密脚本呢？

锻炼了我们通过汇编分析程序流程的能力，而不是为代码一键分析。
