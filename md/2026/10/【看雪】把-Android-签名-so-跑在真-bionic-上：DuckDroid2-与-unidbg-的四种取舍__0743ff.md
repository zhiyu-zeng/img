---
title: 【看雪】把 Android 签名 so 跑在真 bionic 上：DuckDroid2 与 unidbg 的四种取舍
source: https://bbs.kanxue.com/thread-293370.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-31T00:58:34+08:00
trace_id: 64c6951b-3958-4ed6-8a9e-c6a75f8841c7
content_hash: c08e6c95f1f0912682aad922452a8063e76c859813475caaac7b626e1289a498
status: synced
tags:
  - 看雪
  - Android逆向
  - 模拟执行
series: null
feed_source: 看雪·Android安全
ai_summary: 对比 unidbg“借用+补丁”与 DuckDroid2“重实现+真 bionic libc”两条 Android 签名 so 模拟路线，核心差异在模拟边界画在哪里、各自承担什么代价。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40975244-d011-8109-914e-f9d57d2fdbd6
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 对比 unidbg“借用+补丁”与 DuckDroid2“重实现+真 bionic libc”两条 Android 签名 so 模拟路线，核心差异在模拟边界画在哪里、各自承担什么代价。
> 
> - **共同底座：** 两者都用 SVC 做调用桥；区别是 DuckDroid2 把 JNI 函数表、导入符号 GOT 也指向同一页只读 thunk，syscall/JNI/导入统一走一个 `SvcDispatcher`。
> - **JNI 环境策略相反：** unidbg 按需造类和方法（`acceptMethod` 默认返回 true），缺失到 `Call*Method` 无 shim 时才抛异常；DuckDroid2 要求显式声明，`FindClass`/`GetMethodID` 返回 null 并发布 missing 事件，补到 `JniEvent` 计数为 0 即环境完整可验证。
> - **真 bionic 的成本：** DuckDroid2 加载 ROM 真 libc，需实现 APS2 打包重定位、TLSDESC、IFUNC 锁外执行、scudo top-byte alias、arm64 clone 参数顺序（CLONE_BACKWARDS）等；unidbg 用自带 SDK19/23 libc 快照加版本特化 patch。
> - **并发与失败域：** unidbg 是单 backend 上的任务模型；DuckDroid2 是 1 guest 线程=1 宿主线程=1 engine，单核串行无抢占，失败域切到进程级（System/Worker/Instance 三层 fork，reset 即换实例进程，超时靠 SIGKILL）。
> - **可复现性与局限：** DuckDroid2 内置时钟注入，京东目标注入 `JDGS_WALL_TIME_MS` 后输出与参考 runner 逐字节相同；8176 req/s 仅是自身基线，尚未与 unidbg 同条件对拍，作者强调它不是 unidbg 替代品。

一个签名 so 被加载后，常见顺序是 `malloc` 、开线程、读 `/proc` 、调 `JNIEnv->FindClass` ，再把结果拼成字符串。真机上这些调用分别落到 scudo、bionic 的 pthread、内核 syscall 和 ART。模拟器要让同一段代码跑出同样的字节，就得先决定：这些东西是“模拟”，还是“借用”。

unidbg 的答案是借用加补丁：JNI 用宿主 Java 实现，syscall 在 Java 的 `SyscallHandler` 里处理，线程用自带的 bionic 库加 clone patch 接起来。DuckDroid2 的答案是重新实现加真库：把 ROM 里的 libc 按 Android 14 的 ABI 加载进来，跑它的 preinit、scudo 和 pthread，JNI 世界由目标项目显式声明。

两条路都能签出结果。差别不在谁支持的 so 多，而在边界画在哪里，以及画完之后愿意承担什么。

本文的材料来自 DuckDroid2 的 devlogs（2026-10-27 到 10-29）和本地 unidbg 0.9.8 源码。源码路径、日志数值和测试结果尽量给出来；没有实测的部分会单独说明。

## 一、先把模拟器当成被测对象

DuckDroid2 的 guest 到 host 只有一座桥：一页只读 thunk，每项 8 字节。

```
svc #(0x8000 | index)
ret
```

`index` 占 15 位，所以 `imm == 0` 表示 Linux syscall（号在 x8）， `imm & 0x8000` 表示 host stub。编码在 `code/src/runtime/memory/thunk/thunk_table.cpp:62` ：

```cpp
const uint32_t svc = kSvcOpcode | ((kHostStubImmBase | index) << 5);
```

JNIEnv 的函数表项、导入符号的 GOT 槽，最终都指向同一页。于是 `SvcDispatcher` 只剩两个分支：syscall 和 host stub。参数不用搬，AAPCS64 已经把 x0..x7 摆好了。

unidbg 也走 SVC。 `DalvikVM.java:60` 用 `svcMemory.registerSvc(new ArmSvc() {...})` 注册 `FindClass` ，syscall 由 `SyscallHandler` 在同一个 trap 上处理。 **所以“用 SVC 做调用桥”不是两者的区别**，它是这条路线的共同底座。DuckDroid2 多做的一步是把导入符号也塞进同一页 thunk，让 syscall、JNI 表项、导入符号都走一个 `SvcDispatcher` 。

区别从“桥搭好之后，允许假设什么”开始。

M0 阶段没有写任何抽象，先用 Unicorn C API 跑九条探针。原设计里有两处被实测推翻：

1.  同一个 engine 上嵌套 `uc_emu_start` ，结束时不会恢复外层寄存器。不保存上下文时，33 层嵌套里只有最内层执行了 `svc` 之后的代码；每次嵌套前后 `uc_context_save/restore` 后，33 层才全部正确续跑（ `build/unicorn_spike 6` ）。
2.  `UC_MAX_NESTED_LEVEL = 64` 是纸面值。总嵌套 63 层正常，64 层时 `uc->nested_level` 被写坏（gdb 读到 `0x557c913e` ），随后在 `uc_priv.h:464` 段错误；把宿主栈提到 64 MB 仍然复现。实现里把 host 到 guest 的回调硬限制在 32 层。

后来 M3 又踩到 Unicorn 的超时线程竞态。 `uc.c` 的 `_timeout_fn` 轮询非原子的 `uc->emulation_done` ，一次运行结束和下一轮开始之间被抢占，就会把下一轮停在 `svc+4` 。03 压测大约 8% 概率失败，日志里 elapsed 只有 0.2–0.6 ms，而 timeout 是 5 s。对策不是加锁，而是所有 `uc_emu_start` 一律 `timeout = 0` ，超时交给外部进程 `SIGKILL` 。

这三件事决定了 DuckDroid2 的工程习惯： **文档和 API 名字不能当契约，先写 probe，再写抽象**。后面的 loader、JNI、服务化都受益于这一点，也都为此付出了额外时间。

## 二、Java 世界：造一个，还是声明一个

unidbg 的 JNI 世界是“按需造”的。

`FindClass` 在 `DalvikVM.java:60` 里直接调 `resolveClass(name)` ； `BaseVM.java:116` 的 `resolveClass` 找不到就 `new DvmClass(...)` ，然后放进 `classMap` 。 `GetMethodID` 走 `DvmClass.java:129` ，只要 `acceptMethod` 返回 true 就 `new DvmMethod(...)` ；而 `AbstractJni.java:1088` 的默认实现是：

```java
@Override
public boolean acceptMethod(DvmClass dvmClass, String signature, boolean isStatic) {
    return true;
}
```

也就是说，类和方法记录本身不要求使用者声明。真正会失败的是“调用落到哪里”： `AbstractJni` 里没有匹配分支的 `Call*Method` 会抛 `UnsupportedOperationException` ，使用者再按报错去补 Java override。

这套模型对分析很友好。拿到一个新 so，先跑，哪一步抛异常就补哪一步； `AbstractJni` 已经内置了一大片 Android 类的默认行为， `DvmClass` 也不要求你先写声明。代价是“类存在”不等于“环境被声明过”： `FindClass` 成功只能说明名字被记住了，不能说明这个类的方法语义已经被认真实现。对于一次性的算法还原，这不算问题；对于一个要长期跑、结果要逐字节对拍的服务，这会变成误导源。

DuckDroid2 的 `FindClass` 反过来。 `code/src/runtime/jni/env/jni_state.cpp:353` ：

```cpp
const uint64_t klass = world_->findClass(name.value());
if (klass == 0)
{
    publishMissing(observer::JniEventKind::MissingClass, name.value(), {}, {}, slot, tid);
    return 0;
}
```

`GetMethodID` / `GetStaticMethodID` （ `jni_state.cpp:485` ）找不到方法返回 0 并发布 `MissingMethod` ； `RegisterNatives` 如果类或方法没有被环境声明，返回 `JNI_ERR` ，而不是先把地址记下来。 `jni_state.cpp:613` 的 `RegisterNatives` 只绑定 `world_->registerNative(...)` 能接受的方法。

环境声明是 C++ 代码，分两级：平台级在 `src/runtime/jni/envs/` （ `java.lang` 等），目标项目在 `code/user_code/<case>/` 。目标项目暴露一个安装函数，由自己的 `main.cpp` 在加载任何模块之前显式调用：

```cpp
auto installed = instance.installJavaEnvironment(&user::libeleven::installEnvironment);
```

`runtime_instance.cpp:266` 只允许在第一个模块加载前调用。 `JNI_OnLoad` 是在 `loadLibrary` 里跑的，晚装等于没装，runtime 直接拒绝，而不是假装成功。

这个选择在 libeleven 上验证过。 `JNI_OnLoad` 真正执行并返回 `0x10006` ， `RegisterNatives` 把 `data(I)Ljava/lang/String;` 绑到 `JNI_OnLoad - 0x4139c + 0x40cb4` ，测试逐字节比对了地址。把 `installJavaEnvironment` 临时去掉后， `FindClass` 报 `missing-class ChallengeElevenFragment` ， `RegisterNatives` 拿到 null class 也报 `missing-class` ，随后 `callRegisteredNative` 直接失败，没有任何静默兜底。

京东 16.1.50 是第二个目标，也是这套严格模式的压力测试。参考 runner 的 JNI trace 给出了 21 个调用面： `FindClass` 、 `GetMethodID` 、 `GetStaticMethodID` 、 `GetFieldID` 、 `GetStaticFieldID` 、 `NewStringUTF` 、 `GetStringUTFChars` 、 `ReleaseStringUTFChars` 、 `NewByteArray` 、 `SetByteArrayRegion` 、 `NewObjectArray` 、 `GetArrayLength` 、 `GetObjectArrayElement` 、 `NewObjectV` 、 `CallObjectMethodV` 、 `CallStaticObjectMethodV` 、 `GetObjectClass` 、 `GetObjectField` 、 `IsInstanceOf` 、 `ExceptionCheck` 、 `DeleteLocalRef` 等。M5 当时把数组和 `*V` 变参列为未实现，所以这次不是纯搬代码，而是先补 runtime 面：数组对象、AAPCS64 `va_list` 游标、 `NewObject` 、对象字段描述符、 `void` 返回签名、 `libandroid` / `libmediandk` 导入桩、 `filesystem_roots` 、 `madvise` / `mkdirat` 。

补完之后， `Bridge.main(103, ["0"])` 、 `(["1", null])` 后 `main(101)` 输出 7 字段 JSON， `b1/b2/b3/b5` 与参考一致；注入 `JDGS_WALL_TIME_MS=1792886400000` 后，整个输出与 DuckDroid 参考 runner 逐字节相同。APK 从 82 MiB 消融到 9 个条目、106 KiB，签名路径没有变。

补环境不是一次性写全，而是严格模式驱动的循环。先什么都不加，跑目标；stderr 里的 `JniEvent` 会给出 `missing-class` 、 `missing-method` 、 `missing-field` ，或者 `unsupported-function` 。前三个是目标项目要补的声明，最后一个通常是 runtime 还没实现的 JNI 表项。每次只补事件里的那一个：

```cpp
auto klass = world.declareClass("com/example/Target", "");

// native 方法：只声明签名和静态性，方法体由 so 的 RegisterNatives 绑定。
world.declareMethod(klass.value(), "data", "(I)Ljava/lang/String;", true, {});

// host 方法：给一个最小 shim，返回常量或对象。
world.declareMethod(klass.value(), "getVersion", "()Ljava/lang/String;", false,
    [](JavaWorld &java, runtime::jni::InvokeContext &) -> Result<uint64_t> {
        return java.newString("16.1.50");
    });

// 字段：先声明，再在 install 时写进对象。
world.declareField(klass.value(), "versionCode", "I", false);
```

补到正常路径的 `JniEvent` 计数为 0，环境就完整了。libeleven 只需要两条：一个类和一个 `data` native 方法。京东 16.1.50 要多得多： `Bridge` 、 `Context` 、 `PackageManager` 、 `PackageInfo` 、 `SigningInfo` 、 `Signature` 等 11 个类， `versionName` / `versionCode` / `signingInfo` / `signatures` 等字段，以及 `getAppKey` / `getJDGVN` / `getPackageName` / `getPackageCodePath` 这些 host 方法；对象图在 install 时用 `allocateObject` / `newArray` / `writeInstanceField` 搭好。完整模板在 `code/user_code/ENVIRONMENT.md` 。

这和 unidbg 的差别不是“能不能先跑再补”，而是补的东西和暴露的时机。unidbg 的类/方法记录会先按需创建，所以 `FindClass` 成功不代表环境已经实现；缺失通常要等到某个 `Call*Method` 没有 Java shim 时才以异常暴露。DuckDroid2 的 `FindClass` / `GetMethodID` / `GetFieldID` 不创建任何东西，第一次查询就返回 null 并给出事件，所以补的范围更早、更具体。代价是声明要写全：unidbg 可以先把类“造”出来让流程往下走，DuckDroid2 不会。换来的是，正常路径跑通后， `JniEvent` 为 0 就是环境完整的可验证证据。

## 三、真实 bionic：加载一个库，还是绑定一个 ROM

M4 一开始走的是“虚拟 bionic”： `libc/liblog/libdl/libm` 是纯符号表加 host stub，不读文件。自建 fixture 只需 6 个符号，gate 很轻松就过了。

然后拿真实目标一量，账就不对了：

| 目标  | 未定义导入 | 依赖  |
| --- | --- | --- |
| `libeleven.so` | 126 | libc, libm, libdl, liblog |
| `libsgmainso-6.8.260704.so` | 166 | libc, libm, libdl, liblog, **libz.so** |

`libz` 不是 libc，它自己也导入 libc。虚拟方案只在依赖图恰好是 `{libc, liblog, libm, libdl}` 时成立，真实目标从来不是。真 libc 自己有 1479 个动态符号、514 个 `JUMP_SLOT` 、1016 个 `RELATIVE` 、1 个 `TLS_TPREL64` 、7 条 init_array。继续补虚拟表，等于手工重写一个 libc 的导入面，而且每加一个目标就扩一次。

所以 M4.5 改成加载真 libc，M4.6 让它真正跑起来。这一段是整个项目里技术密度最高的部分：

-   **打包重定位**。Android 的 `DT_ANDROID_RELA` 不是三元组，而是 APS2： `magic + count + initial_offset` ，然后是 `group_size/group_flags` ，组内共享 `r_info` ，offset/addend 用 SLEB128 delta。实现按 ROM 的 `bionic/linker/linker_reloc_iterators.h` 写，不是按常见 RELA 猜。 `DT_RELR` 按位图展开成 `R_AARCH64_RELATIVE` ，`.bss` 槽的 addend 取 0。
-   **TLS**。clang 的 `aarch64-linux-android31` 只产 `R_AARCH64_TLSDESC` ， `-mtls-dialect=trad` 在该 target 上直接报 unsupported。于是要写描述符 `{func, arg}` 、静态 resolver 桩、 `PT_TLS` 模板物化。所有 `PT_TLS` 模块先按静态槽分配（bionic 只给 `DF_STATIC_TLS` 静态槽），偏移通过 `__loader_shared_globals()->static_tls_layout` 交给真 libc，否则 `pthread_create` 分配的 TLS 与重定位值对不上。
-   **IFUNC**。 `irelative` 的 resolver 必须在 guest 里执行，但 `loadLibrary` 持着执行锁，而 `scheduler->callFunction` 需要主 guest 线程拿同一把锁。在锁内直接调会死锁。实现先把 `{place, resolver}` 排进 pending，释放锁后逐个调用 `(HWCAP|1<<62, &__ifunc_arg_t{24,0,0})` ，再回锁内写结果。hwcap 置 0，libc 的 `memcpy_resolver` 走通用实现。
-   **`libc_shared_globals`**。字段偏移不是猜的，是按本 ROM 的 `bootstrap/libc.so` 反汇编核对： `auxv` 在 `+0x418` 、 `static_tls_layout` 在 `+0x450` 、 `tls_modules.generation` 在 `+0x478` 、 `generation_libc_so` 在 `+0x480` 、 `set_target_sdk_version_hook` 在 `+0x628` 、 `init_progname` 在 `+0x630` 、 `init_environ` 在 `+0x638` 。换 ROM 必须重新核对。
-   **preinit 与 scudo**。 `__libc_preinit` 跑完， `malloc/calloc/free` 走真 scudo。scudo 预留 8.25 GiB `PROT_NONE|MAP_NORESERVE` ，只登记、按需物化；它还会用 top-byte 标记堆指针（实测 tag 为 `0x02` ），Unicorn 不实现 TBI，所以 backend 同时映射 `1<<56` / `2<<56` 的 alias，指向同一块宿主页。
-   **clone 的 arm64 顺序**。arm64 内核 `select CLONE_BACKWARDS` ，参数是 `(flags, stack, parent_tid, tls, child_tid)` ，x3 是 TLS，x4 是 child_tid。M3 的裸 blob 和 handler 原先按另一套顺序写，两者自洽，所以 `03_pthread_join` 一直通过；真 bionic 一跑，子线程 TP 落在 `&thread->tid` 上， `[TP+8]` 为 0，直接崩。修正只改了 handler 和 blob 两处，但这类“测试自洽但不符合内核”的 bug，只有真库能暴露。
-   **TP 接管**。真 libc 的 `__set_tls` 是纯 `msr tpidr_el0` ， `__libc_init_main_thread_final` 和每个 `pthread_create` 都会换 TP。scheduler 在每次 run 结束后回读 `TPIDR_EL0` 存回 `RuntimeThread::tls_tp` ，否则下一次 `callFunction` 会把 TP 恢复成 preinit 前的旧块。

结果在 `04b_libc_map` / `04b_tlsdesc` / `04c_*` 里：libc base `0x60000000` ， `TPREL64` 的 `tp_off = 0x3ff0` ；libz 的 `memcpy` / `memmove` 两条 IFUNC 都指向 `libc + 0x54d00` （ `__memmove_aarch64` ，hwcap=0 的 eq 分支），而不是 resolver `libc + 0xc3f78` ；libsgmainso 的 section header 损坏不影响加载，完整闭包 `libmain -> {liblog, libz, libc, libm, libdl}` 全部解析； `04c_bionic` 里 10 次真 `pthread_create/join` 计数正确，两个线程并存时 `/proc/self/status` 的 `Threads` 为 3，errno 地址每线程独立。

unidbg 也不是“不用真 libc”。它自带了 `sdk19/lib/libc.so` 和 `sdk23/lib64/libc.so` ， `AndroidResolver` 能把它们加载进来，init_array 默认也会跑。差别在适配方式： `AndroidResolver.patchThread` 只支持 19 和 23，其他 SDK 直接抛 `UnsupportedOperationException` ；64 位路径的 `ClonePatcher64` 从 `pthread_internal_t` 的 `0x60` / `0x68` 读 `start_routine` / `arg` 。这是针对已知 bionic 布局打的补丁，不是按当前 ROM 的 ABI 重新实现。

这是一种很合理的工程取舍：用少量老版本 libc 快照覆盖大量应用，版本差异集中在一处补丁里。DuckDroid2 的取舍是另一种：绑定一个 ROM，偏移用反汇编核对，syscall 面全有或全无。缺一个 syscall，preinit 就死；换一个 ROM，就要重新核对 `libc_shared_globals` 。它换来的是，目标碰到 TLS、 `/proc` 、malloc 布局、pthread 同步这些 libc 内部时，不需要再写一层“近似实现”。

这一路也踩了不少坑，且每个坑都能说明“真 bionic”不是加一个 `loadLibrary` 就完事：

-   `PT_DYNAMIC` 存了 for 循环里局部变量的地址，出循环即悬垂。症状不是崩溃，而是动态段全空：没有 `DT_NEEDED` 、没有符号表、没有重定位，模块以一个“只有 PT_LOAD”的空壳加载成功， `lookupSymbol` 才报错。
-   clang `-O1` 会把“只写全局量的 constructor”折叠掉，整个 `.init_array` 条目消失；fixture 改成调用依赖模块的函数才保住。
-   clang 对只有声明、没有定义的函数， `st_info` 是 `STT_NOTYPE` ，不是 `FUNC` 。loader 不能用符号类型区分函数和数据。
-   加载失败路径先 `registry_.erase()` 销毁 Module，随后又用已销毁对象的 `soname` 和 `needed` 构造错误消息。ASan 报 `heap-use-after-free` ，普通构建表现为 `std::length_error` 后 `std::terminate` 。后来加了 `module_missing_dep_test` 。

## 四、并发：任务、线程、进程

并发这一层最容易被“都支持 pthread”这句话掩盖。两边的单位其实不同。

unidbg 是一个 backend 加一个任务表。 `UniThreadDispatcher.java:20` 维护 `taskList` ， `run()` 在 `:125` 里逐个 `restoreContext` 、 `dispatch` 、 `saveContext` 。guest 线程是任务，不是宿主线程； `clone` 由 `ClonePatcher64` 在 libc 的 `clone` 调用点插入 pre/post 回调，把 `start_routine` / `arg` 压到栈上再返回。 `WorkerPool` 是宿主进程内的对象池，常见用法是复用 emulator。

DuckDroid2 是 1:1:1：一个 guest 线程对应一条宿主线程和一个 `uc_engine` （ `scheduler.cpp:101` 起主线程，`:702` 起 clone 出来的线程）。实例级 `execution_mutex` 保证同一时刻只有一个 engine 在跑 guest 代码，原因是 `LDXR/STXR` 的 exclusive monitor 是每 engine 一份，真并发会让 guest 的原子操作坏掉。线程阻塞在 futex 上时，先释放执行锁再睡； `PendingSyscall` 在进入时创建，唤醒时只 `complete()` 一次，写 x0，从 `svc+4` 继续，不重放。

这条“完成式”路线在 trace 里留下了很清楚的痕迹。M3 的输出里第一次出现 `id` 和 `seq` 分叉：

```
2  2  ... clone   ... 0x2
3  4  ... gettid  ... 0x2
4  5  ... exit    ... 0x0
5  3  ... futex   ... 0x0
```

父线程在 clone 之后立刻进入 `futex` （seq=3）并阻塞；子线程随后执行 `gettid` （seq=4）、 `exit` （seq=5），futex 才完成并发布（id=5）。首列 `id` 是发布顺序，恒单调连续； `seq` 是调用顺序，允许交错。解析器只依赖 `id` ，所以 M3 不需要改 M2 的格式。

代价是资源。每条 guest 线程一条宿主线程，默认栈不小；单核串行意味着父线程在 guest 里死循环会饿死子线程；没有抢占，watchdog 只能靠外部进程。unidbg 的任务模型更轻，所有 guest 线程共享一个 backend，切换点是任务让出；但它也把整个 JVM、所有 emulator、所有 guest 线程放在同一个失败域里。

DuckDroid2 把失败域切到了进程级。M7 的拓扑是：

```
Web API --UDS--> System --socketpair--> Worker(项目) --socketpair--> Instance 子进程
```

System 是网关，不解析请求体；Worker 是 supervisor，自己不创建 `RuntimeInstance` ，只 fork 出实例进程；实例进程在 `exec` 之后才 `RuntimeInstance::create` 。设计里明确否决了“先建实例再 fork”，理由是源码级事实： `RuntimeInstance::create` 一上来就 spawn 宿主线程（ `scheduler.cpp:101` ），每个 guest 线程还有一条（`:702` ）； `fork()` 只复制调用线程，子进程里其他线程消失， `std::thread` 对象、条件变量、futex 等待队列、 `execution_mutex` 的持有者都会悬空；Unicorn 的 TCG 状态和代码缓存也是进程内全局状态。所以 fork 点必须早于任何 engine 和宿主线程。

这样 reset 就变成“换一个实例进程”，没有 in-place reset；超时用 `SIGKILL` 实例进程强制；会话绑定实例，实例死亡后回 `SESSION_NOT_FOUND` + `new_session` 。预热把冷启动的 `init≈0.95–1.4 s` 摊到启动阶段。

M7 的基线：1 Worker × 4 实例，8 个长连接，10000 次 `data(7)` ，注入时钟，20 核宿主。

```yaml
requests   : 10000 ok, 0 error
wall       : 1.223 s
throughput : 8176 req/s
latency    : mean 0.899 ms  p50 0.622 ms  p99 1.322 ms
instances  : 4 个实例各 2500 次
```

这个数字只说明 DuckDroid2 自己的服务链路是通的，不能拿来和 unidbg 比快慢；两边没有做过同目标、同输入、同机器的对拍。

## 五、对外接口：库，还是服务

unidbg 是一个 Java 库。它的源码树里有 `backend/unicorn2` 、 `backend/dynarmic` 、 `backend/kvm` 、 `backend/hypervisor` 四套后端，有 `InlineHook` 、Dobby、xHook，有 console/gdb/IDA 调试器，有 `WorkerPool` 做进程内复用。但它没有面向请求的常驻服务：UDS、HTTP 帧、会话、进程监督都不在库里，使用者要自己写一层 Java 程序把 emulator 包起来。

这对分析工具是合适的。你可以写一个 `main` ，加载 so，调函数，打印返回值；也可以在 debugger 里停下来看寄存器。集成到别的服务里，也可以，但那是使用者的代码，不是 unidbg 的交付物。

DuckDroid2 把这一层做进了项目。每个 app 一个 UDS listener，帧是 4 字节大端长度加 UTF-8 JSON；System 不解析包体，只按连接所属的 app 转发；Worker 按实例槽位调度；实例进程回 `result` 或 `init_failed` 。会话 id 等于实例 id，实例回收或死亡即删绑定。错误码沿用 `BAD_FRAME` / `SESSION_NOT_FOUND` / `OVERLOADED` / `CALL_TIMEOUT` / `GUEST_FAULT` 这一套。 `sign_client` 和 `bench.py` 是现成的客户端。

确定性也做在这一层。 `RuntimeClock` （ `code/src/runtime/clock/runtime_clock.cpp:23` ）默认读宿主时钟； `setWallTimeNs` / `setMonotonicTimeNs` 注入后，每次读返回当前值并加 1 ms； `clock_gettime` 、 `gettimeofday` 、 `java.lang.System.currentTimeMillis/nanoTime` 共用同一个时钟。于是 `07_end_to_end` 可以断言 `data(1..100)` 精确等于 `n:(1792886400000+n-1)` ；京东注入 `JDGS_WALL_TIME_MS` 后，整个输出与参考 runner 逐字节相同。

这层也带来了限制：没有 HTTP 解析，交给上游 Python；没有动态扩缩容，固定 N 个实例；没有 `SIGTERM` 处理，只有 `stop()` ；trace 目录多实例共用，文件命名还没按实例隔离；每个连接一条线程，没有连接数上限。它是一个能跑的服务骨架，不是通用的签名平台。

## 六、优点和缺点

把两边放在同一张表里，容易变成打分。更准确的说法是：它们服务的目标不同，所以同一项在一边是优点，在另一边是成本。

| 维度  | unidbg | DuckDroid2 |
| --- | --- | --- |
| 定位  | 分析优先的 Java 模拟器库 | 服务优先的 C++ 运行时 |
| Java 世界 | 按需造类/方法， `AbstractJni` 补 shim | 显式声明，缺失返回 null + `JniEvent` |
| bionic | 自带 SDK19/23 libc，版本特化 patch | 绑定 ROM 的真 libc，preinit/scudo/TLS |
| 并发单位 | 单 backend 上的任务 | guest 线程 = 宿主线程 = engine |
| 进程隔离 | 进程内 WorkerPool | System/Worker/Instance 三层进程 |
| 对外接口 | Java API + 调试器 | UDS + 会话 + 预热池 |
| 扩展方式 | 写 Java override / inline hook | 写 C++ 环境声明 / syscall handler |
| 成熟度 | 多年、目标多、社区大 | 早期、两个真实目标 |

DuckDroid2 的优点，集中在“语义来源”和“失败可见”上：

-   libc 的行为来自目标 ROM，不是近似实现。 `malloc` 是 scudo， `pthread` 是 bionic，TLS 是 bionic 的 `static_tls_layout` 。目标碰到这些内部结构时，不需要再补一层。
-   JNI 缺失是显式的。 `FindClass` 返回 0、 `GetMethodID` 返回 0、 `RegisterNatives` 返回 `JNI_ERR` ，并发布事件。分析时不会把“环境没写”误当成“环境写对了”。
-   失败域是进程。实例崩溃由 Worker 发现并重生，Worker 崩溃由 System 发现并重启；client 拿到的是可重试错误，不是整个服务挂掉。
-   结果可复现。时钟注入后，同一输入序列逐字节一致； `07d_session_reset` 用换实例覆盖了 reset。
-   可观测性是一等公民。 `svc.log` 、 `MemoryEvent` 、 `ThreadEvent` 、 `ModuleEvent` 、 `JniEvent` 、每线程诊断环、x29 帧链回溯，都在实现里，不是事后加日志。
-   runtime 与目标分离。 `src/runtime/jni/envs/` 只放平台级；目标在 `code/user_code/<case>/` 。runtime 不认识具体 app。

DuckDroid2 的缺点，也同样具体：

-   年轻。真实目标只有 libeleven 和京东两个；syscall、futex、信号、JNI 面都是按踩到的缺口补的。
-   绑定 ROM。 `libc_shared_globals` 偏移、静态 TLS 布局、clone 语义都跟这一个 ROM 走；换 ROM 要重新核对。
-   面窄。futex 只有 WAIT/WAKE，没有 timeout、 `WAIT_BITSET` 、PI；信号只留 no-op；动态 TLS/DTV 未实现， `tls_modules` 还是空表；没有 CFI/DWARF 回溯，release so 的 x29 链可能只有一帧。
-   单核串行。没有抢占，guest 死循环会挂住调用方；服务层只能用 `SIGKILL` 兜底。签名场景够用，但如果目标自己开多线程做 CPU 并行，DuckDroid2 不会更快。
-   工具链不如 unidbg。没有 inline hook，没有 Dobby/xHook，没有 gdb/IDA stub；要 hook 目标函数，得自己在 GOT/重定位或 guest 代码上做。
-   每接一个目标要写 C++ 声明。unidbg 的 Java override 更快，尤其在你还不确定目标用了哪些类的时候。
-   性能只跟自己比。8176 req/s 是 DuckDroid2 的基线，不是和 unidbg 的对比结论。

unidbg 的优点同样明显：覆盖面广、目标多、Java 生态熟悉、后端可换、inline hook 成熟、调试器可用。它的“按需造类”在探索阶段非常高效；自带 libc 加版本补丁，让大量 so 不必先准备一整套 ROM。它的限制则是这些选择的另一面：环境容易隐式化，老 libc 快照和新目标之间可能有语义差，进程内共享失败域，服务层要自己搭。

所以这不是“DuckDroid2 比 unidbg 强”的叙事。unidbg 更像一把可以现场改刃的分析工具；DuckDroid2 在验证另一件事：把 Android 的运行环境按 ROM 固定下来，签名服务能不能因此变得可复现、可隔离、可观测。

## 七、还没解决的问题

-   **没有同目标性能对拍**。DuckDroid2 的 8176 req/s 是 4 实例、8 连接、libeleven `data(7)` 的结果；unidbg 在同样条件下的数字没有测。谁快、快多少，现在不知道。
-   **信号语义**。目前只有 no-op； `EINTR` 是接口预留，没有真正的信号投递。
-   **动态 TLS/DTV**。所有 `PT_TLS` 按静态槽处理； `__tls_get_addr` 的 DTV 扩容、 `dlopen` 后的 TLS 访问没做； `__libc_shared_globals()->tls_modules` 仍是空表，新线程不会复制模块的 `PT_TLS` 初始化镜像。
-   **随机数注入**。时间戳能注入了，随机数还没有： `getrandom` （ `misc_handlers.cpp:125` ）和 `AT_RANDOM` （ `shared_globals.cpp:102` ）都还是宿主 `std::random_device` 。签名服务要完全可复现，这块得做成实例级 `RuntimeRandom` 。
-   **指令级 trace / 回放**。现在只有语义级的 `svc.log` ，没有指令级 trace，也没有回放器；M2 当时明确推后了。真要做“重放”，这条得先补。
-   **futex 面**。timeout、 `WAIT_BITSET` 、PI、robust list、requeue 都没有。
-   **回溯**。x29 帧链不是 CFI/DWARF；Android release 构建默认 `-fomit-frame-pointer` ，真实 so 上链会很短。
-   **页大小**。只在 4 KiB 页上验证；16 KiB 页设备没有覆盖。
-   **目标覆盖**。libeleven 和京东之外，快手、抖音还没接； `libsgmainso` 只验证了加载和绑定，没有跑完整调用。
-   **严格 JNI 的长期成本**。目标多了以后，声明工作量怎么控制？从 JNI trace 生成声明看起来能省事，但生成出来的声明是否还算“显式”，需要再想。
-   **unidbg 的旧 libc 路线能否覆盖同一批目标**。没有做对照实验；它自带的 sdk23 libc 加 clone patch，在京东这种目标上会走到哪一步，目前没有数据。

写到这里，我的判断是：DuckDroid2 不是 unidbg 的替代品。它把“Java 世界、真实 bionic、并发、对外接口”四件事都往“贴近真机、可服务化”的方向推了一步，也因此背上了 ROM 绑定、面窄、工具链少这些债。unidbg 把同样的四件事往“分析效率、覆盖面、可扩展”的方向推，代价是环境隐式、版本快照和进程内失败域。选哪条，取决于你要的是一次把算法跑通，还是一直把签名跑稳。

* * *

更细的决策过程和原始输出在 `docs/devlogs/` 里，和本文关系最直接的是：

-   `2026-10-27-03-M0探针结果.md`
-   `2026-10-28-08-M3设计.md` 、 `2026-10-28-09-M3结果.md`
-   `2026-10-28-12-路线修正-真bionic.md` 、 `2026-10-28-13-M4.5设计.md` 、 `2026-10-28-15-M4.6设计.md`
-   `2026-10-29-16-M5设计.md`
-   `2026-10-29-19-M7设计-进程模型与网关.md` 、 `2026-10-29-20-M7结果.md`
-   `2026-10-29-20-JD接入与JNI面补全.md`

复现 DuckDroid2 当前状态：

```bash
cmake -S code -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build -j"$(nproc)"
ctest --test-dir build --output-on-failure
```

unidbg 侧的事实基于本地 `unidbg` 0.9.8 源码；引用行号对应 `unidbg-api` 与 `unidbg-android` 的当前树。

## 作者补记

说点正文里没写的。做这个项目最直接的原因其实挺土的：我不会 Java，Java 那套构建环境我是真搞不定，看到 gradle/maven 就头大；最近又在学 ART，索性沿着 native 能看到的那一层，自己把运行时写一遍。所以 DuckDroid2 只做了 ART 的一层——JNIEnv/JavaVM 和 native 边界，对象模型、GC、解释器/JIT 这些都没碰。

模拟执行的好处也在这儿：环境是自己的，时钟能注入，拦截点和事件都在手里，出了问题能回去翻 svc.log、内存事件和 JNI 事件。不过随机数现在还是宿主 RNG（ `misc_handlers.cpp:125` ），指令级 trace/回放和 inline hook 也都没做，这几条别算成已经有的能力。

libeleven 是真的简单，基本就是个魔改 base64，所以 1..100 逐字节一致、8176 req/s 这些，只能说明链路是通的，不代表它能扛复杂 so。京东才算第一个像样的目标：一次签名大概 100 ms guest CPU，单实例串行；2 实例/2 客户端约 23 req/s（平均 87 ms），4 实例/8 客户端约 39 req/s（平均 201 ms），跟 libeleven 不是一个量级。

ROM 是 LineageOS 21（Android 14）。我编了小米 8 和一加 9 两个版本，现在接进来、验证过的是 lemonade（一加 9）；小米 8 还没接。Android 编译比浏览器编译省心，就是内存和硬盘吃得厉害。
