---
title: 【看雪】新手学逆向之某加速vip解锁
source: https://bbs.kanxue.com/thread-292929.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-09T18:58:03+08:00
trace_id: 29522428-dd24-4d99-a19a-1d7e9e9e7700
content_hash: 33fc9ecad104e87926fa53e85d564b11e7a7d3e66fa241b51c32cd9141ccec0a
status: synced
tags:
  - 看雪
  - Android逆向
  - Hook
series: null
feed_source: 看雪·Android安全
ai_summary: 通过搜索"立即开通"定位会员逻辑并 hook getUserType/getEndDate 把 VIP 期限改到 2099 年，但加速仍提示流量不足，说明会员状态与加速额度是两套独立校验。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3f475244-d011-8100-bc8d-de41dfb3d647
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过搜索"立即开通"定位会员逻辑并 hook getUserType/getEndDate 把 VIP 期限改到 2099 年，但加速仍提示流量不足，说明会员状态与加速额度是两套独立校验。
> 
> - **入口定位：** 从字符串"立即开通"入手定位会员/开通相关代码位置。
> - **关键方法：** 追踪 `getUserType` 时发现与之配套的 `setUserType`，构成会员类型的读写对。
> - **Hook 受挫：** 分别尝试 hook `setUserType` 与 `getUserType` 均失败，未能直接改写入参或返回值。
> - **部分成功：** 追加 hook `getEndDate` 后，VIP 期限成功被改为 2099 年。
> - **遗留问题：** 首页点击加速仍提示"流量不足"，随后改为搜索"流量不足"并查找其调用处继续分析，说明额度校验与会员状态相互独立。

图还是不放了

搜索“立即开通”

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/06c05e0bb7e04668.webp)

追踪getUserType，发现getUserType与setUserType

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f6422e2eec64cc88.webp)

尝试hook setUserType失败了

尝试hook getUserType，也失败了

还有一个getEndDate，一并都hook了

hook到这里，vip期限已经改成2099年，但是首页点加速仍提示流量不足

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7efb02b9cf17e6f6.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ac15c08583c6edf.webp)

继续搜索“流量不足”

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/50deaaf114d49bba.webp)

查找调用

> 原帖后半部分需回复/点赞可见，未解锁
