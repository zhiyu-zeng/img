---
title: 【微信】补丁未至，攻击先行：PHP2Shell 在野攻击全记录
source: https://mp.weixin.qq.com/s/VMk5o23AC-tTptFM5rU8pg
source_host: mp.weixin.qq.com
clip_date: 2026-10-22T17:01:24+08:00
trace_id: afe11c00-025e-4eb4-91ea-4dad89ad5051
content_hash: 00fa4ca889c0955aa2f60a3ea2490338d4e1ddb26373a5a4aee2241da82c9af9
status: synced
tags:
  - 微信
  - 漏洞分析
  - 在野攻击
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: PHP2Shell（CVE-2026-109618/109619）是潜伏约 14 年的 PHP 内核内存漏洞，补丁前 4 天已被在野利用，需立即升级或下线。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 40175244-d011-8198-b9a5-d43987212f4c
ioc:
  cves:
    - CVE-2024-4577
    - CVE-2026-109618
    - CVE-2026-109619
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> PHP2Shell（CVE-2026-109618/109619）是潜伏约 14 年的 PHP 内核内存漏洞，补丁前 4 天已被在野利用，需立即升级或下线。
> 
> - **漏洞定位：** 缺陷在解释器内核的 OOM/致命错误处理路径（longjmp 不展开栈、悬垂状态被下一请求消费），影响 PHP 5.4.0–8.5.11 全部 Web SAPI；无需认证、无需应用层漏洞，特制 multipart POST 即可触发，已在 11 款默认配置应用上验证未认证 RCE。
> - **时间窗口：** AWS 蜜罐 10-17 即捕获利用（早于 10-20 泄露、10-21 补丁）；Cloudflare 于补丁前约 11 小时为全套餐上线 WAF，Patchstack 07:34 报告活跃利用，补丁落地数小时内攻击规模化。
> - **流量特征：** 647 条实战流量分属 6 组活动、183 种载荷、272 个 PHPSESSID；boundary 直接命名 B7kQpoc618/619；OOM 填充在 714–740 字节按 1 字节步进试探 memory_limit；515 条把 PHPSESSID 放 body 而非 Cookie，因此“请求体含 `<?php`”不能当必要条件。
> - **修复与缓解：** 升级 8.5.12/8.4.27/8.3.36/8.2.35，必须重启 worker、容器重建镜像；临时关闭 session.upload_progress、memory_limit=-1 配 cgroup、边缘禁用 multipart；禁用 RLIMIT_AS/DATA（反而触发漏洞）。
> - **排查与泄露：** 回溯至 10-17；PHP 日志“Allowed memory size…in Unknown on line 0”为关键；upload-progress 路径可经 PHPSESSID 响应 Cookie 泄露密码、令牌、TLS 私钥，未发现 WebShell 也应按凭据已泄露处置；约 79% 暴露主机处 EOL 分支无官方补丁。

**奇安信威胁情报中心** *2026年10月22日 16:31*

漏洞预警 · 在野攻击 · PHP

补丁未至，攻击先行：PHP2Shell 在野攻击全记录

两个潜伏约 14 年的 PHP 内核内存安全漏洞，在协调披露前夕被泄露——补丁落地前后数小时内，攻击尝试即进入规模化阶段

CVE-2026-109618 / CVE-2026-109619 · CVSS 9.2 · 2026.10

**摘要**：两个潜伏约 14 年的 PHP 内核内存安全漏洞（CVE-2026-109618 / CVE-2026-109619，统称 **PHP2Shell**）在协调披露前夕被泄露。蜜罐数据显示，最早的利用尝试出现在 **补丁发布前 4 天**；补丁落地前后数小时内，攻击尝试即进入规模化阶段。本文还原事件全貌：漏洞机理、在野攻击证据链、全球应急响应实录，以及防御与排查要点。

|     |     |
| --- | --- |
| 速览  | 内容  |
| 漏洞编号 | CVE-2026-109618<br><br>（RCE via OOM corruption）、CVE-2026-109619（RCE via stale global state） |
| 严重程度 | CVSS v4.0 **9.2** （Critical，PHP 官方）；奇安信 CERT 按 CVSS 3.1 评 8.1（高危） |
| 影响版本 | PHP 5.4.0 起至 8.5.11（含），覆盖几乎全部存量版本 |
| 影响部署形态 | Apache mod_php<br><br>、PHP-FPM、php-cgi、FrankenPHP、LiteSpeed LSAPI 等所有处理 Web 请求的模式 |
| 利用条件 | 无需认证、无需应用层漏洞，特制 HTTP 请求即可触发 |
| 修复版本 | 8.5.12 / 8.4.27 / 8.3.36 / 8.2.35（2026-10-21 发布）；7.4 / 8.0 / 8.1 提供源码级最小 backport |
| 利用状态 | PoC 与技术细节已公开；多家机构观测到在野攻击尝试；奇安信 CERT **确认已发现在野利用** |
| 披露时间 | 2026-10-21 14:00 UTC（因泄露提前一天） |

01 一条被删除的帖子，撕开了互联网的底座

10 月 20 日下午，Hacker News上出现了一条帖子：两个 PHP 远程代码执行漏洞即将披露，CVSS 满分 10.0，影响自 PHP 5 以来的所有版本，并直接给出了两个 CVE 编号。

帖子很快被删除，但截图已经在社交媒体扩散。安全公司 **watchTowr** 随即出面确认：漏洞真实存在，且处于禁运（embargo）期——按原计划，各方应等到 10 月 22 日才公开。watchTowr 同时表示已成功复现其中一个漏洞（CVE-2026-109618）。

被打乱节奏的 PHP 安全团队当晚做出两个决定：将发布提前一天至 10 月 21 日 14:00 UTC，并声明—— **如果漏洞细节进一步公开，或出现在野利用证据，发布还会再提前**。正式公告中，PHP 官方给出的评分是 CVSS v4.0 9.2（严重），而非泄露信息所称的 10.0。

混乱并未就此停止。同一晚，发现方之一 **Calif** 误发布了一段 PoC 演示视频，展示利用工具在 WordPress、Drupal、Magento 等多个默认配置站点上执行命令，视频删除后副本继续流传。10 月 21 日 07:41 UTC，容器镜像厂商 **Chainguard** 又提前 6 个多小时单方面发布了含修复的构建镜像——PHP 基金会公开批评称，这等于让任何攻击者都可以在其他用户还在等待补丁时，从二进制层面研究修复内容。

一场持续约两个月的协调披露，在最后一公里被压缩成了以小时计的攻防竞速。而后续事实证明， **攻击者并没有等待**。

02 漏洞不长在应用上，长在 PHP 的"心脏"里

## 漏洞根因与影响面

这次事件与常见的"某个 CMS 又出漏洞"有本质区别： **缺陷位于 PHP 解释器核心的内存管理与错误处理机制**——按 PHP 基金会的说法，这是"几乎每个请求都会触碰的部分"。WordPress、Drupal、Magento 代码写得再安全也照样受影响；更新应用、设置 disable_functions、配置 open_basedir 这类脚本层防护全部无效。

两个 CVE 是同一根因下的两类可利用状态。PHP 遇到内存耗尽（OOM）、执行超时等致命错误时，通过 longjmp() 直接跳出当前调用栈， **不做栈展开**：析构函数不执行、半初始化结构无人记录。随后清理流程却"假设所有结构一致"，问题由此产生。

## 两个CVE的触发机理

**CVE-2026-109618：同请求内的 OOM 破坏。** 请求内存尚未完成初始化就被提前"发布"，OOM 中断后，request shutdown 阶段把这份无效状态当作有效数据消费。PHP 官方确认：Apache mod_php 在请求启动失败后仍无条件执行 shutdown，因此 **单次匿名 POST 即可触发，且在默认配置下完成了完整 RCE 验证**——攻击发生在任何应用代码执行之前。攻击者控制 OOM 的手段也已公开：multipart 解析存在三个缺陷——无可用 Content-Length 声明的请求可绕过 post_max_size 初检；单个 multipart 段可容纳不限数量的头部、内部表示内存远超线上字节；空文件控件不计入 max_file_uploads 却照样生成元数据数组，配合嵌套字段名，一个几 MB 的请求就能耗尽默认内存上限。PHP-FPM 因启动失败会杀死子进程，该 SAPI 尚无完整公开利用演示，但官方源码分析确认其同样可被触达。

**CVE-2026-109619：跨请求的悬垂状态。** worker 进程持有的全局状态（会话、错误、反序列化器等）指向属于上一个请求的内存；致命错误在状态重置前中断操作，请求堆释放后指针悬垂； **同一 worker 处理的下一个请求** 在正常初始化之前消费这份陈旧状态，造成释放后重用（UAF）。已确认的两条"消费者"路径是：初始化前的 INI 诊断（注意：error_reporting、@、关闭 display_errors 都无法防护，因为状态在决定是否报告之前已被访问），以及默认开启、无需应用调用 session_start() 的 session upload-progress 机制。PHP 8.5 的 fatal_error_backtraces 路径是官方确认的最强案例。

值得单独强调的是 **内存泄露副线**：upload-progress 在请求启动早期初始化会话状态，OOM 中断后 PS(id) 指针悬垂，后续 multipart 请求会让 PHP 把回收堆中的内容 URL 编码进 PHPSESSID 响应 Cookie 返回给攻击者——无需实现 RCE，就能读取同一 worker 处理过的 **密码、会话令牌、API 密钥甚至 TLS 私钥**。这是一次 Heartbleed 级别的数据暴露面。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ea29f2a9e68aa25a.png)

图1｜PHP2Shell 双漏洞触发模型对比图（图源：本文根据 PHP 官方安全公告 GHSA-w8hw-w9fx-j79w / GHSA-6wmf-4rv5-p3rp 及 Wiz Research 技术 writeup 整理绘制）

把研究侧已验证的利用链简化为四步：

1 **触发**—— 发送携带 PHP_SESSION_UPLOAD_PROGRESS 字段的 multipart POST，激活自 PHP 5.4 起默认开启的上传进度追踪

2 **释放**—— OOM 或致命错误制造悬垂状态/被错误释放的内存

3 **重占**—— 攻击者用伪造的 Zend 内部函数结构占据刚释放的内存

4 **执行**—— PHP 沿悬垂指针调用攻击者构造的函数，以 Web worker 权限执行任意命令

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2c5efdccb89034f.png)

图2｜PHP2Shell 攻击链四步流程图（图源：本文根据 PHP 官方安全公告、Calif 技术 writeup 及 Upwind 利用链分析整理绘制）

CrowdStrike 的验证还指出一个对防守方不利的细节：成功利用可以返回标准的 HTTP 200，worker 不崩溃、应用日志无异常—— **不能只靠应用日志判断是否被打**。

发现方 Calif 的 writeup 中共验证了 **11 款默认配置应用** 的未认证 RCE，包括 WordPress、Drupal、Joomla、MediaWiki、Magento、phpMyAdmin、Nextcloud、Laravel、Symfony、WHMCS、Roundcube。

03 攻击来得比补丁快：在野攻击实录

攻击活动时间线梳理

综合 AWS、Cloudflare、watchTowr、Hadrian、Patchstack、Vega、Fastly、微步在线、奇安信 CERT 等多方观测，攻击活动的时间线如下（UTC）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/900f911b10160795.png)

图3｜PHP2Shell 事件攻防时间线（10-17 ～ 10-22）（图源：本文根据 AWS Security Blog、Cloudflare、Hadrian、Patchstack、watchTowr、Fastly、微步在线、奇安信 CERT 等公开观测整理绘制）

## 在野利用时间线

**10 月 17 日——最早的实物证据。** AWS 威胁情报团队披露，其 MadPot 蜜罐网络在公开披露前 4 天即捕获到针对 PHP2Shell 的利用尝试，来源 IP 103.216.220.92 关联商业化匿名化网络。禁运窗口内、来自匿名 IP 的定向探测，指向知情者的先行行为，而非随机扫描。AWS 由此给出的判断值得每个防守方记住： **不要假设公开披露日就是最早利用日**

**10 月 20 日——泄露之后。** 漏洞细节泄露、演示视频流传，GitHub 上开始出现 PoC 仓库。

**10 月 21 日凌晨——补丁前的攻防竞速。**

-   **02:00**，AWS 识别出最早的公开 PoC；02:00–08:00 之间，MadPot 遭到来自更多匿名化网络的连续利用尝试，涉及多个攻击者；
-   **03:02**，Cloudflare 为全部套餐（含免费版）默认上线 WAF 拦截规则，早于公开披露约 11 小时；
-   **07:34**，Patchstack 接到托管合作伙伴报告的多起活跃利用事件；
-   **07:41**，Chainguard 提前发布修复镜像（见上文）；
-   **07:43**，Cloudflare CTO 报告观测到早期攻击，并确认攻击者正在 **持续变异攻击载荷，试图绕过其防护规则**。

**10 月 21 日中午至晚间——补丁落地，攻击提速。**

-   **11:35**，Hadrian 报告："现在看到 php2shell 正在野外被规模化利用（exploited in the wild at scale），我们观察到的大多数攻击滥用 session upload-progress 路径"；
-   **13:30–13:52**，PHP 发布修复版本 8.2.35 / 8.3.36 / 8.4.27 / 8.5.12；
-   补丁落地几乎同时，watchTowr 的蜜罐传感器即遭首次在野利用尝试；
-   **13:57**，Patchstack 更新遥测结论：以探测性攻击为主，尚无确凿失陷证据；
-   **14:35**，Hadrian 确认规模化利用仍在继续；
-   补丁发布后数小时内，更多公开 PoC 涌现并被"几乎立即"用于攻击 AWS 传感器，AWS 判定 PHP2Shell **"正在被广泛利用（broadly exploited in the wild）"**；
-   Fastly 首席产品官表示："这不是理论性漏洞。Fastly 全球网络每天承载数十亿次 PHP 请求，我们正在看到活跃攻击的证据。"

**10 月 21 日全天至今——国内观测。** 微步在线 TDP 实际捕获到特征扫描流量，扫描器 User-Agent 为 php2shell-scan/1.0。10 月 22 日，奇安信 CERT 更新通告：已成功复现漏洞， **已发现在野利用**。奇安信威胁情报中心同日获得的一份天眼流量分析也显示，针对资产的批量扫描自 10 月 21 日下午（补丁发布前后）即已开始，详见下文"一线流量侧写"。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7de6e8311f05097e.png)

图4｜奇安信 CERT 复现 PHP2Shell 漏洞截图——可见利用程序经 heap leak、libphp leak 等阶段后确认 RCE，以 www-data 权限执行 id、uname 等命令（图源：奇安信 CERT）

一线流量侧写：647 条实战流量还原出的攻击者手法

10 月 22 日，奇安信威胁情报中心分析了一份天眼流量日志（647 条记录）。与蜜罐数据不同，这是 **生产环境真实"挨打"的记录**，其中几个细节值得所有防守方注意：

## 真实流量攻击手法

-   **这不是单一事件。** 647 条流量至少分属 **6 组独立活动**：约 571 条与 PHP2Shell 直接相关；另有 76 条是搭车混入的"老手法"——PHP session 反序列化伪造管理员（upload_progress 值形如 jz|admin|a:6:{...isadmin=1...}，利用 session serialize_handler 错配），与本次漏洞无关且开始得更早。新漏洞带来的扫描洪流，正在成为各类旧攻击浑水摸鱼的掩护。
-   **载荷在快速迭代。** 该数据集中共识别出 **183 种** 不同载荷签名、 **272 个** 不同 PHPSESSID 值，说明并非单一工具扩散，而是多个来源各自改造。其中最强的单一扫描源在约 4 小时内发出 451 条请求，把目标共享托管上的上百个 vhost 枚举了一遍。

-   **实战载荷家族与两条 CVE 攻击臂的对应关系清晰可见**：

|     |     |     |     |
| --- | --- | --- | --- |
| 载荷家族 | 条数  | 特征  | 对应攻击臂 |
| MINIMAL_PROBE | 233 | 仅 PHPSESSID + upload_progress，无填充 | 存活/可利用性探测 |
| OOM_FILLER | 159 | 文件段带连续 A 填充 | CVE-2026-109618<br><br>（制造分配失败） |
| BRACKET_ARRAY_FLOOD | 117 | 字段名 t\[\] 重复 2–23 次 | CVE-2026-109618<br><br>括号数组臂 |
| GADGET_CHAIN | 32  | upload_progress<br><br>值以 \|O: 开头的 PHPGGC 链（Laravel / Symfony） | CVE-2026-109619<br><br>反序列化臂 |
| SERIALIZED_IN_FILENAME | 25  | filename=<br><br>中塞序列化串 | CVE-2026-109619<br><br>边界探测 |
| PHP_TAG_VERIFY | 5   | filename="<?php echo 'PWNED618';?>"<br><br>等 | 回显验证 |

-   **boundary 指纹暴露了工具的分化与扩散。** 对部分 POST 数据 multipart boundary 字面量的统计显示，攻击者已经毫不掩饰意图——条数最多的两个 boundary 直接以 CVE 编号命名，且在 10 月 21 日补丁发布前后即投入使用：
    

|     |     |     |     |
| --- | --- | --- | --- |
| boundary 字面量 | 源 IP 数 | 目标域名数 | 时间窗 |
| B7kQpoc618 | 2   | 88  | 10-21 13:17 – 16:42 |
| B7kQpoc619 | 1   | 87  | 10-21 13:17 – 14:01 |
| p2s<br><br>（前缀） | 6   | 4   | 10-21 17:17 – 10-22 06:58 |
| php2shell<br><br>（前缀） | 2   | 2   | 10-21 17:17 – 18:23 |
| P2SV | 1   | 2   | 10-21 23:24 – 23:28 |
| XX618 | 2   | 1   | 10-22 00:47 – 00:52 |
| VERIFY | 2   | 1   | 10-22 00:37 |
| phpv0 | 1   | 4   | 10-21 23:57 – 23:59 |
| BNDRY | 1   | 1   | 10-22 10:46 |
| PRB | 1   | 2   | 10-22 08:38 – 08:39 |
| WF119BOUNDARY | 1   | 1   | 10-22 05:31 |

B7kQpoc618 与 B7kQpoc619 字面量仅末尾编号不同、各自覆盖约 88 个目标域名，指向同一工具按两条 CVE 攻击臂拆分的两个变体；而 p2s 前缀的 boundary 已出现在 6 个不同源 IP 上——同一工具正在多源扩散。对检测侧而言，这类高特征度 boundary 是成本极低的命中点，但需预期其随时换皮，应与行为判据组合使用。

-   **填充长度分布暴露了调参行为。** 159 条 OOM_FILLER 中，填充长度在 **714–740 字节** 区间形成 1 字节步进的密集带——这是攻击者在逐字节试探目标 memory_limit 的临界点，而非照抄固定 PoC。
-   **两个对检测工作的直接修正。** 其一，511 条记录中 upload_progress 的值仅仅是一个字符 x—— **把"请求体出现 <?php"当作检测必要条件，会漏掉绝大部分攻击**；其二，515 条记录把 PHPSESSID 放在 **POST body 而非 Cookie** 中（攻击者预期目标 session.use_only_cookies=0），这一异常形态本身就是很好的辅助判据。字段顺序基本固定为 PHPSESSID → PHP_SESSION_UPLOAD_PROGRESS → 文件段，判别字节靠近 body 起始，检测侧不需要大 body 窗口。
-   **最接近"实际触发"的证据。** 数据集中唯一的服务端异常，是某 vhost 对 OOM 载荷返回 HTTP 500，且呈"无填充→带填充"成对出现、重复两轮——与 109619"先致命错误、后读取过期状态"的两阶段结构吻合。但响应体内容为空， **无法据此判定利用成功**，仍需主机侧取证（PHP error log、worker 崩溃记录、进程派生链）才能定性。
-   **疑似授权测试也混在流量里。** 一批载荷的会话 ID 呈系统化命名：chainA618、chainC618stdClass 与 chainC618nosuchclass（存在的类/不存在的类——明显的对照实验）、mf618wp0–4 参数扫描、poc618selfwrite 等，个别命名含中文字符。攻击者不会给自己的载荷起"nosuchclass"这种对照组名字——这更像安全研究人员在抢时间做系统化验证。对防守方的提醒是：日志中的"攻击流量"需 **先区分敌我，再决定处置强度**。

如何解读各方口径的分歧？

一边是 Hadrian 的"规模化利用"、AWS 的"广泛利用"；另一边是 watchTowr 的"迄今无人成功，但我们不指望这种状态能持续多久"、Patchstack 的"仅探测"、Huntress 的"合作方环境未见利用"。合理的读法是： **扫描、探测与利用尝试已经规模化，而经公开取证确认的成功失陷案例尚未披露**。对照历史：上一次同级别 PHP 核心 RCE（CVE-2024-4577）从披露到遭僵尸网络扫描约 24 小时；这一次，由于细节提前泄露叠加 PoC 快速扩散，补丁落地与首次攻击之间几乎零间隔。Sansec 在补丁发布前预测"大规模利用将在补丁发布后 15 分钟内开始"——从事后观测看，这个预言并没有夸张多少。

另需提醒：GitHub 上涌现的数十个"PoC 仓库"质量参差，大量是复现实验或检测代码而非可用利用程序，且安全厂商已提示其中存在被植入后门的先例。 **不要下载运行来源不明的"一键 EXP"或"一键修复脚本"**。

04 全球"拉闸"：从首相官邸到宝可梦

漏洞的极端严重性催生了一次近年罕见的大规模"主动停机保平安"。

**政府与安全机构层面。** 美国 NSA 建议：无法立即更新的组织应将系统下线；FBI 与 NSA 等联合呼吁组织停机升级；英国 NCSC 同样建议无法立即打补丁者下线隔离；欧盟 CERT-EU 发布紧急通告 2026-018，要求无法立即修补的机构将互联网暴露应用与公共网络隔离。CISA 提示了一个背景：PHP 历史上已有 3 个漏洞进入 KEV 已知被利用漏洞目录，其中 2 个被勒索软件利用——本次漏洞截至 10 月 21 日尚未列入 KEV。日本首相高市早苗 10 月 21 日 21:55（东京时间）在 X 发布"今夜就要处理的大至急请求"，呼吁运行 PHP 的网站当晚做好打补丁准备；日本国家网络安全战略总部同步发出警戒。

**荷兰** 成为预防性下线的样本：众议院、国家网络安全中心、Security.NL、科技媒体 Tweakers 于 10 月 21 日主动转为只读或静态展示，数字身份系统 DigiD 与个人政务门户 MijnOverheid 随后下线。芬兰、法国也有政府网站预防性下线。

**企业与在线服务层面** 的下线清单更能说明 PHP 的渗透深度：niconico 动画 19:00（东京时间）起进入维护且结束时间未定；pixiv 维护至次日凌晨；万代频道、Animate 在线商店、Melonbooks、BOOK☆WALKER、BASE 等日本电商平台陆续紧急维护；宝可梦 Pokémon HOME、Pokémon Champions、Pokémon Sleep 预防性下线或紧急维护；手游《赛马娘》《碧蓝幻想》将原定维护时间提前；4chan、DeviantArt 等也受到波及。

这些关停均为 **预防措施**，各机构均声明未发现入侵迹象——它衡量的是谨慎程度，而非失陷数量。

05 为什么这次不一样：三个基于事实的观察

**其一，披露窗口正在失守。** 本次事件中，攻击行为（10-17 蜜罐捕获）早于泄露（10-20），泄露又早于补丁（10-21）约 18 小时，Chainguard 的抢跑再送出 6 小时。AWS 的结论直白而冷峻：禁运只能保护防御者到"别人也找到同一漏洞"为止；对互联网暴露系统的关键漏洞，补丁与缓解的 SLA 应以 **小时** 计——按天或按周的响应预设已经失效。

**其二，AI 正在同时压缩攻防两侧的成本。** 这两个漏洞本身是 AI 发现的标志性案例：Calif 在 OpenAI "Patch the Planet" 计划下借助 GPT-5.6 Sol 发现漏洞；Wiz 使用 Gemini 4 Argon、GPT-5.6 Sol 与 Wiz Atlas 独立完成发现、利用开发与补丁验证；OpenAI 同日独立报告同一根因并补充攻击向量。Wiz 称之为安全行业的"AI 拐点"——缺陷潜伏十余年无人能利用，因为证明其可利用性的攻击链"处于人类研究员实际能力的边缘"，而前沿模型让一名研究员一周内完成了过去需要世界级团队数月的工作。OpenAI 总裁 Greg Brockman 称这是"近期开源软件史上最严重的漏洞之一"。值得注意的是，PHP 核心开发者早在 2024 年审计中就发现过该 OOM 问题的迹象，但因当时无可行利用路径、修复方案取舍困难而搁置；AWS 同时判断，AI 辅助分析让"补丁 diff → 可用 EXP"的过程变得廉价，更多攻击者能在数小时内完成武器化。

**其三，EOL 存量是最大的结构性软肋。** 互联网测绘数据显示：Modat 扫描到约 **438 万** 个暴露的 PHP 服务（约 189 万台主机），其中 **79%** 可识别版本运行在已无官方支持的 EOL 分支——约 141 万台主机等不到官方补丁，只有约 53 万台主机（8.2–8.5）能通过升级小版本直接修复。地理分布上，美国（42.8 万）、中国（15.2 万）、日本（14.0 万）居前；国内另有 ThinkPHP（全球 57.3 万条记录，国内 44.4 万）等未在演示列表但同属 PHP 生态的应用需要一并排查。WordPress 是最大的单一放大器：FOFA 测绘 310 万个独立 IP，而 Censys 的调查显示超过 70% 的 WordPress 实例运行着过期 PHP——"WordPress 是最新版"从来不等于"PHP 是安全版"。

06 防御行动指南

**根治只有一条路：升级。** 升级到 **8.5.12 / 8.4.27 / 8.3.36 / 8.2.35** （EOL 环境使用 7.4 / 8.0 / 8.1 源码级 backport 或发行版 backport 过渡，并尽快迁移至受支持分支）。三个高频踩坑点：

1.  **升级后必须重启** Apache、PHP-FPM 及所有常驻 worker——只替换二进制、不杀旧进程，风险原样保留；
2.  容器环境必须 **重建镜像** （重启容器无效）；K8s 滚动重启所有 Pod；
3.  以 php-fpm -v 等 **实际输出** 为准，不要只看面板或包管理器版本号——发行版 backport 往往不改变版本号（查 changelog 中的 CVE 标记）；Remi 仓库（rpms.remirepo.net）发布当日无更新，需切换发行版包或源码编译。注意 PHP 8.2 将于 2026 年 12 月 31 日 EOL，应同步规划升级。

**无法立即升级时的临时缓解** （官方明确：均非完整方案，组合使用）：

; php.ini（或 FPM pool 用 php_admin_flag / php_admin_value 锁定）

session.upload_progress.enabled = Off; 阻断已确认的 session 路径（主攻击链）

memory_limit = -1; 消除可预测的 OOM 触发点，须配合 cgroup/容器内存上限

fatal_error_backtraces = 0; 仅 PHP 8.5，阻断 backtrace 路径

post_max_size = 8M; 无上传业务时；有上传可设 32M，并在边缘限制实际请求体

无文件上传业务的站点，可在 Nginx/Apache/Caddy 层直接拒绝 multipart/form-data 请求（注意会连带影响后台上传，需评估）；前置 CDN/WAF 的同时 **必须锁死源站直连**，否则规则可被绕过。两条警示： **禁止使用 RLIMIT_AS / RLIMIT_DATA** 作为内存限制替代——它们会导致 mmap() 失败，反而触发 CVE-2026-109618 的漏洞路径；应用层"维护模式"无效，因为 PHP 在应用检查标志之前就已解析请求——要下线就得在 Web 服务器层停 PHP。

## 排查与凭据轮换

**排查与回溯。** 排查时间范围至少回溯至 **10 月 17 日** （AWS 首次捕获日），重点检查：访问日志中含 PHP_SESSION_UPLOAD_PROGRESS 的可疑 multipart POST；PHP 错误日志中集中出现的 Allowed memory size of... exhausted... in Unknown on line 0（"in Unknown on line 0" 是关键——说明崩溃发生在没有 PHP 文件执行的阶段）；异常超大或畸形的 PHPSESSID 响应 Cookie；Web 服务器进程派生 shell、下载工具等异常子进程；Web 根目录新增 PHP 文件、新增 cron 任务与账户。 **即使未发现 WebShell，只要服务暴露过，就应按"凭据可能已泄露"处置**——轮换数据库口令、API 密钥、会话签名密钥与 TLS 私钥，因为内存泄露路径几乎不留痕迹。

多家机构对后续 72 小时的定调一致： **这是事件响应准备期，不是常规补丁周期**。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6329bfd4506dcd6c.png)

图5｜PHP2Shell 应急响应与排查处置流程图（图源：本文根据 PHP 官方公告缓解指引、奇安信 CERT 通告及各厂商检测方案整理绘制）

07 技术附录

附录 A：MITRE ATT&CK 技术映射

|     |     |     |     |
| --- | --- | --- | --- |
| 战术  | 技术编号 | 技术名称 | 本事件中的对应行为 |
| TA0043<br><br>侦察 | T1595.002 | 主动扫描：漏洞扫描 | 批量扫描 PHP 指纹（X-Powered-By、PHPSESSID、框架特征）；扫描器 UA php2shell-scan/1.0 |
| TA0001<br><br>初始访问 | T1190 | 利用面向公众的应用程序 | 未认证 multipart/form-data POST 触发 PHP 解释器内存漏洞 |
| TA0002<br><br>执行 | T1059.004 | 命令和脚本解释器：Unix Shell | PHP worker 进程派生 sh/bash，以 Web 权限执行任意命令 |
| TA0003<br><br>持久化 | T1505.003 | 服务器软件组件：Web Shell | 向 Web 根目录及 uploads/cache/tmp 等可写目录写入 WebShell |
| TA0003<br><br>持久化 | T1053.003 | 计划任务/作业：Cron | 新增 cron 任务维持访问 |
| TA0003<br><br>持久化 | T1136.001 | 创建账户：本地账户 | 新增系统账户或应用管理员账户 |
| TA0005<br><br>防御规避 | T1027 | 混淆文件或信息 | 攻击者持续变异攻击载荷以绕过 WAF 规则（Cloudflare 观测） |
| TA0006<br><br>凭据访问 | T1552 | 非安全凭据 | 经 PHPSESSID 响应泄露 worker 进程内存中的密码、令牌、API 密钥、TLS 私钥（无需 RCE） |
| TA0007<br><br>发现 | T1033<br><br>/ T1082 | 系统所有者/用户信息发现 | Web 进程直接执行 whoami、id、uname -a 等侦察命令 |
| TA0011<br><br>命令与控制 | T1071.001 | 应用层协议：Web 协议 | 入站 POST 后向未知主机建立异常出站连接 |
| TA0011<br><br>命令与控制 | T1090 | 代理  | 攻击流量来自商业化匿名化网络（AWS MadPot 观测） |
| TA0011<br><br>命令与控制 | T1105 | 工具传输入口 | Web 进程调用 curl/wget/nc 拉取第二阶段载荷 |
| TA0010<br><br>数据外泄 | T1041 | 经 C2 通道外泄 | 窃取的业务数据与凭据经异常外联传出 |
| TA0040<br><br>影响 | T1499.004 | 端点拒绝服务：应用或系统利用 | OOM 路径导致 PHP worker 崩溃、服务不可用 |

附录 B：失陷指标（IoC）

**网络 IoC——IP 地址（AWS MadPot 蜜罐观测）**

|     |     |     |
| --- | --- | --- |
| IP  | 观测日期 | 备注  |
| 103.216.220.92 | 2026-10-17 | 最早捕获，公开披露前 4 天 |
| 31.223.184.166 | 2026-10-21 | 关联商业化匿名化网络 |
| 37.19.200.5 | 2026-10-21 | 同上  |
| 134.209.159.64 | 2026-10-21 | 同上  |
| 103.114.163.188 | 2026-10-21 | 同上  |
| 95.217.98.37 | 2026-10-21 | 同上  |

上述 IP 含共享匿名化基础设施，并非该威胁独占—— **建议用于排查与关联分析，不建议直接封禁**。

**网络 IoC——IP 地址（天眼流量分析）**

|     |     |     |
| --- | --- | --- |
| IP  | 行为  | 量级  |
| 210.43.30.6 | CVE-2026-109618<br><br>批量扫描，枚举目标托管上百个 vhost | 451 条/约 4 小时 |
| 27.159.66.104 | PHP session 反序列化伪造管理员（老手法，与 PHP2Shell 无关） | 75 条/约 39 小时低速 |
| 36.148.149.47 | 多 IP、多非标端口横向探测 | 25 条/3 分钟 |

另有 10 余个零散探测源（各 1–4 条）。注意：流量日志中还观测到 **疑似授权测试/研究行为**，命中日志后需先区分敌我再处置。

**载荷侧特征（比 IP 更耐用，来自实战流量统计）**

-   PHP_SESSION_UPLOAD_PROGRESS 的值以 |O: 或 |a: 开头（如 |O:40:"Illuminate\\Broadcasting\\PendingBroadcast"、|O:33:"Symfony\\Component\\Process\\Process"）——session 反序列化注入，在野已确认 **32 次**，几乎不可能误报；
-   multipart 表单中 t\[\] 等同名方括号字段重复 ≥2 次，且同时存在 PHPSESSID 与 upload_progress 字段——CVE-2026-109618 括号数组臂，在野 **117 次**；
-   PHPSESSID 出现在 POST body 而非 Cookie（在野 **515 条**），辅助判据；
-   会话 ID 命名族：atlas+24 位 hex、chainA618 / chainC618\* / mf618wp\* / minfreq618\* / sid618test / poc618selfwrite / php2shellprobe / verify+10 位数字、32 个 a；
-   multipart boundary 族：B7kQpoc618、BNDRY0000N、VERIFY<n>、P#SV、XX / XX<n>、----PRB、----b；
-   文件段 filename 特征：a、x、dummy、t.txt、<?php echo 'PWNED618';?>；
-   高频被扫 URI：/submit.php、/contact.php、/images/upload、/media/upload、/file/upload、/api/upload、/wp-admin/admin-ajax.php、/login/runlogin.html 等。

**网络/流量行为指标**

-   HTTP POST + Content-Type: multipart/form-data，请求体中出现（尤其重复出现的）PHP_SESSION_UPLOAD_PROGRESS 字段；
-   扫描器 User-Agent：php2shell-scan/1.0；
-   multipart 请求中嵌套字段名（files\[a\]\[b\]\[c\]...）、空 filename="" 文件控件、异常大量的段内头部；
-   响应中异常超大或畸形的 PHPSESSID Cookie（内存泄露迹象）；
-   异常 multipart 请求后伴随 HTTP 500/502 聚集。

**日志与主机行为指标**

-   PHP 错误日志：Allowed memory size of... bytes exhausted... in Unknown on line 0 集中出现；
-   php-fpm / php-cgi / httpd / apache2 / lsphp 进程异常派生 sh、bash、python、perl、curl、wget、nc；命令行含 /dev/tcp/、mkfifo、fsockopen 反弹 shell 特征；
-   Web 根目录（尤其 uploads、cache、tmp）新增.php 文件；新增 cron 任务、authorized_keys 条目、系统或应用管理员账户；
-   PHP worker 无解释地频繁崩溃重启（SIGSEGV/SIGABRT）。

附录 C：检测规则与自查工具速查

|     |     |     |
| --- | --- | --- |
| 来源  | 规则/工具 | 说明  |
| Corelight | php2shell-detect<br><br>（Zeek + Suricata，开源） | Zeek 侧含 PHP_Crash_Sequence、Multipart_Header_Flood、Large_Form_Key、Serialized\_\* 系列、Potentially_Affected_PHP_Version 等 Notice；Suricata 侧含 POST body 特征串与版本指纹规则 |
| Cloudflare | 规则 ID b5ccf32f / 82dab691 / bcd95984（免费版默认生效），c438d5dd / 545d163c（Managed Ruleset） | 10-21 03:02 UTC 起默认开启，含请求+响应全事务检测 |
| 奇安信天眼 | 规则 ID 0x10022A87（IDS 特征库 15155 版本） | 支持检测针对该漏洞的攻击 |
| Check Point | 防护方案编号 CPAI-2026-15172 | —   |
| Akamai | Adaptive Security Engine 规则 3000991 | —   |
| OpenAI | php2shell-checker | 不发送攻击流量的暴露面自查工具 |
| Florian Roth | process-watcher<br><br>（开源） | Linux 下监控 PHP 进程派生的每个子进程及命令行 |
| Aikido / Flawfence / Arvion | 在线 checker | 会发送较大 payload，可能打挂 worker；仅限自有系统、低峰期使用；"未检出"不等于已修复 |

**来自一线流量的规则回测要点** （647 条实战流量验证）：

-   upload_progress 标记类规则能命中全部攻击流量，但单独使用无判别力（正常上传业务同样携带该字段）；
-   针对"超长 urlencoded 字段名"的检测思路 **零命中**——实战走的是 multipart t\[\] 重复字段名形态，规则需针对性补写；
-   响应侧 OOM 回显（Allowed memory size... Unknown on line 0）精度高但召回低——观测到的 4 条 HTTP 500 响应体均为空，不能指望从响应侧兜底；
-   切勿把"请求体含 <?php"设为必要条件——实战中 upload_progress 的值通常只是一个 x。

08 参考链接

官方与发现方

**1\. PHP 官方安全公告与发版存档**  
https://www.php.net/archive/2026.php#2026-10-21-5

**2\. GHSA-w8hw-w9fx-j79w（CVE-2026-109618）**  
https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w

**3\. GHSA-6wmf-4rv5-p3rp（CVE-2026-109619）**  
https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp

**4\. PHP 基金会复盘**  
https://thephp.foundation/blog/2026/10/21/todays-php-security-release-and-how-were-strengthening-php-security/

**5\. PHP2Shell 专题站（含 RCE 演示视频）**  
https://php2shell.com

**6\. Wiz Research**  
https://www.wiz.io/blog/php2shell-php-rce

**7\. Calif 技术 writeup**  
https://calif.io/php2shell/

**8\. AWS Security Blog — Amazon Threat Intelligence identifies PHP2Shell exploitation prior to public disclosure in MadPot**

https://aws.amazon.com/cn/blogs/security/amazon-threat-intelligence-identifies-php2shell-exploitation-prior-to-public-disclosure-in-madpot/

在野攻击观测

**9\. Cloudflare**  
https://blog.cloudflare.com/php-vulnerabilities-waf-protection/

**10\. watchTowr FAQ**  
https://watchtowr.com/intelligence/php-cve-2026-109618-faq/

**11\. Hadrian**  
https://hadrian.io/vulnerability-alerts/php2shell-leaked-critical-php-rce-cve-2026-109618-cve-2026-109619

**12\. Patchstack**  
https://patchstack.com/articles/php-major-vulnerability-alert-10-2026/

**13\. SecurityWeek — PHP2Shell Patches Land as First Exploitation Attempts Hit Sensors**  
https://www.securityweek.com/php2shell-patches-land-as-first-exploitation-attempts-hit-sensors/

**14\. SecurityWeek — PHP2Shell: Mass Exploitation Looms for Leaked Critical PHP Flaws**  
https://www.securityweek.com/php2shell-mass-exploitation-looms-for-leaked-critical-php-flaws/

**15\. Fastly**  
https://www.fastly.com/blog/fastlys-proactive-protection-critical-php-rce-cve-2026-109618

**16\. CrowdStrike**  
https://www.crowdstrike.com/en-us/blog/crowdstrike-protects-customers-from-php-rce-zero-days/

**17\. Sansec**  
https://sansec.io/research/php2shell

其他通告

**18\. CERT-EU Security Advisory 2026-018**  
https://cert.europa.eu/publications/security-advisories/2026-018

**29\. 英国 NCSC / 美国 CISA / NSA / FBI 公开通告；日本国家网络安全战略总部注意警戒**

**20\. Modat**  
https://modat.io/blog/php-exposure-before-the-21-oct-2026-security-release/

**21\. VirusTotal**  
https://blog.virustotal.com/2026/10/sizing-php-exposure-window-for-cve-2026.html

**22\. Melurna**  
https://www.melurna.com/blog/php2shell-php-vulnerability-about-to-go-public-cve-2026-109618-and-cve-2026-109619/

**23\. Censys（WordPress EOL PHP 调查）**  
https://censys.com/blog/wordpress-eol-php/

**24\. W3Techs PHP 使用统计**  
https://w3techs.com/technologies/details/pl-php

## 25\. NOSEC 白帽汇 — PHP2Shell 代码执行漏洞影响面测绘分析

**26\. Corelight 检测规则**  
https://github.com/corelight/php2shell-detect

**27\. process-watcher**  
https://github.com/Neo23x0/process-watcher

**28\. 奇安信 CERT — [已发现攻击，全球拉响警报！PHP重大漏洞引发多国紧急响应](https://mp.weixin.qq.com/s?__biz=MzU0NDk0NTAwMw==&mid=2247633637&idx=1&sn=3a6b055b500ee7d4bb05a55eedbe24ba&scene=21#wechat_redirect)**

安全事件分析研判 · 目录
