---
title: 别被外壳骗了，那只是柔软的伪装 - 某小说App Token算法分析 - 奋飞安全
source: http://91fans.com.cn/post/txtread/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:32:18+08:00
trace_id: 420227c7-f26f-41b1-9d8b-6181e2ffedb0
content_hash: 860a0b22b31f89748a7959b942e2f3ef897ae1a9953113f4478a9fce84343f06
status: synced
tags:
  - Android逆向
  - 脱壳与加固
series: null
feed_source: 91fans·逆向
ai_summary: 某小说App的token算法藏在数字壳内，脱壳后用Frida定位到 `TokenUtil.h`，确认token由“拼接参数+时间戳”经加密编码生成，可直接扣代码复现。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3b275244-d011-81e3-bdb6-c000917b1b16
ioc:
  cves: []
  cwes: []
  hashes:
    - 01bb90d6de80f3cb01bb90d6de80f3cb
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 某小说App的token算法藏在数字壳内，脱壳后用Frida定位到 `TokenUtil.h`，确认token由“拼接参数+时间戳”经加密编码生成，可直接扣代码复现。
> 
> - **壳识别：** 样本在jadx中仅剩2-3个类，且出现qihoo相关类，判定为360数字壳；可使用Frida-DEXDump、脱壳ROM或脱壳云服务获取真实dex。
> - **算法定位：** 在 `com.novel.basic.token.xz.TokenUtil` 类中，`h(str,str2)` 函数先执行 `f(str,str2)` 并拼接 `_` + `System.currentTimeMillis()`，再经 `e()` 加密、`d()` 编码后返回；示例 `i()` 调用展示了token的构造方式。
> - **Hook验证：** 因加壳需延迟几秒等待加载，使用 `Java.perform` + `Java.use("com.novel.basic.token.xz.TokenUtil")` 钩住 `h`，实际日志抓到 `str=/v1/ipcn`，`str2=channel=zxf2019_19206_001&ip=&os=Android&package=cn.ttkmfxs.novel&udid=...&v=3.3.24.R`，结果为 `B993s65X5IwPTsXrgV%2F2rNvCYKcIjT4lyXrthojQ0LY%3D`。
> - **结论：** 该App算法并不复杂，难点主要在脱壳；壳破后静态分析和hook验证都很直接，可直接输出Java代码或转其他语言实现。

一、目标

## 一、目标

![token](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d5b0b4c5b94f6367.png)

1:token

今天的目标是这个 token 参数的算法,这个样本比较适合初学者，难度1星。

## 二、步骤

### 脱壳

先把apk拉进jadx

![qihoo](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/16ddc0713b3f113c.png)

1:ke

很明显不对劲，这种只有2-3个类的，就是加壳之后的明显特征，至于加了什么壳， qihoo 已经很明白告诉我们了，就是数字壳。

之前的教程我们介绍过 FRIDA-DEXDump脱壳或者刷个脱壳rom， 当然最方便的还是找个脱壳云服务。(私信给我，我把云服务的地址发你)

### 字符串查找

![tokenshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/35634f186b8c31cb.png)

1:token

这种 com.bytexxx / com.baidx / com.ss 之类的看上去就很妖艳的都是大厂的sdk，都是来迷惑你的道心的。

只有像这种带着app包名中类似单词的才是你的小清新。

token长得很想base64，所以我们点 com.novel.basic.token.Base64 进去看看,看上去是一个自己实现的base64类。

没看出有啥特别的，先不管，我们从左边展开类名，看看 com.novel.basic.token 包下面还有哪些类？

![tokensrc1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2cf0b403f1aeba63.png)

1:tokensrc1

神奇的是，我们没有找到 com.novel.basic.token 包，也许是dump的时候丢了。更神奇的是，我们找到了一个 com.novel.basic.token.xz 包，里面有个看上去浓眉大眼的 TokenUtil类

```java
public class TokenUtil {
    ...

public static String g(Map<String, String> map) {
        ArrayList<String> arrayList = new ArrayList(map.keySet());
        Collections.sort(arrayList);
        StringBuffer stringBuffer = new StringBuffer();
        for (String str : arrayList) {
            String str2 = map.get(str);
            stringBuffer.append("&");
            stringBuffer.append(str + "=" + str2);
        }
        return stringBuffer.toString().substring(1, stringBuffer.length());
    }

    public static String h(String str, String str2) {
        String str3;
        try {
            str3 = e(f(str, str2) + "_" + System.currentTimeMillis());
        } catch (Exception e) {
            e.printStackTrace();
            str3 = "";
        }
        return d(str3);
    }

    public static void i(String[] strArr) throws Exception {
        HashMap hashMap = new HashMap();
        hashMap.put(PackageDocumentBase.OPFTags.packageTag, "com.mianfeinovel");
        hashMap.put("os", "android");
        hashMap.put("v", "1.0.1");
        hashMap.put("channel", "blf1298_12243_001");
        hashMap.put("udid", "aaaaaaaaaaaa");
        String g = g(hashMap);
        System.out.println("/v1/recommend/female?" + g + "&token=" + h("/v1/recommend/female", g));
    }

...
}
```

从 i 函数上分析， token的运算很有可能是 h函数干的， 那就啥也不说了，hook先

### Hook验证

```java
function main() {
    Java.perform(function () {
        var threadef = Java.use('java.lang.Thread');
        var threadinstance = threadef.$new();

        let TokenUtil = Java.use("com.novel.basic.token.xz.TokenUtil");
        TokenUtil["h"].implementation = function (str, str2) {
            console.log(`TokenUtil.h is called: str=${str}, str2=${str2}`);
            let result = this["h"](str, str2);
            console.log(`TokenUtil.h result=${result}`);
            return result;
        };

    });
}

setTimeout(main, 5000);
// setImmediate(main);
```

由于是加壳应用，所以需要延迟个几秒再去hook对应的函数，给壳一点加载的时间。

跑一下，运气不错，就是我们要的结果

```bash
[M2010J19SC::cn.ttkmfxs.novel ]-> TokenUtil.h is called: str=/v1/ipcn, str2=channel=zxf2019_19206_001&ip=&os=Android&package=cn.ttkmfxs.novel&udid=01bb90d6de80f3cb01bb90d6de80f3cb&v=3.3.24.R
TokenUtil.h result=B993s65X5IwPTsXrgV%2F2rNvCYKcIjT4lyXrthojQ0LY%3D
```

## 三、总结

这个样本的算法比较清晰，可以直接扣出java代码，或者让ai转成其他的语言。

很多加壳应用最大的难点就是壳，敲开壳之后就是一马平川了。

做逆向运气很重要，真的。

![ffshow](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3541a31aaaf42519.png)

1:ffshow

坚硬只是表现

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
