---
title: 【看雪】hook libpairipcore.so
source: https://bbs.kanxue.com/thread-293121.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-01T19:16:40+08:00
trace_id: a4dc59ad-5dc5-4d85-b204-394d804718c7
content_hash: d8383d8eb0ef85d3c6346a8b2cbc39f9db8c4e0edd826531356d6be68342d3e9
status: synced
tags:
  - 看雪
  - Android逆向
  - 反调试
series: null
feed_source: 看雪·Android安全
ai_summary: hook libpairipcore.so 的目标从提取 IAPv2 字节码改为验证注入后能否正常进入游戏；真正阻碍是栈帧字符串检测，改掉自身类名即可绕过。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3ec75244-d011-818e-84d1-d14e3dad655e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> hook libpairipcore.so 的目标从提取 IAPv2 字节码改为验证注入后能否正常进入游戏；真正阻碍是栈帧字符串检测，改掉自身类名即可绕过。
> 
> - **目标调整：** 样本未用 TEE 动态下发密钥，base.apk 直接是 IAPv2，`VmDecryptor.decrypt()` 原样进出，因此放弃“Hook 后取字节码”，改测 Hook 后游戏能否正常运行。
> - **可用的 Hook 点：** `VMRunner.readByteCode(String)` 与 `VMRunner.getVmByteCode(String)` 都能成功命中，取到的字节数组与 APK assets 中存放的 VM 数据一致。
> - **崩溃位置：** Hook `executeVM()` 时 before 回调可命中并拿到字节码，但继续执行原函数即在 `libpairipcore.so+0x30b6c` 触发 SIGSEGV，after 回调不再执行；Hook 上层 `VMRunner.invoke()` 同样崩在同一地址。
> - **检测规则：** 通过 `Throwable.getStackTrace()` 判断栈帧字符串是否以 `de.robv.android.xposed` 开头。只删栈末帧、恢复长度无效；去掉中间 Hook 帧可正常返回；保留长度/顺序/方法名仅改 Xposed 类名可过，仅改方法名仍崩，末尾加 `de.robv.android.xposed.AnyClass` 同样触发崩溃。
> - **绕过方法：** 在加载前把自身 dex 中对应 class 名改成等长的随机字符串（非重新编译），检测即失效，之后顺利进入游戏。

https://bbs.kanxue.com/thread-292523.htm  
本文的内容参考了上面那篇文章，因为提到了有大量的hook检测，正好我最近在搞自己的hook工具，于是准备跟这个lib碰一碰，最终的目的是要hook掉他的 `VmDecryptor.decrypt()` ，拿到解密后的字节码就行。  
去google play上找了一个带libpairipcore.so的游戏，简单分析了一下之后发现和上述的那篇文章有点不同，这个游戏里没有用tee下发密钥去加密，base.apk直接就是IAPv2。通过后续的分析发现，虽然调用了 `VmDecryptor.decrypt()` ，但是由于本身没有加密，这个函数是原样进去原样出来的。  
因此我调整了一下测试的目标，不以Hook之后拿到IAPv2的字节码为目的，而是安装Hook之后尝试进入游戏正常操作能否成功。

## 过程

## 1\. Hook VMRunner.readByteCode() 和 getVmByteCode()

-   VMRunner.readByteCode(String)：记录它从 APK asset 读出的字节数组。
-   VMRunner.getVmByteCode(String)：记录它返回、准备交给 VM 的字节数组。  
    hook这两个函数没啥问题，能够直接拿到数据，并且和assets/下读到的东西是一致的（游戏把VM数据放在里面。

## 2.Hook Decrypt() getVmByteCode() executeVM()

其中 `VmDecryptor.decrypt()` 是原样返回，正如之前所说的，不搞TEE动态下发密钥那一套的时候这个函数就不执行操作了。

接着测试 `executeVM()` ，问题就出来了：before 回调能命中，也能取得字节码，但继续执行原函数后，在 `libpairipcore.so+0x30b6c` 发生 SIGSEGV，进不了 after 回调。换成 Hook 上层的 `VMRunner.invoke()` ，也在同一个位置、访问同一个非法地址时崩溃。

然后通过观察 `Throwable.getStackTrace()` 发现游戏读到了 Hook 调用带进去的 de.robv.android.xposed.RposedBridge 栈帧(我这里java的hook能力主要是借助了lsplant)。只删掉栈末尾几帧、把长度恢复成原来的长度没有用；去掉中间的 Hook 栈帧，原始 VM 调用就能返回。

之后进一步缩小范围：保留栈长度、顺序和方法名，只改 Xposed 类名，调用也能返回；只改方法名则仍然崩溃。在栈末尾加一个普通类名没事，换成 `de.robv.android.xposed.AnyClass` 就再次触发相同崩溃。这些对照说明，这次抓到我们的规则是检查栈帧字符串是否以 `de.robv.android.xposed` 开头。

**解决方法：** 把我们自己的dex里对应的class在加载之前修改（不是重新编译）成等长的随机字符串即可，这样就检测不到了。

修复了以上方法之后暂时没有遇到新得阻碍了，直接进入了游戏。
