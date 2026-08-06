---
title: 【看雪】一次pyarmor解密分析
source: https://bbs.kanxue.com/thread-292317.htm
source_host: bbs.kanxue.com
clip_date: 2026-08-06T09:26:12+08:00
trace_id: 6e2fa6be-5fcb-47d7-b007-344b0fdd2aec
content_hash: 205c90c6dcc8f37c85001875410b2d87b67c86f46d8f6b14b450a31b956ffe50
status: synced
tags:
  - 看雪
  - Python逆向
  - 密码学
series: null
feed_source: 看雪·逆向工程
ai_summary: PyArmor 加密的 PyInstaller 打包样本存在两层加密（co_object 和 co_code），通过动态调试 _pytransform.dll 定位密钥派生逻辑，可编写脚本逐步还原 Python 代码。
ai_summary_style: key-points
images_status:
  total: 26
  succeeded: 26
  failed_urls: []
notion_page_id: 3b475244-d011-81c5-9dda-cf4b2e53f506
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> PyArmor 加密的 PyInstaller 打包样本存在两层加密（co_object 和 co_code），通过动态调试 _pytransform.dll 定位密钥派生逻辑，可编写脚本逐步还原 Python 代码。
> 
> - **样本情况：** 64 位 PyInstaller 打包，Python 3.10，核心 pyc 文件经 PyArmor 保护，解包后需进一步解密。
> - **加密架构：** 第一层加密 co_object，第二层加密 co_code；函数调用时先由 pyarmor 解密 co_object，再经 armor_enter/armor 恢复 co_code，返回前用 armor_exit 重新加密。
> - **co_object 解密：** 在 _pytransform.dll 的 pyarmor 函数中，通过 4 次 DWORD 全局常量异或派生 AES-GCM/CTR 密钥，IV 为 12 字节，采用 AES-CTR 模式解密。
> - **co_code 解密：** armor_enter 使用 6 个 DWORD 密钥流逐字异或并加常数；armor 分支使用魔改的 libtomcrypt CTR 加密流程，密文读取位置偏移 2 字节，密钥流由 ECB 回调生成。
> - **密钥常量保护：** 常量生成逻辑藏于 VM 化的 switch-case 中，含时间校验；通过 x64dbg 脚本 hook GetSystemTimeAsFileTime 固定时间，绕过校验后 dump 出全部常量，支撑脚本编写。

* * *

## 一、原理：

### 1.概述：

笔者分析的样本pyarmor一共有两层加密，第一层加密co_object,第二层加密co_code，在执行的过程中，每一个函数（代码块）一旦被调用，首先会执行函数pyarmor解密第一层co_object,然后执行pyarmor或pyarmor解密第二层，它们负责恢复代码指令，代码块执行完之后，在返回上一级之前，会调用armor_exit把代码恢复成加密状态，那么解密的关键就是找到函数pyarmor、pyarmor、pyarmor并下断分析其解密逻辑，再编写脚本解密还原python代码即可。

### 2.相关结构体如下：

可能有些不准，具体情况具体分析

```cpp
// ============================================================
// 1. PYC 文件头结构 (Python 3.7+)
// ============================================================
typedef struct {
    uint32_t magic;        // 魔数: 标识 Python 版本 (如 0x610d0d0a)
    uint32_t bit_field;    // 比特位字段: 校验模式标志 (PEP 552)
    uint32_t timestamp;    // 源文件修改时间 (Unix 时间戳)
    uint32_t file_size;    // 源文件大小 (字节)
} PycHeader;

// 对于 Python 3.7 之前的版本 (12字节头)
typedef struct {
    uint32_t magic;        // 魔数
    uint32_t timestamp;    // 源文件修改时间
    uint32_t file_size;    // 源文件大小
} PycHeaderLegacy;

// ============================================================
// 2. 代码对象结构 (CodeObject) - 核心载荷
// ============================================================
// 注意: 这是逻辑结构，实际存储使用 marshal 序列化格式
struct PyCodeObject {
    PyObject_HEAD  // 包含 ob_refcnt (引用计数) 和 ob_type (类型指针)
    // [偏移 +0x00] 8字节: Py_ssize_t ob_refcnt
    // [偏移 +0x08] 8字节: PyTypeObject* ob_type

    // 核心执行字段
    int co_argcount;            // 位置参数（Positional arguments）的总个数
    // [偏移 +0x10] 4字节
    int co_posonlyargcount;     // 仅限位置参数（Positional-only arguments）的个数 (Python 3.8+)
    // [偏移 +0x14] 4字节
    int co_kwonlyargcount;      // 仅限关键字参数（Keyword-only arguments）的个数
    // [偏移 +0x18] 4字节
    int co_nlocals;             // 局部变量的总数量（包括参数和内部定义的局部变量）
    // [偏移 +0x1C] 4字节
    int co_stacksize;           // 虚拟机执行此代码时需要的最大栈空间大小（用于评估栈的分配）
    // [偏移 +0x20] 4字节
    int co_flags;               // 标志位（比如 CO_GENERATOR, CO_COROUTINE 等）
    // [偏移 +0x24] 4字节 (此处编译器自动插入 4 字节 Padding 对齐到 0x28 的 8 字节边界)

    // 数据和代码指针
    PyObject *co_code;          // 核心！指向字节码序列（通常是 bytes 对象，即 .pyc 里的指令部分）
    // [偏移 +0x28] 8字节
    PyObject *co_consts;        // 常量元组（Tuple）：代码中用到的字面量（数字、字符串、None 等）
    // [偏移 +0x30] 8字节
    PyObject *co_names;         // 名称元组（Tuple）：代码中用到的全局变量名和函数名（按顺序）
    // [偏移 +0x38] 8字节
    PyObject *co_varnames;      // 变量名元组（Tuple）：局部变量名（包括参数名）
    // [偏移 +0x40] 8字节
    PyObject *co_freevars;      // 自由变量元组（Tuple）：闭包用到的外层变量名
    // [偏移 +0x48] 8字节
    PyObject *co_cellvars;      // 单元格变量元组（Tuple）：被内部嵌套函数引用的局部变量名
    // [偏移 +0x50] 8字节

    // 调试与元信息
    PyObject *co_filename;      // 包含该代码的源文件路径（字符串对象）
    // [偏移 +0x58] 8字节
    PyObject *co_name;          // 函数名或模块名（字符串对象）
    // [偏移 +0x60] 8字节
    int co_firstlineno;         // 该代码块在源文件中的起始行号
    // [偏移 +0x68] 4字节 (此处编译器自动插入 4 字节 Padding 对齐到 0x70 的 8 字节边界)
    PyObject *co_lnotab;        // 字节码偏移到源代码行号的映射表（字节串，用于报错和调试）
    // [偏移 +0x70] 8字节 (注: Python 3.11 中已变为 co_linetable)

    // 类型注解及其他（Py3.11 之前）
    PyObject *co_exceptiontable; // 异常处理表（Python 3.11 引入了更加优化的异常表）
    // [偏移 +0x78] 8字节
    PyObject *co_qualname;      // 完全限定名称（如 `MyClass.my_method`），Python 3.11+ 新增
    // [偏移 +0x80] 8字节
};

// ============================================================
// 3. Marshal 序列化标记 (用于解析嵌套结构)
// ============================================================
// marshal 格式使用类型标记来标识数据类型
typedef enum {
    TYPE_NULL        = '0',
    TYPE_NONE        = 'N',
    TYPE_FALSE       = 'F',
    TYPE_TRUE        = 'T',
    TYPE_STOPITER    = 'S',
    TYPE_ELLIPSIS    = '.',
    TYPE_INT         = 'i',
    TYPE_INT64       = 'I',
    TYPE_FLOAT       = 'f',
    TYPE_BINARY_FLOAT = 'g',
    TYPE_COMPLEX     = 'x',
    TYPE_BINARY_COMPLEX = 'y',
    TYPE_LONG        = 'l',
    TYPE_STRING      = 's',
    TYPE_INTERNED    = 't',
    TYPE_STRINGREF   = 'R',
    TYPE_TUPLE       = '(',
    TYPE_LIST        = '[',
    TYPE_DICT        = '{',
    TYPE_CODE        = 'c',
    TYPE_UNICODE     = 'u',
    TYPE_UNKNOWN     = '?',
    TYPE_SET         = '<',
    TYPE_FROZENSET   = '>',
    TYPE_ASCII       = 'a',
    TYPE_ASCII_INTERNED = 'A',
    TYPE_SMALL_TUPLE = ')',
    TYPE_SHORT_ASCII = 'z',
    TYPE_SHORT_ASCII_INTERNED = 'Z',
} MarshalType;

// ============================================================
// 4. 完整的 PYC 文件结构
// ============================================================
typedef struct {
    PycHeader      header;        // 文件头 (16字节)
    PycCodeObject  code_object;   // 代码对象 (序列化存储)
} PycFile;

// ============================================================
// 5. 实际解析示例 (C语言风格)
// ============================================================
#include <stdio.h>
#include <stdlib.h>

// 读取 PYC 文件头
int read_pyc_header(FILE *fp, PycHeader *header) {
    size_t read = fread(header, sizeof(PycHeader), 1, fp);
    if (read != 1) return -1;

    // 验证魔数 (以 Python 3.10 为例: 0x610d0d0a)
    // 注意: 魔数会因 Python 版本而异
    printf("Magic: 0x%08X\n", header->magic);
    printf("Bit field: 0x%08X\n", header->bit_field);
    printf("Timestamp: %s", ctime(&header->timestamp));
    printf("File size: %u bytes\n", header->file_size);

    return 0;
}

// 简化的 marshal 解析器 (仅示意)
int parse_marshal_object(FILE *fp, PyObject **obj) {
    uint8_t type;
    if (fread(&type, 1, 1, fp) != 1) return -1;

    switch (type) {
        case TYPE_CODE: {
            // 解析代码对象...
            // 这里需要递归解析所有字段
            break;
        }
        case TYPE_INT: {
            int32_t val;
            fread(&val, 4, 1, fp);
            break;
        }
        case TYPE_STRING: {
            uint32_t len;
            fread(&len, 4, 1, fp);
            char *str = malloc(len + 1);
            fread(str, 1, len, fp);
            str[len] = '\0';
            break;
        }
        // ... 其他类型
    }
    return 0;
}

// ============================================================
// 6. Python 字节码指令结构 (反汇编用)
// ============================================================
typedef struct {
    uint8_t  opcode;       // 操作码 (如 LOAD_FAST, STORE_FAST)
    uint16_t arg;          // 操作数 (参数)
    uint32_t offset;       // 字节码偏移量
} BytecodeInstruction;

// 常用操作码 (Python 3.10+)
#define OP_LOAD_FAST      124
#define OP_STORE_FAST     125
#define OP_LOAD_CONST     100
#define OP_LOAD_NAME      101
#define OP_STORE_NAME     102
#define OP_BINARY_OP      122
#define OP_RETURN_VALUE   83
#define OP_CALL_FUNCTION  131
#define OP_MAKE_FUNCTION  132
// ... 更多操作码

// ============================================================
// 7. PyFrameObject结构
// ============================================================
typedef struct _frame {
    PyObject_VAR_HEAD             // 对象头部，包含引用计数和类型信息
    struct _frame *f_back;        // 上一级（调用者）的帧，若为 NULL 则是最外层帧
    PyCodeObject *f_code;         // 0x18，指向当前执行的代码对象
    PyObject *f_builtins;         // 当前帧的内置命名空间（builtins 字典）
    PyObject *f_globals;          // 当前帧的全局命名空间（globals 字典）
    PyObject *f_locals;           // 当前帧的局部命名空间（locals 字典/代理）
    PyObject **f_valuestack;      // 指向值栈底部（第一个局部变量之后的位置）
    PyObject **f_stacktop;        // 指向当前值栈的栈顶，用于栈的扩展
    PyObject *f_trace;            // 关联的跟踪函数（用于调试和性能分析）
    // 异常相关字段，用于记录当前帧正在处理的异常
    PyObject *f_exc_type, *f_exc_value, *f_exc_traceback;
    PyThreadState *f_tstate;      // 指向所属的线程状态
    int f_lasti;                  // 最后执行的字节码指令偏移量
    int f_lineno;                 // 当前正在执行的行号（仅当跟踪激活时有效）
    int f_iblock;                 // f_blockstack 数组的当前索引
    PyTryBlock f_blockstack[CO_MAXBLOCKS]; // 用于 try/except/finally 和循环的块栈
    PyObject *f_localsplus[1];    // 动态数组，存储局部变量和值栈元素
} PyFrameObject;
// ============================================================
// 8. libtomcrypt.dll库用到的ctr_state结构
// ============================================================
typedef struct {
    int cipher;                      // 使用的加密算法索引 (如 AES)
    int blocklen;                    // 加密算法的分组大小 (字节)
    int padlen;                      // 当前已使用的 "pad" 缓冲区字节数
    int mode;                        // 计数器递增模式 (大端/小端)，通常为 0
    unsigned char ctr[MAXBLOCKSIZE]; // 当前计数器值 (Counter)
    unsigned char pad[MAXBLOCKSIZE]; // 当前计数器加密后的密钥流 (Keystream)
    symmetric_key key;               // 加密算法的扩展密钥调度表
} symmetric_CTR;
```

pyc文件结构关系图：

```
.pyc 文件结构
│
├── [文件头] (16字节)
│   ├── magic      (4B) - Python版本标识
│   ├── bit_field  (4B) - 校验模式标志
│   ├── timestamp  (4B) - 源文件修改时间
│   └── file_size  (4B) - 源文件大小
│
└── [序列化数据] (marshal格式)
    │
    └── CodeObject (递归结构)
        ├── 元数据
        │   ├── argcount, kwonlyargcount
        │   ├── nlocals, stacksize, flags
        │   ├── filename, name
        │   └── firstlineno
        │
        ├── 字节码
        │   ├── co_code (变长字节数组)
        │   └── co_lnotab (行号映射)
        │
        ├── 常量表 (tuple)
        │   ├── 整数/浮点数
        │   ├── 字符串
        │   ├── 嵌套的 CodeObject
        │   └── ...
        │
        ├── 名称表 (tuple)
        │   ├── 全局变量名
        │   └── 导入的模块名
        │
        ├── 局部变量表
        │   ├── varnames (局部变量名)
        │   ├── cellvars (闭包变量)
        │   └── freevars (自由变量)
        │
        └── (Python 3.11+) 异常表
            └── 异常处理条目
```

关于魔数 (Magic Number)：不同 Python 主版本的魔数不同，例如：

Python 3.7: 0x420d0d0a

Python 3.8: 0x4d0d0d0a

Python 3.9: 0x5d0d0d0a

Python 3.10: 0x610d0d0a

Python 3.11: 0x6a0d0d0a

笔者这里是3.10版本的

## 二、逆向分析：

### 1.样本初步分析：

将我们打包好的加密文件拖进我们逆向分析的大哥——Exeinfo，可以发现64位，Pyinstaller打包，Python310模块

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fac5fe800b7223cd.png)

用解包工具解包，这里GitHub上有开源工具

-   [extremecoders-re/pyinstxtractor: PyInstaller Extractor](https://github.com/extremecoders-re/pyinstxtractor)
    

解包工具更推荐ng这个，不用匹配Python版本，而且是exe版本，方便使用

-   [pyinstxtractor/pyinstxtractor-ng: PyInstaller Extractor Next Generation](https://github.com/pyinstxtractor/pyinstxtractor-ng)
    

成功解包后用反编译工具pycdas和pycdc来反编译，这里Github上有开源工具，下载下来后用Cmake编译生成exe，并自行添加环境变量路径，后续既可以使用了，熟悉了基础指令，后续就可以交给AI，让AI来将pyc文件进行批量反编译核心文件，毕竟解包出来可能很多没有用的文件，只需要反编译核心文件即可

这里笔者样本里的核心pyc文件有五个，但是反编译出来都被加密了，如下截图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e9f79ef605364858.png)

通过查阅学习是pyarmor加密，那么我们直接分析加密的5个文件即可，看看能不能逆向分析出来编写解密脚本，当然这里也有可取巧的方式不用解密，使用github上一个开源脚本工具PyArmor-Unpacker直接就可以静态dump出来，小白不会的，我就是哈哈，可以参考这篇帖子

-   [https://blog.csdn.net/gitblog_00120/article/details/157160790](https://blog.csdn.net/gitblog_00120/article/details/157160790)
    

github项目地址：

-   [https://www.bing.com/search?q=PyArmor-Unpacker&form=ANNTH1&refig=6a6f10b356f641a38cf2795aa7680cac&pc=CNNDDB](https://www.bing.com/search?q=PyArmor-Unpacker&form=ANNTH1&refig=6a6f10b356f641a38cf2795aa7680cac&pc=CNNDDB)
    

言归正传，继续逆向分析解密机制：

### 2.样本具体加解密流程：

#### （1）启动IDA、dbg：

现在该我们的二哥和三哥出场了，IDA、dbg，启动！

通过大致分析（这里包括但不限于IDA和dbg查找exe和相关dll的字符串和导出函数，关于逆向功底方面，笔者目前初出茅庐，就不过多谈前置分析），笔者觉得重要的是样本加载的一个重要模块\_pytransform.dll，该模块是具体加解密模块，这个模块的导出函数如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/20ddaca3066196ee.png)

可以看到关键的encrypt等函数，通过查阅官方文档和调试分析，该模块的执行流程如下：

#### （2）前置不重要的流程如下：

加载\_pytransform.dll——调用init_module初始化并导入各类需要的模块，获取后续需要调用的关键函数（如marshal.loads，marshal.dumps），初始化一些加密算法用于后续校验本地license.lic文件的product.key——校验本地文件中的product.key——调用init_runtime函数，初始化各类函数地址和模块获取

#### （3）主要加解密流程：

在init_runtime函数里会获取6个重要的结构体，"armor","wraparmor","pyarmor","armor_enter","armor_exit","armor_wrap"

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/66885ed839c3a731.png)

通过分析其结构体定义和内存布局如下，在下面这个结构体中可以寻址到他们对应的函数地址

```
struct PyMethod{
    char *name;
    PyCFunction *FunctionAddress;
    int flags;
    const char *doc_attribute;
}
```

我们先来看pyarmor这个函数

##### a.pyarmor：

单步步过会发现开始匹配入口头Pyarmor，并校验了头部

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/dff0da2eda17808f.png)

然后进入一个比较关键的函数Sub_70A0DC10

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/5ab8c2716bd8419f.png)

进入之后挨着dbg和ida同步调试分析，获取了一下当前调用栈帧PyFrameObject结构体

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b1a3dc47773bddb1.png)

随后会发现走到一个这个LABEL_16分支里，这里就是最关键的解密co_object处，看到这些异或是不是很兴奋很激动，异或涉及一般都是密钥组成，哈哈那么我们来慢慢看看这个逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/0737ec66b29ed163.png)

通过分析，在调用Sub_70A26C50之前，做了四次异或操作，每次都是一个DWORD全局常量异或一个\*(基地址+偏移)，一共4个，其中3个加了一些固定常量值，简化一下密钥逻辑：

k0=dword_70B227A6 ^ (DWORD)(v6+40);

k1=dword_70B227AA ^ (DWORD)(v6+44);

k2=dword_70B227AE^ (DWORD)(v6+48);

k3=dword_70B227B2^ (DWORD)(v6+52);

后面的三个函数j进去之后就是初始化AES-GCM状态、设置IV、调用解密函数，那么根据这个大致就能得出解密脚本编写用AES-GCM解密

##### b.armor_enter:

先断到这个函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/a1ce367d40822a87.png)

后面就是基本功了，慢慢看每个函数的作用，之后获得了Frame，然后来到了解密函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/52c55dd7a1e93822.png)

进入这个函数，用dbg和ida同步调试，最终到这个分支，这个就是关键的密钥生成和异或数据位置

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/da2d1e5aded654be.png)

简化伪代码如下，v26是解密代码起始处，v29是解密代码结束处，全局常量70B227B2

```java
// 初始化
v53 = xmmword_70B227B2
v54 = qword_70B227C2
v29 = &v26[(unsigned int)v28 >> 2]   // 循环结束地址

// 用 v14 的 4 个 DWORD 异或更新 v53 的四个字段
v53.d0 = v14[0] ^ xmmword_70B227B2.d0
v53.d1 = (v14[1] - 2869) ^ xmmword_70B227B2.d1
v53.d2 = (v14[2] + 54958) ^ xmmword_70B227B2.d2
v53.d3 = (v14[3] + 59843) ^ xmmword_70B227B2.d3

v30 = &v53

// 循环处理 v26 指向的数组
while (v26 != v29) {
    v31 = *(DWORD *)v30 ^ *v26      // 取 v30 指向的 4 字节与当前 v26 值异或
    *v26 = v31 + 56597              // 加常数后写回
    v26++                           // 移动目标指针
    v30 += 4                        // 移动源指针（4字节）
    if (v30 == &v55)                // 若超出 v53 范围，则回绕
        v30 = &v53
}
```

##### c.armor：

armor分支稍微难弄一点，里面有一个魔改，这个弄了有点久，让我们细细看看吧

先断到该函数处

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/786b94a3fa80c19d.png)

然后依旧是dbg动态调试观察数据什么时候被解密，定位解密位置

先是获取Frame，这个rax就是获取Frame的函数，因为截图接不上，就i索性直接描述了，这个函数就是帮我们定位加密数据的，后续就是看哪个函数或者哪串代码在解密这个数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9f86dcd61767e7ac.png)

在慢长的过程中定位到这个函数

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6be542500312bf6c.png)

进去之后最终定位到解密关键位置，如下图，

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/9a36b07becbe5efc.png)

伪代码如下，经过分析，计算4个值生成16字节key，然后传入Sub_70A3E650初始化AES-CTR状态，然后将CTR状态传入Sub_70A2E020

```
// 计算4个值
v33 = qword_70B22799 ^ v14;
v34 = (v15 - 62069) ^ HI32(qword_70B22799);
v36 = (v17 + 52569) ^ HI32(qword_70B227A1);
v35 = qword_70B227A1 ^ (v16 + 45232);

// 两个函数调用都必须返回0
if (!sub_70A2E650(dword_70B227E8, a5, &v33, 16, 0, 0, v39) &&
    !sub_70A2E020(&v8[v12], v8, v11, v39)) {
    // 成功路径
}
```

起初直接用还原key算法后调用官方加解密库函数，发现数据跟解密后的数据完全不一样，后不调用py层加解密库函数，调用c层，为此还找了github源码编译了libtomcrypt.dll模块，然后调用里面的C层函数，结果还是有问题，最后经过排除Sub_70A2E650初始化CTR状态是正常的，但是sub_70A2E020里进行了魔改，先说一下函数原型

```cpp
// CTR加密函数原型
int ctr_encrypt(const unsigned char* pt,      // 明文
                unsigned char* ct,            // [out] 密文
                unsigned long len,            // 明文长度
                symmetric_CTR* ctr);          // CTR状态

// 原代码调用
if (!sub_70A2E650(dword_70B227E8, a5, &v33, 16, 0, 0, v39) &&
    !sub_70A2E020(&v8[v12], v8, v11, v39)) {
    // 成功
}
```

然后在dbg传参时，明文数据往后移了两位，密文输出是正常的，笔者写到这里发现自己写的解密脚本似乎不用进入函数来修改异或往后移动2位，不过就当学习了

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b55277c2cfbdb0c4.png)

另外有兴趣的友友可以看看在这个函数内部，异或数据是通过CTR状态里的密钥流来异或数据的，CTR状态在调用sub_70A2E650初始化时生成了第一串16字节密钥流，这个16字节密钥流就是IV，然后调用sub_70A2E020函数，每次异或8字节，如下图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3879fa6c0228d6f3.png)

异或2次用完16字节密钥流后，随后调用回调函数ptr_3DES函数生成新的密钥流，最后剩余加密数据不足8字节的时候就是逐字节异或的，如下图

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/10035c0cb9a65fe4.png)

## 三、编写解密脚本：

### 1.解密对象体co_object：

```python
import struct, sys
from pathlib import Path
from Crypto.Cipher import AES
from Crypto.Util import Counter

# 运行时常量 (从 _pytransform.dll 动态调试提取)
C0, C1, C2, C3 = 0x88A79C6E, 0x8E7DBF79, 0xFD4A0D05, 0xE73E7FD6
M1, M2, M3=15138,32815,9498

def decrypt(pyc_path, out_path):
    data = Path(pyc_path).read_bytes()
    pos = data.find(b'PYARMOR')                       # 定位 PyArmor 头
    h = data[pos:]
    off, size = struct.unpack_from('<II', h, 28)      # 密文偏移和长度
    H = struct.unpack_from('<IIII', h, 40)            # 4个密钥
    iv = h[40:52]                                     # 12字节 IV
    # 派生 AES-128 密钥: K=C^f(H)
    key = struct.pack('<IIII',
        C0 ^ H[0],
        C1 ^ ((H[1] - M1) & 0xFFFFFFFF),
        C2 ^ ((H[2] + M2) & 0xFFFFFFFF),
        C3 ^ ((H[3] + M3) & 0xFFFFFFFF))

    print(f"[-] Key: {key.hex()}")
    print(f"[-] IV:  {iv.hex()}")
    # AES-CTR 解密
    ct = data[pos + off : pos + off + size]
    pt = AES.new(key, AES.MODE_CTR,counter=Counter.new(32, prefix=iv, initial_value=2)).decrypt(ct)

    # 重建 pyc (Python 3.10 魔数 + 12字节零头 + marshal数据)
    Path(out_path).write_bytes(b'\x6f\x0d\x0d\x0a' + b'\x00' * 12 + pt)
    print(f"[+] {pyc_path} -> {out_path} ({len(pt) + 16} bytes)")


if __name__ == '__main__':
    if len(sys.argv) > 1:
        decrypt(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'decrypted.pyc')
    else:
        for f in ['core', 'crypto', 'error_codes', 'mitmp', 'task_automation']:
            decrypt(f'{f}.pyc', f'decrypted_{f}.pyc')
```

### 2.解密字节码co_code：

#### （1）decrypt2.py：

```python
import struct, sys, marshal, types, opcode, ctypes
import decrypt2_help
from Crypto.Cipher import AES

_aes_ecb = None  # AES ECB cipher 对象, 在 ctr_init 中创建

def _ecb_encrypt_callback(counter_addr, stream_addr, key_state_addr):
    """回调: AES_ECB(counter) -> keystream, 写入 stream_addr"""
    counter = ctypes.string_at(counter_addr, 16)
    keystream = _aes_ecb.encrypt(counter)
    ctypes.memmove(stream_addr, keystream, 16)
    return 0

decrypt2_help.ECB_ENCRYPT_CALLBACK = _ecb_encrypt_callback

def ctr_init(key_material, key):
    """
    初始化 CTR 状态 (替代 libtomcrypt ctr_start).
    key_material: 16 字节 IV    key: 16 字节 AES key
    返回: ctypes 缓冲区 (CTR_State)
    """
    global _aes_ecb
    _aes_ecb = AES.new(key, AES.MODE_ECB)

    ctr_state = (ctypes.c_ubyte * 512)()
    state = ctypes.cast(ctr_state, ctypes.POINTER(decrypt2_help.CTR_State)).contents

    # 手动初始化 CTR_State (对应 ctr_start 的行为)
    state.algo_idx = 0
    state.block_len = 16
    state.buf_used = 0       # padlen=0: keystream 已就绪
    state.ctr_mode = 0        # little-endian counter
    state.ctr_len = 16
    for i in range(16):
        state.counter[i] = key_material[i]

    # 生成第一个 keystream block (ctr_start 会做这一步)
    first_ks = _aes_ecb.encrypt(bytes(key_material))
    for i in range(16):
        state.stream[i] = first_ks[i]

    return ctr_state


# ==================== __armor_enter__ 常量 ====================
C = [0xE73E7FD6, 0x2A9892B0, 0x21E0FAB7, 0x5DFF679C]
V54 = [0xB2FE28F4, 0xE6206DF4]
M1, M2, M3, M4=2869, 52819, 9498, 56597

# ==================== __armor__ AES-CTR 常量 ====================
#
# K0 = C0 ^ H0,  K1 = C1 ^ (H1 - M1),  K2 = C2 ^ (H2 + M2),  K3 = C3 ^ (H3 + M3)
_AES_C0 = 0x574E0BA8
_AES_C1 = 0x8729235D
_AES_C2 = 0x8419C034
_AES_C3 = 0xA79C6EA5
_AES_M1, _AES_M2, _AES_M3 = 62069, 45232, 52569  # 0xF275, 0xB0B0, 0xCD59

# ==================== Opcode 常量 ====================
LOAD_GLOBAL = opcode.opmap["LOAD_GLOBAL"]
RETURN_OPCODE = opcode.opmap["RETURN_VALUE"].to_bytes(2, byteorder='little')
SETUP_FINALLY = opcode.opmap["SETUP_FINALLY"]
EXTENDED_ARG = opcode.opmap["EXTENDED_ARG"]
JUMP_FORWARD = opcode.opmap["JUMP_FORWARD"]
JUMP_ABSOLUTE = opcode.opmap.get("JUMP_ABSOLUTE", -1)
POP_JUMP_IF_FALSE = opcode.opmap.get("POP_JUMP_IF_FALSE", -1)
POP_JUMP_IF_TRUE = opcode.opmap.get("POP_JUMP_IF_TRUE", -1)
JUMP_IF_FALSE_OR_POP = opcode.opmap.get("JUMP_IF_FALSE_OR_POP", -1)
JUMP_IF_TRUE_OR_POP = opcode.opmap.get("JUMP_IF_TRUE_OR_POP", -1)
CONTINUE_LOOP = opcode.opmap.get("CONTINUE_LOOP", -1)

ABSOLUTE_JUMPS = [op for op in [JUMP_ABSOLUTE, CONTINUE_LOOP, POP_JUMP_IF_FALSE,
                 POP_JUMP_IF_TRUE, JUMP_IF_FALSE_OR_POP, JUMP_IF_TRUE_OR_POP] if op >= 0]
DOUBLE_JUMP = sys.version_info >= (3, 10)

# ==================== 路径 ====================
_path=''

def bootstrap_mode_decrypt(co_code_bytes):
    """Bootstrap Mode 解密: plaintext[i] = ciphertext[i] ^ ks[i%6]"""

# ==================== Super Mode 解密 ====================

def super_mode_decrypt(co_code_bytes, bootstrap_len=32, tail_len=16):
    """Super Mode 解密: plaintext = (ciphertext ^ ks[i%6]) + 56597"""
    code = bytearray(co_code_bytes)
    t = struct.unpack('<4I', code[-tail_len:])
    ks = [
        t[0] ^ C[0],
        ((t[1] - M1) & 0xFFFFFFFF) ^ C[1],
        ((t[2] + M2) & 0xFFFFFFFF) ^ C[2],
        ((t[3] + M3) & 0xFFFFFFFF) ^ C[3],
        V54[0],
        V54[1]
    ]

    enc_body = code[bootstrap_len:-tail_len]
    dec_body = bytearray(len(enc_body))
    for i in range(0, len(enc_body) - len(enc_body) % 4, 4):
        cdw = struct.unpack_from('<I', enc_body, i)[0]
        pdw = ((cdw ^ ks[(i // 4) % 6]) + M4) & 0xFFFFFFFF
        struct.pack_into('<I', dec_body, i, pdw)
    rem = len(enc_body) % 4
    if rem:
        dec_body[-rem:] = enc_body[-rem:]
    code[bootstrap_len:-tail_len] = dec_body
    return bytes(code)

# ==================== 字节码工具 ====================

def find_first_opcode(co, op_code):
    for i in range(0, len(co), 2):
        if co[i] == op_code:
            return i
    raise ValueError("Could not find the opcode")

def get_arg_bytes(co, op_code_index):
    result = bytearray()
    result.append(co[op_code_index + 1])
    checked = op_code_index - 2
    while checked >= 0 and co[checked] == EXTENDED_ARG:
        result.insert(0, co[checked + 1])
        checked -= 2
    return result

def calculate_arg(co, op_code_index):
    return int.from_bytes(get_arg_bytes(co, op_code_index), 'big')

def calculate_extended_args(arg):
    extended_args = []
    new_arg = arg
    if arg > 255:
        ext = arg >> 8
        while True:
            if ext > 255:
                extended_args.append(ext & 255)
                ext >>= 8
            else:
                extended_args.append(ext)
                extended_args.reverse()
                break
        new_arg = arg & 255
    return extended_args, new_arg

# ==================== 代码对象处理 ====================

code_attrs = [
    'co_argcount', 'co_posonlyargcount', 'co_kwonlyargcount',
    'co_nlocals', 'co_stacksize', 'co_flags', 'co_code',
    'co_consts', 'co_names', 'co_varnames', 'co_filename',
    'co_name', 'co_firstlineno', 'co_lnotab',
    'co_freevars', 'co_cellvars'
]

def copy_code_obj(obj, **kwargs):
    args = [kwargs.get(name, getattr(obj, name)) for name in code_attrs]
    return types.CodeType(*args)

def handle_armor_enter(obj):
    """Super Mode 解密 + try 框架移除 + 跳转重计算"""
    # 1. Super Mode 静态解密
    dec_code = super_mode_decrypt(obj.co_code)

    # 2. 计算 fake_exit (__armor_exit__ 调用位置)
    exit_idx = obj.co_names.index("__armor_exit__")
    load_exit = bytes([LOAD_GLOBAL, exit_idx])
    exit_pos = dec_code.find(load_exit)
    fake_exit = exit_pos - 2

    # 3. 找到 SETUP_FINALLY，计算 try 块大小
    try_start = find_first_opcode(dec_code, SETUP_FINALLY)
    size = calculate_arg(dec_code, try_start)
    if DOUBLE_JUMP:
        size *= 2

    # 4. 提取 try 块体 (移除 try 框架)
    raw_code = bytearray(dec_code[try_start + 2 : try_start + size])
    raw_code += RETURN_OPCODE

    # 5. 调整绝对跳转
    i = 0
    while i < len(raw_code):
        op = raw_code[i]
        if op in ABSOLUTE_JUMPS:
            argument = calculate_arg(raw_code, i)

            # 移除前导 EXTENDED_ARG
            while i >= 2 and raw_code[i - 2] == EXTENDED_ARG:
                raw_code.pop(i - 2)
                raw_code.pop(i - 2)
                i -= 2

            if DOUBLE_JUMP:
                argument *= 2

            # 跳转到 __armor_exit__ -> 替换为 RETURN_VALUE
            if argument == fake_exit:
                raw_code[i] = opcode.opmap["RETURN_VALUE"]
                i += 2
                continue

            # 调整跳转目标: 减去移除的偏移量
            new_arg = argument - (try_start + 2)
            ext_args, new_arg = calculate_extended_args(new_arg)

            for ea in ext_args:
                raw_code.insert(i, EXTENDED_ARG)
                raw_code.insert(i + 1, ea if not DOUBLE_JUMP else ea // 2)
                i += 2

            raw_code[i + 1] = new_arg if not DOUBLE_JUMP else new_arg // 2

        i += 2

    # 6. 移除 __armor* 名称
    new_names = tuple(n for n in obj.co_names if not n.startswith("__armor"))
    return copy_code_obj(obj, co_names=new_names, co_code=bytes(raw_code))

def handle_under_armor(obj):
    """处理 __armor__ 代码对象: AES-128-CTR 静态解密"""

    # 1. 找 JUMP_FORWARD, 计算 jumping_arg (加密体与 exit_handler 分界线)
    i = find_first_opcode(obj.co_code, JUMP_FORWARD)
    jumping_arg = i + calculate_arg(obj.co_code, i)
    if DOUBLE_JUMP:
        jumping_arg *= 2

    # 2. 末尾 16 字节 = IV, 前面 jumping_arg 字节 = 密文 (含 2 字节 JUMP_FORWARD)
    key_material = obj.co_code[-16:]
    ciphertext = obj.co_code[:jumping_arg]

    # 3. 派生 AES-128 key
    H0, H1, H2, H3 = struct.unpack('<4I', key_material)
    K0 = _AES_C0 ^ H0
    K1 = _AES_C1 ^ ((H1 - _AES_M1) & 0xFFFFFFFF)
    K2 = _AES_C2 ^ ((H2 + _AES_M2) & 0xFFFFFFFF)
    K3 = _AES_C3 ^ ((H3 + _AES_M3) & 0xFFFFFFFF)
    key = struct.pack('<IIII', K0, K1, K2, K3)

    # 4. 初始化 CTR 状态 (PyCryptodome AES ECB 替代 libtomcrypt)
    ctr_state = ctr_init(key_material, key)

    # 5. 解密 (重新实现的魔改ctr_encrypt)
    ct_buf = (ctypes.c_ubyte * len(ciphertext))(*ciphertext)
    pt_buf = (ctypes.c_ubyte * len(ciphertext))()
    decrypt2_help.ctr_encrypt(ct_buf, pt_buf, len(ciphertext), ctr_state)

    dec_code = bytes(pt_buf)

    # 6. 移除 __armor__ 名称
    new_names = tuple(n for n in obj.co_names if n != "__armor__")
    return copy_code_obj(obj, co_names=new_names, co_code=dec_code)

def output_code(obj):
    """递归处理代码对象"""
    if not isinstance(obj, types.CodeType):
        return obj

    # protect_pytransform -> 替换为 fake 函数
    if obj.co_name == "protect_pytransform":
        return types.CodeType(
            0, 0, 0, 0, 1, 83, b'd\x00S\x00', (None,), (), (),
            _path,
            'fake', 202, b'\x00\x01', (), ()
        )

    # 递归处理子对象
    obj = copy_code_obj(
        obj,
        co_consts=tuple(output_code(c) for c in obj.co_consts),
    )

    # 检测解密策略并应用
    if "__armor_enter__" in obj.co_names:
        obj = handle_armor_enter(obj)
    elif "__armor__" in obj.co_names:
        obj = handle_under_armor(obj)

    return obj

# ==================== pyc 重构 ====================

def code_to_bytecode(code, mtime=0, source_size=0):
    data = bytearray(b'\x6f\x0d\x0d\x0a')  # Python 3.10 magic
    data.extend(struct.pack('<I', 0))      # flags
    data.extend(struct.pack('<I', int(mtime)))
    data.extend(struct.pack('<I', source_size))
    data.extend(marshal.dumps(code))
    return data

# ==================== 主入口 ====================

if __name__ == '__main__':
    infile = sys.argv[1] if len(sys.argv) > 1 else 'decrypted_core.pyc'
    outfile = sys.argv[2] if len(sys.argv) > 2 else 'Test_output.pyc'

    with open(infile, 'rb') as f:
        data = f.read()

    code = marshal.loads(data[16:])
    result = output_code(code)
    pyc = code_to_bytecode(result)

    with open(outfile, 'wb') as f:
        f.write(pyc)

    print(f"输出: {outfile} ({len(pyc)} bytes)")
```

#### （2）decrypt2_help.py：

```python
import ctypes

# ==================== CTR 状态结构 (对应 libtomcrypt symmetric_CTR) ====================
# 逆向自 _pytransform.dll sub_70A2E090, 偏移以 int* 为基准 (a4[N])
class CTR_State(ctypes.Structure):
    _pack_ = 1
    _fields_ = [
        ("algo_idx",   ctypes.c_int),          # a4[0]  cipher index
        ("block_len",  ctypes.c_int),          # a4[1]  block size (16)
        ("buf_used",   ctypes.c_uint),         # a4[2]  keystream 已用字节数
        ("ctr_mode",   ctypes.c_int),          # a4[3]  0=little-endian, 1=big-endian
        ("ctr_len",    ctypes.c_int),          # a4[4]  counter 宽度
        ("counter",   ctypes.c_ubyte * 128),  # a4[5]  counter / IV
        ("stream",    ctypes.c_ubyte * 128),   # a4[37] keystream block
        ("last_block", ctypes.c_ubyte * 128),  # a4[70] symmetric_key (未使用, 保留对齐)
    ]

# 外部注入: AES_ECB(counter_ptr, stream_ptr, key_ptr) -> int
ECB_ENCRYPT_CALLBACK = None


# ==================== CTR 加密/解密 (严格还原 sub_70A2E090) ====================
# 执行流程:
#   buf_used=0  -> LABEL_34: 用预生成的 keystream 整块 XOR 16 字节
#   buf_used=16 -> 递增 counter -> 回调生成新 keystream -> buf_used=0 -> LABEL_34
#   LABEL_34 剩余不足 16 -> v11=0, goto LABEL_4 逐字节
#   LABEL_4: XOR stream[buf_used] 一个字节, buf_used++

def ctr_encrypt(ct_buf, pt_buf, length, ctr_state):
    """CTR 加密/解密 (CTR 模式下两者相同), 直接操作外部 ctypes 数组内存."""
    if length == 0:
        return 0
    if ECB_ENCRYPT_CALLBACK is None:
        raise RuntimeError("未设置 ECB_ENCRYPT_CALLBACK")

    state = ctypes.cast(ctr_state, ctypes.POINTER(CTR_State)).contents
    stream_addr = ctypes.addressof(state.stream)
    remaining = length
    pt_addr = ctypes.addressof(pt_buf) if isinstance(pt_buf, ctypes.Array) else pt_buf
    ct_addr = ctypes.addressof(ct_buf) if isinstance(ct_buf, ctypes.Array) else ct_buf

    while True:
        block_len = state.block_len

        # ---- buf_used == block_len: 递增 counter + 回调生成 keystream ----
        if state.buf_used == block_len:
            ctr_len = state.ctr_len
            if state.ctr_mode:                      # 大端
                idx = block_len - 1
                while idx >= ctr_len:
                    val = (state.counter[idx] + 1) & 0xFF
                    state.counter[idx] = val
                    if val != 0: break
                    idx -= 1
            else:                                   # 小端 (默认)
                idx = 0
                while idx < ctr_len:
                    val = (state.counter[idx] + 1) & 0xFF
                    state.counter[idx] = val
                    if val != 0: break
                    idx += 1

            result = ECB_ENCRYPT_CALLBACK(
                ctypes.addressof(state.counter),
                stream_addr,
                ctypes.addressof(state.last_block))
            if result != 0:
                return result
            state.buf_used = 0
            # fall through -> LABEL_34

        # ---- LABEL_34: 整块 XOR (buf_used == 0) ----
        if state.buf_used == 0:
            if block_len > remaining:
                # 剩余不足一块 -> 逐字节 (LABEL_4: v11=0)
                ct_byte = ctypes.c_uint8.from_address(ct_addr).value
                stream_byte = ctypes.c_uint8.from_address(stream_addr).value
                ctypes.c_uint8.from_address(pt_addr).value = ct_byte ^ stream_byte
                remaining -= 1
                ct_addr += 1
                pt_addr += 1
                state.buf_used = 1
                if remaining == 0:
                    return 0
            else:
                # 满块 XOR (每次 8 字节 QWORD)
                for i in range(0, block_len, 8):
                    if i + 8 > block_len:
                        break
                    # 此处的+2即加密魔改处
                    ct_q = ctypes.c_uint64.from_address(ct_addr + i + 2).value
                    st_q = ctypes.c_uint64.from_address(stream_addr + i).value
                    ctypes.c_uint64.from_address(pt_addr + i).value = ct_q ^ st_q
                remaining -= block_len
                state.buf_used = block_len
                ct_addr += block_len
                pt_addr += block_len
                if remaining == 0:
                    return 0
        else:
            # ---- LABEL_4: 逐字节 XOR (0 < buf_used < block_len) ----
            # 此处的+2即加密魔改处
            ct_byte = ctypes.c_uint8.from_address(ct_addr + 2).value
            stream_byte = ctypes.c_uint8.from_address(stream_addr + state.buf_used).value
            ctypes.c_uint8.from_address(pt_addr).value = ct_byte ^ stream_byte
            remaining -= 1
            ct_addr += 1
            pt_addr += 1
            state.buf_used += 1
            if remaining == 0:
                return 0
```

## 四、解密密钥常量溯源：

### 1.解密密钥的常量为这些：

有C标注的是动态生成的全局常量，有M标注的是直接的数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8fd032e101e33e99.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/14468f66aedd5309.png)

这些数据的常量基地址如下：

第一层解密：70b227a6

第二层解密：70b227b2，70b22799

### 2.定位函数：

赋值常量的函数为如下这个，这个函数里面是一个巨大的switch-case结构，相信大家听到这个词应该就知道这是一个的VM了吧哈哈，单纯自己手动静态动态肯定是不行的，那么把静态反编译的这个函数扔给AI，让AI给我们筛选一下重要逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1b155e74d360450b.png)

经过分析，这里列举一些比较重要的，有检测debugger字段的、有设置线程信息的、有异常退出的、最重要的是一个循环异或很多次数据生成全局常量的case，如下图v10==2即为该逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4b355d36ec03c358.png)

经过分析v13内部有一个时间校验，每次异或常量数据的时候都会调用clock获得当前时间来跟下一次作比对，小于1s就进入异常分支。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/81f4271d199db455.png)

这里笔者先是才用临时patch的方法来看看后面逻辑

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6f10ada39883a564.png)

patch几次后，找到了常量的生成的异或逻辑，如下图

第一次：278C26B1790是模块里的.data数据

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/f98323859110726c.png)

伪代码如下：

```cpp
// 循环24次，根据输入参数查表生成字节
uint64_t base = 0x278C26B1790;   // 密钥表
uint8_t* dest = 0x70B22780;      // 输出缓冲区
uint64_t idx = input;            // 初始索引

for (int i = 0; i < 0x18; i++) {
    uint64_t offset = (idx * 4 + 0x10) % 0x8C;  // 计算表偏移
    dest[i] = *(uint8_t*)(base + offset);       // 查表写入
}
```

后续有很多这种异或逻辑，都是这种框架，且数值在变化，不可能人工还原算法，索性就hook一下时间校验函数，然后直接F9拿到最终的常量数据

hook脚本用的是dbg内自带脚本功能，代码可能不太好看，如果用Python写脚本的话可以参考这个项目，不过要装VS2015和Python2.7

-   [x64dbg/x64dbgpy: Automating x64dbg using Python, Snapshots:](https://github.com/x64dbg/x64dbgpy)
    

这里笔者就只用了一下自带的脚本功能来编写脚本，脚本如下，注意用下面这个脚本需要写入一个txt文档让dbg加载

```php
// ============================================================
// Hook Script for kernelbase.dll!GetSystemTimeAsFileTime
// 兼容 x64dbg 脚本引擎
// ============================================================

// ==== 配置：固定时间 (2023-06-15 12:00:00 UTC) ====
$fixedHigh = 0x01D941A0
$fixedLow  = 0xEBC3D800

// 拼接为完整的 64 位立即数 (高位左移32位 + 低位)
$fixedTime = $fixedHigh * 0x100000000 + $fixedLow

// ==== 获取 API 地址 ====
$apiAddr = kernelbase.dll:GetSystemTimeAsFileTime
cmp $apiAddr, 0
je exit_script

log "[+] 目标函数 VA: 0x{$apiAddr}"

// ==== 分配执行内存并写入 Fake 函数 ====
alloc 100
$fakeAddr = $result
cmp $fakeAddr, 0
je exit_script

log "[+] 分配的 Fake 内存: 0x{$fakeAddr}"

// 写入 Fake 函数逻辑 (直接载入64位立即数并写入RCX传参缓冲区)
// API 原型: VOID GetSystemTimeAsFileTime(LPFILETIME lpSystemTimeAsFileTime)
// RCX 指向调用方提供的缓冲区，将伪造时间直接写入该缓冲区
asm $fakeAddr, "mov rax, 0x{$fixedTime}"        // 长度 5 (B8 + 4字节)
asm $fakeAddr+0A, "mov qword ptr [rcx], rax"    // 长度 3 (48 89 01)
asm $fakeAddr+0D, "ret"                         // 长度 1 (C3)

// ==== 安装 Hook ====
// 覆盖原函数开头 16 字节为 NOP，防止多线程竞争时残留部分原指令
fill $apiAddr, 16, 0x90

// 写入绝对跳转指令 (跨模块跳转超出 rel32 范围，使用寄存器间接跳转)
asm $apiAddr, "mov rax, 0x{$fakeAddr}"          // 长度 10 (48:B8 + 8字节)
asm $apiAddr+0A, "jmp rax"                      // 长度 2 (FF E0)

log "[+] HOOK 安装成功! 返回固定时间: 0x{$fixedTime}"

exit_script:
ret
```

最终获取的常量数据如下

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/e768e62b6c996702.png)

## 五、相关贴子参考学习：

-   [https://blog.betamao.me/posts/2022/python-pyarmor-crack/](https://blog.betamao.me/posts/2022/python-pyarmor-crack/)
    
-   [https://zhuanlan.zhihu.com/p/609709232](https://zhuanlan.zhihu.com/p/609709232)
    
-   [Python常见的各种加密解密算法 - 吾爱破解 - 52pojie.cn](https://www.52pojie.cn/forum.php?mod=viewthread&tid=1829215&highlight=%BC%D3%C3%DC%BD%E2%C3%DC%CB%E3%B7%A8)
