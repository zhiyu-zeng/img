---
title: Cromite / Bromite 不是 Widevine 后门 - 浏览器分叉、流导出与视频合成失败复盘 | +5 Security Research
source: https://overkazaf.github.io/blogs/posts/cromite-bromite-widevine-stream-export-failure/
source_host: overkazaf.github.io
clip_date: 2026-08-23T04:28:41+08:00
trace_id: f739b386-6e5f-4b33-bae1-3b03cbe18921
content_hash: 96df4e020bdfdfeae8cfde56f854152581abf1668c58d1f3c3ae252cf8b75430
status: synced
tags:
  - Widevine
  - Chromium构建
series: null
feed_source: overkazaf·逆向
ai_summary: Cromite/Bromite 虽是可编译的 Chromium 分叉，但无法通过修改 codecs、UA、MSE 或 EME 等浏览器层获得 Widevine/Netflix 授权解密；失败断点是没有可消费 License 的 DRM 会话。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c475244-d011-817f-b23c-f15434102e35
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Cromite/Bromite 虽是可编译的 Chromium 分叉，但无法通过修改 codecs、UA、MSE 或 EME 等浏览器层获得 Widevine/Netflix 授权解密；失败断点是没有可消费 License 的 DRM 会话。
> 
> - **关键结论：** 编解码能力与 DRM 能力必须分开验证；`proprietary_codecs=true` 和 `ffmpeg_branding="Chrome"` 只影响容器/编解码路径，不会生成 CDM、设备证书、provisioning 或 License 权限。
> - **失败尝试：** 伪装 UA/codec、在网络/MSE 层导出分片、拼接 fMP4 再 remux、让 EME 接口假装成功，最终得到的都只是 CENC 加密密文或停在 Key System/session 初始化阶段；只有“解密后输出边界”理论上可行，但当前路线未建立 Widevine 会话。
> - **版本事实：** Bromite 基线为 Chromium 108，不适合作为当前安全浏览器基线；Cromite 核验版本为 148.0.7778.168，官方 FAQ 明确 DRM 支持为 No。
> - **构建复现：** 构建需固定 patch commit、`build/RELEASE` 与 depot_tools 版本；Android 目标以 `target_os="android"`、`target_cpu="arm64"` 生成 GN 配置后构建 `chrome_public_apk`，容器环境使用 Siso offline Ninja 前端。
> - **防护分层：** Netflix 防护是 MSL 控制面、manifest/profile、EME Key System、Widevine CDM、License policy、CENC 分片与 secure decode/output 的串联约束，只改单一客户端字段无法满足后续信任与输出策略。

> **读完本文，你将获得：**
> 
> -   看懂 Chrome/Chromium、Cromite/Bromite、EME、Widevine CDM 和平台 DRM 的职责边界
> -   能按版本固定、补丁应用、GN 配置和 Ninja 目标复现 Cromite/Bromite 的构建过程
> -   明确 `proprietary_codecs=true` 为什么不等于“启用 Widevine”
> -   理解网络分片导出、MSE 截获、能力伪装和视频 remux 为什么都没有跨过内容密钥边界
> -   从 MSL、License、设备能力、CENC、CDM 和安全输出六个层面评估 Netflix 的防护设计

## 〇、摘要与研究边界

这是一篇 **失败路径复盘**，不是 DRM 绕过教程。目标是验证一个看似合理的假设：既然 Cromite 和 Bromite 都是可修改、可自行编译的 Chromium 分叉，那么是否可以通过改变媒体能力、EME 接口或网络管线，获得 Chrome 的 Widevine 播放能力，再把媒体流导出并合成为普通视频？

结论是否定的，而且失败点比“视频无法合成”更早：

1.  **当前 Cromite 官方明确不支持 DRM 媒体**，因此通常在 `requestMediaKeySystemAccess("com.widevine.alpha", ...)` 的 Key System 能力发现阶段就无法建立 Widevine 会话。
2.  `proprietary_codecs=true` 和 `ffmpeg_branding="Chrome"` 只影响 H.264/AAC 等容器与编解码能力，不会生成 CDM、设备证书、Widevine provisioning、License 权限或安全输出能力。
3.  即使能够在浏览器网络层或 MSE 入口导出 Netflix 分片，得到的仍是 CENC 加密的 fMP4 数据；拼接或 remux 只能重组容器，不能替代 CDM 解密。
4.  Netflix 的授权不是一个客户端布尔开关。Web Player、MSL 控制面、EME、Widevine CDM、License policy、设备安全等级、manifest/profile 和输出保护共同决定最终可播放的轨道。

本文对证据作如下分级，避免把推断写成 Netflix 内部事实：

| 标记  | 含义  | 本文示例 |
| --- | --- | --- |
| **公开事实** | 可由项目或标准官方文档验证 | Cromite FAQ 不支持 DRM；EME 只定义 Key System API |
| **工程观察** | 来自本仓库前文或可在授权测试媒体上观察 | 网络/MSE 边界拿到的是加密分片；remux 后仍需密钥 |
| **架构推断** | 根据协议行为和安全目标推导，未声称是生产内部实现 | Netflix 可能关联 CDM、平台、输出和会话遥测做风险决策 |

> 本文写作期间没有在本机完成一次数小时级的 Chromium 全量编译。下面的构建流程来自 Cromite/Bromite 与 Chromium 官方构建资料，并按可复现性重新整理；版本、补丁应用和产物验证步骤均给出，但不把“文档可复现”冒充“本机已经构建成功”。

* * *

## 一、Chrome、Cromite、Bromite 与 Widevine 的真实边界

最容易产生误判的地方，是把“浏览器源码可控”等同于“DRM 信任链可控”。实际架构至少分成四个所有权边界：

| 层   | Chrome/Chromium 中的对象 | 分叉能否直接修改 | 与 Widevine 的关系 |
| --- | --- | --- | --- |
| **Web/浏览器层** | Blink、JS、Fetch、MSE、EME glue、UI、Mojo | 能   | 发起 Key System 协商并承载加密媒体 |
| **媒体能力层** | FFmpeg branding、codec demux/decoder、平台媒体能力 | 能   | 决定能否解析/解码某种格式，不提供内容密钥 |
| **CDM/平台 DRM 层** | Widevine CDM、Android `MediaDrm` 、provisioning | 通常不能由开源分叉重建 | 处理 challenge、License、密钥和解密策略 |
| **服务端授权层** | Netflix MSL、manifest、License policy、账户与设备策略 | 不能  | 决定给什么轨道、什么 License、什么输出限制 |

Chrome 是 Google 发布的产品，Chromium 是其主要开源代码基础。Cromite/Bromite 能修改 Chromium 的浏览器层，但不因此获得 Chrome 发行版附带或集成的专有组件、签名、设备凭据和服务端授权。

### 1.1 Bromite 与 Cromite 不是同一个时代的安全基线

**Bromite** 是 Android Chromium 隐私分叉，提供去 Google 集成、广告过滤、反指纹和媒体相关补丁。其仓库当前 `build/RELEASE` 仍为 `108.0.5359.156` 。它适合用来理解 Cromite 的历史来源和补丁演进，但不应作为 2026 年连接互联网的安全浏览器基线：Chromium 108 与当前浏览器安全修复之间已经有巨大版本差距。

**Cromite** 是延续 Bromite 思路的活跃分叉，覆盖 Android、Linux 和 Windows。本文核验时其 `build/RELEASE` 为 `148.0.7778.168` 。Cromite 不只是“换品牌的 Bromite”：补丁集合、平台范围、构建参数和当前 Chromium API 都已经变化，旧 Bromite 的结论不能直接套用。

尤其需要注意两项公开事实：

-   Bromite 旧 README 中曾有“播放受保护媒体前询问权限”的功能描述，这只能说明历史 UI/权限行为，不能证明当前分叉包含可用 Widevine。
-   [Cromite FAQ](https://github.com/uazo/cromite/blob/master/docs/FAQ.md) 当前直接回答 DRM 支持为 **No**，理由涉及外部 DRM License 是否绑定设备及其删除语义不明确。

因此，把 Cromite 当作“更容易插桩的 Chrome”是合理的研究起点；把它当作“自带可用 Widevine 的开源 Chrome”则是错误前提。

### 1.2 Chrome 下典型的 EME/CDM 进程架构

Chrome 的具体类名和服务拆分会随 Chromium 版本变化，但从公开 EME 接口和 Chromium 多进程模型看，受保护媒体可以按以下稳定职责理解：

```text
Renderer process
  HTMLMediaElement / MSE / EME JavaScript binding
        |
        | Mojo / media IPC
        v
Browser + media service/broker
  Key System capability selection
  CDM creation, origin/profile storage and session routing
        |
        +---------------- desktop ----------------+
        |                                          |
        v                                          v
CDM service / utility process                decoder / GPU path
  Widevine CDM host ABI                       VideoFrame / audio
  challenge, update, key status               protected output

Android path:
  Chromium media bridge -> MediaDrm/Crypto -> MediaCodec secure decoder -> Surface
```

各层的安全职责不同：

| Chrome 侧组件 | 能看到的对象 | 不应直接拥有的对象 |
| --- | --- | --- |
| Renderer | init data、EME event、加密 segment、key status 枚举 | 可导出的 content key |
| Browser/media broker | Key System 配置、origin/session 路由、CDM 生命周期 | 服务端明文密钥 |
| CDM utility/平台 DRM | challenge、License response、受保护 key state、decrypt 请求 | 页面可读的裸 key API |
| Decoder/GPU/Surface | 解密后的压缩 sample 或解码帧，取决于安全等级 | 任意可复制的高价值输出 |

桌面 Chrome 通常通过 CDM host 接口和隔离进程集成 Widevine；Android Chrome 更多依赖系统 `MediaDrm` 、 `MediaCrypto` /Crypto 与 `MediaCodec` 的安全能力。两条路径都不是 Blink 或 FFmpeg 单独完成的。

对 Cromite/Bromite 而言，能够修改的是 renderer、browser/media glue、Mojo 路由和 build flag。若没有被该发行版支持的 Key System 注册、CDM/平台适配、provisioning 和 License 信任，调用链会停在 capability 或 session 初始化阶段。Android 系统里存在 `MediaDrm` API，也不代表任意 Chromium 分叉会自动、完整地把 Widevine 暴露给网页。

* * *

## 二、失败链路总览

下面的架构图按 Cocoon AI 风格的 `architecture-diagram` 规范绘制。左侧是可控的 Chromium 分叉和构建链，中间是浏览器与 DRM 的信任边界，右侧是 Netflix 的控制面、License 和 CDN，底部是四条导出尝试及其失败原因。

*浏览器分叉能控制 EME 调用之前的网页和媒体管线，也能观察进入 MSE 的加密字节；但 CDM、设备身份、License policy 与安全输出位于另一组信任边界中。所有失败路径最终都卡在“没有获得可授权、可使用的内容密钥”。*

* * *

## 三、Cromite 的可复现编译流程

### 3.1 先固定三组版本

Chromium 分叉的构建不能只记录“拉取 master”。至少固定：

```text
Cromite patch commit  -> 决定补丁内容与顺序
build/RELEASE          -> 决定 Chromium 基线 tag
depot_tools revision   -> 决定 fetch/gclient/gn 工具行为
```

建议先记录版本，而不是立刻编译：

```bash
git clone https://github.com/uazo/cromite.git cromite
cd cromite
git checkout <经过审阅的 Cromite commit>

export CROMITE_ROOT="$PWD"
export CROMITE_VERSION="$(tr -d '\n' < build/RELEASE)"
export CROMITE_COMMIT="$(git rev-parse HEAD)"
printf 'version=%s\ncommit=%s\n' "$CROMITE_VERSION" "$CROMITE_COMMIT"
```

本文核验时 `CROMITE_VERSION=148.0.7778.168` ，但长期可复现记录应保存实际 commit，而不是只依赖会移动的 `master` 。

### 3.2 路线 A：使用官方 ready-to-build 容器

这是最稳妥的复现方式。Cromite [HOW_TO_BUILD](https://github.com/uazo/cromite/blob/master/docs/HOW_TO_BUILD.md) 规定镜像格式为：

```text
uazo/cromite-build:(VERSION)-(COMMIT)
```

其中 `COMMIT` 必须取对应 release 描述给出的 Cromite commit。下面保留官方目录约定，但不改写主机的 `HOME` ：

```bash
export CROMITE_VERSION="148.0.7778.168"
export CROMITE_COMMIT="<release 对应的完整 commit>"
export CROMITE_IMAGE="uazo/cromite-build:${CROMITE_VERSION}-${CROMITE_COMMIT}"
export CROMITE_CONTAINER="cromite-build-148"

docker pull "$CROMITE_IMAGE"
docker create --name "$CROMITE_CONTAINER" \
  -e WORKSPACE=/home/lg/working_dir \
  -e TARGET_ISDEBUG=false \
  --entrypoint tail \
  "$CROMITE_IMAGE" -f /dev/null
docker start "$CROMITE_CONTAINER"
docker exec -it "$CROMITE_CONTAINER" bash
```

进入容器后：

```bash
export WORKSPACE=/home/lg/working_dir
export PATH="$WORKSPACE/chromium/src/third_party/llvm-build/Release+Asserts/bin:$WORKSPACE/depot_tools:/usr/local/go/bin:$WORKSPACE/mtool/bin:$PATH"
export CROMITE_ROOT="$WORKSPACE/cromite"
cd "$WORKSPACE/chromium/src"

test -f "$CROMITE_ROOT/build/cromite.gn_args"
TARGET_ISDEBUG=false gn gen \
  --args="target_os = \"android\" $(cat "$CROMITE_ROOT/build/cromite.gn_args") target_cpu = \"arm64\"" \
  out/arm64
gn args out/arm64 --list --short

vpython3 "$WORKSPACE/depot_tools/siso.py" ninja \
  -C out/arm64 chrome_public_bundle --offline
vpython3 "$WORKSPACE/depot_tools/siso.py" ninja \
  -C out/arm64 chrome_public_apk --offline
```

这与当前 Cromite release workflow 的 Android ARM64 路径一致：先生成 `out/arm64` ，再分别构建 bundle 与 APK。标准 Android Chromium APK 目标是 `chrome_public_apk` ；可用 `gn ls out/arm64 '*chrome*apk*'` 核对该版本的实际目标名。普通 Chromium 环境也可用 `autoninja -C out/arm64 chrome_public_apk` ，而官方容器使用 Siso 的 offline Ninja 前端以贴合 CI。

常见产物位置：

```text
out/arm64/apks/ChromePublic.apk
out/arm64/bin/chrome_public_apk
out/arm64/args.gn
```

验证重点不是只看 Ninja 返回 0，还要保存：

```bash
gn args out/arm64 --list --short
sha256sum out/arm64/apks/ChromePublic.apk
out/arm64/bin/chrome_public_apk install
```

### 3.3 路线 B：从 Chromium 基线手工应用补丁

手工路线更适合审计补丁影响，但更容易因 Chromium/depot_tools 漂移失败。先按 [Chromium Android build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/android_build_instructions.md) 准备 `depot_tools` 和源码，再切换到 `build/RELEASE` 指定的 tag：

```bash
mkdir chromium-work
cd chromium-work
fetch --nohooks android
cd src
git fetch --tags
git checkout "$CROMITE_VERSION"
gclient sync -D --with_branch_heads --with_tags
```

Cromite 要求按 `build/cromite_patches_list.txt` 顺序应用 patch。这个文件可能同时包含空白和注释，解析时先去掉 `#` 后内容，再按空白切分：

```bash
cd "$WORKSPACE/chromium/src"
sed 's/#.*//' "$CROMITE_ROOT/build/cromite_patches_list.txt" \
  | tr -s '[:space:]' '\n' \
  | while IFS= read -r patch; do
      [ -z "$patch" ] && continue
      git am --3way "$CROMITE_ROOT/build/patches/$patch" || exit 1
    done
```

任何 patch 冲突都意味着“版本/commit/工具链至少有一项不匹配”。不应跳过失败 patch 后继续编译，因为很多后续 patch 依赖前面的 API、branding 或 build flag。

### 3.4 生成 Android ARM64 配置

先写目标平台，再追加该版本自带的官方参数。顺序很重要： `cromite.gn_args` 内部包含 `if (target_os == "android")` 等条件块；如果把 `target_os` 写在文件末尾，Android 专用 package、PGO 和 debug 配置不会在解析条件时生效。

```bash
cd "$WORKSPACE/chromium/src"
mkdir -p out/CromiteArm64
printf 'target_os="android"\ntarget_cpu="arm64"\n' > out/CromiteArm64/args.gn
cat "$CROMITE_ROOT/build/cromite.gn_args" >> out/CromiteArm64/args.gn

TARGET_ISDEBUG=false gn gen out/CromiteArm64
gn args out/CromiteArm64 --list --short
autoninja -C out/CromiteArm64 chrome_public_apk
```

Chromium 的 ABI 映射为：

| Android ABI | `target_cpu` |
| --- | --- |
| `arm64-v8a` | `arm64` |
| `armeabi-v7a` | `arm` |
| `x86` | `x86` |
| `x86_64` | `x64` |

研究 EME/媒体调用时可使用独立 debug 输出目录，避免覆盖 release 参数：

```bash
mkdir -p out/CromiteArm64Debug
printf 'target_os="android"\ntarget_cpu="arm64"\n' > out/CromiteArm64Debug/args.gn
cat "$CROMITE_ROOT/build/cromite.gn_args" >> out/CromiteArm64Debug/args.gn
TARGET_ISDEBUG=true gn gen out/CromiteArm64Debug
autoninja -C out/CromiteArm64Debug chrome_public_apk
```

注意：Cromite 参数本身会读取 `TARGET_ISDEBUG` ，并联动 `is_debug` 、 `is_official_build` 、 `dcheck_always_on` 、符号与静态分析配置。应在执行 `gn gen` 时设置该环境变量，不要再在文件末尾叠加互相矛盾的 debug 参数。

### 3.5 Linux 与 Windows 目标

Linux x64 的核心目标通常是 `chrome` ：

```bash
mkdir -p out/CromiteLinux
printf 'target_os="linux"\ntarget_cpu="x64"\n' > out/CromiteLinux/args.gn
cat "$CROMITE_ROOT/build/cromite.gn_args" >> out/CromiteLinux/args.gn
gn gen out/CromiteLinux
autoninja -C out/CromiteLinux chrome
```

Windows 版使用 Linux 交叉构建时，还需要 Cromite `tools/images/win-sdk/prepare.sh` 所描述的 Windows SDK 准备流程。它不是简单把 `target_os` 改为 `win` ：SDK、toolchain、PGO 数据和签名/打包都要与 release workflow 对齐。对本文的 Widevine 结论而言，换成 Windows 目标不会自动补上专有 CDM。

* * *

## 四、Cromite GN 参数逐组说明

完整参数应以当前 commit 的 [`build/cromite.gn_args`](https://github.com/uazo/cromite/blob/master/build/cromite.gn_args) 为准。下面只列安全和媒体分析最相关的组。

### 4.1 构建形态

| 参数  | 当前典型值 | 作用  |
| --- | --- | --- |
| `is_component_build` | `false` | 生成更接近正式发布的非 component 构建 |
| `is_debug` | `false` | 关闭 debug 构建 |
| `is_official_build` | `true` | 启用 official build 路径和发布优化语义 |
| `symbol_level` | Android `1` ，桌面 `0` | 控制调试符号量，不改变 DRM 授权 |
| `chrome_pgo_phase` | 支持目标为 `2` | 使用 PGO 优化；要求相匹配的 profile 数据 |
| `treat_warnings_as_errors` | `true` | 警告视为错误，减少补丁静默漂移 |

`is_official_build=true` 的名字很容易误导。它表示 Chromium 的构建模式，不代表该二进制变成 Google Chrome，也不授予 Google API key、Widevine CDM 或 Netflix 支持资格。

### 4.2 媒体与 codec

| 参数  | 值   | 实际作用 |
| --- | --- | --- |
| `proprietary_codecs` | `true` | 允许构建 Chromium 默认未启用的专有 codec/container 路径 |
| `ffmpeg_branding` | `"Chrome"` | 选择 FFmpeg 的 Chrome codec 配置 |
| `enable_av1_decoder` | `true` | 启用 AV1 解码路径 |
| `enable_dav1d_decoder` | `true` | 启用 dav1d AV1 decoder |
| `enable_platform_h264_video` | Android/Windows `true` | 使用平台 H.264 能力 |
| `enable_platform_aac_audio` | Android/Windows `true` | 使用平台 AAC 能力 |
| `enable_platform_hevc` | Android/Windows `true` | 启用平台 HEVC 路径 |
| `enable_platform_encrypted_dolby_vision` | `false` | 不构建对应加密 Dolby Vision 平台路径 |

这组参数解决的是“拿到明文样本后能否解析和解码”。Widevine 解决的是“谁有权把加密样本变成明文样本”。二者在媒体管线中相邻，但不是同一能力。

### 4.3 Google 集成、隐私与安全

| 参数/补丁 | 含义  | 对 DRM 的影响 |
| --- | --- | --- |
| `use_official_google_api_keys=false` | 不使用 Google 官方 API key | 不会因此获得 Chrome 服务身份 |
| `Remove-binary-blob-integrations.patch` | 移除部分二进制 blob 集成 | 进一步说明分叉不等于 Chrome 完整发行物 |
| `Disable-DRM-media-origin-IDs-preprovisioning.patch` | 禁用 DRM media origin ID 预配置 | 是隐私取向，不是 DRM 解锁开关 |
| `enable_request_header_integrity=false` | 关闭 Google Request Header Integrity | 不替代 CDM challenge/License 验证 |
| `enable_bound_session_credentials=false` | 关闭浏览器绑定会话凭据能力 | 与 Widevine 设备 provisioning 不是同一层 |

Windows 当前参数还设置 `is_cfi=false` 、 `use_cfi_cast=false` ，而旧 Bromite Android 参数使用 `is_cfi=true` 、 `use_cfi_cast=true` 。这说明两个项目不能只凭名称继承安全评价：必须按平台、版本和实际 GN 输出审计。

* * *

## 五、Bromite 的历史构建方式与风险

Bromite 的构建模型与 Cromite 相同：

```text
Chromium RELEASE tag
  + build/bromite_patches_list.txt 中的有序补丁
  + build/bromite.gn_args
  -> GN
  -> Ninja
  -> Android APK / WebView
```

历史复现可按以下步骤进行：

```bash
git clone https://github.com/bromite/bromite.git bromite
cd bromite
git checkout <需要研究的 Bromite commit 或 tag>
export BROMITE_ROOT="$PWD"
export BROMITE_VERSION="$(tr -d '\n' < build/RELEASE)"

# 在匹配的 Chromium src 根目录中按顺序应用补丁
grep -v '^[[:space:]]*#' "$BROMITE_ROOT/build/bromite_patches_list.txt" \
  | while IFS= read -r patch; do
      [ -z "$patch" ] && continue
      git am --3way "$BROMITE_ROOT/build/patches/$patch" || exit 1
    done

mkdir -p out/BromiteArm64
printf 'target_cpu="arm64"\n' > out/BromiteArm64/args.gn
cat "$BROMITE_ROOT/build/bromite.gn_args" >> out/BromiteArm64/args.gn
gn gen out/BromiteArm64
autoninja -C out/BromiteArm64 chrome_public_apk
```

旧参数中的关键项包括：

```gn
target_os = "android"
is_official_build = true
is_component_build = false
proprietary_codecs = true
ffmpeg_branding = "Chrome"
enable_mse_mpeg2ts_stream_parser = true
enable_platform_hevc = true
is_cfi = true
use_cfi_cast = true
use_official_google_api_keys = false
```

这些参数仍然没有声明或实现 Widevine CDM。 `all codecs included` 、protected-media UI 和 DRM preprovisioning 补丁也不能证明存在可授权的 `com.widevine.alpha` 实现。

安全上更严重的问题是版本老化：本文核验到 Bromite 基线为 Chromium 108。即使历史 APK 能启动，它也不应被用于登录真实账户、加载不受信任网页或作为 Netflix 研究环境。合理用途是离线补丁考古、源码差分和构建系统研究。

* * *

## 六、失败尝试复盘

### 6.1 尝试一：打开 proprietary codecs

**假设：** H.264/AAC/HEVC 能力打开后，Netflix 页面就会把浏览器视为 Chrome。

**结果：** 只解决 codec capability，不解决 Key System。EME 标准把 `requestMediaKeySystemAccess()` 作为选择内容解密系统的入口； [W3C EME](https://www.w3.org/TR/encrypted-media-2/) 也明确说明 EME 不是 DRM 系统本身，除 Clear Key 基线外，实现其他 DRM 不是规范强制要求。

**失败原因：** codec 是解码明文压缩数据的能力；CDM 是获取和使用内容密钥的受控组件。前者不能代替后者。

### 6.2 尝试二：把 User-Agent 和能力声明伪装成 Chrome

**假设：** 修改 UA、codec 列表或 manifest profile 请求即可获得 Chrome 轨道。

**结果：** 客户端声明可能影响网页前端分支或 manifest 候选，但不能创建真实 CDM、设备 provisioning、可接受的 License challenge 或对应输出保护。

**失败原因：** Netflix 公开的 [浏览器支持矩阵](https://help.netflix.com/en/node/30081) 列出 Chrome、Edge、Firefox、Opera、Safari 等产品，Cromite/Bromite 不在支持列表中。“Blink 行为相似”与“受支持且能完成 DRM 授权”是两件事。

### 6.3 尝试三：在 Fetch/MSE 前导出媒体分片

**假设：** 浏览器必须下载视频，抓到响应 body 或 `SourceBuffer.appendBuffer()` 参数就等于拿到视频。

**结果：** 可以观察或导出的通常是 CENC 加密 fMP4。容器中可能仍有 `pssh` 、 `tenc` 、 `senc` 、 `saiz` 、 `saio` 等加密相关 box，但媒体 sample 不是明文。

**失败原因：** MSE 负责时间线和 buffer，EME/CDM 负责受控解密。网络层和 MSE 输入位于 CDM 之前，导出的正是被设计为可公开缓存和传输的密文。

### 6.4 尝试四：直接拼接音视频分片

**假设：** 将 init segment 和 media segments 按顺序拼接，再交给 FFmpeg remux，即可生成 MP4。

**结果：** 容器结构可能被修复，音视频时间戳也可能被重新组织，但 sample 仍然加密。播放器会继续要求 Key System 或报解码错误。

**失败原因：** remux 只改变封装，不执行被授权的 CENC 解密。轨道选择、ABR 切换、时间戳、音视频同步确实是合成问题，但它们都排在密钥问题之后。

### 6.5 尝试五：修改 EME glue 或跳过网页检查

**假设：** Cromite 源码可控，可以让 `requestMediaKeySystemAccess()` 假装成功。

**结果：** 伪造 JavaScript/浏览器层返回值最多创建一个“接口看似存在”的状态；后续 `MediaKeys` 、session message、License update、decrypt 和 key status 仍需要真实 CDM 状态机。

**失败原因：** EME 是控制接口，不是解密实现。跳过前端检查只会把失败点从 capability negotiation 推迟到 session 或 decrypt。

### 6.6 尝试六：从解密后输出边界导出

**假设：** 合法播放最终必须出现明文帧，因此可在 decoder/GPU/Surface 之前导出。

**结果：** 这是理论上唯一跨过“加密分片”问题的方向，但 Cromite 当前因无 DRM 支持，实验并未到达该阶段。即使在有 DRM 的平台上，安全级别、secure decoder、Surface、GPU 和 HDCP 策略也可能限制明文 CPU 可见性。

Android [`MediaDrm`](https://developer.android.com/reference/android/media/MediaDrm) 将安全能力区分为软件安全加密、软件安全解码、硬件安全加密、硬件安全解码和 `HW_SECURE_ALL` 。最高等级下，密钥管理、密码运算、解码及压缩/未压缩媒体处理都可位于硬件支持的可信执行环境中。降低安全等级以操纵解密帧，通常又会被 License policy 限制到更低分辨率。

**失败原因：** 浏览器层可修改不代表安全解码输出对 CPU 可读；而当前 Cromite 路线甚至没有建立 Widevine 会话。

* * *

## 七、Netflix 如何分层设计与保护

### 7.1 控制面：Web Player 与 MSL

Netflix Web Player 负责登录态、设备/浏览器能力收集、播放会话、manifest 请求和 License 流程编排。本仓库的 [Netflix MSL 协议分析](https://overkazaf.github.io/blogs/posts/netflix-msl-protocol-reverse-engineering/) 已说明：MSL 可以为控制消息提供实体认证、用户绑定、加密、完整性和可选防重放，但安全性取决于认证机制、密钥存放和服务端状态。

MSL 的作用不是直接加密每个视频 sample。它保护的是“谁在请求什么播放上下文、manifest 或 License 相关消息”，媒体数据本身通常由 CENC + CDM 链路保护。

### 7.2 能力面：manifest/profile 不是单一真值

Netflix 可以根据浏览器、OS、codec、分辨率、HDR、DRM robustness 和输出能力选择候选轨道。客户端 profile 声明是输入之一，但服务端不应把它当成唯一可信事实。

**架构推断：** 生产系统很可能将客户端声明与 CDM challenge、License 请求、平台能力、账户策略和播放遥测做一致性检查。本文没有 Netflix 内部实现证据，因此只把这种联动作为符合安全目标的推断，而非已证实字段级规则。

### 7.3 Key System：EME 只负责接线

页面通过 EME 请求 `com.widevine.alpha` ，浏览器检查候选 codec、session type、robustness 和 distinctive identifier/persistent state 等要求，再交给 CDM。此处至少有三种独立失败：

```text
浏览器没有注册 Widevine Key System
CDM 存在但版本/ABI/平台集成不匹配
CDM 能启动但设备 provisioning 或 License 被拒绝
```

因此，“把某个二进制放进目录”或“让接口返回 true”都不足以形成完整信任链。

### 7.4 License 与设备能力

CDM 生成的 challenge 可以携带实现和设备相关的受保护信息；License server 根据内容、账户、设备和策略返回 CDM 可消费的响应。Android 官方文档明确说明 provisioning server 可分发设备唯一凭据，设备 DRM 插件也暴露安全等级和 HDCP 等能力。

这解释了为什么浏览器 fork 不能只复制网络请求：License 不是通用内容密钥文件，而是发给特定 DRM 会话和策略环境的数据。

### 7.5 数据面：CDN 可以公开分发密文

Netflix CDN 的核心任务是高效分发 init segment 和加密媒体 segment。因为 CENC sample 在离开 CDN 时已经是密文，缓存、分片抓取和多 CDN 传输不需要信任终端网络。

这一设计把“可扩展分发”与“授权解密”解耦：攻击者拿到全部分片并不等于拿到播放权。也正因如此，网络导出在工程上可以成功，而内容导出仍失败。

### 7.6 解密、解码与输出保护

License 成功后，CDM 将 key status 与 session 关联，并按 CENC subsample 信息解密。高价值轨道还可能要求更强 robustness、secure decoder 或输出保护。EME 规范允许 key 因输出限制而处于不可用状态；Android 的安全级别也表明“可解密”不等于“明文帧可由普通应用内存读取”。

因此 Netflix 的防护不是一堵墙，而是串联约束：

```text
账户/会话
  -> MSL 控制消息
  -> manifest/profile 筛选
  -> EME Key System
  -> CDM/设备 provisioning
  -> License policy
  -> CENC 解密
  -> secure decode / output policy
```

只修改其中一个客户端字段，不能同时满足后面的约束。

* * *

## 八、从安全角度评估这套设计

### 8.1 防守优势

| 设计  | 防住的低成本路径 | 安全价值 |
| --- | --- | --- |
| 控制面与数据面分离 | 只抓 API 或只抓 CDN | 必须同时理解会话授权与媒体加密 |
| EME/CDM 边界 | JS/浏览器源码级修改 | 内容密钥不直接暴露给页面 |
| 设备 provisioning | 复制请求、复制简单配置 | 将 License 使用绑定到 DRM 实现和设备状态 |
| CENC 分片 | 网络/MSE 导出 | 抓到完整媒体仍只是密文 |
| robustness/输出策略 | 降级到可读明文路径 | 高价值轨道可要求更强安全能力 |
| 服务端 profile 策略 | 单一 UA/codec 伪装 | 分辨率和轨道选择可与授权能力联动 |

### 8.2 仍然存在的固有边界

DRM 无法消除“授权播放最终产生声音和图像”这一事实。软件安全等级下，明文边界通常更接近可控用户态；硬件安全等级能把边界推向 TEE、secure decoder 和受保护 Surface，但不能改变最终必须显示给用户的语义。

这意味着安全目标应表述为：

-   提高可复用内容密钥的提取成本；
-   限制高价值轨道只在更强输出链上播放；
-   让客户端篡改需要同时跨越浏览器、CDM、设备和服务端策略；
-   通过会话、并发、异常请求和遥测控制大规模滥用。

它不是“数学上保证任何终端都无法录制”。模拟输出、屏幕采集、受攻陷终端和实现漏洞仍属于残余风险，只是质量、规模和自动化成本不同。

### 8.3 对 Cromite/Bromite 路线的最终判断

| 目标  | Cromite/Bromite 是否有帮助 | 判断  |
| --- | --- | --- |
| 研究 Chromium 的 Fetch/MSE/EME glue | 有   | 源码与补丁可控，适合做调用链观测 |
| 验证 codec/container 能力 | 有   | GN 参数和平台 decoder 可调整 |
| 获得 Chrome 同等 Widevine 身份 | 没有自然路径 | 开源分叉不包含完整专有信任链 |
| 导出 Netflix 网络分片 | 技术上可观察 | 得到的是 CENC 密文，不等于视频明文 |
| 直接合成可播放普通视频 | 失败  | 缺少经授权解密后的 sample |
| 作为当前安全浏览器 | Cromite 可评估；Bromite 不推荐 | Bromite 基线过旧，Cromite 仍需按版本审计 |

* * *

## 九、合规的复现实验建议

要验证本文的媒体管线结论，不需要也不应使用未授权的 Netflix 内容或尝试提取生产内容密钥。可以建立三组对照：

1.  **普通 MP4/WebM**：验证 Fetch -> MSE -> decoder -> frame 的基本链路。
2.  **自有 Clear Key CENC 测试资产**：验证 `pssh` /init data、EME session、License response、加密分片和授权解密。
3.  **Cromite 的 Widevine capability probe**：只检查 Key System 是否可用，不访问第三方受保护内容。

最小能力探测：

```javascript
async function probeWidevine() {
  try {
    const access = await navigator.requestMediaKeySystemAccess(
      "com.widevine.alpha",
      [{
        initDataTypes: ["cenc"],
        videoCapabilities: [{
          contentType: 'video/mp4; codecs="avc1.42E01E"'
        }]
      }]
    );
    return { supported: true, config: access.getConfiguration() };
  } catch (error) {
    return { supported: false, name: error.name, message: error.message };
  }
}
```

这个探测只回答“浏览器是否能提供候选 Key System 配置”，不证明某个商业服务会签发 License，也不尝试绕过任何授权。

* * *

## 十、结论

Cromite/Bromite 的价值在于让 Chromium 浏览器层可审计、可修改、可构建；它们不是 Widevine 的开源替代品，也不是 Chrome DRM 信任链的后门。

这次失败复盘最重要的技术结论有三个：

1.  **编解码能力与 DRM 能力必须分开验证。** `ffmpeg_branding="Chrome"` 能改变 codec 配置，但不会创建 `com.widevine.alpha` 、设备证书或 License 权限。
2.  **流导出成功不等于内容导出成功。** Fetch/MSE 前的分片本来就可以被缓存和复制，安全性建立在 CENC 密文和 CDM 授权解密上。
3.  **Netflix 的保护是跨层组合。** MSL 管控制消息，EME 负责标准接线，Widevine/平台 DRM 管密钥和安全级别，License/manifest 管服务端策略，secure decode/output 管明文边界。

所以失败不是出在 FFmpeg 命令不够复杂，也不是视频合成参数不正确。真正的断点是： **浏览器分叉没有获得一个被平台和服务端共同认可、能够消费 License 并输出合规明文样本的 DRM 会话。**

* * *

## 参考资料

-   [Cromite repository](https://github.com/uazo/cromite)
-   [Cromite: How to build](https://github.com/uazo/cromite/blob/master/docs/HOW_TO_BUILD.md)
-   [Cromite release build workflow](https://github.com/uazo/cromite/blob/master/.github/workflows/build_cromite.yaml)
-   [Cromite FAQ](https://github.com/uazo/cromite/blob/master/docs/FAQ.md)
-   [Cromite GN args](https://github.com/uazo/cromite/blob/master/build/cromite.gn_args)
-   [Bromite repository and build notes](https://github.com/bromite/bromite)
-   [Bromite GN args](https://github.com/bromite/bromite/blob/master/build/bromite.gn_args)
-   [Chromium Android build instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/android_build_instructions.md)
-   [W3C Encrypted Media Extensions](https://www.w3.org/TR/encrypted-media-2/)
-   [Android MediaDrm](https://developer.android.com/reference/android/media/MediaDrm)
-   [Android MediaCodec](https://developer.android.com/reference/android/media/MediaCodec)
-   [Netflix supported browsers and system requirements](https://help.netflix.com/en/node/30081)

## 免责声明

本文仅用于浏览器、DRM 架构和防护边界研究。所有验证应针对自有、授权或公开测试内容进行。请遵守适用法律、服务条款、版权和访问控制要求。
