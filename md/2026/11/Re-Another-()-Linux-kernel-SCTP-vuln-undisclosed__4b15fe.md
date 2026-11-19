---
title: "Re: Another (?) Linux kernel SCTP vuln undisclosed"
source: https://seclists.org/oss-sec/2026/q4/783
source_host: seclists.org
clip_date: 2026-11-19T13:31:50+08:00
trace_id: 4b60f788-f6d4-4159-b32e-b66421ca86bc
content_hash: 4b638fc6193747d88f91525684c27f41be4606a10fab7ce5672e78bb9ddbe7d3
status: synced
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8129-b356-d0853d386cd4
ioc: null
---

## oss-sec mailing list archives

## Re: Another (?) Linux kernel SCTP vuln undisclosed

* * *

*From*: Jeffrey Walton <noloader () gmail com>  
*Date*: Wed, 18 Nov 2026 21:11:38 -0500  

* * *

```
On Wed, Nov 18, 2026 at 6:57 PM Rich Felker <dalias () libc org> wrote:
```

> ```swift
> The nginx2root thing is not itself a root vuln, but relies on an
> undisclosed LPE vuln in the Linux kernel to get root. According to the
> vuln website (https://nginx2root.com/),
> 
>     "The host-root stage uses a separate Linux SCTP kernel
>     vulnerability and must be assessed separately."
> 
>     ....
> 
>     "The kernel bug is a separate local privilege escalation
>     vulnerability and needs its own patch, which will be released in
>     the coming weeks."
> 
> It's not 100% clear that this is new, but anyone not needing SCTP
> should probably block loading of the module via modprobe.d
> 
> I'm posting this here because it does not seem to have been announced
> outside of the nginx2root website.
> ```

```css
I think one of the problems at the moment is, the kernel has not patched
the underlying SCTP vulnerability.[0,1]

Xint posted recommended mitigations until all the patches are available at
[2].  From [2]:

    ... disabling HTTP/2 addresses only two of the five nginx
vulnerabilities.

[0] <https://xint.io/blog/nginx2root-remote-code-execution>
[1] <https://lwn.net/Articles/1108362/>
[2] <
https://xint.io/blog/nginx2root-remote-code-execution#33-emergency-mitigations-before-patching-14
```

```
Jeff
```

* * *

### Current thread:

-   [Another (?) Linux kernel SCTP vuln undisclosed](https://seclists.org/oss-sec/2026/q4/781) *Rich Felker (Nov 18)*
    -   **Re: Another (?) Linux kernel SCTP vuln undisclosed** *Jeffrey Walton (Nov 18)*
