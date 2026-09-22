---
title: "Attacking macOS XPC Helpers: Protocol Reverse Engineering | Reverse Society"
source: https://blog.reversesociety.co/blog/2025/how-to-attack-macos-application-xpc-helpers
source_host: blog.reversesociety.co
clip_date: 2026-09-22T10:22:17+08:00
trace_id: e5463c44-9d25-4bce-bdf1-a7b5cb88d674
content_hash: d2b6ff01b3896ffc90fa614225bbcfa7f8c20040fb24a240785b96905c8598f0
status: synced
tags:
  - 协议分析
  - macOS逆向
series: null
feed_source: Reverse Society·iOS/macOS
ai_summary: 逆向 macOS XPC Application 类型 helper 时，筛选存活服务、确认 shouldAcceptNewConnection 放行逻辑，并在 Objective-C 客户端补齐协议类型后即可调用其私有方法。
ai_summary_style: key-points
images_status:
  total: 4
  succeeded: 4
  failed_urls: []
notion_page_id: 3e375244-d011-813f-8c1f-d3acbbdeee21
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 逆向 macOS XPC Application 类型 helper 时，筛选存活服务、确认 shouldAcceptNewConnection 放行逻辑，并在 Objective-C 客户端补齐协议类型后即可调用其私有方法。
> 
> - **筛选存活服务：** Python 脚本在 /System/Library/PrivateFrameworks 递归查找 .xpc，用 `ps aux | grep .../Contents/MacOS` 判断进程存活，读取 Info.plist 中 `XPCService.ServiceType` 为 Application，并用 `codesign -d --entitlements :-` 提取 entitlements。
> - **连接放行判定：** helper 由 `NSXPCListenerDelegate` 的 `shouldAcceptNewConnection` 决定是否接受连接；示例 AppPredictionIntentsHelperService 反汇编中该函数直接 `return 1`，盲目接受所有连接。
> - **从反汇编推断类型：** 由 `createEventIntentWithStartDate:endDate:withReply:` 内的 `setStartDate:`/`setEndDate:` 判定前两参为 `NSDate *`；reply block 收到 INIntent 类对象与一个数值。
> - **客户端脚本流程：** 用 `clang -framework Foundation -o xpc_ping xpc_ping.m` 编译；依次加载私有 framework、以 bundle ID 创建 NSXPCConnection、设置 remoteObjectInterface 与中断/失效处理器、resume，再通过 remoteObjectProxy 调用方法。
> - **类型白名单与私有类：** 首次调用报 4101 错误，Console.app 提示 INIntent 不在允许类中，需用 `setClasses:forSelector:argumentIndex:ofReply:` 补入；另一方法要求 LNStaticDeferredLocalizedString，可查 limneos.net 获知接口后用 NSInvocation 构造实例。

## Context

It’s been a while since I started poking around [Mickey Jin’s research post about Sandbox escapes](https://jhftss.github.io/A-New-Era-of-macOS-Sandbox-Escapes/). It was the first type of vulnerability I experimented with. I’d like to share the mistakes I made and how I overcame them.

In this post, I'll show you how to:

-   Filter existing XPC helpers
-   Check whether a service accepts connections
-   Script an XPC client in Objective-C

In short, this post contains what I wished I had found in Mickey Jin’s original article when I started.

## XPC helpers of type application

This post focuses on connecting to XPC helpers of type Application. These helpers accept requests from other processes, which makes them interesting to attack. For a deeper explanation, see Mickey Jin’s original post.

First, let’s find where these services live. Below I share a Python script that searches common locations for `.xpc` bundles and reports those whose processes are running.

```python
import os
import subprocess
import plistlib
from pathlib import Path

def main():
    print("Lookup XPC Services Application Type (Living Services Only)")
    output_file = "xpc_services_check.txt"
    
    # Clear the output file
    with open(output_file, 'w') as f:
        f.write("")
    
    # Find all .xpc directories
    xpc_path = Path('/System/Library/PrivateFrameworks')
    xpc_services = list(xpc_path.rglob('*.xpc'))
    
    living_services_count = 0
    
    for service in xpc_services:
        plist_path = service / 'Contents' / 'Info.plist'
        
        # First check if the service is alive
        if not check_process_alive(service):
            continue
            
        # If we get here, the service is alive, now check if it's an Application type
        if plist_path.exists() and check_service_type(plist_path):
            living_services_count += 1
            print(f"Found living service: {service}")
            
            with open(output_file, 'a') as f:
                # Write service info
                service_info = f"Service found: {service}\n"
                print(service_info, end='')
                f.write(service_info)
                
                # Get and write bundle ID
                bundle_id = get_bundle_id(plist_path)
                bundle_info = f"  Bundle ID: {bundle_id}\n"
                print(bundle_info, end='')
                f.write(bundle_info)
                
                # Process status (we know it's alive)
                process_status = "  ✅ Process is running\n"
                print(process_status, end='')
                f.write(process_status)
                
                # Get and write entitlements
                entitlements = get_entitlements(service)
                if entitlements == ['None']:
                    entitlements_info = "  Entitlements: None specified\n"
                else:
                    entitlements_info = f"  Entitlements: {', '.join(entitlements)}\n"
                print(entitlements_info, end='')
                f.write(entitlements_info)
                
                # Add blank line
                print()
                f.write("\n")
    
    print(f"\nAnalysis complete. Found {living_services_count} living XPC services.")
    print(f"Output written to {output_file}")


def run_command(cmd):
    """Run a shell command and return its output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ""

def check_service_type(plist_path):
    """Check if the Info.plist contains Application ServiceType."""
    try:
        with open(plist_path, 'rb') as f:
            plist_data = plistlib.load(f)
            service_type = plist_data.get('XPCService', {}).get('ServiceType')
            return service_type == 'Application'
    except Exception:
        return False

def get_bundle_id(plist_path):
    """Get the bundle ID from the Info.plist file."""
    try:
        with open(plist_path, 'rb') as f:
            plist_data = plistlib.load(f)
            return plist_data.get('CFBundleIdentifier', 'Not found')
    except Exception:
        return 'Not found'

def get_entitlements(service_path):
    """Get entitlements for the service."""
    cmd = f'codesign -d --entitlements :- "{service_path}"'
    output = run_command(cmd)
    entitlements = [line for line in output.split('\n') 
                   if 'com.apple.private' in line or 'com.apple.security' in line]
    return entitlements if entitlements else ['None']

def check_process_alive(service_path):
    """Check if the process is running."""
    cmd = f'ps aux | grep "{service_path}/Contents/MacOS" | grep -v grep'
    return bool(run_command(cmd))

if __name__ == "__main__":
    main() 
```

You can tweak the `xpc_path` variable to search for `/System/Library/Frameworks` instead of private frameworks.

The script should print entries that look like this:

```html
Service found: /System/Library/PrivateFrameworks/AppPredictionFoundation.framework/Versions/A/XPCServices/AppPredictionIntentsHelperService.xpc
  Bundle ID: com.apple.proactive.AppPredictionIntentsHelperService
  ✅ Process is running
  Entitlements: <?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.intents.extension.discovery</key><true/><key>com.apple.private.coreservices.canmaplsdatabase</key><true/><key>com.apple.security.exception.files.absolute-path.read-only</key><array><string>/private/var/containers/Bundle/Application/</string><string>/Applications/</string></array><key>com.apple.security.exception.files.home-relative-path.read-only</key><array><string>/Library/Caches/GeoServices/</string></array><key>com.apple.security.exception.mach-lookup.global-name</key><array><string>com.apple.remindd</string><string>com.apple.calaccessd</string></array><key>com.apple.security.exception.shared-preference.read-only</key><array><string>com.apple.GEO</string><string>com.apple.AppSupport</string><string>com.apple.coremedia</string></array><key>com.apple.security.ts.geoservices</key><true/><key>platform-application</key><true/><key>seatbelt-profiles</key><array><string>temporary-sandbox</string></array></dict></plist>
```

Now lets reverse the content of this binary.

## Should this service accept a new connection?

This is the whole question!

Before sending any request to an XPC helper, we must first establish a connection.

On the helper’s side, it decides whether to accept the connection or not. To do this, the helper implements the `NSXPCListenerDelegate` interface, which defines the `shouldAcceptNewConnection` method. This method returns `YES` or `NO` (`true` or `false`) to accept or reject incoming connections.

From a researcher’s point of view, we’re interested in two cases:

-   The method always returns `YES` and accepts any connection blindly.
-   The method contains logic that can be bypassed.

Using `AppPredictionIntentsHelperService` as an example, let’s inspect the implementation of this method in the disassembler.

```python
100000d34    bool -[ServiceDelegate listener:shouldAcceptNewConnection:](struct ServiceDelegate* self, 
100000d34      SEL sel, id listener, id shouldAcceptNewConnection)
100000d34    {
100000d34        id obj = [shouldAcceptNewConnection retain];
100000d78        id obj_1 = [[NSXPCInterface interfaceWithProtocol:
100000d78            &protocol_AppPredictionIntentsHelperServiceProtocol] retain];
1000036f4        [obj setExportedInterface:obj_1];
100000d90        [obj_1 release];
100000d9c        id obj_2 = [AppPredictionIntentsHelperService new];
100003714        [obj setExportedObject:obj_2];
100003534        [obj _setQueue:self->_queue];
100003674        [obj resume];
100000dc8        [obj release];
100000dd0        [obj_2 release];
100000de4        return 1;
100000d34    }
```

> Note: I used the pseudo Objective-C representation of Binary Ninja to have that result.

What do we have here? A basic XPC helper setup. The service defines its protocol and exported object. This object handles the incoming RPC requests.

But the interesting part is located at `100000de4`: the function simply returns `1` (or `true`) so it accepts every incoming connection.

In the real world use case it won't be enough. The next step is to check the interface of `AppPredictionIntentsHelperService` to see if there is something exploitable.

> Note: Keep in mind we won’t exploit anything in this post. We only show how to establish a connection and call XPC methods.

## Reverse XPC interface

For the sake of this practical post, I just picked a method and will try to call it.

```
100002bb0    void -[AppPredictionIntentsHelperService createEventIntentWithStartDate:endDate:withReply:](
100002bb0      struct AppPredictionIntentsHelperService* self, SEL sel, id createEventIntentWithStartDate, 
100002bb0      id endDate, id reply, void* arg)
```

The first step is to deduce types passed to this function.

```objc
100002bec        id start_date = [createEventIntentWithStartDate retain];
100002bf8        id end_date = [endDate retain];
...
100002c38        id event = [[EKEvent eventWithEventStore:event_store] retain];
...
100003734        [event setStartDate:start_date];
1000036d4        [event setEndDate:end_date];
```

> Note: I renamed the two first variables myself for readability

From the disassembly we can deduce that the method accepts two date arguments: `startDate` and `endDate`. The code passes these values to an `EKEvent` instance via `setStartDate:` and `setEndDate:`, so they are `NSDate *` objects.

> For instance, [in the EKEvent documentation](https://developer.apple.com/documentation/eventkit/ekevent/startdate?language=objc) we can read that we have a `NSDate *`.

We still need to know the interface of the third parameter which is a callback (`reply`).

```
100002c9c        id obj = [_INIntentWithTypedIntent(event_intent) retain];
...
100002cdc        reply_cb(reply_cb, obj, 0);
```

The disassembly shows the service building an INIntent like object and then invoking the reply callback with that object and an integer. In other words, the callback receives an INIntent (or similar) and a numeric result.

Putting that together, the interface can be described as:

```objc
@protocol AppPredictionIntentsHelperServiceProtocol
- (void)createEventIntentWithStartDate:(NSDate *)startDate
                               endDate:(NSDate *)endDate
                             withReply:(void (^)(id, id))block;
@end
```

Now let's try to build a script for connecting to this XPC helper.

## The script

To interact with the XPC helper, we’ll follow these steps:

-   Declare a protocol representing the helper’s interface.
-   Load the corresponding framework.
-   Establish an XPC connection to the target service.
-   Invoke the desired method.

My advice is to take it step by step: compile the code and test your binary after each change.

You can compile your script using `clang -framework Foundation -o xpc_ping xpc_ping.m`

You’ll notice that I didn’t use a sandboxed app, even though that’s the main focus of this research. This choice is simply for convenience, as I work primarily in Neovim and prefer to stay out of Xcode whenever possible. Later in this post, I’ll show that this snippet works perfectly fine inside a sandboxed application.

### The AppPredictionIntentsHelperServiceProtocol protocol

The first thing you should know is that you don’t have to reverse each method of the protocol.

You can focus on the methods you want to use for your exploit. Here, I picked two methods that we’ll use for this post.

```objc
@protocol AppPredictionIntentsHelperServiceProtocol
- (void)localizedStringForLinkString:(id)str withReply:(void (^)(id, id))block;
- (void)createEventIntentWithStartDate:(NSDate *)startDate
                               endDate:(NSDate *)endDate
                             withReply:(void (^)(id, id))block;
@end
```

### Load the AppPredictionFoundation Framework

As Mickey said in his blog post, the first step is to load the framework:

```objc
bool ok =
    [[NSBundle bundleWithPath:@"/System/Library/PrivateFrameworks/"
                              @"AppPredictionFoundation.framework/"] load];
NSLog(@"AppPredictionFoundation loaded=%d", ok);
```

### Establish the XPC connection

There’s a bit of boilerplate required to establish the XPC connection:

```objc
// Initialize the XPC connection (bundle ID you found)
NSXPCConnection *conn = [[NSXPCConnection alloc]
    initWithServiceName:
        @"com.apple.proactive.AppPredictionIntentsHelperService"];

// Set the remote interface using the protocol
conn.remoteObjectInterface = [NSXPCInterface
    interfaceWithProtocol:@protocol(
                              AppPredictionIntentsHelperServiceProtocol)];

// Interruption & invalidation handlers (console logging)
[conn setInterruptionHandler:^{
  NSLog(@"Connection was interrupted. The service may have terminated or "
        @"rejected the connection.");
}];
[conn setInvalidationHandler:^{
  NSLog(@"Connection was invalidated. Check Console.app for service logs.");
}];

// Resume connection
[conn resume];
```

We basically:

-   Initialize the `NSXPCConnection` object
-   Declare the remote object interface using our Protocol
-   Set invalidation and interruption handlers
-   Resume the connection

### Call the method

Now we need a proxy object to call the XPC method:

```objc
id proxy = [conn remoteObjectProxyWithErrorHandler:^(NSError *err) {
  NSLog(@"[proxy error] %@", err);
}];
```

Once the proxy is created, we can invoke the desired method on it...

```objc
NSDate *start = [[NSDate alloc] init];
NSDate *end = [NSDate dateWithTimeIntervalSinceNow:3 * 60 * 60];

[proxy
    createEventIntentWithStartDate:start
                            endDate:end
                          withReply:^(id obj, id result) {
                            NSLog(@"[reply] obj=%@ result=%@", obj, result);
                          }];
```

... and run the script:

```
./xpc_ping
2025-10-31 19:37:01.432 apppredict_ping[89398:64224964] AppPredictionFoundation loaded=1
2025-10-31 19:37:01.504 apppredict_ping[89398:64224976] [proxy error] Error Domain=NSCocoaErrorDomain Code=4101 "connection to service with pid 89399 named com.apple.proactive.AppPredictionIntentsHelperService" UserInfo={NSDebugDescription=connection to service with pid 89399 named com.apple.proactive.AppPredictionIntentsHelperService}
```

Now it’s time to open the Console application to see why we got this error.

## Special object type

Open the Console application and enter `AppPredictionIntentsHelperService` in the search bar.

![Console application](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b571928d475fc4ee.png)

By picking the error message (the one with the little red circle), you should see something like:

```javascript
[...]

Exception: value for key '<no key>' was of unexpected class 'INIntent' (0x1f90db5e0) [/System/Library/Frameworks/Intents.framework].
Allowed classes are:
 {(
    "'NSDate' (0x1f8fa5688) [/System/Library/Frameworks/CoreFoundation.framework]",
    "'NSArray' (0x1f8fa5598) [/System/Library/Frameworks/CoreFoundation.framework]",
    "'NSString' (0x1f8fac3b8) [/System/Library/Frameworks/Foundation.framework]",
    "'NSNumber' (0x1f8fabeb8) [/System/Library/Frameworks/Foundation.framework]",
    "'NSDictionary' (0x1f8fa56d8) [/System/Library/Frameworks/CoreFoundation.framework]",
    "'NSData' (0x1f8fa5660) [/System/Library/Frameworks/CoreFoundation.framework]"
)}
[...]
```

Basically, it says the interface contains the `INIntent` class, which is not allowed.

We have to add this class to the list of allowed classes:

```objc
NSSet *allowedClasses = [NSSet
    setWithObjects:[NSDate class], [NSString class], [NSNumber class],
                    [NSDictionary class], [NSArray class], [NSData class],
                    NSClassFromString(@"INIntent"), nil];

[conn.remoteObjectInterface
       setClasses:allowedClasses
      forSelector:@selector(createEventIntentWithStartDate:
                                                    endDate:withReply:)
    argumentIndex:0 // reply block argument 0 (first parameter)
          ofReply:YES];
```

I simply created an `NSSet` with the allowed classed mentioned in the error message and added the `INIntent`.

Now if I run it again:

```html
2025-10-31 21:19:20.194 apppredict_ping[97075:64332158] AppPredictionFoundation loaded=1
2025-10-31 21:19:20.196 apppredict_ping[97075:64332158] done
2025-10-31 21:19:20.245 apppredict_ping[97075:64332172] [reply] obj=<INIntent: 0x6000004b8000> {
    allDay = 0;
    endDate = <INObject: 0x6000023997c0> {
        pronunciationHint = <null>;
        displayString = Sat 1 Nov at 00:19;
        subtitleString = <null>;
        identifier = 783645560.000000#Europe/Paris;
        alternativeSpeakableMatches = (
        );
    };
    startDate = <INObject: 0x600002399740> {
        pronunciationHint = <null>;
        displayString = Fri 31 Oct at 21:19;
        subtitleString = <null>;
        identifier = 783634760.000000#Europe/Paris;
        alternativeSpeakableMatches = (
        );
    };
    locationName = <null>;
    title = ;
    locationAddress = <null>;
    geolocation = <null>;
} result=(null)
```

Bingo! I successfully contacted an XPC service of type Application from a sandboxed application.

> Note: For the sake of this tutorial I used an standalone script. But it will works the same inside a macOS sandboxed application.

![Snippet from Xcode](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/419908413acc86a9.png)

Now, I would like to test the other method from the protocol.

## Interface with other private interfaces

Let's comment how first call and add a new one:

```objc
[proxy localizedStringForLinkString:@"lol"
                          withReply:^(id obj, id result) {
                            NSLog(@"[reply] obj=%@ result=%@", obj, result);
                          }];
```

You’ll notice that I use random parameters here; this is mostly because I ignore the domain for this exercise.

Let's compile and run the script again:

```
2025-10-31 22:38:05.951 apppredict_ping[2028:64381904] AppPredictionFoundation loaded=1
2025-10-31 22:38:05.965 apppredict_ping[2028:64381905] Connection was interrupted. The service may have terminated or rejected the connection.
```

Now our `setInterruptionHandler` is triggered! Let’s inspect the logs again:

```
Exception: value for key '<no key>' was of unexpected class 'NSString' (0x1f8fac3b8) [/System/Library/Frameworks/Foundation.framework].
Allowed classes are:
 {(
    "'LNStaticDeferredLocalizedString' (0x28c7ec9f8) [/System/Library/PrivateFrameworks/LinkMetadata.framework]"
)}
```

In the example above I used an `NSString` literal, but an `LNStaticDeferredLocalizedString` is required here.

But before we can pass it to the function, we should reverse the framework that contains it to understand how to create an instance.

Fortunately, the logs above include a helpful hint: `System/Library/PrivateFrameworks/LinkMetadata.framework.`

### Reverse LinkMetadata framework

Instead of starting an old fashioned reverse approach (like for the previous case), I would like to share with you another approach that has worked for me with private frameworks.

You can check [this website, which lists a ton of private frameworks interfaces](https://developer.limneos.net/index.php).

You can search for `LinkMetadata`, for instance:

![Search for LinkMetadata in limneos website](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d3c9b13e6e042391.png)

But for our use case, I'd rather target the class name:

![Search for LNStaticDeferredLocalizedString in limneos website](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a4ceb0c0440e31d2.png)

If you scroll a bit, you’ll find a bunch of initializers; I’ll take one of them:

```objc
-(id)initWithKey:(id)arg1 table:(id)arg2 bundleURL:(id)arg3 ;
```

The issue here is that every parameter is typed as `id`, which isn’t very informative. We can still look at the class properties to see which ones match the same names:

```objc
@property (nonatomic,copy,readonly) NSString* key;
@property (nonatomic,copy,readonly) NSString* defaultValue;
@property (nonatomic,copy,readonly) NSString* table;
@property (nonatomic,copy,readonly) NSURL* bundleURL;
```

Which leads me to think the real initializer signature could be:

```objc
-(id)initWithKey:(NSString *)arg1 table:(NSString *)arg2 bundleURL:(NSURL *)arg3 ;
```

This is less cumbersome than the technique we used for the first XPC call. Now it’s time to try this initializer.

### Call LNStaticDeferredLocalizedString constructor

Let’s continue with the lazy approach and ask Claude how to call this interface.

```objc
id instance = [NSClassFromString(@"LNStaticDeferredLocalizedString") alloc];
NSInvocation *inv = [NSInvocation
    invocationWithMethodSignature:
        [instance
            methodSignatureForSelector:
                NSSelectorFromString(@"initWithKey:table:bundleURL:")]];

[inv setSelector:NSSelectorFromString(@"initWithKey:table:bundleURL:")];
[inv setTarget:instance];

NSString *k = @"KEY", *t = @"Localizable";
NSURL *u = [NSBundle mainBundle].bundleURL;
[inv setArgument:&k atIndex:2];
[inv setArgument:&t atIndex:3];
[inv setArgument:&u atIndex:4];
[inv invoke];

id result;
[inv getReturnValue:&result];

[proxy localizedStringForLinkString:result
                          withReply:^(id obj, id result) {
                            NSLog(@"[reply] obj=%@ result=%@", obj, result);
                          }];
```

Surprisingly, this is a method I’d never used; I generally use `Class`, `SEL`, and `objc_msgSend`.

Let’s add it to our script, recompile, and run it!

```objc
2025-11-01 18:20:04.140 apppredict_ping[54416:65126968] AppPredictionFoundation loaded=1
2025-11-01 18:20:04.142 apppredict_ping[54416:65126968] done
2025-11-01 18:20:04.152 apppredict_ping[54416:65126981] [reply] obj=KEY result=(null)
```

It worked!

## Wrap up

In this post, I tried to show the methodology I use to reverse-engineer the interface of a private XPC helper. Keep in mind that the big challenge is finding an actual exploitable logic bug.

This is the full script, enjoy!

```objc
#import <Foundation/Foundation.h>
#import <objc/message.h>

@protocol AppPredictionIntentsHelperServiceProtocol
- (void)localizedStringForLinkString:(id)str withReply:(void (^)(id, id))block;
- (void)createEventIntentWithStartDate:(NSDate *)startDate
                               endDate:(NSDate *)endDate
                             withReply:(void (^)(id, id))block;
@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {

    pid_t pid = getpid();
    NSLog(@"PID: %d", pid);

    // load associated framework (as in your template)
    bool ok =
        [[NSBundle bundleWithPath:@"/System/Library/PrivateFrameworks/"
                                  @"AppPredictionFoundation.framework/"] load];
    NSLog(@"AppPredictionFoundation loaded=%d", ok);

    // Initialize the XPC connection (bundle ID you found)
    NSXPCConnection *conn = [[NSXPCConnection alloc]
        initWithServiceName:
            @"com.apple.proactive.AppPredictionIntentsHelperService"];

    // Set the remote interface using the protocol
    conn.remoteObjectInterface = [NSXPCInterface
        interfaceWithProtocol:@protocol(
                                  AppPredictionIntentsHelperServiceProtocol)];

    // Interruption & invalidation handlers (console logging)
    [conn setInterruptionHandler:^{
      NSLog(@"Connection was interrupted. The service may have terminated or "
            @"rejected the connection.");
    }];
    [conn setInvalidationHandler:^{
      NSLog(@"Connection was invalidated. Check Console.app for service logs.");
    }];

    // Resume connection
    [conn resume];

    // Call the simple selector (matches your disassembly: object + block)
    id proxy = [conn remoteObjectProxyWithErrorHandler:^(NSError *err) {
      NSLog(@"[proxy error] %@", err);
    }];

    // First call
    NSSet *allowedClasses = [NSSet
        setWithObjects:[NSDate class], [NSString class], [NSNumber class],
                       [NSDictionary class], [NSArray class], [NSData class],
                       NSClassFromString(@"INIntent"), nil];

    [conn.remoteObjectInterface
           setClasses:allowedClasses
          forSelector:@selector(createEventIntentWithStartDate:
                                                       endDate:withReply:)
        argumentIndex:0 // reply block argument 0 (first parameter)
              ofReply:YES];

    NSDate *start = [[NSDate alloc] init];
    NSDate *end = [NSDate dateWithTimeIntervalSinceNow:3 * 60 * 60];

    [proxy
        createEventIntentWithStartDate:start
                               endDate:end
                             withReply:^(id obj, id result) {
                               NSLog(@"[reply] obj=%@ result=%@", obj, result);
                             }];

    // Second call

    id instance = [NSClassFromString(@"LNStaticDeferredLocalizedString") alloc];
    NSInvocation *inv = [NSInvocation
        invocationWithMethodSignature:
            [instance
                methodSignatureForSelector:
                    NSSelectorFromString(@"initWithKey:table:bundleURL:")]];

    [inv setSelector:NSSelectorFromString(@"initWithKey:table:bundleURL:")];
    [inv setTarget:instance];

    NSString *k = @"KEY", *t = @"Localizable";
    NSURL *u = [NSBundle mainBundle].bundleURL;
    [inv setArgument:&k atIndex:2];
    [inv setArgument:&t atIndex:3];
    [inv setArgument:&u atIndex:4];
    [inv invoke];

    id result;
    [inv getReturnValue:&result];

    [proxy localizedStringForLinkString:result
                              withReply:^(id obj, id result) {
                                NSLog(@"[reply] obj=%@ result=%@", obj, result);
                              }];

    NSLog(@"done");

    // Keep run loop alive to wait for reply
    [[NSRunLoop currentRunLoop] run];
  }
  return 0;
}
```
