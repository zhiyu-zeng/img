---
title: Stig's Lab Notes | A Silly Satellite Wi-Fi Router Bug - Redport Pre-Auth RCE
source: https://stigward.github.io/posts/redport-satellite-preauth-rce/
source_host: stigward.github.io
clip_date: 2026-09-22T10:37:23+08:00
trace_id: fabfc144-4224-4995-8133-01a2d4b692eb
content_hash: 874fc8e3d3bc51b0116aceef503507a99346f7457abb3c0a0db4103ed83a5921
status: synced
tags:
  - 漏洞分析
  - 命令注入
series: null
feed_source: Stigward·设备逆向
ai_summary: RedPort 卫星路由器 wXa-223 因认证函数直接拼接用户名执行 perl 命令，未认证即可注入命令获取 root 反向 shell，且厂商 90 天未回应、漏洞未修复。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e375244-d011-81cd-84a6-cb23fe3e9966
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> RedPort 卫星路由器 wXa-223 因认证函数直接拼接用户名执行 perl 命令，未认证即可注入命令获取 root 反向 shell，且厂商 90 天未回应、漏洞未修复。
> 
> - **漏洞成因：** 设备 Web 服务器的 PHP `check_auth` 函数把 HTTP Basic 认证中用户提交的 `PHP_AUTH_USER` 未经处理拼入 perl 命令，再通过 `exec()` 直接执行，形成未认证命令注入。
> - **利用方式：** 闭合命令字符串后，借助设备 busybox 自带的 netcat 即可弹出反向 shell，且注入的命令以 root 权限运行。
> - **攻击门槛：** 该设备固件公开可下载，用 binwalk 即可解包；作者从拿到固件到获得局域网内 pre-auth RCE 仅耗时约 4 分钟。
> - **披露情况：** 作者通过私信两名员工、提交工单并两次跟进、合伙人致电田纳西办公室等方式，共约 7 次沟通、历时 90 天，厂商零回应，漏洞至今处于未修补状态。
> - **后续研判：** 作者未继续深挖该设备，但判断除本地 Web 服务器外，还存在其他低垂果实和更具价值的攻击面。

## Overview:

A few months ago, I was browsing the strange world of satellite products and services. Most SatTerms and routers have firmware readily available online (such as [here](https://www.viasat.com/customer-service/bgan-firmware/) or [here](https://www.speedcast.com/support-center/firmware/)). While flipping through various websites, I stumbled across [RedPort](https://www.redportglobal.com/), a company recently acquired by [Pulsar International](https://www.pulsarbeyond.com/). I grabbed firmware for their most popular device, the [wXa-223](https://www.mysatphone.com/products/gmn-wxa-223?srsltid=AfmBOoq4aixmEU2tbhIHy4q05xyTclMqOQI412xMzeUV_Bi78kRlDxGM) and was able to unpack it with binwalk.

Within 4 minutes, I had pre-auth RCE over LAN…I wish that was a joke.

## Details:

The device has a web-server intended for management functionality and to serve as a GUI for texting / emailing over satellite comms. For authenticated endpoints, the `check_auth` PHP function is used as a guard:

```php
function check_auth(){

    if(! isset($_SERVER['PHP_AUTH_USER'])){
        header('WWW-Authenticate: Basic realm="Private"');
        header('HTTP/1.0 401 Unauthorized');
        echo 'No Username Provided';
        exit;

    }

    $usr=$_SERVER['PHP_AUTH_USER'];
    $cmd = "perl -e '@a=getpwnam(\"$usr\");\$b=join(\",\",@a);print\$b'";

    $pwinfostr="";
    exec($cmd,$pwinfostr);

    // ... code continues ...
?>
```

So…yeah. Take the user-supplied username (`PHP_AUTH_USER`) and throw it right into a perl command. Then just…execute it.

We can escape the command string and then use netcat (included with busybox on the device) to launch a reverse shell

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/18fe4b083780c94f.png)

Oh what do you know…it also runs as root.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b3f93115f05a591f.png)

## Disclosure:

This vulnerability was disclosed through 3 channels - a direct message to two employees as well as a filed support ticket. Each of these was followed-up on..twice. My business partner also *called the office in Tennessee* and was told to try back later…we were subsequently ghosted. ~7 total communication attempts over 90 days with a grand total of *nada* in response.

Soooo this is unpatched. I didn’t dig into the device any further (shortest project ever), but there is likely other low-hanging fruit and some juicier attack surfaces outside of the localw web-server.
