---
title: 【微信】谷歌、Edge、firefox浏览器密码导出
source: https://mp.weixin.qq.com/s/oA1c3tCIVaU816vL4eAqdQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T15:15:00+08:00
trace_id: 81623970-1fe2-4fe8-ac21-51fcac27780d
content_hash: 89443fcce3f1860a99f9a0e07013df17590f03cd7f477fd536a6f384722f89f2
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 41475244-d011-81d8-aec5-f82e5808e453
ioc: null
---

**安全天书** *2026年11月10日 13:32*

本文所涉及的技术、思路和工具仅用于安全测试和防御研究，切勿将其用于非法入侵或攻击他人系统等目的，一切后果由使用者自行承担！！！

项目推荐

```javascript
https://github.com/xaitax/Chrome-App-Bound-Encryption-Decryption
https://github.com/moonD4rk/HackBrowserData
```

注意：这里浏览器密码导出工具有时效性，当前时间：26.11.09

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d4065f690c0a6a25.png)

HackBrowserData

GO语言编写的项目，一般GO语言编写的程序相对大一点，适合落地执行。但这项目落地肯定是报毒的，没杀软还好，有杀软的建议使用圈内的“自动化白文件Patch免杀后渗透工具”进行处理即可。

这里以360为例

落地执行就被秒了。现在使用圈内工具进行处理：

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a39c036a569b0e8.png)

处理后能够正常执行，放到360环境下进行验证！

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3514d36e4b5f9b91.png)

如上图可以看到导出成功，进行密码验证：

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a01da97944877ee6.png)

Chrome-App-Bound-Encryption-Decryption

C/C++的项目，那么这类语言编译的项目，无论是大小还是兼容性都会好一点。同样是可以落地加载执行，但更推荐通过CS内存加载执行，一般需要导出浏览器的机器，大部分是钓鱼上线或者横向运维机器，多半都是在C2上进行操作。

这里以火绒为例，落地被秒，正常情况。

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ed6145ce70c50e16.png)

```javascript
病毒名称：HackTool/W64.PwStealer.b!crit
病毒ID：93AE138445694994
```

HackTool告警，落地就被秒了，同样采用“自动化白文件Patch免杀后渗透工具”进行处理是可行的。但采用内存加载的方式不落地执行，那么就绕过查杀执行导出密码：

使用CS插件上的内存加载原生的Chrome-App-Bound-Encryption-Decryption项目发现会触发火绒的内存告警：

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0124cb1d3483211a.png)

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/10dd4db292230b82.png)

二开处理了下同时加入导出firefox浏览器的密码，重新验证导出密码，没有问题：

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9a6a60f51056ba9.png)

![0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/316a5df2b235ed45.png)

结语

编写文章当天edg浏览器又更新了，然后工具就失效了，得更新了一波，说明需要长期维护的过程！

相关文件已上传至圈子。

**红蓝偶像练习生小圈子**

**更多工具思路文章请加入纷传，圈子主要研究方向渗透测试、红蓝对抗、钓鱼手法思路、武器化，红队工具二开与免杀。圈内不定期分享红队技术文章，攻防经验总结以及自研工具与插件， **目前圈子已满400人，欢迎各位进圈子交流学习！****

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd012fe4807910b8.webp)

****圈子目前更新相关技术文章：****

**

-   ****HeavenlyBypassAV内部版工具-轻松免杀各大杀软****
    
****-   HeBypassAV内部版Patch免杀工具-轻松绕过杀软EDR
    
-   Heavenly自动化红队后渗透工具免杀生成器
    
-   Heavenly白加黑自动化生成免杀工具
    
-   HeavenlyProtectionCS内部CS插件
    
-   冰蝎webshell免杀工具
    ****

****

-   哥斯拉webshell免杀工具
    
-   红队场景下lnk钓鱼Bypass免杀AV
    
-   Frp免杀隧道工具
    

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
    

-   360自启动思路
    
-   **多种维权手法**
    

-   Fscan免杀核晶
    
-   QVM解决思路
    

-   渗透测试文章思路
    
-   内网对抗文章思路
    
-   **还有更多红队工具文章！期待您的加入！！！**
    

****

**

******往期推荐******

****

**[安全天书免杀课来袭｜助力实战免杀钓鱼(文末送福利)](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485167&idx=1&sn=7ab4393e75cf94d13cb79e22b92fb8d0&scene=21#wechat_redirect)**

**[Patch免杀0检测！！！绕过卡巴斯基、360、Defender、火绒等](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485194&idx=1&sn=e29a965863c59bbd26cf4b306d58301a&scene=21#wechat_redirect)**

**[【红队工具】红队内网后渗透CobaltStrike插件更新](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485006&idx=1&sn=e3bcf2070226fcfc93b565ae2c9d85ad&scene=21#wechat_redirect)**

**[绕过360安全卫士实现维权](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485280&idx=1&sn=467194cdf681646597a84e7f08b638bf&scene=21#wechat_redirect)**

**[免杀更新--Heavenly自动化生成白加黑3.0](https://mp.weixin.qq.com/s?__biz=Mzk0MDczMzYxNw==&mid=2247485679&idx=1&sn=991c111e2627ec8835dc13b8bc919eb3&scene=21#wechat_redirect)**

****
