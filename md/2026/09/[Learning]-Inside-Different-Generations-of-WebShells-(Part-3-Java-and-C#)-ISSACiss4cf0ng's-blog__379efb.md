---
title: "[Learning] Inside Different Generations of WebShells (Part 3: Java and C#) | ISSAC/iss4cf0ng's blog"
source: https://iss4cf0ng.github.io/2026/07/21/2026-7-21-Webshell-Part3/
source_host: iss4cf0ng.github.io
clip_date: 2026-09-29T10:27:55+08:00
trace_id: 29bc261a-d66e-4071-9454-5516e202bb54
content_hash: b3fd4e3271c082da1a7f6cfa8feaedceb20bd61d4426689de02be47a31a19e3e
status: synced
tags:
  - WebShell
  - 安全工具
series: null
feed_source: iss4cf0ng·漏洞利用学习
ai_summary: NebulaPulsar（Java/.NET 内存植入体）接入 Alien 框架时，真正的工作量不在代码执行，而在动态加载、命名约定与二进制载荷的兼容设计。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 18
  failed_urls: []
notion_page_id: 3ea75244-d011-8151-ba52-f29e8967b0a1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> NebulaPulsar（Java/.NET 内存植入体）接入 Alien 框架时，真正的工作量不在代码执行，而在动态加载、命名约定与二进制载荷的兼容设计。
> 
> - **NebulaPulsar 运行机制：** 以 JSP/ASP.NET 脚本落地，首次请求用 XOR 解密植入体并存入当前 session，后续 DarkMatter 载荷改用 AES 解密后交由植入体执行。
> - **Alien 集成方式：** 载荷 AES 加密后以原始二进制传输；客户端不在编译期嵌入载荷，而是运行时从 `./Payload` 目录动态加载，便于单独开发、测试与调试。
> - **全小写命名约定：** 类名如 `file_read`，因大小写敏感可避免与第三方库及目标服务器既有类名冲突；该约定在 PHP/ASP/ASP.NET 阶段已成型，省去了整体重命名。C# 载荷采用同样写法。
> - **MemoryShell：** 不落盘的内存 webshell；作者认为其属于超出 NebulaPulsar 范围的高级技术，且更贴近 Alien 插件架构，需单独成文。
> - **DriftingComet 限制：** 该跳板机制目前仅支持文本型 OneShell，与全靠二进制通信的 NebulaPulsar 不兼容；Alien v5.0.0 只支持传统 OneShell（含 Event Horizon 保护的），支持 NebulaPulsar 与可配置 XOR/RC4 加载器列入后续版本。

## Introduction

This article is part of the **Inside Different Generations of WebShells** series.

In the previous articles, I introduced OneShell implementations in PHP, ASP, ASP.NET, Perl, and Ruby. I also briefly discussed how a webshell client can be implemented.

In addition, I introduced [NebulaPulsar](https://github.com/iss4cf0ng/NebulaPulsar), a webshell implant that allows attackers to transfer code and commands. In this article, I am going to introduce how to integrate it into Alien, and some of the practical engineering challenges I encountered while developing Alien, such as **DriftingComet**.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f6caba92d2a1dfb1.jpg)

## NebulaPulsar

NebulaPulsar is a subproject of Alien. The primary purpose of NebulaPulsar is to experiment with and demonstrate techniques for achieving arbitrary code execution in Java and.NET environments.

A NebulaPulsar webshell is implemented as either a JSP or ASP.NET script. During the initial request, it decrypts the NebulaPulsar implant using XOR and stores the loaded implant inside the current session. Subsequent payloads (DarkMatter) are then decrypted using AES and executed through the implant.

This is the overall architecture of NebulaPulsar.

> Note: If you are interested in the underlying principle of NebulaPulsar, you may refer to these articles: [NebulaPulsar: A Proof-of-Concept In-Memory Implant Framework for JSP and ASP.NET](https://iss4cf0ng.github.io/2026/06/27/2026-6-27-NebulaPulsar/), [NebulaPulsar 2.0: CFM Webshell and New Features](https://iss4cf0ng.github.io/2026/07/01/2026-7-1-NebulaPulsar2-0/).

Subsequent Requests

First Infection

No

Yes

Attacker

HTTP POST Request

NebulaPulsar Installed?

XOR Decrypt

Load NebulaPulsar

AES Decrypt

Execute Arbitrary Code

## Integrating into Alien

From both an engineering and research perspective, once a problem has been solved, reproducing the solution is usually much easier the second time.

Since I had already implemented the concept in Python, integrating it into Alien turned out to be much easier than I expected.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/446ca85aec477946.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5ad0869918af333a.png)

As shown in the figure above, the payload is encrypted using AES and transferred as raw binary data.

What I did not expect was that my “bad” naming convention would actually become an advantage from an engineering perspective. Instead of embedding every payload directly into the client application, Alien loads payloads dynamically at runtime. All payloads are stored under the `./Payload` directory, making them much easier to develop, test, and debug independently.

I intentionally use lowercase names for all payload files. For example, the code below shows how Alien reads a payload file:

```typescript
public async Task<string> fnszRead(string szFilePath)
{
    string szContent = await m_web.fnszSendPayload("file_read", new string[] { szFilePath });
    if (szContent.Contains("ERROR://"))
    {
        MessageBox.Show(szContent);
        return szContent;
    }

    return clsEzData.fnszB64d2str(szContent);
}
```

Here, `file_read` is the payload file, the `fnszSendPayload` function then loads the corresponding payload file. The scripting language depends on the target selected by the user. In this case, it is `file_read.class` since I selected CFMf and NebulaPulsar.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4fdeccc2498724c9.png)

Now, if you read the source code of the Java payload, you can see the code is implemented as follows:

```java
public class file_read extends ClassLoader
{
    public file_read(ClassLoader objParent) { super(objParent); }
    public file_read() { super(file_read.class.getClassLoader()); }

    /* Blablabla... */

}
```

The naming convention may look somewhat unconventional. However, I believe this turned out to be a surprisingly good design decision (not because I wrote it!) because it guarantees that class names will never conflict with third-party libraries.

For example, if I later develop plugins that depend on external libraries, this naming convention greatly reduces the chance of naming conflicts. This naming convention effectively avoids ambiguity caused by those libraries.

In addition, it can also prevent duplicate class names on the target server. For example, `http`, `Http`, and `HTTP` are considered different identifiers.

Fortunately, this naming convention was adopted only after I had already implemented the PHP, ASP, and ASP.NET payloads. This fortunate coincidence saved me from renaming every payload and modifying Alien accordingly.

The C# payloads adopt the same implementation:

```java
public class file_read
{
    public void Run()
    {
        // BlaBlabla...
    }
}
```

## MemoryShell

After completing roughly 80% of Alien, I decided to start implementing the plugin system. One of the largest components is MemoryShell.

If you are unfamiliar with the concept, a MemoryShell is an in-memory webshell that operates without leaving files on disk.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6b21f77f3cc9c4c9.png)

> Note: Originally, I planned to discuss both Java and.NET MemoryShell implementations in this article. However, I soon realized that the topic deserved a dedicated article. On top of that, MemoryShells are advanced techniques that go beyond the scope of NebulaPulsar. They are also more closely related to Alien’s plugin architecture than to NebulaPulsar itself.

## Issues of DriftingComet

**DriftingComet** is Alien’s webshell hopping (pivoting) mechanism. It allows users to pivot through previously compromised web servers to reach additional targets.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0d470301e53541ae.png)

While implementing this feature, I encountered a problem: DriftingComet currently supports only text-based OneShells. NebulaPulsar, however, communicates entirely through binary payloads, making it incompatible with the current implementation.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/217e6a692c7d5d85.jpg)

At the time of writing, DriftingComet in Alien v5.0.0 supports only traditional OneShells (including those protected by **Event Horizon**, which will be discussed in the next article).

Supporting NebulaPulsar is planned for a future release.

In addition, the initial XOR-based implant loader will become configurable, allowing additional algorithms such as RC4 to be used.

## Conclusion

In this article, I introduced how NebulaPulsar was integrated into Alien and discussed several engineering decisions made during its development.

Although NebulaPulsar provides arbitrary code execution for Java and.NET environments, integrating it into a practical webshell framework required much more than simply executing code. Dynamic payload loading, naming conventions, and compatibility between different scripting environments all became important design considerations.

I also introduced **DriftingComet** and briefly discussed the challenges of supporting binary-based implants. Although the current implementation has some limitations, it provides a solid foundation for future improvements.

In the next article, I will introduce **Event Horizon**, an obfuscation framework designed for OneShells, and explain how it can be combined with **DriftingComet** to improve both flexibility and evasion.

Feedback and suggestions are always welcome!

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3d830603aca6a1eb.gif)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0455f18e05abf82d.jpg)
