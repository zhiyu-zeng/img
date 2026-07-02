---
title: 【看雪】binder-trace：基于内核采集的 Android Binder 调用观测工具
source: https://bbs.kanxue.com/thread-291866.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-03T00:41:50+08:00
trace_id: 7d523f56-dff7-4b27-a68b-24417a076fc4
content_hash: cd78fd7baabf7670f8de605bc6d127098e6ff4f7b6f9dfaf0d7efd2789b890d6
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: binder-trace是一款基于内核模块的Android Binder调用观测工具，旨在为跨进程通信提供持续的、多维度的可视化与分析能力。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39175244-d011-81af-a89f-d640da0cfa5c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> binder-trace是一款基于内核模块的Android Binder调用观测工具，旨在为跨进程通信提供持续的、多维度的可视化与分析能力。
> 
> - **核心实现：** 通过内核模块（`bt-kmod.ko`）直接采集Binder transaction，而非在应用层进行Hook，从底层获取原始数据。
> - **解决痛点：** 旨在收敛UID/PID关联服务发现、异常高频调用检测、request-reply关联及payload分析等常见跨进程调试需求。
> - **功能输出：** 提供WebUI、终端TUI、JSONL流以及供AI助手查询的MCP（Streamable HTTP）等多种接口，支持实时观测与后续分析。
> - **使用前提：** 需要一台已Root的Android设备，并加载与设备内核版本匹配的专用内核模块，同时需通过`adb`推送并配置用户态工具。

项目地址：https://github.com/fuqiuluo/binder-trace

最近整理了一个 Android Binder 调用观测工具 `binder-trace` 。它不是在 Java/Native 层做 hook，而是通过内核模块采集 Binder transaction，在用户态提供 WebUI、TUI、JSONL 和 MCP 查询接口，适合排查系统服务调用、接口频率、payload 和 reply 关联关系。

## 为什么做这个

Android 上很多跨进程行为最后都会落到 Binder。平时看 logcat、Frida hook 都能解决一部分问题，但如果想从 Binder transaction 这一层持续观察系统服务调用，常见需求会变成：

-   某个 UID / PID / TGID 在和哪些 Binder interface 交互；
-   某个服务接口是不是被异常高频调用；
-   一次 request 和 reply 如何对应；
-   payload / 原始事件如何保存下来，后续再分析；
-   不想每次都写临时脚本，希望有一个可视化和终端都能用的工具。

`binder-trace` 的目标就是把这类观察流程收敛成一个工具链：内核侧负责采集，用户态负责控制、解析、存储和展示。

## 功能速览

-   实时采集 Android Binder transaction。
-   WebUI：表格、搜索、方向 / 接口筛选、详情侧栏、payload / 原始 JSON、关联调用、按需分页、可调列宽。
-   TUI：终端内实时事件列表、频率统计、hexdump 和解析详情。
-   JSONL：输出稳定的事件消息，方便接入脚本或保存后分析。
-   支持按 `tgid` 、 `pid` 、 `uid` 缩小采集范围。
-   MCP：提供 Streamable HTTP `/mcp` endpoint，方便 AI assistant 在线查询 Binder trace。

## 准备条件

需要一台已 root 的 Android 设备，并准备：

-   本机 `adb` ；
-   与设备 ABI 匹配的 `binder-trace` 用户态二进制；
-   与设备内核版本匹配的 `bt-kmod.ko` 内核模块。

先确认设备信息：

```bash
adb shell getprop ro.product.cpu.abi
adb shell uname -r
adb shell su -c id
```

把文件推到设备：

```bash
adb shell mkdir -p /data/local/tmp/binder-trace
adb push binder-trace /data/local/tmp/binder-trace/binder-trace
adb push bt-kmod.ko /data/local/tmp/binder-trace/bt-kmod.ko
adb shell chmod 755 /data/local/tmp/binder-trace/binder-trace
```

加载内核模块并确认功能：

```bash
adb shell su -c 'insmod /data/local/tmp/binder-trace/bt-kmod.ko'
adb shell su -c 'lsmod | grep bt_kmod'
adb shell su -c '/data/local/tmp/binder-trace/binder-trace ipc feature'
```

如果设备已经加载过旧模块，可以先卸载：

```bash
adb shell su -c 'rmmod bt_kmod'
```

这里要注意， `rmmod` 会等待已经进入 Binder hook 的线程退出。如果设备上存在长时间阻塞的 Binder read / looper 线程，卸载可能需要等一段时间。

## WebUI 用法

日常查看推荐用 WebUI。先转发端口：

```bash
adb forward tcp:5173 tcp:5173
```

在设备侧启动：

```bash
adb shell
su
cd /data/local/tmp/binder-trace
./binder-trace webui --listen 127.0.0.1:5173
```

电脑浏览器打开：

```
http://127.0.0.1:5173/
```

常见过滤方式：

```bash
./binder-trace webui --uid 1000
./binder-trace webui --tgid 12345
./binder-trace webui --pid 12345
./binder-trace webui --no-enable
./binder-trace webui --android-sdk 35
```

`--no-enable` 用于只读取现有事件流，不主动修改内核捕获配置。WebUI 的过滤和分页在后端执行，浏览器只渲染当前窗口，不会因为前端窗口大小丢掉后端已捕获事件。

## TUI / JSONL

如果只是临时排查，TUI 更适合直接在终端里看：

```bash
adb shell
su
cd /data/local/tmp/binder-trace
./binder-trace tui --rows 1024 --refresh-ms 100
```

也可以按目标缩小范围：

```bash
./binder-trace tui --uid 1000
./binder-trace tui --tgid 12345
./binder-trace tui --pid 12345
./binder-trace tui --no-enable
```

如果要接脚本或后续分析，可以输出 JSONL：

```bash
adb shell
su
cd /data/local/tmp/binder-trace
./binder-trace --output trace.jsonl
```

事件外层是统一消息信封， `object` 表示事件类型， `data` 是对应载荷。这样后面用 `jq` 、Python 或其他工具处理会比较直接。

## MCP 查询

MCP 入口适合让 AI assistant 在线查询 Binder trace。先转发端口：

```bash
adb forward tcp:5174 tcp:5174
```

设备侧启动 MCP 服务：

```bash
adb shell
su
cd /data/local/tmp/binder-trace
./binder-trace mcp --listen 127.0.0.1:5174
```

桌面 MCP client 连接本机转发后的地址即可，核心是 Streamable HTTP，并指向 `/mcp` ：

```json
{
  "mcpServers": {
    "binder-trace": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:5174/mcp"
    }
  }
}
```

默认 MCP 只读取实时事件流，不修改内核捕获配置。如果需要允许 AI 开关 Binder trace，需要显式加 `--allow-control` ，也可以配合 `--enable --uid 1000` 这类参数启动。
