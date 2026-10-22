---
title: "Windows Age APIs Can Expose Your Date of Birth to Apps :: Xusheng Li"
source: https://xusheng.dev/posts/reversing/windows_age_api_dob/main/
source_host: xusheng.dev
clip_date: 2026-10-22T10:27:11+08:00
trace_id: ead81249-bb54-4d0e-bc0a-31dd5c34e937
content_hash: 151cc1250fb4af9c44f36e2c00ec7780403728863583ea94fd5722464ae6e8cb
status: synced
tags:
  - Windows逆向
  - 漏洞分析
series: null
feed_source: Xusheng Li·Windows/软件逆向
ai_summary: 微软的“年龄区间”API 实际上是在调用方进程内先解码出生日期、再算成区间，所以应用可以拦截 JWT 或读取内存，拿到精确生日。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40175244-d011-818e-a3d3-fee1775cc005
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 微软的“年龄区间”API 实际上是在调用方进程内先解码出生日期、再算成区间，所以应用可以拦截 JWT 或读取内存，拿到精确生日。
> 
> - **API 当前状态：** 在 Windows 11 25H2 build 26200.9168 上已有 `GetUserAgeRangeAsync`，但因 `DigitalSafetyAPI` 功能标志未启用，调用返回 `E_NOTIMPL`；实现已存在于 `UserMgrProxy.dll` 中。
> - **真实调用链：** 调用方向 WAM 请求含 `birthdate` 声明的 ID token → dll 解码该声明得到 DOB → 算出精确年龄 → `MapAgeToRange` 映射为 13–15、16–17、18+ → 只把区间返回给上层。
> - **信息泄漏点：** `UserMgrProxy.dll` 会被加载进调用 API 的进程（用 PowerShell 调用即可在同进程看到 `C:\Windows\System32\UserMgrProxy.dll`），OAuth 响应、JWT 与明文生日因此进入应用地址空间，应用可 hook 解码函数或扫描内存取得生日。
> - **权限检查不够用：** 能力、账户、调用方校验只挡得住未授权应用，挡不住已授权应用读取已被放进自己进程的数据。
> - **修复方向：** 应由可信 Windows broker 或微软服务在进程外完成 DOB→区间换算，只把区间交给应用；作者另分析预览版 `UserMgrProxy.dll` 10.0.29648.1000，内部管道有变但核心机制未改。

## TL;DR

-   Windows’ new age API is supposed to give an app only your age range
-   The current implementation first obtains your date of birth, then calculates the range inside the requesting app’s process
-   The requesting process can intercept the token or DOB

![UserMgrProxy decoding the birthdate claim and calculating the user’s exact age](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c427b436b2021223.png)

## The API returns a range—but that is not the whole story

[Windows Latest recently reported](https://www.windowslatest.com/2026/09/03/windows-11-will-start-telling-apps-your-age-but-microsoft-says-it-wont-share-your-birthday/) that Windows 11 will allow apps to request an age range without receiving the user’s birthday. Microsoft’s [documentation](https://learn.microsoft.com/en-us/windows/apps/develop/security/age-signals/) describes `GetUserAgeRangeAsync`, which returns ranges such as 13–15, 16–17, or 18+.

On Windows 11 25H2 build 26200.9168, the API is present but currently returns `E_NOTIMPL` because a `DigitalSafetyAPI` feature flag is disabled. The implementation is already inside `UserMgrProxy.dll`, however, so I looked at what will happen after that gate is enabled.

The flow is:

```text
requesting application
  -> UserMgrProxy.dll requests an ID token through WAM
  -> the token contains the birthdate claim
  -> UserMgrProxy.dll extracts the DOB
  -> it calculates the exact age
  -> it converts that age to a range
  -> the public API returns only the range
```

The relevant decompiled code is unambiguous:

```cpp
if (DecodeJwtAndExtractClaim(
        token, tokenLength, "birthdate", &birthdate, ...))
{
    int32_t age = CalculateAgeFromDoB(&birthdate);
    memset(&birthdate, 0, sizeof(birthdate));
    if (arge >= 0)
      int64_t range = MapAgeToRange(age);
    // omitted...
}
```

In other words, Windows receives the DOB and derives the range locally.

## The conversion happens inside the requesting process

This distinction matters because `UserMgrProxy.dll` is loaded into the process that calls the API. I confirmed this by invoking the API from PowerShell and observing `C:\Windows\System32\UserMgrProxy.dll` loaded in that same PowerShell process. The OAuth response, JWT, and decoded `birthdate` therefore enter the requesting application’s address space before being reduced to an age range.

**This means the process can hook the JWT decoder or inspect its memory to obtain the user’s date of birth.** There are plenty of ways to do this because the process has full control over itself, including the DLLs loaded into it.

Windows does perform capability, account, and caller checks. Those checks can prevent an unauthorized app from using the API, but they cannot hide data from an authorized app after Windows has placed that data inside the app’s own process.

I also downloaded and analyzed `UserMgrProxy.dll` version 10.0.29648.1000 from the latest available Windows preview build. Microsoft changed some internal plumbing, but the core mechanism for obtaining the age range remains the same. While Microsoft can change what it eventually enables or ships, there is currently no sign that it has replaced this design with a broker that returns only an age range.

The application should call a trusted Windows broker or Microsoft service that returns the age range directly. The DOB-to-range conversion should happen before any result crosses into the application’s process. It is surprising to see Microsoft make such a basic privacy-design mistake, even if temporarily.
