---
title: 【先知】有意思的ssrf绕过
source: https://xz.aliyun.com/news/92821
source_host: xz.aliyun.com
clip_date: 2026-09-14T12:30:12+08:00
trace_id: 4387c4f7-f67b-4a12-b9ae-e39f3b7741dc
content_hash: 9e153d6f5f1102584317cd4b383825358d18b1b73ade1fddbfce4fece90f04d6
status: synced
tags:
  - 先知
  - 漏洞分析
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: 使用 urlparse 与 urllib3 对反斜杠的处理差异，绕过后端 myqcloud.com 后缀白名单，把请求打到 VPS/内网，实现全回显 SSRF。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3db75244-d011-8116-92db-eb339a113fb8
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 使用 urlparse 与 urllib3 对反斜杠的处理差异，绕过后端 myqcloud.com 后缀白名单，把请求打到 VPS/内网，实现全回显 SSRF。
> 
> - **功能限制：** 用户上传文件到腾讯云 COS 后，服务端可加载可控地址，但要求域名以 myqcloud.com 结尾，否则拒绝。
> - **@ 符试探：** `https://x.myqcloud.com@vps.com` 被拒、`https://vps.com@x.myqcloud.com` 通过，说明 @ 未被过滤，后端只校验 host 后缀。
> - **报错情报：** 请求不存在的 anybucket.myqcloud.com 时返回 urllib3 域名解析失败，暴露后端为 Python，校验疑似用 urllib.parse.urlparse。
> - **解析差异：** urlparse 不把 `\` 当分隔符，按最后一个 @ 切分；urllib3 的 authority 正则把 `\` 视作终止符，host 被截断。
> - **最终 Payload：** `https://vps.com\@a.myqcloud.com/x.jpg`，校验侧看到 a.myqcloud.com 放行，实际请求发往 vps.com，可换成内网地址拿全回显。

近期挖赏金的时候遇到这样一个功能场景存在ssrf但是利用条件有点苛刻然后从协议和代码层面拆分底层逻辑以后成功绕过限制打出全回显ssrf，个人觉得比较有意思所以写出来分享一下，希望对各位师傅有所帮助。

**功能场景:**

**功能一:用户上传一个文件到腾讯云cos**

**功能二:获取上传文件的地址(可控)然后去加载。服务端怕你填内网地址打ssrf，于是规定：** **域名必须以 myqcloud.com 结尾（腾讯云 COS），否则拒绝。 这是经过尝试后推断出来的 并非最开始就知道**

如果你填写的地址是满足要求(myqclound.com)的那么他会去请求这个地址的资源并把资源给加工出来。

我们先试进行了常规的@符号尝试绕过，构造payload为https://x.mycloud.com@vps.com,如果按照正常的结果会有请求发送到vps去，但是这里后端显示非法地址。那么说明存在校验，但是这里校验的是什么呢？是@？还是外部域名？然后我进行对换位置构造https://vps.com@x.mycloud.com但是这里不符合URL标准，这个payload会被请求到mycloud.com这个地址去显然达不成ssrf的目的，但是我为了去判断他校验的标准于是构造了这个payload去尝试判断，发现他通过了并且也去请求了拿到了我们刚才上传的音视频结果，那么到这里证明一点@没有被过滤掉，后端校验的是host是否为mycloud.com就行。

URL标准参考

```plain
scheme://[userinfo@]host[:port]/path
```

## 报错泄露后端信息

从上面看服务器拉取了正常的图片，但是不满足ssrf目的，于是我再进行构造一个正常的且不存在的地址让后端去请求，看后端会报什么错误信息(回包信息本身就是情报面)，于是我构造的payload如下:https://anybucket.mycloud.com/x.jpg(这个地址就不存在),发现后端确实会去请求，并且他报错了，报错的内容给了我很大的操作空间。

```plain
extract_prompt_timbre_feature failed: download audio failed:  HTTPSConnectionPool(host='anybucket.myqcloud.com', port=443):  Max retries exceeded with url: /x.jpg  (Caused by NameResolutionError("<urllib3.connection.HTTPSConnection object at 0x7ff8c42b3250>:Failed to resolve 'anybucket.myqcloud.com'     ([Errno -2] Name or service not known)"))
```

从返回的内容看，urllib3这是python的一个第三方库，说明后端使用Python 程序使用 urllib3 发起 HTTPS 请求，在下载音频资源这一步触发域名解析失败，函数直接失败。从这里能得到信息不止这一点，那么我们是不是可以推断他在校验那一步也是用的python代码写的。那python写url校验的代码第一个想到的就是urlparse，不知道的师傅可以搜一下。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0980799d4d9e77ec.png)

从这里我们进行反推校验的代码，代码如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/86d9fe4dfd76b915.png)

那这就是我们刚才能通过校验的原因，现在再去拆分urllib3的代码逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c91f7cfeb98a47b.png)

这样就正好满足了我们我们刚才发生的报错情况，域名解析失败(地址不存在)，于是开始新一轮的绕过。

来看parse_url遵循的什么标准，urllib3.util.parse_url 文档自称 RFC 3986/RFC 6874 兼容，解析结构同样是 scheme://\[userinfo@\]host\[:port\]/path：@ 是分隔符，@ 前面全部属于 userinfo（哪怕写的是域名、IP 也只算 auth 身份字段），@ 之后到端口/路径之前才是 host；如果存在多个 @，以最后一个 @ 作为 userinfo 和 host 的分界（内部实现是 rpartition("@")）。这套规则和 urlparse 是一样的——这意味着多 @ 本身在两个解析器之间制造不了差异

## 两个解析器的分工

整体的逻辑就是后端在校验域名规则时，使用urllib.parse.urlparse，取出 hostname 判断是否以myqcloud.com结尾，匹配则放行；发起网络请求拉取资源时，底层用urllib3.util.parse_url，用解析得到的 host 建立 HTTPS 连接、执行 DNS 解析。

普通 Payload：https://vps.com@a.myqcloud.com/x.jpg

urlparse 解析：hostname = a.myqcloud.com命中白名单后缀，校验放行，urllib3 parse_url 解析：host = a.myqcloud.com，最终请求腾讯云域名，无法打到 VPS。这就是单@Payload 失效的根本原因。

我们的目标： **让 urlparse 解析出的 hostname 满足白名单后缀，同时 urllib3 解析出来的 host 为我们可控的 VPS和内网地址。**

## 反斜杠导致的解析差异

关键的绕过点来了， **urlparse 和 urllib3 看起来都"遵循"同一套语法，那差异到底在哪？答案是反斜杠 \\。urllib.parse（纯 RFC 3986 行为）：\\ 在 URL 里不是分隔符，只是普通字符， urlparse 完全不特殊处理它；urllib3：authority 部分的匹配正则实际上是 \[^\\\\/?#\]\*——反斜杠和 /、?、# 一样被当作 authority 的终止符。也就是说 urllib3 在这里并没有"严格"遵循 RFC 3986，而是向浏览器/WHATWG URL 标准看齐（浏览器对 http/https 这类 special scheme 把 \\ 当 / 处理）**

**最终我们构造**

```plain
https://vps.com\@a.myqcloud.com/x.jpg
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e24c3bf3ba5fe313.png)

两个解析器各看各的：urlparse：\\ 是普通字符，按最后一个 @ 切分 → userinfo = vps.com\\，hostname = a.myqcloud.com → 白名单放行

## 最终 Payload 与结果

urllib3：authority 匹配到 \\ 就截断 → authority = vps.com（此时 @ 根本没机会参与 userinfo 切分），host = vps.com，剩下的 \\@a.myqcloud.com/x.jpg 被并进 /%5C@a.myqcloud.com/x.jpg）→ 请求发到 VPS，最后构造成内网地址成功实现全回显ssrf

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49958759c4051c71.png)

所以有的时候还是需要从底层去推理实现绕过的手法，而不是拿着payload一顿怼，理解比只会用工具强。

SecTime原创作者
