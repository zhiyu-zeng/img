---
title: "The Complete Guide to Remote Compose: Native Server-Driven UI (AI Writen)"
source: https://dispatchersdotplayground.hashnode.dev/the-complete-guide-to-remote-compose-native-server-driven-ui-ai-writen
source_host: dispatchersdotplayground.hashnode.dev
clip_date: 2026-11-19T10:50:24+08:00
trace_id: 3f1ffbad-db55-47e5-ad72-d45f65d5dd23
content_hash: 8160582bf17e63897e253bab625c496140bacc152ceb081f8db3cd1e426c36fc
status: synced
tags: []
series: null
feed_source: Stavro·Android逆向
ai_summary: null
ai_summary_style: null
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 41d75244-d011-81ab-b15d-feae83b365e9
ioc: null
---

Remote Compose (`androidx.compose.remote`) is an experimental Jetpack framework that allows you to define UI on a backend and render it natively on Android. Unlike traditional Server-Driven UI (SDUI) that sends JSON to be mapped to pre-built client components, Remote Compose serializes raw drawing and layout instructions into a compact binary format.

* * *

## 1\. Core Concepts

-   **Drawing-Level Serialization:** The server doesn't just say "Show a button"; it sends instructions for shapes, colors, text, and touch regions.
-   **Binary Protocol:** UIs are compiled into `.rc` binary files (or byte arrays), bypassing the overhead of large JSON parsing.
-   **Native Rendering:** The client "plays" the binary instructions directly on the Canvas, achieving performance indistinguishable from local code.

* * *

## 2\. Server-Side Implementation (JVM/Ktor)

The server defines the UI using a DSL that mirrors Jetpack Compose but runs on a standard JVM (no Android SDK required).

### A. Dependencies (build.gradle.kts)

```kotlin
dependencies {
    val remoteVersion = "1.0.0-alpha12"
    implementation("androidx.compose.remote:remote-core:$remoteVersion")
    implementation("androidx.compose.remote:remote-creation:$remoteVersion")
    implementation("androidx.compose.remote:remote-creation-jvm:$remoteVersion")
}
```

### B. Defining the Layout

Use `RemoteComposeContext` to build your document.

```kotlin
fun buildDemoDocument(title: String): ByteArray {
    val context = RemoteComposeContext(
        width = 400,
        height = 640,
        apiLevel = 7,
        platform = RcPlatformServices.None 
    ) {
        root {
            column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(0xFFF5F5F5.toInt())
                    .padding(24f),
                horizontal = ColumnLayout.CENTER
            ) {
                text(title, fontSize = 28f, fontWeight = 700f)
                
                box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50f)
                        .clip(RoundedRectShape(12f, 12f, 12f, 12f))
                        .background(0xFF6750A4.toInt())
                        // HostAction sends a named event back to the client
                        .onClick(HostAction("demo_button_tapped")) 
                ) {
                    text("Tap Me", color = 0xFFFFFFFF.toInt())
                }
            }
        }
    }
    return context.buffer() // The binary payload
}
```

* * *

## 3\. Client-Side Implementation (Android)

### A. Environment Requirements

Remote Compose Alpha (as of `alpha12`) requires modern Android APIs. Update your `app/build.gradle.kts`:

-   **compileSdk:** 37
-   **minSdk:** 29 (Android 10)
-   **targetSdk:** 37

### B. Dependencies

```kotlin
// libs.versions.toml
remoteCompose = "1.0.0-alpha12"
androidx-remote-player = { module = "androidx.compose.remote:remote-player-view", version.ref = "remoteCompose" }
androidx-remote-player-core = { module = "androidx.compose.remote:remote-player-core", version.ref = "remoteCompose" }

// app/build.gradle.kts
implementation(libs.androidx.remote.player)
implementation(libs.androidx.remote.player.core)
```

### C. Manifest & Networking

If testing on a local machine via the emulator:

1.  **IP Address:** Use `http://10.0.2.2:8080` to point to your computer's localhost.
2.  **Cleartext:** Enable cleartext traffic for HTTP (for demos only).

```xml
<uses-permission android:name="android.permission.INTERNET" />
<application
    android:usesCleartextTraffic="true"> 
</application>
```

* * *

## 4\. The Android Player (MainActivity.kt)

Since `RemoteComposePlayer` is a native Android `View`, wrap it in `AndroidView`.

```kotlin
@Composable
fun RemoteContent(url: String) {
    var bytes by remember { mutableStateOf<ByteArray?>(null) }

    LaunchedEffect(url) {
        HttpClient(OkHttp).use { client ->
            bytes = client.get(url).readRawBytes()
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        bytes?.let { rawBytes ->
            @SuppressLint("RestrictedApi")
            AndroidView(
                factory = { ctx ->
                    RemoteComposePlayer(ctx).apply {
                        setupPlayer(this, rawBytes)
                    }
                },
                update = { player ->
                    setupPlayer(player, rawBytes)
                },
                modifier = Modifier.fillMaxSize()
            )
        } ?: CircularProgressIndicator()
    }
}

@SuppressLint("RestrictedApi")
private fun setupPlayer(player: RemoteComposePlayer, bytes: ByteArray) {
    val doc = RemoteDocument(bytes)
    player.setDocument(doc)
    
    val coreDoc = doc.getDocument()
    
    // Handle Named Actions (HostAction)
    coreDoc.addActionCallback { name, value ->
        Log.d("RemoteCompose", "Named Action: $name")
        Toast.makeText(player.context, "Action: $name", Toast.LENGTH_SHORT).show()
    }
    
    // Handle ID-based actions
    coreDoc.addIdActionListener { id, metadata ->
        Log.d("RemoteCompose", "ID Action: $id")
    }
}
```

* * *

Result:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e943e58297d50894.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/7d8615fcd49bee46.png) ![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/4828a7463878cbab.png)

## 5\. Pros and Cons

### Pros

-   **Instant Updates:** Change layout, colors, and logic on the server and see them in the app instantly without a Play Store release.
-   **Binary Performance:** Binary instructions are significantly faster to parse and execute than equivalent JSON trees.
-   **Absolute Flexibility:** The server can send raw drawing instructions. You aren't limited to a pre-defined set of components in the client APK.
-   **Native Accessibility:** Automatically generates native Accessibility nodes for screen readers.

### Cons

-   **Extreme Immaturity:** As of `alpha12`, the API is unstable. It is strictly for experimentation and internal tooling.
-   **Zero Documentation:** There are no official guides. Knowledge must be extracted from the AndroidX source code or library metadata.
-   **Restricted APIs:** Most core functions are hidden behind `@RestrictTo(LIBRARY_GROUP)`, requiring `@SuppressLint("RestrictedApi")` to function.
-   **Network Dependency:** If the network fails, the UI is gone. Robust caching strategies must be built manually.
-   **Tooling Gap:** You lose standard Compose luxuries like Previews and the Layout Inspector for the remote sections of your app.

* * *

## 6\. Summary: When to use it?

Remote Compose is ideal for highly dynamic sections of an app?such as seasonal banners, promotional dashboards, or configuration-heavy admin panels?where the cost of a full APK update cycle is too slow, but the performance of a WebView is unacceptable.
