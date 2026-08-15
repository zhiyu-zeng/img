---
title: 【看雪】详细分析MSVC中std::string对象内存布局
source: https://bbs.kanxue.com/thread-292538.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-16T03:30:30+08:00
trace_id: 7c906170-10e5-46f3-bdf7-8881a963dbe5
content_hash: f5890ee358b2213949112ecd04323eca10d0c06a6f4bb3ac12ba29a93a702e73
status: synced
tags:
  - 看雪
  - Windows逆向
  - C++STL
series: null
feed_source: 看雪·逆向工程
ai_summary: MSVC 的 std::string 使用短字符串优化：长度不超过15字符（char）时数据直接存在对象内部栈上，避免堆分配；超长才改用堆指针，x64/Release 下对象大小为32字节。
ai_summary_style: key-points
images_status:
  total: 11
  succeeded: 11
  failed_urls: []
notion_page_id: 3bd75244-d011-816d-b660-e75f553840d4
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> MSVC 的 std::string 使用短字符串优化：长度不超过15字符（char）时数据直接存在对象内部栈上，避免堆分配；超长才改用堆指针，x64/Release 下对象大小为32字节。
> 
> - **SSO 判定规则：** 小模式当 `_Myres == _Small_string_capacity`（即 `16/sizeof(char)-1 = 15`）时成立，数据存放在 `_Bx._Buf` 内；大模式 `_Myres > 15`，数据存放在 `_Bx._Ptr` 指向的堆缓冲中，实际分配 `_Myres + 1` 个元素以容纳结尾 `'\0'`。
> - **内部结构：** `basic_string` 唯一成员是 `_Compressed_pair<_Alty, _String_val>`，利用 EBCO 将无状态分配器压缩为0字节；`_String_val` 内含 `_Bxty` 联合体（SSO 缓冲 16 字节 / 堆指针 8 字节）、`_Mysize`（当前长度）和 `_Myres`（当前容量）。
> - **对象大小：** 在 Release（`_ITERATOR_DEBUG_LEVEL == 0`）下，x64 为 32 字节、x86 为 24 字节；Debug（默认 IDL=2）下 `_Container_base` 不再为空基类，多出 `_Container_proxy* _Myproxy` 指针，因此对象增大 8/4 字节。
> - **Debug/Release 影响：** Debug 模式由 `_DEBUG` 宏驱动 `_HAS_ITERATOR_DEBUGGING = 1`，最终使 `_ITERATOR_DEBUG_LEVEL = 2`；此影响波及 vector、list、map 等所有标准容器，其内部节点或基类也会携带 `_Myproxy` 指针。
> - **逆向识别：** 构造 std::string 时长度校验部分会出现特征字符串 `"stirng too long"`，可据此在二进制中定位并识别 std::string 对象。

std::string的内存布局没有统一标准，由各个C++标准库的实现者决定。目前主流的实现有两种截然不同的策略：

-   libstdc++ (gcc)：写时复制（COW）
-   libc++ (clang)/MSVC：小字符串优化（SSO）

我们在此重点分析MSVC中std::string对象的内存布局。

**MSVC 中 std::string 的短字符串优化 (SSO) 核心是：当字符串长度 ≤ 15 个字符（对于 char 类型）时，数据直接存储在 std::string 对象内部的栈上，从而避免了昂贵的堆内存分配。**

## STL源码分析

### std::string的定义

我们跳转到std::string的定义处：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e5c2c56fa81483f2.webp)

我们看到的 `using string = basic_string<char, char_traits<char>, allocator<char>>;`是 std::string 的类型别名定义，真正的实现细节都隐藏在 basic_string 这个模板类里。

### basic_string

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/237d1c2e45efbc14.webp)

basic_string 类本身只声明了一个数据成员 \_Mypair，真正的状态存放在它内部的 \_String_val 里：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/021e4d41c2a72661.webp)

-   \_Alty = \_Rebind_alloc_t<\_Alloc, \_Elem>：把用户给的 \_Alloc 重绑定到元素类型上的分配器。
-   \_Scary_val = \_String_val<...>：实际存放数据的地方。
-   \_Compressed_pair 利用 EBCO（空基类优化）：当分配器是空类型（无状态，如 std::allocator）时，它不占任何字节，被压缩进 pair 里，因此不增加对象大小。

在C++中，空基类优化（Empty Base Optimization，简称EBO） 是一项由C++标准允许、编译器执行的优化技术。它允许一个空的基类子对象在派生类中不占用任何内存空间。EBO的核心在于，C++标准不强制要求基类子对象也必须拥有独立的地址。这为编译器优化提供了空间。

### \_String_val

这是真正的容器：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a7607c7584d5507c.webp)

对于\_Container_base，当 \_ITERATOR_DEBUG_LEVEL!= 0 时它含一个 \_Container_proxy\* \_Myproxy（迭代器调试用的代理指针）；为 0 时是空基类，不占空间。

在\_String_Val内部，有三个重要的成员：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/60ea55a36e21f5df.webp)

以伪代码进行说明：

```cpp
template <class _Val_types>
class _String_val : public _Container_base {
    ...
    static constexpr size_type _BUF_SIZE = 16 / sizeof(value_type) < 1 ? 1 : 16 / sizeof(value_type);
    static constexpr size_type _Alloc_mask = ...;   // 堆分配容量向上取整的掩码 [0,15]
    static constexpr size_type _Small_string_capacity = _BUF_SIZE - 1;
    ...
    union _Bxty {
        _CONSTEXPR20 _Bxty() noexcept : _Buf() {}
        _CONSTEXPR20 ~_Bxty() noexcept {}

        value_type _Buf[_BUF_SIZE]; // SSO 小缓冲区
        pointer _Ptr;               // 指向堆缓冲的指针（大模式）
        char _Alias[_BUF_SIZE];     // TRANSITION, ABI 兼容保留

        void _Switch_to_buf() noexcept { ... }
    };
    _Bxty _Bx;

    size_type _Mysize = 0; // 当前长度（size），不含结尾 '\0'
    size_type _Myres  = 0; // 当前容量（capacity），不含结尾 '\0'
};
```

### 两种模式的判定

在\_String_Val内部，有一个成员函数，用于判断使用SSO或者大模式：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0e8f97c56e07eacf.webp)

-   小模式（SSO）：\_Myres == \_Small_string_capacity（= \_BUF_SIZE - 1），数据存在 \_Bx.\_Buf 里，不分配堆内存。
-   大模式：\_Myres > \_Small_string_capacity，数据在 \_Bx.\_Ptr 指向的堆缓冲里，实际分配 \_Myres + 1 个元素（多出的是结尾 '\\0'）。

## 对象大小

```rust
basic_string<char>                     // 用户看到的类
└─ _Compressed_pair<_Alty, _Scary_val> _Mypair;   // 唯一成员
   ├─ _Alty（分配器）                   // 被 EBCO 压掉，不占字节
   └─ _String_val<char 信息>            // 真正存状态的地方
      ├─ _Container_base（基类）        // 迭代器调试代理指针（可选）
      ├─ _Bxty _Bx                     // union：SSO 缓冲 / 堆指针
      ├─ _Mysize                       // size
      └─ _Myres                        // capacity
```

对 std::string（char，x64，\_ITERATOR_DEBUG_LEVEL == 0）：

```rust
_Compressed_pair<_Alty, _String_val>   // allocator 被 EBCO 掉
└─ _String_val                         // 32 字节
   ├─ _Container_base                  // 空基类，0 字节
   ├─ _Bx  union                       // max(_Buf[16]=16, _Ptr=8) = 16 字节
   ├─ _Mysize                          // 8 字节
   └─ _Myres                           // 8 字节
```

即 sizeof(std::string) == 32（x64）/ 24（x86）；sizeof(std::wstring) 同样为 32/24（\_BUF_SIZE = 16/sizeof(wchar_t) = 8，union 取 \_Ptr 的 8 字节对齐后仍是 16 字节）。 **注意这是在Release编译选项下的大小，如果是Debug，会增加8/4(x64/x86)字节。\_ITERATOR_DEBUG_LEVEL == 0就是Release模式下才有的。**

## 示例程序

```c
#include <string>
#include <iostream>

void test1()
{
    std::string str;

    std::cout << "sizeof std::string object: " << sizeof(str) << std::endl;

    str = "test string";

    std::cout << str << std::endl;
}

void test2()
{
    std::string str("This is a string longer than 16 bytes");

    std::cout << str << std::endl;
}

int main(int argc, char* argv[])
{
    test1();
    test2();

    return 0;
}
```

## 查看内存布局

**这里以x64/Debug编译选项进行说明。**

### SSO模式

对于test1中的str，其长度小于16字节。它的地址是：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/cd9f049382754c5f.webp)

接下来对其赋值“test string”，查看内存：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4a93df581eb241e0.webp)

-   红色部分共8字节，是指向迭代器调试代理（堆上分配），这个后面会再详细说说。
-   橙色部分共16字节，是SSO模式的缓冲区。
-   绿色部分共8字节，是当前字符串长度。
-   紫色部分共8字节，是当前缓冲区的长度。

### 大模式

在test2函数中，str中存储的字符串长度大于16字节，使用大模式保存。

str对象的地址是0x00000005E18FF998，初始化后：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/32d502b1fd2e3186.webp)

查看其中指向堆的地址（橙色部分）：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1f25515884ac9044.webp)

## Debug与Release对std::string对象内存布局的影响

前文稍微提到了一点Debug和Release的影响，这里再展开说说。

### Debug/Release 的 \_ITERATOR_DEBUG_LEVEL 来源（yvals.h）

```cpp
// B1ii. _HAS_ITERATOR_DEBUGGING 默认值
#ifdef _DEBUG
#define _HAS_ITERATOR_DEBUGGING 1   // Debug 构建
#else
#define _HAS_ITERATOR_DEBUGGING 0   // Release 构建
#endif

// B3. 推导 _ITERATOR_DEBUG_LEVEL
#if _HAS_ITERATOR_DEBUGGING
#define _ITERATOR_DEBUG_LEVEL 2      // Debug → 2
#elif _SECURE_SCL
#define _ITERATOR_DEBUG_LEVEL 1
#else
#define _ITERATOR_DEBUG_LEVEL 0      // Release → 0
#endif
```

Debug 默认 IDL=2，Release 默认 IDL=0（\_DEBUG 由 /MDd、/MTd 等定义）。

### 为什么 Debug 会变大（xstring + xutility）

xstring 里有两处直接证明：

```cpp
template <class _Val_types>
class _String_val : public _Container_base { ... };   // 基类是 _Container_base

// 计算 memcpy 优化时跳过的基类字节数：
template <class _Ty>
constexpr size_t _Size_after_ebco_v = is_empty_v<_Ty> ? 0 : sizeof(_Ty);
static constexpr size_t _Memcpy_val_offset = _Size_after_ebco_v<_Container_base>;
```

\_Container_base 在 \_ITERATOR_DEBUG_LEVEL!= 0 时不再是空基类，而含有一个指针成员：

```cpp
// xutility / __msvc_iter_core.hpp 系列
#if _ITERATOR_DEBUG_LEVEL != 0
class _Container_base {
    _Container_proxy* _Myproxy = nullptr;  // 指向迭代器调试代理（堆上分配）
    ...
};
#else
class _Container_base {};                  // 空基类，被 EBCO 掉
#endif
```

is_empty_v<\_Container_base> 从 true 变成 false，于是 sizeof(std::string) 增加一个指针的大小：x64 多 8 字节，x86 多 4 字节。

* * *

应当指出： **所有标准容器的sizeof都受此影响，vector、list、map等的内部\_Container_base/\_Tree_node在Debug下同样带\_Myproxy指针。**

## x64与x86对std::string对象内存布局的影响

这个没什么好说的，基本数据类型的大小不同。

## 逆向时如何识别std::string对象

这个可以参考：

[浅谈STL容器的识别](https://bbs.kanxue.com/thread-270547-1.htm)

里面提到了一个重要特征字符串：

![图片描述](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/34d035336329cd43.webp)

在构造std::string对象时，校验长度部分会有一个"stirng too long"特征字符串，可以据此识别std::string对象。
