---
title: Flutter apk build success, build tool couldn't find it
source: https://akjoson.github.io/2025/09/30/Flutter-apk-build-success-build-tool-couldn-t-find-it/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:45:46+08:00
trace_id: 5cb97b2d-31ee-4f94-ad89-88388a56bf57
content_hash: f79f489a15ffb42a26d3c03beb8cbf9128ae81c381a4966c6573992ed154e4cd
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 1
  succeeded: 1
  failed_urls: []
notion_page_id: 42575244-d011-8114-b136-c756f395b915
ioc: null
---

#### When compiling an Android APK in a Flutter project, it prompts that the compiled APK cannot be found.

```java
Error: Gradle build failed to produce an .apk file. It's likely that this file was generated under /Users/pengyin/Downloads/program/company/hilife/hilife3inone-flutter/build, but the tool couldn't find it.
```

#### In android/build.gradle, you can see the ‘product&staging’ flavor

```javascript
productFlavors {
    product {
        dimension "app"
        buildConfigField("boolean", "LOG_WRITE_DISABLE", "true")
        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a'
        }
    }

    staging {
        dimension "app"
        buildConfigField("boolean", "LOG_WRITE_DISABLE", "false")
        ndk {
            abiFilters 'armeabi-v7a', 'arm64-v8a'
        }
    }
```

![Image text](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/11/e4c04daa3322b6ec.png)
