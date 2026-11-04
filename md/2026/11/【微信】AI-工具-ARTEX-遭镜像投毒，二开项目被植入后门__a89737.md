---
title: 【微信】AI 工具 ARTEX 遭镜像投毒，二开项目被植入后门
source: https://mp.weixin.qq.com/s/f0eNvO73cu4Xn3fLPv1cPQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T14:59:15+08:00
trace_id: 86da7ff8-5b64-4365-9d9a-e0a8f4b1892f
content_hash: 6b563f599ddf0621ecaf134c155d347e2eaa992395b0ccf9399a885d145b4301
status: synced
tags:
  - 微信
  - 安全工具
  - 恶意样本
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: ARTEX 渗透测试工具的高星 Fork 仓库遭 Docker 镜像投毒，部署即触发免认证 root 权限 RCE 后门。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40e75244-d011-81d7-a52a-cec08d82061f
ioc:
  cves: []
  cwes: []
  hashes:
    - ce85d8369ccc1a85423f1f75d2f3afaa2fab759e580da37a6891af2f7392745e
    - d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ARTEX 渗透测试工具的高星 Fork 仓库遭 Docker 镜像投毒，部署即触发免认证 root 权限 RCE 后门。
> 
> - **投毒手法：** commit `a4f4d38c` 仅改动 docker-compose.yml，将镜像 `autumn27/artex` 换成新注册账号 `tomicdd/artex`（注册到投放不足 1 小时），源码与脚本零改动，该镜像已被拉取约 7,954 次，涉事 Fork 曾有约 1.3K Star。
> - **后门逻辑：** 仅存在于预构建镜像内，登录接口 `/api/auth/login` 读取 `captcha` 字段，首字节为 `!` 时经 `sh -c` 执行剩余内容并回显输出，发生于密码校验之前且直接返回 200，等效免认证 root WebShell。
> - **检测盲区：** 镜像构建元数据声称基于 v0.3.16，而仓库源码停在 v0.3.15，恶意 `verifyCaptcha` 函数不在可见源码中，逐行审计源码无法发现后门。
> - **风险放大：** 上游因被用于 Storm-0940、VAPOR PANDA 等真实攻击而下架后，Fork 继续流通；仓库下线不消除风险，镜像仍在 Docker Hub，已部署实例的登录接口持续暴露。
> - **处置要点：** 停用该仓库及 Docker 部署，隔离主机、删除镜像与数据卷、更换全部凭证；可用 `docker images | grep tomicdd` 及镜像 digest `sha256:ce85d8...` 排查，替代方案须本地源码构建并跳过预构建镜像。

**N1bbl3** *2026年11月4日 13:00*

## AI 工具 ARTEX 遭镜像投毒，二开项目被植入后门

> 涉事 Fork 仓库曾获约 1.3K Star

## 事件概述

2026 年 11 月 3 日至 4 日，安全研究人员在 X 平台及 GitHub Issue 上公开披露，开源渗透测试工具 ARTEX 的 Fork 仓库 trhhubsd/ARTEX 存在后门：其 Docker Compose 部署路径引用的镜像 tomicdd/artex 被植入恶意代码，攻击者可通过登录接口以未认证方式执行任意系统命令。研究人员同时警告用户"不要尝试克隆该项目"。

## 背景

ARTEX 是由 Autumn-27 开发的多 Agent 自主渗透测试系统，采用 Go 后端、Next.js 前端与 PostgreSQL 存储，支持规划器与 Worker 共享资产图与探索图，具备人在回路审批与完整流量记录功能，曾获百度 agent+ 攻防挑战赛冠军。

2026 年 10 月，该工具被曝用于多起现实攻击活动，涉及微软追踪的 Storm-0940 与 CrowdStrike 追踪的 VAPOR PANDA 等行动，受害目标包括韩国金融机构及多国政府部门。原作者随后将上游仓库下架并停止维护。

上游停止维护后，多个 Fork 版本继续流通，trhhubsd/ARTEX 为其中关注度最高的仓库之一，2026 年 11 月 4 日核查时约有 1.3K Star、1.1K Fork。该仓库 README 推荐 Docker Compose 部署方式，并指定拉取 tomicdd/artex 镜像。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/57f8d78401836115.jpg)

## 投毒方式

根据 Issue #7 公布的分析，commit `a4f4d38c7b60f68abbda574aa59188063f2d86c` 仅修改 docker-compose.yml 一个文件，将业务镜像引用由 `autumn27/artex:${ARTEX_TAG:-latest}` 替换为 `tomicdd/artex:${ARTEX_TAG:-latest}` ，源码、文档与安装脚本均未改动。

Docker Hub 数据显示，账号 tomicdd 于 2026 年 10 月 8 日 18:50（UTC）注册，同日 19:08 创建镜像仓库，19:41 完成最后一次推送，账号注册与镜像投放间隔不足一小时。截至研究人员检查时，该镜像已被拉取约 7,954 次。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/daba4c59a0fde546.png)

## 后门技术分析

分析指出，恶意逻辑仅存在于预构建镜像中，仓库源码不包含任何恶意代码：镜像的 Go 构建元数据声称构建自 `github.com/Autumn-27/artex` v0.3.16，而仓库可见源码停留在 v0.3.15（commit e6ec569），其 auth.go 中不存在 captcha 字段与 verifyCaptcha 函数。逐行审计源码无法发现该后门。

后门位于登录接口 `/api/auth/login` 的处理逻辑中，行为如下：

1.  读取请求 JSON 中的 `captcha` 字段；
    
2.  若首字节为 `!`，剥离后将剩余内容传入 `verifyCaptcha` ；
    
3.  `verifyCaptcha` 通过 `os/exec.Command("sh", "-c", <remainder>).CombinedOutput()` 执行该内容，返回 stdout 与 stderr 组合输出；
    
4.  上述过程发生在用户名校验与 bcrypt 密码检查之前，后门触发时直接返回 HTTP 200，正常认证流程被跳过。
    

供核验的哈希值：镜像 digest `sha256:ce85d8369ccc1a85423f1f75d2f3afaa2fab759e580da37a6891af2f7392745e` ，镜像内 `/app/artex` 二进制 digest `sha256:d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573` 。

## 复现情况

正常登录请求返回 401 与错误信息：

```json
{"error":"用户名或密码错误"}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1f90a72a838bdb3a.png)

携带特定字段的请求：

```json
{"username":"x","password":"y","Captcha":"!id"}
```

返回 200 与命令执行结果：

```json
{"captcha":"uid=0(root) gid=0(root) groups=0(root)\n"}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/843309765451fa18.png)

`id` 可替换为任意命令。该后门构成无需认证、以容器 root 权限执行并回显输出的 WebShell。由于宿主为渗透测试工具，受影响主机上通常存有凭证、代理等敏感资产，实际风险进一步放大。

## 影响范围

-   任何按照该仓库 README 使用 `docker compose up -d` 部署的实例，均会拉取并运行含后门镜像；
    
-   仓库下线不改变既有风险：Docker Hub 上的镜像仍可能存在，已运行容器仍暴露该登录接口。核查期间该仓库曾一度恢复访问，且 compose 文件中的 tomicdd/artex 引用未被移除；
    
-   目前受到指控的仅为 tomicdd/artex 一个镜像仓库。Docker Hub 上存在其他同名系镜像（如 mianhuatang11/artex）
    

## 处置建议

应立即停止使用 trhhubsd/ARTEX 仓库及其推荐的 Docker 部署方式。已部署的用户建议断网隔离并停止容器，删除相关镜像与数据卷，更换主机上的全部凭证，同时排查持久化后门与横向移动痕迹。可通过 `docker images | grep tomicdd` 初步排查，并使用上文的镜像 digest 进行精确比对。

仍需使用 ARTEX 的用户应从源码本地构建，跳过所有预构建镜像，选用其他维护分支前自行验证完整性。此外建议对安全工具的 Docker 镜像执行 digest 校验与二进制、源码比对，并限制管理端口的网络暴露。

## 参考来源

以上结果引自公开研究者的验证材料。

欢迎评论。

作者提示: 个人观点，仅供参考
