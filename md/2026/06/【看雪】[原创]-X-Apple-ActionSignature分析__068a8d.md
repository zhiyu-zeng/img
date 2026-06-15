---
title: 【看雪】[原创] X-Apple-ActionSignature分析
source: https://bbs.kanxue.com/thread-291582.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-15T15:26:23+08:00
trace_id: 5da39c6e-9e2e-411d-91b5-e69ce89dc4ec
content_hash: 8f670e1e174ec55b35b23ab673d91444a99fdcdb9bb78fdd98978e831711ee33
status: synced
tags:
  - 看雪
series: null
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 38075244-d011-818c-8189-d7989d91843f
---

分析对象: apple music  
Android端

这里面的算法还是比较复杂的,混淆都是BR间接跳转混淆,使得分析人员无法静态分析,然后再搭配MBA混淆及平坦化,让逆向门槛更上一步,堆栈内存地址也是加密处理了的,用到的时候会通过算法运算解密出来,再取数据。

如果只看trace去解决算法的话,会耗费大量时间，因为里面算法大量用到了白盒加密,基于查表的方法达到一个加密目的,这是其一,其二是会用一些魔改算法,比如这里频繁用到了梅森旋转算法(MT19937)，每次更新MT表数据都会迭代624轮,光初始化都执行了128次，别说后面的一些切页操作。

这里我用的是trace再配合idapyhton去混淆就可以很好的分析了，在效率是有很大提升。

[GumTrace](https://bbs.kanxue.com/elink@a50K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6D9K9h3c8G2L8X3N6&6L8$3!0G2i4K6u0r3c8%4g2E0g2s2u0S2j5$3g2Q4x3X3g2Y4K9i4b7%60.): 真机trace工具

[trace-ui](https://bbs.kanxue.com/elink@ce4K9s2c8@1M7s2y4Q4x3@1q4Q4x3V1k6Q4x3V1k6Y4K9i4c8Z5N6h3u0Q4x3X3g2U0L8$3#2Q4x3V1k6A6L8h3Z5H3x3i4W2Q4x3V1k6@1M7X3q4U0k6g2\)9J5k6s2g2A6i4K6u0W2k6$3W2@1): trace日志分析工具

这两个工具对于算法分析,大大提升了分析效率,很棒!感谢两位大佬的无私奉献！具体使用就去Github上查看。

手机: pixel 6 os: 15

Frida: 17.8.2

为了能方便分析代码逻辑，去混淆是不可缺少的步骤。

先对目标函数进行trace,然后提取里面所有BR地址和跳转的目标地址。

格式:

提取出来的大致会有两种

先用这个脚本去执行，目标跳转地址=1的会直接被patch。下面print输出的都是目标地址>1的。这里>1的把它细分成=2的和>2的。

这种更多的是带条件跳转特征的,例如eq,cc,ne等等。

以0x3069a8这个地址为例,有两个目标地址\[0x319740,0x3069ac\]

为真时跳转到0x319740，为假时跳转到0x3069ac  

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/de417aaf633d9271.png)
![](https://bbs.kanxue.com/upload/attach/202606/947335_93HZ8A4G9E5X5WK.png)

CINC W20, W6, EQ

这个指令的意思是上面X26与x24作比较,如果相等,w20=w6+1，否则w20=w6。

在0x306984~0x3069A8之间的指令都有用到,所以不能随便patch，像以前的惯性思维都是在基本快的最后两条指令作patch，在这里如果这样做了,会导致F5出来的代码不全。

这里我们可以看到0x3069a8 br地址的下一条地址是0x3069ac，而0x3069ac又在这个br的目标地址里。所以我们只需要patch一处即可,可以直接在br地址出patch成 \*\*b.eq 0x319740 \*\*,然后不满足条件时,它自己就会顺序走到0x3069ac地址处。

以0x308b4c这个地址为例,有两个目标地址\[0x3110c4,0x308904\]

为真时跳转到0x3110c4，假时跳转到0x308904 ![](https://bbs.kanxue.com/upload/attach/202606/947335_MNW4JBMVR33EM35.png)

这里可以看到br的下一条指令地址是 0x308B50,这个时候就不在br的目标地址里了，前面也是说到了br到cinc指令之前的所有指令操作都有用到,我们不能随意patch，那这里应该怎么做呢?细看0x308B50这个地址的指令,它其实是个垃圾指令,在整个程序里并不会被执行到。所以我们可以在

0x308b4c地址处patch成 **b.eq 0x3110c4**,

0x308B50地址处patch成 **b 0x308904。**

如果还有不知道为什么能一眼看出0x308B50这里的地址是垃圾指令,那你可以直接在trace日志里搜索这个地址,看是否被用到,如果没被用到你就放心大胆的patch。

脚本:

就去找一块没有被执行到的块,然后在br地址处patch到这个块作为跳板,再patch到每个目标地址即可。

完成以上步骤,那么br混淆的去除已经完成了,接下来就是分析代码了。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/30f0581603f0ae22.png)

![](https://bbs.kanxue.com/upload/attach/202606/947335_36D3KJHTC8KA83B.png)  
这是登录的时候抓包数据。

整体数据大小有501个字节。  

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/b341663efc3e7def.png)
![](https://bbs.kanxue.com/upload/attach/202606/947335_QPS9YZ395CVJ5EP.png)

02

固定字节

F5 74 3E 5E 32 A1 91 79 93 76 B1 A0 25 EC F0 3F

14 25 2E 26 3E 8A 08 0F B3 12 96 58 9E E4 E7 3F

共32字节,前16字节是从 libCoreFP.so 里的text段取数据计算出来的。后16字节由请求body和证书交换加密出来的。

00 00 01 D0 03 00 00 00 42 00 00 01 00

头部魔数,

`00 00 01 D0`:后面有0x1d0个数据大小,固定大小

`03` :固定

`00 00 00 42`:固定

`00 00 01 00`:固定,0x100个数据

AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB

CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD

EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF

AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB

CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD

EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF

AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB

CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD

EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF

AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB

CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD

EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF

AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB

CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD

EF AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF

AB CD EF AB CD EF AB CD EF AB CD EF AB CD EF AB

这里就是0x100个数据,运算出来的固定数据。

00 00 00 1A 67 35 BC CF 5D 5C 15 32 C9 A8 4F 0A 58 A5 95 95

0F 51 56 D8 17 A9 A6 BC 8D 22

`00 00 00 1A` 这个大小是前面计算出来的，这里的大小范围是0-32,剩下的数据会在加密数据后面填充0。后面0x1a个数据内容,也是从text段取数据计算出来的，

[回复或点赞可查看完整内容](#quick_reply_form)

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#脱壳反混淆](https://bbs.kanxue.com/forum-161-1-122.htm)

* * *

## 评论

> **kingking888 · 2 楼**
> 
> 666

> **MaYil · 3 楼**
> 
> 感谢分享

> **wx\_插曲 · 4 楼**
> 
> 666

> **dob\_C · 5 楼**
> 
> 感谢分享

> **大魔头 · 6 楼**
> 
> ![](https://bbs.kanxue.com/view/img/face/005.gif)

> **小调调 · 7 楼**
> 
> 我尝试过直接模拟还原出一个释放算法，跑了20分钟直接把Token烧没了，还没跑完 ![](https://bbs.kanxue.com/view/img/face/031.gif)

> **xingbing · 8 楼**
> 
> 感谢分享

> **swkl · 9 楼**
> 
> 感谢分享
