---
title: 【微信】ART 执行链与 Nterp：解析 FART Android12‑16 失效问题
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619676&idx=1&sn=2c4d3a7a8e4001824f3a0a2f5bc5c8f8
source_host: mp.weixin.qq.com
clip_date: 2026-09-08T19:16:54+08:00
trace_id: 0ca31101-835b-4633-8651-4ffb72914cdc
content_hash: ecc09e5678f189457c5c9cb18eeaf71e238031426defc3f3b19a9e3c59495192
status: synced
tags:
  - 微信
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 公众号·看雪学院
ai_summary: Android 12-16 后 FART 脱壳大面积失效的根因不在工具老化，而是 ArtMethod 执行路径分流、Nterp/AOT/JIT 替代传统 Execute、存储与壳对抗等条件同时改变，需先识别 Entry Point 类型再决定 dump 点。
ai_summary_style: key-points
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 3d575244-d011-81e4-a06a-d2ffd6e05538
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 12-16 后 FART 脱壳大面积失效的根因不在工具老化，而是 ArtMethod 执行路径分流、Nterp/AOT/JIT 替代传统 Execute、存储与壳对抗等条件同时改变，需先识别 Entry Point 类型再决定 dump 点。
> 
> - **核心判断：** ArtMethod 只是入口，主动调用能否脱到 CodeItem 取决于 Entry Point、Invoke 分流路径、壳恢复窗口与观察窗口是否重合、dump 结果能否修复；仅靠打印 ArtMethod 不检查 entry/flag 会盲排。
> - **实例故障：** Android 14 Pixel 7 上加固的 `onCreate` entry 为 `0x70b1c8a000`（即 `art_quick_to_interpreter_bridge`），老 FART 主动调用 CodeItem 不变；加 `--force-interpreter` 后 entry 变 Nterp，但 Nterp 不走老 `Execute`；最终把 dump 点从 `Execute` 上移到 `EnterInterpreterFromInvoke` 才拿到完整 CodeItem。
> - **路径分流：** `ArtMethod::Invoke` 会先判断是否强制解释、有无 quick entry，若有 quick code 则走 `art_quick_invoke_stub` 再跳到 `entry_point_from_quick_compiled_code_`；quick entry 可能是真 AOT/JIT、bridge、Nterp 或 stub，看到 quick entry 就当最终机器码会排错方向。
> - **CodeItem 长度坑：** 不能只按 `sizeof(CodeItem)` 切，需跳过 header、insns、try_item，并解析 LEB128 表示的 `encoded_catch_handler_list`；很多 bin 修回去反编译仍坏，是少算了 handler 段。
> - **实用建议：** 高版本先打 entry、access_flags、是否 native/static 等状态；调用前后 CodeItem 完全不变先查路径别改输出目录；整体 Dex 都未解密前不做全量主动调用，用 `dump/sleep/force/ignore` 配置化缩小范围；修复后用 jadx/baksmali 验收解析。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ea465f9b489debb.jpg)

看雪论坛作者ID：FinSectech

如果你已经拿 FART 脱过壳、或者自己写过主动调用，那这篇应该能直接对上。

前面不废话， 背景尽量压短，后面把 `Invoke` 分流、Nterp、dump 点选择、高版本失效和现在怎么处理写细一点，代码也会多放一些。

先把认为最重要的东西放在这里 以下ArtMethod 只是入口。真正决定主动调用能不能脱到东西的，是这四个问题同时成立：

-   当前方法的 Entry Point 是什么
    
-   `ArtMethod::Invoke`
    
    会不会把你带进能看到 CodeItem 的路径
    
-   壳的恢复窗口和你的观察窗口有没有重合
    
-   dump 到的东西最后能不能修回去
    

FART 早期能打，是因为这四个问题当时相对好对齐。Android 12 之后开始大面积失效，不是单纯工具老了，而是执行路径、结构布局、存储限制、Profile/AOT、壳对抗一起变了。

### 背景只留必要的

`ArtMethod` 里真正关键的是三块：

-   身份：class、method index、access flag
    
-   代码位置：早期靠 `dex_code_item_offset_` ，后面更多走 `DexFile` / `CodeItemDataAccessor`
    
-   执行入口： `entry_point_from_quick_compiled_code_`
    

调用时真正跳出去的，通常是最后一个。

所以会有这种误判：

ArtMethod 找到了，方法也调用了，CodeItem 却还是空的。

不一定是 dump 代码写错，更可能是你看的入口和壳恢复时用的不是同一条路。

`ClassLinker` 负责 load/link/init。很多抽取壳不是 loadClass 后立刻恢复，而是拖到第一次真正执行前。

`DexCache` 则让“文件镜像里的 Dex”和“运行时真正用到的解析结果”可能不一致。所以只 dump 整体 Dex 不够，还得单独拿 CodeItem。

执行后端现在也不单一：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/849b37cf6946964c.png)

还按“禁用 dex2oat 后全部长期解释”来设计方案，在高版本里前提已经不稳。

### Entry Point 比方法名优先看

主动调用前，先看：

```
ArtMethod::GetEntryPointFromQuickCompiledCode()
```

对应到代码里，大致就是：

```
constvoid* ArtMethod::GetEntryPointFromQuickCompiledCode()const{
returnGetEntryPointFromQuickCompiledCodePtrSize(kRuntimePointerSize);
}
// 读的是 ptr_sized_fields_ 里那一项
// EntryPointFromQuickCompiledCodeOffset(pointer_size)
```

这个指针可能是：

AOT/JIT 机器码  
`art_quick_to_interpreter_bridge`  
Nterp 入口  
Generic JNI stub  
Resolution trampoline  
Instrumentation stub

它不是静态常量。 `ClassLinker::LinkCode` 、 `Instrumentation::InitializeMethodsCode` 、JIT 完成、deoptimize，都可能改它。

再叠加这些 flag：

```php
boolArtMethod::HasNterpEntryPointFastPathFlag()const{
constexpruint32_t mask = kAccNative | kAccNterpEntryPointFastPathFlag;
return (GetAccessFlags() & mask) == kAccNterpEntryPointFastPathFlag;
}
voidArtMethod::SetNterpInvokeFastPathFlag(){
AddAccessFlags(kAccNterpInvokeFastPathFlag);
}
```

只打印 `ArtMethod*` 、不看 entry 和 flag，后面很容易盲排。

一个很具体的例子：

在 Android 14 Pixel 7 上，有个被加固的 `onCreate` ，当时打印出来的 entry 是 `0x70b1c8a000` ，反解后落到 `art_quick_to_interpreter_bridge` 。按 FART 老路子主动调用，CodeItem 始终没恢复。

第一反应是 dump 时机不对，或者 `self == nullptr` 那个标记没进分支。后来开了 `--force-interpreter` 再调，entry 切到了 Nterp，以为这次稳了，结果 `Execute` 还是没进——Nterp 不走老 `Execute` 。

最后把 dump 点从 `Execute` 往上提到 `EnterInterpreterFromInvoke` ，才拿到完整 CodeItem。

排查时建议直接把关键信息打全：

```rust
void DumpMethodState(ArtMethod* m) {
LOG(INFO) << "method = " << m->PrettyMethod();
LOG(INFO) << "ArtMethod* = " << m;
LOG(INFO) << "access_flags = 0x" << std::hex << m->GetAccessFlags();
LOG(INFO) << "entry = " << m->GetEntryPointFromQuickCompiledCode();
LOG(INFO) << "is_native = " << m->IsNative();
LOG(INFO) << "is_static = " << m->IsStatic();
}
```

实用判断：

entry 已是编译代码，主动调用大概率碰不到解释器恢复逻辑  
entry 是 bridge，还有空间，但别默认后面一定进老 `Execute`  
entry 变成 Nterp 后，老 `Execute` hook 可能直接失效  
调用前后 CodeItem 完全不变，优先怀疑路径，不先改文件名和输出目录

### ArtMethod::Invoke：真正该啃的主干

#### 主干分流

结合 AOSP 常见实现，主干可以写成：

```cpp
voidArtMethod::Invoke(Thread* self,
uint32_t* args,
uint32_t args_size,
                       JValue* result,
constchar* shorty){
if (UNLIKELY(__builtin_frame_address(0) < self->GetStackEnd())) {
ThrowStackOverflowError(self);
return;
  }
  ManagedStack fragment;
  self->PushManagedStackFragment(&fragment);
  Runtime* runtime = Runtime::Current();
// FART 老插入点大致就在这附近
// if (self == nullptr) {
//   dumpArtMethod(this);
//   return;
// }
if (UNLIKELY(!runtime->IsStarted() ||
               (self->IsForceInterpreter() &&
                !IsNative() &&
                !IsProxyMethod() &&
IsInvokable()) ||
/* debugger / fake-invoke */)) {
if (IsStatic()) {
      art::interpreter::EnterInterpreterFromInvoke(
          self, this, nullptr, args, result, /*stay_in_interpreter=*/true);
    } else {
      mirror::Object* receiver =
reinterpret_cast<StackReference<mirror::Object>*>(&args[0])->AsMirrorPtr();
      art::interpreter::EnterInterpreterFromInvoke(
          self, this, receiver, args + 1, result, /*stay_in_interpreter=*/true);
    }
  } else {
bool have_quick_code = GetEntryPointFromQuickCompiledCode() != nullptr;
if (LIKELY(have_quick_code)) {
if (!IsStatic()) {
        (*art_quick_invoke_stub)(this, args, args_size, self, result, shorty);
      } else {
        (*art_quick_invoke_static_stub)(this, args, args_size, self, result, shorty);
      }
    }
  }
}
```

主要来说有三

1.  会不会强制解释
    
2.  有没有 quick entry
    
3.  quick entry 是真机器码，还是 bridge / nterp / stub
    

FART 早期靠这个标记：

```cpp
extern"C"voidmyfartInvoke(ArtMethod* artmethod)
REQUIRES_SHARED(Locks::mutator_lock_){
  JValue* result = nullptr;
  Thread* self = nullptr;   // 特殊标记
uint32_t temp = 6;
uint32_t* args = &temp;
uint32_t args_size = 6;
  artmethod->Invoke(self, args, args_size, result, "fart");
}
```

早期好用，是因为大多数被抽空方法最终还会掉进可观察的解释路径，Invoke 又足够靠前。

高版本继续只靠这个标记会越来越飘：调用表面上成功，实际执行已经从 quick entry 出去了。

#### EnterInterpreterFromInvoke

进解释器后，更关键的一层其实是这里，不是老的 `Execute` 单点：

```javascript
voidEnterInterpreterFromInvoke(Thread* self,
                                ArtMethod* method,
                                ObjPtr<mirror::Object> receiver,
uint32_t* args,
                                JValue* result,
bool stay_in_interpreter){
// 1. 静态方法可能先 EnsureInitialized
// 2. 构造 ShadowFrame
// 3. 把参数填进 shadow frame
// 4. native -> InterpreterJni
// 5. 非 native -> Execute(...) 或 Nterp 相关入口
}
```

也就是说我们已经知道了

当前 ArtMethod\*方法是否静态  
参数区后续到底会进传统解释，还是被更快的解释后端接走

前面 Pixel 7 那个案子，真正转机不是又找了一个更花哨的 hook，而是 dump 点从 `Execute` 上移到了这一层。

一个可落的插法：

```
void EnterInterpreterFromInvoke(...) {
// 主动调用或强制解释时，先看一眼当前方法状态
  if (/* is_fake_invoke || need_dump */) {
dumpArtMethod(method);
  }
// 原逻辑：建 ShadowFrame、填参、Execute / Nterp / JNI
}
```

这比死钉 `Execute` 更能兜住“已经进解释体系，但不走老 Execute”的情况。

#### Execute

传统 FART 会盯 `Execute` ，原因很多时候：干扰 dex2oat 后，不少方法仍解释执行<clinit> 相对稳定走解释

这里能同时碰到 `ArtMethod` 和当时的 `CodeItem`

老插法通常是：

```rust
staticinline JValue Execute(Thread* self,
const DexFile::CodeItem* code_item,
                             ShadowFrame& shadow_frame,
                             JValue result_register,
bool stay_in_interpreter = false){
  ArtMethod* method = shadow_frame.GetMethod();
if (strstr(method->PrettyMethod().c_str(), "<clinit>") != nullptr) {
dumpDexFileByExecute(method);
  }
// 原解释逻辑
// switch interpreter / mterp ...
}
```

整体 Dex dump 也可以放在这附近：

```rust
voiddumpDexFileByExecute(ArtMethod* artmethod){
const DexFile* dex_file = artmethod->GetDexFile();
constuint8_t* begin = dex_file->Begin();
size_t size = dex_file->Size();
// 写 begin ~ begin+size
// 再顺手把 class list 打出来
}
```

但 Nterp 把“解释执行 = 进旧 Execute”这个等式打断了。

#### Nterp

Nterp 仍然解释字节码，入口却可以直接挂在 quick entry 上，调用约定更接近编译代码。

结果就是：

```
force interpreter
  → entry 变成 Nterp
  → 老 Execute hook 不触发
  → CodeItem 看起来像没恢复
```

其实不一定是没恢复，更可能是你观察点没盖住这条路。

所以现在更稳的判断不是“有没有进 Execute”，而是：

-   entry 现在是什么
    
-   有没有进入 `EnterInterpreterFromInvoke`
    
-   进入之后 CodeItem 有没有变
    

#### quick stub

Invoke 一旦认为有 quick code，就进：

```
art_quick_invoke_stub / art_quick_invoke_static_stub
  → entry_point_from_quick_compiled_code_
```

对应关系可以粗写成：

```
// stub 收到 ArtMethod* 后，最终会跳到:
constvoid* code = method->GetEntryPointFromQuickCompiledCode();
// brx / blr code
```

但：have_quick_code == true 不等于“已经是最终机器码”。

后面可能是 bridge，也可能是 nterp。看到 quick entry 就当 AOT，会直接排错方向。

### CodeItem 怎么拿，为什么长度计算经常写错

主动调用如果只是“调了一下”，却没有把 CodeItem 正确摘出来，后面修复照样废。

简化版 dump 逻辑：

```rust
voiddumpArtMethod(ArtMethod* artmethod){
const DexFile* dex_file = artmethod->GetDexFile();
// 1. 整体 Dex
constuint8_t* begin = dex_file->Begin();
size_t dex_size = dex_file->Size();
// write(begin, dex_size)
// 2. 方法体
const dex::CodeItem* code_item = artmethod->GetCodeItem();
if (code_item == nullptr) {
LOG(INFO) << "CodeItem is null: " << artmethod->PrettyMethod();
return;
  }
// 3. 算真实长度
// 不能只按 sizeof(CodeItem) 盲切
uint32_t code_item_len = ComputeCodeItemSize(code_item);
uint32_t method_idx = artmethod->GetDexMethodIndex();
// 写出 method_idx / offset / code_item_len / ins bytes
}
```

长度计算是脏活，也是修失败的高发区。思路大致是：

```
CodeItem
  ├─ registers_size / ins_size / outs_size / tries_size
  ├─ insns[]
  ├─ try_item[]// 如果 tries_size > 0
  └─ encoded_catch_handler_list
```

伪代码：

```cpp
uint32_tComputeCodeItemSize(const dex::CodeItem* code_item){
constuint8_t* base = reinterpret_cast<constuint8_t*>(code_item);
constuint8_t* p = base;
// 跳过 header + insns
// insns 是 u2 数组，长度是 insns_size
// 若 tries_size > 0，后面还有 try_item 和 handler
if (code_item->tries_size_ > 0) {
// 对齐到 4 字节
// 跳过 try_item[tries_size_]
// 再按 LEB128 解析 encoded_catch_handler_list
  }
returnstatic_cast<uint32_t>(p - base);
}
```

很多“bin 有了但修回去反编译仍坏”的问题，不是主动调用没触发，而是这里少算了 handler 段。

* * *

### FART 闭环为什么成立，也为什么后来不够用

FART 强在三步闭环，不在单点 hook：

-   整体 Dex dump
    
-   主动调用后 dump CodeItem
    
-   用 bin 回补 Dex 并验证可解析
    

Java 侧主动调用链，常见是从 ClassLoader 枚举下去：

```javascript
// 伪代码
Object pathList = getField(classLoader, "pathList");
Object[] dexElements = (Object[]) getField(pathList, "dexElements");
for (Object element : dexElements) {
Object dexFile = getField(element, "dexFile");
Object cookie = getField(dexFile, "mCookie");
String[] classNames = getClassNameList(cookie);
for (String name : classNames) {
Class<?> clazz = classLoader.loadClass(name);
for (Method m : clazz.getDeclaredMethods()) {
dumpMethodCode(m); // -> native -> myfartInvoke(ArtMethod*)
    }
  }
}
```

native 再转：

```
staticvoidDexFile_dumpMethodCode(JNIEnv* env, jclass, jobject method){
if (method == nullptr) return;
  ArtMethod* artmethod = ArtMethod::FromReflectedMethod(...);
myfartInvoke(artmethod);
}
```

到了高版本，这套闭环还在，但“调用一定能把真实 CodeItem 暴露出来”不再自动成立。路径不对，后面全白做。

### Android 12–16 失效，按根因排

#### 1\. 路径变了

旧路径：

```
主动调用 → Invoke → 解释器 → Execute → 恢复/dump
```

现在常见：

```
主动调用 → Invoke → quick entry → Nterp / AOT / JIT / bridge
```

桥接和 Nterp 特别容易制造假象：看到 `art_quick_to_interpreter_bridge` ，以为稳了

force interpreter 后看到 Nterp，又以为稳了

两边都可能不进老 `Execute`

Pixel 7 上那个 `onCreate` 就是标准复现：

```haskell
entry = 0x70b1c8a000
-> art_quick_to_interpreter_bridge
-> 老 FART 调，CodeItem 不变
--force-interpreter
-> entry 切到 Nterp
-> Execute 不进
dump 点上移到 EnterInterpreterFromInvoke
-> CodeItem 完整
```

#### 2\. 布局变了

`ArtMethod` 大小、字段布局、pointer-sized fields 一直在变。

写死 Android 8/10 offset 的脚本，到 12 后读错是常态。

与其写死，不如运行时探：

```javascript
// Frida 思路伪代码
const artMethod = ptr(methodAddr);
const accessFlags = artMethod.add(accessFlagsOff).readU32();
const quickCode = artMethod.add(quickCodeOff).readPointer();
console.log('flags=', accessFlags.toString(16), 'entry=', quickCode);
```

CodeItem 获取也建议做成多版本后端，不要假设某一个固定位移永远能取到指令体。

#### 3\. 存储变了

`/sdcard/fart/...` 在 Scoped Storage 后经常直接写失败。

表现很误导：日志像跑完了，目录却是空的。

更稳的路径一般是：

```
/sdcard/Android/data/<pkg>/files/fart/
```

写文件前先把返回值打出来：

```lua
int fd = open(path.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
if (fd < 0) {
  LOG(ERROR) << "open failed: " << path << " errno=" << errno;
return;
}
```

#### 4\. 壳对抗变了

现在更常见：垃圾类一初始化就退

检测异常 ClassLoader 遍历 / 反射调用

破坏内存 Dex 头

恢复时机压到真实执行点

识别固定线程名、固定路径、固定 so

所以全量主动调用本身就可能成为触发器。

配置化会务实很多：

```toml
dump=true
sleep=60000
force=com.target.*
ignore=androidx.*,com.google.*,kotlin.,kotlinx.
```

#### 5\. 编译策略变了

同一 App，刚装完和跑过一段时间后，entry 状态可以不同。

有没有 profile、ART 有没有 Mainline 更新，都会改结果。

“我在 Android 14 上试过”信息量不够，得补当前 entry 类型和编译状态。

### 现在更有用的修法

版本自适应先做：

探测 `access_flags` / `quickCode` / `jniCode`  
识别 entry 类型  
CodeItem 读取做成多版本后端

主动调用改成可控配置，不先全量扫。

脱壳点不要只留一个：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/708eb0370d4423f6.png)

一个更稳的顺序是：

```
1. 打印 entry / flags
2. 必要时 force interpreter
3. 再看 entry 变成了什么
4. 决定 dump 点放哪
5. 小范围 force 调用
6. 对比调用前后 CodeItem
7. 修复并反编译验收
```

修复得要验收：

Dex 头有没有坏  
method_idx\` 对不对  
tries/catch 有没有算对  
修完能否被 jadx/baksmali 正常解析

### 碰到未知抽取壳时怎么做

我现在一般不急着上全量主动调用。

先看整体 Dex 在不在内存里。主体都还没解密，方法体先别谈，否则后面全是空转。确认主体在了，再抽几个方法看 Entry Point，不用多，三五个就行：业务入口一个，壳相关工具类一个，再挑一两个明显被抽空的。把这些记下来就够了：

entry 值  
是不是 bridge  
是不是 nterp  
是不是已经编译  
调用前后 CodeItem 有没有变化

这里有几个坑是反复踩过的。

entry 如果是 `art_quick_to_interpreter_bridge` ，别默认后面一定会进老 `Execute` 。Android 14 Pixel 7 上那个加固 `onCreate` 就是这样，entry 打出来是 `0x70b1c8a000` ，反解到 bridge，按 FART 老路子调，CodeItem 一直不变。后来开 `--force-interpreter` ，entry 切到 Nterp，以为稳了，结果 `Execute` 还是没进。Nterp 根本不走那条老路径。最后把 dump 点从 `Execute` 提到 `EnterInterpreterFromInvoke` ，才拿到完整 CodeItem。

所以后面我基本按这个习惯处理：调用前后 CodeItem 完全不变，先查路径，别先去改输出目录。

force interpreter 之后如果变成 Nterp，而 hook 还钉在 `Execute` ，优先上移观察点。

进程一全量调用就没，先把 force 列表收窄，排查垃圾类。

日志有、文件没有，先看存储权限和目录是不是根本没写成。

小范围 force 能稳定出 bin 了，再扩。修完一定拿 jadx 或 baksmali 验一下，目录里有文件不算成功。

源码的话，优先翻这些就行：

`art/runtime/art_method.cc`  
`art/runtime/art_method.h`  
`art/runtime/class_linker.cc`  
`art/runtime/instrumentation.cc`  
`art/runtime/interpreter/interpreter.cc`  
`art/runtime/interpreter/interpreter_common.h`  
`art/runtime/entrypoints/...`

读的时候别铺太开，就盯四个问题：entry 是谁设置的， `Invoke` 怎么分流，解释器和 Nterp 怎么接上，哪个位置能稳定看到恢复后的 CodeItem。

高版本继续做抽取壳，已经不是再找一个更靠前的 hook 点就完事了。先看当前方法走哪条执行后端，再决定主动调用要把它往哪条路上逼，最后才是 dump 和修复。路径没对上，后面写再多 dump 代码也没用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5501fa7a5661a386.png)

看雪ID：FinSectech

[https://bbs.kanxue.com/user-home-1070028.htm](https://bbs.kanxue.com/user-home-1070028.htm)

\*本文为看雪论坛优秀文章，由 FinSectech 原创，转载请注明来自看雪社区

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a38918b04b4308d7.jpg)](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619143&idx=1&sn=e439f1791d5352b3ab2ee823dd02fb1c&scene=21#wechat_redirect)

9月10日【议题征集】截止

\# 往期推荐

[HTB Nimbus渗透测试靶机 Writeup](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619031&idx=1&sn=c049e90e9e21461f5ce9db0847b5772d&scene=21#wechat_redirect)

[当高频观测不再经过异常路径：Shadow Cave 与常驻式插桩架构](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458619028&idx=1&sn=5a500adeee5194bc8b270c6819973a89&scene=21#wechat_redirect)

[D3CTF 2026 d3llvm.apk 反调试定位与加密 SO的Dump](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618994&idx=2&sn=f6d8e52efe0c96ba3684bce3529c3d30&scene=21#wechat_redirect)

[一串反引号，十层突破：n1ctf‑2018‑easy_harder_php 完整利用链](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618948&idx=2&sn=fe39b3c0600fbd53ced86ae6e2ed499e&scene=21#wechat_redirect)

[实现一个EDR不可见的网络通信（将lwip移植到nt内核中）](https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458618790&idx=2&sn=614beed6bb13fdc6c918aa6d9bb006d6&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3bda3987c6441739.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

**球分享**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

**球点赞**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c953c0b9b281634c.gif)

**球在看**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bc51e60a1ab9953f.gif)

点击阅读原文查看更多
