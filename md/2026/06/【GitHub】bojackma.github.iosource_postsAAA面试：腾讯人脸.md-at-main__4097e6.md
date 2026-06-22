---
title: 【GitHub】bojackma.github.io/source/_posts/AAA面试：腾讯人脸.md at main
source: https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/AAA%E9%9D%A2%E8%AF%95%EF%BC%9A%E8%85%BE%E8%AE%AF%E4%BA%BA%E8%84%B8.md
source_host: github.com
clip_date: 2026-06-22T15:30:59+08:00
trace_id: ee12c43e-5d71-4876-b4ad-27ae9ede5578
content_hash: 6f5b516018f366cfb4c5ce361bfd4f33f2ed8f65b65055513564df3ff690c652
status: summarized
tags:
  - GitHub
series: null
feed_source: null
ai_summary: 微信支付人脸识别认证存在多种客户端攻击手段，可在不破解算法的情况下绕过活体检测，攻击者可通过篡改摄像头数据或协议数据伪造认证，而防御需要在应用内构建多层环境安全检测机制。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 38775244-d011-8140-8e64-f1c05d537cff
---

> 💡 **AI 总结（key-points）**
>
> 微信支付人脸识别认证存在多种客户端攻击手段，可在不破解算法的情况下绕过活体检测，攻击者可通过篡改摄像头数据或协议数据伪造认证，而防御需要在应用内构建多层环境安全检测机制。
> 
> - **认证流程：** 基于腾讯优图SDK的有限状态机（FSM），包含7个状态，依次为联网配置、静默活体预检、动作引导、颜色反光活体检测、数据打包与加密上传等。
> - **攻击方案一（视频注入）：** 通过Hook摄像头`Camera.PreviewCallback`和颜色回调`onScreenChanged`，实时替换为预计算的NV21格式伪造帧序列，响应颜色挑战以绕过反光检测。
> - **攻击方案二（协议破解）：** 在数据上传前Hook`makeActionReflectLiveReq`等函数，替换图像数据及其`five_points`坐标，并拦截native层的校验和计算函数，让伪造图像获得合法校验值。
> - **攻击方案三（USB隧道）：** 通过自定义OBS插件将PC处理后的视频帧经USB adb隧道实时传输至手机，Hook手机端摄像头回调进行注入，实现低延迟（约66毫秒）且绕过网络防火墙的替换。
> - **防御SDK：** 设计了包含12个检测项的三层防御体系：系统完整性检测（Root、模拟器等）、运行时安全检测（Frida、Xposed注入）、代码完整性校验（通过比较内存与磁盘SO文件的CRC32值检测Hook）。

title腾讯人脸date2026-04-03 09:20:16 -0700tags

|     |     |
| --- | --- |
| tencent | 人脸  |

微信支付人脸认证黑产攻击与系统防护研究

[![alt text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/06/d7c442fed406e9f0.png)](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-4.png)

整体的思路应该是： 第一点，我们先去静态分析微信apk，结合打调用栈等方式，我们发现整个人脸检测流程底层是一个有限状态机（FSM），由腾讯优图 SDK 实现。通过 hook FSM 初始化函数拿到了完整的状态列表，一共 7 个状态，按顺序流转。 状态机的流程是这样的： 第一个状态 NetFetchState，负责联网向服务端请求本次检测的配置，包括屏幕要闪什么颜色序列（color\_data）、要做什么动作（action\_data）等。 第二个状态 SilentLivenessState，做人脸预检，持续判断脸是否在框内、姿态是否端正、有没有遮挡，同时挑选质量最好的帧存下来，稳定通过之后才进入下一步。 第三个状态 ActionLivenessState，引导用户按指示做动作，比如眨眼、张嘴、点头，采集动作视频。 第四个状态 ReflectLivenessState，屏幕按服务端下发的颜色序列快速闪烁，摄像头同步采集人脸反光，用于判断面前是真人还是照片或视频。 第五个状态 NetLivenessReqResultState，把前面几个阶段采集的所有数据收集起来，调用 onActReflectRequest() 打包，其中会调用 native 层的 ChecksumPose() 计算视频和人脸数据的联合校验值，再通过 makeActionReflectLiveReq() 序列化成 JSON，准备上传。 另外还有 IdleState（正常结束）和 TimeoutState（任何阶段超时的兜底状态）。

数据打包完成后，SDK 本身不直接发网络请求，而是通过回调把数据交给微信侧的 s0 类（FaceFlashActionReflectManager），由它的 onNetworkRequestEvent 函数来处理。这个函数在整个流程里会被调用两次：第一次是拉取配置，第二次是上传人脸检测数据。上传时，s0 会对数据做 SM2 国密加密（代码里可以看到 WxSmCryptoUtil.sm2Encrypt），然后发给腾讯服务器。 最后，服务器验证通过后返回一个 token，经过 handleResponseEvent 解析，最终通过 FSM 事件链传回上层业务，完成整个认证流程。

通过这个我们了解了整个的人脸认证流程有哪些环节，每个环节大致都在做什么。

[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-6.png)

第二步，我们从日志入手。 微信这种量级的项目，代码里一定有大量日志。虽然所有类名和方法名都被混淆了，不好直接找，但日志函数有一个特点——它的调用模式很固定，类似 log.i、log.e、log.d 这种，参数里通常带有明文的 TAG 字符串和描述信息。我们通过这个特征，结合字符串搜索，定位到了日志相关的工具类。 在人脸认证最后上传数据的环节，onNetworkRequestEvent 里也有对应的日志调用，会把发送的 URL 和完整的请求内容都打印出来。我们 hook 这条日志，拿到了实际发送的数据，是一个很大的 JSON。 里面比较关键的字段包括： 设备指纹信息、摄像头风险配置、眼部照片、嘴部照片、最佳人脸帧、动作视频、数十张反光活体图片帧序列、各个关键时间戳，以及两个 checksum 值。 关于这两个 checksum： 一个是 Checksum，对单张图片的 base64 字符串计算校验和，主要用于验证图片数据的完整性；另一个是 ChecksumPose，是三元联合校验，把动作视频、最佳人脸图、动作序列字符串三者绑在一起算一个校验值，防止这三份数据被分别篡改后重新组合。 这两个函数在 Java 层都是 native 方法，实现在.so 里。我们后续对 native 层做了逆向，发现两者底层用的是同一套算法实现，只是入参数量不同，这也印证了大厂内部通常会有一套统一的校验算法库复用在各个场景里。

```perl
NetFetchState / NetLivenessReqResultState
    ↓  YtFSM.sendNetworkRequest(url, jsonBody, callback)
    ↓
YtFSM.eventListener.onNetworkRequestEvent(type, jsonBody, ...)
    ↓  【跨越SDK边界，进入微信层】
C41916s0.onNetworkRequestEvent()
    ├── url含"wechat_face_config"
    │     └── 提取select_data → 微信CGI C105363a → 腾讯服务器
    │           ↓  onSceneEnd → m37712p()
    │           └── 构造配置响应JSON → onNetworkResponseEvent回调给SDK
    │
    └── url含"wechat_face_verify"
          └── SM2加密请求体 → 微信CGI C105365c / HTTP → 腾讯服务器
                ↓  onSceneEnd → m37713q()
                └── 构造验证结果JSON（含token）→ onNetworkResponseEvent回调给SDK
                      ↓
                    handleResponseEvent()
                      ├── err_msg=="ok" → sendFSMEvent(SUCCESS, token)
                      └── err_msg=="fail" → sendFSMEvent(FAILED, err_code)
```

### 方案一：视频注入攻击：

第一步是搞清楚微信人脸认证用的是哪套摄像头API。Android有三代摄像头框架：老的Camera1、新的Camera2，以及Google封装的CameraX。 人脸认证模块的实际调用链，最终确认它走的是最早的Camera1的 Camera.PreviewCallback 接口。我判断这是历史遗留原因——人脸认证功能上线较早，一直沿用了Camera1，没有做迁移。 另外值得一提的是，微信没有上强脱壳和反调试保护。我的判断是：微信这样的亿级用户产品需要极致的性能和用户体验，不能像专门的金融安全软件那样加很重的壳——那会带来明显的启动耗时和运行开销。这个权衡客观上给了我们逆向的空间。

拿到摄像头入口之后，更关键的是搞懂活体检测的颜色变化是怎么实现的。我通过Jadx追踪调用链，发现整个流程是这样的：活体检测的变色其实不是改屏幕背光，而是SDK在预览画面上叠了一层遮罩。服务端下发颜色后，程序会动态渲染这个遮罩，并在人脸位置挖洞，让不同颜色的光打到脸上做反光检测。

理解了架构之后，我设计了一个动态响应式视频注入攻击，核心有两个Hook点：

方案的核心是同时Hook两个位置： Hook点1 — 摄像头原始帧劫持： Hook Camera.PreviewCallback.onPreviewFrame。这是Android Camera1 API的帧回调接口，每帧图像会以NV21格式（640×480分辨率，460800字节）回调到这里。我在这里将真实摄像头数据替换成受害者人脸的伪造帧。 Hook点2 — 颜色信号监听（最关键）： 同时Hook YTAGReflectLiveCheckInterface.onScreenChanged，实时拦截服务端下发的颜色值。我通过逆向提取出了三种颜色对应的ARGB特征值——绿色 0x1fbf46f2、蓝色 0x371ec8f2、红色 0xe63587f2。每当颜色切换，脚本立即切换对应颜色打光版本的伪造帧序列循环播放（如红光帧1 → 红光帧2 → 红光帧1…），模拟真实的光照反射效果。 这样伪造帧不是静态的，而是能实时响应颜色挑战的，从根本上绕过了色彩反光活体检测

同时hook log函数，检测一下结果。

为防止系统对帧数据进行静态校验，攻击代码在每次加载.bin 文件时，会随机反转数据中的 1 个 bit 位，在不影响图像解码效果的前提下规避可能存在的哈希或签名比对。

伪造图片来源后来升级为用 Gemini 2.5 Flash 多模态大模型生成眨眼/张嘴变体，之前采用的是 facefusion + inswapper模型 换脸为受害者人脸

摄像头 onPreviewFrame 的回调频率是每秒约30帧，我必须在极短时间内完成伪造帧的替换。如果在回调里实时做 JPEG → RGB → NV21 的格式转换，在ARM处理器上这个链路的计算开销是不可忽视的，会导致帧替换出现延迟和卡顿，反而暴露攻击特征。 解决方案是提前预计算：把所有伪造帧（红/绿/蓝三套打光版本，每版多帧）事先离线转换为NV21格式的原始字节流，存成.bin 文件，每个文件恰好460800字节。脚本启动时一次性把所有bin文件预加载进内存缓存，运行时直接 Arrays.copyOf 内存复制完成替换，做到零解码开销，保证帧替换的实时性。 另外还有一个小细节：为了防范服务端可能存在的帧数据哈希校验，每次替换时会随机反转数据中的1个bit，在不影响图像视觉效果的前提下规避静态指纹比对。"

### 方案二：协议破解攻击

方案二的攻击面完全不同于方案一。它不碰摄像头，而是在数据即将打包发往服务端的最后一刻，在Java层和Native层双重拦截，把所有人脸图像和对应的完整性校验值全部换成受害者的伪造数据。 方案二需要用户自己真实完成扫脸交互，更稳定，不干扰客户端体验，不卡顿。

首先我用 dump\_network.js 抓取完整的上行网络包，分析出 wechat\_face\_verify 接口的完整数据结构。这个包里有六类需要替换的关键字段：

live\_image：640×480的正脸JPEG，base64编码 eye\_image / mouth\_image：320×240的动作照片 action\_video：640×448×15帧的MP4视频，记录整个动作过程 reflect\_data：九张色彩反光照片序列 每个图像字段都对应一个checksum和一组five\_points（人脸五点坐标）

其中checksum是服务端用来验证图像完整性的关键字段，格式形如 00061.0.8.111.1 + 时间戳 + 72位小写字母数字混合串，是由native层so库对图像内容计算出来的，不能伪造，只能Hook

图像替换的切入点是 YtLivenessNetProtoHelper.makeActionReflectLiveReq 这个方法。通过阅读它的源码，我发现它是整个认证请求包的组装工厂——它把 liveImage、eyeImage、mouthImage、reflectData 等所有字段汇聚成最终的JSON请求体。我在这里Hook，在序列化之前把所有 ImageInfo 对象里的 image 字段替换成受害者照片的base64内容。

调用 libc.so 的 malloc 在native堆上分配内存（len + 24 字节） 在内存头部写入数据长度（Memory.writeU64），再逐字节写入图片数据 返回 nativeBuf.add(24) — 即跳过头部24字节的元信息，指向图片数据本体

另外 action\_video 的替换切入点是 YtVideoEncoderHelper.getVideData——YtVideoEncoderHelper 这个类是干什么的？是微信人脸认证里专门负责录制和编码动作视频的工具类。这个方法是读取编码完成的MP4文件内容的，我在这里返回预先准备好的伪造视频，替换位置恰好在checksum计算之前，这是其中的一个好处。

这是方案二最有技术难度的部分。图像替换之后，checksum必须同步更新，否则服务端校验会失败。但checksum的计算在native层的 libYTAGReflectLiveCheck.so 里，我需要用IDA逆向so文件找到对应函数。 通过 get\_artmethod.js 这个辅助脚本，我从Java层的ArtMethod结构体读取了JNI函数对应的native指针，定位到两个关键函数：

sub\_621a44：负责计算 live\_image、eye\_image、mouth\_image 的checksum，按顺序依次处理这三张图 sub\_6581c：负责计算九张色彩反光图（reflect\_data）的checksum

我的策略是在这两个函数的入口处，通过Frida的 Interceptor.attach 拦截 onEnter，在checksum计算发生之前，把参数里指向原始图像数据的指针改写为指向我预先在native内存里准备好的伪造图像数据的指针——这样native层算出来的就是伪造图像的合法checksum。

five\_points 是每张图像对应的人脸五点坐标（左右眼、鼻尖、左右嘴角，共10个浮点值），服务端会用它做人脸对齐校验。我用 refine\_landmarks\_five\_points.py 配合 dlib 的68点面部特征检测模型，对受害者照片重新计算这五个关键点坐标，再填入替换脚本。

在测试过程中我还发现了一个服务端的逻辑漏洞：eye\_image 和 mouth\_image 服务端并不严格校验图像内容是否对应眨眼或张嘴动作——用同一张普通正脸照片可以同时充当这两个字段，不管客户端要求的动作是什么，都能通过验证。这说明服务端对动作图像的内容校验存在缺失。

整套方案执行下来，攻击者只需要受害者一张正脸照片。难点主要有三个：第一，逆向native层so文件找到正确的checksum计算函数并在正确时机拦截；第二，处理好Hook的时序——脚本必须在用户触达扫脸界面之后、数据上传之前挂上；第三，六类数据字段（图像、checksum、five\_points、视频）的替换必须全部协调一致，任何一个遗漏都会导致验证失败。

最值得重点讲的3个亮点 ① 逆向出了Native层Checksum算法 — 这个技术难度最高，面试官最感兴趣。你用 get\_artmethod.js 从Java层Art方法结构体中读取native指针，定位到so库偏移，再用IDA分析算法逻辑，最终在Frida中实现内存级别的替换，绕过了服务端的完整性校验。

> get\_artmethod.js 是干什么的 一句话：这是一个逆向辅助工具脚本，用来找出Java层JNI方法在native层对应的so库名称和函数偏移地址，方便后续用IDA分析或Frida Hook。 它解决的是一个具体问题：你在Jadx里看到 YTPoseDetectJNIInterface 这个类，里面一堆 native 方法，比如 Checksum、poseDetect、FRInit 等等。但这些方法的具体实现在某个.so 文件里，你不知道是哪个so，也不知道函数在so里的偏移是多少。get\_artmethod.js 就是专门来回答这个问题的。

在ART里，每一个Java方法都在内存里对应一个 ArtMethod 结构体。对于 native 方法，这个结构体里有一个关键字段——在偏移 +16 处存着一个指针，指向该方法实际的native函数地址。 Java方法对象 → getHandle() 拿到 ArtMethod 结构体的内存地址 →.add(16) 跳到偏移+16处 →.readPointer() 读出native函数指针 → DebugSymbol.fromAddress() 把地址解析成"so库名 + 偏移量"

就是下面这一句 DebugSymbol.fromAddress(ptr(ptr(getHandle(ReadableNativeMap\["FRInit"\]).add(16).readPointer())))

脚本里查询了两个JNI接口类的方法（注释里能看到两个列表）： YTPoseDetectJNIInterface（动作姿态检测）： FRInit、FRPushYuv、poseDetect、Checksum 等——这是负责动作活体检测和checksum计算的so接口。 YTAGReflectLiveCheckJNIInterface（色彩反光活体检测）： Checksum、canReflect、getActionReflectData、getBestImage 等——这是负责九色反光检测的so接口。

它是方案二整个native层攻击的前置侦察步骤。 如果没有它，你不知道 sub\_621a44 和 sub\_6581c 对应的是哪个Java层方法，也就无从判断在哪里插入Hook才能精准拦截checksum的计算。

```
    ├─ Java.perform（主线程）
    │       ├─ [1] Hook onScreenChanged → 建立colorlist颜色序列 + 动态threshold
    │       ├─ [2] Hook makeActionReflectLiveReq → 替换live/eye/mouth/reflect图片和five_points
    │       ├─ [3] Hook getVideData → 覆写action_video文件
    │       └─ [4] Hook onNetworkRequestEvent → 保存最终网络包（调试用）
    │
    └─ setImmediate（native层，立即执行）
            ├─ [5] Hook sub_6581c @ libYTAGReflectLiveCheck.so+0x6581c
            │       → 替换九色reflect checksum（LR=0x67cc4）
            └─ [6] Hook sub_621a44 @ libYTAGReflectLiveCheck.so+0x621a44
                    → 替换live/eye/mouth checksum（LR=0x63ddf0）
```

关键那点：checksum的替换

Java层只负责把JSON里的图片换掉，但checksum是native层算出来的，Java层根本没有能力去伪造它——因为你不知道算法。所以必须下沉到native层，在算法执行之前把输入偷偷换掉，让算法对伪造图片重新算一遍，得到伪造图片的合法checksum。

问题二：Memory.writePointer 的作用是替换native函数的参数吗？是的，就是替换参数。 但要理解为什么这么做，需要先理解 args\[1\] 到底是什么。在ARM架构里，函数调用的参数通过寄存器传递。args\[0\] 对应 r0 寄存器，args\[1\] 对应 r1 寄存器，以此类推。但Frida的 args\[1\] 不是寄存器里的值本身，而是那个寄存器的内存地址。 Memory.writePointer(args\[1\], get\_img\_for\_reflect(...)) 做的就是：把r1寄存器里存的指针值，从指向真实图片改成指向伪造图片。函数体继续往下执行时，它读到的就是伪造图片的数据，算出来的自然是伪造图片的checksum。

问题三：为什么+24？是因为参数是字符串结构体吗？完全正确。 这个参数不是普通C字符串，而是C++的 std::string 对象，它在内存里有固定的头部结构。在ARM 32位下，std::string 的内存布局是这样的：

```
磁盘文件 reflect_red_0.txt
    │  (base64文本)
    ▼
base64ToBytes()  →  JS Uint8Array
    │
    ▼
malloc(len + 24) 在native堆分配内存
    │
    ├─ [0~7]    写入 len（数据长度）
    ├─ [8~23]   头部填0（对齐字段）
    └─ [24~]    逐字节写入图片数据
    │
    ▼
返回 ptr.add(24)  ← 指向图片数据本体的native指针
    │
    ▼
Memory.writePointer(args[1], 上面的指针)
    │    ← 把native函数的入参指针改写
    ▼
sub_6581c / sub_621a44 继续执行
    │    ← 顺着被改写的指针读到伪造图片数据
    ▼
计算并返回伪造图片的合法 checksum

```

[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-9.png)

关键难点：[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-8.png)

关于怼屏： 有过一定的了解，不具有通用性，可以通过修改摄像头，利用后摄采集屏幕上的照片，建议在亮度较暗的环境下。

#### 方案三：

场景一：面试官问"讲讲你做的项目" 不要上来就说 OBS 插件、NV21、BT.601。先说你在解决什么问题：

"我需要把电脑上处理好的视频帧，实时传到手机上，替换掉手机摄像头的输入。最开始想用 RTMP 推流，但延迟有一两秒，而且校园网根本跑不通。后来发现可以通过 USB 的 adb 通道直接传原始数据，这样延迟能压到两帧以内，大概 66 毫秒。"

这一段说完，面试官已经知道你在做什么了，也知道你有过方案对比，而不是随便选了一个方案。

场景二：面试官说"那 OBS 插件这块，你讲讲" 这时候用一个类比：

"OBS 渲染视频的时候，帧数据是在 GPU 里的，CPU 直接读不到。我需要把它搬到 CPU 内存里，才能通过 TCP 发出去。这个过程有点像——你不能直接从打印机的内存里拿文件，你得先让打印机把文件输出到一个共享盘，你再从共享盘拷走。OBS 里这个'共享盘'叫 staging surface，GPU 把帧复制进去，CPU 再从里面读。"

然后如果对方继续追：

"这个操作有个坑——GPU 复制数据是异步的，你让它复制，它不一定马上好。等你去读的时候，系统会隐式地等它完成，这个等待可能会卡住 OBS 的渲染线程。渲染线程一卡，整个预览就掉帧。所以我把读出来之后的所有工作——格式转换、网络发送——都扔到后台线程去做，渲染线程只做最快的那一步。"

场景三：面试官问"你遇到什么印象深刻的 bug？" 这是送分题，讲 SIGPIPE：

"有一次手机断开连接之后，OBS 直接崩了，完全没有报错信息，就是进程消失了。查了挺久才发现，在 macOS 上，如果你往一个已经断掉的 TCP 连接发数据，系统会发一个叫 SIGPIPE 的信号，进程对这个信号的默认处理就是直接退出。加一行 signal(SIGPIPE, SIG\_IGN) 把它忽略掉，之后断线就只是 send 返回一个错误，程序可以正常处理重连，不会崩了。"

这个故事好讲，因为它有现象、有排查、有结论，不需要对方懂 OBS。

场景四：面试官问"你这个延迟是怎么测出来的？"

"我在发送端和接收端同时打了时间戳，然后让画面里出现一个变化——比如颜色切换——通过比对两端记录的时间戳来算延迟。最后测出来是两帧，33fps 下大概 66 毫秒。这个延迟叠加上微信本身识别的延迟，总共是五帧，还在系统的容忍范围内。

故事背景：为什么不用 RTMP？ 方案三的诞生，源于一段痛苦的折腾经历。 最初的思路很直接：把换脸后的视频推到一台 RTMP 服务器，手机再从服务器拉流。这条路听起来合理，走起来却处处碰壁。 第一个拦路虎是延迟。RTMP 协议天生为直播而设计，流经服务器时要编码、再解码，手机端还要做一次解码。这一套下来，稳定延迟在 1-2 秒，即使跑了很多开源项目、调了各种参数，始终压不下去。对带货直播而言，2 秒延迟完全可以接受；但对于人脸核身这种需要实时响应的场景，它是致命的——活体检测的反光颜色变化有精确时间戳，延迟过长会露馅。 第二个问题更魔幻：在校园网或公司内网下，RTMP 流根本跑不通。能 ping 通服务器，但视频就是传不过去。是路由器过滤了流量？是 Windows 的安全策略？翻遍了各种设置，查了很久，没有确定答案。每次实验只能切到手机热点，速度慢、不稳定，工程体验极差。

放弃 RTMP 后，转向问题的本质：微信的摄像头回调是怎么工作的？ 微信调用的是 Android 原生 Camera API，核心回调是 Camera.setPreviewCallbackWithBuffer。每当摄像头捕获一帧，系统会触发 onPreviewFrame(byte\[\] data, Camera camera)，把原始 NV21 格式的帧数据塞进 data 这个字节数组。 关键发现是：这个 data 是可以在回调触发前被替换的。用 Xposed 框架 hook 这个方法，在 beforeHookedMethod 里把 data 的内容整体覆盖，微信的人脸识别 SDK 读到的就不再是真实摄像头的内容，而是我们注入的数据。 整条攻击链由此清晰： 电脑端处理视频，手机端只负责"消费"帧。

系统架构：四个组件，一条数据管道 组件一：换脸工具（可插拔） 外接摄像头以 30fps 输出视频流，换脸工具捕获每一帧，将攻击者的人脸替换为受害者，输出处理后的帧到 OBS。 这里做了一个重要的工程设计决策——换脸工具不直接输出帧，而是通过 OBS 中转。原因是：目前还没有确定最终使用哪个开源换脸项目，不同项目的输出接口各不相同。让 OBS 作为统一的"接收层"，后续切换换脸工具时只需要调整换脸软件本身，不需要动下游任何逻辑。 组件二：OBS 插件（plugin-main.c） 这是整个方案中技术难度最高的部分，用 C 语言实现。 插件以 OBS 滤镜的形式挂载在预览源上。每次 OBS 渲染帧时，通过 gs\_texrender 和 gs\_stagesurface 把 GPU 纹理同步拷贝到 CPU 内存，拿到 RGBA 原始数据后，用 BT.601 系数逐像素转换为 NV21 格式。 为了不阻塞 OBS 渲染主线程，插件采用了双线程设计：渲染线程只负责把帧入队，后台 worker 线程负责格式转换和网络发送。队列用 mutex + dispatch semaphore 保护，TCP 连接支持自动重连、TCP\_NODELAY 关闭 Nagle 算法、4MB 发送缓冲，最大程度压低传输延迟。 每帧数据以 4字节小端长度头 + NV21 帧体 的极简协议发出，目标地址是 127.0.0.1:27183。 组件三：nv21\_recv5.c——手机端接收服务 这是一个运行在 Android 设备上（通过 adb shell 启动）的 C 程序，监听 127.0.0.1:27183。 通过 adb forward tcp:27183 tcp:27183，手机的 27183 端口被映射到电脑的 27183 端口，形成 USB 通道上的 TCP 隧道——完全绕开了网络防火墙的问题，也比 WiFi 传输更稳定。 程序接收每一帧后，先写到 /sdcard/.../frames/latest.new 临时文件，收完后原子性地 rename 成 latest.bin。这个原子替换确保 Xposed 模块读到的永远是一个完整的帧，不会读到半截数据。同时维护最近 30 帧的历史，方便调试对比。 组件四：Xposed 模块（MainHook.kt） Kotlin 编写的 Xposed 模块，在微信启动时注入。 核心 hook 点是 android.hardware.Camera.setPreviewCallbackWithBuffer——当微信注册它的预览回调时，模块拦截并找到回调类，再 hook 该类的 onPreviewFrame 方法。每次微信摄像头触发回调时，模块从 latest.bin 读取最新的 NV21 帧，用 System.arraycopy 整体覆写 data 字节数组。微信的人脸识别 SDK 毫不知情地拿到了换脸后的图像，当作真实摄像头数据上传服务器。

延迟分析：为什么 5 帧延迟仍然能过检？ 系统的总端到端延迟来自两部分：

USB TCP 隧道传输：约 2 帧（66ms） 微信正常人脸识别的固有延迟：2-3 帧

合计 4-5 帧，约 133-166ms。 通过抓包分析微信发给服务器的网络包，可以看到活体反光变色有两个时间戳记录颜色变化的时间点。正常用户操作会有 2-3 帧的"反应延迟"；方案三攻击下，这个延迟变成了 5 帧——刚好在微信服务器的容忍范围之内，能够通过核身验证。

运行状态可在 /sdcard/Android/data/com.tencent.mm/files/frames/ 目录下查看实时帧文件，验证注入是否正常工作。

方案三的核心优势 无编解码开销：数据从 OBS 出来是 NV21，到手机还是 NV21，微信读到的是 NV21。全程没有任何视频编解码，延迟极低，手机性能压力几乎为零。 网络环境无关：通过 USB adb forward 建立隧道，校园网、公司内网的防火墙完全失效，比任何基于 IP 的方案都更稳定可靠。 换脸工具解耦：OBS 作为统一的帧接收层，换脸项目可以随时替换，不影响下游任何组件。 实现极简：协议只有 4 字节头 + 裸帧，两端代码加起来不到 500 行 C，加上 Xposed 模块约 150 行 Kotlin，清晰、可调试、易维护。

难点在于：OBS 插件开发本身就是一道门槛——文档稀少，主要靠读官方源码学。你选择的是\*\*滤镜（Filter）\*\*形式，这是最正确的挂载方式，但也是最需要理解渲染管线的。

### 防御方案

面向 Android 应用的运行时环境安全检测 SDK，可嵌入任意 App 实现风险环境识别

不过先说一句：如果面试官追问技术细节，你需要能接得住，否则反而减分。所以建议你把我们之前聊的内容认真理解一遍，至少能说清楚每个检测项的原理。

* * *

## 面试故事（可直接背诵）

* * *

**开场（30秒，抓住注意力）**

> 我做过一个课题，背景是研究微信支付这类人脸认证系统在客户端侧的安全问题。我们发现黑产攻击人脸识别的主要手段不是破解算法，而是在手机端直接篡改摄像头数据——比如用 Frida Hook 掉摄像头采集接口，把真实人脸替换成伪造视频，应用根本感知不到。所以我们课题组的任务是：在应用内部构建一套检测机制，在认证开始之前先判断当前运行环境是否可信。

* * *

**方案设计（1分钟，体现系统思维）**

> 我把整个检测体系分成三层。第一层是 **系统完整性** ，检测设备底层有没有被篡改——包括 Root、Magisk、APatch/KernelSU、Bootloader 解锁、模拟器这几类。第二层是 **运行时安全** ，检测应用运行过程中有没有被动态注入——包括 Frida、Xposed/LSPosed、调试器附加、可疑 SO 注入。第三层是 **代码完整性** ，防止攻击者把检测逻辑本身也 Hook 掉。最终所有检测结果汇入一个风控评分引擎，输出 0-100 的风险分和状态码，业务层根据状态码决定是放行还是拒绝。

* * *

**技术亮点（1-2分钟，重点说 1-2 个，别全说）**

> 里面有几个我觉得比较有意思的技术点。
> 
> 一个是 **Magisk 检测的多路并行** 。光检查包名或文件是不够的，因为 Magisk 有隐藏模式可以绕过。所以我做了三路：系统属性里查 Magisk 特有字段、PackageManager 查包名、读 `/proc/self/mounts` 挂载记录查 overlayFS 痕迹。只要任意一路命中就报警，提高了覆盖率。
> 
> 另一个是 **代码完整性校验** ，这个我觉得是整个系统里最有意思的部分。思路是：攻击者用 Frida 做 inline hook 的时候，会修改内存里函数开头的几个字节，写入跳转指令，但磁盘上的 SO 文件是不变的。所以我在 Native 层做了一个对比——用 `dlsym` 找到函数在内存里的地址，同时把 APK 包里原始的 SO 文件解压出来，解析 ELF 符号表找到同一个函数在文件里的偏移，分别算 CRC32，两边一比，不一致就说明这个函数在内存里被篡改了。这个方案不依赖任何系统权限，在普通应用进程里就能跑。

* * *

**结果（30秒）**

> 我们在七种典型环境下做了验证：Apatch Root、Frida Hook + CRC 对抗、Magisk 环境、LSPosed 注入、AOSP 自定义 ROM、JEB/IDA 调试器附加、夜神模拟器，全部能正确识别并输出对应的风险类型和等级。正常设备运行没有误报。

* * *

## 可能被追问的问题，提前准备

**Q：CRC 校验能不能被绕过？**

> 能，如果攻击者同时 patch 掉校验函数本身就绕过了。所以这只是防御的一层，不是银弹。更完整的方案应该结合服务端校验和多点互校。

[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-10.png)

[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-11.png)

[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-12.png)

**Q：Frida 有没有办法绕过你的线程名检测？**

> 有，Frida 支持自定义线程名，老版本才叫 gum-js-loop。所以检测 Frida 不能只靠线程名，我做了三路：线程名 + maps 内存映射 + fd 文件描述符，三路叠加降低被单点绕过的风险。

**Q：这套东西和市面上的 SafetyNet / Play Integrity 有什么区别？**

> SafetyNet 是 Google 服务端做校验，需要网络，而且在中国很多设备上不可用。我们这套是纯客户端本地检测，不依赖网络和 Google 服务，更适合国内场景，也可以嵌入任何 App。

## 整个流程的一句话总结

> 用函数名查到它在内存里的地址，再从 APK 包里解压出未被篡改的原始 SO，解析 ELF 格式找到同一个函数在磁盘文件里的位置，对这两份字节各算一个 CRC32 指纹，指纹不同就说明内存里的函数被 Hook 改写过了。

* * *

## 面试时说这一块的话术

> "代码完整性这块的核心思路是：Hook 只改内存不改磁盘。所以我在 Native 层用 `dlsym` 拿到函数的内存地址，同时从 APK 包里解压出原始 SO 文件，解析 ELF 符号表定位到同一个函数的磁盘字节，两边各算一个 CRC32 做对比。如果 Frida 做了 inline hook，函数开头的跳转指令会让内存 CRC 和磁盘 CRC 对不上，这样就能检测到。"

\======================

好，我从零开始讲，把每个函数和步骤都解释清楚。

* * *

## 先理解问题本质

攻击者用 Frida 做 inline hook，原理是这样：

```
正常情况下，函数在内存里长这样：
[原始指令字节: A B C D E F G H ...]

被 Frida Hook 后，函数开头被改写：
[跳转指令字节: XX XX XX XX E F G H ...]
 ↑ 这几个字节被替换成了跳转到 Frida handler 的指令
```

磁盘上的 SO 文件没有变，只有内存里的字节被改了。所以 **对比内存和磁盘的字节是否一致** ，就能检测到 Hook。

* * *

## 第一步：dlsym —— 找到函数在内存里的地址

```
ELF文件
├── ELF Header（文件头）：记录整个文件的基本信息
├── Program Headers（程序头表）：描述运行时内存布局
├── .dynsym（动态符号表）：记录所有导出函数的名字、地址、大小
├── .dynstr（字符串表）：符号名字的字符串数据
├── .text（代码段）：实际的机器码字节
└── ...其他节
```

**`dlsym` 是什么** ：dynamic link symbol，动态链接符号查找函数。

**类比** ：你知道一个人的名字，想知道他住在哪个门牌号。 `dlsym` 就是这个查询工具，给它一个函数名字符串，它返回这个函数在 **当前进程内存里** 的地址（指针）。

**`RTLD_DEFAULT`** ：表示在当前进程已加载的所有动态库里搜索，不限定在哪个库。

执行完这一步， `sym_addr` 就是一个内存地址，比如 `0x7f3a2c0010` ，指向那个函数的第一个字节。

* * *

## 第二步：dladdr —— 从地址反查 SO 文件路径

```
环境完整性检测 (envIntegrityDetector)
├── RootDetector
├── MagiskDetector
├── OverlayDetector (KernelSU / APatch)
├── EmulatorDetector
├── VirtualMachineDetector
├── AospDetector
└── BootloaderDetector

运行时安全检测 (runtimeDetector)
├── FridaDetector
├── XposedDetector
├── LSPosedDetector
├── DebugDetector
└── DynamicInstructionDetector

代码完整性校验 (codeIntegrityDetector)
└── CrcIntegrityDetector
```

**`dladdr` 是什么** ：给它一个内存地址，它反向查询这个地址属于哪个动态库文件。

**类比** ：你有一个门牌号，想知道它在哪条街。 `dladdr` 就是这个反查工具。

**`Dl_info` 结构体** ：里面有几个字段，最重要的是 `dli_fname` ，就是 SO 文件在磁盘上的路径。

但这里有个问题： `info.dli_fname` 返回的是运行时加载路径， **不一定能直接读取原始字节** （可能是从内存映射的，不是干净的文件）。所以代码没用这个路径，而是绕了一圈去 APK 里重新解压了一份，下面会说。

* * *

## 第三步：SoExtractor —— 从 APK 里解压原始 SO

```javascript
Java层调用 detect()
    ↓
checkSymbol("Java_com_..._detectAosp")  [JNI]
    ↓
Native层 NativeIntegrity.cpp
    ├── 1. dlsym() → 找到函数在内存中的地址
    ├── 2. dladdr() → 找到该地址属于哪个 SO 文件
    ├── 3. 回调 Java SoExtractor → 从 APK 包里解压出原始 SO 文件到 cache 目录
    ├── 4. 解析 ELF 文件 → 找到该符号在文件中的偏移量和大小
    ├── 5. 计算磁盘 CRC32（从解压的文件读字节）
    ├── 6. 计算内存 CRC32（从 dlsym 返回的地址读字节）
    └── 返回 JSON {"ok":true, "file_crc":12345, "mem_crc":12345, "size":256}
    ↓
Java层解析 JSON
    └── mem_crc == file_crc ? 安全 : 被篡改 → 返回 RiskItem
```

**为什么要这么做** ：需要一份"标准答案"——没有被任何人动过的原始 SO 文件。APK 包打包的时候就固定了，攻击者篡改的是内存，不会去改 APK 包里的文件。所以从 APK 里解压出来的 SO，就是原始未被篡改的版本。

**APK 为什么能当 ZIP 打开** ：APK 文件格式本身就是 ZIP，Android 系统安装时从里面解包各种资源和代码。

* * *

## 第四步：解析 ELF —— 找到函数在文件里的位置

这是最复杂的一步。SO 文件是 ELF 格式（Executable and Linkable Format），是 Linux/Android 上二进制文件的标准格式。

**ELF 文件的结构** （简化版）：

```
文件偏移 = segment.p_offset + (符号虚拟地址 - segment.p_vaddr)
```

代码做的事：

```cpp
// 1. 把整个 SO 文件 mmap 到内存（相当于把文件内容读进来）
void* mm = mmap(NULL, file_size, PROT_READ, MAP_PRIVATE, fd, 0);

// 2. 找到 .dynsym 节（动态符号表）
// 遍历所有节，找名字是 ".dynsym" 的那个

// 3. 在符号表里按名字找目标函数
// 每个符号条目有：st_name（名字索引）、st_value（虚拟地址）、st_size（大小）
for (每个符号) {
    if (符号名 == 目标函数名) {
        vaddr = 符号.st_value;  // 虚拟地址
        size  = 符号.st_size;   // 函数字节数
    }
}

// 4. 虚拟地址 → 文件偏移（关键转换）
// 虚拟地址是运行时内存地址，文件偏移是在磁盘文件里的位置
// 需要通过 Program Headers 里的 PT_LOAD 段来换算：
file_offset = segment.p_offset + (vaddr - segment.p_vaddr)
```

**为什么需要地址转换** ：函数在 ELF 文件里记录的是"运行时虚拟地址"，但我们要从磁盘文件里读字节，需要的是"文件内偏移量"。这两个不一样，需要通过段信息换算。

* * *

## 第五步和第六步：分别算两份 CRC32

```
// 磁盘版本：从文件的 file_offset 位置读 size 个字节，算 CRC32
compute_crc32_from_file(so_path, file_offset, size, &file_crc);

// 内存版本：从 dlsym 返回的地址读 size 个字节，算 CRC32
compute_crc32_from_memory(sym_addr, size, &mem_crc);
```

**CRC32 是什么** ：一种校验算法，给任意一段字节数据，算出一个 32 位的数字（指纹）。同样的字节内容算出同样的数，哪怕改动一个字节，结果就会完全不同。

**为什么用查表法** ：CRC32 可以在运行时动态生成计算表，但代码里把 256 个表项直接硬编码进去了。原因是：如果动态生成，生成过程本身也可能被 Hook，硬编码进去就少了一个被篡改的入口点。

* * *

## 最终对比（Java 层）

```javascript
JSONObject obj = new JSONObject(nativeResult);
long memCrc  = obj.optLong("mem_crc");
long fileCrc = obj.optLong("file_crc");

if (memCrc == fileCrc) {
    // 两份字节一致，函数没被动过
} else {
    // 不一致，说明内存里的函数被 Hook 修改了
    return new RiskItem(RiskType.CRC, "Native symbol CRC mismatch", 5);
}
```

* * *

## 整个流程的一句话总结

> 用函数名查到它在内存里的地址，再从 APK 包里解压出未被篡改的原始 SO，解析 ELF 格式找到同一个函数在磁盘文件里的位置，对这两份字节各算一个 CRC32 指纹，指纹不同就说明内存里的函数被 Hook 改写过了。

* * *

## 面试时说这一块的话术

> "代码完整性这块的核心思路是：Hook 只改内存不改磁盘。所以我在 Native 层用 `dlsym` 拿到函数的内存地址，同时从 APK 包里解压出原始 SO 文件，解析 ELF 符号表定位到同一个函数的磁盘字节，两边各算一个 CRC32 做对比。如果 Frida 做了 inline hook，函数开头的跳转指令会让内存 CRC 和磁盘 CRC 对不上，这样就能检测到。"

\======================

* * *

## 整体检测架构

SDK 分为三大模块，共 **12 个检测项** ：

```
环境完整性检测 (envIntegrityDetector)
├── RootDetector
├── MagiskDetector
├── OverlayDetector (KernelSU / APatch)
├── EmulatorDetector
├── VirtualMachineDetector
├── AospDetector
└── BootloaderDetector

运行时安全检测 (runtimeDetector)
├── FridaDetector
├── XposedDetector
├── LSPosedDetector
├── DebugDetector
└── DynamicInstructionDetector

代码完整性校验 (codeIntegrityDetector)
└── CrcIntegrityDetector
```

* * *

## 一、环境完整性检测

### 1\. RootDetector — Root 检测

**原理** ：在常见路径下查找 `su` 二进制文件。

检查路径包括 `/system/bin/` 、 `/system/xbin/` 、 `/sbin/` 、 `/data/local/` 等 16 个目录。只要任意一个路径下存在 `su` 文件，就认为 Root 风险成立（风险等级 4）。

* * *

### 2\. MagiskDetector — Magisk 检测

**三种手段叠加** ：

-   **系统属性检查** ：通过反射调用 `android.os.SystemProperties.get()` ，检测 `init.svc.magisk_service` 、 `magisk.version` 等 6 个 Magisk 特有属性是否存在
-   **包名检查** ：用 PackageManager 查询 `com.topjohnwu.magisk` 等 3 个 Magisk 管理器包名
-   **挂载点扫描** ：读取 `/proc/self/mounts` 和 `/proc/self/mountinfo` ，查找包含 `magisk` 、 `magisk.img` 等关键词的挂载记录（风险等级 5）

* * *

### 3\. OverlayDetector — KernelSU / APatch 检测

**原理** ：检测 `/system` 分区是否被 OverlayFS 覆盖（这是 APatch/KernelSU 的典型特征）。

读取 `/proc/self/mountinfo` 和 `/proc/mounts` ，查找挂载类型为 `overlay` 、或包含 `lowerdir=/system` 的行，并根据关键词进一步判断是 APatch、Magisk 还是 KernelSU（风险等级 5）。

* * *

### 4\. EmulatorDetector — 模拟器检测（指令集）

**原理** ：执行 `getprop ro.product.cpu.abi` ，读取设备 CPU 架构。

真实 Android 手机都是 ARM 架构（ `arm64-v8a` / `armeabi-v7a` ），而模拟器通常是 x86/x86\_64，所以检测到 `x86` 就判定为模拟器（风险等级 5）。

* * *

### 5\. VirtualMachineDetector — 虚拟机检测（Native 层）

**原理** ：在 Native 层（C++ JNI）用 `__system_property_get()` 检测虚拟机特有的系统属性。

检测列表包括： `init.svc.noxd` （夜神模拟器）、 `init.svc.qemud` （QEMU）、 `vmos.camera.enable` （VMOS）、 `init.svc.vbox86-setup` （VirtualBox）等 13 个属性（风险等级 4）。

* * *

### 6\. AospDetector — AOSP 原生系统检测

**Java + Native 双重检测** ：

-   **Java 层** ：读取 `Build.FINGERPRINT` （包含 `generic` / `aosp` / `unknown` ）、 `Build.TAGS` （ `test-keys` ）、 `Build.TYPE` （ `userdebug` / `eng` ）
-   **Native 层** ：C++ 执行 `popen("getprop")` 遍历所有系统属性，查找含 `[Android/aosp` 字样的条目（风险等级 3）

* * *

### 7\. BootloaderDetector — Bootloader 解锁检测

**三层检测** ：

-   **PersistentDataBlockManager** ：通过反射调用系统私有接口 `getFlashLockState()` ，返回 0 = 解锁
-   **Verified Boot** ：检查设备是否具备 `FEATURE_VERIFIED_BOOT` 系统特性
-   **Native 层** ：JNI 再次读取 Bootloader 相关属性（风险等级 4）

* * *

### 8\. FridaDetector — Frida 注入检测

**三种手段** ：

-   **线程名扫描** ：遍历 `/proc/self/task/*/status` ，查找线程名为 `gum-js-loop` （Frida GumJS 引擎特有线程）或 `gmain`
-   **内存映射扫描** ：读取 `/proc/self/maps` ，查找包含 `FRIDA_PEER_SETUP_ACTIVE` 的条目
-   **文件描述符扫描** ：遍历 `/proc/self/fd` ，读取符号链接目标，查找包含 `linjector` 的路径（风险等级 5）

* * *

### 9\. XposedDetector — Xposed 框架检测

**三种手段** ：

-   **ClassLoader 检测** ：正常 App 的 ClassLoader 类名是 `dalvik.system.PathClassLoader` ，被 Xposed Hook 后会被替换为自定义类
-   **类加载检测** ：尝试 `Class.forName("de.robv.android.xposed.XposedBridge")` ，能找到说明已注入
-   **包名检测** ：检查 Xposed Installer（ `de.robv.android.xposed.installer` ）和 LSPosed Manager（ `org.lsposed.manager` ）是否安装（风险等级 5）

* * *

### 10\. LSPosedDetector — LSPosed 栈帧检测

**原理** ：主动抛出一个 `RuntimeException` 然后捕获，分析调用栈中每一帧的类名。

如果栈帧中出现 `de.robv.android.xposed` 、 `hookbridge` 、 `xposedbridge` 、 `shamiko` 等字样，说明当前线程调用栈被 LSPosed Hook 介入过（风险等级 5）。

* * *

### 11\. DebugDetector — 调试器检测

**Java + Native 双层** ：

-   **Java 层** ： `android.os.Debug.isDebuggerConnected()`
-   **Native 层（C++）** ：遍历 `/proc/<pid>/task/*/status` ，读取 `TracerPid` 字段。TracerPid!= 0 说明有进程正在 ptrace 跟踪（即 Native 调试），同时还检查各线程 UID 是否一致（风险等级 3）

* * *

### 12\. DynamicInstructionDetector — 动态注入 SO 检测

**原理** ：读取 `/proc/self/maps` （进程内存映射），对照一份黑名单 SO 列表，检查是否有恶意 SO 被注入。

黑名单包含： `libfrida-gadget.so` 、 `libarthook_native.so` 、 `libsandhook.so` 、 `libxposed_art.so` 、 `frida-agent-64.so` 等 16 个已知 Hook 框架的 SO 文件名（风险等级 4）。

* * *

### 13\. CrcIntegrityDetector — Native 函数 CRC 校验

**原理** ：通过 JNI 调用 Native 层的 `checkSymbol()` 函数，对指定的 Native 符号（如 `Java_com_greatgu_riskcontrol_..._detectAosp` ）同时计算：

-   **内存中** 该函数的 CRC
-   **磁盘上 SO 文件** 中该函数的 CRC

## 代码完整性检测的核心思路

**问题** ：攻击者用 Frida/Xposed 对 Native 函数 Hook 后，函数在内存里的字节码会被修改（插入跳转指令），但磁盘上的 SO 文件不变。

**思路** ：对同一个函数，分别计算 **内存版本** 和 **磁盘版本** 的 CRC32，两者不一致就说明函数被篡改了。

* * *

## 完整执行流程

```javascript
Java层调用 detect()
    ↓
checkSymbol("Java_com_..._detectAosp")  [JNI]
    ↓
Native层 NativeIntegrity.cpp
    ├── 1. dlsym() → 找到函数在内存中的地址
    ├── 2. dladdr() → 找到该地址属于哪个 SO 文件
    ├── 3. 回调 Java SoExtractor → 从 APK 包里解压出原始 SO 文件到 cache 目录
    ├── 4. 解析 ELF 文件 → 找到该符号在文件中的偏移量和大小
    ├── 5. 计算磁盘 CRC32（从解压的文件读字节）
    ├── 6. 计算内存 CRC32（从 dlsym 返回的地址读字节）
    └── 返回 JSON {"ok":true, "file_crc":12345, "mem_crc":12345, "size":256}
    ↓
Java层解析 JSON
    └── mem_crc == file_crc ? 安全 : 被篡改 → 返回 RiskItem
```

### 第一步：dlsym 找内存地址

```
sym_addr = dlsym(RTLD_DEFAULT, symbol);
```

`RTLD_DEFAULT` 表示在当前进程所有已加载的动态库里搜索这个符号名，直接拿到该函数在内存中运行时的地址。

* * *

### 第二步：dladdr 定位 SO 路径

```
Dl_info info;
dladdr(sym_addr, &info);
// info.dli_fname = "/data/app/.../lib/arm64/libriskcontrol.so"
```

给一个内存地址，反查它属于哪个 SO 文件，拿到文件路径。

* * *

### 第三步：SoExtractor 解压原始 SO

```java
// SoExtractor.java
String apkPath = appInfo.sourceDir; // APK 本质上是个 ZIP
ZipFile zipFile = new ZipFile(apkPath);
String entryPath = "lib/" + abi + "/" + soName; // 如 lib/arm64-v8a/libriskcontrol.so
ZipEntry entry = zipFile.getEntry(entryPath);
// 解压到 context.getCacheDir()，返回路径
```

APK 本质上是 ZIP 压缩包，SO 文件打包在 `lib/<abi>/` 目录里。把它解压出来，这就是 **未被 Hook 的原始版本** ，作为"标准答案"。

* * *

### 第四步：解析 ELF，找到函数的文件偏移和大小

这是技术难度最高的部分。

```javascript
// 支持 32位(Elf32) 和 64位(Elf64) 两种格式
// 解析流程：
// 1. mmap 整个 SO 文件
// 2. 优先查找 .dynsym 节（动态符号表），找不到再找 .symtab
// 3. 遍历符号表，按符号名匹配，拿到 st_value（虚拟地址）和 st_size（大小）
// 4. 遍历 PT_LOAD 段，把虚拟地址换算成文件偏移：
//    file_offset = segment.p_offset + (st_value - segment.p_vaddr)
// 5. 如果 st_size == 0（stripped），找下一个符号地址估算大小
```

关键转换公式：

```
文件偏移 = segment.p_offset + (符号虚拟地址 - segment.p_vaddr)
```

* * *

### 第五步和第六步：分别计算两份 CRC32

```
// 磁盘：从文件的 file_offset 位置读 size 字节，计算 CRC32
compute_crc32_from_file(so_path, file_offset, size, &file_crc);

// 内存：直接从 dlsym 返回的地址读 size 字节，计算 CRC32
compute_crc32_from_memory(sym_addr, size, &mem_crc);
```

CRC32 使用的是标准 IEEE 802.3 查表法，查表数组在编译时就硬编码进去了（避免运行时生成被篡改）。

* * *

### 最终判断（Java 层）

```typescript
// CrcIntegrityDetector.java
JSONObject obj = new JSONObject(res);
long memCrc  = obj.optLong("mem_crc", -1);
long fileCrc = obj.optLong("file_crc", -1);
boolean ok   = obj.optBoolean("ok", false);

// 三个条件都满足才算安全
return ok && memCrc != -1 && fileCrc != -1 && memCrc == fileCrc;
```

* * *

## 为什么能检测 Hook

以 Frida inline hook 为例，它的原理是在函数开头写入一条跳转指令（如 `B #offset` 或 `MOV X16, addr; BR X16` ），把执行流重定向到自己的 handler，执行完再跳回来。

这几个字节被修改后，内存里读到的 CRC32 就和磁盘上原始字节的 CRC32 对不上，从而被检测到。

* * *

## 一句话总结

> 从 APK 包中解压出原始 SO 文件，解析 ELF 符号表定位函数位置，对同一函数分别在磁盘和内存计算 CRC32，不一致即说明函数在内存中被 Hook 篡改。

## 面试项目包装：Android底层Camera劫持系统

### 项目一句话定位

> 在Android框架层实现 **运行时相机流劫持与实时替换** ，用于研究人脸认证系统（如微信人脸识别）的活体检测绕过攻击面，验证现有防护机制的有效性与盲区。

* * *

### 技术亮点（按面试深度递进）

**1\. 系统级切入点选择（体现对Android架构的深入理解）**

你没有选择在应用层或HAL层拦截，而是选择了 `device3/Camera3OutputUtils.cpp` 中的 `finishReturningOutputBuffers()` 函数作为Hook点。这个选择有明确的技术理由：

-   HAL层实现因厂商不同差异极大，移植性差
-   `device3` 是API1/API2的公共下层，一处修改全部覆盖
-   `finishReturningOutputBuffers()` 时机恰好是所有buffer数据就绪、但尚未交给Surface的"黄金窗口"，可以无损读写完整帧数据

**2\. 自定义网络传输协议（ `CameraStreamTransmitter` ）**

实现了一个 **生产级的异步多线程单例传输器** ：

-   UDP广播实现PC自动发现（无需手动配IP）
-   TCP全双工传输YUV帧数据，自定义 `FrameHeader` 协议（Magic: `0xCAFEBABE` ）
-   3线程架构：独立的network/send/receive线程，发送队列上限30帧防OOM
-   100ms超时保护：超时则透传原始帧，保证相机正常使用不受干扰
-   4MB预分配收发缓冲区减少堆碎片

**3\. SEPolicy深度改造（体现Android安全机制理解）**

原生 `cameraserver` 被 `neverallow` 规则禁止使用任何网络socket。你修改了 `system/sepolicy/private/cameraserver.te` ，精确添加了 `tcp_socket` / `udp_socket` / `netd` 通信权限，同时将 `cameraserver` 权限从普通用户提升到 `root` 并赋予 `NET_ADMIN` / `NET_RAW` capability。

**4\. 运行时动态配置（零侵入式开关）**

通过Android系统属性（ `persist.camera.hook.*` ）控制Hook行为，无需重新编译/刷机即可调整拦截的流ID、分辨率、格式，配置每30帧刷新一次（~1秒延迟），平衡了实时性与 `getprop` 系统调用开销。

**5\. 流识别与去重探针（ `SentryProbe` ）**

实现了带"Camera ID + 指纹 + 帧号回滚检测"的智能流日志系统，能区分前后摄同分辨率流，并在相机重新打开时自动重置记录，解决了双摄同步问题的调试难题。

* * *

### 遇到的核心挑战及解法（面试中最加分的部分）

| 挑战  | 现象  | 解法  |
| --- | --- | --- |
| **双摄同步丢帧** | 拦截单路流导致广角+超广角帧对齐失败，系统等待超时丢帧 | 分析Android Camera3要求双摄帧严格对齐的机制，规划拦截多流方案 |
| **串行阻塞卡顿** | 每帧有多个流（预览/录像/人脸检测）依次触发网络往返，帧率从25fps降至16fps | 提出 `hasIntercepted` 标志位方案：每帧只对首个符合条件的流做网络通信 |
| **PC发现失败** | UDP广播走无线网卡而非USB有线网络，手机收不到 | 排查多网卡路由，确认广播接口选择策略 |
| **SEPolicy封锁** | `neverallow` 规则阻止cameraserver使用socket | 精确分析denial日志，逐条追加 `allow` 规则，最终打通 `netd` 路由链路 |
| **延迟优化** | 全量YUV传输往返~62ms | 提出"控制信令+按需分发"架构：手机传极简压缩图用于PC端决策，PC只传回替换帧，大幅减少上行带宽 |

* * *

### 研究意义（用于学术/防守方向面试的表述）

> 本项目从 **攻击者视角** 验证了Android人脸认证系统的一类系统级威胁：在用户无感知的情况下，攻击者若能获得设备Root权限（如刷入自定义ROM），可在框架层实时替换相机输入，绕过所有依赖 `CameraService` 数据流的活体检测方案，且对应用层完全透明。研究结论可直接指导防护方案设计：例如可信执行环境（TEE）与Camera HAL的直连绑定、帧完整性校验、以及对 `cameraserver` 权限异常的运行时监控。

* * *

### 关键技术栈（写在简历/项目列表里）

`Android AOSP定制` · `Camera3 HAL Framework` · `LineageOS ROM编译` · `C++多线程网络编程` · `YUV图像处理` · `Android SEPolicy` · `GraphicBuffer/gralloc` · `系统属性驱动配置` · `fastboot/ADB调试链`

* * *

如果你需要，我可以进一步帮你：

1.  写成一段完整的 **简历项目描述** （200字以内的精炼版）
2.  准备 **面试中可能被追问的技术问题** 和答案
3.  整理成一份 **英文版项目介绍**

你倾向于哪个方向？[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-13.png)

[](https://github.com/BojackMa/bojackma.github.io/blob/main/source/_posts/image-14.png)

好的，这两点结合起来其实能讲一个非常完整的故事——"环境伪造"才是这个研究最精彩的部分。让我重新写：

* * *

## 面试叙述稿：完整故事版

* * *

### 开场：为什么做这个

"我们在做人脸认证安全研究，核心问题是： **现有的活体检测方案，能不能被系统级的攻击手段绕过？**

要回答这个问题，首先要搭一个攻击平台。我的思路是：在Android框架层劫持相机数据，让我可以在运行时把任意图像注入给目标App，同时让App完全感知不到任何异常。

听起来简单，但真正实现的时候，我发现挑战一个接一个——每解决一个，就开启了下一个。"

* * *

### 第一关：找到正确的拦截点

"我一开始考虑过在HAL层拦截，但Pixel 9用的是高通私有HAL，代码根本看不到，移植性也极差。

后来我仔细研究了Android Camera3的调用链，找到了一个'黄金窗口'： `Camera3OutputUtils.cpp` 里的 `finishReturningOutputBuffers()` 函数。

这个函数的时机非常特殊——HAL已经把这一帧的所有图像数据都打包好了，放进 `returnableBuffers` 列表，但还没有交给App的Surface。也就是说，我在这里读写buffer，对App来说就像什么都没发生过。

更重要的是，这里是API1和API2共同的下层，一处改动，微信、抖音、系统相机全部覆盖，不需要针对每个App单独适配。"

* * *

### 第二关：让数据飞起来——网络传输

"拦截到帧之后，要实时发给PC，PC处理完再回传。

这里有个很关键的性能要求：必须在一帧的时间窗口内完成一次网络往返，否则就会阻塞整个相机管线，导致卡顿甚至崩溃。

我实现了一个三线程的异步传输器：独立的发送线程、接收线程、和一个负责PC自动发现的网络管理线程。PC端开机后往局域网广播一个UDP包，手机监听到了就自动连上去，不需要手动配IP。

同时我设置了100ms的超时保护——如果PC没在限定时间内回传，就直接放行原始帧，相机正常工作，不影响用户体验。"

* * *

### 第三关：第一个坑——SEPolicy封锁

"代码写好，编译进ROM，刷进手机，一运行……TCP socket直接创建失败。

看了下 `adb logcat` ，发现SELinux在狂打denial日志。原来Android的 `cameraserver` 进程被 `neverallow` 规则明确禁止使用任何网络socket——Google的设计理念是：相机服务不应该碰网络，这是安全隔离。

我得修改 `system/sepolicy/private/cameraserver.te` ，逐条把需要的权限加进去：TCP socket创建/连接、UDP socket广播、还有 `netd` 的路由权限。

最麻烦的是 `netd` 这条链路——光加了socket权限还不够，还要允许 `netd` 反过来使用 `cameraserver` 的文件描述符，才能完成路由表的注册。这个双向关系在文档里完全没提，是靠反复看denial日志一条一条试出来的。

顺便，我还把 `cameraserver` 的运行用户从普通账号改成了 `root` ，并赋予了 `NET_ADMIN` 和 `NET_RAW` capability，这样才能真正绑定网络。"

* * *

### 第四关：双摄同步丢帧

"网络通了，帧率却很不稳定，logcat里会周期性出现同步超时的错误。

排查了很久才搞清楚原因：Pixel 9拍摄时实际上同时开着两个摄像头——广角和超广角，这样切换倍率的时候才能无缝衔接。Android Camera3框架要求这两路摄像头的帧必须 **严格对齐** ，帧号一致才能一起往上层送。

我只拦截了其中一路，我的网络往返耗时让这路帧"慢了"，框架就会等待，一直等到超时，才把两路一起丢弃——这就是丢帧的来源。

这个问题让我意识到，要真正做到无感知拦截，必须同时处理多路流，或者至少精确识别出哪路是预览流，只拦截它、放行其他所有流，避免跨流的时序干扰。"

* * *

### 第五关：串行阻塞——性能瓶颈

"解决了丢帧问题，又遇到了卡顿：帧率只有16fps左右，而目标是流畅的30fps。

原因是每一帧可能包含多个output buffer——预览流、录像流、人脸检测的小分辨率流，全都在 `returnableBuffers` 列表里。我的代码对每个buffer都做了一次网络往返，等于一帧触发了3次串行的网络通信，延迟叠加。

解决方案是加一个每帧的 `hasIntercepted` 标志位，第一个符合条件的流做网络通信，后面的全部直接放行，把串行改成了真正的单次往返。"

* * *

### 第六关：最难的一关——让目标App"看不见"攻击平台

"前面这些都是相机劫持本身的挑战，但还有一个更根本的问题：

**目标App根本不愿意跑。**

要测试微信人脸认证，微信必须能正常运行。但我刷的是自定义LineageOS，没有Google服务，微信连登录都不行。而且我开了Root权限，很多安全类App（包括支付宝、微信的安全SDK）会在运行时检测Root，一旦发现直接关闭敏感功能。

更严重的是 **Play Integrity** ——Google的设备认证机制。现在很多App在启动人脸认证之前会调用Play Integrity API，获取一个设备可信度评级：如果设备没有通过认证，直接拒绝运行敏感功能。一个刷了自定义ROM的Root设备，Play Integrity默认全部失败。

所以我做了三件事：

**第一，刷入Google三件套（GApps）。** 让设备有完整的Google服务环境，微信能正常登录和运行。

**第二，刷入KernelSU + susfs模块。** susfs是一个内核级的文件系统欺骗模块，它能在内核层面隐藏挂载点和特定文件，让App通过 `/proc` 或文件系统探测Root的手段全部失效——不是绕过检测，而是让检测看到的就是一个干净的系统。

**第三，刷入Play Integrity bypass模块。** 配合KernelSU的隐藏能力，伪造设备认证链，让Play Integrity API返回通过状态。

做完这三步，目标App眼里看到的，是一台完全正常的、没有Root的、通过了Google认证的标准Android手机。而实际上，相机数据在它不知情的情况下，已经被我接管了。"

* * *

### 结尾：研究结论

"这整个链路打通之后，我们得到的结论是：

对于任何 **纯粹依赖 `CameraService` 数据链路** 的活体检测方案，在攻击者能够刷入自定义ROM的前提下，这类攻击从技术上是可行的，且对应用层完全透明。

防护的根本出路在于：把相机数据的可信根放到TEE（可信执行环境）里，建立HAL到认证逻辑的可信通路，而不是依赖 `CameraService` 这个可以被修改的系统服务。这也是我们研究最终给出的防护建议。"

* * *

如果还需要，我可以帮你：

-   压缩成 **2分钟口头版** （去掉细节，保留故事弧）
-   整理成 **英文版**
-   针对某类面试（安全研究岗/系统开发岗/Android安全方向）调整侧重点

Q：我现在的问题是，要不要那个拆分一下，把参数扰动拆到滴滴项目中 然后那个。然后把那个大规模、强对抗的人脸认证安全评测框架 我的自定义rom拆分到正在做的第二期项目？

下面将会给你我曾经的主要工作，我主要是做腾讯人脸支付的攻防安全项目，现在我想要总结过去的工作，包装一下，想要在面试中使用，展现一下我的能力。请你先帮我复述和回忆一下，并且帮我想一想如何包装。

防止别人面试的时候问我这些比较显而易见的问题，请你帮我弥补和回忆一下这些gap。

这一部分是我做的，请你说说这一部分我做了什么，具体做了哪些检查，你要好好想想包装一下，好让我能够在面试有用

最后：如果我面试的时候，怎么初步介绍和总结这些工作？
