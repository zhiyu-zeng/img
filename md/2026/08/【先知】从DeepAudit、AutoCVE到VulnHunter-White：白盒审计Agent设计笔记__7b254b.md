---
title: 【先知】从DeepAudit、AutoCVE到VulnHunter-White：白盒审计Agent设计笔记
source: https://xz.aliyun.com/news/92732
source_host: xz.aliyun.com
clip_date: 2026-08-27T15:31:33+08:00
trace_id: 66ab2599-fe24-4b43-a47b-06e281095531
content_hash: c513449b915e459ee818dfcb7f14269c9bfbd61912812f8d10c1cc5a86c5af30
status: synced
tags:
  - 先知
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: 先知安全技术社区
ai_summary: "TL;DR: 白盒审计Agent要解决覆盖式挖掘、动态验证与LLM不可靠三大问题，VulnHunter-White给出从侦察到攻击链串联的完整实现。"
ai_summary_style: key-points
images_status:
  total: 35
  succeeded: 35
  failed_urls: []
notion_page_id: 3c975244-d011-8127-ab67-cd0dba901069
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR: 白盒审计Agent要解决覆盖式挖掘、动态验证与LLM不可靠三大问题，VulnHunter-White给出从侦察到攻击链串联的完整实现。
> 
> - **框架参考：** DeepAudit用Orchestrator Agent调度recon/analysis/verification子Agent，验证采用Fuzzing Harness抽函数加沙箱mock；AutoCVE改用代码流水线编排，工具集分ToolRegistry/ToolOrchestrator/StreamingToolExecutor三层，Finding阶段设多触发条件逼LLM继续；二者共用角色拆分、工具边界、结构化产物等原则。
> - **覆盖式设计：** 侦察阶段先落代码地图与鉴权文档，再对全部源码定权（权重100/过滤器/Service等），挖掘时按权重逐文件注入，保证全量覆盖；另有历史漏洞绕过、Sink扫描快速挖掘两种模式，挖掘结果经Docker靶场、局部Mock、纯静态三级审核。
> - **容错机制：** 检查点落盘续跑、超时/429抢救Conclude、上下文85%压缩、看门狗催工具调用与防死循环、审核打回上限为1等机制，均是对“LLM不可靠”的工程化解法。
> - **实战结果：** 在Java/Python的低代码平台、AI网关、网盘、博客等项目中，每项目产出3-40个漏洞，多为XSS/SSRF/越权，token消耗约1亿-10亿；不足包括不能docker内套docker、只测官方模型商、历史漏洞覆盖无硬保障。

## 1\. 前言

LLM白盒审计已经从“把仓库丢进对话框”走到“多角色流水线 + 工具 + 验证”。网上有不少开源实现，比如DeepAudit和AutoCVE，我做VulnHunter-White（以下简称本项目）时，也从这两个项目中学习了很多。在写项目时，虽然这两个项目提供了经过验证的高效框架，且提供了技术文档，但是在自己做时，还是遇到了不少坑。于是准备写一份笔记，把白盒Agent设计中的要点一一说明，同时介绍本项目在漏洞挖掘上的一些创新。

总结一下本文目标：

1、简要介绍本项目的功能

2、从DeepAudit、AutoCVE，以及我自己的VulnHunter-White中，总结白盒Agent设计中的一些要点/坑点，并给出我自己的解决方案

3、详细介绍本项目的设计思路，具体的创新点，以及为什么想到这样设计

项目仓库： [https://github.com/1diot9/VulnHunter-White](https://github.com/1diot9/VulnHunter-White)

让我们开始吧。

## 2\. 功能简介

VulnHunter-White的特点是，支持三种挖掘模式，通过docker动态验证漏洞，并允许测试互联网目标，且最终会对挖掘到的漏洞进行攻击链串联。

创建任务页面如下，允许通过github链接或上传zip开始审计：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/93950cf9aab0ecaf.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7643370ecb3a1d4a.png)

任务详情页面如下，支持SSE实时日志，查看每轮的阶段报告，对项目进行动态配置修改等：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e40c14bbbf960eb8.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9b63d27c23b78b5e.png)

互联网验证确认页面如下，允许用户对可能产生危害的漏洞进行人工干预，实现Human in Loop：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6df0f7fd402813b7.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0ee34a680b5dab88.webp)

漏洞产出页面如下，对漏洞进行详细打标，包括验证形式（静态、动态、局部），权限（前台、后台），互联网复现情况：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a8679fff10eb2120.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/734a1e609ae8fbc1.png)

容器管理页面，可监测项目在动态复现时，启动了哪些容器：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/66ff97dd34588db2.png)

设置页面，支持Chat Completions和Anthropic Message格式，支持添加自定义挖掘提示词用于限定漏洞种类，支持清理日志：（当前模型商只测试过GLM、DeepSeek、百炼）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/36ea237c1e76b8bc.png)

## 3\. 白盒Agent设计共性

这一节先简要分析DeepAudit和AutoCVE两个项目的设计框架，然后简要概括白盒Agent的共性。具体共性的体现，会在后面介绍本项目设计时讲述。

## 3.1 DeepAudit

DeepAudit是年初时发布的一个项目，当时正值Agent火热发展时期，Opus4.6的出现让大家对Agent挖掘漏洞有了更强的信心。

其工作流如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b7619372a06ffd31.png)

特点是由Agent进行任务编排，Recon、Analysis、Verification三个Agent负责工作，对漏洞进行挖掘，最终再由代码生成报告。

这里的任务编排也是由Agent操控的，而不是通过代码流水线和状态机去管理任务。可以说，主Agent只有Orchestrator，其余都是可供调用的子Agent。

Orchestrator每轮只能选三个动作之一：

-   `dispatch_agent` ：调度 `recon` / `analysis` / `verification` ，并带上任务描述和上下文
-   `summarize` ：汇总当前发现
-   `finish` ：结束审计

这里把任务管理下放给了Agent，好处是工作流灵活，可以根据审计情况动态调整策略。

另外这里很有意思的一个点是，漏洞验证采用了局部动态验证的方式。当分析Agent确认漏洞后，其动态验证不是拉起整个项目，而是从代码中把可疑函数抽离出来，并在沙箱里跑一份带mock的局部可执行测试，DeepAudit把这种方式叫做Fuzzing Harness。

这里举一个案例来说明这种验证方法是如何生效的。

有以下漏洞代码：

```python
import os
from flask import request, jsonify
def create_backup(filename):
    """创建备份文件"""
    # 危险：直接将用户输入传递给系统命令
    backup_path = f"/backups/{filename}.tar.gz"
    cmd = f"tar -czf {backup_path} /data/"
    os.system(cmd)  # 命令注入风险
    return backup_path
def backup_api():
    filename = request.json.get("filename")
    path = create_backup(filename)
    return jsonify({"path": path})
```

验证Agent会调用extract_function抽出函数以及顶部import，对于Python会用AST，工具返回的结果大致如下：

```python
函数提取结果
文件: app/utils/backup.py
函数: create_backup
相关 imports:
import os
from flask import request, jsonify
参数: filename
函数代码:
def create_backup(filename):
    """创建备份文件"""
    # 危险：直接将用户输入传递给系统命令
    backup_path = f"/backups/{filename}.tar.gz"
    cmd = f"tar -czf {backup_path} /data/"
    os.system(cmd)  # 命令注入风险
    return backup_path
---
你现在可以使用这段代码构建 Fuzzing Harness
```

接着，验证Agent会按照run_code.py里的模板包一层mock和payload，而上面抽出来的那段函数会在里面作为主要业务，并在沙箱里跑：

```python
import os

# ---------- 壳：项目模板加的，用来观察 sink 是否被调用 ----------
executed_commands = []

def mock_system(cmd):
    print(f"[DETECTED] os.system called: {cmd}")
    executed_commands.append(cmd)
    return 0

os.system = mock_system

# ---------- 核：从 app/utils/backup.py 原样粘贴 ----------
def create_backup(filename):
    """创建备份文件"""
    # 危险：直接将用户输入传递给系统命令
    backup_path = f"/backups/{filename}.tar.gz"
    cmd = f"tar -czf {backup_path} /data/"
    os.system(cmd)  # 命令注入风险
    return backup_path

# ---------- 壳：驱动入口参数，相当于伪造 HTTP 传来的 filename ----------
payloads = [
    "daily",          # 正常输入
    "daily; id",      # 命令连接
    "daily | whoami",
    "daily$(id)",
]

print("=== Fuzzing Start ===")
for payload in payloads:
    print(f"\nPayload: {payload!r}")
    executed_commands.clear()
    create_backup(payload)
    if executed_commands:
        cmd = executed_commands[0]
        print(f"[SINK] {cmd}")
        if any(tok in cmd for tok in (";", "|", "$(", "`")):
            print("[VULN] filename 已被拼进 shell 命令")
```

当payload为"daily; id"时，沙箱最后输出类似：

```python
Payload: 'daily; id'
[DETECTED] os.system called: tar -czf /backups/daily; id.tar.gz /data/
[SINK] tar -czf /backups/daily; id.tar.gz /data/
[VULN] filename 已被拼进 shell 命令
```

这种抽出局部代码，而不完整启动项目的方式在成本和准确性之间取了平衡，即做到了一定程度的动态验证，也使得整个项目更加轻便。

然而，局部验证和线上能打还是有区别的。这里没有判断是否真的可以从HTTP入口等数据输入点打到危险函数，也没有判断前面是否有鉴权阻拦。同时，由于动态验证由mock实现，所以mock的保真度直接决定验证准确率。而且由于是依靠"python3 -c '...'"，"php -r"等方式将代码挂载到沙箱执行，若PoC较为复杂，比如反序列化链，大概率会验证失败，让漏洞降级成“likely”。另外，像Java反序列化这种依赖classpath的漏洞，直接就没法验证了。

## 3.2 AutoCVE

此项目的定位是自动化出洞系统，人如其名，特色功能只要点击一个按钮就会开始24h挖洞，直到满足漏洞数量。

其架构总览如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/58c4e4f590c0ca93.png)

简化版：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5dd4198cc7c0991d.png)

不过这里的Orchestrator其实并不是Agent驱动，而是一段固定的代码流程。虽然代码里有提示词，但实际上并没有使用：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a7e61db14868890f.png)

而是直接对审计任务调用各子阶段：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fff22f4b0749aab5.png)

我觉得这里比较有特色的是工具集的设计，还有Finding阶段的Continue和Terminal节点条件。

工具编排方面，这里采取了三层框架，ToolRegistry、ToolOrchestrator、StreamingToolExecutor

ToolRegistry负责统一注册工具，管理工具的开关状态，工具的激活状态等。这里按角色启用工具，以及动态提供工具的想法不错。

ToolOrchestrator是工具调用的入口，负责接收LLM返回的工具调用，并进行权限检查、hook等操作。

StreamingToolExecutor负责一轮返回多个工具调用时的执行顺序，比如read等安全的只读工具可以并发进行，而Write、Shell等会产生影响的工具，则串行执行。

接下来看看Finding阶段。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7eb5f1fe727b2dff.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c350011caa729d73.png)

这里的重点在于，设置了多个触发条件，每个触发条件有各自的返回，从多个角度提醒LLM继续工作，而不是依靠LLM的自觉来决定是继续审计还是结束任务。且所有产物都通过调用工具格式化提交，这样方便后续进行处理。

另外，AutoCVE还有一个Nudge机制，这里我理解为一种容错和恢复机制，这个留到后面再讲。

## 3.3 设计共性

总结一下白盒Agent的设计共性，为下一节铺垫。

1、角色拆分。由于白盒审计上下文一般很长，且各部分的任务不一样，所以往往要拆分成多个角色。一般的角色有编排器、侦察器、挖掘器、验证器。

2、工具要有边界。第一是不同的角色有特化工具集，防止在不必要的阶段调用不必要的工具。第二是工具要做权限设置，通过hook等手段，限制工具能力边界，比如shell不允许rm项目自身，read限制在工作区内。

3、审计流程安排。上面一般是根据扫描器结果，或由Agent自身决定下一处的挖掘点。而VulnHunter-White是根据文件权重进行挖掘，这样能确保全量覆盖项目，且对不同的文件用不同的策略，下面会讲。

4、项目状态谁来管。审计任务的结束，是由Agent调用工具决定，还是有落盘文件或写库这类状态机决定？

5、把LLM当作不可靠组件。LLM可能返回畸形的工具调用，多轮调用完全一样的工具，多轮不调用工具，各种模型商报错。

6、产物要结构化。结构化的产物即方便代码判定，也降低人工审查成本。

## 4\. VulnHunter-White设计分析

先讲一下一些总体设计方面的，比如工具集、编排策略等。

然后采用从创建一个审计项目，到项目审计完成的顺序讲，把每个阶段设计时考虑了什么都尽量讲清楚。

这里的场景是从github创建项目。

## 4.1 工具集

这里只展示通用工具集，具体角色对应的工具会在介绍每个角色时展示。

通用工具

|     |     |
| --- | --- | 
| 工具  | 用途  |
| Read | 读取单个或多个文件内容 |
| Glob | 按模式列出文件 |
| Grep | 搜索代码片段、关键字、函数、危险调用 |
| Write | 写入审计过程中的产物或辅助材料 |
| Bash | 在允许时执行 shell 命令 |
| PowerShell | 在允许时执行 PowerShell 命令 |
| TodoWrite | 维护运行时待办，每50轮自动注入上下文，压缩后自动注入 |

运行时 Bash 与 PowerShell 只注入本机原生的那一个。定权、Sink 筛选没有这套通用工具。

## 4.2 编排策略与状态管理

这里使用代码进行总编排。阶段状态一般由Agent决定，通过调用工具的方式进行状态流转。但也有代码决定，比如侦察阶段的鉴权，就是通过检测文档落盘决定；启发式挖掘时，Agent只能结束单轮，完全结束依赖所有定权文件审计完毕，这是由代码决定的。

一般情况都可以由Agent自行决定状态，但是有一些情况不行。比如希望做到全覆盖，那就要考虑到LLM偷懒的情况，所以需要通过代码+Agent方式对项目状态做约束。

## 4.3 容错与恢复机制

检查点与续跑

1、检查点落在 workspace/checkpoints/，保存消息、看门狗和限流计数；暂停或进程中断后按原上下文续跑。改挖掘模式或验证方式会丢弃对应检查点，续跑后按新规则新开。检查点文件就是实时记录当前轮的每一次对话和返回。

2、超时、429 用尽或死循环退出前先 Conclude 抢救（默认1800s），总结落到 docs/summaries/{phase}-resuce，下一轮注入后续跑，确保单轮失败后进度不丢失。普通阶段最多再开 2 次，侦察最多 8 次（对应侦察里的四个小阶段）。Conclude选取最近100轮消息，对每轮消息进行截断，并注入TodoList后再摘要，最后摘要完再额外写入完整TodoList，确保失败后能尽可能恢复进度。

抢救摘要：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2f03b07f0448b32f.png)

3、请求超过上下文窗口 85% 时主动压缩，新开上下文并注入Conclude；启发式再注入最近最多 10 轮摘要（指启发式挖掘的worker-round-N.md，用于记录前几轮挖掘尝试过了什么），TodoList 压缩时强制保留。Worker 认领超过约 7200s 视为过期，可被回收另派。

worker-round-N.md：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/87ce232687a2e003.png)

超时与限流

4、各阶段有墙钟超时：侦察 3600s，盖章轮 1800s，Worker 一轮 7200s，审核静态 1800s，靶场动态再加 Docker 1800s，Verifier / 攻击链 / Semgrep / Sink 筛选各 1800s。每个阶段最多超时两次，此后直接抢救落盘，并保留基本产出。比如审核会默认“仅静态”验证，不自动遗弃报告。

5、LLM 429 休眠 90s 再试，最多 20 次，并有进程级全局共享冷却；其它瞬时请求失败最多退避 3 次。全局 LLM 线程上限默认 6，满了按到达顺序排队。

工具执行容错

6、工具调用失败把 error 回给模型继续改，本地执行失败另记 tool-exec-errors.jsonl。上一轮工具已调用但失败时，下一轮纯文字不当成没调工具，改为提醒按错误改参数或换工具，不要原样重试。

7、shell命令默认 120s、最多 180s，另有硬超时把卡住的调用打回失败。出站 HTTP / Chat 代理连不上时自动改走直连。

看门狗提醒

8、无工具调用的纯文字轮立刻提醒改用工具（各阶段文案不同），有一次真工具调用后连续无工具计数清零。门闩满足后系统自己结束本轮。因为LLM不调用工具，就没法获取额外信息，这一轮就没有进展。

9、连续 4 次同一工具且参数不变则拦截本次不执行，返回错误并重置窗口。同一轮这种死循环窗口触达 5 次则判定死循环并终止本轮。

10、历史漏洞落盘 / 补漏连续 50 轮未 WriteOldVuln、扩展名连续 50 轮未 AddSourceExt 则催立刻落盘；之后每再空闲 50 轮再催。代码地图 / 鉴权轮不催落盘。

11、启发式连续 50 轮未 FinishFile、快速扫描未 FinishSink、绕过未 FinishBypass、Sink 筛选未 FinishSinkTriage 则催收工；对应工具清零计数，Read / Grep 不算。CLI 静默索引连续 8 轮未 FinishIndex 就催落盘描述。

审核与验证闸门

12、同一条待审漏洞连续超时 2 轮后，下一轮强制仅静态审核，并隐藏Shell工具、RunCode、CollectLabFingerprints。打回上限为 1，超过直接标误报。

13、SubmitVuln / ConfirmVuln 碰到同文件同类型或同根因时先软提醒；本会话被提醒过一次后，再带 confirm_not_duplicate 才放行。

14、局部验证沙箱不可用或 mock 失败不因此误报，静态已能证明则可 static_only 确认。Verifier 遇到破坏性复测会 AskUser 挂起该项，在「验证确认」页等待指示，不阻塞项目完成。

## 4.4 侦察阶段

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/621d0f802b3c2688.png)

### 4.4.1 代码地图与鉴权

侦察 · 代码地图/鉴权（recon）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| MarkSource | 标记用户可控入口，自动权重 100 |
| FinishReconMap | 仅地图重跑：写回代码地图与鉴权文档后结束会话 |

要对一个项目有全局观，我认为至少需要落地两个文件。一个是代码地图，用于总览项目结构，一个是鉴权分析，把握应用的权限体制。

代码地图有以下要点：项目概述、技术栈、模块划分、HTTP入口、非HTTP入口、关键依赖

项目概述用来了解定位，不同定位的项目有不同的侧重点，比如网关类要着重看鉴权和越权，任务下发平台要看任务管理机制等。

技术栈用来了解项目的整体架构，明确要审计什么语言。

模块划分用来确定业务要点，建立功能视角。

HTTP入口确定接口的一般形式，非HTTP入口，如WebSocket / RPC / MQ 消费 / 回调 / 执行器开放接口 用来补漏，防止错过source。

关键依赖关注有无漏洞依赖，从而确定审计时额外需要关注的方法。

鉴权就不用说了，直接决定能否把后台洞升级成前台洞。同时在鉴权时明确角色和资源，对后续挖掘越权漏洞也有帮助。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1ed75e8bca3be6ef.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9608a4920555e3b5.png)

### 4.4.2 扩展名

侦察 · 扩展名（recon_source_ext）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| AddSourceExt | 把默认未入库的执行面文件补进索引 |

生成代码地图和鉴权文档后，Agent会据此补充需要进行审计的文件的扩展名。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7a60f91cbba52930.png)

### 4.4.3 历史漏洞收集

侦察 · 历史漏洞爬虫落盘（recon_old_vuln）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| WriteOldVuln | 逐条写入历史漏洞文档并更新索引 |
| SearchOldVuln | 查已落盘条目，避免重复写 |

本轮禁止 WebSearch，也不读源码。只运行爬虫，然后由Agent对结果进行整理。

侦察 · 历史漏洞搜索补漏（recon_old_vuln_ghsa）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| WebSearch | 按本项目产品名补搜公开 CVE / 公告 |
| SearchGHSA | 公开公告不足时查 GitHub Advisories |
| SearchGitHubIssues | 搜索本仓库未关闭 Issues，作为未修复洞来源 |
| WriteOldVuln | 补漏命中立刻落盘 |
| SearchOldVuln | 查已落盘条目，避免重复收录 |

我在挖掘漏洞时，往往会先复现分析历史漏洞，并尝试对历史漏洞进行绕过，无果后才开始挖掘新漏洞。所以在这里添加了历史漏洞收集的功能。

首先是通过爬虫收集GHSA和Issue里的漏洞，并由Agent做整理并写入，接着再由Agent调用网络搜索，进行补漏。收集到的漏洞分两种，一种是已经修复的，一种是未修复的。已经修复的用来进行绕过尝试，未修复的一般是github Issue里的，用于进行漏洞挖掘去重，防止挖到和别人一样的。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3045a544572b68ab.png)

### 4.4.4 文件定权

侦察 · 文件定权（recon_mark）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| MarkSource | 标记用户可控入口，自动权重 100 |
| MarkWeight | 给文件打 0–100 审计权重 |
| MarkSkip | 跳过测试 / 生成代码等文件 |

这里主要是为了覆盖率。传统白盒Agent审计时，要么依靠工具扫描得到的结果审计，要么自由审计，没有硬性规定覆盖所有文件。

这里采取的方式是，给特定扩展名的所有文件都进行定权，定权大致可以分成以下几种：

|     |     |
| --- | --- | 
| 角色  | 方向  |
| 权重 100 / `has_source` | 正向 source→sink（含非 HTTP） |
| 过滤器 / 鉴权 | 控面（匹配、绕过、失败开放） |
| Service | 危险操作与鉴权缺口，回推 caller / 二阶 |
| Util / Mapper / 模板 | 执行面或 sink 回推 |
| DTO / 常量 / 死代码 | 薄扫后收工，禁止拿本轮去填上一轮的洞 |

初始上下文是代码地图/鉴权文档，然后每次传入150个文件名，由Agent根据文件名调用Mark系列的工具进行定权。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1180d2aabbc90253.png)

## 4.5 挖掘阶段

这里一共有三种挖掘模式。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e199286f165cde03.png)

### 4.5.1 启发式挖掘

启发式 Worker（worker）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| SubmitVuln | 提交待审核漏洞 |
| AppendAffectedLocations | 向已有待审报告追加同根因受影响点 |
| FinishFile | 标记文件不必再作为后续轮次焦点 |
| FinishRound | 焦点文件分析完后结束本轮 |
| FinishFix | 打回轮纠正入口 / sink / 根因后重新入队 |

依赖LLM自身能力进行挖掘。但这里并不是完全由LLM选取挖掘点，而是通过注入初始文件，让LLM有指向性地进行挖掘。

如下图，一开始会注入作为起始点的文件：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f112f58eefc8f320.png)

而注入的文件，就是侦察阶段进行定权的文件，会根据权重从高到低注入，每一个文件对应一轮挖掘。在挖掘过程中，每50轮会有看门狗提醒调用FinishFile，提醒及时标记分析过的文件，而不是等到这一轮快结束时，才集中进行标记。

每轮挖掘结束后，会产出该轮的挖掘摘要：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a364bb0e5811d6a1.png)

在后续轮开始前注入前10轮的摘要，以提醒模型哪些方向已经尝试过。

另外，此模式还有轻量开关，开启后，只会把权重100的文件依次注入，减轻挖掘强度。

在测试中，这一阶段往往是最长的，得跑上百轮，也是消耗token的主力：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/199bbbf0dd1f92ba.png)

另外，讲一下AppendAffectedLocations工具。这个工具是在挖掘到根因相同时，对报告进行合并，不过不是两份报告合成一份，而是合成父子报告的集合：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0690b0768b0ab5a9.png)

这样避免产生过多类似报告，同时不丢失报告。

### 4.5.2 历史漏洞绕过

历史漏洞绕过（bypass_worker）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| SubmitVuln | 绕过补丁或确认未修复洞仍可打时提交 |
| AppendAffectedLocations | 向已有待审报告追加同根因受影响点 |
| FinishBypass | 结束本轮注入的这一条历史漏洞 |

这一阶段是DeepAudit和AutoCVE没涉及的。想法来源于我手挖漏洞时的顺序，因为一般都是从历史漏洞复现开始，所有自然会想到先去绕过官方的补丁。

数据源是侦察阶段收集到的历史漏洞，每轮注入一份历史漏洞文档：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/312f99665eb2570e.png)

最终也是会生成一份绕过摘要文档：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e90226fd669b676b.png)

### 4.5.3 快速挖掘

Sink 筛选（sink_triage）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| FinishSinkTriage | 提交本批 Sink 的 keep / drop / defer |

快速扫描 Worker（fast_worker）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| SubmitVuln | 按本轮 Sink 回推后提交待审漏洞 |
| AppendAffectedLocations | 向已有待审报告追加同根因受影响点 |
| FinishSink | 结束本轮注入的 Sink |

这里涉及三步，第一步是扫描器扫描，纯代码，无Agent参与，最多保留200个结果。第二步是Agent筛选扫描结果，调用FinishSinkTriage精筛，最多保留60个结果。第三步才是正式挖掘，根据保留的结果进行Sink到Source的回溯。

快速扫描的每一轮同样会产出摘要报告：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fa4b866c7a5539b1.png)

### 4.5.4 报告修复

打回修复（fix）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| FinishFix | 只补入口 / sink / 根因分析债务，重新入审核队列 |
| SubmitVuln | 修复过程中发现独立新洞时可另交 |
| AppendAffectedLocations | 向已有待审报告追加同根因受影响点 |

当报告明显存在问题时，比如不完整或者有乱码，Reviewer会打回报告，让Worker修改。实际测试中还没遇到过报告打回的情况，不够还是保留了这个Worker，当作冗余设计了。

## 4.6 审核阶段

审核也有三种模式，纯静态、动态靶场、局部动态（Mock）

### 4.6.1 靶场搭建

靶场搭建（reviewer_lab）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| FinishLab | 结束独立 Docker 靶场搭建轮，不审核漏洞 |

当开启靶场动态验证时，会在项目开始时进行进行docker靶场搭建。搭建完的靶场，可以在容器管理页面查看：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4d0bc23095db8d3e.png)

这里要注意的是，容器构建和镜像拉取会很吃存储，需要人工定时清理。

### 4.6.2 靶场验证

审核（reviewer）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| ConfirmVuln | 确认漏洞并校准严重度与价值分层 |
| MarkFalsePositive | 判定误报并结束本审核会话 |
| ReturnToWorker | 仅当入口 / sink / 根因分析错了才打回 |
| MergeIntoVuln | 将同根因同危害的重复报告并入主报告 |
| CollectLabFingerprints | 从靶场升级项目共享指纹 |
| SearchTools | 搜索已索引的用户 CLI，再按绝对路径用壳执行 |
| SearchGHSA | 查询 GitHub Advisories |
| SearchOldVuln | 查历史洞与本项目已提交报告 |

CollectLabFingerprints工具是更新漏洞报告中的指纹信息。因为挖掘时是静态的，所以指纹信息会不准确，需要在动态靶场中根据实际情况进行调整。

SearchTools工具可以搜索项目的工具目录，用户可以在此目录下放置一些工具，比如启动恶意JNDI，恶意JDBC服务的CLI Jar，能够让Agent不用手搓工具。工具目录下每个目录代表一个工具，放入后会自动检测，并由Agent进行静默索引，产出可供SearchTools识别的格式化文件。

此外，审核Agent还会确保产出的漏洞不是已经提交过的旧漏洞，会调用SearchOldVuln查找kind=found的漏洞，即本次审计中已经产出过的漏洞。

当审核发现报告中的PoC有问题，但报告本身没大问题时，会自己对PoC进行调整。若是复杂漏洞，会调用Debug MCP进行远程调试，辅助PoC编写。目前支持通过MCP进行远程调试的语言有，Java、Python、Node

[https://github.com/1diot9/Java-debug-mcp](https://github.com/1diot9/Java-debug-mcp)

[https://github.com/1diot9/Node-debug-mcp](https://github.com/1diot9/Node-debug-mcp)

[https://github.com/1diot9/Python-debug-mcp](https://github.com/1diot9/Python-debug-mcp)

### 4.6.3 局部验证（Mock 验证）

|     |     |
| --- | --- | 
| ConfirmVuln | 确认漏洞并校准严重度与价值分层，打通后 evidence_level 为 harness |
| MarkFalsePositive | 判定误报并结束本审核会话 |
| ReturnToWorker | 仅当入口 / sink / 根因分析错了才打回 |
| MergeIntoVuln | 将同根因同危害的重复报告并入主报告 |
| CollectLabFingerprints | ACL 仍注入，局部验证无整项目靶场，一般用不上 |
| RunCode | 仅局部验证：在无网沙箱执行 harness，写入 harness.py |

这里和DeepAudit里的实现思路基本一致。

### 4.6.4 静态验证

|     |     |
| --- | --- | 
| ConfirmVuln | 确认漏洞并校准严重度与价值分层，evidence_level 为 static_only |
| MarkFalsePositive | 判定误报并结束本审核会话 |
| ReturnToWorker | 仅当入口 / sink / 根因分析错了才打回 |
| MergeIntoVuln | 将同根因同危害的重复报告并入主报告 |
| CollectLabFingerprints | ACL 仍注入，无靶场时一般用不上 |

就是根据报告再次进行静态审核，着重看数据流是否用户可控，是否有额外防护策略，权限标注是否正确等。

## 4.7 互联网验证阶段

互联网验证（verifier）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| FofaSearch | 只读 FOFA 测绘同款前台目标 |
| AskUser | 破坏性复测前询问用户是否继续 |
| FinishVerifier | 提交互联网验证结论并结束本轮 |

当漏洞确定，且是前台漏洞时，会进入互联网验证阶段。

这里先调用FOFA，根据报告中的指纹进行查询，若查询不到理想结果，也会自行调整搜索语法。

另外，搜索到的有效结果会自动存入全局互联网目标，供此项目的漏洞共享，防止每个漏洞都消耗FOFA额度。

当遇到可能产生破坏性的漏洞时，会主动询问用户是否进行验证，用户提交后会直接接续对话进行验证，且不阻塞后续其他验证轮。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0ee34a680b5dab88.webp)

## 4.8 攻击链串联阶段

攻击链串联（attack_chain）

|     |     |
| --- | --- | 
| 工具  | 用途  |
| SearchOldVuln | 仅搜索本项目已确认产出 |
| SubmitAttackChain | 提交一条详文攻击链（最多 3 条） |
| IndexAttackChain | 将其余真链写入索引简述 |
| FinishAttackChain | 结束攻击链阶段（有链或无链都必须调用） |

当所有挖掘和审核都完毕时，会根据产出的漏洞，进行攻击链串联，尝试扩大危害。

详细攻击链文档最多产出3份，会优先选择危害最大，攻击最容易的。其他攻击链在所有文档中用一句话带过。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/465d304423788b00.png)

## 5\. 挖掘成果

目前申请编号的流程还没走完，后续有了会补上，现在只大致讲一下挖掘情况。

找了几个Java项目和Python项目进行挖掘，涉及低代码平台，AI网关，网盘系统，博客系统等。

挖掘到的漏洞类型以XSS、SSRF、越权为主，高危漏洞比较少，且最高危的只有前台SQL、后台提权等。

漏洞数量还比较可观，每个项目基本都能出洞，数量在3-40之间，且基本没有误报或太水的洞（使用赏金模式时）。

消耗的Token根据项目规模的不同，大致在1亿--10亿。若启发式挖掘开轻量模式，基本上都能在1亿--3亿之间。

## 6\. 不足之处

1、当前不支持docker部署。由于搭建动态靶场需要用到docker，但没法在docker里再启动docker。当前没想到什么特别好的解决方法，只能作为本地应用启动了。或者部署docker，但去掉动态验证能力。

2、没测试过中转站模型，只测试了官方服务商。

3、历史漏洞偏Github搜索，补漏靠WebSearch，覆盖率无硬性保障。

## 7\. 漏洞评级附录

> \=5为严重，3-4为高危，1-2为中危，<=0为低危。

|     |     |     |     |
| --- | --- | --- | --- |   
| 维度  | 取值  | 分   | 怎么来的 |
| 可达性 | 未认证可达 | +1  | `attack_surface=frontend`  <br>（前台） |
|     | 低权限可达 | +0  | 后台 + `required_account=user` |
|     | 管理员才可达 | \-1 | 后台 + `required_account=admin` |
| 影响范围 `impact` | RCE / 全库 / 完整控制 | +4  | `rce_or_full_data` |
|     | 敏感数据 / 权限提升 / 部分数据 | +2  | `sensitive_data_or_privilege` |
|     | 有限信息泄露 / 信息收集 | +1  | `limited_info` |
| 利用复杂度 `exploit_complexity` | 单请求或简单触发 | +1  | `single_request` |
|     | 多步骤利用 | +0  | `multi_step`  <br>（不加分也不扣分） |
|     | 依赖特定环境 | \-2 | `specific_environment` |
| 防护状态 `defense_status` | 无有效防护 | +0  | `none` |
|     | 有防护但可绕过 | +0  | `bypassable` |
|     | 有防护且绕过需额外条件 | \-1 | `conditional` |

## 8\. 总结

其实白盒Agent里的许多容错与恢复机制也能在通用Agent里使用，比如工具调用提醒，超时抢救等。

各位师傅如果感兴趣的话，欢迎测试本项目，遇到问题可以直接提Issue或PR，也可以自行在此基础上二开。如果有挖到厉害的洞，也可以来和我分享，我会填写到漏洞成果列表中，在github上展示。

[https://github.com/1diot9/VulnHunter-White](https://github.com/1diot9/VulnHunter-White)

## 9\. 参考

[https://github.com/lintsinghua/DeepAudit](https://github.com/lintsinghua/DeepAudit)

[https://github.com/larlarua/AutoCVE](https://github.com/larlarua/AutoCVE)
