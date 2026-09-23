---
title: Java Equinox OSGi 应用逆向工程探索
source: https://bin4re.github.io/blog/2025/04/02/java-equinox-osgi-reverse-explorationl/
source_host: bin4re.github.io
clip_date: 2026-09-23T10:48:59+08:00
trace_id: 04884e2e-72b9-44a3-bf3c-d8bd5a4f655e
content_hash: ab758e12410988b3a0a09dac3b369cf486b770e5a76c55e6f42f9ec73c49c494
status: synced
tags: []
series: null
feed_source: bin4re·Android/Windows RE
ai_summary: Java Equinox OSGi 桌面应用的加密 Bundle 未走常规 ClassLoader/agent 解密，而是借助框架自带的 ClassLoaderHook 在类加载时对字节码做 AES 解密。
ai_summary_style: key-points
images_status:
  total: 17
  succeeded: 17
  failed_urls: []
notion_page_id: 3e475244-d011-8184-a948-cbe0f52ce4d1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Java Equinox OSGi 桌面应用的加密 Bundle 未走常规 ClassLoader/agent 解密，而是借助框架自带的 ClassLoaderHook 在类加载时对字节码做 AES 解密。
> 
> - **加密特征：** 核心 jar 包中 class 文件魔数由 CAFEBABE 变为 CAFEBEBA；进程启动参数无 `-javaagent` 或 `-agentlib`，config.ini 中 osgi.bundles 只列框架自身 Bundle。
> - **转储思路：** 先用 jdk11 自带 jhsdb（`jhsdb.exe hsdb` → Tools→Class Browser → Create.class for all classes）转储已加载类，但未加载的缺失，因此需先主动加载目标 Bundle 的全部 class。
> - **注入方案：** 在 config.ini 的 osgi.bundles 中加入自建 Bundle 及启动级别，将 Bundle 放入 plugins 目录；代码中用 `BundleContext.getBundles()` + `getSymbolicName` 定位目标 Bundle，再用 `findEntries("/","*.class",true)` 遍历并 `loadClass`。
> - **开发要点：** Eclipse 需安装 Plug-in Development 组件；依赖其他 Bundle 要先在 Target Platform 添加本地 Bundle 目录，再在 MANIFEST.MF 的 Dependencies 中勾选。
> - **解密现场：** 反编译 ClasspathManager 发现 `org.eclipse.osgi.internal.hookregistry.ClassLoaderHook`，其实现类重写 processClass，判断第三字节是否为 0xBE 后做 AES 解密；该机制由旧版 ClassLoadingHook 迁移而来，文档极少。

前段时间分析一个使用 Equinox OSGi 框架开发的 Java 桌面 win 应用软件，文件数据结构很是庞杂，有着层层的目录，光 plugins files 目录下的 osgi bundle jar 包都有近 500 个。分析时候发现几个核心 jar 包被加密了，可以看到 class 文件魔数由 CAFEBABE 变为了 CAFEBEBA。本想按常规的 Java 应用逆向思路去找 Java agent、native agent 或者是自定义 ClassLoader 动态解密 class 文件，可以说毫无踪迹、一点影子都没有。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/74394d35007f4e70.png)

查看 Java jvm 启动配置文件和进程的启动信息，都没有出现 `-javaagent:xxx.jar` 或者 `-agentlib:xxx` 的字样。又找了很久没有头绪，甚至怀疑是不是软件魔改了 jvm 动态解密了指定的 class 文件，经简单的调试和文件版本、签名信息确认后也排除了。

无奈之下，找不到解密 jar 包和 class 文件的地方，只能退而求其次，尝试从运行的 Java 进程空间转储 class 文件了。转储过程还是很顺利的，jdk11 直接使用自带图形化的 HSDB 工具，但是碰到了一个问题，转储下来的class只是运行已经使用加载到的，没用到的还有很多都没转储下来。

随后我想到了一个方案，可以自己进行注入来实现动态加载目标加密 jar 包的所有 class，再使用 HSDB 工具转储即可。但实践时候发现事情没那么简单，首先要动态加载 class 去执行软件本身的解密过程，就要找到目标 jar 包的类加载器即 ClassLoader，随后我发现 OSGi 框架的类加载方式并不是常见的双亲委派模型，而是一种基于 Bundle 的网状结构灵活加载模型。其次就是注入，该以怎样的形式去注入来实现动态加载呢？

根据这些问题，我进行了一番搜索，发现互联网上关于 Equinox OSGi 应用的逆向资料几乎没有，只有一些开发的文档记录。最后自己进行了一些探索和尝试，实现了通过 OGSi Bundle 注入的方案，来动态加载目标 jar 包所有 class，随后便可通过 HSDB 转储下来，算是间接地获取到了核心加密 jar 的内容。

随后我还不死心，同时也是在好奇心的驱动下，想找到软件应用是怎么没有通过 Java agent、JVMIT agent和自定义 ClassLoader 加载实现的解密，还是说我漏了哪里？最后经过两天枯燥无味、接近阶地毯式对方方面面的搜寻，终于从一次尝试的蛛丝马迹中，找到了这个 Java Equinox OSGi 应用解密 class 的现场，并不意外的是，实现方式也一样和 Equinox OSGi 框架的有关。

这篇文章便是记录下此次艰辛的逆向探索，为互联网这方面逆向几乎没有什么资料的领域，补充一些内容。

## Equinox OSGi 介绍

通过 [官网介绍](https://www.osgi.org/resources/where-to-start/) 和进行相关搜索可以知道 OSGi 是一种模块化开发的框架，旨在解决传统 Java 应用中模块化不足的问题。

OSGi 的基本单元是 Bundle，被打包为 jar 包，但会多一些信息，比如 MANIFEST.MF 文件会定义模块的依赖、导出包和导入包等。分析的这款软件 Bundle 全都在一个 plugin 目录下面，都是.jar 后缀，有很多 Equinox OSGi 框架自己的 Bundle。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5f3b82e9d2f2a580.png)

OSGi 类加载机制方面打破了双亲委派模型的限制，采用了一种更灵活的类加载方式，每个 Bundle 有自己的类加载器，加载其内部的类和资源。Bundle 通过 MANIFEST.MF 文件中的 Import-Package 和 Export-Package 声明依赖和暴露的包。当一个 Bundle 需要某个类时，OSGi 框架会根据依赖关系从其他Bundle中查找并加载，而不是向上委托。解压一个 Bundle 打开 MANIFEST.MF 看一下。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/db413194239c431e.png)

进一步的， [Equinox](https://projects.eclipse.org/projects/eclipse.equinox) 是一个开源的 OSGi 框架实现，最初是为 Eclipse IDE 开发的模块化运行时环境，后来独立出来的，其他还比较流行的 OSGi 框架实现就是 Apache Felix。

## OSGi Bundle 注入

了解 Equinox OSGi 框架的一些知识和基本开发后，前面的如何注入以动态加载所有加密 class 文件便有了一个解决方向，即可以试着注入一个 OSGi Bundle，通过相关接口获取到目标加密 jar 包代表的 Bundle 的类管理器，随后去动态加载所有 class。

注入要怎么实现呢？我在一个 configuration 目录找到了 Equinox OSGi 的 config.ini 配置文件，可以看到有各种配置属性值。

```ruby
# xxxxx config 
eclipse.product=com.xxxxx.xxxxx.product.xxxxx
eclipse.application=com.xxxxx.xxxxx.application.xxxxx
osgi.splashPath=platform\:/base/plugins/com.xxxxx.xxxxx.product
org.eclipse.equinox.simpleconfigurator.configUrl=file\:org.eclipse.equinox.simpleconfigurator/bundles.info
equinox.use.ds=true
osgi.bundles.defaultStartLevel=4
org.eclipse.update.reconcile=false
osgi.bundles=reference\:file\:org.eclipse.equinox.simpleconfigurator_xxx.jar@1\:start,com.xxxxx.xxxxx.systemtexts@4\:start
eclipse.p2.data.area=C:/ProgramData/xxxx-xxx/data/XD_DT/p2
ds.delayed.keepInstances=true
eclipse.p2.profile=DefaultProfile
osgi.framework=file\:///C:/Program Files (x86)/xxxxx-xxx/xxxxx/bin/plugins/org.eclipse.osgi_xxx.jar
osgi.framework.extensions=reference\:file\:///C:/Program Files (x86)/xxxxx-xxx/xxxxx/bin/plugins/org.eclipse.equinox.updateconfigurator_xxx.jar,reference\:file\:///C:/Program Files (x86)/xxxxx-xxx/xxxxx/bin/plugins/org.eclipse.osgi.compatibility.state_1.1.100.xxx.jar
osgi.instance.area=C:/ProgramData/xxxx-xxx/data/XD_DT/instance
osgi.dataAreaRequiresExplicitInit=true
```

搜了一下，在 Eclipse Equinox 网站的 [一篇文档](https://equinox.eclipseprojects.io/articles/Where_Is_My_Bundle.html#eclipse-v33-and-earlier-osgi---configini) 中有介绍 config.ini 配置文件，尤其是 osgi.bundles，告诉我们这个就是启动 Bundle，并可以设置启动级别。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/87a694914b36075e.png)

这样我们便有了一个 OSGi 注入方案，在 config.ini 配置文件的 osgi.bundles 项中添加我们自己的 Bundle 路径，随后放进 plugins 目录，便实现了 OSGi Bundle 注入。

## 开发动态加载 Bundle

接着是 Eclipse 开发动态加载加密 class 的Bundle，经过一番搜索，找到了实现需要的相关 osgi 类和方法。

可以通过 [BundleCntext](https://docs.osgi.org/javadoc/r4v43/core/org/osgi/framework/BundleContext.html) 类的 getBundles 方法来获取所有 Bundle，

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/52f24b8f5a1ecf10.png)

继而通过 [Bundle](https://docs.osgi.org/javadoc/r4v43/core/org/osgi/framework/Bundle.html) 的 getSymbolicName 方法过滤获取目标加密 jar 包所属的 Bundle，最后再通过 findEntries 和 loadClass 方法来获取所有 class 名称并主动加载。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/25e72e62128b3d03.png)

`Activator.java` 代码如下。

```java
package com.my.osgi.bundle;

import java.beans.Beans;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.net.URL;
import java.nio.file.Paths;
import java.util.Enumeration;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;
import org.osgi.framework.FrameworkUtil;


public class Activator implements BundleActivator {

	private static BundleContext context;

	static BundleContext getContext() {
		return context;
	}

	public void start(BundleContext bundleContext) throws Exception {
		Activator.context = bundleContext;
		
	    Bundle[] bundles = bundleContext.getBundles();
	    Bundle targetBundle = null;
	    for (Bundle bundle : bundles) {
	        if (bundle.getSymbolicName().equals("com.xxx.bundle")) {
	            targetBundle = bundle;
	            break;
	        }
	    }
	    
	    if(targetBundle != null ) {
		    Enumeration<URL> entries = targetBundle.findEntries("/", "*.class", true);
		    while (entries.hasMoreElements()) {
		        URL url = entries.nextElement();
		        if (url.getPath().endsWith(".class")) {
		            String className = url.getPath().replace("/", ".").replace(".class", "");
		            while (className.startsWith(".")) {
		            	className = className.substring(1);
		            }
		            targetBundle.loadClass(className);
		        }
		    }
	    }
	}
	
	public void stop(BundleContext bundleContext) throws Exception {
		Activator.context = null;
	}
}

```

我在 Equinox OSGi Bundle 项目的创建过程，和后续利用中需要添加依赖的本地 Bundle 过程踩了一些坑，也一同分享下。

下载了 Eclipse 后要检查支不支持 Plug-in Development 项目类型，如果不支持的话，点击 Help->Install new software，选中 download.eclipse.org/eclipse/updates/latest，接着安装 Plug-in Development 相关组件即可，下载最好配置下代理。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b520a44f8c5f0720.png)

创建 OSGi Bundle 项目后，如果需要添加依赖 jar 调用别的 Bundle 中方法的话，首先需要打开 windows->preferences->Plug-in Development->Target Platform，随后编辑 Running Platform，可以添加一个本地的依赖 Bundles 文件夹。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f5f726f46c093ab7.png)

还没结束，再点击 OSGi Bundle项目的 MANIFEST.MF 文件，出现界面后再点击 Dependencies 就可以选择刚刚添加的 Bundle 的添加为依赖了，如果没有之前的步骤则会找不到。

## HSDB 转储加密 class

我们注入了动态加载加密 class 的 Bundle 后，转储 class 操作就容易得多了。比如 jdk11 版本，找到其 bin 目录下的 jhsdb.exe，执行 `jhsdb.exe hsdb` 便可进入图形化操作，输入附加目标 Java 进程号，点击 Tools->Class Browser，过滤相关类名后点击 Crete.class for all classes，即可转储出来所有过滤的 class，这样我们就获得了软件应用几个核心加密 Bundle 中的 class 文件内容，打包下用 jadx 即可分析。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b02ed6415f2e02f.png)

## Java Hook 尝试

虽然能成功获取到加密 Bundle 的内容了，但是我还是找到解密的地方，看看是怎么实现的。先后进行了地毯式大量的搜索寻找，不仅是从 jar 文件中找，还有各种可疑的 exe、dll 文件，最后在进行各种方法的 Java Hook 尝试中找到了一些蛛丝马迹。

## Javassit agent

首先我需要确认的是 Bundle jar 包是否可能在被 Bundle 类初始化时候，就已经被一些 dll 原生可执行文件给解密了。简单分析后，我选择使用 javassit 库生成 agent，去 hook 转储 BundleFile 初始化过程中的 File。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6cfe1ea95a874a6a.png)

要 hook 的是一个带有一个参数的构造方法，要写一些文本代码给 javassit 用，试了几次才跑通，这里贴一下 ClassFileTransform 的实现，编译为 jar 包后在 jvm 启动参数加上 `-javaagent:xxx.jar` 即可。

```java
package com.debug;

import java.io.ByteArrayInputStream;
import java.lang.instrument.ClassFileTransformer;
import java.security.ProtectionDomain;
import java.util.logging.Logger;
import javassist.ClassPool;
import javassist.CtClass;
import javassist.CtConstructor;

public class BundleFileTransformer implements ClassFileTransformer {
    static {
        LOGGER = Logger.getLogger(BundleFileTransformer.class.getName());
        try {
            FileHandler fileHandler = new FileHandler("C:/Users/Administrator/Documents/plugins/BundleFileTransformer.log", true);
            fileHandler.setFormatter(new SimpleFormatter());
            LOGGER.addHandler(fileHandler);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined,
                            ProtectionDomain protectionDomain, byte[] classfileBuffer) {

        if (!"org/eclipse/osgi/storage/bundlefile/BundleFile".equals(className)) {
            return classfileBuffer;
        }

        LOGGER.info("Transforming BundleFile class");

        try {
            ClassPool classPool = ClassPool.getDefault();
            CtClass ctClass = classPool.makeClass(new ByteArrayInputStream(classfileBuffer));
            CtConstructor[] constructors = ctClass.getConstructors();

            for (CtConstructor constructor : constructors) {
                CtClass[] parameterTypes = constructor.getParameterTypes();
                if (parameterTypes.length == 1 && parameterTypes[0].getName().equals("java.io.File")) {
                    constructor.insertBefore(
                    "try {" +
                            "    java.io.File sourceFile = $1;" +
                            "    String fileName = sourceFile.getName();" +
                            "    java.util.logging.Logger.getLogger(\"" + BundleFileTransformer.class.getName() + "\").info(" +
                            "        \"bundle: \" + fileName);" +
                                "    if (fileName.contains(\"com.xxxx.xxxx.jar\")) {" +
                                "        java.io.File destDir = new java.io.File(\"C:/Users/Administrator/Documents/plugins/\");" +
                                "        java.io.File destFile = new java.io.File(destDir, fileName);" +
                                "        java.io.InputStream in = new java.io.FileInputStream(sourceFile);" +
                                "        java.io.OutputStream out = new java.io.FileOutputStream(destFile);" +
                                "        byte[] buffer = new byte[1024];" +
                                "        int length;" +
                                "        while ((length = in.read(buffer)) > 0) {" +
                                "            out.write(buffer, 0, length);" +
                                "        }" +
                                "        in.close();" +
                                "        out.close();" +
                                "        java.util.logging.Logger.getLogger(\"" + BundleFileTransformer.class.getName() + "\").info(" +
                                "            \"Saved bundle file to: \" + destFile.getAbsolutePath());" +
                                "    }" +
                            "} catch (java.io.IOException e) {" +
                            "    java.util.logging.Logger.getLogger(\"" + BundleFileTransformer.class.getName() + "\").severe(" +
                            "        \"Error saving bundle file: \" + e.getMessage());" +
                            "}"
                    );
                    break;
                }
            }

            byte[] modifiedClass = ctClass.toBytecode();
            ctClass.detach();
            return modifiedClass;
        } catch (Exception e) {
            LOGGER.severe("Failed to transform BundleFile class: " + e.getMessage());
            return classfileBuffer;
        }
    }
}
```

转储出来初始化使用的核心加密 Bundle 文件，经对比是和本地一致，即没有在初始化之前被别的什么代码给解密。

后面整理了下使用 javassit 生成 Java agent 的 [IDEA 示例模板代码](https://github.com/bin4re/HookEquinoxAgent) ，想尝试下的话可以直接基于这个修改，省去些配置功夫，以前没玩过记得生成 jar 包要通过 Maven 栏->生存期->Package 来编译生成。

## Arthas

后面我又用阿里开源的线上 Java 诊断工具 arthas，进行 hook 尝试，查看一些方法的调用栈，在分析自定义 ClassLoader 动态解密 class 会用到的 defineClass 方法时，看到了一些可疑的类方法。

执行 `stack java.lang.ClassLoader defineClass -n 500` ，其中一条结果如下，有着大量的 class 操作方法链路，但看起来都是 Equinox OSGi 框架的。

```php
ts=2025-03-29 06:21:23.302;thread_name=Work queue 0;id=49;is_daemon=false;priority=5;TCCL=org.eclipse.osgi.internal.framework.ContextFinder@776b83cc
    @org.eclipse.osgi.internal.loader.ModuleClassLoader.defineClass()
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.defineClass(ClasspathManager.java:632)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findClassImpl(ClasspathManager.java:555)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findLocalClassImpl(ClasspathManager.java:514)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findLocalClass(ClasspathManager.java:501)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.findLocalClass(ModuleClassLoader.java:328)
        at org.eclipse.osgi.internal.loader.BundleLoader.findLocalClass(BundleLoader.java:392)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClassInternal(BundleLoader.java:470)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClass(BundleLoader.java:419)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClass(BundleLoader.java:411)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.loadClass(ModuleClassLoader.java:150)
        at java.lang.ClassLoader.loadClass(ClassLoader.java:522)
        at java.lang.ClassLoader.defineClass1(ClassLoader.java:-2)
        at java.lang.ClassLoader.defineClass(ClassLoader.java:1017)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.defineClass(ModuleClassLoader.java:276)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.defineClass(ClasspathManager.java:632)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findClassImpl(ClasspathManager.java:555)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findLocalClassImpl(ClasspathManager.java:514)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findLocalClass(ClasspathManager.java:501)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.findLocalClass(ModuleClassLoader.java:328)
        at org.eclipse.osgi.internal.loader.BundleLoader.findLocalClass(BundleLoader.java:392)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClassInternal(BundleLoader.java:470)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClass(BundleLoader.java:419)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClass(BundleLoader.java:411)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.loadClass(ModuleClassLoader.java:150)
        at java.lang.ClassLoader.loadClass(ClassLoader.java:522)
        at java.lang.ClassLoader.defineClass1(ClassLoader.java:-2)
        at java.lang.ClassLoader.defineClass(ClassLoader.java:1017)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.defineClass(ModuleClassLoader.java:276)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.defineClass(ClasspathManager.java:632)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findClassImpl(ClasspathManager.java:555)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findLocalClassImpl(ClasspathManager.java:514)
        at org.eclipse.osgi.internal.loader.classpath.ClasspathManager.findLocalClass(ClasspathManager.java:501)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.findLocalClass(ModuleClassLoader.java:328)
        at org.eclipse.osgi.internal.loader.BundleLoader.findLocalClass(BundleLoader.java:392)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClassInternal(BundleLoader.java:470)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClass(BundleLoader.java:419)
        at org.eclipse.osgi.internal.loader.BundleLoader.findClass(BundleLoader.java:411)
        at org.eclipse.osgi.internal.loader.ModuleClassLoader.loadClass(ModuleClassLoader.java:150)
        at java.lang.ClassLoader.loadClass(ClassLoader.java:522)
        at org.eclipse.osgi.internal.framework.EquinoxBundle.loadClass(EquinoxBundle.java:609)
		...
```

## Equinox ClassloaderHook 机制

## 解密现场

由于在进行的地毯式搜寻，当然不会放过这些可疑的类，哪怕是Equinox OSGi 框架的库代码，我使用 HSDB 把进程中所有 class 文件都给转储下来进行分析，包括各种库代码。

当我使用 jadx 逐一查看，看到 ClasspathManger 的反编译代码时候，眼睛一亮，看到导入代码中有个 `import org.eclipse.osgi.internal.hookregistry.ClassLoaderHook;`，心想 ClassLoaderHook 这名称太可疑了，难不成和这个有关？

直接查看其交叉引用，找到一个类代码有着对其的实现，重写了 processClass 方法，里面是在对字节数组进行 AES 解密，解密前判断了第三个字节是否为 `(-66 & 0xff) => BE` ，在文中开头，我们看到的加密 class 文件的魔术是 CAFEBEBA，第三个字节也是 BE ！

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fde86cce6f0b1e2c.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/23a3d888ef40b733.png)

随后迅速写了份解密代码，使用得到的 key 进行 AES 解密，成功验证这里就是 class 文件的解密现场。

## ClassLoaderHook 机制

尝试对 Equinox OSGi、hookregistry、ClassLoaderHook 和 processClass 等关键字进行搜索，搜索结果少得可怜，基本找不到什么有用的参考。

Eclipse 文档中有对 [Adaptor Hooks](https://wiki.eclipse.org/Adaptor_Hooks) 主题的介绍，其中有部分是 [Class Loading Hook](https://wiki.eclipse.org/Adaptor_Hooks#Class_Loading_Hook) ，简单提到其用于为 bundle 的类加载器添加功能，可实现诸如搜索本地代码、向 bundle 添加类路径条目、创建类加载器以及修改类字节码等能力。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/be7afbc1eab40498.png)

以及在 github 一个 [仓库代码](https://github.com/evolanakis/eclipse-examples/blob/master/org.eclipse.osgi/src/org/eclipse/osgi/baseadaptor/hooks/ClassLoadingHook.java) 中找到了 ClassLoadingHook.java 的代码，

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/efbe4764e9a5c527.png)

但是碰到的并不是 ClassLoaderHook 而是 ClassLoaderHook，在 Eclipse 官方 [代码仓库](https://git.eclipse.org/r/plugins/gitiles/equinox/rt.equinox.framework/+/refs/tags/I20200212-1810/bundles/org.eclipse.osgi/container/src/org/eclipse/osgi/internal/hookregistry/ClassLoaderHook.java) 中也能找到 ClassLoaderHook.java 的实现。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7392e4e4473bc1ee.png)

又经过一番搜索，算是在 Eclipse 社区论坛找的一篇 [帖子](https://www.eclipse.org/forums/index.php/t/828380/) 找到了答案，一个用户提问他使用 Equinox hook (org.eclipse.osgi.baseadaptor.hooks.ClassLoadingHook) 实现了一些功能，但是他通过这篇 [更新公告](https://wiki.eclipse.org/Equinox/Luna_Framework#Redoing_the_Equinox_Framework_Specific_Hooks) 了解到很多 Equinox hook 将不再支持，问怎么办。一个疑似 Equinox 开发人员回复说大多数使用可以新的拓展抽象类 org.eclipse.osgi.internal.hookregistry.ClassLoaderHook 来实现。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e72a9fb2ac794eaa.png)

点击反馈用户给出的更新公告链接，进入网站中可以看到，只是简略地提了下 Equinox 很多类型的 hook 内部实现细节都已更改，需要迁移，并未具体说明…

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc0eb6c54b4b7f81.png)

也就是说 Equinox OSGi 动态解密 class 的方法，由 ClassLoadingHook 更新到 ClassLoaderHook 了，但是由于相关文档资料都过少，搜索引擎命中的结果，很难直接得到这个答案。

## 总结

本文记录了笔者对遇到的一款 Java Equinox OSGi 应用的逆向工程探索，提供了两种获取加密 Bundle 的 class 内容的方案，最终确定这款软件并没有使用常规的 Java Class 解密实现（Java agent、JVMIT agent和自定义 ClassLoader 解密），而是利用了 Equinox OSGi 框架提供的 ClassLoaderHook 机制实现了解密，互联网上相关文章资料很少，这篇文章提供了一个相关的补充参考。
