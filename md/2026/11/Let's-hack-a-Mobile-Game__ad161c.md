---
title: Let's hack a Mobile Game
source: https://dispatchersdotplayground.hashnode.dev/lets-hack-a-mobile-game
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:48:02+08:00
trace_id: 63459311-5bcb-4e5a-9fcc-a9336a0189ab
content_hash: 4d802f207e135bc46ca58b6d881e05d5a1fdc91f0a2e71c40120483583c7b80d
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 41d75244-d011-81ad-9103-dd1c57b9e44f
ioc: null
---

Games are probably the number one reason why I became a programmer. Although I have never worked in a game company before, the most intriguing part for me was finding a way to win easily, as I was way too lazy to discipline myself to become a real top player. I was also looking for trouble in GTA Vice City, and once the one-star police alert would go on, I would immediately type *leavemealone* to escape the police, use *nuttertools* if I ran out of ammo, *looklikelance* to change my avatar’s appearance, or *gettherefast* to spawn a car in the middle of nowhere.

In this article’s case, however, it will be much simpler. Although, if you are interested in hacking Grand Theft Auto San Andreas on PC, there is already [something](https://www.youtube.com/watch?v=lwFNdphmZbE&ab_channel=KotlinbyJetBrains) I stumbled across lately. Let’s try to hack the 2048 game on Android. For ethical and legal reasons, we are not going to use the official 2048 game APK, but rather a similar one built by [Hextree](https://www.hextree.io/) —i.e., an intentionally vulnerable one.

For those who do not know, 2048 is a puzzle game where you are supposed to match even numbers together, starting from 2, 4, and so on, until you form 2048.

[https://www.youtube.com/watch?v=kQhkkqjGkFA&ab_channel=TheSmithPlays](https://www.youtube.com/watch?v=kQhkkqjGkFA&ab_channel=TheSmithPlays)

As mentioned before, our APK will not be the same as the one presented in the video above. Regardless, it will be doing the exact same thing. There will be a home screen, a game screen, and some logic regarding the points/rewards of the player. Nothing fancy in this case.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/aba9f29b93ffd006.png)

As you may notice in the video, beating the game might take practice, focus, and patience. But what if there was another way to do it? Essentially, a mobile game is no different from an app. Someone wrote it—a developer. Developers are humans, and humans are fallible sooner or later, so the software they wrote might have a security risk or a bug. So, let’s try to approach the game from that angle: We win when we say we win, not when the game/puzzle is solved.

## Analysis

There are two ways to approach this and do proper reconnaissance. Either throw the APK into JADX and perform a static code analysis, then use Frida to hook and intercept the right method, or use Frida for both: dynamic analysis and intercepting the app at runtime. The latter seemed more logical to me; however, in real-case scenarios, it might not be that straightforward.

Remember: To run Frida successfully, you either need a rooted device/emulator or repackage the APK with Frida Gadget. If you want to know more, I have two articles ([\[1\]](https://dispatchersdotplayground.hashnode.dev/hacking-android-on-runtime-using-frida-tool) [\[2\]](https://dispatchersdotplayground.hashnode.dev/intercepting-android-at-runtime-on-non-rooted-devices)) already written on my coding blog.

*One might argue that this is not a real-case scenario. The majority of Android users do not root their devices. While this is true, nobody said anything about exploiting a vulnerability or causing security damage to the one who built the game. We are essentially just trying to win ourselves, without causing others to win or lose. That might require a lot more effort, of course.*

So, let’s start the tools first. After installing the `.apk` file, the next step is to make sure that Frida Server is running on the emulator. If not, download it from the [official Github page](https://github.com/frida/frida/releases) and push it via ADB. Also, check the version. My Frida is on 16.6.6.

```bash
$ adb shell
emu64xa:/ $ su
emu64xa:/ # cd /data/local/tmp
chmod +x frida-server-16.6.6-android-x86_64
emu64xa:/data/local/tmp # chmod +x frida-server-16.6.6-android-x86_64
```

Afterwards, just start the server:

```bash
./frida-server-16.6.6-android-x86_64 &
```

Under the hood, Frida is going to inject Google’s V8 engine, which essentially creates a bridge between itself and native code. With that said, it is very easy for us to write JavaScript or Python code to hook native calls (be it C++ or Java).

## Recon

But before we do that, we have to figure out how the app works and how it is generating all those numbers in the first place. For that, we will need a helper tool called `frida-trace`. This will come in handy to understand what classes and methods are called while we are pushing buttons or performing any gesture within the app.

```bash
frida-trace -U -j 'io.hextree.*!*' <process name or id here>
```

All we are doing in the above command is telling Frida to track all the calls coming from the `io.hextree` package name, whether it’s a class or a method.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f3813ac936aa8e5.png)

If you were an Android developer, some of these methods would look pretty familiar. Basically, everything that is happening in this app is transmitted into the console. Free logging, in other words.

The stage is already set.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c564dfe5a4944a8.gif)

Every time we swipe up and down, we notice that a method called `generateNumber()` is called. Hmm, interesting… What would happen if this method returned 1024 instead of the usual 2, 4, or 8 that is typically very easy to get? Let’s try.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2a64f06b60bc8f0c.png)

Let’s also have a look at this method in jadx, just in case:

```java
public int generateNumber() {
        if (Math.random() <= 0.9d) {
            return 2;
        }
        return 4;
    }
```

Since this call is also happening in the `onCreate` method (as when you load the game, you need to generate the initial number), hooking `generateNumber()` would mean that we already start the game with an advantage without any action from our side.

Let’s now write the method hook:

```javascript
Java.perform(() => {
    var GameActivity = Java.use("<package name>.activities.GameActivity")
    GameActivity.generateNumber.implementation = function() {
        return 1024;
    }
})
```

That means every time `generateNumber()` is called, it won’t return 2 or 4 but rather 1024.

One more action left:

```bash
frida -U -l /frida_scrips/hack2048.js <process id>
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a24a0a079018c4ee.png)

And there we have it. All we have to do now is swipe down to match 1024 with another 1024, thus reaching 2048 in only ten minutes of coding and three seconds of swiping.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f9ba8b35ef3fe93a.png)

This particular `.apk` was a CTF challenge.

Hopefully, we saw something cool today. As explained before, using Frida as a dynamic instrumentation tool is really powerful, whether it’s for app analysis, tracing the app’s path, or essentially hacking. In fact, while exploiting vulnerabilities in real-life Android apps might not be a realistic use case for Frida (though it is useful for reconnaissance), hacking mobile games to win is a perfectly valid use case, even in real life.

If you enjoyed this article, feel free to browse more from this blog.

**Do you need help with the security of your app? Would you like me to audit it before it goes into production? Are you done with your development phase but unsure if your app is safe? Feel free to** [**schedule a meeting**](https://doodle.com/bp/stavroxhardha/android-pentesting-with-apksherlock) **or connect on** [**LinkedIn**](https://www.linkedin.com/in/stavro-xhardha-64b98a153/)**. I can help you test your mobile app’s security.**
