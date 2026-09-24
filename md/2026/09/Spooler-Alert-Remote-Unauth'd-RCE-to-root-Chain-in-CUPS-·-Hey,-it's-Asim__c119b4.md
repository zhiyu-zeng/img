---
title: "Spooler Alert: Remote Unauth'd RCE-to-root Chain in CUPS · Hey, it's Asim"
source: https://heyitsas.im/posts/cups/
source_host: heyitsas.im
clip_date: 2026-09-24T10:20:04+08:00
trace_id: e597cbc7-c035-4a13-85f5-31bc80385a5f
content_hash: e8e45c28dc6fbe6cff7a0e2f46fa2ca852a1cf66a75bc3c906585cd932c2230f
status: synced
tags:
  - Linux安全
  - 漏洞分析
series: null
feed_source: Asim/heyitsas·Linux内核LPE
ai_summary: CUPS 两个漏洞可链成"匿名远程 RCE → root 文件覆写"：先以 `lp` 身份远程代码执行，再窃取管理员令牌写入任意 `file:///` 路径。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8140-9113-cc9d2b4d7885
ioc:
  cves:
    - CVE-2026-26080
    - CVE-2026-34980
    - CVE-2026-34990
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> CUPS 两个漏洞可链成"匿名远程 RCE → root 文件覆写"：先以 `lp` 身份远程代码执行，再窃取管理员令牌写入任意 `file:///` 路径。
> 
> - **两个 CVE：** CVE-2026-34980 让匿名 `Print-Job` 请求经共享 PostScript 队列到达 `lp` 代码执行；CVE-2026-34990 利用临时打印机泄露本地打印管理员令牌，本地提权至 root 文件（覆）写。
> - **RCE 路径：** CUPS 序列化作业属性时给换行加反斜杠、解析时又剥掉，嵌入换行得以存活；`pstops` 报错的日志只给首行加前缀，第二行便可用 `PPD:` 开头，被调度器当作可信控制记录重新解析并写入队列 PPD，从而注入恶意 `cupsFilter2`，再发第二个 raw 作业让 CUPS 以攻击者指定二进制（PoC 用 vim）充当过滤器执行。
> - **提权路径：** 任何能访问 localhost CUPS 的非特权用户可创建指向自身监听端口的本地打印机，回报 `401` 与 `WWW-Authenticate: Local trc="y"`，诱使 CUPS 交出 `certs/0` 管理员令牌；持令牌访问 `/admin/`，再建指向 `file:///` 的临时队列并用 `printer-is-shared=true` 清掉 `temporary` 标志以绕过 `FileDevice` 校验，最终 root 写入目标文件（PoC 为 `/etc/sudoers.d/pwn`）。该步骤存在竞态，但实测个位数次尝试即可成功。
> - **前提与缓解：** 远程 RCE 需 CUPS 网络可达且暴露共享 PostScript 队列（属刻意配置，桌面默认不满足）；LPE 在默认配置下即成立，且 `open(..., 0600)` 只影响新建文件，已存在文件的权限位（如可执行）会保留。截至 2026-04-05 仅有公开修复提交、无修复版本（最新 2.4.16）。建议不要把 CUPS 暴露到网络或使用共享 PostScript 队列、共享队列强制认证、确保运行在 AppArmor/SELinux 等策略下。
> - **AI 辅助挖掘：** 该链由自编排漏洞挖掘智能体发现；把目标拆成"找任意远程代码执行"和"找任意到 root 的原语"比单条端到端提示更省 token，也更容易穷尽低垂果实。

*TLDR: my self-orchestrating team of [vulnerability hunting agents](https://www.linkedin.com/posts/yasamal4ik_february-2026-cve-2026-26080-and-cve-2026-activity-7441018899502043136-Rukx) discovered two issues in CUPS, [CVE-2026-34980](https://github.com/OpenPrinting/cups/security/advisories/GHSA-4852-v58g-6cwf) and [CVE-2026-34990](https://github.com/OpenPrinting/cups/security/advisories/GHSA-c54j-2vqw-wpwp), chainable into `unauthenticated remote attacker -> unprivileged RCE -> root file (over)write`. See below for the prerequisites, details, and mitigation options.*

## Intro

CUPS is *the* standard way to do printing on Linux and other Unix(-like) systems. It’s been on my mind as a research target ever since doing incident response to Simone Margaritelli’s 2024 [unauth’d RCE finding](https://www.evilsocket.net/2024/09/26/Attacking-UNIX-systems-via-CUPS-Part-I/), where he chained several CUPS vulnerabilities into an unauth’d RCE as `lp`, the default CUPS service user.

CUPS is complex – there are:

-   a network-exposable HTTP/IPP print server that accepts untrusted jobs/printer metadata,
-   legacy PPD ([PostScript Printer Description](https://en.wikipedia.org/wiki/PostScript_Printer_Description)) files that describe printer capabilities,
-   “filters” (helpers to convert jobs into printer-ready data), and
-   “backends” that send the print data to “printer-like” destinations (including files, which will matter below).

Most of the filters run as `lp`, but the scheduler normally runs as root – and so do some of the backends. This makes for a rich attack surface.

## Findings

-   [CVE-2026-34980](https://github.com/OpenPrinting/cups/security/advisories/GHSA-4852-v58g-6cwf): **Shared PostScript queue lets anonymous Print-Job requests reach `lp` code execution over the network**
-   [CVE-2026-34990](https://github.com/OpenPrinting/cups/security/advisories/GHSA-c54j-2vqw-wpwp): **Local print admin token disclosure using temporary printers**

At a high level, in the first vulnerability, the attacker:

1.  Submits a malicious print job to a shared PostScript queue,
2.  Gets CUPS to treat attacker-controlled text as a trusted queue config by abusing a parsing bug, and
3.  Gets code execution as the CUPS service user, `lp` (vim in the PoC)

And in the second vulnerability, the attacker:

1.  Uses any\* unprivileged local user to set up a localhost listener,
2.  Creates a local printer object in CUPS, pointing it at the listener above,
3.  Gets CUPS to authenticate to it and captures the auth token,
4.  Creates another queue pointing at `file:///...` for the target rootful write,
5.  Uses the token to race against CUPS validation logic’s cleanup of the dangerous queue, and
6.  Writes what they want into the target `file:///...` (`/etc/sudoers.d/...` in the PoC)

\* any unprivileged local user that can bind on *some* TCP port and reach the local CUPS listener.

### Are you affected? + Mitigation

The unauth’d RCE as `lp` ([CVE-2026-34980](https://github.com/OpenPrinting/cups/security/advisories/GHSA-4852-v58g-6cwf)) requires the CUPS server to be reachable over the network and expose a **shared** PostScript queue (these are legacy, but still used). This would be a deliberate config choice – realistic for, say, networked printing servers in your corporate environment, but not for your desktop (unless you for some reason set it up to be a remote printing server).

The LPE to root file (over)write ([CVE-2026-34990](https://github.com/OpenPrinting/cups/security/advisories/GHSA-c54j-2vqw-wpwp)), on the other hand, works on the stock CUPS config.

For both issues, the harm can be limited by a security module that confines CUPS (e.g., SELinux, AppArmor, etc.). So, if you run CUPS under a sane security policy (default on some distributions), the impact of both vulnerabilities is much less severe – e.g., no rootful file writes outside the paths CUPS is constrained to touch.

As of 4/5/2026, there are public commits with fixes to both issues **but no fixed release** (latest being `2.4.16`). So, your best mitigations are:

-   Do not expose CUPS over the network with a shared PostScript queue – or at all
-   If you **must** use a shared queue, require auth for job submissions to that queue
-   Make sure your CUPS runs under a reasonable AppArmor/SELinux/etc. policy, so that the impact is minimized even if you *are* targeted

## Technical details

The advisories ([CVE-2026-34980](https://github.com/OpenPrinting/cups/security/advisories/GHSA-4852-v58g-6cwf), [CVE-2026-34990](https://github.com/OpenPrinting/cups/security/advisories/GHSA-c54j-2vqw-wpwp)) and the PoCs in them go into full detail. Below is a summary of the particularly interesting pieces.

### CVE-2026-34980: turning a print option into scheduler control data

Under the [default policy](https://github.com/OpenPrinting/cups/blob/v2.4.16/conf/cupsd.conf.in#L69-L71), CUPS will accept anonymous `Print-Job` requests, and it only [blocks](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/ipp.c#L1202-L1209) remote printing when the queue is **not** shared:

```c
<Limit Create-Job Print-Job Print-URI Validate-Job>
  Order deny,allow
</Limit>
```

```c
if (!printer->shared && ...) {
  send_ipp_status(..., _("The printer or class is not shared."));
  return (NULL);
}
```

This gives us the ability to target all the rich escaping/parsing logic on a shared queue without any auth layer by default.

When CUPS serializes job attributes for filters, it escapes newlines by [prefixing them with a backslash](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/job.c#L4121-L4122). Later, when it parses that option string back, it [strips the backslash](https://github.com/OpenPrinting/cups/blob/v2.4.16/cups/options.c#L437-L438) back out. So, an embedded newline survives the round trip.

```c
if (strchr(" \t\n\\\'\"", *valptr))
  *optptr++ = '\\';
```

```c
if (*ptr == '\\' && ptr[1])
  _cups_strcpy(ptr, ptr + 1);
```

This matters when using a PostScript queue. `pstops` [logs](https://github.com/OpenPrinting/cups/blob/v2.4.16/filter/pstops.c#L2532-L2534) an invalid `page-border` value if it encounters one, and the helper it uses [prefixes only the first line](https://github.com/OpenPrinting/cups/blob/v2.4.16/cups/langprintf.c#L123-L125). So if the attacker smuggles a newline into the value, the second line can begin with `PPD:` (think ~~HTTP~~ PPD request smuggling):

```c
_cupsLangPrintFilter(stderr, "ERROR", _("Unsupported page-border value %s, using " "page-border=none."), val);
```

```c
snprintf(temp, sizeof(temp), "%s: %s\n", prefix, _cupsLangString(cg->lang_default, message));
vsnprintf(buffer, sizeof(buffer), temp, ap);
```

And since CUPS [treats](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/statbuf.c#L259-L262) `PPD:` as a trusted control record, it [reparses the remainder into queue options](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/job.c#L5398-L5401), which get [added to the queue’s PPD](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/job.c#L3627-L3630):

```c
else if (!strncmp(sb->buffer, "PPD:", 4))
  ...
  message = sb->buffer + 4;
```

```c
cupsdLogJob(job, CUPSD_LOG_DEBUG, "PPD: %s", message);
job->num_keywords = cupsParseOptions(message, job->num_keywords, &job->keywords);
```

```c
if (job->num_keywords)
{
    if (cupsdUpdatePrinterPPD(job->printer, job->num_keywords, job->keywords))
      cupsdSetPrinterAttrs(job->printer);
...
```

At this point, the attacker is able to modify queue configuration. The practical payload is to inject a malicious `cupsFilter2` entry into the PPD, then send a second raw job so CUPS will launch an attacker-chosen existing binary as a filter (the PoC in [the report](https://github.com/OpenPrinting/cups/security/advisories/GHSA-4852-v58g-6cwf) uses vim).

### CVE-2026-34990: from lp to root via localhost admin auth and file:///

This is the LPE to file (over)write as root. Any low-privilege account (`lp` used just to demonstrate the chain) that can talk to CUPS on localhost can issue a `CUPS-Create-Local-Printer` command; it is **not** an admin-authenticated operation in the default policy when coming from localhost. So, the attacker can stand up a fake printer on `localhost:<some TCP port>` and trigger CUPS to set it up.

During the printer setup/validation, CUPS will authenticate to the target printer using its `Local` auth scheme. An attacker listening on localhost can then reply with `401 Unauthorized` and `WWW-Authenticate: Local trc="y"`, mirroring the [“try root certificate”](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/client.c#L2242) auth option that CUPS itself would normally use for privileged localhost auth. CUPS then [uses](https://github.com/OpenPrinting/cups/blob/v2.4.16/cups/auth.c#L1136) `certs/0` (“cert” here is really a “token”) and presents the admin token (`Authorization: Local ...`) to the attacker. Finally, `cupsd` [accepts the replayed `Authorization: Local ...` token on loopback](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/auth.c#L491-L511):

```c
strlcpy(auth_key, ", Local trc=\"y\"", auth_size);
```

```c
snprintf(filename, sizeof(filename), "%s/certs/0", cg->cups_statedir);
```

```c
else if (!strncmp(authorization, "Local", 5) &&
    httpAddrLocalhost(httpGetAddress(con->http))) {
...
    cupsdLogClient(con, CUPSD_LOG_DEBUG, "Authorized as %s using Local.", username);
```

That token is enough to issue `/admin/` requests on localhost. Normally, CUPS does have a guardrail here: `file:` device URIs are supposed to be blocked [unless `FileDevice` is explicitly enabled](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/ipp.c#L2351-L2360). However, the *temporary* printer path stores the URI first and later lets `printer-is-shared=true` [clear the `temporary` flag](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/ipp.c#L2498-L2500) without revalidating the URI:

```c
printer->shared = ippGetBoolean(attr, 0);
if (printer->shared && printer->temporary)
  printer->temporary = 0;
```

So, the attacker now needs to just create a *second*, *temporary* local queue (pointed at `file:///<target>`) and immediately use the stolen token to set `printer-is-shared=true` so that the queue is persisted. **This is racy** as background setup/validation can remove the printer. However, once the race is won (single-digit attempts have sufficed in my testing), printing to it is just a [root file (over)write](https://github.com/OpenPrinting/cups/blob/v2.4.16/scheduler/job.c#L1178-L1180) on whatever `file:///...` path the attacker chose:

```c
else if (!strncmp(job->printer->device_uri, "file:///", 8))
  job->print_pipes[1] = open(job->printer->device_uri + 7,
                             O_WRONLY | O_CREAT | O_TRUNC, 0600);
```

At this point, the target can be `/etc/sudoers.d/pwn`. Note: `open(..., 0600)` sets `0600` on *new* files, but existing files’ bits – e.g., exec – would be preserved.

## PostScript

I will eventually cover the self-orchestrating setup – with its strengths and limitations – in a dedicated post, but it’s worth calling out immediately how this chain showcases LLMs’ prowess in vulnerability research.

You may not vibe-discover the whole chain with a single “find me a remote RCE to root, make no mistakes” prompt. But tasking the agents with a) a search for a remote code exec as *anything* and b) *anything* -> a useful root primitive allows them to greatly narrow the search space and not burn as many tokens.

At that point, their relentlessness is unleashed in very tight directions, finding all the [low-hanging fruit](https://sockpuppet.org/blog/2026/03/30/vulnerability-research-is-cooked/) much quicker – something they are now very good at doing.
