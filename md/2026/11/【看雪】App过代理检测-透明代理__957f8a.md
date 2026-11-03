---
title: 【看雪】App过代理检测-透明代理
source: https://bbs.kanxue.com/thread-293407.htm
source_host: bbs.kanxue.com
clip_date: 2026-11-03T17:21:30+08:00
trace_id: 0e250a50-12c6-463d-b41a-872729b7b781
content_hash: 727d2033e1fbb3f00aa4da88fea63c9f38c62abbf35c5e6e5dec4bc11d520950
status: synced
tags:
  - 看雪
  - Android逆向
  - 风控对抗
series: null
feed_source: 看雪·Android安全
ai_summary: "**TL;DR：** 梆梆加固 App 检测并无视系统代理，改用 iptables 透明代理 + adb reverse 在内核层把流量改道 Burp，无需任何 hook 即可抓明文 HTTPS。"
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40d75244-d011-81a0-97bf-fe733ce8e868
ioc:
  cves: []
  cwes: []
  hashes:
    - 0a010b05040f070917030106080c0d5b
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 梆梆加固 App 检测并无视系统代理，改用 iptables 透明代理 + adb reverse 在内核层把流量改道 Burp，无需任何 hook 即可抓明文 HTTPS。
> 
> - **必须底层动手：** App 一方面弹 `ProxyAlertActivity` 检测 `http.proxyHost` 等 6 项系统代理属性，另一方面走 native 网络栈直连（`ss` 实测直连 443），即使绕过检测 Burp 也抓不到流量；此前能抓到的只是 WebView/Weex 静态资源。
> - **核心链路：** 关闭系统代理让检测天然通过 → iptables nat 表 OUTPUT 链用 `-m owner --uid-owner` 按 uid 把该 App 的 80/443 REDIRECT 到本地 8080 → `adb reverse tcp:8080` 经 USB 送 Burp，免防火墙规则、不受网段影响。
> - **两个关键坑：** `route_localnet` 默认为 0 不开启则 REDIRECT 到 127.0.0.1 的包被内核静默丢弃；Burp 必须勾选 "Support invisible proxying"，否则 ClientHello 被当 HTTP 请求解析导致连接挂死、App 卡闪屏。
> - **CA 安装：** Android 7+ 用户证书不被信任，需 bind mount 装入系统证书目录（不 remount、不碰 dm-verity），且必须保留原厂 139 张证书，否则正常 HTTPS 全部失败。
> - **Pinning 与二层加密：** SSL Pinning 按 Java 层（hook `X509TrustManager`）→ native 层（ARM64 trampoline）→ 进程内 dump 兜底的顺序处理；应用层 AES 已破解，埋点密钥 `8765432112345678`（CBC/PKCS7、IV 固定硬编码），另一 ECB 密钥解出 HashMap 序列化数据。

> 目标：在\*\*办（梆梆企业版加固）正常联网的前提下，用 Burp 看到明文 HTTP 报文。
> 
> 真机环境：小米9 / MIUI（Android 11）/ 自研内核 root（ShadowCore）  
> 电脑环境：Windows + Burp Suite Pro 2022.2.3  
> 最后验证：2026-11-03 10:50，App 首页/服务/我的全部正常，Burp 持续有流量

* * *

## 0\. 一句话方案

**系统代理关掉（检测天然过）→ iptables 把 App 的 443 在内核层改道到本地 8080 → adb reverse 送到电脑 Burp。**

* * *

## 1\. 为什么不能直接用系统代理

两条都要命：

### 1.1 App 检测系统代理

开系统代理后，启动即弹原生 Dialog：

```python
安全警告
检测到系统代理开启，出于安全考虑请关闭代理后重新启动应用
[退出]                      4秒后自动关闭
```

当前 Activity 直接暴露检测模块：

```python
com.hanweb.android.product.utils.proxy.ProxyAlertActivity
```

检测实现（hook 日志实锤）—— 逐个查 `System.getProperty` ：

```python
http.proxyHost    http.proxyPort
https.proxyHost   https.proxyPort
socksProxyHost    socksProxyPort
```

### 1.2 App 根本不读系统代理

就算绕过检测，Burp 也一条流量都没有。 `ss` 实锤 App 是直连：

```python
jszwfw.activity  192.168.137.60:46580 -> 124.236.19.250:443
jszwfw.activity  192.168.137.60:42808 -> 124.236.19.250:443
jszwfw.activity  192.168.137.60:42822 -> 124.236.19.250:443
jszwfw.activity  192.168.137.60:46580 -> 123.183.232.33:443
jszwfw.activity  192.168.137.60:49918 ->  49.77.204.17:443
```

它走自己的 native 网络栈。所以 **必须在更底层（iptables）动手**。

> 为什么之前 v0.5/v0.6 能抓到 URL？那是 WebView/Weex 加载静态资源  
> （index.js / 图片），走的是 Chromium 自己的代理逻辑，会读系统代理。  
> 真正的业务 API 一直是直连。

* * *

## 2\. 环境准备清单

| 项   | 要求  | 检查命令 |
| --- | --- | --- |
| 手机 root | 可执行 `/data/local/tmp/.cch sh -c '...'` | `adb shell "/data/local/tmp/.cch sh -c 'id'"` |
| adb | 能连上设备 | `adb devices` |
| Burp | 监听 `127.0.0.1:8080` | `Get-NetTCPConnection -LocalPort 8080` |
| openssl / curl | 装 Burp CA 用 | `openssl version` |
| python3 | 跑脚本 | `python --version` |

App 包名与 uid：

```bash
# 包名
com.hanweb.android.jszwfw.activity
# uid（实测 10264，换机/重装可能变，脚本会自动查）
adb shell dumpsys package com.hanweb.android.jszwfw.activity | grep userId=
```

* * *

## 3\. 第一步：Burp CA 装进系统证书

Android 7+ 用户证书不再被 App 信任，必须装进 **system** 证书目录。  
做法是 bind mount（不 remount、不碰 dm-verity）。

### 3.1 从 Burp 下载 CA

```bash
curl -s -o certs/burp_ca.der http://127.0.0.1:8080/cert
```

### 3.2 转 PEM + 按安卓规矩命名

```bash
cd certs
openssl x509 -inform DER -in burp_ca.der -out burp_ca.pem
H=$(openssl x509 -in burp_ca.pem -subject_hash_old -noout | head -1)
cp burp_ca.pem "$H.0"
echo "证书名: $H.0"
```

实测 Burp 2022.2.3 的 hash 是 `9a5ba575` （不同 Burp 版本/CA 会变）。

### 3.3 推送并安装

```bash
adb push certs/9a5ba575.0 /data/local/tmp/ztca.0
adb push certs/cert_setup.sh /data/local/tmp/cert_setup.sh
adb shell "/data/local/tmp/.cch sh -c 'mkdir -p /data/adb; \
  cp /data/local/tmp/cert_setup.sh /data/adb/cert_setup.sh; \
  chmod 755 /data/adb/cert_setup.sh'"
adb shell "/data/local/tmp/.cch sh -c 'sh /data/adb/cert_setup.sh'"
```

`cert_setup.sh` 做的事：把原系统 139 张证书拷进 `/data/adb/cacerts` ，  
再放入我们的 1 张 → `mount -o bind /data/adb/cacerts /system/etc/security/cacerts` 。  
**必须拷全系统证书**，否则 App 里所有正常 HTTPS 全炸。

### 3.4 验证

```bash
adb shell "/data/local/tmp/.cch sh -c 'ls /system/etc/security/cacerts | wc -l'"
# 期望 140（139 原厂 + 1 我们的）

adb shell "/data/local/tmp/.cch sh -c 'grep cacerts /proc/mounts'"
# 期望能看到 bind mount 行

# 指纹必须与本地 CA 一致
adb shell "/data/local/tmp/.cch sh -c 'cat /system/etc/security/cacerts/9a5ba575.0'" > /tmp/dev.pem
openssl x509 -in /tmp/dev.pem -noout -fingerprint -sha256
openssl x509 -in certs/burp_ca.pem -noout -fingerprint -sha256
```

### 3.5 一键脚本

```bash
python burp_proxy.py        # 下载 CA + 装证书 + reverse + 设代理（系统代理模式）
python burp_proxy.py --off  # 清理
python burp_proxy.py --check
```

> 注意： `burp_proxy.py` 走的是 **系统代理** 路线，只适合验证链路。  
> 真正抓苏服办要用第 4 节的透明代理。

* * *

## 4\. 第二步：透明代理（核心）

### 4.1 adb reverse（走 USB，绕开防火墙）

```bash
adb reverse --remove-all
adb reverse tcp:8080 tcp:8080
adb reverse --list        # 应显示 "UsbFfs tcp:8080 tcp:8080"
```

为什么用 reverse 而不是同 Wi-Fi：

-   不需要管理员权限加防火墙入站规则
-   不受 Wi-Fi 隔离 / 网段影响
-   手机侧固定 `127.0.0.1:8080` ，换网络不用改

验证手机侧确实有监听：

```bash
adb shell "/data/local/tmp/.cch sh -c 'ss -tlnp | grep 8080'"
# 期望：LISTEN ... *:8080 ... users:(("adbd",pid=...,fd=...))
```

### 4.2 关键：开 route_localnet

```bash
adb shell "/data/local/tmp/.cch sh -c 'echo 1 > /proc/sys/net/ipv4/conf/all/route_localnet'"
adb shell "/data/local/tmp/.cch sh -c 'echo 1 > /proc/sys/net/ipv4/conf/lo/route_localnet'"
adb shell "/data/local/tmp/.cch sh -c 'echo 1 > /proc/sys/net/ipv4/conf/wlan0/route_localnet'"
```

**默认是 0。不开的话 REDIRECT 到 127.0.0.1 的包会被内核静默丢弃**——  
规则看着加了、计数也在涨，但连接永远建立不起来。

### 4.3 加 REDIRECT 规则

```bash
UID=10264   # 用 dumpsys package 查到的真实 uid

adb shell "/data/local/tmp/.cch sh -c \
  'iptables -t nat -I OUTPUT 1 -p tcp -m owner --uid-owner $UID \
   --dport 443 -j REDIRECT --to-ports 8080'"

adb shell "/data/local/tmp/.cch sh -c \
  'iptables -t nat -I OUTPUT 1 -p tcp -m owner --uid-owner $UID \
   --dport 80 -j REDIRECT --to-ports 8080'"
```

用 `-I OUTPUT 1` 插到最前面，确保优先于系统的 `wmsctrl_nat_OUTPUT` 链。

### 4.4 一键脚本

```bash
python transparent.py on      # 查 uid + 开 route_localnet + 加规则
python transparent.py status  # 看规则/代理/route_localnet/监听
python transparent.py off     # 清规则
```

### 4.5 确认系统代理是关的

```bash
adb shell "/data/local/tmp/.cch sh -c 'settings put global http_proxy :0'"
adb shell "/data/local/tmp/.cch sh -c 'settings delete global http_proxy'"
adb shell settings get global http_proxy      # 期望 null
```

系统代理关着 → `ProxyAlertActivity` 的检测天然通过， **不需要任何 hook**。

* * *

## 5\. 第三步：Burp 必须开的选项

**Proxy → Options → Proxy Listeners → 选中 `127.0.0.1:8080` → Edit  
→ Request handling 标签 → 勾选 "Support invisible proxying (enable only if needed)" → OK**

不开会怎样：Burp 把 TLS ClientHello 当成 HTTP 请求解析，一直等完整  
请求头 → 连接挂死 → 表现为 App 卡在闪屏、8080 上一堆 ESTABLISHED 不释放。

验证 Burp 是否已开（不需要手机）：

```bash
python - << 'EOF'
import socket, ssl
s = socket.create_connection(('127.0.0.1', 8080), timeout=6)
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
try:
    ss = ctx.wrap_socket(s, server_hostname='example.com')
    print("OK 隐形代理已开, 证书长度", len(ss.getpeercert(binary_form=True)))
except Exception as e:
    print("未开:", type(e).__name__, e)
EOF
```

返回证书长度 → 已开；超时 → 没开。

* * *

## 6\. 验证整条链路

### 6.1 重启 App

```bash
adb shell am force-stop com.hanweb.android.jszwfw.activity
sleep 2
adb shell monkey -p com.hanweb.android.jszwfw.activity \
  -c android.intent.category.LAUNCHER 1
sleep 10
```

### 6.2 看规则命中

```bash
adb shell "/data/local/tmp/.cch sh -c 'iptables -t nat -L OUTPUT -v -n | grep REDIRECT'"
```

期望（pkts 会持续增长）：

```python
 pkts bytes target     prot opt in  out  source     destination
    5   300 REDIRECT   tcp  --  *   *    0.0.0.0/0  0.0.0.0/0  owner UID match 10264 tcp dpt:80  redir ports 8080
   55  3300 REDIRECT   tcp  --  *   *    0.0.0.0/0  0.0.0.0/0  owner UID match 10264 tcp dpt:443 redir ports 8080
```

### 6.3 看 Burp 侧连接

```powershell
Get-NetTCPConnection -LocalPort 8080 |
  Where-Object State -ne Listen |
  Group-Object State | Select-Object Name, Count
```

期望有 ESTABLISHED + TIME_WAIT。

### 6.4 最终判据：App 是否正常

-   **App 正常加载** → 链路全通（TLS 握手成功、证书被信任、双向通畅）
-   **App 卡闪屏** → Burp 没勾 invisible proxying，或证书没生效
-   **App 报网络错误** → SSL Pinning 挡了（见第 8 节）

* * *

## 7\. 抓包与收尾

### 7.1 抓包

直接操作 App（点登录、进服务、搜索），Burp 的 HTTP history 就会出现  
`ydzt.jszwfw.gov.cn` 的明文请求。

### 7.2 收尾（务必执行，否则手机全局断网）

```bash
python transparent.py off
adb reverse --remove-all

# 保险起见再确认一次
adb shell "/data/local/tmp/.cch sh -c 'iptables -t nat -S OUTPUT'"
# 期望只剩系统的 wmsctrl_nat_OUTPUT
```

证书可以留着（bind mount 重启后就没了，不影响日常）。

* * *

## 8\. 排障表

| 现象  | 原因  | 解法  |
| --- | --- | --- |
| 规则计数不动 | uid 不对 / 规则位置靠后 | 重新查 uid；确认 `-I OUTPUT 1` |
| 计数在涨但 Burp 无连接 | adb reverse 掉了 | `adb reverse --list` ；手机侧 `ss -tlnp \| grep 8080` |
| 连接建立但立刻断（CLOSE-WAIT） | route_localnet=0 | 按 4.2 开启 |
| App 卡闪屏 | Burp 没勾 invisible proxying | 按第 5 节勾上 |
| App 一开就弹"安全警告" | 系统代理没关干净 | `settings delete global http_proxy` 后确认 `null` |
| App 报网络错误 / 证书错误 | SSL Pinning | 见下方 |
| 部分请求在 Burp 里显示握手失败 | Pinning 做在 native 层 | 见下方 |
| 手机完全没网 | iptables 规则没清 | `python transparent.py off` |

### SSL Pinning 的处理顺序

1.  先确认是不是 Java 层 pinning：Burp 里看该请求是"握手失败"还是"完全没出现"
2.  Java 层：hook `X509TrustManager.checkServerTrusted` 直接返回
3.  native 层（梆梆企业版常见）：需要 native hook（ARM64 trampoline），  
    目前 zthook 还没做到这一层
4.  兜底：进程内 dump（下一节）

* * *

## 9\. 备选：进程内 dump（不依赖 Burp）

如果 pinning 实在绕不过，可以完全放弃 TLS 层，直接在 App 进程里  
拿加解密后的明文：

-   hook `java.net.HttpURLConnection.getInputStream()` / `getOutputStream()`
-   hook App 自己的网络封装类
-   或者利用已抓到的密钥（第 10 节）直接解应用层密文

优点：确定性最高，pinning 完全不影响。  
缺点：看不到原始 HTTP 报文格式（Header、状态码、Cookie 顺序）。

* * *

## 10\. 附：应用层加密（已破解，可离线解密）

即使 TLS 通了，App 的部分业务数据还有 **第二层 AES 加密**。  
下面这些是 v0.5/v0.6 通过 hook `SecretKeySpec` / `Cipher` 拿到的：

| 密钥  | 值   | 算法  | 用途  |
| --- | --- | --- | --- |
| KEY-1 | `8765432112345678` | AES/CBC/PKCS7Padding | 埋点数据加解密 |
| IV  | `0a010b05040f070917030106080c0d5b` | —   | 固定硬编码 |
| KEY-2 | `abcdfe0987612345` | AES/ECB | Java 序列化配置 |

解密示例（Python）：

```python
from Crypto.Cipher import AES
key = b'8765432112345678'
iv  = bytes.fromhex('0a010b05040f070917030106080c0d5b')
pt  = AES.new(key, AES.MODE_CBC, iv).decrypt(cipher_bytes)
```

实测明文（埋点上报）：

```json
[{"page_name":"com.hanweb.android.jszwfw.activity.com.hanweb.android.product.appproject.main.activity.MainActivity",
  "duration":93385,"page_start":1793669055167,"type":0}]
```

KEY-2 解出来是 `java.util.HashMap` 的序列化字节（ `sr java.util...loadFactor...threshold` ）。

* * *

## 11\. 附：相关文件

| 文件  | 作用  |
| --- | --- |
| `transparent.py` | 透明重定向开关（推荐日常用） |
| `burp_proxy.py` | CA 下载 + 装证书 + reverse + 系统代理（链路验证用） |
| `certs/cert_setup.sh` | 设备端证书安装（bind mount，幂等） |
| `certs/install_cert.sh` | 电脑端一键装证书 |
| `src/zthook7.c` | 代理检测 hook（系统代理模式下骗过 ProxyAlertActivity） |
| `src/zthook5.c` / `zthook6.c` | 网络侦察（URL / Cipher / 密钥 / IV / 算法） |
| `04_文档/PROGRESS.md` | 完整进度与踩坑记录（坑 14-17） |
