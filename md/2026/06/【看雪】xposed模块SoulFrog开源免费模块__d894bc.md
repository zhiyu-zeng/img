---
title: 【看雪】xposed模块SoulFrog开源免费模块
source: https://bbs.kanxue.com/thread-291803.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-27T23:24:27+08:00
trace_id: 62ff92f4-3a08-4f8b-9106-7929512c5708
content_hash: ef1bfc652485a16fe50fa44f00e1d48076b579f5c1213c37407488d9f1d66889
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 开源Xposed模块，通过Hook技术为多种安卓应用提供破解或增强功能。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38c75244-d011-8138-926c-d6edf20e59b1
ioc:
  cves: []
  cwes: []
  hashes: []
  domains:
    - com.xd.dave.tap.cn
    - com.zfast.xyz
    - github.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 开源Xposed模块，通过Hook技术为多种安卓应用提供破解或增强功能。
> 
> - **项目性质：** 一个使用Java及libxposed API的开源免费Xposed模块，作者自用分享，代码托管在GitHub，供学习交流。
> - **技术分支：** 提供两个版本分支，xposed分支基于原版Xposed API，libxposed分支使用新一代libxposed API。
> - **功能范围：** 支持超过25款安卓应用，涵盖通讯、工具、视频、游戏等多个类别。
> - **主要功能类型：** 包括解锁应用内购会员功能、去除视频平台水印、移除广告、重置软件试用期以及破解游戏的DLC与验证。
> - **使用声明：** 模块明确声明仅供学习与技术研究使用，禁止用于非法用途，作者不承担任何使用后果。

仓库地址https://github.com/Xposed-Modules-Repo/xmnh.soulfrog

很少见有Java使用libxposed api开源的项目，自用模块分享一下，可以点点Star，仅供学习交流

\### SoulFrog

xposed版本为master分支，libxposed版本为libxposed分支

本模块仅供学习与技术研究使用，请勿用于任何违反法律法规的用途。作者不对使用本模块造成的任何后果承担责任。

\### 目前支持功能

<table style="text-align: center;">

<tr>

<th>appName</th>

<th>function</th>

<th>packageName</th>

</tr>

<tr>

<td>QQ分享</td>

<td>分享直接成功无需跳转QQ</td>

<td></td>

</tr>

<tr>

<td>爱剪辑</td>

<td>会员功能</td>

<td>com.shineyie.aijianji</td>

</tr>

<tr>

<td>JuiceSSH</td>

<td>高级功能</td>

<td>com.sonelli.juicessh</td>

</tr>

<tr>

<td>神奇脑波</td>

<td>会员功能（版本通杀）</td>

<td>imoblife.brainwavestus</td>

</tr>

<tr>

<td>Now冥想</td>

<td>会员功能（版本通杀）</td>

<td>com.imoblife.now</td>

</tr>

<tr>

<td>ES文件浏览器</td>

<td>会员功能（版本通杀）</td>

<td>com.estrongs.android.pop</td>

</tr>

<tr>

<td>SdMaid</td>

<td>会员功能</td>

<td>eu.thedarken.sdm</td>

</tr>

<tr>

<td>SdMaidSE</td>

<td>会员功能（版本通杀）</td>

<td>eu.darken.sdmse</td>

</tr>

<tr>

<td>塔罗牌占卜</td>

<td>会员功能</td>

<td>taluo.jumeng.com.tarot</td>

</tr>

<tr>

<td>音频剪辑大师</td>

<td>会员功能</td>

<td>com.lixiangdong.songcutter</td>

</tr>

<tr>

<td>滴答清单</td>

<td>会员功能</td>

<td>cn.ticktick.task</td>

</tr>

<tr>

<td>爱奇艺</td>

<td>去水印</td>

<td>com.qiyi.video</td>

</tr>

<tr>

<td>腾讯视频</td>

<td>去水印</td>

<td>com.tencent.qqlive</td>

</tr>

<tr>

<td>人人视频</td>

<td>会员功能</td>

<td>com.example.pptv</td>

</tr>

<tr>

<td>ABC加速器</td>

<td>到期自动重置试用</td>

<td>com.zfast.xyz</td>

</tr>

<tr>

<td>快连加速器</td>

<td>到期自动重置试用</td>

<td>world.letsgo.booster.android.pro</td>

</tr>

<tr>

<td>APKPure</td>

<td>去广告</td>

<td>com.apkpure.aegon</td>

</tr>

<tr>

<td>TikTok</td>

<td>地区检测</td>

<td>com.zhiliaoapp.musically</td>

</tr>

<tr>

<td>Reader</td>

<td>全章节内容解锁</td>

<td>com.originatorkids.EndlessReader</td>

</tr>

<tr>

<td>好游快爆游戏</td>

<td>（本体验证+DLC）买断制游戏（版本通杀）</td>

<td></td>

</tr>

<tr>

<td>TapTap游戏</td>

<td>列举部分（本体验证+DLC）买断制游戏（版本通杀）</td>

<td></td>

</tr>

<tr>

<td>鬼谷八荒</td>

<td>（本体验证+DLC）</td>

<td>com.guigugame.guigubahuang</td>

</tr>

<tr>

<td>大侠立志传</td>

<td>（本体验证+DLC）</td>

<td>com.xd.dxlzz.taptap</td>

</tr>

<tr>

<td>破门而入</td>

<td>（本体验证+DLC）</td>

<td>com.khg.actionsquad.gamet</td>

</tr>

<tr>

<td>打造世界</td>

<td>（本体验证+DLC）</td>

<td>com.dekovir.CraftTheWorld3839</td>

</tr>

<tr>

<td>潜水员戴夫</td>

<td>（本体验证+DLC）</td>

<td>com.xd.dave.tap.cn</td>

</tr>

</table>
