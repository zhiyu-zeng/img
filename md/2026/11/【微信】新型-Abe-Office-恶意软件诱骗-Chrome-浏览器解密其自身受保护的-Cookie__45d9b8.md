---
title: 【微信】新型 Abe Office 恶意软件诱骗 Chrome 浏览器解密其自身受保护的 Cookie
source: https://mp.weixin.qq.com/s/GeA4UcDqjTxnzOgfJxStiA
source_host: mp.weixin.qq.com
clip_date: 2026-11-11T10:35:07+08:00
trace_id: dd963144-2c1d-4118-8c1e-bc5e7436d209
content_hash: 3d11b3a3cbc956f5b6f74ecf757a6be018c238f7e27fd9d8598c7963e4a665ed
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41575244-d011-8165-8d98-c0edc090d2a0
ioc:
  cves: []
  cwes: []
  hashes:
    - 3cec97aadc8e0da11e89a4aa454829292599b6b852afa620bb0aa811e9662d71
    - 681293cbcf1436de6d8ae4c358a1e76677593155fe393055376aa535809b5ffd
    - 977f5a0124c4484772517336019d8f9a03d27abf9207b64ff225b7b35c7ff277
    - eda3e8e4e87ccb0423886ae5cfd1d488481d4ce16ab5b5efdfbce6f9f1a35dd9
  domains: []
  tools: []
  techniques: []
---

**暗镜** *2026年11月11日 06:00*

最新分析的远程访问木马伪装成“Abe Office 工作站助手”，它将隐藏的浏览器控制与旨在绕过 Chrome 应用绑定加密的工具相结合。它的浏览器窃取程序不会破解加密技术，而是向 Chrome 注入一个辅助程序，并从受信任的浏览器进程内部请求解密。

提供的分析表明，MalwareHunterTeam 发现了样本 AbeAgent.exe，并指出 Claude 通过 REMnux 虚拟机上的 Claude Code 进行了调查。沙箱测试暴露了交互式操作员活动，尽管研究人员没有观察到窃取 cookie 的组件执行。

AbeAgent.exe 带有以 Kimberley Hankinson 的名义颁发的 SSL.com 代码签名证书，签名日期为 2026 年 11 月 4 日。其浏览器辅助程序也携带相同的证书。签名用于识别签名者并保护文件完整性；但它并不能证明所声称的办公应用程序是合法的。执行后，加载程序会将自身复制到指定位置 `%USERPROFILE%\AbeOffice\` ，移除“Mark of the Web”，并通过“Abe Office Sync”运行值和计划任务建立持久性。两者都使用. 启动可执行文件 `--autostart` 。

三个加密插件提供操作功能：AbeCapability.dll 处理 RAT 功能，AbeHvcn.dll 提供隐藏的桌面访问和注入，AbeBrowserShim.dll 请求浏览器密钥解密。尽管加载器需要从其服务器获取解锁密钥，但研究人员使用嵌入的默认密码离线恢复了它 `AbeOffice-ChangeMe` 。同一个密码是网络加密的基础，使得截获的通信内容能够被解密。Google 在 Chrome 127 中为 Windows cookie 引入了应用绑定加密。其特权服务会在发布受保护数据之前验证请求应用程序，从而防止无关应用程序轻易解密 Chrome 的机密信息。

VirusTotal 关联分析将 133 个文件与基础架构连接起来，但这些链接并不能证明每个文件都具有相同的功能。防御者应调查 AbeOffice 目录、其持久性痕迹、与两个服务器的连接、浏览器注入以及使用 `--window-position=-32000,-32000`.

本地主机远程调试需要与可疑的父进程进行关联，而不是单独进行分类。对于已确认的感染，隔离终端，撤销浏览器会话，并从干净的设备重置重要凭据。交付方式仍不清楚，相关引导加载程序和归档包之间的疑似关系仍未得到证实。观察到的活动支持以凭证为中心的攻击行为，但攻击来源和完整的感染链仍未确定。来自受害者设备的会话访问不应被视为必然可信。

## 相关IOC

| 类型  | 价值  | 备注  |
| --- | --- | --- |
| SHA256 | `eda3e8e4e87ccb0423886ae5cfd1d488481d4ce16ab5b5efdfbce6f9f1a35dd9` | AbeAgent.exe |
| SHA256 | `977f5a0124c4484772517336019d8f9a03d27abf9207b64ff225b7b35c7ff277` | AbeCapability.dll（主 RAT） |
| SHA256 | `3cec97aadc8e0da11e89a4aa454829292599b6b852afa620bb0aa811e9662d71` | AbeHvcn.dll（隐藏的桌面） |
| SHA256 | `681293cbcf1436de6d8ae4c358a1e76677593155fe393055376aa535809b5ffd` | AbeBrowserShim.dll（已签名） |
