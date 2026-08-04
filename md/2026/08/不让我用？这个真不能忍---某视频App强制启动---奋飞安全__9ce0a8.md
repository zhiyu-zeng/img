---
title: 不让我用？这个真不能忍 - 某视频App强制启动 - 奋飞安全
source: http://91fans.com.cn/post/gvpshow/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:34:21+08:00
trace_id: 06061afc-1d4e-4955-b8d3-71c818981643
content_hash: 6d42f7ff5be41f5e5a1b7bf176a6e29e72da23bf7ddba0f7f1e4d4d6b03bba11
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: 91fans·逆向
ai_summary: 某视频App启动弹窗“当前设备暂不支持激活本应用”，通过魔改Frida绕过检测、BlackDex脱壳后Hook掉`isTerminalFailStatus`判断，最终绕过弹窗限制。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3b275244-d011-81c4-8c03-ff5715c93842
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 某视频App启动弹窗“当前设备暂不支持激活本应用”，通过魔改Frida绕过检测、BlackDex脱壳后Hook掉`isTerminalFailStatus`判断，最终绕过弹窗限制。
> 
> - **加固线索：** 弹窗字符串只在资源文件中存在，反编译类列表干净且代码中无调用痕迹，判断应用已加固。
> - **定位弹窗：** 原版Frida运行即崩溃，改用魔改版Frida（Florida）Hook `AlertDialog.show()`，拿到调用堆栈：`NoticeUtils.java:125` → `BaseActivity.onLoginEvent`。
> - **脱壳方案：** 使用`newBlackDex`，勾选“深度脱壳”和“主动调用”后成功脱壳；Jadx中可看到`BaseActivity.onLoginEvent`包含大量判断逻辑。
> - **关键日志：** 用带重试的Hook脚本Hook `BaseActivity.c`，捕获到输出`onLoginEvent false showErrorTerminalDialog and SendErrorPingback`，确认第一个判断`isTerminalFailStatus`即触发退出。
> - **绕过方式：** Hook `com.gXXX.tv.gXX.service.task.BaseLoginTask.isTerminalFailStatus`，强制返回`false`，弹窗不再出现，完美收工。

一、目标

## 一、目标

![show](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c68207a375e64c8c.png)

1:show

朋友给我发了一个看直播的App,刚一启动，硕大的弹窗就崩脸上了。这个真忍不了，盘它。

## 二、步骤

### Jadx

先给他拆开，搜字符串， 激活本应用

```bash
<string name="unknown_device">当前设备暂不支持激活本应用。</string>
```

代码里面没找到痕迹，在资源里面居然找到了。 反编译的类列表太干净了，感觉可能加固了。

![findstr](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a1d51dabe71f194b.png)

1:show

也没有发现这个字符串在代码中被调用的地方，肯定是加固了

### 关门，上AI

```bash
万能的AI，帮我生成一个 Frida hook脚本，捕获 res/layout/dialog_double_button.xml 弹窗显示位置和堆栈，
```

有了AI，人人都是工程师

```javascript
// Hook AlertDialog.show()
var AlertDialog = Java.use("android.app.AlertDialog");
AlertDialog.show.implementation = function() {
    console.log("\n================================================================================");
    console.log("[*] AlertDialog.show() 被调用 ");
    console.log("================================================================================");

    console.log("\n[*] 调用堆栈:");
    console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()));
    console.log("================================================================================\n");

    return this.show();
};
```

跑一下，没反应，frida直接挂了。

先不急着问AI，咱们之前分析这个App大概率加固了，所以检测frida应该是基操。

咱们换上魔改版的Frida

[https://github.com/Ylarod/Florida](https://github.com/Ylarod/Florida)

再跑一下

```bash
================================================================================
[*] AlertDialog.show() 被调用
================================================================================

[*] 调用堆栈:
java.lang.Exception
        at android.app.Dialog.show(Native Method)
        at com.gXXX.tv.gXX.utils.x2.a(NoticeUtils.java:125)
        at com.gXXX.tv.gXX.activity.BaseActivity.g(BaseActivity.java:1)
        at com.gXXX.tv.gXX.activity.BaseActivity.onLoginEvent(BaseActivity.java:6)
        at com.gXXX.tv.gXX.activity.WelcomeActivity.onLoginEvent(WelcomeActivity.java:1)
        at java.lang.reflect.Method.invoke(Native Method)
```

这次比较顺利，逮住了

### 脱壳

这次脱壳用的是老朋友 BlackDex

[https://github.com/ZiTanIOI/newBlackDex](https://github.com/ZiTanIOI/newBlackDex)

这次感觉是猛壳，所以在软件设置里 勾上 深度脱壳和主动调用

双手合十，默念 芝麻开门

图灵保佑，壳拖出来了。

Jadx一下，然后搜索 onLoginEvent

打开 BaseActivity.onLoginEvent

![onLogin](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/df64d74ff33ddb03.png)

1:login

这哥们也真累，一堆判断，一言不合就掀桌子退出。

不怕，哥是有AI的，把整个onLoginEvent函数的代码喂给AI

```bash
请帮我生成Frida Hook脚本，hook住onLoginEvent函数的所有判断，定位一下到底是在哪里退出的。
```

吭哧吭哧，AI给我生成了一堆代码，看的眼花缭乱。

这不行，还得古法上，硅基暂时让步，碳基上位。我们观察一下这个函数的代码还是很规整的， 每次判断退出都会有提示 。

呼唤AI

```bash
请帮我生成Frida Hook脚本，hook住com.gXXX.tv.gXX.activity.BaseActivity.c , 加上异常处理，没有找到这个类就100毫秒之后重试 。
```

因为这个是加壳应用，所以需要给壳一个解密的时间，直接hook是找不到 com.gXXX.tv.gXX.activity.BaseActivity 类的。

AI写的代码就是漂亮

```javascript
Java.perform(function() {
    console.log("[*] 开始Hook BaseActivity.c");

    function tryHook() {
        try {
            var BaseActivity = Java.use("com.gXXX.tv.gXX.activity.BaseActivity");

            BaseActivity["c"].overload('java.lang.String').implementation = function(str) {
                console.log("BaseActivity.c is called: str=" + str);
                this["c"](str);
            };


            console.log("[+] BaseActivity.c Hook成功");
            return true;

        } catch (e) {
            console.log("[-] Hook失败: " + e.message);
            return false;
        }
    }

    function hookWithRetry() {
        if (!tryHook()) {
            console.log("[*] 100ms后重试...");
            setTimeout(hookWithRetry, 100);
        }
    }

    hookWithRetry();
});
```

好了，发现提示

```bash
onLoginEvent false showErrorTerminalDialog and SendErrorPingback
```

原来第一个判断 isTerminalFailStatus 就挂掉了

啥也不说了，增加一个 Hook

```javascript
let BaseLoginTask = Java.use("com.gXXX.tv.gXX.service.task.BaseLoginTask");
BaseLoginTask["isTerminalFailStatus"].implementation = function (i) {
    console.log(`BaseLoginTask.isTerminalFailStatus is called: i=${i}`);
    let result = this["isTerminalFailStatus"](i);
    console.log(`BaseLoginTask.isTerminalFailStatus result=${result}`);
    return false;
    // return result;
};
```

完美收工。

## 三、总结

不要给你的对手太明显的提示。

不要太相信AI，如果你不知道自己在干什么，AI也不知道。

脱壳是玄学，多试几个方案，万一运气到了呢？

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/54524d11be3cf8bb.webp)

1:ffshow

雪之妙在能积，云之妙在不留，月之妙在有圆有缺

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
