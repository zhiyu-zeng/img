---
title: 【先知】CodeQL 复现 Struts OGNL 注入：Source/Sink 建模、误报剔除与路径验证
source: https://xz.aliyun.com/news/92912
source_host: xz.aliyun.com
clip_date: 2026-10-09T16:24:50+08:00
trace_id: 0897e894-8561-4b6b-b91c-65118410d9b1
content_hash: 6aa66c56ca59cbf3ec79e4fa2b206036b5c5031b79796be0f979bdf462c5b7fb
status: synced
tags:
  - 先知
  - 漏洞分析
  - Android逆向
series: null
feed_source: 先知安全技术社区
ai_summary: Struts2 系列 RCE 的根因都是不可信输入被拼进 OGNL 表达式执行，用 CodeQL 建模 Source/Sink 并剔除误报可批量挖出变体 0day。
ai_summary_style: key-points
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 3f475244-d011-818a-8121-fbfa4c349b71
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Struts2 系列 RCE 的根因都是不可信输入被拼进 OGNL 表达式执行，用 CodeQL 建模 Source/Sink 并剔除误报可批量挖出变体 0day。
> 
> - **漏洞同源：** S2-032/033/037 本质是同一问题，官方补丁修了三次才堵上；`proxy.getMethod()` 从 URL 取值后拼 `"()"` 交给 `ognlUtil.getValue()` 执行，即 RCE 数据流。
> - **Source 建模：** 在 `ActionProxyGetMethod` 中打包 `getMethod()`、`getNamespace()`、`getActionName()` 三个方法作为污点入口，其中 `getNamespace()` 最终对应 0day S2-057。
> - **Sink 选择：** 不用表面 `OgnlUtil::getValue()`/`TextParseUtil::translateVariables()`，而归结到最底层的 `OgnlUtil::compileAndExecute()`；`compileAndExecuteMethod()` 因新版补丁加入 `checkSimpleMethod()` 校验而被从 Sink 剔除以消误报。
> - **补流与降噪：** 重写 `isAdditionalFlowStep`，用 `TaintTracking::localTaintStep` 加"同类内 Field 赋值→读取"的跨函数隔空传递规则；用 `isBarrier` 阻断 `ValueStackShadowMap` 的 `get`/`containsKey`（第三方插件多态误报）和 `ActionMapping::toString()`，并剔除单元测试代码。
> - **验证与战果：** 改 `path-problem` 模式看图走线，最终仅剩个位数结果；通过 `ServletActionRedirectResult` 的 namespace→ActionMapping→setLocation→conditionalParse→translateVariables 链路，本地构造请求弹计算器，并在 `ActionChainResult`、`PostbackResult`、`ServletUrlRenderer` 再打通 3 个 RCE。

> 本文通过分析 Apache Struts 的历史 RCE 漏洞（S2-032、S2-033、S2-037），利用 CodeQL 将 untrusted input 流入 OGNL 表达式执行的路径进行建模。通过定义基于 ActionProxy 的污点来源（Source）和 OgnlUtil 的执行汇聚点（Sink），研究者能够系统地识别出潜在的攻击面。
> 
> 简单来讲，你要学会用一些工具去对比补丁差异。本文为读后感，对大佬的一些源码进行了逐行解答，还提出了一些自己的理解。个人觉得这篇文章非常的经典。
> 
> 您可以在此阅读完整原文： [https://securitylab.github.com/research](https://securitylab.github.com/research) 跟着复现一遍。

* * *

## 一、抓住了漏洞的本质：都是 OGNL 表达式注入

作者得知，Struts2 框架的大多数远程代码执行（RCE）漏洞，底层逻辑完全一样：

> 都是因为框架把“不可信的用户输入”当成了代码，直接交给了威力巨大的 OGNL 引擎去解析。

只要黑客控制了 OGNL 表达式的内容，就能直接在服务器上执行任意系统命令。

* * *

## 二、发现了官方的“名场面”：同一个漏洞修了三次都没修好

作者发现了一件非常有趣且尴尬的事：

S2-032、S2-033 和 S2-037 这三个漏洞本质上同一个底层问题。官方安全团队接连发布了三次补丁，尝试了三次才勉强把这个已知漏洞补上。

这让作者意识到：

> 官方的防线漏洞百出，框架底层肯定还藏着类似的“变体漏洞”。

* * *

## 三、抓到了导致爆炸的直接现场代码

通过对比老版本的源码，作者直接定位到了这三个漏洞触发时的核心 Java 代码片段：

```java
String methodName = proxy.getMethod();    // <-- 不可信的 Source（源头）
// ...
methodResult = ognlUtil.getValue(methodName + "()", ...); // <-- 致命的 Sink（爆炸点）
```

他看懂了漏洞的数据流：

黑客把恶意代码塞进 URL，框架通过 `proxy.getMethod()` 把它取出来存进 `methodName` 变量；紧接着，程序直接把这个变量拼接上小括号 `"()"` ，毫无防备地丢给了 `ognlUtil.getValue()` 强行执行。

* * *

## 四、污点源和污染汇

作者在编写 CodeQL 规则时，一共用了以下 **3 个污点源（Sources）** 和 **3 个污染汇（Sinks）**。

作者并没有针对每个漏洞单独写规则，而是采用了老练的“归纳法”，把它们各自打包成了一个集合，从而实现了跨版本的批量漏洞挖掘。

### 1\. 污点源（Sources）：共有 3 个

作者通过审计 `ActionProxy` 接口的定义，推测所有能从 URL 中提取信息的方法都可能被黑客控制。因此他在 QL 类 `ActionProxyGetMethod` 中，一共打包了以下 3 个方法作为污点入口：

1.  `getMethod()` ：获取当前请求要调用的方法名（直接触发了老漏洞 S2-032 / S2-033 / S2-037）。
2.  `getNamespace()` ：获取当前请求的命名空间（最终直接触发了全新 0day 漏洞 S2-057）。
3.  `getActionName()` ：获取当前请求的 Action 别名（同样成功打通并触发了 RCE）。

### 2\. 污染汇（Sinks）：前后共涉及 3 个

在污染汇的定义上，作者经历了一次“先归纳底层，再根据补丁进行精简”的过程。整个研究过程中一共涉及以下 3 个 Sink 点：

#### 1）历史漏洞的表面 Sink

-   `OgnlUtil::getValue()` ：老漏洞 S2-032 等表面上直接调用的函数。但在 S2-045 中，官方改用 `TextParseUtil::translateVariables()` 执行 OGNL。作者为了以逸待劳，选择不把它们当作直接 Sink，而是去挖它们底层的共同根源函数。

#### 2）作者打包定义的 2 个“最底层根源 Sink”

作者通过阅读源码发现，不管是 `getValue` 还是 `translateVariables` ，它们在框架最深处都会调用 `OgnlUtil` 类里的以下两个核心底层函数。作者将它们定义为了真正的 Sink 目标：

-   `OgnlUtil::compileAndExecute()` ：真正的终极 Sink。没有任何安全保护，脏数据只要作为第一个参数 `ma.getArgument(0)` 流入这里，必然触发 RCE。
-   `OgnlUtil::compileAndExecuteMethod()` ：中途被剔除的 Sink。作者最初将它也设为 Sink，但随后重跑脚本时发现老漏洞持续误报。作者跟进源码发现，官方在最新的补丁中，在这个函数里强制塞入了一个叫 `checkSimpleMethod()` 的安全过滤器。因此，作者判定它已经安全，并在随后将其从 Sink 名单里无情剔除，以此清洗掉了误报噪音。

* * *

## 五、大佬的终极流向图

通过以上的定义和精简，作者最终让 CodeQL 追踪的致死链路变成了：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9a179e5833770197.png)

* * *

## 六、大概的流程想法

```plain
class OgnlTaintTrackingCfg extends DataFlow::Configuration {
  OgnlTaintTrackingCfg() {
    this = "mapping"
  }

  override predicate isSource(DataFlow::Node source) {
    isActionProxySource(source)
  }

  override predicate isSink(DataFlow::Node sink) {
    isOgnlSink(sink)
  }

  override predicate isAdditionalFlowStep(DataFlow::Node node1, DataFlow::Node node2) {
    TaintTracking::localTaintStep(node1, node2) or
    exists(Field f, RefType t | node1.asExpr() = f.getAnAssignedValue() and node2.asExpr() = f.getAnAccess() and
      node1.asExpr().getEnclosingCallable().getDeclaringType() = t and
      node2.asExpr().getEnclosingCallable().getDeclaringType() = t
    )
  }
}

from OgnlTaintTrackingCfg cfg, DataFlow::Node source, DataFlow::Node sink
where cfg.hasFlow(source, sink)
select source, sink
```

### 1\. 核心骨架：定义规则名字与首尾

```plain
class OgnlTaintTrackingCfg extends DataFlow::Configuration {
  OgnlTaintTrackingCfg() {
    this = "mapping"
  }
```

> **白话**：创建了一个名为 `OgnlTaintTrackingCfg` 的配置类。在旧版 CodeQL 中，必须给这个配置起个唯一的名字，作者在这里给它命名为 `"mapping"` 。

```plain
  override predicate isSource(DataFlow::Node source) {
    isActionProxySource(source)
  }

  override predicate isSink(DataFlow::Node sink) {
    isOgnlSink(sink)
  }
```

> **白话**：这两段很好理解，就是把你在前两步里辛苦定义好的 Source 和 Sink 强行塞进这个配置里，告诉引擎：“两头我已经堵死了，你帮我连线吧！”

### 2\. 全篇最硬核：强行搭建“断崖桥梁”（isAdditionalFlowStep）

在默认情况下，CodeQL 的 DataFlow（数据流）非常严格，它只认普通的变量赋值，比如 `a = b` ，数据从 `b` 流向 `a` 。

但在实际的庞大 Struts 框架中，黑客的脏数据在传递时，遭遇了断崖。脏数据不是通过简单的赋值传递的，而是先存进了对象的某个成员变量（Field）里，在另一个完全不同的函数里，又通过这个成员变量被读取了出来。

默认的数据流引擎看到这种“跨函数、跨成员变量”的操作，直接就跟丢了。为了防止漏报，作者重写（override）了下面这个大杀器：

```plain
  override predicate isAdditionalFlowStep(DataFlow::Node node1, DataFlow::Node node2) {
```

> **核心概念**： `isAdditionalFlowStep` 的意思是：“报告 CodeQL 探长，如果你的默认逻辑在 `node1` 和 `node2` 之间找不到数据通路，不要放弃！只要它们满足我接下来写的条件，你就必须承认 `node1` 的污点数据能直接瞬移到 `node2` 身上！”

作者给了两个瞬移的条件，用 `or` 连接：

#### 条件一：开启基础的污点扩散

```plain
    TaintTracking::localTaintStep(node1, node2) or
```

> **白话**：只要在同一个方法内，发生了字符串拼接、类型转换等基础污染行为，比如 `node2 = node1 + "()"` ，就承认数据流成立。

#### 条件二：成员变量“隔空传送”（全篇最神的一行）

```plain
    exists(Field f, RefType t | node1.asExpr() = f.getAnAssignedValue() and node2.asExpr() = f.getAnAccess() and
      node1.asExpr().getEnclosingCallable().getDeclaringType() = t and
      node2.asExpr().getEnclosingCallable().getDeclaringType() = t
    )
  }
}
```

**语法拆解：**

-   `Field f` ：定义一个类的成员变量 `f` 。
-   `RefType t` ：定义一个类 `t` 。
-   `node1.asExpr() = f.getAnAssignedValue()` ： `node1` （脏数据）正准备赋值给这个成员变量 `f` 。
-   `node2.asExpr() = f.getAnAccess()` ： `node2` 正准备去读取（访问）这个成员变量 `f` 。
-   `getEnclosingCallable().getDeclaringType() = t` ：无论是给 `f` 赋值的代码，还是读取 `f` 的代码，它们都属于同一个类 `t` 。

> **作者告诉 CodeQL**：“只要你发现黑客的脏数据（ `node1` ）被存进了某个类（ `t` ）的成员变量（ `f` ）中；随后，在这个类（ `t` ）的另一个地方，有人又把这个成员变量（ `f` ）取出来用（ `node2` ）。哪怕这两个操作之间没有直接的赋值线，你也必须判定脏数据已经通过这个成员变量成功隔空传送了！”

### 3\. 最后的最终疯狂：爆出 0day！

```plain
from OgnlTaintTrackingCfg cfg, DataFlow::Node source, DataFlow::Node sink
where cfg.hasFlow(source, sink)
select source, sink
```

> **白话**：声明刚才定义好的配置 `cfg` 、源头 `source` 、爆炸点 `sink` 。当满足 `hasFlow(source, sink)` ，即成功从源头连线到爆炸点时，将这一对完美的漏洞链路直接在屏幕上打印输出！

* * *

## 七、进行微调，处理误报和漏报

研究人员在基于最新 Struts 源码重跑 CodeQL 查询时，发现虽然此前 S2-032、S2-033 和 S2-037 漏洞已被修复，但因使用了新引入的 `OgnlUtil::callMethod()` ，导致代码审计查询工具依然对这些已知漏洞触发了误报。

通过分析发现，新调用的 `callMethod` 实际上套用并封装了 `compileAndExecuteMethod()` 函数，且该底层方法中包含名为 `checkSimpleMethod()` 的防御性额外校验，使得旧的危险 Sink 不再生效。

通过从查询规则中剔除已被“降级”的 `compileAndExecuteMethod` 作为 Sink 点，成功排除了干扰结果，并锁定了一个位于 `DefaultActionInvocation.java` 中 `getActionName()` 调用处的新隐藏漏洞路径。

### 1\. 初步运行：遇到了“噪音”

因为 CodeQL 此时只知道 Source 和 Sink 之间有通路，但它不知道官方其实已经在半路上加了防御。这就叫“噪音（Noise）/ 误报”。

-   **作者的操作**：作者做了一个极其老练的决定——在看全新漏洞（0day）之前，先查清楚为什么老漏洞还会报警。因为如果不把这些老漏洞的干扰排除掉，真正的 0day 就会被埋没在几百条垃圾数据里。

### 2\. 深入官方补丁

作者去对比了新旧版本的 Java 源码。发现以前官方修漏洞只是东补西贴地做字符串过滤（Sanitizing）。但在 S2-037 漏洞之后，官方不耐烦了，决定从架构上改：

他们把以前那一盘散沙、直接触发 RCE 的危险函数 `ognlUtil.getValue()` 统统给去了，换成了看着更安全的全新函数 `ognlUtil.callMethod()` 。

Java 源码：

```java
methodResult = ognlUtil.callMethod(methodName + "()", getStack().getContext(), action);
```

> **代码真相**：就是这一行。官方把老代码里的 `.getValue(...)` 替换成了 `.callMethod(...)` 。

### 3\. 追踪底层源码：抓出假 Sink

“官方换了个函数名，就真的安全了吗？”

于是作者点着 `callMethod` 往里走，去看它的底层实现：

```java
public Object callMethod(final String name, final Map<String, Object> context, final Object root) throws OgnlException {
  return compileAndExecuteMethod(name, context, new OgnlTask<Object>() {
    public Object execute(Object tree) throws OgnlException {
      return Ognl.getValue(tree, context, root);
    }
  });
}
```

> **代码真相**：发现 `callMethod` 进去之后，其实只是个壳子，它在第 2 行立刻就去调用了 `compileAndExecuteMethod(...)` 。这正是作者在上一步里打包定义成 Sink 的那两个底层危险函数之一！

这下破案了！Why CodeQL 还会报警？因为在 CodeQL 眼里，你的数据最终还是流进了 `compileAndExecuteMethod` 。

但官方说这个老漏洞已经修复了呢？作者继续往最底层跟进，点开了 `compileAndExecuteMethod` 的源码：

```java
private <T> Object compileAndExecuteMethod(String expression, Map<String, Object> context, ognlTask<T> task) throws OgnlException {
  Object tree;
  if (enableExpressionCache) {
    tree = expressions.get(expression);
    if (tree == null) {
      tree = Ognl.parseExpression(expression);
      checkSimpleMethod(tree, context); //<--- Additional check.
    }
```

> **代码真相**：秘密就在最后一行的 `checkSimpleMethod(tree, context);`！

官方在真正执行 OGNL 代码之前，在这里强制插进去了一个叫 `checkSimpleMethod` 的安全过滤器（Sanitizer）。这个函数会去检查你传进来的表达式。如果发现里面包含黑客常用的恶意高危命令，比如去拿 `Runtime` 执行系统命令，就会直接在这里把程序掐断并报错。

### 4\. 🛠️ 大佬修改 QL 脚本

既然 `compileAndExecuteMethod` 里面已经被官方死死加上了 `checkSimpleMethod` 安全检查，那么从这一刻起，这个函数已经变成了安全的函数，黑客的恶意 Payload 走到这里就会被拦截，它已经不再能导致 RCE 了。

-   **大佬的操作**：作者回到他的 CodeQL 脚本里，把 `compileAndExecuteMethod()` 从危险 Sink 的名单里无情踢出。

### 5\. 见证奇迹：过滤噪音，逼近 0day

-   **修改后的效果**：改完 QL 脚本并重新运行。果然，之前那些因为 `getMethod()` 引起的旧漏洞误报警告全部消失了，界面干净了。
-   **全篇最刺激的高潮来了**：虽然旧漏洞的误报消失了，但屏幕上依然倔强地剩下了几条残留的警告！
-   **警告指向哪里**：这些残留的警告，指向了一个叫 `DefaultActionInvocation.java` 的核心文件，并且污点入口是 `getActionName()` 。
-   **最绝的**：这些代码明明在官方的说法里也应该是被“修好了”的，而且在人眼看来，根本搞不懂 `getActionName()` 里的参数是怎么七拐八绕，最终躲过官方重重防御，流向那个依然没有保护的 `compileAndExecute()` 真 Sink 的。

* * *

## 八、追链路与排假阳性（Path Hunting & False Positive Filtering）

作者在这里遇到了所有 CodeQL 玩家最头疼的两个问题：链路太长人眼看不清，以及由于 Java 多态特征导致的“理论存在、实际不存在”的工具误报。

### 1\. 搬出可视化武器：嫌代码太长，要“看图走线”

-   不能人眼去翻几百个类吧？
-   **作者的操作**：他把 QL 查询脚本升级为了 `path-problem` 模式。这个模式非常强大，它不仅能告诉你“有没有漏洞”，还能把数据流经过的每一个中间变量节点、每一处函数调用像导航地图一样，一步一步列出来。
-   **工具选择**：作者当时使用了 CodeQL 的图形化工具，现已全面集成至更现代的 VS Code CodeQL 插件的 Path Explorer 面板中，准备顺着地图“走线”。

### 2\. 第一站：脏数据被悄悄拼接

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/64e97302eeff517e.png)

-   **数据流向第 1 步**：点击导航第一步，跳转到了下面这两行代码：

```java
String chainedTo = actionName + nameSeparator + resultCode; 
ActionConfig chainedToConfig = pkg.getActionConfigs().get(chainedTo); 
```

> **代码解密**：黑客控制的 `actionName` 被拼接进了 `chainedTo` 字符串里。紧接着，程序调用了 `pkg.getActionConfigs().get(chainedTo)` ，把受污染的字符串当作 Map 架构的 Key（键）传进了 `.get()` 方法里。

### 3\. 第二站：掉进“多态幻境”

-   **数据流向第 2 步**：作者在工具里点击下一步，CodeQL 导航直接把他带进了一个叫 `ValueStackShadowMap` 类的 `get()` 方法里：

```java
public Object get(Object key) {
  Object value = super.get(key);  // <-- key 带着毒素进来了

  if ((value == null) && key instanceof String) {
    value = valueStack.findValue((String) key);  // <-- 致命盲区：findValue 会把 key 当 OGNL 解析！
  }

  return value;
}
```

> **代码解密（核心危机）**：这一行太惊悚了！这个 `get` 方法在拿不到值时，竟然会调用 `valueStack.findValue((String) key)` 。在 Struts 框架中， `findValue` 也会把字符串丢给 OGNL 引擎执行！

这看起来简直是个完美的漏洞（0day）！但作者在这个地方展现出冷静和严谨：

-   **人眼审计**：作者仔细推敲后发现，CodeQL 之所以把线连到这里，是因为 `pkg.getActionConfigs()` 返回的是一个标准的 Map 接口，而 `ValueStackShadowMap` 恰好实现了 Map 接口。CodeQL 在理论上认为这里可能会发生多态调用。
-   **真相**：但作者去查了这个类的实例化对象。这个类其实属于一个叫 `jasperreports` 的第三方插件，在整个项目的实际运行生命周期里， `pkg.getActionConfigs()` 返回的 Map 实例压根就不是、也绝不可能是这个 `ValueStackShadowMap` 。

### 4\. 编写阻断盾牌（isBarrier 规则去噪）

为了不让这个“看起来很吓人、实际打不通”的假漏洞继续干扰视线，作者必须在 CodeQL 规则里人为地修筑一道堤坝，告诉引擎：

> “以后只要数据流遇到这个类，直接给我斩断，不要再往下追了！”

他在 QL 脚本里重写了 `isBarrier` ，在现代 CodeQL 语法中常叫 `isSanitizer` ，即阻断点 / 净化点：

```plain
override predicate isBarrier(DataFlow::Node node) {
  exists(Method m | (m.hasName("get") or m.hasName("containsKey")) and
    m.getDeclaringType().hasName("ValueStackShadowMap") and
    node.getEnclosingCallable() = m
  )
}
```

> **QL 语法拆解**：如果发现数据流流入的方法 `getEnclosingCallable()` ，其名字叫 `"get"` 或者 `"containsKey"` ，且这两个方法属于 `hasName` 那个惹祸的误报类 `"ValueStackShadowMap"` 。那么，此节点即为阻断墙（Barrier），污点扩散到此为止！

### 5\. 最后的精准收网

-   **收尾动作**：作者随后又依葫芦画瓢，给另一个导致大面积误报的无用函数 `ActionMapping::toString()` 也加上了 Barrier 阻断盾牌。
-   **最终战果**：当他再次按下 Query 运行键时，由于一路上所有的假阳性、多态误报全部被他的 `isBarrier` 给人工拦截了，原本杂乱无章的警告瞬间清空。最后，屏幕上仅仅留下了屈指可数的“个位数”黄金结果（a handful of results）。

* * *

## 九、真正利用漏洞

### 第一阶段：最后的去噪

-   **作者的操作**：经过上一轮过滤，CodeQL 最终在屏幕上吐出了 10 对 Source-Sink（入口到爆炸点）的红绿连线。作者用人眼扫了一眼，发现有些线连到了项目的单元测试代码（Test Case）里，黑客在线上根本访问不到。于是他又写了几个阻断（Barrier）规则把测试代码踢出去。
-   **战果**：垃圾数据彻底清空，余下的全能够致命的黄金 0day 线索。

### 第二阶段：精妙的毒液走线

作者以其中一个结果 `ServletActionRedirectResult.java` 为例，带我们走了一遍震惊安全圈的“毒液传递流程”：

#### 1\. 毒液注入（Source 触发）

```java
public void execute(ActionInvocation invocation) throws Exception {
  // ...
  if (namespace == null) {
    namespace = invocation.getProxy().getNamespace();  // <--- 毒液入口（Source）
  }
```

当程序执行重定向（Redirect）操作时，如果发现开发者在配置文件里没有写死 `namespace` （命名空间），框架就会自作聪明地调用 `invocation.getProxy().getNamespace()` 去取 URL 里的命名空间。黑客通过变形的 URL，成功把恶意 OGNL 代码注入到了 `namespace` 变量里！

#### 2\. 跨类传递（进入构造函数）

```java
String tmpLocation = actionMapper.getUriFromActionMapping(new ActionMapping(actionName, namespace, method, null));
```

紧接着，带有毒素的 `namespace` 变量被当作参数，传进了 `ActionMapping` 对象的构造函数里。随后，这个对象被丢给了 `getUriFromActionMapping` 方法，这个方法用它拼接出了一个新的跳转 URL 字符串，存进了 `tmpLocation` 变量中。

#### 3\. 隐蔽潜伏（存入父类成员变量）

```java
setLocation(tmpLocation);
```

程序调用了 `setLocation()` 。作者点进去看这个函数，发现它极度隐蔽：它把带毒的 `tmpLocation` 字符串，赋值给了父类 `StrutsResultSupport` 的成员变量 `location` 。数据在这里“潜伏”了下来。

#### 4\. 跨域爆发（多态调用唤醒毒素）

```java
super.execute(invocation);
```

代码之后调用了 `super.execute()` ，顺着面向对象的继承链，数据流跨到了另一个执行类 `ServletActionResult` 的 `execute` 方法中：

```java
public void execute(ActionInvocation invocation) throws Exception {
    lastFinalLocation = conditionalParse(location, invocation); // <--- 唤醒潜伏的毒素！
    doExecute(lastFinalLocation, invocation);
}
```

看！这个类的 `execute` 方法一启动，立刻把刚刚潜伏在 `location` 里的脏数据取出来，传给了 `conditionalParse()` 函数！

#### 5\. 轰然爆炸（Sink 触发 RCE）

```java
protected String conditionalParse(String param, ActionInvocation invocation) {
    if (parse && param != null && invocation != null) {
        return TextParseUtil.translateVariables(param, ...); // <--- 终极死穴（Sink）！！
    }
}
```

当数据进入 `conditionalParse` 后，它终于露出了獠牙。它毫不设防地将参数直接传给了底层核心函数 `TextParseUtil.translateVariables()` 。

这个函数在 Struts 里的技术本质就是：直接把传进来的参数放到 OGNL 引擎里强行当作代码执行！

> **道爷我成了！哈哈哈**

### 第三阶段：实战绝杀（弹出计算器）

-   **作者的操作**：为了验证 CodeQL 的正确性，作者在本地测试环境的配置文件中去除了一个 `namespace` 参数，人为模拟了这种疏漏场景。然后，他向本地服务器发送了一个包含了恶意 OGNL 表达式的精心构造的 HTTP 请求，成功弹窗。
-   **扩大战果**：不仅如此，利用这套 CodeQL 规则，作者一口气在 `ActionChainResult` 、 `PostbackResult` 和 `ServletUrlRenderer` 这另外三个核心组件里，用一模一样的原理同时打通了另外 3 个远程代码执行漏洞！一箭四雕！

* * *

## 十、这篇文章的想法值得学习

1.  **漏洞不为孤立的**：挖 0day 最快的方法，就像作者一样，吃透一个历史漏洞的 Source 和 Sink，然后用 CodeQL 扩散到全项目去挖它的“变体”。
2.  **架构原理核心**：黑客想要绕过补丁，靠的不是盲目试探，而像作者一样，点进 `conditionalParse` 和 `translateVariables` 源码里，看清它的每一级多态和对象赋值。

* * *

## 参考与致谢

本文技术灵感来源于 GitHub Security Lab 知名安全研究员 Man Yue Mo 的官方技术博客分享。

-   **原文研究方向**：使用 CodeQL 进行 0day 自动化挖掘与安全审计
-   **国外大佬原文**：GitHub Security Lab Research

* * *

## 版权与声明

本文为笔者的读后感与技术解读。在原文基础上，笔者结合了自身的代码审计经验，对 CodeQL 的核心逻辑、语法规则（QL 语句）以及 0day 挖掘思路进行了更细致的拆解与本地复现，旨在帮助道友们更轻松地理解大佬的整套自动化挖洞框架。

文中部分观点带有笔者个人的主观理解，如有偏差，欢迎各位师傅在评论区拍砖指正！
