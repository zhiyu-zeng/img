---
title: The Attachment Your Scanner Never Saw
source: https://garrettstimpson.ca/posts/2026/11/17/mail-parser-the-attachment-your-scanner-never-saw/
source_host: garrettstimpson.ca
clip_date: 2026-11-19T09:27:06+08:00
trace_id: 71a49ee8-6f6a-4442-b4c3-8cc730c8a7a1
content_hash: a33a32b7542909e5869b9a7700d6996792967cfcdcbb32338a96eed49cab1f31
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
notion_page_id: 41d75244-d011-81a5-a3ac-eb48c627bb1c
ioc:
  cves:
    - CVE-2026-129301
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

A mail scanner opens a message, extracts its attachments and sends them off for inspection. Nothing malicious turns up.

There is a question worth asking before that result becomes a green check mark: did it extract everything?

CVE-2026-129301 is a small-looking bug with an uncomfortable answer. In affected versions of the Python package mail-parser, one unusable attachment could interrupt the operation that saves attachments to disk. The files that came after it were never written. A scanner consuming that directory could therefore inspect less than the recipient’s mail client received.

Not because the malware was encrypted. Not because somebody defeated the antivirus engine. Because the suspicious file never reached the engine’s input.

## The failure sits between parsing and inspection

The [maintainer’s advisory](https://github.com/SpamScope/mail-parser/security/advisories/GHSA-8cgq-x343-p74c) identifies the affected range as **mail-parser 4.6.0 through 4.6.2**, with a fix in **4.6.3**.

The vulnerable operation is `write_attachments()`. It loops through the parsed attachments, checks their filenames and writes their contents to an output directory. Before the fix, exceptions from certain filename checks and write operations escaped that loop. One bad item could end the whole batch.

The advisory describes three routes to that failure: an invalid filename containing a decoded NUL character, a basename longer than the filesystem accepts, and a payload that fails base64 decoding. These are properties of a message supplied by its sender, not settings that require access to the receiving server.

There is an important boundary here. The maintainer explicitly says that `parse()` itself was not affected by this particular bug. The unguarded path was attachment writing. A deployment that only parses messages, or implements its own safe extraction, is not automatically vulnerable to this failure just because it imports the package.

The consequence also depends on the surrounding application. An uncaught exception might stop a worker or send a message to quarantine. That is disruptive, but it is different from declaring the message safe. The more dangerous integration catches an error, continues processing and treats the partially populated extraction directory as complete.

That last step is where a library failure can become a security verdict.

## A clean folder is not a clean message

The maintainer describes the bug as an evasion primitive as well as an availability problem: a hostile attachment can precede another attachment that never gets saved for inspection, even though the recipient’s client can still receive it.

That is the documented failure mode. It is not evidence that every gateway using mail-parser delivers unscanned malware, and it is not evidence of a campaign against those gateways.

The narrower point is serious enough. A security pipeline has to preserve the relationship between the original message, the files extracted from it and the verdict attached to it. If extraction stops halfway through, scanning every file in the resulting directory does not repair that relationship.

Imagine a warehouse inspection in which one damaged box stops the unloading crew. Inspectors examine every box on the loading dock and find nothing wrong. Their report may be accurate about the dock. It says nothing about the rest of the truck.

Email tooling can make that mistake without producing anything that looks like a dramatic compromise. The scanner runs. The directory exists. A report is generated. Only the completeness of the evidence is missing.

## The November date needs an asterisk

This is newly listed information, not a newly shipped patch.

The [fix, pull request #171](https://github.com/SpamScope/mail-parser/pull/171), was merged on **August 19, 2026**. The [4.6.3 release](https://github.com/SpamScope/mail-parser/releases/tag/4.6.3) was published that day too. The repository advisory records an August 19 publication date and a November 16 update.

The separate [GitHub reviewed advisory entry](https://github.com/advisories/GHSA-8cgq-x343-p74c) records publication on **November 16, 2026**. That is why it is worth revisiting now: a dependency alert may arrive months after the corrective release became available.

Calling this a fresh zero-day would be wrong. So would assuming that an August fix means nobody still needs to act.

The sources reviewed for this article do **not** establish exploitation in the wild, victim counts or the prevalence of affected deployments. The maintainer provides a reproducer; I reviewed the advisory and patch, but did not independently execute that reproducer. The downstream scanner-bypass scenario is the maintainer’s stated impact, with its practical outcome dependent on how an application handles extraction failures.

## What the patch changes

The patch does more than wrap the whole operation in a broad exception handler.

An invalid filename is logged and skipped so processing can continue with subsequent attachments. Overlong names are shortened to a bounded UTF-8 length while preserving the extension. Decoding happens before the file is opened, avoiding an empty output file left behind by a decoding failure.

The [patch discussion and implementation](https://github.com/SpamScope/mail-parser/pull/171) also address malformed base64 handling and filename collisions. Those details matter because an extraction tool needs to preserve meaningful agreement with what a mail client can read, rather than merely avoid crashing.

One deliberate exception to the new error handling deserves attention: `MailParserPathError` is not swallowed as an ordinary per-attachment failure. A path-containment violation remains a reason to stop rather than continue writing.

That is a useful distinction. A broken item should not prevent inspection of unrelated items. A suspected attempt to escape the output directory should not be quietly waved through either.

## What I would check before trusting the next verdict

For an operator, the immediate work is fairly concrete:

1.  **Find the actual runtime dependency.** Check the virtual environment, worker image or bundled application that handles mail, not just the Python installation on an administrator’s laptop. The advisory’s affected range is `>= 4.6.0, < 4.6.3`.
2.  **Upgrade to a supported release containing the fix.** Version 4.6.3 is the first fixed release for this advisory. Rebuild and restart the workers that use it, then verify the installed version in those workers.
3.  **Audit the handoff to the scanner.** An extraction error must not become an empty-list shortcut to a clean verdict. Track incomplete inspection explicitly and route it to quarantine, retry or review according to local policy.
4.  **Retain the original message securely.** An extracted directory is a derived artifact, not a substitute for the original evidence. Apply appropriate access controls and retention limits, especially where mail contains personal information.
5.  **Test failure handling with harmless fixtures.** Include messages with several attachments and a deliberately invalid attachment. Verify that later valid files are processed and that skipped content cannot disappear from the final inspection status.

If an upgrade cannot happen immediately, the maintainer’s workaround is to avoid `write_attachments()` on untrusted mail and instead iterate `parser.attachments`, handle writes individually and skip entries whose `safe_filename` is `None`. That is a temporary implementation task, not permission to discard containment checks or turn off errors. Skipped content should still be visible in the message’s inspection status.

Upgrading fixes this library defect. It does not, by itself, prove that the surrounding application handles all partial failures safely.

## The lesson for Agent Garrett

This is the sort of issue I want Agent Garrett to take seriously precisely because it does not look like a break-in.

There may be no unexpected shell, no new executable and no suspicious child process. An endpoint rule watching for those events could have nothing to report. The relevant event is an inspection job losing part of its input.

I would want the system to retain that uncertainty: extraction incomplete, attachment skipped, verdict withheld. Those are design requirements, not a claim that Agent Garrett or Sentinels already detects this CVE.

Security tools spend a lot of effort deciding whether a file is dangerous. They also need to account for the files they failed to inspect.

A green check mark should mean the work was completed, not merely that the work which survived reported no problems.

## Primary sources

-   [Maintainer advisory: GHSA-8cgq-x343-p74c / CVE-2026-129301](https://github.com/SpamScope/mail-parser/security/advisories/GHSA-8cgq-x343-p74c), affected versions, impact, reproducer and workaround.
-   [Fix: SpamScope/mail-parser pull request #171](https://github.com/SpamScope/mail-parser/pull/171), merged August 19, 2026; implementation and related extraction-integrity changes.
-   [mail-parser 4.6.3 release](https://github.com/SpamScope/mail-parser/releases/tag/4.6.3), published August 19, 2026.
-   [GitHub reviewed advisory](https://github.com/advisories/GHSA-8cgq-x343-p74c), published November 16, 2026.
