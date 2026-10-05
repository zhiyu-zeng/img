---
title: 【微信】ClaudeCode(2.1.283)逆向和完整遥测分析
source: https://mp.weixin.qq.com/s/feR2X2nO_SGV_Ywhg3Ysfg
source_host: mp.weixin.qq.com
clip_date: 2026-10-06T07:45:37+08:00
trace_id: b3929502-8754-42af-9857-0a090454bcc5
content_hash: 9cd45395750269b4af8ecbb70c75f5ad57341de72434f6727f6a99620aff4f4d
status: synced
tags:
  - 微信
  - 协议分析
  - 风控对抗
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: Claude Code 2.1.283 内置默认开启的遥测与云控，改走第三方 API 也不会自动关闭，还会采集设备、git 与中转站信息用于特征比对。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3f075244-d011-81e1-b6ac-e2edacb9b5b7
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Claude Code 2.1.283 内置默认开启的遥测与云控，改走第三方 API 也不会自动关闭，还会采集设备、git 与中转站信息用于特征比对。
> 
> - **关闭方式：** 遥测默认开启，只有设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 才切换为 essential-traffic；`DISABLE_TELEMETRY`、`DO_NOT_TRACK` 也有效，数据发往 `api.anthropic.com/api/event_logging/v2/batch`。
> - **上传内容：** 安装时生成的随机 userID；模型名对照官方 catalog 列表，命中则原样上传，未命中标为 confidential；还包括 `ANTHROPIC_BASE_URL`、token 用量与重试/速度、skill、插件、MCP 名称（自定义走 hash）、工具同意或拒绝及等待时长、进程信息、git URL 前 20 字节哈希与 HEAD SHA。
> - **环境标记：** 在 GitHub Actions、WSL、Docker/Kubernetes 下额外上报 action 事件与 runner 信息、WSL 与发行版/内核版本、容器类型，Actions 环境还会上传 actor/repo/owner ID。
> - **云控能力：** 启动向 GrowthBook 拉取约 648 个开关；`tengu_heron_brook` 可把服务端下发的提示词注入系统上下文，`tengu_official_plugin_prompt_overrides` 可覆盖官方 MCP/工具描述，`tengu_max_version_config` 可配置最高版本并强制降级。
> - **中转站识别：** `x-anthropic-billing-header` 的 cc_version 取首条 user 文本第 4、7、20 位参与 SHA256 取前 3 位十六进制；官方按 UTF-16 下标，sub2api 按 UTF-8 字节取值，后缀不一致即暴露。

**冲鸭安全** *2026年10月5日 22:00*

## 前言

最近在开中转站,众所周知sub2api的特征是非常多的,所以我完整的逆向了cladue code的全部协议一比一对特征解决特征，但是越来越发现这玩意非常的离谱，有些已经超出代码编辑工具的边界了，故在此公开分析报告，我用的是我电脑上的Claude code 的2.1.283的版本。

## Claude code的遥测

Claudecode存在一个遥测系统， **而这个Claude code的遥测系统不会随着你用中转站而关闭**。也就是说你用了他们的产品就会发送遥测数据给Claude code，除非你使用

```
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

这个环境变量把他关闭。

```javascript
function gmt() {
    if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)
        return "essential-traffic";

    if (process.env.DISABLE_TELEMETRY)
        return "no-telemetry";

    if (Ne(process.env.DO_NOT_TRACK))
        return "no-telemetry";

    return "default";
}

function It() {
    return gmt() === "essential-traffic";
}

function $D() {
    return gmt() !== "default";
}
```

**一旦遥测打开，后续的信息都会发送给:**

```
https://api.anthropic.com/api/event_logging/v2/batch
```

让我们看看他有什么行为

### Claude code唯一标识符

当你装Claude code的时候，cc会在你电脑上生成一个随机的标识符

```
// 生成随机编号。
let s = Ed(32).toString("hex");

// 写入本地配置，字段名叫 userID。
Ee(g => ({
    ...g,
    userID: s
}), e);
```

跟外挂机器码修改一样，如果你不处理它，你就会被永久标记

### 模型信息

如果你用第三方API，比如zhipu的或者deepseek，Claude code依然会上传上去模型使用信息，会话ID，用户类型  
模型使用信息的逻辑是:

```
// 取得当前模型名称。
let n = e.model ? String(e.model) : it();

// 经过客户端转换。
D = Jdn(n);

// 放入元数据。
model: D,
```

他会把模型名字去  
https://downloads.claude.ai/model-catalog/v1/catalog.json

```java
 ```javascript
bne = [
    "claude-3-5-haiku",
    "claude-3-5-sonnet",
    "claude-3-7-sonnet",
    "claude-fable-5",
    "claude-fable-5-1",
    "claude-haiku-4-5",
    "claude-mythos-5",
    "claude-mythos-5-1",
    "claude-opus-4-0",
    "claude-opus-4-1",
    "claude-opus-4-5",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-opus-5-5",
    "claude-sonnet-4-0",
    "claude-sonnet-4-5",
    "claude-sonnet-4-6",
    "claude-sonnet-5"
];

j1 = [
    "sonnet",
    "opus",
    "haiku",
    "fable",
    "best",
    "sonnet[1m]",
    "opus[1m]",
    "fable[1m]",
    "opusplan"
];

var Fpt = "claude-mythos-preview";
```

拉一个列表下来，如果模型不在这里面，会标记为”confidential”如果在这里，会原样上传模型名字

### token使用情况

即便是不用Claude订阅，走第三方API，也一样会上传你的token使用情况  
包括不限于

压缩时候的情况

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/62564353527f26eb.png)

你的当前中转站URL(ANTHROPIC_BASE_URL)

```dockerfile
function nMe() {
    return {
        ...process.env.ANTHROPIC_BASE_URL && {
            baseUrl: XMo(process.env.ANTHROPIC_BASE_URL)
        },

        ...process.env.ANTHROPIC_MODEL && {
            envModel: xt(process.env.ANTHROPIC_MODEL)
        },

        ...process.env.ANTHROPIC_SMALL_FAST_MODEL && {
            envSmallFastModel:
                xt(process.env.ANTHROPIC_SMALL_FAST_MODEL)
        }
    };
}
```

同一个客户端/会话用了多少 token、请求速度、是否重试、用了哪些运行模式、输入是否含图片/文档、system 和工具定义多大，以及一些可关联的哈希和请求编号。  
这块非常多，看图吧:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8f72c2c6cc162eba.png)

其中有意思的是 default_model

我们上面说了model会脱敏，而default_model的”脱敏”是一种伪脱敏，具体来说，他会过一层正则

```javascript
var Bw = /^[A-Za-z0-9._:[\]-]{1,100}$/;

var Kw =
    /^[A-Za-z0-9._:[\]-]{1,91}@\d{8}(\[\d{1,3}[mM]\])?$/;

function xt(e) {
    if (e == null)
        return;

    return Bw.test(e) || Kw.test(e)
        ? bn(e)
        : y("nonconforming");
}
```

如果是这种格式

```
claude-sonnet-4-5
gpt-4.1
deepseek-chat
qwen3-32b
my_model:v1
sonnet[1m]
```

则会变成”confidential”  
而如果是这种

```
provider/model      含 /
my model            含空格
模型一               含中文
model?version=1     含 ? 和 =
```

则会被标记  
我能想到的场景是，我自己测评的模型，比如自己训练的CTF的模型，会被hit，如果用vllm，一般默认的后缀就是目录/模型名字比如这样:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/5a6628994834dab7.png)

从而变成”nonconforming”

### skills和插件

当你用到skill的时候(请求中用了skill)，无论是不是claude订阅还是第三方，都会上传skill名字

```
function _W({
    rawName: e,
    canonicalName: n,
    isMcp: r,
    isBuiltIn: s,
    isBundled: g,
    isOfficial: h
}) {
    let S = r
        ? "mcp"
        : s || g || h
            ? e
            : "custom";

    return {
        sanitizedName: bn(S),
        skillNameHash:
            S === "custom" ? lhr(n) : {}
    };
}
```

你的插件也是，也会上传对应的名字

```
function bW(e, n, r = null) {
    let s = Kge(e, n) ?? n;

    return {
        _PROTO_plugin_name: e,

        ...s && {
            _PROTO_marketplace_name: s
        },

        ...zcn(e, n, r)
    };
}
```

### MCP与工具使用

claude code会上传你的工具使用情况，包含工具名字

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9a29d2e3bf63b245.png)

而如果是MCP服务器，自定义的，则会脱敏走hash上传

```javascript
var fP = "claude-plugin-telemetry-v1";

function aye(e) {
    return cP("sha256")
        .update(e + fP)
        .digest("hex")
        .slice(0, 16);
}
```

有意思的是还会上传你是拒绝还是同意，你为此等了多久(wtf)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/559995e29a683869.png)

```
i("tengu_tool_use_rejected_in_prompt", {
    ...kP(e, n, s, h),
    ...g,
    ...S,

    ...r.type === "hook"
        ? { isHook: !0 }
        : {
            hasFeedback:
                r.type === "user_reject"
                    ? r.hasFeedback
                    : !1
        }
});
```

### 运行环境

这些是挺标准的:

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/df2c993104c6d319.png)

然而在以下条件下，Claudecode会额外上传tag

#### github的action

```
isGithubAction:
    Ne(process.env.GITHUB_ACTIONS),

isClaudeCodeAction:
    Ne(process.env.CLAUDE_CODE_ACTION)
```

如果是action环境，上传

事件类型、runner 环境/系统、action ref

#### WSL

通过字符串比对是否是微软的WSL:

```kotlin
getWslVersion() {
    if (this.wslVersion !== null)
        return this.wslVersion;

    if (this.sources.platform !== "linux") {
        this.wslVersion = void 0;
        return;
    }

    let e = this.kernelString();

    if (e === void 0) {
        this.wslVersion = void 0;
        return;
    }

    let r = e.match(/wsl(\d+)/);

    if (r && r[1])
        this.wslVersion = r[1];
    else if (e.includes("microsoft"))
        this.wslVersion = "1";
    else
        this.wslVersion = void 0;

    return this.wslVersion;
}
```

如果是微软的WSL，则会上传WSL 版本、Linux 发行版及版本、内核信息

#### docker

如果你在docker下用它，他会通过

```kotlin
if (process.env.KUBERNETES_SERVICE_HOST)
    return "kubernetes";

if (o.isDockerenvPresent())
    return "docker";

if (p.platform === "darwin")
    return "unknown-darwin";

if (p.platform === "linux")
    return "unknown-linux";

if (p.platform === "win32")
    return "unknown-win32";

return "unknown";
```

识别你是不是docker

### 进程信息

会上传当前进程的信息

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/289d7d5b15a0d02e.png)

### git信息

Claude code会上传你的git url的前20字节并且做hash

```javascript
async function ZWr() {
    let e = await Vne();

    if (!e)
        return null;

    let n = w2(e);

    if (!n)
        return null;

    return So("sha256")
        .update(n)
        .digest("hex")
        .substring(0, 16);
}
```

并且知道你的当前 HEAD 的提交 SHA  
**猜测是检查，哪些账户在开发相同的项目（类似于组织指纹）**

如果你把Claude code放到github action，他会直接上传github的信息:

```
if (n.githubActionsMetadata) {
    let se = n.githubActionsMetadata;

    ee.github_actions_metadata = {
        actor_id: se.actorId,
        repository_id: se.repositoryId,
        repository_owner_id: se.repositoryOwnerId
    };
}
```

-   操作者 ID；
    
-   仓库 ID；
    
-   仓库所属用户/组织 ID。
    

## GrowthBook云控

在启动的时候，Claude code会发送

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3f624c2aaf41003e.png)

到

```
普通评估：
POST https://api.anthropic.com/api/eval/sdk-zAZezfDKGoZuXXKe

带认证评估分支：
POST https://api.anthropic.com/api/eval-authed/sdk-zAZezfDKGoZuXXKe
```

随后看服务端返回了什么云控功能开关:

```json
{
  "features": {
    "某个实验功能": {
      "value": true,
      "source": "experiment",
      "experiment": {
        "key": "实验编号"
      },
      "experimentResult": {
        "variationId": 1
      }
    }
  }
}
```

这个是典型的云控行为，有意思的是这个云控数量达到了惊人的648个，而且很多意义不明，这里挑出来一些AI跑过的

### tengu_heron_brook 远程服务端提示词注入

这个神奇的flag接受远程服务端的提示词并且注入到系统上下文中  
客户端会读一个client_data

```
GET <base>/api/claude_cli/bootstrap
    → 响应中的 client_data
    → 本地 clientDataCacheSlots
    → cd()
```

然后判断这个key

```php
function hXn() {
    let e = nSt();

    if (!e)
        return null;

    return i("tengu_heron_brook_applied", {
        len: e.value.length,
        fromClientData: e.fromClientData
    }), e.value;
}
```

然后塞到system提示词里面。  
这意味着如果官方给你换了一个能执行任意代码的模型 结合这个 就能实现任意代码执行。  
**当然我们不能那么坏的去看A÷是吧**

### tengu_official_plugin_prompt_overrides 覆盖插件提示词

官方可以下云控，去控制自己的MCP和工具的提示词，这里要说明的是，不是任意的，是官方自己的

```css
{
    server_instructions: string,
    server_instructions_by_server: { [serverName]: string },
    tools: { [toolName]: string },
    search_hints: { [toolName]: string },
    param_descriptions: {
        [toolName]: { [parameterName]: string }
    },
    prompts: { [promptName]: string },
    skills: { [skillName]: string }
}
```

| 字段  | 实际用途 |
| --- | --- |
| server_instructions | 覆盖 MCP 连接 server instructions |
| server_instructions_by_server | 按 server 名覆盖 instructions |
| tools | 覆盖已有 MCP 工具 description |
| search_hints | 覆盖已有工具搜索提示 |
| param_descriptions | 改写已有 input schema properties 的 description |
| prompts | 覆盖 MCP prompt 的 description |
| skills | 覆盖发现的 MCP skill 的 description |

### tengu_max_version_config 更新时候的最低版本

云控设置一个最低版本，更新的版本不能超过这里配置的版本

```javascript
async function Qwe() {
    let e = await Pe();
    let n = e.external || void 0;
    let o = n ? R.parse(n)?.version ?? void 0 : void 0;
    // 原函数还有非法版本告警；此处省略。
    return {
        maxVersion: o,
        forceDowngradeEnabled:
            e.external_force_downgrade === !0
    };
}
async function Pe() {
    try { return await k1("tengu_max_version_config", {}); }
    catch (e) { return d(e), {}; }
}
```

## sub2api等各种中转站检测

众所周知 x-anthropic-billing-header是带了cc_version这个字段的。

cc_version这个字段官方 Claude Code 取第一条 user 文本的第：

```
4、7、20
```

三个位置，然后计算：

```css
SHA256(
 "59cf53e54c78"
 + text[4]
 + text[7]
 + text[20]
 + "2.1.283"
) 的前 3 位十六进制
```

官方是 JavaScript，所以字符串下标按 UTF-16 字符单元。

而sub2api项目的当前 Go 代码：

```
chars = append(chars, firstText[i])
```

按的是 UTF-8 字节

所以会导致sub2api的项目，真实 Claude Code 先生成：

```
cc_version=2.1.283.<官方后缀>;
```

请求到 SUB2API 后，当前项目的：

https://github.com/Wei-Shaw/sub2api/blob/a60a29549f488a854966aaec9541abbe006cac22/backend/internal/service/gateway_billing_block.go#L32

```
syncBillingHeaderVersion()
```

会重新计算后缀，但项目按 UTF-8 字节取第 4、7、20 位，而官方按 JavaScript UTF-16 下标取值。

于是可能变成：

```
客户端：
cc_version=2.1.283.d80;

SUB2API 出站：
cc_version=2.1.283.fdc;
```

导致sub2api被检测

## 结论

最后附上gpt-6.1-sol的结论

> Claude Code 是能力强、但不适合当作“透明、纯本地工具”信任的客户端。基于这次对 2.1.283 的静态分析，我的评价是：  
> 工程能力强：工具、权限、子代理、压缩和远程任务机制完整，确实有不少安全检查。  
> 隐私边界不直观：推理正文、产品遥测、辅助模型请求、反馈和文件交付是不同通道。用第三方 API 不代表其他通道自动关闭。  
> 云端控制权较大：能调整功能参数，甚至追加模型指令、改变部分安全检查和更新签名强制策略。这扩大了你必须信任官方服务的范围。  
> 适合普通开发；处理高度敏感代码时，应按“联网代理执行环境”管理，而不是只换个 baseurl 就放心。明确限制文件和网络权限、禁用不需要的遥测/远程功能、避免把凭据放进可读工作区，比单纯相信工具的“只读”标签更可靠。
