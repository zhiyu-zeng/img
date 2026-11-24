---
title: 【微信】攻防钓鱼演练工具推荐篇2——apollofish
source: https://mp.weixin.qq.com/s/5EafziSGJdNnOND9vdMX6Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-24T15:36:11+08:00
trace_id: 5d06f3d4-6709-4e10-93f2-ea68a3523bf9
content_hash: d59b693d53258b8244773692351f6c9a24002b4a1eb05298393dc942108621e5
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 42275244-d011-811c-95f7-d8fc93db8257
ioc: null
---

**满天星星的AI+红队梦** *2026年11月23日 12:16*

声明

文中涉及到的技术和工具，仅供学习使用，禁止从事任何非法活动，如因此造成的直接或间接损失，均由使用者自行承担责任

前言

接上一篇的钓鱼工具分享，功能会比前面分享的多一些哈，分享一个国内大佬们开发的工具——apollofish

项目地址：

```bash
https://github.com/safe1024/apollofish
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38354535bcdb1509.png)

部署好的页面长这样，可视化效果也会比较友好，也是中文的，可以优先部署和使用这一工具进行钓鱼演练。

网页模板

就是被钓鱼的人点击后跳转进入的页面，这个我们可以根据对应不同的目标来设计不同的页面来提高成功率

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49b31ea3064f637d.png)

也是支持预览的，主要是也是html的设计，同时工具是支持AI生成：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96495ff5880c9d54.png)

网页钓鱼

这里就是你自己vps服务器监听的地址，可以跟这个工具都部署在一个服务器上面

邮件模板

这个设计更简单了，可以贴近真实生活场景来设计一下，设计了一个快件带上编码的，我自己收到还以为是真的，真实性很强：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/584669f4ae8b94d6.png)

邮件钓鱼

这里就是任务的设置了，收件人也是第三步导入的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8e2bb51639c5598.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3992984b307ba3ab.png)

上钩记录

报告导出

可选择对应时间进行报告导出

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ddd947e55ca67114.png)

警示学习

还有一个警示学习的模板发送，整体还是方便使用的，可视化效果也不错

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/574d7999729c37ae.png)

最后

测试的目的旨在提高员工的网络安全意识，想提高成功率，首先就是发件人伪装和话术的伪装，以及邮件模板内容是否足够真实和拿捏人心，突破人心才能达到钓鱼成功的关键，这个工具也是多设计了一个警示学习非常不错。

喜欢就帮星星点点赞，转发一下吧！

收录于工具
