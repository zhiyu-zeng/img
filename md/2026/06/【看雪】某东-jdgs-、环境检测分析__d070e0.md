---
title: 【看雪】某东 jdgs 、环境检测分析
source: https://bbs.kanxue.com/thread-291682.htm
source_host: bbs.kanxue.com
clip_date: 2026-06-18T16:31:36+08:00
trace_id: 9ec5ba48-ea0d-4c76-854e-4f3b7e5aaafb
content_hash: 07b98a4a13f297364993051960fb379d3bd238548f9fac106f4aeb4cf6581708
status: summarized
tags:
  - 看雪
series: null
ai_summary: 某东通过三层加密与环境检测构建严格的风控体系，重点验证设备真实性和行为一致性。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 38375244-d011-81ac-8292-f585aeff09ec
---

> 💡 **AI 总结（key-points）**
>
> 某东通过三层加密与环境检测构建严格的风控体系，重点验证设备真实性和行为一致性。
> 
> - **三层加密结构：** 请求参数使用HMAC-SHA256签名；正文经过自定义Base64加密（cipher）；请求头通过jdgs字段进行包含设备指纹的复合签名。
> - **jdgs签名实现：** b4字段是RC4加密的设备指纹，其盐值由时间戳b7与固定常量异或派生；b5/b6签名使用MD5与HMAC-SHA256组合，并通过两个密钥进行逐字节加异或变换，密钥不公开。
> - **环境检测三通道：** jdgs的e2字段仅检测模拟器；JDGuard原生库检测root、Hook框架及模拟器；FireEye SDK进行全面检测（模拟器、Hook、多开、云环境），结果经RSA加密上报。
> - **核心算法保护：** jdgs的关键加密函数（如盐生成、签名终结器）被控制流虚拟化（VM）保护，需要通过动态跟踪、区分内存访问区间并拟合算子关系来逆向分析。

> 写在前面：前后搞了三四天。我知道有人会觉得这玩意儿用得着三四天吗，嗯，用得着，我比较菜，另外，我真的不能拿一篇精华吗，太难了
> 
> 本文只有分析，不提供成品，仅供学习，如有损害厂商利益，请联系我删除 linanxi914@gmail.com

## 三层加密

| 字段  | 位置  | 算法  |
| --- | --- | --- |
| sign | URL 参数 | HMAC‑SHA256(rawStr, secretKey)；rawStr = 被签参数按 key 排序、非空值用 & 拼接 |
| cipher (ciphertype5) | ep / body / J‑E‑C / J‑E‑H | 自定义字母表 base64（无密钥） |
| jdgs (header) | 请求头 | JDGuard Bridge.main(101)：b4=RC4 信封，b5/b6=jdgs\_sign |

## 风控层级

```python
验签(sign/jdgs/cipher)
        │
设备真实性 ── eid(服务端下发) + umid(服务端下发) + 环境检测(三通道)
        │
网络一致性 ── eid ↔ 出口IP 是否对应
        │
行为 ── pin/wskey + 频率 + 行为埋点画像 + 滑块
```

* * *

## jdgs 算法

-   入口：com.jd.security.jdguard.core.Bridge.main(101, Object\[\]{请求, env...}) → native sub\_9223C（RegisterNatives，表 @0x124BD8）。cmd=101 是签名。
-   所有 crypto（MD5/SHA1/SHA256/RC4/AES）都在 native；Java 侧只回调 Bridge.getBizNum（取配置）加 String 拼接。
-   核心函数被控制流虚拟化（VM，堆加密 16 位跳转表）保护，需要去虚拟化

## 1.1 输出结构

```json
{"b1":"<UUID>","b2":"3.4.3_0","b3":"3.0","b4":"<~257B base64>","b5":"<sha256hex>","b7":"<ts ms>","b6":"<sha256hex>"}
```

字段序固定 b1,b2,b3,b4,b5,b7，算完 b6 再追加到末尾。

## 1.2 b1 / b2 / b3（固定常量）

| 字段  | 值   | 来源（实证） |
| --- | --- | --- |
| b1  | 5d716e2b-297d-4507-b5ad-d2b9a629319d | .jdg.xbt 配置文件名 |
| b2  | 3.4.3\_0 | JDGuard 版本 |
| b3  | 3.0 | 协议版本 |

> 换 JDGuard 版本时 b1（= 新.jdg.xbt 名）、b2 会变。

## 1.3 b7（时间戳 + 盐种子）

-   b7 = 签名时刻的毫秒时间戳（字符串）。
-   b7 同时派生 b4 的 RC4 盐，所以 b7 和 b4 内部盐必须一致，不能随便改。

## 1.4 b4（设备指纹加密）

```python
b4 = base64( RC4( zlib.compress(e_json, level=6), salt ) )
```

### 内层 e\_json

```python
{"e1":"<eid>","e2":"<e2设备串>","e3":<毫秒ts数字>,"e5":"<umid>"}
```

字段序严格 e1,e2,e3,e5，无空格，e3是数字。

-   e1 = eid（JDJR biometric 设备 token，服务端下发）
-   e2 = 设备指纹串
-   e3 = 采集毫秒时间戳（早于 b7）
-   e5 = umid（JDGuard cmd105 设备 token）

### zlib

zlib.compress(e\_json, 6)，级别必须是 6。

### RC4 + 盐派生

标准 RC4，key 是 20 字节 salt：

```python
salt[i] = SHA1_CONST[i] ^ LE64(b7)[i % 8]            i = 0..19
SHA1_CONST = 91787d35cec099e0d1e74dd6e4584d248440bf25    (固定 20B)
LE64(b7)   = b7 当 uint64 的小端 8 字节，循环平铺到 20 字节
```

即固定 20 字节 SHA1 常量，逐字节 XOR 上「b7 小端 8 字节」的循环。

### base64（标准）

> b4 是可解密的设备指纹加密。

## 1.5 b5 / b6

```python
jdgs_sign(comm_body):
    md5   = MD5(comm_body)                 # 16B
    msg16 = finalize(md5,  K1p, K2p)       # 16B
    h     = HMAC_SHA256(K, msg16)          # 32B
    return  finalize(h,    K1,  K2).hex()  # 32B → 小写hex
finalize(x, k1, k2)[i] = ((x[i] + k1[i]) & 0xFF) ^ k2[i]    # 逐字节：先模加，再异或
```

-   b5 的 comm\_body 是加密原文 = `"POST /api " + (URL查询参数 ∪ {sign, SHA256(明文body)}) 按 key 排序、每项 key=urlencode(value) 用 & 拼接` 。相当于把整条出站请求（含 sign 和 body 哈希）再签一遍。
-   b6 的 comm\_body 是不含 b6 的 b‑JSON 串 = `{"b1"...,"b7":...}` （字段序 b1..b7，无空格）。相当于对 jdgs 自身签名，防 b1~b5 被改。

5 个固定密钥（b5/b6 共用）：

| 密钥  | 长度  | 值   |
| --- | --- | --- |
| K（HMAC） | 36B | 不能给，见谅 |
| K1p（msg16 ADD） | 16B | 不能给，见谅 |
| K2p（msg16 XOR） | 16B | 不能给，见谅 |
| K1（b5 ADD） | 32B | 不能给，见谅 |
| K2（b5 XOR） | 32B | 不能给，见谅 |

## 1.6 so 层加密

-   SHA‑256 transform sub\_7C3E4
-   AES‑128 引擎 sub\_78AB8
-   字符串解码器 sub\_7E9DC
-   b4 盐在 cmd101 内逐字节算（从 KSA 区段抠出 bufA=SHA1\_CONST、bufB8=b7 小端）。

## 1.7 e2 设备指纹串

| 段   | 方法  | 字段（从左到右） | trace 值 |
| --- | --- | --- | --- |
| 头   | —   | 包名\|签名MD5\|clientVersion | `com.jd....\|6CEA…\|9.2.0` |
| M   | build | BOARD\|…\|DEVICE\|…\|BRAND\|MODEL\|RELEASE\|SDK\_INT\|…\|HARDWARE\|TYPE\|…\|CPU\_ABI | `sdm845\|-\|dipper\|-\|Xiaomi\|MI 8\|10\|29\|…\|qcom\|user\|…\|arm64-v8a` |
| N   | hws | isStorageRemovable\|isGPSAvailable | `0\|1` |
| L   | hwe | CPUSerialNo\|CPUNum\|CPUMaxFreq\|-\|CpuMinFreq\|CpuCurFreq\|MemTotalSize\|MemAvailSize\|RomSize\|Density\|DensityDpi\|…\|DisplayMetrics\|- | `-\|8\|1766400\|…\|1080*2115` |
| K   | eei | SDCardId\|ExternalStorageSize | `-\|118982303744` |
| R   | usra | \-\|-\|fontScale\|- | `-\|-\|1.0\|-` |
| J   | envi | 见 1.8 | `1\|1\|0\|-\|0\|-\|-\|-\|0\|Asia/Shanghai\|zh` |
| Q   | plfm | RomName\|-\|-\|AppFirstInstallTime\|AppLastUpdateTime | `XiaoMi/MIUI/V125\|-\|-\|1781054439552\|1781054439552` |
| P   | lcti | \-\|NetworkOperator\|-\|-\|-\|-\|- | `-\|46001\|…` |

## 1.8 seg8（J=envi）

| 位   | 字段  | BaseInfo API | trace 值 | 含义  |
| --- | --- | --- | --- | --- |
| 1   | nfc | isNFCEnabled | 1   | NFC 开 |
| 2   | blta | isBluetoothAvailabel | 1   | 蓝牙可用 |
| 3   | blte | d.a(ctx) | 0   | 蓝牙扩展 |
| 4   | (固定null) | —   | \-  | \-  |
| 5   | neti | getNetworkTypeInt | 0   | 网络类型枚举 |
| 6,7,8 | (固定null) | —   | \-  | \-  |
| 9   | qemu | isQEmuDriverFile | 0   | e2 里唯一的环境检测位（0=非模拟器） |
| 10  | tmz | timezone | Asia/Shanghai | 时区  |
| 11  | lang | language | zh  | 语言  |

* * *

## 环境检测 & 日志上报字段分析（日志核心是 RSA 加密，只能 hook 拿原始值）

## 2.0 检测信号 + 日志端点

JD 的设备/环境检测分散在三条检测通道，结果经三个日志端点上报。

检测通道：

| #   | 通道  | 载体  | 触发  | 检测内容 |
| --- | --- | --- | --- | --- |
| ①   | jdgs e2(z5.a) | 每请求 jdgs.b4 | 每次签名 | 仅 qemu 一位 |
| ②   | JDGuard libjdg native 重检测 | libjdg.so | 不进签名字段加密 | root/frida/xposed/su/vbox/反调试 |
| ③   | FireEye SDK | activate/eventcollection | 首装一次（我这个样本没触发这条日志） | 106 字段 + 全套环境检测 |

日志端点：

| 端点  | 内容  | 编码  |
| --- | --- | --- |
| `fireactive.jd.com/activate` + `firevent.jd.com/eventcollection` | FireEye 环境判决 + 设备指纹 | `{appkey, head=RSA(AESkey), info=AES(json)}` |
| `saturn.jd.com/log/sdk/v2` | 用户行为埋点(页面/SKU 曝光) | `ModifiedBase64(gzip(json))` |
| `perf-lite.m.jd.com/app_monitor/v3/report` | 性能/调试日志(里面包含签名raw) | `ModifiedBase64(gzip(json))` |

## 2.1 通道 jdgs e2 的环境检测

仅 1 位 `qemu` = `BaseInfo.isQEmuDriverFile()` ，真机为 0。

## 2.2 通道 JDGuard libjdg native 重检测（签名里不含）

-   解码后的部分内容（742 串）：模拟器（ `/sys/qemu_trace` 、 `vboxsf` 、droid4x、nox、androVM、bluestacks）、root（ `/system/xbin/su` 、KingRoot `krdem/ku.sud/ksud` 、360s）、hook（xposed installer、 `com.saurik.substrate` 、 `frida` ）、反调试（ `/proc/self/status` TracerPid、 `/proc/net/tcp[6]` 扫 frida 端口、 `/dev/socket/adbd` 、 `/proc/self/maps` ）。
-   检测函数定位： `sub_AC3BC` 是 root 检测（解码 30 个 su/KingRoot 路径， `BR X8` 尾调逐个 File 检查）；模拟器/Frida/Xposed 同构； `eva.scanner.env.a` 是 GPU/EGL 模拟器检测（在 java 层）。

## 2.3 通道 FireEye 环境检测上报（主报告核心）

> 干净真机 = 所有检测位 0/false。

### 2.3.1 加密

POST body = `{appkey, head, info}` （标准 base64，带 `%0A` 换行）：

-   `appkey` = `d008e027175102a668076e7677d6ccef` （固定）
-   `head` = 128B = RSA‑1024(AES 密钥)（JD 公钥加密，解不开，但可伪造，公钥在 APK 里）
-   `info` = 16 对齐 = AES(明文 JSON)

### 2.3.2 z10 双路径

`rcode` 检测随 `z10` （是否激活）二分（ `com.jd.fireeye.security.fireeye.a.a(ctx,json,z10)` ）：

| z10 | 路径  | emulator/isHooked/isMoreOpen/isCloudEnv |
| --- | --- | --- |
| true | activate | 不检测（置空 / emulator 不写） |
| false 且 eventNumber=="rcodeEvent" | eventcollection | 真检测 |

FireEye 激活后落持久 flag（ `hasActived()` 读 SharedPreferences），后续不再上报，清应用数据可重抓首次 activate。

### 2.3.3 日志上报字段

```json
{
    "unionId": "80....",
    "subunionId": "xiaomi",
    "devicecode": "37ddb776-72d5-4...",
    "sdkverison": "4.5.2",
    "osversion": "10",
    "appversion": "9.2.0",
    "clientos": "android",
    "brand": "Xiaomi",
    "idfa": "",
    "model": "MI 8",
    "currenttime": "2026-06-18 13:43:10",
    "originalsubunionId": "",
    "imei": "",
    "mac": "",
    "imsi": "",
    "imeiAndMeid": "",
    "partner": "xiaomi",
    "networkinfo": "unknown",
    "installtionid": "26420a2dd4ad4a....",
    "androidId": "1805720...",
    "ua": "",
    "oaId": "326526324...",
    "yodaId": "",
    "appInstallTime": 1781054439552,
    "appUpdateTime": 1781054439552,
    "appkey": "d...",
    "gisinfo": "",
    "isFromOpenApp": false,
    "eventUuid": "",
    "smallActiveUuid": "",
    "rcode": {
        "deviceId": "",
        "client": "android",
        "clientVersion": "9.2.0",
        "osVersion": "10",
        "build": "5420",
        "screen": "2115*1080",
        "uuid": "--180572...",
        "androidId": "1805...",
        "openudid": "",
        "networkInfo": "unknown",
        "isQEmuDriverExist": false,
        "isPipeExist": false,
        "tags": "release-keys",
        "board": "sdm845",
        "bootloader": "unknown",
        "device": "",
        "display": "QKQ....",
        "fingerprint": "Xiaomi/d....",
        "hardware": "qcom",
        "sdkLevel": 29,
        "sdCid": "unknow",
        "freeDiskSpace": "107 GB",
        "totalDiskSpace": "119 GB",
        "memSize": "5.90 GB",
        "btMac": "",
        "imei": "",
        "wifiMac": "",
        "imsi": "",
        "imeiAndMeid": "",
        "maxCpuFrequency": "1.8GHz",
        "minCpuFrequency": "0.3GHz",
        "cpuType": "AArch64 Processor rev 13 (aarch64)",
        "carrierName": "中国联通",
        "phoneNumber": "",
        "sensors": "NonUi  Wakeup,0....",
        "ipAddress": "fe80::8c33...",
        "model": "MI 8",
        "mobileCountryCode": "",
        "mobileNetworkCode": "",
        "isoCountryCode": "cn",
        "appBundleIdentifier": "com.jd....",
        "platform": "MI 8",
        "deviceName": "",
        "currentTime": "2026-06-18 13:43:11",
        "serial": "unknown",
        "simSerialNumber": "",
        "physicalCpu": 8,
        "isRoot": false,
        "rootConfirm": 1,
        "rootSuspicious": 0,
        "cpuFrequency": "1.8GHz",
        "imeiPermission": false,
        "oaId": "326526...",
        "vapp": "...",
        "slan": "zh-CN",
        "ulan": "zh-CN",
        "lockAwakeReceiver": "",
        "lach": "com.miui.home",
        "batteryVoltage": 3852,
        "batteryHealth": 2,
        "wifiEnable": true,
        "isHooked": "",
        "isMoreOpen": "",
        "isCloudEnv": "",
        "isDebug": "4",
        "isModifier": "0",
        "isMalicious": "0",
        "ifPad": "0",
        "sensorsList": "10111111011",
        "currentVolume": "10",
        "remainingBatteryLevel": "100",
        "batteryStatus": "3",
        "plugged": "0",
        "processCount": "",
        "processList": "",
        "appCount": "",
        "appList": ""
    },
    "h5Info": ""
}
```

-   顶层（身份）：unionId / subunionId / devicecode(UUID) / installtionid(UUID) / androidId / oaId / model / brand / osversion / appkey / appInstallTime / appUpdateTime / currenttime / gisinfo / isFromOpenApp …
-   rcode（设备指纹）：uuid / screen / build / tags / display / fingerprint / board / hardware / bootloader / sdkLevel / 磁盘&内存 / CPU 频率&型号 / carrierName / sensors（传感器名+厂商+精度）/ ipAddress（全部网卡，含 `tun0` 暴露 VPN）/ btMac / wifiMac / serial / slan / ulan / lach（桌面包名）/ batteryVoltage / vapp（已加载.so 列表，泄露 libAntiCheat/libjdg/libbiometric/libijiami）…
-   rcode（检测）

### 2.3.4 检测字段逐位

root（activate 也查）

| 字段  | 实现  | 逻辑  | 干净值 |
| --- | --- | --- | --- |
| `isRoot` | `b.l.j()` | su 存在于 4 条窄路径： `/system/bin/su` `/system/xbin/su` `/su/bin/su` `/su/xbin/su` | false |
| `rootConfirm` | `b.n.d()` | `a("su")` 查 11 路径（ `/data/local[/bin//xbin]/` `/sbin/` `/su/bin/` `/system/bin[/.ext//failsafe]/` `/system/sd/xbin/` `/system/usr/we-need-root/` `/system/xbin/` ）+su → 1；否则 mount 查 system rw → 9；否则 0 | 0   |
| `rootSuspicious` | `b.n.c()` | rootConfirm≠0 则短路返回 0；否则：装 root 管理 app(16个) → 1；隐藏 root/xposed(7个) → 2； `ro.debuggable=1` 或 `ro.secure=0` → 3 | 0   |

> 我故意用裸环境的机器，rootConfirm=1（检测到 root，su 在窄表外路径），isRoot=false。这俩看着矛盾，但应该只是 isRoot 检测的路径层级太少。

isQEmuDriverExist / isPipeExist（ `CoreInfo.Device` ，受隐私开关门控）

-   `isQEmuDriverExist` = 读 `/proc/tty/drivers` 含 `goldfish` → true。干净 false。
-   `isPipeExist` = `/dev/socket/qemud` 或 `/dev/qemu_pipe` 存在 → true。干净 false。

isDebug `a.d.b.b()` ： `1` = `Debug.isDebuggerConnected()` | `2` = `FLAG_DEBUGGABLE` | `4` = `Settings.Secure.adb_enabled>0` （测试机 = 4，adb 开）

isModifier 改机 `a.d.g.b()` ： `1` = 装改机/框架 app（按包名： `com.topjohnwu.magisk` / `xposed.installer` / `com.yztc.studio.plugin` / `com.dobe.igrimace` …9个）。检测比较弱，改个包名就能 pass。

isMalicious 远控/代理 `a.d.f.b()` ： `1` = 装 `com.redfinger.tw` （红手指）/ `com.sigma_rt.totalcontrol` （远控）/ `io.va.exposed` / 代理类 …9 个。

sensorsList `a.d.j.a()` = `toBinaryString(掩码)` ：accel(t1)=1 | 线性(t10)=2 | 温度(t13)=4 | 重力(t9)=8 | 陀螺(t4)=16 | 光(t5)=32 | 磁(t2)=64 | 压力(t6)=128 | 接近(t8)=256 | 湿度(t12)=512 | 旋转矢量(t11)=1024。模拟器会在这里露馅。

ifPad `a.d.e(ctx).b()` = `d()||c()||a()` ： `d()` 屏≥7" 或 LARGE | `c()` MODEL 在 70+ 平板白名单 | `a()` 蓝牙名含 `平板/Pad/Tab` 。手机 = 0。

emulator（只在 eventcollection 接口上报） `a.d.c.a()` ： `1` abi 含 x86 | `2` abilist 含 x86 | `4` uname 含 i686 | `8` 无摄像头 | `16` 无闪光灯且非平板 | `32` 读不到 `/proc/self/cgroup` | `64` BlueStacks 文件(22路径) | `128` Build 属性(sdk/nox/vbox86/Genymotion/Droid4X/TiantianVM…) | `256` baseband 空且非平板 | `512` cpuinfo 含 intel/amd

isHooked（只在 eventcollection 接口上报） `a.d.d.b()` ： `1` 恒 0 | `2` 异常栈含 Substrate / `XposedBridge.main|handleHookedMethod` / `ZygoteInit` ×2 | `4` `/proc/self/maps` 含 substrate / `XposedBridge.jar` / frida | `8` `Class.forName("...XC_MethodHook")` 成功 | `16` `vxp` 属性存在

isMoreOpen 多开（只在 eventcollection 接口上报） `a.d.i.b()` ： `1` filesDir 路径非标准 | `2` filesDir 含多开包 | `4` maps 含多开包 | `16` LocalServerSocket(包名) 被占 | `32` 包名属 jd 系 | `64` 进程含多开包（ `com.lbe.parallel` / `com.lody.virtual` / `com.qihoo.magic` …8个）

isCloudEnv 云机（只在 eventcollection 接口上报） `a.d.a.a()` ： `1` BOARD=rk30sdk | `2` 包名=longene | `4` `CoreInfo.Device.isRoot()` (18 路径) 且内存>0 且非平板 | `8` 内存<25GB 且装 deskclock | `16` 含 `libTTArtArm.so` 且 BOOTLOADER=cph

## 2.4 日志端点 saturn（行为埋点）字段分析

-   URL： `saturn.jd.com/log/sdk/v2` ； `ModifiedBase64(gzip(json))` （前缀 `R4iSKKKK…` ， `KKKK` = gzip 头全 0 mtime）。
-   顶层： `uid` (uuid) / `aid` (androidId) / `oaid` / `mct` (厂商) / `dvc` (机型) / `osv` / `token` / `scr` / `chf` (渠道) / `ver` / `report_ts` …
-   `data[]` （typ= `ep` 曝光事件）： `pin` / `ela` （JSON：含 `skuid` / `sgid` / `spm` / `page_id` /点击事件）/ `ctm` / `lat` / `lon` / `eid` （事件名如 `DiseaseMedicine_Home_PromotipSKUExpo` ）/ `page_id` …
-   用途：收集用户真实看了哪些页面、曝光了哪些 SKU。

## 2.5 日志端点 perf‑lite（性能/调试）字段分析

-   URL： `perf-lite.m.jd.com/app_monitor/v3/report` ；同样是 `ModifiedBase64(gzip(json))` 。
-   顶层： `appId=20` / `accountId` (=pin) / `machineCode` (uuid) / `machineType` / `token` / `curStrategyId` / `launchId` / `d_brand` / `screen` …
-   `data[]` ： `logTag` / `className` / `logMsg` / `currentPage` / `occurTime` …；logTag 含 `GatewaySignatureHelper` 、 `JDReactNetworkWithSign` 、 `HttpGroupAdapter` 。
-   用途：实时收集设备发了哪些 API、什么参数、什么顺序。

> 这部分用来做后台行为画像，专门治只发一个详情或搜索请求的垃圾手法。

## 2.6 设备 token（eid / umid）

-   eid： `LogoManager.getLogo()` → `BiometricManager.getCacheTokenByBizId()` → `com.jdjr.risk.biometric.core.a` ：采集设备 Bundle → `LorasHttpCallback` 向服务端注册 → 服务端下发 token，本地缓存。服务端记录 eid ↔ 设备指纹 ↔ 注册网络/行为。
-   umid（e5）： `com.jd.security.jdguard.eva.Umid` via `Bridge.main(105)` ；服务端 `data.umt` 下发（REMOTE）或本地 UUID；60 天有效（ `umidTimeOut` 可配）。

* * *

## 过 ollvm 思路

JDGuard 核心 crypto（终化器 `sub_E3B9C` 、msg16 产出、salt producer）被控制流虚拟化（堆加密 16 位跳转表 + XOR 密钥）保护，静态反混淆失效。破法：

1.  拿完整 in‑place trace（哈希/MAC 的控制流与数据无关，一条 trace 就能走完整算法）。
2.  地址区间分离：VM 派发碰堆表（ `0x7758bbxx` / `0xb4xx` ），真实算法碰数据缓冲（栈区），按此过滤 mem 读写，分离信号与噪声。
3.  按输出字节分组抓 `(init,k1,k2,结果)` 元组，拟合 `out[i]=((init[i]+k1[i])&0xff)^k2[i]` 。
4.  逐层回溯：init==HMAC → msg16 init==MD5 → 根 = MD5(comm\_body)。

[#VM保护](https://bbs.kanxue.com/forum-4-1-4.htm) [#调试逆向](https://bbs.kanxue.com/forum-4-1-1.htm) [#加密算法](https://bbs.kanxue.com/forum-4-1-5.htm)
