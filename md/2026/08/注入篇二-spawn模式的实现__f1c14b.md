---
title: 注入篇二 spawn模式的实现
source: https://yuuki.cool/posts/injectso2/
source_host: yuuki.cool
clip_date: 2026-08-04T10:40:54+08:00
trace_id: 04fe7ee2-486f-433d-ad13-b6c39401f926
content_hash: 443c70e25b98e0179baf2a4e2a385dcd5581496bb8aedd8992fd9a34679c9a02
status: synced
tags:
  - Android逆向
  - Hook
series: null
feed_source: Yuuki·移动安全
ai_summary: spawn模式通过Hook zygote的fork与setArgV0函数，在目标进程启动时注入so，需借助UDS通信解除SELinux限制并及时清理Hook防止崩溃。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-8108-8980-d80b5f68018e
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> spawn模式通过Hook zygote的fork与setArgV0函数，在目标进程启动时注入so，需借助UDS通信解除SELinux限制并及时清理Hook防止崩溃。
> 
> - **注入时机陷阱：** 在fork后立即读取进程名会得到父进程名称，必须等目标进程调用`android_os_Process_setArgV0`后才能获取正确进程名，因此需二次Hook setArgV0作为触发点。
> - **通信与权限设计：** 由于目标App无法访问`/data/local/tmp`，注入模块无法直接dlopen so，需通过Unix Domain Socket通知Injector进程临时将SELinux设为宽容模式，加载后再恢复。
> - **注入流程：** 先将Hook模块注入zygote，Hook `libc.so`的`fork`函数，在子进程内Hook `libandroid_runtime.so`的`setArgV0`，匹配到目标进程名后dlopen目的so，并通过共享内存标志通知父进程解除fork Hook。
> - **痕迹清理要点：** 注入后须及时destroy fork与setArgV0的Hook，清除共享内存映射，否则目标App可能被反调试检测或崩溃；so残留痕迹可通过匿名内存覆盖maps入口、调用`solist_remove_soinfo`移除soinfo等方式隐藏，但无法完全消除内核视角的痕迹。

前言：在 [上一篇文章](https://yuuki.cool/2025/07/12/InjectSo/) 中大概解释了attach模式注入so的实现思路，但是实战中spawn模式注入也是很常用的

## 0x01 什么是spawn注入模式

我的理解是 在目标进程 **启动时** 对其进行注入。这可以帮助我们绕过部分反调试，同时可以监听一些初始化函数

## 0x02 大致的实现思路

spawn翻译过来是 `产卵` 的意思，刚接触frida的时候我不理解spawn这个单词和注入这个操作之间的联系，后来才知道这个操作是需要注入zygote的，而zygote翻译过来刚好是 `受精卵` 的意思，现在感觉还挺有意思的，spawn这个名字确实很恰当

我们想要在进程启动时就注入，那么时机很重要，这个时机当然越早越好...吗？我们知道app进程都是由zygote进程fork而来的，fork之后才会有app进程，这里差不多就是app进程刚出生的时候了，我们在这时，把自己的so注入就可以实现上述的效果了

## 0x03 开始实现

由于我们要hook zygote进程里的一些函数，所以首先要把hook模块注入进zygote进程，关于如何通过ptrace注入目标进程， [上一篇文章](https://yuuki.cool/2025/07/12/InjectSo/) 已经讲的比较清晰了，这里就不过多赘述了，这里先来讲讲hook模块应该实现哪些功能吧。这里的hook框架依旧是使用dobby

**首先要明确hook点**

上面说了，我们是hook fork函数，所以目标so是 `/system/lib64/libc.so` ，查找函数地址可以先dlopen libc.so，然后再dlsym fork函数，这里dlopen是为了拿到对应so的handle，正常进程里libc.so 99%是已经被加载过的，你再打开一次也无所谓，因为linker会直接返回solist里的handle给你，不会浪费很多时间。当然也可以使用elf_utils解析磁盘上的libc.so拿到偏移，然后查找基地址两个相加得到真实的地址

**其次编写hook函数**

```cpp
static std::string getCurrentProcessName() {
    char process_name[64] = {0};
    int fd = open("/proc/self/cmdline", O_RDONLY);
    if (fd != -1) {
        ssize_t len = read(fd, process_name, sizeof(process_name) - 1);
        if (len > 0) {
            process_name[len] = '\0';
        }
        close(fd);
    }
    return std::string(process_name);
}

static pid_t hooked_fork() {
    if (in_hook_fork) {
        return orig_fork();
    }

    LOGD("enter fork func!");

    pid_t result = orig_fork();

    if (result == 0) {
        LOGD("enter child process");
        std::string current_process = getCurrentProcessName();
        if (!current_process.empty()) {
            LOGD("Child process started: %s", current_process.c_str());
            //todo 然后判断进程名是否为目标进程，后续再dlopen自己的so
        }
    }

    return result;
}
```

我刚开始是这么写的，我觉得没啥毛病，但是一运行就有问题了，各位可以先思考一下为什么这样不行哈哈哈哈

运行时输出了如下日志：

```
07-09 10:52:08.046 19197 19197 I [Zygote_Hook]: enter child process
07-09 10:52:08.047 19197 19197 I [Zygote_Hook]: Child process started: zygote64
```

子进程的进程名依然是 `zygote64` ，为什么会这样呢？？？其实是因为获取进程名的时机太早了，这时子进程还没初始化完全，所以获取到的名字还是父进程的

为了解决这个问题，我们就得先研究一下android中app进程的进程名是如何被设置的，查阅了一番资料后得知 `android.os.Process.setArgv0` 函数负责设置进程名，它是一个native函数，长这样

```rust
void android_os_Process_setArgV0(JNIEnv* env, jobject clazz, jstring name)
{
    if (name == NULL) {
        jniThrowNullPointerException(env, NULL);
        return;
    }

    const jchar* str = env->GetStringCritical(name, 0);
    String8 name8;
    if (str) {
        name8 = String8(reinterpret_cast<const char16_t*>(str),
                        env->GetStringLength(name));
        env->ReleaseStringCritical(name, str);
    }

    if (!name8.empty()) {
        AndroidRuntime::getRuntime()->setArgv0(name8.c_str(), true /* setProcName */);
    }
}
```

它的第三个参数就是我们需要的进程名，所以我们可以在子进程中hook这个函数，当函数执行时取出参数，与我们的目标进程名作比较，如果一致，则加载我们自己的so。加载so使用dlopen就行了，但是dlopen只能从那几个路径加载，虽然本文不涉及注入痕迹的隐藏，但简单的能直接避免还是就避免一下吧。如果从app私有目录加载，那么app自己是有权限检查该路径下的文件的，不是很安全。如果从/system/lib下加载，那每次注入不同的so都需要重启手机重新挂载文件，这太麻烦了。所以还是从/data/local/tmp下加载吧，当然这个路径也不安全，但相对好一点。但如果选择这个路径，就会有新的问题。普通app进程是没办法访问这个目录的，所以dlopen肯定会失败。解决方案也比较简单，把selinux设置为宽容模式即可。那么新的问题又来了，hook代码是运行在app进程的，app进程没有权限设置selinux，这里只有Injector进程有这个权限，所以需要设计跨进程通信模块，用于在dlopen前后通知Injector模块修改selinux模式

**设计通信模块**

为了方便，本来想直接用信号的，因为这个通信场景本身也不复杂，但是后面写完才发现权限不够，于是又重写，这里直接用UDS。为了后续开发方便，就把模块单拎出来写了，另外两个模块共享通信模块

```cpp
#include "socket_comm.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <thread>
#include <android/log.h>
#include <sys/stat.h>
#include <errno.h>

#define LOG_TAG "[Socket_Comm]"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace comm {

    SocketServer::SocketServer() : server_fd_(-1), running_(false), background_thread_(nullptr) {
    }

    SocketServer::~SocketServer() {
        Stop();
    }

    bool SocketServer::Start() {
        if (server_fd_ != -1) {
            LOGE("Server already started");
            return false;
        }

        unlink(COMM_SOCKET_PATH);

        // 创建Unix Domain Socket
        server_fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
        if (server_fd_ < 0) {
            LOGE("Failed to create socket: %s", strerror(errno));
            return false;
        }

        struct sockaddr_un server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sun_family = AF_UNIX;
        strncpy(server_addr.sun_path, COMM_SOCKET_PATH, sizeof(server_addr.sun_path) - 1);

        if (bind(server_fd_, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            LOGE("Failed to bind socket: %s", strerror(errno));
            close(server_fd_);
            server_fd_ = -1;
            return false;
        }

        // 设置socket文件权限，允许所有用户访问
        chmod(COMM_SOCKET_PATH, 0666);

        if (listen(server_fd_, 1) < 0) {
            LOGE("Failed to listen on socket: %s", strerror(errno));
            close(server_fd_);
            server_fd_ = -1;
            unlink(COMM_SOCKET_PATH);
            return false;
        }

        running_ = true;
        LOGI("Unix Domain Socket server started at %s", COMM_SOCKET_PATH);
        return true;
    }

    void SocketServer::Stop() {
        running_ = false;

        if (server_fd_ != -1) {
            shutdown(server_fd_, SHUT_RDWR);
            close(server_fd_);
            server_fd_ = -1;
        }

        unlink(COMM_SOCKET_PATH);

        if (background_thread_) {
            if (background_thread_->joinable()) {
                background_thread_->join();
            }
            delete background_thread_;
            background_thread_ = nullptr;
        }

        LOGI("Socket server stopped");
    }

    std::string SocketServer::WaitForMessage(int timeout_ms) {
        if (server_fd_ == -1) {
            LOGE("Server not started");
            return "";
        }

        fd_set readfds;
        FD_ZERO(&readfds);
        FD_SET(server_fd_, &readfds);

        struct timeval* tv_ptr = nullptr;
        struct timeval tv;
        if (timeout_ms >= 0) {
            tv.tv_sec = timeout_ms / 1000;
            tv.tv_usec = (timeout_ms % 1000) * 1000;
            tv_ptr = &tv;
        }

        int ret = select(server_fd_ + 1, &readfds, nullptr, nullptr, tv_ptr);
        if (ret <= 0) {
            if (ret < 0 && errno != EINTR) {
                LOGE("select error: %s", strerror(errno));
            }
            return "";
        }

        struct sockaddr_un client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd_, (struct sockaddr*)&client_addr, &client_len);
        if (client_fd < 0) {
            if (errno != EINTR && errno != EAGAIN) {
                LOGE("Failed to accept connection: %s", strerror(errno));
            }
            return "";
        }

        char buffer[256] = {0};
        ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
        close(client_fd);

        if (bytes_read > 0) {
            buffer[bytes_read] = '\0';
            LOGI("Received message: %s", buffer);
            return std::string(buffer);
        }

        return "";
    }

    void SocketServer::RunInBackground(std::function<void(const std::string&)> callback) {
        if (background_thread_) {
            LOGE("Background thread already running");
            return;
        }

        background_thread_ = new std::thread(&SocketServer::AcceptLoop, this, callback);
    }

    void SocketServer::AcceptLoop(std::function<void(const std::string&)> callback) {
        LOGI("Background accept loop started");

        while (running_) {
            std::string msg = WaitForMessage(1000);
            if (!msg.empty() && callback) {
                callback(msg);
            }
        }

        LOGI("Background accept loop ended");
    }

    bool SocketClient::SendMessage(const std::string& message) {
        int client_fd = socket(AF_UNIX, SOCK_STREAM, 0);
        if (client_fd < 0) {
            LOGE("Failed to create client socket: %s", strerror(errno));
            return false;
        }

        struct sockaddr_un server_addr;
        memset(&server_addr, 0, sizeof(server_addr));
        server_addr.sun_family = AF_UNIX;
        strncpy(server_addr.sun_path, COMM_SOCKET_PATH, sizeof(server_addr.sun_path) - 1);

        if (connect(client_fd, (struct sockaddr*)&server_addr, sizeof(server_addr)) < 0) {
            LOGE("Failed to connect to server: %s (path: %s)", strerror(errno), COMM_SOCKET_PATH);
            close(client_fd);
            return false;
        }

        ssize_t bytes_sent = send(client_fd, message.c_str(), message.length(), 0);
        close(client_fd);

        if (bytes_sent < 0) {
            LOGE("Failed to send message: %s", strerror(errno));
            return false;
        }

        LOGI("Message sent: %s", message.c_str());
        return true;
    }

}
```

这样就解决权限的问题了:) 是不是就可以加载so了呢，直接dlopen(SO_PATH, FLAG)，那么 `SO_PATH` 从哪来？当然完善上面的跨进程通信模块，也能把path传过来，但是有点麻烦了，这里我的解决方案是在hook模块里导出一个函数用于被Injector模块远程调用，参数里传递一些必要的信息，比如 `SO_PATH`

```cpp
// 全局变量存储目标信息
static char g_target_process_name[256] = {0};
static char g_target_library_path[512] = {0};

extern "C" void setTargetInfo(char* target_process_name, char* target_library_path) {
    strcpy(g_target_process_name, target_process_name);
    strcpy(g_target_library_path, target_library_path);
    LOGI("Target process name: %s", g_target_process_name);
    LOGI("Target library path: %s", g_target_library_path);
}
```

**总的代码就是这样子的**

```cpp
#include <sys/mman.h>
#include <dlfcn.h>
#include <sys/types.h>
#include <string>
#include <jni.h>
#include "utils.h"
#include "../ipc/socket_comm.h"

#define LIBC "/system/lib64/libc.so"
#define LIBANDROID_RUNTIME "/system/lib64/libandroid_runtime.so"

// 全局变量存储目标信息
static char g_target_process_name[256] = {0};
static char g_target_library_path[512] = {0};

typedef pid_t (*Fork_t)();
static Fork_t orig_fork = nullptr;
void* fork_addr = nullptr;

typedef void (*SetArgV0_t)(JNIEnv*, jobject, jstring);
static SetArgV0_t orig_setArgV0 = nullptr;
void* setArgV0_addr = nullptr;

static volatile int* inject_flag = nullptr;
static pid_t g_zygote_pid = 0;

static bool g_injection_done = false;

void unhook() {
    if(fork_addr) 
        DobbyDestroy(fork_addr);
    
    if(setArgV0_addr) 
        DobbyDestroy(setArgV0_addr);

    LOGI("All hooks removed");
}

extern "C" void cleanup_hooks() {
    unhook();

    if (inject_flag && inject_flag != MAP_FAILED) {
        LOGI("Cleaning up shared memory");
        munmap((void*)inject_flag, sizeof(int));
        inject_flag = nullptr;
    }

    memset(g_target_process_name, 0, sizeof(g_target_process_name));
    memset(g_target_library_path, 0, sizeof(g_target_library_path));
    g_injection_done = false;

    LOGI("cleanup_hooks completed");
}

static void hook_setArgV0(JNIEnv* env, jobject clazz, jstring name) {
    std::string process_name;
    if (name && env) {
        const char* name_utf = env->GetStringUTFChars(name, nullptr);
        if (name_utf) {
            process_name = name_utf;
            env->ReleaseStringUTFChars(name, name_utf);
            LOGD("Process name: %s", process_name.c_str());
        }
    }

    if (!process_name.empty() && process_name == g_target_process_name && !g_injection_done) {
        // 标记已完成，避免重复注入
        g_injection_done = true;

        // 在子进程中 unhook
        if(setArgV0_addr) {
            DobbyDestroy(setArgV0_addr);
            setArgV0_addr = nullptr;
        }

        LOGI("Target process detected: %s, injecting library: %s",
             process_name.c_str(), g_target_library_path);

        void* handle = dlopen(g_target_library_path, RTLD_NOW | RTLD_NODELETE | RTLD_GLOBAL);

        bool inject_success = (handle != nullptr);
        if (inject_success) {
            LOGI("Successfully loaded library: %s", g_target_library_path);
            comm::SocketClient::NotifySuccess();
        } else {
            LOGE("Failed to load library: %s, error: %s",
                 g_target_library_path, dlerror());
            comm::SocketClient::NotifyFailed();
        }

        if (inject_flag && inject_flag != MAP_FAILED) {
            *inject_flag = 1;
            LOGI("Set inject_flag to 1 in shared memory");
        }
    }

    if (orig_setArgV0) {
        orig_setArgV0(env, clazz, name);
    }
}

static void setup_setArgV0_hook() {
    void* handle = dlopen(LIBANDROID_RUNTIME, RTLD_NOW);
    if (!handle) {
        LOGE("Failed to open libandroid_runtime.so: %s", dlerror());
        return;
    }

    const char* symbol = "_Z27android_os_Process_setArgV0P7_JNIEnvP8_jobjectP8_jstring";
    setArgV0_addr = dlsym(handle, symbol);
    if (!setArgV0_addr) {
        LOGE("Failed to find %s: %s", symbol, dlerror());
        return;
    }

    LOGI("Found %s at %p", symbol, setArgV0_addr);

    orig_setArgV0 = (SetArgV0_t)InlineHook(setArgV0_addr, (void*)hook_setArgV0);
    if (orig_setArgV0) {
        LOGI("Successfully hooked %s", symbol);
    } else {
        LOGE("Failed to hook %s", symbol);
    }
}

static pid_t hook_fork() {
    LOGD("enter fork func!");

    pid_t result = orig_fork();

    if (result == 0) {
        LOGD("enter child process");
        setup_setArgV0_hook();
    } else if (result > 0) {
        if (getpid() == g_zygote_pid && inject_flag && inject_flag != MAP_FAILED && *inject_flag == 1) {
            LOGI("Injection completed in child process, unhooking fork in parent");
            if (fork_addr) {
                DobbyDestroy(fork_addr);
                fork_addr = nullptr;
            }

            munmap((void*)inject_flag, sizeof(int));
            inject_flag = nullptr;
        }
    }

    return result;
}

void setup_fork_hook() {
    void* handle = dlopen(LIBC, RTLD_NOW);
    if (!handle) {
        LOGE("Failed to open libc.so");
        return;
    }

    const char* fork_symbol = "fork";
    fork_addr = dlsym(handle, fork_symbol);
    if (!fork_addr) {
        LOGE("Failed to find fork");
        return;
    }

    LOGI("Found fork at %p", fork_addr);

    orig_fork = (Fork_t)InlineHook(fork_addr, (void*)hook_fork);
    if (orig_fork) {
        LOGI("Successfully hooked fork");
    } else {
        LOGE("Failed to hook fork");
    }
}

extern "C" void setTargetInfo(char* target_process_name, char* target_library_path) {
    strcpy(g_target_process_name, target_process_name);
    strcpy(g_target_library_path, target_library_path);
    LOGI("Target process name: %s", g_target_process_name);
    LOGI("Target library path: %s", g_target_library_path);

    g_injection_done = false;

    if (inject_flag && inject_flag != MAP_FAILED) {
        *inject_flag = 0;
        LOGI("Reset inject_flag to 0");
    }

    if (fork_addr == nullptr && orig_fork == nullptr) {
        LOGI("Re-hooking fork for new injection");
        setup_fork_hook();
    }
}

__attribute__((constructor))
void initialize_hook() {
    LOGI("Zygote hook module loaded");

    g_zygote_pid = getpid();

    inject_flag = (volatile int*)mmap(NULL, sizeof(int),
                                      PROT_READ | PROT_WRITE,
                                      MAP_SHARED | MAP_ANONYMOUS, -1, 0);
    if (inject_flag != MAP_FAILED) {
        *inject_flag = 0;
        LOGI("Created shared memory for inject_flag");
    } else {
        LOGE("Failed to create shared memory");
        inject_flag = nullptr;
    }

    setup_fork_hook();
}

__attribute__((destructor))
void cleanup_hook() {
    LOGD("Cleaning up hooks in destructor");
    cleanup_hooks();
}
```

自己写时记得及时unhook，不然有的软件会进不去

## 0x04 小结

在学校时，用完frida之后去食堂吃饭，付钱的软件老是打不开，当时不明白为什么我明明调试的是别的app，这个app凭什么打不开，其实是用完之后zygote进程里的一些函数没有被unhook，app启动会fork zygote进程，所以就被检测到了:(

再来聊聊检测和过检测吧，就说我写的这个工具吧，如果不开源，可能就是maps里有可疑路径的so，soinfo list里也会有， `/proc/self/fd/` 中的文件描述符，还有就是通信时的痕迹，别的地方感觉也没啥了(注入留下的痕迹，hook的不归我管)。前面两个，目前用户层有的解决方案就是：

-   遍历 `/proc/<pid>/maps` ，找到目标库的所有内存段
-   对每个段，远程分配匿名内存、远程 memcpy 覆盖内容、调用 `mremap` 将匿名内存映射到原来的地址
-   最后还原原有的内存保护权限

但这样还是解决不了问题的，因为正常app基本没用可执行的匿名内存段，但是一些加固之后的似乎有，我之前看36O是有的

solist里的痕迹就是通过找到 [solist_remove_soinfo](https://cs.android.com/android/platform/superproject/main/+/main:bionic/linker/linker_main.cpp;l=99?q=solist_remove_soinfo) 函数的地址，然后调用它，移除目标so的soinfo，当然这里还涉及获取目标so的soinfo，遍历solist等操作，不赘述了

使用 [自定义linker](https://github.com/SoyBeanMilkx/soLoader) 的方案可以在so的路径上多一些选择，而且不会在solist留下痕迹，但也并非一点痕迹没有的:( 所以还是配合 [内核模块](https://github.com/SoyBeanMilkx/feature) 一起用吧
