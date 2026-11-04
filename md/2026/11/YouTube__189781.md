---
title: YouTube
source: https://qbtau.in/posts/flutter_ssl/
source_host: qbtau.in
clip_date: 2026-11-04T10:17:43+08:00
trace_id: cc563308-83d8-45bf-be51-7178131399aa
content_hash: fddd96833170bbb3f23821b6427fcc07fe4f0a78242065a57c585de65d913cfb
status: synced
tags:
  - Android逆向
  - Flutter
series: null
feed_source: Abhi·Frida/Android
ai_summary: 通过 OPENSSL_PUT_ERROR 调用中内嵌的源文件名 "handshake.cc" 等特征，可在 Flutter 的 x86 libflutter.so 中精确定位 ssl_verify_peer_cert 函数。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 40e75244-d011-8175-a3c3-da664a65b1e9
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> 通过 OPENSSL_PUT_ERROR 调用中内嵌的源文件名 "handshake.cc" 等特征，可在 Flutter 的 x86 libflutter.so 中精确定位 ssl_verify_peer_cert 函数。
> 
> - **问题背景：** 作者的 radare2 补丁脚本在 ARM/ARM64 上工作正常，但 x86 特征码会误命中 `ssl_crypto_x509_session_verify_cert_chain`（实际校验证书链、被 `ssl_verify_peer_cert` 调用的函数），patch 它可能引发握手异常；NVISO 给出的正确 x86 特征为 `55 41 57 41 56 41 55 41 54 53 50 49 89 fe ...`
> - **定位入口：** 用 `unzip` 解出 APK 中 `lib/x86_64/libflutter.so` 加载进 radare2，搜索仅被 `session_verify_cert_chain` 使用的硬编码字符串 `ssl_server`/`ssl_client`，经交叉引用定位到 0x6bb5be
> - **识别原理：** 对比 BoringSSL 源码，反编译中 `fcn.0066d529(0x10, 0xb, ".../ssl_x509.cc", 0x18a)` 等价于 `OPENSSL_PUT_ERROR(SSL, ERR_R_X509_LIB)`——0x10 是 SSL 库号、0xb 即 ERR_LIB_X509、后两个参数来自 `__FILE__`/`__LINE__` 宏；无参调用的 `fcn.0066d4c7` 即 `ERR_clear_error`
> - **关键指纹：** `ssl_verify_peer_cert` 至少含 3 处 OPENSSL_PUT_ERROR、各 1 次 ERR_clear_error 和 memcmp，且其 OPENSSL_PUT_ERROR 第三参（源文件路径）为 `handshake.cc`——仅凭文件名这一点即可唯一确定目标函数
> - **结论与优势：** 据此确认 `fcn.006a80c6` 即 `ssl_verify_peer_cert`，可直接 patch 绕过证书校验；该纯静态方案不依赖 Frida，可规避 RASP 类检测，且方法适用于任意架构

## Identifying \`ssl\_verify\_peer\_cert\` in Android Flutter Binaries

Ok so, here we go again…

Tip  
This approach is not just limited to x86 binaries, it can be used for other architectures as well.

Note  
Feel free to ignore my below ramblings:)

A few months back I wrote a simple ~~*crappy*~~ script to find and patch the `ssl_verify_peer_cert` function in Flutter’s Android binaries using radare2, which was based on NVISO Labs’ [artciles](https://blog.nviso.eu/2022/08/18/intercept-flutter-traffic-on-ios-and-android-http-https-dio-pinning/) on the same topic. In the article, this topic is covered in much details (though finding `ssl_verify_peer_cert` isn’t well explained, which is what this post is about) and I highly recommend reading it. They shared a [frida](https://frida.re/) script to find the function and patch it. Since I don’t usually use frida (~~*I also am very bad at it*~~) and there are possiblities with some applications(using RASP or other techniques) that detect frida and block it, I decided to write a simple [script](https://github.com/AbhiTheModder/termux-scripts/blob/main/flutter_ssl_patch.py) for [radare2](https://rada.re/n/radare2.html) the job.

So, what I’m doing here, I made the script, it patches the binary and works well, then what is the problem? The patterns in the script for both ARM and ARM64 works flawlessly but the x86 pattern doesn’t work (*Well it works but not as expected*), the pattern in it identifies the `ssl_crypto_x509_session_verify_cert_chain` (in short `session_verify_cert_chain` from now on) function instead of `ssl_verify_peer_cert` function. The `session_verify_cert_chain` function is called by `ssl_verify_peer_cert` function and it is the function that actually verifies the certificate chain(check NVISO Labs article for more details). So, patching `session_verify_cert_chain` function will work but it will not work as expected(sometimes certificates handshake error etc.). You can read about this issues in details [here](https://github.com/NVISOsecurity/disable-flutter-tls-verification/issues/34), which also gives the correct pattern for x86:

```fallback
55 41 57 41 56 41 55 41 54 53 50 49 89 fe 48 8b 1f 48 8b 43 30 4c 8b b8 d0 01 00 00 4d 85 ff 74 12 4d 8b a7 90 00 00 00 4d 85 e4 74 4a 49 8b 04 24 eb 46
```

**this post will be just about how to find the `ssl_verify_peer_cert` function**.

Well I don’t usually work with x86 applications and not very much interested in them also, but as they say “ *Necessity is the mother of invention* ”, Recently I had my primary Android Device broken and I had to use a x86 Android Emulator.

Without further ado, let’s get started.

## Grabbing the binary:

Let’s quickly grab the binary from the apk and load in radare2.

```bash
unzip -j /path/to/app.apk "lib/x86_64/libflutter.so"
```

```bash
r2 -c "aac" ./libflutter.so
# well you can also use r2 -A ./libflutter.so to do full analysis
# but for this we don't need it
```

## Finding session_verify_cert_chain function:

I’m not going to describe why we’re looking for this function and not `ssl_verify_peer_cert` function, you can read the NVISO Labs article for that. Though in short it’s because `session_verify_cert_chain` is the only function that uses hard-coded strings `ssl_server` and `ssl_client`, as such it becomes very easy to find.

Source code of `ssl_verify_peer_cert` function from BoringSSL: [https://github.com/google/boringssl/blob/e056f59c7dfdcf891af03bc7900c946ac485c78f/ssl/ssl_x509.cc#L195](https://github.com/google/boringssl/blob/e056f59c7dfdcf891af03bc7900c946ac485c78f/ssl/ssl_x509.cc#L195):

```c
static bool ssl_crypto_x509_session_verify_cert_chain(SSL_SESSION *session,
                                                      SSL_HANDSHAKE *hs,
                                                      uint8_t *out_alert) {
  *out_alert = SSL_AD_INTERNAL_ERROR;
  STACK_OF(X509) *const cert_chain = session->x509_chain;
  if (cert_chain == nullptr || sk_X509_num(cert_chain) == 0) {
    return false;
  }

  SSL *const ssl = hs->ssl;
  SSL_CTX *ssl_ctx = ssl->ctx.get();
  X509_STORE *verify_store = ssl_ctx->cert_store;
  if (hs->config->cert->verify_store != nullptr) {
    verify_store = hs->config->cert->verify_store;
  }

  X509 *leaf = sk_X509_value(cert_chain, 0);
  const char *name;
  size_t name_len;
  SSL_get0_ech_name_override(ssl, &name, &name_len);
  UniquePtr<X509_STORE_CTX> ctx(X509_STORE_CTX_new());
  if (!ctx ||                                                             //
      !X509_STORE_CTX_init(ctx.get(), verify_store, leaf, cert_chain) ||  //
      !X509_STORE_CTX_set_ex_data(
          ctx.get(), SSL_get_ex_data_X509_STORE_CTX_idx(), ssl) ||  //
      // We need to inherit the verify parameters. These can be determined by
      // the context: if its a server it will verify SSL client certificates or
      // vice versa.
      !X509_STORE_CTX_set_default(
          ctx.get(),
          ssl->server ? "ssl_client" : "ssl_server") ||  //
      // Anything non-default in "param" should overwrite anything in the ctx.
      !X509_VERIFY_PARAM_set1(X509_STORE_CTX_get0_param(ctx.get()),
                              hs->config->param) ||  //
      // ClientHelloOuter connections use a different name.
      (name_len != 0 &&  //
       !X509_VERIFY_PARAM_set1_host(X509_STORE_CTX_get0_param(ctx.get()), name,
                                    name_len))) {
    OPENSSL_PUT_ERROR(SSL, ERR_R_X509_LIB);
    return false;
  }

  if (hs->config->verify_callback) {
    X509_STORE_CTX_set_verify_cb(ctx.get(), hs->config->verify_callback);
  }

  int verify_ret;
  if (ssl_ctx->app_verify_callback != nullptr) {
    verify_ret =
        ssl_ctx->app_verify_callback(ctx.get(), ssl_ctx->app_verify_arg);
  } else {
    verify_ret = X509_verify_cert(ctx.get());
  }

  session->verify_result = X509_STORE_CTX_get_error(ctx.get());

  // If |SSL_VERIFY_NONE|, the error is non-fatal, but we keep the result.
  if (verify_ret <= 0 && hs->config->verify_mode != SSL_VERIFY_NONE) {
    *out_alert = SSL_alert_from_verify_result(session->verify_result);
    return false;
  }

  ERR_clear_error();
  return true;
}
```

So, let’s find the function in radare2.

```bash
[0x00388dc0]> iz~+ssl_server
2828  0x0010d9cd 0x0010d9cd 10   11   .rodata ascii   ssl_server
[0x00388dc0]> axt @0x0010d9cd
fcn.006bb5be 0x6bb6c8 [DATA:r--] lea rax, str.ssl_server
[0x00388dc0]> # so the function(session_verify_cert_chain) is at 0x6bb5be
[0x00388dc0]> afn session_verify_cert_chain 0x6bb5be # renaming for better readability
```

or as I said above the pattern of NVISO Labs for x86 finds `session_verify_cert_chain` instead of `ssl_verify_peer_cert`, so we could also use that to directly find the function.

```bash
[0x00388dc0]> /x 55 41 57 41 56 41 55 41 54 53 48 83 EC 38 C6 02 50 48 8B AF A. 00 00 00 48 85 ED 74 7. 48 83 7D 00 00 74
0x006bb5be hit0_0 554157415641554154534883ec38c60250488bafa80000004885ed747048837d000074
```

Now let’s decompile it:

```bash
[0x00388dc0]> pdg @0x006bb5be
```

```c
// 0x6bb5be
uint64_t session_verify_cert_chain(int64_t param_1, int64_t *param_2, uchar *param_3)

{
    int64_t *piVar1;
    int64_t iVar2;
    ulong uVar3;
    code *pcVar4;
    uchar uVar5;
    int32_t iVar6;
    int64_t iVar7;
    int64_t iVar8;
    uint64_t uVar9;
    uchar *puVar10;
    uchar *puVar11;
    int64_t *piVar12;
    ulong uVar13;
    char *pcVar14;
    ulong uVar15;
    int64_t iVar16;
    ulong uStack_70;
    int64_t iStack_68;
    int64_t iStack_60;
    int64_t *apiStack_58 [3];
    int64_t iStack_40;
    int64_t iStack_38;

    *param_3 = 0x50;
    piVar1 = *(param_1 + 0xa8);
    if ((piVar1 == NULL) || (*piVar1 == 0)) {
        uVar9 = 0;
        goto code_r0x006bb7a7;
    }
    iVar8 = *param_2;
    iStack_40 = *(iVar8 + 0x68);
    iVar16 = *(*(iVar8 + 0x30) + 0x118);
=
    if (iVar16 == 0) {
        iStack_60 = 0;
    }
    else {
        iStack_60 = 0;
        apiStack_58[2] = 0;
        if ((*(iVar8 + 0xa4) & 1) == 0) {
=
            iStack_60 = 0;
            if (*(*(iVar8 + 0x30) + 0xd8) == 2) {
                iVar16 = *(iVar16 + 0x608);
                apiStack_58[2] = *(iVar16 + 0x20);
                iStack_60 = *(iVar16 + 0x28);
            }
        }
    }
    iVar16 = *(iStack_40 + 0x60);
    iVar2 = *(*(param_2[1] + 0x20) + 0x58);
    uVar13 = *piVar1[1];
    uStack_70 = 0x6bb673;
    iStack_68 = param_1;
=
=
    iVar7 = fcn.00696a6a();
    puVar11 = &stack0xffffffffffffff98;
    iStack_38 = iVar7;
    if (iVar7 == 0) {
code_r0x006bb784:
        *(puVar11 + -8) = 0x10;
        uVar15 = *(puVar11 + -8);
        *(puVar11 + -8) = 0xb;
        uVar13 = *(puVar11 + -8);
        *(puVar11 + -8) = 0x6bb79b;
        fcn.0066d529(uVar15, uVar13, "../../third_party/boringssl/src/ssl/ssl_x509.cc", 0x18a);
        piVar12 = puVar11 + 0;
code_r0x006bb79b:
        uVar9 = 0;
    }
    else {
        if (iVar2 != 0) {
            iVar16 = iVar2;
        }
        *(&stack0xffffffffffffff98 + -8) = 0x6bb69c;
        iVar6 = fcn.00696b04(iVar7, iVar16, uVar13, piVar1);
        puVar11 = *0x20 + -0x68;
        if (iVar6 == 0) goto code_r0x006bb784;
        *(*0x20 + -0x70) = 0x6bb6b8;
        iVar6 = fcn.00675a0e(iVar7 + 0xd0, 0, iVar8);
        puVar11 = &stack0xffffffffffffff98;
        if (iVar6 == 0) goto code_r0x006bb784;
        pcVar14 = "ssl_client";
        if ((*(iVar8 + 0xa4) & 1) == 0) {
            pcVar14 = "ssl_server";
        }
        *(&stack0xffffffffffffff98 + -8) = 0x6bb6df;
        iVar8 = fcn.00699133(pcVar14);
        puVar11 = *0x20 + -0x68;
        if (iVar8 == 0) goto code_r0x006bb784;
        uVar13 = *(iVar7 + 0x20);
        *(*0x20 + -0x70) = 0x6bb6f5;
        iVar6 = fcn.00698d7e(uVar13, iVar8);
        puVar11 = *0x20 + -0x68;
        if (iVar6 == 0) goto code_r0x006bb784;
        iVar8 = *(iVar7 + 0x20);
        uVar13 = *(*(*(*0x20 + -0x58) + 8) + 0x10);
        uVar9 = *(iVar8 + 0x10);
        *(iVar8 + 0x10) = uVar9 | 1;
        iVar16 = -8;
        *(&stack0xffffffffffffff98 + iVar16) = 0x6bb726;
        iVar6 = fcn.00698d7e(iVar8, uVar13);
        puVar11 = &stack0xffffffffffffffa0 + iVar16;
        puVar10 = &stack0xffffffffffffffa0 + iVar16;
        *(iVar8 + 0x10) = uVar9;
        if (iVar6 == 0) goto code_r0x006bb784;
        if (*(&stack0xffffffffffffff98 + 8) != 0) {
            uVar13 = *(iVar7 + 0x20);
            uVar15 = *(&stack0xffffffffffffff98 + 0x20);
            uVar3 = *(&stack0xffffffffffffff98 + 8);
            *(*0x20 + -0x70) = 0x6bb74a;
            iVar6 = fcn.0069907a(uVar13, uVar15, uVar3);
            puVar10 = &stack0xffffffffffffff98;
            puVar11 = &stack0xffffffffffffff98;
            if (iVar6 == 0) goto code_r0x006bb784;
        }
        iVar8 = *(puVar10 + 0x10);
        iVar16 = *(*(iVar8 + 8) + 0x28);
        if (iVar16 != 0) {
            *(iVar7 + 0x38) = iVar16;
        }
        pcVar4 = *(*(puVar10 + 0x28) + 0xb8);
        if (pcVar4 == NULL) {
            *(puVar10 + -8) = 0x6bb7c0;
            iVar6 = fcn.00695817(iVar7);
            piVar12 = puVar10;
        }
        else {
            uVar13 = *(*(puVar10 + 0x28) + 0xc0);
            *(puVar10 + -8) = 0x6bb782;
            iVar6 = (*pcVar4)(iVar7, uVar13);
            piVar12 = puVar10;
        }
        iVar16 = *(iVar7 + 0xa4);
        *(*piVar12 + 0xb8) = iVar16;
        if ((iVar6 == 0 || iVar6 < 0) && (*(*(iVar8 + 8) + 0xe8) != '\0')) {
            uVar5 = 0x2e;
            if (iVar16 - 1U < 0x42) {
                uVar5 = *(0x1b6748 + iVar16 * 4);
            }
            *piVar12[3] = uVar5;
            goto code_r0x006bb79b;
        }
        piVar12[-1] = 0x6bb7dc;
        fcn.0066d4c7();
        piVar12 = piVar12;
        uVar9 = CONCAT71(iVar8 >> 8, 1);
    }
    *(piVar12 + -8) = 0x6bb7a7;
    fcn.006bb0e4(piVar12 + 0x30);
code_r0x006bb7a7:
    return uVar9 & 0xffffffff;
}
```

Utterly unreadable, but we can see the strings `ssl_server` and `ssl_client` in the decompiled code, so we’re good to go. How? Well we can compare it with the original source code of BoringSSL, which I just did above.

Now the key part is what should we find which is interesting in the function that is also common in `ssl_verify_peer_cert` function.

Let’s look at the `ssl_verify_peer_cert` function at source level [https://github.com/google/boringssl/blob/e056f59c7dfdcf891af03bc7900c946ac485c78f/ssl/handshake.cc#L220](https://github.com/google/boringssl/blob/e056f59c7dfdcf891af03bc7900c946ac485c78f/ssl/handshake.cc#L220):

```c
enum ssl_verify_result_t ssl_verify_peer_cert(SSL_HANDSHAKE *hs) {
  SSL *const ssl = hs->ssl;
  const SSL_SESSION *prev_session = ssl->s3->established_session.get();
  if (prev_session != NULL) {
    // If renegotiating, the server must not change the server certificate. See
    // https://mitls.org/pages/attacks/3SHAKE. We never resume on renegotiation,
    // so this check is sufficient to ensure the reported peer certificate never
    // changes on renegotiation.
    assert(!ssl->server);
    if (sk_CRYPTO_BUFFER_num(prev_session->certs.get()) !=
        sk_CRYPTO_BUFFER_num(hs->new_session->certs.get())) {
      OPENSSL_PUT_ERROR(SSL, SSL_R_SERVER_CERT_CHANGED);
      ssl_send_alert(ssl, SSL3_AL_FATAL, SSL_AD_ILLEGAL_PARAMETER);
      return ssl_verify_invalid;
    }

    for (size_t i = 0; i < sk_CRYPTO_BUFFER_num(hs->new_session->certs.get());
         i++) {
      const CRYPTO_BUFFER *old_cert =
          sk_CRYPTO_BUFFER_value(prev_session->certs.get(), i);
      const CRYPTO_BUFFER *new_cert =
          sk_CRYPTO_BUFFER_value(hs->new_session->certs.get(), i);
      if (Span(CRYPTO_BUFFER_data(old_cert), CRYPTO_BUFFER_len(old_cert)) !=
          Span(CRYPTO_BUFFER_data(new_cert), CRYPTO_BUFFER_len(new_cert))) {
        OPENSSL_PUT_ERROR(SSL, SSL_R_SERVER_CERT_CHANGED);
        ssl_send_alert(ssl, SSL3_AL_FATAL, SSL_AD_ILLEGAL_PARAMETER);
        return ssl_verify_invalid;
      }
    }

    // The certificate is identical, so we may skip re-verifying the
    // certificate. Since we only authenticated the previous one, copy other
    // authentication from the established session and ignore what was newly
    // received.
    hs->new_session->ocsp_response = UpRef(prev_session->ocsp_response);
    hs->new_session->signed_cert_timestamp_list =
        UpRef(prev_session->signed_cert_timestamp_list);
    hs->new_session->verify_result = prev_session->verify_result;
    return ssl_verify_ok;
  }

  uint8_t alert = SSL_AD_CERTIFICATE_UNKNOWN;
  enum ssl_verify_result_t ret;
  if (hs->config->custom_verify_callback != nullptr) {
    ret = hs->config->custom_verify_callback(ssl, &alert);
    switch (ret) {
      case ssl_verify_ok:
        hs->new_session->verify_result = X509_V_OK;
        break;
      case ssl_verify_invalid:
        // If |SSL_VERIFY_NONE|, the error is non-fatal, but we keep the result.
        if (hs->config->verify_mode == SSL_VERIFY_NONE) {
          ERR_clear_error();
          ret = ssl_verify_ok;
        }
        hs->new_session->verify_result = X509_V_ERR_APPLICATION_VERIFICATION;
        break;
      case ssl_verify_retry:
        break;
    }
  } else {
    ret = ssl->ctx->x509_method->session_verify_cert_chain(
              hs->new_session.get(), hs, &alert)
              ? ssl_verify_ok
              : ssl_verify_invalid;
  }

  if (ret == ssl_verify_invalid) {
    OPENSSL_PUT_ERROR(SSL, SSL_R_CERTIFICATE_VERIFY_FAILED);
    ssl_send_alert(ssl, SSL3_AL_FATAL, alert);
  }

  // Emulate OpenSSL's client OCSP callback. OpenSSL verifies certificates
  // before it receives the OCSP, so it needs a second callback for OCSP.
  if (ret == ssl_verify_ok && !ssl->server &&
      hs->config->ocsp_stapling_enabled &&
      ssl->ctx->legacy_ocsp_callback != nullptr) {
    int cb_ret =
        ssl->ctx->legacy_ocsp_callback(ssl, ssl->ctx->legacy_ocsp_callback_arg);
    if (cb_ret <= 0) {
      OPENSSL_PUT_ERROR(SSL, SSL_R_OCSP_CB_ERROR);
      ssl_send_alert(ssl, SSL3_AL_FATAL,
                     cb_ret == 0 ? SSL_AD_BAD_CERTIFICATE_STATUS_RESPONSE
                                 : SSL_AD_INTERNAL_ERROR);
      ret = ssl_verify_invalid;
    }
  }

  return ret;
}
```

Now If we look at both the source codes of `ssl_verify_peer_cert` and `session_verify_cert_chain` we can see that the `OPENSSL_PUT_ERROR` and `ERR_clear_error` functions are used in both of them. Most unique one being `ERR_clear_error` which is usedonly once.

## OPENSSL_PUT_ERROR

In the original source of `session_verify_cert_chain`, when the certificate‐chain verification setup fails (for example, during context initialization), the code calls:

```c
OPENSSL_PUT_ERROR(SSL, ERR_R_X509_LIB);
```

This macro records an error in the OpenSSL error queue(`ERR_put_error`). In OpenSSL’s implementation, the macro typically expands to a function call where the parameters are:

1.  **Library Code:** For the SSL library.
2.  **Reason Code:** Here, `ERR_R_X509_LIB` indicates an error from the X509 routines.
3.  **File Name:** Usually provided by the `__FILE__` macro.
4.  **Line Number:** Provided by the `__LINE__` macro.

There’s also function name param after library code but it’s hardcoded to 0 in the boringssl library ([https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/include/openssl/err.h#L359-L360)](https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/include/openssl/err.h#L359-L360\)).

### Identifying OPENSSL_PUT_ERROR in the Decompiled Code

In the decompiled code, we see the following block:

```c
*(puVar11 + -8) = 0x10;
uVar15 = *(puVar11 + -8);
*(puVar11 + -8) = 0xb;
uVar13 = *(puVar11 + -8);
*(puVar11 + -8) = 0x6bb79b;
fcn.0066d529(uVar15, uVar13, "../../third_party/boringssl/src/ssl/ssl_x509.cc", 0x18a);
```

Let me make it more readable:

```c
uVar15 = 0x10;
uVar13 = 0xb;
*(puVar11 + -8) = 0x6bb79b;
fcn.0066d529(uVar15, uVar13, "../../third_party/boringssl/src/ssl/ssl_x509.cc", 0x18a);
```

Let’s break it down:

1.  **Library Code (`0x10`):**
    
    -   The value `0x10` is stored first and then passed as the first argument (`uVar15`) to `fcn.0066d529()`.
    -   In OpenSSL’s error handling, the library code for SSL is defined as a constant. Here, `0x10` represents the SSL library.
2.  **Reason Code (`0xb`):**
    
    -   The value `0xb` (11 in decimal) is stored next and becomes the second argument (`uVar13`).
    -   This value corresponds to the error code `ERR_LIB_X509`, indicating that the error comes from the X509 routines. [https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/include/openssl/err.h#L271](https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/include/openssl/err.h#L271):
        
        ```c
        #define ERR_R_X509_LIB ERR_LIB_X509
        ```
        
        and it’s value ([https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/gen/crypto/err_data.cc#L32)](https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/gen/crypto/err_data.cc#L32\)):
        
        ```c
        static_assert(ERR_LIB_X509 == 11, "library value changed");
        ```
        
3.  **File Name (`"../../third_party/boringssl/src/ssl/ssl_x509.cc"`):**
    
    -   The third argument is a string literal representing the file name where the error occurred, provided by the `__FILE__` macro.
4.  **Line Number (`0x18a`):**
    
    -   The final argument is `0x18a` (394 in decimal), which stands in for the line number in the source file where the error was reported. This is provided by the `__LINE__` macro.

Thus, the call:

```c
fcn.0066d529(uVar15, uVar13, "../../third_party/boringssl/src/ssl/ssl_x509.cc", 0x18a);
```

sometimes r2ghidra decompiles it as(with the file name empty but it is effectively the same):

```c
fcn.0066d529(uVar15, uVar13, "", 0x18a);
```

effectively performs the same function as:

```c
OPENSSL_PUT_ERROR(SSL, ERR_R_X509_LIB);
```

by reporting an error from the SSL library (with error reason `ERR_R_X509_LIB`) at a specific file and line number.

This mapping confirms that the decompiled error-reporting call is indeed equivalent to the `OPENSSL_PUT_ERROR(SSL, ERR_R_X509_LIB)` call in the original source code.

Let’s rename the function to `OPENSSL_PUT_ERROR` for clarity.

```bash
[0x00388dc0]> afn OPENSSL_PUT_ERROR fcn.0066d529
```

## ERR_clear_error()

[https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/include/openssl/err.h#L198](https://github.com/google/boringssl/blob/8c6b0c04f19f5a6a13af3e29a6a4bb6784cb2bd7/include/openssl/err.h#L198):

```c
// ERR_clear_error clears the error queue for the current thread.
OPENSSL_EXPORT void ERR_clear_error(void);
```

`ERR_clear_error()` is used to clear the error queue for the current thread. This is typically done to ensure that any previous errors do not interfere with subsequent operations.

### Identifying ERR_clear_error in the Decompiled Code

In the decompiled code, after processing the certificate chain verification, the function calls `fcn.0066d4c7();` without any arguments. Based on the context it is likely equivalent to `ERR_clear_error();`.

So, the function call:

```c
fcn.0066d4c7();
```

appearing near the end of the function (right after setting a marker with `piVar12[-1] = 0x6bb7dc;`) corresponds to:

```c
ERR_clear_error();
```

## Finding ssl_verify_peer_cert

`ERR_clear_error()` is used just one time on both of the fucntions so we look of it’s xrefs in the code and check all the results fcns match, like:

Let’s rename the function to `ERR_clear_error` for clarity.

```bash
[0x00388dc0]> afn ERR_clear_error fcn.0066d4c7
```

```bash
[0x00388dc0]> axt @fcn.0066d4c7
fcn.0065dd72 0x65dde8 [CALL:--x] call ERR_clear_error
fcn.0066df59 0x66e0d0 [CALL:--x] call ERR_clear_error
(nofunc) 0x66f6d8 [CALL:--x] call ERR_clear_error
(nofunc) 0x67289f [CALL:--x] call ERR_clear_error
fcn.006869e5 0x686a0a [CALL:--x] call ERR_clear_error
fcn.00686eaf 0x6871ad [CALL:--x] call ERR_clear_error
fcn.00686eaf 0x687abe [CALL:--x] call ERR_clear_error
(nofunc) 0x693ca2 [CALL:--x] call ERR_clear_error
(nofunc) 0x693d1d [CALL:--x] call ERR_clear_error
(nofunc) 0x693ff8 [CALL:--x] call ERR_clear_error
fcn.006947d3 0x694803 [CALL:--x] call ERR_clear_error
fcn.006a5e24 0x6a65b2 [CALL:--x] call ERR_clear_error
fcn.006a701b 0x6a7162 [CALL:--x] call ERR_clear_error
fcn.006a80c6 0x6a82cd [CALL:--x] call ERR_clear_error
(nofunc) 0x6aaf54 [CALL:--x] call ERR_clear_error
fcn.0079e35e 0x6b0602 [CALL:--x] call ERR_clear_error
fcn.0079e35e 0x6b0704 [CALL:--x] call ERR_clear_error
fcn.006b6d19 0x6b6d21 [CALL:--x] call ERR_clear_error
fcn.007ac412 0x6bab5e [CALL:--x] call ERR_clear_error
session_verify_cert_chain 0x6bb7d7 [CALL:--x] call ERR_clear_error
fcn.007ac412 0x6bb947 [CALL:--x] call ERR_clear_error
fcn.006c12c2 0x6c1933 [CALL:--x] call ERR_clear_error
```

Now let’s also search for xrefs of OPENSSL_PUT_ERROR, since it’s also used on both of the fcns:

Tip  
We're going to get a lot of xrefs here since OPENSSL_PUT_ERROR is common, so I've collapsed it here, you can expand it to see all of them.

Click to expand

```bash
[0x00388dc0]> axt @OPENSSL_PUT_ERROR
fcn.0065d61f 0x65d656 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065d7b9 0x65da0f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065d7b9 0x65da86 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065db39 0x65dbf5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065dca8 0x65dcdd [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065dcec 0x65dd34 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065dd72 0x65dde3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065ddfe 0x65de60 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065de88 0x65deeb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065de88 0x65e0a2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065de88 0x65e10d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065de88 0x65e28b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065de88 0x65e317 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065e40f 0x65e43a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065e4f9 0x65e769 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065e4f9 0x65e799 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065e7a2 0x65e821 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065ec5f 0x65eca4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065f1e1 0x65f259 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0071a677 0x65f9ba [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065fa3e 0x65fb57 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065fa3e 0x65fb7b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065fa3e 0x65fba7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065fbb6 0x65fdad [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x65ff00 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66018e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0065fbb6 0x66048d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00660597 0x660662 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00660597 0x660679 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006606ef 0x6607f2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006606ef 0x660943 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00660a32 0x660cea [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00660da5 0x660ddf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006611be 0x661227 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006612d0 0x661459 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00751ad0 0x661a07 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00661beb 0x661c5d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00661f67 0x661fac [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00661fce 0x662016 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00662034 0x66207b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066277c 0x662123 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66221e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6624f0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x662502 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6626f1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66272a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x662743 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00753ba4 0x6627d5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00662baa 0x662bfe [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00662c2a 0x662cb7 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x662d48 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00662fd3 0x662ff9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00662fd3 0x663061 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006630a3 0x6630d4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006634ae 0x6634c9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00663528 0x6636a0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006636fd 0x663725 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x664cce [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x664da1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x665000 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66608f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6661d0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x666aff [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00666b4d 0x666c55 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00666e98 0x666f64 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c45f 0x66c4cb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c60e 0x66c6a0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c6ed 0x66c766 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c775 0x66c791 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66c896 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66c975 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66c9b6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66c9cd [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66ca09 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66cb42 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066c79a 0x66cb70 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066cc5b 0x66cd1d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066d031 0x66d0bf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066d156 0x66d1af [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066d2f9 0x66d35f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066db04 0x66db96 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066dc03 0x66dc21 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066dc45 0x66dc66 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066dc72 0x66dd19 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066dc72 0x66dd90 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066de3b 0x66df10 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066de3b 0x66df4a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066df59 0x66dff4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066df59 0x66e0a2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066df59 0x66e0bb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066df59 0x66e112 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66e2c2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066e2d4 0x66e32b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0066e368 0x66e39b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66e440 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66e55b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66e5ca [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66e797 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66ea0a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66ea26 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66eb1f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66ebe0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66ed61 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66ed82 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66edc6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66ede5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0075faaa 0x66ef29 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66efaf [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f03b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f09b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f1f5 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f251 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f2c4 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f313 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f55e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f575 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f5d4 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f67e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f75f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x66f883 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007636ea 0x67225d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x672293 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007636ea 0x672381 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6723d7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007636ea 0x672531 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00672543 0x67259c [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x672604 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67264b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007636ea 0x67268a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6728e9 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x673608 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x673739 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67374f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6739af [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x673ae2 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x673b06 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00765030 0x673b9f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00765030 0x673de2 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x673f13 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6740ba [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67415e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6741a2 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6741f0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x674235 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x674386 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x674423 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00765bce 0x67448a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x674632 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00765bce 0x674754 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x674949 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x674a20 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00766508 0x674e45 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00766508 0x674e77 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00766508 0x674efb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00766508 0x674f9e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00766508 0x674fbe [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67511f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675134 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6751ca [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675204 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6753f0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675407 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675516 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675580 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6755a6 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67568c [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6756da [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675838 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067584a 0x6758b1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675914 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67595b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67599b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x675a01 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00675d6b 0x675dfc [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00675e20 0x675f12 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00676fdc 0x676ffc [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00677078 0x6770a9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067747c 0x6774a5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067747c 0x67751a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00677560 0x6775e2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006779ae 0x677a5e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00677abc 0x677b17 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00677df0 0x677e1f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679735 0x6797bd [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679bf6 0x679c22 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679bf6 0x679d0b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679da0 0x679dbf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679e39 0x679ed2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679f09 0x679f2c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00679f57 0x679fbe [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067a614 0x67a6b2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067b667 0x67b713 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067b72b 0x67b7a4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067c450 0x67c544 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067c855 0x67c891 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067c940 0x67c97b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067c991 0x67c9d8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067c991 0x67caf0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067cb43 0x67cc75 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067cb43 0x67cc90 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067cd28 0x67cd98 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067cef2 0x67cf11 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067cfa1 0x67d004 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067d114 0x67d136 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67d3ce [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067d7a2 0x67d8d1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67db18 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67df1f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067e612 0x67e67d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67e82c [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x67ea12 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0067ebec 0x67ec58 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006800cb 0x680278 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006800cb 0x680296 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006800cb 0x6802c2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068032c 0x6803bb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00680400 0x680500 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00680400 0x680523 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006807e4 0x680838 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00680a01 0x680a3b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00680c4f 0x680c94 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00680d51 0x680db0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00680f22 0x681232 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068128b 0x6812da [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6816de [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x681709 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x68183d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6828db [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006840e9 0x684132 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6842e8 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x68453b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x685603 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x685790 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068613e 0x686185 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068613e 0x6864e4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068613e 0x6865b9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068613e 0x6865d6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006865fd 0x6866ce [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686715 0x686765 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006867e9 0x686840 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006868ae 0x6868e6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686a68 0x686ad7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686c81 0x686cb3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686cdc 0x686d26 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686cdc 0x686d6c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686e35 0x686e9c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x686eea [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x6870dd [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x687193 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x6873c1 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x6874a0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x687a8d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00686eaf 0x687ae9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00687dd3 0x687e10 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00687dd3 0x687f69 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006882bf 0x6882ed [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068862a 0x688683 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068862a 0x6887b6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068862a 0x688934 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068893e 0x6889db [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688a02 0x688a77 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688a02 0x688b1b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x688cb5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x688d12 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x689086 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x68909d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x6890b9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x689345 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x689577 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x68958d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00688bb8 0x6898fc [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689b7c 0x689be2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689c4a 0x689cbf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689c4a 0x689d54 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689c4a 0x689d93 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689c4a 0x689e5b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689c4a 0x689e74 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689ebb 0x689fcf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689ebb 0x689ff5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689ebb 0x68a14b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689ebb 0x68a164 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689ebb 0x68a19e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00689ebb 0x68a1d6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a20a 0x68a2a9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a32d 0x68a3ab [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a3b4 0x68a441 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a3b4 0x68a514 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a8df 0x68a92a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a8df 0x68b334 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068a8df 0x68b3b5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068b7e3 0x68b82e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068b83b 0x68b9d1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x68ba21 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068ba40 0x68bb4b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x68bc02 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068bf08 0x68c271 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068defe 0x68df57 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e20a 0x68e25d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e30f 0x68e3c4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e4f5 0x68e6f2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e710 0x68e75c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e78b 0x68e9b3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e9c9 0x68f21a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e9c9 0x68f2a8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e9c9 0x68f366 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e9c9 0x68f3c9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068e9c9 0x68f863 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0068f998 0x68f9fc [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x68fb22 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00690120 0x6901e3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00690120 0x690202 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00690120 0x6902a3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006904fe 0x6905ee [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006904fe 0x690607 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006904fe 0x690634 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69073a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069087c 0x69093c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069094e 0x6909a4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006909ca 0x690a99 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006909ca 0x690aec [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x691030 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x691140 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6911a9 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69130a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00691314 0x6913a6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00691314 0x6913d5 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69147d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x691602 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69166b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6916b1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x691829 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x691863 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00691c02 0x691c1e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00691c27 0x691c91 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069247d 0x6924c7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069247d 0x692528 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069247d 0x69271d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069247d 0x6927bc [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069247d 0x6927ec [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069247d 0x692913 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00692936 0x692d54 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00692936 0x693371 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6933bf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006935bd 0x693692 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693789 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693861 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693d56 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693d7f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693f18 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693f65 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x693fbe [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00694057 0x6941b0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006947d3 0x69481e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00694854 0x6948a8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00694957 0x694a4e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00695327 0x69562b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00695817 0x695863 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00696737 0x696889 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00696b04 0x696ca5 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x697127 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x697ac5 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x697df1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x697f3c [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x699451 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x699a0d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69a088 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069a0b1 0x69a117 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69a303 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69a351 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69a422 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069a8ad 0x69a8fd [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69ac94 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69acf6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069a8ad 0x69ad41 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69ad7f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069a8ad 0x69adb6 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69b0bd [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69b0d8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069b103 0x69b271 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69b3a1 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69b4f7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069b550 0x69b59e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69bd30 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69bd4e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69bd95 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69be28 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69be8b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69bf24 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69bf7a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69bfcb [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69c002 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069c5cb 0x69c6ad [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069c5cb 0x69c6f4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069c5cb 0x69c75c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069c7bd 0x69c7e2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069c894 0x69c92d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0078e322 0x69cabb [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69cd8a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69ce9a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0078eb6c 0x69d11a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0078eb6c 0x69d133 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069d198 0x69d26c [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69d8bb [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69dc64 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69dc7d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69de2e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x69e791 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069e7ec 0x69e8a0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069ecc8 0x69eda3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069ecc8 0x69ee59 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069eee1 0x69effa [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069f019 0x69f04a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069f0f3 0x69f289 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069f3f6 0x69f494 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069f3f6 0x69f4ea [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0069fe6b 0x6a002f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a01b6 0x6a0282 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a01b6 0x6a02a8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a01b6 0x6a0411 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a01b6 0x6a07c2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a0bdb 0x6a0ea1 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a102f 0x6a138e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a102f 0x6a1711 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a102f 0x6a1823 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a1c30 0x6a1c72 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a1ee0 0x6a1f36 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a1fd8 0x6a20a9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a1fd8 0x6a20c7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a1fd8 0x6a2191 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a21af [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a21bc 0x6a21f4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a21bc 0x6a226e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a25ff 0x6a26e9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a25ff 0x6a2707 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a25ff 0x6a2733 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a25ff 0x6a276c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a27d6 0x6a2b53 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a27d6 0x6a2b86 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a27d6 0x6a2c20 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a27d6 0x6a2d24 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a3027 0x6a3080 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a34a7 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a3746 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a38ea [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a390e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a3971 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a3a21 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a3a4e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a3f14 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a3ff7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a4018 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a4045 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a4329 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a443d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a497e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a4a01 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a4a89 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a4e14 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a54e1 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a55c0 0x6a563c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a55c0 0x6a5659 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a5749 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6a57e3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00794c04 0x6a58f5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5a3d 0x6a5af3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5a3d 0x6a5b1d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5b77 0x6a5cba [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5b77 0x6a5ce6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5b77 0x6a5db1 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5b77 0x6a5e1a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5e24 0x6a64e2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5e24 0x6a6526 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a5e24 0x6a6fbb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7195 0x6a7323 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7339 0x6a7591 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7339 0x6a75cd [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7339 0x6a7615 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7643 0x6a7796 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a77f3 0x6a793f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7d26 0x6a7db8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7d26 0x6a7ddc [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7ecb 0x6a7ef8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7f9c 0x6a8069 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7f9c 0x6a8086 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a7f9c 0x6a80a3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a80c6 0x6a81f5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a80c6 0x6a8305 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a80c6 0x6a8372 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a83b8 0x6a83f6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a8454 0x6a85ce [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a85e8 0x6a8669 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a85e8 0x6a873d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a8753 0x6a8841 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a8753 0x6a8879 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a889e 0x6a8bb2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a8d9e 0x6a8e95 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006a8d9e 0x6a8eb3 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aa1c0 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aa218 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aa258 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aa413 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aa43d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aa79b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aa7bc [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aa8aa [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aaca8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aace8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aad57 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079af2e 0x6aad7d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aafaf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6ab8da [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac157 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac3fc [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac585 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac64b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac6a6 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac7cc [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ac7ea [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6acc0f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ace32 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ace88 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aceb6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6ad009 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad028 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad31b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad495 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad4b4 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad4f2 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad59d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ad5be [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6ad7fe [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6ada50 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6adacb [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ae219 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6ae97a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aeb19 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aeb5a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aef28 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6aefe2 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6af504 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6af5ba [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6af80a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6afa95 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6afb06 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6afb4f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6afdb2 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6afddb [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6afe11 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b00bd [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b00e0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b010a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0165 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0292 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b07eb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b0902 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b098b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b0a21 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b0a40 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b0a5b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b0b73 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0bda [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0c62 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0c86 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0d8f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0dad [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b0ed4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b11b3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b11f9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b126c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.0079e35e 0x6b1398 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b1432 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b15fb 0x6b16d5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b16eb 0x6b176b [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b1898 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b1c65 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b1d23 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b20f8 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b248a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b25fd 0x6b268e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b25fd 0x6b279a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b29a7 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b2a03 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b2aca [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b2ae6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b2afc 0x6b2b37 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b2bdb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b2cfc 0x6b2db8 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3022 0x6b306c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b309e 0x6b30df [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b30ec 0x6b312b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3138 0x6b31c5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b31dc 0x6b321c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b326a 0x6b328c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b337c 0x6b34b7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b337c 0x6b34fb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3593 0x6b3623 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3771 0x6b37ae [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b37be 0x6b39dd [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b3ada [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3bf6 0x6b3d8a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3bf6 0x6b3dc1 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3e31 0x6b3f2c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3e31 0x6b3f97 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b3e31 0x6b3fc3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b4445 0x6b4915 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b4445 0x6b497d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b4c35 0x6b511a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b6081 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b62c0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b6996 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b6c0c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b6cc2 0x6b6d07 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6b7498 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7375 0x6b755a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b77b4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b7db9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b7e95 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b7fb3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b7ffd [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b801b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b7784 0x6b8082 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b80ab 0x6b80e6 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b82ce 0x6b8341 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b83bc 0x6b8567 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b83bc 0x6b864d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b83bc 0x6b8744 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b8758 0x6b87a9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b8eaf 0x6b8f8d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b8eaf 0x6b9005 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006b9239 0x6b9aae [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006ba702 0x6ba76f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006ba88a 0x6ba966 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007ac412 0x6baad1 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007ac412 0x6baaf4 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bb4ab [CALL:--x] call OPENSSL_PUT_ERROR
session_verify_cert_chain 0x6bb796 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007ac412 0x6bb994 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007ac412 0x6bb9af [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbb1a 0x6bbbc5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc0af [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc1e4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc61c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc646 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc66f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc734 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc7c4 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bbfe3 0x6bc7fe [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bc829 0x6bc920 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bc829 0x6bc93d [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bc829 0x6bc961 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bc995 0x6bca15 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bca26 0x6bcafb [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bca26 0x6bcfbf [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bd040 0x6bd198 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bd1e1 0x6bd279 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bd299 0x6bd2db [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bd324 0x6bd434 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bd86a 0x6bd92c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006bdf49 0x6bdf6f [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006be152 0x6be201 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006be217 0x6be359 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006be414 0x6be4a3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006be4b4 0x6be4f3 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6be79d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6beddd [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfc57 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfc75 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfc9d [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfcca [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfd08 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfd35 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6bfe33 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c0208 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c0251 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c0298 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c0437 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c07e2 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c095a [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c09f3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007b3016 0x6c0b7e [CALL:--x] call OPENSSL_PUT_ERROR
fcn.007b3016 0x6c0dc0 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x6c1155 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1328 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c13c5 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1485 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c14c7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c161c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1666 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1794 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c195b [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c198a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1ab3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1af3 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1b35 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1b5c [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c12c2 0x6c1b9a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c1bed 0x6c1c3a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c1c4b 0x6c1da7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c1ed7 0x6c2101 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c1ed7 0x6c211a [CALL:--x] call OPENSSL_PUT_ERROR
fcn.006c1ed7 0x6c2367 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00815930 0x8176c9 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00815930 0x818b17 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00815930 0x818ea7 [CALL:--x] call OPENSSL_PUT_ERROR
fcn.00815930 0x818ecf [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x81c3c3 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x81c3f6 [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x81d28f [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x81d56e [CALL:--x] call OPENSSL_PUT_ERROR
(nofunc) 0x81e444 [CALL:--x] call OPENSSL_PUT_ERROR
```

Now, use a text diff compare (like [https://diffchecker.com](https://diffchecker.com/)), it’ll show use which fcn are common on both results(notice to look at the `Error_clear_error` side diff, there the fcn xrefs lines without highlight are the ones which are common on both results), which after doing is([https://www.diffchecker.com/USjwLqOo/)](https://www.diffchecker.com/USjwLqOo/\)):

```fallback
fcn.00686eaf
fcn.006a80c6
fcn.0079e35e
fcn.007ac412
fcn.006c12c2
```

now among these if we see which ones have just **one** xref call to `ERR_clear_error()` are:

```bash
# fcn.00686eaf has 2 xrefs to ERR_clear_error()
fcn.00686eaf 0x6871ad [CALL:--x] call ERR_clear_error
fcn.00686eaf 0x687abe [CALL:--x] call ERR_clear_error

# fcn.006a80c6 has 1 xrefs to ERR_clear_error()
fcn.006a80c6 0x6a82cd [CALL:--x] call ERR_clear_error

# fcn.0079e35e has 2 xrefs to ERR_clear_error()
fcn.0079e35e 0x6b0602 [CALL:--x] call ERR_clear_error
fcn.0079e35e 0x6b0704 [CALL:--x] call ERR_clear_error

# fcn.007ac412 has 2 xrefs to ERR_clear_error()
fcn.007ac412 0x6bab5e [CALL:--x] call ERR_clear_error
fcn.007ac412 0x6bb947 [CALL:--x] call ERR_clear_error

# fcn.006c12c2 has 1 xrefs to ERR_clear_error()
fcn.006c12c2 0x6c1933 [CALL:--x] call ERR_clear_error
```

`fcn.006a80c6` and `fcn.006c12c2`, now we can go to one by one each of them and verify with source of `ssl_verify_peer_cert` and find.

`fcn.006c12c2` Decompiled:

```bash
[0x00388dc0]> pdg @fcn.006c12c2
```

Click to expand

```c
ulong fcn.006c12c2(int64_t param_1, ulong param_2, uint8_t **param_3, int64_t *param_4, uchar *param_5, uchar *param_6)

{
    uint16_t *puVar1;
    ushort uVar2;
    uint uVar3;
    int64_t *piVar4;
    uint64_t *puVar5;
    uint8_t *puVar6;
    char cVar7;
    uchar uVar8;
    uint16_t uVar9;
    int32_t iVar10;
    int64_t iVar11;
    uint64_t uVar12;
    uint16_t uVar13;
    uint8_t *puVar14;
    uint8_t uVar15;
    uchar *puVar16;
    uint8_t **ppuVar17;
    uchar *puVar18;
    ulong *puVar19;
    uchar *puVar20;
    uchar *puVar21;
    uchar *puVar22;
    uchar *puVar23;
    uchar *puVar24;
    uchar *puVar25;
    uchar *puVar26;
    uchar *puVar27;
    uchar *puVar28;
    uchar *puVar29;
    uchar *puVar30;
    uchar *puVar31;
    uchar *puVar32;
    uchar *puVar33;
    uchar *puVar34;
    uint64_t uVar35;
    ulong uVar36;
    ulong uVar37;
    ulong uVar38;
    uint64_t uVar39;
    uint8_t uVar40;
    int64_t iVar41;
    uchar auVar42 [16];
    int64_t iStack_e0;
    uchar auStack_d8 [16];
    uchar *puStack_c8;
    uint64_t uStack_98;
    ulong uStack_78;
    uchar auStack_58 [40];

    puVar18 = &stack0xffffffffffffff28;
    *param_4 = 0;
    iVar41 = *(param_1 + 0x30);
    if (*(iVar41 + 0xac) == 1) {
code_r0x006c12e5:
        puVar19 = puVar18 + -8;
        *(puVar18 + -8) = 3;
        goto code_r0x006c13d5;
    }
    iStack_e0 = 0x6c1312;
    uStack_78 = param_2;
    cVar7 = fcn.006b19c9(param_1, &stack0xffffffffffffffa8, &stack0xffffffffffffff68);
    if (cVar7 == '\0') {
        uVar37 = *(iVar41 + 0x118);
        puStack_c8 = param_5;
        *(&stack0xffffffffffffff28 + -8) = 0x6c134a;
        iVar10 = fcn.006b6d59(uVar37);
        if (iVar10 == 0) {
            uVar3 = *(param_1 + 0x10);
            *(&stack0xffffffffffffff28 + -8) = 0x6c138a;
            uVar13 = fcn.006b2f6e(uVar3);
            if (uVar13 < 0x304) {
                iVar11 = 0;
                puVar16 = &stack0xffffffffffffff28;
            }
            else {
                uVar15 = *(param_1 + 0xa4);
                *(&stack0xffffffffffffff28 + -8) = 1;
                iVar11 = *(&stack0xffffffffffffff28 + -8);
                puVar16 = &stack0xffffffffffffff28;
                if ((uVar15 & 1) == 0) {
                    iVar11 = 0x4000;
                    puVar16 = &stack0xffffffffffffff28;
                }
            }
        }
        else if (((*(param_1 + 0xa4) & 1) == 0) ||
                (iVar11 = 0x4000,  puVar16 = &stack0xffffffffffffff28,  (*(*(param_1 + 8) + 0xe8) & 1) != 0)) {
            iVar11 = 0x4000;
            puVar16 = &stack0xffffffffffffff28;
            if (0x4000 < *(param_1 + 0x88)) {
                iVar11 = CONCAT44(0, *(param_1 + 0x88));
            }
        }
        if (iVar11 + 4U < uStack_98) {
            *(puVar16 + -8) = 0x10;
            uVar37 = *(puVar16 + -8);
            *(puVar16 + -8) = 0x6c13ca;
            OPENSSL_PUT_ERROR(uVar37, 0x96, "../../third_party/boringssl/src/ssl/s3_both.cc", 0x212);
            puVar22 = puVar16 + 0;
            uVar8 = 0x2f;
            param_5 = *(puVar16 + 0x10);
            goto code_r0x006c13d1;
        }
        iVar11 = *(puVar16 + 0xe0);
        puVar29 = puVar16;
        if (iVar11 == 0) {
code_r0x006c1497:
            puVar20 = puVar29;
            *param_4 = 5;
code_r0x006c149f:
            puVar19 = puVar20 + -8;
            *(puVar20 + -8) = 2;
            goto code_r0x006c13d5;
        }
        *(puVar16 + 0x40) = param_6 + 1;
        *(puVar16 + 0x48) = iVar11 + -1;
        puVar16[0xf] = *param_6;
        *(puVar16 + -8) = 0x6c141e;
        iVar10 = fcn.00663dd7(puVar16 + 0x40, puVar16 + 0x2e);
        puVar29 = puVar16;
        if (iVar10 == 0) goto code_r0x006c1497;
        *(puVar16 + -8) = 0x6c1431;
        iVar10 = fcn.00663dd7(puVar16 + 0x40, puVar16 + 0x2c);
        puVar21 = puVar16 + 0;
        puVar20 = puVar16 + 0;
        puVar29 = puVar16 + 0;
        if (iVar10 == 0) goto code_r0x006c1497;
        piVar4 = *(iVar41 + 0x108);
        uVar13 = *(puVar16 + 0x2e);
        if (*piVar4 == 0) {
            if ((uVar13 & 0xff00) != 0x300) goto code_r0x006c14b3;
code_r0x006c1464:
            uVar35 = *(puVar20 + 0x2c);
            if (0x4140 < uVar35) {
                *(puVar20 + -8) = 0x10;
                uVar37 = *(puVar20 + -8);
                *(puVar20 + -8) = 0x6c148a;
                OPENSSL_PUT_ERROR(uVar37, 0x92, "../../third_party/boringssl/src/ssl/tls_record.cc", 0xee);
                puVar22 = puVar20 + 0;
                **(puVar20 + 0x10) = 0x16;
                goto code_r0x006c13d3;
            }
            iVar41 = *(puVar20 + 0x48) - uVar35;
            if (uVar35 <= *(puVar20 + 0x48)) {
                *(puVar20 + 0x18) = uVar13;
                *(puVar20 + 0x20) = uVar35;
                *(puVar20 + 0x30) = *(puVar20 + 0x40);
                *(puVar20 + 0x40) = uVar35 + *(puVar20 + 0x40);
                *(puVar20 + 0x48) = iVar41;
                *(puVar20 + -8) = 5;
                uVar37 = *(puVar20 + -8);
                puVar23 = puVar20;
                *(puVar20 + -8) = 0x6c151d;
                auVar42 = fcn.006a019a(param_6, iVar11, 0, uVar37);
                *(puVar20 + 0x58) = auVar42._0_8_;
                *(puVar20 + 0x38) = auVar42._8_8_;
                *(puVar20 + -8) = 0x6c153c;
                fcn.006b6f4c(param_1, 0, 0x100);
                puVar27 = puVar20 + 0;
                iVar11 = iVar11 - iVar41;
                *param_4 = iVar11;
                puVar5 = *(param_1 + 0x30);
                uVar13 = *(puVar5 + 0xdc);
                if ((uVar13 & 2) != 0) {
                    uVar3 = *(param_1 + 0x10);
                    *(puVar20 + -8) = 0x6c155e;
                    uVar9 = fcn.006b2f6e(uVar3);
                    puVar27 = puVar20 + 0;
                    puVar24 = puVar23;
                    if (uVar9 < 0x304) goto code_r0x006c15be;
                    uVar35 = puVar5[0x23];
                    *(puVar20 + -8) = 0x6c1570;
                    iVar10 = fcn.006b6d59(uVar35);
                    puVar27 = puVar23;
                    puVar16 = puVar23;
                    if ((((iVar10 == 0) || (puVar20[0xf] != '\x14')) || (*(puVar20 + 0x20) != 1)) ||
                       (**(puVar20 + 0x30) != '\x01')) goto code_r0x006c15be;
                    *(puVar5 + 0xd2) = *(puVar5 + 0xd2) + '\x01';
                    if (0x20 < *(*(param_1 + 0x30) + 0xd2)) {
                        *(puVar24 + -8) = 0x10;
                        uVar38 = *(puVar24 + -8);
                        puVar25 = puVar24 + 0;
                        uVar36 = 0xdb;
                        uVar37 = 0x107;
code_r0x006c1ab3:
                        *(puVar25 + -8) = 0x6c1ab8;
                        OPENSSL_PUT_ERROR(uVar38, uVar36, "../../third_party/boringssl/src/ssl/tls_record.cc", uVar37);
                        puVar22 = puVar25;
                        **(puVar25 + 0x10) = 10;
                        goto code_r0x006c13d3;
                    }
code_r0x006c1bd6:
                    puVar19 = puVar16 + -8;
                    *(puVar16 + -8) = 1;
                    goto code_r0x006c13d5;
                }
code_r0x006c15be:
                if ((((uVar13 & 1) != 0) && (*puVar5[0x21] == 0)) && (puVar27[0xf] == '\x17')) {
                    puVar16 = *(puVar27 + 0x10);
                    goto code_r0x006c164a;
                }
                uVar35 = *puVar5;
                if (uVar35 == 0xffffffffffffffff) {
                    *(puVar27 + -8) = 0x10;
                    uVar36 = *(puVar27 + -8);
                    *(puVar27 + -8) = 0x45;
                    uVar37 = *(puVar27 + -8);
                    *(puVar27 + -8) = 0x6c166b;
                    OPENSSL_PUT_ERROR(uVar36, uVar37, "../../third_party/boringssl/src/ssl/tls_record.cc", 0x118);
                    puVar22 = puVar27 + 0;
                    **(puVar27 + 0x10) = 0x50;
                    goto code_r0x006c13d3;
                }
                piVar4 = puVar5[0x21];
                if (*piVar4 == 0) {
                    *param_3 = *(puVar27 + 0x30);
                    param_3[1] = *(puVar27 + 0x20);
                    puVar16 = *(puVar27 + 0x10);
code_r0x006c1875:
                    puVar1 = *(param_1 + 0x30) + 0xdc;
                    *puVar1 = *puVar1 & 0xfffe;
                    **(param_1 + 0x30) = **(param_1 + 0x30) + 1;
                    iVar41 = *(param_1 + 0x30);
                    uVar15 = puVar27[0xf];
                    if (**(iVar41 + 0x108) == 0) {
                        puVar14 = param_3[1];
                        if (0x4000 < param_3[1]) goto code_r0x006c1976;
                        ppuVar17 = param_3 + 1;
                    }
                    else {
                        uVar2 = *(*(iVar41 + 0x108) + 0x26e);
                        *(puVar27 + -8) = 0x6c18ae;
                        uVar13 = fcn.006b2f6e(uVar2);
                        puVar30 = puVar27;
                        puVar14 = param_3[1];
                        if ((1 + 0x4000) - (uVar13 < 0x304) < puVar14) {
code_r0x006c1976:
                            *(puVar27 + -8) = 0x10;
                            uVar37 = *(puVar27 + -8);
                            *(puVar27 + -8) = 0x6c198f;
                            OPENSSL_PUT_ERROR(uVar37, 0x88, "../../third_party/boringssl/src/ssl/tls_record.cc", 0x138);
                            puVar22 = puVar27 + 0;
                            *puVar16 = 0x16;
                            goto code_r0x006c13d3;
                        }
                        ppuVar17 = param_3 + 1;
                        if (0x303 < uVar13) {
                            if (uVar15 != 0x17) {
                                *(puVar27 + -8) = 0x10;
                                uVar37 = *(puVar27 + -8);
                                *(puVar27 + -8) = 0x6c1af8;
                                OPENSSL_PUT_ERROR(uVar37, 0xfb, "../../third_party/boringssl/src/ssl/tls_record.cc",
                                                  0x140);
                                puVar22 = puVar27 + 0;
                                **(puVar27 + 0x10) = 0x32;
                                goto code_r0x006c13d3;
                            }
                            do {
                                if (puVar14 == NULL) {
                                    *(puVar30 + -8) = 0x10;
                                    uVar37 = *(puVar30 + -8);
                                    *(puVar30 + -8) = 0x6c1b3a;
                                    OPENSSL_PUT_ERROR(uVar37, 0x8b, "../../third_party/boringssl/src/ssl/tls_record.cc"
                                                      , 0x147);
                                    puVar22 = puVar30 + 0;
                                    **(puVar30 + 0x10) = 0x33;
                                    goto code_r0x006c13d3;
                                }
                                puVar6 = *param_3;
                                uVar15 = (puVar6 + -1)[puVar14];
                                *(puVar30 + -8) = 0x6c1902;
                                auVar42 = fcn.006a019a(puVar6, puVar14, 0, puVar14 + -1);
                                puVar14 = auVar42._8_8_;
                                puVar27 = puVar30;
                                *param_3 = auVar42._0_8_;
=
                            } while ((uVar15 & uVar15) == 0);
                            iVar41 = *(param_1 + 0x30);
                        }
                    }
                    if (puVar14 == NULL) {
                        *(iVar41 + 0xd2) = *(iVar41 + 0xd2) + '\x01';
                        if (0x20 < *(*(param_1 + 0x30) + 0xd2)) {
                            *(puVar27 + -8) = 0x10;
                            uVar38 = *(puVar27 + -8);
                            puVar25 = puVar27;
                            uVar36 = 0xdb;
                            uVar37 = 0x154;
                            goto code_r0x006c1ab3;
                        }
                    }
                    else {
                        *(iVar41 + 0xd2) = 0;
                    }
                    if (uVar15 == 0x16) {
code_r0x006c1ac5:
                        *(*(param_1 + 0x30) + 0xd3) = 0;
                        **(puVar27 + 0x60) = uVar15;
                        return 0;
                    }
                    if (uVar15 != 0x15) {
                        *(puVar27 + -8) = 0x6c1a9b;
                        cVar7 = fcn.006b1a7f(param_1);
                        if (cVar7 == '\0') goto code_r0x006c1ac5;
                        *(puVar27 + -8) = 0x10;
                        uVar38 = *(puVar27 + -8);
                        puVar25 = puVar27 + 0;
                        uVar36 = 0xe1;
                        uVar37 = 0x165;
                        goto code_r0x006c1ab3;
                    }
                    if (*ppuVar17 == 0x2) {
                        puVar14 = *param_3;
                        *(puVar27 + -8) = 0x15;
                        uVar37 = *(puVar27 + -8);
                        *(puVar27 + -8) = 2;
                        uVar36 = *(puVar27 + -8);
                        puVar31 = puVar27 + 0;
                        puVar32 = puVar31;
                        *(puVar27 + -8) = 0x6c1a11;
                        fcn.006b6f4c(param_1, 0, uVar37, puVar14, uVar36);
                        uVar15 = *puVar14;
                        uVar40 = puVar14[1];
                        *(puVar32 + -8) = 0x6c1a2c;
                        fcn.006b6f30(param_1, 0x4004, uVar15 << 8 | uVar40);
                        puVar18 = puVar32;
                        if (uVar15 == 2) {
                            *(puVar32 + -8) = 0x10;
                            uVar37 = *(puVar32 + -8);
                            *(puVar32 + -8) = 0x6c1b61;
                            OPENSSL_PUT_ERROR(uVar37, uVar40 + 1000, "../../third_party/boringssl/src/ssl/tls_record.cc"
                                              , 0x250);
                            *(puVar31 + -8) = 0x6c1b71;
                            fcn.0066d775("SSL alert number %d", uVar40);
                            puVar22 = puVar31 + 0;
                            **(puVar31 + 0x10) = 0;
                            goto code_r0x006c13d3;
                        }
                        if (uVar15 == 1) {
                            iVar41 = *(param_1 + 0x30);
                            if (uVar40 == 0) {
                                *(iVar41 + 0xac) = 1;
                                goto code_r0x006c12e5;
                            }
                            puVar16 = puVar32;
                            if ((*(iVar41 + 0xdc) & 2) != 0) {
                                uVar3 = *(param_1 + 0x10);
                                iVar11 = -8;
                                *(puVar32 + iVar11) = 0x6c1a61;
                                uVar13 = fcn.006b2f6e(uVar3);
                                puVar33 = puVar31 + 0;
                                puVar16 = puVar31 + 0;
                                if ((uVar40 != 0x5a) && (puVar16 = puVar31 + 0,  0x303 < uVar13)) {
                                    **(puVar32 + 0x10) = 0x32;
                                    *(puVar31 + iVar11) = 0x10;
                                    uVar38 = *(puVar31 + iVar11);
                                    *(puVar33 + -8) = 0x66;
                                    uVar36 = *(puVar33 + -8);
                                    puVar34 = puVar33 + 0;
                                    uVar37 = 0x242;
                                    goto code_r0x006c1b9a;
                                }
                            }
                            *(iVar41 + 0xd3) = *(iVar41 + 0xd3) + '\x01';
                            if (*(*(param_1 + 0x30) + 0xd3) < 5) goto code_r0x006c1bd6;
                            **(puVar16 + 0x10) = 10;
                            *(puVar16 + -8) = 0x10;
                            uVar38 = *(puVar16 + -8);
                            puVar34 = puVar16;
                            uVar36 = 0xdc;
                            uVar37 = 0x249;
                        }
                        else {
                            **(puVar32 + 0x10) = 0x2f;
                            *(puVar32 + -8) = 0x10;
                            uVar38 = *(puVar32 + -8);
                            puVar34 = puVar32;
                            uVar36 = 0xe3;
                            uVar37 = 599;
                        }
                    }
                    else {
                        **(puVar27 + 0x10) = 0x32;
                        *(puVar27 + -8) = 0x10;
                        uVar38 = *(puVar27 + -8);
                        *(puVar27 + -8) = 0x66;
                        uVar36 = *(puVar27 + -8);
                        puVar34 = puVar27 + 0;
                        uVar37 = 0x227;
                    }
code_r0x006c1b9a:
                    *(puVar34 + -8) = 0x6c1b9f;
                    OPENSSL_PUT_ERROR(uVar38, uVar36, "../../third_party/boringssl/src/ssl/tls_record.cc", uVar37);
                    puVar22 = puVar34;
                }
                else {
                    uVar15 = *(piVar4 + 0x271);
                    if ((uVar15 & 8) == 0) {
                        *(puVar27 + -8) = 0x6c15f9;
                        uVar12 = fcn.006b2ff6();
                        uVar39 = *(puVar27 + 0x20);
                        uVar13 = uVar39 + uVar12 * -1;
                        if (uVar12 <= uVar39) goto code_r0x006c16a1;
                        *(puVar27 + -8) = 0x10;
                        uVar36 = *(puVar27 + -8);
                        puVar26 = puVar27 + 0;
                        *(puVar27 + -8) = 0x70;
                        uVar37 = *(puVar27 + -8);
                        *(puVar26 + -8) = 0x6c1621;
                        OPENSSL_PUT_ERROR(uVar36, uVar37, "../../third_party/boringssl/src/ssl/ssl_aead_ctx.cc", 0x100);
                        puVar28 = puVar26 + 0;
                        puVar16 = *(puVar26 + 0x10);
                    }
                    else {
                        uVar13 = 0;
                        uVar39 = *(puVar27 + 0x20);
code_r0x006c16a1:
                        uVar35 = uVar35 >> 0x38 | (uVar35 & 0xff000000000000) >> 0x28 |
                                 (uVar35 & 0xff0000000000) >> 0x18 | (uVar35 & 0xff00000000) >> 8 |
                                 (uVar35 & 0xff000000) << 8 | (uVar35 & 0xff0000) << 0x18 | (uVar35 & 0xff00) << 0x28 |
                                 uVar35 << 0x38;
                        if ((uVar15 & 0x10) == 0) {
                            *(puVar27 + 0x70) = uVar35;
                            puVar27[0x78] = puVar27[0xf];
                            puVar27[0x79] = *(puVar27 + 0x18) >> 8;
                            puVar27[0x7a] = *(puVar27 + 0x18);
                            *(puVar27 + 0x58) = puVar27 + 0x70;
                            if ((uVar15 & 8) == 0) {
                                *(puVar27 + 0x7b) = uVar13 << 8 | uVar13 >> -8 + 0x10;
                                *(puVar27 + -8) = 0xd;
                            }
                            else {
                                *(puVar27 + -8) = 0xb;
                            }
                            *(puVar27 + 0x38) = *(puVar27 + -8);
                        }
                        uVar12 = *(piVar4 + 0x26c);
                        uVar40 = uVar15 & 4;
                        *(puVar27 + 0x50) = piVar4;
                        if (uVar40 == 0) {
                            if (uVar12 != 0) {
                                *(puVar27 + 0x18) = uVar12;
                                *(puVar27 + -8) = 0x6c1715;
                                sym.imp.memcpy(puVar27 + 0x80, piVar4 + 0x4c);
                                puVar27 = puVar27;
                                goto code_r0x006c1737;
                            }
code_r0x006c173e:
                            *(puVar27 + 0x18) = 0;
                        }
                        else {
                            iVar41 = uVar12 - *(piVar4 + 0x26d);
                            if (iVar41 == 0) goto code_r0x006c173e;
                            *(puVar27 + 0x18) = iVar41;
                            *(puVar27 + -8) = 0x6c1737;
                            sym.imp.memset(puVar27 + 0x80, 0);
                            puVar27 = puVar27;
code_r0x006c1737:
                            uVar39 = *(puVar27 + 0x20);
                        }
                        if ((uVar15 & 1) == 0) {
                            iVar11 = *(puVar27 + 0x18);
                            *(puVar27 + iVar11 + 0x80) = uVar35;
                            puVar16 = *(puVar27 + 0x10);
                            uVar37 = *(puVar27 + 0x30);
                            iVar41 = *(puVar27 + 0x50);
                        }
                        else {
                            iVar41 = *(puVar27 + 0x50);
                            uVar35 = *(iVar41 + 0x26d);
                            puVar16 = *(puVar27 + 0x10);
                            if (uVar39 < uVar35) {
                                *(puVar27 + -8) = 0x10;
                                uVar36 = *(puVar27 + -8);
                                *(puVar27 + -8) = 0x70;
                                uVar37 = *(puVar27 + -8);
                                *(puVar27 + -8) = 0x6c1799;
                                OPENSSL_PUT_ERROR(uVar36, uVar37, "../../third_party/boringssl/src/ssl/ssl_aead_ctx.cc"
                                                  , 0x11b);
                                puVar28 = puVar27 + 0;
                                goto code_r0x006c1919;
                            }
                            puVar29 = puVar27;
                            if (uVar35 != 0) {
                                *(puVar27 + -8) = 0x6c17c0;
                                sym.imp.memcpy(puVar27 + *(puVar27 + 0x18) + 0x80, *(puVar27 + 0x30), uVar35);
                                puVar29 = puVar27;
                                uVar39 = *(puVar27 + 0x20);
                            }
                            *(puVar29 + -8) = 0xffffffffffffffff;
                            uVar37 = *(puVar29 + 0x30);
                            *(puVar29 + -8) = 0x6c17d8;
                            auVar42 = fcn.006a019a(uVar37, uVar39, uVar35);
                            uVar39 = auVar42._8_8_;
                            puVar27 = puVar29 + 0;
                            uVar37 = auVar42._0_8_;
                            uVar40 = *(iVar41 + 0x271) & 4;
                            iVar11 = *(puVar29 + 0x18);
                        }
                        uVar15 = *(iVar41 + 0x26d);
                        uVar36 = *(puVar27 + 0x58);
                        if ((uVar40 & uVar40) != 0) {
                            uVar40 = *(iVar41 + 0x26c);
                            for (uVar35 = 0; uVar40 != uVar35; uVar35 = uVar35 + 1) {
                                puVar27[uVar35 + 0x80] = puVar27[uVar35 + 0x80] ^ *(iVar41 + 0x260 + uVar35);
                            }
                        }
                        *(puVar27 + -8) = *(puVar27 + 0x38);
                        *(puVar27 + -0x10) = uVar36;
                        *(puVar27 + -0x18) = uVar39;
                        *(puVar27 + -0x20) = uVar37;
                        *(puVar27 + -0x28) = 0x6c184e;
                        iVar10 = fcn.0067c991(iVar41 + 8, uVar37, puVar27 + 0x68, uVar39, puVar27 + 0x80,
                                              iVar11 + uVar15);
                        puVar28 = puVar27;
                        if (iVar10 != 0) {
                            *(puVar27 + -8) = 0x6c186c;
                            auVar42 = fcn.006a019a(uVar37, uVar39, 0, *(puVar27 + 0x68));
                            puVar27 = puVar27;
                            *param_3 = auVar42._0_8_;
=
                            goto code_r0x006c1875;
                        }
                    }
code_r0x006c1919:
                    if (((*(*(param_1 + 0x30) + 0xdc) & 1) != 0) && (**(*(param_1 + 0x30) + 0x108) != 0)) {
                        *(puVar28 + -8) = 0x6c1938;
                        ERR_clear_error();
                        puVar27 = puVar28;
                        iVar11 = *param_4;
code_r0x006c164a:
                        *(puVar27 + -8) = 0x6c164f;
                        uVar37 = fcn.006c1bed(param_1, puVar16, iVar11);
                        return uVar37;
                    }
                    *(puVar28 + -8) = 0x10;
                    uVar37 = *(puVar28 + -8);
                    *(puVar28 + -8) = 0x6c1960;
                    OPENSSL_PUT_ERROR(uVar37, 0x8b, "../../third_party/boringssl/src/ssl/tls_record.cc", 0x126);
                    puVar22 = puVar28 + 0;
                    *puVar16 = 0x14;
                }
                goto code_r0x006c13d3;
            }
            *param_4 = uVar35 + 5;
            goto code_r0x006c149f;
        }
        uVar3 = *(piVar4 + 0x4e);
        uVar2 = *(piVar4 + 0x26e);
        *(puVar16 + -8) = 0x6c145c;
        uVar9 = fcn.006b2f8c(uVar2, uVar3);
        puVar20 = puVar16;
        puVar21 = puVar16;
        if (uVar13 == uVar9) goto code_r0x006c1464;
code_r0x006c14b3:
        *(puVar21 + -8) = 0x10;
        uVar37 = *(puVar21 + -8);
        *(puVar21 + -8) = 0x6c14cc;
        OPENSSL_PUT_ERROR(uVar37, 0xf7, "../../third_party/boringssl/src/ssl/tls_record.cc", 0xe7);
        puVar22 = puVar21 + 0;
        **(puVar21 + 0x10) = 0x46;
    }
    else {
        *(&stack0xffffffffffffff28 + -8) = 0x10;
        uVar37 = *(&stack0xffffffffffffff28 + -8);
        *(*0x20 + -0xe0) = 0x44;
        iStack_e0 = 0x6c132d;
        OPENSSL_PUT_ERROR(uVar37, *(*0x20 + -0xe0), "../../third_party/boringssl/src/ssl/s3_both.cc", 0x20b);
        puVar22 = &stack0xffffffffffffff28;
        uVar8 = 0x50;
code_r0x006c13d1:
        *param_5 = uVar8;
    }
code_r0x006c13d3:
    puVar19 = puVar22 + -8;
    *(puVar22 + -8) = 4;
code_r0x006c13d5:
    return *puVar19;
}
```

`fcn.006a80c6` decompiled:

```bash
[0x00388dc0]> pdg @fcn.006a80c6
```

Click to expand

```c
uint64_t fcn.006a80c6(int64_t *param_1)

{
    int64_t iVar1;
    int64_t iVar2;
    uint64_t *puVar3;
    uint64_t *puVar4;
    code *pcVar5;
    uint8_t uVar6;
    uint32_t uVar7;
    int32_t iVar8;
    ulong in_RAX;
    int64_t iVar9;
    uint64_t uVar10;
    int64_t iVar11;
    ulong uVar12;
    ulong *puVar13;
    uchar *puVar14;
    uchar *puVar15;
    uchar *puVar16;
    uchar *puVar17;
    uchar *puVar18;
    uchar *puVar19;
    uchar *puVar20;
    uint64_t uVar21;
    ulong uVar22;
    uint64_t uStack_40;
    ulong uStack_38;

    puVar13 = &stack0xffffffffffffffc8;
    iVar1 = *param_1;
    iVar2 = *(*(iVar1 + 0x30) + 0x1d0);
    if (iVar2 == 0) {
        uStack_38 = CONCAT71(in_RAX >> 8, 0x2e);
        if (*(param_1[1] + 0x30) == NULL) {
            uStack_40 = 0x6a8231;
            uVar6 = (**(*(*(iVar1 + 0x68) + 8) + 0x48))(param_1[0xbe], param_1, &stack0xffffffffffffffc8);
            puVar18 = &stack0xffffffffffffffc8;
            uVar21 = uVar6 ^ 1;
code_r0x006a82e6:
            if (uVar21 != 0) {
                if (uVar21 != 1) goto code_r0x006a8208;
                *(puVar18 + -8) = 0x10;
                uVar22 = *(puVar18 + -8);
                *(puVar18 + -8) = 0x7d;
                uVar12 = *(puVar18 + -8);
                *(puVar18 + -8) = 0x6a830a;
                OPENSSL_PUT_ERROR(uVar22, uVar12, "../../third_party/boringssl/src/ssl/handshake.cc", 0x189);
                puVar16 = puVar18 + 0;
                uVar21 = *(puVar18 + 0);
                goto code_r0x006a81fd;
            }
        }
        else {
            uStack_40 = 0x6a8116;
            uVar7 = (**(param_1[1] + 0x30))(iVar1, &stack0xffffffffffffffc8);
            puVar18 = &stack0xffffffffffffffc8;
            if (uVar7 == 1) {
                if (*(param_1[1] + 0xe8) == '\0') {
                    *(&stack0xffffffffffffffc8 + -8) = 0x6a82d2;
                    ERR_clear_error();
                    puVar18 = &stack0xffffffffffffffc8;
                    uVar21 = 0;
                }
                else {
                    *(&stack0xffffffffffffffc8 + -8) = 1;
                    uVar21 = *(&stack0xffffffffffffffc8 + -8);
                    puVar18 = &stack0xffffffffffffffc8;
                }
                *(param_1[0xbe] + 0xb8) = 0x32;
                goto code_r0x006a82e6;
            }
            uVar21 = uVar7;
            if (uVar7 != 0) goto code_r0x006a82e6;
            *(param_1[0xbe] + 0xb8) = 0;
            puVar18 = &stack0xffffffffffffffc8;
        }
        uVar21 = 0;
        if (((*(iVar1 + 0xa4) & 1) != 0) || ((*(param_1[1] + 0xe9) & 4) == 0)) goto code_r0x006a8208;
        pcVar5 = *(*(iVar1 + 0x68) + 0x240);
        if (pcVar5 == NULL) goto code_r0x006a8208;
        uVar12 = *(*(iVar1 + 0x68) + 0x248);
        puVar19 = puVar18;
        *(puVar18 + -8) = 0x6a8353;
        iVar8 = (*pcVar5)(iVar1, uVar12);
        if (iVar8 != 0 && -1 < iVar8) goto code_r0x006a8208;
        *(puVar19 + -8) = 0x10;
        uVar12 = *(puVar19 + -8);
        iVar2 = -8;
        *(puVar19 + iVar2) = 0x6a8377;
        OPENSSL_PUT_ERROR(uVar12, 0x121, "../../third_party/boringssl/src/ssl/handshake.cc", 0x195);
        puVar20 = puVar18 + 0;
        *(puVar18 + iVar2) = 0x71;
        uVar10 = *(puVar18 + iVar2);
        *(puVar20 + -8) = 0x50;
        puVar16 = puVar20 + 0;
        uVar21 = *(puVar20 + -8);
        if (iVar8 == 0) {
            uVar21 = uVar10;
        }
        uVar21 = uVar21 & 0xffffffff;
    }
    else {
        puVar3 = *(iVar2 + 0x90);
        if (puVar3 == NULL) {
            uVar21 = 0;
        }
        else {
            uVar21 = *puVar3;
        }
        puVar4 = *(param_1[0xbe] + 0x90);
        if (puVar4 == NULL) {
            uVar10 = 0;
        }
        else {
            uVar10 = *puVar4;
        }
        uStack_38 = in_RAX;
        if (uVar21 == uVar10) {
            uVar21 = 0;
            while( true ) {
                if (puVar4 == NULL) {
                    uVar10 = 0;
                }
                else {
                    uVar10 = *puVar4;
                }
                if (uVar10 <= uVar21) {
                    uVar12 = *(iVar2 + 0x108);
                    puVar13[-1] = 0x6a824d;
                    fcn.006a8388(puVar13, uVar12);
                    iVar1 = param_1[0xbe];
                    uVar12 = *puVar13;
                    *puVar13 = 0;
                    puVar17 = puVar13;
                    *(puVar13 + -8) = 0x6a8265;
                    fcn.006a597a(iVar1 + 0x108, uVar12);
                    *(puVar17 + -8) = 0x6a826d;
                    fcn.006a838e(puVar13);
                    uVar12 = *(iVar2 + 0x100);
                    *(puVar17 + -8) = 0x6a827f;
                    fcn.006a8388(puVar17, uVar12);
                    iVar1 = param_1[0xbe];
                    uVar12 = *puVar17;
                    *puVar17 = 0;
                    *(puVar17 + -8) = 0x6a8297;
                    fcn.006a597a(iVar1 + 0x100, uVar12);
                    *(puVar17 + -8) = 0x6a829f;
                    fcn.006a838e(puVar17);
                    *(param_1[0xbe] + 0xb8) = *(iVar2 + 0xb8);
                    uVar21 = 0;
                    goto code_r0x006a8208;
                }
                if ((puVar3 == NULL) || (*puVar3 < uVar21 || *puVar3 == uVar21)) {
                    iVar9 = 0;
                }
                else {
                    iVar9 = *(puVar3[1] + uVar21 * 8);
                }
                if ((puVar4 == NULL) || (*puVar4 < uVar21 || *puVar4 == uVar21)) {
                    iVar11 = 0;
                }
                else {
                    iVar11 = *(puVar4[1] + uVar21 * 8);
                }
                if (*(iVar9 + 0x10) != *(iVar11 + 0x10)) break;
                if (*(iVar9 + 0x10) != 0) {
                    uVar12 = *(iVar11 + 8);
                    uVar22 = *(iVar9 + 8);
                    puVar13[-1] = 0x6a81c2;
                    iVar8 = sym.imp.memcmp(uVar22, uVar12);
                    puVar13 = puVar13;
                    if (iVar8 != 0) break;
                }
                uVar21 = uVar21 + 1;
            }
            *(puVar13 + -8) = 0x10;
            uVar22 = *(puVar13 + -8);
            puVar14 = puVar13;
            uVar12 = 0x15d;
        }
        else {
            uStack_40 = 0x10;
            uVar22 = 0x10;
            puVar14 = &stack0xffffffffffffffc8;
            uVar12 = 0x14e;
        }
        puVar15 = puVar14;
        *(puVar14 + -8) = 0x6a81fa;
        OPENSSL_PUT_ERROR(uVar22, 0x111, "../../third_party/boringssl/src/ssl/handshake.cc", uVar12);
        *(puVar15 + -8) = 0x2f;
        uVar21 = *(puVar15 + -8);
        puVar16 = puVar15;
    }
code_r0x006a81fd:
    *(puVar16 + -8) = 0x6a8205;
    fcn.006b2afc(iVar1, uVar21);
    *(puVar16 + -8) = 1;
    uVar21 = *(puVar16 + -8);
code_r0x006a8208:
    return uVar21 & 0xffffffff;
}
```

Here the key factors which will help us determine the `ssl_verify_peer_cert` function are:

-   At least 3 uses of `OPENSSL_PUT_ERROR` macro.
-   One call of `ERR_clear_error` function.
-   One call of `memcmp` function.
-   In `OPENSSL_PUT_ERROR` function, the third argument is the file name and we know that `ssl_verify_peer_cert` function is in `handshake.cc` file.

Well actually just the last point is enough to determine the function.

Viola! We found the function(`fcn.006a80c6`), that’s it!

Now Patch it or do whatever you want to do with it:)

Hope you enjoyed reading till here:-D

Good luck and happy reversing!
