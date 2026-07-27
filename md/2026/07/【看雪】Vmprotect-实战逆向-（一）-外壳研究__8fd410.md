---
title: 【看雪】Vmprotect 实战逆向 （一） 外壳研究
source: https://bbs.kanxue.com/thread-292198.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-27T23:01:07+08:00
trace_id: ed3de683-829f-48e8-b0d7-f550b2757660
content_hash: f754765ca72dced5b665d0df5e09abf25985a9ff1cda3791e051da4f9d0e1d3e
status: summarized
tags:
  - 看雪
  - Windows逆向
  - 脱壳与加固
series: null
feed_source: 看雪·逆向工程
ai_summary: 利用VEH异常接管与Instrumentation Callback反复剥夺.text执行权限，在VMP解密后恢复可执行时捕获OEP进行Dump，并借助Unicorn模拟执行重建IAT。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3aa75244-d011-8190-8d93-ef005340cefb
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用VEH异常接管与Instrumentation Callback反复剥夺.text执行权限，在VMP解密后恢复可执行时捕获OEP进行Dump，并借助Unicorn模拟执行重建IAT。
> 
> - **外壳解密完成信号：** .text段属性先变为可写（正在解密明文），随后变为可执行且不可写时说明解密已稳定，此时为真OEP即将执行的准确时机。
> - **三环Dump核心机制：** 注入DLL设置VEH异常处理器，通过定时线程反复调用NtSetInformationProcess安装Instrumentation Callback，每次系统调用返回时强制将.text改为PAGE_READWRITE，触发执行违规异常后由VEH捕获OEP地址。
> - **导入桩识别与解析：** 全量扫描call/jmp指令，若跳转目标落于非.text的VMP执行节则标记为导入桩；使用Unicorn模拟每个桩点，通过多个不同假返回地址判定其解析出的API地址是否稳定，再与现有模块导出表比对确定函数。
> - **Dump后PE修正关键：** 冻结进程后读内存，将EntryPoint改为真OEP，设置FileAlignment等于SectionAlignment，并使每个节的PointerToRawData与VirtualAddress相同，直接生成可用内存镜像进行静态分析。

这个文章我打算认真研究一下Vmprotect系列。社区也有大量关于Vmprotect 研究文章大多是专精一个方向。(师傅们都写得很好，无恶意)这个文章我想做成一个系列，也是当作笔记记录一下。希望能给各位师傅带来帮助。(文章无 AI注水纯手写)

## Vmprotect版本

Vmprotect 3.96  
Vmprotect 设置：  
虚拟化与混淆：ON  
强度:100%  
反调试，反VT：ON

## 样本代码

```cpp


// 模拟一个正常加密协议(TLS 风格)的加密过程:
//   握手协商 -> 派生会话密钥 -> AES-CBC 加密应用数据 -> HMAC 完整性校验 -> 对端解密验签
void do_protocol() {
    std::cout << "\n========= 模拟加密协议加密过程 (TLS 风格混合加密) =========\n";
    std::string msg = readline("输入要安全发送的应用数据(明文): ");
    if (msg.empty()) msg = "GET /account/balance HTTP/1.1";
    Bytes plain = str_to_bytes(msg);

    // --- 1. 握手: 双方各出一个随机数 + 预主密钥 ---
    std::cout << "\n[1] 握手 Handshake\n";
    Bytes client_random = random_bytes(32);
    Bytes server_random = random_bytes(32);
    Bytes pre_master    = random_bytes(48); // 真实 TLS 里由客户端生成后用服务端公钥加密传输
    std::cout << "    client_random = " << codec::hex_encode(client_random) << "\n";
    std::cout << "    server_random = " << codec::hex_encode(server_random) << "\n";
    std::cout << "    pre_master    = " << codec::hex_encode(pre_master) << "  (实际会用 RSA/ECDHE 保护)\n";

    // --- 2. 密钥派生 (模拟 TLS PRF): 用 HMAC 把三者揉成会话密钥材料 ---
    std::cout << "\n[2] 密钥派生 Key Derivation (HMAC-SHA256 当 PRF)\n";
    Bytes seed = client_random;
    seed.insert(seed.end(), server_random.begin(), server_random.end());
    Bytes master = sha256impl::hmac(pre_master, seed);              // master secret
    Bytes keyblock = sha256impl::hmac(master, seed);               // 密钥块
    Bytes enc_key(keyblock.begin(), keyblock.begin() + 32);        // AES-256 会话密钥
    Bytes mac_key = sha256impl::hmac(master, str_to_bytes("MAC")); // HMAC 密钥
    std::cout << "    master_secret = " << codec::hex_encode(master) << "\n";
    std::cout << "    会话加密密钥 enc_key(AES-256) = " << codec::hex_encode(enc_key) << "\n";
    std::cout << "    完整性密钥   mac_key           = " << codec::hex_encode(mac_key) << "\n";

    // --- 3. 发送方: 加密 + 加 MAC (Encrypt-then-MAC) ---
    std::cout << "\n[3] 发送方加密 Record 层 (AES-256-CBC + HMAC-SHA256, Encrypt-then-MAC)\n";
    Bytes iv = random_bytes(16);
    Bytes cipher = aesimpl::cbc_encrypt(enc_key, iv, plain);
    Bytes record = iv;                                   // 传输格式: IV || 密文
    record.insert(record.end(), cipher.begin(), cipher.end());
    Bytes tag = sha256impl::hmac(mac_key, record);       // 对 IV+密文 算 MAC
    std::cout << "    明文        : " << msg << "\n";
    std::cout << "    IV          : " << codec::hex_encode(iv) << "\n";
    std::cout << "    密文        : " << codec::hex_encode(cipher) << "\n";
    std::cout << "    MAC(tag)    : " << codec::hex_encode(tag) << "\n";
    std::cout << "    >>> 网络上传输的报文(Base64): " << codec::base64_encode(record)
              << " | tag=" << codec::hex_encode(tag) << "\n";

    // --- 4. 接收方: 先验 MAC 再解密 ---
    std::cout << "\n[4] 接收方校验并解密\n";
    Bytes check = sha256impl::hmac(mac_key, record);
    bool ok = (check == tag);
    std::cout << "    重算 MAC    : " << codec::hex_encode(check) << "\n";
    std::cout << "    完整性校验  : " << (ok ? "通过 (报文未被篡改)" : "失败 (报文被篡改, 丢弃!)") << "\n";
    if (ok) {
        Bytes riv(record.begin(), record.begin() + 16);
        Bytes rct(record.begin() + 16, record.end());
        Bytes dec = aesimpl::cbc_decrypt(enc_key, riv, rct);
        std::cout << "    解密还原明文: " << bytes_to_str(dec) << "\n";
    }

    // --- 5. 演示篡改被检测 ---
    std::cout << "\n[5] 攻击演示: 中间人翻转密文 1 个比特\n";
    Bytes tampered = record;
    tampered[20] ^= 0x01;
    Bytes tcheck = sha256impl::hmac(mac_key, tampered);
    std::cout << "    篡改后重算 MAC 与原 tag 一致? " << ((tcheck == tag) ? "是" : "否 -> 立即被发现, 拒绝解密")
              << "\n";
    std::cout << "==========================================================\n";
}


// 上面代码省略，太多了，影观感。
int main() {
    std::cout << "==============================\n";
    std::cout << "   加密算法工具箱 (C++ 单文件)\n";
    std::cout << "==============================\n";
    while (true) {
        std::cout << "\n"
                  << "  1. MD5 哈希\n"
                  << "  2. SHA-256 哈希\n"
                  << "  3. RC4 加/解密\n"
                  << "  4. AES-128/256 加/解密 (CBC)\n"
                  << "  5. Base64 编/解码\n"
                  << "  6. Hex 编/解码\n"
                  << "  7. 模拟加密协议加密过程 (TLS 风格: 握手+会话加密+完整性校验)\n"
                  << "  0. 退出\n";
        std::string c = readline("选择功能: ");
        if      (c == "1") do_md5();
        else if (c == "2") do_sha256();
        else if (c == "3") do_rc4();
        else if (c == "4") do_aes();
        else if (c == "5") do_base64();
        else if (c == "6") do_hex();
        else if (c == "7") do_protocol();
        else if (c == "0") { std::cout << "拜拜\n"; break; }
        else std::cout << "没这个选项\n";
    }
    return 0;
}
```

省略一部分代码，主要就是模拟了一个协议部分然后里面有一些常见的加密算法。main入口是没有加保护的，保护是算法和模拟协议的函数上。（上面给的例子是没有写vmp宏函数的，这个需要注意一点）

## 外壳研究

## VMP外壳解压流程

其实整套VMP加载思路，根据流传出来的3.51源码来看，可以简单总结成如下：

```cpp
● PE EntryPoint（已被改写指向壳入口）
          │
          ▼
  ① Loader 自举
       · 算 delta = 实际 ImageBase − 首选 ImageBase
       · 自解密 loader 自身的数据/字符串
       · 走 PEB 找 kernel32 → 拿到 LoadLibrary / GetProcAddress / VirtualAlloc/Protect
          │
          ▼
  ② 环境检查（反调试 / 反虚拟机，若开启）
       · PEB.BeingDebugged / NtGlobalFlag
       · 时间差 / CPUID hypervisor 位 / 已知虚拟机特征
       · 命中 → 走失败路径（退出 / 破坏执行）
          │
          ▼
  ③ 解包原始镜像
       · 解密 + 解压被打包的原始区段（.text / .rdata …）
       · 还原到各自的虚拟地址处
          │
          ▼
  ④ 修重定位
       · 按 delta 逐条 patch 原始镜像的重定位项
          │
          ▼
  ⑤ 重建 IAT（导入保护的核心）
       · 遍历保存的导入信息
       · LoadLibrary 每个依赖 DLL，GetProcAddress 每个导入函数
       · 把真地址写进 IAT / 生成导入派发桩（多态 stub，靠返回地址区分调哪个 API）
          │
          ▼
  ⑥ 初始化 VM 引擎
       · 布置 VM 上下文 / handler 表
       · 供 VMProtectBegin/End 标记的虚拟化函数使用
          │
          ▼
  ⑦ 恢复内存保护属性
       · 把 .text 等区段设回 可执行（RX）   ★
       · TLS 回调（若有）
          │
          ▼
  ⑧ jmp OEP  ← 原始程序真正开始执行
```

其实核心dump点就是在回复内存属性后给他dump出来就行了。但是这里面牵扯出几个问题：  
1.vmp是通过syscall来规避我们的hook  
2.vmp会检测虚拟机环境  
3.vmp会检测当前是否是测试模式下，也就是关闭驱动签名情况下。  
这几个问题导致我们如果在内核去做dump的话还需要处理一下环境问题，虽然也不是很难，但是折腾起来非常复杂。

## Dump方案1：内核

可以通过我的发现可以，vmp实际上是调用的syscall 50这个来恢复属性的。所以实际上如果你能在syscall 50下断就可以解决直接进行手工dump，配合windbg来做。前提是Vmp没有开启vt环境的检查。内核的环境检查。

## Dump方案2：三环思路

这里我重点介绍三环思路，内核干还是太不够优雅。这里我直接采用： DLL注入VEH异常接管。下面我详细介绍一下VEH如何Dump：  
先简单介绍一下VEH(想更详细可以看看站内其他VEH文章非常详细)：

```cpp
  异常发生（比如 DEP 执行违规）
     │
     ▼
  内核 KiDispatchException
     │
     ├─ ① 先问调试器（第一次机会）── 内核态完成
     │      没附加调试器 → 跳过
     │
     ▼  铺上下文到用户栈，转入用户态
  ntdll!KiUserExceptionDispatcher → RtlDispatchException
     │
     ├─ ② VEH 链   ← 我们在这里！
     │
     ├─ ③ SEH 链（栈帧上的 __except）
     │
     ▼  用户态没人处理，返回内核
  内核
     │
     ├─ ④ 第二次机会给调试器
     │
     ▼
  ⑤ 还是没人处理 → 进程终止（UnhandledExceptionFilter / WER）
```

就是非常简单，主动触发异常，然后整个异常的处理链上，我们找到一个合适的入口点接管异常，这个思路和去年我写的安卓Linux异常接管调试器是一模一样的思路。我们只是不同系统不一样。主要的是在用户态做的。（感兴趣可以看一下我其他的文章）这样完全暴力规避掉调试器附加进去产生的一系列问题。

### 如何触发异常？

设置.text段熟悉是不可执行属性。  
修要注意几个问题  
1.在高版本中VMP会扫描检查.text段的内存属性，如果内存属性不对就会修改  
2.会抹掉我们的veh设置的回调函数  
这里我们需要创建一个线程定时去扫描内存属性，如果来达到触发异常的效果。并且定期检查我们的回调是否被挤掉了。

```rust
  // 常量：区分"带执行权限"和"带写权限"的保护值
  const PAGE_EXECUTE_MASK: u32 = 0xF0; // 所有可执行的保护值
  const PAGE_WRITE_MASK:   u32 = 0xCC; // RW|WC|ERW|EWC，所有可写的保护值

  // —— Instrumentation Callback：每次 syscall 从内核返回用户态都会触发 ——
  // 布防后：一旦发现 VMP 把 .text 改回了可执行，立刻剥回 RW
  extern "system" fn on_syscall_return() {
      // ...（重入保护、LATE_ARM 判断见 ②）...
      if ARMED.load(Ordering::Acquire) && !OEP_FOUND.load(Ordering::Acquire) {
          let start = TEXT_START.load(Ordering::Acquire);
          let end   = TEXT_END.load(Ordering::Acquire);
          let mut old = 0u32;
          // 无条件把 .text 剥成 PAGE_READWRITE（去掉执行位）
          let ok = unsafe {
              VirtualProtect(start as *mut c_void, (end - start) as usize,
                             PAGE_READWRITE, &mut old)
          };
          // 如果剥之前它是可执行的，说明刚被 VMP 恢复过 —— 记一次拉锯
          if ok != 0 && (old & PAGE_EXECUTE_MASK) != 0 {
              REAUTH_COUNT.fetch_add(1, Ordering::AcqRel);
          }
      }
  }
```

```rust
  unsafe fn install_callback() -> i32 {
      let mut cb = PROCESS_INSTRUMENTATION_CALLBACK_INFORMATION {
          Version: 0, Reserved: 0,
          Callback: instrumentation_stub as *mut c_void,
      };
      NtSetInformationProcess(
          GetCurrentProcess(),
          0x28, // ProcessInstrumentationCallback
          &mut cb as *mut _ as *mut c_void,
          core::mem::size_of::<PROCESS_INSTRUMENTATION_CALLBACK_INFORMATION>() as u32,
      )
  }

  extern "system" fn watchdog_thread(_p: *mut c_void) -> u32 {
      unsafe {
          for _ in 0..2000 {
              install_callback(); // VMP 清一次，我们抢回来一次
              Sleep(5);
          }
      }
      0
  }
```

```rust
  #[unsafe(naked)]
  unsafe extern "system" fn instrumentation_stub() {
      core::arch::naked_asm!(
          "push r10", "push r11", "push rax", "push rcx",
          "push rdx", "push r8",  "push r9",  "push rbp",
          "mov rbp, rsp", "and rsp, -16", "sub rsp, 32",
          "call {handler}",
          "mov rsp, rbp", "pop rbp",
          "pop r9", "pop r8", "pop rdx", "pop rcx",
          "pop rax", "pop r11", "pop r10",
          "jmp r10",                    // r10 = 内核放的真实返回地址
          handler = sym on_syscall_return,
      );
  }
```

### Oep的真假判断

由于text字段里面实际上是有vmp自己的代码的，所以一开是运行的实际上还是vmp的代码，如果在这个时候进行dump则不是我们想要的数据。  
解决方案：  
主要就是判断内存段的权限，整理了一个流程图：

```cpp
  初始：密文，RX(可执行可读)         ← VMP 还没开始解它
    │
    ▼  VMP 要往里写明文 → 必须先给写权限
  中间：变成可写（WRITECOPY / RWX 之类）  ← 正在解密！★关键信号
    │
    ▼  解密完，明文就位，改回可执行
  最终：回到 RX(可执行可读)            ← 解密完成、稳定，马上要 jmp OEP
```

通过内存属性的判断，就可以获取到当前VMP的代码解密运行到了哪一个阶段，当有写入权限的时候，则是还在解压代码的过程。

### OPE段下后的Dump处理细节

这里给一个流程：  
1.冻结所有进程。  
2.读内存 + 修 PE 头，这里主要是分三步：

-   ① EntryPoint 改成 OEP——原来的 EntryPoint 指向 VMP 壳入口，现在直接指向真 OEP。  
    打开，入口就落在原始程序的 OEP 上，不用再手动找。
-   ② FileAlignment = SectionAlignment——让文件对齐和内存对齐一致。
-   ③ 每个节 PointerToRawData = VirtualAddress、SizeOfRawData = 对齐(VirtualSize)——raw  
    偏移直接等于虚拟偏移。这是"内存快照直接当文件"的关键：文件里第 X 字节 = 内存里 RVA 为 X 的字节，一一对应。

```rust
  // 在 on_syscall_return 里，ARMED 之前先跑这段
  if config::LATE_ARM && !ARMED.load(Ordering::Acquire)
     && !OEP_FOUND.load(Ordering::Acquire) {
      let start = TEXT_START.load(Ordering::Acquire);
      let end   = TEXT_END.load(Ordering::Acquire);
      let mut mbi: MEMORY_BASIC_INFORMATION = unsafe { core::mem::zeroed() };
      let ok = unsafe {
          VirtualQuery(start as *const c_void, &mut mbi,
                       core::mem::size_of::<MEMORY_BASIC_INFORMATION>())
      };
      if ok != 0 {
          let p = mbi.Protect;
          // 条件A：见过可写 → 记下"解密发生过"（只进不退）
          if p & PAGE_WRITE_MASK != 0 {
              SAW_WRITE.store(true, Ordering::Release);
          }
          // 条件B：当前可执行 且 不可写 = 解密完成、稳定
          let finalized_exec = (p & PAGE_EXECUTE_MASK != 0)
                            && (p & PAGE_WRITE_MASK == 0);
          // A 且 B 才布防 —— 单看 B 会把"初始密文态"误判成时机
          if SAW_WRITE.load(Ordering::Acquire) && finalized_exec {
              let mut old = 0u32;
              unsafe {
                  VirtualProtect(start as *mut c_void, (end - start) as usize,
                                 PAGE_READWRITE, &mut old);
              }
              ARMED.store(true, Ordering::Release); // 正式进入拉锯
          }
      }
  }
```

```rust
  unsafe extern "system" fn veh_handler(info: *mut EXCEPTION_POINTERS) -> i32 {
      let rec = (*info).ExceptionRecord;
      // 只认访问违规
      if rec.is_null() || (*rec).ExceptionCode != STATUS_ACCESS_VIOLATION {
          return EXCEPTION_CONTINUE_SEARCH;
      }
      // 只认"执行"违规（[0]==8），读/写违规一律放过 —— 信噪比关键
      if (*rec).ExceptionInformation[0] != 8 {
          return EXCEPTION_CONTINUE_SEARCH;
      }
      // 出错地址必须落在 .text 范围内
      let fault = (*rec).ExceptionInformation[1] as u64;
      let start = TEXT_START.load(Ordering::Acquire);
      let end   = TEXT_END.load(Ordering::Acquire);
      if fault < start || fault >= end {
          return EXCEPTION_CONTINUE_SEARCH;
      }
      // 走到这，fault / RIP 就是真 OEP
      let ctx = (*info).ContextRecord as *const u8;
      let rip = (ctx.add(0xF8) as *const u64).read_unaligned(); // x64 CONTEXT.Rip
      // ...（收尾见 ③）...
      EXCEPTION_CONTINUE_EXECUTION
  }
```

3.导出模块表。将当前目录下所有dll都导出，这样就可以接着修复iat。  
4.结束进程。

```rust
  // veh_handler 内，确认是 OEP 后：
  if !OEP_FOUND.swap(true, Ordering::AcqRel) {   // 原子，只进一次
      OEP_RIP.store(rip, Ordering::Release);       // 存下 OEP
      let mut old = 0u32;
      // 必须恢复执行权，否则 CONTINUE_EXECUTION 回去又立刻异常
      VirtualProtect(start as *mut c_void, (end - start) as usize,
                     PAGE_EXECUTE_READ, &mut old);
      
      SetEvent(OEP_EVENT.load(Ordering::Acquire) as HANDLE);
      WaitForSingleObject(PARK_EVENT.load(Ordering::Acquire) as HANDLE, INFINITE);
  }
```

代码就不展示那么多了，思路都差不多，现在AI居于这个思路开发一下就行了。  
展示一下最后的效果图：  
![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c7f1a6a9801941d3.webp)

## IAT修复

VMP会扫描会混淆IAT调用表，吧所有的外部调用都改成跳板形式的，就算dump下来了也不知道程序在干什么影响静态分。  
这里可以把iat分成两类：  
1.单纯的抹掉了iat地址，在运行时 vmp会自主回填iat地址（一般都是三方库函数）如图：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1907826efc972f0a.webp)
  
2.通过一个跳板跳转到他自己的虚拟机里面去进行iat混淆，尤其是系统库非常恶心。

### IAT 表重建

在上面介绍过导入模块导出，实际上就是记录一下当前加载的DLL信息。如图：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/56b251647bee1576.webp)
  
可以通过观察跳板跳转IAT是有一个明显的特征首先他肯定是在.text节里面  
  
push call 可以看到他是在text节里面然后跳转到其他节去了：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/85adacede4db7002.webp)
  
所以特征比较明显了：

```rust
  vmp = [x for x in pe.sec if (x['ch'] & 0x20000000) and x['name'] != '.text']

  for k in range(len(blob) - 5):
      if blob[k] in (0xE8, 0xE9):                    # 找 call / jmp
          tgt = tva + k + 5 + 解位移                  # 算目标地址
          if in_vmp_exec(tgt):                         # ★ 唯一判据
              code_stubs.add(tgt)                      # → 这就是 VMP 导入桩
```

直接判断是否是跳转指令以及跳转到的未知是否再别的节里面。  
然后我们主要借助模拟执行来分析最后到底调用的是哪个函数，这里使用Unicorn 模拟每个入口点，算出API位置。  
讲解一下模拟执行的思路：  
由于我们的VMP IAT加密有个特别点，就是实际上函数的返回值和函数的调用是固定的，也就是外部环境无论是什么样内部输出结果一定是固定的，所以我们只需要模拟执行就可以知道正确的返回地址，以及最后到底访问了谁。我们只需要还原IAT所以也就不需要完全模拟真实的函数调用，外部环境可以直接忽略不计。  
代码如下:

```rust
  def resolve_stub(pe, BASE, IMG, stub_rva, fill=0x00, ret=0x1111111111111111):
      STACK = 0x10000000; SS = 0x200000          # ① 伪造栈
      uc = Uc(UC_ARCH_X86, UC_MODE_64)
      uc.mem_map(BASE, IMG)                       # ② 映射整个 dump
      uc.mem_write(BASE, bytes(pe.d))             #    写进去
      uc.mem_map(STACK, SS)                       # ③ 映射伪造栈
      sp = STACK + SS // 2
      uc.reg_write(UC_X86_REG_RSP, sp)            # ④ 设栈指针
      uc.mem_write(sp, struct.pack('<Q', ret))    # ⑤ ★写返回地址到栈顶
      # ... hooks ...
      uc.emu_start(BASE + stub_rva, 0, 0, 30000)  # ⑥ 从桩入口开始跑
      a = land[0]
      if a is None or a == ret or BASE <= a < BASE + IMG:
          return None, tainted[0]                  # ⑦ 过滤无效结果
      return a, tainted[0]                         # ⑧ 返回真 API 绝对地址
```

这里直接采用对比法，我们模拟构造几个栈顶，如果栈顶结果会导致最终结果发生变化则删除这个点说明这个位置是一个假的iat入口点，或者是其他入口点不是我们要的。

```rust
    a0, t0 = resolve_stub(pe, BASE, IMG, st, fill=0x00, ret=0x1111111111111111)   # ① 假ret
    a1, _  = resolve_stub(pe, BASE, IMG, st, fill=0xCC, ret=0x1111111111111111)   # ② 假ret+变fill
    a2, _  = resolve_stub(pe, BASE, IMG, st, fill=0x00, ret=0x2222222222222222)   # ③ 变ret 搞懂
```

当我们拿到地址后就可以和最开始我们从dump拷贝下来的dll映射地址进行比较，来确定他到底是什么api。  
例如;  
拿之前的 0x140001054 举例：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fc5b38ca682f3610.webp)
  
模拟执行计算出来就命中在这个里面  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fc8f473a90737bdd.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/927f316f99758161.webp)
  
  
可以看到0x5230就是这个 api  
对照一下原版无壳和有壳版本：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/5cd09168a454f684.webp)
  
IAT加密版本：  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/372af5b823f23774.webp)

然后我们还需要注意清洗我们的VMP IAT 入口点：  
1.排掉 没有模拟执行结果的入口  
2.排掉 没有被VMP 混淆过的函数调用  

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0e0c3a1e126e758b.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/375ab002c8c903c6.webp)
  
  
得到结果后就可以patch了，或者生成符号文件了。这样用于静态分析是没有问题的。  
如果想要动态加载起来，就需要解决重定位问题我觉得这个量太大了。  
可以写一个加载器，手工申请地址空间来控制并且手工加载DLL，来做到一个加载器效果，这样解决随机基址的问题。（这些我就不展示了手法太多了）

## 还存在一些小问题

当前脱壳完由于很多地址是vmp自己回填进去的，也就是vmp自己构建了一个重定位表来做回填。我们dump已经重定位后的，导致dump下来都是一些固定地址，还需要修复这固定地址，或者只能dump下的那几分钟可能能用重启后或者过几个小时就不能用了（这个就看运气了hhh我几个小时也没事）。
