---
title: "MobileSec #1: Four ways to lose your crypto without giving up your seed phrase"
source: https://amin.benarieb.com/newsletter/1/
source_host: amin.benarieb.com
clip_date: 2026-11-19T10:57:51+08:00
trace_id: 42a5a5fe-499c-4f59-acac-1d1a9cb4093c
content_hash: d3ae6bf26dbecaff25f0cd98b3f5e40f1cab65baa35d4917d1395702e59fb1e6
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
notion_page_id: 41d75244-d011-8120-a431-c4b9a8dcf1cb
ioc: null
---

Today’s issue is shorter and crypto-heavy — I didn’t have time to dig into more.

## Mobile

### worse_query

[**worse_query**](https://github.com/forcequitOS/worse_query) - a sandbox escape for iOS 26 and 27. Basically, iOS has a security boundary designed to stop one app from reading another app's private files. But worse_query lets any app read other apps’ private data containers, and no public iOS release fixes it yet. Apple appears to have closed it in the iOS 27.3 beta 2, [per developers of a tool built on it](https://securityonline.info/worse-query-ios-vulnerability/), but there’s no CVE or advisory, and the stable 27.3 is expected in December. Even Binance [warned](https://x.com/binance/status/2120093246399430770) its iOS users about it and told them to update iOS — but right now there’s no public iOS to update to:D

### FomoPeek

Speaking of crypto wallets — there was an iOS app called FomoPeek that posed as a read-only cryptocurrency wallet tracker and on-chain monitoring tool. But [it turned out](https://slowmist.medium.com/threat-intelligence-analysis-of-fomopeek-app-store-poisoning-and-ios-kernel-exploitation-e568762d11ca) that it shipped an iOS kernel-exploit framework that a remote server switched on after the app passed App Store review. It read other apps’ containers, decrypted the Keychain, and stole $580K in USDT. It did all its dark work without you connecting your wallet or giving it anything sensitive like a seed phrase — the only odd request was to keep the app open for about 5–7 minutes, presumably so the exploit had time to finish.

### ArcticRAT

Another crypto-related one: the zLabs research team [uncovered](https://zimperium.com/blog/arcticrat-ai-powered-android-rat) ArcticRAT, an AI-powered Android RAT. It looks like Hirudo from the [previous issue](https://amin.benarieb.com/newsletter/0/) — delivered through a lure app, also from a fake Google Play page. The user allows installs from unknown sources (apparently the fake Google Play page raises no suspicion), then the app asks for an update. Meanwhile it asks for VPN permission, turns the VPN on to cut the phone off the internet, and installs the trojan, so Play Protect can’t check it against Google’s cloud. Then the trojan walks the user to Settings to turn on Accessibility. With Accessibility enabled, it steals PINs, OTPs and so on. The AI part: it sends your SMS and app list to Grok, which flags your bank and crypto apps and pulls out one-time codes and balance changes for the operator. So, once again: don’t blindly grant VPN and Accessibility access to any app.

## Biometrics

And once again a crypto theft scheme: the FBI [published a report](https://www.ic3.gov/CSA/2026/261112.pdf) on how North Korean state hackers stole more than $400 million in crypto over the past 18 months with the following social engineering scheme.

First, they secretly recorded real people’s webcams while those people waited for what they thought was a work call. Then they replayed those recordings as social proof in the next fake call, dressed up as Zoom or Teams. The victim saw a colleague’s face, assumed it was a live participant, and let their guard down. Then the “colleague” messaged in the meeting chat that the victim’s audio wasn’t working and pointed them to a “fix”: a script or a command to paste into the terminal. It installed a keylogger, a cookie stealer and a backdoor, and the victim lost their crypto

## Radar

1.  [vphone-cli](https://github.com/Lakr233/vphone-cli), a virtual iPhone on Apple Silicon via Virtualization.framework. You can even try installing apps on it. It relaxes some of your Mac’s security settings (SIP stays on, but debugging limits are lifted and research VMs are allowed), so I wouldn’t install it on your main macOS — use a spare Mac or a separate macOS install on its own volume.
2.  [Unfairplay](https://github.com/DrWhax/unfairplay) - now you don’t need a jailbroken phone to decrypt an iOS app: a Mac signed in to the Mac App Store is enough (you download the IPA with ipatool or similar). Use a throwaway Apple ID, not your main one.
3.  [SimulatorCamera](https://github.com/dautovri/SimulatorCamera) - if you need to test the camera in the iOS Simulator, here’s a solution. I’ve seen something similar before in [SimCam](https://simcam.swmansion.com/) and [RocketSim](https://www.rocketsim.app/docs/features/capturing/simulator-camera-support/).

## Before You Go

-   Check that you didn’t install the [tampered Claude Code extension](https://cursor.com/blog/claude-code-extension-security-notice) that sat in Cursor’s marketplace for about 11 hours and planted an SSH key and a reverse tunnel.
-   More and more stories about why you shouldn’t rely on SMS for OTP: [The Enemy Within. Tracking LIMINAL PANDA and SilentAir through Mobile Networks](https://www.enea.com/insights/the-enemy-within-tracking-liminal-panda-and-silentair-through-mobile-networks/). Check out Veritasium [video](https://www.youtube.com/watch?v=wVyu7NB7W6Y) on how they hacked the phone network to mess with calls and SMS.
-   Follow-up to Coruna/DarkSword and Hirudo:
    -   Apple’s threat notifications seem to cover only mercenary spyware: to [iVerify’s knowledge](https://www.iverify.com/blog/apple-threat-notification-iphone-spyware), they didn’t fire for any confirmed Coruna/DarkSword infection.
    -   [Promon analyzed](https://promon.io/security-news/watching-the-apps-we-protect-how-we-found-hirudo-by-accident) a Hirudo sample: the patched bank-app clone carried a leaked, valid Android attestation keybox, so attestation-based integrity checks trusted it until Google revoked the key. Promon’s own protected test apps still flagged it as repackaged — attestation alone wasn’t enough.

* * *

That's it for #1. Forward it to a colleague who'd find it useful, and reply with what you'd like me to cover next:)

See you in #2.
