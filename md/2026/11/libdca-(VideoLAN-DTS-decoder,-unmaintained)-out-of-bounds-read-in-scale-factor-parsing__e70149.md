---
title: "libdca (VideoLAN DTS decoder, unmaintained): out-of-bounds read in scale-factor parsing"
source: https://seclists.org/oss-sec/2026/q4/713
source_host: seclists.org
clip_date: 2026-11-19T08:18:44+08:00
trace_id: 20c2ffa4-fa9c-404d-be07-50e3755b2dfe
content_hash: 9320297ea11e71f739dac90b837f3eec20f33810ec7d4e0afac6882f884ff6cd
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
notion_page_id: 41d75244-d011-8191-9e47-f56fa4c45035
ioc: null
---

## oss-sec mailing list archives

## libdca (VideoLAN DTS decoder, unmaintained): out-of-bounds read in scale-factor parsing

* * *

*From*: "Osvaldo J. Filho" <janeri () gmail com>  
*Date*: Sat, 14 Nov 2026 15:12:36 -0600  

* * *

```rust
Hi,

libdca is VideoLAN's DTS Coherent Acoustics decoder. It's effectively
unmaintained (VideoLAN confirmed to me it's abandoned and it was dropped
from VLC 4.0), but several distros still ship it as a library, so I'm
reporting here.

There's an out-of-bounds read in the scale-factor parser, reachable from a
crafted DTS frame. I verified it against the current tree at
https://www.google.com/url?q=https://code.videolan.org/videolan/libdca&source=gmail&ust=1794777156181000&sa=E
(HEAD 95c4bd8).

In parse.c, dca_subframe_header() decodes scale factors like this:

if (state->scalefactor_huffman[j] == 6)
scale_table = scale_factor_quant7; /* 128 entries */
else
scale_table = scale_factor_quant6; /* 64 entries, indices 0..63 */

scale_sum = 0;
for (k = 0; k < state->subband_activity[j]; k++) {
if (k >= state->vq_start_subband[j] || state->bitalloc[j][k] > 0) {
if (state->scalefactor_huffman[j] < 5)
scale_sum += InverseQ(state, scales_129[state->scalefactor_huffman[j]]);
else if (state->scalefactor_huffman[j] == 5)
scale_sum = bitstream_get(state, 6);
else if (state->scalefactor_huffman[j] == 6)
scale_sum = bitstream_get(state, 7);

state->scale_factor[j][k][0] = scale_table[scale_sum]; /* <-- */
}
/* the transition_mode branch repeats the same accumulation */
}

For scalefactor_huffman modes 0..4, scale_sum is a running total of
InverseQ() deltas and scale_table is scale_factor_quant6 (64 entries).
Nothing clamps scale_sum before it indexes the table.

InverseQ() returns the Huffman entry's value field, and for mode 0
(scales_a_129) that value goes from -64 to +64, for example:

{ 16, 57173, 64 },
{ 16, 57172, -64 },

So a single scale-factor delta of +64 makes scale_sum == 64 and reads
scale_factor_quant6[64], one past the end. A single negative delta gives a
negative index. subband_activity is up to 32, and the transition_mode
branch accumulates again, so scale_sum can reach a few thousand either side
of the valid range.

The modes that use absolute values are fine: mode 5 reads bitstream_get(6)
(0..63 into the 64-entry table) and mode 6 reads bitstream_get(7) (0..127
into the 128-entry table). Only the differential modes 0..4 are affected.

Impact is an out-of-bounds int read whose result is used as an audio scale
factor: a crash if the index lands on an unmapped page, otherwise a limited
info leak into the decoded output. It's a decoder-side parser bug, so any
caller that decodes untrusted DTS data is exposed. Not memory-corrupting
beyond the read.

A fix is a bounds check before the table lookup, e.g. reject the frame if
scale_sum is outside [0, 63] (or [0, 127] for quant7).

I've requested a CVE for this from MITRE's CNA-LR (pending assignment).
Happy to provide a crafted sample that triggers it under AddressSanitizer
if that's useful.

Osvaldo
```

* * *

### Current thread:

-   **libdca (VideoLAN DTS decoder, unmaintained): out-of-bounds read in scale-factor parsing** *Osvaldo J. Filho (Nov 14)*
    -   [Re: libdca (VideoLAN DTS decoder, unmaintained): out-of-bounds read in scale-factor parsing](https://seclists.org/oss-sec/2026/q4/714) *Osvaldo J. Filho (Nov 14)*
