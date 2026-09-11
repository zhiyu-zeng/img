---
title: Fuzzing IoT binaries with AFL++ - Part II
source: https://blog.attify.com/fuzzing-iot-binaries-with-afl-part-ii/
source_host: blog.attify.com
clip_date: 2026-09-11T10:22:41+08:00
trace_id: 4beb734c-d9a8-4883-969d-d3ce2d0ce3cc
content_hash: 16450b1d6a09404ed17b06c816b8b40137e56985eb04a4c6d2e617861485f2b4
status: synced
tags:
  - 漏洞分析
  - 安全工具
series: null
feed_source: Attify
ai_summary: 把监听端口的 IoT httpd 通过汇编补丁和 LD_PRELOAD 改为单次从文件读请求，就能用原生 AFL++ 进行网络程序模糊测试。
ai_summary_style: key-points
images_status:
  total: 21
  succeeded: 21
  failed_urls: []
notion_page_id: 3d875244-d011-8154-9ef8-f465ba02b14a
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 把监听端口的 IoT httpd 通过汇编补丁和 LD_PRELOAD 改为单次从文件读请求，就能用原生 AFL++ 进行网络程序模糊测试。
> 
> - **核心限制：** 原生 AFL/AFL++ 不支持 socket 输入，AFLNet/AFLNW 需改版；文章用 desockmulti 覆盖 libc 网络函数，把 socket 流量转为文件输入。
> - **二进制补丁：** Cutter 中把 0x231c0 处 close 改为 exit(0)，前一条指令改 eor r0,r0 使 r0=0；再把 0x22CB4 的 daemon 调用改 eor r0,r0，让 httpd 不后台 fork 且处理一次请求即退出。
> - **编译依赖：** desockmulti 用 uclibc ARM 交叉编译器（如 bootlin armv7-eabihf-uclibc）编译，需注释 setup_timer()；再用 patchelf --add-needed ./lib/libpthread.so.0 给 httpd_patched 补线程库。
> - **验证方法：** 以 qemu-arm-static -g 5555、LD_PRELOAD=../desockmulti.so、USE_RAW_FORMAT=1 运行，gdb-multiarch 断在 fprintf，r2 指向 "HTTP/1.1 200 Ok\r\n" 证明劫持生效。
> - **非 root 与 fuzz：** 将 /var/run/httpd.pid 改成 /home/ubuntu/h.pid（替换串长度≤原串），运行 afl-fuzz -Q -i input-httpd -o output-httpd -- ../usr/sbin/httpd_patched -p 8080；短暂测试未发现崩溃；Radamsa 经 socket 发包 1 秒超时存为 interesting，超时≠崩溃，效率低且易误报。

In the [previous part](https://blog.attify.com/fuzzing-iot-devices-part-1/), we looked at fuzzing simple IoT binaries with AFL++. These programs accepted input from a file and were straightforward to fuzz.

In this post, we will be looking at socket'ed binaries. Fuzzing binaries that communicate over the network using sockets are different from fuzzing binaries that use file-based I/O. Vanilla AFL and AFL++ don’t support fuzzing socket'ed binaries although there have been projects such as [AFLNet](https://github.com/aflnet/aflnet?ref=blog.attify.com) and [AFLNW](https://github.com/LyleMi/aflnw?ref=blog.attify.com) which use modified versions of AFL for the same. Here however, we will see how to use plain AFL++ to fuzz network programs. The `httpd` binary at `/usr/sbin/httpd` is the web server for the firmware and can be used as a candidate for fuzzing.

We can launch `httpd` with `sudo` as shown. Sudo is needed to bind on port 80.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/41144ce42f5ddd6a.png)

Note that qemu is started from within the `www/` directory as this is where the web resources (html, css, js files) are. Although it shows a bind error, running `netstat` confirms that `httpd` is indeed listening on port 80.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/6981a551d15fc1fb.png)

We can open *http://127.0.0.1* to cross-check that the web interface is accessible.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/703f9afcfd39c1e9.png)

The web interface can also be accessed using `curl`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3b1b9fcb3dad9c87.png)

Using an intercepting proxy such as Burp Suite, we can view the actual HTTP requests that are being sent. Trying to login to the dashboard with the credentials `admin:123456` results in a POST request as shown.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8f26a470fbdeec98.png)

In the image above we are running the webserver over port 8080 (rather than 80) by appending *`-p 8080`* to the qemu command line.

From here on, the idea is to modify this base request using the fuzzer in subtle ways such that it crashes the web server.

The naive way is to send actual requests over the network. However, this would be slow. The smarter and recommended way is to make the webserver read the HTTP request data from a file. We will look at both ways.

## Naive fuzzing using Radamsa

[Radamsa](https://gitlab.com/akihe/radamsa?ref=blog.attify.com) is not a fuzzer. It's a test case generator that reads in a file and modifies it in subtle ways. How to use the modified output is up to us. Here we will send the output from the file to the running web server.

```python
# fuzz-radamsa.py
import socket
import pyradamsa
 
base_login_request = open("base-login-request.txt", "rb").read()
 
rad = pyradamsa.Radamsa()
i = j = 0
 
while True:
    # Create a modified request based on the base request
    fuzzed_request = rad.fuzz(base_login_request)
 
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
 
    # 1 second timeout
    sock.settimeout(1)
 
    sock.connect(("127.0.0.1", 8080))
 
    j += 1
    print(f"[+] Request {j} - ", end="")
 
    sock.sendall(fuzzed_request)
    try:
            sock.recv(50000)
        print("OK")
    except Exception as ex:
            i += 1
            open(f"interesting/{i}.txt", "wb").write(fuzzed_request)
            print(f" {ex} -> saved to {i}.txt")
       sock.close()
```

The code above uses Radamsa to generate modified request data using the base login request. This data is then sent over the socket to the webserver running at port 8080. If the server doesn’t respond within 1 second, the input is saved to a file in the interesting directory.

We can run the fuzzer as shown.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3f22aa186ab47c09.png)

Request 3 timed out while responding and the corresponding input was saved to *1.txt*. Note that a timeout is not the same as a crash. Had the server crashed on request 3, further requests wouldn’t be successful. Fuzzing this way is highly inefficient, slow, and error-prone and would often lead to false positives.

## Fuzzing with AFL++

As discussed before, to fuzz with AFL, the program must accept input from a file. We do not have the source code of *httpd* which we can modify for our purpose. Hence we have to resort to binary level modifications, such as patching the assembly instructions and `LD_PRELOAD` tricks. Using the latter we can override network functions in `libc` to make them accept input from a file instead. The [desockmulti](https://github.com/zyingp/desockmulti?ref=blog.attify.com) project on GitHub can be used for this purpose.

Before showing how to use *desockmulti,* we need to make a few modifications of our own. The `httpd` binary currently forks to the background using the [`daemon`](https://man7.org/linux/man-pages/man3/daemon.3.html?ref=blog.attify.com) function. We do not want this forking behavior during fuzzing.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b2c5f9cd94bd5c2b.png)

We need to override `daemon` such that it returns 0 without forking actually. This can be done both with LD_PRELOAD or patching the assembly instructions.

The other change that we need to make is to have *httpd* process exactly 1 request (unlike a typical web server that processes requests indefinitely) before quitting. This way we can know which request, if any, crashes the web server.

To close a socket, `httpd` calls the [`close`](https://man7.org/linux/man-pages/man2/close.2.html?ref=blog.attify.com) function. There are three locations from where close is called.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ab56c74503f4eda1.png)

Among them, we need to modify the one at `231c0` to call `exit(0)` instead of `close`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5b658587fdbdc555.png)

To patch the instructions we will use [Cutter](https://cutter.re/?ref=blog.attify.com) which is a GUI for [radare2](https://github.com/radareorg/radare2?ref=blog.attify.com). Ghidra also supports patching binaries but Cutter is better suited for this use case.

Navigating to `0x231c0` in Cutter, we come across the following disassembly.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d5c824b5119183a4.png)

Double-clicking on `close` takes us to `0x106b4`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ba0abca3ae60154e.png)

The `exit` function is located at `0x10b64`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/09a60ecc59241878.png)

We can thus change `bl close` to `bl 0x10b64` to call the `exit` function instead.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8081dcfb239ce30f.png)

The instruction immediately before can be changed from `mov r0, sl` to `eor r0, r0` which sets register `r0` to `0` to give us the following disassembly.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/215380acf64da2c1.png)

The net effect is that it calls `exit(0)`. The other change we need to do is patch out the `daemon` call at `0x22CB4`.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a938a64c6fa8d9e2.png)

We can change the instruction to `eor r0, r0` to make the application believe the call succeeded.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/03c90e9530a9314c.png)

Finally, with the changes in place go to File -> Commit changes to save the modifications. Let's rename the file to *httpd_patched.*

## Testing patched httpd

Running *httpd_patched* we can see that it doesn’t fork to the background.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/376a248c0f98852e.png)

Additionally, it quits after processing a single request as shown below.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4c25848f2d53daa2.png)

## Setting up desockmulti

We need to use an ARM cross compiler to compile *desockmulti*. The [armv7-eabihf-uclibc](https://toolchains.bootlin.com/?ref=blog.attify.com) toolchain from bootlin works great for this purpose. We need to use a uclibc based toolchain as the firmware binaries also use the same. Running the file command on */usr/bin/httpd* points out the binary is dynamically linked to *ld-uClibc*.

```bash
$ file usr/sbin/httpd
usr/sbin/httpd: ELF 32-bit LSB executable, ARM, EABI4 version 1 (SYSV), dynamically linked, interpreter /lib/ld-uClibc.so.0, stripped
```

Before compiling *desockmulti*, we have to make a tiny change to its source.

```bash
$ git diff
diff --git a/desockmulti.c b/desockmulti.c
index 719e6ac..6bcc223 100644
--- a/desockmulti.c
+++ b/desockmulti.c
@@ -450,7 +450,7 @@ int socket(int domain, int type, int protocol)
                pthread_mutex_unlock(&mutex);
        }
 
-       setup_timer();
+       //setup_timer();
 
        if ((fd = original_socket(AF_UNIX, SOCK_STREAM, 0)) < 0) {
                perror("socket error");
```

In *desockmulti.c* there’s a call to a `setup_timer` function that needs to be commented out as shown in the diff above.

We can then run make specifying the bath to the arm-linux-gcc compiler in the `CC` environment variable.

```bash
$ make CC=~/armv7-eabihf--uclibc--stable-2020.08-1/bin/arm-linux-gcc      
```

The generated file *desockmulti.so* can be copied to the *squashfs-root* directory.

## Testing desockmulti

To test that *desockmulti* is indeed working as expected we can debug *httpd* with *gdb-multiarch*. First, we need to add a dependency to the library *libpthread.so.0* using *patchelf*. Patchelf can be installed using apt. This is necessary as *desockmulti* uses threads while *httpd* doesn’t link to *libpthread* by default.

```bash
$ patchelf --add-needed ./lib/libpthread.so.0 ./usr/sbin/httpd_patched
```

In terminal 1, run the binary in qemu specifying the -g parameter.

```bash
ubuntu@binwalk:~/cisco/_RV130X_FW_1.0.3.55.bin.extracted/squashfs-root/www$ sudo qemu-arm-static -g 5555 -L .. -E USE_RAW_FORMAT=1 -E LD_PRELOAD=../desockmulti.so ../usr/sbin/httpd_patched
-p 8080 < ../../base-login-request.txt
```

The path to *desockmulti.so* is specified in the `LD_PRELOAD` environment variable. The other variable `USE_RAW_FORMAT` is specific to *desockmulti*.

In another terminal, we can start *gdb-multiarch*, set a breakpoint on `fprintf` and attach to port 5555.

```bash
$ gdb-multiarch -q ./usr/sbin/httpd
GEF for linux ready, type `gef' to start, `gef config' to configure
95 commands loaded for GDB 9.2 using Python engine 3.8
[*] 1 command could not be loaded, run `gef missing` to know why.
Reading symbols from ./usr/sbin/httpd...
(No debugging symbols found in ./usr/sbin/httpd)
gef➤  b fprintf
Breakpoint 1 at 0x10a38
gef➤  target remote :5555
…
gef➤  c
```

When the breakpoint on `fprintf` hits we can press c and continue for a couple of times to finally inspect the contents of the register `r2`.

```bash
0xfffe5fa8│+0x0018: 0x30303220  →  0x30303220
0xfffe5fac│+0x001c: 0x0d6b4f20  →  0x0d6b4f20
─────────────────────────────────────── code:arm:ARM ────
   0xff4eb7b8 <fprintf+4>      push   {lr}              ; (str lr,  [sp,  #-4]!)
   0xff4eb7bc <fprintf+8>      add    r2,  sp,  #8
   0xff4eb7c0 <fprintf+12>     ldr    r1,  [sp,  #4]
 → 0xff4eb7c4 <fprintf+16>     bl     0xff4ee024 <vfprintf>
   ↳  0xff4ee024 <vfprintf+0>     push   {r4,  r5,  r6,  r7,  r8,  lr}
      0xff4ee028 <vfprintf+4>     mov    r5,  r0
      0xff4ee02c <vfprintf+8>     ldr    r6,  [r0,  #76]        ; 0x4c
      0xff4ee030 <vfprintf+12>    ldr    r12,  [pc,  #144]      ; 0xff4ee0c8 <vfprintf+164>
      0xff4ee034 <vfprintf+16>    cmp    r6,  #0
      0xff4ee038 <vfprintf+20>    add    r12,  pc,  r12
──────────────────────────────────── arguments (guessed) ────
vfprintf (
   $r0 = 0x000be3c0 → 0xff006085 → 0xff006085,
   $r1 = 0x00093f5c → 0x00007325 → 0x00007325,
   $r2 = 0xfffe5f98 → 0xfffe5fa0 → 0x50545448 → 0x50545448,
   $r3 = 0x000006c8 → 0x000006c8
)
────────────────────────────────────────────── threads ────
[#0] Id 1, stopped 0xff4eb7c4 in fprintf (), reason: BREAKPOINT
───────────────────────────────────────────── trace ────
[#0] 0xff4eb7c4 → fprintf()
[#1] 0x1dd5c → add sp,  sp,  #1004      ; 0x3ec
───────────────────────────────────────────────────────────
gef➤  x/s *$r2
0xfffe5fa0:     "HTTP/1.1 200 Ok\r\n"
```

R2 points to a readable string "HTTP/1.1 200 Ok\\r\\n" which is the first line of a typical HTTP response. This indicates that *desockmulti* is working. We are not able to see the HTTP response on-screen but nevertheless it's working as intended.

At this point we can start fuzzing *httpd_patched* however, we can further make quality of life improvements. For example, the binary requires root to run. It prints the following error message if started without root.

```bash
ubuntu@binwalk:~/cisco/_RV130X_FW_1.0.3.55.bin.extracted/squashfs-root/www$ qemu-arm-static -L .. -E USE_RAW_FORMAT=1 -E LD_PRELOAD=../desockmulti.so ../usr/sbin/httpd_patched -p 8080 < ../../base-login-request.txt
===>HTTPD : scheduler set RR with proirity = 99 FAILED
--- [1640588459:322474] accept_num=1, connect_num=0
--- [1640588459:323006] Get pkt, sockindex=0, length=943, pkt[0]=80
+++ [1640588459:323333] Intercepted socket()! original type=AF_INET6 fd=4
--- [1640588459:323785] preeny socket bound, Emulating bind on port 8080
--- [1640588459:324011] preeny listen called, accepting connections ...
--- [1640588459:324223] preeny connect_write for serverfd=4 started
--- [1640588459:324466] preeny connect succeeds, write for serverfd=4, client sock index=0
--- [1640588459:324778] preeny write a 943 bytes packet, client socket index = 0, client sockfd=5
--- [1640588459:325074] preeny connection for serverfd=4 client sockfd=5 shutdown
--- [1640588459:325151] pthread_created or directly called for preeny_connect_write, accept_done_num 1, selected_fd_index 0  
+++ [1640588459:325246] Intercepted socket()! original type=AF_INET6 fd=6
--- [1640588459:325334] preeny socket bound, Emulating bind on port 8080
--- [1640588459:325393] preeny listen called, accepting connections ...
+++ [1640588459:325488] Intercepted socket()! original type=AF_INET fd=7
--- [1640588459:325725] preeny socket bound, Emulating bind on port 8080
--- [1640588459:325747] preeny listen called, accepting connections ...
+++ [1640588459:325976] Intercepted socket()! original type=AF_INET fd=8
--- [1640588459:326095] preeny socket bound, Emulating bind on port 81       
--- [1640588459:326118] preeny listen called, accepting connections ...      
+++ [1640588459:326480] Intercepted socket()! original type=AF_INET6 fd=9    
--- [1640588459:329767] preeny socket bound, Emulating bind on port 81       
--- [1640588459:329820] preeny listen called, accepting connections ...      
/var/run/httpd.pid: Permission denied
+++ [1640588459:330676] shutting down desockmulti...
+++ [1640588459:330844] ... shutdown complete!
```

It fails on trying to access */var/run/httpd.pid*. We can patch the binary and change the path to something which doesn’t require root privilege to access. This can be done using a hex editor and also with Cutter.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/e7cf333ddf39498b.png)

We can change */var/run/httpd.pid* to */home/ubuntu/h.pid* and save. The new path is located under the home directory and can be accessed without root. It’s also important to note the length of the replacement string must be less than or equal to the original.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c1ec8929efc1b0d0.png)

Rerunning *httpd_patched* we can see it doesn’t show the permission denied error anymore.

```bash
ubuntu@binwalk:~/cisco/_RV130X_FW_1.0.3.55.bin.extracted/squashfs-root/www$ qemu-arm-static -L .. -E USE_RAW_FORMAT=1 -E LD_PRELOAD=../desockmulti.so ../usr/sbin/httpd_patched -p 8080 < ../../base-login-request.txt
===>HTTPD : scheduler set RR with proirity = 99 FAILED
--- [1640594090:533269] accept_num=1, connect_num=0
--- [1640594090:533738] Get pkt, sockindex=0, length=943, pkt[0]=80
+++ [1640594090:533930] Intercepted socket()! original type=AF_INET6 fd=4
--- [1640594090:534277] preeny socket bound, Emulating bind on port 8080
--- [1640594090:534400] preeny listen called, accepting connections ...
--- [1640594090:534562] preeny connect_write for serverfd=4 started
--- [1640594090:534704] preeny connect succeeds, write for serverfd=4, client sock index=0
--- [1640594090:534880] preeny write a 943 bytes packet, client socket index = 0, client sockfd=5
--- [1640594090:535045] preeny connection for serverfd=4 client sockfd=5 shutdown
--- [1640594090:535144] pthread_created or directly called for preeny_connect_write, accept_done_num 1, selected_fd_index 0
+++ [1640594090:535228] Intercepted socket()! original type=AF_INET6 fd=6
--- [1640594090:535283] preeny socket bound, Emulating bind on port 8080
--- [1640594090:535316] preeny listen called, accepting connections ...
+++ [1640594090:535359] Intercepted socket()! original type=AF_INET fd=7
--- [1640594090:535389] preeny socket bound, Emulating bind on port 8080
--- [1640594090:535404] preeny listen called, accepting connections ...
+++ [1640594090:535432] Intercepted socket()! original type=AF_INET fd=8
--- [1640594090:535478] preeny socket bound, Emulating bind on port 81
--- [1640594090:535511] preeny listen called, accepting connections ...
+++ [1640594090:535559] Intercepted socket()! original type=AF_INET6 fd=9
--- [1640594090:535601] preeny socket bound, Emulating bind on port 81
--- [1640594090:535632] preeny listen called, accepting connections ...
--- [1640594090:537111] Accept socket at serverfd=4, got fd=10, accept_sock_num=1.
+++ [1640594090:550073] shutting down desockmulti...
+++ [1640594090:550229] ... shutdown complete!
```

Additionally, the file *h.pid* is created within the user's home directory.

```bash
$ ls -la /home/ubuntu/h.pid
-rw-rw-r-- 1 ubuntu ubuntu 4 Dec 27 08:34 /home/ubuntu/h.pid
```

## Fuzzing httpd

We can now finally proceed to fuzz the patched *httpd* binary. We need to create two directories: *input-httpd* and *output-httpd*. The former will contain the file *base-login-request.txt* which AFL++ will use to generate further test cases.

```bash
ubuntu@fuzz:~/_RV130X_FW_1.0.3.55.bin.extracted/squashfs-root/www$ QEMU_LD_PREFIX=.. QEMU_SET_ENV=USE_RAW_FORMAT=1,LD_PRELOAD=../desockmulti.so ../../../AFLplusplus/afl-fuzz -Q -i ../../input-httpd/ -o ../../output-httpd/ -- ../usr/sbin/httpd_patched -p 8080
```

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4af78d438bd74361.png)

We can leave the fuzzer as is to continue fuzzing. To quit press Ctrl+C anytime. In our brief test, AFL++ wasn’t able to crash the application.

With this, we come to the end of the two-part AFL fuzzing series. In the first part, we saw how to fuzz simple binaries which accepted input from a file. They required no modifications and were straightforward to fuzz. In this part, we learned how to convert a socketed binary to accept input from a file instead. This required patching the binary on an assembly level and using LD_PRELOAD further to override libc functions. We also saw how to use radamsa to generate test cases as a crude way to fuzz. There is no universal technique that can be applied as-is to fuzz any given closed IoT firmware binary. It will vary on a case-by-case basis but the idea is similar. For any comments, questions or suggestions feel free to leave a comment below.
