---
title: 【看雪】PIC单片机逆向工程实战指南
source: https://bbs.kanxue.com/thread-292039.htm
source_host: bbs.kanxue.com
clip_date: 2026-07-16T21:42:06+08:00
trace_id: 1cda72ee-0be9-4782-85d8-87c512147fb9
content_hash: aff0446450007f31c2ff5786532da6c94e55671bbdc0e7b0c74e706c24029f17
status: summarized
tags:
  - 看雪
  - PIC单片机
  - 逆向工程
series: null
feed_source: 看雪·逆向工程
ai_summary: 成功逆向PIC单片机程序，通过对比法将206KB的hex文件完整还原为C源码，编译后与原文件二进制完全一致，为多种单片机逆向提供实战参考。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 39f75244-d011-8167-a72d-da9392d00748
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 成功逆向PIC单片机程序，通过对比法将206KB的hex文件完整还原为C源码，编译后与原文件二进制完全一致，为多种单片机逆向提供实战参考。
> 
> - **工具与环境：** 使用IDA Pro静态分析hex文件，配合MPLAB IDE v8.80和mcc18编译器进行编译与验证。
> - **核心方法：** 采用对比法逆向，编译简单C样例代码查看汇编指令序列，建立模式对照表并逐步还原源码。
> - **PIC指令关键点：** 需掌握哈佛结构特性、软堆栈机制（如FSR寄存器），并手动修正IDA对特殊功能寄存器地址的误解析。
> - **验证关键步骤：** 通过二进制对比（如fc命令）确保逆向编译生成的hex与原文件完全一致，功能与稳定性无差异。

> 从Hex文件到源码100%还原  
> **作者** ：sabason  
> **日期** ：2026年7月16日  
> \[技术文档·版权所有\]

## 摘要

本文详细记录了一次完整的PIC芯片逆向过程，从IDA静态分析、PIC指令学习、软堆栈理解，到最终通过MPLAB IDE编译验证，成功将206KB的hex文件逆向为工程源码，且编译后与原hex完全一致。适用于需要逆向PIC、STM32、51系列单片机的工程师参考。  
关键词：PIC单片机逆向；PIC反汇编；Hex转C；PIC指令；MPLAB；IDA

## 一、项目背景

项目来源：某公司产品核心程序由国外开发，无源码支持，需要增加新功能。  
两种方案：1.正向开发 2.逆向开发  
选择原因：考虑产品稳定性与开发周期，选择逆向开发。  
个人背景：多年x86/51/STM32逆向经验，PIC首次接触。

## 二、程序分析环境搭建

### 2.1 所需工具清单

| 工具  | 版本  | 用途  | 获取方式 |
| --- | --- | --- | --- |
| IDA Pro | 7.0+ | 静态分析hex文件，支持PIC处理器 | 官方购买/评估版 |
| MPLAB IDE | v8.80 | PIC官方开发环境，调试验证 | Microchip官网 |
| mcc18编译器 | v3.47 | PIC C编译器 | Microchip官网 |
| 串口调试助手 | \-  | 验证功能 | 网络下载 |

### 2.2 环境搭建步骤

1.  安装MPLAB IDE v8.80注意：v8.80是经典版本，对PIC18系列支持较好安装路径不要包含中文
2.  安装mcc18编译器安装完成后在MPLAB中配置编译器路径Project → Select Language Toolsuite → Microchip C18 Toolsuite
3.  IDA Pro设置打开IDA Pro，选择File → Open文件类型选择"All Files"，找到目标hex文件处理器类型选择"PIC系列"对应型号

### 2.3 加载Hex文件

拿到公司提供的hex文件以及相关电路原理图，通过IDA软件打开其hex文件。选择PIC系列对应型号，IDA处理器里支持PIC芯片的静态分析，无需自己写hex2asm。  
注意事项：使用F5发现不支持反编译，因此只能纯手工翻译。PIC的哈佛结构使得反编译比x86复杂，需要手工分析指令流。

## 三、PIC指令理解与关键点分析

### 3.1 寻找程序入口

在网上找到PIC芯片的开发IDE：MPLAB IDE v8.80，并安装其编译工具mcc18。找了一个样例工程编译后生成hex文件，然后与现有工程对比，发现 loc_seg001_1F73C 就是程序入口。通过C018I.c文件编译后的汇编与现工程对比，终于有了头绪。  
小技巧：PIC程序的入口通常不是0x0000，而是位于高端地址。C018I.c是PIC C编译器的启动文件，从中可以找到入口特征。

### 3.2 PIC指令特点

PIC虽然是8位芯片，但有第三方提供浮点支持库。其采用哈佛结构，从两个独立存储空间分别取指令和存取操作数，数据处理能力增强，同时功耗也很低，产品稳定性很好。

| 特性  | PIC (哈佛结构) | x86/51 (冯·诺依曼) |
| --- | --- | --- |
| 程序存储器 | 独立Flash | 与数据共用 |
| 数据存储器 | 独立RAM | 与程序共用 |
| 指令长度 | 固定(14/16位) | 可变  |
| 取指与取数 | 可同时进行 | 不能同时 |

### 3.3 指令详解

#### (1) movff指令

```python
movff   byte_RAM_3EE, POSTINC1
```

指令解析：- movff：move from file to file，在两个文件寄存器间传送数据- byte_RAM_3EE：源地址，RAM中0x3EE位置- POSTINC1：目的寄存器，使用后自动递增  
类比理解：

```python
// 类似C语言中的指针操作
char *ptr = 0x3EE;
char *dest = some_register;
*dest = *ptr;
ptr++;  // POSTINC1的自动递增效果
```

#### (2) f、w、ACCESS、BANKED的含义

PIC汇编中常用这些宏定义：

```python
#define f 1        // 表示使用文件寄存器
#define w 0        // 表示使用工作寄存器
#define ACCESS 0   // 当前RAM地址空间
#define BANKED 1   // 由BSR寄存器指定的RAM地址
```

使用方法：可以把IDA中的汇编代码用 \_asm... \_endasm 包裹起来，在IDE中调试，通过观察寄存器变化帮助理解PIC指令。  
示例：

```python
_asm
    movf   0x20, w, ACCESS    ; 将0x20地址的值送到工作寄存器w
    addwf  0x21, f, ACCESS     ; 加到0x21地址
_endasm
```

#### (3) 软堆栈与函数保护

PIC汇编示例：

```python
movff   FSR2L, POSTINC1
movff   FSR1L, FSR2L
movlw   4
addwf   FSR1L, f, ACCESS
```

x86类比：

```python
push ebp        ; 相当于 movff FSR2L, POSTINC1
mov ebp, esp    ; 相当于 movff FSR1L, FSR2L
add esp, 4      ; 相当于 movlw 4; addwf FSR1L, f, ACCESS
```

解释：- FSR1、FSR2是PIC的指针寄存器，类似于x86的esp和ebp- POSTINC1是一个特殊寄存器，用于堆栈操作- 这段代码表示该函数预留了4字节的局部变量空间

### 3.4 需要特别注意的地址

由于IDA对部分汇编指令解析错误，需要特别注意。例如：

```python
bsf byte_RAM_7E, 3, ACCESS
```

错误解析：IDA可能将其翻译为 byte_RAM_7E  
正确解析：这里没有使用bank，应该翻译为 F7 地址，也就是 BAUDCON1  
实际指令应为：

```python
BSF BAUDCON1, 0x3, ACCESS
```

关键提示：在逆向过程中，必须对照芯片数据手册核对特殊功能寄存器(SFR)的地址。IDA的自动解析可能不准确，需要人工修正。

### 3.5 PIC常用指令速查

| 指令  | 含义  | 示例  |
| --- | --- | --- |
| movf | 移动文件寄存器 | movf 0x20, w, ACCESS |
| movwf | 移动w到文件 | movwf 0x30, ACCESS |
| addwf | 加法  | addwf 0x20, f, ACCESS |
| bsf | 位设置 | bsf STATUS, 0, ACCESS |
| bcf | 位清除 | bcf STATUS, 0, ACCESS |
| call | 调用子程序 | call 0x1000 |
| goto | 跳转  | goto 0x2000 |

## 四、逆向方法详解

### 4.1 核心方法：对比法逆向

通过IDE编译样例程序，然后对比指令序列，再逐步转换为C语言代码。这种方法也适用于其它单片机逆向。  
具体步骤：

1.  编写测试代码：在MPLAB中编写简单的C代码，如：

```python
   void test(void) {
       int a = 10;
       int b = 20;
       int c = a + b;
   }
```

1.  编译查看汇编：View → Disassembly Listing，查看生成的汇编代码
2.  建立指令对照表：记录C语句对应的汇编序列
3.  应用到目标程序：在目标hex中寻找类似的汇编模式

### 4.2 逆向流程图

```python
┌─────────────────┐
│   获取hex文件   │
└────────┬────────┘
         ↓
┌─────────────────┐
│  IDA加载分析     │
└────────┬────────┘
         ↓
┌─────────────────┐
│ 定位程序入口    │ ←───────────┐
└────────┬────────┘             │
         ↓                       │
┌─────────────────┐              │
│ 识别函数边界    │              │
└────────┬────────┘              │
         ↓                       │
┌─────────────────┐     ┌─────────────────┐
│ 分析指令序列    │ ──→ │ 对照样例工程    │
└────────┬────────┘     └─────────────────┘
         ↓                       ↑
┌─────────────────┐              │
│ 转换为C代码     │ ────────────┘
└────────┬────────┘
         ↓
┌─────────────────┐
│ 编译验证        │
└────────┬────────┘
         ↓
┌─────────────────┐
│  hex完全一致    │
└─────────────────┘
```

### 4.3 验证结果

通过该方法，我成功将206KB的hex文件完整逆向为工程源码。然后使用MPLAB IDE v8.80编译生成的hex文件与原芯片中的hex进行对比，结果完全一致。  
验证工具：使用Beyond Compare或fc命令进行二进制对比

```python
Windows命令行
fc /b original.hex reversed.hex
```

输出示例

```python
正在比较文件 original.hex 和 REVERSED.HEX
FC: 找不到差异
```

烧录到芯片后测试，产品功能、性能及稳定性完全一致。最终成功完成整个工程的逆向。

## 五、总结与经验分享

### 5.1 PIC单片机逆向的关键点

| 序号  | 关键点 | 说明  |
| --- | --- | --- |
| 1   | 熟悉指令集 | PIC指令不多，但要注意哈佛结构的特殊性 |
| 2   | 善用对比法 | 通过编译样例工程对比指令序列 |
| 3   | 注意IDA误解析 | 部分bank地址需要手动修正，对照数据手册 |
| 4   | 验证是关键 | 必须确保编译后的hex与原hex完全一致 |
| 5   | 理解软堆栈 | 理解FSR、POSTINC等寄存器的作用 |

### 5.2 常见问题与解决方案

Q1：IDA无法正确识别函数边界？A：PIC的call/return模式与x86不同，需要手动分析。可以通过寻找return指令（如return 0）来定位函数结束。  
Q2：特殊功能寄存器(SFR)地址混乱？A：必须下载对应型号的数据手册，对照手册中的寄存器地址表进行修正。  
Q3：浮点运算代码难以理解？A：PIC的浮点运算通常调用库函数，可以识别常见的浮点库调用模式。

### 5.3 给新手的建议

1.  从简单的程序开始：先找一个简单的PIC示例程序（如LED闪烁）编译后分析，熟悉指令集2. 使用调试器：如果有开发板，可以在MPLAB中单步调试，观察寄存器变化3. 建立自己的指令库：记录常见的指令序列对应的C代码模式4. 多参考数据手册：PIC的数据手册非常详细，是逆向的最佳参考资料

## 六、附录：PIC常用指令速查表

### 6.1 数据传送指令

| 指令  | 语法  | 说明  |
| --- | --- | --- |
| movf | movf f, d, a | 传送文件寄存器 |
| movwf | movwf f, a | 写工作寄存器到文件 |
| movff | movff fs, fd | 文件到文件传送 |
| movlw | movlw k | 传送立即数到工作寄存器 |

### 6.2 算术运算指令

| 指令  | 语法  | 说明  |
| --- | --- | --- |
| addwf | addwf f, d, a | 加法  |
| subwf | subwf f, d, a | 减法  |
| mulwf | mulwf f, a | 乘法  |
| incf | incf f, d, a | 加1  |
| decf | decf f, d, a | 减1  |

### 6.3 逻辑运算指令

| 指令  | 语法  | 说明  |
| --- | --- | --- |
| andwf | andwf f, d, a | 与   |
| iorwf | iorwf f, d, a | 或   |
| xorwf | xorwf f, d, a | 异或  |
| comf | comf f, d, a | 取反  |

### 6.4 位操作指令

| 指令  | 语法  | 说明  |
| --- | --- | --- |
| bcf | bcf f, b, a | 位清零 |
| bsf | bsf f, b, a | 位置1 |
| btfsc | btfsc f, b, a | 位测试，为0则跳过 |
| btfss | btfss f, b, a | 位测试，为1则跳过 |

### 6.5 控制转移指令

| 指令  | 语法  | 说明  |
| --- | --- | --- |
| goto | goto k | 无条件跳转 |
| call | call k | 调用子程序 |
| return | return | 从子程序返回 |
| retlw | retlw k | 返回并带立即数到w |

## 参考文献

1.  Microchip Technology Inc. PIC18Fxx Datasheet2. MPLAB IDE User's Guide3. MPLAB C18 C Compiler User's Guide

## 作者简介

作者：sabason | 邮箱：19699100@qq.com | 微信：sabason  
擅长领域：多年嵌入式逆向经验，熟悉x86、51、STM32、PIC等平台。提供PIC、STM32、51系列单片机逆向开发服务。  
声明：本文档仅供技术交流学习使用，请勿用于非法用途。逆向工程应遵守相关法律法规和知识产权保护规定。
