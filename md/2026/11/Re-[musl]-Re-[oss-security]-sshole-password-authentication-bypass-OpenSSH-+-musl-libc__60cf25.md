---
title: 'Re: [musl] Re: [oss-security] "sshole": password authentication bypass: OpenSSH + musl libc'
source: https://seclists.org/oss-sec/2026/q4/608
source_host: seclists.org
clip_date: 2026-11-10T08:13:16+08:00
trace_id: 5b8a5fa8-2073-4f1c-b130-502db22af75c
content_hash: b3c53c3fae54bacfb9636193013a67a6e83a641c7446179aade7150e312799e7
status: imaged
tags: []
series: null
feed_source: oss-security·漏洞披露
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: null
ioc: null
---

## oss-sec mailing list archives

## Re: \[musl\] Re: \[oss-security\] "sshole": password authentication bypass: OpenSSH + musl libc

* * *

*From*: Rich Felker <dalias () libc org>  
*Date*: Mon, 9 Nov 2026 14:24:27 -0500  

* * *

```
On Mon, Nov 09, 2026 at 10:43:38PM +0400, Loganaden Velvindron wrote:
```

> ```
> On Fri, 6 Nov 2026 at 21:17, Martin Steigerwald <martin () lichtvoll de> wrote:
> ```
> 
> > ```
> > Greetings.
> > 
> > Matt Johnston - 06.11.26, 03:05:13 CET:
> > ```
> > 
> > > ```
> > > Prior to ~2019 when the OpenSSH change was made, Debian
> > > would have shown a different manpage that only documents
> > > NULL for error [1].
> > > ```
> 
> ```
> This is the approach I'm taking on my build of Alpine Linux.
> 
> I would like to also submit a patch to musl to have this as a build option.
> @musl, any interest in having this as a build option ?
> ```

```rust
I didn't see you'd also asked this on-list, so copying my answer here:

This will possibly be changed (to always return null for failure) in
the next release cycle anyway, but as a general principle we don't do
behavioral build options.

This was a very intentional choice from seeing how things went with
uclibc and the combinatorics of build-time options that developers
aren't familiar with when things break for users. It's not that any
one such option is intractable to deal with, but that if you're going
to support them, you eventually end up with lots of them.

You're of course free to apply your own patches locally and share them
with others since this is free software though. It's just not
something upstream will be responsible for as supported usage.

For Alpine specifically, I think we can very easily check if there are
any other packages doing wrong things like OpenSSH was. For example by
searching symbol tables for programs using crypt and grepping their
sources for the calls. I'm pretty sure we won't find any since this is
a very obscure hack they came up with for timing masking. Users may
however have self-compiled stuff that crashes if crypt returns null,
and there may even be packages that do, so I think we could use a good
advance warning to users when this is going to change, and refrain
from backporting a change to stable dists since it is a potentially
breaking change and *not* a security fix. So my recommendation would
be not trying to preempt any upstream change but taking part in a
process to identify anything that needs fixing for the eventual
upstream change and working out communication to make it as painless
and stability-respecting as possible.

Rich

```

* * *

### Current thread:

-   **Re: "sshole": password authentication bypass: OpenSSH + musl libc**, *(continued)*
-   -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/528) *Loganaden Velvindron (Nov 05)*
        -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/533) *Vincent Lefevre (Nov 05)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/534) *lists (Nov 05)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/535) *Vincent Lefevre (Nov 05)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/536) *Michael Orlitzky (Nov 05)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/537) *Matt Johnston (Nov 05)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/541) *Vincent Lefevre (Nov 06)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/554) *Martin Steigerwald (Nov 06)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/555) *Steffen Nurpmeso (Nov 06)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/606) *Loganaden Velvindron (Nov 09)*
            -   **Re: \[musl\] Re: \[oss-security\] "sshole": password authentication bypass: OpenSSH + musl libc** *Rich Felker (Nov 09)*
        -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/566) *Loganaden Velvindron (Nov 06)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/567) *Michael Orlitzky (Nov 06)*
            -   *Message not available*
            -   *Message not available*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/569) *theknell (Nov 06)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/572) *Richard Kettlewell (Nov 07)*
    -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/539) *Jeffrey Walton (Nov 05)*
        -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/540) *Peter Gutmann (Nov 06)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/568) *Matt Johnston (Nov 06)*
            -   *Message not available*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/573) *theknell (Nov 07)*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/570) *Jacob Bachmeyer (Nov 06)*
            -   *Message not available*
            -   [Re: "sshole": password authentication bypass: OpenSSH + musl libc](https://seclists.org/oss-sec/2026/q4/571) *theknell (Nov 06)*
