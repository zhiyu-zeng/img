---
title: 如何一夜之间成为 Vulfocus 榜一大哥 | 素十八
source: https://su18.org/post/fuck-vulfocus/
source_host: su18.org
clip_date: 2026-09-08T18:03:24+08:00
trace_id: 7391ff82-2c9e-4e39-8c75-d72cdf1fc39b
content_hash: c40a2a16f0e392e47a853207899855149a84d00542d92fcf8e3a57eb49af973f
status: synced
tags:
  - CTF
  - 协议分析
series: null
feed_source: 素十八 su18
ai_summary: Vulfocus 靶场可在不完成漏洞攻击的情况下，利用“验证模式”反弹 Shell 后在模式切换生成 flag 的时机直接读取，并用接口自动化一晚刷上积分榜第一。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3d575244-d011-8108-8cab-c493602921c4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Vulfocus 靶场可在不完成漏洞攻击的情况下，利用“验证模式”反弹 Shell 后在模式切换生成 flag 的时机直接读取，并用接口自动化一晚刷上积分榜第一。
> 
> - **漏洞成因：** 靶机 flag 并非写死，而是动态生成，存放在环境变量和 /tmp 目录；学习模式启动会 touch 生成 flag，切到验证模式会清除，说明该切换只是执行 rm/touch，而非强制重启容器。
> - **绕过思路：** 先用验证模式启动靶机（此时无 flag），通过虚拟终端反弹 Shell 到 VPS；再切换回学习模式，平台动态生成 flag，攻击者利用仍存活的反弹 Shell 直接读取即可提交。
> - **公告情况：** 作者表示这是平台内部已知问题且曾修复过“验证模式获取 flag”路径，但为不破坏用户体验，模式切换未强制容器重启，导致反弹 Shell 绕过仍可复现。
> - **自动化流程：** 调用启动靶机、获取状态、切换身份、WebSocket 虚拟终端、提交 flag 等接口；每用户最多同时启动 3 个镜像，单个靶机平均 40 秒完成，失败则关闭容器重跑。
> - **结果与提醒：** 作者用 Java/Hutool 编写自动化工具挂 VPS 跑一晚，成功登顶榜单；同时认为榜单其他前排用户可能用了类似手段，刷榜后台可识别且无实际意义。

## Ⅰ. 前言

白帽汇的转正要求有很多，其中一条就是完成 50 个 Vulfocus 靶场的攻击，获取 Flag 并提交。这样普普通通甚至没什么太大难度的一项任务，有什么值得一提的呢？网上下个工具，同类型的漏洞批量打一下，不就完成了吗?

先不要急，且听我慢慢道来。

## Ⅱ. 简介

Vulfocus 全称 “Vulfocus 漏洞威胁分析平台”，是白帽汇推出的一款漏洞集成平台，这类平常通常被白帽子们称之为漏洞靶场。

官网地址： [https://vulfocus.cn/](https://vulfocus.cn/)

这个就不过多的文字介绍了，业内的伙伴们都知道这是一个什么东西，通俗来说，我们使用虚拟化的容器来快速搭建带有指定漏洞的环境，用来进行漏洞的研究、学习、复现。

对于一个这样的平台，其核心可以说并不是其平台本身，平台仅是一个流程上的串联和覆盖，以及对前端用户体验的内容，目前 Vulfocus 没有花太多的精力做用户体验的相关工作。而且平台在 Github 有开源版本： [https://github.com/fofapro/vulfocus](https://github.com/fofapro/vulfocus)

那么核心是什么呢？是其对漏洞环境、漏洞利用方式等等安全学习相关的内容的覆盖度和广度，因此也可以说其核心则是其中的 docker 环境。

Vulfocus 的 docker 仓库： [https://hub.docker.com/u/vulfocus](https://hub.docker.com/u/vulfocus)

心细的你如果仔细看一下 docker 仓库中的内容，以及 dockerfile，你会发现，其中相当一部分镜像来源于 vulhub。这个也无需介绍，官方网址： [https://vulhub.org/](https://vulhub.org/)

其实 Vulfocus 之前我也在 Twitter 为其打过广告，当时 Vulfocus 推出“工作台”功能，但是通过在线人数的波动来看，并没有吸引到很多的人来使用，因此这里再简单介绍一下相关的功能。

## Ⅲ. 功能

## 1\. 首页

首页点开就是靶场的展示页面，可以根据规则查询相关类型的靶机。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3f682431bd961458.png)

可以直接点击启动，会启动指定的虚拟化环境，开箱即用，启动后，详情页面会展示启动虚拟环境虚拟化的 IP 地址，以及在公网的 IP 地址映射，下方有 Flag 提交输入框，在使用攻击手段获取靶标内的 Flag 后，可以在此处提交，完成靶标的攻击。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e37678686ab9ea6d.png)

在右侧，还有 writeup 功能，有其他的白帽子提交的针对此靶场的 writeup，可以查看参考。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/be934880ba9ed539.png)

## 2\. 用户

用户一栏展示用户相关操作内容。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d9ed3e697898d97e.png)

## 3\. 积分

积分这里是一个用户的总积分榜，给分高的朋友装逼用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1cdb3d9abf629b25.png)

## 4\. 场景

场景是在多个环境组成的大环境下行程的复杂路径，可以用来练习漏洞组合、内网渗透等等攻击手段。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ce68d58ba7982f04.png)

## 5\. 身份

身份切换功能，可以说是 Vulfocus 的一大亮点，也是其他同类产品所不具有的功能。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/701ef4dc905c56b1.png)

在使用 Vulfocus 时，用户存在两种身份，一种是学习模式，一种是验证模式。

学习模式就是在正常使用时的“夺旗”模式，白帽子通过黑盒攻击获取 flag，完成夺旗；而验证模式则是白盒攻击，在此模式下，白帽子可以使用虚拟终端打开一个 shell 连接，可以动态在靶机上执行命令，从而白盒调试漏洞，查看自己的攻击 payload 对目标服务器上的影响。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6917fce3c8bbc68c.png)

## 6\. 工作台

工作台目前说白了就是可以使用一个在线 kali。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9a39808887978de2.png)

但是此 kali 与所有的漏洞靶机镜像处于同一个网内，可以直接在内网反弹 shell。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13c1dfcb6fd1d6ec.png)

并且还支持操作的录屏及分享，在工作台刚出的时候，正赶上 S2-062 的爆发，我还录了一个演示的视频。

链接： [https://vulfocus.cn/#/playback/544f246827694405868d341afec51548](https://vulfocus.cn/#/playback/544f246827694405868d341afec51548)

## Ⅳ. 绕过

什么？绕过？漏洞靶场怎么绕过？

Of course~ 在简单介绍了相关的内容后，接下来说下本文的内容：绕过攻击过程直接拿 flag 的手段。

Vulfocus 靶机中的 flag，并非写死在靶机中，而是动态生成的，在两处位置存放，一个是在环境变量中，一个是在 `/tmp` 目录下。

目前经过测试，有以下集中情况：

-   以 `学习模式` 启动的话，会在靶机内生成 flag；
-   以 `验证模式` 启动的话，不会在靶机内生成 flag；
-   从 `学习模式` 切换到 `验证模式` ，会清除靶机内的 flag；
-   从 `验证模式` 切换到 `学习模式` ，会在靶机内生成 flag；

那 flag 究竟是怎么生成的呢，这里我通过在开源的版本中搜索 flag 关键字发现了如下代码

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/98bccfa69f9f3175.png)

发现其生成模式是在 docker 镜像中动态执行了 touch 命令创建 flag 文件。既然生成 flag 是 touch，那清除 flag 会不会是 rm？

而从 `学习模式` 到 `验证模式` 的模式的互相切换，是不是就是动态执行了 touch 及 rm，来对 flag 进行管理？

有了上述的知识描述后，就有了无需做题进行获取 flag 的思路:

-   先使用 `验证模式` 启动靶机，此时机器内无 flag；
-   进入 `验证模式` 的虚拟终端，执行系统命令反弹 shell 出来；
-   从 `验证模式` 切换到 `学习模式` ，此时会动态在靶机内生成 flag；
-   利用反弹出来的 shell 查看 flag。

理论存在，开始实践：

先启动一个镜像，切换到 `验证模式` ，打开虚拟终端，并反弹一个 shell。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d0caedec390bdb88.png)

在服务器上获得了反弹 shell。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bb11d07b56310f20.png)

此时切换到 `学习模式` ，按照我们的设想，此时应该会动态的生成 flag 文件，切换后，在反弹的 shell 中查看果然生成了 flag。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f29782714ef590ff.png)

## Ⅴ. 自动化

接下来看下自动化流程，这样的动作我不可能每个靶机做一次，肯定是要自动化的，首先是接口分析：

-   通过接口 `/api/images/xxx/start/` 启动靶机；
-   通过接口 `/api/tasks/xxx/get` 获取靶机状态，是否正常启动；
-   通过接口 `/api/update_user_identity` 切换用户身份；
-   通过地址 `/ws/docker/shell/` 进行虚拟终端的 websocket 通信；
-   通过接口 `/api/containers` 上传 Flag。

这里需要注意的是，针对镜像、容器，平台有 `image_id` 、 `container_id` 、 `real_image_id` 等多个不同的标识符，需要一一对应匹配。

然后是实现流程:

-   获取所有未提交 Flag 的靶机，排除启动慢的、不支持虚拟终端的、反弹shell（bash）有问题的；
-   启动靶机；
-   启动 VPS 监听端口（例如我用了 3306）；
-   切换验证模式，打开虚拟终端，执行反弹shell；
-   VPS 监听发现回连 shell，切换到学习模式；
-   VPS 监听执行 `ls /tmp | grep flag` ，读取 flag；
-   提交 flag，成功后自动关闭靶机；
-   如果上述某一个过程出错，删除启动的靶机。

还有一点需要注意的是，每个用户同时最多只能启动 3 个镜像，所以在自动化过程中要关注已经启动但由于某种原因无法执行流程的容器。

之后就是写代码了，有手就行。

## Ⅵ. 成果

来吧，展示：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b18d847d5d72b508.png)

上记录，平均 40 秒一个靶机：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/45eebca748b44295.png)

挂 VPS 跑了一晚上，最后，看看现在谁是榜一大哥了？

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6c3290dde3b5d5a6.png)

## Ⅶ. 后记

写这个工具也是突发奇想，本来用 python 写能更快的，但是主要是顺便学了一下 hutool ，感觉还是挺方便的，不知道为什么网上那么多人不推荐。个人觉得对初学者上手还是比较容易的。

链接： [https://www.hutool.cn/](https://www.hutool.cn/)

首先，这其实是一个内部已知的漏洞，而且内部已经对其进行了几次修复。

之前在 Vulfocus 与 Goby 联名做活动时，就跟相关负责人针对此问题进行了讨论，当时的绕过流程是：

-   从 `学习模式` 启动镜像，镜像带有 flag 信息；
-   切换为 `验证模式` ，进入虚拟终端，获取 flag 信息。

后来负责人进行了修复，在切换为 `验证模式` 时，清除相关 flag 信息，但是这次我们使用反弹 shell 的手段进行了绕过。

而事实上这种绕过手段相关负责人也早就已知，目前的情况是，为了不影响用户体验，没有在切换模式的时候进行强制容器重启，因此反弹出去的 shell 依旧会有获取 flag 的能力。

而且，除了我之外，目前 Vulfocus 榜单前几名的用户，感觉也应该是利用了类似的手段进行刷榜，因为他们的排名都是突然上来的。其实是不是正常答题，在 Vulfocus 后台都能看的出来，而且刷榜没有实际任何意义，希望大家能自己调试，认真学习漏洞原理哦~

## Ⅷ. 结尾

前两天公司发了个证，说是凭此证海鲜自助、下午茶免费，有没有人来让我导一下的？

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b7ef58ee6c6bff1e.jpg)
