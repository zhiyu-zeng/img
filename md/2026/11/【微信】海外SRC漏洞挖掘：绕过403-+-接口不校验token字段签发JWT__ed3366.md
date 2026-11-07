---
title: 【微信】海外SRC漏洞挖掘：\绕过403 + 接口不校验token字段签发JWT
source: https://mp.weixin.qq.com/s/v63HFMNS4Mkk25BLyixshQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T03:49:39+08:00
trace_id: 36dc69e7-d43d-4658-b52e-2b7f63334e0f
content_hash: edc6b7010922f29194a03685baa75d6e074c74761b943631e874127a47143d95
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41175244-d011-81f1-baab-fc0d2ae07da6
ioc: null
---

**狂做有氧** *2026年11月7日 17:36*

很久没有写东西了 根据平台规则 不能披露细节 见谅 说下思路

利用过程如下：

1\. 访问 /api/login-xx 403 利用\\绕过 访问 /api\\login-xx 400

2\. 发送 '{"login":"任意邮箱","token":"任意值",...其他字段}' 返回带jwt字段的json

3\. 利用返回的jwt从/api\\login-aaa换取登录cookie

4\. 利用其他的正常业务接口可以做的操作：全量PII 水平越权敏感信息读写

技巧:

curl的 --path-as-is 选项可以绕过路径规范化 用来测试接口比较好使

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c8172d091e9a5f4c.png)
