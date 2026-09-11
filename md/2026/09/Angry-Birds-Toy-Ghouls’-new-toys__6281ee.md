---
title: "Angry Birds: Toy Ghouls’ new toys"
source: https://securelist.com/toy-ghouls-new-hivemq-and-element-backdoors/121270/
source_host: securelist.com
clip_date: 2026-09-11T10:33:22+08:00
trace_id: 132ad365-78ef-451f-80de-88357c524cda
content_hash: 94401b5da79bb02b0776348788a3e6533b5fe16fdfdc1e1240db3a376c42c18b
status: synced
tags:
  - 恶意样本
  - 协议分析
series: null
feed_source: Kaspersky Securelist
ai_summary: Toy Ghouls 团伙首次启用自研后门，借 HiveMQ MQTT 与 Matrix/Element 信使充当 C2，在俄罗斯目标上实现持久化远控。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3d875244-d011-811a-805c-fea6826cf83f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Toy Ghouls 团伙首次启用自研后门，借 HiveMQ MQTT 与 Matrix/Element 信使充当 C2，在俄罗斯目标上实现持久化远控。
> 
> - **投递方式：** 通过 WinRM（Evil-WinRM、WinRM-fs 等开源工具）把后门及配置文件推送到已失陷主机。
> - **两个变种：** mqtt-bird-agent 0.1.0（HiveMQ 版，服务名 cplsupport）与 matrix-bird-agent 0.1.0（Element 版，服务名 wtass/SynapseAgent）；均支持 `--install`/`install` 注册为 Windows 服务。
> - **配置保护：** 配置默认从程序目录或 %PROGRAMDATA% 读取 config.toml；首次运行用 ChaCha20-Poly1305 部分加密，密钥源自 MachineGuid 注册表值，配置与机器绑定，解密失败即停止运行；Element 版首跑后删除配置文件，改存 HKLM\Software\synapse\Config\SealedConfig。
> - **通信特征：** 启动时请求 ip-api.com 获取公网 IP 与归属国；HiveMQ 版向 broker.hivemq.com:8883 的 status/metrics3/cmd 端点收发状态、CPU/内存/磁盘指标与命令，命令经隐藏 PowerShell（`-NonInteractive -NoProfile -Command`）执行。
> - **Element 版差异：** 使用自建 Matrix 服务器 meet.element.tw，以 m.bird.status/metrics/cmd_response 消息交互，支持 `config:set_interval`（5–3600 秒，写入 metrics_interval）与 `cmd:` 前缀指令，下发账号为 panel-bot。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3a968bf3dc6d6854.jpg)

## Introduction

We continue tracking the activity of Toy Ghouls (also known as Bearlyfy, Laboo.boo, and Feral Wolf), a financially motivated group that has been targeting Russian organizations since 2025. The attackers [initially](https://securelist.ru/tr/toy-ghouls/115909/) relied exclusively on tools pulled from public GitHub repositories along with leaked Babuk and LockBit ransomware builders, later shifting to [their own custom ransomware, GenieLocker](https://securelist.com/genielocker-ransomware-for-windows-linux-and-esxi/120843/). In early July 2026, we observed the group using a custom backdoor for the first time.

We identified two versions of this backdoor: one uses the HiveMQ MQTT broker as its C2 server, while the other relies on the Element messenger. Both versions include “bird” in their names:

-   mqtt-bird-agent 0.1.0 (HiveMQ version)
-   matrix-bird-agent 0.1.0 (Element version)

This post examines how the backdoor is delivered to target systems, how it establishes persistence, and how it communicates with its C2 server.

## Technical details

### Delivery

In this campaign, the attackers use Windows Remote Management (WinRM) to deliver the backdoors and their configuration files to compromised systems. The group relies on open-source tools such as Evil-WinRM and WinRM-fs to do this.

### Installation

The backdoor can both run within an interactive command-line session and establish persistence as a Windows service, using the `--install` or `install` option, depending on the backdoor version. The `--service` (or `service`) option is not available by default and is instead used as an argument for the installed Windows service.

Other launch options are listed in the backdoor’s help output:

```sql
C:\cplsupport.exe -h
Bird Agent - MQTT server monitor
Usage: cplsupport.exe [OPTIONS]

Options:
-c, --config <CONFIG> Path to config.toml config file
--install Install as a system service
--uninstall Uninstall the system service
--seal Encrypt sensitive config fields in-place using a machine-bound key
-h, --help Print help
-V, --version Print version
```

***HiveMQ version backdoor help output***

In the Element version, the backdoor help output looks as follows:

```
C:\wtass.exe -h
Matrix monitoring agent

Usage: wtass.exe [OPTIONS] [COMMAND]

Commands:
  install    Register this agent with the Matrix homeserver and panel
  uninstall  Remove this agent's service and credentials
  service    Run as a Windows service (internal)
  help       Print this message or the help of the given subcommand(s)

Options:
  -c, --config <CONFIG>
  -h, --help             Print help
  -V, --version          Print version
```

***Element version backdoor help output***

By default, the backdoor looks for a `config.toml` configuration file in the directory where the executable was launched, then falls back to %PROGRAMDATA%\\SynapseAgent\\config.toml (Element version) or %PROGRAMDATA%\\cplsupport\\config.toml (HiveMQ version). If no configuration file is found in either location, the full path can be specified using the `-c (--config)` option.

The backdoor accepts both unencrypted configuration files and files with partially encrypted sections. In the first case, once the backdoor is launched, it reads the file and partially encrypts it using the `seal()` function (the `--seal` option in the HiveMQ version), applying the ChaCha20-Poly1305 algorithm with a key derived from the value of the HKLM\\Software\\Microsoft\\Cryptography\\MachineGuid registry key. This means that after the backdoor’s first run, the configuration file becomes bound to that specific machine. On subsequent runs, the configuration is decrypted automatically. If the input configuration was already partially encrypted, it is likewise decrypted automatically.

If the configuration cannot be decrypted, the backdoor stops running.

Encrypted configuration files look as follows:

[![Encrypted backdoor configuration file, HiveMQ version](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fb4235a4f6625bfa.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/09/03141520/toy-ghouls-new-hivemq1.png)

Encrypted backdoor configuration file, HiveMQ version

The encrypted portion of the HiveMQ version’s configuration contains the following parameters:

-   `agent_privkey`: the agent’s private key
-   `channel_id`: the channel identifier used to communicate with the broker
-   `server_pubkey`: the server’s public key

[![Decrypted blob field in the HiveMQ version's configuration](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/117b75ea8709f824.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/09/03141552/toy-ghouls-new-hivemq2.png)

Decrypted blob field in the HiveMQ version’s configuration

In the Element version, the configuration file is deleted immediately after the first run, and the relevant parameters are instead written to the HKLM\\Software\\synapse\\Config\\SealedConfig registry key. On subsequent runs, the backdoor checks the registry for its configuration first.

[![Decrypted Element version configuration file, retrieved from the registry](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b14670b8e177f2c7.png)](https://media.kasperskycontenthub.com/wp-content/uploads/sites/43/2026/09/03141623/toy-ghouls-new-hivemq3.png)

Decrypted Element version configuration file, retrieved from the registry

The Element version’s configuration specifies the address of an Element server controlled by the attackers, a room identifier, and an `access_token` used to access that room. If this parameter is left empty, the backdoor prompts for the password interactively during installation. After successfully creating a session, the backdoor saves the received token to the `blob` field.

### Communication

At startup, both backdoor versions send a GET request to *http://ip-api.com/json* to determine the system’s public IP address and country of origin.

The first version uses the public HiveMQ MQTT broker (*broker.hivemq.com*) as its C2 server. The free tier of this broker supports up to 100 concurrent connections and up to 10 GB of traffic per month. The attackers set up their own cluster and used it both to collect telemetry from compromised systems and to send commands to the backdoor.

-   Once a connection is established, the system’s status is sent via a POST request to broker.hivemq.com:8883/\[cluster_id\]/status. The message format is: {"online":bool,"hostname":"hostname.domain","timestamp":unix_timestamp,"location":{"json"}}.
-   At intervals defined in the configuration file, system information, such as CPU load and available memory, is sent via a POST request to broker.hivemq.com:8883/\[cluster_id\]/metrics3. The message format is: {cpu_percent":float,"mem_used_bytes":int,"mem_total_bytes":int,"disk_used_bytes":int,"disk_total_bytes":int,"load_1m":float,"load_5m":float,"load_15m":float,"uptime_secs":int,"hostname":"hostname.domain","timestamp":unix_timestamp}.
-   The backdoor sends GET requests to broker.hivemq.com:8883/\[cluster_id\]/cmd/req to retrieve commands from the C2 server. The server responds in the format: {"cmd_id":int,"command":"str","timeout_secs":int}.
-   Commands are executed via PowerShell.exe in hidden mode, using the `-NonInteractive -NoProfile -Command` parameters.
-   Command execution results are sent to the command server at broker.hivemq.com:8883/\[cluster_id\]/cmd/res in the {"stdout":"str","stderr":"str","exit_code":int,"duration_ms":int} format.

For the second backdoor version, the attackers set up their own Element server running on the Matrix protocol, *meet.element\[.\]tw*, as the C2 server. On this server, they created a room used to receive messages containing device information and to send commands for execution on the compromised system. The communication flow is as follows:

-   Once a connection is successfully established, the backdoor sends an `m.bird.status` message containing the system’s status. This message format is identical to that used in the HiveMQ version.
-   At intervals defined in the configuration file, information about the compromised system is sent as an `m.bird.metrics` message. Field names are slightly different from those in the first version: {cpu_percent_x100":float,"mem_used_bytes":int,"mem_total_bytes":int,"disk_used_bytes":int,"disk_total_bytes":int,"load_1m_x100":float,"load_5m_x100":float,"load_15m_x100":float,"uptime_secs":int,"hostname":"hostname.domain","timestamp":unix_timestamp}.
-   This version of the backdoor supports two types of commands, distinguished by the start of the received message.
    -   To set a new interval for sending metrics, the attackers send a message beginning with `config:set_interval` (accepting values from 5 to 3600 seconds). The new value is saved to the HKLM\\Software\\SynapseAgent\\metrics_interval registry key.
    -   Messages containing commands to execute begin with the string `cmd:`. Based on data extracted from Element’s SQLite databases on the compromised system, we were able to identify the account name the attackers used to send commands: *panel-bot*.
-   Received commands are executed via the Windows command line interface.
-   Command output is sent as an `m.bird.cmd_response` message. This message format mirrors the one used in the HiveMQ version.

## Takeaways

We have been tracking Toy Ghouls’ activity for quite some time. We previously found that the group had expanded its arsenal with a custom ransomware strain, GenieLocker, and we have now discovered that it has also developed a backdoor capable of giving it full control over an infected device. The new tools use unconventional channels to communicate with their C2 server: the HiveMQ MQTT broker and the Matrix-based Element messenger. This shift away from publicly available open-source projects toward custom-built tools suggests that Toy Ghouls is working to make its attacks more sophisticated and to evade detection for longer.
