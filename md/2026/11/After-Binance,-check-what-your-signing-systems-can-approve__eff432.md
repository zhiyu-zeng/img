---
title: After Binance, check what your signing systems can approve
source: https://blog.trailofbits.com/2026/11/06/after-binance-check-what-your-signing-systems-can-approve/
source_host: blog.trailofbits.com
clip_date: 2026-11-07T00:28:33+08:00
trace_id: 5128c20b-8a71-44ec-af85-1595f3750608
content_hash: d1063f021e9b70eb3ccbbf80b73aeab3c2ae662143cb201c34cb1c01df0839e2
status: synced
tags: []
series: null
feed_source: Trail of Bits
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41075244-d011-816e-821a-e7b0e0152b82
ioc: null
---

Binance’s [October 2026 security incident](https://www.coindesk.com/business/2026/10/30/binance-arranges-usd6-34-billion-to-cover-losses-from-record-crypto-hack) raises an operational question for every organization holding user funds: Can your security controls recognize when a valid signature grants an attacker wallet authority? If an organization only monitors transfers and ownership changes, it may miss the shift in wallet authority until assets move.

Binance’s [initial update](https://www.binance.com/en/support/announcement/detail/c5a8729a97ac486d963784d96c5642d7) about the incident suggested that a compromised DevOps laptop allowed an attacker to access a service container and submit unauthorized withdrawals. Its [second update](https://www.binance.com/en/support/announcement/detail/d3306d9dca5243548c813b605e1d1751) reported additional breaches but no evidence that wallet private keys had leaked. In its [November 3 report](https://www.binance.com/en/blog/community/3229153443759566763), Binance described a broader attack involving social engineering, misuse of an internal AI tool, stolen credentials, and unauthorized access to its wallet-signing service. The attacker nevertheless obtained valid signatures, illustrating a major risk: a compromised server with permission to request signatures can misuse a protected key without extracting it.

The attacker used an [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) delegation that allows a wallet to sign a standing instruction: “Use this code when my account is called.” Ethereum keeps that instruction in place until it is changed or cleared using the wallet’s key. That enabled [repeated transfers](https://www.trmlabs.com/resources/blog/north-korea-steals-usd-6-36-billion-from-binance-in-the-largest-hack-in-history), including funds deposited after the first theft, without further signatures from Binance. Other Binance wallets were drained through ordinary signed transfers.

Transaction execution and monitoring systems must keep pace with Ethereum. EIP-7702 places delegation authorizations outside ordinary calldata. Session keys, recovery paths, authorization modules, Safe modules, and [ERC-4337 UserOperations](https://eips.ethereum.org/EIPS/eip-4337) all add execution paths that signing policies and monitors must understand. Systems that have not been updated can miss malicious authority changes and asset movements, leaving wallets exposed. Teams must update their detection rules and test that these attack paths are covered.

If you’re responsible for securing wallet infrastructure, start with our checklist.

## Four steps to strengthen wallet security

These four recommendations address the risks exposed by the attack. We also provide tests to help you verify that these security controls work.

### 1\. Reduce access to signing infrastructure

Document every service and API that can request wallet signatures, who can call it, and what it can authorize, including transfers, delegation, and arbitrary data. Review this inventory whenever wallet functionality changes on supported chains. Separate signing infrastructure from everyday business systems and verify transaction details through an independent system. Use our [TRAIL method](https://blog.trailofbits.com/2025/02/28/threat-modeling-the-trail-of-bits-way/) to trace how a compromised laptop or server could reach signing.

**Verify the result:**

-   For each identified compromise path, use the access and credentials available to the compromised system to attempt an unapproved action. Identify the control expected to block it and retain evidence that no usable signature was produced.

### 2\. Treat delegation as an administrative privilege

Configure signing services to recognize requests that change account authority. Reject [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702) authorizations for custody externally owned accounts (EOAs) that do not need delegation, and ensure generic digest-signing APIs cannot bypass that restriction. Where delegation is required, separately approve the authorizing account, delegate address and code, chain, and nonce. Before evaluating execution, simulations must apply the proposed delegation and inspect changes to permissions and future execution authority alongside immediate balance changes.

**Verify the result:**

-   Delegation requests for accounts with delegation disabled are rejected through both dedicated and generic signing interfaces.
    
-   Changing an approved account, delegate, chain, or nonce requires renewed approval. Simulations expose added authority even when the transaction moves no assets immediately.
    

### 3\. Limit damage even if signing is compromised

Even after delegation, the original EOA key can still transfer funds or change the delegate. This means that if the key is compromised, an attacker can bypass limits enforced by the delegate. Protect those assets with separate custody controls that the operational key cannot change. Our [cold-storage guidance](https://blog.trailofbits.com/2025/09/05/safer-cold-storage-on-ethereum/) describes independently enforced limits, monitored delays on sensitive actions, and a separate configuration authority.

**Verify the result:**

-   Treat the operational key as compromised and attempt direct transfers, delegate replacement, and policy changes. Confirm these paths cannot bypass the claimed protections, including shortening or removing delays.
    
-   Exercise incident response against a malicious withdrawal. Record alert and containment times, and demonstrate that responders can cancel or contain the withdrawal before execution. Confirm that the blocked withdrawal cannot subsequently execute.
    

### 4\. Detect changes in wallet authority

Map each wallet to the assets and contracts it controls, including wallets that hold no funds. Alerts should identify the affected systems and privileges (e.g., an unapproved delegation on an account that can upgrade funded vaults). Attribute direct calls, module execution, and [ERC-4337 operations](https://ercs.ethereum.org/ERCS/erc-4337) to their authorization paths.

**Verify the result:**

-   Test various delegation scenarios, mixed authorization tuples, multisig-module execution, and failed UserOperations inside successful bundles.
    
-   Monitoring should reconstruct authority changes and asset movements in order, identify affected systems, and distinguish detection from controls that block execution before funds move.
    

## Make signing infrastructure an ongoing responsibility

If your organization runs wallets or signing services, take another look at how they’re secured. Test whether your signing policies account for EIP-7702 and ERC-4337, whether independent safeguards still work if an attacker gains access to signing, and whether your monitoring catches changes to accounts and permissions.

Give someone ownership of this review and put it on a regular schedule. Run it again whenever you change the protocols you support, the wallets you use, or your signing services.
