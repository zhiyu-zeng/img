---
title: 五个函数，一条链 - Apple FairPlay DRM 的 Frida 逆向全记录 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/fairplay-drm-frida-reversing/
source_host: overkazaf.github.io
clip_date: 2026-08-04T11:23:10+08:00
trace_id: 7e18faa5-7ffe-4dd9-802d-ece5425c05dc
content_hash: 11d1d6b323780acc1f6dfcd7269d716808ca0b7a2bc15047a54b3c0f0373af88
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: overkazaf·逆向
ai_summary: 利用Frida分组hook在7000+导出函数中定位白盒AES解密入口，还原FairPlay DRM从Java到Native的完整5函数调用链，确认in-place解密模式并流式dump裸ALAC样本。
ai_summary_style: key-points
images_status:
  total: 33
  succeeded: 33
  failed_urls: []
notion_page_id: 3b275244-d011-81f8-923a-de453f40e701
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 利用Frida分组hook在7000+导出函数中定位白盒AES解密入口，还原FairPlay DRM从Java到Native的完整5函数调用链，确认in-place解密模式并流式dump裸ALAC样本。
> 
> - **触发入口：** Java层 `FootHillDecryptionKey` 通过 `getFpsCert`/`getPersistentKey` 启动Native解密流程。
> - **核心定位方法：** 将 `libandroidappmusic.so` 的7000+导出函数按1k一组分批hook，配合函数名前缀过滤与二分法，精确筛出混淆名白盒AES函数 `NfcRKVnxuKZy04KWbdFu***`。
> - **in-place解密确认：** 该函数入参v7和v8指向同一buffer，密文被直接原地替换为明文，解密类型固定为 `0x05`（DECRYPTOR_TYPE_PASTIS_TS），解密前后数据大小不变。
> - **5函数调用链：** 还原完整生命周期——`instanceEv`获取会话单例 → `getPersistentKey`(9参)获取持久化密钥 → `decryptContext`(3参)生成解密上下文 → `kdContext`偏移24字节返回指针 → `N`函数执行白盒AES解密。
> - **产出限制：** 流式dump所得为裸ALAC样本序列，缺少容器元数据，需后续通过M4A封装才能正常播放。

> **读完本文，你将获得：**
> 
> -   掌握从 Java 层追踪到 Native 层的 Frida 动态插桩方法论（分组 hook + 二分定位）
> -   理解 FairPlay DRM 在 Android 上的完整解密调用链：5 个函数、4 个阶段
> -   学会识别 in-place 解密模式（输入输出共用 buffer）——这是 sample-AES 的典型特征
> -   获得一套可复用的"7000+ 导出函数中精确定位目标"的逆向工程流程

## 〇、摘要

本文记录了笔者对 Apple Music for Android（v3.6.0-beta）FairPlay DRM 实现的完整逆向分析过程。目标是理解 Apple 如何在 Android 平台上保护 ALAC 无损音频，并找到从播放流中提取明文音频数据的技术路径。

核心发现：

1.  **FairPlay 解密调用链还原**：从 Java 层的 `FootHillDecryptionKey` 追踪到 Native 层的 5 个关键函数，完整还原了「初始化 → 密钥获取 → 解密上下文创建 → 逐样本解密」的四阶段生命周期
2.  **白盒 AES 入口定位**：在 `libandroidappmusic.so` 的 7000+ 导出函数中，通过分组 hook + 二分法定位到核心解密函数 `NfcRKVnxuKZy04KWbdFu***` （混淆函数名），确认其 5 个参数的语义
3.  **in-place 解密确认**：解密函数的输入和输出共用同一个 buffer 指针，明文直接覆盖密文——这是 sample-AES 的典型实现模式
4.  **流式 dump 验证**：通过 Frida 拦截 N 函数的调用前后，将加密/解密 buffer 分别 dump 到文件，验证了解密前后数据大小一致，且解密后为裸 ALAC 样本序列

本系列文章分为三部分：

-   **本文（Part 1）**：基于 Frida 动态插桩导出 ALAC 音频的初始版本
-   **[Part 2：优化篇](https://overkazaf.github.io/blogs/posts/fairplay-drm-decrypt-pipeline-optimization/)**：基于运行时仿真和 TCP 管线化的 57x 性能优化
-   Part 3（计划中）：FairPlay DRM 与 Widevine DRM 的技术对比

* * *

## 一、背景

### 1.1 Apple Music 的音频保护机制

Apple Music 提供两种音频获取模式：

-   **付费购买** （.m4a）：无 DRM 保护，永久拥有
-   **会员订阅** （.m4p）：FairPlay DRM 保护，会员期可听，过期后自动删除

笔者的研究动机： **能否使用会员账号即可下载到无 DRM 保护的最高音质 ALAC 格式音频文件，进行永久保存？**

### 1.2 两条还原思路

拿到这个命题，笔者主要有两个切入思路：

1.  **Frida 插桩还原**：参考之前 Widevine DRM 方案下 Apple Music 流式播放解密的经验，通过播放触发解密流程，在解密过程中 dump 解密流
2.  **核心算法 hook + 仿真还原**：逆向分析 FairPlay DRM 协议的调用流程，将核心解密流程还原，实现脱离真机环境的解密

第一个方案主要基于 Frida 插桩还原；第二个方案涉及到核心算法 hook、真机环境模拟和还原。为了快速验证思路，笔者优先采用第一个方案。

### 1.3 工具清单

| 类别  | 工具  | 版本  |
| --- | --- | --- |
| 逆向工具 | Frida | 16.6.6 |
|     | radare2 | 5.8.9 |
|     | IDA Pro | 9.1 |
|     | Jadx-GUI | 1.5.1 |
|     | objection | 1.11.0 |
|     | ADB | 35.0.2 |
| 运行环境 | Android Studio AVD | Pixel 8 Pro, API 27, x86_64 |
| 客户端 | Apple Music | 3.6.0-beta |
| AI 辅助 | Gemini 2.5 Pro / ChatGPT 4o / Claude 3.7 | —   |

![Android Studio 运行环境](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9594eac59fd1d421.png) *Android Studio AVD + Apple Music 运行环境：Pixel 8 Pro 模拟器上播放 ALAC 无损音频*

* * *

## 二、静态分析：从 Java 到 Native

### 2.1 Jadx 反编译 — 发现 FootHill

首先在 Android Studio 创建 AVD 虚拟机，安装 Apple Music，登录账户，将下载参数调节为最高音质。

![Apple Music 音质设置](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e6e56523ac737db1.png) *Apple Music 下载音质设置：AAC 256kbps / ALAC 48kHz 24bit / ALAC 192kHz 24bit*

使用 Jadx 仔细搜索反编译代码后，发现 FairPlay DRM 相关调用在 `FootHill` 相关的类中（foothill 是 FairPlay DRM 相关的项目代号）。

![Jadx 反编译 FootHillDecryptionKey](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f22f87067dfaf36d.png) *Jadx-GUI 中反编译得到的 FootHillDecryptionKey 类*

![FootHillDecryptionKey 类结构](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b9cba214e0ea85b0.png) *FootHillDecryptionKey 类的关键字段：defaultKeyFormat、fpsCert、persistentKey*

关键类： `com.apple.android.music.playback.player.cache.FootHillDecryptionKey`

通过 Gemini 分析，结合笔者之前的 Widevine DRM 还原经验，这个类的作用是在播放器开始播放后完成以下操作：

-   使用 FPS（FairPlay Streaming）证书，根据 adamId（Apple Music 的音频资源唯一 ID）获取解密密钥
-   使用解密密钥 KeyData 实例来解密音频数据

![Gemini 分析 FootHillDecryptionKey 调用流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9517317d350af889.png) *Gemini 2.5 Pro 分析的 FootHillDecryptionKey 9 步调用流程：从 getKey() 到 decryptContext*

![getKey() 源码中的 generateSessionContext](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/eff43321d184023c.png) *Jadx 反编译 getKey() 方法：generateSessionContext 调用高亮*

### 2.2 IDA Pro + radare2 — Native 层定位

结论是 Apple Music 更大的概率是会通过内部的 SO 库进行相关逻辑的封装，下一步就需要找到这个库来动态调试了。

确认了发生 FairPlay DRM 解密的流程大概率是在 `libandroidappmusic.so` 这个文件中。 **注意，本文主要选中的是 x86 架构下的 SO 文件进行分析，arm 架构下的 SO 文件对应函数定义会有较大差异，文中主要用于关键函数的参考对比。**

![IDA Pro 函数列表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6ed8d8c82749b104.png) *IDA Pro 加载 libandroidappmusic.so 后的函数列表：SVFootHillSessionCtrl 相关函数*

使用 radare2 快速过滤 foothill & decrypt 相关函数：

```bash
r2 -A libandroidappmusic.so
iE | grep -i "foothill|decrypt"
```

![radare2 过滤结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0d5e14ddaf323927.png) *radare2 终端过滤 foothill|decrypt 相关函数*

主要扫描出来三个可疑的切入点：

-   **A 函数**： `SVFootHillSessionCtrl::decryptContext` — 核心解密上下文入口
-   **B 函数**： `SVFootHillSessionCtrl::_decryptContextWithPersistentKey` — 持久化密钥分支
-   **C 函数**： `SVFootHillSessionCtrl::_decryptContextWithCkcKey` — CKC 密钥分支

回到 IDA Pro，简单看了下代码，大致得到结论是： **三个函数中的入口其实是 decryptContext 函数，如有本地持久化的解密 key，则走 \_decryptContextWithPersistentKey 分支；否则走 \_decryptContextWithCkcKey 分支。**

* * *

## 三、动态调试：7000+ 函数中的大海捞针

### 3.1 Frida hook decryptContext

笔者试着先以 Frida 脚本进行 decryptContext 相关函数的动态调试。

> 注意：这里必须要打开 Apple Music 应用的最高音质的配置，歌曲播放时才会触发 FairPlay DRM 过程中的 ALAC 音频相关的 native 解密函数。

使用 objection 拦截 FPS 证书相关的调用：

```bash
objection -g com.apple.android.music explore
android hooking watch class_method \
  com.apple.android.music.playback.player.cache.FootHillDecryptionKey.getFpsCert \
  --dump-args --dump-backtrace --dump-return
```

![objection 拦截 getFpsCert](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3c99ce66574adca4.png) *objection 拦截 getFpsCert 输出：backtrace 和 FPS 证书返回值*

![objection 拦截 getPersistentKey](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b2f51110e8080370.png) *objection 拦截 getPersistentKey 调用的 backtrace*

这个过程与 IDA Pro 看到的代码一致，入口是 A 函数，接着按条件走到了使用持久化 key 解密的分支，即 B 函数。

![VS Code Frida hook 脚本与终端输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/30e19eb8645049df.png) *VS Code 中的 Frida hook.js 脚本 + 终端输出：decryptContext 调用链*

### 3.2 分组 hook — 从 7k+ 函数中定位解密核心

因为将全部函数进行拦截和日志打印大概率会触发应用 crash，这里介绍个技巧：

1.  先通过 Gemini 对 SO 文件的导出函数总结进行分类、分组，推测不同组别函数的作用并标记
2.  类似于二分法的思路，将 7k+ 函数进行分组和调用标记，确认执行过程中使用到的函数
3.  将 7k+ 函数分组，每组 1k 个。在此基础之上，区分开函数名带 `_ZN` 前缀和不带 `_ZN` 前缀的部分。合计要做 16 次手动拦截和 grep 汇总

![分组检测 Frida 脚本](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/76f9cd9bc25f7394.png) *detect_music_functions.js：Frida 分组检测脚本，每组 1k 函数*

```bash
grep "calling" *.log | sort | uniq > summary/g1.log
```

![分组 hook 日志结果](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fd10b048e3b750a9.png) *g1.log：第一组函数的 hook 结果*

![分组 hook 与 Apple Music 日志对比](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9cb304ae1ff7568c.png) *分组 hook 日志（左）与 Apple Music 运行日志（右）：decryptContext 调用高亮*

![汇总日志定位 NfcRKV](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/46f29d783aba162b.png) *sum.log 汇总结果：成功定位 NfcRKVnxuKZy04KWbdFu* \*\* 和相关 crypto 函数\*

经过近一周的测试，笔者使用了组合方法（根据函数名分类 + 分组逐步标记定位，1000 个函数一组，排除特定函数前缀等方式穷举），最终定位到解密流触发的函数 **`NfcRKVnxuKZy04KWbdFu***`**。

### 3.3 N 函数参数分析

在单次的音频播放解密过程中打印函数的入参发现，N 函数的前几位参数有一些特征：

-   **args0**: 在会话中为恒定值，应该是某个指针变量
-   **args1**: 恒为 5，常量
-   **args2**: 变化
-   **args3**: 与 args2 相同
-   **args4**: 有变化，但范围不大
-   **args5**: 恒为 0x0
-   **args6**: 在会话中为恒定值
-   **args7**: 恒为 0x7f7f7f7f7f7f7f

![IDA Pro decryptSample 中的 NfcRKV 调用](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ebd4a14d9ca222b4.png) *IDA Pro x86 decryptSample 伪代码：红框标注 NfcRKV 函数调用*

结合动态拦截到的参数以及静态分析的结果可以确认：

-   **实际发生音频解密环节的确是 NfcRKVnxuKZy04KWbdFu** \* 函数\*\*
-   N 函数的入参有五个（ref, decryptContentType, v7, v8, v9），分别是：
    -   `ref` — 由 kdContext 函数返回数据所指向的变量得到
    -   `decryptContentType` — 枚举值，固定为 0x05，即十进制数 5（ `DECRYPTOR_TYPE_PASTIS_TS` ）
    -   `v7` — SVBuffer::buffer(sample)，待解密的缓冲区数据
    -   `v8` — SVBuffer::buffer(sample)，待解密的缓冲区数据（与 v7 相同 = **in-place 解密**）
    -   `v9` — SVBuffer::size(sample)，待解密的缓冲区数据大小

![SVDecryptorType 枚举](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bf52bdc50573106a.png) *SVDecryptorType 枚举定义：DECRYPTOR_TYPE_PASTIS_TS = 0x05 高亮*

![SVBuffer::buffer 实现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e93171772f2e2044.png) *IDA 伪代码：SVBuffer::buffer 返回 `*(_QWORD *)this + 4`*

![SVBuffer::size 实现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c1678e7334e4abc1.png) *IDA 伪代码：SVBuffer::size 返回 `*(unsigned int *)this + 6`*

* * *

## 四、参数还原：逐函数击破

### 4.1 getPersistentKey — 9 个参数

通过反复对比 x86 和 arm 两个函数定义，推断 getPersistentKey 函数一共需要 9 个参数：

| #   | 参数名 | 来源  | 说明  |
| --- | --- | --- | --- |
| a1  | persistentKeyPtr | 返回值指针 | 输出：持久化密钥 |
| a2  | svFootHillSessionCtrl | 实例指针 | SessionCtrl 单例 |
| a3  | adamId | 歌曲 ID | Apple Music 资源标识 |
| a4  | keyUrl | Jadx | 解密 key 对应的 URL |
| a5  | keyFormat | Jadx | 解密 key 的格式 |
| a6  | keyVersion | Jadx | 版本  |
| a7  | keyServerUrl | Jadx | 服务端 URL |
| a8  | keyServerProtocolType | Jadx | 协议类型 |
| a9  | keyCert | Frida 导出 | FPS 证书 |

![IDA arm getPersistentKey 参数列表](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d2e2a2c84afe68a0.png) *IDA Pro arm 架构下 getPersistentKey 函数定义：9 个参数红框标注*

![Frida getPersistentKey 调用输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4be490fa782bdb69.png) *Frida 拦截输出：getPersistentKey → instanceEv → decryptContext 的完整调用链及参数*

![getPersistentKey 返回值](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/988c316aa3e1442b.png) *Frida 拦截 getPersistentKey 返回值：persistentKey 数据*

### 4.2 decryptContext — 3 个参数

-   **a1**: 指针数据，需要动态调试确认
-   **a2**: svFootHillSessionCtrl 实例所在的指针地址
-   **a3**: 指针数据（persistentKey），需要动态调试确认

返回值是解密上下文引用指针。

![IDA x86 decryptContext 参数](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/727ad55a24695143.png) *IDA Pro x86 decryptContext 函数签名：3 个参数*

![IDA decryptContext 实现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6d33d87088bcde4c.png) *IDA Pro decryptContext 实现：decryptContentType 分支逻辑*

![Frida decryptContext 返回值](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/65d9bc54deac8a38.png) *Frida 拦截 decryptContext 返回值的 hexdump*

### 4.3 kdContext — 1 个参数

函数的执行过程很简单，进行了地址指针 + 24 的操作后立即返回：

```c
__int64 __fastcall SVFootHillPContext::kdContext(SVFootHillPContext *this)
{
    return (__int64)this + 24;
}
```

![IDA kdContext x86 实现](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6dd09c9ad7e10c82.png) *IDA Pro x86 kdContext 伪代码： `return (__int64)this + 24`*

![radare2 验证偏移量](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/01da040a44e17e83.png) *radare2 计算确认：0x4b0 - 0x498 = 24，与 IDA 伪代码一致*

![Frida kdContext hook 输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fd040ce060173442.png) *VS Code 中 kdContext hook 的运行输出*

### 4.4 NfcRKVnxuKZy04KWbdFu\*\*\*— 5 个参数（白盒 AES 入口）

这是执行解密的核心步骤。它调用了 `NfcRKVnxuKZy04KWbdFu***` 这个函数（函数名可能被混淆），并传入了：

| #   | 参数  | 含义  |
| --- | --- | --- |
| ref | kdContext 双重指针 | 解密句柄/引用 |
| decryptContentType | 0x05 | DECRYPTOR_TYPE_PASTIS_TS |
| v7  | buffer 指针 | 输入数据（密文） |
| v8  | buffer 指针 | 输出数据（明文，与 v7 相同 = in-place） |
| v9  | size | 数据大小 |

![IDA decryptSample 完整流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0edb811c745849f8.png) *IDA Pro x86 decryptSample 伪代码：红框标注 kdContext 获取 → NfcRKV 调用的完整流程*

![IDA NfcRKV 伪代码](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d224b0d5a12bfe02.png) *IDA Pro NfcRKV 函数内部伪代码：白盒 AES 算术运算*

* * *

## 五、验证：流式 dump 解密数据

### 5.1 Frida dump 脚本

参考之前 Widevine DRM 的流式解密流程，笔者将 N 函数调用前后的 buffer 进行导出：

```javascript
if (exportFn.name.indexOf("NfcRKVnxuKZy04KWbdFu710u") !== -1) {
    Interceptor.attach(exportFn.address, {
        onEnter: function (args) {
            // dump 加密 buffer
            writeBuffer("enc_" + lastAdamId, readBuffer(args[2], args[4]));
        },
        onLeave: function (retval) {
            // dump 解密 buffer
            writeBuffer("dec_" + lastAdamId, readBuffer(this.buffer, this.bufferSize));
        }
    });
}
```

> 注意：要写入到 `/data/data/com.apple.android.music/cache/` 文件夹下，否则使用 Frida 进行写入时会报无权限。

![Frida hook 完整输出](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6d29bfe2233ca175.png) *VS Code Frida 脚本输出：kdContext 和 NfcRKV 的完整参数、指针地址和 buffer 数据*

### 5.2 验证结果

因为歌曲是持续播放的，当歌曲完成后，下一首歌又接着开始播放、解密并写入本地文件了。

```
enc_1809814459.bin  47M  2025-05-05 21:56
dec_1809814459.bin  47M  2025-05-05 21:56
```

可以发现：

-   播放过程中流式 dump 出来的解密前后音频样本大小一致（**确认 in-place 解密**）
-   但与应用内下载的 mp4 文件有所差别——因为 dump 的是 **裸 ALAC 样本序列**，还需要 M4A 容器重封装

* * *

## 六、逆向分析总结

### 6.1 五个关键 Native 函数

![FairPlay DRM 解密流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/01ae3b21050a6cfe.png) *完整的 FairPlay DRM 解密时序：从播放器请求到白盒 AES 解密。注意 N 函数的 v7 和 v8 指向同一个 buffer——这就是 in-place 解密的证据。*

| #   | 函数  | 作用  |
| --- | --- | --- |
| 1   | `SVFootHillSessionCtrl::instanceEv` | 获取 SessionCtrl 单例实例，解密流程的起始点 |
| 2   | `getPersistentKey` (9 参) | 获取持久化密钥，接收 adamId/keyUrl/keyFormat 等，用于建立解密会话并获取内容密钥 |
| 3   | `decryptContext` (3 参) | 使用持久化密钥生成可用的解密上下文 |
| 4   | `kdContext` (1 参) | 获取 kdContext，为调用 N 函数做准备 |
| 5   | `NfcRKVnxuKZy04KWbdFu***` (5 参) | **实际执行音频样本解密的函数**，接收解密上下文/类型标识/输入输出缓冲区和大小，对加密的 ALAC 数据执行 in-place 解密 |

### 6.2 FairPlay vs Widevine：流程对比

![逆向分析四阶段](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3c02058bbaa91ff6.png) *四个分析阶段：静态分析（Jadx + IDA）→ 动态调试（Frida 分组 hook）→ 参数还原（x86/arm 对比）→ 验证 dump。每个阶段的关键发现标注在右侧。*

在上述分析环节中，笔者验证了 Apple Music 的 FairPlay DRM 流程和 Widevine DRM 大方向上没差异，都是通过获取 m3u8 地址后，使用加密密钥或会话证书对加密的音频物料进行分段解密后组装。区别是在 DRM 实现流程的细节处理上：

| 维度  | FairPlay DRM | Widevine DRM |
| --- | --- | --- |
| 标准  | Apple 私有，无公开 UUID | 公开标准 (UUID: edef8ba9-…) |
| 密钥协议 | FPS SPC/CKC | PSSH → Challenge → License |
| Android 集成 | 内嵌 Native Library (libandroidappmusic.so) | 标准 MediaDrm API |
| 解密实现 | 白盒 AES (libCoreFP.so 内部) | CDM 模块 + 标准 AES |
| 密钥可见性 | **不可见** （白盒内部） | L3: 可通过 DFA 提取 |
| 解密位置 | Native 层 in-place | MediaDrm.provideKeyResponse() |

### 6.3 裸数据的局限

解密完成后的原始数据只是裸 ALAC 音频样本序列，没有包含任何容器格式的元素，播放器无法识别如何解析和播放这些原始数据。因此，客户端程序还需要收集所有解密后的 ALAC 数据块，组装成完整的音频数据流通过 M4A 容器封装才可正确使用。

这正是 [Part 2（优化篇）](https://overkazaf.github.io/blogs/posts/fairplay-drm-decrypt-pipeline-optimization/) 要解决的问题——笔者在 [aria](https://github.com/overkazaf/aria) 项目中，基于 rootfs chroot 方案将 Apple 自家的 FairPlay 实现封装到 TCP 服务中（m3u8 RPC 端口 47020，解密端口 47010），并通过 ISO BMFF 容器解析 + TCP 管线化实现了 57x 的速度提升和 94% 的内存优化。

* * *

## 参考资料

-   [Apple FairPlay Streaming 官方文档](https://developer.apple.com/streaming/fps/)
-   [ISO 14496-12 (ISO BMFF)](https://www.iso.org/standard/83102.html) — MP4 容器格式规范
-   [ALAC 开源编解码库](https://github.com/macosforge/alac)
-   [aria](https://github.com/overkazaf/aria) — 本项目的开源仓库，包含 FairPlay chroot 运行时、TCP 解密服务和完整的优化管线代码

* * *

*本篇文章的初衷是分享自己的逆向技术分析和个人思考过程，仅学习、科研使用，所涉及的内容仅供学习、交流，请勿将其用于非法用途！任何由此引发的法律纠纷均与作者本人无关，请自行负责！*
