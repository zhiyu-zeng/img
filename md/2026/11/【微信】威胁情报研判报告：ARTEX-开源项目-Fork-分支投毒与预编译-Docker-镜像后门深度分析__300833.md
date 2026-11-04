---
title: 【微信】威胁情报研判报告：ARTEX 开源项目 Fork 分支投毒与预编译 Docker 镜像后门深度分析
source: https://mp.weixin.qq.com/s/zWN5bTnJ7jRvE8s8Sw8MgQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T16:53:20+08:00
trace_id: 32657ba9-5da0-4201-9119-bb75c8d19cb6
content_hash: b89f9457ff0522a5837623f28fc4a626375edb0ffc5b62268b97afe98abf862b
status: synced
tags:
  - 微信
  - 供应链投毒
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 攻击者借 ARTEX 原作者停更闭源的空档，通过高星 Fork 仓库诱导用户拉取预编译 Docker 镜像，在其中植入免认证 root 权限 WebShell，精准伏击红队与安全从业者。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40e75244-d011-8163-844d-d31428b7b0a8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 攻击者借 ARTEX 原作者停更闭源的空档，通过高星 Fork 仓库诱导用户拉取预编译 Docker 镜像，在其中植入免认证 root 权限 WebShell，精准伏击红队与安全从业者。
> 
> - **投毒路径：** 攻击者 Fork 出 trhhubsd/ARTEX（星标超千），篡改 docker-compose.yml 将官方镜像替换为自建的 tomicdd/artex:latest，并借 Kitploit、AI/TLDR 等聚合站自动收录裂变传播；该镜像曝光前已被拉取 7,954 次。
> - **后门机制：** 镜像内预编译 Go 二进制 /app/artex 在 /api/auth/login 接口检查 captcha 字段，首字符为 "!" 时截取其后内容，调用 os/exec.Command("sh","-c",cmd) 执行；触发点位于 bcrypt 密码校验之前，攻击者无需任何账号密码，且以容器内 root 权限运行。
> - **隐蔽手法：** 仓库公开源码 auth.go 中完全不存在 captcha 校验逻辑，源码与镜像二进制不一致，利用预编译黑盒规避静态审计；命令回显被封装进 captcha 键并强制返回 200 OK，与正常 401 响应形成差异。
> - **威胁定位：** 目标直指部署该 LLM 渗透框架的红队人员与安全工程师，意在窃取内网凭证及 OpenAI/Claude 等大模型 API Key；若按常见方式挂载 /var/run/docker.sock，root 指令可直通宿主机。
> - **处置要点：** 立即 docker-compose down -v 并删除 tomicdd/artex 镜像、排查横向移动；可在 Nginx/WAF 以正则拦截含 "captcha":"!..." 的请求体；长期应基于审计后源码本地 docker build，并用镜像 Digest 锁死替代浮动 :latest 标签。

**开源情报技术研究院** *2026年11月4日 15:39*

## 一、 执行摘要 (Executive Summary)

2026 年 10 月下旬至 11 月初，安全研究人员揭露了一起针对自动化渗透测试工具生态的典型开源供应链投毒攻击。攻击目标为热度较高的多 Agent LLM 自主渗透测试框架ARTEX（原作者 Autumn-27）。

攻击者利用原作者因工具被滥用而暂停维护并闭源的空档期，通过高热度 Fork 仓库 trhhubsd/ARTEX（星标超千）篡改 docker-compose.yml 配置，诱导用户从公开源拉取攻击者预先构建并嵌入暗桩的 Docker 镜像 tomicdd/artex:latest。经逆向分析证实，攻击者在 Docker 镜像内部打包的 Go 预编译后端可执行文件 /app/artex 中植入了未认证的 WebShell 触发逻辑：利用登录接口的未过滤参数直接以 root 权限执行任意系统 Shell 指令并即时回显。

该恶意分支不仅扩散迅速，更被多家知名安全聚合平台（如 Kitploit、AI/TLDR 等）自动收录推广，对部署了该镜像的红队人员、渗透测试工程师及安全研发环境构成了严重的凭据泄露与主机失陷风险。

## 二、 威胁实体与事件演进时间线

\[2026-10 前期\] ARTEX 官方仓库因遭黑客组织与网络犯罪滥用，作者宣布暂停更新并转为闭源

│

\[2026-10-08 18:50 UTC\] 攻击者注册 Docker Hub 账户 tomicdd

│

\[2026-10-08 19:41 UTC\] 攻击者上传携带后门的恶意镜像 tomicdd/artex:latest

│

\[2026-10 中旬\] trhhubsd/ARTEX 仓库提交修改：

│ Commit a4f4d38c7b6ef68abbda574ae59188063fd286c

│ 将官方镜像替换为 tomicdd/artex:latest，并通过 README 指引用户一键部署

│

\[2026-10-18 ~ 10-20\] Kitploit、AI/TLDR 等外部开源安全工具平台收录 trhhubsd 的恶意部署指南

│

\[2026-11-03 ~ 11-04\] 安全研究人员（ZADDY、Todd Schertz 等）在 X 与 GitHub Issue#7曝光后门细节

## 三、 深度技术逆向与后门机制

## 1\. 虚假源码掩护与预编译投毒

代码脱节：trhhubsd/ARTEX 仓库表面展示的代码声称构建来源为官方 \[github.com/Autumn-27/artex\](https://github.com/Autumn-27/artex) 镜像构建环境（Git commit e4ec569，版本 v0.3.16）。但在其公开的 Go 源码 auth.go 中，完全不存在captcha 参数的校验逻辑，更无 verifyCaptcha 函数。

闭源替换：攻击者利用 Docker Hub 托管的预编译二进制容器镜像的黑盒特性，直接在镜像内置的 /app/artex 二进制文件中植入了恶意构建代码。该镜像在被曝光前已被拉取达7,954 次。

## 2\. 后门触发链与漏洞成因

│

├──> 解析 JSON Payload

│ │

│ ├──> 提取 "captcha" 字段

│ │ │

│ │ ├── 首字符为 '!' (Trigger) ──> \[截取! 后的 Payload\]

│ │ │ │

│ │ │ ▼

│ │ │ \[调用 verifyCaptcha()\]

│ │ │ │

│ │ │ ▼

│ │ │ os/exec.Command("sh", "-c", cmd)

│ │ │ │

│ │ │ ▼

│ │ │ \[拦截常规流程，强行返回 200\]

│ │ │ HTTP/1.1 200 OK

│ │ │ {"captcha": "STDOUT+STDERR"}

│ │ │

│ │ └── 首字符非 '!' / 无该字段

│ │

▼ ▼

\[正常业务逻辑：校验用户名与密码 (bcrypt 比较)\]

绕过认证：后门函数的执行位置在 bcrypt 密码哈希校验之前。这意味着攻击者完全不需要知道目标系统的任何管理员账号或密码。

高危执行权限：由于容器内主程序以特权进程运行，通过 sh -c 执行的命令直接具备容器内的root 权限。

隐蔽回显：即使正常用户在此接口发送错误密码，系统会返回 401 Unauthorized；而一旦携带触发前缀!，接口将被强制劫持并返回 200 OK，把系统回显封装至 captcha 键中：

JSON

// 请求示例

POST /api/auth/login

Content-Type: application/json

{"username": "x", "password": "y", "captcha": "!id"}

// 响应示例 (HTTP 200)

{"captcha": "uid=0(root) gid=0(root) groups=0(root)\\n", "error": ""}

## 四、 MITRE ATT&CK® 战术与技术映射

| 战术阶段 (Tactics) | 技术编号 (Techniques) | 具体恶意行为描述 |
| --- | --- | --- |
| 初始访问 (Initial Access) | T1195.001 / T1195.002 | 供应链妥协 (Supply Chain Compromise)：修改开源仓库构建指引，指向恶意的 Docker Hub 镜像<response-element class="no-md" ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-footnote class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-footnote></response-element>。<sources-carousel-inline ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-inline-chip class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-inline-chip></sources-carousel-inline> |
| 执行 (Execution) | T1059.004 | Unix Shell 命令执行：通过 Go 底层 os/exec.Command("sh", "-c",...) 执行任意命令<response-element class="no-md" ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-footnote class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-footnote></response-element>。<sources-carousel-inline ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-inline-chip class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-inline-chip></sources-carousel-inline> |
| 持久化 (Persistence) | T1505.003 | Web 应用程序后门 (Web Shell)：利用登录接口参数隐蔽触发代码执行<response-element class="no-md" ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-footnote class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-footnote></response-element>。<sources-carousel-inline ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-inline-chip class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-inline-chip></sources-carousel-inline> |
| 防御规避 (Defense Evasion) | T1027 | 二阶段混淆/源构件不一致：Git 仓库代码与 Docker 镜像内二进制构建物不一致，规避纯文本源码静态代码审计<response-element class="no-md" ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-footnote class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-footnote></response-element>。<sources-carousel-inline ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-inline-chip class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-inline-chip></sources-carousel-inline> |
| 特权提升 (Privilege Escalation) | T1611 | 容器逃逸潜在风险：如果用户按照常见部署挂载了宿主机 /var/run/docker.sock 或重要系统目录，root 权限指令可直通宿主环境<response-element class="no-md" ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-footnote class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-footnote></response-element>。<sources-carousel-inline ng-version="0.0.0-PLACEHOLDER" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"><source-inline-chip class="ng-star-inserted" style="font-family: "Google Sans Text", sans-serif!important; line-height: 1.15!important; margin-top: 0px!important; margin-left: 0px!important; margin-right: 0px!important;"></source-inline-chip></sources-carousel-inline> |

## 五、 威胁研判与风险评估

定向攻击红队/安全圈从业者：ARTEX 本质是 LLM 赋能的自主黑客渗透系统。采用此类工具的人员往往拥有高权限跳板机、云服务器或内网管理权限。攻击者通过供应链精准伏击安全从业人员，其窃取目标通常直指企业内网接入凭证、API 密钥（包括 OpenAI/Claude 大模型 Key）及自动化扫描资产。

“影子”镜像分发机制防不胜防：开源社区普遍存在“轻二进制校验、重 Star 数量”的信任盲区。攻击者通过 Fork 并刷取高关注度，成功借由 Kitploit 等工具聚合站裂变传播，放大了受害面。

## 六、 威胁指标清单 (IOCs)

## 1\. 供应链与镜像实体

恶意 Docker 镜像：tomicdd/artex:latest

Docker 镜像 Digest：

sha256:ce85d0369cc11a85423f1f75d273afaa2fab759a588da37a6891af2f7392745

二进制文件 (/app/artex) SHA256：

05075bf2262effe216eb40711343bffb0f287f39208d887dfdfdc573f601573

恶意 GitHub 仓库：trhhubsd/ARTEX

恶意 Commit 哈希：a4f4d38c7b6ef68abbda574ae59188063fd286c

## 2\. 网络请求与利用特征

HTTP Method：POST

请求体指纹：JSON 体中包含 "captcha": "!"

响应体特征：HTTP 状态码为 200，且返回体包含 JSON 键 "captcha"（值为命令终端标准输出）。

## 七、 应急处置与纵深防御加固措施

## 1\. 紧急阻断与宿主机失陷排查

切断容器并清理镜像：

Bash

## 停止并清理容器服务

docker-compose down -v

## 彻底删除被投毒的本地恶意镜像

docker rmi -f tomicdd/artex:latest

docker image prune -a

排查横向移动与反弹 Shell：

## 2\. WAF / 反向代理检测与拦截规则

若前端配置了 Nginx 或 WAF，可直接配置精准拦截规则，阻断包含! 语法触发的登录包：

Nginx

## Nginx 阶段性拦截配置示例

## 限制仅允许合法长度与结构的 JSON

if ($request_body ~\* '"captcha"\\s\*:\\s\*"!.\*"') {

return403;

}

proxy_pass http://artex_backend;

}

YAML

## 伪代码 / Suricata 规则特征示例

alerthttpanyany->anyany(msg:"EXPLOITARTEXForkBackdoorWebShellAttempt";flow:established,to_server;content:"POST";http_method;content:"/api/auth/login";http_uri;content:"\\"captcha\\"";http_client_body;content:"\\"!";distance:1;within:5;classtype:web-application-attack;sid:2026110401;rev:1;)

## 3\. 开源组件安全规范反思

杜绝直接使用第三方预编译公共镜像：对于安全敏感工具，应坚持“基于经过安全审计的源代码，自行本地执行 docker build”，杜绝直接引用非官方认证的个人 Docker Hub 仓库镜像。

实施镜像指纹锁死（Digest Pinning）：若必须拉取公共镜像，必须绑定不可变的唯一哈希值（如 image@sha256:...），而非易受篡改浮动的:latest 标签。
