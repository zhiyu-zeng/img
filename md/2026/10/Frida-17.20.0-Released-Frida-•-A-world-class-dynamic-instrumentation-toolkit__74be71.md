---
title: Frida 17.20.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/02/frida-17-20-0-released/
source_host: frida.re
clip_date: 2026-10-02T22:43:14+08:00
trace_id: 8ab6290a-f59e-4ede-b2ce-fa75d04f5f8a
content_hash: 6c115f96947144106eef8020da4ad464c6d79e04a76f5b8af2814da3e0e30ecb
status: synced
tags:
  - Frida
  - 安全工具
series: null
feed_source: Frida Releases
ai_summary: Frida 17.20.0 引入 ImHex 的 pattern language（.hexpat），让结构体字段不再靠手写偏移和类型，编译期即可获得类型检查、自动补全与扫描模式。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3ed75244-d011-8118-a493-d7bd1e842284
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.20.0 引入 ImHex 的 pattern language（.hexpat），让结构体字段不再靠手写偏移和类型，编译期即可获得类型检查、自动补全与扫描模式。
> 
> - **核心机制：** Frida.Compiler 用 Go 实现该语言，遇到 `import "./game.hexpat"` 时自动编译并打包进 agent，codegen 完全隐形；同时生成 `.hexpat.d.ts` 声明，字段拼错报编译错误，建议加入 .gitignore。
> - **内存布局：** `#pragma abi native` 让结构体按目标 C 编译器对齐（含 padding，本例 Player.size 为 32 而非 25）；省略则用 ImHex 打包布局。编译器会在编译期算出各 ABI 布局，运行时按进程选择，指针宽度 32/64 位差异无需手工维护。
> - **三种用法：** `Player.at(addr)` 返回直读直写的活视图（嵌套结构与指针同为视图）；`Player.pattern({...})` 用部分字段生成 Memory.scan 匹配模式，其余字段通配；`parse(addr, size)` 支持数组长度依赖字段、条件、visualizer 等完整 ImHex 语义，需给出读取上限。
> - **宿主侧 API：** 新增 frida-core 的 PatternCompiler，供各语言绑定在宿主上解码（返回含地址、偏移、枚举标签、[[format]]/[[color]] 与 visualizer 的树），错误进 diagnostics 而非抛异常；LanguageServer（17.18.0 起）已支持 .hexpat/.pat 的补全、跳转等。
> - **兼容与落地：** ImHex-Patterns 语料 312 个 pattern 中 303 个可直接编译；Luma 新版新增 Patterns 侧栏、hex 视图 "Decode at… as…" 与图像/折线/地图/3D/反汇编等 visualizer 渲染。其他更新包括 NativePointer 读写可带 offset、Darwin 导出前缀通配查询由 35 s 降至 65 ms、arm64 relocator 扫描设界、Android agent 加载崩溃修复等。

## Frida 17.20.0 Released

release

For as long as Frida has existed, dealing with structs has been one of its weak spots. Say you’ve found a *Player* struct in a game, and you want to read its *lives* field. What you’d end up writing is something like:

```javascript
const lives = player.add(4).readU32();
```

That magic *4* is an offset you worked out by hand, *readU32()* is a type you also worked out by hand, and neither is written down anywhere except in that one line. Multiply that by every field of every struct you care about, and you end up with scripts that are brittle, hard to read, and where the layout can’t really be shared with anyone. And if the struct looks different on 32-bit vs. 64-bit, you get to maintain two sets of offsets.

I’ve been pondering this for years. What I really wanted was a typesafe approach, where the TypeScript compiler knows which fields exist and what their types are, so typos get caught at compile time, and the editor can auto-complete field names. It was kind of a given that this would require a codegen step, and that always felt like too much friction to put on users.

But then Frida.Compiler came along. It hasn’t been around since the beginning, but now that it’s here, powering frida-compile, the REPL, and tools like Luma, that codegen step can be made entirely invisible. So that’s what this release is about.

## Patterns

Rather than inventing yet another struct description language, we’ve adopted the [pattern language](https://docs.werwolv.net/pattern-language) from [ImHex](https://imhex.werwolv.net/). It’s a C-like language for describing binary data, originally created for ImHex’s hex editor, with structs, unions, enums, bitfields, pointers, conditionals, dynamically sized arrays, and a standard library. There’s an [ImHex-Patterns](https://github.com/WerWolv/ImHex-Patterns) repository full of patterns for common file formats, and the language has since been adopted elsewhere, too: x64dbg supports it through the [DataExplorer](https://github.com/x64dbg/DataExplorer) plugin, and radare2 through [r2hexpat](https://github.com/radareorg/r2hexpat). So chances are you’ll find existing patterns you can reuse, and the patterns you write for Frida are useful in those tools as well.

Frida 17.20.0 implements this language in Frida.Compiler, in Go, right next to the TypeScript compiler. Let’s take it for a spin. Here’s *game.hexpat*:

```cpp
#pragma abi native

struct Player {
    u32 health;
    u32 lives;
    Role role;
    Vec3 position;
    Player* next;
};

struct Vec3 {
    float x;
    float y;
    float z;
};

enum Role : u8 {
    Warrior,
    Mage,
    Rogue,
};
```

If you’ve written a C struct you already know how to read this. The one thing that stands out is *#pragma abi native*, which we’ll get back to in a moment.

From *agent.ts* we then import the pattern as if it were any other module:

```typescript
import { Player, Role } from "./game.hexpat";

const roster = Memory.alloc(Player.size * 3);

const alice = Player.at(roster);
alice.health = 100;
alice.lives = 3;
alice.role = Role.Mage;
alice.position.x = 1.5;
alice.position.y = -2;
alice.position.z = 3;

const bob = Player.at(roster.add(Player.size));
bob.health = 42;
bob.lives = 1;
bob.role = Role.Warrior;
alice.next = bob;

const carol = Player.at(roster.add(Player.size * 2));
carol.health = 100;
carol.lives = 3;
carol.role = Role.Rogue;
bob.next = carol;

console.log("Player.size:", Player.size);
console.log(JSON.stringify(alice, null, 2));
console.log("alice.next.next.role:", Role[alice.next!.next!.role]);
```

In a real-world scenario the game would obviously own these structs, and we’d have found them through Interceptor, memory scanning, or similar. But to keep the example self-contained we allocate three of them ourselves.

Let’s run it:

```bash
$ frida -q -p 0 -l agent.ts
Compiling agent.ts...
Compiled agent.ts (20 ms)
Player.size: 32
{
  "health": 100,
  "lives": 3,
  "role": 1,
  "position": {
    "x": 1.5,
    "y": -2,
    "z": 3
  },
  "next": "0x140cb5bc0"
}
alice.next.next.role: Rogue
```

A few things to note here:

-   Each struct becomes a class. *Player.at(address)* gives you a live view of the memory at that address, where each property reads or writes the underlying memory directly. Nothing is copied, so what you see is always what’s in memory right now.
-   Nested structs like *position* are views too, and pointer fields like *next* give you a view of the pointee, or *null*. Assigning to a pointer field accepts either a view or a NativePointer.
-   Enums become objects with a reverse mapping, so *Role\[alice.role\]* gives you *“Mage”*.
-   *Player.size* is the struct’s size in bytes, and *JSON.stringify()* just works.
-   Nothing was compiled ahead of time. The REPL handed *agent.ts* to Frida.Compiler, which spotted the *.hexpat* import, compiled the pattern to JavaScript, and bundled it with the agent. The same happens if you run *frida-compile agent.ts -o \_agent.js*, where the resulting bundle is self-contained and can be loaded by any of our bindings.

### Native layout

Since the pattern language was designed for file formats, ImHex lays out structs packed, with no padding between fields, as that is what file formats usually look like. Frida on the other hand needs to deal with in-memory structs as well, as laid out by a C compiler, and those are padded to natural alignment. That’s where *#pragma abi native* comes in. It only exists in Frida’s dialect of the language, and tells the compiler to lay out structs the way the target’s C compiler would. In the example above, *role* is a single byte, followed by three bytes of padding so that *position* ends up 4-byte aligned, and *next* ends up 8-byte aligned on a 64-bit process. Hence *Player.size* being 32 rather than 25. Leave the pragma out and you get ImHex’s packed layout, which is what you want when decoding a file format that happens to be mapped into memory.

The generated JavaScript also takes the target’s ABI into account. Pointer fields such as *next* are 8 bytes on a 64-bit process and 4 bytes on a 32-bit one, which shifts the offsets of everything after them, and the alignment rules differ between e.g. 32-bit Windows and 32-bit Linux. Frida.Compiler computes the layouts for all of these at compile time, and the generated code picks the right one at runtime based on the process it ends up in. So a single compiled agent supports any target Frida supports, with no per-architecture offsets to maintain.

### Type-safety

This is the part that I’m most excited about. When Frida.Compiler loads a *.hexpat*, it also generates TypeScript declarations for it, written next to the pattern as *game.hexpat.d.ts*:

```typescript
export declare class Player {
    constructor(address: NativePointer);
    static at(address: NativePointer): Player;
    static readonly size: number;
    static pattern(fields: Player.Fields): string;
    static parse(address: NativePointer, size?: number): Player.Parsed;
    readonly $address: NativePointer;
    readonly $size: number;
    health: number;
    lives: number;
    role: Role;
    readonly position: Vec3;
    get next(): Player | null;
    set next(value: Player | NativePointer | null);
    toJSON(): Player.Values;
}
```

This means the TypeScript compiler knows exactly which fields are available and what their types are. Misspell a field and you get a compile error. Your editor auto-completes field names. Add a *char name\[16\]* to the struct and it shows up as a read-only *string*, and the compiler will tell you if you try to assign to it. (As it told me while writing this post.) Mistakes in the pattern itself are reported with file and line, just like TypeScript errors:

```bash
$ frida-compile agent.ts -o _agent.js
game.hexpat:5:5 - error TS-1: unknown type Badge
compilation failed
```

You may want to add *\*.hexpat.d.ts* to your *.gitignore*, as these get regenerated on every build.

### Scanning

Now for the part that makes this feel like magic. Say we’re looking for a Player with full health and three lives, but we have no idea where in memory it might be. Each generated class has a static *pattern()* method that takes a subset of the fields and produces a match pattern for *Memory.scan()*, with the fields you leave out wildcarded:

```typescript
const pattern = Player.pattern({ health: 100, lives: 3 });
console.log("pattern:", pattern);

for (const { address } of Memory.scanSync(roster, Player.size * 3, pattern)) {
  const p = Player.at(address);
  console.log(`${address}: ${Role[p.role]} with ${p.lives} lives`);
}
```

Which gives us:

```bash
pattern: 64 00 00 00 03 00 00 00 ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ?? ??
0x140cb5ba0: Mage with 3 lives
0x140cb5be0: Rogue with 3 lives
```

Endianness, field offsets, padding: all taken care of. In a real game you’d scan the heap ranges from *Process.enumerateRanges(‘rw-‘)* instead of our little roster, and perhaps throw in an enum value or a nested field to narrow things down, e.g. *Player.pattern({ role: Role.Rogue, position: { z: 3 } })*.

### Beyond the view

The live view covers structs that are plain data, which is most of what you’ll run into inside a process. But the pattern language can do a lot more: arrays sized by earlier fields, conditionals, pointers with custom bases, locals, functions, attributes like *\[\[format\]\]* and *\[\[color\]\]*, the *std* library, and so on. For those there’s *parse()*, which decodes a snapshot of the memory with the full ImHex semantics. Let’s try it on something every process has: the Mach-O header of its main executable. We’ll put this in *macho.hexpat*:

```cpp
#pragma endian little

struct MachO {
    MachHeader header;
    LoadCommand commands[header.ncmds];
};

struct MachHeader {
    u32 magic [[color("FF8800")]];
    CpuType cputype;
    u32 cpusubtype;
    FileType filetype;
    u32 ncmds;
    u32 sizeofcmds;
    u32 flags;
    u32 reserved;
};

struct LoadCommand {
    u32 cmd;
    u32 cmdsize;
    u8 payload[cmdsize - 8] [[sealed]];
};

enum CpuType : u32 {
    X86_64 = 0x01000007,
    ARM64 = 0x0100000C,
};

enum FileType : u32 {
    Object = 1,
    Execute = 2,
    Dylib = 6,
};

MachO macho @ 0x00;
```

Note the lack of *#pragma abi native* here, as this is a file format. Also note the placement at the end, which is how ImHex patterns typically declare what’s at the start of the file. In our case the “file” is a chunk of memory, and a pattern with placements gives us a *parse()* export that decodes them:

```typescript
import { parse, MachHeader, CpuType, FileType } from "./macho.hexpat";

const base = Process.mainModule.base;

const header = MachHeader.at(base);
console.log("magic:", header.magic.toString(16), CpuType[header.cputype],
    FileType[header.filetype]);
console.log("ncmds:", header.ncmds);

const image = parse(base, 4096).macho;
console.log("commands:", image.commands.length);
for (const cmd of image.commands.slice(0, 3)) {
  console.log(`  cmd=0x${cmd.cmd.toString(16)} cmdsize=${cmd.cmdsize}`,
      `@ ${cmd.$address}`);
}
```

```bash
$ frida -q -p 0 -l macho.ts
Compiling macho.ts...
Compiled macho.ts (19 ms)
magic: feedfacf ARM64 Execute
ncmds: 20
commands: 20
  cmd=0x19 cmdsize=72 @ 0x102a64020
  cmd=0x19 cmdsize=312 @ 0x102a64068
  cmd=0x19 cmdsize=152 @ 0x102a641a0
```

The second argument to *parse()* bounds how much memory it may read, which is a good idea when a pattern’s arrays are sized by data you don’t fully trust yet. The result is a tree of plain values, with *$address* and *$size* on each struct, so you know where every piece came from. And *MachHeader.at()* still works alongside it, as a live view, since that struct is plain data.

Patterns can import other patterns, with imports resolved relative to the importing file, and then from *node_modules*, so patterns can be published as npm packages. The *std* library is built in, so *import std.mem;* just works. We run the ImHex-Patterns corpus as part of our test-suite, and 303 of its 312 patterns compile as-is, with the rest depending on ImHex itself, or failing there too. Visualizers, i.e. *hex::visualize()*, are evaluated by the host-side API covered next, and ignored inside agents.

## PatternCompiler

Frida.Compiler takes care of agents, but tools built on top of Frida often want to decode memory on the host side, without injecting any pattern code into the target. For that there’s a new *PatternCompiler* API in frida-core, exposed by all of our language bindings. You hand it a pattern source, and it hands you a *PatternModule* that describes the types the pattern declares, and that can decode a chunk of bytes against any of them. Let’s use it from Python to decode the same Mach-O header we looked at above:

```python
import frida

session = frida.attach(0)
script = session.create_script("""
rpc.exports = {
  mainModule() {
    const { base, name } = Process.mainModule;
    return [name, base.toString()];
  },
  read(address, size) {
    return ptr(address).readByteArray(size);
  },
};
""")
script.load()

name, base = script.exports_sync.main_module()
base = int(base, 16)
data = script.exports_sync.read(base, 4096)

module = frida.PatternCompiler().compile(open("macho.hexpat").read(),
                                         platform="darwin", arch="arm64")
assert len(module.diagnostics) == 0

macho = module.decode("MachO", data, base)
header = macho.fields[0]
print(f"{name} @ {macho.address:#x}")
for field in header.fields:
    print(f"  {field.name:<11} {field.type_name:<10} "
          f"{field.label or field.value!s:<10} {field.color or ''}")
commands = macho.fields[1]
print(f"  {commands.name}: {commands.count} load commands, "
      f"{commands.size} bytes")
```

```bash
$ python3 decode.py
Python @ 0x104ec0000
  magic       le u32     4277009103 FF8800
  cputype     CpuType    ARM64
  cpusubtype  le u32     0
  filetype    FileType   Execute
  ncmds       le u32     20
  sizeofcmds  le u32     1232
  flags       le u32     2097285
  reserved    le u32     0
  commands: 20 load commands, 1232 bytes
```

The decoded tree carries everything a UI needs: the address, offset and size of each value, enum labels, *\[\[format\]\]* output, *\[\[comment\]\]*, *\[\[color\]\]*, and any visualizer the pattern attached to it, along with the visualizer’s evaluated arguments. Rendering is up to the tool. The module also describes the declared types, with their fields, offsets and sizes, so you can build a type browser without decoding anything. Patterns may declare *in* variables, which you supply by name when decoding, and if a pattern attaches a *button* visualizer, *call_function()* lets you press it. Compile errors don’t throw. They end up in *diagnostics*, with line and column, so they can be shown in an editor.

Speaking of editors: the *Frida.LanguageServer* API introduced in 17.18.0 now serves *.hexpat* and *.pat* documents as well, with diagnostics, completion, hover, document symbols, folding ranges, semantic tokens, go-to-definition, and color swatches for *\[\[color\]\]* attributes. Completion knows about the *std* library and the visualizer names. And when you’re writing a TypeScript agent that imports a pattern, completion of its fields comes for free through the generated declarations.

## Luma

All of this is already put to use in [Luma](https://luma.frida.re/), our GUI for Frida, as of its upcoming release. Luma gains a *Patterns* section in the sidebar, where patterns and shared libraries live, with an editor backed by the language server:

![luma-pattern-editor](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0756d8d4e7ebd3a0.png "Luma's pattern editor")

Each file expands to show the types it declares, so you can jump straight to a struct. Hex views, whether from a memory insight or a REPL hexdump, get a “Decode at … as…” context menu, listing the types from your pattern library. Pick one and the bytes light up with a colored outline per field, with a tree next to it showing names, types and values. Clicking a byte selects the field it belongs to, and selecting a field scrolls the hex view to it. Here’s a Mach-O header decoded straight out of a running process:

![luma-pattern-macho](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1574c6749c247aff.png "Mach-O decoded in Luma")

The visualizers are where it gets really fun. The pattern language lets you attach a visualizer to a field, such as an image, a line plot, a 3D model, coordinates on a map, audio samples, a timestamp, a bitfield as a digital signal, or a disassembly, and Luma renders them:

![luma-pattern-image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/065f33ddbc8be8fd.png "An embedded PNG")

![luma-pattern-line-plot](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dce88f7239124810.png "A float array as a line plot")

![luma-pattern-map](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/91af3a3aa4bd899f.png "Coordinates on a map")

![luma-pattern-3d](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/83f8cf4974a60130.png "Vertices and indices as a 3D model")

![luma-pattern-disassembler](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ffe585b836f64bed.png "Bytes as code")

And because Luma’s REPL, custom instruments and tracer hooks are all compiled through Frida.Compiler, they get the same treatment as the agent we wrote above: import a pattern, and you get live views, *pattern()* for scanning, *parse()* for the full language, and completion of the fields while typing.

## EOF

There’s also a bunch of other changes in this release, so definitely check out the changelog below.

Enjoy!

### Changelog

-   compiler: Add ImHex pattern language support. (Covered extensively above.)
-   gumjs: Let NativePointer reads and writes take an optional offset, e.g. *p.readU32(4)*, so a field can be accessed without allocating a NativePointer for its address. This is also what the generated pattern views use under the hood.
-   gumjs: Return the pointer from *writeVolatile()*, for consistency with the other writers.
-   api-resolver: Descend the Darwin export trie when an exports query is a literal prefix followed by a trailing wildcard, such as *exports:\*!pthread\_\**, instead of enumerating every export of every matching module. With 676 modules loaded, 243 such queries went from 35 s to 65 ms. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   swift-api-resolver: Demangle using *swift_demangle()* from libswiftCore, which is always present in Swift processes, instead of libswiftDemangle, which typically isn’t loaded. Also resolve it lazily, so the resolver starts working once libswiftCore gets loaded. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   arm64: Bound the relocator’s reachability scan. Its 1024-byte budget was reset for each block, so the scan would follow branch targets without limit, which on Android made hooking branchy code cost hundreds of milliseconds per target.
-   exceptor: Stop saving the signal mask on each try, which cost a syscall per attempt and wasn’t needed.
-   payload: Fix Android agents crashing on load, caused by the module registry reading */proc/self/auxv* before the libc shim had set up its stdio registries.
-   barebone: Make the macOS Android emulator a first-class target. The shim has been rewritten as a CModule so the hot path runs lock-free, all cores are resumed, registers are pushed straight to the vcpu, trapped debug-register accesses are handled instead of aborting the VM, and idle scheduler hits are filtered natively. Apps can also be enumerated and spawned.
-   barebone: Inject the agent into SMP arm64 Linux, report thread state and registers on Linux, name Linux processes by their cmdline, and keep the arm64 copy off huge pages.
-   linux-kernel-image: Mine kallsyms from 32-bit kernels and arm64 kernels with VA_BITS=48, including Rust symbol names longer than 80 characters.
-   barebone: Fix the build without the Droidy backend, and the 32-bit Arm build.
-   base: Keep Posix types out of the API, so consumers of frida-base no longer need posix.vapi.
-   compiler: Prefer UCRT64 when building with cgo on Windows, probing for the MinGW compiler per flavor.
-   node: Escape reserved words in parameter names, and zero GValues of options constructed from objects.
-   python: Marshal null variants as None.
-   swift: Bind the pattern compiler types, as well as variants, lists and dictionaries. Release owned return values, and declare out params with their C type so UInt64 out params compile on LP64 Linux.
