---
title: Hunting Down a Go Runtime Bug on 32-bit Embedded Systems
source: https://sigma-star.at/blog/2026/08/go-runtime-netpoll-bug/
source_host: sigma-star.at
clip_date: 2026-11-20T10:40:59+08:00
trace_id: 883b3512-be48-4511-8b0c-5ca91d3cb7a0
content_hash: 25f01723fcd54932ec188c165a3e8a288ecd1ebf05b6d39e1492228a4c463608
status: synced
tags: []
series: null
feed_source: sigma star·嵌入式/TrustZone
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41e75244-d011-8130-9c91-e61fb3ddd7e1
ioc: null
---

Our daily work usually revolves around Linux and security topics, deep down in the software stack. Still, more often than you might think, we end up debugging applications which live much higher up. Sometimes such a problem has its roots in the Linux kernel, sometimes elsewhere. In this blog post we show how we found and fixed a bug inside the Go runtime.

Recently a customer reported that an application written in Go crashes from time to time on one of their embedded Linux systems.

## Introduction

The crash was always the same fatal error with the following signature:

```terminal
runtime: netpoll: eventfd ready for 5
fatal error: runtime: netpoll: eventfd ready for something unexpected
...stack trace...
```

At first we assumed that the application itself was buggy and needed fixing. But after inspecting the error more closely, it looked much more like an internal assumption in Go’s netpoll mechanism no longer holds.

The error message comes from `netpoll()` in [src/runtime/netpoll_epoll.go](https://github.com/golang/go/blob/c97cfcb37fced87a43a3dbab8983d6f76b8b84d1/src/runtime/netpoll_epoll.go#L141):

```go
if ev.Events != linux.EPOLLIN {
        println("runtime: netpoll: eventfd ready for", ev.Events)
        throw("runtime: netpoll: eventfd ready for something unexpected")
}
```

In this code path, the netpoll code expects `EPOLLIN` to be the only firing event, but it got something else. In our case it got `5`, which is `EPOLLIN|EPOLLOUT`. Why would epoll suddenly report more than `EPOLLIN` if the code asked only for `EPOLLIN`?

Before digging deeper, we threw the error message into a search engine, hoping that somebody else had faced the same issue before. This led us straight to a report in the Go project’s issue tracker: [runtime: netpoll: eventfd ready for something unexpected](https://github.com/golang/go/issues/72900).

The issue describes exactly the fatal error we saw. Also on a 32-bit ARM embedded Linux system! The reporters also noted that the crash happens in applications which run for a long time. That matched our customer’s description, too. Bingo!

The issue had been open and unresolved since March 2025. The Go maintainers had also rejected one [attempt](https://go-review.googlesource.com/c/go/+/658755) to fix the problem.

From the comments on the issue we learned that the fatal error only ever showed up on 32-bit ARM and i386 Linux systems, with all kinds of kernel versions. Some kernels were rather old, others recent. Not a single reporter saw it on an x86_64 or arm64 system.

## Accepting the Challenge

The problem had multiple reporters but no fix, so we decided to dig into the issue ourselves. At the very least we could give the Go folks better input.

Initially we suspected that epoll behaves differently on 32-bit ARM or i386. We ditched this idea quickly since epoll is generic core code in the kernel. Why would it return a spurious event set only on 32-bit ARM or i386?

Still, the fact that the error showed up only on 32-bit systems gnawed at us. As a next step we reviewed the epoll usage in Go’s netpoll code. With the help of an LLM we went through `src/runtime/netpoll_epoll.go`, focusing on 32-bit pitfalls such as integer conversions.

The review revealed that Go’s netpoll code uses the `data` field of `struct epoll_event`. Linux epoll can store an 8 byte cookie in the kernel and returns it as part of the firing event to user space. Applications use this cookie to attach metadata to an event, for example to tell different event sources apart.

```c
struct epoll_event {
    __poll_t  events;   /* ev.Events in Go netpoll */
    __u64     data;     /* ev.Data in Go netpoll */
};
```

Deep inside the Go runtime, the main event handler needs to know whether an event belongs to an event fd or a socket fd. It decides by comparing `ev.Data` to the address of its internal event fd object:

```go
if *(**uintptr)(unsafe.Pointer(&ev.Data)) == &netpollEventFd {
...
}
```

Reading further through the code showed that `ev.Data` holds either a raw pointer to `netpollEventFd` or a tagged pointer to a per-socket object, `pollDesc`. The pointer tag is a counter, `fdseq`, which distinguishes recycled `pollDesc` objects.

So far so good. Mixing raw and tagged pointers in the same field looked fishy to us. But how this relates to the crash was not clear yet.

Inspecting how Go lays out tagged pointers in memory finally revealed the core of the issue.

## The Aha Moment

On 32-bit platforms, Go’s tagged pointer logic packs the full 32-bit address and up to 32 tag bits into an 8 byte word. The tag goes into the lower 4 bytes and the address into the upper 4 bytes.

Storing a tagged pointer with address `0x00123456` and tag `0x12` fills `ev.Data` like this:

```
 ev.Data[0:4]        ev.Data[4:8]
+------------------+-------------------+
|  fdseq           |  *pollDesc        |
|  e.g. 0x00000012 |  e.g. 0x00123456  |
+------------------+-------------------+
```

Storing the raw pointer, on the other hand, leaves the following contents in `ev.Data`:

```
 ev.Data[0:4]       ev.Data[4:8]
+------------------+-------------------+
|  &netpollEventFd |  0 (untouched)    |
|  e.g. 0x00123456 |  0x00000000       |
+------------------+-------------------+
```

The lower 4 bytes hold the address of the object. The upper 4 bytes stay untouched since an address is only 4 bytes long on a 32-bit system.

This finally shows the root of the problem. The comparison of `ev.Data` with `&netpollEventFd` evaluates only the lower 4 bytes of `ev.Data`. The code casts `ev.Data` to `uintptr`, which is 4 bytes on 32-bit platforms. So the address of the `netpollEventFd` object aliases with `fdseq`.

As soon as `fdseq` grows large enough to match `&netpollEventFd`, the netpoll logic mistakes a socket fd for an event fd. Internal assumptions fall apart, among them the assumption that the ready event is just `EPOLLIN`.

Note that this aliasing can only happen on 32-bit little endian systems. On a 64-bit system, the comparison always covers the whole 8 bytes. On a 32-bit big endian system, the comparison would read the upper 4 bytes, which contain the address.

`fdseq` needs to grow into the millions before it matches `&netpollEventFd`. That’s why the problem shows up only in long-running programs which create lots of `pollDesc` objects over time. On a typical 32-bit ARM Linux system, `netpollEventFd` resides in a read-only section within the first 3 MiB of the address space, as the memory map of our test program shows:

```terminal
$ pmap `pidof netpoll_test`
204:   /opt/netpoll_test
00010000   2696K r-x-- netpoll_test
002c0000   2192K r---- netpoll_test
004f0000    180K rw--- netpoll_test
...
```

So `fdseq` needs to reach a value of about 3 million before the crash can happen.

## A Test Case

We also created a [standalone test case](https://github.com/richardweinberger/go_netpoll_32bit_testcase) for the problem. On our test systems, it triggered the crash within a few minutes:

```terminal
$ /tmp/repro.arm.system
netpoll eventfd-alias reproducer (GOOS=linux GOARCH=arm)
runtime.netpollEventFd is at address 0x223008
crash expected around cycle 2240520

cycle 2236988runtime: netpoll: eventfd ready for 4
fatal error: runtime: netpoll: eventfd ready for something unexpected

runtime stack:
...
```

## Fixing the Issue

We [proposed a fix](https://github.com/golang/go/pull/81037) which changes how netpoll tells event fds and socket fds apart. Instead of storing the raw pointer `&netpollEventFd`, the fix stores a `nil` `pollDesc` as a tagged pointer. When unpacking the tagged pointer yields `nil`, the event belongs to the event fd, otherwise to a socket fd. This way `ev.Data` always contains a tagged pointer and the aliasing is gone. A few days later our fix was [merged](https://go-review.googlesource.com/c/go/+/819800).

## Summary

A Go application crashed sporadically on a 32-bit ARM embedded Linux system with a fatal netpoll error. The error looked like an epoll problem, but epoll worked just fine. The Go runtime stores both a raw pointer to `netpollEventFd` and tagged `pollDesc` pointers in the 8 byte `ev.Data` field. On 32-bit little endian systems, the raw pointer aliases with the `fdseq` tag. Once a long-running program has recycled millions of `pollDesc` objects, netpoll mistakes a socket fd for the event fd and crashes. Our fix stores a tagged `nil` `pollDesc` for the event fd instead, which removes the aliasing.

The bug slipped into the Go runtime with Go 1.21 in 2023. It went unnoticed until the first report in March 2025 and finally got fixed in 2026. We can only speculate, but this suggests that Google itself no longer runs any 32-bit Go programs. Otherwise they would have hit the bug themselves long before we did.

We’d like to thank Frequentis AG for providing the budget to analyze and fix the problem.
