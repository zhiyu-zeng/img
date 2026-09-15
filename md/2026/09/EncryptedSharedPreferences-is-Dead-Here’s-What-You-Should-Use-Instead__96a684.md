---
title: "EncryptedSharedPreferences is Dead: Here’s What You Should Use Instead"
source: https://blog.includesecurity.com/2026/08/encryptedsharedpreferences-is-dead-heres-what-you-should-use-instead/
source_host: blog.includesecurity.com
clip_date: 2026-09-15T10:25:53+08:00
trace_id: 30ad65d2-dcc2-499b-8baf-442cf8f3e63e
content_hash: 6b538e5ffc91e3e4310e03d6c44545be39762c09f16a67a61893a510cc7bd973
status: synced
tags:
  - Android逆向
  - 开发工具
series: null
feed_source: Include Security
ai_summary: EncryptedSharedPreferences 已废弃，Android 敏感数据本地持久化应改用 Jetpack DataStore 加 Google Tink 做 AEAD 加密，且能不落盘就不落盘。
ai_summary_style: key-points:weak
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3dc75244-d011-8154-8b28-c7c20041b04d
ioc:
  cves:
    - CVE-2019-11384
    - CVE-2025-25381
  cwes: []
  hashes: []
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points:weak）**
>
> EncryptedSharedPreferences 已废弃，Android 敏感数据本地持久化应改用 Jetpack DataStore 加 Google Tink 做 AEAD 加密，且能不落盘就不落盘。
> 
> - **废弃原因：** Jetpack Security Crypto 1.1.0 起全部 API 被弃用且不再维护，官方未给明确理由；推测与厂商 Keystore 兼容性差异、推动统一迁移到 DataStore、让开发者直接用 Tink、减少并行维护负担有关。
> - **推荐方案：** DataStore 负责存储层，Tink 提供 AEAD 原语，密钥经 AndroidKeysetManager 托管到 Android Keystore（可用时硬件级保护）；密文 Base64 编码后写入，读取时反解并解密。
> - **关键实现点：** 使用 AES-256-GCM 模板；I/O 与加密放 Dispatchers.IO 不阻塞主线程；高度敏感数据用 char[]/byte[] 而非不可变 String，便于用后清零内存。
> - **磁盘实测：** adb 可看到两份产物——存 Tink keyset 的 SharedPreferences（secure_storage_prefs.xml）与存 Base64 密文的 DataStore 文件（secure_storage_prefs.preferences_pbr），明文从不落盘。
> - **常见误判与加固：** 设备加密和沙箱不是万能的，闪存磨损均衡/磁盘残留会让"已删除"数据仍可被 JTAG 类硬件手段恢复；须显式设置 android:allowBackup="false"，避免数据被备份到云端或被 ADB 取走。
> - **现实案例：** CVE-2019-11384（Zalora）、CVE-2025-25381（KSRTC）均因明文 SharedPreferences 存凭据；微软 Dirty Stream 研究显示路径穿越可突破沙箱读取 /data/data/<package> 下的明文令牌。

At Include Security we often flag sensitive data mishandled in application code as a security and privacy focused vulnerability. While most security professionals know the perils of plaintext storage of sensitive data, a subtler form of this issue lingers in modern development: writing sensitive data to disk in any capacity. This practice is deeply rooted in historical software engineering where early systems relied on disk persistence for everything from user sessions, software licensing, and cryptographic keys. However, it quickly became clear that persistent disk storage introduced enduring risks such as forensic recovery and unauthorized access, ultimately leading to the industry best practice of avoiding it wherever possible.

Despite advancements in operating system level protections such as Android’s file-based encryption and process isolating sandbox technologies, the overarching principle of not writing sensitive data to disk continues to be important for information security. Misconceptions about these protections being sufficient often lead to regressions in accepted best practices, undoing the hard-won security due diligence of our past and exposing applications and systems to threats impacting confidentiality, integrity, and availability.

In this post we’ll explore why persisting data to disk introduces unnecessary risk, dissect the mechanics of storage systems on Android, and provide you with proven methods to safeguard your application data. Furthermore, we’ll cover common misconceptions and misunderstandings with a focus on Android, including Google’s current stance that unencrypted internal app storage is not a concern due to reliance on OS protections such as device encryption and sandboxing, alongside recommended alternatives such as Jetpack DataStore coupled with Google Tink for encryption.

## Common Misunderstandings and a False Sense of Security

Even experienced developers can fall into a false sense of security when it comes to storing sensitive data on disk. Several misunderstandings about operating system protections, storage medium behavior, and platform features such as data backups result in teams underestimating risk and relaxing important security controls. Understanding the context around these common misunderstandings is essential before examining modern storage practices and mitigations.

**Overestimation of OS Protections:** Many developers assume modern operating systems provide bulletproof security for data at rest. Features like process isolation and sandboxing are more like locked doors which are effective against casual intruders but far from infallible against determined attackers. [Google has historically taken the stance](https://developer.android.com/privacy-and-security/risks/sensitive-data-external-storage#sensitive-data-stored-in-external-storage-use-internal-storage-for-sensitive-data) that unencrypted internal app storage (/data/data/<package>/) is acceptable because of device encryption and sandboxing technologies such as process isolation. While valid for many casual, everyday threats, the view underestimates sophisticated attackers, privilege escalating malware, physical forensic analysis, supply chain risks, and backup exposure.

This overestimation frequently leads to a second, more damaging problem: development teams adopt the mindset that “the OS handles encryption and sandboxing, so we’re fine.” As a result, developers tend to relax application level encryption, reduce logging and monitoring controls, and deprioritize data minimization. Over time this erodes institutional knowledge and hard-won defensive best practices, creating technical debt that only surfaces at later points of time such as during an incident or audit. For high value data (e.g., auth tokens, cryptographic keys, financial, and PII such as health data), platform protections should be treated as necessary defense-in-depth layers, not as a complete and standalone protection.

**Disk Storage Realities:** Wear-leveling in flash memory and remnants within sectors on mechanical disks create false confidence in data deletion as old information can linger in unexpected ways. Wear-leveling means that even if you overwrite or delete a file, previous versions of the data may remain in unmapped flash blocks. Advanced adversaries with hardware access through interfaces such as JTAG could recover them. Application level encryption (with proper key management) provides much stronger guarantees than hoping the OS or flash controller erases data perfectly.

**Android Backup Pitfalls:** The default backup mechanism can inadvertently expose app data to cloud storage, underscoring the need for explicit opt-outs.

```html
<!-- AndroidManifest.xml -->

<application

    android:allowBackup="false"

    android:fullBackupContent="false"

    ... >
```

Failing to set android:allowBackup=”false” means sensitive data you thought was local and device-only can actually end up in the cloud or be accessible via local and remote ADB access.

These misconceptions help explain why sensitive data continues to appear in plaintext on disk, system logs, and backups when more robust and secure alternatives are available. With this context in mind, the following section examines how guidance on Android data storage has evolved and what current best practices look like when persisting sensitive data to disk is unavoidable.

## Android Data Storage Saga and Evolving Recommendations

For years, the recommended secure way to store sensitive values on Android was EncryptedSharedPreferences (Jetpack Security Crypto from androidx.security:security-crypto). This library wrapped SharedPreferences with encryption and Android Keystore. However, EncryptedSharedPreferences and the Jetpack Security Crypto library have been deprecated. Google no longer recommends or maintains it for new development. This library provided a familiar API, akin to SharedPreferences, while transparently encrypting values using Google’s open source crypto library, Tink, and storing keys via the Android Keystore.

## Why was EncryptedSharedPreferences and Jetpack Security Crypto Deprecated

Google has been notably quiet about the specific reasons behind the deprecation of EncryptedSharedPreferences. The only official statement from Google appears in the Android Cryptography documentation which notes that all APIs in the Jetpack Security Crypto library were deprecated in version 1.1.0 with no further releases planned. From what has been published online by Google and the online Android developer community, coupled with our analytical interpretation, it appears that this decision stems from the following rationale:

-   Inconsistencies and limitations in how EncryptedSharedPreferences interacted with the Android Keystore across different device manufacturers and Android versions.
-   Google has a clear strategic desire for developers to migrate to Jetpack DataStore as the single modern replacement for SharedPreferences. SharedPreferences is synchronous, lacks type safety, and does not work well with coroutines. DataStore was designed as the longer term, robust solution offering an asynchronous, coroutine friendly API, and improved type safety.
-   A preference for developers to use Tink more directly for cryptographic operations, giving development teams more control and visibility into the transformation and storage of data.
-   From Google’s perspective, continuing to maintain the Jetpack Security Crypto library represents an ongoing code maintenance burden. This library has to handle Android Keystore inconsistencies across manufacturer devices and Android versions. Maintaining and supporting two parallel storage approaches using the old encrypted SharedPreferences and the modern DataStore and Tink path is not sustainable long term.

While these are reasonable long term architectural decisions, the execution left many developers in a difficult spot for an extended period of time without clear guidance by Google on how to migrate away from the now deprecated solution.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/f37ba97000795db2.png)

## Modern Recommendation

Google does not currently provide a single authoritative and official source of documentation that combines Jetpack DataStore with Tink for secure local storage. Nevertheless, Google’s current position is clear, even if the migration path requires more work than before.

**Google now directs developers toward:**

-   Jetpack DataStore as the modern, coroutine-friendly, type-safe replacement for SharedPreferences.
-   Google Tink for all cryptographic operations, including authenticated encryption (AEAD) before any data touches disk for both short term and long term storage.

This approach still writes data to disk (you can’t avoid that for persistence, even short term data caching), but ensures it is never in plaintext and benefits from robust cryptography coupled with hardware-backed key protection via Android Keystore.

As a core design principle, if you can avoid persisting sensitive data to local disk, do so. Fetch from a secure backend when needed, or use short lived in-memory retention with proper zeroing of system memory. When local persistence is unavoidable (e.g., authenticator apps storing key material), encrypt data first with a robust and vetted library like Tink.

## Example Implementation of Modern Recommendations

In this section educational Android code is provided that demonstrates modern recommendations for secure data storage by integrating Jetpack DataStore for persistent key-value storage with Google Tink for encryption and key management. The goal is to store and retrieve sensitive data (e.g., “SuperDuperSecretValue123456”) in an encrypted form, ensuring a level of protection, even if the underlying storage is compromised.

### Overview of Integration

**Jetpack DataStore**: Acts as the storage layer. It’s a modern replacement for SharedPreferences, providing asynchronous, thread safe coroutine access to key-value pairs. In this example, DataStore is used to store Base64 encoded encrypted data.

**Tink**: Handles cryptographic operations. It provides an Authenticated Encryption with Associated Data (AEAD) primitive for implementing cryptographic routines (i.e., encrypting/decrypting data) securely. Keys are managed via AndroidKeysetManager, which integrates with Android’s Keystore for secure key storage.

Plaintext data is encrypted with Tink, Base64-encoded for safe string storage, then written to DataStore. Retrieval reverses this process by first reading from DataStore, Base64 decoding the read data, and subsequently decrypting with Tink.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/2164165d7500a4c5.png)

### Key Design Constructs and Usage

-   **AES-256-GCM via Tink:** Provides authenticated encryption (confidentiality and integrity/authenticity in one primitive).
-   **AndroidKeysetManager and Android Keystore:** Automatic key generation, support for key rotation, and hardware-backed master key protection when available.
-   **Base64 Encoding:** Allows ciphertext to be safely stored as a string in DataStore.
-   **Coroutine Friendly:** All I/O and crypto operations run off the main thread.

-   **Defense in Depth:** Even if the DataStore file is extracted, data remains encrypted and authenticated.

### Documented Example Code with Detailed Walkthrough

The following example is written in Kotlin. The code is released into the public domain for educational purposes. You may use, modify, and distribute it freely.

**Note on String vs. char\[\]/byte\[\] Data Type:** For highly sensitive secrets prefer working with char\[\] or byte\[\] rather than String data type. This allows the plaintext value stored in the data structure to be explicitly zeroed out from memory after use. Java and Kotlin’s String data type are immutable and can linger in memory longer than anticipated. [See our related post on immutable string data type security](https://blog.includesecurity.com/2025/11/immutable-strings-in-java-are-your-secrets-still-safe/) for a deeper discussion on String vs. char\[\]/byte\[\]:

```kotlin
package com.example.android_secure_data_storage


import android.content.Context
import android.os.Bundle
import android.util.Base64
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch


// ============================================================================
// SECTION 1: DATASTORE CONFIGURATION
// ============================================================================
private const val LOG_TAG = "SecureStorageDemo"
/**
* Preference file name for secure storage.
*
* This constant defines the name of the DataStore preference file where
* encrypted sensitive data will be stored persistently on the device.
*/
private const val PREFS_NAME = "secure_storage_prefs"
/**
* Extension property for easy access to secure DataStore.
*
* This creates a globally accessible DataStore<Preferences> instance
* that can be accessed from any Context using context.securePrefs.
*
* The [preferencesDataStore] delegate handles:
* - File creation and management
* - Transactional writes
* - Error handling for corrupted data
* - Automatic migrations if needed
*/
val Context.securePrefs: DataStore<Preferences> by preferencesDataStore(PREFS_NAME)


// ============================================================================
// SECTION 2: ENCRYPTED DATA STORAGE OPERATIONS
// ============================================================================


/**
* Creates and configures an AEAD (Authenticated Encryption with Associated Data) primitive.
*
* This function sets up Tink's AEAD encryption by:
* 1. Registering the AEAD configuration with Tink
* 2. Creating an AndroidKeysetManager to handle key creation and management
* 3. Configuring the manager with:
*    - Shared preferences location for keyset storage
*    - AES256_GCM key template (provides both confidentiality and integrity)
*    - Android Keystore URI for master key protection
* 4. Building the keyset handle and extracting the AEAD primitive
*
* AndroidKeysetManager Features:
* - Automatic key generation on first run
* - Key rotation capabilities when needed
* - Secure storage using Android Keystore (hardware-backed if available)
* - Automatic handling of keyset versioning and upgrades
*
* @param context The application context needed for shared preferences access
* @return An AEAD primitive configured with AES256_GCM for authenticated encryption
*/
private fun getAead(context: Context): Aead {
   // Step 1: Register AEAD configuration with Tink (safe to call multiple times)
   AeadConfig.register()


   // Step 2: Build the AndroidKeysetManager with secure key management
   val builder = AndroidKeysetManager.Builder()
       // Location of shared preferences for storing the keyset
       .withSharedPref(context, "aead_keyset", PREFS_NAME)
       // Use AES256_GCM key template (provides both confidentiality and integrity)
       .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
       // Master key URI pointing to Android Keystore for hardware-backed protection
       .withMasterKeyUri("android-keystore://aead_master_key")


   // Step 3: Build the keyset handle
   val keysetHandle = builder.build().keysetHandle


   // Step 4: Extract the AEAD primitive from the keyset handle
   return keysetHandle.getPrimitive(Aead::class.java)
}


// ============================================================================
// SECTION 3: MAIN ACTIVITY WITH SECURE STORAGE DEMONSTRATION
// ============================================================================


/**
* Minimal activity demonstrating secure data storage using Jetpack DataStore and Tink.
*
* This activity shows how to:
* - Set up encrypted preferences using DataStore with Tink AEAD encryption
* - Save sensitive data securely with automatic key management
* - Retrieve and decrypt sensitive data
*
* Security Features Implemented:
* - AES256_GCM authenticated encryption (provides confidentiality + integrity)
* - Automatic key management via AndroidKeysetManager
* - Hardware-backed key storage via Android Keystore (when available)
* - Transactional DataStore writes to prevent data corruption
*
* Use Cases:
* - Storing API keys, authentication tokens, or other sensitive credentials
* - Securely persisting user preferences that contain private information
* - Encrypting local database entries or cached sensitive data
*/
class MainActivity : AppCompatActivity() {


   /**
    * Coroutine scope for background operations.
    *
    * Uses Dispatchers.IO to perform disk I/O operations (DataStore reads/writes)
    * and cryptographic operations without blocking the main thread.
    *
    * This ensures the UI remains responsive during potentially long-running
    * operations like file I/O and encryption/decryption.
    */
   private val scope = CoroutineScope(Dispatchers.IO)


   /**
    * Saves sensitive data to encrypted DataStore.
    *
    * This function performs the following security operations:
    * 1. Obtains an AEAD (Authenticated Encryption with Associated Data) primitive
    * 2. Converts the string value to a bytes
    * 3. Encrypts the plaintext using AES256_GCM (provides confidentiality + integrity)
    * 4. Base64-encodes the encrypted bytes for safe storage
    * 5. Persists the encoded ciphertext to DataStore atomically
    *
    * @param key The preference key used to store the encrypted data
    * @param value The sensitive plaintext string to encrypt and store
    */
   private suspend fun saveSensitiveData(key: Preferences.Key<String>, value: String) {
       // Step 1: Get the AEAD primitive for encryption/decryption
       Log.d(LOG_TAG,"Registering AEAD Configuration with Tink")
       Log.d(LOG_TAG,"Building AndroidKeysetManager")
       val aead = getAead(this@MainActivity)


       // Step 2: Convert plaintext string to UTF-8 bytes
       Log.d(LOG_TAG,"Converting Plaintext String to UTF-8: $value")
       val plaintextBytes = value.toByteArray()
       Log.d(LOG_TAG,"Converted String UTF-8 Bytes: ${plaintextBytes.toHexString()}")


       // Step 3: Encrypt the plaintext using AEAD (no associated data)
       val encrypted = aead.encrypt(plaintextBytes, null)
       Log.d(LOG_TAG,"Encrypted UTF-8 Bytes: ${encrypted.toHexString()}")


       // Step 4: Base64-encode the encrypted bytes for safe storage
       val encoded = Base64.encodeToString(encrypted, Base64.DEFAULT)
       Log.d(LOG_TAG,"Base64 Encoding Encrypted Bytes and Storing output: $encoded")


       // Step 5: Write the encoded ciphertext to DataStore
       securePrefs.edit { prefs -> prefs[key] = encoded }
   }


   /**
    * Retrieves and decrypts sensitive data from DataStore.
    *
    * This function performs the following security operations:
    * 1. Reads the Base64-encoded ciphertext from DataStore
    * 2. Decodes the Base64 string back to encrypted bytes
    * 3. Obtains the AEAD primitive for decryption
    * 4. Decrypts the ciphertext using AES256_GCM (verifies integrity)
    * 5. Converts the decrypted bytes back to a string
    *
    * Note: AEAD decryption automatically verifies the integrity of
    * the ciphertext. If the data has been tampered with, decryption will fail.
    *
    * @param key The preference key where the encrypted data is stored
    * @return The decrypted plaintext string, or null if no data exists for the key
    */
   private suspend fun getSensitiveData(key: Preferences.Key<String>): String? {
       // Step 1: Read the encoded ciphertext from DataStore
       val encoded = securePrefs.data.first()[key]
       Log.d(LOG_TAG,"Retrieving and Decoding Stored Base64 Encoded Bytes: $encoded")


       // Step 2: Check if data exists for this key
       if (encoded == null) return null


       // Step 3: Decode the Base64 string to get encrypted bytes
       val decoded = Base64.decode(encoded, Base64.DEFAULT)
       Log.d(LOG_TAG,"Base64 Decoded Bytes: ${decoded.toHexString()}")


       // Step 4: Get the AEAD primitive for decryption
       val aead = getAead(this@MainActivity)


       // Step 5: Decrypt the ciphertext using AEAD (no associated data)
       Log.d(LOG_TAG,"Accessing AEAD Primitive and Decrypting Decoded Bytes")
       val decrypted = aead.decrypt(decoded, null)


       // Step 6: Convert decrypted bytes back to string and return
       return String(decrypted)
   }


   /**
    * Called when the activity is first created.
    *
    * Initializes the demonstration of secure storage by setting up
    * the cryptographic primitives and performing a save/retrieve cycle.
    */
   override fun onCreate(savedInstanceState: Bundle?) {
       super.onCreate(savedInstanceState)


       // Demonstrate the secure storage functionality
       demonstrateSecureStorage()
   }


   /**
    * Demonstrates saving and retrieving encrypted data from DataStore.
    *
    * This function performs a complete secure storage workflow:
    * 1. Generates a preference key for storing data
    * 2. Saves sensitive test data to encrypted DataStore
    * 3. Retrieves the same data from encrypted DataStore
    * 4. Outputs the retrieved value for verification
    *
    * All operations are performed in a coroutine scope to avoid blocking
    * the main thread during I/O and cryptographic operations.
    */
   private fun demonstrateSecureStorage() {
       // Launch a coroutine for background operations
       Log.d(LOG_TAG,"Starting IncludeSec Secure Storage Demo")
       val secretValue = "SuperDuperSecretValue123456"
       scope.launch {
           // Create the preference key for our sensitive data
           val key = stringPreferencesKey("SuperSecretIncludeSecSauce")


           try {
               // Step 1: Save sensitive data to encrypted DataStore
               Log.d(LOG_TAG,"Securely Storing Secret Value: $secretValue")
               saveSensitiveData(key, "SuperDuperSecretValue123456")


               // Step 2: Retrieve the encrypted data
               val retrieved = getSensitiveData(key)


               // Output the result for verification
               Log.d(LOG_TAG,"Retrieved value: $retrieved")
           } catch (e: Exception) {
               // Handle any errors that occur during the secure storage operations
               e.printStackTrace()
           }
       }
   }
}
```

### Example Code Logcat Output

The following logcat output shows the complete execution of the example implementation, com.example.android_secure_data_storage. The output steps through the full process lifecycle of securely storing and retrieving sensitive data from disk. In the output you can see logged events for initializing Tink and the Keystore backed keyset, encrypting the plaintext secret, Base64-encoding the resulting ciphertext, writing it to DataStore, then reversing the process by reading it back, decoding, and decrypting it to recover the original secret value.

```yaml
---------------------------- PROCESS STARTED (26208) for package com.example.android_secure_data_storage ----------------------------

2026-07-06 13:24:19.509 26208-26208 SecureStorageDemo       com...e.android_secure_data_storage  D  
Starting IncludeSec Secure Storage Demo

2026-07-06 13:24:19.513 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D  
Securely Storing Secret Value: SuperDuperSecretValue123456

2026-07-06 13:24:19.513 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D  
Registering AEAD Configuration with Tink

2026-07-06 13:24:19.513 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D  
Building AndroidKeysetManager

2026-07-06 13:24:19.651 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D  
Converting Plaintext String to UTF-8: SuperDuperSecretValue123456

2026-07-06 13:24:19.652 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D 
 Converted String UTF-8 Bytes: 5375706572447570657253656372657456616c7565313233343536

2026-07-06 13:24:19.653 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D  
Encrypted UTF-8 Bytes: 0188f76a9ddf73f11a67fc709f92067c14fad50fa74eb26899a2d3db14fe5b7bd2d7a76114e6e3ba599d297b89e63a37c598ee98165775a71e5208ac

2026-07-06 13:24:19.653 26208-26224 SecureStorageDemo       com...e.android_secure_data_storage  D  
Base64 Encoding Encrypted Bytes and Storing output: AYj3ap3fc/EaZ/xwn5IGfBT61Q+nTrJomaLT2xT+W3vS16dhFObjulmdKXuJ5jo3xZjumBZXdaceUgis

2026-07-06 13:24:19.671 26208-26226 SecureStorageDemo       com...e.android_secure_data_storage  D  
Retrieving and Decoding Stored Base64 Encoded Bytes: AYj3ap3fc/EaZ/xwn5IGfBT61Q+nTrJomaLT2xT+W3vS16dhFObjulmdKXuJ5jo3xZjumBZXdaceUgis

2026-07-06 13:24:19.672 26208-26226 SecureStorageDemo       com...e.android_secure_data_storage  D  
Base64 Decoded Bytes: 0188f76a9ddf73f11a67fc709f92067c14fad50fa74eb26899a2d3db14fe5b7bd2d7a76114e6e3ba599d297b89e63a37c598ee98165775a71e5208ac

2026-07-06 13:24:19.691 26208-26226 SecureStorageDemo       com...e.android_secure_data_storage  D  
Accessing AEAD Primitive and Decrypting Decoded Bytes

2026-07-06 13:24:19.691 26208-26226 SecureStorageDemo       com...e.android_secure_data_storage  D  
Retrieved value: SuperDuperSecretValue123456
```

### Example On Device Storage of Keyset and Encrypted Data

The following adb output demonstrates what is actually written to disk when using this modern recommended approach. When implementing this approach, two artifacts will appear under the application’s private data directory:

-   A SharedPreferences file containing the generated Tink keyset, which is protected by a master key stored within Android Keystore.
-   A DataStore file containing the base64 encoded ciphertext of the sensitive data value.

Notably and importantly, the original plaintext never appears on disk. This example sufficiently illustrates that while data is persisted to disk, it is only ever done as ciphertext produced by robust cryptographic primitives.

```html
user@HackBookProM4 ~ % adb shell

emu64a:/ # cd data/data/com.example.android_secure_data_storage

emu64a:/data/data/com.example.android_secure_data_storage # cat shared_prefs/secure_storage_prefs.xml                                                   

<?xml version='1.0' encoding='utf-8' standalone='yes' ?>

<map>

    <string name="aead_keyset">1288015871494e371cff16bc71f98437a97f36d008d50801c958abe24c42756076caef087543b06afecb3b6a81ff9fc7b1a652274a8ed182fa53d74ed8092bf30e8b66b86a4836062565414e8dc9921f05a1ef32a187836344075a32e3f6d8b04247173a79a8effd63cb2e1d1fb177d01ebfbdcf261c8b1f96a251aa26a1e10eb66d4b770bffdf304be2e71a4408e495bff00b123c0a30747970652e676f6f676c65617069732e636f6d2f676f6f676c652e63727970746f2e74696e6b2e41657347636d4b6579100118e495bff00b2001</string>

</map>

emu64a:/data/data/com.example.android_secure_data_storage # cat files/datastore/secure_storage_prefs.preferences_pbr

SuperSecretIncludeSecSauceT*RAb4PyuSpVa1zrjRNCP8+KCVSYe6TdBlt05XGfsxmPVsUtMFBXvxLTcXP3HGQz2mbJOpJbsETmUzkvIq8

emu64a:/data/data/com.example.android_secure_data_storage #
```

### Code Summary

1\. On first use, AndroidKeysetManager generates a new AES-256-GCM keyset, protects it with a master key in Android Keystore, and persists the keyset metadata (secure_storage_prefs.xml).

2\. Encryption: Plaintext → Tink AEAD.encrypt() → ciphertext bytes → Base64 → DataStore.

3\. Decryption: DataStore → Base64 decode → Tink AEAD.decrypt() (integrity check) → plaintext.

4\. Key rotation: Tink and AndroidKeysetManager support key rotation when needed.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/155f01f6dc0d7f02.png)

**Note:** Google now offers androidx.datastore:datastore-tink which provides an AeadSerializer wrapper for even simpler integration. The manual approach above remains fully supported, valid, educational, and gives you full control of the entire chain of events in the process from transforming plaintext and encrypted data, instantiating cryptographic primitives and performing cryptographic operations, and storing and retrieving the data. For example, consider this pseudo sample code highlighting the simplicity of the AeadSerializer implementation:

```kotlin
fun createEncryptedAppSettingsDataStore(context: Context): DataStore<AppSettings> {

   val appContext = context.applicationContext

   // --- Step 1: Create keyset with AndroidKeysetManager ---

   // --- *Cache the Keyset handle as a singleton outside of this code in prod

   val keysetHandle = AndroidKeysetManager.Builder()

       .withSharedPref(appContext, "app_settings_keyset", "keyset_prefs")

       .withKeyTemplate(KeyTemplate.createFrom(PredefinedAeadParameters.AES256_GCM))

       .withMasterKeyUri("android-keystore://app_settings_master_key")

       .build()

       .keysetHandle

   // --- Step 2: Create AeadSerializer that wraps your existing serializer ---

   val aeadSerializer = AeadSerializer(

       aead = keysetHandle.getPrimitive(RegistryConfiguration.get(), Aead::class.java),

       wrappedSerializer = ExampleUpdateMeSerializer,

       associatedData = "app_settings.json".encodeToByteArray() //Prevents ciphertext swapping attacks

   )

   // --- Step 3: Build the DataStore using the encrypted serializer ---

   return DataStoreFactory.create(

       produceFile = { File(appContext.filesDir, "app_settings.json") },

       serializer = aeadSerializer,

       corruptionHandler = ReplacementFileCorruptionHandler { AppSettings() },

       scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

   )

}
```

## Platform-Agnostic Best Practices (Do and Do Not)

|     |     |
| --- | --- |
| Do  | Do Not |
| Prefer keeping data in memory when possible. Use secure patterns (e.g., char\[\] byte array with explicit zeroing of system memory after use where the language allows).  <br>  <br>Leverage OS secure storage for keys and secrets (e.g., Android Keystore, iOS Keychain, Secure Enclave).  <br>  <br>Encrypt before persisting if disk storage is unavoidable. Always use authenticated encryption (AEAD).  <br>  <br>Apply least privilege: Restrict file permissions, use sandboxing technologies such as isolated processes and application directories.  <br>  <br>Avoid external storage for storage of sensitive data, especially if the data is unencrypted. External storage is more easily subjected to theft.  <br>  <br>Purge old/unused sensitive data aggressively (retention results in increased and unavoidable risk).  <br>  <br>Opt out of automatic backups for applications handling sensitive data. For example, on Android – android:allowBackup=”false”.  <br>  <br>For web-based content, use proper HTTP Cache-Control headers (i.e., Cache-Control: no-store) to avoid caching sensitive response data from the web application server.  <br>  <br>Log and monitor access to sensitive storage paths and files. This is important for audibility in the event of unauthorized data access. | Never write sensitive data to disk in plaintext (e.g., databases, SharedPreferences, files, logs, caches).  <br>  <br>Do not assume system memory is inherently safe.  <br>  <br>Avoid custom cryptographic implementations. Use well maintained libraries with a robust record of security assessment.  <br>  <br>Do not rely solely on OS protections such as full disk encryption and process isolation/sandboxing.  <br>  <br>Aggressively audit and purge old data. Prolonged retention just adds unnecessary risk. |

## When You Must Store Sensitive Data Locally

-   Encrypt with an AEAD encryption scheme.
-   Store keys in hardware-backed cryptographic containers (e.g., Keystore, Keychain).
-   Minimize what you store. For example, prefer short-lived tokens over long-lived refresh secrets when possible. This is an added layer of defense in depth security.
-   Implement secure deletion where feasible and consider data retention policies.
-   Undergo regular security assessments.

## Conclusion

Writing sensitive data to disk is a practice whose risks have only grown with the sophistication of attacks and the persistence characteristics of modern storage media. While operating systems provide valuable defensive layers of protection, they are not a substitute for application security best practices. For example, real world examples continue to surface:

CVE-2019-11384 details a vulnerability wherein the Zalora Android application was found storing credentials (i.e., username and password) in plaintext SharedPreferences. More recently, CVE-2025-25381 highlighted a similar vulnerability wherein the KSRTC Karnataka Android Application was also storing user credentials along with personally identifiable information (PII) specific to the application user. Broader research work continues to reinforce the same lesson. Microsoft’s Dirty Stream research, for example, demonstrated how path traversal vulnerabilities in popular and widely installed android applications could be leveraged to gain access to private app storage (/data/data/<package>). In several instances, Microsoft demonstrated that these affected applications were writing authentication tokens, credentials, and other sensitive data to disk as plaintext, making extraction trivial once an avenue was identified that permitted crossing of the Android sandbox boundary.

I’ve experienced this on a more personal level while working on major technology in the VR space. Finding sensitive data written to disk in Android VR applications was commonplace, and it is what first brought this widespread misunderstanding and lack of awareness to my attention.

By adopting Jetpack DataStore and Tink (or the newer datastore-tink integration), Android developers can achieve strong encryption for persisted data while following current Google recommendations. Most importantly, always ask the following question before persisting data to disk: Does this data NEED to exist on this device at all?

Security is cumulative. Every layer you add from data minimization, disk and file encryption, backup opt-out, and least privilege all contribute to a defensive security posture that makes exploitation meaningfully harder. The goal isn’t perfect security; it’s raising the cost of attack beyond what is economically viable for adversaries while maintaining and building on historical security practices.

So remember to write as little sensitive data to disk as possible, and when doing so, use robust cryptographic constructs to ensure protection when stored at rest.

## References

**Android Datastore:** [https://developer.android.com/jetpack/androidx/releases/datastore](https://developer.android.com/jetpack/androidx/releases/datastore)

**Android Crypography:** [https://developer.android.com/privacy-and-security/cryptography](https://developer.android.com/privacy-and-security/cryptography)

**Java Immutable String Security:** [https://blog.includesecurity.com/2025/11/immutable-strings-in-java-are-your-secrets-still-safe/](https://blog.includesecurity.com/2025/11/immutable-strings-in-java-are-your-secrets-still-safe/)

**What is TINK?:** [https://developers.google.com/tink/what-is](https://developers.google.com/tink/what-is)

**AeadSerializer:** [https://developer.android.com/reference/kotlin/androidx/datastore/tink/AeadSerializer](https://developer.android.com/reference/kotlin/androidx/datastore/tink/AeadSerializer)

**Android Sensitive Data Stored in External Storage:** [https://developer.android.com/privacy-and-security/risks/sensitive-data-external-storage  
](https://developer.android.com/privacy-and-security/risks/sensitive-data-external-storage)**Android Improve Your App’s Security:** [https://developer.android.com/privacy-and-security/security-best-practices](https://developer.android.com/privacy-and-security/security-best-practices)

**CVE-2019-11384 (Zalora app storing credentials in plaintext SharedPreferences)):** [https://nvd.nist.gov/vuln/detail/CVE-2019-11384](https://nvd.nist.gov/vuln/detail/CVE-2019-11384)

**CVE-2025-25381 (KSRTC app storing passwords and PII in plaintext SharedPreferences):** [https://github.com/edwin-0990/CVE_ID/tree/main/CVE-2025-25381](https://github.com/edwin-0990/CVE_ID/tree/main/CVE-2025-25381)

**“Dirty stream” attack: Discovering and mitigating a common vulnerability pattern in Android apps:** [https://www.microsoft.com/en-us/security/blog/2024/05/01/dirty-stream-attack-discovering-and-mitigating-a-common-vulnerability-pattern-in-android-apps/](https://www.microsoft.com/en-us/security/blog/2024/05/01/dirty-stream-attack-discovering-and-mitigating-a-common-vulnerability-pattern-in-android-apps/)

The post [EncryptedSharedPreferences is Dead: Here’s What You Should Use Instead](https://blog.includesecurity.com/2026/08/encryptedsharedpreferences-is-dead-heres-what-you-should-use-instead/) appeared first on [Include Security Research Blog](https://blog.includesecurity.com/).
