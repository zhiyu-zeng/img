---
title: 【看雪】Cocos Creator游戏过加密
source: https://bbs.kanxue.com/thread-292085.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-20T16:50:15+08:00
trace_id: 14b05284-c43b-4200-b556-7c65bd375884
content_hash: 3083ee9bbeecce50259b68aef21cf9b8d18f368a6a8f9082690759ed9c257dfe
status: summarized
tags:
  - 看雪
  - 游戏加密破解
  - Frida
series: null
feed_source: 看雪·Android安全
ai_summary: 通过Hook V8引擎的NewExternalOneByte接口，可破解Cocos Creator游戏的JS代码加密。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3a375244-d011-8143-869c-f9000ad44e39
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过Hook V8引擎的NewExternalOneByte接口，可破解Cocos Creator游戏的JS代码加密。
> 
> - **加密判断：** 解压APK后，在assets目录找到main.js文件，使用xxd命令可查看到加固厂商的标识数据。
> - **V8原理：** V8引擎编译JS源码为字节码后释放源码文本，Hook点在源码被交给V8编译前的NewExternalOneByte函数调用时刻。
> - **Hook策略：** 使用Frida工具，在libcocos.so中定位符号名，必须冷启动以在解密瞬间拦截明文指针和长度。
> - **破解实现：** 编写Frida脚本，通过Interceptor.attach捕获ExternalOneByteStringResource对象，读取并输出JS明文代码。
> - **结果验证：** 成功导出解密后的JS代码，可进一步分析游戏逻辑。

> 最近在看一个Cocos Creator 类型游戏的逻辑时，遇到了游戏界某厂商的加固(到处都是这家的身影，懂的都懂)，看了下应该是免费版，还是比较简单的。

## 1\. 原理

Cocos Creator 是一个游戏引擎。使用 JavaScript/TypeScript 写游戏逻辑，引擎负责渲染、物理、事件。在代码打包时通过选择某加固，就会将main.js加密，在运行时解密交由V8引擎执行。

## 2\. 判断

解压apk后，在assets中找到main.js，这个是游戏运行时的主要代码逻辑文件。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6de32cb534d38051.webp)

通过运行

```bash
xxd apk/extracted/assets/main.js | head-1
```

可以很清晰看到某加固厂商的标识。

```bash
6e 65 74 65 61 73 65
```

## 3\. 分析

### 3.1 V8 引擎是怎么执行JS代码的

V8 执行一段 JS 源码，分三步：

1.  拿到源码字符串（一段文本，比如 "function foo(){...}"）。
    
2.  编译：V8 把源码解析、编译成字节码 bytecode
    
3.  执行字节码
    

第 2 步编译完成后，第 1 步那段"源码文本"就没用了，会被释放掉——V8 只留字节码。所以通过dump内存是不可行（已踩坑）。通过查看V8引擎的源码，发现V8 提供了一个接口来接收"源码文本":

```javascript
v8::String::NewExternalOneByte(Isolate*, ExternalOneByteStringResource* resource)
```

-   Cocos 解密出明文后，不是把它拷进 V8，而是把明文 buffer 的指针包成一个 ExternalOneByteStringResource 对象，通过 NewExternalOneByte 交给 V8。
    
-   在这个函数被调用的一瞬间，参数里就装着"解密后明文的指针 + 长度"。这就是可以Hook的点。
    

### 3.2 需要注意的点

这个点需要在源码"被交给 V8、还没编译"的那一刻拦截。而这一刻发生在启动后 1~2 秒内，所以必须冷启动（让进程挂起启动、先装好钩子再放行）

## 4\. 破解

### 4.1 环境与工具

环境： Ubuntu 22.04

工具： Florida 17.10.1（frida去特征版）

手机：Pixel 6 自编译AOSP 15

### 4.2 找目标函数的符号名

v8 引擎是在 libcocos.so，所以先找到对应的符号名

```bash
readelf -W --dyn-syms libcocos.so | grepNewExternalOneByte
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7feb63452949489d.webp)

### 4.3 HOOK脚本

```python
//输出到 App 私有目录
var OUT ='/data/data/xx.xx.xx/js_all.txt';
var f =null, cnt =0, installed =false;
function openFile(){ if(!f) f =new File(OUT, 'wb'); }
 
function dumpIf(s, tag){
  if(s && s.length > 1200&& (s.indexOf('register')>=0|| s.indexOf('function')>=0|| s.indexOf('exports')>=0)){
    openFile();
    f.write('\n====='+tag +'#'+(cnt++) +' len='+s.length +'=====\n');
    f.write(s); f.flush();
  }
}
 
function exp(mod, name){
  try{ returnProcess.getModuleByName(mod).getExportByName(name); } catch(e){}
  try{ returnModule.getGlobalExportByName(name); } catch(e){}
  returnnull;
}
 
function install(){
  if(installed) returntrue;
  var oneByte =exp('libcocos.so', '_ZN2v86String18NewExternalOneByteEPNS_7IsolateEPNS0_29ExternalOneByteStringResourceE');
  if(!oneByte) returnfalse;                 //库没加载/符号没解析到 → 先返回，等 dlopen 回调再试
 
  Interceptor.attach(oneByte, { onEnter: function(a){
    try{
      //a[1] =第2个参数 =ExternalOneByteStringResource*对象指针
      //该对象内存布局: [+0vtable指针][+8data指针][+16length]
      var res =a[1];
      var dataPtr =res.add(Process.pointerSize).readPointer();        
      var len=res.add(Process.pointerSize*2).readU64().toNumber();
      var s =(len>0&& len<30000000) ? dataPtr.readUtf8String(len) : dataPtr.readCString();
      dumpIf(s, 'EXT1');                        //拿到明文
    } catch(e){}
  }});
  installed =true;
  send('[*] V8 string hook installed');
  returntrue;
}
 
if(!install()){
  var dl =exp('libc.so', 'android_dlopen_ext') || exp('libdl.so', 'android_dlopen_ext');
  if(dl){
    Interceptor.attach(dl, {
      onEnter: function(a){ try{ this.p =a[0].readCString(); } catch(e){} },
      onLeave: function(){ if(this.p && this.p.indexOf('libcocos')>=0){ install(); } }
    });
    send('[*] waiting for libcocos via dlopen');
  } elsesend('[!] no dlopen');
}
```

### 4.4 导出代码

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fe990a860fb6cbd0.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3bec7db91e3ab33b.webp)

至此整个代码已被解密，可分析逻辑。
