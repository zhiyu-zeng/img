---
title: "Hashes: A Good Tool You Shouldn't Trust Blindly"
source: https://amin.benarieb.com/posts/hashes-you-shouldnt-trust-blindly/
source_host: amin.benarieb.com
clip_date: 2026-11-19T10:57:16+08:00
trace_id: ed815059-a10e-4b9f-836f-917c3267e274
content_hash: be14735fcd793910b34d70e564f72bec4700c556502ded1a5247fcdbf8535f75
status: synced
tags: []
series: null
feed_source: Amin Benarieb·移动安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-8155-a687-d38dcdb7d2a3
ioc: null
---

## You already use hashes all day

As an iOS dev you already use hashes all day:

-   **`Set` and `Dictionary`.** Every lookup goes through a hash. Any type you use as a `Dictionary` key or `Set` member has to conform to `Hashable` — but you almost never write that yourself: the compiler synthesizes it for your structs and enums, usually the same models you mark `Codable`. That hash is just a number squeezed out of the value; it's what lets a dictionary jump straight to the right entry instead of scanning them all.
-   **Git.** Every commit is a hash of its content; the short SHA you paste in standup is just the first 7 characters of it.
-   **Checksums and signatures.** The SHA-256 under a download link, or the code signature iOS verifies before it launches your app.
-   **Hash maps on LeetCode.** Every time you go at another problem, your reflex is to [throw it in a hash map](https://youtu.be/5bId3N7QZec?si=k50TUx0WyRYaM5yK&t=62).

## What "broken" actually means

So it's a great tool — but you're also going to hear that MD5 and SHA-1 are *broken*. That's true, and it has a specific meaning. **Broken** here means an attacker can produce a *collision*: two different files with the same hash. MD5 fell to this back in [2004](https://en.wikipedia.org/wiki/MD5#Security), SHA-1 in [2017](https://security.googleblog.com/2017/02/announcing-first-sha1-collision.html). So if a signature or a trust decision rides on one of those hashes, it's exploitable. There are other hash pitfalls too. If you want the mechanics, a couple of older-but-still-worth-it videos from the earlier internet — [Computerphile](https://www.youtube.com/watch?v=b4b8ktEV4Bg) — or if you prefer something newer, [The Coding Gopher](https://www.youtube.com/watch?v=R_mOWu3s6y4).

## Two hashes that failed in public

Not only that. Two more hash-related failures worth knowing:

-   **A hash-match accusation on a collidable hash.** Apple's on-device [NeuralHash](https://www.theregister.com/2021/08/18/apples_csam_hashing/) scanned photos as they uploaded to iCloud and hash-matched them against a database of known illegal images; enough matches flagged your account for human review. Researchers forced a beagle and a gray square to the same hash within hours. Once different images can collide, an innocent photo can be crafted to match a flagged one (false positive — even a way to frame someone), and real targets can be nudged to *not* match (evasion). Apple shelved it in 2022.
-   **A hash bug that cost ~$611M.** In 2021 a hash-related flaw in a blockchain bridge led to one of the biggest thefts in crypto history — ~$611M ([full technical report](https://www.coinspect.com/learn-evm-attacks/cases/polynetwork-bridge/), or a [more accessible walkthrough](https://blog.kraken.com/product/security/abusing-smart-contracts-to-steal-600-million-how-the-poly-network-hack-actually-happened)).

But both deserve an asterisk, and the asterisks are the interesting part.

-   **NeuralHash** is a *perceptual* hash — built so that *similar* images share a value. So it's not the kind of hash we usually mean, and colliding it isn't exotic — it's the design. The real problem wasn't "fingerprints aren't unique" in the abstract; it's that an *accusation* system was built on a hash that collides by design.
-   **The Ethereum hack** hinged on a *truncated* hash — think of a git short SHA, the first 7 characters instead of the full 64. The fewer characters a system actually checks, the cheaper it is to grind out a different input that lands on the same short value. That bridge compared only 4 bytes to decide which function to run; an attacker found a throwaway function whose 4 bytes matched a privileged one, called it, and walked off with the money. **A hash is only as strong as the bytes you actually compare.**

## “Download and verify” can create false confidence

Take [vphone-aio](https://github.com/34306/vphone-aio) — a one-command script that spins up a "virtual iPhone" by running a bundled binary you don't see the source of. Its README lists SHA-256 sums for the download parts. The author uses them correctly: a *corruption* check, nothing more — they never claim the sums prove the binary is safe or genuine. The trap is on the reader's side. A checksum sitting next to something you're about to *execute* feels like "verified, safe to run." It isn't. A matching sum means the bytes arrived intact — not that the code is trustworthy, not that it came from who you think. By the way — I wouldn't blindly run that vphone on your own machine: it's a closed-source binary, so you can't actually see what it does, and a matching checksum tells you nothing about that.

## Integrity is not authenticity

That's the line worth internalizing:

-   **Integrity**— the bytes didn't change (accidentally). A bare hash gives you this.
-   **Authenticity**— the bytes really came from the right source, untampered. This needs a *signature*— the hash delivered through something an attacker can't also edit.

A matching hash on the same server as the file gives you neither against an attacker: whoever swaps the file swaps the hash line right next to it. Same on mobile — a phone that hashes a selfie and sends "image + hash" to a server proves nothing if someone in the pipeline swaps both, and if the expected images are known ahead of time they can prepare a matching twin.

## The concrete mobile trap: password storage

OWASP still flags shipped apps using MD5/SHA-1 for passwords ([MASTG crypto tests](https://mas.owasp.org/MASTG/0x04g-Testing-Cryptography/)). But ["salted SHA-256 in the Keychain,"](https://www.kodeco.com/129-basic-ios-security-keychain-and-hashing) passed around as best practice, isn't ideal either — for two separate reasons:

1.  **To verify a password, SHA-256 is too fast.** GPUs try billions of guesses per second, so salted-SHA-256 hashes fall in bulk. Passwords need a deliberately *slow* function: bcrypt, scrypt, or Argon2 — Argon2id is the current default ([OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).
2.  **To reuse a password, you don't hash it at all.** Hashing is one-way. A reusable secret goes into the Keychain *encrypted*, not hashed.

Hashing *verifies*; the Keychain *stores*. Mixing them up — especially verifying with MD5/SHA-1 — is the worst of both. And yet even MD5 still has honest work: catching accidental corruption (a bad download, a flipped bit) and deduplication ("seen this exact file before?"). Broken-for-security isn't broken-for-everything.

## Takeaways

-   Hashes are a good tool: MD5/SHA-1 still earn their keep for corruption checks and dedup, but SHA-256 is the baseline the moment security matters.
-   A checksum proves *integrity*, not *authenticity* or *safety*— authenticity needs a signature.
-   …and only if you compare **all** of it: check just part of a hash and that guarantee shrinks to the bytes you actually compared (that's the $611M bug).
-   Storing a password? Put it [through a slow, purpose-built hash](https://youtu.be/R_mOWu3s6y4?si=RaJd7aCBfvYDOcyU&t=442) — Argon2id, not MD5, SHA-1, or plain SHA-256.
