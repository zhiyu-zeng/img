---
title: Android – Trusted Execution Environment
source: https://blog.byterialab.com/android-trusted-execution-environment/
source_host: blog.byterialab.com
clip_date: 2026-10-16T10:17:38+08:00
trace_id: 13e1a8e9-13de-4126-bc52-7d0e963dfe99
content_hash: 451a3519238279572049c928e85c8670625a1280067531bf92da24edf0dc3dcf
status: synced
tags:
  - Android逆向
  - 内核
series: null
feed_source: Byteria·Android移动安全/RE
ai_summary: Android 的 TEE 是处理器提供的硬件级隔离"安全世界"，REE 侧应用经 libteecl.so 与 /dev/tzdev 调用，把密钥、指纹、DRM 等敏感操作交给 TEE 中的可信应用执行。
ai_summary_style: key-points
images_status:
  total: 13
  succeeded: 13
  failed_urls: []
notion_page_id: 3fb75244-d011-81a9-93d9-c61f791fff1b
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 的 TEE 是处理器提供的硬件级隔离"安全世界"，REE 侧应用经 libteecl.so 与 /dev/tzdev 调用，把密钥、指纹、DRM 等敏感操作交给 TEE 中的可信应用执行。
> 
> - **双世界划分：** REE 运行 Android 内核、服务与用户应用，暴露面大；TEE 是硬件隔离的 Secure World，运行 Trusted OS 与彼此隔离的 TA。
> - **底层架构：** 基于 ARM TrustZone 拆分 Normal/Secure World，Android 上的方案包括 Google Trusty、开源 OP-TEE 与三星 TEEgris。
> - **通信与切换：** REE 不能直接访问 TEE 内存，需经内核 TZ 驱动和用户态客户端库；切换由 SMC 触发，Secure Monitor 保存 CPU 上下文后交给 Trusted OS 执行 TA，再经受控通道回传结果。
> - **客户端 API 与实现：** libteecl.so 实现 GlobalPlatform 的 TEEC_* 接口并扩展三星私有 TEECS_*，主流程为 InitializeContext → OpenSession → InvokeCommand；其中 name 为 NULL 或 "TEE Samsung" 时选默认 TEE，malloc(0x40) 分配 context，再经 client_get_fd("/dev/tzdev")、open_connection、run_transaction、validate_transaction 建链并校验。
> - **REE 侧调用方：** /proc/*/maps 扫描显示 keymint/keymaster、gatekeeper、生物识别、Widevine、HDCP、DRK 等服务加载了该库，将密钥管理与认证等委派给 TEE。

TEE (Trusted Execution Environment) is a general security technology used across different architectures and platforms. In this article, however, we will focus specifically on TEE solutions in Android devices.

On Android devices, TEE is a hardware-backed isolated execution environment provided by the processor. The operating system and applications we use in daily life run in the “Normal World,” also known as the REE (Rich Execution Environment). The REE includes the Android kernel, services, and user applications. However, it is a complex environment exposed to potential attacks, and on its own, it is not sufficient for handling critical security functions.

This is where TEE comes into play. TEE is a smaller, hardware-level isolated “Secure World,” separate from the REE. Within this environment, sensitive data such as cryptographic keys stored by the manufacturer are protected, and a security-focused operating system called the Trusted OS runs. The Trusted OS manages trusted applications (TAs), which handle critical tasks such as secure storage, key management, fingerprint authentication, or verified boot. Since TAs operate in isolation from one another, a vulnerability in one application does not affect the others.

In the Android ecosystem, this structure is largely built on the ARM TrustZone architecture. TrustZone splits the processor into two: running the Android operating system in the Normal World and the TEE OS in the Secure World. Examples of TEE solutions used on Android devices include Google’s Trusty, the open-source OP-TEE, and Samsung’s TEEgris operating system.

**REE ↔ TEE: Transition and Communication**

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d6a90e3034e9ff49.jpg)

The processor provides two logical execution environments: the Normal World (REE), which hosts the Android operating system and user applications, and the Secure World (TEE), which is dedicated to critical security functions such as key management, secure storage, and biometric authentication. Applications in the REE cannot directly access TEE memory; instead, they send controlled requests through the TZ driver in the kernel and user-space client libraries.

## SMC 上下文切换

The actual context switch occurs via a Secure Monitor Call (SMC): the Secure Monitor saves the CPU context and hands control over to the Trusted OS in the Secure World. The Trusted OS then executes the relevant Trusted Application (TA) and returns the result to the REE through controlled channels. This isolation is designed to ensure that sensitive data within the TEE remains protected even if the REE is compromised.

**TEEgris Review**

The TEEgris security framework used in Samsung devices is implemented as a vendor-specific solution for the Trusted Execution Environment (TEE) within the Android ecosystem. Most users are unaware of the existence of these components. However, a significant portion of the device’s critical operations, such as secure key management, fingerprint authentication, and encryption, are carried out on TEEgris.

This article presents findings from an examination of a rooted Samsung Galaxy A16. The aim is to demonstrate how theoretical concepts of TEE are manifested in a real device, identify the TEE-related files present, discuss their potential functions and illustrate how they can be analyzed through reverse engineering.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/552e360791246191.png)

The output above shows the result of using the **find** command to list files containing the term *tee* within the */vendor*, */system*, */odm*, and */product* directories of the device. The list includes TEEgris-related init scripts, shared libraries, and Trusted UI components.

## libteecl.so 与客户端 API

**libteecl.so Analysis**

**libteecl.so** is one of the critical user-space libraries of the TEEgris framework on the Android side. It contains the implementation of the GlobalPlatform TEE Client API and enables clients running in the Normal World (REE) to establish secure communication with the TEE in the Secure World.

There are two main groups of functions within the library:

***TEEC\_** functions* \* → These represent the standard client API defined by GlobalPlatform. They provide the core functionality that allows applications in the REE to connect to the TEE, open sessions, send commands, and close sessions.

****TEECS** \_* functions* \* → These are extended functions specific to Samsung’s TEEgris framework. This group provides additional control and management mechanisms beyond the standard API.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/9bd89582b907ddf8.png)

**TEEC_InitializeContext**

## TEECInitializeContext 解析

According to the TEE Client API Specification:  
The **TEEC_InitializeContext** function is used to establish the initial connection between a client application and the target TEE (Trusted Execution Environment). This function is the first step an application must take before opening a session on the TEE.

It creates a connection between the client application and the specified TEE. Through this connection, operations such as opening sessions, sending commands, or allocating shared memory can be performed later.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/464512149be3e5d2.png)

If the **name** parameter is passed as **NULL**, the implementation (for example, Samsung’s *libteecl.so* library) must select the default TEE. Which names are supported and which world the default TEE points to are entirely dependent on the manufacturer.

The **context** parameter is the **TEEC_Context** structure provided by the application. When the function is called, this structure is initialized and then used in subsequent interactions with the TEE.

After outlining its definition in the specification, let’s now examine how this function is implemented in Samsung’s *libteecl.so* library.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/8c9b5d4da576d5d7.png)

In the code snippet above, **param_1** (the *name* parameter) is checked:

-   If it is passed as **NULL** or the string **“TEE Samsung”**, the function proceeds to connect to the default Samsung TEE.
-   This check corresponds to the GlobalPlatform specification rule stating that *“name may be NULL, and the implementation must select the default TEE.”*
-   Next, memory is allocated for the **context** structure (using `malloc(0x40)`).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/faa0ca4f0abd5983.png)

The code snippet above illustrates the critical point at which the **TEEC_InitializeContext** function actually establishes a connection to the Trusted Execution Environment (TEE).

-   **client_get_fd(“/dev/tzdev”)**: The client in user space obtains a file descriptor (fd) through the *tzdev* driver in the Linux kernel to communicate with the TEE. This fd acts as the bridge between the Normal World (REE) and the Secure World (TEE).
-   **open_connection**: After obtaining the fd, the initial connection request is sent to the TEE. At this point, a handshake process similar to opening a session begins.
-   **run_transaction**: After the connection is established, a small transaction is sent to the TEE. This is used to verify that the connection is functioning properly.
-   **validate_transaction**: The validity of the transaction result is checked. If an error occurs at this stage, the function returns an error code; if successful, the context is properly initialized.

In summary, in this section the **TEEC_InitializeContext** function connects to the Secure World through **/dev/tzdev**, sends its initial message, and verifies the validity of the connection.

**TEEC_OpenSession**

## TEECOpenSession 参数

According to the TEE Client API Specification:  
This function starts a new session between the client application and the specified Trusted Application (TA). Upon success, the session structure is filled, and the client can then begin exchanging commands with the TA inside the TEE.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/ffa00e335f341880.png)

**context** → The connection object prepared with **TEEC_InitializeContext**. It serves as the main gateway for communication with the TEE.

**session** → The structure that holds the information of the new session. It is populated if the function succeeds and is used in subsequent calls.

**destination** → The unique UUID that identifies the target Trusted Application (TA). In other words, it specifies *which TA to connect to*.

**connectionMethod** → Defines how the session will be opened. For example: public access (**TEEC_LOGIN_PUBLIC**) or user-specific (**TEEC_LOGIN_USER**).

**connectionData** → Additional information depending on the chosen connection method. In most cases this is **NULL**, but for example, in group-based logins the group ID is provided here.

**operation** → Optional parameters that can be sent as the first message to the TA when opening a session. If not needed, this is set to **NULL**.

**returnOrigin** → Indicates the source of an error if one occurs: whether it originated from the API, the communication layer, the TEE itself, or the TA.

After outlining the specification, let’s now examine how this function is implemented in Samsung’s *libteecl.so* library.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/128d8bff5a15fab2.png)

When the function is called, the first step is to check whether the **context**, **session**, and **UUID pointers** are null. If any of them are NULL, an *“Invalid session input parameters”* error is logged, and the session initiation process is not started. This step ensures the validity of the client-provided parameters before any communication with the TEE takes place.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/bd132aa94a074ed9.png)

The function logs the UUID of the Trusted Application to be opened in detail. It then attempts to load the TA image from the file system through a **get_ta_file** call. If the image cannot be found, the warning *“Unable to load TA img from FS, errno:%d. Not an error, continue…\\n”* is issued. However, the process is not terminated; the function continues attempting to open the session.

**TEEC_InvokeCommand**

According to the TEE Client API Specification:

This function sends a specific command to a Trusted Application (TA) through a previously opened session. If successful, the TA executes the command and returns the result to the client.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/d2c995c768477f04.png)

**session** → A previously opened session (obtained via **OpenSession**). It indicates which TA the communication will take place with.

**commandID** → The identifier of the command to be executed. It specifies which function inside the TA will be invoked.

**operation** → The data accompanying the command. It carries input/output values or memory references. If set to **NULL**, only the command ID is sent and no data is transferred.

**returnOrigin** → Indicates the source of an error if one occurs (API, communication layer, TEE, or TA).

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/39ff73fd4945cf6c.png)

The most critical part of the TEEC_InvokeCommand function is here. The command from the client is transferred to the Secure World through this call. It is then processed by the TEE, and the response is subsequently verified using validate_transaction.

The TEE Client API consists of three main steps:  
**TEEC_InitializeContext** → Establishes the basic communication channel between the client application and the TEE.

**TEEC_OpenSession** → Initiates a secure session with a specific Trusted Application.

**TEEC_InvokeCommand** → Transfers commands to the TEE through this session, processes them, and returns the results.

This flow allows user applications on Android devices to delegate trusted operations to the TEE. In this way, critical operations such as key management, authentication, and encryption are protected within an isolated environment.

**Services on the REE Side Using libteecl.so**

A /proc/\*/maps scan was performed on the device to identify which REE processes have the libteecl.so library loaded into their address space. This output indicates which services have the potential to communicate directly with the TEE.

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/405b6b8c4a1c53b9.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/10/3bbc1082fbb233d5.png)

## REE 侧服务调用方

The services shown in this table are system components that perform various security functions on the device through the TEE. Critical security operations such as biometric authentication (fingerprint and facial recognition), screen lock control (gatekeeper), encryption key management (keymint, keymaster), DRM and content protection (Widevine, HDCP), and hardware-based device identity keys (DRK) are delegated to the TEE via these services. In this way, sensitive operations are executed in the secure environment rather than in the REE (the normal Android environment).

[Android – Trusted Execution Environment](https://blog.byterialab.com/android-trusted-execution-environment/) yazısı ilk önce [Byteria - Mobile Application Security Blog](https://blog.byterialab.com/) üzerinde ortaya çıktı.
