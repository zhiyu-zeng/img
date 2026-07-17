---
title: 【看雪】tiktok最新参数X-Dynosaur分析
source: https://bbs.kanxue.com/thread-292046.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-17T11:37:22+08:00
trace_id: a229a29d-4b39-49bf-a464-ee3b913014bb
content_hash: b9199f8fbcf7ad1b028e998f74fa949a3fb50924bbe51bb9694bc3d8b4fdba8a
status: summarized
tags:
  - 看雪
  - TikTok逆向
  - 参数加密
series: null
feed_source: 看雪·逆向工程
ai_summary: 通过调试逆向分析TikTok的X-Dynosaur参数生成机制，揭示了其数据结构和加密流程。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3a075244-d011-8131-b886-c0e6dffe2a9f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过调试逆向分析TikTok的X-Dynosaur参数生成机制，揭示了其数据结构和加密流程。
> 
> - **调试方法**：使用开发者工具对`item_list`请求设置XHR/fetch断点，捕获参数生成前的调用栈和日志。
> - **数据分析**：记录输入长度（如query 1447字符、UA 117字符）和中间Buffer长度（243字节），分析字段数据分25段TLV格式。
> - **变量测试**：通过单变量对照（如修改cursor、User-Agent、时间），识别输入对应的数据段变化，确认使用增强FNV哈希算法。
> - **加密与编码**：字段数据加密后长度不变，插入48字节key，总长292字节，再经自定义字符表编码为392字符输出。
> - **流程总结**：数据流从query/UA/body输入，经过字段提取、加密、key插入和自定义编码，最终生成X-Dynosaur参数。

最近看美女主页的时候发现突然多了个参数X-Dynosaur，后面测试了下目前还没有检测，但是可以提前分析看看难度，具体加密感觉跟xg差不多，大部分是ai分析的简单来给大家分享一下。  
目标网址 "aHR0cHM6Ly93d3cudGlrdG9rLmNvbS9AYW5uaWlld29yYnkK"  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5faf0d72e64327fa.webp)
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/abb3008da545d9d3.webp)

X-Dynosaur 最开始看就是一串很长的字符，直接盯着成品看基本没什么用。我当时主要看了三样东西：请求从哪发、生成前后的长度，还有每次只改一个输入后，哪几段数据跟着变化。

这篇就简单记一下当时的排查过程，细节不全部展开。

## 先把请求停住

页面打开后进开发者工具，在 Network 里过滤 `item_list` ，作品列表走的是：

```python
GET /api/post/item_list/
```

找到请求后先看 Initiator，再到 Sources 里加一个 XHR/fetch breakpoint，关键字填 `item_list` 。刷新或者重新触发作品列表，请求发出前就会停下来。

这里不用一直跟到网络层。顺着调用栈往上找，看到 query 开始追加 `X-Dynosaur` 的位置就差不多了。再往前退一层，把输入长度、中间 Buffer 长度和最终结果长度记到 Console。

第一轮日志大概是这样：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7793f9f4cfe37271.webp)

这次请求的 base query 有 41 个参数，拼起来 1447 个字符；UA 是 117 个字符，GET 请求的 body 为空。日志里先把三块输入各自的 4-byte 结果记下来，后面做对照时就不用一直看整条 query。

再往下是字段区、加密层和外层封装。这里的 `rounds=13` 、 `insert_at=43` 只是这一次运行的值，换一组 key 会变；243、48、292 和 392 这些长度相对稳定。

接下来把 243 bytes 从头扫一遍。日志里多留了几列：

```
idx         当前第几段
tag         这一段的编号
off         在 243-byte Buffer 里的起点
header      开头三个字节
value bytes 后面的实际数据
next        下一段起点
```

开头几段是这种走法：

```
offset 0   : 20 00 06 ...
offset 9   : 21 00 06 ...
offset 18  : 22 00 06 ...
offset 27  : 23 00 06 ...*
```

拿第一行看会直观一点。 `off=0` ，header 是 `20 00 06` ，后面跟 6 bytes 内容，所以这一段结束后落在 offset 9。第二行正好从 9 开始，header 变成 `21 00 06` ，再往后走到 18。

照这个方式一直往后走，中间也能看到 `0x27` 这种 12-byte 内容，以及 `0x2b` 、 `0x2e` 、 `0x30` 这种 4-byte 内容。最后一行是 `tag=0x38` 、 `off=236` 、 `len=4` ，加上三个 header 字节以后，next 正好是 243。  

这张表的 idx 从 00 到 24，刚好 25 行，最后的 cursor 和 Buffer 长度也都是 243。每一段都是编号、保留字节、长度、内容这个排法，后面就按 TLV 往下分析了。

## 再做几组单变量对照

字段边界有了以后，剩下的就是改一个输入、跑一次，再比较日志。

我当时先留了一组基准请求，然后分别动了 `cursor` 、User-Agent 和时间：  

基准请求里， `0x2e` 的 4 bytes 是 `eb43ced1` 。只把 `cursor` 从 0 换成 20，它变成 `0876cee7` ，其他输入相关字段保持原来的位置。 `0x20` 也会跟着动，后面几组都是这个情况，所以把它单独归到了整组字段校验。

UA 从 Chrome 149 换到 150， `0x30` 从 `219130bb` 变成 `3b7395cd` 。body 一直为空， `0x2b` 则保持 `811c9dc4` 。

看到 `811c9dc4` 后，我又单独跑了一轮 hash 对照。只保留异或和乘法时，query 算出来是 `9c916351` ，和日志里的 `eb43ced1` 对不上；循环里增加一次累加后，query 和 UA 两组都能对上，空 body 也刚好停在初始值。增强 FNV 这个判断主要来自这几组对照，不是只看空字符串那一个值。

同样的请求隔一秒再跑， `0x27` 会动，外层结果也会变；连续请求时还能看到计数相关的小字段在变化。这样时间、query、UA、body 这几类输入就能慢慢分开。

## 最外面那层

字段区是 243 bytes，加密后长度还是 243。日志里还能看到 48 bytes 的 key 和 1 byte 的开头标记，合起来是 292 bytes。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/47d4604c19c4e959.webp)

  
这次日志里的插入位置是 43，所以数据排法是：开头放 `4b` ，接 43 bytes cipher，再放 48-byte key，最后接剩下的 cipher。换一组 key 后位置会动，但总长度还是 292。

292 bytes 进入最后的自定义字符表编码后，日志显示输出 392 个字符。这样也能解释为什么同一条请求重复生成时内容会变，长度却经常一样。

整理下来，大概就是这几层：

```
query / UA / body
        ↓
25 段字段数据，243 bytes
        ↓
加密、插入 48-byte key
        ↓
292 bytes 外层数据
        ↓
自定义编码，392 chars
```

这次先写到字段边界和日志对照，具体每个 tag 的编码细节就不往下铺了。

[#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#VM保护](https://bbs.kanxue.com/forum-4-1-4.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)
