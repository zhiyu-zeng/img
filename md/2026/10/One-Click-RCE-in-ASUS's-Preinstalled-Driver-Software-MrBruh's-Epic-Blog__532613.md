---
title: One-Click RCE in ASUS's Preinstalled Driver Software | MrBruh's Epic Blog
source: https://mrbruh.com/asusdriverhub/
source_host: mrbruh.com
clip_date: 2026-10-01T10:32:33+08:00
trace_id: f43f1636-35a7-491a-8cd8-d7ab9301bd43
content_hash: 2783a429d87c8dfb607cd05cb1ad5c1dc92479f6b3da330f20abca5a417a55bc
status: synced
tags: []
series: null
feed_source: mrbruh·漏洞研究
ai_summary: ASUS DriverHub 的本地 RPC 只对 Origin 做子串匹配，叠加 UpdateApp 的弱 URL 校验与签名验证缺陷，任何网页都能以管理员权限在用户机器上执行任意代码（CVE-2025-3462 / CVE-2025-3463）。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 6
  failed_urls:
    - https://media1.tenor.com/m/9Z4aF3ksVH0AAAAd/joey-gibson.gif
notion_page_id: 3ec75244-d011-8133-b6b6-f00cfce3e325
ioc:
  cves:
    - CVE-2025-3462
    - CVE-2025-3463
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ASUS DriverHub 的本地 RPC 只对 Origin 做子串匹配，叠加 UpdateApp 的弱 URL 校验与签名验证缺陷，任何网页都能以管理员权限在用户机器上执行任意代码（CVE-2025-3462 / CVE-2025-3463）。
> 
> - **Origin 校验绕过：** 后台进程在 `127.0.0.1:53000` 提供 RPC，仅接受 `driverhub.asus.com` 的 Origin，但用的是包含匹配而非全等，因此 `driverhub.asus.com.mrbruh.com` 这类域名即可通过。
> - **UpdateApp 弱点：** Url 参数同样只要求含 `.asus.com`（`example.com/payload.exe?foo=.asus.com` 可行）；可下载任意扩展名文件；签名校验失败的文件不会被删除。
> - **签名限制与绕过：** 仅 ASUS 签名的可执行文件会被管理员权限自动运行，但该逻辑不限定为 DriverHub 安装包，任何 ASUS 签名程序都可被调用。
> - **完整利用链：** 依次让 DriverHub 下载 `calc.exe`（签名失败、留存）、恶意 `AsusSetup.ini`（`SilentInstallRun=calc.exe`）、以及签名的 `AsusSetup.exe`；后者以 `-s` 静默安装并读取 ini，从而以管理员权限执行 ini 指定的任意命令。
> - **时间线与影响：** 2025-04-07 发现、04-08 升级为 RCE 并上报，04-18 修复上线；作者通过证书透明度日志排查一个月，未发现在野利用。ASUS 不提供赏金，仅列入名人堂。

Part Two of the ASUS series is out, read it [here](https://mrbruh.com/asus_p2/).

## Introduction

This story begins with a conversation about new PC parts.

![dms.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6afba1bb2fa399b7.avif)

After ignoring the advice from my friend, I bought a new ASUS motherboard for my PC. I was a little concerned about having a BIOS that would by default silently install software into my OS in the background. But it could be turned off so I figured I would just do that.

![bios.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/854720566bb490f6.avif)

Immediately after logging into Windows I was hit with a notification requesting admin permissions to complete the installation of ASUS DriverHub, because I forgot to change the BIOS option. Since I needed to get a WiFi driver for the motherboard anyway, I got curious and installed it.

![admin\_prompt.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0e11a04667a66dfe.avif)

*I don’t have a screenshot of DriverHub but it showed a popup exactly like this in the bottom-right of my screen*

## DriverHub

![driverhub\_ui.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cb83a6303d6222cb.avif)

DriverHub is an interesting piece of driver software because it doesn’t have any GUI. Instead it’s just a background process that communicates with the website [driverhub.asus.com](https://driverhub.asus.com/) and tells you what drivers to install for your system and which ones need updating. Naturally I wanted to know more about how this website knew what drivers my system needed and how it was installing them, so I cracked open the Firefox network tab.

As I expected, the website uses RPC to talk to the background process running on my system. This is where the background process hosts an HTTP or Websocket service locally which a website or service can connect to by sending an API request to `127.0.0.1` on a predefined port, in this case `53000`.

Right about now my elite hacker senses started tingling.

![⚠️ 图片托管失败 · joey-gibson.gif](https://media1.tenor.com/m/9Z4aF3ksVH0AAAAd/joey-gibson.gif)

This is a very sketchy way to design driver management software. If the RPC isn’t properly secured, it could be weaponized by an attacker to install malicious applications.

## Finding the Vulnerability

The next step was to see if I could call the RPC from any website, this was replicated by copying the request from my browser as a curl command and pasting it into my terminal.

![copyascurl.avif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/05d8190df6c84e0f.avif)

After fiddling with variations of the command for a while my assumptions were confirmed. DriverHub only responded to requests with the origin header set to “driverhub.asus.com”. So at least this software wasn’t completely busted and evil hackers can’t just send requests to DriverHub willy-nilly.

However I wasn’t done yet, presumably the program checks if the origin is `driverhub.asus.com` and if so it’d accept RPC request. What I did next was see if the program did a direct comparison like `origin == driverhub.asus.com` or if it was a wildcard match such as `origin.includes("driverhub.asus.com")`.

When I switched the origin to `driverhub.asus.com.mrbruh.com`, **it allowed my request.**

It was obvious now there was a serious threat. The next step was to determine how much damage was possible.

## The Extent of the Damage

By trawling through the Javascript on the website, and about 700k lines of decompiled code that the exe produced, I managed to create a list of callable endpoints including some unused ones sitting in the exe.

-   **Initialize** This command is used by the website to check if the software is installed and returns basic installation information.
    
-   **DeviceInfo** This returns all installed ASUS’s software, all installed.sys drivers, all your hardware components, and your MAC address.
    
-   **Reboot** This reboots the target device immediately without confirmation.
    

 Your browser does not support the video lmao

-   **Log** This returns a zipped copy of all of DriverHub’s logs.
    
-   **InstallApp** This installs an app or driver by its ID. The ID’s for all the apps are hard coded in an XML file which is provided by the DriverHub installer.
    
-   **UpdateApp** This self-updates DriverHub using a provided file URL to download and run.
    

## Achieving RCE

I became fixated on the UpdateApp endpoint for obvious reasons. So I spent a few hours exploring the code in ghidra and hitting it with various curl requests to learn the intricacies of how it behaves.

A request to the endpoint looks like this:

```bash
curl "http://127.0.0.1:53000/asus/v1.0/UpdateApp" -X POST --data-raw '{"List": [{"Url": "https://driverhub.asus.com/<app.exe>"}]}'
```

Here were the observations I had made about the UpdateApp function at that point.

-   The “Url” parameter must contain “.asus.com” but unlike the RPC origin check, it allows stupidity like `example.com/payload.exe?foo=.asus.com`
-   It saves the file with the filename specified at the end of the URL.
-   Any file with any extension can be downloaded
-   If the file is an executable signed by ASUS it will be automatically executed with admin permissions
-   It will run *any* executable signed by ASUS, not just a DriverHub installer.
-   **If a downloaded file fails the signing check, it does not get deleted.**

When I learned that DriverHub validates the signature of the executable I suspected an RCE may no longer be possible, however I soldiered on regardless.

My first thought was potentially a *timing attack*, where I tell DriverHub to install a valid executable, and after it validates the signature, but just before it installs the exe, I swap it out with a malicious executable. I theorized this could be possible by making two UpdateApp requests in parallel, with the malicious update being just after the legitimate one.

However timing attacks need to be extremely precise and having that timing being affected by files needing to be downloaded made it a very unreliable option. Given that, I decided to take a step back and think if there were any other options.

Eventually I was led back to the standalone WiFi driver I was going to install all along. The driver was distributed in the following zip file.

![Zip Contents](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/aa1fbc281f107b63.avif)

The files of importance here are the `AsusSetup.exe`, `AsusSetup.ini` and `SilentInstall.cmd`. When executing AsusSetup.exe it first reads from AsusSetup.ini, which contains metadata about the driver. I took interest in a property in the file: `SilentInstallRun`.

When you double-click AsusSetup.exe it launches a simple gui installer thingy. But if you run AsusSetup.exe with the `-s` flag (DriverHub calls it using this to do a silent install), it will execute *whatever’s* specified in SilentInstallRun. In this case the ini file specifies a cmd script that performs an automated headless install of the driver, **but it could run anything**.

#### Here is the completed exploit chain

1.  Visit website with `driverhub.asus.com.*` subdomain
    
2.  Site makes UpdateApp request for PoC executable “calc.exe”
    
    > “calc.exe” will be downloaded, fail the signature check and not be executed
    
3.  Site makes UpdateApp request for custom AsusSetup.ini
    
    > This will also be downloaded and not executed
    

```ini
   [InstallInfo]
   SilentInstallPath=.\
   SilentInstallRun=calc.exe
```

4.  Site makes UpdateApp request for signed ASUS binary “AsusSetup.exe”
    
    > This will be downloaded and executed with admin permissions and does a silent install using `-s`, which will cause it to read the AsusSetup.ini file and run “calc.exe” specified in “SilentInstallRun” also **with admin permissions**
    

PoC in action:  Your browser does not support the video lmao

## Reporting Timeline (DD/MM/YYYY)

-   07/04/2025 - Found the initial vulnerability
-   08/04/2025 - Escalated the vulnerability to RCE
-   08/04/2025 - Reported the vulnerability
-   09/04/2025 - Automated response from ASUS
-   17/04/2025 - I followed up and got a human response letting me know they had patched the software and sent me a build to verify
-   18/04/2025 - ASUS confirmed the fix was live
-   09/05/2025 - [CVE-2025-3462](https://www.cve.org/CVERecord?id=CVE-2025-3462) (8.4) and [CVE-2025-3463](https://www.cve.org/CVERecord?id=CVE-2025-3463) (9.4) were published

## Assessing the Damage

Almost immediately after reporting the RCE to ASUS I wrote a script to track [certificate transparency](https://certificate.transparency.dev/) updates on my VPS, so I could see if anyone else had a domain with `driverhub.asus.com.*` registered. From looking at other websites certificate transparency logs, I could see that domains and subdomains would appear in the logs usually within a month.

After a month of waiting I am happy to say that my test domain is the only website that fits the regex, meaning **it is unlikely that this was being actively exploited** prior to my reporting of it.

## Bug Bounty

I asked ASUS if they offered bug bounties. They responded saying they do not, but they would instead put my name in their [“hall of fame”](https://www.asus.com/content/asus-product-security-advisory/#header2025). This is understandable since ASUS is just a [small startup](https://companiesmarketcap.com/asus/marketcap/) and likely does not have the capital to pay a bounty.

## Fun Notes

-   After publishing this article another security researcher (leonjza) reached out, it turned out that they had already reported the same origin check issue back in Feburary and it took until now for ASUS to fix it. ASUS did not inform me of this so it felt a bit bad to be strung along like that. ASUS also solely credited that security researcher on the cve.org page and said they would not be adding me into the credits section.
    
-   When submitting the vulnerability report through ASUS’s [Security Advisory form](https://www.asus.com/securityadvisory/), Amazon CloudFront **flagged the attached PoC as a malicious request** and blocked the submission. So I had to strip out some of the PoC code and link video recordings instead.
    
-   If you click “Install All” in DriverHub instead of manually clicking install on each recommended driver, it will also install ArmouryCrate, ASUS’s custom CPU-Z, Norton360 and WinRAR.
    
-   Their CVE description for the RCE is a little misleading. They say *“This issue is limited to motherboards and does not affect laptops, desktop computers”*, however this affects any computer including desktops/laptops that have DriverHub installed. Also, instead of them saying it allows for arbitrary/remote code execution they say it *“may allow untrusted sources to affect system behaviour”*.
    
-   **MY ONBOARD WIFI STILL DOESN’T WORK**, I had to buy an external USB WiFi adapter. Thanks for nothing DriverHub.
    

## Contact Me

-   If you have any questions you can contact me on Signal (preferred) @paul19.84 or via email `contact [at] mrbruh.com`
