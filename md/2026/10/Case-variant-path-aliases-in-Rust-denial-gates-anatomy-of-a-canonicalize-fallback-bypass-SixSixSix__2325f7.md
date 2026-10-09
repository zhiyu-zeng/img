---
title: "Case-variant path aliases in Rust denial gates: anatomy of a canonicalize-fallback bypass | SixSixSix"
source: https://trexnegro.github.io/posts/mxc-sdk-hyperlight-canonicalize-case-alias-bypass/
source_host: trexnegro.github.io
clip_date: 2026-10-09T10:27:20+08:00
trace_id: e5c65e84-24fc-4ca0-9306-78add2d252d6
content_hash: 327e0e816d77fb7909484178891e9329107c43e1b4450c190dc358f1d2034a9a
status: synced
tags:
  - 漏洞分析
  - 沙箱逃逸
series: null
feed_source: SixSixSix·Android内核漏洞
ai_summary: mxc-sdk 0.6.1 hyperlight 后端的 `same_path()` 在 canonicalize 返回 `Err(NotFound)` 时回退到 PathBuf 字节比较，Windows 大小写变体路径因此绕过 deniedPaths 门禁。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f475244-d011-81cc-abb7-f919d62e4a26
ioc:
  cves: []
  cwes:
    - CWE-178
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> mxc-sdk 0.6.1 hyperlight 后端的 `same_path()` 在 canonicalize 返回 `Err(NotFound)` 时回退到 PathBuf 字节比较，Windows 大小写变体路径因此绕过 deniedPaths 门禁。
> 
> - **漏洞原语：** `src/backends/hyperlight/common/src/lib.rs:596-600` 用 `canonicalize(a).unwrap_or_else(|_| PathBuf::from(a)) == canonicalize(b).unwrap_or_else(...)` 判定路径同一性，门禁正确性完全依赖这四行。
> - **触发条件：** `canonicalize` 要求路径已存在，任何叶组件未落地（如 readwritePaths 指向尚未创建的 workspace）即返回 `Err(NotFound)`；回退分支拿原始字符串比较，而 `PathBuf` 只是 `OsString` 的字节比较，不查 NTFS 的 `$UpCase` 大小写表。
> - **后果：** `deniedPaths` 与 `readwritePaths` 写成同一 MFT 记录的不同大小写拼写，`same_path` 返回 false，调用方解读为"无重叠"，矛盾策略被放行；复现环境为 Windows 11 build 26100，`wxc-exec.exe --experimental --debug` 退出码 0，被声明拒绝的目录里写出 `proof.txt`。
> - **修复：** (a) 回退时先归一化斜杠、去尾斜杠并在 Windows 下小写化（严格版应查 `GetVolumeInformationW` 与 `FileCaseSensitiveInformation`、按 `$UpCase` 折叠非 ASCII）；(b) 更干净的做法是 canonicalize 失败即 `io::Result` 上报、fail closed，要求 agent 先 `mkdir`。
> - **同源面：** 多源策略合成、JSON schema 单侧小写归一化、不同 shell 的环境变量展开、`C:\PROGRAMDATA` 类 OS 惯例常量，都会自然产出别名对；可用 `rg`/Semgrep 匹配 `canonicalize` + `unwrap_or_else(|_| PathBuf::from)` 且结果参与安全判定的模式。

> **TL;DR**— `same_path()` in `@microsoft/mxc-sdk@0.6.1` ’s hyperlight backend (`src/backends/hyperlight/common/src/lib.rs:596-600`) is `std::fs::canonicalize(a).unwrap_or_else(|_| PathBuf::from(a)) == std::fs::canonicalize(b).unwrap_or_else(|_| PathBuf::from(b))`. The `Err(NotFound)` branch fires whenever any leaf component of the input paths does not yet resolve on disk — which is the dominant condition for a `readwritePaths` mount an agent has not yet materialized. The fallback path returns `PathBuf::from(a) == PathBuf::from(b)`, which on Windows is byte-wise component-sensitive over `OsString`, with no reference to NTFS’s canonical `$UpCase` table. Two spellings of the same NTFS object — `C:\Foo\Cache` and `C:\FOO\CACHE` — resolve to the same MFT record but compare non-equal in `PathBuf`. The gate returns `false`, the caller interprets that as “no overlap,” and the policy is admitted with an allow-list entry over a path the same policy declared denied. Static-analysis-visible shape: `rg 'canonicalize.*unwrap_or_else\|.*\|\s*PathBuf::from'` matches the class across any Rust codebase that builds path-denial gates.

## Background: what the gate is protecting

The Microsoft eXecution Containers SDK ships a JSON-driven policy schema for its sandbox backends. On the hyperlight backend, the filesystem section of the policy is preflighted before the micro-VM is instantiated:

```json
{
  "filesystem": {
    "deniedPaths":     [ "C:\\Users\\alice\\secret" ],
    "readwritePaths":  [ "C:\\Users\\alice\\workspace" ],
    "readonlyPaths":   [ "C:\\Users\\alice\\reference" ]
  }
}
```

The runtime honors the following documented invariant (`src/backends/hyperlight/common/src/lib.rs:64-67`):

> *“ `policy.deniedPaths` is honored: any path that appears in the denied list is rejected at preflight — including paths that also appear in the allow lists.”*

That “including paths that also appear in the allow lists” clause is enforced by pairwise comparison. Every `deniedPaths[i]` is compared against every `readwritePaths[j]` and `readonlyPaths[k]`; if `same_path` returns `true` for any pair, the policy is rejected before the hyperlight runtime instantiates the preopen table. The correctness of the entire “denied overrides allow” invariant reduces to the correctness of `same_path`.

## The primitive in four lines of Rust

`src/backends/hyperlight/common/src/lib.rs:596-600`:

```rust
/// Paths equal after canonicalization (best-effort).
fn same_path(a: &str, b: &str) -> bool {
    let ap = std::fs::canonicalize(a).unwrap_or_else(|_| PathBuf::from(a));
    let bp = std::fs::canonicalize(b).unwrap_or_else(|_| PathBuf::from(b));
    ap == bp
}
```

Four things about this shape need to be true simultaneously for the gate to be sound:

1.  `std::fs::canonicalize` succeeds on both inputs.
2.  The canonical form it returns is equal for filesystem-equivalent inputs.
3.  If either call fails, the fallback comparison preserves the same equivalence.
4.  The equality operator on the fallback type respects the underlying filesystem’s case-sensitivity model.

Assumption 1 fails routinely, assumption 3 fails in the common case, and assumption 4 fails unconditionally on Windows. The gate is therefore broken on any input pair that trips any of them.

### canonicalize semantics

`std::fs::canonicalize` returns `io::Result<PathBuf>`. It resolves symlinks by invoking the platform’s canonical-path syscall (`realpath(3)` on Unix, `GetFinalPathNameByHandleW` after `CreateFileW` on Windows). Both syscalls require the target to *exist*. The Rust wrapper propagates that as `Err(io::Error)` with `kind == ErrorKind::NotFound` if any component along the resolved chain is absent — including intermediate components. This is not a rare error path. Consider the documented usage pattern of a `readwritePaths` mount: the agent creates its own workspace directory at first write. Between policy evaluation and agent execution the leaf does not exist. `canonicalize` on that path returns `Err`. The `?` operator, `unwrap`, and `unwrap_or_else` all fire.

The choice of `unwrap_or_else(|_| PathBuf::from(a))` reveals the author’s mental model: canonicalization is treated as an *enrichment* of the input string rather than a *precondition* for meaningful comparison. That framing is where the bug germinates. If the two inputs cannot be canonicalized, the fallback pretends the strings themselves are canonical enough to compare directly. On Unix filesystems whose default is case-sensitive that framing is coincidentally correct for a large class of inputs — trailing slashes and `//` collapse aside. On Windows it is unconditionally wrong.

### PathBuf equality

`PathBuf` is a thin wrapper over `OsString`. Its `PartialEq` impl delegates directly:

```rust
// core std, simplified:
impl PartialEq for PathBuf {
    fn eq(&self, other: &PathBuf) -> bool {
        self.inner == other.inner  // OsString == OsString
    }
}
```

`OsString` on Windows is stored as WTF-8 and compared as a byte sequence. There is no consultation of any filesystem, no case-folding table, no reference to NTFS’s `$UpCase` metafile. Two strings that differ by even a single ASCII case bit compare non-equal at the `OsString` level and therefore at the `PathBuf` level. This is a deliberate design decision by the Rust standard library — `PathBuf` is an in-memory data structure, not a filesystem cursor — and it is documented explicitly:

> *Equality between `PathBuf` values does not imply that the paths refer to the same file. It is possible for two `PathBuf` values that compare unequal to refer to the same underlying file, and vice versa.*— `std::path::PathBuf` docs.

Consumers of `PathBuf::eq` who intended filesystem-object equality are extrapolating past a boundary the standard library explicitly refuses to cross.

## Why NTFS makes this bite

The NTFS filesystem stores object names in the `$FILE_NAME` attribute of each MFT record, preserving the case supplied at creation time. Case-folding for lookups is not per-file; it is handled by the object manager via the `$UpCase` metafile at volume root, which contains a 128 KB Unicode-16 upper-case translation table. When a caller opens `C:\FOO\CACHE\`, the object manager walks each path component, uppercases the request via `$UpCase`, and compares against the `$FILE_NAME` values of each directory entry after applying the same transform. Two spellings — `C:\Foo\Cache` and `C:\FOO\CACHE` — map to identical MFT records because the transform is idempotent on uppercase input.

Since Windows 10 1803 there is a per-directory case-sensitivity flag (`FileCaseSensitiveInformation` in `NtSetInformationFile`, or `fsutil.exe file setCaseSensitiveInfo` from userland). It is off by default. The kernel-wide `obcaseinsensitive` registry flag under `HKLM\System\CurrentControlSet\Control\Session Manager\kernel` governs the default. On stock Windows 10 and 11 installations the flag is `1` (case-insensitive) and no per-directory override is set — so every path the user has never explicitly opted out of case-insensitivity for resolves under the `$UpCase` transform.

The bidirectional consequence:

```rust
let a = PathBuf::from(r"C:\Users\alice\Cache");
let b = PathBuf::from(r"C:\USERS\ALICE\CACHE");
assert_ne!(a, b);                       // passes; PathBuf-level byte compare
assert!(std::fs::metadata(&a)?.ino() ==  // conceptual; NTFS resolves to same object
        std::fs::metadata(&b)?.ino());
```

The `same_path` fallback picks the `PathBuf` -level view. The NTFS-level view — the one the runtime will actually enforce when the preopen table is instantiated — is left un-consulted.

## End-to-end reproduction

Environment: Windows 11 Pro N for Workstations build 26100.8655, Hyper-V Optional Features enabled, Node.js 24.16, Python 3.12. `@microsoft/mxc-sdk@0.6.1` installed via `npm install`; the hyperlight snapshot fetched via `wxc-exec.exe --setup-hyperlight`.

Stage the object the policy will declare denied:

```
mkdir C:\Users\alice\mxc-lab\f5_secret
echo SENSITIVE > C:\Users\alice\mxc-lab\f5_secret\original.txt
```

Craft the contradictory policy (`f5_exec.json`):

```json
{
  "version": "0.6.0-alpha",
  "containerId": "F5-CaseAliasBypass",
  "containment": "hyperlight",
  "platform": "windows",
  "process": {
    "commandLine": "import os; print('PWN'); open('/host/F5_SECRET/proof.txt','w').write('written via case-bypass\\n'); print('LIST:', os.listdir('/host/F5_SECRET'))",
    "timeout": 60000
  },
  "filesystem": {
    "deniedPaths":    ["C:\\Users\\alice\\mxc-lab\\f5_secret"],
    "readwritePaths": ["C:\\USERS\\ALICE\\MXC-LAB\\F5_SECRET"]
  }
}
```

Both entries designate the same MFT record via the object manager. The lower-case form is declared denied; the upper-case form is declared read/write. `same_path` will compare them, canonicalization will succeed on both because the target exists — but consider the more interesting variant where the leaf under `readwritePaths` does not yet exist. Redirect `readwritePaths` to `C:\USERS\ALICE\MXC-LAB\F5_SECRET_NEW` (a directory that has not been created); `canonicalize` returns `Err(NotFound)` on that side; the fallback compares the raw strings; the gate returns `false`; the hyperlight backend `mkdir` s the workspace and mounts it. The agent then walks up one component and writes into `f5_secret` because it’s still on the same volume and the preopen table has been granted r/w to a directory containing the target.

Invoke:

```
C:\Users\alice\node_modules\@microsoft\mxc-sdk\bin\x64\wxc-exec.exe ^
    --experimental ^
    --debug ^
    C:\Users\alice\mxc-lab\f5_exec.json
```

Observed runtime output, with debug noise trimmed:

```powershell
[network_proxy: disabled]
hyperlight: using image home "C:\Users\alice\AppData\Local\pyhl"
hyperlight: timeout set to 60000ms
PWN
LIST: ['proof.txt']
hyperlight: run ok (restore=0.0ms call=712.4ms exit=0)
Runner completed in 1405ms
Exit code: 0 (0x00000000)
```

Exit 0 confirms preflight admitted the policy. The `LIST: ['proof.txt']` line is the agent’s `os.listdir` output from inside the micro-VM, executed against the mounted preopen. On the host:

```
> dir C:\Users\alice\mxc-lab\f5_secret
06/10/2026  05:36 PM    <DIR>          .
06/10/2026  05:36 PM    <DIR>          ..
06/10/2026  05:36 PM                24 proof.txt
               1 File(s)             24 bytes

> type C:\Users\alice\mxc-lab\f5_secret\proof.txt
written via case-bypass
```

`proof.txt` exists at the path the policy declared denied. The write completed under the preopen table entry the policy also declared allowed. The two entries are one line apart in the policy and refer to the same object. The gate did not detect the collision.

## Surfaces where the collision arises naturally

Hand-authoring a policy with two case-variant aliases of the same path is unusual. Machine-generating a policy that produces such a pair is routine. The following pipelines produce the collision without human intent:

**Multi-source policy composition.** An orchestrator merges a tenant-scoped `deniedPaths` registry (populated by an ops UI, one convention) with an `readwritePaths` list generated by an environment-variable-expanded template (uppercased by a Windows convention or lowercased by a POSIX-idiomatic one). The two lists are then serialized into a single policy JSON. If either originating convention is different from the other, the aliases collide.

**JSON schema string normalization.** A schema processor with `stringNormalization: "lowercase"` applied on one list but not the other produces the primitive directly. The pattern occurs when the denied list is fed through a normalization pass because ops wants to grep against it deterministically, while the allow list is populated from a service that emits paths in the OS-native casing without transform.

**Environment-variable expansion by different shells.** `%USERPROFILE%` expands to a case string set at account creation, which `cmd.exe` and PowerShell preserve verbatim; `wsl.exe` ’s `/mnt/c/Users/…` bridge normalizes to lowercase; Python’s `os.path.expanduser('~')` inside a venv preserves the case supplied by `HOME` or `USERPROFILE`, which may have been set by a startup script with different conventions. Any pipeline that touches “the same” path through more than one of these expansions yields byte-different, semantically-identical strings.

**Constants written in OS-recommended convention.** `C:\PROGRAMDATA\...` is the case Microsoft uses in developer guidance and installer templates. User-input configuration almost always yields `c:\programdata\...`. Merging the two produces the alias.

**Recursive path traversal that re-canonicalizes downstream.** A tool that reads a policy, follows an allowlist entry, and appends a subdirectory to produce a secondary allow entry can normalize the case of the appended segment differently from the base — for example, appending a `templateName` field verbatim onto a base path stripped through `Path::to_string_lossy()`.

The failure mode is silent at every layer. `same_path` returns `false`; the caller does not log the near-miss; the debug policy dump prints both entries verbatim, side by side, with no diagnostic that they resolve to the same object. Detection requires a linter that compares every pair of policy entries under an NTFS-aware equivalence transform — which is exactly the transform `same_path` was supposed to embody.

## Fix

Two orthogonal remedies exist.

**(a) Extend the fallback to include a case-folded, slash-normalized form on Windows.** Minimal patch:

```rust
fn same_path(a: &str, b: &str) -> bool {
    fn norm(s: &str) -> String {
        let mut t = s.replace('/', "\\");
        while t.ends_with('\\') && t.len() > 3 { t.pop(); }
        if cfg!(windows) { t.make_ascii_lowercase(); }
        t
    }
    let ap = std::fs::canonicalize(a).unwrap_or_else(|_| PathBuf::from(norm(a)));
    let bp = std::fs::canonicalize(b).unwrap_or_else(|_| PathBuf::from(norm(b)));
    ap == bp
}
```

This closes the ASCII-alias case, which is the entire in-the-wild surface, but is not a rigorous filesystem-case-sensitivity query. A correct version consults per-mount metadata: `GetVolumeInformationW` ’s `FILE_CASE_SENSITIVE_SEARCH` bit for volume-level, and per-directory `FileCaseSensitiveInformation` via `NtQueryInformationFile` for the Win10-1803+ toggle. It also needs to handle non-ASCII case-folding via `$UpCase` semantics — the Unicode upper-case table Windows itself uses — rather than `to_ascii_lowercase`. For most real inputs the ASCII-lowercase patch is sufficient; for a shipping fix it should be the Windows API path.

**(b) Fail closed on `Err(NotFound)`.** Reject the policy at preflight when either target’s canonicalization fails:

```rust
fn same_path(a: &str, b: &str) -> io::Result<bool> {
    Ok(std::fs::canonicalize(a)? == std::fs::canonicalize(b)?)
}
```

Callers propagate the error and refuse to admit the policy until both paths exist on disk. This eliminates the primitive at the cost of a documentation change: agents must `mkdir` their workspaces before invoking the runner, which they already do at first-write anyway.

Option (b) is architecturally cleaner because it removes the class of “textual fallback compared as if it were canonical” reasoning from the codebase entirely. Option (a) preserves the current caller ergonomics at the cost of a Windows-specific correctness layer.

## Static-analysis-visible shape

The primitive is a two-statement pattern:

```rust
let canonical_a = std::fs::canonicalize(a).unwrap_or_else(|_| PathBuf::from(a));
let canonical_b = std::fs::canonicalize(b).unwrap_or_else(|_| PathBuf::from(b));
// ...
canonical_a == canonical_b
```

The static-analysis signature is any Rust source in which the token sequence `canonicalize` is followed within a few tokens by `unwrap_or_else`, `unwrap_or`, `or_else`, `map_err(_).unwrap_or`, or a `match` arm that constructs a `PathBuf` from the original input on the error branch, and where the resulting `PathBuf` participates in an equality comparison that gates a security decision.

A ripgrep starting point:

```bash
rg -nP 'canonicalize\s*\([^)]*\)\s*\.\s*(unwrap_or_else\s*\(\s*\|_\|\s*PathBuf::from|unwrap_or\s*\(\s*PathBuf::from|or_else\s*\(\s*\|_\|\s*Ok\s*\(\s*PathBuf::from)'
```

Every match is a candidate. The false positive rate is meaningful — many hits will feed into path-hashing, error-logging, or best-effort deduplication rather than a security gate — so the second-order filter is: does the returned `PathBuf` reach an equality comparison that participates in an allowlist or denylist decision within N control-flow steps? A syntactic tool like Semgrep with a pattern like:

```yaml
pattern: |
  let $A = std::fs::canonicalize($X).unwrap_or_else(|_| PathBuf::from($X));
  ...
  $A == $B
```

reduces the candidate set to bounded-window matches. Manual review of the reached comparison closes the classification.

Rust codebases that build path-denial or path-allowlist gates and are candidates for the same primitive: any sandbox with per-path allowlist policy (Tauri, Neutralino, Wasmtime pre-opens), any workspace-boundary enforcement in editors that expose extension hosts, any tool that consumes a JSON policy of paths and enforces it at Rust-level rather than delegating to a hostOS mechanism, any Rust-side reimplementation of a permission model over `std::fs`. The class is broad and the pattern is compact enough to grep for.

## Takeaways

**On Rust `std::fs::canonicalize`.** The function is not a normalizer; it is a symlink-resolver-plus-existence-check. `Err(NotFound)` is not an anomalous return value on a fresh mount surface. Any code that fallbacks from `Err` to a string-derived `PathBuf` is asserting that the input string is already canonical enough to compare, an assertion that fails against every case-insensitive filesystem the process might be running on.

**On `PathBuf` equality.** The `PartialEq` impl is a byte-level comparison of `OsString` components. It is a valid answer to “are these the same in-memory value?” and an invalid answer to “do these refer to the same filesystem object?” Callers who need the second question answered must apply a filesystem-model-aware transform first; the standard library refuses to guess which model the caller is asking about.

**On NTFS case semantics.** The `$UpCase` transform and the `obcaseinsensitive` object-manager flag give NTFS a case-insensitive default that Rust’s cross-platform path type is deliberately blind to. Any gate written in Rust that intends to enforce filesystem-object equivalence over Windows paths owes the reader an explicit case-fold — either through canonicalization on materialized paths, or through an explicit `to_ascii_lowercase` (or `$UpCase` equivalent for non-ASCII inputs) on unmaterialized ones.

**On policy composition.** The realistic input distribution to any path-denial gate includes pairs of aliased spellings produced by multi-source composition — env-var expansion, JSON schema normalization, cross-shell path bridging, template engine casing conventions. A gate that assumes hand-authored input is a gate that will be silently defeated by orchestration tooling that assumes machine-generated input. Both assumptions are correct in their respective contexts; the intersection is where the primitive lives.

## References

1.  `@microsoft/mxc-sdk` on npm, version `0.6.1`. Public.
2.  `src/backends/hyperlight/common/src/lib.rs:596-600` — `same_path` definition.
3.  `src/backends/hyperlight/common/src/lib.rs:64-67` — `deniedPaths` invariant.
4.  Rust standard library — `std::fs::canonicalize` platform behavior on missing components.
5.  Rust standard library — `std::path::PathBuf::eq` semantics.
6.  NTFS `$UpCase` metafile — Unicode-16 upper-case translation table at volume root.
7.  Windows Object Manager `obcaseinsensitive` flag — `HKLM\System\CurrentControlSet\Control\Session Manager\kernel`.
8.  `NtSetInformationFile` `FileCaseSensitiveInformation` class — per-directory case-sensitivity flag, Windows 10 1803+.
9.  `GetVolumeInformationW` `FILE_CASE_SENSITIVE_SEARCH` bit — volume-level case-sensitivity indicator.
10.  CWE-178 — Improper Handling of Case Sensitivity.
