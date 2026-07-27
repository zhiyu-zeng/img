---
title: 【看雪】不开无障碍：用Zygisk从目标进程内部直读View树
source: https://bbs.kanxue.com/thread-292185.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-27T14:08:06+08:00
trace_id: aedd5f24-4269-4344-a0a8-927cc0afbd93
content_hash: 8b606f37a7df7482afca0d8e1e972a2805ed36813c203c63362c77d3b785ff8c
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3aa75244-d011-81ff-88e0-f12a4c8eb5d5
ioc: null
---

> 一个已 root 环境下的控件树获取方案：Zygisk 注入目标 App，在其进程内直接遍历原生 View 树，通过一个本地 TCP 端口按需返回当前前台页面的节点信息（文字/坐标/可点击等）。

* * *

最近在搞安卓自动化，遇到了点问题，用无障碍会风控，uiautomator2又太慢，opencv匹配又不能很好适配所有机型，所以在想既然我们有了root权限，为什么不利用起来呢？借助AI，周末在家搓了一套方案...

整个项目做完就三件事： **注入进去、在进程内读 View 树、把数据递出来** 。听起来很简单，但是在实现的时候踩坑不断。。。下面按顺序讲。

* * *

## 1\. 整体架构

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/c3151f1486eb8e98.webp)

两层： **native 注入层** （C++，负责把 dex 塞进目标进程并拉起）和 **agent 采集层** （一份独立编译的 dex，用纯反射读 View 树、开端口对外服务）。native 层几乎不碰业务，业务全在 agent。

* * *

## 2\. 注入侧：Zygisk 怎么把 agent 塞进目标进程

Zygisk 会在每个 App 进程从 zygote fork、specialize 的前后各给你一个回调。我们在这两个回调里完成“判断 + 加载”。

### 2.1 只在目标主进程激活，其余零残留

```cpp
void preAppSpecialize(AppSpecializeArgs *args) override {
    is_target = false;
    std::string nice = /* args->nice_name 转成字符串 */;

    int dir_fd = api->getModuleDir();
    if (dir_fd >= 0) {
        loadConfig(dir_fd);                 // 读 config.prop 里的 package / port
        for (auto &p : targets)
            if (nice == p) { is_target = true; matched = p; break; }
        if (is_target) readDex(dir_fd);     // 关键：dex 必须此刻读进内存，原因见下
    }
    if (!is_target)
        api->setOption(zygisk::DLCLOSE_MODULE_LIBRARY); // 非目标进程立刻卸载，零残留
}
```

只匹配 `nice_name == 包名` 的 **主进程** ， `pkg:xxx` 之类子进程自动跳过。非目标进程直接 `DLCLOSE` ，不给任何检测面。目标包名/端口都从模块目录下的 `config.prop` 运行时读取，改配置不用重编。

### 2.2 一个容易翻车的点：getModuleDir() 的 fd 时效

`getModuleDir()` 返回的目录 fd **只在 specialize 之前有效** ，进程 specialize 之后就被 Zygisk 关掉了。所以 config 和 dex 都必须在 `preAppSpecialize` 里读进内存，绝不能拖到 `postAppSpecialize` 再去 `openat` ——那时候 fd 已经废了（早期我在 post 里读，直接 `getModuleDir failed` ）。

### 2.3 加载 dex：用系统类加载器作父加载器

`postAppSpecialize` 时 ART 已就绪，可以建 `InMemoryDexClassLoader` 加载内存里的 dex。注意此刻宿主 `Application` 还没创建， `ActivityThread.getApplication()` 返回 null，拿不到宿主自己的 ClassLoader。好在我们的 agent 只依赖框架类 + 反射， **用系统类加载器当父加载器即可** ：

```cpp
jobject parent = getSystemClassLoader();        // ClassLoader.getSystemClassLoader()
jobject loader = InMemoryDexClassLoader(byteBuffer, parent);
jclass  agent  = loader.loadClass("com.zygisknode.NodeAgent");
// 调 static start(int port, String pkg)
env->CallStaticVoidMethod(agent, m_start, (jint)port, jpkg);
```

（这里若误用 `-Wl,--strip-all` 也没事： `REGISTER_ZYGISK_MODULE` 导出的入口符号是 default 可见性，strip 不会误删； `--gc-sections` 同理会保留被 dlsym 的导出符号。）

* * *

## 3\. 采集侧：进程内怎么读 View 树

### 3.1 数据源：WindowManagerGlobal.mViews

每个 App 进程都有个 `WindowManagerGlobal` ， `mViews` 里存着当前所有已 attach 的窗口根视图（Activity 的 DecorView、Dialog、PopupWindow 全在里面）。反射取出来即可：

```java
Class<?> wmg = Class.forName("android.view.WindowManagerGlobal");
Object inst  = wmg.getMethod("getInstance").invoke(null);
Field f = wmg.getDeclaredField("mViews");  f.setAccessible(true);
List<View> roots = (List<View>) f.get(inst);   // 高版本是 ArrayList<View>
```

拿到根视图后 DFS 遍历，对每个 `TextView` 取文字、 `getLocationOnScreen` 取屏幕坐标，连同 `isClickable/isEnabled/可见性/资源 id/类名` 一起序列化成 JSON。View 访问必须在主线程，所以实际是 `Handler.post` 到主线程遍历、再把结果取回（带超时防死锁）。

### 3.2 关键细节：只要“当前这一页”

`mViews` 存的是 **所有** 已 attach 的窗口。从 A 页跳到 B 页时，A 的 DecorView 在被销毁前仍赖在列表里。全量 dump 就会把上一页的“幽灵节点”一起带出来——脚本据此判断，极易死循环（这个坑我在实盘里真踩到了：跳到详情页，dump 里还混着首页的 tab 文字）。

解决很轻巧：遍历前只保留 **`view.hasWindowFocus()` 为真** 的那个根视图。被覆盖的旧页面没有窗口焦点，天然被排除；跳到新页面后由新页面持有焦点，就只回新页面。顺带正确处理“页面上弹 Dialog”（焦点在 Dialog 上）：

```java
List<View> use = new ArrayList<>();
for (View r : roots) if (r != null && r.hasWindowFocus()) use.add(r);
if (use.isEmpty()) { /* 兜底：取最后加入的最顶层根视图 */ }
for (View root : use) traverse(root, sb, first, loc);
```

实测：首页 242 个节点（含首页特征词）→ 点进详情页后 155 个节点、首页特征词全部为 0。干净。

* * *

## 4\. 通道选型：数据怎么从目标进程递出来

这里直接说结论吧，最终用的服务端口实现的...中间也想过用各种方式交互，最终都因太笨重放弃了，就不再赘述废弃方案了。

### 4.1 ：TCP loopback 服务端口 —— 通关

agent 在目标进程内 `ServerSocket` 监听 `127.0.0.1:<port>` ，客户端连一次取一帧、断开：

```java
ServerSocket server = new ServerSocket();
server.setReuseAddress(true);
server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port));
while (true) {
    Socket c = server.accept();
    String json = dumpOnMainThread(main);   // 主线程遍历焦点窗口
    c.getOutputStream().write(json.getBytes(UTF_8));
    c.close();
}
```

为什么这条路干净：

-   **不受挂载命名空间影响** ：网络回环是共享的，不像文件系统按 App 隔离。
-   **绕开 unix domain socket 的 SELinux 坑** ：LocalSocket 跨 App 会被 MLS category 的 `connectto` 检查拦（这正是当初把我逼去写文件的原因）；而 **TCP 环回在 `untrusted_app` 之间是标准放行的** ——TCP 不做 peer socket 的 `connectto` 检查。
-   **客户端甚至不需要 root** ：有网络权限的普通 App、或电脑 `adb forward` ，都能直接连。

* * *

## 5\. 用起来

**配置** （ `config.prop` ，刷入后在 `/data/adb/modules/zygisk_nodeinfo/` ）：

```
package=com.android.settings   # 目标包名，多个逗号分隔，只注入主进程
port=28900
```

**构建 & 刷入** ：

```bash
export ANDROID_NDK=... ANDROID_SDK=...
./build.sh                                  # 产物 dist/zygisk_nodeinfo.zip
adb shell su -c 'magisk --install-module /sdcard/Download/zygisk_nodeinfo.zip'
adb reboot
```

**取节点** （电脑侧）：

```bash
adb forward tcp:28900 tcp:28900
python3 examples/dump.py --find 蓝牙
# (132,450)  clk=true  蓝牙
```

**返回 JSON** ：

```json
{
  "activity": "….SettingsHomepageActivity",
  "nodes": [
    { "t": "蓝牙", "id": "…:id/title", "cls": "…TextView",
      "l":132,"tp":420,"r":300,"b":480, "clk":true,"en":true,"vis":true }
  ]
}
```

点击坐标取中心 `((l+r)/2,(tp+b)/2)` ，配合 `input tap` （或你自己的点击实现）即可。

* * *

## 6\. 与常见方案的横向对比（简）

| 方案  | 拿控件树 | 目标可检测 | 需开无障碍 | 实时性 | 需 root |
| --- | --- | --- | --- | --- | --- |
| **Zygisk 直读 View** | ✅ 原生 View 全量 | 难   | 否   | 高   | 是   |
| 无障碍 AccessibilityService | ✅   | 易（可枚举） | 是   | 中   | 否   |
| uiautomator2 (u2) | ✅   | 中   | 否   | 中   | 否   |
| AutoX.js / Auto.js | ✅（底层无障碍） | 易   | 是   | 中   | 否   |
| opencv / OCR | ❌ 仅像素 | 难   | 否   | 低   | 否   |

没 root、要通用，用无障碍或 u2；已 root、想更隐蔽更实时，直读 View 这条路更合适。

* * *

## 7\. 写在最后

链接 https://github.com/TroyeFryant/zygiskNodeInfo
