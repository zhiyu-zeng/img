---
title: frida.re
source: https://frida.re/news/2026/11/07/frida-17-26-2-released/
source_host: frida.re
clip_date: 2026-11-08T04:15:04+08:00
trace_id: ad00866a-ffd2-4334-9e50-199864c6db51
content_hash: c568170f9be1572c5d924e8b381041f8571d172ec88c7ce2f07ab772eca47b6f
status: synced
tags: []
series: null
feed_source: Frida Releases
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41175244-d011-8110-89be-f028b421918d
ioc: null
---

## Frida 17.26.2 Released

release

Up to seven times the downlink through iOS device tunnels on Linux, thanks to [@hsorbo](https://twitter.com/hsorbo), and a fix for frida-server leaving *adb shell* hanging, from [@tubibibo](https://github.com/tubibibo).

## Idun

Håvard noticed that tunnel throughput on Linux was bound by main-loop round-trips rather than CPU. On a slow host, downlink through a CoreDevice tunnel sat at 70 to 90 Mbit/s with the kernel NCM driver or usbmuxd, and around 30 Mbit/s with our own NCM driver, while the host was mostly idle. Every transfer completion bounced through the main context and waited for lwIP before being resubmitted, outgoing datagrams went through two idle callbacks, each TCP read blocked until the lwIP thread had copied the data out, and the tunnel pump waited for the netstack and an idle iteration between reads, so decryption and lwIP processing never overlapped.

All of those round-trips are gone. Reads copy out under the state lock and notify lwIP asynchronously, the pump reads back to back, and the NCM driver parses and resubmits receive transfers on the libusb thread while outgoing datagrams are submitted from the thread producing them. Teardown was made explicit along the way: in-flight transfers are cancelled when the device is closed, so it no longer depends on the device happening to send something. On the same host, downlink went from 89 to 343 Mbit/s over usbmuxd, from 73 to 311 with the kernel NCM driver, and from 32 to 242 with ours. Uplink is unchanged, as writes still round-trip to the lwIP thread. Thanks!

Håvard also found that *idund*, when spawned with stderr closed, as by Node.js, ended up with its main loop’s wakeup fd allocated as fd 2, which detaching from the terminal then replaced with */dev/null*. The main loop spun at 100% CPU polling it. The daemon now makes sure the standard descriptors are open before anything else.

## Android

[@leonitousconforti](https://github.com/leonitousconforti) reported that *adb shell* never returned after frida-server crashed. Under *adb shell*, frida-server’s stdin and stdout are the same socket, and the crash monitor’s logcat inherited it, so when frida-server died abnormally, logcat kept the socket open and the shell never saw EOF. tubibibo tracked it down and gave logcat */dev/null* for stdin instead. Thanks, both!

Enjoy!

### Changelog

-   idun: Keep the main loop out of the tunnel data path, up to seven times the downlink on Linux. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   idun: Ensure the daemon’s stdio fds are open at startup, fixing a busy loop when spawned with stderr closed. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   idun: Skip the spawn test when the daemon path is unset.
-   linux: Don’t pass frida-server’s stdin to the crash monitor’s logcat, fixing *adb shell* hanging after a crash. Thanks [@tubibibo](https://github.com/tubibibo) and [@leonitousconforti](https://github.com/leonitousconforti)!
