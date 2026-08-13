---
title: 【看雪】dwm反截图
source: https://bbs.kanxue.com/thread-291798.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-13T12:13:33+08:00
trace_id: 6968e247-d04f-4d5f-bc0e-c28d39dd6faa
content_hash: dc7d0c09ee315caa5b593edbba676f751f4c96d11675361195a0c5a49774ef9d
status: synced
tags:
  - 看雪
  - Windows逆向
  - Hook
series: null
feed_source: null
ai_summary: 一种DWM反截图实现可骗过dwm-screen-shot截图，但针对它的绕过方案也已出现。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3bb75244-d011-81a4-9a0c-efa157db1727
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一种DWM反截图实现可骗过dwm-screen-shot截图，但针对它的绕过方案也已出现。
> 
> - **实现思路：** 通过自己创建一份纹理，Hook `copyres` 后替换纹理，从而让DWM截屏拿不到真实画面。
> - **附件佐证：** 页面附带 `dwm.zip`（1.96MB，33次下载），应是该反截图开源工程。
> - **兼容性风险：** 有网友反馈在 Win11 23H2 下无法绘制，可能存在系统版本兼容问题。
> - **替代方案：** 另一网友称用独立团 game-ec 里的驱动即可实现不被 DWM 截图到。
> - **过时预警：** 评论认为纹理替换法已过时，如今更常见的是调用 N/A 卡的接口截图；逆向 AXE 的 shellcode 可分析出绕过方式，且该 shellcode 未混淆。

我发现了一个dwm可以过dwm-screen-shot开源项目截图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e7f0c712898a8a77.webp)

* * *

## 评论

> **高端编程牛马 · 2 楼**
> 
> 我的建议是 把蠕虫病毒清理下。。。另外它在win11 23h2下 无法绘制

> **我的研究 · 3 楼**
> 
> 这个我用独立团的game-ec里的驱动 就能搞定不被dwm截图到

> **wx\_垃圾债券之王 · 4 楼**
> 
> 1\. 建造一份纹理 2. hook copyres 3.替换纹理

> **wx\_垃圾债券之王 · 5 楼**
> 
> > [wx\_垃圾债券之王](https://bbs.kanxue.com/user-915202.htm) 1. 建造一份纹理 2. hook copyres 3.替换纹理
> 
> 另外这种截图方法已经过时 最新方式是调用N/A卡的接口截图 自己逆向AXE的shellcode简单分析下就可以过 shellcode并未混淆

## 附件

- [dwm.zip](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/08/fdd7efdc34ff84f1.zip) （1.96MB，33次下载）
