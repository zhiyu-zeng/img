---
title: "Bluetooth Low Energy Security Testing, Consolidated: Introducing Caeruleus"
source: https://www.praetorian.com/blog/ble-testing-caeruleus/
source_host: www.praetorian.com
clip_date: 2026-09-15T10:25:03+08:00
trace_id: 4e6bfad7-86f2-4358-9b23-060665ef1e5f
content_hash: 61bed1a3b91d749d43fc46bdf91f0d3700bda911a38bb339332a131da8fb2108
status: synced
tags:
  - 协议分析
  - 安全工具
series: null
feed_source: Praetorian
ai_summary: Praetorian 发布开源工具 Caeruleus，用单个 Go 二进制整合碎片化、依赖废弃组件的 BLE 安全测试流程。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dc75244-d011-8140-95ff-d2fe0b63e617
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Praetorian 发布开源工具 Caeruleus，用单个 Go 二进制整合碎片化、依赖废弃组件的 BLE 安全测试流程。
> 
> - **背景痛点：** 传统 BLE 测试需拼凑 hcitool、bettercap、gatttool 与临时 Bleak 脚本，各工具方言不同、不产出机器可读输出，使用者被迫充当集成层手动在终端间搬运 MAC 与 handle。
> - **核心能力：** 基于 Linux BlueZ，单二进制覆盖扫描、GATT 枚举、读写/通知、fuzz 与结构化评估，如 `caeruleus scan`、`enumerate -b --values`、`read/write -a 0x002c`、`fuzz write`、`conn-params`。
> - **面向 Agent：** `-o json/jsonl` 提供省 token 的结构化输出，仓库附带 Agent Skills 技能文件；基准测试中配合技能的 Agent 用时为自由选型（选了 hcitool 与 Bleak）的 62%、token 为 70%。
> - **评估工作流：** `recon` 做指纹与 GATT 审计，`assess` 子命令（check-auth、encryption、dfu、wwr）各探一类弱点，统一输出 `{address, test, summary, findings[]}`；并用 Titus 规则集做密钥检测，未配对链路读到的 AWS 密钥会被单独升级为 high。
> - **工程细节与限制：** `doctor` 巡检 BlueZ/内核状态并给出修复命令，SIGTERM/SIGHUP 时干净断开以避免"幽灵连接"，另有 `serve/send` 与 `batch` 模式；但只能作为 central，不支持 BLE 嗅探、主动 AITM/MITM 与外设克隆。

*Caeruleus – Latin, deep blue*

The Bluetooth Low Energy (BLE) tooling space is fragmented and decaying. Picture a typical BLE testing session: you spin up *bettercap* to run *ble.recon* and *ble.enum*, your trusty (but deprecated) *gatttool* to read and write handles, and, when it’s time to fuzz that one writable characteristic, dig up that custom *Bleak* script you copy-paste between directories and projects.

That’s the BLE testing tax, and we got tired of paying it. So we built **Caeruleus**: a single Go binary that covers the whole BLE lifecycle, built on top of the BlueZ stack for Linux. Caeruleus lets you scan, enumerate, read/write/notify characteristics, fuzz, and run structured security assessment workflows against your Bluetooth Low Energy devices.

## The BLE testing tax

The standard workflow for BLE security is a scavenger hunt across tools that were never designed to work together. If you pick a random Bluetooth Low Energy testing guide online, you’ll probably see:

-   **hcitool / hciconfig** for adapter config and device discovery, both deprecated by BlueZ and missing from many modern distros.
-   **bettercap** for *ble.recon* and *ble.enum*. Powerful, but you’re installing a full network-attack framework (with its libpcap/libusb/Ruby-era baggage) only to browse a GATT tree.
-   **gatttool** for reading and writing handles, deprecated for years but still present in every BLE testing tutorial
-   **Custom Bleak / pygatt scripts** for in-depth testing of the device

Each tool speaks its own dialect. None emit machine-readable output you can pipe into the next step. You end up as the integration layer, copying MAC addresses and handles between terminals by hand.

These days Bluetooth management in Linux is handled BlueZ, which offers supported frontends in *bluetoothctl* and *btmgmt*. But those are general-purpose management tools: *btmgmt* configures the hardware controller, and *bluetoothctl* is mostly used as an interactive shell for pairing a device or hand-browsing a GATT tree. *bluetoothctl* has a non-interactive command mode, but it’s often at the wrong abstraction level for what a human or agent needs. The user experience for these tools is rough, as they are made for controlling Bluetooth.

Caeruleus consolidates these tools and keeps the abstractions at a practical level. On top of that, we’ve added a workflow for assessing the security of Bluetooth devices, have it perform secrets detection using Praetorian’s *titus* on the values it sees, and can easily emit any results in structured JSON for scripts or agents to work more efficiently.

## …and in the dark blue bind them

Caeruleus replaces that entire pile. You’ll find all of the functionality you’re used to in a single tool.

| Use Case | Previous Method | Using Caeruleus |
| --- | --- | --- |
| Discovering nearby devices | `hcitool lescan`  <br>`bettercap ble.recon`  <br>`bluetoothctl scan on` | `caeruleus scan` |
| Listing (and reading) services/characteristics | `bettercap ble.enum` | `caeruleus enumerate -b --values` |
| An interactive session | `gatttool -I`  <br>`bluetoothctl (menu gatt)` | `caeruleus shell -b` |
| Reading a handle | `gatttool --char-read-hnd 0x0013`  <br>`bluetoothctl select-attribute + read` | `caeruleus read -b -a 0x0013` |
| Writing to a handle | `gatttool -b de:ad:be:ef:be:f1 --char-write-req -a 0x002c -n $(echo -n "some value"\|xxd -ps)` | `caeruleus write -b de:ad:be:ef:be:f1 -a 0x002c --req -s "some value"` |
| Capturing notifications | custom Bleak notification logger | `caeruleus listen -b -a` |
| Checking for unauth data exposure an characteristics that don’t require encryption | custom Bleak audit scripts | `caeruleus recon / caeruleus assess ...` |
| Fuzzing a characteristic | custom write fuzzers / boofuzz | `caeruleus fuzz write -b -a` |
| Connection params, MTU | `hcitool con`  <br>`btmgmt con-info` | `caeruleus conn-params -b` |
| Adapter power and recovery | `btmgmt power`  <br>`hciconfig reset`  <br>`rfkill` | `caeruleus doctor`  <br>`caeruleus adapter power cycle` |

## Agents welcome here

Your LLM agents can easily use Caeruleus as well. *\-o json* and *\-o jsonl* give token-efficient, structured output an agent parses without scraping human-formatted tables. The repo also ships a portable [agentskills.io](http://agentskills.io/) Skill (*skills/caeruleus/SKILL.md*) that teaches any Agent Skills-compatible assistant the command surface and a recommended assessment methodology.

Point an agent at a device and it runs the whole methodology start to finish. When completing our benchmark test, Opus 4.8 xHigh with Caeruleus and its included skill took 62% of the time and 70% of the tokens as Opus 4.8 xHigh with free tool choice (it picked *hcitool* and *Bleak* scripts).

## Ergonomics

Caeruleus was built with ease-of-use in mind. Here are some of the features we are most proud of:

### BLE Health

With current tooling, you’re never quite sure if a problem is with your tools, your environment, or the services you are relying on. Caeruleus has features to help you understand, and ensure, the health of the Bluetooth LE stack.

**`caeruleus doctor`.** A single command that walks the BlueZ and kernel state and prints an OK/WARN/FAIL checklist. It verifies that bluetoothd is running, the adapter is powered, no stale discovery session is leaked, the BlueZ-cached address matches the MGMT chip-live address, LE scanning actually works (via a 2-second probe), and ExchangeMTU is configured in a safe band. Each finding that isn’t OK includes a concrete fix command — for example, `caeruleus adapter power cycle` if the adapter is unpowered. The exit code follows the grep/diff convention: 0 for all-clear, 2 when a check fails.

**Clean teardown.** On SIGTERM and SIGHUP, the tool intercepts the signal and runs the BLE disconnect path before exiting. It then polls until `Connected=false` propagates through BlueZ, so the peripheral immediately re-advertises instead of waiting for its supervision timeout. This prevents the “ghost connection” problem where gatttool crashes and the peripheral remains unreachable for 10–30 seconds.

### Output Formats

Every command that produces structured output supports three formats via the `-o` flag:

-   **`text`**— Human-readable tables rendered with borderless, space-padded formatting. The table style is chosen so that MAC addresses and UUIDs are double-click-selectable in common terminal emulators.
-   **`json`**— Indented JSON. Marked in help text as authoritative — the tool treats JSON as the canonical representation, not a secondary export.
-   **`jsonl`**— One JSON object per line. For streaming commands like `listen` and `scan --live`, each event is emitted as a discrete record as it arrives.

The `enumerate` command also supports a `--compact` mode that emits one key=value line per characteristic — designed for piping into grep or feeding to an LLM context window where token efficiency matters.

### Scripting and Automation

**Daemon mode.** `caeruleus serve` opens a Unix-domain socket and holds a single GATT connection open. Clients dispatch commands with `caeruleus send "read 0x0029"`. This avoids the ~1.5-second reconnect cost that a fresh CLI invocation pays each time, which matters when an LLM agent or a script is issuing dozens of sequential commands.

**Batch mode.** `caeruleus batch -b $ADDR` reads shell commands from stdin, one per line. Blank lines and # comments are ignored. There is no readline overhead and no async notification pump — output goes straight to stdout, safe for piping and grep. If `-b` is supplied, the connection is established up front so the first command doesn’t pay the connect cost mid-line.

**Atomic trigger-then-capture.** The listen command’s `--trigger-handle` and `--trigger-value` flags set up notifications, send a write, and capture the response in one step. Without this, scripting a “write to one handle, then quickly read from another” workflow with separate commands risks missing the response.

### Convenience Details

**Device type inference.** Scan results include a human-readable device type label derived from the GAP Appearance value and advertised service UUIDs. A device advertising Appearance `0x00C2` with Heart Rate Service shows up as “Smartwatch” rather than requiring you to look up the Bluetooth SIG assigned numbers yourself.

**Flexible input parsing.** Handles accept `0x002a`, `0X2A`, or `42` (decimal). Hex byte values accept `deadbeef`, `de:ad:be:ef`, `de ad be ef`, or `0xdeadbeef`. No format errors from forgetting a prefix or using the wrong delimiter.

**Recipes.** `caeruleus recipes` lists 16 common BLE testing workflows with copy-pasteable command examples. Each recipe is tagged, and `caeruleus recipes trigger` searches by keyword to find the relevant workflow — for example, the write-then-capture-notification pattern.

**Connection parameters.** `caeruleus conn-params` reports the negotiated LE connection interval, peripheral latency, supervision timeout, and whether the peripheral renegotiated the initial parameters — data that neither *gatttool* nor *bettercap* surface.

## Opinionated

Caeruleus focuses on the most common facets of BLE interaction and makes those parts fast, scriptable, and agent-friendly. It was built by offensive security engineers to fit their needs, but there are a few limitations. Caeruleus only works as the *central* in the Bluetooth LE model. It cannot be the *peripheral*. And while it can perform many of the most common operations for BLE devices, there are a few it can’t do: sniffing of BLE traffic, active Attacker-in-the-Middle (AITM/MITM), and peripheral cloning.

## A quick walkthrough

```bash

					$ caeruleus doctor
adapter: hci0
  [  OK] bluetoothd            active
  [  OK] Powered               true
  [  OK] Discovering           false
  [  OK] Address agreement     00:1A:7D:DA:71:13
  [  OK] LE scan healthy       saw advertisements
  [  OK] ExchangeMTU           247
				
```

```bash

					$ caeruleus scan
ADDRESS            TYPE    RSSI  DEVICE  NAME
------------------------------------------------------------
9C:9C:1F:F2:88:86  public  -32           BLECTF_JohnsonSpace
C9:F0:81:C6:3B:52  random  -50           Govee_H61B5_3B52
C4:C0:B0:3B:5B:EF  random  -59           Aranet4 06D4B
DC:FD:B4:CA:B4:E9  random  -62           JBL Boombox 2
				
```

Once you find a target, browse the full GATT tree and read every characteristic in one shot.

```bash

					$ caeruleus enumerate -b 9C:9C:1F:F2:88:86 --values
SVC HND  CHR HND  CHR UUID  PROPS        HEX                ASCII
0x0014   0x0015   0x2A00    R            424c457b46344c...  BLE{F4K3_1D3NT1TY}
0x0028   0x002b   0xFF02    R,W          577269746520...    Write Flags Here
0x0028   0x002d   0xFF03    R            424c457b503447...  BLE{T0K3N_S4V3R}
0x0028   0x002f   0xFF05    R,W          577269746520...    Write anything here
0x0028   0x004f   0xFF16    B,R,W,N,ext  536f206d616e79...  So many properties!
				
```

Then poke individual handles. Read one, write a value, read it back:

```bash

					$ caeruleus read -b 9C:9C:1F:F2:88:86 -a 0x002d
0x002d hex=424c457b503447335f5455524e5e33527d ascii="BLE{T0K3N_S4V3R}"

$ caeruleus write -b 9C:9C:1F:F2:88:86 -a 0x002f -s "praetorian"
0x002f written=10 type=request

$ caeruleus read -b 9C:9C:1F:F2:88:86 -a 0x002f
0x002f hex=424c457b43304c30535333554d7d ascii="BLE{C0L0SS3UM}"
				
```

An interactive `shell` (with *gatttool* -style verbs), a stdin `batch` mode, and a `serve` / `send` warm-link daemon are there too when you need to hold one connection across many operations.

## Repeatable Assessment Workflows

Reading and writing handles is the easy part. Caeruleus is built for the next step: turning the ad-hoc “let me check a few things” phase into repeatable, structured assessment. The `recon` subcommand fingerprints the device and audits its GATT tree; the `assess` subcommands each probe one class of weakness:

-   *assess check-auth*: what an unpaired attacker can read (or write)
-   *assess encryption*: whether pairing/encryption requirements are actually enforced
-   *assess dfu*: discover exposed, unauthenticated firmware-update entry points
-   *assess wwr*: write-without-response overflow behavior

Every assessment emits the same JSON shape, `{address, test, summary, findings[]}`, with per-finding severity, handle, uuid, and evidence.

As a bonus, secret-looking values are cross-checked against Praetorian’s [Titus](https://github.com/praetorian-inc/titus) rule set, the same secrets-detection engine we open-sourced separately. A hardcoded API key or private key read over an unpaired link is escalated to a high-severity finding on its own:

```bash
$ caeruleus assess check-auth -b CC:B6:0E:3C:97:0B -o json | jq '.findings[] | select(.severity=="high")'
{
  "title": "Secret readable without authentication",
  "severity": "high",
  "handle": 19,
  "uuid": "00ca0001-bede-ad43-4145-52554c455500",
  "evidence": "6177735f...774a61 (\"aws_access_key_id=AKIADEADBEEFDEADBEEF aws_secret_access_key=wJa\") +37 bytes",
  "detail": "Titus matched rule \"AWS API Credentials\"; value read over an unpaired, unencrypted link."
}
```

And when you find a writable characteristic worth stress-testing, `fuzz write` mutates inputs against it with an on-disk corpus and automatic crash/hang triage, replacing the throwaway *Bleak* harness. `fuzz replay` then reproduces any crash you find:

```bash

					$ sudo caeruleus fuzz write -b CC:B6:0E:3C:97:0B -a 0x0015 --raw --max-iter 20 --max-time 15s
[+] opening session to CC:B6:0E:3C:97:0B
[+] target=0x0002 liveness=0x0002 seeds=13 out=fuzz-out-20260701T144803Z
[+] done iter=2 states=2 queue=2 crashes=1 hangs=0 elapsed=1m2s
[+] results in fuzz-out-20260701T144803Z

$ jq '{mut, op, resp_op, crash}' fuzz-out-20260701T144803Z/crashes/*.json
{
  "mut": "swap",
  "op": "write_req",
  "resp_op": "disconnect",
  "crash": true
}
				
```

## Extensible by design

The *assess* subcommand is built on shared primitives – BLE session management, findings schema, secret detection, structured output. Each assessment is a self-contained file following the same pattern. When your team keeps repeating a manual check, adding it as a new *assess* workflow means writing one Go file and one line in `assess.go` – everyone gets it in the next build, with structured output and agent-drivability included.

## Part of the Praetorian toolkit

Caeruleus integrates Praetorian’s [Titus](https://github.com/praetorian-inc/titus) for secrets detection, and it joins a growing family of open-source offensive tools from Praetorian, including Nerva (service fingerprinting), Vespasian (API discovery), Hadrian (API authorization testing), and Brutus (credential testing). Caeruleus brings that same philosophy, a single binary with structured output and no dependency hell, down to the RF layer.

## Getting started

```bash

					go install github.com/praetorian-inc/caeruleus/cmd/caeruleus@latest
				
```

Or grab a prebuilt release binary from the GitHub repository. You’ll need Linux with BlueZ (*bluetoothd*) and a standard BLE adapter. A handful of raw-socket commands need root. Run caeruleus doctor first to confirm your adapter is healthy, then caeruleus scan to find your target.

Issues and contributions welcome, especially new *assess* workflows.

## What’s Next?

Caeruleus is free, and it’ll take you a long way on its own. But a single binary is one layer of a much bigger picture. A connected device is rarely just its radio surface: there’s the mobile app, the cloud API behind it, the firmware update pipeline, the identity and authorization layer tying it all together, and many more parts. Praetorian understands it all. Our offensive security engineers test connected devices end to end, from the BLE stack up through the backend.

If you’ve got a device — or a fleet of them — that needs more than a point-in-time look, [reach out to Praetorian](https://www.praetorian.com/contact-us/). We’ll bring the same tooling you just installed, plus the people and the platform behind it.

## About the authors

Caeruleus was built by Aaron Wasserman, Will McCardell, Siddhant Kalgutkar, Hunter Ver Helst, and Praetorian’s 5th Legion.

## Frequently Asked Questions

### What is Caeruleus?

Caeruleus is a free, open-source Bluetooth Low Energy (BLE) security testing tool from Praetorian. It is a single Go binary, built on the BlueZ stack for Linux, that covers the whole BLE lifecycle: scanning, enumerating, reading, writing, and notifying characteristics, fuzzing, and running structured security assessment workflows against BLE devices.

### How is Caeruleus different from bettercap, gatttool, and hcitool?

Traditional BLE testing means stitching together deprecated tools like hcitool, bettercap, gatttool, and throwaway Bleak scripts that were never designed to work together and do not emit machine-readable output. Caeruleus consolidates that entire workflow into one binary with consistent commands, structured JSON and JSONL output, and no dependency hell.

### Can AI agents use Caeruleus?

Yes. Caeruleus emits token-efficient structured output with -o json and -o jsonl, and the repository ships a portable Agent Skills-compatible skill that teaches an assistant the command surface and a recommended assessment methodology. In Praetorian’s benchmark, an agent using Caeruleus finished in 62% of the time and 70% of the tokens compared with free tool choice.

### What are the limitations of Caeruleus?

Caeruleus only operates as the central in the Bluetooth LE model, not as a peripheral. It does not sniff BLE traffic, perform active Attacker-in-the-Middle (AITM/MITM) attacks, or clone peripherals. It focuses on making the most common facets of BLE interaction fast, scriptable, and agent-friendly.

### How do I install Caeruleus?

Run `go install github.com/praetorian-inc/caeruleus/cmd/caeruleus@latest`, or grab a prebuilt release binary from the GitHub repository. You need Linux with BlueZ (bluetoothd) and a standard BLE adapter; a handful of raw-socket commands require root. Run caeruleus doctor first to confirm the adapter is healthy, then caeruleus scan to find your target.

The post [Bluetooth Low Energy Security Testing, Consolidated: Introducing Caeruleus](https://www.praetorian.com/blog/ble-testing-caeruleus/) appeared first on [Praetorian](https://www.praetorian.com/).
