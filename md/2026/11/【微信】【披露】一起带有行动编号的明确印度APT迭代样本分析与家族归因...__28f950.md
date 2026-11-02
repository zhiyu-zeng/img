---
title: 【微信】【披露】一起带有行动编号的明确印度APT迭代样本分析与家族归因...
source: https://mp.weixin.qq.com/s/wIyObxYAANGLnkBrROe7Sw
source_host: mp.weixin.qq.com
clip_date: 2026-11-02T19:01:29+08:00
trace_id: b9b45091-f1a5-437d-ae98-492b91505326
content_hash: dbe5b3150ae20a8aa73f0af17a243b776c91514a83a5699112c1f3f83504712d
status: synced
tags:
  - 微信
  - 恶意样本
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 印度APT-C-35（肚脑虫）迭代版ShadowAgent木马解密后暴露行动代号"CTD KP"与巴基斯坦政府邮箱，归因于白象/肚脑虫武器共用的新批次样本。
ai_summary_style: key-points
images_status:
  total: 29
  succeeded: 29
  failed_urls: []
notion_page_id: 40c75244-d011-815a-a219-c01fa480acca
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 印度APT-C-35（肚脑虫）迭代版ShadowAgent木马解密后暴露行动代号"CTD KP"与巴基斯坦政府邮箱，归因于白象/肚脑虫武器共用的新批次样本。
> 
> - **配置加密：** 核心配置藏于417字节TYPELIB资源（33字节头+384字节密文），采用自定义AES-256-ECB解密，硬编码密钥为00–1F共32字节，内嵌于函数sub_425590的栈变量中。
> - **归因线索：** 配置暴露行动代号"CTD KP"、Agent名ShadowAgent、联系邮箱kpctd@gov.pk（巴基斯坦政府域名）；与360披露的APT-C-35样本同源，但签名"Just-Work Aps"仍有效，属技术迭代后的不同批次。
> - **通信协议：** 基于IXWebSocket+mbedTLS v3.6.2走wss加密信道（443端口、路径前缀analytics），每5秒轮询{"type":"getCommand"}，消息均为JSON文本帧，支持终端命令执行与文件上传、下载、删除、重命名。
> - **驻留与对抗：** 三重持久化（RunOnce注册表、每日09:00计划任务NVIDIA_taskHost、启动文件夹快捷方式），但因设计缺陷仅一项生效；反调试采用SEH/VEH异常+IsDebuggerPresent组合，并含RDSEED虚拟化检测。
> - **信息收集：** 通过WMI采集计算机名、用户名、系统版本，查询SecurityCenter2获取杀软列表（无则回填"None Detected"），随上线信标一并回传C2。

**问鼎安全应急响应中心** *2026年11月2日 18:21*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4e47276849d8fee2.png)

本文内容仅供学习交流与借鉴，旨在提升安全意识、加强安全防护。请勿用于非法用途，擅自操作后果自负。

本文涉及相关情报细节均为原创披露，非杜撰情节

## 前言

问鼎安全应急响应中心长期深耕高级威胁狩猎与政企单位一线应急响应场景，持续捕获、研判并处置多起 APT 高级持续性威胁入侵事件、定向渗透攻击及高危木马入侵案例，积累了丰富的实战化攻防与溯源取证经验。

本文以一起印度 APT 组织的真实样本事件为例，完整还原从样本分析到确定组织画像的全过程，涵盖样本细节、攻击者样本自身存在的缺陷以及 APT 行动代号等关键信息。全文干货充足、细节详实，建议收藏细读。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/0f4835e6277d3f3f.png)

【下期预告】

一场全球性印度尼西亚DDOS集团的揭秘；从测绘，挖掘到定性的全流程(涉及美国卷宗的全球六百万公网账密租赁集团)。

## APT 家族背景

| 属性  | 详细信息 |
| --- | --- |
| 组织名称 | 白象（Patchwork）/ 肚脑虫（APT-C-35） |
| 组织别名 | 摩诃草、APT-C-09、Hangover、Dropping Elephant 等 |
| 归属国家 | 印度（具有印度国家 / 政府背景） |
| 活跃时间 | 自 2009 年起持续活跃 |
| 主要攻击目标 | 东亚、巴基斯坦等国政府机构、科研教育、军事部门等关键领域，针对政府官员、科研人员、军事机构等敏感目标 |
| 攻击动机 | 网络间谍活动（情报窃取），服务于印度的地缘政治与国家安全利益 |

以上是APT家族背景。

## 样本分析

样本通过钓鱼邮件完成初始投递，此处不再赘述，下面直接进入样本本体分析。

## 3.1 样本可疑资源包

样本中明显包含一个可疑的资源节 TYPELIB，其整体内容加密存储，大概率承载配置或指令参数等关键信息。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e518866e8fd940c3.png)

## 3.2 样本导入表

该样本并未采取自定义加密导入表等加载对抗措施，可直接查看导入表，关键导入项如下：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4a2fc4f7a53650bb.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/970947edcb2ef16f.png)

| 模块  | 关键 API | 用途  |
| --- | --- | --- |
| KERNEL32 | CreateProcessW/A、CreateMutexA、Sleep、GetComputerNameW、GetUserNameW | 进程执行、互斥锁、系统信息收集 |
| ADVAPI32 | RegCreateKeyExA、RegSetValueExA | 注册表持久化 |
| WS2_32 | WSAStartup、socket 系列函数 | 网络通信 |
| WININET | InternetOpenA、HttpSendRequestA | HTTP 信标通信 |
| CRYPT32 / ADVAPI32 | CryptAcquireContextW、BCrypt\* | 加密相关 |
| SHELL32 | SHGetFolderPathA | 启动文件夹路径获取 |
| OLE32 | CoCreateInstance、CoInitializeEx | COM 接口（IShellLink 快捷方式创建） |

部分模块如上。

## 3.3 程序流程

程序启动后先解密内置配置，随后创建全局互斥体以保证单实例运行；接着判断自身是否位于安装路径，若否则复制自身、删除原文件并设置隐藏属性；最后写入三种自启动项并连接 C2。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/eccd8ed13ecff99b.png)

若配置解密失败，程序不会退出，而是使用 localhost:443 作为默认值继续运行。

## 3.4 资源 BLOB 解密

配置密文位于资源 RT_HTML(23)/TYPELIB 中，文件偏移 0x1353E4，共 417 字节：前 33 字节为头部，自第 34 字节起为 384 字节密文。

| 项目  | 详情  |
| --- | --- |
| 算法  | AES‑256‑ECB（自定义实现） |
| 密钥  | 32 字节硬编码 |
| 密钥来源 | 直接内嵌在函数 sub_425590 的栈变量中 |
| 资源类型 | TYPELIB（PE 资源 type=0x17，name="TYPELIB"） |
| 资源大小 | 417 字节 |
| 数据格式 | \[33 字节头部\] + \[AES‑256‑ECB 密文（384 字节 = 24 块 × 16）\] |

完整密钥：

00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C 1D 1E 1F

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c644f4301648865a.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/9974940f273db26e.png)

核心解密逻辑如下：

```makefile
ResourceW = FindResourceW(0, L"TYPELIB", (LPCWSTR)0x17);
if (!ResourceW)
    ResourceW = FindResourceW(0, (LPCWSTR)0x409, (LPCWSTR)0x17);
Resource = LoadResource(0, ResourceW);
v19 = LockResource(Resource); 
v4 = SizeofResource(0, ResourceW); 
v30[0] = 0x03020100;  v30[1] = 0x07060504;
v30[2] = 0x0B0A0908;  v30[3] = 0x0F0E0D0C;
v31_low  = 0x1716151413121110;
v31_high = 0x1F1E1D1C1B1A1918;
v21 = v4 - 33; 
sub_401ED0(v23, v30);  
for (v7 = 0; v7 < v21; v7 += 16) {
    v31 = *(_OWORD *)&v19[v7 + 33];  
    sub_402280(&v31, v23);    
}
sub_4258D0(); 
```

## 3.5 AES-256 密钥扩展

样本进行 AES-256 密钥扩展，将 32 字节密钥扩展为 240 字节轮密钥，过程中使用 S 盒与 Rcon 表。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/09cd06e5693c3ce5.png)

| 参数  | 值   | 说明  |
| --- | --- | --- |
| Nk（密钥字数） | 8   | 32 字节密钥 = 8 个 32 位字 |
| Nr（轮数） | 14  | AES‑256 标准 14 轮 |
| 扩展密钥大小 | 240 字节 | (Nr+1) × 16 = 15 × 16 |
| 循环次数 | 8 → 59 (0x3C) | 60 - Nk = 52 次迭代 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/b61cac763decc4bc.png)

## 3.6 AES 解密

下面进入 AES 解密流程：按 16 字节为步长循环处理，解密结果拼接为字符串后交由配置解析函数处理。

解密流程（逆运算）：

AddRoundKey（第 14 轮密钥，偏移 a2+224 = 14×16） 循环 i = 13 → 0： InvShiftRows（字节逆行移位）

InvSubBytes（使用逆 S-Box 表）

AddRoundKey（第 i 轮密钥，偏移 a2 + 16*i）

InvMixColumns（最后一轮除外）

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4063b2a239070744.png)

解密过程中还需定位以下三张表：

正向 S-Box（密钥扩展用）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c71567b19342ab4f.png)

逆向 S-Box（解密用）：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c4e769202b7c2466.png)

轮常数 Rcon：

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3cbb2be1a546973c.png)

## 3.7 配置解析器解密配置

理解上述流程后即可对配置进行解密，当前配置器字段信息如下：

| JSON 路径 | 对应用途 |
| --- | --- |
| network.domain | C2 服务器域名 |
| network.port | C2 服务器端口 |
| network.https | 是否使用 TLS（wss://） |
| network.prefix | WebSocket URL 路径前缀 |
| identity.project | 项目代号 |
| identity.contact | 联系邮箱 |
| identity.agent_name | Agent 标识 |
| persistence.task_name | 持久化任务名称 |
| persistence.mutex_prefix | 互斥锁前缀 |
| persistence.startup_method | 启动方式标志 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/c9134d50e9adf0d9.png)

直接使用解密脚本输出配置文件，脚本如下：

```python
import pefile
from Crypto.Cipher import AES
AES_KEY = bytes(range(32))
HEADER_SIZE = 33
defextract_typelib_resource(pe_path):
    pe = pefile.PE(pe_path, fast_load=True)
    pe.parse_data_directories(directories=[
        pefile.DIRECTORY_ENTRY['***************']
    ])
for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
if entry.id != 0x17: 
continue
for sub in entry.directory.entries:
for lang in sub.directory.entries:
                rva = lang.data.struct.OffsetToData
                size = lang.data.struct.Size
return pe.get_data(rva, size)
returnNone
defdecrypt_aes_256_ecb(encrypted_data):
    ciphertext = encrypted_data[HEADER_SIZE:]
    ciphertext = ciphertext[:len(ciphertext) - (len(ciphertext) % 16)]
    cipher = AES.new(AES_KEY, AES.MODE_ECB)
return cipher.decrypt(ciphertext)
resource_data = extract_typelib_resource("*****.exe")
plaintext = decrypt_aes_256_ecb(resource_data)
config = plaintext.rstrip(b'\x00').decode('utf-8')
print(config)
```

解密结果为一段 JSON，包含 C2 地址、端口、项目代号、联系人、互斥体前缀、计划任务名等字段：

```json
{
  "network":{
    "domain":"*********.com",
    "port":443,
    "https":true,
    "prefix":"analytics"
  },
  "identity":{
    "project":"CTD KP",
    "contact":"kpctd@gov.pk",
    "process_lock":"hardcoded_lock",
    "cf_uid":"SA",
    "agent_name":"ShadowAgent"
  },
  "persistence":{
    "filename":"CHANGE_THIS.exe",
    "mutex_prefix":"asus_4df7009c18a879e7",
    "task_name":"",
    "startup_method":1,
    "location":1,
    "enable_app_path":true
  }
}
```

**ShadowAgent** 木马的 C2 与持久化配置：

1.  **通信配置**
    
    使用 wss 加密 WebSocket，C2 域名 `******.com` ，443 端口，URL 前缀 `analytics` 。
    
2.  **身份标识**
    
    项目代号 `CTD KP` ，Agent 名称 ShadowAgent；内置硬编码进程锁，标识 `SA` ，预留联系邮箱 `kpctd@gov.pk` 。
    
3.  **持久化配置**
    
    互斥锁前缀 `asus_4df7009c18a879e7` ；启动方式与存储位置标记均为 1，开启 AppPath 持久化；可执行文件名为占位符 `CHANGE_THIS.exe` ，任务名称为空。
    

## 3.8 样本归因

本次样本中所含配置文件与 360 威胁情报中心曾披露的 APT-C-35 印度肚脑虫样本一致，均为 ShadowAgent，且配置文件内容基本一致，样本签名也均为 Just-Work Aps（360 披露样本中签名已失效）。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e5c39372e92ea7a9.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/d0d411149803c452.png)

原文链接如下：

[APT-C-35（肚脑虫）近期针对巴基斯坦新型木马攻击活动分析](https://mp.weixin.qq.com/s?__biz=MzUyMjk4NzExMA==&mid=2247507603&idx=1&sn=af41be456f6393a24771846328e8d7f2&scene=21#wechat_redirect)

但本次样本签名存活，表明该样本同源但属不同批次，且已进行技术迭代。

样本中既往配置仍显示巴基斯坦政府邮箱以及 CTD KP 行动编号，符合印度白象与肚脑虫的长期攻击目标，且两个 APT 组织此前存在武器共用的前例与背景。

## 3.9 反调试机制

该样本使用 SEH/VEH 异常处理 + IsDebuggerPresent 的组合反调试技术，此处简单列举几种反调试机制供参考：

虚拟化检测一：检查是否支持 RDSEED 指令；

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/3fe4c1e02f20ff70.png)

反调试机制二：异常代码和标志由参数 a5、a6 控制。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/59df6c33270fb289.png)

## 3.10 WebSocket 协议特征

| 特征  | 值   |
| --- | --- |
| 库   | IXWebSocket（C++ WebSocket 库） |
| 版本  | WebSocket 13（RFC 6455） |
| 压缩扩展 | permessage‑deflate（WebSocket 压缩扩展） |
| 传输层 | mbedTLS v3.6.2（TLS 1.2 / 1.3） |
| URL 格式 | wss://{domain}:{port}{prefix}?device_token={token} |
| 默认 URL | wss://localhost:443/analytics/stream |

以上为协议特征。

WebSocket 握手请求特征：

```makefile
GET /analytics?device_token={token} HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: {base64_key}
Sec-WebSocket-Version: 13
Sec-WebSocket-Extensions: permessage-deflate
User-Agent: ixwebsocket/{version}
Host: ********.com:443
```

## 3.11 心跳包 / 轮询机制

心跳/轮询特征：

| 参数  | 值   | 说明  |
| --- | --- | --- |
| 轮询间隔 | 5000 ms（5 秒） | Sleep(0x1388) → 0x1388 = 5000 |
| 轮询消息 | `{"type":"getCommand","device_token":"{token}"}` | 请求新命令 |
| 活跃标志 | byte_535420 | 连接活跃时为 1，才会发送轮询 |
| 响应处理 | 命令分发器 | 解析服务器返回的命令 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/82ec4e22b44183bc.png)

轮询循环伪代码：

```swift
while (1) {
if (byte_535420) {  
        wsprintfA(buf, "{\"type\":\"getCommand\",\"device_token\":\"%s\"}", deviceToken);
        sub_413AB0(buf);  
    }
Sleep(5000);  
}
```

## 3.12 通讯格式

所有消息均为 JSON 格式，通过 WebSocket 文本帧传输。

上行消息（受害者 → C2）：

| type 值 | 格式  | 用途  |
| --- | --- | --- |
| getCommand | `{"type":"getCommand","device_token":"%s"}` | 轮询新命令 |
| ack_command | `{"type":"ack_command","device_token":"%s"}` | 确认命令接收 |
| drives | `{"type":"drives","device_token":"..."}` | 驱动器列表 |
| dir_contents | `{"type":"dir_contents","device_token":"..."}` | 目录内容 |
| file_progress | `{"type":"file_progress","session_id":"..."}` | 文件传输进度 |
| serve_started | `{"type":"serve_started","session_id":"..."}` | 文件服务开始 |
| serve_complete | `{"type":"serve_complete","session_id":"..."}` | 文件服务完成 |
| upload_started | `{"type":"upload_started","session_id":"..."}` | 上传开始 |
| upload_complete | `{"type":"upload_complete","session_id":"..."}` | 上传完成 |
| delete_result | `{"type":"delete_result","success":...}` | 删除结果 |
| rename_result | `{"type":"rename_result","success":...}` | 重命名结果 |

下行消息（C2 → 受害者）：

| 标识  | 特征  | 功能  |
| --- | --- | --- |
| "type":"terminal_input" | 含 "input" | 终端命令执行（cmd/psh） |
| "t":"F1A5C3" | 子字段 "a"/"b"/"c"/"d" | 文件操作（下载 / 上传 / 列表 / 删除） |
| "t":"B8C1D2" | —   | PowerShell 执行 |
| "t":"DL_START" | sid | 下载开始 |
| "t":"DL_COMPLETE" | sid | 下载完成 |

## 3.13 TLS 加密层

| 特征  | 值   |
| --- | --- |
| TLS 库 | mbedTLS v3.6.2 |
| 编译路径泄露 | C:\\vcpkg\\buildtrees\\mbedtls\\src\\v3.6.2‑bd2f1f8c2f.clean\\library\\ |
| 支持协议 | TLS 1.2、TLS 1.3 |
| 证书验证 | 自定义验证回调（x509_verify_cert） |
| 密码套件 | mbedTLS 默认套件（含 AES‑GCM、ChaCha20‑Poly1305 等） |
| DTLS 支持 | 代码中含 DTLS epoch 相关字符串 |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/30bc1023ee8d5a5c.png)

## 3.14 系统信息收集

| 收集项 | API | 默认回退值 |
| --- | --- | --- |
| 计算机名 | GetComputerNameW | "UnknownPC" |
| 用户名 | GetUserNameW | "UnknownUser" |
| OS 版本 | RtlGetVersion | "Windows (Unknown Version)" |
| 网络信息 | WMI | {computername}\|{username}\|{os_version} |

以上为系统信息收集。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/33886dd5e7595c21.png)

## 3.15 杀毒软件检测（WMI）

该样本通过 WMI 查询 Windows 安全中心（SecurityCenter2）中的杀毒软件信息。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/1d57109603997023.png)

| 项目  | 值   |
| --- | --- |
| WMI 命名空间 | ROOT\\SecurityCenter2 |
| WQL 查询 | SELECT displayName FROM AntiVirusProduct |
| COM 初始化 | CoInitializeEx(0, COINIT_MULTITHREADED) |
| 提取字段 | displayName |
| 分隔符 | ","（逗号 + 空格） |
| 无杀软回退 | "None Detected" |
| 用途  | 上线信标的一部分（发送给 C2） |

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ad3ad814aa6fbf75.png)

## 3.16 持久化

| 序号  | 机制  | 说明  |
| --- | --- | --- |
| 1   | 注册表 RunOnce | HKCU/HKLM RunOnce\\NVIDIA_taskHost |
| 2   | 计划任务 | schtasks /create /tn "NVIDIA_taskHost" /sc daily /st 09:00 |
| 3   | 启动文件夹快捷方式 | Startup\\NVIDIA_taskHost.lnk（IShellLinkW） |

样本采用三种驻留持久化方式进行，以下为详情：

持久化一：注册表 RunOnce

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/f9060e706848a53e.png)

持久化二：计划任务

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/ee37a77c30d5e6ac.png)

持久化三：启动文件夹快捷方式

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/598eb4d0e2b1f21f.png)

## 3.17 文件操作

| 操作  | 命令标识 | 说明  |
| --- | --- | --- |
| 文件浏览 | dir_contents/drives | 远程文件管理器 |
| 文件下载 | serve_started/DL_START | 从受害者下载到 C2 |
| 文件上传 | upload_started | 从 C2 上传到受害者 |
| 文件删除 | delete_result | 删除指定文件 |
| 文件重命名 | rename_result | 重命名文件 |

以上为文件操作详情。

## 样本总结

本次捕获的是具备印度背景的 APT‑C‑35（肚脑虫）组织的 **ShadowAgent 木马样本**，与白象样本共用，该组织自 2009 年持续活跃，核心目标开展网络间谍情报窃取，服务印度地缘政治利益，重点针对巴基斯坦以及东亚多国政府、军事、科研教育关键单位实施定向攻击。

样本通过钓鱼邮件完成初始投递，经过静态分析、资源解密后得到完整木马配置，配置中暴露出多个关键指向性线索：

**行动代号**：配置内identity.project字段明确标记行动代号为 **CTD KP**，是本次 APT 行动的样本内部既往项目标识；木马 Agent 名称为ShadowAgent，与 360 威胁情报披露的 APT‑C‑35 武器套件同源，属于经过迭代更新的新版本样本。

**关键邮箱线索**：配置字段identity.contact内置联系邮箱 **kpctd@gov.pk**，该邮箱后缀为巴基斯坦政府域名，是攻击者埋入木马配置中的标记信息，侧面印证本次样本曾攻击 **定向针对巴基斯坦相关目标开展情报刺探**。

木马技术能力上采用 AES‑256‑ECB 加密存储核心配置，基于 IXWebSocket+mbedTLS 实现 WSS 加密通信，5 秒心跳轮询 C2 服务器；具备多途径持久化能力（RunOnce 注册表、计划任务、启动文件夹快捷方式），可完成命令执行、文件上传下载、目录遍历等远程控制行为，还会采集主机用户名、计算机名、操作系统、杀毒软件信息回传 C2，并SEH/VEH+IsDebuggerPresent 组合反调试对抗分析。

## 最后

本次拆解的印度APT案例，在溯源归因上比较简单，实际样本中因设计缺陷，驻留项只能生效其一。

与此同时，若企业遭遇未知恶意程序入侵、远控木马、内核级驻留类安全事件包含攻防对抗，APT威胁等场景，均可随时联系我司应急响应团队，7×24 小时提供专业处置支持。

当然我们也开启了中小企业的免费应急响应服务，具体参考前文：

[借此国庆良辰，愿以微光，助君无虞 ！](https://mp.weixin.qq.com/s?__biz=MzcwMTE5Nzg5NQ==&mid=2247484758&idx=1&sn=400575d1efda1b231009094a19fce2b9&scene=21#wechat_redirect)

本次分享为真实实际样本失陷排查，若您感兴趣或遭受相似失陷场景均可联系交流。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/25db60755efadfcc.svg)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/62d2e62874de07b9.png)

```
------THE END------
```

APT事件 · 目录
