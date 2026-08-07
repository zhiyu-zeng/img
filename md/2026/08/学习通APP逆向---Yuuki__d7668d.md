---
title: 学习通APP逆向 - Yuuki
source: https://yuuki.cool/posts/xvexitong/
source_host: yuuki.cool
clip_date: 2026-08-07T19:11:47+08:00
trace_id: 50105e35-be51-4b6a-9a59-eae757781a2c
content_hash: 9d7d180540c43e723f8f7602d5ad077484b7331aedc168485e0f7260d0379774
status: synced
tags:
  - Android逆向
  - Frida
series: null
feed_source: null
ai_summary: 逆向学习通验证码/登录/刷课参数：enc和inf_enc为MD5，logininfo为AES/ECB+Base64，cxcid为RSA+Base64，全部可用Python复现。
ai_summary_style: key-points
images_status:
  total: 30
  succeeded: 30
  failed_urls: []
notion_page_id: 3b575244-d011-8135-b29c-fbd0930eefda
ioc:
  cves: []
  cwes: []
  hashes:
    - 03b73aae8690bc29d332c61fae880348
    - 051343d7c970cf951aaa13a49e1ec102
    - 1b159b0a18a17b68e0f0f2bfd2495e98
    - 1bff35622fa8458dae1d60a84b135cbb
    - 2763694f69e41d34a4f731c4671ac18e
    - 4faa8662c59590c6f43ae9fe5b002b42
    - 5cbd5384285e4589baaddc7fe9664ac1
    - 5d94f6cbe7c619adb37f9d7ad1214505
    - 649722b111952d442a2bc37ee0c89b4c
    - 686900735edb4fa6af7fe7145db9b1d3
    - 728868c93eb22bd516c416c8ccbcc668
    - 77dec556e2a802eec5f01395cabd0a41
    - 8e0d1bbde7024c26d881584617545982
    - 9d6628b7c0e359b2bd045c7c8cb18d01
    - b83591860e0a1f19b7701873637b4539
    - bc3fa95e31ca4621998848e3746cd20a
    - de2ffb63dea8a76f056756e174f68bad
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 逆向学习通验证码/登录/刷课参数：enc和inf_enc为MD5，logininfo为AES/ECB+Base64，cxcid为RSA+Base64，全部可用Python复现。
> 
> - **验证码接口：** enc = MD5(手机号 + 常量KEY_27 + 毫秒时间戳)，KEY_27 为 "jsDyctOCnay7uotq"，countrycode 固定为 86；可脱离App直接发包。
> - **登录接口：** logininfo = Base64(AES/ECB/PKCS5Padding(Json(uname, code), key="z4ok6lu^oWp4_AES"))，Base64 输出 flag=2 表示不换行；手机号验证码登录 loginType=2，账号密码登录 loginType 和 entype 均为 1。
> - **静态请求参数：** token 写死为 "4faa8662c59590c6f43ae9fe5b002b42"，_key 为 "Z(AfY@XS"，_c_0_ 为 UUID 去横线；inf_enc = MD5(所有查询参数按字母序拼成 key=value&key=value 后 toHex)。
> - **刷课的 cxcid：** 来自 libsecuritylib.so 的 native decryptDeviceInfo(入参为服务器下发的 Base64 clientId)，实际是 Base64 + 标准 RSA + 内置公钥；用 unidbg 可直接调用，无需完整修复 so 结构。
> - **UA 与签名：** cryptUserAgent 在 UA 前拼 "(schild:xxxx)"，其中 xxxx 是加盐 MD5；另一 native 使用 JSON 键排序后做 RSA-SHA256 签名并 Base64，私钥内嵌。

## 学习通逆向

## 0x00 验证码&登录

先抓包

![1](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/77514952547bd4c3.webp)

可以看到请求头里没啥，看看请求体

![2](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6f5580fd10492805.webp)

可以看到 `to` 就是我们的手机号明文， `countrycode` 是国区号，中国的所以是86， `time` 是个时间戳， `enc` 是个校验码，需要我们去逆向

### 0x01 enc逆向还原

#### 定位

由于app使用的 **Retrofit** 框架发请求，这里可以直接搜请求里的路径名 `api/sendcaptcha`

![3](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/471a9dad75b49c55.webp)

只有这一处调用，而且app字符串没看到有加密的，大概率就是这里了。hook验证之后可以发现确实是这里。看一下 `f` 的引用，发现只有一处，可以定位到这里

![4](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a17890a6d8131686.webp)

看着有点累，格式化一下

```java
((com.chaoxing.study.account.g)
    de.s.c("https://passport2-api.chaoxing.com/")
        .g(com.chaoxing.study.account.g.class)
).f(
    str,
    str2,
    str3,
    currentTimeMillis,
    ie.j.c(str + Keys.KEY_27 + currentTimeMillis)
).i(new d(hVar));
```

不难发现 `ie.j.c(str + Keys.KEY_27 + currentTimeMillis)` 就是上面接口里的 `str4` ，也就是 `enc` 的生成逻辑

直接先hook看看参数吧，不过不hook应该也能猜到了， `str` 是手机号， `Keys.KEY_27` 是写死的，如下

```java
package com.chaoxing.mobile.secrets;

public class Keys {
    public static String INF_ENC_KEY_2b0b9247 = "zcpq%LOf$!uUMdk";
    public static String INF_ENC_KEY_5b002b42 = "Z(AfY@XS";
    public static String INF_ENC_KEY_5db9b1d3 = "1bff35622fa8458dae1d60a84b135cbb";
    public static String INF_ENC_KEY_74f68bad = "L(AfY@DE";
    public static String INF_ENC_TOKEN_2b0b9247 = "cl7239572d1d43829a037f172b0b9247";
    public static String INF_ENC_TOKEN_5b002b42 = "4faa8662c59590c6f43ae9fe5b002b42";
    public static String INF_ENC_TOKEN_5db9b1d3 = "686900735edb4fa6af7fe7145db9b1d3";
    public static String INF_ENC_TOKEN_74f68bad = "de2ffb63dea8a76f056756e174f68bad";
    public static String KEY_20 = "dke#hjHU&32";
    public static String KEY_21 = "edm48g02w";
    public static String KEY_22 = "uWwjeEKsri";
    public static String KEY_23 = "3rj#jn9yj";
    public static String KEY_24 = "uWwjeEKsriwwewdf";
    public static String KEY_25 = "mic^ruso&ke@y";
    public static String KEY_26 = "z4ok6lu^oWp4_AES";
    public static String KEY_27 = "jsDyctOCnay7uotq"; // target_key

    private Keys() {
    }
}
```

`currentTimeMillis` 是个毫米级时间戳，三个拼接起来。这一点hook验证一下即可，验证之后确实和我们想的一样。接下来看看 `ie.j.c` 函数

![5](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/2ca1832737f831bc.webp)

典型的 `MD5` 无需多言

接下来就可以愉快发包了

```python
import requests
import hashlib
import time

# 常量定义
KEY = "jsDyctOCnay7uotq"

def calculate_enc(phone, timestamp):
    """计算enc参数：MD5(to + KEY + time)"""
    original_string = phone + KEY + str(timestamp)
    md5_hash = hashlib.md5(original_string.encode('utf-8')).hexdigest()
    return md5_hash

def send_captcha():
    # 用户输入手机号
    phone = input("请输入手机号: ").strip()

    # 生成时间戳（毫秒级）
    timestamp = int(time.time() * 1000)

    # 计算enc参数
    enc_value = calculate_enc(phone, timestamp)

    # 构造请求参数
    url = "https://passport2-api.chaoxing.com/api/sendcaptcha"

    payload = {
        'to': phone,
        'countrycode': "86",
        'time': str(timestamp),
        'enc': enc_value
    }

    headers = {
        'User-Agent': "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 6 Build/AP1A.240505.004) (schild:051343d7c970cf951aaa13a49e1ec102) (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a",
        'Connection': "Keep-Alive",
        'Accept-Encoding': "gzip",
        'Accept-Language': "zh_CN_#Hans",
        'Cookie': "JSESSIONID=77DEC556E2A802EEC5F01395CABD0A41; route=03b73aae8690bc29d332c61fae880348"
    }

    try:
        response = requests.post(url, data=payload, headers=headers)
        print(f"状态码: {response.status_code}")
        print(f"响应内容: {response.text}")
        return response.text
    except Exception as e:
        print(f"请求失败: {e}")
        return None

if __name__ == "__main__":
    send_captcha()
```

**接下来看登录部分**

![6](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bf16c6d20d78cdf8.webp)

依旧没啥参数

`countrycode` 是国区码，国内写死86就行， `loginType` 代表登录方式(1代表账号密码登录，2代表手机号验证码登录) `roleSelect` 不知道是个啥，但是没啥影响，写死true就行， `entype` 应该是加密种类，这个后面看看，用到了再说。主要是要逆一下 `logininfo`

抓包抓到的 `logininfo` 的值是 `MYJYF2f7JX0gFu7Pbq+V9Byfb+9PjbXcdkGz/zhT87hXqnQ2Wp3jlsT0l2rR10UY` ，这像是一个Base64，但是解码之后是乱码，所以应该是别的加密，外层套了Base64

### 0x02 logininfo逆向还原

#### 定位

老规矩，一样的框架，直接搜路径

有两处，其中一处是完整请求链接，但是那个函数没有被引用，所以pass掉，只剩下这一处了，后面hook验证，确实是这里

![7](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fc6692d200b69a92.webp)

![8](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6c073244f6030e7a.webp)

格式化一下：

```java
((com.chaoxing.study.account.g)
    de.s.a()
        .a(new b0())
        .f(15000L)
        .l(30000L)
        .o(30000L)
        .c("https://passport2-api.chaoxing.com/")
        .g(com.chaoxing.study.account.g.class)
).b(
    f9.e.b(Keys.KEY_26.getBytes(StandardCharsets.UTF_8))
        .a(new Plaintext(jSONObject.toString()))
        .getBytes_Base64(2),
    str,
    str3,
    i11,
    true,
    1
).i(new a(hVar));
```

这里就是我们的 `logininfo` 生成的地方了

```java
f9.e.b(Keys.KEY_26.getBytes(StandardCharsets.UTF_8))
        .a(new Plaintext(jSONObject.toString()))
        .getBytes_Base64(2)
```

简单跟一下就全出来了

![9](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/df455d20a36362af.webp)

![10](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f987646697def537.webp)

![11](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5f9af4320708a462.webp)

完全的标准 `AES/ECB/PKCS5Padding` ，秘钥是 `z4ok6lu^oWp4_AES` ，来源上面有个秘钥表，里面有这个 `KEY_26`

hook打印一下参数，可以知道明文是 `{"uname":"18051249287","code":"123456"}` ，一个json文本格式， `uname` 是手机号， `code` 是验证码，那么就很清晰了

最后还有个 `getBytes_Base64(2)` ，按照这个app的尿性肯定是标准Base64了，不过保险起见还是看看吧

![12](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f0bc3889ab42baa4.webp)

这里的 `flag` 代表输出格式， `flag = 2` 代表输出内容不换行

综上: `logininfo` = `Base64(AES_ECB(Json(phoneNum, code)， KEY_26))`

这里写好python代码之后发现返回的是个重定向地址

```bash
请输入收到的验证码: 967155
登录状态码: 200
登录响应: {"mes":"验证通过","type":1,"url":"https://sso.chaoxing.com/apis/login/userLogin4Uname.do","status":true}
```

所以直接使用新会话就行

```python
import requests
import hashlib
import time
import json
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

SEND_CAPTCHA_KEY = "jsDyctOCnay7uotq"
LOGIN_AES_KEY = "z4ok6lu^oWp4_AES"

def calculate_enc(phone, timestamp):
    """计算发送验证码的enc参数：MD5(to + KEY + time)"""
    original_string = phone + SEND_CAPTCHA_KEY + str(timestamp)
    md5_hash = hashlib.md5(original_string.encode('utf-8')).hexdigest()
    return md5_hash

def encrypt_login_info(phone, verification_code):
    """加密登录信息：Base64(AES_ECB(msg, key))"""
    msg_json = {
        "uname": phone,
        "code": verification_code
    }
    msg_string = json.dumps(msg_json, separators=(',', ':'))

    # AES ECB加密
    aes_key = LOGIN_AES_KEY.encode('utf-8')
    cipher = AES.new(aes_key, AES.MODE_ECB)

    # 填充并加密
    padded_data = pad(msg_string.encode('utf-8'), AES.block_size)
    encrypted_data = cipher.encrypt(padded_data)

    # Base64编码
    logininfo = base64.b64encode(encrypted_data).decode('utf-8')
    return logininfo

def send_captcha():
    """发送验证码"""
    phone = input("请输入手机号: ").strip()

    # 生成时间戳（毫秒级）
    timestamp = int(time.time() * 1000)

    # 计算enc参数
    enc_value = calculate_enc(phone, timestamp)

    # 构造请求参数
    url = "https://passport2-api.chaoxing.com/api/sendcaptcha"

    payload = {
        'to': phone,
        'countrycode': "86",
        'time': str(timestamp),
        'enc': enc_value
    }

    headers = {
        'User-Agent': "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 6 Build/AP1A.240505.004) (schild:051343d7c970cf951aaa13a49e1ec102) (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a",
        'Connection': "Keep-Alive",
        'Accept-Encoding': "gzip",
        'Accept-Language': "zh_CN_#Hans",
        'Cookie': "JSESSIONID=77DEC556E2A802EEC5F01395CABD0A41; route=03b73aae8690bc29d332c61fae880348"
    }

    try:
        response = requests.post(url, data=payload, headers=headers)
        print(f"验证码发送状态码: {response.status_code}")
        print(f"验证码发送响应: {response.text}")
        return phone, response.text
    except Exception as e:
        print(f"验证码发送失败: {e}")
        return None, None

def login_with_verification_code(phone):
    verification_code = input("请输入收到的验证码: ").strip()

    session = requests.Session()

    session.headers.update({
        'User-Agent': "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 6 Build/AP1A.240505.004) (schild:051343d7c970cf951aaa13a49e1ec102) (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a",
        'Connection': "Keep-Alive",
        'Accept-Encoding': "gzip",
        'Accept-Language': "zh_CN_#Hans"
    })

    session.cookies.update({
        "JSESSIONID": "9D6628B7C0E359B2BD045C7C8CB18D01",
        "route": "2763694f69e41d34a4f731c4671ac18e"
    })

    logininfo = encrypt_login_info(phone, verification_code)

    url = "https://passport2-api.chaoxing.com/v11/loginregister?cx_xxt_passport=json"

    payload = {
        'logininfo': logininfo,
        'countrycode': "86",
        'loginType': "2",
        'roleSelect': "true",
        'entype': "1"
    }

    try:
        response = session.post(url, data=payload)
        print(f"登录状态码: {response.status_code}")
        print(f"登录响应: {response.text}")

        result = response.json()
        if result.get('status') and result.get('url'):
            redirect_url = result['url']
            print(f"重定向URL: {redirect_url}")

            redirect_response = session.get(redirect_url, allow_redirects=True)

            final_cookies = session.cookies.get_dict()
            print(f"最终登录凭证: {final_cookies}")

            # 检查是否有token相关的cookie
            token_keys = ['token', 'UID', '_uid', 'TUID', 'fid']
            for key in token_keys:
                if key in final_cookies:
                    print(f"找到凭证: {key} = {final_cookies[key]}")

            return session

        else:
            print(f"登录失败: {result.get('mes', '未知错误')}")
            return None

    except Exception as e:
        print(f"登录失败: {e}")
        return None

def main():
    """主函数"""
    print("=== 超星学习通登录流程 ===")

    phone, send_result = send_captcha()
    if not phone:
        return

    login_result = login_with_verification_code(phone)

    if login_result:
        print("\n=== 登录完成 ===")

if __name__ == "__main__":
    main()
```

**完美运行qaq**

![13](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/eaa68e7e80cb6e65.webp)

### token

逆了半天发现是他妈写死的…

**过程**

直接搜 `token` 有900多条，显然不合适，这里还有其他很多方法，比如hook `Interceptor` ，hook `HashMap.put` 都行，但是我手机懒得插线了，直接静态分析吧。这里观察数据包，带 `token` 的请求都带 `_c_0_` 和 `inf_enc` 这俩参数，所以直接搜 `_c_0_` ，这个吊名字肯定出现次数很少，一搜确实

![14](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/778476cb14a8c7a6.webp)

果然是几个字段都出现了，这里跟一下 `token` 字段，发现他是在函数 `j` 里赋值的，这里看一下 `j` 函数的引用

![15](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/691bb6566e81ce36.webp)

添加了一个 `pair` 对象，token的值是 `pair.first` ，这里也关注一下 `pair.second` ，它的 `_key` 的值

![16](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8f5897d413fa66ae.webp)

居然是写死的…值还是存在刚刚最上面那个 `Keys.java` 里

`token = "4faa8662c59590c6f43ae9fe5b002b42"`

`_key = "Z(AfY@XS"`

`_c_0_ = UUID.randomUUID().toString().replace(Constants.ACCEPT_TIME_SEPARATOR_SERVER, "");`

`_time = System.currentTimeMillis()`

接下来剩下个 `inf_enc` ，这次学聪明了，直接搜，发现没搜到，那确实是动态计算的了

![17](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a330a7ed576d6ed1.webp)

`q.b(sb2.toString())` ，去看看 `q.b()` 吧

![18](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e053d777f8f61218.webp)

太几把简单了，目前全是java层的…能不能赶紧快进到so层，这个函数就是一个简单的 `MD5` ，然后把MD5的结果 `toHex` 一下，没啥说的，加密参数就是 **所有查询参数按字母顺序拼接成的字符串**，格式为 `key=value&key=value`

比如

```bash
_c_0_=5cbd5384285e4589baaddc7fe9664ac1&token=4faa8662c59590c6f43ae9fe5b002b42&_time=1763363156373&inf_enc=1b159b0a18a17b68e0f0f2bfd2495e98
```

### 接下来一些简单的字段那我就一笔带过了

1.  `analysis/tab` 这个请求路径的 `enc` 字段：MD5((type + puid + “qK\`b3XjC”))
2.  账号密码登录时 `entype` 和 `loginType` 都是 `1` ，加密方式和验证码登录是一致的，这个跳过
3.  `sso_t` 和 `sso_t` 是在登录返回时的响应头里带着的

## 0x10 刷课

课程相关的，当点开一个视频，然后再退出之后，会上报 `playingTime` ， `clipTime` ， `duration` ，修改这三个字段发包应该就可以达到刷课的目的:) 但是这个接口附带了两个新参数， `cxtime` 和 `cxcid`

### cxcid逆向还原

这里定位这个参数，直接搜可以搜到，但是结果比较多，这里我选择hook `HashMap.put` 来帮助定位

```javascript
Java.perform(function (){
    var hashMap = Java.use("java.util.HashMap");
    hashMap.put.overload('java.lang.Object', 'java.lang.Object').implementation = function (key, value) {
        if(key && key.toString().includes("cxcid")) {
            console.log("HashMap -> key:", key, "value:", value);

            console.log("call stack:");
            var stackTrace = Java.use("android.util.Log").getStackTraceString(
                Java.use("java.lang.Exception").$new("Stack trace")
            );
            console.log(stackTrace);
        }
        return this.put(key, value);
    }
});
```

然后就可以看到输出的 `cxcid` 值以及堆栈，然后一路追踪(具体追踪路径参考标题栏的那些类名)，来到下面这个类的 `decryptDeviceInfo` 函数，这是一个native函数，但这个类就声明了两个native函数，应该也是很简单的，先frida hook验证一下是不是我们想要到 `cxcid`

![19](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c3cd98898ebb5ab5.webp)

验证一下

![20](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ab624da0af20d0ac.webp)

眉毛，而且这个result还返回了一个 `SC` 字段，不知道后面有没有用，入参 `clientId` 是一个 `Base64` 编码之后的字符串，实际上是服务器返回的

可以看到加载的so名字是libsecuritylib.so，打开可以发现大量的seg000段数据被加密，而且只有两LOAD段，权限也不正常。同时没有 `JNI_OnLoad` 函数，也没有`.init_array` 段，正常来讲，如果是加密了整个段的话，会在so自己的`.init_array` 里注册解密函数，so被 `linker` 加载之后会自动解密对应加密代码。但是这里并没有，所以有两种可能

1.  别的so帮助解密这块数据
2.  so的结构被破坏了

第一点很好理解，第二点是因为linker加载so用到section的内容很少，所以so可能破坏了section相关的内容，导致ida分析出了问题，这一点可以使用 `readelf` 验证

这里我选择直接验证猜想一，如果是别的so帮忙解密的，但是 `libsecuritylib` 又是被原生 `linekr` 加密的，那么在加载完成之后内存里一定还是一个未解密的状态，可以在这个时候dump修复。这么做之后可以发现ida可以正常解析。并且多了很多LOAD段，说明确实是so的结构被破坏了。那既然能正常分析了，他具体是怎么破坏的就不继续深究了，主要还是以算法分析为主

懒得插手机了，每次都得启动frida-server，然后打开WebStorm，然后创建项目，有点麻烦烦。还是unidbg好用…

直接unidbg（这里直接加载apk里的so就行，dump出的so主要用于给ida分析），环境都不用补，学习通真是好人，不愧是学习通，连app设计的都这么为学习逆向的学生考虑，太仁义了

![21](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e15e75f0db066ab8.webp)

静态注册，也没混淆，函数名可以一眼看出来是 `Base64+RSA`

![22](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/790c3ca43deebcf0.webp)

这里的 `RSA` 是来自外部的 `libcrypto.so` ，这个so是 `openSSL` 附带的，里面是一大堆标准加密算法，我们设备的 `/system/lib64/` 下就有一个，但是他这里是自带了一个 `libcrypto.so` 在它的apk包里，不过正常人要魔改算法肯定写自己so里了，不会再去引用外部库的函数了，这里姑且把它当做是标准 `RSA` ，所以直接看 `base64_decode` 函数即可

![23](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/feebcca4bec21c17.webp)

![24](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7cb337babfc027e1.webp)

看起来确实是标准的 `Base64` ，再用unidbg验证一下吧

```java
public String callDecryptDeviceInfo() {
        emulator.attach().addBreakPoint(module.base + 0x77EF8);
        String arg = "VOtAqxqYf0AOUEP3QnjkWe1qME6nUS3HJzrwZmXryR8pHnMZhYyE05MOiSf6xUT6rIN0Cgu1WrJsRvzMpIM2d/RBaHXEj5kORaNaFEVpEVnNSP/EtUD9hGMrQ4tYorSSDpLUzFldRgk0SXyHKIC9Y38x4a4wn5/VZ5PgFIFllzc=";
        String ret = CxDevice.callStaticJniMethodObject(emulator, "decryptDeviceInfo(Ljava/lang/String;)Ljava/lang/String;", arg).getValue().toString();
        return ret == null ? "error" : ret;
    }
```

```bash
mx0

>-----------------------------------------------------------------------------<
[16:21:32 205]x0=unidbg@0xbffff620, md5=b83591860e0a1f19b7701873637b4539, hex=b100000000000000ac0000000000000000805e400000000088ec10400000000080f6ffbf00000000709e0a40000000000000000000000000000000000000000000000000000000000010000000000000e100000000000000d80000000000000000805d4000000000a0590e4000000000
size: 112
0000: B1 00 00 00 00 00 00 00 AC 00 00 00 00 00 00 00    ................
0010: 00 80 5E 40 00 00 00 00 88 EC 10 40 00 00 00 00    ..^@.......@....
0020: 80 F6 FF BF 00 00 00 00 70 9E 0A 40 00 00 00 00    ........p..@....
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 10 00 00 00 00 00 00    ................
0050: E1 00 00 00 00 00 00 00 D8 00 00 00 00 00 00 00    ................
0060: 00 80 5D 40 00 00 00 00 A0 59 0E 40 00 00 00 00    ..]@.....Y.@....
^-----------------------------------------------------------------------------^
```

这是一个 `std::string` 类型字符串的内存布局，我们的目的是找到入参和出参，我们可以在内存里搜一下我们的参数

```bash
shr 564f7441
Search heap matches 2 count
Heap matches: RW@0x40113000
Heap matches: RW@0x405e8000

m0x40113000 0xAC // 这里只是猜测

>-----------------------------------------------------------------------------<
[16:28:09 824]RW@0x40113000, md5=728868c93eb22bd516c416c8ccbcc668, hex=564f7441717871596630414f55455033516e6a6b576531714d45366e555333484a7a72775a6d587279523870486e4d5a6859794530354d4f695366367855543672494e304367753157724a7352767a4d70494d32642f5242614858456a356b4f52614e614645567045566e4e53502f457455443968474d72513474596f72535344704c557a466c6452676b30535879484b49433959333878346134776e352f565a3550674649466c6c7a633d
size: 172
0000: 56 4F 74 41 71 78 71 59 66 30 41 4F 55 45 50 33    VOtAqxqYf0AOUEP3
0010: 51 6E 6A 6B 57 65 31 71 4D 45 36 6E 55 53 33 48    QnjkWe1qME6nUS3H
0020: 4A 7A 72 77 5A 6D 58 72 79 52 38 70 48 6E 4D 5A    JzrwZmXryR8pHnMZ
0030: 68 59 79 45 30 35 4D 4F 69 53 66 36 78 55 54 36    hYyE05MOiSf6xUT6
0040: 72 49 4E 30 43 67 75 31 57 72 4A 73 52 76 7A 4D    rIN0Cgu1WrJsRvzM
0050: 70 49 4D 32 64 2F 52 42 61 48 58 45 6A 35 6B 4F    pIM2d/RBaHXEj5kO
0060: 52 61 4E 61 46 45 56 70 45 56 6E 4E 53 50 2F 45    RaNaFEVpEVnNSP/E
0070: 74 55 44 39 68 47 4D 72 51 34 74 59 6F 72 53 53    tUD9hGMrQ4tYorSS
0080: 44 70 4C 55 7A 46 6C 64 52 67 6B 30 53 58 79 48    DpLUzFldRgk0SXyH
0090: 4B 49 43 39 59 33 38 78 34 61 34 77 6E 35 2F 56    KIC9Y38x4a4wn5/V
00A0: 5A 35 50 67 46 49 46 6C 6C 7A 63 3D                Z5PgFIFllzc=
^-----------------------------------------------------------------------------^
```

可以看到我使用了 `m0x40113000 0xAC` ，不难发现其实这个地址在我们 `mx0` 的时候就出现了， `0x40000000` 后面是 `Dynamic lib and heap` ，这里数据在堆上， `std::string` 对于长字符串也确实是这样实现的，多看看刚刚那块内存里的0x40000000开头的内存吧(这种方式只是在猜测，当然你也可以去看std::string的具体实现，那样会精确一些)查看了一下，别的都没啥，直接看解密之后的结果吧

```bash
m0xbffff620

>-----------------------------------------------------------------------------<
[16:38:50 627]unidbg@0xbffff620, md5=8e0d1bbde7024c26d881584617545982, hex=b100000000000000ac0000000000000000805e40000000009100000000000000800000000000000000e05e40000000000000000000000000000000000000000000000000000000000010000000000000e100000000000000d80000000000000000805d4000000000a0590e4000000000
size: 112
0000: B1 00 00 00 00 00 00 00 AC 00 00 00 00 00 00 00    ................
0010: 00 80 5E 40 00 00 00 00 91 00 00 00 00 00 00 00    ..^@............
0020: 80 00 00 00 00 00 00 00 00 E0 5E 40 00 00 00 00    ..........^@....
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 10 00 00 00 00 00 00    ................
0050: E1 00 00 00 00 00 00 00 D8 00 00 00 00 00 00 00    ................
0060: 00 80 5D 40 00 00 00 00 A0 59 0E 40 00 00 00 00    ..]@.....Y.@....
^-----------------------------------------------------------------------------^
```

这个看起来比较像

```bash
m0x405ee000 0x91

>-----------------------------------------------------------------------------<
[16:40:30 537]RW@0x405ee000, md5=5d94f6cbe7c619adb37f9d7ad1214505, hex=54eb40ab1a987f400e5043f74278e459ed6a304ea7512dc7273af06665ebc91f291e7319858c84d3930e8927fac544faac83740a0bb55ab26c46fccca4833677f4416875c48f990e45a35a1445691159cd48ffc4b540fd84632b438b58a2b4920e92d4cc595d460934497c872880bd637f31e1ae309f9fd56793e014816597370000000000000000000000000000000000
size: 145
0000: 54 EB 40 AB 1A 98 7F 40 0E 50 43 F7 42 78 E4 59    T.@....@.PC.Bx.Y
0010: ED 6A 30 4E A7 51 2D C7 27 3A F0 66 65 EB C9 1F    .j0N.Q-.':.fe...
0020: 29 1E 73 19 85 8C 84 D3 93 0E 89 27 FA C5 44 FA    ).s........'..D.
0030: AC 83 74 0A 0B B5 5A B2 6C 46 FC CC A4 83 36 77    ..t...Z.lF....6w
0040: F4 41 68 75 C4 8F 99 0E 45 A3 5A 14 45 69 11 59    .Ahu....E.Z.Ei.Y
0050: CD 48 FF C4 B5 40 FD 84 63 2B 43 8B 58 A2 B4 92    .H...@..c+C.X...
0060: 0E 92 D4 CC 59 5D 46 09 34 49 7C 87 28 80 BD 63    ....Y]F.4I|.(..c
0070: 7F 31 E1 AE 30 9F 9F D5 67 93 E0 14 81 65 97 37    .1..0...g....e.7
0080: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0090: 00                                                 .
^-----------------------------------------------------------------------------^
```

拿去 `CyberChef` 验证一下吧

![25](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b20ddfe2b1b45b45.webp)

确实是标准的 `Base64` ，直接用标准RSA算法解密一下看看，确实输出了预期的结果

![26](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/ccdd05780d913d17.webp)

```python
import base64

def _read_len(b, i):
    x = b[i]
    i += 1
    if x & 0x80:
        n = x & 0x7F
        return int.from_bytes(b[i:i + n], 'big'), i + n
    return x, i

def _read_tlv(b, i):
    tag = b[i]
    i += 1
    length, i = _read_len(b, i)
    return tag, b[i:i + length], i + length

def _parse_rsa_pubkey_from_spki(spki_der):
    t, v, _ = _read_tlv(spki_der, 0)
    j = 0
    t2, alg, j = _read_tlv(v, j)
    t3, bitstr, j = _read_tlv(v, j)
    rsakey = bitstr[1:]
    t4, rsaseq, _ = _read_tlv(rsakey, 0)
    k = 0
    _, n_bytes, k = _read_tlv(rsaseq, k)
    _, e_bytes, k = _read_tlv(rsaseq, k)
    n = int.from_bytes(n_bytes, 'big')
    e = int.from_bytes(e_bytes, 'big')
    return n, e

_PUBKEY_B64 = (
    "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC79d8Ot0hCbxxSISC6x8SCwTBspFSzlLKHJUYqoFNu1TSRaw4hEYkOnvEaL1VyoxV6HXcDrzwYva"
    "FZaZaPQPFnfCHZy5dQwxcmifgSHqS+oKXw40Ys4cVIqnU5d90S7EWSRdBglX489jlqVaNcQSkDx2TYmC+DbAq9FV/BU09ISQIDAQAB"
)

def decrypt_device_info(s):
    if not s:
        return ""
    try:
        c = base64.b64decode(s, validate=True)
    except Exception:
        return ""
    spki = base64.b64decode(_PUBKEY_B64)
    n, e = _parse_rsa_pubkey_from_spki(spki)
    k = (n.bit_length() + 7) // 8
    c_int = int.from_bytes(c, 'big')
    m_int = pow(c_int, e, n)
    m = m_int.to_bytes(k, 'big')
    if len(m) < 3 or m[0] != 0 or m[1] not in (1, 2):
        return ""
    sep = m.find(b"\x00", 2)
    if sep < 0:
        return ""
    return m[sep + 1 :].decode("utf-8", "replace")
```

## 0x30 签到

这个后面再说吧，我们老师都不签到，抓不到包

## 0x40 Others

别的也没啥参数要逆了，看看这个so里其他的几个native函数的逻辑吧

### 0x41 cryptUserAgent

```bash
Find native function Java_com_chaoxing_securitylib_napi_SecurityLib_cryptUserAgent => RX@0x4007a9ec[libsecuritylib.so]0x7a9ec
JNIEnv->GetStringUtfChars(" (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a") was called from RX@0x4007aa40[libsecuritylib.so]0x7aa40
JNIEnv->ReleaseStringUTFChars(" (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a") was called from RX@0x4007adc8[libsecuritylib.so]0x7adc8
JNIEnv->NewStringUTF("(schild:051343d7c970cf951aaa13a49e1ec102) (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a") was called from RX@0x4007ade8[libsecuritylib.so]0x7ade8
result = (schild:051343d7c970cf951aaa13a49e1ec102) (device:Pixel 6) Language/zh_CN_#Hans com.chaoxing.mobile/ChaoXingStudy_3_6.7.1_android_phone_10935_311 (@Kalimdor)_bc3fa95e31ca4621998848e3746cd20a
```

只是在参数前面加了 `(schild:051343d7c970cf951aaa13a49e1ec102)` 可以看到前面是固定的，后面有个32位的签名值，32位盲猜一波 `MD5`

![27](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/09a0326d25444154.webp)

`iv` 没改，看下MD5签名的参数吧

![28](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4ad0e400d985df8e.webp)

```bash
mx1

>-----------------------------------------------------------------------------<
[18:27:44 730]x1=unidbg@0xbffff5f0, md5=649722b111952d442a2bc37ee0c89b4c, hex=c100000000000000be0000000000000000d05d4000000000a100000000000000950000000000000000805d40000000000123456789abcdeffedcba9876543210000000000000000088ec10400000000080f6ffbf00000000709e0a4000000000a0f6ffbf0000000024532d4000000000
size: 112
0000: C1 00 00 00 00 00 00 00 BE 00 00 00 00 00 00 00    ................
0010: 00 D0 5D 40 00 00 00 00 A1 00 00 00 00 00 00 00    ..]@............
0020: 95 00 00 00 00 00 00 00 00 80 5D 40 00 00 00 00    ..........]@....
0030: 01 23 45 67 89 AB CD EF FE DC BA 98 76 54 32 10    .#Eg........vT2.
0040: 00 00 00 00 00 00 00 00 88 EC 10 40 00 00 00 00    ...........@....
0050: 80 F6 FF BF 00 00 00 00 70 9E 0A 40 00 00 00 00    ........p..@....
0060: A0 F6 FF BF 00 00 00 00 24 53 2D 40 00 00 00 00    ........$S-@....
^-----------------------------------------------------------------------------^
```

很熟悉了，上面讲 `cxcid` 时聊过这个内存布局

```bash
m0x405dd000 0xbe

>-----------------------------------------------------------------------------<
[18:28:43 259]RW@0x405dd000, md5=051343d7c970cf951aaa13a49e1ec102, hex=28736368696c643a69704c24546b6569456d6679316754586232584872644c4e30614037635e76752920286465766963653a506978656c203629204c616e67756167652f7a685f434e5f2348616e7320636f6d2e6368616f78696e672e6d6f62696c652f4368616f58696e6753747564795f335f362e372e315f616e64726f69645f70686f6e655f31303933355f3331312028404b616c696d646f72295f6263336661393565333163613436323139393838343865333734366364323061
size: 190
0000: 28 73 63 68 69 6C 64 3A 69 70 4C 24 54 6B 65 69    (schild:ipL$Tkei
0010: 45 6D 66 79 31 67 54 58 62 32 58 48 72 64 4C 4E    Emfy1gTXb2XHrdLN
0020: 30 61 40 37 63 5E 76 75 29 20 28 64 65 76 69 63    0a@7c^vu) (devic
0030: 65 3A 50 69 78 65 6C 20 36 29 20 4C 61 6E 67 75    e:Pixel 6) Langu
0040: 61 67 65 2F 7A 68 5F 43 4E 5F 23 48 61 6E 73 20    age/zh_CN_#Hans
0050: 63 6F 6D 2E 63 68 61 6F 78 69 6E 67 2E 6D 6F 62    com.chaoxing.mob
0060: 69 6C 65 2F 43 68 61 6F 58 69 6E 67 53 74 75 64    ile/ChaoXingStud
0070: 79 5F 33 5F 36 2E 37 2E 31 5F 61 6E 64 72 6F 69    y_3_6.7.1_androi
0080: 64 5F 70 68 6F 6E 65 5F 31 30 39 33 35 5F 33 31    d_phone_10935_31
0090: 31 20 28 40 4B 61 6C 69 6D 64 6F 72 29 5F 62 63    1 (@Kalimdor)_bc
00A0: 33 66 61 39 35 65 33 31 63 61 34 36 32 31 39 39    3fa95e31ca462199
00B0: 38 38 34 38 65 33 37 34 36 63 64 32 30 61          8848e3746cd20a
^-----------------------------------------------------------------------------^
```

参数是java层输入的参数加上了一些乱码，内容是固定的，通过 `std::string::append` 拼接，所以这里是一个标准 `加盐MD5`

![29](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/421a77430731a163.webp)

![30](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4f3e7f85afe612e7.webp)

眉毛，就是标准的MD5

**那就很简单了，就是一个加盐MD5，然后拼接字符串**

### 0x42 cryptUserAgent

这个好像没有被用到，但是也顺便看一下吧，这个so里全都是标准算法，不想截图了，就是一个JSON转换，然后标准 `RSA` +标准 `Base64` ，私钥dump一下就有了

```python
import json
import base64
from typing import Dict, Any
from Crypto.PublicKey import RSA
from Crypto.Signature import pkcs1_15
from Crypto.Hash import SHA256, SHA1

def _to_string(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return ""
    return str(v)

def build_message_from_json(json_str: str) -> bytes:
    obj = json.loads(json_str)
    keys = sorted(obj.keys())
    parts = []
    for k in keys:
        parts.append(k + _to_string(obj[k]))
    return "".join(parts).encode("utf-8")

EMBEDDED_PRIVATE_KEY_B64 = "MIICeAIBADANBgkqhkiG9w0BAQEFAASCAmIwggJeAgEAAoGBAKKJT8YxQ8N4HPsREJK06k4+itt6wyCbNEUN5ENNUX0XFD//sUwvM12VfE9ANz9QM2rLhtwFTM6W/TKJzeGV2zY2+6HGK3ksvR9cY3bEcnm4IRDQzDCO+srhq0n6HRUXdrjp8SVImIowzTRPvsQ4iCrfx3vOyEXM4Nn6Rh4SlMKLAgMBAAECgYB0Edy/KxU6NL91Z6VPLxUX1T/yJoPL+CnmmloE2eU0kFOstFsXjal/zi2cpr4NX6eoPznKS5qi+V5NRe2ZiBunP4SiN6WZvkwYL4XCZBElstdW3/qdV4FWtCgtBqpacfOam9dT+d0q2rA4nbbpXOWhICYKfaBBG+C8IPZGfZRh0QJBAO/lNDi62pL2spQl4To1QAZUdPK5WyIlc1NEuHlXc+asBhlwI5SHvoBHXQ8+oLl6Zmj0piS9bAUu6sJB1Zj+WSkCQQCtcqGU0H645m1UzuC/Xxonnd//6eDXHdnMiOFnWdlJ9t2MhJ4qUfBmN+XH0bej+HvRl2DHPhKsJ5UegKmI7RCTAkEA2Gu69QL9dWBCMw0JZ+3qWMuQxfkakm+e3xw8IJwY352J0yEruC/OWQQInFwvu6UFBuLPkI2jCfoNqDqkbGXqIQJBAIBvXskEbqHaN2FSY8gx0vs9A47MD6sbNpknTsmqFaWYgMu5tCkgTcRTZfpGCBcKPB2iW46OH2ONV/WjTmbPLLMCQQCKMAapcf110Kwe5H6VapWD+zC0I2nFLYYF2g/ugaNvT0udASLnEmWZLeTR5nUcfaEfwci4B4hJUAwrPJQ7VBIi"
def web_request_sign(json_str: str, private_key_pem: str, hash_alg: str = "SHA256") -> str:
    msg = build_message_from_json(json_str)
    key = RSA.import_key(private_key_pem)
    h = SHA256.new(msg) if hash_alg.upper() == "SHA256" else SHA1.new(msg)
    sig = pkcs1_15.new(key).sign(h)
    return base64.b64encode(sig).decode("ascii")

def web_request_sign_embedded(json_str: str, hash_alg: str = "SHA256") -> str:
    pem = RSA.import_key(base64.b64decode(EMBEDDED_PRIVATE_KEY_B64))
    msg = build_message_from_json(json_str)
    h = SHA256.new(msg) if hash_alg.upper() == "SHA256" else SHA1.new(msg)
    sig = pkcs1_15.new(pem).sign(h)
    return base64.b64encode(sig).decode("ascii")
```

## 0x50 小结

我要是大一大二就有时间做一些刷课或者签到的插件了，但我已经大四了，时间过得真快

[](#)

Twikoo 评论管理

密码
