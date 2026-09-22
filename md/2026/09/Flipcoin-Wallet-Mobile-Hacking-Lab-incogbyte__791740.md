---
title: Flipcoin Wallet Mobile Hacking Lab | incogbyte
source: https://incogbyte.github.io/posts/2025-30-05-flipcoin-wallet-mobile-hacking-lab/
source_host: incogbyte.github.io
clip_date: 2026-09-22T10:21:59+08:00
trace_id: de242495-6fbf-4dc4-8048-92b58bb4db5f
content_hash: b8c013e4fc17ac073bc0d50e4377aa707215e5b9b715121be5cfe66f530534e2
status: synced
tags:
  - iOS逆向
  - 漏洞分析
series: null
feed_source: incogbyte·iOS/Mobile
ai_summary: Flipcoin Wallet iOS 应用的 `flipcoin://` 深链未校验参数，可注入 SQL，从本地 SQLite 库取出助记词并拿到 flag。
ai_summary_style: key-points
images_status:
  total: 18
  succeeded: 17
  failed_urls:
    - /images/deeplink-flip-02.png
notion_page_id: 3e375244-d011-812f-ad7a-d7cb6c0f21c2
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Flipcoin Wallet iOS 应用的 `flipcoin://` 深链未校验参数，可注入 SQL，从本地 SQLite 库取出助记词并拿到 flag。
> 
> - **入口点：** Info.plist 中的 URL scheme `flipcoin://`，由 `SceneDelegate.scene(_:openURLContexts:)` 处理深链。
> - **静态分析流程：** 用 `ideviceinstaller` 安装/取 IPA，`ipsw` 读 Info.plist 并 class-dump（同时覆盖 Swift 与 Objective-C 类），再用 IDA Free 看反编译实现。
> - **弱校验逻辑：** 深链格式如 `flipcoin://send?amount=42.0&network=testnet`，仅判断 amount 等于 42 且含 testnet 即认为合法，不校验内容。
> - **注入点：** 参数被拼接进 SQL 查询，目标库为 `your_database_name.sqlite`；传入 `OR 1=1` 即返回首条记录，得到账户地址、恢复助记词与 flag。
> - **验证方式：** 用 HTML 载荷触发深链，Burp Suite 抓包观察请求；移动端本地库场景下 `OR 1=1` 风险可控。

## Flipcoin Wallet CTF - SQL Injection Challenge

In this CTF challenge, I'll explore a SQL Injection vulnerability ( Client Side) in the Flipcoin Wallet iOS app. I'll walk you through my process of identifying and exploiting the vulnerability to retrieve a recovery phrase from the application's database (this is the chall 👌).

## Intro

When I first opened the app, I found a typical crypto wallet interface with features for buying, sending, and receiving cryptocurrencies. It also shows crypto news and displays balances for different coins. Since I couldn't find any obvious way to get the recovery phrase through the normal interface, I decided to dig into the app's code to find a way in.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3dd7817d2e98e99c.png)

## Static Analysis

Let's start with static analysis. First, I'll check the Info.plist file to understand the app's configuration. This file contains important information like URL schemes (deep links) that the app uses. To begin, we need to get the IPA file. If you have a jailbroken device, you can install it using ideviceinstaller.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a704fb0197b86c9.png)

After extracting the IPA file, I used the ipsw tool to examine the Info.plist contents:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c2c1ec1f5c162dff.png)

After examining the contents of the extracted IPA, I discovered that the app is built using Swift and Objective-C. This is interesting because it means we'll need to analyze both languages.

> Pro tip: You can use ipsw to get class-dump information for both Swift and Objective-C classes

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3655d0ebbea61324.png)

While class-dump gives us method signatures and class structures, it doesn't show us the actual implementation. To understand what these methods do, we need to look at the decompiled code. There are several free tools available for this:

-   Ghidra
-   Radare2
-   IDA Free (limited features)
-   Hopper Free (limited features)

For this analysis, I'll use IDA Free. Let's load the Flipcoin binary extracted from the IPA into IDA for deeper analysis. After analyzing the code, I found the class responsible for handling the data:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/62fdc9f8bf40dd16.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/76bae72a7c96afb0.png)

## Vulnerability Analysis

Let's break down what I found in the code:

## Deep Link Handler

The app uses a `SceneDelegate.scene(_:openURLContexts:)` method to handle deep links. This is a standard iOS method that gets triggered when the app is opened via a URL scheme (in this case, `flipcoin://`).

## URL Processing

The app accepts URLs in this format:

```
flipcoin://send?amount=42.0&network=testnet
```

The function processes these URLs in three steps:

1.  **URL Parsing**
    
    -   Extracts the absolute string from the URL
    -   Searches for specific parameters:
        -   "amount" (numeric value)
        -   "testnet" (string value)
2.  **Parameter Validation**
    
    -   Checks if "amount" equals 42
    -   Verifies if "testnet" is present in the URL
    -   If both conditions are met, it assumes the request is valid
3.  **View Controller Selection**
    
    -   Based on the validated parameters, it determines which screen to display

## Testing the Vulnerability

Let's create a simple HTML payload to test this functionality:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/113a55ab60f78d7c.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6f7663ad23a3081.png)

I intercepted the request using Burp Suite:

![⚠️ 图片托管失败](/images/deeplink-flip-02.png)

![⚠️ 图片托管失败](https://incogbyte.github.io/images/deeplink-flip-02.png)

This request revealed the account address, but our goal is to retrieve the recovery key. Let's go back to IDA and search for database-related strings and iOS methods, particularly focusing on NSManager.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7926a2630621ac43.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/66f9566a47d0db96.png)

## Exploitation

After analyzing the code in IDA, I found both the flag and recovery pass, but the challenge specifically requires a SQL injection at the front end. Continuing the analysis, I discovered the database name:

**your_database_name.sqlite**

I copied the database to localhost for further analysis:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5e1a9a46b8001d3a.png)

Returning to IDA, I searched for SQL commands and found a potential SQL injection point:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/342e363d7ccb98c1.png)

Let's test our deep link exploit:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/78dd6b59e5afaeac.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/27bd1631f2f7ae90.png)

Success! We got the first entry. Since this is a mobile app and not a web application, using `OR 1=1` is safe in this context.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68cffdc087e99f0d.png)

Finally, we obtained the flag:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6cdc09c07203afa4.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0088f37890000d52.png)

## Conclusion

This lab demonstrates a critical security vulnerability in mobile applications: SQL injection + deep links. The lack of proper input validation in the URL handling mechanism allowed us to inject SQL commands and retrieve sensitive data. This type of vulnerability can lead to the exposure of sensitive information.

For those interested in learning more about mobile security and practicing these concepts, I recommend visiting the MobileHackingLab - Flipcoin Wallet challenge. It's an excellent opportunity to enhance your skills in mobile application security testing and vulnerability assessment.
