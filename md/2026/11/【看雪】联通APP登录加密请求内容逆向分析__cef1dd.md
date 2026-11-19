---
title: 【看雪】联通APP登录加密请求内容逆向分析
source: https://bbs.kanxue.com/thread-293526.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-19T08:53:23+08:00
trace_id: 32dfde1a-c5cd-4b2d-8ecb-7ab9c017a674
content_hash: 39f3ed9cf09a58817635e7e2b4d78b4d663a54d2d974a5e0de13f7e9a5475bfd
status: synced
tags:
  - 看雪
series: null
feed_source: 看雪·Android安全
ai_summary: null
ai_summary_style: null
images_status:
  total: 10
  succeeded: 10
  failed_urls: []
notion_page_id: 41d75244-d011-8102-94f5-dc89d924533a
ioc:
  cves: []
  cwes: []
  hashes:
    - 09e3b57adf50cb49866ef0289285a3b7
    - 44aaf21c9211fb0ec53d816fc1ccc1844db2f0389e019e08c75ab766d3c1e0f5
    - 46dae20a8b1e8979d6149d4fd4c7cb8e3faed24b8822a43fc25f9f59c8aec6fe
    - 4fd7f910a9288011c1219461a5bce9e56d95d0439100a318e95ec703e7f4e4e6
    - 60b2fe38b8018f2aad2daa63abe7e1f630aae051b80a9e06e558b67dd5f094ce
    - 66a1f417e921af0bb63d824be6e2c2c64e85f91d94269101c900877cf8fcedc6
    - 6ea68113b2278527d416c778d4f1e0e57b9adc339a339e26e7188566e6f0f1e1
    - 7c8ddc0baa35822de3008441f4ecc6c5
  domains: []
  tools: []
  techniques: []
---

最近想逆向分析一下三大运营APP的各个加密方式，看看孰优孰劣。这篇就先来分析一下联通的加密请求协议，开启抓包工具（我比较喜欢用burp），打开联通APP，进入短信验证登录页面，输入手机号、验证码。点击登录抓包

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f61c50b52fbdc6d7.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e8112dfbf2e26d24.webp)

可以看到，整个请求体是由各个参数拼接而成的，其中只有mobile和password是加密状态，那我们将app直接拖到jadx反编译看看里面到底干了什么

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4f8cdee5b8a783f7.webp) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9b38bc9c5deb08da.webp)

## 二、分析生成逻辑

因为APP是采用梆梆企业版加固，采取整体加固的方式。那我们就对APP进行脱壳（我这里采用的是定制系统脱壳的，整体加固还是比较好脱的，各位可以在github上搜搜相关的），将脱取的dex放入jadx中，搜索mobile和password字段出现的匹配太多了，一个个查看肯定不现实。我这里是直接搜索请求URL里的radomLogin.htm字段，只匹配到了一个，点进去查看哪些函数调用了getRandomLoginURL方法

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33d2f3bb9f0e2dd4.webp)

有两个类调用了它，经过一番查看最后确定参数是由com.sinovatech.unicom.basic.ui.activity.LoginActivity类里面的方法生成的

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7de1362633b2dd95.webp)

通过分析源码最后查看到是由prepareLogin方法对mobile和password进行加密处理的，代码如下

```java
private void prepareLogin(final RequestParams requestParams) {
        if ("".equals(this.accountName)) {
            UIUtils.toast("请输入您的账号");
            return;
        }
        if ("".equals(this.inputPassword)) {
            UIUtils.toast("请输入您的密码");
            return;
        }
        if (!TextUtils.isEmpty(this.accountName) && !TextUtils.isEmpty(this.loginType)) {
            MsLogUtil.d("入口登录---->", "登录LoginActivity,accountName=" + this.accountName + H.d("G258FDA1DB63E9F30F60BCD") + this.loginType + H.d("G2584C012AA318A3BE30FB94CAF") + this.guhuaAreaId);
            if ("4".equals(this.loginType)) {
                ManagerHomeOMO.initOMO(ManagerHomeOMO.getAreaCode(this.guhuaAreaId, this.accountName), "3", "2");
            } else {
                ManagerHomeOMO.initOMO(this.accountName, "2".equals(this.loginType) ? "2" : "1", "2");
            }
        }
        if (!TextUtils.isEmpty(this.accountName)) {
            this.accountName = this.accountName.trim();
        }
        if (!TextUtils.isEmpty(this.accountName)) {
            this.accountName = this.accountName.replace(" ", "");
        }
        this.randomStr = this.random.nextInt(9) + "" + this.random.nextInt(9) + "" + this.random.nextInt(9) + "" + this.random.nextInt(9) + "" + this.random.nextInt(9) + "" + this.random.nextInt(9);
        StringBuilder sb = new StringBuilder();
        sb.append(this.accountName);
        sb.append(this.randomStr);
        String string = sb.toString();
        StringBuilder sb2 = new StringBuilder();
        sb2.append(this.inputPassword);
        sb2.append(this.randomStr);
        String string2 = sb2.toString();
        try {
            requestParams.put(H.d("G648CD713B335"), Base64.encodeToString(RSACryptos.encryptByPublicKey(string.getBytes(Charset.forName(H.d("G5CB7F357E7"))), Base64.decode(H.d("G44AAF21C9211FB0EC53D816FC1CCC1844DB2F0389E019E08C75AB766D3C1E0F560B2FE38B8018F2AAD2DAA63ABE7E1F630AAE051B80A9E06E558B67DD5F094CE46DAE20A8B1E8979D6149D4FD4C7CB8E3FAED24B8822A43FC25F9F59C8AEC6FE4FD7F910A9288011C1219461A5BCE9E56D95D0439100A318E95EC703E7F4E4E66EA68113B2278527D416C778D4F1E0E57B9ADC339A339E26E7188566E6F0F1E166A1F417E921AF0BB63D824BE6E2C2C64E85F91D94269101C900877CF8FCEDC663A1E002A51DAE18EA2BB31AF1FFE6FA5A94FC3E9E018A0B"), 2)), 2));
        } catch (Exception e2) {
            requestParams.put(H.d("G648CD713B335"), EncodeHelper.encodeByAES(string));
            e2.printStackTrace();
        }
        try {
            requestParams.put(H.d("G7982C609A83FB92D"), Base64.encodeToString(RSACryptos.encryptByPublicKey(string2.getBytes(Charset.forName(H.d("G5CB7F357E7"))), Base64.decode(H.d("G44AAF21C9211FB0EC53D816FC1CCC1844DB2F0389E019E08C75AB766D3C1E0F560B2FE38B8018F2AAD2DAA63ABE7E1F630AAE051B80A9E06E558B67DD5F094CE46DAE20A8B1E8979D6149D4FD4C7CB8E3FAED24B8822A43FC25F9F59C8AEC6FE4FD7F910A9288011C1219461A5BCE9E56D95D0439100A318E95EC703E7F4E4E66EA68113B2278527D416C778D4F1E0E57B9ADC339A339E26E7188566E6F0F1E166A1F417E921AF0BB63D824BE6E2C2C64E85F91D94269101C900877CF8FCEDC663A1E002A51DAE18EA2BB31AF1FFE6FA5A94FC3E9E018A0B"), 2)), 2));
        } catch (Exception e3) {
            requestParams.put(H.d("G7982C609A83FB92D"), EncodeHelper.encodeByAES(string2));
            e3.printStackTrace();
        }
        requestParams.put(H.d("G6893C533BB"), this.userManager.getLoginAppId());
        requestParams.put(H.d("G798AC5"), SystemServiceUtils.getLocalIpAddress());
        requestParams.put(H.d("G6090E71FB232AE3BD61994"), String.valueOf(this.userManager.getAutoLoginStatus()));
        if (!this.userManager.getUserPassword().equals("") && !this.userManager.getKeyVersion().equals("") && !this.userManager.getAutoLoginStatus()) {
            requestParams.put(H.d("G6090E71FB232AE3BD61994"), H.d("G7D91C01F"));
        }
        if ("7".equals(this.currentCode)) {
            String string3 = "";
            requestParams.put(H.d("G6A8CD11F"), this.currentCode);
            if ("1".equals(this.loginType)) {
                string3 = this.yanzhengmaeEditText1.getText().toString();
            } else if ("2".equals(this.loginType)) {
                string3 = this.yanzhengmaeEditText2.getText().toString();
            } else if ("3".equals(this.loginType)) {
                string3 = this.yanzhengmaeEditText0.getText().toString();
            } else if ("4".equals(this.loginType)) {
                string3 = this.yanzhengmaeEditText4.getText().toString();
            }
            requestParams.put(H.d("G7C90D0089C3FA53DE30084"), string3);
            requestParams.put(H.d("G608ED41DBA198F"), this.imageId);
        }
        if ("8".equals(this.currentCode)) {
            requestParams.put(H.d("G6A8CD11F"), this.currentCode);
            String string4 = "";
            if ("1".equals(this.loginType)) {
                string4 = this.laxtSixEditText1.getText().toString();
            } else if ("2".equals(this.loginType)) {
                string4 = this.laxtSixEditText2.getText().toString();
            } else if ("3".equals(this.loginType)) {
                string4 = this.laxtSixEditText0.getText().toString();
            } else if ("4".equals(this.loginType)) {
                string4 = this.laxtSixEditText4.getText().toString();
            }
            requestParams.put(H.d("G7C90D0089C3FA53DE30084"), string4);
        }
        requestParams.put(H.d("G6286CC2CBA22B820E900"), this.userManager.getKeyVersion());
        requestParams.put(H.d("G7F86C709B63FA5"), getString(R.string.version_argument));
        requestParams.put(H.d("G6D86C313BC35822D"), DeviceHelper.getDeviceID(true));
        requestParams.put(H.d("G6D86C313BC358826E20B"), DeviceHelper.getDeviceID(true));
        requestParams.put(context.getString(R.string.login_android), DeviceHelper.getAndroidId());
        requestParams.put(H.d("G7C8DDC0BAA35822DE3008441F4ECC6C5"), DeviceHelper.getUniqueIdentifier());
        requestParams.put(H.d("G7A8AD835AF35B928F20182"), DeviceHelper.getLoginSimOperator());
        requestParams.put(H.d("G6786C12DBE29"), DeviceHelper.getNETType(getApplicationContext()));
        requestParams.put(H.d("G6D86C313BC35893BE70094"), DeviceHelper.getDeviceBrand(true));
        requestParams.put(H.d("G6D86C313BC358626E20B9C"), DeviceHelper.getDeviceModel());
        requestParams.put(H.d("G6D86C313BC35841A"), DeviceHelper.getDeviceOSVersion());
        requestParams.put(H.d("G7D8AD81FAC24AA24F6"), new SimpleDateFormat(H.d("G709ACC03921DAF2DCE269D45E1F6")).format(new Date()));
        requestParams.put(H.d("G7991DA0CB63EA82CC5069146F7E9"), this.channelParam);
        if (PushManager.getInstance().isPush()) {
            try {
                requestParams.put(H.d("G7996C6128F3CAA3DE0018245"), DeviceHelper.getDeviceBrand().toUpperCase());
                requestParams.put(H.d("G798FD40EB93FB924D2019B4DFC"), this.preference.getString(H.d("G798FD40EB93FB924D2019B4DFC")));
            } catch (Exception e4) {
                MsLogUtil.d(e4.getMessage());
            }
        }
        requestParams.put(H.d("G7094EA19B034AE"), this.ywMap.get(this.accountName));
        if (URLEnvironmentConfig.isDevelopmentEnvironment()) {
            requestParams.put(H.d("G6396D80A9026AE3B"), H.d("G7D91C01F"));
        }
        if (!SystemServiceUtils.netIsAvailable()) {
            CustomDialogManager.show(this, "", "网络连接失败，请检查网络设置！");
            return;
        }
        this.haveRetryNum = 0;
        this.errorLogBuffer = new StringBuffer();
        this.pd.setMessage("正在登录 请稍候");
        pdShow();
        LoginManager.logOutAndGetConfig(context, this.accountName, requestParams.get(H.d("G6891D01B9C3FAF2C")), new Consumer() { // from class: com.sinovatech.unicom.basic.ui.activity.-$$Lambda$LoginActivity$Tc75MY40nQ2iStqE0q5KVkS8NPU
            @Override // io.reactivex.functions.Consumer
            public final void accept(Object obj) {
                this.f$0.loginHttp(requestParams, false);
            }
        });
    }
```

可以看到mobile和password都是通过手机号或验证码后加6位随机数进行RSA加密发送至服务端的，所以我们只需要找到RSA的公钥即可，这里有两种方法，我依次说一下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a1a825438b8c689b.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/269595f277171be1.webp)

第一种，put函数里面H.d("G648CD713B335")应该放的是mobile字符串才对，它这里用H.d()应该是做了XOR混淆，因为看到后面都有G这个字符，将它去除后“648CD713B335”刚好对应“mobile”，这里可以直接交给AI让它帮你把XOR值给算出来为“ **`09E3B57ADF50`** ”。我们还需要查看XOR值的长度，选一个请求体里面最长的参数进行XOR，最后得出的XOR值为“09E3B57ADF50CB49866EF0289285A3B7”。再将公钥的值放进去，进行还原，最后结果为：

“MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDc+CZK9bBA9IU+gZUOc6FUGu7yO9WpTNB0PzmgFBh96Mg1WrovD1oqZ+eIF4LjvxKXGOdI79JRdve9NPhQo07+uqGQgE4imwNnRx7PFtCRryiIEcUoavuNtuRVoBAm6qdB0SrctgaqGfLgKvZHOnwTjyNqjBUxzMeQlEC2czEMSwIDAQAB”

```python
cipher_hex = (
    "44AAF21C9211FB0EC53D816FC1CCC1844DB2F0389E019E08C75AB766D3C1E0F5"
    "60B2FE38B8018F2AAD2DAA63ABE7E1F630AAE051B80A9E06E558B67DD5F094CE"
    "46DAE20A8B1E8979D6149D4FD4C7CB8E3FAED24B8822A43FC25F9F59C8AEC6FE"
    "4FD7F910A9288011C1219461A5BCE9E56D95D0439100A318E95EC703E7F4E4E6"
    "6EA68113B2278527D416C778D4F1E0E57B9ADC339A339E26E7188566E6F0F1E1"
    "66A1F417E921AF0BB63D824BE6E2C2C64E85F91D94269101C900877CF8FCEDC6"
    "63A1E002A51DAE18EA2BB31AF1FFE6FA5A94FC3E9E018A0B"
)
 
 
key_hex = "09E3B57ADF50CB49866EF0289285A3B7"
 
ct = bytes.fromhex(cipher_hex)
key = bytes.fromhex(key_hex)
 
 
pt = bytes(b ^ key[i % len(key)] for i, b in enumerate(ct))
 
print("XOR 结果:")
print(pt.decode())
```

第二种，直接点击RSACryptos.encryptByPublicKey函数，进入里面，它的公钥直接以硬编码形式存在，但按X查找用例也没函数使用它，可能写代码的人做完XOR混淆后忘记删了吧。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/22a48135272ee1d8.webp)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a6fd431671fc1544.webp)

## 三、脚本复现

```python
import base64, random
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5
 
PUB = """MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDc+CZK9bBA9IU+gZUOc6FUGu7yO9Wp
TNB0PzmgFBh96Mg1WrovD1oqZ+eIF4LjvxKXGOdI79JRdve9NPhQo07+uqGQgE4imwNn
Rx7PFtCRryiIEcUoavuNtuRVoBAm6qdB0SrctgaqGfLgKvZHOnwTjyNqjBUxzMeQlEC2cz
EMSwIDAQAB""".replace("\n", "")
 
key = RSA.import_key(base64.b64decode(PUB))
cipher = PKCS1_v1_5.new(key)
 
rand6 = "".join(str(random.randint(0, 8)) for _ in range(6))
 
def enc(s):
    return base64.b64encode(cipher.encrypt((s + rand6).encode())).decode()
 
mobile   = enc("your phone")
password = enc("your password")
print("mobile  =", mobile)
print("password=", password)
```

这个联通的加密和生成逻辑说实话缺少点强度。
