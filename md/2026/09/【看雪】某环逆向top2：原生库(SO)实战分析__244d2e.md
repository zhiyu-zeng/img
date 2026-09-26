---
title: 【看雪】某环逆向top2：原生库(SO)实战分析
source: https://bbs.kanxue.com/thread-293051.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-26T11:41:22+08:00
trace_id: 5de7b883-fcf3-4319-aed2-c10f85214de4
content_hash: 8b0ca248d46ee3e7221601dea266800b5bb2ff450ada6ac32729212aaed86381
status: synced
tags:
  - 看雪
  - Android逆向
  - Frida
series: null
feed_source: 看雪·逆向工程
ai_summary: 13 个 .so（259 MB）的逆向靠"IDA 破平坦化 + Qiling 原生拟真 + unidbg 真 JNIEnv"三件套互补，能扒出协议、IM 接口与算法地址，但拿不到平坦化内核。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3e775244-d011-81c8-ad9a-ea59f8f43997
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 13 个 .so（259 MB）的逆向靠"IDA 破平坦化 + Qiling 原生拟真 + unidbg 真 JNIEnv"三件套互补，能扒出协议、IM 接口与算法地址，但拿不到平坦化内核。
> 
> - **工具分工：** IDA（idat 脚本模式）出可读 C，Qiling 出 syscall/文件行为轨迹，unidbg 用真 DalvikVM 调 JNI 方法触发真分支，三者互补而非替代。
> - **环境坑：** pip 上的 `qiling` 是空壳，须源码装（1.4.11）；工作目录路径不能含中文（否则 `UnicodeEncodeError: latin-1`）；IDA 9.4 无 `idc.get_imagebase`，未重定位 .so 用文件 vaddr 且不加 imagebase。
> - **Qiling 关键动作：** 它不自动重定位 GOT（libmxcore 有 512 条 `.rela.plt`），须手动分配桩地址回填 GOT、hook 分发并 auto-map 未映射页，`JNI_OnLoad` 才跑通。
> - **函数级战果：** libUnreal.so（237 MB、50.7 万函数）定位 AES/Oodle/IoStore 密钥（`0xcdbc40` 32B AES-256）；libmxcore.so 的 `sub_46AA74` 是 SSL_write 包装（抓包 hook 点）；javasupport 有 273 个 `pwim_*`（hook `pwim_1send_1message` 得 IM 明文）；libkycgm.so 仅 3 个导出（SM2/SM4-CBC）。
> - **能力边界：** 核心控制流平坦化未被打开，JNIEnv 全被 stub 成 ret0，检测依赖运行期真参数——更深需反平坦化或真机。

> 只讲 **怎么把.so 扒开、扒到了什么**：环境怎么搭、IDA/Qiling/unidbg 各自怎么用、踩了哪些坑、拿到哪些 **函数级** 数据。  
> 数字/地址均为 **本地实测** （脚本见 `scripts/` ，库见 `so/` ）。  
> 规模： **13 个.so，259 MB**。

* * *

## 分析线路图（总览）

**总流程** （拿到.so → 到"看清行为 + 扒出接口"）：

```python
拿到 .so
   ↓
① 静态摸底 ── 导出符号 / 字符串 / 熵扫描        （rz-bin·strings·entropy_scan.py）
   ↓
② IDA 反编译 ── 破控制流平坦化，出可读 C        （idat + Hex-Rays）
   ↓
③ xref 追链 ── 谁调用谁 / 常量被谁引用           （capstone·find_callers_of.py）
   ↓
④ Qiling 拟真 ── 补重定位+打桩，跑 init，hook syscall/文件  （qiling_harness.py）
   ↓
⑤ unidbg 真 JNIEnv ── 调 native 方法 / 触真分支   （*.java 探针）
   ↓
⑥ 跨层取数据 ── hook 拿网络/消息明文            （Frida：SSL_write / pwim_*）
```

```

  The "iframe" tag is not supported by your browser.
```

**按目标选路** （省时间）：

| 想看什么 | 走哪步 | 工具  |
| --- | --- | --- |
| 这库是干嘛的 | ①   | `strings` / 导出符号 / 熵 |
| 函数内部逻辑 | ②   | IDA（idat） |
| 谁调用谁、常量引用 | ③   | capstone / xref |
| 运行时读什么文件/调什么 | ④   | Qiling |
| 调 native 方法、触真分支 | ⑤   | unidbg |
| 抓网络 / IM 明文 | ⑥   | Frida（ `SSL_write` / `pwim_1send_1message` ） |

**三工具分工** （互补，非替代）：

| 工具  | 层   | 干什么 | 产物  |
| --- | --- | --- | --- |
| **IDA** | 静态  | 反编译 / 破平坦化 | 可读 C |
| **Qiling** | 纯原生拟真 | syscall / 文件访问 | 行为轨迹 |
| **unidbg** | 真 JNIEnv | 调方法 / 触发真分支 | JNI 轨迹 |

**落到本样本** （各库该走哪条）：

```python
libUnreal.so (237MB 引擎)   → ② IDA 定位段/函数(AES/Oodle/密钥)
libmxcore.so  (IM+网络)      → ① strings 摸能力面 → ④ Qiling 证实 SSL_write 包装
libmxcore_javasupport.so     → ② idat 列出 140 个 pwim_* 导出
libkycgm.so   (国密)         → ② idat 列 3 个导出(sm2Encrypt/sm4Cbc*)
```

* * *

## 0\. 为什么主战场在 SO

```python
dex（Java）= 各 SDK 的 JNI 桥（登录/支付/实名）
  └─ .so = 引擎 + 社交 + 加密 的真实实现
       └─ 资源 = main.obb.png（UE IoStore）
```

**游戏逻辑不在 dex，在 `libUnreal.so` （UE 5.6.1）；网络/加密在 `libmxcore.so` 、 `libkycgm.so` 。**  
dex 反编译只是"目录"，真东西在 `.so` 。

* * *

## 1\. 环境搭建（真实踩的坑）

| 组件  | 版本/来源 | 坑   |
| --- | --- | --- |
| **Qiling** | **1.4.11，源码装** `pip install D:\qiling\qiling-master` | ⚠️ **pip 上的 `qiling` 是空壳**，必须源码装 |
| Qiling rootfs | 独立仓库 `qilingframework/rootfs` ，取 **`arm64_android`** | —   |
| Qiling 依赖 | `python-registry gevent multiprocess questionary windows-curses` | `python-fx` / `pillow` 在 Py3.14 编译失败，可跳过 |
| **工作目录** | `D:\qiling\work\` | ⚠️ **路径不能含中文** （ `异环` → `UnicodeEncodeError: latin-1` ） |
| **IDA** | Pro **9.4** （ `idat.exe` ） | 用 **脚本模式** （不开 GUI） |
| **unidbg** | JDK + Maven | 写 Java 探针（见 `unidbg/` ） |
| **Frida** | frida-tools + node | `.js` 用 `node --check` 校验 |

* * *

## 2\. 分析方法：IDA + Qiling + unidbg

### 2.1 IDA（idat 脚本模式）—— 静态反编译

```bash
"D:\IDA Pro 9.4.260714\idat.exe" -A -S"scripts\ida_analyze_so.py" so\libUnreal.so
```

-   **能破控制流平坦化**：Hex-Rays 的 F5 把状态机还原成可读 C（纯 capstone 做不到）。
-   **血泪坑**：
    1.  未重定位的 `.so` 用 **文件 vaddr**， **别加 imagebase**；
    2.  **从已知指令边界起** 反汇编（如 `stp x29,x30` / `.text` 起点），别用 `addr-0x18` 乱试；
    3.  IDA 9.4 **没有 `idc.get_imagebase`**。
-   脚本一次可直接导出： **JNI 导出 + 命名符号 + 各函数地址** （下文的地址都是它出的）。

### 2.2 Qiling —— 纯原生拟真（工程活最多）

**最大的坑：Qiling 不自动重定位 GOT。** 直接执行必崩：

```python
PLT 0x9f7e0 读 GOT[0xb0d900]（对应导入 __errno）
  槽内是文件原值 0x9e2c0（PLT 惰性解析桩，未加基址）
  → br x17 跳到裸地址 0x9e2c0 → 未映射 → UC_ERR_READ_UNMAPPED
```

**解法（三步）**：

1.  解析 `.rela.plt` （libmxcore 有 **512 条重定位**）；
2.  给每个导入分配 **桩地址**，手动 **回填 GOT**；
3.  hook 桩做分发（模拟 libc 语义 + 返回默认值）。  
    再加 **auto-map 未映射页** → `JNI_OnLoad` 才能完整跑通。

Harness（可直接调任意函数）：

```python
from qiling_harness import Harness
h = Harness(SO, ROOTFS)                        # 自动打桩 512 个导入
h.call(0x46AA74, [ctx, idx, buf, len, out])    # 调 SSL_write 包装
```

### 2.3 unidbg —— 真 JNIEnv（能触到真分支）

`AndroidARM64 + 真 DalvikVM` ： `vm.callJNI_OnLoad()` / `callStaticJniMethod(...)` 。

**打通 ClassLoader → DEX 链** （修了 4 处 `unidbg/MyJni.java` ）。实测 JNI 轨迹：

```python
FindClass(java/lang/Class).getClassLoader()      => BaseDexClassLoader
  GetFieldID(pathList); GetObjectField           => DexPathList
  GetFieldID(dexElements); GetObjectArrayElement => Element
  GetFieldID(dexFile); GetObjectField            => DexFile
  GetFieldID(mFileName); GetObjectField          => "/data/app/.../base.apk"
  String.getBytes("GB2312")                      => byte[42]   ← 对路径做 GB2312 哈希
```

| 问题  | 修法  |
| --- | --- |
| `getClassLoader` 返回类型不对（对象类≠字段注册类） | 返回 `dalvik/system/BaseDexClassLoader` 对象 |
| 字段名收到的是 **完整签名** `C->pathList:L...` | 解析签名取 **裸字段名** 再匹配 |
| `DexFile.mFileName` 返 null | 补返回路径串 |
| `String.getBytes("GB2312")` NPE | 补 `getBytes` → 返回 `ByteArray(GB2312)` |

产物： `unidbg/*.java` （探针）。

* * *

## 3\. 逐库拆解（函数级）

### 3.1 libUnreal.so（237 MB）—— 引擎主库

`idat` 实测规模： **507,275 个函数 / 192,529 条字符串 / `.symtab` stripped** （函数名均 `sub_XXX` ）。

段布局（实测）：

| 段   | 起   | 止   | 说明  |
| --- | --- | --- | --- |
| .rodata | 0xaa400 | 0xfda03c | 串/常量 |
| **.text** | 0x24de000 | 0xbcdbc10 | **~160 MB 代码** |
| .data.rel.ro | 0xbce2880 | 0xe1ceac8 | 只读指针 |
| .init_array | 0xe1cead8 | 0xe1d3548 | 构造器 |
| .data | 0xe1eaf80 | 0xe220480 | 可读写 |
| .bss | 0xe220480 | 0xe715835 | 运行时 |

定位到的子系统（**地址实测**）：

| 子系统 | 函数  | 判定  |
| --- | --- | --- |
| OpenSSL AES | `sub_267EC98` (AES_encrypt) / `sub_267EF30` (AES_decrypt) / `sub_267FB74` (密钥扩展) | Te0 `dword_CE2BB0` + S-box `byte_CE3BB0` |
| AES 类 | `sub_ABFA760` (SetKey， `if(*(a2+8)!=16) return 2` → **强制 16B=AES-128**) / `sub_ABFA9A8` (Encrypt) / `sub_ABFA8E0` (Decrypt， **ECB 无 IV**) | S-box `E886B4` (enc)/InvS-box(dec) |
| Oodle | `sub_B587284` (OodleLZ_Decompress 包装) / `sub_B588538` (Compress) | 14 处报错串都指向它 |
| IoStore 密钥 | 偏移 `0xcdbc40` （32B AES-256） | key-provider 回调 `0x9a93d08` |

> ⚠️ 有大量 **高熵块** （代码被加密/混淆）→ 不硬啃， **按目标函数用 idat 定位**。

### 3.2 libmxcore.so（11.6 MB）—— 社交/网络核心

`idat` ： **0 个 JNI 导出 / 20,205 个命名符号**。 `strings` 命中的能力面：

| 类   | 命中（节选） |
| --- | --- |
| **OpenSSL** | `RSA-PSS` / `SSL_use_certificate` / `X509_*` / `BIO_connect` |
| **TLS 协议栈** | `tls_construct_*` / `tls_parse_*` / `dtls_*` / `ossl_statem_*` |
| **加密算法** | `DES-EDE-ECB` / `IDEA-CBC` / **`SM4-CFB1`** / `RSA-MD2` / `ECDHE-RSA-*` / `AES` |
| **网络** | `socket` / `BIO_connect` / **curl** （ `CURLSH` / `CURLOPT` ） |
| **完整性** | `ASN1_item_sign` / `PKCS7_verify` |

-   内嵌 **完整 curl + OpenSSL + Mozilla CA 根束** （ `Bundle of CA Root Certificates` ，SHA256 `d820b869…282dd9a2` ）→ **自走 TLS、证书固定在此**；
-   厂商串 `Beijing Perfect World Software` → 完美世界。

**动态证实 SSL_write 包装 `sub_46AA74`** （Qiling 喂参跑通）：

```python
sub_46AA74(ctx, idx, buf, len, out)
  LDR X0,[ctx + idx*0x28 + 0x2A0]   ; 连接上下文，每项 0x28 字节
  LDR X0,[obj + 8]                  ; → inner SSL 句柄
  BL  sub_489DBC(inner, buf, len)   ; 真正写
      成功 → *out=0, ret W0；失败 → sub_48BA1C(err), *out=0x37/0x51, ret -1
调用树:
sub_46AA74
├─ sub_500E2C → sub_500D10 [锁: __errno / sub_514DCC / sub_54A714]
├─ sub_489DBC(写) ├─ sub_489C68→sub_500C20[锁]  └─ sub_48BA1C→sub_5011E4[错误码映射]
└─ sub_44DA84 (日志)
错误串: "SSL_write() returned SYSCALL, errno=%d" / "OpenSSL SSL_write: %s, errno %d"
```

→ **网络抓包就 hook `SSL_write/SSL_read`** （或这里的 `sub_46AA74` ）。

### 3.3 libmxcore_javasupport.so（0.4 MB）—— IM 的 JNI 壳

`idat` 实测： **140 个 JNI 导出** （ `A_scan` 数到 **273 个 `pwim_*`**）+ `JNI_OnLoad @ 0x11e58` 。导出 **分类** （节选，带地址）：

| 类   | 导出（ `Java_com_sdk_mxsdk_im_core_Native_` 前缀省略） |
| --- | --- |
| 生命周期 | `pwim_1init @0x1329c` / `pwim_1init_1sdk_1with_1param @0x12dbc` / `pwim_1uninit @0x137f0` / `pwim_1create_1client @0x12fd4` |
| 登录  | `pwim_1login @0x139d0` / `pwim_1logout @0x13b58` / `pwim_1getLoginStatus @0x13b98` |
| 消息  | `pwim_1send_1message @0x168b8` / `pwim_1send_1group_1message @0x18078` / `pwim_1resend_1message @0x17148` / `pwim_1request_1history_1message @0x18cd8` |
| 会话  | `pwim_1request_1sessionList @0x140d0` / `pwim_1request_1createSession @0x14354` / `pwim_1request_1deleteSession @0x15080` |
| 频道  | `pwim_1channel_1enter_1channel @0x1db2c` / `pwim_1channel_1send_1message @0x1e34c` / `pwim_1channel_1request_1channel_1list @0x1e0ec` |
| 群组  | `pwim_1request_1groupList @0x15530` / `pwim_1request_1groupmembers @0x15778` / `pwim_1request_1groupmember_1info @0x19bc0` |
| 通知  | `pwim_1notice_1set_1notice_1listener @0x2060c` / `pwim_1notice_1request_1history @0x20cec` |
| 黑名单 | `pwim_1request_1blacklist @0x1d268` / `pwim_1request_1add_1to_1blacklist @0x1d4b0` |
| 搜索  | `pwim_1request_1search_1local_1message @0x22468` / `pwim_1request_1search_1groupmember @0x23180` |
| 其他  | `pwim_1version @0x1d924` / `pwim_1get_1server_1timestamp @0x25784` / `pwim_1request_1send_1signaling @0x2417c` |
| → **hook `pwim_1send_1message` 就能抄 IM 明文**。 |     |

### 3.4 libkycgm.so（0.2 MB）—— 国密

`idat` ： **3 个 JNI 导出** （**无 `JNI_OnLoad`**，靠 `dlsym` 直接注册）+ 命名符号共 **675**：

```python
0x4a80 Java_com_kycgm_GmCipher_sm2Encrypt
0x4ca8 Java_com_kycgm_GmCipher_sm4CbcEncrypt
0x4f6c Java_com_kycgm_GmCipher_sm4CbcDecrypt
```

-   字符串命中： `TLS init function` （⚠️ 是 **C++ thread-local**， **非** 网络 TLS）、`.init_array` 、 `malloc/memcpy/fopen/fread` ；
-   **无** SSL/socket/ptrace 字符串； **21 个高熵块**；
-   对应 Java 侧 `com.kycgm.GmCipher` （ `sm2` + `sm4Cbc` ）； **dex 里零引用** → 真正调用方在 **UE 层经 JNI**。

### 3.5 其余

-   `libprimekit.so` (3.1 MB)：客户端网络库（含 SM2/SM4 串）；
-   `libclient.so` (0.9 MB)： **Crashpad** 崩溃上报（无 JNI、无网络）。

* * *

## 4\. 拟真的边界（诚实）

Qiling/unidbg 两者 **都到"外壳/行为"层**， **都没打开平坦化核心**：

| 能拿到 ✅ | 拿不到 ❌ |
| --- | --- |
| 文件读(`/proc/<pid>/cmdline`)、syscall、native 方法名/签名、协议魔数 | **平坦化核心判定** （ `initialize` / `ioctl` 内部） |
| 被调导入(&参数) | JNI 回调、线程/生命周期、真实换表/加密载荷 |
| 漏斗点（native 初始化入口 / `ioctl` 通道） | 真实 JNIEnv 语义（被 stub 成 ret0） |

**根因**：① 核心 **控制流平坦化**；② JNIEnv **全 stub**；③ 检测 **运行期由真参数触发**。  
→ 更深要么 **反平坦化** （研究级），要么 **补真实 JNIEnv/环境**，要么 **真机**。

* * *

## 5\. Python 包 & 依赖（实测 imports）

脚本实际用到的第三方包（按出现次数）：

| 包   | 用途  | 引用次数 |
| --- | --- | --- |
| **pyelftools** (`elftools`) | 解析 ELF / 重定位 | 119 |
| **capstone** | 反汇编 | 49  |
| **qiling** | 纯原生拟真 | 44  |
| **androguard** | DEX/APK 解析 | 22  |
| **unicorn** | Qiling 底层 CPU 模拟 | 17  |
| **loguru** | 日志  | 14  |
| **pycryptodome** (`Crypto`) | 加解密 | 9   |
| **LIEF** | ELF 解析/改写 | 2   |
| **numpy** | 数值  | 1   |

**随环境安装（非 pip）**：

-   **IDAPython** （ `idaapi/idc/idautils/ida_hexrays/ida_funcs/…` ）→ 随 **IDA Pro 9.4**；
-   **unidbg** → JDK + Maven（`.java` 探针，见 `unidbg/` ）；
-   **Qiling 全依赖**： `python-registry gevent multiprocess questionary windows-curses` 。

见同目录 `requirements.txt` 。

* * *

## 6\. 一句话

> **SO 分析 = IDA 反编译(破平坦化) + Qiling 拟真(补重定位+打桩+hook syscall) + unidbg 真 JNIEnv(触真分支)。**  
> 拿到"外形/漏斗/协议"，拿不到"平坦化内脏"；网络在 `libmxcore` (SSL_write 包装 `sub_46AA74`)，IM 面在 `javasupport` (273 个 `pwim_*`)，国密在 `libkycgm` (3 导出)，引擎/密钥在 `libUnreal` 。

* * *

## 7\. 工程文件（GitHub）

脚本 /.so / unidbg 探针 / 依赖清单 均已开源：

**https://github.com/Machao147258-max/yh-top2**

```python
scripts/          313 个分析脚本
so/               13 个原生库（libUnreal.so / libmxcore.so 因 >8MB 已切分为 .partNN）
unidbg/           12 个 .java 探针
requirements.txt  Python 依赖
```

> ⚠️ 大库已切分，克隆后按 `so/重组说明.txt` 还原： `cat libUnreal.so.part* > libUnreal.so`
