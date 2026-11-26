---
title: Your AI Coding Agent Might Be Installing Software That Will Never Be Patched
source: https://falcon0x1.github.io/posts/your-ai-agent-installs-dead-mcp-servers/
source_host: falcon0x1.github.io
clip_date: 2026-11-26T15:07:23+08:00
trace_id: 74ffbbcf-6db0-47a3-a141-4ed2d0ba6ba6
content_hash: e6f870b3f09330e90768eda1103197f4141ceb42dc1dd3e189c5ca8833f6549a
status: synced
tags: []
series: null
feed_source: Falcon0x1·Android渗透
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42475244-d011-81d9-8250-cb820c41db95
ioc: null
---

[![AI agents and dead MCP servers: the agent picks an MCP server name from its training data, installs it from npm, and the server may be archived with known bugs and no fixes coming. No dependency file, no CVE, and a routine Node install in EDR. The fix is to find MCP configs, approve one server per service, and check npm deprecated status](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e262aea1c45af0be.webp)](https://falcon0x1.github.io/assets/img/ai-agents-dead-mcp-servers.webp)

## 𓂀 You asked the agent for a “GitHub MCP”. What did it install?

You tell your AI coding assistant: *“connect to GitHub”*. It answers fast. It finds an MCP server, writes the config, runs the install. You never searched for anything.

So where did the package name come from? Not from you. **From the model’s memory.**

That is the whole problem, and it is quiet.

## 𓅃 What was reported

Glow Labs reviewed real AI coding sessions (reported by Help Net Security on 2026-11-03). Their finding: in **98% of the sessions where a deprecated MCP server was installed or suggested**, the name appears to have come from the model’s **training data**, not from the developer.

Two honest caveats before you quote this number:

-   The 98% is Glow’s **own review** of those sessions. The sample size was not stated in the article.
-   The article words it as “appears to”. Treat it as a strong signal, not a measured law.

The risk behind it does not depend on the exact percentage. Training data is a snapshot. MCP servers move fast. Some of the servers a model remembers are now **archived or deprecated**: known bugs, no fixes coming, maybe nobody watching the package name.

Source: [Help Net Security, 2026-11-03](https://www.helpnetsecurity.com/2026-11-03/mcphantom-deprecated-mcp-servers/), reporting Glow Labs research. Glow is a security vendor, and I found no independent replication of the session-level numbers yet.

## 𓆲 Why your tools miss it

This is the part that makes it dangerous. Walk through what each control sees:

| Control | What it sees | Why it stays quiet |
| --- | --- | --- |
| **SCA / dependency scanning** | Nothing | The server is in an MCP config file, not in `package.json` or a lockfile |
| **Vulnerability scanner** | Nothing | An unmaintained server may have **no CVE**: no one is left to file or fix it |
| **EDR** | A Node process running `npm install` | A trusted tool installing from the official registry looks like a normal developer day |

Nothing is “wrong” on any dashboard. The risk sits in a file your inventory does not include.

And an MCP server is not a harmless library. It is a process your agent **talks to and trusts**, often with access to repos, tokens, files or databases. A server that will never be patched is a standing door.

## 𓅃 The mental model: who chose this package?

For years the answer was always *a human*, even a careless one. With agents the chain is different:

> developer asks → model **recalls** a name → agent installs it

The decision moved from a person who could be reviewed to a model whose memory is older than the registry. Your approval process, if you have one, probably assumes the first picture.

## 𓂀 Step 1: find what your agents already installed

MCP servers live in config files, not in your project manifest. Look in the usual places, on developer machines and in repos:

```bash
# common MCP config locations (adjust for the tools your team uses)
ls ~/.claude.json .mcp.json .vscode/mcp.json ~/.cursor/mcp.json 2>/dev/null
# Claude Desktop config is under your OS app-config folder
```

List every server `command` and `args` you find. For each npm package name, ask the registry if it is still alive:

```bash
# prints a message if the maintainer marked it deprecated, nothing if not
npm view <package-name> deprecated

# and when was it last published?
npm view <package-name> time.modified
```

Then check the project page itself: is the repo **archived**? Does it say it was replaced by something official? Deprecated on npm and archived on GitHub are both strong signs to stop using it.

This is a manual check on purpose. There is no CVE to search for, so you have to look at the **life** of the package, not its bug list.

## 𓅉 Step 2: fix the process, not just today’s list

1.  **Approve one server per service.** One reviewed GitHub server, one reviewed database server. Agents use the approved one instead of inventing a new choice per session.
2.  **Check deprecation before approval.** Registry status, last release, repo archived or not, who maintains it. Prefer servers published by the service’s own vendor.
3.  **Pin the version and keep the config in the repo.** A config the team can see and diff is a config you can review. A config that lives only on one laptop is invisible.
4.  **Give servers the least access they need.** A read-only token for a server that only reads. If a server ever turns out to be dead or hostile, the damage stays small.
5.  **Tell the agent what to use.** Put the approved server list where your agent reads its instructions, so it does not fall back to its memory.

## 𖤍 For the managers reading this

You do not need to read an MCP config. Ask your team three questions:

-   **“Which MCP servers are our developers’ AI tools running right now?”** If nobody can answer, that is the finding.
-   **“Who approves a new one?”** If the answer is “the AI picks it”, you have a software supply chain with no owner.
-   **“What can those servers reach?”** Repos, tokens and databases decide how bad a dead server can be.

None of this needs a budget. It needs an inventory and one owner.

## 𓅃 The takeaway

Your dependency list used to show everything your code trusted. With AI agents, a new class of trusted software arrives by **recall**, outside that list. The fix is old and simple: **know what is installed, know who approved it, and check that someone still maintains it.**

𓅃 *Stay curious, stay paranoid.*
