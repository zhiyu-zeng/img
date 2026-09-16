---
title: 【微信】浏览器的"信任"被伪造：KREMLIN 攻破 Chrome 完整性校验，1500+ 巴西网银主机沦陷
source: https://mp.weixin.qq.com/s/tBCeWn20eyNRRvHgN5ipHA
source_host: mp.weixin.qq.com
clip_date: 2026-09-16T16:11:46+08:00
trace_id: 6407cad5-3375-4ff7-9570-62f9f48c6685
content_hash: 9ec81ada27b479a87e9bc67df7409fbe5a3ad6df1ab6882456cd5867050bb232
status: synced
tags:
  - 微信
  - 恶意样本
  - 浏览器扩展安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: |-
  KREMLIN/REF9334 伪造 Chromium 完整性校验，让 Chrome/Edge 静默加载恶意扩展，借以太坊死信箱下发 C2，已感染 1,515 台主机、98.75% 在巴西。
  - **核心绕过：** 安装器等待浏览器关闭或空闲，窃取旧版 OSCrypt 密钥、App-Bound 密钥与 resources.pak 中的 HMAC 种子，改写 Secure Preferences 的 protection.macs、super_mac 及 *_encrypted_hash，使恶意扩展被浏览器认定为用户批准。
  - **感染链：** 伪装成银行回执的 .js 经 Node.js 下载 C++ 安装器；计划任务 MicrosoftNodeRuntimeUpdater 持久化，并从以太坊合约 0xCD7360… 读取 main-v2、sub-module、sentinel 地址。
  - **扩展与 C2：** 恶意扩展伪装 AVSync，ID 为 ndpbidppejfanjbhfgjlohfanbfbklff；通过 WebSocket /google_ws/ 与伪装 CSS 的 /google_api/*.css 双通道通信，支持截屏、窃 Cookie、键盘记录、注入与重定向。
  - **反制与规模：** 安全厂商注册金丝雀域名 www.creamp1eonlyfans[.]net，使感染端误判沙箱并自毁；截至报告 1,515 台主机报到，98.75% 位于巴西，感染仍在加速。
  - **对抗与演化：** 安装器使用间接系统调用 PigSyscall、SentinelMemoryScanner.exe 侧加载、反沙箱/反调试黑名单；行动至少自 2025-05 活跃，7 个战役，2026-05 后转向智能合约配置。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3dd75244-d011-8186-975c-dced6e593f87
ioc:
  cves: []
  cwes: []
  hashes:
    - 106eac79396a3ff77b8f375c391260ce422be2ae4d55d3aa75b2635cbdc0fa42
    - 170dffb37e05f525f735bc9ad84b3908a488f7ce43fcb07739a10e4331e15a2c
    - 223be3f8648bf6998c4a58b972522e5fda8d9d0a57b4e163811930de66c3f7ca
    - 42a3e2bb135fb46b11b127f45a266b3a4d9dff4aa1cf75433f93fe69ba51a9b9
    - 5c32a09873be70a92fd8bb5a9fed7967de06bde6
    - 5ece7fd3766b0b7f8aadefa562313cea6c3c94f9398658dd389910e5be44f552
    - 64def0a6099c4de9c413b108eaae85a3c7457615
    - 902edbfecff38f285bf26283fb9ceb3700061873
    - ba80216c960977fa45e317f00dcf31e96acab29904a737cbc0bf86e929c3be5f
    - c8c38634dd44d7c6162c66174a6ee23ee404265125166e8d757681bdd66a4268
    - cb15cbf3f01a92e609e4c2bc26155e667e96c5d04770e83abba66ee07bcecea0
    - cd7360a83e5cdbbbbbceb0e78748baba6740d07b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> KREMLIN/REF9334 伪造 Chromium 完整性校验，让 Chrome/Edge 静默加载恶意扩展，借以太坊死信箱下发 C2，已感染 1,515 台主机、98.75% 在巴西。
> - **核心绕过：** 安装器等待浏览器关闭或空闲，窃取旧版 OSCrypt 密钥、App-Bound 密钥与 resources.pak 中的 HMAC 种子，改写 Secure Preferences 的 protection.macs、super_mac 及 *_encrypted_hash，使恶意扩展被浏览器认定为用户批准。
> - **感染链：** 伪装成银行回执的 .js 经 Node.js 下载 C++ 安装器；计划任务 MicrosoftNodeRuntimeUpdater 持久化，并从以太坊合约 0xCD7360… 读取 main-v2、sub-module、sentinel 地址。
> - **扩展与 C2：** 恶意扩展伪装 AVSync，ID 为 ndpbidppejfanjbhfgjlohfanbfbklff；通过 WebSocket /google_ws/ 与伪装 CSS 的 /google_api/*.css 双通道通信，支持截屏、窃 Cookie、键盘记录、注入与重定向。
> - **反制与规模：** 安全厂商注册金丝雀域名 www.creamp1eonlyfans[.]net，使感染端误判沙箱并自毁；截至报告 1,515 台主机报到，98.75% 位于巴西，感染仍在加速。
> - **对抗与演化：** 安装器使用间接系统调用 PigSyscall、SentinelMemoryScanner.exe 侧加载、反沙箱/反调试黑名单；行动至少自 2025-05 活跃，7 个战役，2026-05 后转向智能合约配置。

**奇安信威胁情报中心** *2026年9月16日 15:58*

威胁研判 · 恶意软件分析

浏览器的"信任"被伪造

KREMLIN 攻破 Chrome 完整性校验，1500+ 巴西网银主机沦陷

不上架应用商店、无需用户授权——攻击者伪造 Chromium 自身的完整性校验值，让浏览器“自愿”加载恶意扩展；C2 配置写入以太坊智能合约充当“死信箱”，1,515 台受感染主机已被观测，98.75% 位于巴西。

· REF9334 / KREMLIN　· 巴西网银用户　· 2026 年 9 月

## 行动概览与核心能力

01 导读：一场持续 15 个月的“隐形扩展”行动

2026 年 9 月，Elastic Security Labs 披露了针对巴西银行用户的恶意软件行动 **REF9334** 的完整分析。该行动至少自 2025 年 5 月开始活跃，横跨七个攻击波次，核心武器是一套被作者自命名为 **KREMLIN** （署名 Kr3mlin4rt1st）的工具集——名字虽有“克里姆林宫”之意，但整条行动与俄罗斯没有任何关系：钓鱼诱饵仿冒十二家巴西银行，错误提示与代码注释均为葡萄牙语，链上交易时间集中在圣保罗工作时段。

这套工具集最值得警惕的能力是： **它能在 Chrome 和 Edge 中安装一个“用户从未批准过”的恶意扩展**。浏览器启动后会像加载正常扩展一样加载它，因为攻击者伪造了 Chromium 自己的完整性校验值（HMAC 与 App-Bound 加密哈希），让浏览器认为这次安装完全合法。

更值得注意的是其基础设施设计：C2 地址与载荷托管位置被写入 **以太坊智能合约**，充当“死信箱”（Dead Drop Resolver），可动态更新、难以被拔除。而在分析师注册了其网络金丝雀（Network Canary）域名后，已观测到 **1,515 台受感染主机** 前来“报到”，其中 **98.75% 位于巴西**——且感染数量仍在加速增长。

02 感染链：从一封“银行回执”到浏览器沦陷

2.1 第一阶段：JavaScript 加载器

## JS 加载器与反沙箱

感染起点是一个伪装成银行回单、发票或企业文档的.js 文件，由用户手动执行。载荷是一个轻度混淆的多阶段加载器（函数名替换为 itemXX 之类的通用标识符、字符串通过索引查表获取），混淆程度并不高，研究人员借助大语言模型即可完成还原。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9e6ef41fef8ade6c.png)

图1 | 第一阶段 JavaScript 加载器的 VirusTotal 检测情况：伪装为 Safra 银行回执文件，检出率极低（图源：Elastic Security Labs）

第一阶段执行以下动作：

-   **弹出虚假报错**：生成一个 popup\_{date}\_{random}.js 文件调用 shell.Popup 提示“文档打开失败”，随后自删除，让受害者以为只是文件损坏；
-   **沙箱检测**：统计桌面文件数量，并通过 WMI 查询统计运行进程数——桌面文件少于 5 个或进程少于 50 个即判定为沙箱并退出；
-   **下载 Node.js 运行时**，用于执行下一阶段的 JavaScript；
-   **向 C2 回传**，通过 /api/log_loader?hash= 接口携带战役 ID 上报（样本中使用 hxxps://connection\[.\]upgradeonline\[.\]site）。

2.2 第二阶段：持久化 + 以太坊“死信箱”

第二阶段完成四件事：

## 持久化与以太坊死信箱

1.  **建立持久化**：从内嵌 CAB 包中解压出一个计划任务，注册名为 MicrosoftNodeRuntimeUpdater，描述文本伪装成 Node.js V8 运行时更新程序，在用户登录一分钟后以 conhost.exe --headless node.exe 方式启动恶意脚本；
2.  **查询以太坊智能合约** 0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b，读取三个参数：

-   main-v2：主模块（恶意扩展安装器）下载地址；
-   sub-module：一个 JPEG 载体，内含.NET 进程注入套件（RunPE），本次分析中未被实际使用；
-   sentinel：一个 JPEG 载体，内含 CAB 包，装的是 **合法的 SentinelOne 程序** SentinelMemoryScanner.exe，用于 DLL 侧加载；

4.  **从合约返回的地址下载载荷**——托管位置混合了攻击者自有域名与对 Archive.org 公共服务的滥用（JPEG 隐写载体，Base64 编码、以文件首尾标记定界；主载荷则是倒置后再 Base64 编码：base64.b64decode(payload\[::-1\])）；
5.  **执行第三阶段**：CAB 中的 items.json 指定安装目录并充当更新机制，随后启动 SentinelMemoryScanner.exe。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a5a8a42c6caf214e.png)

图2 | 从 CAB 包中提取的计划任务 XML 模板：注册名 MicrosoftNodeRuntimeUpdater，描述文本伪装成 Node.js V8 运行时（图源：Elastic Security Labs）

把 C2 配置写进智能合约的好处显而易见： **域名被封可以随时在链上改写**，执法机构和安全厂商无法“查封”一条公链。

2.3 第三阶段：C++ 安装器

主载荷是一个 2.10 MB 的 x64 C++ 程序，处于活跃开发状态，未做混淆，因静态链接了大量开源库而体积臃肿。它只加密了部分字符串（解密算法为逐字节异或 (0x34 + i) & 0xFF），还残留调试信息——整体工程水平与其基础设施的成熟度并不相称，呈现明显的“仓促开发”特征。

几个值得关注的对抗设计：

-   **间接系统调用（Indirect Syscall）**：启动时构建“API 名哈希 → 系统服务号（SSN）”映射。它不逐个解析 Nt\*/Zw\* 桩函数，而是利用 ntdll.dll 中 syscall 桩按 SSN 顺序排列的特性，对照异常目录（.pdata）中按地址排序的 RUNTIME_FUNCTION 条目，通过数算目标调用之前的 Zw\* 导出数量推导 SSN，然后借助 ntdll 中现成的 syscall; ret 序列发起调用（找不到则回退到内置的硬编码桩）。研究人员通过 GetSyscallNumber 函数中的特征字符串将其关联到开源库 **PigSyscall**；
-   **DLL 侧加载与加载器锁绕过**：滥用合法签名程序 SentinelMemoryScanner.exe 侧加载伪装成 SentinelAgentCore.dll 的恶意载荷（该手法最早由 Symantec 在 Seedworm 相关行动中披露）。当宿主进程为 SentinelMemoryScanner.exe 时，恶意代码会定位 ntdll 内部的 LdrpLoaderLock 临界区与 LdrpWorkInProgress 全局变量，释放加载器锁，使工作线程在 DllMain 返回前就能运行，避免死锁（完整实现可参考开源项目 LdrLockLiberator）；
-   **反沙箱/反虚拟机**：检查宿主进程名、运行进程黑名单（涵盖 Joe Sandbox、ProcMon、Wireshark、x64dbg、IDA、dnSpy、Frida 等数十种分析工具）、用户名黑名单（CurrentUser、Sandbox、maltest、JohnDoe 等）、CPU 数量（>2）与内存（>3 GB）等硬件条件。多数检测命中后会故意调用非法地址 0x1337 触发访问违例、让程序崩溃以中断分析；
-   **网络金丝雀检查**：尝试访问一个 **本不该存在的未注册域名** hxxp://www\[.\]creamp1eonlyfans\[.\]net——正常互联网环境下该域名无法解析，若能取回内容，说明身处模拟联网的沙箱，恶意软件随即主动崩溃。这个设计后来被研究人员反向利用，成为整场行动的“杀伤开关”（详见第六节）；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64094190e7d50531.png)

图3 | 网络金丝雀检查代码（图源：Elastic Security Labs）

-   **战役追踪标记**：通过全部检查后，加载一个“客户 ID”（Customer ID，如 98d8049e-804f-11f1-b79f-ae3a8bb85d01）和一个葡萄牙语互斥体名（如 ClarinhoQueSim-XEDA2O）。“客户”概念暗示 **运营者与开发者可能不是同一批人**，这套工具或存在对外分发。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b58371cc96d30361.png)

图4 | 安装器中硬编码的客户 ID 与互斥体名（ClarinhoQueSim-XEDA2O）日志输出（图源：Elastic Security Labs）

## 伪造扩展安装手法

03 核心手法：如何让浏览器“自愿”加载恶意扩展

这是整份报告技术含量最高的部分。KREMLIN 采用了一种有公开研究背书、但在野恶意软件中罕见的安装路径： **不依赖 Chrome 应用商店，也不依赖命令行参数，而是直接把扩展文件拷入浏览器配置文件目录，并在 Secure Preferences 中“手工注册”**。

3.1 背景：Chromium 的完整性防线

Chromium 系浏览器通过 Secure Preferences 文件记录已安装扩展。为防止外部进程篡改，关键配置项受 HMAC 完整性校验保护：HMAC 的种子（seed）硬编码在浏览器安装目录下的 resources.pak 中；而在较新版本（Chromium ≥ 144）上，Chrome 还引入了与 App-Bound Encryption（ABE，Chrome 127 起引入的凭据保护机制）配套的新式 \*\_encrypted_hash 校验值，需要 OSCrypt 密钥才能生成。

也就是说，想“偷渡”一个扩展，攻击者必须同时拿到三样东西： **旧版 OSCrypt 密钥、新版 App-Bound OSCrypt 密钥、以及 resources.pak 中的种子**。KREMLIN 一样不落地全做到了。

3.2 安装流程拆解

1 **等待时机**—— 轮询 GetLastInputInfo，等浏览器关闭或用户至少 2 分钟无操作；若浏览器仍在运行，则直接 TerminateProcess 强杀——既避免配置文件并发写冲突，也让“闪退”看起来像一次普通的浏览器崩溃

2 **窃取旧版密钥**—— 从 %LOCALAPPDATA%\\Google\\Chrome\\User Data\\Local State 读取 Base64 编码的 os_crypt.encrypted_key，剥离 5 字节 DPAPI 前缀后调用 CryptUnprotectData 解密

3 **窃取 App-Bound 密钥（调试器法）**—— 以 --no-startup-window 在调试器下拉起一个新的浏览器进程，监听调试事件直到捕获 LOAD_DLL_DEBUG_EVENT 且加载模块为 chrome.dll 或 msedge.dll；随后扫描其.rdata 段定位特征字符串 OSCrypt.AppBoundProvider.Decrypt.ResultCode，再在.text 段中搜索引用该字符串的 RIP 相对 LEA 指令，配合字节模式匹配定位密钥缓冲区指针，最后用 ReadProcessMemory 从浏览器进程内存中读出密钥。整个过程不注入代码、不修改目标进程内存，只扮演“外部调试器”

4 **提取 HMAC 种子**—— 从 %PROGRAMFILES%\\Google\\Chrome\\Application\\<版本号>\\resources.pak 中提取种子值

5 **落地扩展并伪造校验**—— 将扩展 ZIP 解压进每个可读取的浏览器 Profile 目录，然后改写 Secure Preferences——开启开发者模式（extensions.ui.developer_mode 与 account_values.extensions.ui.developer_mode），在 extensions.settings.<extension_id> 下注册扩展，并在 protection.macs 中为上述每一项重新计算旧版 HMAC 与新式 OSCrypt 加密 SHA-256 哈希（\*\_encrypted_hash），最后更新聚合校验值 super_mac 与 super_encrypted_hash

至此，浏览器下次启动时会认为这个扩展是 **“用户亲手安装并批准的”**，没有任何提示。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aa26f3eaa3becc0b.png)

图5 | 激活恶意扩展所需的 Secure Preferences 修改示例：开启开发者模式、注册扩展，并重算 protection.macs 中的 HMAC 与加密哈希（图源：Elastic Security Labs）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fdb5d54827bf97d.png)

图6 | 恶意扩展安装与 Chromium 完整性校验伪造全流程（图源：笔者依据原文技术分析绘制）

3.3 顺手牵羊：浏览器数据打包外泄

安装完成后，安装器还会把每个 Profile 下的 Login Data、Login Data For Account、Web Data、Network/Cookies 及 Extensions/\*\* 打包成 ZIP，并附上一个 keys.json（内含 v10/v20 两个 OSCrypt 密钥，用于事后解密数据库中的加密字段）。ZIP 通过未公开文档的 SystemFunction032 API 以 RC4 加密（密钥为明文 ZIP 的 SHA-256 摘要），连同客户 ID 一起 POST 至 hxxps://volmira\[.\]site//api/savecreds 和 hxxps://zaviro\[.\]online//api/v1/fingerprint。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7729fc4dd88a462e.png)

图7 | 浏览器数据窃取与加密回传流程（图源：笔者依据原文技术分析绘制）

04 恶意扩展本体：架在浏览器里的间谍平台

分析的扩展样本（SHA-256：223be3f8…c3f7ca）伪装成名为 **AVSync** 的合法软件，申请 tabs、cookies、storage、webRequest 等权限，由后台 Service Worker 与两个注入到所有页面的 content script 组成。代码未混淆、变量命名规范，配置中一个拼写错误的字段名 ENDPOINT_DINAMIC 可作为狩猎同类样本的枢轴特征。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/927155a3e2f35bf9.png)

图8 | 恶意扩展以 AVSync System Inc 之名出现在浏览器扩展列表中，ID 为 ndpbidppejfanjbhfgjlohfanbfbklff（图源：Elastic Security Labs）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/092c84b21624371d.png)

图9 | 扩展配置文件：注意拼写错误的 ENDPOINT_DINAMIC 字段与内嵌的客户 ID（图源：Elastic Security Labs）

4.1 C2 寻址

扩展先通过 ENDPOINT_DINAMIC 指定的 URL 或智能合约解析真实 C2。样本中请求 hxxps://graph.checkeligibitily.workers\[.\]dev/x01aab878f25420380b3?op=<客户ID>，返回 \[\["luizestrelhashapr.online:443",""\]\]——op 参数正是安装器中嵌入的同一个客户 ID，把两个组件钉在同一套工具链上。

4.2 双通道 C2 协议

-   **WebSocket 通道**：通过 /google_ws/ 路由建立连接（携带受害者 ID、扩展版本、标签），每秒轮询一次指令。支持截屏（GSH01）、枚举标签页（GAT01）、窃取 cookies 与 sessionStorage/localStorage（GCO01）、抓取 15 天内最多 1000 条历史记录（GHI01，因 manifest 未申请 history 权限大概率失败）、提取页面完整 HTML（GSO01）、下载攻击者控制的 HTML 并注入页面（INC01）、热更新拦截与键盘记录规则（UPD01）；
-   **HTTP 伪装通道**：周期性轮询 /google_api/ 路径，每个请求都伪装成 CSS 文件获取——如 /google_api/81d47cb6.css 拉取目标域名/键盘记录/重定向/HTTP 拦截规则，a98cb43d.css 拉取基于元素选择器的自动跳转规则，6c0c92f6.css 回传按“域名 MD5 哈希 + URL 子串 + HTTP 方法”规则命中的请求体或请求头。所有通道数据均用 lz-string 压缩并 Base64 编码。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f86dac340aa88fe.png)

图10 | 恶意扩展经 WebSocket 与 C2 的通信记录（图源：Elastic Security Labs）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9cc90cc35cc0368a.png)

图11 | 恶意扩展双通道 C2 通信架构（图源：笔者依据原文技术分析绘制）

4.3 键盘记录与页面劫持

当配置中某目标域名（以 MD5 哈希标识）的 b 标志置 1 时，扩展会为页面上所有 <input> 与 <textarea> 注册 input 事件监听，用户每敲击一次键盘（包括密码框），内容即被回传；同时用 MutationObserver 监视 DOM，动态新增的输入框也会被实时挂接。重定向规则则可劫持指定按钮的点击事件，把用户导向攻击者指定的 URL——对网银场景而言，这意味着转账确认页可以被悄无声息地掉包。

05 七场战役：15 个月的演化时间线

通过关联样本、域名与客户 ID，研究人员还原了 REF9334 的七次战役，其 TTP 演进清晰可见：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a32ce75297307530.png)

图12 | REF9334/KREMLIN 七次战役演进时间线（图源：笔者依据原文技术分析绘制）

|     |     |     |     |     |
| --- | --- | --- | --- | --- |
| 战役  | 时间  | 执行链 | 投递载荷 | 关键基础设施 |
| Codecaudiog A | 2025-06 | PowerShell → RunPE → 安装器 | 扩展 + DonutLoader → PULSAR 1.6.6/1.7.3 | codecaudiog\[.\]site、codecvideowin\[.\]online、185.221.23\[.\]133 |
| Codecaudiog B | 2025-06 | JavaScript → 安装器 | 扩展和/或 PULSAR | codecaudiog\[.\]site、version.checkeligibitily.workers\[.\]dev |
| Acrobat | 2025-08 | JavaScript → PowerShell → RunPE → DonutLoader | 仅 PULSAR 1.7.1/1.7.2（无扩展） | acrobat-updater\[.\]com、144.172.112\[.\]239、45.90.13\[.\]210 |
| Framesync | 2025-09 | 未复原 | 仅扩展（伪装 FrameSync Driver/Plugin） | lojinhadoluiz\[.\]online、orange-sun-195a.checkeligibitily.workers\[.\]dev |
| Donalurdesconfeitos → Cremeb | 2025-12 至 2026-03 | JavaScript → PowerShell → RunPE → 安装器 | 仅扩展 | donalurdesconfeitos\[.\]site、marialurdes\[.\]site、harialurdes\[.\]site、cremeb\[.\]com |
| Cremeb | 2026-04 | LNK → PowerShell → JavaScript(WSH) → JavaScript(Node.js) → RunPE → DLL 安装器 | QR 主题扩展 + PULSAR 2.4.5 | cremeb\[.\]com、37.16.74\[.\]100、37.16.74\[.\]34 |
| 以太坊转型 | 2026-05 至今 | JavaScript → Node.js → RunPE → 安装器（及 SentinelOne 侧加载变体） | 扩展 + REMCOS RAT | granderevolucao\[.\]store、volmira\[.\]site、zaviro\[.\]online、178.92.162\[.\]38 |

几个关键节点：

-   **2025 年 6 月**：最早的基础设施已出现，Archive.org 上的载荷均由同一账号 **Radduxx** 上传（最早文件 output_image_202505.jpg，上传于 2025-05-21，伪装成巴塞罗那足球队照片，元数据中留有邮箱 facebook-br@protonmail\[.\]com）；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b365469003de80bb.png)

图13 | Archive.org 上由 Radduxx 账号上传的恶意 JPEG 载体，伪装成巴塞罗那足球队图片（图源：Elastic Security Labs）

-   **2025 年 8 月 Acrobat 战役**：RunPE 首次集成持久化（计划任务 AcrobatBrowserExtension，登录时及每 30 分钟触发）；
-   **2025 年 12 月**：首次出现 KREMLIN 署名——一个 JScript.Encode 格式的加载器注释头中写明作者 Kr3mlin4rt1st、版本 1.33、日期 2026-02-08。该变体从 JPEG 载体中以标记 kremlin-moscow-russia 定位内嵌数据，并用 RC4 密钥 kr3ml1n 解密。GitHub/GitLab 及社交媒体上均无该工具集的公开痕迹，若存在分发，走的应是私下或地下渠道；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e46ca99f6024a732.png)

图14 | JSE 加载器头部的 ASCII 注释：首次出现 KREMLIN 名称、作者 Kr3mlin4rt1st 与版本号 1.33（2026-02-08）（图源：Elastic Security Labs）

-   **2026 年 4 月**：首次出现下载 Node.js 运行时执行后续阶段的行为（沿用至今）；RunPE 弃用自身进程手工映射，改用 **Early Cascade Injection** 注入 explorer.exe。同期出现 QR 码主题的扩展变体：针对 web.whatsapp.com 与 www.sicoob.com.br 页面弹出覆盖层，展示从 C2 拉取的二维码诱导用户“重新扫码认证”——代码有明显的大语言模型生成痕迹且注释为葡萄牙语；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/030e7d689be2a192.png)

图15 | QR 码主题恶意扩展在页面上弹出覆盖层，以葡萄牙语提示用户扫码“重新认证”（图源：Elastic Security Labs）

-   **2026 年 5 月起**：配置解析全面迁移至以太坊智能合约；同时投递的 RAT 从 PULSAR 换成能力更全面的 REMCOS，或是行动资源升级的信号。新分支改用合法 SentinelOne 程序侧加载主 DLL——此时 RunPE 反而不再必要，因为恶意代码已经运行在受信任的签名进程内。

此外还发现一条疑似由 **其他运营者使用改版工具** 运营的平行支线（基础设施 seguranca.versionnova\[.\]site，2026 年 6-7 月间三个波次），其 C2 回传使用自定义头 X-Log-Token: MichelleMignon171，API 路径命名为葡语 testar_nova_versao（“测试新版本”）——Token 疑似指向巴西 DJ Michelle Mignon。

06 链上追踪与“金丝雀”反制

6.1 以太坊钱包画像

所有智能合约的部署与配置更新均出自同一个钱包地址 0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6。该钱包在部署首个合约前已有资金往来：2025 年 6 月 19 日至 2026 年 8 月 24 日间共发生 **82 笔 USDT 转账**，累计流入 20,778.97 USDT、流出 19,016.96 USDT。虽然没有任何单笔转账能直接坐实为“开发经费”，但资金流向本身就是高价值线索。

合约本身的演化也留下了完整痕迹：2026 年 5 月 16 日，开发者部署了名为 UserName 的测试合约练手（调用记录中留有 Medina、Filosofo、Danone1555IBIZA 等测试值）；5 月 19 日首个恶意合约上线，存储安装器与扩展的下载地址；此后历经三代迭代，从独立变量演进为带 setConfig/getConfig 方法的键值映射，并陆续加入 sub-module（RunPE 载体）、sentinel（侧加载程序）、main-v2（侧加载版安装器）等参数。分析期间（2026 年 8 月 13 日）main-v2 还被更新为 zaviro\[.\]online，说明基础设施仍在被积极维护。

值得一提的是，链上记录中还出现了 connection. 前缀的子域名（如 connection.timesmaluku\[.\]com、connection.upgradeonline\[.\]site）——其父域名托管着被攻击者入侵的合法网站，攻击者借助独立子域名将恶意基础设施“寄生”在正常站点之下，互不影响。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/10b65efd6bae1639.png)

图16 | 被入侵后仍正常提供服务的合法新闻网站，其子域名被用作恶意基础设施（图源：Elastic Security Labs）

6.2 时区与归属

域名地理分布价值有限（大量域名经 Cloudflare 代理），但以太坊交易时间戳提供了旁证：换算至 UTC-3 时区后，仅有约十笔交易落在深夜时段，且并不延伸至凌晨——符合“熬夜工作但不早起”的作息分布，与圣保罗时间吻合。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3968c0de8a24bbde.png)

图17 | 按本地时间统计的以太坊交易活动分布：深夜时段交易稀少，与圣保罗（UTC-3）作息吻合（图源：Elastic Security Labs）

叠加诱饵仿冒 Banco do Brasil、Caixa、Bradesco、Sicoob、C6 Bank、Inter、BTG、Safra、PagBank、PicPay、Santander、Mercado Pago **十二家** 巴西银行与支付品牌、错误提示与代码注释均为葡萄牙语等证据，研究人员判断： **运营者很可能是位于巴西的葡语使用者，受害者也几乎全在巴西**。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4a021a6afa8bc181.png)

图18 | QR 扩展代码中由大语言模型生成的葡萄牙语注释，成为归属分析旁证（图源：Elastic Security Labs）

## 金丝雀反制与感染规模

6.3 注册“金丝雀”，反杀 1,500+ 感染

还记得加载器里那个“访问未注册域名以检测沙箱”的设计吗？Elastic Threat Command 的研究人员干脆 **把这个域名 www.creamp1eonlyfans\[.\]net 注册了下来**，指向自己的服务器。

**效果立竿见影**：感染主机按计划前来“检测沙箱”，域名既然能解析且返回内容，恶意软件便判定自己身处沙箱而 **主动崩溃**——感染链条止步于初始阶段，后续载荷永不到达。截至报告发布，已有 **1,515 台受感染系统** 向金丝雀域名报到， **98.75% 来自巴西**，且数量仍在快速攀升，显示该战役正处于爆发初期。这些主机的最终恶意组件虽已驻留，但其自我防护机制已被反制，为防御方争取了排查与清除的窗口期。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d99cb788777ac9c5.png)

图19 | 向金丝雀域名“报到”的受感染主机地理分布：98.75% 位于巴西（图源：Elastic Security Labs）

07 小结与防御建议

KREMLIN/REF9334 展示了一条值得警惕的趋势： **浏览器扩展正在成为银行木马的核心战场**。它不在商店上架、无需用户授权、能伪造浏览器自身的完整性校验，配合调试器法窃取 App-Bound 密钥后，加密 Cookie 与会话令牌尽数落袋——绕过的正是 Chrome 近两年为遏制窃密木马而筑起的最重要防线。对终端用户而言，“浏览器里多了个没见过的扩展”这个最原始的检查项，依然是有效的第一道自检。

## 防御建议与检测点

**防御建议**：

1.  **入口管控**：阻止或严格审计邮件及 IM 渠道投递的.js/.jse/.lnk 附件；对普通用户禁用 Windows Script Host 与脚本关联可显著压缩攻击面；
2.  **扩展审计**：定期盘点浏览器已安装扩展，核查 Secure Preferences 中是否存在来源不明的 extensions.settings 条目或被异常开启的 developer_mode；对照本文附录中的扩展 ID 排查；
3.  **行为检测**：重点关注——浏览器进程被以调试器方式拉起（父进程异常）、对 chrome.dll/msedge.dll 的 ReadProcessMemory 跨进程读取、Local State 与 resources.pak 的非常规访问、伪装成浏览器正常流量的 /google_api/\*.css 轮询、以及向以太坊 RPC 节点发起的非常规合约读取；
4.  **持久化排查**：检查名为 MicrosoftNodeRuntimeUpdater、AcrobatBrowserExtension 等仿冒计划任务，以及以 conhost.exe --headless node.exe 形式启动的可疑进程链；
5.  **网络侧阻断**：阻断附录中的域名与 IP；监测对 SentinelMemoryScanner.exe 加载非官方 DLL 的侧加载行为；
6.  **凭据兜底**：对网银等高危站点强制启用硬件密钥/Passkey 等抗钓鱼 MFA——Cookie 被盗后，会话令牌型 MFA 无法阻止重放，抗钓鱼认证机制是当前最有效的纵深手段。

08 附录

附录 A：MITRE ATT&CK 技术映射

|     |     |     |     |
| --- | --- | --- | --- |
| 战术  | 技术 ID | 技术名称 | 本文对应行为 |
| 资源开发 | T1608.001 | Stage Capabilities: Upload Malware | 向 Archive.org 上传 JPEG 隐写载荷（Radduxx 账号） |
| 执行  | T1204.002 | User Execution: Malicious File | 诱导用户手动执行伪装成银行单据的 JS 文件 |
| 执行  | T1059.007 | Command and Scripting Interpreter: JavaScript | 多阶段 JS 加载器、Node.js 运行时执行 |
| 执行  | T1059.001 | Command and Scripting Interpreter: PowerShell | 多个战役中的 PowerShell 中间阶段 |
| 执行  | T1047 | Windows Management Instrumentation | WMI 查询进程数进行沙箱检测 |
| 持久化 | T1053.005 | Scheduled Task/Job: Scheduled Task | MicrosoftNodeRuntimeUpdater<br><br>计划任务 |
| 执行  | T1106 | Native API | 直接调用 Windows API（含 SystemFunction032） |
| 持久化/权限提升 | T1176 | Software Extensions: Browser Extensions | 伪造完整性校验安装恶意浏览器扩展 |
| 防御规避 | T1055 | Process Injection | RunPE 手工映射、Early Cascade Injection 注入 explorer.exe |
| 防御规避 | T1620 | Reflective Code Loading | RunPE 以.NET 反射加载载荷 |
| 防御规避 | T1027.009 | Obfuscated Files or Information: Embedded Payloads | CAB 内嵌计划任务、JPEG 隐写载体 |
| 防御规避 | T1027.013 | Obfuscated Files or Information: Encrypted/Encoded File | 倒置 Base64、RC4 加密载荷与外传数据 |
| 防御规避 | T1027.007 | Obfuscated Files or Information: Dynamic API Resolution | API 名哈希 → SSN 动态解析（PigSyscall） |
| 防御规避 | T1140 | Deobfuscate/Decode Files or Information | certutil 解码提取后续阶段 |
| 防御规避 | T1497.001 | Virtualization/Sandbox Evasion: System Checks | 进程/用户名/硬件/网络金丝雀多重环境检测 |
| 防御规避 | T1574.001 | Hijack Execution Flow: DLL | 借 SentinelMemoryScanner.exe 侧加载恶意 DLL |
| 防御规避 | T1036.004 | Masquerading: Masquerade Task or Service | 计划任务伪装为 Node.js 运行时更新 |
| 防御规避 | T1036.005 | Masquerading: Match Legitimate Resource Name or Location | 恶意 DLL 伪装为 SentinelAgentCore.dll |
| 防御规避 | T1036.008 | Masquerading: Masquerade File Type | JPEG 载体伪装图片内嵌载荷 |
| 防御规避 | T1070.004 | Indicator Removal: File Deletion | 弹窗脚本自删除 |
| 发现  | T1057 | Process Discovery | 枚举进程匹配分析工具黑名单 |
| 发现  | T1083 | File and Directory Discovery | 统计桌面文件数、检查 VMware/VBox 驱动文件 |
| 发现  | T1033 | System Owner/User Discovery | GetUserNameW 比对用户名黑名单 |
| 发现  | T1082 | System Information Discovery | CPU、内存、磁盘硬件信息检查 |
| 发现  | T1518.001 | Software Discovery: Security Software Discovery | 检测安全分析工具与安全软件 |
| 发现  | T1217 | Browser Information Discovery | 枚举浏览器 Profile 与已装扩展 |
| 凭据访问 | T1555.003 | Credentials from Password Stores: Credentials from Web Browsers |     |
| 凭据访问/收集 | T1056.001 | Input Capture: Keylogging | 扩展对目标站点输入框实施键盘记录 |
| 凭据访问 | T1539 |     | 窃取 Cookies 数据库 |
| 收集  | T1185 | Browser Session Hijacking | 扩展窃取会话令牌实施会话劫持 |
| 收集  | T1005 | Data from Local System | 打包浏览器本地数据 |
| 收集  | T1119 | Automated Collection | 扩展按规则自动采集页面与请求数据 |
| 收集  | T1113 | Screen Capture | GSH01 指令截取标签页屏幕 |
| 收集  | T1560.002 | Archive Collected Data: Archive via Library | ZIP 打包 + RC4 加密后外传 |
| 命令控制 | T1105 | Ingress Tool Transfer | 从多源下载后续阶段载荷 |
| 命令控制 | T1071.001 | Application Layer Protocol: Web Protocols | HTTPS/WebSocket C2 通信 |
| 命令控制 | T1102.001 | Web Service: Dead Drop Resolver | 以太坊智能合约存储 C2 配置 |
| 命令控制 | T1573.001 | Encrypted Channel: Symmetric Cryptography | RC4 加密外传数据（SystemFunction032） |
| 命令控制 | T1132.001 | Data Encoding: Standard Encoding | Base64/lz-string 编码通信数据 |
| 命令控制 | T1001.002 | Data Obfuscation: Protocol or Service Impersonation | C2 请求伪装为 CSS 文件获取 |
| 数据外泄 | T1041 | Exfiltration Over C2 Channel | 经 C2 端点回传窃密数据 |

附录 B：失陷指标（IoC）

域名与 IP 均已做去武器化处理。金丝雀域名 www.creamp1eonlyfans\[.\]net 已被 Elastic 注册接管， **若在内网观测到对该域名的访问，说明存在处于早期阶段的 KREMLIN 感染**。

**样本哈希（SHA-256）**

|     |     |
| --- | --- |
| 哈希  | 说明  |
| 106eac79396a3ff77b8f375c391260ce422be2ae4d55d3aa75b2635cbdc0fa42 | JavaScript 第一阶段加载器 |
| 5ece7fd3766b0b7f8aadefa562313cea6c3c94f9398658dd389910e5be44f552 | 第一阶段变体（popup 命名模式） |
| c8c38634dd44d7c6162c66174a6ee23ee404265125166e8d757681bdd66a4268 | C++ 恶意扩展安装器 |
| 223be3f8648bf6998c4a58b972522e5fda8d9d0a57b4e163811930de66c3f7ca | 恶意扩展（AVSync 伪装） |
| ba80216c960977fa45e317f00dcf31e96acab29904a737cbc0bf86e929c3be5f | 平行支线 Wave A 加载器 |
| cb15cbf3f01a92e609e4c2bc26155e667e96c5d04770e83abba66ee07bcecea0 | 平行支线 Wave B 加载器 |
| 170dffb37e05f525f735bc9ad84b3908a488f7ce43fcb07739a10e4331e15a2c | 平行支线 Wave C 加载器 |
| 42a3e2bb135fb46b11b127f45a266b3a4d9dff4aa1cf75433f93fe69ba51a9b9 | PowerShell 重实现版安装器 |

**域名：**

codecaudiog\[.\]site

codecvideowin\[.\]online

acrobat-updater\[.\]com

lojinhadoluiz\[.\]online

lojinhadaana\[.\]org

donalurdesconfeitos\[.\]site

marialurdes\[.\]site

harialurdes\[.\]site

cremeb\[.\]com

granderevolucao\[.\]store

californicationdetroit\[.\]com

volmira\[.\]site

zaviro\[.\]online

luizestrelhashapr\[.\]online

connection\[.\]upgradeonline\[.\]site

connection\[.\]timesmaluku\[.\]com

seguranca\[.\]versionnova\[.\]site

affordableonline\[.\]online

cheapzone\[.\]space

mysterylink\[.\]xyz

quirkyclub\[.\]club

version\[.\]checkeligibitily\[.\]workers\[.\]dev

orange-sun-195a\[.\]checkeligibitily\[.\]workers\[.\]dev

graph\[.\]checkeligibitily\[.\]workers\[.\]dev

find-postman\[.\]ddesdokww\[.\]workers\[.\]dev

www\[.\]creamp1eonlyfans\[.\]net（金丝雀，已被安全厂商接管）

**IP（C2）：**

185.221.23\[.\]133（PULSAR，端口 4782/443）

144.172.112\[.\]239:4782（PULSAR）

45.90.13\[.\]210:443（PULSAR）

37.16.74\[.\]100:443（PULSAR 2.4.5）

37.16.74\[.\]34:443（PULSAR 2.4.5）

178.92.162\[.\]38:443（REMCOS）

**主机侧指标**

-   **计划任务名**：MicrosoftNodeRuntimeUpdater、AcrobatBrowserExtension
-   **互斥体**：ClarinhoQueSim-XEDA2O
-   **恶意扩展 ID**：ndpbidppejfanjbhfgjlohfanbfbklff（AVSync）、djodclnjknbpambeaaapadmdfhmbpeog（FrameSync）、cdgcjghdeinagopbaobhmaefigoafaaa（QR 变体）
-   **客户 ID**：991589b0-4cc9-11f0-b9f4-1402ec3d56f0、f1d7b074-b81f-11ef-a763-1402ec3d56f0、618ec809-f08e-4068-a54c-654478811510、48502c50-a504-4811-aab8-ba978aeae237、98d8049e-804f-11f1-b79f-ae3a8bb85d01
-   **文件名模式**：popup\_{date}\_{random}.js；诱饵命名 <葡语主题><机构名>\_DD-MM-YYYY.<10位数字>.js
-   **HTTP 自定义头**：X-Log-Token: MichelleMignon171

**链上指标**

-   **运营者钱包**：0x5C32A09873be70a92fd8bB5A9fED7967dE06BdE6
-   **智能合约**：0x902EDbFECFF38f285Bf26283fB9cEB3700061873、0x64Def0A6099c4DE9C413B108EAae85A3C7457615、0xCD7360A83E5cdbBbbbcEB0e78748babA6740d07b（当前活跃）

**其他**

-   **Archive.org 上传账号**：Radduxx；关联邮箱 facebook-br@protonmail\[.\]com
-   **JPEG 载体内嵌标记**：kremlin-moscow-russia（RC4 密钥 kr3ml1n）
-   **扩展配置拼写特征**：ENDPOINT_DINAMIC

09 参考链接

**1\. Elastic Security Labs：The extension you never installed: KREMLIN forges Chrome's own integrity checks to steal banking sessions**  
https://www.elastic.co/security-labs/threat-command/malicious-browser-extension-kremlin-banking-malware

**2\. The Hacker News：KREMLIN Banking Malware Hijacks Chrome and Edge to Steal Credentials and Session Tokens**  
https://thehackernews.com/2026/09/kremlin-banking-malware-hijacks-chrome.html

**3\. Synacktiv：The Phantom Extension: Backdooring Chrome through Uncharted Pathways**  
https://www.synacktiv.com/en/publications/the-phantom-extension-backdooring-chrome-through-uncharted-pathways

**4\. Rubrik Zero Labs：Inside GhostChrome-X: A Chrome Extension Integrity Bypass**  
https://zerolabs.rubrik.com/blog/inside-ghostchrome-x-chrome-extension-integrity-bypass

**5\. Red Canary：Stealers evolve to bypass Google Chrome's new app-bound encryption**  
https://redcanary.com/blog/threat-intelligence/google-chrome-app-bound-encryption/

**6\. Elastic Security Labs：Katz and Mouse Game: MaaS Infostealers Adapt to Patched Chrome Defenses**  
https://www.elastic.co/security-labs/threat-command/katz-and-mouse-game

**7\. Picazo-Sanchez 等（学术论文）：HMAC and "Secure Preferences": Revisiting Chromium-based Browsers Security**  
https://www.cse.chalmers.se/~andrei/cans20.pdf

安全事件分析研判 · 目录
