---
title: China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor
source: https://blog.talosintelligence.com/china-nexus-uat-11587-targets-government-and-policy-organizations-across-asia-with-antino-backdoor/
source_host: blog.talosintelligence.com
clip_date: 2026-09-30T18:14:56+08:00
trace_id: 417d1ae5-dc1a-46fa-9ede-2b3ce7c5865f
content_hash: d29b4fb7524b42d6b9f67f0b78afa0bba956e1c8f19eb8a4d04001566e31b649
status: synced
tags:
  - 恶意样本
  - 反调试
series: null
feed_source: Cisco Talos
ai_summary: "**TL;DR：** Cisco Talos 发现中国背景的 UAT-11587 针对亚洲多国政府与政策机构，投递首见的 Rust 后门 Antino，其后门 C2 完全寄生在 Microsoft 365 的 Outlook 与 OneDrive 死信箱中。"
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 3eb75244-d011-8117-bf49-e71ae1fc5de7
ioc:
  cves: []
  cwes: []
  hashes:
    - 0173d1566dcd4fd49fa25f11f14bfe4c
    - 01b5c6acb20e41799a0e96d9d1d6e1c44791883706b6285e874fcb15cc93b31a
    - 077bd873217d8abfbb6482d11966ca34f3fef7ad5166f24fbc5dc3ddefe894a1
    - 079acd58a74479ac8b108b618d2a4da8a8bd560a04459cd90e2fec9da5027513
    - 09ef7c736bccfafefc44d9910d499173b88063b73b221fc0dc9e9105107e5cff
    - 0a6fb71ab1362d065c7ec2678c1e73d9a0721b0e7099d392ba7559bb2eec4970
    - 0b4e5e017c0f0ccac79e13ca5d580a75af67a24ca0763f9ebfdaaeb1ba4fc739
    - 0c39264337a1186b2e765e24073399cbdcba118306614eb411e315887af578bd
    - 131ac3e0df777910e0a32e43d5744bccb0490750d4c2adc359da41d76d383c46
    - 133a46ba41136ca21c93fb08c28446826d8c0d9b7923a16f2d152d595a710098
    - 170b0eee60a335f32c1d0c19a0bb8d8bbc0a5b298ea9486b546f58d25cc8a464
    - 17b53ffa8e005f0e82491d3f9c0a4984c44da52e1668a855c11a137f627c5b4b
    - 1fadc90b61ce536abda78eb387a7f3d745f00c16775d3f762845ccc0fde567da
    - 23d5f1af8581ae200615d9a66d539f2043c3248b649e862557b379d7e8b7a3ac
    - 2f1513c822af0c6635dd3c69dc38f0b2f6e02012ea36415fff111a5d4d5fae05
    - 334f39279ff3aae40fe74340c887ae018c75bc42790586bdf9070adb5889100c
    - 3a4c9020eeb5ef22a1ff443e606ccb6705fe287c583121c713d2c9f9f1f2a2af
    - 3a94910eb8022592ce030e6861359f7e980fc1b5a6ccd290cbb071d3e95ed02a
    - 40e7e77aff603f4c2ef17b3bc8ea836e714d0734a1e5b946e52f95536ec5c91d
    - 47f98dfe01759a464e22d5ec55d012dccb38ce010dd73e3ba8d7ffefca12b4b2
    - 484ab497072ea09f12187b349f5b1c80754e4942408a009cccb20a2a3c8c6506
    - 4b614e5c37abaddca162119e42a969945caa681305e246e0ed0060ea9984008b
    - 4d0fdce4c098635fe9b296c3a82c74645f9885eb5e383aa44a0fe7e50da3ca3f
    - 5168a2696a0ed858f996f388bfe94f952d475158f4ee6206816608936db005ca
    - 5555e904101689351a2a1359c9c06da0a57139a9470df7d26823c1b75db55041
    - 5a35fcd4458e808ab0fa52bb2a92923b60566ee4d7aaadaac7c95cad3d839562
    - 5c5c060b272cd4a5c3767edc0e9478bd35b7e1756e183d0446a5491bd65519cb
    - 61a8f5add6c35f99c389012dbb2343061fd0b54611b40490b9a7f0b49d707da0
    - 65f4b9292e91abfa5adf42a03526932930c1c0a436bb186a7948fe6770295788
    - 6a1dbbfcfe6867ac83d35012b2717084388b4a34707efd0b725466dfd0e8fa56
    - 747b1d13bdf06956b5da5f47250fefd5284ebcf7961971732c3d348aa1a2d533
    - 75c12795016ae48b1bddd34a9f5adea63a12f58701eae01e1b4ab3d9dfa1513c
    - 7969ae5f11fc163049c8eadba06f814f5edece13a707e6087c1c49011a45b838
    - 7c2ac9c040b3300bffa7d2e435dbb1bc12e7efd644d2216d603c72121266395c
    - 7fa98efba59614cec0b7291aedee98764f8dc037b6cc798c93951a31208e9e32
    - 8e1d68906d6de92f359945d3a95da1480e72773a3e8dea7682d6bf0f6699f75f
    - 971cb2448b5d67dcc1f5eaa10d12e77f213035ad31230dc2ac7a510610a2059d
    - 9b7df409c9a89f7536d3ba7b6d43fb6dbac618c8bb52615ba34cc971ad71bbf3
    - 9fc50cf28f86201fda8306926817b1ede41fdd993202515905dd072f6803542f
    - a0e91085f08956a9a7034ace73cee60cb211f5d96f02bc91a026601bde8f2221
    - a13182699a12a8dd9d07c336dbd8de5e9b086b9b09793b7de2e9761aa03ce1dc
    - abfa7742e315485a98a5fafd6dbfb68e
    - ad0bd2b45e2416fb1384bf30af068d857e7c06b4226615d66b55b610a34c5670
    - ae1b45fb56b9f1b9cb3ee30d2bb1279c9b90b70bb62f8de305d198c6a4e0585e
    - aea5e9029f9212d05bde10f7806d1f2819be45d167e6fd877b9fb1b11088ac90
    - b31ca75f73a9363b0e35042a41216c3f581eaa0b9cd78cb58f089c2e40babd40
    - b3416726a064dd7f657bbb400adeb365eea7f8bb60783ad2d9da1a1d93768731
    - b75492466462141c56d97b705f0c606faf272577631dc2822aa8d6bda53633b6
    - b8e6e83a73e6e07f8873c364dd2a4b830bceb60758163e2efcd7e387cb604655
    - b90a4e770869c28fd2140acb3ebdc50c113bb6f096b4bbdb9ac87c349c70e85e
    - bd8ddc8f33e0fe43147ee6f1713654996420a27c5d2cd91751ad67124ebc6fe4
    - c8e1239d7276178b6620f47ec4880494be1cb394477b223fc54bffb0947bff50
    - ca14ad0344dc7216f6da29a5cbe4237d886cc5257e8c3a48fb4885a311c9b800
    - cd3509fa82e506cc6f2eeafa0a45d4b8b76a07edadd29779daf00568febcaba7
    - d4cb2f5df16ec9b9c5b796ae55848534e15d4f8b8806f0431108fc7a99a2548a
    - d753a615aedf8e58ffc75b2b7ebd320c0cbe6bcb5cbb885db749a2a85c55d3bf
    - d87201c1299a7f5854929645e6891c6c424d2a690031272bedacba7c5fe73a3e
    - e2eb7703047b37b28dc34e6990205d758a2454b39bc655b460606745fadcb530
    - e2f59d8d5a81583ed482b6c7bf37699efdb2264e452cf7d8cfc0c54dfbd9ab3f
    - e6ff096a0562c0042b09d250bd60272ffcd8d72bd95c563842acf765a8dc8bcf
    - e7e3b0bcd6798634adf8b49d305f3a7b7682e4b76db549682a183c5a186df4bb
    - e809da86bd81463347fa7f922d3e088755a94a331889d32acb55aa8f57778a34
    - f0c1dc6d6daa4d010932c7818ed5f22929c182f58e5f495fabe2fb3cfc835b97
    - f1ef5fe4c0cdcff13cc750c867728b89719f81437bdc49041edd1ae1f3edb4e8
    - fdbd047031c13a17c9f491c9355f44d587584ebe2b8927be8482e6c236c8e1c1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** Cisco Talos 发现中国背景的 UAT-11587 针对亚洲多国政府与政策机构，投递首见的 Rust 后门 Antino，其后门 C2 完全寄生在 Microsoft 365 的 Outlook 与 OneDrive 死信箱中。
> 
> - **规模与归因：** 2025 年 9 月首次观测，至 2026 年 7 月确认至少 10 个已确认 + 5 个疑似受害机构、约 350 台失陷终端，分布于台湾、印度、菲律宾、柬埔寨、巴基斯坦、泰国、缅甸、叙利亚；简体中文诱饵元数据、zh-CN 标签、+08:00 时间戳及 rsproxy.cn 依赖镜像等支撑"中国背景"高置信判断，但作者明确将其与 Symantec 的 Jewelbug 分开跟踪。
> - **投递与社工手法：** 钓鱼邮件滥用 RFC5321 信封发件人与 From 头不一致实现伪造发件人（SPF 通过、DMARC 失败但收件域为 p=none 仍入箱）；邮件正文用 Base64 内嵌图复刻 Gmail 附件卡片，链接为 `//my-<project>.pages.dev/File_download?m=<目标标识>` 的协议相对 URL，用于按收件人打点。
> - **五阶段感染链：** Cloudflare Pages 下发 HTA/WSF（mshta.exe 执行并回连追踪信标）→ Cloudflare R2 或 CloudFront 下发 JScript 下载器，以自定义 Base64 + RC4 解密 → 借 .NET BinaryFormatter 与 ActivitySurrogateSelector / AxHost+State 反序列化执行内存中的 TestAssembly.dll → 释放诱饵文档并侧载 → 微软签名程序 GatherOsState.exe 侧载 slc.dll（即 Antino）。所有 TestAssembly 共享 GUID `b2b3adb0-1669-4b94-86cb-6dd682ddbea3` 作为检测标记。
> - **Antino 后门能力：** Rust 编写、32/64 位、分 Gen1（2025-10）与 Gen2（2025-12 至 2026-01）；支持 cmd、powershell、system_info、上下传文件、load_shellcode、execute_program、add_to_run 持久化；load_shellcode 的 sleep_mask 会 Hook Sleep/VirtualAlloc 并注册 VEH，在休眠期间加密并去执行权限以躲内存扫描；持久化借 Windows 脚本化诊断框架（sdiageng.dll COM 类 + sdiagnhost.exe）代理执行 PowerShell，写入 HKCU Run 键。
> - **C2 与配置：** 走 OAuth 2.0 客户端凭证访问 Microsoft Graph，OneDrive 按 `/antino/heartbeats/{session_id}.json`（每分钟心跳并完成注册）、`/antino_downloads/`（回传窃取数据）、`/antino_uploads/`（下发工具）三目录运作；Outlook 每 10 秒轮询邮件命令，主题前缀 `command_req_/command_res_`。配置存于自定义 `.cfg` 节，前四字节为小端 JSON 长度后接 0xAB/0xCD 交替 XOR。

-   Cisco Talos uncovered a cluster of activity we track as UAT-11587 targeting government and policy organizations across Asia, including in Taiwan, India, the Philippines, and Cambodia, to deliver a previously undocumented backdoor referred to as “Antino” in developer artifacts.
-   Talos first observed UAT-11587 activity in September 2025. By July 2026, Talos had identified at least 16 affected or targeted institutional environments across eight Asian countries.
-   Antino is a Rust-compiled Windows backdoor that supports host reconnaissance, shell and PowerShell execution, file transfer, in-memory shellcode loading and persistence. Its native command-and-control channel operates exclusively through Microsoft 365, using Microsoft Graph to interact with Outlook and OneDrive.
-   Talos identified a recurring delivery branch that began with spear-phishing emails and tailored decoy documents, followed by a five-stage infection chain. The actor relied heavily on Cloudflare infrastructure for delivery, execution tracking, and payload staging.
-   Based on the development, preparation-environment, and targeting indicators detailed in this report, Talos assesses with high confidence that UAT-11587 is China-nexus.

* * *

## Overview

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d956e901a9b5fd32.jpg)

Talos first identified UAT-11587’s campaign while investigating a spear-phishing campaign directed at Taiwan's academic, think tank, and civil society policy community in March 2026. The message recreated Gmail's attachment interface and directed the target into a cloud-hosted, multi-stage infection chain.

Across this activity, our researchers assessed that the actor used several delivery methods, loader families, and post-compromise tools. One recurring final-stage payload was a custom Rust backdoor that Talos tracks as Antino. Antino communicates with Microsoft 365 applications and uses Outlook and OneDrive objects as dead drops, rather than depending on a conspicuous dedicated command server.

Further investigation showed that the activity extended beyond the initial Taiwan operation. Talos subsequently identified confirmed or probable affected government and security environments across multiple Asian countries, alongside additional regional targeting supported by lure content.

While this report was being prepared, Symantec published research on an activity set it tracks as [Jewelbug](https://www.security.com/threat-intelligence/jewelbug-crypto-fraud-espionage). Talos identified overlaps between UAT-11587 and the Antino-related espionage activity attributed to Jewelbug. Although Symantec reported that Jewelbug conducted both espionage and cryptocurrency fraud, it assessed that “the SEO business supplied access, delivery and infrastructure into the espionage operation, rather than that one person performed both roles.” Talos could not independently verify a connection between the espionage campaign and Jewelbug’s financially motivated activity. We therefore track UAT-11587 as a separate activity set.

## Who is UAT-11587?

Talos assesses with high confidence that UAT-11587 is a China-nexus actor, based on the totality of corroborating technical and operational evidence, rather than any single indicator. The indicators discussed below are selected examples of the broader evidence supporting this assessment.

### Evidence supporting the attribution assessment

Decoy document metadata provides several preparation-environment clues. A Taiwan-focused decoy contains the zh-CN language tag, the Simplified Chinese author value 未定义 (“undefined”), and an explicit +08:00 creation timestamp. Both recovered spear-phishing messages also contain +08:00 date headers. UTC+8 alone is not geographically distinctive because it is used across mainland China, Taiwan, Hong Kong, Singapore, and other locations. However, the combination of the +08:00 offset, the zh-CN language tag and Simplified Chinese metadata is more consistent with a mainland Chinese environment than with Taiwan or Hong Kong, [where Traditional Chinese predominates.](https://en.wikipedia.org/wiki/Traditional_Chinese_characters)

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f915e5e2261849bb.png)

Figure 1. Decoy metadata.

The campaign’s lure theme and targeting provide additional contextual support. Its lures and observed targets include Taiwanese political, legislative, civil defense, and policy research subjects, together with regional government, maritime, diplomatic, and security themes. This collection focus is consistent with [China-nexus actor interests](https://en.wikipedia.org/wiki/Chinese_intelligence_activity_abroad).

Another supporting indicator appears in Antino’s development artifacts. Ten distinct Antino build outputs contain Cargo registry paths referencing rsproxy.cn, a Rust package mirror intended to improve dependency downloads within mainland China. The service’s public accessibility does not reveal the developer’s location, but its repeated use suggests reliance on a China-focused Rust mirror.

During our investigation, Talos also identified a JavaScript downloader associated with UAT-11587 that referenced “d32tpl7xt7175h\[.\]cloudfront\[.\]net”, the same CloudFront distribution previously reported by [Arctic Wolf](https://arcticwolf.com/resources/blog/unc6384-weaponizes-zdi-can-25373-vulnerability-to-deploy-plugx/) in China-nexus UNC6384 delivery activity. This shared infrastructure suggests possible delivery-layer overlap. However, because cloud infrastructure can be reused and the campaigns employed different core malware and command-and-control (C2) architectures, Talos assesses this relationship with low confidence and continues to track UAT-11587 as a separate activity cluster.

## Victimology

UAT-11587 primarily targeted public-sector and national-security-adjacent organizations across Asia. By July 2026, Talos had identified at least 10 confirmed and five probable affected institutional environments, plus one additional intended target. Our investigation reveals approximately 350 compromised endpoints across eight countries.

The affected or targeted sectors included:

-   Defense, military, and national security
-   Executive government and central public administration
-   Foreign affairs and diplomatic services
-   Justice, law enforcement, border security, and interior security
-   Legislative and parliamentary institutions
-   Government IT and shared e-government services
-   Think tanks, universities, and research institutions
-   Civil society, human rights, and public policy organizations

Based on the available evidence, Talos assesses with moderate-to-high confidence that the campaign targeted organizations in Taiwan, India, the Philippines, Cambodia, Pakistan, Thailand, Myanmar, and Syria.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/010571ab8b8dd43f.jpg)

Figure 2. Victimology map

Based on its sustained targeting of government and national security-adjacent organizations, tailored political and diplomatic lures, and capabilities supporting persistent access and information collection, Talos assesses with moderate confidence that UAT-11587 is conducting [intelligence gathering operation](https://en.wikipedia.org/wiki/Cyber_espionage).

## Campaign timeline

Talos observed UAT-11587 activity from September 2025 through July 2026. The earliest reviewed activity, from September through November 2025, used Philippines-themed lures and direct email attachment delivery. In January 2026, the actor conducted two additional Philippines-focused HTML application (HTA) campaigns and began using a broader set of policy and geopolitical lures alongside a standalone fake installer delivery branch. Activity accelerated between March and early June, with closely timed operations involving the Philippines and Taiwan, followed by activity affecting or targeting environments in Cambodia, Myanmar, Syria, Pakistan, and Thailand. The largest concentrated wave occurred on June 8 and 9, when Talos identified around 57 newly observed endpoints associated with India.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5033ad254b4936c8.jpg)

Figure 3. Timeline of UAT-11587 campaign activity.

## Spear-phishing delivery and sender spoofing

UAT-11587, like many targeted intrusion sets, relies on spear-phishing emails to deliver its infection chain. The social engineering themes used in these emails suggest the threat actor possessed detailed prior knowledge of their target organizations. This targeting precision is particularly apparent in the Taiwan campaigns, where lure content was carefully aligned with the operational and institutional context of each target.

### Abusing sender-domain misalignment to spoof trusted senders

To make its spear-phishing emails appear more credible, UAT-11587 spoofed sender identities trusted by the intended recipients. The actor exploited the distinction between the SMTP envelope sender and the visible From header. Messages were sent through Migadu using the attacker-controlled “osc-cdn\[.\]com” domain as the RFC5321 envelope sender, while the RFC5322 From header displayed the identity of the organization being impersonated.

SPF passed because Migadu’s sending infrastructure was authorized to send email on behalf of “osc-cdn\[.\]com”. However, this result authenticated only the envelope-sender domain, not the sender displayed to the recipient. DMARC detected that the envelope and visible sender domains were not aligned and returned a failure. In the reviewed message, the displayed domain used a non-enforcing p=none policy, which requested monitoring rather than quarantine or rejection. The receiving provider therefore accepted the message, allowing the spoofed email to be successfully delivered to the recipient’s inbox despite the DMARC failure.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/758746f24386b02c.png)

Figure 4. The spoofed email passed SPF.

### Gmail attachment widget cloning

Another social engineering technique used for initial access in this campaign was the closely replicated reconstruction of Gmail’s native attachment preview widget inside the email HTML body. The actor replicated the styling of Gmail’s attachment card using four inline PNG images embedded as Base64-encoded MIME parts. The entire attachment card was wrapped in an anchor tag pointing to an attacker-controlled URL. These links use Cloudflare Pages URLs with the pattern shown below. The?m= parameter carries a target identifier and therefore permits per-recipient logging at the delivery service //my-<project>.pages.dev/File_download?m=<target-identifier>. The actor used a protocol-relative URL beginning with //, which may be overlooked by security tools that extract only fully qualified HTTP or HTTPS URLs.

When a Gmail user opens the email in a browser, Gmail’s renderer faithfully displays the attacker-controlled HTML, producing a fake attachment widget that is visually indistinguishable from a legitimate Gmail attachment preview.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/af1a4ef652ebe5ac.png)

Figure 5. Spear-phishing email sample.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59fe674d3cb58fca.png)

Figure 6. HTML code in the email with link to download malware.

## Tailored lures and decoy documents

Our analysis recovered three decoy documents during separate UAT-11587 operations. The first decoy described a workshop focused on the “Taiwan Information Warfare.” The document referenced a 2025 TikTok study and discussed perceived public knowledge gaps concerning cross-strait issues and information manipulation.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c63ddbbba6d508d2.png)

Figure 7. Decoy document recovered from Taiwan-targeting campaign.

The second decoy, titled “立法委員行使職務支領之各項費用徵免稅原則” (“Principles governing the taxation of expenses received by legislators in performing their duties”), used a narrower administrative pretext. It describes the income tax treatment of legislators’ remuneration, overseas travel, and expenses incurred while performing legislative duties. The document exactly reproduces a [public Taiwan Ministry of Finance ruling](https://law-out.mof.gov.tw/LawContent.aspx?id=GL005442) to make the decoy appear credible. Its subject strongly suggests that it was prepared for members of Taiwan's public sector.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e17bdcbbbf3f8e5d.png)

Figure 8. Taiwan-focused decoy document.

Outside Taiwan, Talos recovered a two-page decoy titled “CSIS Indo-Pacific Forecast 2026 (Event Details).” The document borrowed the framing of a legitimate event and referenced real experts, presenting an agenda focused on regional alliances, gray-zone security, demographic trends, and human security. The subject matter would plausibly appeal to government, diplomatic, think tank, academic, and security policy audiences across the Indo-Pacific, including readers focused on India.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/80945c101834c7e0.png)

Figure 9. Indo-Pacific policy-themed decoy document.

Beyond the recovered decoys, file names of malicious executables, HTA files, and WSF stagers revealed additional themes spanning maritime policy, foreign affairs, diplomatic events, human rights, government administration, and technology research.

One lure shows how the actor exploited current geopolitical developments. “Trump’s Former Russia Adviser Claims Moscow Offered US Free Rein in Venezuela in Exchange for Ukraine” closely paraphrased an [Associated Press report](https://apnews.com/article/b26a94ceaba69c6ddd9193e2b31cb97f), with two related samples appearing on VirusTotal two days later.

Together, these examples show the actor using both news-style headlines and official-sounding documents to target audiences interested in foreign affairs, international security, and government policy.

The table below lists the likely audience for each lure. Where recipient details or decoy content were unavailable, assessments are based solely on file names and subject matter and do not confirm delivery or compromise.

|     |     |
| --- | --- |
| Lure or decoy title | Potential target or audience |
| 115年度薪資所得扣繳稅額表說明 (Instructions for the 2026 Salary Income Tax Withholding Table) | Taiwanese think tank |
| Resolution on the Updated Chart of Bajo de Masinloc | Likely Philippine public sector |
| Trump's Former Russia Adviser Claims Moscow Offered US Free Rein in Venezuela in Exchange for Ukraine | Foreign-policy, government, research, or media audiences interested in the topic. |
| CrossBorder_Repression_Seminar_Agenda | Likely human-rights, civil-society, diaspora, academic, or policy communities. |
| the May 27 inauguration of the TPiE | Regional political and civil-society audiences |
| Tehran_Bilateral_Summit_Proceedings_May2026 | Likely diplomatic, foreign-affairs, or policy audiences following a Tehran-based bilateral meeting. |
| Items likely to be considered in the next Cabinet meeting.T11065885611.doc.exe | Indian government audiences |
| UO -C-DAC (1) | Indian government technology and research audiences |

## The infection chain

In the reviewed spear-phishing operations, the actor uses a five-stage infection chain that begins with an HTA stager. Later stages abuse unsafe BinaryFormatter deserialization and gadget chains in standard.NET assemblies to load and execute the final payload.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://storage.ghost.io/c/af/a0/afa04ee3-414f-4481-8d23-7e7c146f192e/content/images/2026/09/antino-chain.jpg)

Figure 10. Antino backdoor infection chain.

### Stage 1: HTA and WSF Stager

The “my-<project>.page\[.\]dev” Cloudflare URL in the spear-phishing emails leads to the download of an HTA file that was executed by mshta.exe. It hides and resizes its window, emits a tracking request to an invariant Cloudflare Pages beacon, and imports the next JavaScript stage from a cloud-hosted location. The same general template appears across multiple campaign variants:

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7da001ec8a09f167.png)

Figure 11. HTA stager.

The actor uses two cloud services to deliver the second-stage JavaScript:

-   Cloudflare R2: “pub-<32-character hexadecimal identifier>\[.\]r2\[.\]dev”
-   Amazon CloudFront: “d2nq35tel3ucuo\[.\]cloudfront\[.\]net”

The fixed Cloudflare Pages hostname “oisadjfoinsiduhfnoisdnfosdnoifnsoid\[.\]pages\[.\]dev” appears across multiple reviewed HTA variants. A hidden image causes mshta.exe to send a request containing the lure title in the URL path and?track in the query string. This could allow the operator to correlate HTA execution with a particular lure for campaign tracking.

Talos also observed WSF stagers that perform the same role through Windows Script Host. They send an HTTP HEAD request to the tracking host name with the lure title in the URL path, then load the next JavaScript stage from Cloudflare R2. Although paired HTA and WSF samples use different R2 objects and obfuscated loaders, both lead to the same infection chain.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c2445c3b6b30a7c4.png)

Figure 12. WSF stager script.

### Stage 2: HTA-hosted JScript downloader and decryptor

The Stage 2 component is HTA-hosted Microsoft JScript, delivered from Cloudflare R2 and loaded in-process by mshta.exe through the HTA stager. It acts as a downloader and decryptor that prepares the next stage in-memory.NET deserialization chain. The script retrieves three encrypted resources from the cloud-hosted delivery infrastructure:

1.  Encrypted JavaScript orchestrator (.js file)
2.  Encrypted.NET serialized gadget resource 1 (.txt file)
3.  Encrypted.NET serialized gadget resource 2 (.txt file)

After downloading the files, the script applies custom Base64 decoding and decrypts each response with RC4 using an embedded key. It then executes the decrypted JScript orchestrator in memory to initiate the.NET 4.x deserialization chain.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/128d82c2aa7f4017.png)

Figure 13. HTA-hosted JScript downloader and decryptor.

### Stage 3:.NET BinaryFormatter deserialization chain

The three files downloaded from Cloudflare R2 or Amazon CloudFront are the JScript orchestrator and two serialized.NET gadget resources. The threat actor leverages a scripted.NET deserialization technique in which JScript instantiates COM-visible.NET classes and passes attacker-controlled serialized data into BinaryFormatter. During deserialization, the embedded gadget chain drives execution, allowing the malware to load and execute an embedded.NET assembly, the next-stage “TestAssembly.dll”, inside the script host process, mshta.exe.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1a42e045053947e2.png)

Figure 14. JScript orchestrator.

The JScript orchestrator deserializes the two resources in sequence. It first attempts to deserialize stage_1, which appears designed to disable a.NET security check introduced to block ActivitySurrogateSelector-based deserialization gadget chains. The code wraps this operation in a try/catch block and proceeds to stage_2 when an exception occurs, suggesting the actor anticipated differences in.NET versions, patch levels, or assembly availability across target systems. The two-call behavior observed in stage_1 appears intended to improve compatibility across different.NET patch levels.

The second serialized resource, stage_2, uses the System.Windows.Forms.AxHost+State deserialization gadget in combination with an ActivitySurrogateSelector gadget chain. This technique substitutes a surrogate object during deserialization to drive code execution. In this case, the gadget chain loads the embedded PE file, “TestAssembly.dll”, directly into memory and executes it inside mshta.exe.

### Stage 4: “TestAssembly.dll” downloader and launcher

“TestAssembly.dll” is a small.NET downloader and launcher that Stage 3 loads directly into mshta.exe through the BinaryFormatter deserialization chain. It downloads a lure-specific decoy document and a three-file DLL-sideloading bundle from cloud-hosted infrastructure. It opens the decoy, writes the bundle to a writable staging directory, and launches the Microsoft-signed “GatherOsState.exe”, which sideloads “slc.dll”, the Antino backdoor.

The table below shows the files retrieved during one Taiwan-targeting campaign. Note that the actor uses randomized nonstandard extensions (.luy,.pzs,.syk) that remove obvious executable/DLL filename signaling.

|     |     |     |
| --- | --- | --- |
| CDN URL | Actual Content | Description |
| pub-abfa7742e315485a98a5fafd6dbfb68e.r2.dev/HeiqAW6Z\[…\].pdf | Lure-specific PDF | Decoy document opened for the victim |
| pub-abfa7742e315485a98a5fafd6dbfb68e.r2.dev/HeiqAW6ZGatherOsState.exe.luy | GatherOsState.exe (legitimate signed binary) | Legitimate signed binary that loads slc.dll |
| pub-abfa7742e315485a98a5fafd6dbfb68e.r2.dev/HeiqAW6Zslc.dll.pzs | slc.dll (Antino C2 implant) | Antino backdoor |
| pub-abfa7742e315485a98a5fafd6dbfb68e.r2.dev/HeiqAW6ZOsGather.dat.syk | OsGather.dat | Calculator decoy PE |

All the “TestAssembly.dll” downloader builds recovered in this investigation share the AssemblyAttribute GUID b2b3adb0-1669-4b94-86cb-6dd682ddbea3. This is a useful tooling-level detection marker.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8ea16d7c1333565a.png)

Figure 15..NET assembly metadata for the TestAssembly component.

### Stage 5: Signed-host DLL sideloading Antino backdoor

The downloaded “GatherOsState.exe” is a legitimate Microsoft-signed Windows Assessment and Deployment Kit (ADK) binary that was abused for DLL sideloading. When executed, it loads “slc.dll” from its local directory. The attacker placed the Antino backdoor file slc.dll alongside the signed executable, which then calls the DLL’s SLOpen export to start Antino.

## C2 infrastructure

Beyond email delivery, UAT-11587 relied extensively on Cloudflare throughout the infection chain. Cloudflare Pages hosted malicious HTA and WSF files and a separate execution-tracking endpoint, while Cloudflare R2 stored encoded loader stages, decoy documents, and payload components. UAT-11587 also used Amazon CloudFront to deliver additional scripts and decoy content. This architecture placed much of the infection chain within widely used cloud services and ordinary HTTPS traffic.

We also identified software-themed domains that directly hosted standalone Antino executables. The domain “microsoft-flash\[.\]com”, registered shortly before its use, served Antino samples from “https://microsoft-flash\[.\]com/download/flashcenter_pp_ax_install_en.exe”. Similarly, “wps-cn\[.\]com” delivered a related Antino build from “https://www.wps-cn\[.\]com/downloads/flashcenter_pp_ax_install_en.exe”. The choice of “wps-cn\[.\]com” may also indicate that the delivery site was designed to appeal to Chinese-speaking users, particularly those in mainland China.

While the infection chain relied heavily on Cloudflare, Antino itself used Microsoft 365 for post-compromise C2. The “Dead-drop C2 communication” section explains this channel in more detail.

## The Antino backdoor

Antino is a, Rust-compiled Windows backdoor observed in both 32-bit and 64-bit builds. Talos named the malware after identifying AntinoApp in its Windows application manifest and repeated antino directory names in PDB and Rust source paths across multiple variants. It supports host reconnaissance, command execution, persistence, and Microsoft Graph-based C2, using Outlook for command exchange and OneDrive for heartbeat and file transfer.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d803246185ad07f6.png)

Figure 16. The Windows application manifest identifies the program as AntinoApp.

```bash
D:\a\antino\antino\target\x86_64-pc-windows msvc\release\deps\slc_template.pdb 
D:\a\antino\antino\target\x86_64-pc-windows-msvc\release\deps\antino_client_template.pdb
D:\a\antino\antino\target\i686-pc-windows-msvc\release\deps\antino_client_template.pdb
D:\a\antino\antino\client\src\core.rs
D:\a\antino\antino\client\src\signaller\mod.rs
D:\a\antino\antino\client\src\artillery\run.rs
D:\a\antino\antino\client\src\config\mod.rs
D:\a\antino\antino\shared\src\command_client.rs
D:\a\antino\antino\shared\src\command\registry.rs
D:\a\antino\antino\shared\src\command\add_to_run.rs
D:\a\antino\antino\shared\src\command\cmd.rs
D:\a\antino\antino\shared\src\command\download_file.rs
D:\a\antino\antino\shared\src\command\execute_program.rs
D:\a\antino\antino\shared\src\command\exit.rs
D:\a\antino\antino\shared\src\command\list_files.rs
D:\a\antino\antino\shared\src\command\load.rs
D:\a\antino\antino\shared\src\command\ps.rs
D:\a\antino\antino\shared\src\command\system_info.rs
D:\a\antino\antino\shared\src\command\upload_file.rs
```

The “D:\\a\\antino\\antino\\...” paths follow the standard GitHub Actions Windows workspace structure, “D:\\a\\<repository>\\<repository>\\...”. This suggests that the reviewed CI variants were compiled on GitHub-hosted Windows runners.

The backdoor was observed in both standalone executable and DLL forms. Our analysis observed two generations of Antino, distinguished by consistent differences in their underlying code and Rust build environment. The clearest implementation differences involve session-ID generation and registration and heartbeat behavior.

|     |     |     |
| --- | --- | --- |
| Characteristic | Antino Gen1 | Antino Gen2 |
| Observed build period | October 2025 | December 2025 to January 2026 |
| Application identity | No AntinoApp manifest in the reviewed builds | Uses the AntinoApp application manifest |
| Session identifier | XOR- and Base64-encodes the process ID, computer name, username and platform. | Generates a random UUID v4 containing no host-derived information |
| Registration and heartbeat | Classic builds use sendsession and heartbeat email drafts; an early DLL already supports OneDrive heartbeats | Stores JSON heartbeat objects under “/antino/heartbeats/<session_id>.json”; the heartbeat also registers the implant |

### Dead-drop C2 communication

Antino communicates exclusively through Microsoft 365, using the Microsoft Graph API to interact with Outlook and OneDrive as dead-drop C2 channels. Both Antino generations use broadly similar Microsoft 365-based C2 workflows. This design allows Antino’s C2 traffic to blend into legitimate Microsoft application synchronization at the network layer. Outbound connections terminate at “graph.microsoft.com” and “login.microsoftonline.com”, both of which are widely trusted and commonly allowed in enterprise environments.

The Antino Gen2 implant authenticates to Microsoft Graph using the OAuth 2.0 client-credentials flow. This authentication method allows the registered Entra ID application to access the configured Outlook mailbox and OneDrive resources without requiring an interactive user sign-in.

The Antino implant uses two distinct mechanisms for C2 communication, implemented in separate modules:

**Mechanism 1: OneDrive file-based communication**

The Antino backdoor uses the threat actor’s OneDrive for registration and file-based communication. The OneDrive folder used for communication includes three folder paths:

|     |     |     |
| --- | --- | --- |
| Path | Direction | Purpose |
| /antino/heartbeats/{id}.json | Antino upload | Beacon / check-in; carries system state |
| /antino_downloads/{file} | Antino upload | Exfiltrated data from victims (files the operator downloads from victims) |
| /antino_uploads/{file} | Threat actor upload | Toolkit delivery staging (files the operator uploads to victims) |

Antino uses the heartbeats folder to upload JSON-formatted heartbeat files containing host telemetry, including the session ID, timestamp, online/offline status, machine name, username, platform, and a campaign code defined in the backdoor configuration. Each implant session is assigned a randomly generated UUID, which is used as the heartbeat filename “{session_id}.json”. The implant uploads the heartbeat file to OneDrive during initial execution and resends every minute.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/41097507fa3d21ca.png)

Figure 17. Example heartbeat JSON.

The directory naming is from the threat actor’s perspective. “antino_uploads/” holds tools the operator pushes to victims, while “antino_downloads/” holds data the operator pulls from victims. The file-based polling model is characteristic of dead-drop C2 designs used to decouple operator activity from implant activity on the network.

**Mechanism 2: Outlook commands communication**

The Antino backdoor receives commands through email messages. The implant actively pulls commands from the threat actor’s Outlook mailbox folder every 10 seconds. The protocol uses two message types: command emails contain tasking from the controller, while response emails contain the implant’s results.

Command messages are identified by the subject prefix command_req\_\[session_id\] and responses by command_res\_\[session_id\], as indicated in the HTTP GET request sent by Antino:

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/21cea3e746d19256.png)

Figure 18. Request from Antino to Outlook to get commands from emails.

The body of each command message contains a JSON object with the information required for execution. It has three fields: command_type, the command to invoke; command_data, an object containing command-specific parameters; and request_id, a per-command identifier used to correlate the request with the corresponding response (the request_id is distinct from the implant session_id used in the message subject and heartbeat). For example, a cmd request has this body:

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2bb99f53ba0adb53.png)

Figure 19. The JSON sent in command request message.

The response follows a similar structure. Its body contains a JSON object describing the outcome of command execution. The command_type field identifies the command that was executed, while request_id links the response to the corresponding request. The success field indicates whether the command succeeded, result contains the returned output, and error provides failure details or is null when execution succeeds. For example, a successful cmd response has the following body:

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a85173c1153c4cb7.png)

Figure 20. The JSON sent in command response message.

### Antino-supported commands

Antino is a comprehensive backdoor that supports several commands for host reconnaissance and execution. Across the reviewed Antino builds, Talos identified the following command handlers. Command availability varies by generation and build.

|     |     |
| --- | --- |
| Command/handler | Capability |
| cmd | Runs cmd.exe /C and captures output |
| powershell | Runs powershell.exe -Command |
| system_info | Collects host and process context |
| execute_program | Executes an operator-supplied program |
| list_files | Enumerates a directory |
| upload_file | Transfers files from the threat actor’s OneDrive to the compromised host |
| download_file | Exfiltrates files from the compromised host to the threat actor’s OneDrive |
| load_shellcode | Runs operator-supplied shellcode in memory |
| add_to_run | Establishes Antino persistence by adding a Registry Run value |
| exit | Stops the Antino runtime |

*Antino-supported commands. Command availability varies slightly by generation and build.*

The cmd and powershell commands allow the operator to execute commands directly through the Windows command shell or PowerShell and collect their output.

Filesystem operations are handled through list_files, upload_file, and download_file. Similar to the C2 communication protocol, these names are written from the operator’s perspective: upload_file transfers files from the threat actor’s OneDrive to the compromised endpoint, while download_file reads a file from the endpoint and uploads it to OneDrive for operator retrieval.

Antino provides two options for running actor-supplied code: load_shellcode and execute_program. The load_shellcode command sends a Base64-encoded payload in the command-request email body in the following JSON format:

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed1b86623277d7aa.png)

Figure 21. The load_shellcode command structure.

**Masking the loaded payload**

The use_sleep_mask parameter enables a defense evasion technique intended to reduce the secondary payload’s exposure to memory scanners. When enabled, Antino hooks Sleep and VirtualAlloc and registers a vectored exception handler (VEH). The VirtualAlloc hook records the tracked memory region. When the tracked payload thread calls Sleep, the Sleep hook changes that region to non-executable (PAGE_READWRITE), encrypts its contents in place, and then calls the real Sleep function.

After Sleep returns, an attempt to execute code from the encrypted, non-executable region triggers an access violation. The VEH confirms that the fault occurred within the tracked region, restores its previous memory protection, decrypts the content, and resumes execution. This technique is intended to reduce the time during which memory scanners can observe recognizable executable payload bytes. Although this technique does not mask the entire Antino process or guarantee evasion, it adds another layer of defense evasion by reducing the window in which memory scanners can identify the loaded payload.

**Abuse of the Windows Scripted Diagnostics framework workflow**

The Antino backdoor abuses the Windows Scripted Diagnostics framework to execute attacker-controlled PowerShell through legitimate Windows components. Both the execute_program and add_to_run commands use this technique.

This workflow involves three components:

-   Scripted Diagnostics Execution Engine (“sdiageng.dll”)
-   Program Compatibility Wizard (PCW) troubleshooting package (“C:\\Windows\\diagnostics\\system\\PCW”)
-   Scripted Diagnostics Native Host process (“sdiagnhost.exe”)

Windows [normally uses](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/wintt/about-wtp) “sdiageng.dll” to load troubleshooting packages such as PCW, while “sdiagnhost.exe” executes their PowerShell scripts in a separate process.

Antino initializes COM and creates an instance of CLSID {1F3D8AA5-9EBF-4EE4-85C2-EA40379AEDE8}, the CScriptedDiag class implemented by “sdiageng.dll”. It then initializes the engine with the legitimate PCW package and a blank diagnostic Answers XML document. The engine creates a temporary working copy of the package and returns its directory, such as “C:\\Windows\\Temp\\SDIAG\_<GUID>”.

Antino writes an attacker-controlled PowerShell script into this directory. For example, the add_to_run command generates a script that creates an HKCU Run key value:

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/545b8324aaad03c9.png)

Figure 22. PowerShell script generated by Antino’s add_to_run command.

Antino then resumes the diagnostic workflow. The Scripted Diagnostics engine delegates execution to the native host, observed in runtime traces as %windir%\\SysWOW64\\sdiagnhost.exe -Embedding. The host subsequently executes result.ps1. The resulting Run key entry launches the selected Antino executable the next time the affected user signs in.

The technique allows Antino to proxy PowerShell execution and the persistence-related registry modification through a Microsoft-signed diagnostic workflow. This can complicate behavioral attribution to the original implant, although it does not eliminate observable PowerShell, file-creation or registry telemetry.

![China-nexus UAT-11587 targets government and policy organizations across Asia with Antino backdoor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/19db07f2aae78613.png)

Figure 23. Antino calls CoCreateInstance to activate the Windows diagnostic COM class.

### Antino configuration

Antino stores the configuration data in a custom PE section named.cfg. The on-disk structure begins with a four-byte little-endian JSON length followed by bytes XORed with the alternating key 0xAB 0xCD.

In addition to its C2 configuration, Antino’s embedded configuration contains two deployment settings, run and launch_mode. The run field controls whether Antino automatically installs a persistent copy when it starts. When set to true, Antino launches its installation task, stages the required files under %LOCALAPPDATA%\\Windows GatherOSStateKit\\, and creates an HKCU Run value. launch_mode is evaluated only when run is set to true. It defines which files constitute the persistent payload: exe or raw for standalone PE or dll for sideloading.

## Coverage

The following ClamAV signatures detect and blocks this threat:

-   Html.Trojan.UAT-11587-10060367-2
-   Txt.Trojan.UAT-11587-10060385-5
-   Txt.Trojan.UAT-11587-10060386-1
-   Win.Trojan.UAT-11587-10060365-1
-   Win.Trojan.UAT-11587-10060366-1
-   Win.Trojan.UAT-11587-10060369-1
-   Win.Trojan.UAT-11587-10060370-1
-   Win.Trojan.UAT-11587-10060371-1
-   Win.Trojan.UAT-11587-10060372-1
-   Win.Trojan.UAT-11587-10060373-1
-   Win.Trojan.UAT-11587-10060374-1
-   Win.Trojan.UAT-11587-10060375-1
-   Win.Trojan.UAT-11587-10060376-1
-   Win.Trojan.UAT-11587-10060377-1
-   Win.Trojan.UAT-11587-10060378-1
-   Win.Trojan.UAT-11587-10060379-1
-   Win.Trojan.UAT-11587-10060380-1
-   Win.Trojan.UAT-11587-10060381-1
-   Win.Trojan.UAT-11587-10060382-1
-   Win.Trojan.UAT-11587-10060383-1
-   Win.Trojan.UAT-11587-10060384-1

The following Snort rules cover this threat:

-   Snort 2: 1:66880, 1:66881, 1:66882
-   Snort 3: 1:66880, 1:66881, 1:66882

## Indicators of compromise (IOCs)

IOCs for this research can also be found at our GitHub repository [here](https://github.com/Cisco-Talos/IOCs/blob/main/2026/09/uat-11587-targets-gov.txt).

e809da86bd81463347fa7f922d3e088755a94a331889d32acb55aa8f57778a34 (malicious HTA stager - CSIS Indo-Pacific lure)

e6ff096a0562c0042b09d250bd60272ffcd8d72bd95c563842acf765a8dc8bcf (malicious HTA stager - Bajo de Masinloc lure)

4d0fdce4c098635fe9b296c3a82c74645f9885eb5e383aa44a0fe7e50da3ca3f (malicious HTA stager - Taiwan information-warfare workshop lure)

f1ef5fe4c0cdcff13cc750c867728b89719f81437bdc49041edd1ae1f3edb4e8 (malicious HTA stager - Taiwan legislative-tax lure)

01b5c6acb20e41799a0e96d9d1d6e1c44791883706b6285e874fcb15cc93b31a (malicious HTA stager - Venezuela and Ukraine news lure)

5a35fcd4458e808ab0fa52bb2a92923b60566ee4d7aaadaac7c95cad3d839562 (malicious HTA stager - Venezuela and Ukraine news lure)

17b53ffa8e005f0e82491d3f9c0a4984c44da52e1668a855c11a137f627c5b4b (malicious HTA stager - institutional disciplinary-action lure)

484ab497072ea09f12187b349f5b1c80754e4942408a009cccb20a2a3c8c6506 (malicious WSF stager - institutional disciplinary-action lure)

3a94910eb8022592ce030e6861359f7e980fc1b5a6ccd290cbb071d3e95ed02a (malicious HTA stager - TPiE inauguration lure)

6a1dbbfcfe6867ac83d35012b2717084388b4a34707efd0b725466dfd0e8fa56 (malicious WSF stager - TPiE inauguration lure)

75c12795016ae48b1bddd34a9f5adea63a12f58701eae01e1b4ab3d9dfa1513c (malicious HTA stager - Tehran bilateral-summit lure)

bd8ddc8f33e0fe43147ee6f1713654996420a27c5d2cd91751ad67124ebc6fe4 (malicious WSF stager - Tehran bilateral-summit lure)

b75492466462141c56d97b705f0c606faf272577631dc2822aa8d6bda53633b6 (malicious HTA stager - cross-border repression seminar lure)

23d5f1af8581ae200615d9a66d539f2043c3248b649e862557b379d7e8b7a3ac (malicious WSF stager - cross-border repression seminar lure)

0b4e5e017c0f0ccac79e13ca5d580a75af67a24ca0763f9ebfdaaeb1ba4fc739 (malicious HTA stager - Latin carnival lure)

ae1b45fb56b9f1b9cb3ee30d2bb1279c9b90b70bb62f8de305d198c6a4e0585e (malicious WSF stager - Latin carnival lure)

cd3509fa82e506cc6f2eeafa0a45d4b8b76a07edadd29779daf00568febcaba7 (malicious HTA stager - C-DAC lure)

b8e6e83a73e6e07f8873c364dd2a4b830bceb60758163e2efcd7e387cb604655 (malicious WSF stager - C-DAC lure)

7969ae5f11fc163049c8eadba06f814f5edece13a707e6087c1c49011a45b838 (malicious HTA stager - Latin carnival lure variant)

aea5e9029f9212d05bde10f7806d1f2819be45d167e6fd877b9fb1b11088ac90 (malicious WSF stager - Latin carnival lure variant)

7fa98efba59614cec0b7291aedee98764f8dc037b6cc798c93951a31208e9e32 (malicious HTA stager - internal-review lure)

65f4b9292e91abfa5adf42a03526932930c1c0a436bb186a7948fe6770295788 (malicious WSF stager - internal-review lure)

61a8f5add6c35f99c389012dbb2343061fd0b54611b40490b9a7f0b49d707da0 (Antino-chain Stage 2 JScript downloader and decryptor)

747b1d13bdf06956b5da5f47250fefd5284ebcf7961971732c3d348aa1a2d533 (Antino-chain Stage 2 JScript downloader and decryptor)

a13182699a12a8dd9d07c336dbd8de5e9b086b9b09793b7de2e9761aa03ce1dc (Antino-chain Stage 2 JScript downloader and decryptor)

2f1513c822af0c6635dd3c69dc38f0b2f6e02012ea36415fff111a5d4d5fae05 (Antino-chain Stage 2 JScript downloader and decryptor)

a0e91085f08956a9a7034ace73cee60cb211f5d96f02bc91a026601bde8f2221 (Antino-chain Stage 2 JScript downloader and decryptor - HTA branch)

47f98dfe01759a464e22d5ec55d012dccb38ce010dd73e3ba8d7ffefca12b4b2 (Antino-chain Stage 2 JScript downloader and decryptor - WSF branch)

b3416726a064dd7f657bbb400adeb365eea7f8bb60783ad2d9da1a1d93768731 (Antino-chain Stage 2 JScript downloader and decryptor - HTA branch)

0a6fb71ab1362d065c7ec2678c1e73d9a0721b0e7099d392ba7559bb2eec4970 (Antino-chain Stage 2 JScript downloader and decryptor - WSF branch)

f0c1dc6d6daa4d010932c7818ed5f22929c182f58e5f495fabe2fb3cfc835b97 (Antino-chain encrypted JScript orchestrator)

5555e904101689351a2a1359c9c06da0a57139a9470df7d26823c1b75db55041 (Antino-chain encrypted BinaryFormatter resource)

5168a2696a0ed858f996f388bfe94f952d475158f4ee6206816608936db005ca (Antino-chain encrypted BinaryFormatter resource)

7c2ac9c040b3300bffa7d2e435dbb1bc12e7efd644d2216d603c72121266395c (Antino-chain encrypted JScript orchestrator)

d87201c1299a7f5854929645e6891c6c424d2a690031272bedacba7c5fe73a3e (Antino-chain encrypted BinaryFormatter resource)

334f39279ff3aae40fe74340c887ae018c75bc42790586bdf9070adb5889100c (Antino-chain encrypted BinaryFormatter resource)

077bd873217d8abfbb6482d11966ca34f3fef7ad5166f24fbc5dc3ddefe894a1 (Antino-chain encrypted JScript orchestrator)

ad0bd2b45e2416fb1384bf30af068d857e7c06b4226615d66b55b610a34c5670 (Antino-chain encrypted BinaryFormatter resource)

e2f59d8d5a81583ed482b6c7bf37699efdb2264e452cf7d8cfc0c54dfbd9ab3f (Antino-chain encrypted BinaryFormatter resource)

3a4c9020eeb5ef22a1ff443e606ccb6705fe287c583121c713d2c9f9f1f2a2af (Antino-chain encrypted JScript orchestrator)

4b614e5c37abaddca162119e42a969945caa681305e246e0ed0060ea9984008b (Antino-chain encrypted JScript orchestrator)

c8e1239d7276178b6620f47ec4880494be1cb394477b223fc54bffb0947bff50 (Antino-chain encrypted BinaryFormatter resource)

079acd58a74479ac8b108b618d2a4da8a8bd560a04459cd90e2fec9da5027513 (Antino-chain encrypted BinaryFormatter resource)

8e1d68906d6de92f359945d3a95da1480e72773a3e8dea7682d6bf0f6699f75f (Antino-chain encrypted JScript orchestrator)

170b0eee60a335f32c1d0c19a0bb8d8bbc0a5b298ea9486b546f58d25cc8a464 (Antino-chain encrypted BinaryFormatter resource)

b31ca75f73a9363b0e35042a41216c3f581eaa0b9cd78cb58f089c2e40babd40 (Antino-chain encrypted BinaryFormatter resource)

d753a615aedf8e58ffc75b2b7ebd320c0cbe6bcb5cbb885db749a2a85c55d3bf (Antino-chain TestAssembly.dll downloader)

133a46ba41136ca21c93fb08c28446826d8c0d9b7923a16f2d152d595a710098 (Antino-chain TestAssembly.dll downloader)

9fc50cf28f86201fda8306926817b1ede41fdd993202515905dd072f6803542f (Antino-chain TestAssembly.dll downloader)

d4cb2f5df16ec9b9c5b796ae55848534e15d4f8b8806f0431108fc7a99a2548a (Antino-chain TestAssembly.dll downloader)

131ac3e0df777910e0a32e43d5744bccb0490750d4c2adc359da41d76d383c46 (Antino-chain TestAssembly.dll downloader)

09ef7c736bccfafefc44d9910d499173b88063b73b221fc0dc9e9105107e5cff (Antino Gen 2 slc.dll backdoor)

0c39264337a1186b2e765e24073399cbdcba118306614eb411e315887af578bd (Antino Gen 2 standalone fake-installer backdoor)

1fadc90b61ce536abda78eb387a7f3d745f00c16775d3f762845ccc0fde567da (Antino Gen 1 slc.dll backdoor)

40e7e77aff603f4c2ef17b3bc8ea836e714d0734a1e5b946e52f95536ec5c91d (configured Antino Gen 1 standalone backdoor)

5c5c060b272cd4a5c3767edc0e9478bd35b7e1756e183d0446a5491bd65519cb (configured Antino standalone backdoor)

971cb2448b5d67dcc1f5eaa10d12e77f213035ad31230dc2ac7a510610a2059d (Antino Gen 2 standalone fake-installer backdoor)

9b7df409c9a89f7536d3ba7b6d43fb6dbac618c8bb52615ba34cc971ad71bbf3 (Antino Gen 2 standalone fake-installer backdoor)

b90a4e770869c28fd2140acb3ebdc50c113bb6f096b4bbdb9ac87c349c70e85e (Antino Gen 2 standalone fake-installer backdoor)

ca14ad0344dc7216f6da29a5cbe4237d886cc5257e8c3a48fb4885a311c9b800 (post-unpack Antino standalone backdoor memory image)

e2eb7703047b37b28dc34e6990205d758a2454b39bc655b460606745fadcb530 (Antino Gen 2 slc.dll backdoor)

e7e3b0bcd6798634adf8b49d305f3a7b7682e4b76db549682a183c5a186df4bb (Antino Gen 2 slc.dll backdoor)

fdbd047031c13a17c9f491c9355f44d587584ebe2b8927be8482e6c236c8e1c1 (Antino Gen 2 slc.dll backdoor)

103\[.\]27\[.\]110\[.\]220 (historical serving IP for the Antino payload hosted on wps-cn\[.\]com)

osc-cdn\[.\]com (actor-used spear-phishing sender domain)

oisadjfoinsiduhfnoisdnfosdnoifnsoid\[.\]pages\[.\]dev (Cloudflare Pages execution-tracking domain)

d2nq35tel3ucuo\[.\]cloudfront\[.\]net (Antino-chain CloudFront staging domain)

pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev (Antino-chain Cloudflare R2 staging domain)

pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev (Antino-chain Cloudflare R2 staging domain)

my-3lyt6wcp\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-qc39r814\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-662ylt3w\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-6g16qsfe\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-goq6xmbm\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-h3qli6kq\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-sv7c1fzs\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-u0up9qri\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-vtsdod2n\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

my-wgoxp32b\[.\]pages\[.\]dev (Cloudflare Pages delivery domain)

microsoft-flash\[.\]com (standalone Antino fake-installer delivery domain)

wps-cn\[.\]com (standalone Antino fake-installer delivery domain)

hxxps://microsoft-flash\[.\]com/download/flashcenter_pp_ax_install_en.exe (standalone Antino fake-installer delivery URL)

hxxps://www\[.\]wps-cn\[.\]com/downloads/flashcenter_pp_ax_install_en.exe (standalone Antino fake-installer delivery URL)

hxxps://my-662ylt3w\[.\]pages\[.\]dev/Institutional_Disciplinary_Action_Report_May_2026.hta (malicious HTA delivery URL)

hxxps://my-662ylt3w\[.\]pages\[.\]dev/Institutional_Disciplinary_Action_Report_May_2026.wsf (malicious WSF delivery URL)

hxxps://my-6g16qsfe\[.\]pages\[.\]dev/the%20May%2027%20inauguration%20of%20the%20TPiE.hta (malicious HTA delivery URL)

hxxps://my-6g16qsfe\[.\]pages\[.\]dev/the%20May%2027%20inauguration%20of%20the%20TPiE.wsf (malicious WSF delivery URL)

hxxps://my-goq6xmbm\[.\]pages\[.\]dev/Tehran_Bilateral_Summit_Proceedings_May2026.hta (malicious HTA delivery URL)

hxxps://my-goq6xmbm\[.\]pages\[.\]dev/Tehran_Bilateral_Summit_Proceedings_May2026.wsf (malicious WSF delivery URL)

hxxps://my-h3qli6kq\[.\]pages\[.\]dev/CrossBorder_Repression_Seminar_Agenda.hta (malicious HTA delivery URL)

hxxps://my-h3qli6kq\[.\]pages\[.\]dev/CrossBorder_Repression_Seminar_Agenda.wsf (malicious WSF delivery URL)

hxxps://my-sv7c1fzs\[.\]pages\[.\]dev/Extravaganza%20Latin%20Carnival.hta (malicious HTA delivery URL)

hxxps://my-sv7c1fzs\[.\]pages\[.\]dev/Extravaganza%20Latin%20Carnival.wsf (malicious WSF delivery URL)

hxxps://my-u0up9qri\[.\]pages\[.\]dev/UO%20-C-DAC%20%281%29.hta (malicious HTA delivery URL)

hxxps://my-u0up9qri\[.\]pages\[.\]dev/UO%20-C-DAC%20%281%29.wsf (malicious WSF delivery URL)

hxxps://my-vtsdod2n\[.\]pages\[.\]dev/Extravaganza%20Latin%20Carnival%20post%20copy.hta (malicious HTA delivery URL)

hxxps://my-vtsdod2n\[.\]pages\[.\]dev/Extravaganza%20Latin%20Carnival%20post%20copy.wsf (malicious WSF delivery URL)

hxxps://my-wgoxp32b\[.\]pages\[.\]dev/Internal_Review_Dossier_0520.hta (malicious HTA delivery URL)

hxxps://my-wgoxp32b\[.\]pages\[.\]dev/Internal_Review_Dossier_0520.wsf (malicious WSF delivery URL)

hxxp://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/4oyE4n4ozLQ0.log (Antino-chain Stage 2 URL)

hxxp://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/LtVGUSsyUTDA.log (Antino-chain Stage 2 URL)

hxxp://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/TzzyYlYnJ40Z.log (Antino-chain Stage 2 URL)

hxxp://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/tdyvHHVcrci8.log (Antino-chain Stage 2 URL)

hxxp://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/Qw7Womin4X6N (Antino-chain Stage 2 URL)

hxxp://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/kVFPxm1uAjOY (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/5SVIdjpRQjkZ (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/PbyfSk69AwVf (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/qMD71Z95clTf (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/HenUWB51MwpG (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/q9LgxIaU1CJK (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/BKvYRxPiGpbM (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/nswz3cb9lhuC (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/6HJV5qV5BTLs (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/MKJacn3hFt3Y (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/cX8MChhuVvzz (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/byrdvvZEZZlk (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/5TGrbjCCLa8M (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/s0p18dgHR4PZ (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/zlKDeyO3HuUS (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/icWMOGLJcfQO (Antino-chain Stage 2 URL)

hxxp://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/5U7kzhvlYlVF (Antino-chain Stage 2 URL)

hxxps://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/9q9OlLKCm0an2ct1.js (Antino-chain encrypted JScript orchestrator URL)

hxxps://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/LwqPW64Xl0ti3q7s.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://d2nq35tel3ucuo\[.\]cloudfront\[.\]net/HsOw0YU9s11dxyr1.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/0u25lAqY58or53ra.js (Antino-chain encrypted JScript orchestrator URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/gpv0IRMtvto6e8t2.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/HzjNPgRE9ir92e38.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/2laZiB2zvnx04jze.js (Antino-chain encrypted JScript orchestrator URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/wyLwwCu43j1wf2pg.js (Antino-chain encrypted JScript orchestrator URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/ThyI9pwewrh_a1pr.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/8ypvQLxJvggmrz94.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/vD68BdmB2ky28gcc.js (Antino-chain encrypted JScript orchestrator URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/oaFE7PJHk0h_emqt.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/AcPP9fCvdjztmho8.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/7ChyKauxbnuftp68.js (Antino-chain encrypted JScript orchestrator URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/KOOOT4a76st012bx.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/Ub4RJzNIrfleri8t.txt (Antino-chain encrypted BinaryFormatter resource URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/HeiqAW6ZGatherOsState.exe.luy (Antino sideload-package URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/HeiqAW6Zslc.dll.pzs (Antino backdoor delivery URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/HeiqAW6ZOsGather.dat.syk (Antino sideload-package URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/hjgzBskgGatherOsState.exe.lzj (Antino sideload-package URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/hjgzBskgslc.dll.iwq (Antino backdoor delivery URL)

hxxps://pub-abfa7742e315485a98a5fafd6dbfb68e\[.\]r2\[.\]dev/hjgzBskgOsGather.dat.ael (Antino sideload-package URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/bzP3NcRPGatherOsState.exe.thl (Antino sideload-package URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/bzP3NcRPslc.dll.czh (Antino backdoor delivery URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/bzP3NcRPOsState.dat.mxb (Antino sideload-package URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/VD7F3WxnGatherOsState.exe.mtm (Antino sideload-package URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/VD7F3Wxnslc.dll.fsc (Antino backdoor delivery URL)

hxxps://pub-0173d1566dcd4fd49fa25f11f14bfe4c\[.\]r2\[.\]dev/VD7F3WxnOsState.dat.pgy (Antino sideload-package URL)
