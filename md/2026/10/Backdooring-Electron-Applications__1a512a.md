---
title: Backdooring Electron Applications
source: https://whiteknightlabs.com/2026/01/20/backdooring-electron-applications/
source_host: whiteknightlabs.com
clip_date: 2026-10-08T10:14:13+08:00
trace_id: f55ec17b-af49-43c0-b957-bb2491d98bd3
content_hash: e3982747bbae74c20492e195474fdba689f4416e998f87d9765631a86c53ad25
status: synced
tags:
  - 恶意样本
  - 风控对抗
series: null
feed_source: White Knight Labs·UEFI/红队
ai_summary: 在 WDAC 等强管控环境中,通过后门化已签名的 Electron 应用并借 Azure Blob 通信,可绕过 EDR 落地 C2。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3f375244-d011-8120-892a-d1b462df18aa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在 WDAC 等强管控环境中,通过后门化已签名的 Electron 应用并借 Azure Blob 通信,可绕过 EDR 落地 C2。
> 
> - **备选执行路径:** PowerShell 未被封时可执行脚本但受 AMSI 分析;MSBuild.exe 等 LOLBin 检测规则过多、找冷门样本耗时;DLL 侧加载取决于 WDAC 配置;上述均失败才用 Loki C2。
> - **Loki C2 通信机制:** 服务端需配置 Azure 账号,通信走 Blob;客户端二进制需传入 SAS Token 与 Blob URL 两个参数,服务端填入生成的 Meta Container 值。
> - **后门流程:** 可选后门化现有应用或下载已植入的新应用;测试确认 Mailspring 存在该缺陷,删空其 `resources/app` 后写入植入体,再投放至目标机器。
> - **规避与效果:** 已在不混淆的情况下于安装 MDE 的机器上成功上线,主流 EDR 多数无阻;其余告警可通过 JS 混淆、修改并重编译 C2 代码(调整函数顺序、注释无用函数)规避。
> - **风险提示:** 后门化 Teams 等既有应用时操作不精确会导致应用损坏、无法运行。

In increasingly restrictive corporate environments, deploying and maintaining C2 implants on Windows systems presents unique challenges. Signed execution policies, strict network controls, advanced segmentation, and continuous software behavior monitoring severely limit traditional loading and communication techniques.

This blog explores how to adapt implant development and operational strategies to survive under these conditions. It covers topics such as executing under signature requirements, covert communication within networks under deep inspection, and approaches to maintaining persistence without violating environmental constraints.

## 受限环境下的执行思路

Imagine you gain access to a Windows environment configured in a highly restrictive way, which prevents you from loading unsigned implants by enforcing Windows Defender Application Control (WDAC) policies. What would you do in that case?

-   Use PowerShell if it is not blocked

If PowerShell is not blocked, you can execute your scripts, keeping in mind that AMSI will analyze them and determine whether the code is malicious or not.

-   Use a LOLBin such as MSBuild.exe, which already has numerous detection rules (MSBuild.exe is a legitimate Microsoft Build Engine used to compile and execute project files, but it can be abused as a Living-off-the-Land Binary LOLBin to execute malicious code while blending in with normal system activity). You could try to look for a lesser-known one, but the research would take time and I don’t think it would be the most cost-effective approach.

-   DLL Sideloading, if the WDAC configuration allows it—DLL Sideloading is a technique in which an application loads a malicious Dynamic Link Library placed by an attacker instead of the legitimate one, and WDAC, Windows Defender Application Control, is a Windows security feature that restricts which applications and code are allowed to run on a system.

## Loki C2 与 Electron 应用

If all else fails, we can use an alternative called [Loki C2](https://github.com/boku7/Loki). It’s a C2 that backcodes applications built with Electron.

But what exactly is an Electron application? You’re probably familiar with applications like Teams, Notion, or Discord. Well, they’re built in Node.js using a framework called Electron (basically HTML, CSS, and JavaScript).

Using this C2 server is very simple, you just need to download the server (.exe) and configure it using an Azure account, as communication will take place through a Blob.

## 植入体配置参数

Firstly, the client binary will require two parameters: the SAS Token and the Blob URL.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/38f13df543a98c4b.png)

Implant Configuration

This will generates a folder with the implant’s contents, ready for use. I personally recommend obfuscating the implant’s contents using any JavaScript obfuscator you know to avoid IOCs. It also generates the Meta Container parameter, which we then copy entirely to the server:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/69530e8076e382ed.png)

C2 Server Configuration

## 后门化 Mailspring 应用

With everything configured, we must choose whether we want to back-store an existing application (e.g., Teams) or download a new application already implanted.

In this case, we opted for the second option. Research has been conducted and discovered that the Mailspring application is vulnerable to this technique.

Therefore, the application was downloaded, and the contents of the resources/app folder were deleted.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/45f9af3bd26fde7c.png)

Vulnerable Electron App

That content was replaced by our implant which will be pasted inside resources/app.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f44d8c13bb238ac9.png)

JS Implant

Now all that remains is to download the application onto the victim’s device and establish the connection.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9047c989efda3d48.png)

Connection successfully established

As shown in the image, the connection has been successfully established on a computer with MDE installed.

### Final Considerations

## 实战效果与建议

This technique can be very powerful in some environments because it uses a signed application and communication is established through an Azure domain, which allows execution and connection in very restrictive environments. Various tests have been conducted with most of the top EDRs, and in many of them, the implant works even without obfuscation. Others report certain alerts that can be avoided by obfuscating the implant. Another important point is the option of backloading an application like Teams instead of downloading a new one. Be careful, if this isn’t done precisely, the application can become corrupted and stop working. One more thing that has worked for me is modifying the C2 code and recompiling it, altering the order of the functions and commenting out some that are not needed.
