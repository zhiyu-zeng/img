---
title: 【微信】微信小程序AI全自动化渗透工具
source: https://mp.weixin.qq.com/s/CE6Bkg60qCObXz6mJpBpfQ
source_host: mp.weixin.qq.com
clip_date: 2026-08-31T09:39:12+08:00
trace_id: 5fe53a9f-36ed-4bd1-9d1e-782b25dcfd89
content_hash: 7543e2a1354f08dda0149f35b05b4802a306a5b4b2d35b022c5674571d7a6412
status: synced
tags:
  - 微信
  - Frida
  - AI应用
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 一套让微信小程序AI自动化渗透工具更易复用的本地工作流整合包，覆盖偏移提取、Frida注入、调试引擎和MCP服务，并明确了安装、启动顺序与微信更新后的维护步骤。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3cd75244-d011-81bd-9e81-fd284d9983e3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 一套让微信小程序AI自动化渗透工具更易复用的本地工作流整合包，覆盖偏移提取、Frida注入、调试引擎和MCP服务，并明确了安装、启动顺序与微信更新后的维护步骤。
> 
> - **核心组成：** 整合包由三部分组成：偏移提取工具（从本机WMPF运行时提取偏移）、WMPFDebugger（负责Frida注入）、e0e1-wx（负责调试引擎、GUI和MCP Server）。
> - **关键版本约束：** WMPFDebugger 必须锁 frida@16.6.6，否则ESM不兼容；且frida与Node.js版本强绑定——Node.js v20可用，v22+会报NODE_MODULE_VERSION错误，需降级到20 LTS或用nvm。
> - **启动顺序：** 必须严格按序：先启动WMPFDebugger（Frida注入），再启动e0e1-wx引擎（debug server 9421 + proxy server 62000），然后打开微信小程序（会自动连接debug server），最后启动GUI（MCP Server 49999）并注册到Claude Code；顺序反了小程序不会自动连接。
> - **微信更新后：** 运行 auto-extract.bat 或手动提取新版本偏移（如 python extract_wmpf_offsets.py --version 新版本号）后重新启动。
> - **代码改动要点：** WMPFDebugger 改为Frida-only模式，不启动debug/proxy server，由e0e1-wx接管，并加入轮询等待（2秒重试，最多60秒）、异常保护和PPID保底逻辑；e0e1-wx 的 engine.start() 跳过Frida注入，只启动debug/proxy server。

**HACK之道** *2026年8月31日 09:20*

### 工具介绍

这是一个面向已授权调试场景的本地工作流整合包，把下面三部分串成了一套更容易复用的流程：

-   偏移提取工具/：从本机最新 WMPF 运行时提取偏移
-   WMPFDebugger/：负责 Frida 注入
-   e0e1-wx/：负责调试引擎、GUI 和 MCP Server

这次整理的目标很明确：让项目不只“我自己能跑”，而是“别人拿到仓库后也更容易跑起来、排障、更新和继续维护”。

`QUICKSTART.md` 适合第一次上手时照着跑， `CHANGELOG.md` 记录版本变化。

### 安装

### 1\. 偏移提取工具

```bash
cd 偏移提取工具
pip install -r requirements.txt
```

验证：

```apache
python extract_wmpf_offsets.py --version 25297
```

### 2\. WMPFDebugger

```apache
cd WMPFDebugger
npm install
npm install frida@16.6.6    # 必须锁 v16.6.6，否则 ESM 不兼容！
npm install -g ts-node       # 全局安装 ts-node
```

> **重要：** frida 的二进制文件与 Node.js 版本强绑定。  
> 如果你使用 Node.js v20，frida@16.6.6 会自动下载对应的二进制。  
> 如果你使用 Node.js v22+，frida 会报 `NODE_MODULE_VERSION` 错误。  
> 解决方案：降级到 Node.js 20 LTS，或使用 `nvm` 管理版本。

验证：

```nginx
node -e "const f = require('frida'); console.log('frida OK:', typeof f.getLocalDevice)"
# 输出: frida OK: function
```

### 3\. e0e1-wx

```bash
cd e0e1-wx
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 启动流程（关键！顺序不能错）

### 完整启动顺序

```bash
第 1 步：启动 WMPFDebugger（Frida 注入）
         双击 WMPFDebugger/一键启动.bat         
         或: cd WMPFDebugger && node -r ts-node/register src/index.ts         
         等待出现: [frida] script loaded, WMPF version: xxx

第 2 步：启动 e0e1-wx 引擎（debug server + proxy server）
         打开新终端，cd e0e1-wx         
         运行: python start_engine.py         
         等待出现: [OK] debug server (9421) + proxy server (62000) started

第 3 步：打开微信小程序
         在微信中点击打开一个小程序（不是拖拽）         
         小程序会自动连接到 debug server (9421)

第 4 步：启动 e0e1-wx GUI（MCP Server）
         在 e0e1-wx 目录运行: python main.py         
         MCP Server 在 49999 端口自动启动

第 5 步：连接 Claude Code
         注册 MCP: claude mcp add wxcdp --transport http http://127.0.0.1:49999/mcp         
         开始渗透测试
```

### 重要： 如果顺序搞反了（先开小程序再启动引擎），小程序不会自动连接 debug server。此时需要关掉小程序重新打开，或者重启微信。

### 微信更新后的操作

```bash
第 1 步：双击 WMPFDebugger/auto-extract.bat
         （自动检测最新 flue.dll，提取偏移，写入 config 目录）         
         或手动:         
         python 偏移提取工具/extract_wmpf_offsets.py --version 新版本号

第 2 步：按上面的启动流程重新启动
```

### 端口

| 端口  | 用途  | 由谁启动 | 必须先启动 |
| --- | --- | --- | --- |
| 9421 | debug server（小程序连接） | `start_engine.py` | WMPFDebugger |
| 62000 | CDP 代理（DevTools 连接） | `start_engine.py` | WMPFDebugger |
| 49999 | MCP Server（AI 工具链） | `python main.py` | 引擎 + 小程序 |

### 修改说明

### WMPFDebugger 修改内容

| 文件  | 修改  |
| --- | --- |
| `src/index.ts` | **Frida-only 模式**<br><br>— 不启动 debug/proxy server，由 e0e1-wx 接管 |
| `src/index.ts` | **轮询等待**<br><br>— frida_server 每 2 秒重试，最多等 60 秒 |
| `src/index.ts` | **异常保护**<br><br>—.catch() 防止 Frida 注入失败导致进程退出 |
| `src/index.ts` | **保底逻辑**<br><br>— PPID 查找失败时用第一个 WeChatAppEx 进程 |
| 一键启动.bat | \[新增\] 启动脚本，带 Node.js 版本检查 |

### e0e1-wx 修改内容

| 文件  | 修改  |
| --- | --- |
| `package/devtools/engine.py` | `start()`<br><br>跳过 Frida 注入，只启动 debug/proxy server |
| `package/devtools/engine.py` | `_start_frida_sync()`<br><br>返回 `(None, None)` |
| `start_engine.py` | \[新增\] 独立启动引擎脚本（不依赖 GUI） |

### 项目地址

https://github.com/hello-xiaoniao/WMP-pentest-automation
