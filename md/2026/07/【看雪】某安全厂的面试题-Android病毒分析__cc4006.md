---
title: 【看雪】某安全厂的面试题 Android病毒分析
source: https://bbs.kanxue.com/thread-292162.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-25T11:17:21+08:00
trace_id: d1306e48-950f-4c9e-bec2-b8d3c7076f5f
content_hash: a57e09463893132b0d4134f54c3c34c7df75d5deb9723fcb35a736fb18abef16
status: summarized
tags:
  - 看雪
  - Android逆向
  - 恶意样本
series: null
feed_source: 看雪·Android安全
ai_summary: 该样本是一个功能完备的APT级Android恶意软件，集成了密码窃取、虚拟货币盗取和远程控制等多种攻击手段。
ai_summary_style: key-points
images_status:
  total: 89
  succeeded: 89
  failed_urls: []
notion_page_id: 3a875244-d011-8101-96f7-fa8862efc072
ioc:
  cves: []
  cwes: []
  hashes:
    - 49049c73c3aa8722d569a90e4be5742b15c68d526a99b984826a37eee1265a12
    - b409bdef6a255e52d6aa27ad68c938e7c886d1ea35b4cda27d9f8c42c418fe4d
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 该样本是一个功能完备的APT级Android恶意软件，集成了密码窃取、虚拟货币盗取和远程控制等多种攻击手段。
> 
> - **核心攻击功能：** 利用无障碍服务监听并记录锁屏密码/图案，实施PIN码暴力破解；创建虚假界面针对Trust Wallet等钱包及Binance应用进行钓鱼和资产盗取。
> - **隐蔽与持久化：** 通过劫持Context、篡改ActivityThread和Application列表伪装恶意组件；利用窗口拦截阻止用户卸载或修改权限设置，并自动绕过小米、华为、OPPO等厂商的电池优化和权限管理。
> - **通信与反检测：** 使用TCP原始socket与C&C服务器（103.118.247.217:7781）通信，数据经Base64编码；具备反虚拟机/模拟器检测能力。
> - **分析技术：** 静态分析发现其采用DEX自解压和AES加密的SO文件进行保护；动态分析通过定制AOSP系统在`BaseDexClassLoader`插桩完成脱壳，并使用Frida hook关键的字符串解密函数。
> - **恶意行为细节：** 密码信息存储于`/Config/sys/apps/loge/`目录；RAT模块支持远程屏幕截图、设备信息收集和应用卸载。

去年这个时候笔者面试一家安全厂的面试题目（两个字的hh），过了一年了翻出来了拿出来分享一下。技术面是通过了，最后可能是没有缘分吧。比较可惜。希望文章能给正在找工作的一点帮助。(分析报告纯古法0 ai辅助)

## 分析报告

分析人员： \*\*

分析日期： 2025年6月23日

样本来源： \*\*

## 1\. 分析环境

分析工具：GDA,IDA PRO, Jeb Pro

分析设备：谷歌Pixel1

系统版本：Android 8.1

## 2\. 威胁概述

## 2.1. 样本基本信息

样本类型：Android恶意应用程序

主要组成：包含两个DEX文件的复合型恶意软件

威胁等级：高危

## 3\. 核心恶意功能

## 3.1. 屏幕解锁攻击模块

利用无障碍服务监听和记录用户输入的密码、图案

实施PIN码暴力破解攻击

密码信息存储在特定路径（/Config/sys/apps/loge/）

## 3.2. 虚拟货币钓鱼攻击

针对Trust Wallet等数字钱包应用

创建虚假交易界面进行钓鱼

监控BTC、ETH、USDT等主流虚拟货币余额

专门攻击Binance应用，通过恶意覆盖界面窃取用户资产

## 3.3. 远程访问木马（RAT）功能

连接远程控制服务器（103.118.247.217:7781）

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/72886a8d64712b40.webp)

具备屏幕截图、设备信息收集能力

支持远程控制和应用卸载操作

## 3.4. 权限绕过与持久化

针对小米、华为、OPPO等主流厂商进行权限绕过

自动获取无障碍权限和设备管理器权限

实施电池优化绕过，确保后台运行

## 3.5. 反检测与对抗分析

具备反虚拟机/模拟器检测能力

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8edbc7ee52609f1d.webp)

通过窗口拦截阻止用户卸载应用

保护关键服务和权限设置不被用户修改

## 3.6. 通信机制

使用TCP协议进行原始socket通信

采用Base64编码传输敏感信息

建立持久化的C&C通信连接

## 3.7. 总结

这是一个功能完整的高级持续性威胁（APT）样本，集成了密码窃取、虚拟货币盗取、远程控制等多种攻击手段，对用户财产安全和隐私构成严重威胁。

## 4\. 动态行为分析

## 4.1. 静态配置分析

使用GDA工具查看AndroidManifest.xml文件，发现Apk疑似获取如下权限。

|     |     |
| --- | --- |
| android.permission.MODIFY_AUDIO_SETTINGS | 修改音频设置 |
| android.permission.SEND_SMS | 发送短信 |
| android.permission.SET_WALLPAPER | 设置壁纸 |
| android.permission.READ_SMS | 读取短信内容 |
| android.permission.READ_CALL_LOG | 读取通话记录 |
| android.permission.READ_CONTACTS | 读取联系人信息 |
| android.permission.GET_ACCOUNTS | 获取系统账户信息 |
| android.permission.CAMERA | 访问摄像头 |
| android.permission.RECORD_AUDIO | 录制音频 |
| android.permission.ACCESS_COARSE_LOCATION | 获取大概位置信息 |
| android.permission.ACCESS_FINE_LOCATION | 获取精确GPS位置 |
| android.permission.CALL_PHONE | 直接拨打电话 |
| android.permission.DISABLE_KEYGUARD | 禁用锁屏 |
| android.permission.FOREGROUND_SERVICE | 运行前台服务 |
| android.permission.READ_EXTERNAL_STORAGE | 读取外部存储 |
| android.permission.RECEIVE_BOOT_COMPLETED | 开机自启动 |
| android.permission.WRITE_EXTERNAL_STORAGE | 写入外部存储 |
| oppo.permission.OPPO_COMPONENT_SAFE OPPO | 厂商安全组件权限 |
| oplus.permission.OPLUS_COMPONENT_SAFE OPLUS | 厂商安全组件权限 |
| com.huawei.permission.external_app_settings.USE_COMPONENT | 华为外部应用设置组件权限 |
| android.permission.INTERNET | 网络访问权限 |

## 4.2. 执行分析

使用正常软件进行执行分析。

一共启动了两个活动窗口。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c1c703e0374ae25c.webp)

引导用户启动无障碍，疑似模拟触摸影响用户输入。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ddd6bfbca8e5d202.webp)

  
启动后会阻止用户关闭无障碍。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b61e333e258817da.webp)

## 5\. 样本壳分析

## 5.1. Java层分析

### 5.1.1. 加密字符串算法分析

样本使用了字符串加密，来进行其特征，我们需要进行解密。

主要解密函数如下：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/be3f61d36bba7712.webp)

可以看到是一个base64加密，并且进行字符串分割，分割元素是”ǘūď”。函数解密流程图。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f4cc2fc2d310029c.webp)

使用frida进行hook，获取所有字符串解密后结果。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/224845aa1a77a5a9.webp)

部分hook代码：

```python
function hook_m_io(){
Java.perform(()=>{
var cls_j_m = Java.use("j.m");
if(cls_j_m == null){
return;
}
cls_j_m.io.overload("java.lang.String").implementation= function(str:string){
var ret_vaule = this.io(str)
console.log(str,"decode: ",ret_vaule);
return ret_vaule;
}
});
}
```

### 5.1.2. 主活动分析

使用GDA查看AndroidManifest.xml，查看主活动。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/95721b1a5154278a.webp)

在软件中并没有发现n0fon.izxjm.v84jv.MainActivity的主活动类。通过分析m类可以发现：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/11cb59476ff74217.webp)

样本重写了attachBaseContext方法，在执行MainActivity之前运行了部分逻辑

### 5.1.3. attachBaseContext函数分析

Dex自解压行为

样本首先打开文件

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/01d1f130fda73024.webp)

文件名为：

“ZmLEj8eYxavEj3Rrd2pkLmRleMeYxavEj8eWx5bEjw==”:tkwjd.dex

“ZmLEj8eYxavEj3Rrd2pkLmRleMeYxavEj8eWx5bEjw==”:tkwjdd.dex

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/22b1160a1759f071.webp)

路径为：

/data/data/n0fon.izxjm.v84jv/files/

并且判断文件是否存在

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/dc4672233ec7958d.webp)

样本最后执行解压自己的APK

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/01f84b3a02e8df85.webp)

  
并且匹配.tkwjd关键字写入到缓冲区中，并且写入到文件缓冲器。我在apk文件中找到f.tkwjd文件

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f6291e37a4bae717.webp)

解压完成后就会对文件进行解密

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3d18634f08801e35.webp)

解密算法如下：

解密完后就会执行label_30:分支中可以看到样本通过DexClassLoader加载了一个dex，并且加载了里面的类并且调用了方法。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6de0e131c21bbfa1.webp)

最后他会加载dex，执行attachBaseContextEx和setLoadFlag方法。

c.g.attachBaseContextEx分析

根据不同的指令集加载不同的so。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0b125bf5016610b4.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6cc04cc323761980.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/25a5f84f61fcd2c1.webp)

修改文件名

解密so

从文件中解压并且解密

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/b9078ccb82e52f80.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9988d7aabd7566e9.webp)

解密函数

可以发现so被ase进行加密了。

使用python模拟解密算法对本地加密过的so进行解密实际上他是一个zip文件。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/17e540abeb1460ad.webp)

解压出来就是样本本身的so了。

### 5.1.4. J.onCreate函数分析

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a3b5e44074fdb388.webp)

主要是使用反射调用了m.a.onCreateEx，这里写了一个去字符串混淆脚本还原了真实代码。

Context劫持

将Context的外部引用指向恶意Application

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f92bf814702d85a1.webp)

篡改ActivityThread

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/193937a189ee6716.webp)

获取ActivityThread实例（Android应用的主线程管理器），将mInitialApplication字段替换为恶意Application。

Application列表操作

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6e18aaf064e58f9e.webp)

修改系统维护的所有Application列表,这确保系统认为恶意Application是合法的。

LoadedApk包含应用的包信息，将其中的Application引用替换为恶意版本。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/54bd7b4934e5b136.webp)

ApplicationInfo伪装

修改ApplicationInfo中的className，使系统认为恶意Application是应用的正式Application类。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6ea73840f65b79ae.webp)

生命周期接管

调用恶意Application的onCreate

### 5.1.5. g.1内部类分析

这里主要做了一个重打包检测。

拿到ApplicationInfo

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3d44d4f541cdfc98.webp)

通过apk拿到mf文件

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d303ad7968271e87.webp)

获取MANIFEST.MF文件的时间戳

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/7f21d36440d53241.webp)

与原本的硬编码时间戳进行比较，如果不一样就是被篡改过。

### 5.1.6. Java层启动流程

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d11de992079a6a89.webp)

整个apk在java中启动流程就如上图。

## 5.2. Jni层分析

### 5.2.1. native_attach分析

从java层中可以知道java层调用了m.attach函数。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/409bb6c141b9a88e.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/42d7628612c87cf1.webp)

从ida中可以看到上面m.attach函数。

### 5.2.2. sub_15F6C函数分析

创建一个dex准备进行自解密。

Dex加密数据回填

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/68d8fa6aa33fdee7.webp)

### 5.2.3. sub_17194分析

定位apk的位置

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e8278f7b0e169568.webp)

### 5.2.4. sub_17264分析

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3442eefaae56aacb.webp)

进行解密

通过反射Inmemorydexclassloader加载dex

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3a37db3904bf9940.webp)

遍历dexfile，并且存储里面的元素。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0c6cb0a67b285f1d.webp)

最后做了替换，在sub_19064函数中。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6f40d93b938ba379.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8d554c96e8dd5849.webp)

最后返回

## 5.3. 脱壳思路

由于主要使用的是Inmemorydexclassloader加载的dex，所以我们可以在BaseDexClassLoader获取到classload和文件缓冲区。如下图类之间关系。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f24280f1dfd6af66.webp)

这里采用的是定制Aosp进行修改。主要使用Aosp8.1系统，在BaseDexClassLoader构造进行插桩Dump所有dex文件。部分代码：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/14bdc5577335f4ef.webp)

一共Dump如下文件（前缀dump\_是脱壳机添加，后面为源文件名）。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/391aa05b847b359c.webp)

## 6\. 静态行为分析

## 6.1. 主文件分析

由于有多个Dex文件这里使用Python脚本对文件进行甄别。通过Hash比较，文件大小以及文件格式。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1f9fb98f0a58ad73.webp)

发现有两个dex：

b409bdef6a255e52d6aa27ad68c938e7c886d1ea35b4cda27d9f8c42c418fe4d

49049c73c3aa8722d569a90e4be5742b15c68d526a99b984826a37eee1265a12。通过jeb pro观察。

## 6.2. MainActivity类行为分析

反虚拟机/模拟器检测

恶意WebView配置，恶意网站http://dou.gamesrwf.com

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/eada588dab236f65.webp)

恶意隐藏进程 Activity被销毁时启动后台Activity保持存在

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/46fbbf7a8d1d0e62.webp)

## 6.3. ClickUnlock屏幕密码解锁破解模块分析

利用无障碍监听输入密码

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/49a1a433c84b608e.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0d40959fe9b29ee3.webp)

  
记录图案

检测消息完成后保存图案

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/116bfa35bbc3a17a.webp)

保存密码到这个路径下"/Config/sys/apps/loge/pwdss.text"

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bf932b6ce7dfae1a.webp)

利用无障碍模拟破解用户密码

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ec33e3af9158057d.webp)

PIN密码暴力破解

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d80170263806b585.webp)

屏幕唤醒和解锁启动

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/cfe1ab5c48c0ce2b.webp)

## 6.4. 虚拟币钓鱼模块Trust

虚假交易界面，部分代码

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a3003925301e139f.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ec6817a25d7657de.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c4492164dcf74747.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/523e6116be3b9ce5.webp)

钱包名窃取

监控BTC余额

监控etc余额

监控USDT余额

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/53ac28dc6cb846ce.webp)

## 6.5. Binance应用程序转账攻击模块

检测Binance应用攻击触发

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6c065aeb46c5cd28.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/0d085f0565209244.webp)

恶意覆盖界面

最后把数据存放到变量中

## 6.6. 远程访问木马模块

建立与远程控制服务器的连接

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8c0f526919661cf3.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6ab5135a65a7a761.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/79d21f3279f50ade.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/ff0e3594f907fe8d.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e81fcf3b91a03d50.webp)

应用卸载操作

设备信息收集

屏幕截图控制

## 6.7. 远程控制溯源分析

在n0fon.izxjm.v84jv.servziz.initializeService 类中查找到了攻击方的IP地址

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d676ef19367b9250.webp)

使用base64进行解密，可以获得以下信息。

服务器IP地址： 103.118.247.217  
服务器端口： 7781

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/e72c3f437514f4fe.webp)

连接的一些信息

## 6.8. 后台工作服务

主要是位置前台的服务连接

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/9d04e942636f7d8d.webp)

## 6.9. 无障碍服务模块以及远控具体实现

服务器地址以及端口

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bb90f9eb33b470f6.webp)

通过解码IP地址如下:

103.118.247.217:7781

截图底层实现

屏幕内容扫描底层实现

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/141919ab5c344881.webp)

PIN码监控部分代码

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c28d242033d4a006.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/a69316bda884692c.webp)

密码保存

密码存储位置 ：/sdcard/Config/sys/apps/loge/

存储结构：

pwdss.txt # 成功验证的解锁密码

pwdsz.txt # 当前输入的密码

pwd.txt # 备用密码文件

pwdtype.txt # 密码类型标识

log-YYYY-MM-DD.txt # 按日期的活动日志

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/213b158d95bdec17.webp)

应用活动监控

Trust Wallet攻击实现

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/8c3ea437d59f4b14.webp)

## 6.10. 权限绕过

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/6dccbdf231a5c19a.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/fac0e8c71d03c219.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/131dcec390be1b2d.webp)

电池管理系统

小米绕过

华为绕过：

OPPO绕过：

无障碍权限自动获取:

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f752d2c8384dc788.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d720e5151f752b10.webp)

系统静音功能

## 6.11. 窗口拦截 NewUnInstall

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3287c0d674ed2c68.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/42b0317b28c3cbf4.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f3fd01843bba4f24.webp)

阻止用户卸载

通过关键词检测

解码后主要是：自启动管理、权限管理、应用权限、后台活动、电池优化、无障碍服务、设备管理器、系统权限。阻止用户进行设置。

特定权限设置拦截

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/f5df7830a7f42bac.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/371e1ec3fbb8d5fe.webp)

无障碍服务保护

## 6.12. 网络协议分析

主要使用的是原始socket进行通信的，使用的是TCP协议。

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/3f6ddcf131f039ab.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/db39a543d9b634bf.webp)

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/bcb72a94713e5d71.webp)

数据包格式

录制发送

## 总结

希望对你有帮助。如果有啥疑问也可以直接在评论区提出来。文章不限制，觉得还可以的话请帮我点个赞吧。
