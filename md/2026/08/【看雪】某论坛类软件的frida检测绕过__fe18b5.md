---
title: 【看雪】某论坛类软件的frida检测绕过
source: https://bbs.kanxue.com/thread-292796.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-28T11:29:37+08:00
trace_id: 0322bb21-a088-4296-90cb-2377277afce2
content_hash: 3ad1815b6fc5659f7838a5dc648aa9550ef57d62ef122d8316a52f45cc403ddb
status: synced
tags:
  - 看雪
  - Frida
  - 协议分析
series: null
feed_source: 看雪·Android安全
ai_summary: 某论坛类 APP 的登录 RSA 加密与 Frida 检测机制已被完整逆向：登录密码用 RSA 公钥 + PKCS1v15 加密，反调试由 `libmsaoaidsec.so` 在 `_init` 构造器中检测 Frida 并通过 `_exit(0)` + SIGSEGV 自杀，root 设备直接替换补丁后的 .so 可保持原签名绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ca75244-d011-812b-bc1b-ced277272ca5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 某论坛类 APP 的登录 RSA 加密与 Frida 检测机制已被完整逆向：登录密码用 RSA 公钥 + PKCS1v15 加密，反调试由 `libmsaoaidsec.so` 在 `_init` 构造器中检测 Frida 并通过 `_exit(0)` + SIGSEGV 自杀，root 设备直接替换补丁后的 .so 可保持原签名绕过。
> 
> - **登录加密链路：** `loginByPassword` → `rSAUtils.encryptByPublicKey`，明文先 UTF-8 转字节，再用 RSA（默认 2048 位）PKCS1v15 加密，最后 Base64，公钥是 ASN.1 DER 编码后的字符串。
> - **检测载体：** `com.xxx.platform.oaidkit.OAIDInitializer` 在后台线程通过 `System.loadLibrary("msaoaidsec")` 加载 `libmsaoaidsec.so`，检测代码位于 `DT_INIT` 构造器 `_init @ 0x14400`，并用控制流平坦化状态机混淆。
> - **检测手段：** 共识别 10 类检测，包括读 `/proc/<pid>/task/<tid>/stat` 看线程 state 是否为 `t/T`、扫描 `/proc/self/maps` 找 frida/gum/linjector、遍历 fd 找 frida socket/pipe、`dl_iterate_phdr` 模块枚举、linker 完整性校验、模拟器特征、系统属性等，部分逻辑在 zlib 解压的 VM 字节码中。
> - **自杀机制：** 检测到 Frida 后先 `_exit(0)` 干净退出，再通过链表中故意解引用 `ldrb w8,[x20,#0x188]` 触发 SIGSEGV 兜底崩溃。
> - **绕过方法：** 直接 patch 检测函数为 `mov w0, #0; ret` 恒返回“未检测到”（线程 state/fd maps 等入目录），用 Python 脚本生成补丁 .so 并重打包 APK；但因存在运行时签名自校验，静态替换 .so 重签名不可行，root 设备直接替换已安装 APK 解压后的 .so 保留原签名才有效。

感慨一下AI的强大，让以前很费时间和很大难度的事情变得简单

1.逆向登录(主要逆向登陆的加密算法)

一般来说登陆的密码加密的过程是

> loginByPassword  
> getRSAKey  
> geetest ← 极验验证码相关  
> rsa_public_key  
> password  
> MIGf ← RSA 公钥 DER 的 Base64 前缀（1024位）  
> MIIBIj ← RSA 公钥前缀（2048位）  
> Cipher  
> PKCS1

用jadx打开该软件发现源代码的类名都被混淆成各个字母，但是Android这个类名还是很显眼的，仅是将类名混淆，方法名一般便于阅读不好混淆，直接查找 loginByPassword，看一下那个方法引用这个函数

找到了login方法(这很明显)，该方法中检验到空行会有NullPointerException异常报告

> PorteH5logUtils.INSTANCE.report("porte", "password_login", o0.M(C17133r0.a("msg", username)));

这个函数记录登录的日志

> loginByPassword(activity, "", username, password, iLoginCallback);

这个应该就是加密的核心函数，进入这个函数

> HashMap<String, Object> mapM = o0.M(C17133r0.a(LoginFragmentsKt.ARG_PARAM_ACCOUNT, rSAUtils.encryptByPublicKey(str2)), C17133r0.a("password", rSAUtils.encryptByPublicKey(str3)));

核心是rsa加密，要找到公钥

而rsa的公钥是(n,e),其加密为y = xe mod n

但是找到的密钥确是字符串，其由公钥加密的过程如下

> n (128字节) + e (65537)  
> │ ASN.1 DER 逐层包裹  
> ▼  
> 30 81 9f ─ SEQUENCE（外层）  
> ├─ 30 0d ─ SEQUENCE（算法标识）  
> │ ├─ 06 09 2a864886f70d010101 ─ OID  
> │ └─ 05 00 ─ NULL  
> └─ 03 81 8d 00 ─ BIT STRING  
> └─ 30 81 89 ─ SEQUENCE（RSAPublicKey）  
> ├─ 02 81 81 00 + n ─ INTEGER n  
> └─ 02 03 01 00 01 ─ INTEGER e (=65537)  
> │ Base64  
> ▼  
> "M\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*B"

再根据

> byte\[\] bytes = data.getBytes(C16501g.f587422b)  
> CryptoExtendKt.toBase64String(encryptByPublicKey(bytes, CryptoExtendKt.fromBase64("公钥")

这是对于明文的加密就清楚了，明文->字节->rsa加密->base64加密

当然解密需要的私钥是在客户端，我这边肯定拿不到，这里只是简单学习一下登陆的加密和解密算法

> \`python  
> from cryptography.hazmat.primitives.asymmetric import rsa, padding  
> import base64  
>   
> \# ===== 密钥占位：公钥 / 私钥 =====  
> 私钥 = rsa.generate_private_key(public_exponent=65537, key_size=2048)  
> 公钥 = 私钥.public_key()  
>   
> \# ===== 1. 加密（客户端，持有【公钥】）=====  
> def encrypt_by_public_key(明文, 公钥):  
> 密文 = 公钥.encrypt(明文.encode('utf-8'), padding.PKCS1v15())  
> return base64.b64encode(密文).decode()  
>   
> \# ===== 2. 解密（服务端，持有【私钥】）=====  
> def decrypt_by_private_key(密文, 私钥):  
> 明文 = 私钥.decrypt(base64.b64decode(密文), padding.PKCS1v15())  
> return 明文.decode('utf-8')  
>   
> \# ===== 3. 往返 =====  
> 结果 = decrypt_by_private_key(encrypt_by_public_key('测试密码', 公钥), 私钥)  
> print(结果) # 测试密码

## 2.frida检验绕过

## 2.1过frida检验中使用到的工具

| 工具  | 版本  |
| --- | --- |
| Frida | 17.17.0(高版本纯是因为一次更新将手机从Android13更到Android16只有高版本适配) |
| Capstone | python 版（arm64 反汇编） |
| apksigner / zipalign |     |
| java / keytool | java17\\jdk-17.0.17+10\\bin\` |
| apktool | `apktool.bat` (2.12.1) |
| 设备  | Pixel 6 (oriole), Android 16, rooted |

## 2.2对于libmsaoaidsec.so中检验函数的总览

| 维度  | 内容  |
| --- | --- |
| 检测载体 | `libmsaoaidsec.so` （MSA OAID SDK 安全组件，JNI 类名 `NagaLinker` v8.83，688KB arm64 stripped） |
| 引入方 | `com.xxx.platform.oaidkit.OAIDInitializer` → `Nd.g.loadLibrary` → `System.loadLibrary("msaoaidsec")` |
| 触发时机 | 启动早期后台线程（Thread-2）， `linker64 __dl_soinfo::call_constructors` 阶段 |
| 检测代码位置 | `DT_INIT` 构造器 `_init @ 0x14400` （`.init_array` 6 项全为 0，构造并入 `_init` ），控制流平坦化状态机 |
| 自杀机制 | `_exit(0)` 干净自杀 + SIGSEGV 野指针崩溃兜底（双保险） |
| 绕过结论 | 静态.so 补丁 + 重签名 **不可行** （运行时签名自校验）； **root 替换.so（保原签名）可行且有效** |

## 2.3调用链与backtrace

**调用链**

```
Thread-2 (tid=11100)
  └─ com.xxx.platform.oaidkit.OAIDInitializer.initOAID$lambda-1
       └─ com.xxx.platform.oaidkit.OAIDInitializer.a
            └─ com.xxx.platform.oaidkit.c.run
                 └─ Nd.f.f → Nd.f.i → Nd.f.j
                      └─ Nd.g.loadLibrary
                           └─ java.lang.System.loadLibrary("msaoaidsec")
                                └─ Runtime.loadLibrary0
                                     └─ JVM_NativeLoad
                                          └─ android_dlopen_ext
                                               └─ linker64 __dl_do_dlopen
                                                    └─ __dl_soinfo::call_constructors
                                                         └─ libmsaoaidsec.so (.init_array 构造器)  ← 检测在此执行
```

**backtrace**

```bash
#00 pc 0x0020d10  libmsaoaidsec.so                    ← 崩溃触发点:检测分支/非法指针解引用(兜底崩溃)
#01 pc 0x0011f64  libmsaoaidsec.so                    ← 检测逻辑内部调用
#02 pc 0x00095f8  libmsaoaidsec.so                    ← 检测逻辑内部调用(VM/混淆块)
#03 pc 0x0014824  libmsaoaidsec.so                    ← _init 状态机入口(构造器)
#04 linker64 (__dl_soinfo::call_constructors+556)     ← 链接器执行该 so 的构造器
#05 linker64 (__dl_do_dlopen)                          ← dlopen 主流程
#06 linker64 (__dl_dlopen_ext)                         ← dlopen 扩展入口
#07 libdl.so (android_dlopen_ext+16)                   ← libdl 转发给 linker64
#08 libnativeloader.so (NativeLoaderNamespace::Load)   ← 系统 native loader:选择命名空间
#09 libnativeloader.so (OpenNativeLibrary)             ← 打开 native 库
#10 libart.so (JavaVMExt::LoadNativeLibrary+832)       ← ART 虚拟机加载 native 库入口
#11 libopenjdkjvm.so (JVM_NativeLoad+368)              ← JNI 层调用系统加载
#12-14 boot.oat (Runtime.loadLibrary0)                 ← Java 层 ART 运行时
#15 boot.oat (java.lang.System.loadLibrary+84)         ← ★ Java API:加载库
#16 libart.so (nterp_helper)                           ← ART 解释器(由解释执行进入)
#17 classes9.dex (Nd.g.loadLibrary+6)                  ← ★ 混淆加载器:构造 "msaoaidsec" 并调用 loadLibrary
#18 libart.so (nterp_helper)                           ← ART 解释器
#19 classes9.dex (Nd.f.j+48)                           ← 混淆类 Nd.f 内部(分派链)
#20 libart.so (nterp_helper)
#21 classes9.dex (Nd.f.i+38)                           ← 混淆类 Nd.f 内部
#22 libart.so (nterp_helper)
#23 classes9.dex (Nd.f.f+2)                            ← 混淆类 Nd.f 内部
#24 libart.so (nterp_helper)
#25 classes4.dex (OAIDInitializer.initOAID$lambda-1+150) ←  OAID 初始化 lambda
#26 libart.so (nterp_helper)
#27 classes4.dex (OAIDInitializer.a+6)                 ← OAID 初始化辅助方法
#28 libart.so (nterp_helper)
#29 classes4.dex (com.mihoyo.platform.oaidkit.c.run+26) ← 后台线程 run()
#30 boot.oat (java.lang.Thread.run+64)                 ← 线程入口
#31 libart.so (art_quick_invoke_stub)                  ← ART 方法调用桩
#32 libart.so (art::ArtMethod::Invoke)                 ← ART 反射/调用方法
#33 libart.so (art::Thread::CreateCallback)            ← 线程创建回调
#34 libart.so (art::Thread::CreateCallbackWithUffdGc)  ← 线程创建(带 GC)
#35 libc.so (__pthread_start)                          ← pthread 线程入口
#36 libc.so (__start_thread)                           ← 线程启动
```

既然检测发生存在native层，那就要要看一下so文件是怎么加载的

System.loadLibrary("msaoaidsec") -通过JNI---> JVM_NativeLoad (libopenjdkjvm.so) ->linker64动态链接器

当然在原来的包中并没有直接的System.loadLibrary("msaoaidsec") ，msaoaidsec在原来包中进行了字符串混淆(无法通过jadx直接找到)，只要在执行程序后才复原

## 2.4检测机制分析

### 首先看一下这些检测函数都在

![1](https://bbs.kanxue.com/plugin/chao_editor/rich_text/themes/default/images/spacer.gif)

检测函数都在init_process函数中

### 检测函数清单与顺序

| #   | 通道  | 字符串 | 函数  | 判定逻辑 | 证据  |
| --- | --- | --- | --- | --- | --- |
| 1   | 线程 state 反附加 | `/proc/%d/task/%s/stat` @0x3051b | `sub_1B730` | 逐线程读 stat，state 字符 `'t'` (TASK_TRACED)/ `'T'` (TASK_STOPPED) → 返回 **777** | 反编译逐条对应（ `(s\|0x20)==0x74 && s[i+2]==' '` ） |
| 2   | maps 特征扫描 | `/proc/self/maps` 、 `/proc/%u/maps` @0x2f6b0 | 0x20bdc(崩溃点)、0x18a0c、0xf438、0x167a8 | 扫 frida/gum/linjector 映射 | stream_1 = fopen("/proc/self/maps", "r") 打开maps并解析每行内容返回给回调函数 |
| 3   | fd 句柄扫描 | `/proc/self/fd/%s` @0x305e7、 `fd/%d` @0x3098e | 0x1c168、0x25ce4 | 遍历 fd 查 frida socket/pipe | 字符串引用定位 |
| 4   | cmdline 检查 | `/proc/%d/cmdline` @0x2f838 | `_init` 块 0x14788（+0x3CC）、0x11f38、0x1b144、0x23748、0x23b38、0x2703c | `fopen(...,"r")` + `strchr(':')` | 运行时首个 /proc 访问 |
| 5   | 模块枚举 | 导入 `dl_iterate_phdr` | —   | 遍历已加载.so 匹配 frida 特征 | 动态符号表 |
| 6   | linker 完整性 | `/system/bin/linker64` 等 @0x306fd | 0x2082c（被 0x20bdc 调） | 校验当前 linker 路径 | 引用 @0x20850/0x20890 |
| 7   | 自研 ELF 加载器 | `LIBVIEW!` @0x2f68a、 `Can't find library file %s` 等 | 0xd1f8、0xdf74 等 | 自行加载/校验库，识别伪装 | 字符串+候选库名 `opqrstuvwxyz.so` / `libhdog.so` 等 |
| 8   | 系统属性 | `ro.build.version.sdk` @0x2f8d2、 `persist.sys.dalvik.vm.lib` @0x2f937、 `security_patch` | 0x123f0、0x12550、0x12440 | 环境/运行时识别 | 反汇编 |
| 9   | 模拟器 | `/data/dalvik-cache/x86` 、 `/system/fake-libs/` | 0x23748、0x18b3c | 模拟器/fake 库特征 | 字符串 |
| 10  | 加密 VM 载荷 | 导入 `inflate` / `crc32` | 全库  | 部分检测逻辑在 zlib 解压的 VM 字节码中动态展开 | \*\*动态符号表 |

1.  线程 state 反附加
    
    ```cpp
    if ( ((unsigned __int8)s_[(unsigned int)(v11 + 1)] | 0x20) == 0x74 && s_[(unsigned int)(v11 + 2)] == ' ' )
              return 777;
    ```
    
    6.linker完整性检验
    
    ```
    stream_3 = sub_20B04("/system/bin/linker64");
     if ( stream_3
       || (stream_3 = sub_20B04("/bionic/bin/linker64")) != 0
       || (stream = (FILE *)sub_20B04("/apex/com.android.runtime/bin/linker64"), (stream_3 = (__int64)stream) != 0) )
    ```
    
    8.系统检验
    
    ```
    _system_property_get("ro.build.version.sdk", nptr_);
    _system_property_get("ro.build.version.release_or_codename", s);
    ```
    
    检测Android版本号
    
    ```
    if ( !(unsigned int)_system_property_get("persist.sys.dalvik.vm.lib", haystack) || *off_47FB8 >= 21 )
        _system_property_get("persist.sys.dalvik.vm.lib.2", haystack)
    这是检测jvm，吗
    ```
    
    获取 Dalvik/ART 虚拟机的库文件路径
    

9.模拟器检测

```
if ( sscanf(s__1, "%lx-%lx %s %lx %s %ld %s", &v24, &v23, &v28, &v21, &v26, &v22, s) == 7
          && strstr(s, "/data/dalvik-cache/x86") )
```

### 检测执行顺序

| 顺序  | 状态值 | 动作  |
| --- | --- | --- |
| 1   | `0xa0ba64ce` | 栈上分配 0x7d0 缓冲区 |
| 2   | `0x000e3ba313` | 调 0x123f0（读 `ro.build.version.sdk` ）、0x12550（读 `persist.sys.dalvik.vm.lib` ），存全局 @0x47000+0xfb8 |
| 3   | `0x1627d0c0` | 调 0x12440（属性二次检查） |
| 4   | `0x9f46953a` | `cmp #0x17` 置 SDK 版本标志 |
| 5   | `0x9c5eb96f` | 按标志分支 |
| 6   | `0x76541a4f` | 置全局标志 @0x47000+0xed8 |
| 7   | `0xbb1e2113` | **调 0x25a48 早期门控**； `tst w0,#1` → 奇数则 `_init` 提前正常返回 |
| 8   | `0x5b4c847c` | 缓冲区初始化 |
| 9   | `0x23d89166` | **cmdline 检查** （ `/proc/%d/cmdline` ，运行时首个 /proc 访问） |
| 10  | `0x65c6d61d` | 拷贝 + `strchr(':')` 解析 |
| 11  | `0x7f89508c` | 分支  |
| 12  | `0x398f5683` | 调 0x1bec4 |
| 13  | `0xb945dffa` → `0x19437fab` | 调 0x13728、0x23ad4 |
| 14  | `0xf4587fb0` | **调 0xc830** （决定是否进入主检测） |
| 15  | `0x01fb9186` | `cmp #1` ：=1→进入主检测 0x95c8；否则走 0x9150 出口 |
| 16  | `0x8b2a9a8c` | **调 0x95c8 主检测函数** （崩溃栈 #03 所在块） |

**0x95c8 主检测内部**： `0x95c8 → 0x11f38 → 0x20bdc（maps+linker+崩溃点 0x20d10）` ；另经函数指针表间接分发调用 0x18a0c（maps）、0x1b730（线程 state）、0x1c168/0x25ce4（fd）。

**总的检测顺序**：属性预检 → SDK 版本门控 → 早期门控 0x25a48 → cmdline → maps →（0x1bec4/0x13728/0x23ad4/0xc830 门控链）→ 主检测 0x95c8（cmdline 复查 → maps+linker → 线程 state → fd）→ 判定异常 `_exit(0)` + SIGSEGV 兜底。

### 自杀机制

| 步骤  | 行为  | 证据  |
| --- | --- | --- |
| 8a  | `_exit(0)` 干净自杀 | spawn 日志 `### DETECT: _exit(0x0) @ thread=11102` |
| 9a  | 野指针解引用 SIGSEGV 兜底 | tombstone `fault addr 0x1aa568 = x20(0x1aa3e0)+0x188` ， `0x20d10: ldrb w8,[x20,#0x188]` （链表遍历中故意解引用） |

崩溃栈（frida spawn 触发）：

```
#00 0x20d10 → #01 0x11f64 → #02 0x95f8 → #03 0x14824(_init) → #04 linker64 call_constructors
```

寄存器 x23-x28 与 `_init` 状态机魔数 `0xbb1e2113/0x0e3ba312/0xde366c1c/0x19437faa/0x4f03bfb2` 逐一对应，证明崩溃发生在 `_init` 内。

## 2.5通过脚本绕过

总的来说多余Frida

```bash
frida 足迹（被检测到的现象）
  ├─ 线程被 ptrace 停止   → 0x1b730 读 /proc/<pid>/task/<tid>/stat → state='t'/'T' → 返回 777
  ├─ frida 的 fd/socket   → 0x1c168/0x25ce4 读 /proc/self/fd/*      → 发现 frida 句柄
  ├─ frida 的内存映射     → maps 扫描回调（0x18a0c 的 a1+24）         → 命中 rwxp/路径
  └─ 模块枚举 dl_iterate_phdr → 找到 frida-agent 模块
        │ 任一命中
        ▼
   置全局"检测到"标志
        │
        ▼
   _exit(0) 干净自杀  +  SIGSEGV 野指针兜底（0x20d10 链表遍历故意解引用）
```

解决办法是让检测永远输出未检测到

把检测函数本身改成 mov w0, #0; ret—— *检测逻辑还没算，直接返回"未检测到"*： 0x1b730 线程 state 检查 → mov w0,#0; ret 恒返回 0（原来 frida 下会返回 777） 0x1c168 fd 扫描 → mov w0,#0; ret 恒返回 0 0x25ce4 fd 扫描 → mov w0,#0; ret 恒返回 0

hook脚本的是附件 patch_libmsaoaidsec.py

spawn_detect.js主要是定位检测函数的脚本

catch_exit.js是为了、"进程被杀日志丢失"问题

## 2.6 签名校验(只是简述)

patch_libmsaoaidsec.py会生成补丁后的so文件，而repack_apk.py是将 `**` 补丁后的so文件塞入apk中，这就导致了签名发生改变，所以要进行一定操作让签名保持不变

流程：解包 → patch libmsaoaidsec.so → 重打包（zipfile 剔除旧签名）→ zipalign → apksigner 签名（v2+v3）→ adb install。

主要思路：`.so` 在 APK 中为 **deflate 压缩** （ `extractNativeLibs=true` ），系统安装时解压到 `/data/app/.../lib/arm64/` 。root 直接替换已安装的.so， **签名保持原版** （绕过签名自校验），补丁库消除检测。

* * *

## 评论

> **fyrlove · 2 楼**
> 
> 文章中那么多段空白的地方，是什么内容？图片吗？ 检查一下哈

## 附件

- [catch_exit.js](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/08/75ed539fce8068c1.js) （4.40kb，0次下载）
- [spawn_detect.js](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/08/fabad6da46367f6f.js) （4.20kb，0次下载）
- [repack_apk.py](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/08/8921b5e28c65c60d.py) （2.44kb，0次下载）
- [patch_libmsaoaidsec.py](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/08/fcfd021708fc160f.py) （2.01kb，0次下载）
