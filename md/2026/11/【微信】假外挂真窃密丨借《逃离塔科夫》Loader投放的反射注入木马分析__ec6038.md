---
title: 【微信】假外挂真窃密丨借《逃离塔科夫》Loader投放的反射注入木马分析
source: https://mp.weixin.qq.com/s/ImNvwVyuMjo670C5yW1ItQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-25T09:58:39+08:00
trace_id: 1d29f9d4-11fb-4769-95ab-808642416846
content_hash: 87ded6c0a2d170239d528b9a727a8fc8dd4e9865d6705944de6cd4a01b00fd79
status: synced
tags:
  - 微信
  - 恶意样本
  - 游戏安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 伪装成《逃离塔科夫》外挂的GitLab项目实为窃密木马，经Pastebin配置下载载荷、反射注入浏览器，窃取账号钱包及AI工具密钥并外传C2。
ai_summary_style: key-points
images_status:
  total: 26
  succeeded: 26
  failed_urls: []
notion_page_id: 42375244-d011-81ee-bdee-fe241337c8f6
ioc:
  cves: []
  cwes: []
  hashes:
    - 01550a72fe23614f6dc8c67a6a13d93e6b355c5ceaafb7d1d5ce7d988e25a518
    - 057cd337d7c3f70e1c6dd516e7d475986ecf90e97a4d1b2635cd68146bc5104c
    - 1b6d0998d616187435f7c57d8db13b1fe50081204fd874fd468946ac2da64ada
    - 22a5808bd68302b01837c6a4c689a1b5512c56994ab7da307eae74296af4bb41
    - 68a627b15b4ce817b5169cac324db124502475f2ace04d118870a3eda25476fb
    - 6c2446f06869a50df82165dbbc78527186cc70e8ebb50c48634de0ab9057c00a
    - 87cede9685da954e44918a54d78b9fb1ca0c459e6553b6a3b49a23c9e971fe92
    - bec394f9b5883911989219bf7e2b5077f79e89a35ed4c6f056ea9dc5d99eeeda
    - c8eb508cd44b50777395912048947e0d6712b8d2767e3640e7ddfe5fa52a8636
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 伪装成《逃离塔科夫》外挂的GitLab项目实为窃密木马，经Pastebin配置下载载荷、反射注入浏览器，窃取账号钱包及AI工具密钥并外传C2。
> 
> - **诱饵与投放：** GitLab上的“逃塔外挂”仓库仅有`eft_hack.zip`和README，没有外挂源码；诱饵仓库创建于2026年11月15日，载荷托管仓库`skywatch`则早在同年10月19日就已建好。
> - **加载链：** Loader先弹更新提示，再从Pastebin获取配置，并下载PE文件；第二阶段程序会解密并校验PE，创建线程执行，同时解析ntdll导出、建立syscall表，并Patch `EtwEventWrite`。
> - **反射注入：** 程序会修改Edge注册表以关闭Startup Boost，终止浏览器进程后创建挂起进程并注入DLL；该DLL以导出函数`KdMXFBaWQ`作为反射式加载入口，将自身映射到新内存区域后执行。
> - **窃密范围：** Chromium分支提取密码、Cookie、银行卡、自动填充、CVC、Token和历史记录，Gecko分支经NSS解密；此外还采集钱包、浏览器扩展、Notion/OneNote、VPN、FTP、Telegram/Signal/Discord、Steam/Roblox，以及Claude Code、Codex CLI、Cursor等AI工具配置。
> - **C2与处置：** C2地址从Telegram频道描述获取，失败则用硬编码地址，当前为`super-fourteen33.cc`，另有`seall-vernous.com`；建议不要运行任何外挂，并轮换钱包、密码管理器主密码和2FA恢复码。

**火绒安全** *2026年11月23日 17:00*

![767bf7cc-6045-4797-8e96-504d9e8179c3.gif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73d615a734bec297.gif)

**01**

**概述**

近期，火绒安全实验室监测到GitLab平台上出现伪装成《逃离塔科夫》游戏外挂的恶意样本。该项目宣称具备自瞄、透视、雷达等功能，实际为窃密木马，运行后会窃取浏览器敏感信息、加密货币钱包、即时通讯数据等，并通过Telegram频道描述获取C2地址上传数据。除此以外，该木马还会采集Claude Code、Codex CLI、等AI开发工具的本地配置，以及OneNote等笔记软件数据以及相关VPN工具的连接信息——在 AI工具深度接入工作流的当下，这些配置中保存的API密钥一旦泄露，波及的不只是个人隐私，还会有企业账户与算力资产。

火绒工程师在溯源中发现，该项目创建于2026年11月15日，仓库仅包含eft_hack.zip与README，无真实外挂源码。从时间线看，本次追踪到的载荷托管仓库（skywatch）创建于2026年10月19日，比该诱饵仓库早了将近一个月——也就是说，早在诱饵抛出之前，载荷分发通道就已经就绪。这更像是一场有准备的行动，而非临时起意。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c546aef8b1ad5e7.png)

**仓库**

README中直接宣称：“我们制作的《逃离塔科夫》外挂，配备了目前市面上最好的塔科夫自动瞄准、透视/穿墙功能。我们的外挂功能非常强大，我们力求始终保持领先优势。在这里，我们成就胜利。”并给出了使用说明。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/844e8af28a2ae1a6.png)

**README**

火绒安全实验室将持续关注此类窃密木马的传播动态，并及时更新拦截规则，保障用户系统安全。目前，火绒安全产品已实现对该行为的拦截与查杀。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7b38877696072b63.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bdd1ebccae896c9d.png)

**查杀图**

**02**

**流程图**

**流程图**

**03**

**样本分析**

## Loader加载流程

Loader程序启动后首先显示更新提示，通过PowerShell弹出Checking for updates提示信息，随后向Pastebin发起HTTP GET请求，获取远程配置。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/590643ad62db49e9.png)

**弹出Checking for updates、获取远程配置**

解析配置后，生成随机字符串，构造随机目录名。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1220a383dafd8d3a.png)

**读取响应，生成随机字符串**

遍历配置，下载文件。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/69be8499c791b8aa.png)

**每行作为一个待处理项目**

通过exec_Command()和Cmd_Start()启动下载的程序，将执行流程交给下一阶段。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ddba9b052c9ac5b9.png)

**启动下载的程序**

本次分析中发现的下载地址：

> https://gitlab.com/charlyhills/skywatch/-/raw/main/74L814BW31FX.exe

该项目创建于2026年10月19日，同样无正常代码，仓库内连续提交多个随机命名PE文件：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/81cf24af6dbec7de.png)

**skywatch项目主页**

## 载荷解密执行

第二阶段程序启动后，首先初始化所需模块和API函数地址。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/39f65e105e3b7335.png)

**API初始化与导出函数检查**

解析PE节表，定位NT Headers，获取节数量以及Section Table地址。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2e388cce73f63ad.png)

**PE节表扫描与特征匹配**

初始化解密数据缓冲区，分配工作缓冲区，并将内置数据复制到新分配的内存中。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f5c4d0a356b10c5b.png)

**解密数据及密码状态初始化**

根据CPU特征选择数据处理路径，一条路径使用SIMD优化实现，另一条路径使用普通实现。两条路径最终生成后续解密流程所需的数据状态。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b8ddeb900d425871.png)

**两条数据处理分支**

验证解密后的PE文件，检查DOS Header的MZ签名、e_lfanew范围，以及NT Headers的PE签名。验证失败则进入清理及终止流程。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dadd1b7ba1f689e4.png)

**PE文件格式验证**

解析CreateThread/WaitForSingleObject地址，创建线程执行。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/083277f0d8b2802d.png)

**创建线程执行**

解密字符串，解析ntdll导出，建立syscall描述表。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7a2ccfd5600570b4.png)

**解析ntdll导出**

Patch EtwEventWrite。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5badc6e49c0849ac.png)

**patch API**

## 浏览器注入

根据内置浏览器路径表查找本机安装的浏览器，对于Microsoft Edge，程序会修改注册表位置，关闭Edge Startup Boost，中止目标浏览器现有进程，创建挂起浏览器进程并注入DLL。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/284257d964de8825.png)

**创建挂起进程注入**

被注入的DLL通过导出函数KdMXFBaWQ作为反射式加载入口，将DLL自身映射到新的内存区域，映射完成后，调用DLL入口点，获取当前进程命令行， 检查是否包含--incognito参数。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a0aa09d98f7c55e.png)

**映射后调用**

根据宿主浏览器类型选择不同的数据采集路径。按宿主类型拼出浏览器的User Data目录，再拼出Local State的完整路径，Chromium家族进入浏览器数据采集流程。Firefox / Zen 进入Gecko对应分支。--incognito参数决定是否执行全量采集。

## 窃密数据范围

Chromium分支提取密码、Cookie、银行卡、自动填充、CVC、Token和历史记录。

|     |     |     |     |     |
| :---: | :---: | :---: | :---: | :---: |
| **数据** | **库文件** | **表** | **读取字段** | **上报元素** |
| **账号密码** | Login Data | logins | origin_url、username_value、password_value | 769 |
| **Cookie** | Network\\Cookies | cookies | host_key、name、path、is_secure、expires_utc、encrypted_value | 770 |
| **银行卡** | Web Data | credit_cards | guid、name_on_card、expiration_month、expiration_year、card_number_encrypted | 771 |
| **自动填充** | Web Data | autofill | name、value | 772 |
| **CVC/支付令牌** | Web Data | local_stored_cvc、token_service | guid、value_encrypted/service、encrypted_token | 773 |
| **历史记录** | History | urls | url、title | 774 |

Gecko分支通过NSS解密Firefox/Zen保存的登录凭据。

|     |     |
| :---: | :---: |
| **数据** | **文件** |
| 保存的登录账号与密码 | logins.json |
| Cookie | cookies.sqlite |
| 浏览历史 | places.sqlite |
| 主密码与密钥材料 | key4.db |

其他模块：采集钱包、浏览器扩展、Discord、Steam、Roblox、Telegram、Signal等数据。

|     |     |     |
| :---: | :---: | :---: |
| **模块** | **目标** | **路径 / 注册表** |
| **桌面钱包** | Bitcoin Core、Monero、Litecoin、Dash、NEM | wallet.dat、monero-core\\wallet_path |
| **扩展钱包** | Phantom、Solflare、Keplr、Ronin | Local Extension Settings、Sync Extension Settings、moz-extension+++ |
| **笔记** | Notion、OneNote、Evernote、Obsidian | \\Notion、Microsoft\\OneNote、conduit-storage、obsidian\\IndexedDB |
| **VPN** | NordVPN、OpenVPN、PIA、ProtonVPN | \\NordVPN、.ovpn、pia_manager、\\ProtonVPN |
| **FTP** | WinSCP、FileZilla、CoreFTP | 注册表 WinSCP 2\\Sessions；recentservers.xml、sitemanager.xml、Credentials.txt |
| **即时通信** | Telegram、Signal、Discord | tdata、Signal\\config.json+db.sqlite、Discord\\Local Storage\\leveldb |
| **游戏** | Steam、Roblox | ssfn\*、loginusers.vdf、RobloxCookies.dat |
| **开发工具** | Claude Code、Codex CLI、Copilot、Cursor、Continue、JetBrains | AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb、JetBrains\\\*\\options\\ai.assistant.xml、Claude Code / Codex CLI / Copilot / Continue / tabby 配置目录 |
| **文件采集** | 密钥/钱包类文件 | 文件名含 pem、seed、wallet、privatekey |
| **屏幕与主机** | 桌面、用户名、系统信息 | GDI 抓屏 + GetUserNameW |

## C2回传

从Telegram频道描述获取C2地址。失败时使用硬编码地址作为备用。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8fbaf423a16b0806.png)

**打包上传C2**

当前TG频道的值为super-fourteen33.cc。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5ec57f6797c4288a.png)

**TG描述**

**04**

**火绒安全建议**

✔✔ 不要下载、解压、运行任何免费/免检测外挂，尤其GitLab、GitHub话题页引流的压缩包；

✔✔ 开启火绒实时防护与主动防御；

✔✔ 对已运行过诱饵机的用户，加密货币钱包、密码管理器主密码、2FA恢复码全部轮换，并审查Obsidian/AI工具配置是否被外泄。

**05**

**样本IOC**

|     |     |
| :---: | :---: |
| **文件名** | **SHA256** |
| Loader.exe | 6C2446F06869A50DF82165DBBC78527186CC70E8EBB50C48634DE0AB9057C00A |
| 74L814BW31FX.exe | 057CD337D7C3F70E1C6DD516E7D475986ECF90E97A4D1B2635CD68146BC5104C |
| 74L814BW31FX_inner.exe | C8EB508CD44B50777395912048947E0D6712B8D2767E3640E7DDFE5FA52A8636 |
| 74L81_spy.dll | 1B6D0998D616187435F7C57D8DB13B1FE50081204FD874FD468946AC2DA64ADA |
| OV3752WCW41D.exe | BEC394F9B5883911989219BF7E2B5077F79E89A35ED4C6F056EA9DC5D99EEEDA |
| OV3752_spy.dll | 22A5808BD68302B01837C6A4C689A1B5512C56994AB7DA307EAE74296AF4BB41 |
| TNG90Z66QII7.exe | 87CEDE9685DA954E44918A54D78B9FB1CA0C459E6553B6A3B49A23C9E971FE92 |
| TNG90_inner.exe | 68A627B15B4CE817B5169CAC324DB124502475F2ACE04D118870A3EDA25476FB |
| TNG90_spy.dll | 01550A72FE23614F6DC8C67A6A13D93E6B355C5CEAAFB7D1D5CE7D988E25A518 |

**C2**

seall-vernous.com

super-fourteen33.cc

**仓库地址**

https://gitlab.com/strikecastle/escape-from-tarkov-cheat-undetected-with-aimbot-esp-wallhack-radar-hack-and-more/

https://gitlab.com/charlyhills/skywatch/

**关于火绒**

火绒安全成立于2011年，是一家专注、纯粹的安全公司，致力于在终端安全领域为用户提供专业的产品和专注的服务，并持续对外赋能反病毒引擎等相关自主研发技术。多年来，火绒安全产品凭借“专业、干净、轻巧”的特点收获了广大用户的良好口碑。火绒企业版产品更是针对企业内外网脆弱的环节，拓展了企业对于终端管理的范围和方式，提升了产品的兼容性、易用性，最终实现更直观的将威胁可视化、让管理轻便化，充分达到保护企业信息安全的目的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6c1c127cda839b7e.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8b9b932e3b3d8a79.gif)

![横版二维码.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a0ce47ceb354d2f9.png) ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ed3d6e888701b66.gif)

**点点赞**

**点分享**

**点喜欢**
