---
title: "TVE-2026-01: Xiaomi miIO Protocol Authentication Bypass - taszk.io labs"
source: https://labs.taszk.io/blog/post/112_mi_hshake_bypass/
source_host: labs.taszk.io
clip_date: 2026-10-28T10:16:08+08:00
trace_id: 8c9a540c-ff4c-47bf-986e-e1a9d44996fa
content_hash: 6b732fee8cfb208793d36544c6ccf918d32c19c32ae2a616d39b63d5f51d3952
status: synced
tags:
  - 漏洞分析
  - 固件安全
series: null
feed_source: Taszk·移动安全
ai_summary: 小米 miIO 协议存在 AES-CBC 解密实现缺陷——未按 16 字节对齐的畸形数据包会触发越界读写，可被攻击者通过 WiFi 绕过认证，厂商超 6 个月仍未修复或分配 CVE。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40775244-d011-81fa-a6e4-f3e834536688
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 小米 miIO 协议存在 AES-CBC 解密实现缺陷——未按 16 字节对齐的畸形数据包会触发越界读写，可被攻击者通过 WiFi 绕过认证，厂商超 6 个月仍未修复或分配 CVE。
> 
> - **触发路径：** 向 UDP 54321 端口发送畸形 miIO 数据包，`miio_client` 验证 MAC 后调用解密函数，非 16 倍数长度的 payload 进入异常处理分支。
> - **漏洞成因：** `AesCbcDecrypt` 中 `remainder_bytes = size & 0xf` 只记录余数但未递减 `size`，导致尾部部分块从输入缓冲区外读取密文、并将解密结果写到堆上输出缓冲区越界 16 字节。
> - **可控性：** miIO 协议头声明的包长度由发送方控制，攻击者可发送超过该长度的 UDP 包，从而控制越界写入堆的 16 字节内容。
> - **影响范围：** 已验证 Xiaomi C400 摄像头；任何使用 miIO 协议的小米智能设备均可能受影响，taszk.io 已发布完整 RCE 利用 POC。
> - **披露僵局：** 2025-09 报告后，小米先确认漏洞又改口称"不满足实际利用条件"，坚持补丁 OTA 后 6 个月才披露的政策，始终未给出 CVE；taszk 于 2026-03-16 按自身政策强制公开。

An attacker sending malformed miIO messages over WiFi to a Xiaomi Smart camera device can trigger the vulnerability described here.

This report describes a secure protocol design issue, which leads to authentication bypass in the proprietary Xiaomi miIO protocol.

The vulnerability described in this advisory affects a potentially wide range of Xiaomi Smart devices. This vulnerability has not yet been issued a public patch or advisory or assigned a CVE by the vendor despite repeated requests and a lapse of more than six months since the original vendor disclosure.

## Vulnerability Details

For packets received in UDP port `54321`, the `miio_client` binary verifies the MAC and then decrypts the received packet. Instead of rejecting packets with a payload size not divisible by 16 bytes, the AES decryption function contains code specifically for this case, which is not normally reached, since packet payloads are correctly padded in the regular case.

```c
void AesCbcDecrypt(
    const byte *ciphertext, uint size,
    byte *plaintext, byte *key, byte *iv
) {
  byte *dst;
  const byte *src;

  uint remainder_bytes = size & 0xf;
  copy16(plaintext, ciphertext);
  AesCurrentBlock = plaintext;
  if (key != 0x0) {
    AesKey = key;
    AesKeyExpansion();
  }
  if (iv != 0x0) {
    AesIv = iv;
  }
  uint offset = 0;
  while (true) {
    src = ciphertext + offset;
    dst = plaintext + offset;
    if (size <= offset) break;
    offset = offset + 0x10;
    copy16(dst, src);
    AesCurrentBlock = dst;
    AesBlockDecrypt();
    XorWithIv(dst);
    AesIv = src;
  }
  if (remainder_bytes != 0) {
    copy16(dst, src);
    memset(dst + remainder_bytes, 0, 0x10 - remainder_bytes);
    AesCurrentBlock = dst;
    AesBlockDecrypt();
  }
}
```

The size of the partial block is saved as `remainder_bytes`, but `size` is not decremented by this amount. This causes the last block (in the `if` condition) to read the ciphertext from outside the input buffer, and write the decrypted plaintext outside the output buffer residing on the heap.

Since the program uses the packet length specified in the miIO protocol header, the sender of the packet can control the bytes after the input buffer by sending a UDP packet larger than this length, thereby controlling the 16 bytes that are written past the bounds of the plaintext heap chunk.

## Affected Devices

-   verified: Xiaomi C400
-   potentially: any Xiaomi Smart device using miIO

## Timeline

-   2025.09.04. Bug reported to Xiaomi PSIRT by email, following the process outlined at [https://trust.mi.com/misrc/response](https://trust.mi.com/misrc/response)
-   2025.09.16. Asking for confirmation of report receipt
-   2025.09.19. Xiaomi acknowledges the report by directing us to submit to the hackerone platform.
-   2025.09.19. TASZK responds that we will not participate in their hackerone program and the report has been submitted as-is and that the disclosure will follow [https://taszk.io/disclosure](https://taszk.io/disclosure).
-   2026.02.16. TASZK asks for update and notifies Xiaomi that in accordance with the stated policy, we will proceed with disclosure.
-   2026.02.19-24. In a series of emails, Xiaomi first claims they have misplaced their PGP key and ask for the report to be re-sent plaintext, then confirms they have managed to locate their key after we refuse, then claim they have confirmed the vulnerabilities (" `our security team has reviewed your report and confirmed the vulnerabilities` ") and repeatedly ask us to join their program for rewards and simultaneaously that we postpone release. They also ask that we provide full exploit code if we have it.
-   2026.02.20-25. TASZK repeatedly confirms that we will do neither and as per request we confirm that we can also provide full exploit POC.
-   2026.03.03. TASZK shares full RCE exploit POC.
-   2026.03.06-10 Xiaomi again provides postponed timeline estimates, does not provide any CVEs, and further requests online meetings to discuss future collaboration opportunities that they want to propose.
-   2026.03.11. TASZK asks for the CVE numbers for the vulnerabilities which have been stated as confirmed and reiterates that we are focused only on this.
-   2026.03.13. Xiaomi writes that they have now changed their minds and think that one vulnerability “ `does not currently meet the conditions required for practical exploitation` ” and also that their “ `standard process` ” requires that they “ `follow a 6-months disclosure timeline following the OTA release of the corresponding patch` ” and that they “ `will complete the CVE application process and share the assigned CVE numbers with you as soon as they become available` ”.
-   2026.03.16. Advisory release, six and a half months after report. Full exploit POC also released.
