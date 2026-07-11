---
title: 【看雪】frida和js之间需要转换的数据
source: https://bbs.kanxue.com/thread-291959.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-11T09:54:02+08:00
trace_id: 2f3e9e83-4187-4457-b85c-67426d11c710
content_hash: 13575d40a3b46a925c06e839b087a4751ea5507efe18c8c0aaae351b1f731456
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·逆向工程
ai_summary: |-
  Frida逆向中，许多Java类型无法在JS层自动转换，需使用特定API手动处理才能正确操作。
  - **自动转换类型：** Java的基本类型（如int、boolean）会自动转为JS的Number/Boolean；String通常可直接当字符串使用，但为安全常需调用`.toString()`。
  - **需手动转换类型：** Java的`long`会转为`Int64`对象；数组需用`Java.array()`创建；`List`、`Map`、`Set`等集合类型不会自动转换，需调用原生Java方法（如`.get()`、`.size()`）访问。
  - **Java对象访问规则：** 访问Java对象的字段需使用`.value`获取/设置；若字段与方法名冲突，访问字段需在名前加下划线前缀（如`obj._m.value`）。
  - **JNI Handle的转换：** Native层获取的JNI Handle（如`jobject`）并非对象内存地址，需通过`Java.cast(handle, JavaClass)`转换为Java Wrapper对象后才能操作。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39a75244-d011-81c3-8205-e65571fc05b5
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Frida逆向中，许多Java类型无法在JS层自动转换，需使用特定API手动处理才能正确操作。
> - **自动转换类型：** Java的基本类型（如int、boolean）会自动转为JS的Number/Boolean；String通常可直接当字符串使用，但为安全常需调用`.toString()`。
> - **需手动转换类型：** Java的`long`会转为`Int64`对象；数组需用`Java.array()`创建；`List`、`Map`、`Set`等集合类型不会自动转换，需调用原生Java方法（如`.get()`、`.size()`）访问。
> - **Java对象访问规则：** 访问Java对象的字段需使用`.value`获取/设置；若字段与方法名冲突，访问字段需在名前加下划线前缀（如`obj._m.value`）。
> - **JNI Handle的转换：** Native层获取的JNI Handle（如`jobject`）并非对象内存地址，需通过`Java.cast(handle, JavaClass)`转换为Java Wrapper对象后才能操作。

本文所使用的fria版本为17.9.6。如果文章有错误希望指出，不吝赐教。

在Frida中，Java层和Js层之间的数据并不是完全一致的，虽然frida-java-bridge会自动完成绝大多数类型转换，但有些类型需要手动转换或使用专门的API。下表列出了Java和js之间数据是否hi自动转换以及常用的API。

| Java类型 | JS中表现 | 是否自动转换 | 常用API |
| --- | --- | --- | --- |
| boolean | Boolean | ✅   | 无   |
| byte | Number | ✅   | 无   |
| short | Number | ✅   | 无   |
| int | Number | ✅   | 无   |
| float | Number | ✅   | 无   |
| double | Number | ✅   | 无   |
| long | Int64对象（不是普通Number） | ⚠️  | `.toString()` 、 `valueOf()` |
| char | String(长度1) | ✅   | 无   |
| String | String 或 Java String Wrapper | ✅   | `$new()` |
| Object | Java Wrapper | ⚠️  | `Java.cast()` |
| 数组  | JS数组 / PrimitiveArray | ⚠️  | `Java.array()` |
| List | Java Wrapper | ❌   | 调用 `.get()` `.size()` |
| Map | Java Wrapper | ❌   | 调用 Java API |
| Set | Java Wrapper | ❌   | 调用 Java API |
| byte\[\] | PrimitiveArray | ⚠️  | `Java.array('byte', ...)` |
| Object\[\] | JS Array | ⚠️  | `Java.array()` |
| Enum | Java Wrapper | ❌   | `.name()` `.ordinal()` |
| Class | Java Wrapper | ❌   | `Java.cast()` |
| Throwable | Java Wrapper | ❌   | `.getMessage()` |

## 一、基本数类型

```java
int
boolean
float
double
char
short
byte
```

这些在Java中式基本类型的变量，进入js后依然是普通变量：

```javascript
Java.perform(function(){
    var Test Java.use("com.test.Test");
    
    Test.test.overload("int").implementation = function(i){
        console.log(typeof i);//number
        console.log(i);//123
        
        return this.test.call(this,i+1);
    }
})
```

这些基本类型几乎可以不考虑转换问题。

## 二、long类型

在Java中定义 `long id = 1234567890123L;`，在js中输出： `console.log(i);`，输出的不是普通对象，而是一个Int64对象。例如：

```javascript
console.log(id.toString());
console.log(id.valueOf());
console.log(id.equals(100));
```

因为JS的Number最大只能精确表示53位整数，而Java的long是64位，所以Frida使用专门的对象来避免精度丢失。

## 三、String

Java中 `String s = "Hello";`，在js里通常可以直接当字符串使用：

```javascript
console.log(s);
console.log(s.length);
console.log(s.toString());
```

至于第三段代码调用 `toString()` 方法的原因：

通常情况下，Java的String对象JS可以直接调用：

```javascript
Java.perform(function() {
    var String = Java.use("java.lang.String");
    var str = String.$new("Hello Frida");
    
    console.log(str);                    // 输出: Hello Frida
    console.log("内容: " + str);          // 输出: 内容: Hello Frida
    
    console.log(str.toString());         // 输出: Hello Frida
});
```

## 1、避免对象引用输出

```javascript
Java.perform(function() {
    var String = Java.use("java.lang.String");
    var str = String.$new("Hello");
    
    console.log(str);  // 可能输出: java.lang.String
    
    //  强制转换为 JavaScript 字符串
    console.log(str.toString());  // 输出: Hello
});
```

某些情况下，直接输出可能会是Java的对象引用

## 2、在复杂表达式中确保类型正确

```javascript
Java.perform(function() {
    var String = Java.use("java.lang.String");
    var str = String.$new("Frida");
    
    if (str === "Frida") {
        console.log("相等");  // 可能不会执行！
    }
    
    if (str.toString() === "Frida") {
        console.log("相等");  // 会执行
    }
});
```

直接比较可能会出现问题，比如比较的是对象引用。

## 3、传递给需要纯字符串的API

```javascript
Java.perform(function() {
    var String = Java.use("java.lang.String");
    var str = String.$new("test@example.com");
    
    //  某些 JavaScript API 可能不接受 Java 对象
    var parts = str.split("@");  // 可能报错！
    
    //  转换为纯 JavaScript 字符串
    var parts = str.toString().split("@");  // 正常工作
});
```

在JS中创建Java String对象：

```javascript
var JString = Java.use("java.lang.String");
var str = JString.$new("hello")
```

## 四、Java Object

Java中 `User user` ，JS收到的是 `Java Wrapper` ，所以不能直接访问所有的字段，需要：

```javascript
console.log(user.$className);
//$className的作用是打印user的完整包名+类名
console.log(user.getName());
console.log(user.getAge());
```

Frida访问Java类中字段需要按照特定格式：访问Java字段用.找到字段，再用.value获取或设置字段值。

## 1、访问实例字段

假设有Java类：

```java
public class User {
    public String name = "Alice";
    public int age = 20;
}
```

Frida：

```javascript
Java.perform(function () {
    var User = Java.use("com.test.User");

    var obj = User.$new();

    console.log(obj.name.value);
    console.log(obj.age.value);
});
//Alice
//20
```

这里：

```
obj
 │
 ├── name   ---> Java Field Wrapper
 │               │
 │               └── value ---> "Alice"
 │
 └── age    ---> Java Field Wrapper
                 │
                 └── value ---> 20
```

也就是说 `obj.name` 得到的是Field Wrapper，而不是真正的字段值。真正的数据在 `obj.name.value` 中。

## 2、修改字段值

修改字段值只能通过下面的方式来修改:

```javascript
user.age.value = 30;
```

## 3、访问静态字段

Java：

```java
public class Config {
    public static int VERSION = 10;
}
```

Frida中需要定位到这个类，并且也需要使用.value：

```javascript
var Config = Java.use("com.test.Config");

console.log(Config.VERSION.value);

Config.VERSION.value = 20;
```

## 4、如果字段是对象

例如：

```java
public User user;
```

Frida：

```python
var u = obj.user.value
```

得到的依然是一个Java Wrapper。

需要继续访问：

```javascript
console.log(u.name.value);
console.log(u.age.value);
//也可以链式访问
console.log(obj.user.value.name.value);
```

## 5、如果字段和方法重名

这是Frida的特殊规则，例如Java中有“

```java
class Test {
    public int m;

    public int m() {
        return 1;
    }
}
```

如果直接 `obj.m` ，那么frida默认认为你想要访问方法。

字段需要写成 `obj._m.value` ，也就是在字段名前加" `_` "。

## 五、数组

Java数组返回方法后，通常不需要主动转换。Frida已经帮助你转换成了一个可以直接在JS中操作的对象，只是不同类型的数组表现形式略有不同。

## 1、遍历数组

Frida可以获取所有从Java层得到的数组的length属性，也可以遍历这些数组，只不过根据数组形式的不同，遍历方式也不同。比如下面展示遍历从Java层获得的byte数组和Object数组：

```javascript
//byte数组
for (var i = 0; i < result.length; i++){
    console.log(result[i]);
}
//Object数组
for (var j = 0; j < result.length; j++){
    console.log(result[i].age.value);
}
```

## 2、打印数组

Frida中直接打印数组的时候 `console.log(result)` ，输出可能是 `[object Object]` 或类型的东西。这是因为它是一个PrimitiveArray对象，不是普通的JS Array。在这种情况下可以自己遍历这个数组，然后转移到JS的数组中:

```javascript
var arr = [];
for (var i = 0; i < result.length; i++){
    arr.push(result[i]);
}

    console.log(arr);
```

## 3、转换byte数组

在Frida中真正常见的是 `byte[]` 转字符串和byte\[\]转十六进制：

例如Java中:`byte[] = 12 5A FF 01 ...`，那么JS中需要:

```javascript
var hex = [];  
  
for (var i = 0; i < result.length; i++) {  
  
var b = result[i];  
  
if (b < 0)  
b += 256;  
  
hex.push(("0" + b.toString(16)).slice(-2));  
}  
  
console.log(hex.join(" "));
//输出0c 5a ff 01
```

因为Java的byte是有符号的(-128~127)，所以遇到负数时通常先加256再格式化。

如果知道 `byte[]` 数组中存的是UTF-8文本，可以直接借助Java的String类输出:

```javascript
var JString = Java.use("java.lang.String");

var str = JString.$new(result);

console.log(str);
```

如果不是UTF-8而是AES密文等二进制数据的时候，就不能这样转换，否则会出现乱码。

## 4、二进制数据转UTF-8

在Frida中也可以经常看到这样的工具函数:

```javascript
var ByteString = Java.use("com.android.okhttp.okio.ByteString");
    //工具函数，用于将ASCII码转换为UTF8编码的字符串
    function toUtf8(data){
        console.log(ByteString.of(data).utf8());
    }
```

`ByteString.of(data)` 是 `ByteString` 类的一个静态方法。这个方法的作用是将原始的Java byte\[\]对象，包装成一个 `ByteString` 对象。

`.uft8` 是 `ByteString` 的一个实例方法，该方法的功能是尝试将包装的二进制数据用 `UTF-8` 字符集解码成一个Java字符串。

## 5、JS向Java传递数组

有时也需要在Frida中向Java层传递一个数组:

```javascript
var User = Java.use("com.test.User");

var u1 = User.$new();
var u2 = User.$new();

var arr = Java.array(
    "com.test.User",
    [u1,u2]
);
```

`Java.array(type, elements)` 是Frida创建Java数组的标准方式，支持基本类型数组和对象数组

## 6、一个实例

下面的例子几乎涵盖了实际逆向中的需求：

```javascript
Java.perform(function () {

    var cls = Java.use("com.test.Test");

    cls.encrypt.implementation = function (input) {

        var result = this.encrypt(input);

        // Java byte[] -> JS Array
        var bytes = [];

        for (var i = 0; i < result.length; i++) {

            var b = result[i];

            if (b < 0)
                b += 256;

            bytes.push(b);
        }

        console.log(bytes);

        console.log(bytes.length);

        return result;
    };

});
```

## 六、List

例如Java代码:`ArrayList<String>` ，不会自动变成JS Array，它仍然是一个Java对象。但是Frida也可以像操作Java数组那样，获取Java List的长度以及通过.get(下标)的方法得到对应的元素:

```javascript
console.log(list.size());

console.log(list.get(0));

console.log(list.get(1));

var jsArray = [];

for (var i = 0; i < list.size(); i++) {
    jsArray.push(list.get(i));
}
```

## 七、Map

诸如Java的 `HashMap` 等，在Frida中获取到后依然是Java对象，但可以通过以下方法操作：

```javascript
console.log(map.get("name"));

console.log(map.keySet());

console.log(map.values());

var iterator = map.entrySet().iterator();

while(iterator.hasNext()){
    var entry = iterator.next();

    console.log(entry.getKey());

    console.log(entry.getValue());
}
```

## 八、Class

Frida中可以这样操作:

```javascript
console.log(cls.getName());

console.log(cls.getSuperclass());

var Class = Java.use("java.lang.Class");
var c = Java.cast(handle, Class);
```

## 九、Throwable

Frida中可以这样操作异常对象:

```javascript
console.log(e.getMessage());

console.log(e.toString());

console.log(
    e.getStackTrace()
);
```

## 十、JNI Handle

有时 Native Hook拿到的是:

```python
jobject
jstring
jclass
```

这些实际上JNI Handle，要在Java层使用，需要:`Java.cast(handle, SomeClass);`。

## 1、JNI Handle本质

那么JNI Handle的本质是什么？在学习中，最容易建立正确模型的比喻是：“JNI Handle更像是native层一个指向Java层对象的指针”。但实际上来讲，JNI Handle是Native层保存的一个“Java对象引用”，它与指针的区别在于：JNI规范故意没有保证jobject一定就是对象的内存地址。

可以试着这样理解:把JVM想象成一个仓库

```python
Java Heap

┌────────────┐
│  User对象   │
│ name="Tom" │
│ age=18     │
└────────────┘
```

Native里面不会直接拿到它的首地址，而是拿到一个"Handle #25"，或者"Reference #25"，而JVM内部知道：

```python
Handle #25
        │
        ▼
Java Heap
        │
        ▼
User对象
```

因此： `Native->jobject->JVM->整整的Java对象` 。这也是为什么JNI官方文档一致使用“Reference（引用）”这个术语。

还有一部分原因是：Java有：

-   `GC` （垃圾回收机制）
-   `Heap Compact` （堆压缩机制）
-   对象移动（Object Moving）

因此，。

这样看的话，它们之间的关系更像是:

| 操作系统 | JNI |
| --- | --- |
| 虚拟地址（Virtual Address） | `JNI Handle` （ `jobject` 、 `jstring` 等） |
| MMU + 页表 | JVM（准确地说是 JVM 的引用管理和 GC 系统） |
| 物理页（Physical Page） | Java Heap 中真正的 Java 对象 |

## 2、Frida中拿到JNI Handle后的转化

假设在Java中有：

```java
package com.demo;

public class User {
    public String name = "Alice";

    public String getName() {
        return name;
    }

    public native void test();
}
```

可以看到在User类中注册了一个native函数test。对应JNI:

```c
JNIEXPORT void JNICALL
Java_com_demo_User_test(JNIEnv *env, jobject thiz)
{
    // thiz 就是 JNI Handle（jobject）
}
```

那么就可以通过Frida代码得到JNI Handle：

```javascript
Interceptor.attach(addr, {

    onEnter(args) {

        var jobjectHandle = args[1];

        console.log(jobjectHandle);
    }
});
```

拿到了JNI Handle以后就可以转换成Java对象:

```javascript
Java.perform(function () {

    var User = Java.use("com.demo.User");

    Interceptor.attach(addr, {

        onEnter(args) {

            var handle = args[1];

            var obj = Java.cast(handle, User);

            console.log(obj);
        }
    });

});
```

至于为什么Java.cast()可以转化为Java对象是因为:

```python
Java.cast()

        │

JNI Handle
        │
        ▼
JNI API
        │
        ▼
找到对应Java对象
        │
        ▼
创建Java Wrapper
```

所以Java.cast()并不是把一块内存“强制转换”成对象，而是告诉Frida：这个JNI 引用实际上对应的就是User类型，请为我创建一个对应的Java包装对象(Wrapper)“。

## 3、转换后能做什么？

再此之前先看看Oracle官方JNI规范给出的完整的引用类型继承关系:

```
jobject
│
├── jclass
├── jstring
├── jthrowable
│
└── jarray
    │
    ├── jobjectArray
    ├── jbooleanArray
    ├── jbyteArray
    ├── jcharArray
    ├── jshortArray
    ├── jintArray
    ├── jlongArray
    ├── jfloatArray
    └── jdoubleArray
```

值得注意的是，所有的普通java实例在JNI函数中都会变为 `jobject` 。既然如此， `jclass` 的存在意义是什么？

先说结论： `jclass` 的存在不是因为JVM不能用 `jobject` 表示，而是因为 `java.lang.Class` 在Java中本身就是一中特殊现象，它代表类的元数据，而不是普通实例。换句话说：

-   `jobject` 表示某个类的实例
-   `jclass` 表示这个类本身。

### （1）jobject转换后：

```javascript
console.log(obj.name.value);//读取字段
obj.name.value = "Bob";//修改字段
obj.login();//调用实例方法
obj.getClass();//获取class

//强制类型转化
var ArrayList = Java.use("java.util.ArrayList");
var list = Java.cast(obj, ArrayList);
console.log(list.size());
```

### （2）jstring转换后：

```javascript
console.log(s.length());//返回字符串长度
console.log(s.charAt(0));//返回字符串索引0位置的字符，类型位char
console.log(s.contains("abc"));//判断字符s中是否包含子串"abc"
console.log(s.substring(1));//返回从索引1开始到结尾的字串
console.log(s.hashCode());//返回字符串的哈希码（一个int值）
```

### (3)jbyteArray一般不转化

更多的是利用JNI API：

```javascript
env.getByteArrayElements()
env.getArrayLength()
//或者自己遍历数组，然后转化为js数组
```

### （4）jclass转换后：

既然它代表class对象，那么能否修改类呢？答案是：不能。

原因很简单：因为java.lang.Class对象里面保存的是：类名、方法列表、字段列表、父类、接口、Annotation和Modifier。这些是类的元数据。所以转换后可以做很多的反射。

```javascript
console.log(clazz.getName());//获取类名
clazz.getSuperclass();//获取父类
clazz.getInterfaces();//获取接口
clazz.getDeclaredFields();//获取字段
clazz.getDeclaredMethods();//获取方法
clazz.getDeclaredConstructors();//获取Constructor
clazz.isInterface();//判断是不是接口
clazz.isArray();//判断是不是数组
clazz.getModifiers();//获取modifier
```

[#问题讨论](https://bbs.kanxue.com/forum-4-1-197.htm) [#其他内容](https://bbs.kanxue.com/forum-4-1-10.htm)
