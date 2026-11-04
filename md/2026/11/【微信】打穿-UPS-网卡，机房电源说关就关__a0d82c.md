---
title: 【微信】打穿 UPS 网卡，机房电源说关就关
source: https://mp.weixin.qq.com/s/koQET3ltnwu-dc03AEOIag
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T13:00:03+08:00
trace_id: 7d5726cb-5d76-46eb-bdad-f652cb12719f
content_hash: 8a4ff043133f7264ea7a27bc83fa8053ffc61387864e7ef9ee8b285b991ab026
status: synced
tags:
  - 微信
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Vertiv Liebert UPS 网卡被挖出两条 CVSS 9.8 漏洞（鉴权绕过 + 栈溢出 RCE），串联后可远程向 UPS 下发 output OFF，切断数据中心整片供电。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 40e75244-d011-8194-bba6-f4459c56d689
ioc:
  cves:
    - CVE-2025-41426
    - CVE-2025-46412
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Vertiv Liebert UPS 网卡被挖出两条 CVSS 9.8 漏洞（鉴权绕过 + 栈溢出 RCE），串联后可远程向 UPS 下发 output OFF，切断数据中心整片供电。
> 
> - **两条核心漏洞：** CVE-2025-46412 利用 pldproxyweb「query 里 contains 某关键字即放行」的路由逻辑，把登录关键字叠在敏感操作关键字前即可无 Cookie 改配置、重置管理员口令（未混淆返回 401，混淆后返回 200）；CVE-2025-41426 是 `sprintf(local_buf, "%s %s %s", METHOD, URI, sessACT)` 栈溢出，URI 与 sessACT 有长度检查故从 REQUEST_METHOD 下手，sessACT 支持非 ASCII 便于搭 ROP，但该洞本身需鉴权——靠第一条洞串联喂饱。
> 
> - **杀伤链落点：** 登录配置面后可对受管 UPS 下发 output OFF，电源语义即切断输出，一秒内让下游服务器、交换机、存储集体掉电，且物理过程先于运维面板感知。
> 
> - **研究方法可复用：** 固件 binwalk 解包后在树莓派 chroot 跑用户态，Vertiv 私有 PLDServer 难仿真，只拉起 Apache httpd + mod_fcgi → pldproxyweb 这层即可覆盖鉴权与分发路径；真机侧不用买整机柜 UPS，按 RDU101 规格 7–12 V DC、3.6 W 台供（10 V 限流 0.36 A），用 USB 屏蔽找 GND、金手指上与保险丝短路的那根推断 VIN 即可点亮网卡。
> 
> - **验证与复现细节：** 主量化的 RDU101 为 Linux ARM 32 位，买来的 IS-UNITY-DP 是 Linux PowerPC，仿真别扭所以真机只做「盖章」验证；漏洞主要在 ARM 固件里挖出。
> 
> - **补丁与收敛建议：** RDU101 升 v1.9.1.2_0000001、IS-UNITY 升 v8.4.3.1_00160；升不了的先把管理口从公网和扁平办公网摘掉、只留可信运维网段，并把 Vertiv / Liebert / IntelliSlot / UNITY / RDU101 写进外网测绘专项与资产台账交叉比对。

**黑卷的IoT攻防日记** *2026年11月4日 08:46*

机房最怕的，往往不是算力不够，而是 **电说断就断**。Claroty Team82 的 Vera Mens 盯上的，是美国 **Vertiv Liebert** 系列 UPS 的网络管理卡—— **IS-UNITY-DP** 与 **RDU101**。结论很硬：两条洞均为 **CVSS 9.8**—— **CVE-2025-46412** 用 URI/查询串混淆绕过鉴权，直接摸到配置面； **CVE-2025-41426** 用栈上不安全的 `sprintf` 打出远程代码执行。合在一起，攻击者可以对 UPS 下发 **output OFF**，等于远程切断受该 UPS 供电的整片负载。厂商已出补丁：RDU101 升到 **v1.9.1.2_0000001**，IS-UNITY 升到 **v8.4.3.1_00160**。

![台供上电的 Liebert IS-UNITY-DP：不靠整机柜 UPS 也能跑起来](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9bb7c699b5df32ee.jpg)

## 一、UPS 网卡坐在哪一层

谈数据中心，大家先想到机柜、光纤、GPU。真正让机器「活着」的，还有另一套关键基础设施： **不间断电源**。市电晃一下，UPS 切到内部电池，避免服务器瞬间掉电；要维护市电侧，UPS 还得托住安全关机，把正在跑的业务优雅收掉，而不是硬拔插头。功率从小笔记本旁的砖头，到六开门机柜那么大的阵列，形态差很远，职责却一样—— **保电、稳压、可预期地下电**。

许多机型出厂不带网口。运维要远程看电量、收 SNMP / Modbus / BACnet 告警，或跟楼宇/虚拟化平台联动，就得再买一张 **通信卡** 插进 IntelliSlot 一类扩展位。有了网卡，UPS 能跟 VMware vSphere 等编排层说话：电源异常时先迁虚机、再下电，听起来是运维福音——攻击面也跟着从「本地 USB」扩到「整段以太网」。

这张卡一旦失守，后果不是「多一台被黑的 Linux 盒」，而是 **下游服务器、交换机、防火墙一起掉电**。Team82 选 Vertiv（前 Emerson Network Power），固件可从官网公开下载；主力量化在 RDU101（Linux ARM 32 位）上做静态分析与仿真，再用买到的 UNITY-DP（Linux PowerPC）做真机验证——PowerPC 仿真别扭，真卡用来「盖章」，洞则主要在 ARM 固件里挖。

对数据中心与关键楼宇来说，供电侧被控的后果，常常比「多一台被黑的嵌入式 Linux」更疼：冗余电源被误关、安全关机流程被跳过、整排机柜同时掉电——物理过程一秒内完成，运维面板上却可能还显示着「刚才还正常」。这也是为什么 UPS 通信模块正在被当成 OT 正面目标，而不是「机柜角落里的小配件」。

![Vertiv Web 管理界面：输入 / 电池 / 输出一览](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d75f3c1869dfe177.png) ![攻击面总览示意：URI 混淆鉴权绕过 + 栈溢出 RCE](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/af224d88cb0d8573.png)

## 二、仿真与真机：先把 Web 面拉起来

固件是带设备树、内核和 rootfs 的归档。研究只盯用户态，于是把 rootfs 丢进树莓派： `binwalk` 解包、挂上 `/proc` 与 `/dev` 、再 `chroot` 进环境。库从 chroot 内相对路径加载，主应用能跑起来——但 Vertiv 生态重度依赖私有进程 **PLDServer**，几乎所有内部操作与 IPC 都绕不开它。完整 UI 很难在仿真里复现；硬补丁 PLDServer 成本太高，Team82 选择只拉起 **Apache httpd + mod_fcgi → pldproxyweb** 这一层：页面回空， **鉴权与请求分发路径却是通的**，足够当靶。

真机侧更麻烦：网卡要插在 UPS 机箱边接座上，整机可能有衣柜那么大，预算不允许为「给网卡供电」买一台。产品册写 RDU101 工作电压 **7–12 V DC**、最大功耗 **3.6 W**；UNITY-DP 偏偏没有板级规格书，只能按同档猜。万用表对 USB 屏蔽找 **GND**，再在金手指上找与保险丝短路的那根当 **VIN** （保险丝常见于电源入口），焊跳线接台供，插上网线——以太网灯一闪，ARP 拿到地址，浏览器就能打开 Web。

![IS-UNITY-DP 板卡本体：金手指 + 以太网面板](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/da24724891251961.png) ![实验室台面：夹具上的网卡、Wireshark 与固件终端](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b26415bcb1e7f1ed.jpg) ![边缘金手指旁保险丝：推断 VIN 供电脚（示意标注）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f01ff55003b9cdfe.jpg) ![台供限流：10 V、电流上限约 0.36 A](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/16b3a35dffd35930.png)

按功率公式：\\(3.6 \\ge 10 \\times A\\) → \\(A \\le 0.36\\)。电压落在 7–12 V 区间均可，关键是 **限流**，避免焊错脚或浪涌把板子烧穿。二手卡上电后，默认口令往往早已被改过；与其恢复出厂，不如直接拿第一条洞验证「能不能在不登录的情况下改配置」。

## 三、CVE-2025-46412：关键字「出现」就能免登录

Web 面默认开着，负责配卡、配 UPS，攻击面最大。 `pldproxyweb` 里，请求类型不是靠「固定路径 + 固定参数位」，而是看 **query 里有没有某个字符串**。文中用伪代码说明：外层若发现 `login` 就跳过鉴权进入「已放行」分支；内层 `if/else` 的 **顺序** 一旦先匹配敏感操作（重置管理员口令、上传配置、升固件），构造形如「登录关键字叠敏感关键字」的 URL，就能在 **无会话 Cookie** 的情况下跑特权接口。

静态分析显示 RDU101 与 UNITY 的 Web 实现都存在这类逻辑。它几乎「好得不像真的」——直到真机上用 Burp 手搓请求验证。表面看，文件名约束、内存处理、登录检查都还像样；真正的破绽藏在「**字符串出现 ≠ 出现在正确位置**」这一层。

![URI 混淆示意：contains 判定 + if 顺序 = 免鉴权敏感操作](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3b2aee79532f2501.png)

Vertiv 支持导入/导出配置，口令可被导入覆盖（导出侧会打码敏感字段）。不带 Cookie 直传配置导入：正常路径回 **HTTP 401 Unauthorized**；叠上 URL 混淆后回 **200 OK**，页面脚本里写着 *Upload successful - import starting...*。随后用新口令登录 Web——等于任意暴露在网上的 UNITY-DP，都可能被改成攻击者知道的账号。

![未走混淆：配置导入返回 401 Unauthorized](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49e7d9074021ea1d.png) ![走 URL 混淆：200 OK，Upload successful](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2dd13898d8a7cc7b.png) ![绕过后登录：进入 Communications / System 配置面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/895347955aacd570.png)

登录之后能做的事很「UPS」：改配置、锁别人进不去，更狠的是对受管 UPS 下发 **output OFF**——电源语义里就是 **切断输出**。数据中心里，一张网卡对应的可能是一排机柜甚至更多；这一刀下去，不是网页 500，是业务真断、存储真掉、链路真断。Team82 强调：仅凭这一条，已经能对依赖 UPS 保供电的组织造成实质性破坏；他们还想继续要 **代码执行**。

攻击者可据此登录任意公网暴露的 Vertiv Liebert IS-UNITY-DP 配置界面，管理单台或多台 UPS。除了把别人锁在门外，真正的杀伤在电源语义本身：一次「output OFF」，就可能让依赖该 UPS 的设备集体失电。数据中心里，这不是演示用的实验室彩蛋，而是可用性与安全目标重叠的那条红线。

## 四、CVE-2025-41426：sprintf 把返回地址送出去

二进制里还能看到典型写法： `getenv("REQUEST_METHOD")` 后，用 **`sprintf(local_buf, "%s %s %s", HTTP_METHOD, URI, sessACT)`** 往栈缓冲里拼三节字符串。URI 与会话完整性变量 `sessACT` 在进入这段前有长度检查，于是溢出面落到 **REQUEST_METHOD**； `sessACT` 又来自请求体且支持非 ASCII，搭 ROP 链比只能塞 ASCII 的 URI 方便得多。拉长 METHOD，服务端直接甩 **Internal Server Error**；调试器里可以确认返回指针被覆盖、控制流可被劫持。

![不安全的 sprintf：METHOD / URI / sessACT 拼进栈缓冲](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e03d068fa241bd5.png) ![拉长 REQUEST\_METHOD：服务端直接 Internal Server Error](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d406d76ced30e6a1.png) ![调试器侧确认控制流可被劫持（示意截图）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/004794f53e4a665d.png)

需要强调：这条溢出 **本身要求鉴权**。但在 CVE-2025-46412 已经把门踹开的前提下，「需要登录」几乎不再构成门槛——两条洞是串联关系，不是二选一。

## 五、补丁版本与隔离建议

两条洞披露时均在当时最新固件上复现，CVSS 同为 **9.8**。Vertiv 配合负责任披露并快速出补丁，官方建议：

-   **Liebert RDU101**
    
    → **v1.9.1.2_0000001**
    
-   **Liebert IS-UNITY**
    
    → **v8.4.3.1_00160**
    

升不了的，至少先做三件笨事：管理口从公网和扁平办公网摘掉；只留给可信运维网段；外网测绘里把 Vertiv / Liebert / UNITY / RDU101 写进专项检索，和资产台账里的型号、固件版本交叉。集成商若默认把通信卡 Web 挂到可达网段，等于把「改口令 + 断电 + RCE」面直接铺到攻击路径上。变更窗口紧的机房，也可以先做「只读暴露面收敛」：收紧防火墙、拆掉不必要的远程通路，再排队升固件。

外网测绘侧，建议把 Vertiv / Liebert / IntelliSlot / UNITY / RDU101 写进专项语法，并与版本台账交叉——这类通信卡暴露面，往往比想象中更「像一台挂在机柜里的 Web 盒」。能关的远程服务先关，再谈补丁窗口；变更窗口紧的机房，也可以先做管理面收敛，再排队升固件。

![关键数字示意：2 个 9.8、output OFF、补丁版本](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c03a6cef80356452.png)

## 黑卷点评

这又是一次「**网卡只是配件？不，它是供电大脑的遥控器**」的提醒：数据中心算力再强，UPS 通信面失守，后面全是掉电。

-   **路由靠 contains，顺序决定命运**
-   **鉴权绕过叠不安全 sprintf**
    
    。METHOD 溢出栈、sessACT 方便 ROP，需要登录的 RCE 被第一条洞直接喂饱；CVSS 两个 9.8，不是吓唬人。
    
-   **物理侧也给了启示**
    
    ：没整机照样台供上电、限流 0.36 A——研究门槛在「懂板与协议」，不在「买得起机柜」。防守侧同理：别假设「网卡一定插在不可达的机箱里」。
    

能升 **RDU101 v1.9.1.2_0000001 / UNITY v8.4.3.1_00160** 就升；升不了就先断暴露面。别让一张 IntelliSlot 卡，决定整排机柜亮不亮。

![黑卷点评示意：供电即关键基础设施，网卡不是配件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5276f614d922cdb8.png)

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
