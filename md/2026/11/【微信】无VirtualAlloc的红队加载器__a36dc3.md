---
title: 【微信】无VirtualAlloc的红队加载器
source: https://mp.weixin.qq.com/s/C6fjosjh74-1EazvUAlutQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:55:40+08:00
trace_id: 03c6ad24-3699-4b02-90c4-a9f707b7af6e
content_hash: d90889f0467cc1a6dd0e01f685fe810258a8021b9a135b8e1daff9077d67db37
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-811d-b362-f305bbb16523
ioc: null
---

**安全天书** *2026年11月18日 09:00*

本文所涉及的技术、思路和工具仅用于本地靶场安全测试和防御研究，切勿将其用于非法入侵或攻击他人系统等目的，请务必在获得明确书面授权的环境下使用，并遵守相关法律法规，一切后果由使用者自行承担！！

项目介绍

在STHACK 2026（https://www.youtube.com/watch?v=alRgpv-czyk）中演示的壳码执行技术。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8d7667b0cc0cd2ac.png)

GitHub地址：

```javascript
https://github.com/whokilleddb/3lkToShell
```

注意：请勿利用文章内的相关技术从事非法测试，由于传播、利用此文所提供的信息而造成的任何直接或者间接的后果及损失，均由使用者本人负责，作者不为此承担任何责任。工具来自网络，安全性自测。

**红蓝偶像练习生小圈子**

**更多工具思路文章请加入纷传，圈子主要研究方向渗透测试、红蓝对抗、钓鱼手法思路、武器化，红队工具二开与免杀。圈内不定期分享红队技术文章，攻防经验总结以及自研工具与插件，目前圈子已满400人，欢迎各位进圈子交流学习！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f8fedc7462701bce.jpg)

****圈子目前更新相关技术文章：****

-   ******HeavenlyBypassAV内部版工具-轻松免杀各大杀软******
    
******-   HeBypassAV内部版Patch免杀工具-轻松绕过杀软EDR
    
-   Heavenly自动化红队后渗透工具免杀生成器
    
-   Heavenly白加黑自动化生成免杀工具
    
-   HeavenlyProtectionCS内部CS插件
    
-   Heavenly专版Linux免杀工具
    
-   冰蝎webshell免杀工具
    ******

******

-   哥斯拉webshell免杀工具
    
-   红队场景下lnk钓鱼Bypass免杀AV
    
-   Frp免杀隧道工具
    
-   1day和0dayPOC
    
-   lnk钓鱼思路视频讲解
    
-   lnk钓鱼Bypass天擎
    
-   msi钓鱼
    
-   chm钓鱼
    
-   Kill360核晶
    
-   AV对抗-致盲AV（核晶）
    
-   捆绑免杀360
    
-   Kill火绒
    
-   火绒6.0内存免杀
    
-   kill-windows Defender
    

-   Defender分离免杀
    
-   Defender知识点
    
-   EDR对抗思路
-   进程注入知识点
    

-   自启动思路
    
-   **多种维权手法**
    

-   Fscan免杀核晶
    
-   QVM解决思路
    
-   红队思路-钓鱼环境下小窗口截屏窃取
    
-   免杀Todesk/向日葵读取工具
    

-   渗透测试文章思路
    
-   内网对抗文章思路
    
-   **还有更多红队工具文章！期待您的加入！！！**
    

******

**往期推荐**

********

**[安全天书免杀课来袭｜助力实战免杀钓鱼(文末送福利)](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485167&idx=1&sn=7ab4393e75cf94d13cb79e22b92fb8d0&scene=21#wechat_redirect)**

**[【红队工具】攻防后渗透工具自动化免杀！！！](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485305&idx=1&sn=3b4c50d0f88a753089767db5304b6626&scene=21#wechat_redirect)**

**[【红队工具】红队内网后渗透CobaltStrike插件更新](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485006&idx=1&sn=e3bcf2070226fcfc93b565ae2c9d85ad&scene=21#wechat_redirect)**

**[免杀更新--Heavenly自动化生成白加黑3.0](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485679&idx=1&sn=991c111e2627ec8835dc13b8bc919eb3&scene=21#wechat_redirect)**

**[绕过360安全卫士实现维权](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485280&idx=1&sn=467194cdf681646597a84e7f08b638bf&scene=21#wechat_redirect)**

********
