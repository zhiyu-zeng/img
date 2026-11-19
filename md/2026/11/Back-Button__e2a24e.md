---
title: Back Button
source: https://www.rapid7.com/blog/post/tr-self-hosted-ai-renting-compute-exposed-servers
source_host: www.rapid7.com
clip_date: 2026-11-19T09:17:45+08:00
trace_id: 1a563f02-86a3-4128-8d0d-06131b25e8e3
content_hash: 3f2da83e47785773163b79662024dca07ea8d6c6b4d839feca62bc970c0cbb4f
status: synced
tags: []
series: null
feed_source: Rapid7 Blog
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-81ce-8366-fa4f92e30b9e
ioc:
  cves:
    - CVE-2024-37032
  cwes: []
  hashes: []
  domains:
    - trycloudflare.com
    - ttl.sh
  tools: []
  techniques: []
---

$ curl http://<exposed-host>:11434 **/api/tags**

llama3.1:8bqwen3.6:27bglm-5.3:cloudnomic-embed-text:latestdeepseek-v4-pro:cloud103.249.201\[.\]108:9882/trigger/benign:latestgemma4:e4bzzvitals-beacon:latesthuihui_ai/Qwen3.8-abliterated:latestgpt-4o:latestclaude-3-opus:latesttinyllama:latestkimi-k2.7-code:cloudverif_sys:latest<tunnel>.trycloudflare\[.\]com/read/x5fa4534:b1qwen2.5-coder:7bpwn_ctl\_<this-host-ip>\_ae52…:latestminimax-m3:cloudttl\[.\]sh/dsv40110/dsv4probe:24hbge-m3:latest<tunnel>/L2V0Yy9zaGFkb3c → /etc/shadowHuihui-CyberStrike-OffSec-35B-abliteratedsmollm2:135mops-verify:latestmistral-large-4:cloud<tunnel>/L3Byb2Mvc2VsZi9lbnZpcm9u → /proc/self/environqwen3-embedding:0.6bgpt-4o:latest-copy-test

local modelcloud-routed or uncensoredleft by a third party

Sample of model names returned by exposed Ollama servers. Green: left by a third party; outlined: cloud-routed or uncensored. Host-identifying parts redacted, infrastructure defanged.

More than half of the exposed Ollama servers in this scan have already been touched by someone who is not the owner. I don't mean theoretically vulnerable. I mean visibly used: model names that are really callback addresses, tags stamped with the server's own IP, and Base64 strings that decode to `/etc/shadow`.

Exposure statistics normally describe a risk. These model lists describe activity. An unauthenticated `/api/tags` call is a read-only request, and on thousands of machines it returns something close to a visitors' log.

Below is what the data shows, where I think it points, and what I would do about it on Monday morning. I've labelled claims as \[Observed\], \[Interpretation\] or \[Hypothesis\] so you can see where the evidence stops.

## First, the number I don't trust

The scanner reported 14,064 findings across 11,891 IP addresses and labelled 14,060 of them vulnerable, 387 critical. If I put that in a headline it would travel well. It would also be wrong.

\[Observed\] 148 IP addresses return the exact same fingerprint: Grafana on 3000, Jupyter on 8888, Ollama on three ports, each serving one model, `llama3.1:8b`. They sit with five different hosting providers in five countries. Another 281 addresses answer as two to five different products on the same port. Real servers rarely do that. Sensors and catch-all responders do it all day.

\[Interpretation\] These are most likely deception infrastructure, run by researchers, vendors or threat actors watching who comes knocking. Remove those 429 addresses and the critical findings drop from 387 to 39. MLflow falls from 126 to 4. Honeypots look extremely vulnerable. That's the whole job description.

Figure 1

### What the scanner flagged versus what holds up

Findings per product before and after removing the 148-host identical fleet and IP:port pairs that answer as multiple products.

Streamlit, Grafana and JupyterHub results are presence checks (a health endpoint answers). They prove exposure, not compromise. Default-credential labels on Grafana were inferred by the scanner, not tested.

Two more corrections before we go further. A Streamlit health check returning `ok` tells you an app is on the internet, not that it is exploitable. And the target list was pre-selected: 58% of the 20,354 hosts produced a finding, which is far above any internet-wide base rate. So treat the totals as a sample of a much larger population, not a census.

What survives is still uncomfortable: **7,714 findings on 7,627 hosts where an AI or notebook API answered without authentication**, almost all of them Ollama. Only 0.3% of all findings were served over HTTPS.

The lesson for anyone producing exposure numbers, us included: if you count banners and health checks, you measure how the internet presents itself. You don't measure how it behaves.

## This is rented compute, not the corporate data centre

![World map of exposed AI service hosts by country, with city-level service locations](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1871407addd27df1.svg)

Geolocation: DB-IP Lite (country, CC BY 4.0) and MaxMind GeoLite2 (city). IP geolocation describes where an address is registered or routed, not necessarily where the owner sits.

\[Observed\] Roughly 65% of hosts sit in hosting or cloud networks, and six providers (OVHcloud, Hetzner, Contabo, Oracle Cloud, Tencent Cloud and DigitalOcean) account for 42% of everything. Spread over 1,656 networks, but concentrated in the places where you can rent a capable server in five minutes.

\[Interpretation\] Germany leads for exposed Ollama (1,306 hosts), ahead of China and the United States. I don't read that as German carelessness. Hetzner and Contabo are German, OVH has a large European footprint, and all three are the default choice for someone who wants to try a model this afternoon without asking procurement. The geography follows the price list.

Figure 3

### Exposed Ollama by country

Figure 4

### Top networks, all services

\[Interpretation\] Machines like these rarely appear in a CMDB. They tend to be rented on a credit card by a team that needed to compute quickly, and connected to company data later. Your attack surface now includes your developers' expense reports.

## What is actually running

\[Observed\] The exposed Ollama servers listed 106,938 model entries, 18,733 distinct tags, about 14 per host. Locally, Qwen dominates, followed by Llama and Gemma. But the more important split is between models that run on the box and models the box merely *routes*.

Figure 5

### Local models versus cloud-routed models, by family

Number of exposed Ollama hosts listing at least one model from each family. Third-party marker models excluded.

Hosts running it locallyHosts listing it as a:cloud model

**4,630** *Qwen (Alibaba)* **218**

**3,349** *Llama (Meta)* **1**

**1,917** *Gemma (Google)* **150**

**862** *DeepSeek* **4,981**

**852** *GLM (Zhipu)* **5,720**

**3** *MiniMax* **4,935**

**12** *Kimi (Moonshot)* **2,462**

**643** *Mistral* **2,571**

**382** *gpt-oss (OpenAI)* **220**

**335** *Phi (Microsoft)* **N/A**

**2,020** *Embeddings* **N/A**

**546** *Image/vision* **N/A**

Family assignment by model-name pattern. About 3,459 hosts also list cloud tags that don’t map to a known family.

### The box is becoming a gateway

\[Observed\] 79% of exposed Ollama hosts list at least one `:cloud` model, mostly GLM, DeepSeek, MiniMax and Kimi variants. Ollama's hybrid mode routes those requests through the local daemon to ollama.com when the host has been signed in with `ollama signin`, which links a local ed25519 key in `~/.ollama/id_ed25519` to the user's account.

\[Interpretation\] An exposed, signed-in server can provide access to someone else's paid subscription, with the bill landing on the owner. This is the self-hosted version of LLMjacking, and it requires no exploit at all.

\[Hypothesis\] A listed cloud tag does not prove the host is signed in, and we did not test inference. But the same seven cloud models appear together on 1,295 otherwise unrelated hosts. That pattern looks less like thousands of individual choices and more like automated pulls by third parties checking which servers will serve them.

### Guardrails are optional, and so is the front door

\[Observed\] 28% of exposed Ollama hosts carry at least one “abliterated”, “heretic” or “uncensored” model, versions with refusal behaviour deliberately stripped out, including a fine-tune named for offensive security work. Running those is legal and often has good research reasons. Running them unauthenticated on the internet means anyone gets an unlogged, unfiltered model on your hardware.

\[Observed\] 28% also run embedding models such as `nomic-embed-text` or `bge-m3`. \[Interpretation\] Embeddings are the plumbing of retrieval-augmented generation. Those servers are likely wired into pipelines that read internal documents, which makes the exposed box a bridge, not an island.

Figure 6

### Model sizes on exposed hosts

Local model tags with a parameter count in the name. Most of this is small enough to run on a rented VPS.

The two most common sub-2B tags, `tinyllama` (1,671 hosts) and `smollm2:135m` (1,169 hosts), are also the cheapest thing to pull if you are testing whether you can write to someone else's server.

## The visitors' log

Here is the finding I think deserves the most attention. Ollama's API lets any caller pull a model from any registry, copy or create models, and push them elsewhere. Without authentication, the model list becomes a record of what strangers asked the server to do.

Figure 7

### Signs of third-party activity on exposed Ollama servers

Share of 7,675 exposed Ollama servers whose model list contains each artifact type. A host can show several.

Name-based indicators. Markers include beacon, verify, probe and pwn style names and tags that embed the host’s own IP; external pulls are model names prefixed with a non-official registry host.

\[Observed\] 24% of hosts list models pulled from a raw IP address and port. 22% list models pulled through free tunnelling or throwaway registry services: Cloudflare quick tunnels, ttl.sh, bore.pub, Pinggy. When a server pulls from an address you control, it calls you back. That's a clean, reliable way to confirm that a target is reachable, writable and able to make outbound connections: classic server-side request forgery, offered as a feature.

\[Observed\] 712 model names embed the IP address of the server they sit on. \[Interpretation\] That's inventory keeping. Someone is tagging targets so their tooling can recognise them later. The same applies to recurring markers like `zzvitals-beacon`, `verif_sys` and `ops-verify`, each found on hundreds of hosts, and to names ending in `-copy-test`, which show someone checking whether the copy endpoint works.

\[Hypothesis\] The trio `gpt-4o`, `gpt-4` and `claude-3-opus`, found together on 1,190 hosts, almost always next to `tinyllama`, looks like a tiny local model copied under premium names. That's either a write test, or a way to make a server look like it offers frontier models to whoever finds it next. I wouldn't bet on which.

Figure 8

### How the model list becomes an attack surface

1.  1 **Find**
    
    Mass-scan port 11434 and friends. No authentication to defeat.
    
2.  2 **List**
    
    `/api/tags` reveals models, cloud routing and earlier visitors.
    
3.  3 **Call back**
    
    Pull from an IP or tunnel you control. The pull confirms reachability and egress.
    
4.  4 **Mark**
    
    Create or copy a model named after the host. Proof of write access, and a claim flag.
    
5.  5 **Reach**
    
    Craft manifests that point at local files, secrets and keys, or ride the owner’s cloud account.
    

Sequence reconstructed from artifacts in the model lists. Not every host shows every stage.

### What they were reaching for

\[Observed\] On 55 hosts, model names contain Base64 or hex strings that decode to file paths. The targets read like a post-exploitation checklist: `/etc/shadow`, `/etc/passwd`, `/proc/self/environ`, Ollama's own systemd unit and its `override.conf` (where people tend to put environment variables and API keys), SSH `authorized_keys`, AWS config, the Oracle Cloud metadata endpoint, and on 10 hosts the Ollama private key itself. A few points at `/etc/ld.so.preload` and new systemd service files, which are persistence locations, not reading material.

Figure 9

### Decoded file targets, by purpose

Hosts with at least one encoded path in each category.

\[Interpretation\] This mirrors the technique Wiz published as Probllama (CVE-2024-37032) in 2024: a path-traversal payload in a model manifest's digest field, giving arbitrary file write through `/api/pull`, file read through `/api/push`, and code execution by corrupting `/etc/ld.so.preload`. Ollama fixed it in version 0.1.34 in May 2024. We can't tell from these lists whether any target was still on a vulnerable build, so the attempt proves intent, not success. Somebody still thinks it's worth trying two and a half years later, which suggests the technique remains useful enough to keep testing.

The economics are hard to ignore. The attacker uses free tunnels, free throwaway registries and, in the end, your computer and your cloud subscription. Their cost per target rounds to zero.

### Nobody is reading the model list

Figure 10

### Timestamps embedded in third-party model names

Unix timestamps found in marker and probe names, by month of creation.

**12**

**1**

**0**

**1,026**

**116**

**74**

JunJulAugSepOctNov 1–3

Range: 10 June to 3 November 2026. Only names that embed a 10-digit timestamp are counted, so this is a lower bound on activity.

\[Observed\] Some of these markers were created in June and were still in place on 10 November. \[Interpretation\] When a stranger's model sits on your server for five months, the vulnerability isn't the main problem. The main problem is that nobody owns the server.

Table 1

### Most frequent callback registries seen in model names

Defanged. Several look like large-scale research scanning; “benign” in a path is a claim, not a guarantee. Treat as context for hunting, not as attribution.

| Address | Port | Path pattern |
| --- | --- | --- |
| `24.144.109[.]68` | `9882` | `trigger/benign, trigger/plamo2-<id>` |
| `103.249.201[.]108` | `9882` | `trigger/benign` |
| `76.13.49[.]213` | `9882` | `trigger/benign` |
| `62.31.247[.]107` | `9882` | `trigger/benign` |
| `43.143.113[.]68` | `8899` | `library/tens` |
| `185.165.171[.]21` | `8899` | `recon/probe` |

Also observed: dozens of short-lived `*.trycloudflare[.]com` tunnels, `ttl[.]sh`, `bore[.]pub` and Pinggy endpoints used as registries.

## What I would change after seeing this data

### Exposure research needs a second question.

“Is it open?” is the easy part. “Has it been touched?” is the useful part, and for AI runtimes the answer is often sitting in a read-only API response. Defenders should triage on artifacts, not banners.

### Model runtimes are becoming credential brokers.

Once a local daemon can route to paid cloud models with a key on disk, compromising it is about access and money, not just CPU cycles. That's a different threat model from the one most teams had in mind when they typed `OLLAMA_HOST=0.0.0.0`.

### The attackers here didn't need AI.

We spend a lot of energy debating whether AI will make attackers faster. On these servers the playbook is old: an unauthenticated service, path traversal, server-side request forgery, outbound callbacks. Familiar primitives, new location. The controls we already know work. They just haven't followed the workload.

### Internet measurement is polluted, and we should say so.

A meaningful slice of “critical AI exposure” is other people's sensors watching each other. Anyone publishing exposure numbers, vendors included, should show how they filter.

## What businesses should do

The controls here are familiar: ownership, authentication, egress control, logging, patching, and exposure management. The practical steps are straightforward:

### This week: find them, and check for guests

-   Scan your own public ranges and every cloud and VPS account the company pays for, including those on personal cards that get expensed. Look beyond default ports: 6% of findings here sat on a non-standard port.
-   On every Ollama instance, read the model list. Anything prefixed with an IP address, a tunnel domain or ttl.sh, anything named beacon, verify, probe or pwn, and anything containing your own IP is a stranger's artifact.
-   If you find one, treat the host as compromised, not misconfigured. Rotate whatever lives in its environment and service files, revoke the Ollama key on the linked ollama.com account, check cloud usage for spend you don't recognise, and rebuild rather than clean.

### Within 30 days: close the door, then the windows

-   Bind model runtimes to localhost or a private network. If remote access is needed, put an authenticating reverse proxy or a zero-trust access layer in front. Ollama has no built-in authentication, so this isn't optional.
-   Restrict outbound traffic from model servers to the registries you approved. Egress control is what turns a pull-based callback or SSRF attempt into a failed connection.
-   Keep runtimes current, and don't sign a shared server into a personal or corporate cloud model account unless it's behind authentication and spend alerts.
-   Log API calls that change state (pull, create, copy, push, delete) and alert on them. On a stable production server they should be rare.

### This quarter: make ownership the default

-   Make registration a condition of AI infrastructure spend: every model server gets a named owner, a data classification and an expiry date. If nobody owns it, it gets switched off.
-   Decide, in writing, where uncensored or abliterated models are allowed and what they may touch. Research sandboxes, yes. Internet-facing boxes wired into document pipelines, no.
-   Bring AI runtimes, notebooks and experiment trackers into exposure management and red-team scope. Test the brakes, not just the engine: can you find, isolate and shut down one of these servers within an hour?

## Methodology and limitations

Single snapshot taken on 10 November 2026 against 20,354 pre-selected IPv4 addresses on seven ports (3000, 5000, 8000, 8080, 8501, 8888, 11434). Product detection used one unauthenticated HTTP request per service: Ollama `/api/tags`, Jupyter `/api/kernels`, MLflow experiment search, JupyterHub `/hub/api/`, Streamlit and Grafana health endpoints. No inference, write or exploitation requests were sent.

Likely deception infrastructure was removed with two heuristics: an identical five-service fingerprint shared by 148 hosts, and IP:port pairs that answered as more than one product (281 hosts). This removed 1,513 findings on 429 hosts. Some real servers may have been removed, and some sensors certainly remain.

Third-party activity indicators are inferred from model names only. A clean list doesn't prove a clean host, since names can be deleted. Encoded strings were decoded from Base64 and hex segments. Model families were assigned by name pattern. Geolocation and network data from DB-IP Lite (CC BY 4.0), MaxMind GeoLite2 and iptoasn. Individual exposed hosts are not named in this post.

This post reflects the author's analysis of the scan data described above. Ollama, Jupyter, MLflow, Streamlit and Grafana are trademarks of their respective owners. This publication includes GeoLite2 data created by MaxMind.

![Christiaan Beek](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3340b17e62e5e178.jpg)

Christiaan Beek
