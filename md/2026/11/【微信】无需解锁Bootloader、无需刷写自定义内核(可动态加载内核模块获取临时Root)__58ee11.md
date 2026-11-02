---
title: 【微信】无需解锁Bootloader、无需刷写自定义内核(可动态加载内核模块获取临时Root)
source: https://mp.weixin.qq.com/s/iSe3qMri6mvy8rvEmzreDA
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T10:56:09+08:00
trace_id: 2eff9aa7-8b11-4771-91ed-8b7b575e8daa
content_hash: c697bb69529211e20ed68ace26cf688e44818b720fe3f7f21b5e1bcc091bc0d4
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40c75244-d011-81ef-a1c0-d3b43ea18849
ioc:
  cves:
    - CVE-2026-43284
    - CVE-2026-43500
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**哆啦安全** *2026年11月2日 10:19*

[AI逆向 | APP逆向分析工具V4.7](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501489&idx=1&sn=870d01d41501ce07e820a66550ee8a54&scene=21#wechat_redirect)

[Android App抓包防护与绕过技术](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498981&idx=2&sn=cee86db8f16c3ac4ee97d11a68809e38&scene=21#wechat_redirect)

[Flutter App抓包(原理分析和绕过SSL检测)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498469&idx=1&sn=85457d9b06fa0127c279061fc639efb7&scene=21#wechat_redirect)

[安卓15抓包新姿势:Frida内存篡改+eCapture流量镜像](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498012&idx=1&sn=9ab0bfa4ffd329e164dd397e4ca0aec9&scene=21#wechat_redirect)

[Android手机变成随身渗透测试工作站(仅授权安全测试)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501499&idx=1&sn=2164cfe3dc237821388be3bc6ef00e48&scene=21#wechat_redirect)

[HarmonyOS Next(鸿蒙Next)针对APP抓包的工具和抓包方法](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498096&idx=1&sn=d860db578388a746b3423e99282e9cc3&scene=21#wechat_redirect)

[Android15+证书抓包问题(用户证书移系统后部分应用抓包失效)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498158&idx=1&sn=a7d71c678022fe035f19fa8693b2b135&scene=21#wechat_redirect)

[绕过检测终极指南:KernelSU环境下的Frida Hook与eCapture全协议抓包](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247497883&idx=1&sn=bbf2c03ad835d6df3fd53f57fecced5a&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/16865412eafa1964.webp)

[AI逆向 | APP逆向分析工具V4.7](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501489&idx=1&sn=870d01d41501ce07e820a66550ee8a54&scene=21#wechat_redirect)

[Android系统智能调试分析工具V7.9](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501456&idx=1&sn=6f5be0005a9900f9f8eb150014eda2d1&scene=21#wechat_redirect)

DirtyFrag 是一个针对 **CVE-2026-43284** （及关联漏洞 CVE-2026-43500）的 **临时性 Root（Ephemeral Root）利用工具**，主要用于在 **三星手机** （OneUI，具有 RKP/KDP 加固）上， **无需解锁 Bootloader、无需刷写自定义内核** 即可动态加载内核模块获取 Root 权限。

### 🧬 核心原理：页缓存写入原语

DirtyFrag 属于 **Dirty Pipe / Copy Fail 漏洞家族**，其本质是滥用内核的 **页缓存（Page Cache）写入原语**。

1.  **根本缺陷**：攻击者利用 `splice()` 将一个 **只读文件的页缓存页面** 固定到内核数据结构（如 `sk_buff` 的 frag 成员）中。随后，内核代码在该页面之上执行 **原地写入（in-place write）**，永久性地破坏了攻击者原本只能读取的文件在内存中的副本，从而修改只读文件（如 `setuid` 程序或 `/etc/passwd` ）来提权。
    
2.  **双漏洞链**：为了覆盖不同系统环境，DirtyFrag 串联了两个独立漏洞：
    

-   **CVE-2026-43284（xfrm-ESP 路径）**：通过 IPsec ESP 输入路径触发，提供 **任意 4 字节 STORE** 原语。需要 `unshare(CLONE_NEWUSER)` 权限，但绝大多数发行版都可用。
    
-   **CVE-2026-43500（RxRPC 路径）**：通过 RxRPC 原地解密路径触发，提供 **8 字节 STORE** 原语。 **无需命名空间权限**，但依赖 `rxrpc.ko` 模块（Ubuntu 默认加载）。
    
-   **回退机制**：利用程序会先尝试 ESP 路径；若命名空间创建被阻止（如 AppArmor 加固），则自动回退到 RxRPC 路径，从而实现“通用”提权。
    

4.  **Android 工程实现**：在三星设备上，DirtyFrag 将页缓存写入原语用于 **加载一个临时内核模块** （ `dfroot.ko` ）来绕过 RKP/KDP 保护，并以 `uid 1000` 启动一个 **一次性进程** 来写入下载模式授权字节（D2 Writer），整个过程不会向磁盘复制任何内容，也没有常驻守护进程。Root 是 **临时的**， **重启设备即恢复干净状态**，这本身也是一种恢复路径。
    

[Android病毒智能检测分析工具V3.6](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247500576&idx=1&sn=b985155458d76f30d3fefd8209488dcb&scene=21#wechat_redirect)

[Python字节码反编译工具(逆向分析)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498440&idx=1&sn=f7261eba6f21742ca4e1da1e2da4ce3c&scene=21#wechat_redirect)

[Python字节码反编译逆向分析(高级篇)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247498532&idx=1&sn=1120b97fcd9f69afff065d31956e6ab7&scene=21#wechat_redirect)

[Android安全隐私合规智能检测工具V5.6](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501350&idx=1&sn=1b6710f29c7f34f13c4908237fa67347&scene=21#wechat_redirect)

[逆向交流群|Android智能调试工具(下载地址)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247499472&idx=1&sn=0b0a5245ce898f0a53aaa6a36bdd4a6b&scene=21#wechat_redirect)

[鸿蒙(Android/HarmonyOS)病毒智能检测工具V5.4](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501437&idx=1&sn=6d0a6b489d43410d2e17f4fd20d60c7a&scene=21#wechat_redirect)

### 🛡️ 解决方案与缓解措施

#### 1\. 临时缓解方案（立即执行）

在官方补丁未普及时， **最有效的临时缓解措施是禁用相关内核模块**，直接切断攻击路径。

以 **root** 身份执行以下命令：

```swift
sh -c "printf 'install esp4 /bin/false\ninstall esp6 /bin/false\ninstall rxrpc /bin/false\n' > /etc/modprobe.d/dirtyfrag.conf; rmmod esp4 esp6 rxrpc 2>/dev/null; true"
```

该命令会创建配置文件阻止模块加载，并尝试卸载已加载的模块。

> **注意**： `rmmod` 可能因模块正在使用而失败，可用 `lsmod` 确认状态。若系统不依赖 IPsec 或 AFS 服务，禁用这些模块通常不会造成影响。

#### 2\. 官方修复与升级

-   **CVE-2026-43284**：已在 Linux 主线内核通过提交 `f4c50a4034e6` 修复（2026-05-08）。
    
-   **CVE-2026-43500**：披露时尚无补丁合并到任何内核树。
    
-   **彻底方案**：关注发行版安全公告，通过 `yum update --cve CVE-2026-43284` 或类似命令 **升级内核** 至包含修复的版本。
    

#### 3\. Android / 三星设备特别说明

-   **官方修复**：检查三星固件更新。若厂商已回填补丁，DirtyFrag 日志会提示“设备不易受攻击”。
    
-   **临时缓解**：Android 设备通常不便直接执行上述 `modprobe` 命令，需依赖厂商更新。
    
-   **恢复干净状态**：若曾运行过 DirtyFrag， **直接重启设备** 即可清除临时的内核模块和 Root 状态，恢复到未 Root 的干净环境。
    

#### 4\. 检测与清理（若怀疑已被利用）

由于攻击修改的是 **内存中的页缓存**，传统文件完整性监控（FIM）可能失效。若曾在未缓解系统上执行过漏洞利用，建议：

-   **丢弃页缓存**：执行 `echo 3 | sudo tee /proc/sys/vm/drop_caches` ，强制系统从磁盘重新读取数据，清除被污染的内存副本。
    
-   **重启系统**：最彻底的方式，直接清空易失性内存中的所有恶意修改。
    

总的来说，DirtyFrag 是 Dirty Pipe 类漏洞在 Android 生态的工程化延伸，其“临时 Root”特性降低了持久化后门风险，但漏洞本身（CVE-2026-43284/43500）影响广泛。 **临时禁用 `esp4` 、 `esp6` 、 `rxrpc` 模块** 是当前阻断攻击最直接有效的手段，彻底修复仍需等待并安装官方内核更新。

温馨提示

学习研究为主、切勿用于非法用途

[Android高版本系统Root思路和方法](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247499627&idx=1&sn=d91e9cec3d3c1b4fb3406cbc37d3aa4e&scene=21#wechat_redirect)

[当厂商开始收回钥匙2026年，Android Root还剩哪几条路？](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247501410&idx=1&sn=8364c7cf2e81b0328ae07fc36c6440c0&scene=21#wechat_redirect)

[Multi-Platform Root Expert v9.0 - 全平台提权与刷机工具](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247499126&idx=1&sn=cff5ec83340484e42712fe5a2fd2a225&scene=21#wechat_redirect)

[安卓Root技术的演进与选型指南(Magisk/KernelSU/APatch/SukiSU)](https://mp.weixin.qq.com/s?__biz=Mzg2NzUzNzk1Mw==&mid=2247500034&idx=1&sn=77f1b900e4895c53b855186766fe7bfe&scene=21#wechat_redirect)

![Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3f080239229cb24d.webp)

![Image](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9535322730d334b9.webp)

移动安全 · 目录
