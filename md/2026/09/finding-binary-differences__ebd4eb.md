---
title: finding binary differences
source: https://outflux.net/blog/archives/2022/06/24/finding-binary-differences/
source_host: outflux.net
clip_date: 2026-09-09T10:56:19+08:00
trace_id: f862f8b8-f205-448d-875e-1aece2c35d41
content_hash: fbfe40b4dd1e4b36f5b114029cd6c5df8a7e46ab182a35a8b33f7600fafc1337
status: synced
tags:
  - 内核
  - 开发工具
series: null
feed_source: Kees Cook·Linux
ai_summary: TL;DR：用可复现构建与 diffoscope/objdump 逐段对比 Linux 内核 obj 改动前后的机器码，可定位把 `data[1]` 改成 `data[]` 时漏改的 size 计算。
ai_summary_style: key-points
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 3d675244-d011-81b9-aa1c-fbe1e78aaeae
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> TL;DR：用可复现构建与 diffoscope/objdump 逐段对比 Linux 内核 obj 改动前后的机器码，可定位把 `data[1]` 改成 `data[]` 时漏改的 size 计算。
> 
> - **可复现构建：** 设置 `KBUILD_BUILD_TIMESTAMP/USER/HOST/VERSION` 等固定值，并关闭 GCOV_KERNEL、KCOV、GCC_PLUGINS、IKHEADERS、KASAN、UBSAN 等干扰项，启用 DWARF 调试信息，以降低 diffoscope 的噪音。
> - **before/after 流程：** 先用 allmodconfig 编译 megaraid 驱动并把 `.o` 保存为 before；修改源码后再次编译保存为 after；运行 `diffoscope before/ after/`，无输出即代码无差异。
> - **过滤非代码噪音：** 行号相关数据（如 `WARN` 宏）会加深 diffoscope 噪音；改用 `objdump --disassemble --demangle --reloc --section=.text` 对比每个 `.o`，并去掉 Disassembly 头部差异。
> - **定位漏改：** 若看到 `movq $0x0,0x800(%rbx)` 变成 `0x7f8(%rbx)`，再用带 `--line-numbers` 的 objdump 找到源文件行号，如 `megaraid_sas_fp.c +329`，检查 size 计算中多减或漏加的部分。
> - **修正与注意：** 对 `data[1]`→`data[]`，要把 `sizeof(u32) * (count - 1)` 改为 `sizeof(u32) * count`，更建议用 `struct_size(instance, data, count)`；但带 `SIZE_MAX` 饱和溢出检查的 `size_mul` 等 helper 可能引入额外机器码，应单独提交。

As part of the continuing work to [replace 1-element arrays in the Linux kernel](https://github.com/KSPP/linux/issues/79), it’s very handy to show that a source change has had no executable code difference. For example, if you started with this:

```cpp
struct foo {
    unsigned long flags;
    u32 length;
    u32 data[1];
};

void foo_init(int count)
{
    struct foo *instance;
    size_t bytes = sizeof(*instance) + sizeof(u32) * (count - 1);
    ...
    instance = kmalloc(bytes, GFP_KERNEL);
    ...
};
```

And you changed only the struct definition:

```
-    u32 data[1];
+    u32 data[];
```

The `bytes` calculation is going to be incorrect, since it is still subtracting 1 element’s worth of space from the desired count. (And let’s ignore for the moment the open-coded calculation that may end up with an arithmetic over/underflow here; that can be solved separately by using the `struct_size()` helper or the `size_mul()`, `size_add()`, etc family of helpers.)

## 构建配置

The missed adjustment to the size calculation is relatively easy to find in this example, but sometimes it’s much less obvious how structure sizes might be woven into the code. I’ve been checking for issues by using the fantastic [diffoscope](https://diffoscope.org/) tool. It can produce a LOT of noise if you try to compare builds without keeping in mind the issues solved by [reproducible builds](https://docs.kernel.org/kbuild/reproducible-builds.html), with some additional notes. I prepare my build with the “known to disrupt code layout” options disabled, but with debug info enabled:

```bash
$ KBF="KBUILD_BUILD_TIMESTAMP=1980-01-01 KBUILD_BUILD_USER=user KBUILD_BUILD_HOST=host KBUILD_BUILD_VERSION=1"
$ OUT=gcc
$ make $KBF O=$OUT allmodconfig
$ ./scripts/config --file $OUT/.config \
        -d GCOV_KERNEL -d KCOV -d GCC_PLUGINS -d IKHEADERS -d KASAN -d UBSAN \
        -d DEBUG_INFO_NONE -e DEBUG_INFO_DWARF_TOOLCHAIN_DEFAULT
$ make $KBF O=$OUT olddefconfig
```

## 保存修改前结果

Then I build a stock target, saving the output in “before”. In this case, I’m examining `drivers/scsi/megaraid/`:

```bash
$ make -jN $KBF O=$OUT drivers/scsi/megaraid/
$ mkdir -p $OUT/before
$ cp $OUT/drivers/scsi/megaraid/*.o $OUT/before/
```

## 保存修改后结果

Then I patch and build a modified target, saving the output in “after”:

```bash
$ vi the/source/code.c
$ make -jN $KBF O=$OUT drivers/scsi/megaraid/
$ mkdir -p $OUT/after
$ cp $OUT/drivers/scsi/megaraid/*.o $OUT/after/
```

And then run `diffoscope`:

```
$ diffoscope $OUT/before/ $OUT/after/
```

If `diffoscope` output reports nothing, then we’re done.

![🥳](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/71fd857dc56ed507.png)

## 过滤非代码差异

Usually, though, when source lines move around other stuff will shift too (e.g. `WARN` macros rely on line numbers, so the bug table may change contents a bit, etc), and `diffoscope` output will look noisy. To examine just the executable code, the command that `diffoscope` used is reported in the output, and we can run it directly, but with possibly shifted line numbers not reported. i.e. running `objdump` without `--line-numbers`:

```bash
$ ARGS="--disassemble --demangle --reloc --no-show-raw-insn --section=.text"
$ for i in $(cd $OUT/before && echo *.o); do
        echo $i
        diff -u <(objdump $ARGS $OUT/before/$i | sed "0,/^Disassembly/d") \
                <(objdump $ARGS $OUT/after/$i  | sed "0,/^Disassembly/d")
done
```

If I see an unexpected difference, for example:

```
-    c120:      movq   $0x0,0x800(%rbx)
+    c120:      movq   $0x0,0x7f8(%rbx)
```

Then I'll search for the pattern with line numbers added to the `objdump` output:

```
$ vi <(objdump --line-numbers $ARGS $OUT/after/megaraid_sas_fp.o)
```

I'd search for "0x0,0x7f8", find the source file and line number above it, open that source file at that position, and look to see where something was being miscalculated:

```
$ vi drivers/scsi/megaraid/megaraid_sas_fp.c +329
```

Once tracked down, I'd start over at the "patch and build a modified target" step above, repeating until there were no differences. For example, in the starting example, I'd also need to make this change:

```
-    size_t bytes = sizeof(*instance) + sizeof(u32) * (count - 1);
+    size_t bytes = sizeof(*instance) + sizeof(u32) * count;
```

Though, as hinted earlier, better yet would be:

```
-    size_t bytes = sizeof(*instance) + sizeof(u32) * (count - 1);
+    size_t bytes = struct_size(instance, data, count);
```

## 对溢出检查单独处理

But sometimes adding the helper usage will add binary output differences since they're performing overflow checking that might saturate at `SIZE_MAX`. To help with patch clarity, those changes can be done separately from fixing the array declaration.
