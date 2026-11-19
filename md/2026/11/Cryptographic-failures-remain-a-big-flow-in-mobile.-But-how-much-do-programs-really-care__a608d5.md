---
title: Cryptographic failures remain a big flow in mobile. But how much do programs really care?
source: https://dispatchersdotplayground.hashnode.dev/cryptographic-failures-remain-a-big-flow-in-mobile-but-how-much-do-programs-really-care
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:49:23+08:00
trace_id: 878e466a-132c-4d8e-aba6-e04c8b1fef95
content_hash: f2787d8fec2b3e3b3ab19fd3e9434686fbba07ee88ead3d3c5b6831b3543fb89
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 41d75244-d011-81d1-a5ce-c01c5ae16817
ioc: null
---

This post is inspired by an experience I had with one Bug Bounty program. Basically, the subject app under test had a completely broken cryptography layer, which I was able to replicate in a separate Kotlin application independently of the app and decrypt any secret that came from their server. However, the triager reviewing the report deemed it a theoretical problem and, without much effort, closed it as informative. They did not allow me to go public either. My whole point was that if this is not a security concern for them, I should have the right to talk about it openly. Unfortunately, the privacy policy of such Bug Bounty platforms does not, by default, allow disclosing such bugs unless explicitly written permission has been given by the program. Thus, I have no other option than to treat this case theoretically without mentioning the company details at all. Let it serve as an example of why one should not implement cryptography in their mobile application, or how useless cryptography is if not done right.

*In this post, every Java or Kotlin code snippet has been modified, so it does not exactly match the real-case scenario.*

> Whenever you need to secure your mobile application, I’m just [one step away](https://apksherlock.com/contact/).

The broken cryptography still remains to be a big issue, the impact of which is well documented in the OWASP [website](https://owasp.org/www-project-mobile-top-10/2014-risks/m6-broken-cryptography). This particular case dealt with a chain of handshakes coming directly from the server and stored in the app’s shared preferences. The interesting part was that this scenario was impossible to replicate via proxies like Burp because, as I discovered afterward, the chain from handshake 1 to handshake 2 would always fail with a quick timeout. But more on that later. Since I’ve been a coder for my entire career, it was easier to play the script kiddie instead of configuring some Burp Intruder to do it for me.

### Security through obscurity

In the beginning, I saw this piece of code:

```kotlin
val PASSWORD = "?:%&#$%#$%!#$!@$ !@#$!@#%%!%!@#$!@#!%!@$!@$!%!@#!@#$!%%!@#!@#!@#@$%!"
```

This was not the real cryptographic key. The real cryptographic key was extracted from this variable in a (not so) complicated dead code function.

```kotlin
fun getPassword(): String {
   deadFunction1()
   deadFunction2()
   return if(operation3ReturningFalse()){
     deadFunction3()
   }
   return when {
      DEAD_FALSE_VARIABLE, SOME_OTHER_STUPID_VARIABLE -> returnWrongPassword()
      else -> PASSWORD.split(" ").first()
   }
}
```

The problem is already solved. But let’s prove that it’s totally possible to decrypt secrets. The encryption and decryption methods are actually pretty standard and straightforward, which I replicated in a small PoC:

```kotlin

fun encrypt(rawValue: String): String? {
    try {
        val cipher = Cipher.getInstance("<THEIR ALGORITHM>")
        iv = generateIV()
        val bytes = iv.toByteArray(UTF_8)
        cipher.init(1, secretKey(), IvParameterSpec(bytes))
        val bytes2 = rawValue.toByteArray(UTF_8)
        return Base64.encode(cipher.doFinal(bytes2))
    } catch(e: Error) {
        redacted()
    }
}

fun decrypt(serverSecret: String?, incomingIV: String): String {
    try {
    val decoded = Base64.decode(serverSecret!!, 0)
    val bytes = incomingIV.toByteArray(UTF_8)
    val ivParameterSpec = IvParameterSpec(bytes)
    val cipher = Cipher.getInstance("<THEIR ALGORITHM>")
    cipher.init(2, secretKey(), ivParameterSpec)
    serverSecret?.let {
        val doFinal = cipher.doFinal(Base64.decode(serverSecret, 0))
        return String(doFinal, UTF_8)
     }
    } catch (e: Exception) { redacted() }
}
```

The `secretKey()` just returns the `SecretKey` object that was hardcoded above. The only unknown variable was the initialization vector, which was also quite easy to “reverse engineer”.

```kotlin
fun generateIV(): String {
    val stringCharactersLowerCase = "<another hardcoded rule>";
    val secureRandom = SecureRandom() //the irony
    ...redacted
    return sb2
}
```

Once the initial initialization vector was obtained, the app contacted the server to retrieve a unique key to identify the device trying to authenticate, which, again, was easily replicated and quite predictable:

```kotlin
fun generateDeviceKey(unique: String): String {
    val formatted = "%s.%d%d%d".format(unique, random1, getCurrentTimeStamp(), random2)
    val encrypted = encrypt(formatted)?.replace("\n", "")
    val combined = redacted....
    val bytes = combined.toByteArray(Charsets.UTF_8)
    return Base64.encode(bytes)
}
```

This unique key would just merge with something they called a device key, which was nothing more than a combination of the incoming unique key, two random values, and the current timestamp, encrypted and then encoded into Base64. The value was used to retrieve an identically generated string with the exact same properties from the server, and it seemed to have been baptised with the name *handshake*—i.e., the server had the exact same function that responded as described above. There’s a high chance they were comparing the timestamps, because it was not possible to replicate this manually using Burp. Rather, I had to write my own `OkHttp` client (or some python script).

```kotlin
fun decodeServerResponse(serverToken: String): String {
    val bytes = serverToken.toByteArray(UTF_8)
    val decode: ByteArray = Base64.decode(bytes)
    return String(decode, UTF_8)
}
```

This code was not encrypted, only encoded, but it contained two encrypted values that were later used in the request headers for the final request.

```kotlin
val split = decodedResponseValue.split("SOME_DELIMITER")
```

And if you followed along, we have everything we need to decrypt those values:

```kotlin
// first param the value, second param the iv
val decryption = decrypt(split.first(), split.last())
```

The third request was just putting everything together.

```kotlin
 val finalRequest = Request.Builder()
   .url(BaseUrl + Login)
   .post(finalRequestBody)
   .requestHeaders(contentLength = "182", deviceHeader = body.unique)
   .specialRequestHeaders(
        handshake2 = tokenObj.handshake2,
        handshake1 = tokenObj.handshake1,
        oneTimeKey = redacted...
        verification = tokenObj.verificationString
    ).build()
```

Another thing that made all this possible was the hardcoding of the JWT token and other headers in the build config:

```kotlin
addHeader(
            "Authorization",
            "Bearer <NOTHING FANCY HERE>"
        )

addHeader(
            "Some-Other-Header",
            "redacted"
        )
```

It only served for this chain of requests, though; therefore, no bigger impact (or so I concluded at that time).

Since I was able to replicate the whole cryptography layer independently of the app, the only thing remaining was to just run the mini client and see if I could actually decrypt the incoming so-called secrets.

```kotlin
client.newCall(finalRequest).execute().use { finalResponse ->
                                if (finalResponse.isSuccessful) {
                                    println("Final Response: ${finalResponse.body?.string()}")
                                } else {
                                    println("Looser")
                                }
                            }
```

And the result:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/085539e892f8d1ca.png)

In the end, this whole process was just done to retrieve the users’ access token. In my opinion, this whole chain of events was entirely useless and poorly implemented, yet it served as a perfect exercise for reverse engineering the entire cryptography layer. With such logic, I could decrypt any secret that existed on their server.

### You could go in two directions to fix this problem:

1 – Utilize the power of Android `KeyChain` to manage the cryptographic key securely.

2 – Entirely remove this encryption layer, as it does not make any sense—unless it is there to protect access to `SharedPreferences` from another attack vector, such as a `WebView` flaw. Yet again, what would be the point of storing an encrypted value when the attacker has already broken down the entire decryption process?

## Conclusion

Developers should be very careful with their cryptography layer if they want to put effort into securing mobile apps. One can easily reverse engineer an APK, and a cryptographic key is easily found within seconds. Also, stay away from security through obscurity. Writing a function with a lot of dead code is far more co than simply implementing solutions like the Android `KeyChain`.

*Do you have an app you need to secure? I can definitely help you with that. Feel free to* [*contact me*](https://apksherlock.com/contact/) *whenever you need to.*
