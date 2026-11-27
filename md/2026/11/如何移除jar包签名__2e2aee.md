---
title: 如何移除jar包签名
source: https://akjoson.github.io/2025/12/10/%E5%A6%82%E4%BD%95%E7%A7%BB%E9%99%A4jar%E5%8C%85%E7%AD%BE%E5%90%8D/
source_host: akjoson.github.io
clip_date: 2026-11-27T10:46:36+08:00
trace_id: fc7ebd5c-424a-4dbe-9a52-dc219ed93175
content_hash: 23a9b67e6990cab74f990367b1ef25507ffedbc75709946b933b5b27634ae4a9
status: synced
tags: []
series: null
feed_source: 殷仔·Android Binder
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 42575244-d011-81e7-98d8-e6feafe940c5
ioc: null
---

### 编译项目遇到SHA-256 digest error for org/bouncycastle/LICENSE.class

### 经过：从Gradle7.x升级到Gradle 8.x遇到如上错误

### 解决方案：

-   ./gradlew app:dependencies 找到是谁依赖了bouncycastle
    
-   排除大法
    
    ```
    implementation("com.example:some-library:1.0.0") {
        exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'
    }
    ```
    
-   将bouncycastle这个jar包，使用命令:
    
    -   解开jar包的衣服：jar xf bouncycastle.jar
        
    -   删除META-INF/.SF META-INF/*.RSA META-INF/*.DSA（注意保留MANIFEST.MF，不然找不到代码哦）
        
    -   给jar包穿上衣服 jar cf bouncycastle-nosign.jar \*
        
-   将我们自己弄出来的没有签名的jar包放进libs目录
    
-   运行项目，一切ok！
