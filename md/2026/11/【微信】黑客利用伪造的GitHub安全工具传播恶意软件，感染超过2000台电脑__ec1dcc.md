---
title: 【微信】黑客利用伪造的GitHub安全工具传播恶意软件，感染超过2000台电脑
source: https://mp.weixin.qq.com/s/cztPH-vGLJTmqRRh9lghoQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T10:44:59+08:00
trace_id: a965fa42-0de3-4a44-90fd-528f60e1246d
content_hash: d75040daf94a00fc3bf048520d9dd884753a18b32766b5a21012520ada5792b5
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41475244-d011-814b-b10a-d172d1175d53
ioc: null
---

**暗镜** *2026年11月10日 06:00*

根据 Doctor Web 11 月 5 日的调查，该攻击活动的目标群体包括网络安全专业人士和区块链游戏爱好者，它利用 Visual Studio 项目以及 Python 和 Go 脚本来部署远程访问后门、加密货币剪币器和凭证窃取器。

该行动最初利用推广区块链游戏、加密货币机器人和作弊程序的存储库，然后扩展到扫描自动化、安全测试和日志分析。恶意.csproj 文件包含在编译前执行的 PreBuildEvent 例程，而.suo 文件则包含 PowerShell 命令。Python 和 Go 的变种程序会将恶意语句隐藏在大量的空白字符之后，使得简单的源代码检查效果不佳。解释 Visual Studio 安装和存储库克隆的说明进一步降低了执行门槛。执行过程通过诸如 C:\\Users\\Public\\Pictures\\t.ps1 之类的脚本启动 PowerShell.Packed.270。该下载器从攻击者的基础设施或合法服务（包括 YouTube、Telegram、Google Docs、GitCode 和 Pastebin）中检索加密字符串。解密后会显示 Quixo.7z 的下载位置。

其内容被提取到 C:\\ProgramData\\Windows.Microsoft.Photos 目录，生成 Microsoft.exe，这是一个被检测为 Trojan.Loader.3261 的 Electron 应用程序。该加载器随后下载 Nexara.7z，其中包含加密模块和配置文件。

加载器的 Mode3 部署结合了 PPID 欺骗 、智能应用程序控制篡改、ntdll.dll 取消挂钩和 Halo 的 Gate 系统调用执行。

它将 explorer.exe 指定为父进程，并修改 VerifiedAndReputablePolicyState 以削弱应用程序控制。此外， AMSI 和 ETW 补丁 还针对 AmsiScanBuffer 和 EtwEventWrite 进行修改，从而抑制脚本检查和遥测。

解密后的 boot_f、kernel_f 和 thread_f 有效载荷会被注入到 RegAsm.exe、dwwin.exe 或 dwm.exe 中。如果部署失败，Mode2 会提取加密的 thumbcache DLL，并根据配置数据重建 PowerShell.Inject.245。该脚本会解密有效载荷并将其注入到 RegAsm.exe 中。Mode3non 和 Handler 提供了备选的执行路径。最终，两个 AsyncRAT 实例通过不同的端口建立远程访问，从而可能允许不同的操作员同时控制同一台主机。Trojan.InjectNET.14 还会将 Trojan.Clipper.688 注入 regasm.exe，以替换加密货币钱包地址并通过 Telegram 传输屏幕截图。

该攻击还会攻击FileZilla XML文件、MobaXterm.ini以及Total Commander的wcx_ftp.ini文件。收集到的信息会被压缩，并通过攻击者控制的Telegram机器人进行泄露。加载程序通过计划任务和注册表运行条目建立持久性，同时尝试提升权限并禁用 Defender、UAC、系统还原和 VSS。它还会尝试卸载 ESET、McAfee 和 Malwarebytes，并通过修改 hosts 文件重定向反病毒软件的域名。已公布的指标包括 muckanthropic\[.\]com、muckduck.duckdns\[.\]org、muckcoding\[.\]com 和 muckdeveloper\[.\]com。
