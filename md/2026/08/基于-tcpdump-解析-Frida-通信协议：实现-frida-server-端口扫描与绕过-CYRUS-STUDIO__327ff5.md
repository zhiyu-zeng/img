---
title: 基于 tcpdump 解析 Frida 通信协议：实现 frida-server 端口扫描与绕过 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E5%9F%BA%E4%BA%8E-tcpdump-%E8%A7%A3%E6%9E%90-frida-%E9%80%9A%E4%BF%A1%E5%8D%8F%E8%AE%AE%E5%AE%9E%E7%8E%B0-frida-server-%E7%AB%AF%E5%8F%A3%E6%89%AB%E6%8F%8F%E4%B8%8E%E7%BB%95%E8%BF%87/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:14:31+08:00
trace_id: 35b1f1dd-968f-4c4e-8cc8-15f130af456c
content_hash: 4b45492617c6146cab08c3e847fae526cffac5a2cd841e076e8d8f9ac078b956
status: synced
tags:
  - Frida
  - 协议分析
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: Frida 16+ 通信协议从 AUTH/REJECT 切换为 WebSocket，可通过发送握手请求并识别 HTTP/1.1 101 + Upgrade 特征实现高精度 frida-server 端口扫描；hook sendto 拦截 GET /ws 请求即可绕过检测。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3b275244-d011-819b-9ff7-f9c3d73ece4d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 16+ 通信协议从 AUTH/REJECT 切换为 WebSocket，可通过发送握手请求并识别 HTTP/1.1 101 + Upgrade 特征实现高精度 frida-server 端口扫描；hook sendto 拦截 GET /ws 请求即可绕过检测。
> 
> - **协议变化：** Frida 16+ 废除旧版 AUTH/REJECT 认证流程，客户端先发 "GET /ws HTTP/1.1" WebSocket 握手，并在头字段携带 "User-Agent: Frida/16.7.19" 作为明确指纹。
> - **检测方法：** Android 端用非阻塞 connect + select 遍历 127.0.0.1 的 1~65535 端口，对可连接端口发送 WebSocket 握手，响应同时含 "HTTP/1.1 101"、"Upgrade: websocket"、"Connection: Upgrade"、"Sec-WebSocket-Accept" 即判定为 frida-server。
> - **抓包验证：** 使用 `tcpdump -i lo -nn -s 0 -XX port 1234` 可完整观察握手流程，frida-server 返回 166 字节的 HTTP 101 响应；再用 `ss -ltnp | grep 1234` 确认端口被 frida-server 进程占用。
> - **绕过原理：** libc 中 send/recv 实际调用 sendto/recvfrom，通过 Frida hook "libc.so" 的 sendto，当数据包含 "GET /ws HTTP/1.1" 时直接返回 -1 模拟发送失败，即可阻断检测握手。
> - **实战效果：** 运行 frida_ws_handshake_bypass.js 后日志连续输出 "[Bypass] block ws handshake"，Frida 仍可正常连接 127.0.0.1:1234 并完成注入，成功绕过端口特征检测。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在 Android 逆向对抗中，Frida 检测始终是核心对抗点之一。

常见检测思路包括：

具体参考： [Frida 检测与对抗实战：进程、maps、线程、符号全特征清除](https://cyrus-studio.github.io/blog/posts/frida-%E6%A3%80%E6%B5%8B%E4%B8%8E%E5%AF%B9%E6%8A%97%E5%AE%9E%E6%88%98%E8%BF%9B%E7%A8%8Bmaps%E7%BA%BF%E7%A8%8B%E7%AC%A6%E5%8F%B7%E5%85%A8%E7%89%B9%E5%BE%81%E6%B8%85%E9%99%A4/)

早期方案通常通过扫描固定端口（如 27042），或者 AUTH/REJECT 协议特征来识别 frida-server，例如：

[https://github.com/muellerberndt/frida-detection/blob/master/AntiFrida/app/src/main/cpp/native-lib.cpp](https://github.com/muellerberndt/frida-detection/blob/master/AntiFrida/app/src/main/cpp/native-lib.cpp)

但在实际对抗中，存在两个明显问题：

1.  端口可自定义：frida-server 可运行在任意端口，固定端口扫描失效
    
2.  协议已演进：在 Frida 16+ 中，通信协议已从 AUTH/REJECT 切换为 WebSocket，原有特征完全失效
    

因此，本文从协议层入手，通过 tcpdump 抓包分析新版 Frida 的通信机制，提取稳定特征，并最终实现一个 **高精度 Frida 端口检测方案**。

## 使用 tcpdump 抓取本地 socket 通信

tcpdump 是一个基于 libpcap 的命令行抓包工具，用于捕获和过滤网络数据包，常用于网络调试、协议分析和安全研究。

相关链接

-   官方网站（源码发布 / 文档）： [https://www.tcpdump.org](https://www.tcpdump.org/)
    
-   tcpdump GitHub 仓库： [https://github.com/the-tcpdump-group/tcpdump](https://github.com/the-tcpdump-group/tcpdump)
    
-   libpcap GitHub 仓库（依赖库）： [https://github.com/the-tcpdump-group/libpcap](https://github.com/the-tcpdump-group/libpcap)
    
-   Android 预编译版本参考： [https://www.androidtcpdump.com/](https://www.androidtcpdump.com/)
    

抓本地指定端口 socket 数据

```
tcpdump -i lo -nn -s 0 -A port 27042
```

说明：

-   \-i lo：抓本地回环（frida-server 必须）
    
-   \-A：以 ASCII 打印（可直接看到 AUTH / REJECT）
    
-   \-s 0：完整包
    

```
tcpdump -i lo -nn -s 0 -XX port 27042
```

-   \-X → hex + ASCII
    
-   \-XX → 更完整（含链路层）
    

## Frida 通信协议分析（16+）

抓包后，可以清晰看到完整通信流程：

```yaml
vangogh:/ # tcpdump -i lo -nn -s 0 -XX port 1234
tcpdump: verbose output suppressed, use -v or -vv for full protocol decode
listening on lo, link-type EN10MB (Ethernet), capture size 262144 bytes

// TCP 三次握手：客户端发送 SYN，请求连接 frida-server（1234 端口）
// Flags [S] SYN（建立连接）
12:19:07.151301 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [S], seq 3435625590, win 65535, options [mss 65495,sackOK,TS val 976962460 ecr 0,nop,wscale 9], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  003c 7baa 4000 4006 c10f 7f00 0001 7f00  .<{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7c76 0000 0000 a002  ........|v......
        0x0030:  ffff fe30 0000 0204 ffd7 0402 080a 3a3b  ...0..........:;
        0x0040:  439c 0000 0000 0103 0309                 C.........

// frida-server 返回 SYN+ACK，确认连接
12:19:07.151574 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [S.], seq 3788896212, ack 3435625591, win 65535, options [mss 65495,sackOK,TS val 976962461 ecr 976962460,nop,wscale 9], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  003c 0000 4000 4006 3cba 7f00 0001 7f00  .<..@.@.<.......
        0x0020:  0001 04d2 b40d e1d5 f7d4 ccc7 7c77 a012  ............|w..
        0x0030:  ffff fe30 0000 0204 ffd7 0402 080a 3a3b  ...0..........:;
        0x0040:  439d 3a3b 439c 0103 0309                 C.:;C.....

// 客户端 ACK，三次握手完成
12:19:07.151756 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [.], ack 1, win 128, options [nop,nop,TS val 976962461 ecr 976962461], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bab 4000 4006 c116 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7c77 e1d5 f7d5 8010  ........|w......
        0x0030:  0080 fe28 0000 0101 080a 3a3b 439d 3a3b  ...(......:;C.:;
        0x0040:  439d                                     C.

// 客户端发送 HTTP 请求（Frida 16+ 使用 WebSocket 而不是 AUTH/REJECT）
// "GET /ws HTTP/1.1" → WebSocket 握手路径
// "Upgrade: websocket"
// "Connection: Upgrade"
// "Sec-WebSocket-Key"
// "User-Agent: Frida/16.7.19" → 明确指纹（关键特征）
12:19:07.157053 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [P.], seq 1:178, ack 1, win 128, options [nop,nop,TS val 976962466 ecr 976962461], length 177
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  00e5 7bac 4000 4006 c064 7f00 0001 7f00  ..{.@.@..d......
        0x0020:  0001 b40d 04d2 ccc7 7c77 e1d5 f7d5 8018  ........|w......
        0x0030:  0080 fed9 0000 0101 080a 3a3b 43a2 3a3b  ..........:;C.:;
        0x0040:  439d 4745 5420 2f77 7320 4854 5450 2f31  C.GET./ws.HTTP/1
        0x0050:  2e31 0d0a 5570 6772 6164 653a 2077 6562  .1..Upgrade:.web
        0x0060:  736f 636b 6574 0d0a 436f 6e6e 6563 7469  socket..Connecti
        0x0070:  6f6e 3a20 5570 6772 6164 650d 0a53 6563  on:.Upgrade..Sec
        0x0080:  2d57 6562 536f 636b 6574 2d4b 6579 3a20  -WebSocket-Key:.
        0x0090:  5558 665a 3154 7644 534b 6a50 484f 306c  UXfZ1TvDSKjPHO0l
        0x00a0:  382f 526c 2f77 3d3d 0d0a 5365 632d 5765  8/Rl/w==..Sec-We
        0x00b0:  6253 6f63 6b65 742d 5665 7273 696f 6e3a  bSocket-Version:
        0x00c0:  2031 330d 0a48 6f73 743a 2031 3237 2e30  .13..Host:.127.0
        0x00d0:  2e30 2e31 0d0a 5573 6572 2d41 6765 6e74  .0.1..User-Agent
        0x00e0:  3a20 4672 6964 612f 3136 2e37 2e31 390d  :.Frida/16.7.19.
        0x00f0:  0a0d 0a                                  ...

// 服务端 ACK（确认收到）
12:19:07.157284 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [.], ack 178, win 131, options [nop,nop,TS val 976962466 ecr 976962466], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 557b 4000 4006 e746 7f00 0001 7f00  .4U{@.@..F......
        0x0020:  0001 04d2 b40d e1d5 f7d5 ccc7 7d28 8010  ............}(..
        0x0030:  0083 fe28 0000 0101 080a 3a3b 43a2 3a3b  ...(......:;C.:;
        0x0040:  43a2     

// frida-server 返回 HTTP 101  
// "HTTP/1.1 101 Switching Protocols"
// WebSocket 升级成功
12:19:07.158770 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [P.], seq 1:167, ack 178, win 131, options [nop,nop,TS val 976962468 ecr 976962466], length 166
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  00da 557c 4000 4006 e69f 7f00 0001 7f00  ..U|@.@.........
        0x0020:  0001 04d2 b40d e1d5 f7d5 ccc7 7d28 8018  ............}(..
        0x0030:  0083 fece 0000 0101 080a 3a3b 43a4 3a3b  ..........:;C.:;
        0x0040:  43a2 4854 5450 2f31 2e31 2031 3031 2053  C.HTTP/1.1.101.S
        0x0050:  7769 7463 6869 6e67 2050 726f 746f 636f  witching.Protoco
        0x0060:  6c73 0d0a 4461 7465 3a20 5468 752c 2030  ls..Date:.Thu,.0
        0x0070:  3220 4170 7220 3230 3236 2030 343a 3139  2.Apr.2026.04:19
        0x0080:  3a30 3720 474d 540d 0a55 7067 7261 6465  :07.GMT..Upgrade
        0x0090:  3a20 7765 6273 6f63 6b65 740d 0a43 6f6e  :.websocket..Con
        0x00a0:  6e65 6374 696f 6e3a 2055 7067 7261 6465  nection:.Upgrade
        0x00b0:  0d0a 5365 632d 5765 6253 6f63 6b65 742d  ..Sec-WebSocket-
        0x00c0:  4163 6365 7074 3a20 4e31 454c 7442 5039  Accept:.N1ELtBP9
        0x00d0:  5776 3468 5a74 734b 312b 5336 742f 3966  Wv4hZtsK1+S6t/9f
        0x00e0:  544c 413d 0d0a 0d0a                      TLA=....

// 客户端确认收到 frida-server 前面 166 字节数据包
12:19:07.158989 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [.], ack 167, win 131, options [nop,nop,TS val 976962468 ecr 976962468], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bad 4000 4006 c114 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7d28 e1d5 f87b 8010  ........}(...{..
        0x0030:  0083 fe28 0000 0101 080a 3a3b 43a4 3a3b  ...(......:;C.:;
        0x0040:  43a4                                     C.
// === 到此为止：WebSocket 握手完成 === 

// WebSocket 数据帧（已进入 Frida RPC 层，非明文）
12:19:07.164808 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [P.], seq 178:436, ack 167, win 131, options [nop,nop,TS val 976962474 ecr 976962468], length 258
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0136 7bae 4000 4006 c011 7f00 0001 7f00  .6{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7d28 e1d5 f87b 8018  ........}(...{..
        0x0030:  0083 ff2a 0000 0101 080a 3a3b 43aa 3a3b  ...*......:;C.:;
        0x0040:  43a4 82ec d1ad 0192 bdac 0093 d5ad 0192  C...............
        0x0050:  d0ad 0192 84ad 0192 d0ac 6e92 c4ad 0192  ..........n.....
        0x0060:  fedf 64bd b7df 68f6 b082 49fd a2d9 52f7  ..d...h...I...R.
        0x0070:  a2de 68fd bfad 0192 d3ac 7292 c7ad 0192  ..h.......r.....
        0x0080:  a3c8 2ff4 a3c4 65f3 ffe5 6ee1 a5fe 64e1  ../...e...n...d.
        0x0090:  a2c4 6efc e09b 0192 d9ac 6692 d0d8 0192  ..n.......f.....
        0x00a0:  d2ac 7292 d5ad 0192 81c4 6ff5 d1ad 0192  ..r.......o.....
        0x00b0:  cfad 0192 82fe 0088 963f 3ca7 fa3e 3ca6  .........?<..><.
        0x00c0:  9e3f 3ca7 943f 3ca7 e63f 3ca7 973e 53a7  .?<..?<..?<..>S.
        0x00d0:  833f 3ca7 b94d 5988 f04d 55c3 f710 74c8  .?<..MY..MU...t.
        0x00e0:  e54b 6fc2 e54c 55c8 f83f 3ca7 943e 4fa7  .Ko..LU..?<..>O.
        0x00f0:  803f 3ca7 e45a 12c1 e456 58c6 b877 53d4  .?<..Z...VX..wS.
        0x0100:  e26c 59d4 e556 53c9 a709 3ca7 9e3e 5ba7  .lY..VS...<..>[.
        0x0110:  935e 47d4 e042 3ca7 963f 3ca7 953e 4fa7  .^G..B<..?<..>O.
        0x0120:  813f 3ca7 d15a 48e1 e450 52d3 fb50 4fd3  .?<..ZH..PR..PO.
        0x0130:  d74f 4ccb ff5c 5dd3 ff50 52a7 963f 3ca7  .OL..\]..PR..?<.
        0x0140:  963f 3ca7                                .?<.

12:19:07.204426 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [.], ack 436, win 133, options [nop,nop,TS val 976962513 ecr 976962474], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 557d 4000 4006 e744 7f00 0001 7f00  .4U}@.@..D......
        0x0020:  0001 04d2 b40d e1d5 f87b ccc7 7e2a 8010  .........{..~*..
        0x0030:  0085 fe28 0000 0101 080a 3a3b 43d1 3a3b  ...(......:;C.:;
        0x0040:  43aa                                     C.

12:19:07.248471 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [P.], seq 167:265, ack 436, win 133, options [nop,nop,TS val 976962557 ecr 976962474], length 98
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0096 557e 4000 4006 e6e1 7f00 0001 7f00  ..U~@.@.........
        0x0020:  0001 04d2 b40d e1d5 f87b ccc7 7e2a 8018  .........{..~*..
        0x0030:  0085 fe8a 0000 0101 080a 3a3b 43fd 3a3b  ..........:;C.:;
        0x0040:  43aa 8260 6c02 0101 3800 0000 0100 0000  C..`l...8.......
        0x0050:  1800 0000 0801 6700 0a28 7373 7561 7b73  ......g..(ssua{s
        0x0060:  767d 2900 0501 7500 0200 0000 1100 0000  v})...u.........
        0x0070:  636f 6d2e 6379 7275 732e 6578 616d 706c  com.cyrus.exampl
        0x0080:  6500 0000 0e00 0000 416e 6472 6f69 6445  e.......AndroidE
        0x0090:  7861 6d70 6c65 0000 2f0d 0000 0000 0000  xample../.......
        0x00a0:  0000 0000                                ....
12:19:07.253754 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [P.], seq 436:562, ack 265, win 131, options [nop,nop,TS val 976962563 ecr 976962557], length 126
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  00b2 7baf 4000 4006 c094 7f00 0001 7f00  ..{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7e2a e1d5 f8dd 8018  ........~*......
        0x0030:  0083 fea6 0000 0101 080a 3a3b 4403 3a3b  ..........:;D.:;
        0x0040:  43fd 82f8 9063 943d fc62 943c 9863 943d  C....c.=.b.<.c.=
        0x0050:  9363 943d cf63 943d 9162 fb3d 8563 943d  .c.=.c.=.b.=.c.=
        0x0060:  bf11 f112 f611 fd59 f14c dc52 e317 c758  .......Y.L.R...X
        0x0070:  e310 fd52 fe63 943d 9262 e73d 8663 943d  ...R.c.=.b.=.c.=
        0x0080:  e206 ba5b e20a f05c be2b fb4e e430 f14e  ...[...\.+.N.0.N
        0x0090:  e30a fb53 a155 943d 9862 f33d 9616 f546  ...S.U.=.b.=...F
        0x00a0:  e315 e93d 9063 943d 9362 e73d 9663 943d  ...=.c.=.b.=.c.=
        0x00b0:  d117 e05c f30b 943d bf6e 943d 9063 943d  ...\...=.n.=.c.=
12:19:07.253952 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [.], ack 562, win 133, options [nop,nop,TS val 976962563 ecr 976962563], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 557f 4000 4006 e742 7f00 0001 7f00  .4U.@.@..B......
        0x0020:  0001 04d2 b40d e1d5 f8dd ccc7 7ea8 8010  ............~...
        0x0030:  0085 fe28 0000 0101 080a 3a3b 4403 3a3b  ...(......:;D.:;
        0x0040:  4403                                     D.
12:19:08.252403 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [.], ack 265, win 131, options [nop,nop,TS val 976963561 ecr 976962563], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bb0 4000 4006 c111 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7ea7 e1d5 f8dd 8010  ........~.......
        0x0030:  0083 fe28 0000 0101 080a 3a3b 47e9 3a3b  ...(......:;G.:;
        0x0040:  4403                                     D.
12:19:08.252565 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [.], ack 562, win 133, options [nop,nop,TS val 976963562 ecr 976962563], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 5580 4000 4006 e741 7f00 0001 7f00  .4U.@.@..A......
        0x0020:  0001 04d2 b40d e1d5 f8dd ccc7 7ea8 8010  ............~...
        0x0030:  0085 fe28 0000 0101 080a 3a3b 47ea 3a3b  ...(......:;G.:;
        0x0040:  4403                                     D.
12:19:08.895180 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [P.], seq 265:380, ack 562, win 133, options [nop,nop,TS val 976964204 ecr 976962563], length 115
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  00a7 5581 4000 4006 e6cd 7f00 0001 7f00  ..U.@.@.........
        0x0020:  0001 04d2 b40d e1d5 f8dd ccc7 7ea8 8018  ............~...
        0x0030:  0085 fe9b 0000 0101 080a 3a3b 4a6c 3a3b  ..........:;Jl:;
        0x0040:  4403 8271 6c03 0101 2900 0000 0200 0000  D..ql...).......
        0x0050:  3800 0000 0401 7300 1800 0000 7265 2e66  8.....s.....re.f
        0x0060:  7269 6461 2e45 7272 6f72 2e54 7261 6e73  rida.Error.Trans
        0x0070:  706f 7274 0000 0000 0000 0000 0801 6700  port..........g.
        0x0080:  0173 0000 0501 7500 0300 0000 2400 0000  .s....u.....$...
        0x0090:  4167 656e 7420 636f 6e6e 6563 7469 6f6e  Agent.connection
        0x00a0:  2063 6c6f 7365 6420 756e 6578 7065 6374  .closed.unexpect
        0x00b0:  6564 6c79 00                             edly.
12:19:08.932256 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [.], ack 380, win 131, options [nop,nop,TS val 976964241 ecr 976964204], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bb1 4000 4006 c110 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7ea8 e1d5 f950 8010  ........~....P..
        0x0030:  0083 fe28 0000 0101 080a 3a3b 4a91 3a3b  ...(......:;J.:;
        0x0040:  4a6c                                     Jl
12:19:09.062493 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [P.], seq 380:2904, ack 562, win 133, options [nop,nop,TS val 976964371 ecr 976964241], length 2524
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0a10 5582 4000 4006 dd63 7f00 0001 7f00  ..U.@.@..c......
        0x0020:  0001 04d2 b40d e1d5 f950 ccc7 7ea8 8018  .........P..~...
        0x0030:  0085 0805 0000 0101 080a 3a3b 4b13 3a3b  ..........:;K.:;
        0x0040:  4a91 827e 09d8 6c04 0101 5809 0000 0300  J..~..l...X.....
        0x0050:  0000 6f00 0000 0101 6f00 1500 0000 2f72  ..o.....o...../r
        0x0060:  652f 6672 6964 612f 486f 7374 5365 7373  e/frida/HostSess
        0x0070:  696f 6e00 0000 0201 7300 1600 0000 7265  ion.....s.....re
        0x0080:  2e66 7269 6461 2e48 6f73 7453 6573 7369  .frida.HostSessi
        0x0090:  6f6e 3136 0000 0801 6700 0b28 7573 7373  on16....g..(usss
        0x00a0:  617b 7376 7d29 0000 0000 0000 0000 0301  a{sv})..........
        0x00b0:  7300 0e00 0000 5072 6f63 6573 7343 7261  s.....ProcessCra
        0x00c0:  7368 6564 0000 2f0d 0000 0f00 0000 6d2e  shed../.......m.
        0x00d0:  6379 7275 732e 6578 616d 706c 6500 1200  cyrus.example...
        0x00e0:  0000 5349 4754 5241 5020 5452 4150 5f42  ..SIGTRAP.TRAP_B
        0x00f0:  524b 5054 0000 1c09 0000 2a2a 2a20 2a2a  RKPT......***.**
        0x0100:  2a20 2a2a 2a20 2a2a 2a20 2a2a 2a20 2a2a  *.***.***.***.**
        0x0110:  2a20 2a2a 2a20 2a2a 2a20 2a2a 2a20 2a2a  *.***.***.***.**
        0x0120:  2a20 2a2a 2a20 2a2a 2a20 2a2a 2a20 2a2a  *.***.***.***.**
        0x0130:  2a20 2a2a 2a20 2a2a 2a0a 4275 696c 6420  *.***.***.Build.
        0x0140:  6669 6e67 6572 7072 696e 743a 2027 5869  fingerprint:.'Xi
        0x0150:  616f 6d69 2f76 616e 676f 6768 2f76 616e  aomi/vangogh/van
        0x0160:  676f 6768 3a31 322f 534b 5131 2e32 3131  gogh:12/SKQ1.211
        0x0170:  3030 362e 3030 312f 5631 332e 302e 392e  006.001/V13.0.9.
        0x0180:  302e 534a 5643 4e58 4d3a 7573 6572 2f72  0.SJVCNXM:user/r
        0x0190:  656c 6561 7365 2d6b 6579 7327 0a52 6576  elease-keys'.Rev
        0x01a0:  6973 696f 6e3a 2027 3027 0a41 4249 3a20  ision:.'0'.ABI:.
        0x01b0:  2761 726d 3634 270a 5469 6d65 7374 616d  'arm64'.Timestam
        0x01c0:  703a 2032 3032 362d 3034 2d30 3220 3132  p:.2026-04-02.12
        0x01d0:  3a31 393a 3037 2e38 3032 3532 3032 3932  :19:07.802520292
        0x01e0:  2b30 3830 300a 5072 6f63 6573 7320 7570  +0800.Process.up
        0x01f0:  7469 6d65 3a20 3073 0a43 6d64 6c69 6e65  time:.0s.Cmdline
        0x0200:  3a20 636f 6d2e 6379 7275 732e 6578 616d  :.com.cyrus.exam
        0x0210:  706c 650a 7069 643a 2033 3337 352c 2074  ple.pid:.3375,.t
        0x0220:  6964 3a20 3237 3930 342c 206e 616d 653a  id:.27904,.name:
        0x0230:  206d 2e63 7972 7573 2e65 7861 6d70 6c65  .m.cyrus.example
        0x0240:  2020 3e3e 3e20 636f 6d2e 6379 7275 732e  ..>>>.com.cyrus.
        0x0250:  6578 616d 706c 6520 3c3c 3c0a 7569 643a  example.<<<.uid:
        0x0260:  2031 3032 3932 0a73 6967 6e61 6c20 3520  .10292.signal.5.
        0x0270:  2853 4947 5452 4150 292c 2063 6f64 6520  (SIGTRAP),.code.
        0x0280:  3120 2854 5241 505f 4252 4b50 5429 2c20  1.(TRAP_BRKPT),.
        0x0290:  6661 756c 7420 6164 6472 2030 7837 3237  fault.addr.0x727
        0x02a0:  6137 3439 3363 380a 2020 2020 7830 2020  a7493c8.....x0..
        0x02b0:  3030 3030 3030 3030 3030 3030 3030 3030  0000000000000000
        0x02c0:  2020 7831 2020 3030 3030 3030 3030 3030  ..x1..0000000000
        0x02d0:  3064 3130 3030 2020 7832 2020 3030 3030  0d1000..x2..0000
        0x02e0:  3030 3030 3030 3030 3030 3031 2020 7833  000000000001..x3
        0x02f0:  2020 3666 3736 3635 3566 3633 3638 3662  ..6f76655f63686b
        0x0300:  3030 0a20 2020 2078 3420 2030 3030 3030  00.....x4..00000
        0x0310:  3038 3030 3030 3030 3030 3020 2078 3520  08000000000..x5.
        0x0320:  2036 6637 3636 3535 6636 3336 3836 6230  .6f76655f63686b0
        0x0330:  3020 2078 3620 2030 3030 3030 3030 3038  0..x6..000000008
        0x0340:  3030 3030 3030 3020 2078 3720 2030 3030  0000000..x7..000
        0x0350:  3030 3030 3030 3030 3030 6337 350a 2020  0000000000c75...
        0x0360:  2020 7838 2020 3030 3030 3030 3030 3030  ..x8..0000000000
        0x0370:  3030 3030 3031 2020 7839 2020 3030 3030  000001..x9..0000
        0x0380:  3030 3030 3030 3030 3030 3031 2020 7831  000000000001..x1
        0x0390:  3020 3030 3030 3030 3030 3030 3030 3030  0.00000000000000
        0x03a0:  3030 2020 7831 3120 3030 3030 3030 3030  00..x11.00000000
        0x03b0:  3138 3532 3361 6165 0a20 2020 2078 3132  18523aae.....x12
        0x03c0:  2030 3030 3030 3037 3237 6137 3032 3035  .000000727a70205
        0x03d0:  3020 2078 3133 2030 3030 3030 3030 3030  0..x13.000000000
        0x03e0:  3030 3030 3030 3020 2078 3134 2030 3030  0000000..x14.000
        0x03f0:  3030 3030 3030 3030 3030 3030 3020 2078  0000000000000..x
        0x0400:  3135 2030 3030 3030 3030 3030 3030 3030  15.0000000000000
        0x0410:  3030 300a 2020 2020 7831 3620 3030 3030  000.....x16.0000
        0x0420:  3030 3732 3761 3831 6263 3538 2020 7831  00727a81bc58..x1
        0x0430:  3720 3030 3030 3030 3732 3761 3765 6433  7.000000727a7ed3
        0x0440:  3430 2020 7831 3820 3030 3030 3030 3731  40..x18.00000071
        0x0450:  3437 3565 3630 3030 2020 7831 3920 3030  475e6000..x19.00
        0x0460:  3030 3030 3732 3739 3563 6266 3730 0a20  000072795cbf70..
        0x0470:  2020 2078 3230 2030 3030 3030 3037 3237  ...x20.000000727
        0x0480:  6138 3166 3439 3820 2078 3231 2030 3030  a81f498..x21.000
        0x0490:  3030 3037 3237 6138 3163 6364 3820 2078  000727a81ccd8..x
        0x04a0:  3232 2030 3030 3030 3037 3134 6436 6132  22.000000714d6a2
        0x04b0:  3762 3020 2078 3233 2030 3030 3030 3037  7b0..x23.0000007
        0x04c0:  3237 3935 6362 6561 300a 2020 2020 7832  2795cbea0.....x2
        0x04d0:  3420 3030 3030 3030 3030 3030 3030 3030  4.00000000000000
        0x04e0:  3030 2020 7832 3520 3030 3030 3030 3732  00..x25.00000072
        0x04f0:  3739 3563 6265 6130 2020 7832 3620 3030  795cbea0..x26.00
        0x0500:  3030 3030 3732 3739 3661 3435 3330 2020  000072796a4530..
        0x0510:  7832 3720 3030 3030 3030 3732 3761 3831  x27.000000727a81
        0x0520:  6533 3438 0a20 2020 2078 3238 2030 3030  e348.....x28.000
        0x0530:  3030 3037 3237 3836 3035 6464 3020 2078  0007278605dd0..x
        0x0540:  3239 2030 3030 3030 3037 3134 6436 6132  29.000000714d6a2
        0x0550:  3661 300a 2020 2020 6c72 2020 3030 3030  6a0.....lr..0000
        0x0560:  3030 3732 3761 3733 6639 3763 2020 7370  00727a73f97c..sp
        0x0570:  2020 3030 3030 3030 3731 3464 3661 3236  ..000000714d6a26
        0x0580:  6130 2020 7063 2020 3030 3030 3030 3732  a0..pc..00000072
        0x0590:  3761 3734 3933 6338 2020 7073 7420 3030  7a7493c8..pst.00
        0x05a0:  3030 3030 3030 3630 3030 3030 3030 0a62  00000060000000.b
        0x05b0:  6163 6b74 7261 6365 3a0a 2020 2020 2020  acktrace:.......
        0x05c0:  2330 3020 7063 2030 3030 3030 3030 3030  #00.pc.000000000
        0x05d0:  3030 3535 3363 3820 202f 6170 6578 2f63  00553c8../apex/c
        0x05e0:  6f6d 2e61 6e64 726f 6964 2e72 756e 7469  om.android.runti
        0x05f0:  6d65 2f62 696e 2f6c 696e 6b65 7236 3421  me/bin/linker64!
        0x0600:  6c64 2d61 6e64 726f 6964 2e73 6f20 2872  ld-android.so.(r
        0x0610:  746c 645f 6462 5f64 6c61 6374 6976 6974  tld_db_dlactivit
        0x0620:  792b 3029 2028 4275 696c 6449 643a 2032  y+0).(BuildId:.2
        0x0630:  3539 3330 3036 6631 3864 3531 3630 3237  593006f18d516027
        0x0640:  3732 3062 3562 6136 3966 6334 3833 6129  720b5ba69fc483a)
        0x0650:  0a20 2020 2020 2023 3031 2070 6320 3030  .......#01.pc.00
        0x0660:  3030 3030 3030 3030 3034 6239 3738 2020  0000000004b978..
        0x0670:  2f61 7065 782f 636f 6d2e 616e 6472 6f69  /apex/com.androi
        0x0680:  642e 7275 6e74 696d 652f 6269 6e2f 6c69  d.runtime/bin/li
        0x0690:  6e6b 6572 3634 2028 5f5f 646c 5f6e 6f74  nker64.(__dl_not
        0x06a0:  6966 795f 6764 625f 6f66 5f6c 6f61 642b  ify_gdb_of_load+
        0x06b0:  3536 2920 2842 7569 6c64 4964 3a20 3235  56).(BuildId:.25
        0x06c0:  3933 3030 3666 3138 6435 3136 3032 3737  93006f18d5160277
        0x06d0:  3230 6235 6261 3639 6663 3438 3361 290a  20b5ba69fc483a).
        0x06e0:  2020 2020 2020 2330 3220 7063 2030 3030  ......#02.pc.000
        0x06f0:  3030 3030 3030 3030 3366 3839 3420 202f  000000003f894../
        0x0700:  6170 6578 2f63 6f6d 2e61 6e64 726f 6964  apex/com.android
        0x0710:  2e72 756e 7469 6d65 2f62 696e 2f6c 696e  .runtime/bin/lin
        0x0720:  6b65 7236 3420 285f 5f64 6c5f 5f5a 4e36  ker64.(__dl__ZN6
        0x0730:  736f 696e 666f 3130 6c69 6e6b 5f69 6d61  soinfo10link_ima
        0x0740:  6765 4552 4b31 3653 796d 626f 6c4c 6f6f  geERK16SymbolLoo
        0x0750:  6b75 704c 6973 7450 535f 504b 3137 616e  kupListPS_PK17an
        0x0760:  6472 6f69 645f 646c 6578 7469 6e66 6f50  droid_dlextinfoP
        0x0770:  6d2b 3435 3629 2028 4275 696c 6449 643a  m+456).(BuildId:
        0x0780:  2032 3539 3330 3036 6631 3864 3531 3630  .2593006f18d5160
        0x0790:  3237 3732 3062 3562 6136 3966 6334 3833  27720b5ba69fc483
        0x07a0:  6129 0a20 2020 2020 2023 3033 2070 6320  a).......#03.pc.
        0x07b0:  3030 3030 3030 3030 3030 3033 6138 3134  000000000003a814
        0x07c0:  2020 2f61 7065 782f 636f 6d2e 616e 6472  ../apex/com.andr
        0x07d0:  6f69 642e 7275 6e74 696d 652f 6269 6e2f  oid.runtime/bin/
        0x07e0:  6c69 6e6b 6572 3634 2028 5f5f 646c 5f5f  linker64.(__dl__
        0x07f0:  5a31 3466 696e 645f 6c69 6272 6172 6965  Z14find_librarie
        0x0800:  7350 3139 616e 6472 6f69 645f 6e61 6d65  sP19android_name
        0x0810:  7370 6163 655f 7450 3673 6f69 6e66 6f50  space_tP6soinfoP
        0x0820:  4b50 4b63 6d50 5332 5f50 4e53 7433 5f5f  KPKcmPS2_PNSt3__
        0x0830:  3136 7665 6374 6f72 4953 325f 4e53 385f  16vectorIS2_NS8_
        0x0840:  3961 6c6c 6f63 6174 6f72 4953 325f 4545  9allocatorIS2_EE
        0x0850:  4545 6d69 504b 3137 616e 6472 6f69 645f  EEmiPK17android_
        0x0860:  646c 6578 7469 6e66 6f62 504e 5339 5f49  dlextinfobPNS9_I
        0x0870:  5330 5f4e 5341 5f49 5330 5f45 4545 452b  S0_NSA_IS0_EEEE+
        0x0880:  3432 3536 2920 2842 7569 6c64 4964 3a20  4256).(BuildId:.
        0x0890:  3235 3933 3030 3666 3138 6435 3136 3032  2593006f18d51602
        0x08a0:  3737 3230 6235 6261 3639 6663 3438 3361  7720b5ba69fc483a
        0x08b0:  290a 2020 2020 2020 2330 3420 7063 2030  ).......#04.pc.0
        0x08c0:  3030 3030 3030 3030 3030 3363 6638 3820  00000000003cf88.
        0x08d0:  202f 6170 6578 2f63 6f6d 2e61 6e64 726f  ./apex/com.andro
        0x08e0:  6964 2e72 756e 7469 6d65 2f62 696e 2f6c  id.runtime/bin/l
        0x08f0:  696e 6b65 7236 3420 285f 5f64 6c5f 5f5a  inker64.(__dl__Z
        0x0900:  3964 6f5f 646c 6f70 656e 504b 6369 504b  9do_dlopenPKciPK
        0x0910:  3137 616e 6472 6f69 645f 646c 6578 7469  17android_dlexti
        0x0920:  6e66 6f50 4b76 2b32 3134 3029 2028 4275  nfoPKv+2140).(Bu
        0x0930:  696c 6449 643a 2032 3539 3330 3036 6631  ildId:.2593006f1
        0x0940:  3864 3531 3630 3237 3732 3062 3562 6136  8d516027720b5ba6
        0x0950:  3966 6334 3833 6129 0a20 2020 2020 2023  9fc483a).......#
        0x0960:  3035 2070 6320 3030 3030 3030 3030 3030  05.pc.0000000000
        0x0970:  3033 3831 6638 2020 2f61 7065 782f 636f  0381f8../apex/co
        0x0980:  6d2e 616e 6472 6f69 642e 7275 6e74 696d  m.android.runtim
        0x0990:  652f 6269 6e2f 6c69 6e6b 6572 3634 2028  e/bin/linker64.(
        0x09a0:  5f5f 6c6f 6164 6572 5f64 6c6f 7065 6e2b  __loader_dlopen+
        0x09b0:  3830 2920 2842 7569 6c64 4964 3a20 3235  80).(BuildId:.25
        0x09c0:  3933 3030 3666 3138 6435 3136 3032 3737  93006f18d5160277
        0x09d0:  3230 6235 6261 3639 6663 3438 3361 290a  20b5ba69fc483a).
        0x09e0:  2020 2020 2020 2330 3620 7063 2030 3030  ......#06.pc.000
        0x09f0:  3030 3030 3030 3030 3030 3232 3020 203c  0000000000220..<
        0x0a00:  616e 6f6e 796d 6f75 733a 3732 3633 3532  anonymous:726352
        0x0a10:  6630 3030 3e0a 0000 0000 0000 0000       f000>.........
12:19:09.062667 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [.], ack 2904, win 140, options [nop,nop,TS val 976964372 ecr 976964371], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bb2 4000 4006 c10f 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7ea8 e1d6 032c 8010  ........~....,..
        0x0030:  008c fe28 0000 0101 080a 3a3b 4b14 3a3b  ...(......:;K.:;
        0x0040:  4b13                                     K.
12:19:09.110836 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [P.], seq 562:577, ack 2904, win 140, options [nop,nop,TS val 976964420 ecr 976964371], length 15
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0043 7bb3 4000 4006 c0ff 7f00 0001 7f00  .C{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7ea8 e1d6 032c 8018  ........~....,..
        0x0030:  008c fe37 0000 0101 080a 3a3b 4b44 3a3b  ...7......:;KD:;
        0x0040:  4b13 8889 e802 c453 ebea 873f 8771 ad3d  K......S...?.q.=
        0x0050:  8f                                       .
12:19:09.110946 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [.], ack 577, win 133, options [nop,nop,TS val 976964420 ecr 976964420], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 5583 4000 4006 e73e 7f00 0001 7f00  .4U.@.@..>......
        0x0020:  0001 04d2 b40d e1d6 032c ccc7 7eb7 8010  .........,..~...
        0x0030:  0085 fe28 0000 0101 080a 3a3b 4b44 3a3b  ...(......:;KD:;
        0x0040:  4b44                                     KD
12:19:09.111582 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [P.], seq 2904:2915, ack 577, win 133, options [nop,nop,TS val 976964421 ecr 976964420], length 11
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  003f 5584 4000 4006 e732 7f00 0001 7f00  .?U.@.@..2......
        0x0020:  0001 04d2 b40d e1d6 032c ccc7 7eb7 8018  .........,..~...
        0x0030:  0085 fe33 0000 0101 080a 3a3b 4b45 3a3b  ...3......:;KE:;
        0x0040:  4b44 8809 03e8 436c 6f73 696e 67         KD....Closing
12:19:09.111633 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [.], ack 2915, win 140, options [nop,nop,TS val 976964421 ecr 976964421], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bb4 4000 4006 c10d 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7eb7 e1d6 0337 8010  ........~....7..
        0x0030:  008c fe28 0000 0101 080a 3a3b 4b45 3a3b  ...(......:;KE:;
        0x0040:  4b45                                     KE
12:19:09.111771 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [F.], seq 2915, ack 577, win 133, options [nop,nop,TS val 976964421 ecr 976964421], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 5585 4000 4006 e73c 7f00 0001 7f00  .4U.@.@..<......
        0x0020:  0001 04d2 b40d e1d6 0337 ccc7 7eb7 8011  .........7..~...
        0x0030:  0085 fe28 0000 0101 080a 3a3b 4b45 3a3b  ...(......:;KE:;
        0x0040:  4b45                                     KE
12:19:09.113041 IP 127.0.0.1.46093 > 127.0.0.1.1234: Flags [F.], seq 577, ack 2916, win 140, options [nop,nop,TS val 976964422 ecr 976964421], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 7bb5 4000 4006 c10c 7f00 0001 7f00  .4{.@.@.........
        0x0020:  0001 b40d 04d2 ccc7 7eb7 e1d6 0338 8011  ........~....8..
        0x0030:  008c fe28 0000 0101 080a 3a3b 4b46 3a3b  ...(......:;KF:;
        0x0040:  4b45                                     KE
12:19:09.113125 IP 127.0.0.1.1234 > 127.0.0.1.46093: Flags [.], ack 578, win 133, options [nop,nop,TS val 976964422 ecr 976964422], length 0
        0x0000:  0000 0000 0000 0000 0000 0000 0800 4500  ..............E.
        0x0010:  0034 5586 4000 4006 e73b 7f00 0001 7f00  .4U.@.@..;......
        0x0020:  0001 04d2 b40d e1d6 0338 ccc7 7eb8 8010  .........8..~...
        0x0030:  0085 fe28 0000 0101 080a 3a3b 4b46 3a3b  ...(......:;KF:;
        0x0040:  4b46                                     KF
```

## Android 端实现：端口扫描 + 协议识别

核心思路：

1.  扫描本地端口（1~65535）
    
2.  尝试建立 TCP 连接
    
3.  发送 WebSocket 握手请求
    
4.  判断返回是否符合 Frida 特征
    

```cpp
#include <jni.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <fcntl.h>
#include <android/log.h>
#include <pthread.h>

#define TAG "FridaPortCheck"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

// 设置 socket 为非阻塞模式（用于配合 select 实现超时控制）
static int set_nonblock(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    return fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

// ===== WebSocket 握手请求（模拟 Frida 客户端特征）=====
// Frida 16+ 使用 WebSocket + JSON RPC 通信
static const char *ws_req =
        "GET /ws HTTP/1.1\r\n"
        "Host: 127.0.0.1\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "User-Agent: Frida/16.7.19\r\n"
        "\r\n";

// ===== 端口扫描线程 =====
void *scan_ports_thread(void *arg) {

    struct sockaddr_in sa{};
    sa.sin_family = AF_INET;
    inet_aton("127.0.0.1", &sa.sin_addr); // 扫描本地回环（frida-server 常驻）

    char recv_buf[1024];

    // 遍历全部 TCP 端口
    for (int port = 1; port <= 65535; port++) {

        int sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock < 0) continue;

        set_nonblock(sock); // 非阻塞 connect

        sa.sin_port = htons(port);

        bool is_frida = false;

        do {
            // 发起连接（非阻塞）
            connect(sock, (struct sockaddr *) &sa, sizeof(sa));

            // 使用 select 等待连接完成（写事件）
            fd_set wfds;
            FD_ZERO(&wfds);
            FD_SET(sock, &wfds);

            struct timeval tv{};
            tv.tv_sec = 0;
            tv.tv_usec = 100 * 1000; // 100ms 超时

            int sel = select(sock + 1, NULL, &wfds, NULL, &tv);
            if (!(sel > 0 && FD_ISSET(sock, &wfds))) break;

            // 检查 connect 结果
            int err = 0;
            socklen_t len = sizeof(err);
            getsockopt(sock, SOL_SOCKET, SO_ERROR, &err, &len);

            if (err != 0) break;

            LOGD("[+] Port %d CONNECTED", port);

            // ===== 发送 WebSocket 握手 =====
            send(sock, ws_req, strlen(ws_req), 0);

            usleep(100 * 1000); // 等待响应

            memset(recv_buf, 0, sizeof(recv_buf));
            int r = recv(sock, recv_buf, sizeof(recv_buf) - 1, MSG_DONTWAIT);

            if (r <= 0) {
                LOGD("[+] Port %d NO RESPONSE", port);
                break;
            }

            LOGD("[+] Port %d RESPONSE (%d bytes):\n%s", port, r, recv_buf);

            // ===== 判断是否为 WebSocket 服务 =====
            // 关键特征：HTTP 101 + Upgrade + Sec-WebSocket-Accept
            if (strstr(recv_buf, "HTTP/1.1 101") &&
                strstr(recv_buf, "Upgrade: websocket") &&
                strstr(recv_buf, "Connection: Upgrade") &&
                strstr(recv_buf, "Sec-WebSocket-Accept")) {

                LOGD("[!!!] WebSocket detected on port %d", port);

                // 命中 WebSocket（进一步可结合特征判断是否为 Frida）
                is_frida = true;
                break;
            }

        } while (false);

        // 释放 socket
        close(sock);

        // 命中后直接结束扫描
        if (is_frida) {
            notify_java(port, "FRIDA WEBSOCKET DETECTED");
            return nullptr;
        }
    }

    LOGD("[*] Scan finished");
    notify_java(-1, "SCAN_FINISHED");

    return nullptr;
}

// JNI 入口：启动扫描线程（避免阻塞主线程）
extern "C"
JNIEXPORT void JNICALL
Java_com_cyrus_example_fridadetector_core_checks_FridaPortCheck_nativeStartScan(
        JNIEnv *env, jobject thiz) {

    pthread_t tid;

    if (pthread_create(&tid, nullptr, scan_ports_thread, nullptr) == 0) {

        pthread_detach(tid); // 线程结束自动回收资源

        LOGD("[*] Scan thread started");

    } else {
        LOGD("[!] Failed to create thread");
    }
}
```

检测到 1234 端口被 frida-server 占用

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e8db70d9c9384b77.png)](data:image/png;base64,inline-110970B)

日志输出如下：

```yaml
2026-04-02 20:18:09.144 22538-22538 FridaPortCheck          com.cyrus.example                    D  [*] Scan thread started
2026-04-02 20:18:09.177 22538-22538 VFUtils                 com.cyrus.example                    D  scaleWght : 330
2026-04-02 20:18:09.541 22538-22624 FridaPortCheck          com.cyrus.example                    D  [+] Port 1234 CONNECTED
2026-04-02 20:18:09.641 22538-22624 FridaPortCheck          com.cyrus.example                    D  [+] Port 1234 RESPONSE (166 bytes):
                                                                                                    HTTP/1.1 101 Switching Protocols
                                                                                                    Date: Thu, 02 Apr 2026 12:18:09 GMT
                                                                                                    Upgrade: websocket
                                                                                                    Connection: Upgrade
                                                                                                    Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
2026-04-02 20:18:31.173 22538-22624 FridaPortCheck          com.cyrus.example                    D  [*] Scan finished
```

通过 adb shell 可以看到 1234 端口正被 frida-server 程序占用

```
> adb shell su -c "ss -ltnp | grep 1234"
LISTEN      0      10     0.0.0.0:1234               0.0.0.0:*                   users:(("frida-server",pid=15869,fd=7))
```

## 绕过方案

可以通过 hook send 方法阻断 /ws WebSocket 握手请求发送实现反检测。

send 和 recv 实际调用的是 sendto 和 recvfrom

```
libc.so (bionic)
 ├── send → sendto
 ├── recv → recvfrom
```

直接 enumerate libc.so 中的 send 和 recv ：

```
Module.enumerateExports("libc.so").forEach(e => {
    if (e.name.indexOf("send") !== -1 || e.name.indexOf("recv") !== -1) {
        console.log(e.name);
    }
});
```

你会看到：

```
[Remote::AndroidExample ]-> Module.enumerateExports("libc.so").forEach(e => {
    if (e.name.indexOf("send") !== -1 || e.name.indexOf("recv") !== -1) {
        console.log(e.name);
    }
});
__sendto_chk
sendfile
pidfd_send_signal
send
__res_send_setrhook
recvmsg
__recvfrom_chk
recvmmsg
sendmmsg
__res_send_setqhook
__res_nsend
recvfrom
__res_send
sendto
tcsendbreak
recv
sendmsg
sendfile64
```

通过 hook sendto，在识别到 WebSocket 握手请求时直接返回 -1，模拟发送失败。

frida_ws_handshake_bypass.js

```javascript
function hook_sendto() {
    const ptr = Module.findExportByName("libc.so", "sendto");
    const real = new NativeFunction(ptr, 'int', ['int', 'pointer', 'int', 'int', 'pointer', 'int']);

    Interceptor.replace(ptr, new NativeCallback(function (fd, buf, len, flags, dest, dest_len) {

        let data = "";
        try {
            data = Memory.readUtf8String(buf, len);
        } catch (e) {
        }

        if (data.indexOf("GET /ws HTTP/1.1") !== -1) {
            console.log("[Bypass] block ws handshake");
            return -1; // 模拟发送失败
        }

        return real(fd, buf, len, flags, dest, dest_len);

    }, 'int', ['int', 'pointer', 'int', 'int', 'pointer', 'int']));
}

setImmediate(hook_sendto);


// frida -H 127.0.0.1:1234 -l frida_ws_handshake_bypass.js -f com.cyrus.example
// frida -H 127.0.0.1:1234 -F -l frida_ws_handshake_bypass.js
```

执行 frida_ws_handshake_bypass.js 脚本

```bash
(frida17) PS D:\Python\anti-app\frida17\anti-frida> frida -H 127.0.0.1:1234 -F -l frida_ws_handshake_bypass.js
     ____
    / _  |   Frida 16.7.19 - A world-class dynamic instrumentation toolkit
   | (_| |
    > _  |   Commands:
   /_/ |_|       help      -> Displays the help system
   . . . .       object?   -> Display information about 'object'
   . . . .       exit/quit -> Exit
   . . . .
   . . . .   More info at https://frida.re/docs/home/
   . . . .
   . . . .   Connected to 127.0.0.1:1234 (id=socket@127.0.0.1:1234)
[Remote::AndroidExample ]-> [Bypass] block ws handshake
[Bypass] block ws handshake
[Bypass] block ws handshake
```

成功绕过检测

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ab85bb3e8ca6d66e.png)](data:image/png;base64,inline-125462B)

## 完整源码

Android 端完整源码： [https://github.com/CYRUS-STUDIO/AndroidExample](https://github.com/CYRUS-STUDIO/AndroidExample)
