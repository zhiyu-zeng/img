---
title: 【微信】起底黑产入侵iPhone 无感盗U程序
source: https://mp.weixin.qq.com/s/BcGEfmOZRbSjb-0HRSoFWQ
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T15:41:08+08:00
trace_id: 4fda6552-243c-4a96-bb60-9198b83c3664
content_hash: 128c720c0a980efd8176202077f6806e6e12026f1874f0b9ac5467152391caf7
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40c75244-d011-816c-8e7d-f9238f3593ce
ioc: null
---

**安全社** *2026年11月2日 14:58*

本文仅分析非法程序的功能以及对非法程序的代码审计，提高iPhone用户的网络安全意识，守护公民的财产安全。对于Ai的崛起，曾经普通人遥不可及的点个链接就被入侵的事，已经开始变得普遍。

* * *

## 1\. 程序介绍

本文分析一套黑产专用的 iOS 定向入侵与数据窃取系统，由漏洞投递服务、C2 管理后台和载荷库三部分组成：

-   **`exploit_server.py` （漏洞投递服务，默认 `0.0.0.0:7070` ）**：向目标 iPhone 投递 Safari 浏览器漏洞利用链，实现"点开一条链接即可入侵"。
    
-   **`admin/` （C2 管理后台，FastAPI/uvicorn，默认 `7000` ）**：负责设备管理、命令下发、窃取数据回传查看、多代理分级运营与审计。
    
-   **`payloads/` （载荷库）**：按 iOS 版本分组的二进制利用载荷（`.dylib` /`.bin` ），对应 Stage1→Stage2→Stage3 利用链。
    

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/98103036c5441694.png)

### 1.1 入侵方式

受害者仅需用 iPhone 的 Safari 浏览器访问一条投递链接（落地页，形如 `/ch/<slug>?tpl=<slug>` ），即可在 **无需感知、无需授权** 的情况下触发浏览器漏洞利用链。设备随后回连 C2 后台并被注册为受控设备，管理员即可远程下发命令、窃取数据——即"跳一条链接即可入侵 iPhone"。

### 1.2 入侵后可执行的操作

受控后可远程窃取钥匙串账号密码、WiFi 密码、通讯录、短信/iMessage、通话记录、相册照片、任意文件、加密货币钱包、GPS 定位、iCloud 令牌、浏览器数据；并支持远程执行 Shell 命令、截图、拍照、录音、读剪贴板、安装持久化后门、清除痕迹等（详见第 4 章功能概览）。

### 1.3 支持入侵的系统版本

通过对本套源码及其他多套同款源码的分析，其对全新系统（iOS）的支持范围与入侵时效如下：

**访问 10–15 秒即可受控**：

-   iOS 13：13.0、13.1、13.1.1、13.1.2、13.1.3、13.2、13.2.2、13.2.3、13.3、13.3.1、13.4、13.4.1、13.5、13.5.1、13.6、13.6.1、13.7
    
-   iOS 14：14.0、14.0.1、14.1、14.2、14.2.1、14.3、14.4、14.4.1、14.4.2、14.5、14.5.1、14.6、14.7、14.7.1、14.8、14.8.1
    
-   iOS 15：15.0、15.0.1、15.0.2、15.1、15.1.1、15.2、15.2.1、15.3、15.3.1、15.4、15.4.1、15.5、15.6、15.6.1、15.7、15.7.1、15.7.2、15.7.3、15.7.4、15.7.5、15.7.6、15.7.7、15.7.8、15.8、15.8.1、15.8.2、15.8.3、15.8.4、15.8.5、15.8.6
    
-   iOS 16：16.0、16.0.1、16.0.2、16.0.3、16.1、16.1.1、16.1.2、16.2、16.3、16.3.1、16.4、16.4.1、16.5、16.5.1、16.6、16.6.1、16.7、16.7.1、16.7.2、16.7.3、16.7.4
    
-   iOS 17：17.0、17.0.1、17.0.2、17.0.3、17.1、17.1.1、17.1.2、17.2、17.2.1
    

**访问 1–3 分钟可受控**：

-   iOS 18：18.5、18.6、18.6.1、18.6.2、26.0.1、26.0.2、26.1.0
    

### 1.4 支持窃取的加密货币钱包

共支持以下加密钱包的窃取：Bitget Wallet、Coin98、Coinbase Wallet、Exodus、Krystal、MetaMask、MyTonWallet、Phantom、Ronin、Solflare、Tonhub、Tonkeeper、TronLink、Uniswap、OKX、Bitpie、imToken、TokenPocket、Trust Wallet。

一旦入侵，后台可自动化无感盗取虚拟货币！

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1ea719a5ed020b42.png)

* * *

## 2\. 反击源码以及源码分析

让我们来看看，黑产入侵iPhone 无感盗U的程序，是否能防的住外部攻击。本次我们在多套入侵iPhone系统中，选择了一套搭建并分析，以及挖掘漏洞进入后台，拿到这套程序的服务器权限。以下为代码审计和本地搭建演示。

### 2.1 静态文件直读（server/exploit_server.py）

`DarkSwordHandler` 继承 `SimpleHTTPRequestHandler` ，并实现了对 **项目根目录任意文件** 的无鉴权直读。关键代码：

```python
# exploit_server.py
def _try_serve_static_file(self, rel_path: str) -> bool:
    rel = sanitize_path(rel_path)
    if not rel:
        rel = "index.html"
    candidates = []
    candidates.append(PAYLOADS_DIR / rel)          # server/payloads/<rel>
    candidates.append(PROJECT_ROOT / rel)          # server/<rel>   ← 任意文件
    for candidate in candidates:
        ...
        if resolved.exists() and resolved.is_file():
            with open(resolved, "rb") as f:
                data = f.read()
            ...  # 直接返回文件内容
            return True
    return False
​
def do_GET(self) -> None:
    ...
    rel = norm_log.lstrip("/")
    # 直接命中：GET /payloads/manifest.json、/admin/.env、/darksword.db、/admin/config.py
    if self._try_serve_static_file(rel):
        return
    # 还通过 /ch/<slug>、/if/<slug>、/t/<slug> 三段式兜底直读
    if (norm_log.startswith("/ch/") or norm_log.startswith("/if/") or norm_log.startswith("/t/")):
        _parts = norm_log.split("/", 2)
        if len(_parts) >= 3 and _parts[2]:
            _candidate_rel = _parts[2]
            if "." in _candidate_rel:              # 含扩展名即尝试
                if self._try_serve_static_file(_candidate_rel):
                    return
```

由于 `PROJECT_ROOT / rel` 直接做文件拼接与存在性检查，且未对 `.env` 、 `*.py` 、 `*.db` 等敏感文件做拒绝名单，任何一个在 `server/` 目录下的文件都可被无认证读取。 `sanitize_path` 会剥掉 `../` ，但 **目标文件本就位于项目根内**，无需穿越即可命中（如 `/admin/.env` 、 `/darksword.db` ）。

### 2.2 JWT 签发信任随包密钥（server/admin/config.py + server/admin/auth.py）

-   `config.py` 从 `admin/.env` 读 `SECRET_KEY` ，仅黑名单 `{"darksword_secret_key_change_me", "change_me", "secret", ""}` 等 **弱值**，但 **部署时若直接沿用随包 `.env` ，则该随机密钥即对外泄露（见 §3 ①）**。
    
-   `auth.py` 的 `get_current_user` 校验逻辑：
    

```python
payload = jwt.decode(resolved, SECRET_KEY, algorithms=[ALGORITHM])   # 仅验签 + exp
if payload.get("type") == "agent":      # 只拒绝 agent 类型
    raise cred_exc
username: str = payload.get("sub")
...
token_version = payload.get("ver", 0)
...
if int(token_version) != int(db_ver):   # 必须与 DB 一致
    raise cred_exc
```

即 **只要拿到 `SECRET_KEY` 且猜对该用户的 `ver` （token_version）**，即可伪造任意用户的合法会话。 `ver` 是 DB 内递增整数（初始 0，logout/force-logout 后 +1），攻击者可离线遍历 `ver=0..N` 构造 token 逐一验证，成本极低。

### 2.3 致命组合

| 步骤  | 前置  | 结果  |
| --- | --- | --- |
| ①   | 前台未认证 `GET /admin/.env` | 拿到生产 `SECRET_KEY` |
| ②   | 用 `SECRET_KEY` 离线伪造 `admin` JWT（遍历 `ver` ） | 获得合法 admin 会话 |
| ③   | 伪造 token 请求 `GET /api/auth/me` | `HTTP 200` ，后台管理员权限 |

* * *

## 3\. 实际利用验证

> 以下所有请求均为 **未认证** 状态完成，未使用任何默认/已知密码。

### 3.1 完整利用链时序

| #   | 操作  | 请求  | 响应  |
| --- | --- | --- | --- |
| 1   | 确认漏洞面 | `GET http://127.0.0.1:7070/` | `HTTP 200` `SimpleHTTP/0.6 Python/3.8.10` ，落地页「欢迎」 |
| 2   | ①任意文件读 `.env` | `GET http://127.0.0.1:7070/admin/.env` | `HTTP 200` ， `SECRET_KEY=fmFc...sqdQ` （生产） |
| 3   | ②伪造 admin JWT | 本地 HS256 签名， `ver=2` | token 生成 |
| 4   | ③验证会话 | `GET :7000/api/auth/me` （ `Authorization: Bearer <token>` ） | `HTTP 200 {"id":1,"username":"admin","role":"admin",...}` |
| 5   | 后台枚举 | `GET /api/users` 、 `/api/devices` 、 `/api/exfil` 、 `/api/settings` | 全量数据 + admin 全权限5 |
| 6   | 后台RCE | 略   | 略   |

## 4\. 后台功能概览（攻击者拿下后台后可执行的操作）

以下基于 `server/admin/routers/` 源码分析，描述攻击者以 `admin` 身份登录后台后可对已控设备执行的操作。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad604c5288c2ce2a.png)

### 4.1 设备管理

-   **设备列表与详情**：查看所有受控设备（iPhone/iPad），含 UUID、IP、地理位置、设备型号、芯片、iOS 版本、Safari 版本、越狱状态等指纹信息。
    
-   **设备分组/批量操作**：创建分组、批量分配渠道/模板、批量启用/禁用、批量删除设备。
    
-   **设备上线通知**：新设备上线或离线重连时自动产生通知。
    

### 4.2 命令下发（commands.py 白名单命令体系）

后台通过 `POST /api/commands` 向受控设备下发预定义命令（命令名须在 `ALLOWED_CMD_PREFIXES` 白名单内），涵盖以下类别：

| 类别  | 示例命令 | 功能描述 |
| --- | --- | --- |
| 系统信息 | `ds_info` 、 `system.info` | 获取设备型号、系统版本、硬件信息 |
| 钥匙串窃取 | `dump_keychain` 、 `ds_exfil_keychain` | dump iOS Keychain 中所有账号密码、证书、密钥 |
| WiFi 密码 | `dump_wifi` 、 `ds_exfil_wifi` | 导出设备保存的全部 WiFi SSID 及密码 |
| 通讯录 | `dump_contacts` 、 `ds_exfil_contacts` | 窃取全部联系人（姓名、电话、邮箱等） |
| 短信/iMessage | `dump_sms` 、 `ds_exfil_sms` | 窃取全部短信和 iMessage 记录 |
| 通话记录 | `ds_exfil_calls` | 窃取全部通话记录 |
| 相册/截图 | `dump_photos` 、 `screenshot` 、 `camera_snap` | 窃取相册照片、远程截图、远程拍照 |
| 文件操作 | `file_read` 、 `file_search` 、 `file_upload` 、 `file_download` | 读取/搜索/上传/下载设备中文件 |
| 钱包/加密货币 | `scan_wallets` 、 `ds_exfil_wallet` | 扫描并导出加密货币钱包数据 |
| 定位  | `dump_location` 、 `ds_geo` | 获取设备 GPS 定位信息 |
| iCloud Token | `dump_icloud_token` | 窃取 iCloud 登录令牌 |
| 浏览器数据 | `ds_history` 、 `ds_browser` | 窃取 Safari 浏览历史、Cookie 等 |
| 邮件/备忘录 | `dump_email` 、 `dump_notes` | 窃取邮件和备忘录内容 |
| Shell 执行 | `exec_shell` 、 `ds_exec` | 在设备上执行任意 Shell 命令 |
| 进程控制 | `list_processes` 、 `kill_process` 、 `list_installed_apps` | 枚举/终止进程、列出已安装 App |
| 网络侦查 | `network_connections` 、 `wifi_scan` | 查看网络连接状态、扫描周边 WiFi |
| 剪贴板 | `clipboard_read` | 读取剪贴板内容 |
| 麦克风 | `mic_record` | 远程录音 |
| 持久化控制 | `install_persist` 、 `persist_check` 、 `persist_remove` | 安装/检查/清除持久化后门 |
| 自毁  | `self_destruct` | 清除痕迹、移除植入 |
| UI 弹窗 | `ui.alert` 、 `ui.notify` 、 `ui.vibrate` | 在目标设备上弹出提示框/通知/振动 |

**注意**：命令下发的 **前置条件是设备已完成 exploit（ `exploit_status=success` ）**，仅 UI 类命令可在 exploit 前通过 Safari 层执行。

### 4.3 数据回传查看（Exfil）

后台通过 `GET /api/exfil` 等接口，按类别查看设备回传的全部窃取数据：

-   **keychain**— 钥匙串账号密码
    
-   **wifi**— WiFi 网络凭证
    
-   **contacts**— 通讯录
    
-   **sms**— 短信/iMessage
    
-   **calls**— 通话记录
    
-   **photos**— 照片/截图
    
-   **files**— 任意文件
    
-   **wallets**— 加密钱包数据
    
-   **location**— 位置信息
    
-   **system_info**— 系统信息
    
-   **browser**— 浏览器数据
    
-   支持文件下载（ `/api/exfil/{id}/download` ）和批量删除
    

### 4.4 脚本系统

-   可创建预定义 **命令脚本** （ `CommandScript` ），将多条命令组合为一个脚本。
    
-   脚本可 **一键批量下发** 到多个在线设备（ `POST /api/commands/scripts/{id}/run` ），实现批量窃取。
    

### 4.5 多代理/多用户体系

-   支持创建子代理（Agent）账号，分配设备额度、佣金比例，实现"分级运营"。
    
-   每个代理可拥有独立的渠道（Channel）和落地页模板（Template），用于追踪不同投放来源。
    

### 4.6 漏洞利用链投递（exploit_server）

-   `exploit_server.py` （7070 端口）负责向目标 iPhone 投递 **Safari 浏览器 0-day / N-day exploit** （Stage1→Stage2→Stage3 payload 链）。
    
-   支持 iOS 13.0 ~ 17.2（见 `SUPPORTED_IOS_VERSIONS` ）。
    
-   落地页通过渠道 slug 和模板 slug 生成访问链接（ `/ch/<slug>?tpl=<slug>` ），目标打开后自动触发 exploit 链。
    

* * *

## 7\. 如何守住自己的iPhone

及时更新IOS系统即可
