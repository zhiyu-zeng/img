---
title: 【微信】装了个npm包，开发机里的密钥就被读走了
source: https://mp.weixin.qq.com/s/xXvKG79jPm2q42T9qX1Bbw
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T12:54:06+08:00
trace_id: ce7f2e9c-7897-4e89-aa03-e09bd2ff580a
content_hash: efe5b557c19c80250ae74d17f9364e420e431342589f3668664452f33abd8303
status: synced
tags:
  - 微信
  - 恶意样本
  - 开发工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** tensorlake@0.5.144 被投毒，安装时即执行脚本窃取开发机凭据，并通过偷来的令牌自我扩散；密钥失效会触发删除用户目录，须先清驻留再轮换。"
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3f475244-d011-81c3-bf74-d4d75d508d61
ioc:
  cves: []
  cwes: []
  hashes:
    - 25a0735d0db7dc40e5d45ce42d9c106067e6a66e184d967cfecfab17c3bcb5ef
    - b50a00900399ba99fb6ce1fc151519cb99d44320ef2a631f2237e1aea0ad6fec
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** tensorlake@0.5.144 被投毒，安装时即执行脚本窃取开发机凭据，并通过偷来的令牌自我扩散；密钥失效会触发删除用户目录，须先清驻留再轮换。
> 
> - **时间线：** 恶意提交于 10 月 7 日 01:20（UTC）直接落在主分支，随后 7 次提交均未走合并请求；版本 10 月 8 日 01:12:07 由仓库自身发布流程打版，01:23:10 被标记为恶意，间隔约 11 分钟。来源证明因此"全部正确"，攻击者用的是产生证明的那把身份。
> - **执行链：** `package.json` 的 preinstall 钩子执行 `lib/setup.mjs`，该加载器下载第三方 Bun 运行时，再运行约 856 KB 混淆载荷；脚本会检测 CI 环境并跳过自身，目标始终是开发者本人的机器。无需引入代码或启用编程助手功能，装过一次即触发。
> - **窃取范围：** npm 发布令牌、GitHub 写权限与流水线权限、AWS 凭据、Vault、Kubernetes 服务账号令牌与 kubeconfig、SSH 私钥、.env、加密钱包、聊天数据，以及 Claude/Cursor/Kiro/Windsurf/Zed 配置与 MCP 文件；另释放 HackBrowserData 提取浏览器登录信息。
> - **扩散与外传：** 用发布令牌枚举并重发受害者名下的包；用 GitHub 令牌提交 `.claude/settings.json`、`.vscode/tasks.json`，提交者伪装成 `claude@users.noreply.github.com`、信息写成依赖更新；数据经以太坊合约解析端点外传，GitHub 公开仓库（描述含 "Shai-Hulud: Here We Go Again"）为备用通道。
> - **处置顺序：** 载荷安装用户级驻留服务 gh-token-monitor，每 60 秒校验令牌、最长盯 24 小时，令牌一失效就删除用户目录（Unix 删家目录／Windows 删配置文件）。因此必须先停服务、删配置与启动脚本（Linux `systemctl --user disable --now gh-token-monitor.service`，macOS 移除 LaunchAgent，Windows 删计划任务），再轮换全部凭据。核验可查 `tensorlake@0.5.144`（干净版 0.5.143）及 `lib/setup.mjs`、`lib/Math_Symbol.js` 的 SHA-256。

**字节脉搏实验室** *2026年10月9日 12:34*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fcbdef93638d0c8e.png)

## 十月八日凌晨，一个开发包在安装时就开始执行脚本

十月八日凌晨，名为 tensorlake 的开发包在包管理器上发布了 0.5.144 版本，它带一条预安装钩子，安装过程中就执行脚本，把开发机上能找到的密钥读走。安全厂商记录得很细：版本在一点十二分零七秒发布，一点二十三分十秒被标记为恶意版本，中间大约十一分钟。

这个包不是无名小卒，用途是让项目创建和管理云上的隔离沙箱，专门运行不可信、由大模型生成的代码，安全厂商给出的数字是每周大约一万二千次下载，代码托管平台上超过一千个星标。更值得留意的是投毒方式：恶意代码不是从外部混进来的，而是直接进了项目的主分支。

## 来源证明没有问题，问题在于它证明不了什么

安全公司复盘了提交顺序。第一个有问题的提交在十月七日一点二十分落在主分支上，署名是该仓库的一位维护者；此后几小时内又提交了七次，用来调整载荷、往依赖清单里加那条预安装钩子，没有一次经过合并请求。十月八日一点十二分，仓库自己的发布流程把新版本发到了包管理器。

来源证明绑定的是构建来源：哪个仓库、哪条流水线、哪一次提交。这一次这几项全都指向项目自己的仓库和它自己的发布流程，因为改动就发生在主分支上。攻击者没有伪造证明，他只是拿到了产生证明的那把身份。

## 两个时间要分开看

把两个时钟分开算更有用。第一个是从恶意提交到打包发布，十月七日一点二十分到十月八日一点十二分，接近二十四小时，此时包管理器上还没有对应版本。第二个是从发布到被标记，只有十一分钟，它说明的是扫描方的发现速度，不是暴露窗口的长短。真正决定有多少台机器中招的，是从发布到下架之间的那段时间，而下架时刻只有平台自己掌握。

## 一次安装会经过哪几步

按已公布的分析，钩子执行的是包里的一个加载脚本，这个脚本先下载一个第三方运行时，再用它去跑一个约八百五十六千字节的混淆文件。开发者不需要引入这个开发包，也不用启动任何编程助手功能，只要在允许依赖生命周期脚本的环境里安装过一次，钩子就会运行。安全公司还指出，脚本会先判断自己是不是跑在持续集成环境里，是就跳过自己，攻击者瞄准的是开发者本人的电脑。

## 这不是第一次，变化在于落点

行业媒体给出了背景：同类攻击在今年八月初已经出现过一次，当时数百个包被投毒，其中包括两个被大量间接依赖的缓存组件。两次被归进同一个命名序列，公开材料把它们当作同一系列活动处理，但没有确认攻击者身份。变化的是落点：八月那一批靠依赖树扩散，这一次是给编程助手基础设施准备的开发包，靠开发者手上的身份和令牌扩散。

## 它到底能读到什么

把两家来源列出的收集范围按能打开什么重排一遍，比按文件名罗列更有用。包管理器令牌等于你名下包的发布权；代码托管平台令牌等于仓库写权限和流水线权限；云平台凭据覆盖实例元数据服务、容器编排服务和密钥管理服务，拿到的是云上的角色；本机密码保管服务连同集群与云平台的认证路径，等于本机进程能解密的密文；集群的服务账号令牌和访问配置，等于集群里的身份；此外还有登录私钥、环境变量文件、加密钱包、聊天软件数据，以及几款编程助手与编辑器的配置文件。

载荷还会释放一个专门的浏览器数据提取工具，把浏览器里保存的登录信息打包。数据加密后外传：一条路是发到攻击者在受害者账号下新建的公开代码仓库，仓库描述被写成一句与蠕虫同名的标语；另一条是发往一个固定的外部域名。

## 为什么第一反应换密钥反而是错的

拿到令牌之后，载荷会继续扩散。用偷到的发布令牌，它会枚举受害者名下可以发布的包，把自己塞进去、抬高版本号、重新发布，并补一份来源证明；用偷到的代码托管平台令牌，它往受害者仓库里提交两份编辑器与编程助手的配置文件，提交者写成一个助手的机器邮箱，提交信息写成一次普通的依赖更新，以后有人用对应的编程助手打开这个项目，脚本可能再跑一次。载荷里还带有伪造的自动化工作流字符串，说明它也会往仓库里塞流水线配置。

最需要记住的是一条反直觉的顺序。载荷拿到令牌后，会装一个用户级驻留服务，每六十秒拿令牌问一次代码托管平台的接口，最长盯二十四小时；一旦发现令牌失效，它就执行删除用户目录的动作，在类 Unix 系统上删除家目录，在视窗系统上通过脚本删除用户配置文件。所以急着吊销令牌，恰恰会触发它。

## 今天可以核验的四件事

第一件是确认有没有装过。在项目里列出依赖树，再在依赖清单、锁文件、构建日志和已部署的构件里检索被投毒的版本号；如果近期拉过主分支、又在子目录里装过依赖，也一并列进去。

第二件是核对文件本身。对依赖目录里的两个文件计算内容散列值，与安全厂商公布的值比对，数值见文末核验清单；命中就按已经失陷对待。

第三件是清除驻留，这一步要排在轮换任何密钥之前。类 Unix 系统上先停掉那个用户级服务，再删除配置目录和启动脚本；苹果系统上卸载登录项里的对应配置；视窗系统上删除登录时运行监控脚本的计划任务。

第四件是轮换与扩散检查。代码托管平台令牌、发布令牌、云平台密钥、登录私钥、集群与密码保管服务凭据、环境变量文件、浏览器里保存的登录信息，都按已经泄露处理。把依赖钉回干净版本，删掉依赖目录，清一遍包管理器缓存，并在配置文件里关掉安装期脚本。同时检查账号下有没有描述带蠕虫名称的新建公开仓库，提交历史里有没有由助手机器邮箱提交的依赖更新，有没有自己没加过的编辑器或编程助手配置目录。

## 三个可以转述的问题

第一问，我经手的依赖清单和锁文件里，有没有这个被投毒的版本号，用版本号就能核验。

第二问，装过它的那台机器上，有没有那个驻留服务留下的服务项、登录项或计划任务。这一问看文件系统和系统服务记录，有的话就必须先清除再换密钥。

第三问，这台机器上一次安装脚本能读到的凭据，我能不能列全。列不全，说明凭据管理和最小权限还有缺口，这正是攻击者扩大战果的空间。

有三个边界要写清楚。如果这个包只在持续集成环境里装过，钩子会跳过自己，被植入的可能性低一些，但那一次构建能看到的密钥仍然要轮换。被投毒的版本现已从包管理器下架，但已经装到本地的副本不会被清掉，公开渠道也没有给出下载量和受害单位的确认数字。删除依赖不等于清除入侵，凡是装过它的开发机，都要按可能被植入驻留来处理。如果拿不准，就先把这些开发机上的凭据整体轮换一遍，再逐台确认驻留是否清干净。

最后一个可以直接问出口的问题是：我们最近一次安装依赖时，有没有依赖在安装阶段执行脚本，这些脚本又能读到哪些凭据。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/df5904ac22133061.png)

## 来源

1\. Socket：《TensorLake npm SDK Compromised in ChainDrop Shai-Hulud Credential-Stealing Attack》；发布时间：2026-10-08；时区：页面未标注具体时区，文中时间按原文的 UTC 表述；URL：https://socket.dev/blog/tensorlake-compromise ；一手分析，支撑 0.5.144 于一点十二分零七秒（UTC）发布、一点二十三分十秒被标记、每周约一万二千次下载与一千以上星标、预安装钩子与两个恶意文件、约八百五十六千字节载荷、以约三十个公共 RPC 节点解析以太坊合约端点并留 GitHub 作为备用通道、hostage token 驻留服务、两个文件的内容散列值，以及先清除驻留后轮换凭据的顺序。

2\. StepSecurity（Ashish Kurmi）：《Tensorlake npm Package Compromised: A Worm With a Hostage Token That Wipes Your Machine If You Revoke It》；发布时间：2026-10-08；时区：页面未标注具体时区，文中时间按原文的 UTC 表述；URL：https://www.stepsecurity.io/blog/tensorlake-npm-compromised-hostage-token-worm ；一手分析，支撑首个恶意提交十月七日一点二十分（UTC）、随后七次提交且未走合并请求、由仓库发布流程打版、脚本在 CI 中跳过自身、每六十秒校验令牌最长二十四小时、删除用户目录的分平台动作、提交 claude@users.noreply.github.com 与.claude/.vscode 文件，以及分平台清除 gh-token-monitor 的路径与 GitHub issue 1014。

3\. The Hacker News（Ravie Lakshmanan）：《Tensorlake npm Package Compromised to Deliver Shai-Hulud Credential-Stealing Worm》；发布时间：2026-10-08；时区：页面未标注具体时区；URL：https://thehackernews.com/2026/10/tensorlake-npm-package-compromised-to.html ；行业媒体交叉报道，支撑释放 HackBrowserData、以 iseekaigogo.com 为端点、以太坊合约解析与 GitHub 备用外传通道、0.5.144 已从 npm 下架，以及 ChainDrop 最早于 2026 年 8 月初影响 Keyv、Cacheable 等数百个 npm 包的背景。

## 核验清单（供排查使用）

• 被投毒版本：npm 上的 tensorlake@0.5.144；可回退的干净版本：0.5.143。

• 恶意文件内容散列值（SHA-256）：lib/setup.mjs 为 25a0735d0db7dc40e5d45ce42d9c106067e6a66e184d967cfecfab17c3bcb5ef；lib/Math_Symbol.js 为 b50a00900399ba99fb6ce1fc151519cb99d44320ef2a631f2237e1aea0ad6fec。

• 安装钩子：package.json 中的 preinstall 执行 node lib/setup.mjs，加载器下载 Bun 运行时后执行载荷；该钩子在 CI 环境中跳过自身。

• 驻留服务：gh-token-monitor，每 60 秒校验一次 GitHub 令牌，最长 24 小时；令牌失效即执行删除用户目录的动作。

• 驻留位置：Linux 为 ~/.config/gh-token-monitor/ 与 ~/.local/bin/gh-token-monitor.sh，可执行 systemctl --user disable --now gh-token-monitor.service；macOS 为 ~/Library/LaunchAgents/com.user.gh-token-monitor.plist；Windows 为登录时运行 monitor.ps1 的计划任务。

• 外传通道：iseekaigogo.com；经以太坊合约解析端点（约 30 个公共 RPC 节点），GitHub 作为备用；受害者账号下出现描述为 Shai-Hulud: Here We Go Again 的新建公开仓库。

• 扩散痕迹：仓库中出现.claude/settings.json 与.vscode/tasks.json，提交者为 claude@users.noreply.github.com，提交信息为 chore: update dependencies。

• 其他载荷能力：释放 HackBrowserData 提取浏览器数据；收集范围含 npm 令牌、GitHub 令牌、AWS 凭据、Vault、Kubernetes 服务账号令牌与 kubeconfig、SSH 密钥、.env 文件、加密钱包、聊天软件数据，以及 Claude、Cursor、Kiro、Windsurf、Zed 的配置与 MCP 文件。

• 上游反馈：StepSecurity 向维护方提交 GitHub issue #1014。

作者提示: 内容由AI生成
