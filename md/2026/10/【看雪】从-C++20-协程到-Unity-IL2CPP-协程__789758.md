---
title: 【看雪】从 C++20 协程到 Unity IL2CPP 协程
source: https://bbs.kanxue.com/thread-293204.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-12T22:11:29+08:00
trace_id: 00dc0479-de09-4732-8dcc-7a64ac3c9f28
content_hash: 2f2619771b68d9cbe71af510dee8aeca1d84867b7e57af6a82c426b6d019c6be
status: synced
tags:
  - 看雪
  - 游戏安全
  - .NET逆向
series: null
feed_source: 看雪·Android安全
ai_summary: 协程是编译器生成的状态机加一个状态号；C++20 的 `co_yield` 与 Unity C# 的 `yield return` 本质同源，只是驱动者不同。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3f775244-d011-81b8-9cd4-fe0c47675e1e
ioc:
  cves: []
  cwes: []
  hashes:
    - 001eaa1c1e8f52701d4761ed06b1bcdcf5e892c8
    - 075247933123d01e5aea6f192324dac00a03991c
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 协程是编译器生成的状态机加一个状态号；C++20 的 `co_yield` 与 Unity C# 的 `yield return` 本质同源，只是驱动者不同。
> 
> - **语言机制：** C++20 仅提供 `co_await/co_yield/co_return`，挂起时保存什么、谁恢复全部由自定义 `promise_type` 与 awaiter（`await_ready/suspend/resume`）决定；`co_yield i` 展开即"存值 + 记 state + return"。
> - **帧与 done：** 协程帧头两根固定为 resume/destroy 函数指针，第三格是内联 promise；帧大小 = 16 + sizeof(promise) + 形参/局部/状态号并向上取整。结束时 `frame[0]` 被清为 null，`done()` 即由此判定，`next()` = resume + !done。
> - **case 数量规律：** 几个挂起点对应几个 case；循环中单个 `co_yield` 靠 `goto` 复用同一状态号。Unity 源码 2 个 `yield return` → IL `switch` 三目标 → C++ `switch(state)` 三个 case。
> - **IL2CPP 转换：** 迭代器方法被编成隐藏状态机类（`<DoWork>d__6` → `U3CDoWorkU3Ed__6`，`<>` 转义为 U3C/U3E，并追加 SHA-1 唯一后缀）；DoWork 相当于 ramp 只 new 对象填捕获变量，逻辑在 `MoveNext` 的 switch 中。
> - **驱动与动态验证：** Unity 主线程每帧经 `il2cpp_runtime_invoke → Runtime::Invoke → SetupCoroutine.InvokeMoveNext → MoveNext`；hook `InvokeMoveNext` 可跟踪全部协程，`_RuntimeMethod_var` 文件里是打包 token，运行时才解析成 `MethodInfo*`。

> 一篇"刨根问底"的协程探索实践笔记
> 
> 不满足于"会用协程"，而是一路往下挖： **协程编出来长什么样？** 从 C++20 协程的汇编与内存开始，一步步探索到 Unity 的 C# 协程——用 il2cpp 工具 `Convert to CPP` 到底做了什么
> 
> 相信看完之后，你会对协程有更深刻的理解

* * *

## 0\. 什么是协程

**协程不是库、不是线程、也不是魔法栈**——它是编译器生成的"状态机 + 一个状态号"。  
**C++20 协程和 Unity 的 C# 协程，本质是同一回事**：编译器把 `co_yield` / `yield return` 拆成"状态机"，每个挂起点一个 `case` / `goto` ，并记住"挂在哪了"。

* * *

## 1\. 它是"语言机制"，不是库

C++20 只给了三个关键字：

-   `co_await` ：等待 / 挂起
-   `co_yield` ：产出一个值并挂起
-   `co_return` ：结束

至于"挂起时保存什么、谁来恢复、值放哪"，全部由 **你自己提供的类型** （ `promise_type` 、awaiter）决定

一个最朴素的生成器（用 `clang++ -std=c++20` 编译）：

```cpp
#include <coroutine>
#include <cstdio>
#include <exception>

struct Generator {
    struct promise_type {
        int current_value;
        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() noexcept { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() { std::terminate(); }
        std::suspend_always yield_value(int value) { current_value = value; return {}; }
    };

    std::coroutine_handle<promise_type> handle;
    explicit Generator(std::coroutine_handle<promise_type> h) : handle(h) {}
    Generator(const Generator&) = delete;
    Generator& operator=(const Generator&) = delete;
    Generator(Generator&& o) noexcept : handle(o.handle) { o.handle = {}; }
    ~Generator() { if (handle) handle.destroy(); }

    bool next() { handle.resume(); return !handle.done(); }   // resume + !done
    int value() const { return handle.promise().current_value; }
};

Generator counter(int n) { for (int i = 1; i <= n; ++i) co_yield i; }

int main() {
    auto g = counter(5);
    while (g.next()) std::printf("value = %d\n", g.value());
}
```

**名字规则**：外层类型名 `Generator` 随便改；但嵌套类型 **必须叫 `promise_type`** （除非特化 `std::coroutine_traits` ）。  
**成员规则**： `get_return_object / initial_suspend / final_suspend / unhandled_exception` 永远必须； `yield_value / return_void / return_value` 看函数体。

## 2\. 协程的"魔力"就三层：帧 + 状态机 + yield=goto

上面的 C++ 写法会用到很多编译器内建函数（详见 libc++ 的 `c++/v1/__coroutine/coroutine_handle.h` ）。  
下面这个是更直观的让大家理解协程的写法  
全部手工展开成普通 C++（无协程关键字），行为和原版 **逐字节一致**：

```cpp
struct CounterFrame {                    // ① 帧：存 promise、形参、局部变量、状态号
    Promise      promise;
    SuspendAlways aw;
    int     n = 0, i = 0;
    int     state = 0;
    bool    done = false;

    void resume() {                      // ② resume：switch(state) + goto 状态机
        switch (state) { case 0: goto start; case 1: goto resume_yield; default: return; }
    start:
        i = 1;
    loop:
        if (!(i <= n)) goto end;
        aw = promise.yield_value(i);     // ③ co_yield i  ⇒  promise.yield_value(i)
        if (!aw.await_ready()) { state = 1; aw.await_suspend(); return; }  // 挂起
    resume_yield:
        aw.await_resume(); ++i; goto loop;
    end:
        promise.return_void(); done = true; state = 2; return;
    }
};
```

**没有线程、没有魔法栈、没有运行时调度——就是一台状态机。**  
`co_yield i` 展开后就是"存值 + 记录 state + `return` "

一个小规律： **几个挂起点（yield），就有几个 case** \[ 当然是在不考虑编译器优化的情况下 \]

```cpp
for (int i = 1; i <= n; ++i) co_yield i;   // 源码里只有 1 个 co_yield
```

虽然运行时 yield 了 5 次，状态机 **只需要 1 个 case**——靠 `goto loop` 反复回到同一个 `state = 1` 复用。 **连续写两个 `co_yield` 才会有两个 case。** 这条规律后面在 Unity 的探索中里再次重现

## 3\. 汇编层面：帧里的指针是什么

上边这个伪代码只是向大家说明状态机这样一个基本的概念，现在继续使用最开始写法的那部分代码来编译 反汇编

用 `clang++ -std=c++20 -O2 -S` 生成汇编。 `counter(5)` 被编译成三个函数：

-   `_Z7counteri` ： **ramp** （分配帧）
-   `_Z7counteri.resume` ： **状态机**
-   `_Z7counteri.destroy` ： **销毁**

**ramp —— 分配帧、填两个函数指针** （用 r2 反编译；该函数 **只有 72 字节 / 15 条指令**）：

```
; r2: sym.counter_int_  (counter(int))   0x15e00, 共 72 字节
_Z7counteri:
    stp  x29, x30, [sp, -0x20]!      ; 序言
    stp  x20, x19, [sp, 0x10]
    mov  x29, sp
    mov  w19, w0                     ; w19 = n
    mov  w0, 0x20                    ; 帧大小 = 32 字节
    mov  x20, x8                     ; 
    bl   operator new(unsigned long) ; 分配 32 字节的协程帧
    adrp x8, 0x15000
    add  x8, x8, 0xea8               ; x8 = 0x15ea8 = _Z7counteri.resume
    adrp x9, 0x15000
    add  x9, x9, 0xef4               ; x9 = 0x15ef4 = _Z7counteri.destroy
    stp  w19, w19, [x0, 0x10]        ; 帧[+0x10] = n
    stp  x8,  x9,  [x0]              ; ★ 帧[+0]=resume, 帧[+8]=destroy
    str  x0, [x20]                   ; 把 handle(= 帧地址) 返回给调用者
    strb wzr, [x0, 0x1c]             ; 帧[+0x1c(=28)] = 状态号 = 0
    ldp  x20, x19, [sp, 0x10]        ; 尾声
    ldp  x29, x30, [sp], 0x20
    ret
```

> r2 把 `adrp + add` 解析成符号地址后， `x8 = 0x15ea8` 正好是 `_Z7counteri.resume` 、 `x9 = 0x15ef4` 正好是 `_Z7counteri.destroy` —— `stp x8, x9, [x0]` 当场坐实"帧\[0\]/帧\[1\] 是两根函数指针"。

**resume —— "挂起"就是 `strb 状态号` + `ret`** （同样很短， **76 字节**，完整贴出）：

```
; r2: sym.counter_int_ [clone .resume]   0x15ea8, 共 76 字节
_Z7counteri.resume:
    ldrb w8, [x0, 0x1c]          ; 读状态号 (+0x1c = +28)
    cbz  w8, 0x15ec4             ; 状态==0 → 首次进入
    ldp  w9, w8, [x0, 0x14]      ; 读 n(+0x14) 与 i(+0x18)
    cmp  w8, w9
    b.eq 0x15ee8                 ; i == n → 结束
    add  w8, w8, 1               ; ++i
    b    0x15ed4
    ldr  w8, [x0, 0x14]          ; (0x15ec4) 首次：读 n
    cmp  w8, 1
    b.lt 0x15ee8
    mov  w8, 1
    str  w8, [x0, 0x18]          ; (0x15ed4) 存 i
    str  w8, [x0, 0x10]          ; 存 current_value（promise）
    mov  w8, 1
    strb w8, [x0, 0x1c]          ; 状态=1
    ret                          ; ← 挂起
    str  w8, [x0, 0x10]          ; (0x15ee8)
    str  xzr, [x0]               ; ★ 帧[+0] = 0 → 标记 done
    ret
```

`.destroy` 同样很短，就是 `operator delete(帧, 32)` ：

```
; r2: sym.counter_int_ [clone .destroy]   0x15ef4, 共 8 字节
_Z7counteri.destroy:
    mov  w1, 0x20                    ; size = 32
    b    operator delete(void*, unsigned long)   ; 释放协程帧
```

### 帧的真实布局（Itanium C++ ABI）

```python
frame →
  +0    (*resume)(handle)     ← 固定
  +8    (*destroy)(handle)    ← 固定
  +16   promise 对象（内联）    ← 偏移固定（promise() 汇编：add x0, x8, #16）
  +16+S 形参 / 局部变量 / awaiter / 状态号   ← 偏移由编译器定
```

**或者是这样看：**

| 位置  | 内容  | 说明  |
| --- | --- | --- |
| `frame[0]` | **resume 函数指针** | ABI 固定；结束时被清成 `null` （ `str xzr,[x0]` ） |
| `frame[1]` | **destroy 函数指针** | ABI 固定；done 之后仍有效 |
| `frame[+16]` | **promise 对象** （内联，不是指针） | 存 `current_value` 等 |

> 一句话： **`g` （Generator）只是栈上一个 8 字节指针，指向堆上的帧；帧的头两根是函数指针，第三格才是数据（promise class instance）**

### 动手验证：把帧读出来

用内嵌汇编绕过 API 从 `g` 抠帧：

```cpp
void* frame = nullptr;
asm volatile("ldr %0, [%1]" : "=r"(frame) : "r"(&g) : "memory");   // 读 &g 的第一个 8 字节
void* resume  = ((void**)frame)[0];       // frame+0
void* destroy = ((void**)frame)[1];       // frame+8
int*  promise = (int*)((char*)frame + 16); // frame+16
```

操作日志（每次 `next()` 后 dump 三格）：

```python
before       frame[0] resume=0x..0aa0  frame[1] destroy=0x..0b54  frame[2] promise=0x3  done=0
after next#1 frame[0] resume=0x..0aa0  frame[1] destroy=0x..0b54  frame[2] promise=0x1  done=0
after next#3 frame[0] resume=0x..0aa0  frame[1] destroy=0x..0b54  frame[2] promise=0x3  done=0
after done   frame[0] resume=0x0 ←null  frame[1] destroy=0x..0b54  frame[2] promise=0x3  done=1
```

-   `frame[0]` （resume） **结束时变 null**—— 与汇编 `str xzr,[x0]` 对上；
-   `frame[1]` （destroy） **始终有效**；
-   `frame[2]` 就是 `promise.current_value` 。

### 两条推论

-   **`done()` 的实现**： `frame[0] == nullptr` （结束时协程把自己头指针清空）。用 `handle.resume()` 汇编印证——它就是"取 `frame[0]` → `blr` 间接调用"。
-   **`next()` = `resume()` + `!done()`**：直接调 `resume` 指针只是"前半步"

### 帧大小会随 promise 变大

`counter` 的帧是 `0x20` 。如果在 `promise_type` 里再加成员，帧会不会变大？我们改 `promise_type` 、用 `-O2` 重编、 **读 ramp 里 `operator new` 的立即数**：

| `promise_type` 内容 | `operator new` 大小 | 增量  |
| --- | --- | --- |
| `int current_value` （baseline） | **0x20** （32） | —   |
| `… ; int extra_int;` | **0x28** （40） | +8  |
| `… ; void* extra_ptr;` | **0x30** （48） | +16 |
| `… ; long extra_long;` | **0x30** （48） | +16 |
| `… ; int extra_int; void* extra_ptr; long extra_long;` | **0x38** （56） | +24 |

**结论：帧大小 = `16` （两根函数指针）+ `sizeof(promise)` + 形参/局部变量/状态号，再按对齐向上取整。所以 promise 一变大，帧就跟着变大。**

-   加 `int` 涨 8：4 字节本身 + 对齐补齐；
-   加 8 字节类型（指针 / `long` ）涨 16：前面的 `int` 被 **padding 到 8 字节对齐** 后再放 8 字节；
-   一次加 `int+指针+long` 涨 24（4+4 +8 +8）。

## 4\. 自定义 awaiter（协程的核心用法）

`co_yield` / `co_return` 只是产出/结束；协程真正的核心威力在 **`co_await` + 自定义 awaiter**——挂起时干什么、谁来恢复、恢复后拿什么，全由你定义。一个 awaiter 就三个成员：

| 成员  | 作用  |
| --- | --- |
| `await_ready()` | 能否不挂起就完成？（返回 `true` 就跳过挂起） |
| `await_suspend(h)` | 挂起时做什么（注册回调 / 起线程 / 排队） |
| `await_resume()` | 恢复后产出什么（= `co_await` 的值） |

举一个例—— **等 N 秒的 awaiter**：

```cpp
struct WaitForSeconds {
    double seconds;
    bool await_ready() const noexcept { return seconds <= 0.0; }   // <=0 秒不用挂
    void await_suspend(std::coroutine_handle<> h) const {
        std::thread([h, sec = seconds] {                           // 挂起时：起个计时器线程
            std::this_thread::sleep_for(std::chrono::duration<double>(sec));
            h.resume();                                            // 时间到，恢复协程
        }).detach();
    }
    void await_resume() const noexcept {}
};
```

一个完整的最小程序—— **连等 3 次（1、2、3 秒）**，这样就能看到" **每个 `co_await` 一个 case** "：

```cpp
#include <coroutine>
#include <cstdio>
#include <chrono>
#include <thread>
#include <atomic>

std::atomic<bool> g_finished{false};
std::chrono::steady_clock::time_point g_start;
double elapsed() { return std::chrono::duration<double>(std::chrono::steady_clock::now() - g_start).count(); }

struct Task {
    struct promise_type {
        Task get_return_object() { return {}; }
        std::suspend_never initial_suspend() noexcept { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        void return_void() {}
        void unhandled_exception() { std::terminate(); }
    };
};

Task timer_demo() {
    printf("[t=%.1fs] 开始\n", elapsed());
    co_await WaitForSeconds{1.0};                // 挂起点 ①
    printf("[t=%.1fs] 过了 1 秒\n", elapsed());
    co_await WaitForSeconds{2.0};                // 挂起点 ②
    printf("[t=%.1fs] 又过了 2 秒\n", elapsed());
    co_await WaitForSeconds{3.0};                // 挂起点 ③
    printf("[t=%.1fs] 再过了 3 秒\n", elapsed());
    g_finished.store(true);
    co_return;
}

int main() {
    g_start = std::chrono::steady_clock::now();
    timer_demo();                                // 启动：跑到第一个 co_await 挂起
    while (!g_finished.load()) std::this_thread::sleep_for(std::chrono::milliseconds(50)); // 锁住 避免主线程退出
    printf("[t=%.1fs] main: 完成\n", elapsed());
}
```

运行（1 秒、再 2 秒、再 3 秒）：

```python
[t=0.0s] 开始
[t=1.0s] 过了 1 秒
[t=3.0s] 又过了 2 秒
[t=6.0s] 再过了 3 秒
[t=6.0s] main: 完成
```

r2 反编译。 **ramp 跑到第一个 `co_await` 就挂起；此后每次进来都走 `.resume` ，靠状态号分派**：

```cpp
; ───────── ramp：跑到第一个 co_await 就挂起 ─────────
0x2fd8  mov  w0, 0x20                     ; 帧大小 0x20
0x2fdc  bl   operator new                 ; 分配协程帧
0x2ff4  stp  x8, x9, [x0]                 ; 帧[0]=.resume(0x3110) 帧[1]=.destroy(0x322c)
0x3024  bl   printf                       ; printf("[t=..] 开始")
0x302c  strb wzr, [x19, 0x11]             ; ★ 状态号 = 0
0x3030  str  x8,  [x19, 0x18]             ;    awaiter.seconds = 1.0
0x3040  bl   std::thread::thread<lambda>  ;    await_suspend：起线程，等 1 秒
0x3060  ret                               ;    → 挂起，交回调用者

; ───────── .resume：被计时器线程 resume 进来，靠状态号“分派” ─────────
_Z10timer_demov.resume (0x3110):
0x3120  ldrb w20, [x0, 0x11]              ; ★ 读状态号
0x3130  cmp  w20, 2                       ; ┐
0x3150  b.eq 0x3194                       ; │  状态分派
0x3154  cmp  w20, 1                       ; │  （= switch(state) 的形状）
0x3158  b.ne 0x31b8                       ; ┘

; ---- case 1（状态号==1：刚过第 2 个 co_await）----
0x3164  bl   printf                       ; printf("[t=..] 又过了 2 秒")
0x3168  mov  x8, 0x4008000000000000       ; 3.0
0x316c  mov  w9, 2
0x3170  str  x8, [x19, 0x18]              ; awaiter.seconds = 3.0
0x3174  strb w9, [x19, 0x11]              ; 状态号 = 2
0x3184  bl   std::thread::thread<lambda>  ; await_suspend：起线程，等 3 秒
0x3190  b    0x31ec                       ; → 收尾(dtor) + ret（挂起）

; ---- case 2（状态号==2：刚过第 3 个 co_await）----
0x319c  bl   printf                       ; printf("[t=..] 再过了 3 秒")
0x31a0  mov  w8, 1
0x31ac  stlrb w8, [x9]                    ; g_finished = true
0x31b0  str  xzr, [x19]                   ; 帧[0] = 0 → done
0x31b4  b    0x31f4                       ; → ret（结束）

; ---- case 0（状态号==0：刚过第 1 个 co_await）----
0x31c0  bl   printf                       ; printf("[t=..] 过了 1 秒")
0x31c4  mov  x8, 0x4000000000000000       ; 2.0
0x31c8  mov  w9, 1
0x31cc  str  x8, [x19, 0x18]              ; awaiter.seconds = 2.0
0x31d0  strb w9, [x19, 0x11]              ; 状态号 = 1
0x31e0  bl   std::thread::thread<lambda>  ; await_suspend：起线程，等 2 秒
0x31f4  ret                               ; → 挂起
```

**由此可以看出**：

-   **每个 `co_await` 对应一个状态号（0/1/2）和一个 case**—— `ldrb 状态号` 后面跟着 `cmp / b.eq / b.ne` ，这就是 `switch(state)` 的形状；
-   **每个 case 块里都是一次完整的 awaiter 三件套** （ `str` 存 `seconds` → `bl std::thread` 起线程 = `await_suspend` ； `ret` = 挂起）；
-   挂起前 `strb 状态号` 、恢复时 `ldrb 状态号` ——这就是"记住挂在哪"。

> 小坑： `await_ready()` 返回 `true` （ `seconds<=0` ）时会 **跳过 `await_suspend`**，所以"无论挂不挂都要发生"的逻辑别写进 `await_suspend` 。

* * *

## 第二部分 · Unity 的 C# 协程

> 前面看 C++ 协程走的是" **源码 → 汇编 → 帧内存** "。现在分析 Unity 的 C# 协程，用同一套路、 **三段编译 + 一段动态**：
> 
> **① C# → IL** （Roslyn；这时 `switch` 就已经显现）
> 
> **② IL → C++** （il2cpp.exe `--convert-to-cpp` ）
> 
> **③ C++ → `.so`** （NDK clang 编译 + 链接）
> 
> **④ 装上真机 · 动态验证** （IDA + Frida）

## 5\. 源码：一个 UI + Action 回调 + 协程

真实 Unity 工程里的 `CoroutineUIDemo.cs` ：界面上一个按钮，点一下启动"等 2 秒后调回调"的协程。

```csharp
public class CoroutineUIDemo : MonoBehaviour
{
    public Text statusText;
    public Button startButton;

    void Start() {
        statusText.text = "点击按钮开始";
        startButton.onClick.AddListener(OnButtonClick);          // 按钮 → 回调
    }

    void OnButtonClick() {
        Debug.Log("[UI] 按钮被点击");
        StartCoroutine(DoWork(2f, () => {                        // Action 回调
            statusText.text = "完成！";
            Debug.Log("[UI] 完成回调被调用");
        }));
    }

    IEnumerator DoWork(float seconds, Action onDone) {
        statusText.text = "处理中...";
        Debug.Log("[Co] 开始，等待 " + seconds + " 秒");
        yield return new WaitForSeconds(seconds);                // 挂起 ①
        Debug.Log("[Co] 等待结束");
        yield return null;                                       // 挂起 ②
        onDone?.Invoke();                                        // 调回调
    }
}
```

两个 `yield return` 。下面 **一步步看它被编译成了什么**。

## 6\. 第一步编译：C# → IL（switch 已经显现）

C# 编译器先把 `DoWork` 编成 IL。为了好读，去掉 Unity 依赖、写一个 **等价的最小版本** （结构一致）：

```csharp
public class CoroutineDemo {
    public static IEnumerator DoWork(float seconds) {
        Console.WriteLine("处理中...");
        yield return new WaitForSeconds(seconds);   // 挂起 ①
        Console.WriteLine("等待结束");
        yield return null;                          // 挂起 ②
        Console.WriteLine("结束");
    }
}
```

用 `ildasm` （ `ildasm /text /out:ildemo.il ildemo.dll` ）看它的 IL。 **`DoWork` 消失了，取而代之的是一个编译器生成的嵌套类 `<DoWork>d__0`**：

```php
.class auto ansi sealed nested private beforefieldinit '<DoWork>d__0'   // ← C# 编译器生成的状态机类
.field private int32  '<>1__state'      // 状态号
.field private object '<>2__current'    // 每一个 yield 出去的值
.field public  float32 seconds          // 捕获形参

.method instance bool MoveNext() cil managed {
    IL_0001:  ldfld  int32 CoroutineDemo/'<DoWork>d__0'::'<>1__state'
    IL_0006:  stloc.0
    IL_0007:  ldloc.0
    IL_0008:  switch  (IL_001b, IL_0046, IL_0067)   // !!! 三个 case
    IL_0019:  ldc.i4.0
    IL_001a:  ret                                    // 默认分支：return false（结束）

  IL_001b:  // ---- case 0 ----
    ldarg.0 ; ldc.i4.m1 ; stfld <>1__state           // state = -1
    ldstr "处理中..." ; call Console::WriteLine
    ldarg.0 ; ldfld seconds ; newobj WaitForSeconds ; stfld <>2__current
    ldarg.0 ; ldc.i4.1 ; stfld <>1__state            // state = 1
    ldc.i4.1 ; ret                                   // return true（挂起）

  IL_0046:  // ---- case 1 ----
    ... 
}
```

**在 IL 中**： `<>1__state` （int 状态号）+ `switch (IL_001b, IL_0046, IL_0067)` 三个分支 + 每段结尾 `stfld <>1__state; ldc.i4.1; ret` （存状态、返回 true = 挂起）。 **源码中 2 个 `yield return` 对应 2 个 case（另一个是初始）**

## 7\. 第二步：C# (IL) → C++（IL2CPP）

### 7.1 构建

IL2CPP **逐条把 IL 翻译成 C++**。在装了 Android IL2CPP 后端的 Unity 上批处理构建：

编译链路：

```python
C# 源码
  │ Roslyn
  ▼
迭代器方法 → 编译器生成的嵌套状态机类 <Xxx>d__N
  │ IL2CPP（il2cpp.exe --convert-to-cpp --dotnetruntime=Il2Cpp --platform=Android）
  ▼
C++（Library/Bee/artifacts/Android/il2cppOutput/cpp/Assembly-CSharp*.cpp）
  │ NDK clang 编译 + 链接
  ▼
libil2cpp.so → APK
```

### 7.2 先看一眼成品 —— 符号为什么又长又怪？

一打开 `Assembly-CSharp.cpp` ，随便摘一段 满屏都是这种名字

```cpp
struct U3CDoWorkU3Ed__6_t001EAA1C1E8F52701D4761ED06B1BCDCF5E892C8 : public RuntimeObject { ... };

IL2CPP_EXTERN_C IL2CPP_METHOD_ATTR RuntimeObject* CoroutineUIDemo_DoWork_m075247933123D01E5AEA6F192324DAC00A03991C (...);
```

`U3CDoWorkU3Ed__6_t001EAA…` 、 `_m0752…` ——又长又怪。原因就 **两条**：

**① `<>` 这种字符 C++ 不认，按 ASCII 编码**： `<` =0x3C→ `U3C` 、 `>` =0x3E→ `U3E` 。所以 IL 里的 `<DoWork>d__6` 变成 C++ 的 `U3CDoWorkU3Ed__6` ：

| IL（C# 生成） | C++（IL2CPP 生成） |
| --- | --- |
| `<DoWork>d__6` （状态机类） | `U3CDoWorkU3Ed__6` |
| `<>1__state` | `___U3CU3E1__state` |
| `<>2__current` | `___U3CU3E2__current` |

**② 每个类型/方法再拼一段 SHA-1** （40 位十六进制），保证全局唯一（重载、泛型、编译器生成名都不会出现重复）：

```python
U3CDoWorkU3Ed__6   _t001EAA1C1E8F52701D4761ED06B1BCDCF5E892C8
CoroutineUIDemo_DoWork   _m075247933123D01E5AEA6F192324DAC00A03991C
   └ 类名_方法名 ┘          └ _m ┘  └———— 该方法声明的 SHA-1 ————┘
类型是 <名字>_t<SHA1>；方法是 <类名>_<方法名>_m<SHA1>；字符串是 _stringLiteral<SHA1>。
```

所以"符号变怪" = **`<>` → `U3C/U3E` 的字符转义** + **`_t/_m<SHA1>` 的唯一化后缀**

### 7.3 成品一：状态机类（= 协程"帧"）

```cpp
struct U3CDoWorkU3Ed__6_t001EAA1C1E8F52701D4761ED06B1BCDCF5E892C8 : public RuntimeObject
{
    int32_t ___U3CU3E1__state;                   // <>1__state   —— 状态号（那个 int）
    RuntimeObject* ___U3CU3E2__current;          // <>2__current —— 当前 yield 值
    CoroutineUIDemo_t1320...* ___U3CU3E4__this;  // 捕获 this
    float ___seconds;                            // 捕获形参
    Action_tD00B0...* ___onDone;                 // 捕获 Action 回调
};
```

对照源码 `DoWork(float seconds, Action onDone)` ：它的形参、 `this` 、状态号、当前值… **全部变成了这个类的字段**——这就是"协程帧"。

### 7.4 成品二：DoWork（ramp，只造对象）

```cpp
RuntimeObject* CoroutineUIDemo_DoWork_m0752... (CoroutineUIDemo_t* __this, float ___0_seconds, Action_t* ___1_onDone, ...) {
    U3CDoWorkU3Ed__6_t* L_0 = il2cpp_codegen_object_new(U3CDoWorkU3Ed__6_il2cpp_TypeInfo_var);  // new <DoWork>d__6
    U3CDoWorkU3Ed__6__ctor(L_0, 0, NULL);          // state = 0
    L_0->___U3CU3E4__this = __this;                // 填捕获变量
    L_0->___seconds       = ___0_seconds;
    L_0->___onDone        = ___1_onDone;
    return L_0;                                     // 返回 IEnumerator
}
```

和 C++ 的 ramp 一样： **不跑逻辑，只把状态机对象和捕获变量准备好**。

### 7.5 成品三：MoveNext（就是 IL 里那个 switch）

```cpp
bool U3CDoWorkU3Ed__6_MoveNext_m5E19... (U3CDoWorkU3Ed__6_t* __this, ...) {
    int32_t L_0 = __this->___U3CU3E1__state;         // 读状态号
    switch (V_0) {                                     // ← 就是 IL 里的 switch
        case 0: goto IL_0022;
        case 1: goto IL_0080;
        case 2: goto IL_00a1;
    }
    return (bool)0;                                    // 结束

IL_0022:                                               // case 0
    __this->___U3CU3E1__state = (-1);
    statusText.text = "处理中...";
    Debug.Log("[Co] 开始，等待 " + seconds + " 秒");
    __this->___U3CU3E2__current = new WaitForSeconds(seconds);  // ★ 交给引擎
    __this->___U3CU3E1__state = 1;
    return (bool)1;                                    // ★ 挂起
IL_0080:                                               // case 1
    Debug.Log("[Co] 等待结束");
    __this->___U3CU3E2__current = NULL;                // ★ 等下一帧
    __this->___U3CU3E1__state = 2;
    return (bool)1;                                    // ★ 挂起
IL_00a1:                                               // case 2
    if (__this->___onDone) Action_Invoke(__this->___onDone);   // ★ 调回调
    return (bool)0;                                    // ★ 结束
}
```

**IL 里的 `switch (IL_001b, IL_0046, IL_0067)` 原封不动地变成了 C++ 里的 `switch (state)`**：源码 2 个 `yield return` → case 0/1/2 + 一个 `int` 状态号。

## 8\. 反汇编与动态分析

成品只是"纸面"，把它装到真机，动态探讨一下 （当然你也可以编译的时候就加debug参数 不去符号）

### 8.1 IDA：stripped 的.so 里怎么定位

IDA 载入的 `libil2cpp.so` 是 **strip 版**——方法名是 LOCAL HIDDEN，按名字找不到。手法： **从"未 strip"的 `libil2cpp.sym.so` 用 `llvm-readelf --syms` 取地址**，再到 stripped 库里补名、加注释：

| 函数  | 地址  |
| --- | --- |
| `CoroutineUIDemo_Start` | 0x99ADB8 |
| `CoroutineUIDemo_OnButtonClick` | 0x99BA74 |
| `<OnButtonClick>b__5_0` （lambda） | 0x99BC14 |
| `CoroutineUIDemo_DoWork` （ramp） | 0x99BB4C |
| `<DoWork>d__6::.ctor` | 0x99BBE4 |
| **`<DoWork>d__6::MoveNext`** | **0x99BCF4** |
| `<DoWork>d__6::Dispose / get_Current / Reset` | 0x99BCF0 / 0x99BF14,0x99BF54 / 0x99BF1C |

### 8.2 IDA：反编译 DoWork / MoveNext / OnButtonClick

**`DoWork` （0x99BB4C）= ramp**：只 `new <DoWork>d__6` + 填捕获变量。

```cpp
; C# IEnumerator DoWork(float seconds, Action onDone)   ABI: x0=this, s0=seconds, x1=onDone
99bb6c  MOV  X19,X1                    ; X19 = onDone
99bb70  MOV  V8.16B,V0.16B             ; V8  = seconds (float)
99bb74  MOV  X20,X0                    ; X20 = this
99bb94  BL   ...object_new(<DoWork>d__6)  ; new <DoWork>d__6  = 分配协程帧对象
99bba0  BL   <DoWork>d__6::.ctor(v6, 0)   ; 状态机构造
99bba8  STR  WZR,[X21,#0x10]           ; v6-><>1__state = 0   (状态号在 +0x10)
99bbac  STR  X20,[X0,#0x20]!           ; v6-><>4__this = this (+0x20)
99bbbc  STR  S8,[X21,#0x28]            ; v6->seconds = seconds (+0x28)
99bbc0  STR  X19,[X0,#0x30]!           ; v6->onDone = onDone  (+0x30)
99bbe0  RET                            ; return v6
```

**`MoveNext` （0x99BCF4）= 状态机** （= IL 里的 `switch` ）：

```kotlin
U3CDoWorkU3Ed__6_MoveNext:
99bd6c  LDR  W8,[X19,#0x10]            ; v3 = this-><>1__state  (读状态号)
99bd70  CMP  W8,#2
99bd74  B.EQ loc_99BE88                ; case 2 -> 调 onDone + 结束
99bd7c  B.EQ loc_99BEB0 (CMP#1)        ; case 1 -> 发 null (下一帧)
99bd80  CBNZ W8,loc_99BEA8             ; 其它 -> return 0
; ---- case 0 ----
99bde4  BLR  X9                        ; statusText.text = "处理中..."
99be18  BL   String.Concat             ; "[Co] 开始，等待 " + seconds + " 秒"
99be58  BL   new WaitForSeconds(...)
99be6c  STR  X20,[X19,#0x18]!          ; this-><>2__current = waitForSeconds  (+0x18)
99be7c  MOV  W0,#1                     ; return 1  // 挂起
99be80  STUR W0,[X19,#-8]              ; this-><>1__state = 1
; ---- case 2 ----
99be98  LDR  X9,[X8,#0x18]; BLR X9     ; onDone.Invoke()  (委托间接调用)
99bea8  MOV  W0,WZR                    ; return 0  // 结束
; ---- case 1 ----
99bee4  STR  XZR,[X19,#0x18]!          ; this-><>2__current = null
99bef8  ... (state=2)
99befc  MOV  W0,#1                     ; return 1  // 挂起
```

**`OnButtonClick` （0x99BA74）**：按钮点 → 建委托 → 起协程：

```
99bb00  BL   sub_11138F0               ; Debug.Log("[UI] 按钮被点击")
99bb08  BL   il2cpp_object_new         ; new Action
99bb1c  BL   Action::.ctor(this, <OnButtonClick>b__5_0_RuntimeMethod_var)
99bb2c  BL   CoroutineUIDemo_DoWork    ; DoWork(this, 2.0f, action) 返回 IEnumerator
99bb48  B    StartCoroutine            ; 交给引擎（native icall）
```

### 8.3 这里注意一点<OnButtonClick>b\__5_0_RuntimeMethod_var 或者说 RuntimeMethod_var 是什么?

构造 Action 委托时，C++ 里传了一个 `..._RuntimeMethod_var` 。IDA 里它在 `.data` 长这样：

```python
0x142ADB0   OnButtonClick_RuntimeMethod_var   DCQ 0x6000BAED
```

\*\*这个 `0x6000BAED` 不是指针 \*\* 它是 **打包的元数据 token**：

```cpp
GetEncodedIndexType(idx)   = (idx & 0xE0000000) >> 29   // 高 3 位 = 种类
GetDecodedMethodIndex(idx) = (idx & 0x1FFFFFFE) >> 1    // 其余 = 索引
```

高 3 位 `0b011=3` = `kIl2CppMetadataUsageMethodDef` ，索引 = **23926** （全局方法定义）。

**运行时它才变成真指针**——Frida 实测 `base.add(0x142ADB0).readPointer()` ：

文件里.data 处存的是 token，运行时才被解析成指针

```python
var p = Process.findModuleByName("libil2cpp.so").base.add(0x142ADB0).readPointer();
p.readCString();                       // 不是字符串，是 MethodInfo*
p.add(24).readPointer().readCString(); // ★ MethodInfo+24 = name

base + 0x142ADB0 的 16 进制 dump:
  ... 7b 07 00 60 | 20 f0 2a a1 70 | 18 ef 2a a1 70 | 31 28 00 60 ...
       0x6000077B     0x70A12AF020      0x70A12AEF18     0x60002831
       (token)        (已解析指针)        (已解析指针)      (token)
```

即： `_RuntimeMethod_var` 是 `RuntimeMethod*` （= `MethodInfo*` ）；文件里是 token、运行时被 `il2cpp_codegen_initialize_runtime_metadata` 解析成真指针

> *文中这些地址、SHA-1 后缀、以及这里的 token / 索引，都是我在多次写代码、多次编译运行的过程中陆续记下来的。所以你看到上面 `0x6000BAED` 和下面 dump 里的 `0x6000077B` 、以及各节的函数地址对不齐， **这是正常的**，看"形状 / 规律"就行，不必逐字对齐*

而 `RuntimeMethod` 到底啥结构 -> 在 `codegen/il2cpp-codegen-metadata.h` `il2cpp-class-internals.h` ：

```cpp
typedef MethodInfo RuntimeMethod;

typedef struct MethodInfo {
    Il2CppMethodPointer methodPointer;       
    Il2CppMethodPointer virtualMethodPointer;
    InvokerMethod       invoker_method;     
    const char*         name;
    Il2CppClass*        klass;
    ...
} MethodInfo;
```

### 8.4 MoveNext 是谁调的？

在 `MoveNext` 上打断点打印调用栈（ `breakWithStack(0x99bcf4)` ）：

```python
Start → OnButtonClick → new Action(lambda) → DoWork(ramp) → new <DoWork>d__6
  → MoveNext(state 0/1/2) → onDone.Invoke() → lambda

// 再结合运行时堆栈情况
0x716737a334 libil2cpp.so!0x112f334  SetupCoroutine::InvokeMoveNext(IEnumerator, IntPtr)  ← 直接调用者
0x7166b49f3c libil2cpp.so!0x8fef3c   il2cpp::vm::Runtime::Invoke
0x716be9e6b8 libunity.so!0x8396b8    ← 原生 Unity 引擎
0x7166b49e88 libil2cpp.so!0x8fee88   il2cpp_runtime_invoke
0x716ba858f4 libunity.so!0x4208f4    ← 原生 Unity 引擎
0x716ba9519c libunity.so!0x43019c    ← 原生 Unity 引擎（coroutine update / player loop）
```

IDA 反编译栈顶 `0x112F334` 确认它就是托管辅助方法：

```c
// UnityEngine.SetupCoroutine.InvokeMoveNext(IEnumerator enumerator, IntPtr returnValueAddress)
if (!enumerator) throw NRE;
result = enumerator.MoveNext();               // 调协程
*(uint8_t*)returnValueAddress = result & 1;   // 把 bool 写回引擎给的地址
```

**驱动链： `libunity.so` （原生引擎）→ `il2cpp_runtime_invoke` → `Runtime::Invoke` → `SetupCoroutine.InvokeMoveNext` → `MoveNext` 。** 全在主线程。

### 8.5 派生出结论 InvokeMoveNext = 抓所有协程

`BF("InvokeMoveNext")` 匹配到 **两个** 同名但不同的方法：

```python
0xfa053c   mscorlib: MoveNextRunner.InvokeMoveNext(Object)                     ← C# async/await（另一套）
0x112f27c  UnityEngine: SetupCoroutine.InvokeMoveNext(IEnumerator, IntPtr)     ← Unity 协程
```

对后者下断后，同一时刻连续命中很多 其中就有我们自己写的协程调用：

```python
...
enumerator = 0x74aa230770  UnityEngine.UI.CoroutineTween.TweenRunner`1+<Start>d__2[ColorTween]  ← Unity 内部协程
enumerator = 0x74aa23ca40  CoroutineUIDemo+<DoWork>d__6                                          ← ★ 我们的协程
...
```

两个参数： `enumerator` （入参）状态机对象； `returnValueAddress` （出参）地址引用

### 8.6 状态机对象里存了什么

结合运行时查看情况 `lfs(0x74aa23ca40)` ：

```python
<>1__state  = -1      (0..N = 挂在第 N 个 yield; -1 = 已结束)
<>2__current = null
<>4__this   = Runner (CoroutineUIDemo)
seconds     = 2
onDone      = <OnButtonClick>b__5_0  (MP:0x99bc14)
```

字段偏移： `state +0x10 / current +0x18 / __this +0x20 / seconds +0x28 / onDone +0x30` （对象头 0x10）  
其实就是我们静态分析看到的那些东西

* * *

## 第三部分 · 对照与总结

## 9\. 结论

### 9.1 yield return = 编译器生成的状态机（N 个 yield = N 个 case + 一个 int）

从 C# 到 IL 到 C++ 全程， `yield return` 方法都被编成一个隐藏类（IL 里叫 `<DoWork>d__0` ，C++ 里叫 `U3CDoWorkU3Ed__6` ），逻辑在 `MoveNext` 的 `switch(<>1__state)` 里。 **源码 2 个 `yield return` → IL `switch(3 个目标)` → C++ `switch(state)` 三个 case**——和 C++20 的 `co_yield` 同源， `<>1__state` 就是那个"挂在哪"的状态号。（注意的一点就是c++协程的状态不能说是像il2cpp一样这么规矩，它的状态不是一个单纯的变量记录的，更详细的分析可以自行去仔细看看汇编）

### 9.2 谁在驱动：C++ 靠你自己，Unity 靠引擎

-   **C++20**：没有驱动者， `await_suspend` 里"谁来 `resume` "完全由你（或你的 awaiter）决定
-   **Unity**： `StartCoroutine` 走 native icall 把状态机交给引擎，引擎每帧经 `il2cpp_runtime_invoke → Runtime::Invoke → SetupCoroutine.InvokeMoveNext` 调 `MoveNext` ，再按返回值和 `Current` （ `null` =下一帧、 `WaitForSeconds` =计时）决定何时再调，简单来说就是在update主线程中调用

### 9.3 那 6 个接口方法

| #   | 方法  | 作用  | 类比 C++20 |
| --- | --- | --- | --- |
| 1   | `.ctor(int <>1__state)` | 设状态号初值（被 ramp 以 0 调用） | ramp 里构造状态机对象那一步 |
| 2   | `IDisposable.Dispose()` | 提前终止时的清理钩子（跑 `finally` / `using` ）；本协程为空实现 | ≈ `destroy()` 的"清理"部分 |
| 3   | `MoveNext()` | 推进到下一 yield/结束，返回 bool | **`resume()`** |
| 4   | `IEnumerator<object>.get_Current()` | 返回当前 yield 值（ `<>2__current` ） | 读 `promise.current_value` |
| 5   | `IEnumerator.Reset()` | `throw NotSupportedException` | 无   |
| 6   | `IEnumerator.get_Current()` | 同 4（非泛型版） | 读 `promise.current_value` |

## 10\. C++20 协程 vs Unity 协程

| 概念  | C++20 协程 | Unity C# 协程 |
| --- | --- | --- |
| 状态存储 | 栈上的指针引用堆上的 **协程帧** | 编译器生成的 **状态机对象** （一个普通 C# 类实例） |
| 状态号（"挂在哪"） | **按需有** | `<>1__state` （对象 +0x10） |
| 挂起的值 | `promise.current_value` | `<>2__current` （对象 +0x18） |
| 单步执行 | `resume()` 走到下一挂起点 | `MoveNext()` 返回 true/false |
| 结束判据 | `handle.done()` （= `frame[0]==null` ） | `MoveNext()` 返回 false（ `state=-1` ） |
| 谁驱动 | **你的调度器** 调 `handle.resume()` | **Unity 引擎** 每帧调 `MoveNext` （主线程） |
| 等待语义 | 自定义 awaiter 的 `await_ready/suspend/resume` | `yield return` 出去的对象类型 |
| 销毁/清理 | `handle.destroy()` （跑析构 + 释放帧） | `Dispose()` （跑 finally；释放归 GC） |
| 编译产物 | 帧 + `.resume` /`.destroy` 状态机 | IL2CPP 翻译成 C++ 状态机类 |

## 附：一些发散性想法

**① 一个通用"Unity 协程跟踪器"**

```python
hook SetupCoroutine.InvokeMoveNext(IEnumerator enumerator, IntPtr retAddr):
    klass = *(void**)enumerator           // 读对象头 → 类名（过滤出想要的协程）
    state = *(int*)(enumerator + 0x10)    // 状态号
    cur   = *(void**)(enumerator + 0x18)  // 本次 yield 的值
    log(className, state, cur)
    // 函数返回后：读 *retAddr 一个字节 → 1=未结束 / 0=结束
```

把每个协程每次 `MoveNext` 的 **状态迁移 + yield 值** 实时打印出来——这就是"协程版调用跟踪器"。

**② 靠特征在"无符号二进制"里定位协程帧（C++ 协程帧）**

帧头两根连续的函数指针： `[+0]=resume` 、 `[+8]=destroy` 。汇编里表现为" **`new` 之后立刻往堆块头塞两个代码指针** "（像只有两个槽的 vtable）；其中 `destroy` 的函数体通常就是 `delete(frame, size)` ：

```
bl   operator new(size)          ; 分配帧
...                              ; 拿到帧指针 frame
adrp/add x8, <某函数>            ; = resume
adrp/add x9, <某函数>            ; = destroy
stp  x8,  x9,  [frame]           ; frame[0]=resume, frame[1]=destroy
```

或者说我们定位到这样的一个栈上指针引用堆协程帧以后  
我们就可以直接通过 `frame_ptr ? ((void(*)())((void**)frame_ptr)[0])() : (void)0;`控制协程的调用

**③ NDK 里"谁来 resume"？——ALooper**

C++20 把"谁来驱动"完全留白给你；Unity 用 PlayerLoop / `Update` 每帧替你调 `MoveNext` 。那 Android NDK 里有没有这个角色？有的，兄弟，有的—— **`ALooper`**： `android_main` 里 `android_app::looper` 那个事件循环，就是 native 版的 PlayerLoop。

```cpp
while (!app->destroyRequested) {
    ALooper_pollOnce(-1, nullptr, &events, &data);   // 你的 "Update"
    drain_ready_coroutines();                        // 就绪的 handle 挨个 resume
}
```

`await_suspend` 只负责"挂号"（入队 + 用 `eventfd` / `ALooper_wake` 把 loop 唤醒），回调负责 `h.resume()` ——无非是把 Unity 的"每帧 poll → MoveNext"换个底座自己搭一遍。一句话对照： **`ALooper` ≈ PlayerLoop， `h.resume()` ≈ `MoveNext()`**。而 looper 是线程本地的，恢复天然发生在 loop 线程，和 Unity 一样是 **单线程分帧**。

* * *

> 以上就是我自己的一点发散思考，兄弟们要是觉得哪里歪了、或者有更骚的思路，欢迎评论区发表自己的看法
