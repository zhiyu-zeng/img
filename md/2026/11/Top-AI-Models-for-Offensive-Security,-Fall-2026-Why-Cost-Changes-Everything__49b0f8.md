---
title: "Top AI Models for Offensive Security, Fall 2026: Why Cost Changes Everything"
source: https://xbow.com/blog/top-ai-models-for-offensive-security-fall-2026
source_host: xbow.com
clip_date: 2026-11-07T08:24:22+08:00
trace_id: 1c72fba8-f99f-47f7-a503-a5efdb13a1a6
content_hash: dadf835f15f7161478c0fb6eaf5f44563c2a9ba242b39fc2d7e59d26342ca5fd
status: synced
tags: []
series: null
feed_source: XBOW·漏洞利用研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 41175244-d011-81fa-afa6-d635afe9e486
ioc: null
---

New XBOW evaluations reveal why the best model for offensive security depends on how much you're willing to spend, and what that means for efforts to restrict access to frontier AI.

* * *

AI labs are placing increasingly strict controls on who can use their most capable models for cybersecurity work. I get it: frontier models can discover and exploit serious vulnerabilities, and that’s a scary capability you don’t want everyone to have. But what happens when a much cheaper, openly available model can outperform those tightly controlled models at the kinds of tasks an attacker might actually want to perform?

That's one of the more interesting findings from XBOW's latest offensive security evaluations. We tested a new generation of frontier and open-weight models against a set of real-world vulnerability discovery benchmarks, measuring not only whether they could find vulnerabilities, but also how much they had to spend to do it.

The results challenge some assumptions about what makes an AI model effective at offensive security. The newest restricted models are substantially more capable than their predecessors. But the biggest, most expensive models aren't necessarily the most effective. And at lower budgets, DeepSeek 4.2 Flash outperforms models that are both more expensive and more tightly controlled.

This plays out differently for different types of attackers, and for the defenders as well. But one of the conclusions is that access control to models is not enough to keep the world safe, and needs to be really judiciously applied to have a positive effect.

## How we tested

At XBOW, we regularly evaluate new models to understand how well they perform at autonomous offensive security. These evaluations help us determine which models are best suited to different testing workflows and where improvements in model capability translate into better vulnerability discovery. For this round, we made several changes to our evaluation environment.

First, we introduced more challenging benchmarks. Just as in the past, our benchmark is based on deployments of open source projects where we found an actual vulnerability in the past, frozen to their vulnerable version. What is different is that the new benchmark uses more challenging vulnerability discovery tasks. Our previous benchmark set was approaching saturation, with models already achieving solve rates above 90% after less than 100 requests. When nearly every model solves nearly every task, it becomes difficult to distinguish their capabilities.

Since our last [evaluation blog post](#), we also evaluated a new generation of frontier models that are deemed capable enough by their creators so that they are either only released (or at least only released without cripplingly strict guardrails) under new, enhanced versions of the frontier labs’ cybersecurity programs. These programs permit approved researchers and organizations to use capabilities that may otherwise be restricted. Previously, some newer models would refuse cybersecurity tasks that older models could perform.

### Measuring capability against cost

For each model, we measured how often it successfully solved a benchmark as a function of the amount spent.

This approach accounts for the fact that a model might be capable of solving a difficult task if given enough time and resources, but that doesn't necessarily make it the most effective choice. Our primary charts show the percentage of benchmarks solved at different spending levels. A model whose curve rises quickly solves more tasks at low cost. A model that starts slowly but eventually overtakes others may be better suited to expensive, difficult investigations.

![Overall success vs. cost](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a5c6cb59001a2bc1.webp)

The percentage of benchmarks solved changes with available budget. No single model leads across all spending levels.

## The latest generation of frontier models really are better

Our evaluations confirm something important about the newest models behind enhanced cybersecurity access controls: the additional capabilities are meaningful. Anthropic's Opus 5.5 substantially outperforms Opus 5.0, while OpenAI's GPT-6.1 Sol is a clear improvement over earlier GPTs.

For security teams, this progress highlights that continued model development is producing tangible improvements in the ability to find and validate vulnerabilities, not simply better performance on general reasoning or coding benchmarks.

At the same time, access to these capabilities is becoming more complicated, even for established security researchers operating in authorized environments. Verification processes and usage restrictions vary by provider, evolve frequently, and can impose additional constraints on production use. And as we'll see, obtaining access to the most expensive models isn't necessarily where the greatest practical benefit lies.

![Generational improvements: Opus](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c556a736cb919ee3.webp)

![Generational improvements: GPT](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a9ff5d812ff8a35b.webp)

Generational improvements: Opus

Generational improvements: GPT

## The biggest models aren't always the best investment

The models mentioned above had a long run as the premium model size of their respective family, but over the last months, both OpenAI and Anthropic have added the flagship categories of Astra and Fable, respectively. Both are extremely capable, but both are also expensive, and it takes considerable spending before that capability translates into a competitive number of solved benchmarks.

In our evaluations, the less expensive GPT-6.1 Sol and Opus 5.5 are generally better choices at moderate budgets. The larger models can apply more sophisticated reasoning to difficult problems, but that reasoning comes at a cost. For the same amount of money, a less expensive model can perform considerably more work. At lower spending levels, that additional exploration becomes more important than the quality of any individual model response.

This creates a somewhat counterintuitive result: the model with the greatest capability isn't necessarily the one that finds the most vulnerabilities. At much higher budgets, more capable models have the opportunity to work through difficult problems that less expensive alternatives may never solve.

But for most practical testing scenarios, there is a point at which paying for additional reasoning capability delivers less value than simply giving a moderately priced model more opportunities to investigate.

XBOW’s [legendary Chrome exploit](#), for example, was found by a Sol-sized model (though of course, the capability was substantially unlocked by its orchestration – it didn’t just come for free).

![The most capable frontier models can deliver strong results, but their advantages emerge only at higher spending levels.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1c3773f4fb57ff14.webp)

The most capable frontier models can deliver strong results, but their advantages emerge only at higher spending levels.

## At lower budgets, DeepSeek wins

Perhaps the most striking result is how well DeepSeek 4.2 Flash performs against these models. DeepSeek is an open-weight model, meaning its availability does not depend on obtaining access to the restricted capabilities of a particular frontier lab, or even any contact with a frontier lab or inference provider. And at lower budgets, it is extraordinarily effective.

When a model is tasked with finding a vulnerability within a constrained environment, DeepSeek quickly identifies promising directions and makes credible attempts to exploit them. It doesn't require a large budget to start producing results. This means that a model without the same access barriers as Astra or Fable can deliver better practical results when spending is limited.

It also highlights that the ability to solve the hardest problems and the ability to solve many problems cheaply are different capabilities. A defender conducting a comprehensive assessment might want a model capable of pursuing complicated attack paths over a long period. But an attacker opportunistically searching for vulnerable systems may care much more about the number of promising targets they can investigate for a fixed cost.

For that attacker, DeepSeek may be more attractive than a considerably more powerful frontier model.

![DeepSeek's advantage at lower budgets shows why expensive frontier models aren't always the most economically effective choice for vulnerability discovery.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ade076e731ae4eb1.webp)

DeepSeek's advantage at lower budgets shows why expensive frontier models aren't always the most economically effective choice for vulnerability discovery.

## DeepSeek is a sprinter. GLM is a marathon runner.

An interesting comparison emerges when we look at two leading open-weight models: DeepSeek 4.2 Flash and GLM-5.3. DeepSeek has the advantage at low and moderate budgets. It starts quickly, makes good initial decisions, and is effective at finding vulnerabilities without extensive exploration. But if its initial ideas don’t pan out, it struggles to come up with a plan B.

GLM-5.3, on the other hand, is more persistent. When early attempts fail, it can continue exploring an approach, trying alternative techniques, and working through obstacles. This persistence makes it more effective on some longer-horizon tasks.

The difference becomes visible in our cost curves. DeepSeek takes an early lead and maintains it across a substantial spending range. But at very high budgets, GLM-5.3 closes the gap and eventually overtakes it. That’s not just DeepSeek’s lower price (GLM-5.3 is about 4x as expensive per token); the difference is stark enough it even persists if you normalize by token.

What that means is: DeepSeek is the sprinter, and GLM is the marathon runner. Neither behavior is universally better. For a short assessment intended to identify obvious or readily exploitable weaknesses, DeepSeek's ability to identify promising attacks quickly is a major advantage. For an investigation where the model needs to work through repeated failures and difficult attack paths, GLM's persistence may ultimately be more valuable.

![DeepSeek solves more benchmarks at lower costs, while GLM-5.3 catches up and eventually pulls ahead on longer, more expensive investigations.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea016046bd867ab4.webp)

DeepSeek solves more benchmarks at lower costs, while GLM-5.3 catches up and eventually pulls ahead on longer, more expensive investigations.

## The best model changes with your budget

Across the evaluations, we repeatedly observed the same pattern: as available spending increases, the optimal choice shifts toward larger, more capable models. It’s not just that you get more bang if you have more bucks. It’s that you get more bang \_per buck\_.

Consider a single vulnerability discovery task in a relatively constrained environment. At a budget of just 10 cents, a small model like GPT-6 Luna can be surprisingly effective. It's inexpensive enough to perform substantial exploration for very little money. Increase the budget to a dollar, and DeepSeek becomes a more attractive choice. At 10 dollars, GPT-6.1 Sol offers greater value. And at 100 dollars, the deeper reasoning capabilities of GPT-6 Astra become more competitive. These aren't universal spending recommendations or exact thresholds where one model becomes better than another, but they illustrate how the balance between model cost and capability changes with the available budget.

That’s a counter-intuitive result, maybe, but readers of Terry Pratchett will know it from Vimes’ ‘Boots’ theory of socio-economic unfairness: “sometimes, if you have more money to spend, the premium option will be more efficient.”

\> The reason that the rich were so rich, Vimes reasoned, was because they managed to spend less money. Take boots, for example: A really good pair of leather boots cost 50 dollars. But an affordable pair of boots, which were sort of OK for a season or two and then leaked like hell when the cardboard gave out, cost about 10 dollars. But the good boots lasted for years and years. A man who could afford 50-dollar boots had a pair that'd still be keeping his feet dry in 10 years' time, while a poor man who could only afford cheap boots would have spent 100 dollars on boots in the same time and would *still have wet feet*.

[(Terry Pratchett, Men At Arms)](#)

The important point is that there isn't one model that is most cost-efficient at every price point. In addition, the economics of finding one specific vulnerability are different from the economics of finding any vulnerability across thousands of targets.

When assessing one difficult target, it may make sense to devote a substantial budget to a highly capable model. When assessing thousands of targets, spending a small amount on each one may produce better overall results than committing a large amount to a few. The spending threshold at which an expensive model becomes worthwhile can move dramatically.

That has direct consequences for anyone building autonomous security systems. Model selection shouldn't be treated as a one-time architectural decision. As testing objectives, scale, and budgets change, the best model may change with them.

![As the available budget increases, the cost-efficient choice shifts from smaller, cheaper models toward more capable, expensive ones.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bd242abae7e7a495.webp)

As the available budget increases, the cost-efficient choice shifts from smaller, cheaper models toward more capable, expensive ones.

## What does this mean for frontier-model restrictions?

The frontier AI labs have legitimate reasons to be concerned about the cybersecurity capabilities of their newest models, and our results reinforce those concerns: these models are capable, and in the wrong hands they’re also dangerous. But in the right hands, they can make a real difference for authorized security research. Big reward, substantial risk.

We believe that restricting access to the most capable models may be an incomplete approach to managing that risk.

Consider two different attacker strategies:

1.  An attacker wants to compromise one specific system and is prepared to spend considerable time and money to achieve that objective. In this case, the capabilities of the largest frontier models could provide a meaningful advantage.
2.  An attacker doesn't care which particular system is vulnerable. They want to find exploitable weaknesses somewhere across a large population of potential targets.

For the second attacker, cost efficiency becomes a defining factor. A model capable of finding a meaningful number of vulnerabilities for very little money may be more useful than one capable of solving extraordinarily difficult problems at much greater expense. And that brings us back to DeepSeek.

At the lower spending levels relevant to opportunistic vulnerability discovery, an openly available model is already competitive with, and sometimes better than, the models behind additional access controls.

There is also a practical consideration. An attacker may prefer not to rely on a commercial model provider that can monitor usage, enforce restrictions, or suspend access. Honestly, put your black hat on: would you really want to use your OpenAI account to run Luna on 1,000 targets, or probe them in a way that can’t be traced to you? Open-weight models offer an alternative that is harder to control through provider-side access policies.

We don’t want to say that frontier-model safeguards are unnecessary. More capable models can enable attacks that less capable ones cannot, and restricting those capabilities may still provide meaningful protection. But we need to consider whether those protections address the models, budgets, and operational strategies that attackers are most likely to use.

## Two key takeaways for security teams

![Albert Ziegler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f2cf7b023cbc4415.webp)

For defenders, these evaluations offer two practical lessons.

First, model capability needs to be measured against actual testing objectives. The most expensive model isn't always the right choice. A model that performs well on a deep, targeted assessment may be inefficient for broad, low-cost testing. Teams building autonomous offensive security systems should evaluate models against the workflows and budgets they expect to use, rather than relying on general benchmarks or model rankings.

Second, organizations should not assume that AI-enabled attacks require access to the most advanced frontier models. Our evaluations show that models with fewer access barriers can already discover vulnerabilities at low cost. This changes the economics of vulnerability discovery for both attackers and defenders.

As AI models improve, the cost of investigating potential vulnerabilities continues to fall. Organizations should expect more systems to be examined, more frequently, by increasingly capable autonomous tools.

The relevant question for defenders is how much offensive capability is already available at a price that makes large-scale testing practical.

Get more details on our ongoing [AI model research](#).
