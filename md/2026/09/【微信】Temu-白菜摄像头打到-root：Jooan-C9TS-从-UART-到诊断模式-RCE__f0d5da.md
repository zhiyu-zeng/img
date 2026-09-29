---
title: 【微信】Temu 白菜摄像头打到 root：Jooan C9TS 从 UART 到诊断模式 RCE
source: https://mp.weixin.qq.com/s/pw--NfjpGQqJKDbKI-_JHg
source_host: mp.weixin.qq.com
clip_date: 2026-09-29T09:10:43+08:00
trace_id: 92d9e553-5a22-4208-809b-3a36f0e5eae7
content_hash: d020b7bd85fd2afaaf8650b46cc28684ad80f64a1bf5775500608acb53c16689
status: synced
tags:
  - 微信
  - 硬件逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 廉价 Jooan C9TS 摄像头硬件路线撞墙后，转向 Cam720 App 逆向，挖出隐藏诊断通道，局域网内凭硬编码口令即可 root。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3ea75244-d011-818e-b38a-f11bae7cc976
ioc:
  cves:
    - CVE-2026-20374
    - CVE-2026-31077
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 廉价 Jooan C9TS 摄像头硬件路线撞墙后，转向 Cam720 App 逆向，挖出隐藏诊断通道，局域网内凭硬编码口令即可 root。
> 
> - **硬件路径受阻：** 主控 Ingenic T23 + SPI Flash，UART 焊盘可定位但日志半截即停，闯入的是带密码的 U-Boot；Flash（25QH64DHIQ）用 XGecu T48 也识别不了，无公开固件。
> - **App 静态线索：** jadx 反编译 Cam720，在 `com/jooan/biz/firmware_update/` 找到 OTA 链路（P2P IOCtrl 0x40080E 下发 192 字节版本/MD5/URL）；内部型号为 JA-C9T。
> - **硬编码密钥：** `BasicConstants` 中 Base64 密文配 `GLOBAL_INFO_AES_KEY="0032561478523654"`，AES/CBC（IV `0102030405060708`）可还原生产 API 域名。
> - **RCE 机制：** 诊断 Activity 虽 `exported="false"` 但可 ADB 拉起；App 经 `/goform/SingleHandlebyCommand`（`SetDiagMode`，写死 userid=admin、userkey=MD5("admin123")）让 `jooandia` 回连，授权码作 AES-128 密钥，非保活报文直接交 `/bin/sh -c` 执行，已在 QEMU 验证。
> - **绕过云端校验：** `jooanipc` 不校验 HTTP authcode，同局域网攻击者自选 6 位码即可提权，无需厂商账号；提权后改写 `/dev/mtd1` 的 `console=null` 重开 UART。

**赛博安全攻防日记** *2026年9月29日 08:34*

## Temu 白菜摄像头打到 root：Jooan C9TS 从 UART 到诊断模式 RCE

一台 Temu 上的廉价 IP 摄像头，如何从拆机焊 UART，绕到 App 隐藏诊断通道，最终拿到 root。

![封面示意](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0bbb2c779a1051ba.jpg)

*图 1：从 Temu 摄像头到 root 的研究路径示意。*

## 拆开外壳：Ingenic T23

作者把「年度摸鱼项目」定成硬件 hacking，备齐烙铁、万用表、Bus Pirate、CH341 等，目标选了 Temu 上很便宜的 **Jooan C9TS** IP 摄像头。拆开外壳后，主控是预算机常见的 **Ingenic T23**，旁边配 SPI Flash。板子布局干净，方便找调试焊盘。

![主板布局](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fc1484b15b7855e.jpg)

*图 2：主板 — Ingenic T23 + SPI Flash。*

## 找串口焊盘

上电后用万用表在 CPU 附近探电压抖动，成功定位 UART 的 **TX / RX** 焊盘。

![UART 焊盘](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3306db715cd9d51c.jpg)

*图 3：SoC 附近的 UART TX/RX 焊盘。*

## 串口只有半截日志：U-Boot 上了锁

焊线接到 Bus Pirate 后能看到启动日志，但很快停住；回车无响应，拿不到交互 shell。尝试拉低 SPI Flash 的 DO 打断启动，进入的是 **带密码的 U-Boot**。串口这扇「正门」被锁死了。

![UART 启动日志](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/519371b533e0f7b3.jpg)

*图 4：UART 启动日志只打到一半就静音。*

## 读 Flash：硬件这条路先撞墙

转去用烧录座直接读 SPI Flash。初期 CH341 方案识别失败；升级到 **XGecu T48** 后拆焊芯片时还弄断过一根脚（又买了一台），丝印 **25QH64DHIQ** （属 XMC / XM25QH64C 一类，UART 日志也有提示）仍无法被识别，换通用 SPI 配置也不行。用已知正常的 BIOS 芯片验证过烧录器本身没问题。

![Flash 芯片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/117eeda1e18d214f.jpg)

*图 5：拆下的 SPI Flash — 烧录器始终识别不了。*

论坛和 Thingino Discord 也没有针对这颗料的现成解法，网上也找不到该 SKU 的公开固件。硬件线暂时搁置，但 UART 线还留在板上，方便以后再战。

![仍焊着 UART 的摄像头](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dd7e545bb0ba6d5c.jpg)

*图 6：暂时收队，UART 飞线还留着。*

## 换路线：逆向配套 App Cam720

摄像头配套 App 是 **Cam720**。硬件卡住后，作者用 **jadx** 反编译 APK，全文搜 `"firmware"` ，落到 `com/jooan/biz/firmware_update/` 。

![jadx 中的固件升级包](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6021f5ef518396f0.jpg)

*图 7：jadx 里的固件升级相关包。*

升级链路主要由四个类组成：URL 拼装、HTTP 请求、Presenter、XML 解析。

![固件升级相关文件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ee6d3b8a59422830.jpg)

*图 8：固件升级子系统的关键文件。*

静态分析要点：

-   旧 CDN 常量 `FW_UPDATE_HEAD_URL` 指向 `http://www.5qa.so/file/tFirmware/` ；实际流量里还能看到 `use1upgrade1.jooaniot.com`
    
-   零售名 **C9TS**，固件子系统内部型号是 **JA-C9T**
    
-   OTA 通过 P2P IOCtrl（ `0x40080E` ）下发 192 字节控制块（版本 / MD5 / URL）
    
-   再搜 `"diagnosis"` ，挖到隐藏的厂商远程排障功能： `com/jooan/qiaoanzhilian/ali/diagnosis/`
    

## 解密云端地址常量

`BasicConstants` 里是一堆 Base64 密文，以及 `GLOBAL_INFO_AES_KEY = "0032561478523654"` 。配合 `AesCbcUtils` （AES/CBC，IV= `0102030405060708` ）解密，能还原生产环境 API（如 `use1api.jooaniot.com` 、 `qanetty.qalink.cn` ）。

![AES 相关常量](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/39589b693eb471de.jpg)

*图 9：用于解密常量的硬编码 AES 材料。*

## 隐藏的 Diagnosis 诊断模式

诊断相关 Activity 都标了 `android:exported="false"` ，但仍可用 ADB 拉起。界面先出权限说明，再给出 **6 位授权码**。

![诊断权限说明](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4896ff690e4d30be.jpg)

*图 10：App 内诊断权限提示。*

![6 位诊断码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/445d89b73bdac204.jpg)

*图 11：诊断模式的 6 位授权码。*

防御视角下的关键链路（只保留机制，不展开武器化细节）：

1.  App 向云端（ `qanetty.qalink.cn` ）申请 authorizationCode
    
2.  App 用局域网明文 HTTP 调摄像头 `/goform/SingleHandlebyCommand` ， `singleCMD=SetDiagMode` ，带上手机 IP/端口；凭证是写死在 APK 里的 `userid=admin` 、 `userkey=MD5("admin123")`
    
3.  摄像头进程 `jooanipc` 把配置写进 UNIX 套接字 `/tmp/.diagser.sock`
    
4.  守护进程 `jooandiag` 回连手机，把授权码当 **AES-128** 会话密钥；非保活报文解密后交给 `/bin/sh -c` 执行
    

## 固件侧：jooandiag

相关固件镜像（ `A12_IronMan_…` ）用 `binwalk` 解开后，能看到 strip 过的 MIPS32 程序 `jooandiag` 。逆向结论：

-   本地 IPC 线程 + TCP 回连线程
    
-   授权码经 NUL 填充到 16 字节，作为 AES-128-ECB 密钥
    
-   握手阶段在局域网明文发送 AuthorizationCode
    
-   不含保活标记 `DiagnosisStatus` 的载荷会当 shell 命令执行
    

作者在 QEMU（ `-cpu 24KEc` 、OpenWrt Chaos Calmer uClibc、mock 掉 `json_debug` ）里动态验证了「解密 → `execl("/bin/sh","sh","-c",cmd)` 」这条路径。

## 离线局域网影响（概念层）

`jooanipc` **不会** 拿 HTTP 里的 authcode 再去云端校验，直接转给 `jooandiag` 。同一局域网内，工厂默认 HTTP 凭证 + 攻击者自选的 6 位码，就足以拉起诊断通道并拿到 root，不需要 Jooan 账号。（完整利用脚本此处省略，细节见原文。）

## 从内部把 UART 重新打开

有了 root 之后发现 `bootargs` 里仍是 `console=null` ，但 U-Boot 本身已经在 115200 串口说话。机上没有 `fw_setenv` ，作者 dump `/dev/mtd1` （bootenv），把 `console=null` 改成 `console=ttyS1,115200n8` ，重算 CRC32 再刷回。重启后，早先焊上的 UART 终于打出完整内核日志。

## 结局与防御启示

后来尝试通过 `nc` 刷 Thingino 时写坏了 `mtd0` （U-Boot），机器变砖——但整条研究链已经足够说明问题：

-   即便有 UART 焊盘、U-Boot 也在说话，内核仍可用 `console=null` 故意静音
    
-   怪脾气的 Flash 料可能堵死 SPI 抽取；App / 固件逆向是重要备选入口
    
-   「隐藏厂商诊断 + 硬编码局域网口令 + 解密后直接进 shell」是高危 IoT RCE 类型
    
-   防御建议：量产固件关闭或强鉴权诊断口；诊断通道上 TLS；禁止对攻击者可控字符串 `system` / `execl` ；APK 里不要留工厂 MD5 口令
    

* * *

本人所有文章均为技术分享，均用于防御为目的的记录，请勿用于其他用途，否则后果自负。

🔧 更多内容在星球「车联网攻防日记」

这里长期更新，专注 IoT / 车联网 / 机器人 / AI 安全实战：

· 每天一篇一线漏洞拆解与复现思路，紧跟最新 CVE

· 累计整车实测 20+、IoT 组件 100+ 的经验沉淀与踩坑笔记

· 车联网 / V2X / 固件逆向 的资料、工具与字典

· 星球里提问，我 24 小时内必答，一起挖洞、上分、接项目

👇 扫码进星球，和一线师傅一起研究

![知识星球付费二维码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7d4fd03c27bf47a8.png)

## 往期推荐

（上传公众号编辑器后，用「超链接 → 公众号文章」插入以下往期，勿手写 URL）

-   [EOL 路由照样打穿：Netgear WGR614v9 UART + Bitdefender Box SPI 降级 RCE](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485532&idx=1&sn=830a2906b6710b7fb97e14a1b4cbd62e&scene=21#wechat_redirect)
    
-   [拆机焊 UART 还不够：Nokia Beacon 1 从受限串口到 CGI 注入 + Qiling 算口令](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485552&idx=1&sn=e530240c9e9ca18dbd50c9a14c73017b&scene=21#wechat_redirect)
    
-   [19.9 美元路由拆到 RCE：Dbit N300 UART + Boa 溢出（CVE-2026-20374）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485467&idx=1&sn=0e60fa2762561a009b3d8edc49f5538b&scene=21#wechat_redirect)
    
-   [四根铜焊盘听出 root：TP-Link TL-WR845N UART 未认证调试口](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247485877&idx=1&sn=80508f309304188b09a02e14d5a03733&scene=21#wechat_redirect)
    
-   [从 UART 焊到未认证后门：ANJIA PTZ 摄像头（CVE-2026-31077）](https://mp.weixin.qq.com/s?__biz=Mzg5MjY0MzU0Nw==&mid=2247486026&idx=1&sn=3786d4d0ca929f9d35b3913c6a6d6c1a&scene=21#wechat_redirect)
