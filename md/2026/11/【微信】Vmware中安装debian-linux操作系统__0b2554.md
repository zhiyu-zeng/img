---
title: 【微信】Vmware中安装debian linux操作系统
source: https://mp.weixin.qq.com/s/Y4N5hez5GusIyUbOH6kjjA
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:28:14+08:00
trace_id: 5a6aeffa-2222-4a39-aeee-3f3585aaa88a
content_hash: 2ef99dceb108d6ff175daacc2a2a951cfa088d578b3726763699956fa3f73713
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 34
  succeeded: 34
  failed_urls: []
notion_page_id: 41175244-d011-8109-a079-d6d75acbba1b
ioc: null
---

**龙鱼鱼安全实验室** *2026年11月6日 18:13*

Debian 由免费和开源软件组成,任何人都可以免费使用、修改和分发。许多流行的Linux发行版,如Ubuntu、Knoppix、PureOS、Tails都是基于Debian。同时它也是最古老的linux操作系统之一。

一，准备工作，确保系统中已经安装了Vmware软件，下载debian镜像。

1.vmware软件

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40b8009603f9a79b.png)

2.debian linux镜像下载

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6928ccd170fa533b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1edca48d18886a93.png)

二，debian系统的安装

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40d90a12b165d46d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/05b945d9f2487bd4.png)

1.新建虚拟机

2.选择典型

3.稍后安装镜像

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/816d6dad46a333d3.png)

4.选择要安装的系统linux类型

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1b3db32b5ce2a044.png)

5.填写系统名称，自定义系统的存放位置

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7fbece575a6672bb.png)

6.定义系统大小，此处设为40GB

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1181a89e9a4e0020.png)

7.自定义系统配置

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4bfe9728fa74dcf7.png)

8.设置硬件配置，选择镜像的位置，导入镜像。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cb0b732610279ef5.png)

8.准备启动系统进行安装

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/844668613ccea243.png)

9.选择第一个，回车确认

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0d5674e61b21868c.png)

10.选择中文简体，点击continue继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f754750de0c3cc07.png)

11.选择中国，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e579afc3ff5f07d.png)

12.选择汉语，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aea33cecc5ce6671.png)

13.填写主机名，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a1caef4307d2de65.png)

14.填写域名，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1a61514efae80bfe.png)

15.设置root密码，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/89c29767f69accc5.png)

16.添加新的用户名，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ccb20d005937360.png)

17.为新添加的用户名设置密码，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4db663fc2cc00dc1.png)

18.对磁盘进行分区，这里默认使用整个磁盘，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ca42157dc110e3dc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/625b9ad510facb49.png)

19.点击继续

20.默认第一个，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bf76769505ed9b28.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e8d94b65f0f9f35.png)

21.点击继续

22.选择是，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/393f921d70d29971.png)

23.选择否，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b9eadf67058e2667.png)

24.选择否，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/068d9c5bb93d7870.png)

25.选择否，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dc339a17abf152f9.png)

26.选择要安装的软件，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/51eca2c1b0e9d507.png)

27.选择是，点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/565e159b2b098e54.png)

28.选择第二个/dev/sda,点击继续

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/40af201291bfde93.png)

29.点击继续，重新启动系统

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b829850668c474ad.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c244bebd9bd680ff.png)

30.安装完成
