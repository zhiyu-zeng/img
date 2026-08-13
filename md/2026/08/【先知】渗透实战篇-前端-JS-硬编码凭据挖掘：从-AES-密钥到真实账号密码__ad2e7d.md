---
title: 【先知】渗透实战篇-前端 JS 硬编码凭据挖掘：从 AES 密钥到真实账号密码
source: https://xz.aliyun.com/news/92678
source_host: xz.aliyun.com
clip_date: 2026-08-13T15:47:12+08:00
trace_id: 541840bc-8c6f-4c6b-a696-51f136af4708
content_hash: 71d7ee74d0707a19069ca7243cd44ffef38cbf4e0d6cb3f67196c0e827d402a9
status: synced
tags:
  - 先知
  - 前端安全
  - 协议分析
series: null
feed_source: 先知安全技术社区
ai_summary: |-
  SPA前端JS硬编码的密钥与凭据可直接挖掘：按代码写死的算法解密，再实测连接与读写权限，即可证明漏洞并形成有效报告。
  - **高风险位置：** SPA分离架构下前端JS是公开文件，常藏第三方服务凭据、AES密钥/IV、真实API域名和内网IP；主JS即使大到9.8MB也值得拖下来分析。
  - **挖掘手法：** 用grep抓接口路径和关键词（`aesKey`、`secretKey`、`CryptoJS`、`password`等），并重点检查独立`/envconfig.js`，可一次拿到真实API域名、内网IP和硬编码默认凭据（如`jasperadmin/jasperadmin`）。
  - **解密原则：** 不猜算法，代码里写死什么就用什么；例如给定AES-128-CBC密钥与IV，直接`openssl enc -d -aes-128-cbc -K ... -iv ...`还原；混淆密钥用字节数组XOR某个数即可一行还原。
  - **证据链与验证：** 用“函数名→变量名→使用位置”三层证据链证明凭据归属；必须实测连接MQTT等目标服务，验证CONNACK rc=0，并测订阅/发布权限（ACL可能限制通配符但放行业务主题）。
  - **避坑要点：** 同款AES密钥可能是平台通用模板，需逐实例检查`configVue.js`等配置里有无真实凭据密文，有密文才构成新洞；先判定网关鉴权形态（统一401、自定义403、405、404），避免盲目路由探测浪费时间。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3bb75244-d011-8119-bd9c-ed36091b3b4e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SPA前端JS硬编码的密钥与凭据可直接挖掘：按代码写死的算法解密，再实测连接与读写权限，即可证明漏洞并形成有效报告。
> - **高风险位置：** SPA分离架构下前端JS是公开文件，常藏第三方服务凭据、AES密钥/IV、真实API域名和内网IP；主JS即使大到9.8MB也值得拖下来分析。
> - **挖掘手法：** 用grep抓接口路径和关键词（`aesKey`、`secretKey`、`CryptoJS`、`password`等），并重点检查独立`/envconfig.js`，可一次拿到真实API域名、内网IP和硬编码默认凭据（如`jasperadmin/jasperadmin`）。
> - **解密原则：** 不猜算法，代码里写死什么就用什么；例如给定AES-128-CBC密钥与IV，直接`openssl enc -d -aes-128-cbc -K ... -iv ...`还原；混淆密钥用字节数组XOR某个数即可一行还原。
> - **证据链与验证：** 用“函数名→变量名→使用位置”三层证据链证明凭据归属；必须实测连接MQTT等目标服务，验证CONNACK rc=0，并测订阅/发布权限（ACL可能限制通配符但放行业务主题）。
> - **避坑要点：** 同款AES密钥可能是平台通用模板，需逐实例检查`configVue.js`等配置里有无真实凭据密文，有密文才构成新洞；先判定网关鉴权形态（统一401、自定义403、405、404），避免盲目路由探测浪费时间。

> 很多 SPA 应用把密钥、账号密码直接写在前端 JS 里，想着"加密一下总没人看得懂"。  
> 实际上 webpack bundle 就是公开文件，谁都能下载，密钥和密文放在一起，等于把保险箱钥匙挂在保险箱上。  
> 这篇讲完整挖掘流程：怎么找、怎么解、怎么证明能用。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a7da806ab05f093a.png)

* * *

## 一、为什么看 JS

现在的系统基本都是"前端 SPA + 后端 API"分离架构。前端 JS 是直接下发到浏览器的公开文件，里面经常藏着：

-   第三方服务凭据（MQTT / 数据库 / 消息队列的账号密码）
-   加密密钥（AES key、IV、盐值）
-   后端真实 API 地址（baseURL 经常和页面域名不一样）
-   内网 IP（注释里、配置里）

主 JS 可能几 MB（9.8MB 的 app.js 也见过），但拖下来分析成本很低，收益可能是一个能连上生产消息总线的凭据。

## 二、找凭据特征

先收集 JS 文件：页面源码里找 `<script src=...>` 和 webpack chunk（ `static/js/app.xxx.js` 常是主文件）。然后 grep 特征：

```bash
# 接口路径
grep -oE '"(/)?[A-Za-z0-9_/-]{3,60}"' app.js | sort -u | head -80

# 密钥/凭据关键词
grep -iE 'aesKey|secretKey|CryptoJS|password|token|credential' app.js
```

典型特征：

|     |     |
| --- | --- | 
| 特征  | 样子  |
| 硬编码密钥 | `aesKey = '1234567890ABCDEF'` / `iv = '0123456789ABCDEF'` |
| 加密凭据 | `CryptoJS.enc.Hex.parse('一串hex')` 配合解密调用 |
| 混淆还原 | 字节数组 + `map(i=>String.fromCharCode(i^X)).join("")` 还原密钥 |
| 环境配置 | `/envconfig.js` 独立文件，API 域名+内网 IP+第三方凭据一锅端 |

## 三、解密不猜算法：代码写死什么就用什么

这是最关键的一条。别去猜"是不是 AES-256？是不是 CBC？"，代码里写死了什么就用什么。

某平台的案例：代码里 `CryptoJS.AES.decrypt + mode:CBC + padding:Pkcs7` ，就是 AES-128-CBC。密钥 16 字节 = AES-128。

```python
import binascii, base64, subprocess

key = b'1234567890ABCDEF'   # 代码里的明文密钥，直接放，不用手转 hex
iv = b'0123456789ABCDEF'

def decrypt(hex_str):
    raw_bytes = binascii.unhexlify(hex_str)
    b64_str = base64.b64encode(raw_bytes).decode()
    result = subprocess.run(
        ["openssl", "enc", "-d", "-aes-128-cbc",
         "-K", key.hex(), "-iv", iv.hex(), "-a", "-A"],
        input=b64_str.encode(), capture_output=True)
    return result.stdout.decode()

username = decrypt("密文1hex")
password = decrypt("密文2hex")
print(username); print(password)
```

混淆密钥的还原也简单：字节数组 XOR 某个数，Python 一行出明文：

```python
# JS: const Cl=[32,34,32,33,...], kl=Nl(Cl,18) → AES key
key = "".join(chr(c ^ 18) for c in Cl)
```

## 四、三层证据链：证明凭据是哪个服务的

报告审核必问"这组凭据是哪个服务的？怎么证明？"不能只说"JS 里解出来个密码"。三层证据链：

1.  **看解密代码所在函数名**——比如 `getMQTTURL` ，函数名直译"获取 MQTT URL"
2.  **看解密结果赋值给谁**—— `userName` / `password` 变量
3.  **看最终用在哪**—— `Paho.MQTT.Client.connect({userName, password})` 的认证参数

函数名 → 变量名 → 使用位置，三层下来凭据归属就实锤了。

## 五、验证凭据可用：漏洞成立的关键

拿到凭据不算完，必须实测能连上。MQTT 为例：

```python
import paho.mqtt.client as mqtt

client = mqtt.Client()
client.username_pw_set("admin", "解出的密码")
client.connect("目标IP", 1883, 60)
# CONNACK rc=0 = 认证通过
```

**必须测订阅 + 发布权限** （ACL 可能限制）：

-   订阅 `#` 可能被拒，但 `ems/#` 、 `device/#` 等业务主题可能放行
-   发布 `rc=0` + 订阅端回显 = 读写权限实锤

端口注意：EMQX 1883 是 TCP，8083 是 WebSocket（Path=/mqtt）。客户端推荐 MQTTX 图形界面，截图漂亮。

## 六、防坑：同款密钥 ≠ 新洞

打同一个厂商的第二个实例时，发现同款 AES 密钥别急着当新洞—— **密钥是平台通用模板**，关键看该实例的配置里有没有真实凭据密文：

-   找 `window.global_config` 定义处： `configVue.js` / `configECEMS.js` / `webConfig.js`
-   grep 配置里有没有 `MQTT_UE` / `MQTT_PE` （用户名/密码的 hex 密文）或 `MQTT_USERNAME` / `MQTT_KEY` （明文）
-   **有密文才值得解密**，没有 = 默认模板，不构成新洞

实测某平台第二个实例的 configVue.js 是默认模板（MQTT_URL 是 127.0.0.1 回环地址 + 无凭据字段），凭据未配置，不是新洞。平台通杀类凭据挖掘，必须逐实例验证配置内容。

## 七、扩展：/envconfig.js 一次拿全家桶

Vite 构建的 Vue3 SPA 常把运行时环境配置独立放在 `/envconfig.js` （不打进 bundle），index.html 里加载。这个文件是金矿：

```javascript
window.globalConfig = {
  toolApiUrl: "https://xxx-mes.example.com:8443/api/v1/tool",
  toolWebSocketUrl: "wss://xxx-mes.example.com:8443/ws/v1/tool",
  assets: "https://xxx-mes.example.com:8443/api/mars",
  // pdf: "http://192.168.3.72:8087/api",   ← 注释里的内网IP
  isInternalNetwork: true,
};
```

价值：

-   暴露 **真实 API 域名** （页面域名只是静态壳，API 在另一个域，经 Cloudflare）
-   内网 IP（注释里）
-   同一批 JS 里可能还挖到内网 JasperReports 地址 + **硬编码默认凭据** `j_username=jasperadmin&j_password=jasperadmin`

## 八、网关鉴权形态判定（防浪费时间）

拿到 API 域名后先测鉴权形态，别盲试：

|     |     |     |
| --- | --- | --- |  
| 响应  | 含义  | 怎么办 |
| 统一 401 `Missing Authorization: Bearer` | 网关全保护 | 路由探测无意义，只有拿 token 才有戏 |
| 403 `Missing magic secret header` | 自定义 header 鉴权 | 别盲猜 header 名/值，止损换面 |
| 405 Method Not Allowed | 路径存在仅方法错 | 比 404 强，服务面确认 |
| 404 | 路径不存在 | 换路径 |

401 vs 404 本身就是信息：401 = 服务存在 + 全保护，404 = 不存在。

## 九、SPA 签名 + token 鉴权体系逆向

很多自研 SPA 后端是 `sign签名 + appId + timestamp + authorization` 四件套网关，签名算法、盐值全在前端 JS：

```javascript
// axios 封装里
headers: { authorization: "", appId: "H5", timestamp: parseInt(Date.now()/1e3), sign: ... }
// sign = MD5(JSON.stringify(data) + "&盐值&" + timestamp)   ← 盐值直接写死
```

逆向出签名算法后，就能构造合法请求。 **未授权接口批量筛选法**：对全部接口逐个 POST 空 body `{}` ，看响应区分：

-   `无效token` / status:-5 = **需认证**，无 token 打不动，但这是登录后越权/IDOR 的候选
-   `参数不能为空` / `请选择省份` = **无需 token**，参数校验在前 = 未授权面

## 十、验证码/手机号加密的坑

发码接口参数 mobile 可能不是明文！前端用 AES-ECB 加密后传 hex，直接传明文会报"请输入正确的手机号"（解密失败 = 当空）。必须：

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

enc_mobile = AES.new(key, AES.MODE_ECB).encrypt(pad(mobile.encode(), 16)).hex()
```

发码 sign 常用 `MD5(mobile + "盐值")` ，参数 `{sign, mobile: 加密hex}` 。

## 总结

|     |     |
| --- | --- | 
| 步骤  | 要点  |
| 找   | JS 里 grep 密钥/凭据关键词，webpack bundle 别放过 |
| 解   | 不猜算法，代码写死什么用什么，混淆 XOR 一行还原 |
| 证   | 三层证据链：函数名 → 变量名 → 使用位置 |
| 验   | 实测连接 + 订阅/发布权限，CONNACK rc=0 |
| 避坑  | 同款密钥 ≠ 新洞，逐实例验配置；泄露 key 必须可利用才提交 |
