---
title: Reversing an Electron App's Self-Restore and OTA Mechanisms
source: https://www.colinxiao.com/reversing-electron-self-restore-mechanism/
source_host: www.colinxiao.com
clip_date: 2026-11-05T10:20:49+08:00
trace_id: 9af03047-154b-448c-96de-082fd2eb3b48
content_hash: 2071a1f42828f81706e03987a0c665ab5fa559556bf1d5c891c62dfe5baa8c3b
status: synced
tags: []
series: null
feed_source: Colin Xiao·逆向/安全研究
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40f75244-d011-8165-8cf6-cd3e6f6657a0
ioc: null
---

> **About the author.** I’m Colin Xiao — an independent reverse engineer, mostly working solo on contract jobs. I dig into compiled code of every kind, including but not limited to: Android and iOS apps, x86/x64/ARM native binaries, packers and obfuscators, DRM and license checks, network protocols and APIs, crypto and signature algorithms, malware, game binaries, and embedded/IoT firmware. I also handle large-scale data collection and vulnerability research. If you have any project in mind, I’d be glad to take it on — whatever it is, as long as it’s within my wheelhouse. Just reach out. You can reach me on X at @colinxiao_lab or on Telegram at [https://t.me/ColinXiao666](https://t.me/ColinXiao666).

> *This research is published for educational and defensive purposes. The target sample is anonymized throughout.*

* * *

> This writeup is for security research and technical study only.

## The problem

I use HanaAgent, an open-source Electron AI agent, locally at version 0.450.0. It has a built-in module called `file-history` that records historical versions of files in the workspace. On startup, that module recursively scans the entire working directory — and mine had 268,000 files, with 235,000 in a single subdirectory. That one step alone took 70 seconds every launch.

Worse, its file watcher, when several tasks write to the workspace in parallel, keeps spamming `workspace watch event without filename` until the server crashes with exit code `0xC0000409`, fail-fast.

So I decided to cut the module out.

## First attempt: patch the server, then watch it come back

The `file-history` logic lives in the server’s bundle, `bundle/index.js`. Its service class has a single listener entry point, `syncWorkspaces()`, and the source even has a comment saying it can be removed wholesale. Easy — just `return` at the top of the method.

It worked immediately: server startup dropped from 70 seconds to 0.9 seconds. I thought I was done.

About forty hours later, I launched the app one morning and found the files had reverted, and the startup time was back to the original number.

The pattern was familiar. I’ve fought client self-verification before, and it always loops the same way: patch the client logic, it reverts; patch the local verification value too, it still reverts; and only after going in circles do you realize the verification value isn’t managed locally at all. This time the same trap, but on Electron instead of native code.

## Finding the source: opening up app.asar

Electron apps keep their business logic in `app.asar`. The format is simple enough — a header of pickle fields: the first 4 bytes are the pickle length, followed by two inner pickle length fields and a JSON string length, then the JSON index, then the file data. Unpacking it in Python:

```python
import struct, json
d = open('app.asar','rb').read()
jss = struct.unpack('<I', d[12:16])[0]        # JSON index string length
header = json.loads(d[16:16+jss].decode())    # index starts at byte 16
data_start = 16 + ((jss + 3) & ~3)            # data region start (JSON padded to 4 bytes)
# each file has offset/size in the index; content is d[data_start+offset : data_start+offset+size]
```

Watch the alignment: there’s padding between the JSON index and the file data, rounded up to a 4-byte boundary. On this machine the asar’s JSON length happened to be a multiple of 4, so `16 + jss` coincidentally lined up; on a different asar it can be off by 1–3 bytes, and your marker will never be found.

Unpacked, the top level is `node_modules`, `desktop`, `package.json`, two release-digest entries, and `shared`. The business logic is mostly in `desktop/main.bundle.cjs`, 982 KB, minified onto a single line.

Before touching anything, there’s a flag to check. Electron has a set of “fuse” switches, one of which is `EnableEmbeddedAsarIntegrityValidation`. If it’s on, changing a single byte of `app.asar` makes the app refuse to launch. So read it first.

The fuse data lives inside the exe behind a fixed 32-byte start marker; after the marker come version and count, then the fuse values, one character each — `'0'` off, `'1'` on:

```python
d = open('HanaAgent.exe','rb').read()
SENT = b'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'   # 32 bytes
i = d.find(SENT)
ver = d[i + 32]              # version (offset relative to the marker)
cnt = d[i + 33]              # number of fuses
vals = d[i + 34 : i + 34 + cnt]
```

This version of Electron has 9 fuses on the wire:

```text
[0] RunAsNode                              = 1  on
[1] EnableCookieEncryption                 = 0  off
[2] EnableNodeOptionsEnvironmentVariable   = 1  on
[3] EnableNodeCliInspectArguments          = 1  on
[4] EnableEmbeddedAsarIntegrityValidation  = 0  off   ← the key one
[5] OnlyLoadAppFromAsar                    = 0  off
[6] LoadBrowserProcessSpecificV8Snapshot   = 0  off
[7] GrantFileProtocolExtraPrivileges       = 1  on
[8] WasmTrapHandlers                       = 1  on
```

Integrity validation is off, so `app.asar` can be modified freely without the app refusing to start. And with `EnableNodeCliInspectArguments` also on, I could in principle attach DevTools for single-step debugging — better than staring at minified code.

## Digging in: what does the sha256 actually verify?

Back to the original question: how did it notice my changes? Under `.hanako\artifacts\` there are three places recording a server sha256: `pointers\stable.current.json`, a seed manifest `seed-train-win32-x64.json`, and a `.verified` file in the unpacked directory.

My first assumption was that this sha256 verifies the *unpacked server directory*— I changed a file in it, the hash no longer matches, so it’s judged corrupt and reverted.

Wrong. I hashed the built-in archive `server-0.450.0-win32-x64.tar.gz` and got exactly the `a75af633...` in the manifest. All three places record the hash of the *archive file*, not the unpacked directory. So modifying the unpacked directory is invisible to that check.

## The root cause: the actual restore switch

In `main.bundle.cjs` I found the trigger in `decideBootAction`. Minified, the name is `v`, and its parameters map positionally to `{resolved, seedEntry, crashFallback}`. I rewrote the logic:

```javascript
function decideBootAction({ resolved, seedEntry, crashFallback }) {
  if (!resolved)                                    return "activate-seed"; // 1
  if (crashFallback)                                return "boot";
  const ptr = resolved.pointer;
  const cmp = compareVersion(seedEntry.version, ptr.version);              // 2
  return cmp !== null
    ? (cmp > 0 ? "activate-seed" : "boot")
    : ((Number.isInteger(ptr.train) ? ptr.train : 0) === 0
        && ptr.sha256 !== seedEntry.sha256                                  // 3
          ? "activate-seed" : "boot");
}
```

The call site (there are two — one for server, one for renderer, identical logic; this is the server one):

```javascript
let version = await resolveBoot(channel, homeDir);
const action = decideBootAction({ resolved: version, seedEntry, crashFallback });
if (action === "activate-seed") {
    // unpack from the seed archive, overwriting versionDir
    await activateFromArchive(seedArchivePath, manifest, { ..., allowReplaceProtected: true });
    version = await resolveBoot(channel, homeDir);
}
```

Returning `"activate-seed"` unpacks the seed archive and overwrites `versionDir` wholesale — that’s how the patch disappeared.

Three conditions trigger `"activate-seed"`: (1) the current version can’t be resolved, e.g. after a channel switch when the new channel has no pointer yet; (2) the seed’s version is higher than the current one; (3) `train` is 0 *and* the pointer’s sha256 doesn’t match the seed.

Mine was the first case. I had been running the beta channel, and the night before the revert I manually switched from beta to stable — after the switch, stable had no `resolved` yet, so it walked straight into `activate-seed` and re-unpacked from the seed. (`activateFromArchive` also has a sha256 check, but it checks the archive too, and the official archive always passes — so the overwrite is what killed my patch, not a hash mismatch.)

## There’s also an OTA path

Blocking `decideBootAction` alone isn’t enough. Searching for `artifact-ota` turned up another path: it periodically fetches a remote channel manifest, and downloads and activates when there’s a new version. The manifest URL is hard-coded:

```javascript
T = "https://github.com/liliMozi/openhanako/releases/download/channels";
function M(ch){ return [`${T}/${ch}.json`]; }
```

One easy trap: the “auto-check for updates” setting in the UI only governs the app’s own updater — it does *not* govern this component OTA. I had auto-update off, yet `ota-state.json` kept updating, because it uses a different switch entirely.

## Making the patch

There’s a convenient way to modify `app.asar`: instead of unpacking and repacking, do an equal-length replacement on the raw bytes. As long as the replacement is the same length, `main.bundle.cjs` ’s size is unchanged, the offset/size in the asar index stay valid, and you patch in place.

First, kill the seed-activation path in `decideBootAction`. Its body contains three `"activate-seed"` strings; replace each, equal-length, with `"seed-disabled"`:

```text
"activate-seed"   →  15 characters (with quotes)
"seed-disabled"   →  15 characters
```

After that it can never return `"activate-seed"`, so the caller’s check never fires and the seed never overwrites. Note the caller itself has two `"activate-seed"` strings that must be kept, so I replaced within the function-body range only — not a global replace.

Second, cut off the OTA data source by swapping the domain to one unrelated to the project:

```text
https://github.com/...    →   https://invalid.io/...
```

`github.com` and `invalid.io` are both 10 characters — equal length. On my machine that domain returns a very long response (visible in the logs later), so it never gets a valid manifest.

The script’s core is three parts: locate the region, brace-match the function body, and assert equal length. Here’s the key logic (full script at the end):

```python
# 1. locate main.bundle.cjs within the asar
off, size = find_entry(header, '/desktop/main.bundle.cjs')
text = bytes(d[off:off+size]).decode('utf-8', 'ignore')

# 2. brace-match out the decideBootAction body, patch only inside it
i = text.find('function v({resolved:S,seedEntry:z,crashFallback:T}){')
marker = 'function v({resolved:S,seedEntry:z,crashFallback:T}){'
j = i + len(marker); depth, k = 1, j
while depth > 0:
    depth += text[k] == '{'; depth -= text[k] == '}'; k += 1
func = text[i:k]
newfunc = func.replace('"activate-seed"', '"seed-disabled"')

# 3. assert equal length; don't write if it changed
assert len(newfunc.encode()) == len(func.encode())
text = text[:i] + newfunc + text[k:]
text = text.replace('https://github.com/liliMozi/openhanako/releases/download/channels',
                    'https://invalid.io/liliMozi/openhanako/releases/download/channels')
assert len(text.encode()) == size
```

The resulting file is byte-for-byte the same size as the original — 52,399,789 bytes here.

When overwriting, remember `app.asar` lives under Program Files and is held by `HanaAgent.exe` while running. Quit HanaAgent completely (including the tray icon), confirm both `HanaAgent.exe` and `hana-server.exe` are gone, then overwrite with an elevated PowerShell, backing up the original first:

```powershell
Copy-Item "C:\Program Files\Hanako\resources\app.asar" "C:\Program Files\Hanako\resources\app.asar.orig" -Force
Copy-Item "C:\Users\<user>\.hanako\app.asar.patched" "C:\Program Files\Hanako\resources\app.asar" -Force
```

Then relaunch HanaAgent.

## Verifying

Pull the patched `main.bundle.cjs` out and run `node --check` — returns 0, syntax intact.

Read the patched `app.asar` and count:

```text
seed-disabled : 3
invalid.io    : 1
activate-seed : 2   (the caller's checks, preserved)
github .../channels : 0
size 52399789 bytes — identical to the original
```

On launch, the server log shows `initialization complete (0.7s)`, and `file-history` makes no noise. `ota-state.json` now shows:

```text
artifact-ota: GitHub channel manifest request failed:
response exceeded 4096 bytes for
https://invalid.io/liliMozi/openhanako/releases/download/channels/stable.json.sig
```

It’s blocked at that address and gets nothing.

## Closing

The whole process is the same lesson as fighting client self-verification before: the layer you patched isn’t the layer that decides whether to revert. Go up one level, find the decision, and turn it off.

Electron apps differ from native in a few ways worth remembering. Before touching anything, check whether the asar integrity fuse is on. Understand exactly *which layer* the sha256 covers — here it was the archive, so modifying the unpacked directory never triggers a revert. Use equal-length replacement on the asar for convenience. And don’t forget the OTA path — it’s a separate mechanism from local restore.

HanaAgent is open source, so this is mostly a record for myself. For the two real bugs — the `file-history` crash and the full startup scan — filing an issue upstream beats everyone patching their own copy.

* * *

### Appendix: full script

```python
import struct, json

SRC = r'C:\Program Files\Hanako\resources\app.asar'
d = bytearray(open(SRC, 'rb').read())
jss = struct.unpack('<I', d[12:16])[0]
header = json.loads(d[16:16 + jss].decode())
data_start = 16 + ((jss + 3) & ~3)


def walk(node, pre=''):
    for name, info in node['files'].items():
        rel = pre + '/' + name
        if 'files' in info and 'offset' not in info:
            yield from walk(info, rel)
        else:
            yield rel, info


off = size = None
for rel, info in walk(header):
    if rel == '/desktop/main.bundle.cjs':
        off, size = data_start + int(info['offset']), int(info['size'])
        break

text = bytes(d[off:off + size]).decode('utf-8', 'ignore')

marker = 'function v({resolved:S,seedEntry:z,crashFallback:T}){'
i = text.find(marker)
j = i + len(marker)
depth, k = 1, j
while depth > 0:
    if text[k] == '{':
        depth += 1
    elif text[k] == '}':
        depth -= 1
    k += 1
func = text[i:k]
newfunc = func.replace('"activate-seed"', '"seed-disabled"')
assert len(newfunc.encode()) == len(func.encode())
text = text[:i] + newfunc + text[k:]

text = text.replace('https://github.com/liliMozi/openhanako/releases/download/channels',
                    'https://invalid.io/liliMozi/openhanako/releases/download/channels')
assert len(text.encode()) == size

d[off:off + size] = text.encode()
open('app.asar.patched', 'wb').write(d)
```

* * *

**Colin Xiao**— I take on contract reverse-engineering work, and writeups like this are how I show what I can do. If you need help with anything in this space — including but not limited to the areas I cover above — I’m available. No project is too big or too small — if it’s reverse engineering and I can do it, I’ll take it. DM me on X (@colinxiao_lab) or Telegram (@ColinXiao666).

**Get in touch**
