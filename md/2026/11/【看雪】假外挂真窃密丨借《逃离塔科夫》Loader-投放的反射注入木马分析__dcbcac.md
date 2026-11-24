---
title: 【看雪】假外挂真窃密丨借《逃离塔科夫》Loader 投放的反射注入木马分析
source: https://bbs.kanxue.com/thread-293646.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-24T10:15:04+08:00
trace_id: 2828043f-25b9-48d8-894c-7ba0c3736134
content_hash: 843bb2930b62ea7e5500d66728a259f0e058e78f7a8504a61c57c1cce7f8428b
status: synced
tags:
  - 看雪
  - 恶意样本
  - 游戏安全
series: null
feed_source: 看雪·逆向工程
ai_summary: 伪装成《逃离塔科夫》外挂的 GitLab 项目实际是反射注入窃密木马，窃取浏览器凭据、钱包与 AI 开发工具 API 密钥，并上传至由 Telegram 下发的 C2。
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 42275244-d011-81c5-aad2-f86eba0157e4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 伪装成《逃离塔科夫》外挂的 GitLab 项目实际是反射注入窃密木马，窃取浏览器凭据、钱包与 AI 开发工具 API 密钥，并上传至由 Telegram 下发的 C2。
> 
> - **诱饵与分发：** 诱饵仓库只有 eft_hack.zip 和 README，宣称提供自瞄、透视、雷达；承载载荷的仓库 skywatch（2026-10-19）比诱饵仓库（2026-11-15）早近一个月，说明分发通道提前就绪。
> - **Loader 链：** 先由 PowerShell 弹出“Checking for updates”，再从 Pastebin 拉取配置，用随机目录名下载 `74L814BW31FX.exe` 并启动下一阶段。
> - **反射注入：** 解密内嵌载荷并校验 MZ/PE 签名，自建 syscall 描述表、Patch EtwEventWrite，创建挂起的浏览器进程后注入 DLL，由导出函数 KdMXFBaWQ 完成反射加载；遇到 Edge 时还会改注册表关闭 Startup Boost。
> - **采集范围：** Chromium 分支提取密码、Cookie、银行卡、自动填充、CVC、Token 和历史记录，Gecko 分支用 NSS 解密；另外收集钱包、浏览器扩展、Discord/Steam/Roblox/Telegram/Signal、OneNote、VPN 连接信息以及 Claude Code、Codex CLI 配置；带 `--incognito` 时执行全量采集。
> - **C2 与处置：** 从 Telegram 频道描述获取地址（当前为 super-fourteen33.cc），失败时回退到硬编码地址；建议不运行此类外挂，并对已中招的机器轮换钱包、密码管理器主密码和 2FA 恢复码。

近期，火绒安全实验室监测到GitLab平台上出现伪装成《逃离塔科夫》游戏外挂的恶意样本。该项目宣称具备自瞄、透视、雷达等功能，实际为窃密木马，运行后会窃取浏览器敏感信息、加密货币钱包、即时通讯数据等，并通过Telegram频道描述获取C2地址上传数据。除此以外，该木马还会采集Claude Code、Codex CLI、等AI 开发工具的本地配置，以及 OneNote等笔记软件数据以及相关VPN 工具的连接信息——在 AI 工具深度接入工作流的当下，这些配置中保存的 API 密钥一旦泄露，波及的不只是个人隐私，还会有企业账户与算力资产。

火绒工程师在溯源中发现，该项目创建于2026年11月15日，仓库仅包含eft_hack.zip与README，无真实外挂源码。从时间线看，本次追踪到的载荷托管仓库（skywatch）创建于2026年10月19日，比该诱饵仓库早了将近一个月——也就是说，早在诱饵抛出之前，载荷分发通道就已经就绪。这更像是一场有准备的行动，而非临时起意。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6763912e4580fe2d.webp)

仓库

README中直接宣称：“我们制作的《逃离塔科夫》外挂，配备了目前市面上最好的塔科夫自动瞄准、透视/穿墙功能。我们的外挂功能非常强大，我们力求始终保持领先优势。在这里，我们成就胜利。”并给出了使用说明。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59b521495b6e3e82.webp)

README

火绒安全实验室将持续关注此类窃密木马的传播动态，并及时更新拦截规则，保障用户系统安全。

目前，火绒安全产品已实现对该行为的拦截与查杀。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad1d61768817034d.webp)

火绒查杀图

## 二、 流程图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/71afef46ec20eff5.webp)

流程图

## 三、 样本分析

Loader程序启动后首先显示更新提示，通过PowerShell弹出Checking for updates 提示信息，随后向Pastebin发起HTTP GET请求，获取远程配置。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e64f6e60e387f16.webp)

弹出 Checking for updates、获取远程配置

解析配置后，生成随机字符串，构造随机目录名。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bb35b244b5133f75.webp)

读取响应，生成随机字符串

遍历配置，下载文件

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e3bae1b1a29e5a6.webp)

每行作为一个待处理项目

通过exec_Command()和Cmd_Start()启动下载的程序，将执行流程交给下一阶段。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5dafeb279b4f8d5.webp)

启动下载的程序

本次分析中发现的下载地址：

https://gitlab.com/charlyhills/skywatch/-/raw/main/74L814BW31FX.exe

该项目创建于2026年10月19日，同样无正常代码，仓库内连续提交多个随机命名PE 文件：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad86c41d50894ba0.webp)

skywatch项目主页

第二阶段程序启动后，首先初始化所需模块和API函数地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8bdf38cc7efe56fa.webp)

API初始化与导出函数检查

解析PE节表，定位NT Headers，获取节数量以及Section Table地址

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9e9ba2baf4dfd650.webp)

PE节表扫描与特征匹配

初始化解密数据缓冲区，分配工作缓冲区，并将内置数据复制到新分配的内存中

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d73e5a8223d93614.webp)

解密数据及密码状态初始化

根据CPU特征选择数据处理路径，一条路径使用SIMD优化实现，另一条路径使用普通实现。两条路径最终生成后续解密流程所需的数据状态。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5f2a5f3bdcb7ea51.webp)

两条数据处理分支

验证解密后的PE文件，检查DOS Header的MZ签名、e_lfanew范围，以及NT Headers的PE签名。验证失败则进入清理及终止流程。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3527101e3479ffc6.webp)

PE文件格式验证

解析CreateThread/WaitForSingleObject地址，创建线程执行

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7f494e78d4ce7d0b.webp)

创建线程执行

解密字符串，解析ntdll导出，建立syscall 描述表

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1cbd24542def95cf.webp)

解析ntdll导出

Patch EtwEventWrite

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96b00428ccbf76cb.webp)

patch API

根据内置浏览器路径表查找本机安装的浏览器，对于Microsoft Edge，程序会修改注册表位置，关闭Edge Startup Boost，中止目标浏览器现有进程，创建挂起浏览器进程并注入DLL

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d5cebf2088d8e7bc.webp)

创建挂起进程注入

被注入的DLL通过导出函数KdMXFBaWQ作为反射式加载入口，将DLL自身映射到新的内存区域，映射完成后，调用DLL入口点，获取当前进程命令行， 检查是否包含--incognito 参数。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8c7011b290265384.webp)

映射后调用

根据宿主浏览器类型选择不同的数据采集路径。按宿主类型拼出浏览器的User Data目录，再拼出Local State的完整路径，Chromium家族进入浏览器数据采集流程。Firefox / Zen 进入 Gecko 对应分支。--incognito参数决定是否执行全量采集。

Chromium 分支提取密码、Cookie、银行卡、自动填充、CVC、Token和历史记录。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/280d4d6eeafeced5.webp)

Gecko分支通过NSS解密Firefox/Zen保存的登录凭据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d80e55d49f3092bb.webp)

其他模块：采集钱包、浏览器扩展、Discord、Steam、Roblox、Telegram、Signal等数据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2cb97111b6d77ea5.webp)

从 Telegram 频道描述获取 C2 地址。失败时使用硬编码地址作为备用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a27c3d17bd048d31.webp)

打包上传C2

当前TG频道的值为super-fourteen33.cc

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ef0fb66d1fae1b3a.webp)

TG描述

## 四、 火绒安全建议

-   **不要下载、解压、运行任何免费/免检测外挂**，尤其GitLab、GitHub 话题页引流的压缩包；
-   开启火绒实时防护与主动防御；
-   对已运行过诱饵机的用户，加密货币钱包、密码管理器主密码、2FA恢复码全部轮换，并审查 Obsidian/AI 工具配置是否被外泄。
    

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7db39fa6e9a4dc23.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/399ee1e599cf6c6a.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9078ae1cb3b0944.webp)
