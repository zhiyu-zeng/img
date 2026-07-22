---
title: 【微信】安卓逆向 -- 某记账App永久会员功能分析
source: https://mp.weixin.qq.com/s/KAWJI0MHsmpbsGRzmx6_cw
source_host: mp.weixin.qq.com
clip_date: 2026-07-22T16:05:32+08:00
trace_id: 4c72d5e9-543d-41f2-a65b-fbef2f486a78
content_hash: 6dd4e04fbf3c8c1de91167302d091601c170c90bad339e400d6ce2a83b689554
status: summarized
tags:
  - 微信
  - Android逆向
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 通过修改Android记账App的smali代码，绕过会员检查逻辑，成功实现永久会员功能破解。
ai_summary_style: key-points
images_status:
  total: 26
  succeeded: 26
  failed_urls: []
notion_page_id: 3a575244-d011-812a-8ea0-c03c6386feda
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过修改Android记账App的smali代码，绕过会员检查逻辑，成功实现永久会员功能破解。
> 
> - **分析工具：** 使用NP管理器对未加固的APK进行dex文件分析，搜索"isvip"等关键方法定位VIP检查逻辑。
> - **核心破解：** 在VIPHelper类中，将isvip和isForeverVIP方法在smali代码中修改为返回true，模拟永久VIP状态。
> - **问题解决：** 通过算法助手pro定位账本数量限制弹窗的调用栈，修改相关方法返回false，解除功能限制。
> - **验证效果：** 修改后App显示永久会员，会员装扮等功能可正常使用，账本数量限制被绕过。
> - **遗留问题：** App强制登录和签名校验（如md5码未配置）可能影响完全破解，需进一步处理。

**逆向有你** *2026年7月22日 15:48*

声明：本文仅供学习交流使用，所涉及的APP和破解版均不提供下载渠道。所涉及的技术请勿用于非法活动，否则所带来的一切后果自负。

注：所有与软件名称有关的地方已做模糊处理，请大家也不要在评论区分析app名字，毕竟软件开发者制作不易，请不要大量破解。

我们要破解的是该记账软件的永久会员功能，这个app会员判断逻辑写的比较简单，大家可适量拿来练手。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4db74ba3f9396619.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a58876765fcee80b.png)

我们这里使用NP管理器进行软件代码分析，当然MT管理器更佳，这个看个人。

首先我们发现此App未进行加固处理，所有我们可以直接进行代码分析；因为我手机已经有了破解后的，所以我在原版app后面的包名添加了"original"以此作为区分。

我们直接全选dex文件：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a2a7d1694d709e11.png)

在dex文件全选搜索“isvip”这个方法，这个方法并不是app判断会员逻辑通用的，也有ismember或者其他名称，这里也是试着搜索这个。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/abe3efcee72c3107.png)

搜索出来的结果有五个，我们重点关注VIPHelper这个类的isvip方法，点进去smali代码进行查看：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/da1493b13e22f0d3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/19baf1b340249a0d.png)

有些朋友可能不熟悉smali代码，我们可以点击上面的导航按钮，然后长按该方法把它转为java代码查看，NP管理器转java是免费的，而MT管理器这个功能收费

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4cdfc92290899928.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1a8d08362df4f6d7.png)

为了大家看的清晰，我使用jadx把这部分代码给大家查看

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/afa9bb376063d04d.png)

这里的逻辑就是判断是否登录，未登录直接返回false，如果登录进行判断IS_VIP这个变量是否为true，下面的逻辑就是判断vip类型，比如你是月费，年费还是永久会员之类的。然后关注z这个变量的赋值，它是通过判断我们vip是否已经过期，但如果前面是vip也不会走到这条语句了。所以我们直接在smali代码里面让这个isvip函数永远返回true就可以了。

```kotlin
const v0,0x1return v0
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1465fb28e3d5bd92.png)

然后我们继续查看VIPHelper这个类的其他方法，发现还有一个isForeverVIP方法，我们猜测这里判断我们是否是永久vip，也给它在smali代码里面返回true，还有一个isOver方法，看逻辑也是判断我们vip是否已经过期，但如果我们是永久vip的话，哪还有过期这一说呢？这里可以进行修改为false，这里不作修改。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5a3cdf1e7f71823e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/30b8f1f26dc63b09.png)

我们改好这些以后一路返回点击保存，重新打包以及编译签名app，随后进行安装即可。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/75819460fb82cedf.png)

安装过后我们发现，主页我们就已经是永久会员了，那么是否真的可以使用会员功能了呢，我们还得进行验证

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f1eef3213a995df1.png)

点击会员才能使用的装扮，发现可以修改成功：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/88fb1d34a5cbcf1f.png)

那么是否我们就已经做完了呢？我们发现账本却不可以添加三个以上，这是为什么？我们明明已经是会员了为什么这个功能却受限了？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4f511e720b7b8b2a.png)

我们借助算法助手pro，定位这个弹窗实现的调用栈，具体操作如下：

1.打开需要注入的应用的总开关

2.打开控件文本赋值记录，打开log捕获，把原本app进程关闭，重新启动后再触发这个弹窗

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4848818c65fddddb.png)

然后我们在应用日志里面看到了这个弹窗的调用栈：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4070603b793485fa.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/07a26101ee33f125.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f70c3dc1eda4c34c.png)

我们复制这个弹窗前面的类名，按照之前步骤选择全部dex进行搜索类名，然后再搜索方法名：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/37ce09942d9673b5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/05438776aabd8fde.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d1e7e4bc1945f181.png)

还是为了反便阅读，我使用jadx把代码截下来给大家：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/83224541972823a5.png)

我们猜测是在这里，然后我们一样在smali代码进行修改：

```kotlin
const v0,0x0return v0
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8721a4eb27126f44.png)

最后我们发现有三个账本以上了，于是app整体会员逻辑修改完成!

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/590f402754ef4258.png)

存在的问题：

1.App启动时页面是强制登录使用的，当然可以通过跳过登录Activity进行跳过，我也试了跳过，但是最后功能还是无法使用，也可能是我不才，可能望各位大佬进行尝试了。

2.后面我同学跟我说它手机号无法登录，提示md5码未配置，这个可能是签名校验什么的，我没有进行去签处理，但是邮箱登录没有问题，网上有很多临时邮箱可以使用。后面各位大佬有解决方法的话，希望可以不吝赐教！

最后：小弟也是初入Android逆向，很多地方不懂，写的不够明白，如果教程写的啰嗦望各位海涵，希望大家一起进步

|     |     |
| --- | --- |
|     |     |
