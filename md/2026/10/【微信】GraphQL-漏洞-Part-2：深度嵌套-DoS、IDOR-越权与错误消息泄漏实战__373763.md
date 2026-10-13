---
title: 【微信】GraphQL 漏洞 Part-2：深度嵌套 DoS、IDOR 越权与错误消息泄漏实战
source: https://mp.weixin.qq.com/s/Mko0iLQgm-BZqQ-YCstoWQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-13T09:20:09+08:00
trace_id: aa081c3a-9c0e-4931-bc3b-9004e78decb8
content_hash: 341c6e9373265726d8207195f7d37b9ec8c4f620dd06697402c7efc22541d3bc
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: GraphQL 把安全责任全推给服务端，深度嵌套 DoS、字段 IDOR 和错误消息泄漏是渗透中最易得分的三条攻击路径。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f875244-d011-811c-b8b0-ceee403f6d0b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> GraphQL 把安全责任全推给服务端，深度嵌套 DoS、字段 IDOR 和错误消息泄漏是渗透中最易得分的三条攻击路径。
> 
> - **错误泄漏：** 类型不匹配、直接查 `__typename`/`__schema`、嵌套死循环触发 N+1 时，verbose error 会回吐栈信息、字段名、ORM 的 SQL 乃至内部路径；多数团队只关内省，忽略错误返回入口。
> - **深度递归 DoS：** fragment 自关联 100 层的 PoC 可秒级打爆无深度限制的服务端；DVGA 另列批处理、资源密集查询、字段复制、别名爆炸共 5 类。防御需在 query AST 上同时做深度限制、别名数量限制与复杂度评分。
> - **字段 IDOR：** `singleUser(user: 1)` 递增枚举即可读取他人 apiKey、姓名、生日；用别名在一请求内批量越权（`u1: singleUser`）可同时压垮授权层。
> - **工具链：** Burp 装 InQL（自动 introspection + schema 树形展示）与 GraphQL Raider（内置批处理、深递归、字段复制 payload）；练手用 DVGA，`docker-compose up -d` 开本地 5000 端口，分 Beginner/Expert 两档。
> - **防御五要点：** 生产关 introspection 并隐藏堆栈、强制 persisted query 白名单、嵌套限 8-10 层且别名 ≤100、每个 resolver 做 `ctx.user` 字段级授权、每 HTTP 请求限约 5 个 query。

**黑白之道** *2026年10月13日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：GraphQL 把数据查询权交给客户端，看似收敛了攻击面，实际上把权限校验、深度限制、错误处理这些活全压到了服务端。本文是 learn365 day21 翻译与拓展，从红队视角讲三种最容易在渗透测试中拿分的攻击路径。

* * *

## 一、错误消息信息泄漏

和所有接口一样，GraphQL 也会泄漏调试信息。给端点喂畸形或不合预期的输入，verbose error message 会把后端栈、对象结构、字段名、甚至内部文件路径一股脑回吐出来。

实战中最常见的三类触发：

-   **类型不匹配**：把字符串塞进 Int 字段，看响应是不是抛 `Expected type Int!` 之类的栈跟踪
    
-   **未知字段**：直接查 `__typename` 、 `__schema` ，很多关掉内省的端点其实没关错误细节
    
-   **嵌套死循环**：在看似无关联的两个对象上互相套娃，触发 N+1 错误时经常连 ORM 内部 SQL 一并显示
    

OWASP-SKF 在 KBID-285 里专门把这一类单独列出，因为多数团队只想着关内省，忘了错误返回也是信息泄漏入口。

![三大攻击面示意图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66c8d82ebce09079.png "三大攻击面示意图")

## 二、GraphQL 拒绝服务

服务端没限制查询深度，攻击者就能写出无限嵌套的递归查询，把 CPU、内存、连接池全打爆。KBID-285 GraphQL DOS 实验就一句话： **向 GraphQL 端点发送任意深度的嵌套查询，观察后端是否异常**。

DVGA（Damn-Vulnerable-GraphQL-Application）整理了 5 种 DoS 路径：

| 攻击类型 | 原理  | 杀伤力 |
| --- | --- | --- |
| 批处理查询 | 单 HTTP 请求里塞几十上百个 query | 服务端并发 worker 耗尽 |
| 深度递归 | 自关联字段无限嵌套 | CPU 占满，堆内存爆掉 |
| 资源密集查询 | 多对象关联回同一张大表 | 数据库被 N+1 拖垮 |
| 字段复制 | 同字段重复几百遍 | JSON 序列化器跑满 |
| 别名爆炸 | 一个 query 里起几百个别名调同一 resolver | 短时间把内部 API 配额耗光 |

最容易打出效果的是深度递归。一条典型 PoC（fragment 自关联 100 层）：

```
fragment NestedUser on User {
  id
  name
  friends {
    ...NestedUser
  }
}
query Attack { me { ...NestedUser } }
```

没有深度限制的服务端秒级堆爆。修复就一条：在 query AST 上做 **深度限制 + 别名数量限制 + 复杂度评分** 三件套，单点都拦不住，全部上才有冗余。

## 三、字段 IDOR 越权

和普通 API 的 IDOR 没本质区别。GraphQL 字段就相当于 RESTful 的端点，权限校验没跟上，一查一个准。

KBID-285 IDOR 的 writeup 给了一段教科书例子——DVGA 里查询用户设置页的 query：

```
{
  singleUser(user: 1) {
    apiKey
    name
    surname
    dateOfBirth
  }
}
```

把 `user: 1` 改成 `user: 2` 、 `user: 3` ，加递增枚举或从其他渠道拿到的 UUID，无授权校验时直接返回他人资料。HTTP IDOR 检查表那套完全通用——query 只是从 URL 变成了花括号，字段改为嵌套。

更深一层： **批处理 + IDOR 组合**，单请求里写几十个别名批量越权，同时打垮授权层：

```javascript
query MassIDOR {
  u1: singleUser(user: 1) { apiKey }
  u2: singleUser(user: 2) { apiKey }
  u3: singleUser(user: 3) { apiKey }
}
```

## 四、Burp 扩展值得装

跑 GraphQL 测试别裸奔，Burp Suite 上两个扩展能省一半时间：

-   **InQL**：自动生成 introspection 查询，对端点做 schema 树形展示，一眼看到所有 query/mutation/field
    
-   **GraphQL Raider**：内置常见 payload 库，跑批处理、深度递归、字段复制三连击
    

目标域名丢进 InQL scope，它就开始自动枚举，配合 Repeater 改字段值比手工拼 query 快三倍。

## 五、动手练手

DVGA 一站式搞定，五大类攻击明明白白摆在那：

```bash
git clone https://github.com/dolevf/Damn-Vulnerable-GraphQL-Application
cd Damn-Vulnerable-GraphQL-Application
docker-compose up -d   # 浏览器开 http://localhost:5000
```

Beginner / Expert 两档难度，Postman 还提供现成解题集合可以导入。

## 六、防御五要点

实战里真正能防住 80% 攻击的：

1.  **生产关 introspection** （ `__schema` / `__type` / `__typename` ），错误页打码，不漏堆栈
    
2.  **强制 query 白名单** （persisted queries），不让客户端写任意 query
    
3.  **加深度和复杂度限制**：单 query 嵌套不超过 8-10 层、aliases 不超 100
    
4.  **字段级授权**：每个 resolver 都要 `ctx.user` 校验，不能靠前端传 user id
    
5.  **批处理 rate limit**：陌生人请求数卡到 5 个 query 一个 HTTP
    

做到这五条，Bug Bounty 上不会因为 GraphQL 基础姿势被拿。

## 七、思考题

1.  introspection 关掉的端点，还有哪些姿势能反推 schema？（提示：field suggestions / GraphiQL UI / 错误消息三重路子）
    
2.  嵌套递归 DoS 之外， **batch query + IDOR** 组合有没有更隐蔽的玩法？
    
3.  字段级授权在 GraphQL 实现层是不是每个 resolver 都要写一遍？有没有框架级一刀切的方案？
    

## 八、素材出处

-   OWASP-SKF KBID 285 - GraphQL DOS
    
-   OWASP-SKF KBID 285 - GraphQL IDOR
    
-   Damn-Vulnerable-GraphQL-Application
    
-   HackerOne Report #1132803 - GraphQL Introspection 内省泄漏
    
-   learn365 day21 - GraphQL Vulnerabilities (Part-2)
    

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *

信息安全新手入门 · 目录
