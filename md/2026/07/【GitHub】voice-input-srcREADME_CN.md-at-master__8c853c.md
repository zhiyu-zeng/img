---
title: 【GitHub】voice-input-src/README_CN.md at master
source: https://github.com/yetone/voice-input-src/blob/master/README_CN.md
source_host: github.com
clip_date: 2026-07-01T01:06:14+08:00
trace_id: bb9b8a6b-a706-4b1e-b6e9-1eb51149a449
content_hash: 7ecccbdae34c96a7ea53871e72bb0e34728771de042bb5ac07e995c30f84df56
status: summarized
tags:
  - GitHub
series: null
feed_source: null
ai_summary: 这是一个功能丰富的 macOS 菜单栏语音输入工具的完整技术规格，旨在通过按住 Fn 键实现高效、精准的语音转文字输入。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38f75244-d011-81d0-b65f-d2fdc9a2a72e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 这是一个功能丰富的 macOS 菜单栏语音输入工具的完整技术规格，旨在通过按住 Fn 键实现高效、精准的语音转文字输入。
> 
> - **核心输入与转录逻辑：** 按住 Fn 键触发录音，松开后自动转录并注入文字。默认使用简体中文，通过 Apple 框架进行流式语音识别。通过全局事件监听捕获 Fn 键，并抑制其默认行为（如触发表情符号面板）。
> - **悬浮窗 UI 与交互：** 在屏幕底部显示一个高度 56px、圆角 28px 的无边框胶囊状悬浮窗。左侧包含 5 根由实时音频电平驱动的竖条波形动画，右侧显示转录文本，并随文字增多而弹性变宽。动画包含入场、文字过渡和退场效果。
> - **文字注入与输入法处理：** 使用剪贴板配合模拟 Cmd+V 粘贴文本。在粘贴前会检测并临时切换输入法（如切换到 ABC），以避免中文输入法拦截粘贴操作，完成后恢复原输入法和剪贴板内容。
> - **LLM 优化集成：** 可选接入 OpenAI 兼容的 API（可配置 Base URL、Key、Model）对转录结果进行 refine。System prompt 要求进行非常保守的纠错，仅修复明显的语音识别错误（如中文谐音、技术术语误转），绝不润色或删改正确内容。
> - **应用配置与构建：** 应用以 LSUIElement 模式运行，只显示菜单栏图标。提供 Swift Package Manager 构建及 Makefile（支持 build/run/install/clean），最终产物为签名的 .app bundle。

## Source Code

```
claude \
  --dangerously-skip-permissions \
  --output-format=stream-json \
  --verbose \
  -p "请实现一个 macOS menu-bar 语音输入法应用（Swift，macOS 14+），具体要求：

1. 按住 Fn 键录音，松开后将转录文字注入当前聚焦的输入框。优先使用流式转录（Apple Speech Recognition framework）。Fn 键通过 CGEvent tap 全局监听，需抑制 Fn 事件传递以防止触发 emoji 选择器。
2. 默认语言必须为简体中文（zh-CN），确保开箱即用就能识别中文输入。同时在菜单栏提供语言切换选项（英语、简体中文、繁体中文、日语、韩语）。语言选择存储在 UserDefaults 中。
3. 录音时在屏幕底部居中显示一个特别优雅精致的无边框胶囊状悬浮窗，不要有红绿灯和 titlebar。使用 NSPanel（nonactivatingPanel）+ NSVisualEffectView（.hudWindow 材质），高度足够（56px，圆角半径 28px），包含：
   - 左侧 5 根竖条波形动画（44×32px），必须由实时音频 RMS 电平驱动（不要用写死的假动画），说话声音大波形就大、安静时波形就小。各竖条权重为 [0.5, 0.8, 1.0, 0.75, 0.55] 形成自然的中间高两侧低效果，平滑包络（attack 40%、release 15%），每根竖条添加 ±4% 随机抖动增加有机感。波形要足够大，清晰可见。
   - 右侧文字标签（弹性宽度 160-560px）实时显示转录文本，胶囊随文字变多而弹性变宽
   - 入场弹簧动画（0.35s）、文字宽度平滑过渡（0.25s）、退场缩放动画（0.22s）
4. 文字注入使用剪贴板 + 模拟 Cmd+V 粘贴方式，注入前需检测当前输入法：如果是 CJK 输入法，先临时切换到 ASCII 输入源（ABC/US 键盘）再粘贴，粘贴完成后恢复原输入法，防止中文输入法拦截 Cmd+V。注入完成后恢复原剪贴板内容。
5. 接入 LLM 来提升语音识别的准确率，尤其是中英文混杂的情况下。通过 OpenAI 兼容 API（可配置 API Base URL、API Key、Model）对转录文本进行 refine。LLM 的 system prompt 要求非常保守地纠错：只修复明显的语音识别错误（如中文谐音错误、英文技术术语被错误转为中文如「配森」→「Python」、「杰森」→「JSON」），绝对不要改写、润色或删除任何看起来正确的内容，如果输入看起来正确则必须原样返回。
6. 在菜单栏提供 LLM Refinement 子菜单，包含启用/禁用开关和 Settings 入口。Settings 窗口包含 API Base URL、API Key、Model 三个输入框，API Key 输入框要能完全清空，以及 Test 和 Save 按钮。松开 Fn 键后如果 LLM 已启用且已配置，悬浮窗显示 Refining... 状态，等 LLM 返回后再注入最终文本。
7. 应用以 LSUIElement 模式运行（仅菜单栏图标，无 Dock 图标）。使用 Swift Package Manager 构建，提供 Makefile（build/run/install/clean），构建产物为签名的 .app bundle。"
```
