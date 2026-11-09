---
title: 【看雪】调用activity组件修改用户密码登录
source: https://bbs.kanxue.com/thread-293465.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-09T11:21:34+08:00
trace_id: b1987ac8-c3f2-4ec0-a004-576634605a94
content_hash: d57609103c45565f71ea08b8880d5bf4ee2dea2067456057f9a2ee6519a09f39
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41375244-d011-817c-9f25-c7413e7542ab
ioc: null
---

在登录中移某app的时候，设置手势密码登录，后续每次启动app都会让你输入手势密码登录。

登录前设置：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dae1f62f9bc755ec.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0c9d6a157b6091f8.webp)

查看app的AndroidManifest.xml文件，查看重置密码组件名称com.cmccit.loginmodule.ac.CreateGesturePasswordActivity

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4ccd657df455750b.webp)

直接通过am命令调用组件com.cmccit.loginmodule.ac.CreateGesturePasswordActivity来进行用户手势密码的修改

> am start -n com.greenpoint.android.mc10086.activity/com.cmccit.loginmodule.ac.CreateGesturePasswordActivity

am 是 Activity Manager（活动管理器）的缩写，是 Android 系统提供的一个命令行工具，用于管理和控制应用程序的组件（如 Activity、Service、Broadcast 等）。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f6d2c8316bd986d8.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/163d57290c0b158a.webp)

成功修改用户手势密码

漏洞原理及修复：

漏洞是缺少调用者身份校验和业务前置认证。光靠android:exported="false" 不足以防御通过 am start（adb/shell）或代理组件间接启动的攻击。在创建/重置手势密码之前，CreateGesturePasswordActivity 的 onCreate() 或 onResume()加入调用者身份和业务前置条件校验，并确保此状态通过服务端验证的 Token 传递，而非仅依赖客户端本地状态
