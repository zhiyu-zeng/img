---
title: Data Confidentiality via Storage Encryption on Embedded Linux Devices
source: https://sigma-star.at/blog/2026/02/data-confidentiality-via-storage-encryption-on-embedded-linux-devices/
source_host: sigma-star.at
clip_date: 2026-11-20T10:39:56+08:00
trace_id: f91ba5b6-f1f1-4429-8d99-19cebaab6599
content_hash: 1275fa79d387bcac21079ad80fec3488d91b486caf5dd53c762796f58e0d06c0
status: synced
tags: []
series: null
feed_source: sigma star·嵌入式/TrustZone
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41e75244-d011-81e5-9dae-e80ddd78ff9a
ioc: null
---

The Cyber Resilience Act (CRA) lists data confidentiality as an “essential cybersecurity requirement” that products must meet to be placed on the EU market [1](#fn:1). This requirement will affect many embedded Linux devices, particularly those that store personal data. This blog post is the first in a series covering CRA-related security topics.

Data confidentiality is the protection of data against unauthorized access and disclosure. To ensure confidentiality comprehensively, it must be maintained across all states in which data may exist. Depending on the threat model, different technologies may be required for each state. For example:

-   Transport Layer Security (TLS) for **data in transit**
-   Trusted Execution Environments (TEEs) for **data in use**
-   Encryption at rest (e.g., full-disk encryption) for **data at rest**

Various methods can provide confidentiality for data at rest, depending on the specific requirements of the data. For example, to protect user passwords, Linux relies on the shadow file (`/etc/shadow`), which stores salted password hashes. This approach works because authentication only requires comparing hashes, not recovering the original plaintext. However, if the data must be retrieved in plaintext later, encryption is a common approach.

Storage encryption can be implemented at multiple layers of the software stack. The most fine-grained approach is application-level encryption, where specific programs, such as password managers, manage encryption and decryption internally. Another option is storage-level encryption, which transparently protects data regardless of which application accesses it. In this post, we focus on the storage encryption technologies available in Linux.

Linux offers several mechanisms within the storage stack to encrypt data at rest, with `dm-crypt` [2](#fn:2), `fscrypt` [3](#fn:3), and `eCryptfs` [4](#fn:4) being among the most common options. At the block level, `dm-crypt` facilitates full-disk or full-partition encryption. At the filesystem level, `fscrypt` enables granular per-directory encryption on supported filesystems. While `eCryptfs` offers a similar stacked filesystem approach, it is an older technology that has been largely superseded by `fscrypt`.

##### Side Note: What Data at Rest means

Data at rest refers to digital information that is physically stored on a stable storage medium, such as a hard drive or a flash drive, and is not currently moving through a network or being processed in memory. In the context of storage encryption, this data is protected by converting it into ciphertext using cryptographic algorithms, ensuring that its confidentiality is preserved even if the physical hardware is stolen. Accessing the information requires a specific decryption key or password, which serves as a final barrier between an unauthorized user and the raw files.

## Block-level encryption with dm-crypt

![Block-level encryption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/73fb47f1bbadcb95.svg)

Block-level encryption

The `dm-crypt` device-mapper target implements block-level encryption in Linux. It enables full-disk or full-partition encryption on any device exposed to Linux as a block device, that is, any storage medium that processes data in fixed-size blocks, such as HDDs, SSDs, SD cards, and eMMC modules. Because it operates at the block level, it supports any block-based filesystem.

The Linux device-mapper allows the creation of virtual block devices that map to one or more underlying block devices, which may be physical or virtual. A device-mapper target processes read and write requests issued to the virtual block device and forwards them to the underlying device. The target specifies how requests are mapped and whether data is transformed in the process. One such target is `dm-crypt`, which encrypts data on writes and decrypts it on reads.

While `dm-crypt` can encrypt entire disks or partitions, it operates strictly on block devices. Therefore, it cannot operate on raw flash exposed through the Linux MTD subsystem (e.g., raw NAND), which is common in embedded systems. Note that SSDs and USB drives are flash-based too, but their internal controllers abstract the raw flash and present a normal block device interface to the OS.

The user space tool `cryptsetup` [5](#fn:5) is commonly used for configuring `dm-crypt` volumes. Alternatively, the tool `dmsetup` [6](#fn:6) provides low-level control of the device-mapper and can manage mappings for any target, including `dm-crypt`. `cryptsetup` supports the Linux Unified Key Setup (LUKS) format (LUKS1 [7](#fn:7) and LUKS2 [8](#fn:8)), which specifies a standardized on-disk header for storing encryption metadata at the beginning of the encrypted block device. The LUKS header contains multiple key slots, allowing multiple passphrases to unlock the same encrypted volume. When the user enters a passphrase, `cryptsetup` derives a key-encryption key and uses it to decrypt the volume key material stored in a LUKS key slot. If this step succeeds, `cryptsetup` loads the volume key into `dm-crypt`.

## Filesystem-level encryption with fscrypt (or eCryptfs)

![Filesystem-level encryption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/8100cf5914a636e1.svg)

Filesystem-level encryption

The Linux kernel provides two mechanisms for filesystem-level encryption: `fscrypt` and `eCryptfs`. Of these, `fscrypt` is the modern and recommended solution. Before `fscrypt` was introduced, overlay or stacked filesystem approaches such as `eCryptfs` were commonly used. `eCryptfs` itself is a stacked filesystem and the community now widely considers it obsolete, with potential removal from the Linux kernel in the future [9](#fn:9). As a result, its use today is typically justified only in niche scenarios, most notably when filesystem-level encryption is required but the underlying filesystem does not support `fscrypt`.

`fscrypt` provides transparent encryption at the filesystem level. In contrast to `dm-crypt`, which encrypts an entire block device, filesystem-level encryption applies policies per directory, encrypting the files within the protected directory tree. This design allows different parts of the same filesystem to use different encryption keys. For example, multiple users can encrypt their home directories with distinct keys even though all home directories reside on the same underlying block device.

Because `fscrypt` is a library that filesystems can hook into to support transparent encryption of files and directories, a filesystem must explicitly support it. Filesystems that currently support `fscrypt` include `ext4`, `f2fs`, and `ubifs`. `fscrypt` is particularly relevant for deeply embedded Linux systems that use raw NAND storage, where `dm-crypt` cannot be used because it operates only on block devices.

It is important to note that `fscrypt` encrypts file contents and filenames, but leaves most filesystem metadata unencrypted. This includes ownership and permission bits, timestamps and directory structure.

## Key Takeaways

Linux can protect data at rest using storage encryption at the block level with `dm-crypt` or at the filesystem level with `fscrypt` or the older `eCryptfs`. From the perspective of applications, this protection is transparent because the kernel encrypts data on write operations and decrypts it on read operations. As a result, data is stored on disk in encrypted form. An attacker who gains physical access to the storage medium or obtains an offline disk image can recover only ciphertext.

A more fine-grained alternative is application-level encryption, where the application implements encryption and decryption internally. This approach increases complexity, but it can provide additional protection against certain runtime attacks. For example, consider an attacker who gains remote, arbitrary read access to the filesystem. With application-level encryption, reads of application data files still return only ciphertext, and the attacker must also compromise the application or its key-handling path to obtain plaintext. By contrast, with the storage encryption methods discussed above, once the data is unlocked, the OS exposes plaintext through the filesystem as part of normal operation, so an attacker with sufficient runtime file access can read the data directly.

![Application-level encryption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b0f9cb008660d8af.svg)

Application-level encryption

However, encryption alone does not ensure integrity. For example, `fscrypt` provides confidentiality but not integrity, so an attacker who modifies ciphertext can cause data corruption or worse, change encrypted data in a way that cause software to act differently. To detect tampering, use authenticated encryption (AEAD) with `dm-crypt` in combination with integrity mechanisms such as `dm-integrity` [10](#fn:10) for writable storage or `dm-verity` [11](#fn:11) for read-only storage.

Another issue to keep in mind is that, on embedded devices, interactive passphrase entry at boot is generally not possible, even though it is needed to retrieve the storage encryption key. Therefore, the key must be stored in a secure location. Embedded systems commonly rely on hardware-backed key storage for this purpose, such as TPMs or secure elements. For further reading, see our blog post [**TPM on Embedded Systems**](https://sigma-star.at/blog/2026/01/tpm-on-embedded-systems-pitfalls-and-caveats/).

The most appropriate method to ensure data confidentiality depends on the data that requires protection and the threat model. At sigma star gmbh, we generally recommend combining full-disk encryption using `dm-crypt` with application-level encryption for sensitive data. For embedded systems, we also recommend benchmarking encryption algorithms and cipher configurations. If the CPU must encrypt and decrypt every block in software, read and write throughput and boot time can degrade. By benchmarking candidate configurations on the target hardware, we can determine the highest-performing option without compromising security.

1.  [https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402847#anx_I](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402847#anx_I) [↩](#fnref:1 "return to article")
    
2.  [https://docs.kernel.org/admin-guide/device-mapper/dm-crypt.html](https://docs.kernel.org/admin-guide/device-mapper/dm-crypt.html) [↩](#fnref:2 "return to article")
    
3.  [https://docs.kernel.org/filesystems/fscrypt.html](https://docs.kernel.org/filesystems/fscrypt.html) [↩](#fnref:3 "return to article")
    
4.  [https://www.ecryptfs.org/](https://www.ecryptfs.org/) [↩](#fnref:4 "return to article")
    
5.  [https://man7.org/linux/man-pages/man8/cryptsetup.8.html](https://man7.org/linux/man-pages/man8/cryptsetup.8.html) [↩](#fnref:5 "return to article")
    
6.  [https://man7.org/linux/man-pages/man8/dmsetup.8.html](https://man7.org/linux/man-pages/man8/dmsetup.8.html) [↩](#fnref:6 "return to article")
    
7.  [https://cdn.kernel.org/pub/linux/utils/cryptsetup/LUKS_docs/on-disk-format.pdf](https://cdn.kernel.org/pub/linux/utils/cryptsetup/LUKS_docs/on-disk-format.pdf) [↩](#fnref:7 "return to article")
    
8.  [https://gitlab.com/cryptsetup/LUKS2-docs/-/raw/main/luks2_doc_wip.pdf](https://gitlab.com/cryptsetup/LUKS2-docs/-/raw/main/luks2_doc_wip.pdf) [↩](#fnref:8 "return to article")
    
9.  [https://lore.kernel.org/lkml/ZyKf6ZSZrETI+4%2FS@redbud/T/#u](https://lore.kernel.org/lkml/ZyKf6ZSZrETI+4%2FS@redbud/T/#u) [↩](#fnref:9 "return to article")
    
10.  [https://docs.kernel.org/admin-guide/device-mapper/dm-integrity.html](https://docs.kernel.org/admin-guide/device-mapper/dm-integrity.html) [↩](#fnref:10 "return to article")
     
11.  [https://docs.kernel.org/admin-guide/device-mapper/verity.html](https://docs.kernel.org/admin-guide/device-mapper/verity.html) [↩](#fnref:11 "return to article")
