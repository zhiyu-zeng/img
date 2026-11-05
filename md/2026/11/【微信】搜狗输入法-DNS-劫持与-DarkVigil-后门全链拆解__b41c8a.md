---
title: 【微信】搜狗输入法 DNS 劫持与 DarkVigil 后门全链拆解
source: https://mp.weixin.qq.com/s/2Ggk_dFeVf-lhcWEEyMBNQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T15:50:55+08:00
trace_id: 9b431595-0473-4d44-b00e-b6791fc500e1
content_hash: 91f27d298ec786e5a9a2bcfd90e1ae03e8cc0a861ee1b49b336bc6f38fd77d4b
status: synced
tags:
  - 微信
  - 漏洞分析
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: SlippyNunchucks 劫持 DNS，把 Windows 版搜狗输入法（低于 16.10）的明文 HTTP 词库配置请求变成 DarkVigil 后门投递通道；升级 16.10 只是起点，仍需按行为证据排查历史失陷。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40f75244-d011-81b9-8d8e-ff37c6fa1af2
ioc:
  cves:
    - CVE-2021-38003
    - CVE-2026-120422
    - CVE-2026-51990
  cwes:
    - CWE-1428
  hashes:
    - 3e16ba611782af6e45576d390488d28fd676bade
    - 79188c8de2378b437d39e867475c5b4714a0d7c9
    - 8a60a8e90e1f5f08f28fe5a6dd57bd686c20dc23
  domains:
    - dev.soft-png-cdn.com
    - noht1ng.top
    - sogou-cdn.com
    - update.mssproxy.net
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> SlippyNunchucks 劫持 DNS，把 Windows 版搜狗输入法（低于 16.10）的明文 HTTP 词库配置请求变成 DarkVigil 后门投递通道；升级 16.10 只是起点，仍需按行为证据排查历史失陷。
> 
> - **漏洞边界：** CVE-2026-120422（CVSS 8.9，CWE-1428），SGTool.exe 对含品牌词库接口在内的 20 个端点走明文 HTTP；16.10 于 2026 年 10 月 30 日修复（HTTPS + 证书固定），但升级不清除已运行的后门、注册表插件或被替换组件。
> 
> - **利用链：** 攻击者不碰搜狗官网，只控制受害者到搜狗的网络路径，把 config.pinyin.sogou.com 的配置请求导向 staging 服务器，用客户端内嵌的 AES-256-CBC 密钥仿制配置，投递合法签名的 Adobe 宿主加恶意 libcef.dll 实现 DLL 侧加载，借替换 SogouComMgr.exe 或 biz_center 版本目录驻留。
> 
> - **后门机制：** DarkVigil（Trend Micro 称 FDMTP）为 .NET 模块化工具集，基于 TouchSocket/DMTP 协议；插件压缩后写入注册表 HKCU\Software\Microsoft\IME\<HWID>\pluginHash，按需从 C2 下发展开，已知插件超 20 个但公开细节仅 Pillager。
> 
> - **攻击者画像：** ESET 将其聚类为独立入侵集 SlippyNunchucks（与 Mustang Panda 战术无重叠）；QuickFox 供应链渠道关闭约三天后即转向搜狗，受害者遍布中国香港、泰国、日本、越南等地，含中文博彩组织，语言与业务指向明显。
> 
> - **处置要点：** 升级与失陷排查须并行，勿只删 libcef.dll；命中恶意哈希、签名错位、注册表插件写入等强指标应按失陷处置（隔离、保全证据、全网检索）；未命中公开 IoC 也不能排除感染，EDR 行为狩猎比单次 IoC 扫描更可靠。

**Ots安全** *2026年11月5日 14:33*

**威胁简报**

**恶意软件**

**漏洞攻击**

如果你只记住一句话： **Windows 版搜狗输入法低于 16.10 应当更新，但更新不是事件处置的终点。**

ESET 在 11 月 4 日披露，SlippyNunchucks 自 7 月起劫持搜狗输入法的品牌词库配置请求，把一份原本只用于下载绿色萌芽图标的配置，变成投递 DarkVigil 后门的控制指令。攻击者没有修改搜狗官网，也没有要求受害者点击特制链接。他们控制的是受害者到搜狗之间的网络路径，再利用旧版组件的明文 HTTP、可被仿制的加密配置和合法组件加载流程完成入侵。

这条链值得拆开看。它把四个看似普通的问题接到了一起：网络层缺少传输身份保护，应用层把配置当成可信指令，执行层借用签名正常的 Adobe 程序侧载恶意 DLL，后门层再把具体能力延迟到 C2 下发插件时才展开。

## 一、先看问题：漏洞已修，但公开信息不能简化成“升级即清零”

### 1.1 官方记录给出的确定边界

CVE-2026-120422 的官方记录由 ESET 作为 CNA 发布，标题为 *Insecure HTTP configuration retrieval in Sogou Input Method allows arbitrary code execution*。关键字段如下：

-   **评分与类型**
    
    ：CVSS v4.0 **8.9，High**；CWE-1428，即依赖 HTTP 而非 HTTPS。
    
-   **受影响产品**
    
    ：Sogou Input Method，Windows 平台。
    
-   **受影响版本**
    
    ：官方记录写为 `0 < 16.10` ，即 16.10 之前的 Windows 版本。
    
-   **漏洞位置**
    
    ： `SGTool.exe` 的配置获取机制。能够操纵网络流量的攻击者可替换服务器响应，指示组件把攻击者文件写到特定位置，并在后续执行或加载时形成任意代码执行。
    
-   **公开时间**
    
    ：CVE.org 与 NVD 均显示 2026 年 11 月 4 日公开。ESET 报告另把编号分配日写为 11 月 2 日，这是分配与公开两个时间点，不应混用。
    

NVD 当前标记为 **Not Scheduled**，表示暂未安排 NVD enrichment，不代表漏洞不重要。本文检索时也未在 CISA 网站找到该编号进入 KEV 的记录。KEV 未收录不能反向推导为“没有在野利用”，因为 ESET 报告的正是真实受害者遥测中的活动。

### 1.2 修复版本与日期，以厂商日志为准

搜狗官方升级日志显示， **16.10 正式版发布于 2026 年 10 月 30 日**，说明为“修复若干安全性问题”，没有逐项列出 CVE。

ESET 的技术分析补充了修复内容：受影响请求迁移到 HTTPS，启用 TLS 证书校验，并启用证书固定。需要注意，ESET 文章的背景段落写过 10 月 29 日，技术时间线又写 10 月 30 日，部分中文转载同样写 10 月 29 日。本文采用厂商官方升级日志的 **10 月 30 日**，同时保留这一天差异，不用推测去填平。

升级的作用需要说准确：

-   它能切断本次利用的明文配置劫持通道。
    
-   它不能自动删除已经运行的 DarkVigil。
    
-   它不能证明曾被替换的组件已经恢复正常。
    
-   它不能清除已经写入注册表或由 C2 下发的插件。
    

因此， **版本检查和失陷排查是两条并行任务**。尤其是 7 月至补丁落地前长期使用旧版的机器，不能只看“关于”页面里的新版本号就结束。

### 1.3 信源能证明到哪一步

本篇文章检索了 ESET 原始研究、CVE.org、NVD、搜狗官方日志、ESET IoC 仓库、Fortinet 的 QuickFox 调查、Trend Micro 的 FDMTP 研究、Gen Digital 的旧漏洞分析，以及 ESET 关于更新劫持活动的季度报告。

其中， **本次搜狗 DNS 劫持的受害者分布、攻击日期与组织归因，仍主要来自 ESET 遥测**。The Hacker News 是对 ESET 的报道，不应被算作另一份独立受害者证据。Fortinet 和 Trend Micro 能独立支撑 DarkVigil/FDMTP 的代码框架、插件机制与历史活动，但没有独立公布本次搜狗事件的受害者数据。后文会把这些不同证明力分开写。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e692b82f0feed870.png)

*图 1：本文依据 ESET 公开研究绘制的机制示意，不是原始攻击截图。*

## 二、不是“搜狗官网被黑”：攻击者真正拿到的是网络路径

### 2.1 被滥用的是一个正常业务功能

搜狗输入法的细胞词库用于扩展词汇。2016 年推出的“创业品牌支持计划”允许审核后的品牌名进入候选列表，并在条目旁显示绿色萌芽图标。

`SGTool.exe` 是搜狗输入法的多用途任务分发组件。ESET 识别出至少 30 个命令 ID，覆盖安装、皮肤管理、词库更新和 CEF 下载等任务。本次路径为：

```javascript
SGTool.exe --appid=scdreg -update
  -> config.pinyin.sogou.com/api/brandScd/getBrandScd.php
  -> 正常返回加密配置
  -> 下载绿色萌芽图标 tree.png
```

问题在于，旧版组件对这个官方主机上的 **20 个请求端点使用明文 HTTP**，被利用的品牌配置接口只是其中之一。域名本身支持 HTTPS，ESET 访问时也看到了腾讯的有效证书，但“服务器支持 HTTPS”不等于“客户端实际使用 HTTPS”。

### 2.2 攻击成立需要三个条件

**条件一：攻击者能操纵受害者使用的 DNS 或网络流量。**

ESET 观察到， `config.pinyin.sogou.com` 在受害环境中被解析到攻击者的 staging server，随后 HTTP 请求收到恶意配置。这里证明的是解析与投递结果，不是搜狗权威 DNS 或腾讯后台遭到入侵。

**条件二：目标仍在使用 16.10 之前的 Windows 版本。**

只有仍按旧逻辑通过 HTTP 获取并处理该配置的组件，才会接受这条投毒路径。

**条件三：相关配置获取与组件加载流程被触发。**

这不是“互联网上任何人输入一个 IP 就能打进所有搜狗用户”。攻击者先要有网络位置，再等合法组件走到相应流程。它也不要求受害者点击攻击者发送的特制链接，这与旧漏洞 CVE-2026-51990 有本质区别。

### 2.3 DNS 在哪里被改，公开研究没有答案

ESET 明确写道， **DNS 操纵发生的位置仍然未知**，给出的可能性包括：

-   路由器被攻破后被配置为使用恶意 DNS；
    
-   路由器中存在负责劫持 DNS 请求的植入体；
    
-   ISP 层发生流量拦截。
    

这三种情形的处置范围完全不同。单机代理异常、企业网关被控、路由器植入和上游链路操纵，不能用同一句“换个 DNS”处理。由于位置未知，启用 DoH 或改用公共递归 DNS 只能被看作某些场景下的降险措施，不能替代升级，也不能证明恶意配置不会出现。

对企业而言，更有价值的做法是把终端 DNS 缓存、递归 DNS 日志、代理日志、网关流量和 HTTP 目的 IP 交叉起来。只看其中一层，很容易把“Host 是官方域名”误判为“连接一定到了官方服务器”。

## 三、配置为什么能变成投递指令：加密没有替代身份认证

合法配置和恶意配置都使用 **AES-256-CBC**。密钥与 IV 位于 `SGTool.exe` 的 `.rdata` 区。本文不给出密钥值，也不复原恶意配置。

这里有一个容易误读的点： **配置被加密，不等于配置只能由搜狗生成。**

客户端内嵌对称密钥解决了数据格式和传输内容保密的一部分问题，却没有在明文 HTTP 通道上提供可靠的服务器身份认证。攻击者控制网络响应，又能依据公开客户端结构仿制配置时，组件会按既有格式解密并处理它。真正缺失的是“我相信谁”的验证，而不是“有没有 AES”。

恶意配置同时控制三类数据：

-   **下载内容**
    
    ：一个合法签名的 Adobe 可执行文件和一个恶意 `libcef.dll` 。
    
-   **`md5` 字段**
    
    ：改成与攻击者载荷匹配的值。文件和期望值都来自攻击者，MD5 匹配只能说明两者一致，不能证明来源合法。
    
-   **`icon` 字段**
    
    ：控制文件落盘位置，使载荷进入搜狗组件加载流程会访问的目录。
    

下载的两个文件也不是同一种风险：

-   `biz_helper.exe`
    
    的原始身份是 **Adobe Licensing WF Helper**，合法且带签名，ESET 给出的 SHA-1 为 `79188C8DE2378B437D39E867475C5B4714A0D7C9` 。
    
-   `libcef.dll`
    
    才是 DarkVigil 植入体。它利用 Adobe 程序的 DLL 加载行为被执行。
    

这解释了为什么“有数字签名”在这里救不了场。签名能证明 Adobe 签过这个 EXE，不能证明它应该出现在搜狗组件目录，也不能证明同目录的 `libcef.dll` 安全。 **文件签名、文件位置、加载对象和进程关系必须一起看。**

## 四、两条驻留路径：攻击者借的是搜狗自己的调度器

ESET 给出了两种执行方式。它们都不是新建一个名为“DarkVigil”的 Windows 服务，而是修改搜狗既有组件链路。

### 4.1 路径 A：替换 SogouComMgr.exe

恶意配置让组件把 Adobe 宿主保存为：

```javascript
\SogouInput\Components\SogouComMgr.exe
```

恶意 DLL 则放在：

```javascript
\SogouInput\Components\libcef.dll
```

之后， `SGTool.exe` 按原工作流程安装或加载组件时，启动的 `SogouComMgr.exe` 实际已是 Adobe 宿主，后者侧载同目录的恶意 DLL。

这条路径的特点是把组件管理器本身替换掉。只要原调度流程继续调用它，攻击者就能借正常业务动作维持执行。

### 4.2 路径 B：寄身 BizCenterCom 版本目录

备用位置为：

```javascript
\Components\biz_center\<version_number>\
```

ESET 观察到搜狗会执行：

```javascript
SogouComMgr.exe -invoke BizCenterComBundle BizCenterCom
```

这条路径保留合法的 `SogouComMgr.exe` ，让它从 `biz_center` 的版本目录加载被替换的组件，最终仍由 Adobe 宿主侧载恶意 `libcef.dll` 。

它对版本目录有依赖。软件更新引入新的 `biz_center` 版本后，应用可能改去别的目录加载，攻击者的路径因此失效。

### 4.3 两条路径不能稳定共存，也都可能留下故障信号

路径 A 要替换组件管理器，路径 B 又依赖合法组件管理器，所以 ESET 认为它们在同一时刻不能稳定共存。两种方式也都具有破坏性，可能引起：

-   组件安装或加载失败；
    
-   `SogouComMgr.exe`
    
    崩溃；
    
-   `BizCenterCom`
    
    加载异常；
    
-   输入法更新后行为突变。
    

这些现象都不是 DarkVigil 的特异指标，普通软件故障也会产生。但如果它们与异常 DLL、Adobe 签名错位、可疑网络目的地址同时出现，调查优先级就应明显提高。

同样， **更新偶尔破坏攻击者的驻留路径，不等于完成了清除**。后门可能已下载其他组件，攻击者也可能已经取得别的立足点。处置要依据证据，而不是依赖“升级可能把它盖掉了”的运气。

## 五、DarkVigil 的难点不在一个 DLL，而在插件化调度

### 5.1 本体、框架与协议的关系

DarkVigil 是模块化.NET 工具集，ESET 名称与 Trend Micro 的 **FDMTP** 指向同一类工具。它构建在 Vigil 框架上，Vigil 又使用开源网络框架 **TouchSocket**。C2 通信使用 DMTP，即 Duplex Message Transport Protocol。

ESET 的命名依据包括 `Vigil.Frame` 、 `Vigil.Core` 等库引用、带 `VigilPro` 或 `VigilⅢ` 的 PDB 路径，以及管理窃取数据的 Vigil Web 面板。这里能看到的是开发框架与运营工具痕迹，不能据此推断开发者真实身份。

DarkVigil 客户端至少提供两类 RPC 服务：

-   `PluginService`
    
    ：负责 `RegistryPlugin` 、 `RunPlugin` 等插件生命周期操作。
    
-   `OptionService`
    
    ：提供断开连接和终止客户端等选项。
    

DMTP 支持反向 RPC 和 client-client 通信。插件不必各自实现一套独立 C2，它可以把消息交给 DarkVigil 客户端，再由客户端传递给服务器。本体因此更像一个常驻的 RPC 路由器和插件运行环境。

### 5.2 插件被压缩后放进注册表

ESET 描述的插件流程为：

```javascript
C2 通过 DMTP 文件传输推送插件
-> RegistryPlugin 将压缩二进制写入注册表
  -> RunPlugin 按 hash 取出并解压
-> 加载到 .NET 环境
-> 调用插件的 Run 方法
-> 插件经 SendPluginMsg 与 C2 交换消息
```

关键位置为：

```javascript
HKCU\Software\Microsoft\IME\<HWID>\pluginHash
```

这里保存的是压缩插件数据，不是普通 EXE 路径。可以把它称为 **插件层面的文件less化**，但不能把整条攻击链称为无文件攻击，因为初始 `libcef.dll` 和 Adobe 宿主都落盘了。

Fortinet 对 QuickFox 样本的分析也观察到相同思路：C2 先调用 `IsRegistryPlugin` 查询插件是否存在，再决定推送还是直接运行。两个团队在不同时间、不同投递链上看到一致机制，显著增强了这一技术结论的可信度。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4c2d3ed81aa0f3e0.png)

*图 2：本文依据 ESET 与 Fortinet 的机制分析绘制。公开报告没有给出全部插件，本图不补写未公开能力。*

### 5.3 “20 多个插件”不等于已经知道 20 多种完整能力

ESET 称已知插件超过 20 个，但正文只明确举出 `Pillager` ，没有公开完整名称和功能清单。因此，不能凭“模块化监控后门”几个字就扩写成键盘记录、截屏、窃听、浏览器密码抓取等一整套能力。公开信息支持的是：

-   接收并执行 C2 下发的插件；
    
-   通过插件完成持久化、数据收集和其他任务；
    
-   通过 DMTP 通道外传数据；
    
-   在握手后提交受害者画像。
    

Fortinet 对旧一代 FDMTP 的分析列出了更具体的主机信息：活动窗口标题、已安装安全软件、.NET 运行时版本、IP/网关/MAC、操作系统与安装时间、当前用户、植入体路径和宿主进程，随后还能枚举进程。它可以作为该框架历史版本的参考，但不能直接断言本次每个受害机都执行了完全相同的后续动作。

ESET 也没有公开本次 C2 端口、加密算法、完整恶意配置 JSON 或全部插件。网络分析主要基于 2025 年样本，新版本可能存在方法名与实现差异。检测规则应把这些变量留有余量。

## 六、从 QuickFox 到搜狗：同一工具链的选择性投放策略

### 6.1 QuickFox 事件不是简单的“安装包全部带毒”

Fortinet 在 8 月公开的 QuickFox 供应链调查显示，攻击者只在 Electron 应用的一个 HTML 文件里加入两行 JavaScript，再从仿冒官方 CDN 的域名下载 loader。恶意域名把官方 `.com` 换成了 `.cn` ：

```javascript
合法：cdns3.51quickfox.com
仿冒：cdns3.51quickfox.cn
```

loader 先做环境和目标筛选：

-   只继续处理 Windows；
    
-   检查是否已感染，避免重复；
    
-   通过 `tasklist` 枚举进程；
    
-   发现 `steam.exe` 就退出；
    
-   另外 26 个目标进程中至少命中一个，才下载后续载荷。
    

这 26 个进程覆盖远程运维、开发、数据库、加密货币、通信和中文翻译/跨境业务工具。例如：

-   运维终端：Xshell、FinalShell、MobaXterm、Tabby；
    
-   开发与数据库：Navicat、DBeaver、Git、IDEA、VS Code、Sublime Text、Notepad++；
    
-   加密货币：Exodus、Binance、Ledger、Trezor；
    
-   通信：Telegram、SafeW；
    
-   中文翻译及跨境业务：多类翻译、客服和出海工具。
    

Fortinet 对“排除 Steam”的解释是倾向避开个人游戏机，从而提高进入专业环境的概率。这是研判，不是攻击者自述。无论如何， **先画像再决定是否投递** 说明运营者并不追求让所有安装者都拿到后门。沙箱、研究机或不符合画像的主机可能只看到正常安装和一段没有后续的脚本。

QuickFox 的样本表列出 3.51.0、3.52.0、3.55.0、3.55.5、3.59.0、3.59.3、3.59.5 等被植入版本，3.59.6 已移除恶意组件。原报告内部另有 `3.0.51.0` 与 `3.51.0` 、以及 `<3.55.6` 与表格版本的冲突，本文不自行改出一个统一区间。可确定的处置口径是： **按 Fortinet 样本表排查历史安装包，干净版本从 3.59.6 起，不能用一段互相矛盾的简化范围替代完整审计。**

### 6.2 7 月 1 日的转向说明投递渠道可以替换

ESET 观察到，QuickFox 发布干净版本约三天后，攻击者开始通过 `SGTool.exe` 启动 DarkVigil。这个时间关系说明，框架和后续 C2 可以保留，前置投递器则从“被篡改的安装包”换成“网络路径中的恶意配置”。

Fortinet 的 QuickFox 表格把 3.59.6 的观察日期列为 6 月 29 日；按 ESET“7 月 1 日前三天”的文字推算则是 6 月 28 日。两者可能分别对应发布与观测口径，公开信息未解释这一天差异。它不影响“QuickFox 渠道关闭后迅速转向搜狗”的总体判断，但精确时间线引用时应保留差异。

SlippyNunchucks 被 ESET 观察到滥用过的应用还包括 QingTalk、MiYunChat、SoftCam 和 tawk.to。这个名单提示防守方：只封搜狗相关域名并不能覆盖该活动的全部入口，应用资产清单和框架级检测仍然必要。

### 6.3 受害者选择呈现明显的语言与业务指向

本次搜狗行动在 ESET 遥测中的目标位于 **中国香港、泰国、日本、越南、阿曼和斯里兰卡**，包括机构与中文个人用户。更广泛活动中还出现德国、俄罗斯、英国、奥地利的受害者，以及迪拜一家网吧和丹麦一名大学生。

ESET 特别提到一个在斯里兰卡、中国香港和菲律宾运营中文在线博彩平台的组织，并观察到针对它的显著监控活动。受害机构名称、感染总数和各行业完整分布没有公开。

因此，不应把这条新闻理解成“所有搜狗用户都已被针对性攻击”。更准确的说法是： **旧版漏洞覆盖面大，但实际受害者是经过网络位置和运营选择的一部分对象；普通用户需要更新，高风险的海外中文业务机构还需要做事件排查。**

## 七、归因与旧案边界：三个“搜狗事件”不能并成一条

### 7.1 DarkVigil 与 Mustang Panda 的关系，厂商口径并不相同

Trend Micro 在 2024 年把 FDMTP 描述为 Earth Preta，也就是通常所称 Mustang Panda 的辅助控制工具。当时它由 PUBLOAD 投递，作为基于 TouchSocket/DMTP 的下载器，网络配置使用 Base64 与 DES 保护。

Fortinet 在 QuickFox 报告中则认为，代码、加载器、AES 密钥和 C2 cluster 与外部归因于 Twill Typhoon 的活动有显著重叠，并高置信度判断相同工具和基础设施被使用。但 Fortinet 同时明确写道， **没有把 QuickFox 活动高置信度归因给某个具体攻击者**。

ESET 的新报告采用了另一种聚类：其遥测没有看到 DarkVigil 活动与 Mustang Panda 的战术重叠，因此把相关活动作为独立 intrusion set，命名为 **SlippyNunchucks**。中文转述补充，该组织至少自 2023 年 9 月 15 日起已活跃，长期以南亚、东亚机构与华语使用者为目标，并通过多款热门中文应用（不限于搜狗）投递同一工具链。

这三种说法可以并存的逻辑是：

-   **工具层**
    
    ：DarkVigil/FDMTP 的框架和代码具有延续性。
    
-   **基础设施与运营层**
    
    ：不同活动可共享工具、密钥或节点。
    
-   **组织层**
    
    ：共享工具不自动证明同一团队，厂商可见遥测和聚类规则也不同。
    

ESET 进一步以高置信度评估 SlippyNunchucks 与中国官方利益一致，依据包括受害对象、中文用户指向以及对博彩和诈骗相关目标的监控模式。报告没有展示某个政府机构直接控制本次攻击的证据。引用时应写成“ESET 的归因评估”，不宜改写成已被独立证实的政府行动事实。

### 7.2 也不能把 PlushDaemon 的 EdgeStepper 直接套进本案

ESET 过去还披露过 PlushDaemon 通过路由器植入 EdgeStepper 劫持搜狗等软件更新，最终投递 SlowStepper。ESET 在 2025 年季度报告中称，当时跟踪到十个劫持更新的 China-aligned 活动集群，包括 SinisterEye、PlushDaemon、Evasive Panda、Blackwood、TheWizards 等。

这是重要的技术背景，却不是本案已证实的初始入侵方式。当前报告没有出现 EdgeStepper，也没有确认路由器品牌、路由器漏洞或 ISP 拦截点。\*\*相似的是 DNS/更新劫持思路，不同的是活动集群、载荷和已掌握证据。\*\*把“以前另一个组织用过路由器植入”写成“本次就是路由器被攻破”，属于跨案补证据。

### 7.3 CVE-2026-51990 与本次漏洞的四项区别

9 月公开的旧研究确实也是搜狗输入法，但它是另一条链：

-   **漏洞不同**
    
    ：CVE-2026-51990 由 `sgbiz:` 自定义协议参数注入、CEF WebView 任意 URL 导航、过旧且无沙箱的 Chromium 组合而成；本次是 CWE-1428 的明文 HTTP 配置获取。
    
-   **触发不同**
    
    ：旧链需要受害者点击特制链接；本次依赖 DNS/流量操纵与正常组件流程。
    
-   **攻击者与载荷不同**
    
    ：Gen Digital 在 UNC3569 入侵中发现旧链并观察到 GRAYRABBIT；本次 ESET 追踪 SlippyNunchucks 与 DarkVigil。
    
-   **修复时间不同**
    
    ：旧链于 4 月 9 日报告，4 月 21 日通过 16.3.0.3498 自动推送修复，7 月分配编号，9 月公开研究；本次于 9 月 11 日报告，10 月 30 日由 16.10 修复。
    

Gen Digital 还指出，旧链修复主要封堵协议处理入口，嵌入式 Chromium 仍未更新，无沙箱和部分不安全开关仍存在。这是另一项加固债务，不能拿来证明 CVE-2026-120422 没有修好，也不能因为升到 16.10 就宣称搜狗全部攻击面已经消失。

更早的 2023 年，Citizen Lab 还披露过搜狗自定义 EncryptWall 的 CBC padding oracle 问题，网络窃听者可恢复 Windows 和 Android 端敏感输入内容，厂商随后修复。它与本次也没有漏洞编号或攻击链上的直接关系。几次事件共同提供的教训是： **输入法既是高权限、高信任桌面组件，也是长期联网客户端，传输安全和组件完整性不能交给“它只是一个打字工具”的直觉。**

### 7.4 旧链 CVE-2026-51990 的修复与利用细节

把 9 月那条旧链再拆一层，能更清楚“为什么输入法这种组件会被反复利用”：

**修复落在协议处理程序，但底层浏览器没动。** Gen Digital 披露、中文媒体转述的修复细节显示，16.3.0.3498 的修复集中在 `biz_helper.exe` 的协议处理入口：它现在会识别携带 URL 的开关参数（ `-url` 、 `-firsturl` ），对每个 URL 调用 `InternetCrackUrlW` 解析，拒绝任何非 HTTPS 协议（ `http://` 、 `ftp://` 、 `data://` 、 `javascript://` 等），再把主机名转小写后与四项目后缀白名单（ `sogou.com` 、 `qq.com` 、 `woa.com` 、 `sogou` ）做逆序后缀匹配。这样 `anything.sogou.com` 能通过，而 `attacker-sogou.com` 不能。

但 Gen Digital 与多家分析方都指出，CEF 配置与 `libcef` 本身的版本没有变， `SGWebRender.exe` 和 `SGMiniBrowserHelperHost` 里 `CefSettings.no_sandbox` 仍为 1， `bDisableWebSecurity` 仍硬编码为 1，不安全开关（ `disable-web-security` 、 `allow-file-access-from-files` ）仍被附加。也就是说，修复只从最前端堵住了“外部协议传入攻击者 URL”的入口，嵌入浏览器的陈旧内核与无沙箱状态仍是加固债务。

**真实利用用的是 2021 年的浏览器漏洞。** 在 Gen Digital 观察到的 UNC3569 入侵中，恶意页面挂在 `noht1ng[.]top` ，投递的是 CVE-2021-38003（一个 V8 的 `JSON.stringify` 类型混淆漏洞，Chrome 在 95.0.4638.69 已修复）。面对打包的 Chromium 80，这个五年前的漏洞仍然生效。Google Threat Intelligence 将 UNC3569 归为中国的“黑客雇佣”生态，自 2021 年追踪至今；GRAYRABBIT 被 Google 描述为该组织常用的上机初始动作，提供远程命令 shell、双向文件传输，并按需从服务器加载后续模块。

**它已进入 VulnCheck 的 KEV。** 与本次 CVE-2026-120422 尚未进入 CISA KEV 不同，CVE-2026-51990 在 2026 年 9 月 10 日被 VulnCheck 的在野利用目录收录（EUVD 编号 EUVD-2026-80932），说明在野利用证据更明确。CISA 官方 KEV 截至检索时未收录，因此没有联邦修复截止日，但不应据此低估风险。

这里的关键教训是： **两次事件都把“高信任、常驻、跨所有应用的输入法”当作入口**。9 月那条靠点击链接加上旧浏览器内核，10 月这条靠网络路径加上明文配置。修补单点不能消除输入法长期积累的攻击面，这也是正文反复强调“升到 16.10 只是起点”的原因。

## 八、个人与企业怎么查：版本、网络、文件、进程、注册表一起上

### 8.1 个人用户先做三件事

**① 查版本并从官方渠道升级。**

在搜狗输入法的设置或“关于”页面确认版本。低于 16.10 的 Windows 版应通过内置更新或搜狗官网升级，不使用第三方“优化版”“精简版”安装包。官方日志没有给出本次 CVE 对应的完整 build 号，因此本文不推荐以第三方下载站的 build 信息作为判定依据。

**② 已经升级，也回顾补丁前的使用情况。**

如果在 7 月至 10 月间长期使用旧版，并且出现过搜狗组件反复崩溃、更新异常、未知 Adobe 进程或安全软件告警，应继续做完整安全扫描。仅有“我升级了”不能回答“之前是否被植入”。

**③ 不把禁用 SGTool.exe 当修复。**

它是正常任务分发组件，粗暴删除或替换可能破坏输入法功能，也不能清除其他已存在的后门。升级、官方重装和按证据处置比手工删除系统组件更稳妥。

### 8.2 企业先收敛资产，再做历史狩猎

资产侧至少应回答：

-   哪些 Windows 主机装过搜狗输入法，当前版本分别是多少；
    
-   哪些主机在 7 月 1 日至 10 月 30 日间运行过旧版；
    
-   是否同时安装过 QuickFox、QingTalk、MiYunChat、SoftCam 或 tawk.to；
    
-   是否有海外中文业务、翻译、跨境客服、远程运维或开发人员使用这些工具。
    

网络侧可以检索下列 ESET IoC。日期是 ESET 记录的首次出现时间，不是本文对当前活跃状态的验证：

```javascript
劫持与 staging：
sogou-cdn[.]com                 2026-07-21
dev.soft-png-cdn[.]com          2026-06-07
47.237.122[.]175                sogou-cdn[.]com
47.239.250[.]102                sogou-cdn[.]com
47.236.254[.]159                dev.soft-png-cdn[.]com

DarkVigil bootstrap：
blog.wangmengfun[.]top2026-07-08
update.mssproxy[.]net           2026-08-06
img.fusfun[.]top2026-08-06
47.86.15[.]1622026-08-08
```

排查时不要只做“域名有没有命中”。一个更强的检测组合是：

```javascript
HTTPHost= config.pinyin.sogou.com
AND URI = /api/brandScd/getBrandScd.php
AND 目的 IP 不属于历史正常搜狗服务地址
```

如果还能看到 TLS 与 HTTP 混合日志，可重点寻找旧版组件持续走明文 HTTP 的资产。对官方域名本身不宜一刀切封禁，否则可能影响正常词库和组件功能。上述 IP 位于云服务商网络，封禁也应精确到 IoC，不应扩大到整个云厂商网段。

### 8.3 文件与签名要放在目录语境里判断

ESET 公布的恶意样本为：

```javascript
8A60A8E90E1F5F08F28FE5A6DD57BD686C20DC23  libcef.dll
ESET detection:Win64/Agent.KSV

3E16BA611782AF6E45576D390488D28FD676BADE
  Microsoft.VisualStudio.HostingProcess.Utilities.Sync.dll
ESET detection:MSIL/DarkVigil_AGen.D
```

第二个样本是 DarkVigil 工具集 IoC，不应硬说成每台搜狗受害机都会落下这个文件。

合法 Adobe 宿主的 SHA-1 为：

```javascript
79188C8DE2378B437D39E867475C5B4714A0D7C9
```

它在 Adobe 正常目录中不构成恶意指标。只有出现以下语境时才值得提高优先级：

-   位于 `\SogouInput\Components\` 或 `biz_center` 版本目录；
    
-   被命名为 `biz_helper.exe` 或冒充 `SogouComMgr.exe` ；
    
-   与陌生 `libcef.dll` 同目录；
    
-   随后发生异常网络连接或注册表插件写入。
    

文件完整性检查还要问一个问题： `SogouComMgr.exe` 的签名者是否仍是预期的搜狗/腾讯主体。若这个路径下的文件变成 Adobe 签名，即使签名有效，也属于强烈异常。

### 8.4 行为检测比单条哈希更有延续性

建议把下列关系做成 EDR 狩猎逻辑，而不是只告警命令行字符串：

```javascript
SGTool.exe
-> 异常 SogouComMgr.exe / biz_helper.exe
-> 从 Components 目录加载 libcef.dll
-> 访问可疑 staging 或 bootstrap 基础设施
```

以及：

```javascript
未知或被侧载的 .NET 宿主
  -> 写入 HKCU\Software\Microsoft\IME\<HWID>\pluginHash
-> 读取并解压注册表中的大二进制值
-> 加载新的 .NET 程序集
-> 产生新的 C2 或插件通信
```

`--appid=scdreg -update` 和 `-invoke BizCenterComBundle BizCenterCom` 本身可能是正常命令，孤立告警会带来噪声。它们应与文件签名、路径、DLL 加载、网络目的地址和时间线联合使用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e1d38d91aa069f29.png)

*图 3：本文依据公开攻击链增补的排查框架，不是腾讯官方事件响应指引。*

### 8.5 一旦出现强指标，不要只删除 libcef.dll

若同时出现恶意哈希、签名错位、异常进程链或 C2 通信，应按失陷事件处理：

-   隔离主机，避免继续接收插件或外传数据；
    
-   保全 EDR 时间线、网络日志、相关文件和注册表证据；
    
-   在全网检索同源基础设施与相同行为，不只处理告警单机；
    
-   评估已执行插件、已收集信息和可能暴露的凭据，再决定凭据轮换范围；
    
-   通过官方安装介质修复组件完整性。对已经确认执行过后门且无法界定后续操作的主机，重装系统通常比单文件删除更可靠。
    

反过来， **没有命中公开 IoC 也不能完全排除感染**。公开样本与域名不是全集，攻击者可以替换载荷和节点，ESET 也尚未公开完整插件与 C2 细节。对高风险机构，行为狩猎和资产时间线比一次性 IoC 扫描更重要。

### 8.6 把攻击链映射到 MITRE ATT&CK

下面这张表不是厂商原文的官方映射，而是本文依据 ESET 与 Fortinet 公开的行为描述推导，供蓝队把零散告警串成狩猎逻辑。每一条都对应文中已经写到的动作，不补写未公开能力。

| 战术  | 技术（编号） | 本文对应的观察 |
| --- | --- | --- |
| 初始访问 | 利用面向互联网的组件配置通道（类 T1190） | 操纵 DNS/流量，把 `config.pinyin.sogou.com` 的配置请求导向攻击者 staging |
| 执行  | DLL 侧加载（T1574.002） | Adobe 宿主 `biz_helper.exe` 加载同目录恶意 `libcef.dll` |
| 持久化 | 劫持合法组件（类 T1547 / T1574.002） | 替换 `SogouComMgr.exe` 或寄身 `biz_center` 版本目录，借原调度流程常驻 |
| 防御规避 | 混淆或压缩文件（T1027）、解码（T1140） | 插件以压缩二进制写入注册表，运行前解压加载 |
| 防御规避 | 修改注册表（T1112） | 插件数据写入 `HKCU\Software\Microsoft\IME\<HWID>\pluginHash` |
| 命令与控制 | 应用层协议（T1071.001，DMTP/HTTP） | DarkVigil 经 DMTP 与 C2 通信，支持反向 RPC 与 client-client |
| 命令与控制 | 入站工具传输（T1105） | C2 经 DMTP 文件传输推送插件 |
| 收集  | 输入捕获（T1056，IME 语境）、本地系统数据（T1005） | 后门位于键盘输入下游，经插件收集主机与用户数据 |

需要提醒：T1190 的归类是类比，因为本次并非经典“打公网应用”，而是“打客户端到官方服务器的配置通道”；准确写法是“类 T1190 / 配置通道利用”，不宜直接说成远程打穿 Web 应用。真正落到 ATT&CK 编号最稳的动作，仍是 DLL 侧加载、注册表插件存储和 DMTP C2 这三项。

## 九、结束语：这次暴露的是一条“信任接力”

这次事件没有一个环节看起来像传统意义上的大型漏洞。输入法下载图标配置是日常功能，Adobe 程序签名正常，组件管理器按既定参数运行，注册表也能合法保存应用数据。攻击者做的是把这些正常动作按错误信任关系接起来：

网络层相信 DNS 给出的地址，应用层相信 HTTP 返回的配置，配置层相信同一份数据里附带的 MD5，执行层相信组件目录里的签名程序，后门层再把真正任务拆成按需下发的插件。

对应地，防守也不能只押一个点。HTTPS 和证书固定解决传输身份，组件签名与目录完整性解决加载信任，EDR 关联解决白加黑执行，注册表与程序集遥测解决插件展开，资产和历史日志则负责回答“补丁之前发生过什么”。

仍有三个开放问题需要继续跟踪：DNS 操纵究竟发生在哪一层，20 多个插件的完整能力是什么，以及实际受害规模和后续入侵动作有多大。公开信息没有回答的部分，本文不作补写。对读者而言，现在可执行的顺序很清楚： **升到官方 16.10 或更高版本，检查历史暴露，按行为与完整性证据排查，而不是只换一个 DNS，也不是只看一眼版本号。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e5c7386d8a4fbd4c.jpg)

**END**

公众号内容都来自国外等平台- 搜索的内容通过结合编写 -

公众号 | AnQuan7 (Ots安全)

威胁分析 · 目录
