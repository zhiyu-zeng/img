---
title: iOS compressionQuality Is Not the JPEG Q-factor
source: https://amin.benarieb.com/posts/ios-jpeg-compressionquality-not-q-factor/
source_host: amin.benarieb.com
clip_date: 2026-11-19T10:57:06+08:00
trace_id: b441f998-75cc-4415-ba3e-adabeaf8c98f
content_hash: 9bdabee94e485ccc1fc3146bde2c0ca64b655b8abdf6dd8acd3f506fe4bec835
status: synced
tags: []
series: null
feed_source: Amin Benarieb·移动安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8198-b02d-fac29ac4fa1b
ioc: null
---

Have you ever checked whether `UIImage.jpegData(compressionQuality:)` on iOS actually gives you the JPEG quality you asked for? I hadn't. Then I did — and the answer surprised me. Here's what I learned.

Here's the setup. Say you're generating JPEGs on iOS and you want them roughly the same size as what libjpeg spits out on your Linux backend or maybe Android app. You pass `compressionQuality: 0.8`. Feels right — that's Q80, no? So I need a tool to check this out.

The first tool I reach for is [ExifTool](https://exiftool.org/) — Phil Harvey's Swiss-army knife for reading and writing image metadata, the thing every photographer and forensics person already has installed. It'll tell you the dimensions and file size straight out of the JPEG header:

```
exiftool output.jpg | grep -E "Quality|ImageSize|FileSize"
```

```
Image Size   : 720x1280
File Size    : 215 kB
```

And then `identify` chimes in. The next tool ships with [ImageMagick](https://imagemagick.org/) — the big open-source image toolkit — and unlike ExifTool it'll actually dig into the JPEG's compression internals and hand you a Quality number:

```
identify -verbose output.jpg | grep Quality
# Quality: 94
```

You asked for 0.8. You got Q94. Not Q80. That's the whole problem in one line.

The reason is that `compressionQuality` is just a internal Apple's `CGFloat` number from 0.0 to 1.0, and it is not the JPEG Q-factor. It's some internal Apple knob that ImageIO maps onto its own quantization tables, along a curve that's nonlinear and — as far as I can tell — documented absolutely nowhere. The annoying part is that almost all the useful range lives in the bottom half. Look:

| `compressionQuality` | JPEG Q (per `identify`) |
| --- | --- |
| 0.35 | Q53 |
| 0.45 | Q72 |
| 0.50 | Q78 |
| 0.52 | Q80 |
| 0.58 | Q85 |
| 0.67 | Q90 |
| 0.75 | Q93 |
| 0.85 | Q95 |
| 0.90 | Q96 |
| 1.00 | Q100 |

Anything above 0.75 barely moves — you're talking one or two Q-units between steps. So the top quarter of the slider is basically wasted.

If you want to build that table yourself, here's the script I used. Runs on macOS, and `NSBitmapImageRep` goes through the same ImageIO that `UIImage` uses on the phone, so the curve matches:

```php
#!/usr/bin/env swift
import AppKit
import Foundation

let dir = URL(fileURLWithPath: "/tmp/jpeg_map")
try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

// Gradient, not a flat color — a solid color compresses too well and ruins the test
let size = NSSize(width: 100, height: 100)
let image = NSImage(size: size)
image.lockFocus()
NSGradient(colors: [.red, .blue, .green, .yellow])!
    .draw(in: NSRect(origin: .zero, size: size), angle: 45)
image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff) else { exit(1) }

for q in stride(from: 0.05, through: 1.0, by: 0.05) {
    let props: [NSBitmapImageRep.PropertyKey: Any] = [.compressionFactor: q]
    guard let data = bitmap.representation(using: .jpeg, properties: props) else { continue }
    let filename = String(format: "q%.2f.jpg", q)
    try! data.write(to: dir.appendingPathComponent(filename))
}
```

```
swift jpeg_map.swift
identify -verbose /tmp/jpeg_map/*.jpg | grep -E "jpeg_map|Quality" | paste - -
```

## How identify guesses the Q-factor

Now, a thing that tripped me up — how does `identify` even know the Q-factor? It doesn't read it from metadata; there's no Quality field in the JPEG standard, that number just isn't stored anywhere in the file. What it actually does is read the `DQT` marker (Define Quantization Table, `0xFFDB`) — the 8×8 matrix of quantization coefficients — and run a cheap heuristic over it: it sums the coefficients (plus a couple of values at fixed positions) and matches that aggregate against precomputed values for libjpeg's standard tables at every Q from 1 to 100. It's an estimate, not a readout — and a collision-prone one.

And here's the catch: that heuristic is calibrated to libjpeg's tables. Apple-encoded files don't necessarily use the same quantization tables, so whatever `identify` reports for an Apple file is a *libjpeg-equivalent* Q, not Apple's real internal value. I expect it to be off by roughly ±2–5 units — fine for comparing files to each other, no good if you need an absolute number.

## iOS vs libjpeg: same Q, different bytes

I wanted to see that gap with my own eyes, so I took one image — 720×1280 — and ran it through both encoders.

Make the test image:

```
magick -size 720x1280 plasma:fractal -blur 0x2 test_source.png
```

libjpeg, via ImageMagick:

```
for q in 80 90 95; do
  magick test_source.png -quality $q libjpeg_q${q}.jpg
done
```

iOS side, same ImageIO through NSBitmapImageRep, picking the compressionQuality values that map to those Q targets:

```
let qualities: [(Double, String)] = [
    (0.52, "ios_q0.52"),
    (0.67, "ios_q0.67"),
    (0.85, "ios_q0.85")
]
```

And the results, same image, same resolution:

| Encoder | `compressionQuality` / Q | `identify` Q | Size |
| --- | --- | --- | --- |
| libjpeg | Q80 | Q80 | 60 KB |
| iOS | 0.52 | Q80 | 64 KB |
| libjpeg | Q90 | Q90 | 144 KB |
| iOS | 0.67 | Q90 | 87 KB |
| libjpeg | Q95 | Q95 | 212 KB |
| iOS | 0.85 | Q95 | 132 KB |

Look at Q90 and Q95. Same `identify` Q on both sides, and the iOS file is smaller — noticeably smaller. At first I thought I'd messed up the mapping. But no, that's the real answer: the two encoders land on the same nominal Q but clearly aren't using the same quantization — Apple's output leans harder on the high-frequency detail. So "Q90 on iOS" and "Q90 on libjpeg" are genuinely not the same picture.

## Calibration table: target Q → iOS compressionQuality

So if you just want a target Q-factor on iOS without thinking too hard, here's the lookup I ended up using:

| Target | iOS `compressionQuality` |
| --- | --- |
| Q75 | 0.47 |
| Q80 | 0.52 |
| Q85 | 0.58 |
| Q90 | 0.67 |
| Q95 | 0.85 |

## Alternative: libjpeg-turbo

If you need Q80 that `identify` reads back as exactly Q80 — same tables, no approximation — link libjpeg-turbo directly. It adds roughly 600 KB to your binary and gives you a quality parameter from 1–100 that means what it says.

Setup: download the official iOS `.a` from https://github.com/libjpeg-turbo/libjpeg-turbo/releases, add a bridging header with `turbojpeg.h`, then call `tjCompress2` with your CVPixelBuffer data and a literal integer quality. No calibration table needed.

(Note: the integration steps above are based on the API docs — not personally verified end-to-end.)

## An unexpected angle: forensics and liveness

Quick context if those words aren't your world. Image *forensics* is figuring out an image's history from the file itself — what made it, whether it's been edited — without trusting any metadata. *Liveness* is the check that decides a selfie is a real person in front of the camera right now, not a photo of a photo or an injected image. Both are how banking, KYC, and identity apps stop spoofing. And it turns out the boring compression detail above is one of their tools.

Those DQT (Define Quantization Table) aren't just a quality knob — they're an encoder fingerprint. Apple's ImageIO and libjpeg quantize differently, so the tables alone often reveal what produced an image. Forensics tools use exactly this for source identification (which app or device made the file) and for tamper detection: a JPEG that's been edited and re-saved carries double-compression traces in its tables. The liveness angle is direct — a selfie straight off the camera sensor looks different from one that was saved, edited, or re-compressed before it reached your verification flow. It's a signal, not proof, but it's often the first thing that flags an injected or replayed image.

## Tools

-   [`identify`](https://imagemagick.org/script/identify.php) (ImageMagick) — reads DQT tables and approximates Q-factor
-   [`exiftool`](https://exiftool.org/) — file metadata: size, resolution, subsampling
-   [`UIImage.jpegData(compressionQuality:)`](https://developer.apple.com/documentation/uikit/uiimage/jpegdata\(compressionquality:\)) — Apple docs (note: parameter is not a Q-factor)
-   [Apple ImageIO forums](https://developer.apple.com/forums/tags/image-io) — community discussion on ImageIO behavior
-   [libjpeg-turbo API docs](https://libjpeg-turbo.org/Documentation/Documentation) — `tjCompress2` reference

## Takeaways

-   `compressionQuality: 0.8` → Q94, not Q80. The parameter is Apple-internal.
-   The 0.75–1.0 range is nearly useless: all values collapse into Q93–Q100.
-   `identify` approximates Q from the DQT tables with a sum-and-hash heuristic — expect ±2–5 units off for Apple-encoded files.
-   Even at matching `identify` Q, iOS files can be smaller than libjpeg — the two encoders aren't using the same quantization, and Apple's output compresses high-frequency content more aggressively.
-   Need exact Q? Use the calibration table above, or link libjpeg-turbo for integer Q control.
