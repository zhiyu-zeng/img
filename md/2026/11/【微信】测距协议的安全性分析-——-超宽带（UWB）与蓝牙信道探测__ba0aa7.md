---
title: 【微信】测距协议的安全性分析 —— 超宽带（UWB）与蓝牙信道探测
source: https://mp.weixin.qq.com/s/oTkWCQJUus0jGiUztR2Syg
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T08:50:02+08:00
trace_id: bf49e088-12c4-4f83-9e3e-7329ccbd1890
content_hash: 80b2ba15a7d0113f81bf16ba580ae97be44121335f9cbd24d9d198c92f94e2d4
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 39
  succeeded: 39
  failed_urls: []
notion_page_id: 41275244-d011-81f5-8c41-cc0bb731fa3d
ioc: null
---

**IoVSecurity** *2026年11月8日 08:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7ff397e7e4cd443a.gif)

点击上方蓝色字体，关注我们

**/** ****技术交流群**** **/**

添加微信13918880149\\ **15021948198(好友已满），申请会员下载ppt & 加入网络信息安全、测试评价、汽车电子、自动驾驶、智能机器人、智能船舶、超级高铁、飞行器、招聘求职、投融资合作群...**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee8c63af3946f57d.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db8c140220a85765.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6bf97f4189489669.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c44a763bcddcd54.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2d90eb2ebc341d4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b5a60d8868cdca5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/66d0811f7f238ea3.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4796c7fa56730aaa.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/06122acebda89714.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24b8758d492aac23.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5b4b437fa87c57e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2dd3f4586a2be9a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a4fd1fa7f8e39e9f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3c0715962bc8fb2d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d8246748b55ada1b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59792614c53769a0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ecc79afe0cd813b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8715c46dc99bfa52.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b3fedc06d5d47d66.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13707bfe05f14763.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d5c2ef8961e421c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6183725f95a376aa.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dfe36e13ffe05120.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e920e8f1d47b3be8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/361a94bd80626c17.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb04b691d877b355.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b7dca0cb41a6840f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/16cec4fe3ab60a44.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c4c386c4cddfe78f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33cb1d1934e7305d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c156d3bee1a4f8c4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2602620e4981bcb6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/913d83c95c63fba2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d133baf70e090adc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7f952591da96d02b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13a9be08016c5110.png)

相关文章

## 整车信息安全设计对车企的挑战与一汽奔腾的应对

## 智能网联汽车安全测评的中国方案与实践

## 国强标下智能网联汽车信息安全检测解决方案

加入行业交流群

获取合作机会

更多精彩

关注“ **IoVSecurity** ”

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/754d1de3c1d69135.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dbb95c508b0ebd75.webp)

点个 在看 你最好看
