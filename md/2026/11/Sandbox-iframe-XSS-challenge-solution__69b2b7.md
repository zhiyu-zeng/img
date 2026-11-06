---
title: Sandbox-iframe XSS challenge solution
source: https://joaxcar.com/blog/2024/05/16/sandbox-iframe-xss-challenge-solution/
source_host: joaxcar.com
clip_date: 2026-11-06T10:31:25+08:00
trace_id: b66ea4a0-5764-46d5-a206-2373cc6a0075
content_hash: 677aa862b8a09297cfa2d04ede4677ade3a44483bc48f1e4450d01d228809d5e
status: synced
tags:
  - 漏洞分析
  - XSS
series: null
feed_source: Johan Carlsson·漏洞研究
ai_summary: 通过 CSP 重定向路径绕过加载任意 CDN 脚本实现 XSS，再利用 `document.baseURI` 穿透 sandbox iframe 的 null origin，窃取父页面 hash 中的 flag。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41075244-d011-81a4-9f25-ff57f3309f4e
ioc:
  cves: []
  cwes: []
  hashes:
    - ae692e51fd5d5528c59c78334c035454
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 CSP 重定向路径绕过加载任意 CDN 脚本实现 XSS，再利用 `document.baseURI` 穿透 sandbox iframe 的 null origin，窃取父页面 hash 中的 flag。
> 
> - **挑战设定：** 页面允许通过 `xss` 参数注入 Base64 编码的任意 HTML，内容经 `srcdoc` 放入带 `allow-scripts`/`allow-modals`（无 `allow-same-origin`）的沙箱 iframe，需执行 JS 弹出 URL hash 中的 flag；子文档会继承父页面的 CSP（`script-src 'self'` + nonce + cdnjs 完整路径）。
> - **CSP 绕过关键：** CSP 的路径限制在请求发生合法重定向后失效，浏览器只校验重定向后的基础域名；页面自带的 open redirect 符合 `'self'`，配合它可绕过 cdnjs 的完整路径白名单，加载任意 cdnjs 库脚本。
> - **执行 gadget：** 借助重定向加载 HTMX，用 `<img src=x hx-on:error="alert(1)">` 触发回调执行 JS；同类的经典方案是加载 Angular 1.0.8 后用 `{{$on.constructor('alert(1)')()}}` 模板注入。
> - **读取父窗口 URL：** sandbox iframe 内 origin 为 null 且无法直接访问父窗口，但 `about:srcdoc` 文档解析相对 URL 时的 fallback base URL 被各浏览器约定为顶层文档地址；任意 DOM 节点的 `baseURI` 属性都会返回含 hash 的完整父页面 URL。
> - **最终 payload 与危害：** 完整利用链为加载 HTMX 后执行 `alert(document.baseURI.split('#')[1])`；该技巧在托管"HTML builder"类站点中较为常见，结合 OAuth 相关攻击可进一步泄露基于 hash 的访问令牌。

This is a writeup describing the solution to a small XSS challenge I posted on Twitter in May 2024

![](https://joaxcar.com/blog/wp-content/uploads/2024/05/challenge_may-1024x519.png)

### The challenge

The challange page [https://sandbox-iframe-ctf.glitch.me](https://sandbox-iframe-ctf.glitch.me/) allows for arbitrary HTML in the search parameter `xss` as a Base64 encoded string. The HTML will be put inside a sandboxed iframe on the same page. The page will also add a flag to the `hash` portion of the URL upon visiting the site. The mission was to leak this flag in the `hash` and show the value in an alert box.

### Step 0: the setup

Let’s summarize what’s happening here. The challenge combined three steps to allow us to access the flag (stored in the hash/fragment part of the URL) from inside the sandboxed iframe.

The challenge page did not sanitize the payload inside the base64 string. The only sanitization was done on the base64 string itself to protect it from attacks breaking out in the DOM.

The two protections in place were instead a strict CSP and the sandbox iframe attribute.

The iframe sandbox contains the `allow-scripts` and `allow-modals` values, ensuring that Javascript can execute. The lack of `allow-same-origin` should, however, prevent access to the top window, and the `origin` inside the iframe will instead be `null`.

The setup allows us to throw a regular `<script>` tag into the iframe and have it evaluated. The fact that the content is loaded through `srcdoc` and not the src attribute will, however, make the iframe document inherit the parent page CSP. Leaving us with scripts that passes this CSP

```
script-src 'self'
'nonce-ae692e51fd5d5528c59c78334c035454'
'unsafe-eval'
https://cdnjs.cloudflare.com/ajax/libs/Base64/1.3.0/base64.min.js;
```

### Step 1: Bypass CSP

A CSP feature exists that is documented but sometimes overlooked. When a CSP directive is specified with a value like `https://example.com/path/morepath/,` the content will only be allowed to load from any path under that subpath. And given a value like `https://example.com/exactfile.js`, you restrict content to that file exactly.

This rule is, however, not enforced when a valid request returns a redirect. After a redirect (given by a URL that is allowed by the CSP), the new request will only match against the base domain on any CSP directives. Given the two examples above, we can load anything from `https://example.com` after a redirect.

The feature described above might initially look like a flaw in CSP but is, in fact, a design choice to prevent other side channel information leakage. See this part of the specification [https://www.w3.org/TR/CSP3/#source-list-paths-and-redirects](https://www.w3.org/TR/CSP3/#source-list-paths-and-redirects) and this blog post that triggered this change [https://homakov.blogspot.com/2014/01/using-content-security-policy-for-evil.html](https://homakov.blogspot.com/2014/01/using-content-security-policy-for-evil.html).

When looking to bypass CSP, this is a great tool to have in your toolbelt. Also, remember that it can be useful even if you can not get an XSS. You might be able to loosen up `frame-src`, `form-action` or any other directive using the same technique.

In the given challenge, I tried to hint at this by adding an open redirect (that will be allowed as `script-src` due to the value `'self'` in the `script-src` directive) and the unnecessary dependency loaded with a full path. To escalate this to a proper XSS, all that was needed was to take advantage of other scripts hosted on the same CDN that could now be loaded using a script tag like this

```
<script src="/redirect?url=https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.12/htmx.min.js"></script>
```

Even if `https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.12/htmx.min.js` is not a valid path, given the current CSP, after the redirect browsers will only check that the content is loaded from `https://cdnjs.cloudflare.com.`

I decided to go with HTMX for an execution gadget, as it’s the new and cool kid on the block. A lot of people went with the more classic `<script src="/redirect?url=https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.0.8/angular.min.js"></script>` for an Angular bypass.

The two XSS versions look like this.

```html
<script src="/redirect?url=https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.12/htmx.min.js"></script>
<img src=x hx-on:error="alert(1)">
```

and Angular

```html
<script src="/redirect?url=https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.0.8/angular.min.js"></script>
<div ng-app ng-csp>{{$on.constructor('alert(1)')()}}</div>
```

### Step 2: accessing parent iframe

We now have the ability to execute arbitrary Javascript, but we are still stuck inside a sandboxed iframe, giving us the origin `null` and no access to the parent window.

Well that “no access” is a truth with some modifications. First of we are executing on the domain `about:srcdoc` as the content of the iframe is given through the `srcdoc` attribute and this differs slightly from loading an external resource. I already mentioned that the iframe document will inherit the CSP from the parent page.

The hint I gave to some people that asked nicely was

> Try to do a `fetch("")` call from inside the iframe and look at the request; what is happening and why?

Doing a `fetch("")` from inside the sandboxed iframe will make a request like this

```
https://sandbox-iframe-ctf.glitch.me/?xss=PHNjc..BASE64..
```

the request will fail due to CORS errors. Think about it, we are getting a CORS error as we are making a request to the origin `https://sandbox-iframe-ctf.glitch.me` from the origin `null` so that makes sense, but how did the iframe know about the parent window URL?

Quick detour. When a browser encounters a request that lack scheme and base domain it will be treated as a relative URL. Time for more docs: [https://www.w3.org/TR/WD-html40-970917/htmlweb.html](https://www.w3.org/TR/WD-html40-970917/htmlweb.html) tells us

> A relative URL (defined in \[RFC1808\]) doesn’t contain any protocol or machine information. Its path generally refers to a resource on the same machine as the current document. Relative URLs may contain relative path components (“…” means one level up in the hierarchy defined by the path), and may contain fragment identifiers. Relative URLs are resolved to full URLs using a base URL. \[RFC1808\] defines the normative algorithm for this process.

Browsers will do two steps when deciding on a base URL Check if there is a `base` tag in the document and use that as the base URL Use the `fallback base URL` https://html.spec.whatwg.org/multipage/urls-and-fetching.html#fallback-base-url From these specifications, we can see that `about:` domains will use something called `about base URL`, this value depends on the browser implementation. All browsers have concluded that this should mean “the top documents base URL”. See this thread for a discussion on this [https://github.com/whatwg/html/issues/421](https://github.com/whatwg/html/issues/421) and this discussion about the specific issue we are going to abuse here [https://github.com/whatwg/html/issues/8105](https://github.com/whatwg/html/issues/8105)

So how do we access this baseURL? There are multiple ways to achieve this. First, just look at how browsers use the value internally when creating an `anchor` tag

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9d1b8e5f7caaa8bf.png)

We can see in the logs that the link with an empty `href` attribute will inherit the URL from the parent window. The `anchor` will inherit the `hostname` and the `search` portion of the URL but not the `hash`.

However, there is an easier way to access a document’s baseURL (or URI, as we should probably call it from now on): the `baseURI` node attribute: https://developer.mozilla.org/en-US/docs/Web/API/Node/baseURI.

As it happens all `DOM nodes` have this attribute `baseURI` that will return the full `base URL` and this value will also contain the `hash`. The easiest way to access this is to just use the `document` node like this `document.baseURI`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c100fd28a9bdc3eb.png)

### Step 3: putting everything together

We now have all the pieces we need. A full payload would look something like this

```html
<script src="/redirect?url=https://cdnjs.cloudflare.com/ajax/libs/htmx/1.9.12/htmx.min.js"></script>
<img src=x hx-on:error="alert(document.baseURI.split('#')[1])">
```

### Implications

This trick rarely allows you to do anything useful as the URL is often not that valuable to leak. However, the setup is not uncommon in sites that host “HTML builders,” and combining it with Frans Rosens’ “OAuth dirty dancing,” it is possible to leak some `hash` -based access tokens.

Thanks for all the great solutions, and sorry for the delay in writing the writeup!

The post [Sandbox-iframe XSS challenge solution](https://joaxcar.com/blog/2024/05/16/sandbox-iframe-xss-challenge-solution/) appeared first on [Johan Carlsson](https://joaxcar.com/blog).
