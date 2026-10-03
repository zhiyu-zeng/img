---
title: Frida 17.22.0 Released | Frida • A world-class dynamic instrumentation toolkit
source: https://frida.re/news/2026/10/03/frida-17-22-0-released/
source_host: frida.re
clip_date: 2026-10-03T16:05:19+08:00
trace_id: 7b613fad-213c-42ca-b098-44671f3f8aba
content_hash: f943c6a8470c4573eb03c292536d1caa968bda7f113a7e7ea4896a5d8f176d24
status: synced
tags:
  - Frida
  - 开发工具
series: null
feed_source: Frida Releases
ai_summary: Frida 17.22.0 让 frida-compile 能直接构建 npm 库以共享 pattern，并把 Swift ApiResolver 扩展到 Linux 与 Windows。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ee75244-d011-812f-b794-d10af9600e44
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida 17.22.0 让 frida-compile 能直接构建 npm 库以共享 pattern，并把 Swift ApiResolver 扩展到 Linux 与 Windows。
> 
> - **库构建：** `frida-compile --library lib/index.ts -o dist` 一条命令搞定编译，包内不再需要 typescript、@types/frida-gum 或 tsconfig.json；每个源文件产出一个模块与 `.d.ts`，底层对应 frida-core 的 `Compiler.build_library()` / `Compiler.watch_library()`，所有语言绑定与 frida-tools、npm 均可调用。
> - **pattern 以源码随包发布：** `.hexpat` 不转成生成的 JS，因为生成代码依赖消费者构建提供的运行时，而 pattern 语言接口更稳定，也便于被其他 pattern 和 Luma 等工具导入；消费者在自己的构建中毫秒级编译并缓存。
> - **辅助选项：** `-w` 持续重建，配合 `npm link` 便于迭代；默认输出内联源码的 source map，`-S` 可关闭；报错路径相对项目，出错时不写入任何产物。
> - **Swift ApiResolver：** @hsorbo 实现 Linux 支持——按平台命名 Swift 核心库与元数据段、在无 libsystem_malloc 时改从 C 运行时取 `free()`、demangler 改为按实例保存（因 `dlclose()` 会卸载 libswiftCore）；Windows 支持紧随其后，处理 swiftCore.dll、`.sw5*` 段、经 UCRT 释放，并跳过 swiftrt.obj 的零填充段标记。
> - **其它修复：** gumjs 解析指令操作数时覆盖全部 arm64 向量排列（如 `v0.b[0]`），此前会触发不可达分支并崩溃；windows 修正恰好 8 字符的段名缺 NUL 终止符及段大小（改用加载器可见的虚拟大小）。

## Frida 17.22.0 Released

release

Yesterday’s two releases made patterns a first-class citizen for agents and for tools. This one is about sharing them: frida-compile can now build a library, so a package on npm can ship its patterns alongside its TypeScript, and anyone can import it. We also have [@hsorbo](https://twitter.com/hsorbo) to thank for the Swift ApiResolver now working on Linux, with Windows support landing right behind it.

## Libraries

Say you’ve written a few patterns and some helpers around them, and want to publish them for other agents to use. Up until now that meant running frida-compile once to get the pattern typings, then *tsc* to emit the package, with a *tsconfig.json* carefully matched to how Frida.Compiler resolves imports. Two compilers over the same sources is one too many.

With *frida-compile –library*, Frida.Compiler does the whole job. Here’s *lib/index.ts* in a package that finds players in a game:

```typescript
import { Player } from "./patterns/player.hexpat";

export function findPlayers(range: RangeDetails, health: number): Player[] {
    const pattern = Player.pattern({ health });
    return Memory.scanSync(range.base, range.size, pattern)
        .map(({ address }) => Player.at(address));
}

export function describe(player: Player): string {
    const { x, y, z } = player.position;
    return `health=${player.health} lives=${player.lives} at (${x}, ${y}, ${z})`;
}
```

Next to it sits *lib/patterns/player.hexpat*:

```cpp
#pragma abi native

struct Player {
    u32 health;
    u32 lives;
    Vec3 position;
};

struct Vec3 {
    float x;
    float y;
    float z;
};
```

And that’s all the source there is. The *package.json* needs no *typescript*, no *@types/frida-gum*, and no *tsconfig.json*, only [frida-compile](https://www.npmjs.com/package/frida-compile) from npm:

```json
{
  "name": "frida-module-example",
  "version": "1.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["/dist"],
  "type": "module",
  "scripts": {
    "prepare": "frida-compile --library lib/index.ts -o dist"
  },
  "devDependencies": {
    "frida-compile": "^19.1.0"
  }
}
```

Running that build gives us:

```bash
$ frida-compile --library lib/index.ts -o dist
$ find dist -type f | sort
dist/index.d.ts
dist/index.js
dist/index.js.map
dist/patterns/player.hexpat
dist/patterns/player.hexpat.d.ts
```

One module and one declaration file per source, with the patterns copied alongside and their generated typings next to them. The declarations are exactly what you’d hope for:

```typescript
import { Player } from "./patterns/player.hexpat";
export declare function findPlayers(range: RangeDetails, health: number): Player[];
export declare function describe(player: Player): string;
```

Note that the pattern is shipped as source, and not as the JavaScript that Frida.Compiler turns it into. That’s deliberate: the generated code leans on a runtime that the consumer’s build provides and dedupes across packages, the pattern can be imported by other patterns and by tools such as Luma, and the pattern language is a far more stable interface than our emitted code. The consumer’s Frida.Compiler compiles it as part of their build, in milliseconds, and caches the result.

Which brings us to the consumer. After *npm install frida-module-example*, an agent can use both the helpers and the pattern itself:

```typescript
import { findPlayers, describe } from "frida-module-example";
import { Player } from "frida-module-example/dist/patterns/player.hexpat";

const arena = Memory.alloc(Player.size * 2);
const alice = Player.at(arena);
alice.health = 100;
alice.lives = 3;
alice.position.z = 1.5;

for (const player of findPlayers({ base: arena, size: Player.size * 2 } as RangeDetails, 100))
  console.log(describe(player));
```

```bash
$ frida -q -p 0 -l agent.ts
health=100 lives=3 at (0, 0, 1.5)
```

A few more details:

-   *\-w* keeps the library fresh as you edit, which pairs nicely with *npm link* while iterating on a package together with an app.
-   Source maps are emitted next to each module, with the sources inlined, so consumers get real stack traces without you shipping *lib/*. Pass *\-S* to leave them out.
-   Errors are reported just like for agents, with paths relative to the project, and nothing is written when there are any:

```bash
lib/broken.ts:1:14 - error TS2322: Type 'string' is not assignable to type 'number'.
compilation failed
```

-   The output mirrors your source tree under its common directory, so *lib/index.ts* lands at *dist/index.js*. If your *tsconfig.json* sets *rootDir*, that’s honored instead.
-   This is *Compiler.build_library()* and *Compiler.watch_library()* in frida-core, so it’s available from all of our language bindings, and frida-compile exposes it both in frida-tools and in the npm package.

## Swift

The Swift ApiResolver, which learned to find types, protocols and conformances yesterday, was until now only functional on Apple platforms. It looked for *libswiftCore.dylib*, borrowed *free()* from *libsystem_malloc*, and matched metadata sections by their Mach-O names, so on Linux every query failed with “unsupported Swift runtime”.

Håvard fixed all of that: the resolver now names the Swift core library and the metadata sections per platform, takes *free()* from the C runtime where there is no *libsystem_malloc*, and keeps its demangler per instance, as on Linux a *dlclose()* unmaps *libswiftCore* and a cached pointer could outlive it. He also made our Swift tests actually run on Linux CI, where they had been silently skipping all along, and report skips as skips rather than as passes. Thanks a lot, Håvard!

With that groundwork in place, Windows was a small step: *swiftCore.dll*, the *.sw5\** sections, and freeing demangled names through the UCRT. One Windows quirk worth knowing is that *swiftrt.obj* brackets each metadata section with zeroed start and stop markers, which the resolver now skips. So wherever a Swift runtime is loaded, *new ApiResolver(‘swift’)* and its *functions:*, *types:*, *protocols:* and *conformances:* queries now work the same.

## EOF

Enjoy!

### Changelog

-   compiler: Add library builds, through *Compiler.build_library()* and *Compiler.watch_library()*, exposed as *frida-compile –library*. (Covered above.)
-   swift-api-resolver: Add Linux support, naming the Swift core library and metadata sections per platform, and keeping the demangler per resolver instance. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   swift-api-resolver: Add Windows support, including skipping the zeroed section markers that *swiftrt.obj* emits.
-   swift-api-resolver: Find the Swift toolchain in tests, so they run on GitHub’s Ubuntu runners instead of silently skipping. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   gumjs: Handle every arm64 vector arrangement when parsing instruction operands. Single-lane and narrow arrangements such as *v0.b\[0\]* reached an unreachable default, which crashed the process once assertions were compiled out. Thanks [@hsorbo](https://twitter.com/hsorbo)!
-   windows: Fix section names and sizes. Names of exactly eight characters lack a NUL terminator, and sizes are now the virtual size rather than the file-aligned raw size, as the loader sees them.
-   swift: Regenerate the bindings for library builds.
