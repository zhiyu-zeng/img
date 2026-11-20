---
title: Integrity on Embedded Linux Devices under the Cyber Resilience Act
source: https://sigma-star.at/blog/2026/06/integrity-on-embedded-linux-devices-under-the-cyber-resilience-act/
source_host: sigma-star.at
clip_date: 2026-11-20T10:40:51+08:00
trace_id: 94af7ce5-d6c7-4336-9aeb-77b8fbf104d7
content_hash: 2abab2103bfc5b7db798837ff8cd5d4c5e4865070c1e7cacf2dc22561803ec4e
status: synced
tags: []
series: null
feed_source: sigma star·嵌入式/TrustZone
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41e75244-d011-8105-9248-d8be7156b96a
ioc: null
---

As with [confidentiality](https://sigma-star.at/blog/2026/02/data-confidentiality-via-storage-encryption-on-embedded-linux-devices/), the Cyber Resilience Act (CRA) lists integrity as an essential cybersecurity requirement. In this post, we look at what that means for embedded Linux devices.

[Annex I, Part I(2)](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402847#anx_I) states that products with digital elements placed on the EU market shall:

> (f) protect the integrity of stored, transmitted or otherwise processed data, personal or other, commands, programs and configuration against any manipulation or modification not authorised by the user, and report on corruptions

So how does an embedded Linux device actually satisfy this requirement? The CRA’s integrity requirement is as broad as it sounds. It covers not just (personal and non-personal) data, but also commands, programs, and configuration, and applies whether the device stores, transmits, or actively processes those assets.

There is no single technical control that protects all of these assets in all states. Depending on the product and its threat model, integrity may require controls for the boot chain, software updates, stored data, application binaries, configuration, commands, and communication with other systems.

## Scope of the CRA Integrity Requirement

This has two parts:

### Assets in Scope

> stored, transmitted or otherwise processed data, personal or other, commands, programs and configuration

The CRA names data, commands, programs, and configuration, but it does not prescribe a fixed list of components or controls. Under [Article 13](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402847#art_13), the cybersecurity risk assessment must indicate whether and how the Annex I, Part I(2) requirements apply to the product. For embedded devices, this means the vendor needs a threat model. It should identify which assets an attacker could modify, which paths they could use, and what the consequences would be.

For an embedded device, the assets in scope may include the bootloader, kernel, kernel command line, application binaries, configuration, and messages or commands exchanged with other systems. The requirement is therefore not limited to user data or personal data. Even a device that stores no personal data at all falls within the integrity requirement.

### Required Protection

> protect … against any manipulation or modification not authorised by the user, and report on corruptions

For an embedded Linux device, this means protecting relevant assets against unauthorised modification, detecting integrity failures where appropriate, and reporting corruptions. The right technologies depend on the asset and threat model.

In some cases, protecting against unauthorised modification also requires [authenticity](https://csrc.nist.gov/glossary/term/authenticity). The device must verify that software, configuration, commands, or data originate from an authorised source.

## Integrity Controls for Embedded Linux

Embedded Linux devices usually need integrity controls at several layers. The following examples are a starting point, not a checklist for every product:

-   **Secure boot**: to verify the integrity and authenticity of each component in the boot chain before the device executes it. Implement secure boot carefully: attackers may abuse inputs outside the chain of trust, such as the kernel command line or bootloader environment, for bypasses.
    
-   **Signed updates**: to verify the authenticity and integrity of firmware, operating system, and application updates before the device installs them. Depending on the product, this may also require rollback protection.
    
-   **Integrity of data at rest**: to detect modification or corruption of stored data. Depending on the layer and use case, different mechanisms can implement this, such as:
    
    -   [dm-verity](https://docs.kernel.org/admin-guide/device-mapper/verity.html) for read-only block devices
    -   [dm-integrity](https://docs.kernel.org/admin-guide/device-mapper/dm-integrity.html) for writable block devices, optionally in combination with [dm-crypt](https://docs.kernel.org/admin-guide/device-mapper/dm-crypt.html) for authenticated encryption.
    -   [Linux IMA and EVM](https://ejaaskel.dev/yocto-hardening-ima-and-evm/) for file integrity and selected file metadata.
    -   [fs-verity](https://docs.kernel.org/filesystems/fsverity.html) for read-only file contents.

-   **Access control**: to preserve integrity by restricting who or what can modify relevant assets. A device may implement access control at different levels, for example with filesystem permissions, Linux security modules such as [SELinux](https://git.kernel.org/pub/scm/linux/kernel/git/pcmoore/selinux.git/tree/README.md) or [AppArmor](https://apparmor.net/), or application-level authorization checks for APIs (such as REST or GraphQL).
    
-   **Integrity of data in transit**: to detect unauthorised modification of data while the device exchanges it with other systems and reject modified data, for example with TLS.
    
-   **Trusted Execution Environments**: to protect selected code and data while in use. For instance, TEEs can provide integrity and confidentiality protection even if an attacker compromises the main operating system, depending on the TEE design and threat model.
    

## Conclusion

The main takeaway is that the CRA integrity requirement is broad, and no single feature can fulfill it. Depending on the threat model, the product may need multiple complementary technologies.

As a reminder, non-compliance with the CRA carries significant fines. The main obligations apply from 11 December 2027, after which non-compliance with the essential cybersecurity requirements can result in fines of up to [EUR 15,000,000 or 2.5% of total worldwide annual turnover](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=OJ:L_202402847#art_64).

If you need help deriving a threat model, selecting suitable integrity mechanisms, or reviewing whether your existing mitigations cover the relevant threats, we’d be happy to help.
