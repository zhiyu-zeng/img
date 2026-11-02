---
title: 【微信】无感入侵 iPhone，接管钱包盗U，闲鱼疑似在售
source: https://mp.weixin.qq.com/s/qOzogbyFmVjvqRfEVWy9Hw
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T18:30:55+08:00
trace_id: ea49357a-f5f7-482d-81f4-e5006b1a309e
content_hash: a11282a4db4b8120332648bea8104e6b8c8ba397e4fe770784826b80a4e99727
status: synced
tags:
  - 微信
  - iOS逆向
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一套名为 DarkSword 的黑产 iOS 全链入侵系统正在流通，受害者点开一条 Safari 链接即被无感控制，钱包、钥匙串等数据被批量窃取，而其 C2 后台自身也存在可被三步接管的设计缺陷。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40c75244-d011-81e4-af2d-f81a75bf70b2
ioc:
  cves:
    - CVE-2023-41974
    - CVE-2025-14174
    - CVE-2025-24201
    - CVE-2025-31200
    - CVE-2025-31277
    - CVE-2025-43510
    - CVE-2025-43520
    - CVE-2025-43529
    - CVE-2026-20700
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 一套名为 DarkSword 的黑产 iOS 全链入侵系统正在流通，受害者点开一条 Safari 链接即被无感控制，钱包、钥匙串等数据被批量窃取，而其 C2 后台自身也存在可被三步接管的设计缺陷。
> 
> - **攻击链触发条件：** 受害者仅需用 Safari 访问投递链接，无授权弹窗、无系统通知即自动触发漏洞利用链；共覆盖 iOS 13 至 26 世代 100 个版本，iOS 13–17 走 Coruna 链（5 条链、23 个 exploit，10–15 秒受控），iOS 18 走 DarkSword（6 个 CVE，含 3 个 0day，1–3 分钟受控）。
> - **DarkSword 六步链条：** JSC JIT 内存破坏获得 WebContent 任意读写 → dyld 缺陷（CVE-2026-20700）绕过 PAC/TPRO 实现代码执行 → ANGLE 越界写逃出沙箱入 GPU 进程 → 驱动写时复制缺陷进入 mediaplaybackd → XNU VFS 竞态（CVE-2025-43520）完成内核提权；全程纯 JavaScript、用完即删（hit-and-run 模式），重启后痕迹基本消失。
> - **窃取能力：** 覆盖 MetaMask、OKX、imToken、Trust Wallet 等 19 个主流加密钱包，可下发 21 类命令，包括 dump_keychain（钥匙串账号密码）、dump_wifi、dump_sms、dump_icloud_token、远程拍照录音、exec_shell 及自毁。
> - **C2 后台自身可被三步接管（已实测验证）：** 未认证 GET /admin/.env 泄露生产 SECRET_KEY → 离线伪造 admin JWT（遍历 token 版本号 ver）→ 获得后台管理员全权限；三处设计单独看均为常规防御，但组合后整体失效，可进一步枚举全部受害者数据。
> - **流通与规模：** BreachForums 挂牌 DarkSword 7500 美元、Coruna 5000 美元；Censys 发现的运营平台上存有 11 条受害者 BIP-39 助记词、179 个设备战利品目录、75 个操作员账号；art-template npm 包遭供应链投毒向 iPhone 访客投递 iframe。iVerify 测算约 2.2 亿台设备仍运行受影响版本，一个月内受影响比例上升逾三倍。升级至 iOS 18.7.7 或 26.3+ 可中断该利用链。

**网络安全透视镜** *2026年11月2日 17:51*

一套黑产专用的 iOS 定向入侵与数据窃取系统，疑似在闲鱼上出售。

2026 年 3 月 18 日，Google 威胁情报组、Lookout、iVerify 三家机构联合公开披露了一套名为 **DarkSword** 的 iOS 全链利用工具包，披露材料中的攻击面与本文涉及的源码高度吻合。10 月，Censys 发布调查报告，指出一套以该工具包为基础的 exploitation-as-a-service 平台正在运营，其生产服务器上运行的文件组合与本文审计对象一致。

本文看点

01

六步链条拆解：利用了哪些漏洞

02

三步未认证接管 C2 后台

03

市场定价与传播路径

01

ARCHITECTURE

### 系统构成：三段式架构

整套系统由三个部分组成：

PART 01exploit_server.py（漏洞投递服务，默认 0.0.0.0:7070）

向目标 iPhone 投递 Safari 浏览器漏洞利用链，实现「点开一条链接即可入侵」。

PART 02admin/（C2 管理后台，FastAPI/uvicorn，默认 7000）

负责设备管理、命令下发、窃取数据回传查看、多代理分级运营与审计。

PART 03payloads/（载荷库）

按 iOS 版本分组的二进制利用载荷（.dylib/.bin），对应 Stage1→Stage2→Stage3 利用链。

分工明确：payloads 提供利用载荷，exploit_server 负责投递，admin 承担设备管理与数据回传。

exploit_server 直接继承自 Python 标准库的 SimpleHTTPRequestHandler，并在此基础上实现了对项目根目录的无鉴权文件读取。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/89bcca23329a282a.png)

— 后台仪表盘：漏洞设备、已控设备、待控设备统计，以及近 7 天请求趋势与窃取数据分类

02

KILL CHAIN

### 落地即受控

攻击链的触发条件

受害者需要做的动作只有一个：用 Safari 访问一条投递链接。

落地页形态为 /ch/?tpl=，slug 来自投放渠道与模板。页面加载后无需感知、无需授权，Safari 侧的漏洞利用链即自动触发。设备随后回连 C2 并注册为受控设备，此后由管理员远程下发命令、提取数据。

关键词在于「自动触发」。整个过程不存在点击授权、不弹出提示框、无系统通知，iOS 的安全模型在这条链路上未起到拦截作用。

版本覆盖范围

基于本套源码及其他多套同款源码的分析，其支持的 iOS 版本与入侵时效如下：

**访问 10–15 秒即可受控**：

iOS 13：13.0、13.1、13.1.1、13.1.2、13.1.3、13.2、13.2.2、13.2.3、13.3、13.3.1、13.4、13.4.1、13.5、13.5.1、13.6、13.6.1、13.7

iOS 14：14.0、14.0.1、14.1、14.2、14.2.1、14.3、14.4、14.4.1、14.4.2、14.5、14.5.1、14.6、14.7、14.7.1、14.8、14.8.1

iOS 15：15.0、15.0.1、15.0.2、15.1、15.1.1、15.2、15.2.1、15.3、15.3.1、15.4、15.4.1、15.5、15.6、15.6.1、15.7、15.7.1、15.7.2、15.7.3、15.7.4、15.7.5、15.7.6、15.7.7、15.7.8、15.8、15.8.1、15.8.2、15.8.3、15.8.4、15.8.5、15.8.6

iOS 16：16.0、16.0.1、16.0.2、16.0.3、16.1、16.1.1、16.1.2、16.2、16.3、16.3.1、16.4、16.4.1、16.5、16.5.1、16.6、16.6.1、16.7、16.7.1、16.7.2、16.7.3、16.7.4

iOS 17：17.0、17.0.1、17.0.2、17.0.3、17.1、17.1.1、17.1.2、17.2、17.2.1

**访问 1–3 分钟可受控**：

iOS 18：18.5、18.6、18.6.1、18.6.2、26.0.1、26.0.2、26.1.0

共 100 个系统版本，覆盖 iOS 13 至 iOS 26 世代，构成一张面向主流在用设备的网。

REFERENCE

该列表中的 26.0.2 与 26.1.0 在 Apple 官方发布历史中并不存在——Apple 的版本序列为 26.0 → 26.0.1 → 26.1，其间无 26.0.2，补丁号亦不写作 26.1.0。这表明黑产维护的 SUPPORTED_IOS_VERSIONS 为人工更新，未从 Apple 发布源自动同步。

支持窃取的加密货币钱包

共 19 个主流加密钱包在覆盖范围内：Bitget Wallet、Coin98、Coinbase Wallet、Exodus、Krystal、MetaMask、MyTonWallet、Phantom、Ronin、Solflare、Tonhub、Tonkeeper、TronLink、Uniswap、OKX、Bitpie、imToken、TokenPocket、Trust Wallet。

设备受控后，后台可自动化完成无感盗取虚拟货币。

100

个 iOS 版本在射程内

19

个主流加密钱包可被扫走

21

类远程命令可被下发

03

EXPLOIT

### 漏洞构成与利用原理

上述横跨 iOS 13 至 26 的版本覆盖，对应的并非一条利用链，而是两条独立利用链的组合。

两条链的分工

|     | \*\*Coruna\*\* | \*\*DarkSword\*\* |
| --- | --- | --- |
| 覆盖版本 | iOS 13.0 – 17.2.1 | iOS 18.4 – 18.7 |
| 漏洞规模 | 5 条完整链、23 个 exploit | 6 个 CVE，其中 3 个当时为 0day |
| 首次公开 | 2026-03-03（Google GTIG） | 2026-03-18/19（GTIG + Lookout + iVerify） |
| 内部代号 | debug 版本泄露的 exploit 名称 | implant 常量 DarkSword-WIFI-DUMP |

源码中 exploit_server.py 的注释写明「支持 iOS 13.0 ~ 17.2」，与 Coruna 的覆盖区间一致。「暗剑」一词则来自 DarkSword 载荷中的常量，该字符串在 mediaplaybackd 的统一日志中以 \[DarkSword-WIFI-DUMP\]、\[CHAIN\]、\[MAIN\] 形式出现。

前述两组不同的入侵耗时由此得到解释： **iOS 13 至 17 使用 Coruna 链**——5 条链、23 个 exploit 覆盖多个版本区间，预置利用 worker 数量多，命中即中，耗时 10–15 秒； **iOS 18 使用披露较晚的 DarkSword**——18.x 的 worker 仅适配 18.4、18.6、18.7 三档，且需先跨越 GPU 沙箱再触及内核，耗时 1–3 分钟。

DarkSword 的六步链条

| CVE | 组件  | 在链中的作用 | 修复版本 |
| --- | --- | --- | --- |
| CVE-2025-31277 | JavaScriptCore JIT（RegExp 类型混淆） | iOS 18.4–18.5 的 WebContent 远程代码执行 | iOS 18.6 |
| CVE-2025-43529 | JSC DFG JIT 释放后重用 | iOS 18.6–18.7.2 的 WebContent 远程代码执行 | iOS 18.7.3 / 26.2 |
| CVE-2026-20700 | dyld 动态链接器 | 绕过用户态 PAC 与 TPRO，将内存读写转化为代码执行 | iOS 26.3（后回补 18.7.7） |
| CVE-2025-14174 | ANGLE / WebGL 越界写 | WebContent 沙箱 → GPU 进程 | iOS 18.7.3 / 26.2 |
| CVE-2025-43510 | AppleM2ScalerCSCDriver 写时复制缺陷 | GPU 进程 → mediaplaybackd | iOS 18.7.2 / 26.1 |
| CVE-2025-43520 | XNU 内核虚拟文件系统竞态 | 内核提权，获得内核读写 | iOS 18.7.2 / 26.1 |

完整路径为： **Safari 渲染恶意页面 → JSC JIT 内存破坏获得 WebContent 进程任意读写 → 借 dyld 缺陷绕过 PAC 获得任意代码执行 → 经 ANGLE 逃出 WebContent 沙箱进入 GPU 进程 → 再经驱动缺陷进入 mediaplaybackd → 最终以内核竞态获得内核读写**。

为何绕行 GPU 而非直取内核

Safari 的 WebContent 沙箱在 iOS 18 上限制严格，可触达的内核攻击面很窄。利用链先通过 ANGLE（WebGL 的图形抽象层）越界写进入 GPU 进程，但 GPU 进程权限有限，再借 AppleM2ScalerCSCDriver 的写时复制缺陷进入 mediaplaybackd。

mediaplaybackd 被选中的原因在于其权限范围显著更大：可加载框架（关键能力是能够将 JavaScriptCore 运行时直接载入其中继续执行 JS exploit），可访问 IOKit user-client 与 IOSurface handle。同时 DarkSword 的日志与数据暂存例程即运行于此进程，与统一日志中 \[DarkSword-\*\] 字符串的出现位置吻合。

REFERENCE

该路径的特点是全程使用 JavaScript，无需加载未签名 Mach-O 二进制，也因此不必单独处理 PPL/SPTM 两道内核缓解措施。

PAC 与 TPRO：绕过对象与原因

**PAC（Pointer Authentication Codes）** 是 ARM64e 与 Apple Silicon 上的硬件级指针完整性机制：函数指针写入内存前以进程密钥签名（pacia/pacib），装载与调用时校验签名。其设计意图是即便攻击者获得任意内存写，也无法伪造可被调用的函数指针。

绕过的必要性由此而来：获得 WebContent 进程任意读写之后，后续动作是 ROP、跳转至 vm_map_copy_overwrite、signPointer 等系统函数。缺少 PAC 绕过，任意写仅能修改数据，无法改变控制流，利用链即在此中断。

CVE-2026-20700 位于 dyld，其内部敏感结构处于可写栈内存中，改写该结构可使 **TPRO（Trusted Path Read-Only）** 失效，进而伪造出带合法 PAC 签名的指针；同时通过线程状态操纵再绕过 SPRR（系统页只读区寄存器）与 JIT Cage（限制 JIT 代码执行区）两道缓解。

REFERENCE

Apple 官方公告对该漏洞的表述为「dyld / 内存破坏 / 改进了状态管理」，未出现 PAC 绕过或 TPRO 字样，上述定性出自 iVerify 与 GTIG 的技术分析。

内核提权：VFS 中的竞态条件

CVE-2025-43520 被 GTIG 定性为「XNU 虚拟文件系统实现中的内核态竞态条件」，可构造出物理内存与虚拟内存的读写原语。

安全研究者复原的机理模型如下：XNU 路径解析 lookup() 是 XNU 中最古老的大块代码之一，依赖 per-vnode 锁与一套手工协议在长操作间升降锁级。典型的 TOCTOU 形态为——解析路径取得 vnode（持 iocount）→ 加锁校验某属性并通过 → **释放锁执行阻塞动作** （内存分配、copyin、文件系统 callout、路径重解析）→ 重新取锁后却沿用此前那次校验的结果。若在窗口期内并发触发 unmount/unlink/rename，使 vnode 引用计数归零被回收，则路径上持有的指针成为悬垂指针，进而获得内核任意读写。

REFERENCE

该复原模型为安全研究者的审计推演，并非对 DarkSword 实现的还原——具体脆弱函数、消息几何与 vnode 操作序列均未公开。可参考的同类先例包括 P0-2361 与 2017 年的一批 TOCTOU 综述。

获得内核读写之后，可读取任意进程内存、篡改 AMFI 信任状态使未签名代码通过校验、绕过 PPL、修改信任缓存以实现持久化。对该系统而言，此步骤的直接意义是：钥匙串（Keychain）自此可读，而钥匙串内存储有各类 App 的账号密码、证书与私钥。

iOS 13 至 17 部分的 Coruna

Coruna 的披露时间更早，一度被称为国家级 iOS 利用工具箱，其结构与 DarkSword 属同一技术路线：

Stage 1（WebKit RCE）

Buffout、Jacurutu、Bluebird、Terrorbird、Cassowary，产出 fakeobj/addrof 原语

Stage 1.5（PAC 绕过）

Breezy、Seedbell，手法为内联构造 306 字节的 WebAssembly 模块、劫持 dispatch 指针，再替换系统框架的 GOT 条目

Stage 2（沙箱逃逸）

IronLoader、NeuronLoader

Stage 3（内核提权）

Neutron、Dynamo、Pendulum、Photon、Parallax、Gruber

Stage 3.5（PPL 绕过）

Quark、Gallium、Carbone、Sparrow、Rocket

其中 landa 即 CVE-2023-41974，一个物理释放后重用（PUAF）漏洞，出自 FBi 的开源提权框架 kfd。其关键限制在于仅对 App Sandbox 可达、WebContent 沙箱不可达，这正是 Coruna 必须单独准备沙箱逃逸组件的原因。

链条末端为 PlasmaLoader（GTIG 追踪名 PLASMAGRID），注入具备 root 权限的 powerd 守护进程，按 bundle ID 从 C2 拉取模块。GTIG 在其 manifest 中发现18 个加密钱包 App的窃取模块，并发现其会扫描备忘录中的 BIP-39 助记词与「backup phrase」「bank account」等关键词，对目标 App 植入函数 hook 以窃取凭据。

REFERENCE

两个工具包在注入目标上的选择不同：Coruna 由最初的 powerd 迁移至 watchdogd；DarkSword 则以 SpringBoard 为主协调器，configd 运行 keychain_copier，wifid 导出 WiFi 密码，UserEventAgent 抓取 iCloud 数据，launchd 作为跨进程 TaskROP 目标。

运行模式：hit-and-run

DarkSword 全链使用 JavaScript 实现。不注入 Mach-O 库，不做持久化，取得内核读写后将数据暂存至 /private/var/tmp/，提取完成后删除，DiagnosticReports/ 中的崩溃日志亦被清除。

研究界将此类模式称为 **hit-and-run**：在数分钟内提取目标设备上价值最高的数据后干净退出，重启一次设备后痕迹基本消失。与 Pegasus 一类长期驻留形态相比，留存的取证材料更少。

不驻留同样意味着可被反复使用——用完即弃，不留证据，也不留痕迹。

04

CODE AUDIT

### 源码审计：C2 后台的三处设计缺陷

对该 C2 后台进行源码审计后，可确认三处设计缺陷。

静态文件直读

DarkSwordHandler 继承 SimpleHTTPRequestHandler，实现了对 **项目根目录任意文件** 的无鉴权直读。关键代码：

python

\# exploit_server.py

def \_try_serve_static_file(self, rel_path: str) -> bool:

　　rel = sanitize_path(rel_path)

　　if not rel:

　　　　rel = "index.html"

　　candidates = \[\]

　　candidates.append(PAYLOADS_DIR / rel) # server/payloads/

　　candidates.append(PROJECT_ROOT / rel) # server/ ← 任意文件

　　for candidate in candidates:

...

　　　　if resolved.exists() and resolved.is_file():

　　　　　　with open(resolved, "rb") as f:

　　　　　　　　data = f.read()

... # 直接返回文件内容

　　　　　　return True

　　return False

def do_GET(self) -> None:

...

　　rel = norm_log.lstrip("/")

　　# 直接命中：GET /payloads/manifest.json、/admin/.env、/darksword.db、/admin/config.py

　　if self.\_try_serve_static_file(rel):

　　　　return

　　# 还通过 /ch/、/if/、/t/ 三段式兜底直读

　　if (norm_log.startswith("/ch/") or norm_log.startswith("/if/") or norm_log.startswith("/t/")):

　　　　\_parts = norm_log.split("/", 2)

　　　　if len(\_parts) >= 3 and \_parts\[2\]:

　　　　　　\_candidate_rel = \_parts\[2\]

　　　　　　if "." in \_candidate_rel: # 含扩展名即尝试

　　　　　　　　if self.\_try_serve_static_file(\_candidate_rel):

　　　　　　　　　　return

由于 PROJECT_ROOT / rel 直接做文件拼接与存在性检查，且未对.env、\*.py、\*.db 等敏感文件设置拒绝名单，server/ 目录下的任意文件均可被无认证读取。

sanitize_path 会剥离../，但目标文件本就位于项目根内，无需路径穿越即可命中（如 /admin/.env、/darksword.db）。

JWT 签发信任随包密钥

config.py 从 admin/.env 读取 SECRET_KEY，仅将 {"darksword_secret_key_change_me", "change_me", "secret", ""} 等弱值列入黑名单。若部署时沿用随包.env，该随机密钥即对外泄露。

auth.py 的 get_current_user 校验逻辑：

python

payload = jwt.decode(resolved, SECRET_KEY, algorithms=\[ALGORITHM\]) # 仅验签 + exp

if payload.get("type") == "agent": # 只拒绝 agent 类型

　　raise cred_exc

username: str = payload.get("sub")

...

token_version = payload.get("ver", 0)

...

if int(token_version)!= int(db_ver): # 必须与 DB 一致

　　raise cred_exc

即在取得 SECRET_KEY 且猜中目标用户的 ver（token_version）后，可伪造任意用户的合法会话。ver 为 DB 内递增整数（初始值 0，logout/force-logout 后 +1），攻击者可离线遍历 ver=0..N 构造 token 逐一验证， **成本极低**。

三步组合形成的完整接管

STEP 01拿到生产 SECRET_KEY

前置动作：前台未认证 GET /admin/.env

STEP 02获得合法 admin 会话

前置动作：用 SECRET_KEY 离线伪造 admin JWT（遍历 ver）

STEP 03HTTP 200，后台管理员权限

前置动作：伪造 token 请求 GET /api/auth/me

三步构成一条完整的接管链。

值得指出的是其中每一步单独看均不构成致命问题。弱密钥黑名单、token 版本校验、静态文件服务都属于常规安全设计，但其拼接顺序为「先读取密钥、再伪造身份」，导致上述防御措施整体失效。

安全防御的有效性取决于组合方式，而非单一环节。

05

VERIFICATION

### 实际利用验证

REFERENCE

以下所有请求均为未认证状态完成，未使用任何默认/已知密码。

| #   | 操作  | 请求  | 响应  |
| --- | --- | --- | --- |
| 1   | 确认漏洞面 | GET http://127.0.0.1:7070/ | HTTP 200 SimpleHTTP/0.6 Python/3.8.10<br><br>，落地页「欢迎」 |
| 2   | ① 任意文件读.env | GET http://127.0.0.1:7070/admin/.env | HTTP 200<br><br>，SECRET_KEY=fmFc...sqdQ（生产） |
| 3   | ② 伪造 admin JWT | 本地 HS256 签名，ver=2 | token 生成 |
| 4   | ③ 验证会话 | GET:7000/api/auth/me<br><br>（Authorization: Bearer ） | HTTP 200 {"id":1,"username":"admin","role":"admin",...} |
| 5   | 后台枚举 | GET /api/users<br><br>、/api/devices、/api/exfil、/api/settings | 全量数据 + admin 全权限 |
| 6   | 后台 RCE | 略   | 略   |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2e371aa2e6823f8.png)

— 利用链进度面板：设备上传、高权限读取、提取钱包种子等阶段进度，以及设备基础信息与访问上下文

第 5 步的响应为全量数据：admin 权限下，用户列表、受控设备、已回传的全部窃取数据与后台配置均可读取。第 6 步的后台 RCE 未展开，代码中可见执行入口。

至此，攻守位置发生逆转。

06

IMPACT

### 攻陷后台后可执行的操作

以下基于 server/admin/routers/ 源码分析，说明攻击者以 admin 身份登录后台后可对已控设备执行的操作。

设备管理

设备列表与详情

查看所有受控设备（iPhone/iPad），含 UUID、IP、地理位置、设备型号、芯片、iOS 版本、Safari 版本、越狱状态等指纹信息。

设备分组/批量操作

创建分组、批量分配渠道/模板、批量启用/禁用、批量删除设备。

设备上线通知

新设备上线或离线重连时自动产生通知。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5cc10e4096b639d7.png)

— 设备管理界面：受控设备列表，含 iOS 版本、型号、IP 地址、最近上报时间与操作入口

命令下发（\`commands.py\` 白名单命令体系）

后台通过 POST /api/commands 向受控设备下发预定义命令，命令名须在 ALLOWED_CMD_PREFIXES白名单内，涵盖以下类别：

| 类别  | 示例命令 | 功能描述 |
| --- | --- | --- |
| 系统信息 | ds_info<br><br>、system.info | 获取设备型号、系统版本、硬件信息 |
| 钥匙串窃取 | dump_keychain<br><br>、ds_exfil_keychain | dump iOS Keychain 中所有账号密码、证书、密钥 |
| WiFi 密码 | dump_wifi<br><br>、ds_exfil_wifi | 导出设备保存的全部 WiFi SSID 及密码 |
| 通讯录 | dump_contacts<br><br>、ds_exfil_contacts | 窃取全部联系人（姓名、电话、邮箱等） |
| 短信/iMessage | dump_sms<br><br>、ds_exfil_sms | 窃取全部短信和 iMessage 记录 |
| 通话记录 | ds_exfil_calls | 窃取全部通话记录 |
| 相册/截图 | dump_photos<br><br>、screenshot、camera_snap | 窃取相册照片、远程截图、远程拍照 |
| 文件操作 | file_read<br><br>、file_search、file_upload、file_download | 读取/搜索/上传/下载设备中文件 |
| 钱包/加密货币 | scan_wallets<br><br>、ds_exfil_wallet | 扫描并导出加密货币钱包数据 |
| 定位  | dump_location<br><br>、ds_geo | 获取设备 GPS 定位信息 |
| iCloud Token | dump_icloud_token | 窃取 iCloud 登录令牌 |
| 浏览器数据 | ds_history<br><br>、ds_browser |     |
| 邮件/备忘录 | dump_email<br><br>、dump_notes | 窃取邮件和备忘录内容 |
| Shell 执行 | exec_shell<br><br>、ds_exec | 在设备上执行任意 Shell 命令 |
| 进程控制 | list_processes<br><br>、kill_process、list_installed_apps | 枚举/终止进程、列出已安装 App |
| 网络侦查 | network_connections<br><br>、wifi_scan | 查看网络连接状态、扫描周边 WiFi |
| 剪贴板 | clipboard_read | 读取剪贴板内容 |
| 麦克风 | mic_record | 远程录音 |
| 持久化控制 | install_persist<br><br>、persist_check、persist_remove | 安装/检查/清除持久化后门 |
| 自毁  | self_destruct | 清除痕迹、移除植入 |
| UI 弹窗 | ui.alert<br><br>、ui.notify、ui.vibrate | 在目标设备上弹出提示框/通知/振动 |

REFERENCE

命令下发的前置条件为设备已完成 exploit（exploit_status=success），仅 UI 类命令可在 exploit 前通过 Safari 层执行。

数据回传查看（Exfil）

后台通过 GET /api/exfil 等接口，按类别查看设备回传的全部窃取数据：

keychain

— 钥匙串账号密码

wifi

— WiFi 网络凭证

contacts

— 通讯录

sms

— 短信/iMessage

calls

— 通话记录

photos

— 照片/截图

files

— 任意文件

wallets

— 加密钱包数据

location

— 位置信息

system_info

— 系统信息

browser

— 浏览器数据

支持文件下载（/api/exfil/{id}/download）与批量删除。

脚本系统

可创建预定义命令脚本（\`CommandScript\`），将多条命令组合为一个脚本。

脚本可一键批量下发至多个在线设备（\`POST /api/commands/scripts/{id}/run\`），实现批量窃取。

多代理/多用户体系

支持创建子代理（Agent）账号，分配设备额度与佣金比例，实现「分级运营」。

每个代理可拥有独立的渠道（Channel）与落地页模板（Template），用于追踪不同投放来源。

漏洞利用链投递（exploit_server）

exploit_server.py（7070 端口）负责向目标 iPhone 投递 Safari 浏览器 0-day / N-day exploit（Stage1→Stage2→Stage3 payload 链）。

支持 iOS 13.0 ~ 17.2（见 SUPPORTED_IOS_VERSIONS），覆盖绝大多数仍在服役的设备。

落地页通过渠道 slug 与模板 slug 生成访问链接（/ch/?tpl=），目标打开后自动触发 exploit 链。

07

MARKET

### 市场流通情况与溯源

该工具包的定价与使用者，可由三条独立证据链交叉印证。

一、地下论坛的挂牌信息

2026 年 9 月 11 日，账号 xynapse 在 BreachForums 发布帖子《MALWARE iOS 0-Day Exploit Kits | DarkSword & Coruna》，同时出售两套工具包：DarkSword 标价 **7,500 美元** （覆盖 iOS 18.4–18.7，含控制面板、部署脚本与部署协助），Coruna 标价 **5,000 美元** （覆盖 iOS 13–17.2.1，含钱包窃取、凭据收集、session 劫持），并声明通过论坛中间人托管交易。

REFERENCE

上述为黑产论坛的自述信息，价格与可用性未经第三方独立验证。可确认的事实是：该工具包已具备公开报价单。

二、Censys 发现的在运营平台

10 月 7 日，Censys 发布调查报告，在 5 台开放目录主机上发现一套以中文运营的 exploitation-as-a-service 平台：

\`156.239.230\[.\]120\` 为完整 C2 平台：\`exploit\_server.py\`（Python）+ FastAPI 管理面板 + \`darksword.db\`（SQLite）

管理端具备代理与经销商模型：佣金率、设备配额、独立投递渠道、60 余条命令

生产服务器副本中存有 11 条受害者的 BIP-39 助记词、179 个设备战利品目录、75 个操作员账号

18 个钱包注入模块

由 SpringBoard 协调器监控 App 启动并注入，注入节流至每 3 秒每 bundle 检查一次

载荷链为：\`bootstrap.dylib\`（滩头）→ \`stage2.dylib\`（控制器）→ \`core\_v6.dylib\`（持久 implant）

另一台主机 \`43.134.165\[.\]205\` 分发 DS-Fusion v1.0，将 DarkSword 与 Coruna 打包为单一分发单元

**exploit_server.py + FastAPI 管理面板 + darksword.db** 这一组合，与本文开头所述的三段式架构在生产环境中的形态一致。

Censys 还在生产服务器的 exploit registry 中发现两个此前未公开的、DarkSword 相关的 CVE：CVE-2025-24201（WebKit 越界写，修于 iOS 18.3.2）与 CVE-2025-31200（Core Audio 内存损坏，修于 iOS 18.4.1）。

三、来源追溯

相关时间线如下：

2022–2025

前澳大利亚信号情报局（ASD）官员 Peter Williams 使用移动硬盘从悉尼与华盛顿办公室带出至少 8 个 exploit 组件，出售予俄罗斯 exploit 经纪商 Operation Zero（Matrix LLC），本人收取 130 万美元加密货币，其雇主对该项目的估值达 3,500 万美元

2026-02-24

美国联邦法官判处其 87 个月监禁；同日美国财政部制裁 Operation Zero 及其所有者

2026-03-18/19

Google GTIG、Lookout、iVerify 联合公开披露 DarkSword

2026-03-23 前后

源码由第三方泄露至 GitHub，泄露者与联合披露方无关

2026-03-26

Proofpoint 观测到俄罗斯 FSB 关联的 TA446（Callisto / ColdRiver / Star Blizzard / SEABORGIUM）在冒充大西洋理事会的鱼叉式钓鱼邮件中大规模利用泄露的工具包，此为国家行为体首次公开使用泄露的 iOS 全链利用包

2026-10

Censys 发现黑产运营平台

Lookout 研究员对此的表述是，DarkSword 「将这整套东西变成了商品化恶意软件」（turning it into commodity malware）。

两款工具包的风险等级并不对等： **Coruna 源码至今未发现公开泄露** （iVerify 明确说明），DarkSword 源码已流出，因而后者成为实际扩散开的那一套。

四、投递环节的供应链投毒

Zimperium zLabs 的数据最为直接：截至 2026 年 10 月，识别出 **608 个投递 Coruna 系代码的域名**，其中 93 个站点的配置对应 **21 个不同的追踪收集器**。

改变格局的是 **SafeDep 于 2026 年 5 月 20 日** 披露的 npm 供应链投毒事件，受害者为 JS 模板引擎 art-template，周下载量约 3.36 万。攻击手法区别于常见的凭据窃取，采用 **社会工程式收购欺诈**——一家马来西亚公司向原作者提出收购，原作者完成马来西亚 Companies Commission 尽调后自愿转让 npm 与 GitHub 所有权，随后恶意版本 4.13.3–4.13.7 陆续发布。

注入点位于浏览器侧的 lib/template-web.js，并设有针对性过滤： **无 Referer 头时返回近乎空的响应**，带 Referer 才返回完整 payload，使 IOC 抓取与沙箱爬虫失效。投递链仅对 **iPhone UA** 生效，隐藏 iframe 被置于 closed Shadow DOM 中。

REFERENCE

这一环节的意义在于：攻击者不再需要自行注册落地页域名。正常网站遭投毒后持续向全球访客投送 iframe，域名信誉类防御手段随之失效——因为流量形态与常规 HTTPS 访问无异。

08

DEFENSE

### 修复版本与缓解措施

iOS 18.6

修复 CVE-2025-31277（18.4–18.5 区间的入口）

iOS 18.7.2 / 26.1

修复 CVE-2025-43510 与 CVE-2025-43520（末段内核提权）

iOS 18.7.3 / 26.2

修复 CVE-2025-43529 与 CVE-2025-14174

iOS 26.3

修复 CVE-2026-20700（dyld 处的 PAC 绕过），这是整条链的最后一个缺口

iOS 18.7.7

的公告正文明确写有「web attacks called DarkSword」，为面向旧机型的正式回补

Coruna 相关漏洞由 iOS 15.8.7 与 16.7.15 回补（iOS 13/14 需先升级至 iOS 15）

概括而言： **升级至 iOS 18.7.7 或 iOS 26.3 及以上版本，该利用链即告中断。**

其他建议

1

**避免扫描陌生二维码、避免点击来源不明的短链**。落地页链接为拼装生成，钓鱼短信、社工私信、虚假活动页乃至遭投毒的正常网站均可批量投放。

2

**Safari 不构成安全边界**。入侵发生在浏览器层，浏览器隔离机制在此类攻击中失效。怀疑点击过可疑链接后，重启 Safari 是成本极低的处置动作。

3

**立即修改密码并吊销会话**。钥匙串、iCloud 令牌、浏览器 Cookie 同处被窃取范围，未改密码等同于未失窃。

4

**钱包仅保留最小额度**。在无法确保防护完整生效的前提下，限制风险敞口是更实际的底线。

5

**iCloud 与钱包分离**，并启用 **高级数据保护**，使被窃取的 iCloud 令牌失去可用价值。

6

**企业设备不应仅依赖 App 层监控**。内核级植入运行于合法进程内，App 层检测可能无法发现；而一次性的 hit-and-run 感染在事后亦难以取证。

受影响范围

iVerify 测算，iOS 18.4–18.6.2 用户中仍有 **14.2%，约 2.2 亿台设备** 运行在受影响版本上。其 9 月遥测数据显示，受影响设备比例由 8 月的 1.5% 上升至 9 月的 5%。

一个月内上升三倍以上，表明该工具包已进入规模化投放阶段。

∞

THE END

### 结语

这套系统的可复制性构成其主要特征。

漏洞投递服务、C2 后台、载荷库三个组件结构清晰，多代理、多渠道、多模板机制将「撒网—收割」构建为可外包的商业闭环。当前流通的这一套，只要替换 Safari 利用链的入口与钱包目标列表，即可形成新的流水线。

原文： [起底黑产入侵iPhone 无感盗U程序](https://mp.weixin.qq.com/s?__biz=MzkwMzUyNDIwMA==&mid=2247484282&idx=1&sn=eb4dab6e88bc0bb65e107b230bfe68aa&scene=21#wechat_redirect)

END

我是 网络安全透视镜 专注源码安全审计与漏洞挖掘。

如果你觉得今天这篇有收获，欢迎 **点赞、在看、转发** 三连，我们下篇见。
