---
title: Jadx也想要翅膀 - 奋飞安全
source: http://91fans.com.cn/post/jadxmcp/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:35:03+08:00
trace_id: 49a7e602-bd66-4323-81dd-c152ba43ad48
content_hash: 1301e9bed247bc306fe45bf5a0a0218511e0a0dba90a5faae16a67b470a77ca3
status: synced
tags:
  - AI辅助逆向
  - Frida
series: null
feed_source: 91fans·逆向
ai_summary: Jadx 通过 jadx-ai-mcp 插件与外部 MCP Server 协作，让 AI 根据反编译代码定位 token 计算逻辑并生成 Frida Hook 脚本，经过两次失败后最终成功。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3b275244-d011-813d-ae9b-d678ade98fb6
ioc:
  cves: []
  cwes: []
  hashes:
    - 01bb90d6de80f3cb01bb90d6de80f3cb
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Jadx 通过 jadx-ai-mcp 插件与外部 MCP Server 协作，让 AI 根据反编译代码定位 token 计算逻辑并生成 Frida Hook 脚本，经过两次失败后最终成功。
> 
> - **安装方式：** 在 `jadx-1.5.3/bin` 目录执行 `./jadx plugins --install "github:zinja-coder:jadx-ai-mcp"` 安装插件；另需下载 `jadx-mcp-server-v5.0.0.zip` 作为 AI IDE 对接服务。
> - **AI IDE 配置：** MCP Server 配置中指定 Python 解释器和 `jadx_mcp_server.py`，并 `alwaysAllow` 了 `get_android_manifest`、`search_classes_by_keyword`、`get_class_source`、`search_method_by_name` 等能力；作者提到 MCP 协议有多种，与之前 IDA MCP 配置不同。
> - **第一次尝试：** 让 AI 连接 jadx MCP，定位 token 计算位置并写 Frida Hook 脚本，但实际运行后没有 hook 到目标；同样的问题在第二次提交代码后仍然存在。
> - **最终成功：** AI 修正后成功 Hook `TokenUtil.f()`、`TokenUtil.e()`、`AES.b()` 等关键方法，截获 hash 计算、AES 加密和最终 URL 编码 token；实际 token 由 hash 值 `-1926105764` 与时间戳拼接后加密得到。
> - **关键信息：** 真实 AES 加密使用了密钥 `@cLjKxIl7hlto3tR`，与 AI 最初声称的 `7A3II/M5Ja0S4gdf` 不同；作者强调基本功仍然重要，否则无法判断 AI 结果是否正确。

一、目标

## 一、目标

Jadx: "我也很想进步，古法太繁琐了，现在的年轻人都玩不转。"

fenfei: "这个可以有。"

## 二、步骤

### 安装

mcp是什么咱们就不解释了，刚来的同学可以翻翻前情提要回顾一下 [http://91fans.com.cn/post/idamcp/](http://91fans.com.cn/post/idamcp/)

今天我的新朋友是 jadx-ai-mcp

[https://github.com/zinja-coder/jadx-ai-mcp](https://github.com/zinja-coder/jadx-ai-mcp)

她的安装分两部分

-   去到 /Users/fenfei/Desktop/tool/jadx-1.5.3/bin 目录下面执行

```bash
./jadx plugins --install "github:zinja-coder:jadx-ai-mcp"
```

-   下载 jadx-mcp-server 对接 AI 用

[https://github.com/zinja-coder/jadx-ai-mcp/releases/download/v5.0.0/jadx-mcp-server-v5.0.0.zip](https://github.com/zinja-coder/jadx-ai-mcp/releases/download/v5.0.0/jadx-mcp-server-v5.0.0.zip)

### 开工

找个软柿子捏一下

就用之前的 [http://91fans.com.cn/post/txtread/](http://91fans.com.cn/post/txtread/),咱们换AI来搞 Jadx打开，然后 文件 → 首选项 → 插件

![jadxplugin](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/01b3a2a00dcececb.png)

1:jadxplugin

这说明插件部分安装OK

然后给 AI IDE 配置上 MCP Server

```bash
{
  "mcpServers": {
    "jadx": {
      "command": "/opt/miniconda3/envs/jadxmcp/bin/python",
      "args": [
        "/Users/fenfei/Desktop/tool/jadx-mcp-server/jadx_mcp_server.py"
      ],
      "alwaysAllow": [
        "get_android_manifest",
        "search_classes_by_keyword",
        "get_class_source",
        "search_method_by_name"
      ]
    }
  }
}
```

细心的同学可能发现和之前IDA的MCP配置有很大的不一样。

AI这玩意还在迅猛发展，百家争鸣，所以MCP的协议有很多种，具体这两种协议哪种先进，可以问问 AI。

咱们是实用主义着，先不纠结原理了，连上了就行，在 AI IDE里呼唤神龙…

```bash
连接jadx mcp, 定位 token=rOW60Ct5iGxgRX0Olulcz9IXtWiGmAO7cbL7Y%2FU0tOc%3D 这个 token计算的位置，然后写个Frida hook 脚本
```

然后就是默默的等待，想起了 Chrome的恐龙游戏，我感觉在等待 AI干活的过程中，应该来个 是男人就下500层 的小游戏。怪不得李老板喜欢玩扫雷，原来他把我当AI了，发布命令，然后边玩扫雷，边等我的结果。

有了AI 咱们也能过上李老板的日子了，越来越有盼头了。

AI 写完了， 我就不贴代码了， (小声告诉你，贴 知识星球 了)

```bash
任务完成
已成功定位token计算位置并创建Frida hook脚本 token_hook.js

Token生成流程分析
根据反编译代码，token rOW60Ct5iGxgRX0Olulcz9IXtWiGmAO7cbL7Y%2FU0tOc%3D 的生成流程：

主要方法: Token.Companion.m() - getToken方法

输入: URI路径 + 参数Map
计算: hash_timestamp 格式的字符串
使用AES加密（密钥: 7A3II/M5Ja0S4gdf）
Hash计算: Token.Companion.k()

拼接: uri + 排序后的参数 + "mVjdXyqwjlEptwYY"
使用MurmurHash算法计算hash值
AES加密: AES.Companion.b()
算法: AES/CBC/PKCS5Padding
密钥: 7A3II/M5Ja0S4gdf
IV: 16-Bytes--String
输出: Base64编码
Hook脚本功能
脚本会拦截以下关键方法：

Token.getToken() - 捕获token生成
MurmurHash.d() - 捕获hash计算
AES.encodeAES() / AES.decodeAES() - 捕获加解密
SignatureUtil.sign() - 捕获签名生成
Token.getHash() - 捕获内部hash计算
Token.getUrlParamsByMap() - 捕获参数拼接
使用方法：

frida -U -f <包名> -l token_hook.js --no-pause
```

说的有模有样的，赶紧跑下代码试试。

我去，没效果

```bash
不对 没有hook到
```

AI 又开始干活了，咱们继续扫雷。

过了几分钟，新的代码又搞完了，继续跑。 还是没有效果

```bash
还是没有
```

AI 继续干活，咕嘟嘟，干了一通，扔给我了一个新的代码

```bash
[+] TokenUtil.f() - Calculate Hash
    Input1: /v1/category/female
    Input2: channel=zxf2019_19206_001&os=Android&package=cn.ttkmfxs.novel&udid=01bb90d6de80f3cb01bb90d6de80f3cb&v=3.3.24.R
    Hash: -1926105764

[+] TokenUtil.e() - AES Encrypt
    Plain: -1926105764_1766754803859

[+] AES.b() - Encrypt
    Value: -1926105764_1766754803859
    Key: @cLjKxIl7hlto3tR
    Encrypted: nADo5PoDE0nEwN6gKB9L8WF9OzAmwqviEgy/ljE1DI0=
    Encrypted: nADo5PoDE0nEwN6gKB9L8WF9OzAmwqviEgy/ljE1DI0=
    Generated Token (URL encoded): nADo5PoDE0nEwN6gKB9L8WF9OzAmwqviEgy%2FljE1DI0%3D
```

oh yeah，这次成功了。感觉和玩大转盘差不多，多玩几次，总会有惊喜。

## 三、总结

有种赛博求签的感觉，心诚则灵。理解了有些人有事就扑通跪倒在佛像前面，感情佛祖也是AI的一种。

基本功还是得有的，不然被ai骗人都不知道咋回事。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0b1e6d0ccc55de1d.jpg)

1:ffshow

天地无穷期，生命则有穷期，去一日，便少一日；富贵有定数，学问则无定数，求一分，便得一分。

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
