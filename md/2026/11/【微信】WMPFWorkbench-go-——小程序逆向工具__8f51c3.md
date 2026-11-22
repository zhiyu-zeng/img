---
title: 【微信】WMPFWorkbench-go  ——小程序逆向工具
source: https://mp.weixin.qq.com/s/-jhYpP-mVHSjUgUcNFnxMg
source_host: mp.weixin.qq.com
clip_date: 2026-11-22T16:35:22+08:00
trace_id: df371cbf-129e-4026-8987-0fe961913482
content_hash: d714f77a4c95939e60029e7c2c7e62471a81a7e16470dcb8dccc652df093fab1
status: synced
tags:
  - 微信
  - 小程序逆向
  - AI辅助逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: WMPFWorkbench-go 把 WMPF 运行时宿主化，让小程序脱离微信客户端完成扫码登录、独立启动、CDP 调试与 wxapkg 源码还原，并以 16 个 MCP 工具交给 AI Agent 端到端驱动。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 42075244-d011-810e-8391-cf1037a40488
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> WMPFWorkbench-go 把 WMPF 运行时宿主化，让小程序脱离微信客户端完成扫码登录、独立启动、CDP 调试与 wxapkg 源码还原，并以 16 个 MCP 工具交给 AI Agent 端到端驱动。
> 
> - **运行时指纹：** `hostruntime/validate.go` 锁定 `flue.dll`、`WeChatAppEx.exe` 等 5 个文件的 SHA-256；只有应用宝 PC 的 `WmpfRuntime\5.10.7300.414\` 能 5/5 精确匹配，微信桌面端与企业微信的版本都不匹配。该目录约 386 MB，缺少任何图形栈或资源包，renderer 都无法启动。
> - **自包含构建：** `native\build-release.ps1` 依次编译 C++ 宿主、Frida 观测 worker、wxapkg 工具，再将产物拷入 `native/internal/bundle/bin/` 作为 `go:embed` 输入，最终产出单个 `wmpf-gui.exe`；GUI 与 MCP 服务共用这个可执行文件，通过 `-mcp stdio` 或 `-mcp http` 切换传输方式。
> - **工具精简：** MCP 工具从 29 项收敛为 16 项，按搜索、账号、运行时、调试、源码五个域组织：`index` 合并了原先四个索引入口，`runtime_status` 取代 `runtime_sessions`、`host_status`、`list_running`，`cdp_scripts` 合并了 `cdp_get_script_source`。
> - **异步还原：** `decrypt_wxapkg` 通过 `action=start` 立即返回 `task_id`（约 0.05 秒），实际执行在后台线程，不会占用 MCP 会话；随后用 `status`、`list`、`cancel` 轮询或终止，状态同时保存到内存和 `data/desktop/decrypt/<task_id>/status.json`。另一条路径是用 `cdp_events` 取 `scriptId` 再分页读取运行时明文。
> - **根本边界：** 只有被应用宝收录的小程序才能启动；`launch` 会先经 `pcyyb_get_app_detail` 校验 appid，通过后再由服务端签发 `f27` 信封（`iv`/`data`/`timestamp`/`authtag`），本地只做签名请求和 protobuf 封装，不生成也无法破解密钥。`Page.getFrameTree` 因已确认的崩溃问题被禁用；当前 WMPF 也不回放 `Debugger.scriptParsed`，所以脚本清单通常为空。

**一个人挺好 wa** *2026年11月18日 22:22*

## 项目地址

https://github.com/yiyihuohuo/WMPFWorkbench-go

## 项目概述

WMPFWorkbench-go 是一个面向小程序安全研究与自动化测试的一体化工作台。它将 WMPF（WeChat Mini Program Framework）运行时自产宿主化，使小程序无需依赖微信桌面客户端即可完成扫码登录、搜索、独立启动、运行时调试与源码还原，并将全部核心能力开放为 16 个 MCP 工具，供 AI Agent 直接调用。

项目的核心主张是：小程序逆向与调试不必绑定在微信客户端中手工操作，可以完全脱离微信，并由 Agent 驱动实现端到端的自动化。需要明确的是，这是一个非官方的个人学习与研究作品，与腾讯、微信、应用宝无任何关联。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e6fdc913edf43533.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96b88206c056b366.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/672368bb8ea4dc94.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b029905a528730ae.png)

## 核心能力

工作台将分散的小程序分析流程整合为一条链路，覆盖从登录到源码还原的完整路径：

| 能力域 | 说明  |
| --- | --- |
| **扫码登录** | 微信扫码登录，账号凭据仅存储于本机，界面仅显示脱敏标识 |
| **搜索** | 支持在线（应用宝）与本地索引两种来源，离线也可检索 |
| **独立启动** | 自带宿主运行时，小程序脱离微信客户端独立打开 |
| **运行时调试** | 基于 CDP（Chrome DevTools Protocol）的页面、请求、异常求值 |
| **代码还原** | 离线解密 `wxapkg` 包，还原工程目录；亦可通过 CDP 读取运行时明文 |
| **Agent 接入** | 全部能力暴露为 MCP 工具，支持 stdio 与 HTTP 两种传输 |

这六项能力串接在同一条流水线上，使用者从扫码登录到看到还原后的代码，全程无需切换程序。

## 系统架构

### 整体分层

text

```swift
┌─────────────────────────────────────────────┐│          wmpf-gui.exe（单可执行文件）          ││   桌面 GUI  ───  内嵌 MCP 服务 (stdio/HTTP)   │├─────────────────────────────────────────────┤│  Go 服务层                                    ││   native/internal/launch    f27 信封 / 票据     ││   native/internal/hostruntime 会话生命周期      ││   native/services/login    登录协议 / HTTP/DB  │├─────────────────────────────────────────────┤│  Native 宿主层（C++）                          ││   hostcpp/                 自产宿主            ││   native/worker            Frida 观测 worker   │├─────────────────────────────────────────────┤│  WMPF 运行时 5.10.7300.414（外部依赖）         ││   flue.dll / WeChatAppEx.exe / 图形栈 / 资源包  │└─────────────────────────────────────────────┘
```

GUI 与 MCP 服务共用同一个 `wmpf-gui.exe` ，通过 `-mcp stdio` 或 `-mcp http` 切换 MCP 传输模式。 `native/internal/bundle` 通过 `go:embed` 将 C++ 宿主、Frida worker、wxapkg 工具等 helper 二进制内嵌进可执行文件，最终产出不依赖外部 `bin/` 目录的自包含程序。

### 关键设计决策

**为什么必须使用应用宝 PC 的 WMPF 运行时？** WMPF 引擎以“微信”命名，但作为通用组件被打包进多个腾讯产品（微信桌面端、企业微信、应用宝 PC），且各产品携带的版本不同。项目的 `hostruntime/validate.go` 锁定了 5 个关键文件的 SHA-256（ `flue.dll` 、 `wmpf_host_export_x64.dll` 、 `libamssdk.dll` 、 `pcyyb_sdk_dll.dll` 、 `WeChatAppEx.exe` ），实测只有应用宝 PC 的 `WmpfRuntime\5.10.7300.414\` 能 5/5 精确匹配，微信桌面端与企业微信携带的版本均不匹配。文件名带 `WeChat` 是引擎产品命名，与“从应用宝获取”并不矛盾。

**为什么需要整目录而非若干 DLL？** `flue.dll` （约 201 MB）是 Chromium 级浏览器引擎，启动时会拉起同目录的 `WeChatAppEx.exe` ，并依赖图形栈（ `libEGL` / `libGLESv2` / `vk_swiftshader` / `dxcompiler` ）、资源包（ `wmpf_resources.pak` 等）和 `icudtl.dat` 。 `validate.go` 只校验 5 个文件作为版本指纹，但运行时需要完整环境；缺任何一项，renderer 无法启动或 CDP 无法连接。

## 快速开始

### 环境要求

| 依赖  | 说明  |
| --- | --- |
| **Windows 10/11 x64** | 仅支持 Windows |
| **WMPF 运行时 5.10.7300.414** | 必需，但 **不随仓库或 Release 分发**，须从应用宝 PC 安装目录获取 |
| **Go 1.23+** | 构建登录服务与 MCP/GUI |
| **Visual Studio 2022 x64 C++ 工具链** | 构建 C++ 宿主与 Frida 观测 worker（vswhere 自动查找） |
| **WebView2 Runtime** | GUI 使用，系统通常已自带 |

### 获取 WMPF 运行时

1.  安装应用宝 PC 版。
    
2.  进入安装目录，定位到 `WmpfRuntime\5.10.7300.414\` （整目录，含 `host\` 与 `runtime\` ，约 386 MB）。
    
3.  将该目录整体拷贝到工作台根目录下的 `runtime\5.10.7300.414\` 。
    

`.gitignore` 已排除 `runtime/` 、 `data/` 、 `dist/` 、 `build/` ，这些运行态文件不会被提交。没有该运行时，登录、搜索、源码还原仍可用，但 **独立启动与调试无法工作**。

### 4.3 构建

powershell

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File native\build-release.ps1
```

构建脚本依次完成：编译 C++ 宿主 → 编译 Frida 观测 worker → 编译 wxapkg 工具 → 将产物拷入 `native/internal/bundle/bin/` （作为 `go:embed` 输入）→ 产出自包含的 `wmpf-gui.exe` 。 `bundle/bin` 下的二进制不入库，由构建脚本动态生成。

### 运行

构建完成后运行 `wmpf-gui.exe` 。GUI 提供运行概览、扫码与账号、搜索与打开、MCP 工具面板等功能界面。MCP 服务可通过 `-mcp stdio` 或 `-mcp http` 参数启用。

## MCP 工具参考

MCP 工具从早期 29 项精简为 16 项公开工具，按“搜索 / 账号 / 运行时 / 调试 / 源码”五个域组织。

### 搜索与索引

| 工具  | 职责  | 关键参数 |
| --- | --- | --- |
| `search_mini_programs` | 搜索小程序，支持在线与本地 | `source=online/local` |
| `index` | 索引操作 | `action=stats/browse/rebuild/packages` |
| `get_app_detail` | 指定 AppID 的包与本地材料信息 | `appid` |

`search_mini_programs` 合并了原先的在线搜索与 `search_local_mini_programs` ； `index` 整合了 `index_stats` 、 `browse_indexed` 、 `rebuild_index` 、 `list_packages` 四个旧入口。

### 账号

| 工具  | 职责  |
| --- | --- |
| `login_status` | 当前选中账号的公开状态 |

### 运行时

| 工具  | 职责  | 关键参数 |
| --- | --- | --- |
| `launch` | 异步独立启动，返回会话 ID | 省略 `hide_window` 时继承 GUI 保存值；显式 `true` / `false` 可覆盖 |
| `close_runtime` | 关闭指定自产会话并清理 | `session_id` |
| `runtime_status` | 会话列表； `include_processes=true` 追加进程诊断 | `include_processes` |

`runtime_status` 取代了旧的 `runtime_sessions` 、 `host_status` 、 `list_running` 三个冗余入口。

### CDP 调试

| 工具  | 职责  | 说明  |
| --- | --- | --- |
| `cdp_local_targets` | 发现调试目标 | —   |
| `cdp_connect` | 连接并缓存 CDP 会话 | —   |
| `cdp_evaluate` | 常用表达式求值 | 减少 Agent 手动拼接协议参数 |
| `cdp_send` | 扩展 CDP 操作 | 如 `Debugger.enable` ；原 `cdp_enable` 改为对应域的 `*.enable` |
| `cdp_scripts` | 脚本清单 / 分页读取源码 | 当前 WMPF 未回放 `Debugger.scriptParsed` ，清单通常为空；指定 `script_id` 时按 `offset` / `max_bytes` 分页读取 |
| `cdp_events` | 按方法过滤、游标增量读取 CDP 事件 | 覆盖 console、异常、网络等；读取不消费缓存 |

`cdp_scripts` 合并了原先的 `cdp_get_script_source` 。 `Page.getFrameTree` 因当前引擎已确认的崩溃问题被明确禁用。

### 源码还原

| 工具  | 职责  | 关键参数 |
| --- | --- | --- |
| `decrypt_wxapkg` | 离线解密本机 V1MMWX 包并还原工程目录 | `action=start/status/list/cancel` |
| `extract_api_surface` | 指定小程序的静态接口候选 | `appid` |
| `netlog` | 运行期网络日志分析 | `action=discover/analyze` |

`decrypt_wxapkg` 是异步任务： `action=start` 立即返回 `task_id` （实测约 0.05 秒），CLI 在后台线程执行，不占用 MCP 会话；随后用 `action=status` （省略 `task_id` 时取最近任务）轮询进度， `action=list` 查看最近任务， `action=cancel` 终止。状态同时写入内存和 `data/desktop/decrypt/<task_id>/status.json` ，stdio 多进程与 HTTP 单进程模式均可按 `task_id` 查询。

源码还原有两条路径： `decrypt_wxapkg` 离线还原工程目录；或经 `cdp_events` 取 `scriptId` 后用 `cdp_scripts` 分页读取运行时明文。

## 配置

仓库 `config/` 目录下提供 `rule.yaml` 作为配置入口。运行时数据与构建产物分别落在 `data/` 、 `dist/` 、 `build/` 、 `out/` 等被 `.gitignore` 排除的目录中，不纳入版本控制。MCP 服务的传输模式通过启动参数 `-mcp stdio` 或 `-mcp http` 指定，无需在配置文件中声明。

## 能力边界与已知限制

### 仅面向应用宝渠道收录的小程序

这是项目最根本的边界。搜索走应用宝在线接口，启动前必须经应用宝服务端详情校验并签发 `f27` 启动信封。只有 **应用宝收录的小程序** 才能被搜索到并独立启动；仅存在于微信本地缓存、未被应用宝收录的小程序，即使本机已有 `wxapkg` 包，也会在启动前被拒绝。

`launch` 的校验链路为：先调用 `pcyyb_get_app_detail` 校验 appid，若 `data.apps` 中找不到该 appid，直接返回“服务端详情中没有请求的小程序”，worker 根本不会启动；校验通过后，再调用 `pcyyb_encrypt_wx_mini_program_launch_param` 由服务端签发 `f27` 信封（ `iv` / `data` / `timestamp` / `authtag` ）；本地只做签名请求与 protobuf 封装，不生成也不破解信封内容。相关代码位于 `native/internal/launch/inputs.go` 的 `:144` （详情校验）、`:165` （信封申请）、`:54` （ `BuildConfig` 封装）。 `f27` 由服务端签发，本项目不包含也无法生成服务端密钥。

### 其他已知限制

-   部分小程序的 worker、插件与媒体能力以实际兼容情况为准；还原产物是运行时结果，不等同于官方工程。
    
-   当前运行环境由已初始化环境整理，不能据此宣称全新环境初始化、全天自然到期保活、任意小程序 / AppService / worker / 插件 / 媒体 / 跨版本均通过。
