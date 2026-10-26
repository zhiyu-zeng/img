---
title: "Keyless Entry: Hacking SwitchBot Smart Locks — Neodyme"
source: https://neodyme.io/en/blog/switchbot/
source_host: neodyme.io
clip_date: 2026-10-26T23:46:13+08:00
trace_id: 16d2d75a-03f8-4bb8-8c31-123c141e7721
content_hash: 34fce2315aedcbae30747b2ea722f1182af97b988e16ba2f513b2a0162978613
status: synced
tags:
  - 漏洞分析
  - BLE安全
series: null
feed_source: Neodyme
ai_summary: |-
  TL;DR：SwitchBot Lock Pro 智能锁存在 BLE 通信加密缺陷，攻击者无需物理接触即可通过嗅探并篡改命令字节，静默远程开锁。
  - **架构隐患：** 门外的键盘负责验证 PIN/指纹/工卡，再通过未加密的明文 BLE 向门内执行器发送"UNLOCK"命令，安全完全依赖应用层自制加密机制。
  - **密码学弱点：** 命令使用 AES-CTR 模式加密，CTR 无完整性保护，且密文比特翻转 1:1 传播到明文，可被实施 bit-flipping 攻击。
  - **攻击方法：** 嗅探一条加密的 LOCK 命令，将 LOCK 与 UNLOCK 明文的 XOR 差异翻转进密文，即可伪造出有效加密的 UNLOCK 命令开锁。
  - **影响范围：** 该 XOR 差异在所有会话和所有同固件设备间完全相同，可视为"万能钥匙"，一次计算即可开多把锁；nonce 复用整个会话也是缺陷但非关键。
  - **披露态度：** 团队认为易受影响设备很多，选择不公开完整利用代码，仅发布攻击视频演示。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40575244-d011-8157-b91c-caef358239b6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：SwitchBot Lock Pro 智能锁存在 BLE 通信加密缺陷，攻击者无需物理接触即可通过嗅探并篡改命令字节，静默远程开锁。
> - **架构隐患：** 门外的键盘负责验证 PIN/指纹/工卡，再通过未加密的明文 BLE 向门内执行器发送"UNLOCK"命令，安全完全依赖应用层自制加密机制。
> - **密码学弱点：** 命令使用 AES-CTR 模式加密，CTR 无完整性保护，且密文比特翻转 1:1 传播到明文，可被实施 bit-flipping 攻击。
> - **攻击方法：** 嗅探一条加密的 LOCK 命令，将 LOCK 与 UNLOCK 明文的 XOR 差异翻转进密文，即可伪造出有效加密的 UNLOCK 命令开锁。
> - **影响范围：** 该 XOR 差异在所有会话和所有同固件设备间完全相同，可视为"万能钥匙"，一次计算即可开多把锁；nonce 复用整个会话也是缺陷但非关键。
> - **披露态度：** 团队认为易受影响设备很多，选择不公开完整利用代码，仅发布攻击视频演示。

Authored by:

## TL;DR

We’ve identified multiple vulnerabilities in devices of the popular [SwitchBot](https://eu.switch-bot.com/) Lock Pro smart lock series. The most critical, a cryptographic flaw in their bluetooth communication, allows everyone to silently open smart locks in a software-only attack. No physical tampering is required. Below is a video of the attack in action.

## Introduction

Smart locks have become very popular in recent years. Especially when it comes to AirBnB-style apartment sharing, but also in corporate environments and private accommodation, people enjoy having locks that don’t require physical keys. So when it came to selecting targets for our regular IoT hacking team event, smart locks were a natural choice.

After some research we cam across the highly praised [Switchbot Lock Pro Combo](https://www.amazon.de/Lock-Pro-Touch-Fingerprint-Matter/dp/B0CR67GWML/?), including a key actuator, pin pad and smartphone app. It is one of the best-rated and most-sold smart locks on Amazon. For roughly 240€ (at the time of writing) it comes with a lot of features - and the Amazon reviewers are happy to share that it works as intended.

Features aside, our main interest was, of course, the device’s security. So we ordered one and had a look. Here is what we found out.

## Reversing the Lock

As usual when inspecting IoT devices, we wanted to get our hand on the firmware. But before we dive into that, let’s first look into the target’s features and architecture.

### The Switchbot Pro Lock

The bundle comes with two hardware devices, an actuator and a key pad. The lock can further be controlled and configured via a smartphone app.

![Switchbot Pro Lock Bundle on Amazon](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6621d44846441c3e.png)

Switchbot Pro Lock Bundle on Amazon

The actuator is mounted onto the inside of the door and encloses the door’s key. When the door is supposed to open, the actuator simply turns the key in the lock.

![Switchbot Pro Lock Actuator Promotional Material](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5fa80bde9e9927b7.jpg)

Switchbot Pro Lock Actuator Promotional Material

The key pad is kept outside the door and communicates with the actuator over [Bluetooth Low Energy](https://de.wikipedia.org/wiki/Bluetooth_Low_Energy) (BLE). A person can authenticate itself to the system either using a smart card/key fob, using a fingerprint, or - most commonly - by supplying a PIN. The whole system can also be added to a WiFi network, making it possible to control the lock over the Internet.

Now that we have an idea of the feature set, we can start digging.

### Firmware Reversing

When hacking a device, it is usually a good idea to first get your hands on its firmware. There are various techniques for accomplishing this, [FLASH Dumping](https://neodyme.io/en/blog/drone_hacking_part_1/) for example. Before starting to desolder chips, however, it makes sense to scrape the web for firmware artifacts.

With SwitchBot we got lucky, as the Android app contained the URL for a public S3 bucket containing firmware files. Downloading and analysing these files we found two surprising architectural choices. First, the key pad on the **outside** of the door actually controls the actuator on the **inside**, not the other way around. Meaning that the key pad decides if a PIN, fingerprint or key fob is valid and then issues an “UNLOCK” command to the actuator. Secondly, the communication between the key pad and actuator relies on an unprotected, clear-text BLE connection. Authentication between key pad and actuator is done solely on the application level using a home-brewed mechanism.

While the first point already yields a significant attack surface (i.e. let’s dump the key pad and open the door), the second offers a code smell too good to pass up. So we focussed our main energy on exploiting the BLE communication between key pad and actuator.

### Key Pad Communications

Once the key pad and actuator are paired, they communicate using unprotected BLE. Meaning that all security of the system depends on application-level protections. So let’s find out how these protections work.

Upon pairing, the key pad and actuator agree on a *secret key*. Then, everytime the key pad becomes active, it requests a so-called “ [nonce](https://en.wikipedia.org/wiki/Cryptographic_nonce) ” value from the actuator. For our attack this does not matter. It is noteworthy however, that the nonce is supposed to provide “freshness” between invocations of the protocol but that this implementation uses the same nonce for an entire “session” which can last for multiple commands. After the nonce is received, the key pad encrypts a command, using the secret key and nonce, and sends said command over the BLE connection. Such a command could, for example, be “lock the door”.

The following diagram illustrates how the BLE communication works.

![Communication between key pad and actuator (simplified)](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e07b4bbf0bbf0832.png)

Communication between key pad and actuator (simplified)

Simply by looking at the communication diagram we can see a potential problem: We might be able to simply replay previous “unlock” commands that we have captured. However, that would require us to be within Bluetooth range, sniff the command, and then somehow replay it before the session ends. Since we aren’t writing an academic paper but do actual research: This is boring.

**We want to be able to open the lock, first shot, without any physical tampering and without leaving traces.**

And, as it turns out, we can accomplish this. But first need some more background on the implementation.

### Communication Protection

So the key pad/actuator communication is protected using secret-key encryption and a nonce. Digging further into the implementation, and with the help of [community-developed libraries](https://github.com/jonghwanhyeon/python-switchbot), we found out how the encryption is done.

The commands are encrypted using the [AES](https://de.wikipedia.org/wiki/Advanced_Encryption_Standard) block cipher in counter (CTR) mode. Now, counter mode is an interesting choice, because it doesn’t actually offer any integrity protection. Furthermore, because of its design, turning a block cipher into a stream cipher, bit flips propagate 1:1 from ciphertext to plaintext.

![Counter mode encryption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a0cb87db265fa47d.png)

Counter mode encryption

Meaning that: If we change a bit in a ciphertext, upon decryption by the actuator, this exact bit will also be changed in the decrypted plaintext. This is a little-known, but often encountered vulnerability class. So, let’s exploit this fact and open some doors!

## Exploiting the Lock

A key observation helps us to mount our attack. The key pad’s lock button always sends an encrypted LOCK command, even if the door is already locked. Exploiting the fact that AES CTR is used, we only need to compute the difference between an encrypted LOCK and UNLOCK command. When we XOR this difference (flipping all corresponding bits) into an encrypted LOCK command, the result will be a validly encrypted UNLOCK command. It’s important to note here that this difference has to be computed only once, as it is identical across sessions and devices! We therefore split the attack into a setup phase, run once, and an attack phase that opens a specific lock.

After the one-time setup, the attack works as follows:

-   Press the lock button
-   Sniff an encrypted LOCK command send via BLE
-   Bit-flip the encrypted LOCK command into an encrypted UNLOCK command
-   Send the bit-flipped command to the actuator
-   The door opens

As we suspect a lot of vulnerable devices out there, we won’t publish our full exploit here. But using an individual example, you can see why our attack works. So, let’s work through it.

### Setup Phase

Using one pair of encrypted LOCK and UNLOCK commands, intercepted via BLE, we can compute their XOR difference. This difference is identical across all sessions and all locks using the same firmware. Therefore, we can use this difference as a sort of “master key” to open all SwitchBot Pro locks.

Sniffing an encrypted LOCK and UNLOCK command is done easily using our acquired lock. Then, we simply compute:
