---
title: "The CSC 2026 Payslip Portal:  Three Bugs Where the File You Can Write Is the File You Run"
source: https://tranlynhathao.github.io/blog/2026/csc-2026-payslip-portal/
source_host: tranlynhathao.github.io
clip_date: 2026-11-06T10:29:41+08:00
trace_id: 8fba56b9-4f9f-4301-8c1d-633e0ea03c08
content_hash: 6480808adcbdae9e9af8c9b1a92e80dd0a26f991e8df2ea6ff9217a1e02ab765
status: synced
tags:
  - 漏洞分析
  - CTF
series: null
feed_source: Tran Ly Nhat Hao·Android RE
ai_summary: 三处缺陷串成一条链拿下 Go 工资单门户：无认证的 CBC cookie 泄露填充位、HR 模板注入换成任意文件写、可写的规则文件被解释执行，最终先后取回两个 flag。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41075244-d011-8110-91ac-d7ae52f1b10e
ioc:
  cves: []
  cwes: []
  hashes:
    - 65f7c677f6403cabff34998afb5e7a8a5ecfa7f4523db17a9555db6513ed1757
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 三处缺陷串成一条链拿下 Go 工资单门户：无认证的 CBC cookie 泄露填充位、HR 模板注入换成任意文件写、可写的规则文件被解释执行，最终先后取回两个 flag。
> 
> - **Padding oracle：** 会话 cookie 用 AES-CBC+PKCS#7 加密却无 MAC/AEAD，解密路径把"填充错误"（400）与"内容非法"（401）映射为不同状态码，等价于逐字节解密预言机；据此解出自身 claims 后反向构造加密块，伪造出 `role:"hr"` 的新 cookie，从 HR 路由 `GET /api/hr/template` 拿到 flag1。
> - **模板拿到"打印机"：** Go 的 `html/template` 只防 XSS、不阻止调用传入对象的方法；预览接口把活的 `wkhtmltopdf.PDFGenerator` 交给 HR 可编辑的模板，模板中调用 `Buffer.WriteString` 加 `WriteFile` 两步即可用服务账号身份写任意文件。
> - **可写即可执行：** 扣款规则 `rules/current.go` 归应用用户所有，且每次计算工资都被 yaegi 以 `interp.Options{Unrestricted: true}` 加载全量标准库解释执行；覆盖该文件再触发一次计算即 RCE，读出无任何路由暴露的 `/etc/payslip/flag2`。
> - **加固失位与验证：** 非 root 容器、root 属主只读 flag、HR 角色检查均正确，却没守住"唯一可写文件正是唯一执行文件"这条主线；作者用 compose 重建本地实例，利用链约 5 秒跑通并事后还原 stock 规则（SHA-256 逐字节复原）。

[Part one](https://tranlynhathao.github.io/blog/2026/csc-2026-ransomware-unlocker/) was the recovery phase: files that had to come back byte for byte before a single service could score. This is the half that followed. Once a service was restored and running, the finals opened the attack-and-defence round — every team's copy of every service was reachable from every other team, and a flag planted inside a service was worth points to whoever pulled it out.

One of the six services was a Go **payslip portal**: employees sign in, read their pay statements, and download a PDF; an HR account edits the template the PDF is rendered from. It kept two flags, `/etc/payslip/flag1` and `/etc/payslip/flag2`, and fell to a chain of three bugs where each one handed over exactly what the next needed. This is a reading of that chain from the service's own source, and of why each link was there.

Three bugs, each one opening the next a registered employee account is the only thing the chain starts with 1\. An employee becomes HR the session cookie: AES-CBC, no MAC claims hold the role the decode path answers two ways bad padding → 400 · padding fine → 401 that difference is a padding oracle decrypt the claims, then forge new ones role: hr → flag1 2\. HR gets a file write HR may preview a payslip template rendered server-side the template is handed the PDF generator itself, and a Go template may call methods on it {{.Document.Renderer.PDF.WriteFile … }} write any file the app account owns 3\. The file write becomes code deductions come from rules/current.go owned by the app that file is re-read and interpreted on every payslip, by a Go interpreter with the whole standard library interp.Options{Unrestricted: true} code runs in the service read flag2 The container runs as a non-root user and keeps both flags root-owned and read-only. It is undone by one line: the only file the application may write is the only file the application executes.

Each bug produces precisely the capability the next one needs: a role, then a file write, then code.

## The service, and what it protected

The portal is a single Go binary behind a few JSON routes. It is packaged with care. The container runs as a non-root user (`USER 65532`), the two flag files are owned by `root` and only group-readable, and the HR-only routes sit behind a role check in middleware. Read the Dockerfile and the session layer and it looks like someone thought about this.

The flags gate two different things. `flag1` is handed to any request that reaches `GET /api/hr/template` — so it needs the HR role. `flag2` sits on disk as `/etc/payslip/flag2`, readable by the service account but behind no route at all — so it needs code running inside the service. The chain earns the first, then the second.

## One: the cookie that answers questions

The session cookie carries the user's claims — a version, a session id, a user id, a role, an expiry — as JSON, encrypted and handed to the browser. The role lives in that blob, and the HR routes trust it:

Go

```go
type sessionClaims struct {
    Version int    `json:"v"`
    SID     string `json:"sid"`
    UID     string `json:"uid"`
    Role    string `json:"role"`
    Expiry  int64  `json:"exp"`
}
```

The encoding is AES in CBC mode with PKCS#7 padding, a random IV prepended, the whole thing base64'd. What it is **not** is authenticated. There is no MAC, no AEAD, nothing that lets the server tell its own ciphertext from one an attacker assembled. The decrypt path is the textbook shape:

Go

```go
plaintext := make([]byte, len(encoded)-aes.BlockSize)
cipher.NewCBCDecrypter(block, encoded[:aes.BlockSize]).CryptBlocks(plaintext, encoded[aes.BlockSize:])
plaintext, err = padding.NewPkcs7Padding(aes.BlockSize).Unpad(plaintext)
if err != nil {
    return claims, errMalformedSession   // the padding did not check out
}
if err := json.Unmarshal(plaintext, &claims); err != nil {
    return sessionClaims{}, errInvalidSession   // padding fine, contents not JSON
}
```

Those two error values are different, and — this is the whole bug — the outer layer turns them into **different HTTP statuses**:

Go

```go
func writeSessionError(w http.ResponseWriter, err error) {
    if errors.Is(err, errMalformedSession) {
        writeError(w, http.StatusBadRequest, "invalid request")   // 400: bad padding
        return
    }
    if errors.Is(err, errInvalidSession) {
        writeError(w, http.StatusUnauthorized, "sign in required") // 401: padding OK
        return
    }
    ...
}
```

Send a cookie and the server tells you, in its status code, whether the bytes you sent decrypted to something with valid PKCS#7 padding. That is a **padding oracle**, and a padding oracle against CBC is a decryption oracle: byte by byte, from the last of a block to the first, a few hundred requests recover the plaintext of any block without the key. The classic attack. The service volunteers the one bit it must never leak.

Decryption alone reads the claims. But CBC's malleability runs the other way too: the same oracle that decrypts a block lets you **build** a ciphertext that decrypts to a plaintext you choose. So the move is not to steal an HR cookie — it is to take your own employee cookie, read its claims, and forge a new set with `"role":"hr"` and a fresh expiry, encrypted into a cookie the server will accept as its own. Present it to `GET /api/hr/template`, and the response carries `flag1`.

> ##### TIP
> 
> Encrypting a cookie is not protecting it. Confidentiality hides the contents; it says nothing about whether the server made them. A session token needs **authentication**— a MAC the server checks, or an AEAD like AES-GCM that fails as one operation with one error — so that a cookie the server did not produce is rejected before anything looks at the padding, the JSON, or the role. And the two failures must be indistinguishable from outside: same status, same body, same timing. The moment "bad padding" and "bad contents" look different, the encryption is an oracle.

## Two: the preview that hands over the printer

The HR role buys more than `flag1`. HR may edit the payslip template and preview it, and the preview renders server-side: the template is a Go `html/template`, executed against a job struct, and the result is run through `wkhtmltopdf` into a PDF. The template the HR user submits is the program.

Go's `html/template` escapes HTML — it is built to stop cross-site scripting, and it does. What it does not do is stop a template from **calling methods on the data it is given**. `{{.Document.Title}}` reads a field; `{{.Document.Renderer.PDF.WriteFile "x"}}` calls a method. Whether that second one is dangerous depends entirely on what the data object exposes. Here is what the preview passes in:

Go

```go
type PreviewJob struct {
    Session  *Session
    Employee Employee
    Payslip  Payslip
    Document *Document
}

type Document struct {
    Title    string
    Renderer *Renderer
}

type Renderer struct {
    PDF *wkhtmltopdf.PDFGenerator   // the live generator, reachable from the template
}
```

The template can reach `.Document.Renderer.PDF` — the actual, live PDF generator — and call its methods. That object has a method that writes its buffer to a path on disk, and its buffer has a method that appends a string. Two calls, and a template writes a file of its choosing:

Text

```text
{{.Document.Renderer.PDF.Buffer.WriteString "<the bytes to write>"}}
{{.Document.Renderer.PDF.WriteFile "<the path to write them to>"}}
```

This is server-side template injection, but the usual SSTI story — escape the sandbox, reach `exec` — does not apply, because Go templates have no sandbox to escape and no `exec` to reach. The entire capability is whatever the passed-in object hands you. The bug is not in `html/template`; it is in giving a user-authored template a live handle to the machinery instead of the finished strings. The template needed four values — an employee name, a period, some amounts — and was handed the printer.

So HR, which is now anyone, can write any file the service account owns. On its own that is bad. What makes it the end of the game is **which** file.

## Three: the rule file that is also a program

The amount deducted from a payslip is not hard-coded. It is computed by a small Go function the service reads from disk and interprets at run time, so payroll can be tuned without a redeploy:

Go

```go
func Calculate(grossCents int64) (int64, error) {
    i := interp.New(interp.Options{Unrestricted: true})
    i.Use(stdlib.Symbols)
    i.Use(unrestricted.Symbols)
    if _, err := i.EvalPath("rules/current.go"); err != nil {   // read and run, every time
        return 0, err
    }
    v, _ := i.Eval("rules.Deductions")
    calculate := v.Interface().(func(int64) int64)
    return calculate(grossCents), nil
}
```

`rules/current.go` is read and evaluated by [yaegi](https://github.com/traefik/yaegi), a Go interpreter, on **every** payslip calculation — and it runs with `Unrestricted: true` and the full standard library loaded. Whatever Go source is in that file is executed, with the file system, the network, and the process's privileges all in reach.

Now line up the Dockerfile:

Dockerfile

```dockerfile
RUN ... && install -d -m 0755 /app/rules
COPY --chown=${APP_UID}:${APP_UID} rules/current.go /app/rules/current.go
USER ${APP_UID}:${APP_UID}
```

`current.go` is owned by the application user. The application user is who the template write in stage two runs as. So the one file the service **executes** is a file the service can **write**— and stage two is a file write as exactly that user. Overwrite `current.go` with Go source that reads `/etc/payslip/flag2`, trigger one payslip calculation, and the flag is read by code running inside the service, which can then hand it back out however it likes. That is `flag2`.

> ##### TIP
> 
> Treating configuration as code is convenient and occasionally justified, but a rule file that is interpreted as a program is a program, and it inherits every question you would ask of one: who may write it, what may it reach when it runs, and is it the same file on the next read. Here all three answers were wrong at once — writable by the service, unrestricted at run time, re-read every call. A sandboxed expression language, or rules expressed as data rather than Go, or at the very least a rule file the service cannot write, each breaks the link on its own.

## Running the chain against a local instance

The contest is over, and the services on its network are gone — so to show that the chain is real and not just a reading of the source, I rebuilt the service from the `compose.yaml` it ships with and ran it on `localhost:8888`. A clean `docker compose up` stands up the Go binary and its Postgres, and the container seeds the HR account with a random password, exactly as the contest copy did — so there is no HR login to borrow, and the cookie must be forged.

The two flag files in the local build hold sentinels I set for the demonstration, in the contest's `CSCV2026{…}` shape. They are not the real contest flags, which I do not have and do not reproduce; they only mark which stage recovered which file:

Text

```text
flag1 = CSCV2026{l0cal_demo__padding_oracle_forged_hr_role}      # root:app 0640, behind the HR role
flag2 = CSCV2026{l0cal_demo__yaegi_rce_via_template_file_write}  # root:app 0640, behind no route at all
```

Pointed at that one local host — and told to submit nothing — the chain runs end to end in about five seconds: six cookie blocks decrypted through the padding oracle, seven blocks of a forged `role:"hr"` cookie built back up, and both flags out.

Text

```text
$ python3 web-app-exploit.py --hosts 127.0.0.1 --teams 1 --port 8888 --dry-run
[*] 1 target(s), port 8888: 127.0.0.1
[127.0.0.1] forging an hr session cookie with the CBC padding oracle
[127.0.0.1] decrypted cookie block 1/6
[127.0.0.1] decrypted cookie block 2/6
[127.0.0.1] decrypted cookie block 3/6
[127.0.0.1] decrypted cookie block 4/6
[127.0.0.1] decrypted cookie block 5/6
[127.0.0.1] decrypted cookie block 6/6
[127.0.0.1] encrypted forged block 7/7
[127.0.0.1] encrypted forged block 6/7
...
[*] 2 flag(s) from 1 host(s)
CSCV2026{l0cal_demo__padding_oracle_forged_hr_role}
CSCV2026{l0cal_demo__yaegi_rce_via_template_file_write}
```

`flag1` comes back from the HR-only `GET /api/hr/template` response, reached with the forged cookie — stage one. `flag2` is never served by any route; it comes back because stage two overwrote `rules/current.go` with Go that reads `/etc/payslip/flag2` and ships it out, and the next payroll calculation ran it — stage three. The exploit then rewrites `current.go` with the stock rule, so the service is left computing deductions as before; reading the file back afterward shows the stock rule, not the payload. That tidy-up is worth noting on its own: a tool that leaves the target in its found state is the difference between demonstrating a bug and breaking a service. The stock rule's SHA-256, `65f7c677f6403cabff34998afb5e7a8a5ecfa7f4523db17a9555db6513ed1757`, is also the `org_hash` that the ransomware inventory in [part one](https://tranlynhathao.github.io/blog/2026/csc-2026-ransomware-unlocker/) records for `/opt/payslip/rules/current.go`, and the hash of the copy of the file in the service's source tree, so the file is put back to the byte.

> ##### NOTE
> 
> This ran against a build on `localhost` that I stand up and tear down, with placeholder flags, and with submission switched off — the single-target, no-submit path. The point is to confirm the write-up's claims against the real binary, not to point the tool at anything live. The sweep-and-submit machinery around this core — the part that walks a range of teams and talks to the scoring API — is what made it an A/D tool on the day, and it is the least interesting half; it is not reproduced here.

## Why it is the whole chain, and not three separate notes

Any one of these is a finding. Together they are a single sentence: **the only file the application may write is the only file the application executes.** The hardening around it — the non-root user, the root-owned flags, the role check on the HR routes — is real, and none of it touches that sentence. `flag1` is behind a role, so the cookie bug fetches a role. `flag2` is behind no route, so the chain arranges for code to run. The defences that were present guarded the wrong things.

What each link should have been:

-   **The session cookie needs authentication, not just encryption.** Sign it, or use an AEAD, so a cookie the server did not mint is rejected whole — and make the rejection look identical from outside however it fails, so there is no bit to read. Confidentiality was never the property that mattered here; integrity was.
-   **A user-authored template gets data, not machinery.** Build the finished strings — name, period, amounts — and pass a flat struct of those. Nothing reachable from the template should have a method that touches the disk, the network, or the renderer. If previews must run untrusted templates, render them somewhere with no file access and no ambient authority.
-   **The file a service executes is not a file the service writes.** If rules are code, the rule file is owned by something the request path cannot reach, and the interpreter runs without unrestricted access to the host. Better, rules that can be data should be data, checked against a schema, never evaluated as a language.

The portal reads, at a glance, like careful work — and in most respects it is. The chain is what careful work looks like when the capabilities are drawn one bug at a time and nobody stands back to ask what the pieces add up to. A role check, an encrypted cookie, a non-root container, root-owned secrets: each correct, and arranged so that the one writable file was the one executed file, two stages apart, with a forged role in between.

![A hand holding the bronze Cybersecurity Student Contest 2026 finalist medal and the team lanyard card reading HCMUS-ForFreeFood, at the award ceremony in front of the lit stage backdrop](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3608ff9f4d33e63d.jpg)

![A hand holding the bronze Cybersecurity Student Contest 2026 finalist medal and the team lanyard card reading HCMUS-ForFreeFood, at the award ceremony in front of the lit stage backdrop](https://tranlynhathao.github.io/assets/img/blog/csc-2026-payslip-portal/award-ceremony-160.avif)

The finalist medal and the team card at the award ceremony that closed the finals. The payslip portal was one of the six services; our team took the Category A consolation prize.

That was the A/D round. Six services, every team's copy reachable, and a clock — the same shape as the morning's recovery phase, pointed the other way.
