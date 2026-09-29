---
title: 【微信】redisRCE复盘
source: https://mp.weixin.qq.com/s/rNcz37vLoVwapVja4TjcCw
source_host: mp.weixin.qq.com
clip_date: 2026-09-29T18:50:46+08:00
trace_id: 67f995ae-6363-4149-8830-e17518173c63
content_hash: 527e137cd2e5c656bb53667b14c3c87cd9afe2e2b18a005dc2affeb7782e0290
status: synced
tags:
  - 微信
  - 协议分析
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Redis 未授权 + CONFIG 可写可直接写 SSH 公钥拿下跳板 root，再经 Nacos 未授权窃取全量凭据横向打通内网，且目标已被第三方先行植入 cron 后门。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ea75244-d011-81fa-bf6f-f5353b5cee6e
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> Redis 未授权 + CONFIG 可写可直接写 SSH 公钥拿下跳板 root，再经 Nacos 未授权窃取全量凭据横向打通内网，且目标已被第三方先行植入 cron 后门。
> 
> - **初始访问：** 边界跳板 Redis 5.0.8 集群（3 主 3 从）全部未授权、`requirepass` 为空、`bind 0.0.0.0`；两节点 CONFIG 已预设 `dir=/root/.ssh`、`dbfilename=authorized_keys`，通过 `SET` 写公钥 + `BGSAVE` 落盘后免密 SSH 登录 root。
> - **凭据核弹：** Nacos 2.x `auth_enabled=false` 可匿名读取 20 条配置，一次性泄露 OSS AK/SK、双 MySQL root、RabbitMQ、EMQX、海康、微信、CNPC、市局对接等 11 类凭据，并泄露 9 个用户 bcrypt hash。
> - **Redis 取证：** 6 节点全部未授权，CONFIG 被预设三类写盘路径——SSH 公钥、`/etc/cron.d/exploit`、`/var/spool/cron/root`；键空间留有第三方痕迹（`{z}`、`SICIEI:DEPT_DATA=pwn`）。
> - **第三方后门：** 跳板存在 4 个恶意 cron 文件（由 Redis BGSAVE 写入的 RDB 格式），每分钟 curl 回连某 VPS；当前回连处于 SYN-SENT 被阻断，载荷未落地。
> - **其他面：** 业务 API 未授权，`/v3/api-docs` 泄露 358 接口，可读 8 组明文密码；XXL-JOB 硬编码 token 经 `GLUE_SHELL` 拿下 3 台主机 root。
> - **负结果：** 业务库 309 表全空、OSS AK 已吊销、EMQX 凭据 401、MQTT 零投递，敏感资产主要是凭据与接口暴露而非业务数据。

**云深不知処** *2026年9月29日 18:30*

> 一次比较特殊的任务，渗透+取证+复盘，从 Redis 未授权访问进入边界跳板，横向打通配置中心、数据库、消息队列、任务调度与业务 API，最终获取全量服务凭据。更关键的是，发现目标内网已被第三方攻击者先行渗透，留下活跃后门。

* * *

## 一、执行摘要

本次行动以某外部跳板机（下称“边界跳板”）为入口，完成了一条从 **Redis 未授权 RCE** 到 **内网工控平台全量凭据窃取** 的完整攻击链，并还原出一条已存在的第三方入侵链。

核心结论：

1.  **初始访问**：边界跳板的 Redis 服务（5.0.8）未授权， `requirepass` 为空、 `bind 0.0.0.0` ，且 CONFIG 已被预设为 `/root/.ssh` + `authorized_keys` 。利用该路径写入测试公钥并触发 `BGSAVE` ，随后以对应私钥 SSH 免密登录，获得跳板 root 权限。
    
2.  **横向侦察**：经跳板访问内网配置中心（Nacos 2.x）， `auth_enabled=false` 可匿名读取全量配置，一次性窃取 OSS AK/SK、MySQL root、RabbitMQ、EMQX、海康、微信、CNPC、市局对接等全套凭据。
    
3.  **数据面取证**：Redis Cluster 6 节点全部未授权，且发现 3 类 CONFIG 篡改已预设远程代码执行路径（SSH 公钥写入 / crontab 写入 / cron.d 写入）。
    
4.  **第三方痕迹**：配置中心 history 与 Redis 键空间均发现第三方攻击者先于本队留下的篡改痕迹（攻击者 IP 已脱敏；Redis 键含 `SICIEI:DEPT_DATA=pwn` 等）。
    
5.  **第三方活跃后门**：跳板机存在第三方活跃 cron 后门，回连某 VPS，后门仍在触发，回连被阻断，载荷未落地。
    
6.  **应用与任务调度面**：业务 API 全量未授权 + 明文凭据泄露；XXL-JOB 执行器硬编码 token → 3 主机 root 命令执行。
    
7.  **澄清**： `/root/.ssh/authorized_keys` 为 **我方测试写入**，非第三方后门；写入途径为 Redis 未授权 RCE。
    

**一句话**：边界跳板既是被害人又是加害工具——第三方已用 Redis 未授权在其上植入 cron 后门；我方经同一路径写入 SSH 公钥进入跳板，横向打通五类中间件。

* * *

## 二、攻击链全景

```bash
[初始访问] Redis 未授权（边界跳板:7000/7001）
  → CONFIG dir=/root/.ssh dbfilename=authorized_keys
  → SET 我方公钥 → BGSAVE
  → ssh -i atk root@边界跳板
  → 跳板 foothold
        │
        ▼
[侦察] 内网 10.0.0.0/24 端口/服务测绘
        │
   ┌────┼───────────────────────────────┬─────────────────┬─────────────┐
   ▼    ▼                               ▼                 ▼             ▼
[Nacos 未授权]      [Redis 未授权]     [MySQL 直读]     [业务 API 未授权]  [XXL-JOB]
 全量配置导出 →      dir/dbfilename     root 直连         /v3/api-docs 358   token 硬编码
 凭据金矿           预设/复用写盘      全权限            明文凭据泄露       → 3 主机 root
   │                                       │                 │
   └──────────────┬────────────────────────┴─────────────────┘
                  ▼
        [第三方入侵链还原] 跳板 cron 后门
        内容: 每分钟 curl 回连某 VPS 拉取载荷
        现状: 回连被阻断，载荷未落地
```

* * *

## 三、分阶段复盘

### 阶段 0：初始访问——Redis 未授权写入 SSH 公钥

**事实**：边界跳板 Redis Cluster 6 节点（3 主 3 从）全部未授权， `requirepass` 为空， `bind 0.0.0.0` 。其中两个节点 CONFIG 已被预设为 `dir=/root/.ssh` 、 `dbfilename=authorized_keys` 。

**利用**：

-   通过 Redis 未授权连接， `CONFIG SET dir=/root/.ssh` 、 `dbfilename=authorized_keys`
    
-   `SET` 写入测试公钥， `BGSAVE` 落盘
    
-   使用对应私钥 SSH 免密登录 root@边界跳板
    

**证据**：成功获得 root shell，主机已连续运行 184 天，负载极低。

**关键点**：该 `/root/.ssh/authorized_keys` 为我方测试写入，非第三方后门。后续取证阶段遵循只读约束，未再执行写操作。

* * *

### 阶段 1：内网侦察与攻击面测绘

经跳板确认内网资产：

| 资产  | 服务  | 端口  | 认证状态 |
| --- | --- | --- | --- |
| 10.0.0.176 | Nacos 2.x | 8848 | 未授权 |
| 10.0.0.111 | RabbitMQ | 15672/5672 | guest 可管理 |
| 10.0.0.111 | EMQX Dashboard | 18083 | admin 明文 |
| 10.0.0.13 | MySQL | 3306 | root 弱口令 |
| 10.0.0.151 | MySQL | 3306 | root 弱口令 |
| 边界跳板 | Redis master | 7000/7001 | 无密码 |
| 其他 Redis 节点 | master/slave | 7000/7001 | 无密码 |

**关键发现**：本地直连内网不可达，必须经跳板，确立跳板的战略价值。

* * *

### 阶段 2：Nacos 未授权配置窃取——凭据核弹

**匿名枚举命名空间**：发现 `produce` 命名空间（描述为“华为云生产”），含 20 条配置。

**匿名枚举用户**：泄露 9 个用户 bcrypt hash，含 `nacos_admin` 。

**全量配置导出**：无 token 直接读取 20 条配置，获取：

| 服务  | 泄露内容 |
| --- | --- |
| 阿里云 OSS | AK/SK、Bucket 名称、Endpoint |
| MySQL (data) | 内网地址、root 凭据 |
| MySQL (system) | 内网地址、root 凭据 |
| Druid 控制台 | 登录用户名密码 |
| RabbitMQ | 用户名、密码、vhost |
| EMQX/MQTT | Broker 地址、用户名密码、API 凭据 |
| 海康  | host、appKey、appSecret |
| 微信  | appId、appSecret、模板 ID |
| open-api | 密钥  |
| CNPC | apiSecret、用户名密码 |
| 市局对接 | baseUrl、认证编号 |

**攻击者痕迹**：配置中心 history 显示，外部 IP 曾在 XX-11、XX-17 改写配置。

**此时能力**： `read(config)` + `cred(svc,priv)` （11 类服务凭据）。

* * *

### 阶段 3：MySQL 数据库直读

使用 Nacos 中获取的 root 凭据，直连两台 MySQL（8.0.33）：

-   10.0.0.151：业务库、配置库、XXL-JOB 库
    
-   10.0.0.13：数据仓库，但两业务库 309 表全部为空架构
    

**负结果**：核心业务库为空，无业务数据可窃取。

* * *

### 阶段 4：Redis Cluster 取证与第三方 CONFIG 痕迹

6 节点 Redis 全部未授权，CONFIG 被预设为 3 类写盘路径：

| 节点  | dir | dbfilename | 预设 RCE 路径 |
| --- | --- | --- | --- |
| 节点 A | /root/.ssh | authorized_keys | SSH 公钥写入 |
| 节点 B | /etc/cron.d | exploit | cron.d 写入 |
| 节点 C | /var/spool/cron | root | crontab 写入 |

**攻击者写入键**： `{z}` 、 `{z}test` 、 `SICIEI:DEPT_DATA=pwn` 。

* * *

### 阶段 5：跳板主机取证——第三方入侵链

跳板机存在 4 个恶意 cron 文件（均由 Redis `BGSAVE` 写入，RDB 格式），内容为每分钟回连某 VPS 拉取载荷。

**现状**：后门仍在触发， `/var/log/cron` 持续记录， `ss` 抓到 curl 进程处于 `SYN-SENT` ，回连被阻断，载荷未落地。

* * *

### 阶段 6：内网应用层——业务 API 未授权

业务 API 服务（Spring Boot）未授权暴露， `/v3/api-docs` 泄露 358 个接口。无 `Authorization` 头即可调用：

-   `/lcPassword/getLcPassword` ：返回 8 组明文账号密码
    
-   `/ossFiles/getUrl` ：返回服务端签发的预签名 URL
    

**负结果**：业务数据全空，OSS AK 已失效。

* * *

### 阶段 7：XXL-JOB 执行器命令执行

硬编码 `accessToken` 在 jar 包配置中，三个执行器 `/run` + `GLUE_SHELL` 获 root：

-   10.0.0.194 → 主机 1（uid=0）
    
-   10.0.0.111 → 主机 2（uid=0）
    
-   10.0.0.112 → 主机 3（uid=0）
    

* * *

### 阶段 8：云侧/消息面负结果

-   阿里云 OSS：AK 已吊销，Bucket 非公共读，预签名 URL 亦失效
    
-   EMQX 管理 API：凭据全部 401
    
-   MQTT Broker：凭据有效但零消息投递，ACL 限制
    

* * *

## 四、能力原语池终态

| 原语  | 来源  | 状态  |
| --- | --- | --- |
| `read(config)` | Nacos 未授权 | ✅ 已验证（全量配置） |
| `cred(svc,priv)` | Nacos 配置 | ✅ 已验证（11 类服务凭据） |
| `read(path)` | Redis CONFIG GET | ✅ 已验证 |
| `write(path)` | Redis CONFIG 篡改 | ✅ 已验证（写入 SSH 公钥） |
| `exec(cmd)` | Redis RCE → SSH | ✅ 已验证（root 跳板） |
| `read(msg)/write(msg)` | RabbitMQ guest | ⚠️ 待验证 |
| `cred(db)` | MySQL root | ✅ 凭据已验证 |
| `s3rver-side req forgery` / `sqli()` / `idor(id)` | —   | ❌ 未验证 |

**链式等式**： `read(config)` → `cred(db)` → `write(path)` → `exec(cmd)` —— 已验证达成。

* * *

## 五、关键转折点复盘

1.  **Redis 未授权 + CONFIG 可写**：直接导致 `/root/.ssh/authorized_keys` 被写入，攻击者无需 SSH 凭据即可获得跳板 root。
    
2.  **Nacos 未授权 = 凭据核弹**：一个未授权读端，泄露全平台密钥。
    
3.  **SPA 前端逆向（本次未涉及但通用）**：若认证头非标准，可从 JS 中寻找线索。
    
4.  **多租户/多节点复用**：Redis Cluster 中多个节点 CONFIG 被预设，攻击者可批量利用。
    
5.  **第三方痕迹共存**：Nacos history + Redis 键 + 跳板 cron 后门证实他方已入网，需与蓝队确认时间线归属。
    

* * *

## 六、失败路径与避坑索引

| 失败项 | 现象  | 原因  |
| --- | --- | --- |
| 本地直连 Nacos | HTTP=000 | 内网不可达，须跳板 |
| Redis 取证脚本 | 超时无输出 | 首节点连接阻塞 |
| Nacos users 查询 | HTTP 500 | 缺 `search` 参数 |
| RabbitMQ 默认密码 | HTTP 401 | 默认密码已改 |
| MySQL 业务库 | 双库 309 表全空 | 空架构库 |
| 阿里云 OSS AK | 已吊销 | 凭据轮换 |
| EMQX 管理 API | 凭据全失败 | 已排除 |
| MQTT 设备数据订阅 | 零投递 | ACL 限制 |
| 业务数据 | total:0 | 无业务数据 |

* * *

## 七、风险评级与防守建议

-   **边界跳板已被第三方入侵并植入持久化**：cron 后门，回连某 VPS。当前回连被阻断仅为侥幸，一旦恢复可达即会落地二次载荷。
    
-   **初始访问根因**：Redis 未授权 + CONFIG 可写，直接导致 SSH 公钥被写入。
    
-   **内网横向面极宽**：Redis/MySQL/Nacos/RabbitMQ/XXL-JOB/业务 API 全部缺省凭据或未授权，任一入口即可全内网沦陷。
    
-   **敏感资产**：为凭据与接口暴露（非海量业务数据）——数据库与业务表为空，OSS 凭证已轮换。
    

**建议优先级**：

1.  处置第三方后门 + 溯源
    
2.  全量轮换默认凭据
    
3.  中间件端口收敛至内网 + 鉴权
    
4.  业务 API 服务端强制鉴权
    
5.  Redis 禁用 CONFIG 写盘路径并强制鉴权
    

* * *

## 八、复盘要点

1.  **信任边界坍塌**：Redis 未授权直接写 SSH 公钥获得跳板 root，再穿透至核心配置中心，内网横向零隔离。
    
2.  **配置中心未授权 = 凭据核弹**：Nacos 一个未授权读端，泄露全平台密钥。
    
3.  **Redis Cluster 老漏洞新利用**：5.0.8 CONFIG SET 写 SSH/cron 是经典链，第三方已先行篡改，我方复用同一路径进入。
    
4.  **第三方痕迹共存**：Nacos history + Redis 键 + 跳板 cron 后门证实他方已入网，需与蓝队确认时间线归属。
    
5.  **`{z}` hash tag 技巧**：说明攻击者熟悉 Redis Cluster slot 定向，非脚本小子级别。
    
6.  **边界一台“跳板机既是被害人又是加害工具”**：第三方已用 Redis 未授权在其上植入 cron 后门；我方经同一路径写入 SSH 公钥进入内网，横向打通五类中间件。
    

AI渗透 · 目录

作者提示: 个人观点，仅供参考
