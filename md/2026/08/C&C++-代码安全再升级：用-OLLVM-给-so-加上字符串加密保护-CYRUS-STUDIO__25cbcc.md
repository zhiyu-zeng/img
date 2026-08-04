---
title: C&C++ 代码安全再升级：用 OLLVM 给 so 加上字符串加密保护 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/cc++-%E4%BB%A3%E7%A0%81%E5%AE%89%E5%85%A8%E5%86%8D%E5%8D%87%E7%BA%A7%E7%94%A8-ollvm-%E7%BB%99-so-%E5%8A%A0%E4%B8%8A%E5%AD%97%E7%AC%A6%E4%B8%B2%E5%8A%A0%E5%AF%86%E4%BF%9D%E6%8A%A4/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:03:55+08:00
trace_id: fd739bfb-b9e8-449c-b393-2e2a8a6e3b68
content_hash: 4638a06a45c9655924fdbcc6a94e78cbeefe9a3c793f1130a23c067c47874efb
status: synced
tags:
  - 编译器保护
  - Android逆向
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 通过 OLLVM 编译期对 .so 中字符串随机加密、运行时按需解密，可杜绝逆向工具直接查看明文字符串，显著提升 Native 层安全。
ai_summary_style: key-points
images_status:
  total: 9
  succeeded: 9
  failed_urls: []
notion_page_id: 3b275244-d011-81e3-9a86-fe7f901877ff
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 OLLVM 编译期对 .so 中字符串随机加密、运行时按需解密，可杜绝逆向工具直接查看明文字符串，显著提升 Native 层安全。
> 
> - **实现原理：** 遍历 LLVM IR 中的常量 C 字符串，生成 16–32 字节随机密钥进行异或加密，自动生成解密函数，并在每个使用点替换为对解密后全局变量的引用。
> - **收集与加密：** 利用 `StringEncryptionPass` 遍历所有 `GlobalVariable`，筛选出 `ConstantDataSequential` 字符串，放入 `ConstantStringPool`，调用 `getRandomBytes` 生成密钥并对数据逐字节异或。
> - **解密与初始化：** 为每个字符串生成解密函数（XOR 循环，检查解密状态 `DecStatus` 避免重复解密），并为字符串使用者构建初始化函数，在首次引用前调用解密。
> - **替换引用：** `processConstantStringUse` 扫描函数内指令，将原始全局变量替换为新的解密后全局变量，并在适当位置插入解密调用，最后删除无用的明文字符串变量。
> - **NDK 集成与效果：** 编译 OLLVM 工具链后，在 CMakeLists.txt 添加 `-mllvm -sobf` 即可启用；IDA 中不再显示明文，仅见类似 `&unk_*` 引用和解密函数，字符串仅在运行时内存中瞬间还原。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在 Android 应用的 Native so 中， **C/C++ 字符串是最容易泄露的弱点**。只要用 IDA、Ghidra 等逆向工具打开 so，明文字符串往往一览无余，核心逻辑、协议关键字、敏感信息都可能直接暴露。

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/28f0e8f73692a6fb.png)](data:image/png;base64,inline-130574B)

这意味着，即使你对函数做了混淆，对控制流做了平坦化， **只要字符串没保护，就等于把应用的秘密写在了明面上**。

解决办法： **对字符串加密**。而基于 LLVM 的 **OLLVM**，恰好提供了一个可扩展的平台，我们可以在编译过程中自动收集、加密、替换字符串，让 so 中不再出现明文常量。

本文将带你一步步实现：在 OLLVM 中增加一个 **字符串加密 Pass**，并演示如何移植到 Android NDK 工程中实战应用。

## 字符串加密原理

**OLLVM 字符串加密的原理** 很简单：它在 **编译阶段** 对所有字符串常量做一次「改写」，程序运行时把密文恢复成明文。具体过程是：

1.  收集 IR 中的字符串常量（例如 const char\* str = “hello”;）；
    
2.  在编译时使用自定义算法对字符串加密（常见做法是异或、移位或更复杂的算法）；
    
3.  自动生成一个解密函数，在程序运行时把密文恢复成明文；
    
4.  替换原本对字符串的引用，让代码使用解密后的结果。
    

这样一来，最终生成的 so 文件里就不再存放任何明文字符串，逆向工具看到的都是类似 &unk\_\* 的引用， **只有在程序真正运行时，才会在内存里还原出可用的字符串**。这大大提升了逆向分析的难度。

## LLVM IR 中的字符串

编写 C代码 sobf.c 如下：

```cpp
#include <stdio.h>

int main() {
    // 定义字符串常量
    const char *greeting = "Hello, World!";
    const char *name = "Cyrus";
    const char *message = "Welcome to C programming.";

    // 打印字符串常量
    printf("%s\n", greeting);
    printf("My name is %s.\n", name);
    printf("%s\n", message);

    return 0;
}
```

生成 ir 文件

```
clang -S -emit-llvm sobf.c -o sobf.ll
```

生成 LLVM IR 代码如下：

```kotlin
; ModuleID = 'sobf.c'
source_filename = "sobf.c"
target datalayout = "e-m:w-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-pc-windows-msvc19.42.34433"

...

$"??_C@_0O@KLMCIIGF@Hello?0?5World?$CB?$AA@" = comdat any

$"??_C@_03OFAPEBGM@?$CFs?6?$AA@" = comdat any

$"??_C@_05KECNEMLJ@Cyrus?$AA@" = comdat any

$"??_C@_0BA@ENLIINEF@My?5name?5is?5?$CFs?4?6?$AA@" = comdat any

@"??_C@_0O@KLMCIIGF@Hello?0?5World?$CB?$AA@" = linkonce_odr dso_local unnamed_addr constant [14 x i8] c"Hello, World!\00", comdat, align 1
@"??_C@_03OFAPEBGM@?$CFs?6?$AA@" = linkonce_odr dso_local unnamed_addr constant [4 x i8] c"%s\0A\00", comdat, align 1
@"??_C@_05KECNEMLJ@Cyrus?$AA@" = linkonce_odr dso_local unnamed_addr constant [6 x i8] c"Cyrus\00", comdat, align 1
@"??_C@_0BA@ENLIINEF@My?5name?5is?5?$CFs?4?6?$AA@" = linkonce_odr dso_local unnamed_addr constant [16 x i8] c"My name is %s.\0A\00", comdat, align 1
@__local_stdio_printf_options._OptionsStorage = internal global i64 0, align 8

...

; Function Attrs: noinline nounwind optnone uwtable
define dso_local i32 @main() #0 {
  %1 = alloca i32, align 4
  %2 = alloca ptr, align 8
  store i32 0, ptr %1, align 4
  store ptr @"??_C@_0O@KLMCIIGF@Hello?0?5World?$CB?$AA@", ptr %2, align 8
  %3 = load ptr, ptr %2, align 8
  %4 = call i32 (ptr, ...) @printf(ptr noundef @"??_C@_03OFAPEBGM@?$CFs?6?$AA@", ptr noundef %3)
  %5 = call i32 (ptr, ...) @printf(ptr noundef @"??_C@_0BA@ENLIINEF@My?5name?5is?5?$CFs?4?6?$AA@", ptr noundef @"??_C@_05KECNEMLJ@Cyrus?$AA@")
  ret i32 0
}

...
```

LLVM IR 中：

-   通过 $"??\_C@ 定义一个字符串常量，后面是哈希值和字符串名称的编码。
    
-   通过 @"??*C@* 引用字符串常量
    

只要把字符串常量加密，替换掉原来字符串的引用，改为使用运行时解密的结果，就可以实现字符串的自动加解密了。

字符串常量

```bash
@"??_C@_0O@KLMCIIGF@Hello?0?5World?$CB?$AA@" = linkonce_odr dso_local unnamed_addr constant [14 x i8] c"Hello, World!\00", comdat, align 1
@"??_C@_05KECNEMLJ@Cyrus?$AA@" = linkonce_odr dso_local unnamed_addr constant [6 x i8] c"Cyrus\00", comdat, align 1
@"??_C@_0BA@ENLIINEF@My?5name?5is?5?$CFs?4?6?$AA@" = linkonce_odr dso_local unnamed_addr constant [16 x i8] c"My name is %s.\0A\00", comdat, align 1
```

-   “Hello, World!”
    
-   “Cyrus”
    
-   “My name is %s.”
    

main()函数

```kotlin
define dso_local i32 @main() #0 {
  store ptr @"??_C@_0O@KLMCIIGF@Hello?0?5World?$CB?$AA@", ptr %2, align 8
  %3 = load ptr, ptr %2, align 8
  %4 = call i32 (ptr, ...) @printf(ptr noundef @"??_C@_03OFAPEBGM@?$CFs?6?$AA@", ptr noundef %3)
  %5 = call i32 (ptr, ...) @printf(ptr noundef @"??_C@_0BA@ENLIINEF@My?5name?5is?5?$CFs?4?6?$AA@", ptr noundef @"??_C@_05KECNEMLJ@Cyrus?$AA@")
  ret i32 0
}
```

-   读取 “Hello, World!” 并通过 printf 输出。
    
-   使用 printf 打印 “My name is Cyrus."，通过 %s 占位符传入 “Cyrus”。
    

## 实现字符串加密

## 1\. StringEncryption.h

```cpp
#ifndef LLVM_STRING_ENCRYPTION_H
#define LLVM_STRING_ENCRYPTION_H
// LLVM libs
#include "llvm/Transforms/Utils/GlobalStatus.h"
#include "llvm/IR/LLVMContext.h"
#include "llvm/IR/Constants.h"
#include "llvm/IR/GlobalValue.h"
#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/InstIterator.h"
#include "llvm/IR/Instructions.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/IR/Module.h"
#include "llvm/IR/Value.h"
#include "llvm/Pass.h"
#include "llvm/Support/CommandLine.h"
#include "llvm/Support/TargetSelect.h"
#include "llvm/Transforms/Utils/BasicBlockUtils.h"
//#include "llvm/Transforms/IPO/PassManagerBuilder.h"
#include "llvm/Support/FormatVariadic.h"
#include "llvm/Support/SHA1.h"
#include "llvm/Transforms/Utils/ModuleUtils.h"

// User libs
#include "CryptoUtils.h"
#include "Utils.h"
// System libs
#include <map>
#include <set>
#include <iostream>
#include <algorithm>
#include <iomanip>
#include <sstream>
#include <vector>

#include "ObfuscationOptions.h"

using namespace std;
namespace llvm {
struct EncryptedGV {
  GlobalVariable *GV;
  uint64_t key;
  uint32_t len;
};

class StringEncryptionPass : public PassInfoMixin<StringEncryptionPass> {
public:
  bool flag;
  struct CSPEntry {
    CSPEntry()
        : ID(0), Offset(0), DecGV(nullptr), DecStatus(nullptr),
          DecFunc(nullptr) {}
    unsigned ID;
    unsigned Offset;
    GlobalVariable *DecGV;
    GlobalVariable *DecStatus; // is decrypted or not
    std::vector<uint8_t> Data;
    std::vector<uint8_t> EncKey;
    Function *DecFunc;
  };

  struct CSUser {
    CSUser(Type *ETy, GlobalVariable *User, GlobalVariable *NewGV)
        : Ty(ETy), GV(User), DecGV(NewGV), DecStatus(nullptr),
          InitFunc(nullptr) {}
    Type *Ty;
    GlobalVariable *GV;
    GlobalVariable *DecGV;
    GlobalVariable *DecStatus; // is decrypted or not
    Function *InitFunc;        // InitFunc will use decryted string to
    // initialize DecGV
  };

  ObfuscationOptions *Options;
  CryptoUtils RandomEngine;
  std::vector<CSPEntry *> ConstantStringPool;
  std::map<GlobalVariable *, CSPEntry *> CSPEntryMap;
  std::map<GlobalVariable *, CSUser *> CSUserMap;
  GlobalVariable *EncryptedStringTable;
  std::set<GlobalVariable *> MaybeDeadGlobalVars;

  map<Function * /*Function*/, GlobalVariable * /*Decryption Status*/>
      encstatus;
  StringEncryptionPass(bool flag) {
    this->flag = flag;
    Options = new ObfuscationOptions;
    //EncryptedStringTable = new GlobalVariable;
  }
  PreservedAnalyses run(Module &M, ModuleAnalysisManager &AM); // Pass实现函数
  bool do_StrEnc(Module &M, ModuleAnalysisManager &AM);
  void collectConstantStringUser(GlobalVariable *CString,
                                 std::set<GlobalVariable *> &Users);
  bool isValidToEncrypt(GlobalVariable *GV);
  bool processConstantStringUse(Function *F);
  void deleteUnusedGlobalVariable();
  Function *buildDecryptFunction(Module *M, const CSPEntry *Entry);
  Function *buildInitFunction(Module *M, const CSUser *User);
  void getRandomBytes(std::vector<uint8_t> &Bytes, uint32_t MinSize,
                      uint32_t MaxSize);
  void lowerGlobalConstant(Constant *CV, IRBuilder<> &IRB, Value *Ptr,
                           Type *Ty);
  void lowerGlobalConstantStruct(ConstantStruct *CS, IRBuilder<> &IRB,
                                 Value *Ptr, Type *Ty);
  void lowerGlobalConstantArray(ConstantArray *CA, IRBuilder<> &IRB, Value *Ptr,
                                Type *Ty);
  static bool isRequired() { return true; } // 直接返回true即可
};
StringEncryptionPass *createStringEncryption(bool flag); // 创建字符串加密
}
#endif
```

## 2\. StringEncryption.cpp

### 2.1 收集字符串常量

在 run 方法迭代每一条指令，收集字符串常量

```rust
for (GlobalVariable &GV : M.globals()) {
    if (!GV.isConstant() || !GV.hasInitializer()) {
        continue;
    }
    if (ConstantDataSequential *CDS = dyn_cast<ConstantDataSequential>(GV.getInitializer())) {
        if (CDS->isCString()) {
            // 对每个字符串，构建一个 CSPEntry，保存原始字节数据。
            CSPEntry *Entry = new CSPEntry();
            StringRef Data = CDS->getRawDataValues();
            for (unsigned i = 0; i < Data.size(); ++i) {
                Entry->Data.push_back(static_cast<uint8_t>(Data[i]));
            }
            Entry->ID = static_cast<unsigned>(ConstantStringPool.size());
        }
    }
}
```

-   遍历 Module 内的 GlobalVariable。
    
-   只处理常量字符串 ConstantDataSequential。
    
-   存入 ConstantStringPool（字符串池）。
    

### 2.2 加密字符串 和 构造解密函数

```rust
// encrypt those strings, build corresponding decrypt function
for (CSPEntry *Entry : ConstantStringPool) {
  // 给每个 CSPEntry 生成随机密钥 EncKey  
  getRandomBytes(Entry->EncKey, 16, 32);
  for (unsigned i = 0; i < Entry->Data.size(); ++i) {
    Entry->Data[i] ^= Entry->EncKey[i % Entry->EncKey.size()];
  }
  // 构造解密函数
  Entry->DecFunc = buildDecryptFunction(&M, Entry);
}
```

-   getRandomBytes() 生成 16-32 字节的随机密钥。
    
-   使用 XOR 操作加密字符串。
    

### 2.3 创建一个初始化函数

为字符串变量创建一个初始化函数，用于在运行时执行解密操作。

```rust
// build initialization function for supported constant string users
for (GlobalVariable *GV : ConstantStringUsers) {
  if (isValidToEncrypt(GV)) {
    Type *EltType = GV->getValueType();
    ConstantAggregateZero *ZeroInit = ConstantAggregateZero::get(EltType);
    GlobalVariable *DecGV =
        new GlobalVariable(M, EltType, false, GlobalValue::PrivateLinkage,
                           ZeroInit, "dec_" + GV->getName());
    DecGV->setAlignment(MaybeAlign(GV->getAlignment()));
    GlobalVariable *DecStatus = new GlobalVariable(
        M, Type::getInt32Ty(Ctx), false, GlobalValue::PrivateLinkage, Zero,
        "dec_status_" + GV->getName());
    CSUser *User = new CSUser(EltType, GV, DecGV);
    User->DecStatus = DecStatus;
    User->InitFunc = buildInitFunction(&M, User);
    CSUserMap[GV] = User;
  }
}
```

### 2.4 修改使用字符串的地方

processConstantStringUse() 找到所有使用加密字符串的地方，替换为解密后的变量。

```rust
// decrypt string back at every use, change the plain string use to the
// decrypted one
bool Changed = false;
for (Function &F : M) {
  if (F.isDeclaration())
    continue;
  Changed |= processConstantStringUse(&F);
}

for (auto &I : CSUserMap) {
  CSUser *User = I.second;
  Changed |= processConstantStringUse(User->InitFunc);
}
```

### 完整代码

```rust
#include "StringEncryption.h"

#define DEBUG_TYPE "strenc"

using namespace llvm;

bool StringEncryptionPass::do_StrEnc(Module &M, ModuleAnalysisManager &AM) {
  std::set<GlobalVariable *> ConstantStringUsers;

  // collect all c strings

  LLVMContext &Ctx = M.getContext();
  ConstantInt *Zero = ConstantInt::get(Type::getInt32Ty(Ctx), 0);
  for (GlobalVariable &GV : M.globals()) {
    if (!GV.isConstant() || !GV.hasInitializer() ||
        GV.hasDLLExportStorageClass() || GV.isDLLImportDependent()) {
      continue;
    }
    Constant *Init = GV.getInitializer();
    if (Init == nullptr)
      continue;
    if (ConstantDataSequential *CDS = dyn_cast<ConstantDataSequential>(Init)) {
      if (CDS->isCString()) {
        CSPEntry *Entry = new CSPEntry();
        StringRef Data = CDS->getRawDataValues();
        Entry->Data.reserve(Data.size());
        for (unsigned i = 0; i < Data.size(); ++i) {
          Entry->Data.push_back(static_cast<uint8_t>(Data[i]));
        }
        Entry->ID = static_cast<unsigned>(ConstantStringPool.size());
        ConstantAggregateZero *ZeroInit =
            ConstantAggregateZero::get(CDS->getType());
        GlobalVariable *DecGV = new GlobalVariable(
            M, CDS->getType(), false, GlobalValue::PrivateLinkage, ZeroInit,
            "dec" + Twine::utohexstr(Entry->ID) + GV.getName());
        GlobalVariable *DecStatus = new GlobalVariable(
            M, Type::getInt32Ty(Ctx), false, GlobalValue::PrivateLinkage, Zero,
            "dec_status_" + Twine::utohexstr(Entry->ID) + GV.getName());
        DecGV->setAlignment(MaybeAlign(GV.getAlignment()));
        Entry->DecGV = DecGV;
        Entry->DecStatus = DecStatus;
        ConstantStringPool.push_back(Entry);
        CSPEntryMap[&GV] = Entry;
        collectConstantStringUser(&GV, ConstantStringUsers);
      }
    }
  }

  // encrypt those strings, build corresponding decrypt function
  for (CSPEntry *Entry : ConstantStringPool) {
    getRandomBytes(Entry->EncKey, 16, 32);
    for (unsigned i = 0; i < Entry->Data.size(); ++i) {
      Entry->Data[i] ^= Entry->EncKey[i % Entry->EncKey.size()];
    }
    Entry->DecFunc = buildDecryptFunction(&M, Entry);
  }

  // build initialization function for supported constant string users
  for (GlobalVariable *GV : ConstantStringUsers) {
    if (isValidToEncrypt(GV)) {
      Type *EltType = GV->getValueType();
      ConstantAggregateZero *ZeroInit = ConstantAggregateZero::get(EltType);
      GlobalVariable *DecGV =
          new GlobalVariable(M, EltType, false, GlobalValue::PrivateLinkage,
                             ZeroInit, "dec_" + GV->getName());
      DecGV->setAlignment(MaybeAlign(GV->getAlignment()));
      GlobalVariable *DecStatus = new GlobalVariable(
          M, Type::getInt32Ty(Ctx), false, GlobalValue::PrivateLinkage, Zero,
          "dec_status_" + GV->getName());
      CSUser *User = new CSUser(EltType, GV, DecGV);
      User->DecStatus = DecStatus;
      User->InitFunc = buildInitFunction(&M, User);
      CSUserMap[GV] = User;
    }
  }

  // emit the constant string pool
  // | junk bytes | key 1 | encrypted string 1 | junk bytes | key 2 | encrypted
  // string 2 | ...
  std::vector<uint8_t> Data;
  std::vector<uint8_t> JunkBytes;

  JunkBytes.reserve(32);
  for (CSPEntry *Entry : ConstantStringPool) {
    JunkBytes.clear();
    getRandomBytes(JunkBytes, 16, 32);
    Data.insert(Data.end(), JunkBytes.begin(), JunkBytes.end());
    Entry->Offset = static_cast<unsigned>(Data.size());
    Data.insert(Data.end(), Entry->EncKey.begin(), Entry->EncKey.end());
    Data.insert(Data.end(), Entry->Data.begin(), Entry->Data.end());
  }

  Constant *CDA =
      ConstantDataArray::get(M.getContext(), ArrayRef<uint8_t>(Data));
  EncryptedStringTable =
      new GlobalVariable(M, CDA->getType(), true, GlobalValue::PrivateLinkage,
                         CDA, "EncryptedStringTable");

  // decrypt string back at every use, change the plain string use to the
  // decrypted one
  bool Changed = false;
  for (Function &F : M) {
    if (F.isDeclaration())
      continue;
    Changed |= processConstantStringUse(&F);
  }

  for (auto &I : CSUserMap) {
    CSUser *User = I.second;
    Changed |= processConstantStringUse(User->InitFunc);
  }

  // delete unused global variables
  deleteUnusedGlobalVariable();
  for (CSPEntry *Entry : ConstantStringPool) {
    if (Entry->DecFunc->use_empty()) {
      Entry->DecFunc->eraseFromParent();
    }
  }
  return Changed;
}

PreservedAnalyses StringEncryptionPass::run(Module &M, ModuleAnalysisManager &AM) {
  if (this->flag) {
    outs() << "[Soule] force.run.StringEncryptionPass\n";
    if (do_StrEnc(M, AM))
      return PreservedAnalyses::none();
  }
  return PreservedAnalyses::all();
}

void StringEncryptionPass::getRandomBytes(std::vector<uint8_t> &Bytes,
                                      uint32_t MinSize, uint32_t MaxSize) {
    uint32_t N = RandomEngine.get_uint32_t();
    uint32_t Len;

    assert(MaxSize >= MinSize);

    if (MinSize == MaxSize) {
        Len = MinSize;
    } else {
        Len = MinSize + (N % (MaxSize - MinSize));
    }

    char *Buffer = new char[Len];
    RandomEngine.get_bytes(Buffer, Len);
    for (uint32_t i = 0; i < Len; ++i) {
        Bytes.push_back(static_cast<uint8_t>(Buffer[i]));
    }

    delete[] Buffer;
}

//
// static void goron_decrypt_string(uint8_t *plain_string, const uint8_t *data)
//{
//  const uint8_t *key = data;
//  uint32_t key_size = 1234;
//  uint8_t *es = (uint8_t *) &data[key_size];
//  uint32_t i;
//  for (i = 0;i < 5678;i ++) {
//    plain_string[i] = es[i] ^ key[i % key_size];
//  }
//}

Function *StringEncryptionPass::buildDecryptFunction(
    Module *M, const StringEncryptionPass::CSPEntry *Entry) {
    LLVMContext &Ctx = M->getContext();
    IRBuilder<> IRB(Ctx);
    FunctionType *FuncTy = FunctionType::get(
        Type::getVoidTy(Ctx), {IRB.getPtrTy(), IRB.getPtrTy()}, false);
    Function *DecFunc = Function::Create(
        FuncTy, GlobalValue::PrivateLinkage,
        "goron_decrypt_string_" + Twine::utohexstr(Entry->ID), M);

    auto ArgIt = DecFunc->arg_begin();
    Argument *PlainString = ArgIt; // output
    ++ArgIt;
    Argument *Data = ArgIt; // input

    PlainString->setName("plain_string");
    PlainString->addAttr(Attribute::NoCapture);
    Data->setName("data");
    Data->addAttr(Attribute::NoCapture);
    Data->addAttr(Attribute::ReadOnly);

    BasicBlock *Enter = BasicBlock::Create(Ctx, "Enter", DecFunc);
    BasicBlock *LoopBody = BasicBlock::Create(Ctx, "LoopBody", DecFunc);
    BasicBlock *UpdateDecStatus =
        BasicBlock::Create(Ctx, "UpdateDecStatus", DecFunc);
    BasicBlock *Exit = BasicBlock::Create(Ctx, "Exit", DecFunc);

    IRB.SetInsertPoint(Enter);
    ConstantInt *KeySize =
        ConstantInt::get(Type::getInt32Ty(Ctx), Entry->EncKey.size());
    Value *EncPtr = IRB.CreateInBoundsGEP(IRB.getInt8Ty(), Data, KeySize);
    Value *DecStatus =
        IRB.CreateLoad(Entry->DecStatus->getValueType(), Entry->DecStatus);
    Value *IsDecrypted = IRB.CreateICmpEQ(DecStatus, IRB.getInt32(1));
    IRB.CreateCondBr(IsDecrypted, Exit, LoopBody);

    IRB.SetInsertPoint(LoopBody);
    PHINode *LoopCounter = IRB.CreatePHI(IRB.getInt32Ty(), 2);
    LoopCounter->addIncoming(IRB.getInt32(0), Enter);

    Value *EncCharPtr =
        IRB.CreateInBoundsGEP(IRB.getInt8Ty(), EncPtr, LoopCounter);
    Value *EncChar = IRB.CreateLoad(IRB.getInt8Ty(), EncCharPtr);
    Value *KeyIdx = IRB.CreateURem(LoopCounter, KeySize);

    Value *KeyCharPtr = IRB.CreateInBoundsGEP(IRB.getInt8Ty(), Data, KeyIdx);
    Value *KeyChar = IRB.CreateLoad(IRB.getInt8Ty(), KeyCharPtr);

    Value *DecChar = IRB.CreateXor(EncChar, KeyChar);
    Value *DecCharPtr =
        IRB.CreateInBoundsGEP(IRB.getInt8Ty(), PlainString, LoopCounter);
    IRB.CreateStore(DecChar, DecCharPtr);

    Value *NewCounter =
        IRB.CreateAdd(LoopCounter, IRB.getInt32(1), "", true, true);
    LoopCounter->addIncoming(NewCounter, LoopBody);

    Value *Cond = IRB.CreateICmpEQ(
        NewCounter, IRB.getInt32(static_cast<uint32_t>(Entry->Data.size())));
    IRB.CreateCondBr(Cond, UpdateDecStatus, LoopBody);

    IRB.SetInsertPoint(UpdateDecStatus);
    IRB.CreateStore(IRB.getInt32(1), Entry->DecStatus);
    IRB.CreateBr(Exit);

    IRB.SetInsertPoint(Exit);
    IRB.CreateRetVoid();

    return DecFunc;
}

Function *
StringEncryptionPass::buildInitFunction(Module *M,
                                    const StringEncryptionPass::CSUser *User) {
    LLVMContext &Ctx = M->getContext();
    IRBuilder<> IRB(Ctx);
    FunctionType *FuncTy = FunctionType::get(Type::getVoidTy(Ctx),
                                             {User->DecGV->getType()}, false);
    Function *InitFunc = Function::Create(
        FuncTy, GlobalValue::PrivateLinkage,
        "__global_variable_initializer_" + User->GV->getName(), M);

    auto ArgIt = InitFunc->arg_begin();
    Argument *thiz = ArgIt;

    thiz->setName("this");
    thiz->addAttr(Attribute::NoCapture);

    // convert constant initializer into a series of instructions
    BasicBlock *Enter = BasicBlock::Create(Ctx, "Enter", InitFunc);
    BasicBlock *InitBlock = BasicBlock::Create(Ctx, "InitBlock", InitFunc);
    BasicBlock *Exit = BasicBlock::Create(Ctx, "Exit", InitFunc);

    IRB.SetInsertPoint(Enter);
    Value *DecStatus =
        IRB.CreateLoad(User->DecStatus->getValueType(), User->DecStatus);
    Value *IsDecrypted = IRB.CreateICmpEQ(DecStatus, IRB.getInt32(1));
    IRB.CreateCondBr(IsDecrypted, Exit, InitBlock);

    IRB.SetInsertPoint(InitBlock);
    Constant *Init = User->GV->getInitializer();
    lowerGlobalConstant(Init, IRB, User->DecGV, User->Ty);
    IRB.CreateStore(IRB.getInt32(1), User->DecStatus);
    IRB.CreateBr(Exit);

    IRB.SetInsertPoint(Exit);
    IRB.CreateRetVoid();
    return InitFunc;
}

void StringEncryptionPass::lowerGlobalConstant(Constant *CV, IRBuilder<> &IRB,
                                           Value *Ptr, Type *Ty) {
    if (isa<ConstantAggregateZero>(CV)) {
        IRB.CreateStore(CV, Ptr);
        return;
    }

    if (ConstantArray *CA = dyn_cast<ConstantArray>(CV)) {
        lowerGlobalConstantArray(CA, IRB, Ptr, Ty);
    } else if (ConstantStruct *CS = dyn_cast<ConstantStruct>(CV)) {
        lowerGlobalConstantStruct(CS, IRB, Ptr, Ty);
    } else {
        IRB.CreateStore(CV, Ptr);
    }
}

void StringEncryptionPass::lowerGlobalConstantArray(ConstantArray *CA,
                                                IRBuilder<> &IRB, Value *Ptr,
                                                Type *Ty) {
    for (unsigned i = 0, e = CA->getNumOperands(); i != e; ++i) {
        Constant *CV = CA->getOperand(i);
        Value *GEP = IRB.CreateGEP(Ty, Ptr, {IRB.getInt32(0), IRB.getInt32(i)});
        lowerGlobalConstant(CV, IRB, GEP, CV->getType());
    }
}

void StringEncryptionPass::lowerGlobalConstantStruct(ConstantStruct *CS,
                                                 IRBuilder<> &IRB, Value *Ptr,
                                                 Type *Ty) {
    for (unsigned i = 0, e = CS->getNumOperands(); i != e; ++i) {
        Constant *CV = CS->getOperand(i);
        Value *GEP = IRB.CreateGEP(Ty, Ptr, {IRB.getInt32(0), IRB.getInt32(i)});
        lowerGlobalConstant(CV, IRB, GEP, CV->getType());
    }
}

bool StringEncryptionPass::processConstantStringUse(Function *F) {
    if (!toObfuscate(flag, F, "cse")) {
        return false;
    }
    if (Options && Options->skipFunction(F->getName())) {
        return false;
    }
    LowerConstantExpr(*F);
    SmallPtrSet<GlobalVariable *, 16>
        DecryptedGV; // if GV has multiple use in a block, decrypt only at the
                     // first use
    bool Changed = false;
    for (BasicBlock &BB : *F) {
        DecryptedGV.clear();
        if (BB.isEHPad()) {
            continue;
        }
        for (Instruction &Inst : BB) {
            if (Inst.isEHPad()) {
                continue;
            }
            if (PHINode *PHI = dyn_cast<PHINode>(&Inst)) {
                for (unsigned int i = 0; i < PHI->getNumIncomingValues(); ++i) {
                    if (GlobalVariable *GV = dyn_cast<GlobalVariable>(
                            PHI->getIncomingValue(i))) {
                        auto Iter1 = CSPEntryMap.find(GV);
                        auto Iter2 = CSUserMap.find(GV);
                        if (Iter2 !=
                            CSUserMap.end()) { // GV is a constant string user
                        CSUser *User = Iter2->second;
                        if (DecryptedGV.count(GV) > 0) {
                            Inst.replaceUsesOfWith(GV, User->DecGV);
                        } else {
                            Instruction *InsertPoint =
                                PHI->getIncomingBlock(i)->getTerminator();
                            IRBuilder<> IRB(InsertPoint);
                            IRB.CreateCall(User->InitFunc, {User->DecGV});
                            Inst.replaceUsesOfWith(GV, User->DecGV);
                            MaybeDeadGlobalVars.insert(GV);
                            DecryptedGV.insert(GV);
                            Changed = true;
                        }
                        } else if (Iter1 !=
                                   CSPEntryMap
                                       .end()) { // GV is a constant string
                        CSPEntry *Entry = Iter1->second;
                        if (DecryptedGV.count(GV) > 0) {
                            Inst.replaceUsesOfWith(GV, Entry->DecGV);
                        } else {
                            Instruction *InsertPoint =
                                PHI->getIncomingBlock(i)->getTerminator();
                            IRBuilder<> IRB(InsertPoint);

                            Value *OutBuf = IRB.CreateBitCast(Entry->DecGV, IRB.getPtrTy());
                            Value *Data = IRB.CreateInBoundsGEP(
                                EncryptedStringTable->getValueType(),
                                EncryptedStringTable,
                                {IRB.getInt32(0), IRB.getInt32(Entry->Offset)});
                            IRB.CreateCall(Entry->DecFunc, {OutBuf, Data});

                            Inst.replaceUsesOfWith(GV, Entry->DecGV);
                            MaybeDeadGlobalVars.insert(GV);
                            DecryptedGV.insert(GV);
                            Changed = true;
                        }
                        }
                    }
                }
            } else {
                for (User::op_iterator op = Inst.op_begin();
                     op != Inst.op_end(); ++op) {
                    if (GlobalVariable *GV = dyn_cast<GlobalVariable>(*op)) {
                        auto Iter1 = CSPEntryMap.find(GV);
                        auto Iter2 = CSUserMap.find(GV);
                        if (Iter2 != CSUserMap.end()) {
                        CSUser *User = Iter2->second;
                        if (DecryptedGV.count(GV) > 0) {
                            Inst.replaceUsesOfWith(GV, User->DecGV);
                        } else {
                            IRBuilder<> IRB(&Inst);
                            IRB.CreateCall(User->InitFunc, {User->DecGV});
                            Inst.replaceUsesOfWith(GV, User->DecGV);
                            MaybeDeadGlobalVars.insert(GV);
                            DecryptedGV.insert(GV);
                            Changed = true;
                        }
                        } else if (Iter1 != CSPEntryMap.end()) {
                        CSPEntry *Entry = Iter1->second;
                        if (DecryptedGV.count(GV) > 0) {
                            Inst.replaceUsesOfWith(GV, Entry->DecGV);
                        } else {
                            IRBuilder<> IRB(&Inst);

                            Value *OutBuf = IRB.CreateBitCast(Entry->DecGV, IRB.getPtrTy());
                            Value *Data = IRB.CreateInBoundsGEP(
                                EncryptedStringTable->getValueType(),
                                EncryptedStringTable,
                                {IRB.getInt32(0), IRB.getInt32(Entry->Offset)});
                            IRB.CreateCall(Entry->DecFunc, {OutBuf, Data});

                            Inst.replaceUsesOfWith(GV, Entry->DecGV);
                            MaybeDeadGlobalVars.insert(GV);
                            DecryptedGV.insert(GV);
                            Changed = true;
                        }
                        }
                    }
                }
            }
        }
    }
    return Changed;
}

void StringEncryptionPass::collectConstantStringUser(
    GlobalVariable *CString, std::set<GlobalVariable *> &Users) {
    SmallPtrSet<Value *, 16> Visited;
    SmallVector<Value *, 16> ToVisit;

    ToVisit.push_back(CString);
    while (!ToVisit.empty()) {
        Value *V = ToVisit.pop_back_val();
        if (Visited.count(V) > 0)
            continue;
        Visited.insert(V);
        for (Value *User : V->users()) {
            if (auto *GV = dyn_cast<GlobalVariable>(User)) {
                Users.insert(GV);
            } else {
                ToVisit.push_back(User);
            }
        }
    }
}

bool StringEncryptionPass::isValidToEncrypt(GlobalVariable *GV) {
    if (GV->isConstant() && GV->hasInitializer()) {
        return GV->getInitializer() != nullptr;
    } else {
        return false;
    }
}

void StringEncryptionPass::deleteUnusedGlobalVariable() {
    bool Changed = true;
    while (Changed) {
        Changed = false;
        for (auto Iter = MaybeDeadGlobalVars.begin();
             Iter != MaybeDeadGlobalVars.end();) {
            GlobalVariable *GV = *Iter;
            if (!GV->hasLocalLinkage()) {
                ++Iter;
                continue;
            }

            GV->removeDeadConstantUsers();
            if (GV->use_empty()) {
                if (GV->hasInitializer()) {
                    Constant *Init = GV->getInitializer();
                    GV->setInitializer(nullptr);
                    if (isSafeToDestroyConstant(Init))
                        Init->destroyConstant();
                }
                Iter = MaybeDeadGlobalVars.erase(Iter);
                GV->eraseFromParent();
                Changed = true;
            } else {
                ++Iter;
            }
        }
    }
}

StringEncryptionPass *llvm::createStringEncryption(bool flag){
    return new StringEncryptionPass(flag);
}
```

## 3\. 注册命令行

```rust
static cl::opt<bool> s_obf_sobf("sobf", cl::init(false), cl::desc("String Obfuscation"));
```

## 4\. 注册Pass

```css
PassBuilder::PassBuilder(TargetMachine *TM, PipelineTuningOptions PTO,
                         std::optional<PGOOptions> PGOOpt,
                         PassInstrumentationCallbacks *PIC)
    : TM(TM), PTO(PTO), PGOOpt(PGOOpt), PIC(PIC) {

  // 注册 Obfuscation 相关 Pass
  this->registerPipelineStartEPCallback(
      [](llvm::ModulePassManager &MPM,
         llvm::OptimizationLevel Level) {
             
        MPM.addPass(StringEncryptionPass(s_obf_sobf)); // 先进行字符串加密 出现字符串加密基本块以后再进行基本块分割和其他混淆 加大解密难度
        
      }
  );
}
```

## 测试

关于 OLLVM 的编译参考： [OLLVM 移植 LLVM 18 实战，轻松实现 C&C++ 代码混淆](https://cyrus-studio.github.io/blog/posts/ollvm-%E7%A7%BB%E6%A4%8D-llvm-18-%E5%AE%9E%E6%88%98%E8%BD%BB%E6%9D%BE%E5%AE%9E%E7%8E%B0-cc++-%E4%BB%A3%E7%A0%81%E6%B7%B7%E6%B7%86/)

启用字符串加密并编译 C 代码

```
 clang -mllvm -sobf sobf.c -o sobf.exe
```

使用 IDA 反汇编

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c104846d5cd6c1f4.png)](data:image/png;base64,inline-87506B)

未启用字符串加密

```
clang sobf.c -o nosobf.exe
```

使用 IDA 反汇编

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/eef59a3171895994.png)](data:image/png;base64,inline-89754B)

程序运行正常

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1ab08de1c5fe2701.png)](data:image/png;base64,inline-11942B)

## 移植到 Android NDK

OLLVM 移植 Android NDK 参考： [别让 so 裸奔！移植 OLLVM 到 NDK 并集成到 Android Studio](https://cyrus-studio.github.io/blog/posts/%E5%88%AB%E8%AE%A9-so-%E8%A3%B8%E5%A5%94%E7%A7%BB%E6%A4%8D-ollvm-%E5%88%B0-ndk-%E5%B9%B6%E9%9B%86%E6%88%90%E5%88%B0-android-studio/)

在 CMakeLists.txt 中添加如下配置启用字符串加密

```
# 全局启用指令替换、字符串加密
add_definitions("-mllvm -sub -mllvm -sobf")
```

C++ 源码如下：

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/d2e3c4d18cd3726a.png)](data:image/png;base64,inline-179646B)

编译完成后，通过 IDA 打开 so 可以看到字符串常量 “cyrus” 已经被替换成 &unk_6DE20

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/851a8c480ceb1171.png)](data:image/png;base64,inline-119134B)

替换成了一个未初始化的全局变量

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/136669c8761330c8.png)](data:image/png;base64,inline-68366B)

可以看到多了一个 sub_2D17C(); 函数

[![word/media/image8.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7311c19f18ebd07c.png)](data:image/png;base64,inline-130966B)

sub_2D17C(); 就是字符串解密函数，第一次使用加密字符串时触发解密。

dword_6DE28 就是解密标识 ，解密只会发生一次，后续直接使用解密后的结果。

```
__int64 __fastcall sub_2D17C(__int64 result, __int64 a2)
{
  int i; // [xsp+Ch] [xbp-14h]

  if ( dword_6DE28 != 1 )
  {
    for ( i = 0; i != 6; ++i )
      *(_BYTE *)(result + i) = *(_BYTE *)(a2 + i % 0x1Au) & ~*(_BYTE *)(a2 + 26 + i) | *(_BYTE *)(a2 + 26 + i) & ~*(_BYTE *)(a2 + i % 0x1Au);
    dword_6DE28 = 1;
  }
  return result;
}
```

app 运行正常

[![word/media/image9.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8dbf6895680a66d8.png)](data:image/png;base64,inline-121638B)

## 完整源码

-   OLLVM 开源地址： [https://github.com/CYRUS-STUDIO/LLVM](https://github.com/CYRUS-STUDIO/LLVM)
    
-   Android 示例代码开源地址： [https://github.com/CYRUS-STUDIO/AndroidExample](https://github.com/CYRUS-STUDIO/AndroidExample)
