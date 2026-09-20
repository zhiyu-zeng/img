---
title: 【微信】新样本溯源｜安天移动安全解析 Android RatHat 木马：搭载原生 Agent 的全设备接管远控家族分析报告
source: https://mp.weixin.qq.com/s/ycuPBHr0Wc_BLAHKsZ04dQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-20T17:43:34+08:00
trace_id: dae4c5ec-f0d5-4c73-a314-0b9b97d02b61
content_hash: 0e50becdd878f52fc95ce830a5a63ac8e851eac26047a9fb43e45c2fcd56a7d1
status: synced
tags:
  - 微信
  - 恶意样本
  - Android逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 安天捕获的 Android RatHat 木马以双层载荷实现全设备接管：Java 层银行木马配合独立原生 Agent，滥用无障碍与 ADB 无线调试提权，卸载 App 后仍可远控。
ai_summary_style: key-points
images_status:
  total: 62
  succeeded: 62
  failed_urls: []
notion_page_id: 3e175244-d011-81d1-973e-d6bd79cf09de
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 安天捕获的 Android RatHat 木马以双层载荷实现全设备接管：Java 层银行木马配合独立原生 Agent，滥用无障碍与 ADB 无线调试提权，卸载 App 后仍可远控。
> 
> - **传播与前置：** 伪装成“鉴黄师”等色情应用，以“国内网络受限”话术引导开启无障碍服务，随后自动点击通过权限弹窗。
> - **双层载荷：** Java 层负责无障碍自动化、WebView 注入与短信/通讯录窃取；原生层为 Go 编译的 liblocalservice.so（8.85 MB），释放到 /data/local/tmp/local-service 独立常驻，自行连接 C2。
> - **提权链：** 原生 Agent 自行打开无线调试、扫描端口并完成 Android 11+ TLS 配对，无需漏洞或 root 即取得 adb shell（uid 2000），再经 frp 反向隧道让攻击者直连设备。
> - **AI 兜底：** 集成 Gemini 2.5 Flash Lite，文本匹配失败时识别屏幕坐标完成点击，用于开启开发者选项与无线调试；配置覆盖 36 种语言与 7 类 ROM。
> - **持久化与归因：** 卸载 App 后原生 Agent 仍存活；函数名 handleStartRatHat、librat-hat.so、rathat[.]me 指向 RatHat 家族，Zimperium 2026-09-16 报告印证。

**安天移动安全** *2026年9月20日 17:30*

**行业洞察** | **合规产品** | **安天动态**

—助力移动健康生态建设第285篇原创文章—

**1**

**概述**

近期捕获到一款同时具备完整银行木马能力与设备接管能力的 Android 远控木马。它伪装成色情类应用，以"鉴黄师"等名称诱导安装，一旦用户开启无障碍服务，便可在无障碍自动点击 + 备用原生远控 Agent 两条腿的支撑下，完成从窃取凭据到完全接管设备的全过程。

该家族样本变种，最早样本可回溯至 2025 年 9 月的 Android 远控盗刷木马家族。其原生远控 Agent 中多个关键函数直接以家族名自命名（ handleStartRatHat 、handleInstallRatHat 、handleUpdateRatHat ），早期版本的原生组件命名为 librat-hat.so ，并由 rathat\[.\]me 域名承载下发。2026 年 9 月 16 日，Zimperium 以 "RatHat" 之名公开发布了同一家族的威胁报告，与本团队分析结论相互印证。

该样本最值得关注的特征是它的双层载荷结构：

-   第一层（Java 层）：一个常规的 Android 银行木马——无障碍自动化、WebView注入、覆盖层截取支付密码与锁屏凭据、短信与通讯录窃取。
    
-   第二层（原生 Agent）：样本内置一个独立的 Go 语言编译的原生程序（ liblocalservice.so ，8.85 MB）。它并非通过 JNI 被 App 调用，而是被释放到 /data/local/tmp/local-service 后以独立进程常驻，通过本地 HTTP 与 App 通信，并具备自己连接 C2 的能力。
    

这意味着：卸载 App 并不等于清除威胁——那个原生 Agent 在实现上独立于 App 进程运行，并具备自己的 C2 通道与自更新机制。

## ADB无线调试武器化

支撑第二条腿的关键技术是对 ADB 无线调试的武器化滥用：原生 Agent 会自行打开设备的无线调试开关、扫描调试端口、完成 Android 11+ 的 TLS 配对流程，从而在不利用任何系统漏洞、也不需要 root 权限的前提下拿到 adb shell （uid 2000）权限；随后再借 frp 反向隧道把设备内网端口映射到公网，让攻击者可以直连设备。传统"检测 root、检测漏洞利用"的防线在这条路径上完全失效。

此外，样本还集成 Google Gemini 大模型作为无障碍 UI 自动化的"视觉兜底引擎"——当基于文本的界面元素匹配失败时，由 AI 识别屏幕上的目标节点坐标完成点击，最终目标是开启开发者选项与无线调试。在本次观测范围内，这是 AI 能力被黑产作为组件实际调用的一例。

**1.1**

**影响评估**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4b5c4d7f5827b5dc.png)

**1.2**

**攻击链全景**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f10f7cc04d8c75ad.png)

**2**

**样本特征**

**2.1# 样本基本信息**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e11bb4776aa0a7b0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2819ff733ce4ae67.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd890ea17c4a689d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/04c7d91271a4536e.png)

签名证书

**2.2# 内置Native组件**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5c2b9a9f153f72b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c5d089921fcaa790.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a38fe27afeee3ba4.png)

**2.3# 样本行为描述**

## 伪装渗透与诱导授权

阶段一 · 伪装渗透

-   以"鉴黄师"（色情内容鉴别工具）等名义包装，配置中携带露骨的色情引流文案，并准备了 Chrome、智能管理器、手机管家、i管家、系统管家等 14 种桌面伪装变体
    
-   启动即弹出"启用服务"诱导窗口，话术为"因国内网络受限，需要开启权限"，并要求用户按 6 步操作开启无障碍服务
    
-   用户开启无障碍后，进入色情内容伪装的"加载中"界面（ loadingTips 文案："检查最优线路中""正在连接服务器..."）
    

阶段二 · 权限获取与提权

-   申请通讯录、短信等 5 项系统权限；无障碍服务中具备"查找并点击'允许/确定'类按钮"的实现，动态运行中观察到权限弹窗按 1/5 → 5/5 顺序依次推进
    
-   具备自动开启开发者选项与无线调试的能力（文本匹配失败时由 Gemini 视觉兜底），并实现 ADB 无线调试 TLS 配对以取得 adb shell 权限；
    
-   另具备覆盖层锁屏凭据窃取能力：以"隐私保护""系统更新"等话术（配置中含 11 种以上语言文案）诱导用户输入数字密码或图案
    

阶段三 · 载荷落地与通道建立

-   将内置原生 Agent 释放到 /data/local/tmp/local-service ，赋予可执行权限后以守护模式启动（ nohup... server -d -s & ）；若本地不存在适配组件，则从 rathat\[.\]me 回退下载
    
-   与 C2 建立 WebSocket 长连接；原生 Agent 侧再经 frp 反向隧道建立攻击者到设备的直连通道
    
-   多 C2 地址池故障切换，并支持运行时动态更换服务器地址
    

阶段四 · 窃取与远控

-   WebView 注入目标银行/支付应用，实时捕获用户输入
    
-   支付密码逐位捕获、锁屏数字/图案密码窃取
    
-   短信、通讯录、相册、应用列表、剪贴板等批量回传
    
-   屏幕实时串流、摄像头与麦克风监听、实时定位
    
-   通过 PTY 获得交互式 shell，可执行任意命令
    

**3**

**样本分析**

**3.1# 动态分析**

① 启动即诱导开启无障碍服务

应用启动后立即弹出"启用服务"窗口，以"因国内网络受限，需要开启权限"为由，用 6步图文引导用户自行开启无障碍服务。无障碍权限是该样本后续所有自动化能力（自动授权、界面操控、开发者选项开启）的前置条件，也是攻击链中用户侧依赖最强的环节。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c40fc96aa6b6762.png)

图 1：样本首次启动弹出的"启用服务"诱导窗口，话术为"因国内网络受限，需要开启权限"

② 无障碍开启后立即跳转色情伪装加载界面

用户完成无障碍授权后，应用跳转至色情内容伪装页面，叠加"检查最优线路中"等加载提示。该界面与样本配置项 configMaskSubtitle 、loadingTips 一一对应。该界面在攻击链中承担的作用是掩护后台初始化与载荷部署——此判断基于配置语义与流程位置的推断，本次观测未直接取证。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3333f0ae2df9a309.png)

图 2：无障碍服务开启后跳转的伪装加载界面（加载提示与配置中的 loadingTips 文案一致）

③ 无障碍自动点击批量通过权限弹窗

运行中观察到系统权限弹窗按"读取联系人信息 鉴黄师 (1/5)" → … → "此应用可读取您手机上存储的所有短信 鉴黄师 (5/5)"的顺序依次出现并推进，与样本配置中声明的权限申请序列一致（观察结果）。结合无障碍服务中已确认存在的"查找并点击'允许/确定'类按钮"实现、以及针对各厂商权限对话框的坐标与文本适配代码，初步判定该过程由无障碍自动化驱动——本次观测未采集无障碍事件流，无法完全排除人工操作的干扰，该判定待动态取证确认。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/98488308d31f5364.png)

图 3：自动通过的权限弹窗——读取联系人信息（1/5）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f3e3346be5de5150.png)

图 4：自动通过的权限弹窗——读取短信（5/5）

**3.2# 静态分析**

3.2.1 权限与组件特征

样本声明 60 余项权限，高危组合高度集中：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9e24087b93758865.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/02b05ce80a5c1377.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/26bdec75549c7c33.png)

核心组件

**3.2.2 核心能力一：独立原生远控 Agent**

样本内置的 liblocal-service.so 是一个Go 语言编译、符号完整未剥离的独立可执行程序。它不通过 JNI 参与 App 进程，而是被安装为独立系统进程。

部署与运行模型

早期版本会尝试通过网络下载适配当前架构的可执行程序，后期版本多为内置。下图为

内置组件与回退下载地址的配置项：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da709aa82bdcaeb0.png)

图 5：原生 Agent 部署逻辑的反编译代码。可见其按 SUPPORTED_ABIS 选取架构后，以 https://rathat\[.\]me/lib/<ABI>/local-service 为下载地址，并以 nohup /data/local/tmp/local-service server -d -s > /data/local/tmp/local-service.log 2>&1 & 的守护方式拉起

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40e28d506b5a30fe.png)

家族自证的三条证据：

① 原生 Agent 内部函数以家族名命名—— handleStartRatHat 、handleInstallRatHat 、handleUpdateRatHat （保活与自更新逻辑）；

② 早期版本的原生组件直接命名为 librat-hat.so ；

③ 早期版本的下发回退域名即 rathat\[.\]me 。三者在同一命名体系内互相印证。

程序入口 main.main 支持四种调用形态，主要用于进程守护化与本地 HTTP 服务：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/30c932ef57bdb0b9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e54f27f4dd4df1fc.png)

Java 层与原生 Agent 的通信：App 侧通过 x40.a0(path, method, body, timeout) 遍历候选端口表 {7912, 7913, 7914, 7915, 8880, 9912, 18912, 28912, 38912, 48912, 58912} ，逐一尝试 http://127.0.0.1:<port><path> ，命中后缓存端口。这套设计使本地控制通道不依赖固定端口——检测侧须按端口区间而非固定值布防（见 §5.3 手机厂商）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/97aa933aa9a32863.png)

原生 Agent 的能力矩阵（按能力域，均为函数级证据还原）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/20e690594f5bb7a0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/56338cc1e8e73a37.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6053818986e0f54e.png)

威胁判定：这是一个伪装成"本地服务"的完整 Android 远控 Agent。其能力闭环为——自启用 ADB 无线调试并配对提权 → 经 shell 获得命令执行与设备操控 → 屏幕/音频/短信/文件回传 C2 → 经 frp 隧道维持公网直连。它独立于 App 进程存在，是"卸载 App 即可清除威胁"这一常规处置逻辑失效的直接原因。

下图为该原生 Agent 在受控环境中实际运行的输出记录。需要说明的是，该批运行记录来自本家族 2026-03 世代的历史样本（日志时间戳为 2026-03-30，自报版本 local-service v3.1.0 ，本地服务端口 127.0.0.1:7998 ），其架构与本样本一致，可作为上述能力矩阵的运行侧佐证；文中已就代际差异单独标注。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8ec3cebff4c75ba0.png)

图 6：原生 Agent 启动阶段的运行日志。可见其以 local-service v3.1.0 自报版本，绑定本地 HTTP 服务于 127.0.0.1:7998 ；依次启动核心服务、frpc 看门狗（间隔15s ） 、命令轮询（ 10s ） 、自我保活（ 3s ） 、端口监控（ 5s ） ， 并输出"\[initDeviceAdminProtection\] 已禁用自动激活，由控制端手动控制"，同时加载了 8个默认敏感应用

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/53fc4953f9d42ad3.png)

图 7：日志显示 Agent 在收到 signal=urgent I/O condition 后执行"WiFi 已关闭，强制开启"并成功开启 Wi-Fi——印证其无需用户交互即可修改设备网络状态

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/38ea41b3dd04c5b1.png)

图 8：日志显示 Agent 检测到"旧端口 0 不可用，开始扫描…"并"开始扫描无线调试端口…方法 2：从 netstat 获取…"——这是 ADB 无线调试端口发现环节的运行侧直接证据，与 §3.2.3 所述的端口探测逻辑完全一致

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a08de701dc1a049b.png)

**3.2.3 核心能力二：ADB 无线调试武器化（提权链）**

样本在不使用漏洞、不依赖 root 的前提下，把 Android 官方的无线调试机制完整武器化：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5712021302e2b22f.png)

## ADB配对提权链

三段式配对策略（原生实现）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0a283e1997f6a174.png)

值得注意的两个细节：

1\. 端口发现采用多手段组合： getprop service.adb.tcp.port → netstat / ss -tlnp 过滤 LISTEN → 端口段扫描 → 正则提取并做安全性校验。

2\. 关闭调试的请求被显式拒绝：收到关闭 ADB 调试的指令时，Agent 会拒绝执行并杀掉自身进程以保持 ADB 常开——该行为在功能上刻意避免自断提权通道。

**3.2.4 C2 通信机制**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8aaebc0306824ced.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5fd9c780ffcfe3d1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b17eecdaadbf233.png)

**3.2.5 凭据窃取能力**

① WebView 注入（针对银行与支付应用）

注入入口 Activity 具备从本地文件或 Base64 直接加载 HTML 的能力（支持 data:text/html;base64, 形式），并通过 JS 桥与页面双向通信，可实时回传用户在钓鱼页上的输入。

② 支付密码与锁屏凭据

-   覆盖层截取： PatternCaptureOverlay 、AlipayPasswordOverlay 等覆盖层在目标应用界面上方采集输入
    
-   输入监控： UniversalInputMonitor 记录并上传密码
    
-   系统认证对话框回读：通过无障碍读取系统密码/生物识别认证界面中的输入
    
-   锁屏凭据经 /api/data/cipher 与 /syncLockCipher 通道回传（携带 X-Client-ID头）
    

③ 敏感应用规避

无障碍服务内置敏感应用判断（ isSensitiveApp → 银行/支付名单），当前台为目标应用时暂停部分窃取动作。该行为在功能上起到规避安全软件行为检测的作用（规避效果为推断）。

④ 其他数据

通知（OTP）、短信、通讯录、相册、应用列表、剪贴板、通话记录、位置、WiFi 信息。

## AI辅助无障碍自动化

**3.2.6 核心能力三：AI 辅助无障碍自动化**

样本集成 Google Gemini 2.5 Flash Lite

generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent，用途明确且单一：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cb98f28e3814ec67.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4d5e67a197c638d0.png)

样本内置 7 组不同 ROM 的版本号关键词（ 原生 Android 、小米 MIUI 、小米HyperOS、OPPO ColorOS、vivo、华为、鸿蒙），覆盖主流国产定制系统。当文本匹配在两个语种、两个品牌都失败时（例如界面无文本节点、自定义 ROM、非拉丁语系），由 AI 识别屏幕内容并给出目标坐标，从而把"开开发者选项"这一步从"依赖固定文案"变成"跨品牌、跨语言通吃"。

**3.2.7** 伪装、持久化与对抗

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6e8c479985b66c4c.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e0df4040c7eec00c.png)

3.2.8 攻击目标清单

印度 UPI 与金融应用（核心目标，Manifest 中明文声明）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b0967e911252bbcf.png)

中国支付：支付宝、微信——通过运行时检测状态上报（ sendAlipayDetectionStatus 、sendWechatDetectionStatus ），并按对应的定时策略触发密码捕获。

社交与他人关注目标：WhatsApp、Facebook Messenger、Instagram；网易新闻、今日头条、腾讯新闻；Brave / Opera / 三星 / ColorOS 等浏览器（地址栏监控）。

3.2.9 加密配置资产

assets/ 目录下有一套编号化的配置资产（ 0.bt ～ 10.bt 共 11 个），由 zm26_meta.json 描述映射关系：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/55f1285c01a55306.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ebc77505dac871a.png)

关于 4.bt ～ 10.bt 的定性依据：样本同时存在明文 HTML 模板（ compat_config.html引导页、svc_config.html 服务配置页、splash_loading.html 加载页），说明其 UI与注入页面以 HTML 承载；注入 Activity 支持通过 html_file 参数从文件系统加载页面；样本另内置 28 个手机品牌 Logo 素材用于伪装"权限设置"页。综合判断这批加密文件为WebView 注入 / 钓鱼页面模板，运行时由程序解密后加载。

locateValues.json 的规模（36 种语言的元素定位配置）说明样本的自动化能力面向全球多语种环境设计，而非针对单一市场。

**4**

**情报关联分析**

**4.1# IOC（失陷指标）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/74f62f2b32d8e314.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a5053f48aba640dc.png)

网络 IOC

主机 / 应用 IOC

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b91ea1e31a82c4e8.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e4ac7b998b08e293.png)

可用于跨样本关联的其他特征

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5dd46de4dd1b9a2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8d6c728cbac0151a.png)

****4.2# 家族归属与代际演变****

4.2.1 家族归属：RatHat

本样本归入 RatHat 家族，归因依据全部来自样本自身及公开情报，二者互为印证：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0cb28067067752c2.png)

4.2.2 代际演变与时间线

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3baeaaec0e106399.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a125f7f1f0c2f775.png)

代际变化要点（与本家族早期版本相比）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/770fb1c0db64830e.png)

结论：本样本是该家族在"能力扩张 + 对抗升级"方向上的后续代际。核心架构（独立原生 Agent + 本地回环控制通道 + FRP 内网穿透 + 无障碍/设备管理器滥用）保持稳定，这正是可作为跨代检测锚点的部分；而变化最频繁的是端口、组件命名与 C2 基础设施。

**4.3# TTPs 映射（MITRE ATT&CK for Mobile）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e1e69f5674c92200.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b225f67853137d5b.png)

## 情报价值与检测启示

****4.4# 情报价值****

1\. "双层载荷"削弱了常规处置的有效性：卸载 App 之后，独立原生 Agent 仍可存活并接受指令。这要求处置流程把"检查并清除 /data/local/tmp 下的异常可执行文件"作为标准动作。

2\. ADB 无线调试正成为银行木马的标准提权路径：本样本与近期同类的共同点是——不依赖 root、不利用漏洞，完全借助 Android 官方机制拿到 shell。检测思路必须从"是否存在 root 行为"转向"是否存在异常的无线调试配对与本地调试连接"。

3\. AI 大模型被工程化用于对抗环境差异：Gemini 被用作 UI 自动化的视觉兜底，使"开启开发者选项"这一步在任意品牌、任意语言、无文本节点的界面上都能完成。这是 AI 能力在黑产工具中"作为组件被调用"的具体例证，而非概念演示。

4\. 受害设备具备同时充当代理节点的能力：原生 Agent 内置 HTTP 代理与端口转发实现，理论上可让受害设备在被窃取数据的同时被用作网络流量出口；该路径是否已投入运营，本报告未取证。

5\. 全球多语种自动化配置： locateValues.json 覆盖 36 种语言的界面元素定位。据此判断其自动化能力面向多语种环境设计（"一套框架、多地区投放"），而非单点定向攻击。

6\. 家族可长期跟踪：该家族最早样本可回溯至 2025 年 9 月，其核心架构（独立原生 Agent + 本地回环控制通道 + FRP 内网穿透 + 无障碍滥用）在多代中保持稳定，而端口、组件命名与 C2 基础设施变动频繁——这种"架构稳定、外围易变"的特征，使得以架构组合为锚点的检测策略能够覆盖其后续变种。

5

**安全建议**

**5.1# 个人用户**

5.1.1 日常预防

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd860770f5828cf6.png)

5.1.2 疑似已感染的应急响应

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bd41c83fc419ea0b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/14dfa7e91a68c877.png)

****5.2# 移动应用开发者****

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e06de6340248bc58.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c04f0c5da08c4508.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f1251298e72afd59.png)

******5.3# 手机厂商  

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2942ddd45329ed0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2e327337a482adf5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/df908e9f1e6f5ab1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/868e9ff88f6f6f3e.png)
******

技术报告 · 目录
