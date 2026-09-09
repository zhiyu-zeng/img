---
title: The SQL Server Crypto Detour - XPN Infosec Blog
source: https://blog.xpnsec.com/the-sql-server-crypto-detour/
source_host: blog.xpnsec.com
clip_date: 2026-09-09T10:27:55+08:00
trace_id: 70e48228-176e-4e69-aa48-20b3477790a1
content_hash: e8cbe06634574ec2ec8e9c21f82607ac9b3567405021e423811cd9eacb08e004
status: synced
tags:
  - SQL Server加密
  - 数据库备份攻击
series: null
feed_source: XPN·Adam Chester
ai_summary: SQL Server 加密的 DMK 可通过数据库内保存的密码哈希离线爆破；ManageEngine ADSelfService 的数据库备份把微软文档示例密码当作 DMK 口令，因此仅凭 .bak 文件即可解密敏感凭据。
ai_summary_style: key-points
images_status:
  total: 26
  succeeded: 26
  failed_urls: []
notion_page_id: 3d675244-d011-8167-a4dd-d713ab718560
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> SQL Server 加密的 DMK 可通过数据库内保存的密码哈希离线爆破；ManageEngine ADSelfService 的数据库备份把微软文档示例密码当作 DMK 口令，因此仅凭 .bak 文件即可解密敏感凭据。
> 
> - **密钥链：** SQL Server 用 Service Master Key（SMK）保护 Database Master Key（DMK）；SMK 由 DPAPI 保护，拿到服务器本机执行权限后，可从 `HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\...\Security` 读取 Entropy，再调用 `ProtectedData.Unprotect` 恢复 SMK。
> - **DMK 离线破解：** DMK 口令以“加盐口令哈希”形式作为 thumbprint 保存在 `sys.sysobjkeycrypts`；类型 `ESKP` 对应带 4 字节盐的 `MD5(utf16le($pass).$salt)`，可直接用 `hashcat -m 30 --hex-salt` 高速爆破；类型 `ESP2` 对应 SHA-512 加 8 字节盐并截断为 24 字节，需借助 John the Ripper 自定义动态规则。
> - **ManageEngine 硬编码问题：** 本地搭建 ADSelfService 后，发现 `product-config.xml` 中的 `masterkey.password=23987hxJ#KL95234nl0zBe`，这正是微软文档创建 DMK 的示例密码；将该密码用于客户环境的 .bak 数据库备份，同样直接破解成功。
> - **解密流程：** 恢复目标备份后执行 `OPEN MASTER KEY DECRYPTION BY PASSWORD = '23987hxJ#KL95234nl0zBe'`，再 `OPEN SYMMETRIC KEY ZOHO_SYMM_KEY DECRYPTION BY CERTIFICATE ZOHO_CERT`，随后用 `DecryptByKey` 即可还原 `USER_NAME`、`Password` 等字段。
> - **实测启示：** 此类攻击不依赖原服务器的 SMK/DPAPI，数据库备份已包含破解 DMK 所需的全部材料；拿到目标产品后应先搭本地环境核对配置，避免在未知格式上盲目消耗 GPU 爆破时间。

Update: The talk from SOCON 2025 can now be found [here](https://www.youtube.com/watch?v=RiOtfPM7i3U).

As part of my role as Service Architect here at SpecterOps, one of the things I’m tasked with is exploring all kinds of technologies to help those on assessments with advancing their engagement.

Not long after starting this new role, I was approached with an interesting problem. A SQL Server database backup for a ManageEngine’s ADSelfService Plus product had been recovered and, while the team had walked through the database recovery, SQL Server database encryption was in use. With a ticking clock, the request was clear… can we do anything to recover sensitive information from the database with only a.bak file available?

One of the things that I love about this job is getting to dig into various technologies and seeing the resulting research being used in real-time. After some research, we had decryption keys, a method of decrypting sensitive data, and DA credentials extracted and ready to go!

This post will explore how this was done, look at how SQL Server encryption works, introduce some new methods of brute-forcing database encryption keys, and show a mistake in ManageEngine’s ADSelfService product which allows compromised database backups to reveal privileged credentials.

## Manage Engine Protected Data

Let’s start with Manage Engine’s ADSelfService product. Documentation shows that Domain Admin credentials are likely present:

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/3980aeb63bee86d7.webp)

![image.png](https://blog.xpnsec.com/img/sql-server-crypto-detour/image1_hu_7ce75453f66df3a8.avif)

If we setup this tool in a lab environment, we find encrypted fields such as the below `USER_NAME` column:

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/63600a21ed93a777.webp)

Further, if we review the configuration of the database, we see that this is SQL Server’s builtin encryption functionality that is being used to protect these fields. So the mission is clear: we need to understand SQL Server Encryption before we can hope to retrieve this data in cleartext.

## SQL Server Encryption Overview

The root of the cryptography chain in SQL Server is the Service Master Key (SMK). This key is associated and stored in the `master` database for the server.

At a database layer, the Database Master Key (DMK) is the start of the encryption chain for each database. This diagram from Microsoft gives a brilliant visualisation of this in action:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d8437f22f3e684e4.png)

For us to explore this encryption functionality, let’s run a few TSQL commands on a lab instance of SQL Server 2019.

First up, we create a new database and master key:

```csharp
USE CryptoDB;
CREATE MASTER KEY ENCRYPTION BY PASSWORD='Password123'
```

We can then view our created master key with:

```csharp
SELECT * FROM sys.symmetric_keys
```

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/b38ca2103718f698.webp)

![Untitled](https://blog.xpnsec.com/img/sql-server-crypto-detour/image4_hu_e748eddebe87b1d4.avif)

Now this doesn’t show the actual content of the master key. Instead, to see this, we can use the query to list encryption keys in a database:

```csharp
SELECT * FROM sys.key_encryptions
```

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/7f6961bb6a411acb.webp)

The `crypt_property` field shows our newly created master key in some form. We can also see that the `crypt_type` and `crypt_type_description` fields give a good indication as to each key’s type.

After searching Microsoft’s documentation for how these keys are actually stored, or ways that we can extract them, I found a few snippets of information:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d173d058bdc12bcb.webp)

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/aef9130b911b61ad.webp)

Unfortunately none of this is useful for our purpose, so into the disassembler and debugger I needed to go.

## Strap In Peeps.. We’re Going Low Level!

For this exercise, it usually makes sense to try and find a good lead as to the APIs that Microsoft SQL Server may use to handle encryption/decryption. My lab ran SQL Server 2017 on Microsoft Windows Server 2019 and installing WinDBG Preview was too much of a pain without access to the Windows Store, so I spun up API Monitor and hooked the Crypto APIs to see if anything indicated their use during cryptographic operations on SQL Server. We execute the TSQL to open the master key and:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/fa95876589553e75.webp)

As far as indicators go, this was a good one. We see that `BCryptHashData` was used along with a password provided during the opening of the database master key.

The important part for us is the call stack, which showed `sqllang.dll` and `sqlmin.dll` were prime candidates for reversing:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/40a218c6ef1e1538.webp)

Symbols were available for both of these DLL’s are grabbed using `symchk.exe`:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c40f66a2b213ec94.webp)

## Service Master Key Encryption

Let’s look at how the Service Master Key is generated and stored on SQL Server. This is the root of the encryption chain as shown in Microsoft’s diagram, so if we can find a vulnerability here, or some method of cracking this key, everything else will fall!

We know that a Database Master Key is encrypted using the Service Master Key. We also know from Microsoft’s documentation that this is likely protected using the data protection APIs (DPAPIs), which means that if we add a breakpoint on `CryptUnprotectData` / `CryptProtectData` and create a new DMK, we are in with a shot of seeing where in SQL Server is responsible for using the SMK.

To create the new key we use:

```csharp
CREATE MASTER KEY ENCRYPTION BY PASSWORD='Password123'
```

And we hit a breakpoint with a valuable stack trace:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/68970dcbf08ec26a.webp)

Here we see two method calls which tell us a story:

`CSECDBMasterKey::Decrypt`

`CSECServiceMasterKey::Initialize`

This makes sense, because we know that the SMK is used to decrypt the DMK and the DPAPI should protect the SMK.

We can pull out the arguments to `CryptoUnprotectData` and find the following value being decrypted:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/431ef3bc49484721.webp)

And if we use the following TSQL query:

```csharp
SELECT * FROM master.sys.key_encryptions
```

We find that the encrypted SMK matches the encrypted key stored in the `master` database:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/92f1c6176f805ef6.webp)

Another caveat is a value passed to `CryptUnprotectData` as the optional entropy value. After a bit of digging, we find that this value is taken from the registry key:

```csharp
HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL14.MSSQLSERVER\Security
```

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1253de64fbfe6648.webp)

So what does this mean? Well, if you have execution rights on a machine running SQL Server, we can use the following C# to recover the SMK:

```csharp
using System;
using System.Security.Cryptography;
using Microsoft.Win32;

namespace ConsoleApp1
{
    internal class Program
    {
        static void Main(string[] args)
        {
            // Read registry key
            var rk = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL14.MSSQLSERVER\Security");
            byte[] entropy = (byte[])rk.GetValue("Entropy", new byte[] { 0x41 });

            // SQL Encrypted SMK (minus the first 8 bytes)
            byte[] encryptedData = new byte[]
            {
                0x01, 0x00, 0x00, 0x00, 0xD0, 0x8C, 0x9D, 0xDF, 0x01, 0x15, 0xD1, 0x11, 0x8C, 0x7A, 0x00, 0xC0, 0x4F, 0xC2, 0x97, 0xEB, 0x01, 0x00, 0x00, 0x00, 0xAC, 0x5E, 0xB2, 0x87, 0xF5, ... 0x8E, 0x50, 0x44, 0xFA, 0xDC, 0xBE, 0x47, 0x88, 0x16, 0x57, 0xBF, 0xCB, 0xB3, 0x56, 0x7B, 0x43, 0x86, 0x68, 0x31, 0x7E, 0x30, 0xE3, 0xE4, 0x3A, 0x14, 0xB4
            };

            try
            {
                // Decrypt key
                byte[] data = ProtectedData.Unprotect(encryptedData, (byte[])entropy, DataProtectionScope.LocalMachine);
	              Console.WriteLine("Key Recovered");
            } catch (Exception ex)
            {
                Console.WriteLine(ex.Message);
            }
        }
    }
}
```

Unfortunately with only the database backup that we hold for ADSelfService, this isn’t an option, so we move onto the next crypto layer, the Database Master Key.

## Database Master Key Encryption

With DPAPI being used to protect the SMK, next up we tackle the DMK to see what we can unearth here.

We know from our TSQL that when we initialized the DMK, we used a password:

```csharp
CREATE MASTER KEY ENCRYPTION BY PASSWORD='Password123'
```

This password is surely a weak link in the chain, but there are a few questions that come up:

1.  How is this password stored in the database?
2.  Is all of the keying material for this password stored in a database backup?
3.  Can we bruteforce this key?

First up, we need to understand how this key is actually stored in the database. We attach a debugger to `SQLServr.exe` and use a password to attempt to open the DMK:

```csharp
 OPEN MASTER KEY DECRYPTION BY PASSWORD='ABCDE'
```

We add breakpoints to the previously observed `BCrypt` suite of APIs and we find that, after being executed, we land on a method called `BCryptHashData`:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c40a204f48fb6e4.webp)

The call stack shows where this is invoked:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/1c29d3da8b519118.webp)

What’s interesting is the use of the word `Obfus` in the method `CMEDProxyObfusKey::SearchEncryptionByUserData`. Obfuscation usually means something fishy is going on, so we dig into this method a bit more and we find reference to a key thumbprint:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/59e9a13245d6a389.webp)

Adding a breakpoint to `ComparePartialThumbPrint` and attempting to open the master key again with an invalid password using:

```sql
OPEN MASTER KEY DECRYPTION BY PASSWORD='password123'
```

This time we find that our password is passed to this method as an argument, along with the unicode byte length:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/cd59d8fcb5956aea.webp)

But what is this being compared to? Dumping the third argument to this method call shows the following memory content:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/937060370d6214e1.webp)

This is not something that we’ve seen so far, but a bit of digging in SQL reveals the following table (requires DAC / diagnostic connection on a live database):

```sql
SELECT * FROM sys.sysobjkeycrypts
```

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d627f9c7e4cb0909.webp)

This looks similar to the previous `sys.key_encryptions` table; however, the `thumbprint` value is populated this time. What is going on here?

At this point, we know that the thumbprint is being used alongside our plaintext password. Let’s look in `ComparePartialThumbPrint` to see what the comparison is doing.

First the provided password is hashed:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/5f93a6b1a1bbdaf8.webp)

Then the hash is salted:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/4be64c367a77e2f2.webp)

And then the result is compared to the thumbprint:

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/079ff92cc27e7876.webp)

If this is the case, this gives us a brilliant opportunity to create a brute-force method for our target database. After all:

1.  All of the keying material is stored in the database (and therefore the database backup)
2.  Nothing relates to the SMK and, therefore, DPAPI

But what are the algorithms used to hash the password? Well, in the `type` field of `sys.key_encryptions` we have a number of values:

-   `ESKP` - Observed in databases starting at SQL Server 2008
-   `ESP2` - Observed in databases starting at SQL Server 2012

Starting with `ESP2`, if we add a breakpoint to `BCryptHashData`, we find that this is `SHA-512` salted with 8 bytes. The resulting hash is then truncated to 24 bytes and then compared to the thumbprint.

Unfortunately for us, there is an additional step that SQL Server takes when storing the SHA-512 hash of the DMK: the hash truncates to 24 bytes.

This step alone appears to put it out of the reach of stock Hashcat rules; however, if we turn to John The Ripper, we have the option of Dynamic Rules.

A warning in advance: this is going to be slow, but we can add the following dynamic rule which will crack `ESP2` keys:

```csharp
[List.Generic:dynamic_2020]
Expression=sha512(utf16le($p).$s) (hash truncated to length 24)
Flag=MGF_SALTED
Flag=MGF_FLAT_BUFFERS
Flag=MGF_INPUT_24_BYTE
SaltLen=8
Func=DynamicFunc__clean_input_kwik
Func=DynamicFunc__setmode_unicode
Func=DynamicFunc__append_keys
Func=DynamicFunc__setmode_normal
Func=DynamicFunc__append_salt
Func=DynamicFunc__SHA512_crypt_input1_to_output1_FINAL
Test=$dynamic_2020$E45AF6FA6601E13A8F2B620FF8A859AE4B459B848D06F5C7$HEX$28E3C09896ED6177:Wibble123
```

This dynamic format can then be used with:

```sql
./run/john --format=dynamic_2020 /tmp/hashes --wordlist=/tmp/wordlist --encoding=raw
```

A quick demo to show how this works:

The second type is `ESKP`, which is using `MD5` salted with 4 bytes. The result is then compared to the thumbprint.

Looking at Hashcat, we find a format which suits our cracking format:

```csharp
md5(utf16le($pass).$salt)
```

This means we can crack using:

```csharp
hashcat -m 30 --hex-salt /tmp/hashes /tmp/uberwordlist.txt
```

A quick demo to show how this works:

## Bruteforcing the ManageEngine Hashed Database Master Key

So now we have a technique to hopefully recover database encryption keys. We cross our fingers and look in our target database backup and we find `ESKP`. This means that we have a DMK protected using MD5 and, thankfully, a GPU cracking rig just waiting for us to feed it hashes!

Adding our hash to a file, we fire up our cracking job and…nothing.

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/531ff97a47906d94.png)

The key hasn’t been rotated in a long time. Experience tells us that something is wrong here, so I did what I should have done in the first place. I spun up a local instance of ManageEngine to take a look at what was happening.

After reviewing, I found a file named `product-config.xml`, which looks like this:

![image.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/035394b0561e0dd8.webp)

![image.png](https://blog.xpnsec.com/img/sql-server-crypto-detour/image24_hu_1bb88e0ac77b7b8e.avif)

The `masterkey.password` property has a value of `23987hxJ#KL95234nl0zBe`, and if we throw this into our new method of cracking database encryption keys, we find that it cracks.

More concerningly, I then try this against the provided.bak file from the client environment and it cracks!

So what is this key: just a hardcoded value? A quick throw of this password into Google and…

![Untitled](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6c6fd3563219149.webp)

![Untitled](https://blog.xpnsec.com/img/sql-server-crypto-detour/image25_hu_7920badb2083dfde.avif)

The key is the example key used in Microsoft’s documentation for setting up a DMK!

TADA, dopamine hit! Using the database backup, we can now unseal the certificate and symmetric keys ManageEngine uses for decryption and pull out those sensitive credentials:

```csharp
use DATABASE_NAME_HERE -- Update to contain the restored database name
OPEN MASTER KEY DECRYPTION BY PASSWORD = '23987hxJ#KL95234nl0zBe'
OPEN SYMMETRIC KEY ZOHO_SYMM_KEY DECRYPTION BY CERTIFICATE ZOHO_CERT;
```

And we can use this to decrypt any sensitive data contained within:

```sql
SELECT CONVERT(NVARCHAR(MAX), DecryptByKey((SELECT [Password] FROM ADSMDomainConfiguration))) as Password, CONVERT(NVARCHAR(MAX), DecryptByKey((SELECT [USER_NAME] FROM ADSMDomainConfiguration))) as UserName
```

Here’s what we’ve learned during this exercise:

1.  ManageEngine ADSelfService backups created use an example key Microsoft provides
2.  If you find a database backup that uses a DMK with the ESKP type, you can brute-force the decryption password with the speed of MD5
3.  Always lab your target product before spending so much time in a disassembler

This blog post was presented at SOCON 2025. The talk from SOCON 2025 can be found [here](https://www.youtube.com/watch?v=RiOtfPM7i3U).

Also if you fancy a good laugh, [RastaMouse](https://twitter.com/_RastaMouse) created an abridged copy of my talk [here](https://www.youtube.com/watch?v=Dt1yjTVgb94).
