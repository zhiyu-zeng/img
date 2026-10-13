---
title: "oss-sec: rsyslog RainerScript replace() output length overflow (GHSA-48f2-29wv-5jgc)"
source: https://seclists.org/oss-sec/2026/q4/151
source_host: seclists.org
clip_date: 2026-10-14T01:33:31+08:00
trace_id: 5e97b616-0cd3-4c70-986a-9862b58df01c
content_hash: e26d7b84d314a3556f95f3153b2457a0438acf47f9851df81e1579fc1b479bc1
status: synced
tags:
  - 漏洞分析
  - Linux安全
series: null
feed_source: oss-security·漏洞披露
ai_summary: rsyslog 的 RainerScript replace()（及三参数 wrap()）因 32 位长度回绕导致堆越界写，上游已修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f875244-d011-81da-984d-fabb70ee39e3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> rsyslog 的 RainerScript replace()（及三参数 wrap()）因 32 位长度回绕导致堆越界写，上游已修复。
> 
> - **触发条件：** 需显式规则集把攻击者可控值传给 replace() 或三参 wrap()，且 maxMessageSize 足够大（报告触发为 131,133 字节消息、200k 上限）；默认小消息配置不受影响。
> - **根因：** 原尺寸计算用 32 位无符号整数保存扩展结果长度，扩张到恰好 2^32 字节时回绕为 0，造成分配过小，构造阶段随后越界写入替换字节。
> - **影响：** 已在 ASan 下复现网络触发的堆越界写与守护进程终止；未证明代码执行、机密性或完整性损失。CVSS v3.1 为 7.5（可用性高）。
> - **修复：** grammar/rainerscript.c 改用 size_t 计算长度，分配前拒绝超过 maxMessageSize 的结果，replace()/wrap() 返回空串并告警；两参数 wrap() 亦受限。
> - **版本与缓解：** 受影响范围为 rsyslog >= 8.6.0 至 8.2608.0 及之后的每日构建（首个受影响版本未经上游独立核实）；缓解可保持默认小消息上限、避免可控替换值、限制受影响监听器访问。报告与修复准备中使用过 AI 辅助，复现由报告者人工验证。

## oss-sec mailing list archives

## rsyslog RainerScript replace() output length overflow (GHSA-48f2-29wv-5jgc)

* * *

*From*: Rainer Gerhards <rgerhards () hq adiscon com>  
*Date*: Tue, 13 Oct 2026 19:00:00 +0200  

* * *

```swift
Hello,

rsyslog has disclosed GHSA-48f2-29wv-5jgc, an output length overflow in
RainerScript replace(). The three-argument form of wrap() uses the same
helper. This is not exposed by rsyslog's default small-message configuration.

An affected deployment needs both an explicit ruleset that passes
attacker-influenced values to replace() or three-argument wrap(), and a
maxMessageSize large enough to accept the source and replacement values.
The reported TCP trigger used a 131,133-byte message with a 200k limit.

The original sizing pass held the expanded result length in a 32-bit
unsigned integer. An expansion to exactly 2^32 bytes wrapped that length
to zero, causing an undersized allocation. The construction pass then
wrote replacement bytes beyond the allocated buffer. The reporter
demonstrated a network-triggered heap out-of-bounds write and daemon
termination under ASan. No code execution, confidentiality loss, or
integrity loss has been demonstrated.

The upstream fix in grammar/rainerscript.c computes the result length in
size_t and rejects any result above maxMessageSize before allocation. The
affected replace() and wrap() calls return an empty string and issue a
warning when this limit is reached. Two-argument wrap() is also bounded.

The private advisory listed rsyslog >= 8.6.0 through 8.2608.0 and later
vulnerable daily builds as affected. The reporter checked this range;
upstream has not independently verified the first affected release.
A fixed daily-stable build dated 2026-10-13 is planned; its availability
and exact package identifiers should be checked in the published advisory.
The next scheduled stable release will also include the fix.

CVSS v3.1: 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H). This score describes
the vulnerable path once configured; the required configuration is
unusual in ordinary deployments.

Until updated, operators can keep the default small maximum message size,
avoid attacker-influenced replacement values in affected rulesets, or
restrict access to affected listeners.

Advisory: https://github.com/rsyslog/rsyslog/security/advisories/GHSA-48f2-29wv-5jgc
CVE: requested through GitHub; identifier pending.
Reporter: Akhil Koul (akoul).

AI assistance was used in the report and upstream fix preparation. The
reporter manually verified the ASan reproducer and negative control.

Regards,
Rainer Gerhards
rsyslog project

```
