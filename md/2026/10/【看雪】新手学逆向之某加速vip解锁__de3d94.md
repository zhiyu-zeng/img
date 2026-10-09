---
title: 【看雪】新手学逆向之某加速vip解锁
source: https://bbs.kanxue.com/thread-292929.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-09T23:53:59+08:00
trace_id: bb439673-d7c1-4873-8547-fbb0203d8456
content_hash: 6f575af6d6611aabe008b7f0c78b8e8cabe9514562cf28c811745a3cb3e9713a
status: synced
tags:
  - 看雪
  - Android逆向
  - Frida
series: null
feed_source: 看雪·Android安全
ai_summary: hook 客户端 LoginInfo 的会员字段只解决一半问题，必须同时改写 Gson 解析结果与 AES 解密后的服务端响应，才能解锁加速 VIP。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 3f475244-d011-816d-9129-e6d8d69a3777
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> hook 客户端 LoginInfo 的会员字段只解决一半问题，必须同时改写 Gson 解析结果与 AES 解密后的服务端响应，才能解锁加速 VIP。
> 
> - **入口定位：** 搜索字符串"立即开通"跳转充值页，再追踪 `getUserType` / `setUserType` 所在的登录信息类。
> - **局部 Hook 失效：** 单独 hook getter/setter 脚本未生效；把 `getEndDate` 改为 2099-12-31 后，首页点加速仍提示"流量不足"。
> - **补字段仍不完整：** 再让 `getTrafficRemain` 返回大流量、`getVipFreeTrial` 返回 0，加速约一分钟后报"会员失效、无法上报流量"，且本地搜不到相关字符串，说明校验数据来自服务端。
> - **突破加密响应：** 网络层抓到 Base64 + AES 密文；hook `javax.crypto.Cipher.doFinal` 拿到解密明文，把 code/status/message/msg 等改写为成功。
> - **最终脚本：** LoginInfo 四个 getter 返回 VIP 值 + `Gson.fromJson` 注入 userType、trafficRemain、trafficTotal、expireDays + Cipher.doFinal 两个重载改写响应明文。

图还是不放了

搜索“立即开通”

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/06c05e0bb7e04668.webp)

追踪getUserType，发现getUserType与setUserType

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f6422e2eec64cc88.webp)

尝试hook setUserType失败了

```javascript
Java.perform(function () {
var LoginInfo = Java.use("--------------------------"); LoginInfo.setUserType.implementation = function (str) {
console.log("[*] setUserType 被调用，原值: " + str);
// 强制改成 vip
this.setUserType("vip");
console.log("[*] 已改为 vip");
};
});
```

尝试hook getUserType，也失败了

```javascript
Java.perform(function () {
var LoginInfo = Java.use("---------------------------");
LoginInfo.getUserType.implementation = function () {
var result = this.getUserType();
console.log("[*] getUserType 被调用，原值: " + result);
// 直接返回 vip
return "vip";
};
});
```

还有一个getEndDate，一并都hook了

```javascript
Java.perform(function () {
var LoginInfo = Java.use("-----------------------------");
// 拦截 getter
LoginInfo.getUserType.implementation = function () {
return "vip";
};
LoginInfo.getEndDate.implementation = function () {
return "2099-12-31";
};
// 可选：拦截 setter，看哪里在改 userType
LoginInfo.setUserType.implementation = function (str) {
console.log("[*] setUserType 被调用: " + str + " → 强制改为 vip");
return this.setUserType("vip");
};
console.log("[✓] VIP Hook 已启动");
});
```

## 改期限后仍提示流量不足

hook到这里，vip期限已经改成2099年，但是首页点加速仍提示流量不足

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7efb02b9cf17e6f6.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7ac15c08583c6edf.webp)

继续搜索“流量不足”

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/50deaaf114d49bba.webp)

查找调用

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c2edd7affba46d88.webp)

```javascript
hook脚本：
Java.perform(function () {
var LoginInfo = Java.use("----------------------------");
LoginInfo.getUserType.implementation = function () {
return "vip";
};
LoginInfo.getEndDate.implementation = function () {
return "2099-12-31";
};
LoginInfo.getTrafficRemain.implementation = function () {
console.log("[*] getTrafficRemain 被调用");
// 返回 1024MB 剩余流量
return 1024.0;
};
LoginInfo.getVipFreeTrial.implementation = function () {
return 0; // 不是免费试用用户，走 VIP 通道
};
console.log("[✓] VIP Hook v2 已启动 (含流量)");
});
```

到这里本来以为一切都改好了，没想到加速了一分钟，还会提示会员失效了，无法上报流量，并且搜不到任何相关字符串，fable5说是因为从服务端返回的

于是我hook网络层得到了结果：

## 抓到加密的服务端响应

\[网络响应\] "zSopDkCriq/j6Wj4nSPmFd83UAtVnRHlMXqal3r8nfIdxrGtTWLOmu01Qoxj0CqJ13YUxDWytOfjzR7O2qeLimf+Enob1j61zUyCoS6Nk/g="

是 Base64 + AES 加密，于是尝试hook AES

最后代码如下：

```javascript
// hook_vip_fix.js
Java.perform(function () {

    // ============================================================
    // 第 1 部分：LoginInfo 类 Hook
    // ============================================================
    var LoginInfo = Java.use("----------------------------");

    LoginInfo["getUserType"].implementation = function () {
        return "vip";
    };
    LoginInfo.getEndDate.implementation = function () {
        return "2099-12-31";
    };
    LoginInfo.getTrafficRemain.implementation = function () {
        return 999999999.0;
    };
    LoginInfo.getVipFreeTrial.implementation = function () {
        return 0;
    };

    console.log("[✓] LoginInfo Hook 已启动");

    // ============================================================
    // 第 2 部分：Gson JSON 注入
    // ============================================================
    try {
        var Gson = Java.use("com.google.gson.Gson");
        Gson.fromJson.overload("java.lang.String", "java.lang.Class").implementation = function (json, clazz) {
            if (json && json.indexOf("userType") >= 0) {
                json = json.replace(/"userType"\s*:\s*"user"/g, '"userType":"vip"');
                json = json.replace(/"trafficRemain"\s*:\s*-?\d+(\.\d+)?/g, '"trafficRemain":999999999.0');
                json = json.replace(/"trafficTotal"\s*:\s*-?\d+(\.\d+)?/g, '"trafficTotal":999999999.0');
                json = json.replace(/"expireDays"\s*:\s*-?\d+/g, '"expireDays":3650');
            }
            return this.fromJson(json, clazz);
        };
        console.log("[✓] Gson JSON 注入已启动");
    } catch (e) {
        console.log("[!] Gson Hook 失败: " + e);
    }

    // ============================================================
    // 第 3 部分：AES 解密层拦截（修复版）
    // ============================================================
    try {
        var Cipher = Java.use("javax.crypto.Cipher");
        var StringClass = Java.use("java.lang.String");
        var Charset = Java.use("java.nio.charset.Charset");
        var UTF_8 = Charset.forName("UTF-8");

        Cipher.doFinal.overload("[B").implementation = function (data) {
            var result = this.doFinal(data);
            var plain = StringClass.$new(result, UTF_8).toString();

            if (plain && plain.indexOf("\"code\"") >= 0 && plain.length < 5000) {
                console.log("[解密响应] " + plain);
                plain = plain.replace(/"code"\s*:\s*-?\d+/g, '"code":0');
                plain = plain.replace(/"status"\s*:\s*-?\d+/g, '"status":0');
                plain = plain.replace(/"message"\s*:\s*"[^"]*"/g, '"message":"success"');
                plain = plain.replace(/"msg"\s*:\s*"[^"]*"/g, '"msg":"success"');
                plain = plain.replace(/"errorMsg"\s*:\s*"[^"]*"/g, '"errorMsg":"success"');
                console.log("[改写为成功] " + plain);

                var modified = StringClass.$new(plain);
                result = modified.getBytes(UTF_8);
            }

            return result;
        };

        Cipher.doFinal.overload("[B", "int", "int").implementation = function (data, offset, len) {
            var result = this.doFinal(data, offset, len);
            var plain = StringClass.$new(result, UTF_8).toString();

            if (plain && plain.indexOf("\"code\"") >= 0 && plain.length < 5000) {
                console.log("[解密响应2] " + plain);
                plain = plain.replace(/"code"\s*:\s*-?\d+/g, '"code":0');
                plain = plain.replace(/"message"\s*:\s*"[^"]*"/g, '"message":"success"');
                plain = plain.replace(/"msg"\s*:\s*"[^"]*"/g, '"msg":"success"');
                console.log("[改写为成功2] " + plain);

                var modified = StringClass.$new(plain);
                result = modified.getBytes(UTF_8);
            }

            return result;
        };

        console.log("[✓] AES 解密层 Hook 已启动（修复版）");
    } catch (e) {
        console.log("[!] AES Hook 失败: " + e);
    }

    console.log("[=========================================]");
    console.log("[✓] 全部 Hook 启动完成 - VIP 修复版");
    console.log("[=========================================]");
});
```

至此，vip功能已解锁

新手啥也不会，参考大佬帖子https://bbs.kanxue.com/thread-266185-1.htm
