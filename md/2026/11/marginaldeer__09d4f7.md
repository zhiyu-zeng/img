---
title: marginaldeer
source: https://www.marginaldeer.com//blog/abliterated-models-web-bug-bounty/
source_host: www.marginaldeer.com
clip_date: 2026-11-19T08:23:05+08:00
trace_id: ed779e7e-af39-473b-9fcf-5634d66d5524
content_hash: 41246140cc9a9c5f87743c1e30cb41664b5bf314e84bffac431097eeced4ecd9
status: synced
tags: []
series: null
feed_source: marginaldeer·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81a2-8e99-f1f21c65461a
ioc: null
---

1.  [Modern Web App Testing: JWT Abuse, GraphQL, Race Conditions, and Prototype Pollution](https://www.marginaldeer.com/blog/modern-web-app-testing-techniques/)
2.  Abliterated Models for Web App Bug Bounty Hunting
3.  [Blind SQL Injection in SuiteCRM Reports, Through ORDER BY](https://www.marginaldeer.com/blog/suitecrm-order-by-sql-injection/)

A stock chat model will often refuse the moment a request looks like an attack, including a request you already captured from an in-scope bounty target. The useful property for this work is a model that will draft a test. You still send the request, read the response, and decide whether it is a finding.

This post is the local-model pass on top of [JWT, GraphQL, race conditions, and prototype pollution](https://www.marginaldeer.com/blog/modern-web-app-testing-techniques/). The model does not replace that testing. It proposes one hypothesis about one artifact you already have. The artifact is a Burp request, one OpenAPI operation, or one client function. The program scope decides what you are allowed to send.

The models I use for that draft are abliterated. The word is the community name for a specific weight edit from Arditi et al., [Refusal in Language Models Is Mediated by a Single Direction](https://arxiv.org/abs/2406.11717) (2024). The paper calls the edit weight orthogonalization. It is a permanent form of directional ablation. It is a different object from a prompt jailbreak, and a different object from an uncensored finetune that happens to share the same filename tag.

## Refusal is one direction in the residual stream

A decoder-only transformer keeps a residual stream. Each token position holds a vector, width equal to the model dimension. The embedding writes the first value. Every attention block and every MLP block adds an update into that same vector. The last layer’s vector at the last position is what gets turned into the next-token distribution.

Arditi et al. computed those vectors on two small contrastive sets. Harmful instructions came from AdvBench, MaliciousInstruct, TDC2023, and HarmBench. Harmless instructions came from Alpaca. Train splits were 128 prompts. Validation splits were 32. For each layer `l` and each post-instruction token position `i` they took the mean residual activation on the harmful train set and the mean on the harmless train set:

```
r_i^(l) = mean(x_i^(l) | harmful) - mean(x_i^(l) | harmless)
```

That difference-in-means vector has a direction and a magnitude. The direction is the axis along which the two means differ. The magnitude is how far apart the means sit. Doing this at every layer and every candidate position produces a pile of candidate vectors. They keep one. Selection is empirical, on the validation split: ablating the candidate should bypass refusal on harmful prompts, adding it should induce refusal on harmless prompts, and harmless completions should otherwise stay put. The selected vector is `r`. The unit vector is `r_hat`.

The paper’s suite was safety-tuned chat models from 1.8B to 72B parameters: Qwen Chat, Yi Chat, Gemma IT, Llama-2 Chat, and Llama-3 Instruct. On those models, one direction was enough. Erasing it stopped refusal on harmful instructions. Adding it made the model refuse harmless instructions. That second result is the control. If a random direction of the same norm did the same thing, the story would be “we damaged the model.” A direction that works in both directions is a feature the model actually uses.

## Abliteration is orthogonalization of the writers

Directional ablation is an inference-time intervention. On every residual activation during the forward pass, subtract the component along `r_hat`. The model can no longer represent that direction, at any layer, at any position.

Weight orthogonalization bakes the same intervention into the checkpoint. Take each matrix `W_out` that writes into the residual stream and replace it with:

```
W_out' = W_out - r_hat r_hat^T W_out
```

`r_hat r_hat^T` is the projector onto the refusal direction. Subtracting it from `W_out` means every column of `W_out` loses its component along `r_hat`. Whatever input the matrix sees, its contribution to the residual stream is orthogonal to `r`. The paper applies this to every writer: the token embedding, the positional embedding, the attention output matrices, the MLP output matrices, and the corresponding output biases. Llama-2 and Llama-3 use rotary position embeddings, so there is no learned positional matrix on those checkpoints. The edit there is the token embedding, the attention outs, the MLP outs, and the biases.

Appendix E of the paper shows this is equivalent to directional ablation, provided the same projection was applied to every earlier write. The inference-time measurement and the edited checkpoint are the same intervention. That is why a published “abliterated” checkpoint can be loaded in llama.cpp with no extra runtime hook. The edit already happened.

Two consequences follow from the equivalence.

The edit removes one linear feature. On the paper’s evals, MMLU, ARC, and GSM8K stayed close to the unmodified model. Except for Qwen 7B and Yi 34B, those scores sat inside the 99% confidence interval of the original. TruthfulQA dropped across the suite. The authors note that TruthfulQA sits next to refusal: misinformation, stereotypes, conspiracies. Coherence survived. Truthfulness on that set did not. For bounty work, read that as “it will still sound sure of a wrong parameter.”

The edit is also sensitive to the system prompt. The paper measures that directly. A wrapper that prepends a safety policy can put refusal back on top of orthogonalized weights. If a local frontend suddenly refuses routine discussion of a JWT `alg` test, check the template and the system prompt before you blame the GGUF.

## What an abliterated checkpoint is

A model card for this procedure names three things.

-   The base chat model, including size and revision.
-   The source of `r`, which should cite Arditi et al. or describe difference-in-means on a harmful set and a harmless set.
-   Orthogonalization of the residual writers, ideally with the layer or the selected position they kept.

The community filename is usually `abliterated`. The paper’s word is orthogonalized. Either is fine when the card describes the projector above.

A card that only says “uncensored” or “fine-tuned on an uncensored dataset” is a different artifact. That is a finetune. It can be more willing to answer, and it can also have drifted off the base model’s behavior in ways the linear edit does not. I still run those sometimes. I do not treat their answers as if they came from the procedure in the paper. If the card is silent on the base model and the edit, I skip it.

Newer models are outside the 2024 suite. A single direction was the result on the families listed above. A later chat model can keep residual refusal after one direction is removed, or it can lose coherence. When that happens the card’s procedure did not transfer. I switch checkpoints. I do not keep rephrasing the prompt until the model agrees with a guess I have not tested.

## Run it on a machine you control

Bounty data is program data. A hosted “uncensored” API is someone else’s process, with someone else’s system prompt, and a copy of whatever you pasted. I load the GGUF or the safetensors locally and bind the server to loopback.

llama.cpp, after you have the file:

```bash
llama-server -m ./model.gguf -c 8192 --host 127.0.0.1 --port 8080
```

Ollama, from a local file rather than a registry pull you have not read:

```
FROM /home/you/models/model.gguf
PARAMETER temperature 0.2
PARAMETER num_ctx 8192
```

vLLM, when you have a GPU and a Hugging Face snapshot you already mirrored:

```bash
vllm serve /models/abliterated-snapshot --host 127.0.0.1 --port 8000
```

Temperature stays low. I want the same hypothesis twice, not a more creative one. Context stays small on purpose. One HTTP request plus a short excerpt of the spec fits in 8k tokens. A whole repository does not, and the model will invent the parts that fell out of the window.

Quantization matters less than the template. Q4 and Q5 are what a laptop actually runs. The refusal direction is a large feature, so a normal quant of a real orthogonalized checkpoint usually still answers. When it refuses everything, the usual causes are a chat template that does not match the base model, a system prompt put back by the server, or a file that was never orthogonalized. Match the template the base model was trained with. Then ask it something the stock model refuses and something the stock model answers. Both should come back coherent. If harmless prompts got worse, the checkpoint is a bad quant or a bad finetune, and I stop using it for this.

The base model’s cutoff is still the cutoff. Orthogonalization does not add papers, CVEs, or framework versions from after the base model was trained.

## The loop

Scope comes first, from the program brief, and it constrains the prompt as well as the proxy. A host that is out of scope does not go into the transcript. The model will hand it back as a suggestion, and the suggestion is how you wander out of the program.

Then one artifact. I paste one of these:

-   A single request from Burp, with the cookie jar reduced to the header the test actually depends on.
-   One operation from an OpenAPI file, including the parameter list.
-   One function from the frontend bundle, the one that builds the request.

I strip values I do not need the model to see. Session tokens become `<session>`. The shape of the token stays if the test is about the shape. A JWT header is useful. The live signature is not. The transcript ends up in notes.

The question is fixed. I ask for one hypothesis, in a schema, and I tell it to stop when the artifact does not contain the field it wants to name.

```sql
You are helping me test an application I am authorized to test.
Use only the artifact below.  Do not invent hosts, paths, or parameters.
If the field you want is not in the artifact, say "not in artifact" and stop.

Return one hypothesis:
- parameter: the name as it appears in the artifact
- precondition: what must already be true
- check: which comparison or missing comparison would make this interesting
- diff: the smallest change to this request
- oracle: status, body field, timing, or a second account's view
- false positive: what the same response looks like when the check is present

Artifact:
<paste one request>
```

Then I send the diff myself, in Burp, against the in-scope host. If the claim is about authorization, I send it with a second account that should not have the object. If the oracle does not move, the hypothesis is dead. I do not ask the model to talk me into a second try on the same guess.

A second prompt that works better than “find bugs” is a diff I already collected. Two accounts, same object, two responses. I paste both and ask which field is the authorization boundary. The model is comparing text I captured. It is not touring a site it cannot see.

## Where it earns a request

The bugs below are the ones from the [web testing post](https://www.marginaldeer.com/blog/modern-web-app-testing-techniques/), plus the two neighbors I keep hitting the model with. In each case the model is naming a check. The proof is still a request.

**JWT.** Give it the header and the claim set, not a lecture. Ask which claim the server must be checking, and what a broken check looks like. Algorithm confusion, a `kid` path, and a claim that is trusted as a user id are the usual answers. The [JWT section](https://www.marginaldeer.com/blog/modern-web-app-testing-techniques/) has the tests. The model gets one job: point at the claim. If it names a header field that is not in the token you pasted, throw the answer out.

**GraphQL.** Paste the operation the client actually sends, or the introspection result if the endpoint allows it. Ask which argument is an object id with no visible owner field. Tell it that any field absent from that paste is a guess and must be labeled as a guess. Unlabeled invented fields are the failure mode. Aliases and batching are still things you confirm in the repeater, the way that post describes.

**Race.** Paste one state-changing request and ask where the window is: read balance, write balance, or consume a single-use token. The model can describe the window. The repro is Turbo Intruder or racepwn, with a count and a gate, which that post already covers. I do not let it emit a hundred parallel curls.

**Mass assignment.** Paste the JSON the client sends and the JSON the server returns on a privileged object. Ask which key is in the response and absent from the request. The diff is adding that key. The oracle is the privileged field changing for an account that should not be able to set it.

**Cache keys.** Paste the request and the response headers. Ask which request header is likely outside the cache key, given `Vary` and the `Cache-Control` you pasted. The test is two requests that differ only in that header, then a third request that should not see the first response. If `Vary` already lists the header, the hypothesis is dead on the page, and you do not send anything.

## Calibration before a program

I keep two folders of saved requests. One is lab traffic where I know the bug: a PortSwigger lab I have already finished, or a route in an app I wrote. The other is traffic where I know the check holds. Same prompt, same model, no extra hints.

I score three counts.

-   It named the field that actually matters.
-   It invented a path, a header, or a parameter.
-   It declared a bug on a request I know is safe.

The first count is the only one that saves time. A high invented-path count means this checkpoint is a bad recon tool and might still be usable as a “given this parameter, what check is missing” tool. A high false-positive count means I stop asking it for a verdict and only ask it for the diff. I re-score when I change quant, template, or checkpoint. A Q4 of a different base model is a different instrument.

## Failure modes I keep hitting

Hallucinated endpoints are the common one. The model knows a lot of `/api/v1/admin` shapes and will offer them when the paste is thin. The schema above forces it to quote a name from the artifact. When it cheats, the hypothesis is discarded, not repaired.

Cutoff shows up as an old CVE pinned to a framework version you did not mention. If the answer depends on a version and the artifact has no version, it is a guess. I confirm versions from headers, the bundle, or the program’s technology notes.

A mislabeled finetune shows up as rambling, a different dialect than the base model, or a refusal pattern that looks like a system prompt rather than a missing direction. I read the card again.

A hosted endpoint shows up as convenience. The cost is the program data and an unknown wrapper. Loopback is the setup I described above.

Overconfident wording shows up as “this is vulnerable” with no oracle. I treat that sentence as noise. The oracle line is the product.

Residual refusal on a new model shows up as a stock-sounding policy answer on a routine test. That checkpoint is the wrong tool for the draft. The test itself is unchanged. I can still send it by hand.

## What stays manual

I choose the in-scope request. I send the diff. I read the response. I decide it is a finding. I write the report from the request and the response, not from the model’s paragraph.

The model is a fast reader for one artifact, running from weights whose refusal direction was projected out, on a machine I control. The rest of the engagement looks like the web testing post. When the oracle moves, I have a bug. When it does not, I have a rejected guess, which is the normal case, and that is the point of making the guess cheap.

If you enjoyed this post please consider subscribing to the [feed](https://www.marginaldeer.com/feed/)!
