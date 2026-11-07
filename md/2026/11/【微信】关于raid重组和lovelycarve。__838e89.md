---
title: 【微信】关于raid重组和lovelycarve。
source: https://mp.weixin.qq.com/s/4vPArcSc-U3N6Hhrv0bD5w
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T06:16:17+08:00
trace_id: a8f1cdbe-8edb-4dd8-b3f6-5608c48f9940
content_hash: c6849eb96f3d6931f4b699ce0f84255292134aa40e8b3e3bca44f00f0528f59d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 41175244-d011-8183-a16c-eda6bdfe6998
ioc: null
---

**老皮的碎碎念念** *2026年11月7日 21:24*

起因是同事做了一套四川大数据的题，说看不太懂raid5重组，降级这个事，我说这个不简单吗，重组下然后挂载这种不是轻车熟路吗，然后就翻车，现在回顾一下翻车过程。

有佬已经写好了用lovelycarve的过程，我是懒得在这个电脑上再下载安装了，熟练打开火眼的raid重组工具。呃，没想到升级了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5cbe1380e7c25fde.png)

查询 ，左同步，1024扇区，ok，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/47b2f862d83000ad.png)

重组，这里有个坑让我踩上了，所有后面一系列的事从这里开始了。

去仿真，发现，这里可以直接挂raid镜像。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/38c6f42ecefc8019.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df0837e5a31a70ee.png)

于是把三块盘挂上raid5，启动，进去挂载，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/50e98752cee749c3.png)

？？？？

把重组生成的文件做为从盘挂载，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac003ac046964231.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68d73531f31bcf92.png)

依然如故。

改用ufs，一样

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/35b61b755391b519.png)

改用rstudio ，一样

真是sun dog！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c634ddeb5591eb9e.png)

忘了说一句，以上产生的镜像，用xway和7z都是能正常打开看见文件的，火眼也能正常分析。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/58f7a267f0ce8a44.png)

没奈何，我老实下载了lovelycarve，导出镜像挂载，一次成功，

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/01b962106ae71b49.png)

我不禁陷入了沉思。

根据早起王大佬的建议，我把几个镜像丢给trae分析。跑了20分钟后。

给出了如下结论：

\## 三个镜像表现不同的原因

1\. \`.dd\` （lovelycar生成）（唯一成功） ：无 MBR，ext4 超级块位于绝对偏移 1024，属于“整盘即文件系统”的布局，\`mount -o loop\` 直接按 ext4 识别；且文件长度与超级块声明的块数完全吻合，所有工具的大小/边界校验都能通过。

2\. \`5.dsk\` （ufs8.7生成）：数据 100% 正确，但生成它的软件把阵列容量算小了——每块盘少算 512KB（3 块合计正好 1.5MB / 3,072 扇区 / 384 个 4K 块），而数据本身并没有跳过这段偏移。结果就是：ext4 说自己有 784,128 块，文件只提供了 783,744 块， 文件系统比“设备”大 。凡是校验设备大小的挂载器/虚拟机都会拒绝（提示容量不符、无法识别等）；即使挂上，末尾 384 块也落在文件之外（这部分恰好全为 0）。注意这也是它与其他两份的唯一实质差异，所以“5.dsk 挂不了”不是数据结构问题。

3\. \`virt-mdadm-localhost.vmdk\` （rstudio生成）：R-Studio 输出时把整个阵列当成一个“分区卷”来处理，自动在 LBA0 写入合成 MBR，把阵列放在 1 号扇区： - 分区起点 LBA=1（不是 0/2048，属于非对齐起点），类型标成\`0x07 = NTFS\` ，而里面实际是 ext4； - 于是整盘挂载时在 1024 处看到的不是 ext4 超级块（超级块被推到 1536），识别失败； - 按分区挂载时，Windows/自动挂载器看到类型 07 会按 NTFS 去解析，也失败；Linux 需显式\`mount -t ext4\` 挂\`/dev/xxx1\` 。

？？？只有lovelycarve算对大小了？

那么，我深深信任的火眼又是咋回事呢，我又拿火眼的raid工具再次进行了一次操作，这时候，我发现了一个问题！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2efd3381e37b4e69.png)

条带大小，不是查询出来的数值，也就是说拖入镜像后参数没有自动生成，而以前的版本是自动生成的！

重新按照查询的数据生成镜像后加载成功！

推荐完lovelycarve（工具库又多一个必备工具）后，照例PUA一下春哥，让他改！
![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f1eaa8fd59a6c31e.png)
