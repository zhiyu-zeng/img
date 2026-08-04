---
title: OpenSSL 实战：构建安全 HTTP 请求与反抓包体系，保护核心业务数据 // CYRUS STUDIO
source: https://cyrus-studio.github.io/blog/posts/openssl-%E5%AE%9E%E6%88%98%E6%9E%84%E5%BB%BA%E5%AE%89%E5%85%A8-http-%E8%AF%B7%E6%B1%82%E4%B8%8E%E5%8F%8D%E6%8A%93%E5%8C%85%E4%BD%93%E7%B3%BB%E4%BF%9D%E6%8A%A4%E6%A0%B8%E5%BF%83%E4%B8%9A%E5%8A%A1%E6%95%B0%E6%8D%AE/
source_host: cyrus-studio.github.io
clip_date: 2026-08-04T14:18:09+08:00
trace_id: 62ad0c1e-f2c5-4f9f-8195-03946f69b178
content_hash: b4ec74237e0d1becfdd5ab69abec296d07d15ee5702c1d5c08a9f4481a1ebcfa
status: synced
tags:
  - Android逆向
  - 协议分析
series: null
feed_source: Cyrus Studio·安卓逆向
ai_summary: 基于OpenSSL在Android Native层实现HTTPS通信与SSL Pinning反抓包，可在TLS握手阶段拒绝Charles/Fiddler等中间人代理，保护敏感业务数据。
ai_summary_style: key-points
images_status:
  total: 5
  succeeded: 5
  failed_urls: []
notion_page_id: 3b275244-d011-8189-b01f-dc6e63f653e1
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 基于OpenSSL在Android Native层实现HTTPS通信与SSL Pinning反抓包，可在TLS握手阶段拒绝Charles/Fiddler等中间人代理，保护敏感业务数据。
> 
> - **编译OpenSSL：** 用NDK r27b，执行`perl Configure android-arm64 no-shared no-tests -D__ANDROID_API__=24`后`make install_sw`，生成libssl.a和libcrypto.a；换ABI只需改target/prefix并`make clean`。
> - **工程集成：** 将头文件和静态库放入openssl模块，CMake中以IMPORTED方式引入OpenSSL::SSL和OpenSSL::Crypto，封装为openssl_utils供上层模块链接。
> - **请求实现：** 两种路径——直接调用`OSSL_HTTP_get`高级API由OpenSSL处理握手与HTTP；或用`BIO_new_ssl_connect`手动设置SNI、`BIO_do_connect`握手并构造HTTP报文。
> - **反抓包三层机制：** 只从`/system/etc/security/cacerts`加载系统根证书隔离用户CA；`verifyCallback`检查Issuer含charles/fiddler/canary即失败；用`X509_pubkey_digest`计算公钥SHA-256做动态白名单，同一域名哈希不一致则返回0终止握手。
> - **实际效果：** 校验在TLS握手阶段完成，连接在HTTP请求发送前断开，因此Charles中连请求记录都看不到（对比OkHttp可正常抓到请求）。

> 版权归作者所有，如有转发，请注明文章出处： [https://cyrus-studio.github.io/blog/](https://cyrus-studio.github.io/blog/)

## 前言

OpenSSL 是目前业界广泛使用的开源安全通信库，提供 TLS/SSL 协议实现、证书验证、加密算法、数字签名以及安全随机数等核心安全能力。相比 Android 系统自带的网络框架，OpenSSL 允许开发者在 Native 层直接控制 TCP/TLS 连接过程，实现更细粒度的安全策略和证书校验逻辑。

对于涉及配置下发、风控策略、反作弊参数、授权信息等敏感业务请求，采用 OpenSSL 在 Native 层实现 HTTPS 通信具有更高的安全性。一方面，请求逻辑、协议处理以及证书校验代码位于 Native 层，可有效提高静态分析和逆向分析成本；另一方面，可结合 SSL Pinning（证书锁定）或公钥锁定技术，在 TLS 握手过程中主动验证服务端证书，即使攻击者在设备中安装了自定义 CA 证书，也无法通过 Charles、Fiddler、Burp Suite 等中间人代理工具解密和篡改通信内容。

OpenSSL 开源地址： [https://github.com/openssl/openssl](https://github.com/openssl/openssl)

把 openssl 源码 clone 到本地，这里用的是 openssl-3.5.4，先切换到 openssl-3.5.4

```bash
git checkout -b openssl-3.5.4 openssl-3.5.4
```

## 1\. 安装依赖

安装相关依赖

```
sudo apt update
sudo apt install -y build-essential perl make unzip wget
```

下载 Linux 版 NDK r27b：

```
mkdir -p ~/ndk
cd ~/ndk

wget https://dl.google.com/android/repository/android-ndk-r27b-linux.zip
unzip android-ndk-r27b-linux.zip
```

## 2\. 编译 OpenSSL

编译 OpenSSL arm64：

```bash
export ANDROID_NDK_ROOT=~/ndk/android-ndk-r27b
export PATH=$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH

cd /mnt/d/Projects/openssl

perl Configure android-arm64 no-shared no-tests \
  --prefix=/mnt/d/Projects/openssl/build/arm64-v8a \
  -D__ANDROID_API__=24

make -j$(nproc)
make install_sw
```

编译完成后会在这里：

```swift
/mnt/d/Projects/openssl/build/arm64-v8a/include
/mnt/d/Projects/openssl/build/arm64-v8a/lib/libssl.a
/mnt/d/Projects/openssl/build/arm64-v8a/lib/libcrypto.a
```

如果你后面还要编 armeabi-v7a、x86_64，只要换 target 和 prefix：

```ruby
# armeabi-v7a
perl Configure android-arm no-shared no-tests \
  --prefix=/mnt/d/Projects/openssl/build/armeabi-v7a \
  -D__ANDROID_API__=24

# x86_64
perl Configure android-x86_64 no-shared no-tests \
  --prefix=/mnt/d/Projects/openssl/build/x86_64 \
  -D__ANDROID_API__=24
```

每次换 ABI 前建议清一下：

```
make clean
```

编译成功

[![word/media/image1.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/7ca66ee55180daac.png)](data:image/png;base64,inline-97686B)

在 build 目录下可以找到已经编译好的 libcrypto.a、libssl.a

 [![word/media/image2.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/80e0b2ee5882bf77.png)](data:image/png;base64,inline-56594B)预编译库按 ABI 分类存放于以下路径：

-   `build/${ANDROID_ABI}/lib/`: 存放 `libssl.a` 和 `libcrypto.a` 。
    
-   `build/${ANDROID_ABI}/include/`: 存放 OpenSSL 头文件。
    

## 3\. 集成到 Android Studio

新增 openssl 模块，把 openssl 的头文件和静态库 copy 到工程里面

[![word/media/image3.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/910e6a183e972e46.png)](data:image/png;base64,inline-37442B)

CMakeLists.txt 配置示例：

```powershell
cmake_minimum_required(VERSION 3.22.1)

project(openssl_prebuilt)

# 定义 OpenSSL 根目录（当前目录）
set(OPENSSL_ROOT "${CMAKE_CURRENT_SOURCE_DIR}")
set(OPENSSL_ABI_ROOT "${OPENSSL_ROOT}/${ANDROID_ABI}")

message(STATUS "Loading OpenSSL from: ${OPENSSL_ABI_ROOT}")

# 校验头文件
if (NOT EXISTS "${OPENSSL_ABI_ROOT}/include/openssl/ssl.h")
    message(FATAL_ERROR "OpenSSL headers not found for ${ANDROID_ABI} at: ${OPENSSL_ABI_ROOT}/include")
endif ()

# 校验库文件
if (NOT EXISTS "${OPENSSL_ABI_ROOT}/lib/libssl.a")
    message(FATAL_ERROR "OpenSSL libssl.a not found for ${ANDROID_ABI} at: ${OPENSSL_ABI_ROOT}/lib/libssl.a")
endif ()

if (NOT EXISTS "${OPENSSL_ABI_ROOT}/lib/libcrypto.a")
    message(FATAL_ERROR "OpenSSL libcrypto.a not found for ${ANDROID_ABI} at: ${OPENSSL_ABI_ROOT}/lib/libcrypto.a")
endif ()

# 定义 SSL 静态库
add_library(OpenSSL::SSL STATIC IMPORTED GLOBAL)
set_target_properties(OpenSSL::SSL PROPERTIES
    IMPORTED_LOCATION "${OPENSSL_ABI_ROOT}/lib/libssl.a"
    INTERFACE_INCLUDE_DIRECTORIES "${OPENSSL_ABI_ROOT}/include"
)

# 定义 Crypto 静态库
add_library(OpenSSL::Crypto STATIC IMPORTED GLOBAL)
set_target_properties(OpenSSL::Crypto PROPERTIES
    IMPORTED_LOCATION "${OPENSSL_ABI_ROOT}/lib/libcrypto.a"
    INTERFACE_INCLUDE_DIRECTORIES "${OPENSSL_ABI_ROOT}/include"
)

# --- OpenSSL 通用工具库 ---
# 这是一个可编译的库，包装了常用的 OpenSSL 操作，如 HTTP 请求和反抓包
add_library(openssl_utils STATIC ossl_http_client.cpp)

target_include_directories(openssl_utils PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")

target_link_libraries(openssl_utils
    PRIVATE
        OpenSSL::SSL
        OpenSSL::Crypto
        log
)

# 使 openssl_utils 在外部模块（如 library 和 app）中可用
add_library(OpenSSL::Utils ALIAS openssl_utils)
```

settings.gradle.kts 包含 openssl 模块

```
include(":openssl")
```

在你的模块的 `CMakeLists.txt` 中引入并链接：

```bash
# 1. 引入 openssl 子项目（路径需根据实际目录层级调整）
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../../../../openssl openssl)

# 2. 链接 OpenSSL::Utils
# 该库包含了封装好的 HTTP 客户端及核心 OpenSSL (SSL/Crypto) 静态库
target_link_libraries(your_target_name 
    OpenSSL::Utils 
    log
)
```

## 4\. OpenSSL 实现 HTTP/HTTPS 请求

OpenSSL 实现 HTTP/HTTPS 请求主要有两种方式：一种是基于 OpenSSL 3.x 提供的 OSSL_HTTP_get 等高级 API，由 OpenSSL 内部完成连接、TLS 握手和 HTTP 协议处理，使用简单、开发效率高；

另一种是基于 BIO 的底层实现，BIO（Basic I/O）是 OpenSSL 的通用 I/O 抽象层，通过 BIO_new_ssl_connect、BIO_write、BIO_read 等接口，可以手动完成 HTTPS 通信全过程。

## 4.1 使用 OSSL_HTTP_get 实现（高级 API）

这是最便捷的方式，OpenSSL 内部封装了 HTTP 协议的处理。

```cpp
std::unique_ptr<BIO, BioDeleter> response(OSSL_HTTP_get(
    url.c_str(),      // 请求地址
    nullptr, nullptr, // 代理与主机信息
    nullptr, nullptr, // 端口与路径
    bioUpdate,        // 关键：用于 HTTPS 握手升级的回调
    bioUpdateArg,     // 回调参数（包含 SSL_CTX）
    kHttpBufferSize,  // 缓冲区大小
    nullptr, nullptr, // 头部信息
    0,                // 标志位
    kMaxResponseBytes,// 最大响应长度
    timeout           // 超时时间
));
```

## 4.2 基于 BIO 的底层实现

通过 `BIO_new_ssl_connect` 手动构建请求栈。

```swift
// 1. 创建连接 BIO
conn.reset(BIO_new_ssl_connect(sslCtx.get()));

// 2. 设置 SNI (Server Name Indication)
SSL_set_tlsext_host_name(ssl, target.hostForSni.c_str());

// 3. 执行 TCP + TLS 握手
BIO_do_connect(conn.get());

// 4. 手动构造 HTTP 报文并发送
std::string request = "GET " + path + " HTTP/1.1\r\nHost: " + host + "\r\nConnection: close\r\n\r\n";
BIO_write(conn.get(), request.data(), request.size());

// 5. 循环读取响应数据
BIO_read(conn.get(), buffer, sizeof(buffer));
```

## 5\. 反抓包

反抓包的核心思路是在 TLS 握手阶段对证书进行严格审查，防止中间人代理（如 Charles/Fiddler）介入。

TLS 握手发生在以下调用点：

-   OSSL_HTTP_get：当你调用这个高级函数时，它内部会自动触发 TCP 连接 -> TLS 握手 -> 发送 HTTP 请求。
    
-   BIO_do_connect：在底层 BIO 实现中，这个函数执行时会启动握手。
    

关键点： 握手阶段是在 TCP 三次握手之后，但在 HTTP Data 传输之前 发生的。这意味着如果握手阶段检测到异常（比如反抓包逻辑返回了 0），连接会立即断开，抓包工具根本拿不到任何解密后的明文数据。

```haskell
┌─────────────────────────────┐
│      开始 HTTPS 请求         │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│       DNS 域名解析          │
│ example.com -> IP           │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│       TCP 三次握手          │
├─────────────────────────────┤
│ Client -> SYN              │
│ Server -> SYN + ACK        │
│ Client -> ACK              │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│        TLS 握手            │
├─────────────────────────────┤
│ ClientHello                │
│ ServerHello                │
│ Certificate                │
│ Certificate Verify         │   <---【TLS默认校验，只检查证书是否合法】
│ Session Key Exchange       │
│ Finished                   │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│      证书校验 / Pinning     │
├─────────────────────────────┤
│ CA 校验                     │
│ 发行者检查                  │   <---【反抓包 SSL Pinning】
│ 公钥 Hash 校验              │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│      HTTPS 请求发送         │
├─────────────────────────────┤
│ GET / POST                 │
│ Header                     │
│ Body                       │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│      HTTPS 响应接收         │
├─────────────────────────────┤
│ Status Code                │
│ Response Header            │
│ Response Body              │
└─────────────────────────────┘
               │
               ▼

┌─────────────────────────────┐
│          请求结束           │
└─────────────────────────────┘
```

OpenSSL 反抓包 ASCII 流程图：

```haskell
       [ App 发起请求 ]
              |
    +---------v-------------------------+
    |  1. 初始化 SSL_CTX                |
    |  ( 只从 /system 加载根证书 )       | <---【第一层：证书隔离】
    +---------+-------------------------+
              |
    +---------v-------------------------+
    |  2. 注册 verifyCallback           | <---【逻辑钩子入口】
    +---------+-------------------------+
              |
    +---------v-------------------------+
    |  3. 执行 BIO_do_connect (握手)    | <---【TLS Handshake】
    +---------+-------------------------+
              |
              | ( 握手阶段：证书校验回调 )
              v
    +-----------------------------------+
    |        verifyCallback()           |
    |                                   |
    |  [A] 检查 Issuer 字段              | <---【第二层：指纹识别】
    |      ( 匹配 "Charles/Fiddler"? )  |----------+
    |                                   |          |
    |  [B] 提取公钥并计算 SHA256         |          | [匹配/异常]
    |                                   |          |
    |  [C] 动态公钥固定校验              | <---【第三层：公钥固定】
    |      ( 哈希一致性比对? )           |          |
    +-----------------+-----------------+          |
                      |                            |
            [ 校验通过: 返回 1 ]            [ 校验失败: 返回 0 ]
                      |                            |
    +-----------------v-----------------+          |
    |  4. 握手完成，建立加密隧道          |          |
    |                                   |          v
    |  [D] 绕过 Java 系统代理            |    +-----------+
    |  [E] 绕过 Java 层 Hook            |    | 连接中止  |
    |                                   |    | (抓包失败)|
    +-----------------v-----------------+    +-----------+
                      |
              [ 安全发送/接收数据 ]
```

## 5.1 强制 SSL 验证与证书隔离

在创建 `SSL_CTX` 时，不仅开启 `SSL_VERIFY_PEER` ，还手动加载系统分区的根证书，从而无视用户手动安装的代理 CA 证书。

```cpp
std::unique_ptr<SSL_CTX, SslCtxDeleter> createSslCtx(bool verifyPeer) {
    auto sslCtx = std::unique_ptr<SSL_CTX, SslCtxDeleter>(SSL_CTX_new(TLS_client_method()));
    
    // 注册自定义验证回调
    SSL_CTX_set_verify(sslCtx.get(), SSL_VERIFY_PEER, verifyCallback);
    
    // 只加载系统预设的可信证书路径，隔离用户自行安装的风险证书
    loadCaCertificatesFromDir(sslCtx.get(), "/system/etc/security/cacerts");
    return sslCtx;
}
```

## 5.2 抓包工具证书指纹检测

在 `verifyCallback` 过程中，通过 `isSuspiciousIssuer` 扫描证书发行者，拦截常见的代理软件证书。

```rust
bool isSuspiciousIssuer(X509 *cert) {
    X509_NAME *issuer = X509_get_issuer_name(cert);
    char buf[512];
    X509_NAME_oneline(issuer, buf, sizeof(buf));
    
    std::string s = toLower(buf);
    // 拦截包含代理关键字的发行者
    if (s.find("charles") != std::string::npos || 
        s.find("fiddler") != std::string::npos ||
        s.find("canary")  != std::string::npos) {
        return true;
    }
    return false;
}
```

## 5.3 动态公钥固定 (Dynamic Pinning)

在内存中缓存域名的公钥哈希（SHA-256）。利用 `X509_pubkey_digest` 获取公钥指纹，并在内存中通过 `std::map` 维护一张动态白名单。

```typescript
// 获取当前证书的公钥 SHA-256 哈希
std::string currentHash = getCertPublicKeySha256(cert);

// 动态 Pinning 校验逻辑
if (g_dynamicPins.find(host) == g_dynamicPins.end()) {
    g_dynamicPins[host] = currentHash; // 首次记录
} else if (g_dynamicPins[host] != currentHash) {
    // 同一域名公钥指纹不一致，疑似遭遇 MITM 攻击
    return 0; // 终止握手
}
```

## 6\. 测试反抓包效果

使用 Charles 对 APP 发送的 HTTP 请求抓包测试。

使用 OkHttp 对 [http://ip-api.com/json/](http://ip-api.com/json/) 正常发起 get 请求

[![word/media/image4.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/372b72b3f6284eab.png)](data:image/png;base64,inline-80378B)

基于封装后的 OpenSSL HTTP 工具对 [http://ip-api.com/json/](http://ip-api.com/json/) 发起 get 请求，连请求记录都看不到。

 [![word/media/image5.png](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/08/621fcbb27f27baa8.png)](data:image/png;base64,inline-81950B)OpenSSL 的反抓包机制工作在 TLS 握手阶段，握手失败会直接断开连接，HTTP 请求根本不会发送，因此 Charles 中通常连请求记录都看不到。
