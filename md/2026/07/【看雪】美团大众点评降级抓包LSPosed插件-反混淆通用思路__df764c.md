---
title: 【看雪】美团大众点评降级抓包LSPosed插件-反混淆通用思路
source: https://bbs.kanxue.com/thread-291926.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-08T23:22:16+08:00
trace_id: 52f459f6-c9b0-4666-bc98-aea4959b1a2f
content_hash: 446ad610cfaa4526f5054834569ddf6bd0f64047565e0352f9c7397e0f74f1c8
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 通过LSPosed插件hook美团APP的网络配置方法，强制使用HTTP通道，实现降级抓包。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 39775244-d011-81bc-b3a9-f0d59d622598
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过LSPosed插件hook美团APP的网络配置方法，强制使用HTTP通道，实现降级抓包。
> 
> - **定位配置字段：** 搜索字符串"nt.defaulttunnel"，找到存储该配置的成员字段，通过字节码模式匹配（如optString调用和iput-object指令）定位。
> - **hook选择器方法：** 找到读取该字段并返回整数2或3的方法（2对应cip通道，3对应http通道），hook后固定返回3以强制使用HTTP。
> - **反混淆实现：** 使用dexlib2库静态扫描DEX字节码，通过特征匹配（如引用"cip"、"http"字符串和数字常量）定位方法，不依赖类名或方法名。
> - **反射调用：** 将DEX类型描述符（如Lcom/xxx;）转换为Java类名，反射获取方法后进行hook，实现通用性。
> - **插件通用性：** 适用于美团系APP（如美团、大众点评），因为通过模式匹配对抗混淆，而非硬编码类名。

如果只需要插件，不想看技术实现，可以关注公众号，发送“美团插件”  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/2c762919c72e1d79.png)  
美团系的APP都可以用，因为虽然类名和方法名不一样，但是做了方法搜寻对抗混淆，所以通用

## 1\. 先定位网络配置

* * *

先搜：

```
nt.defaulttunnel
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/72188245a53c1a35.png)  
其中 `nt.defaulttunnel` 很关键。它决定默认通道，比如 `cip` 、 `http` 。  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a45ac3bb6dac7f03.png)  
然后找到引用  
一个方法读取这个字段，返回 `2` 或 `3` ，返回3走的就是http，把这个hook掉返回3就可以了，走的就是http

```java
return (!"cip".equals(this.xxx) && "http".equals(this.xxx)) ? 3 : 2;
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ad86f6e08d61eb9e.png)

模块里自动定位的流程就是：

```
搜 "nt.defaulttunnel"
找到被赋值的成员字段
找读取这个字段的 int 无参方法
方法里包含 "cip"、"http"、返回 2/3
hook 这个方法，直接返回3
```

## 2\. 实现反混淆hook

* * *

用 dexlib2 静态扫 dex，不依赖类名、方法名、字段名、Robust。

### 依赖

```gradle
implementation "org.smali:dexlib2:2.5.2"
implementation "de.robv.android.xposed:api:82"
compileOnly "de.robv.android.xposed:api:82"
```

基于dexlib2库，通过对DEX字节码进行模式匹配

### 1\. 找字段（定位 nt.defaulttunnel 配置）

要找的字节码模式是：optString 读配置 -> move-result-object 拿结果 -> iput-object 存进成员变量。

```java
// 1. 先看有没有 "nt.defaulttunnel" 和 "cip" 两个常量
if (!hasKey || !hasCip) continue;

// 2. 找到 invoke-virtual 调用 optString 的地方
if (isInvokeOptString(insn)) {
    // 3. 看下一条是不是 move-result-object，拿返回值寄存器
    Integer moveResultReg = nextMoveResultObjectRegister(insns, i);
    if (moveResultReg == null) continue;

    // 4. 在后面几条指令里找 iput-object，且寄存器对上号
    FieldReference field = findNextIputObjectSameRegister(insns, i + 1, moveResultReg);
    if (field != null && "Ljava/lang/String;".equals(field.getType())) {
        return new FieldSig(field.getDefiningClass(), field.getName(), field.getType());
    }
}
```

### 2\. 找方法（定位返回 int 的选择器）

不硬匹配，方法特征。  
在同一个类中，找那个无参且返回int、读取了那个“nt.defaulttunnel”字段（这个是关键，几乎百发百中）、同时引用了"cip"/"http"两个字符串和2/3两个数字常量，并调用了String.equals比较的方法。

### 3\. 转反射（拿到可调用的 Method）

定位到签名后，把 Dex 格式的类型描述符（Lcom/xxx;）转成 Java 类名（com.xxx），然后直接反射拿方法。

```java
// 把 "Lcom/example/MyClass;" 变成 "com.example.MyClass"
String className = dexTypeToJava(sig.owner);
Class<?> clazz = Class.forName(className, false, cl);

// 参数类型同样转一遍
Class<?>[] params = new Class<?>[sig.params.size()];
for (int i = 0; i < sig.params.size(); i++) {
    params[i] = dexTypeToClass(sig.params.get(i), cl);
}

// 反射获取并爆破
Method m = clazz.getDeclaredMethod(sig.name, params);
m.setAccessible(true);
return m;
```

## 3\. 成果展示

轻松抓到团价格，大众点评同理  
![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/97b3fadb1f3cecfd.png)
