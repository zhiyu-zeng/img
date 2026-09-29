---
title: SensePost | PsExec’ing the right way and why zero trust is mandatory
source: https://sensepost.com/blog/2025/psexecing-the-right-way-and-why-zero-trust-is-mandatory/
source_host: sensepost.com
clip_date: 2026-09-29T10:13:30+08:00
trace_id: 17188a15-3c18-4a22-82b4-b9a562c9b1b6
content_hash: 0f36dd09ce427f248810967639b8769badefc74bec511c98967c3b9070035093
status: synced
tags:
  - Windows逆向
  - 安全工具
series: null
feed_source: SensePost·红队研究
ai_summary: "**TL;DR：** 逆向 PsExec 通信协议并用 Python 重写服务端，复用微软签名的 PsExeSVC.exe 可绕过 EDR 白名单实现远程命令执行，因此零信任是必需。"
ai_summary_style: key-points
images_status:
  total: 23
  succeeded: 23
  failed_urls: []
notion_page_id: 3ea75244-d011-811a-861b-e2830faecad7
ioc:
  cves: []
  cwes: []
  hashes:
    - 43004f004d004d0041004e0044004f00
    - "44006500660074006500400057004600"
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> **TL;DR：** 逆向 PsExec 通信协议并用 Python 重写服务端，复用微软签名的 PsExeSVC.exe 可绕过 EDR 白名单实现远程命令执行，因此零信任是必需。
> 
> - **四步工作机制：** 客户端从自身提取 PsExeSVC.exe 并上传到 ADMIN$（C:\Windows）→ 经 SVCCTL RPC 调用 OpenSCManagerW/OpenServiceW/StartServiceW/QueryServiceStatus 创建并启动服务 → 服务端建立 psexecsvc 命名管道交换版本号 → 再按 `<二进制名>-<主机名>-<PID>-std{in,out,err}` 建立三条管道。
> - **版本差异：** v1.9 初始包为明文（小端 `BE000000`=190），v2.20 起全部通信加密；明文包内含包大小、PID、主机名、待执行程序、参数及 32 字节选项位图。
> - **init 包结构：** 关键标志位为 LogonUser（远程本地登录、启用 SSO）、EnableAllPrivs（完整令牌特权）、ElevateToSystem（NT AUTHORITY\System shell），并携带明文用户名密码。
> - **工具与效果：** psexecsvc.py（基于 Impacket psexec.py）支持 `-system` 与 `-user`；因依赖合法签名二进制，比部署 RemCom 的 psexec.py 更难被拦。
> - **风险与防御：** LogonUser 令凭据驻留 LSASS（可被 NetExec lsassy 窃取）；防御可监控 `HKCU\Software\Sysinternals\PsExec`、服务创建事件 4697、禁用 ADMIN$ 共享、关联命名管道模式，并避免基于证书/文件名/目录的全局白名单——签名校验仅需签名存在即放行是逻辑缺陷。

2021 was the year I met two incredible hackers, [Michael](https://x.com/_cablethief) and Reino with whom I had the opportunity to work with during my first ever SenseCon.

The Sensecon is an internal conference that lasts 3 days during which we meet people, share knowledge and have fun. There is also a day long hackathon during which we work on hacking subjects we are interested in.

For that hackathon, we wanted to dig into PsExec.exe in order to see if it is possible to communicate with it via a python script and thus not depend anymore on a windows system. Spoiler alert, [we were able to](https://github.com/sensepost/susinternals)! But for some reasons, the project died in a private repo.

Until a few weeks ago where I really needed such a tool to bypass a specific EDR.

Seeing that it worked quite well, I thought of finishing the project and publishing it alongside this blog post to explain how we achieved that. In this blog post, we’ll have a glimpse at how PsExec.exe works, we’ll write a python script that allows us to act as a legitimate PsExec.exe client and finally, we’ll see why zero trust is a core requirement of cybersecurity.

## 1/ How does PsExec.exe work

Lots of people have already explained it, but since we are going to mimic it, I thought it would be interesting to explain it one more time. For those unaware, PsExec.exe is one binary among an entire toolkit called [Sysinternals](https://learn.microsoft.com/en-us/sysinternals/) which was first released in 1996 by [Mark Russinovich](https://x.com/markrussinovich). As of today, the latest version of PsExec.exe is version 2.43 which can be downloaded [here](https://learn.microsoft.com/en-us/sysinternals/downloads/psexec).

Most of the time you will use PsExec in two ways:

-   To gain local system privileges:

```
PsExec.exe -s -i cmd
```

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cdeac6e535cdabd8.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/3b9f10fb3c80be48e2a26cd248bf762c.png)

-   To execute commands remotely as a domain user:

```
PsExec.exe \\dc.whiteflag.local -u WHITEFLAG\Administrateur -p Defte@WF cmd
```

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/be25cf20ec77ceb9.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/671255a0e0011dae731150572c509647.png)

To achieve remote command execution, PsExec.exe relies on 4 steps:

1.  Extracting and uploading PsExeSVC.exe

When you run PsExec.exe, the first thing it does is extract PsExeSVC.exe, the server side component, which is embedded in PsExec.exe. See the following binwalk output:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f4ee8e1b04e0a952.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/9ee057294c73f7c2b4101c0b50c93a37.png)

This binary is then uploaded to the ADMIN$ share (pointing to C:\\Windows) as PsExeSVC.exe:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/113b2f4c42e49e19.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/ce3bd637d577fd907ced9b0eba0ba2b4.png)

2\. Launching the PsExeSVC service

Then PsExec.exe, the client, connects remotely to the SVCCTL RPC endpoint which is used to manage services and calls 4 interfaces:

-   OpenSCManagerW to connect to the Service RPC endpoint;
-   OpenServiceW to create a new service;
-   StartServiceW to start the newly created service;
-   QueryServiceStatus to make sure that the service is actually running.

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/553cbed3832b9d1f.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/fca00cc4dd906a2ad71457c63ff89480.png)

And indeed we can see that a new service, PSEXESVC is running:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f102f4a8b2d11267.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/a45ae2646141d1abb4fe3579532a9d57.png)

3\. Sending init packet

When PsExeSVC starts, it first creates a named pipe called psexecsvc which we will call the initialisation named pipe:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4ef7af42f13f4e5b.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/2044192165d9f4adb5bf4fa3f20f83bf.png)

Right after this pipe is set up, a transceive operation occurs between the client (PsExec.exe) and the server (PsExeSVC.exe) where they both send their version and receive the version of the other part:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9529d8bcc440a642.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/370490ed825c9f7036eb00d6c51df459.png)

Looking at the content of these packets, we will see that they both send 4 bytes of data containing a numeric value stored in hexadecimal (little endian):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/49769894c03f07b0.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/aa105f55730ba279c5dd806d1c3db8d7.png)

Which translated, tells us this is PsExec.exe and PsExeSVC.exe version 1.9:

```
Little endia = BE000000 
Big endian = 0000000BE = 190 = version 1.9
```

Why am I not using the latest version? This is because once both components have sent their respective versions, the client will send 19032 to 19040 bytes of data (depending of the version of PsExec). Thing is, since PsExec 2.20, that data, and all later communications, are encrypted. So here is what you would see if you are monitoring PsExec.exe v2.43 communications via Wireshark:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9f1769f422712939.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/c90783fbdd0b324d483e65f9b2b0afaa.png)

And here is the exact same packet with version 1.90:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/0352b20fc12e0c4f.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/d8e0db2176438074d94dd08eab3b8b91.png)

Looking at this one, we can already understand why newer versions of PsExec implement encryption; because the client was sending clear text credentials over the network (we will see why later) which are prone to man in the middle attacks.

We can also see that a program is specified, cmd.exe, as well as the computer name from where PsExec.exe was executed (a VM of mine whose hostname is COMMANDO). Notice that all this clear text information is surrounded by null bytes. That is because that data is not just random data, but is a structure whose contours can be seen:

```python
# Size of the packet to be read by PsExeSVC (19032)
584a0000
# Little endian hexadecimal for 5800 (don't know what it's used for yet)
a8160000
# String (C.O.M.M.A.N.D.O)
43004f004d004d0041004e0044004f00 [ LOTS OF ZEROS ]
# String (C.M.D)
63006d006400 [ LOTS OF ZEROS ]
# Some bytes ??
00000101000000000000000000000000ffffffff0100
# String (W.H.I.T.E.F.L.A.G.\.A.d.m.i.n.i.s.t.r.a.t.e.u.r)
5700480049005400450046004c00410047005c00410064006d0069006e00690073007400720061007400650075007200 [ LOTS OF ZEROS ]
# String D.e.f.t.e.@.W.F
44006500660074006500400057004600 [ LAST ZEROS ]
```

Right after that structure is received by PsExeSVC.exe, three new named pipes are created:

-   PSEXECSVC-X-Y-stdin used to send commands we want to run remotely;
-   PSEXECSVC-X-Y-stdout used to retrieve the output of the command;
-   PSEXECSVC-X-Y-stderr used to retrieve the errors.

With:

-   X being a string;
-   Y being a numeric value.

Listing named pipes on the remote target with PowerShell:

```
Get-ChildItem \\.\\pipe\
```

Shows us the following ones:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8dffd2ad59a36ea5.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/c8b1334369048096ede8cd9eeaa47922.png)

What about that 5800 numeric value? Well, looking at the task manager on the computer where PsExec.exe was launched we will see the following:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/ddf5a65fe3e90372.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/ae5f39a6432c2567f1bf97fe5be252f5.png)

Which implies that this value (Y in the previous pattern) is actually the PID of PsExec.exe.

Now we understand that the psexecsvc named pipe is here to receive information that will be used to create the other three named pipes. Schematically, we can say that PsExec.exe creates named pipes this way:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a268ab325f6f39e8.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/658650d009abd810c6a8c7b0a458b3d4.png)

Last thing we need to know is how these PsExec.exe options are sent:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/338eb092d55fd724.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/278a08f68736eb4685ac55814f9067a9.png)

Since I didn’t want to decompile the binary, which is not really TOS compliant, I just thought of flipping random options and see the differences in the Wireshark outputs. And so I did, until I realised that there is a 32 byte buffer that only contained 0’s and 1’s depending of the options used with PsExec.exe.

At that point I was now able to define the structure of the data passed to the PsExeSVC named pipe which is the following:

```ruby
class PsExecInit(Structure):
    structure = (
        ('PacketSize', '<I'),         # 19032 (size of the init packet)
        ('PID', '<I'),                # PID of the PsExeSVC.py script
        ('Computer', '520s'),         # Hostname of the computer where PsExeSVC.py is run
        ('Command', '520s'),          # Remote binary to call 
        ('Arguments', '520s'),        # Arguments
        ('OthersOptions', '16385s'),  # Some space mostly used to copy files
        ('ElevateToSystem', '1s'),    # Whether we elevate to system or not
        ('Interactif', '1s'),         # Whether launch interactive session (no it won't let you type command otherwise)
        ('LogonUser', '1s'),          # Logs the user in remotely (which enables Windows SSO)
        ('RestrictedToken', '1s'),    # Do we want a restricted priv token ? (nope LOL)
        ('EnableAllPrivs', '1s'),     # Do we able all privileges (HELL YEAH!!)
        ('OthersFlags', '16s'),       # Others options we don't really need
        ('Username', '520s=""'),      # DOMAIN\Username
        ('Password', '520s=""'),      # Password
        ('Padding', '18s=""')         # Padding
    )
```

As you can see quite a lot of data is stored in that structure, with the most important ones being the following flags:

-   LogonUser which allows us to have a shell as the authenticated user;
-   EnabledAllPrivs which allows us to have a full token privilege;
-   ElevateToSystem which allows us to have a NT AUTHORITY\\System remote shell.

Pack all of this stuff into a copy of the [psexec.py script from Impacket](https://github.com/fortra/impacket/blob/master/examples/psexec.py) and here you have got [psexecsvc.py](https://github.com/sensepost/susinternals) which you can use in two ways:

-   To get a NT AUTHORITY\\System shell (with -system flag):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fdd956bf0d81b63e.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/23bf735adbba5b3de2c0283cfbdb9579.png)

-   To get a remote shell as the user you supplied credentials for in the target (with the -user flag):

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/a041757bf3cf487d.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/4c0a92cd781a7ced923e9e719b980cbc.png)

Note that authenticating as a domain user requires filling clear text credentials as these credentials will be passed to the PsExeSVC service that will then use them to authenticate locally on the remote target.

To do that, PsExeSVC.exe relies on the LogonUser function from the WinAPI whose prototype is the following:

```
BOOL LogonUserA(
    LPCSTR  lpszUsername,
    LPCSTR  lpszDomain,
    LPCSTR  lpszPassword,
    DWORD   dwLogonType,
    DWORD   dwLogonProvider,
    PHANDLE phToken
);
```

That API call will give you a [primary token that will allow you to use the Windows SSO](https://blog.whiteflag.io/blog/exploiting-windows-tokens/) and thus connect to others systems from your remote shell. For example, if I connect to the srv.whiteflag.local server using the -user flag, I will be able to list the C$ share on the dc.whiteflag.local one:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8c0ca099a59772f0.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/85268a08934b931a641b5b07de80ec22.png)

But using this feature has a huge caveat since credentials will be stored in the memory of the LSASS process and can be hijacked by an attacker using, for example, [NetExec](https://github.com/Pennyw0rth/NetExec):

```
nxc smb serveur.whiteflag.local -u Administrateur -p Defte@WF -M lsassy
```

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1cdf7e758717a372.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/c75b14c05c8e034206f3f894c052d7f4.png)

That is the reason why you will always see people mention that credentials are not stored in LSASS when authenticating remotely except with the original PsExec.exe, because of the local logon which is done by the PsExecSVC service on the remote server.

## 2/ What are the benefits of PsExeSVC.py?

Yeah you are right, you may say that this is useless since we can already run commands remotely via psexec.py. But first I’m a lazy hacker, spinning up a Windows VM is a lot for me. Second of all, psexec.py deploys the [RemCom](https://github.com/kavika13/RemCom) service on the remote Windows system which is great… But flagged:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/8e022ab1b59d3aa2.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/8bb8ce7c2ac2a9df74d3f556384cf9b3.png)

While PsExeSVC.exe is not:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5a2bd55ecb819d9b.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/6848fe0824361dd938e6de8e7e54e57f.png)

The reason why RemCom is flagged is because Impacket embeds a compiled version which has been, and is still used, by attackers. Of course you can lower the detection rate by compiling your own version of RemCom. But using a legitimate remote administration tool is better because of this certificate:

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/47b2359bd971b421.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/af11d399672f1ec4c6b2c80d62fe6b77.png)

Which is used to sign a binary and prove that it is part of a toolkit distributed by Microsoft. That certificate alone implies that the binary is not supposed to be malicious and should not be blocked.

As such you will often see EDR’s block wmiexec.py and psexec.py but they won’t always block PsExecSVC.py because it relies on a legitimate and trusted tool (the PsExeSVC.exe binary)!

That mechanism is called a whitelist, and it is something I have seen a lot which allowed me to pwn many internal networks of the most hardened clients I ever had.

Now if you have read the blog post I wrote about [building your own EDR](https://sensepost.com/blog/2024/sensecon-23-from-windows-drivers-to-an-almost-fully-working-edr/), maybe you played with the challenge I published alongside it. In this challenge, I added such a whitelist mechanism, and I was actually surprised because a lot of people sent me their write-ups with amazingly good ideas but that one logical bug I made wasn’t exploited.

The bug is located in the code of the static analyzer agent, see the main function:

```swift
int main() {
    LPCWSTR pipeName = L"\\\\.\\pipe\\dumbedr-analyzer";
    DWORD bytesRead = 0;
    wchar_t target_binary_file[MESSAGE_SIZE] = { 0 };

    printf("Launching analyzer named pipe server\n");

    // Creates a named pipe
    HANDLE hServerPipe = CreateNamedPipe(
        pipeName,                 // Pipe name to create
        PIPE_ACCESS_DUPLEX,       // Whether the pipe is supposed to receive or send data (can be both)
        PIPE_TYPE_MESSAGE,        // Pipe mode (whether or not the pipe is waiting for data)
        PIPE_UNLIMITED_INSTANCES, // Maximum number of instances from 1 to PIPE_UNLIMITED_INSTANCES
        MESSAGE_SIZE,             // Number of bytes for output buffer
        MESSAGE_SIZE,             // Number of bytes for input buffer
        0,                        // Pipe timeout 
        NULL                      // Security attributes (anonymous connection or may be needs credentials. )
    );

    while (TRUE) {

        // ConnectNamedPipe enables a named pipe server to start listening for incoming connections
        BOOL isPipeConnected = ConnectNamedPipe(
            hServerPipe, // Handle to the named pipe
            NULL         // Whether or not the pipe supports overlapped operations
        );

        wchar_t target_binary_file[MESSAGE_SIZE] = { 0 };
        if (isPipeConnected) {
            // Read from the named pipe
            ReadFile(
                hServerPipe,         // Handle to the named pipe
                &target_binary_file, // Target buffer where to stock the output
                MESSAGE_SIZE,        // Size of the buffer
                &bytesRead,          // Number of bytes read from ReadFile
                NULL                 // Whether or not the pipe supports overlapped operations
            );

            printf("~> Received binary file %ws\n", target_binary_file);
            int res = 0;

            BOOL isSeDebugPrivilegeStringPresent = lookForSeDebugPrivilegeString(target_binary_file);
            if (isSeDebugPrivilegeStringPresent == TRUE) {
                printf("\t\033[31mFound SeDebugPrivilege string.\033[0m\n");
            }
            else {
                printf("\t\033[32mSeDebugPrivilege string not found.\033[0m\n");
            }

            BOOL isDangerousFunctionsFound = ListImportedFunctions(target_binary_file);
            if (isDangerousFunctionsFound == TRUE) {
                printf("\t\033[31mDangerous functions found.\033[0m\n");
            }
            else {
                printf("\t\033[32mNo dangerous functions found.\033[0m\n");
            }

            BOOL isSigned = VerifyEmbeddedSignature(target_binary_file);
            if (isSigned == TRUE) {
                printf("\t\033[32mBinary is signed.\033[0m\n");
            }
            else {
                printf("\t\033[31mBinary is not signed.\033[0m\n");
            }

            // Here there is a logical bug. If the binary is signed, all others checks are ignored
            wchar_t response[MESSAGE_SIZE] = { 0 };
            if (isSigned == TRUE) {
                swprintf_s(response, MESSAGE_SIZE, L"OK\0");
                printf("\t\033[32mStaticAnalyzer allows\033[0m\n");
            }
            else {
                // If the following conditions are met, the binary is blocked
                if (isDangerousFunctionsFound || isSeDebugPrivilegeStringPresent) {
                    swprintf_s(response, MESSAGE_SIZE, L"KO\0");
                    printf("\n\t\033[31mStaticAnalyzer denies\033[0m\n");
                }
                else {
                    swprintf_s(response, MESSAGE_SIZE, L"OK\0");
                    printf("\n\t\033[32mStaticAnalyzer allows\033[0m\n");
                }
            }

            DWORD bytesWritten = 0;
            // Write to the named pipe
            WriteFile(
                hServerPipe,   // Handle to the named pipe
                response,      // Buffer to write from
                MESSAGE_SIZE,  // Size of the buffer 
                &bytesWritten, // Numbers of bytes written
                NULL           // Whether or not the pipe supports overlapped operations
            );

        }

        // Disconnect
        DisconnectNamedPipe(
            hServerPipe // Handle to the named pipe
        );

        printf("\n\n");
    }
    return 0;
}
```

This code is quite simple, it creates a named pipe that is used by the driver to send information, obtained via a kernel callback, about processes being launched. For each program received, the static analyzer does a few checks:

-   If there are dangerous functions in the binary (this is just a IAT lookup);
-   If the SeDebugPrivilege string is found inside;
-   If the binary is signed.

But here is the catch, if the binary is signed, all others requirements become optional, see the if statement:

```swift
wchar_t response[MESSAGE_SIZE] = { 0 };
if (isSigned == TRUE) {
    swprintf_s(response, MESSAGE_SIZE, L"OK\0");
    printf("\t\033[32mStaticAnalyzer allows\033[0m\n");
}
else {
    // If the following conditions are met, the binary is blocked
    if (isDangerousFunctionsFound || isSeDebugPrivilegeStringPresent) {
        swprintf_s(response, MESSAGE_SIZE, L"KO\0");
        printf("\n\t\033[31mStaticAnalyzer denies\033[0m\n");
    }
    else {
        swprintf_s(response, MESSAGE_SIZE, L"OK\0");
        printf("\n\t\033[32mStaticAnalyzer allows\033[0m\n");
    }
}
```

Now let’s take a look at how the signing check function works:

```objectivec
BOOL isSigned;
switch (lStatus) {
    // The file is signed and the signature was verified
case ERROR_SUCCESS:
    isSigned = TRUE;
    break;

    // File is signed but the signature is not verified or is not trusted
case TRUST_E_SUBJECT_FORM_UNKNOWN || TRUST_E_PROVIDER_UNKNOWN || TRUST_E_EXPLICIT_DISTRUST || CRYPT_E_SECURITY_SETTINGS || TRUST_E_SUBJECT_NOT_TRUSTED:
    isSigned = TRUE;
    break;

    // The file is not signed
case TRUST_E_NOSIGNATURE:
    isSigned = FALSE;
    break;

    // Shouldn't happen but hey may be!
default:
    isSigned = FALSE;
    break;
}
```

As long as your binary has a signature, whether it is valid or not, it will pass the static analyzer. And that is a real life behaviour which I was able to use to run trusted tools and compromise companies. All of that, because of trusts. But hey, don’t worry, there are still ways of protecting yourself!

## 4/ Protecting yourself

Even if I weaponized PsExeSVC.exe in this blog post, the point is not to protect yourself against PsExec.exe. The point is about not using globally trusted whitelists based on certificates, binary names, directories or publishers. And now you may ask “what about sysadmins that actually use PsExec.exe for remote administration?”.

Do they really need it? Can’t they administer computers via GPO’s, remote registry, remote task scheduling or even PsRemoting/RDP? If they can’t, then it is possible to only whitelist these binaries on their computers meaning only specific IP’s should be able to to use such tools. But there is no reason for PsExec.exe to be whitelisted among an entire corporate network. After all, marketing people do not use PsExec.exe, right?

That said, how can we block PsExec.exe? Well here are a few ideas.

First, when running PsExec for the first time, the user is asked to accept the EULA. If yes, the value will be stored in the following registry key:

```
HKCU\Software\Sysinternals\PsExec
```

[![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/9ebf2b95ee205865.png)](https://sensepost.com/img/pages/blog/2025/psexec-ing-the-right-way-and-why-zero-trust-is-mandatory/327cb3c4211628f1cc43fa4907b97b5b.png)

Monitoring this hive’s creation will allow you to detect PsExec.

Secondly, PsEexec.exe always works the same way:

-   It uploads a binary to the ADMIN$ share;
-   It creates a service remotely;
-   It starts the service;
-   It makes sure that the service is running.

That set of specific remote RPC calls is a red flag that you can detect and block based on related event ID’s (for example, service creation 4697)

Third, disable the ADMIN$ share. If PsExec.exe doesn’t find the ADMIN$ share, it won’t be able to upload the service binary. But since we are talking about the ADMIN$ share, ask yourself whether or not your SMB servers and workstations really have to expose any shares at all. Some systems will (filers and DC’s exposing SYSVOL for example), but most of them won’t need it, so disable as many shares as possible to reduce attack surface and monitor the last required ones.

Fourth, correlate named pipe setup. We have seen before that PsExec.exe will send a set of information to the psexecsvc named pipe which will be used to create the stdin, stdout and stderr named pipes. In our examples we saw that the named pipe was:

```
PSEXESVC-COMMANDO-5800-std*
```

What I didn’t mention is that the PSEXESVC part is not hardcoded, it is obtained by PsExeSVC.exe reading its own binary name. Most of the times attackers upload PsExeSVC.exe renaming it in order to try to hide it. If they do so, let’s say they rename psexesvc.exe to update.exe, the three named pipes that will be spawned will respect the following pattern:

```
UPDATE-COMPUTERNAME-PID-std*
```

If, for any reason, you find out that a dropped binary sets up three named pipes which contain its binary name inside… Red flag!!

Fifth and last, because I think it’s probably the most important thing to remember out of this blogpost, do not trust anything. [Lolbins](https://lolbas-project.github.io/), [GTFObins](https://gtfobins.github.io/), [vulnerable and signed drivers](https://www.loldrivers.io/), EDR’s and antivirus… These are all legitimate tools and components that can, at some point, be used against yourself if you over trust them. If you want to secure your network, do not trust anyone or anything because as Pierre Corneille, a French poet, once said: “excessive confidence often leads to danger”. And that I couldn’t agree more!

Happy hacking!

This is a cross-post blog from [https://blog.whiteflag.io/psexecing-the-right-way-and-why-zero-trust-is-mandatory/](https://blog.whiteflag.io/psexecing-the-right-way-and-why-zero-trust-is-mandatory/).
