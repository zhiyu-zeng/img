---
title: 新手学习UE逆向
source: https://fjqisba.github.io/2025/08/17/%E6%96%B0%E6%89%8B%E6%95%99%E7%A8%8B/%E6%96%B0%E6%89%8B%E5%AD%A6%E4%B9%A0UE%E9%80%86%E5%90%91/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:52:37+08:00
trace_id: a8c94ac7-004c-421a-9826-eed6f5695a5e
content_hash: f2024dce3311b47e6931d8c0e97fc0a733d323f36259e965c07d67db84d7cbbd
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-818a-b877-cae2860b8443
ioc: null
---

## UE游戏逆向记录

### 关于UE引擎的三件套

1.  **GUObjectArray** （最顶层）：包含所有UObject，包括所有World对象
2.  **GWorld**：指向当前活动UWorld对象的指针，这个UWorld对象本身也在GUObjectArray中注册
3.  **GName**: 字符串池，做逆向的应该不难理解。

## SDK封装

项目地址： [https://github.com/Encryqed/Dumper-7](https://github.com/Encryqed/Dumper-7)
