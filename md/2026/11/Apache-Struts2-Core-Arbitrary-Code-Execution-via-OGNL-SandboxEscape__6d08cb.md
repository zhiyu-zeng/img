---
title: Apache Struts2 Core Arbitrary Code Execution via OGNL Sandbox	Escape
source: https://seclists.org/fulldisclosure/2026/Nov/7
source_host: seclists.org
clip_date: 2026-11-02T14:57:12+08:00
trace_id: 2b6f97c5-c7ad-419b-8b3e-f6b998ef97dd
content_hash: a149a6d2908156c1d38f8489bc0558c0b92da7027a3afd8dfc5e2222e28710c0
status: synced
tags:
  - 漏洞分析
  - OGNL注入
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Struts2 Core（≤7.4.0）的 OGNL 沙箱防护存在逃逸漏洞：攻击者通过嵌套调用绕过安全检查，实现任意代码执行。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-8198-9851-eb1143ba44f9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Struts2 Core（≤7.4.0）的 OGNL 沙箱防护存在逃逸漏洞：攻击者通过嵌套调用绕过安全检查，实现任意代码执行。
> 
> - **漏洞机制：** Struts2 仅通过 `SecurityMemberAccess` 拦截 OGNL 引擎直接求值的调用，防护流于表面；若某个被允许的调用接受嵌套参数并在内部自行反射执行，嵌套的调用便脱离防护范围，整个限制可被完全绕过。
> - **版本差异：** 6.x 及以下仅依赖黑名单（甚至没有），攻击者只需找到未被列入黑名单的反射调用（如 `java.beans.Statement` / `java.beans.Expression`）包装恶意代码即可；7.x 改用白名单+黑名单混合策略，攻击者必须先有已被明确白名单允许的类作为外壳，利用门槛提高但风险并未消除——若管理员不了解该库防护的局限性，误将 `java.beans.Statement` 等加入白名单仍会引入漏洞。
> - **利用前提：** 仅在系统将输入/输出送入 OGNL 解析执行的路径上有效，例如请求参数，或字符串经 JSP 标签反射回显的场景。
> - **影响范围：** 可绕过类/方法检查和静态/非静态成员检查，例如调用 `ProcessBuilder` 执行系统命令、通过 `System.getenv(String)` 导出环境变量等。
> - **复现方式：** 对 6.x 及以下，通过 GET 参数 `query` 传入嵌套两层 `java.beans.Expression`，内层包装 `@java.lang.ProcessBuilder@class` 反射调用 `new` 创建 `/bin/sh -c 'id > 标记文件'` 进程并经 `getValue()` 触发 `start`；同一 payload 在 7.x 上需先白名单 `java.beans.Expression` 方可执行。

## Full Disclosure mailing list archives

## Apache Struts2 Core Arbitrary Code Execution via OGNL Sandbox Escape

* * *

*From*: Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Sun, 1 Nov 2026 22:23:31 +0000  

* * *

```sql
Description
Apache Struts2 Core version 7.4.0 and below attempt to prevent arbitrary code execution via Object-Graph Navigation 
Language (OGNL) through several different mechanisms but only in a cursory fashion -- the libraries only guard against 
immediate calls evaluated by the OGNL engine via `SecurityMemberAccess`, but an allowed call that, instead, accepts 
nested arguments and, itself, invokes reflection internally executes outside of the scope of said cursory protections, 
thereby enabling attackers to bypass the limited protections entirely.

It should be noted that this attack, obviously, only works in locations where the information system runs the 
input/output through an OGNL parser and executor.  Moreover, there is a key difference between Struts2 Core 6.x and 
below and 7.x -- 7.x favours a whitelist-based approach that is coupled with some blacklisting, while 6.x and below 
only check a blacklist (if anything at all).  This means that for successful exploitation in 6.x and below, attackers 
can simply find a call that uses reflection and that isn't explicitly blacklisted (e.g., `java.beans.Statement` and 
`java.beans.Expression`), embed the otherwise disallowed reflective call, and watch it run.  In 7.x, however, attackers 
must use something that has been explicitly allowed, first, as the wrapper, which raises the bar for exploitation, 
reducing the likelihood for most systems running 7.x (if someone does not realise that the Struts2 Core library only 
provides cursory protections, they will not understand the risk and may accidentally add something like 
`java.beans.Statement`), but does not reduce the impact or eliminate the risk.

Impact
Attackers can bypass the Apache Struts2 Core and OGNL library's protections against arbitrary code execution via 
malicious OGNL through nested calls, thereby executing arbitrary code on the information system.  Importantly, through 
this, attackers can bypass not only the class/method checks, but also the static/non-static checks, allowing attackers 
to, for example, call to `ProcessBuilder`, dump the environment variables via `System.getenv(String)`, and various 
other such calls.

Steps to Reproduce
Sample Query
The following will work on Apache Struts2 Core versions 6.x and below (assuming that `query` runs through the OGNL 
parser, etc. -- this can happen on the request, but also if the string is reflected back in, say, a JSP via tags that 
do as such) without much effort.  On Apache Struts2 Core 7.x, though, `java.beans.Expression` would need to be 
whitelisted, first.

GET 
/search.action?query=new+java.beans.Expression(new+java.beans.Expression(%40java.lang.ProcessBuilder%40class,'new',new+Object%5B%5D%7Bnew+String%5B%5D%7B'/bin/sh','-c','id+%3E+%3C%3CREPLACE+ME+--+a+fresh+marker+file+path%3E%3E'%7D%7D).getValue(),'start',new+Object%5B0%5D).getValue()
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
