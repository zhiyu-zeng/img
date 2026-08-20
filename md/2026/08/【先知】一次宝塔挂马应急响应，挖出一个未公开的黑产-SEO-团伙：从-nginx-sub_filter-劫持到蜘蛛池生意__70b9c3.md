---
title: 【先知】一次宝塔挂马应急响应，挖出一个未公开的黑产 SEO 团伙：从 nginx sub_filter 劫持到蜘蛛池生意
source: https://xz.aliyun.com/news/92709
source_host: xz.aliyun.com
clip_date: 2026-08-20T17:50:40+08:00
trace_id: 6b94a41f-ff3d-43b7-b479-66888ae5105f
content_hash: 66917a069833ef3eac339bacdef30b6d28697bc10d7d8aff26a4c133bab83a52
status: synced
tags:
  - 先知
  - 流量劫持
  - 黑产SEO
series: null
feed_source: 先知安全技术社区
ai_summary: 宝塔Nginx sub_filter劫持应急响应，挖出一个未公开黑产SEO团伙：既入侵服务器做搜索引擎劫持，又售卖蜘蛛池软件，基础设施曝光后可用IoC全网检测。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c275244-d011-81ce-92ee-d322db8d863b
ioc:
  cves:
    - CVE-2025-55182
  cwes: []
  hashes:
    - 13792427ab60437bafb55088e45e0e06
    - 36783bbed18dfe5e6429f1dbfbedfaa4
    - 60b9eff27f66975f19c6102404a3b350
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 宝塔Nginx sub_filter劫持应急响应，挖出一个未公开黑产SEO团伙：既入侵服务器做搜索引擎劫持，又售卖蜘蛛池软件，基础设施曝光后可用IoC全网检测。
> 
> - **攻击手法：** 攻击者篡改宝塔全部16个 `enable-php-*.conf`，注入 `sub_filter` 恶意脚本，一处篡改、全站vhost生效；用 `touch -t` 伪造mtime，但16个文件ctime统一为2026-08-15 06:25:02，与nginx重载时间吻合。
> - **触发条件：** 第二阶段载荷要求移动端、13个搜索引擎referrer、`Asia/Shanghai`时区、每日仅跳1次，还会请求 `api.511a.co` 查询黑名单；这种“PC正常、直连正常、搜索才跳”的设计让复现成本极高。
> - **入侵链：** 2026-05-22创建UID 0后门账号 `linuxsafe`，随后103.68.175.58和154.89.151.143多次root密码SSH登录；初始入口指向云端笔记明文存密码+弱口令撞库，MySQL `root@'%'`公网弱口令是辅助暴露面。
> - **团伙画像：** 同IP发现产品官网 `sec51la.cn`，售卖“小旋风蜘蛛池”软件，功能与劫持代码同源；投放Google Ads，案例含六合彩/色情站，Telegram `@seo263`；urlscan约2400+条关联511a.co基建，受害规模估计数以千计。
> - **检测与防御：** 用 `grep -rl "sub_filter"` 检查nginx配置、`stat` 查ctime、`awk -F: '$3==0'` 找UID 0异常账号；基线包括密码管理、SSH禁root密码直连、nginx配置目录做5分钟级hash巡检，站长应模拟“移动端+百度referrer”自测。

## 事件起点：一个"PC 端正常"的劫持页面

站长反馈某静态页面疑似被注入恶意跳转代码。直接访问页面一切正常，但抓取原始 HTML 后发现尾部存在一段可疑注入：

```html
<script>eval(atob("IShmdW5jdGlvbigpe..."))</script>
```

Base64 解码后是一个加载器，特征是典型的搜索劫持黑产手法：

-   仅 `maxTouchPoints >= 5` （移动端）触发
-   `navigator.platform` 排除 Win32/MacIntel/Linux x86_64 等桌面平台
-   从 `https://cdn.511a.co/lib/jquery/3.7.1/jquery.min.js` （伪装 jQuery 官方路径）拉取第二阶段并 eval 执行
-   全部异常静默 catch，仅输出 `console.debug('Resource load failed')`

**关键点**：站点源文件本身未被修改——注入发生在更上层。

## 注入点定位：宝塔 enable-php 配置批量沦陷

排查服务器（宝塔面板 + nginx + 多 PHP 版本）发现， `/www/server/nginx/conf/` 下 **全部 16 个** `enable-php-*.conf` 文件头部被插入：

```nginx
sub_filter "</script>" "</script><script>eval(atob(\"...\"));</script>
</body>";
sub_filter_once off;
```

`enable-php-*.conf` 被几乎所有站点 vhost 引用，一处篡改、全站生效。攻击者还用 `touch -t` 恢复了文件 mtime，但 **ctime 无法伪造**——16 个文件 ctime 统一为 2026-08-15 06:25:02，与 nginx worker 的重载时间吻合，坐实了批量脚本化篡改。

## 第二阶段载荷：精细的隐蔽设计

第二阶段 JS 的完整逻辑体现了运营级的反分析意识：

```javascript
const config = {
    key: "13792427ab60437bafb55088e45e0e06",   // localStorage 键
    encryptKey: "5088e45e0e06",                // XOR 加密计数数据
    address: ["https://pucdpqit.top:7878/ypshbz.html"],
    conditionType: "TIMEZONE",                 // 备选: IP 归属地判断
    jumpType: "DIRECT",                        // 备选: IFRAME 全屏覆盖
    jumpPercent: 100,
    jumpCount: 1                               // 每终端每日仅跳 1 次
};
```

触发条件四重过滤：移动端 → 13 个搜索引擎 referrer（baidu/so/sm/sogou/360/google/bing...）→ 时区须为 `Asia/Shanghai` （备选方案调用 `api.ip.sb/geoip` 判断 IP 归属 CN）→ 每日限跳一次。此外还会先请求 `https://api.511a.co/blacklist.php?action=check` 查询黑名单（返回 `{"blocked":false,"cn":true,"cf_mode":true}` ），支持远程关停特定目标。

这套"PC 正常、直连正常、搜索才跳、一天一次"的组合，使得站长和安全研究者的复现成本极高——这也是此类劫持能长期存活的原因。

## 入侵链还原：root 沦陷近三个月

取证时间线（UTC）：

|     |     |
| --- | --- | 
| 时间  | 事件  |
| 2026-05-22 | 创建 UID 0 后门账号 `linuxsafe` （伪装系统账户名，密码哈希直接写入 /etc/passwd） |
| 2026-05-25/26 | 攻击 IP **103.68.175.58** （香港）以 root 密码 SSH 登录，lastlog 显示其同时使用了 linuxsafe 账号 |
| 2026-08-14 | 攻击 IP **154.89.151.143** （马来西亚）再次以 root 密码 SSH 登录 |
| 2026-08-15 06:25 | 批量篡改 16 个 enable-php 配置，reload nginx 生效 |

初始入口指向凭据泄露（云端笔记明文存密码 + 弱密码多平台复用导致撞库），服务器同时存在 MySQL `root@'%'` 公网弱口令这一辅助暴露面。SSH 密码爆破常年不断但 root 密码强度不低，纯爆破命中概率极低。

## 基础设施追踪：四级分离的跳转链

```plain
被挂马站点
 └─[控制层] cdn.511a.co / api.511a.co → 103.68.175.59      (香港 AS59371 Dimension Network)
 └─[跳转层] pucdpqit.top:7878 → 178.107.234.44             (洛杉矶 AS40065 CNSERVERS)
 └─[落地层] uasxjts.top:2549 → CNAME ts.domenecentosl.xyz → 202.79.175.57
                                                              (香港 AS152194 CTG Server)
 └─[客服层] kee96.com → CNAME 52kf.bqtz301.com → 38.71.18.7 (洛杉矶 AS46783 EASY LINK)
```

运营特征：

-   **入侵跳板与 C2 相邻** （103.68.175.58/59 同 /24）——重大 OPSEC 失误，直接暴露关联
-   落地域名即用即弃： `uasxjts.top` 2026-08-01 注册、 `domenecentosl.xyz` 08-05 注册、ZeroSSL 证书 08-13 签发， **挂马发生在 08-15**——"注册-签证书-攻击"周期仅两周，高度流程化
-   核心 C2 域 511a.co 则长期持有（2023-11 注册，GoDaddy），urlscan 记录显示 `api.511a.co` 至少自 **2024 年 12 月** 活跃
-   备用落地 `ndfvkylquutop.xyz` 托管于捷克 Gransy（AS60592）——该段被 URLhaus 列入恶意托管统计，46.8.9.222/225/228 各挂过 12+ 恶意站点，系黑产抗封 IP 池

## 画像升级：这不止是个挂马团伙

对 103.68.175.59 做反向解析时发现同 IP 还托管着 `www.sec51la.cn` ——打开一看，是团伙的 **产品官网**：

-   销售" **百度强引蜘蛛软件** "（页面自曝为黑产圈知名的 **小旋风蜘蛛池**，v2.3.5），功能清单与本次劫持技术完全同源："终端识别（PC/手机）显示不同广告""屏蔽海外用户和蜘蛛""AI 伪原创""万能站群模型"
-   投放 **Google Ads** 获客（转化跟踪 `AW-17654661689` ）
-   案例展示直接写着" **6合客户案例** "（六合彩）、" **X站客户案例** "（色情站）
-   页末联系方式：" **飞机联系: @seo263** "
-   软件安装包托管于阿里云新加坡 OSS： `shunfengjj.oss-ap-southeast-1.aliyuncs.com/baiduseo.zip` （当前已 AccessDenied，疑更换分发渠道）

至此团伙全貌清晰： **它是一家黑产 SEO 服务商**——既卖蜘蛛池软件（产品收入），又批量入侵网站劫持搜索流量卖给六合彩/色情/博彩客户（服务收入）。被挂马的网站只是其流量奶牛。

urlscan.io 上约 **2400+ 条页面扫描** 命中 511a.co 基础设施，涉及假冒 bet365 中文站（cn-mobile-bet365.com）、假冒 7-Zip 中文站（7--zip.com）、盗版影视、色情站等——受害规模估计数以千计。

## 手法家族定位

"宝塔/Nginx 篡改 → 搜索流量博彩劫持"自 2022 年底起周期性爆发：

-   2022-12 ~ 2023-02：中文社区已有宝塔 Nginx 挂马剖析（52txr.cn、腾讯云社区）
-   2026-02：Datadog Security Labs 披露 React2Shell（CVE-2025-55182）批量入侵宝塔 + Nginx， `bt.sh` 脚本篡改 vhost 配置，以 **proxy_pass** 反代劫持（ [原文](https://securitylabs.datadoghq.com/articles/web-traffic-hijacking-nginx-configuration-malicious/) ）

本案例的 **sub_filter 注入 + eval(atob) 双层混淆 + 假 jQuery CDN** 变体与上述公开报告 IOC 均不重叠，且 511a.co 在 OTX 零记录、无任何厂商归因—— **大概率是一个尚未被公开追踪的独立运营团伙**。

## 防御与检测建议

**检测（IoC 匹配）**:

```bash
# 宝塔/nginx 配置层
grep -rl "sub_filter" /www/server/nginx/conf/ /www/server/panel/vhost/nginx/
# 检查配置 ctime（mtime 可被伪造）
stat -c "%n %y %z" /www/server/nginx/conf/enable-php-*.conf
# UID 0 异常账号
awk -F: '$3==0{print $1}' /etc/passwd
```

**模拟触发验证**：移动端 UA + `Referer: https://www.baidu.com/` + 中国时区访问站点，观察是否跳转。

**防御基线**：

1.  凭据管理：基础设施密码独立强随机、只存密码管理器，杜绝云端笔记/桌面文本/浏览器明文存储
2.  SSH 禁 root 密码直连 + fail2ban；数据库端口绝不公网开放、杜绝 `root@'%'`
3.  宝塔面板保持更新 + 面板端口 IP 白名单
4.  对 nginx 配置目录、 `/etc/passwd` 等做文件完整性监控（本次处置后部署了 5 分钟级 hash 巡检 + 邮件告警，成本极低）
5.  站长自查网站时应模拟"移动端 + 搜索引擎 referrer"，否则此类劫持几乎不可见

## 完整 IOC

**域名**

|     |     |
| --- | --- | 
| 域名  | 角色  |
| 511a.co / cdn.511a.co / api.511a.co / hk.511a.co | C2（GoDaddy, 2023-11） |
| sec51la.cn / [www.sec51la.cn](http://www.sec51la.cn/) | 团伙软件官网 |
| cdn-wujinzy.com / pay.cdn-wujinzy.com | 早期载荷 CDN |
| pucdpqit.top | 跳转层（NameSilo, 2026-06-27） |
| uasxjts.top / domenecentosl.xyz | 落地层（2026-08-01 / 08-05） |
| ndfvkylquutop.xyz | 备用落地 |
| ssa17.com | 博彩品牌主站（NameSilo, 2026-07-08） |
| kee96.com / 52kf.bqtz301.com | 客服门面/共享客服 SaaS |

**IP**

|     |     |
| --- | --- | 
| IP  | 角色/归属 |
| 103.68.175.58 | 入侵跳板 + 载荷 CDN（HK AS59371） |
| 103.68.175.59 | C2 + 软件官网（HK AS59371） |
| 154.89.151.143 | 入侵跳板（MY AS154376 Cloudvalley） |
| 178.107.234.44 | 跳转层（US AS40065 CNSERVERS） |
| 202.79.175.57 | 落地层（HK AS152194 CTG Server） |
| 38.71.18.7 /.237 /.238 | 客服 + 品牌主站（US AS46783 EASY LINK） |
| 46.8.9.222 /.225 /.228 | 备用落地（CZ AS60592 Gransy） |

**其他**

-   百度统计 ID： `36783bbed18dfe5e6429f1dbfbedfaa4` 、 `60b9eff27f66975f19c6102404a3b350`
-   Google Ads： `AW-17654661689`
-   Telegram： `@seo263`
-   阿里云 OSS： `shunfengjj.oss-ap-southeast-1.aliyuncs.com/baiduseo.zip`
-   localStorage key： `13792427ab60437bafb55088e45e0e06`
-   后门账号： `linuxsafe` （UID 0）
-   特征端口：跳转 `:7878` 、落地 `:2549`
-   urlscan 查询： `domain:"511a.co"` （约 2400+ 条关联扫描）

## 结语

这起事件再次验证了两件事：其一，"凭据明文存储 + 弱密码复用"至今仍是中小站点沦陷的第一大通路，攻击者甚至不需要任何 0day；其二，搜索劫持黑产已经高度产品化——有软件、有官网、有广告、有客服、有按地区按终端的精准投放。防御端能做的，除了把基线打牢，就是把这个团伙的 IOC 扩散出去：基础设施每曝光一分，他们的运营成本就高一截。
