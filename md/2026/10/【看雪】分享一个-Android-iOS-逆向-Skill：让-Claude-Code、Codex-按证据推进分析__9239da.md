---
title: 【看雪】分享一个 Android / iOS 逆向 Skill：让 Claude Code、Codex 按证据推进分析
source: https://bbs.kanxue.com/thread-293328.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-26T08:55:36+08:00
trace_id: 6c2d2612-77c2-459c-8d18-9fbc1a7f4c87
content_hash: caed2454adaa4133a57485be57f7e68322caf1e5501eb99d6379e96633510339
status: synced
tags:
  - 看雪
  - Android逆向
  - AI辅助逆向
series: null
feed_source: 看雪·Android安全
ai_summary: "**TL;DR：** 开源 Skill 项目 mobile-reverse-skill 把 Android/iOS 逆向拆成可复用阶段，让 Claude Code、Codex 调用工具、留存证据并验证结论，减少步骤零散和过早判断加密算法。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40575244-d011-81ed-a720-dc4c82a1c5ce
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 开源 Skill 项目 mobile-reverse-skill 把 Android/iOS 逆向拆成可复用阶段，让 Claude Code、Codex 调用工具、留存证据并验证结论，减少步骤零散和过早判断加密算法。
> 
> - **设计动因：** AI 辅助逆向常见问题是分析步骤零散、静态代码与运行时数据对不上、换会话需重新交代上下文、模型见几个常量就断定加密算法。
> - **Android 与运行时：** 结合 jadx、apktool、ASC 检查 APK 并追踪 Java/JNI/native 调用链；配合 Frida，设备与内核条件允许时用 ecapture、stackplz 对齐实际运行数据。
> - **算法与 iOS：** native 侧支持 IDA Pro 的 MCP 或 headless 路径，靠常量、指令特征加样本验证还原签名加密；iOS 走 Apple Silicon Mac + PlayCover 流程，含 IPA 检查与 ObjC/Swift 信息。
> - **证据分级：** 强制区分“观察到的事实”“推测”“已验证结论”；疑似加密常量不足以确认算法，需用样本重算比对并做修改输入的对照测试，受阻或证据不足也如实记录。
> - **安装与限制：** 克隆后执行 `./install.sh`（Codex 加 `--agent codex`，共用仓库用 `--agent both --link`），入口为 `/reverse-skill` 与 `$reverse-skill`；Skill 不自动配环境，eBPF 等能力受设备内核与权限限制。发现与假设统一存入 `findings.json` 供跨会话接续。

\# 分享一个 Android / iOS 逆向 Skill：让 Claude Code、Codex 按证据推进分析

大家好，最近整理并持续维护了一个移动端逆向项目 \*\*mobile-reverse-skill\*\*，想分享给看雪的朋友交流。

项目地址：https://github.com/owen800q/mobile-reverse-skill

平时使用 AI 辅助逆向，经常遇到几个问题：分析步骤比较零散，静态代码和运行时数据对不上；分析到一半换个会话，又需要重新交代上下文；有时模型看到几个常量，就过早判断用了某种加密算法。

这个项目尝试把分析过程整理成一套可复用的 Skill，让 Claude Code 和 Codex 按阶段调用工具、记录证据，并验证分析结果。适合移动端 CTF、逆向学习，以及授权范围内的应用安全研究。

\## 主要功能

## Android 静态与调用链分析

\- \*\*Android 分析\*\*：结合 jadx、apktool 和 ASC，检查 APK、定位接口及请求构造代码，并进一步追踪 Java / JNI / native 调用链。

\- \*\*运行时观察\*\*：结合 Frida，以及设备和内核条件允许时的 ecapture、stackplz，把实际运行数据与静态代码对应起来。

\- \*\*Native 与算法分析\*\*：支持 IDA Pro 的 MCP 或 headless 分析路径，结合常量、指令特征和样本验证，辅助还原签名及加密逻辑。

\- \*\*iOS 分析\*\*：提供基于 Apple Silicon Mac + PlayCover 的分析流程，覆盖 IPA 检查、ObjC / Swift 信息和本地 Frida 观察等。

\- \*\*分析记录与交接\*\*：使用统一的 \`findings.json\` 保存发现、证据和待验证假设，方便后续会话接着分析。

\## 比较重视的一点：结论需要验证

## 事实、推测与已验证结论

项目会区分“观察到的事实”“推测”和“已验证结论”。

例如，看到一个疑似加密常量，并不足以确认算法；还原签名后，也需要用实际样本重新计算、比对，并通过修改输入的对照测试验证。

工具没有成功运行、分析受阻或证据不足时，也应该如实记录。

\## 安装与使用

先克隆仓库：

\`\`\`bash

git clone https://github.com/owen800q/mobile-reverse-skill.git

cd mobile-reverse-skill

\`\`\`

安装到 Claude Code：

\`\`\`bash

./install.sh

\`\`\`

安装到 Codex：

\`\`\`bash

./install.sh --agent codex

\`\`\`

两边共用当前仓库中的 Skill，方便持续更新：

\`\`\`bash

./install.sh --agent both --link

\`\`\`

Claude Code 中可通过 \`/reverse-skill\` 指定目标和分析任务；Codex 中使用 \`$reverse-skill\`。

例如：

\`\`\`text

/reverse-skill 分析本地 CTF APK，定位 flag 校验函数，梳理 Java 到 JNI 的调用链，并验证还原出的算法。

\`\`\`

## 环境依赖与能力边界

Skill 本身不会自动配好逆向环境，具体能力取决于本机工具、设备及权限。例如，Android 的 eBPF 分析需要满足对应的设备和内核条件。

\## 来源与交流

项目整合并改编了多个社区逆向 Skill 和工具的思路，上游来源在 README 的 Credits 中列出，也感谢原作者们的分享。

目前仍在迭代，欢迎大家拿 CTF 样本或自己有权分析的测试应用试用。如果遇到工具兼容问题、流程不合理，或者分析结论缺少证据，欢迎提 Issue、PR，也欢迎在楼里交流具体案例。

觉得有用的话，欢迎 Star 支持。

GitHub：https://github.com/owen800q/mobile-reverse-skill

[#逆向分析](https://bbs.kanxue.com/forum-161-1-118.htm) [#协议分析](https://bbs.kanxue.com/forum-161-1-120.htm) [#工具脚本](https://bbs.kanxue.com/forum-161-1-128.htm)
