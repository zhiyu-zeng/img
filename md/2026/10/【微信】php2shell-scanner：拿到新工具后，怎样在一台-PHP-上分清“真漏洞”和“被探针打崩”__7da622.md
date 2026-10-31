---
title: 【微信】php2shell-scanner：拿到新工具后，怎样在一台 PHP 上分清“真漏洞”和“被探针打崩”
source: https://mp.weixin.qq.com/s/f8M3jhR0krt9y2-4XJZ4qw
source_host: mp.weixin.qq.com
clip_date: 2026-10-31T09:22:43+08:00
trace_id: 87480840-a3f2-4cbd-b34d-a6010a69a7e7
content_hash: 37e0114b95ce65f7650dbb4c9b9d5a4e3b701a731ba03827d3b72a058dfcdef3
status: synced
tags:
  - 微信
  - 漏洞分析
  - 安全工具
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Assetnote 的 php2shell-scanner 用分层 multipart 探针检测 PHP 两个 CVE，作者在本地 8.5.11/8.5.12 靶场验证判定差异并给出误报排除方法。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 40a75244-d011-819e-b971-c3b24758713b
ioc:
  cves:
    - CVE-2026-109618
    - CVE-2026-109619
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> Assetnote 的 php2shell-scanner 用分层 multipart 探针检测 PHP 两个 CVE，作者在本地 8.5.11/8.5.12 靶场验证判定差异并给出误报排除方法。
> 
> - **工具原理：** php2shell-scanner 由 Assetnote 于 2026 年 10 月 22 日发布，检测 CVE-2026-109618（请求处理内存耗尽）和 CVE-2026-109619（跨请求全局状态残留），不执行命令、不写文件；先发小对照请求，再按 1/8/20 MiB 三档发探针，单路径流量约 29 MiB。官方修复版本为 8.2.35、8.3.36、8.4.27、8.5.12。
> - **靶场验证：** 在 Windows 便携 PHP 上搭了配置完全一致（memory_limit=128M、post_max_size=32M）的两个本地靶场：8.5.11 被 1 MiB、4000 part 的第一档探针打出空 500（对照请求正常）判 VULNERABLE 并提前停止；8.5.12 返回 200 判 FIXED，退出码 0。
> - **判定逻辑：** 结论依赖“对照正常 + 探针空 500 + 符合 PHP 解析异常特征”的组合差异，单独的版本头或状态码都不足为凭；检测命中不等于可利用，利用能力与权限需另做授权测试和根因分析。
> - **误报排查：** 探针超 memory_limit 时已修复版本也可能空 500（作者复现过 8.4.27 在 2M–32M 下的误报）；WAF 拦截、OOM killer、结果不稳定等情形应先用 `-o --all-results` 留档，再用 php -v、包管理器、容器 digest 交叉核对，确认版本未修复或差异稳定复现才升级为确认漏洞。
> - **扫描控制：** 生产扫描前告知业务方流量影响并先在预发布试跑；生产低峰期串行、小并发，记录 WAF/CDN 请求体上限，命中后先隔离留证再走变更升级，不要在生产上反复打探针。

**云梦安全** *2026年10月31日 09:00*

2026 年 10 月 22 日，Assetnote 在 GitHub 发布了 `php2shell-scanner` ，检测目标是 CVE-2026-109618 和 CVE-2026-109619。它不只看 PHP 版本号，而是先发一个很小的 multipart 对照请求，再按 1 MiB、8 MiB、20 MiB 三档发送特制请求，观察目标是否出现 PHP 内存耗尽、空响应 500、FPM worker 异常等迹象，最后结合 `X-Powered-By` 里的版本给结论。

这类工具的麻烦也在这里。“把目标打崩”既是检测手段，也可能是误报来源。我在 Windows 便携 PHP 8.5.11 和 8.5.12 上各起了一个本地靶场，按安装、扫描、判读、误报排除的顺序跑了一遍。所有请求都落在 `127.0.0.1` 。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/2fb5f41aded4b55f.png)

## 工具速览

| 项目  | 内容  |
| --- | --- |
| 工具名称 | php2shell-scanner |
| 维护方 | Assetnote Security Research Team |
| 项目地址 | `https://github.com/assetnote/php2shell-scanner` |
| 发布时间 | 2026 年 10 月 22 日 |
| 检测对象 | CVE-2026-109618、CVE-2026-109619 |
| 运行要求 | Python 3.9+、 `h11` 、 `tqdm` |
| 默认路径 | `/index.php` ；URL 中自带路径则保留 |
| 判定结果 | `VULNERABLE` 、 `FIXED` 、 `INCONCLUSIVE` 、 `ERROR` |
| 网络开销 | 每个路径最多约 29 MiB 探针流量 |

工具作者栏注明，最早发现 php2shell 的是 Calif 团队，Assetnote 把 Searchlight 平台里的检测逻辑抽成了命令行版本。它适合授权范围内的资产核查，不适合拿来扫别人的站点。

## 两个 CVE 分别看什么

CVE-2026-109618 与请求处理阶段的内存耗尽、处理状态破坏有关；CVE-2026-109619 涉及跨请求残留的全局状态。受影响的分支不只一个，官方修复版本如下：

```
PHP 8.2.35
PHP 8.3.36
PHP 8.4.27
PHP 8.5.12
```

扫描器不会执行命令，也不会写文件。它构造深层嵌套的 multipart 数组键，让存在缺陷的解析路径在处理请求时耗尽内存或留下异常状态。目标可能表现出三种情况：带 PHP 内存错误特征的响应、与对照请求不同的空 500，或者 PHP-FPM worker 崩溃/重启。响应头暴露了未修复的 PHP 版本，也能作为辅助证据。

普通 500 的成因太多，业务异常、WAF 拦截、超时都会出现相似状态码。扫描器看的是“对照请求正常、探针请求空响应、响应特征符合 PHP 解析路径异常”这一组差异。把其中任意一项单独拿出来，都不够下结论。

## 搭一个可重复的本地靶场

两个 PHP 版本各放一个目录，Web 根目录共用同一个最小页面：

```php
<?php
header('Content-Type: text/plain; charset=utf-8');
echo "php2shell isolated lab target\n";
echo "runtime: " . PHP_VERSION . "\n";
```

两边 `php.ini` 都设置 `memory_limit = 128M` 、 `post_max_size = 32M` 、 `display_errors = Off` 。关闭错误页展示，是为了不让 HTML 错误页掩盖响应差异。然后分别启动内置服务器：

```
# 有漏洞的 8.5.11
.\vuln\php.exe -S 127.0.0.1:18080 -t .\www -c .\vuln\php.ini
​
# 已修复的 8.5.12
.\fixed\php.exe -S 127.0.0.1:18081 -t .\www -c .\fixed\php.ini
```

扫描器依赖单独放进虚拟环境，避免把 `h11` 、 `tqdm` 混进生产 Python：

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scanner.py --help
```

帮助页里有几个参数需要先弄明白：

-   `-u` 扫单个 URL， `-l` 从文件读主机列表；
    
-   `-t` 控制并发，默认 10，探针较大时不要盲目调高；
    
-   `--timeout` 默认 60 秒，链路慢时再适当增加；
    
-   `--sapi auto|mod_php|fpm` 选择判定规则，不知道后端就保持 `auto` ；
    
-   `--path` / `--path-file` 指定业务入口，默认只测 `/index.php` ；
    
-   `-o` 输出 JSON， `--all-results` 连非漏洞结果一起保存；
    
-   `-v` 打印判定原因和响应片段， `--no-color` 方便贴进工单。
    

如果目标是 phpMyAdmin，工具会自动补测 `/show_config_errors.php` 。重定向默认不跟随，确有需要才加 `--follow-redirects` 。这两个默认值会直接影响“扫到了什么”，不要把一次默认扫描当成完整覆盖。

## 8.5.11：第一档探针就出现差异

对漏洞靶场执行：

```
python scanner.py -u http://127.0.0.1:18080 -v --no-color --timeout 60
```

输出先说明加载了 1 个主机、默认路径 `/index.php` 、10 个线程、SAPI 规则为 `auto` 。随后给出：

```
[VULNERABLE] http://127.0.0.1:18080/index.php
  Status: 500 - SAPI: mod_php/PHP-FPM - Verdict: VULNERABLE
  probe 1 (1 MiB, 4000 parts) crashed the request handler:
  HTTP 500 with an empty body although the control request produced output
```

对照请求能正常返回内容，1 MiB、4000 个 part 的探针却让处理路径返回空 500，响应头仍是 `X-Powered-By: PHP/8.5.11` 。扫描器据此停止后续更大的探针，退出码为 1。

提前停止对目标更友好，也说明这次判定不依赖把 20 MiB 全部打满。截图里保留了探针规模、空响应、版本头和退出码，复现时可以先看这几项是否一致。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c674c4d7c87a9330.png)

这里能证明的是目标在特定 multipart 输入下出现了可重复的异常差异，不等于扫描器执行了任意代码。进一步能不能利用、能拿到什么权限，需要另做授权测试和根因分析。检测命中和武器化利用要分开写，报告里也别混在一起。

## 8.5.12：同样请求返回正常页面

把目标换到修复版：

```
python scanner.py -u http://127.0.0.1:18081 -v --no-color --timeout 60
```

结果变成：

```
[NOT VULNERABLE] http://127.0.0.1:18081/index.php
  Status: 200 - Verdict: FIXED
  no crash observed and X-Powered-By reports a patched release: PHP/8.5.12
```

响应体是靶场页面自己的 `runtime: 8.5.12` ，状态 200，退出码 0。两个环境的 Web 根、 `memory_limit` 、 `post_max_size` 完全一致，只换了 PHP 小版本。这组对照比“在另一台机器上没扫出来”更可靠，至少能排除页面内容和配置差异。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1b89dfd2659f8fe1.png)

真实资产不会都这么干净。反向代理可能改写 `X-Powered-By` ，容器可能把 FPM 错误折成通用 502，CDN 也可能直接拦掉大请求体。这些情况会让扫描器进入 `INCONCLUSIVE` 。遇到不确定结果，去查后端真实版本、包管理器和厂商 backport，比反复加大探针有用。

## 误报从哪里来

工具 README 自己写了限制：multipart 探针超过 PHP 的 `memory_limit` 时，已修复版本也可能返回同样的空 500。作者复现过 PHP 8.4.27 在 `memory_limit` 为 2M 到 32M 时的误报，也提到 PHP 8.3.36 在 `max_multipart_body_parts` 调到 2785 以上时会出现类似现象。不同构建的阈值可能不一样。

下面这些结果先别当结论：

-   目标没有暴露 PHP 版本，响应只有空 500；
    
-   `memory_limit` 很低，探针本身足以把正常请求打爆；
    
-   前置 WAF 对超大 multipart 返回自定义 500，但响应体为空；
    
-   FPM 进程因为全局资源不足被 OOM killer 杀掉，与本次解析路径无关；
    
-   同一路径重试时结果不稳定，时而 200 时而 500。
    

比较稳妥的留档方式是运行 `-o results.json --all-results` ，把对照请求、每档探针的状态码、响应头、响应体摘要和判定原因一起保存。再用 `php -v` 、包管理器版本、容器镜像 digest、FPM 慢日志和系统 OOM 记录交叉核对。只有“版本确实未修复”，或者“差异稳定复现且排除了资源限制”，才适合升级为确认漏洞。

## 扫描时控制影响

每个被测路径可能收到 42 字节对照请求加三档探针，合计约 29 MiB。路径越多、并发越高，瞬时带宽和后端内存压力越明显。扫描前应把这一点告知业务方。

先在预发布或镜像环境试跑，确认不会触发自动扩缩容、告警风暴或 FPM 重启。生产环境放在低峰期，单目标串行， `-t` 调小， `--timeout` 留足余量。只扫资产清单内、有书面授权的域名和路径，不要跟随外部重定向。

WAF、负载均衡和 CDN 的请求体上限也要提前记录，避免把防护设备的拒绝当成漏洞。扫描结束后核对 FPM、PHP 错误日志和内存曲线，确认没有遗留异常进程。发现命中后先隔离资产、保留证据，再走变更流程升级 PHP，不要在生产上反复打探针。
