---
title: Xposed模块动态作用域
source: https://yuuki.cool/posts/dynamicscope/
source_host: yuuki.cool
clip_date: 2026-08-04T11:25:50+08:00
trace_id: 14dc6caa-a7c4-4815-8df2-8841fc596f43
content_hash: c78d9a783b8c38431e07a694204f9dac64033a7b5a49d4af7375e5c253601b5f
status: synced
tags:
  - Android逆向
  - Hook
series: null
feed_source: Yuuki·移动安全
ai_summary: 使用 Xposed API 100 即可在模块运行时向用户弹出作用域申请，无需提前在系统中静态配置。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-810b-b9e0-c6efa72be876
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 使用 Xposed API 100 即可在模块运行时向用户弹出作用域申请，无需提前在系统中静态配置。
> 
> - **升级至 API 100：** 老版本 API 82 不支持动态作用域，必须迁移到 libxposed 的 API 100 才能通过 `requestScope` 触发申请。
> - **AAR 依赖方式：** 需编译 `xposedApi100`、`xposedService` 及官方示例中的 `interface` 三个 AAR；API 用 `compileOnly`，其余用 `implementation` 引入。
> - **运行时申请流程：** 绑定 `XposedService` 后调用 `mService.requestScope`，传入目标包名并实现 `OnScopeEventListener` 回调，可获知批准、拒绝或失败状态。
> - **模块声明变更：** 在 `META-INF/xposed/` 下放置 `java_init.list`、`module.prop`（声明 minApiVersion=100 等）和 `scope.list`，让 LSPosed 识别为模块。
> - **新旧并存兼容：** 可同时配置 API 82 和 API 100 环境，Hook 逻辑沿用老写法，仅动态作用域部分使用新 API。

## 0x00 前言

最近在做一个小项目，前期的想法是使用xposed进行注入，列出app清单，让用户选择要注入的进程，这里需要勾选才能实现注入(依赖xposed的注入)，所以需要运行时动态申请作用域，但是网上搜了一圈都没找到相关的内容，这里感谢我 `Flash` (Layout Inspect作者，Layout Inspect是很不错的插件，没用过的可以试试)哥给了我解决方案

## 0x01 解决方案

使用 `Xposed Api100` 即可，之前的项目使用的都是Xposed Api82，用的一直没问题，所以一直没换

## 0x02 环境配置

### 0x021 相关库

[xposedApi100](https://github.com/libxposed/api)

[xposedService](https://github.com/libxposed/service)

[modernExample](https://github.com/libxposed/example)

第一个是api，第二个是service，第三个是官方给的例子

### 0x022 使用方法

在使用之前，需要先把上述两个库编译AAR文件，需要 `JDK21` 环境，安装完 `JDK21` 记得去 `设置 -> Gradle -> JDK` 设置成对应版本，然后直接用gradlew命令构建一下即可

上面两个项目会得到三个`.aar` 文件，把他们分别导入到项目里即可，需要注意的是， `xposedApi100` 编译出的aar文件需要用 `compileOnly` 引入，剩余的要用 `implementation` 引入，就像这样

```java
dependencies {
    compileOnly files('libs/api-100.aar') // xposed 100
    implementation files('libs/interface-100.aar') // xposed 100 interface
    implementation files('libs/service-100-1.0.0.aar') // xposed 100 service
}
```

这样之后你就可以使用 `xposedApi100` 啦，我导入api100的目的是为了实现动态申请作用域，这个东西官方给的例子里写的还是比较清除的，直接抄过来就行

```typescript
XposedServiceHelper.registerListener(new XposedServiceHelper.OnServiceListener() {
            @Override
            public void onServiceBind(XposedService service) {
                mService = service;
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "LSPosed服务已连接", Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onServiceDied(XposedService service) {
                mService = null;
                Toast.makeText(MainActivity.this, "服务器断开", Toast.LENGTH_SHORT).show();
            }
        });

if (mService == null) {
                Toast.makeText(this, "LSPosed服务未连接", Toast.LENGTH_SHORT).show();
                return;
            }

            // 请求作用域
            mService.requestScope("com.yuuki.unidbg_test", new XposedService.OnScopeEventListener() {
                @Override
                public void onScopeRequestPrompted(String packageName) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "请求已弹出: " + packageName, Toast.LENGTH_SHORT).show());
                }

                @Override
                public void onScopeRequestApproved(String packageName) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "已批准: " + packageName, Toast.LENGTH_SHORT).show());
                }

                @Override
                public void onScopeRequestDenied(String packageName) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "已拒绝: " + packageName, Toast.LENGTH_SHORT).show());
                }

                @Override
                public void onScopeRequestFailed(String packageName, String message) {
                    runOnUiThread(() -> Toast.makeText(MainActivity.this, "失败: " + message, Toast.LENGTH_SHORT).show());
                }
            });
```

但是如果想让Lsposed管理器知道这个app实际上是个模块，那还是需要做额外的配置的，api100的话，需要我们在项目里创建 `main/resources/META-INF/xposed/` 文件夹，然后在里面常见三个文件

1.  **java_init.list**
    
    相当于原来的 `assets/xposed_init` ，内容是一样的
    
2.  **module.prop**
    
    相当于原本 `AndroidManifest.xml` 里的标签，内容长这样
    
    ```toml
    minApiVersion=100
    targetApiVersion=100
    staticScope=true
    ```
    
3.  **scope.list**
    
    相当于原本的 `res/values/arrays` ，是作用域列表
    

然后配置完就搞定了， `description` 的话，现在改成 `android:description` 标签了，去清单里配置一下就行

这样之后就全部搞定啦~

### 0x023 但是

但是我老版本api用习惯了，所以我只想用新版的api用于动态申请作用域，hook的代码还是想使用老版本(api82)写，那咋办呢？

其实只两个环境 `叠加` 起来就可以了，api82的使用方法网上都有，api100的刚刚说过了，都配置在一起就行了，这样就可以用82的hookApi，还能动态申请作用域了
