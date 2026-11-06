---
title: 【微信】Gist 威胁情报分析：PC 登录器供应链投毒事件
source: https://mp.weixin.qq.com/s/bUQPM1IDAXZHleNu_tSbQg
source_host: mp.weixin.qq.com
clip_date: 2026-11-06T11:32:48+08:00
trace_id: b19499fe-630a-4804-8338-49632dd533a0
content_hash: 41751b50e27e8fcd3b043aaad94a3ac6db64db976f96a7e6ec688aa2e6d80d5e
status: synced
tags:
  - 微信
  - 恶意样本
  - 供应链投毒
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: NIKKE 国际服 PC 登录器遭 CDN 供应链投毒，运行时拉取的 JS 脚本被替换用于投放 K2F LuaJIT 远控木马，卸载游戏无法清除后门。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41075244-d011-811b-ba0d-dd7e81fe69fd
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> NIKKE 国际服 PC 登录器遭 CDN 供应链投毒，运行时拉取的 JS 脚本被替换用于投放 K2F LuaJIT 远控木马，卸载游戏无法清除后门。
> 
> - **攻击手法：** 不篡改本地安装包，登录器每次启动从官方 CDN 动态拉取 4 个 JS 脚本（如 aegis-fix.min.js），被篡改脚本调用登录器自带下载接口拉取 insight.bundle，落地执行 K2F（K2F-chan）远控代理，感染为概率性触发——同一环境 19 次启动仅 3 次成功拉取恶意载荷。
> - **双重持久化：** 路径 A 释放 platform_experience_helper.dll 并注册 CLSID {E77CC89B-7401-4C04-8CED-149DB35ADD04} 随 Chrome 驻留；路径 B 写入 %APPDATA%\nikke_launcher 缓存目录并留下 k2f.agent 标记文件，两者均独立于游戏安装目录，卸载游戏后门仍存活。
> - **危害能力：** 扫描窃取加密货币钱包助记词与私钥，支持攻击者下发 Lua 指令执行任意系统命令；C2 载荷域名 insightjs.com 为攻击者 9 月 27 日抢注的过期域名。
> - **自查 IOC：** 优先检索 Launcher\intl_service\debug.log 中 "k2f_chan registered"、"agent started as" 关键字，核对 tbs_cache 下特定哈希缓存文件（如 dd65fa4d61079e7e_0）及 HKCU 分支 CLSID 注册表项；清理时切勿误删 HKLM 下同名 CLSID。
> - **处置与局限：** 该报告为社区独立分析，IOC 未必覆盖全部变种，杀软初期检出率低；官方补丁仅修复投毒入口，不清理已植入后门，确认中招需手动清除；社区工具 NIKKE-Launcher-Check 可自动化扫描。

**威胁情报Z分析** *2026年11月6日 10:29*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/5d439fef37fffe35.png)

## 一、事件基础背景

## 攻击类型

CDN 供应链投毒（第三方内容分发服务器文件篡改），不是游戏客户端安装包被篡改，是登录器运行时动态拉取的远端 JS 脚本被攻击者替换为恶意版本。

## 时间线（报告梳理）

## 受影响对象

国际服 Windows PC 版 NIKKE 登录器，仅在启动 PC 客户端时存在触发风险；手游、主机版不受本次攻击影响。

## 二、攻击链路（Gist 报告还原完整杀伤链）

## 投递阶段（T1190：通过公开来源投递）

NIKKE PC 登录器每次启动，自动从官方 CDN 拉取 4 个 JS 脚本：aegis‑fix.min.js、vue‑bucket.min.js、images.7fec4c32.js、FeedList.feb647c9.js，被篡改后的脚本嵌入 JS 加载器，不修改本地游戏安装包。

## 下载第二阶段载荷

恶意 JS 调用登录器自带下载接口，拉取攻击者控制资源insight.bundle，落地执行K2F（K2F‑chan）LuaJIT 远控代理；报告指出不是每一次打开登录器都会下载成功，感染存在概率性触发，不是 100% 必中。

## 持久化植入（两条路径）

-   路径 A：Chrome 浏览器扩展 / 辅助组件持久化：释放platform_experience_helper.dll，注册 CLSID 注册表项{E77CC89B‑7401‑4C04‑8CED‑149DB35ADD04}，实现跟随浏览器开机驻留，登录器关闭后门仍然存活。
    
-   路径 B：登录器本地缓存驻留：恶意代码写入%APPDATA%\\nikke_launcher缓存目录（Local‑Storage、Code‑Cache），留下k2f.agent标记缓存文件，卸载游戏也不会自动清理该目录残留。
    

## 数据窃取与远控行为

K2F 代理具备：

-   扫描窃取加密货币钱包助记词、私钥；
    
-   支持攻击者下发 Lua 指令，在受害主机执行任意系统命令；
    
-   日志留下标志性字符串：k2f_chan registered、adopted uuid、agent started as。
    

## 三、Gist 文档内关键 IOC（威胁指标）

## 1\. 日志特征（优先自查）

> 文件路径：NIKKE安装目录\\Launcher\\intl_service\\debug.log关键字：k2f_chan registered、adopted uuid、agent started as，出现即代表 K2F 代理曾经运行过； 路径：Launcher\\log\\tinyget\\，日志出现insight.bundle，代表成功下载恶意载荷。

## 2\. 文件 IOC

Chrome 恶意 DLL：%LOCALAPPDATA%\\Google\\Chrome\\User Data\\PlatformExperienceHelper\\<随机hash>\\platform_experience_helper.dll

登录器恶意缓存目录：%APPDATA%\\nikke_launcher\\tbs_cache\\Local Storage\\leveldb\\（检索字符串k2f.agent）%APPDATA%\\nikke_launcher\\tbs_cache\\Code Cache\\js\\，特定哈希缓存文件名：dd65fa4d61079e7e_0、ce2fd3f1007a9fe9_0、1416c638b3830103_0、fd520c7c0f65c2d7_0。

## 3\. 注册表 IOC

HKEY_CURRENT_USER\\Software\\Classes\\CLSID\\{E77CC89B‑7401‑4C04‑8CED‑149DB35ADD04}

> ⚠️注意：不要误删 HKEY_LOCAL_MACHINE 下同名 CLSID，仅检查 Current‑User 分支。

## 4\. 网络 IOC

恶意 bundle 来源域名：insightjs.com（攻击者在 9 月 27 日抢注过期域名用于 C2 下发载荷）。

## 四、ATT&CK 映射

## 表格

| 战术  | 技术 ID | 技术名称 | 场景  |
| --- | --- | --- | --- |
| 初始访问 | T1190 | 从公开来源投递 | CDN 投毒 JS 脚本下发载荷 |
| 执行  | T1059.004 | Lua 解释器执行 | K2F‑chan LuaJIT 代理执行 |
| 持久化 | T1547.001 | 注册表 Run/CLSID | 注册 COM 组件实现 Chrome 驻留 |
| 持久化 | T1505.003 | 浏览器扩展组件 | Chrome 辅助 DLL 持久化 |
| 数据收集 | T1555.003 | 浏览器凭证窃取 |     |
| 命令与控制 | T1071.001 | Web 协议 C2 | 通过 HTTPS 接收攻击者指令 |

## 五、报告局限性（风险提示）

这份 Gist 属于社区独立分析，非厂商官方报告，IOC 集合是目前已发现样本集合，不代表覆盖全部变种；存在未发现的变体可能没有这些特征，杀毒引擎初期对 K2F 检出率较低。

感染具有概率性：打开登录器不等于一定中招，只有当登录器恰好拉取到被篡改 CDN 脚本、成功下载insight.bundle才会触发，报告提到同一个环境 19 次启动仅 3 次成功拉取恶意负载。

卸载游戏不能清除后门

持久化 DLL、注册表、%APPDATA%缓存独立于游戏安装目录，卸载 NIKKE 后门可继续存活。

## 六、事件处置建议（基于 Gist 报告 + 社区实践）

## 自查

优先检索 debug.log 日志，再核对缓存文件、注册表、Chrome 恶意 DLL；同时社区基于这份 gist 制作了扫描工具：MotherSphere/NIKKE‑Launcher‑Check发布页，可做自动化扫描。

若确认存在 IOC（曾经运行 K2F 代理）

即便官方发布登录器补丁，补丁仅修复CDN 投毒漏洞入口，不能清理已经留在本机的后门。

## 七、情报价值总结

这份 gist 是典型游戏供应链安全事件民间威胁情报样本：攻击入口是游戏登录器动态加载远端脚本，不需要篡改本地安装包，普通玩家很难感知；威胁链混合浏览器 COM 组件做持久化，逃逸常规杀毒。

> 风险点启示：桌面客户端如果运行时无校验直接拉取远端 JS / 脚本执行，一旦 CDN 被劫持篡改，就会形成大规模供应链攻击。
