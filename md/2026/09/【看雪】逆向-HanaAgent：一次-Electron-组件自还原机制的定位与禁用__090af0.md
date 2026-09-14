---
title: 【看雪】逆向 HanaAgent：一次 Electron 组件自还原机制的定位与禁用
source: https://bbs.kanxue.com/thread-292945.htm
source_host: bbs.kanxue.com
clip_date: 2026-09-14T13:54:45+08:00
trace_id: 3eda9172-4e1e-49d5-8036-22ea46c51045
content_hash: 49928bcedb976f528e69f40e70047d3d86c60b8bb454b40296d02432afa30fa2
status: synced
tags:
  - 看雪
  - Windows逆向
  - 安全工具
series: null
feed_source: 看雪·逆向工程
ai_summary: HanaAgent 补丁被还原的真凶是主进程 `decideBootAction` 在切换 channel 后从 seed 归档覆盖 server；用等长替换禁用该分支并断掉 OTA 地址即可。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3db75244-d011-81ce-bdef-eb0ba4d96963
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> HanaAgent 补丁被还原的真凶是主进程 `decideBootAction` 在切换 channel 后从 seed 归档覆盖 server；用等长替换禁用该分支并断掉 OTA 地址即可。
> 
> - **故障现象：** file-history 模块递归扫工作区 26.8 万文件，启动耗时 70 秒；文件监听在并发写时反复报 `workspace watch event without filename`，最终以退出码 0xC0000409 fail-fast。
> - **首次失败：** 在 `bundle/index.js` 里让 `syncWorkspaces()` 直接 return，启动从 70 秒降到 0.9 秒，但四十多小时后文件被还原、耗时复原。
> - **真正触发点：** beta 切到 stable 后 stable 无 resolved，`decideBootAction` 返回 `activate-seed`，调用 `activateFromArchive` 覆盖 versionDir。触发条件共三种：解析不出当前版本、seed 版本更高、train 为 0 且 sha256 不匹配。
> - **前置确认：** 用 32 字节标记 `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` 定位 exe 内 fuse，读出 `EnableEmbeddedAsarIntegrityValidation=0`（asar 可改）、`EnableNodeCliInspectArguments=1`；三处 sha256 校验的都是归档而非解包目录。
> - **改法与验证：** 函数体内 3 处 `"activate-seed"`（15 字符）等长换成 `"seed-disabled"`，调用方 2 处保留；OTA 域名 `github.com` 换成等长的 `invalid.io`；文件仍为 52399789 字节，`node --check` 通过，OTA 报 4096 字节超限错误。

> 本文仅用于安全研究与技术学习，请勿用于任何违法用途。

## 背景

手上在用 HanaAgent 这个开源 AI Agent，Electron 写的，本机 0.450.0。用着用着发现它有个毛病：内置了一个叫 file-history 的模块，专门记录工作区文件的历史版本。这模块会把整个工作目录递归扫一遍，而我那个工作目录里攒了 26.8 万个文件，光一个子目录就 23.5 万，每次它启动的时候光是这一步就要花 70 秒。

慢也就算了，更难受的是它那个文件监听器，在多个任务并行往工作区写文件的时候，会不停地刷 `workspace watch event without filename` ，刷着刷着 server 就崩了，退出码 0xC0000409，fail-fast。

于是想把这块干掉。

## 一、首次尝试：先改 server，但被还原了

file-history 的逻辑打包在 server 的 bundle 里，就是 `bundle/index.js` 。它的服务类只有一个监听入口 `syncWorkspaces()` ，翻源码的时候还看到头顶注释写着"可整块摘除"，那还不简单，方法开头直接 `return` 就行。

改完立竿见影，server 启动从 70 秒掉到 0.9 秒。我以为完事了。

改完四十多个小时后，某天早上启动，发现文件又变回去了，启动时间也回到原来那个数。

这场景太熟了。以前跟别的客户端自校验死磕过，就是这么个循环：改客户端逻辑，被还原；把本地校验值也改了，还是被还原；兜了一圈才明白校验值根本不归本地管。看来这次又是一个客户端自校验的坑，只是从 native 换成了 Electron。

## 二、寻找源头：先把 app.asar 扒开

Electron 的业务代码都在 `app.asar` 里。这个格式挺简单，头部是一串 pickle 字段：头 4 字节是 pickle 长度，然后依次是两个内层 pickle 长度字段和 JSON 字符串长度，之后才是 JSON 索引，索引之后才是文件数据。用 Python 拆开：

```python
import struct, json
d = open('app.asar','rb').read()
jss = struct.unpack('<I', d[12:16])[0]        # JSON 索引字符串长度
header = json.loads(d[16:16+jss].decode())    # 索引从第 16 字节开始
data_start = 16 + ((jss + 3) & ~3)            # 数据区起点（JSON 后按 4 字节对齐）
# 每个文件在索引里有 offset / size，内容就是 d[data_start+offset : data_start+offset+size]
```

这里得留意对齐：JSON 索引和文件数据之间还隔着一段 padding，要补齐到 4 字节边界。本机这个 asar 的 JSON 长度正好是 4 的倍数，所以 `16 + jss` 碰巧也对；换个 asar 就可能差 1 到 3 字节，marker 就永远找不着了。

扒开看，顶层是 `node_modules` 、 `desktop` 、 `package.json` 、两个 release-digest、 `shared` 。业务逻辑主要在 `desktop/main.bundle.cjs` ，982KB，被压成了一整行。

动手之前有件事得先确认。Electron 有一组叫 fuse 的开关，其中一个是 `EnableEmbeddedAsarIntegrityValidation` ，它要是开着，你动 app.asar 一个字节应用就直接拒绝启动，所以先把它读出来。

fuse 数据藏在 exe 里，有个固定的起始标记（32 字节），标记之后紧跟 version 和 count，再后面才是一个个 fuse 值。每个值占一个字符， `'0'` 关、 `'1'` 开：

```python
d = open('HanaAgent.exe','rb').read()
SENT = b'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX'   # 32 字节
i = d.find(SENT)
ver = d[i + 32]              # version（偏移相对标记起点）
cnt = d[i + 33]              # fuse 个数
vals = d[i + 34 : i + 34 + cnt]
```

读出来是这样（这版 Electron 的 wire 是 9 个）：

```python
[0] RunAsNode                              = 1  开
[1] EnableCookieEncryption                 = 0  关
[2] EnableNodeOptionsEnvironmentVariable   = 1  开
[3] EnableNodeCliInspectArguments          = 1  开
[4] EnableEmbeddedAsarIntegrityValidation  = 0  关   ← 关键
[5] OnlyLoadAppFromAsar                    = 0  关
[6] LoadBrowserProcessSpecificV8Snapshot   = 0  关
[7] GrantFileProtocolExtraPrivileges       = 1  开
[8] WasmTrapHandlers                       = 1  开
```

那个完整性校验是 0，关着的，那 app.asar 就可以随便改，不用担心起不来。另外 CliInspectArguments（也就是上面第 3 项 `EnableNodeCliInspectArguments` ）也是开的，理论上能直接挂 DevTools 单步调试，比硬看压缩代码强多了。

## 三、深入探究：sha256 到底在校验什么

回过头想它是怎么发现我改过文件的。`.hanako\artifacts\` 下有三个地方都记着 server 的 sha256： `pointers\stable.current.json` 、seed 那份清单 `seed-train-win32-x64.json` ，还有解包目录里的 `.verified` 。

一开始我理所当然地认为，这个 sha256 是拿来校验"解包后的 server 目录"的，我改了目录里的文件，哈希对不上，所以被判损坏、触发了还原。

验证下来不是这么回事。我把内置的那个归档 `server-0.450.0-win32-x64.tar.gz` 拿过来算了一遍 sha256，正好等于清单里写的那个 `a75af633...`。这三个地方记的，全是归档文件的哈希，跟解包出来的目录没关系。

那我改解包目录，它自然发现不了。

## 四、发现根源：真正的还原开关

在 main.bundle.cjs 里翻到 `decideBootAction` 的时候，找到了关键。压缩后的名字是 `v` ，参数按位置一一对应 `{resolved, seedEntry, crashFallback}` ，我按逻辑重写了一下：

```javascript
function decideBootAction({ resolved, seedEntry, crashFallback }) {
  if (!resolved)                                    return "activate-seed"; // 1
  if (crashFallback)                                return "boot";
  const ptr = resolved.pointer;
  const cmp = compareVersion(seedEntry.version, ptr.version);              // 2
  return cmp !== null
    ? (cmp > 0 ? "activate-seed" : "boot")
    : ((Number.isInteger(ptr.train) ? ptr.train : 0) === 0
        && ptr.sha256 !== seedEntry.sha256                                  // 3
          ? "activate-seed" : "boot");
}
```

调用它的地方长这样。整个文件里有两处调用（一处 server、一处 renderer，逻辑一样），下面贴 server 这处：

```javascript
let version = await resolveBoot(channel, homeDir);
const action = decideBootAction({ resolved: version, seedEntry, crashFallback });
if (action === "activate-seed") {
    // 从 seed 归档解包，覆盖掉 versionDir
    await activateFromArchive(seedArchivePath, manifest, { ..., allowReplaceProtected: true });
    version = await resolveBoot(channel, homeDir);
}
```

只要返回 `"activate-seed"` ，它就从 seed 归档重新解包，把 `versionDir` 整个覆盖一遍，补丁就是这么没的。

触发它返回 `"activate-seed"` 的有三种情况：一是解析不出当前版本，比如换了 channel、新 channel 还没指针；二是 seed 里的版本比当前高；三是 train 为 0 而且指针里的 sha256 跟 seed 对不上。

我那次是第一种。之前跑的是 beta channel，还原前一天晚上我把 channel 从 beta 手动切到了 stable，切完之后 stable 这边还没有 resolved，于是直接走进 `activate-seed` ，从 seed 解包覆盖。

`activateFromArchive` 里也有 sha256 校验，不过校验的同样是归档，官方归档必然通过，通过后照样覆盖。干掉补丁的是这次覆盖，跟哈希校验无关。

## 五、继续探索：还有一条 OTA

只堵 decideBootAction 不够。搜 `artifact-ota` 的时候发现另一条路：它还会定时去远端拉 channel 清单，有新版本就下载下来激活。清单地址写死在代码里：

```javascript
T = "https://github.com/liliMozi/openhanako/releases/download/channels";
function M(ch){ return [`${T}/${ch}.json`]; }
```

这里有个容易踩的点：设置里那个"自动检查更新"开关，只管应用自身的更新，管网不了这套组件 OTA。我明明关着自动更新， `ota-state.json` 还是照常更新，就是因为它走的不是同一个开关。

## 六、动手修改

改 app.asar 有个省事的做法：不解包重打包，而是在原始字节上做等长替换。只要替换前后长度一样， `main.bundle.cjs` 的大小就不变，asar 索引里的 offset 和 size 都不用动，直接原地换字节就行。

第一处，把 decideBootAction 从 seed 激活这条路废掉。它函数体里有三处 `"activate-seed"` ，全部等长换成 `"seed-disabled"` ：

```python
"activate-seed"   15 个字符（含引号）
"seed-disabled"   也是 15 个字符
```

改完它永远不会返回 `"activate-seed"` ，调用方那个判断永远不成立，也就永远不会从 seed 覆盖了。注意调用方自己那两处 `"activate-seed"` 得留着，所以我是按函数体的范围精确替换的，不能全局替换。

第二处，把 OTA 的取数地址断掉，域名换成一个跟官方无关的：

```python
https://github.com/...   改成   https://invalid.io/...
```

`github.com` 和 `invalid.io` 都是 10 个字符，等长。这个域名当时在我这台机上会返回一段超长内容（后面日志能看到），总之它拿不到合法清单了。

脚本核心就三段：定位区间、花括号配对替换、等长断言。完整脚本我放文末了，正文只留关键逻辑：

```python
# 1. 定位 main.bundle.cjs 在 asar 里的区间
off, size = find_entry(header, '/desktop/main.bundle.cjs')
text = bytes(d[off:off+size]).decode('utf-8', 'ignore')

# 2. 按花括号配对取出 decideBootAction 函数体，只改函数体内
i = text.find('function v({resolved:S,seedEntry:z,crashFallback:T}){')
marker = 'function v({resolved:S,seedEntry:z,crashFallback:T}){'
j = i + len(marker); depth, k = 1, j
while depth > 0:
    depth += text[k] == '{'; depth -= text[k] == '}'; k += 1
func = text[i:k]
newfunc = func.replace('"activate-seed"', '"seed-disabled"')

# 3. 等长断言，长度不等就不写
assert len(newfunc.encode()) == len(func.encode())
text = text[:i] + newfunc + text[k:]
text = text.replace('https://github.com/liliMozi/openhanako/releases/download/channels',
                    'https://invalid.io/liliMozi/openhanako/releases/download/channels')
assert len(text.encode()) == size
```

出来的文件和原来大小一模一样，这边是 52399789 字节。

改完覆盖的时候要注意，app.asar 在 Program Files 下面，而且运行的时候被 HanaAgent.exe 占着。得先把 HanaAgent 整个退干净，含托盘，确认 HanaAgent.exe 和 hana-server.exe 都没了，再用管理员权限的 PowerShell 覆盖，覆盖之前备份一下原来的：

```powershell
Copy-Item "C:\Program Files\Hanako\resources\app.asar" "C:\Program Files\Hanako\resources\app.asar.orig" -Force
Copy-Item "C:\Users\<user>\.hanako\app.asar.patched" "C:\Program Files\Hanako\resources\app.asar" -Force
```

然后重开 HanaAgent。

## 七、验证

把改完的 main.bundle.cjs 抽出来跑 `node --check` ，返回 0，语法没坏。

再直接读改完的 app.asar，数一下：

```python
seed-disabled : 3 处
invalid.io    : 1 处
activate-seed : 2 处   （调用方的判断，保留）
github .../channels : 0 处
大小 52399789 字节，跟原来一样
```

跑起来看，server 启动日志里 `初始化完成（0.7s）` ，file-history 一点动静都没有。再看 `ota-state.json` ， `lastError` 变成了：

```python
artifact-ota: GitHub channel manifest request failed:
response exceeded 4096 bytes for
https://invalid.io/liliMozi/openhanako/releases/download/channels/stable.json.sig
```

它现在被这个地址挡在门外，拿不到东西了。

## 八、小结

整个过程跟以前折腾客户端自校验是一回事：真正决定要不要还原的，不是你改的那一层。往上一层找到那个判断，关掉它。

不过这毕竟是 Electron 应用，有几个地方跟 native 不太一样，记一下。动手前先看 fuse 里那个 asar 完整性校验开没开；sha256 记的是哪一层要弄清楚，这次记的是归档，改解包目录本来就不触发；改 asar 用等长替换省事；还有就是别漏了 OTA，它跟本地还原是两套东西。

HanaAgent 这项目是开源的，写这篇主要是留个记录。file-history 崩溃和启动全量扫描这两个问题，提个 issue 给作者，比每个人各自打补丁强。

* * *

### 附：完整脚本

```python
import struct, json

SRC = r'C:\Program Files\Hanako\resources\app.asar'
d = bytearray(open(SRC, 'rb').read())
jss = struct.unpack('<I', d[12:16])[0]
header = json.loads(d[16:16 + jss].decode())
data_start = 16 + ((jss + 3) & ~3)


def walk(node, pre=''):
    for name, info in node['files'].items():
        rel = pre + '/' + name
        if 'files' in info and 'offset' not in info:
            yield from walk(info, rel)
        else:
            yield rel, info


off = size = None
for rel, info in walk(header):
    if rel == '/desktop/main.bundle.cjs':
        off, size = data_start + int(info['offset']), int(info['size'])
        break

text = bytes(d[off:off + size]).decode('utf-8', 'ignore')

marker = 'function v({resolved:S,seedEntry:z,crashFallback:T}){'
i = text.find(marker)
j = i + len(marker)
depth, k = 1, j
while depth > 0:
    if text[k] == '{':
        depth += 1
    elif text[k] == '}':
        depth -= 1
    k += 1
func = text[i:k]
newfunc = func.replace('"activate-seed"', '"seed-disabled"')
assert len(newfunc.encode()) == len(func.encode())
text = text[:i] + newfunc + text[k:]

text = text.replace('https://github.com/liliMozi/openhanako/releases/download/channels',
                    'https://invalid.io/liliMozi/openhanako/releases/download/channels')
assert len(text.encode()) == size

d[off:off + size] = text.encode()
open('app.asar.patched', 'wb').write(d)
```
