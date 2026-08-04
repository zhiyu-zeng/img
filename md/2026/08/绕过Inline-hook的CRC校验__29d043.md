---
title: 绕过Inline hook的CRC校验
source: https://yuuki.cool/posts/crccheck/
source_host: yuuki.cool
clip_date: 2026-08-04T10:41:29+08:00
trace_id: cb0e7b4d-c9e5-45ed-8165-3ba35f02a17a
content_hash: ed8fa9f3179c2bc3319e0fe3367efb5de3b3e7999ce9b6768d93c41c1bf0393b
status: synced
tags:
  - 反调试
  - Frida
series: null
feed_source: Yuuki·移动安全
ai_summary: 通过内核模块重定向磁盘上的 so 文件路径，使内存与磁盘的 CRC 一致，从而绕过 inline hook 的完整性检测。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-810b-b1ce-c427079efc67
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过内核模块重定向磁盘上的 so 文件路径，使内存与磁盘的 CRC 一致，从而绕过 inline hook 的完整性检测。
> 
> - **检测原理：** CRC校验通过比对内存中 so 的 .text 段与磁盘同文件对应段的 CRC 值，若不一致则认为已被 inline hook 修改。
> - **内存伪造法：** 修改 `/proc/self/maps` 或 linker 中 soinfo 的基址，让获取的段地址指向自己准备的正常副本，但会引入匿名可执行内存段，需配合内核模块隐藏痕迹。
> - **磁盘伪造法：** 使用 Apatch 内核模块拦截 open 系统调用，将目标 so 的文件路径重定向到事先 dump 的内存 so，使磁盘内容与内存一致，从而骗过 CRC 比对。
> - **操作流程：** 先用 frida 整体 dump 内存中的目标 so，再将命令 `MAP:UID:原路径:dump路径` 通过劫持 `getcwd` 函数传入内核模块完成重定向，在检测 so 加载前执行。
> - **关键时机：** 在 `android_dlopen_ext` 处 hook 并检测到目标库加载时立即 dump 并重定向，检测完成后需主动清除内核模块的重定向记录，避免影响后续启动。

## 0x00前言：

[模块下载及介绍](https://bbs.kanxue.com/thread-288041-1.htm)

## 0x01 什么是CRC校验

这里所说的crc校验是狭义的，范围只限于android平台的hook检测部分，绕过的方式也不会围绕构造碰撞等密码学相关的方式展开。 **CRC校验（循环冗余校验，Cyclic Redundancy Check）**，即通过数学算法生成一个固定长度的校验码（CRC值）。检测inline hook时，可以通过计算内存中目标so与磁盘上对应so的crc值，二者对比从而得出是否被hook的结论。这里选择其他算法也是可以的，选择crc是因为实现起来比较简单，计算也不会消耗太多性能

## 0x02 实现一个CRC校验

要想绕过我们就得先来分析一下它究竟是如何检测的？以下是我之前写的注入检测的app的相关代码

```cpp
int check_library_integrity(const char* soname) {
    if (!soname) {
        LOGE("Invalid soname parameter");
        return DETECT_RESULT_ERROR;
    }

    // 初始化CRC表
    if (!is_crc32_table_initialized())
        generate_crc32_table();
    

    // 遍历maps获取目标so可执行段信息
    map_info_t exec_info = find_memory_mapping(soname, "x");
    if (!exec_info.is_valid) {
        LOGE("Failed to find executable mapping for %s", soname);
        return DETECT_RESULT_ERROR;
    }

    int fd = open(exec_info.pathname, O_RDONLY);
    if (fd < 0) {
        LOGE("Failed to open %s: %s", exec_info.pathname, strerror(errno));
        return DETECT_RESULT_ERROR;
    }

    struct stat st;
    if (fstat(fd, &st) != 0) {
        LOGE("Failed to get file stats: %s", strerror(errno));
        close(fd);
        return DETECT_RESULT_ERROR;
    }

    void* file_data = mmap(NULL, st.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (file_data == MAP_FAILED) {
        LOGE("Failed to mmap file: %s", strerror(errno));
        close(fd);
        return DETECT_RESULT_ERROR;
    }

    close(fd);

    // 解析ELF文件
    Elf64_Ehdr* ehdr = (Elf64_Ehdr*)file_data;
    if (memcmp(ehdr->e_ident, ELFMAG, SELFMAG) != 0) {
        LOGE("Invalid ELF file");
        munmap(file_data, st.st_size);
        return DETECT_RESULT_ERROR;
    }

    Elf64_Phdr* phdr = (Elf64_Phdr*)(file_data + ehdr->e_phoff);
    int result = DETECT_RESULT_CLEAN;

    // 检查可执行段
    for (int i = 0; i < ehdr->e_phnum; i++) {
        if (phdr[i].p_type == PT_LOAD && (phdr[i].p_flags & PF_X) &&
            phdr[i].p_offset == exec_info.offset) {

            uint32_t disk_crc = crc32((uint8_t*)file_data + phdr[i].p_offset, phdr[i].p_memsz);
            uint32_t mem_crc = crc32((uint8_t*)exec_info.start, phdr[i].p_memsz);

            if (disk_crc != mem_crc) {
                LOGD("%s executable segment modified: disk=%08x, mem=%08x",
                     soname, disk_crc, mem_crc);
                result = DETECT_RESULT_SUSPICIOUS;
            }
            break;
        }
    }

    munmap(file_data, st.st_size);
    return result;
}
```

主要流程十分清晰，通过扫描maps拿到目标so的完整路径和内存地址，分别计算磁盘so和内存so的.text段的crc值且进行对比，从而判断对应so是否被inline hook(因为Inline hook会修改函数入口处的指令，使其跳转到自己实现到的hook函数位置)

当然so的地址也可以从linker中拿，这里不多赘述，因为核心还是对比内存和磁盘中的crc值

## 0x03 绕过CRC校验

知道了原理，我们就可以绕过了。既然原理是对比磁盘和内存，那么不就只有两种思路吗。一是伪造内存里的so，二是伪造磁盘上的so

#### 先来简单说说伪造内存里的吧

直接修改内存里的so，使其变得跟磁盘里的.text段一致是不太现实的，那不就相当于是绕了一大圈然后手动unhook了吗？这样做没什么意义。但是可以退一步，从 `如何获取内存里目标so的地址` 入手，上述我们获取地址的方式是扫描 `/proc/self/maps` 里目标so的名字，然后拿到可执行段的地址，那么我们只需要让app拿到的地址是指向我们自己申请的地址，同时把原本so对应的地址设置为匿名内存段即可，我们可以在申请的内存里map正常so的可执行段，这样app通过这种方式获取到的内存数据就和磁盘里的一模一样了，crc值当然也是一样的

当然如果app从linker里获取地址的话上述方法就没效果了。先简单说一下则呢么从linker里拿吧，主要就是通过解析 `solist_get_head` 函数地址，拿到soinfo链表头，然后遍历链表，通过so_name过滤目标so，从而拿到soinfo地址，根据base偏移拿到基地址。这种要绕过的话，一样可以在frida里拿到对应soinfo的地址，然后自己根据偏移把base字段的值改成自己map的内存地址就行，但是不同版本偏移可能不一样，需要手动适配或者动态计算qaq

这样做会有个弊端，正常的maps里是不会有匿名的可执行内存段的，上述方法会引入这个检测点，为了解决这个问题，可以使用我的这个工具进行隐藏 [Apatch内核模块分享](https://bbs.kanxue.com/thread-288041-1.htm)

#### 再来详细说说伪造磁盘里的

我个人是比较喜欢这种方式的，因为它比较统一，无论你是从maps里获取还是从linker里获取，最后都是要和磁盘的文件进行比较，我直接把磁盘的文件''替换''掉不就好了嘛。但是不能真的替换了，而是把原本的文件重定向成我们自己的，当然这种方式也不是完全没有问题，依旧有继续对抗的空间。你可以通过hook libc里的相关函数实现重定向的效果，但是以防app通过svc直接call系统调用，我就用内核模块的方式hook内核函数进行重定向了，还是这个模块 [Apatch内核模块分享](https://bbs.kanxue.com/thread-288041-1.htm)

重定向的核心原理就是通过拦截 open系统调用对应调用链上的内核函数，修改其传递的路径参数为我们需要重定向到的路径，从而实现重定向。接下来就讲一下如何搭配上述内核模块进行crc校验的绕过

既然要绕过crc校验，那必须使磁盘so的.text段和内存so的.text段内容一致，所以在重定向之前，需要去dump内存里的so，直接整体dump即可

**frida中：**

```javascript
function dumpModule(soName = '', output_path = '') {
    var module = Process.getModuleByName(soName);
    if (module === null) {
        console.log("[!] Module not found: " + soName);
        return;
    }

    console.log("[*] Found module: " + module.name);
    console.log("[*] Base address: " + module.base);
    console.log("[*] Size: " + module.size);

    // 读取内存内容
    try {
        var buffer = module.base.readByteArray(module.size);
        console.log("[*] Successfully read " + module.size + " bytes");

        // 保存到文件
        var file = new File(output_path, "wb");
        file.write(buffer);
        file.close();
        console.log("[*] Dump saved to: " + output_path);
    } catch (e) {
        console.log("[!] Error: " + e);
    }
}
```

**其他hook框架中：**

```cpp
int dump_memory(int pid, uint64_t start, uint64_t size, uint64_t file_offset , const char *output_file) {
    char mem_path[MAX_LINE];
    snprintf(mem_path, sizeof(mem_path), MEM, pid);

    int mem_fd = open(mem_path, O_RDONLY);
    if (mem_fd < 0)
        return 1;

    int out_fd = open(output_file, O_RDWR);
    if (out_fd < 0) {
        close(mem_fd);
        return 1;
    }

    if (lseek(out_fd, file_offset, SEEK_SET) == -1) {
        close(mem_fd);
        close(out_fd);
        return 1;
    }

    char buffer[BUF_SIZE];
    uint64_t remaining = size;
    uint64_t offset = start;
    ssize_t total_written = 0;

    while (remaining > 0) {
        size_t to_read = remaining > sizeof(buffer) ? sizeof(buffer) : remaining;
        ssize_t bytes_read = pread(mem_fd, buffer, to_read, offset);
        if (bytes_read < 0)
            break;

        if (bytes_read == 0)
            break;

        ssize_t bytes_written = write(out_fd, buffer, bytes_read);
        if (bytes_written != bytes_read)
            break;

        total_written += bytes_written;
        remaining -= bytes_read;
        offset += bytes_read;
    }

    close(mem_fd);
    close(out_fd);

    if (total_written == size) {
        printf("Memory dumped to %s at offset %llx successfully, total bytes: %lld\n",
               output_file, file_offset, (long long)total_written);
        return 0;
    } else {
        printf("Memory dump incomplete, wrote %lld of %lld bytes at offset %llx\n",
               (long long)total_written, (long long)size, file_offset);
        return 1;
    }
}
```

假设dump之后保存的路径为$dst_path，原本so的路径为$src_path，要绕过的目标app的uid为$uid，我们就可以写入命令 `MAP:$uid:$src_path:$dst_path` 进行文件重定向。那么该如何写入呢？模块提供了两套通信方式，其中一种是通过字符设备，但这是面向普通用户的，因为我们注入的进程往往没有权限访问/dev下的文件，所以面向开发者设计了另一套通信方式，我们可以通过调用libc.so的getcwd函数，并把命令写入到参数中传递给内核模块

**frida中使用此函数：**

```javascript
function callGetcwd(buf = '') {
    var getcwd = new NativeFunction(
        Module.getExportByName('libc.so', 'getcwd'),
        'pointer',
        ['pointer', 'int']
    );
    var buffer_size = 256;
    var buffer;

    if (buf !== '') {
        buffer = Memory.allocUtf8String(buf);
        buffer_size = buf.length + 1;
    } else {
        buffer = Memory.alloc(buffer_size);
    }

    try {
        getcwd(buffer, buffer_size);
    } catch (e) {
        console.log("[!] Error: " + e);
        return null;
    }
}
callGetcwd("MAP:10334:/apex/com.android.runtime/lib64/bionic/libc.so:/storage/emulated/0/Download/libc.so")

```

其他框架如dobby等，直接导入对应头文件就能使用了，不做演示

这样之后内核模块就会把特定uid对应的app访问的$src_path重定向到$dst_path，结合上面的dump函数使用，就可以达到粗略绕过crc校验的目的

这种方式也有一个弊端，就是需要开发者自己把握写入命令的时机。我通常会在 `安装hook之后` dump出内存中的对应so然后重定向，当然frida中这个时机似乎不是很好把控，我们可以先找出是哪个so进行了crc校验(hook linker看看加载到哪个so时进程挂了，大概就是在那个so里进行的检测)，然后hook `android_dlopen_ext` ，当加载到该so时，然后再dump+重定向。这样就可以过掉它的检测了~记得使用完要手动clear一下内核模块里的数据，否则可能会影响app的下一次启动

**在frida中完整的使用流程：**

```javascript
function dumpModule(soName = '', output_path = '') { // dump so
    var module = Process.getModuleByName(soName);
    if (module === null) {
        console.log("[!] Module not found: " + soName);
        return;
    }

    console.log("[*] Found module: " + module.name);
    console.log("[*] Base address: " + module.base);
    console.log("[*] Size: " + module.size);

    // 读取内存内容
    try {
        var buffer = module.base.readByteArray(module.size);
        console.log("[*] Successfully read " + module.size + " bytes");

        // 保存到文件
        var file = new File(output_path, "wb");
        file.write(buffer);
        file.close();
        console.log("[*] Dump saved to: " + output_path);
    } catch (e) {
        console.log("[!] Error: " + e);
    }
}


function callGetcwd(buf = '') { // write cmd
    var getcwd = new NativeFunction(
        Module.getExportByName('libc.so', 'getcwd'),
        'pointer',
        ['pointer', 'int']
    );
    var buffer_size = 256;
    var buffer;

    if (buf !== '') {
        buffer = Memory.allocUtf8String(buf);
        buffer_size = buf.length + 1;
    } else {
        buffer = Memory.alloc(buffer_size);
    }

    try {
        getcwd(buffer, buffer_size);
    } catch (e) {
        console.log("[!] Error: " + e);
        return null;
    }
}

function hook_dlopen(soName = '') {
    Interceptor.attach(Module.findExportByName(null, "android_dlopen_ext"), {
        onEnter: function (args) {
            var pathptr = args[0];
            if (pathptr !== undefined && pathptr != null) {
                var path = ptr(pathptr).readCString();
                if (path.indexOf(soName) >= 0) {
                    console.log("[*] 检测到目标库 " + soName);
                    dumpModule("libc.so", "/storage/emulated/0/Download/libc.so")
                    callGetcwd("MAP:10334:/apex/com.android.runtime/lib64/bionic/libc.so:/storage/emulated/0/Download/libc.so")
                    // 用完用命令清 echo CMD:CLEAR:TYPE:1 > /dev/yuuki_misc
                }
            }
        },
        onLeave: function (retval) {
            console.log("[*] android_dlopen_ext 返回值 (so handle): " + ptr(retval));
        }
    });
}

hook_dlopen("libinject_detect.so")

// frida -U -l hook.js -f com.yuuki.inject_detect
```

当然真实情况可能更加复杂，但是思路大概应该也许可能是一样的，通过这种方式应该是可以过掉的

同时你也可以像处理selinux那样，在你要执行的特殊操作前后先重定向，再结束操作后解除重定向，总之就是比较自由

在dobby中使用就更简单了，在安装hook之后立马重定向即可(不过如果app的正常操作中使用到了对应文件，那app是会受影响的，解决方案就是hook正常的操作，然后先解除重定向，然后再leave时安装重定向，frida同理)

## 0x04 总结

似乎绕了一圈下来，这个方法也不是那么简单哈哈哈哈，还是没能实现“静默”的绕过，需要使用者自行把握时机。再次抛砖引玉，欢迎大家批评指正，提出更好的方案( 3ω3)
