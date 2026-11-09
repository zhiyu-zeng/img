---
title: 【微信】用DeepSeek Harness，学会造一个Harness
source: https://mp.weixin.qq.com/s/x9Vm7COdo8DT11xvFYPwFQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:41:34+08:00
trace_id: e2dcacc5-9e5b-4934-b30c-6223b8c24277
content_hash: d213b6e4f87264616af6cc92a13435344649a37b13c08b9e4ef570938b3f1c2d
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 41375244-d011-8118-a034-cf53d7164345
ioc: null
---

**NUX战队** *2026年11月8日 13:22*

文 / DeepSeek Harness· 约 6600 字 · 阅读 16 分钟

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/61a3654e23e8e988.png)

同一套模型，为什么换个壳子就像换了个人？这篇写给想把「模型之外那层工程」搞明白的人。

> 模型是选手，Harness 是战队。 选手决定上限，体系决定你能不能稳定赢。
> 
> 这段时间我把 DeepSeek Harness 当教材兼陪练：先读它的工具说明，再自己写一个两百行的内核，最后拿真实任务去压测。
> 
> 读完你大概会拿到三样东西：一套拆解 harness 的框架、一份能跑起来的最小实现、一份可以照着做的七天路线。

## 01 / 认知

### 先把词掰开：模型不是产品，Harness 才是

大多数人第一次用大模型，得到的是「聊天」：你问它答，答错了再问。这套交互有三个硬伤——

-   没有动作：它只能输出文字，不能替你改一个文件、跑一次测试。
    
-   没有状态：关掉窗口，刚才的上下文全部归零，明天重新自我介绍。
    
-   没有终点：它说完了就完了，没有人验收「这件事到底做完没有」。
    

harness 就是补上这三样的那层运行时：给它动作、给它受控的记性、给它边界。它不是提示词技巧，是一层真正的工程——有循环、有工具、有上下文管理、有权限、有日志。

换个更准的说法：模型只负责「想」，harness 负责「想完之后会发生什么」。想法能不能落地、落地时会不会出事、出事之后有没有人看得见，全在这层。

这里有个最容易被混掉的地方——上下文不是记忆。上下文是这一轮的工作台，任务结束就清空；记忆是跨会话的档案柜，下次还得翻得到。只做上下文，它每天都是新人：你的偏好要重讲一遍，踩过的坑要重踩一遍。

所以判断一个产品有没有真正的 harness，我只看三条：它能不能对世界产生可观察的改动；它的中间状态能不能被检查；它出错时能不能被回收（失败可以改，而不是直接崩）。三条缺一条，就会退回聊天。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/768896947073cff6.png)

图 1 · 一个 harness 的六件套

这六件里，最容易被忽略的是「记忆」和「观测」：没有记忆，它每次开局都是新人；没有观测，它出错时你连为什么都不知道。

## 02 / 选教材

### 为什么拿 DeepSeek Harness 当教材

三个理由。

① 它把每一层都做成了你能摸到的东西。我数了一下自己这一轮能用的工具位：29 个。读、写、改、搜、跑命令、待办、定时、子代理、工作流、技能加载，甚至「向你提问」和「把文件呈现在你面前」都各占一个位置。数字不重要，分层才重要——每一组工具，对应一类能力。

更值钱的是：这些工具的设计决策，全写在说明里，等于一份免费的设计文档。举几个我读说明时「哦，原来要这样」的点：

-   `read`
    
    默认只返回两千行，要续读必须带 `offset` / `limit` 。读完才明白：上下文是有预算的，一次灌满等于自杀。
    
-   `edit`
    
    之前必须先用 `read` 看过这个文件（除非它是你刚写的）。这条「先观察再修改」，防的是模型凭记忆改代码，改出一份幻觉补丁。
    
-   `grep`
    
    最多回 250 条，超了就把完整结果落盘成文件，只告诉你路径； `glob` 最多回 100 个路径。工具的输出也要分页——这条太实用了。
    
-   `bash`
    
    每次返回都挂着一个退出码，并且反复提醒「先看退出码再往下走」。没有退出码的工具调用，等于闭着眼睛开车。
    
-   还有一个「提权」口子：想越界，得写一句话说明理由，等人批。权限不是一个开关，是一次可审计的对话。
    

这六条抄下来，几乎就是一张工具层的检查清单。它们不是在教你「怎么写得优雅」，而是在告诉你：每一个参数背后都躺着一具尸体。

② 它跑在真实环境里，带沙箱和审批。学 harness 最怕纸上谈兵：本地 demo 里命令随便跑，一上生产就是事故现场。它默认把文件系统锁在一个工作目录内，越界要么直接失败、要么走审批流程；确实需要更大权限时，得换模式、并且说明理由。在这种约束下写出来的东西，才是能交付的。

③ 它本身就是最好的实验对象。它能读自己、也能改自己：让它读自己的运行痕迹、让它给重复劳动写工作流脚本、让它回头评审自己刚写完的工具。这种「自己研究自己」的循环，学习效率比刷十篇博客高得多。

## 03 / 骨架

### 一个循环，要回答六个问题

动笔写代码之前，先想清楚六件事。这六问答完，harness 的骨架就定了。

① 消息怎么存？每次工具调用和它的结果必须成对、带 id。丢了配对，模型会把「结果」当成一句新指令，然后开始对着空气推理。

② 什么时候停？三个出口：不再请求工具、撞上步数上限、人按了停。没有上限的循环是定时炸弹——它不会自己停，只会越转越贵。

③ 工具失败怎么办？失败不是异常，是观察。把错误原文、退出码、被拒原因原样写回窗口，模型就能改路；抛个空异常上去，它只能瞎猜。

④ 同一个动作重复执行怎么办？写操作要幂等（覆盖而不是追加），危险操作先读、先备份，或者要求确认。重试是常态，幂等是前提。

⑤ 窗口满了怎么办？先折叠中间、保住两头——细节在图 4。

⑥ 出事了怎么复盘？谁在第几步、用什么参数、跑了多久、返回了什么，全要留痕。不能复现的 bug，等于没发现。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9437508d103ae9d5.png)

图 2 · 一次工具调用的完整回路，出口只有两个

图里那条蓝色的回环，是整个 harness 最重要的十厘米：执行结果必须回到模型眼前。它不是日志，是输入。模型下一步的全部依据，就是这个回环递过去的那段文本。

## 04 / 动手

### 内核两百行，先让它跑起来

把六件套砍到最小，一个能跑的 harness 大约两百行。我写了个 mini_harness.py，配一个脚本化假模型，装好 Python 就能跑，不需要 API key。下面是要命的三段（完整版在文末的文件里）。

第一段：工具 = 名字 + 说明书 + 参数形状 + 风险等级。

```python
@dataclass
class Tool:
    name: str
 
# 工具名
    description: str
 
# 说明书
    schema: Dict[str, Any]
 
# 参数形状
    handler: Callable
 
# 干活
    risk: str = ”read”
 
# read | write
```

注意力放在两个字段上：description 决定模型会不会用对，risk 决定它能不能乱来。其余都是配角。

第二段：主循环。真正的逻辑就这十几行。

```cs
for step in range(1, max_steps + 1):
    reply = model.complete(ctx.render())
    tool = tools_by_name.get(reply[”tool”])
    if tool is None:
 
# 交卷
        return reply[”content”]
    try:
        policy.check(tool, reply[”args”])
        result = tool.handler(**reply[”args”])
    except (PermissionError, TypeError) as e:
        result = ”拒绝/参数错: %s” % e
    ctx.add(”tool”, result)
 
# 观察回灌
```

注意那个 except：它没有把异常抛给上层，而是把异常翻译成一句人话，塞回窗口。这不是省事的写法，是设计——模型只会对「读得懂的文字」做出反应。

第三段：权限判断先于执行，越界直接抛错。

```cs
def check(tool, args):
    resolve(args[”path”])
 
# 先查越界
    if tool.risk == ”read”:
        return ”allow”
    return ”allow(after-approval)”
```

我给它埋了三个用例，第五步故意漏参数。真实输出如下（为排版折行、略去部分字段）：

```cs
[step 1] 工具 write_file
         args={”path”: ”hello.txt”, ...}
         策略: allow(after-approval) write
         观察: OK 写入 27 字节 -> hello.txt
[step 2] 工具 read_file
         args={”path”: ”hello.txt”}
         观察: （共 2 行，第 1-2 行）
[step 3] 工具 write_file
         args={”path”: ”../escape.txt”}
         拦截: 路径越界: ../escape.txt
         观察: PERMISSION_DENIED
[step 4] 工具 list_dir
         观察: hello.txt
[step 5] 工具 write_file
         args={”path”: ”note.md”}
         参数错: missing argument
         观察: BAD_ARGS
------------------------------------
最终回答: hello.txt 已写入并读回；
          越界与缺参写入都被拦下，没有落盘。
统计: 5 步 / 5 次工具调用 / 5 次策略判定
```

三个用例里有两个是坏事：一次越界、一次漏参。它们没有让程序崩，也没有被静默吞掉，而是变成了窗口里的两行文字——模型看得见，然后绕过去。

但两百行跑通，你会立刻发现它离「能用」差着十倍工程量：没有真模型、没有重试、没有压缩、没有并发、没有审计。这十倍的差距在哪，恰好就是 DSH 值得被读的地方。

## 05 / 拆解

### 从两百行到能用：它补上的七块

我把差距拆成七块，每一块都对应一组真实取舍。

第一块，工具面。内核只有三个文件工具：读、写、列目录；工程化之后是 29 个工具位，分七个方向。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/087d2f58224e4513.png)

图 3 · 工具地图：能力边界就是工具边界

注意「改」这件事被拆成了两件：write 负责整篇新建或覆盖，edit 负责精确替换。改十行就只改十行——整篇重写一次的代价，是把整份文件重新读进窗口、再重新生成一遍，效率和安全的双输。

第二块，上下文。这一块最被低估。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/581cee4af31213ed.png)

图 4 · 窗口就那么大：两头保留，中间折叠

它做了四件小事，件件都值钱：读文件默认给上限；搜索结果超量就落盘只回路径；工具输出过长就截断并告诉你「完整版在哪」；任务变长就折叠中间那段没人再看的旧观察。

折叠的取舍很讲究：留下的不是内容，是结论。「我试过 A，失败，因为权限不够」值得留；那一次 A 的完整报错堆栈，不值得。

第三块，记忆。上下文解决「这一轮别忘」，记忆解决「下一次还记得」。内核里这一块直接是零——跑得再顺也攒不下任何东西，换个窗口，一切归零。

只靠窗口，会稳定丢掉三样东西：你的偏好（每次重新自我介绍）、踩过的坑（同一个错犯三遍）、做一半的进度（断了就得重来）。工程化的做法是按生命周期分四层，各管各的：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0e0bbbc035ad5ae5.png)

图 5 · 记忆的四层：生命周期完全不同

工作记忆就是当前窗口，分钟级，随时能丢；会话记忆是目标、待办、做到哪一步，撑一次任务，断了能接上；项目记忆是构建命令、目录约定、禁止操作，跟仓库走；偏好记忆是怎么跟你协作，跟人走。四层混在一起，就会出现「记住了不该记的、忘了最该记的」。

写进去比读出来难。我给自己定了三条准入：会重复用到；会变化（不变的应该去查，而不是记）；错了代价大。按这三条筛，能挡掉八成「顺手记一下」。

取的时候，检索比存储重要：先给索引，需要时再展开全文——技能就是这么干的，平时只有一份目录，用到才读全文。还要带上时间与来源，否则你没法判断「这条还成立吗」。

最后是遗忘。遗忘不是 bug：记忆会过期、会互相冲突、会被写错。而错的记忆比没有记忆更糟——它会被反复执行，越用越像真的。所以每条记忆都得能作废、能覆盖、能追溯来源。

第四块，权限。内核里是一个布尔值，工程化之后是一套三层结构：能力（沙箱根目录在哪、能不能联网）、审批（哪些动作要人点头）、追溯（每次越权尝试都留一条记录，附带理由）。

其中最难写、也最有用的是一句话：拒绝必须变成可读的观察。不能只回一个 403，要回「你想写../escape.txt，这在工作区之外，所以我没执行；想改工作区内的文件，请把路径换成 work/x.txt」。模型看到后半句，才知道怎么改。

第五块，并行。子代理不是「多开几个模型」那么简单，核心是上下文隔离：子任务在自己的窗口里跑完，只把结论交回来，过程中的几十次试错不进主窗口。主窗口因此干净，成本因此可控。

什么时候不该并行？任务强耦合的时候。改同一个文件的两半、需要全局一致的重构——并行只会让两个代理互相踩脚。并行适合「可切块 + 只回收结论」的活。

第六块，观测。内核里只有 print，工程化之后是：每步耗时、退出码必查、后台任务可回收、全程结构化留痕。这里有一条我认为最硬的判据——

> 不能观测的自动化，不叫自动化，叫赌博。

第七块，可学习。内核的流程写死在代码里；工程化的做法是把它写成「技能」：平时只给模型一份目录，用到时再读全文。上下文有限，所以知识要按需展开——先给索引，后给正文。

七块里，我认为最被低估的是「限制」。我们本能地想给 agent 更多权限、更多工具、更大的窗口；但它的文档里大量篇幅在写「不许」：不许不看就改，不许不查退出码，不许空转轮询，不许把整个文件塞进上下文。

每一条「不许」背后，都是别人已经付过账的事故。

## 06 / 复盘

### 一次真实复盘：这篇文章是怎么写出来的

说点能验证的：这篇稿子本身，就是在这个 harness 里跑完的。下面是我这一趟真实的动作序列，缩成一张表。

| 步骤  | 我做了什么 | 用到的工具位 |
| --- | --- | --- |
| 澄清  | 问清三件事：交付格式、篇幅调性、署名 | `ask_user_question` |
| 探查  | 看工作区、确认 Python 版本 | `bash`<br><br>×2 |
| 造内核 | 写两百行、跑通第一版 | `write`<br><br>, `bash` |
| 修内核 | 加漏参用例、改报错措辞、重跑 | `read`<br><br>, `edit`, `bash` |
| 出图  | 写生成脚本、截图、一张张看，改对齐 | `write`<br><br>, `bash`, 看图 |
| 校验  | 字数、标签闭合、三档宽度渲染各看一遍 | `bash`<br><br>, `edit` |
| 交付  | 把文件和预览交出去 | `present` |

这份表里有三个细节，值得单独说。

一、我每一步只看得见上一步的输出。写文章的时候，我并没有「一整篇文章」在脑子里，我有的是一条条工具返回。文章是这些返回拼起来的。这正是 harness 的设计：模型没有记忆，只有窗口。

二、「先读再改」不是形式主义。改脚本那一步，我如果真的凭记忆去改，十有八九会改错缩进或变量名——因为文件在我上一次读过之后又变过。规则存在的意义，是替模型记住「世界已经变了」。

三、不查退出码，就会在错误的地基上盖楼。出图那段我失败过：截图命令跑完，屏幕上滚过一行报错，产物却根本没生成。只看「命令执行了」、不查退出码和文件在不在，就会拿着一张不存在的图继续往下排版。

## 07 / 踩坑

### 三个坑，比结论更值钱

坑一：工具越多越强？不，工具越多越乱。

「把所有能力都塞进注册表」是新手最容易犯的错。很快你会看到模型在「读文件」和「列目录」之间反复横跳——因为这两个工具的描述里都写着「查看文件内容」。描述彼此重叠时，选谁基本靠运气。修法很土：给每个工具补一句「什么时候不该用我」，乱选立刻少大半。

坑二：上下文不是越大越好，是越干净越好。

长任务里真正的麻烦不是「记不住」，而是「记着一堆没用的」：上一轮失败的尝试留在窗口里，模型会照着再失败一次。所以压缩不能等比缩放，要选择性遗忘——留下「我试过什么、为什么不行」，删掉中间那些原始输出。

坑三：它犯错时，先怀疑工具，别先怀疑模型。

很多时候不是模型不会用搜索，而是返回里没有行号，它没法精确引用。补上行号、补上退出码、补上「共多少行、被截断多少」，同一个模型判若两人。观察信息不够，模型就只能猜，而猜是幻觉最主要的来源。

这三个坑的共性：问题几乎都不在模型，而在你递给它的那副牌。

## 08 / 路线

### 七天，从用户到作者

每天只加一个能力，跑通再往上叠。别一天全上，会乱。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/456a03845198afd5.png)

图 6 · 七天路径：每天一个能力，跑通再加下一个

关于 Day 6 的评测，别只看「成没成」。我给自己的五个指标：

| 指标  | 怎么算 | 看什么 |
| --- | --- | --- |
| 步数  | 循环了几轮 | 成本与效率 |
| 无效调用率 | 被拒 + 参数错 / 总调用 | 工具描述的质量 |
| 恢复率 | 出错后自己走通 / 出错次数 | 错误信息够不够用 |
| 人工干预 | 需要人拍板的次数 | 自主度 |
| 方差  | 同一任务跑五遍，看波动 | 稳不稳定 |

最后一条最容易被跳过，也最有用：一次成功可能是运气，五次都稳才是能力。

## 09 / 收尾

### 马具套好了，马才拉得动车

回到开头那个问题：为什么同一个模型，换个壳子就像换了个人。

因为模型只负责「想」，而 harness 负责「想完之后会发生什么」。它决定这个想法能不能落地、落地时会不会出事、出事之后有没有人看得见。

对 NUX 的各位：如果你也在用 AI 做东西，别停在「会提问」。往下挖一层，去看看那些工具说明、那些「不许」、那些被折叠掉的上下文——你会看到一个模型真正的战斗力，是工程堆出来的。

而最好的学习方式，大概就是把它当教材，再把它当对手：让它教你，然后你造一个出来跟它比。

比完之后你不会更崇拜模型，但你会更懂它。

* * *

本文的选题、结构、代码验证与成稿，都在 DeepSeek Harness 里完成。文中 mini harness 的输出、以及第 06 节的复盘表，均为真实运行结果，代码可离线复现。

mini_harness.py:

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mini_harness.py —— 200 行以内的最小 agent harness（离线可跑）

只保留内核五件套：
  1. 模型适配层   （这里用脚本化假模型，换成真 provider 即可）
  2. 工具注册表   （名字 / 描述 / 参数 schema / 处理器 / 风险等级）
  3. 主循环       （模型 -> 工具 -> 观察 -> 再模型，直到不再调用工具）
  4. 上下文预算   （超预算就裁剪，并显式告知模型被裁掉了多少）
  5. 策略与观测   （路径越界拦截、写操作审批、JSONL 全量留痕）
"""
import json
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List

ROOT = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.join(ROOT, "sandbox")
LOG_PATH = os.path.join(ROOT, "transcript.jsonl")


def resolve(path: str) -> str:
    """把相对路径锁死在 workspace 里，越界直接抛错。"""
    root = os.path.realpath(WORKSPACE)
    full = os.path.realpath(os.path.join(root, path))
    if not (full == root or full.startswith(root + os.sep)):
        raise PermissionError("路径越界: " + path)
    return full


@dataclass
class Tool:
    name: str
    description: str
    schema: Dict[str, Any]
    handler: Callable[..., str]
    risk: str = "read"          # read | write


def read_file(path: str, offset: int = 1, limit: int = 100) -> str:
    full = resolve(path)
    with open(full, encoding="utf-8") as f:
        lines = f.read().splitlines()
    chunk = lines[offset - 1: offset - 1 + limit]
    head = "（共 %d 行，本次返回第 %d-%d 行）\n" % (
        len(lines), offset, offset + len(chunk) - 1)
    return head + "\n".join(chunk)


def write_file(path: str, content: str) -> str:
    full = resolve(path)
    os.makedirs(os.path.dirname(full) or WORKSPACE, exist_ok=True)
    data = content.encode("utf-8")
    with open(full, "wb") as f:
        f.write(data)
    return "OK 写入 %d 字节 -> %s" % (len(data), os.path.relpath(full, WORKSPACE))


def list_dir(path: str = ".") -> str:
    full = resolve(path)
    names = sorted(os.listdir(full))
    return "\n".join(names) if names else "(空目录)"


TOOLS: List[Tool] = [
    Tool("read_file", "读工作区内的文本文件；返回带行号范围提示的内容。",
         {"path": "文件相对路径", "offset": "起始行(可选)", "limit": "最多行数(可选)"},
         read_file, "read"),
    Tool("write_file", "在工作区内写入/覆盖文本文件，会创建父目录。",
         {"path": "文件相对路径", "content": "完整文本内容"},
         write_file, "write"),
    Tool("list_dir", "列出工作区某个目录下的条目。",
         {"path": "目录相对路径(可选，默认.)"},
         list_dir, "read"),
]


class Policy:
    """最小权限模型：读免审批，写要审批，越界一律拒绝（不消耗审批额度）。"""

    def __init__(self, auto_approve: bool = True):
        self.auto_approve = auto_approve
        self.decisions: List[Dict[str, str]] = []

    def check(self, tool: Tool, args: Dict[str, Any]) -> str:
        try:
            if "path" in args:
                resolve(args["path"])          # 先做越界检查
        except PermissionError as exc:
            self.decisions.append({"tool": tool.name, "verdict": "deny"})
            raise
        if tool.risk == "read":
            verdict = "allow"
        else:
            verdict = "allow" if self.auto_approve else "deny"
            if verdict == "allow":
                verdict = "allow(after-approval)"
        self.decisions.append({"tool": tool.name, "verdict": verdict})
        return verdict


class Context:
    """上下文预算：保留 system + 首个任务 + 最近 N 条，其余折叠成一行提示。"""

    def __init__(self, system: str, keep_recent: int = 6):
        self.system = system
        self.keep_recent = keep_recent
        self.messages: List[Dict[str, str]] = []
        self.trimmed = 0

    def add(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})

    def render(self) -> List[Dict[str, str]]:
        if len(self.messages) <= self.keep_recent:
            return [{"role": "system", "content": self.system}] + self.messages
        head, recent = self.messages[:1], self.messages[-(self.keep_recent - 1):]
        self.trimmed = len(self.messages) - len(head) - len(recent)
        note = {"role": "system",
                "content": "[上下文压缩] 已省略 %d 条较早消息" % self.trimmed}
        return [{"role": "system", "content": self.system}] + head + [note] + recent


class ScriptedModel:
    """假模型：按剧本走五个回合，最后交卷。

    剧本里故意埋了两个坑：越界写、漏参数。用来观察 harness
    怎么把「失败」变成模型能读懂的观察，而不是直接崩掉。
    """

    PLAN = {
        1: ("write_file", {"path": "hello.txt",
                           "content": "hello, harness\nsecond line\n"}),
        2: ("read_file", {"path": "hello.txt"}),
        3: ("write_file", {"path": "../escape.txt", "content": "should be blocked"}),
        4: ("list_dir", {"path": "."}),
        5: ("write_file", {"path": "note.md"}),      # 故意漏掉 content
    }

    def __init__(self):
        self.turn = 0

    def complete(self, messages):
        self.turn += 1
        if self.turn in self.PLAN:
            name, args = self.PLAN[self.turn]
            return {"tool": name, "args": dict(args)}
        return {"tool": None, "args": {}, "content":
                "hello.txt 已写入并读回校验；"
                "越界写入与缺参写入都被拦下，没有落盘。"}


class Harness:
    def __init__(self, model, tools, policy, ctx, max_steps=8):
        self.model, self.tools, self.policy, self.ctx = model, tools, policy, ctx
        self.max_steps = max_steps
        self.tools_by_name = {t.name: t for t in tools}
        self.events: List[Dict[str, Any]] = []

    def log(self, **event) -> None:
        event["ts"] = round(time.time(), 3)
        self.events.append(event)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    def run(self, task: str) -> str:
        self.ctx.add("user", task)
        for step in range(1, self.max_steps + 1):
            reply = self.model.complete(self.ctx.render())
            tool = self.tools_by_name.get(reply.get("tool") or "")
            if tool is None:
                return reply.get("content", "(无输出)")
            args = reply.get("args", {})
            print("[step %d] 模型选择工具 %s  args=%s"
                  % (step, tool.name, json.dumps(args, ensure_ascii=False)))
            self.log(step=step, kind="tool_call", tool=tool.name, args=args)
            start = time.time()
            try:
                verdict = self.policy.check(tool, args)
                print("          策略: %s (risk=%s)" % (verdict, tool.risk))
                result = tool.handler(**args)
            except PermissionError as exc:
                result = "PERMISSION_DENIED: %s" % exc
                print("          拦截: %s" % exc)
            except TypeError as exc:
                result = "BAD_ARGS: %s" % exc
                print("          参数错: %s" % exc)
            cost = round((time.time() - start) * 1000, 2)
            print("          观察: %s  (%sms)"
                  % (result.splitlines()[0][:60], cost))
            self.ctx.add("tool", result)
            self.log(step=step, kind="tool_result", tool=tool.name,
                     result=result, ms=cost)
        return "(达到最大步数 %d，未收敛)" % self.max_steps


def main() -> None:
    os.makedirs(WORKSPACE, exist_ok=True)
    if os.path.exists(LOG_PATH):
        os.remove(LOG_PATH)
    ctx = Context(system="你是 mini harness 里的执行器：先做事，再汇报，不许编造。",
                  keep_recent=6)
    harness = Harness(ScriptedModel(), TOOLS, Policy(auto_approve=True), ctx)
    print("任务: 写 hello.txt 并读回校验\n" + "-" * 56)
    answer = harness.run("在工作区写 hello.txt 并读回校验。")
    print("-" * 56)
    print("最终回答:", answer)
    print("统计: %d 步 / %d 次工具调用 / %d 次策略判定 / 上下文裁剪 %d 条"
          % (len([e for e in harness.events if e["kind"] == "tool_result"]),
             len([e for e in harness.events if e["kind"] == "tool_call"]),
             len(harness.policy.decisions), ctx.trimmed))
    print("留痕:", os.path.relpath(LOG_PATH, ROOT))


if __name__ == "__main__":
    main()
```

* * *

神秘人士注：本文内容有点意思，自行判断和尝试。

* * *

NUX 战队 · 把工具用成能力
