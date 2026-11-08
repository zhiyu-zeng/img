---
title: 【微信】如何让你的WorkBuddy开口说话
source: https://mp.weixin.qq.com/s/vSx_-3h384p06ky13fmyuA
source_host: mp.weixin.qq.com
clip_date: 2026-11-08T08:21:05+08:00
trace_id: e3d528e7-4329-4d53-8477-0c15b1b4df0e
content_hash: a95da85598950b27979837bfecd502d5586cf300719bc8e562906637e0d357cc
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41275244-d011-8111-8801-cb1743bc1eae
ioc: null
---

**生有可恋** *2026年11月8日 06:51*

当前的各种智能编程工具，都没有接入TTS模型，也就是只能文字聊天不能开口说话。

最终想实现如下效果，在编程时编程助手除了干活还通过语音汇报工作进度。不是把所有内容都转成语音，而是只介绍重点，跳过大段的文字描述。

实现后的效果如下，可以边干活边用语音汇报。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4e760cde25e68aba.png)

下面是技术细节：

用 AI 助手干活，最常遇到的场景是这样的：你让它跑一个长任务——批量处理文件、生成报告、跑测试——然后你切去干别的事了。十分钟后回来一看，它早就干完了，结果静静躺在对话窗口里，等你发现。

这个方案就是给 AI 装一个"嘴巴"。

核心思路很简单： **把一段简短的文字，通过 TTS（文字转语音）合成成音频，然后用音箱播出来。**

选择的是字节的 **豆包语音合成大模型 2.0** （ `seed-tts-2.0` ），通过 WebSocket 单向流式接口实时合成。具体来说：

-   AI 助手干完活后，把一句 2-3 句话的进度汇报传给脚本
    

-   脚本通过 WebSocket 连上豆包 TTS 服务，流式接收音频帧
    

-   拼成完整 MP3 后，用系统自带播放器（macOS 的 `afplay` ）直接播出来
    

-   默认音色： **魅力女友**——一个温柔自然的女声
    

整个过程从"干完活"到"听到声音"，通常只要两三秒。

这个方案以 WorkBuddy **Skill** （技能）的形式存在。 `SKILL.md` 定义文件和配套脚本的目录，放进 skills 目录就能被 AI 助手发现和使用。

### 第一步：准备 skill 目录

WorkBuddy 的用户级 skill 目录在 `~/.workbuddy/skills/` 。在里面创建技能文件夹：

SKILL.md

技能定义：告诉 AI 助手什么时候该用、怎么用

`speak.py`

主脚本：连豆包 TTS、合成音频、播放

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
豆包单向流式语音合成（文字转语音）。
用法：
    python speak_doubao.py "要说的内容"
    python speak_doubao.py "要说的内容" 音色ID
依赖：websockets + protocols.py（同目录），均在 voice-venv
鉴权：豆包语音 X-Api-Key（doubao_tts_key.conf）
文档：豆包语音_单向流式语音合成(WebSocket).pdf
与 speak.py（CosyVoice2/硅基流动）并存，按需选用。
"""
import asyncio
import json
import ssl
import sys
import uuid
import os
import tempfile
import subprocess
import websockets
from protocols import EventType, MsgType, full_client_request, receive_message
# ---------- 配置 ----------
# 豆包语音 X-Api-Key
API_KEY = os.environ.get("DOUBAO_TTS_KEY", "your-key")
RESOURCE_ID = "seed-tts-2.0"  # 豆包语音合成大模型 2.0
WS_URL = "wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream"
# 默认音色：魅力女友（4号）
DEFAULT_SPEAKER = "zh_female_meilinvyou_uranus_bigtts"
async def synthesize(text: str, speaker: str) -> bytes:
    """流式合成，返回完整 mp3 字节。"""
    headers = {
        "X-Api-Key": API_KEY,
        "X-Api-Resource-Id": RESOURCE_ID,
        "X-Api-Request-Id": str(uuid.uuid4()),
        "X-Control-Require-Usage-Tokens-Return": "*",
    }
    body = {
        "req_params": {
            "speaker": speaker,
            "text": text,
            "audio_params": {"format": "mp3", "sample_rate": 24000},
        }
    }
    # Python trust store 可能不认本机代理证书，降级不校验
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE
    ws = await websockets.connect(
        WS_URL, additional_headers=headers, max_size=10 * 1024 * 1024, ssl=ssl_ctx
    )
    try:
        await full_client_request(ws, json.dumps(body).encode())
        audio = bytearray()
        while True:
            msg = await receive_message(ws)
            if msg.type == MsgType.Error:
                raise RuntimeError(f"TTS 错误: {msg}")
            if msg.type == MsgType.FullServerResponse and msg.event == EventType.SessionFinished:
                break
            if msg.type == MsgType.AudioOnlyServer and msg.payload:
                audio.extend(msg.payload)
        if not audio:
            raise RuntimeError("没有收到音频数据")
        return bytes(audio)
    finally:
        await ws.close()
def play(mp3_bytes: bytes) -> None:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(mp3_bytes)
        path = tmp.name
    try:
        subprocess.run(["afplay", path], check=False)
    finally:
        os.unlink(path)
def main() -> int:
    if len(sys.argv) < 2:
        print('用法: speak_doubao.py "要说的内容" [音色ID]', file=sys.stderr)
        return 2
    text = " ".join(sys.argv[1:]).strip() if len(sys.argv) == 2 else sys.argv[1]
    speaker = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_SPEAKER
    if not text:
        return 2
    audio = asyncio.run(synthesize(text, speaker))
    play(audio)
    return 0
if __name__ == "__main__":
    sys.exit(main())
```

### 第二步：创建 Python 虚拟环境

`speak.py` 依赖 `websockets` 库，不能直接用系统 Python 跑。

### 第三步：配置鉴权

豆包 TTS 需要一个 API Key。在火山引擎控制台开通"语音合成大模型"服务后，你会拿到一个 `X-Api-Key` 。

```
第四步：如果音箱里传出一个温柔的女声说了这句话，恭喜，你的 AI 助手会说话了。装好之后，这个 skill 会自动被 WorkBuddy 识别。你在对话里说这些话，AI 助手就会用语音汇报：
```

-   **"汇报一下进度"**

-   **"用语音告诉我"**

-   **"说说现在干到哪了"  
      
    **

更关键的是，你可以让 AI 助手 **主动汇报**。比如你让它干一个多步骤的任务，可以在指令里加一句："每完成一步就用语音告诉我。"

### 最适合的几个场景

**1\. 双手被占用时**

你在装服务器、接网线、修设备，双手没法碰键盘。AI 助手在另一边帮你处理数据、生成报告。干完了一句话飘过来，你不用停下来就能知道结果。

**2\. 长任务的后台通知**

批量转换文件、跑测试套件、生成大型报告——这些任务可能要跑几分钟甚至十几分钟。与其隔一会儿就切窗口看看进度，不如让它自己开口告诉你"做完了"。

**3\. 多任务并行**

你同时开了好几个 AI 助手会话，各自干不同的事。语音汇报能帮你区分哪个先完成了，不用逐个窗口切回去看。

这个 skill 的设计初衷是 **简短口头汇报**——2-3 句话，像同事走过来跟你说"那个报告写完了，放在共享文件夹了"。 **不是用来朗读完整回复的。** 如果把 AI 助手的长篇大论全塞进去念，体验会很糟糕，而且合成和播放都会变慢。

拆一下技术细节：

### 整体流程：WebSocket 连接

```
豆包 TTS 用的是单向流式接口，
```

连接时通过 HTTP 头传鉴权信息：

|     |     |
| --- | --- |
| Header | 值   |
| `X-Api-Key` | 你的 API Key |
| `X-Api-Resource-Id` | `seed-tts-2.0` |
| `X-Api-Request-Id` | 每次请求生成的唯一 UUID |

豆包的 WebSocket 消息 **不是** 普通的 JSON 文本帧，而是一套自定义二进制协议。

protocols.py 是这套协议的 Python 实现——负责把消息类型、事件类型、序列化方式、payload 打包成字节流发出去，再把收到的字节流解包回来。核心是 `Message` 类的 `marshal()` （序列化）和 `unmarshal()` （反序列化）。

音色 ID，换不同的 ID 就能换声音。

### 五个可选音色

|     |     |     |
| --- | --- | --- |
| 编号  | 音色风格 | speaker ID |
| 1   | VV 女声 | `zh_female_vv_uranus_bigtts` |
| 2   | 高冷御姐 | `zh_female_gaolengyujie_uranus_bigtts` |
| 3   | 清新女声 | `zh_female_qingxinnvsheng_uranus_bigtts` |
| **4** | **魅力女友** （默认） | `zh_female_meilinvyou_uranus_bigtts` |
| 5   | 少儿故事 | `zh_female_shaoergushi_uranus_bigtts` |

拿到 MP3 字节流后，写入临时文件，调用 macOS 自带的 `afplay`

播放。 `afplay` 是阻塞的——播完才返回，所以脚本会等音频播完再退出，AI 助手就知道"这次汇报说完了"。

SKILL.md 的作用

```objectivec
让 AI 助手"知道"该用这个 skill 的关键——是 SKILL.md 文件。WorkBuddy 在每次对话开始时会扫描 skills 目录，把这些定义读进上下文。当对话场景匹配到 description 里的条件时——比如任务完成、用户说"汇报"——AI 助手就会自动调用这个 skill。
只要说一句"汇报一下"，AI 助手就会自己跑 speak.py——因为 SKILL.md 告诉了它什么时候该用、怎么用。
让 AI 助手开口说话，本质上是把文字输出这个单一通道，扩展成了文字 + 语音双通道。文字适合复杂信息、代码、长篇内容；语音适合状态通知、进度汇报、简短结论。两者各有所长，配合使用才是完整的。
这个方案的好处在于：它不需要改 WorkBuddy 本身的代码，只需要一个 skill 目录 + 一个 Python 脚本 + 一个 TTS API Key。整个安装过程五分钟，但带来的体验变化是质变的——你的 AI 助手从"屏幕里的文字"变成了"会主动开口的伙伴"。
试试看，给 AI 装个嘴巴。豆包tts模型官方文档：
```

https://docs.volcengine.com/docs/doubao-voice/unidirectional-streaming-text-to-speech-websocket?lang=zh

开通后送两万token：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c90d4cb6bea326c2.png)

两万token用完后可以增购，增购起步10万token，最低档是¥28。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2550381a5567813f.png)

全文完。
