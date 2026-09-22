---
title: Cyhub CTF 2025 - Candy Crush | Varik's Blog
source: https://varik.dev/blog/cyhubctf2025/candy-crush
source_host: varik.dev
clip_date: 2026-09-22T10:15:43+08:00
trace_id: cb2cefcb-d8d0-4317-ab13-6c536ce7848c
content_hash: a003f46ae70a94018524f750abba021787d4dcb50aff48284eacf4413a41aac7
status: synced
tags:
  - 协议分析
  - CTF
series: null
feed_source: Varik
ai_summary: 通过并发发送第 9、10 个 collect 事件，利用服务端 nonce 异步校验窗口越过 `score >= 9` 检查，使分数达到 10 并购买 flag。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-818b-ade3-e265fe43c0ea
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过并发发送第 9、10 个 collect 事件，利用服务端 nonce 异步校验窗口越过 `score >= 9` 检查，使分数达到 10 并购买 flag。
> 
> - **挑战构成：** Socket.IO WebSocket-only 通信 + AES-256-CBC 会话密钥加密 + SHA-256 nonce 链防重放，难度 Medium，flag 格式 `cyhub{xxxxx}`。
> - **正常玩法不可行：** 10 秒内掉 10 颗糖果，第 10 颗在计时结束后以不可能速度掉落，分数被硬性卡在 9。
> - **漏洞位置：** `server.js:96-111` 中 `session.score >= 9` 检查在 `await validateNonce()` 之前执行，校验期间并发请求可同时通过检查后各自 `score++`。
> - **利用步骤：** 预先按 `nonce_n = SHA256(nonce_{n-1} || key)` 生成 10 个 nonce 并加密事件；前 8 个顺序发送（score=8），第 9、10 个用 `asyncio.gather()` 并发发送，随后 `buy_flag` 并解密响应。
> - **关键限制：** 每连接密钥/IV 唯一不可跨会话复用；nonce 必须依赖前值链式预生成；必须真正并发而非快速顺序发送。

## Candy Crush

For Cyhub CTF 2025, I created a web challenge that combines modern web technologies with a classic vulnerability type. Candy Crush is a WebSocket-based candy collection game with encrypted communication and nonce-based replay protection. While the game appears to be a simple browser game, it hides a subtle race condition vulnerability that players must exploit to win. The challenge tested players' understanding of real-time web protocols, cryptography, and concurrent systems.

## Challenge Description

Players navigate to the game interface where they control a character collecting falling candies. The goal is to collect 10 candies to purchase the flag, but the game is intentionally designed to make this nearly impossible through normal gameplay.

**Category:** Web  
**Difficulty:** Medium  
**Flag Format:** `cyhub{xxxxx}`

## Challenge Overview

This challenge involves several layers of complexity:

1.  **WebSocket Communication:** Real-time game events using Socket.IO with WebSocket-only transport (no HTTP fallback)
2.  **AES-256-CBC Encryption:** All game messages are encrypted with session-specific keys and initialization vectors
3.  **Nonce-Based Replay Protection:** Sequential nonce validation using SHA-256 to prevent replay attacks and message reordering
4.  **Race Condition Vulnerability:** A subtle timing-based exploit in the server's score validation logic

The combination of these elements creates a realistic scenario where proper security measures are implemented, but a subtle logic flaw allows for exploitation.

## Game Mechanics

### Normal Gameplay Experience

When playing the game normally, you'll notice:

-   A 10-second timer during which 10 candies will drop
-   You can move your character left/right to catch falling candies
-   The first 9 candies drop at a reasonable speed
-   The 10th candy drops at an impossible speed *after* the timer expires
-   Your score is somehow capped at 9 candies, even if you think you caught more
-   You need 10+ candies to purchase the flag

This frustrating experience is by design—the game is telling you that normal gameplay won't work.

### Technical Communication Flow

Behind the scenes, here's what happens:

1.  Client sends a `start` event to begin the game
2.  Server generates a random 32-byte encryption key and 16-byte IV
3.  Server sends these via a `handshake` event
4.  All subsequent messages are encrypted: `base64(AES-256-CBC-encrypt(data))`
5.  Each `collect` event includes a nonce: `SHA256(previous_nonce || key)`
6.  Server validates the nonce sequence before incrementing the score

This protocol ensures that:

-   Messages can't be intercepted and read (encryption)
-   Messages can't be replayed (nonce chain)
-   Messages can't be reordered (sequential nonce validation)

## The Vulnerability

### Race Condition in Score Validation

The vulnerability lies in the server-side score validation logic (server.js:96-111):

```javascript
socket.on('collect', async (encryptedData) => {
    const sessionId = socket.id;
    const session = sessions.get(sessionId);

    if (!session) return;
    if (session.score >= 9) return;  // ← Check happens here

    try {
        const decryptedData = decrypt(
            Buffer.from(encryptedData, 'base64').toString(),
            session.key,
            session.iv
        );
        const data = JSON.parse(decryptedData);

        const isValidNonce = await validateNonce(sessionId, data.nonce);  // ← Async gap
        if (!isValidNonce) {
            console.log('Invalid nonce for session:', sessionId);
            return;
        }

        session.score++;  // ← Score increment happens here
```

**The timing window:** Between the `session.score >= 9` check and the actual score increment, there's a timing gap. During nonce validation (which is asynchronous), multiple requests can pass the initial score check before any of them actually increments the score.

**Why this happens:**

1.  Request A arrives: `score = 8`, passes the check, enters async validation
2.  Request B arrives: `score = 8` (still!), passes the check, enters async validation
3.  Request A finishes validation: `score++` → score becomes 9
4.  Request B finishes validation: `score++` → score becomes 10

Both requests "saw" the score as 8, so both passed the check, allowing the score to exceed the intended limit.

## Protection Mechanisms (That We Need to Work With)

-   **AES-256-CBC Encryption:** All game messages are encrypted with unique session keys—we need to properly encrypt our exploit messages
-   **Nonce Chain Validation:** Prevents replay attacks—we must generate a valid nonce chain
-   **WebSocket-Only Transport:** Ensures real-time communication
-   **Score Capping:** Server-side validation *attempts* to limit score to 9 candies (but has the race condition)
-   **Session Isolation:** Each connection has unique encryption keys

## Solution Walkthrough

### Stage 1: Understanding the Protocol

**Step 1: Connect and analyze**

Use browser DevTools (Network tab → WS filter) to observe the WebSocket messages. You'll see base64-encoded data being exchanged.

**Step 2: Reverse engineer the encryption**

By examining the client-side code (`public/game.js`), you can determine:

-   Encryption algorithm: AES-256-CBC
-   Key and IV are provided during the handshake
-   Messages are base64-encoded after encryption

**Step 3: Understand nonce generation**

The nonce chain works as follows:

```python
nonce_0 = None
nonce_1 = SHA256(nonce_0 || key)
nonce_2 = SHA256(nonce_1 || key)
nonce_3 = SHA256(nonce_2 || key)
...
```

This creates a cryptographically secure chain where you must have the previous nonce to generate the next one.

### Stage 2: Race Condition Exploitation

**Step 1: Pre-generate valid events**

Before exploiting the race condition, generate all 10 valid collect events with proper nonces:

```python
nonces = []
nonce = None
for i in range(10):
    nonce = generate_nonce(nonce, session_key)
    nonces.append(nonce)

# Encrypt each event
events = []
for nonce in nonces:
    encrypted = encrypt(json.dumps({"nonce": nonce}), key, iv)
    events.append(base64.b64encode(encrypted))
```

**Step 2: Sequential phase**

Send the first 8 events normally, one by one:

```python
for i in range(8):
    await socket.emit('collect', events[i])
    await asyncio.sleep(0.1)  # Small delay to ensure sequential processing
```

After this, your score should be 8.

**Step 3: Exploit the race condition**

Send events 9 and 10 simultaneously:

```python
# Both events will pass the "score >= 9" check
# before either one increments the score
await asyncio.gather(
    socket.emit('collect', events[8]),
    socket.emit('collect', events[9])
)
```

The key is sending them concurrently so both requests enter the handler before either one increments the score.

### Stage 3: Flag Purchase

**Step 1: Buy the flag**

With score ≥ 10, you can now purchase the flag:

```python
flag_request = encrypt(json.dumps({}), key, iv)
await socket.emit('buy_flag', base64.b64encode(flag_request))
```

**Step 2: Decrypt the response**

The server returns the encrypted flag. Decrypt it using your session key and IV to get the final flag.

## Key Technical Details

-   **Async timing:** The vulnerability exists because nonce validation is asynchronous (`await validateNonce`)
-   **Nonce chain:** Must pre-generate all nonces before exploitation since each depends on the previous
-   **Concurrent requests:** Use `asyncio.gather()` or similar to send requests truly concurrently
-   **Session keys:** Each WebSocket connection has unique keys—can't reuse across sessions
-   **Score check location:** The check happens *before* async operations, not atomically with the increment

## Tools Recommended

-   **[Python + asyncio](https://docs.python.org/3/library/asyncio.html)** - For concurrent WebSocket requests
-   **[pycryptodome](https://pycryptodome.readthedocs.io/)** - For AES encryption/decryption
-   **[python-socketio](https://python-socketio.readthedocs.io/)** - WebSocket client library
-   **Browser DevTools** - For initial protocol analysis
-   **[Burp Suite](https://portswigger.net/burp)** - For request interception and analysis

The full exploit code can be found [here](https://github.com/var77/cyhubctf2025/blob/main/candy_crush/exploit/exploit.py)
