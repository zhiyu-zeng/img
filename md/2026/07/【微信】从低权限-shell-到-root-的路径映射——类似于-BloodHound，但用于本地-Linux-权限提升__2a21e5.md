---
title: 【微信】从低权限 shell 到 root 的路径映射——类似于 BloodHound，但用于本地 Linux 权限提升
source: https://mp.weixin.qq.com/s/cPvMrDQ1HUMpDe9Nj65Qog
source_host: mp.weixin.qq.com
clip_date: 2026-07-26T00:01:42+08:00
trace_id: e1d0f4cf-d453-4a04-936d-ae3fc3ecebf1
content_hash: 771a3c123a36b897a88e4eb903d4477cf77dc57839b9db7f49f1e8ef87cb6435
status: summarized
tags:
  - 微信
  - Linux安全
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: RootHound 是一个用于 Linux 本地权限提升的路径映射工具，通过分析 LinPEAS 输出生成交互式 HTML 报告，可视化从低权限 shell 到 root 的可行攻击路径。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3a875244-d011-8189-bee1-f46ac7ec6e4c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> RootHound 是一个用于 Linux 本地权限提升的路径映射工具，通过分析 LinPEAS 输出生成交互式 HTML 报告，可视化从低权限 shell 到 root 的可行攻击路径。
> 
> - **核心功能：** 类似于 BloodHound，但专注于本地 Linux 环境，映射权限提升路径（从用户到 root）。
> - **输入与输出：** 以 LinPEAS 输出为输入，运行 Python 脚本生成单个 HTML 报告文件，完全离线且无依赖。
> - **可视化特性：** 攻击路径图从左到右显示，使用红色（已确认）和琥珀色（可能）着色路径置信度。
> - **交互与发现：** 支持点击节点获取详细信息和可复制的滥用命令，并能发现多跳链路径（如可写脚本 → root cron）。
> - **规则覆盖：** 内置可编辑规则手册，涵盖 SUID/SGID、sudo、权限、危险组、可写文件、NFS、PATH 劫持及内核/sudo CVE 匹配。

**Ots安全** *2026年7月25日 23:39*

**威胁简报**

**恶意软件**

**漏洞攻击**

特征

-   攻击路径图——参见YOU → technique → ROOT，从左到右
    
-   🔴置信度着色——已确认的路径以红色显示，可能的线索以琥珀色显示
    
-   🖱️点击任意节点— 获取该节点的信息以及完整的滥用命令（可直接复制）
    
-   🔗多跳链— 发现跨越不同发现的路径（例如，可写脚本 → root cron → root）
    
-   🧠可编辑规则手册— SUID/SGID、sudo、权限、危险组、可写文件、NFS、PATH劫持以及内核/sudo CVE匹配
    
-   📴完全离线— 无依赖项，无需网络，单个独立的 HTML 输出
    

安装：

```
git clone https://github.com/roothound.git
cd roothound
# feed it LinPEAS output:
python3 roothound.py linpeas.txt -o report.html
```

选项 2 — 下载 ZIP： 点击上面的绿色代码按钮 →下载 ZIP，解压缩，然后运行它。

然后report.html用任意浏览器打开。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ed6b0f75eb4209d5.png)

演示

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4305f6c4246982d5.png)

您的浏览器不支持 video 标签

项目地址：

https://github.com/Noz2/RootHound

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e5c7386d8a4fbd4c.jpg)

**END**

公众号内容都来自国外平台-所有文章可通过点击阅读原文到达原文地址或参考地址

排版 编辑 | Ots 小安

采集 翻译 | Ots Ai牛马

公众号 | AnQuan7 (Ots安全)

Tools · 目录
