---
title: DeepSeek分析DeepSeek App - 奋飞安全
source: http://91fans.com.cn/post/deepseekone/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:28:27+08:00
trace_id: 9b1bf901-0751-45cb-a005-292c7954b7b9
content_hash: edd3e6f72d62c61e010855d8281b1b2a441d8f24b88edbdfe3bcc8dd50ff1ef8
status: synced
tags:
  - Android逆向
  - 风控对抗
series: null
feed_source: 91fans·逆向
ai_summary: x-ds-pow-response是Base64编码的JSON，answer由native库根据服务器下发的challenge和salt计算，challenge/salt/signature均来自服务器。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3b275244-d011-81b6-a8bd-e39ba1dbead3
ioc:
  cves: []
  cwes: []
  hashes:
    - 10b7849b1e6203b288dc4975a1e23753ed9d6fb656964b8e86daebab3628a40c
    - ce96433fd479a8648ba29145c2520a787102e145b2f8998ea81ddfe010c3d5a8
    - cebab4aa8e50955666f589816c66811144e056a8f41c43a43bd78cedc4b5f4a1
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> x-ds-pow-response是Base64编码的JSON，answer由native库根据服务器下发的challenge和salt计算，challenge/salt/signature均来自服务器。
> 
> - **字段结构：** x-ds-pow-response 初看像JWT，实际是Base64编码的JSON，解码后含 `algorithm=DeepSeekHashV1`、challenge、salt、signature、answer、target_path 等字段，并可通过Python base64+json解码验证。
> - **answer生成：** Hook `com.deepseek.crypto.PowCalculator.nativeCalculateDeepSeekHashV1Pow` 后发现，入参为 challenge、salt 和 difficulty（如144000），返回值即 answer（示例调用得到63312）。
> - **服务端下发：** challenge、salt、signature 并非客户端本地生成，而是由服务器接口返回；Fiddler抓包可见 challenge 对象含 difficulty=144000、expire_at=1739764288699、expire_after=300000、target_path 等参数。
> - **分析方法：** 整个过程先用DeepSeek辅助解码和生成代码，再用Frida Hook定位native函数，最后用Fiddler抓包确认数据来源；作者认为AI是工具，决定性因素仍是使用它的人。

一、目标

## 一、目标

山中方一日，世上已千年。Chatgpt的喧嚣感觉还在昨天，DeepSeek已经迎面而来。今天我们就在DeepSeek的帮助下来分析DeepSeek App

```bash
POST https://chat.deepseek.com/api/v0/chat/completion HTTP/2
host: chat.deepseek.com
x-ds-pow-response: eyJhbGdvcml0aG0iOiJEZWVwU2Vla0hhc2hWMSIsImNoYWxsZW5nZSI6ImNlYmFiNGFhOGU1MDk1NTY2NmY1ODk4MTZjNjY4MTExNDRlMDU2YThmNDFjNDNhNDNiZDc4Y2VkYzRiNWY0YTEiLCJzYWx0IjoiODM2MGY4YzkyMDVjOTZjMzJiN2EiLCJzaWduYXR1cmUiOiIxMGI3ODQ5YjFlNjIwM2IyODhkYzQ5NzVhMWUyMzc1M2VkOWQ2ZmI2NTY5NjRiOGU4NmRhZWJhYjM2MjhhNDBjIiwiYW5zd2VyIjo3NzkwNiwidGFyZ2V0X3BhdGgiOiIvYXBpL3YwL2NoYXQvY29tcGxldGlvbiJ9
x-client-platform: android
```

我们今天的目标是 x-ds-pow-response

## 二、步骤

### Jwt?

eyjh开头，很像是jwt，所以第一反应就是去jwt在线解密一下。结果很遗憾，不是jwt

### DeepSeek登场

把x-ds-pow-response的内容复制进DeepSeek的对话框，大大方方的问他， x-ds-pow-response可能是什么加密算法？

不出意外的话，意外出现了

```bash
服务器繁忙，请稍后再试。
```

应对方法是 使用App:)

```bash
`x-ds-pow-response` 看起来像是一个包含某种加密或哈希算法响应的HTTP头部字段。根据你提供的内容，它包含了一个JSON对象，其中包含以下字段：

- `algorithm`: 指定了使用的算法，这里是 `DeepSeekHashV1`。
- `challenge`: 一个挑战字符串，可能是用于验证或防伪的随机值。
- `salt`: 盐值，用于增加哈希的复杂性。
- `signature`: 签名，可能是对某些数据进行哈希或加密后的结果。
- `answer`: 一个数值，可能是对挑战的某种计算结果。
- `target_path`: 目标路径，指示这个响应应该被应用到哪个API路径。

从这些信息来看，`DeepSeekHashV1` 可能是深度求索公司自定义的一种哈希算法，用于生成某种形式的数字签名或验证码。这种算法可能结合了挑战、盐值和目标路径来生成一个唯一的签名，以确保请求的完整性和来源的真实性。

由于这是自定义算法，具体的加密或哈希细节没有公开的标准可以参考。如果你需要更深入的了解，可能需要查阅深度求索公司的官方文档或联系他们的技术支持。
```

联系官方技术支持有点扯了，不过他为什么知道里面包含了Json对象，并且还知道这些明文？

继续问问，反正也不花钱？

```bash
问: 你怎么知道x-ds-pow-response的内容里面包含DeepSeekHashV1 ？

答: 我理解你的疑问。实际上，我并没有直接访问或解析你提供的 `x-ds-pow-response` 内容的能力。我的回答是基于你提供的文本内容进行的推测和分析。

在你提供的 `x-ds-pow-response` 中，有一个 JSON 对象，其中包含了一个字段 `"algorithm": "DeepSeekHashV1"`。这个字段明确指出了使用的算法是 `DeepSeekHashV1`。因此，我根据这个信息推断出 `x-ds-pow-response` 可能使用了 `DeepSeekHashV1` 这个算法。

如果你有更多关于这个字段的具体信息或上下文，我可以进一步帮助你分析和理解。
```

这个回答我不满意，看来我问的不对。

````python
问: 如何从eyJhbGdvcml0aG0iOiJEZWVwU2Vla0hhc2hWMSIsImNoYWxsZW5nZSI6ImNlYmFiNGFhOGU1MDk1NTY2NmY1ODk4MTZjNjY4MTExNDRlMDU2YThmNDFjNDNhNDNiZDc4Y2VkYzRiNWY0YTEiLCJzYWx0IjoiODM2MGY4YzkyMDVjOTZjMzJiN2EiLCJzaWduYXR1cmUiOiIxMGI3ODQ5YjFlNjIwM2IyODhkYzQ5NzVhMWUyMzc1M2VkOWQ2ZmI2NTY5NjRiOGU4NmRhZWJhYjM2MjhhNDBjIiwiYW5zd2VyIjo3NzkwNiwidGFyZ2V0X3BhdGgiOiIvYXBpL3YwL2NoYXQvY29tcGxldGlvbiJ9
提取出 DeepSeekHashV1 字符串，请用python代码实现？

答: 要从 `eyJhbGdvcml0aG0iOiJEZWVwU2Vla0hhc2hWMSIsImNoYWxsZW5nZSI6ImNlYmFiNGFhOGU1MDk1NTY2NmY1ODk4MTZjNjY4MTExNDRlMDU2YThmNDFjNDNhNDNiZDc4Y2VkYzRiNWY0YTEiLCJzYWx0IjoiODM2MGY4YzkyMDVjOTZjMzJiN2EiLCJzaWduYXR1cmUiOiIxMGI3ODQ5YjFlNjIwM2IyODhkYzQ5NzVhMWUyMzc1M2VkOWQ2ZmI2NTY5NjRiOGU4NmRhZWJhYjM2MjhhNDBjIiwiYW5zd2VyIjo3NzkwNiwidGFyZ2V0X3BhdGgiOiIvYXBpL3YwL2NoYXQvY29tcGxldGlvbiJ9` 中提取出 `DeepSeekHashV1` 字符串，可以按照以下步骤实现：

1. 这是一个 Base64 编码的字符串，首先需要将其解码为 JSON 格式。
2. 解码后，解析 JSON 对象，提取 `algorithm` 字段的值。

以下是 Python 代码实现：

```python
import base64
import json

# Base64 编码的字符串
encoded_str = "eyJhbGdvcml0aG0iOiJEZWVwU2Vla0hhc2hWMSIsImNoYWxsZW5nZSI6ImNlYmFiNGFhOGU1MDk1NTY2NmY1ODk4MTZjNjY4MTExNDRlMDU2YThmNDFjNDNhNDNiZDc4Y2VkYzRiNWY0YTEiLCJzYWx0IjoiODM2MGY4YzkyMDVjOTZjMzJiN2EiLCJzaWduYXR1cmUiOiIxMGI3ODQ5YjFlNjIwM2IyODhkYzQ5NzVhMWUyMzc1M2VkOWQ2ZmI2NTY5NjRiOGU4NmRhZWJhYjM2MjhhNDBjIiwiYW5zd2VyIjo3NzkwNiwidGFyZ2V0X3BhdGgiOiIvYXBpL3YwL2NoYXQvY29tcGxldGlvbiJ9"

# 解码 Base64 字符串
decoded_bytes = base64.b64decode(encoded_str)
decoded_str = decoded_bytes.decode('utf-8')

# 解析 JSON 对象
data = json.loads(decoded_str)

# 提取 algorithm 字段的值
algorithm = data.get("algorithm")

print("提取的 algorithm 值:", algorithm)
```

### 代码说明：
1. **Base64 解码**：使用 `base64.b64decode` 将 Base64 编码的字符串解码为字节数据，然后转换为字符串。
2. **JSON 解析**：使用 `json.loads` 将解码后的字符串解析为 Python 字典。
3. **提取字段**：从字典中提取 `algorithm` 字段的值。

### 输出结果：
```plaintext
提取的 algorithm 值: DeepSeekHashV1
```

### 注意事项：
- 如果输入的 Base64 字符串无效，`base64.b64decode` 会抛出异常。
- 如果 JSON 格式不正确，`json.loads` 也会抛出异常。
- 确保输入的字符串是完整的 Base64 编码数据。
````

woo，这才答道点子上了，原来就是个Base64，程序员还是得用代码来说话。

```
把Base64解一下，明文出来了
```

```bash
{"algorithm":"DeepSeekHashV1","challenge":"cebab4aa8e50955666f589816c66811144e056a8f41c43a43bd78cedc4b5f4a1","salt":"8360f8c9205c96c32b7a","signature":"10b7849b1e6203b288dc4975a1e23753ed9d6fb656964b8e86daebab3628a40c","answer":77906,"target_path":"/api/v0/chat/completion"}
```

challenge,salt,signature,answer 这四个值是我们关注的要点了。

### Jadx出马

搜索文本 DeepSeekHashV1

```javascript
package com.deepseek.crypto;

/* loaded from: classes.dex */
public final class PowCalculator {

    /* renamed from: a, reason: collision with root package name */
    public static final PowCalculator f12608a = new PowCalculator();

    static {
        System.loadLibrary("rscrypto");
    }

    private final native long nativeCalculateDeepSeekHashV1Pow(String str, String str2, long j9);

    public final long a(long j9, String str, String str2) {
        return nativeCalculateDeepSeekHashV1Pow(str, str2, j9);
    }
}
```

先Hook这个 nativeCalculateDeepSeekHashV1Pow函数再说

```javascript
        let PowCalculator = Java.use("com.deepseek.crypto.PowCalculator");
        PowCalculator["nativeCalculateDeepSeekHashV1Pow"].implementation = function (str, str2, j9) {
            console.log(`PowCalculator.nativeCalculateDeepSeekHashV1Pow is called: str=${str}, str2=${str2}, j9=${j9}`);
            let result = this["nativeCalculateDeepSeekHashV1Pow"](str, str2, j9);
            console.log(`PowCalculator.nativeCalculateDeepSeekHashV1Pow result=${result}`);

            var stack = threadinstance.currentThread().getStackTrace();
            console.log("Rc Full call stack:" + Where(stack));

            return result;
        };
```

跑一下

```javascript
PowCalculator.nativeCalculateDeepSeekHashV1Pow is called: str=79385dcd26da6f3e7276_1739766754276_, str2=ce96433fd479a8648ba29145c2520a787102e145b2f8998ea81ddfe010c3d5a8, j9=144000
PowCalculator.nativeCalculateDeepSeekHashV1Pow result=63312
Rc Full call stack:dalvik.system.VMStack.getThreadStackTrace(Native Method)
 ds: java.lang.Thread.getStackTrace(Thread.java:1841)
 ds: com.deepseek.crypto.PowCalculator.nativeCalculateDeepSeekHashV1Pow(Native Method)
 ds: com.deepseek.crypto.PowCalculator.a(SourceFile:1)
 ds: C6.h.g(SourceFile:59)
 ds: C6.s.s(SourceFile:44)
 ds: za.a.j(SourceFile:6)
 ds: Wa.D.run(SourceFile:104)
 ds: db.a.run(SourceFile:127)
```

入参有 challenge,salt 返回值是 下一次的 answer。

到此为止，我们知道了answer的生成，但是 challenge,salt,signature这三位大哥还是不知道。

### 顺着堆栈找

顺着这次hook的堆栈一直往上早。把有疑点的函数都hook上，结果绕了半天，没啥收获。

本来想问问DeepSeek这几个值是怎么来的，不过感觉应该没啥用。 AI呆住了，人脑上线了 。问下DeepSeek应该如何描述这种情况。

```bash
技术文档版

「当AI系统触发逻辑僵局时，人工智控模块自动激活接管协议。」

（解析：采用"逻辑僵局-激活接管"的技术术语，符合系统架构文档的专业语境）

科幻叙事版

「量子矩阵的辉光骤然凝滞，生物神经元的星火在数据深渊中重燃。」

（解析：通过"量子矩阵-生物神经元"的意象对立，构建赛博朋克风格的场景画面）

商业方案版

「智能运算流中断0.3秒后，人类决策引擎无缝衔接启动，保障服务连续性。」

（解析：用"运算流-决策引擎"的工业隐喻，突出系统可靠性的商业价值）

哲学思辨版

「当算法陷入认知迷雾，意识的灯塔穿透数据海啸指引航向。」

（解析：通过"迷雾-灯塔"的隐喻体系，引发对人工智能局限性的深层思考）

应急响应版

「侦测到AI决策树坍缩，立即启动人类指挥官协议，完成μ级秒差切换。」

（解析：使用"坍缩-μ级秒差"等精准表述，强调应急响应的及时性）

诗歌化表达

「硅基的月光在逻辑悬崖搁浅，碳基的朝阳已攀上认知峰巅」

（解析：借"硅基-碳基"的物质属性差异，构建科技与人文交融的意境）
```

我喜欢这句话 硅基的月光在逻辑悬崖搁浅，碳基的朝阳已攀上认知峰巅

### Fiddler搜索

捍卫一下碳基生命的尊严，我认为challenge,salt,signature这三位大哥可能是服务器返回的。

搜一下吧 cebab4aa8e50955666f589816c66811144e056a8f41c43a43bd78cedc4b5f4a1

```bash
{
    "code": 0,
    "msg": "",
    "data": {
        "biz_code": 0,
        "biz_msg": "",
        "biz_data": {
            "challenge": {
                "algorithm": "DeepSeekHashV1",
                "challenge": "cebab4aa8e50955666f589816c66811144e056a8f41c43a43bd78cedc4b5f4a1",
                "salt": "8360f8c9205c96c32b7a",
                "signature": "10b7849b1e6203b288dc4975a1e23753ed9d6fb656964b8e86daebab3628a40c",
                "difficulty": 144000,
                "expire_at": 1739764288699,
                "expire_after": 300000,
                "target_path": "/api/v0/chat/completion"
            }
        }
    }
}
```

真相只有一个，本地死活找不到的时候，大概率就是服务器返回的了。Fiddler以后应该可以接入DeepSeek,直接提示我。这样量子矩阵的辉光就不容易凝滞了。

## 三、总结

以后的程序员只会有一种，利用辅助AI工具的程序员。不会使用AI的程序员一定是要被淘汰的。目前为止(以后的事就不好说了)再好的AI也是工具，要完成任务，决定性的因素还是掌握AI的人。

小时候看的小人书里，有个武林高手绝招是脑袋后面的辫子，叫神鞭。后来解放了，辫子剪了，人家依然是高手，叫神枪手。这位高手淡淡的说： 鞭没了，神还在 。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0586ab90178bcbc2.webp)

1:ffshow

当算法陷入认知迷雾，意识的灯塔穿透数据海啸指引航向

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
