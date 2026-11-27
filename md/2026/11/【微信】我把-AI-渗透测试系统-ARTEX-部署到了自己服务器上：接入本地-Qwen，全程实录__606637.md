---
title: 【微信】我把 AI 渗透测试系统 ARTEX 部署到了自己服务器上：接入本地 Qwen，全程实录
source: https://mp.weixin.qq.com/s/TYAyzy73yYSsyWWFGXoHmw
source_host: mp.weixin.qq.com
clip_date: 2026-11-28T05:43:22+08:00
trace_id: 411d7482-0670-40cd-a284-d176568d3e2e
content_hash: 64ef3dae4b0612954816ded7ab80a401c07be4357168bf31e75079978e97e7b1
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 42575244-d011-8163-8ab9-c5bb5f5bacb1
ioc: null
---

**网络安全启蒙** *2026年11月26日 17:30*

> 声明：本文所有操作均在 **自有设备与授权环境** 下进行。渗透测试工具仅可用于授权测试、防御与检测目的，对未经书面授权的系统进行扫描、探测或利用均属违法行为。

* * *

## 一、AI 渗透测试，从"演示"走到了"能跑"

去年还到处是"AI 渗透"的 PPT 演示，今年已经出现了开箱即用的完整系统。这次要聊的是 **ARTEX**——一个 LLM 多智能体驱动的自主渗透测试系统，Go 单体后端 + 内嵌 Next.js 前端 + PostgreSQL，数据全部本地存储。

它是中国开源项目 **Autumn-27/ARTEX** （AGPL-3.0）的全球化分支（ `haiqingge/artex-global` ），默认英文界面，可在设置中切换中文、韩文、西班牙文、日文。我部署的版本是 **v0.3.15-global.1**，把它接上局域网里的本地 Qwen3.8-27B，派去测一台内网授权设备—— **连续跑了 24 小时，找出 13 个确认漏洞**。下文全是真实截图和落盘数据。

先给一个不太寻常的背景信息：README 里明确记载，2026 年 10 月有韩国媒体报道，调查机构在针对韩国金融机构的个人信息泄露事件中发现了 ARTEX 被使用的迹象（调查进行中）。这句话有两层含义——一是这类工具确实已经进入实战使用；二是提醒我们，把它用在授权环境之外是真实的刑事风险。

## 二、它不是"套壳扫描器"，核心是双图架构

翻开 README 的技术架构部分，能看到它和常见"AI 漏洞扫描器"的本质区别： **Agent 不是在一轮对话里输出结论，而是在两张图上持续累积信息**。

-   • **资产图** （assets / companies / task_scope）：被测目标的资产清单，Agent 探索过程中持续写入；
    
-   • **探索图** （exploration_nodes / anchors / activity）：Agent 的攻击路径与决策链路，每一步都留痕。
    

**四类 Agent 角色分工明确**： `goals` 负责目标分解； `planner` 是唯一的意图生成者，靠多轮共享 todolist 稳定攻击链路； `worker` ×N（默认 3 并发）实际动手跑工具； `mainagent` 是人在环路的对话入口。

另外它支持 **MCP** （Streamable HTTP / SSE 两种协议）、可编辑的 skills（改文件即生效，不用重建镜像）、还能从 **ScopeSentry** 一键同步资产进资产图。Docker 镜像自带 ripgrep / curl / nmap / npm 等常用工具链，开箱即可干活。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f7ca97408bc0b535.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b97ef92ae724ae2c.png)

## 三、三个值得点赞的工程设计（都有界面可看）

**1\. 工具审批门（guard / intercept）**：Worker 调用的每个高危操作都要过审批。界面里有全局「审批记录」、任务内「拦截审批」和对话中的审批卡片，可以展开看完整调用详情。AI 干活，关键动作人来把关。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c5d3674981826916.png)

**2\. 流量记录代理**：Agent 的 Bash / HTTP 请求全程走 MITM 代理，CA 证书留痕，流量界面可以回放——取证和复现都有据可查。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/24d0a88a92f1e806.png)

**3\. 漏洞复测 Agent（retester）**：漏洞修完可以发起独立复测会话，结论分「仍可复现 / 已修复 / 无法确认」，原始证据永远保留。这是把渗透测试的 **闭环** 做进去了，不只是"扫一遍出报告"。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/03d86ab081f1b4f0.png)

## 四、部署实录：三个坑 + 一个惊喜

我的环境是 Deepin Linux + Docker 26，全程 Docker Compose 部署。以下是真实经历，供后来者避坑。

**坑一：apt 里没有 `docker-compose-plugin` 。** 这个包只存在于 Docker 官方源，Ubuntu/Debian 自带源里装不到。报错时别怀疑自己，去加 `download.docker.com` 的源，或者直接从 GitHub Releases 下载插件二进制放进 `/usr/local/lib/docker/cli-plugins/` 。

**坑二：GitHub 下载三次超时。** 国内网络访问 GitHub 不稳，compose 插件二进制下载三次失败后回退装了 v1（1.29.2）。ARTEX 的 compose 文件没有 `version:` 字段、还用了 `depends_on.condition: service_healthy` ，老版本 v1 解析可能出问题。建议启动前先跑一句 `docker compose config` 预校验。

**坑三：apt 装包时弹 needrestart 服务重启确认框。** 列表里有桌面组件， **直接选「取消」**——装 compose 不需要重启任何服务，选确认有把图形会话搞崩的风险。

**惊喜：ghcr.io 镜像居然一次拉通。** `ghcr.io/jiwoochris/artex-global:latest` 用了 458 秒拉完，没走任何镜像加速。不通的话用 `ghcr.nju.edu.cn` 先 pull 再 `docker tag` 重打标签。

## 五、首次运行保护：这个安全设计我要单独夸

启动后我没有立刻拿到后台，而是先看到这个机制：

```
[auth] the admin password has not been set yet.
       Setup token: ******
[auth] This token is never sent over the network
       and is only visible in this console log
```

**设置令牌只打印在服务器控制台日志里**， `/setup` 页面必须凭它才能创建管理员密码，错误尝试会被限速。配合"默认只绑定 127.0.0.1"的端口策略，无人值守部署时也不会留下裸奔的管理后台。修改密码会使所有旧会话失效，令牌签名密钥与密码哈希绑定。这套设计说明作者认真想过"部署期"这个最容易被忽略的攻击面。

中文切换也很顺：左侧栏 **System → System settings → Display language**，下拉选「中文」立即生效，无需保存。而且它是 **界面语言 + Agent 输出语言双写**——切一次，报告、摘要、对话回复全都跟着变。（一个设计取舍提前说明：Agent 的内部推理提示词保留原始语言，所以过程日志里会夹杂英文/韩文，这是设计如此。）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5a9f5345f943eea6.png)

## 六、接入本地 Qwen3.8-27B：三行配置

不想把渗透测试的上下文发给外部 API，我用局域网里另一台机器上的 vLLM 跑了 **Qwen3.8-27B-FP8** （262K 上下文）。ARTEX 支持任意 OpenAI 兼容端点，`.env` 三行搞定：

```toml
ARTEX_LLM_PROVIDER=openai
ARTEX_LLM_MODEL=Qwen3.8-27B-FP8
ARTEX_LLM_BASE_URL=http://192.168.x.x:8000/v1
```

注意 `OPENAI_API_KEY` 必须非空（本地 vLLM 不校验，填个占位值即可），改完 `docker compose up -d` 重建容器生效。UI 里的「LLM 配置」页也能填，效果相同。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2d82998155c73725.png)

**一个关键提醒：Agent 强依赖 tool calling。** vLLM 启动时务必带上 `--enable-auto-tool-choice --tool-call-parser hermes` 。没开的话 Qwen 会只回文本不调工具，Agent 表现为"光说不练"。这是所有本地模型接 Agent 框架的通用坑，不只是 ARTEX 的问题。

## 七、24 小时实跑：它给一台内网设备找出了 13 个漏洞

部署不是终点。我给它派了一个"毕业考试"：对一台 **内网授权测试设备** 做全量安全测试（目标融合了 Web 管理后台、SSH 服务、私有 WebSocket 协议等多种攻击面，Web 后台给了已知账号）。任务启动后 **连续跑了 24 小时** 还没停——以下数据截至发稿，来自它落盘的 planner / worker 转录记录。

**战果：13 个确认漏洞**，包括宿主机 root 级控制链、凭据库明文存储、凭证伪造导致的认证绕过、未授权文件读取等——数条漏洞串成了完整攻陷链。资产覆盖度推进到 **68%** （接口 2/3、服务 10/14），还有 7 条探索意图在并行推进中。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59ab8ee3b80d7665.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1ec9e9200af17554.png)

但比"找到几个洞"更让我印象深刻的是 **planner 的纪律性**——这是从转录日志里逐字看到的：

1.  1\. **阴性关闭，带证据**。一个方向跑完没戏，它不是悄悄放弃，而是写下"单连接三主判据逐字对照基线"级别的判据，把方向标记为永久关闭，防止后续 worker 重复撞墙。判定逻辑全程可审计。
    
2.  2\. **前置依赖未产出，坚决不硬派意图**。规划者明确写道："现在派'越权/SQLi/上传利用'，worker 拿不到接口清单，只会重复登录、重复测绘，与在跑意图撞车。等下次唤醒图更新再派，正是流程设计。"——AI 系统里少见的"知道自己该等什么"。
    
3.  3\. **心跳驱动的自我纠偏**。探索停摆时心跳机制会唤醒 planner，强制它"必须产出新意图或做出裁决，不得产出 0 动作"——任务跑一整天不会因为一次对话结束就断线。
    
4.  4\. **穷尽性目标不提前盖章**。13 个漏洞在手，它仍判定"'测试所有'是穷尽性目标，未穷尽前禁止提前报告完成"，继续派方向补覆盖。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b10b1488c490d534.png)
    

证据链也完整： `data/tasks/` 下每个探索迭代一个目录，探针脚本、抓取的配置文件、SSH 密钥材料、命令输出全部落盘； `data/traffic/` 存流量记录， `data/transcripts/` 存每一次 LLM 对话原文。出报告时每条漏洞都有证据可回溯——这套取证设计对"AI 渗透结果到底可不可信"给出了工程答案。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/62a99270d52657cc.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2382788180f1345.png)

## 八、它适合谁？

-   • **安全团队 / 红队**：授权渗透测试的自动化执行层，审批门 + 流量留痕让"AI 干活"可控可查；
    
-   • **蓝队 / 检测方**：README 明确说了定位是"授权环境下的防御与检测用途"——用它模拟攻击路径来验证防御有效性和告警覆盖，可能是更现实的用法；
    
-   • **SRC / 漏洞复测**：retester Agent 的复测闭环对乙方交付和内部修复验证都很实用；
    
-   • **研究者**：双图架构 + norma SDK（agentcore / tool / permission / memory / transcript）是个值得研究的 Agent 工程范本。
    

上手最快的路径就是 Docker Compose 三件套：

```bash
git clone https://github.com/haiqingge/artex-global.git
cd artex-global && cp .env.example .env
# 设置 POSTGRES_PASSWORD
docker compose up -d
# 打开 http://localhost:8787/setup
# token 取法：docker compose logs artex | grep '[auth]'
```

* * *

**最后说清楚边界**：本文的实跑数据来自一次仍在进行中的任务（发稿时 13 个漏洞、68% 覆盖度、7 条意图在推进），任务结束后的最终报告、误报率、与人工渗透的对比留到实测篇续文。文中涉及目标的信息已全部脱敏（内网地址、设备型号、私有协议名、漏洞端点均已隐去），仅保留漏洞类别与过程数据。工具本身 AGPL-3.0 开源，架构文档写得相当诚实——包括"上游仓库已不可达"这样的信息都如实标注。

AI 渗透测试这条线，值得持续盯。

（文中版本信息、架构描述均来自仓库 README 与实测部署日志；实跑数据提取自 ARTEX 本地落盘的 planner/worker 转录；韩国金融机构事件引自 README 记载的媒体报道，供参考。）
