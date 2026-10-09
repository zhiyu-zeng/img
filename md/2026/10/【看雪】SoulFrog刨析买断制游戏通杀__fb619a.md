---
title: 【看雪】SoulFrog刨析买断制游戏通杀
source: https://bbs.kanxue.com/thread-293140.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-10T00:06:37+08:00
trace_id: 9525cfaa-54a5-4c45-90e3-d0c6d71cf224
content_hash: 7e18d71cdfb866073efa885617d5623ec2d2397eea683ed2721918ae33f9d3ba
status: synced
tags:
  - 看雪
  - Android逆向
  - Hook
series: null
feed_source: 看雪·Android安全
ai_summary: 通过 Hook 好游快爆等平台的买断制校验 SDK，直接反射调用成功回调 `onAllowEnter()`，即可通杀本体验证与 DLC 校验。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-817b-b391-f99b129b16ea
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 Hook 好游快爆等平台的买断制校验 SDK，直接反射调用成功回调 `onAllowEnter()`，即可通杀本体验证与 DLC 校验。
> 
> - **核心入口：** 静态方法 `HykbPaidChecker.checkLicense(activity, appId, publicKey, orientation, listener)`，其中 listener 是关键回调对象。
> - **绕过手法：** Hook 该方法后取最后一个参数（`HykbCheckListener` 实例），反射调用其 `onAllowEnter()` 强制返回成功，方法本身返回 null。
> - **回调定义：** 接口包名为 `com.m3839.sdk.paid.HykbCheckListener`，含 `onAllowEnter()`（放行）与 `onReject(int code, String errorMsg)`（拒绝）两个方法。
> - **配套伪造：** 同时 Hook `getUser`，当用户名信息为空时反射构造假用户对象返回，避免空值导致后续逻辑异常。
> - **覆盖范围：** 模块号称对好游快爆、TapTap 等多款买断制游戏（含 DLC）版本通杀，并支持支付免跳转、激励广告、会员功能、去水印等场景；激励广告通杀代码暂未开源。

> 本文仅作 **技术研究学习**，请勿用于破解、绕过付费验证等侵权行为，任何违规使用产生的法律责任由使用者自行承担。

## 一、SDK 接口文档梳理

根据文档，核心校验入口为 `HykbPaidChecker.checkLicense()` 静态方法。

### 1\. 方法签名

```python
HykbPaidChecker.checkLicense(activity, appId, publicKey, orientation, listener);
```

参数说明：

| 参数  | 作用  |
| --- | --- |
| activity | 当前页面 Activity 上下文 |
| appId | 开发者在平台申请的应用 ID |
| publicKey | 平台分配的公钥，用于签名校验 |
| orientation | 屏幕方向，0 横屏，1 竖屏（SDK1441 + 支持） |
| listener | `HykbCheckListener` 回调监听器， **核心回调对象** |

### 2\. 回调监听器 HykbCheckListener

## 二、Hook 思路与代码分析

目标：拦截 `checkLicense` 调用， **绕过 SDK 内部校验，直接触发 `onAllowEnter()` 成功回调**，同时补充 `getUser` 接口伪造用户信息。

### 核心思路

1.  Hook `HykbPaidChecker.checkLicense` 方法；
2.  获取传入方法的最后一个参数： `HykbCheckListener` listener 实例；
3.  直接反射调用该实例的 `onAllowEnter()` ，强制触发成功回调；
4.  同时 Hook `getUser` 方法，当返回用户信息为空时，反射构造一个假的用户对象返回。

### 源码片段

```python
Class<?> hykbCheckListener = classLoader.loadClass("com.m3839.sdk.paid.HykbCheckListener");
Method onAllowEnter = hykbCheckListener.getMethod("onAllowEnter");

for (Method method : hykbPaidChecker.getDeclaredMethods()) {
    if ("checkLicense".equals(method.getName())) {
        xposedModule.hook(method).intercept(chain -> {
            Log.d(SoulFrog.TAG, HookUtil.getMethodSignature(chain));
            Object originalListener = chain.getArg(chain.getArgs().size() - 1);
            onAllowEnter.invoke(originalListener);
            return null;
        });
                                break;
    }
}
```

包名： `com.m3839.sdk.paid.HykbCheckListener` ，里面包含两个回调方法：

1.  `onAllowEnter()` ：校验成功，允许进入游戏
2.  `onReject(int code, String errorMsg)` ：校验失败，返回错误码和信息

* * *

## SoulFrog 开源免费

SoulFrog项目地址

-   Xposed 版本：master分支
-   LibXposed 版本：libxposed分支 \*

如果本项目对你有帮助，欢迎点 Star，在评论区留言一句好用即可；LSPosed 模块仓库也欢迎 Star。  
Hook点基本都是公开的，激励广告通杀相关代码暂不开放，Star数量达到目标后考虑开源。  
SoulFrog有不懂的想了解具体的hook点思路可以评论咨询我，有空可以解答一下，代码简单一般都是能看懂的，也可以直接问ai。  
那些嵌套hook的部分只是为了查看方法签名以及调用信息，改成动态代理就行了。  
都是一些没有技术含量的，但也能学到点一些东西吧。

| appName | function | packageName |
| --- | --- | --- |
| 支付 宝 | 免跳转内购通杀(仅本地验证) | \-  |
| 好游 快爆 | 买断制下载(仅下载管理) | \-  |
| 小 黑盒 | 每日自动完成任务 | com.max.xiaoheihe |
| 激励广告 | 部分激励广告通杀(手动点击跳过领取奖励) | 例如biubiu加速器 |
| QQ分享 | 分享直接成功无需跳转QQ | \-  |
| 爱 剪辑 | 会员功能 | com.shineyie.aijianji |
| 飒 漫画 | (使用会自动删除数据，请慎重使用)默认游客三天自动重置试用白金会员 | com.comic.isaman |
| 神奇 脑波 | 会员功能（版本通杀） | imoblife.brainwavestus |
| ES 文件 浏览器 | 会员功能（版本通杀） | com.estrongs.android.pop |
| Sd Maid SE | 会员功能（版本通杀） | eu.darken.sdmse |
| 腾讯 视频 | 去水印 | com.tencent.qqlive |
| 人人 视频 | 会员功能 | com.example.pptv |
| Tik Tok | 地区检测 | com.zhiliaoapp.musically |
| Reader | 全章节内容解锁 | com.originatorkids.EndlessReader |
| 好游 快爆 | (本体验证+DLC)买断制游戏（版本通杀） | \-  |
| Tap Tap | 列举部分（本体验证+DLC）买断制游戏（版本通杀） | \-  |
| 鬼谷 八荒 | (本体验证+DLC) | com.guigugame.guigubahuang |
| 大侠 立志传 | (本体验证+DLC) | com.xd.dxlzz.taptap |
| 破门 而入 | (本体验证+DLC) | com.khg.actionsquad.gamet |
| 打造 世界 | (本体验证+DLC) | com.dekovir.CraftTheWorld3839 |
| 潜水员 戴夫 | (本体验证+DLC) | com.xd.dave.tap.cn |
