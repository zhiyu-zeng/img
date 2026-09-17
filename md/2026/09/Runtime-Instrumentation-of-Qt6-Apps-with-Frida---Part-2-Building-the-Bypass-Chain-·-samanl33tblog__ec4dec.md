---
title: "Runtime Instrumentation of Qt6 Apps with Frida - Part 2: Building the Bypass Chain · samanl33t/blog"
source: https://blog.samanl33t.com/writings/0x0004-frida-on-qt6-part-2/
source_host: blog.samanl33t.com
clip_date: 2026-09-17T13:53:39+08:00
trace_id: 6c5b4212-2405-4a1b-9319-11ac792ceb67
content_hash: 91071ccd6e4848f025278160dfcf06f8aa36bf9b6b3c225531b2ad91a64ecc4c
status: synced
tags:
  - Frida
  - Android逆向
series: null
feed_source: samanl33t·blog
ai_summary: Frida 可复用 Qt6 内部元对象机制，把 `Q_INVOKABLE` 调用与 `Q_PROPERTY` 写入变成绕过链，一次命令同时解除 HackPass 的付费门、TLS 固定与加固。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3de75244-d011-81d2-bbd5-f295c7405d14
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 可复用 Qt6 内部元对象机制，把 `Q_INVOKABLE` 调用与 `Q_PROPERTY` 写入变成绕过链，一次命令同时解除 HackPass 的付费门、TLS 固定与加固。
> 
> - **新增脚本：** `qt-find-by-class.js` 全内存扫描 rw 区中 vtable 落在目标 exe 只读段的 QObject，按 className 匹配（对象不发信号时替代 signal-tap）；`qt-property-write.js` 经 `qt_metacall`（vtable 槽 2、`QMetaObject::Call::WriteProperty=2`）写 Q_PROPERTY。
> - **付费绕过：** `findByClass('PremiumGate')` 拿到地址，`walk` 得本地索引，`callBool(ptr,2,true)` 即 `setPremium(true)`；但服务端每次解锁会重评，属临时提权，可用 `setInterval` 反复翻转。
> - **TLS 绕过：** HackPass 在 `HKCR` 位置持久化 TOFU 指纹（`HKCU\Software\HackPass\tofu`）。先 `Remove-Item ... -Recurse -Force` 清除旧固定，再对 `PinnedNetworkAccessManager` 调 `setAllowTofuLearning(true)`，触发请求即让 Burp 证书被固定。
> - **加固关闭：** `HardeningManager` 暴露 `enabled` 属性，`writeBoolProperty(ptr,0,false)` 即静默反调试/完整性校验；应用只按进程名查 `frida-server.exe`，故 Frida 本身不会被识别。
> - **组合链：** 加载全部辅助脚本后执行 `bypassChain()`，一条命令完成三处绕过并维持整个会话。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c4b9b7f5585122b.jpg)

Contents

In Part 1, we covered visibility - tracing `QString`, `QMetaObject::activate`, walking metaobjects, and triggering `Q_INVOKABLE` methods directly from Frida. In this part, we turn the same primitives into bypasses.

[HackPass](https://blog.samanl33t.com/writings/0x0002-introducing-hackpass/) is again our target.

Two new scripts added to the set:

-   **`qt-find-by-class.js`** - scans rw memory for QObject instances belonging to HackPass classes and returns those whose className matches. Replaces the signal-tap script for when an object never emits a signal (for example `PremiumGate`).
-   **`qt-property-write.js`** - `listProperties(qobj)` + `writeBoolProperty(qobj, idx, value)`. Reaches Q_PROPERTY setters through Qt’s `qt_metacall` at vtable slot 2 - same shape as Part 1’s `qt-invokable-call.js`, just with `QMetaObject::Call::WriteProperty` instead of `InvokeMethod`.

I’ve also added all the scripts to: [github.com/samanL33T/qt-frida-scripts](https://github.com/samanL33T/qt-frida-scripts).

Let’s begin.

## 1\. Enable premium feature without a license

**Problem.** HackPass has premium features (export, plaintext dump, sync) behind a `PremiumGate` bool. The UI never lets the user toggle it directly - it’s set by `LicenseClient` after a server-validated key. Our goal is to call `setPremium(true)` from outside the license workflow.

![HackPass - Premium Feature dsabled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8efa69882e24cae3.png)

HackPass - Premium Feature dsabled

**Solution.** `PremiumGate::setPremium(bool)` is a `Q_INVOKABLE` slot. Part 1’s `callBool()` helper from `qt-invokable-call.js` already knows how to call it - you just need the object pointer and the local method index.

**Why client-side and not via network?** The other obvious path is intercepting the backend’s policy response and flipping `"premium_active": false` to `true` in transit. That works in principle, but HackPass has SSL Certificate pinnning - so it will need the SSL pinning bypass first (We do this in section 2).

**Find PremiumGate** `PremiumGate` is a `Q_OBJECT` like every other instrumented class. Usually we would grab its address from signal-tap script. It won’t work here since signal-tap script requires a signal to be tiggered from the app. Here, the default installation of HackPass has no license and without a license, premium never transitions from `false`, so `premiumChanged` method never gets triggered and signal-tap never picks `PremiumGate` up. (In other scenarios, where the signal can be triggered from the app - signal-tap script will work as it is.)

Instead we will use `qt-find-by-class.js` - it scans rw memory for QObject instances whose vtable lives in HackPass.exe’s read-only section, then checks each one’s className. Since sthis is a full memory scan, please expect some slowness.

```javascript
// qt-find-by-class.js (excerpt)
function looksLikeHpVtable(vtable) {
  if (!inAny(vtable, hpReadOnly)) return false;
  for (let i = 0; i < 6; i++) {
    const slot = vtable.add(i * 8).readPointer();
    if (!inAny(slot, hpExec)) return false;
  }
  return true;
}

globalThis.findByClass = function (className) {
  const matches = [], seen = new Set();
  Process.enumerateRanges({ protection: 'rw-', coalesce: true }).forEach(r => {
    if (r.size > 0x4000000) return;
    const end = r.base.add(r.size).sub(8);
    let p = r.base;
    while (p.compare(end) < 0) {
      const vtable = p.readPointer();
      if (looksLikeHpVtable(vtable) && classNameOf(p) === className
          && !seen.has(p.toString())) {
        seen.add(p.toString()); matches.push(p);
      }
      p = p.add(8);
    }
  });
  return matches;
};
```

**Run.**

```bash
frida -l qt-signal-tap.js -l qt-metaobject-walker.js -l qt-invokable-call.js -l qt-find-by-class.js HackPass.exe
```

After HackPass is up:

```sql
[Local::HackPass.exe]-> findByClass('PremiumGate')
[+] scanned N QObjects, found 1 instance(s) of PremiumGate
  [0] 0x<addr>
[Local::HackPass.exe]-> walk(ptr('0x<addr>'))
[PremiumGate] M methods (own start at abs K):
  ...
  [K+0] (local 0) premiumChanged
  [K+1] (local 1) isPremium
  [K+2] (local 2) setPremium
[Local::HackPass.exe]-> callBool(ptr('0x<addr>'), 2, true)   // setPremium(true)
```

![Frida: find the address of PremiumGate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a9ae9a0890c22627.png)

Frida: find the address of PremiumGate

![Frida: walk the PremiumGate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/980a3c72c9ea75d3.png)

Frida: walk the PremiumGate

![Frida: setPremium(true) on PremiumGate](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e0da309619b76263.png)

Frida: setPremium(true) on PremiumGate

**One caveat - This is temporary premium.** Right after the vault unlocks, HackPass talks to its backend and re-evaluates premium from the server reply. If the server says no, the premium is disabled at the next unlock of the vault. A quick patch is to re-do the flip on each unlock cycle (or schedule a repeating `callBool` on a Frida `setInterval` so the value stays true). Try the permanent premium yourself:)

## 2\. Bypass TLS pinning by exposing its own re-learn switch

**Problem.** Point HackPass at a Burp proxy and the handshake refuses - the app pins the backend’s TLS cert. Signal-tap script shows the network class is `PinnedNetworkAccessManager` + using `procmon` shows it persisting fingerprints to `HKCU\Software\HackPass\tofu`. So this is TOFU pinning: first connection gets the cert hash, every subsequent connection rejects on mismatch.

![HackPass: TLS handshake fails when traffic is routed through Burp](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2933090829740bcc.png)

HackPass: TLS handshake fails when traffic is routed through Burp

**Solution.** `findByClass('PinnedNetworkAccessManager')` and walk it. The walker shows a `Q_INVOKABLE setAllowTofuLearning(bool)` accessor - Set this to true and the next handshake against a host with no stored fingerprint pins whatever cert it sees (Burp’s, in our case).

So, in already running HackPass, the TLS bypass requires two steps:

1.  **Delete already setup cert:** Delete `HKCU\Software\HackPass\tofu`. In wondows, using powershell: `Remove-Item HKCU:\Software\HackPass\tofu -Recurse -Force`. HackPass forgets the original cert.
2.  **In Frida:** Turn TOFU learning on against the live `PinnedNetworkAccessManager` and trigger any backend request. Burp’s cert gets pinned.

After clearing the registry entry and pointing HackPass at Burp:

**Run.**

```bash
frida -l qt-find-by-class.js -l qt-metaobject-walker.js -l qt-invokable-call.js HackPass.exe
```

```sql
[Local::HackPass.exe]-> findByClass('PinnedNetworkAccessManager')
[+] scanned N QObjects, found 1 instance(s) of PinnedNetworkAccessManager
  [0] 0x<addr>
[Local::HackPass.exe]-> walk(ptr('0x<addr>'))
[PinnedNetworkAccessManager] M methods (own start at abs K):
  ...
  [K+0] (local 2) setAllowTofuLearning
  [K+1] (local 3) allowTofuLearning
[Local::HackPass.exe]-> callBool(ptr('0x<addr>'), 2, true)
```

![Frida: walk PinnedNetworkAccessManager to find setAllowTofuLearning](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b4825218101f9eba.png)

Frida: walk PinnedNetworkAccessManager to find setAllowTofuLearning

Now Settings → Test Connection (or any sync action) re-pins to Burp’s cert. From this point on, all backend traffic flows through Burp.

![Burp Suite: HackPass backend traffic flowing through the cleared and re-learned pin](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ac74869fd3b5d0ce.png)

Burp Suite: HackPass backend traffic flowing through the cleared and re-learned pin

## 3\. Defeat hardening through its own off switch

**Problem.** HackPass has a hardening subsystem (anti-debug, integrity checks, suspicious-process scan) that fires from several places. It can be enabled from Settings → Hardening toggle on. After enabling, it can be confirmed by running and attaching a debugger - as soon as the debugger is detected, the vault locks and does not accept any password including the real password.

![HackPass: vault refuses to unlock with hardening on and a debugger present](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cdb8a9edf091d039.png)

HackPass: vault refuses to unlock with hardening on and a debugger present

(For Frida/runtime hooking checks, the app only looks for processes like `frida-server.exe` on windows, which automatically get bypassed since frida uses `Frida` as process name instead. This allows us to use Frida to hook)

**Solution.** Find the manager via `findByClass`, walk it, and look at what’s reachable. The walker shows a `Q_PROPERTY` named `enabled` - and Q_PROPERTY writes go through `qt_metacall` at vtable slot 2 with `QMetaObject::Call::WriteProperty` (the constant `2`). Set `enabled` to `false` and the subsystem goes silent. The toggle is the bypass.

**Run.**

```bash
frida -l qt-find-by-class.js -l qt-metaobject-walker.js -l qt-property-write.js HackPass.exe
```

After HackPass is up (toggle Settings → Hardening on in the UI, so that `HardeningManager` is alive):

```php
[Local::HackPass.exe]-> findByClass('HardeningManager')
[+] scanned N QObjects, found 1 instance(s) of HardeningManager
  [0] 0x<addr>
[Local::HackPass.exe]-> listProperties(ptr('0x<addr>'))
[HardeningManager] 1 own properties (use local index with writeBoolProperty):
  [0] enabled
[
    {
        "localIndex": 0,
        "name": "enabled"
    }
]
[Local::HackPass.exe]-> writeBoolProperty(ptr('0x<addr>'), 0, false)
```

We use `qt-property-write.js` here.

```javascript
// qt-property-write.js (excerpt)
function qtMetacall(qobj) {
  const vtable = qobj.readPointer();
  const fnPtr  = vtable.add(16).readPointer();
  return new NativeFunction(fnPtr, 'int', ['pointer', 'int', 'int', 'pointer']);
}

globalThis.writeBoolProperty = function (qobj, localIdx, value) {
  const mo        = virtualMetaObject(qobj);
  const globalIdx = propertyOffsetOf(mo) + localIdx;
  const fn   = qtMetacall(qobj);
  const buf  = Memory.alloc(1); buf.writeU8(value ? 1 : 0);
  const argv = Memory.alloc(8); argv.writePointer(buf);
  fn(qobj, 2, globalIdx, argv);
};
```

![Frida console: writeBoolProperty(hardeningMgr, 0, false) disables HardeningManager via qt\_metacall WriteProperty](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/493356d694e7ae5d.png)

Frida console: writeBoolProperty(hardeningMgr, 0, false) disables HardeningManager via qt_metacall WriteProperty

![Frida console: writeBoolProperty disables hardening; vault unlocks cleanly](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/51be1a6faa2d33b4.png)

Frida console: writeBoolProperty disables hardening; vault unlocks cleanly

## 4\. Compose the chain end-to-end

The whole chain of bypasses can be set in one go with `qt-hackpass-bypass-chain.js`. After enabling Hardening in Settings and clearing the TOFU store (`Remove-Item HKCU:\Software\HackPass\tofu -Recurse -Force`), load the chain script alongside the other helpers:

```bash
frida -l qt-find-by-class.js -l qt-metaobject-walker.js -l qt-invokable-call.js -l qt-property-write.js -l qt-hackpass-bypass-chain.js HackPass.exe
```

In Frida:

```
[Local::HackPass.exe]-> bypassChain()
```

That disables HardeningManager, flips PremiumGate to premium, and arms TOFU re-learn on PinnedNetworkAccessManager - one command, three bypasses live for the session.

![Frida + HackPass + Burp: full chain landed end-to-end](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ab0f4b8230b8e002.png)

Frida + HackPass + Burp: full chain landed end-to-end

HackPass has plenty more to offer - capturing the master AES key, exploiting the GCM IV reuse, decrypting stored credentials offline, and so on. Some of those don’t need Qt-specific instrumentation (for example, the OpenSSL boundary is reachable from any libcrypto-using app). They’re left as exercises for the reader.

## References

**Qt6**

-   [`Q_INVOKABLE`](https://doc.qt.io/qt-6/qobject.html#Q_INVOKABLE) - what makes `PremiumGate::setPremium` reachable from outside
-   [`QNetworkAccessManager`](https://doc.qt.io/qt-6/qnetworkaccessmanager.html) - the class HackPass’s `PinnedNetworkAccessManager` extends
-   [`QSslError`](https://doc.qt.io/qt-6/qsslerror.html) - the signal `sslErrors` carries when pinning fails
