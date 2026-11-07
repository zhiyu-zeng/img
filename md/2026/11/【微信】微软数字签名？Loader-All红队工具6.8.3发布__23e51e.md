---
title: 【微信】微软数字签名？Loader All红队工具6.8.3发布
source: https://mp.weixin.qq.com/s/XkOMFjAblUrTRvhJD9_1nw
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T04:08:06+08:00
trace_id: 9e8c2822-3b00-48ff-9d9e-ee22fa5c568c
content_hash: 72a0412d40eb04a12049721e0f7b304af8573c9250ebf198894300a40eb00fe4
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41175244-d011-8101-a544-d23ce5244c2e
ioc: null
---

**白帽子安全笔记2.0** *2026年11月7日 22:48*

## 一、这是什么

LOADER ALL是一个网络安全红队工具，它将加载器、元数据克隆、投递封装、提权、工具编译等技术通过一个界面一键构建。

![LOADER ALL V6.8.3工具界面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db1dbca0b501454c.png)

LOADER ALL V6.8.3工具界面

> 红队工具普遍比较零散，导致在实战中需要反复找环境工具，效率低下且容易出错。LOADER ALL 把多种能力整合到一起，大幅降低使用门槛，让红队人员能够更专注于战术本身。

## 二、新增功能

1.本次新增一个LOLBin项目，具备微软数字签名，具备对红队有用的功能（执行代码）。

2.增加基础设施模块，用于临时文件托管测试。  

![基础设施](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7ce0e6c4c80b21bc.png)

基础设施

3.增加Maldev的多态编码项目，相当于无需密钥的编码shellcode，每次生成变体均不同，其自带解码器，因此可用直接使用。

![多态编码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b5018f6c8e2512cd.png)

多态编码

4.部分改动和多处细节精调等你发现。

## 三、工具获取

为防止滥用与外泄，工具内置序列号授权机制，一机一码。请仅在授权可控的环境中使用,技术本身没有立场，用对地方才有价值。

## 四、使用场景

1.在企业授权的攻防演习中，验证防守方的检测与响应能力  
2.理解各类加载技术的实现机制与运行过程  
3.在受控环境中测试安全设备的检出情况，用于优化检测策略

本文涉及方案仅限合法授权的安全研究、渗透测试用途，使用者须确保符合《网络安全法》及相关法规。具体条款如下：

1.  1\. 仅可用于已获得书面授权的目标系统测试；
    
2.  2\. 遵守法律法规，不得用于侵犯他人隐私或数据窃取；
    
3.  3\. 本人不承担因用户滥用本软件导致的任何后果。
    

使用即视为同意并接受上述条款。
