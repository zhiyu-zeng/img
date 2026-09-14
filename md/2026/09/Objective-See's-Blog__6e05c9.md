---
title: Objective-See's Blog
source: https://objective-see.org/blog/blog_0x86.html
source_host: objective-see.org
clip_date: 2026-09-14T10:19:25+08:00
trace_id: 8057c83f-f3ce-46aa-ad5e-ba0c7952897a
content_hash: 8768ff2220976a1baabbf4d7dfd14e3cfedbec7fc2e8b7fff37d552f692359a8
status: synced
tags:
  - macOS逆向
  - 安全工具
series: null
feed_source: Objective-See·macOS
ai_summary: macOS 26.4 新增的未公开 Endpoint Security 事件 `RESERVED_5`/`RESERVED_6` 实为网络连接 AUTH 与 NOTIFY，可让防火墙通过 ES 而非 Network Extension 拦截出站连接。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3db75244-d011-811d-bd69-cb264b03f811
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> macOS 26.4 新增的未公开 Endpoint Security 事件 `RESERVED_5`/`RESERVED_6` 实为网络连接 AUTH 与 NOTIFY，可让防火墙通过 ES 而非 Network Extension 拦截出站连接。
> 
> - **事件现状：** macOS 26.4 SDK 只把新事件标为 `ES_EVENT_TYPE_RESERVED_3`~`_6`、无任何注释；实测 `RESERVED_0`~`_2` 订阅失败（result=1，疑似未实现），`_3`~`_6` 订阅成功。
> - **逆向手段：** 以 root 且带 ES 客户端 entitlement 的进程订阅后，打印 `es_message_t` 头与事件原始字节，再借助 Claude 还原出结构体：地址族、解析后 IP、主机名，NOTIFY 额外含 XPC resolver 路径。
> - **事件语义：** `RESERVED_5`（type 153）是 AUTH，连接建立前触发、可放行或拒绝、15 秒响应期限，含目标主机名/IP；`RESERVED_6`（154）是 NOTIFY，连接后触发，可借 resolver 路径识别真正发起进程（如 mDNSResponder 背后的 `com.apple.WebKit.Networking`）。
> - **落地验证：** LuLu 在 macOS 26.4+ 上跳过 Network Extension，实例化 `ESMonitor` 只订阅 153 事件，复用原有规则匹配与用户告警逻辑。
> - **局限与风险：** 事件未文档化、仅 26.4+ 可用且需 Apple 授予 `com.apple.developer.endpoint-security.client`；AUTH 15 秒超时对需用户确认的防火墙偏短；内容检查/代理仍须 Network Extension。另：此前订阅超过 `ES_EVENT_TYPE_LAST` 的事件会触发内核越界读 panic，已在 26.4 修补。

Building a Firewall...via Endpoint Security!?

Reverse Engineering macOS 26.4's Undocumented Network Events

The **Objective-See Foundation** is supported by:

  
  

Special thanks to Luke from [Phorion](https://phorion.io/) for his input/ideas!

### Endpoint Security Events

Each release of macOS brings a host of security fixes, but also the occasional new Endpoint Security events. Such events can extend and improve security tools that already leverage Endpoint Security.

Endpoint Security events can be found in `ESTypes.h` in a large `es_event_type_t` enum. Here are some recent events (with helpful comments from Apple when they were introduced):

```swift
% cat MacOSX26.4.sdk/usr/include/EndpointSecurity/ESTypes.h

// The following events are available beginning in macOS 13.0
    ES_EVENT_TYPE_NOTIFY_XP_MALWARE_DETECTED,
    ES_EVENT_TYPE_NOTIFY_XP_MALWARE_REMEDIATED,
    ES_EVENT_TYPE_NOTIFY_BTM_LAUNCH_ITEM_ADD,
    ES_EVENT_TYPE_NOTIFY_BTM_LAUNCH_ITEM_REMOVE,
    ...

// The following events are available beginning in macOS 15.0
    ES_EVENT_TYPE_NOTIFY_GATEKEEPER_USER_OVERRIDE,

// The following events are available beginning in macOS 15.4
    ES_EVENT_TYPE_NOTIFY_TCC_MODIFY,

```

While new events are often very useful to security tool writers, they may not be well documented, or may not even work as expected. So, when new ones emerge, I like to dig into them and see if they can be used to enhance Objective-See’s free open-source tools.

Previous posts on (new) Endpoint Security events include:

-   [TCCing is Believing: Apple finally adds TCC events to Endpoint Security!](https://objective-see.org/blog/blog_0x7F.html)
    
-   [Writing a Process Monitor with Apple’s Endpoint Security Framework](https://objective-see.org/blog/blog_0x47.html)
    

With the release of macOS 26.4 (and `MacOSX26.4.sdk`), several new events were added, but for the first time ever, they were not documented — just added as “ `ES_EVENT_TYPE_RESERVED_*` ”:

```swift
% cat MacOSX26.4.sdk/usr/include/EndpointSecurity/ESTypes.h
...

    // The following events are available beginning in macOS 26.3

    ES_EVENT_TYPE_RESERVED_0,
    ES_EVENT_TYPE_RESERVED_1,
    ES_EVENT_TYPE_RESERVED_2,


    // The following events are available beginning in macOS 26.4.0

    ES_EVENT_TYPE_RESERVED_3,
    ES_EVENT_TYPE_RESERVED_4,
    ES_EVENT_TYPE_RESERVED_5,
    ES_EVENT_TYPE_RESERVED_6,

```

> Did [@Apple](https://twitter.com/Apple?ref_src=twsrc%5Etfw) forget to update the public Endpoint Security header files in macOS 26.4?  
>   
> New ES events still marked: "ES_EVENT_TYPE_RESERVED\_\*" 😢😤 [pic.twitter.com/gCEpd2yAZU](https://t.co/gCEpd2yAZU)
> 
> — Patrick Wardle (@patrickwardle) [March 25, 2026](https://twitter.com/patrickwardle/status/2036896396893442513?ref_src=twsrc%5Etfw)

As I noted in my tweet, I’m not sure if Apple just left them out by accident …or? 🤷♂️

### ⚙️ Subscribing to Reserved Events

Well, I don’t like unsolved Apple mysteries, so let’s dig in and see what we can figure out. Here, we’ll focus on `ES_EVENT_TYPE_RESERVED_5` and `ES_EVENT_TYPE_RESERVED_6`.

Our goal is simple: understand what these events are, and whether we can use them in our tools.

Though we might have been able to uncover the meaning of these events via static analysis, I took what proved to be a simpler approach:

1.  Subscribe (via `es_subscribe`) to the new ES events and wait for them to be delivered
2.  Print out the raw bytes of the event’s message contents
3.  (non)Profit!

I’ll assume you’re familiar with ES basics, and just dive into the code:

```obj-c
es_event_type_t reservedEvents[] = {
        ES_EVENT_TYPE_RESERVED_0,
        ES_EVENT_TYPE_RESERVED_1,
        ES_EVENT_TYPE_RESERVED_2,
        ES_EVENT_TYPE_RESERVED_3,
        ES_EVENT_TYPE_RESERVED_4,
        ES_EVENT_TYPE_RESERVED_5,
        ES_EVENT_TYPE_RESERVED_6,
};

es_new_client(&client, ^(es_client_t *client, const es_message_t *message) {

    printf("[*] event type: %d\n", message->event_type);
    printf("    action_type: %s\n", message->action_type == ES_ACTION_TYPE_AUTH ? "AUTH" : "NOTIFY");

}

uint32_t reservedCount = sizeof(reservedEvents) / sizeof(reservedEvents[0]);
for(uint32_t i = 0; i < reservedCount; i++) {

        es_event_type_t single[] = { reservedEvents[i] };
        es_return_t result = es_subscribe(client, single, 1);
        printf("RESERVED_%u (type=%d): %s (result=%d)\n", i, reservedEvents[i],
               result == ES_RETURN_SUCCESS ? "subscribed" : "failed", result);
}
```

After declaring the events of interest (all the new `ES_EVENT_TYPE_RESERVED_*` ones) we create an ES client via `es_new_client`. In its callback, we just print out the event type and action type. (Shortly we’ll flesh out this callback more).

Next, in a loop we subscribe to each event, effectively telling the ES subsystem to invoke the callback (passed to `es_new_client`) anytime any of the (yet to be understood) events occur anywhere on the system.

Compiling this code into a binary that is appropriately entitled with `com.apple.developer.endpoint-security.client`, let’s give it a run!

```haskell
# ./newESEvents

RESERVED_0 (type=148): failed (result=1)
RESERVED_1 (type=149): failed (result=1)
RESERVED_2 (type=150): failed (result=1)
RESERVED_3 (type=151): subscribed (result=0)
RESERVED_4 (type=152): subscribed (result=0)
RESERVED_5 (type=153): subscribed (result=0)
RESERVED_6 (type=154): subscribed (result=0)
...


```

Interestingly, for reasons unknown, `ES_EVENT_TYPE_RESERVED_0` - `_2` fail. Maybe they are not yet implemented? However, the remaining ones succeed!

### 🐛 A (Now Patched) Kernel Panic

Previously I (vaguely) tweeted about a kernel panic in Apple’s EndpointSecurity kernel extension:

> Apple: “3rd-party security tools can’t run in the kernel because they might panic.”  
>   
> Also Apple: kicks us out and replaces us with their EndpointSecurity kext...which can be trivially panicked from userland, taking down every security tool + the whole system (macOS 26.3.1)! 🙄 [pic.twitter.com/J1qQ0SrQ4K](https://t.co/J1qQ0SrQ4K)
> 
> — Patrick Wardle (@patrickwardle) [March 6, 2026](https://twitter.com/patrickwardle/status/2029770828062323033?ref_src=twsrc%5Etfw)

As it is now patched (in macOS 26.4), we can discuss it — though as we’ll see, it’s not really a security issue per se, but a rather trivial bug.

A while back I wondered what would happen if you tried to subscribe via `es_subscribe` to events “past” (above) the final ES event `ES_EVENT_TYPE_LAST`:

```obj-c
// ES_EVENT_TYPE_LAST is not a valid event type but a convenience
    // value for operating on the range of defined event types.
    // This value may change between releases and was available
    // beginning in macOS 10.15
    ES_EVENT_TYPE_LAST
} es_event_type_t;
```

Turns out the kernel would simply panic 😱. Specifically, it would detect an attempted out-of-bounds read and invoke `panic`. No real security issue per se (plus, to call `es_subscribe` you have to be an entitled ES client running as root). Still, happy Apple fixed their buggy kernel code!

### 🕵🏻♂️ ES_EVENT_TYPE_RESERVED_5 & ES_EVENT_TYPE_RESERVED_6

Ok, let’s continue!

Recall we’ve registered for `ES_EVENT_TYPE_RESERVED_3` - `_6`. Good news: immediately our callback is invoked, meaning that even though we don’t know what these events are, they’re happening somewhere on the system and being delivered to us.

```
# ./newESEvents

[*] event type: 153
    action_type: AUTH


[*] event type: 154
    action_type: NOTIFY
```

Specifically we first see an `ES_EVENT_TYPE_RESERVED_5` (`153`) event, followed by an `ES_EVENT_TYPE_RESERVED_6` (`154`) event. Endpoint Security events often come in pairs (such as `ES_EVENT_TYPE_AUTH_EXEC` and `ES_EVENT_TYPE_NOTIFY_EXEC`), with one for authorization (that you must respond to), and one passive notify event. Here, we can see the first is an `AUTH`, while the second is a `NOTIFY` event. We can reasonably assume these are the same event type, just one of each flavor.

Now, each ES event message starts with a standard header that contains information about, for example, the responsible process. This is then followed by event-specific data. So even though we don’t know what these events are, we can extend the callback code to print out the standard ES event message header, which tells us what process is responsible for generating the event.

```obj-c
if(message->process) {
    printf("    process pid: %d\n", audit_token_to_pid(message->process->audit_token));
    printf("    process path: %s\n", message->process->executable->path.data);
    printf("    process uid: %d\n", audit_token_to_euid(message->process->audit_token));
    printf("    is platform binary: %d\n", message->process->is_platform_binary);
}
```

Recompiling and rerunning the code, we now get more information about the events:

```
# ./newESEvents

[*] event type: 153
    action_type: AUTH

    process pid: 434
    process path: /usr/sbin/mDNSResponder
    process uid: 65
    is platform binary: 1


[*] event type: 154
    action_type: NOTIFY

    process pid: 434
    process path: /usr/sbin/mDNSResponder
    process uid: 65
    is platform binary: 1
```

We can see first the `ES_EVENT_TYPE_RESERVED_5` (an `AUTH`) event generated by `mDNSResponder`, followed immediately by a `ES_EVENT_TYPE_RESERVED_6` (a `NOTIFY`) event also associated with `mDNSResponder`. (`mDNSResponder` is Apple’s DNS resolution daemon, the system process responsible for all DNS lookups on macOS.)

Now, as noted, after the ES message header (which is the same format for any/all ES messages) comes a pointer to event-specific data. We don’t know the format of this data yet, so let’s just print out the raw bytes:

```obj-c
const uint8_t *raw = (const uint8_t *)&message->event;

uintptr_t ptr = *(uintptr_t *)raw;
printf("    first field as ptr: 0x%lx\n", ptr);

        // validate pointer looks reasonable before dereferencing
        if(ptr > 0x100000000 && ptr < 0x7fffffffffff)
        {
            printf("    ptr contents (first 512 bytes):\n");
            const uint8_t *ptrData = (const uint8_t *)ptr;
            for(int i = 0; i < 512; i++) {
                if(i % 16 == 0) printf("    +0x%03x -> ", i);
                printf("%02x ", ptrData[i]);
                if((i+1) % 16 == 0) {
                    printf("|");
                    for(int j = i-15; j <= i; j++)
                        printf("%c", (ptrData[j] >= 0x20 && ptrData[j] < 0x7f) ? ptrData[j] : '.');
                    printf("|\n");
                }
            }
        }
```

What does this show us?

```
# ./newESEvents
...

[*] event type: 153
    action_type: AUTH
    process pid: 434
    process path: /usr/sbin/mDNSResponder
    process uid: 65
    is platform binary: 1
+0x000: 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x010: 00 00 00 00 e9 14 00 00 02 00 00 00 c0 a8 04 01 |................|
+0x020: 00 00 00 00 00 00 00 00 00 00 00 00 e9 14 00 00 |................|
+0x030: 01 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x070: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x080: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x090: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0a0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0b0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0c0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0d0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0e0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0f0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x100: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x110: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x120: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x130: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x140: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x150: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x160: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x170: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x180: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x190: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x1a0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x1b0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x1c0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x1d0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x1e0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x1f0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
    

[*] event type: 154
    action_type: NOTIFY
    process pid: 434
    process path: /usr/sbin/mDNSResponder
    process uid: 65
    is platform binary: 1
+0x000: 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x010: 00 00 00 00 e9 14 00 00 02 00 00 00 c0 a8 04 01 |................|
+0x020: 00 00 00 00 00 00 00 00 00 00 00 00 e9 14 00 00 |................|
+0x030: 01 00 00 00 11 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x050: 00 00 00 00 00 00 00 00 00 d6 01 00 00 00 00 00 |................|
+0x060: 18 00 00 00 00 00 00 00 00 10 00 00 20 00 08 00 |............ ...|
+0x070: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x080: 00 00 00 00 00 00 00 00 63 6f 6d 2e 61 70 70 6c |........com.appl|
+0x090: 65 2e 57 65 62 4b 69 74 2e 4e 65 74 77 6f 72 6b |e.WebKit.Network|
+0x0a0: 69 6e 67 00 00 00 00 00 38 a4 02 00 00 00 00 00 |ing.....8.......|
+0x0b0: 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x0c0: 00 00 00 00 00 00 00 00 02 00 00 00 08 08 08 08 |................|
+0x0d0: 00 00 00 00 00 00 00 00 00 00 00 00 00 35 00 00 |.............5..|
+0x0e0: 01 00 00 00 11 00 00 00 01 00 00 00 00 00 00 00 |................|
+0x0f0: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x100: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x110: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x120: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x130: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x140: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x150: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x160: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x170: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x180: 00 00 00 00 00 00 00 00 00 00 00 00 00 2f 53 79 |............./Sy|
+0x190: 73 74 65 6d 2f 56 6f 6c 75 6d 65 73 2f 50 72 65 |stem/Volumes/Pre|
+0x1a0: 62 6f 6f 74 2f 43 72 79 70 74 65 78 65 73 2f 49 |boot/Cryptexes/I|
+0x1b0: 6e 63 6f 6d 69 6e 67 2f 4f 53 2f 53 79 73 74 65 |ncoming/OS/Syste|
+0x1c0: 6d 2f 4c 69 62 72 61 72 79 2f 46 72 61 6d 65 77 |m/Library/Framew|
+0x1d0: 6f 72 6b 73 2f 57 65 62 4b 69 74 2e 66 72 61 6d |orks/WebKit.fram|
+0x1e0: 65 77 6f 72 6b 2f 56 65 72 73 69 6f 6e 73 2f 41 |ework/Versions/A|
+0x1f0: 2f 58 50 43 53 65 72 76 69 63 65 73 2f 63 6f 6d |/XPCServices/com|

```

A bunch of flags and numbers (IP addresses?), but in the case of the `NOTIFY` event (which is delivered reactively, after the fact), a few recognizable paths.

Next I simply brain-dumped into Claude, fed it a bunch of the raw output from a sample of the events, and told it to work its magic …which it did!

First, it confirmed these events were likely related to networking (recall the responsible process was often `mDNSResponder`). Moreover, it was able to build a structure for the raw data that honestly seems pretty spot on:

```obj-c
typedef struct {
    uint32_t  address_family;     // 0x00 — AF_INET=2, AF_INET6=30
    uint8_t   padding1[20];       // 0x04
    uint32_t  address_family2;    // 0x18
    uint8_t   resolved_ip[4];     // 0x1c — resolved IP address
    uint8_t   padding2[24];       // 0x20
    uint32_t  hostname_len;       // 0x40 — length of hostname
    uint8_t   padding3[8];        // 0x44 — ptr to something at 0x48
    char      hostname[256];      // 0x50 — null terminated hostname
    // NOTIFY only:
    char   resolver_path[];    // 0xe5+ — XPC resolver path
} es_event_reserved_network_t;
```

Updating our callback code, we can now parse the events 🔥

Here’s the output of running `curl google.com`:

```yaml
# ./newESEvents
...

[*] event type: 153
    action_type: AUTH
    version: 10
    deadline: 260587420990 (15.000 seconds remaining)
    process pid: 3366
    process path: /usr/bin/curl
    process uid: 501
    is platform binary: 1
+0x000: 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
+0x010: 00 00 00 00 00 00 00 00 02 00 00 00 8e fa 49 6e |..............In|
+0x020: 00 00 00 00 00 00 00 00 00 00 00 00 50 00 00 00 |............P...|
+0x030: 00 00 00 00 06 00 00 00 01 00 00 00 00 00 00 00 |................|
+0x040: 0a 00 00 00 00 00 00 00 b8 f3 e5 04 01 00 00 00 |................|
+0x050: 67 6f 6f 67 6c 65 2e 63 6f 6d 00 00 00 00 00 00 |google.com......|
+0x060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 |................|
...
    hostname: google.com
    resolved: 142.250.73.110
    af: IPv4
[*] event type: 154
    action_type: NOTIFY
    version: 10
    process pid: 3366
    process path: /usr/bin/curl
    process uid: 501
    is platform binary: 1
...
    hostname: google.com
    resolved: 142.250.73.110
    af: IPv4
    resolver: /System/Volumes/Preboot/Cryptexes/Incoming/OS/System/Library/Frameworks/WebKit.framework/Versions/A/XPCServices/com.apple.WebKit.Networking.xpc/Contents/MacOS/com.apple.WebKit.Networking

```

At this point we can fairly confidently state the following:

-   `ES_EVENT_TYPE_RESERVED_5` (`153`): **Network Connection AUTH**
    -   Fires before an outbound network connection is made
    -   `AUTH` event that you can allow or deny it
    -   Contains the destination hostname (if DNS-based) or IP (if direct)
    -   Process is the one initiating the connection (`curl`, `mDNSResponder`, etc.)
    -   15 second deadline to respond

…this is efffectively a network firewall hook!

-   `ES_EVENT_TYPE_RESERVED_6` (`154`): **Network Connection NOTIFY**
    -   Fires after the connection attempt completes
    -   NOTIFY only (informational, no allow/deny)
    -   Same struct layout as `153`, plus resolver path
    -   Contains the resolved IP even for hostname-based connections
    -   Includes the XPC resolver path (e.g. `com.apple.WebKit.Networking`) identifying the true originating process when `mDNSResponder` is the ES process

Ok, this is so freaking cool! Why? Because it means we can write network-centric security tools via Endpoint Security! Previously this was only possible via a Network Extension, which was rather complex and required significant user interaction to deploy.

You can read all about Network Extensions in my BlackHat/DefCon talk:  
[Nothing but Net: Leveraging macOS's Networking Frameworks to Heuristically Detect Malware](https://speakerdeck.com/patrickwardle/nothing-but-net-leveraging-macoss-networking-frameworks-to-heuristically-detect-malware)

### 🤯 LuLu via ES!?

To see if this was actually practical, I decided to see if I could add this capability to [LuLu](https://objective-see.org/products/lulu.html), our free, open-source firewall.

The idea was simple: currently LuLu leverages a Network Extension which routes all network flows into LuLu, where it can then apply rules (or ask the user) to only allow authorized network traffic. What would happen if we could just turn LuLu into an Endpoint Security client that subscribes to `ES_EVENT_TYPE_RESERVED_5` (`153`) — the “Network Connection AUTH” event — and obtain network events from this new source?

Turns out it totally worked!

First, in LuLu’s System Extension, if we’re on macOS 26.4+ we instantiate and start a custom `ESMonitor` object:

```obj-c
if(@available(macOS 26.4, *)) {

        os_log_debug(logHandle, "macOS 26.4+ detected, using ES network events");

        ESMonitor *esMonitor = [[ESMonitor alloc] init];
        [esMonitor start];

        // skip NEProvider / sysext entirely
}
```

Next, it simply subscribes to the `ES_EVENT_TYPE_RESERVED_5` event:

```obj-c
es_new_client(&_esClient, ^(es_client_t *client, const es_message_t *msg) {
        [self handleESMessage:msg client:client];
});

es_event_type_t events[] = { ES_EVENT_TYPE_RESERVED_5 };
es_subscribe(_esClient, events, 1);
```

For new network events, it calls the `handleESMessage:client:` method, which extracts the information LuLu needs to find matching rules or prompt the user, specifically the process responsible for the network event, and the remote endpoint.

And that’s basically it! The rest of LuLu is blissfully unaware of where the network event is coming from (e.g. a Network Extension or this new ES event), and happily performs its normal rule matching and user alerting. Neat-o!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7cf5b4a6521e3a11.png)

LuLu, now ES powered!

  

I’m not going to release a version of LuLu that uses this new ES event yet! First, the Network Extension approach is still needed for older versions of macOS. Second, this new ES event is still undocumented by Apple, meaning from their point of view it’s unsupported and subject to change.

### 🤔 Pros and Cons?

Let’s wrap this up with a few notable points to be aware of.

The pros: as of macOS 26.4, Apple’s Endpoint Security can provide just enough information that a complex Network Extension is no longer needed for simple network monitoring tools. That’s cause for celebration!

The cons? There are several, in no particular order:

1.  Network Extensions are still the way to go if your tool needs to examine the contents of packets, or perform more complex networking actions such as traffic proxying or content inspection.
    
2.  This only works on macOS 26.4, and is still undocumented by Apple, who will likely object if you use this in production code.
    
3.  Endpoint Security `AUTH` events have a deadline that must be respected, otherwise macOS will terminate your ES client. For the new `ES_EVENT_TYPE_RESERVED_5` event it’s only 15 seconds. Sure, that’s long enough for an EDR, but likely not for a firewall that has to prompt the user, who might take a while to respond. When the deadline expires, the firewall would have to default to either allowing or denying the connection. Network Extensions, on the other hand, allow you to pause a network event indefinitely, giving the user all the time in the world to respond to a firewall alert.
    
4.  You’ll need Apple to grant you the `com.apple.developer.endpoint-security.client` entitlement. Network Extensions, while also requiring entitlements, allow you to grant yourself the needed entitlement (e.g. `content-filter-provider-systemextension`).
    
5.  The lifecycle of ES AUTH messages is a bit nuanced. For example, if you want to respond to them asynchronously, you’ll have to manually retain and then release them later.
    

* * *

### 👋🏼 Takeaways

macOS 26.4 quietly introduced several undocumented Endpoint Security events. Two of them — `ES_EVENT_TYPE_RESERVED_5` and `ES_EVENT_TYPE_RESERVED_6` — turn out to be network connection AUTH and NOTIFY events respectively, providing hook into all outbound network connections.

By reverse engineering the raw event bytes we were able to reconstruct the undocumented event struct, extracting the destination hostname, resolved IP address, address family, and (in NOTIFY events) the true originating process path. We then validated the approach by successfully wiring these events into LuLu as a drop-in replacement for its Network Extension, allowing LuLu to monitor and enforce network rules entirely via Endpoint Security on macOS 26.4+.

The bottom line: for security tools that need network visibility without the complexity of a full Network Extension, these new ES events are a compelling option — just be aware they are undocumented, carry a 15-second response deadline, and require Apple to grant you the ES client entitlement.

### 💕 Support

Love these blog posts and free tools? You can support them via my [Patreon](https://www.patreon.com/bePatron?c=701171) page!  
  
[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3eacf1e96571c6f7.png)](https://www.patreon.com/bePatron?c=701171)
