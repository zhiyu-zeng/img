---
title: 【微信】10分漏洞：GitLab未授权任意文件读取
source: https://mp.weixin.qq.com/s/RJQI_HqqfmcS-3ImEvAXYQ
source_host: mp.weixin.qq.com
clip_date: 2026-09-12T09:20:32+08:00
trace_id: f8ada401-db20-43b1-96d7-98fb3aa055e9
content_hash: 5e42788f5a5a2369c1dab69d476175b243f9d0dade735c337e39b07422bf87b2
status: synced
tags:
  - 微信
  - 漏洞分析
  - Web安全
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: GitLab Workhorse 与 Rails 对 URL 路径的解析不一致，未认证攻击者可借末尾斜杠绕过前置路由，读取服务器任意本地文件（如含密钥的 gitlab.yml）。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3d975244-d011-81ef-bc23-f4f53afadfed
ioc:
  cves:
    - CVE-2026-85706
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GitLab Workhorse 与 Rails 对 URL 路径的解析不一致，未认证攻击者可借末尾斜杠绕过前置路由，读取服务器任意本地文件（如含密钥的 gitlab.yml）。
> 
> - **漏洞根因：** Workhorse 对 `/repository/commits` 做严格锚定匹配、将其视为上传请求，而 Rails 路由容忍末尾斜杠，两侧路径理解不一致。
> - **绕过手法：** 向 `/api/v4/projects/{id}/repository/commits/`（末尾带斜杠）发 POST，Workhorse 不匹配上传路由而直接转发给 Rails 的 Commits API。
> - **泄露条件：** Rails 在完成认证之前就读取 `file.path` 指定文件；文件内容含百分号等特殊序列时触发 Rack 表单解析器的反射型错误，内容随 HTTP 400 响应回显。纯文本文件（如 `/etc/passwd`）可被读取但未必外泄。
> - **前置条件与版本：** 仅需目标存在至少一个公开项目、无需登录、可访问 Web 端口；受影响 18.7.0–19.1.7、19.2.0–19.2.5、19.3.0–19.3.1，修复版为 19.1.8/19.2.6/19.3.2。
> - **危害与处置：** `gitlab.yml` 泄露数据库/Redis 连接、secret_key、otp_key、SMTP、LDAP/SSO、对象存储密钥，可进而打内网或伪造会话接管管理员；应升级、限制端口暴露、轮换全部相关凭据，并排查日志中末带斜杠的 commits 异常 POST。

**随笔漫记安全路** *2026年9月12日 09:03*

9月11日，vulhub提交了CVE-2026-85706的完整复现环境和PoC。这个漏洞允许未认证攻击者读取GitLab服务器上的任意本地文件——不需要登录，只需要目标GitLab上存在一个公开项目。

GitLab CE和EE都受影响。

* * *

**漏洞根因：Workhorse与Rails的路径理解不一致**

GitLab的架构中，Workhorse是前置代理，负责处理大文件上传等请求；Rails是后端应用服务器。漏洞出在两者对同一个URL路径的理解不一致。

**关键绕过：末尾斜杠**

## 末尾斜杠绕过手法

GitLab Workhorse有一条严格锚定的上传路由，用于匹配 `/repository/commits` 。攻击者在路径末尾加一个斜杠—— `/repository/commits/` ——Workhorse的严格锚定匹配失败，不把这个请求当作上传请求处理。

但GitLab Rails仍然把这个请求路由到Repository Commits API。

**攻击链：**

1.  攻击者无需认证，查询GitLab的公开项目API，找到一个公开项目
    
2.  向 `/api/v4/projects/{project_id}/repository/commits/` 发送POST请求，Content-Type为 `application/x-www-form-urlencoded`
    
3.  请求体中包含 `file.path` 参数，指向服务器上的任意本地路径（如 `/var/opt/gitlab/gitlab-rails/etc/gitlab.yml` ）
    
4.  Workhorse不匹配上传路由，直接转发给Rails
    
5.  Rails在认证用户之前先读取该文件
    
6.  如果文件内容包含特殊字符（如百分号序列），触发Rack表单解析器的反射型错误——文件内容出现在HTTP 400响应中
    

**核心问题：Rails在认证之前就读取了文件。** 认证是后面才做的，但文件已经读进内存了，内容通过错误响应泄露出来。

* * *

**PoC分析**

vulhub提供的PoC脚本（poc.py）非常简洁：

```bash
TARGET_PATH = "/var/opt/gitlab/gitlab-rails/etc/gitlab.yml"

# 1. 无认证查询公开项目
GET /api/v4/projects?visibility=public&simple=true&per_page=100

# 2. 向Commits API末尾加斜杠绕过Workhorse
POST /api/v4/projects/{id}/repository/commits/
Content-Type: application/x-www-form-urlencoded

# 3. 请求体中指定要读取的文件路径
file=&file.path=/var/opt/gitlab/gitlab-rails/etc/gitlab.yml&file.size=1&Content-Type=application/x-www-form-urlencoded
```

目标文件选择 `gitlab.yml` ——这是GitLab Omnibus启动时自动生成的配置文件，包含数据库连接、密钥、SMTP配置等敏感信息。而且这个文件本身包含百分号序列，能触发Rack的反射型解析错误，内容直接出现在HTTP 400响应体中。

* * *

## 内容泄露的条件性

**内容泄露的条件性**

漏洞代码会读取任意可访问路径，但内容是否泄露取决于文件内容：

-   **能泄露的文件**：内容包含特殊字符序列（如百分号），触发Rack表单解析器的反射型错误，文件内容出现在错误响应中
    
-   **不能泄露的文件**：内容能被正常解析（如纯文本 `/etc/passwd` ），文件被读取但不一定出现在响应中
    

PoC选择 `gitlab.yml` 正是因为它是应用原生生成的文件，内容确定能触发泄露——不需要往镜像里塞任何构造数据。

* * *

**影响版本**

## 影响与修复版本

| 版本范围 | 受影响 |
| --- | --- |
| 18.7.0 - 19.1.7 | 受影响 |
| 19.2.0 - 19.2.5 | 受影响 |
| 19.3.0 - 19.3.1 | 受影响 |

修复版本：19.1.8、19.2.6、19.3.2。

* * *

**前置条件**

1.  GitLab版本在受影响范围内
    
2.  目标GitLab上存在至少一个公开项目（公开项目是匿名访问漏洞接口的前提）
    
3.  攻击者能访问GitLab的Web端口（不需要登录）
    

公开项目这个条件门槛很低——大量GitLab实例用于开源项目托管，默认就有公开项目。

* * *

**泄露什么有价值**

`gitlab.yml` 中包含：

-   数据库连接配置（PostgreSQL主机、端口、数据库名）
    
-   Redis配置
    
-   GitLab密钥（secret_key、otp_key等）
    
-   SMTP邮件配置
    
-   LDAP/SSO配置
    
-   对象存储配置（S3/OSS密钥）
    

拿到这些配置信息后，攻击者可以进一步攻击内网数据库、Redis、对象存储，甚至伪造会话Cookie接管管理员账号。

* * *

**修复建议**

## 修复与凭据轮换建议

1.  **立即升级到修复版本**：19.1.8 / 19.2.6 / 19.3.2
    
2.  如果暂时无法升级，临时缓解：限制GitLab Web端口的公网访问，只允许VPN/内网访问
    
3.  检查 `gitlab.yml` 中的密钥是否曾泄露——如果GitLab曾暴露在公网且有公开项目，假设配置文件已被读取
    
4.  轮换以下凭据：数据库密码、Redis密码、secret_key、对象存储密钥、SMTP密码
    
5.  检查GitLab访问日志中是否有对 `/api/v4/projects/*/repository/commits/` （注意末尾斜杠）的异常POST请求
    

* * *

**参考链接**
