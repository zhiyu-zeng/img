---
title: Frida 17.21.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/02/frida-17-21-0-released/
source_host: frida.re
clip_date: 2026-10-03T03:21:29+08:00
trace_id: a9150f1a-91c0-4be2-a69f-df71f3f4821e
content_hash: 2dd06faebd9b517836ce8bad7e84f40e0c7dec63ed8d328017ecb0251783ff0c
status: synced
tags:
  - Frida
  - iOS逆向
series: null
feed_source: Frida Releases
ai_summary: Frida 17.21.0 让 Swift ApiResolver 能查类型、协议与协议一致性，并把 PatternCompiler 从源码字符串改为按文件路径编译，从而支持 pattern 之间的 import。
ai_summary_style: key-points:weak
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ed75244-d011-815c-b3da-d8035ee187ee
ioc: null
---

> 💡 **AI 总结（key-points:weak）**
>
> Frida 17.21.0 让 Swift ApiResolver 能查类型、协议与协议一致性，并把 PatternCompiler 从源码字符串改为按文件路径编译，从而支持 pattern 之间的 import。
> 
> - **Swift types/protocols 查询：** 新增 `types:*!Swift.Int`、`protocols:*!Swift.Hashable`，按全名匹配名义类型与协议，返回上下文描述符地址；`!` 前为模块名（支持通配），也能匹配嵌套类型如 `Swift.Dictionary.Keys.Iterator`。
> - **Swift conformances 查询：** `conformances:Swift.Int!Swift.*` 查某类型实现了哪些协议，反向 `conformances:*!Swift.Encodable` 可枚举实现该协议的全部类型（大 App 中示例为 3735 个）；由一致性描述符可到 witness table，由上下文描述符可到元数据、字段与方法。
> - **/i 修复：** Swift resolver 此前接受 `/i` 后缀却不生效，本次已修正。
> - **PatternCompiler 改为文件式：** 与 `Compiler.build()` 对齐，传路径（可选项目根，缺省由入口推断）；import 解析顺序为先相对导入文件、再 `node_modules`，与 agent 构建一致。
> - **诊断与类型带文件归属：** 每个类型与诊断都标注声明文件，路径相对项目根，例如 `proj/common.pat:5:1: expected ;`；语言服务器同样支持导入其他标签页未保存缓冲区；Swift 绑定已重新生成。
> - **破坏性变更迁移：** 把 pattern 写入文件并传其路径即可；同时修复相对项目根导致 TypeScript 编译器虚拟文件系统内进程崩溃的问题。

## Frida 17.21.0 Released

release

Two releases in one day? Software is hard, and APIs are harder. But this one is worth it: [@hsorbo](https://twitter.com/hsorbo) has taught the Swift ApiResolver to find types, protocols and protocol conformances, and the new PatternCompiler API has been reshaped to work on files, so patterns can import each other on the host side as well.

## Swift

Frida’s *ApiResolver(‘swift’)* has been around for a while, letting you find Swift functions by their demangled names, with globs. Behind the scenes it walks the Swift metadata that the compiler emits into every Swift binary, which is also where the information about types and protocols lives. Håvard has been hacking on this resolver since 2023, and in 17.20.0 he made it work in a lot more processes by demangling through libswiftCore, which is always present when Swift code is running, instead of libswiftDemangle, which typically isn’t.

With that out of the way, this release adds three new kinds of queries. First, *types:* and *protocols:* match nominal types and protocols by their full name, giving you the address of the context descriptor:

```javascript
const resolver = new ApiResolver('swift');

for (const { name, address } of resolver.enumerateMatches('types:*!Swift.Int'))
  console.log(name, address);

for (const { name, address } of resolver.enumerateMatches('protocols:*!Swift.Hashable'))
  console.log(name, address);
```

```bash
/usr/lib/swift/libswiftCore.dylib!Swift.Int 0x19bf8009c
/usr/lib/swift/libswiftCore.dylib!Swift.Hashable 0x19bf7c490
```

The part before the *!* matches the module, like with the other resolvers, so *types:\*libswiftCore\*!Swift.Dictionary\** narrows things down to a specific library, and finds nested types as well:

```bash
/usr/lib/swift/libswiftCore.dylib!Swift.Dictionary 0x19bf7abe8
/usr/lib/swift/libswiftCore.dylib!Swift.Dictionary.Keys 0x19bf7ac54
/usr/lib/swift/libswiftCore.dylib!Swift.Dictionary.Values 0x19bf7ac90
/usr/lib/swift/libswiftCore.dylib!Swift.Dictionary.Keys.Iterator 0x19bf7accc
/usr/lib/swift/libswiftCore.dylib!Swift.Dictionary.Values.Iterator 0x19bf7ad08
```

Second, *conformances:* matches protocol conformances by type and protocol name, giving you the address of the conformance descriptor. This is the one I’m most excited about, as it answers questions like “which protocols does this type implement?”:

```javascript
for (const { name, address } of resolver.enumerateMatches('conformances:Swift.Int!Swift.*'))
  console.log(name, address);
```

```bash
Swift.Int!Swift.Encodable 0x19bf5f6c4
Swift.Int!Swift.Decodable 0x19bf5f6d4
Swift.Int!Swift.CodingKeyRepresentable 0x19bf5f984
Swift.Int!Swift.CustomReflectable 0x19bf612ec
Swift.Int!Swift._CustomPlaygroundQuickLookable 0x19bf612fc
...
```

And the other way around, “which types implement this protocol?”, which is where it gets interesting in a big app:

```javascript
const encodable = resolver.enumerateMatches('conformances:*!Swift.Encodable');
console.log(encodable.length, 'types conform to Encodable');
for (const { name, address } of encodable.slice(0, 3))
  console.log(name, address);
```

```bash
3735 types conform to Encodable
UIIntelligenceSupport.IntelligenceElement.Axis!Swift.Encodable 0x2a5e0a1c8
UIIntelligenceSupport.IntelligenceElement.Image!Swift.Encodable 0x2a5e0a9d0
UIIntelligenceSupport.IntelligenceElement.CustomAppEntity!Swift.Encodable 0x2a5e0b0e8
```

From the conformance descriptor you can get to the witness table, and from the context descriptor to the type’s metadata, fields and methods. So these are the building blocks for anything that wants to understand a Swift program’s types at runtime, from pretty-printing a value to hooking every type that implements a certain protocol. Expect to see more built on top of them.

He also fixed the */i* suffix, which the Swift resolver accepted but didn’t actually honor. Thanks a lot, Håvard, for all the excellent work on this!

## PatternCompiler

This morning’s release introduced the *PatternCompiler* API, which compiles a pattern on the host and decodes memory against it. It took a source string, which seemed convenient, but meant it had no idea where that source lived, so a pattern could not import anything but the *std* library. That’s fixed now, and the API mirrors *Compiler.build()*: you hand it a path, and optionally a project root, with the latter inferred from the entrypoint when left out. Say we have *proj/player.hexpat*, importing a *Vec3* from *proj/common.pat*:

```cpp
#pragma abi native

import common;

struct Player {
    u32 health;
    Vec3 position;
};
```

Imports resolve exactly like they do when Frida.Compiler builds an agent: relative to the importing file, then from *node_modules*. Each type now tells you which file it was declared in, and so does each diagnostic, with paths relative to the project root, the same way build diagnostics are reported:

```python
import frida

module = frida.PatternCompiler().compile("proj/player.hexpat")
for d in module.diagnostics:
    print(f"{d.file}:{d.line + 1}:{d.character + 1}: {d.message}")
for t in module.types:
    print(f"{t.file}: {t.kind} {t.name}, {t.size} bytes")
```

With a semicolon missing in *common.pat*, that reports:

```bash
proj/common.pat:5:1: expected ;
```

And once fixed:

```bash
proj/common.pat: struct Vec3, 12 bytes
proj/player.hexpat: struct Player, 16 bytes
```

The language server got the same treatment, so a *.hexpat* that imports an unsaved buffer in another tab resolves it, and problems stay attributed to the file they’re in. Our Swift bindings have been regenerated accordingly, and the other bindings pick this up automatically.

This is a breaking change to an API that shipped this morning, so hopefully nobody has built anything on it yet. If you have, the migration is to write your pattern to a file and pass its path.

## EOF

Enjoy!

### Changelog

-   swift-api-resolver: Add *types:* and *protocols:* queries, matching the descriptors in *\__swift5_types*, *\__swift5_types2* and *\__swift5_protos* by full name. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   swift-api-resolver: Add *conformances:* queries, matching *\__swift5_proto* records by type and protocol name. Also make */i* take effect. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   compiler: Compile patterns from files, with imports and includes resolving the way they do in agent builds, and the file of each type and diagnostic named relative to the project root. (Covered above.)
-   compiler: Fix crash on a relative project root, which took down the whole process from inside the TypeScript compiler’s virtual filesystem.
-   swift: Regenerate the PatternCompiler bindings.
