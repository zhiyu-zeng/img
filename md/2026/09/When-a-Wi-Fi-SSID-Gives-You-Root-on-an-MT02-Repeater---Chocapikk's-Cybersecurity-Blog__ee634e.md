---
title: When a Wi-Fi SSID Gives You Root on an MT02 Repeater - Chocapikk's Cybersecurity Blog
source: https://chocapikk.com/posts/2025/when-a-wifi-name-gives-you-root/
source_host: chocapikk.com
clip_date: 2026-09-24T10:26:41+08:00
trace_id: 7c03bb73-1db7-4293-964e-a15f596a3fba
content_hash: 1b40e34e7b99ed6cc4b9d500833a1ab1afd18a7bd37ae9695399cbe5f1c6c800
status: synced
tags:
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: 廉价 MT02（M300）Wi-Fi 中继器的 SSID 表单字段存在命令注入，把 `$(...)` 写进 SSID 即可在重启后以 root 身份执行命令（CVE-2025-34147）。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3e575244-d011-813e-a9b1-da9d6a570dd6
ioc:
  cves:
    - CVE-2025-34147
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 廉价 MT02（M300）Wi-Fi 中继器的 SSID 表单字段存在命令注入，把 `$(...)` 写进 SSID 即可在重启后以 root 身份执行命令（CVE-2025-34147）。
> 
> - **漏洞成因：** 固件在开机时把用户设置的 SSID 直接拼接进 shell 命令，未转义也未过滤，`$(...)` 中的内容以完整权限执行。
> - **验证方式：** 在配网向导第二步把 SSID 填为 `$(id)`，请求 `POST /protocol.csp?`（`opt=wisp_conf&function=set`）保存并重启后，扫描可见新 SSID 直接回显 root 的 `id` 输出。
> - **利用面：** 同一注入点可用于启动 Telnet、投放 SSH 公钥或擦写 flash，全程无需 UART、焊接或刷写自定义固件。
> - **受影响设备：** 零售名 M300 Wi-Fi Repeater，硬件型号 MT02，深圳美泰电子商务出品，AliExpress 售价 €4.79，802.11n / 2.4GHz / 300Mbps，同款 PCB 被多家卖家贴牌，短期内难有固件修复。
> - **披露时间线：** 2025-08-03 发现并验证、当天经 VulnCheck CNA 提交申请，2025-08-04 公开 CVE-2025-34147 记录。

![When a Wi-Fi SSID Gives You Root on an MT02 Repeater](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf2d05b8a25c3ff2.png)

## When a Wi-Fi Name Gives You Root

Last Sunday my internet was crawling. Out of frustration I dropped a message in our Instagram group of hacker friends: pages were loading slower than dial-up, and I needed a distraction. While we joked about the sorry state of my home Wi-Fi, I suddenly remembered a cheap little repeater I had impulse-bought on AliExpress months earlier, hardware model MT02, sold under the retail name M300 Wi-Fi Repeater. Still sealed in its box and begging for an excuse to be tested, so I dug it out.

Setup could not be simpler: plug the unit into a wall socket, connect to its default open SSID, and a tiny captive-portal wizard pops up. The first screen asks which upstream network you want to extend; the second offers to rename the new SSID. While the page loaded I typed in the group chat, “Wonder if there’s an RCE in here lol, these AliExpress gadgets are never secure.” Everyone laughed, but curiosity won: I decided to put that joke to the test.

![MT02 captive-portal wizard](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/48b0d4ef01abfe68.png)

The MT02 captive-portal wizard.

Because boredom plus curiosity is a dangerous combo, I typed `$(id)` instead of a normal SSID and hit **Save**.

![Setup complete](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f0809f6d6232396d.png)

Setup complete

### The Raw Request

```http
POST /protocol.csp? HTTP/1.1
Host: www.msftconnecttest.com
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0
Accept: application/json, text/javascript, */*; q=0.01
Content-Type: application/x-www-form-urlencoded

fname: net&opt=wisp_conf&function=set&ssid=Freebox-[REDACTED]&channel=6&security=WPA2PSK&enc=AES&key=[REDACTED]&bssid=[REDACTED]&extap2g=$(id)&extap2gkey=[REDACTED]&hssid=0&enablebridge=0
```

The repeater saved the config, rebooted, and came back online. Scanning for networks I spotted a new SSID:

![SSID with root output](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0b2c381dc4a1c628.png)

The SSID now shows the output of \`id\`.

Exactly what `id` prints when run as *root*.

![Dumb SpongeBob meme](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1021a32cd71e4e1.jpg)

Dumb SpongeBob: \*That's it?\*

## Why It Works

The firmware writes your SSID straight into a shell command during boot, no escaping, no sanitising. Anything inside `$(...)` executes with full privileges. I printed the user ID for laughs, but the same trick could start Telnet, add an SSH key, or wipe the flash.

No UART, no soldering, no custom firmware, just a form field and one reboot.

## Which repeater is this exactly?

I bought mine from this AliExpress listing: [High-Speed 300 Mbps Wi-Fi Repeater](https://a.aliexpress.com/_EzIV0tu) sold by **KobeKe Technology** for **€4.79** (August 2025). The page shows a **4.4 / 5** rating based on about **1,350 reviews** and lists **5,000+ sales**.

**Retail name:** M300 Wi-Fi Repeater  
**Hardware model:** MT02  
**Manufacturer:** Shenzhen Meitai Electronic Commerce Co., Ltd. - 2 F, Building A, No 8-14, Jinyuan Road, He’ao Community, Henggang Sub-district, Longgang District, Shenzhen, China - [xuguowei@youyuepin.cn](mailto:xuguowei@youyuepin.cn)  
**EU representative:** eVatmaster Consulting GmbH - Bettinastr. 30, 60325 Frankfurt, Germany - [contact@evatmaster.com](mailto:contact@evatmaster.com)  
**Product identifier:** 1005006953956032-12000038867732768

Specs are standard: **802.11n, 2.4 GHz, 300 Mbps**, WPS button, and variants with four or seven status LEDs in black or white. The same PCB is re-branded by many sellers, so don’t expect a firmware patch any time soon.

## Disclosure

| Date | Action |
| --- | --- |
| 2025-08-03 | Vulnerability discovered and validated |
| 2025-08-03 | CVE-2025-34147 assigned to track this vulnerability |
| 2025-08-03 | CVE request submitted via VulnCheck CNA |
| 2025-08-04 | CVE-2025-34147 record published publicly |

## Takeaways

-   **Validate input — even on €5 gadgets.**
-   **Captive portals are untrusted territory.**
-   **Two parentheses can be all it takes to get root.**

I only wanted faster Wi-Fi. One bored Sunday and a playful SSID later, I had a root shell on my repeater.

## Part 2

For a deeper dive into bind-shell deployment, payload experiments, and the discovery of a new `time_conf` primitive for stealthy, persistent root access without reboot or UI lockup, see [Part 2](https://chocapikk.com/posts/2025/when-a-wifi-name-gives-you-root-part-two/).
