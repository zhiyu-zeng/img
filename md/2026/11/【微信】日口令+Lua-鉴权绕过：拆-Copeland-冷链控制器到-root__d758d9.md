---
title: 【微信】日口令+Lua 鉴权绕过：拆 Copeland 冷链控制器到 root
source: https://mp.weixin.qq.com/s/gkIJQ-TYuqLiAv2RUd_hGA
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T09:51:46+08:00
trace_id: c7ed549f-1f26-4bc5-ba8c-96e4b980ba1f
content_hash: 545ee7505196eea629d12f8e9aa87cbc40270f092d9a70aac3647baf83139571
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 日口令派生算法与 Lua 空表鉴权绕过可让 Copeland XWEB Pro 冷链监督控制器（XWEB300D/500D PRO）被未认证攻破至 root RCE，共 23 个漏洞（21 高危），固件 1.13 已修复。
ai_summary_style: key-points
images_status:
  total: 15
  succeeded: 15
  failed_urls: []
notion_page_id: 40c75244-d011-81bf-be00-ecedfb862970
ioc:
  cves:
    - CVE-2026-20742
    - CVE-2026-20910
    - CVE-2026-21389
    - CVE-2026-21718
    - CVE-2026-24517
    - CVE-2026-24663
    - CVE-2026-24689
    - CVE-2026-25085
    - CVE-2026-25111
    - CVE-2026-25195
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 日口令派生算法与 Lua 空表鉴权绕过可让 Copeland XWEB Pro 冷链监督控制器（XWEB300D/500D PRO）被未认证攻破至 root RCE，共 23 个漏洞（21 高危），固件 1.13 已修复。
> 
> - **Lua 空表绕过（CVE-2026-25085）：** 未识别的 `auth_mode` 使 `user_authenticate` 返回全空字段 table，而 Lua 中任意 table 均为 truthy，路由只判有无返回值不校验内容，构造异常 Basic 头即可拿到管理端点 200 与数据。
> - **每日口令后门（CVE-2026-21718）：** 固件用落盘的硬编码种子密钥（web.key/ssh.key 等）+ 设备 MAC + 当前日期哈希派生每日 SSH/Web 管理员口令，MAC 与日期可从未认证接口获取且种子全线共用，攻击者可离线复算直接以 root SSH 登录。
> - **19 处 OS 命令注入：** 联系人导入、固件更新、恢复、模板、库安装等 API/CGI 路由把用户输入未消毒拼进系统命令，服务以高权限运行（含未认证的 CVE-2026-24663），过鉴权后距 root 仅一步。
> - **物理破坏演示：** 攻击者经 SSH 进入监督控制器后走 RS485/Modbus 控制 XR60CX 现场板，可把屏显温度改成任意值（演示写 50.5°C），或停风扇的同时让屏显持续跟随探头合法读数——货在升温而仪表「正常」，温湿度日志也不再可信。
> - **处置建议：** 升级至固件 1.13 或更新；无法升级时将管理面从公网与扁平办公网摘除、仅留可信运维网段，关闭不必要的 SSH/Shellinabox/远程更新面，并在资产台账补全型号与固件版本。

**黑卷的IoT攻防日记** *2026年11月2日 09:12*

冷链靠的不是「冷气够不够」，而是监督控制器能不能把温度、告警、法规记录稳稳盯住。Claroty Team82 的 Amir Zaltzman 盯上的，是美国 **Copeland** （承接原 Emerson 冷链产线）的 **XWEB Pro** 系列——现场常见 **XWEB300D PRO / XWEB500D PRO**。研究结论很硬：一共挖出 **23 个漏洞，其中 21 个高危**；从网口一路绕鉴权，就能拿到 **root 级远程代码执行**。实验室还搭了迷你冷柜做物理演示：改显示温度、关风扇却让读数看起来正常——食品和温敏药品，都会在「看起来没事」里坏掉。

厂商已在固件 **1.13** 修复；未升级、又把管理面挂到可达网段的设备，仍是真风险。

![典型冷链架构：监督控制器经网口管运维，经 RS485/Modbus 管现场柜](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4120099b7c4f7631.png)

## 一、监督控制器坐在哪一层

商业制冷多半是分层架构。最上层是 **supervisory controller（监督控制器）**：以太网连运维网，负责集中监视、告警、改参、留合规温度记录。它再经 **RS485**，通常跑 **Modbus**，去管下面一串 **field controller（现场控制器）**——每台冷柜、蒸发器、压缩机旁那块小板。现场板直接读探头、开压缩机、开风扇、跑除霜；监督层只发令、收数。

XWEB Pro 正是这类监督节点。一台能挂多台现场设备，菊花链式往下串。拿下它，不等于立刻拧阀门，但足以改显示、挡告警、关冷却部件，让「柜里在升温」和「屏上还正常」同时成立。冷链合规还依赖监督层留温湿度记录——控制器被控后，日志本身也可能不再可信，事后审计会跟着失真。

![XWEB500D-PRO：Din 轨监督控制器，底侧 RS485 + 以太网](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e642927dd92ea8f3.png)

## 二、CVE-2026-25085：Lua 空表也算过

入口在 Web。设备跑 **Lighttpd**，受保护 API 会进一层 Lua 中间件。访问受保护路由时，先走 `get_authentication` ，解析 `Authorization: Basic` ，期望里面带可识别的 **`auth_mode`** （例如 `standard` 本地账、或 `ldap` ）。认得出，再交给 `user_authenticate` 验密。

问题出在「认不出」的分支。若攻击者塞一个 **未识别的 auth_mode**， `user_authenticate` **没有** 返回 `nil` / `false` 明确拒绝，而是返回一张空表： `{ user = nil, role = nil, recovery = nil }` 。在 Lua 里， **任意 table——哪怕字段全空——都是 truthy**。上层路由只判断「有没有返回值」，不校验内容。于是一道语言学漏洞，直接把行政 API 的数字门卫绕开。

![user\_authenticate：只认 standard/ldap，缺 else，最终仍 return 表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7baecc0f6354e4e4.png)

请求侧表现也很直白：故意构造异常 Authorization，就能摸到本该鉴权的管理端点，拿到 200 与内部数据。这不是「猜到了密码」，而是「语言语义帮攻击者开了门」。嵌入式 Web 栈里用 Lua 做中间件并不少见；一旦把「返回了表」当成「认证成功」，空对象就成了万能通行证。

![鉴权绕过示意：异常 Basic 头骗过路由，HTTP/2 200 回管理数据](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/45d8c509a9620ad3.png)

## 三、CVE-2026-21718：MAC+日期算出的日管理员口令

第二条路更「工程」。固件里有一套 **确定性口令生成**：用当前日期、设备 **MAC**，再配上写死在文件系统里的种子密钥，派生出管理员用的 SSH / Web 口令。日期和 MAC 都能从 **未认证公开接口** 拿到；种子跨产品线相同。用户名只在生成「用户专属恢复口令」时参与，日常管理员日口令不靠它保密。

算法分两段：启动时把硬编码种子和 MAC 哈希成设备密钥；后台按日再把设备密钥和当天日期哈希，得到当日管理员口令（或恢复口令）。文件系统里能直接看到 `web.key` 、 `ssh.key` 、 `recovery.key` 、 `emergency.key` 一类硬编码材料——种子一旦被抽出，整条链就能离线复现。

![固件里的 keys：web / ssh / recovery / emergency 种子落盘](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/715e73d6bdf289e2.png)

攻击者复现算法后，就能启用并登录内置 **SSH** 或 **Shellinabox**。演示里用日口令 SSH 进 `root@XWEB-PRO` ， `ls /` 一览无阻——这已经不是「弱口令猜一猜」，而是「公开输入 + 固定种子 = 每日后门」。口令按日滚动，乍看像安全增强；种子不变、输入可观测时，滚动只是把同一扇门换了日期标签。

![日口令 SSH 登录成功：主机名 XWEB-PRO，身份 root](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad2b20ee04b8f647.png)

## 四、鉴权之后：19 条 OS 命令注入到 root

无论走 Lua 空表绕过，还是走日口令进管理面，后面还有一大片管理功能。Team82 在多条 API / CGI 路径上挖到 **19 个 OS 命令注入**：导入联系人、改网络、升固件、装库、恢复模板……用户可控输入被拼进系统命令，未经严格消毒，再交给 Lua 的系统执行接口。JSON 字段或上传文件里塞 shell 元字符，就能让底层 Linux 跑任意命令；服务以高权限跑，结果是 **立刻 root**。

文中点名的注入面覆盖面很广，例如库安装路由上的未认证命令注入 **CVE-2026-24663**，以及鉴权后的联系人导入 **CVE-2026-21389**、恢复路由 **CVE-2026-25111**、模板路由 **CVE-2026-20742**、固件更新相关 **CVE-2026-24517 / CVE-2026-25195 / CVE-2026-20910 / CVE-2026-24689** 等（影响约 **≤ 1.12.1**，完整清单以厂商与原文附录为准）。「能登录」和「能 root」之间，几乎只隔着一轮未过滤拼接。

![受保护路由上的命令注入示意：请求体塞 $(…) 直达系统](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f595934efbfcf3e.png)

## 五、物理演示：改显示温度，关风扇却显示「正常」

为说明后果，Team82 搭了一套真实物理环境：网口可达的 XWEB，串口挂 **XR60CX** 现场控制器，再接自制迷你冷柜（热电制冷模块由现场板供电）。攻击者先用日口令 SSH 上监督控制器，再经 Modbus 寄存器图（对照 XR60CX 手册与协议分析自建）去控现场板。

![XR60CX 现场控制器：直接管探头、风扇、压缩机、除霜](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64d59dbc54e60acc.png) ![DIY 迷你冷柜示意：XR60CX + 热电模块 + 外接电源](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7aee953a18c5e23a.png) ![演示拓扑：攻击机 → 网 → XWEB → 串口 Modbus → XR60CX / 冷柜](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4342ac3da229db2.png)

PoC 菜单两条能力很「冷链」：

1.  **任意改显示温度**
    
    ：把 XR60CX 屏显设成 −50°C～110°C 间任意值，与探头真实读数脱钩。演示里一键写成 **50.5°C**，屏上立刻跟上。
    
2.  **搅坏内容却伪装正常**
    
    ：持续把屏显刷成探头当前合法读数，同时把冷却风扇输出打到 0。柜内慢慢升温、货坏了，屏上却一直「正常」。
    

![PoC：日口令 SSH 后，经 Modbus 把显示温度改成 50.5°C](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2c2f7fe81ab44936.jpg) ![PoC：显示仍跟探头 10.9°C，风扇已停——升温在「正常读数」下发生](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f7b285a7215285e9.jpg)

这就是 OT 里最狠的一类结果：不是炸机器，而是 **让物理过程静悄悄偏离，同时让人信仪表**。超市冷柜、药品冷库、配送中心——监督层一失守，下游现场板就是执行器。

## 六、补丁 1.13 与隔离建议

Copeland 已协同披露并给出修复： **请把 XWEB Pro 升到固件 1.13 或更新**。有网的设备也可在菜单 **SYSTEM → Updates | Network** 走厂商侧更新（以官方说明为准）。升不了的，至少先做三件笨事：管理口从公网和扁平办公网摘掉；只留给可信运维网段；关掉不必要的 SSH / Shellinabox / 远程更新面。资产台账里如果只写了「冷链网关 / Dixell / Emerson」，建议补一行型号与固件版本，避免下次通报对不上号。

对已做外网测绘的团队，把 **Copeland / XWEB Pro / XWEB300D / XWEB500D** 写进专项检索，并与版本台账交叉——这类监督控制器暴露面，往往比想象中更「像一台 Linux Web 盒」。集成商交付时若默认打开远程桌面类组件，等于把日口令利用面直接铺到运维可达路径上；能关的服务先关，再谈补丁窗口。

## 黑卷点评

这又是一次「监督层 = 物理根」的提醒：冷链不靠现场板自己「安全」，靠的是上面那台会说话的灰盒子。

-   **Lua truthy 坑**
    
    。空表仍算真，路由只看「有没有返回」——语言细节写成鉴权语义，等于把门卫换成「只要递张空白卡就放行」。
    
-   **日口令是可复现后门**
    
    。MAC + 日期公开可得，种子全线共用，SSH/Web 管理员口令能离线算——这不是运维疏忽，是设计把可预测输入当成秘密。
    
-   **鉴权后一片命令拼接**
    
    。联系人、固件、恢复、模板……19 处注入说明管理面从未按「已登录仍敌意」建模；过了门就到 root。
    

能升 **1.13** 就升；升不了就先断暴露面。别让「今天的口令」和「空表也算过」，决定一整库货的温度。

![XR60CX 默认参数表片段：设定点、探头、延时等现场语义](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5587c45ce5e4fc04.png)

* * *

⚠️  
本人所有文章均为技术分享，均用于防御为目的的记录，请勿用于其他用途，否则后果自负。

🔧 更多内容在星球「黑卷的IoT攻防日记」

这里长期更新，专注 IoT / 车联网 / 机器人 / AI 安全实战：

· 每天一篇一线漏洞拆解与复现思路，紧跟最新 CVE

· 累计整车实测 20+、IoT 组件 100+ 的经验沉淀与踩坑笔记

· 车联网 / V2X / 固件逆向 的资料、工具与字典

· 星球里提问，我 24 小时内必答，一起挖洞、上分、接项目

![星球「黑卷的IoT攻防日记」](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/74bd9299db9f7113.jpg)

👇 扫码进星球「黑卷的IoT攻防日记」· 🎟 早鸟价 ¥98/年

![知识星球付费二维码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffa283de4d072672.png)

**往期推荐**

-   [从调试口抽到改固件：Sonoff ZigBee 网关的芯片到云端两条 CVE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486121&idx=1&sn=fa00d6550883f102a66c5308fc9197e8&scene=21#wechat_redirect)
    
-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485429&idx=1&sn=5a4cdfd6982657765522258b8310892d&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
