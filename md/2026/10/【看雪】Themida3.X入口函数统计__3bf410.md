---
title: 【看雪】Themida3.X入口函数统计
source: https://bbs.kanxue.com/thread-293384.htm
source_host: bbs.kanxue.com
clip_date: 2026-10-31T23:04:29+08:00
trace_id: 54b11bed-e5b5-422c-9910-3db14449577f
content_hash: 37be9064005f09dfa0d9f0fa8e12c17af3ddfa02c69c50cb73a80acdd2f6206d
status: synced
tags:
  - 看雪
  - Windows逆向
  - 脱壳与加固
series: null
feed_source: 看雪·逆向工程
ai_summary: Themida 3.x 的 VM 函数入口可通过 pushfq 后紧邻的大操作数 [rsp] 运算指令识别，脚本在该样本中统计出 3206 个 VM 入口。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40a75244-d011-8128-9832-dd301e2cf386
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Themida 3.x 的 VM 函数入口可通过 pushfq 后紧邻的大操作数 [rsp] 运算指令识别，脚本在该样本中统计出 3206 个 VM 入口。
> 
> - **样本与解壳流程：** ExeinfoPE 判定样本为 x64 Themida - Winlicense v3.0.0.0-3.2.4.0（PACKED 模式）；程序入口经 call 进入基于 APLib 算法的内存解压缩例程（DeMem）完成解压。
> - **VM 入口特征：** 每个 Themida VM 函数入口以 pushfq（字节 0x9C）开始，执行 API 调用（如 GetModuleHandleA、LoadLibraryA）返回后会退出到下一个 VM 入口，形成链式跳转。
> - **模式规则：** 入口附近存在对 [rsp] 的 64 位运算，操作数很大，并伴随对 rsp 的 add/sub 调整，形态如 add/sub/xor/mov qword ptr [rsp], 大立即数。
> - **Dump 与脚本方法：** 因未找到 OEP，Dump 时采用 OptionalHeader.AddressOfEntryPoint 作为入口；Python 脚本扫描 0x9C 字节，用 pefile 判断地址是否落在 .themida 节，再用 capstone 按规则匹配。
> - **统计结果：** 65599 个候选 0x9C 字节中规则初筛命中 3389 条，去重后得 3206 个 VM 入口（命中率 4.89%，剔除重复/解码错位 183 条）；指令分布 mov=915、xor=807、sub=744、add=739、adc=1，与 pushfq 的距离 min=0x2、max=0x58、均值 40.7。

样本：超级硬盘数据恢复软件(x64) 10.5.0.0  
ExeinfoPE:x64 Themida - Winlicense v3.0.0.0 - 3.2.4.0 \[ PACKED mode \] - http://www.oreans.com \[ Win Vista \], Overlay: 223637... Nothing detected  
  
Themida加壳程序入口，Themida基于APLib算法对程序进行解压缩

0000000142B62058 | E8 82010000 | call superrecovery_x64.142B621DF | OptionalHeader.AddressOfEntryPoint

{

0000000142B621DF | 58 | pop rax |  
0000000142B621E0 | 53 | push rbx |  
0000000142B621E1 | 51 | push rcx |  
0000000142B621E2 | 52 | push rdx | rdx:EntryPoint  
0000000142B621E3 | 56 | push rsi |  
0000000142B621E4 | 57 | push rdi |  
0000000142B621E5 | 55 | push rbp |  
0000000142B621E6 | 48:89C3 | mov rbx,rax |  
0000000142B621E9 | 48:83EB 05 | sub rbx,5 |  
0000000142B621ED | B9 58804B02 | mov ecx,24B8058 |  
0000000142B621F2 | 48:29CB | sub rbx,rcx |  
0000000142B621F5 | 50 | push rax |  
0000000142B621F6 | B8 DABC6A01 | mov eax,16ABCDA |  
0000000142B621FB | 48:01D8 | add rax,rbx |  
0000000142B621FE | 8338 00 | cmp dword ptr ds:\[rax\],0 |  
0000000142B62201 | 74 03 | je superrecovery_x64.142B62206 |  
0000000142B62203 | 58 | pop rax |  
0000000142B62204 | EB 32 | jmp superrecovery_x64.142B62238 |  
0000000142B62206 | 58 | pop rax |  
0000000142B62207 | B9 F0010000 | mov ecx,1F0 |  
0000000142B6220C | 83E9 05 | sub ecx,5 |  
0000000142B6220F | 48:01C1 | add rcx,rax |  
0000000142B62212 | 53 | push rbx |  
0000000142B62213 | 48:89CE | mov rsi,rcx |  
0000000142B62216 | 48:89DF | mov rdi,rbx |  
0000000142B62219 | 8A0E | mov cl,byte ptr ds:\[rsi\] |  
0000000142B6221B | 48:FFC6 | inc rsi |  
0000000142B6221E | 84C9 | test cl,cl |  
0000000142B62220 | 74 15 | je superrecovery_x64.142B62237 |  
0000000142B62222 | 51 | push rcx |  
0000000142B62223 | 50 | push rax |  
0000000142B62224 | 57 | push rdi |  
0000000142B62225 | 6A 00 | push 0 |  
0000000142B62227 | 57 | push rdi |  
0000000142B62228 | 6A 00 | push 0 |  
0000000142B6222A | 56 | push rsi |  
0000000142B6222B | FFD0 | call rax | 基于APLIB的内存解压缩DeMem  
{  
0000000142B6205D | 41:52 | push r10 |  
0000000142B6205F | 49:89E2 | mov r10,rsp |  
0000000142B62062 | 41:52 | push r10 |  
0000000142B62064 | 49:8B72 10 | mov rsi,qword ptr ds:\[r10+10\] |  
0000000142B62068 | 49:8B7A 20 | mov rdi,qword ptr ds:\[r10+20\] |  
0000000142B6206C | FC | cld |  
0000000142B6206D | B2 80 | mov dl,80 |  
0000000142B6206F | 8A06 | mov al,byte ptr ds:\[rsi\] |  
0000000142B62071 | 48:FFC6 | inc rsi |  
0000000142B62074 | 8807 | mov byte ptr ds:\[rdi\],al |  
0000000142B62076 | 48:FFC7 | inc rdi |  
0000000142B62079 | BB 02000000 | mov ebx,2 |  
0000000142B6207E | 00D2 | add dl,dl |  
0000000142B62080 | 75 07 | jne superrecovery_x64.142B62089 |  
0000000142B62082 | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62084 | 48:FFC6 | inc rsi |  
0000000142B62087 | 10D2 | adc dl,dl |  
0000000142B62089 | 73 E4 | jae superrecovery_x64.142B6206F |  
0000000142B6208B | 00D2 | add dl,dl |  
0000000142B6208D | 75 07 | jne superrecovery_x64.142B62096 |  
0000000142B6208F | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62091 | 48:FFC6 | inc rsi |  
0000000142B62094 | 10D2 | adc dl,dl |  
0000000142B62096 | 73 5E | jae superrecovery_x64.142B620F6 |  
0000000142B62098 | 31C0 | xor eax,eax |  
0000000142B6209A | 00D2 | add dl,dl |  
0000000142B6209C | 75 07 | jne superrecovery_x64.142B620A5 |  
0000000142B6209E | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B620A0 | 48:FFC6 | inc rsi |  
0000000142B620A3 | 10D2 | adc dl,dl |  
0000000142B620A5 | 0F83 02010000 | jae superrecovery_x64.142B621AD |  
0000000142B620AB | 00D2 | add dl,dl |  
0000000142B620AD | 75 07 | jne superrecovery_x64.142B620B6 |  
0000000142B620AF | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B620B1 | 48:FFC6 | inc rsi |  
0000000142B620B4 | 10D2 | adc dl,dl |  
0000000142B620B6 | 11C0 | adc eax,eax |  
0000000142B620B8 | 00D2 | add dl,dl |  
0000000142B620BA | 75 07 | jne superrecovery_x64.142B620C3 |  
0000000142B620BC | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B620BE | 48:FFC6 | inc rsi |  
0000000142B620C1 | 10D2 | adc dl,dl |  
0000000142B620C3 | 11C0 | adc eax,eax |  
0000000142B620C5 | 00D2 | add dl,dl |  
0000000142B620C7 | 75 07 | jne superrecovery_x64.142B620D0 |  
0000000142B620C9 | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B620CB | 48:FFC6 | inc rsi |  
0000000142B620CE | 10D2 | adc dl,dl |  
0000000142B620D0 | 11C0 | adc eax,eax |  
0000000142B620D2 | 00D2 | add dl,dl |  
0000000142B620D4 | 75 07 | jne superrecovery_x64.142B620DD |  
0000000142B620D6 | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B620D8 | 48:FFC6 | inc rsi |  
0000000142B620DB | 10D2 | adc dl,dl |  
0000000142B620DD | 11C0 | adc eax,eax |  
0000000142B620DF | 74 09 | je superrecovery_x64.142B620EA |  
0000000142B620E1 | 57 | push rdi |  
0000000142B620E2 | 89C0 | mov eax,eax |  
0000000142B620E4 | 48:29C7 | sub rdi,rax |  
0000000142B620E7 | 8A07 | mov al,byte ptr ds:\[rdi\] |  
0000000142B620E9 | 5F | pop rdi |  
0000000142B620EA | 8807 | mov byte ptr ds:\[rdi\],al |  
0000000142B620EC | 48:FFC7 | inc rdi |  
0000000142B620EF | BB 02000000 | mov ebx,2 |  
0000000142B620F4 | EB 88 | jmp superrecovery_x64.142B6207E |  
0000000142B620F6 | B8 01000000 | mov eax,1 |  
0000000142B620FB | 00D2 | add dl,dl |  
0000000142B620FD | 75 07 | jne superrecovery_x64.142B62106 |  
0000000142B620FF | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62101 | 48:FFC6 | inc rsi |  
0000000142B62104 | 10D2 | adc dl,dl |  
0000000142B62106 | 11C0 | adc eax,eax |  
0000000142B62108 | 00D2 | add dl,dl |  
0000000142B6210A | 75 07 | jne superrecovery_x64.142B62113 |  
0000000142B6210C | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B6210E | 48:FFC6 | inc rsi |  
0000000142B62111 | 10D2 | adc dl,dl |  
0000000142B62113 | 72 E6 | jb superrecovery_x64.142B620FB |  
0000000142B62115 | 29D8 | sub eax,ebx |  
0000000142B62117 | BB 01000000 | mov ebx,1 |  
0000000142B6211C | 75 2E | jne superrecovery_x64.142B6214C |  
0000000142B6211E | B9 01000000 | mov ecx,1 |  
0000000142B62123 | 00D2 | add dl,dl |  
0000000142B62125 | 75 07 | jne superrecovery_x64.142B6212E |  
0000000142B62127 | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62129 | 48:FFC6 | inc rsi |  
0000000142B6212C | 10D2 | adc dl,dl |  
0000000142B6212E | 11C9 | adc ecx,ecx |  
0000000142B62130 | 00D2 | add dl,dl |  
0000000142B62132 | 75 07 | jne superrecovery_x64.142B6213B |  
0000000142B62134 | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62136 | 48:FFC6 | inc rsi |  
0000000142B62139 | 10D2 | adc dl,dl |  
0000000142B6213B | 72 E6 | jb superrecovery_x64.142B62123 |  
0000000142B6213D | 56 | push rsi |  
0000000142B6213E | 48:89FE | mov rsi,rdi |  
0000000142B62141 | 48:29EE | sub rsi,rbp |  
0000000142B62144 | F3:A4 | rep movsb |  
0000000142B62146 | 5E | pop rsi |  
0000000142B62147 | E9 32FFFFFF | jmp superrecovery_x64.142B6207E |  
0000000142B6214C | FFC8 | dec eax |  
0000000142B6214E | C1E0 08 | shl eax,8 |  
0000000142B62151 | 8A06 | mov al,byte ptr ds:\[rsi\] |  
0000000142B62153 | 48:FFC6 | inc rsi |  
0000000142B62156 | 89C5 | mov ebp,eax |  
0000000142B62158 | B9 01000000 | mov ecx,1 |  
0000000142B6215D | 00D2 | add dl,dl |  
0000000142B6215F | 75 07 | jne superrecovery_x64.142B62168 |  
0000000142B62161 | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62163 | 48:FFC6 | inc rsi |  
0000000142B62166 | 10D2 | adc dl,dl |  
0000000142B62168 | 11C9 | adc ecx,ecx |  
0000000142B6216A | 00D2 | add dl,dl |  
0000000142B6216C | 75 07 | jne superrecovery_x64.142B62175 |  
0000000142B6216E | 8A16 | mov dl,byte ptr ds:\[rsi\] |  
0000000142B62170 | 48:FFC6 | inc rsi |  
0000000142B62173 | 10D2 | adc dl,dl |  
0000000142B62175 | 72 E6 | jb superrecovery_x64.142B6215D |  
0000000142B62177 | 3D 007D0000 | cmp eax,7D00 |  
0000000142B6217C | 73 1D | jae superrecovery_x64.142B6219B |  
0000000142B6217E | 3D 00050000 | cmp eax,500 |  
0000000142B62183 | 72 11 | jb superrecovery_x64.142B62196 |  
0000000142B62185 | FFC1 | inc ecx |  
0000000142B62187 | 56 | push rsi |  
0000000142B62188 | 48:89FE | mov rsi,rdi |  
0000000142B6218B | 48:29C6 | sub rsi,rax |  
0000000142B6218E | F3:A4 | rep movsb |  
0000000142B62190 | 5E | pop rsi |  
0000000142B62191 | E9 E8FEFFFF | jmp superrecovery_x64.142B6207E |  
0000000142B62196 | 83F8 7F | cmp eax,7F |  
0000000142B62199 | 77 03 | ja superrecovery_x64.142B6219E |  
0000000142B6219B | 83C1 02 | add ecx,2 |  
0000000142B6219E | 56 | push rsi |  
0000000142B6219F | 48:89FE | mov rsi,rdi |  
0000000142B621A2 | 48:29C6 | sub rsi,rax |  
0000000142B621A5 | F3:A4 | rep movsb |  
0000000142B621A7 | 5E | pop rsi |  
0000000142B621A8 | E9 D1FEFFFF | jmp superrecovery_x64.142B6207E |  
0000000142B621AD | 8A06 | mov al,byte ptr ds:\[rsi\] |  
0000000142B621AF | 48:FFC6 | inc rsi |  
0000000142B621B2 | 31C9 | xor ecx,ecx |  
0000000142B621B4 | C0E8 01 | shr al,1 |  
0000000142B621B7 | 74 19 | je superrecovery_x64.142B621D2 |  
0000000142B621B9 | 83D1 02 | adc ecx,2 |  
0000000142B621BC | 89C5 | mov ebp,eax |  
0000000142B621BE | 56 | push rsi |  
0000000142B621BF | 48:89FE | mov rsi,rdi |  
0000000142B621C2 | 48:29C6 | sub rsi,rax |  
0000000142B621C5 | F3:A4 | rep movsb |  
0000000142B621C7 | 5E | pop rsi |  
0000000142B621C8 | BB 01000000 | mov ebx,1 |  
0000000142B621CD | E9 ACFEFFFF | jmp superrecovery_x64.142B6207E |  
0000000142B621D2 | 41:5A | pop r10 |  
0000000142B621D4 | 49:2B7A 20 | sub rdi,qword ptr ds:\[r10+20\] |  
0000000142B621D8 | 89F8 | mov eax,edi |  
0000000142B621DA | 41:5A | pop r10 |  
0000000142B621DC | C2 2000 | ret 20 |  
}  
0000000142B6222D | 5F | pop rdi |  
0000000142B6222E | 48:01C7 | add rdi,rax |  
0000000142B62231 | 58 | pop rax |  
0000000142B62232 | 59 | pop rcx |  
0000000142B62233 | FEC9 | dec cl |  
0000000142B62235 | EB E7 | jmp superrecovery_x64.142B6221E |  
0000000142B62237 | 5B | pop rbx |  
0000000142B62238 | B8 DABC6A01 | mov eax,16ABCDA |  
0000000142B6223D | 48:01D8 | add rax,rbx |  
0000000142B62240 | 5D | pop rbp |  
0000000142B62241 | 5F | pop rdi |  
0000000142B62242 | 5E | pop rsi |  
0000000142B62243 | 5A | pop rdx | rdx:EntryPoint  
0000000142B62244 | 59 | pop rcx |  
0000000142B62245 | 5B | pop rbx |  
0000000142B62246 | FFE0 | jmp rax |  
  
## 解压后过渡跳转

}  
解密完成后，一个过渡性的临时函数  
0000000141D55CDA | 55 | push rbp |  
0000000140B00378 | E8 24CF9301 | call superrecovery_x64.14243D2A1 |  
0000000141D55CE0 | 5D | pop rbp |  
0000000141A38382 | 48:81ED 7D634500 | sub rbp,45637D |  
0000000140752924 | E8 C67CD900 | call superrecovery_x64.1414EA5EF |  
00000001421F8A17 | 58 | pop rax |  
0000000141A2439D | 48:2D 29297500 | sub rax,752929 |  
00000001421F8A23 | 48:89C0 | mov rax,rax |  
  
## VM函数入口定位

VM函数入口  
00000001422E179C | 9C | pushfq | Themida VM函数入口  
走个API调用退出到下一个VM函数入口  
GetModuleHandleA  
00000001424E1BB2 | 9C | pushfq | Themida VM函数入口  
再走个API调用推出到下一个VM函数入口  
LoadLibraryA  
000000014120E3CB | 9C | pushfq | Themida VM函数入口  
  
## 入口模式特征

观察代码段取个模式特征，存在关于\[rsp\]的操作运算，操作任意，操作数较大，还有一些关于rsp的 add、sub操作  
00000001422E17AE | 48:812C24 5A256F7C | sub qword ptr ss:\[rsp\],7C6F255A |  
00000001424E1BB7 | 48:810424 1F85EF61 | add qword ptr ss:\[rsp\],61EF851F |  
000000014120E403 | 48:C70424 FCF35A02 | mov qword ptr ss:\[rsp\],25AF3FC |  
  
## Dump与入口点选择

Dump程序，由于OEP没找，所以选择OptionalHeader.AddressOfEntryPoint即程序启动时的入口点  
0000000142B62058 | E8 82010000 | call superrecovery_x64.142B621DF |  
  
基于python脚本统计Themida入口函数步骤  
1\. 扫描"D:\\Program Files\\超级硬盘数据恢复软件(x64)\\SuperRecovery_x64_dump.exe"的0X9C(pushfq)  
2\. 基于pefile判断其是否在".themida" section  
3\. 利用capstone扫描规则  
4\. 多次测试，缝缝补补  
  
\------------------------------------------------------------------------------  
节名 VA 大小 0x9C 入口  
.themida 0x1406aa000 0x24b8000 65599 3206  
合计 0x24b8000 65599 3206  
\------------------------------------------------------------------------------  
候选 0x9C 字节: 65599  
规则初筛命中: 3389  
去重后 VM 入口: 3206 (命中率 4.89%，剔除重复/解码错位 183 条)  
指令类型分布: mov=915 xor=807 sub=744 add=739 adc=1  
距离分布: min=0x2 max=0x58 均值=40.7  
\------------------------------------------------------------------------------  
明细（前 12 条 / 共 3206 条）  
\# VA 节 +off 距离 指令  
1 0x0001406afb2c.themida 0x00005b2c 0xb add qword ptr \[rsp\], 0x77af6660  
2 0x0001406bb2a2.themida 0x000112a2 0xc sub qword ptr \[rsp\], 0x7bff044c  
3 0x0001406d76a3.themida 0x0002d6a3 0x40 mov qword ptr \[rsp\], 0x9f1253  
4 0x0001406dbce8.themida 0x00031ce8 0x9 add qword ptr \[rsp\], 0x71ff0ebe  
5 0x0001406dbe2b.themida 0x00031e2b 0xa add qword ptr \[rsp\], 0x7afff480  
6 0x0001406ecd49.themida 0x00042d49 0x46 mov qword ptr \[rsp\], 0x2640f76  
7 0x00014070cece.themida 0x00062ece 0x47 mov qword ptr \[rsp\], 0x255f5ab  
8 0x00014071916b.themida 0x0006f16b 0x47 mov qword ptr \[rsp\], 0x900dd0  
9 0x00014074a21c.themida 0x000a021c 0xb add qword ptr \[rsp\], 0x47fda0bf  
10 0x00014074a37b.themida 0x000a037b 0x3a mov qword ptr \[rsp\], 0x8b2317  
11 0x0001407501d4.themida 0x000a61d4 0xb sub qword ptr \[rsp\], 0x777ff893  
12 0x00014075a25a.themida 0x000b025a 0x3b xor qword ptr \[rsp\], 0x3fb74a94  
\==============================================================================

## 附件

- [Themida3.X入口函数统计.txt](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/c376f971e7c3ac7b.txt) （23.22kb，0次下载）
- [themida_vm_entry_stat.py](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/attach/2026/10/3639cf98b3d054f1.py) （26.30kb，0次下载）
