---
title: 【微信】逆向来看看SystemHelper干了什么？
source: https://mp.weixin.qq.com/s/OJmkOy2JPFTLruyIc0GSgQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-09T08:50:57+08:00
trace_id: 682083bb-ea20-48c6-821b-c2b818f80390
content_hash: d8e5f737054e48337811f1658f917d9ae7722a25e2d7a1fdc6999b4e5b1078eb
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 19
  succeeded: 19
  failed_urls: []
notion_page_id: 41375244-d011-8153-a72e-e89ecbc9ae40
ioc: null
---

**kali笔记** *2026年11月8日 16:41*

> SystemHelper究竟能干什么，笔者将其从系统中提取出来后通过逆向来刨析它。

### 提取APK

接下来，我们需要将手机中的软件进行提供出来，方便我们进行逆向分析。  
手机打开USB试调后，执行下面命令。

```
adb pull /product/privapp/SystemHelper/SystemHelper.apk ./SystemHelper.apk
```

这样我们便将手机中的SystemHelper提取为APK包。接下来我们进行逆向分析。

### 初步逆向

接下来，我们将APK进行初步的逆向分析。

```
jadx -d /tmp/jadx-out --no-res "/root/my like/11/SystemHelper.apk"
```

查看目录信息

```
ls -laR resources sources
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f5c556e1666ce31.png)

  
文件比较多，进行整理如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/dacd35c6113b31d6.png)

### 采集了哪些敏感数据（字段清单）

`control/DeviceInfo.java` 中定义了相关的字段。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1e1b6ce4a14b5aca.png)

  
大致上定义的字段有

| 采集字段 | 代码常量 | 敏感信息 | 风险  |
| :--- | :--- | :--- | :--- |
| IMEI1/2 | `IMEI1`<br><br>/ `IMEI2` | 设备唯一标识（永久追踪设备） | 高   |
| IMSI1/2 | `IMSI1`<br><br>/ `IMSI2` | 国际移动用户标识（唯一锁定用户） | 高   |
| ICCID1/2 | `ICCID1`<br><br>/ `ICCID2` | SIM 卡序列号 | 高   |
| MSISDN1/2 | `MSISDN1`<br><br>/ `MSISDN2` | **手机号码** | 极高  |
| CellID1/2 + LAC1/2 | `CellID1`<br><br>/ `LAC1` … | **基站定位（可推算用户实时位置）** | 极高  |
| MNC1/2 + NCLS1/2 | `MNC1`<br><br>/ `NCLS1` … | 运营商 + 网络制式 | 中   |
| AppInfo | `AppInfo` | **已安装应用列表+ 使用时长 + 逐应用流量** | 高   |
| Ipv4/Ipv6 | `IPv4`<br><br>/ `IPv6` | 公网 IP | 中   |
| SignalInfo | `SignalInfo` | 信号强度（可辅助定位） | 中   |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ac82d596692e448f.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/044725ceaa180ecf.png)

## 能干什么

### 01 敏感数据的采集

接下来，我们来看看采集代码，位于 `DeviceInfoReaderBase.java`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c2f37b61a15a8bcf.png)

```ruby
// device/DeviceInfoReaderBase.java:238-296void readAndroidR(Context context, DeviceInfo deviceInfo) {    ...    TelephonyManager telephonyManager = (TelephonyManager) context.getSystemService("phone");    deviceInfo.IMEI1 = telephonyManager.getImei(0);          // ← 采集 IMEI（卡1）    deviceInfo.IMEI2 = telephonyManager.getImei(1);          // ← 采集 IMEI（卡2）    int subId = getSubIdBySlotId(0);    TelephonyManager tm = telephonyManager.createForSubscriptionId(subId);    deviceInfo.IMSI1   = tm.getSubscriberId();               // ← 采集 IMSI    deviceInfo.ICCID1  = tm.getSimSerialNumber();            // ← 采集 ICCID（SIM 序列号）    deviceInfo.MSISDN1 = tm.getLine1Number();                // ← 采集手机号码    deviceInfo.MNC1    = tm.getNetworkOperator();            // ← 采集运营商    ...    setCellLoc(context, 0, deviceInfo);                      // ← 采集基站位置}
```

### 02 基站定位采集

```ruby
// device/DeviceInfoReaderBase.java:175-235protected synchronized void setCellLoc(Context context, int i, DeviceInfo deviceInfo) {    ...    ServiceState serviceState = tm.createForSubscriptionId(subId).getServiceState();    for (NetworkRegistrationInfo nri : serviceState.getNetworkRegistrationInfoList()) {        CellIdentity cellIdentity = nri.getCellIdentity();        if (cellIdentity instanceof CellIdentityGsm) {            strValueOf2 = String.valueOf(((CellIdentityGsm) cellIdentity).getCid());  // ← 基站 CellID            strValueOf  = String.valueOf(((CellIdentityGsm) cellIdentity).getLac());  // ← 基站 LAC        } else if (cellIdentity instanceof CellIdentityLte) {            strValueOf2 = String.valueOf(((CellIdentityLte) cellIdentity).getCi());   // ← LTE 基站            strValueOf3 = String.valueOf(((CellIdentityLte) cellIdentity).getTac());        } else if (cellIdentity instanceof CellIdentityCdma) {            // ← 甚至采集 CDMA 基站的经纬度            strValueOf3 = String.format("%d:%d", cellIdentityCdma.getLongitude(), cellIdentityCdma.getLatitude());        } // … CellIdentityWcdma / Tdscdma / Nr 同理    }    deviceInfo.CellID1 = strValueOf2;   // 写入采集结果    deviceInfo.LAC1    = strValueOf3;}
```

针对高通多卡平台，反射调用 `android.telephony.MSimTelephonyManager`

```ruby
// device/PhoneInterfaceReflection.java:11, 70-72, 85-87private static final String MSIMTELEPHONY_Manager = "android.telephony.MSimTelephonyManager"; public String getDeviceId(int i) {    return (String) getMethod(MSIMTELEPHONY_Manager, "getDeviceId", Integer.TYPE)                       .invoke(this.mManager, Integer.valueOf(i));   // ← 反射采集 IMEI}public String getLine1Number(int i) {    return (String) getMethod(MSIMTELEPHONY_Manager, "getLine1Number", Integer.TYPE)                       .invoke(this.mManager, Integer.valueOf(i));   // ← 反射采集手机号}
```

### 03 应用列表 + 使用时长 + 流量采集

位于 `QueryAppInfoThread.java`

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2a8818bd9e8813a9.png)

```ruby
// control/QueryAppInfoThread.java:74-87private List<AppInfo> queryAppUsageStatsDescend() {    List<ApplicationInfo> installedApplications = this.pm.getInstalledApplications(0);  // ← 全部已安装应用    List<UsageStats> list = queryAppUsageStats();                                       // ← 使用统计    ...}// control/QueryAppInfoThread.java:89-97private List<UsageStats> queryAppUsageStats() {    UsageStatsManager usm = (UsageStatsManager) this.mCtx.getSystemService("usagestats");    return new ArrayList(usm.queryAndAggregateUsageStats(start, end).values());  // ← 每个应用前台使用时长}// control/QueryAppInfoThread.java:109appInfo.setRunTime(usageStats.getTotalTimeInForeground() / 60000);  // ← 前台时长（分钟） // control/QueryAppInfoThread.java:114-203 —— 逐应用流量统计NetworkStatsManager nsm = (NetworkStatsManager) getSystemService("netstats");networkStats = nsm.querySummary(0, this.mDeviceInfo.IMSI1, start, end);   // ← 按 IMSI 查询移动数据流量rxBytes += bucket.getRxBytes();   // 每个应用的下行字节txBytes += bucket.getTxBytes();   // 每个应用的上行字节// 分别统计卡1/卡2 移动数据 + WiFi 流量
```

即：该应用能获知「你装了哪些应用、每个应用用了多久、每个应用消耗了多少流量」。

### 04 IP 采集

位于 `GetIPAddressThread.java`

```
// control/GetIPAddressThread.java:50-54Enumeration<NetworkInterface> networkInterfaces = NetworkInterface.getNetworkInterfaces();Enumeration<InetAddress> inetAddresses = networkInterfaces.nextElement().getInetAddresses();InetAddress inetAddress = inetAddresses.nextElement();
```

## 数据上报

### 服务器地址

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/afa9ffd911d4ac6a.png)

  
**匿名化处理**

```
// device/DeviceManager.java:539-552 —— 非联通卡数据做 MD5 匿名化if (deviceInfo.MNC1 != null && !isUnicomNetwork(deviceInfo.MNC1)) {    deviceInfo.ICCID1  = MD5.getMD5Str(deviceInfo.ICCID1);   // 非联通卡 → MD5    deviceInfo.MSISDN1 = MD5.getMD5Str(deviceInfo.MSISDN1);    deviceInfo.IMSI1   = MD5.getMD5Str(deviceInfo.IMSI1);    deviceInfo.CellID1 = MD5.getMD5Str(deviceInfo.CellID1);    deviceInfo.LAC1    = MD5.getMD5Str(deviceInfo.LAC1);}
```

联通卡（MNC 46001/46006/46009）的数据是明文采集上报的；其他运营商卡的数据会被 MD5 匿名化。但 MD5 对手机号/IMSI 这种有限空间（11 位号码 / 固定前缀）仍可被彩虹表反查。

## 厂商适配

内置 60+ 个 `DeviceInfoReader*` ，针对不同手机厂商，通过 **Java 反射（ `Class.forName` + `getMethod` + `invoke` ）** 调用厂商私有/隐藏 API 来采集 IMEI、IMSI、ICCID、手机号、基站位置等。

### 关键代码片段

**(1) MIUI 采集 IMSI/ICCID/手机号**

```sql
// DeviceInfoReaderXiaomi.java:286-303（readQualcomm_QR 内）Class<?> miuiTM = Utils.getClassByName("miui.telephony.TelephonyManager");        // ← MIUI 私有类Object miui = Utils.invokeMethod(Utils.getMethodByName(miuiTM, "getDefault"), null); deviceInfo.IMSI1   = (String) Utils.invokeMethod(    Utils.getMethodByName(miuiTM, "getSubscriberIdForSubscription", Integer.TYPE), miui, subId);  // ← IMSIdeviceInfo.ICCID1  = (String) Utils.invokeMethod(    Utils.getMethodByName(miuiTM, "getSimSerialNumberForSubscription", Integer.TYPE), miui, subId); // ← ICCIDdeviceInfo.MSISDN1 = (String) Utils.invokeMethod(    Utils.getMethodByName(miuiTM, "getLine1NumberForSubscription", Integer.TYPE), miui, subId);   // ← 手机号deviceInfo.MNC1    = (String) Utils.invokeMethod(    Utils.getMethodByName(miuiTM, "getSimOperatorForSubscription", Integer.TYPE), miui, subId);    // ← 运营商
```

**(2)vivo `DeviceInfoReaderVIVO.java`**  
vivo 私有 API 调用链 —— 反射 `getITelephony` → `vivoTelephonyApi` \*\*

```ruby
// DeviceInfoReaderVIVO.java:348-380public HashMap<String, Object> invokeTelephonyApi(Context context, String str, HashMap map) {    TelephonyManager tm = (TelephonyManager) context.getSystemService("phone");    // ① 反射获取隐藏的 getITelephony() 方法，拿到 ITelephony Binder 对象    Method getITelephony = tm.getClass().getDeclaredMethod("getITelephony");    getITelephony.setAccessible(true);                        // ← 绕过可见性限制    Object iTelephony = getITelephony.invoke(tm);     // ② 反射实例化 vivo 私有参数类    Class<?> cls = Class.forName("com.android.internal.telephony.VivoTelephonyApiParams");    Object params = cls.getConstructor(String.class).newInstance(str);   // str = API_TAG_xxx     // ③ 把 slot/phoneId 参数塞进 VivoTelephonyApiParams    Method put = cls.getMethod("put", String.class, Object.class);    put.invoke(params, "slot", 0); ...     // ④ 反射调用 vivo 自定义的 vivoTelephonyApi() 方法    Object result = iTelephony.getClass()        .getMethod("vivoTelephonyApi", cls).invoke(iTelephony, params);     // ⑤ 从返回结果取参数值    return (HashMap) result.getClass().getMethod("getParamValues").invoke(result);}
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f07176a462254e2f.png)

## 总结

他究竟能干什么？将反编译后的源码交给AI进行分析。结论如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/611c54af8089b164.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/70703df9e50a3a48.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d83bdd7216ac9e88.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/bc4c04a575c647ed.png)

更多精彩文章 欢迎关注我们

kali工具 · 目录

作者提示: 个人观点，仅供参考
