---
title: 【微信】【安全圈】补丁打完才安全？WordPress 更新窗口正被抢跑
source: https://mp.weixin.qq.com/s/uUuF94ZIgBQzoCqW6Ea0tA
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T06:14:36+08:00
trace_id: 9a8e92cc-aad5-4650-bfb2-391f64496b16
content_hash: 0176e51f24117382a38f1890d05468cb03e63bf34c07c23c5ea7d4e296250b86
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
notion_page_id: 41175244-d011-8168-8bb2-f96dc211c308
ioc:
  cves:
    - CVE-2026-119977
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**安全圈** *2026年11月7日 19:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/830fccecd7453c2c.webp)

**关键词**

补丁

**核心事实**：CVE-2026-119977，CVSS 8.1，影响 WordPress 4.7 至 7.1.3。漏洞不在某个功能里，在升级动作本身——完整包更新会把新版本解压到 `wp-content/upgrade` 下的临时目录，里面带着安装器，Web 服务器通常能直接访问。无账号攻击者只要猜中目录名，在文件被删前跑通安装器，就能在服务器上执行代码。CISA 已把它列入 KEV 目录。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bfc159b6e746b072.jpg)

## 🔍 问题出在解压路径可预测

用完整包升级时，WordPress 会把新版本解开，放进 `wp-content/upgrade` 里一个临时目录。这份副本包含 WordPress 安装器，而且它就躺在 Web 根目录下。

-   **目录名可猜**
    
    ：在 5.9 及以上的站点，负责解压的旧代码会用下载文件名来命名这个目录，猜到文件名就等于猜到路径
    
-   **4.4 到 5.8 稍好**
    
    ：旧代码会给目录名加随机字符，除非站点自己通过报错信息等方式泄露，否则猜不到
    
-   **一枚账号都不用**
    
    ：整个链条不需要站点上的任何账户
    

## ⚡ 最讽刺的一段：装补丁的这次更新，跑的还是旧代码

补丁本身没问题——7.1.4 会给临时目录随机命名，也不再让临时副本里的 `wp-config.php` 覆盖正式文件。

但执行这次更新的，是站上本来就有的旧代码。它解包时仍按老规则命名目录。也就是说，升级到 7.1.4 的那一次，是目录名最后一次可被预测的机会。

攻击者卡进这个窗口，能做的不只是读文件。Picus Security 研究员 Umut Bayram 的复现路径是：用安装器给临时副本配一个自己的数据库，登进这套临时 WordPress，以 Web 服务器权限执行 PHP，再借它读写正式站点里的文件。等临时副本被删掉，痕迹也跟着没了。

开了后台自动更新的站点，修复会走同一套更新器、同一批步骤，同样会经历这个窗口。

## 🎯 数据：防火墙规则上线 9 分钟后就有攻击

-   **18,500+**
    
    ：Wordfence 在漏洞公开后的前 21 小时，记录到针对分阶段 `setup-config.php` 安装器路径的请求量
    
-   **12,632 次**
    
    ：最近 24 小时内被拦截的利用尝试
    
-   **14.5 小时**
    
    ：两个最活跃的攻击来源对少量站点反复探测的时长。Wordfence 认为这不是随便扫，是在蹲站点执行更新的那一刻
    
-   **数秒**
    
    ：实验室环境下窗口的实际持续时间。窗口短，但可反复蹲
    
-   **评分分歧**
    
    ：Wordfence 给出的 CVSS 是 8.1，WordPress 官方通告把它定为低危
    
-   **PoC 已扩散**
    
    ：本周起公开 GitHub 仓库里出现自称可利用该漏洞的代码，其中一份还声称对使用可预测目录的完整包更新同样有效。是否真的能打通，尚无结论
    

## 🛡️ 更新之前，先把那个目录从 Web 上摘掉

最省事的做法是直接禁止 Web 访问 `wp-content/upgrade` 。WordPress 是直接在这个目录上操作磁盘文件，封掉 HTTP 访问不会影响更新功能。

-   **Nginx**
    
    ：加 `location ^~ /wp-content/upgrade/ { deny all; }`
    
-   **Apache**
    
    ：在该目录的 `<Directory>` 段里写 `Require all denied`
    
-   **只能改.htaccess**
    
    ：在 WordPress 根目录的.htaccess 里，加在 WordPress 重写规则之前—— `RedirectMatch 403 ^/wp-content/upgrade/`
    
-   **别放错位置**
    
    ：不要把.htaccess 放进 `wp-content/upgrade` 里面。旧更新器在解包前会清空该目录，那时文件已经没了
    
-   **验证**
    
    ：请求 `/wp-content/upgrade/` 应当返回 403
    

## ✅ 另一条路：手动升级，绕开 Web 根目录

1.  备份站点文件与数据库
    
2.  在 Web 服务器不提供服务的目录里解压新版本，这样安装器根本没有可访问地址
    
3.  把核心文件覆盖到位，不要动 `wp-config.php` 和 `wp-content`
    
4.  执行数据库升级
    

注意，WP-CLI 的 `wp core update` 不能替代这一步——它调的是同一套更新器，解包到同一个目录。

## 📦 还在 4.6 及更早的站点

4.6 及更早版本已经不再收到安全更新，没有补丁可打。Bayram 说这个缺陷的源头能追到 2008 年的 WordPress 2.7，这些站点只能迁移到受支持的版本。

暂时升不上去、又停在受影响版本的站点，去日志里翻异常请求：指向临时目录下 PHP 文件的访问、带 `setup-config.php` 的路径、以及紧跟在更新动作之后的可疑 POST。

***END***

阅读推荐

[【安全圈】Chainalysis 被打穿：全体用户凭据泄露](https://mp.weixin.qq.com/s?__biz=MzIzMzE4NDU1OQ==&mid=2652079722&idx=1&sn=cbb0f9bdab2358a4b513dad213c41288&scene=21#wechat_redirect)
