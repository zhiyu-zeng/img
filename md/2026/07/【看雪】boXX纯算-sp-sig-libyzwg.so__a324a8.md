---
title: 【看雪】boXX纯算 sp sig libyzwg.so
source: https://bbs.kanxue.com/thread-291914.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-08T13:55:03+08:00
trace_id: de480683-8ce3-4be3-9b1e-c1127366d5e6
content_hash: 5f8246075379cd3bade421d35604877f407d95da37b384f4f9ae2d904ce3d3fe
status: summarized
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: 该APP的网络请求参数加密与签名生成机制已通过逆向分析libyzwg.so库完整揭示，涉及多种算法的组合与定制化处理。
ai_summary_style: key-points
images_status:
  total: 6
  succeeded: 6
  failed_urls: []
notion_page_id: 39775244-d011-8135-85ba-e28c26bd1ba5
ioc:
  cves: []
  cwes: []
  hashes:
    - 0a461c2d0db818ee663f9c7607f4dd08
    - a308f3628b3f39f7d35cdebeb6920e21
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 该APP的网络请求参数加密与签名生成机制已通过逆向分析libyzwg.so库完整揭示，涉及多种算法的组合与定制化处理。
> 
> - **sp参数处理流程：** 请求参数封装后，依次经过LZ4压缩、RC4加密，最后使用定制码表（`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`）进行Base64编码生成。
> - **sig签名生成机制：** 签名由路径、请求体、CRC32校验值（`1194187086`）以及一个固定后缀字符串拼接而成，最终计算其MD5哈希值并添加`V3.0`前缀。
> - **响应解密方法：** 接收到的响应数据先通过RC4解密，解密密钥在JNI_OnLoad时初始化并可能固定，再对结果进行LZ4解压以获取原始内容。
> - **核心加密依赖：** 算法流程的核心位于`libyzwg.so`库中，其中使用了标准的LZ4压缩、RC4加密算法，以及一个预生成的固定RC4 S_box。

#### baxx纯算 sp sig libyzwg.so

##### sp

抓个包请求体，主要有sqh好像是对查询参数的封装，sig是一个hash签名

```python
params = {
    'sp': 'zwp_NCTRJTSwi3Deh8DkHOCGvU04AYbyceqJ44s9CxuyL65jv20XaVYg1XpFLNVaF7LolNJtanuLr-ARNM136qI3RFO3xe8JyDZtt-TQVeh_TOtTgNw-LeFjEs8hx0tJoj7v9ncKmYZWKNui4my5Fc9Loyx67W-9L8MQyX1JatkuDl9Ec4gZFqDhg7Z1SBl0Q5EvXAZ_LJ35wN_c_ViiMlj3uGWAABuj9TFoIfCmIcIOaRu9i17K6XcsIJIEghrjY_AQsFedXLouh-p8zBzplaSLQy8yuaoULyZDqtdxw86gRZuOCUabqvRweZ50Ts-rnpqw0cJQkcepJGJbYAT2oPuMb9UvAxskJpjN8Vn5m9p8AC3Qf315z1Ph4lPo_uqiWXyB28eW9nIwZIgxKBLh2xOq54lTA5Ct31iIUOxoOj04438qYjIFex15STw8UT7JBX015qL0qMzCgA2hHNktJyB3aWKLQB9WA49WA4-3NPUFYeG9MG5ctKnjGm3rM_ExFlhOvCR8kzQpG-dlpneNXI7mrKm_h7YAuJvgGMvuYJykEqRFtRjqmY9PNSNjTWlVJ5rKy11ia6ww9XkqQ9O99CJD6yMDB1NvUMx1qKwI4Z6pOsWID9QSFgU2jyItA8casHba5AW_fneHDzDFA-4eMVDzE--jy9U3o0uhDlgpcEUGWdoQY3NpppAOpyt1Ba4Gp8eLiw6lMzGY2l-49oq2Q8tsJLJ14fQ0CoY-I6Bl2U4Y4pQiH0q-xzSVNWY7OkePHrfvEPLh0WU~',
    'sig': 'V3.0da0bd61bc37b38f86b7cef6f5c641015',
    'app_id': '1003',
}
```

hook一下hashMap定位

```java
Java.perform(function (){
    var hashMap = Java.use("java.util.HashMap");
    hashMap.put.implementation = function (a, b) {
        if (a != null) {
            var keyStr = a.toString();
            if (keyStr === "sp" || keyStr === "sig") {
                console.log(`检测到目标key: ${keyStr}，value: ${b}`);
                console.log("调用栈信息:");
                var stackTrace = Java.use("java.lang.Thread").currentThread().getStackTrace();
                for (var i = 0; i < stackTrace.length; i++) {
                    console.log(`  ${stackTrace[i].toString()}`);
                }
            }
        }
        return this.put(a, b);
    }
});
```

```python
[M2011K2C::com.hpbr.bosszhipin ]-> 检测到目标key: sp，value: zwp_NCTRJTSwi3Deh8DkHOCGvU04AYbyceqJ44s9CxuyL65jv20XaVYg1XpFLNVaF7LolNJtanuLr-ARNM136qI3RFO3xe8JyDZtt-TQVeh_TOtTgNw-LeFjEs8hx0tJoj7v9ncKmYZWy5FcBDry1-4muxL8MQyX1JatkuDl9Ec4gZFqDhg7Z1SBl0Q5EvXAZ_LJ35wN_c_ViiMlj3uGWAABuj9TFoIfCmIcIOaRu9i17K6XcsIJIEghrjY_AQsFedXLouh-p8zBzplaSLQy8yuaoULyZDqtdxw86gRZuOCUabqvRweZ50Ts-rnpqw0cJQkcepJGJbYAT2oPuMb9UvAxskJpjN8Vn5m9p8AC3Qf315z1Ph4lPo_uqiWXyB28eW9nIwZIgxKBLh2xOq54lTA5Ct31iIUOxoOj04438qYjIFex15STw8UT7JBX015qL0qMzCgA2hHNktJyB3aWKLQB9WA49WA4-3NPUFYeG9MG5ctKnjGm3rM_ExFlhOvCR8kzQpG-dlpneNXI7mrKm_h7YAuJvgGMvuYJykEqRFtRjqmY9PNSNjTWlVJ5rKy11ia6ww9XkqQ9O99CJD6yMDB1NvUMx1qKwI4Z6pOsWID9QSFgU2jyItA8casHba5AW_fneHDzDFA-4eMVDzE--jy9U3o0uhDlgpcEUGWdoQY3NpppAOpyt1Ba4Gp8eLiw6lMzGY2l-49oq2Q8tsJLJ14fQ0CoY-I6Bl2U4Y4pQrFku-xzSVNWY7OkePHrfvEPLh0WU~
调用栈信息:
  dalvik.system.VMStack.getThreadStackTrace(Native Method)
  java.lang.Thread.getStackTrace(Thread.java:2842)
  java.util.HashMap.put(Unknown Source)
  jf0.b.w(SourceFile:30)
  net.bosszhipin.base.m.f(SourceFile:67)
  net.bosszhipin.base.m.c(SourceFile:127)
  net.bosszhipin.base.k$a.a(SourceFile:21)
  com.twl.http.client.AbsBatchApiRequest.getBatchParamsV3(SourceFile:100)
```

然后就看到这两行，都在

```java
String strD2 = com.twl.signer.a.d(strD, secretKey);
bVar.w("sp", strD2);
if (strD.length() > 0x1388) {
strD = strD.substring(0x0, 0x1388);
}
bVar.w("sig", com.twl.signer.a.i(com.hpbr.bosszhipin.config.m.f(str) + strD, secretKey));
```

```java
    public static String d(String str, String str2) {
        String strEncodeRequest = YZWG.encodeRequest(str, str2);
        b(strEncodeRequest, "");
        return strEncodeRequest;
    }
```

然后hook一下d函数就能知道参数什么的了，好像是一个类似与url编码的先不管了

```python
a.d is called: str=client_info=%7B%22version%22%3A%2216%22%2C%22os%22%3A%22Android%22%2C%22start_time%22%3A%221783348924685%22%2C%22resume_time%22%3A%221783348924685%22%2C%22channel%22%3A%220%22%2C%22model%22%3A%22Xiaomi%7C%7CM2011K2C%22%2C%22dzt%22%3A0%2C%22loc_per%22%3A0%2C%22uniqid%22%3A%22b93ddbdc-ccbe-4340-be6b-d070f2b1fd3a%22%2C%22oaid%22%3A%22NA%22%2C%22oaid_honor%22%3A%22NA%22%2C%22did%22%3A%22DUOJFPDWDfdBIkVuTvtq-PI5ItdBFw0gaNa9RFVPSkZQRFdEZmRCSWtWdVR2dHEtUEk1SXRkQkZ3MGdhTmE5c2h1%22%2C%22tinker_id%22%3A%22Prod-arm64-v8a-release-14.110.1411010_0629-10-29-16%22%2C%22is_bg_req%22%3A0%2C%22network%22%3A%22wifi%22%2C%22operator%22%3A%22CHN-CT%22%2C%22abi%22%3A1%2C%22version_flag%22%3A%221411010%22%7D&curidentity=0&req_time=1783349112261&uniqid=b93ddbdc-ccbe-4340-be6b-d070f2b1fd3a&v=14.110, str2=null
```

一直跟下去会调用一个native函数

```python
private static native String nativeEncodeRequest(byte[] bArr, String str);
```

然后找一下动态注册的地址，可以用unidbg，和hook注册函数

```python
RegisterNative(com/twl/signer/YZWG, nativeEncodeRequest([BLjava/lang/String;)Ljava/lang/String;, RX@0x4001f6ac[libyzwg.so]0x1f6ac)
```

直接上ida，找到对应函数交叉引用一下，很容易发现一个函数的入参就是它，然后用frida hook一下进一步验证

![image-20260708114646067](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/d893e9a2ea32661c.png)

![image-20260708114738991](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/171ea72e6a6b86d7.png)

找到函数根据LZ4_compress_limitedOutput重命名一下，然后搜一下，知道这里一个压缩的方法，下面的赋值操作应该是自定义文件头，out应该是输出缓冲区

```python
__int64 __fastcall LZ4(__int64 inputs, _DWORD *out, unsigned int len, int size)
{
  __int64 result; // x0
  int v7; // [xsp+8h] [xbp-28h]

  v7 = LZ4_compress_limitedOutput(inputs);
  if ( v7 > 0 )
  {
    *out = 'kcolBPZB';
    out[2] = 0;
    out[3] = v7;
    out[4] = len;
    out[5] = len ^ v7;
    LODWORD(result) = v7 + 24;
  }
  else
  {
    LODWORD(result) = v7;
  }
  return result;
}
```

然后在对out进行交叉引用，很明显就能看到一下函数的入参，然后第一个参数和上面一个函数有关可以看一下

![image-20260708115227909](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/1333ebf9f828b207.png)

```python
RC4_Box(key, s_2, size);
rc4(key, out, out, n32);
```

特征也算是特别明显了，大概率是一个rc4的s_box初始化，s很可能就是密钥

```python
__int64 __fastcall RC4_Box(__int64 result, char *s, int a3)
{
  char v3; // w1
  __int64 v4; // x26
  int i; // w11
  char v6; // w1
  int n256_1; // w14
  unsigned __int8 v8; // w8
  int j; // w26
  unsigned __int8 v11; // [xsp+Ch] [xbp-74h]
  int n256; // [xsp+18h] [xbp-68h]
  unsigned __int8 v13; // [xsp+1Ch] [xbp-64h]

  for ( i = 0; ; ++i )
  {
    while ( y &lt; 10 && y &gt; 9 )
      ;
    if ( i >= 256 )
      break;
    *(result + i) = i;
  }
  n256_1 = 0;
  v8 = 0;
  *(result + 256) = 0;
  for ( j = -401696071; ; j = -401696071 )
  {
    while ( j == -401696071 )
    {
      n256 = n256_1;
      v13 = v8;
      j = -85974536;
    }
    if ( n256 >= 256 )
      break;
    while ( 1 )
    {
      v6 = *(result + n256);
      v11 = s[n256 % a3] + v6 + v13;
      *(result + n256) = *(result + v11);
      *(result + v11) = v6;
      if ( y >= 10 || y <= 9 )
        break;
      v3 = *(result + n256);
      v4 = (v13 + s[n256 % a3] + v3);
      *(result + n256) = *(result + v4);
      *(result + v4) = v3;
    }
    v8 = v11;
    n256_1 = n256 + 1;
  }
  return result;
}
```

剩下这个就是rc4的加密函数了

```python
__int64 __fastcall rc4(__int64 s_box, __int64 inputs, __int64 a3, int len)
{
  int i; // w12
  char v5; // w13
  unsigned __int8 v6; // w12
  unsigned __int8 v7; // w13
  char v8; // w15
  int i_1; // [xsp+Ch] [xbp-4h]

  for ( i = 0; ; i = i_1 + 1 )
  {
    i_1 = i;
    if ( i >= len )
      break;
    v5 = *(s_box + 257);
    v6 = *(s_box + 256) + 1;
    *(s_box + 256) = v6;
    v7 = v5 + *(s_box + v6);
    *(s_box + 257) = v7;
    v8 = *(s_box + v6);
    *(s_box + v6) = *(s_box + v7);
    *(s_box + v7) = v8;
    *(a3 + i_1) = *(s_box + (*(s_box + *(s_box + 257)) + *(s_box + *(s_box + 256)))) ^ *(inputs + i_1);
  }
  return s_box;
}
```

直接dump s_box

```python
S_box = [0xbd, 0x32, 0x03, 0xc7, 0x6c, 0x0e, 0x77, 0xcc, 0xcb, 0x40, 0x97, 0xab, 0x17, 0xcd, 0x6b, 0x7f, 0x25, 0xee,
         0x6f, 0x1a, 0x44, 0x18, 0x89, 0x11, 0xbc, 0xc0, 0x26, 0xfd, 0xac, 0x3a, 0x7e, 0x28, 0x5f, 0xa3, 0xf5, 0x47,
         0xda, 0x2e, 0xfb, 0xd4, 0x2c, 0xaa, 0xdd, 0x88, 0x73, 0xd0, 0x06, 0x46, 0x24, 0xd1, 0xa5, 0x3b, 0xd3, 0xc1,
         0xa4, 0x30, 0xd2, 0x29, 0xaf, 0x87, 0x79, 0x01, 0x7a, 0x22, 0xad, 0x9d, 0x4c, 0x27, 0xdb, 0x5b, 0xf1, 0x43,
         0xea, 0x3d, 0x5e, 0xfe, 0xef, 0xc8, 0x7c, 0x34, 0x5a, 0xde, 0x75, 0x60, 0xae, 0x23, 0x82, 0x0a, 0x9f, 0x48,
         0x1c, 0xe2, 0x6e, 0x61, 0x16, 0x1e, 0x8e, 0xd5, 0xcf, 0xfc, 0xc6, 0xc3, 0x94, 0x5d, 0x71, 0x4e, 0x91, 0x38,
         0x5c, 0x39, 0x4d, 0x58, 0xe6, 0x8a, 0xca, 0x9b, 0x78, 0x65, 0x4b, 0xe0, 0xb9, 0x8b, 0xf8, 0xff, 0xb1, 0x0c,
         0x4f, 0x41, 0x80, 0x15, 0x8c, 0x21, 0x55, 0x56, 0x57, 0xa8, 0x96, 0x90, 0xba, 0xb8, 0x69, 0x1f, 0xc2, 0x98,
         0xb0, 0x09, 0xa9, 0x3f, 0x31, 0x74, 0x37, 0xf6, 0xbf, 0xc9, 0x49, 0xa0, 0x54, 0x13, 0x8f, 0xbb, 0x0d, 0x14,
         0x05, 0xb5, 0xbe, 0x86, 0x1d, 0xa7, 0x36, 0x99, 0xe4, 0x72, 0x0b, 0xc4, 0x20, 0x10, 0x12, 0xf2, 0xd9, 0x42,
         0x2a, 0x64, 0xd6, 0x93, 0xf4, 0x63, 0xe1, 0x0f, 0x51, 0xed, 0x7b, 0x6a, 0x7d, 0x6d, 0xe5, 0x19, 0x50, 0x53,
         0xb7, 0xe9, 0xf3, 0xb6, 0xd7, 0x59, 0xb4, 0xf7, 0xb2, 0x08, 0xd8, 0x3e, 0x33, 0xb3, 0x2b, 0x62, 0x04, 0x8d,
         0x70, 0x95, 0xa1, 0x9e, 0xe8, 0x76, 0xe7, 0xce, 0x84, 0xa2, 0x2f, 0x9c, 0xfa, 0x3c, 0x67, 0x02, 0xa6, 0x83,
         0xf9, 0xdc, 0x9a, 0x2d, 0x45, 0x81, 0xf0, 0x85, 0x4a, 0xe3, 0x00, 0x68, 0xec, 0xdf, 0x07, 0x35, 0x92, 0x66,
         0x1b, 0xc5, 0x52, 0xeb, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x6e, 0x77, 0x48, 0xb3, 0xb5, 0xd9,
         0x54, 0x90, 0x60, 0xeb, 0x4a, 0xde, 0x78, 0x00, 0x00, 0x00, 0x40, 0xab, 0x4a, 0x4a, 0x00, 0x00, 0x00, 0x00,
         0x68, 0x3f, 0x0a, 0x03, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]
```

```python
def rc4(inputs):
    s_box = S_box.copy()
    outputs = [0] * len(inputs)
    for i in range(len(inputs)):
        v5 = s_box[257]
        v6 = (s_box[256] + 1) & 0xFF
        s_box[256] = v6
        v7 = (v5 + s_box[v6]) & 0xFF
        s_box[257] = v7
        v8 = s_box[v6]
        s_box[v6] = s_box[v7]
        s_box[v7] = v8
        part1 = s_box[s_box[257]]
        part2 = s_box[s_box[256]]
        idx = (part1 + part2) & 0xFF
        keystream_byte = s_box[idx]
        outputs[i] = (keystream_byte ^ inputs[i]) & 0xFF

    return outputs
```

然后经过base64就是我们的结果了

```python
RC4_Box(key, s_2, size);
rc4(key, out, out, n32);
size_1 = sub_2EA10(n32);
ptr_2 = malloc(size_1);
base64(ptr_2, out, n32);
```

然后和标准base64对比一下，发现只替换了码表

```python
BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
```

lz4

```python
def LZ4(inputs):
    data = inputs.encode('utf-8')
    original_len = len(data)
    compressed = lz4.frame.compress(data).rstrip(b'\x00')
    compressed_len = len(compressed) - 19
    print(hex(compressed_len))
    header = bytearray(24)
    header[0:8] = b'BZPBlock'
    struct.pack_into('<I', header, 12, compressed_len)
    struct.pack_into('<I', header, 16, original_len)
    struct.pack_into('<I', header, 20, original_len ^ compressed_len)
    header.extend(compressed[19:])
    return compressed
```

整理一下流程

```python
参数封装->lz4压缩->rc4加密->魔改base64编码
```

##### sig

根据开始给出的地方直接定位，然后尝试hook

```python
 private static native byte[] nativeSignature(byte[] bArr, String str);
```

直接hook上一层的，可以直接看到String字符串

```python
    static String signature(String str, String str2) {
        if (!loadSo()) {
            return "";
        }
        try {
            return bytes2String(nativeSignature(str.getBytes("UTF-8"), str2));
        } catch (UnsupportedEncodingException e11) {
            e11.printStackTrace();
            return "";
        }
    }
```

可以看到和sq就是前后加了一点东西，1194187086好像是固定的是对一个字符串crc32的结果，跟一下看看

```python
a.i is called: str=/api/batch/requestsclient_info=%7B%22version%22%3A%2216%22%2C%22os%22%3A%22Android%22%2C%22start_time%22%3A%221783411220252%22%2C%22resume_time%22%3A%221783411220252%22%2C%22channel%22%3A%220%22%2C%22model%22%3A%22Xiaomi%7C%7CM2011K2C%22%2C%22dzt%22%3A0%2C%22loc_per%22%3A0%2C%22uniqid%22%3A%22b93ddbdc-ccbe-4340-be6b-d070f2b1fd3a%22%2C%22oaid%22%3A%22NA%22%2C%22oaid_honor%22%3A%22NA%22%2C%22did%22%3A%22DUOJFPDWDfdBIkVuTvtq-PI5ItdBFw0gaNa9RFVPSkZQRFdEZmRCSWtWdVR2dHEtUEk1SXRkQkZ3MGdhTmE5c2h1%22%2C%22tinker_id%22%3A%22Prod-arm64-v8a-release-14.110.1411010_0629-10-29-16%22%2C%22is_bg_req%22%3A0%2C%22network%22%3A%22wifi%22%2C%22operator%22%3A%22CHN-CT%22%2C%22abi%22%3A1%2C%22version_flag%22%3A%221411010%22%7D&curidentity=0&req_time=1783411794093&uniqid=b93ddbdc-ccbe-4340-be6b-d070f2b1fd3a&v=14.110 1194187086, str2=null
a.i result=V3.0f1121a03da21087afeb5633e5898a6d8 
```

这里拼接了一下strD

```python
byte[] bArrE = com.twl.signer.a.e(yf0.n.h(batchBodyBeanD), secretKey);
            bVar.y(bArrE);
            String strA = com.twl.signer.a.a(bArrE);
            long jElapsedRealtime = SystemClock.elapsedRealtime();
            String strD2 = com.twl.signer.a.d(strD, secretKey);
            g(jElapsedRealtime, str, strD.length());
            bVar.w("sp", strD2);
            if (strD.length() > 0x1388) {
                strD = strD.substring(0x0, 0x1388);
            }
            bVar.w("sig", com.twl.signer.a.i(com.hpbr.bosszhipin.config.m.f(str) + strD + strA, secretKey));
```

直接看strA的结果跟下去就会知道是是一个crc32的运算，而且是标准的

```python
[M2011K2C::com.hpbr.bosszhipin ]-> a.a is called: bArr=-49,10,127,52,36,-47,3
a.a result=1194187086
private static native String nativeCalculateCRC32(byte[] bArr);
```

尝试了一下没定位到直接上unidbg补环境，还挺少的

```java
    @Override
    public DvmObject&lt;?&gt; getStaticObjectField(BaseVM vm, DvmClass dvmClass, String signature) {
        switch (signature) {
            case "com/twl/signer/YZWG->gContext:Landroid/content/Context;":{
                return vm.resolveClass("android/content/Context").newObject(null);
            }
        }
        return super.getStaticObjectField(vm,dvmClass,signature);
    }
    @Override
    public DvmObject&lt;?&gt; callObjectMethod(BaseVM vm, DvmObject&lt;?&gt; dvmObject, String signature, VarArg varArg) {
        switch (signature) {
            case "android/content/pm/PackageManager->getPackagesForUid(I)[Ljava/lang/String;":{
                return new ArrayObject(new StringObject(vm, vm.getPackageName()));
            }
        }
        return super.callObjectMethod(vm,dvmObject,signature,varArg);
    }
    @Override
    public int callIntMethod(BaseVM vm, DvmObject&lt;?&gt; dvmObject, String signature, VarArg varArg) {
        if (signature.equals("java/lang/String->hashCode()I")){
            int i = dvmObject.getValue().toString().hashCode();
            return i;
        }
        return super.callIntMethod(vm, dvmObject, signature, varArg);
    }
```

写一个函数调用一下顺便写一个trace

```java
    public String getSign() throws UnsupportedEncodingException {
        DvmClass CheckSignUtil = vm.resolveClass("com/twl/signer/YZWG");
        String method = "nativeSignature([BLjava/lang/String;)[B";
        String str = "/api/batch/requestsclient_info=%7B%22version%22%3A%2216%22%2C%22os%22%3A%22Android%22%2C%22start_time%22%3A%221783429715302%22%2C%22resume_time%22%3A%221783429715302%22%2C%22channel%22%3A%220%22%2C%22model%22%3A%22Xiaomi%7C%7CM2011K2C%22%2C%22dzt%22%3A0%2C%22loc_per%22%3A0%2C%22uniqid%22%3A%22b93ddbdc-ccbe-4340-be6b-d070f2b1fd3a%22%2C%22oaid%22%3A%22NA%22%2C%22oaid_honor%22%3A%22NA%22%2C%22did%22%3A%22DUOJFPDWDfdBIkVuTvtq-PI5ItdBFw0gaNa9RFVPSkZQRFdEZmRCSWtWdVR2dHEtUEk1SXRkQkZ3MGdhTmE5c2h1%22%2C%22tinker_id%22%3A%22Prod-arm64-v8a-release-14.110.1411010_0629-10-29-16%22%2C%22is_bg_req%22%3A0%2C%22network%22%3A%22wifi%22%2C%22operator%22%3A%22CHN-CT%22%2C%22abi%22%3A1%2C%22version_flag%22%3A%221411010%22%7D&curidentity=0&req_time=1783435136897&uniqid=b93ddbdc-ccbe-4340-be6b-d070f2b1fd3a&v=14.1101194187086";
        byte[] bytes = str.getBytes();
        DvmObject&lt;?&gt; resultObj = CheckSignUtil.callStaticJniMethodObject(emulator, method, new ByteArray(vm, bytes), null);
        if (resultObj instanceof ByteArray){
            ByteArray bytesResult= (ByteArray)resultObj;
            byte[] value = bytesResult.getValue();
            return new String(value,"UTF-8");
        }
        return "";
    }
```

```java
void traceCode(){
    String traceFile = "D:\\unidbg-0.9.8\\unidbg-0.9.8\\unidbg-android\\src\\test\\java\\boss\\getSign.log";
    PrintStream traceStream = null;
    try {
        traceStream = new PrintStream(new FileOutputStream(traceFile), true);
    } catch (FileNotFoundException e) {
        throw new RuntimeException(e);
    }
    emulator.traceCode(module.base, module.base+module.size).setRedirect(traceStream);
}
```

```python
V3.0c54cce74b6d5d969b1abd0e9d825eedf
```

然后搜索最后1字节，定位到这里，然后根据这个地址搜，进一步验证

```python
[13:04:27 689][libyzwg.so 0x01c9a8] [63696a38] 0x4001c9a8: "ldrb w3, [x11, x10]" x11=0xbffff570 x10=0xf => w3=0xdf
```

然后可以看到这个函数，hook一下入参

```python
char *__fastcall sub_1C6E0(_BYTE *ptr, int n)
{
  int n16; // w21
  int v3; // w8
  char *v7; // [xsp+30h] [xbp-F0h]
  _BYTE v8[16]; // [xsp+50h] [xbp-D0h] BYREF
  _BYTE v9[88]; // [xsp+60h] [xbp-C0h] BYREF
  __int64 v10; // [xsp+B8h] [xbp-68h]

  v10 = *(_ReadStatusReg(TPIDR_EL0) + 40);
  v7 = malloc(0x21u);
  sub_2EE84(v9);
  while ( n > 0 )
  {
    if ( n > 512 )
    {
      sub_2EE98(v9, ptr, 512);
      if ( v3 == -381856710 )
        goto LABEL_4;
    }
    else
    {
      sub_2EE98(v9, ptr, n);
    }
    n -= 512;
    ptr += 512;
  }
  md5(v8, v9);                                  // ;关键函数
  n16 = 0;
LABEL_4:
  while ( n16 < 16 )
  {
    snprintf(
      &v7[2 * n16],
      0x20u,
      aDqs9a,                                   // "dqs9A"
      v8[n16]);
    ++n16;
  }
  return v7;
}
```

前面和入参相容的，然后新增了不知道是hash还是啥，trace看一下

```python
size: 900
0000: 2F 61 70 69 2F 62 61 74 63 68 2F 72 65 71 75 65    /api/batch/reque
0010: 73 74 73 63 6C 69 65 6E 74 5F 69 6E 66 6F 3D 25    stsclient_info=%
0020: 37 42 25 32 32 76 65 72 73 69 6F 6E 25 32 32 25    7B%22version%22%
0030: 33 41 25 32 32 31 36 25 32 32 25 32 43 25 32 32    3A%2216%22%2C%22
0040: 6F 73 25 32 32 25 33 41 25 32 32 41 6E 64 72 6F    os%22%3A%22Andro
0050: 69 64 25 32 32 25 32 43 25 32 32 73 74 61 72 74    id%22%2C%22start
0060: 5F 74 69 6D 65 25 32 32 25 33 41 25 32 32 31 37    _time%22%3A%2217
0070: 38 33 34 32 39 37 31 35 33 30 32 25 32 32 25 32    83429715302%22%2
0080: 43 25 32 32 72 65 73 75 6D 65 5F 74 69 6D 65 25    C%22resume_time%
02F0: 6E 69 71 69 64 3D 62 39 33 64 64 62 64 63 2D 63    niqid=b93ddbdc-c
0300: 63 62 65 2D 34 33 34 30 2D 62 65 36 62 2D 64 30    cbe-4340-be6b-d0
0310: 37 30 66 32 62 31 66 64 33 61 26 76 3D 31 34 2E    70f2b1fd3a&v=14.
0320: 31 31 30 31 31 39 34 31 38 37 30 38 36 61 33 30    1101194187086a30
0330: 38 66 33 36 32 38 62 33 66 33 39 66 37 64 33 35    8f3628b3f39f7d35
0340: 63 64 65 62 65 62 36 39 32 30 65 32 31 00 00 00    cdebeb6920e21...
```

hex to str 发现就是我们要的结果

```python
[13:16:54 578] Memory WRITE at 0x40759335, data size = 8, data value = 0x3766393366336238, PC=RX@0x405ac184[libc.so]0x1c184, LR=RX@0x40024354[libyzwg.so]0x24354
[13:16:54 578] Memory WRITE at 0x4075933d, data size = 8, data value = 0x6562656463353364, PC=RX@0x405ac18c[libc.so]0x1c18c, LR=RX@0x40024354[libyzwg.so]0x24354
[13:16:54 578] Memory WRITE at 0x40759345, data size = 8, data value = 0x3132653032393662, PC=RX@0x405ac18c[libc.so]0x1c18c, LR=RX@0x40024354[libyzwg.so]0x24354
[13:16:54 578] Memory WRITE at 0x4075934d, data size = 1, data value = 0x00, PC=RX@0x40023ed8[libyzwg.so]0x23ed8, LR=RX@0x40024354[libyzwg.so]0x24354
```

是一个复制函数，下个断点看看

```python
.text:0000000000024350                 BL              .memcpy
```

```python
mx1

>-----------------------------------------------------------------------------<
[13:21:11 776]x1=RW@0x40753030, md5=0a461c2d0db818ee663f9c7607f4dd08, hex=61333038663336323862336633396637643335636465626562363932306532310000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
size: 112
0000: 61 33 30 38 66 33 36 32 38 62 33 66 33 39 66 37    a308f3628b3f39f7
0010: 64 33 35 63 64 65 62 65 62 36 39 32 30 65 32 31    d35cdebeb6920e21
0020: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0030: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0040: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0050: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
0060: 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00    ................
^-----------------------------------------------------------------------------^
```

接着对0x40753030进行追踪

```python
[13:22:30 314] Memory WRITE at 0x40753030, data size = 8, data value = 0x3236336638303361, PC=RX@0x40029000[libyzwg.so]0x29000, LR=RX@0x40028ff0[libyzwg.so]0x28ff0
[13:22:30 314] Memory WRITE at 0x40753038, data size = 8, data value = 0x3766393366336238, PC=RX@0x40029000[libyzwg.so]0x29000, LR=RX@0x40028ff0[libyzwg.so]0x28ff0
[13:22:30 315] Memory WRITE at 0x40753040, data size = 8, data value = 0x6562656463353364, PC=RX@0x40029000[libyzwg.so]0x29000, LR=RX@0x40028ff0[libyzwg.so]0x28ff0
```

发现是在Jni_onload里面的，并且是对某个数据的rc4，我就没管了，因为这玩意只执行一次我觉得他是固定的，有兴趣可以看看

```python
      RC4_Box(s_box, s, v4);
      rc4(s_box, &inputs_, v13, 32);
      v14 = 0;
      s_1 = malloc(0x21u);
      v6 = v13[1];
      v7 = v13[0];
```

入参已经弄清楚了，这个追踪入参，然后看一下这个函数，进去瞎点点看看

```python
.text:000000000001C958                 BL              md5
```

```python
void __fastcall md5(__int64 ptr, __int64 a2)
{
  unsigned int n0x38; // w8
  int n120; // w9
  unsigned int i; // w12
  _BYTE ptra[8]; // [xsp+10h] [xbp-50h] BYREF
  __int64 v8; // [xsp+18h] [xbp-48h]

  v8 = *(_ReadStatusReg(TPIDR_EL0) + 40);
  sub_33A8C(ptra, a2 + 16, 8u);
  n0x38 = (*(a2 + 16) >> 3) & 0xE000003F;
  if ( n0x38 >= 0x38 )
    n120 = 120;
  else
    n120 = 56;
  sub_2EE98(a2, ::ptr, n120 - n0x38);
  sub_2EE98(a2, ptra, 8u);
  sub_33A8C(ptr, a2, 0x10u);
  for ( i = 0; i < 0x58; ++i )
    *(a2 + i) = 0;
}
```

sub_2EE98

```python
__int64 __fastcall sub_2EE98(_DWORD *n1575040482, _BYTE *ptr, unsigned int n512)
{
  unsigned int v4; // w10
  __int64 v5; // kr00_8
  __int64 n1575040482_1; // x2
  unsigned int i; // w8
  __int64 v10; // [xsp+10h] [xbp-A0h]
  unsigned int v11; // [xsp+18h] [xbp-98h]
  unsigned int i_2; // [xsp+1Ch] [xbp-94h]
  unsigned int v14; // [xsp+30h] [xbp-80h]
  unsigned int v15; // [xsp+38h] [xbp-78h]
  unsigned int i_1; // [xsp+4Ch] [xbp-64h]

  v10 = (n1575040482 + 6);
  v4 = n1575040482[4];
  v5 = 8LL * n512;
  v14 = (v4 >> 3) & 0xE000003F;
  v15 = 8 * n512 + v4;
  n1575040482[4] = v15;
  if ( v15 < v5 )
    ++n1575040482[5];
  n1575040482[5] += HIDWORD(v5);
  if ( 64 - v14 > n512 )
  {
    v11 = (v4 >> 3) & 0xE000003F;
    i_2 = 0;
  }
  else
  {
    sub_2F3C0(n1575040482 + v14 + 24, ptr, 64 - v14, 0xC222DE52LL, 0xD7B3D641LL, 0x56D9A8A1);
    hash(n1575040482, v10, n1575040482_1);
    for ( i = 64 - v14; ; i = i_1 + 64 )
    {
      i_1 = i;
      if ( i + 63 >= n512 )
        break;
      hash(n1575040482, &ptr[i], 3530282178LL);
    }
    v11 = 0;
    i_2 = i;
  }
  return sub_2F3C0(n1575040482 + v11 + 24, &ptr[i_2], n512 - i_2, 0xC222DE52LL, 0xD7B3D641LL, 0x56D9A8A1);
}
```

hash看到4轮密钥，很可能是一个md5啥的(其实，看见是hash算法后，我就拿着明文找个在线网站取测了)，而且还是标准的

```python
  v383 = a2;
  n1575040482_1 = n1575040482_3;
  StatusReg = _ReadStatusReg(TPIDR_EL0);
  v392 = *(StatusReg + 40);
  v389 = 1;
  v390 = y_7 < 10;
  if ( ((v389 | v390) & 1) == 0 )
    goto LABEL_3;
  while ( 1 )
  {
    v185 = *n1575040482_1;
    v186 = n1575040482_1[1];
    v187 = n1575040482_1[2];
    v188 = n1575040482_1[3];
```

![image-20260708133239651](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/4c71726d404a652d.png)

![image-20260708133347706](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/43dcbbe8730a0ad4.png)

```python
    signEnd = binascii.crc32(bytes(sign))
    signBody = "/api/batch/requests" + sqBody + str(signEnd) + "a308f3628b3f39f7d35cdebeb6920e21"
    sign = "V3.0" + hashlib.md5(signBody.encode()).hexdigest()
```

整个流程大概清楚了

##### 响应解密

继续看这个java类非常的友好，nativeDecodeContent名字一看就是解密的

```python
 private static native String nativeCalculateCRC32(byte[] bArr);

    private static native byte[] nativeDecodeContent(String str, String str2);

    private static native byte[] nativeDecodeContent(byte[] bArr, String str, int i11, int i12, int i13);

    private static native byte[] nativeDecodePassword(String str);

    private static native byte[] nativeDecodeRequestBody(byte[] bArr, String str);

    private static native String nativeEncodeData(byte[] bArr, String str);

    private static native String nativeEncodePassword(String str);

    private static native String nativeEncodeRequest(byte[] bArr, String str);

    private static native byte[] nativeEncodeRequestBody(byte[] bArr, String str);

    private static native byte[] nativeSignature(byte[] bArr, String str);
```

然后根据入参定位一下，然后在根据这个函数的入参，继续trace

```python
ptr = lz4(&v57, ptr_1, ptr_4, ptr_11, &v57);// ;这里已经解密了
```

```python
emulator.attach().addBreakPoint(module.base + 0x2765C);
emulator.attach().addBreakPoint(module.base + 0x26354);
emulator.traceWrite(0x40447000,0x40447000 + 0x10);
```

```python
[13:42:54 030] Memory WRITE at 0x40447000, data size = 1, data value = 0x42, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447001, data size = 1, data value = 0x5a, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447002, data size = 1, data value = 0x50, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447003, data size = 1, data value = 0x42, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447004, data size = 1, data value = 0x6c, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447005, data size = 1, data value = 0x6f, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447006, data size = 1, data value = 0x63, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
[13:42:54 030] Memory WRITE at 0x40447007, data size = 1, data value = 0x6b, PC=RX@0x4003476c[libyzwg.so]0x3476c, LR=RX@0x40025c20[libyzwg.so]0x25c20
```

还是rc4

```python
    v10 = strlen(s);
    RC4_Box(s_box, s, v10);
    rc4(s_box, ptr, ptr, len);
    if ( y_107 >= 10 || y_107 <= 9 )
```

```python
def nativeDecodeContent(cont):
    decrypted = rc4(cont)
    length = struct.unpack_from('<I', bytes(decrypted)[16:20])[0]
    lz = lz4.block.decompress(bytes(decrypted)[24:], length)
    text = lz.decode('utf-8')
    print(json.loads(text))
```

流程：rc4解密->lz4解压

参数基本都完成了，看看效果，非常nice

![image-20260708134622402](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/07/183f377edee56120.png)

求一键三连
