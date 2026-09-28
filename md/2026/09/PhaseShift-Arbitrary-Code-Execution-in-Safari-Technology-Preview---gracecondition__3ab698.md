---
title: "PhaseShift: Arbitrary Code Execution in Safari Technology Preview - gracecondition"
source: https://gracecondition.github.io/posts/phaseshift/
source_host: gracecondition.github.io
clip_date: 2026-09-28T23:59:14+08:00
trace_id: 6ce88f07-773a-458a-94fd-c41798fe05d5
content_hash: 300219cc492367476afda67a42af14da48763490b8a18922555c9a6a6b711c00
status: synced
tags:
  - 漏洞分析
  - iOS逆向
series: null
feed_source: gracecondition·Apple/XNU
ai_summary: 作者串联 JavaScriptCore 跨 realm 的 DFG 优化缺陷与 dyld 的 Quadrature 校验缺失，在 Safari Technology Preview 的 arm64e 上实现 WebContent 内任意读写与认证原生调用，最终读 `/etc/passwd`（非沙箱逃逸）。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e975244-d011-81e8-bf5b-e374b139dcc4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 作者串联 JavaScriptCore 跨 realm 的 DFG 优化缺陷与 dyld 的 Quadrature 校验缺失，在 Safari Technology Preview 的 arm64e 上实现 WebContent 内任意读写与认证原生调用，最终读 `/etc/passwd`（非沙箱逃逸）。
> 
> - **JSC 根因：** 抽象解释器用 `Spread` 节点的 realm 证明 `Set` 展开安全，Fixup 却按 `child1` 的 realm 装 watchpoint；跨 realm 内联时二者不一致，改 realm A 的 `Symbol.iterator` 不触发 realm B 的 watchpoint，`CheckStructure` 被错误折叠。
> - **原语构建：** 攻击者迭代器把 `ArrayWithDouble` 转成 `ArrayWithContiguous`，残留的 Double 模式读写给出 `addrof`/`fakeobj`；再用真实对象 out-of-line 存储中的假 `JSArray` 与假对象（butterfly 指向 target+16）实现任意地址 8 字节读写。
> - **Quadrature：** `Loader::applyFunctionVariantFixups()` 不校验 `InternalFixup` 的 `segIndex`/`segOffset`（可越界近 4 GB、写只读/可执行段），把 dyld 变成 PAC 签名 oracle，为选定的 selector stub 签名并写入受控地址。
> - **加载窗口：** 释放 worker 的 `ImageBitmap` 加载 TextToSpeech，重定向 bundle 到 introspection `libdispatch`，借 WebCore DOM wrapper map 让新镜像 `__LINKEDIT` 可写，在 dyld 应用 fixup 前篡改变体表。
> - **修复与配置：** Apple 提交 `51a07f95fdd2`（WebKit bug 321705）统一改用 `child1` 的 realm，并新增 `FunctionVariantFixups::valid()` 校验段索引与大小；PoC 适用 Safari TP 27.0（21626.1.1）/ macOS 26.6.2（25G83）/ arm64e。

> The bug was only present in a beta version of Safari. PoC here: [https://github.com/gracecondition/PhaseShift](https://github.com/gracecondition/PhaseShift)

## Why browsers

After DirtySlide, I wanted to try something new, so I picked browsers. They are a common entry point, and their JavaScript engines depend on compiler assumptions staying correct.

This post chains two bugs. A JIT bug in JavaScriptCore (JSC), the engine in WebKit and Safari, gives memory read and write inside WebContent. A dyld bug I call Quadrature turns that access into authenticated native calls on arm64e.

The proof reads `/etc/passwd` through Foundation and returns it to JavaScript. It stays inside WebContent and is not a sandbox escape.

## How JIT bugs become memory corruption

I first looked for familiar C and C++ bugs: bounds errors, stale pointers, and lifetime mistakes. That missed the more useful target:

> Do not start with memory corruption. Find a false compiler assumption that makes a later access unsafe.

JavaScript values change type at runtime. An array can start with doubles and later hold objects. JSC specializes hot code around observed types and guards each assumption. A failed guard causes an OSR exit to a safer tier:

1.  The interpreter profiles a function.
2.  Baseline JIT compiles warm code.
3.  DFG specializes hot code from those profiles.
4.  Guards protect its assumptions.
5.  A failed guard exits optimized code.

Bugs appear when the proof and guard disagree. If DFG proves a fact under one model but guards it under another, it may remove a required check.

Here, DFG kept an array-structure proof across a `Set` spread because it thought no attacker code could run. The protecting watchpoint watched the wrong realm. A custom iterator changed the array’s storage type, but optimized code kept using the stale type.

## The JavaScriptCore bug

## What is a JavaScript realm?

When JavaScript runs in a page, the browser gives it built-in objects such as `window`, `Array`, `Set`, and `Object`. That collection of built-ins is called a realm. An iframe gets a separate collection, so the page’s `Set` and the iframe’s `Set` are different objects.

A same-origin iframe can still receive live objects from the page:

```javascript
const frame = document.createElement("iframe");
document.body.appendChild(frame);

const setFromPage = new Set();
frame.contentWindow.shared = setFromPage;

frame.contentWindow.Set === window.Set;       // false: separate realms
frame.contentWindow.shared === setFromPage;  // true: same live object
```

The iframe has its own `Set`, but it can hold a `Set` created by the page. PhaseShift uses exactly that setup: a function from the iframe returns the page’s `Set`. JSC proves the spread using one realm and installs the watchpoint on the other.

### Where the realms diverge

`DFGAbstractInterpreterInlines.h` handles `Spread` as shown in Figure 1.

```cpp
case Spread:
    switch (node->child1()->op()) {
    case PhantomNewArrayBuffer:
    case PhantomCreateRest:
        break;
    default:
        if (!m_graph.canDoFastSpread(node, forNode(node->child1()))) {
            if (node->child1().useKind() == SetObjectUse) {
                bool canFold = false;
                JSGlobalObject* globalObject =
                    m_graph.globalObjectFor(node->origin.semantic);
                if (Structure* originalSetStructure =
                        globalObject->setStructureConcurrently()) {
                    if (forNode(node->child1()).m_structure.isSubsetOf(
                            RegisteredStructureSet(
                                m_graph.registerStructure(originalSetStructure))))
                        canFold = true;
                }
                if (canFold)
                    didFoldClobberWorld();
                else
                    clobberWorld();
            } else
                clobberWorld();
        } else
            didFoldClobberWorld();
        break;
    }
```

**Figure 1.** The abstract interpreter uses the `Spread` node’s realm instead of `child1` ’s realm, so its proof can be protected by a watchpoint from a different realm.

`clobberWorld()` drops structure proofs and other cached facts. `didFoldClobberWorld()` keeps them after proving the clobber unnecessary, which is safe only if the spread cannot call user JavaScript.

The source assumes that changing `Set.prototype[Symbol.iterator]` invalidates compiled code through a watchpoint installed by Fixup:

```cpp
else if (node->child1()->shouldSpeculateSetObject()
    && m_graph.isWatchingSetIteratorProtocolWatchpoint(
        node->child1().node())
    && m_graph.isWatchingHavingABadTimeWatchpoint(
        node->child1().node()))
    fixEdge<SetObjectUse>(node->child1());
```

The helper resolves the realm from the node it receives:

```cpp
bool isWatchingSetIteratorProtocolWatchpoint(Node* node)
{
    JSGlobalObject* globalObject =
        globalObjectFor(node->origin.semantic);
    InlineWatchpointSet& set =
        globalObject->setIteratorProtocolWatchpointSet();
    return isWatchingGlobalObjectWatchpoint(
        globalObject,
        set,
        LinkerIR::Type::SetIteratorProtocolWatchpointSet);
}
```

The abstract interpreter resolves `node->origin.semantic`, the `Spread` node’s origin. Fixup resolves `node->child1()->origin.semantic`, the operand’s origin. Same-realm code maps both to one `JSGlobalObject`; cross-realm inlining may not.

Array spread avoids this mismatch by using `child1` ’s origin and checking that each structure belongs to that realm:

```cpp
JSGlobalObject* globalObject =
    globalObjectFor(node->child1()->origin.semantic);

value.m_structure.forEach([&] (RegisteredStructure structure) {
    allGood &= structure->realm() == globalObject
        && structure->hasMonoProto()
        && structure->storedPrototype() == arrayPrototype
        && !structure->isDictionary()
        && structure->getConcurrently(
            m_vm.propertyNames->iteratorSymbol.impl()) == invalidOffset
        && !structure->mayInterceptIndexedAccesses();
});
```

The affected `Set` path did neither of those things.

flowchart TD spread\["same Spread operation"\] spread --> ai\["abstract interpreter  
proves against realm A"\] spread --> fixup\["FixupPhase  
watches realm B"\] ai --> mismatch\["the realms do not match"\] fixup --> mismatch mismatch --> change\["realm A iterator changes"\] change --> miss\["realm B watchpoint does not fire"\] miss --> removed\["stale proof survives  
CheckStructure is removed"\] style mismatch fill:#5a4412,stroke:#ffb000,color:#ffe9b0 style miss fill:#5a4412,stroke:#ffb000,color:#ffe9b0 style removed fill:#5a1414,stroke:#ff5a5a,color:#ffd7d7

The exploit creates a realm A `Set` and a realm B helper that returns it:

```javascript
const setA = new Set();
const realmB = frame.contentWindow;
realmB.__injectedSet = setA;

// This function is compiled in realm B but returns a Set from realm A.
realmB.eval(`
    const K = globalThis.__injectedSet;
    globalThis.innerB = function innerB() { return K; };
`);

window.innerB = realmB.innerB;
```

A realm A function performs the vulnerable spread:

```javascript
function leaker(arr) {
    const x = arr[0];
    const ignored = [...innerB()];
    return arr[0] + x * 0.0;
}
```

After inlining, the `Spread` node retains realm A while its child carries realm B. The returned `Set`, its structure, and its iterator still belong to realm A. The abstract interpreter proves against realm A, but Fixup watches realm B.

Replacing realm A’s iterator therefore misses realm B’s watchpoint. Optimized code survives and calls the new iterator. In the same-realm control, both phases select one watchpoint; the mutation jettisons optimized code before any stale access.

## Apple’s fix to JavaScriptCore

On September 21, Apple landed [WebKit commit `51a07f95fdd2`](https://github.com/WebKit/WebKit/commit/51a07f95fdd21e0081de695b946f55bb80a92090), *"\[JSC\] Fix cross-realm DFG Set spread optimization"*, under [WebKit bug 321705](https://bugs.webkit.org/show_bug.cgi?id=321705). The fix makes the optimization use the operand’s realm everywhere:

```diff
-JSGlobalObject* globalObject = m_graph.globalObjectFor(node->origin.semantic);
+JSGlobalObject* globalObject = m_graph.globalObjectFor(node->child1()->origin.semantic);
```

This aligns the structure proof with the watchpoint armed by Fixup. Apple made the same correction in DFG code generation and FTL lowering, then added `spread-set-cross-realm-symbol-iterator-side-effects.js` as a regression test.

## From realm mismatch to type confusion

JSC specializes array storage by content:

-   `ArrayWithDouble` stores raw, unboxed IEEE-754 doubles.
-   `ArrayWithContiguous` stores boxed `JSValue` s, including object pointers.

Storing an object in a double array converts it to contiguous storage. My iterator triggers that conversion during the spread:

```javascript
let mode = 0;
let victim = null;
let payload = null;

const originalIterator = Set.prototype[Symbol.iterator];
const done = { done: true, value: undefined };

Set.prototype[Symbol.iterator] = function () {
    if (mode === 1)
        victim[0] = payload;
    return { next() { return done; } };
};
```

DFG has already proved that `arr` is `ArrayWithDouble`. It may retain that proof only when the built-in iterator is protected by the correct watchpoint. The realm mismatch keeps the proof even though the attacker iterator runs.

The iterator writes an object at `victim[0]`, converting the array to `ArrayWithContiguous`. Constant folding removed `CheckStructure`, so the optimized access still uses Double mode.

Before folding:

```text
CheckStructure(victim, [ArrayWithDouble])
GetByVal(victim, 0, mode=Double)
```

After folding:

```text
GetButterfly(victim)
GetByVal(victim, 0, mode=Double)
```

The slot now holds a boxed object pointer, but the generated load reads its bits as a double. Reversing the confusion writes double bits into a boxed slot. Those operations give `addrof` and `fakeobj`.

flowchart TD start\["victim · ArrayWithDouble  
raw unboxed doubles"\] start --> proof\["DFG proves Double mode"\] start --> iterator\["spread calls attacker iterator"\] proof --> removed\["CheckStructure folded away"\] iterator --> store\["iterator stores an object"\] store --> converted\["runtime converts victim  
to ArrayWithContiguous"\] removed --> stale\["optimized code still uses Double mode"\] converted --> stale stale --> read\["load boxed object bits as a double  
addrof(object)"\] stale --> write\["store double bits as a boxed value  
fakeobj(address)"\] style converted fill:#5a4412,stroke:#ffb000,color:#ffe9b0 style stale fill:#5a1414,stroke:#ff5a5a,color:#ffd7d7 style read fill:#14401e,stroke:#4ad06a,color:#cdf5d6 style write fill:#14401e,stroke:#4ad06a,color:#cdf5d6

## Building addrof and fakeobj

`addrof(object)` converts an object reference into its raw 64-bit `JSValue` bits without dereferencing an attacker-selected pointer. `fakeobj(address)` treats chosen bits as a cell pointer and returns a reference to it. Together they expose a fake JSC cell, but not yet arbitrary read and write: its fields must still describe a valid layout.

The two primitives use the confusion in opposite directions. For `addrof`, I warm this function:

```javascript
function leaker(arr) {
    const x = arr[0];
    const ignored = [...innerB()];
    return arr[0] + x * 0.0;
}
```

After DFG compiles it, the iterator puts the target object into a fresh double array, converting it to contiguous storage. The stale double load returns the boxed pointer bits as a number. A shared `Float64Array` and `Uint32Array` split the address into two 32-bit halves.

`fakeobj` mirrors the operation:

```javascript
function planter(arr, value) {
    const x = arr[0];
    const ignored = [...innerB()];
    arr[0] = value;
    return x;
}
```

The iterator converts the array, then the stale double store writes supplied bits into a boxed slot. Reading that slot normally returns a reference to the chosen address.

The first conversion changes the allocation profile. That site may then create contiguous arrays directly, removing the required transition. For repeatability, I regenerate the vulnerable function and allocation site with `new Function` for each use and build victims with `push`. Array literals use a copy-on-write double layout on this build.

### From fake cells to arbitrary read and write

A fake typed array does not work because Gigacage confines `JSArrayBufferView::m_vector`. A normal `JSArray` is better: its butterfly pointer is uncaged and addresses indexed elements and out-of-line properties. An `IndexingHeader` immediately before it supplies the lengths used by indexed access.

I place two fake cells in a real object’s out-of-line storage:

-   an `ArrayWithDouble` whose butterfly can reach process memory;
-   a plain object with an optimized property named `x`.

The fake array writes `target + 16` into the fake object’s butterfly. The optimized `object.x = value` path then stores at `target`; the matching read returns that word as a `JSValue`, which the original confusion converts to raw bits.

This gives arbitrary-address 8-byte reads and writes for values that survive JSC’s number encoding. Impure NaNs are canonicalized, so the PoC covers those values with overlapping unaligned writes that preserve neighboring bytes.

flowchart TD primitives\["addrof + fakeobj"\] --> storage\["real object with controllable  
out-of-line storage"\] storage --> fakeArray\["fake ArrayWithDouble"\] storage --> fakeObject\["fake plain object"\] fakeArray -->|"writer"| overwrite\["overwrite the fake object's  
butterfly slot"\] fakeObject -->|"destination field"| overwrite target\["target address + 16"\] -->|"pointer value"| overwrite overwrite --> access\["optimized fakeObject.x  
read or write"\] access --> word\["8-byte word at target"\] word --> rw\["arbitrary-address read / write"\] style fakeArray fill:#5a4412,stroke:#ffb000,color:#ffe9b0 style fakeObject fill:#5a4412,stroke:#ffb000,color:#ffe9b0 style overwrite fill:#5a1414,stroke:#ff5a5a,color:#ffd7d7 style rw fill:#14401e,stroke:#4ad06a,color:#cdf5d6

I follow `Math.sin` to its `NativeExecutable`, strip the address bits from its signed function pointer, and recover the JavaScriptCore base. A canvas wrapper gives the WebCore base.

I now have WebContent memory read and write, but arm64e authenticates native function pointers before branching. An unsigned or incorrectly signed pointer faults, so I need a valid PAC.

DarkSword’s public analysis suggested making dyld sign the pointer during a real image load. I searched for another loader path where attacker-controlled metadata reached that operation.

## Quadrature: the dyld PAC bypass

PhaseShift supplies arbitrary read/write, while Quadrature provides a signed native function pointer. I found it in `Loader::applyFunctionVariantFixups()`.

A function-variant fixup record is eight bytes:

```cpp
struct InternalFixup
{
    uint32_t segOffset;
    uint32_t segIndex     :  4,
             variantIndex :  8,
             pacAuth      :  1,
             pacAddress   :  1,
             pacKey       :  2,
             pacDiversity : 16;
};
```

This is the code that consumes it:

```cpp
image.functionVariantFixups().forEachFixup(^(InternalFixup fixupInfo) {
    uint64_t bestImplOffset = this->selectFromFunctionVariants(
        diag, state, "<internal>", fixupInfo.variantIndex);
    uintptr_t bestImplAddr =
        (uintptr_t)hdr + (uintptr_t)bestImplOffset;

    uint64_t address =
        hdr->segmentVmAddr(fixupInfo.segIndex)
        + fixupInfo.segOffset
        + slide;
    uintptr_t* loc = (uintptr_t*)address;

#if __has_feature(ptrauth_calls)
    if (fixupInfo.pacAuth)
        bestImplAddr = signPointer(
            bestImplAddr,
            loc,
            fixupInfo.pacAddress,
            fixupInfo.pacDiversity,
            (ptrauth_key)fixupInfo.pacKey);
#endif

    *loc = bestImplAddr;
});
```

**Figure 2.** dyld uses `segIndex` and `segOffset` without checking them, resulting in a pointer-sized store through an unvalidated destination.

Everything used to calculate the destination comes from the fixup record, but the destination is never validated before the store. The same record also controls how the selected implementation pointer is signed.

## Function-variant fixups

Mach-O pointers often cannot be finalized until load time: ASLR moves the image, imports need binding, and arm64e pointers may need signing. Fixup metadata tells dyld how to finish them. Ordinary chained fixups rebase or bind pointer chains.

Function variants let an image ship several implementations while dyld selects one for the current machine. `LC_FUNCTION_VARIANTS` defines the implementation tables; `LC_FUNCTION_VARIANT_FIXUPS` defines the slots that receive selected pointers.

Each `InternalFixup` supplies:

-   the destination segment and offset;
-   which variant table to use;
-   the signing flag, PAC key and diversity, and whether the destination contributes to the discriminator.

For a valid record, dyld selects an implementation, optionally signs it, and writes it to a pointer-sized slot inside the selected writable segment, often a GOT entry. This pass runs after mapping during ordinary fixup application, when dyld knows the image slide and can create authenticated pointers.

## Missing validation

The application loop trusts four things:

1.  `segOffset` is never checked against the segment’s runtime size. Its 32 bits can place the destination almost 4 GB past the segment.
2.  `segIndex` is never checked against the segment count. For an invalid index, `segmentVmAddr()` returns zero instead of rejecting the record.
3.  The destination need not be writable. The store can target read-only or executable mappings.
4.  An error from `selectFromFunctionVariants()` does not stop the loop before it stores `hdr + bestImplOffset`.

Ordinary rebase metadata already receives the missing checks:

```text
segIndex < segmentCount
segOffset <= segmentVmSize(segIndex) - sizeof(uintptr_t)
target segment is writable and not executable
```

Nothing earlier catches the bad record. `FunctionVariantFixups` has no `valid()` method. The load-command checker checks command size, not the referenced blob. General `__LINKEDIT` validation omits function variants and their fixups; `Image::validLinkedit()` separately validates variant tables but not fixup records.

A linker-produced test dylib confirmed the primitive. Apple’s `dyld_info -validate_only` accepted it; dyld then performed an 8-byte write into another segment and, in a second test, 16 MB outside the image.

The written value is not an arbitrary 64-bit constant. It is a selected implementation address, optionally signed. Control of the table and record still chooses a useful code pointer and its destination.

## Apple’s fix to Quadrature

I checked the arm64e dyld from macOS 27.0 (`26A428`). The application loop is unchanged. Apple added a validator and calls it from `Image::validLinkedit()` before applying the records. The new code is effectively:

```cpp
Error FunctionVariantFixups::valid(
    std::span<const MappedSegment> segments) const
{
    for (InternalFixup fixup : _fixups) {
        if (fixup.segIndex >= segments.size())
            return Error(
                "FunctionVariantFixups segIndex=%d exceeds number of segments (%lu)",
                fixup.segIndex, segments.size());

        if (fixup.segOffset >= segments[fixup.segIndex].runtimeSize)
            return Error(
                "FunctionVariantFixups segOffset=0x%08X exceeds segment size (0x%llX)",
                fixup.segOffset, segments[fixup.segIndex].runtimeSize);
    }
    return Error::none();
}
```

**Figure 3.** Apple checks `segIndex` against the number of segments and `segOffset` against the selected segment’s runtime size before applying the fixups.

## Quadrature as a PAC signing oracle

Pointer authentication stores a code in unused pointer bits, derived from the pointer, a hardware key, and a discriminator. An authenticated branch verifies it; using the wrong context faults.

The fixup record controls every exposed signing input:

```cpp
signPointer(
    bestImplAddr,             // selected through variantIndex and the table
    loc,                      // derived from segIndex and segOffset
    fixupInfo.pacAddress,     // whether loc is mixed into the discriminator
    fixupInfo.pacDiversity,   // attacker-controlled 16-bit diversity
    (ptrauth_key)fixupInfo.pacKey);
```

I do not forge or guess PAC. I choose an image-relative implementation and signing context; dyld signs the pointer and stores it.

The selected implementation is an existing Objective-C selector stub. It loads a selector into `x1` and tail-calls the authenticated `objc_msgSend` import. I request instruction-address signing without address diversity, so the result is not tied to dyld’s temporary output slot.

I read the signed pointer and place it in `NativeExecutable::m_function`. JSC expects that slot to be signed, so its normal host-function path authenticates and calls the selector stub.

This is a signing oracle, not a PAC break. The trusted loader signs an attacker-selected code pointer because it trusted unvalidated metadata.

## Creating the first-load window

Two constraints remain. First, I need a non-cache image loaded after gaining read and write: `applyFunctionVariantFixups()` skips cache images, whose metadata is read-only anyway. Second, I must modify the new image’s read-only variant metadata before dyld consumes it.

I use two worker-owned `ImageBitmap` objects. Releasing the first after replacing an `ImageBuffer` field with an Objective-C class pointer enters worker-side framework initialization and loads TextToSpeech. I redirect that bundle’s executable to `/usr/lib/system/introspection/libdispatch.dylib`, reset the speech-loader’s once state, and release the second bitmap. This loads a real, Apple-signed, non-cache image with function-variant metadata.

To make that metadata writable, I abuse WebCore’s DOM wrapper map. Its mutation scope makes the tracked backing writable, then protects whichever backing is current on exit. I point the tracker at the new image’s `__LINKEDIT` page, clear the map, and call `performance.mark()` to allocate a new backing. The tracker moves to the new allocation, so scope exit protects it and leaves `__LINKEDIT` writable.

While the worker remains inside the load, the window polls dyld state. Once dyld publishes the Loader and image base, but before applying function-variant fixups, I:

1.  leave the function-variant page writable;
2.  point the variant entry at the selector stub and set the `InternalFixup` PAC context and canary destination;
3.  wait for `applyFunctionVariantFixups()`, then read the signed pointer;
4.  restore the table, record, bundle, and WebCore tracking state.

### Native call surface

The signed selector stub provides a small Objective-C call surface. A `JSFunction` field supplies the receiver in `x0`, the stub supplies the selector in `x1`, and a second carrier supplies `x2` for one-argument methods. Each call installs the signed pointer temporarily, then restores the original `NativeExecutable` state.

The proof calls `+[NSProcessInfo processInfo]` and `-processIdentifier` for the WebContent PID, then `+[NSData dataWithContentsOfFile:]` with an inline `NSString` for `/etc/passwd`. `-length` and `-bytes` expose the returned buffer, which the raw reader copies into JavaScript.

## The full chain

1.  Realm A creates a `Set`; a same-origin iframe in realm B creates a helper that returns it.
2.  Realm A replaces `Set.prototype[Symbol.iterator]` with a victim-mutating callback.
3.  DFG inlines the helper. Fixup watches realm B while the abstract interpreter proves the spread safe with realm A.
4.  The iterator converts a victim from `ArrayWithDouble` to `ArrayWithContiguous`; the removed `CheckStructure` leaves optimized code in stale Double mode.
5.  Reading a boxed pointer as a double gives `addrof`; writing double bits into boxed storage gives `fakeobj`.
6.  Fake cells in real property storage yield an uncaged-butterfly read/write primitive.
7.  Native traversal leaks the JSC and WebCore image bases and finds the worker context and two `ImageBitmap` objects.
8.  Releasing the first bitmap loads TextToSpeech. The page redirects its bundle to standalone introspection `libdispatch` and resets the loader.
9.  Releasing the second starts the non-cache load. The window sees dyld publish the Loader before variant fixups run.
10.  The WebCore wrapper-map gadget leaves the new image’s `__LINKEDIT` page writable.
11.  During that window, the exploit patches the function-variant table and `InternalFixup`.
12.  Quadrature makes dyld select and sign the selector stub, then write it to the controlled destination.
13.  The pointer moves into `NativeExecutable`; the original pointer and borrowed native state are restored after each call.
14.  Foundation returns the WebContent PID and reads `/etc/passwd`; JavaScript prints the copied bytes.

flowchart LR subgraph JSC\["1 · JavaScriptCore"\] direction TB A\["realm A Set  
\+ realm B helper"\] --> B\["watchpoint and proof  
use different realms"\] B --> C\["iterator changes Double  
array to Contiguous"\] C --> D\["stale optimized  
load and store"\] D --> E\["addrof + fakeobj"\] E --> F\["uncaged butterfly R/W"\] end subgraph LOAD\["2 · First-load window"\] direction TB G\["leak JSC and  
WebCore bases"\] --> H\["worker ImageBitmap  
release"\] H --> I\["load standalone  
introspection libdispatch"\] I --> J\["make first-load LINKEDIT  
page writable"\] end subgraph DYLD\["3 · Quadrature signing oracle"\] direction TB K\["patch variant table  
\+ InternalFixup"\] --> L\["dyld signs selector stub"\] end subgraph NATIVE\["4 · Native call surface"\] direction TB M\["JSC NativeExecutable  
call surface"\] --> N\["NSData reads  
/etc/passwd"\] end JSC --> LOAD --> DYLD --> NATIVE classDef jsc fill:#5a1414,stroke:#ff5a5a,color:#ffd7d7 classDef loader fill:#5a4412,stroke:#ffb000,color:#ffe9b0 classDef dyld fill:#143a5a,stroke:#5aa8ff,color:#d7ecff classDef native fill:#14401e,stroke:#4ad06a,color:#cdf5d6 class A,B,C,D,E,F jsc class G,H,I,J loader class K,L dyld class M,N native

JSC supplies memory access, the loader opens a first-load window, WebCore makes metadata writable, and dyld produces an authenticated function pointer. Each solves a separate constraint.

## Replicate for yourself

The PoC works for the following configuration:

| Component | Tested version |
| --- | --- |
| Browser | Safari Technology Preview 27.0 |
| Browser build | `21626.1.1` |
| macOS | 26.6.2 |
| macOS build | `25G83` |
| Architecture | arm64e |

## Apple’s Response:

I reported this bug to Apple and hit the mother of all report collisions.

![Apple’s WebKit security acknowledgements.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6fd1eddfeebf4d54.png)

Apple’s WebKit security acknowledgements.

For Quadrature, Apple said the following:

![Apple Product Security’s response on the dyld report.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d1b0e3aa37d96d26.png)

Apple Product Security’s response on the dyld report.

Not surprising since the bug was very low hanging fruit and immediately jumped to me whilst doing variant analysis of DarkSword.

## Publication and public tracking

Apple also cleared publication of this writeup:

![Apple Product Security’s response to my publication notice.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8b6aba0813bd3a39.png)

Apple Product Security’s response to my publication notice.

The JavaScriptCore bug is now publicly tracked in WebKit Bugzilla as [bug 321705](https://bugs.webkit.org/show_bug.cgi?id=321705).

![PhaseShift reading /etc/passwd from Safari Technology Preview.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ba3a0fc59b7f86f.gif)

PhaseShift reading /etc/passwd from Safari Technology Preview.
