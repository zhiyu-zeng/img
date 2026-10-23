---
title: 【先知】Mercury 框架未授权远程代码执行漏洞 (RCE) 深度剖析
source: https://xz.aliyun.com/news/93020
source_host: xz.aliyun.com
clip_date: 2026-10-23T17:42:01+08:00
trace_id: 3ec3bf10-5f65-4af5-94e8-1c8b2eba1559
content_hash: b74987289928902a38c7f0fab97e34114615889b5584070971bdf9efdc41c5b2
status: synced
tags:
  - 先知
  - 漏洞分析
  - 安全工具
series: null
feed_source: 先知安全技术社区
ai_summary: Mercury ≤3.2.4 默认未启用 Token 时，/api/kernels 无鉴权，攻击者可通过 WebSocket 向 Jupyter 内核发送 execute_request，未授权执行任意 Python 代码和系统命令。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 40275244-d011-8166-82c6-f4bce6bd984b
ioc:
  cves:
    - CVE-2026-111058
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Mercury ≤3.2.4 默认未启用 Token 时，/api/kernels 无鉴权，攻击者可通过 WebSocket 向 Jupyter 内核发送 execute_request，未授权执行任意 Python 代码和系统命令。
> 
> - **漏洞根因：** Mercury 默认启动且未强制配置鉴权 Token 时，后端 `/api/kernels` 接口没有任何身份验证，属于访问控制缺陷（CVE-2026-111058）。
> - **利用链路：** 无凭证 `POST /api/kernels`（`{"name":"python3"}`）取得 kernel_id → WebSocket 连接 `/api/kernels/<id>/channels` → 发送 `execute_request`，代码如 `__import__('os').popen('id').read()`。
> - **放大条件：** 启动时终端告警“Kernel is running over TCP without encryption”，内核通信明文，流量易被嗅探劫持；Web 面板本身也无需登录即可访问。
> - **危害验证：** 自动化 PoC 串起“取内核—建连—发命令—回显”，实测可执行 `whoami && uname -a`、读取 `/etc/passwd`，获取用户组与内核对情报，为提权、横向移动铺路。
> - **修复要点：** 生产环境强制 `--token` 鉴权、禁止 8888 端口直接暴露公网（防火墙或 Nginx 反代限制来源 IP）、升级至已修复版本。

## 1.漏洞概述

Mercury 是一个基于 Python 的框架，主要用于将 Jupyter Notebook 快速转换为交互式的 Web 应用程序。在早期的版本中，其内核管理接口存在严重的访问控制缺陷。

-   漏洞编号：CVE-2026-111058
-   影响版本：Mercury 3.2.4 及以下版本
-   漏洞成因：当 Mercury 以默认配置启动，且未强制配置鉴权 Token 时，后端的 /api/kernels 接口没有任何身份验证机制。未授权的远程攻击者可以通过该接口创建 Jupyter 内核，并利用 WebSocket 协议向内核发送 execute_request 消息，从而在目标服务器上执行任意 Python 代码及系统命令，导致服务器完全失陷。

## 2\. 环境搭建与版本确认

为了确保复现环境的安全性，实验在 Kali Linux 的独立 Python 虚拟环境中进行。

首先，创建并激活虚拟环境，安装受影响的目标版本：

```bash
python3 -m venv mercury_env
source mercury_env/bin/activate
pip install mercury==3.2.4
```

安装完成后，验证 Python 版本及 Mercury 的详细信息，确认版本号为 3.2.4，且安装在虚拟环境目录下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8e25ad6f1432734e.jpg)

## 3\. 漏洞复现过程

#### (1). 启动脆弱服务

创建一个空的测试笔记本文件并启动 Mercury 服务。这里我们不需要加任何特殊的参数，默认启动即可：

```bash
echo '{"cells": [], "metadata": {}, "nbformat": 4, "nbformat_minor": 5}' > test.ipynb
mercury test.ipynb
```

服务成功启动在 8888 端口。值得注意的是，终端抛出警告提示 Kernel is running over TCP without encryption（内核通信未加密），这表明通信流量极易被嗅探劫持，是漏洞利用的客观条件之一。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cdd631db8d057b6d.jpg)  

#### (2). 未授权访问验证

在浏览器中直接访问  
[http://127.0.0.1:8888](http://127.0.0.1:8888/)  
，无需任何登录凭证即可正常进入应用面板，证明目标系统处于完全无鉴权暴露状态。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c3e915b00e21d74d.jpg)

#### (3). 未授权创建 Kernel

由于前端页面无法直接触发命令，我们直接向底层 API 发起请求。通过构造 POST 请求访问 /api/kernels 接口，且不携带任何 Token 或 Cookie，成功返回了包含 kernel_id 的 JSON 数据。

```bash
curl -X POST 
                  http://127.0.0.1:8888/api/kernels
                   -H "Content-Type: application/json" -d '{"name": "python3"}'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fae7a2a82e7e1ad7.jpg)

#### (4). 构造 WebSocket 实现命令执行 (RCE)

获取到 Kernel ID 后，直接通过 HTTP 路由无法执行命令，需按照 Jupyter 协议，通过 WebSocket 连接 /api/kernels//channels 端点。

编写 Python 脚本连接 WebSocket 并发送带有 execute_request 类型的 JSON Payload，命令执行通过 os.popen('id') 进行测试：

```python
# 核心 Payload 示例
"code": "__import__('os').popen('id').read()"
```

执行后成功回显了当前用户的权限信息（包含 sudo 等敏感组），证明未授权 RCE 漏洞成立。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b215495db04a03ff.png)

## 4.自动化 PoC 与危害扩大

为了证明漏洞的实战危害，编写了一个一键化利用脚本，将“获取 Kernel -> 建立连接 -> 发送命令 -> 提取结果”全自动化。

#### (1). 验证系统信息

修改 PoC 中的执行命令为 whoami && uname -a，成功获取了服务器的内核版本号和当前用户信息，证实攻击者已具备完整控制权。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b51a9d1ca204f2c9.jpg)  

#### (2). 读取服务器敏感文件

进一步将 Payload 修改为读取 /etc/passwd：

```python
CMD = "cat /etc/passwd"
```

运行 PoC，成功在终端刷出满屏的服务器用户和权限信息，证明敏感文件已被完全窃取。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/55cb49f6bf96b433.png)  

#### (3). 获取内核基础信息 (拓展验证)

最后，调用 uname -a 查看目标机器的详细系统架构和内核版本，为后续的提权或横向移动提供情报支撑，彻底坐实高危漏洞的危害。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/49b3acd0bb4c2b21.png)

## 5\. 修复建议

#### 强制鉴权：

在生产环境部署 Mercury 时，必须强制启用 Token 鉴权机制（如设置 --token 参数），拒绝任何未授权的 API 访问请求。

#### 网络隔离：

禁止将 Mercury 的 Web 服务端口直接暴露在公网，应通过防火墙或 Nginx 反向代理限制访问来源 IP。

#### 版本升级：

密切关注官方动态，尽快升级至已修复该漏洞的最新安全版本。

* * *

免责声明： 本文仅供网络安全技术交流与学习，请勿用于非法途径。任何未经授权的测试均属违法行为。

* * *
