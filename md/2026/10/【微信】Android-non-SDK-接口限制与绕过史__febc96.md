---
title: 【微信】Android non-SDK 接口限制与绕过史
source: https://mp.weixin.qq.com/s/Wr8cWIbdUPQ4e1TEJVYd-g
source_host: mp.weixin.qq.com
clip_date: 2026-10-13T11:13:09+08:00
trace_id: 0f1781ce-3ff3-4238-b171-da9d49bad4f5
content_hash: 5a3a575f12563c960691d83d559832782598ab46de597c98b020b884d0345131
status: synced
tags:
  - 微信
  - Android逆向
  - Hook
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Android 从 9 起对非SDK接口分级限制，开发者以元反射、JNI 线程伪装、改写 ArtMethod 标志位等手段反复绕过，形成持续至今的猫鼠博弈。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3f875244-d011-81ae-ba51-ff16fd0c99ff
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 从 9 起对非SDK接口分级限制，开发者以元反射、JNI 线程伪装、改写 ArtMethod 标志位等手段反复绕过，形成持续至今的猫鼠博弈。
> 
> - **名单分级：** Android 9 起把 API 分为 SDK、浅灰、深灰、黑名单四档，深灰名单在 targetSDK≥28 时拒绝调用，检查只看直接调用者。
> - **元反射：** weishu 的 FreeReflection 借 Class.getDeclaredMethod 使调用者变为系统类，再调 VMRuntime.setHiddenApiExemptions(new String[]{"L"}) 豁免全部 API；Android 11 改为完整调用栈溯源并跳过 reflect 栈帧后失效。
> - **JNI 线程伪装：** 用 pthread_create + AttachCurrentThread 创建无应用栈帧的 Native 线程再执行豁免，成为 Android 11 后的主流方案。
> - **更隐蔽手段：** Android 12 校验前移至 ClassLinker 链接阶段；Android 13+ 转向修改 ArtMethod 的 access_flags_ 清掉 kAccHiddenApi，或用 Zygote 预注入让子进程先天免检。
> - **风险提示：** Google Play 会扫描非SDK调用，上架应用使用绕过手段可能被拒审甚至封号，仅供研究与内部调试。

**哈啰安全应急响应中心 HSRC** *2026年10月13日 10:48*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c7f49bd8561776f.png)

01

背景：这场攻防战从何而来？

1.1 什么是非SDK接口？

Android SDK 公开的 API 是官方承诺稳定、可长期依赖的接口。但 Android 框架内部还有大量未公开的、带有 @hide 标记的类和方法，它们被称为非SDK接口（Non-SDK Interfaces），也就是我们常说的“隐藏 API”。

1.2 开发者为什么想用？

开发者不是闲得慌，而是公开 API 真的不够用。常见场景包括：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d8dbf8873bcf2a33.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4cfe8ae255a6ca5a.png)

这里举个真实案例： **Google 自己早年都干过这种事**。Android 4.4 时期，Google 的 GMS 包（Google Play 服务）为了在低端机上优化内存，直接反射调用了 ActivityManager 的隐藏方法 setProcessMemoryTrimLevel()。官方应用都这么干，足以说明当时隐藏 API 的诱惑有多大。这也在一定程度上“倒逼”Google 后来不得不正视这个问题，最终推出了统一的限制策略。

1.3 Google 为什么要限制？

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ddd7e0b51eb50f5d.png)

1.4 矛盾的根本：  
Google 对稳定性的追求 vs 开发者对灵活性的需求

这种矛盾在本质上很难调和。Google 希望 Android 生态像 iOS 一样稳定可控，应用在不同版本间都能流畅运行；而开发者，尤其是头部 App 的开发者，在性能优化、创新功能等方面有极致追求，当公开 API 无法满足时，必然会寻找“捷径”。 **这不是谁对谁错的问题，而是平台方与开发者之间永恒的权力博弈。**

理解了这一层，就不难明白为什么这场“猫鼠游戏”会持续至今，且看起来还会继续下去。

## 攻防时间线

02

攻防时间线

阶段零：Android 8 及以前（API ≤ 27）

**Google 做了什么：**

-   没有运行时校验
    
-   @hide 标记只影响编译期（IDE 会提示警告）
    
-   反射和 JNI 可以随意调用任何非 SDK 接口
    
-   插件化、热修复框架大量依赖隐藏 API
    

**开发者怎么用：**

-   直接 Class.forName() + getDeclaredMethod() + invoke()
    
-   或者通过 JNI 直接调用
    

**代表项目：** 早期插件化框架、热修复框架、Xposed

阶段一：Android 9（API 28）

**Google 做了什么：**

这是改变一切的起点。Android 9 首次引入了 **非SDK接口限制机制**，ART 虚拟机中新增了核心检查函数 ShouldDenyAccessToMember()。Google 将所有 API 划分成了三六九等：

-   **SDK 接口（绿灯）：** 官方公开 API，自由通行
    
-   **浅灰名单（Light Grey）：** 仍可调用，但后续版本将被限制
    
-   **深灰名单（Dark Grey）**：target API < 28 时可调，等于或高于 28 则被拒绝
    
-   **黑名单（Blacklist）：** 任何情况都禁止调用
    

检查逻辑：ART 会追溯 **直接调用者** 的类加载上下文，判断其是否来自 BootClassLoader（系统类）——只有系统类调用才被放行。

**开发者怎么对抗：**

**通用解法来自 weishu 的 FreeReflection。**

核心思路：既然系统只会检查“直接调用者”，那如果我的调用来自系统类，是不是就安全了？

具体做法是元反射（Meta-Reflection），也叫“套娃反射”：

1.  先反射拿到 Class.class 的 getDeclaredMethod 方法
    
2.  再用这个 Method 去反射调用 Class 的私有方法，获取 VMRuntime 实例
    
3.  最后调用 VMRuntime.setHiddenApiExemptions(new String\[\]{"L"})
    

这样就一次性把所有 API 都加入了豁免名单。

**代表项目：** FreeReflection（weishu）

阶段二：Android 10（API 29）

**Google 做了什么：**

-   名单机制重构：从“黑/灰/浅灰”改为 blocklist / max-target-X / unsupported
    
-   限制范围进一步扩大
    
-   JNI 路径也被纳入了同等校验（之前 JNI 调用隐藏 API 的检查比反射宽松）
    
-   为后续封杀埋下伏笔
    

**开发者怎么对抗：**

-   元反射（FreeReflection）在 Android 10 上仍然可用
    
-   开发者开始未雨绸缪，探索 Native 层绕过方案
    
-   开始有人研究 DexFile 动态加载绕过
    

## Android 11 封杀元反射

阶段三：Android 11（API 30）

**Google 做了什么（关键转折点）：**

这是这场攻防战中最重要的一次升级。Google 做了两件事：

**第一，封杀元反射。** 检查逻辑从“看直接调用者”变成了 **完整调用栈溯源**。系统会从调用点一路往上追溯所有栈帧，如果发现任何来自 java.lang.reflect 包的调用，就跳过这些帧继续往上找，直到追溯到应用代码为止。于是 FreeReflection 彻底失效。

**第二，引入新的 API 名单机制**。 将 max-target-x 改为更细粒度的控制，可以精确指定某个 API 在哪个 target 版本被限制。

**开发者怎么对抗：**

元反射被废了，但开发者找到了两条新路：

**方案一：DexFile 加载 Trick。** 把元反射代码单独编译成一个 DEX 文件，然后通过 DexClassLoader 动态加载，在加载时设置一个“空”的 ClassLoader 上下文，绕过调用栈检查。这个方案稳定性一般。

**方案二：** JNI 线程“身份伪装” **（主流方案）。**

核心思路：创建一个 Native 线程，通过 JNI 的 AttachCurrentThread 附着到 Java 虚拟机。这个新线程的调用栈非常“干净”——没有应用代码的栈帧，只有 Native 帧。ART 在检查时，由于找不到“罪魁祸首”的应用代码，就会放行。

更具体的实现方式：在 Native 层用 pthread_create 创建一个新线程，在新线程里 AttachCurrentThread，然后调用 JNIEnv->CallStaticVoidMethod 执行一个 Java 静态方法，这个方法里再做 setHiddenApiExemptions。因为调用栈里没有应用类，系统会认为这是系统内部的调用。

阶段四：Android 12（API 31）

**Google 做了什么：**

-   封堵了 DexFile 加载 Trick
    
-   将校验时机前移到 ClassLinker 链接阶段，在类加载时就开始检查，而不是等到方法调用时
    
-   对 JNI 路径的调用栈检查也更加严格
    

**开发者怎么对抗：**

这一时期出现了 **多手法融合的通用绕过库**，比如 RestrictionBypass：

-   结合 Native Hook、内存修改、反射等多种技术
    
-   通过 Hook libart.so （ART 虚拟机的核心库，所有隐藏 API 的检查逻辑都在这里执行）中的关键函数（如 ShouldDenyAccessToMember）直接让其返回 false
    
-   或者通过修改 ART 内部数据结构来绕过
    

但 Native Hook 方案也有它的痛点：libart.so 中函数的符号和偏移量在不同 Android 版本甚至不同厂商的 ROM 上都不同，导致兼容性维护极其困难。这也是为什么后来大家更倾向于内存修改方案。

阶段五：Android 13+（API 33+）

**Google 做了什么：**

-   持续更新 blocklist，不断增加新的受限 API
    
-   收紧 libart.so 的导出符号，让 Native Hook 更难实施
    
-   Google Play 审核加强了对非SDK调用的扫描，一旦发现直接拒审
    

**开发者怎么对抗：**

**方案一：** 直接修改 ART 内存中的

AccessFlags。

每个 Java 方法在 ART 内部都对应一个 ArtMethod 结构体，其中有一个 access_flags\_ 字段记录了方法的访问属性（public/private/hidden 等）。通过 Unsafe 或内存搜索找到这个字段，直接把“hidden”标志位抹掉，系统就再也不认为这是个隐藏方法了。

这个方案的优点是不依赖任何系统 API 调用，非常隐蔽；缺点是需要根据 Android 版本计算 ArtMethod 结构体的内存偏移量。

**方案二：Zygote 预注入。**

在 Zygote 进程启动阶段就注入绕过代码，让所有 fork 出来的应用进程都天然具备调用隐藏 API 的能力。这是 Xposed 和 LSPosed 等框架的做法。

03

完整攻防时间线总览

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/579d86ef9b2c7c09.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5e049358d7197dd7.png)

04

关键技术原理简析（概要）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c36f74c70a8c0d72.png)

## ShouldDenyAccessToMember 判定流程

4.1 ShouldDenyAccessToMember 的执行流程

ShouldDenyAccessToMember 是 ART 虚拟机中一个核心的访问控制函数。 **当一个应用试图通过反射或 JNI 访问某个隐藏方法或字段时，ART 最终都会调用这个函数来决定是否允许访问。**

它的判断过程大致如下：

1.  **检查访问标志：** 如果目标方法/字段是 public 且属于 SDK 公开 API，直接放行。
    
2.  **检查豁免名单：** 如果目标 API 在
    
    VMRuntime.setHiddenApiExemptions 设置的豁免名单中，放行。
    
3.  **检查调用来源：**
    

-   追溯调用栈，找到最初发起调用的类。
    
-   如果调用来自系统类（BootClassLoader），放行。
    
-   如果调用来自应用类，根据 API 所在名单（黑/灰/白）决定放行或拒绝。
    

4.  **检查 targetSDK：** 对于深灰名单的 API，如果应用 targetSDK >= 限制版本，拒绝。
    

4.2 元反射（FreeReflection）原理详解

1.  通过反射获取 Class.getDeclaredMethod 的 Method 对象
    
2.  用这个 Method 对象去调用 Class 的私有方法，获取 VMRuntime 实例
    
3.  调用  
    VMRuntime.setHiddenApiExemptions(new String\[\]{"L"})
    
4.  所有 API 加入豁免名单，完成绕过
    

**为什么叫“元反射”？** 因为它是“用反射去反射反射本身”——用反射获取反射方法，再用反射方法去调用系统方法。这是一种对反射机制自身的元级操作。

**被封杀的原因：** Android 11 开始系统在调用栈追溯时会跳过 java.lang.reflect 包的栈帧，直接找到真正发起调用的应用类，套娃被识破。

```cpp
// 1. 获取“元反射”工具：得到系统类 Class 的 getDeclaredMethod 方法
// 这个方法本身是公开的，调用者是应用，会被限制，所以这里只是“拿到”它，作为后续工具。
Method metaGetDeclaredMethod = Class.class.getDeclaredMethod("getDeclaredMethod", String.class, Class[].class);

// 2. 执行“元反射”：使用上一步获取的工具，去获取 VMRuntime 类的私有方法
// 关键点：调用 metaGetDeclaredMethod.invoke() 时，调用者变成了系统类 java.lang.Class。
// 系统认为这个调用是可信的，因此可以成功获取到 VMRuntime 的 getRuntime() 方法。
Class<?> vmRuntimeClass = Class.forName("dalvik.system.VMRuntime");
Method getRuntime = (Method) metaGetDeclaredMethod.invoke(vmRuntimeClass, "getRuntime", null);

// 3. 再次执行“元反射”：获取 VMRuntime 的 setHiddenApiExemptions 方法
// 同样，因为调用者仍是系统类 java.lang.Class，这个隐藏方法也能被成功获取。
Method setHiddenApiExemptions = (Method) metaGetDeclaredMethod.invoke(
        vmRuntimeClass, 
        "setHiddenApiExemptions", 
        new Class[]{String[].class}
);

// 4. 获取 VMRuntime 实例并执行豁免
Object vmRuntime = getRuntime.invoke(null);
// 传入 "L" 作为前缀，豁免所有以 "L" 开头的类（即所有Java类）[reference:4][reference:5]
setHiddenApiExemptions.invoke(vmRuntime, (Object) new String[]{"L"});
```

4.3 JNI 线程“身份伪装”原理

1.  在 Native 层创建一个新线程（pthread_create）
    
2.  通过 AttachCurrentThread 附着到 Java 虚拟机
    
3.  在新线程中，调用栈里没有应用类的帧，只有 Native 帧
    
4.  ART 的调用栈检查找不到应用类，判断为系统内部调用，放行
    
5.  在新线程中执行 setHiddenApiExemptions，解除限制
    

4.4 AccessFlags 内存修改原理

1.  在 ART 内部，每个 Java 方法对应一个 ArtMethod 结构体
    
2.  ArtMethod 中有一个 access_flags\_ 字段，记录了方法的访问属性（public/private/hidden 等）
    
3.  通过 Unsafe 或内存搜索找到目标方法对应的 ArtMethod 地址
    
4.  直接修改 access_flags\_ 中表示“隐藏”的标志位（kAccHiddenApi）
    
5.  系统后续调用  
    ShouldDenyAccessToMember 时，因为标志位已被清除，直接放行
    

## 博弈本质与合规警告

05

总结与思考

5.1 这场博弈的本质

回顾整个攻防史，可以看到一条清晰的脉络：

Google 不断增加限制 → 开发者找到新的绕过方式 → Google 在下一版本封堵 → 开发者再找新的路

这本质上是一场 **平台稳定性 vs 应用灵活性** 的永恒博弈。Google 要维护生态健康，开发者要追求极致功能。双方都没有错，只是立场不同。  

5.2 ⚠️ 重要警告

**所有绕过方案，都请不要在生产环境（尤其是上架 Google Play 的应用）中使用！**

Google Play 明确禁止应用调用非 SDK 接口，而且有自动扫描机制。一旦被发现，轻则拒审，重则封号。这些技术知识，请仅用于：

-   技术研究与学习
    
-   内部调试工具
    
-   系统级开发（ROM 定制）
    
-   逆向工程与安全研究
    

5.3 给开发者的建议

1.  **优先使用公开 API：** 这是最安全、最合规的方式
    
2.  **关注每个版本的非SDK名单变化**：Google 在每个大版本发布时都会更新名单，提前做好适配
    
3.  **确实需要隐藏 API 的**：评估风险，做好被 Google 下架的心理准备
    
4.  **理解原理而非依赖工具**：了解这些绕过技术的原理，能帮助你更好地理解 Android 系统的运作机制
    

06

相关资源

-   Android 官方文档：针对非SDK接口的限制
-   weishu：FreeReflection 原理文章
-   FreeReflection GitHub
-   AndroidHiddenApiBypass GitHub

安全资讯 · 目录
