---
title: 【微信】25个包管理器只有2个逐包验完整性：Trail of Bits实测恶意仓库注入全链
source: https://mp.weixin.qq.com/s/BbkpKvmbr4fk-bDErgabfg
source_host: mp.weixin.qq.com
clip_date: 2026-11-23T04:38:10+08:00
trace_id: a0f9fcd7-9d45-45f0-ba60-affd425f00ac
content_hash: 1587d4c910d8ce9072994dac152ad90137c271006947c450c5c72b35d6e09dd9
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42075244-d011-81ff-82ad-dca383a75b53
ioc:
  cves: []
  cwes: []
  hashes:
    - 9b129329f58692f6e6578329498a8fe9fbe98f090beb764ffbb8ee2eadd01dcd
    - b094ded77ee97a6027ad6cf0e8c7b9f88381814c
    - cac0f6daea041b0ccf42934163defb20
    - d88e31b84d65e754935053b1c584ea8e2320698a
  domains: []
  tools: []
  techniques: []
---

**赛博生存指南** *2026年11月19日 10:58*

> 原文：https://blog.trailofbits.com/2026/10/14/package-managers-have-an-integrity-problem/  
> 作者：Keegan Ryan（Trail of Bits）  
> 发布时间：2026-10-14  
> 翻译模型：GLM-5.3  
> 质量评分：★★★★½（4.5/5） ｜ 标签：供应链安全 · 密码学应用 · 分析工具与方法论

**AI 摘要**：Trail of Bits 用 Docker＋mitmproxy 搭了一套「恶意包仓库」测试管线，对 25 个主流包管理器逐个实测：仓库被攻陷后往合法包里注入恶意代码，能否被拦截。结果只有 Go 和 vcpkg 对每个下载的包都验证完整性；不到一半在 lockfile 存在时默认防篡改；签名验证默认开启的只有 Go 一个。文中拆了四种「有哈希但不防篡改」的设计（Pub 哈希不匹配照装、pnpm 11.4 之前覆写 lockfile、Conan 用 MD5 当 ID、CocoaPods/Composer 的哈希锁不住分发内容），并给出「lockfile 锁签名者身份而非包哈希」的改进方向。

这是那种「结论一张表、正文全是证据」的文章。供应链主题本仓库译介过多次，但多数停在事件层；这篇补上了底层一环——包管理器的密码学设计到底防不防得住「仓库本身作恶」。实验方法值得注意：不是读文档打分，而是真的架了 mitmproxy 中间人往包里塞恶意代码，看样例工程会不会执行。25 个管理器横跨 JS/Python/Rust/Java/PHP/C++/Ruby/Perl/R/PowerShell 生态，两张总表直接可查自家在用的工具落在哪一档。

## 译文

我测试了 25 个最流行的包管理器，检验它们能否发现被攻陷的包仓库往合法包里注入恶意代码。这个代码完整性问题可以用密码学哈希或签名解决，但很多包管理器面对这种威胁仍然不设防。在这 25 个包管理器里，默认用 lockfile 检查篡改的不到一半，对每个下载的包都验证完整性的只有两个。

开发者被攻陷导致的供应链攻击是老生常谈，但想象一下：如果现有的缓解措施（包括 Trail of Bits 自己的工作）成功了会怎样？如果热门包的开发者不再是最容易的目标，攻击者就会转向系统里下一个最薄弱的环节：分发代码的包仓库。这个问题的密码学解法比表面看起来微妙得多，许多实现因为刻意的设计取舍、资源优先级排序、或者「对开发者友好」方案的复杂性而打了折扣。

一个自然的答案是把包内容的密码学哈希写进 lockfile，下载后比对。我测试的包管理器里约一半默认这么做，但其余的要么需要额外配置才会包含或验证这些哈希，要么以密码学上不安全的方式使用哈希，要么根本没有哈希。汇总如下表：

|     |     |
| --- | --- |
| **验证完整性** | Go、vcpkg |
| **有 lockfile 时验证** | Bun、Bundler、Cargo、npm、pnpm、Poetry、SwiftPM、uv、Yarn |
| **lockfile＋额外步骤才验证** | Conda、Gradle、Pip、NuGet、Pub |
| **有 lockfile 也不验证 / 不适用** | CocoaPods、Composer、Conan、cpanminus、Gem、Maven、PowerShellGet、PSResourceGet、R |

*表 1：包管理器从恶意仓库拉依赖时基于 lockfile 的安全性，按「开发者要花多少功夫才能获得完整性」分类。针对特定配置做了实验验证，注意事项见下文。*

另一个自然思路是用签名，避免为每个包安全分发一个哈希。但我的测试里，默认验证签名的只有 Go；其他管理器要么需要额外配置，要么缺验证代码，要么根本不支持签名。

|     |     |
| --- | --- |
| **验证签名** | Go  |
| **配置后验证** | Bundler、Gem、Gradle、Maven、npm、NuGet |
| **验证缺失或不完整** | Bun、cpanminus、Pip、pnpm、Poetry、PowerShellGet、PSResourceGet、uv、Yarn |
| **没有签名可验证** | Cargo、CocoaPods、Composer、Conan、Conda、Pub、R、SwiftPM、vcpkg |

*表 2：各包管理器基于签名的安全性。同样经过实验验证，注意类似的注意事项。*

两张表都显示，密码学设计和防护水平的差异大得惊人。尽管困难重重，我也看到若干社区正站在这件事的前沿，把更好的设计逐步落地。本文探讨这些差异：某些设计在哪里掉了链子、为什么代码完整性比看起来难解、未来可能采纳什么样的密码学设计。

## 模拟恶意包仓库

研究 25 个包管理器的密码学行为是个不小的挑战。我想尽量少做人工分析，同时在断言「恶意包仓库的攻击可行」时有百分之百的把握。为此我搭了一套基于 Docker 容器和 mitmproxy 的测试管线，动态评估包管理器面对恶意服务器的安全性。

![测试管线实验设计：Docker 容器内的包管理器经 WireGuard 网络把请求路由到 mitmproxy 插件](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ea7101f481e43010.jpg)

Ubuntu 基础的 Docker 镜像里装有包管理器、样例代码，以及可选的 lockfile。lockfile 是否应该提交进源码仓库一直有争议，所以两种配置我都测了。管线指示包管理器从仓库拉依赖，产生的网络请求经 WireGuard 网络路由到一个定制的 mitmproxy 插件。

由于 Docker 镜像里装了 mitmproxy 的 TLS CA 证书，插件可以完全操纵包仓库返回的明文，模拟被攻陷的服务器。我假设任何面向 Web 的服务器都可能被攻陷（比如 Composer 从 Packagist 取元数据、从 GitHub 取包），但后端资源（例如私有签名密钥）保持安全。模拟仓库把恶意代码嵌入下载的包，如果样例代码执行了这段恶意软件，攻击即成功。

我尽量让实验设置贴近真实用法，但存在局限。我安装最新的包管理器版本、按快速上手指南在容器里搭样例工程、从公开仓库选热门包来感染。包管理器命令都用默认 flag 运行，以此判断是否需要额外步骤（改工程清单、跑额外命令）才能强制密码学完整性。不过，我只能对单一平台上的单一包管理器版本测试单一包，某些测试条件（比如 Ubuntu 上跑 PowerShell 和 CocoaPods）未必代表最常见的使用形态。这套设置不是要证明每个开发者都暴露于恶意包仓库，而是要证明一个遵循合理惯例的开发者是暴露的。

包管理器装好、网络拦截就位后，一个（大体上）令人欣慰的观察就出现了。

### HTTPS（几乎）无处不在

我们的管线架构截获全部网络流量，所以很容易验证包管理器是否用 TLS、是否校验证书。几乎所有的包管理器都做到了。

例外是 cpanminus——Perl 生态里常被推荐的包管理器。cpanminus 默认用未加密的 HTTP 连接 Perl 包仓库，任何主动网络攻击者都能往下载的包里注入恶意代码。这个漏洞已知多年，但 cpanminus 的开发者没有切换到 HTTPS，因为那会破坏默认行为的兼容性。

## 哈希不一定带来完整性

用 mitmproxy 插件改写包仓库的响应后，我得以研究各包管理器如何使用密码学哈希。哈希是确保下载文件未被篡改的天然手段，但关键问题是：包管理器从哪里获知正确的哈希？

微软面向 C/C++ 库的 vcpkg 是个有意思的例子。vcpkg 的源码里包含数千个依赖的内容哈希。开发者更新库、想把新内容登记进 vcpkg 时，重新计算包哈希并向 vcpkg 源码提一个带新哈希和包链接的 pull request。vcpkg 下载包时会校验哈希。只要包管理器本身可信，这套方案对恶意包仓库是完全安全的。

### lockfile 里的哈希

更常见的情况是包管理器通过 lockfile 获知正确的哈希。lockfile 通常由包管理器创建、与工程源码放在一起、锁定工程所需的依赖版本。如果开发者把带密码学哈希的 lockfile 提交进源码仓库，而用户的包管理器对照哈希验证下载的包，那么用户的依赖就与开发者的完全一致。

JavaScript 包管理器 Bun 就是这样工作的。 `bun add` 安装包时更新 `bun.lock` ；把 lockfile 提交进 Git，在仓库的另一份拷贝上执行 `bun install` ，就会把 lockfile 里的哈希与新拉取的依赖比对。npm、pnpm、Yarn（同为 JavaScript 包管理器）、uv 和 Poetry（Python）、Bundler（Ruby）、Cargo（Rust）、SwiftPM（Swift）行为类似。

另一些包管理器支持 lockfile，但比标准的 add/restore 流程多几个步骤。Python 的 Pip 对 `pylock.toml` 格式有实验性支持，Conda 有可选的 Conda lock 库。.NET 的 NuGet 要在工程里加 `RestorePackagesWithLockFile` 属性才生成 lockfile。

许多包管理器（Maven、R、PowerShellGet、PSResourceGet、cpanminus）没有专门的 lockfile，还有一些虽有 lockfile（Gradle 的 `gradle.lockfile` 、Gem 的 `Gemfile.lock` ）但里面不含哈希。

### 有哈希，但不用于完整性

出人意料的是，我发现了几个 lockfile 里有哈希、却仍会被恶意服务器攻陷的例子。这不一定算漏洞，因为底层行为有明确文档，但它说明关于 lockfile 该长什么样、该被怎么消费，业界存在多种同样成立的意见。而习惯了某个包管理器行为的用户，换到另一个时可能会大吃一惊。

第一个例子是 Dart 和 Flutter 的 Pub。下面这段 `pubspec.lock` 包含 `uuid` 包的 SHA-256 哈希：

```yaml
uuid:
  dependency: "direct main"
  description:
    name: uuid
    sha256: "9b129329f58692f6e6578329498a8fe9fbe98f090beb764ffbb8ee2eadd01dcd"
    url: "https://pub.dev"
  source: hosted
  version: "4.6.0"
```

用户执行 `flutter pub get` 拉依赖时，Pub 从 `pub.dev` 服务器下载包并计算返回二进制文件的哈希。不匹配的话 Pub 会报错——但照样安装：

```
The existing content-hash from pubspec.lock doesn't match contents for:
 * uuid-4.6.0 from "https://pub.dev"

This indicates one of:
 * The content has changed on the server since you created the pubspec.lock.
 * The pubspec.lock has been corrupted.

The content-hashes in pubspec.lock has been updated.
```

这是文档写明的行为，需要非默认的 `--enforce-lockfile` 选项才会阻止安装。

哈希不匹配时覆写 lockfile，也是 pnpm 到 2026 年 5 月的 11.4 版为止的默认行为，彼时为堵住「供应链漏洞」而修改。与 Pub 一样，pnpm 也支持非默认的 `--frozen-lockfile` 标志，表示此前覆写 lockfile 的行为是符合预期的。

再看 Conan（C/C++ 包管理器）的 `conan.lock` 片段：

```
"requires": [
    "zlib/1.3.1#cac0f6daea041b0ccf42934163defb20%1765284699.337"
],
```

这串包含包名（ `zlib` ）、版本号（ `1.3.1` ）、recipe revision `cac0f6daea041b0ccf42934163defb20` 和一个时间戳。128 位的 revision 是包含源代码的 MD5 哈希，但它的设计意图不是密码学安全，而是当唯一标识符用。Conan 用这个 lockfile 安装依赖时，按 recipe revision 哈希从 ConanCenter 仓库下载特定文件，却不会重新计算 recipe 哈希。就算重算，平台相关二进制还有另一个不进 lockfile 的 package revision 哈希，而且 MD5 碰撞能让攻击者造出两个行为不同、哈希相同的 recipe。

Swift 和 Objective-C 的 CocoaPods 是类似套路。这是使用 `Files` 依赖的工程里 `Podfile.lock` 的一段：

```
SPEC CHECKSUMS:
  Files: d88e31b84d65e754935053b1c584ea8e2320698a
```

这个 160 位校验和是 Files 的 Podspec 的 SHA-1 哈希，而 Podspec 里有指向源码的链接。CocoaPods 用这个链接拉取 Git 仓库：

```css
"source": {
    "git": "https://github.com/johnsundell/files.git",
    "tag": "4.0.2"
},
```

所以 lockfile 固然能防止 Podspec 里的 GitHub URL 被篡改（先不论代价高昂的 SHA-1 碰撞攻击），但被攻陷的 GitHub 服务器完全可以用同一个 tag 提供恶意版本的仓库。

最后，PHP 的 Composer 在 `composer.lock` 里包含 commit 哈希：

```
"dist": {
    "type": "zip",
    "url": "https://api.github.com/repos/guzzle/psr7/zipball/b094ded77ee97a6027ad6cf0e8c7b9f88381814c",
    "reference": "b094ded77ee97a6027ad6cf0e8c7b9f88381814c",
    "shasum": ""
},
```

尽管 `b094ded...` 这个 commit 哈希唯一标识代码，但 URL 里的 ZIP 压缩包并不内嵌 Git tree 供验证这个哈希。GitHub 照样可以神不知鬼不觉地提供恶意 ZIP，Composer 察觉不到。

### lockfile 在供应链完整性之外还有很多角色

前面的实验结果显示，lockfile 哈希往往 **可以** 用来强制包完整性，但这既不是它唯一的、甚至不是它最初的目的。它还可以把依赖锁定在特定功能上、让应用开发者方便地共享一致环境、或者支撑可复现构建。用供应链安全的视角审视包管理器 lockfile 是一种新近的解读，有时会与它们的原始设计相冲突。pnpm 改 `--frozen-lockfile` 行为就是一例。

这种张力的另一个例子是 lockfile 该不该提交进版本控制。多数现代指南建议应用提交 lockfile，因为最终构建环境完全可控。库的问题更复杂：包管理器通常会忽略库的 lockfile，以避免锁定到冲突的传递依赖。提交 lockfile 让库的开发更方便（与其他开发者共享一致的构建环境），不提交则更容易在用户之前发现不同依赖版本的冲突。不少包管理器建议库提交 lockfile（如 npm、pnpm、Poetry、uv、Yarn），一些建议排除（如 Bundler），还有一些交给开发者定（如 Cargo）。

这些问题的许多探讨见 Gamage 等人最近的研究。作者分析了七个包管理器的 lockfile 设计决策、已发布的工程，并对 15 位开发者做了半结构化访谈。他们发现提交 lockfile 的实践因包管理器而异，并把受访者感知的 lockfile 收益归为五类：构建确定性、完整性、对间接依赖的可见性、调试、安全扫描。也有开发者偏好不用 lockfile，理由是希望最终用户解析到依赖的最新版本——可能带着更多 bug 修复和漏洞补丁。

包管理器设计和 lockfile 用途观念的多样性，使得给出单一建议很困难。就供应链完整性而言，把 lockfile 当作完整性来源、随源码提交是常见但非普适的观点。对 lockfile 不提供密码学完整性的包管理器，值得想想它们的用户是否也抱有同样的期待。即使 lockfile 哈希能提供密码学完整性，锁定到特定包哈希也意味着用户不会立即收到后续更新或安全修复——新包哈希不同。于是又得频繁 bump lockfile 来分发最新哈希。「想要即时更新」和「想要包完整性」是两个独立的诉求，而现在常见的「哈希进 lockfile」做法与前者相抵触。总之：lockfile 哈希通常有效，但不总有效，也并非处处适用。

## 签名常见，验证不常见

签名是弥补这些短板的天然方案，但实现经常缺斤短两。理论上，开发者可以用自己的私钥给每个版本签名，包管理器下载时校验签名。事实上签名在各包生态里相当常见，但正经的签名验证却少得惊人。用签名保障代码完整的现实比看上去微妙，各包管理器的路数也不一样。

许多包管理器根本没有签名可用。可以说 vcpkg 不需要——所有包哈希随管理器分发——但这就剩下了 Cargo、CocoaPods、Composer、Conan、Conda、Pub、R 和 SwiftPM。Conan 的开发者知情，此前决定不修，理由是若干实现难题，并建议对完整性要求高的组织自建仓库服务器。Cargo 的开发者正在积极考虑各种签名设计，但仍在推进中。Composer 的开发者已经实现了不少针对供应链攻击的新防护，artifact 完整性在后续计划里。

### 仓库签名

一个直接的思路叫仓库签名：包上传后由包仓库统一签名，仓库公钥随包管理器分发。这解决不了包仓库被彻底攻陷的问题——恶意仓库可以合法地签一个恶意包——但它能防住不可信镜像或包仓库服务设施的部分沦陷。

npm Registry、NuGet Registry 和 Perl 模块分发的 PAUSE 服务器都用仓库签名。npm Registry 的签名随包元数据分发，附带仓库专属公钥。NuGet 的仓库签名在分发的 ZIP 包内 `.signature.p7s` 文件里，同样是仓库专属公钥。PAUSE 的做法不同：用它的 GPG 密钥批量签名多个包的哈希。

### 开发者签名

开发者签名由开发者持有私钥、上传前签名，仓库负责分发。这能防止仓库篡改内容，还让仓库能认证上传者身份。

开发者公示公钥有两种常见做法。其一，公钥带外分发。Maven Central（Maven 和 Gradle 使用）和 RubyGems 仓库（ `gem` 和 Bundler 使用）都支持这类开发者签名。Maven Central 用 PGP 签名，开发者密钥经公钥服务器分发；RubyGems 用自签证书，分发交给开发者（如 rspec）。两者的关键差别在于：Maven Central 强制开发者签名，RubyGems 可选。RubyGems 的开发者签名很少见，因为缺乏信任链，引入证书机构的先前尝试也失败了。

其二，信任链。NuGet Registry 和 PowerShell Gallery 都支持开发者签名，都不强制（PowerShell Gallery 建议使用，NuGet 在使用时有严格要求）。两者都要求开发者密钥链到受信 CA，而一张有效的代码签名证书每年可能要花数百美元。好处是受信根证书可以预装在平台上，包管理器据此验证公钥。

开发者签名的一个缺点：密钥管理是开发者自己的事，丢了密钥就可能失去更新自己代码的能力。

### 基于身份的签名

越来越常见的中间路线是 Sigstore 的「基于身份」或「keyless」签名。开发者不需要长期私钥，而是免费从 Sigstore 的 Fulcio CA 按需领取一张新鲜签名证书。为防冒充，开发者用 OIDC token 证明身份——这是 Google、微软、GitHub 等第三方对开发者邮箱、用户名或其他属性的密码学签名声明。验证者检查用户名是否正确、证书链是否回到 Sigstore Fulcio 根证书，即可证明「能访问该账号的人」产出了这个签名。

Keyless 签名特别适合嵌入开发者现有的流水线式发布流程，也就是所谓的 provenance attestation 或 trusted publishing。GitHub 和 GitLab 向 Actions 与 CI/CD 工作流发放 OIDC token，证明构建工作流、仓库和 commit 哈希。工作流用这个 token 从 Sigstore 获取签名证书、给构建产物签名、上传到包仓库。由于签名证书包含 commit 哈希和工作流细节，二进制产物与源码之间建立了密码学关联。

基于 Sigstore 的 provenance attestation 已被 Python 的 PyPI、npm Registry、RubyGems 和 Maven Central 支持。虽然 Sigstore attestation 不是强制的，但其采用度已经超过 RubyGems 那种可选的开发者自管密钥。

### 验证代码被跳过、没配置，或者压根不存在

遗憾的是，签名存在不等于包管理器在验证。

npm 包管理器里， `npm install` 不检查仓库签名。检查需要运行 `npm audit signatures` ，它用 Sigstore 验证仓库公钥，再验证已安装包的签名。pnpm 近期加了 `pnpm audit signatures` 命令，但其实现从「可能已被攻陷的仓库」获取仓库公钥而不是经 Sigstore 验证，对手大可以自己加上公钥和签名。Bun 和 Yarn 目前没有对应的 `audit signatures` 命令。

NuGet 包管理器的默认 `signatureValidationMode` 是 `accept` ，会安装签名无效的包。用户必须改成 `require` 并配置受信签名者清单（如 `dotnet nuget trust source` ）。这些配置（含仓库公钥）可以安全地随 `nuget.config` 分发，起到「锁定受信签名者」的 lockfile 作用。

Ruby 的 Gem 和 Bundler、Java 的 Maven 和 Gradle 这些使用开发者签名仓库的管理器，默认都不验证签名。它们要求用户手动添加开发者公钥（ `gem cert --add` ）或列出信任的公钥。Maven 可以用第三方的 `pgpverify-maven-plugin` 加 `pgp-keys-map.list` 指定信任的 PGP 指纹，Gradle 的 dependency verification 与此类似。

最后，若干包管理器看起来连验证代码都没有。Pip、uv、Poetry 目前没有途径验证 PEP740 描述的基于身份的 attestation。cpanminus 没法验证仓库签名的 CHECKSUMS 文件完整性——曾经有，但为响应一个验证绕过漏洞，这段验证代码被移除了。PowerShell 虽支持非 Windows 平台，Authenticode 签名验证却不支持。PowerShell 仓库一度注明这个问题「应在未来版本中修复」。

## Go 的包管理与透明日志

Go 内置的包管理器是我测试里唯一默认验证签名的，它还引入了包密码学完整性的最后一个概念。 `go get` 或 `go mod download` 拉包时，对包内容做哈希，把哈希、包名、版本与 checksum database 比对。数据库内容由仓库签名（类似 Perl PAUSE 的 PGP 签名），默认的 checksum database 公钥硬编码在 Go 源码里。只要 checksum database 的私钥被诚实使用，这套设计保证「包名＋版本」就足以唯一确定包的二进制内容。结果， `go.mod` 这个 lockfile 不需要存密码学哈希就实现了包完整性。

Go 的 checksum database 是透明日志（transparency log）的一个例子——不可变、全局、防篡改的元数据日志。Sigstore 的 Rekor 和证书透明日志提供同样能力。用在包管理器里，它从密码学上确保包管理器只安装透明日志记录过的同一份二进制。只要所有人都认可同一份透明日志，就都认可包内容。这让攻击者难以定点地、不被察觉地向特定受害者投喂恶意包。透明日志在其他漏洞存在、日志私钥泄露、或者没人检查日志中的恶意行为时也会失效。

在我测试的所有包管理器里，面对被攻陷的包仓库或代理，Go 在维护密码学完整性方面表现最好。但这个「类仓库签名」的设计也意味着系统的信任大量集中在一把私钥上。

## 一个面向包管理器的密码学设计提案

把本文的思路组合起来，一个可能的方向是把签名信息放进 lockfile。lockfile 不必承诺特定包的哈希，而是承诺开发者的身份或公钥。这复用了 lockfile 哈希的大部分现有基础设施，同时把「即时更新」和「包完整性」两个问题拆开。

这个设计下，lockfile 可以指定依赖的单一版本（为了可复现构建），也可以指定下界（为了即时更新）；内含的身份确保恶意仓库或代理无法轻易篡改管理器解析到的任何版本。再加上透明日志防定点打击，就建立在 Sigstore 的基于身份签名和透明日志服务之上。Sigstore 默认避免长期密钥，但也支持自管密钥、KMS 和硬件 token——既给出易于采用的安全默认值，也给想更多掌控密钥的开发者留了余地。

这个想法不新、也不是我的。attestation 身份已经是 Python `pylock.toml` 规范的一部分、Gradle verification metadata 的 `trusted-keys` 、Maven `pgpverify-maven-plugin` 的 `pgp-keys-map.list` 。许多包管理器正在朝这个方向走，Sigstore 被越来越多地集成进发布流程、供应链安全获得更多关注、以及专门针对「恶意对手篡改」的 bugfix 都是证据。业界越来越认识到这是个问题，也越来越有意愿解决它。

这不会容易。有许多细节要考虑和处理，签名验证代码要开发并审计，开发者要采纳最终的设计。在我为这个项目审查的许多包管理器里，我看到的是一个个已经在思考和推动密码学完整性与包签名的 communities。他们最清楚各自的包管理器需要什么，也理应获得把这件事变成现实的资源。

过去十年最大的密码学成功故事之一，是 HTTPS 的近乎普及——驱动力部分来自业界和社区对未加密流量风险的认知，部分来自 Let's Encrypt 作为公共品提供免费易用的 TLS 证书。包签名现在所处的阶段很像十年前的 HTTPS：持续存在的对手是巨大威胁，密码学防护却近乎为零。普及的包签名尚未到来，但已在视野之内。给予足够的关注和投入，我们可以把它变成现实。

## 致谢

感谢 William Woodruff 关于 lockfile、身份签名与包管理器安全挑战的宝贵讨论。

## 译者补充：几点解读与延伸

**一、查表指南。** 先看表 1 定位自己生态的档位，再看正文对应小节找「为什么」。Python 用户的坏消息：Pip 的 `pylock.toml` 还是实验性支持；uv/Poetry 有 lockfile 验证但签不了名。Go 开发者可以安心，代价是把信任集中到 checksum database 那把私钥上。

**二、「有哈希≠防篡改」四例值得逐个读。** Pub 的「报错但照装」、pnpm 11.4 之前的「覆写 lockfile」、Conan 的「MD5 当 ID」、CocoaPods/Composer 的「哈希锁不住分发内容」——四种失效模式各不相同，自建内部包源或镜像时每一种都可能踩到。

**三、与本仓库既有文章的接口。** 此前译介的 Able2Shell 事件（11-18）是「RMM 供应链沦陷」的运营侧；这篇是「包供应链完整性」的机制侧。把两篇放在一起读，供应链的攻防地图就完整了：事件告诉我们仓库和分发通道是真实战场，这篇告诉我们大多数包管理器在这条通道上不设防。

## 参考

-   Package managers have an integrity problem（原文）：https://blog.trailofbits.com/2026/10/14/package-managers-have-an-integrity-problem/
    

前沿资讯 · 目录
