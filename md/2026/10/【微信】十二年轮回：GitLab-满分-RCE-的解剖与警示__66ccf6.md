---
title: 【微信】十二年轮回：GitLab 满分 RCE 的解剖与警示
source: https://mp.weixin.qq.com/s/2wigI5nmCrFUjpOSI58_eQ
source_host: mp.weixin.qq.com
clip_date: 2026-10-24T21:21:03+08:00
trace_id: 8d65e40a-c3b3-4ca9-91c4-1bdf0891148d
content_hash: 49bea2cc7c82deb17d549fa55d0f7405e93bb9ae016338063f7972b4219f48f8
status: synced
tags:
  - 微信
  - 漏洞分析
  - 内存破坏
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: GitLab 未认证 RCE（CVE-2026-110264，CVSS 10.0）源于 Org 渲染层正则注入叠加 Onigmo 16 位 repeat-ID 溢出；上一轮针对 CVE-2026-97229 的补丁并不覆盖本次漏洞。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40375244-d011-817d-8f59-ef9654d8c869
ioc:
  cves:
    - CVE-2026-110264
    - CVE-2026-89078
    - CVE-2026-93577
    - CVE-2026-97229
  cwes:
    - CWE-190
    - CWE-787
    - CWE-94
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> GitLab 未认证 RCE（CVE-2026-110264，CVSS 10.0）源于 Org 渲染层正则注入叠加 Onigmo 16 位 repeat-ID 溢出；上一轮针对 CVE-2026-97229 的补丁并不覆盖本次漏洞。
> 
> - **影响范围：** 漏洞从 7.0 一直到 18.11 之前的 CE/EE 自建实例均受影响，跨度十二年；攻击向量为 AV:N/AC:L/PR:N/UI:N/S:C，无需凭据与用户交互，即可用 git 用户身份执行命令。
> - **双层根因：** org-ruby 0.9.12 的 `headline.rb` 在第二次构造正则时没有转义来自 `#+TODO:` 的攻击者可控字符串，直接使用 `Regexp.new`；Onigmo 用 `short` 存 `MemNumType`，当区间重复超过 32,767 个时，repeat ID 会回绕为负，形成约 [-256 KB, base) 的越界读写原语。
> - **投递与 PoC 现状：** 请求 `GET /<project>/-/blob/main/file.org?format=json&viewer=rich` 即可触发；公开 PoC 只到 Ruby 3.4.11 上确定性的 SIGSEGV，恶意渲染延迟 10–19 秒，而良性请求仅 0.1 秒；从堆 groom 到 `system()` 的完整链路尚未公开。
> - **修复版本：** 19.5.1 / 19.4.3 / 19.3.6 / 19.2.9 / 19.1.9 / 19.0.10 / 18.11.13；10 月 12 日发布的 19.2.8、19.3.5、19.4.2 均低于对应分支的修复版，必须重新升级；没有临时缓解措施。
> - **检测与处置：** 部署 Sigma 规则「Onigmo native worker crash」「Org mode render error burst」；排查 Puma 异常子进程、`/tmp` 下属于 git 用户的新文件、crontab 与 SSH key 变更，一旦命中应按已失陷处理，并轮换 `gitlab-secrets.json`、CI/CD 变量与各类 token。

**网络安全民工** *2026年10月24日 20:32*

### 一、漏洞全景：一个被忽略了十二年的满分缺口

2026 年 10 月 21 日，GitLab 发布了一次计划外的紧急安全更新。CVE-2026-110264，CVSS 3.1 评分 **10.0**，未认证远程代码执行，影响范围从 **2014 年发布的 7.0 版本** 一直延伸到修复版之前的每一个 CE/EE 自建实例——跨度整整十二年。评分向量 `AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H` 意味着：攻击者只需网络可达，无需任何凭据、无需用户交互，即可在 GitLab 服务器上以 `git` 系统用户身份执行任意命令。

这不是一次孤立的爆发，而是同一条断层线上第四次震动。同一研究员 joaxcar 在一个月内报告了四颗 Onigmo 相关漏洞：9 月 23 日的 CVE-2026-89078 与 CVE-2026-93577（需登录，9.9 分），10 月 12 日的 CVE-2026-97229（10.0 分，未认证），以及这次的 CVE-2026-110264。更棘手的是， **10 月 12 日针对 97229 的补丁（19.2.8 / 19.3.5 / 19.4.2）并不覆盖本次漏洞**——110264 的修复版本恰好都比前者高一个补丁号。按上次公告打完补丁的组织，此刻仍在射程之内。

### 二、根因解剖：两处“看似无害”的代码，叠成一个满分漏洞

CVE-2026-110264 的根因由两层缺陷叠加而成，缺一不可。

#### 第一层：Org-mode 渲染层的正则注入（CWE-94）

GitLab 通过 `org-ruby` （版本 0.9.12）渲染 `.org` 文件。Org 格式支持 `#+TODO:` 行来定义自定义待办关键字。问题出在 `lib/org-ruby/headline.rb` 第 100 行附近：

```ruby
# parser.rb 中，关键字在存入 @custom_keywords 之前经过了 Regexp.escape：
keyword = Regexp.escape(keyword)
@custom_keywords << keyword

# 但在 headline.rb 的 parse_keywords 中，第二次构造正则时用的是“原始词”：
@headline_text.sub!(Regexp.new("^#{@keyword}\\s*"), "")
```

`@keyword` 来自 `.org` 文件中的 `#+TODO:` 行，是 **攻击者完全控制的字符串**。它在进入 `Regexp.new` 之前， **没有经过转义**。这意味着任何正则元字符（ `{ } ( ) | * + .` 等）都会被当作活的正则语法解释。一个匿名用户只要能访问一个包含恶意 `.org` 文件的公开项目，就控制了 `Regexp.new` 的输入源。

#### 第二层：Onigmo 的 repeat-ID 整数溢出（CWE-190 → CWE-787）

Onigmo 是 Ruby 内置的正则引擎，GitLab 将其打包在 Omnibus/CNG 中并自行打补丁。在 Onigmo 的内部表示中，每一个量词重复（如 `x{0,8}` ）都会被分配一个内部标识符，类型定义在 `regint.h` 中：

```cpp
typedef short int MemNumType;   // 16-bit signed，范围 -32768 到 32767
```

编译器在计数时使用的是普通 `int` ，但写入时通过 `add_mem_num()` 做了一个 **截断转换** 存入 `short` 。当一个正则中包含超过 **32,767 个区间重复** 时，后续的 repeat ID 会回绕为负数。

真正的危险发生在匹配阶段。负数的 repeat ID 会被当作数组下标，用于访问重复范围表和重复栈：

```javascript
// regexec.c 中的越界读：
reg->repeat_range[repeat_mem].lower        // repeat_mem 为负

// regexec.c 中的越界写：
repeat_stk[mem] = GET_STACK_INDEX(stk)     // mem 为负
```

由于 `short` 的回绕范围，攻击者获得的是一个位于分配基址下方、窗口约 **\[-256 KB, base)** 的越界读写原语。这落在 Puma worker 堆中攻击者可以施加影响的内存区域。

Ruby 官方的修复（commit `493d26dc` ）在编译阶段直接拒绝超过 32,767 个区间重复的模式：

```kotlin
reg->num_repeat++;
if ((MemNumType)reg->num_repeat <= 0)
    return ONIGERR_TOO_MANY_RANGE_REPEAT;
```

GitLab 通过 `omnibus-gitlab!9922` 和 `CNG!3168` 将这一修复反向移植进了其捆绑的 Ruby 3.3 / 3.4 / 4.0 运行时。

### 三、PoC 与利用链：从匿名 GET 到堆越界的已验证路径

#### 3.1 攻击向量：一次无需凭据的 HTTP 请求

攻击的投递路径已经得到多方交叉印证。攻击者在公开项目的 `.org` 文件中植入恶意 `#+TODO:` 关键字，然后触发 GitLab 的富文本查看器渲染该文件：

```perl
GET /<project>/-/blob/main/file.org?format=json&viewer=rich
```

无需 token、无需 session、无需 cookie。Censys 的独立分析同样确认，攻击只需要“一个可以承载.org 载荷的公开项目”。GitLab 自家的检测规则命名——“Onigmo native worker crash”和“Org mode render error burst”——也从侧面指向了 Org 渲染路径。

#### 3.2 崩溃级 PoC：确定性触发内存破坏

TahuCryptsi 仓库提供了一个 **在 Ruby 3.4.11（GitLab 捆绑版本线）上 Docker 验证过的崩溃 PoC**。其核心逻辑是构造一个包含超过 32,767 个 `{n,m}` 区间重复的正则，触发 repeat-ID 回绕，并在匹配阶段产生原生段错误。

该仓库的验证输出明确记录了崩溃签名：

```sql
[*] CVE-2026-110264 Onigmo repeat-ID overflow -- PoC driver
[*] running probe in vulnerable runtime (ruby:3.4-slim == 3.4.11)...
COMPILE: accepted (no guard) -- vulnerable path
[+] VERDICT: VULNERABLE -- native SIGSEGV inside Onigmo (repeat-ID wrap, RSI=0xffff8000)
```

```
0xffff8000
short
system()
```

googlesky 仓库则提供了一个更完整的 **PoC 框架 v2.1**，包含版本指纹、恶意 `.org` 文件模板（loud + stealth 两种）、未认证渲染 oracle、本地根因复现环境，以及在 GitLab CE 19.3.1 上的实时验证证据。其验证显示，恶意 `.org` 渲染请求的客户端差分延迟为 **10–19 秒**，而良性请求仅 **0.1 秒**，并在服务端日志中留下了 `Timeout::Error / OtherMarkup / .org unauth` 的痕迹。同样地，该仓库也标注“完整的堆 groomed `system()` 仍是逐构建的武器化后续工作”。

#### 3.3 从崩溃到代码执行：尚未公开的最后一公里

公开材料一致描述了从越界写原语到代码执行的路径轮廓：通过 **请求体 shaping 来 groom Puma worker 堆**，使负索引越界写落入攻击者可控的内存区域，进而将 Onigmo 的回溯栈或原生返回地址重定向至 `system()` ，最终以 `git` 用户执行命令。但 **这一完整链路的工程化细节没有被任何公开来源披露**。Rapid7 在同源的 CVE-2026-97229 上曾实现过一天内的武器化，但 110264 的同等利用代码并未公开。

因此，对“完整 POC”的诚实结论是： **公开可得的 PoC 证明了漏洞的真实性和可利用的投递面，但未提供开箱即用的 RCE 利用**。任何声称拥有完整未认证 RCE PoC 的来源，都应持高度审慎态度。

### 四、修复与防御：比“打补丁”更复杂的现实

#### 4.1 版本对照：必须逐个比对，且要覆盖“打过的那一批”

修复版本按分支如下：

| 分支  | 受影响 | 修复版 |
| --- | --- | --- |
| 19.5 | < 19.5.1 | **19.5.1** |
| 19.4 | < 19.4.3 | **19.4.3** |
| 19.3 | < 19.3.6 | **19.3.6** |
| 19.2 | < 19.2.9 | **19.2.9** |
| 19.1 | < 19.1.9 | **19.1.9** |
| 19.0 | < 19.0.10 | **19.0.10** |
| 7.0 – 18.11 | < 18.11.13 | **18.11.13** |

**10 月 12 日针对 CVE-2026-97229 发布过的 19.2.8 / 19.3.5 / 19.4.2，全部低于上述对应分支的修复版，必须重新升级。** 7.0 至 18.11 之间的实例没有中间停靠站，只能直接跳到 18.11.13。

#### 4.2 没有 Workaround，但有可部署的检测

GitLab **没有提供临时缓解措施**，也没有公开具体的触发前置条件。在无法立即升级的窗口内，可操作的手段限于网络层收缩和检测：

-   **收缩暴露面**：将 GitLab 实例从公网移至可信 IP 段之后。这不能替代补丁，但可以消除匿名攻击者触达 Org 渲染路径的可能性。
    
-   **部署 GitLab 官方 Sigma 规则** （TLDR 框架）：“Onigmo native worker crash”和“Org mode render error burst”。前者捕获的是 **利用尝试失败时产生的原生 worker 崩溃**——攻击者试探或利用未遂时会留下这个信号。后者针对 Org 渲染错误率的异常突增。审阅历史日志，寻找意外的 worker 崩溃和渲染错误爆发，是回答“有没有被试探过”的最直接方式。
    
-   **事后排查迹象**：关注 Puma 的异常子进程、 `/tmp` 下属于 `git` 用户的新文件、 `git` 用户 crontab 或 SSH key 的非预期变更。若出现这些迹象，应按 **已失陷** 处理，轮换 `gitlab-secrets.json` 中的全部密钥、CI/CD 变量、runner token 和访问令牌。
    

### 五、写在最后：这不是一颗“意外的”漏洞

CVE-2026-110264 的十二年生命周期，暴露的不是某一行代码的疏忽，而是 **“应用层信任了不该信任的字符串，运行时层把一个有界类型当成了无界容器”** 这一结构性缝隙被长期无视。Org 渲染层的 `Regexp.new` 用原始字符串构造正则，是一个典型的应用安全缺陷；Onigmo 的 `short` 截断，是一个典型的底层类型缺陷。单独看，两者都可以被“输入校验”或“边界检查”在各自层面缓解；叠在一起，却产生了一个 CVSS 10.0、无缓解、覆盖十二年版本的满分缺口。

joaxcar 一个月内四颗同源漏洞，说明这条缝隙不是偶发，而是系统性的。对自建 GitLab 的组织而言，当前的优先级判断很简单： **比对版本，重新比对版本，升级，然后假设可能已经被试探过。** 没有 PoC 不等于没有攻击者——只是在公开视野之外，武器化的进度不为所知。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3fd3820583ba6daa.png)

POC漏洞 · 目录
