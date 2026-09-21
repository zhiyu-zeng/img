---
title: "IonStack Part I: Unsound IonBanana Peel in Ion Compiler, Slipping Through Firefox's SpiderMonkey JIT | NebuSec"
source: https://nebusec.ai/research/ionstack-part-1-cve-2026-10702/
source_host: nebusec.ai
clip_date: 2026-09-21T11:44:30+08:00
trace_id: 066f859b-4679-4f34-a1b9-268d14b4665a
content_hash: bb77a6bd39524a0102cff882ff55c90588199e74d28f0d3223ff9180dd06a8b1
status: synced
tags:
  - 漏洞分析
  - 浏览器JIT安全
series: null
feed_source: NebuSec
ai_summary: "`MObjectToIterator` 在 `skipRegistration_` 为真时把别名集声明为纯读，但它实际会为 `length`/`name` 等惰性属性重新分配属性缓冲区，导致 GVN 复用已失效的 `Slots` 指针，形成可用于 Firefox 渲染进程 RCE 的 UAF（CVE-2026-10702）。"
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3e275244-d011-81ed-a38a-f6486b570491
ioc:
  cves:
    - CVE-2026-10702
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> `MObjectToIterator` 在 `skipRegistration_` 为真时把别名集声明为纯读，但它实际会为 `length`/`name` 等惰性属性重新分配属性缓冲区，导致 GVN 复用已失效的 `Slots` 指针，形成可用于 Firefox 渲染进程 RCE 的 UAF（CVE-2026-10702）。
> 
> - **漏洞根源：** `ObjectKeysReplacer` 把未逃逸的 `Object.keys(obj)` 标量替换成 `MObjectToIterator(skipRegistration=true)`，其 `getAliasSet()` 返回 `AliasSet::Load(ObjectFields|Element)`，但该指令会触发 `fun_resolve` 惰性解析并用 `NativeDefineDataProperty` 分配新属性缓冲区，属于写操作，别名模型因此失准。
> - **利用链路：** 先预填满属性缓冲区槽位，`Object.keys` 触发重分配后，函数序言中被 GVN 复用的旧 `MSlots` 指针变成悬垂；继续解析 `Function.name` 即可跨界读回喷堆对象的 Hidden Class 指针，作为 `addrof`，同时可解释为对象指针构造 `fakeobj`。
> - **升级原语：** 以伪造的 `Uint8Array` 对象把越界读升级为 SpiderMonkey 全内存区任意读写。SpiderMonkey 无指针压缩，因此需先做数据泄露。
> - **影响范围：** 可达成 Firefox 渲染进程任意代码执行，作者同时用它攻陷了 Tor Browser；据称这是 Firefox 为 Pwn2Own 紧急修补大批漏洞后首个 SpiderMonkey JIT CVE。
> - **时间线与修复：** 2026-05-20 报告并被 Mozilla 确认与定位，同日完成修复，2026-06-02 在 Firefox 151.0.3 发布；修复方式是把别名集改为按指令单独声明（`alias_set: none` 等）并调整 resume point 的窃取时机，用户应升级到最新 Firefox。

> Despite Anthropic Mythos’s extensive auditing of Firefox, our agent [Nebu](https://nebusec.ai/) still managed to uncover CVE-2026-10702, a subtle SpiderMonkey IonMonkey just-in-time miscompilation that can be exploited to achieve arbitrary code execution in the Firefox renderer process. To our knowledge, this is the first SpiderMonkey JIT CVE after Firefox’s last-minute pre-Pwn2Own update, which fixed a large batch of vulnerabilities. We also used it to pwn Tor Browser, showing that even after heavy auditing, JIT compilers still have plenty of places for a banana peel to hide.

## Background

### SpiderMonkey’s JIT Compiler

Similar to other JavaScript engines used in modern browsers, Firefox’s SpiderMonkey engine employs a multi-tier just-in-time (JIT) compiler. The highest tier is WarpMonkey. This compiler translates JavaScript code into optimized machine code at runtime, significantly improving performance.

#### CacheIR

CacheIR is a simple typed linear intermediate representation (IR) specializing for compiling inline caches. For example, in a JavaScript function,

```javascript
function f(o) {
  return o.x + 1;
}
```

the function may be compiled into bytecode like this:

```plaintext
GetArg 0          ; push argument o
GetProp "x"       ; compute o.x
Int8 1            ; push 1
Add               ; add the two values
Return
```

let’s focus on `JSOp::GetProp` here. In pure js::Interpret, GetProp directly performs the semantic operation:

```cpp
CASE(GetProp) {
  ReservedRooted<Value> lval(&rootValue0, REGS.sp[-1]);
  MutableHandleValue res = REGS.stackHandleAt(-1);
  ReservedRooted<PropertyName*> name(&rootName0, script->getName(REGS.pc));
  if (!GetProperty(cx, lval, name, res)) {
    goto error;
  }
}
END_CASE(GetProp)
```

As the script warms up, `MaybeEnterJit` increments the warm-up counter. Once the Baseline Interpreter threshold is reached, SpiderMonkey creates a `JitScript`, `JitScript` owns an `ICScript`. `ICScript` owns the IC entries and fallback stubs. This is the main bridge between bytecode and CacheIR.

Initially, each IC entry is set to a fallback stub, so for a `GetProp` operation, the IC entry will point to the `GetProp` fallback stub..

```plaintext
ICEntry.firstStub -> GetProp fallback stub
```

For the `GetProp` operation, the Baseline Interpreter will call:

```cpp
bool BaselineCodeGen<Handler>::emit_GetProp() {
    frame.popRegsAndSync(1);

    if (!emitNextIC()) {
        return false;
    }

    frame.push(R0);
    return true;
}
```

the `emitNextIC` function will generate a call to ICStubReg + ICStub::offsetOfStubCode(). If the first IC entry is a fallback stub, it will reach `DoGetPropFallback`, which will attach the CacheIR to this stub. If `o` is an object, the CacheIR can look like this:

```plaintext
GuardToObject        inputId 0
GuardShape           objId 0, shapeOffset 0
LoadFixedSlotResult  objId 0, offsetOffset 8
ReturnFromIC
```

Finally, the IC entry will point to the CacheIR stub:

![CacheIR Stub](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b56f4daa672b972e.png)

![CacheIR Stub](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/72402c3a59a1b67a.png)

The CacheIR stub can form a chain of stubs, so the CacheIR can handle different types of objects.

#### Ion/Warp and MIR

WarpBuilder is the new frontend of the Ion JIT compiler. It compiles the bytecode into MIR (Mid-level Intermediate Representation), and consumes the CacheIR as a source of type information.

As the CacheIR is typed, the WarpBuilder can generate the corresponding MIR instructions directly with type guards, for the bytecode it compiles to MIR with the weaving process. Putting it together, we can have the following diagram:

![WarpBuilder](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed05f18522b5ee76.png)

![WarpBuilder](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a72161ea8827f119.png)

Then the MIR will be optimized and lowered to LIR (Low-level Intermediate Representation), which is then compiled to machine code.

We will then go through the MIR optimization passes that are relevant to this vulnerability.

#### Scalar Replacement

Scalar replacement removes an object allocation when the JIT proves the object does not escape. For example, the following code:

```javascript
function f(a, b) {
  let o = {x: a, y: b};
  return o.x + o.y;
}
```

Normally, the object `o` would be allocated on the heap. However, if the JIT can prove that `o` does not escape the function (i.e., it is not returned or stored in a way that outlives the function call), it can optimize away the allocation and instead keep `x` and `y` as separate scalar values. So the optimized code would look like this:

```javascript
function f(a, b) {
  let x = a;
  let y = b;
  return x + y;
}
```

This is especially useful for short-lived objects that are only used within the function, as it reduces memory allocation overhead and can improve performance, including temporary objects, temporary `Object.keys` arrays.

Scalar Replacement Soundness

Scalar replacement is only sound if the JIT can guarantee that the object does not escape, otherwise, the engine must allocate it.

#### Alias Analysis

One important question in optimization is whether two references can point to the same memory location. This is known as aliasing. Alias analysis is a technique to solve this problem.

In function

```javascript
function f(o) {
  let a = o.x;
  let b = o.x;
  return a + b;
}
```

The two accesses to `o.x` may alias, meaning they may refer to the same memory location. If the JIT can prove that `o` does not change between the two accesses, it can optimize the second access away, reusing the value from the first access.

But in

```javascript
function f(o) {
  let a = o.x;
  g(o);
  let b = o.x;
  return a + b;
}
```

Now if the JIT compiler cannot prove that `g(o)` does not modify `o.x`, it must assume that `g(o)` can have potential side effects that may change anything, including `o`. Therefore, the second access to `o.x` cannot be optimized away, as it may yield a different value than the first access.

In Firefox SpiderMonkey JIT, `AliasSet` is the MIR instruction’s memory-effect summary. Defined in `js/src/jit/MIR.h`, it is basically a bitmask plus a load/store bit:

```cpp
AliasSet::None()
AliasSet::Load(flags)
AliasSet::Store(flags)
```

where flags is one or more memory categories OR’ed together. Some examples here:

```cpp
AliasSet::Load(AliasSet::ObjectFields)
```

means “reads object metadata.”

```cpp
AliasSet::Load(AliasSet::DynamicSlot)
```

means “reads values from dynamic slots.”

```cpp
AliasSet::Store(AliasSet::ObjectFields | AliasSet::DynamicSlot)
```

means “writes/clobbers object metadata and dynamic slot values.”

```cpp
AliasSet::Store(AliasSet::Any)
```

means “unknown side effects; assume it may touch everything.”

#### Global Value Numbering

Global Value Numbering, or GVN, is an optimization pass that removes redundant MIR computations. For example, in simple arithmetic computations like the MIR code:

```plaintext
Add1 = MAdd(a, b)
Add2 = MAdd(a, b)
```

The `Add2` can be congruent to `Add1`. But for memory operations, it will be more complicated. For example, in the following code:

```plaintext
load1 = MLoad(o, "x");
maybe_write_obj();
load2 = MLoad(o, "x");
```

GVN must not replace `load2` with `load1` if `maybe_write_obj()` can modify `o.x`. Therefore, GVN must check the aliasing of the memory operations. This is where the `AliasAnalysis` matters. `AliasAnalysis` can set dependency on instructions. GVN can modify the code based on the aliasing information.

GVN Soundness

To be sound, GVN must not replace a load with a previous load if it can not prove that no intervening instruction can modify the memory being loaded.

## The Vulnerability

We already know that the reordering and removal of several critical instructions are only sound if the JIT optimizer can prove that the target code satisfies certain conditions. But what if the semantic model of the instructions is not fully correct?

### Starting from an innocent example

Let’s start from a JavaScript that looks innocent, without any memory storing operation (at least, in the JavaScript source code).

```javascript
for (let k in obj) {
  console.log(obj.k);
}
```

At the first glance, it looks like a simple for-in loop that iterates over the properties of `obj` and logs their values. There is no explicit memory store operation in this code. If you have the same idea, you now share the same idea with the optimizer! Here we should go through the path of the property access. In fact, not all properties are stored in an object’s slots from the beginning. Let us ask ourselves a question: **How often do you actually use `function.name` and `function.length`?** If your answer is “not often”, you are not alone. In fact, the SpiderMonkey engine does not materialize these properties when creating the objects. Instead, it lazily resolves them when they are first accessed.

Here we take a look at a more interesting path. For normal interpreter/builtin `Object.keys(function)`, since it needs to create the list of keys, it has to access those keys, implying a underlying properties resolution. They will all call into `fun_enumerate` which is the enumerate hook of `JSFunctionClassOps`.

```cpp
static const JSClassOps JSFunctionClassOps = {
    .enumerate = fun_enumerate,
    .resolve = fun_resolve,
    .mayResolve = fun_mayResolve,
    .trace = fun_trace,
};
```

However, in this function we can see that, several properties have special treatment. When resolving `length`, `name` and `prototype` properties, the engine will call into `HasOwnProperty`.

```cpp
static bool fun_enumerate(JSContext* cx, HandleObject obj) {
  MOZ_ASSERT(obj->is<JSFunction>());

  RootedId id(cx);
  bool found;

  if (obj->as<JSFunction>().needsPrototypeProperty()) {
    id = NameToId(cx->names().prototype);
    if (!HasOwnProperty(cx, obj, id, &found)) {
      return false;
    }
  }

  if (!obj->as<JSFunction>().hasResolvedLength()) {
    id = NameToId(cx->names().length);
    if (!HasOwnProperty(cx, obj, id, &found)) {
      return false;
    }
  }

  if (!obj->as<JSFunction>().hasResolvedName()) {
    id = NameToId(cx->names().name);
    if (!HasOwnProperty(cx, obj, id, &found)) {
      return false;
    }
  }

  return true;
}
```

Finally, this call will reach

```cpp
template <AllowGC allowGC,
          LookupResolveMode resolveMode = LookupResolveMode::CheckResolve>
static MOZ_ALWAYS_INLINE bool NativeLookupOwnPropertyInline(
    JSContext* cx, typename MaybeRooted<NativeObject*, allowGC>::HandleType obj,
    typename MaybeRooted<jsid, allowGC>::HandleType id, PropertyResult* propp) {
  // Native objects should should avoid `lookupProperty` hooks, and those that
  // use them should avoid recursively triggering lookup, and those that still
  // violate this guidance are the ModuleEnvironmentObject.
  MOZ_ASSERT_IF(obj->getOpsLookupProperty(),
                obj->template is<ModuleEnvironmentObject>());

  // .........

  // If there is no resolve hook, the property definitely does not exist.
  if (obj->getClass()->getResolve()) {
    if constexpr (!allowGC) {
      return false;
    } else {
      return CallResolveOp(cx, obj, id, propp);
    }
  }

  propp->setNotFound();
  return true;
}
```

If the shape does not contain the property, the lookup function will call the resolve hook. The behavior of the resolve hook is related to the type of objects. For example, if the object is a `JSFunction`, the `CallResolveOp` will call `fun_resolve`.

```cpp
static bool fun_resolve(JSContext* cx, HandleObject obj, HandleId id,
                        bool* resolvedp) {
  if (!id.isAtom()) {
    return true;
  }

  // .........

  bool isLength = id.isAtom(cx->names().length);
  if (isLength || id.isAtom(cx->names().name)) {
    MOZ_ASSERT(!IsInternalFunctionObject(*obj));

    RootedValue v(cx);

    if (isLength) {
        // .........
    }

    if (!NativeDefineDataProperty(cx, fun, id, v,
                                  JSPROP_READONLY | JSPROP_RESOLVING)) {
      return false;
    }
    // .........
  }

  return true;
}
```

The properties `length`, `name` and `prototype` are lazily resolved. The first time they are accessed, the resolve hook will be called to define them with `NativeDefineDataProperty`. Similar to other JavaScript engines, SpiderMonkey uses a properties buffer. What if the current property buffer is full? We definitely need to allocate a new property buffer for the new slot.

Soundness of Optimizations

The soundness of multiple optimizations depends on the correctness of the side effects model of the instructions, including the memory allocation.

The `ObjectKeysReplacer` scalar-replaces an unescaped `Object.keys(obj)` result with an `MObjectToIterator` instruction and sets `skipRegistration_`:

```cpp
bool ObjectKeysReplacer::run(MInstructionIterator& outerIterator) {
  MBasicBlock* startBlock = arr_->block();

  objToIter_ = MObjectToIterator::New(alloc_, objectKeys()->object(), nullptr);
  objToIter_->setSkipRegistration(true);
  arr_->block()->insertBefore(arr_, objToIter_);

  // .........

  if (!graph_.alloc().ensureBallast()) {
    return false;
  }

  return true;
}
```

For the `MObjectToIterator` instruction, the alias set is:

```cpp
AliasSet getAliasSet() const override {
  return skipRegistration_
             ? AliasSet::Load(AliasSet::ObjectFields | AliasSet::Element)
             : AliasSet::Store(AliasSet::Any);
}
```

When `skipRegistration_` is true, the alias set is a load of object fields and elements. However, as we discussed above, the `MObjectToIterator` instruction can allocate a new property buffer, which is not a load operation. This creates a situation where the optimization passes become unsound.

### Exploit the Unsoundness

We now know that, under the conditions discussed above, this optimization is unsound. The next question is how to turn this incorrect optimization into an exploitable vulnerability. Back to the `MObjectToIterator`, we first need to carefully consider what is the side effect of it here. The `MObjectToIterator` instruction can allocate a new property buffer, if we can reuse the old property buffer after the allocation, this can be turn into a use-after-free vulnerability. With this idea in mind, we would like to see a MIR sequence like this:

```cpp
Start#0

# Load some dynamic-slot property before Object.keys
GuardMultipleShapesToOffset
Slots#1 = MSlots(obj)
LoadDynamicSlotFromOffset#2 = MLoadDynamicSlotFromOffset(Slots#1, offset1)

# Scalar-replaced Object.keys(obj)
ObjectToIterator#22 = MObjectToIterator(obj, skipRegistration=true)

# Load another dynamic-slot property after Object.keys
GuardMultipleShapesToOffset#3
Slots#4 = MSlots(obj)
LoadDynamicSlotFromOffset#5 = MLoadDynamicSlotFromOffset(Slots#4, offset2)
```

The two `Slots#1 = MSlots(obj)` and `Slots#4 = MSlots(obj)` all depend on `Start#0`, as the optimizer thinks there is no side effect between them. Therefore, after GVN and elimination, the MIR sequence can be optimized to:

```cpp
Start#0

# Load some dynamic-slot property before Object.keys
GuardMultipleShapesToOffset
Slots#1 = MSlots(obj)
LoadDynamicSlotFromOffset#2 = MLoadDynamicSlotFromOffset(Slots#1, offset1)

# Scalar-replaced Object.keys(obj)
ObjectToIterator#22 = MObjectToIterator(obj, skipRegistration=true)

# Load another dynamic-slot property after Object.keys
GuardMultipleShapesToOffset#3
LoadDynamicSlotFromOffset#5 = MLoadDynamicSlotFromOffset(Slots#1, offset2)
```

however, `Slots#1` is now a dangling pointer after the `MObjectToIterator` instruction.

Dynamic Slots

Similar to other JavaScript engines, SpiderMonkey has inline properties storage and dynamic properties storage, which is a pointer to a property buffer outside of the object.

### Unsoundness to unreal object

As we mentioned in our previous research blog post, we would like to convert the unsoundness into two important primitives: `addrof` and `fakeobj`. The `addrof` primitive allows us to get the memory address of a JavaScript object, while the `fakeobj` primitive allows us to create a JavaScript object at a specific memory address. An intuitive way to achieve this is using a crafted or corrupted array. However, there is no pointer compression in SpiderMonkey (which can make the object pointer more predictable), we need to figure out a way to perform our initial data leak.

Let’s say we pre-fill all slots in the property buffer, as shown in the figure below.

![Property Access](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1e6275fdff8c6a8a.png)

![Property Access](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eca4d913798ffd09.png)

Since `MObjectToIterator` will trigger a lazy property resolution and the property buffer is full, it will allocate a new buffer.

![Property Buffer Reallocation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/44edbc99f0c642ed.png)

![Property Buffer Reallocation](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3514fbdcf18565e1.png)

Since we have 3 lazy properties, the `Function.name` can safely jump over to the nearby spray object and read out the Hidden Class pointer.

Hidden Class

Similar to other JavaScript engines, SpiderMonkey uses a hidden class to represent the shape and type of an object.

Now resolving the `Function.name` property will actually return the Hidden Class pointer to the JavaScript code.

![Stale Buffer Out-of-Bounds Access](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0164758284e75425.png)

![Stale Buffer Out-of-Bounds Access](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/908ff04fd7e6df19.png)

Depending on the sprayed data, it also be interpreted as an object pointer, which can be used to create a fake object. By crafting a fake `Uint8Array` object later, we can expand our arbitrary memory read/write primitive to full memory region in SpiderMonkey.

## Appendix

### Timeline

-   2026-05-20: We reported the vulnerability with exploitation to Mozilla.
-   2026-05-20: Mozilla acknowledged the report and started investigating.
-   2026-05-20: Mozilla identified the root cause and finished the fix.
-   2026-06-02: The fix was released in Firefox 151.0.3.
-   2026-07-21: We published this blog post.

### Mitigation

The alias set of `MObjectToIterator` was refined.

```diff
--- a/js/src/jit/MIR.h
+++ b/js/src/jit/MIR.h
@@ -9348,22 +9348,16 @@ class MObjectToIterator : public MUnaryI
   }

  public:
   NativeIteratorListHead* enumeratorsAddr() const { return enumeratorsAddr_; }
   INSTRUCTION_HEADER(ObjectToIterator)
   TRIVIAL_NEW_WRAPPERS
   NAMED_OPERANDS((0, object))

-  AliasSet getAliasSet() const override {
-    return skipRegistration_
-               ? AliasSet::Load(AliasSet::ObjectFields | AliasSet::Element)
-               : AliasSet::Store(AliasSet::Any);
-  }
-
   bool wantsIndices() const { return wantsIndices_; }
   void setWantsIndices(bool value) { wantsIndices_ = value; }

   bool skipRegistration() const { return skipRegistration_; }
   void setSkipRegistration(bool value) { skipRegistration_ = value; }
 };

 class MPostIntPtrConversion : public MUnaryInstruction,

--- a/js/src/jit/MIROps.yaml
+++ b/js/src/jit/MIROps.yaml
@@ -2370,16 +2370,17 @@
   can_recover: custom
   possibly_calls: true
   generate_lir: true

 - name: ObjectKeysFromIterator
   operands:
     iterator: Object
   result_type: Object
+  alias_set: none
   can_recover: true

 - name: LoadUnboxedScalar
   gen_boilerplate: false

 - name: LoadDataViewElement
   gen_boilerplate: false

--- a/js/src/jit/ScalarReplacement.cpp
+++ b/js/src/jit/ScalarReplacement.cpp
@@ -4113,16 +4113,17 @@ bool ObjectKeysReplacer::escapes(MElemen
   return false;
 }

 bool ObjectKeysReplacer::run(MInstructionIterator& outerIterator) {
   MBasicBlock* startBlock = arr_->block();

   objToIter_ = MObjectToIterator::New(alloc_, objectKeys()->object(), nullptr);
   objToIter_->setSkipRegistration(true);
+  objToIter_->stealResumePoint(arr_);
   arr_->block()->insertBefore(arr_, objToIter_);

   // Iterate over each basic block.
   for (ReversePostorderIterator block = graph_.rpoBegin(startBlock);
        block != graph_.rpoEnd(); block++) {
     if (mir_->shouldCancel("Scalar replacement of Object.keys array object")) {
       return false;
     }
@@ -4147,17 +4148,16 @@ bool ObjectKeysReplacer::run(MInstructio
       }
     }
   }

   assertSuccess();

   auto* forRecovery = MObjectKeysFromIterator::New(alloc_, objToIter_);
   arr_->block()->insertBefore(arr_, forRecovery);
-  forRecovery->stealResumePoint(arr_);
   arr_->replaceAllUsesWith(forRecovery);

   // We need to explicitly discard the instruction since it's marked as
   // effectful and we stole its resume point, which will trip assertion
   // failures later. We can't discard the instruction out from underneath
   // the iterator though, and we can't do the trick where we increment the
   // iterator at the top of the loop because we might discard the *next*
   // instruction, so we do this goofiness.
```

For uses, please update to the latest version of Firefox.

### Acknowledgements

We would like to thank the SpiderMonkey team for their quick response and thorough investigation of this issue.

### Disclosure policy

For all bugs found by [Nebu](https://nebusec.ai/), we follow our standard 90+30 days disclosure policy as described on our [About page](https://nebusec.ai/about/).
