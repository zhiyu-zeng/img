---
title: 【看雪】token花不完，让AI写了一个apk重打包工具
source: https://bbs.kanxue.com/thread-293381.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-31T10:59:52+08:00
trace_id: 432ab512-9768-42e4-b4fa-d48e3b497037
content_hash: 51ab41f5e9ed2761a383c20e14e1688c1e5e40cb453a9933089db1b2835726d8
status: synced
tags:
  - 看雪
  - Android逆向
  - Hook
series: null
feed_source: 看雪·Android安全
ai_summary: ratel 2.0 是一条把 APK 展开为标准 gradle 工程、用 Java 而非 smali 改造 App 的 PC 端渐进式逆向工具链，弥补 dex 世界缺失的“二进制回到工程架构”路径。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40a75244-d011-81f5-9232-c13f0ec56c7f
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> ratel 2.0 是一条把 APK 展开为标准 gradle 工程、用 Java 而非 smali 改造 App 的 PC 端渐进式逆向工具链，弥补 dex 世界缺失的“二进制回到工程架构”路径。
> 
> - **传统路径死结：** apktool→改 smali→回编的老流程存在两层问题——smali 错误运行时才暴露、签名自检导致重打包闪退；且“逆算法”产出碎片化补丁，不可累积协作，App 一升级就从头再来。
> 
> - **渐进式逆向流程：** init 展开为含 module（hook 插件）、app-patch（Java 混编）、smali 三个子工程的标准项目；按需 `ratelPull` 拉类为 Java 源码、失败类降级留在 smali、借 debug 信息与日志 tag 做命名还原，每轮产物均可出包装真机验证。微信 8.0.72（229,526 个类）init 仅 2.5 秒、全管线 5.7 秒。
> 
> - **核心机制：** dex 改名遮蔽实现零字节重写的类替换（patch dex 命名 classes.dex 并排在 zip 最前，按类加载顺序遮蔽旧类）；签名代理在运行时反射替换 sPackageManager 拦截 getPackageInfo，默认通过签名自检；crcBypass 用 inline hook 劫持 open/openat 把 base.apk 访问重定向到内嵌原包。
> 
> - **hook 双层运行时：** Java 层用 LSPlant，针对 Android 16+ 剥离符号的问题内嵌 xz-embedded 解压 .gnu_debugdata，三路符号解析覆盖 Android 10–17；native 层提供 inline hook（Dobby）、dlopen 监听解决符号时序问题，API 为一行式 Xposed 风格。
> 
> - **边界与依赖：** 不承诺加固 App、native so 内部逻辑、RN/Flutter 跨端栈的完整二开；不做对抗、多开与云服务。仅需 JDK 17 + android.jar 即可上手，无需 root，模块 API 全单字符命名 + R8 整体混淆以规避特征检索。

> **第一次，Java 源码从混淆二进制到完整工程架构，有了一条可被承诺的技术路径。**

二进制逆向的历史上，没有工具做过这个承诺。JS 世界并不稀奇——"混淆"只是压缩，代码仍是 JS，渐进式还原天然可行；而编译成 dex 的 Java 字节码，此前从未有过这条路。

这篇文章讲 ratel 2.0 如何补上这条路径：一个把 APK 展开为标准 gradle 工程的 PC 端工具链，写 Java 改 App，而不是写 smali。

**开源地址**：https://github.com/virjar/ratel2

* * *

## 一、传统逆向的死结

做过 App 逆向的人都熟悉这条路径：apktool 反编译 → 手改 smali → 回编 → 签名 → 安装。它有两个死结：

**工具层**：smali 写错一行，运行时才崩，排查极难；而且 App 的签名自检让你重打包后大概率闪退——这两点正是 apktool 这类工具逐渐淡出主流的原因。

**形态层** （更本质）：传统逆向的工作形态是 **逆算法**——找到关键函数，定点分析、打补丁。产出是碎片化的补丁：不可累积、不可协作、每次都是一锤子买卖。你逆向了某个协议算法，得到了一个能跑的 demo；三个月后 App 升级，一切从头再来。

而同时代的 JS 逆向已经在另一个形态上工作了：把整个前端工程还原出来、可调试、可持续维护。差距不在人的水平，在于 **dex 世界缺少一条从二进制回到工程架构的技术路径**。

## 二、ratel 2.0 是什么

ratel（平头哥）1.x 时代是一个免 root hook 框架 + manager app 的形态。2.0 做了彻底的产品重构：

```bash
ratel init app.apk -o myproj     # APK → 标准 gradle 工程
# 用 IDEA / Android Studio 打开 myproj，写 Java、改模块、IDE 全程可导航
./gradlew ratelBuild             # 出包：改造 + 签名，adb install 即用
```

init 之后你拿到的不是一堆反编译文本目录，而是一个 **完整的 Android 工程项目**：

```python
myproj/
├── module/               # hook 模块（AGP application，R8 混淆，java + native 同工程）
│   ├── src/main/java/ratel/module/Main.java    # hook 入口，模板开箱即用
│   ├── src/main/java/com/ratel/plugin/         # API 源码（可读可改）
│   └── src/main/jni/     # native hook（AGP cmake，inline hook / so 加载监听）
├── app-patch/            # java 混编：pull 宿主类为 Java 源码直接改
├── smali/                # smali 指令级补丁（源根挂载，SmaliIdea 可索引导航）
├── project.yaml          # 配置：入口方案 / crcBypass / native 接线……
├── AGENTS.md             # 给 AI 助手的工程导读
└── origin.apk            # 原始 APK（不可变基准）
```

三个子工程各司其职，全部 AGP 标准链路： `module` 是 hook 插件（R8 混淆产出 module.apk）、 `app-patch` 是 java 混编、 `smali` 是指令级逃生舱。工程自带 git 协作支持（.gitignore 自动生成，多人可基于同一开发证书协作出包）。

这是 **逆向架构** 的形态：你面对的不再是"某个函数"，而是完整的应用架构——类与包的组织、依赖关系、调用链都以 IDE 可导航的形态存在。改造以工程形态持续演进。

## 三、渐进式逆向：路径的兑现方式

「逆向架构」不是承诺一次性把整个 App 还原成源码——那不现实。ratel 的兑现方式是 **渐进式逆向**：按需、多轮、每一步都可验证。

**第一步：按需 pull。** 把你关心的类拉成 Java，其余代码保持二进制原样：

```bash
./gradlew ratelPull -Pcls=com.tencent.mm.app.WeChatSplashActivity
# app-patch/src/main/java/ 下出现可编辑的 Java 源码
```

关键在于： **每一轮都是完整可出包、可安装、可验证、可真实用户测试的状态**。你 pull 的类与未 pull 的二进制类在运行时共存——这依赖后文讲的 dex 遮蔽机制。你随时可以把产物装到真机上跑起来，验证当前轮次的理解是否正确，再决定下一轮 pull 什么。

**第二步：降级保留。** 遇到反编译失败的类——标识符与 Java 关键字冲突（R8 混淆的 `if.f` 、 `do.b` 这类包名）、过于复杂的算法指令——不必死磕：留在 smali 层原样回编，功能不受影响，留待后续单独攻克，不阻塞其他部分推进。

**第三步：命名还原。** 某个模块大部分代码还原之后，混淆命名的语义可以逐步找回来：dex 里保留的原生 debug 信息、运行日志（log tag 常常就是类名）、上下文语义推导……渐进、多步、可回退、每步可测试的流程，天然适配 AI 协作——这一步大部分工作可以由 AI 自动完成，人负责审核关键推断。

**第四步：架构落地。** 当类与结构可以自由调整重构时——重命名、拆包、引入自己的依赖库——「逆向架构」真正成立。

这套流程对轻度混淆的小型 App 和重度混淆的大型 App 同样成立。以微信 8.0.72 为例（256MB / 16 个 dex / 229,526 个类）：

| 操作  | 耗时  |
| --- | --- |
| init 展开 | 2.5 秒 |
| java 混编全管线（stub 闭包 + 编译 + 遮蔽合并 + 签名） | 5.7 秒 |
| 恒等重建 | 1.6 秒 |

## 四、关键技术拆解

### 4.1 dex 改名遮蔽：零重写的类替换

java 混编的核心问题：你的 Java 补丁怎么和原始 dex 共存？

传统做法是全量重序列化——把原始 dex 解开、替换类、重新打包。微信 12MB × 16 个 dex 的重写要 10 分钟级，且重序列化后的字节与原始字节差异巨大。

ratel 的做法是 **改名遮蔽**：patch dex 直接命名为 `classes.dex` 并物理排在 zip 最前；原 dex 条目按序数整体 +1 改名（ `classes.dex → classes2.dex` ……）， **字节零重写**——就是改个文件名。BaseDexClassLoader 按 zip 条目顺序解析，patched 类先命中即遮蔽旧类。原始类字节完整保留在包内，可审计、可回滚。性能：分钟级降到接近零。

### 4.2 签名代理：重打包不破坏校验

签名自检是 apktool 时代弃用的根因。ratel 在构建期用 apksig 提取原始证书，注入运行时配置；运行时（clinit 入口，早于一切应用代码）反射替换 `ActivityThread.sPackageManager` 为动态代理，拦截 `getPackageInfo` 系列调用，把 signatures/signingInfo 替换为原始证书—— **App 内一切签名自检默认通过**，无需逆向任何校验逻辑。

### 4.3 apk 完整性校验对抗（crcBypass）

更进一步，很多 App 直接读自己的 base.apk 做 crc/hash 自校验。ratel 的方案：构建期把原始 apk 完整内嵌（ `project.yaml` 一行 `crcBypass: true` ），运行时用 inline hook 接管 `open` / `openat` ，把对 `base.apk` 的文件访问重定向到原始字节——校验读到的一直是原版内容。

这里有个经典深坑：重定向安装后，AssetManager 若沿用旧 fd 的 zip 索引（patched apk 的 central directory）而内容体变成了原始 apk，索引与内容错位，resource 读 axml 直接 crash。ratel 在重定向后立即重建 Resources（清 ResourcesManager 缓存、按 ResourcesKey 重建 ResourcesImpl、回填所有 Resources 对象）保证一致性——而 dex classloader 已打开的 fd 不受重定向影响，patched dex 照常工作。

### 4.4 hook 运行时：Java + native 双层

-   **Java 方法 hook**：LSPlant。值得说的是 Android 16+ 的适配——系统剥离了 libart 的 `.symtab` 与 `.dynsym` 内部符号，符号只存在于 `.gnu_debugdata` （XZ 压缩的 mini-ELF）里。ratel 内嵌 xz-embedded 以无内部内存分配的 XZ_SINGLE 模式解压（常规模式会与 Android 的 scudo 分配器冲突直接 SIGABRT），三路符号解析（symtab → dynsym → gnu_debugdata）在 Android 10–17 全线通过实测。
-   **native hook**：模块的 `src/main/jni/` 直接写 C，runtime 传入函数指针表——inline hook（Dobby，返回 trampoline）、符号解析、 **so 加载监听** （ `watch_library` ：目标 so 已加载立即回调，未加载则 hook dlopen 等它加载时回调——解决"符号要等 so 加载后才能 hook"的时序问题）、文件级重定向。零动态链接依赖，不用自己啃 libart 解析。

hook API 形态上一行式：

```java
public class Main extends RatelModule {
    @Override
    protected void handleLoadPackage(HostApp app) {
        RatelHelpers.findAndHookMethod("com.example.NetworkClient",
                app.classLoader(), "getResponse", new MethodHook() {
                    @Override
                    public void afterHookedMethod(Param param) {
                        param.setResult("modified");
                    }
                });
    }
}
```

### 4.5 混淆层设计：API 即混淆

模块的底层 API 是全单字符类（ `com.ratel.api.a/b/c/...`），语义只存在于源码 javadoc、不进字节码——模块对 API 的引用符号（类名/方法名/字段名全单字符） **不构成任何可检索特征**。模块 release 产物整体 R8 混淆（混淆类收进独占包，避免与宿主运行时的混淆名碰撞），分发物里没有语义残留。对安全厂商的病毒库特征而言，这类模块是天然隐身的。

## 五、工程体验：真正的 IDE 开发

ratel 2.0 拒绝"用文本编辑器逆向"的形态。工程里：

-   **java 混编有完整补全**： `ratelStub` 任务按你源码的 import 自动从原始 dex 生成签名闭包 stub jar（dexlib2 → ASM 字节码直出，微信级闭包毫秒级生成）；stub 以内容 hash 命名，变更即新文件，gradle 与 IDE 必然感知
-   **第三方库随意引**： `ratelDeps("com.squareup.okhttp3:okhttp:4.12.0")` ，构建期整体 relocate 到 `ratel.repack.*` 前缀打入 apk，与原 App 内同名库零冲突
-   **smali 也是一等公民**：smali 目录挂为源根，装 SmaliIdea 插件后可索引导航，与 Java 混编互不干扰
-   **AI 助手即成员**：工程自带 AGENTS.md，告诉 AI 这是什么工程、怎么构建、怎么深入开发——把工程交给 AI 助手，它知道该跑 `./gradlew ratelBuild`

## 六、为什么说这是 AI 时代的路径

渐进、多步、可回退、每一步都可验证——这正是 AI 擅长的工作方式。

传统 AI 辅助逆向的困境在于流程不可分步：工具产出的是"一次性反编译结果"，AI 在一个不可验证、不可回退的静态产物上做推断，错误会累积且无法定位。而渐进式逆向把任务天然切分为一系列可验证的小步：pull 一轮 → 出包装到真机 → 验证行为 → 再 pull 下一轮。每一步 AI 的产出都可以被真实运行检验，错了退回上一步重来。命名还原阶段尤其如此：日志 tag、debug 信息、语义上下文，多信号交叉推导，AI 完成大部分、人审核关键推断。

这条在二进制世界历史缺失的路径，恰好在 AI 时代被补上。

## 七、诚实的边界

ratel 2.0 的主战场是 **java 层**，以下场景不承诺完整二开：

-   **加固 App**：dex 在壳内加密，pull 出来的是壳代码（ACF 入口方案可以配合 hook 使用，但不是完整混编）
-   **native so 内部逻辑**：可以 hook so 的函数、监听 so 加载，但 so 内部无法还原为源码
-   **RN / Flutter / uni-app 等跨端技术栈**：业务在 JS/bundle 里，java 层只是容器

另外明确不做的：对抗（svc/子进程/binder 层不碰）、分身/多开、manager app、云服务。ratel 面向自有应用开发调试、授权范围内的安全研究与学习。

## 八、上手

```bash
# 下载发布包（JDK 17 + android.jar 即可用，无需 root、无需 NDK）
wget https://github.com/virjar/ratel2/releases/download/v2.0/ratel-2.0.zip
unzip ratel-2.0.zip && export RATEL_HOME=$(pwd)/ratel

ratel/bin/ratel init app.apk -o myproj
cd myproj && ./gradlew ratelBuild
adb install -r out/*.apk
```

支持 Android 10–17（arm64 真机与模拟器实测，覆盖 Java hook / native hook / 签名代理 / crcBypass / split APK），x86_64 产物已含。

**GitHub**：https://github.com/virjar/ratel2  
**文档**：README · CLI 参考 · 模块开发指南

ratel 1.x 的老兵应该会记得当年 "RDP 重打包" 的思路——2.0 是那个思路在工程化方向的彻底展开。欢迎 Issue 与 PR。
