---
title: 【微信】当“加载模型”变成“执行未知代码”：AI 供应链中的 GPU 挖矿陷阱
source: https://mp.weixin.qq.com/s/gYvIdC7C4Co7GTIj_nqueQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T18:30:50+08:00
trace_id: 297049c8-5b67-45de-bf11-444fbc277fd5
content_hash: 69c524a486802482bff20b9509ee642cfb4e64f36e4b402bc860abf5931df6c2
status: synced
tags:
  - 微信
  - 恶意样本
  - 供应链安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 攻击者在 Hugging Face 模型仓库植入恶意 Python 代码，借 trust_remote_code=True 在模型加载前执行，实现 GPU 挖矿、持久化与反向 Shell，已产生约 5000 美元挖矿收益。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 40f75244-d011-8118-bed6-d3a3a8a389d0
ioc:
  cves: []
  cwes: []
  hashes:
    - 170ef5754bea51c3b05ae4b6c15c541ffa51d972bf8fe0bd3d1c3a19946bd6ac
    - 2cd9328715bbffb6b090a58de17222c830d910f5ec8198e3fefb0fca2f3e0ef0
    - 414b3cf7a288eaa592b0f03d85c7a6960dbdb855fcb684478b9def9faa95c21d
    - 41902d18fa2c285c0f4a6b39cf0f2eefbc7acbff33b6eb6fc88ba680a201d17d
    - 587e3c3be3c75eb6586d69b25adb4c4208c1cf7d39157946da543dd823117adc
    - 5dc4b927fb91442a66a2e02c1636f629d4042a03a5c1523cd841d6ece66e0beb
    - 6a837d3042b9b8b6266c75b07e22ea8e7a7108083efa48ff0aedba7fa24fb57c
    - 6b1e531c9e799a6df1472acc143c6eaec6ea4dd22f997458ba519644d125197e
    - 849ce59ffb2ae55e4131111acd8a511444475639ba18515509310414b1661964
    - 88f4b95a1c3d0a0d9638dc6e69f5bbc9ce0e1b92d069a0e404f60fa5397ee020
    - 9d62179c94faf0c8eb86704973c218c229e92c71c0ed60a5e85d4bcc69c13f40
    - b0e1ae6d73d656b203514f498b59cbcf29f067edf6fbd3803a3de7d21960848d
    - c492732de98117b7b28ce0e410f5966e1232e9dc
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 攻击者在 Hugging Face 模型仓库植入恶意 Python 代码，借 trust_remote_code=True 在模型加载前执行，实现 GPU 挖矿、持久化与反向 Shell，已产生约 5000 美元挖矿收益。
> 
> - **执行机制：** 代表仓库 qwen2-tiny 权重仅 42 字节且不含张量，真正生效的是 config.json 中 auto_map 指向的 Python 模块——其在导入时先运行顶层恶意代码，即使模型随后加载失败主机也已失陷；Safetensors 权重格式安全不等于仓库代码安全。
> - **载荷能力：** 部署 Pearl 矿机、每 120 秒重启矿机的看门狗及 .bashrc/.profile 持久化钩子；矿机经 memfd_create 内存执行并伪装为 [kworker/u20:1] 内核线程；qwen2-tiny-5/6/9 三个版本含反向 Shell，qa-whl-1021 变体借特权容器挂载宿主机磁盘建立 root 登录通道。
> - **规模与收益：** 两波共 31 个恶意仓库、29,818 次下载，计入关联模型为 44 个仓库、32,376 次；第一波钱包经 716 笔交易收到约 2,276 PRL（约 5000 美元）。平台扫描判“干净”是因 ClamAV 与模型安全扫描只覆盖权重格式，不覆盖普通 Python 代码的导入行为。
> - **归因与关联：** 测试账号 dsxk4mr8tq 遗留的两份 .bak 备份文件保留旧下载 URL，将测试账号、生产账号 hhzz667/wssb123e 与跨平台二进制镜像直接串联；Pluto 评估运营者为经济利益驱动、使用中文的个人或小团体。
> - **第二攻击链：** SolanaCry 伪造仅含 README 的 Solana starter kit 仓库，诱导 AI 编程代理执行 iwr+iex 的 PowerShell 命令，落地合法签名 NetSupport Manager 作 RAT 并按配置关联 eSentire 跟踪的 EVALUSION 集群。

**奇安信威胁情报中心** *2026年11月5日 17:07*

威胁情报 · 恶意软件分析

当“加载模型”变成“执行未知代码”

AI 供应链中的 GPU 挖矿陷阱

模型权重只有 42 字节、不含任何张量的“模型仓库”，真正发挥作用的是仓库里的一段 Python 代码——两波 31 个恶意仓库、超 3 万次下载的 Load/Mine 活动全景复盘。

· AI 供应链　· trust_remote_code　· GPU 挖矿　· 反向 Shell　· AI 编程代理

一个名为 qwen2-tiny 的模型仓库，模型权重文件只有 42 字节，里面没有任何张量；真正发挥作用的是仓库中的一段 Python 代码。

当使用者以 trust_remote_code=True 加载它时，代码在模型初始化之前执行：写入看门狗、修改 Shell 启动文件、获取挖矿程序，并尝试把矿机伪装成 Linux 内核工作线程。部分版本还会先连接反向 Shell，让攻击者获得交互式访问能力。

这不是一起利用模型权重投毒或 Pickle 反序列化漏洞的攻击。攻击者利用的是 Transformers 明确提供的自定义模型代码加载能力，以及使用者在教程、测试和自动化部署中形成的信任习惯。

## 事件快照与规模

Pluto Security 将这次活动命名为 **Load/Mine**。其调查覆盖两波共 31 个恶意仓库；若计入仅存在技术关联、尚不能证明同属一个运营者的模型，总下载量为 32,376 次。代表性仓库 MENXIANGYU/qwen2-tiny 在 10 月 28 日达到 28,412 次下载。

**需要先强调：下载次数不等于确认感染数，也不等于独立受害者数量。** 但矿池收益、在线 worker 和主机侧载荷表明，这不只是“理论上可行”的概念验证，而是已经产生实际挖矿收益的后门活动。

01 事件快照：攻击者要的不只是 GPU 算力

|     |     |
| --- | --- |
| 项目  | 已公开事实 |
| 活动时间 | 第一波自 2026 年 9 月开始；第一波账号被移除后，第二波在数日内出现 |
| 主要入口 | 使用者在加载模型时启用 trust_remote_code=True |
| 伪装方式 | 仓库名称模仿小型 Qwen2 测试检查点；部分仓库没有真实模型权重 |
| 重点环境 | 自建推理服务器，尤其是运行 Xinference、GPUStack 的 GPU 主机；也包括租用 GPU、共享研究 Notebook 和自动拉取测试模型的 CI 环境 |
| 主要载荷 | Pearl（PRL）挖矿程序、看门狗、Shell 启动项持久化；部分版本含反向 Shell、侦察或数据收集组件 |
| 升级行为 | 特定脚本针对 **特权容器** 挂载宿主机磁盘并建立 root 登录通道 |
| 规模  | 核心活动 31 个仓库、29,818 次下载；计入 13 个关联模型后共 44 个仓库、32,376 次下载 |
| 收益证据 | 第一波钱包收到约 2,276 PRL，Pluto 估值约 5,000 美元 |
| 运营者画像 | Pluto 评估为经济利益驱动、使用中文的个人或小团体；现有证据不支持进一步扩大归因 |

从防守视角看，挖矿只是最容易被察觉的结果。 **看门狗、启动项、SSH 授权密钥和反向 Shell** 才决定了攻击者能否在矿机被终止后继续回来。

02 真正的入口：模型尚未加载，仓库代码已经运行

## 代码加载执行机制

1\. trust_remote_code=True 到底开启了什么

部分模型需要仓库自带 Transformer 配置、分词器或建模实现。Transformers 为此提供自定义代码加载机制：使用者通过 trust_remote_code=True 或交互确认，允许框架执行发布者提供的 Python 文件。

典型调用如下：

AutoModelForCausalLM.from_pretrained(

"publisher/custom-model",

trust_remote_code=True,

)

关键不在权重文件，而在 config.json 中的 auto_map。它指定需要加载的 Python 模块和类。框架下载相应文件后，通过 Python 导入机制执行模块； **模块顶层语句会先运行，随后框架才取得目标类并继续模型初始化。**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/84f9beadead641f8.png)

图 1｜自定义模型加载与代码执行过程

图源：Pluto Security。图中第 4—5 步即本次活动利用的普通 Python 源码执行面，而非权重文件。

以代表性仓库为例，auto_map 指向 modeling_evil2.EvilModel。modeling_evil2.py 在类定义之前调用\_boot()，因此恶意逻辑不需要等待模型对象创建成功：

\# Pluto 披露的精简结构

try:

\_boot()

except Exception:

try:

\_run()

except Exception:

pass

classEvilModel:

...

这带来两个直接结论：

-   **即使模型随后加载失败，前置代码也可能已经执行。**
    
    不能仅凭“模型没跑起来”排除失陷。
    
-   **代码以加载进程的身份运行。**
    
    它能访问该进程拥有的文件、网络、凭据和 GPU 环境；若以 root 或高权限服务账号运行，影响随之扩大。
    

2\. 为什么“Safetensors 安全”不能推导出“整个仓库安全”

代表性仓库中的 model.safetensors 只有 42 字节且不含张量。它没有承担恶意代码投递功能，只是让仓库外观更接近正常模型。

Safetensors 的安全设计针对的是权重反序列化风险；trust_remote_code 涉及的则是仓库内 Python 实现。二者是不同的执行面。 **权重格式安全，不等于配置、建模代码和加载流程安全。**

03 主机攻击链：从一次导入到持久化挖矿与远程控制

不同仓库和版本的能力并不完全一致。下面以六个已分析的第二波挖矿版本为主线，并单独标注变体行为，避免把所有功能误认为每个样本都具备。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3dad34e8821075b7.png)

图 2｜Load/Mine 载荷三阶段攻击链

## 主机攻击链拆解

图源：Pluto Security。反向 Shell 仅见于六个已分析版本中的三个，不能泛化为所有版本均具备。

阶段一：建立立足点，部分版本先打开反向 Shell

代表性载荷将看门狗写入：

/tmp/.cch/svc.py

看门狗作为独立进程运行，使用模型加载器的 Python 解释器，每 120 秒检查并重新启动缺失的矿机。载荷还向以下文件追加重启钩子：

/root/.bashrc

/root/.profile

~/.bashrc

因此， **结束挖矿进程并不等于清除感染**。看门狗、Shell 启动钩子及其他持久化机制仍需分别处理。

在 qwen2-tiny-5、qwen2-tiny-6 和 qwen2-tiny-9 三个版本中，独立进程会在持久化步骤之前连接 212.32.253.3 的 443 或 9443 端口，并在断线后重试。连接成功后，攻击者获得继承失陷进程权限的交互式 Shell。

阶段二：获取矿机，并准备两条执行路径

挖矿二进制名为 syscore.bin。载荷会依次尝试从已下载的模型快照、既往感染留下的 /tmp/.cch/sync 获取它；若本地没有，则从 Hugging Face 仓库或镜像下载。

需要联网下载时，客户端会取消主机已配置的代理设置，尝试直接出站。 **在网络允许直连的情况下，这可能绕过代理检查和日志；如果网络强制经过代理，它并不能凭此突破该限制。**

第一波钱包相关的在线 worker 报告客户端为 peakminer/2.16.5。研究人员恢复第二波二进制的打包标记并解包后，也确认了其中的 peakminer。

阶段三：首次启动走内存文件路径，失败后回退到磁盘

首次启动时，载荷把二进制复制到 memfd_create 创建的内存文件描述符，再通过 fexecve 执行，并将 argv\[0\] 设置为：

\[kworker/u20:1\]

这样，首次执行不依赖一个普通的磁盘可执行文件路径，进程列表中还会出现类似内核工作线程的名称。但伪装存在可检测的破绽： **真正的内核线程不会携带这种用户态挖矿参数**，而异常进程的完整命令行中可以看到 worker 登录信息。

看门狗后续重启则使用磁盘上的回退副本：

/tmp/.cch/sync

第二波 syscore.bin 大小为 40,625,780 字节，使用 UPX 打包。样本中两处 UPX! 标记被改为 PEK!，导致常规 upx -d 拒绝解包；但样本内置的加载逻辑仍能完成解包和运行。这一改动主要增加静态分析难度，并不改变其挖矿功能。

阶段四：借用 Xinference 注册表回传状态，清理竞争矿机

载荷把状态信息伪装成 Xinference 本地模型注册名称，例如：

qwen2-tiny-<base32>

状态码覆盖启动、二进制就位、内存路径运行、磁盘回退运行、下载失败、启动失败、看门狗恢复挖矿等阶段。每第五个看门狗周期还会写入含 GPU 利用率的心跳信息。能够访问相应 Xinference API 的攻击者可以读取并解码这些名称。

这里不应误解为 Xinference 模型注册表天然等于远程 C2。样本首先把状态写入本地注册表；攻击者能否远程读取，还取决于 API 是否可达以及访问控制是否缺失。这也是 Pluto 建议为 Xinference API 启用认证并限制网络可达性的原因。

矿机运行后，载荷还会删除竞争模型的注册信息、剥离其启动命令并终止匹配进程。早期版本扫描 /proc/\*/cmdline，识别 13 种竞争矿机名称，以独占计算资源。

阶段五：特定变体尝试从特权容器进入宿主机

在第一波披露邮件发出约 8.5 小时后，MENXIANGYU/qa-whl-1021 发布。其中的脚本面向 **特权容器** 场景：激活 LVM 卷、挂载候选宿主机磁盘，寻找宿主机根文件系统或 GPUStack 的 /var/lib/gpustack，进而建立宿主机 root 登录通道。

这一脚本把目标从 Xinference 扩展到 GPUStack，也说明攻击者关注容器下方的宿主机。但它有明确前提， **不能表述为任意容器加载模型后都会自动逃逸**。是否使用特权容器、是否暴露宿主机资源，直接决定该路径能否成立。

另一个后期下载器对 212.32.253.3:8898/lf_py.py 的第二阶段内容实施来源 IP 限制。非白名单请求只得到 403 和 static ip.，意味着分析人员在不满足来源条件时可能无法获取真实后续载荷。

04 两份遗留备份，串起测试账号与生产账号

活动发现过程同样值得关注。

研究人员首先扫描 config.json 的 auto_map 实际引用的 Python 文件，以及模型权重旁的 Python 文件，关注 subprocess、socket、ctypes、memfd_create 等高风险行为。测试账号 dsxk4mr8tq 下的 qwen2-tiny-gpt2 因此进入视野：其 modeling_evil.py 同时命中多类特征，账号在 10 月 12 日的 2.5 小时内创建了六个仓库。

真正连接不同账号的是 qwen2-tiny-lite 中遗留的两个备份文件：

modeling_evil.py.bak-src

modeling_evil.py.bak-sync

主文件中的下载地址已经更新，备份文件却仍保留旧地址，分别指向 Hugging Face 的 hhzz667 和 ModelScope 的 wssb123e。运营者复制生产代码到测试账号时忘记清理备份，版本痕迹由此成为关联证据。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5e10216d77e3f3f4.png)

图 3｜测试账号与生产账号关联路径

图源：Pluto Security。两份遗留备份中的旧 URL 将测试账号、生产账号与跨平台二进制镜像连接起来。

这比单纯依据模型名称或代码相似度更扎实： **旧 URL 将测试账号、生产账号和跨平台二进制镜像直接连接起来**。

05 两波活动演进：入口不变，访问方式与载荷持续调整

|     |     |
| --- | --- |
| 时间  | 活动变化 |
| 9 月 21 日 | qwen2-shell<br><br>为 37 行 SSH 后门，植入 ed25519 公钥并向阿里云上的服务器发送信标 |
| 9 月 21—22 日 | qwen2-tiny、qwen2-mini、qwen2-nano、qwen2-legacy<br><br>扩展到六处 SSH 密钥写入路径，并加入.bashrc 修改和 /tmp/.qa_pwned 自测标记 |
| 9 月 22 日 | qwen2-final<br><br>已具备完整的内存文件执行、内核线程伪装、竞争矿机清理、Xinference 状态回传和双矿池逻辑 |
| 10 月 12 日 | 测试账号 dsxk4mr8tq 集中创建六个仓库，复用代码并更新下载地址 |
| Pluto 第一波通报后 | Hugging Face 与 ModelScope 移除第一波相关账号；数日内出现第二波，硬编码 SSH 密钥逐步被反向 Shell 替代 |
| Pluto 披露邮件后约 8.5 小时 | 出现面向特权容器和 GPUStack 的 qa-whl-1021 |
| 10 月 25 日 | 新账号 htt0118 上传与 qwen2-tiny-6 高度相近的副本，保留相同矿池登录名和反向 Shell 接收端 |
| 10 月 28 日 | 代表性仓库下载量达到 28,412 次；核心及关联模型合计 32,376 次 |
| 10 月 29 日 BleepingComputer 报道发布时 | MENXIANGYU/qwen2-tiny<br><br>已被禁用；htt0118/qwen2-tiny 副本在报道时仍可访问。该状态仅为当时快照 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/77901bdb5da085af.png)

图 4｜两波活动演进与关键变体

图源：Pluto Security。活动由早期 SSH 后门演进为可自我迭代的挖矿与后门链；时间及下载量以 Pluto 报告快照为准。

截至 10 月 28 日的下载量拆分如下：

|     |     |     |
| --- | --- | --- |
| 范围  | 仓库数 | 记录下载量 |
| 第一波，移除前记录 | 12  | 728 |
| 第二波 | 19  | 29,090 |
| **核心活动合计** | **31** | **29,818** |
| 仅技术关联的模型 | 13  | 2,558 |
| **整体合计** | **44** | **32,376** |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d8d233cf4bc699d2.png)

图 5｜各仓库与账号下载量分布

图源：Pluto Security。图中仓库在线状态和下载量均为 2026 年 10 月 28 日快照；下载次数不代表确认感染数。

MENXIANGYU/qwen2-tiny 一个仓库占第二波下载量约 97.7%。但下载量可能包含研究、镜像、重复拉取或自动化访问，不能直接换算为感染主机数。

06 为什么扫描结果显示“干净”

Hugging Face 会在每次提交时使用 ClamAV 扫描小于 2 GB 的文件，并集成 Protect AI、JFrog 等扫描能力检查支持的机器学习模型格式。问题在于，这些能力与本次入口并不完全重合：

## 扫描为何漏报

-   杀毒扫描主要识别已知恶意特征；
    
-   模型安全扫描重点处理 Pickle、Keras 等权重或序列化格式风险；
    
-   本次核心是 auto_map 指向的普通 Python 文件，其危险之处在于导入后的行为，而不是权重格式本身。
    

Pluto 的测试显示，第一波 12 个仓库均未被标记；第二波代表性 modeling_evil2.py 也未被已运行的扫描器判为恶意。JFrog 返回的信息是“不是机器学习模型”。

这句话应理解为 **该文件不属于此扫描器可分析的模型格式**，不能进一步解释为人工确认安全。对防守方而言，“扫描通过”“未检出”和“扫描器不适用”必须区分， **更不能把页面上的安全状态当作允许执行远程代码的依据**。

07 实际影响：矿池仍有收益，风险不止于算力消耗

Pluto 记录，第一波钱包通过 716 笔交易收到约 2,276 PRL，并已将约 2,241 PRL 转出。相关矿池在第一波仓库移除后仍显示在线 worker。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fcbe80ba3fc72342.png)

图 6｜第一波矿池在线 Worker 与收益证据

图源：Pluto Security。截图显示两个在线 worker 报告 peakminer/2.16.5，以及截取时的 30 天收益数据。

研究期间，九个名称类似共享 Notebook 和 A100 GPU 节点的 worker 在 90 秒内陆续加入，约六分钟后停止提交份额。研究人员认为，这一现象与管理员发现后终止任务的情形相符，但公开信息并未进一步确认这些主机的管理方和处置过程。

归因方面，Pluto 依据简体中文代码注释、阿里云上的 C2、ModelScope 与 hf-mirror.com 镜像、面向 Xinference 和腾讯云的变体，以及集中于中国标准时间深夜的活动时段，将核心活动评估为 **经济利益驱动、使用中文的个人或小团体**。这些证据可以支持语言环境和动机判断，但不足以支持更高层级归因。

soumikmahato 的“parasit”分支带有印尼语注释并采用不同构建方式。Pluto 对此保留两种可能：第二个运营者，或同一运营者刻意构建外观不同的冗余分支。分析时不应把该分支的每个特征都强行归入同一作者。

08 另一条独立攻击链：伪造 Solana 项目，诱导 AI 编程代理执行命令

Bleeping Computer 在同一篇报道中还介绍了 Air Security 的 SolanaCry 研究。它与 Load/Mine 没有证据表明属于同一活动，但共同揭示了一个变化： **攻击者不只等待人阅读恶意说明，也开始利用 AI 代理自动搜索、选择和执行的工作流**。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/953d15185b9f3088.png)

## SolanaCry 攻击链

图 7｜SolanaCry AI 编程代理决策与执行链

图源：依据 Air Security 公开研究整理绘制。

1\. 仓库只有 README，却足以完成投递

GitHub 仓库 SolanaUpdateTools/solana-starter-kit 创建于 2025 年 11 月，研究时有 286 个星标。它自称提供 Anchor、TypeScript 客户端和 Next.js 界面，实际上没有对应项目代码，唯一文件是 README。

README 的唯一“安装步骤”是一条 Windows PowerShell 命令。命令把字符串片段拼接为：

developer-update\[.\]app/update/indicator

随后通过 iwr 下载内容，再交给 iex 直接在内存中执行。此投递阶段不先把脚本保存为普通磁盘文件；如果 AI 编程代理根据搜索结果选中仓库并照做，开发者可能只看到代理转述的安装结果，而没有审查原始命令。

2\. 合法远程管理软件被改造成隐蔽控制通道

Air 从互联网档案中恢复的实际载荷 indicator.ps1 约 21 MB，内嵌 14 个文件：13 个为合法签名的 NetSupport Manager 组件，另一个为攻击者配置的 client32.ini。

脚本创建隐藏目录 %LOCALAPPDATA%\\y2inwRnI6G，写入组件，并通过以下注册表运行键实现登录自启动：

HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run

名称：SecureModule

配置将 maxwintodaybtc\[.\]com:443 设为控制端，关闭聊天、提示、断开按钮和系统托盘等用户可见功能。NetSupport 本身是合法商业远程支持软件，但在这里提供屏幕与键鼠控制、文件传输、远程命令执行、音频采集和注册表访问等能力。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6486ba41dc3350c3.gif)

图 8｜SolanaCry Dropper 执行与 NetSupport 落地过程（动态演示）

图源：Air Security。展示隐藏目录、14 个释放文件、恶意配置、登录自启动、RAT 启动和清痕步骤。

脚本最后清理 RunMRU 历史并删除自身，再显示“开发者功能暂时因负载暂停，请 72 小时后重试”的虚假错误。AI 代理可能把它转述为普通服务故障，从而降低开发者立即检查命令和主机变化的概率。

Air 根据样本中的 RADIUSSecret 将其与 eSentire 跟踪的 NetSupport 集群 EVALUSION 关联，并发现其命令拼接方式与此前伪造 TradingView“AI 信号”工具的活动一致。这属于基于配置与加载器特征的研究关联。

Air 检查时，原始载荷 URL 已返回 404；BleepingComputer 则通过互联网档案中的样本确认了上述行为。因此， **检查时 URL 失效不代表历史执行风险消失，也不能据此判断仓库曾经无害。**

## 防守与处置建议

09 防守建议：把模型代码当作代码依赖，把代理读到的内容当作不可信输入

1\. 模型上线前：审查、固定版本、隔离验证

-   **默认不为不可信仓库启用 trust_remote_code=True。**
    
    对确有业务需要的仓库建立发布者、仓库和用途白名单，而不是只检查模型名称。
    
-   **审查完整代码链。**
    
    从 config.json 的 auto_map 出发，检查其引用的全部.py 文件及后续导入，不只扫描权重文件。
    
-   **固定已审查的提交版本。**
    
    使用完整 commit 哈希锁定 revision，避免审查后仓库内容发生变化；必要时在内部镜像中保存已验证副本并校验哈希。
    
-   **在隔离预发布环境先加载。**
    
    使用非 root、非特权容器，不挂载 Docker Socket 和宿主机敏感目录，不注入生产凭据，限制出站网络与文件写入。
    
-   **将行为检测纳入模型准入。**
    
    对 subprocess、原始 socket、ctypes、memfd_create、动态下载执行、启动项修改等组合行为进行静态和动态检测，但不要把单一正则或“扫描干净”作为最终结论。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c1fcaf9a3b820f5.png)
    

图 9｜模型安全引入与上线审查流程

图源：依据本文防守建议整理绘制。将仓库登记、代码审查、版本固定、隔离验证、动态观察、受控上线和持续复核串联为闭环。

2\. 推理平台：缩小单次加载的影响半径

-   为 Xinference API 启用认证并限制网络可达性，避免将管理接口直接暴露给不可信网络。
    
-   GPUStack、Xinference 和模型评测任务使用独立低权限账号，避免 root 运行。
    
-   禁止使用特权容器加载未经验证的模型；限制宿主机设备、LVM、敏感目录和管理接口挂载。
    
-   对模型加载进程设置出站目的白名单，重点监控矿池、原始 IP、非常用端口和运行时新增的下载行为。
    
-   将 GPU 利用率异常与进程、容器、模型注册信息关联分析，避免仅凭 GPU 使用率判断是否存在后门。
    

3\. AI 编程代理：搜索结果可以读，命令不能自动放行

-   把仓库 README、网页和搜索结果视为不可信内容，不允许其中的指令绕过人工审批。
    
-   对代理发起的 Shell、PowerShell、包安装和远程脚本执行保留明确的人工确认，尤其是 iex、iwr、管道执行及拼接 URL。
    
-   不允许代理仅凭星标、搜索排名或项目描述选择并执行 starter kit；先核对仓库文件、发布者历史与项目真实性。
    
-   记录代理读取的仓库、生成的命令和实际执行结果，使安全团队能够还原“哪段外部内容触发了哪条命令”。
    

4\. 已加载可疑模型：按主机失陷处置，而不是只结束矿机

1.  **隔离并保留证据。**
    
    先限制生产和出站访问，再采集进程、连接、日志、模型缓存、启动文件、计划任务、SSH 密钥和模型注册表变化。
    
2.  **排查同源暴露。**
    
    检查其他加载过相同仓库或共享同一镜像、Notebook、CI 缓存的主机。
    
3.  **清除所有回访路径。**
    
    同时处理看门狗、Shell 启动钩子、cron、SSH authorized_keys、反向 Shell、恶意模型注册和后续载荷。仅删除模型或杀掉矿机并不充分。
    
4.  **从干净主机轮换凭据。**
    
    撤销并更换失陷进程可接触的 Hugging Face Token、云凭据、密码和 SSH 密钥，并检查近期异常使用。
    
5.  **无法确认完整性时重建。**
    
    使用可信镜像重新部署，不在已失陷主机上仅做表面清理后继续投入生产。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6300abe164b1e7c.png)
    

图 10｜可疑模型加载后的应急处置流程

图源：依据 Pluto Security 处置建议及本文应急流程整理绘制。包含隔离取证、同源排查、四路清除、凭据轮换和完整性决策。

10 结语

这次活动的核心并不复杂：攻击者把普通 Python 文件放进名称熟悉的模型仓库，等待使用者打开一个常见参数。复杂的是随后形成的工程化能力——多源下载、看门狗、内存文件执行、进程伪装、状态回传、竞争矿机清理、反向 Shell，以及特定场景下的宿主机访问。

对 AI 基础设施而言，安全边界不能只画在“模型文件”上。模型仓库中的配置和代码、加载进程的权限、推理 API 的暴露面、容器与宿主机之间的隔离，以及 AI 代理自动执行外部说明的权限，都属于同一条供应链。

**模型可以来自社区，执行权限不能一并默认授予。**

11 技术附录

附录 A：MITRE ATT&CK 技术映射

> 以下映射依据公开样本行为整理，覆盖 Enterprise ATT&CK。并非每个仓库都具备全部行为，带“特定版本／变体”的条目应结合样本范围理解。

A.1 Load/Mine：Hugging Face 恶意模型活动

|     |     |     |
| --- | --- | --- |
| ATT&CK ID | 技术名称 | 本文对应行为 |
| T1204 | User Execution | 使用者启用 trust_remote_code=True 并加载攻击者控制的模型仓库，触发仓库 Python 代码执行 |
| T1059.006 | Command and Scripting Interpreter: Python | 恶意建模模块在导入时运行 \_boot() 等顶层代码，并以 Python 看门狗维持后续活动 |
| T1105 | Ingress Tool Transfer | 从模型仓库、镜像或攻击者服务器下载 syscore.bin、第二阶段脚本及其他组件 |
| T1546.004 | Event Triggered Execution: Unix Shell Configuration Modification | 修改 /root/.bashrc、/root/.profile、~/.bashrc，在 Shell 启动时重新调用看门狗 |
| T1053.003 | Scheduled Task/Job: Cron | 第一波使用 /etc/cron.d/.sync-helper 维持执行 |
| T1098.004 | Account Manipulation: SSH Authorized Keys | 第一波向多个账号的 authorized_keys 写入攻击者 ed25519 公钥 |
| T1106 | Native API | 通过 memfd_create、fexecve 等 Linux 原生接口创建并执行内存文件 |
| T1036 | Masquerading | 将矿机 argv\[0\] 设置为 \[kworker/u20:1\]，伪装成内核工作线程 |
| T1564.001 | Hide Artifacts: Hidden Files and Directories | 使用 /tmp/.cch/、/tmp/.cchx、/tmp/.kitsd 等点开头目录隐藏组件 |
| T1027.002 | Obfuscated Files or Information: Software Packing | 矿机使用 UPX 打包，并修改 UPX! 标记以阻碍常规解包 |
| T1132.001 | Data Encoding: Standard Encoding | 将 Xinference 注册表中的状态与心跳信息编码为 Base32 字符串 |
| T1571 | Non-Standard Port | 反向 Shell 使用 9443 等端口，其他变体使用 8895、8898、8901 等端口传输载荷或控制数据 |
| T1496.001 | Resource Hijacking: Compute Hijacking | 利用受害主机 CPU／GPU 挖矿，并终止竞争矿机以独占计算资源 |
| T1552.005 | Unsecured Credentials: Cloud Instance Metadata API | r1r13<br><br>变体收集腾讯云元数据 |
| T1611 | Escape to Host | qa-whl-1021<br><br>在特权容器中挂载宿主机磁盘并建立宿主机 root 登录通道 |

A.2 SolanaCry：伪造 Solana Starter Kit

|     |     |     |
| --- | --- | --- |
| ATT&CK ID | 技术名称 | 本文对应行为 |
| T1204 | User Execution | 开发者或 AI 编程代理遵循 README，粘贴并执行 PowerShell 单行命令 |
| T1059.001 | Command and Scripting Interpreter: PowerShell | 使用 PowerShell 拼接 URL，通过 iwr 获取内容并由 iex 执行 |
| T1105 | Ingress Tool Transfer | 下载 indicator.ps1，随后释放 NetSupport Manager 组件和恶意配置 |
| T1219 | Remote Access Tools | 滥用合法 NetSupport Manager 建立交互式远程控制通道 |
| T1547.001 | Boot or Logon Autostart Execution: Registry Run Keys / Startup Folder | 在 HKCU Run 键创建 SecureModule，使用户登录时启动 client32.exe |
| T1564.001 | Hide Artifacts: Hidden Files and Directories | 将 %LOCALAPPDATA%\\y2inwRnI6G 设置为隐藏目录 |
| T1070.003 | Indicator Removal: Clear Command History | 清除 Windows RunMRU 历史；同时删除 PowerShell 脚本自身以减少痕迹 |

附录 B：失陷指标（IOC）

**使用说明：** 以下域名已做 \[.\] 去武器化处理。指标来自公开研究快照，在线状态可能变化；未发现单一指标不能排除失陷。核心活动与“仅技术关联”的模型应区别处理，不要在未经验证时把全部关联仓库归为同一运营者。请勿在生产环境执行可疑仓库中的代码或 README 命令。

B.1 核心活动仓库

|     |     |     |
| --- | --- | --- |
| 平台／账号 | 仓库或用途 | Pluto 关联判断 |
| Hugging Face／MENXIANGYU | qwen2-tiny<br><br>qwen2-tiny-2  <br>qwen2-tiny-3  <br>qwen2-tiny-4  <br>qwen2-tiny-5  <br>qwen2-tiny-6  <br>qwen2-tiny-9  <br>qwen2-mini-c4  <br>qwen2-mini-c5  <br>qwen2-ezv  <br>llama-tiny-x1019  <br>zz_ext  <br>qa-whl-1021 | 第二波，已证实关联 |
| Hugging Face／wjsbg | eagle-tiny<br><br>qwen2-tiny-zh21  <br>qwen2-final  <br><br>另有载荷仓库 zh-assets 和私有 beacon 仓库 | 第二波，已证实关联 |
| Hugging Face／htt0118 | qwen2-tiny | 第二波，已证实关联；与 qwen2-tiny-6 高度相近 |
| Hugging Face／soumikmahato | qwen2-tiny-chat<br><br>，位于四个掩护仓库之后 | 第二波“parasit”分支 |
| Hugging Face／r1r13 | qwen-lora-text-v1 | 第二波，已证实关联 |
| Hugging Face／hhzz667 | qwen2-shell<br><br>qwen2-tiny  <br>qwen2-mini  <br>qwen2-nano  <br>qwen2-legacy  <br>qwen2-final | 第一波，已证实关联；已移除 |
| Hugging Face／dsxk4mr8tq | qwen2-tiny<br><br>qwen2-tiny-gpt2  <br>qwen2-tiny-lite  <br>qwen2-tiny-pure  <br>qwen2-tiny-real  <br>qwen2-tiny-assets | 第一波，已证实关联；已移除 |
| ModelScope／wssb123e | qwen2-tiny、qwen2-tiny-zh<br><br>，后者为二进制镜像 | 第一波，已证实关联；已移除 |

B.2 网络基础设施与矿池

|     |     |
| --- | --- |
| 指标  | 用途／范围 |
| 212.32.253.3:443<br><br>:9443 | qwen2-tiny-5、qwen2-tiny-6、qwen2-tiny-9<br><br>反向 Shell 接收端 |
| 212.32.253.3:8898/lf_py.py | 按来源 IP 放行的第二阶段；其他请求返回 403 static ip. |
| 212.32.253.3:8895/ezv | 收集器外传端点 |
| 212.32.253.3:8895<br><br>:8898 | 载荷托管 |
| 212.32.253.3:8898/kitsd_v12.sh | zz_ext<br><br>第二阶段，包含 CPU／GPU 矿机与反向 Shell |
| 38.55.133.49:8901/kitsd_v12.sh | zz_ext<br><br>备用第二阶段地址 |
| 38.55.133.49:8901<br><br>:9001 | zz_ext<br><br>侦察外传／反向 Shell；Pluto 标记 C2 已失效 |
| 8.137.187.63 | 第一波 C2，开放 80、443、50053、50054，使用 /v1/models 和 PWN\_<hostname> |
| 103.97.176.121:8899<br><br>hz2006.aihzcc\[.\]top | wjsbg/qwen2-tiny-zh21<br><br>的 g20_reclaim.py 托管 |
| 103.97.176.121:8090/m2.bin | wjsbg/qwen2-final<br><br>矿机载荷 |
| 2.28.9.199:7000 | r1r13<br><br>GPU／元数据外传 |
| 3.112.174.116.sslip\[.\]io/sysd-kit.tgz | soumikmahato/qwen2-tiny-chat<br><br>GPU 矿机与 CUDA 运行时 |
| grows-stocks-vatican-flood.trycloudflare\[.\]com/beacon | soumikmahato<br><br>状态接收端，字段包括 ph、h、pid |
| krxXJ2PKQW.worker | 六个已分析第二波挖矿版本及 htt0118/qwen2-tiny 共用矿池登录名 |
| prl-us.kryptex\[.\]network:8048<br><br>prl-sg.kryptex\[.\]network:8048 | 第二波矿池，Stratum over SSL |
| pearl-hk.luckypool\[.\]io:3361<br><br>:3956 | 第一波矿池 |
| pool.hashvault\[.\]pro:80<br><br>:443 | 第一波矿池 |
| pearl-sg1.luckypool\[.\]io:3360 | soumikmahato/qwen2-tiny-chat<br><br>矿池 |
| de.pearl.herominers\[.\]com:1200 | soumikmahato/qwen2-tiny-chat<br><br>矿池 |
| 103.97.176.121:3361 | wjsbg/qwen2-final<br><br>矿池 |
| 178.33.123.26:3361<br><br>:3362 | wjsbg/qwen2-final<br><br>矿池 |

B.3 钱包地址

prl1p9s2a9gdy4n5yfuf5suhya2d2pyvaahmz3n3gzm3npyxkj79m7yyq9kgnrv

\# 第一波收款钱包，Pluto 称仍有受害者挖矿收益流入

prl1pek8rh8yjck5q7596aph7ua7xnkqs8ur9mkfmz8w7xfzcdfcfx5vsx2f4lz

\# soumikmahato/qwen2-tiny-chat 钱包

B.4 主机文件、进程与配置痕迹

|     |     |
| --- | --- |
| 类型  | 指标  |
| 代表性载荷目录 | /tmp/.cch/{sync,svc.py,o}<br><br>，分别对应矿机、看门狗和日志 |
| 其他投放目录 | /tmp/.cchx、/tmp/.kitsd |
| Shell 持久化 | /root/.bashrc、/root/.profile、~/.bashrc<br><br>中调用 svc.py 的异常行 |
| 进程伪装 | \[kworker/u20:1\]；<br><br>完整命令行携带矿池或 worker 参数 |
| Xinference 注册表 | qwen2-tiny-<base32>、ezv-<base32> |
| 第二阶段与收集器 | /tmp/lf_py.py、/tmp/ezv_proof.txt |
| 第一波矿机目录 | /root/.xinference/cache |
| 第一波 cron | /etc/cron.d/.sync-helper |
| 第一波自测标记 | /tmp/.qa_pwned、~/qa_pwned，<br><br>内容为 PWNED:<hostname> uid=<uid> |
| 第一波 SSH 公钥注释 | qx-5090-op；<br><br>完整公钥见下方代码块 |
| wjsbg<br><br>痕迹 | /tmp/.cache-hf/g20.py、EAGLE_MODEL_MARKER_93bd |
| soumikmahato<br><br>痕迹 | /tmp/.c/kit.tar.gz<br><br>/tmp/.c/app/  <br>/tmp/.c.pid  <br>/tmp/.c.log  <br>/tmp/.c.out |
| 容器逃逸脚本痕迹 | /mnt/qa\_<pid>；<br><br>输出字符串 QA escape、PLANTED <device>、ESCAPE_OK= |

第一波植入的 SSH 公钥：

ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDYjYyvcEJW5ZVgsESyZE5uxqSwN2vmd5asrWICeHxu1 qx-5090-op

B.5 核心样本 SHA-256

|     |     |
| --- | --- |
| 样本  | SHA-256 |
| 第二波 syscore.bin，40,625,780 字节 | 88f4b95a1c3d0a0d9638dc6e69f5bbc9ce0e1b92d069a0e404f60fa5397ee020 |
| 第二波 modeling_evil2.py | 414b3cf7a288eaa592b0f03d85c7a6960dbdb855fcb684478b9def9faa95c21d |
| 第一波 syscore.bin，约 33.8 MB | 587e3c3be3c75eb6586d69b25adb4c4208c1cf7d39157946da543dd823117adc |
| 第一波 sysx.bin，约 7.9 MB | b0e1ae6d73d656b203514f498b59cbcf29f067edf6fbd3803a3de7d21960848d |
| soumikmahato<br><br>／sysd-kit.tgz | 6b1e531c9e799a6df1472acc143c6eaec6ea4dd22f997458ba519644d125197e |
| soumikmahato<br><br>／configuration_parasit.py | 9d62179c94faf0c8eb86704973c218c229e92c71c0ed60a5e85d4bcc69c13f40 |
| soumikmahato<br><br>／modeling_parasit.py | 6a837d3042b9b8b6266c75b07e22ea8e7a7108083efa48ff0aedba7fa24fb57c |
| htt0118/qwen2-tiny<br><br>／modeling_evil6.py | 170ef5754bea51c3b05ae4b6c15c541ffa51d972bf8fe0bd3d1c3a19946bd6ac |
| wjsbg/qwen2-final<br><br>／modeling_qtz.py | 2cd9328715bbffb6b090a58de17222c830d910f5ec8198e3fefb0fca2f3e0ef0 |
| wjsbg/zh-assets<br><br>／m2.bin，35,702,840 字节 | 5dc4b927fb91442a66a2e02c1636f629d4042a03a5c1523cd841d6ece66e0beb |
| MENXIANGYU/qa-whl-1021<br><br>／e.sh | 849ce59ffb2ae55e4131111acd8a511444475639ba18515509310414b1661964 |

第二波矿机解包后的 ELF Build ID：

c492732de98117b7b28ce0e410f5966e1232e9dc

B.6 SolanaCry 指标

|     |     |
| --- | --- |
| 类型  | 指标  |
| 恶意仓库 | SolanaUpdateTools/solana-starter-kit |
| 下载地址 | developer-update\[.\]app/update/indicator |
| 恢复载荷 | indicator.ps1，<br><br>21,123,011 字节 |
| 载荷 SHA-256 | 41902d18fa2c285c0f4a6b39cf0f2eefbc7acbff33b6eb6fc88ba680a201d17d |
| 隐藏目录 | %LOCALAPPDATA%\\y2inwRnI6G |
| 主要文件 | client32.exe、client32.ini、PCICL32.DLL、remcmdstub.exe<br><br>等 |
| 控制端 | maxwintodaybtc\[.\]com:443 |
| 登录自启动 | HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run<br><br>，名称 SecureModule |
| 配置关联值 | RADIUSSecret=dgAAAPpMkI7ke494fKEQRUoablcA |
| 虚假提示 | developer functionality is temporarily paused due to load<br><br>；try again in 72 hours |

附录 C：只读排查命令

以下命令用于 Linux 主机初步核查，不会清除或修改任何文件。结果需结合进程树、网络日志和模型加载记录判断。

\# 检查 Shell 启动文件中的看门狗引用

grep -c "svc.py" /root/.bashrc /root/.profile ~/.bashrc 2>/dev/null

\# 检查代表性载荷目录

ls -la /tmp/.cch/ 2>/dev/null

\# 在进程命令行中查找共用矿池账号

grep -a "krxXJ2PKQW" /proc/\*/cmdline 2>/dev/null

\# 检查到主要反向 Shell／载荷端点的现有连接

ss -tnp | grep -E "212\\.32\\.253\\.3:(443|9443|8898)" 2>/dev/null

\# 检查第一波 SSH 公钥注释

grep "qx-5090-op" \\

/root/.ssh/authorized_keys \\

~/.ssh/authorized_keys \\

/home/xinference/.ssh/authorized_keys 2>/dev/null

Windows 侧可重点核查：PowerShell 与代理执行日志中是否出现上述仓库或域名、SecureModule 运行键、隐藏目录及非预期 NetSupport 组件。若确认执行过相关命令，应同时排查代理会话日志和开发者主机，而不是只清理 README 或仓库缓存。

参考链接

**1\. Pluto Security：Load/Mine—A Hugging Face Malware Campaign Returns After Takedown**  
https://pluto.security/blog/hugging-face-malware-campaign-load-mine/

**2\. BleepingComputer：Hugging Face malware campaign returns to hijack GPUs for crypto mining**  
https://www.bleepingcomputer.com/news/security/hugging-face-malware-campaign-returns-to-hijack-gpus-for-crypto-mining/

**3\. Air Security：SolanaCry—Malware in the wild steals crypto wallets from web-browsing AI agents**  
https://www.air.security/blog-posts/solanacry

**4\. Hugging Face Transformers：Custom models 与 trust_remote_code**  
https://huggingface.co/docs/transformers/en/models

**5\. Hugging Face Hub：Malware Scanning**  
https://huggingface.co/docs/hub/security-malware

**6\. Hugging Face Hub：Pickle Scanning**  
https://huggingface.co/docs/hub/security-pickle

**7\. MITRE ATT&CK：Enterprise Techniques**  
https://attack.mitre.org/techniques/enterprise/

**8\. 相关 GitHub 仓库页面：SolanaUpdateTools/solana-starter-kit**  
https://github.com/SolanaUpdateTools/solana-starter-kit

安全事件分析研判 · 目录
