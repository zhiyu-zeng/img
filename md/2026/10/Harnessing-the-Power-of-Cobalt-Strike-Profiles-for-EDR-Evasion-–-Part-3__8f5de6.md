---
title: Harnessing the Power of Cobalt Strike Profiles for EDR Evasion – Part 3
source: https://whiteknightlabs.com/2026/06/15/harnessing-the-power-of-cobalt-strike-profiles-for-edr-evasion-part-3/
source_host: whiteknightlabs.com
clip_date: 2026-10-08T10:15:11+08:00
trace_id: 12262d36-df1a-4934-a732-d73b3604abb9
content_hash: e90245a92c0720837fb8828b41cefec03d13e17ea8455d29e928c449850d1718
status: synced
tags:
  - 风控对抗
  - 恶意样本
series: Harnessing the Power of Cobalt Strike Profiles for EDR Evasion
feed_source: White Knight Labs·UEFI/红队
ai_summary: Cobalt Strike 4.13 通过 Drip Loading、checkin_delay 与新版 Sleep Mask 等新配置强化 Malleable C2 profile，可在不触发主流 EDR 与 YARA 规则的情况下完成反射加载与进程注入。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3f375244-d011-815f-9eeb-ca2186308fd9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Cobalt Strike 4.13 通过 Drip Loading、checkin_delay 与新版 Sleep Mask 等新配置强化 Malleable C2 profile，可在不触发主流 EDR 与 YARA 规则的情况下完成反射加载与进程注入。
> 
> - **Drip Loading：** 用多次小额内存分配替代单次大块分配，配合 `dripload_delay` 逐块延迟，破坏 EDR 依赖的事件关联；仅 `VirtualAlloc` 兼容，其他分配器会导致 profile 校验失败。
> - **推荐组合：** Drip Loading 可叠加间接系统调用（`rdll_use_syscalls "true"`、`syscall_method "indirect"`），但首选搭配 4.13 默认 Sleep Mask——它为所有 BeaconGate 代理调用（含 VirtualAlloc）做返回地址欺骗。
> - **Check-in 延迟：** `set checkin_delay "5000"` 推迟 Beacon 首次回连，干扰反射加载与元数据交换的时序启发式；副作用是客户端 GUI 中 Beacon 上线变慢。
> - **弃用指令：** `rdll_loader` 与 `name` 在 4.13 会触发 C2Lint 报错，需删除——Prepend Loader 已默认、Stomp 架构整体移除，不再有导出函数。
> - **实测结果：** 对六款主流 EDR 无检出，近期主流 YARA 规则亦无匹配；内存中 payload 散布于 64 KB 区域，权限在 RW/RX 间反复切换。

This blog post is a continuation of the previous entry “ [Harnessing the Power of Cobalt Strike Profiles for EDR Evasion](https://whiteknightlabs.com/2023/05/23/unleashing-the-unseen-harnessing-the-power-of-cobalt-strike-profiles-for-edr-evasion/) “ and its follow-up, [Part 2](https://whiteknightlabs.com/2025/05/19/harnessing-the-power-of-cobalt-strike-profiles-for-edr-evasion-part-2/). Following the release of Cobalt Strike 4.13 by Fortra, we immediately began exploring the newly introduced capabilities and evaluating their impact on operational security. Through testing and experimentation, we developed an updated set of Malleable C2 profiles designed to further strengthen detection evasion techniques. Every feature introduced in this blog is already implemented in the CS 4.13 malleable profiles within our [GitHub repository](https://github.com/WKL-Sec/Malleable-CS-Profiles).

## Drip Loading

Although this capability was introduced in Cobalt Strike 4.12, it remains highly relevant due to its potential impact on detection evasion and therefore deserves to be mentioned in this post.

One approach EDRs can take to detect process injections is through correlating different events for common injection primitives.

Instead of allocating a large chunk of memory as most shellcode loaders do, the Drip Loading technique allocates multiple smaller chunks of memory until the entire payload is reserved.

Additionally, the `dripload_delay` and `rdll_dripload_delay`, are extremely useful options, which introduces delay between each allocation chunk. This further enhances the evasion capability by breaking event correlation that EDRs usually rely on for identifying common injection primitives.

This feature is available for the reflective loader options and can be configured via the new Malleable C2 [settings](https://hstechdocs.helpsystems.com/manuals/cobaltstrike/current/userguide/content/topics/malleable-c2-extend_pe-memory-indicators.htm) as seen below:

```cpp
stage {
      set allocator "VirtualAlloc"; # The only compatible allocator with DripLoading
      set rdll_use_driploading “true”; 
      set rdll_dripload_delay “100”;   //adds a further delay ifdesired
}
```

Similarly, drip loading can be configured for process injection via the new Malleable C2 [options](https://hstechdocs.helpsystems.com/manuals/cobaltstrike/current/userguide/content/topics/malleable-c2-extend_process-injection.htm) for the `process-inject` block as shown below:

```python
process-inject {
        set allocator "VirtualAlloc"; # The only compatible allocator with DripLoading
        set use_driploading "true";
        set dripload_delay "100";    //adds a further delay if desired
}
```

The only compatible allocation method for Drip Loading is `VirtualAlloc`, every other allocation method will result in a fail during profile check:

```
[!] .stage.rdll_use_driploading and .stage.rdll_dripload_delay are ignored when .stage.allocator is not VirtualAlloc
```

Since we have now switched to `VirtualAlloc` for the allocation primitive, we can enhance it by using indirect syscalls, making it the new final configuration set:

```python
stage {
      set allocator "VirtualAlloc"; # The only compatible allocator with DripLoading
      set rdll_use_driploading “true”; 
      set rdll_dripload_delay “200”;
      set rdll_use_syscalls "true"; # NtVirtualAlloc instead of VirtualAlloc
      set syscall_method "indirect";
}

process-inject {
        set allocator "VirtualAlloc"; # The only compatible allocator with DripLoading
        set use_driploading "true";
        set dripload_delay "100";    //adds a further delay if desired
}
```

Through memory analysis, we have observed that the payload is spread across 64 KB memory regions, whose permissions are constantly changed to RW and RX through each beacon iteration cycle:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d852d450182dd941.png)

Memory regions showing committed pages where beacon is stored

**OPSEC Note:** Although this blog demonstrates Drip Loading using the `VirtualAlloc` allocation primitive and indirect syscalls for simplicity and ease of setup, our preferred configuration is to pair Drip Loading with the default Cobalt Strike Sleep Mask (updated in version 4.13).

The latest Sleep Mask implementation now performs return address spoofing for all proxied BeaconGate calls, including `VirtualAlloc`. As a result, it effectively mitigates the primary drawback typically associated with using `VirtualAlloc`, while retaining the operational benefits of Drip Loading. In our assessment, this combination represents the most effective Drip Loading configuration currently available.

While this setup requires some additional configuration, the process is relatively straightforward. We previously covered [BeaconGate](https://hstechdocs.helpsystems.com/manuals/cobaltstrike/current/userguide/content/topics/blog_cobalt-410-beacongate.htm) and its initial setup in detail in [Part 2](https://whiteknightlabs.com/2025/05/19/harnessing-the-power-of-cobalt-strike-profiles-for-edr-evasion-part-2/) of this blog series, which can be used as a starting point for implementing this configuration.

## Check-in Delay

It can be a good idea to introduce delays where possible, as this breaks detections that rely on event timing correlation heuristics. Beacon now supports the `checkin_delay` Malleable C2 option. This will delay Beacon’s initial check-in to break event correlation detection heuristics on reflective loading and the immediate metadata exchange.

```
set checkin_delay "5000";
```

> `checkin_delay` will result in a delay of the beacon showing up in the client GUI since the metadata is delayed as well.

## Deprecated Features

After implementing the new features into our profile, we immediately encountered validation errors during the C2Lint process.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66bdf9983286d9d7.png)

C2Lint errors on the profile

The reported issues were related to the following directives within the `stage` block:

```
stage { 
  set rdll_loader "PrependLoader";
  set name "ActivationManager.dll";
}
```

The warning regarding `rdll_loader` was expected. As previously announced in Fortra’s Cobalt Strike 4.11 [release blog](https://www.cobaltstrike.com/blog/cobalt-strike-411-shh-beacon-is-sleeping), Beacon now utilizes the Prepend Loader by default. With the Stomp Loader scheduled for deprecation, there is no longer a need to explicitly select between the two loader implementations. Simply removing the `rdll_loader` directive was sufficient to resolve that validation error.

The name directive also triggered a linting error. Removing this option makes the profile valid again; the reason is that the “name” refers to the name of the exported function used by the Beacon to call into a stomped reflective loader. All the stomp architecture was removed (i.e., there’s no longer an exported function), so the option is irrelevant in 4.13.

## Detection Testing Results

White Knight Labs evaluated the profile against six of the most popular Endpoint Detection and Response (EDR) solutions. Testing was conducted using the finalized Malleable C2 profile in combination with an open-source shellcode loader. Across all tested EDR products, no detections were observed.

In addition, White Knight Labs scanned the in-memory process using a collection of recent and widely adopted YARA rules. None of the rules produced a match, indicating that the generated memory artifacts did not trigger the tested signatures.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b558d8d632527af7.png)

YARA rule scan against beacon process

## Conclusion

With the release of Cobalt Strike 4.13, several subtle but impactful changes have been introduced that further enhance the flexibility and stealth of Beacon operations. Throughout this post, we explored how modern features such as Drip Loading, the updated Sleep Mask implementation, and BeaconGate integration can be combined to reduce behavioral indicators against event-correlation and memory-based detection techniques. All of the improvements discussed in this article have been already added in Cobalt Strike 4.13 profiles, which are available in our GitHub repository for further testing and research.
