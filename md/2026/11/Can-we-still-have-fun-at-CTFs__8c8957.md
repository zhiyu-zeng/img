---
title: Can we still have fun at CTFs?
source: https://cryptax.github.io/posts/fun-in-ctf/
source_host: cryptax.github.io
clip_date: 2026-11-08T21:16:35+08:00
trace_id: 27d8878e-b682-432f-92fa-a173e0598070
content_hash: d19a1ed2106f66604a60c03cca7c876836a55bb6bcf62e491ffd6469669bd847
status: synced
tags: []
series: null
feed_source: cryptax·移动安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41275244-d011-81d3-9bfd-d30bb3f423ba
ioc: null
---

## Can we still have fun at CTFs?

> These last two months, I played 2 CTFs, and I did **not have fun** 😢

| Year | Impact for CTFs |
| --- | --- |
| 2023 | First challenge at **[Ph0wn](https://ph0wn.org/)** involving a **LLM**. LLMs are far better than chat bots, but they are far from being able to solve CTF challenges. |
| 2024 | Several AI bypassing challenges at **N0PS** CTF. LLMs have improved, but there is still no MCP (end of 2024), and few agents |
| 2025 | All CTF players have open browser tabs with their favorite model (e.g NorthSec CTF). *Easy* challenges are solvable end to end by LLMs |
| 2026 | MCPs, agents, skills, orchestrators are frequently used by CTF players. Several teams have setups that automatically download the challenges, dispatch them to several LLMs and solve them in different threads. **Nearly all challenges are solved autonomously by LLMs, except difficult ones or “different” ones**. Beginning of 2026, the setup requires lots of tokens and access to good models. **End of 2026, even low or average LLMs do the work**, it’s possible to get some challenges solved by a local LLM running on a decent laptop. |

For CTFs, the shift occurs between the end of 2025 and 2026, where most CTF challenges become easily solvable by AI. At first, we were astonished by LLM capabilities. By now, for most CTF players, the “fun of configuring an AI and watching it solve a challenge” has worn off. 😟

Consequently, starting mid-2026, various CTF organizers tried new options:

-   No Scoreboards (Sthack, Insomni’hack)
-   No prizes, but goodies for everyone (Sthack)
-   Two Scoreboards (Hack.Lu)
-   Declare use of AI (NorthSec)
-   Prizes to the best writeup presentations (BlackAlps)

## Limiting agents: a solution for participants?

During my last CTF, I intentionally played with an agent I told **not to give me the flag, not to spoil the challenge**. My agent is designed to:

1.  Solve the challenge in background (but not tell me)
2.  Give me the next (good) hint whenever I ask
3.  Never give me the flag, or a full script that would be too close to solving the challenge

**The agent worked well**. In the first image, we see **it refused to give me flag** even when I said I was giving up. I tried to motivate me to continue

![/images/mentor1.png](/svg/loading.min.svg)

![/images/mentor1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2f445a3d2dfbcc89.png "/images/mentor1.png")

In the second image, it **gave me a partial script** letting me fill in the important parts.

![/images/mentor2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/725b6caaac915191.png "/images/mentor2.png")

The agent is available in Appendix.

## CTFs in 2026 where I had fun (or not) 🚩

> Organizers: don’t take it personal if your CTF is rated “no fun”. I probably had “some” fun + I respect and admire the job you did + it doesn’t mean I didn’t fancy the conference!

| CTF | Fun? | Why? |
| --- | --- | --- |
| Axxxx CTF | No  | On site issues. The CTF started several hours late. |
| Txxxx CTF | More or less | My team intensively used AI. It was fun to see how good AI was, but now that I know, it’s no longer fun, I wouldn’t do that again. |
| [CTE v2](https://fr.linkedin.com/posts/eternalblue-ctf-team_gendarmerienationale-rgpaca-eternalblue-activity-7435595124937637888-FU8b) | **Yes!!!** | **Captivating scenario**. 70% OSINT where AI does help much. 30% of not too difficult challenges. **I learned** solving them. AI would have flagged them without issue, but *I didn’t ask AI for more than the occasional help*, and it was great. |
| Hxxxx CTF | A little | I worked on a couple of challenges which were technically interesting. Mostly the issue was that **I wouldn’t have flagged without AI**. But at least, I **learned**. |
| Bxxxx CTF | No  | All challenges I tried were **far too difficult for a human but easy with an AI**. What’s the point?! I even tried a Crypto challenge marked *Easy*. Usually, I’m pretty decent at Crypto challenges, honestly. Well, the AI worked it out, but I don’t even understand the writeup because it’s so complicated!!! |

## Advice for Challenge Authors

-   Analyze CTFs where you *played*: which challenges did you fancy? why? Your answers should give you the right direction to create your own.
-   New to creating challenges? Often you are afraid your challenge will be too easy, and consequently, you create it far too difficult and twisty. Have your challenge tested by a friend.
-   **Do not artificially harden challenges** to thwart AI. It’s likely it will fail and the challenge will be easy for AI, but super difficult for humans. Zero interest.

> For **Ph0wn 2026**, I instructed challenge authors to test their challenges against LLMs, and harden them based on test results. For **Ph0wn 2027**, my instructions will be totally different: given the fact that LLMs solve \[nearly\] everything, **don’t bother about AI when creating your challenge**. Create your challenges as in “old days” (I mean without AI lol). Create challenges which are fun and educative.

## My opinion on organization choices.

-   I **don’t like when prizes 🎁 are given based on unclear or non measurable conditions**. We are in a scientific field, not in a literary or artistic area. When you give the prize to the “most funny writeup” or the “biggest fail”, there is a strong risk you’ll give it to friends, or based on private jokes etc. This is fun for people who “belong to the community”, but it makes others uncomfortable.
-   **“Non-competitive CTF” is just like a car 🚗 with no motor**. Removing competition from CTFs is removing one of its founding motivations. Maybe competitive CTFs are dead, true. Maybe we should bury them and create something new, like “Challenging Workshops”.

> Shifting from CTFs to “Challenge Workshops” is a path to investigate.

-   **Banning AI**. While **I don’t have fun solving with AI, I don’t have fun solving without AI either** now. For example, I no longer want to spend 30 minutes fixing my silly script because I left a trailing comma at the wrong place.

**Wish**: a CTF where participants only have a limited use of AI, e.g. via my limiting agent (see Appendix).

## Appendix: CTF mentor agent

```markdown
---
description: CTF mentor providing progressive, accurate hints without spoilers
mode: primary
temperature: 0.2
permission:
  read: allow
  glob: allow
  grep: allow
  bash: ask
  edit: deny
  write: deny
---

# CTF Mentor

You are an expert CTF solver and a patient, technically
rigorous mentor. Your job is to help the user solve
challenges themselves, not solve them for the user.

## Private investigation

- Independently analyze the challenge using available
  files, tools, and technical knowledge.
- Try to determine the intended solution, vulnerability,
  exploit chain, and flag privately.
- Keep all discoveries and solution details hidden.
- Distinguish verified findings from hypotheses.
- Never invent facts, results, or misleading hints.
- If you have not solved the challenge, say so when
  relevant. Do not pretend to know the solution.
- Continue investigating when necessary to provide
  reliable guidance.

## Hint policy

When the user explains their progress or where they
are stuck:

1. Understand what they have already discovered.
2. Identify their next useful step along a valid
   solution path.
3. Give exactly ONE hint, as small as possible.
4. Never reveal information beyond what is necessary
   to make progress.

Use progressive hint levels:

- Level 1: Gentle nudge. Suggest a general direction
  or an overlooked observation.
- Level 2: More focused. Point to a relevant concept,
  component, or investigation technique.
- Level 3: Concrete. Suggest a specific experiment,
  tool, command, or code location to investigate.
- Level 4+: Give increasingly actionable guidance,
  but never disclose the core trick or final solution.

Increase the level only when the user requests another
hint for the same obstacle. Reset the level when the
user makes meaningful progress or encounters a new
obstacle.

## Strict anti-spoiler rules

- NEVER reveal the flag, even if discovered.
- NEVER reveal the central trick, key vulnerability,
  complete exploit, or full solution.
- Do not provide complete exploit scripts or patches.
- Do not expose private reasoning or investigation notes.
- Do not reveal spoilers through tool output, filenames,
  commands, examples, or indirect confirmation.
- Do not automatically execute the solution or submit
  the flag.
- Do not confirm a guessed flag or reveal whether a
  proposed full solution is correct.
- You MAY validate individual observations, explain
  technical concepts, and correct misconceptions.
- If the user is following a wrong path, explain why
  based on evidence and redirect them without spoilers.

## Interaction style

- Be concise, precise, and encouraging.
- Prefer one or two sentences per hint.
- Ask a guiding question when useful.
- Do not give a tutorial unless explicitly requested.
- Never deliberately mislead the user.
- Never claim certainty without sufficient evidence.
- If the user is already on the right track, help
  them take the next step without jumping ahead.

Your success criterion is that the USER solves the
challenge, not that you demonstrate the solution.
```
