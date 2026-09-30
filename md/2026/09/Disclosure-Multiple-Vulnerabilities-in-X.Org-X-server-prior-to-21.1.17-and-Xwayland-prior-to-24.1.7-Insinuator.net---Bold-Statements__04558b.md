---
title: "Disclosure: Multiple Vulnerabilities in X.Org X server prior to 21.1.17 and Xwayland prior to 24.1.7 | Insinuator.net - Bold Statements"
source: https://insinuator.net/2025/06/disclosure-multiple-vulnerabilities-xserver-xwayland/
source_host: insinuator.net
clip_date: 2026-09-30T10:22:24+08:00
trace_id: 55f72725-8e2c-4790-a23c-cd62bfb84e35
content_hash: e4dc41c9d0b50c44037c96c2bf7f0529f37ed71caa4275ffd6bee5673010128b
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: ERNW Insinuator
ai_summary: X.Org X server 21.1.17 和 Xwayland 24.1.7 之前存在多处整数溢出、越界访问与 DoS 漏洞，源于旧代码缺乏边界检查。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3eb75244-d011-813b-a79b-c4219f509894
ioc:
  cves:
    - CVE-2025-49175
    - CVE-2025-49176
    - CVE-2025-49177
    - CVE-2025-49178
    - CVE-2025-49179
    - CVE-2025-49180
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> X.Org X server 21.1.17 和 Xwayland 24.1.7 之前存在多处整数溢出、越界访问与 DoS 漏洞，源于旧代码缺乏边界检查。
> 
> - **影响范围：** 影响 X.Org X server <21.1.17、Xwayland <24.1.7，涉及 Big-Requests、Record、RandR、Render、XFixes 等扩展。
> - **整数溢出：** CVE-2025-49176/49179/49180 由长度移位或乘法溢出导致分配过小，随后越界写内存。
> - **越界访问：** CVE-2025-49175 动画光标未校验至少一个元素；CVE-2025-49177 缺少请求长度检查，可读旧连接残留数据。
> - **DoS：** CVE-2025-49178 接收缓冲区共享与 ignoreBytes 处理不当，可能错误忽略其他客户端请求。
> - **缓解与披露：** 多数桌面不暴露 X server 且非 root；SSH X 转发需谨慎；2025-03-27 起报，06-17 发布修复。

The X11 Window System has been used since September 1987 for Unix desktop systems, allowing applications to display their windows. Today, one of the server implementations of the protocol is the X.Org X server and XWayland, which both use the same codebase. While reviewing the X server, several legacy security issues were identified. These appear to originate from earlier design stages when security considerations were less prominent. Despite the project’s maturity and widespread use, some of these issues have persisted.

## Integer Overflows

Due to its age, the X server works primarily with 32-bit integers. If two large numbers are added, a number lager than can be represented by a 32-bit integer will wrap around and become a smaller number. This can cause issues when the wrapped number is used to allocate memory. Then two memory copies of the two sizes are performed, as the allocated memory is less than the copied amount and will write out-of-bounds memory.

### Big-Requests Extension (CVE-2025-49176)

The Big-Requests Extension allows sending requests larger than `0xFFFF` integers, so 262140 bytes, which is the maximum request size the X11 protocol allows without the extension. To allow this, the original length field of big requests is set to 0, and an unsigned integer is added after the header, which contains the new length.

This is the length in integer units, not bytes, so the X server will convert the number into bytes by multiplying by 4 in some places. If the upper two bits of the length are set, they will be shifted out since the implementation uses 32-bit integers.

This happens multiple times in `ReadRequestFromClient`. The following is an excerpt of the function.

```c
else {
    /* We have a whole xReq.  We can tell how big the whole
        * request will be unless it is a Big Request.
        */
    request = (xReq *) oci->bufptr;
    needed = get_req_len(request, client);
    if (!needed && client->big_requests) {
        /* It's a Big Request. */
        move_header = TRUE;
        if (gotnow < sizeof(xBigReq)) {
            /* Still need more data to tell just how big. */
            needed = bytes_to_int32(sizeof(xBigReq));       /* needed is in CARD32s now */
            need_header = TRUE;
        }
        else
            needed = get_big_req_len(request, client);
    }
    client->req_len = needed;
    needed <<= 2;           /* needed is in bytes now */
}
if (gotnow < needed) {
    /* Need to read more data, either so that we can get a
        * complete xReq (if need_header is TRUE), a complete
        * xBigReq (if move_header is TRUE), or the rest of the
        * request (if need_header and move_header are both FALSE).
        */
    oci->lenLastReq = 0;
    if (needed > maxBigRequestSize << 2) {
        /* request is too big for us to handle */
        /*
            * Mark the rest of it as needing to be ignored, and then return
            * the full size.  Dispatch() will turn it into a BadLength error.
            */
        oci->ignoreBytes = needed - gotnow;
        oci->lenLastReq = gotnow;
        return needed;
    }
```

The function first checks that a full header is received and reads the `needed` from it, which is the length of the message in 4-byte units. It then stores this original length in `client->req_len`, which will later be used for bounds checks for requests, and `needed` is shifted by 2, which discards the upper two bits.

Later, there is a test that `needed` does not exceed `maxBigRequestSize`, but this is done too late as the overflow already happened.

This overflow can cause issues in request handlers such as `ProcRenderAddGlyphs` from the render extension with a message size of `0x40000001`. The `0x40000001` will cause the `ReadRequestFromClient` to read only 4 bytes, but the request handler will test that the received request has a good size with the `REQUEST_AT_LEAST_SIZE` macro, which will test that `client->req_len` is larger or equal to the minimum request size. This is the case, since `client->req_len` stores the original size.

Later `ProcRenderAddGlyphs` will calculate `remain = (client->req_len << 2) - sizeof(xRenderAddGlyphsReq);` will result in a negative value which will allow the later `if (remain < size)` test to not break and try to build a hash from the out of bound data in bits.

```c
static int
ProcRenderAddGlyphs(ClientPtr client)
{
[...]
    int remain, nglyphs;
[...]
    unsigned int size;
[...]
    REQUEST_AT_LEAST_SIZE(xRenderAddGlyphsReq);
[...]
    remain = (client->req_len << 2) - sizeof(xRenderAddGlyphsReq);
    glyphs = glyphsBase;
    gids = (CARD32 *) (stuff + 1);
    gi = (xGlyphInfo *) (gids + nglyphs);
    bits = (CARD8 *) (gi + nglyphs);
    remain -= (sizeof(CARD32) + sizeof(xGlyphInfo)) * nglyphs;

    /* protect against bad nglyphs */
    if (gi < ((xGlyphInfo *) stuff) ||
        gi > ((xGlyphInfo *) ((CARD32 *) stuff + client->req_len)) ||
        bits < ((CARD8 *) stuff) ||
        bits > ((CARD8 *) ((CARD32 *) stuff + client->req_len))) {
        err = BadLength;
        goto bail;
    }

    for (i = 0; i < nglyphs; i++) {
        size_t padded_width;
        glyph_new = &glyphs[i];
        padded_width = PixmapBytePad(gi[i].width, glyphSet->format->depth);
        if (gi[i].height &&
            padded_width > (UINT32_MAX - sizeof(GlyphRec)) / gi[i].height)
            break;
        size = gi[i].height * padded_width;
        if (remain < size)
            break;
```

Note that `size` is `unsigned`, so the compare `remain < size` is done with unsigned values and `remain` is negative, so when used as a `unsigned` value, it will be large.

### Record Extension (CVE-2025-49179)

The `RecordSanityCheckRegisterClients` function suffers from a integer overflow.

```c
static int
RecordSanityCheckRegisterClients(RecordContextPtr pContext, ClientPtr client,
                                 xRecordRegisterClientsReq * stuff)
{
[...]
    if (((client->req_len << 2) - SIZEOF(xRecordRegisterClientsReq)) !=
        4 * stuff->nClients + SIZEOF(xRecordRange) * stuff->nRanges)
        return BadLength;
[...]
    err = RecordSanityCheckClientSpecifiers(client, (XID *) &stuff[1],
                                            stuff->nClients, recordingClient);
    if (err != Success)
        return err;
    pRange = (xRecordRange *) (((XID *) &stuff[1]) + stuff->nClients);
    for (i = 0; i < stuff->nRanges; i++, pRange++) {
        if (pRange->coreRequestsFirst > pRange->coreRequestsLast) {
            client->errorValue = pRange->coreRequestsFirst;
            return BadValue;
        }
```

The `stuff->nClients` and `stuff->nRanges` can overflow due to the multiplications. This can cause issues further down the line as `RecordSanityCheckClientSpecifiers` will interpret the `nClients` as signed, which will cause the verification loop it contains to be skipped for large values of `nClients`, which results in negative values when interpreted as a signed value.

Afterwards, `pRange` will point out of bounds since it uses the original, large value of `nClients` and causes a segmentation fault when accessed in the loop.

### RandR Extension (CVE-2025-49180)

The RandR extension allows changing provider properties. The request handler will call `RRChangeProviderProperty` using the arguments provided by the user in the request.

If the property is already present and the mode is either `PropModeAppend` or `PropModePrepend`, the function will add the old size to the data length of the request. This will not overflow as `unsigned long` is a 64-bit value (on 64-bit systems), but later in `total_size = total_len * size_in_bytes;` the result of the multiplication will be truncated to 32-bit, as `total_size` is only 32 bit. This will result in the allocation being too small and the following `memcpy` s writing out-of-bounds.

```c
int
RRChangeProviderProperty(RRProviderPtr provider, Atom property, Atom type,
                       int format, int mode, unsigned long len,
                       void *value, Bool sendevent, Bool pending)
{
    RRPropertyPtr prop;
    rrScrPrivPtr pScrPriv = rrGetScrPriv(provider->pScreen);
    int size_in_bytes;
    int total_size;

    unsigned long total_len;
[...]
    size_in_bytes = format >> 3;
[...]
    if (mode == PropModeReplace)
        total_len = len;
    else
        total_len = prop_value->size + len;
    if (mode == PropModeReplace || len > 0) {
[...]
        total_size = total_len * size_in_bytes;
        new_value.data = (void *) malloc(total_size);
        if (!new_value.data && total_size) {
            if (add)
                RRDestroyProviderProperty(prop);
            return BadAlloc;
        }
        new_value.size = len;
[...]
        case PropModeAppend:
            new_data = (void *) (((char *) new_value.data) +
                                  (prop_value->size * size_in_bytes));
            old_data = new_value.data;
            break;
        case PropModePrepend:
            new_data = new_value.data;
            old_data = (void *) (((char *) new_value.data) +
                                  (prop_value->size * size_in_bytes));
            break;
        }
        if (new_data)
            memcpy((char *) new_data, (char *) value, len * size_in_bytes);
        if (old_data)
            memcpy((char *) old_data, (char *) prop_value->data,

                   prop_value->size * size_in_bytes);
```

## Out-of-bounds Accesses

In C, arrays can be used to store contiguous data. However, unlike newer languages, C expects the developer to do bounds checking and not access elements outside the size of the array. If X uses data from the client without proper checks, it might cause access to an array with an index that is outside the array’s size. In the best case, this causes a crash of the X server; in the worst, this is unnoticeable and can corrupt memory and the flow of the program.

### Rendering Extension (CVE-2025-49175)

The X Render extension allows the creation of animated cursors. To create such a cursor, a list of other cursors used for the animation frames, are supplied. Internally, the XServer assumes that this list has at least one element, as seen in the `AnimCursorCreate` function.

```c
int
AnimCursorCreate(CursorPtr *cursors, CARD32 *deltas, int ncursor,
                 CursorPtr *ppCursor, ClientPtr client, XID cid)
{
    CursorPtr pCursor;
    int rc = BadAlloc, i;
    AnimCurPtr ac;
    for (i = 0; i < screenInfo.numScreens; i++)
        if (!GetAnimCurScreen(screenInfo.screens[i]))
            return BadImplementation;
    for (i = 0; i < ncursor; i++)
        if (IsAnimCur(cursors[i]))
            return BadMatch;
    pCursor = (CursorPtr) calloc(CURSOR_REC_SIZE +
                                 sizeof(AnimCurRec) +
                                 ncursor * sizeof(AnimCurElt), 1);
    if (!pCursor)
        return rc;
    dixInitPrivates(pCursor, pCursor + 1, PRIVATE_CURSOR);
    pCursor->bits = &animCursorBits;
    pCursor->refcnt = 1;
    pCursor->foreRed = cursors[0]->foreRed;
    pCursor->foreGreen = cursors[0]->foreGreen;
    pCursor->foreBlue = cursors[0]->foreBlue;
    pCursor->backRed = cursors[0]->backRed;
    pCursor->backGreen = cursors[0]->backGreen;
    pCursor->backBlue = cursors[0]->backBlue;
```

However, this is never checked. On some platforms, the allocation of the temporary cursors array in `ProcRenderCreateAnimCursor` with `xallocarray(ncursor, sizeof(CursorPtr) + sizeof(CARD32))` might return 0 for allocations of size 0 and cause a `BadAlloc`, but this is not guaranteed. For example, `glibc` will return a pointer different from 0 and cause an out-of-bounds read in `AnimCursorCreate`.

```c
static int
ProcRenderCreateAnimCursor(ClientPtr client)
{
    REQUEST(xRenderCreateAnimCursorReq);
    CursorPtr *cursors;
[...]
    int ncursor;
[...]
    REQUEST_AT_LEAST_SIZE(xRenderCreateAnimCursorReq);
    LEGAL_NEW_RESOURCE(stuff->cid, client);
    if (client->req_len & 1)
        return BadLength;
    ncursor =
        (client->req_len -
         (bytes_to_int32(sizeof(xRenderCreateAnimCursorReq)))) >> 1;
    cursors = xallocarray(ncursor, sizeof(CursorPtr) + sizeof(CARD32));
    if (!cursors)
        return BadAlloc;
[...]
    ret = AnimCursorCreate(cursors, deltas, ncursor, &pCursor, client,
                           stuff->cid);
```

### XFIXES Extension Version 6 (CVE-2025-49177)

The `SetClientDisconnectMode` function introduced in version 6 of the XFixes extension does not check the request length with the expected `REQUEST_SIZE_MATCH` or `REQUEST_AT_LEAST_SIZE` macro found in all other request handlers. This allows sending a request with a shorter length and reading data from the receive buffer, which can contain request data from older connections by reading back the `disconnect_mode`, which contains the old data, using the `GetClientDisconnectMode` function.

```c
int
ProcXFixesSetClientDisconnectMode(ClientPtr client)
{
    ClientDisconnectPtr pDisconnect = GetClientDisconnect(client);
    REQUEST(xXFixesSetClientDisconnectModeReq);
    pDisconnect->disconnect_mode = stuff->disconnect_mode;

    return Success;
}
```

## DoS (CVE-2025-49178)

The XServer shares receive buffers between clients to reduce the number of required buffers. To share a buffer, the `AvailableInput` global is written. This will be done in `ReadRequestFromClient` if a full request was received and no more bytes remain in the buffer. However, this buffer might have a non-zero `ignoreBytes` set. If the buffer is shared and used by a different client, the client’s requests will erroneously be ignored and likely confuse the client. However, this is quite hard since a client switch needs to happen between receiving the full request and the next read attempt, which will take the same buffer but not share it anymore since the return when no complete request is received does not share the buffer, making this whole buffer sharing a bit useless.

```c
/* If there are bytes to ignore, ignore them now. */
if (oci->ignoreBytes > 0) {
    assert(needed == oci->ignoreBytes || needed == oci->size);
    /*
        * The _XSERVTransRead call above may return more or fewer bytes than we
        * want to ignore.  Ignore the smaller of the two sizes.
        */
    if (gotnow < needed) {
        oci->ignoreBytes -= gotnow;
        oci->bufptr += gotnow;
        gotnow = 0;

    }
    else {
        oci->ignoreBytes -= needed;
        oci->bufptr += needed;
        gotnow -= needed;
    }
    needed = 0;
}
oci->lenLastReq = needed;
/*
    *  Check to see if client has at least one whole request in the
    *  buffer beyond the request we're returning to the caller.
    *  If there is only a partial request, treat like buffer
    *  is empty so that select() will be called again and other clients
    *  can get into the queue.
    */
gotnow -= needed;
if (!gotnow)
    AvailableInput = oc;
```

## Impact

While the X server can be accessible from the network and could allow remote attackers to abuse these issues, most desktop environments do not expose the X server today. Furthermore, they are run with regular user and not root privileges. These measures reduce the impact from a remote attacker to a local attacker, at which point there are likely other simpler ways to achieve the attacker’s goal. However, when using SSH with X forwarding, care should be taken as attackers on the remote machine could connect to your local X server.

## Conclusion

The X.Org X server is a aged and large project that grew over time with the help of the open-source community. All of these issues gave me a feeling that the source code itself can best describe: `party_like_its_1989 = TRUE;`[1](#fn:1)

## Disclosure Timeline

-   **March 27, 2025:** ERNW informs the X.Org Security Team of the `XServer Render Extension Animated Cursor OOB Access Crash` vulnerability.
-   **March 28, 2025:** Red Hat: Confirmation of the vulnerability.
-   **April 03, 2025:** ERNW informs the X.Org Security Team of the `XServer Big-Requests Extension Integer Overflow` vulnerability.
-   **April 07, 2025:** Red Hat: Confirmation of the vulnerability.
-   **April 15, 2025:** ERNW informs the X.Org Security Team of the remaining issues.
-   **April 28, 2025:** Red Hat: Confirmation of the vulnerability.
-   **June 03, 2025:** Red Hat provides a draft of proposed fixes and the security advisory.
-   **June 17, 2025:** Release of the fix, publication of the security advisory and this blog post.

We want to thank Red Hat for the smoothly coordinating the vulnerability remediation process and preparing/publishing a security advisory as well as issuing the CVEs.

Cheers!

Nils

1.  [https://gitlab.freedesktop.org/xorg/xserver/-/blob/8cb078f8b6be8f53d3ad53b74325b5369b90c704/os/utils.c#L676](https://gitlab.freedesktop.org/xorg/xserver/-/blob/8cb078f8b6be8f53d3ad53b74325b5369b90c704/os/utils.c#L676) [↩](#fnref:1 "return to article")
