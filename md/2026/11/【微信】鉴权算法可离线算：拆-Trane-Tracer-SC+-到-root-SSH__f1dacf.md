---
title: 【微信】鉴权算法可离线算：拆 Trane Tracer SC+ 到 root SSH
source: https://mp.weixin.qq.com/s/RdvarxTHQH6Mjh6vnCOI8Q
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:44:44+08:00
trace_id: 79f063ef-8215-45ae-8bf0-31d6c23495f6
content_hash: ebed516284cedc7db7c368f78ec6e20cc291b3a98395988c963bfc4bdb43fc7d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 41475244-d011-8145-916e-f8aa175a21a1
ioc:
  cves:
    - CVE-2026-28252
    - CVE-2026-28253
    - CVE-2026-28254
    - CVE-2026-28255
    - CVE-2026-28256
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**黑卷的IoT攻防日记** *2026年11月10日 11:54*

数据中心最怕的，往往不是算力不够，而是 **热散不出去**。Claroty Team82 的 Amir Zaltzman 盯上的，是美国 **Trane Tracer SC+**——楼宇自控 / HVAC 里常见的那台监督控制器。结论很硬：一条链里挖出 **5 个 CVE**，其中包括可离线算的诊断鉴权绕过，直达 **root SSH**；再叠预认证 DoS、未鉴权信息泄露、硬编码全局凭证与密钥常量。影响覆盖至文中所称 **v6.2** （披露点名至 **v5.20.1362**）；厂商建议升到 **v6.3（2026-03-01）或更高**。诊断 SSH **默认关闭**，手动打开后才可打——但现场为运维方便开着的并不少。

![Trane Tracer SC+：楼宇 / 数据中心冷却侧的 BMS 大脑](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c00297889150eeb4.png)

## 一、冷却控制器坐在哪一层

谈现代机房，大家先想到机柜、光纤、算力。真正让机器「活着」的，还有另一套关键基础设施： **冷却**。服务器持续产热，HVAC 一挂，轻则热保护关机，重则硬件损坏、业务中断，损失可按百万美元计。这类系统直接控物理环境，已经是高敏的 **赛博-物理资产**——数字大脑守着机房的物理稳态。

Tracer SC+ 正是这类节点：以太网连运维与云，经 **BACnet / LonTalk** 等再挂下游现场设备。一台监督控制器往往管着一整片楼层或机房的设定点、告警与远程排障。拿下它，不等于立刻拧阀门，但足以改设定、挡告警、扰动冷却，让「机房在升温」和「面板还正常」同时成立。厂商也反复强调： **管理面不要挂公网**；一旦暴露，下面几条洞就不再是实验室故事。

对数据中心与关键楼宇来说，冷却侧被控的后果，常常比「多一台被黑的 Linux 盒」更疼：热通道失控、冗余冷源被误关、告警被静音——物理过程静悄悄偏离，运维还以为仪表可信。这也是为什么 BMS / HVAC 监督器正在被当成 OT 正面目标，而不是「空调小盒子」。

![攻击面总览示意：鉴权绕过、预认证 DoS、信息泄露、硬编码钥](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1beca39a672c5d83.png)

## 二、CVE-2026-28252：挑战 GUID 可离线算成 root

入口在 **Trane Diagnostic Service**——给授权人员远程排障用的通道。设备连上后会吐出一串随机 **GUID** 当挑战；客户端要算出对应响应，对上了才给 shell。实现落在 Linux PAM 模块 **`pam_TraneAuthenitcate.so`** 的 `pam_sm_authenticate` ：取出挑战，跑 `DecodePassword` ，再 `strcmp` 用户输入。

![诊断 SSH 挑战提示：设备吐出随机 GUID，等你填响应](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2e58114e5ed5d109.png)

问题在于：这套算法是 **确定性替换密码**， **不依赖任何只有 Trane 才知道的密钥**。谁掌握算法，谁就能离线算出期望响应。表面上看「每次挑战都随机」，像多了一层动态口令；拆开之后会发现，随机只发生在挑战本身，响应完全由公开算法与硬编码表决定。

![pam\_sm\_authenticate：DecodePassword 后 strcmp，算对即放行](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/42ea9c1c77f40206.png)

`DecodePassword` 里，search / keypad 两张硬编码表做查表与差分取模，可概括为：

-   `response[0] = keypad[search.find(challenge[0])]`
-   `response[i] = keypad[(search.find(challenge[i]) - search.find(challenge[i-1])) % 31]`

挑战格式是 `XXXX-XXXX-XXXX-XXXX` ，响应同形。没有私钥、没有 HMAC 盐——只有「看起来像加密」的 GUID 游戏。Team82 的建议很直接：这类诊断通道应该用 **公私钥对**，而不是可公开复现的替换表。

![DecodePassword 替换密码示意：硬编码 search/keypad，无密钥](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa8c91a4d463be43.png)

演示里，脚本把 GUID `9ARN-CLRD-TQC2-ILU6` 算出 `VJ2D-4M7Z-U2SR-KTSA` ，SSH 进 root， `id` 直接 `uid=0(root)` 。需要强调前提：SSH **默认关着**；只有运维或集成商手动打开诊断服务后，这条链才从「纸面漏洞」变成「可达 root」。现场为了厂商远程排障、半夜抢修，把诊断口常开的情况并不罕见——默认关闭不等于实际关闭。

![PoC：离线算响应后 SSH 到 root，id 显示 uid=0](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f4be3aa2ea94eb63.png) ![鉴权绕过示意：挑战 → DecodePassword → root shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8126410aa7ce1c50.png)

## 三、CVE-2026-28253：recvLine 无上限头，预认证撑爆

主服务在 **HydraMain**，扛 HTTP 与 BACnet。读请求头走 `TEvoHttpReceiver::recvLine` ：按字节读到 `\r\n` ，缓冲从约 **0x40** 起，不够就 **左移一倍** 再 `operator.new[]` 。全程 **没有单头长度上限**。

![recvLine 起步：默认 0x40，随后进入按字节接收循环](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf7d0ccfedcff6f3.png)

向 Web 端口灌大约 **2GB**、中间不插换行的数据，服务会一路扩缓冲，最终在巨型 `new[]` 上失败，抛出 **SIGABRT**—— **无需登录**，只要摸到主 HTTP 口。对机房运维来说，这不是「网页打不开」那么简单：监督进程一挂，集中监视、告警转发、对下游的正常控制节奏都可能一起抖。预认证 DoS 往往被当成「噪声」，但在冷却链路上，可用性本身就是安全目标。

![recvLine 扩容：容量满则 <<1 再分配，无上限](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c11ee091d12fb235.png)

## 四、CVE-2026-28254：多条 API 免登录泄底

Web 上还有一批 **未鉴权** 路由，能摸到设备与下游拓扑：

-   `/evox/tis/websocketTunnelStatus`
    
    ：是否连着 Trane 云隧道
    
-   `/evox/bacnet/report`
    
    ：完整 BACnet 栈状态与绑定
    
-   `/uidata/hui/NavTreeData.hui`
    
    ：缓存 GUI 资产，含楼层图等
    

攻击者可据此测绘楼宇自动化内网、认下游控制器，甚至继续对话现场设备——为后续改设定、扰 HVAC、横向进 OT 铺路。许可证、序列号、远程接入 / 云配置一类设备画像，也会从这类接口里漏出来，方便和后面的硬编码凭证链拼图。

![未鉴权 API：websocketTunnelStatus 直接回 Connected](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fcf8683d3a4a8e6c.png) ![未鉴权 BACnet 报告：栈状态、地址绑定、路由一览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/44f8a425f4ddb2a8.png)

## 五、CVE-2026-28255 / 28256：全局凭证与硬编码钥

文件系统里还有一份 **加密存放、全设备共用** 的远程服务凭证。密文靠 **Blowfish** 解开，而解密钥本身又是 **硬编码常量** （CVE-2026-28256）。有的口令还搭配可猜 / 可查的值——例如序列号当「密码」，而序列号又能从前面那类未保护 API 拿到。全球共用同一套材料，意味着「抽出一份」就可能影响「一片设备」。

![用硬编码 Blowfish 钥解开配置里的全局凭证（示意截图已打码）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a1fe3b4d166aa2a.png)

配置里还能直接扫到 Trane 云采集、自动登录、WebSocket 等一串后端地址；另有一块 **默认未挂载** 的存储，挂上后可见备份 / 固件相关密钥与口令文件（如 `identity-*.pem` 、 `pw_backup.txt` 、 `pw_update.txt` ）。能挂上这块盘的人，等于摸到更新与备份的加密材料——再叠 root shell，横向与持久化空间会一下子变大。

![TisGatewaySettings：硬编码云端 URL 与被打码的敏感段](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db47df71c543af0d.png) ![挂载未挂载块设备后：证书、私钥、备份/更新口令文件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/818e14c35521c31f.png)

## 六、补丁 v6.3 与隔离建议

Team82 已与 Trane 协同披露。官方建议： **把 Tracer SC+ 升到 v6.3（2026-03-01）或更高**。升不了的，至少先做三件笨事：管理口从公网和扁平办公网摘掉；只留给可信运维网段； **诊断 SSH / 远程排障面非必要保持关闭**。资产台账里如果只写了「Trane / HVAC / BMS」，建议补型号与固件版本，避免通报对不上号。

外网测绘侧，把 **Trane / Tracer SC+** 写进专项检索，并与版本台账交叉——这类冷却监督器暴露面，往往比想象中更「像一台 Linux Web 盒」。集成商若默认打开诊断通道，等于把可离线算的鉴权面直接铺到运维可达路径上；能关的服务先关，再谈补丁窗口。变更窗口紧的机房，也可以先做「只读暴露面收敛」：关诊断、收紧防火墙、拆掉不必要的云隧道，再排队升固件。

![关键数字示意：5 个 CVE、v6.3 补丁、算法无密钥、~2GB DoS](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ffdd18c006c65b1e.png)

## 黑卷点评

这又是一次「**算法看起来像加密，其实没有密钥**」的提醒：冷却是数据中心的物理根，监督控制器失守，后面全是执行器。

-   **挑战-响应可以离线复现**
    
    。GUID + 硬编码 search/keypad，无 Trane 私密种子，PAM 一比一对上就 root——该用的是密钥对，不是替换表。默认关 SSH 救不了「现场常开」。
    
-   **预认证就能把主服务撑死**
    
    。recvLine 无上限翻倍扩容，~2GB 无换行头即可 SIGABRT，可用性直接归零；冷却链路上，可用性就是安全。
    
-   **未鉴权 API + 全局硬编码凭证**
    
    。云状态、BACnet、楼层图免登录可拿；Blowfish 钥写死，备份/固件材料还躺在未挂载块上——情报与凭据一锅端。
    

能升 **v6.3+** 就升；升不了就先断暴露面、关诊断服务。别让「今天的 GUID」决定一整座机房的温度。

![黑卷点评示意：冷却即关键基础设施，算法不是密钥](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/931cdba96be348db.png)

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
