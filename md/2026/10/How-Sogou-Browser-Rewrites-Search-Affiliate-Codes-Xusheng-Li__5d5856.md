---
title: "How Sogou Browser Rewrites Search Affiliate Codes :: Xusheng Li"
source: https://xusheng.dev/posts/reversing/sogou_affiliate_rewrite/main/
source_host: xusheng.dev
clip_date: 2026-10-22T10:23:26+08:00
trace_id: 1e0e7abe-3e6a-4b8c-8ef2-593e453434f3
content_hash: 209ae39767982a82ca603aef8c8a3edba717b357a218c130adc58683b26d4041
status: synced
tags:
  - 协议分析
  - 风控对抗
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: 搜狗浏览器 13.9.6121.400 在启动时加载的插件中硬编码了数百个搜索联盟推广码；一旦用户导航到百度或搜狗搜索，浏览器就会把这些推广码替换成搜狗自己的推广码，导致原推广方的流量归属被静默截走。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40175244-d011-81b7-a852-fb6aa2a13798
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 搜狗浏览器 13.9.6121.400 在启动时加载的插件中硬编码了数百个搜索联盟推广码；一旦用户导航到百度或搜狗搜索，浏览器就会把这些推广码替换成搜狗自己的推广码，导致原推广方的流量归属被静默截走。
> 
> - **触发条件：** URL 必须以 `www.baidu.com` 或 `sogou.com` 开头，并且所带推广码必须出现在内置名单中，替换才会发生；如果推广码出现在其他站点上，或者百度链接被包在重定向外壳里，则不会被处理。
> - **百度侧：** 有 11 个 `tn=` 推广码（例如 `47018152_13_dg`、`02049043_35_pg`、`93912046_hao_pg`），它们会统一替换为 `tn=98010089_dg`，同时附加 `ch=19`；如果已有 `ch` 值，则直接覆盖它，不会重复追加。
> - **搜狗侧：** `.data` 段中有三张字符串表，共 593 条互不重复的 `p=sogou-<四个字母>-<16 位十六进制>`，按顺序匹配，首个命中的条目生效，替换目标分别是 `sogou-clse-f507783927f2ec27`、`sogou-clse-60a70bb05b08d6cd` 和 `sogou-addr-cc9657884708170e`。
> - **实现位置：** 这段逻辑位于 `QBSafe.dll` 插件中，该插件在浏览器启动时加载，并接收每次导航请求的 URL。
> - **MITM 验证：** 用 mitmproxy 抓包确认替换只改动参数本身，URL 其余部分保持不变；不在名单内的推广码（例如 `tn=00000000_xx_yy`、`p=sogou-site-ffffffffffffffff`），以及不属于这两个域名、但仍然携带搜狗推广码的请求，都原样发出。

I recently poked at [Sogou Browser](https://ie.sogou.com/) (version `13.9.6121.400`) out of curiosity and found that it rewrites hundreds of affiliate codes in Baidu or Sogou search URLs. Specifically, there is a list of search affiliate codes hardcoded in the binary, and when one is seen, it is replaced. The search engine only ever sees the substituted code — the original never reaches it.

## Affiliate codes, briefly

If you have looked closely at a Baidu search URL you have seen something like this:

```
https://www.baidu.com/s?wd=something&tn=47018152_13_dg&ie=utf-8
```

That `tn=` is a Baidu Union account identifier — it tells Baidu which partner the traffic came through. This is old and well known; Firefox historically shipped `tn=suvion_dg`, Maxthon used `tn=myie2dg`. Software that ships a Baidu search box generally has its own code.

Sogou has an equivalent. Sogou search URLs carry a `p=` parameter shaped like `sogou-site-0e57098d0318a954` — a four-letter channel type and sixteen hex digits.

## Replacing the codes

When a Sogou Browser user navigates to a Baidu search carrying an affiliate code, this is what the browser actually requests:

```
in   https://www.baidu.com/s?wd=test&tn=47018152_13_dg&ie=utf-8
out  https://www.baidu.com/s?wd=test&tn=98010089_dg&ie=utf-8&ch=19
```

And the same on Sogou, with that engine’s own `p=` scheme:

```
in   https://www.sogou.com/web?query=x&p=sogou-site-0e57098d0318a954&ie=utf8
out  https://www.sogou.com/web?query=x&p=sogou-addr-cc9657884708170e&ie=utf8
```

The code is swapped and the rest of the URL is left alone. On the Baidu side a `ch=19` parameter is set as well, overwriting any existing `ch` value rather than duplicating it.

Two conditions have to hold for it to fire at all. The URL must *begin* with `www.baidu.com` or `sogou.com` — a Sogou code carried by some other site, or a Baidu URL nested in a redirect wrapper, is ignored. And the code has to appear on a list built into the browser; anything else is left untouched.

## The list of codes

The lists live in a plugin called `QBSafe.dll`, loaded at browser startup, which receives every navigation URL.

For Sogou URLs there are three tables of strings in `.data`, holding 128, 219 and 246 entries — 593 in total, every one of the form `sogou-<four letters>-<sixteen hex>`, and every one distinct. Each table has a single replacement, and the tables are tried in order with the first match winning:

| entries | replaced with |
| --- | --- |
| 128 | `sogou-clse-f507783927f2ec27` |
| 219 | `sogou-clse-60a70bb05b08d6cd` |
| 246 | `sogou-addr-cc9657884708170e` |

For Baidu URLs there are eleven codes built directly on the stack, all mapping to one replacement:

```
tn=93912046_hao_pg   tn=68082196_oem_dg   tn=18029102_oem_dg
tn=39042058_2_oem_dg tn=02049043_35_pg    tn=47018152_13_dg
tn=02049043_32_pg    tn=47018152_8_dg     tn=02049043_50_pg
tn=93139410_hao_pg   tn=02049043_30_pg
                  ↓
            tn=98010089_dg     (plus ch=19)
```

## MITM verification

To confirm my finding, I set up mitmproxy in front of the browser and observed the behavior:

| navigated to | what left the machine |
| --- | --- |
| baidu `tn=02049043_35_pg` | `tn=98010089_dg …&ch=19` |
| baidu `tn=00000000_xx_yy` | unchanged |
| sogou `p=sogou-site-0e57098d0318a954` | `p=sogou-addr-cc9657884708170e` |
| sogou `p=sogou-site-ffffffffffffffff` | unchanged |
| `example.com/?p=sogou-site-0e57098d0318a954&x=1` | unchanged |

You might be curious why Sogou is doing this. There are many possible reasons, and I will leave that to interested readers.
