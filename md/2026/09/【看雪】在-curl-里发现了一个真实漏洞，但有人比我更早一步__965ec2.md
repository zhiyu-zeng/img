---
title: 【看雪】在 curl 里发现了一个真实漏洞，但有人比我更早一步
source: https://bbs.kanxue.com/thread-292983.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-19T02:53:08+08:00
trace_id: b6ccebe5-397a-45b7-a9c4-ebe379b509ba
content_hash: bd6f3c31759a0ab8a72f0097aa1beaaedad0d1c167ac14272aa72e78bd01aeb8
status: synced
tags:
  - 看雪
  - 漏洞分析
  - 协议分析
series: null
feed_source: 看雪·二进制漏洞
ai_summary: 作者在 curl 8.5.0 中发现 Kerberos 认证的连接复用缺少凭据校验这一真实漏洞并写出可运行 PoC，提交后却发现官方已在 8.20.0 修复，报告被判为重复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3df75244-d011-81bf-8dec-fb1cd7df233a
ioc:
  cves:
    - CVE-2014-0015
    - CVE-2016-0755
    - CVE-2022-22576
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 作者在 curl 8.5.0 中发现 Kerberos 认证的连接复用缺少凭据校验这一真实漏洞并写出可运行 PoC，提交后却发现官方已在 8.20.0 修复，报告被判为重复。
> 
> - **根因：** `conncache.c` 的 `hashkey()` 只用 port+hostname 分组；`ConnectionExists()` 对 HTTP 因 `PROTOPT_CREDSPERREQUEST` 跳过凭据检查；NTLM 有 user/passwd/state 校验，而 grep SPNEGO 相关状态零匹配——Bob 可复用 Alice 已认证连接上的 GSS context。
> - **缓解机制：** `http_negotiate.c` 用 `noauthpersist` 依单轮/多轮握手决定是否 cleanup：MIT Kerberos 默认单轮会清理，Windows AD/IIS 多轮不清理；且 cleanup 位于 output 层而非连接匹配层。
> - **PoC 搭建：** Linux 装 KDC 建 TESTLAB.LOCAL，创建 alice/bob 与 HTTP/localhost keytab，用 Python gssapi 写记录 GSS context 的服务器，再用 `curl --negotiate` 观察输出中的 "Re-using existing connection"。
> - **最终结果：** curl 8.20.0 已由 commit 34fa034d9a（2026 年 2 月，Zhicheng Chen 报告）修复，修复思路与作者建议一致，报告被标记 Duplicate，无 CVE 与 credit。
> - **经验教训：** 先确认最新版本是否仍存在漏洞、跟踪 commit history、缩短 PoC 与 write-up 耗时；研究方法有效——curl 25 年 188 个漏洞中连接池问题反复出现，是可靠的切入点。

> **本文说明**
> 
> 本文由 IoTSec.in 原创文章翻译整理而来，原文作者为本文作者本人。中文版本主要面向中文安全社区读者，技术内容与原文保持一致。
> 
> 原文：https://iotsec.in/t/i-found-a-real-cve-in-curl-but-someone-beat-me-to-it-a-security-research-journey/67 *I Found a Real CVE in curl but Someone Beat Me to It*

## 开始

这篇东西写起来可能有点奇怪。

因为我要讲的是一个我在 curl 里发现的漏洞。是真漏洞，有能跑的 PoC，有 Kerberos 认证，什么都有。

然后我要告诉你，为什么最后我还是没拿到 CVE。

但事情有意思的地方也就在这里——虽然这次算是"失败"了，但这一次尝试让我学到的东西，比我看 100 篇安全研究博客还多。

所以，这篇文章其实不是在讲一个 CVE，而是在讲我是怎么找到这个漏洞、怎么验证、怎么提交，以及最后发现有人已经比我先提交了。

如果你一直想开始做 CVE 挖掘，但不知道从哪里下手，这篇文章可能适合你。

如果你之前也尝试过，然后"失败"了，那也一样。

开始吧。

* * *

## 之前让我很困惑的事情（现在不会了）

刚开始看 curl 的时候，我完全不知道自己到底应该找什么。

大家都会说"读代码，然后找 bug"，但很少有人告诉你：

**到底应该看哪里？**

**什么样的代码模式值得注意？**

我当时一直在想：

难道我要随机打开几个文件，然后一直读，直到某个地方突然看起来不对？

感觉根本不现实。

后来我才发现，比较实际的方法是从 **过去的漏洞模式** 开始。

看看以前哪里出过问题。

然后问自己：

> 类似的代码逻辑，在其他地方是不是也存在？

我这次就是这么开始的。

* * *

## 一个让我注意到的模式

我开始分析 curl 的 CVE 历史。

25 年里有 188 个历史漏洞。

其中有一个东西反复出现：

**连接池（Connection Pool）逻辑问题。**

一次。

两次。

又一次。

举几个例子：

-   **CVE-2014-0015** - NTLM 连接复用时没有正确检查凭据
-   **CVE-2016-0755** - Proxy NTLM 认证复用问题
-   **CVE-2022-22576** - OAuth bearer token 在连接复用时没有进行正确比较

这个模式其实很明显。

curl 有一个 connection pool。为了提高效率，已经建立的连接会被重复使用。

但问题是，有时候代码没有正确检查：

> 旧连接上的认证状态，是否真的可以被新的请求继续使用？

这时候我就想到了：

如果 NTLM 已经因为类似的问题出过几次，那么 **Kerberos 呢？**

* * *

## 开始找

当时我下载的是 curl 8.5.0 的源码，然后开始往里面看。

连接池相关逻辑主要在：

`lib/conncache.c`

以及：

`lib/url.c`

里面有一个很关键的函数：

`ConnectionExists()`

它负责判断一个已经存在的连接能不能直接复用，还是需要重新创建连接。

然后我发现了几个比较有意思的地方。

### 发现 1：Hash Key 里没有凭据信息

文件：

`lib/conncache.c`

大约 126-150 行。

```c
static void hashkey(struct connectdata *conn, char *buf, size_t len) {
    msnprintf(buf, len, "%ld/%s", port, hostname);
}
```

connection pool 使用 hash table。

而 hash key 非常简单：

**port + hostname**

没有用户名。

没有密码。

也没有其他认证信息。

也就是说：

`example.com:443`

的所有连接都会进入同一个 bucket，不管是谁发起的请求。

不过到这里还不能直接说有漏洞。

因为 hash key 只是用来做分组，真正的检查应该发生在 `ConnectionExists()` 里面。

* * *

### 发现 2：HTTP 跳过了凭据检查

文件：

`lib/url.c`

大约 1133-1143 行。

```c
if(!(needle->handler->flags & PROTOPT_CREDSPERREQUEST)) {
    // Check if user and password match
    if(Curl_timestrcmp(needle->user, check->user) ||
       Curl_timestrcmp(needle->passwd, check->passwd)) {
        continue; // Skip this connection
    }
}
```

这里其实是有 credential check 的。

但是只有当协议 **没有** 设置：

`PROTOPT_CREDSPERREQUEST`

这个 flag 时，才会执行。

然后我去看了 `lib/http.c` 。

HTTP handler 都设置了这个 flag。

也就是说：

**HTTP/HTTPS 的 credential check 会直接跳过。**

你可能会想：

> 这不就是漏洞了吗？

其实不是。

原因在于 HTTP 的认证信息通常是放在每一个 HTTP request 的 header 里的。

Basic Auth、Digest Auth、Bearer Token 等，都属于 request-level authentication。

所以连接本身并不需要绑定某一个用户的认证状态。

但 Kerberos 不一样。

* * *

### 发现 3：Kerberos 的认证状态和连接绑定

Kerberos，也就是常见的 Negotiate / SPNEGO，情况完全不同。

认证过程会建立一个 GSS security context。

这个 context 会存在于连接上。

后面的请求可以继续使用这个已经建立的认证上下文。

于是问题来了。

假设：

**Alice**

先使用 Kerberos 在 Connection #0 上完成认证。

然后：

**Bob**

的请求又复用了 Connection #0。

那么 Bob 的请求实际上到达的是一个：

> **已经以 Alice 身份完成认证的连接。**

服务器看到的还是那个已经建立好的 GSS context。

这就很有意思了。

* * *

### 发现 4：NTLM 有保护，Kerberos 没有

这里才真正让我觉得有问题。

文件：

`lib/url.c`

大约 1214-1273 行。

```c
#if defined(USE_NTLM)
    if(wantNTLMhttp) {
        if(Curl_timestrcmp(needle->user, check->user) ||
           Curl_timestrcmp(needle->passwd, check->passwd)) {
            continue; // Skip this connection
        }
    }
    else if(check->http_ntlm_state != NTLMSTATE_NONE) {
        continue; // Connection has NTLM state but we don't want NTLM
    }
#endif
```

NTLM 有专门的保护逻辑。

它会检查：

-   用户名
-   密码
-   NTLM state

如果不匹配，连接就不会被复用。

于是我开始搜索 Kerberos 有没有类似的检查。

```bash
grep "USE_SPNEGO" lib/url.c
grep "http_negotiate_state" lib/url.c
```

结果：

**没有。**

一个匹配都没有。

没有 protection block。

没有 state check。

但 Kerberos 的 state 明明存在：

```c
#ifdef USE_SPNEGO
    curlnegotiate http_negotiate_state;      // line 1024
    curlnegotiate proxy_negotiate_state;     // line 1025
    struct negotiatedata negotiate;          // line 1027
#endif
```

也就是说：

状态字段存在。

但是：

`ConnectionExists()`

根本没有检查它们。

这就是我当时发现的 bug。

* * *

## 开始做 PoC

发现代码逻辑有问题是一回事。

证明它真的可以被利用，是另外一回事。

所以我开始搭建一个可以实际验证的 PoC。

而这意味着：

**得先搞一个 Kerberos 环境。**

### 第一步：搭建 Kerberos

我在 Linux 上安装了 Kerberos KDC（Key Distribution Center）。

```bash
sudo apt install krb5-kdc krb5-admin-server krb5-user python3-gssapi
sudo krb5_newrealm  # Created realm: TESTLAB.LOCAL
```

然后创建两个测试用户：

```bash
sudo kadmin.local
  addprinc -pw testpass123 alice
  addprinc -pw bobpass bob
  addprinc -randkey HTTP/localhost
  ktadd -k /tmp/http.keytab HTTP/localhost
  quit
```

Alice 和 Bob 是两个不同的用户。

如果 curl 工作正常，他们应该使用不同的连接。

如果存在我怀疑的问题，那么 Bob 就有可能复用 Alice 已经建立的连接。

* * *

### 第二步：写测试服务器

接下来需要一个支持 Kerberos 认证的服务器。

而且这个服务器还得记录：

> 哪个用户在什么 TCP connection 上完成了认证。

所以我用 Python 和 `gssapi` 写了一个简单的测试服务器：

```python
#!/usr/bin/env python3
import gssapi
import socketserver

class ConnState:
    def __init__(self):
        self.ctx = None
        self.principal = None
        self.complete = False

class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        state = ConnState()
        # ... HTTP request parsing ...
        
        if state.complete and state.principal:
            # Connection already has a GSS context
            log.info("*** CONNECTION REUSED - GSS context persists for %s ***", 
                     state.principal)
```

如果连接被复用，服务器就会记录这个连接之前留下来的 GSS context。

* * *

### 第三步：运行测试

测试过程大概是这样：

```bash
# Alice authenticates with Kerberos
kinit alice@TESTLAB.LOCAL
curl --negotiate -u : http://localhost:8080/

# Bob switches user
kdestroy
kinit bob@TESTLAB.LOCAL
curl --negotiate -u : http://localhost:8080/ \
     --next --negotiate -u : http://localhost:8080/
```

然后我看到了：

```
* Connection #0 to host localhost left intact
* Re-using existing connection with host localhost
* Curl_output_negotiate, no persistent authentication: cleanup existing context
*** CONNECTION REUSED - GSS context persists for bob@TESTLAB.LOCAL ***
```

当时我的第一反应就是：

**真的复用了。**

curl 的 verbose output 直接显示：

`Re-using existing connection`

测试服务器也记录到了连接上的 GSS context。

* * *

## 之前让我很困惑的事情（现在不会了）——第二部分

到这里我其实挺兴奋的。

因为我认为自己找到了一个真实漏洞。

有 PoC。

有代码分析。

有 root cause。

也有完整的 exploitation flow。

我把这些东西都整理好了。

但就在这个时候，我注意到了 curl 输出中的一句话：

```
* Curl_output_negotiate, no persistent authentication: cleanup existing context
```

等等。

**Cleanup？**

清理什么？

我重新回到了源码。

* * *

## 我之前漏掉的部分缓解机制

文件：

`lib/http_negotiate.c`

大约 140-152 行。

```c
if(*state == GSS_AUTHSUCC) {
    neg_ctx->noauthpersist = !neg_ctx->havemultiplerequests;
}

if(neg_ctx->noauthpersist && *state == GSS_AUTHSUCC) {
    Curl_http_auth_cleanup_negotiate(conn);
}
```

原来这里确实有一个 mitigation。

当 curl 在连接上使用 Kerberos state 时，会根据原来的 handshake 是否需要多个 roundtrip 来决定认证状态是否继续保留。

简单来说：

-   **Single-roundtrip** （MIT Kerberos 默认情况）： `noauthpersist = TRUE` → 会进行 cleanup
-   **Multi-roundtrip** （例如 Windows AD、IIS）： `noauthpersist = FALSE` → 不进行 cleanup

所以这个问题并不是在所有 Kerberos 环境下都完全一样。

MIT Kerberos 的默认配置下存在一定程度的缓解。

但在 Windows AD 环境中，多轮认证的情况下，问题依然存在。

而且还有一个更重要的问题：

这个 cleanup 所在的位置其实不对。

它位于：

`Curl_output_negotiate()`

也就是 output layer。

而不是：

`ConnectionExists()`

也就是 connection matching layer。

换句话说：

**连接已经被匹配并复用了，之后才进行 cleanup。**

NTLM 在两个层面都有保护。

Kerberos 当时没有类似的 connection matching protection。

所以问题依然存在，只是比我最开始认为的更加复杂。

* * *

## 提交 HackerOne

curl 有 HackerOne 项目。

所以我把完整报告提交了上去：

-   技术分析和代码行号
-   可以运行的 PoC
-   测试服务器代码
-   Root cause 分析
-   建议的修复方式

然后点击：

**Submit。**

两分钟之后，curl 的作者 Daniel Stenberg 回复了。

> "Thank you for your report! We will investigate and get back to you within 24 hours."

我当时真的挺激动。

然后他问了一个问题：

> "Please confirm that this is still true on curl 8.20.0."

等等。

**8.20.0？**

我测试的是 8.5.0。

于是我重新下载了 curl 8.20.0。

然后搜索 Kerberos 的 protection block。

结果：

**找到了。**

```c
static bool url_match_auth_nego(struct Curl_easy *data,
                                 struct connectdata *needle,
                                 struct connectdata *check) {
    if(wantNegotiatehttp) {
        if(Curl_timestrcmp(needle->user, check->user) ||
           Curl_timestrcmp(needle->passwd, check->passwd)) {
            return FALSE; // Credentials don't match
        }
    }
    else if(check->http_negotiate_state != GSS_AUTHNONE) {
        return FALSE; // Has Negotiate state but we don't want it
    }
    // ... proxy variant ...
}
```

修复已经存在了。

Commit：

`34fa034d9a`

时间是：

**2026 年 2 月。**

Reported by：

**Zhicheng Chen**

而且修复方式，和我在报告里建议的基本一致。

但问题是：

**有人已经比我先发现了。**

* * *

## 现实来了

我回复 Daniel：

> "You're right. The bug existed in 8.5.0 but was fixed in 8.20.0 by commit 34fa034d9a. I didn't realize the fix had already landed. Sorry for the duplicate report."

最后报告被标记成：

**Duplicate。**

没有 CVE。

没有 credit。

也没有 Hall of Fame entry。

就这样。

一次学习经历。

* * *

## 我真正学到的东西

我当然可以把这次经历看成失败。

我花了几周时间。

搭了 Kerberos lab。

写了完整 PoC。

做了代码分析。

最后发现别人已经先做到了。

但现在回头看，我并不这么认为。

### 我证明了几件事情

**1\. 我确实可以找到真实漏洞。**

这不是 false positive。

也不是我误解了代码。

这是一个真实存在、并且值得修复的问题。

curl 开发者也确实认真处理了这个问题。

* * *

**2\. 我的分析方向是对的。**

最终的修复方式和我建议的方向基本一致。

我演示出来的攻击场景也是实际存在的。

至少说明我对这部分代码的理解是正确的。

* * *

**3\. 我现在知道完整的流程了。**

代码分析。

PoC 开发。

漏洞验证。

报告编写。

和维护者沟通。

这些东西我完整走了一遍。

以后还可以再做。

* * *

## 如果重新来一次，我会怎么做

### 1\. 第一时间检查最新版本

我当时直接使用了系统里的 curl 8.5.0。

这是一个错误。

在花几周做 PoC 之前，应该先确认：

> 这个漏洞在当前最新版本里是不是还存在？

* * *

### 2\. 关注 commit history

如果我当时一直关注 curl 的 git commit，我可能早就看到 2 月份已经出现了这个修复。

这样可以节省大量时间。

* * *

### 3\. 更快一点

我在 PoC 和 write-up 上花了太多时间。

安全研究里，速度其实也很重要。

因为你永远不知道是不是还有其他人在找同一个问题。

* * *

## 但有一件事我不后悔

就是把完整的 Kerberos lab 搭起来。

这些知识现在已经属于我了。

我现在理解：

-   GSSAPI
-   SPNEGO
-   Kerberos authentication
-   Connection pooling
-   curl 的相关内部逻辑

这些东西不会因为没有一个 CVE 编号就消失。

* * *

## 再往大一点看

安全研究并不只是为了拿 credit。

最终目标还是在攻击者之前发现问题。

Zhicheng Chen 找到了这个问题并进行了报告。

curl 修复了它。

所以现在使用 Kerberos authentication 的 curl 用户受到了保护。

我也独立找到了同一个问题。

这至少说明：

**这个漏洞是可以被找到的。**

它不是完全随机的。

过去的漏洞留下了模式。

而这种研究方法确实有效。

下一次，我会更快。

下一次，我会先检查最新版本。

下一次，也许我会比别人更早找到。

但就算没有：

我还是学到了完整的过程。

这才是最重要的。

* * *

## 给刚开始做安全研究的人

如果你正在考虑开始做 CVE hunting，我想说几件事情。

**从漏洞模式开始，而不是从随机代码开始。**

不要只是随机读代码，然后希望某一天突然看到一个 bug。

先研究过去的漏洞。

找它们之间重复出现的模式。

然后去代码库里寻找类似的实现。

* * *

**尽可能做完整的 PoC。**

找到代码里的问题只是第一步。

证明它真的能够被利用，是第二步。

PoC 会迫使你真正理解漏洞，而不是停留在理论层面。

* * *

**你会"失败"很多次。**

Duplicate。

False positive。

难以利用的 bug。

已经被修复的 bug。

这些都很正常。

安全研究本来就是这样。

* * *

**学习本身就是回报。**

即使最终没有 CVE，你还是学到了东西。

你会更加了解这个代码库。

你知道完整的漏洞研究流程。

下一次可以做得更快。

总有一天，你会比别人先到。

* * *

## 接下来我要做什么

我不会因为这次 duplicate 就停止 CVE hunting。

curl 有 188 个历史漏洞。

这意味着里面存在大量可以研究的漏洞模式。

而如果 connection pool 相关问题一次又一次出现，那么代码里可能还存在其他值得研究的地方。

下一次：

我会先检查最新版本。

下一次：

我会更快。

下一次：

也许我真的能拿到 CVE。

但即使没有：

我还是会学到新的东西。

这才是重点。

* * *

## Glossary

**CVE**  
Common Vulnerabilities and Exposures。用于标识安全漏洞的唯一编号。对于安全研究人员来说，能够获得一个自己发现的 CVE 是很重要的成果。

**Connection Pool**  
curl 用来复用 TCP 连接的机制。与每次请求都重新建立连接不同，它会保留已经建立的连接，在条件满足时重新使用。

**Kerberos / SPNEGO / Negotiate**  
一种认证机制，认证状态与连接相关，而不是简单地通过每个 HTTP request 的 header 单独完成。企业环境中经常可以看到。

**GSS Context**  
Kerberos 认证过程中建立的安全上下文。它存在于连接上，如果连接被复用，相关 context 也可能继续存在。

**NTLM**  
另一种认证协议。curl 已经针对 NTLM connection reuse 做了相应保护，而本文研究的核心问题之一，就是当时 Kerberos 缺少类似的检查。

**HackerOne**  
一个漏洞赏金平台，安全研究人员可以通过它向厂商提交漏洞报告。curl 在该平台上有自己的项目。

**PoC**  
Proof of Concept，也就是概念验证代码，用于证明一个漏洞确实存在并可以被验证。

* * *

如果你也正在学习安全研究，也欢迎分享自己的"失败"。

Duplicate、误报、已经修复的漏洞——这些其实都是研究过程的一部分。

我也还在学习。

* * *

**说明：**

这次研究过程中使用的代码、PoC 脚本以及技术分析都放在我的 GitHub 中，如果你想进一步了解整个过程，可以自行查看。

这个 bug 确实存在。

这套研究方法也确实有效。

只是这一次，有人比我先一步。

没关系。

* * *

[回复或点赞可查看完整内容](#quick_reply_form)
