---
title: The Smart TV in Your LivingRoom Is a Node in the AIScraping Economy
source: https://blog.includesecurity.com/2026/06/the-smart-tv-in-your-livingroom-is-a-node-in-the-aiscraping-economy/
source_host: blog.includesecurity.com
clip_date: 2026-09-15T10:25:38+08:00
trace_id: 53d3a128-715d-4289-b1ff-0e10f536f2dc
content_hash: 18a6375647ba65d16b7d0ed195676aad5d2fc59053c62b803bcce2fac79aab1a
status: synced
tags:
  - 协议分析
  - 安全工具
series: null
feed_source: Include Security
ai_summary: Bright Data 通过 SDK 把智能电视和手机变成住宅代理出口节点，替 AI 训练数据抓取提供 "干净" 的家庭 IP。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3dc75244-d011-815b-b54d-f029eeb7dc27
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Bright Data 通过 SDK 把智能电视和手机变成住宅代理出口节点，替 AI 训练数据抓取提供 "干净" 的家庭 IP。
> 
> - **CTV 为何最优：** 常供电、24/7 待机、无限带宽、无人看管，且隐私声明只能用遥控器方向键滚动，几乎无人细读；Petflix 弹窗说 "偶尔使用"，配置默认月上限却是 200 GB。
> - **SDK 行为：** 启动即向未认证端点拉取配置（仅校验 appid/ver），随后建立常驻 WebSocket 隧道；服务端下发 `cmd_tun` 抓取任务，客户端持续上报电量、CPU、内存、网络、是否通话等设备状态。
> - **"空闲" 定义：** 配置中 `ignore_screen_on`、`ignore_on_call` 均为 true，`min_battery: 0.2`；即用户亮屏、通话中仍算空闲可转发他人流量。
> - **双通道规避检测：** 控制面用 CFHTTPMessage 绕过 URLSession 类 hook；数据面用 NWConnection 绑定 `en0`/`pdp_ip0`，在 iOS 上直接绕过 VPN 隧道。另已预留 `http3_enabled`（QUIC/UDP 443）。
> - **地区分档与防御：** 乌兹别克斯坦、阿曼可低至 1% 电量转发（日 1 GB/月 30 GB），卡塔尔、阿联酋被限至 40 MB/日；防御可 DNS 封堵 proxyjs.\*、SNI 过滤 \*.brdtnet.com/\*.luminatinet.com、证书指纹匹配，或用 MDM 扫描 Swift 符号 BrdWebSocketFacade。Bright Data 回应称 VPN 绕过属 bug 并已修复。

The work at Include Security has us working with AI day in and day out (hacking it, using it, training it, etc).

We’re all aware of the community-level opposition happening against datacenters, aimed at improving AI capabilities, being built recently. What you might not be aware of are the distributed efforts to train AI that could be using the devices inside your home.

In this post, we’re going to explore how the company Bright Data facilitates modern AI models [scraping training data from the Internet](https://brightdata.com/blog/web-data/web-scraping-for-machine-learning) using its residential proxy network.  
  
Bright Data is a data-collection company that sells access to what it markets as the world’s largest residential proxy network of 400M+ home IP addresses that its customers route web-scraping traffic through. The supply behind that network comes from an SDK: a piece of software embedded in consumer apps that, with the user’s consent, turns their phone or smart TV into one of those exit nodes.  
  
We’ll document what you, the average user, should know about what this company’s SDK does on your systems such as your mobile phone and your smart TV. We’re going to explore how their SDK works, which platforms have shipped it, and why your Internet-connected TV is the ultimate proxy for AI models looking to train on data scraped from the Internet.

### Why This Matters Now

AI companies depend on web-scraped content: for pre-training, for retrieval, for agent grounding, for search. But the modern web isn’t scrapeable from a datacenter. [Cloudflare, DataDome, HUMAN](https://datadome.co/bot-management-protection/how-proxy-providers-get-residential-proxies/), among others throttle or block requests from known cloud IPs.

The workaround is residential proxies. A scraping job routed through a Comcast or T-Mobile subscriber’s connection arrives at the target site from an IP that belongs to a paying residential customer. Krebs [reported in October 2025](https://krebsonsecurity.com/2025/10/aisuru-botnet-shifts-from-ddos-to-residential-proxies/) that *“a glut of proxies from Aisuru and other sources is fueling large-scale data harvesting efforts tied to various AI projects.”* [Academic measurement](https://ieeexplore.ieee.org/document/8835239) going back to 2019 shows these networks are overwhelmingly misused. The FBI issued [a formal advisory](https://www.fbi.gov/investigate/cyber/alerts/2026/evading-residential-proxy-networks-protecting-your-devices-from-becoming-a-tool-for-criminals) earlier this year.

Most of the existing press has focused on the **illegal** residential-proxy supply: botnets ([Aisuru](https://krebsonsecurity.com/2025/10/aisuru-botnet-shifts-from-ddos-to-residential-proxies/), [Kimwolf](https://krebsonsecurity.com/2026/01/the-kimwolf-botnet-is-stalking-your-local-network/)), trojanized apps ([HUMAN Security’s PROXYLIB disclosure](https://www.humansecurity.com/learn/blog/satori-threat-intelligence-alert-proxylib-and-lumiapps-transform-mobile-devices-into-proxy-nodes/)), pre-infected IoT hardware ([Google/Mandiant’s IPIDEA takedown](https://cloud.google.com/blog/topics/threat-intelligence/disrupting-largest-residential-proxy-network)). These are the bad actors.

On the other hand, the legal supply side has received far less scrutiny. Today Bright Data is the largest residential proxy network in the world by its own marketing, advertising “150M+ IPs” sourced via a consent SDK embedded in partner apps. Now let’s get into the details of how the SDK works and on which platforms to understand why the connected-TV is the ultimate residential proxy.

### Why Connected TV (CTV) is the Ideal Proxy

Connected TV, a.k.a Smart TV, is a near-perfect residential proxy. Compared to a mobile phone:

|     |     |     |
| --- | --- | --- |
| **Factor** | **Mobile phone** | **Smart TV / CTV** |
| Power | Battery most of the day | Always plugged in |
| Network | WiFi + cellular | Always WiFi, high-speed |
| Uptime | Intermittent | 24/7 in standby |
| Bandwidth ceiling | Low (cellular caps) | Effectively unlimited |
| User attention | Actively used | Often unattended |
| Consent UI | Text on a phone screen | Text navigated via TV remote arrow keys |
| Corporate/family oversight | Higher (MDM, mobile EDR) | Virtually none |

A TV never hits 1% battery, jumps between WiFi networks or gets locked when the user is asleep. We’ve found publishers have disclosed the Bright Data relationship in their privacy policies, [PlayWorks is one example](https://play.works/privacy-policy). From the consumer point of view these notices can be missed as it is hard to scroll through a legal document navigated by arrow keys on a TV remote.

Petflix, a Roku app [documented by The Verge](https://www.theverge.com/column/885244/smart-tv-web-crawler-ai), is a representative case. Its opt-in screen reads: *“To enjoy Petflix for free with fewer ads, you are allowing Bright Data to occasionally use your device’s free resources and IP address to download public web data from the internet. Bright Data will only use your IP address for approved business-related use cases. None of your personal information is accessed or collected except your IP address. Period.”* The Petflix dialog says “occasionally.” The SDK’s publicly queryable config sets `max_bw_monthly_wifi: 200,000,000,000` bytes — a 200 GB default monthly maximum WiFi traffic limit.

**Who Bright Data Names as Partners**

Bright Data exposes a partner manifest endpoint. The endpoint is unauthenticated and anyone can fetch it. Names in the manifest that I was able to identify with high confidence from public sources:

|     |     |     |
| --- | --- | --- |
| **Partner ID (from config)** | **Entity** | **Scale** |
| playworks_digital | **PlayWorks Digital Ltd** | [400+ CTV game titles; reach ~250M TV homes via Comcast, Sky, Cox, LG, Samsung, Vizio, Roku](https://play.works/) |
| cloudtv | **CloudTV** | [Integrated across 125+ TV brands and 15+ OEMs](https://www.cloudtvos.com/applications.php) |
| longvision_media_hong_kong_co_limited | **Longvision Media HK (LongTV)** | [5M OTT users across HK and Malaysia](https://hk.long.tv/) |
| viber_media_s_r_l | **Viber Media S.à r.l. (Rakuten)** | [250M–820M monthly users of the Viber messenger](https://earthweb.com/viber-statistics/) |
| supercent_inc | **Supercent** (Korea) | [#1 Korean mobile publisher by downloads in 2023](https://en.supercent.io/about) |
| moonfrog_labs_private_limited | **Moonfrog Labs** (Stillfront subsidiary) | [~10M MAU on Teen Patti Gold alone; acquired for $90M](https://inc42.com/buzz/sweden-based-stillfront-acquires-teen-patti-creator-moonfrog-labs/) |
| hola_networks | **Hola Networks** | Bright Data’s lineage parent; user base reported in the tens to ~100M+ range at peak per Hola’s own historical marketing |

Others (`desoline, free_time, ott_studio, global_microtrading, m_m_media, easystaff_lp`) are present but less identifiable from public sources. `bright_screensavers, bright_videos`, and `brightdata` are Bright Data’s own apps.

A note on what the partner list proves: Being listed in Bright Data’s config means an integration might have existed at some point. It does *not* by itself prove that a specific publisher’s currently-shipping app(s) includes the SDK in production. For any named publisher, per-app verification is required.

What the partner list *does* directly prove:

1.  Bright Data ships this roster in an **unauthenticated public endpoint**.
2.  At least three CTV-focused entities (PlayWorks, CloudTV, Longvision) monetized their user’s devices as residential proxy exit nodes. PlayWorks in particular reports CTV distribution across major TV platforms and ISPs, with reach figures in the hundreds of millions of households per its own marketing materials.

### How does the Bright Data SDK turn a user’s device into a residential proxy exit node?

The Bright Data SDK is a publicly documented commercial product, offered to publishers via Bright Data’s [SDK integration docs](https://docs.brightdata.com/api-reference/SDK) (with a [JavaScript variant](https://docs.brightdata.com/api-reference/SDK-JS) for web). What follows builds on that public surface with findings from reverse-engineering the shipping iOS framework and instrumenting 30 days of its runtime traffic.

The SDK ships as an iOS framework (brdsdk.framework) inside partner apps. I reverse-engineered the binary and captured 30 days of traffic from a research fleet running the SDK inside a consent-installed partner app.

#### The Unauthenticated Config

On every launch the SDK calls:

`GET <https://clientsdk.bright-sdk.com/sdk_config_ios.json>?appid=<bundle>&ver=<sdk-version>&uuid=sdk-ios-<32hex>`

The endpoint is unauthenticated in any meaningful sense. The server gates only on two query parameters `appid` (an app bundle ID, which can be found in the App Store listing of the partner app) and `ver` (the SDK version string). Supply those and any randomly generated UUID, and the server returns the same response a real device gets: feature flags, idle-detection thresholds (battery %, CPU/memory ceilings, WiFi-vs-cellular rules), per-country bandwidth tiers, and the partner manifest I showcased above. Each of these branches is worth examining on its own: the idle rules that decide when your device is eligible to relay, a flag that routes peer traffic around your VPN, a map that stitches your installs across platforms into one identity, and the per-country bandwidth caps.

#### The Peer Tunnel

After config fetch, the SDK opens a persistent WebSocket to:

`wss://proxyjs.brdtnet.com:443`

This hostname resolves to AWS Global Accelerator IPs (3.33.193.183, 15.197.193.114 as of this writing). The TLS certificate is `CN=*.luminatinet.com` — the domain for Luminati Networks, Bright Data’s pre-2018 corporate name. The [rebrand was publicly announced in 2018](https://brightdata.com/blog/why-brightdata/why-we-changed-our-name-from-luminati-networks-to-bright-data). Active SDK infrastructure still runs on the legacy cert, which is a useful detection pivot: the current customer-facing proxy service lives on brightdata.com-branded domains, so any luminatinet.com / brdtnet.com traffic on your network is specifically the peer-tunnel plane, not customer-side Bright Data usage. The server identifies itself as `uWebSockets: 20`.

The peer endpoint requires no authentication to upgrade. The server accepts any TLS-valid WebSocket upgrade and immediately pushes the connecting client an application-layer frame with the client’s public IP echoed back. From there, a handshake unfolds:

1.  **Server → client: tunnel_init** establishes the session, returns the client’s public IP.
2.  **Server → client: cid_set** the server assigns the client a session-tracking identifier in the format `<IP>-<token>/ls<N>c<M>p443_<IP>_<counter>`. We confirmed this format matches the cid field present in the SDK’s captured telemetry traffic from real devices.
3.  **Server → client: status_get** the server polls the device for its idle state, battery, network type, and available bandwidth. The device responds with a continuous telemetry feed: `idle, wifi_connected, mobile_connected, mobile_type` (LTE/5G), `roaming, battery_level, using_battery, screen_on, on_call, cpu_usage, mem_usage, raw_bw, bw, ipv6_supported, appid` (the host app), `sdk_version, platform`, and the assigned `cid`. This is a continuous feed of physical-device state to a third party, delivered via a consent dialog whose text is chosen by the host app publisher.
4.  **Handshake complete.** Once the device reports favorable status, the server’s job-matching layer is free to push `cmd_tun` frames: individual scraping-job instructions that the SDK executes as HTTP requests against third-party sites, using the user’s residential IP as the source.

Every frame on the WebSocket is plain JSON with a fixed envelope:

`{"type": "ipc_call"|"ipc_post"|"ipc_result"|"ipc_error",   "cmd":  <command>, "cookie": <correlation-id>,   "err_code": 0, "msg": { ...payload... }}`

The full command vocabulary extracted from the binary and verified on the wire:

|     |     |     |
| --- | --- | --- |
| **Direction** | **Command(cmd)** | **Purpose** |
| Server → Client | tunnel_init | Open session, echo public IP |
| Server → Client | cid_set | Assign session identifier |
| Server → Client | status_get | Poll device idle/battery/bandwidth |
| Server → Client | cmd_tun / tun | Dispatch a scraping job |
| Server → Client | dns | Request DNS resolution of a target |
| Server → Client | consent | Request consent state |
| Client → Server | status_send | Periodic heartbeat with device state |
| Client → Server | tun_report / tun_ack / tun_fin | Relay-job lifecycle responses |
| Client → Server | tunnel_init_decline | Decline a session |
| Client → Server | logs | Ship diagnostic logs to server |

The peer websocket connection uses TLS, however it does not incorporate message signing, HMAC, client certificate or device attestation. The server’s IP-reputation filter gates which peers receive scraping jobs.

#### When the SDK considers you “idle”

The config ships an explicit rulebook for when the device is eligible to relay someone else’s traffic:

`"idle_metrics": {     "ignore_screen_on": true,      // relay even with the screen on     "ignore_on_call": true,        // relay while the user is on a phone call     "max_bw_ratio": 1,     "min_battery": 0.2,     "wifi_on_battery": true,     "min_battery_wifi": 0.2,     "max_cpu_usage": 70,     "max_mem_usage": 90,     "mem_screen_off": true,     "idle_timeout": 30,     "not_idle_timeout": 10   }`

The ignore_screen_on and ignore_on_call flags are notable: “idle” does not mean the user is away from the device. It means the device’s CPU, memory, and battery are within the SDK’s thresholds. A user on a phone call, actively reading the screen, is considered idle for relay purposes.

#### Cross-Platform Identity Linkage

The config also ships a dual_pairing map:

`` `**"dual_pairing":** {     "ios_com.brd.earnapp": ["win_earnapp.com", "mac_com.earnapp"]   }` ``

That’s a server-side map tying a user’s iOS, Windows, and macOS installations of the same brand into one entity. It’s cross-platform identity stitching documented inside a public config file.One more forward-looking field: http3_enabled: true. The SDK is already shipping the flag for QUIC-based peer transport. A future version may move the peer tunnel from TCP/443 to UDP/443, which would break any defender relying on TCP connection tracking to detect the WebSocket.

#### The Inspection Bypass

The SDK’s config ships a flag “use_netifs”: true. That flag triggers code in the SDK binary that constructs its NWConnection with a specific required interface: `en0` (WiFi) or `pdp_ip0` (cellular), rather than using the system default route.

**On iOS, this bypasses any configured VPN’s tun0 interface entirely.** The peer tunnel does not cross a user-configured VPN, even when the rest of the app’s HTTPS traffic does.

We observed this empirically. My research setup includes transparent TLS interception. It captured every HTTPS call the SDK made, except the peer tunnel to proxyjs.brdtnet.com:443, even though port 443 is explicitly redirected to the inspector. The bypass uses Apple’s documented NWParameters.requiredInterface API.

It’s worth emphasizing that the SDK uses **two independent inspection bypasses**, one per plane:

-   **Control plane** (config fetch, telemetry pings): built on CFNetwork’s CFHTTPMessage primitives rather than URLSession/NSURLConnection. This defeats URLSessionlevel instrumentation (swizzling, network extensions, URLProtocol subclasses) commonly used in mobile app-sec tooling, while still respecting the system proxy and so remaining visible to TLS-intercepting researchers.
-   **Data plane** (peer tunnel): built on NWConnection with requiredInterface set to the physical interface. This is what defeats VPNs and ensures the scraping is executed from a residential IP.

Both choices are legitimate Apple APIs. The combination is the interesting artifact: the data plane is invisible to VPN-based inspection *and* the control plane is invisible to URLSession-based hooks. Researchers who rely on either single technique see only half the SDK’s behavior.

### The geography tiers

The config ships per-country bandwidth thresholds. Four countries get explicit non-default policies:

|     |     |     |     |
| --- | --- | --- | --- |
| **Country** | **Min battery to relay** | **Daily cap** | **Monthly cap** |
| **Uzbekistan** | **1%** | 1 GB | 30 GB |
| **Oman** | **1%** | 1 GB | 30 GB |
| Qatar | 20% | 40 MB | 250 MB |
| UAE | 20% | 40 MB | 250 MB |
| default (worldwide) | 20% | 50 MB | 500 MB |

Looking at the config, Uzbekistan and Oman devices are permitted to relay down to **1% battery**, with daily caps 20× the default and monthly caps 60× the default. Qatar and UAE devices are throttled *below* default. We can only speculate as to why the tiers are drawn this way. One reading is deliberate market segmentation, relaxing limits where grid power is stable and throttling where mobile data is expensive. The default-worldwide allowance still permits **500 MB of someone else’s traffic per month** over the user’s home internet.

### Testing Setup and Methodology

Data sources:

1.  **Thirty days of TLS-inspecting proxy captures** from iOS device running consent-installed partner apps (including XYO COIN, which embeds the Bright SDK).
2.  **Static analysis of the SDK binary** (brdsdk.framework, version 1.532.120, iOS arm64).

All specific Bright Data hostnames, cert fingerprints, and TLS infrastructure described are publicly observable by anyone making the same requests. No session-specific identifying data from either the research fleet or the research client appears in this document.

### Communication & Action Timeline

-   **May 11, 2026** – Email notice sent to privacy@brightdata.com (which is the email address referenced on their legal [Privacy notices page](https://brightdata.com/privacy) and their [Trust and Safety portal](https://brightdata.com/trustcenter/privacy-policy-overview-bright-data)) notifying their team about the release of this blog post. No response to the notification has been received at the time of this article’s publishing.
-   **Jun 5, 2026** – Blog post released
-   **June 8, 2026** – Email received from Bright Data PR and Communications department containing feedback about this post’s content. A link to a [report created by PwC](https://brightdata.com/trustcenter/pwc-report) was also included. IncludeSec made one small change to the blog post as a result of their additional information that seemed appropriate.
-   **June 11, 2026** – IncludeSec made additional small changes to be more specific.
-   **June 17, 2026** – Adding this response provided by Bright Data’s PR lead Jennifer Burns: *“Bright Data is a consent-based network where every peer explicitly opted in on a dedicated plain-language screen, every partner app passes a mandatory compliance review, every customer is vetted through live KYC, and our practices are scrutinized by independent auditors and security companies. We are intentionally discoverable and therefore accountable. We want to acknowledge one finding directly: the iOS VPN bypass behavior identified in this research is a bug and is fixed.”*

### Defense Approaches

The traffic leaves clear fingerprints at the network boundary, and the SDK leaves identifiable symbols in the app binary. The approaches below let you detect and block the peer tunnel — at the network level or on the device itself. Three approaches, ordered by ease of deployment:

**Approach 1: DNS block** (trivial, effective for network-routed devices):

proxyjs.brdtnet.com  
proxyjs.luminatinet.com  
proxyjs.bright-sdk.com  
clientsdk.bright-sdk.com  
clientsdk.brdtnet.com

Blocking proxyjs.\* kills the peer tunnel without affecting any customer who legitimately uses Bright Data’s customer-facing proxy service on a different domain.

**Approach 2: TLS SNI filtering:** Drop or alert on TLS handshakes where server_name matches \*.brdtnet.com, \*.luminatinet.com, or \*.luminati.io. Works at the network boundary without TLS inspection.

**Approach 3: TLS certificate fingerprint:**

-   .brdtnet.com → SHA256 313ce4ec7d5a51e5…
-   .luminatinet.com → SHA256 5028612e625befea…

Stable until Sectigo cert rotation (current certs valid through mid-2026).

**The use_netifs caveat:** All three layers only work on traffic that crosses your network boundary. The SDK’s use_netifs binding means that on iOS, when the device is on cellular, peer traffic bypasses corporate WiFi entirely. For managed fleets, the complementary control is MDM-based app binary scanning: search installed apps for the Swift symbols BrdWebSocketFacade and BrdNetwork.DNSResolver, and prohibit apps containing them on corporate-issued devices.

For household users concerned about a specific smart TV or mobile app: block the hostnames above at your router’s DNS settings (Pi-hole, NextDNS, Cloudflare Gateway, your ISP’s equivalent).  
  
—

This blog post was written in partnership with our guest author and independent security researcher Buchodi.

The post [The Smart TV in Your LivingRoom Is a Node in the AIScraping Economy](https://blog.includesecurity.com/2026/06/the-smart-tv-in-your-livingroom-is-a-node-in-the-aiscraping-economy/) appeared first on [Include Security Research Blog](https://blog.includesecurity.com/).
