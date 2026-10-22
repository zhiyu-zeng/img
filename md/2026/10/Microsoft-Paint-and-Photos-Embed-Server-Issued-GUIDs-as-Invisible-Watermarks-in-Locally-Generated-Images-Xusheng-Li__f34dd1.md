---
title: "Microsoft Paint and Photos Embed Server-Issued GUIDs as Invisible Watermarks in Locally-Generated Images :: Xusheng Li"
source: https://xusheng.dev/posts/reversing/mspaint_invisible_watermark/main/
source_host: xusheng.dev
clip_date: 2026-10-22T10:24:02+08:00
trace_id: 9235786d-0c53-432d-83a7-4d3cd4515965
content_hash: fc0e92ffaf784b8fce3cbb885a6780e8df7fd3523c3f663a0f99e25c487007b2
status: synced
tags:
  - Windows逆向
  - AI应用
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: 微软 Paint 与 Photos 在本地进行 AI 生成时，会先把提示词发到远程审核，再把服务器返回的 GUID 作为不可见水印写进图像像素，同时写入 C2PA 元数据。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 40175244-d011-8163-afeb-d870946fe510
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 微软 Paint 与 Photos 在本地进行 AI 生成时，会先把提示词发到远程审核，再把服务器返回的 GUID 作为不可见水印写进图像像素，同时写入 C2PA 元数据。
> 
> - **解密本地模型：** Paint 目录内有四个 `.onnxe` 模型（其中 seg 23MB、mager 302MB）；XOR 密钥从 `Microsoft_2023` 更换为 `segapi.dll` 里 4,096 字节的字符串，解密后是合法 ONNX 文件。
> - **水印写入函数：** `Watermarker.dll!WmkWriteWatermark` 只接受 16 字节 payload，并组装成 `0x4c || GUID || 字节和模 256` 的 18 字节消息；它要求宽、高均不小于 192，把尺寸按 8 像素对齐，逐比特在选定的图像块上做量化扰动（5×3 矩阵、SVD 风格），且每个 bit 至少嵌入 3 次。
> - **GUID 来源：** 生成前，`AIServices.dll` 会向 `v1/paint-cocreator/moderate-prompt` 发送 POST 请求；响应中的 `watermarkId`（一个 GUID）就是嵌入值。作者实测拿到了 `83424621-…` 并且 `containsHumanReference` 字段随提示词变化；客户端还会把上一次的 `promptGenerationId` 作为 `lastPromptGenerationId` 回传，使连续请求可以关联。
> - **元数据一致性：** 保存的 PNG 在 `IHDR` 后包含约 19KB 的 `caBX` 块，其中的 `c2pa.soft-binding` 使用算法 `com.microsoft.invismark.1`，其 value 与像素内的 watermarkId 完全相同。
> - **失败处理与格式限制：** 保存格式限制为 PNG、JPEG、GIF 和 `.paint`，BMP 被排除（无法承载 manifest）；Paint 在嵌入失败时直接判定生成失败，Photos 则只记录日志，并继续返回未加水的图像。

## TL;DR

-   Microsoft Paint supports both local and cloud image generation
-   Paint and Photos also ship local AI models
-   The two apps send the prompt to a remote server for moderation
-   The server returns a GUID along with the moderated prompt
-   The GUID is embedded into the locally generated image as an invisible watermark
-   A separate visible-watermark setting does not control this invisible watermark
-   On Copilot+ PCs, image generation is local but prompt moderation remains remote
-   Microsoft discloses that Paint adds C2PA metadata to AI-generated images
-   AI-generated image saves limited to C2PA-preserving formats: PNG, JPEG, GIF, and `.paint`

![Paint sends the user prompt to Microsoft’s moderation server, receives a moderated prompt and watermark GUID, generates the image locally, and embeds the GUID into the final image pixels](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7e4712d5c791727d.jpg)

## A curious look at Microsoft Paint

This research started with my curiosity about Paint. I recently had some success looking into less-explored Windows features like [UCPD](https://binary.ninja/2026/08/04/ucpd-dynamic-rules.html), [WHESCVC](https://xusheng.dev/posts/reversing/whesvc/main/), and I have long known that Microsoft added a bunch of [AI features](https://support.microsoft.com/en-us/windows/ai/ai-apps/use-copilot-pc-features-in-paint) into the Paint app. I do not know if anyone actually uses Paint + AI to generate images, but I wanted to see how exactly the image generation works.

Before I started, I expected that it simply called a remote API to do the image generation. However, after I set up [Binary Ninja MCP](https://dev-docs.binary.ninja/guide/mcp.html) with Codex and started the analysis, I soon realized that Microsoft actually shipped local models in Windows as part of Copilot.

The Paint App is sitting in the following path (yes, they are all [Windows Apps](https://learn.microsoft.com/en-us/windows-app/overview) now):

```text
C:\Program Files\WindowsApps\Microsoft.Paint_11.2605.71.0_x64__8wekyb3d8bbwe\PaintApp\
```

And there are four apparent model files with the `.onnxe` extension:

```text
seg.onnxe          23.1 MB
inseg_enc.onnxe    28.0 MB
inseg_dec.onnxe    16.5 MB
mager.onnxe       302.4 MB
```

The format of `seg.onnxe` was [previously known](https://itstechbased.com/new-windows-11-build-25947-new-23h2-news-new-paint-and-microsoft-store-and-fixes-canary/), i.e., when it is XORed with the string `Microsoft_2023`, it becomes a normal ONNX file. However, the format of the other three `.onnxe` files initially looked different.

It turned out that Microsoft had not changed the algorithm, only the key. `segapi.dll` contains a small key registry:

```text
ps_enc_key.1.0.80-main -> "Microsoft_2023"
ps_enc_key.1.0.81-main -> a 4,096-byte alphanumeric string
```

After decryption, `onnx.checker.check_model()` works on all of them:

| Model | Graph |
| --- | --- |
| `seg.onnx` | 1,094 nodes, input `input_image`, output `output` |
| `inseg_enc.onnx` | 1,014 nodes, output `image_embeddings` |
| `inseg_dec.onnx` | 1,133 nodes, inputs for embeddings, points and masks; output `masks` |
| `mager.onnx` | 15,284 nodes, image/mask inputs; output `output` |

## A visible watermark

While walking through these files, I found a `Watermarker.dll`:

![The properties of Watermarker.dll included with Microsoft Paint](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/53556ed9ba2bca79.png)

This is not super surprising to me, because while I interacted with the Paint app, I already discovered that it has a setting to embed a [visible watermark](https://support.microsoft.com/en-us/topic/include-a-watermark-when-content-from-microsoft-365-is-ai-generated-b00a656e-ae61-4692-8086-67d004421030) to the image that it produces:

![Paint offers Never, Always, and Ask every time choices for its visible AI watermark](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1ff8650645356405.png)

The visible watermark is just a small Copilot logo at the bottom right of the image, which is totally normal.

Then, out of nowhere, I decided to ask AI to analyze the DLL and see if it could also be embedding an *invisible* watermark. This is part of my intuition as a reverse engineer, because the file is 1.67 MB in size, which is unusually large for such trivial functionality (arguably, the visible watermark does not even require a separate DLL). Apparently, the recent Claude Code [text-watermark announcement](https://www.anthropic.com/news/claude-text-watermark) also played a role in prompting me to think about this possibility.

## An invisible watermark

To begin with, the visible watermark is added by `AddPerceptibleWatermark`:

```text
CPBDoc::Save(...)
  |
  `-- perceptible-watermark save helper(bitmap, WatermarkSetting)
        |
        +-- WatermarkSetting::Never
        |     `-- return the original bitmap
        |
        +-- WatermarkSetting::AskEveryTime
        |     `-- show the Yes / No confirmation popup
        |           +-- No: return the original bitmap
        |           `-- Yes: continue
        |
        `-- Always or confirmed Yes
              +-- Paint::AI::GetPerceptibleWatermarkSvg()
              `-- Paint::AI::AddPerceptibleWatermark(bitmap, SVG stream)
                    `-- composite the visible Copilot logo
```

Then there is also a different `WmkWriteWatermark` function:

```c
Watermarker.dll!WmkWriteWatermark(
    output_pixels,
    payload,
    payload_length,
    width,
    height,
    stride,
    input_pixels,
    pixel_format);
```

Tracing the call tree, we can see `WmkWriteWatermark` is called after a local Stable Diffusion image generation. And if `WmkWriteWatermark` fails, Paint converts the entire generation into an error rather than returning the image without it:

```text
CocreatorViewModel::GenerateImageAsync(...)
  |
  `-- Paint::AI::StableDiffusionHelpers::GenerateAsync(..., watermarkId, ...)
        |
        `-- Microsoft.ImageCreation.ImageGenerator
              |
              `-- NPU-generated image result
                    |
                    +-- output safety/moderation checks
                    |
                    +-- Paint::AI::AddWatermark(bitmap, watermarkId)
                    |     |
                    |     `-- Watermarker.dll!WmkWriteWatermark(...)
                    |           |
                    |           +-- success: return the watermarked bitmap
                    |           `-- failure: turn generation into an error
                    |
                    `-- construct successful StableDiffusionResult
```

Then it is natural to ask what the incoming `payload` actually is. It quickly becomes apparent that it must be 16 bytes:

```c
if (payload_length < 16)
    return -6;

if (payload_length > 16)
    return -5;
```

It is funny to me that the code is using two different error codes when the payload is too short or too long. The function then ignores the length parameter and uses a hard-coded loop bound when it copies the payload:

```c
for (size_t i = 0; i < 16; i++)
    message.push_back(payload[i]);
```

We do not yet know what the 16-byte payload is, but as we will see later, it is a GUID! `WmkWriteWatermark` does not embed the GUID directly. Its wrapper constructs the following 18-byte (144-bit) message:

```text
0x4c || GUID[0..15] || (sum of the 16 GUID bytes modulo 256)
```

The core encoder rounds the usable image dimensions down to multiples of eight and keeps 144 counters, one for each bit. It requires every bit to be placed at least three times.

The encoder itself can be summarized as:

```text
WmkWriteWatermark(output, guid, 16, width, height, stride, input, format)
  |
  +-- validate pointers, format, stride, and payload length
  +-- require width >= 192 and height >= 192
  +-- construct payload
  |     `-- 0x4c || GUID || byte-sum checksum
  +-- expand 18 bytes into 144 individual bits
  +-- round usable dimensions down to 8-pixel boundaries
  +-- scan/select suitable image blocks
  +-- quantize selected block/matrix values according to each bit
  +-- require at least three successful placements per bit
  |     |
  |     `-- insufficient capacity -> return -8
  `-- reconstruct RGB pixels into the output buffer
```

The embedding loop performs small quantized changes over selected image blocks. It contains 3-by-5 matrix operations and a matrix-decomposition routine, and it uses constants including `24.0`, `0.25`, `0.5`, and `0.2`. This looks like a content-adaptive block-domain, SVD-style watermark.

I am not an expert in image watermarking, but one thing should be clear – this is an invisible watermark! AI even wrote some code to call this function directly and tested it with a synthetic 512-by-512 BGRA image – 193,376 of the 262,144 pixels changed after adding the watermark.

That led to the next question. Where does the input of the watermark come from?

## a GUID from remote prompt moderation

At the `WmkWriteWatermark` boundary, the payload is only a pointer and a length. Knowing that it must be 16 bytes was a clue, but many things can be 16 bytes. I therefore started walking backward through its callers. The immediate wrapper in `PaintAIManager.dll` has this symbolized signature:

```cpp
Paint::AI::AddWatermark(
    Gdiplus::Bitmap& image,
    winrt::guid const& watermarkId);
```

`winrt::guid`, yikes! Now we know that the 16-byte watermark payload is indeed a GUID.

Further tracking the source, we find that the GUID actually comes from a network request. Before Paint runs the local image model, `AIServices.dll` sends the prompt and style to:

```text
https://apsaiservices-a0fqcjc6bzbhgdcd.b02.azurefd.net/
v1/paint-cocreator/moderate-prompt
```

The request is JSON and contains at least these fields:

```json
{
  "prompt": "...",
  "style": "...",
  "lastPromptGenerationId": "..."
}
```

The response parser expects:

```json
{
  "revisedPrompt": "...",
  "promptGenerationId": "...",
  "watermarkId": "...",
  "containsHumanReference": false
}
```

Static analysis is nice, but at this point I wanted to see a real response from the server. I reused Paint’s own authenticated session and sent the following prompt through the moderation endpoint:

```text
a cobalt blue circle above a tiny orange square
```

The server returned HTTP 200:

```json
{
  "revisedPrompt": "a cobalt blue circle above a tiny orange square",
  "promptGenerationId": "74d9e06b-adea-43ce-85fe-186a26e2e34a",
  "watermarkId": "83424621-03cb-40e3-9808-a9fae837156d",
  "containsHumanReference": false
}
```

I also tried the prompt `a portrait of a smiling person wearing a blue hat`. This time the response contained a different pair of GUIDs and `containsHumanReference` was `true`. The field is therefore a server-side classification of whether the prompt refers to a human. Paint parses and stores it alongside the IDs, although I found no evidence that it controls the watermarking step itself.

`ParseModerateResponse` parses both ID strings as GUIDs and rejects zero values with `InvalidPromptGenerationId` or `InvalidWatermarkId`. The server’s `watermarkId` is what becomes part of the generated image:

```text
PaintUI.dll
  `-- IPromptModerationService
        `-- PaintAIManager.dll
              `-- AIServices.dll!ModerateAsync(...)
                    |
                    +-- build JSON
                    |     +-- prompt
                    |     +-- style
                    |     `-- lastPromptGenerationId
                    |
                    +-- HTTPS POST /v1/paint-cocreator/moderate-prompt
                    |
                    `-- AIServices.dll!ParseModerateResponse(response)
                          +-- revisedPrompt
                          +-- promptGenerationId -> parse as GUID
                          +-- watermarkId        -> parse as GUID
                          `-- containsHumanReference
                                |
                                `-- PaintUI stores WatermarkId
                                      `-- StableDiffusionHelpers::GenerateAsync(..., watermarkId, ...)
                                            `-- local Stable Diffusion result
                                                  `-- Paint::AI::AddWatermark(bitmap, winrt::guid const&)
                                                        `-- WmkWriteWatermark(..., guid, 16, ...)
                                                              `-- modified RGB pixels
```

In other words, “generated locally” does not mean that the complete operation is local. Microsoft receives and moderates the prompt, then issues the unique GUID that Paint embeds into the locally generated image. Paint also sends the previous `promptGenerationId` as `lastPromptGenerationId` with its next moderation request, allowing successive requests to be linked explicitly.

## The same watermark GUID in C2PA metadata

There is another piece to this story. Paint does more than alter the pixels. It also attaches [C2PA Content Credentials](https://c2pa.org/) to the saved file. The code responsible for this lives in `ProvenanceHelper.dll`, backed by `provenancesdk.dll`.

For the local Stable Diffusion path, the flow looks like this:

```text
local Stable Diffusion result
  |
  +-- Paint::AI::AddWatermark(bitmap, watermarkId)
  |     `-- Watermarker.dll!WmkWriteWatermark(..., watermarkId, 16, ...)
  |
  `-- AIServices.dll!SignIngredientOnlineAsync(..., promptGenerationId, image, ...)
        |
        +-- POST /v1/paint-cocreator/image-sign
        |     +-- imageMetadata
        |     |     +-- PromptGenerationId
        |     |     +-- GenerationSeed
        |     |     +-- CreativityLevel
        |     |     +-- AIFVersion
        |     |     `-- moderation scores
        |     `-- imageToSign.jpg
        |
        `-- ParseProvenanceResponse(...)
              `-- server-supplied C2PA manifest
                    `-- ProvenanceHelper::InsertManifestIngredient(...)
                          `-- AuthoringFinalizeOutputToBufferAsync(...)
                                `-- final image with C2PA metadata
```

Notice that the signing request sends `PromptGenerationId`, while the image already contains the separately returned `watermarkId`. The server assigned both values during moderation, so it can associate the signing request with the watermark already present in the submitted pixels.

I then saved a real image directly from Paint’s Image Creator and inspected its PNG chunks. Immediately after `IHDR` was an 18,979-byte `caBX` chunk containing a signed C2PA manifest. The interesting part was this:

```json
{
  "c2pa.soft-binding": {
    "alg": "com.microsoft.invismark.1",
    "blocks": [
      {
        "scope": "the entire image",
        "value": "83424621-03cb-40e3-9808-a9fae837156d"
      }
    ]
  },
  "c2pa.actions.v2": {
    "actions": [
      {
        "action": "c2pa.watermarked",
        "description": "Content watermarked by Microsoft Responsible AI"
      }
    ]
  }
}
```

Decoded into something more readable, the manifest says:

-   Generator: `Microsoft Responsible AI Provenance`
-   AI system: `Azure OpenAI ImageGen`
-   Action: `c2pa.watermarked`
-   Algorithm: `com.microsoft.invismark.1`
-   Watermark value: `83424621-03cb-40e3-9808-a9fae837156d`
-   Description: `Content watermarked by Microsoft Responsible AI`

The server’s `watermarkId`, the identifier embedded into the pixels, and the C2PA `c2pa.soft-binding.value` are the same per-generation value.

That relationship is important. C2PA calls this a *soft binding*: a value derived from, or embedded into, the content so that the content can still be matched with its provenance record after the file-level manifest has been removed. For a watermark soft binding, the `value` is the watermark’s content identifier. Microsoft cryptographically signed this assertion.

## Why does Paint watermark locally?

At this point, the existence of `Watermarker.dll` started to make more sense. Paint actually has two rather different generation paths.

The Image Creator feature I tested above uses `Azure OpenAI ImageGen`. Generation, watermarking, and provenance packaging can all happen in Microsoft’s cloud, and Paint can simply receive a finished image that already contains both the invisible watermark and C2PA manifest:

```text
Image Creator
  `-- Microsoft cloud
        +-- content filtering
        +-- Azure OpenAI ImageGen
        +-- invisible watermark
        +-- C2PA manifest
        `-- completed image returned to Paint
```

Cocreator is different. On a supported Copilot+ PC, Microsoft [says that the NPU generates the image locally](https://support.microsoft.com/en-us/windows/ai/ai-apps/use-copilot-pc-features-in-paint), while Azure online services still perform the safety checks. The feature therefore requires both a Microsoft account and an internet connection even though the actual Stable Diffusion inference runs on the device:

```text
Cocreator on a Copilot+ PC
  |
  +-- prompt -> Microsoft moderation service
  |                 +-- revisedPrompt
  |                 +-- promptGenerationId
  |                 `-- watermarkId
  |
  +-- revisedPrompt + sketch -> local NPU generation
  |
  +-- Watermarker.dll -> embed watermarkId locally
  |
  `-- online provenance signing -> final C2PA manifest
```

This is probably the reason Paint needs a local watermark implementation at all. A cloud generator can watermark its output before returning it. A local generator cannot rely on that, so Paint has to alter the locally generated pixels itself. It also explains why Paint treats a failure from `WmkWriteWatermark` as a failure of the entire generation instead of quietly returning an unmarked image.

There is another surprisingly visible sign that Microsoft designed the save path around provenance. When I save a generated result directly from the Image Creator pane, Paint offers exactly one format: PNG.

![Paint only offers PNG when saving an AI-generated result directly](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1d830b772077dfac.png)

After an AI result is applied to the Paint canvas, the available formats are still restricted to PNG, JPEG, GIF, and Paint’s own `.paint` format. BMP—the classic Paint format—is conspicuously absent.

This lines up with the formats supported by C2PA. PNG stores its manifest in a `caBX` chunk, JPEG uses one or more `APP11` marker segments, and GIF has its own C2PA application-extension representation. The `.paint` format is controlled by Microsoft and can preserve whatever provenance state Paint requires. By contrast, the [C2PA specification explicitly calls out BMP](https://spec.c2pa.org/specifications/specifications/2.4/specs/ContentCredentials.html) as a classic format that cannot embed arbitrary manifest data without using an external manifest. If Paint allowed the image to be exported directly as BMP, the file-level C2PA manifest would therefore disappear.

The split also raises an interesting security question about the cloud path. If the underlying remote image-generation endpoint can be made to return the generated image before watermarking and provenance packaging—or has an internal option that suppresses those stages—it might be possible to obtain a cloud-generated image with neither signal attached.

How to classify such a path would depend entirely on Microsoft’s design goal. It could be intended behavior if the underlying service is allowed to return raw generations and Paint is merely responsible for applying the provenance layers. It could be a product bug if Microsoft overlooked the possibility of someone calling the API directly and bypassing Paint’s watermarking step. Or it could be a security vulnerability if Microsoft treats watermarking as a mandatory abuse-prevention or provenance control and the endpoint can be made to bypass it. Without knowing the intended trust boundary, all three possibilities remain open.

## Photos app does the same thing

While I was trying to locate the `Watermarker.dll` on disk, I happened to notice that Microsoft Photos contains a DLL with the same name:

```text
C:\Program Files\WindowsApps\
  Microsoft.Windows.Photos_2026.11060.2004.0_x64__8wekyb3d8bbwe\Watermarker.dll
```

There are also local Stable Diffusion operations behind Photos’ Image Creator and Restyle Image features. Both lead to the same watermark wrapper:

```text
Photos Image Creator
  `-- PerformSDTextToImageAndWatermarkAsync(..., promptGenerationId, ...)
        +-- run the local text-to-image model
        `-- ApplyWatermark(image, promptGenerationId)
              +-- parse promptGenerationId as a GUID
              +-- ConvertGUIDtoContiguousByteArray()
              +-- convert RGBA to ARGB
              +-- Watermarker.dll!WmkWriteWatermark(..., guid, 16, ...)
              `-- convert ARGB back to RGBA
```

Restyle Image takes the parallel path:

```text
Photos Restyle Image
  `-- PerformSDSketchToImageAndWatermarkAsync(..., promptGenerationId, ...)
        `-- ApplyWatermark(image, promptGenerationId)
              `-- Watermarker.dll!WmkWriteWatermark(..., guid, 16, ...)
```

A subtle difference between Photos and Paint is failure behavior. If the watermark encoder returns an error, its code logs:

```text
ApplyWatermark encountered error: ... - watermark will not be applied.
```

It then appears to continue returning the generated image. Paint instead treats a watermarking failure as a generation failure and the image is not returned to the user.

## What Microsoft discloses

After doing this analysis, I found that Microsoft does disclose some adjacent parts of the system on its [Image Creator support page](https://support.microsoft.com/en-us/windows/ai/ai-apps/use-image-creator-in-paint-to-generate-ai-art). On content filtering, it says:

> “we apply content filtering to prevent the generation of images”

The same page says that generated images:

> “will contain C2PA manifest helping users identify that it is an AI generated image.”

It also explains that Image Creator uses Azure online services and says Microsoft collects user and device identifiers together with prompts for abuse prevention and monitoring. That is a meaningful disclosure of remote filtering and C2PA metadata.

What the page does not explain is that the C2PA manifest contains a GUID identifying the invisible pixel watermark, or that Paint’s local generation path receives its watermark GUID from remote prompt moderation. Calling the feature “Content Credentials” is accurate, but it does not make this prompt-associated identifier obvious to a Windows user.

## Conclusion

To the best of my knowledge, this is the first research to document and analyze the invisible-watermarking behavior of Paint and Photos. Visible watermarks on AI-generated images are not new—Microsoft documents them for [Microsoft 365](https://support.microsoft.com/en-us/topic/include-a-watermark-when-content-from-microsoft-365-is-ai-generated-b00a656e-ae61-4692-8086-67d004421030) and [Bing Image Creator](https://www.microsoft.com/en-us/bing/features/bing-image-creator/) —nor are invisible pixel watermarks such as [Google’s SynthID](https://deepmind.google/models/synthid/) and [Bing’s hidden watermark](https://cdn-dynmedia-1.microsoft.com/is/content/microsoftcorp/microsoft/final/en-us/microsoft-brand/documents/August-2024-Microsoft-Bing-Systemic-Risk-Assessment-Report-EU-Digital-Services-Act.pdf).

Microsoft does disclose that Paint uses remote content filtering and adds C2PA Content Credentials. The new evidence shows that this metadata is not merely an unrelated file-level AI label: its signed `c2pa.soft-binding` assertion names Microsoft InvisMark and records the identifier carried by the invisible pixel watermark. The file-level manifest and pixel-level watermark are two layers of the same provenance system.

The local and cloud paths also explain the unusual division of labor. Cloud Image Creator can return an already watermarked and signed image, while Cocreator must embed the server-issued identifier after local NPU inference. In both cases, “local” does not mean offline: the prompt still goes to Microsoft for moderation, and the completed local result goes through online provenance signing.

This might be related to [Article 50 of the EU AI Act](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content), whose transparency rules took effect on August 2, 2026 and require AI-generated content to carry a detectable, machine-readable mark—but not a prompt-specific GUID. Microsoft discloses the existence of C2PA metadata, but I could not find a disclosure explaining the server-issued watermark GUID, its association with prompt moderation, or its presence in the pixels. Those details carry obvious privacy and right-to-know implications.

It also appears possible to modify Paint or Photos to bypass both prompt moderation and watermarking. But that does not provide a new capability: anyone can already run Stable Diffusion directly without either mechanism.
