---
title: 【微信】未知 APT 攻击亚洲政府定制版 Windows 10
source: https://mp.weixin.qq.com/s/eNk3juw4mVldDi5mfbh5sg
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T05:34:20+08:00
trace_id: 569e703a-42e1-4251-a000-4f8c885389cf
content_hash: 17c7d0e973034775c5ce089079ecadef1e99096d45e8cb43b83497b83dfbb247
status: synced
tags:
  - 微信
  - 恶意样本
  - .NET逆向
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 卡巴斯基披露未知 APT 通过 .NET AppDomainManager 注入劫持合法补丁工具 Patch My PC，定向攻击亚洲政府机构的定制版 Windows 10。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 40975244-d011-8131-9aaa-c9bda7d84088
ioc:
  cves: []
  cwes: []
  hashes:
    - 4f28622c5e60c01319bf48cf742fe1a5
    - 514117d536e347560d049cfe0c609632
    - 514ac0d73b8a1b73488ef5e2e55a75c3
    - 67e3617f8709d34f806f8e02badba8a5
    - 9000820d8153c24cd60d53001d3a97b6
    - ab81564bcb8ca7e710c66832de747556
    - b3c4a635179680edafb5d006cf0cffc6
    - c86d53392a87dd3f3e62d62c9b92a9bd
    - cfb8b281bdf5d9390e64b10c312fb2c1
    - e1dc6f1ed193594f2284be22ae08dfa4
    - e4537a1762fcafd2fd96bfc825bad34f9db9a24d
    - f2458ed133f8d0ca19e22c10f577e98e
  domains:
    - openaigpt4v.com
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 卡巴斯基披露未知 APT 通过 .NET AppDomainManager 注入劫持合法补丁工具 Patch My PC，定向攻击亚洲政府机构的定制版 Windows 10。
> 
> - **攻击载体：** 恶意样本封装在 CAB 包内，投放于 Windows 更新下载缓存目录 `C:\Windows\SoftwareDistribution\Download\`，包内大部分为微软签名的合法组件。
> - **隐蔽策略：** 无需替换合法程序，`PatchMyPC-ScriptRunner.exe` 仅作宿主进程，攻击者通过篡改同目录的 .config、fabric.config、Resources.resx 等配置资源文件，即可让正常软件在入口点前加载恶意 .NET 程序集。
> - **受害与归因：** 恶意程序专为政府专用定制 Windows 设计（更新代理日志路径指向 CmitUpdateAgent），基于 KSN 遥测目前仅确认 1 名亚洲受害者，且技术、代码、基础设施均无法关联到任何已知 APT 组织。
> - **C2 基础设施：** 域名 `openaigpt4v[.]com`（C2 路径 `/model_v4/`）注册于 2023 年 9 月 27 日，IP `104.18.14[.]219` 属 Cloudflare CDN，不代表攻击者真实服务器，不宜仅凭 IP 长期封禁。
> - **检测建议：** 重点关注 BinaryFormatter 反序列化、XamlReader 执行、AMSI COM 虚函数表篡改、`COMPlus_ETWEnabled` 修改及日志清理等行为，并将 PatchMyPC-ScriptRunner.exe → 异常 .NET 加载 → dllhost.exe → 外部 HTTPS 通信的进程链组合纳入 EDR 规则，以降低单点监控的高误报。

**独眼情报** *2026年10月30日 15:07*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59c0cb812da49d9b.jpg)

## 一、政府定制版 Windows 10 成为突破口

2026 年上半年，卡巴斯基安全网络在日常威胁狩猎过程中发现一个异常文件。该文件使用.NET 的 AppDomainManager 注入技术，能够在程序正常入口点执行之前加载任意.NET 程序集。

样本被封装在一个 CAB 压缩包中，存放路径为：

```
C:\Windows\SoftwareDistribution\Download\
e4537a1762fcafd2fd96bfc825bad34f9db9a24d
```

这是 Windows 系统更新下载缓存目录。

CAB 文件解压后，包含七个文件，大部分是合法组件，包括第三方补丁管理工具 Patch My PC 的程序文件，以及微软签名的.NET 程序集。

真正承担恶意加载任务的关键文件包括：

```
PatchMyPC-ScriptRunner.exe
PatchMyPC-ScriptRunner.exe.config
fabric.config
Resources.resx
```

其中， `PatchMyPC-ScriptRunner.exe` 本身并不是恶意程序。攻击者利用它作为宿主进程，通过旁边的配置文件改变.NET 程序的启动行为。

这是一种值得注意的隐蔽策略：攻击者不必首先替换合法程序本身，只需要控制程序启动时读取的配置和资源文件，就可以让正常软件执行恶意逻辑。

另一个重要线索是，恶意程序会访问：

```
%WINDIR%\Logs\CmitUpdateAgent\   结合这个路径自行判断是哪个国家
```

这一目录与某种定制 Windows 更新代理有关。结合受害系统的特征，卡巴斯基判断攻击目标是亚洲政府机构使用的专用 Windows 版本。

这使事件的性质超出了普通恶意软件感染。攻击者针对的可能是政府机构特定的软件部署和更新环境。

## 二、目前只有一个已确认目标

卡巴斯基公布的 C2 域名为：

```
openaigpt4v[.]com
```

对应 IP：

```
104.18.14[.]219
```

域名首次发现时间为 2023 年 9 月 27 日，使用 Cloudflare 相关基础设施。

需要注意，Cloudflare CDN 地址并不等于攻击者的真实服务器地址。不能仅凭该 IP 将同一地址上的其他网站或服务认定为攻击基础设施。

卡巴斯基根据 KSN 遥测数据，目前只识别出一个亚洲受害者。

研究人员还发现，恶意程序针对一种政府专用的定制 Windows 系统进行了设计，因此推测受害者属于亚洲政府机构。

但是，报告没有公开具体国家、政府部门或机构名称，需要自行推理，懂得都懂。

攻击者身份同样没有得到确认。卡巴斯基分析了攻击技术、代码相似性和基础设施，仍然无法将其关联到任何已知 APT 组织。

## 三、IOC 与防御建议

建议重点排查

### 1\. 网络 IOC

| 类型  | IOC |
| --- | --- |
| C2 域名 | `openaigpt4v[.]com` |
| IP  | `104.18.14[.]219` |
| C2 路径 | `/model_v4/` |

IP 位于 Cloudflare CDN，建议优先依据域名、历史 DNS、TLS 和 HTTP 行为关联，不宜直接将该 IP 作为长期封禁依据。

### 2\. 文件 Hash

以下为卡巴斯基报告披露的 MD5：

| 文件  | MD5 |
| --- | --- |
| CAB | `F2458ED133F8D0CA19E22C10F577E98E` |
| Resources.resx | `E1DC6F1ED193594F2284BE22AE08DFA4` |
| .NET 1 Loader | `AB81564BCB8CA7E710C66832DE747556` |
| .NET 2 Plugin | `CFB8B281BDF5D9390E64B10C312FB2C1` |
| fabric.config | `67E3617F8709D34F806F8E02BADBA8A5` |
| PatchMyPC-ScriptRunner.exe.config | `514AC0D73B8A1B73488EF5E2E55A75C3` |
| XAML-1 | `514117D536E347560D049CFE0C609632` |
| XAML-2 | `9000820D8153C24CD60D53001D3A97B6` |
| XAML-2-1 | `B3C4A635179680EDAFB5D006CF0CFFC6` |
| XAML-2-2 | `4F28622C5E60C01319BF48CF742FE1A5` |
| XAML-3 | `C86D53392A87DD3F3E62D62C9B92A9BD` |

### 3\. 文件路径

```
C:\Windows\SoftwareDistribution\Download\
C:\Windows\SoftwareDistribution\Download\Install\

PatchMyPC-ScriptRunner.exe.config
fabric.config
Resources.resx
```

### 4\. 建议重点监测的行为

-   PatchMyPC-ScriptRunner.exe 启动时加载异常配置文件。
    
-   非预期程序使用 `AppDomainManager` 加载程序集。
    
-   `Resources.resx` 出现异常 BinaryFormatter 反序列化。
    
-   XAML 通过 `XamlReader.Parse()` 或 `XamlReader.Load()` 执行异常逻辑。
    
-   AMSI COM 对象虚函数表出现异常修改。
    
-   `dllhost.exe` 出现异常.NET 程序集加载和网络通信。
    
-   非预期进程修改 `COMPlus_ETWEnabled` 。
    
-   Windows 更新日志、Prefetch 和 CLR UsageLogs 出现异常删除行为。
    
-   `dllhost.exe` 对外发起访问 `openaigpt4v[.]com` 的 HTTPS 请求。
    

特别建议将以下组合纳入 EDR 检测规则：

PatchMyPC-ScriptRunner.exe → 异常.NET 加载 → dllhost.exe → 外部 HTTPS 通信。

单独监控 `dllhost.exe` 或 Patch My PC 进程，误报可能较多；将进程行为、内存操作、程序集加载和网络通信进行关联，检测价值更高。

-   参考 https://securelist.com/netamloader/121676/
