---
title: 【微信】谁说后渗透框架就得长命令行：NukeRat 把武器库装进了 Electron
source: https://mp.weixin.qq.com/s/c_VpS05kDJOgwhhHMfPY1A
source_host: mp.weixin.qq.com
clip_date: 2026-11-19T11:29:24+08:00
trace_id: 8969d5e9-445d-4d18-8492-3efe557f9525
content_hash: c9704438b00049e1710343bd16bf83e86523a1540efd1fcc584b1d020d153c95
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41d75244-d011-811f-9d8b-cc1c191d0933
ioc: null
---

**黑白之道** *2026年11月18日 06:49*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：作者的 README 里对理念只有一句概括——Make it simple。可这套东西扒开看一点都不简单：armory.json 里躺着 543 个 BOF 和.NET 工具，lolbins.json 收着 226 个原生 Windows 二进制，Windows 植入体把间接系统调用、AMSI/ETW 补丁、两种睡眠掩码全做成了编译期开关。仓库 11 月 6 日建的，10 天 303 个 Star。

![NukeRat 客户端界面](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/83b44e63c37a1f17.png "NukeRat 客户端界面")

## 一个十天大更的开源后渗透框架

仓库地址是 github.com/nukeratframework/nukerat，2026 年 11 月 6 日建仓，主语言挂着 TypeScript，协议 GPL-3.0，当前版本 1.4.8，主力贡献者是一个叫 Gustavo Henrique T. 的开发者。作者自己的说法很直白：NukeRat 定位跟 Cobalt Strike、Havoc 同一档次，核心理念就一句——Make it simple。

代码结构摊开看分工很干净。server 目录 1318 个文件，主体是 253 个 Python 文件写的团队服务器，FastAPI 框架；client/gui 目录 1045 个文件，Electron 主进程加 React 组件；implants 目录 488 个文件装着三套植入体，Windows 和 Linux 用 Nim，macOS 用 Go，合计 224 个 Nim 文件和 68 个 Go 文件。

## 客户端：把 C2 摊成十来个标签页

顶栏图标排开就是全部能力：终端、文件浏览器、进程列表、截图、键盘记录、凭据、主机列表、攻击关系图、AI Agent、文件服务器。

![NukeRat 攻击关系图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ff0e10dd0afd9437.png "NukeRat 攻击关系图")

攻击关系图这块挺有意思。客户端会向每个已配置的团队服务器发请求，各画一张有向图，会话升级权限后节点会变红，两个会话之间如果用 Relay 连着，箭头上会标出 TCP 或 SMB 类型，会话从图上消失通常就是父会话的 Relay 断了或者子会话压根没走 Relay。

命令队列和事件日志也做成了表格。队列里待执行和已执行的命令全在，双击能看详情，还没投递出去之前可以直接删掉，免得手滑命令跑出去。事件日志按 Listeners、Launcher、Server 分三段读。

## 武器库：543 个工具，数字比 README 还实诚

README 里写的是 "+550 adapted BOF and.NET utilities"，我拉了 armory.json 实际数了一遍，是 543 条，其中 446 个 BOF、97 个.NET 工具。这份目录文件里带着每个工具的名字、类型、参数和解析方式，终端读它来决定怎么跑。

工具本体不放主仓库，单独开了一个 nukeratframework/armory 仓库存源码，通过 armory install all 批量拉取预编译版本，也能单个装、更新、删除。想换成自己的源，在 server.conf 的 \[server.armory\] 里改 repository 指向自己的 GitHub release 即可。

LOLBAS 那块同样，README 说 240 多个原生 Windows 二进制，lolbins.json 里实际 226 条。里面塞的东西包括 Windows 凭据管理器转储、Chrome 主密钥提取、ASR 规则枚举、RBCD 配置这类日常要用的东西。

## Windows 侧的免活手艺

Windows 植入体的规避选项是编译时就能配的：间接系统调用加栈伪装是固定开启的，AMSI 和 ETW 补丁可以打开，睡眠掩码提供 Ekko 和 Zilean 两种实现，字符串混淆支持 Xor 与 RC4，还能选择抹掉内存中的 PE 头。

静态层面还能改产物：换 EXE 图标、在 PE 段里塞诱饵字符串、改 TimeDateStamp 时间戳、调整链接器和子系统版本号。前置代码（Preface）会在主流程前执行，可以用它做沙箱检测、塞垃圾代码或者撑大体积。

注入这块分三种分配模式，源码里的 modes.nim 写得很清楚：VirtualAlloc 常规方式、section 共享节映射，以及模块踩踏（module stomping）。

## 通道只留两条路：HTTP 和自定义

NukeRat 明确不做 DNS、DoH、mTLS 这类通道，官方说法是只保留 HTTP/HTTPS 加自定义通道两类，跟当前趋势对齐。

自定义通道用于把 C2 流量塞进 Telegram、Discord、Dropbox 这类第三方平台，结构是三件套：团队服务器上的 HTTP 监听器 + 一个负责翻译流量的本地脚本 + 第三方平台本身，植入体则在编译期写入对应的通信逻辑。

![自定义通道通信结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6efd9b0dc63332ae.png "自定义通道通信结构")

## AI Agent 和 NukeScript

AI Agent 标签页本质是聊天窗口，接外部模型 API。内置 DeepSeek 预设，自定义模式下可以映射任意 HTTP 提供商，比如把 Grok 的 URL、请求体、请求头逐项填进去，响应取值用 JSON 路径指定，例如 choices\[0\].message.content。官方只支持 system / user / assistant 三段消息格式，所以 OpenAI、Anthropic 那边不打算做预设。

还有个小巧思叫 Copy context，终端、文件浏览器、进程、会话这几个标签页都能把当前内容复制成 JSON，直接粘进对话框，模型就能看着当前目标的状态继续干活。

NukeScript 则是 Python 脚本加事件系统，后台有 worker 盯数据库，事件触发就跑对应脚本，写法类似 event.new_host:on_new_host()，专门用来做自动化和批量操作。

## 落地与下载

团队服务器只支持 Linux，客户端支持 Windows、Linux 和 macOS。安装一条命令：

```bash
git clone https://github.com/nukeratframework/nukerat && cd nukerat && sudo bash install.sh all
```

Windows 客户端是 install\\windows.bat client，macOS 是 bash install/mac.sh client。

官方还提供了一份 Python 植入体示例放在 api 仓库，想自己写通信层的直接照着改。文档站支持英、西、韩、中、俄、日、波斯语七种语言。

相关地址一次给全：

-   主仓库：https://github.com/nukeratframework/nukerat
    
-   Armory 工具源码：https://github.com/nukeratframework/armory
    
-   植入体 API 示例：https://github.com/nukeratframework/api
    
-   官方文档：https://nukerat.com/docs
    
-   两分钟安装教程：https://www.youtube.com/watch?v=3dOcPoVXv30
    

项目协议是 GPL-3.0，仓库里还夹带两块 MIT 授权的代码：Ege Balcı 的 Rust 多态 x86/x64 编码器 SGN，以及 Eugene Kabanov 改自 nimcrypto 的 Nim 加密工具；LOLBAS 参考数据集则仍是 GPLv3。

本文只做技术介绍，动手前请确认在自己的授权环境内使用。

**版权声明**：本文由华盟网原创发布，保留所有权利。配图取自项目官方仓库与文档。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/198462425f2677a2.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c16f744747fed73f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dca7b31069c478b2.jpg)

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

Tools · 目录
