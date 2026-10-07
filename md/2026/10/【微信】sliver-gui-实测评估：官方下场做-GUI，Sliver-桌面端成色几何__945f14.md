---
title: 【微信】sliver-gui 实测评估：官方下场做 GUI，Sliver 桌面端成色几何
source: https://mp.weixin.qq.com/s/Lrh5oQo0QQPpn5isNbbKbQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-07T15:57:07+08:00
trace_id: 704181c7-b375-477e-8c93-5951d27ae61b
content_hash: 74f3e4e117e39e064a9e315bea8890ccdbeab072e6b418233df107a6fcc408fe
status: synced
tags:
  - 微信
  - 安全工具
  - 红队工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 官方 Sliver 桌面客户端 v0.0.3 架构设计远超同类开源 C2 GUI，但完成度撑不起严肃行动，属"dogfood 可用"阶段。
ai_summary_style: key-points
images_status:
  total: 25
  succeeded: 25
  failed_urls: []
notion_page_id: 3f275244-d011-81a1-b9d5-dd1ddc85424a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 官方 Sliver 桌面客户端 v0.0.3 架构设计远超同类开源 C2 GUI，但完成度撑不起严肃行动，属"dogfood 可用"阶段。
> 
> - **血统与定位：** sliverarmory 官方组织三天连发 v0.0.1–v0.0.3，原作者 moloch-- 参与提交；它不是给 server 套 web 面板，而是 Electron 桌面应用，以 operator 身份经 gRPC mTLS 接入已有 sliver-server daemon，与 CLI 共用 multiplayer 协议，多操作员可同时在线。
> - **安全边界：** mTLS 证书只存主进程并持有，渲染进程无文件系统与网络能力，仅能用 contextBridge 白名单 IPC；渲染全沙箱 + 严格 CSP，Electron fuses 封死 `--remote-debugging-port`（实测带调试参数启动无效），配置走自定义 `sliver://` 协议导入。
> - **功能面：** 覆盖 generate → listener → session 全链路；会话工作区八标签（Windows 多 Registry，平台门控做在标签层）；截屏默认不落盘、预览 15 分钟过期即焚；Activity 为每次会话操作留时间戳流水；顶栏 Console 内嵌完整 sliver REPL 兜底长尾命令。
> - **实测短板：** 五次截屏两次报 RPC 未完成，工作区预览常被刷新周期清掉导致 Save 竞态；运行中新放入配置目录的文件不重扫，需 touch 或重启；Linux 被标为扩展平台目标，implant 为动态链接 ELF、43.6 MB；自签签名导致 SmartScreen / Gatekeeper 拦截，Console 仍标 alpha。
> - **适用建议：** Sliver 新手与培训、已有 multiplayer server 的团队、研究桌面工具安全边界的人可即刻受益；需长时间盯会话的严肃行动建议等一两个小版本，重度 Linux 目标先评估动态链接与体积约束。

**赛博生存指南** *2026年10月7日 15:04*

> 仓库地址：https://github.com/sliverarmory/sliver-gui  
> 测试版本：v0.0.3（portable）+ sliver-server v1.7.8  
> 测试日期：2026-10-07，全部截图来自本次实测环境

Sliver 是 BishopFox 开源的 C2 框架，命令行用了很多年，官方 GUI 一直缺席，社区只能靠 DarkLyric 这类第三方壳。2026 年 10 月 4 日到 6 日，sliverarmory 组织（Sliver 官方生态组织，sliver.sh 域名持有方）三天连发 v0.0.1 到 v0.0.3 三个版本，仓库提交者里能看到 moloch--（Sliver 原作者）的身影。这是官方第一次认真做桌面端。

本文不是 README 翻译，是一次完整实测：从连接 server、生成 implant、部署到授权目标机、拿到活跃 session，到交互 shell、远程截屏、进程枚举全部走了一遍，22 张截图都来自本次环境。先给一句话结论： **架构设计远超同类开源 C2 GUI 的平均水准，密钥不出主进程、渲染进程全沙箱、fuses 封死调试端口、每个会话操作带审计流水；但 v0.0.3 的完成度还撑不起严肃行动，截屏 RPC 偶发失败、工作区状态被刷新周期重置，这类问题实测第一天就能碰上**。官方做产品的诚意看得见，离能交付给客户还差着版本号。

## 1\. 项目背景：官方血统，早期阶段

几个关键事实先摆出来：

| 项目  | 说明  |
| --- | --- |
| 仓库  | sliverarmory/sliver-gui，GPL-3.0-or-later |
| 版本  | v0.0.1（10-04）、v0.0.2（10-05）、v0.0.3（10-06） |
| 定位  | Sliver 官方桌面客户端，支持 Windows / macOS / Linux |
| 发布物 | Windows NSIS 安装器（支持自动更新）+ portable 免安装版（手动更新） |
| 依赖  | 只做客户端，需要先有 sliver-server（multiplayer daemon 模式） |

它不是给 server 套个 web 面板，而是标准的 Electron 桌面应用，以 operator 身份通过 gRPC mTLS 连接已有的 sliver-server daemon，和 CLI 客户端走同一条 multiplayer 协议。这意味着 GUI、CLI、多操作员可以同时在线操作同一个 server，权限按 operator 配置收敛。

## 2\. 技术架构：Electron 也可以不裸奔

技术栈一句话：Electron 44 + React 19 + HeroUI 3.2 做 UI，sliver-script 2.0.0-rc.5（TypeScript 版 gRPC 客户端）做协议层，@xyflow/react + elkjs 画拓扑，monaco-editor 做编辑器，ghostty-web 0.4.0 + node-pty 跑内嵌终端，另外捆了 AWS / Azure SDK（给云端部署窗口用）。

![sliver-gui 技术架构与安全边界](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/636173a25ef51d4f.png)

安全边界是这个项目最值得说的部分，源码和实测都能对上：

-   **密钥只进主进程**。operator 配置（含 mTLS 证书）由主进程读取和持有，渲染进程拿不到文件系统与网络能力，只能通过 contextBridge 暴露的白名单 IPC（ `window.sliver.generate` 、 `window.sliver.startListener` 这类粒度）调用。
    
-   **渲染进程全沙箱 + 严格 CSP**，inline script 直接被策略拦掉。
    
-   **Electron fuses 封了 `--remote-debugging-port`**。实测带调试参数启动直接被忽略，想挂 DevTools 改页面、dump 内存里的凭据，这条路官方提前堵了。对 C2 工具来说这是加分项；对我们这些搞自动化测试的，它是最先撞上的一堵墙。
    
-   自定义 `sliver://` 协议处理配置导入，配置文件不落明文交换。
    

这套设计在开源 C2 GUI 里相当少见。同类项目普遍是 server 直接渲染页面或者把凭据塞进 renderer，而 sliver-gui 的做法接近密码管理器的架构： **UI 层只负责展示，敏感操作全部收敛在一个可审计的主进程边界内**。

## 3\. 测试环境与方法

| 角色  | 环境  |
| --- | --- |
| 操作机 | Windows 11 Pro，sliver-gui v0.0.3 portable（SHA256 校验通过） |
| C2 server | 同机 sliver-server v1.7.8 daemon 模式，gRPC mTLS:31337 |
| 授权目标机 | 192.168.31.80（已获授权的 Ubuntu 24.04 桌面机，kernel 6.8.0-137） |
| 上线通道 | mtls listener:8888 |
| operator | 名为 gui 的操作员配置，permissions all |

方法上说明两点。第一，GUI 自动化用的是它自家 E2E 同款技术栈（Playwright 的 Electron 支持）加一个命令轮询 daemon，页面内点击走 DOM 事件；文中所有截图都是真实运行状态的窗口抓图，没有拼图。第二，测试机装有火绒，早期鼠标级自动化在侧栏上偶发点击无响应，放行后 DOM 级操作全部正常——这个现象没能严格归因（火绒注入拦截还是应用问题说不清），所以不记为产品缺陷，只作为环境注记。

## 4\. 上手：连接与总览

sliver-gui 的连接对象是 multiplayer daemon。server 侧用 `operator --name gui --lhost 127.0.0.1 --permissions all` 生成一份操作员配置，GUI 首次启动时导入即可：

![operator 配置生成与 GUI 连接流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/adb27f435e3cb926.png) ![首次启动](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c94fcf7855488f45.png)

首次启动是配置导入向导：可以直接粘贴配置内容，也可以把文件放进 `~/.sliver-client/configs/` 再点 Browse。这里实测踩到一个坑： **配置目录的发现是 watcher 式的，应用启动后新放入的文件不会出现在列表里，要 touch 一下文件或重启应用才刷新**。

![连接已有 server](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b55f18121a68d6cc.png)

连接成功的标志是左下角出现 operator 徽标（gui · 1.7.8）和 server 地址。顶栏一排小按钮信息量很大：侧栏开关、命令面板、新建窗口、Open Sliver console（后面细说）、升级检查。

![Overview 拓扑](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4946ffb92442768c.png)

Overview 页是一张 elkjs 自动布局的拓扑图：operator、server、session、listener 都按类型着色，右上角可以按类型 / 状态过滤，还有 Graph / List 两种视图切换。会话上线后节点会实时出现。另外注意左侧栏的角标（Sessions 1、Jobs & listeners 1），整个导航带计数徽章，扫一眼就知道有没有活会话。

## 5\. 从生成到上线：完整打一轮

这是本文的主线测试：用 GUI 表单生成一个 Linux implant，部署到授权目标机，看它上线。完整链路如下：

![从 Generate 表单到会话工作区的完整链路](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/44b527375302d920.png) ![Generate 表单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c053d60677faa99c.png)

Generate 页是个结构化表单：implant 类型（session / beacon）、目标 OS / 架构 / 输出格式、C2 端点列表、模板、以及一段可折叠的 shellcode / 混淆高级选项。表单可以存成 profile 复用。实测注意三点：

-   Windows 是一等公民，Linux 在界面里标注为 **extended platform target** （扩展平台目标），支持但非主打；
    
-   生成的 Linux implant 是 **动态链接的 ELF** （即使 build 时用了 netGo 相关选项），没有 glibc 的环境跑不起来，容器 / Alpine 类目标要小心；
    
-   产物体积不小，本次 Linux amd64 executable 为 **43.6 MB**，这是 Sliver 动态编译体系（每个 implant 唯一 codename + 服务端保留完整源码树）换来的代价。
    

构建过程有 compiler 状态门控（表单在编译器就绪前是禁用的），产物生成后通过原生保存对话框落盘。

![构建档案](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/276c66efdcc9f17c.png)

Builds & profiles 页列出 server 上的全部构建：Build ID、codename、时间、平台。这里有个能对账的细节：表里的 Build ID `d4e33428-...` 就是后来 session Identity 面板里的 implant ID， **构建档案和上线会话可以互相追溯**。

![Jobs 页](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f2e71b50524c5891.png)

Jobs & listeners 页：本次的 mtls listener 显示为 Job 1 · TCP:8888 · RUNNING，描述 “MTLS listener”。启动 listener 时 GUI 还提供可选的托管防火墙规则（Windows 上自动放行端口）。支持 mtls / http / dns / wireguard 等多种 listener 类型。

![Sessions 表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/af0f7eb49a1a0ef2.png)

implant 在目标机执行后（本次通过 SSH 投放， `setsid nohup` 脱离会话运行），一两秒内 Sessions 表就多了一行：codename、用户 kimmy@ubuntu、操作系统、传输协议、最近 check-in，check-in 时间自动刷新。

## 6\. 会话工作区：八个标签页逐个实测

点进 session 后是工作区，顶部面包屑 + 会话摘要（平台、PID、最近 check-in），下面八个标签： **Overview、Execution、Files、Processes、Network、Environment、Shell、Activity**。Windows 目标会多一个 Registry 标签，Linux 下直接不渲染，平台门控是做在标签层的。

![会话工作区](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/765aae8020ef2076.png)

Overview 标签是三张卡片。Identity 卡片信息很全：session ID、状态、主机名、用户与 UID、进程名 + PID、完整内核版本、locale、传输协议、远端地址 `192.168.31.80:55062` 、C2 端点、是否提权、首次 / 最近 check-in 时间，其中 check-in 是实时跳动的。还有个 Registry 区块在 Linux 目标上显示 “Windows only”。

![Ping 实测](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11e6daf34ae9592e.png)

Ping 卡片实测：点击 Run ping，返回 **RTT 9.2 ms**，带测量时间戳。它测的是 server 到 implant 的往返延迟，局域网内数值合理。

![远程截屏实测](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ed2a895684f62504.png)

Screenshot 卡片是最能体现设计取向的一块。点击 Capture，implant 在目标机抓屏（X11），字节流回传后在卡片内直接渲染预览——本次抓到授权测试机的 Ubuntu 桌面，2.8 MB，预览上明确标注 **过期时间（15 分钟后）**，Save preview 按钮才把文件写盘。也就是说截屏默认不落盘、预览绑定当前窗口和会话、过期即焚，这是很自觉的 OPSEC 设计。实测也抓到偶发失败：五次 Capture 里两次报 “The remote screenshot request did not complete”，重试即恢复，这种偶发问题修起来应该不难。

![交互 shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b8c67d80a3a39f0.png)

Shell 标签是个真终端：ghostty-web 渲染，直接给出目标机 shell 提示符 `kimmy@kimmy-vm:/tmp$` 。实测敲 `whoami; uname -a; ls /tmp` ，全部正常回显， `ls /tmp` 的输出里就有 implant 本体 COLORFUL_SPEAKERPHONE。这是完整的交互式 shell（非一次性命令执行），支持多标签。

![进程列表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f8dba1ca3295ea6a.png)

Processes 标签：全量进程表（PID、名称、用户、状态），目标机的 gnome-shell、nautilus 等桌面进程都在列，implant 自身（PID 2573826）也能看到，配 Refresh / Kill process / Start collection 操作。

![文件浏览器](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d3c25987244728a0.png)

Files 标签：远程文件浏览器，路径栏直达 `/tmp` ，上传 / 下载 / 新建目录 / 删除 / 重命名一排操作齐全。下载走的同样是原生保存对话框。

![网络连接](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6fa62927fb4df5cf.png)

Network 标签：netstat 风格的连接表。有意思的是能在这张表里看到 implant 自己那条 ESTABLISHED 连接： `192.168.31.80:55062 → 192.168.31.207:8888` ，正是 session 自身的 mtls 通道，自证回连路径。

![环境变量](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/06444bec5170eac7.png)

Environment 标签：目标进程的环境变量全量列出（DISPLAY、XDG\_\*、SHELL 等），支持新增和 Reveal 操作。

![执行表单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ad2062e4f6203303.png)

Execution 标签：三种执行方式——Execute process（命令行）、Execute BOF、Execute.NET assembly，各有独立表单（.NET 在 Linux 目标上同样受平台门控），输出处理策略可选。

![操作审计](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7095b60eb07b9e76.png)

Activity 标签单独说一下： **每个会话操作都带时间戳记入流水**，02:44 ping round-trip 9.2ms、03:44 screenshot capture succeeded、03:45 capture failed、03:48 interactive terminal opened、03:51 processes refresh……操作者做了什么、什么时候做的，事后可查。多人同时操作一个 server 时，这条流水就是分工和追责的依据。

## 7\. Console：GUI 里长出一个完整 CLI

GUI 再全，也总有没覆盖的命令。sliver-gui 把它做成了顶栏一个终端图标：点开是独立窗口，里面跑着 **完整的 sliver REPL**。

![Console 窗口](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/abb82cf71ec79d5d.png)

Console 窗口（标题 “Sliver console — gui — Console 1”）：多标签、搜索、欢迎横幅写着 “Welcome to the Sliver console — alpha”。底部状态栏直接标注运行时： **ghostty 0.4.0 · sliver-script 2.0.0-rc.5**。它不是模拟的命令面板，是 sliver-script 驱动的真客户端。

![Console 执行 sessions](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ba4cd33b33178f00.png)

实测在 Console 里敲 `sessions` ，输出和 CLI 完全一致的表格：session ID、codename、传输、远端地址、主机名、用户。这就是 README 里说的 operator parity： **GUI 做常用操作的快捷路径，Console 兜底全部长尾命令**。

![命令面板](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3ebb17ef2c90ad6a.png)

主窗口还有个命令面板（Ctrl+K 风格），Pages / Actions / Preferences 三类检索，页面跳转和常用动作不用记菜单位置。

![窗口菜单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e56ed97f1b83586.png)

新建窗口菜单里列着三个专职窗口： **Armory** （扩展包管理：Browse, install and manage Sliver extensions）、 **Network map** （会话间 P2P 关系可视化）、 **Cloud deployment** （部署 server 到 AWS / Azure，对应捆绑的云 SDK）。这三个入口走的是原生菜单，本次自动化够不到原生菜单层，没有展开实测，从源码测试覆盖看功能是完整的。

![View 菜单](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3c98bd3f26e04ab3.png)

View 菜单提供 Ctrl+1 到 Ctrl+6 的页面快捷键、Report Screenshot（对窗口截图取证）等。整体快捷键体系对键盘党是认真的。

## 8\. 理性分析：优势与短板

### 优势

| #   | 点   | 说明  |
| --- | --- | --- |
| 1   | 官方血统 | sliverarmory 生态组织出品，原作者参与，协议层用官方 sliver-script，不会出现第三方壳常见的协议漂移 |
| 2   | 安全架构 | 密钥不出主进程、渲染全沙箱、CSP、fuses 禁调试端口，威胁模型明确（防的是操作机上的本机窃取） |
| 3   | operator parity | 内嵌完整 CLI REPL，GUI + Console + CLI 三种形态共存，multiplayer 多操作员同时在线 |
| 4   | 全流程覆盖 | generate → listener → session → 交互（shell / 文件 / 进程 / 网络 / 注册表 / 执行 / 截屏）一应用全包 |
| 5   | OPSEC 自觉 | 截屏默认不落盘 + 预览过期即焚、每会话操作审计流水、构建与会话可追溯串联 |
| 6   | 工程质量 | 结构化 IPC 契约（shared/contracts.ts）、大量单元 + Playwright E2E 测试、发布带 SHA256SUMS、自动更新（安装器版） |

### 短板与粗糙边（v0.0.3 实测）

| #   | 点   | 实测证据 |
| --- | --- | --- |
| 1   | 截屏 RPC 偶发失败 | 五次 Capture 两次 “did not complete”，重试恢复 |
| 2   | 工作区状态被刷新重置 | 截屏预览标注 15 分钟过期，实际多次在十余秒后被会话刷新周期清掉（routeKey 重挂载），Save preview 竞态很难点中；工作区偶发自动跳回 Overview |
| 3   | 配置发现不重扫 | 运行中放入 `~/.sliver-client/configs/` 的新配置不出现，需 touch 或重启 |
| 4   | Linux 目标是二等公民 | Generate 界面明标 extended platform target；implant 是动态链接 ELF，43.6 MB 偏大 |
| 5   | 分发摩擦 | 自签代码签名证书，Windows SmartScreen / macOS Gatekeeper 都会拦；portable 版无自动更新 |
| 6   | Console 还在 alpha | 欢迎横幅自标 alpha，成熟度待观察 |
| 7   | 已知 UI 问题 | 官方 issue 跟踪里已有 Linux 侧栏透明度等问题在修（issue #30 等） |
| 8   | 功能面尚窄 | Loot / Credentials 实测均为空状态页（无数据时只有提示文案），数据管理深度未验证；beacon 场景本次未实测 |

整体看，这些短板多数是「0.0.x 阶段的时间问题」而不是「架构烂」：截屏失败、状态重置这类问题出在实现层，架构层（安全边界、IPC 契约、审计链）反而是同类项目里最扎实的。

## 9\. 结论：谁该用，现在能用吗

**现在就能受益的人**：一是 Sliver 新手和培训场景，结构化表单 + 拓扑图 + 命令面板，比背 CLI 参数直观得多，还能开着 Console 对照学；二是已经跑 multiplayer server 的团队，GUI 作为第二个 operator 接入零成本，会话审计流水对多人协作有实际价值；三是做红队工具链研究的人，它的 Electron 安全边界设计（fuses、CSP、密钥隔离）值得所有桌面安全工具抄作业。

**建议再等等的人**：需要长时间盯会话的严肃行动。截屏偶发失败、预览被刷新清掉这类问题在日常运营里会被反复触发，等一两个小版本迭代更稳。另外重度 Linux 目标场景先评估动态链接 ELF 和体积约束。

最后给个判断： **这不是社区爱好者攒的壳，是官方按产品标准在做的客户端**。v0.0.3 的完成度大约对应「内部 dogfood 可用」，架构层面我给高分，实现层面及格边缘。按这个迭代节奏（三天三版），值得保持关注，两个月后再测一轮。

## 参考资源

-   sliver-gui 仓库：https://github.com/sliverarmory/sliver-gui
    
-   v0.0.3 Release（含 SHA256SUMS）：https://github.com/sliverarmory/sliver-gui/releases/tag/v0.0.3
    
-   Sliver 官网：https://sliver.sh
    
-   Sliver 主仓库：https://github.com/BishopFox/sliver
    
-   multiplayer / operator 文档：https://github.com/BishopFox/sliver/blob/master/doc/multiplayer.md
    
-   侧栏透明度 issue：https://github.com/sliverarmory/sliver-gui/issues/30
    

工具技巧 · 目录
