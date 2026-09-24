---
title: 【微信】浅析 Google Play 自动保护（PairIP）：代码虚拟化、TEE 密钥与运行时反篡改
source: https://mp.weixin.qq.com/s?__biz=MjM5NTc2MDYxMw==&mid=2458620834&idx=1&sn=bb5885497395f2a93a892c5f0d3be2e3&chksm=b005df8f56d40b78a1bb768a3182cd9ed864ad64b175c38832c79a458050b78ee4fa5a5d8335
source_host: mp.weixin.qq.com
clip_date: 2026-09-24T23:21:03+08:00
trace_id: f9bc0cf5-1da0-44c6-b786-25935aed2fd2
content_hash: 06f97a275a418efdf98c62342a006a243dd648e2d3ffcbd4809999af8fdc9ed0
status: synced
tags:
  - 微信
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 公众号·看雪学院（weread）
ai_summary: Google Play 的 PairIP 壳用「代码虚拟化 + TEE 硬件密钥 + 运行时反篡改」保护上架应用，本文在真机上把 28 段加密 VM 字节码全部脱成明文。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e575244-d011-8185-b0b9-f053093b649d
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Google Play 的 PairIP 壳用「代码虚拟化 + TEE 硬件密钥 + 运行时反篡改」保护上架应用，本文在真机上把 28 段加密 VM 字节码全部脱成明文。
> 
> - **静态形态：** native 层有 libpairipcore.so（VM 解释器 + 反篡改），Java 层有 com.pairip.* 包，assets 顶层随机名无扩展名文件即加密 VM blob；Play 版比 sideload 多 gpdeku 两个 split 作密钥载体。被虚拟化方法在 dex 中只剩 `VMRunner.invoke(signature, args)` 空壳。
> - **密钥门：** blob 是 AES/GCM 密文，解密 wrapping key 存于设备 TEE，由 Play 的 KeyImportService 下发，明文密钥永不出 TEE。需同时满足 Play 安装、过 Play Integrity、登录 Google 账号，缺一则服务端返 FAILURE，app 主动 System.exit(0)；本地伪造 isEncryptionKeyPresent 无用。
> - **反篡改：** libpairipcore 扫 /proc/self/maps 发现注入 .so 即自毁——给 vector 喂非法 length 触发 abort，abort 被中和后转成 SIGSEGV（ESR 0x92000006 用户态读未映射地址），并 SIG_DFL 复位；信号 hook 原理上拦不住，正解是让注入不出现在 maps。
> - **完整性校验：** 反射枚举安全，但 hook VMRunner 任一方法（改写 ArtMethod 入口）即被检出并自毁；要边 hook 边隐藏需内核级 shadow-PTE。
> - **脱明文手法：** 改为「调用而非 hook」getVmByteCode，28/28 blob 解出，头部 magic `\x00IAP`、version=2，落盘 6.3MB，进程存活；但 opcode 按 build 置换，明文只是反虚拟化原料。

最近分析 Google Play 上的 Unity 游戏，碰到过几次类似的情况：JADX 中大量关键方法只剩一句 `VMRunner.invoke("...")` ，逻辑全被掏空；模拟器中迅速闪退。这两件事是同一层加固的两面：Google Play 的 Automatic Protection（SDK代号 PairIP），上架时由 Play 侧自动套上，把「代码虚拟化 + TEE 硬件密钥 + 运行时反篡改」打成一个整体。

本文关注的问题：

-   被保护的代码变成了什么形态、存在哪、以什么方式加密；
    
-   解密密钥在哪一层、谁在什么条件下发放，哪些环境拿不到；
    
-   运行时反篡改到底检测什么、怎么处置；
    
-   在满足条件的机器上，能不能稳定把虚拟化字节码脱成明文。
    

目的：在一台真机上让它跑到交互态（过密钥门和反篡改），并把加密 VM blob 解密落盘成明文（用 `\x00IAP` 头做判据）。

复现环境是pixel三绿真机，后续都在这上面观察：

| 层   | 方案  |
| --- | --- |
| 静态  | jadx-headless-mcp |
| 设备  | Pixel 6（Android 16， `6.1.145-android14` ），三绿环境 |
| root / Zygisk | 内核态 root + Zygisk-Next |
| Integrity | PlayIntegrityFix，让设备过 Play Integrity，服务端才会签发 TEE 密钥 |
| 分发  | Play 正版安装 |
| 动态  | 反检测 frida |

## 一、PairIP 概览

背景： `com.pairip.*` 这套壳早在 2023 年就被研究者记录在案（那会还主要把它当成一个运行时签名校验壳，见文末 Narendra Dwivedi），后来才被 Google 并进 Play 的 Automatic Protection，长成今天「代码虚拟化 + TEE 密钥 + 运行时反篡改」三件套的样子。

PairIP 的静态特征很明确：native 层有 `lib/arm64/libpairipcore.so` （VM 解释器 + 反篡改），Java 层有 `com.pairip.*` 包，assets 顶层包含一批随机名、没扩展名的文件，就是加密后的 VM blob。Play 版还会比 sideload 多两个 split（ `gpdeku` / `gpdeku.config.arm64_v8a` ），作为是密钥下发的载体。

进程起来后反射枚举 `com.pairip.*` ，能拿到二十多个类，关键点如下：

```
com.pairip.StartupLauncher            启动入口，驱动 VM 初始化
com.pairip.VMRunner                   VM 运行器（核心）
com.pairip.VmDecryptor                字节码解密
com.pairip.SignatureCheck             签名校验（$SignatureTamperedException）
com.pairip.InitContextProvider        抢在 Application 之前跑的 ContentProvider
com.pairip.application.Application     壳 Application
com.pairip.licensecheck.LicenseClient  Play 在线授权校验
```

启动次序是理解「无密钥退出」的关键。 `InitContextProvider` 在 Application 之前就跑，配合 AppComponentFactory 做组件替换：拿到密钥、校验通过，才把真实组件换上、由 `StartupLauncher.launch()` 驱动 VM；任一环不过，真实组件就被替换成占位实现，然后进程自己退出。

整条流程大致如下：

被虚拟化的 Java 方法，在 dex 里已经被抽空，只剩一句转发：

```typescript
public Object someProtectedMethod(Object[] args) {
return VMRunner.invoke("<经过编码的方法签名>", args);
}
```

那个签名字符串编码了原方法的身份（类、方法名、描述符），运行时靠它在 VM 里找到对应的一段字节码。反射 `VMRunner.getDeclaredMethods()` ：

```java
public static native Object executeVM(byte[] bytecode, Object[] args);   // native 解释器
public static  Object invoke(String signature, Object[] args);
private static byte[]  getVmByteCode(String name) throws IOException;     // 读密文 → 解密 → 明文
private static byte[]  readByteCode(String name)  throws IOException;   // 只读原始密文
private static ZipFile openBaseApk(); // 从 base.apk 定位 blob
```

`invoke` 拿签名换算出 blob 名， `getVmByteCode` 把这个 blob 从 base.apk 里读出密文、交给 `VmDecryptor` 解密成明文，再喂给 native 的 `executeVM` 解释执行。对逆向的直接后果是：静态反编译只能看到 `invoke(...)` 这层空壳，真逻辑落在「加密 blob + native 解释器」里。要拿到逻辑只有两条路：把 VM 明文脱出来做反虚拟化，或者在 native 解释器里动态跟指令。本文走前者，一次把 blob 全解出来，之后离线慢慢分析，不必一直挂着真机。

IDA 打开 `libpairipcore.so` 。它导出 `ExecuteProgram` / `JNI_OnLoad` / `JNI_OnUnload` 三个符号； `JNI_OnLoad` 在运行时通过 `RegisterNatives` 把 Java 的 `executeVM` 绑到 native 实现上，而方法名 `executeVM` 与签名 `([B[Ljava/lang/Object;)Ljava/lang/Object;` 都是运行时现从一张 XOR 表解码出来的，所以 `strings` / JADX 在 so 里搜不到 `executeVM` 、 `VMRunner` 这类明文，这是「静态只见空壳」的另一半原因。

被绑上去的 native `executeVM` 本身是一层薄壳：先 `GetArrayLength` + `GetByteArrayRegion` 把 Java 传入的 `byte[]` 明文字节码拷进 native 缓冲，再连同 `args` 交给真正的 VM 解释器。也就是说 `executeVM(byte[], Object[])` 在 so 里被拆成「JNI 取数组 → 解释器解释」两步：前者可读，后者才是黑盒。

（导出的 `ExecuteProgram` 是另一条入口，走启动 / 整程序路径，与 per-method 的 `executeVM` 不是同一处，不要混用。）

## 二、密钥门：TEE Secure Key

一个很自然的假设是「解密密钥随 APK 一起发，藏在某个 asset 或 so 常量里」。这个假设与观测不符： `readByteCode` 读出来的原始 blob 是高熵密文，头部没有 `\x00IAP` ；APK 里翻不到能用的对称密钥；而同一个 blob，在三绿真机上 `getVmByteCode` 能解出明文，换到非三绿设备就在解密处抛异常。密钥不在包里，它在设备侧，而且跟这台设备绑死。

具体机制是 Android 的 **TEE Secure Key Import**。这些 blob 是 AES/GCM 密文，解密要用的 wrapping key 存在设备 TEE（AndroidKeyStore）里，由 Google Play 的 KeyImportService 下发，走的是硬件包裹密钥导入这套标准流程：

-   设备 TEE 里预置一把出厂、带 Google attestation 背书、用途为 `PURPOSE_WRAP_KEY` 的密钥，它的公钥能被服务端验证；
    
-   服务端把真正的 AES wrapping key，按 `SecureKeyWrapper` （ASN.1，RFC 5652 那套 DER 结构：加密后的传输密钥 + IV + 被包裹密钥的授权列表）加密到这把 attested 公钥上，发给设备；
    
-   设备通过 keystore 的 `importWrappedKey` 把它导进 TEE， **解包只在 TEE 内部完成，AES 明文密钥永远不出 TEE**；
    
-   app 之后只能请求 TEE「用别名为 `pairip_encryption_wrapping_key_137` 的这把 key 解一段密文」，拿回明文结果，但拿不到 key 本身。
    

这套下发有三个硬前提，缺一就失败：从 Play 安装（ `gpdeku` split 提供密钥载体）、设备过 Play Integrity、有登录的 Google 账号。非三绿环境（云机、模拟器）这三条一条都不满足，于是根本走不到密钥导入。

这时不必推测，Play 服务进程（Finsky）的日志已经给出明确结论：

```yaml
SDR: Sending PGS request without wrapping key
E/Finsky: Failed to retrieve anti-tamper encryption key for <pkg>:137, finalImportResult: FAILURE
TS: Sending response with status FAILURE, withWrappingKey: false
KeyImport.Activity: Key import requested extra action
I/<proc>: System.exit called, status: 0
```

注意日志里的 `:137` 和密钥别名 `..._137` 是对上的，指同一把 anti-tamper key。链路很直白：服务端判定环境不可信 → 返 `FAILURE` 、 `withWrappingKey: false` → app 拿不到 key， `VmDecryptor` 解不开任何 blob → 主动 `System.exit(0)` 。 **门在 Google 服务端**，与本地的 hook 无关：即便本地把 `isEncryptionKeyPresent()` 伪造成 `true` ，TEE 里那把 key 也不存在，解密仍然失败。所以在过不了 Integrity 的环境里，这类 app 没有可用的运行路径，客户端层面的对抗无从谈起；需要先解决 Integrity（三绿真机，或用 PlayIntegrityFix），才谈得上后续。

## 三、反篡改：一种信号 hook 结构上拦不住的自毁

拿到密钥只是过了第一道门。三绿真机上直接跑，如果进程里还挂着别的注入模块，启动大约 3 秒后照样自毁。这一层值得单独拆，因为它的处置方式很反直觉， **它不通过任何可以被 hook 的软件原语去杀自己**。

现场是这样：设备上挂着一个会把自己的 `.so` 映射进目标进程的注入模块，这个 `.so` 会出现在目标的 `/proc/self/maps` 里。这个注入框架恰好自带 abort / kill 家族的拦截和日志，反而把 PairIP 自毁的每一步都打了出来：

```ruby
I Inject :install → process=<pkg>, mapped <inject>.so
I Inject :hooked abort / kill / tgkill / pthread_kill / syscall(seccomp)
W Inject :BLOCK abort sig=6, backtrace:
W Inject :#00  <inject>.so
W Inject :#01  libpairipcore.so          ← 自毁是 libpairipcore 发起的
W Inject :abort() neutralized
F DEBUG  :signal 6 (SIGABRT), code -1 (SI_QUEUE)
F DEBUG  : Abort message:'length_error was thrown in -fno-exceptions mode with message "vector"'
F DEBUG  :#01 pc 000000000001c000  libpairipcore.so
F DEBUG  :#02 pc 000000000002a038  libpairipcore.so
```

`abort` 被这个框架中和掉之后，进程没活下来，而是换了个死法，转成 SIGSEGV，另开一份 tombstone：

```
signal (SIGSEGV), 
code (SEGV_MAPERR)

esr0x92000006  (Data Abort, lower EL)
#00pc0000000000028b38libpairipcore.so
#01pc00000000000169a0libpairipcore.so
#02pc000000000001c004libpairipcore.so   ← 紧邻上面 abort 现场的 0x1c000
#03pc000000000002a038libpairipcore.so
Elibsigchain: SettingSIGSEGVtoSIG_DFL
```

把两份 tombstone 串起来，自毁链就完整了：

-   `libpairipcore` 扫 `/proc/self/maps` ，发现一个不该在的 `.so` （注入模块），判定被注入；
    
-   走自毁分支：故意给某个 `std::vector` 喂一个非法的、大于 `max_size()` 的 length。libc++ 在关异常的构建里，这一步不是抛异常，而是 `std::__throw_length_error` 直接 `abort()` 。tombstone 里那句 `length_error was thrown in -fno-exceptions mode with message "vector"` 就是它的指纹， `#01` 落在 `libpairipcore.so` 的 `0x1c000` 附近；
    
-   关键在这： `abort` 被注入框架中和后，控制流并没有回到安全状态，而是让调用方拿着那个已经损坏的 vector（非法 length / 野指针）继续往下跑，紧接着就解引用了一个非法地址 → **SIGSEGV**。注意 SIGSEGV 的回溯 `#02` 落在 `0x1c004` ，正好紧贴 abort 现场的 `0x1c000` ——同一段代码，abort 被堵住后往下走了几条指令就踩了内存；
    
-   最后 `libsigchain: Setting SIGSEGV to SIG_DFL` ：它主动把 SIGSEGV 的处理器复位成系统默认，确保这一次异常不会被链上任何 handler 吞掉。
    

把 `esr 0x92000006` 解一下就更清楚它为什么拦不住。ARM64 的 ESR：EC = bits\[31:26\] = `0x24` 是「从低异常级（EL0）触发的 Data Abort」；IL = bit\[25\] = 1（32-bit 指令）；ISS 里 WnR=0（读操作）、DFSC = bits\[5:0\] = `0x06` （translation fault, level 2）。翻译过来就是： **用户态读了一个没有映射的地址，触发 CPU 硬件同步异常**。这跟 `kill` / `tgkill` / `rt_sigqueueinfo` / `abort` 这些走系统调用、能被 hook 或 seccomp 拦的软件原语完全是两条通路。它是 CPU 在执行那条访存指令时当场产生的。

把 tombstone 里的 `0x1c000` 落回 so 核对，判断就从「据日志推断」变成「有代码实锤」： `0x1c000` 正是 libc++ `std::__libcpp_verbose_abort` （本样本里 `sub_1BF24` ）结尾那条 `BL abort` ——它先 `android_set_abort_message()` 写下 `length_error ... "vector"` 那句话（tombstone 的 abort message 就来自这里），再调 `abort()` 。而 `0x1c004` 就是这条 `BL` 的下一条指令：abort 被注入框架中和（强行返回）后，执行流落到 `0x1c004` 继续，随即踩内存 → SIGSEGV。这印证了前面的判断——abort 只是触发点，真正致命的是它后面那条访存，信号层的中和拦不住。

检测端也能在 so 里对上：枚举「加载了哪些模块」用的是 `dl_iterate_phdr` （遍历 linker 的 link_map，等价于 maps 的模块视图），导入表里还有 `opendir` / `readdir` （目录与 `/proc` 枚举）、 `__system_property_get` 、 `stat` 、 `syscall` （直接系统调用 / seccomp）、 `getauxval` 等检测常用面。这些与文章现场「扫 maps 发现不该在的 `.so` 」是同一件事的两种观测。

这也说明一个常见思路并不成立： **靠「把自杀原语全 hook 掉」来对抗 PairIP 闪退，在结构上行不通**。本次这个注入框架已经拦下 abort、kill 家族，还装了 seccomp（日志里 `abort() neutralized` 、 `hooked syscall(seccomp)` 都已生效），进程仍以 SIGSEGV 收场。原因是它的自毁并不依赖那些原语，而是「制造一次真实的内存越界」，再 `SIG_DFL` 复位以保证不被拦截——信号 hook 在原理上覆盖不到。真正的根因不在处置端，而在检测端：maps 里那个暴露的 `.so` 。正确方向是让注入不出现在 maps 里，而非拦截它自毁的那一步。

顺带把检测面的边界划一下：maps 扫描只是 PairIP 反篡改的一角。独立研究里还记录了 `ptrace` / `/proc/self/status` 反调试、对 frida 的内存特征扫描、以及对自身代码段的 FNV-1a·CRC32 校验（见文末 Yamin Dev）。本文不铺开这张清单，只复现本次现场 **真正触发自毁** 的那条 `maps → abort → SIGSEGV` 链路——因为决定「能不能让它先跑起来」的恰好是这一条，其余检测项在本次注入形态下没被触发。

## 四、完整性校验：hook VMRunner 即自毁

准备脱明文时，最直接的想法是 hook 住 `getVmByteCode` ，把它的返回值取下来。实测这条路走不通，而失败的方式本身又暴露了 PairIP 的第三道防线。

对照着做两件事，差别很干净：

-   **只读枚举**——反射列 `VMRunner` 的方法、列 `com.pairip.*` 的类名（前两节那两张表就是这么拿到的）：进程稳定存活，数据完整。说明用户态反检测 frida 把 frida 自己的存在藏住了，第三节步骤 1 的 maps 扫描没扫到 frida，attach 和反射本身是安全的。
    
-   **hook `VMRunner` 的任一方法**—— `getVmByteCode` （哪怕只在返回处读一下）、 `executeVM` 、 `readByteCode` 都试过：hook 能装上，但进程一旦真的调用到被 hook 的方法，立刻 `libsigchain: Setting SIGSEGV to SIG_DFL` 自毁， `process-terminated` ，一个字节都没 dump 出来。
    

结论是 PairIP 除了扫 maps，还盯着自己 `VMRunner` 这些方法的完整性。frida 的 hook（无论 Java 层 `replaceMethod` 还是底层 Interceptor）本质是改写方法的 ArtMethod 入口：把 `entry_point_from_quick_compiled_code` 指到蹦床上；这个入口一变，被完整性检查（对方法体 / 入口的比对）命中，触发和第三节同款的自毁。

把两种隐藏能力的边界摆清楚，后面选路子就有依据：

| 手段  | 藏住了什么 | 能做  | 不能做 |
| --- | --- | --- | --- |
| 用户态反检测 frida | frida 自身的存在：maps / 端口 / 线程名 | attach、反射枚举、 **调用方法** | hook（藏不住「ArtMethod 被改过」这个事实） |
| 内核级隐身（shadow-PTE 克隆页：原代码页不动，读取走克隆页） | 代码页被改这件事 | 上述全部 + **hook** | —   |

也就是说，要一边 hook VMRunner 一边不被发现，需要内核级隐身；但脱明文另有一条不需要 hook 的路（下一节），于是这层更重的手段可以省掉。

## 五、实战：动态把 28 个 blob 脱成明文

到这里三道门都摸清了，落到操作上就是两步：让进程活到能解密，再用不触发完整性检查的姿势把 blob 逐个解出来。

**让它跑。** 前面已经证明需要两个条件同时成立：过 Integrity（拿密钥）+ 注入不露脸（不被 maps 检测命中）。第一条靠 PlayIntegrityFix 保住，第二条要把那个会映射进目标进程的可见注入模块清掉。这类注入多是 Zygisk 模块，运行时 disable 对已经 fork 出来的 zygote 不生效，得走确定性路线，落 disable 标记再重启：

```
touch /data/adb/modules/<inject-module>/disable   # 下次开机不再加载这个注入
reboot                                             # PIF 保留，三绿不丢
```

重启后确认模块列表里只剩 `playintegrityfix` （可见注入已去），再启动目标。这次进程稳定存活 60 秒以上，不再 3 秒自毁；前台落在 `com.unity3d.player.UnityPlayerActivity` ；Unity 引擎正常初始化、渲染进入可交互态。对照组是非三绿环境，那里引擎根本不启动，进程直接成僵尸。差别正落在「三绿 + 隐藏注入」这两个条件上。

**脱明文，用调用而不是 hook。** 第四节已经证明碰 `VMRunner` 的方法就自毁，但需要的其实是解密结果，不是在解密函数上埋点，而 **调用一个方法并不修改它的 ArtMethod**，完整性检查扫不到。于是把「hook 解密函数」换成「直接调用解密函数」：

`getVmByteCode` 是 `private static` ，frida 反射就能调；内部会自己开 base.apk、按名字定位 zip 条目，不同版本对传入名字要不要带 `assets/` 前缀不一致，所以两种都试一遍取能解出来的那个。

核心 agent 换个 blob 名单就能复用：

```javascript
var VR = Java.use('com.pairip.VMRunner');
NAMES.forEach(function (nm) {
  [nm, 'assets/' + nm].some(function (n) {
try { var b = VR.getVmByteCode(n); if (b && b.length) { dumpToFile(b, nm); return true; } }
catch (e) { return false; }
return false;
  });
});
```

跑下来 28 个 blob 全部解出明文，进程照常存活，落盘 6.3 MB，全程零 hook、零 ArtMethod 改动：

```lua
[dump] calling getVmByteCode on 28 blobs (no hook)
[dump] #1  len=388546  magic=00 49 41 50 "IAP"  [PLAINTEXT]
 ...
[dump] #28 len=204917  magic=00 49 41 50 "IAP"  [PLAINTEXT]
[dump] done: plaintext = 28/28,  process still alive (pidof <pkg> → 20070)
```

解出来的明文，头部如下：

```
00000000:0049 4150 0200 0000 0807 7c4e fc77 0b74   .IAP......|N.w.t
└───┬───┘ └───┬───┘ └────── VM 指令流 ──────
magic \x00IAP  version = 2 (小端)
```

`00 49 41 50` （ `\x00IAP` ）是判断「这段 byte\[\] 是否为解密成功的 VM 明文」的通用标志，跨样本都可用于判定解密是否成功；紧跟着 `02 00 00 00` 是版本号 2；再往后是 PairIP 自研 VM 的指令流。

这里说明下，免得误以为「脱出明文＝能直接读」：这段指令流不是照着表就能翻的。它按目标不同还叠着 per-build 的 **opcode 置换**：同一条 `OP_ADD` ，这个包里可能编号 `0x17` 、换个包就成 `0x8F` ，静态直接照固定表翻指令会立刻 desync（对不齐指令边界，紧接着连长度都算错）；操作数还有一层运行时解码，native dispatcher 又做了控制流平坦化，得靠符号执行逐个认 handler。也就是说本文停在的 `\x00IAP` 明文，是反虚拟化的 **原料** 而不是 **成品**；这一阶段真正的难点在文末 Haxymad（多态 opcode + 内层 RC4 解码 + 平坦化 dispatcher）和 MatrixEditor（指令集与反汇编 / 反编译工具）里有专门处理。

到这一步，反虚拟化的原料（28 段明文字节码）已经全部获得，指令集分析 / 反虚拟化属下一阶段，不在本文范围。

## 附录

关键 FQN：

```
com.pairip.StartupLauncher
com.pairip.VMRunner            executeVM(native) / invoke / getVmByteCode / readByteCode / openBaseApk
com.pairip.VmDecryptor
com.pairip.SignatureCheck      ($SignatureTamperedException)
com.pairip.InitContextProvider
com.pairip.application.Application
com.pairip.licensecheck.LicenseClient
```

## 工具:

| 工具  | 用途  |
| --- | --- |
| jadx-headless-mcp | dex 反编译 |
| ida-pro-mcp | so 反汇编 / 伪代码 |
| Claude Opus 5 | AI 辅助分析 / 编排 |

## 参考文章点击“阅读原文”

\*本文为看雪论坛优秀文章，由 星野安全 原创，转载请注明来自看雪社区
