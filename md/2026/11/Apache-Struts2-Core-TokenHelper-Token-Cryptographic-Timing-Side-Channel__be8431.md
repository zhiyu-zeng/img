---
title: Apache Struts2 Core TokenHelper Token Cryptographic Timing Side-Channel
source: https://seclists.org/fulldisclosure/2026/Nov/6
source_host: seclists.org
clip_date: 2026-11-02T14:55:27+08:00
trace_id: 47f0c2e8-49a5-45f5-bdca-e8633b37f86b
content_hash: d38f812441595b5c83520647519bceb7ccc6e8c122b3d862e850366fea3d3e3c
status: synced
tags:
  - 漏洞分析
  - 计时侧信道
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: Apache Struts2 Core 7.4.0 及以下版本用早期退出的字符串比较校验 Token 令牌，形成计时侧信道，理论上可将令牌爆破从 36^32 次降至 1,152 次请求。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-81a8-b7d9-f48b9578cc74
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Apache Struts2 Core 7.4.0 及以下版本用早期退出的字符串比较校验 Token 令牌，形成计时侧信道，理论上可将令牌爆破从 36^32 次降至 1,152 次请求。
> 
> - **漏洞成因：** `TokenHelper.validToken()` 使用 `String.equals()` 这类逐字节、遇不匹配即提前返回的比较方法，比对会话令牌与用户提交令牌，执行耗时与前缀匹配字节数成正比，构成可测量的计时侧信道。
> - **影响与验证：** 影响 Apache Struts2 Core 7.4.0 及以下版本；该侧信道已被动态验证并跨网络成功利用，现代技术可通过注入延迟、削减或消除网络延迟放大信号。
> - **攻击复杂度：** 令牌由 165-bit BigInteger 转为 A-Z0-9 字符串，但转换映射不整齐，字符串长度可为 31 或 32 字符，纯暴力需 `36^32` 次；利用计时侧信道逐字节破解，理论下界降至 `36×32`（1,152 次请求）；因长度可变，需先用两个请求探测实际长度。
> - **安全后果：** 成功利用可绕过 `TokenHelper` 生成的令牌，该令牌用于阻止表单重复提交，并可能作为 CSRF 防护中的 nonce 使用。
> - **相关代码：** `TokenInterceptor` 与 `TokenSessionStoreInterceptor` 的 `handleToken()` 均调用 `validToken()` 做校验；二者还对 `session.getId().intern()` 做了不安全同步，属于另行披露的独立问题。

## Full Disclosure mailing list archives

## Apache Struts2 Core TokenHelper Token Cryptographic Timing Side-Channel

* * *

*From*: Daniel Owens via Fulldisclosure <fulldisclosure () seclists org>  
*Date*: Sat, 31 Oct 2026 21:21:13 +0000  

* * *

````swift
Description
The Apache Struts2 Core 7.4.0 and below performs session token comparisons cryptographically insecure early-exit 
comparison functions (e.g., `!=`, `memcmp`, byte-by-byte loops with `break`) that return as soon as the first 
mismatched byte is encountered.  The execution time of the comparison is therefore proportional to the number of 
leading bytes that match, creating a measurable timing side-channel.  Importantly, this side-channel has been 
dynamically verified and exploited across networks using modern techniques that reduce/factor out latency.

Impact
Attackers can measure response latency, iteratively determining the correct value of the hash or secret one byte at a 
time, reducing the attack complexity from `36^n`, where `n` is the number of bytes in the secret.  While, in the ideal 
circumstance, the complexity of a pure brute-force attack would be `2^165` since the system is using a 165-bit 
BigInteger, the conversion from BigInteger to an A-Z0-9 string does not map cleanly -- the resulting string, itself, 
can actually be 31 or 32 characters long and bytes don't simply slot into a given character or position, thus requiring 
the greater `36^32` brute-force.  With that said, in a system where lag can be injected, latency reduced or factored 
out, the theoretical floor move from the worst case `36^32` to `36*32` (1,152 requests).  Of course, since the string 
length can vary by one, attackers must first determine the string length, which can be done via two requests -- one 
with each length -- a trivial addition to the worst case mentioned above but worth noting.

Successful exploitation enables bypassing the `TokenHelper`-generated token, which is designed to "[s]top 
double-submission of forms" and may be used by information systems as a nonce as part of cross-site request forgery 
protections.

Examples
Sample Code
`TokenHelper.validToken()`, leveraged by both `TokenInterceptor.handleToken(ActionInvocation)` and 
`TokenSessionStoreInterceptor.handleToken(ActionInvocation)`, utilises the cryptographically insecure, early-exiting 
`String.equals(String)` method to compare the in-session token against the user-provided token.

```java
    /**
     * Checks for a valid transaction token in the current request params. If a valid token is found, it is
     * removed so the it is not valid again.
     *
     * @return false if there was no token set into the params (check by looking for {@link #TOKEN_NAME_FIELD}), true 
if a valid token is found
     */
    public static boolean validToken() {
        String tokenName = getTokenName();

        if (tokenName == null) {
            LOG.debug("No token name found -> Invalid token ");
            return false;
        }

        String token = getToken(tokenName);

        if (token == null) {
            LOG.debug("No token found for token name {} -> Invalid token ", normalizeSpace(tokenName));
            return false;
        }

        Map session = ActionContext.getContext().getSession();
                                String tokenSessionName = buildTokenSessionAttributeName(tokenName);
        String sessionToken = (String) session.get(tokenSessionName);

        if (!token.equals(sessionToken)) {
            if (LOG.isWarnEnabled()) {
                LocalizedTextProvider localizedTextProvider = 
ActionContext.getContext().getContainer().getInstance(LocalizedTextProvider.class);
                LOG.warn(localizedTextProvider.findText(TokenHelper.class, "struts.internal.invalid.token", 
ActionContext.getContext().getLocale(), "Form token {0} does not match the expected session token.", new Object[]{
                        normalizeSpace(token)
                }));
            }
            Dispatcher dispatcher = Dispatcher.getInstance();
            if (dispatcher != null && dispatcher.isDevMode()) {
                LOG.warn("Token mismatch detail - token name [{}], form token [{}], session token [{}]",
                        normalizeSpace(tokenName), normalizeSpace(token), sessionToken);
            }

            return false;
        }

        // remove the token so it won't be used again
        session.remove(tokenSessionName);
        ActionContext.getContext().put(VALIDATED_TOKEN_KEY, new ValidatedToken(tokenName, token));

        return true;
    }
```
Code snippet from `struts2-core`'s core/src/main/java/org/apache/struts2/util/TokenHelper.java, lines 164-210

```java
    protected String handleToken(ActionInvocation invocation) throws Exception {
        //see WW-2902: we need to use the real HttpSession here, as opposed to the map
        //that wraps the session, because a new wrap is created on every request
        HttpSession session = ServletActionContext.getRequest().getSession(true);
        synchronized (session.getId().intern()) {
            if (!TokenHelper.validToken()) {
                return handleInvalidToken(invocation);
            }
        }
        return handleValidToken(invocation);
    }
```
Snippet from `struts2-core`'s core/src/main/java/org/apache/struts2/interceptor/TokenInterceptor.java, lines 140-150, 
showing the interceptor calling for token validation -- note, too, the improper, unsafe synchronisation on 
`session.getId().intern()`, though that is a separate finding with a separate write-up

```java
    @Override
    protected String handleToken(ActionInvocation invocation) throws Exception {
        //see WW-2902: we need to use the real HttpSession here, as opposed to the map
        //that wraps the session, because a new wrap is created on every request
        HttpSession session = ServletActionContext.getRequest().getSession(true);
        synchronized (session.getId().intern()) {
            if (!TokenHelper.validToken()) {
                return handleInvalidToken(invocation);
            }
            return handleValidToken(invocation);
        }
    }
```
Code from `struts2-core`'s core/src/main/java/org/apache/struts2/interceptor/TokenSessionStoreInterceptor.java, lines 
104-115, showing the interceptor calling for token validation -- note, too, the improper, unsafe synchronisation on 
`session.getId().intern()`, though that is a separate finding with a separate write-up
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

````
