---
title: frida.re
source: https://frida.re/news/2026/11/19/frida-17-27-2-released/
source_host: frida.re
clip_date: 2026-11-19T20:41:18+08:00
trace_id: 37b7bae6-0a7c-4e16-93cc-3dd8253f6d3c
content_hash: af51782e58254c0ef581660234d64ebc74579a553f42f22385fc6ce938b63745
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
notion_page_id: 41d75244-d011-81e8-bd3c-fefa4860690a
ioc: null
---

## Frida 17.27.2 Released

release

A quick one with a fix for decoded patterns, and two for the Swift bindings.

## Patterns

When decoding memory against a pattern, a field whose size can’t be worked out, because something inside it runs past the data, had none of its attributes applied. That is right for the ones that need the field’s value, but it also dropped the ones that only say how to present it: *inline*, *hidden*, *sealed*, *name*, *comment* and *color*. A view would thus draw a row for a member the author asked to have folded into its parent. Those are now kept.

## Swift

A getter for a borrowed object made a new wrapper on every access. For an object that emits signals, that is a new event stream each time, and one that ends as soon as the wrapper goes away: taking *device.bus.events* and then calling *device.bus.attach()* never saw a message. Such a child is now stored once, as the hand-written bindings used to do for *Device.bus*.

On Linux, a JSON number that happened to be 0 or 1 went out as *false* or *true* on its way through our marshaling. Foundation there casts such an *NSNumber* to *Bool* just as Darwin does, and we told the two apart by a CoreFoundation type that Linux does not show. A boolean is now told by its class, which is the same on both.

Enjoy!

### Changelog

-   patterns: Keep the presentation attributes of a field cut short by the end of the data.
-   swift: Keep one wrapper for a child that emits signals, fixing lost events on e.g. *device.bus*.
-   swift: Tell a JSON number from a boolean on Linux.
