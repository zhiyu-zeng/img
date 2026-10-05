---
title: "The TSIG That Wasn’t: Finding an Authentication Bypass Across CoreDNS Transports"
source: https://www.hacktivesecurity.com/blog/2026/05/06/the-tsig-that-wasnt-finding-an-authentication-bypass-across-coredns-transports/
source_host: www.hacktivesecurity.com
clip_date: 2026-10-05T10:14:34+08:00
trace_id: 326e7ff1-e133-448a-8b5d-2c722daf3af4
content_hash: 1b8746e51976f21e0988dc55ac3025c10651d6c8607f575c5d0ce82ec77de78d
status: synced
tags:
  - 漏洞分析
  - 网络工具
series: null
feed_source: Hacktive Security·漏洞研究
ai_summary: CoreDNS 多个传输路径未真正校验 TSIG 的 HMAC 却上报校验成功，造成认证绕过，伪造 TSIG 即可完成受保护的 AXFR；1.14.3 已修复。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f075244-d011-8123-8c0b-ec598628292e
ioc:
  cves:
    - CVE-2026-35579
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CoreDNS 多个传输路径未真正校验 TSIG 的 HMAC 却上报校验成功，造成认证绕过，伪造 TSIG 即可完成受保护的 AXFR；1.14.3 已修复。
> 
> - **漏洞本质：** `tsig` 插件靠传输层响应写入器的 `TsigStatus()` 判断校验结果，返回 nil 即视为通过；部分传输在未做 HMAC 校验时仍返回 nil，使"密钥名存在"被误当成认证成功。
> - **各传输差异：** gRPC/QUIC 会检查密钥名是否已配置，但不调用 `dns.TsigVerify()`；DoH/DoH3 完全不做 TSIG 校验，且 `DoHWriter.TsigStatus()` 无条件返回 nil，连密钥名都不检查。
> - **实测表现：** DoH 下零字节、随机字节、错误密钥计算的 MAC、截断至 16 字节、单字节 `0x41`、空 MAC 乃至错误密钥名全部绕过并返回 `NOERROR`；同样的请求走 TCP 正确返回 `BADSIG`/`NOTAUTH`。无 TSIG 记录时两者均以 `REFUSED` 拒绝。
> - **利用后果：** 带伪造 TSIG 的 DoH AXFR 可返回完整测试 zone（9 条记录）；受 TSIG 保护的动态更新等插件行为同样可能被触及。DoH/DoH3 无需知道密钥名，利用门槛低于 gRPC/QUIC。
> - **官方处置：** 追踪编号 CVE-2026-35579 / GHSA-vp29-5652-4fw9，影响 1.14.3 之前版本；修复要求各传输在进入插件链前查密钥、对原始线格式报文调用 `dns.TsigVerify()` 并将真实状态存入响应写入器；无法升级时应避免暴露相关监听端口。

The original bug affected the gRPC and QUIC transports in [CoreDNS](https://coredns.io/). At a high level, the problem was that these transports checked whether a TSIG key name existed in the server configuration, but they did not actually verify the HMAC attached to the DNS message. That sounds like a small implementation detail, but in authentication code it is the whole point. A key name is only an identifier. The HMAC is the proof that the sender knows the shared secret. If the server accepts the identifier without checking the proof, the authentication boundary is already gone.

After the gRPC and QUIC fixes started moving, I wanted to understand whether this was an isolated mistake or a bug class. CoreDNS supports multiple ways to carry DNS messages, and each transport has to preserve the same security expectations. If one manually implemented path forgot to verify TSIG correctly, it was reasonable to ask whether another path had made the same mistake.

That question led me to DNS-over-HTTPS.

## Background

TSIG is commonly used to authenticate DNS messages, especially for operations that should not be exposed to arbitrary clients. Zone transfers, dynamic DNS updates, and other sensitive plugin behavior can all be gated behind TSIG. In a correct implementation, the server receives a DNS message containing a TSIG record, finds the configured secret for the claimed key name, recomputes the HMAC over the message, and rejects the request if the computed value does not match the supplied MAC.

That last step is what turns a TSIG record from metadata into authentication. Without the HMAC verification, the record only says that the sender would like to be treated as authenticated.

The initial gRPC and QUIC issue was a good example of that distinction. Those transports did not ignore TSIG completely. They looked at the TSIG record and checked whether the key name was known. If the key name was unknown, the request was rejected. But if the key name existed, the code did not call `dns.TsigVerify()`. The TSIG status stayed nil, and the `tsig` plugin interpreted that nil status as successful verification.

In testing, that meant a forged AXFR request over gRPC with a valid key name but a garbage MAC could return the full zone. The same request over TCP failed correctly with `BADSIG`, because the normal TCP path performed full TSIG verification.

That was already enough to be a serious bug, but it also suggested a broader review target: every transport that manually accepts a DNS message and passes it into the CoreDNS plugin chain needs to preserve the same TSIG semantics as the normal DNS server path.

![](https://www.hacktivesecurity.com/wp-content/uploads/2026/04/image-900x1024.png)

## Looking at DoH

The DoH path immediately felt different from the TCP path. In the HTTPS server, the request is received as an HTTP request, the DNS message is unpacked from it, a DoH response writer is created, and the message is passed into `ServeDNS()`. I expected to find TSIG handling between the unpacking step and the plugin chain, because that is where the transport still has access to the original wire-format message and can verify the MAC before any policy decision is made.

Instead, the important part was missing. There was no key lookup, no HMAC computation, and no call to `dns.TsigVerify()` before the message entered the plugin chain.

The more concerning part was the DoH writer itself. Its `TsigStatus()` method returned nil unconditionally:

```
func (d *DoHWriter) TsigStatus() error {
    return nil
}
```

That is a very small piece of code, but it carries a large security assumption. The `tsig` plugin uses `TsigStatus()` to decide whether the transport has successfully verified the TSIG record. Returning nil means success. In the DoH path, however, nil did not mean “the HMAC was verified.” It meant “nothing verified the HMAC, but the status still looks successful.”

This made the DoH variant worse than the gRPC and QUIC issue. For gRPC and QUIC, an attacker still needed to know a configured TSIG key name. The MAC could be invalid, but the key name had to exist. For DoH, the key name was not checked at all. Any TSIG record was enough to cause the `tsig` plugin to see a successful status.

![](https://www.hacktivesecurity.com/wp-content/uploads/2026/04/image-1-1024x910.png)

## Testing the behavior

To verify the issue, I used a small CoreDNS setup with a test zone containing nine records and enabled `tsig { require all }`. I configured a TCP listener and a DoH listener with the same TSIG configuration and key, then sent equivalent DNS requests through both transports.

The TCP listener behaved as expected. Requests with invalid MACs failed. Requests with invalid key names failed. Requests without TSIG failed when TSIG was required.

The DoH listener behaved differently. If the request contained no TSIG record, it was rejected with `REFUSED`, which confirmed that the `tsig` plugin was enforcing the `require all` policy. But once the request contained any TSIG record, the request was accepted, regardless of whether the MAC was valid or whether the key name existed.

| TSIG variant | DoH result | TCP result |
| --- | --- | --- |
| 32 zero bytes | BYPASS, `NOERROR` | `BADSIG` |
| 32 random bytes | BYPASS, `NOERROR` | `BADSIG` |
| HMAC computed with wrong secret | BYPASS, `NOERROR` | `BADSIG` |
| truncated to 16 bytes | BYPASS, `NOERROR` | `BADSIG` |
| single byte `0x41` | BYPASS, `NOERROR` | `BADSIG` |
| empty MAC | BYPASS, `NOERROR` | `BADSIG` |
| bad key name | BYPASS, `NOERROR` | `NOTAUTH` / `BADKEY` |
| no TSIG record | REJECTED, `REFUSED` | REJECTED, `REFUSED` |

The key observation is the bad-key-name case. In the earlier gRPC and QUIC issue, a bad key name was rejected because those transports at least checked whether the key existed. In DoH, even that did not happen. The request contained a TSIG record, `TsigStatus()` returned nil, and the plugin chain treated the message as authenticated.

An AXFR request over DoH with a forged TSIG record returned the full test zone. That result confirmed that this was not only a theoretical mismatch in status handling; it could expose TSIG-protected zone data when the affected transport was reachable.

## DoH3 followed the same pattern

After confirming DoH, I checked DoH3 for the same pattern. The result was the same class of issue. The DoH3 path used the same DoH writer behavior and passed the unpacked DNS message into the plugin chain without verifying TSIG first. Because the writer still reported a nil TSIG status, the `tsig` plugin received the same misleading success signal.

At that point, the issue was no longer just “gRPC and QUIC check the key name but not the HMAC.” The full picture was more subtle. gRPC and QUIC performed partial TSIG handling and failed to complete the cryptographic verification. DoH and DoH3 skipped TSIG verification entirely while still reporting a successful TSIG status to the plugin layer.

The difference matters because the exploitation requirements are different. For gRPC and QUIC, the attacker needs a valid configured key name. For DoH and DoH3, the attacker does not need a valid key name at all. The request only needs to contain something that parses as a TSIG record.

| Transport | Key name checked | HMAC verified | Forged TSIG behavior |
| --- | --- | --- | --- |
| TCP | yes | yes | rejected |
| gRPC | yes | no  | accepted if the key name is valid |
| QUIC | yes | no  | accepted if the key name is valid |
| DoH | no  | no  | accepted if any TSIG record exists |
| DoH3 | no  | no  | accepted if any TSIG record exists |

## Root cause

The root cause was an inconsistent propagation of authentication state across transport implementations.

The `tsig` plugin relies on the response writer to report the TSIG verification status. That is a reasonable design if every transport sets that status correctly. The problem appears when a transport builds its own response writer or manually forwards DNS messages into the plugin chain without performing the same verification that the standard DNS path would perform.

In this case, the policy layer and the transport layer each had part of the responsibility. The `tsig` plugin enforced the requirement that TSIG must be present, and it checked the status reported by the transport. The transport was responsible for making sure that status reflected real verification. When that status remained nil after incomplete verification, or was hardcoded to nil without verification at all, the plugin made the wrong decision based on information it was designed to trust.

This is why the bug was easy to miss by looking at only one layer. The plugin looked like it was enforcing TSIG. The incoming messages contained TSIG records. The affected writers implemented `TsigStatus()`. The failure was in the assumption that a nil status always meant successful cryptographic verification.

## Impact

The impact depends on how CoreDNS is deployed and which transports are exposed. If TSIG is used to protect zone transfers, an attacker may be able to retrieve zone data over an affected transport. If dynamic updates are enabled and gated by TSIG, those operations may also become reachable without valid TSIG authentication. The same concern applies to any other plugin behavior that relies on TSIG authentication state.

The DoH and DoH3 variants have a lower bar for exploitation than the gRPC and QUIC variants because they do not require knowledge of a configured TSIG key name. In testing, arbitrary TSIG records with invalid MACs were enough to bypass the check over DoH.

> The public advisory tracks this issue as **CVE-2026-35579** / **GHSA-vp29-5652-4fw9** and lists CoreDNS versions before 1.14.3 as affected.

## Fix

The correct fix is to make every affected transport perform full TSIG verification before passing the DNS message into the plugin chain. When a message contains a TSIG record, the transport needs to check whether TSIG secrets are configured, look up the claimed key name, call `dns.TsigVerify()` against the original wire-format message, store the resulting status in the response writer, and return that stored status from `TsigStatus()`.

A successful key lookup is not authentication. A nil TSIG status should only mean that the HMAC was actually verified.

CoreDNS v1.14.3 includes fixes for the affected transports.

## What I took away

The main lesson for me was that authentication bugs often live in the glue code between layers, not in the cryptography itself. Nothing here required breaking HMAC. The forged MAC values were intentionally boring: zero bytes, random bytes, truncated values, and values computed with the wrong secret. The point of those tests was not to defeat TSIG. It was to prove that some transport paths were not reaching the verification step at all.

The other lesson is that variant analysis matters. Once the first gRPC and QUIC issue was visible, it would have been easy to stop at the immediate fix and move on. But the more useful question was whether the same trust assumption existed anywhere else. In this case, following that question across the remaining transports found the DoH and DoH3 bypasses as well.

## Operator guidance

Operators using TSIG with gRPC, QUIC, DoH, or DoH3 should upgrade to **CoreDNS v1.14.3 or later**.

If upgrading is not immediately possible, affected listeners should not be exposed where TSIG-protected functionality is reachable. Network-level restrictions can reduce exposure, but they should be treated as a temporary mitigation rather than a replacement for the patched transport behavior.
