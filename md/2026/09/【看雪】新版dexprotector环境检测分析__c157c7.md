---
title: 【看雪】新版dexprotector环境检测分析
source: https://bbs.kanxue.com/thread-292874.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-06T20:01:28+08:00
trace_id: df8a9aaf-d2ef-46ee-a221-216898984a8e
content_hash: caf2cd4e8a2b2f90a347504af6115d57c3539f6f3b3efb481f04f8d63f56db60
status: synced
tags:
  - 看雪
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 看雪·Android安全
ai_summary: 新版 DexProtector 将环境检测与脱壳过程绑死：JNI_OnLoad 中采集系统、进程和 Hook 痕迹，用结果给 dex 解密密钥“加盐”，并在解壳前对自身内存做完整性哈希，任何环境异常或代码改动都会导致即使强行 Hook 也脱不出正确 dex。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3d375244-d011-8134-9183-f8637b43d06a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 新版 DexProtector 将环境检测与脱壳过程绑死：JNI_OnLoad 中采集系统、进程和 Hook 痕迹，用结果给 dex 解密密钥“加盐”，并在解壳前对自身内存做完整性哈希，任何环境异常或代码改动都会导致即使强行 Hook 也脱不出正确 dex。
> 
> - **防护思路：** 不在检测到异常时立即退出，而是让多维度检测结果参与解密密钥的生成；同时创建多个检测线程持续监控运行期注入变化，使绕过检测与还原 dex 必须同时成功。
> - **对抗静态分析：** 库内大量自实现 strstr、strchr、memcpy、strtoull 等常用函数，系统调用也直接走 svc，所有字符串加密存储；字符串解密函数内部带反 Hook 自检，会在入口指令被 patch 成跳板时破坏解密流程。
> - **环境信息收集：** 自研函数读取 /proc/self/stat 并保存 argv、envp、auxv 指针，用 auxv 定位 r_debug，从而遍历进程已加载 so；随后按 Android 版本计算结构体偏移量并初始化 Java 环境信息。
> - **检测覆盖维度：** 覆盖 inline hook（libc/libart/libandroid 内存段异常跳转指令）、magisk、Xposed、root、模拟器、云环境、容器、adb、debugger、build tag、bootloader、installer 等十余类检测点。
> - **内存完整性校验与绕过关键：** 识别库自身基址后从基址起做范围哈希，并另有多处局部范围哈希，用于发现 inline hook、PLT hook、NOP 等任意内存改动；分析时先保存干净库快照，在哈希与签名入口将真实内存替换为快照，同时将各检测线程执行函数替换为死循环，即可稳定 dump dex。

参考：https://bbs.kanxue.com/thread-289170.htm

com.Hyatt.hyt 26.7.0(7月份的一个版本)

## 目的

分析这个检测的目的是从防护的角度看如何实现，所以这里我们不会选择用最简单的方式绕过，而是把整个检测细节全部分析清楚。

## 库检测逻辑宏观总结

整个库把环境检测与脱壳结合起来，在jni_onload中对多个维度的环境信息进行检测，同时通过检测结果对解密的密匙加盐，一旦检测失败，即使通过frida强行hook也无法脱出来正确的dex，从而无法启动。

同时起了多个检测线程，持续检测环境变化。

## 环境准备

这里就不多说了，直接看参考文章即可，这里dexprotector直接通过一个匿名内存页面来自link了一个动态库，然后在这个动态库中解密释放了代码，再从dexprotector的jni_onload中跳到动态内存的代码段中去，核心逻辑如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a0ddf58a78de3ef6.webp)

下一步就是直接分析动态内存中dump下来的动态库了，一些ida配置的方式也直接见参考的文章即可。

## 准备工作

1.  所有已知类型的变量全部改过来，例如 JavaVM\* JNIEnv\* 等，不要放过参数透传过程中丢失的类型信息，全部改过来，会大大节约分析的精力
    
2.  PLT函数，遇到一些明显像plt的函数可以直接通过hook的方式拿到运行时真正调用的内存地址，找到对应的库中的偏移量，直接改名  
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/13bc63d9c4316e3c.webp)
    
3.  一些关键的全局变量做好重命名，例如，下面这段汇编其实很明显是把函数入口的lr保存到了一个全局变量中，后面检测可能会用  
    ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c5df3c458560574.webp)
    

## 分析关键检测点

整个检测逻辑做了深度定制，一些关键的函数都没有用libc的，而是自己实现了，系统调用也是，全部用svc实现的，同时所有的字符串全部做了加密增加了分析难度。

## 先看几个common关键函数

### 字符串解密函数：sub_3B000

字符串解密函数，同时这个函数还会自检自己是否被hook，如果没被hook，再用一个全局密匙解密当前一个全局的字符串，而且经过实验发现这个密匙其实也是动态解密出来的，重命名为 decode_string_and_hook_myself，和他类似的函数还有一个是sub_4A114，也是解密字符串的，我们崇明名为decode_xor_string，不再赘述。

反汇编：

```cpp
_BYTE *__fastcall decode_string_and_hook_myself(_DWORD *a1, _BYTE *a2, __int64 a3)
{
  int v3; // w8
  int v4; // w9
  __int64 v5; // x10
  char *v6; // x11
  _BYTE *v7; // x14
  __int64 v8; // x12
  char v9; // t1
  __int64 v10; // x15
  __int64 i; // x16
  unsigned __int64 v12; // t2
  int v13; // w17
  _DWORD v15[2]; // [xsp+8h] [xbp-8h]
  v3 = a1[1];
  // 这里在检测自己是否被hook
  if ( (*decode_string_and_hook_myself & 0xFC) == 0x14
    || (v4 = *a1, (*decode_string_and_hook_myself & 0x1E) == 0x10)
    && (*(decode_string_and_hook_myself + 3) & 0x9F) == 0x90
    || (*decode_string_and_hook_myself & 0xFE) == 0x50
    && !*(decode_string_and_hook_myself + 1)
    && *(decode_string_and_hook_myself + 3) == 88 )
  {
    v4 = 0;
    --v3;
  }
  if ( a3 )
  {
    v5 = 0;
    v6 = (a1 + 2);
    v7 = a2;
    // 密匙
    v8 = qword_A32D0[7];
    do
    {
      v10 = v5 & 7;
      if ( (v5 & 7) == 0 )
      {
        for ( i = 0; i != 108; i += 4 )
        {
          HIDWORD(v12) = v3;
          LODWORD(v12) = v3;
          v13 = *(v8 + i);
          v3 = v13 ^ ((v12 >> 8) + v4);
          v4 = v3 ^ __ROR4__(v4, 29);
        }
        v15[0] = v4;
        v15[1] = v3;
      }
      ++v5;
      v9 = *v6++;
      *v7++ = *(v15 + v10) ^ v9;
    }
    while ( v5 != a3 );
  }
  // 解密出来的字符串指针
  return a2;
}
```

绕过措施：在hook的onenter时机把检测自己是否被hook的代码nop掉，同时onleave的时机把解密的字符串打印出来，当然，这个函数分析到后面会发现不光他自己会检测自己是否被hook，sub_25AC8 这个函数也会检测他是不是被hook，所以其实还有一个应对措施就是先把密匙dump下来，然后直接用python重写解密，用于在offline解密字符串。

```javascript
function hook_decode_string_and_hook_myself(libanon) {
  Interceptor.attach(libanon.add(0x3b000), {
    onEnter: function (args) {
      nop_inst(libanon.add(0x3b01c), 3);
      nop_inst(libanon.add(0x3b04c), 1);
      nop_inst(libanon.add(0x3b07c), 1);
      this.lr = this.context.lr;
      this.strlen = args[2].toInt32();
    },
    onLeave: function (ret) {
      console.log(
        "decode_string_and_hook_myself ret is ",
        ret.readCString(),
        "; strlen is: ",
        this.strlen,
        "; lr is ",
        this.lr.sub(libanon),
      );
    },
  });
}
```

### 自实现的libc同功能函数：sub_16864 sub_13BBC sub_26098 sub_260C0 等等

sub_26098 是 strchr

sub_16864 是 strstr

sub_13BBC 是strtoull

sub_260C0 是memcpy

### 解析进程stat信息：sub_28E74

从/proc/self/stat里拿到当前进程的栈指针，依次获取了argv、env以及auxv，并且把这几个指针存到全局变量中，这里最关键的就是auxv了，因为用auxv可以直接找到r_debug，进程的所有加载的so也就都能遍历了。这函数直接重命名为：collect_process_startup_info。

### 拿r_debug指针：sub_8BD60 sub_28F94

sub_28F94是遍历刚才刚获取的auxv指针用的，然后用key取值，外层sub_8BD60直接调这个函数然后给r_debug全局指针赋值，核心就下面两行

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a4651edc6b940327.webp)

### 统一的错误处理函数

sub_380F8: 错误处理，扔异常，封装错误信息字符串等等

### 一些列环境相关的初始化函数（这些函数都可以通过hook decode_string_and_hook_myself 得到解密的字符串，语义还是比较明确的）

sub_29098（get_build_version_and_first_api）: 获取build version以及first api

sub_203E0: 根据版本设置一些偏移量，这些偏移明显是为了兼容不同android版本的一些结构体字段的访问。

sub_5A204: 获取自己pagemap的fd

sub_52570: 初始化一系列java环境的信息，例如：currentActivityThread mBoundApplication mPackageName等等，直接通过解密字符串就可知。

## 检测函数1：inline hook 检测

sub_6F948: 这个函数核心逻辑就是检测 libc，libart，libandroid这三个库是否被inline hook，核心的检测函数就是 sub_1F654， 通过对内存段中的异常跳转指令判断是否是inline hook。同时这个函数整体设计到对内存段的收集，需要定义一个结构体才能看清代码逻辑，同时这个函数的检测逻辑函数指针被当作参数直接pthread create，设置检测线程。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3f264ed47aa96608.webp)

## 检测函数2：一系列基于字符串的环境检测

sub_1FC2C: debugger检测

sub_5E098: 这个函数很有意思，他是动态的申请了一块内存，然后往这块内存中写了一些指令，然后执行这段指令，而这段指令核心的逻辑就是把自己的返回值从0改成1.

sub_27150: magisk 检测，检测特定目录有没有magisk文件

sub_532BC: xpose 检测

sub_5E0C4：云环境检测

sub_2718C：root检测

sub_1A544：rom检测

sub_1A454：build tag检测

sub_1A1F0: bootloader检测

sub_4F240：adb检测

sub_927E0: 容器化检测

sub_53BF8: xpose file检测

sub_5E2E4：模拟器检测

sub_27244: system检测

sub_5F758： installer检测

## 生成初始解密密匙

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bdbdeffa43559bdb.webp)

从全局变量生成最终需要作为hmac的密匙，这里这两个全局变量我已经重命名。

## 验签

sub_6DAE0

## 内存范围hash+检测

sub_120C4：全库最绝的一个检测，从当前位置以固定步长向前搜索，知道搜索到一个满足特殊要求的位置，停止，然后从这个位置开始向后做一个范围hash，把结果和固定值对比。通过hook发现，其实找到的就是这个库的基地址，也就是相当于从基地址做范围hash，相当于校验inline hook、plt hook、nop指令等所有内存改动痕迹。sub_94ED4 也是同理，只不过不是从基地址开始。

再之后就是生成密匙，脱壳，最后调用jni的findclass loadclass了。

最终的frida hook脚本如下

```javascript
function nop_inst(start, size) {
  var nop = [0x1f, 0x20, 0x03, 0xd5];
  for (var i = 0; i < size; i += 1) {
    Memory.writeByteArray(start.add(i * 4), nop);
  }
}
function hook_decode_string_and_hook_myself(libanon) {
  Interceptor.attach(libanon.add(0x3b000), {
    onEnter: function (args) {
      if (!g_has_dump) {
        g_has_dump = true;
        var addr = libanon.add(0xA3308).readPointer();
        console.log("decode key is : \n", hexdump(addr, { length: 108 }));
      }
      //console.log("enter decode_string_and_hook_myself")
      // nop
      nop_inst(libanon.add(0x3b01c), 3);
      nop_inst(libanon.add(0x3b04c), 1);
      nop_inst(libanon.add(0x3b07c), 1);
      this.lr = this.context.lr;
      this.strlen = args[2].toInt32();
    },
    onLeave: function (ret) {
      console.log(
        "decode_string_and_hook_myself ret is ",
        ret.readCString(),
        "; strlen is: ",
        this.strlen,
        "; lr is ",
        this.lr.sub(libanon),
      );
    },
  });
}
function hook_decode_xor_string(libanon) {
  Interceptor.attach(libanon.add(0x4a114), {
    onEnter(args) {
      this.out = args[1];
      this.lr = this.context.lr;
    },
    onLeave(retval) {
      console.log(
        "decode_xor_string leave , ret is :",
        this.out.readCString(),
        " ; lr is : ",
        this.lr.sub(libanon),
      );
    },
  });
}
function handle_plt_functions(libanon) {
  // 处理plt函数
  var a = Memory.readPointer(libanon.add(0x9d990));
  var abasename = Process.findModuleByAddress(a).name;
  var abasebase = Process.findModuleByAddress(a).base;
  console.log(
    "abasename is : ",
    abasename,
    "; base is : ",
    abasebase,
    "; function bias is : ",
    a.sub(abasebase),
  );
}
function bypass_pthread_detect(libanon) {
  // 替换线程执行函数
  Interceptor.replace(
    libanon.add(0x1ff04),
    new NativeCallback(
      function () {
        console.log("0x1FF04 : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x36fd4),
    new NativeCallback(
      function () {
        console.log("0x36FD4 : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x3c83c),
    new NativeCallback(
      function () {
        console.log("0x3C83C : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x4f38c),
    new NativeCallback(
      function () {
        console.log("0x4F38C : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x70004),
    new NativeCallback(
      function () {
        console.log("0x70004 : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x758a4),
    new NativeCallback(
      function () {
        console.log("0x758A4 : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x76404),
    new NativeCallback(
      function () {
        console.log("0x76404 : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
  Interceptor.replace(
    libanon.add(0x92c14),
    new NativeCallback(
      function () {
        console.log("0x92C14 : bypassed");
        while (true) {
          Thread.sleep(1);
        }
      },
      "int64",
      [],
    ),
  );
}
function hook_process_startup_info_collection(libanon) {
  Interceptor.attach(libanon.add(0x28e74), {
    onEnter(args) {
      this.lr = this.context.lr;
      console.log("onenter 0x28E74 ===============");
    },
    onLeave(ret) {
      const argv = libanon.add(0xa2f28).readPointer();
      const envp = libanon.add(0xa2f30).readPointer();
      const auxv = libanon.add(0xa2f38).readPointer();
      console.log("onleave 0x28E74, ret =", ret);
      console.log("A2F28 =", argv);
      console.log("A2F30 =", envp);
      console.log("A2F38 =", auxv);
      console.log("========== argv ==========");
      for (let i = 0; i < 20; i++) {
        let p = argv.add(i * Process.pointerSize).readPointer();
        if (p.isNull()) {
          console.log("argv[" + i + "] = NULL");
          break;
        }
        console.log("argv[" + i + "] =", p.readCString());
      }
      console.log("========== envp ==========");
      for (let i = 0; i < 100; i++) {
        let p = envp.add(i * Process.pointerSize).readPointer();
        if (p.isNull()) {
          console.log("envp[" + i + "] = NULL");
          break;
        }
        console.log("envp[" + i + "] =", p.readCString());
      }
      console.log("========== auxv ==========");
      for (let i = 0; i < 50; i++) {
        let entry = auxv.add(i * 16);
        let type = entry.readU64();
        let value = entry.add(8).readU64();
        console.log("auxv[" + i + "] type =", type, "value =", value);
        if (type.equals(0)) break;
      }
    },
  });
}
function hook_dynamic_exec_code(libanon) {
  Interceptor.attach(libanon.add(0x95420), {
    onEnter(args) {
      const code = args[0];
      console.log("\n========== dynamic code ==========");
      console.log("address : " + code);
      console.log("size    : 0x38");
      console.log("\n--- HEX ---");
      console.log(
        hexdump(code, {
          offset: 0,
          length: 0x38,
          header: true,
          ansi: false,
        }),
      );
      console.log("\n--- ARM64 ---");
      let p = code;
      const end = code.add(0x38);
      while (p.compare(end) < 0) {
        const insn = Instruction.parse(p);
        console.log(p + "  " + insn.mnemonic + " " + insn.opStr);
        p = p.add(insn.size);
      }
      console.log("==================================\n");
    },
  });
  Interceptor.attach(libanon.add(0x583c0), {
    onEnter(args) {
      this.lr = this.context.lr;
      console.log("onenter 0x583C0, lr is : ", this.lr.sub(libanon));
      const code = libanon.add(0x57810);
      const size = 0xd4;
      console.log("\n========== 0x57810 dynamic code ==========");
      console.log("address : " + code);
      console.log("size    : " + size);
      console.log("\n--- HEX ---");
      console.log(
        hexdump(code, {
          offset: 0,
          length: size,
          header: true,
          ansi: false,
        }),
      );
      console.log("\n--- ARM64 ---");
      let p = code;
      const end = code.add(size);
      while (p.compare(end) < 0) {
        const insn = Instruction.parse(p);
        console.log(p + "  " + insn.mnemonic + " " + insn.opStr);
        p = p.add(insn.size);
      }
      console.log("==================================\n");
    },
    onLeave(ret) {
      console.log("onleave 0x583C0, ret is : ", ret.toString());
    },
  });
}
function dump_dynamic_so(libanon, libanon_size) {
  console.log("start dump so");
  var sodata = Memory.readByteArray(libanon, libanon_size);
  var f = new File("/data/data/com.Hyatt.hyt/libanon.so", "wb");
  f.write(sodata);
  f.close();
  console.log("done dump so");
}
function dump_dex_file(dex_ptr, dex_size) {
  console.log("start dump dex file");
  var dexdata = Memory.readByteArray(dex_ptr, dex_size);
  var f = new File("/data/data/com.Hyatt.hyt/dex_file.dex", "wb");
  f.write(dexdata);
  f.close();
  console.log("done dump dex file");
}
var g_clean_libanon_snapshot = null;
var g_clean_libanon_snapshot_size = 0;
function save_clean_libanon_snapshot(libanon, libanon_size) {
  if (!libanon || libanon.isNull() || !libanon_size) {
    console.log("[snapshot] invalid args");
    return null;
  }
  if (g_clean_libanon_snapshot) {
    console.log(
      "[snapshot] already saved at",
      g_clean_libanon_snapshot,
      "size =",
      g_clean_libanon_snapshot_size,
    );
    return g_clean_libanon_snapshot;
  }
  var shadow = Memory.alloc(libanon_size);
  Memory.copy(shadow, libanon, libanon_size);
  g_clean_libanon_snapshot = shadow;
  g_clean_libanon_snapshot_size = libanon_size;
  console.log("[snapshot] saved clean libanon at", shadow, "size =", libanon_size);
  return shadow;
}
function hook_error_handler(libanon) {
  Interceptor.attach(libanon.add(0x380f8), {
    onEnter: function (args) {
      console.log("error_handler onenter, error code is : ", args[1].toInt32());
    },
  });
}
function bypass_lib_c_inline_hook_detection(libanon) {
  Interceptor.attach(libanon.add(0x6fe14), {
    onLeave: function (ret) {
      ret.replace(0);
    },
  });
}
function ror32(x, n) {
  x = x >>> 0;
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}
function bytesToPrintable(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) {
    const b = u8[i];
    if (b >= 0x20 && b <= 0x7e) s += String.fromCharCode(b);
    else s += "\\x" + ("0" + b.toString(16)).slice(-2);
  }
  return s;
}
/**
 * @param {NativePointer} a1Ptr  指向 blob: [u32 v4][u32 v3][cipher...]
 * @param {number} length        解密长度（调用点第三参）
 * @param {NativePointer} keySch qword_A32D0[7] 指向的 u32 key schedule
 */
function decodeDynString(a1Ptr, length, keySch) {
  let v4 = a1Ptr.readU32() >>> 0; // a1[0]
  let v3 = a1Ptr.add(4).readU32() >>> 0; // a1[1]
  const ct = a1Ptr.add(8); // a1 + 2 dwords
  const out = new Uint8Array(length);
  const ks = new Uint8Array(8);
  const dv = new DataView(ks.buffer);
  for (let idx = 0; idx < length; idx++) {
    if ((idx & 7) === 0) {
      for (let off = 0; off < 108; off += 4) {
        // 27 rounds
        const k = keySch.add(off).readU32() >>> 0;
        v3 = (k ^ ((ror32(v3, 8) + v4) >>> 0)) >>> 0;
        v4 = (v3 ^ ror32(v4, 29)) >>> 0;
      }
      dv.setUint32(0, v4, true); // little-endian
      dv.setUint32(4, v3, true);
    }
    out[idx] = ct.add(idx).readU8() ^ ks[idx & 7];
  }
  return out;
}
const g_str_targets = [[0x4923, 65]];
// 在拿到 libanon 后调用
function dumpUnreachedDynStrings(libanon) {
  const qwordA32D0 = libanon.add(0xa32d0);
  const keySch = qwordA32D0.add(7 * 8).readPointer();
  g_str_targets.forEach(([off, len]) => {
    const buf = decodeDynString(libanon.add(off), len, keySch);
    console.log(
      `[dynstr] off=0x${off.toString(16)} len=${len} -> ${bytesToPrintable(buf)}`,
    );
  });
}
function bypass_memory_hash_check(libanon) {
  Interceptor.attach(libanon.add(0x94ed4), {
    onEnter: function (args) {
      this.lr = this.context.lr.sub(libanon);
      if (this.lr.equals(0x37d68)) {
        // sip_hash(qword_9D830, size, v44, ...), v44 在栈上紧跟 dex_key 之后
        this.dex_key = args[2].sub(0x20);
      }
    },
    onLeave: function (ret) {
      if (this.lr.equals(0x37d68)) {
        var expected = libanon.add(0xa32c8).readU64();
        ret.replace(expected);
        //console.log(
        //  "0x94ED4 patched ret, dex_key is:\n",
        //  hexdump(this.dex_key, { length: 32 }),
        //);
      }
    },
  });
}
var g_has_dump = false;
var g_dex_key = null;
function hook_hmac_sign_in_target(libanon) {
  // Implementation for hooking HMAC sign in the target library
  Interceptor.attach(libanon.add(0x7059C), {
    onEnter: function (args) {
      console.log(" hmac_sign_in_target called, lr is : ", this.context.lr.sub(libanon), "; target is : ", args[0].sub(libanon));
      if (args[0].sub(libanon).equals(g_dex_key)) {
        console.log(" dex_key has been changed by hmac_sign_in_target");
      }
    }
  });
}
function hook_exec_hmac_sign_algo9_and_get_dex_key(libanon) {
  Interceptor.attach(libanon.add(0x70500), {
    onEnter: function (args) {
      this.lr = this.context.lr.sub(libanon);
      g_dex_key = args[4].sub(libanon);
    }
  });
}
function hook_verify_checksum(libanon) {
  // Implementation for hooking the verify checksum function in the target library
  Interceptor.attach(libanon.add(0x5C4DC), { // Replace 0x70600 with the actual offset of the verify checksum function
    onEnter: function (args) {
      this.lr = this.context.lr.sub(libanon);
    },
    onLeave: function (ret) {
      console.log("verify_checksum returned, ret is : ", ret, "; lr is :" , this.lr);
    }
  });
}
function hook_find_mem_block_target_addr(libanon) {
  // 找到 find_mem_block_and_hmac_sign 最终命中的内存块地址
  // 这里其实hook的是 sha256()的地址
  Interceptor.attach(libanon.add(0x55ED0), {
    onEnter: function (args) {
      this.lr = this.context.lr.sub(libanon);
      // 来自 find_mem_block_and_hmac_sign 内部的 sha256(v5, len, ...)
      if (this.lr.equals(0x12160)) {
        var addr = args[0];
        var len = args[1].toUInt32();
        console.log("[find_mem_block] matched block addr =", addr, "off =", addr.sub(libanon), "len =", len);
        console.log("[find_mem_block] start replace ....");
        args[0] = g_clean_libanon_snapshot;
        console.log("[find_mem_block] replaced with clean snapshot");
      }
    },
  });
  Interceptor.attach(libanon.add(0x120C4), {
    onEnter: function (args) {
      console.log("[find_mem_block] enter, dex_key =", args[0].sub(libanon));
    },
  });
}
function hook_decompress_dex(libanon) {
  // decompress_dex
              Interceptor.attach(libanon.add(0x8BF94), { // replace 0x123456 with the actual offset
                onEnter: function (args) {
                  this.lr = this.context.lr.sub(libanon);
                },
                onLeave: function (ret) {
                  console.log("Interceptor detached at 0x8BF94, ret = ", ret, " lr = ", this.lr);
                },
              });
}
let g_cls_timeline_installed = false;
function hook_art_dexclassloader_timeline(libanon) {
  if (g_cls_timeline_installed) return;
  g_cls_timeline_installed = true;
  const ts = () => Date.now();
  // ---- Java 层：DexClassLoader / ClassLoader ----
  Java.perform(function () {
    const Exception = Java.use("java.lang.Exception");
    const Log = Java.use("android.util.Log");
    const DexClassLoader = Java.use("dalvik.system.DexClassLoader");
    const PathClassLoader = Java.use("dalvik.system.PathClassLoader");
    const BaseDexClassLoader = Java.use("dalvik.system.BaseDexClassLoader");
    const ClassLoader = Java.use("java.lang.ClassLoader");
    const DexFile = Java.use("dalvik.system.DexFile");
    const watch = (n) =>
      n && (n.indexOf("Hyatt") >= 0 || n.indexOf("Application") >= 0 || n.indexOf("Splash") >= 0);
    const bt = () => Log.getStackTraceString(Exception.$new());
    const dclInit = DexClassLoader.$init.overload(
      "java.lang.String", "java.lang.String", "java.lang.String", "java.lang.ClassLoader"
    );
    dclInit.implementation = function (dexPath, odexPath, libPath, parent) {
      console.log(`[${ts()}][DCL.$init] dexPath=${dexPath} odexPath=${odexPath} libPath=${libPath} parent=${parent}`);
      console.log(bt());
      return dclInit.call(this, dexPath, odexPath, libPath, parent);
    };
    const pclInit1 = PathClassLoader.$init.overload("java.lang.String", "java.lang.ClassLoader");
    pclInit1.implementation = function (path, parent) {
      console.log(`[${ts()}][PCL.$init-2] path=${path} parent=${parent}`);
      return pclInit1.call(this, path, parent);
    };
    const pclInit2 = PathClassLoader.$init.overload("java.lang.String", "java.lang.String", "java.lang.ClassLoader");
    pclInit2.implementation = function (dexPath, libPath, parent) {
      console.log(`[${ts()}][PCL.$init-3] dexPath=${dexPath} libPath=${libPath} parent=${parent}`);
      return pclInit2.call(this, dexPath, libPath, parent);
    };
    const findClass = BaseDexClassLoader.findClass.overload("java.lang.String");
    findClass.implementation = function (name) {
      if (watch(name)) console.log(`[${ts()}][BaseDexClassLoader.findClass] ${name}`);
      return findClass.call(this, name);
    };
    const loadClass1 = ClassLoader.loadClass.overload("java.lang.String");
    loadClass1.implementation = function (name) {
      if (watch(name)) console.log(`[${ts()}][ClassLoader.loadClass] ${name} loader=${this}`);
      return loadClass1.call(this, name);
    };
    const loadDex = DexFile.loadDex.overload("java.lang.String", "java.lang.String", "int");
    loadDex.implementation = function (src, out, flags) {
      console.log(`[${ts()}][DexFile.loadDex] src=${src} out=${out} flags=${flags}`);
      return loadDex.call(this, src, out, flags);
    };
  });
  // ---- ART 层：ClassLinker::DefineClass / FindClass ----
  const art = Process.findModuleByName("libart.so");
  if (!art) return;
  for (const s of art.enumerateSymbols()) {
    if (!/ClassLinker.*(DefineClass|FindClass)/.test(s.name)) continue;
    if (s.name.indexOf("CheckJNI") >= 0) continue;
    Interceptor.attach(s.address, {
      onEnter(args) {
        let desc = "";
        for (let i = 0; i < 4; i++) {
          try {
            const t = Memory.readCString(args[i]);
            if (t && t.length > 2 && t[0] === "L") { desc = t; break; }
          } catch (_) {}
        }
        this.desc = desc;
        console.log(`[${ts()}][ART] ${s.name} enter desc=${desc || "<na>"}`);
      },
      onLeave(ret) {
        console.log(`[${ts()}][ART] leave ret=${ret}`);
      }
    });
  }
}
function hook_calc_xxh64_like_fingerprint(libanon) {
  Interceptor.attach(libanon.add(0x8A998), {
    onEnter: function (args) {
      console.log("calc_xxh64_like_fingerprint onEnter");
      this.lr = this.context.lr.sub(libanon);
      if (this.lr.equals(0x3D4C8) || this.lr.equals(0x5AF84)) {
        console.log("calc_xxh64_like_fingerprint condition met");
        args[0] = g_clean_libanon_snapshot;
      }
    },
    onLeave: function (ret) {
      console.log("calc_xxh64_like_fingerprint onLeave ret =", ret);
    },
  });
}
function hook_sub_82560(libanon) {
  const f = libanon.add(0x82560);
  console.log("xxxxxxxxxxxxxxxxx", f);
  Interceptor.attach(f, {
    onEnter(args) {
      console.log("sub_82560 onEnter");
      this.env = args[0];
      this.a2 = args[1].toUInt32();
      this.a3 = args[2];
      this.a4 = args[3].toInt32() & 0xff;
      this.a5 = args[4]; // char** output
      let inStr = "<null>";
      try {
        if (!this.a3.isNull()) inStr = Memory.readCString(this.a3);
      } catch (_) {
        inStr = "<bad-cstr>";
      }
      console.log(
        `[sub_82560] enter a2=${this.a2} a3="${inStr}" a4=${this.a4} a5=${this.a5}`
      );
    },
    onLeave(retval) {
      const ret = retval.toInt32();
      let outPtr = ptr(0);
      let outStr = "<null>";
      try {
        if (!this.a5.isNull()) {
          outPtr = this.a5.readPointer(); // *a5
          if (!outPtr.isNull()) outStr = Memory.readCString(outPtr);
        }
      } catch (_) {
        outStr = "<bad-out>";
      }
      console.log(
        `[sub_82560] leave ret=${ret} out_ptr=${outPtr} out_str="${outStr}"`
      );
    },
  });
  console.log("[sub_82560] hooked @ 0x82560");
}
function hook_unpack_result(libanon) {
  Interceptor.attach(libanon.add(0x81890), { // Replace 0x12345 with the actual offset
    onEnter: function (args) {
      console.log("unpack_result onEnter");
      this.lr = this.context.lr.sub(libanon);
      this.out = args[0];
    },
    onLeave: function (ret) {
      console.log("unpack_result lr is :", this.lr, "; size is :", ret, "; out is : \n", hexdump(this.out, { length: 16 }));
      if (this.lr.equals(0x5aed8)) {
        //dump_dex_file(this.out, ret.toUInt32());
      }
    },
  });
}
function hook_dlopen() {
  console.log("-------------Current PID:", Process.id);
  var loader_android_dlopen_ext = Module.findExportByName(
    null,
    "__loader_android_dlopen_ext",
  );
  console.log(
    "__loader_android_dlopen_ext address is => ",
    loader_android_dlopen_ext,
  );
  Interceptor.attach(loader_android_dlopen_ext, {
    onEnter: function (args) {
      var pathptr = args[0];
      var path = pathptr.readCString();
      console.log("path is => ", path);
      if (path && path.indexOf("libdexprotector.so") >= 0) {
        this.match = true;
      }
       Thread.sleep(1);
    },
    onLeave: function (ret) {
      if (this.match) {
        var libdexprotector = Process.findModuleByName("libdexprotector.so");
        if (libdexprotector) {
          Interceptor.attach(libdexprotector.findExportByName("JNI_OnLoad"), {
            onEnter: function (args) {
              console.log("dexprotector jni_onload onenter");
              this.internal_jni_onload_p = libdexprotector.base
                .add(0xb238)
                .readPointer();
              var libanon = Process.findRangeByAddress(
                this.internal_jni_onload_p,
              ).base;
              var libanon_size = Process.findRangeByAddress(
                this.internal_jni_onload_p,
              ).size;
              this.libanon = libanon;
              this.libanon_size = libanon_size;
              // 这里用一块内存把干净的libanon保存起来
              save_clean_libanon_snapshot(libanon, libanon_size);
              console.log(
                "libanon base is =========================> ",
                libanon,
              );
              console.log(
                "libanon size is =========================> ",
                libanon_size,
              );
              console.log(
                "internal jni onload location is =========================> ",
                this.internal_jni_onload_p.sub(libanon),
              );
              //dumpUnreachedDynStrings(libanon);
              //hook_decode_string_and_hook_myself(libanon);
              hook_decode_xor_string(libanon);
              //handle_plt_functions(libanon);
              bypass_pthread_detect(libanon);
              //hook_process_startup_info_collection(libanon);
              // dump动态函数
              //hook_dynamic_exec_code(libanon);
              hook_error_handler(libanon);
              bypass_lib_c_inline_hook_detection(libanon);
        
              bypass_memory_hash_check(libanon);
              // 看dex_key 是否被加盐
              //hook_hmac_sign_in_target(libanon);
              // 给 dex_key 指针赋值
              hook_exec_hmac_sign_algo9_and_get_dex_key(libanon);
              // hook verify checksum function
              //hook_verify_checksum(libanon);
              // hook find_mem_block_and_hmac_sign matched address
              hook_find_mem_block_target_addr(libanon);
              //hook_decompress_dex(libanon);
              hook_calc_xxh64_like_fingerprint(libanon);
              //hook_unpack_result(libanon);
              hook_sub_82560(libanon);
              
            },
            onLeave: function (ret) {
              console.log("dexprotector jni_onload onleave, ret: ", ret);
              //dump_dynamic_so(this.libanon, this.libanon_size);      
              Thread.sleep(3);
            },
          });
        }
      }
    },
  });
}
function main() {
  hook_dlopen();
}
setImmediate(main);
```
