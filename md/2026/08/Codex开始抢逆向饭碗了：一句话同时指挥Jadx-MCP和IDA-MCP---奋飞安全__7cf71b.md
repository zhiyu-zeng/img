---
title: Codex开始抢逆向饭碗了：一句话同时指挥Jadx MCP和IDA MCP - 奋飞安全
source: http://91fans.com.cn/post/codexone/
source_host: 91fans.com.cn
clip_date: 2026-08-04T14:35:51+08:00
trace_id: 84105a02-d5a9-42cc-a4f1-1cdc2a39de52
content_hash: d00c0baa50d3230575643009d460b870fa3f5740e12e6e3f01058c3d23d1a527
status: synced
tags:
  - AI辅助逆向
  - Android逆向
series: null
feed_source: 91fans·逆向
ai_summary: Codex通过Jadx MCP和IDA MCP能自动完成Android样本的Java层调用链梳理、so层定位与双端结果拼接，适合先干逆向"找入口、串链路"的脏活，但关键判断仍需人工。
ai_summary_style: key-points
images_status:
  total: 12
  succeeded: 12
  failed_urls: []
notion_page_id: 3b275244-d011-8104-9651-d9484cb910ce
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Codex通过Jadx MCP和IDA MCP能自动完成Android样本的Java层调用链梳理、so层定位与双端结果拼接，适合先干逆向"找入口、串链路"的脏活，但关键判断仍需人工。
> 
> - **演示样本：** MainActivity先加载native-lib，onCreate中调用Test.getInstance().init()加载libtest.so，再经Test.start()调至NativeHandler.start()这个native方法。
> - **Jadx MCP任务：** Codex让Jadx摸出调用链：MainActivity.onCreate → Test.getInstance().init() → System.loadLibrary("test") → Test.getInstance().start() → NativeHandler.start() → native start()；根据显式加载与native声明，判定实现最可能落在libtest.so。
> - **IDA MCP发现：** libtest.so是stripped so，IDA靠导入符号和JNI痕迹定位到constructor初始化逻辑：用DobbyHook钩住__android_log_print，替换为带"Dobby_libtest"标签的__android_log_vprint日志实现。
> - **两路会师：** Codex将Jadx与IDA结果拼成完整链路：Java层先加载so，so进场即hook系统日志，随后Java调NativeHandler.start()进入so内native实现；作者还让Codex基于已有上下文生成Frida hook思路做动态验证。
> - **定位结论：** Codex的作用像记性好、跑得快的实习生，能先理顺入口和链路，但哪个native逻辑重要、是否深挖、下一步上Frida还是继续IDA，仍需人来判断。

一、目标

## 一、目标

李老板：奋飞呀，现在AI都会写代码了，它到底能不能直接帮咱们做逆向？

奋飞：光靠一张嘴不行，逆向这活得给它工具。你总不能让一个人闭着眼睛拆发动机吧？

李老板：那你的意思是？

奋飞：给它两双眼睛。

一双给 Jadx MCP ，让它去看Java层。 一双给 IDA MCP ，让它去啃Native层。 然后中间再塞一个 Codex ，让它负责发号施令，顺便把两边的结果串起来。

![codexmcpmain v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/460c7900713a6aac.png)

1:codexmcpmain

以前我们逆向一个App，经常是这样：

1.  自己在Jadx里翻半天Java调用链
2.  再去IDA里一点点找so入口
3.  找到一半忘了前面Java层到底是谁调的谁
4.  最后开着一堆窗口，像在打牌

今天咱们不搞复杂样本，就拿我自己的一个小Demo下手，看看Codex能不能把这套活先干一部分。

这次的样本是一个Android Demo，Java入口在 `MainActivity` ，中间会调用 `com.qiyi.test.Test` 和 `NativeHandler` ，最终进入一个 `libtest.so` 。

今天的目标很简单：

1.  让Codex通过Jadx MCP把Java层调用链摸出来
2.  让Codex通过IDA MCP去分析 `libtest.so`
3.  最后让Codex把Java层和Native层拼成一条完整链路

如果这套流程跑顺了，那以后很多“先找入口、先串链路”的脏活，就可以先让AI去趟雷了。

## 二、准备

样本的Java代码大概长这样：

```java
public class MainActivity extends AppCompatActivity {

    static {
        System.loadLibrary("native-lib");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        com.qiyi.test.Test.getInstance().init();
        com.qiyi.test.Test.getInstance().start();

        TextView tv = findViewById(R.id.sample_text);
        tv.setText(stringFromJNI());
    }

    public native String stringFromJNI();
}
```

看到这里，经验丰富的同学鼻子应该已经动了一下。

这个App自己先加载了一个 `native-lib` ，然后又通过 `Test.getInstance().init()` 去加载另一个so，最后再调用 `start()` 。 这个结构就很适合拿来演示 Jadx看调用链，IDA看so实现 。

![mainactivity v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e0b1a9335ebba8dc.png)

1:mainactivity

`Test.java` 里面是这样的：

```java
public class Test {
    private static final Test ourInstance = new Test();

    public static Test getInstance() {
        return ourInstance;
    }

    private Test() {
    }

    public synchronized void init() {
        System.loadLibrary("test");
    }

    public synchronized void start() {
        com.qiyi.test.NativeHandler.getInstance().start();
    }
}
```

再看 `NativeHandler.java`

```java
public class NativeHandler {
    private static final NativeHandler ourInstance = new NativeHandler();

    public static NativeHandler getInstance() {
        return ourInstance;
    }

    private NativeHandler() {
    }

    public native void start();
}
```

到这里，其实已经很明确了：

1.  Java层先加载 `native-lib`
2.  然后再加载 `test`
3.  最终 `NativeHandler.start()` 这个native方法，大概率会落进 `libtest.so`

如果是以前，我们下一步多半就是手工点Jadx，翻so，找JNI。 但今天咱们不自己干，今天要体验一下当李老板的快乐。

## 三、先让Jadx干活

先把APK丢给Jadx，然后在Codex里开口：

```text
连接 JADX MCP，先从 MainActivity 开始分析这个 APK 的调用链。重点找：
1. 哪些 so 被加载了
2. Java 层如何走到 native 方法
3. com.qiyi.test.Test 和 NativeHandler 分别负责什么
请用清晰的调用路径输出结果。
```

![jadxprompt1 v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/47385103c3a8df7e.png)

1:jadxprompt1

这种活很适合Jadx MCP。

因为它擅长处理的，正是逆向前期最费手的那部分：

1.  找类
2.  找方法
3.  找调用关系
4.  先把零散入口收拢成一条主链

很快Codex就能把第一段链路摸出来：

```text
MainActivity.onCreate
  -> Test.getInstance().init()
  -> System.loadLibrary("test")
  -> Test.getInstance().start()
  -> NativeHandler.getInstance().start()
  -> native void start()
```

![jadxresult1 v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0ba6c0730b226901.png)

1:jadxresult1

这一步的价值看上去不惊艳，但很实用。

因为很多时候逆向刚开始最烦的，不是算法太难，而是 入口太多 。 你明明知道东西在so里，但是Java层到底是谁把它调进去的，得先理顺。

Jadx MCP 在这里干的活，本质上就是：

“帮你先把门牌号找到。”

### 再追一步

既然 `NativeHandler.start()` 已经浮出来了，就继续让Codex问：

```text
继续在 JADX MCP 里分析 NativeHandler.start 对应的 native 声明位置，告诉我它最可能落到哪个 so，给出判断依据。
```

这个问题比一句“帮我逆向一下”有效得多。

范围收窄之后，Codex 给出的判断通常会稳很多。

这里Codex通常会给出一个很合理的判断：

1.  `NativeHandler.start()` 是 native 方法
2.  `Test.init()` 显式加载了 `test`
3.  `Test.start()` 直接调用了 `NativeHandler.start()`
4.  所以这个native实现最可能在 `libtest.so`

这一步的作用，不是立刻拍板结论，而是先把 native 落点缩到一个足够小的范围，方便后面进 IDA 继续核实。

![jadxresult2 v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5fc7c36890308482.png)

1:jadxresult2

## 四、轮到IDA出场

Jadx把Java层的路摸清楚之后，就该让IDA MCP接手了。

这时候直接把 `libtest.so` 丢进IDA，然后继续给Codex下命令：

```text
连接 IDA MCP，分析 libtest.so。
请优先做这几件事：
1. 列出导入函数和可疑入口
2. 查找 JNI 相关符号、JNI_OnLoad 或 native 注册痕迹
3. 判断 Java 层的 NativeHandler.start 最可能对应到 so 里的哪个实现
不要泛泛而谈，直接给定位过程。
```

![idaprompt1 v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e01569b7cf15ff93.png)

1:idaprompt1

这个so有个特点，挺适合演示：

它是个 stripped so。

啥叫 stripped？ 就是那种“脸洗得很干净，名字全没了”的状态。 你不能像看Java代码那样，直接看到一堆明晃晃的方法名。

所以这时候IDA MCP的价值就出来了。

它可以先看导入符号，再找JNI相关痕迹，再从函数行为去反推哪个地方像 `start()` 的实现。

这个so里比较显眼的一段逻辑，是对 `__android_log_print` 做了处理。

![idalibtest v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bd44196f0e764daa.png)

1:idalibtest

对应的native代码大概是这样：

```cpp
static int (*orig_log_print)(int prio, const char* tag, const char* fmt, ...);

static int my_libtest_log_print(int prio, const char* tag, const char* fmt, ...)
{
    va_list ap;
    char buf[1024];
    int r;

    snprintf(buf, sizeof(buf), "[%s] %s", (NULL == tag ? "" : tag), (NULL == fmt ? "" : fmt));

    va_start(ap, fmt);
    r = __android_log_vprint(prio, "Dobby_libtest", buf, ap);
    va_end(ap);
    return r;
}

__attribute__((constructor)) static void ctor() {
    DobbyHook((void *) DobbySymbolResolver(NULL, "__android_log_print"),
              (void *) my_libtest_log_print,
              (void **) &orig_log_print);
}
```

看到这段，基本味道就出来了。

这不是单纯导出一个JNI函数完事， 它在库加载阶段就先用 `DobbyHook` 把 `__android_log_print` 给拦了。

这就很适合写文章，因为它有戏剧性：

1.  Java层负责把so请进来
2.  so一进场就先动系统日志
3.  然后再等Java层去调native方法

### IDA最擅长的是什么

很多同学会觉得，既然Jadx都能看Java层了，那IDA是不是只是锦上添花？

还真不是。

Jadx擅长的是：

1.  帮你快速理解Java世界
2.  找调用链
3.  找native声明
4.  看谁加载了哪个so

IDA擅长的是：

1.  看so真实干了什么
2.  在符号不全的时候继续往下走
3.  看导入、交叉引用、构造函数、初始化逻辑
4.  判断这段native代码到底是做计算、做注册、还是做hook

一个看楼上，一个看地下室。 你不能让Jadx去替IDA，也不能让IDA去替Jadx。

## 五、让Codex两路会师

前面这两步，单看都不新鲜。

真正有意思的是第三步： 让Codex把两边结果收回来，自己拼成一条完整链路。

这时候继续下指令：

```text
结合 JADX MCP 和 IDA MCP 的结果，把这条完整链路串起来：
MainActivity -> Test -> NativeHandler -> libtest.so
要求用逆向文章的写法输出，像是在给读者讲解，不要写成审计报告。
```

![codexmerge v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/77d6305a47d3dd46.png)

1:codexmerge

这里我特意让它按“逆向讲解”的口吻来整理，目的很简单：输出要像一篇能直接拿来读的分析笔记，而不是一份生硬的审计摘要。

Codex 收完两边结果之后，基本能整理出这样一条链路：

1.  `MainActivity` 启动时先加载 `native-lib`
2.  `onCreate()` 中调用 `Test.getInstance().init()`
3.  `init()` 里执行 `System.loadLibrary("test")` ，也就是加载 `libtest.so`
4.  `libtest.so` 在加载阶段通过 constructor 执行初始化逻辑
5.  初始化逻辑里调用 `DobbyHook` ，把 `__android_log_print` 做了替换
6.  随后 Java 层执行 `Test.getInstance().start()`
7.  `start()` 再转到 `NativeHandler.start()`
8.  `NativeHandler.start()` 最终进入 `libtest.so` 中对应的native实现

看到这里，文章的核心其实已经出来了。

今天真正要演示的，不是某个算法有多牛。 而是 Codex 能不能替你把 Java 层和 Native 层的结果先串起来 。

答案是：能，而且挺适合干这个。

![callchain v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/18a58a9e2cf0b089.png)

1:callchain

## 六、再补一刀，验证调用顺序

到这里，静态链路基本已经串起来了。 但逆向不能只停留在“看起来像”，最好还是再补一轮动态验证，把调用顺序真正钉死。

这时候可以直接让 Codex 按当前上下文整理一版 Frida 验证思路：

```text
根据当前分析结果，生成一个 Frida hook 思路，验证 Java 层和 native 层的调用顺序，但不要写成大而全模板，只给关键点。
```

![fridaprompt v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a090be18231771fc.png)

1:fridaprompt

这时候让它出思路，会比一上来直接丢一句“写个 Frida 脚本”更靠谱。

因为前面的上下文它已经都拿到了：

1.  Java入口是谁
2.  `System.loadLibrary("test")` 在哪
3.  `NativeHandler.start()` 是关键点
4.  `libtest.so` 里还有日志hook行为

有了这些信息，再去生成 Hook 点位和验证顺序，命中率会高很多。

这也是 MCP 最实用的地方之一： 先把样本喂到位，再让模型开口，输出通常会扎实不少。

## 七、总结

以前的逆向流程，更像是你一个人左手拿Jadx，右手拿IDA，嘴里叼着Frida，脑子里还得记着前面谁调了谁。

现在如果把Codex接进来，感觉就有点不一样了。

它并不能直接替你变成逆向高手。 但它很适合先干这些活：

1.  帮你找调用链
2.  帮你整理类和方法关系
3.  帮你在Jadx和IDA之间回收信息
4.  帮你把“入口在哪、链路怎么走”先理顺

真正值钱的部分，还是你来判断：

1.  这个native逻辑重要不重要
2.  这个so里哪块值得深挖
3.  这个Hook行为到底意味着什么
4.  下一步是该上Frida，还是该继续IDA

说白了，Codex不是来抢你饭碗的。 它更像是刚入行的实习生，跑得快，记性好，不嫌累。 前提是你得告诉它先去哪、看什么、怎么回报。

古法逆向有没有用？ 当然有。

但现在的问题已经不是“要不要用AI”，而是 你会不会让AI替你先把脏活干掉 。

![ffshow v2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f8c347f44660238e.png)

1:ffshow

多一双眼睛的人，不一定更聪明，但一定看得更快。

![100](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/897edc78d5c0d2b3.png)
