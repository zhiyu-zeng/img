---
title: ElfLoader的实现及原理
source: https://yuuki.cool/posts/elfloador/
source_host: yuuki.cool
clip_date: 2026-08-04T10:37:17+08:00
trace_id: 41ade6ce-5d9b-4746-93c5-3d849fff1bfe
content_hash: 1df1a2e4628b90297bba976abd1dc5beb871b968113a60aae0c38c2cbe0bbc14
status: synced
tags:
  - Linux安全
  - 安全工具
series: null
feed_source: Yuuki·移动安全
ai_summary: 该加载器复现了linker的九步流程，在进程中自实现ELF解析、内存映射与符号重定位，从而加载并调用任意ELF共享库。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-8130-bb62-ece2aad1506c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 该加载器复现了linker的九步流程，在进程中自实现ELF解析、内存映射与符号重定位，从而加载并调用任意ELF共享库。
> 
> - **加载九步骤：** 流程依次为检查模块是否已加载（`find_module`）、校验ELF头与程序头（`check_elf_header`）、分配模块结构体（`elf_module_alloc`）、为PT_LOAD段映射匿名内存（`layout_segments`）、定位已加载程序头（`find_loaded_phdr`）、提取`.dynamic`段（`phdr_table_get_dynamic_section`）、解析动态节信息（`load_dynamic`）、处理依赖与重定位（`elf_link`），最终插入全局模块链表（`list_add_tail`）。
> - **内存布局核心：** `layout_segments`通过`mmap`分配可读写执行的内存区域，计算最小虚拟地址，将每个`PT_LOAD`段从文件偏移复制到`load_bias + p_vaddr`，实现从文件到进程地址空间的映射。
> - **动态链接与重定位：** `elf_link`遍历`DT_NEEDED`递归加载依赖，并调用`apply_relocate_add`处理`DT_RELA`和`DT_JMPREL`表，完成导入符号的地址修正，模块标记为`FLAG_LINKED`。
> - **符号查找机制：** 支持传统ELF哈希（`elfhash`）和GNU哈希（`gnuhash`），后者先通过布隆过滤器快速排除，再沿链比较，最终返回全局定义符号的`ElfW(Sym)`，用于计算运行时函数地址。
> - **函数调用方式：** 通过`lookup_symbol_in_module`获取符号地址后，用`m->load_bias + s->st_value`得到实际指针，即可调用，相当于自实现的`mmap`与`dlsym`组合。

## 0x01 Loador加载流程

linker中，加载so有以下流程：

1.  find_module
2.  check_elf_header
3.  elf_module_alloc
4.  layout_segments
5.  find_loaded_phdr
6.  phdr_table_get_dynamic_section
7.  load_dynamic
8.  elf_link
9.  list_add_tail

流程概括下来就是以上九件事，分别举例说说他们每个都是什么意思吧。

## 0x02 模块实现

#### 一、find_module

```cpp
// 在链表中查找模块
static struct elf_module *find_module(const char *name)
{
    struct list_head *pos;
    struct elf_module *m = NULL, *tmp;

    list_for_each(pos, &mod_list) {
        tmp = list_entry(pos, struct elf_module, list);
        if (!strcmp(name, tmp->name)) {
            m = tmp;
            break;
        }
    }

    if (m != NULL) {
        if (m->flags & FLAG_LINKED)
            return m;
        LOG_ERR("OOPS: recursive link to \"%s\"", m->name);
        return NULL;
    }

    LOG_DEBUG("[ \"%s\" has not been loaded yet ]", name);
    return NULL;
}
```

#### 二、check_elf_header

```rust
// 校验elf头
static bool verify_elf_header(struct elf_info *info)
{
    int elf_class;

    if (info->len < sizeof(*(info->hdr))) {
        LOG_ERR("\"%s\" is too small to be an ELF executable. Expected at least %zu bytes, "
                "only found %zu bytes", info->name, sizeof(*(info->hdr)), info->len);
        return false;
    }
    if (memcmp(info->hdr->e_ident, ELFMAG, SELFMAG)) {
        LOG_ERR("\"%s\" has bad ELF magic", info->name);
        return false;
    }
    
    elf_class = info->hdr->e_ident[EI_CLASS];
    if (elf_class != ELFCLASS64) {
        if (elf_class == ELFCLASS32) {
            LOG_ERR("\"%s\" is 32-bit instead of 64-bit", info->name);
        } else {
            LOG_ERR("\"%s\" has unknown ELF class: %d", info->name, elf_class);
        }
        return false;
    }

    if (info->hdr->e_ident[EI_DATA] != ELFDATA2LSB) {
        LOG_ERR("\"%s\" not little-endian: %d", info->name, info->hdr->e_ident[EI_DATA]);
        return false;
    }

    if (info->hdr->e_type != ET_EXEC && info->hdr->e_type != ET_DYN) {
        LOG_ERR("\"%s\" has unexpected e_type: %d", info->name, info->hdr->e_type);
        return false;
    }

    if (info->hdr->e_version != EV_CURRENT) {
        LOG_ERR("\"%s\" has unexpected e_version: %d", info->name, info->hdr->e_version);
        return false;
    }

    if (!elf_check_arch(info->hdr)) {
        LOG_ERR("\"%s\" has unexpected e_machine: %d", info->name, info->hdr->e_machine);
        return false;
    }

    LOG_DEBUG("\"%s\" verify elf header done.", info->name);
    return true;
}

// 读取program_headers
static bool read_program_headers(struct elf_info *info)
{
    if (info->hdr->e_phoff == 0) {
        LOG_ERR("\"%s\" has no program header table", info->name);
        return false;
    }

    if (info->hdr->e_phnum < 1 || info->hdr->e_phnum > (65536U / sizeof(ElfW(Phdr)))) {
        LOG_ERR("\"%s\" has invalid e_phnum: %d", info->name, info->hdr->e_phnum);
        return false;
    }

    if (info->hdr->e_phentsize != sizeof(ElfW(Phdr))) {
        LOG_ERR("\"%s\" has invalid e_phentsize", info->name);
        return false;
    }

    if (info->hdr->e_phoff >= info->len 
            || (info->hdr->e_phnum * sizeof(ElfW(Phdr)) > info->len - info->hdr->e_phoff)) {
        LOG_ERR("\"%s\" has invalid offset/size of program header table", info->name);
        return false;
    }

    info->phdr_table = (ElfW(Phdr) *)((char *)info->hdr + info->hdr->e_phoff);
    LOG_DEBUG("\"%s\" read program header done.", info->name);
    return true;
}
```

#### 三、elf_module_alloc

```cpp
// 模块内存初始化
static struct elf_module *elf_module_alloc(const char *name)
{
    struct elf_module *m;

    if (strlen(name) >= ELF_MODULE_NAME_LEN) {
        LOG_ERR("ELF name to long");
        return NULL;
    }

    m = malloc(sizeof(*m));
    if (m == NULL) {
        LOG_ERR("\"%s\" elf module memory alloc failed: %s", name, strerror(errno));
        return NULL;
    }

    memset(m, 0, sizeof(*m));
    strncpy(m->name, name, sizeof(m->name) - 1);
    INIT_LIST_HEAD(&m->list);
    m->refcnt = 1;

    LOG_DEBUG("name %s: allocated struct elf_module @ %p", name, m);
    return m;
}

// 释放模块
static void elf_module_free(struct elf_module *m)
{    
    if (!m)
        return;
    
    LOG_DEBUG("name %s: freeing soinfo @ %p", m->name, m);
        
    if (m->base)
        munmap((void *)m->base, m->size);
    free(m);
}
```

#### 四、layout_segments

```rust
//为 ELF 模块的各个段分配虚拟地址空间，并计算加载偏移量
static bool layout_segments(struct elf_module *m, struct elf_info *info)
{
    ElfW(Addr) min_vaddr;
    void *mm_start;
    size_t i;

    m->size = phdr_table_get_load_size(info->phdr_table, info->hdr->e_phnum, &min_vaddr, NULL);
    if (m->size == 0) {
        LOG_ERR("\"%s\" has no loadable segments", m->name);
        return false;
    }

    mm_start = mmap(NULL,
                    m->size,
                    PROT_READ | PROT_WRITE | PROT_EXEC, 
                    MAP_PRIVATE | MAP_ANONYMOUS,
                    -1,
                    0); // munmap in elf_module_free()
    if (mm_start == MAP_FAILED) {
        LOG_ERR("couldn't map \"%s\" address space, %s", m->name, strerror(errno));
        return false;
    }

    memset(mm_start, 0, m->size);
    m->base = (ElfW(Addr))mm_start;
    m->load_bias = (char *)mm_start - (char *)min_vaddr;

    for (i = 0; i < info->hdr->e_phnum; ++i) {
        const ElfW(Phdr) *phdr = &info->phdr_table[i];
        if (phdr->p_type != PT_LOAD)
            continue;
        if (phdr->p_offset + phdr->p_filesz > info->len) {
            LOG_ERR("\"%s\" has invalid segment[%zu]:"
                    "p_offset (%zx) + p_filesz (%zx) past end of %zx)",
                    m->name, i, phdr->p_offset, phdr->p_filesz, info->len);
            return false;
        }
        memcpy((char *)m->load_bias + phdr->p_vaddr, 
               (char *)info->hdr + phdr->p_offset, phdr->p_filesz);
    }

    return true;
}
```

#### 五、find_loaded_phdr

```rust
// 查找已经加载的 ELF 模块的程序头表
// 为了拿到so的起始地址和其他的有些信息
static ElfW(Phdr) *find_loaded_phdr(struct elf_module *m, struct elf_info *info)
{
    size_t i;
    ElfW(Addr) loaded_phdr = 0;
    const ElfW(Phdr) *pphdr;

    // If there is a PT_PHDR, use it directly.
    for (i = 0, pphdr = info->phdr_table; i < info->hdr->e_phnum; ++i, ++pphdr) {
        if (pphdr->p_type == PT_PHDR) {
            loaded_phdr = (ElfW(Addr))(m->load_bias + pphdr->p_vaddr);
            break;
        }
    }

    // Otherwise, check the first loadable segment. If its file offset
    // is 0, it starts with the ELF header, and we can trivially find the
    // loaded program header from it.
    if (loaded_phdr == 0) {
        for (i = 0, pphdr = info->phdr_table; i < info->hdr->e_phnum; ++i, ++pphdr) {
            if (pphdr->p_type == PT_LOAD) {
                if (pphdr->p_offset == 0) {
                    const ElfW(Ehdr) *ehdr = (const ElfW(Ehdr) *)(m->load_bias + pphdr->p_vaddr);
                    loaded_phdr = (ElfW(Addr))((char *)ehdr + ehdr->e_phoff);
                    break;
                }
                break;
            }
        }
    }

    if (loaded_phdr == 0) {
         LOG_ERR("can't find loaded phdr for \"%s\"", m->name);
         return false;
    }

    // Ensures that our program header is actually within a loadable
    // segment. This should help catch badly-formed ELF files that
    // would cause the linker to crash later when trying to access it.
    for (i = 0, pphdr = info->phdr_table; i < info->hdr->e_phnum; ++i, ++pphdr) {
        ElfW(Addr) seg_start, seg_end;

        if (pphdr->p_type != PT_LOAD)
            continue;
        seg_start = m->load_bias + pphdr->p_vaddr;
        seg_end = seg_start + pphdr->p_filesz;
        if (seg_start <= loaded_phdr 
                && (loaded_phdr + info->hdr->e_phnum * sizeof(ElfW(Phdr)) <= seg_end)) {
            LOG_DEBUG("find loaded phdr for \"%s\" done", m->name);
            return (ElfW(Phdr) *)loaded_phdr;
        }
    }

    LOG_ERR("\"%s\" loaded phdr 0x%zx not in loadable segment", m->name, loaded_phdr);
    return NULL;
}
```

#### 六、phdr_table_get_dynamic_section

```javascript
// 从程序头表中提取动态段（.dynamic 段）
static void phdr_table_get_dynamic_section(const ElfW(Phdr) *phdr_table, size_t phdr_count,
                                           ElfW(Addr) load_bias, ElfW(Dyn) **dynamic,
                                           ElfW(Word) *dynamic_flags)
{
    size_t i;

    *dynamic = NULL;
    for (i = 0; i < phdr_count; ++i) {
        const ElfW(Phdr) *phdr = &phdr_table[i];
        if (phdr->p_type == PT_DYNAMIC) {
            *dynamic = (ElfW(Dyn) *)(load_bias + phdr->p_vaddr);
            if (dynamic_flags)
                *dynamic_flags = phdr->p_flags;
            return;
        }
    }
}
```

#### 七、load_dynamic

```rust
// 加载动态段中的信息（如符号表、字符串表、重定位表等
static bool load_dynamic(struct elf_module *m)
{
    ElfW(Dyn) *d;

    m->needed_count = 0;
    for (d = m->dynamic; d->d_tag != DT_NULL; ++d) {
        LOG_DEBUG("d = %p, d[0](tag) = 0x%p d[1](val) = 0x%p", 
                  d, (void *)d->d_tag, (void *)d->d_un.d_val);
        
        switch (d->d_tag) {
        case DT_HASH:
            m->nbucket = ((uint32_t *)(m->load_bias + d->d_un.d_ptr))[0];
            m->nchain = ((uint32_t *)(m->load_bias + d->d_un.d_ptr))[1];
            m->bucket = (uint32_t *)(m->load_bias + d->d_un.d_ptr + 8);
            m->chain = (uint32_t *)(m->load_bias + d->d_un.d_ptr + 8 + m->nbucket *4);
            break;
        case DT_GNU_HASH:
            m->gnu_nbucket = ((uint32_t *)(m->load_bias + d->d_un.d_ptr))[0];
            // skip symndx
            m->gnu_maskwords = ((uint32_t *)(m->load_bias + d->d_un.d_ptr))[2];
            m->gnu_shift2 = ((uint32_t *)(m->load_bias + d->d_un.d_ptr))[3];

            m->gnu_bloom_filter = (ElfW(Addr) *)(m->load_bias + d->d_un.d_ptr + 16);
            m->gnu_bucket = (uint32_t *)(m->gnu_bloom_filter + m->gnu_maskwords);
            // amend chain for symndx = header[1]
            m->gnu_chain = m->gnu_bucket + m->gnu_nbucket -
                ((uint32_t *)(m->load_bias + d->d_un.d_ptr))[1];

            if (!powerof2(m->gnu_maskwords)) {
                LOG_ERR("invalid maskwords for gnu_hash = 0x%x, in \"%s\" expecting power to two",
                        m->gnu_maskwords, m->name);
                return false;
            }
            m->gnu_maskwords--;
            m->flags |= FLAG_GNU_HASH;
            break;
        case DT_STRTAB:
            m->strtab = (char *)(m->load_bias + d->d_un.d_ptr);
            break; 
        case DT_STRSZ:
            m->strtab_size = d->d_un.d_val;
            break; 
        case DT_SYMTAB:
            m->symtab = (ElfW(Sym) *)(m->load_bias + d->d_un.d_ptr);
            break; 
        case DT_SYMENT:
            if (d->d_un.d_val != sizeof(ElfW(Sym))) {
                LOG_ERR("invalid DT_SYMENT: %zu in \"%s\"", (size_t)d->d_un.d_val, m->name);
                return false;
            }
            break;
        case DT_PLTREL:
            if (d->d_un.d_val != DT_RELA) {
                LOG_ERR("unsupported DT_PLTREL in \"%s\"; expected DT_RELA", m->name);
                return false;
            }
            break;
        case DT_JMPREL:
            m->plt_rela = (ElfW(Rela) *)(m->load_bias + d->d_un.d_ptr);
            break;
        case DT_PLTRELSZ:
            m->plt_rela_count = d->d_un.d_val / sizeof(ElfW(Rela));
            break;
        case DT_RELA:
            m->rela = (ElfW(Rela) *)(m->load_bias + d->d_un.d_ptr);
            break;
        case DT_RELASZ:
            m->rela_count = d->d_un.d_val /sizeof(ElfW(Rela));
            break;
        case DT_RELAENT:
            if (d->d_un.d_val != sizeof(ElfW(Rela))) {
                LOG_ERR("invalid DT_RELAENT: %zu", (size_t)d->d_un.d_val);
                return false;
            }
            break;
        case DT_REL:
            LOG_ERR("unsupported DT_REL in \"%s\"", m->name);
            return false;
        case DT_RELSZ:
            LOG_ERR("unsupported DT_RELSZ in \"%s\"", m->name);
            return false;
        case DT_NEEDED:
            m->needed_count++;
            break; 
        default:
            LOG_DEBUG("\"%s\" unused DT entry: type %p arg %p",
                      m->name, (void *)d->d_tag, (void *)d->d_un.d_val);
            break; 
        };
    }

    LOG_DEBUG("mod->base = %zx, mod->strtab = %p, mod->symtab = %p",
              m->base, m->strtab, m->symtab);

    // Sanity checks.
    if (m->nbucket == 0 && m->gnu_nbucket == 0) {
        LOG_ERR("empty/missing DT_HASH/DT_GNU_HASH in \"%s\" "
                "(new hash type from the future?)", m->name);
        return false;
    }
    if (m->strtab == 0) {
        LOG_ERR("empty/missing DT_STRTAB in \"%s\"", m->name);
        return false;
    }
    if (m->symtab == 0) {
        LOG_ERR("empty/missing DT_SYMTAB in \"%s\"", m->name);
        return false;
    }
        
    return true;
}
```

#### 八、elf_link

```rust
// 执行动态链接，解析符号并应用重定位
static bool elf_link(struct elf_module *m)
{
    bool ret = false;
    ElfW(Dyn) *d;
    struct elf_module **needed;
    struct elf_module **pneeded;

    LOG_DEBUG("[ linking %s ]", m->name);
    LOG_DEBUG("mod->base = %zx mod->flags = 0x%08x", m->base, m->flags);

    /* load needed module */
    pneeded = needed = (struct elf_module **)malloc((1 + m->needed_count) * sizeof(struct elf_module *));
    if (needed == NULL) {
        LOG_ERR("\"%s\"malloc for needed array failed", m->name);
        return false;
    }

    for (d = m->dynamic; d->d_tag != DT_NULL; ++d) {
        if (d->d_tag == DT_NEEDED) {
            struct elf_module *need_mod;
            const char *need_name = m->strtab + d->d_un.d_val;
            LOG_DEBUG("%s needs %s", m->name, need_name);
            need_mod = find_module(need_name);
            if (need_mod != NULL) {
                need_mod->refcnt++;
                *pneeded++ = need_mod;
                continue;
            }
            LOG_DEBUG("load module %s use dlopen()", m->name);
            if (dlopen(need_name, RTLD_NOW | RTLD_GLOBAL) == NULL) {
                LOG_ERR("could not load module \"%s\" needed by \"%s\"", need_name, m->name);
                return false;
            }
        }
    }
    *pneeded = NULL;

    if (m->rela != NULL) {
        LOG_DEBUG("[ relocating %s ]", m->name);
        if (!apply_relocate_add(m, m->rela, m->rela_count, needed))
            goto out;
    }

    if (m->plt_rela != NULL) {
        LOG_DEBUG("[ relocating %s plt ]", m->name);
        if (!apply_relocate_add(m, m->plt_rela, m->plt_rela_count, needed))
            goto out;
    }
    m->flags |= FLAG_LINKED;
    ret = true;
out:
    free(needed);
    LOG_DEBUG("[ finished linking %s, ret=%d ]", m->name, ret);
    return ret;
}
```

#### 九、list_add_tail

```cpp
//将新模块添加到模块列表的尾部 类比soinfo_list
void list_add_tail(struct list_head *new, struct list_head *head)
{
	__list_add(new, head->prev, head);
}
```

至此，上述九个模块的已经实现了。

谈谈我对elf_loador的理解吧：我认为，loador的过程实际上就是先分配虚拟内存，把elf文件映射到内存中，由于里面的函数可能会引用外部函数，所以又有了链接过程，最后为了方便管理，又维护了个so_list的链表，仅此。

### 0x03 如何加载elf里的函数

这个其实看了上面的加载流程就知道了

加载elf实际上是把目标elf文件映射到自己进程的内存空间，这有点像so的注入，实际也恰恰如此，下一篇我会详细写so注入。此时elf已经被映射到自己的内存中了，那我调用elf里的函数只需拿到目标函数的起始地址即可。所以可以通过在elf中查找symbol从而获取函数相对于so的偏移，再加上so在内存中的起始地址就是我们的函数在内存中的地址了。接下来就可以舒服的玩耍了。

#### 贴一下代码吧

```rust
static bool is_symbol_global_and_defined(const struct elf_module *m, const ElfW(Sym) *s)
{
    if (ELFW(ST_BIND)(s->st_info) == STB_GLOBAL || ELFW(ST_BIND)(s->st_info) == STB_WEAK)
        return s->st_shndx != SHN_UNDEF;
    return false;
}

// 计算hsah
static uint32_t elfhash(const char *name)
{
    const uint8_t *name_bytes = (const uint8_t *)name;
    uint32_t h = 0, g;
  
    while (*name_bytes) {
        h = (h << 4) + *name_bytes++;
        g = h & 0xf0000000;
        h ^= g;
        h ^= g >> 24;
    }
  
    return h;
}

// 查找hash对应的符号
//在 ELF（Executable and Linkable Format）文件中，符号（Symbol）不仅仅指函数，还可以指变量、常量、数据结构等。符号表（Symbol Table）是 ELF 文件中的一个重要部分，它记录了程序中所有符号的信息。
static ElfW(Sym) *elfhash_lookup(struct elf_module *m, const char *name)
{
    uint32_t n;
    uint32_t hash = elfhash(name);
    ElfW(Sym) *symtab = m->symtab;
    const char *strtab = m->strtab;

    LOG_DEBUG("SEARCH %s in %s@0x%zx %08x %zu", name, m->name, m->base, hash, hash % m->nbucket);

    // 遍历hashmap
    for (n = m->bucket[hash % m->nbucket]; n != 0; n = m->chain[n]) {
        ElfW(Sym) *s = symtab + n;
        if (strcmp(strtab + s->st_name, name))
            continue;

        if (is_symbol_global_and_defined(m, s)) {
            LOG_DEBUG("FOUND %s in %s (%zx) %zu", name, m->name, s->st_value, s->st_size);
            return s;
        }
    }

    return NULL;
}

// 计算字符串的哈希值
static uint32_t gnuhash(const char *name)
{
    const uint8_t *name_bytes = (const uint8_t *)name;
    uint32_t h = 5381;

    while (*name_bytes != 0)
        h += (h << 5) + *name_bytes++; // h*33 + c = h + h * 32 + c = h + h << 5 + c

    return h;
}

// 基于 GNU 哈希表的符号查找函数基于 GNU 哈希表的符号查找函数
static ElfW(Sym) *gnuhash_lookup(struct elf_module *m, const char *name)
{
    uint32_t n;
    uint32_t hash = gnuhash(name);
    uint32_t h2 = hash >> m->gnu_shift2;
    uint32_t bloom_mask_bits = sizeof(ElfW(Addr)) * 8;
    uint32_t word_num = (hash / bloom_mask_bits) & m->gnu_maskwords;
    ElfW(Addr) bloom_word = m->gnu_bloom_filter[word_num];
    ElfW(Sym) *symtab = m->symtab;
    const char *strtab = m->strtab;

    LOG_DEBUG("SEARCH %s in %s@%p (gnu)", name, m->name, (void *)m->base);

    // test against bloom filter
    if ((1 & (bloom_word >> (hash % bloom_mask_bits)) & (bloom_word >> (h2 % bloom_mask_bits))) == 0) {
        LOG_DEBUG("NOT FOUND %s in %s@%p (gnu)", name, m->name, (void *)m->base);
        return NULL;
    }

    // bloom test says "probably yes"...
    n = m->gnu_bucket[hash % m->gnu_nbucket];
    if (n == 0) {
        LOG_DEBUG("NOT FOUND %s in %s@%p (gun)", name, m->name, (void *)m->base);
        return NULL;
    }

    do {
        ElfW(Sym) *s = symtab + n;
        if (((m->gnu_chain[n] ^ hash) >> 1) != 0)
            continue;
        if (strcmp(strtab + s->st_name, name))
            continue;

        if (is_symbol_global_and_defined(m, s)) {
            LOG_DEBUG("FOUND %s in %s (%p) %zd", name, m->name, (void *)s->st_value, (size_t)s->st_size);
            return s;
        }
    } while ((m->gnu_chain[n++] & 1) == 0);

    return NULL;
}

// 在so中查找符号
ElfW(Sym) *lookup_symbol_in_module(struct elf_module *m, const char *name)
{
    return (m->flags & FLAG_GNU_HASH) ? gnuhash_lookup(m, name) : elfhash_lookup(m, name);
}
```

### 0x04 小结

以上几乎就是全部流程的代码了，再贴一下调用代码吧。

```rust
struct elf_module *load_elf_module(const char *name, const void *elf_data, size_t elf_len)
{
    struct elf_info info = { .name = name, .hdr = elf_data, .len = elf_len };
    struct elf_module *m;

    LOG_DEBUG("load_elf_module: name=%s, bin=%p, len=%zu", name, elf_data, elf_len);

    if (find_module(name)) {
        LOG_ERR("\"%s\" already exist", name);
        return NULL;
    }

    if (!verify_elf_header(&info) || !read_program_headers(&info))
        return NULL;

    m = elf_module_alloc(name);
    if (m == NULL)
        return NULL;
    
    if (!layout_segments(m, &info)) // 此时 ELF 文件的程序头表（info.hdr->e_phoff）已经可以映射到内存中的正确位置
        goto out_free;

    m->phdr = find_loaded_phdr(m, &info); // 查找 ELF 模块的程序头表
    if (m->phdr == NULL)
        goto out_free;
    m->phnum = info.hdr->e_phnum;
    m->entry = m->load_bias + info.hdr->e_entry;

    phdr_table_get_dynamic_section(m->phdr, m->phnum, m->load_bias, &m->dynamic, NULL); // 从程序头表中提取动态段（.dynamic 段）
    if (m->dynamic) {
        if (!load_dynamic(m)) // 加载动态段中的信息（如符号表、字符串表、重定位表等
            goto out_free;

        if (!elf_link(m)) // 执行动态链接，解析符号并应用重定位
            goto out_free;
    }

    list_add_tail(&m->list, &mod_list); // 将新模块添加到模块列表的尾部 类比soinfo_list
    
    LOG_DEBUG("[ \"%s\" load done, base=0x%zx sz=0x%zx entry=0x%zx ]", 
              m->name, m->base, m->size, m->entry);
    return m;

out_free:
    elf_module_free(m);
    return NULL;
}

void unload_elf_module(const char *name)
{
    struct elf_module *m;
    ElfW(Dyn) *d;
    
    m = find_module(name);
    if (m == NULL)
        return;
    
    if (m->refcnt == 1) {
        LOG_DEBUG("unloading \"%s\"", m->name);

        list_del(&m->list);

        for (d = m->dynamic; d->d_tag != DT_NULL; ++d) {
            if (d->d_tag == DT_NEEDED) {
                const char *need_name = m->strtab + d->d_un.d_val;
                LOG_DEBUG("%s needs to unload %s", m->name, need_name);
                unload_elf_module(need_name);
            }
        }

        elf_module_free(m);
    } else {
        m->refcnt--;
        LOG_DEBUG("not unloading \"%s\", decrementing refcnt to %zu", m->name, m->refcnt);
    }
}

typedef int (*main_func_t)(void);

int run_elf_module(struct elf_module *m, const char *func)
{
    ElfW(Sym *) s = lookup_symbol_in_module(m, func);
    main_func_t fn;

    if (!s) {
        LOG_ERR("not found function %s", func);
        return -1;
    }

    fn = (void *)(m->load_bias + s->st_value);

    return fn();
}
```

总结下来，elf_loador就做了上面那几件事，实际上就是自己实现了部分 **mmap** 和部分 **dlsym** 的功能，代码还是很清晰的。

代码摘自: [elfloader/elf_loader.c at master · SoyBeanMilkx/elfloader · GitHub](https://github.com/SoyBeanMilkx/elfloader/blob/master/elf_loader.c)
