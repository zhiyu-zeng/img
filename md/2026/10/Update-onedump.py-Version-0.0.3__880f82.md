---
title: "Update: onedump.py Version 0.0.3"
source: https://blog.didierstevens.com/2026/10/12/update-onedump-py-version-0-0-3/
source_host: blog.didierstevens.com
clip_date: 2026-10-12T23:59:05+08:00
trace_id: ae9c76d1-607c-4aa6-b85e-9e5fcc2df782
content_hash: fb9976f8783566fafaabd0c0dd8b5c775f23706a6820b5b1fbbe2805b5e058b3
status: synced
tags:
  - 安全工具
  - 恶意样本
series: null
feed_source: Didier Stevens
ai_summary: onedump.py 0.0.3 新增 `--jsonoutput`，可一次把多个 .one 文件里的内嵌文件统一导出为 JSON。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f775244-d011-810b-83b1-d5fd151786e7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> onedump.py 0.0.3 新增 `--jsonoutput`，可一次把多个 .one 文件里的内嵌文件统一导出为 JSON。
> 
> - **工具定位：** onedump.py 是作者尚处 beta 阶段的工具，用于列出 OneNote（.one）文件内嵌的文件。
> - **版本更新：** 0.0.3 版新增 `--jsonoutput` 选项。
> - **用法：** 执行 `onedump.py --jsonoutput *.one` 会生成一份 JSON 文档，包含所有 `*.one` 文件中的全部内嵌文件。
> - **落地还原：** 再用 myjson-filter.py 从该 JSON 写文件到磁盘，例如 `onedump.py --jsonoutput *.one | myjson-filter.py -W hashvir`。
> - **需求来源：** 作者当时需要从一组 .one 文件中提取出所有内嵌文件。

I releasing a new version of my beta tool [onedump.py](https://github.com/DidierStevens/Beta/blob/master/onedump.py) to list files embedded inside OneNote files (.one). I had to extract all the embedded files out of a set of.one files. This update adds option –jsonoutput that helps with this problem.

Running command “onedump.py –jsonoutput \*.one” will create a JSON document containing all embedded files inside all \*.one files. I can then write these files to disk with my [myjson-filter.py](https://github.com/DidierStevens/DidierStevensSuite/blob/master/myjson-filter.py) tool, like this:

onedump.py –jsonoutput \*.one | myjson-filter.py -W hashvir
