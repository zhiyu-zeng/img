---
title: 【先知】ONLYOFFICE Document Server -最新RCE漏洞分析
source: https://xz.aliyun.com/news/92968
source_host: xz.aliyun.com
clip_date: 2026-10-19T17:23:16+08:00
trace_id: 4d2e4e53-8d69-4087-9721-3c60d9eae07f
content_hash: 38872544db2d81d251e9578ef11c0722caa2f5b17bed1e618bd5cf01507c7207
status: synced
tags:
  - 先知
  - 漏洞分析
  - 路径穿越
series: null
feed_source: 先知安全技术社区
ai_summary: ONLYOFFICE Document Server RCE 链的根因不在某处过滤漏了，而在路径边界从未下沉到 storage 层、安全配置与“任意路径写文件”原语同处一个信任域，五次修复都只停在参数级。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3fe75244-d011-8101-a64b-c68fe24d2d8c
ioc:
  cves:
    - CVE-2021-3199
  cwes:
    - CWE-1188
    - CWE-184
    - CWE-22
    - CWE-284
    - CWE-306
    - CWE-647
    - CWE-732
    - CWE-807
    - CWE-863
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> ONLYOFFICE Document Server RCE 链的根因不在某处过滤漏了，而在路径边界从未下沉到 storage 层、安全配置与“任意路径写文件”原语同处一个信任域，五次修复都只停在参数级。
> 
> - **穿盘点：** 三个 body 字段（`id`/`savekey`/`format`）都直接拼进 storage key；`DOC_ID_REGEX` 只校验 URL 段，`canvasservice.js:1543` 的 `cmd.getDocId()` 会把该值整体覆盖；全链路唯一穿盘口 `storage-fs.js` 的 `path.join` 没有 jail。
> - **校验错位：** `checkPathTraversal` 全仓仅两个调用点（均在 FileConverter），不在写入路径上；它的 `docId` 形参在函数体内从未被使用，而 `id` 恰是唯一能独立穿盘的字段。
> - **放大器：** harness 对照验证：`storage-base.js:64` 的 `.replace(/\\/g,'/')` 在 Linux 上把 `..\..\x` 变成真穿越，去掉替换后 `path.join` 只当它是字面文件名；`savetype=3`（来自请求体）还会整段跳过 `basename` 归一化。
> - **配置同域：** `production-linux.json` 默认把 `runtimeConfig.filePath` 指向 `Data/runtime.json`，并带 200ms 去抖热加载；注入有两条通道——`deepMergeObjects` 热合并与 `moduleReloader.js:97-100` 替换全局 `config` 单例，只堵一条等于没堵。
> - **口径修正：** 出厂 `token.enable.browser` 本就是 `false`，“关鉴权”只对已加固部署成立（静默降级）；修复方向是把 jail 下沉到 storage 层入口（`path.posix.normalize('/'+key)` + 前缀断言），而非继续给单个参数打补丁。

## ONLYOFFICE Document Server

## 0x00 前言

先把边界说清楚，免得读完觉得被辜负：

-   不提供可用的请求体、不提供 `runtime.json` 内容、不搭 EXP 靶场、不放"跑通了"的截图。
-   不评价任何在野利用的具体操作步骤，公开研究里那部分我一行都不会复述。

那"本地复现"复现到哪一层？说清楚，免得这条边界显得只是措辞：

-   **做了**：把仓库里的真实函数（ `storage-base.putObject` / `storage-fs.putObject` / `utils.deepMergeObjects` / `constants.DOC_ID_REGEX` / `resolveConverterPath` ）用 harness 加载起来直接调用，看文件真的落在哪、合并真的覆盖谁。零网络、零 DS 进程、零运行实例，写操作全部关在 `/tmp` 的 scratch 目录里，脚本跑完自己删干净。这一步改写了三条结论，见 0x11。
-   **没做**：起 Document Server 实例、发 HTTP 请求、构造配置内容、验证执行。这些不是"更难一点的复现"，是不同性质的东西 —— 前一半证明的是边界在哪，后一半产出的是可用流程。

我想写的是另一半：这条链上每一环在源码里都长什么样，以及 **为什么"每环都补过"却仍然串起来了**。这个问题的答案跟 ONLYOFFICE 关系不大，跟所有带"存储抽象层 + 运行时可改配置"的服务关系很大。

所有代码引用都在本机 clone 的源码上逐行核对过。核对命令在 0x02，证据分级在 0x11。

* * *

## 0x01 漏洞原因

最近这两件事叠在一起传播：

**事件 A（已确认，公开）**— 2026-10-09 HKCERT 通报，CVE-2021-3199 被列入 CISA KEV，影响 Document Server `< 5.6.3` ， `5.6.3` 修复。

**事件 B（研究者陈述，我不复现）**— 针对 9.x 的 `/downloadas` 路径穿越 → `runtime.json` 落盘 → 配置热加载 → 未授权 RCE 的公开研究。

顺手纠正一个传播里最常见的错：不少稿子把 HKCERT 那条 2026-10-09 的公告挂在事件 B 的时间线上。我核对了原文，它写的是 **CVE-2021-3199 /** `<5.6.3` **/ 5.6.3 修复**—— 那是事件 A，跟事件 B 相差五年，影响版本、成因、修复都不同。

碎碎念：这类"新洞进了 KEV"的转述，一半错误来自把两条时间线粘成一条。写文章的人未必故意，只是抄的时候没看影响版本那栏。

* * *

## 0x02 审计环境搭建

环境很简单，只读审计：

```bash
mkdir -p src && cd src
git clone --depth 1 https://github.com/ONLYOFFICE/server.git
```

有个坑值得单独说： `ONLYOFFICE/DocumentServer` 那个仓库 **全是 submodule**， `server/` 目录 clone 下来是空的。服务端代码在独立的 `ONLYOFFICE/server` 里。我第一次 clone 完 `ls server` 一片空白，回头看 `.gitmodules` 才明白。

我审计的两个坐标：

|     |     |     |
| --- | --- | --- |  
| 坐标  | commit | 用途  |
| `master` HEAD | `d6df308` "Merge branch release/v9.4.0 into master" | 逐行阅读的对象 |
| 最新发布 tag | `v9.4.0.97` | 回答"这还算不算当前版本的问题" |

tag 比对的命令和结论（这条比我原本打算说的要硬，见 0x11）：

```bash
git fetch --depth 1 origin refs/tags/v9.4.0.97:refs/tags/v94097
for f in Common/sources/storage/storage-fs.js DocService/sources/canvasservice.js \
         Common/sources/runtimeConfigManager.js FileConverter/sources/converterPaths.js \
         Common/sources/utils.js Common/sources/operationContext.js \
         Common/config/production-linux.json; do
  echo "$f hunks=$(git diff v94097 HEAD -- $f | grep -c '^@@')"
done
```

结果：上述文件每个只有 1 个 hunk， `production-linux.json` 是 0 个。而那 1 个 hunk 全是 AGPL 许可证头的措辞重写。 **v9.4.0.97 与 master HEAD 在我审计的每一行代码上逐行相同。**

证据分级（每条结论后标级，0x11 有汇总）：

-   **A 级**— 我在源码上直接读到，或本机可复算（正则行为、路径拼接、配置默认值、代码卡里的源码文本）。
-   **B 级**— 公开公告与研究者的陈述。我引用，不复现、不背书。
-   **C 级**— 我想确认但没确认到的。写出来标着，不猜。

### 从静态阅读到执行验证：harness 的构造与边界

光有行号还不够。上面这些结论有一大半是 **可以被执行的**，所以我写了个 harness（ `scripts/storage-boundary-repro.cjs` ，随文附上），把仓库里的 `storage-base.js` / `storage-fs.js` / `utils.js` / `constants.js` / `commondefines.js` / `converterPaths.js` **以原文件身份** `require` **进来直接调用**，而不是我手抄一遍再跑手抄的版本。

做法：劫持 `Module._load` ，只桩掉叶子依赖（ `config` 、 `ms` 、 `node-cache` 、 `axios` 、 `jsonwebtoken` 、 `win-ca/api` 等 19 个），其余全部走真实模块。 `config` 桩直接读真实的 `default.json` + `production-linux.json` 并按点号路径取值，所以 `storage.name` / `cacheFolderName` 都是出厂值。 **唯一改动是把** `storage.fs.folderPath` **从** `/var/lib/...` **指到** `/tmp/ds-repro/storage` ，否则测试会去写生产路径。

判定方式我刻意做"笨"了：不自己算路径、不打印我推测的落点，而是调用真实 `putObject` 之后 **遍历 scratch 目录看文件到底出现在哪**。仓库函数说哪儿是哪儿。

这一步前后改变了我对发现 1 的表述 **两轮** （见 0x04 的更正），完整输出在 `repro-output.txt` 。

同时我要把"执行"这个词的边界先划清楚，免得后文用词超出实际。harness 第 11 节自己打印了一份清单：

-   **真跑了的**： `storage-base.putObject` （含它内部的 `getStoragePath` ）、 `storage-fs.putObject` 、 `utils.deepMergeObjects` 、 `constants.DOC_ID_REGEX` 、 `converterPaths.resolveConverterPath` 。
-   **没跑的**： `saveParts` / `commandSave` / `downloadAs` / `InputCommand` 的字段拷贝与分支。第 1 节那个 key 是 **按** `canvasservice.js:424` **的形状人工拼出来的**。也就是说" `savetype=3` 会让 `basename` 整段跳过"这条因果仍然是读出来的（A 级源码证据），不是执行出来的；0x05 里凡是写"执行证据"的地方，指的都只是 **这个 key 形状进了真实** `putObject` **之后落在哪**。
-   同样没碰的： `runtime.json` 的内容本身、HTTP 请求、Document Server 进程。

两个桩的边界必须说清楚，它们都在被测路径之外：

-   `tenantManager.getTenantPathPrefix` 恒返回 `''` —— 对应非多租户模式（打包默认）。多租户下它会插一段租户前缀，本 harness **没有覆盖那种形态**。
-   `operationContext.normalizePersistentStorageCfg` 返回原值 —— 它只喂 `persistentStorage` 分支，而本 harness 从不传 `opt_specialDir` ， `getStorageCfg` 恒走 `cfgCacheStorage` （ `storage-base.js:77-80` ）。可证是不在路径上。

* * *

## 0x03 请求到磁盘的完整落点

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8ed09b1dbe9c9728.png)

图 1 是这条链的七个环节。下面每一级都带真实行号（ `ONLYOFFICE/server` @ `d6df308` ）。

**① 路由与 URL 守卫**— `DocService/sources/server.js:242-248, 258`

```javascript
app.param('docid', (req, res, next, val) => {
  if (constants.DOC_ID_REGEX.test(val)) {
    next();
  } else {
    res.sendStatus(403);
  }
});
...
app.post('/downloadas/:docid', rawFileParser, canvasService.downloadAs);
```

**② 命令从 query 里的 JSON 解析**— `DocService/sources/canvasservice.js:1541-1543`

```javascript
const strCmd = req.query['cmd'];
const cmd = new commonDefines.InputCommand(JSON.parse(strCmd));
docId = cmd.getDocId();
```

**③ 字段原样拷贝**— `Common/sources/commondefines.js:41` 起的构造函数

```javascript
this['id']       = data['id'];        // :50
this['format']   = data['format'];    // :58
this['savetype'] = data['savetype'];  // :63
this['savekey']  = data['savekey'];   // :86
```

`getDocId()` 返回 `this['id']` （ `commondefines.js:190-192` ）。 **注意它来自 JSON body，不是 URL 里的** `:docid` —— ①的守卫守的是另一个变量。

**④ 拼文件名**— `canvasservice.js:661-663`

```javascript
function* commandSave(ctx, cmd, outputData) {
  const format = cmd.getFormat() || 'bin';
  const completeParts = yield* saveParts(ctx, cmd, 'Editor.' + format);
```

**⑤ 唯一一次归一化，被包在 if 里**— `canvasservice.js:409-424`

```javascript
function* saveParts(ctx, cmd, filename) {
  let result = false;
  const saveType = cmd.getSaveType();
  if (SAVE_TYPE_COMPLETE_ALL !== saveType) {          // :412
    const ext = pathModule.extname(filename);
    const saveIndex = parseInt(cmd.getSaveIndex()) || 1; //prevent path traversal
    filename = pathModule.basename(filename, ext) + saveIndex + ext;
  }
  ...
    yield storage.putObject(ctx, cmd.getDocId() + cmd.getSaveKey() + '/' + filename, buffer, buffer.length);
```

`SAVE_TYPE_COMPLETE_ALL = 3` （ `canvasservice.js:83` ），而 `saveType` 来自请求体。

**⑥ key 前缀化，不做归一化**— `Common/sources/storage/storage-base.js:62-65, 104-107`

```javascript
function getStoragePath(ctx, strPath, opt_specialDir) {
  opt_specialDir = opt_specialDir || cfgCacheStorage.cacheFolderName;
  return opt_specialDir + '/' + tenantManager.getTenantPathPrefix(ctx) + strPath.replace(/\\/g, '/');
}
async function putObject(ctx, strPath, buffer, contentLength, opt_specialDir) {
  ...
  return await storage.putObject(storageCfg, getStoragePath(ctx, strPath, opt_specialDir), buffer, contentLength);
}
```

唯一的字符串处理是反斜杠换成正斜杠 —— 它是给后续 `path.join` 用的，不是过滤器。

而且跑完之后我发现这句话还说轻了：在 Linux 上这个 `replace` **本身就是一个穿越放大器**。 `path.join` 在 POSIX 下会把 `..\..\x` 当成一个含反斜杠的字面文件名（不穿越），而这行 `.replace(/\\/g, '/')` 先把它变成了真正的 `../../` 。证据在 0x05 的执行结果里。

**⑦ 落盘**— `Common/sources/storage/storage-fs.js:44-47, 74-84`

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4a62ac4713ebf362.png)

```javascript
function getFilePath(storageCfg, strPath) {
  const storageFolderPath = storageCfg.fs.folderPath;
  return path.join(storageFolderPath, strPath);   // 全链路唯一的穿盘点，没有 jail
}
async function putObject(storageCfg, strPath, buffer, _contentLength) {
  const fsPath = getFilePath(storageCfg, strPath);
  await mkdir(path.dirname(fsPath), {recursive: true});   // 目录不存在就顺手创建
  if (Buffer.isBuffer(buffer)) {
    await writeFile(fsPath, buffer);
  }
```

看图 1 时要盯的一点：七个环节里，"这个 key 会不会逃出 storage 根目录"这个问题 **一次都没被问过**。它只在另一条路上被问过 —— `FileConverter/sources/converter.js:621` 和 `:1212` 调了 `utils.checkPathTraversal()` 。

* * *

## 0x04 发现 1：校验函数存在，但未覆盖本调用链

`Common/sources/utils.js:1156-1166` ：

```javascript
exports.checkPathTraversal = function (ctx, docId, rootDirectory, filename) {
  if (filename.indexOf('\0') !== -1) {
    ctx.logger.warn('checkPathTraversal Poison Null Bytes filename=%s', filename);
    return false;
  }
  if (!filename.startsWith(rootDirectory)) {
    ctx.logger.warn('checkPathTraversal Path Traversal filename=%s', filename);
    return false;
  }
  return true;
};
```

全仓库调用点，grep 只有两处（A 级）：

|     |     |
| --- | --- | 
| 调用点 | 所在进程 |
| `FileConverter/sources/converter.js:621` | FileConverter |
| `FileConverter/sources/converter.js:1212` | FileConverter |

**先记下这个函数的第二个特征**：它的第一个业务参数是 `docId` ，而函数体里从头到尾没有用它一次（ `utils.js:1156-1166` ，全文 11 行）。签名说明写它的人知道 docId 和穿越有关，实现说明他知道完之后没有处理它。

这个"形参存在、实现缺席"的形状，和下一节那个"存在、正确、但没被调用"是同一种病的两个阶段。而把它和 0x04 后半节的更正放在一起读尤其顺 —— 这条链上真正能独立穿盘的输入就是 `docId` ，正是校验函数签名里那个被忽略的参数。审计时如果只读到一个"有个 docId 参数"就略过，会错过这整篇文章最经济的一句证据。

顺带一句它的判定方式： `filename.startsWith(rootDirectory)` 是纯字符串前缀比较， `rootDirectory=/var/lib/x` 时 `/var/lib/x-evil/…` 也算通过。要做边界断言得先 `path.resolve` 再比 `root + path.sep` （0x09 第 1 条里的写法就是照这个补的）。

**这条正式归类是 CWE-22（路径遍历）**：后果就是文件写到声明根之外，不必绕。它有意思的地方在形状，不在编号 —— 仓库里已经有一个方向正确的校验函数（ `utils.js:1161` 那个前缀断言就是"解析完再比根"的雏形，只差 `resolve` 和 `path.sep` ），它存在、基本正确，然后在这条写入路径上安静地一次都没被调用。硬要往上再贴一个 CWE-863（授权机制不正确）也说得通，但那是描述"为什么漏了"，不是描述"发生了什么"。

根因是它的形状： `checkPathTraversal` 检查的是 **已经解析完的绝对路径**，所以它必须由调用者在正确时机调用。这就决定了它是 per-call-site 的 —— 每新增一条 storage 写入路径，都得有人记得再调一次。而 `storage-fs.js` 里那个 `path.join` 才是所有路径唯一的必经口，它反倒什么都没有。

### 补充观察：校验对象与实际使用的变量不一致

`app.param('docid')` 用 `DOC_ID_REGEX` 校验 URL 段，但 ③ 已经说明真正参与拼路径的是 body 里的 `id` 。而且这个"白名单"字符集（ `Common/sources/constants.js:38-40, 42` ）是：

```javascript
exports.DOC_ID_PATTERN = '0-9-.a-zA-Z_=';
exports.DOC_ID_REGEX = new RegExp('^[' + exports.DOC_ID_PATTERN + ']*$', 'i');
exports.DOC_ID_REPLACE_REGEX = new RegExp('[^' + exports.DOC_ID_PATTERN + ']', 'g');
exports.DOC_ID_MAX_LENGTH = 240;
```

包含 `.`。真实函数执行结果（A 级， `constants.js:38-42` 被 harness 直接加载）：

|     |     |     |
| --- | --- | --- |  
| 输入  | `DOC_ID_REGEX.test` | `DOC_ID_REPLACE_REGEX` sanitize 后 |
| `abc` | true | `abc` |
| `..` | **true** | `..`（原样，因为 `.` 在白名单里） |
| `....` | **true** | `....` |
| `-` | true | `-` |
| `../..` | false | `.._..` |
| `a/b` | false | `a_b` |

它挡的是 `/` ，不是 `.`。作为 URL 参数，`..` 是一个"合法 docid"。

（这里先按住不展开：下一节会说明这个正则在这条链上根本没被用在真正拼路径的那个值上 —— 连"挡得住挡不住"都还没轮到。）

### 两轮更正：从过度归因到过度收窄，第二次同样错误

这一段改过两次，两次都是被执行结果逼着改的。我把它完整留在正文里，因为它比结论本身更能说明"只读代码的审计"会在哪里失效。

**第一版（写宽）**：暗示 `docId=".."` 能逃出 storage root。跑完 harness 第一批用例，遍历 scratch 目录看到的落点是：

```plain
key = "../Editor.bin"
root 内新增: Editor.bin
root 外新增: (无)
```

只越过了 `cacheFolderName = "data"` 那一层前缀（ `storage-base.js:63-64` ），没出 root。于是我改成"不构成穿盘，实害只在缓存目录边界内"，并加了一句： *"逃出 root 需要 ≥2 层* `../` *，而* `DOC_ID_REGEX` *因为挡* `/` *恰恰给不出* `../../` *"*。

**第二版（写窄）错在那句话的后半截**：我把一个 **只作用于 URL 参数** 的正则，当成了作用于 body 字段的约束。中间那一步不是证据，是我脑补的。

harness 第 8 节把全仓 `DOC_ID_REGEX` 的调用点扫了一遍：

```plain
DOC_ID_REGEX 使用点: DocService/sources/converterservice.js:292  |  DocService/sources/server.js:243
其中作用于 req.query/cmd JSON 的: 0 处
```

`server.js:242-248` 的 `app.param('docid')` 校验的是 URL 段； `canvasservice.js:1543` 紧接着 `docId = cmd.getDocId()` ，body 里的 `id` 把这个值整个覆盖掉，之后没有任何字符约束。`:1587` 的 `taskResult.select(ctx, docId)` 查不到也只是 `row = null` （`:1588` ），不会中止请求。

于是同一套 harness、同一个真实 `putObject` ，把层数放在 `id` 上（其余字段全部正常）：

```plain
key = "../../OUTSIDE_E/x=1/Editor.bin"
putObject 抛出 : 无
root 内新增文件: (无)
root 外新增文件: OUTSIDE_E, OUTSIDE_E/x=1, OUTSIDE_E/x=1/Editor.bin
*** 结论：文件写在 storage root 之外。root=/tmp/ds-repro/storage ***
```

**不需要** `savetype=3` **，不需要碰** `filename` **，不需要反斜杠。** 再给两层，落点直接是文件系统根：

```plain
key = "../../../../OUTSIDE_F/x=1/Editor.bin"
putObject 抛出 : ENOENT: no such file or directory, mkdir '/OUTSIDE_F'
```

这次"没写成"是 `/` 的 DAC 拦的，不是应用拦的 —— 应用的边界在上面那一行就已经被完全越过了。层数按生产形状换算： `folderPath = /var/lib/onlyoffice/documentserver/App_Data/cache/files` 再加前置的 `data/` 一共 8 段，`../` 给够就能到 `/` ，少几层就落在 `/etc/` 、 `/var/www/` 这类位置上。这一段是算术，不是实测，我按 C 级标注。

有一行是对照，说明"关键是总层数，不是哪个字段"：

|     |     |     |     |
| --- | --- | --- | --- |   
| 层数放在哪个 body 字段 | key | 实际落点 | 逃出 root |
| `id` ，2 层 | `../../OUTSIDE_E/x=1/Editor.bin` | `SCRATCH/OUTSIDE_E/x=1/Editor.bin` | **是，写入成功** |
| `id` ，4 层 | `../../../../OUTSIDE_F/x=1/Editor.bin` | `/OUTSIDE_F/…` ，被 OS 拒 | 边界已越过，写成与否取决于目标目录权限 |
| `id` ，2 层 + 反斜杠 | `../../OUTSIDE_G\..\x=1/Editor.bin` | `SCRATCH/x=1/Editor.bin` | **是** |
| `saveKey` ，2 层 | `ABCDEF…/x/../../OUTSIDE_I/y/Editor.bin` | `ROOT/data/OUTSIDE_I/y/Editor.bin` | 否 —— 层数被合法的 `docId` 吃掉一段 |
| `id` ，1 层 | `../Editor.bin` | `ROOT/Editor.bin` | 否（就是第一版看到的那个结果） |

所以结论要改成这样：

-   **正则字符集含** `.` **这件事，在这条链上根本不是重点**—— 它压根没被应用到参与拼路径的那个值上。这比"字符集含 `.`"严重得多，也简单得多：不是白名单写得松，是白名单没接上。
-   `docId` **单独就构成穿盘**。我第二版"写窄"的结论作废。
-   `cacheFolderName` 的"意外缓冲"只对少一层的情况有效（表格第五行）。它仍然是负资产，但 **不是防线**，之前把它写成防线也是错的。

那发现 2 还剩多少分量？它作为缺陷独立成立 —— `saveType` 决定 `filename` 要不要归一化这个逻辑错误是真实的，而且它提供的是 **第二个注入点** （ `format` ）。但我在 0x05 里把"这条才是能逃出 root 的那条"这顶帽子扣给它，是不对的：发现 1 的 body `id` 已经能做到，两者是汇入同一个未设界 key 的 **并行载体**，不是必要条件与受益者的关系。0x05 相应改掉。

这轮的方法论教训我单独记一条，它会进 0x12： **凡是"这个字段被某个校验挡住了"的句子，必须先证明那个校验作用在这个字段上。** 校验对象错位（URL 段校验 vs. body 字段使用）本身就是这类链最常见的一环，我在批评它之后立刻踩了第二次。

### 仓库内已有的正确实现

`DocService/sources/wopiClient.js:614` ：

```javascript
docId = docId.replace(constants.DOC_ID_REPLACE_REGEX, '_').substring(0, constants.DOC_ID_MAX_LENGTH);
```

sanitize-on-write 的写法已经存在、就在同一个 `DocService` 里，只是走 wopi 那条路时用。这类"仓库里有正确的原语，但用在不相邻的路径上"的情况，我在审计里见过太多次了 —— 它几乎总是"边界没有下沉到层，而是留在调用点"的直接后果。

* * *

## 0x05 发现 2：归一化受控于业务参数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc5f4b8182d223f0.png)

`canvasservice.js:412-416` 是三行我认为全篇最值得盯着看的代码：

```javascript
if (SAVE_TYPE_COMPLETE_ALL !== saveType) {
  const ext = pathModule.extname(filename);
  const saveIndex = parseInt(cmd.getSaveIndex()) || 1; //prevent path traversal
  filename = pathModule.basename(filename, ext) + saveIndex + ext;
}
```

`basename` 是对的， `saveIndex` 的 `parseInt` 也是对的。 **错的是外面那个** `if` **。**

`saveType` 来自请求体（ `commondefines.js:63` ）。当 `saveType === 3` （ `SAVE_TYPE_COMPLETE_ALL` ），整段归一化跳过， `filename` 带着 `cmd.getFormat()` 原文进入 ⑤ 的 `putObject` 。

-   **CWE-807（安全决策依赖不可信输入）**，其次 CWE-184（不完整输入校验）。我原先在这里贴的是 CWE-647，那是错的：MITRE 的 647 是"用非规范化的 URL 路径做授权判断"，和"业务枚举决定要不要归一化"没有关系。编号贴错比不贴更糟 —— 它会误导按 CWE 检索的人。
-   那行 `//prevent path traversal` 注释只覆盖了 `saveIndex` ，没覆盖 `filename` 本身。写这段的人知道这个字段会被拿去拼路径 —— 他知道得比这条链上任何人都清楚，只是把"穿越"理解成了"索引值穿越"。

### 执行证据：filename 载体同样可越出存储根

先把口径说明白（0x02 那份清单的在这里落地）：下面执行的是 **这个 key 形状进真实** `putObject` **之后落在哪**；" `savetype=3` 会让这段归一化被跳过"仍然是 `canvasservice.js:412` 的源码事实， `saveParts` 本身没有被跑起来。

跟 0x04 那批用例同一套 harness、同一个真实 `putObject` ，只把穿越层数放在 `filename` 上（也就是 `saveType=3` 时不被归一化的那个变量）：

```plain
key = "ABCDEF0123456789=1/../../../OUTSIDE_A/Editor.bin"
putObject 抛出 : 无
root 内新增文件: (无)
root 外新增文件: OUTSIDE_A, OUTSIDE_A/Editor.bin
```

`mkdir(recursive)` 把 `OUTSIDE_A/` 顺手创建了， `writeFile` 把文件写在里面，全程没有抛任何错。 **但它不是唯一一条**—— 0x04 更正后的表格显示 `id` 也能独立做到。两条载体汇入同一个未设界的 key，这才是"声明的 storage root 拦不住任何东西"这句话的实际含义。

把十二种 key 形状一次跑完，结果比我预期的有信息量。下表是 `filename` 这一组， `id` / `saveKey` 那一组在 0x04：

|     |     |     |
| --- | --- | --- |  
| `filename` 里的形状 | 实际落点 | 逃出 root？ |
| `Editor.bin` | `ROOT/data/<docId>=1/Editor.bin` | 否（正常） |
| `../../../OUTSIDE_A/Editor.bin` | `SCRATCH/OUTSIDE_A/Editor.bin` | **是** |
| `../../../Data/runtime.json` | `SCRATCH/Data/runtime.json` | **是** |
| `..\..\OUTSIDE_D\Editor.bin` （反斜杠） | `ROOT/OUTSIDE_D/Editor.bin` | 否，但 **越过了** `data/` **与 docId 两层** |
| `..%2e%2e/OUTSIDE_C/Editor.bin` （编码变体） | `ROOT/data/<docId>=1/..%2e%2e/OUTSIDE_C/Editor.bin` | 否（字面文件名，不是穿越） |
| `Editor\0.bin` （NUL） | 抛 `ERR_INVALID_ARG_VALUE` ，且目录已被创建 | 否，但 **是 OS 拦的不是应用拦的** |

三行值得单独说的：

**1）反斜杠在 Linux 上是有效载荷 —— 这一条我做了对照组。** `storage-base.js:64` 的 `.replace(/\\/g, '/')` 把 `..\..\x` 变成 `../../x` 。"如果不替换就会是一个字面文件名"这个反事实，我原先只是读代码推的，现在跑成了 harness 第 9 节：绕开 `storage-base` 、把 **未经替换** 的同一个路径直接喂给真实的 `storage-fs.putObject()` ：

```plain
输入 : "data/ABCDEF0123456789=1/..\\..\\OUTSIDE_H\\Editor.bin"
抛出 : 无
root 内: data/ABCDEF0123456789=1/..\..\OUTSIDE_H\Editor.bin
root 外: (无)
```

落点是一个 **名字叫** `..\..\OUTSIDE_H\Editor.bin` **的文件**，老老实实待在 docId 目录里。也就是说： **一个为了跨平台兼容加的归一化，在 Linux 上凭空造出了一条穿越通道**。这种 bug 只有把代码跑起来才看得见 —— 读代码时我只会把它归类成"不是过滤器，无害"。

顺带一个同名陷阱： `storage-fs.js:48-50` 还有一个 `getOutputPath()` 也做同样的替换，但那是给返回的 URL 用的，不在这条写入路径上。看代码时把这两个 `replace` 当成同一个，会得出错误的覆盖面判断。

**2）编码变体不用防。** `%2e%2e` 到这里已经是字面字符了（URL 解码在更早的层做完），它不会穿越，只会生成一个名字叫 `..%2e%2e` 的目录。所以 0x10-F 里那条"拒绝 `%2e%2e` "的 WAF 规则，对这条链的实际作用是把噪音挡掉，不是挡穿越 —— 我原先把它和穿越并列写，是抬高了它的地位。

**3）NUL 是 OS 拦的。** `checkPathTraversal` 里那条 `indexOf('\0')` 检查在这条路上根本没被调用，但结果仍然安全 —— 因为 Node 的 fs 层直接拒绝 NUL。这属于"运气好"而不是"防住了"：同一份 key 如果流向一个不做这个检查的下游（比如某些 C 扩展、或者被写进 XML/INI 再解析），保护层就没了。

再一个用例说明它为什么和"配置写"有关 —— 把 `filename` 换成一个配置文件名（harness 里写进去的是一段固定的无意义占位串，不是载荷，也不是合法配置）：

```plain
key = "ABCDEF0123456789=1/../../../Data/runtime.json"
root 外新增文件: Data, Data/runtime.json
```

我要强调这条用例证明的是 **什么**、没证明 **什么**：它证明的是路径算术上 `runtime.json` 这个位置对写原语可达（生产 `folderPath` 与生产 `runtimeConfig.filePath` 的相对关系见 0x06 的表）， **没有** 证明任何一台真实部署上它能落到那个位置 —— 那取决于两个目录是否在同一文件系统、容器怎么挂载、进程 uid 有没有写权限。这些我一个都没测，也不打算测。中间那一步是 C 级推断，不是 A 级事实。

还有一个"占位串"的口径要在这里结掉，不能让它悬着当掩护：真实代码路径里写进去的 buffer 是 `cmd.getData()` （ `canvasservice.js:423` ），而 `downloadAs` 在 `:1593` 做的是 `cmd.setData(req.body)` —— 请求体原文。这个路由挂的是 `bodyParser.raw({... type() { return true; }})` （ `server.js:224-230` ）， `type` 恒真是说 **任何 Content-Type 都按原始字节收**，上限由 `services.CoAuthoring.server.limits_tempfile_upload` 决定。所以：落到磁盘的文件内容就是请求体本身，没有编码、没有转换。这一点我在 0x00 已经声明不写载荷，正文里也不会出现任何可用的配置内容；但它必须讲清楚，因为它直接决定 0x10-B 那条 FIM 告警的价值 —— **"配置文件被写过"这个信号，不能靠"里面大概是无意义数据"来降级**，落地时按"内容完全可控"处置。

### 参数级补丁的沉积层

`canvasservice.js:358-363` ：

```javascript
function* addRandomKeyTaskCmd(ctx, cmd) {
  const docId = cmd.getDocId();
  const task = yield* taskResult.addRandomKeyTask(ctx, docId);
  //set saveKey as postfix to fix vulnerability with path traversal to docId or other files
  cmd.setSaveKey(task.key.substring(docId.length));
}
```

注释里直接印着 "to fix vulnerability with path traversal" —— 一条历史穿越修复留下的痕迹，方式是把 `saveKey` 挪成后缀。

而它只在 `!cmd.getSaveKey()` 时被调用（ `canvasservice.js:417-419` ）。body 里带了 `savekey` ， `this['savekey'] = data['savekey']` （ `commondefines.js:86` ）就原样留着，参与 `cmd.getDocId() + cmd.getSaveKey() + '/' + filename` 的拼接。

### 自查：同类模式的检出方式

一句话判据： **任何** `if (<来自请求的条件>) { sanitize(...) }` **都在说"只有在我不需要被打的时候才是安全的"。**

```bash
# 归一化/校验被条件包住
grep -rn -B2 "basename(\|normalize(\|replace(.*REPLACE_REGEX" --include=*.js src/ \
  | grep -E "if *\(|!==|==="
```

命中的每一条都要问：这个条件是谁控制的？如果是请求，那这行等于没写。

* * *

## 0x06 发现 3（主发现）：安全开关与应用写原语处于同一信任域

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d89ddee1807df560.png)

这一段比路径穿越本身有意思得多，我原本打算写短，结果写完最长。

### 合并链

`Common/sources/operationContext.js:110-114` ：

```javascript
    this.config = configCache[this.tenant];
    if (!this.config) {
      const runtimeConfig = await runtimeConfigManager.getConfig(this);
      const tenantConfig = await tenantManager.getTenantConfig(this);
      this.config = utils.deepMergeObjects({}, moduleReloader.getBaseConfig(), runtimeConfig, tenantConfig);
```

`runtimeConfig` 是一个磁盘上的 JSON 文件。 `Common/sources/runtimeConfigManager.js:67-68` ：

```javascript
    const configData = await fs.readFile(configFilePath, 'utf8');
    return JSON.parse(configData);
```

图 2 画的是这条优先级链：越靠右覆盖越优先，而 `runtimeConfig` 处在"文件可写即可生效"的那一格。

**但这条链上有三层，不是一层。** `:114` 最后一个参数是 `tenantConfig` ，它排在 `runtimeConfig` **右边**。这个次序在下文"未授权"表述的修正一节里是有分量的，我第一版整个漏掉了它（当时只画了 base → runtime 两层），现在补进 harness 一起跑。

"越靠右覆盖越优先"这句我用真实的 `utils.deepMergeObjects` （ `utils.js:1428` ）跑过两组：一组用 `default.json` 的实读出厂值当 base，一组用"运维已在 `local.json` 打开 JWT"当 base（这一组是合成的， `harness` 第 5 节明确标了它不是出厂值）：

```plain
=== 10. 三层合并的真实出厂值（operationContext.js:114 顺序 base -> runtime -> tenant）===
  default.json 实读: browser=false inbox=false outbox=false
  --- 10.1 出厂部署：runtime 层没有降级空间（本来就是 false）
  --- 10.2 已加固部署（base 模拟运维已在 local.json 打开 JWT：browser=true inbox=true）
  base(加固)   browser=true inbox=true
  runtime      browser=false inbox=false
  merged       browser=false inbox=false outbox=true
  --- 10.3 tenant 层在 runtime 之后（:114 最后一个参数），多租户模式下可再覆盖回去
  merged(base,runtime,tenant) browser=true
```

三件事一次说清：

1.  `outbox` **没被覆盖**，说明是逐 key 深合并而不是整对象替换 —— 对"能不能只覆盖一个开关而不碰别的"有意义：能。合并语义本身没坏，坏的是有一层可热写的内容能参与合并。
2.  **出厂** `token.enable.browser` **就是** `false` **（实读）。** 所以"runtime.json 关掉鉴权"这个说法 **在默认部署上是不成立的**—— 它已经关着，没有降级空间。这一格真正的影响面是 **已经加固过的部署**：运维按官方建议开了 JWT，值落在 `local.json` （合并进 `getBaseConfig()` ，见下面第二条通道那节），然后一个可热写的 `runtime.json` 把它静默改回 `false` 。这比我原来写的"出厂就不安全"窄，但性质更坏 —— 它是 **对安全加固的回退**，而且不产生任何错误日志。
3.  **多租户模式下** `tenantConfig` **又排在 runtime 之后** （10.3 那行： `browser` 回到 `true` ）。所以在多租户部署里覆盖优先级还会再翻一次。这一点我没有真实的多租户形态可跑（ `tenantManager` 在 harness 里是桩），按 C 级标注：次序是 A 级源码事实，实际影响取决于租户配置里有没有那两个 key。

顺带一句读代码时的收获：`:110-111` 说明合并结果按租户缓存在 `configCache` 里，而重载路径上有人显式调 `cleanRuntimeConfigCache()` （ `runtimeConfigManager.js:153` ）把它清掉 —— 缓存失效是 **做过的**，这不是一个忘了接线的死代码。这类"基础设施完整、只是没有权限边界"的情况，比纯粹的疏忽更难防。

### 第二条注入通道：替换全局 config 单例

`ctx.getCfg` 只是 runtimeConfig 生效的 **其中一条** 路。另一条在 `Common/sources/moduleReloader.js` ，而且它更硬：

```javascript
function requireConfigWithRuntime(opt_additionalConfig) {
  let config = require('config');
  try {
    baseConfigSnapshot = config.util.toObject();          // :80  全局快照，含 local.json
    const configFilePath = config.get('runtimeConfig.filePath');
    if (configFilePath) {
      const configData = fs.readFileSync(configFilePath, 'utf8');   // :84
      let curNodeConfig = JSON.parse(process.env.NODE_CONFIG ?? '{}');
      const fileConfig = JSON.parse(configData);                    // :88
      curNodeConfig = config.util.extendDeep(curNodeConfig, fileConfig);
      ...
      process.env.NODE_CONFIG = JSON.stringify(curNodeConfig);      // :97
      config = reloadNpmModule('config');                           // :100 单例被替换
```

调用点是两个进程的 **第一行业务代码**： `DocService/sources/server.js:39` 、 `FileConverter/sources/convertermaster.js:40` 。

和上面那条 `deepMergeObjects` 通道比，这条的区别是量级上的：

|     |     |     |
| --- | --- | --- |  
|     | 通道 A： `operationContext.js:114` | 通道 B： `moduleReloader.js:97-100` |
| 生效时机 | 热：watcher 清掉 `configCache` 后，下一次建 ctx 就带上 | **只在进程启动时** （ `requireConfigWithRuntime` 全仓就 `server.js:39` / `convertermaster.js:40` 两个调用点，watcher 那条路径不会重跑它） |
| 作用面 | `ctx.getCfg(...)` 这条读法 | 全局 `config` 模块本身，包括所有 `config.get('...')` 直读 |
| 是否被 `configCache` / `nodeCache` 遮蔽 | 是（两级缓存都做了失效） | 否   |
| 绕过 per-request 合并层 | 否   | **是** |

`moduleReloader.js:80` 那行还有第二个作用： `baseConfigSnapshot` 是 `require('config')` 在做完 `default.json` → `{deployment}.json` → `local.json` 全部合并 **之后** 的快照（ `config` 模块的 `local.json` 优先级最高，仓库 `Readme.md:93` 也正是让人把临时改动写进 `local.json` ；`.gitignore:2` 里忽略的也是它）。换句话说通道 A 的 base 层里已经包含了运维自己加的加固 —— 这正是上面第 2 点那个"降级"故事的来源，也是我不该把它写成"出厂危险"的原因。

还有一个从 `:47` 那行 `const configFilePath = cfgRuntimeConfig.filePath;` 读出来的细节，它让这两条通道互相够不着： **指针是启动期固化的，内容才是热加载的**。也就是说写完 `runtime.json` 之后，没法用 `runtime.json` 里的 `runtimeConfig.filePath` 把指针搬到别处（那要等重启）。这条约束对防守方是好消息（指针挪不动，FIM 盯那一个文件就够），对"能不能靠改配置提权"是坏消息（ `token.enable.browser` 走通道 A，热生效，不用重启）。

这两条通道合起来才是完整的： **热的那条够得到所有** `ctx.getCfg` **的读法，启动的那条够得到所有** `config.get` **的直读。** 我第一版只写了前者，于是 0x09 的第 3 条建议会看起来比实际简单。这条漏掉的通道是我自己审自己时发现的，直接后果是： **如果只处理** `ctx.getCfg` **，等于只堵一半。**

### 热加载机制：200ms 去抖后全量生效

`runtimeConfigManager.js:53-55, 130-166` ：

```javascript
const RELOAD_DEBOUNCE_MS = 200;
...
function handleConfigFileChange(eventTypeOrCurrent, filenameOrPrevious) {
  ...
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        nodeCache.del(configFileName);
        operationContext.global.logger.info(`handleConfigFileChange reloading config: ${configFileName}`);
        operationContext.global.cleanRuntimeConfigCache();
        getConfig(operationContext.global)
          .then(config => {
            logger.configureLogger(config?.log?.options);
          })
```

监听器在 **两个进程** 里都起了（A 级）： `DocService/sources/server.js:511` 、 `FileConverter/sources/convertermaster.js:112` 。

一个我在这里特意查过、否则容易被质疑的细节： `runtime.json` **不需要预先存在**。 `initRuntimeConfigWatcher` 监听的是 **目录** （ `runtimeConfigManager.js:176-177` ， `utils.watchWithFallback(ctx, configDir, configFilePath, ...)` ， `utils.js:1503` 里是 `fs.watch(dirPath, ...)` ），而回调的判定条件是：

```javascript
      shouldReload = configFileName === filenameOrPrevious;   // :139
```

它比的是 **文件名**，没有比 `eventType` 。所以 `rename` 、 `change` 之外的 **create 事件同样命中**—— 第一次创建这个文件就会触发重载。别把"这个目录里本来没有 runtime.json"当成缓解条件。

（另一个边界： `utils.js:1495-1498` 会先 `getFsType()` ，落在 `UNSAFE_MAGIC` 里的文件系统不原生 watch、退化成 `fs.watchFile` 轮询。挂载类型换的是触发机制，不是"是否触发"。具体某台机器上是什么 fs 类型我没测。）

### 出厂默认值的准确表述

先说清楚哪一半站得住、哪一半站不住： **"热加载这个机制是出厂开启的"站得住；"出厂就不安全"站不住**—— 因为出厂的 `token.enable.browser` 本来就是 `false` （下一节按这个口径重写）。

直接读 JSON（A 级）：

|     |     |     |
| --- | --- | --- |  
| key | `Common/config/default.json` | `Common/config/production-linux.json` |
| `runtimeConfig.filePath` | `""` | `/var/www/onlyoffice/documentserver/../Data/runtime.json` |
| `token.enable.browser` | `false` | —   |
| `token.enable.request.inbox` | `false` | —   |
| `storage.name` | `storage-fs` | —   |
| `storage.fs.folderPath` | `""` | `/var/lib/onlyoffice/documentserver/App_Data/cache/files` |

`production-linux.json:6` 这一行是我这次审计里最实在的一个发现： **打包版 Linux 生产配置默认就把 runtimeConfig 指向** `runtime.json` （ `documentserver/../Data/` 归一化后即 `/var/www/onlyoffice/Data/runtime.json` ）。

换句话说，"配置文件可热加载"这个 **能力** 不需要谁去开启，出厂就是这样；但它的 **后果** 取决于部署把安全开关设在了什么值上。而 0x04/0x05 给的是"往可达路径写文件"的原语 —— 这两个事实放在一起，就是整篇文章的主题。

需要说明的是： `runtimeConfig.filePath` 这个非空默认值来自 `production-linux.json` ，而这份配置是怎么被选中的（ `NODE_ENV` / `CONFIG_DEPLOYMENT` 具体取值、Dockerfile 或 deb 包里的启动环境）我没有实测过 —— 那一层算 B 级推断。 `default.json` 里它是空字符串。

### "未授权"表述的修正

我原先在标题下写的论证是" `runtime.json` 能把 `token.enable.browser` 关掉，所以这条命令未授权可达"。审阅时它的反例就印在我自己贴的那张表上： **出厂值本来就是** `false` 。所以这句话在默认部署上是空的。

先把代码事实放回来。 `canvasservice.js:1548-1550` ：

```javascript
const tenTokenEnableBrowser = ctx.getCfg('services.CoAuthoring.token.enable.browser', cfgTokenEnableBrowser);

if (tenTokenEnableBrowser || cmd.getTokenDownload() || cmd.getTokenSession()) {
  // JWT 校验，失败则 403
```

第二个条件是 `||` 不是 `&&` ：即使 `browser` 为 true，请求只要在 body 里带 `tokenDownload` 或 `tokenSession` 也会 **进入** 校验分支 —— 那是要求一个有效 JWT，不是跳过。所以 `token.enable.browser=false` 本身在这条链上不是问题；它是文档服务器"浏览器侧不签 JWT"的默认部署形态（无状态、由集成方自己保护入口），把它单独拎出来说成漏洞是错的。

于是"未授权是哪来的"这个问题，正确答案分两种部署形态：

1.  **默认部署**： `browser=false` 就是出厂值， `save` 命令本来就无需任何鉴权即可到达 `saveParts` 。这条链 **不需要** runtime.json 就已经是未授权写文件 —— 0x04 那个 `id` 用例跑的正是这个形态下的 key（ `downloadAs` 本身没被执行，这一条是 `:1548-1550` 的源码事实，A 级）。顺带一个有意思的细节：`:1548` 的 fallback `cfgTokenEnableBrowser` 是 `canvasservice.js:67` 在模块加载时用 `config.get(...)` 读的 —— 也就是 **通道 B 的产物**；而 `ctx.getCfg` 是 **通道 A 的读法**。同一个开关同时挂在两条通道上，热值盖掉启动值。
2.  **已加固部署** （按官方建议配了 JWT，值在 `local.json` → 通道 A 的 base 层）： `runtime.json` 的写原语把它覆盖回 `false` （harness 第 10.2 节实测： `browser=true + runtime{browser=false} → false` ，且只覆盖那一个 key）。这是 **静默降级**， `getConfig` 那条路径上没有任何"配置来源变了"的告警。

两种形态都成立，但成立的方式完全不同，缓解措施也不同：第 1 种只能靠入口层保护（0x10-G），第 2 种靠 FIM + 配置分域（0x10-B / 0x09 第 3 条）。把它们混成一句"未授权 RCE"，就是我 0x01 批评的那种"粘成一条"。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/cb0eb06043b6127b.png)

信任域的错位可以压缩成一句话：

> 应用有一个"往任意可达路径写文件"的原语（发现 1 + 发现 2），配置文件正好是这个原语够得着的地方，而配置文件里存着 **回退安全加固** 的权限。 **没有任何一层把"安全配置"划到写原语够不到的域里。**

-   **CWE-1188** 只适用于 `runtimeConfig.filePath` 在非生产配置里被默认指向一个应用可写域内的路径这一件事；
-   **"写文件 → 权限降级"这个组合更接近 CWE-284（访问控制不当）+ CWE-732（关键文件对不当事件者可写）**，而不是 CWE-1188；
-   默认部署那一半（上面第 1 条）严格说是 CWE-306（缺失功能的关键认证）在"浏览器侧命令"这个面上的体现 —— 但它是 **文档服务器公开的部署模型**，所以我只把它列为"必须核对的部署假设"（0x10-G），不当漏洞报。

### 两条同域副作用（仅作审计注记，不涉及利用）

1.  `runtimeConfigManager.js:156` 把 `config.log.options` 交给 `logger.configureLogger()` 。同一个写原语还能改日志配置。它不是 RCE 的一环，但它是"写完之后的痕迹"的一环 —— 所以缓解清单里应该有一条"日志配置变更"的独立告警（放在 0x10-B 的 FIM 规则里，把 `log4js/production.json` 与 `runtime.json` 同组监控）。
2.  `Common/sources/utils.js:1428-1448` 的 `deepMergeObjects` 没有 `__proto__` / `constructor` 过滤：

```javascript
for (const key in source) {
  if (isObject(source[key])) {
    if (!target[key]) { Object.assign(target, {[key]: {}}); }
    deepMergeObjects(target[key], source[key]);
  } else {
    Object.assign(target, {[key]: source[key]});
  }
}
```

`JSON.parse` 出来的 `__proto__` 是自有可枚举属性，会被 `for...in` 走到，然后 `target['__proto__']` 拿到的是 `Object.prototype` —— 递归会把键合进全局原型。这条我只做到"读代码 + 判断可达性"，没做成利用，也不打算做。它在本文的价值是： **配置内容既没有 schema 也没有 key 白名单**，这是同一个症状的第三种表现。

* * *

## 0x07 发现 4：spawn 的目标来自配置，绝对路径原样返回

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/902a9412c643228d.png)

`FileConverter/sources/converter.js:1118-1131` ，以及 `:1160` 的执行：

顺带把 0x06 的两条通道接到这里：上面三个 `ctx.getCfg(key, fallback)` 的 fallback 全部来自 `converter.js:72-74` 的模块加载期 `config.get(...)` ，也就是 **通道 B** 的产物； `ctx.getCfg` 本身是 **通道 A**。所以 `x2tPath` / `docbuilderPath` 这类"spawn 目标"既受启动期 `NODE_CONFIG` 注入影响，也受运行期热覆盖影响 —— 修复时两条都得堵（见 0x09 第 3 条）。

```javascript
const tenX2tPath = resolveConverterPath(ctx.getCfg('FileConverter.converter.x2tPath', cfgX2tPath));
const tenDocbuilderPath = resolveConverterPath(ctx.getCfg('FileConverter.converter.docbuilderPath', cfgDocbuilderPath));
const tenArgs = ctx.getCfg('FileConverter.converter.args', cfgArgs);
...
let processPath;
if (!builderParams) {
  processPath = tenX2tPath;
...
const spawnAsyncPromise = spawnAsync(processPath, childArgs, spawnOptions);   // :1160
```

三个都走 `ctx.getCfg` ，也就是都受 0x06 的合并链影响。 `args` 还直接参与 `childArgs` 。

`FileConverter/sources/converterPaths.js:60-64` ：

```javascript
function resolveConverterPath(value) {
  if (!value || value === 'null') return '';
  if (path.isAbsolute(value)) return value;
  return path.resolve(FC_DEFAULT_BASE, value);
}
```

相对路径被锚定到 `FileConverter/` （这是好的）， **绝对路径不做任何约束**。

直接调这个真实函数（ `converterPaths.js` 只依赖 `path` ，harness 里零桩加载）：

```plain
"/tmp/ds-repro/whatever/docbuilder" -> "/tmp/ds-repro/whatever/docbuilder"   原样返回
"x2t"                                -> "<repo>/FileConverter/x2t"           锚定住了
"" / "null"                          -> ""
```

绝对路径那行的返回值和入参是同一个字符串，一个字符都没变。

它的文档注释里有两句我反复看了很久（ `converterPaths.js:46-59` ）：

```plain
 * - Absolute paths are returned unchanged.
 ...
 * Do NOT use this for FileConverter.converter.errorfiles: that is a storage
 * route/prefix, not a local filesystem path.
```

第二句是开发者在注释里用自然语言告诉未来的调用者"这个 helper 不管那件事"。

**当一个工具函数需要用注释来声明自己的适用边界时，说明这个边界不是由类型或架构保证的 —— 是靠人记住的。** 这就是"补丁按参数打"最诚实的证据形态，比我举任何漏洞例子都有说服力。

### 源码层面的因果链

我必须在这里插一句限定： **下面是我从代码读出的可达性，不是我在任何机器上验证过的利用。**

写到 `runtime.json` → `FileConverter.converter.x2tPath` 变成配置值（0x06）→ `resolveConverterPath` 对绝对路径原样返回（本节）→ `spawnAsync(processPath, ...)` 执行它（ `converter.js:1160` ）。

审计上这一节的结论跟发现 3 是同一个： **可执行文件位置被当成了运行时可改的业务配置。** 它应该是部署期的只读事实。

* * *

## 0x08 结构性原因

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/b3a13bbe66fe8018.png)

三个互相咬合的说法：

**1）边界位置错了。** 路径边界应该在 storage 层（全链路唯一穿盘口， `storage-fs.js:44-47` ），实际散落在调用点（ `converter.js:621/1212` ）。边界一旦 per-call-site，它的覆盖率就等于"还有人记得"。

**2）安全属性由业务参数决定。** `basename` 在 `if` 里（发现 2）；鉴权开关在可热写的文件里（发现 3）；执行路径在配置项里（发现 4）。三个不同的位置，同一个错误形状。

**3）修复以"参数补丁"的形式沉积。** 我在仓库里数到的五片：

|     |     |     |
| --- | --- | --- |  
| 补丁  | 位置  | 粒度  |
| `checkPathTraversal` | `utils.js:1156` | 调用者级 |
| `parseInt(saveIndex)` | `canvasservice.js:414` | 字段级（带注释） |
| `addRandomKeyTaskCmd` | `canvasservice.js:358-362` | 字段级（注释写着 "fix vulnerability"） |
| `DOC_ID_REPLACE_REGEX` sanitize | `wopiClient.js:614` | 字段级，另一条路 |
| `resolveConverterPath` | `converterPaths.js:60` | 新 helper，注释说明"哪里别用" |

每一片都对，每一片都只覆盖一个参数。没有一片是边界。这就是图 3 那栏"修复位置"想要表达的东西： **过去五次修复都在参数层，而缺陷产生在层缺失上。**

### 测试侧的旁证（A 级）

`tests/unit/` 下有 `converterPaths.tests.js` ，文件头写着 "Key invariant"。说明这个仓库有不变量测试的意识。但我在 `tests/unit` 与 `tests/integration` 里 **没有找到任何断言"storage key 不能逃出** `folderPath` **"** 的用例。

缺的不是测试文化，是"什么才算不变量"的定义。有 invariant 的测试新代码，没有 invariant 的旧边界。

### 在自有代码库中检索同类形状

这部分是我觉得对读者最有用的：

```bash
# 1) 唯一穿盘口有没有 jail
grep -rn "path\.join(" --include=*.js src/ | grep -iE "storage|disk|fs|save"

# 2) 校验函数的调用点数 vs 写入路径数
grep -rn "checkPathTraversal\|validatePath\|sanitizePath" --include=*.js src/

# 3) 归一化有没有被请求可控的条件包住
grep -rn -B2 "basename(\|normalize(" --include=*.js src/ | grep -E "if *\(|!==|==="

# 4) 安全开关是否走了"运行时可写"的配置通道
grep -rn "getCfg\|getConfig(" --include=*.js src/ | grep -iE "token|auth|enable|secret"

# 5) 可执行文件位置是否可热改
grep -rn "spawn\|execFile\|fork(" --include=*.js src/ | grep -iE "cfg|config"
```

第 2 条最便宜，也最容易打脸： **一个守卫函数，调用点数明显少于写入路径数，它就已经站在错的那一侧了。** 这一条不需要读业务逻辑、不需要跑任何东西，30 秒出结论。

第 4 条是我这次审计学到的：把"安全敏感 key"列一张表，然后逐个 grep 它的读取入口是不是运行时可写的通道。如果是，你就不需要漏洞也能被打 —— 一个能写配置文件的低权限账号就够了。

* * *

## 0x09 修复建议（厂商级，按边界重排）

四条，优先级从高到低。第 1、2 条的写法我在本机对着同一批 key 跑过（结果附在下面）；第 3、4 条是 **结构建议**，没有可执行的"修好前后对照"，我不把它们写成验证过的东西。

### 1）jail 下沉到 storage 层，取消调用者级检查

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a3bcc1a804610522.png)

```javascript
function getFilePath(storageCfg, strPath) {
  const root = path.resolve(storageCfg.fs.folderPath);
  const rel = '.' + path.posix.normalize('/' + String(strPath).replace(/\\/g, '/'));
  const fsPath = path.resolve(root, rel);
  if (fsPath !== root && !fsPath.startsWith(root + path.sep)) {
    throw new Error('storage path escape');
  }
  return fsPath;
}
```

关键是 `path.posix.normalize('/' + key)` —— 前面补一个 `/` 让它变成绝对路径再归一化，`..` 就会在根上被吃掉，而不是在末尾留下一个悬空的上跳。

本机执行（A 级，harness 第 2 节）—— 把 0x04/0x05 那批真实逃出过 root 的 key 原样喂给这个写法：

|     |     |
| --- | --- | 
| 输入 key | jail 结果 |
| `ABCDEF0123456789=1/Editor.bin` | `ROOT/ABCDEF0123456789=1/Editor.bin` 正常 |
| `../Editor.bin` | `ROOT/Editor.bin` 收敛 |
| `ABCDEF0123456789=1/../../../OUTSIDE_A/Editor.bin` | `ROOT/OUTSIDE_A/Editor.bin` **逃出被切断** |
| `ABCDEF0123456789/../OUTSIDE_B/x/Editor.bin` | `ROOT/OUTSIDE_B/x/Editor.bin` 收敛 |
| `ABCDEF0123456789=1/../../../Data/runtime.json` | `ROOT/Data/runtime.json` **再也到不了 root 外** |
| `../../OUTSIDE_E/x=1/Editor.bin` （body `id` 那条） | `ROOT/OUTSIDE_E/x=1/Editor.bin` 收敛 |
| `../../../../OUTSIDE_F/x=1/Editor.bin` （4 层，原来落到 `/` ） | `ROOT/OUTSIDE_F/x=1/Editor.bin` 收敛 |
| `../../OUTSIDE_G\..\x=1/Editor.bin` （ `id` 里混反斜杠） | `ROOT/x=1/Editor.bin` 收敛 |
| `ABCDEF…/x/../../OUTSIDE_I/y/Editor.bin` | `ROOT/OUTSIDE_I/y/Editor.bin` 收敛 |
| `ABCDEF0123456789=1/..%2e%2e/OUTSIDE_C/Editor.bin` | 原样保留（本来就不是穿越） |

同一批 key，真实 `putObject` 那边有四条写到了 root 外，这个写法全部收在 root 内。差别只在有没有那三行归一化 + 前缀断言。

一个语义提醒：这个写法把越界 **收敛** 而不是 **拒绝**—— 对存储层通常更稳（不会因为一个 `../` 让整个保存流程 500）。如果你的口径是"越界即拒绝"， `startsWith` 那句保留就行，snippet 里已经带了。

**为什么这条必须排在第 2 条前面**：0x04 更正之后这里的答案反而更硬了。key 是 `docId + saveKey + '/' + filename` 三段拼的， **三段都是 body 字段**，任何一段单独收敛（比如只给 `format` 加白名单）都不够 —— 层数够就能出去，字段无所谓。这正是"边界必须下沉到层"的教科书形状：在调用点做过滤，你永远不知道有几个入口。

### 2）输入侧无条件白名单，且不受业务参数分支控制

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0a885a2bdc911060.png)

```javascript
const FORMAT_EXT = /^[A-Za-z0-9]{1,8}$/;
const rawFormat = String(cmd.getFormat() || 'bin');
const format = FORMAT_EXT.test(rawFormat) ? rawFormat : 'bin';
const completeParts = yield* saveParts(ctx, cmd, 'Editor.' + format);
```

本机执行（A 级，harness 第 7 节）： `docx / bin / xlsx / json` 通过； `docx/../x` 、`..\..\x` 、9 字符、空串全部拒绝。第二行是 0x05 那个反斜杠发现带出来的 —— 白名单不含 `\` ，所以它顺带把那条通道也关掉了；如果只按 `../` 配规则会漏掉它。

原则一句： **能收敛成枚举就收敛成枚举** （这个仓库里已经有 `formatChecker.getStringFromFormat` 这类现成件），收敛不了再用正则。归一化必须在外层无条件执行。

### 3）安全配置迁出可热写域（两条通道一并处理）

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a4dd5a1f831f8afb.png)

-   **两条通道一起处理**：0x06 的对照表说明这里有两个洞。只改 `operationContext.js:114` 的合并（通道 A）而不管 `moduleReloader.js:97-100` （通道 B）， `canvasservice.js:67` / `converter.js:72-74` 这些 **模块加载期的** `config.get(...)` 仍然会被 `runtime.json` 影响 —— 因为它换掉的是全局 `config` 单例本身。最小改动是： `process.env.NODE_CONFIG` 那一步只允许注入 **非安全前缀** 的 key，或者干脆不把 `runtime.json` 合进 `NODE_CONFIG` 。
-   **强制基线读取**： `token.enable.*` 、JWT secret、 `runtimeConfig.filePath` 这类 key 只从 `moduleReloader.getBaseConfig()` 取。这个基线快照 **代码里已经存在** （ `operationContext.js:114` 就是它的调用方），所以修法不需要新基础设施 —— 只是把"安全敏感 key"从合并语义里摘出来。注意 `getBaseConfig()` 是 `moduleReloader.js:80` 在 **应用 runtime 层之前** 拍的快照（ `config.util.toObject()` ，含 `local.json` 但不含 `runtime.json` ），所以它正好是这里要的"只读基线"，语义是对的，只是没人用它做安全边界。
-   **key 白名单**： `runtimeConfigManager.getConfig()` 在 `JSON.parse` 之后、进 cache 之前按允许前缀过滤； `FileConverter.converter.*Path` 、 `*.args` 、 `token.enable.*` 、 `log.*` 直接拒绝进入 runtime 层。
-   **域隔离**： `runtime.json` 所在目录对应用进程只读挂载；配置更新走独立的、需鉴权的运维通道。 `saveConfig` / `replaceConfig` （ `runtimeConfigManager.js:96-122` ）已经是写接口 —— 它应该是唯一入口，且每次调用留审计记录。
-   `deepMergeObjects` **加保护**：跳过 `__proto__` / `constructor` / `prototype` 三个 key。一行的事，缺了就是全局原型可达。同理 `config.util.extendDeep` （通道 B 用的那把）也在没有 schema 的输入上递归。

### 4）可执行文件位置回归部署期事实

`x2tPath` / `docbuilderPath` / `args` 移出运行时可改通道（配置层做成 only-on-restart）。如果必须保留运行时读取，spawn 前做 `fs.realpathSync` + 安装根前缀断言 —— 和 ① 同一个 jail 思路，用在执行入口。

* * *

## 0x10 自查 Runbook

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/674d52a1f98f57ef.png)

按"检测口径优先于拦截口径"排。每条都是能直接复制的命令或规则。

### A. 版本与配置面

```bash
# runtimeConfig 开没开、指到哪儿
# 注意 DS 的 local.json 常带注释，node require 会解析失败，用 grep 更稳
grep -n -A3 '"runtimeConfig"' /etc/onlyoffice/documentserver/local.json

# runtime.json 存不存在、什么时候被写过
stat -c '%n mtime=%y size=%s uid=%u' /var/www/onlyoffice/Data/runtime.json
```

判据：正常运行期这个文件 **应该不存在或长期不变**。它存在且 mtime 新，就已经是事件，不需要别的证据。

### B. 文件完整性监控（本链路最高价值信号）

`auditd` ：

```plain
-w /var/www/onlyoffice/Data/runtime.json -p wa -k ds_runtime_cfg
-w /var/www/onlyoffice/Data/ -p wa -k ds_data_dir
# 0x06 副作用 1：同一个写原语还能改日志配置，与 runtime.json 同组监控
-w /etc/onlyoffice/documentserver/log4js/production.json -p wa -k ds_log_cfg
```

Falco（示意）：

```yaml
- rule: DocumentServer runtime.json modified
  desc: runtime config is hot-reloaded by DS processes
  condition: open_write and fd.name = /var/www/onlyoffice/Data/runtime.json
  output: >
    DS runtime.json write (file=%fd.name proc=%proc.pname
    cmdline=%proc.cmdline uid=%uid)
  priority: CRITICAL
  tags: [onlyoffice, config-integrity]
```

### C. 进程派生告警（可落地性最强的信号）

```yaml
- rule: docbuilder/x2t spawned from unexpected path
  desc: converter binaries must live under the install root
  condition: >
    spawned_process and proc.name in (x2t, docbuilder)
    and not proc.exepath startswith /var/www/onlyoffice/documentserver/
  output: unexpected converter spawn (exe=%proc.exepath parent=%proc.pname cmdline=%proc.cmdline)
  priority: CRITICAL
```

这条口径的好处：它不依赖载荷内容、不依赖扩展名字段形状，只看"被执行的文件的绝对路径在不在安装根下"。0x07 的因果如果真被打，这一条一定会响。

### D. 自身日志检索

`runtimeConfigManager.js:151` 在重载时打了一条 info，这是现成的金子：

```bash
journalctl -u ds-converter -u ds-docservice --since -24h \
  | grep -i "handleConfigFileChange reloading config"

grep -riE "checkPathTraversal (Path Traversal|Poison Null Bytes)" \
  /var/log/onlyoffice/documentserver/
```

第二条要提醒一句： `checkPathTraversal` 只在 FileConverter 路径上被调用（发现 1）， **这条日志没有命中不代表没有穿越**。它是"有则异常"，不是"无则安全"。

### E. 访问日志检测表达式

对 `downloadas` 请求做形状检测，不针对具体载荷：

```plain
# PCRE：cmd JSON 里 format 字段不是合法扩展名形状
"format":"(?![a-z0-9]{1,8}")

# 最高信号：反斜杠形式的上跳（见 0x05 —— 它在 Linux 上会被换成 /，是真穿越）
(\.\.\\){2,}

# 一般口径：正斜杠连续上跳 —— 按 0x04 更正后，这一条要覆盖 id / savekey / format 三个字段，
# 而不只是 format；合法 docId 没有任何理由包含 "../"
(\.\./){2,}

# 低信号，只当噪音处理：%2e%2e   %252e%252e   %00
```

按 0x04/0x05 的执行结果排过序：`..\` 那条是 **这条链上真正做了对照验证的形状** （去掉替换就不穿越），优先级最高； `(\.\./){2,}` 的覆盖面要按上面说的扩到三个 body 字段，因为我实测的四条逃出 root 的 key 里有两条走的是 `id` 、两条走的是 `filename` ； `%2e%2e` 一类到 storage 层已经是字面字符、不构成穿越，留着是为了减少噪音而不是因为它能挡住什么。别把两条写成一个严重度。

### F. WAF 临时拦截（非修复措施）

-   `format` 限定 `^[A-Za-z0-9]{1,8}$` 。
-   `id` 、 `savekey` 限定 `^[0-9a-zA-Z_=-]{1,240}$` （**注意把** `.` **从字符集里去掉**—— 我原先照抄 `DOC_ID_PATTERN` 写了含 `.` 的版本，那不对；而 0x04 更正之后这里还要再加一句： `DOC_ID_REGEX` **压根没有作用在 body 的** `id` **上** （全仓两个调用点都在别处），所以这不是"字符集太松"的问题，是"这条路上没有这道校验"的问题。WAF 上等于把缺失的白名单补在代理层）。
-   拒绝任何 JSON 字段值出现 `../` 、`..\` 、 `\0` 。 `%00` / `%2e%2e` 一类作为噪音规则可以加，但按 0x05 它们不是穿越向量，别按同等严重度配。
-   对 `/downloadas` 强制 JWT（等价于 `token.enable.browser=true` 的效果，但作用在代理层，不依赖应用配置）。 **这条同时覆盖了 0x06 那个"默认部署本来就是 false"的形态**—— 正因为应用配置里那个开关默认就是关的，把鉴权放到代理层才不是多余动作。

最后一句必须写清楚： **WAF 挡的是已知形状。发现 1 和发现 2 的边界缺失不会因为上了 WAF 就消失**，而且这条链上唯一相关的告警 `checkPathTraversal` （ `utils.js:1158, 1162` ，级别是 **warn** 不是 info/debug）在这条路上根本不会被调用 —— 也就是说应用自己不会为这次写入留下任何越界痕迹。再叠加 0x06 的副作用 1（ `log.options` 同域可改），日志的可信度要单独打折。

### G. 鉴权面核对（发现 3 的直接对应）

```bash
grep -n -A6 '"token"' /etc/onlyoffice/documentserver/local.json | grep -A6 '"enable"'
ls -l /etc/onlyoffice/documentserver/local.json
```

如果你依赖 JWT 做唯一鉴权，需要同时确认： `enable.browser` 与 `enable.request.inbox` 为 `true` ； `local.json` 权限不宽于 `0640` ；且 runtime 覆盖通道对应用进程不可写。三个条件少一个，"未授权可达"就是配置事实而不是漏洞技术问题。

### H. IOC 口径（B 级 — 源自公开研究的形态描述，不作为唯一依据）

-   `Data` 目录或 storage 根下新出现的 `runtime.json` / 非业务命名的 `.json`
-   `x2t` / `docbuilder` 从非安装根路径派生
-   `docservice` 进程新增出站连接到未知主机（配置里含外联 URL 时）
-   DS 日志出现 `handleConfigFileChange reloading config` 且无对应运维变更单

* * *

## 0x11 补丁状态的确认边界

这一节单独写，因为它是这类文章最容易糊过去的一格。

### 已确认（A 级）

-   我审计的四个原语在 `v9.4.0.97` （我 fetch 到的最新 9.4 tag）与 `master` HEAD 上 **逐行相同**，差异只有 AGPL 许可证头重写； `production-linux.json` 两个坐标完全一致（0 hunk）。 **这条要单独降级**：它是我在有网的环境里 `git fetch` + `git diff --stat` 跑出来的，离线读者拿到本仓库这份 clone（ `--depth 1` ）复现不了。按 B 级看，别当 A 级引用。
-   `production-linux.json` 默认设置 `runtimeConfig.filePath` 到 `Data/runtime.json` 。
-   `checkPathTraversal` 全仓库只有两个调用点，都在 FileConverter；它的 `docId` 形参在函数体里从未被使用。
-   `token.enable.browser` / `request.inbox` / `request.outbox` 在 `default.json` 是 `false` （harness 第 10 节直接读的）。
-   `DOC_ID_REGEX` 接受 `..`； **全仓两个使用点（** `server.js:243` **、** `converterservice.js:292` **）都不作用于** `downloadas` **的 body** `id` （harness 第 8 节的调用点扫描）。
-   `resolveConverterPath` 对绝对路径不做约束。
-   以上若干条不止"读到"，而是用 harness 调真实函数执行过（0x02 末）。执行清单现在分七组：12 种 key 形状进真实 `putObject` （4 种写到 root 外）、建议 jail 对同一批 key 的收敛、 `storage-fs.putObject` 的 **无反斜杠替换对照组**、 `DOC_ID_REGEX` 的 test/sanitize、三层 `deepMergeObjects` （含 `default.json` 实读值）、 `checkPathTraversal` 与 `DOC_ID_REGEX` 的调用点扫描、 `resolveConverterPath` 。
-   同时有一份 **执行范围声明** （harness 第 11 节）： `saveParts` / `commandSave` / `downloadAs` / `InputCommand` 没有被执行，key 是按 `canvasservice.js:424` 的形状人工拼的。凡是正文写"执行证据"的地方，指的是"这个 key 形状进 `putObject` 落在哪"，不包含业务分支本身。

### 执行复现纠正的判断

我按"读代码得到的图景"写完，然后用 **两轮执行 + 一轮独立审阅** 改了七处。第一轮（跑 harness）改了三条：

|     |     |
| --- | --- | 
| 原先的写法 | 执行后 |
| `docId = ".."` 是"合法 docid"，暗示它参与穿盘 | 单层 `../` 只越过 `cacheFolderName="data"` ，落点仍在 root 内 |
| `storage-base.js:64` 的反斜杠替换"不是过滤器，无害" | 它是 **Linux 上的穿越放大器**：不做这个替换， `path.join` 会把 `..\..\x` 当字面文件名（第 9 节有对照组） |
| `%2e%2e` 与 `../` 并列为穿越形状（0x10-E/F） | 到 storage 层已是字面字符，只是目录名。严重度不该同级 |

第二轮（补跑 body `id` 的多层用例 + 独立审阅）推翻了我第一轮的"纠正"，并揪出三处我读漏的东西：

|     |     |
| --- | --- | 
| 第一轮改成的写法 | 第二轮后 |
| " `docid` 单独不构成穿盘"，理由是 `DOC_ID_REGEX` 挡 `/` 给不出 `../../` | **错**：那个正则只挂在 URL 参数上，body 的 `id` 在 `:1543` 覆盖它且无约束。 `id="../../x"` 实测写出 root 外，与 `savetype` 无关（0x04） |
| "真正能写到 root 外的是发现 2"（0x05 原小节标题） | 错。 `id` / `savekey` / `format` 是三个并行载体，发现 2 不是必要条件（0x05 标题已改） |
| "runtime.json 能关掉鉴权开关，所以这条未授权可达" | 出厂 `browser` 本来就是 `false` 。这条论证的真正形态分两种部署：默认部署本来就无鉴权（与 runtime.json 无关），已加固部署才会被静默降级（0x06） |
| 配置注入只有一条 `deepMergeObjects` 通道 | 漏了 `moduleReloader.js:97-100` 那条（替换全局 `config` 单例，覆盖所有 `config.get` 直读）—— 独立审阅和我自己各指了一遍，0x06 新增一节 |
| CWE-647（0x05） | 贴错了。647 是"非规范 URL 路径用于授权决策"。改成 CWE-807 + CWE-184 |
| CWE-863 优先于 CWE-22（0x04） | 反过来了：后果就是 CWE-22，863 只在"为什么漏"这一层成立 |
| 0x10-F 说相关告警"日志级别 info/debug" | `checkPathTraversal` 是 `logger.warn` （ `utils.js:1158, 1162` ）—— 但更关键的是它在这条路上不会被调用，所以根本没有告警 |

七条里有五条是 **同一个失效**：把一个"看起来在保护"的东西（一个正则、一个 if 分支、一个默认值、一个 CWE 编号）当成"已经确认在保护"。前四条尤其说明问题 —— 我在第一轮纠正里 **又** 犯了同类错，因为我纠正的方式是"再读一遍"，而不是"把缺的那个用例跑上"。

第三轮的教训单独写进 0x12。

### 未确认（C 级，逐条说明受限原因）

-   **厂商是否把 0x06/0x07 这条链当作一个漏洞在跟踪、是否已在某个分支或内部构建里修复 —— 我不知道。** 我查 GitHub Advisory 时 `api.github.com` 返回 403 速率限制，本机没有 `gh` CLI，重试没有成功。 **我也还没有通过 ONLYOFFICE 的公开安全渠道提交**—— 这篇是源码审计笔记，不是披露记录；提交之后拿到什么答复我会在这里更新（见下面"我会更新的条件"）。
-   **事件 B 有没有 CVE、在不在 KEV —— 我不知道。**
-   `production-linux.json` **在真实打包部署里怎么被选中** （ `NODE_ENV` / `CONFIG_DEPLOYMENT` 的实际取值、包安装脚本或容器入口做了什么）我没有验证 —— 这条是 C 级推断。
-   **多租户模式下** `tenantConfig` **覆盖 runtime 层的实际影响** （0x06 第 10.3 节那行）只有次序是 A 级，形态没跑过。
-   `runtime.json` **在生产上到底能不能被这个写原语够到**：取决于两个目录是否同一文件系统、挂载方式、进程 uid。我一个都没测，也不打算测。
-   我在 0x07 写的因果是源码可达性分析，不是我验证过的利用。我没有任何一台装过 Document Server 的机器，也不会去搭。
-   "这个洞五年一直在野外被打"这类说法我无法背书。我核对到的只是：一个 2021 年的漏洞（事件 A，CVE-2021-3199， `<5.6.3` ）在 2026-10-09 进了 KEV。

**我会更新的条件** （把"未确认"变成有期限的承诺，而不是免责声明）：拿到厂商答复 → 更新 0x11 与图 4； Advisory API 解除限流或提交后拿到编号 → 更新 0x01 事件 B；有人在我这套 harness 上加跑 `saveParts` 分支（我没做的那步）→ 0x05 的口径可以升一档。

对自己写的这段，我的处理原则是： **未确认的补丁状态，就用"未确认 + 我核对了什么 + 我在什么条件下会更新"三件套。** 不写成暗示，也不为了文章的完整去猜一个数字。这类稿子最伤人的地方从来不是技术错，是"看起来已经确认了"。

* * *

## 0x12 结语

这次审计我真正想带走的是六句话：

1.  **一个守卫函数，调用点数少于写入路径数 —— 它就在错误的那一侧。** 不用读业务逻辑，30 秒能判。再加一条更便宜的： **看它的形参有没有被用到** （ `checkPathTraversal` 的 `docId` 就是一个从未被使用的参数，而那个输入正是这条链上唯一独立穿盘的字段）。
2.  `if (<请求可控>) { sanitize() }` **等于没 sanitize。** 安全属性不能挂在业务分支上，这条在 ONLYOFFICE 里表现为 `savetype` ，在你那儿可能表现为任何一个 mode/type/action 字段。
3.  **拼接 key 的每一个字段都要当成攻击者可控。** 我从 `format` 改到 `id` 只多跑了两个用例。三段拼接、三段来自 body —— 只收敛其中一段（哪怕是最"显然"的那段）都不够，这直接把修复位置从"输入校验"推到"层的入口"。
4.  **安全配置必须住在写原语够不到的域里。** ONLYOFFICE 的形态是"路径穿越能写到的文件里存着鉴权开关"；更常见的形态其实温和得多 —— CI 变量、能热改的 feature flag、应用自己可写的 `local.json` 。同一句话适用。 **并且要数清有几条注入通道**：我这个例子是两条（一条热、一条启动期），只堵一条等于没堵。
5.  **能跑的结论一定要跑 —— 但"跑过"不等于"跑对"。** 这条是我自己这次得到的、而且被强化了：harness 纠正了我三处，然后我基于那三处"已纠正"的结论又写错了一处更严重的（把只作用于 URL 参数的正则当成了 body 字段的约束）。读代码能判断"这里没有防护"，判断不了"这里也不会因为防护缺失而出事"；而 **只跑一个用例** （我当时只跑了单层 `..`）给出的仍然是读代码级别的结论。可执行的动作是：把"这个字段被某个校验挡住了"翻译成一条用例，跑它。
6.  **作者自审的边际收益很快就没了。** 0x11 那七条里，最重要的一条（ `docId` 那个矛盾）不是我读出来的，是我把稿子和源码交给一个不带作者偏见的审阅跑一遍才出来的；而另一条（漏掉 `moduleReloader` 那条通道）是我自己重读 0x06 时发现的 —— 两者都只在我 **主动去撞** 的时候才出现。写完就发的那类稿子，缺的不是文笔，是这一步。

图 3 那一栏"修复位置"我是故意留着不填的： **真正需要的是把安全不变量放在一个新代码绕不过去的位置**—— 层的入口、类型的约束、或者一条会红的 invariant 测试。参数级补丁的天花板就是"这个参数不再被打"，而缺陷住在层缺失里。

看到这儿如果你手上正好有个带存储抽象层的服务，先去跑 0x08 的第 2 条 grep（30 秒），再照附录那个 harness 的路子把你自己的唯一穿盘口调一次，看文件真的落在哪。我猜至少有一条会让你皱一下眉。

## 参考

-   `ONLYOFFICE/server` @ `d6df308` （master）、tag `v9.4.0.97` — 本文所有行号与配置值的来源
-   HKCERT 通报（2026-10-09）：CVE-2021-3199，Document Server `<5.6.3` ，5.6.3 修复
-   CISA KEV 目录
-   事件 B 的公开研究材料（我只引用其存在与影响版本范围，不复述其操作细节）
