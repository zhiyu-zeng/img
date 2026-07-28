---
title: 【AI安全】模型文件攻击面：从 Pickle 反序列化到 GGUF 模板注入-先知社区
source: https://xz.aliyun.com/news/92587
source_host: xz.aliyun.com
clip_date: 2026-07-28T16:23:43+08:00
trace_id: acdb5c5c-2d90-4ced-a639-23b212fad699
content_hash: 869bb8ca5b6f7d823fa7010d286359fd0a7c745568166070b56540456ca63519
status: synced
tags:
  - 漏洞分析
  - AI应用
series: null
feed_source: 先知安全技术社区
ai_summary: 模型文件中的Pickle对象描述与GGUF模板等非权重内容，可被反序列化或模板渲染转换为代码执行，构成供应链攻击面。
ai_summary_style: key-points
images_status:
  total: 37
  succeeded: 0
  failed_urls:
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005417-a3cadedf-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005418-a46558e7-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005419-a4bd3df3-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005419-a50f0736-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005420-a5b1fea9-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005421-a6666765-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005423-a718bc21-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005424-a7b18ad6-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005425-a86d17c8-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005425-a8c0da14-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005426-a903178e-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005426-a950446a-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005427-a990405a-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005427-a9cc42d6-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005428-aa0b0ec0-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005428-aa55d9f4-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005428-aa9a878c-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005429-aae863f2-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005430-ab423333-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005430-ab923cf2-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005431-abd9a6fc-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005431-ac1a52a8-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005431-ac530150-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005432-acd5f120-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005433-ad2551b9-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005434-adc6f8c8-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005435-ae951ac2-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005436-aefcbd95-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005436-af3d8c1e-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005437-af8159c6-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005437-afc1e066-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005437-aff9918a-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005438-b03cb0f6-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005439-b0a3f0de-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005439-b0eab0d8-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005440-b13a1c9f-8912-1.png
    - https://xzfile.aliyuncs.com/media/upload/picture/20260727005441-b1d7a76a-8912-1.png
notion_page_id: 3ab75244-d011-810a-bcca-fff67adcf191
ioc:
  cves:
    - CVE-2024-12029
    - CVE-2024-34359
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 模型文件中的Pickle对象描述与GGUF模板等非权重内容，可被反序列化或模板渲染转换为代码执行，构成供应链攻击面。
> 
> - **Pickle反序列化漏洞：** InvokeAI组件因torch.load处理恶意checkpoint时未有效拦截Suspicious状态，导致全局GLOBAL+REDUCE执行系统命令，影响5.3.1至5.4.2版本（CVE-2024-12029）。
> - **GGUF模板注入：** llama-cpp-python的Jinja2ChatFormatter使用无沙箱的jinja2.Environment，恶意GGUF文件的tokenizer.chat_template可访问Python内置对象并执行任意代码（CVE-2024-34359）。
> - **加载链缺陷：** 扫描器与加载器语义不一致，检查仅以infected_files判断而不拒绝Suspicious状态，造成fail-open；即使扫描通过，模板解释器仍保留过高的运行时能力。
> - **修复措施：** InvokeAI转为fail-closed策略，拒绝任何非Innocuous状态；llama-cpp-python替换为ImmutableSandboxedEnvironment阻断危险属性访问。
> - **通用防御：** 需对模型文件实施fail-closed准入、限制解释器能力（如仅需要张量时不恢复对象）、在隔离环境中首次加载并审计元数据。

本文内容仅供技术学习与交流使用，严禁用于任何非法用途。请遵守《中华人民共和国网络安全法》等相关法律法规，因违规使用产生的一切后果，由使用者自行承担，与作者无关。

引言

近期在整理模型安全相关漏洞时，我发现自己过去也习惯把

.ckpt

、

.pt

、

.gguf

这类文件理解为单纯的模型权重，只要来源可信、哈希一致，似乎就可以直接交给框架加载。但继续跟进加载链路后会发现，模型文件中还可能包含 Pickle 对象描述、metadata、chat template 等内容，它们经过反序列化或模板渲染后，会从“数据”变成能够影响宿主进程的执行语义。因此，个人围绕模型文件这一容易被忽略的攻击面进行了一些研究，并结合 InvokeAI 与 llama-cpp-python 的真实漏洞，从文件结构、产品调用链、漏洞触发和修复方式几个角度进行分析。如有理解不准确或遗漏的地方，欢迎批评指正。

一、模型文件攻击面概述

1.1 模型文件中的非权重内容

在模型加载场景中，真正被处理的通常不只有 Tensor。一个完整的模型工件还可能包含以下内容：

1

checkpoint 中用于恢复 Python 对象的 Pickle 数据；

2

GGUF、tokenizer 或配置文件中的 metadata；

3

用于组织对话消息的

tokenizer.chat_template

；

4

与模型一同分发的自定义 Python 代码、转换脚本和加载配置。

这些内容在磁盘上仍是普通字节或字符串，但它们与权重数据的安全属性并不相同。Tensor 通常只参与数值计算，而

对象描述、模板和代码会继续进入反序列化器、模板引擎或 Python import 等处理流程，造成新的攻击面

。

1.2 从数据到执行语义

模型文件刚下载到本地时通常只是静态字节，真正的风险出现在框架开始识别格式、解析容器、提取 metadata、恢复对象或编译模板之后。整个过程可以概括为下面这条链路：

![image.png](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005417-a3cadedf-8912-1.png)

因此，模型文件是否安全不能只根据扩展名判断。更关键的是：

文件中的哪些内容可以被外部控制，这些内容经过了什么转换，最终进入了哪个解释器，以及解释器具备哪些运行时能力。

后文分别分析两条不同的执行路径：

●

Pickle 对象描述 → Python Unpickler → callable 恢复 → 反序列化副作用

●

GGUF chat template → Jinja2 Formatter → 模板渲染 → 请求阶段副作用

二、Pickle 对象恢复攻击面

2.1 漏洞背景

|     |     |
| --- | --- | 
| 项目  | 信息  |
| 组件  | InvokeAI |
| 漏洞编号 | CVE-2024-12029 / GHSA-mcrp-whpw-jp68 |
| 影响版本 | 5.3.1<br><br>至<br><br>5.4.2 |
| 官方修复版本 | 5.4.3rc2<br><br>及以上 |
| 网络入口 | /api/v2/models/install |
| 漏洞类型 | 不可信数据反序列化 / RCE |

CVE-2024-12029 是一个影响 InvokeAI 的远程代码执行漏洞。该漏洞存在于 InvokeAI 的 5.3.1 至 5.4.2 版本中，通过 /api/v2/models/install API 进行利用。漏洞的根源在于使用 torch.load 反序列化模型文件时缺乏适当的验证，导致攻击者可以通过嵌入恶意代码的模型文件进行攻击。

2.2 执行机制

首先搞清楚两个机制：

1

对象恢复机制

Pickle 保存的不是纯数据，而是一组对象恢复指令；当反序列化器处理攻击者可控的 callable 与参数时，加载过程本身就可能产生副作用。checkpoint 从对象描述进入反序列化器并产生副作用的过程如下：

与安全相关的常见 opcode 包括：

|     |     |
| --- | --- | 
| Opcode | 作用  |
| GLOBAL | 解析模块中的全局函数或类 |
| STACK_GLOBAL | 从栈中组合模块名和对象名 |
| REDUCE | 使用 callable 与参数恢复对象 |
| NEWOBJ<br><br>/<br><br>NEWOBJ_EX | 构造对象 |
| BUILD | 恢复对象状态 |

我们可以构造一个只写入本地 marker 的最小样本：

显式启用完整 Pickle 语义进行加载：

执行后，我们可以看到

/tmp/invokeai_pickle_marker.txt

被创建。该结果说明副作用发生在 checkpoint 反序列化阶段，不依赖模型推理。

2

Checkpoint 内部结构

现代

torch.save()

通常生成 ZIP 容器，Tensor 数据与 Python 对象图分开保存：

其中

data.pkl

保存对象恢复描述。使用

pickletools

对其反汇编：

关键输出如下：

对应的 opcode 反汇编结果如下：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005419-a4bd3df3-8912-1.png)

GLOBAL \__builtin\_\_ exec

负责解析 callable，REDUCE 从栈中取出 callable 和参数元组，并执行

callable(\*args)

，对应语义为：

执行

torch.load()

后，可以看到 marker 在 checkpoint 反序列化阶段被创建：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005419-a50f0736-8912-1.png)

2.3 产品调用链

1

外部模型进入安装队列

/api/v2/models/install

接收外部

source

，并将普通 HTTP URL 转换为内部

URLModelSource

，随后进入下载与模型安装队列。

代码位置：

[](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/api/routers/model_manager.py)

[invokeai/app/api/routers/model_manager.py](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/api/routers/model_manager.py)

→

/api/v2/models/install

路由与

installer.heuristic_import()

调用

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005420-a5b1fea9-8912-1.png)

接口将

source

交给

installer.heuristic_import(source=source,...)

。在来源识别阶段，

\_guess_source()

依次判断本地路径、Hugging Face repo_id 和 HTTP URL；当输入匹配

^https?://...

时，构造

URLModelSource(url=Url(source))

。

代码位置：

[](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/services/model_install/model_install_default.py)

[invokeai/app/services/model_install/model_install_default.py](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/services/model_install/model_install_default.py)

→

ModelInstallService.\_guess_source()

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005421-a6666765-8912-1.png)

URL 被识别后，

\_import_from_url()

、

\_remote_files_from_source()

与

\_import_remote_model()

继续构造下载任务，最终通过

\_multifile_download()

/

submit_multifile_download()

将外部 checkpoint 拉取到本地安装目录。

代码位置：

[](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/services/model_install/model_install_default.py)

[invokeai/app/services/model_install/model_install_default.py](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/services/model_install/model_install_default.py)

→

\_import_from_url()

、

\_remote_files_from_source()

、

\_import_remote_model()

与

\_multifile_download()

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005423-a718bc21-8912-1.png)

将前述入口识别、远程下载和模型安装逻辑串联后，完整的 source-to-sink 路径如下：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005424-a7b18ad6-8912-1.png)

2

下载后的扫描与加载

旧版

\_scan_model()

只依据

infected_files

决定是否拒绝，扫描异常和

Suspicious

状态没有被纳入同等强度的准入判断。

模型下载完成后，安装流程进入

ModelProbe.\_scan_and_load_checkpoint()

。该函数先调用

\_scan_model()

，随后根据扫描结果决定是否进入

torch.load(model_path, map_location="cpu")

。

代码位置：

[](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/backend/model_manager/legacy_probe.py)

[invokeai/backend/model_manager/legacy_probe.py](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/backend/model_manager/legacy_probe.py)

→

ModelProbe.\_scan_and_load_checkpoint()

与

\_scan_model()

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005425-a86d17c8-8912-1.png)

同类判断也存在于

ModelLoadService.load_model_from_path

使用的加载路径中：

代码位置：

[](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/services/model_load/model_load_default.py)

[invokeai/app/services/model_load/model_load_default.py](https://github.com/invoke-ai/InvokeAI/blob/v5.4.2/invokeai/app/services/model_load/model_load_default.py)

→

ModelLoadService.load_model_from_path()

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005425-a8c0da14-8912-1.png)

旧版核心条件为：

但扫描结果至少包含以下三种状态：

旧版逻辑只看

infected_files

，因此可能把状态 B、C 与状态 A 混为一谈：

本文实际复现的是状态 C：扫描器成功解析样本，但命中的全局只达到

Suspicious

，因此

infected_files=0

、

scan_err=False

，旧版策略继续进入加载流程。

2.4 漏洞验证

2.4.1 根因复刻

1

构造 Payload

要穿过旧版判断，Payload 不能直接引用被 picklescan 标记为 Dangerous 的全局，而需要使用多个 Suspicious 全局动态恢复最终 callable。

exec

、

os.system

、

subprocess

、

builtins.getattr

、

operator.attrgetter

等直接出现在 Pickle GLOBAL 中时，会被扫描器归类为 Dangerous，并使

infected_files

增加。为了复现

infected_files=0

的放行路径，本文使用以下组合：

构造脚本使用可 pickle 的

Call

thunk 生成嵌套

REDUCE

，使顶层 func 本身也是前一层

REDUCE

的返回值，从而避免在 GLOBAL 中直接出现

os.system

：

2

验证扫描结果

首先，激活漏洞版本环境并生成 legacy checkpoint：

随后，使用真实

picklescan.scan_file_path

检查样本：

验证结果同时满足：

●

infected_files = 0

；

●

scan_err = False

；

●

suspicious_count = 3

；

●

三个 GLOBAL 均为 Suspicious。

这说明扫描器没有给出 Dangerous 结论，而旧版策略仍会把

infected_files=0

作为继续加载的依据。

3

对照准入策略

使用同一文件分别执行漏洞策略与参考 fail-closed 策略：

漏洞策略结果：

参考 fail-closed 策略结果：

同一输入在两种准入策略下的完整执行结果如下：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005426-a903178e-8912-1.png)

该实验将变量收敛到准入策略：扫描器返回相同结果，差异只在业务如何解释

Suspicious

。因此，

infected_files == 0

不能作为“扫描通过”的充分条件。

2.4.2 实测复现

|     |     |
| --- | --- | 
| 项目  | 配置  |
| InvokeAI | 5.4.2 |
| picklescan | 1.0.5 |
| PyTorch | 2.4.1 |
| 样本  | /tmp/evil_legacy.ckpt |
| 成功判据 | 外部 URL 被下载并进入安装流程，随后 marker 由 InvokeAI 服务进程创建 |

1

固定实验环境并记录样本基线：

首先确认 InvokeAI、picklescan 与 PyTorch 的版本，避免依赖差异改变 checkpoint 的实际加载行为。

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005426-a950446a-8912-1.png)

随后记录样本路径与 SHA256，并确认实验开始前 marker 文件不存在：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005427-a990405a-8912-1.png)

2

通过本地 HTTP 服务托管外部模型：

启动服务后，终端可以观察到 checkpoint 的访问请求：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005427-a9cc42d6-8912-1.png)

再访问本地目录，确认

evil_legacy.ckpt

已经能够通过 HTTP 正常获取：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005428-aa0b0ec0-8912-1.png)

3

使用全新的 root 目录启动 InvokeAI：

为避免数据库、缓存或已注册模型影响加载路径，清理并重新创建 root 目录后启动服务：

终端日志中可以确认当前版本、root 目录以及 Uvicorn 监听地址：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005428-aa55d9f4-8912-1.png)

服务启动后，再打开 InvokeAI 页面确认 Web 服务已经可以正常访问：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005428-aa9a878c-8912-1.png)

4

提交外部模型安装请求：

接口返回的任务对象中保留了外部

source.url

，说明该 URL 已经进入 InvokeAI 的模型安装任务：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005429-aae863f2-8912-1.png)

随后查看后台日志，

Queueing model install

、

File download started

、

Download complete

与

Model install started

表明 checkpoint 已经穿过下载队列并进入模型处理阶段：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005430-ab423333-8912-1.png)

5

检查 marker，确认副作用由实际安装链路触发：

watcher 检测到 marker 出现，并读取到 Payload 写入的内容：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005430-ab923cf2-8912-1.png)

6

危害提升--RCE执行：

为提供更直观的可视证据，复用同一

Call

thunk，把 shell 命令换成 macOS 自带计算器：在 payload 里把要执行的字符串从

echo CVE-2024-12029:...

改成同时做两件事的复合命令

echo CALC-PWNED:$(whoami) > /tmp/invokeai_pickle_marker.txt && open -a Calculator

。

open -a Calculator

走 macOS LaunchServices，在 GUI 会话里以当前用户身份拉起 Calculator.app；同时 marker 仍写入，作为机器可读的对照。这一行与上面的 CVE marker 是同一 payload 类、同一 pickle 链结构，只是末端字符串不同，

可以看到执行RCE成功

。

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005431-abd9a6fc-8912-1.png)

结合样本初始状态、接口响应和后台日志，可以还原完整链路：

本节与最小

torch.load

实验的区别在于：Payload 穿过了真实产品入口、下载队列与 picklescan 扫描，并在实际安装分支中进入

torch.load

。漏洞根因不是“完全没有扫描”，而是“扫描结果没有被作为确认安全的准入门槛”。

2.5 修复分析

1

官方修复逻辑

官方修复提交中的核心条件变化为：

同时将 checkpoint metadata 读取的默认行为由不扫描改为扫描：

从控制流角度看，策略由：

变为：

2

修复策略边界

前述根因复刻与端到端实验实际使用的是：

如果只分析公开 diff 中的

infected_files!= 0 or scan_err

，该条件并未直接表达“拒绝所有非 Innocuous 全局”：

因此，本文将

reject any non-Innocuous global

作为更严格的

参考准入策略

，而不直接将其表述为某个修复版本的完整产品行为。判断官方修复版本对该 Payload 的最终处置，还需要在相同依赖、相同样本和真实产品入口下进行版本回归测试。

从通用安全设计看，可靠策略应满足：

任何无法明确确认安全的扫描结果，都不应直接进入高能力反序列化器。

InvokeAI 这条链路的核心问题并不是完全缺少扫描，而是扫描结论没有成为进入

torch.load

前的确认安全条件。外部 checkpoint、扫描器与高能力反序列化器之间，只要仍存在 fail-open 的控制分支，模型内容就可能继续获得对象恢复能力。

三、GGUF 模板解释攻击面

3.1 漏洞背景

|     |     |
| --- | --- | 
| 项目  | 信息  |
| 组件  | llama-cpp-python |
| 漏洞编号 | CVE-2024-34359 / GHSA-56xg-wfcc-g829 |
| 影响版本 | 0.2.30<br><br>至<br><br>0.2.71 |
| 修复版本 | 0.2.72<br><br>及以上 |
| 攻击载体 | GGUF metadata 中的<br><br>tokenizer.chat_template |
| 漏洞类型 | Jinja2 SSTI / RCE |

llama-cpp-python 依赖于 llama.py 中的 Llama 类来加载.gguf llama.cpp 或延迟机器学习模型。Llama 类的

init

构造函数会加载多个参数，包括 NUMA、LoRa 设置、加载分词器和硬件设置等。此外，它还会从目标.gguf 的元数据中加载聊天模板，并进一步解析为 llama_chat_format.Jinja2ChatFormatter.to_chat_handler()，以构建此模型的 self.chat_handler。

然而，Jinja2ChatFormatter 在解析元数据中的聊天模板时，使用了没有沙箱的 jinja2.Environment，这在

call

中进一步渲染以构建交互提示。这允许通过精心构造的负载进行 Jinja2 服务器端模板注入，从而导致远程代码执行（RCE）。

3.2 执行机制

1

普通环境与沙箱环境对照

危险性不仅取决于模板内容，还取决于模板环境向不可信字符串暴露了哪些 Python 对象能力。

准备一个只写本地 marker 的模板：

在普通 Jinja2 环境中执行：

将同一模板交给不可变沙箱：

两种环境对同一模板的处理结果如下：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005431-ac1a52a8-8912-1.png)

普通环境允许模板沿

cycler.\__init\_\_.\__globals\_\_.\__builtins\_\_

访问 Python 内建对象并写入 marker；

ImmutableSandboxedEnvironment

在访问内部属性时抛出

SecurityError

，marker 不会生成。

2

真实 Formatter 验证

创建受影响版本环境：

使用 llama-cpp-python 自带 formatter 渲染同一模板：

运行后可以看到，真实

Jinja2ChatFormatter

同样触发了 marker：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005431-ac530150-8912-1.png)

该实验将 sink 从自写的

Environment().from_string()

推进到受影响组件真实使用的 formatter，说明模型模板在受影响版本中可以通过真实组件获得运行时能力。修复版本的对照结果将在第 3.5 节中统一验证。

3.3 产品调用链

GGUF 中的

tokenizer.chat_template

经 metadata 读取后进入

Jinja2ChatFormatter

，由

Environment.from_string()

编译，并在聊天请求到来时通过

render()

执行。先从整体上看，这条数据流如下：

![image.png](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005432-acd5f120-8912-1.png)

1

模型初始化时，框架首先读取 GGUF metadata：

代码位置：

[

llama_cpp/llama.py

](https://github.com/abetlen/llama-cpp-python/blob/v0.2.71/llama_cpp/llama.py)

：

→

Llama.\__init\_\_()

中的

self.\_model.metadata()

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005433-ad2551b9-8912-1.png)

2

当调用方未显式指定

chat_handler

或

chat_format

时，框架从

self.metadata\["tokenizer.chat_template"\]

取出模型自带模板，并将其传入

Jinja2ChatFormatter

：

代码位置：

[](https://github.com/abetlen/llama-cpp-python/blob/v0.2.71/llama_cpp/llama.py)

[llama_cpp/llama.py](https://github.com/abetlen/llama-cpp-python/blob/v0.2.71/llama_cpp/llama.py)

→

Llama.\__init\_\_()

中的 chat template 选择与 formatter 构造逻辑

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005434-adc6f8c8-8912-1.png)

3

受影响版本的 formatter 使用普通 Jinja2 环境编译模板，因此该字符串最终获得了对象访问与模板执行能力：

代码位置：

[](https://github.com/abetlen/llama-cpp-python/blob/v0.2.71/llama_cpp/llama_chat_format.py)

[llama_cpp/llama_chat_format.py](https://github.com/abetlen/llama-cpp-python/blob/v0.2.71/llama_cpp/llama_chat_format.py)

→

Jinja2ChatFormatter.\__init\_\_()

与

to_chat_handler()

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005435-ae951ac2-8912-1.png)

将这三个阶段串联后，最终调用链如下：

该漏洞具有延迟触发特征：模型可以正常加载、服务也可以正常启动，直到请求进入 Chat Completion 路径，模板才真正被渲染。

3.4 漏洞验证

3.4.1 根因复刻

1

定位目标字段

实验仅修改 GGUF metadata 中的

tokenizer.chat_template

，不重新训练、不重打包模型，也不改变 Tensor 区域。

选择一个包含

tokenizer.chat_template

的有效 GGUF 聊天模型，首先记录原始文件哈希：

解析文件结构，定位 metadata 与 Tensor 起始位置：

解析结果中可以直接定位模板字段的偏移、长度以及 Tensor 区域起点：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005436-aefcbd95-8912-1.png)

关键字段包括：

●

tensor_data_start=0x1a1580

：Tensor 区域起点；

●

value_data_offset=0x19e534

：模板内容起始位置；

●

value_data_length=410

：原字段可用容量。

2

替换模板内容

配套脚本执行以下操作：

1

校验 GGUF magic 与版本；

2

遍历 metadata KV；

3

定位

tokenizer.chat_template

；

4

将新模板写入原有字段；

5

使用空格填充剩余容量；

6

保持文件长度和后续 Tensor 偏移不变。

执行命令：

修改结果：

执行等长覆盖后，文件总长度保持不变，变化范围也被限制在目标 metadata 字段内：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005436-af3d8c1e-8912-1.png)

injected_size

与

base_size

一致，实际变化范围集中在

0x19e534-0x19e6ce

，说明写入未改变文件整体长度。

3

验证 Tensor 完整性

记录文件整体信息：

运行校验脚本：

结果如下：

校验结果显示两个文件的 Tensor 起始位置和 Tensor 区域哈希完全一致：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005437-af8159c6-8912-1.png)

same_tensor_offset=True

、

tensor_region_sha256_equal=True

与

only_metadata_changed=True

共同证明：修改只发生在目标 metadata 字段，模型 Tensor 区域保持不变。

最后 dump

injected.gguf

中的目标字段，确认新模板已经写入正确位置：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005437-afc1e066-8912-1.png)

3.4.2 实测复现

|     |     |
| --- | --- | 
| 项目  | 配置  |
| llama-cpp-python | 0.2.71 |
| 模型文件 | injected.gguf |
| 触发入口 | /v1/chat/completions |
| 成功判据 | server 从 GGUF 读取模板，聊天请求触发 render，marker 被创建 |

1

确认版本并启动 server：

版本确认与服务启动结果如下：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005437-aff9918a-8912-1.png)

2

查看启动日志，确认 server 已从 GGUF metadata 读取注入模板：

日志中可以直接看到模型自带的

tokenizer.chat_template

被选作当前聊天模板：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005438-b03cb0f6-8912-1.png)

3

发送普通 Chat Completion 请求并检查 marker：

请求内容本身没有特殊攻击语义，只负责触发服务端按照模型自带模板构造 Prompt。请求返回后 marker 出现，完整数据流为：

实际请求与 marker 结果如下，

恶意 GGUF 文件中的

tokenizer.chat_template

已在真实聊天请求过程中被 Jinja2 执行，并成功以服务进程权限写入本地文件

：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005439-b0a3f0de-8912-1.png)

3.5 修复分析

1

修复版本回归验证

在

0.2.72

中加载同一个

injected.gguf

，使用同一接口与请求进行复测。首先确认当前环境已经切换到修复版本：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005439-b0eab0d8-8912-1.png)

修复版本返回模板安全错误，且 marker 不存在：

再次发送相同请求后，服务返回

SecurityError

，同时 marker 文件仍然不存在：

![](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005440-b13a1c9f-8912-1.png)

该对照固定了输入文件与触发入口，变化只在模板解释器环境：0.2.71 使用普通环境并产生副作用，0.2.72 在危险属性访问阶段阻断。

2

补丁变化

官方修复将普通 Jinja2 环境替换为不可变沙箱：

补丁前后的解释器能力差异如下：

![image.png](⚠️ https://xzfile.aliyuncs.com/media/upload/picture/20260727005441-b1d7a76a-8912-1.png)

修复没有继续堆叠危险字符串黑名单，而是直接限制模板可访问的运行时对象。这样能够阻断

\__init\_\_

、

\__globals\_\_

等内部属性链，也避免简单字符串变形绕过单点关键词过滤。

但沙箱不等于绝对安全：

1

复杂循环和大规模输出仍可能造成资源消耗；

2

自定义 filter、global 或 helper 可能重新暴露危险对象；

3

模板引擎与沙箱实现本身仍需要持续升级；

4

如果业务不需要接受模型自带模板，应优先使用平台内置模板或严格语法白名单。

四、模型文件攻击面的共性

4.1 两类攻击面的差异

|     |     |     |
| --- | --- | --- |  
| 维度  | InvokeAI / Pickle | llama-cpp-python / GGUF |
| 文件载体 | .pt<br><br>、<br><br>.pth<br><br>、<br><br>.ckpt | .gguf |
| 可控内容 | Pickle opcode 与对象恢复描述 | metadata 中的 Jinja 模板 |
| 解释器 | Python Unpickler | Jinja2 Environment |
| 触发阶段 | checkpoint 加载 / metadata 恢复 | Chat Prompt 构造 |
| 危险 sink | GLOBAL<br><br>+<br><br>REDUCE<br><br>/<br><br>torch.load | from_string()<br><br>+<br><br>render() |
| 核心缺陷 | 扫描结果处置 fail-open | 不可信模板进入普通环境 |
| 修复方向 | fail closed、拒绝非确认安全状态 | 使用受限沙箱环境 |

两个案例最终都可以归纳为：

区别只在于：Pickle 直接描述对象恢复操作；GGUF 则通过 metadata 将模板程序交给上层 Jinja2 解释器。

4.2 数据获得执行语义的条件

虽然 Pickle 与 GGUF 的格式和触发阶段不同，但模型内容获得执行语义通常需要同时满足三个条件：

1

内容可控。

攻击者能够控制模型文件中的对象描述、metadata、模板或配套配置；

2

解释路径成立。

上层框架会自动解析这些内容，并将其转换为对象恢复指令、模板程序或动态加载参数；

3

解释器具备副作用能力。

反序列化器、模板环境或运行时暴露的能力超过业务实际需要，且调用链能够在真实产品入口下到达该位置。

其中任何一个条件被切断，攻击链都无法完整成立。

4.3 安全边界失效的原因

两个案例中的安全边界失效方式并不完全相同，但根因主要集中在以下几类问题：

1

检查器与加载器的语义范围不一致。

检查器没有覆盖加载器支持的全部对象、格式或语法，却仍允许文件进入后续加载；

2

非安全状态被按成功处理。

扫描异常、无法确认或仅判定为 Suspicious 时，业务继续调用高能力加载函数；

3

解释器能力超过业务需要。

模板只需要完成 Prompt 拼接，却能够访问 Python 内部对象；

4

框架默认将上游模型工件视为可信。

框架自动采用模型自带的对象描述或模板，缺少独立的准入与隔离边界。

从调用链角度看，可以用

Source → Transform → Sink → Policy

对问题进行定位：Source 是模型中的外部可控字段，Transform 是解析或转换过程，Sink 是最终解释器，Policy 则决定异常或可疑状态是否继续执行。本文两个案例的差异，主要就出现在 Sink 的能力与 Policy 的处置方式上。

五、防御建议

1

默认采用 Fail-closed 策略

以下状态不应直接进入生产加载：

●

明确发现危险对象或模板；

●

文件格式无法识别；

●

扫描器异常退出；

●

扫描器只支持文件的一部分结构；

●

检查器与加载器使用不同解析规则；

●

扫描结果只能落到 Suspicious，而无法确认 Innocuous。

scan_err

不是低优先级日志，

Suspicious

也不等于 clean。无法明确确认安全时，应进入人工复核或隔离试加载。

2

限制解释器能力

如果业务只需要 Tensor，就不应启用完整 Pickle 对象恢复；如果业务只需要将消息拼接为 Prompt，就不应允许模板访问 Python 内部对象。

优先策略包括：

●

对不可信 checkpoint 使用受限加载模式或安全格式；

●

不在加载失败后自动回退到

weights_only=False

；

●

对模型自带模板使用沙箱、语法白名单或平台内置模板；

●

禁止模型 metadata 决定服务端动态导入与执行逻辑。

3

隔离首次加载环境

外部模型的首次加载建议在一次性环境中完成：

●

使用非 root 用户；

●

不注入云 AK/SK、数据库连接串和 SSH Key；

●

默认阻断公网与内网出站；

●

使用只读根文件系统；

●

不挂载 Docker Socket 与宿主敏感目录；

●

限制 CPU、内存、进程数和执行时间；

●

记录文件访问、子进程创建与网络连接。

●

实施仓库级准入

一个模型仓库可能同时包含：

只扫描

.pt

或

.gguf

会遗漏配置、模板和自定义代码风险。准入记录至少应包含来源、版本、commit、文件清单、SHA256、转换工具、依赖环境和最终签名。

六、结语

通过这两个案例可以看到，模型文件并不只是存放权重的容器。一旦上层框架赋予这些内容对象恢复或模板执行能力，模型工件本身就可能成为代码执行链的一部分。

因此，在分析模型文件安全时，不能只关注文件后缀或 Tensor 是否被篡改，还需要沿加载链路继续确认：哪些字段来自外部、经过了哪些解释过程、最终调用了什么运行时能力，以及检查器无法确认安全时系统是否仍会继续加载。对于企业模型供应链而言，外部模型更适合被视为第三方软件工件，经过扫描、隔离加载、行为审计和可信分发后再进入生产环境。

七、参考资料

1

InvokeAI 安全公告：GHSA-mcrp-whpw-jp68：

[

https://github.com/advisories/GHSA-mcrp-whpw-jp68

](https://github.com/advisories/GHSA-mcrp-whpw-jp68)

2

InvokeAI 修复提交：完善 checkpoint 扫描失败处理：

[

https://github.com/invoke-ai/invokeai/commit/756008dc5899081c5aa51e5bd8f24c1b3975a59e

](https://github.com/invoke-ai/invokeai/commit/756008dc5899081c5aa51e5bd8f24c1b3975a59e)

3

PyTorch 官方文档

torch.load

：

[

https://docs.pytorch.org/docs/stable/generated/torch.load.html

](https://docs.pytorch.org/docs/stable/generated/torch.load.html)

4

Serialization semantics：

[

https://docs.pytorch.org/docs/stable/notes/serialization.html

](https://docs.pytorch.org/docs/stable/notes/serialization.html)

5

llama-cpp-python 安全公告：GHSA-56xg-wfcc-g829：

[

https://github.com/abetlen/llama-cpp-python/security/advisories/GHSA-56xg-wfcc-g829

](https://github.com/abetlen/llama-cpp-python/security/advisories/GHSA-56xg-wfcc-g829)

6

llama-cpp-python 修复提交：

[

https://github.com/abetlen/llama-cpp-python/commit/b454f40a9a1787b2b5659cd2cb00819d983185df

](https://github.com/abetlen/llama-cpp-python/commit/b454f40a9a1787b2b5659cd2cb00819d983185df)

7

Jinja2 官方文档：SandboxedEnvironment：

[

https://jinja.palletsprojects.com/en/stable/sandbox/

](https://jinja.palletsprojects.com/en/stable/sandbox/)
