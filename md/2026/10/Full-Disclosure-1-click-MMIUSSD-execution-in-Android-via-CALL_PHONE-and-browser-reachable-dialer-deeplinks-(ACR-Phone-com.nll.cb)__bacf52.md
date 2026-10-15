---
title: "Full Disclosure: 1-click MMI/USSD execution in Android via CALL_PHONE and browser-reachable dialer deeplinks (ACR Phone / com.nll.cb)"
source: https://seclists.org/fulldisclosure/2026/Oct/10
source_host: seclists.org
clip_date: 2026-10-15T16:01:28+08:00
trace_id: 97800b15-f972-4de4-9f14-f90cf845a416
content_hash: 0d9c2e0005355df3b6b5fe7a8c581b4213ba00f48fa4494ee5c58d5996796539
status: synced
tags:
  - 漏洞分析
  - Android安全
series: null
feed_source: Full Disclosure·漏洞披露
ai_summary: "**Android 的 CALL_PHONE 权限在无提示下授权执行运营商 MMI/USSD 代码，与浏览器可达的拨号 deeplink 组合即可一键开通无条件呼叫转移。**"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-817a-8db7-e024a7e3e26f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **Android 的 CALL_PHONE 权限在无提示下授权执行运营商 MMI/USSD 代码，与浏览器可达的拨号 deeplink 组合即可一键开通无条件呼叫转移。**
> 
> - **权限真相：** 系统仅标注"拨打和管理电话"，实际同时授权对 SIM 执行 MMI/USSD；执行前无任何确认，事后才闪现"USSD 代码运行中"，且不写入通话记录。
> - **触发链：** ACR Phone（com.nll.cb）的 intent filter 声明 CALL_BUTTON + BROWSABLE + tel:；Chrome 的 intent: URI 可指定任意 action，唯一校验是过滤器带 BROWSABLE，代码遂以 ACR 自身的 CALL_PHONE 授权执行，无选择器、无确认。
> - **一键 PoC 与持久性：** `intent:*21*5550000000%23#Intent;scheme=tel;action=android.intent.action.CALL_BUTTON;end`，来电（含语音 OTP、银行回拨验证）被转到攻击者号码；末尾 # 须写成 %23。转移状态存于运营商网络，重启、卸载应用、恢复出厂设置均不失效，用 `##21#` 取消、`*#21#` 查询，`*21*` 与 `**21*` 均可注册。
> - **Android 17 放大：** Telecom 迁入 com.android.telephonycore 主线模块，com.android.server.telecom 沦为壳，其 UserCallActivity 重发意图至 telecomui，并以自身 CALL_PRIVILEGED 身份调用 placeCall()，危险 MMI 检查因绑定调用方 UID 而放行，仅持 CALL_PHONE、无拨号器角色的应用即可下发 MMI（仅模拟器确认）。
> - **厂商与面：** Google 判定为第三方拨号器 deeplink 处理不当，Won't Fix（Infeasible），trampoline 报告按重复关闭；ACR 开发者 48 分钟内响应并提交修复。扫描 88 款通话/拨号/VoIP 应用：66 个声明 CALL_PHONE，54 个暴露浏览器可达拨号入口，多数为预填而非直拨。

## Full Disclosure mailing list archives

## 1-click MMI/USSD execution in Android via CALL_PHONE and browser-reachable dialer deeplinks (ACR Phone / com.nll.cb)

* * *

*From*: Karan Saini <karan () marionette in>  
*Date*: Fri, 9 Oct 2026 18:21:37 +0200  

* * *

```swift
Android's CALL_PHONE permission, shown to users as "make and manage phone
calls", also authorises execution of carrier MMI/USSD codes against the SIM.
The permission text does not mention this, no confirmation is shown before
execution -- a transient "USSD code running" dialog appears only afterwards
--
and MMI execution writes no call log entry. Where a CALL_PHONE-holding app
also
exposes a browser-reachable deeplink into an auto-dial path, the capability
becomes remotely triggerable with a single tap.

Demonstrated against ACR Phone / Cube ACR (com.nll.cb, 5M+ installs), which
declares an intent filter carrying action CALL_BUTTON, category BROWSABLE
and a
tel: scheme, resolving to an activity that dials rather than pre-fills.
Chrome's
intent: URI syntax lets a page nominate an arbitrary action, and Chrome's
only
check is that the resolved filter declares BROWSABLE, so the string executes
under ACR's own CALL_PHONE grant rather than any grant held by the browser.
No
chooser appears (ACR is the sole handler) and no confirmation is requested.
The
terminating hash must be percent-encoded as %23 -- a literal # parses, but
is
lost further down the dial path, and the remainder is placed as an ordinary
call.


intent:*21*5550000000%23#Intent;scheme=tel;action=android.intent.action.CALL_BUTTON;end

One tap registers unconditional call forwarding to the attacker's number.
Incoming calls -- including voice-delivered OTPs and bank verification
callbacks
-- are then delivered to the attacker. Registration is held in the carrier
network rather than on the handset, so it survives reboot, uninstalling the
app
and a factory reset, and persists until cancelled. Clear with ##21#,
interrogate
with *#21#. Both *21*<n>%23 and **21*<n>%23 register.

Preconditions for the demonstration: ACR must hold CALL_PHONE and the DIALER
role. Both are the ordinary state for a dialer replacement, but neither is
automatic. The role matters twice over -- ACR's own DialerActivity.a0()
redirects to setup without it, and Android 14 added a platform check that
refuses dangerous MMI codes from a non-default dialer, which ACR being the
default dialer satisfies. Of 88 call, dialer and VoIP apps scanned at the
manifest level, 66 declared CALL_PHONE and 54 exposed some browser-reachable
dial surface; most pre-fill rather than dial, so whether any given one is
exploitable turns on its own deeplink handling, while the platform grants
the
underlying capability to all of them uniformly.

A related Android 17 change removes the need for a vulnerable third-party
app
altogether. Telecom moved into the com.android.telephonycore mainline
module and
its UI into a separate privileged application; com.android.server.telecom
is now
a shim whose UserCallActivity re-starts the intent against
com.google.android.telecomui, which calls TelecomManager.placeCall() as
itself.
The launching package is not carried across. placeCall() binds the caller
to the
binder UID, and telecomui holds CALL_PRIVILEGED, so the dangerous-MMI check
--
which still runs on every call -- is evaluated against telecomui and
passes. A
plain **21*<number># sent via ACTION_CALL by an app holding only CALL_PHONE,
with no dialer role, is therefore dispatched as an MMI code. Reported
separately; confirmed on an emulator only.

Tested on: Samsung Galaxy M16 5G, Android 16 (One UI 8.5), build
BP4A.251205.006.M166PXXS7DZG1, security patch level 5 July 2026, against a
live
Airtel India network (single-asterisk form). Reproduced on Android 14 (API
34)
and Android 17 (API 37, patch 2026-07-05) emulators, double-asterisk form
against the simulated network.

Vendor status: Google closed the platform report as Won't Fix (Infeasible),
assessing it as insecure deeplink handling in third-party dialers rather
than an
Android vulnerability. The Android 17 trampoline report was closed as a
duplicate of an earlier internal report. The ACR Phone developer responded
within 48 minutes and committed a fix to the next release; the Play release
is
pending Google's review.

Timeline:
12 Sep 2026 - Reported to the Android & Google Devices VRP
14 Sep 2026 - Android 17 retest added; TelecomUi trampoline reported
separately
17 Sep 2026 - Platform report closed Won't Fix (Infeasible)
24 Sep 2026 - Trampoline report closed as duplicate of an internal Google
report
25 Sep 2026 - Request to be added to that report declined
09 Oct 2026 - Reported to the ACR Phone developer; acknowledged, fix
committed
09 Oct 2026 - Public disclosure

Full write-up:
https://karansaini.com/mmi-android/

Sincerely,
Karan Saini
_______________________________________________
Sent through the Full Disclosure mailing list
https://nmap.org/mailman/listinfo/fulldisclosure
Web Archives & RSS: https://seclists.org/fulldisclosure/

```
