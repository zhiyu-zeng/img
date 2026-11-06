---
title: frida.re
source: https://frida.re/news/2026/11/06/frida-17-26-1-released/
source_host: frida.re
clip_date: 2026-11-06T21:47:45+08:00
trace_id: 78aa5ae2-e6ca-49f2-b225-e5f130e1ad4e
content_hash: c6840946cbdadcc864b34186e092eca4c64fb2458e3626f5f571a1e730f3817b
status: synced
tags: []
series: null
feed_source: Frida Releases
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-81a8-9f95-c71e24f089a2
ioc: null
---

## Frida 17.26.1 Released

release

A quick one with a single QuickJS fix from [@mrmacete](https://twitter.com/bezjaje).

Since the rebase onto current QuickJS, the runtime marks “no exception pending” with an uninitialized value rather than *null*. Three spots in our own patches still reset the pending exception to *null* after temporarily stashing it: when suspending the runtime so another thread can use it, while running *Error.prepareStackTrace()*, and while calling the hook that provides lazily created globals. Current QuickJS reads that *null* as an exception still pending, with *null* as its value. Francesco found it and fixed all three. Thanks!

Enjoy!

### Changelog

-   quickjs: Use the uninitialized value as the no-exception sentinel when suspending the runtime, preparing stack traces, and resolving globals through the access hook. Thanks [@mrmacete](https://twitter.com/bezjaje)!
