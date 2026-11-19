---
title: Deep link hijacking and how to avoid them
source: https://dispatchersdotplayground.hashnode.dev/deep-link-hijacking-and-how-to-avoid-them
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:49:07+08:00
trace_id: 8f3822ab-d029-4b69-b792-519dc596b2f1
content_hash: 68ea6aceabf1d794d13a4f8045b09f8d10058fa28f21590c10d8e4949049563a
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41d75244-d011-810e-9d5f-e30e0c821b09
ioc: null
---

Deep links are a big issue when it comes to Android security. The slightest mistake, like, for example, a typo, could lead to major issues like data leaks or theft. [The Android documentation](https://developer.android.com/training/app-links) also mentions some general guidelines while writing deep links for your apps. However, multiple security issues come from deep links, and that’s usually because of misconfigurations rather than pure bugs.

## URI Open Redirects

Let us see a very basic example of open redirects with a custom URI scheme first. That is when the developer needs to talk to a certain functionality within their app, that has to do only with the app functionality and nothing more. One real-life scenario would be logging in to a Google account in the mobile browser but letting the authentication be done by an internal Android app (through intent redirect), in this case Google or some Activity inside Gmail.

This is how that app’s manifest would look like:

```bash
           <intent-filter>
                <category android:name="android.intent.category.DEFAULT"/>
                <category android:name="android.intent.category.BROWSABLE"/>
                 <action android:name="android.intent.action.VIEW"/>
                <data
                    android:scheme="victim"
                    android:host="victim_path"/>
            </intent-filter>
```

This intent filter is declaring an entry point to the activity it belongs to by a URI `victim://victim_path`. Such a scheme can be easily hijacked by crafting a malicious PoC using the same `<intent-filter>` in a malicious Activity.

```bash
<activity
    android:name="com.malicious.HijackActivity" 
 ....
/>

   <intent-filter>
                <category android:name="android.intent.category.DEFAULT"/>
                <category android:name="android.intent.category.BROWSABLE"/>
                 <action android:name="android.intent.action.VIEW"/>
                <data
                    android:scheme="victim"
                    android:host="victim_path"/>
            </intent-filter>

</activity>
```

In this case, a log is enough for demonstrating what can be done:

```bash
class HijackActivity : BaseActivity() {
    onCreate(...) {
       Log.d(TAG,"Hijacked data: ${intent.data}")
    }
}
```

Now, every potential URI that could be coming to the system, like an email or another app intent, with the data above, can not only trigger the victim’s Activity to be opened but also the HijackActivity from the malicious PoC.

There is one problem though. Android does not know which one is the right Activity, leading to an open dialog that allows the user to choose.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6fd23f57321ee4f7.png)

The problem, from the attackers’ perspective, is obvious. The user would definitely know which app is the right one. But this can definitely be circumvented with a very simple trick - labelling the malicious activity with the same name as the victim activity. Icons can be easily faked, so there is nothing stopping the malicious actor from doing something like this:

```bash
<activity
    android:name="com.malicious.HijackActivity"
    android:icon="@mipmap/same_or_similar_as_victims_bitmap" <!--Notice the icon -->
    android:label="Victim App"/> <!--Notice the label -->
 ...

  <intent-filter>
                <category android:name="android.intent.category.DEFAULT"/>
                <category android:name="android.intent.category.BROWSABLE"/>
                 <action android:name="android.intent.action.VIEW"/>
                <data
                    android:scheme="victim"
                    android:host="victim_path"/>
            </intent-filter>

</activity>
```

This would not only confuse the user, but it would increase the chance of a successful attack to 50% - which makes this a valid attack scenario.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/009a19d4b676098e.png)

*There is one caveat: Open redirects are not necessarily a vulnerability per se, unless they pass through important information like tokens or passwords.* But at least, with the above setup, the user is now confused, and with a high chance of clicking the wrong app, the hijack can be successful.

## Unmapped app links to the owner’s website

Now we move to the internet. In other words, the attack surface also increases. This section deals with HTTP or HTTPS app links.

In a poorly configured scenario, the developers register deep links (e.g. for `https://example.com/secure`) in their Android app but never publish the corresponding assetlinks.json file on the `example.com` site. Without this file, Android cannot verify the association between the website and the app, so the automatic validation of app links fails. As a result, when a user clicks a link to `https://example.com/secure`, the system falls back to a chooser rather than silently dispatching the intent only to the legitimate app.

An attacker can craft a malicious app that also declares an intent filter for the same HTTPS scheme and host. When users click one of these links (for example via phishing or some in-app browser redirection), they may be tricked (or may have previously set the attacker’s app as the default handler, if installed first) into choosing the malicious app. Once launched, the malicious app can capture sensitive data encoded in the link or use it to initiate further actions (session hijacking, phishing for credentials, etc.). The attack scenario is the same as hijacking a URI, as shown above.

The first step, however, is slightly different. In this case, observing the victim results in different indications:

```bash

<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />

    <!-- If a user clicks on a shared link that uses the "http" scheme, your
         app should be able to delegate that traffic to "https". -->
    <!-- Do not include other schemes. -->
    <data android:scheme="http" />
    <data android:scheme="https" />
    <data android:host="victim.com" />
</intent-filter>
```

The above is taken directly from Google’s documentation (with a changed host). If the developer stops here, there is a high chance of an Open Redirect. The `https://victim.com` needs to have a path in their web app: `https://victim.com/most-known/.assetLinks.json` in order to perform a correct mapping between their app and their original website (that is where the links come from). The relation is the app signature and the package name itself, the one that signs the `.apk` in production, that registers such relation between the site and the app. If this route on the web returns 404, that means that the developers did not configure this feature properly. Afterwards, the attack scenario is the same as in the previous section.

In order to avoid such issues, developers must:

1.  Make sure to send the scheme URI request through a Play Store intent which points to the right package name. In this case, the only successful scenario is if the app is not installed at all, but a copycat malware is in the user's device with the same package name. This is still exploitable, but not at all realistic.
2.  Verify App Links properly, according to Google’s [guidelines](https://developer.android.com/training/app-links/verify-android-applinks) and suggestions.
3.  If none of the above is applicable for any other reason, backend engineers should reconsider asking for sensitive data like tokens in the URL/URI.

## Security check

According to basic Google research, more than 60% of Internet traffic comes from mobile devices today. More than 85% of all mobile apps have security flaws or exploitable vulnerabilities. That's why, along with my full-time job as an Android Engineer, I created ApkSherlock - a service to help developers and businesses secure their Android apps before launching production. This investment pays off through happier users, prevented data breaches, and stronger security— [contact me](https://apksherlock.com/contact/) for Android security audits, freelance team support, or staff training.

## Concluding thoughts

I hope this article has provided a clear introduction to how malicious actors can target your app through open redirects that transmit tokens. As mentioned, an open redirect isn't necessarily a security vulnerability unless the URL/URI contains sensitive data. If you found this article helpful, consider subscribing to my newsletter for more Android Security content.
