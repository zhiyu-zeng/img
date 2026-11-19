---
title: JSON-XS versions before 4.05 for Perl (7 CVEs)
source: https://seclists.org/oss-sec/2026/q4/706
source_host: seclists.org
clip_date: 2026-11-19T08:17:09+08:00
trace_id: cce6c768-6e74-463a-9e4c-676d6ba92d1b
content_hash: 9b7a887ee94aa555bad2d18e2e8811c8029c2e1b4719f2b12858f4de44f13e27
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
notion_page_id: 41d75244-d011-8125-be2c-efcc9fb0a06d
ioc:
  cves:
    - CVE-2026-124536
    - CVE-2026-124539
    - CVE-2026-124540
    - CVE-2026-124541
    - CVE-2026-129113
    - CVE-2026-129114
    - CVE-2026-129115
  cwes:
    - CWE-122
    - CWE-191
    - CWE-193
    - CWE-401
    - CWE-416
    - CWE-674
    - CWE-770
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## oss-sec mailing list archives

## JSON-XS versions before 4.05 for Perl (7 CVEs)

* * *

*From*: Robert Rothenberg <rrwo () cpansec org>  
*Date*: Sat, 14 Nov 2026 12:05:13 +0000  

* * *

```rust
CVE-2026-124536
  JSON::XS versions before 4.05 for Perl allow memory exhaustion by
  buffering incremental input past max_size after a NUL byte in
  incr_parse

CVE-2026-124539
  JSON::XS versions before 4.05 for Perl leak the decoded key of an
  object rejected for a missing colon in decode_hv

CVE-2026-124540
  JSON::XS versions before 4.05 for Perl allow stack exhaustion via
  nested tagged values under allow_tags in decode_tag

CVE-2026-124541
  JSON::XS versions before 4.05 for Perl leak the decoded part of a
  rejected long string in decode_str

CVE-2026-129113
  JSON::XS versions from 4.0_00 before 4.05 for Perl corrupt the
  incremental buffer length by chopping past its end in incr_skip after
  a top-level number

CVE-2026-129114
  JSON::XS versions from 3.04 before 4.05 for Perl write one byte past
  a heap buffer when appending a one-byte chunk in incr_parse

CVE-2026-129115
  JSON::XS versions from 3.0 before 4.05 for Perl read freed stack
  memory when a FREEZE result's serialisation grows the Perl stack
  under allow_tags in encode_rv


========================================================================
CVE-2026-124536                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-124536

  Distribution:  JSON-XS
      Versions:  before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions before 4.05 for Perl allow memory exhaustion by
buffering incremental input past max_size after a NUL byte in
incr_parse

Description
-----------
JSON::XS versions before 4.05 for Perl allow memory exhaustion by
buffering incremental input past max_size after a NUL byte in
incr_parse.

The parser appends each chunk to its buffer and compares max_size with
how far it has progressed, not with the buffer length. It treats a NUL
byte as the end of the input, so a NUL within the first max_size bytes
keeps it short of the limit. The buffer keeps growing, and incr_skip
cannot remove the NUL.

A peer streaming data to an incr_parse consumer can exhaust process
memory regardless of max_size.

Problem types
-------------
- CWE-770 Allocation of Resources Without Limits or Throttling

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.


========================================================================
CVE-2026-124539                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-124539

  Distribution:  JSON-XS
      Versions:  before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions before 4.05 for Perl leak the decoded key of an
object rejected for a missing colon in decode_hv

Description
-----------
JSON::XS versions before 4.05 for Perl leak the decoded key of an
object rejected for a missing colon in decode_hv.

Unless it is short plain ASCII, a quoted key is decoded into a new
scalar. Nothing frees that scalar when the object is rejected for a
missing ':' after the key.

A process that keeps running after a failed decode retains one key per
rejected document, with its size chosen by the sender. Repeated
requests exhaust process memory.

Problem types
-------------
- CWE-401 Missing Release of Memory after Effective Lifetime

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.


========================================================================
CVE-2026-124540                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-124540

  Distribution:  JSON-XS
      Versions:  before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions before 4.05 for Perl allow stack exhaustion via
nested tagged values under allow_tags in decode_tag

Description
-----------
JSON::XS versions before 4.05 for Perl allow stack exhaustion via
nested tagged values under allow_tags in decode_tag.

With allow_tags, "(" starts a tagged value. Its tag and value are
decoded recursively, and each can start another tagged value. Unlike
arrays and objects, this nesting is not counted against max_depth.

A run of "(" bytes exhausts the C stack and triggers an uncatchable
segmentation fault regardless of max_depth.

Problem types
-------------
- CWE-674 Uncontrolled Recursion

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.


========================================================================
CVE-2026-124541                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-124541

  Distribution:  JSON-XS
      Versions:  before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions before 4.05 for Perl leak the decoded part of a
rejected long string in decode_str

Description
-----------
JSON::XS versions before 4.05 for Perl leak the decoded part of a
rejected long string in decode_str.

A string is decoded through a fixed-size buffer (16 KiB in 4.04), and
each time the buffer fills its contents move into a new scalar. Nothing
frees that scalar when the string is then rejected for a control
character, an invalid escape, malformed UTF-8 or the end of the input.

A process that keeps running after a failed decode retains the decoded
part of each rejected string, with its size chosen by the sender.
Repeated requests exhaust process memory.

Problem types
-------------
- CWE-401 Missing Release of Memory after Effective Lifetime

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.


========================================================================
CVE-2026-129113                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-129113

  Distribution:  JSON-XS
      Versions:  from 4.0_00 before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions from 4.0_00 before 4.05 for Perl corrupt the
incremental buffer length by chopping past its end in incr_skip after a
top-level number

Description
-----------
JSON::XS versions from 4.0_00 before 4.05 for Perl corrupt the
incremental buffer length by chopping past its end in incr_skip after a
top-level number.

The incremental parser scans any run of digits, signs, dots and
exponent markers as one number, but the decoder stops at the end of a
valid number, so the parser keeps an offset into bytes it has not
decoded. It then empties the buffer without clearing those bytes, and a
later incr_parse call without new input reads them again and moves the
offset past the end of the buffer. incr_skip, the documented recovery
after an error, removes that many bytes and the buffer length wraps.

A peer sending input such as "1-2" to an incr_parse consumer can make
the next read of incr_text exit the process through perl's uncatchable
out-of-memory path.

Problem types
-------------
- CWE-191 Integer Underflow (Wrap or Wraparound)

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.

Credits
-------
Albert Gierlach (rivit), reporter


========================================================================
CVE-2026-129114                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-129114

  Distribution:  JSON-XS
      Versions:  from 3.04 before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions from 3.04 before 4.05 for Perl write one byte past a
heap buffer when appending a one-byte chunk in incr_parse

Description
-----------
JSON::XS versions from 3.04 before 4.05 for Perl write one byte past a
heap buffer when appending a one-byte chunk in incr_parse.

The incremental buffer grows to one and a half times the length it must
hold, with no room reserved for the terminating NUL. For an empty
buffer and a one-byte chunk that request is one byte, which a buffer
whose front was removed by earlier decodes can already have, so nothing
is reallocated and the NUL lands one byte past the allocation.

A peer streaming data to an incr_parse consumer, choosing how the input
is split into reads, can cause a one-byte heap out-of-bounds write.

Problem types
-------------
- CWE-193 Off-by-one Error
- CWE-122 Heap-based Buffer Overflow

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.

Credits
-------
Albert Gierlach (rivit), reporter


========================================================================
CVE-2026-129115                                      CPAN Security Group
========================================================================

        CVE ID:  CVE-2026-129115

  Distribution:  JSON-XS
      Versions:  from 3.0 before 4.05
      MetaCPAN:  https://metacpan.org/dist/JSON-XS
      VCS Repo:  https://cvs.schmorp.de/JSON-XS/


JSON::XS versions from 3.0 before 4.05 for Perl read freed stack memory
when a FREEZE result's serialisation grows the Perl stack under
allow_tags in encode_rv

Description
-----------
JSON::XS versions from 3.0 before 4.05 for Perl read freed stack memory
when a FREEZE result's serialisation grows the Perl stack under
allow_tags in encode_rv.

With allow_tags, an object's FREEZE method is called in list context
and each returned value is encoded through a saved Perl stack pointer.
When encoding a returned value calls back into Perl, through TO_JSON
under convert_blessed or another FREEZE, and that callback grows the
stack, the stack is reallocated while the saved pointer still refers to
the freed block.

Encoding such objects reads freed memory, and encode can return undef
without an error.

Problem types
-------------
- CWE-416 Use After Free

Solutions
---------
Upgrade to JSON-XS 4.05 or later.

References
----------
https://metacpan.org/release/MLEHMANN/JSON-XS-4.05/changes

Timeline
--------
- 2026-11-13: Version 4.05 released with fix.

Credits
-------
Albert Gierlach (rivit), reporter

```
