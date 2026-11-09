---
title: 【微信】杀毒软件成了后门：cPGuard更新通道被投毒
source: https://mp.weixin.qq.com/s/lvodruu7nCY-PUNBGSxj7g
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T10:26:20+08:00
trace_id: d0604845-0090-4395-9eb7-4e1091140053
content_hash: 56334eb78a42691f8269fea2192c8a9edf039c335462489f776682007f1c70c6
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41375244-d011-8190-ad8a-f0cf46eb90ea
ioc: null
---

**安全客** *2026年11月9日 08:00*

cPGuard更新通道被劫持，后门随官方更新推送到服务器。

11月2日凌晨2点06分，有人登录了OPSSHIELD的更新分发网络。用的是偷来的凭证，不是零日，不是越权，就是一组能用的账号密码。

从那一刻起，这家公司旗下cPGuard的更新通道，变成了攻击者的投递管道。

cPGuard是干什么的？它是装在Linux主机服务器上的一套防火墙加恶意软件扫描器。虚拟主机商、IDC、小型云厂商大量在用，因为它便宜、轻，能挡住常见的webshell和爆破。

也就是说，被投毒的那一批更新包，运行在管理员最信任的那批机器上——那些"有安全软件保护"的机器。

## 一、攻击者没写一行漏洞利用代码

先看时间线。

11月2日 02:06 UTC，攻击者用泄露的凭证进入OPSSHIELD的CDN分发网络。这个网络负责把cPGuard的更新包推送到全球客户的服务器。

进入之后，攻击者往更新流里塞了一个恶意脚本。凡是还在自动更新的机器，都把脚本拉下来执行了。

受影响的是cPGuard 5.88.12到5.88.19这几个版本。厂商在12小时内发现了异常并切断了投递，但按照OPSSHIELD自己的说法，这个响应速度"并不能证明脚本运行过的服务器上没有数据被转移"。

这句话是整件事里最诚实也最难听的一句。

## 二、那个脚本干了什么

脚本的目标非常明确，全部指向一台Linux服务器上权限最高的那部分东西。

它收集这些文件：/etc/shadow和/etc/passwd，也就是本地账号和密码哈希；root的MariaDB/MySQL配置文件my.cnf，里面有数据库的root口令；root的shell历史，很多运维会把云厂商的token、S3密钥顺手敲在命令行里；还有root的SSH授权文件和known_hosts。

收集完之后，它把文件暂存到/var/tmp下的一个隐藏目录，然后上传到OPSSHIELD自己的授权服务器上——用一个被攻陷的账号，等着攻击者回头来取。

用受害者的基础设施存受害者的数据，这一手很省事，也很难被发现，因为它看起来就是一次正常的授权校验流量。

除了偷数据，脚本还在机器上留了一个后门shell，路径是/var/tmp/.cpg91511_sh。

OPSSHIELD估计攻击者取走了32个文件，每个文件对应一台客户服务器。

32台。这个数字不大，但每一台都是虚拟主机商的核心节点，一台机器上可能跑着几百个客户站点。

## 三、为什么这次比一般的供应链攻击更难受

供应链攻击这几年听得多了，从SolarWinds到3CX到xz，套路大家也熟了：攻破上游，借信任往下推。

但cPGuard这次有个不一样的地方——被投毒的不是一个业务软件，是一个安全软件。

这带来两个后果。

第一，它绕过了所有人对"更新"这个动作的心理防线。运维看到"cPGuard更新到5.88.15"，第一反应是"安全补丁来了，赶紧装"。没有人会去审计一个杀毒软件的更新包，就像没有人会去检查门锁有没有被人换过。

第二，它落在的位置太好了。cPGuard跑在宿主机上，通常有root权限，能读所有文件，能改防火墙规则。攻击者不需要提权，不需要横向，一步到位就是最高权限。

还有一个细节值得注意：整个攻击过程中，攻击者没有利用任何软件漏洞。OPSSHIELD的原话是"使用了被泄露的凭证获取未授权访问"。

这是2026年最需要反复讲的一句话。防线崩塌的地方，绝大多数时候不是代码，是账号。

## 四、怎么确认自己中没中

先说版本。5.88.12到5.88.19之间，全部视为受影响。

查更新日志：

grep "Successfully updated" /opt/cpguard/logs/install_log

OPSSHIELD的建议很硬：只要在这份日志里看到过受影响的版本号，即使现在跑的已经是修复版，也要"按已被入侵处理"。

反过来说，日志不存在，不代表安全。日志可能被清过，也可能根本没记全。

再看后门文件：

ls -la /var/tmp/.cpg91511_sh

这个路径是已知的，但不要只查这一个。攻击者在/var/tmp下建过隐藏目录做暂存，这些目录也值得翻一遍。特别留意最近几天创建的、名字看起来像随机串的目录。

## 五、清理和轮换，顺序很重要

很多人的第一反应是"先升级"。升级是必须的，但不能只升级。

正确的顺序应该是这样。

第一步，先把所有cPGuard服务器升到5.88.25或更高：

cpgcli update --start

cpgcli --version

新版本会删掉后门脚本和暂存文件。

第二步，从一台可信的恢复环境里，重置root密码和所有本地账号的密码。注意是"从可信环境"——如果这台机器本身可能被动过，用它自己的passwd去改密码是不安全的。

第三步，轮换所有可能在shell历史里出现过的凭证。数据库口令、S3的Access Key、DigitalOcean的token、各种API secret。凡是root敲过的，一律作废重发。

第四步，替换/root/.ssh下的密钥对，并且到所有信任这把公钥的地方把旧的删掉。这一步经常被漏，因为很多人只管本机，不管对方。

第五步，翻一遍/root/.bash_history，看看有没有异常的登录记录、异常的命令。如果历史里有攻击者执行过的痕迹，那这台机器要按失陷主机处理，而不是按"打补丁"处理。

OPSSHIELD目前的说法是不建议整体重装服务器。这个判断可以理解——重装的成本太高，尤其对托管几百个站点的机器。但它也说了，调查还在进行中，"目前没有发现其他恶意活动"是初步结论。

如果这台机器上有客户的支付数据或者身份信息，要不要重装，这个决定不该由厂商替你做。

## 六、信任的边界在哪里

xz后门那件事之后，开源社区讨论过一轮"我们该信任谁"。cPGuard这件事把问题往前推了一步：连商业安全厂商的分发通道都能被一组泄露的凭证打开，那"可信更新"这个概念还剩下多少含金量？

答案不是"不要更新"，那是自杀。

答案是给"更新"这个动作加上验证。几个已经在做、也应该普及的做法：

更新包要有签名，客户端要验签，而且验签的根不能和分发通道放在同一个权限域里。这次攻击者进的是CDN，如果签名私钥不在CDN上，投毒的包根本过不了校验。

分发网络的管理账号必须和设备侧解耦，最好加上硬件密钥或者短时令牌，别让一组静态密码成为整条链的单点。

客户端要有"更新内容白名单"。安全产品的更新逻辑应该是确定的、可预期的，一旦出现新行为——比如突然去读/etc/shadow——本地就该拦下来。听起来讽刺，但一个杀毒软件不该有读取shadow文件的业务需求。

最后一条是组织层面的：给安全产品本身做资产分级。它比业务系统更值得保护，因为它站在更高的权限位置上。很多公司的CMDB里，cPGuard这种agent就是一串IP，没有责任人，没有变更记录，出事了没人说得清哪台装过。

32台服务器，12小时的窗口，一组被偷的密码。

这就是2026年一次供应链攻击的全部成本结构。攻击者付出的，可能还不如一次钓鱼邮件的准备时间长。而防守方要付的，是全部凭证的轮换、客户的解释、以及一个很难回答的问题：我们凭什么相信下一个更新包是干净的。

END

推荐阅读

[有人把欧洲超市的冷柜调到了50℃，这是第二个月了](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790689&idx=1&sn=2f92763396458e742d06a05ac48f53ff&scene=21#wechat_redirect)

2026-11-05

[![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fd11021941fb33c3.jpg)](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790689&idx=1&sn=2f92763396458e742d06a05ac48f53ff&scene=21#wechat_redirect)

[币安丢了63亿美元，问题出在一台工程师的笔记本上](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790688&idx=1&sn=1136e5e6f4f7cefe1f1a9f8cc51977ef&scene=21#wechat_redirect)

2026-11-04

[](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790688&idx=1&sn=1136e5e6f4f7cefe1f1a9f8cc51977ef&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/701be2217ba288fe.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1a214bce04d3e8b7.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/099da120efd4ed5c.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/25e1809ea5c8b60a.jpg)

[潜伏16年的UEFI漏洞：开机那几秒，你的所有防线都还没上线](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790661&idx=1&sn=1385c2dfcbcaf38e00737143ad75a02d&scene=21#wechat_redirect)

2026-11-02

[](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790661&idx=1&sn=1385c2dfcbcaf38e00737143ad75a02d&scene=21#wechat_redirect)

[【开放申请】企业可自查PHP2Shell漏洞了！](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790660&idx=1&sn=c8887a4395622a6bde214f35babd2f24&scene=21#wechat_redirect)

2026-10-30

[](https://mp.weixin.qq.com/s?__biz=MzA5ODA0NDE2MA==&mid=2649790660&idx=1&sn=c8887a4395622a6bde214f35babd2f24&scene=21#wechat_redirect)

**更多AI知识，请关注Aiker World社区**

漏洞 · 目录
