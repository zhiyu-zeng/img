---
title: 程序员跑路了，李老板要求把App换个图标和名称 - 奋飞安全
source: http://91fans.com.cn/post/modifyapk/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:30:45+08:00
trace_id: 348314f3-933d-471a-bada-a7d98a8737a0
content_hash: c28719d688e479c0df4eb0b8c1a2b1d5d28d478923e87de858f37fd0d6ed4b4b
status: synced
tags:
  - Android逆向
  - 签名校验绕过
series: null
feed_source: 91fans·逆向
ai_summary: |-
  核心结论：通过apktool拆包改图标和名称、重打包签名，再用jadx和smali修改可绕过签名被篡改检测。
  - **拆包修改：** 用 `apktool d -f example.apk -o tmp_apk_dir` 拆包，修改 `res/values/strings.xml` 中 `app_name` 字符串，并替换各 `mipmap-xxx` 目录下的 `icon.png` 图标。
  - **重打包签名：** 修改后执行 `apktool b tmp_apk_dir -o unsigned_new.apk` 重打包，用 `keytool` 生成新签名文件（RSA 2048、有效期10000天），再用 `apksigner sign` 给apk签名。
  - **启动报错：** 重新安装启动后提示“签名被篡改”，说明原APK内埋有签名校验逻辑。
  - **定位绕过：** 用 jadx 搜索“签名被篡改”定位校验代码，将对应 smali 指令 `if-nez p1` 改成 `if-eqz p1`，使校验逻辑反向，即可绕过；AI可直接辅助修改smali。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3b275244-d011-81cc-a3e3-d3291c88d36b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 核心结论：通过apktool拆包改图标和名称、重打包签名，再用jadx和smali修改可绕过签名被篡改检测。
> - **拆包修改：** 用 `apktool d -f example.apk -o tmp_apk_dir` 拆包，修改 `res/values/strings.xml` 中 `app_name` 字符串，并替换各 `mipmap-xxx` 目录下的 `icon.png` 图标。
> - **重打包签名：** 修改后执行 `apktool b tmp_apk_dir -o unsigned_new.apk` 重打包，用 `keytool` 生成新签名文件（RSA 2048、有效期10000天），再用 `apksigner sign` 给apk签名。
> - **启动报错：** 重新安装启动后提示“签名被篡改”，说明原APK内埋有签名校验逻辑。
> - **定位绕过：** 用 jadx 搜索“签名被篡改”定位校验代码，将对应 smali 指令 `if-nez p1` 改成 `if-eqz p1`，使校验逻辑反向，即可绕过；AI可直接辅助修改smali。

一、目标

## 一、目标

李老板：奋飞呀，给咱们开发Android App的程序员删库跑路了，明天投资人就要过来，咱们得把App换个图标和名字呀？

奋飞：这个得先把五一的加班费结一下。

## 二、步骤

### 拆包

Android App的安装包Apk文件本质上是一个zip压缩包，直接把后缀改成zip，就可以解压，然后修改完再压缩回去不就行了？ 本文完……

现实是没有那么简单的，作为逆向工程师，必须要把 简单的事情复杂化 ，这样才能体现你的价值。

解压在我们这里不叫解压，叫拆开安装包，简称 拆包 。是不是立马高大上了。

因为Apk的安装包有一些特殊处理，所以我们需要用特殊的工具去拆包 [apktool](https://apktool.org/)

```bash
# d 拆包
# f 待拆包的apk
# o 输出拆包结果的文件夹
apktool d -f example.apk -o tmp_apk_dir
```

### 修改文件

App的名字等字符串信息一般都是放在

…/tmp_apk_dir/res/values/strings.xml

这个xml文件里面

把 <string name="app_name">xx本子</string>

改成 <string name="app_name">李老板本子</string>

App的图标一般都是放在

tmp_apk_dir/res/mipmap-xhdpi/icon.png

其他的mipmap-xxx文件夹是不同分辨率下的图标，可以统统给他换了。

### 打包，签名

修改好了之后就可以用 apktool重新打包了

```bash
apktool b tmp_apk_dir -o unsigned_new.apk
```

签名文件是为了证明这个apk是你的，防止被别人篡改，所以咱们修改了apk之后，由于没有原始的签名文件，只能生成一个新的。

```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias mykey
```

参数解释：

\-keystore my-release-key.jks：生成的签名文件名。

\-keyalg RSA：加密算法。

\-keysize 2048：密钥长度。

\-validity 10000：证书有效期（单位：天）。

\-alias mykey：密钥别名，可自定义。

最后一步就是给重新打包的apk做签名了

```bash
apksigner sign --ks my-release-key.jks --ks-pass pass:fenfei --ks-key-alias mykey --out your_app_new.apk unsigned_new.apk
```

![setup](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1358f45d40bb8b1e.png)

1:setup

看上去没啥问题，不过我们细心的码农还是会启动验证一下,看看有没有问题。

![start1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/33a00827b8919849.png)

1:start1

坏蛋，果然给我们埋坑了。

### 过坑

跑路的程序员还是厚道，明明白白告诉咱们是由于签名被篡改了。

上jadx，搜索 签名被篡改

![modify1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c849c4f095cb2c7a.png)

1:modify1

需要把这个 if判断干掉

问了一下AI，把对应的 Smail 代码中对应的 if-nez p1 改成 if-eqz p1 就行了

TIP:

| `if-nez p1` | 如果 `p1 != 0` ，则跳转（非零成立） |

| `if-eqz p1` | 如果 `p1 == 0` ，则跳转（零成立） |

真的没必要去学Smail语法了，现成的AI在嗷嗷待哺

## 三、总结

由于apk修改起来太容易了，所以程序员gg们会在里面埋更多的坑。加壳 反调试 混淆 前面还有无数困难等着你。

李老板决定还是招个程序员鼓励师比较靠谱。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/51eff764835e65ec.png)

1:ffshow

非真空不宜谈禅，非真旷不宜饮酒。

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
