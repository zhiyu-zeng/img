---
title: Hackropole FCSC 2026 Pwn 全题详解（一）-先知社区
source: https://xz.aliyun.com/news/92557
source_host: xz.aliyun.com
clip_date: 2026-07-27T16:46:08+08:00
trace_id: b89be38a-6624-4e5f-b15b-f7380b151be4
content_hash: 1865ae941799e3124b918e3e3333eeac47677039060fba9314b0847d7f852a97
status: synced
tags: []
series: null
feed_source: 先知安全技术社区
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3aa75244-d011-8104-9213-fe8525784e90
ioc: null
---

前言

Hackropole是由法国国家网络安全局ANSSI维护的安全挑战平台，收录了历届FCSC赛题。笔者完成其中收录的FCSC 2026的12道Pwn题后，发现这些题目整体质量较高，题型也比较新颖，配套环境十分完整，非常适合学习。然而，目前公开题解仍较为零散、简略，且仅覆盖其中少数题目，可检索到的中文资料更是几乎没有。因此，本系列将尽量详细地讲解全部 12 道题的解题思路与具体解法。

考虑到将 12 道题全部放在一篇文章中篇幅过长，本系列将分为上下两篇，本文包含5道题目。

题目链接：

[

https://hackropole.fr/en/pwn/

](https://hackropole.fr/en/pwn/)

autodiag

题目考点

整数符号转换、结构体越界索引、DBus协议帧注入、update包完整性校验缺陷。

题面说

This debug port looks promising.

，附件里给了Docker和源码，并且要求必须通过容器暴露的网络端口交互。服务起来以后，外面连的是

ivi_server

，它收一个自定义IVI协议；里面还有一个

ivi_dbusd

，通过

/run/ivi/bus.sock

提供DBus接口。最终目标是读

/flag.txt

，容器里给了一个setuid root的

/printflag

。

几个主要ELF保护都开得比较全：

ivi_server: Full RELRO, Canary found, NX enabled, PIE enabled

ivi_dbusd: Full RELRO, Canary found, NX enabled, PIE enabled

ivi_update_runner: Full RELRO, Canary found, NX enabled, PIE enabled

所以这题不是拿到一个溢出后直接ROP，而是要顺着服务自己的状态和内部IPC打。

主线

先把利用链放出来，后面逐段解释：

这条链里最关键的转换是：外部TCP协议本来只能往

conn_fds\[idx\]

写数据，但

idx

检查写错以后，可以把写入目标换成

ivi_server

内部已经认证过的DBus socket。后面就不是传统内存劫持，而是借这个socket向DBus服务发合法方法调用。

服务入口和IVI帧

Docker里不是

ivi_server --network

直接监听端口，而是

run.sh

用

socat

包了一层：

所以每次TCP连接都会起一个新的

ivi_server

进程，

ivi_server

从stdin读IVI帧，从stdout写响应。这个进程启动后会连接

/run/ivi/bus.sock

，拿到后面要用的

dbus_sock_fd

。这也是为什么exp只需要一条TCP连接：状态、DBus fd和我们的请求都在同一个

ivi_server

进程里。

IVI协议头固定20字节，小端：

响应也沿用同一个头，只是在body最前面多一个

uint32_t status

。这就是exp里

send_ivi()

做的事：发

MsgHdr||body

，再读回

MsgHdr||status||payload

。

和利用有关的

OP_RESP

body是：

正常语义是把

payload

发到

conn_fds\[conn_id\]

。但我们后面会让

conn_id

越界命中

dbus_sock_fd

，于是

payload

就变成写给DBus总线的裸字节。

从conn_id到dbus_sock_fd

ivi_server

维护的状态结构如下：

MAX_CONN_SLOTS

是10。

conn_fds

是

int\[10\]

，一共40字节，后面紧跟着另一个

int dbus_sock_fd

。

connect_dbus_manager

里会先连

unix:path=/run/ivi/bus.sock

，然后

dbus_bus_register

完成DBus认证和注册，最后用

dbus_connection_get_unix_fd

把底层fd存进

dbus_sock_fd

：

外部能直接触发的是

OP_RESP

：

这里有两个细节：

1

conn_id

按

uint64_t

解析，然后转成

int64_t idx

。

2

检查只有

idx > 9

，没有检查

idx < 0

。

如果只传

\-1

，会访问

conn_fds\[-1\]

，这个方向不一定有用。真正想要的是

conn_fds\[10\]

，因为它就是

dbus_sock_fd

。正常传

10

会被

idx > 9

拦掉，所以需要找一个“按有符号数看是负数，按数组寻址低位看是10”的值：

转成

int64_t

后它是负数，可以过

idx > 9

。而编译后的取fd逻辑是类似：

x86-64有效地址计算是64位wrap的。

0x800000000000000a \* 4 = 0x20000000000000028

，截断到64位后就是

0x28

，也就是40字节。

conn_fds\[10\]

正好在结构体开头后40字节，因此这里读出的

target_fd

就是

dbus_sock_fd

。

于是

OP_RESP

变成了一个很强的primitive：

注意这里不需要劫持返回地址，也不需要知道PIE/libc地址。我们借的是程序自己的内部连接。

为什么DBus消息能拆成多次写

这个点容易跳过去，但它是这题能稳定利用的原因之一。

先明确我们写到的是谁。

dbus_sock_fd

不是

ivi_dbusd

进程的stdin，也不是某个普通文件，而是

ivi_server

作为一个DBus客户端连到bus daemon的Unix socket。

RunUpdate

真正由

ivi_dbusd

处理，bus daemon负责把发往

com.acme.ivi.ServiceManager

的method call路由过去。

这个连接在我们接管前已经是合法DBus连接。

connect_dbus_manager()

里先

dbus_connection_open_private

，再

dbus_bus_register

，也就是libdbus已经完成认证、

BEGIN

、注册到bus这些步骤。我们没有从头伪造一条DBus连接，而是在一个已经进入“正常消息传输阶段”的连接上继续塞method call。

DBus常见传输层是Unix stream socket。stream socket只保证字节顺序，不保留应用层消息边界。也就是说，一条DBus消息可以被一次

write

写完，也可以被拆成多次

write

；接收端看到的只是同一条有序字节流。

OP_RESP

每次调用都会执行一次

send(target_fd, frame, payload_len, 0)

，多次

OP_RESP

最终就是对同一个

dbus_sock_fd

连续写多段bytes。

DBus消息自身有framing。消息开头的固定头部里包含：

bus daemon从socket里读数据时，会先攒够固定头和header fields，然后根据

body length

和

header fields length

算出完整消息长度，再继续读body。只要最终字节流连续且内容合法，中间拆成几段写入不影响解析。拆包发生在传输层，DBus消息边界由DBus自己的长度字段恢复。

这里还有个时序问题：如果我们分块发，第一块到达bus daemon以后可能只是一条不完整DBus消息。这个没有关系，bus daemon会继续在同一个stream上等后面的字节。

ivi_server

对每个

OP_RESP

都会给我们回一个IVI响应，这个响应走的是TCP stdout，不会写进DBus fd，所以不会污染DBus消息流。

OP_RESP

本身每次最多发0x800字节：

所以exp里把DBus帧按0x800切开，多次调用

OP_RESP

。本题最终

RunUpdate

帧长度只有一千多字节，其实一次写也够，分块是为了让脚本对payload长度变化更稳。只要所有块按顺序写入同一个

dbus_sock_fd

，bus daemon看到的就是一条完整method call。

还有一点：我们不靠DBus reply拿flag。

RunUpdate

方法会返回字符串，但这条调用是我们绕过libdbus对象直接写到底层fd的，

ivi_server

没有通过

dbus_connection_send_with_reply_and_block

等待这个serial。reply即使回到这个DBus连接，也不一定能通过IVI协议返回给我们。利用里只把DBus当触发器，flag由payload主动回连带出来。

构造RunUpdate调用

DBus服务里可用的方法不少，和执行有关的是

RunUpdate

：

run_update

会fork执行

/opt/ivi/bin/ivi_update_runner

，参数就是base64字符串：

所以DBus帧需要表达的是：

对应到DBus header field code就是：

消息开头四个字节在exp里写成：

含义分别是小端、message type为method call、flags为0、protocol version为1。后面接

body length

、

serial

、

header fields length

。

serial

不需要和libdbus内部计数同步，只要这条连接上没有依赖这个serial的等待逻辑即可；我们刚做完一次

OP_HEALTHCHECK

，它会同步等自己的DBus Ping返回，之后没有pending call，所以这里用一个固定值就够了。

DBus里字符串编码是

u32 len || bytes || NUL

，signature是

u8 len || bytes || NUL

。header fields是一个array of struct，每个field struct按8字节对齐，variant内部还要按被包裹类型的alignment补padding。整个header结束后也要补到8字节对齐，再接body。这里没有必要实现完整DBus库，只要把本题用到的

object path/string/signature

几种类型编码对即可。

我这里用

dbus-send

配合

strace

抓过一条真实

RunSelfTest(string)

调用对照，确认字段顺序和padding没有问题。EXP里的

dbus_method_call_one_string()

就是这个格式的最小实现。

update包伪造

继续看

ivi_update_runner

：

update格式可以整理成：

签名检查是：

也就是说签名只覆盖

header

，不覆盖

key_blob

，更不覆盖

ciphertext

。另外这里不是标准RSA签名验签，也没有PKCS#1 padding检查，只是做了一次

S^e mod n

以后拿明文前32字节比较hash。

AES key的处理也类似：

这里的关键是

rsa_public_raw

只需要公钥。它没有做“只有私钥才能解”的操作，而是直接算

blob^e mod n

。public key和现有合法

update.bin

都在附件里，所以我们可以对原

key_blob

做完全相同的运算，把runner后续会使用的AES key算出来。

到这里不需要伪造签名，也不需要修改header。直接复用原来的

header||sig||key_blob

，只替换最后的

ciphertext

：

签名仍然过，因为header没变。key也仍然对，因为key blob没变。密文没被认证，所以解出来就是我们的gzip ELF。AES模式是AES-256-CBC，IV固定全0，padding是PKCS#7；解密后还要

gunzip_all

，所以payload要先gzip再加密。

大小约束也要看一下。DBus的

RunUpdate

参数最多256KiB，IVI单个请求body最多64KiB，

OP_RESP

单次写DBus最多0x800字节。我们的ELF gzip后很小，base64后的update也只有一千多字节，完全在限制内。如果换成更大的payload，DBus消息可以继续按0x800分块写；每个

OP_RESP

请求的body保持在协议限制内即可，完整DBus消息不需要落在单个IVI请求里。

解密后进入

exec_payload_memfd

：

这里会直接执行解出来的ELF。runner的euid是

nobody

，不是root，但

/printflag

是setuid root，所以payload只需要执行

/printflag

并把输出带出来。

为什么payload要自己回连？因为

run_update

本来会捕获runner的stdout/stderr并作为DBus返回值返回，但这条DBus调用不是通过

ivi_server

的正常RPC路径发出去的，我们没有一个IVI op能读到这次method return。让payload先

connect(callback_host, callback_port)

，再

dup2

到stdout/stderr，最后

execve("/printflag")

，flag就从我们的监听socket回来，不依赖DBus reply。

EXP

完整exp如下。这是实际使用的

autosolve/artifacts/exploit.py

版本，所以脚本里用

parents\[2\]

取题目根目录。默认打本机

127.0.0.1:4000

，如果本地把容器4000映射到了其他端口，改

\--target-port

即可。

\--callback-host

需要填容器能连到的宿主机地址，Docker默认bridge下一般是

172.17.0.1

。

结果

本地用官方Docker服务打通，回连里能收到

/printflag

输出：

Spidersaurus Rex

题目给的是一个很老的SpiderMonkey，加了一个“未来JIT”的补丁。提示已经很直白：

what happens if a function contains 65536 variables?

最终利用链是：

1

构造一个含65536个局部变量的函数，让

JSFunction.nvars

从

uint16

回绕到0。

2

编译阶段仍然给这些变量生成16位slot操作数，执行阶段却按0个局部变量分配frame。

3

JSOP_SETVAR

变成相对

fp->vars

的越界写。

4

用越界写改一个普通对象的

JSSLOT_CLASS

，伪造

JSClass.convert

。

5

shellcode放进早期heap中的JS字符串，由题目里的

mprotect(..., -1, RWX)

获得可执行权限。

6

调用被改坏的对象，

js_Invoke

走

clasp->convert

，跳到shellcode读

flag.txt

。

题目要求必须通过Docker暴露出来的TCP端口交互，并且发送完JS以后要

shutdown(SHUT_WR)

触发执行。这个要求会影响heap布局，所以后面的offset都按TCP/stdin模式调。

nvars回绕

先看函数结构体：

nvars

只有16位。声明局部变量时，parser给当前变量分配slot：

这里的关键不是“最终

fun->nvars

是多少”，而是“每个变量声明时拿到的slot是多少”。如果变量名互不重复，

v0

到

v65535

会依次拿到slot

0..65535

，第65536次自增之后

fun->nvars

才回绕成0。

代码生成阶段也没有再按最终

nvars

截断。

TOK_NAME

如果有

pn_slot

，直接把slot作为两字节操作数写进bytecode：

解释器取局部变量slot也是读这两个字节：

所以

nvars

回绕以后，仍然能有

getvar/setvar 0xffff

这种带16位slot的字节码。回绕只影响运行时frame怎么分配，不会抹掉已经存在于parse tree和bytecode里的slot立即数。

执行函数时，

js_Invoke

把

fun->nvars

复制到frame：

回绕后

frame.nvars=0

，不会为局部变量分配空间。但

JSOP_SETVAR

仍然信任bytecode里的slot：

PR_ASSERT

在发布构建里不是有效防线，于是

v2048=...

、

v2050=...

这类赋值就变成了从

fp->vars

往后的四字节写。

从越界写到convert

SpiderMonkey的对象结构很小：

对象创建时，class指针存在

slots\[2\]

：

取class时会把最低位tag清掉：

而

JSClass

里

convert

字段在偏移

0x20

：

js_Invoke

调用一个对象时，如果它的class不是

js_FunctionClass

，会尝试把它convert成函数：

这就给了一个很干净的劫持点：把普通对象

g

的

slots\[2\]

改成伪造

JSClass

，再把伪造class的

convert

填成shellcode入口，最后执行

g()

。

payload里把

g={}

放在漏洞函数内部创建，但

g

本身是全局变量：

这样做有两个好处。第一，

g.slots

会落在

fp->vars

后面固定距离，能被局部变量OOB写到。第二，

f()

返回以后全局

g

还活着，后面调用

g()

时被污染的slots不会被回收。

TCP/stdin模式下调出来的稳定布局是：

所以

g.slots-vars=0x2000

。要写

g.slots\[2\]

，目标地址是

g.slots+8

，对应slot：

也就是写

v2050

。

伪造的

JSClass

直接放在

g.slots+0x100

。

convert

偏移

0x20

，所以写

fake_class->convert

的目标是：

对应slot：

也就是先写

v2120=shell_entry

，再写

v2050=PRIVATE_TO_JSVAL(fake_class)

。

JSVAL的低位限制

这里不能忽略JSVAL编码。32位JSVAL的整数和private pointer都是靠最低位区分：

越界写来自JS里的整数赋值，解释器实际写进内存的是

INT_TO_JSVAL(i)

，所以能直接写出的raw dword最低位必须是1。EXP里的转换函数就是做这个反变换：

这个限制正好也符合

JSSLOT_CLASS

的格式：slot里应该放

PRIVATE_TO_JSVAL(fake_class)

，也就是

fake_class|1

，

OBJ_GET_CLASS

会在使用时清掉最低位。

真正麻烦的是

convert

函数指针。

clasp->convert

不是JSVAL，调用时不会清tag，所以写进去的raw值就是CPU要跳的地址。因为我们只能写奇数raw dword，shellcode入口也必须是奇数地址。解决办法是在JS字符串开头放一个填充字节，shellcode从

chars+1

开始执行。

shellcode放哪里

补丁里有这段：

mprotect

第二个参数是

size_t

，32位下

\-1

会变成

0xffffffff

。起点是

JIT_buffer

所在heap页，长度巨大；在这道题的运行环境里，内核会从这个heap页开始处理后面的映射，前面已经处理过的heap VMA会变成

rwxp

。即使后面遇到空洞导致调用不能覆盖完整区间，程序也没有检查返回值。实际调

maps

能看到早期heap是

rwxp

，后来

brk

继续长出来的heap页仍然是

rw-p

。

这也是为什么不能直接把shellcode放在

g.slots

附近。

g

是在读入大段JS源码、解析、建函数之后才分配的，位置已经在后面那段

rw-p

heap里，跳过去会因为NX崩掉。

题目提示还说JS字符串可以包含任意二进制，例如

邐邐

。

JSString

结构如下：

字符串拷贝会先用

JS_malloc

分配

chars

，再复制内容：

把shellcode放在全局字符串

var sc="..."

里，

chars

会落在早期heap的可执行区域，并且全局变量会让它活到

g()

触发时。最终采用的入口是：

这里的

+1

就是前面说的JSVAL奇数限制。

offset的定位依据

题目本身在启动后调用了一次

GC

，补丁会打印当前

sbrk(0)

：

所以每次TCP连接开始都有一个heap基准，例如最终打通时stdout开头是：

break+0xc825c0

是用

JSOP_SETVAR

里的调试输出定位的。补丁在slot0赋值时打印

&fp->vars\[0\]

：

在同样的TCP/stdin输入模式下加一次

v0=...

探针，可以直接得到

fp->vars

，换算成

break+0xc825c0

。

break+0xc845c0

来自

js_Invoke

的非函数调用调试输出。补丁在

clasp!= &js_FunctionClass

时打印：

最终触发

g()

时stderr里能看到：

结合

break=0x6340d000

：

最后一行

E789C031

是

\*(uint32_t \*)clasp->convert

。内存字节是

31 c0 89 e7

，正好是shellcode开头，说明convert已经跳到字符串

chars+1

，不是跳进了

g.slots

那段不可执行heap。

EXP

下面EXP只依赖官方TCP交互模式。默认连

127.0.0.1:4000

，如果本地映射了其他端口，用

\--port

改一下即可。

打通后输出：

Flag：

wsd

题目概况

题目给了一个很小的WebSocket server，要求通过Docker暴露出来的端口读

/app/flag.txt

。源码也给了，所以重点不在逆向，而在把WebSocket状态机和glibc堆状态接起来。

保护如下：

Partial RELRO后面会用到，

.got.plt

可写。PIE、libc和栈都要leak。

漏洞根因

先看session结构：

创建session时只初始化了

state

：

frag_opcode

、

frag_len

、

frag_buf

全部是未初始化字段。这个bug本身还不够，还要让这块新malloc出来的session里残留我们可控的数据。

HTTP握手失败时，程序会解析请求头，header value由堆分配保存。握手失败以后这些header会被释放，但连接不会断，可以继续读下一次HTTP请求。于是流程可以做成：

1

第一次发非法握手，带几个特定大小、特定内容的header，让对应tcache bin里留下可控chunk。

2

同一条连接第二次发合法握手，程序调用

ws_session_create()

，

malloc(sizeof(struct ws_session))

从刚才的tcache里拿chunk。

3

因为只写了

state

，后面的fragment字段继承旧header value。

ws_session

大小是0x20。header value里放：

复用为session后，前8字节被

state=0

覆盖，

frag_opcode

对应旧数据，

frag_len

刚好变成

\-0x10

，

frag_buf

在我们使用的布局里为

NULL

或后面再覆盖成

NULL

。

真正的越界发生在continuation处理：

如果

frag_len=-0x10

，

frag_buf=NULL

，发一个非空continuation：

这样就能从新chunk前面0x10字节开始写。写的位置正好覆盖chunk header，所以不能乱写。利用时先写一个合法header，例如：

这样后面分配/释放不至于马上因为chunk metadata坏掉而abort。

从underwrite到AAR

有了heap underwrite以后，下一步是把它变成“可改session字段”。这里不是PONG分支本身会改session，而是利用

ws_parse_frame()

在进入业务逻辑前会先为非空payload分配一块堆内存：

前面

make_fake_90()

做的事，是用

frag_len=-0x10

制造一次underwrite，把刚分配出来的小chunk header改成

size=0x91

：

这次continuation结束时，程序会

free(session->frag_buf)

。由于chunk header已经被改成

0x91

，这块内存会被当成0x90 chunk放进tcache。后面如果发一个payload长度为0x80的PONG，

ws_parse_frame()

会先

malloc(0x80)

，刚好从0x90 tcache里取回这块fake chunk，然后把PONG payload拷进去。

在当前固定握手布局下，这块fake chunk的用户区距离

ws_session

是0x50。于是PONG payload里

0x50

偏移处的内容会覆盖session字段：

这里写的四个qword分别对应：

frag_opcode=1

只是让最终echo走TEXT opcode，方便收包。这里的

0x50

不是拍脑袋来的，它来自这轮堆布局：

malloc(0x80)

取回的fake 0x90 chunk在session前面，用户区到session起始正好差0x50；覆盖后用空continuation读任意地址能稳定验证这个偏移。

AAR的关键是空continuation。把session改成：

然后发一个

payload_len=0

且

FIN=1

的continuation。因为

payload_len==0

，上面的

if (frame->payload_len > 0)

整个跳过，不会执行

realloc

，也不会改

frag_buf/frag_len

。随后进入

if (frame->fin)

，程序直接：

也就是从

addr

读

size

字节发回来。回显后它会

free(session->frag_buf)

，所以读非堆地址时这条连接一般会崩，但server是fork模型，父进程不死，拿到response就够了。

代码上就是：

这个primitive是后面所有leak的基础。

leak链

heap

heap leak用safe-linking的编码形式。把session改成：

再发一个一字节continuation。这次

payload_len>0

，所以会走

realloc(NULL, 0x38)

，也就是拿一个0x40大小的tcache chunk。由于前面堆里有释放过的同size chunk，回显出来的开头能看到tcache entry里safe-linked的

next

。

glibc safe-linking是：

当

next=NULL

时，stored就是

chunk_addr >> 12

。所以拿到第一个qword后：

这里得到的是heap page base，后面所有

tcache_perthread_struct

附近的固定偏移都从这个page算。

libc

libc leak来自unsorted bin。第一次非法握手里放一个比较大的header：

释放后它不会进小tcache bin，而是在heap上留下main arena附近的fd/bk指针。利用AAR从heap page附近按0x100扫，找高位像libc的qword，然后用本题给的libc验证ELF magic。

脚本里用的偏移是：

这里不要把它理解成通用glibc常量。它是本题

libc-2.41.so

里实际泄漏出来的arena相关指针到libc base的距离。算完以后必须读

libc_base

前4字节确认是

ELF

，否则heap里碰到一个形似libc地址的值就会误判。

PIE

有libc以后先读

environ

：

environ

给了当前子进程的栈地址。栈上除了返回地址，还有auxv。程序是PIE，auxv里的

AT_PHDR

指向主程序的program header。脚本从

environ

附近向下按0x100扫，找：

找到后：

0x40

是这个ELF里program header相对PIE base的偏移。算完同样读PIE base确认ELF magic。

返回地址

最终要打栈，光有栈地址还不够，要知道当前处理WebSocket frame时的返回槽。这个偏移不是从源码直接看出来的，因为和编译选项、调用层级、当前函数栈帧都有关。

做法是用AAR读

environ

附近的栈内容，再结合反汇编确认。栈上能看到：

反汇编里

0x16cc

正好是

server_handle_client()

中：

也就是

ws_on_data()

返回后的下一条指令。于是最终用：

后面把ROP写到这里，等当前

ws_on_data()

处理完frame返回时触发。

AAW和控制流劫持

有AAR之后，地址都齐了。接下来要做AAW。这里还是利用负

frag_len

，不过目标从“改session字段”变成“改tcache freelist”。

非法握手阶段额外准备两组chunk：

这里的

0x50

、

0x70

是glibc chunk size，不是header value长度。还要注意HTTP header value是通过字符串保存的，实际

malloc

大小包含末尾NUL。比如

X-50

的value长度是56，

strdup

实际request是57：

X-70

的value长度是88，加上NUL以后实际request是89：

后面WebSocket frame payload就没有这个NUL了，所以88字节PING payload本身不会进0x70，这也是第二阶段初版失败的原因。准备三个chunk是因为后面同一个bin里会有连续的

realloc(NULL,new_len)

、parser payload malloc、PONG output malloc等分配，不能只有一个entry。

这轮布局里用到的几个用户指针偏移如下：

这些偏移不是ELF里的静态符号，而是由本题固定的HTTP header分配顺序得到的堆布局。heap base通过safe-linking先leak出来，所以实际地址仍然是动态计算。

Stage 1：把free@GOT改成ret

第一阶段poison 0x50 bin，使

ws_send_frame()

里的输出buffer分配到

free@GOT

：

这里

t1_50=heap+0x8d0

是被覆盖fd的0x50 tcache entry用户指针。具体分配顺序是：

tcache poisoning要写safe-linked next，所以写：

按直觉会想把

free@GOT

写成

system

，但这题不适合直接这么做。

ws_send_frame()

构造WebSocket回包时会先写frame header：

PONG的opcode是0xa，所以如果

frame_buf=free@GOT

，

free@GOT

前两个字节一定会被写成：

因此我在libc里找一个满足条件的

ret

gadget：

这样WebSocket header本身就是目标地址低两字节，payload从第三字节开始补剩下6字节。随后发PING时，两个0x50分配正好消耗这条链：

最终效果是：

为什么要先写

free=ret

？因为后面会让

ws_send_frame()

的

frame_buf

落到GOT或栈上，函数末尾会

free(frame_buf)

。如果

free

还是正常glibc free，释放非heap地址必炸；改成

ret

以后这些free都变成空操作。

还有一个细节：

write@GOT

在

free@GOT+0x20

，这次payload可能覆盖到

write@GOT

。如果

write

坏了，PONG和flag都发不回来。所以stage 1 payload顺手把

write@GOT

恢复：

Stage 2：把PONG写到返回地址

第二阶段poison 0x70 bin，目标是栈返回槽前8字节：

这里

t1_70=heap+0xa40

同样是被覆盖fd的0x70 tcache entry。前面的poison过程和0x50 bin一样，只是换成0x70：

目标设成

stack_ret-8

，是因为PONG输出有2字节header，payload前面再垫6字节，刚好从

stack_ret

开始放ROP：

这一步最容易错的是size class。初版用88字节PING时可以收到PONG，但ROP不会执行。原因是同一轮会发生两类malloc：

1

ws_parse_frame()

先

malloc(frame->payload_len)

保存客户端payload；

2

ws_send_frame()

再

malloc(2 + frame->payload_len)

构造PONG。

如果payload是88字节：

parser payload不消耗0x70 tcache head，PONG只拿到第一个真实0x70 chunk，还没轮到poisoned target。

修正后使用96字节PING：

这样parser payload先消耗第一个0x70 chunk，PONG output才会拿到poisoned target。对应地，前面做poison的continuation也要让

realloc(NULL,new_len)

落到0x70 bin：

最终ROP：

ret

用于栈对齐，

\>&4

是因为子进程里client socket fd稳定为4。

完整EXP

脚本假设目录结构和附件一致：

wsd/wsd

、

wsd/libc-2.41.so

在当前目录下，服务监听在

127.0.0.1:4000

。如果端口不同，用环境变量

PORT

指定。

运行：

如果本地映射端口不是4000：

Flag

netsec

题目给了源码和官方Docker环境，kernel是

Linux 6.18.7

，挑战服务不在用户态程序本身，而是在一个netfilter模块里。模块拦截发往

1337

端口的TCP流量，对payload做XOR处理；真正监听

1337

的用户态服务只是

nc -knlp 1337 -e /bin/cat

。

主线如下：

模块逻辑

模块创建了一个名为

netsec

的

kmem_cache

，对象大小就是

struct sec_conn

的大小，也就是

0x20

。

初始化时：

in_key

由固定服务端口

1337

生成。每条连接还有一个

out_key

，由客户端source port生成。

连接表只有

0x100

项：

索引是IP和端口各字节异或后的低8bit：

收包方向

hook_in

处理发往

1337

的数据。SYN创建连接，FIN销毁连接，普通payload会取出

sec_conn

，把payload拷进

sconn->buf

，再用

sconn->in_key

异或：

发包方向

hook_out

处理从

1337

发出的数据，也就是

cat

回显出来的内容。这里同样会取

sconn->buf

，不过XOR key换成了

sconn->out_key

：

所以一次正常交互是：

in_key

和

out_key

的KDF都在源码里，两个key都能在用户态算出来。后面伪造结构体时，需要提前把这两层XOR抵消掉。

hash collision和UAF

创建连接时，模块会申请两个

netsec

cache对象：

记作：

正常一条连接会有

Sx

和

Kx

两个

0x20

对象。

销毁连接时：

这里释放了

out_key

和

sconn

，但是没有清

hash_table\[h\]

。另外，

get_sec_conn()

只按hash取bucket，不检查完整

ip,port

：

于是只要找两个同hash的source port即可：

实际使用：

到这里，

p1

是一条还活着的TCP连接，但模块查表时拿到的是已经释放的

S2

。

泄漏slab地址

get_sec_conn_buf()

决定了后面怎么做heap feng shui：

CACHE_SIZE=0x20

，所以：

第一步发

0x28

，故意走

kmalloc(0x28)

，不马上占回

netsec

对象。此时dangling

S2

里还残留着旧字段，尤其是旧

out_key

指针。

K2

已经free，里面会有allocator留下的元数据。因为回显路径会用旧

out_key

对输出做XOR，反过来消掉已知key后就能拿到一个heap/slab附近的地址。

一次运行里泄漏结果如下：

这个leak的作用有两个：一是提供可用scratch区域，二是给后续读写模块全局和放置字符串/shellcode提供可控的内核堆地址参考。

从UAF到AAR/AAW

真正关键的是

sec_conn

四个字段的语义：

如果能把freed

S2

对应的

netsec

cache对象重占成可控内容，dangling路径就会把这

0x20

字节解释成新的

sec_conn

。由于协议会经过

hook_in

和

hook_out

两次XOR，写入fake structure前要先把两层key预先异或掉：

AAR

任意读时伪造：

然后通过dangling连接发送8个
