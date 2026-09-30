---
title: "Update: search-for-compression.py Version 0.0.8"
source: https://blog.didierstevens.com/2026/09/30/update-search-for-compression-py-version-0-0-8/
source_host: blog.didierstevens.com
clip_date: 2026-09-30T16:00:00+08:00
trace_id: 2e2f0a91-7570-4759-9f68-334dbdf6179b
content_hash: 6b3ccfa1c4b580a152bf3556c9169cb28b8a6a4aadcc365974286b542b8e826b
status: synced
tags:
  - 安全工具
  - 恶意样本
series: null
feed_source: Didier Stevens
ai_summary: "**TL;DR：** 新增 -S 选项指定解压缓冲大小，解决 zlib 压缩块后面紧跟其他数据时因解压报错而漏检的问题。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-814c-a5a5-d7d6783b807b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 新增 -S 选项指定解压缓冲大小，解决 zlib 压缩块后面紧跟其他数据时因解压报错而漏检的问题。
> 
> - **问题起因：** 当 zlib 压缩数据块后面还有其他数据时，后续数据会触发解压错误，导致整个数据块被直接忽略，压缩块无法被检出。
> - **新增选项：** `-S` 接受一个正整数，表示解压缓冲区大小；默认值为 0。
> - **判定逻辑：** 例如使用 `-S 100` 时，先尝试解压最多 100 字节，若成功即认定找到了压缩数据。
> - **回退机制：** 随后继续解压剩余数据，直到出错或数据耗尽；一旦出错，则回退到上一次未报错的解压结果并报告该结果。
> - **获取方式：** 脚本仍只放在作者的 beta 仓库中（即尚未进入正式/稳定发行版本）。

I’ve noticed when a zlib compressed chunk of data is followed by other data, search-for-compression.py will not always be able to detect the compressed chunk. This is caused by the fact that the other data generates a decompression error, and the complete chunk is disregarded.

I’ve added a new option to try to solve this: -S

Option -S takes a value, a positive number. It’s the size of the decompression buffer. By default, its value is 0.

When you try -S 100 for example, search-for-compression.py will try to decompress up to 100 bytes. If that succeeds, then we assume that we found compressed data, and search-for-compression.py will try to decompress the remainder of the data until either a decompression error occurs, or there is no more data. But when an error occurs, search-for-compression.py will revert to the last decompression without error, and report that.

[search-for-compression.py is still in my beta repository](https://github.com/DidierStevens/Beta/blob/master/search-for-compression.py).
