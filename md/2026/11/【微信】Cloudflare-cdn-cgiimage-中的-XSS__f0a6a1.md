---
title: 【微信】Cloudflare /cdn-cgi/image/ 中的 XSS
source: https://mp.weixin.qq.com/s/j895gsZHvZiwtKGG4WIGJw
source_host: mp.weixin.qq.com
clip_date: 2026-11-26T05:08:03+08:00
trace_id: f3296cbb-d786-4a57-ba46-60f691a799aa
content_hash: 70e50e415ad2b7fe52fa07528ce7515bc875a3df9041990502938f320ba24bc1
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 42375244-d011-8173-99a6-d1074a0ff0fa
ioc: null
---

**北山安全** *2026年11月23日 18:30*

一条缓存指令，竟然能把安全响应头一起「缓存掉」。Searchlight Cyber 的研究者把三个互不相关的缺陷串在一起，在 Cloudflare 的 `/cdn-cgi/image/` 上打出了同源 XSS，而且同样的手法还顺带打穿了 Netlify Image CDN 和 S3 对象存储。

## 一、背景：/cdn-cgi/ 这个安全边界

如今 Cloudflare 是 Web 上最主要的 CDN 和反向代理服务商。写作时它挡在 24.3% 的网站 前面，占已被测量的反代市场 84% 以上。当一个域名接入 Cloudflare 后，Cloudflare 就会在该域名下暴露一套托管的 /cdn-cgi/ 命名空间，各种产品都往这个命名空间下挂路由：

-   机器人检测用的 JavaScript
    
-   邮箱地址混淆
    
-   Image Transformations（图片变换）
    
-   Web Analytics
    
-   Access
    

这些端点由 Cloudflare 管理，却从客户自己的域名下发，因此形成了一条格外有意思的安全边界。过去几年，研究者们已经反复证明 `/cdn-cgi/` 下的功能可以被改造成 CSP 绕过、XSS gadget 以及其他意想不到的原语：

-   @kinugawamasato：Cloudflare /cdn-cgi/nexp CSP bypass
    
-   @albinowax、@garethheyes：When security features collide
    
-   @kinugawamasato：Cloudflare /cdn-cgi/scripts/ CSP bypass
    
-   @avlidienbrunn：0-Days & HTMX-SS with Mathias - HackerNotes
    
-   @matured_kazama：Cloudflare MCP Server Portal XSS to Account Takeover
    
-   @kevin_mizu（本文作者）：Image Transformations CSPT to innerHTML gadget
    

带着这段历史，去年第一次线下 LHE 时，作者和 Adam Kues（@hash_kitten）定了个朴素的目标：通过 `/cdn-cgi/image/` 拿下 XSS。那一次失败了，于是搁置。

最近一次在英国的公司年会，两人决定重来一遍。这一次三块拼图终于凑齐：一个 SVG 消毒器绕过、一个新的 Chromium gadget（用来剥掉 CSP），以及一条在受限 source 配置下也能成立的开放重定向链。

## 二、先理解 /cdn-cgi/image/ 的内部流程

在进入细节之前，先看这张高度简化的内部流程图。

![Cloudflare Image Transformations 内部流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/171a9f5722c836a4.jpg)

① 识别为 SVG 后进入消毒；② 返回时带上 default-src 'none' 的 CSP；③ 先校验 source URL 是否被允许

据此，要打通这条 XSS 只需要三块：

-   绕过 SVG 消毒器 svg-hush；
    
-   绕过 `default-src 'none'` 的 CSP；
    
-   让端点去加载一张由攻击者控制的图片。
    

## 三、绕过 svg-hush

先假设我们能控制源图片。svg-hush 用 Rust 写成，消毒管线相当直接：

-   初始化 xml-rs 解析器
    
-   遍历解析出来的 XML 事件
    
-   校验每个元素的命名空间与名称
    
-   过滤属性
    
-   序列化过滤后的事件
    

既然消毒器是「解析再重新序列化」，那么解析器差异（parser differential）和变更式行为（mutation）自然是值得怀疑的方向。不过研究者在 xml-rs 的序列化逻辑里发现了更有趣的东西。

在 svg-hush 使用的配置下，perform_escaping 默认为 true，普通属性值会被包进 `Escaped<AttributeEscapes>` 后再格式化，引号、尖括号、& 都能安全编码：

```rust
pub fn emit_attributes<W: Write>(&self, target: &mut W,
        attributes: &[Attribute<'_>]) -> Result<()> {
    for attr in attributes {
        write!(target, " {}=\"", attr.name.repr_display())?;
        if self.config.perform_escaping {
            write!(target, "{}",
                Escaped::<AttributeEscapes>::new(attr.value))?;
        } else {
            write!(target, "{}", attr.value)?;
        }
        write!(target, "\"")?;
    }
    Ok(())
}
```

但命名空间声明走的是另一条路。XML 解析器把它们存成命名空间元数据，与 svg-hush 处理的那个普通属性列表是分开的。序列化时，emit_current_namespace_attributes 直接把 URI 原值写进输出，不做转义：

```swift
#[track_caller]
pub fn emit_current_namespace_attributes<W>(&self, target: &mut W)
        -> Result<()>
    where W: Write
{
    for (prefix, uri) in self.nst.peek() {
        match prefix {
            // [...]
            NS_NO_PREFIX => if uri == NS_EMPTY_URI {
                Ok(())
            } else {
                write!(target, " xmlns=\"{uri}\"")
            },
            // everything else
            prefix => write!(target, " xmlns:{prefix}=\"{uri}\""),
        }?;
    }
    Ok(())
}
```

于是在消毒器完成校验之后，序列化阶段仍能从 `xmlns` 的引号里逃出去：

```html
<s:svg xmlns:s="http://www.w3.org/2000/svg"
  xmlns="&quot;&gt;&lt;a:script xmlns:a=&quot;
  http://www.w3.org/1999/xhtml&quot;&gt;alert(location.href)
  &lt;/a:script&gt;&lt;svg"></s:svg>
```

这段 payload 看起来普通： `s:svg` 根元素在合法的 SVG 命名空间里， `&quot;` 也只是正常的实体写法，消毒器照常放行 —— 问题在于它没去看默认命名空间的值里藏了什么。

于是 `s:` 前缀让根元素仍归属合法的 SVG 命名空间，因此能通过消毒器；而默认命名空间被单独存放，稍后序列化时不做转义。把它丢进 `/cdn-cgi/image/` ，返回的 body 就变成了：

```html
<?xml version="1.0" encoding="utf-8"?>
<svg xmlns=""><a:script xmlns:a="http://www.w3.org/1999/xhtml">
  alert(location.href)</a:script><svg"/>
```

注意这里的技巧：在 XHTML 命名空间下， `<a:script>` 会被当成真正的脚本元素执行。第一块拼图到手。

## 四、Chromium 的 Cache-Control 处理

接下来要越过这道 CSP：

```
Content-Security-Policy: default-src 'none';
  navigate-to 'none'; form-action 'none';
  img-src data:; style-src 'unsafe-inline';
```

简单说，除了基础渲染，HTML 能干的事基本都被封死了：没有 JavaScript、没有 iframe、没有表单、没有外部资源。在常规配置下，绕过它看起来不可能。但在 `/cdn-cgi/image/` 上，我们不仅控制被处理的源图片内容，还控制一部分被转发给客户端的响应头。被转发的响应头清单很短：

-   `Cache-Control: *`
-   `X-*`

看起来很短，但对 Chromium 来说已经够了。翻看 RFC 7234 中的 no-cache 指令，会看到这样一种行为：

![RFC 7234 中 no-cache 指令的定义](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/93a9d693dd859e37.jpg)

RFC 7234：no-cache 指令允许带一个用引号字符串写出的参数

按 RFC 描述， `cache-control` 指令支持一个符合 引号字符串 语法的参数。它指定的是：重用缓存响应时，哪些响应头必须被排除。

```
Cache-Control: no-cache="<field-name>"
```

研究者扒了 Chromium、Firefox、Safari 三大引擎的 `Cache-Control` 实现，发现只有 Chromium 实现了这种「选择性剔除响应头」的行为。相关逻辑在 HttpResponseHeaders::AddNonCacheableHeaders。

这个特性的初衷要追溯到 1996 年，看一下 W3C 邮件列表里关于 Cache-control 的讨论：

![W3C 邮件列表讨论](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/fa9d2e827e69de35.jpg)

1996 年 W3C 邮件列表：当初的想法是支持未来的不可缓存头，并把 Set-Cookie 之类的敏感头排除在缓存之外

最初的想法是支持未来出现的「不可缓存」响应头，以及把 `Set-Cookie` 这类敏感头从缓存响应中剔除：

```
Cache-Control: no-cache="Set-Cookie"
```

于是问题来了：有没有限制说哪些头不能被排除？答案很简单 —— 完全没有。

既然这样， `/cdn-cgi/image/` 自己加上的 CSP，就能被这样一行源站响应头从 Chromium 的缓存表示里剔除掉：

```
Cache-Control: no-cache="Content-Security-Policy"
```

首次响应里仍然带着 CSP，所以第一次导航时脚本照样被拦。但当 Chromium 把响应存进 HTTP 缓存时，body 留下了， `Content-Security-Policy` 头却被排除在外。

最后一步就是不带 CSP 地加载这份缓存。这需要诱使 Chromium 在一次历史导航中使用它的 磁盘缓存。

这个手法在 CTF 圈从 2022 年就为人所知，由 @arkark\_ 在 SECCON 2022 spanote 的 write-up 中演示。思路是打开并控制一个新窗口：

-   在新窗口打开目标页面。
    
-   把该窗口导航到我们自己的域名。
    
-   调用 history.back() 回到目标页面。
    

正常情况下，后退导航可能从 Back/forward cache 恢复原文档，那样 CSP 也就一并回来了。但由于这个被打开的窗口保持着 window.opener 关系，它不符合 BFCache 的条件，Chromium 只能退回到 HTTP 缓存 —— 而那里的响应 body 是不带 `Content-Security-Policy` 头的。

下面这个短小的 Flask 应用，可以演示 Chromium 中 CSP 被剔除的过程：

```python
from flask import Flask, request, Response
app = Flask(__name__)


@app.route('/')
def index():
    res = Response('<script>alert("Hello, World!");</script>',
                   status=200, mimetype='text/html')
    res.headers['Content-Security-Policy'] = \
        "default-src 'self'; script-src 'self';"
    res.headers['Cache-Control'] = \
        request.args.get('cache', 'no-cache')
    return res


@app.route('/poc')
def poc():
    return ('''<p id="poc">Click to start the PoC</p>
    <script>
    document.getElementById("poc").addEventListener("click",
        function() {
        var tab = window.open(
            `/?cache=no-cache="Content-Security-Policy"`);
        setTimeout(function() {
            tab.location.href = "/poc?trigger.history.back";
        }, 1000);
    });


    if (location.search.includes("trigger.history.back")) {
        history.back();
    }
    </script>''')


if __name__ == '__main__':
    app.run("127.0.0.1", 5000)
```

![Flask PoC 演示](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7263de8a331ae0d1.jpg)

第一次渲染脚本被 CSP 拦下；history.back() 回到缓存副本后，alert 照常弹出（地址栏可见 no-cache 参数）

## 五、用 Cloudflare Access 突破 source 限制

消毒器绕过 + CSP 绕过，打出 XSS 所需的东西已经差不多了。最后缺的一块：如何在别人的域名上，让这个端点加载我们自己的图片。先看 Image Transformations 的 source 配置：

![Image Transformations 的 source 配置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/201a3afec741449a.jpg)

source 配置三选一：仅本域名（默认）、指定源站、任意源站

三种配置：

-   This zone only（本域名，默认）： `*.domain.com`
    
-   Specified origins（指定源站）： `domain.com`
    
-   Any origin（任意源站）
    

最相关的是默认的 This zone only。若配置成 Any origin，整条 XSS 链直接就能打通，因为图片可以从任意域名加载。但作者不想止步于此，目标是让 XSS 在更严格的配置下也成立。

继续推进时，他们利用上 `/cdn-cgi/image/` 的另一个行为：图片抓取器会跟随 HTTP 重定向，却不检查重定向目标是否仍被 source 配置允许。因此，只要允许的源站上存在一个开放重定向，就足以加载任意域名的图片。

这更好了，但还不够。他们希望即使该 zone 没有任何开放重定向、甚至使用最严格的 source 配置，XSS 也能成立。只需要一个 gadget 就能做到：一个挂在 `/cdn-cgi/` 下的开放重定向。

寻找过程中撞了不少南墙：

-   普通的 `/cdn-cgi/image/` source 抓取无法加载另一个 `/cdn-cgi/image/` 端点。内部 source 请求带有 `Via: 1.1 image-resizing-proxy` ，递归抓取时端点会被禁用；
    
-   /cdn-cgi/media/ 用的是另一套 URL 解析器，不保留源的 `Cache-Control` 头，也没有 `onerror=redirect` 选项；
    
-   图片缓存在各域名之间共享：通过 domain-1.com 缓存的图片可以从 domain-2.com 复用。他们研究过能否用缓存键注入把 `xxx.com/img.png` 的图片存到 `yyy.com/img.png` 的缓存键下，但没找到可用的原语；
    
-   ……
    

在花了好几个小时啃 Cloudflare `/cdn-cgi/` 的内部实现之后，他们发现了一个有意思的行为：当 zone 内任意一个主机名启用了 Cloudflare Access 时， `/cdn-cgi/access/login` 和 `/cdn-cgi/access/logout` 在该 zone 所有被代理的主机名上都可用。

更具体地说， `/cdn-cgi/access/logout` 接受一个 `returnTo` 参数，允许重定向到：

-   该 zone 的 `<team>.cloudflareaccess.com` 主机名；
    
-   `cloudflare.com`
    
    的子域名。
    

第二种最有意思。如果某个被允许的 `cloudflare.com` 主机名本身存在开放重定向，就能通过 `/cdn-cgi/access/logout` 串到我们自己控制的域名上。

排查可用的 Cloudflare 端点后，他们找到了这个重定向：

```
https://discord-mock-oauth.research.cloudflare.com/
  authorize?redirect_uri=http%3A%2F%2F<domain>%2Fpoc.svg
  &state=mizu
```

于是，对于使用了受限 source 配置的 zone，只要 zone 内任意主机名启用了 Cloudflare Access，最终 XSS 链就成立了：

![完整 XSS 链（上）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8111cf951837772e.jpg)

完整链路（上）：从 /cdn-cgi/image/ 出发，经 access/logout 的 returnTo、discord-mock-oauth 的 redirect_uri，最终加载攻击者域名下的 poc.svg

![完整 XSS 链（下）](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e63d4d7e38f779e7.jpg)

完整链路（下）：首次渲染 CSP 拦截脚本、响应进缓存但丢掉 CSP；history.back() 后从 HTTP 缓存渲染，脚本在目标域执行

![在 www.cloudflare.com 上触发 XSS](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2f36ec085e73927.jpg)

最终结果：在 https://www.cloudflare.com 上通过 /cdn-cgi/image/ 触发的 XSS

## 六、把 Cache-Control no-cache 原语玩得更远

### 6.1 Netlify 场景

打通 Cloudflare `/cdn-cgi/image/` 之后，他们开始想：这个 `Cache-Control` 原语能不能用在别处？先看 Next.js 这类主流框架，很快就碰壁了 —— Next.js 只读取 `s-maxage` 或 `max-age` 指令，然后把值转成整数。

继续深挖时，一个服务脱颖而出：Netlify Image CDN。

![Netlify Image CDN 配置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d282079d029839f.jpg)

Netlify Image CDN 文档「Custom headers」一节：Netlify 会保留外部源站下发的 Cache-Control 头

在 Netlify 上，能不能加载远程图片取决于 `remote_images` 配置。他们梳理出三种可能场景：

① remote_images 里写了通配正则：

```
[images]
remote_images = [".*"]
```

② remote_images 里的正则转义没写对。下面这个配置同时接受 `https://aab.com/` ，因为 `a.b` 里的 `.` 没被转义，会匹配任意字符：

```
[images]
remote_images = ["^https://a.b.com/.*$"]
```

③ 某个被允许的源站上存在开放重定向。和 `/cdn-cgi/image/` 一样，重定向目标不会对照 `remote_images` 做检查。

公开的 Netlify 图片处理 handler 结构类似：先用 `remote_images` 校验初始源 URL，再在开启 `allowAllDomains` 的情况下交给 IPX。

加载一张 `image/svg+xml` 图片时，响应是这样的：

```
HTTP/2 200
Content-Security-Policy: script-src 'none'
Content-Type: image/svg+xml
Cache-Status: "Netlify Edge"; fwd=miss; fwd-status=200; stored
Server: Netlify
Content-Length: 125
```

Netlify 开源的 Image CDN 实现（Netlify Dev 用它模拟线上端点）会把 SVG 交给 IPX，IPX 再调用 SVGO 的 removeScripts 插件 来做消毒。线上托管实现并不公开，所以无法确认它是否走完全相同的代码路径。

此时作者问自己：有了 `Cache-Control` 原语，真的还需要理解并绕过消毒器才能拿到 XSS 吗？答案是 —— 其实不需要:)

到这一步为止，他们只用带引号的 `no-cache` 指令把 `Content-Security-Policy` 头从 Chromium 的缓存表示里剔除。但同一个原语可以剔除任意响应头，包括 `Content-Type` 。

既没有 `Content-Type` ，也没有 `X-Content-Type-Options: nosniff` 时，Chromium 会根据内容猜测响应类型。这是 Chromium MIME 嗅探实现 的一部分：

```cpp
#define MAGIC_HTML_TAG(tag) \
  MAGIC_STRING("text/html", "<" tag)


static const MagicNumber kSniffableTags[] = {
  MAGIC_NUMBER("text/xml", "<?xml"),
  MAGIC_HTML_TAG("!DOCTYPE html"),
  MAGIC_HTML_TAG("script"),
  MAGIC_HTML_TAG("html"),
  MAGIC_HTML_TAG("!--"),
  MAGIC_HTML_TAG("head"),
  MAGIC_HTML_TAG("iframe"),
  MAGIC_HTML_TAG("h1"),
  MAGIC_HTML_TAG("div"),
  MAGIC_HTML_TAG("font"),
  MAGIC_HTML_TAG("table"),
  MAGIC_HTML_TAG("a"),
  MAGIC_HTML_TAG("style"),
  MAGIC_HTML_TAG("title"),
  MAGIC_HTML_TAG("b"),
  MAGIC_HTML_TAG("body"),
  MAGIC_HTML_TAG("br"),
  MAGIC_HTML_TAG("p"),
};
```

所以，只要把 `Content-Type: image/svg+xml` 从缓存响应里剔除，一张以 `<!DOCTYPE html>` 开头的 SVG，从 Chromium 磁盘缓存恢复时就会被嗅探成 `text/html` ：

```html
<!doctype html>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg">
...
</svg>
```

这一点特别有用，因为 SVG 文档通常按 XML 解析，而 XML 解析和 HTML 解析差异很大。其中可以利用的差异之一，是处理指令（processing instruction）的结束方式。

在 XML 里，处理指令一直持续到 `?>` （源码）：

```
<?pi INSIDE PI > INSIDE PI ?>
```

在 HTML 里，它在第一个 `>` 就结束（源码）：

```
<?pi INSIDE PI > OUTSIDE PI ?>
```

正是这点细微差别：一段标记在文档按 SVG 解析并被消毒时，可以安静地待在处理指令里面；而当同一份 body 被当作 HTML 重新解析时，它又活了过来。

之所以成立，是因为 SVGO 的 removeScripts 插件 只注册了 `element` 访问器，处理指令节点根本不会被检查或移除。

于是完整原语只用这样一个响应头：

```
Cache-Control: no-cache="Content-Security-Policy, Content-Type"
```

配合下面这个 SVG/HTML 多语言文件（polyglot）：

```html
<!doctype html>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg">
<?a ><script>alert(location.href)</script> a?>
</svg>
```

![Netlify SVG/HTML polyglot 演示](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/72b67b04e9732b38.jpg)

按 XML 解析时浏览器直接报错（StartTag: invalid element name）；Cache-Control 剔除 CSP 与 Content-Type 后，同一份 body 被当作 HTML 解析，alert 弹出

整条链路如下：

![Netlify 上的完整链路](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c297208f671aaaa.jpg)

Netlify 链路：用 no-cache 同时剔除 CSP 与 Content-Type，让 SVG 在缓存回放时被当作 HTML 执行

### 6.2 云对象存储

再想想 `no-cache` 指令还能用在哪，思路就飘到了云对象存储。正如 @avlidienbrunn 在 varmarunionen 挑战里提到、后来又被 @AmirMSafari 在 Content-Type Override to Stored XSS on Public Objects 中展开的那样：公开可读的 S3 对象，可以用我们自己 AWS 凭证生成的预签名 URL 来请求。

原理是：对象对任何 AWS 身份都可读，而给请求签名后就能解锁以下 GetObject 响应头覆盖参数：

-   `response-cache-control`
-   `response-content-disposition`
-   `response-content-encoding`
-   `response-content-language`
-   `response-content-type`
-   `response-expires`

顺带一提， `response-content-type` 这个技巧在 Google Cloud Storage V4 签名 URL 上同样有效。

原始技巧是在签名请求里带上 `response-content-type=text/html` ，覆盖已上传对象存储的 `Content-Type` ，从而让一张 PNG/HTML polyglot 被当作 HTML 下发并解析。当 bucket 通过自定义域名、 `CNAME` 、proxy_pass 端点，或任何会把原始查询参数转发到 S3 的配置暴露出来时，这个技巧尤其好用。

不过，当存储响应本身带 CSP 保护时，这个技巧单独无效。这正是 Chromium 的 `Cache-Control: no-cache="<field-name>"` 行为能把它推得更远的地方：再加上这样一个签名参数 `response-cache-control=no-cache="Content-Security-Policy"` 即可。

```python
import shlex
import subprocess


import boto3
from botocore.config import Config


bucket = "poc-csp-cache"
key = "mizu.jpg"
region = "us-east-1"


s3 = boto3.client(
    "s3",
    region_name=region,
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"},
    ),
)


url = s3.generate_presigned_url(
    ClientMethod="get_object",
    Params={
        "Bucket": bucket,
        "Key": key,
        "ResponseContentType": "text/html",
        "ResponseCacheControl": 'no-cache="Content-Security-Policy"',
    },
    ExpiresIn=300,
)


command = [
    "curl",
    "-sS",
    "-D", "-",
    "-o", "/dev/null",
    url,
]


print("$", " ".join(shlex.quote(value) for value in command))
print()


subprocess.run(command, check=True)
```

![直接访问公开可读对象](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/58ed61afb4af0107.jpg)

直接访问公开可读的对象：Content-Type 是 PNG，且受 CSP 保护，脚本无法执行

![通过预签名 URL 访问](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/825e3adf6e300daf.jpg)

用自己凭证生成的预签名 URL，带上 response-content-type 和 response-cache-control，类型被覆盖为 HTML，且缓存表示中不再有 CSP

## 七、结语

一开始只是想通过 `/cdn-cgi/image/` 拿下 XSS，最后却用上了三个彼此独立的基础缺陷：svg-hush 的序列化 bug、Chromium 对 `Cache-Control: no-cache` 中字段名参数的处理，以及一条让结果在严格图片源配置下依然可达的 Cloudflare Access 重定向链。

更重要的是，这个 `Cache-Control` 原语并不限于 Cloudflare。在 Netlify Image CDN 上，它能同时剔除 `Content-Security-Policy` 和 `Content-Type` ，把 SVG 消毒器的解析差异升级成 HTML 执行；在 S3 源站上，签名后的响应头覆盖参数让我们对这两个头都有直接控制权，从而把技巧扩展到自定义域名、 `CNAME` 记录，以及会保留查询参数的反向代理。

总的教训是：不能仅凭 body 就认为抓取来的内容安全。当代理、图片优化器或存储服务会保留源站响应头，或者允许 URL 参数覆盖它们时，这些响应头就成了安全边界的一部分。一条看似无害的缓存指令，就能彻底改变 Chromium 处理缓存响应的方式，把原本彼此隔离的图片或对象分发功能，变成同源 XSS。

* * *

## 参考链接

-   Searchlight Cyber 原文
    
-   cloudflare/svg-hush
    
-   netvl/xml-rs
    
-   Chromium HttpResponseHeaders::AddNonCacheableHeaders
    
-   RFC 7234 - no-cache
    
-   RFC 9110 - Quoted strings
    
-   SECCON 2022 spanote write-up
    
-   Chromium MIME sniffer
    
-   SVGO removeScripts
    
-   Netlify Image CDN - remote_images
    
-   AWS S3 GetObject 响应头覆盖
    
-   Content-Type Override to Stored XSS on Public Objects
    

优秀文章 · 目录
