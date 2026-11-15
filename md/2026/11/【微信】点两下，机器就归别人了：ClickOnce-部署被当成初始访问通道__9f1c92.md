---
title: 【微信】点两下，机器就归别人了：ClickOnce 部署被当成初始访问通道
source: https://mp.weixin.qq.com/s/aRqzf_PndzKk_O7V9LMPEg
source_host: mp.weixin.qq.com
clip_date: 2026-11-15T08:52:21+08:00
trace_id: 2c3f6fd7-d699-4459-ac98-0dd3d28fdbba
content_hash: 6d1c1ca13bacfe97de81de443f1f62a7c04cbd9f55cdb08b7f34b62fa46e9c47
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41975244-d011-812d-9917-e3c59f8eb951
ioc: null
---

**Ots安全** *2026年11月11日 15:37*

2026 年 10 月 10 日 16 点 14 分，一台 Windows 10 上跳出两个弹窗。

头一个问，要不要打开这个文件。点「打开」。

系统接着说，发布者无法验证。点确认。

没有命令行，没有宏，没有那个需要点「启用内容」的文档。八分钟后，一台名叫 THEPUNISHER 的机器在 C2 面板上亮了，会话挂在 `powershell_ise.exe (x64)` 进程里，用户 fcastle。

这是 Akchhat 在自家域环境里做的一次复现，不是真实受害事件。整条链子里没有一处依赖漏洞。Windows 按设计把一套企业软件分发流程从头走到尾，走完的结果是一个远控信标。

值得停下来的地方不在「两次点击」。在于这套流程，本来就是给装正经软件用的。

## 两个弹窗不是被绕过的，是被点掉的

「两次点击拿到 beacon」这个说法太好记，好记到很容易被读成另一件事：攻击者绕过了 Windows 的安全警告。

原文不是这么写的。

浏览器提示出现，作者写的是「we as the victim click open」；Windows 提示 `publisher cannot be verified` 出现，写的是「after accepting both prompts」。两个提示都在，都在屏幕上，都是使用者亲手点掉的。文章里那句「No PowerShell command to run, no macro to enable」，说的是不需要额外的命令与宏，不是说弹窗消失了。

原文把这两个瞬间都截了下来。前一张是浏览器的文件打开确认，问是否打开 `DirectHandler.application` ，旁边还留着一行「Report file as unsafe」；后一张是 Windows 的安装安全警告，标题是 Application Run - Security Warning，正文写着 `Publisher cannot be verified` ，发布者显示 Unknown Publisher，按钮是 Run 与 Don't Run。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d0362f3bfffac5a9.png)

*图：原文截图，浏览器侧的文件打开提示，背景目录里就是那七个部署文件。来源 Akchhat 原文，仅作事实核对引用，版权归原作者。*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a474cd9be610dccf.png)

*图：原文截图，Windows 侧的安装安全警告，Name 为 DirectHandler、Publisher 为 Unknown Publisher。来源同上。*

两张图里没有一处被跳过的校验，只有两个被点掉的确认。

这个区别不是文字游戏，它决定了防守方该往哪儿使劲。被压到极低的不是防护强度，是人的判断成本。两个长得像系统日常提示的对话框，一次普通到不会留下记忆的操作，就够了。

也别把「两次点击」当成某个新技巧。ClickOnce 这项技术本身就叫「点一下」，微软当年给它起名时，主打的卖点就是交互少。

## 系统替你把软件装好了

ClickOnce 是微软给.NET 应用做的部署技术。开发者把程序发布成一组文件，放在网站或文件共享上，用户点一个 `.application` 入口，Windows 自己去把依赖拉下来、校验、装好、跑起来，之后还能自动更新。

三个特性叠在一起，恰好是初始访问想要的形状。

安装不需要管理员权限。企业里绝大多数终端是标准用户账号，这一条把门槛削平了。

执行挂在 `dfsvc.exe` 名下。这是 Windows 自己的部署服务，进程树看起来是系统组件在干活，不是下载目录里冒出一个陌生 exe。

自带更新通道。谁控制部署服务器，谁就能在用户每次从开始菜单点开时，换掉里面的东西。

CrowdStrike 在 2026 年 6 月 18 日的两篇研究里，把内部流程拆得很细： `dfsvc.exe` 先从部署清单读出地址，把文件下载到 `%Temp%\Deployment` 下的临时目录，解析清单并核对发布者身份；身份过不了，就弹那个询问授权的向导；确认后文件迁到 `%Local%\Apps\2.0` 的固定目录，在开始菜单落一份 `.appref-ms` 引用，再往 `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall` 写一条卸载项，然后由 `Activate()` 把程序拉起来。

一整套动作，全是设计内的合法行为。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/08b8469425ec89eb.png)

*图：ClickOnce 部署链与八分钟静置窗口的时序示意。本文绘制，非原文章配图，不作为证据引用。*

## 八分钟里，文件已经躺在磁盘上

Akchhat 的复现里，C2 用的是 Adaptix Framework，不是 Cobalt Strike。原文提到 Cobalt Strike 只是拿来类比「企业级 C2」，还顺手加了一句「I might be wrong on this」。这个括号不该在转述里丢掉。

生成物被打包成七个文件： `DirectHandler.application` 是入口， `DirectHandler.manifest` 是清单，剩下五个 `.deploy` 是依赖。实验室用 Python 起了一个静态目录托管，HTTP 日志把顺序记得清清楚楚，16 点 15 分 37 秒取 `.application` ，16 点 16 分 29 秒取 `.manifest` ，随后半分钟内逐个取完 `.deploy` 。

原文的交付包清单照录在这里，防守方可以按图索骥：

```javascript
DirectHandler.application
DirectHandler.dll.deploy
DirectHandler.manifest
Newtonsoft.Json.dll.deploy
config.json.deploy
powershell_ise.exe.config.deploy
powershell_ise.exe.deploy
```

*代码块：原文 `DirectHandler.zip` 的文件清单，照录。其中 `powershell_ise.exe.config.deploy` 就是改写程序集加载的那份配置。*

日志里那几行是这样的，前面一大段 TLS 握手失败的噪声已经略去：

```swift
192.168.233.129 - - [10/Oct/2026 16:15:37] "GET /DirectHandler.application HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:29] "GET /DirectHandler.application HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:29] "GET /DirectHandler.manifest HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:55] "GET /Newtonsoft.Json.dll.deploy HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:55] "GET /config.json.deploy HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:56] "GET /powershell_ise.exe.config.deploy HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:56] "GET /powershell_ise.exe.deploy HTTP/1.1" 200 -
192.168.233.129 - - [10/Oct/2026 16:16:57] "GET /DirectHandler.dll.deploy HTTP/1.1" 200 -
```

*代码块：原文 HTTP 服务日志节选，仅保留部署文件的 GET 行。入口、清单、五个依赖的顺序，就是防守章里那条检测规则的形状。*

看起来就是一次普通的软件更新。

真正让防守方难受的是那八分钟。工具把 shellcode 的执行刻意压后，理由是等部署流程跑完、进程稳定下来，作者也把它称作内建的规避行为。于是有了这样一段窗口：文件已经落盘，进程已经存在，恶意动作还没发生。任何按「告警即处置」设计的响应流程，在这段时间里都看不到值得处置的东西。

八分钟之后的那张截图也留在原文里。Adaptix 的 Sessions table 上出现一条 beacon：Computer 是 THEPUNISHER，User 是 fcastle，Process 是 `powershell_ise.exe (x64)` ，Created 显示 10/10 16:24。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/65b16592b9a2c1fa.png)

*图：原文截图，Adaptix Framework v1.2 的会话列表，红色标注为原文作者所加。来源 Akchhat 原文，仅作事实核对引用，版权归原作者。*

把两份原始材料叠起来看，时间能对上：日志里末次部署文件下载是 16 点 16 分 57 秒，会话创建是 16 点 24 分，中间约七分钟。工具标称的八分钟延迟与这个差值起点不同，但都落在同一段静置窗口里。窗口不是叙述里的修辞。

另外两个参数也值得记下。载荷被人为膨胀到 300 MB，赌的是部分 EDR 对超大文件跳过扫描；执行点选的是 `powershell_ise.exe` ，一个带微软签名、会加载.NET 的程序，靠改写 `.exe.config` 影响程序集加载，把代码带进去，也就是 AppDomainManager injection（ATT&CK T1574.014）。

杀软看到的，是一个签名正常的系统程序在装一套看起来正常的软件。

## 杀软没响，但这句话得说完整

原文里 Windows Defender 是开着的，默认配置、没有自定义检测规则，这次没报。

作者自己紧接着把话收了回去：「AV bypass is always environment and configuration dependent」。实验室里的一台机器、一个默认策略、一次尝试，撑不起「免杀」两个字。换一套 EDR、换一条行为规则、换一次版本更新，结果都可能是另一回事。这句 caveat 在中文转述时容易被删，恰恰是它决定了这条信息该被当成观察记录还是结论。

同一个道理适用于文章末尾那个构想。作者设想用 HTML smuggling 把 `.application` 在浏览器端拼出来，绕开邮件附件扫描与网络层文件检查，听着很完整，但他写得明白：「I have not built this out yet」。没有代码，没有测试，没有结果。那一段属于「接下来想试试」，不属于「已经走通」。

顺带钉一条：原文没有出现 `.appref-ms` ，没有 MOTW 或 SmartScreen 的讨论，没有 DFPR，没有注册表键，没有检测章节，也没有防御章节。它不是一份防御指南，甚至不是一份漏洞报告。把它读成「微软又出事了」或者「EDR 集体失效」，都是往里塞了原文没有的东西。

## 这里没有一个漏洞，也不会有补丁

这条链子里没有 CVE，没有 MSRC 公告，没有补丁号，没有 KEV 收录。

因为被用的是功能，不是缺陷。MITRE ATT&CK 把它归在 T1127.002「受信任开发者工具代理执行：ClickOnce」，给出的缓解项是限制 Web 内容、禁用或移除功能、代码签名，而不是装补丁。一份 2026 年 6 月的应急响应资料说得更直白：这属于对合法功能的架构性滥用，不会有厂商补丁，也不会进 CISA KEV，防守负担整个落在配置加固与行为检测上。

而它并不只是实验室里的玩具。

Trellix 公开的 OneClik 是一次面向能源、油气行业场景的红队演练：钓鱼邮件指向 Azure 上的假硬件分析页，投递伪装成工具的 `.APPLICATION` ，加载器 OneClikNet 借 AppDomainManager injection 改写 `ZSATray.exe` 、 `umt.exe` 、 `ied.exe` 这些合法.NET 程序的配置，终局落下 Go 写的 RunnerBeacon，C2 藏在 CloudFront、API Gateway 与 Lambda 后面。三个变体一路加上反调试、沙箱检测和配置自删。Trellix 说 2023 年 9 月在中东一家油气企业见过代码相似度极高的样本，但对归因保持低置信，明确拒绝把活动钉到某个具体组织。

中文转述常把这段写成「APT 实锤攻击」。原文措辞是模拟与仿真，归因是低置信。两处都要还原。

CrowdStrike 在 2026 年 6 月的第二部分里还披露了一种此前未见的做法：在 `HKCU\SOFTWARE\Classes\CLSID\{20FD4E26-8E0F-4F73-A0E0-F27B8C57BE6F}` 下注册一个本不存在的 COM 对象，让下一次 ClickOnce 部署在回落到正规 `dfsvc.exe` 之前，先命中攻击者指定的代码。只写当前用户注册表 hive，不需要管理员权限，也不覆盖已有注册项，因此不容易把正常功能弄坏。同一时期的观察还记录了把 `.appref-ms` 放进启动目录或计划任务做持久化。

这些是真实存在过的手法。它们和 Akchhat 那台 lab 机器之间的距离，比标题暗示的要近得多。

## 一百一十四天：从公开研究到一键复现

把时间摆在一起看，会比单看某一次实验更有意思。

2023 年 9 月，中东油气企业的相似样本。2025 年 3 月前后，OneClik 红队演练，同年 6 月经 Trellix 公开。2026 年 6 月 18 日，CrowdStrike 拆完内部机制并披露新的 COM 劫持变体。2026 年 10 月 10 日，Akchhat 的 lab 日志。

从 CrowdStrike 那两篇到这份 lab 记录，间隔 114 天。四个月不到，一条需要读论文、读进程内部、手工处理 manifest 的链子，变成了一个带网页界面的打包工具：填个名字，选个注入目标，拖一下膨胀滑块，上传 shellcode，点提交。

那句概括不是推想。原文的界面截图里，ClickOnce Name 填的是 `DirectHandler` ，AppDomainManager Injection Options 列了 tzsync、Powershell ISE、ServiceHub.Host.netfx、PerfWatson2 四个系统程序，Inflate Size 滑到 300 MB，Action 选 Run Shellcode，下方是 shellcode 文件的上传位。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/489497d68787d5de.png)

*图：原文截图，ClickForClickOnce 的网页界面，仅用于说明工具形态与参数名，不构成操作指引。来源 Akchhat 原文，版权归原作者。*

连工具本身也被打包好了。原文的构建输出显示，整个网页工具被封进 Docker 镜像，装 `mono-devel` 与 `msbuild` 那一层用了 304 秒，整次构建 337.7 秒，起来三个容器：

```ruby
[+] Building 337.7s (29/29) FINISHED
 => [base 13/20] RUN apt-get install -y mono-devel mono-complete msbuild ...  304.3s
 => exporting to image                                                        19.3s
[+] Running 3/3
 ✔ Container caddy-main  Started
```

*代码块：原文 Docker 构建输出节选，中间层已省略。它说明的不是攻击手法，是这条链子的工程化门槛降到了启动一个容器组。*

公开信息未说明该文的确切发布日期，10 月 10 日只是 HTTP 日志与截图文件名里的实验日期，这个数字只能当区间参考。方向倒是清楚：手法公开之后，实现门槛在往下掉，掉的速度比防护策略更新的速度快。这与 a16z 那篇关于利用代码不再是瓶颈的研判指向同一处，两篇可以对照读。

这里只作观察记录，不作定论。一次公开研究与一次个人复现之间，隔着多少条没被记录的中间环节，公开信息同样未说明。

## 偏差清单：哪些能写，哪些只能挂着

| 事项  | 可以写实的 | 需要挂起来的 | 依据层级 |
| --- | --- | --- | --- |
| 两次点击 | 两个系统提示被使用者接受，全程交互只有两次 | 不是绕过警告，也不构成新的绕过技术 | 源文 raw markdown 原句与两张提示截图 |
| C2 归属 | Adaptix Framework，会话落在 `powershell_ise.exe (x64)` | Cobalt Strike 仅为类比，作者自注判断可能有误 | 源文与会话表截图 |
| 未检出 | 默认 Defender、无自定义规则、单机实验一次 | 不能推广成通用免杀，作者明确写了环境依赖 | 源文 caveat |
| HTML smuggling | 作者列为后续设想 | 未实现、未测试，不属于已验证链 | 源文「I have not built this out yet」 |
| 八分钟 | 工具标称 shellcode 执行延迟八分钟；日志末次下载 16:16:57、会话创建 16:24，相差约七分钟 | 两个数字计时起点不同，不能当成同一次精确测量；与 C2 的四秒心跳也不是一回事 | 源文日志与会话表截图 |
| 漏洞编号 | 无 CVE、无 MSRC、无补丁、无 KEV | 属架构性滥用，不会有补丁可等 | MITRE T1127.002、应急响应资料 |
| 在野关联 | CrowdStrike 2026-06 披露 COM 劫持；Trellix OneClik 用了同类注入 | OneClik 是红队演练、归因低置信，与本次 lab 无直接关联 | 厂商研究 + 媒体转述 |
| 时间  | 日志日期 10/Oct/2026 | 文章确切发布日、研究与复现之间的中间环节 | 公开信息未说明 |
| 检测与防御 | 官方与社区给出的检测面、加固项 | 源文未提供检测规则、防御清单、IoC 全集 | MITRE / 检测规则库 / 厂商研究 |

四源以上交叉下来，能坐实的是机制与边界，坐不实的是「在野规模」「通用免杀」「补丁进度」这三类。公开信息未说明的部分，就挂在表里，不拿推测去填。

## 防守方真正该盯的位置

-   入口：邮件网关与 Web 代理拦截.application、.appref-ms、ClickOnce setup.exe 多数网关不把这两个扩展名当可执行文件
    
-   进程：dfsvc.exe 拉起 powershell、cmd、wscript、mshta 或未签名 exe；rundll32.exe 命令行含 dfshim.dll,ShOpenVerbApplication1 合法部署很少直接派生脚本引擎
    
-   文件：启动目录、计划任务、下载与临时目录新增.appref-ms；%LocalAppData%\\Apps\\2.0\\ 与 %Temp%\\Deployment 的新增内容，以及签名程序旁多出的 \*.exe.config.deploy 对应持久化、落盘位置与配置改写
    
-   配置：签名程序旁多出.exe.config、AppDomainManager 相关设置、非常规程序集加载 对应 T1574.014 执行流劫持
    
-   日志：Microsoft-Windows-ClickOnce/Operational、Sysmon 事件 1 / 3 / 11、Zone.Identifier 备用数据流、Prefetch 中的 DFSVC.EXE-\*.pf 系统自带的部署日志常被漏采
    
-   网络：.application 到.manifest 再到多个.deploy 的顺序拉取；部署后由异常进程发起到云端的周期性连接 上文那段日志就是这条规则的形状
    
-   时间：部署完成到异常行为之间的静置窗口 对应本次八分钟延迟，告警不能只盯即时动作
    

再补四条加固：用 WDAC 或 AppLocker 限制非授信 ClickOnce 启动；按签名与部署来源做白名单基线；对业务确实需要的 ClickOnce 应用，登记 URL、发布者、开始菜单引用与更新节奏；把 ClickOnce 当软件安装而非文档下载来做用户提示。

还有一条认知要改：别把「标准用户账号」当成安全边界。免管理员的按用户安装、按用户 COM 注册、开始菜单引用，全都落在当前用户可写的范围里。CrowdStrike 那个 COM 劫持变体正是从这里进来的。

上面这些不依赖任何补丁，也不等任何厂商公告，今天就能排进工单。

## 把信任收回来

这套链子没有攻破哪一道防线。它找到了一道本来就开着的门，然后让使用者自己按了确认键。

安全的默认假设里，「系统组件在做系统该做的事」一直是最不容易被质疑的一条。ClickOnce 把这条假设变成了投递通道， `dfsvc.exe` 把进程树洗得干干净净，八分钟延迟又刚好卡在告警与处置之间。要补的不是某个签名，是把「谁在装、从哪装、装完之后谁在联网」重新连成一条可查的线。

把 `.application` 与 `.appref-ms` 加进拦截清单，把 `dfsvc.exe` 的子进程纳入行为基线，把 ClickOnce 运行日志接进采集。做完这三件，下一次那两个弹窗再出现时，至少有人会多看一眼。

参考

https://akchhat.gitbook.io/dev/initial-access/two-clicks-to-a-beacon-abusing-clickonce-deployments-for-initial-access

红队战术 · 目录
