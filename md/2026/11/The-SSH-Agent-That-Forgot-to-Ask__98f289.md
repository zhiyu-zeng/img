---
title: The SSH Agent That Forgot to Ask
source: https://garrettstimpson.ca/posts/2026/11/19/russh-ssh-agent-forgot-to-ask/
source_host: garrettstimpson.ca
clip_date: 2026-11-20T02:28:26+08:00
trace_id: 483fb638-fcf4-4581-8f61-701e06324039
content_hash: 07df3cbdcc81f07f586a35d25cb704db822fe2387de404a47adebb095d81c5b5
status: synced
tags: []
series: null
feed_source: Garrett Stimpson
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-815c-8e2c-d760e72272c1
ioc:
  cves:
    - CVE-2026-116794
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

A key marked “ask me before using this” should, at minimum, ask.

That is the small, stubborn expectation behind CVE-2026-116794, also tracked as [GHSA-vp5q-ff62-jwqv](https://github.com/Eugeny/russh/security/advisories/GHSA-vp5q-ff62-jwqv). In affected versions of the russh library, its SSH agent server did not call the confirmation callback before using keys carrying a confirmation constraint.

The consent dialog was effectively replaced by a yes-man. No dramatic cryptographic breakthrough required.

The affected range is **0.50.0-beta.12 through 0.64.1**, inclusive. **0.65.0 contains the fix.** This was an October fix, not a fresh November 19 zero-day. There is no verified active exploitation established by the evidence reviewed for this article.

The useful question is not whether the headline sounds alarming. It is whether your software actually runs the affected agent server, who can reach it, and what your confirmation policy does.

## SSH and an SSH agent are different jobs

SSH establishes authenticated, encrypted connections. An SSH agent is a separate service that holds keys and answers requests to perform cryptographic operations with them.

When a client needs to authenticate, it can ask an agent to sign authentication data. The agent returns a signature rather than handing over the private key.

That distinction matters here. This issue concerns **unauthorized key use**, not demonstrated private-key extraction. A signature can still have serious consequences: successful authentication does not become harmless merely because the private key stayed put.

It is also not a remote code execution vulnerability. The reported failure is a missing authorization check in an agent signing workflow, not an ability to execute arbitrary instructions inside the agent process.

An application can use russh without exposing this particular path. The relevant component is the library’s agent server implementation, not every SSH connection made by software that depends on the library.

## What the confirmation constraint promises

With a compatible agent, a command such as:

```bash
ssh-add -c /path/to/disposable_key
```

adds a key with a confirmation requirement. The intended policy is that a later request to use that key needs approval.

This is separate from the passphrase protecting a key file. A passphrase may be entered when loading the key; confirmation governs subsequent use while the key is available to the agent.

The advisory identifies the missing step: the affected server never called `Agent::confirm`. A key could therefore carry the confirmation constraint without that constraint producing the expected approval decision.

That is a trust-boundary failure. The requester can ask for a signature, but the requester is not supposed to supply the owner’s consent.

There is an important limit to the command example above: `ssh-add` talks to the agent selected by its environment. Running it successfully against some other agent says nothing about whether an application embeds the affected russh server.

## Exposure depends on access to the agent

This is not a claim that any internet host can reach every affected agent.

An attacker needs a route to submit signing requests to the relevant agent interface. Locally, that could mean access to an agent socket or another interface exposed by an embedding application. Permissions, process isolation, and application architecture all matter.

Agent forwarding creates another conditional route. A forwarded agent lets a remote environment request operations from the originating agent without copying the private key there. Someone controlling that remote environment may consequently be able to request signatures through the forwarded connection.

Confirmation is one possible safeguard against that use. If the agent ignores its confirmation constraint, that safeguard is missing.

But forwarding must actually be enabled and connected to the affected agent for that scenario to apply. Merely having SSH installed, or connecting to a server, does not establish exposure.

Equally, “the private key never left the machine” is not a complete defense. A signing service that performs an unwanted authentication operation has already crossed an important boundary.

## The fix calls the hook; it does not invent a policy

Version 0.65.0 restores the missing confirmation path. Upgrade affected dependencies, but do not stop reading at the version number.

The default implementation of `Agent::confirm` returns `true`.

That means an application relying on the default callback still approves requests. Installing the fixed library does not manufacture a desktop prompt, discover the intended approver, or build an approval workflow on the application’s behalf.

If your product promises confirmation, it needs a meaningful callback implementation. That implementation must distinguish approval from denial and handle situations where approval cannot be obtained.

A failed prompt should not quietly become permission.

Also keep `confirm_request` separate from `Agent::confirm`. The advisory identifies `confirm_request` as unaffected. Similar names do not make these interchangeable checks, and the reported fix should not be described as repairing every confirmation-related interface.

## Check the dependency, then the deployment

For a Rust project, start with:

```bash
cargo tree -i russh
```

Run this in the relevant workspace with the build configuration you actually ship. It helps identify reverse dependencies and resolved versions. If multiple versions appear, investigate each relevant path rather than assuming one updated copy replaces them all.

Then establish whether the application implements an agent server. A dependency listing alone cannot answer that.

For an affected application, upgrade to 0.65.0 or an appropriate release containing the fix, rebuild and redeploy it, then restart the running agent. Changing a dependency file does not update the process already holding your keys. Desktop-app users should install the application’s fixed build rather than assume updating a separate Rust toolchain changes bundled code.

For SSH client configuration, inspect the effective settings for a particular destination:

```bash
ssh -G hostname
```

Review `forwardagent`, `identityagent`, `identityfile`, and `identitiesonly` as applicable. Effective configuration is more useful than staring at a single configuration file while an included file or host-specific block changes the result.

This command inspects configuration; it does not prove which server implementation backs an agent or demonstrate that confirmation works.

Avoid forwarding an agent into environments that do not need it. Restrict access to local agent interfaces. Those are exposure reductions, not substitutes for correcting the missing check.

## Test denial, not just successful login

Use a disposable key and an isolated test environment. Do not discover your confirmation policy by experimenting with a production identity.

A useful regression test should:

1.  Start the application’s actual agent implementation.
2.  Load the disposable key with a confirmation constraint.
3.  Submit a signing request through the relevant agent interface.
4.  Make the confirmation callback explicitly deny the request.
5.  Verify that the request fails and produces no usable signature.
6.  Repeat with explicit approval and verify the intended operation succeeds.

Also test an unconstrained key so that the change does not accidentally disable ordinary operations. If your application provides a prompt, test cancellation and unavailable approval channels against its documented policy.

The decisive assertion is denial. A successful login only proves that something signed; it does not prove that consent controlled the signature.

## The boundary worth keeping

This vulnerability is frustrating because the security promise was already expressed. The key had a constraint. The implementation had a callback. The signing path failed to connect them.

The practical response is specific: identify affected agent servers, move to 0.65.0 or a later appropriate release, implement real confirmation where promised, and test refusal end to end.

### Primary sources

-   [Maintainer advisory: GHSA-vp5q-ff62-jwqv](https://github.com/Eugeny/russh/security/advisories/GHSA-vp5q-ff62-jwqv), including the affected release history and regression test.
-   [Upstream fix restoring the confirmation callback](https://github.com/Eugeny/russh/commit/62db6e7defd6d244159da962ccccb029e785ce0f).
-   [russh 0.65.0 release](https://github.com/Eugeny/russh/releases/tag/v0.65.0).
-   [Fixed agent implementation](https://github.com/Eugeny/russh/blob/v0.65.0/russh/src/keys/agent/server.rs), useful for reviewing the default callback and request-level checks.

“Ask before use” is not decorative metadata. It is an authorization decision, and the system needs to honor the answer when that answer is no.
