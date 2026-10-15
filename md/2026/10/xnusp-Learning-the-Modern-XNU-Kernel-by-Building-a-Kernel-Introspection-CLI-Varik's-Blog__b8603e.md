---
title: "xnusp: Learning the Modern XNU Kernel by Building a Kernel Introspection CLI | Varik's Blog"
source: https://varik.dev/blog/xnu/xnusp-xnu-learning-lab
source_host: varik.dev
clip_date: 2026-10-15T13:09:43+08:00
trace_id: 22d2caa1-ef85-499a-a006-d3d22131ab78
content_hash: ba0947d738385b80c36e2d34661e68a12435133e096092f7ef1dc459ae1f8c13
status: synced
tags: []
series: null
feed_source: Varik
ai_summary: XNU 内核保护栈可通过自建内核自省 CLI（tfp0 读写、vmmap、KASLR slide、kernproc、sysent、页表遍历、PAC）逐模块理解；核心认知是页表与内核代码由 SPTM 在更底层守护，堆数据仅靠 PAC 等内核内软件防护，故现代漏洞多为纯数据攻击。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3fa75244-d011-8152-b402-e5da1e146559
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> XNU 内核保护栈可通过自建内核自省 CLI（tfp0 读写、vmmap、KASLR slide、kernproc、sysent、页表遍历、PAC）逐模块理解；核心认知是页表与内核代码由 SPTM 在更底层守护，堆数据仅靠 PAC 等内核内软件防护，故现代漏洞多为纯数据攻击。
> 
> - **tfp0 三门槛：** `task_for_pid(self,0)` 需同时满足内核补丁、root 身份与 `task_for_pid-allow` entitlement；测试应用 pid 1 而非自身 pid（自身恒成功）。
> - **安全读写：** 读未映射内核地址会 panic 而非报错；须先用 `vm_map_page_query` 逐 16K 页确认 PRESENT 位，且 `mach_vm_*` 需自行声明原型。
> - **关键偏移/函数：** 16K 页表每级索引 11 位；遍历用 `mach_vm_region_recurse`（`_64` 版在内核地址恒失败）；物理转虚拟须查 `libsptm_papt_ranges`。
> - **结构定位：** KASLR slide 靠堆内指针聚类并只认 `MH_FILESET`（避免误认 SPTM/TXM 导致偏 256MB）；`sysent` 用标量字段而非 PAC 签名指针匹配，共 558 个 BSD 系统调用。
> - **PAC 验证：** `xpaci` 剥离签名、`pacia` 重签需与原值逐字节一致；写回相同 PTE 也会 panic，证明页表对内核只读。

The best way I found to understand the modern XNU protection stack was to build a small tool that inspects a live kernel and grow it one module at a time. This post turns that into a set of exercises. Each one has a goal, a few hints, pseudocode and a way to check your result. The real code is left for you to write; that is the exercise.

My numbers come from a vphone VM running iOS 26.1 (`xnu-12377.42.6`). Offsets and addresses will differ on your build, so treat them as examples of what to look for.

| #   | Command | You learn |
| --- | --- | --- |
| 0   | setup | tfp0, a 30-second build/deploy loop |
| 1   | `kread` / `kwrite` | A safe read/write backend |
| 2   | `vmmap` | How `kernel_map` sees the kernel |
| 3   | `slide` | Deriving the KASLR slide from leaked pointers |
| 4   | `kernproc` | Finding structures in a stripped kernel |
| 5   | `syscalls` / `traps` | How `svc #0` becomes a function call |
| 6   | `ptwalk` / `ptmap` / `physmap` | 16K page tables and the SPTM physical aperture |
| 7   | `probe` | PAC by hand: sign, strip, authenticate |

* * *

## Exercise 0: Setup

### The VM

Set up vphone-cli by following its [README](https://github.com/Lakr233/vphone-cli). It applies a jailbreak patch set to the kernel, including the `task_for_pid` patch you need. Then install the package bootstrap from the README so you get `openssh-server` and can ssh into the VM.

### tfp0

```c
mach_port_t kt;
kern_return_t kr = task_for_pid(mach_task_self(), 0, &kt);
```

For this call to succeed, all three of these must pass, and each one fails with the same `KERN_FAILURE`:

| Gate | Satisfied by |
| --- | --- |
| `if (pid == 0) return KERN_FAILURE;` | the vphone kernel patch |
| `task_for_pid_posix_check()` | running as **root** |
| `mac_proc_check_get_task()` (AMFI) | the **`task_for_pid-allow`** entitlement |

Sign your binary with:

```xml
<dict>
    <key>get-task-allow</key><true/>
    <key>task_for_pid-allow</key><true/>
    <key>platform-application</key><true/>
    <key>com.apple.developer.arm64e.preview</key><true/>
</dict>
```

Hint: test the call with pid 1, not your own pid. Your own pid always succeeds through a special case, so it proves nothing.

### Build loop

```makefile
SDK_ROOT := $(shell xcrun --sdk iphoneos --show-sdk-path)
SSH      ?= ssh -p 2222 root@127.0.0.1   # however you reach the VM

compile:
	@mkdir -p build
	@clang -isysroot $(SDK_ROOT) -arch arm64e -march=armv8.3-a \
		-Xclang -fptrauth-calls -Xclang -fptrauth-returns \
		-g -O0 -Wall -Wextra src/*.c -o build/xnusp

sign: compile
	@codesign --force --sign - --entitlements entitlements.plist build/xnusp

run: sign
	@cat build/xnusp | $(SSH) "cat > /tmp/xnusp && chmod +x /tmp/xnusp && /tmp/xnusp $(ARGS)"
```

### The kernelcache

The kernelcache is fully stripped: no `_kernproc`, `_sysent` or `_kernel_pmap`. Every anchor has to be found from structure. Make sure your static reference is the kernelcache **the VM actually boots** (a research build). The release kernelcache shares the same base address but has a different segment layout.

```bash
ipsw kernel dec <kernelcache>       # unwrap IM4P (ipsw macho info fails silently on IM4P)
ipsw macho info dev-kernelcache     # segments and fileset entries
otool -l dev-kernelcache            # exact section bounds
```

Write down the static base (`__TEXT` of the `MH_FILESET` container), the segment offsets and the container span. Also clone [XNU](https://github.com/apple-oss-distributions/xnu) at the closest published tag and keep `tools/lldbmacros/` open; it is Apple's own answer key for most of what follows.

* * *

## Exercise 1: A read/write backend

**Goal:** one interface that everything else is written against.

```c
typedef struct {
  int (*kread)(uint64_t va, void *out, size_t n);
  int (*kwrite)(uint64_t va, const void *in, size_t n);
  uint64_t base, slide;      // Exercise 3
  uint64_t pmap, tte, ttep;  // Exercise 6
  mach_port_name_t port;
} kctx_t;
```

```javascript
init:
    port   = task_for_pid(self, 0)
    kread  = vm_read_overwrite(port, va, n, out); fail unless all n bytes were read
    kwrite = vm_write(port, va, in, n)

kpage_present(va):
    kr, disp = vm_map_page_query(port, va)
    return kr == SUCCESS and (disp & VM_PAGE_QUERY_PAGE_PRESENT)

kread_safe(va, out, n):
    for every 16K page in [va, va+n): if not kpage_present(page): return false
    return kread(va, out, n)
```

**Hints**

-   A small read of an **unmapped** kernel address does not return an error; it panics the kernel (it ends in `copyinmap()` 's bare `memcpy`). Writes have the same problem. Use the `_safe` versions for anything you are scanning.
-   `vm_map_page_query` returns `KERN_SUCCESS` for holes too. Only the disposition bit answers the question.
-   `mach/mach_vm.h` is blocked in the iOS SDK, but libSystem still exports the `mach_vm_*` functions. Declare the prototypes yourself.
-   Use `strtoull` for addresses; kernel VAs are larger than `LLONG_MAX`.

**Check:** a `kread` matches the same bytes read through a kernel debugger. `kwrite` round-trips a pattern into a page you `vm_allocate` in `kernel_map` through the kernel task port.

* * *

## Exercise 2: vmmap

**Goal:** list `kernel_map` regions with protections and tags.

```javascript
cursor = VM_MIN_KERNEL_ADDRESS, depth = 0
loop:
    addr, size, info = mach_vm_region_recurse(port, cursor, depth)
    if kr == KERN_INVALID_ADDRESS: break          // end of map
    if info.is_submap: depth++; continue          // same cursor, one level deeper
    print(addr, size, info.protection, info.max_protection, info.user_tag, info.pages_resident)
    cursor = addr + size; depth = 0               // advance on addr+size, never on addr
```

**Hints**

-   Use `mach_vm_region_recurse`, not `vm_region_recurse_64`. The latter goes through `vm_region_get_kern_return()` in `vm_user.c`, which turns every success into `KERN_INVALID_ADDRESS` once `addr + size` passes `VM_MAX_ADDRESS` (`0xF0000000` on arm64). So it fails for every kernel address.
-   `infoCnt` is counted in `natural_t` units, not bytes.

**Check:** the first row is one 64 GB `PROT_NONE` region with no object behind it. The running kernelcache lives inside it. `kernel_map` only reserves that range; the kernelcache was mapped by the bootstrap page tables and SPTM. Keep that in mind for Exercise 6.

* * *

## Exercise 3: slide

**Goal:** compute the KASLR slide from pointers found in kernel heap memory, without `kas_info`.

```javascript
// harvest
for each readable vmmap entry with a pointer-bearing tag (KALLOC, KALLOC_TYPE, ZONE, IPC, KEXT):
    for a few present pages of it:
        for each 8-byte word w:
            if KERNEL_VA_MIN <= w < KERNEL_HEAP_START: candidates.add(w)

// cluster
sort and dedupe candidates
find the largest group that fits inside one kernelcache span
seed = lowest member, width = highest - lowest
if width < span / 2: give up                  // not an image, just one structure

// walk down to the header
for page = align_down(seed) downwards, at most (span - width) / 16K + 1 pages:
    if magic == MH_MAGIC_64 and filetype == MH_FILESET: base = page; break

assert filetype(base + 0x4000) == MH_EXECUTE  // com.apple.kernel
slide = base - static_base
```

**Hints**

-   The window contains three separately slid images: the kernelcache, **SPTM** and **TXM**. The monitors are `MH_EXECUTE`, so stop only on `MH_FILESET`. Otherwise your slide is off by 256 MB and still looks valid.
-   Cap how many candidates you take per region, or the first region in address order decides the cluster on its own.

**Check:** the slide is page-aligned, a different value on each boot, and agrees with a scan from a kernel debugger.

* * *

## Exercise 4: kernproc and the process list

**Goal:** `ps -ax`, read from kernel memory.

**What the source gives you**

-   `kernproc` is `SECURITY_READ_ONLY_LATE`, so it lives in `__DATA_CONST,__const`, about 1 MB you can scan.
-   `process_name()` writes `"kernel_task"` into both `p_comm` and `p_name`.
-   `kernproc` is the **tail** of `allproc`. `p_list` is the first field of `struct proc`, so `le_prev` points straight at the previous proc.

```javascript
for each pointer p in __DATA_CONST,__const:
    if p is a heap address and kread_safe(p, win, 0x1000):
        a = find(win, "kernel_task"); b = find(win after a, "kernel_task")
        if a and b: kernproc = p; comm_off = a; comm_size = b - a; break

// p_pid reads 1 in launchd (kernproc's predecessor) and 0 in kernproc
pid_off = first offset < comm_off where launchd[off] == 1 and kernproc[off] == 0

p = kernproc
loop:
    print(p[pid_off], p[comm_off])
    prev = p->le_prev
    if prev points into the kernelcache: break     // that is &allproc
    if *prev != p: break                           // list invariant
    p = prev
```

**Check:** pid 0 is `kernel_task`, pid 1 is `launchd`, and the list matches `ps -ax`.

* * *

## Exercise 5: syscalls and traps

**Goal:** dump `sysent` (BSD, positive numbers) and `mach_trap_table` (Mach, negative numbers).

```c
struct sysent {            // 24 bytes on iOS
  uint64_t sy_call;        // PAC-signed
  uint64_t sy_arg_munge32; // PAC-signed
  int32_t  sy_return_type;
  int16_t  sy_narg;
  uint16_t sy_arg_bytes;
};
```

The handler pointers are PAC-signed fixups, so the classic "find a run of pointers into `__TEXT_EXEC` " scan doesn't work. **Match the scalar fields instead:**

```javascript
expected = parse(bsd/kern/syscalls.master)          // {name, narg, ret} per number
find off in __DATA_CONST where 32 consecutive 24-byte records
     match expected (ret, narg, bytes)              // gives exactly one hit

for i = 0..:
    e = record(off + 24*i)
    if not (0 <= ret <= 7 and narg <= 8 and narg*4 <= bytes <= narg*8): break
    print(i, name[i], e.narg, strip(e.sy_call) - base)

strip(p) = (p & 0xffffffffff) | 0xfffffe0000000000  // trust only if it lands inside the image
```

Do the same for `mach_trap_table` (also 24 bytes per entry; its length is fixed at 128).

**What you should see:** 558 BSD syscalls. In the trap table, about half the slots point at one `kern_invalid` handler. A few `sysent` rows differ from the source because the feature is compiled out on iOS (SysV IPC, the NFS server).

**On paper:** trace one call: `svc #0` with the number in `x16` → `sleh_synchronous` → `handle_svc` (sign of `x16` picks Mach or BSD) → `unix_syscall` → `sysent[code]` → `sy_call(proc, args, rval)`. Errors come back with the carry flag set, which libc turns into `errno`.

* * *

## Exercise 6: Page tables

**Goal:** answer "what are the permissions of this address, and who can change them" by walking the tables yourself.

### Geometry

iOS uses 16K pages, so each level indexes **11 bits**, not 9. The kernel's root table is a full 2048-entry **L1**.

```javascript
L1 = (va >> 36) & 0x7FF     // 64 GB per entry
L2 = (va >> 25) & 0x7FF     // 32 MB per entry
L3 = (va >> 14) & 0x7FF     // 16 KB per entry
offset = va & 0x3FFF
```

### Decoder (pure function, test it on your Mac first)

```javascript
decode(raw, level):
    if !(raw & 1): INVALID
    if (raw & 3) == 3:
        level == 3 ? PAGE  pa = raw & 0x0000ffffffffc000
                   : TABLE pa = raw & 0x0000ffffffffc000, APTable, PXNTable, UXNTable
    else:
        level == 2 ? BLOCK pa = raw & 0x0000fffffe000000   // 32 MB
                   : INVALID       // no L1 blocks with a 16K granule (only with FEAT_LPA2)
    leaf: AP = raw[7:6], AF = raw[10], PXN = raw[53], UXN = raw[54], AttrIndx = raw[4:2]
```

### Find the root

You can't read `TTBR1_EL1` from userspace, and `_kernel_pmap` is stripped. `struct pmap` begins with `tte, ttep, min, max`:

```javascript
for off in __DATA step 8:
    tte, ttep, min, max = words at off
    if max == UINT64_MAX and -min is a power of two
       and tte is a page-aligned kernel VA and ttep is a page-aligned PA:
        kernel_pmap = off
```

### Physical to virtual (SPTM)

Descriptors give physical addresses, but `kread` takes virtual ones. On SPTM devices this is not a single offset (`gPhysBase` / `gVirtBase` are gone). It is a lookup in `libsptm_papt_ranges`, as in lldbmacros' `PhysToKVARM64`:

```javascript
phystokv(pa):
    for r in papt_ranges:                              // {paddr_start, papt_start, num_mappings}
        if r.paddr_start <= pa < r.paddr_start + r.num_mappings * 16K:
            return pa - r.paddr_start + r.papt_start
    return 0
```

Check: `phystokv(ttep) == tte`.

### ptwalk <va>

```javascript
tbl = tte; restrictions = none
for lvl in 1..3:
    d = decode(kread(tbl + 8 * index(va, lvl)), lvl)
    if d == INVALID: return unmapped                  // don't kread va after this
    if d is a leaf:
        pa  = d.pa | (va & (level_size - 1))
        ap  = d.AP limited by every APTable above
        pxn = d.PXN or any PXNTable above
        return pa, ap, pxn, d.UXN
    restrictions += d.APTable, d.PXNTable, d.UXNTable
    tbl = phystokv(d.pa)
```

**Check:** walk an address in `__TEXT_EXEC` (rebased with this boot's slide). You should get kernel read-only, PXN=0, UXN=1. Then `physmap <pa>` should give you back the same VA.

### ptmap

Recurse through every valid entry from the root, fold the table restrictions into each leaf, merge adjacent leaves with the same permissions into ranges, and label each range with its kernelcache segment. Block entries are common at L2, so handle them, not just L3 pages.

**What you should see:**

-   Root slots 2015–2028 are in use: the physical aperture, the kernelcache, then the heap.
-   Every heap table entry has PXNTable set.
-   The summary line `no effective kernel RWX` holds.

### pmap-pid <pid>

```javascript
proc -> p_proc_ro -> pr_task -> task.map -> vm_map.pmap -> {tte, ttep}
```

`task.map` and `vm_map.pmap` are PAC-signed, so strip them. Check that pid 0 resolves to the kernel pmap you found above.

### Try writing a PTE

Read a leaf descriptor, then write **the same 8 bytes** back with `kwrite`. Nothing about the mapping changes, but the kernel panics with `Unexpected fault in kernel physical aperture`. Under SPTM the page tables are read-only to the kernel, and only the monitor can change them.

That's the main takeaway of the lab. Kernel code and page tables are protected **below** the kernel. Kernel data on the heap is not: it is protected only by in-kernel software like PAC. That is why modern exploits are data-only, and why kernel read/write is where the work starts, not where it ends.

* * *

## Exercise 7: PAC by hand

**Goal:** see pointer authentication with your own eyes. You've already run into it twice: the signed `sy_call` slots in Exercise 5 and the signed `task.map` in Exercise 6. This exercise needs no kernel access; it runs in your own arm64e process.

Write tiny inline-asm wrappers so you can see each instruction separately:

```c
static inline uint64_t pacia(uint64_t p, uint64_t disc) { __asm__ volatile("pacia %0, %1" : "+r"(p) : "r"(disc)); return p; }
static inline uint64_t autia(uint64_t p, uint64_t disc) { __asm__ volatile("autia %0, %1" : "+r"(p) : "r"(disc)); return p; }
static inline uint64_t xpaci(uint64_t p)                { __asm__ volatile("xpaci %0"     : "+r"(p));            return p; }
// same for pacdb / autdb (data pointers, DB key)
```

```javascript
// code pointer, IA key
signed   = &some_function              // the compiler already signed it (IA, discriminator 0)
stripped = xpaci(signed)               // drop the signature bits
resigned = pacia(stripped, 0)          // sign it again ourselves
authed   = autia(resigned, 0)          // verify and strip
assert resigned == signed              // same key + same pointer + same discriminator = same signature
assert authed   == stripped

// data pointer, DB key
signed_d = pacdb(&local_var, disc)
authed_d = autdb(signed_d, disc)       // print all three: authed_d should equal &local_var
```

**Hints**

-   Print all four values and compare the high bits: the signature lives in the unused upper bits of the pointer.
-   Compiling with `-arch arm64e` and `-fptrauth-calls` is what makes the compiler sign function pointers for you (see the Makefile in Exercise 0).
-   In the kernel tables from Exercise 5, the same function always has the same signed value because the discriminator doesn't mix in the slot address (`addrDiv = 0`). That's why grouping handlers by raw value still works there.

**Check:** both asserts pass, and your re-signed pointer is byte-identical to the one the compiler produced.

* * *

## Checkpoint

Try to answer these without looking:

-   Of the static base, runtime base and slide, which is on disk and which two are only known at runtime?
-   Why are Mach traps negative, and how much of the trap table is dead?
-   Why 11 bits per level? Which bit stops the kernel from executing a user page?
-   With arbitrary kernel read and write, what can you still not do, and what stops you?

## References

-   [XNU source](https://github.com/apple-oss-distributions/xnu) and `tools/lldbmacros/`
-   [vphone-cli](https://github.com/Lakr233/vphone-cli)
-   ARM, [AArch64 memory management](https://developer.arm.com/documentation/101811/latest/)
-   [Apple Platform Security guide](https://support.apple.com/guide/security/welcome/web)
-   Project Zero, [Examining Pointer Authentication on the iPhone XS](https://projectzero.google/2019/02/examining-pointer-authentication-on.html)
-   [Brandon Azad's blog](https://bazad.github.io/)
-   [ipsw](https://github.com/blacktop/ipsw)
