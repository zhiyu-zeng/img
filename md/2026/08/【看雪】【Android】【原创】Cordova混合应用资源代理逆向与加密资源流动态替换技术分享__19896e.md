---
title: 【看雪】【Android】【原创】Cordova混合应用资源代理逆向与加密资源流动态替换技术分享
source: https://bbs.kanxue.com/thread-292622.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-18T19:46:29+08:00
trace_id: bea03f84-c97a-49da-a5a8-5dbd61350192
content_hash: 32aa12e9d7e3acf41e715d5d526ce634605cbcce4ff102b09410f159a4f7fadc
status: synced
tags:
  - 看雪
  - Android逆向
  - Hook
series: null
feed_source: 看雪·Android安全
ai_summary: 逆向Cordova混合应用：通过hook加密资源流的read()层，可绕过resproxy加密并在运行时等长替换JS逻辑；仅传输层加密挡不住读层钩子。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c075244-d011-8158-ba46-f39b4c162804
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 逆向Cordova混合应用：通过hook加密资源流的read()层，可绕过resproxy加密并在运行时等长替换JS逻辑；仅传输层加密挡不住读层钩子。
> 
> - **目标架构：** 游戏采用Cordova + Cocos Creator 2.4.4网页引擎，业务逻辑全在JS；资源保护为自定义resproxy + LZMA资源池（assets/pool/**/*.lz，3100+文件）+ CDN热更，WebView由assets/www/index.html引导。
> - **文件双通道：** resproxy对资源分“明文/加密”两通道：明文走URLResponseStream.onSuccessFile可整文件复制；加密走EncryptedFileStream流式解密，必须在其read()层捕获/改写才能拿到明文。
> - **Dump五版迭代：** v1/v2钩死代码与理解不足无输出，v3全链路打点落空，v4仅获明文通道，v5在EncryptedFileStream.read里tee解密字节才dump出全量主逻辑JS；最大坑是smali条件写反（if-gtz vs if-lez）导致真数据被跳过、落盘全0字节。
> - **动态替换：** 在加密流read()解密后插入patchChunk，做严格等长替换（用/*注释*/补位），避免缓冲区搬移；匹配用String定位，落笔前做字节级回验防二进制误伤；APK内明文tobid.js广告适配层可直接改写切断原生广告调用。
> - **防御启示：** 操作中应先在JS层做完整性校验/自定义格式，仅靠传输层加密挡不住读层钩子；崩溃堆栈可暴露完整回调链，是重要逆向线索。

\> 1. 本文纯属\*\*移动安全技术研究与学习交流\*\*，目的是分享 Cordova 混合应用资源保护机制的逆向方法论。

\> 2. 文中涉及的游戏软件版权、商标及其他知识产权均归\*\*原游戏厂商\*\*所有，本人无意侵犯。

\> 3. 本文\*\*不提供、不传播\*\*任何修改后的成品安装包、补丁工具、脱壳脚本或成品文件下载方式。

\> 4. 文中所有分析均在本人\*\*合法持有\*\*的设备与安装副本上进行，仅用于技术验证（POC），未将任何成果用于商业用途、破坏游戏运营或获取不正当利益。

\> 5. 请读者自觉遵守《中华人民共和国网络安全法》《中华人民共和国数据安全法》《计算机软件保护条例》等法律法规；严禁利用文中技术实施任何违法违规行为；测试完毕后请于 24 小时内删除相关测试副本。

\> 6. 若游戏厂商或权利人认为本文内容侵害其合法权益，请通过论坛站内信联系本人，本人承诺\*\*第一时间配合删除\*\*相关内容。

## 前言与背景

\---

\## 一、前言

近年国产休闲/解谜类游戏大量采用 \*\*Cordova + HTML5 网页引擎\*\*的混合架构，业务逻辑（甚至整个游戏玩法）都放在 JS 里。为保护 JS 不被轻易窃取，厂商常配合\*\*自定义资源代理（resproxy）+ 文件级加密 + LZMA 资源池 + CDN 热更\*\*的组合拳。

本文以一款解谜类游戏为例（Cocos Creator 2.4.4 网页版引擎），完整记录从 APK 结构分析 → 资源代理链路还原 → 加密流 Dump → 到 \*\*JS 字节级动态替换\*\*的全过程，重点分享踩坑经验与通用方法论。全文仅作技术探讨，关键敏感信息已脱敏。

\## 二、目标概况

| 项 | 值 |

|---|---|

| 包名 | 已脱敏（解谜类，渠道包） |

| 版本 | 1.1.0 |

| 引擎 | Cocos Creator 2.4.4（cocos2d-js，WebView 渲染，无原生引擎.so） |

| 框架 | Cordova |

| 资源代理 | com.nowheregames.resproxy（libresproxy.so） |

| 资源池 | assets/pool/\*\*/\*.lz（3100+ 文件，raw LZMA1） |

| 保护 SDK | libInno / libInnoSecure / libsec（保护与支付，非引擎） |

| 广告 SDK | ToBid（WindMill）+ 多插件协调器 |

## 架构与资源链路逆向

\## 三、架构与资源链路逆向

\### 3.1 判断引擎

\`lib/\` 目录没有 cocos2djs.so / unity.so，但 assets/www 里存在 \`cocos-adapter.js\` 与 cordova 引导页——初步判断为 WebView HTML5。运行后 Dump 出引擎 JS，确认：

\`\`\`js

cc.ENGINE_VERSION = "2.4.4"

// sourceMappingURL=http://192.168.102.107/cocos_sourcemaps/cocos2d-js-min_xxx.js.map

\`\`\`

（sourcemap 注释指向开发者局域网地址，属于打包残留，顺带证明为未二次混淆的引擎。）

\### 3.2 资源代理加载链路

\`\`\`

assets/www/index.html（引导页，APK 内明文）

→ resproxy.start() // native

→ detectUpdate() // 比对 CDN 版本

→ preload() // 将 LZMA 解包到本地缓存

/data/user/0/<pkg>/files/pool/<2位>/<1位>/<hash>

→ location.replace("https://localhost/<game>/index.html")

→ WebView 资源拦截（两条路径）

\`\`\`

逆向到两个拦截实现：

\- \*\*新式\*\*：\`WebViewAssetLoader\` → \`ResProxy.handle()\`。本版本为\*\*死代码\*\*（打日志零输出）。

\- \*\*旧式（真实路径）\*\*：\`shouldInterceptRequest(WebView, String)\` → \`CordovaResourceApi.remapUri("https://localhost/...")\` → \`ResProxy.remapUri\` → \`toPluginUri\` → \`cdvfile://localhost/resproxy/<index>/<path>\` → \`CordovaResourceApi.openForRead\` → \`ResProxy.handleOpenForRead()\` → 原生 \`BeginProcessResRequest\`。

\### 3.3 文件供应双通道（本文核心认知）

| 通道 | 触发点 | 特征 |

|---|---|---|

## 文件供应双通道

| 明文文件 | \`URLResponseStream.onSuccessFile(path)\`（native → 线程池回调 \`ResProxy$5.run\`） | 能直接复制明文 |

| 加密文件 | \`EncryptedFileStream\`（native ReadByte/ReadRange 流式解密） | \*\*绕过 onSuccessFile\*\*，只能在 read() 层捕获 |

这一认知来自一次意外：修改 APK 后崩溃，堆栈暴露了完整回调链：

\`\`\`

java.lang.IllegalAccessError: Field '...ResProxy.s_instance' is inaccessible...

at...URLResponseStream.onSuccessFile(...)

at...ResProxy.RunOnWorkerThreadCB(Native Method)

at...ResProxy$5.run(...)

\`\`\`

## 免Root Dump与坑

\## 四、免 Root Dump：五版迭代与三个坑

\### 4.1 迭代记录

| 版 | 钩子位置 | 结果 |

|---|---|---|

| v1/v2 | handle() / handleOpenForRead() | 无输出（死代码 / 对回调机制理解不足） |

| v3 | 四探针全链路打点 | 全部落空 → 怀疑"装的是旧包" |

| v4 | onSuccessFile() 复制明文 → gamedump/ | 成功，仅捕获明文通道 |

| v5 | EncryptedFileStream.read(\[BII) tee 解密字节 → encdump/ | \*\*成功，全量主逻辑 JS\*\* |

\### 4.2 三个真实踩坑

\*\*① IllegalAccessError\*\*：在 onSuccessFile 里 \`sget-object ResProxy.s\_instance\`——该字段为 private，ART 运行时校验访问标志直接抛 IllegalAccessError 崩溃。教训：跨类取上下文用公开 API（\`Environment.getExternalStorageDirectory()\` 拼路径）而非私有字段。

\*\*② if-gtz 条件写反\*\*：想表达"n ≤ 0 则跳过 dump"，写成了 \`if-gtz\`（语义是 n > 0 才跳转）——结果\*\*真数据被跳过、EOF(-1) 反而进 dump 块\*\*，落盘文件全部 0 字节。正确写法 \`if-lez\`。逆向打补丁时务必逐条核对 smali 跳转语义。

\*\*③ 版本混淆\*\*：每版测试包都写 marker 文件但内容不带版本号，无法确认设备上跑的是哪版，白白浪费三版迭代。后来 marker 带版本号（v11→v15），测试前先核验。

\## 五、业务逻辑定位（dump 成果）

Dump 出的 project.js 为游戏全部逻辑（40+ 小游戏、场景、窗口、SDK 层），其中付费核心：

\`\`\`js

// costView：看广告/花金币解锁的统一入口

// eCostType: Fail=0 / Gold=1 / AD=2 / Share=3 / Free=4

// eCostFunc: 线索 / 道具 / 跳小游戏 / 章节 / 加血

// 广告位名: tishi / daoju / skip / jieshu / huifu

e.prototype.isFree=function(){if(this.\_input.gold<=0)return!0;

if(!s.default.sdk.isSupportAD())return!0;

...

}

// gsdk：广告成功回调里的"5秒反作弊"

i.SUCCESS==a&&!n.api.isIgnoreCheckVADPlayTime&&s<=5&&(a=i.TIME_TOO_SHORT)

\`\`\`

广告桥接链：

\`\`\`

sdk_cordova.playADVideo

→ window.gameads.showVideoAd（聚合器）

→ window.adsSupportedSDKs.tobid.playAD（适配层）

→ cordova.exec('tobid','playAD')（原生 SDK）

\`\`\`

\## 六、动态替换技术（本文重点）

Dump 只能"读"，更进一步是在\*\*返回给 WebView 之前改写字节\*\*——磁盘上的加密文件不动，游戏运行时拿到的就是改过的 JS。

## 动态替换技术

\### 6.1 等长替换原则

在 \`EncryptedFileStream.read(\[BII)\` 解密完成后插入过滤调用。只做\*\*等长替换\*\*，避免缓冲区搬移与流位置失配：

\`\`\`smali

\# EncryptedFileStream.read 核心改动（节选）

:cond_4

iget v0, p0, Lcom/nowheregames/resproxy/EncryptedFileStream;->m_pos:I

move-object v1, p1 # 保存 buffer 引用（move-result 会覆盖 p1）

invoke-direct {p0, p1, p2, p3, v0},...->ReadRange(\[BIII)I

move-result p1

if-lez p1,:cond_11 # ≤0 跳过（曾因 if-gtz 写反）

invoke-static {v1, p2, p1}, L.../DumpDir;->patchChunk(\[BII)V

:cond_11

...

\`\`\`

\### 6.2 字节级匹配器（防二进制误伤）

分块内容可能含任意字节，直接 UTF-8 String 往返会损坏二进制。方案：String 仅用于\*\*定位\*\*，落笔前\*\*字节级回验\*\*：

\`\`\`java

// DumpDir.patchChunk 逻辑

String s = new String(buf, off, len, "UTF-8");

int pos = 0;

while ((int i = s.indexOf(PAT, pos)) >= 0) {

if (i + PAT.length() <= len && matches(buf, off + i, PAT)) { // 字节回验

System.arraycopy(REP, 0, buf, off + i, PAT.length()); // 等长覆写

}

pos = i + 1;

}

\`\`\`

\### 6.3 验证性替换（POC）

在测试环境验证了框架可行性（此处隐去具体字节，仅展示思路）：

\- 定位某判定函数 \`isXxx=function(){if(cond)return...;...}\` 的首个判定，用 \`return!0;/\*填充\*/\` 等长覆写，使函数恒真；

\- 定位某 5 秒反作弊条件，用 \`false&&/\*填充\*/\` 等长覆写使其短路。

两个模式串均先用 Dump 文件验证全文件\*\*仅出现一次\*\*，替换长度严格相等（用 \`/\*x…\*/\` 注释补位）。

\### 6.4 JS 适配层直接改写（明文文件）

APK 内 \`assets/www/plugins/simdoll-ad-tobid/www/tobid.js\` 为明文 cordova 模块，可直接改写（长度不限），把广告适配层换成"假成功"实现即可从源头切断所有原生广告调用——这类文件是混合应用里最薄弱的环节。

\## 七、通用方法论小结

## 通用方法论小结

1\. \*\*先判引擎、再判框架\*\*：lib 目录 + assets/www 即可快速判断混合应用。

2\. \*\*原生回调链是宝藏\*\*：一次崩溃堆栈往往比十次静态分析信息量大。

3\. \*\*打点要带版本号\*\*：任何迭代测试先确认跑的是最新包。

4\. \*\*smali 跳转语义逐条核对\*\*：\`if-gtz/if-lez/if-ltz\` 一字之差。

5\. \*\*二进制安全改写\*\*：定位用 String、落笔用字节回验。

6\. \*\*等长替换优于长度可变替换\*\*：避免缓冲区搬移、流位置失配与块边界问题。

7\. \*\*攻防启示\*\*：混合应用资源保护应在 JS 层做完整性校验/自定义格式，仅靠传输层加密挡不住读层钩子。

\## 八、工具链

\- 静态分析：MT 管理器、jadx、7z（LZMA1 解包：5 字节 props + 8 字节长度头 + raw 流）

\- 动态打点：自写 smali 探针（文件落盘日志）

\- Dump 通道：EncryptedFileStream 层 tee + onSuccessFile 层复制

\- 替换引擎：自写字节级等长匹配器

\---

本文所述技术仅供安全研究与学习交流，全部实验在本人合法持有的设备与安装副本上进行。文中不提供任何成品文件、下载链接或可直接复制的完整补丁配方，涉及的软件知识产权归原厂商所有。任何人利用本文内容实施的行为均与作者无关；请严格遵守法律法规，测试后 24 小时内删除相关副本。若权利人认为存在侵权，请联系删除。

[#基础理论](https://bbs.kanxue.com/forum-161-1-117.htm) [#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#漏洞相关](https://bbs.kanxue.com/forum-161-1-123.htm) [#HOOK注入](https://bbs.kanxue.com/forum-161-1-125.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
