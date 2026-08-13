---
title: 【看雪】ai逆向tiktok验证码从0到1（2）
source: https://bbs.kanxue.com/thread-292251.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-13T12:16:34+08:00
trace_id: 873b1da7-a3b7-4b81-a8eb-ec5022104442
content_hash: f229716d15c7e28a15cb605e6ff8665ce0eada78f36466a4b10322d952a86744
status: synced
tags:
  - 看雪
  - AI辅助逆向
  - 协议分析
series: 【看雪】ai逆向tiktok验证码从0到1
feed_source: null
ai_summary: TikTok 验证码 captchabody 的加密与解密可全程交给 AI 完成，且载荷中多数加密参数服务端根本不校验，真正的难点在后续轨迹偏移量。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3bb75244-d011-81c9-9d1a-df21cb267531
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TikTok 验证码 captchabody 的加密与解密可全程交给 AI 完成，且载荷中多数加密参数服务端根本不校验，真正的难点在后续轨迹偏移量。
> 
> - **定位方式：** captchabody 出现在滑动后 v2 接口的载荷中，不同于 data 的 get 接口刷新触发。
> - **校验结论：** 载荷中大量加密参数均不参与服务端校验；返回非 200 应优先排查自身加密或流程问题。
> - **解密函数价值：** 加密完成后保留本地解密函数，既能校验加密是否正确（真实抓包解密比对），又能保持本地与真实环境一致，方便对比轨迹供 AI 分析。
> - **结构要点：** captchabody 中 id 由 data 解密后返回且可固定，校验主要由 reply、mm、mp 承担；tk 验证码难点在偏移量，而抖音验证码难点在环境数组与 ckmn。
> - **AI 使用策略：** 建议拆分任务逐步让 AI 完成（先 data 解密、再 captchabody），出现问题可快速定位；本次加密跑完并完成解密验证，成本约 1 元人民币。

上一期主要简单教大家配了一下环境，以及介绍了data解密的过程，这一篇带着大家完成captchabody的加密，这期就不仅仅带教大家如何问了，这期大帅比自费买一天的codex日卡从0开始带着兄弟们搞一搞，顺便跟大家分享一下成功的md文档吧，好的废话不多说我们直接开始我们的ai逆向。

网址依旧是那个网址，那么我们captchabody这个如何看呢，之前data的是点击刷新触发get这个接口看响应值可以看到data，我们captchabody是滑动后在v2这个接口的载荷中出现的，我们这一篇就搞一搞这个吧。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b308e146402a9dd5.webp)

## 参数校验结论

tk这边的验证码整体逻辑跟抖音那边的挺像的，但是抖音那边的整体难度相对来说难一些，但是在ai发展到现在的情况下抖音那边也是随便搞的。大家看载荷里面有很多加密参数，我这边直接跟大家说结论吧，这里面其实都不校验的。大家如果返回不是200那么一定是自己这边的加密或者其他的问题，不用怀疑这个这边的坑已经给兄弟们走完了。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ef34cff596947693.webp)

这边这样问就行了，为什么我要在后面多说一嘴呢，主要是这一篇就介绍captchabody，我怕这边全部搞完了，所以固定加密前的对象。这边可能有兄弟不清楚字节这边验证码的结构。我这边在ai跑的时候先解密captchabody给大伙看一下它的原型吧。运行一下解密函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9e23e0a60138a9da.webp)

## 解密函数建议

这边建议大家在遇到字节系的captchabody的时候在加密完成后一定需要生成一个解密函数，因为对于这些验证码来说加密可能只是较简单的部分，难点一般都是轨迹这边比较恶心，如果大家有解密函数在处理轨迹的时候就可以保持本地与真实环境一致，对比生成的轨迹的区别，交给ai来分析效果翻倍的。

这边的结构主要如下，给大家简单介绍一下吧，id就是一个标记通过data解密后返回，然后这边大部分都是可以固定的，校验主要reply，mm，mp这些，这里我记得偏移量还是挺恶心的，这个偏移量就是tk轨迹这边的重点，抖音那边主要就是环境数组，ckmn这些，大家有兴趣可以自己研究，或者想要大帅比带着兄弟们搞一搞也可以评论的。好的扯远了这边tk这边就简单说这些给大家在完成catchabody的时候做个基础不至于懵逼。后面偏移量部分交给我们下一期吧。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bebea31582fe42e3.bin)

好了基础给兄弟们介绍了下，这边看看我们ai跑的咋样了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f32ae6b91dab2fdb.webp)

主要也没啥要写的了现在就是看ai跑，可以看到兄弟们这边ai直接读取js文件，并且加密都搞的差不多了，后面只需要我们耐心等待，那么如果我们在工作的时候可以怎么办呢，当然是看tk的美女了，这边摸鱼的技巧也传授给兄弟们，记得打开控制台看，被抓到就说我在抓包。 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/47efc90069405d10.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8e7c30348d751145.webp)

无事可干更新一下ai跑的情况吧，对了之所以说最好在完成加密后叫兄弟们搞搞解密函数还有个好处可以校验你这边加密对不对，直接真实页面抓包搞一个真实产生的captchabody，本地解密一下，解密成功不就说明这边加密正确了么。然后这边大帅比建议大家叫ai弄的时候不要一下子说把验证码搞定，最好先自己分析，能拆分就拆分，这样哪里有问题自己也知道，不用后续ai跑完了出现错误不知道在哪里，这边我们一步步确定data解密没问题，captchabody也没问题，后续就看轨迹了，这样的逻辑就十分清晰明了。

好了这边也是加密跑完了我们去搞一下解密函数吧

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7928995d8a79fd28.webp)

细节需要逐字分析 ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e148f974dacbe7b3.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b1687e88954a7754.webp)

## 解密验证成功

好了这边也是搞定了，解密后的结果与加密前一样，那么我们的captcha body肯定是没问题的。在这个ai如此强大的时代建议兄弟们多用ai多感受一下，其实没有那么多复杂，多尝试就行了。

好了搞定后给大家看看消耗，换算rmb 1y左右

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/339dd91baa081cc5.webp)

好了兄弟们去尝试尝试你也可以的，我这边也是到了吃饭的时间了，有空接着给大家分析后续偏移量的解决方案。

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)

* * *

## 评论

> **xingbing · 2 楼**
> 
> 学习

> **mb_ldbucrik · 3 楼**
> 
> 向大佬学习

> **totaldark · 4 楼**
> 
> NICE

> **mb_ujrqdalt · 5 楼**
> 
> 6666

> **Zireael · 6 楼**
> 
> 学习

> **sorely · 7 楼**
> 
> 666

> **啊你好哇123 · 8 楼**
> 
> 学习学习

> **kingking888 · 9 楼**
> 
> 666

> **git_69678tuantmtb · 10 楼**
> 
> 666

> **mb_mcftudpj · 11 楼**
> 
> 666

> **mb_qzobmoaj · 12 楼**
> 
> 666

> **mb_pboqysju · 13 楼**
> 
> 666

> **kyomylove · 14 楼**
> 
> 666666

> **mb_denqjdjl · 15 楼**
> 
> 666666

> **mb_kpwstdrq · 16 楼**
> 
> 感谢分享

> **mb_tcznxyhb · 17 楼**
> 
> > [mb_kpwstdrq](https://bbs.kanxue.com/user-1066560.htm) 感谢分享
> 
> 感谢分享

> **mb_chjjqnap · 18 楼**
> 
> 1

> **mb_esctumlr · 19 楼**
> 
> 666

> **limingmingl · 20 楼**
> 
> 666

> **阿三 · 21 楼**
> 
> 666

> **mb_zsmeyemp · 22 楼**
> 
> 66

> **yaoye555 · 23 楼**
> 
> 66

> **CuteHacker · 24 楼**
> 
> 摸鱼的技巧也传授给兄弟们 学会了

> **ha0 · 25 楼**
> 
> 666
