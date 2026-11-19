---
title: Back Button
source: https://www.rapid7.com/blog/post/ve-cve-2026-123007-critical-nginx-http-2-integer-underflow-leads-to-rce-fixed
source_host: www.rapid7.com
clip_date: 2026-11-19T09:16:52+08:00
trace_id: 6af49dc2-eb18-4806-a6e1-7260ab55c109
content_hash: 253350b5fd959f5fdd8de1fc0926ca66d735c2e05b483042b50ebe8ff9e77d76
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-811b-a7c0-d0c2c023cb2e
ioc:
  cves:
    - CVE-2026-123007
  cwes:
    - CWE-191
  hashes:
    - 5ab5b0b01097420873a3f3330f44248e34a3c2a3e8d5ee30658aeae8cb7435da
  domains: []
  tools: []
  techniques: []
---

## Overview

Today, both Rapid7 and [F5](https://my.f5.com/manage/s/article/K000163926) are disclosing [CVE-2026-123007](https://www.cve.org/CVERecord?id=CVE-2026-123007), a critical integer underflow vulnerability affecting nginx HTTP/2, which can allow for unauthenticated remote code execution (RCE) against affected servers under certain conditions.

|     |     |     |     |
| --- | --- | --- | --- |
| **CVE ID** | **Description** | **CWE** | **CVSSv4** |
| CVE-2026-123007 | HTTP/2 flow-control memory corruption permitting worker-context RCE | [CWE-191 (Integer Underflow)](https://cwe.mitre.org/data/definitions/191.html) | [9.2 (Critical)](https://www.first.org/cvss/calculator/4.0#CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N) |

nginx can miscalculate how much response data an HTTP/2 client has allowed it to send. A remote, unauthenticated client can exploit this error by cancelling queued response data, then make nginx use an invalid length when copying a later response. The resulting memory corruption can disclose data, interrupt service, and execute code with the nginx worker process's permissions.

## Impact

Rapid7 has developed a [proof-of-concept](https://github.com/sfewer-r7/CVE-2026-123007) to demonstrate leveraging CVE-2026-123007 for unauthenticated RCE against a vulnerable linux/amd64 Docker image running nginx version 1.31.8, as shown below in Figure 1. The target nginx server’s configuration had [http2 on](https://nginx.org/en/docs/http/ngx_http_v2_module.html#http2) and TLS enabled. Note that for brevity, video playback is at 8x speed.

![nginx-http2-rce-720p-8x.gif](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e36870d52415d5e5.gif)

*Figure 1: Video demonstrating unauthenticated RCE against NGINX 1.31.8 via CVE-2026-123007*

Leveraging CVE-2026-123007 for RCE requires a significant amount of network traffic to be transmitted, approximately 128 GB of HTTP/2 data. Both available network bandwidth and connection timeouts will place practical limitations on Internet exploitation. In the above example shown in Figure 1, exploitation takes two and a half minutes. The approximate timings to transmit the required network data over a 10 Gbit/s network is two minutes, while on a 1 Gbit/s network it is seventeen minutes. Due to nginx’s default one hour connection lifetime, a network slower than approximately 300 Mbit/s will take over the one hour connection limit threshold and will not be able to succeed. Additionally, should an HTTP/2 connection be proxied, the precise attacker-controlled HTTP/2 frames being transmitted will likely not be retransmitted in a way that satisfies exploiting the vulnerability.

Finally, the exploitation strategy developed depends on a specific x86-64 glibc EVEX/YMM memcpy implementation selected at runtime, based on the avx512f and avx512vl CPU features. Alternative RCE exploitation strategies may be viable, but none are currently known.

## Credit

This vulnerability was discovered by Stephen Fewer, Senior Principal Security Researcher at [Rapid7](https://www.rapid7.com/), and is being disclosed in accordance with Rapid7's [vulnerability disclosure policy](https://www.rapid7.com/security/disclosure/).

## Technical analysis

The version of nginx tested was a linux/amd64 Docker image for nginx version 1.31.8 (nginx@sha256:5ab5b0b01097420873a3f3330f44248e34a3c2a3e8d5ee30658aeae8cb7435da), and ran with an exposed HTTPS service and http2 enabled.

### How a client controls HTTP/2 response data

HTTP/2 carries messages called frames over a connection. Each request and response belongs to a numbered stream, so one connection can carry several exchanges at once. Response-body bytes are carried in DATA frames.

For this vulnerability, nginx is the sender and the remote client is the receiver. The client grants nginx permission, or flow-control credit, to send a certain number of DATA bytes. nginx tracks the remaining credit in two counters: one for each stream and one shared by the connection. Sending DATA must be permitted by both counters. These HTTP/2 counters are separate from TCP's receive window.

The client grants more credit by sending a WINDOW_UPDATE frame containing a positive increment. A stream identifier of zero increases the connection’s send credit. A nonzero stream identifier increases the send credit for the stream with that specific nonzero identifier. HTTP/2 limits the increment and the resulting window to 2^31-1 bytes, or 2,147,483,647 (0x7FFFFFFF). This report calls that maximum MAX.

The client can also send a SETTINGS frame containing a SETTINGS_INITIAL_WINDOW_SIZE parameter. This changes the starting credit for new streams. nginx must also adjust each active stream's remaining credit by the difference between the old and new setting values. It does not change the connection's credit. A reduction can therefore leave an active stream with negative credit until the client grants more. The connection window has no equivalent reduction: it must remain between zero and MAX. [RFC 9113, section 6.9](https://www.rfc-editor.org/rfc/rfc9113.html#section-6.9) defines these limits and the required errors.

nginx stores the connection counter in h2c->send_window, where h2c is the HTTP/2 connection record. Its size_t type is an unsigned integer: on the verified 64-bit build it can hold values from zero to 2^64-1. The size_t type can therefore hold values above HTTP/2's maximum connection window of 2^31-1 bytes (MAX). nginx must enforce that protocol limit in its own logic.

```c
// src/http/v2/ngx_http_v2.h
#define NGX_HTTP_V2_MAX_WINDOW ((1U << 31) - 1) // <--- [1]
struct ngx_http_v2_connection_s {
    // ...
    size_t send_window;                         // <--- [2]
    // ...
};
struct ngx_http_v2_stream_s {
    // ...
    ssize_t send_window;
    // ...
};
```

The rule that the connection counter at \[2\] must never exceed MAX at \[1\] is the connection-window invariant. The separate stream counter, stream->send_window, is explicitly declared as ssize_t, a signed 64-bit integer on the verified build. That allows SETTINGS_INITIAL_WINDOW_SIZE to make a stream's credit temporarily negative. The connection counter remains unsigned. The later unsafe conversion occurs when the output filter treats excessive connection credit as a signed 64-bit off_t response length.

Leveraging vulnerability has four main stages:

1.  By slowing its reading of server output, the client keeps selected DATA frames queued and unstarted. It raises the connection's credit to MAX and the selected streams' credit to just below MAX. A SETTINGS frame that increases SETTINGS_INITIAL_WINDOW_SIZE enough to exceed the stream limit makes nginx close those streams while leaving the connection usable. Request cleanup then restores the reserved credit above MAX.
    
2.  An unsigned subtraction in the next connection WINDOW_UPDATE check underflows. Repeated accepted WINDOW_UPDATE frames can then raise the counter into the upper half of its 64-bit range without requiring the addition to wrap.
    
3.  On the verified 64-bit build, nginx interprets that excessive counter as a negative response length and creates an invalid buffer. Buffered TLS output then passes a huge unsigned byte count to the memory-copy function memcpy, causing out-of-bounds reads and writes.
    
4.  These constrained memory accesses depend on the build and selected copy routine. With a suitable memory layout, an attacker can use disclosed addresses and controlled overwrites to execute code with the nginx worker process's permissions.
    

### Cancelling queued DATA restores too much credit

When nginx queues a DATA frame at \[3\], it subtracts the frame's DATA length from the connection's credit counter at \[4\] and then from the stream's credit counter. This reserves the credit before the bytes reach the client and prevents other streams from spending the same connection credit:

```c
// src/http/v2/ngx_http_v2_filter_module.c
// ngx_http_v2_send_chain()
// ...
ngx_http_v2_queue_frame(h2c, frame);       // <--- [3]

h2c->send_window -= frame_size;            // <--- [4]
stream->send_window -= frame_size;
stream->queued++;
```

An attacker can keep a later response queued by slowing or stopping its reading of earlier server output. Once the transport cannot accept more output, nginx must wait. This condition is transport backpressure. The attacker needs enough of it to keep the selected DATA frame unstarted: none of that frame's bytes have yet entered TLS output or the socket. Stopping response reads does not prevent the client from sending control frames in the other direction.

While the DATA remains queued, the client sends a connection WINDOW_UPDATE that raises nginx's reduced counter to MAX. The problem appears when the request that owns the queued DATA then closes. Its request-cleanup handler removes the unstarted DATA and returns the reserved credit:

```c
// src/http/v2/ngx_http_v2_filter_module.c
// ngx_http_v2_filter_cleanup()
// ...
for ( ;; ) {
    frame = *fn;
    if (frame == NULL) {
        break;
    }
    if (frame->stream == stream && !frame->blocked) { // <--- [5]
        *fn = frame->next;
        window += frame->length;                      // <--- [6]
        if (--stream->queued == 0) {
            break;
        }
        continue;
    }
    fn = &frame->next;
}
// ...
h2c->send_window += window;                           // <--- [7]
```

The test at \[5\] selects removable, unstarted frames for that request. The local variable window totals their DATA lengths at \[6\]. The addition at \[7\] does not check whether restoring those bytes takes the connection counter above MAX.

For example, restoring 1,393 bytes after the counter has reached 2,147,483,647 (0x7FFFFFFF) produces 2,147,485,040 (0x80000570). This value is invalid under HTTP/2 as it exceeds MAX, although it still fits in a 64-bit size_t; the addition has not yet wrapped around. The unchecked restoration at \[7\] is the first invalid state in the vulnerability. The attacker still needs a way to close the selected requests while preserving the connection, so the excessive counter can be used again.

### A SETTINGS error closes the stream but leaves the connection usable

When a SETTINGS frame increases SETTINGS_INITIAL_WINDOW_SIZE enough that an active stream's credit would exceed MAX, nginx terminates that stream but leaves the HTTP/2 connection usable. A client can create this condition by first sending a stream WINDOW_UPDATE to put the selected stream just below MAX. It then sends a SETTINGS frame that increases the initial stream-window setting. For example, changing the setting from 65,535 to 65,537 adds two bytes to every active stream. A stream already at MAX-1 would become MAX+1, even though the new setting value itself is allowed.

RFC 9113 requires this condition to end the connection with FLOW_CONTROL_ERROR. nginx instead calls ngx_http_v2_terminate_stream() for each affected stream. That function sends RST_STREAM, which ends an individual stream, and causes the request to be cleaned up. The loop then continues using the same connection:

```c
// src/http/v2/ngx_http_v2.c
// ngx_http_v2_adjust_windows()
// ...
if (delta > 0
    && stream->send_window
          > (ssize_t) (NGX_HTTP_V2_MAX_WINDOW - delta))
{
    if (ngx_http_v2_terminate_stream(h2c, stream,
                                     NGX_HTTP_V2_FLOW_CTRL_ERROR)
        == NGX_ERROR)
    {
        return NGX_ERROR;
    }
    continue;                                      // <--- [8]
}
```

Here, delta is the difference between the new and old setting values. Request cleanup performs \[5\] through \[7\], while continue at \[8\] leaves the HTTP/2 connection open. The attacker can now send further frames on the connection whose credit has exceeded MAX.

### The next WINDOW_UPDATE causes an integer underflow

When another connection WINDOW_UPDATE arrives, nginx tries to calculate how much additional credit is still allowed:

```c
// src/http/v2/ngx_http_v2.c
// ngx_http_v2_state_window_update()
// ...
if (window > NGX_HTTP_V2_MAX_WINDOW - h2c->send_window) { // <--- [9]
    // ...
    return ngx_http_v2_connection_error(h2c,
                                        NGX_HTTP_V2_FLOW_CTRL_ERROR);
}
h2c->send_window += window;                            // <--- [10]
```

In this function, window is the increment received from the client. The subtraction at \[9\] is safe only while the stored counter is no greater than MAX. If cleanup has restored R excess bytes, the intended allowance is MAX - (MAX + R), or -R. Unsigned arithmetic cannot represent that negative result. On the verified 64-bit build it wraps to 2^64 - R, a very large positive number. This is the integer underflow identified by CWE-191.

The incorrect allowance lets further client increments pass the check. By sending many increments, each no greater than MAX, the client can raise the counter to 2^63 or above without wrapping the addition itself, shown at \[10\] above. Such a value has the top bit of its 64-bit representation set. It is still an unsigned value, but it no longer fits in a signed 64-bit integer. That distinction matters when nginx prepares the next response.

This amplification accounts for the large traffic requirement. A connection WINDOW_UPDATE occupies 13 HTTP/2 bytes: a [nine-byte frame header](https://www.rfc-editor.org/rfc/rfc9113.html#section-4.1) and a [four-byte payload](https://www.rfc-editor.org/rfc/rfc9113.html#section-6.9). The credit granted by that frame is not data actually transmitted. Starting from the small over-credit state described above, reaching 2^63 by maximum-size increments takes about 2^32 frames, or 52 GiB. Reaching the near-2^64 values used for the confirmed read/write path takes about 2^33 increments, or 104 GiB. nginx also limits control-frame traffic relative to other received data. The current code-execution reproduction sends about 15 GiB of additional request-header traffic to stay within that limit, bringing its reported plaintext total to about 119.02 GiB. TLS and network overhead increase the actual wire traffic. These figures describe this 64-bit amplification route, not a universal minimum for every possible exploit.

### Excessive credit becomes a negative response length

The client can make an active stream with available credit process an ordinary response body. nginx's HTTP/2 output filter decides how many body bytes to include in a DATA frame. Before following that calculation, it is useful to define the buffer it will create.

An in-memory nginx buffer is described by a ngx_buf_t record. Its pos pointer is the memory address of the next byte to send. Its last pointer is the address immediately after the available data. For four available bytes, last must be four bytes after pos; subtracting pos from last gives the length, four. A valid buffer therefore cannot have last before pos. nginx links these buffer records together into an output chain, which is a list of data waiting to be sent.

In ngx_http_v2_send_chain(), the byte limit is an off_t, a signed 64-bit integer on the verified build. The excessive unsigned connection counter is converted to that signed type at \[11\]. On this build, a value of 2^64 - d, where d is a small positive byte count, becomes -d:

```c
// src/http/v2/ngx_http_v2_filter_module.c
// ngx_http_v2_send_chain()
// ...
if (limit == 0 || limit > (off_t) h2c->send_window) {
    limit = h2c->send_window;                         // <--- [11]
}
if (limit > stream->send_window) {
    limit = (stream->send_window > 0) ? stream->send_window : 0;
}
// ...
if ((off_t) frame_size > limit) {
    frame_size = (size_t) limit;                      // <--- [12]
}
// ...
rest = frame_size;
while ((off_t) rest >= size) {                        // <--- [13]
    // ...
}
if (rest) {
    cl = ngx_http_v2_filter_get_shadow(stream, in->buf,
                                       offset, rest); // <--- [14]
    // ...
}
```

The stream-window check does not reject a negative limit: it only reduces a limit that is too large. At \[12\], the negative limit becomes a huge unsigned frame_size. Casting the same value back to off_t makes it negative again, so \[13\] skips the loop that would normally consume and bound the available body bytes. At \[14\], nginx passes the invalid length to a helper whose size parameter is also a signed off_t.

That helper creates a shadow buffer: a new metadata record referring to part of the existing response data, without copying the response body itself. It sets the new end pointer using the supplied length:

```c
// src/http/v2/ngx_http_v2_filter_module.c
// ngx_http_v2_filter_get_shadow()
static ngx_chain_t *
ngx_http_v2_filter_get_shadow(ngx_http_v2_stream_t *stream, ngx_buf_t *buf,
    off_t offset, off_t size)
{
    // ...
    ngx_memcpy(chunk, buf, sizeof(ngx_buf_t));
    // ...
    if (ngx_buf_in_memory(chunk)) {
        chunk->pos += offset;
        chunk->last = chunk->pos + size;              // <--- [15]
    }
    // ...
}
```

Because size is negative, \[15\] places last before pos. The response body has not become larger; its buffer metadata is now invalid. The next output stage trusts that metadata.

### Buffered TLS output copies beyond the buffers

For buffered TLS output, ngx_ssl_send_chain() gathers bytes from the output chain into a temporary staging buffer before encryption. It calculates each input buffer's length using last - pos. The invalid buffer produces a negative signed length at \[16\]:

```c
// src/event/ngx_event_openssl.c
// ngx_ssl_send_chain()
// ...
ssize_t send, size, file_size;
// ...
size = in->buf->last - in->buf->pos;                  // <--- [16]
if (size > buf->end - buf->last) {
    size = buf->end - buf->last;
}
if (send + size > limit) {
    size = (ssize_t) (limit - send);
}
// ...
ngx_memcpy(buf->last, in->buf->pos, size);            // <--- [17]
buf->last += size;
in->buf->pos += size;
```

Both checks only reduce lengths that are too large. Neither rejects a negative length. memcpy takes an unsigned size_t byte count, so \[17\] converts -d back into the huge value 2^64-d. The actual source and destination buffers are far smaller. This is where the invalid connection credit first reaches an out-of-bounds native memory access.

A copy that actually traversed such an enormous range would normally encounter inaccessible memory and crash the worker. In the tested x86-64 glibc implementation, however, certain lengths just below 2^64 cause the machine-level end-address calculations to wrap (Please see Addendum A below for more details on this unexpected behavior). For a length of 2^64-d, adding the length to a start address can produce an address d bytes before it. The optimized copy uses these end addresses in its loop conditions, so it can finish after a limited number of reads and writes that reach outside the intended buffers. The copy can return if all locations it actually accesses are accessible; other lengths, memory layouts, or copy implementations can fault immediately. If it returns, nginx also moves both buffer positions backward by the negative signed length.

### Exploitation

The invalid copy can both read and overwrite worker memory. It does not give the client an HTTP/2 field in which it can simply choose any memory address. The useful addresses depend on where nginx allocated the response and TLS buffers, how much output is already buffered, and which copy routine the C library selected. These are constrained read and write capabilities, not an unconditional arbitrary read or write.

After creating the invalid DATA buffer, ngx_http_v2_send_chain() updates its position in the original response and records the bytes that remain to be sent:

```c
// src/http/v2/ngx_http_v2_filter_module.c
// ngx_http_v2_send_chain()
// ...
offset += rest;                                       // <--- [18]
size -= rest;
// ...
if (offset) {
    cl = ngx_http_v2_filter_get_shadow(stream, in->buf,
                                       offset, size); // <--- [19]
    // ...
    in->buf = cl->buf;
    // ...
}
```

Here, offset is the position within the original body and size is its remaining length. Starting at offset zero, the same unsigned value representing -d makes \[18\] move the offset backward by d and increase the remaining length by d on the verified build. The shadow buffer created at \[19\] therefore has a positive length, but starts d bytes before the original response and ends at its original end. If the oversized copy and connection survive, later ordinary DATA frames can carry those preceding bytes to the client through TLS. They can include pointers into the heap, where nginx dynamically allocates request data, or into loaded libraries. Those pointers disclose addresses that address-space layout randomization (ASLR) would otherwise hide.

On the write side, nginx stores client-supplied request data in heap allocations. With a suitable allocation layout, the oversized copy can pick up those attacker-selected bytes and replace fields in a nearby live heap object. One useful field is a callback: a stored function pointer that nginx intends to call later. An attacker who knows the relevant process addresses and can overwrite that field may redirect normal nginx processing to existing executable code. The overwrite need not contain new machine code. This explains the general route from disclosed addresses and controlled bytes to code execution; it does not claim that every build exposes the same object or callback. Execution has the worker's permissions; execution as the master process or root has not been established.

The [proof-of-concept](https://github.com/sfewer-r7/CVE-2026-123007) first recovers heap addresses and pointers into nginx and the GNU C Library (glibc) from memory preceding the original response body. It uses those addresses and the overwrite to forge nginx request and response-buffer objects that return selected parts of glibc's loaded image over HTTP/2. The returned ELF metadata is parsed to resolve system() despite ASLR, then a request-pool cleanup callback is redirected to invoke an attacker-chosen command.

### Addendum A: Why an oversized memcpy can return

The TLS copy via ngx_memcpy (shown at \[17\] above) receives a byte count of 2^64-d, where d is a small positive distance. A routine that actually traversed that entire range would normally fault. This addendum explains why one optimized glibc implementation can instead finish after a limited number of out-of-bounds accesses.

glibc chooses among optimized copy routines according to the CPU's capabilities. The tested x86-64 routine uses EVEX/YMM instructions, which can move 32 bytes at a time. In the corresponding glibc 2.41 source, the [EVEX wrapper](https://github.com/bminor/glibc/blob/glibc-2.41/sysdeps/x86_64/multiarch/memmove-evex-unaligned-erms.S) includes a shared memcpy/memmove implementation, and its [vector configuration](https://github.com/bminor/glibc/blob/glibc-2.41/sysdeps/x86_64/multiarch/x86-evex256-vecs.h) sets VEC_SIZE to 32. A vector is the block of bytes handled by one such instruction.

The following excerpt uses AT&T assembly syntax, in which the source operand comes first. The CPU register %rdi holds the original destination address, called D below; %rsi holds the source address, Q; and %rdx holds the byte count, n. One route enters this backward-copy branch when D and Q are different and the unsigned difference D-Q is smaller than n. This includes the ordinary case where D is above Q and n is close to the unsigned 64-bit maximum.

```c
// glibc 2.41: sysdeps/x86_64/multiarch/memmove-vec-unaligned-erms.S
// Function: CPU-selected memcpy implementation, backward-copy branch
    // ...
L(more_8x_vec_backward):
    // ...
    leaq (VEC_SIZE * -4 + -1)(%rdi, %rdx), %rcx // <--- [20]
    // ...
    andq $-(VEC_SIZE), %rcx                     // <--- [21]
    // ...
L(loop_4x_vec_backward):
    // ... load and store four 32-byte vectors
    addq $(VEC_SIZE * -4), %rcx                 // <--- [22]
    cmpq %rcx, %rdi                             // <--- [23]
    jb L(loop_4x_vec_backward)
    // ... store the previously loaded leading and trailing vectors
    VZEROUPPER_RETURN                           // <--- [24]
```

The full [glibc assembly source](https://github.com/bminor/glibc/blob/glibc-2.41/sysdeps/x86_64/multiarch/memmove-vec-unaligned-erms.S#L513) shows the omitted loads and stores. At \[20\], leaq calculates an address without reading memory. Its 64-bit result keeps only the low 64 bits. At \[21\], andq rounds that address down to a 32-byte boundary. Calling the resulting destination address cursor, the calculation is:

```c
cursor = align_down_32((D + n - 129) modulo 2^64)
       = align_down_32(D - d - 129), when n = 2^64-d
```

Here, align_down_32 means rounding down to the nearest address divisible by 32; it is explanatory notation, not a glibc function. For an ordinary heap address and a small d, the calculated cursor is already below D.

The loop starts by copying one 128-byte block. Instruction \[22\] then moves the cursor backward by another 128 bytes. The comparison and unsigned jump at \[23\] repeat the loop only while D < cursor. Because the cursor is already below D, the jump is not taken. The routine writes its remaining leading and trailing vectors, then returns at \[24\]. It has not copied the enormous requested range: the wrapped address has made the loop stop after a small set of accesses. Those accesses can still read and overwrite memory outside the actual buffers.

## Remediation

The following vendor supplied fixes are available.

|     |     |     |
| --- | --- | --- |
| **Product** | **Vulnerable Versions** | **Fixed Version** |
| NGINX Plus | 37.1.0 - 37.2.0.1 | 37.3.0.1 |
| NGINX Plus | 37.0.0 - 37.0.7.1 | 37.0.8.1 |
| NGINX Plus | R34 - R36 | None |
| NGINX Open Source | 1.31.0 - 1.31.8 | 1.31.9 |
| NGINX Open Source | 1.9.5 - 1.30.6 | 1.30.7 |

For the latest remediation information, please see the vendor [advisory](https://my.f5.com/manage/s/article/K000163926).

## Disclosure timeline

-   **November 11, 2026:** Rapid7 makes initial outreach to F5.
    
-   **November 12, 2026:** F5 confirms outreach and Rapid7 discloses the vulnerability. F5 confirms receipt of the disclosure.
    
-   **November 16, 2026:** F5 confirms validation of the vulnerability, CVE assignment, and a disclosure date of November 18, 2026.
    
-   **November 18, 2026:** This disclosure.
