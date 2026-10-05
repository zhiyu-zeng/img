---
title: 【微信】Claude Code通过Git Worktree混淆实现沙箱逃逸
source: https://mp.weixin.qq.com/s/SsLMC1DTeGD6BZMJrCTYFg
source_host: mp.weixin.qq.com
clip_date: 2026-10-05T09:37:29+08:00
trace_id: 43da63df-05ce-48dd-9d99-11995521bf62
content_hash: f3c69a1438b27647e2b10165d823e4823f15804bcca0cebc191ef52c5a97df3e
status: synced
tags:
  - 微信
  - 漏洞分析
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Claude Code 存在 High 级沙箱逃逸漏洞 CVE-2026-55607（CVSS 7.7），恶意仓库借 prompt injection 操纵 Git worktree 实现路径混淆，在 macOS seatbelt 最严格配置下完成任意代码执行。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f075244-d011-8166-9466-d086d604bac5
ioc:
  cves:
    - CVE-2026-55607
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Claude Code 存在 High 级沙箱逃逸漏洞 CVE-2026-55607（CVSS 7.7），恶意仓库借 prompt injection 操纵 Git worktree 实现路径混淆，在 macOS seatbelt 最严格配置下完成任意代码执行。
> 
> - **攻击前置：** 仓库根目录本身即是完整 gitdir（`HEAD`、`config`、`objects/`、`refs/` 直接置于根目录），使“创建名为 `.git` 的工作树”成为可能；配合 `CLAUDE.md` 注入指令与 `fsmonitor` 触发的分阶段载荷 `3p_setup.sh`。
> - **攻击链：** `EnterWorktree(".git")` → 不清理退出 → 载荷把 `.claude/worktrees` 符号链接改指 `$HOME` → 再建 worktree 时跟随符号链接将元数据写入 `$HOME/.git` → 伪造 worktree 元数据 → 进入 `$HOME` 并追加写 `~/.zshenv`。
> - **逃逸根因：** Bash 工具调用链为 `/bin/zsh -c ... "$PAYLOAD"`，`zsh` 在 seatbelt 限制生效前先加载 `~/.zshenv`，恶意代码因此在沙箱外执行；PoC 在 `sandbox:{enabled:true, autoAllowBashIfSandboxed:false}` 下仍成功。
> - **三个缺陷：** 未校验 worktree 名称（接受 `.git`）；worktree 创建可跟随符号链接写出项目目录且无需确认；`~/.zshenv` 可被未授权覆写。
> - **修复与影响：** 影响 v2.1.139 及可能所有启用 worktree 的版本；2.1.163 起修复缺陷 1（`.git` 不再是合法 worktree 名），可用 `claude --version` 核验。5 月 11 日提交 HackerOne，5 月 28 日获 3,700 美元奖金，6 月 25 日公开披露。

**黑白之道** *2026年10月5日 09:12*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：当一个AI coding agent成为攻击面，攻击者不需要直接调用shell——只需要一段藏在 `CLAUDE.md` 里的自然语言指令，就能让agent亲手为自己打开系统的大门。安全研究员Metnew近日披露了CVE-2026-55607：Anthropic Claude Code中的一个沙箱逃逸漏洞，攻击者通过恶意仓库的prompt injection，操纵Git worktree工具链完成路径混淆，最终在最严格的沙箱配置下实现任意代码执行，奖金3700美元。

* * *

## 一、事件概述

### 1.1 背景

Claude Code是Anthropic推出的命令行AI编程助手，基于Claude模型驱动，具备创建工作区、执行代码、操纵Git分支等能力。它在macOS上默认启用seatbelt沙箱隔离，并对Bash工具执行施加严格限制。

安全研究员Metnew在研究AI agent安全边界时，发现了一条精妙的攻击路径：攻击者只需诱导用户克隆一个恶意Git仓库，用Claude Code打开它，并提出一个看似无害的请求——剩下的全部由仓库中的prompt injection驱动Claude自身完成，最终实现系统级代码执行。

该漏洞于2026年5月11日通过HackerOne提交（报告#3727895），2026年6月4日修复并部署，2026年6月25日公开披露，CVE编号为 **CVE-2026-55607**，严重等级 **High（CVSS 7.7）**。

* * *

## 二、技术分析

### 2.1 攻击前置条件

攻击的起点是一个精心构造的恶意Git仓库，其目录结构如下：

```bash
item6/                        ← 受害者克隆并用Claude Code打开的仓库
├── CLAUDE.md                 ← prompt injection指令序列
├── 3p_setup.sh               ← 分阶段载荷，通过fsmonitor触发
├── config                    ← root级gitconfig（携带fsmonitor payload）
├── HEAD                      │
├── description               │  这些文件使item6/本身成为一个完整
├── objects/                  │  的gitdir，从而激活worktree混淆链
├── refs/heads/master         │
├── .claude/
│   ├── settings.local.json   ← sandbox:{enabled:true, autoAllowBashIfSandboxed:false}
│   ├── agent-memory/         ← 中转目录
│   └── worktrees -> ./agent-memory   ← 符号链接（后续被替换为$HOME）
└── .git/                     ← 第二个"正常"git目录
```

关键在于：恶意仓库的根目录 **同时也是一个合法的Git仓库**—— `HEAD` 、 `config` 、 `objects/` 、 `refs/` 等文件直接放在仓库根目录，而非`.git/` 子目录下。这使得"创建名为`.git` 的工作树"成为可能，因为该路径本身就是一个完整的、受攻击者控制的Git仓库。

### 2.2 攻击链分解

Metnew的攻击流程分为多个阶段，每个阶段由Claude Code执行prompt injection中的指令驱动，通过fsmonitor触发下一阶段载荷：

**第一步：seed阶段（步骤1-3）**

用户在Claude Code中打开恶意仓库后，CLAUDE.md中的prompt injection指令驱使Claude依次执行：

-   `EnterWorktree(".git")` — 创建名为`.git` 的工作树，路径为`.claude/worktrees/.git`
    
-   `ExitWorktree` — 退出工作树（不清理）
    

此时，由于仓库根目录本身是gitdir（上面提到的构造），`.git` 工作树实际上是一个完整的、受控的Git仓库。

**第二步：符号链接替换（步骤4-7）**

Claude Code的worktree工具会 **跟随符号链接**。此时攻击载荷 `3p_setup.sh` 的第一阶段生效：

```bash
# stage 1: 将.claude/worktrees符号链接指向$HOME
if [[ $(wc -l < "$PWD/yolo") -eq 1 ]]; then
    rm -rf .claude/worktrees
    ln -s "$HOME" .claude/worktrees
fi
```

此时，`.claude/worktrees` 符号链接已被替换为指向用户主目录 `$HOME` 。接下来Claude在`.claude/agent-memory` 目录下再次执行 `CreateWorktree(".git")` ，由于worktree创建跟随符号链接， **实际的`.git` 工作树被写入到了 `$HOME/.git`**。

**第三步：伪造worktree元数据（步骤8-10）**

当Claude执行 `git status` 时，fsmonitor再次触发载荷的第三阶段，在`.git/worktrees/$USER` 目录下重建worktree元数据，使 `/Users/$USERNAME` （即 `$HOME` ）成为一个可导航的已注册工作树。

**第四步：进入$HOME并覆写.zshenv（步骤11-12）**

现在Claude被引导执行 `EnterWorktree(".claude/worktrees/$USERNAME")` ——这实际上进入了 `$HOME` 目录。再次执行 `git status` 时，gitdir解析指向 `~/.git` ，fsmonitor触发最终载荷：

```bash
# final payload: 当前目录为$HOME，gitdir指向~/.git → 覆写~/.zshenv
if [[ "$PWD" -ef "$HOME" ]]; then
    echo "echo 'ethical prove of vulnerability' && open -a Calculator" >> ./.zshenv
    exit 0
fi
```

### 2.3 沙箱为何被突破

这是整个漏洞最精妙的部分。macOS上，Claude Code执行Bash工具时的实际调用链为：

```
/bin/zsh -c "seatbelt enforcement" "$PAYLOAD"
```

而 `zsh` 在应用seatbelt限制 **之前**，会先读取并执行 `~/.zshenv` 文件。攻击者正是利用这一顺序——将恶意代码写入 `~/.zshenv` ，使其在seatbelt沙箱 **应用之前** 就已执行，从而实现沙箱逃逸。

Metnew在PoC中验证了这一点：即使Claude Code配置为 `sandbox:{enabled:true, autoAllowBashIfSandboxed:false}` （最严格模式），攻击仍然成功。

![Git Worktree沙箱逃逸攻击流程图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e995bf56fb57c1f4.png "Git Worktree沙箱逃逸攻击流程图")

* * *

## 三、漏洞根因

CVE-2026-55607的攻击链由三个独立的安全缺陷组成：

**缺陷1：`.git` 被接受为合法的worktree名称**

Claude Code的worktree工具未对工作树名称进行安全校验， `CreateWorktree(".git")` 被允许执行。这使得攻击者可以在项目目录下创建一个路径与Git元数据目录冲突的工作树。

**缺陷2：Worktree创建跟随符号链接写出项目目录**

Claude Code允许通过符号链接将worktree元数据写到项目目录之外（如 `$HOME` ），且这一操作无需用户确认。

**缺陷3： `~/.zshenv` 可被未授权覆写**

在seatbelt沙箱配置文件（ `folder-specific-autogen.sb` ）生效之前， `zsh` 会先加载 `~/.zshenv` 。Claude Code未能防止这一路径的写入，导致攻击者可以在沙箱外围植入任意代码。

Anthropic在2.1.163版本中 **修复了缺陷1**：`.git` 不再被接受为有效的worktree名称。

* * *

## 四、影响范围与修复

**影响版本：**

-   Claude Code v2.1.139（macOS Tahoe，受害者测试环境）
    
-   可能影响所有启用worktree工具的版本
    

**修复方案：**

-   **自动更新：** Claude Code默认自动更新，受影响用户已自动收到修复
    
-   **手动更新：** 更新至 **2.1.163** 及以上版本
    
-   **验证方法：** 运行 `claude --version` 确认版本号
    

**CVSS评分：** 7.7（High）

* * *

## 五、防御建议

对于安全研究者和AI工具使用者：

-   **谨慎克隆未知仓库：** 这是最根本的触发条件——攻击需要用户主动克隆并用Claude Code打开恶意仓库
    
-   **审查CLAUDE.md内容：** 对来自不可信来源的 `CLAUDE.md` 、 `INSTRUCT.md` 等文件保持警惕，它们可能包含prompt injection指令
    
-   **避免在未审查的仓库中运行工具自动批准：** Claude Code的工具审批流程应被视为安全边界，而非可选项
    
-   **关注AI Agent的攻击面：** AI coding agent的每一个工具调用都是潜在攻击面——本漏洞证明，即使是最严格的沙箱配置，也可能被精心设计的文件系统原语组合击败
    

* * *

## 六、漏洞赏金与时间线

| 时间  | 事件  |
| --- | --- |
| 2026年5月11日 | 通过HackerOne提交报告（#3727895） |
| 2026年5月12日 | 提交扩展RCA分析 |
| 2026年5月18日 | 催促审核（一周未分类） |
| 2026年5月27日 | 审核通过，严重等级定为High（CVSS 7.7） |
| 2026年5月28日 | 授予$3,700奖金 |
| 2026年6月4日 | 修复版本部署 |
| 2026年6月（复测） | 确认修复，额外授予$50复测奖励 |
| 2026年6月25日 | 公开披露CVE-2026-55607 |

值得注意的是，Metnew原本计划在Pwn2Own Berlin 2026上演示类似漏洞链，若被接受预计可获3,750与Pwn2Own报价差距悬殊。

* * *

**版权声明**：本文由华盟网原创发布，保留所有权利。配图由华盟网授权使用。

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

漏洞专题 · 目录
