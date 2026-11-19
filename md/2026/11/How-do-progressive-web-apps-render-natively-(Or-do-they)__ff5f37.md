---
title: How do progressive web apps render natively? (Or do they)
source: https://dispatchersdotplayground.hashnode.dev/how-do-progressive-web-apps-render-natively-or-do-they
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:49:58+08:00
trace_id: 58716bd7-24c1-46bd-a8bd-3a66c67217fc
content_hash: 07fbd343035802045ceee06c6d7b14ac5bae0c9d0784b39954d4b113c623c737
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 41d75244-d011-8107-ba97-ea3925c3d54e
ioc: null
---

I heard publishing an Android Launcher app on Play Store is not as straightforward as publishing any other app due to the level of permissions that it requires. That's not the only reason why I will most probably not publish my [Panda Launcher](https://github.com/apksherlock/panda_launcher) on Play Store. It is also tricky when it comes to security, architecture and device compatibility bugs - a luxury that I do not have right now to perform more thorough testing, because of time and money (I don't have many test devices). So let it be OS on Github and let it serve as an example of limitations of vibe coding.

But I did learn new things. For example, I was curious on how different browsers attach bookmarks directly to the home Activity of a Launcher app. Let's look at the screenshot below:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82e2f2e0754174d6.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4739db54f17c9b90.png)

When I was using Chrome, I had two options to put a web app on the Pixel Launcher as a shortcut: one is through Pinned Shortcuts. The API [is rather simple](https://developer.android.com/develop/ui/compose/system/shortcuts). But important to know when you are building a Launcher app: It's definitely possible to read those shortcuts and render them in your own Activity.

The other thing, which triggers my curiosity, is the web app as an actual apk. It seems Google Chrome generates apks automatically if your website qualifies as a [progressive web app](https://web.dev/explore/progressive-web-apps).

```bash
loadLaunchableApps: 

ApplicationInfo{a44b0c7org.chromium.webapk.aa17f7b9af516cd50_v2}

loadLaunchableApps: ActivityInfo{e0616f4 org.chromium.webapk.shell_apk.h2o.H2OOpaqueMainActivity}
```

So I pulled this apk on my machine and thought to have a look at it:

```bash
adb pull /data/app/~~XKyxe2wWmoFXcgSpAhP9vg==/org.chromium.webapk.aa17f7b9af516cd50_v2-32RL_FQm7LMHSGQcEV8ESw==/base.apk
```

It's not only an activity but also a shortcut:

```xml
<activity
            android:theme="@style/SplashTheme"
            android:name="org.chromium.webapk.shell_apk.h2o.H2OOpaqueMainActivity"
            android:enabled="@bool/opaque_main_activity_enabled_default"
            android:exported="true"
            android:screenOrientation="sensorPortrait"
            android:relinquishTaskIdentity="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
            <meta-data
                android:name="android.app.shortcuts"
                android:resource="@xml/shortcuts"/>
        </activity>
```

It seems that the entry point though, just starts a SplashActivity:

```java
public class H2OOpaqueMainActivity extends Activity {
    /* JADX DEBUG: Don't trust debug lines info. Lines numbers was adjusted: min line is 1 */
    @Override // android.app.Activity
    public final void onCreate(Bundle bundle) {
        long elapsedRealtime = SystemClock.elapsedRealtime();
        super.onCreate(bundle);
        Context applicationContext = getApplicationContext();
        overridePendingTransition(0, 0);
        AbstractC0001b.a(applicationContext, getIntent(), null, elapsedRealtime, new ComponentName(applicationContext, (Class<?>) SplashActivity.class));
        finish();
    }
}
```

What is happening in the `SplashActivity` is not too much. Apart form making the UI transition to a Chrome window proper, the process is simple: Since every progressive web app has to declare a manifest, like for example:

```javascript
{
  "name": "My App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

*In essence, the web apk is only transforming this JSON data into pure Android intents, and giving them back to Chrome to launch the site in the right window.*

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/847a245781354da2.png)

Where in the `r` implementation we find:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/230f3d5208acfce6.png)

They seem to even log it:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dfcb5f5408684b05.png)

This is quite an interesting approach that I really enjoyed exploring. However this comes with limitations for the end user, especially if you are in the browser business. As far as I was concerned, other browsers don't do this. They only rely on pure shortcuts only. So if you are developing a progressive web app, try to think of that when it comes to the end user.
