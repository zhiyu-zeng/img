---
title: 手写 Android Dex VMP 壳：指令流 AES 加密 + 动态加载全流程 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/%E6%89%8B%E5%86%99-android-dex-vmp-%E5%A3%B3%E6%8C%87%E4%BB%A4%E6%B5%81-aes-%E5%8A%A0%E5%AF%86-+-%E5%8A%A8%E6%80%81%E5%8A%A0%E8%BD%BD%E5%85%A8%E6%B5%81%E7%A8%8B/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:09:07+08:00
trace_id: d2640ca6-601e-4ffb-b483-e7c8b75746a9
content_hash: 32e439f9af00dc9d8cb960ba68c7421355306562080f9c8322c8fcfa997d3488
status: synced
tags:
  - Android逆向
  - 脱壳与加固
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 在 Dex VMP 基础上对指令流进行 AES 加密并按需动态解密，可使静态分析无法直接获取原始虚拟机指令，显著提升逆向难度。
ai_summary_style: key-points
images_status:
  total: 7
  succeeded: 7
  failed_urls: []
notion_page_id: 3b275244-d011-81b6-90d0-ccc1484e686c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 在 Dex VMP 基础上对指令流进行 AES 加密并按需动态解密，可使静态分析无法直接获取原始虚拟机指令，显著提升逆向难度。
> 
> - **加密流程：** 编译阶段提取原始 sign 方法字节码并保存为文件，通过 AES/ECB/PKCS5Padding 加密生成 .vmp 密文，同时导出 128 位密钥到 .key 文件。
> - **运行时解密：** Android 应用启动时，从 assets 目录加载 .vmp 与 .key 文件，使用 AESUtils 解密得到明文指令流。
> - **指令执行：** 解密后的字节码传递给自定义虚拟机 SimpleVMP，虚拟机解释执行并与原始 sign 算法输出一致。
> - **防护效果：** 静态分析只能看到加密后的假代码，真实逻辑仅存在于解密瞬间的内存中，极大阻碍静态还原。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

在上一篇《 [手写 Android Dex VMP 壳：自定义虚拟机 + 指令解释执行全流程](https://cyrus-studio.github.io/blog/posts/%E6%89%8B%E5%86%99-android-dex-vmp-%E5%A3%B3%E8%87%AA%E5%AE%9A%E4%B9%89%E8%99%9A%E6%8B%9F%E6%9C%BA-+-%E6%8C%87%E4%BB%A4%E8%A7%A3%E9%87%8A%E6%89%A7%E8%A1%8C%E5%85%A8%E6%B5%81%E7%A8%8B/) 》中，我们从零实现了一个简易的 Dex VMP 壳，通过自定义虚拟机和指令解释执行，让应用代码在运行时以“虚拟指令流”的方式运行，大大增加了逆向分析的难度。

如果攻击者能够直接读取 Dex 中的虚拟指令流，那么依然可能进行还原。为了解决这一问题，本篇将进一步升级： **在 Dex VMP 基础上引入指令流加密与动态加载**。

通过 **AES 算法** 对指令流进行加密，运行时再解密并交给虚拟机执行，从而让静态分析几乎无从下手。

## Dex VMP 指令流加密 + 动态加载完整流程

Dex VMP 指令流加密 + 动态加载执行完整流程大概如下：

```
 ┌──────────────────────┐
 │     原始 Dex 指令流   │
 └──────────┬───────────┘
            │
            ▼
 ┌─────────────────────────┐
 │ 保存指令流到文件 / 内存   │
 └──────────┬──────────────┘
            │
            ▼
 ┌─────────────────────────┐
 │       使用 AES 加密      │
 │ (key/iv 固定或动态生成)   │
 └──────────┬──────────────┘
            │
            ▼
 ┌─────────────────────────┐
 │    得到加密后的指令流文件 │
 │ （静态分析无法直接还原）  │
 └──────────┬──────────────┘
            │
   ┌────────▼──────────────┐
   │   Android 运行时启动   │
   └────────┬──────────────┘
            │
            ▼
 ┌────────────────────────┐
 │  动态读取加密指令流文件  │
 └──────────┬─────────────┘
            │
            ▼
 ┌────────────────────────┐
 │       AES 解密恢复      │
 │  （内存中得到明文指令流）│
 └──────────┬─────────────┘
            │
            ▼
 ┌──────────────────────────┐
 │   将解密后的指令流交给 VMP │
 │   → 自定义虚拟机解释执行   │
 └──────────┬───────────────┘
            │
            ▼
 ┌─────────────────────────┐
 │    App 正常运行业务逻辑   │
 │ （逆向者难以静态还原逻辑） │
 └─────────────────────────┘
```

**核心思路**：

1.  编译/打包阶段：把 Dex 指令流抽取出来，AES 加密，存储到文件中。
    
2.  运行时阶段：App 启动时，从文件中加载 → AES 解密 → 交给虚拟机解释执行。
    
3.  保护效果：静态分析拿到的 Dex 是“假代码”，真正的逻辑被加密隐藏，只有运行时内存里才会出现明文。
    

## 保存指令流到文件

在 010Editor 中搜索找到 sign 方法的字节码并复制

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/b2b327c5dc697b2e.png)](data:image/png;base64,inline-264106B)

新建 Hex 文件

[![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/1860d8475abf6d59.png)](data:image/png;base64,inline-65902B)

把 sign 方法字节码粘贴到新建的文件保存文件为 sign

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/6c9c163e8b1b1566.png)](data:image/png;base64,inline-94790B)

## AES加解密

编写一个 kotlin 语言 AES 加解密算法工具类

```kotlin
package com.cyrus.vmp

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

object AESUtils {

    private const val ALGORITHM = "AES"
    private const val TRANSFORMATION = "AES/ECB/PKCS5Padding" // AES 加密模式

    // 生成一个 128 位的 AES 密钥
    fun generateSecretKey(): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(ALGORITHM)
        keyGenerator.init(128) // AES 128 位
        return keyGenerator.generateKey()
    }

    // 使用给定的密钥加密数据
    fun encrypt(data: ByteArray, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        return cipher.doFinal(data)
    }

    // 使用给定的密钥解密数据
    fun decrypt(data: ByteArray, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key)
        return cipher.doFinal(data)
    }

    // 将文件内容加密并导出到新文件
    fun encryptFile(inputFile: File, outputFile: File, keyFile: File) {
        // 读取文件内容
        val fileData = readFile(inputFile)

        // 生成密钥
        val secretKey = generateSecretKey()

        // 加密文件内容
        val encryptedData = encrypt(fileData, secretKey)

        // 保存加密后的数据到新文件（.vmp 文件）
        writeFile(outputFile, encryptedData)

        // 保存密钥到文件
        saveKeyToFile(secretKey, keyFile)
    }

    // 解密文件内容并导出到新文件
    fun decryptFile(inputFile: File, outputFile: File, keyFile: File) {
        // 从文件加载密钥
        val secretKey = loadKeyFromFile(keyFile)

        // 读取加密后的文件内容
        val encryptedData = readFile(inputFile)

        // 解密文件内容
        val decryptedData = decrypt(encryptedData, secretKey)

        // 保存解密后的数据到文件
        writeFile(outputFile, decryptedData)
    }

    // 读取文件内容并返回字节数组
    fun readFile(file: File): ByteArray {
        val fis = FileInputStream(file)
        val baos = ByteArrayOutputStream()
        val buffer = ByteArray(1024)
        var bytesRead: Int
        while (fis.read(buffer).also { bytesRead = it } != -1) {
            baos.write(buffer, 0, bytesRead)
        }
        fis.close()
        return baos.toByteArray()
    }

    // 将字节数组写入到文件
    fun writeFile(file: File, data: ByteArray) {
        val fos = FileOutputStream(file)
        fos.write(data)
        fos.close()
    }

    // 保存密钥到文件
    private fun saveKeyToFile(key: SecretKey, keyFile: File) {
        val fos = FileOutputStream(keyFile)
        fos.write(key.encoded)
        fos.close()
    }

    // 从文件加载密钥
    fun loadKeyFromFile(keyFile: File): SecretKey {
        val keyBytes = ByteArray(keyFile.length().toInt())
        val fis = FileInputStream(keyFile)
        fis.read(keyBytes)
        fis.close()
        return SecretKeySpec(keyBytes, ALGORITHM)
    }

}
```

## 指令流加密

把 sign 文件放到工程中如下路径

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/adfbaec2e502fc74.png)](data:image/png;base64,inline-73882B)

调用 AESUtils 类中方法对 sign 进行加密并输出加密文件和密钥

```kotlin
package com.cyrus.vmp

import java.io.File

fun main() {
    // 获取工程根目录路径
    val projectRoot = System.getProperty("user.dir")

    // 设置相对路径
    val encryptedFile = File(projectRoot, "vmp/sign/sign.vmp") // 相对路径
    val keyFile = File(projectRoot, "vmp/sign/sign.key") // 相对路径

    // 输入文件路径
    val inputFile = File(projectRoot, "vmp/sign/sign") // 需要加密的文件


    try {
        // 使用 AES 加密文件
        AESUtils.encryptFile(inputFile, encryptedFile, keyFile)
        println("File encryption completed, saved as: ${encryptedFile.absolutePath}")
        println("Key saved as: ${keyFile.absolutePath}")
    } catch (e: Exception) {
        e.printStackTrace()
    }
}
```

## 指令流解密

```kotlin
package com.cyrus.vmp

import com.cyrus.vmp.AESUtils.loadKeyFromFile
import com.cyrus.vmp.AESUtils.readFile
import com.cyrus.vmp.AESUtils.writeFile
import java.io.File


fun main() {

    // 获取工程根目录路径
    val projectRoot = System.getProperty("user.dir")

    // 输入加密文件路径
    val encryptedFile = File(projectRoot, "vmp/sign/sign.vmp")

    // 密钥文件路径
    val keyFile = File(projectRoot, "vmp/sign/sign.key")

    // 输出解密文件路径
    val decryptedFile = File(projectRoot, "vmp/sign/sign_")

    try {
        // 从文件加载密钥
        val secretKey = loadKeyFromFile(keyFile)

        // 解密文件
        val encryptedData = readFile(encryptedFile)
        val decryptedData: ByteArray = AESUtils.decrypt(encryptedData, secretKey)

        // 保存解密后的文件
        writeFile(decryptedFile, decryptedData)
        println("File decryption completed, saved as: ${decryptedFile.absolutePath}")
    } catch (e: Exception) {
        e.printStackTrace()
    }
}
```

## Android 中运行时解密并执行指令流

将.vmp 和.key 文件放在 Android 应用的 assets 目录下

[![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/3089b5d9b9ff3060.png)](data:image/png;base64,inline-34730B)

编写工具类，用于读取 assets 文件并解密

```kotlin
package com.cyrus.example.vmp

import android.content.Context
import java.io.InputStream
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

object AESUtils {
    private const val ALGORITHM = "AES"
    private const val TRANSFORMATION = "AES/ECB/PKCS5Padding"

    // 从 assets 中读取文件并解密
    fun decryptFileFromAssets(context: Context, vmpFileName: String, keyFileName: String): ByteArray? {
        // 读取密钥文件
        val key = loadKeyFromAssets(context, keyFileName)

        // 读取加密的 vmp 文件
        val encryptedData = readFileFromAssets(context, vmpFileName)

        // 解密
        return decrypt(encryptedData, key)
    }

    // 读取文件内容为字节数组
    private fun readFileFromAssets(context: Context, fileName: String): ByteArray {
        val inputStream: InputStream = context.assets.open(fileName)
        return inputStream.readBytes()
    }

    // 从 assets 中加载密钥文件
    private fun loadKeyFromAssets(context: Context, keyFileName: String): SecretKey {
        val keyBytes = readFileFromAssets(context, keyFileName)
        return SecretKeySpec(keyBytes, ALGORITHM)
    }

    // 解密
    private fun decrypt(data: ByteArray, key: SecretKey): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key)
        return cipher.doFinal(data)
    }
}
```

调用解密方法并读取指令流

```kotlin
private fun readInstructionFromAssets(): ByteArray? {
    // 文件名：在 assets 中放置的加密文件和密钥文件
    val vmpFileName = "sign.vmp"
    val keyFileName = "sign.key"

    // 解密文件
    val decryptedData = AESUtils.decryptFileFromAssets(this, vmpFileName, keyFileName)
    return decryptedData
}
```

得到解密后的指令流后调用 VMP 执行指令流对 input 参数加密

```kotlin
val input = "example"

// 解密并执行指令流
val bytecode = readInstructionFromAssets()

// 通过 VMP 解析器执行指令流
if (bytecode != null) {

    val result = SimpleVMP.execute(bytecode, input)

    // 显示 Toast
    Toast.makeText(this, result, Toast.LENGTH_SHORT).show()
}
```

## 测试

执行结果如下

[![word/media/image6.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/999061979545a97e.png)](data:image/png;base64,inline-113566B)

和原来的 sign 算法对比是结果是一样的。

[![word/media/image7.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/155981196fa8956d.png)](data:image/png;base64,inline-175506B)

## 完整源码

开源地址： [https://github.com/CYRUS-STUDIO/AndroidExample](https://github.com/CYRUS-STUDIO/AndroidExample)
