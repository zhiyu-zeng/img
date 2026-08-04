---
title: Linker加载so流程
source: https://yuuki.cool/posts/rereadlinker/
source_host: yuuki.cool
clip_date: 2026-08-04T10:38:52+08:00
trace_id: a547a535-a61e-41a4-a369-6e381dd4d2bc
content_hash: 3a015b21c2d8bce8ce6fac0c74aef4169faae044b0dd1391bf5893b64ac2fea5
status: synced
tags:
  - Android逆向
  - 脱壳与加固
series: null
feed_source: Yuuki·移动安全
ai_summary: Android 动态链接器加载 SO 的核心流程可概括为查找、解析 ELF 并映射内存、执行重定位三步。
ai_summary_style: key-points
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 3b275244-d011-81e9-a994-fb0602a2944c
ioc: null
---

> 💡 **AI 总结（key-points）**
>
> Android 动态链接器加载 SO 的核心流程可概括为查找、解析 ELF 并映射内存、执行重定位三步。
> 
> - **加载入口：** Java 层 `System.load` 经 JNI 最终调用 `do_dlopen`，该函数负责验证参数并确定命名空间。
> - **依赖发现与元数据准备：** `find_library` → `find_libraries` 递归调用 `find_library_internal` 与 `load_library`，通过解析 ELF 动态段（DT_NEEDED）构建依赖图，并为每个 SO 分配 `soinfo` 结构体，同时处理命名空间权限检查。
> - **内存映射与解析：** `find_libraries` 的 Step 2 执行加载映射，实际由 `ElfReader::MapSegment` 通过 `mmap` 将 ELF 段映射到进程地址空间；随后 `prelink_image` 解析动态段中的各类信息（如哈希表、重定位表、构造函数指针等），标记 TLS 内存段并完成版本定义校验。
> - **重定位与初始化：** `prelink_image` 后 `find_libraries` 继续执行重定位（文中未展开），加载完成后由 `do_dlopen` 调用 `call_constructors` 执行 `.init_array` 等初始化函数，最终返回句柄。

## 0x01前言：

之前对linker的了解都是基于别人的文章，自己从来没有自己去跟过。刚好最近想自己实现一个针对自定义linker的so加固的脱壳机，而且之前的知识也忘记的差不多了。故打算自己跟一跟代码，详细读一读，从中学习到一些有用的知识和了解到一些鲜为人知的细节。

本文会先从java层开始分析，层层递进，按调用栈的顺序分析。

本文源码基于 [android14](https://cs.android.com/android/platform/superproject)

## 0x02核心函数：

我们在写native-app的时候肯定会加载so，当然有很多加载方式，比如从自定义路径加载，本文不讨论那些，只挑选最典型的加载方式。

我们通常会使用 `System.load(${soname})` 来加载so

```typescript
public static void load(String filename) {
        Runtime.getRuntime().load0(Reflection.getCallerClass(), filename);
    }
```

很好理解，中转参数，继续看看 `load0` 函数

```javascript
synchronized void load0(Class<?> fromClass, String filename) {
        File file = new File(filename);
        if (!(file.isAbsolute())) {
            throw new UnsatisfiedLinkError(
                "Expecting an absolute path of the library: " + filename);
        }
        if (filename == null) {
            throw new NullPointerException("filename == null");
        }
        if (Flags.readOnlyDynamicCodeLoad()) {
            if (!file.toPath().getFileSystem().isReadOnly() && file.canWrite()) {
                if (VMRuntime.getSdkVersion() >= VersionCodes.VANILLA_ICE_CREAM) {
                    System.logW("Attempt to load writable file: " + filename
                            + ". This will throw on a future Android version");
                }
            }
        }
        // 就这一句有用，其他可以暂时不看
        String error = nativeLoad(filename, fromClass.getClassLoader(), fromClass);
        if (error != null) {
            throw new UnsatisfiedLinkError(error);
        }
    }
```

可以看到逻辑还是很清晰的，调用了 `nativeLoad` ，继续跟进

```typescript
// This method is used through reflection from /art/test/150-loadlibrary.
    private static String nativeLoad(String filename, ClassLoader loader) {
        return nativeLoad(filename, loader, null);
    }

    private static native String nativeLoad(String filename, ClassLoader loader, Class<?> caller);
```

可以看到进到native层了，我们跟进看看

```kotlin
JNIEXPORT jstring JNICALL
Runtime_nativeLoad(JNIEnv* env, jclass ignored, jstring javaFilename,
                   jobject javaLoader, jclass caller)
{
    return JVM_NativeLoad(env, javaFilename, javaLoader, caller);
}
```

又是中转，跟进 `JVM_NativeLoad`

```rust
JNIEXPORT jstring JVM_NativeLoad(JNIEnv* env,
                                 jstring javaFilename,
                                 jobject javaLoader,
                                 jclass caller) {
  ScopedUtfChars filename(env, javaFilename);
  if (filename.c_str() == nullptr) {
    return nullptr;
  }

  std::string error_msg;
  {
    art::JavaVMExt* vm = art::Runtime::Current()->GetJavaVM();
    bool success = vm->LoadNativeLibrary(env,
                                         filename.c_str(),
                                         javaLoader,
                                         caller,
                                         &error_msg);
    if (success) {
      return nullptr;
    }
  }

  // Don't let a pending exception from JNI_OnLoad cause a CheckJNI issue with NewStringUTF.
  env->ExceptionClear();
  return env->NewStringUTF(error_msg.c_str());
}
```

依旧中转，跟进 `vm->LoadNativeLibrary`

```rust
bool JavaVMExt::LoadNativeLibrary(JNIEnv* env,
                                  const std::string& path,
                                  jobject class_loader,
                                  jclass caller_class,
                                  std::string* error_msg) {
  error_msg->clear();

  // See if we've already loaded this library.  If we have, and the class loader
  // matches, return successfully without doing anything.
  // TODO: for better results we should canonicalize the pathname (or even compare
  // inodes). This implementation is fine if everybody is using System.loadLibrary.
  SharedLibrary* library;
  Thread* self = Thread::Current();
  {
    // TODO: move the locking (and more of this logic) into Libraries.
    MutexLock mu(self, *Locks::jni_libraries_lock_);
    library = libraries_->Get(path);
  }
  void* class_loader_allocator = nullptr;
  std::string caller_location;
  {
    ScopedObjectAccess soa(env);
    // As the incoming class loader is reachable/alive during the call of this function,
    // it's okay to decode it without worrying about unexpectedly marking it alive.
    ObjPtr<mirror::ClassLoader> loader = soa.Decode<mirror::ClassLoader>(class_loader);

    ClassLinker* class_linker = Runtime::Current()->GetClassLinker();
    if (class_linker->IsBootClassLoader(loader)) {
      loader = nullptr;
      class_loader = nullptr;
    }
    if (caller_class != nullptr) {
      ObjPtr<mirror::Class> caller = soa.Decode<mirror::Class>(caller_class);
      ObjPtr<mirror::DexCache> dex_cache = caller->GetDexCache();
      if (dex_cache != nullptr) {
        caller_location = dex_cache->GetLocation()->ToModifiedUtf8();
      }
    }

    class_loader_allocator = class_linker->GetAllocatorForClassLoader(loader);
    CHECK(class_loader_allocator != nullptr);
  }
  if (library != nullptr) {
    // Use the allocator pointers for class loader equality to avoid unnecessary weak root decode.
    if (library->GetClassLoaderAllocator() != class_loader_allocator) {
      // The library will be associated with class_loader. The JNI
      // spec says we can't load the same library into more than one
      // class loader.
      //
      // This isn't very common. So spend some time to get a readable message.
      auto call_to_string = [&](jobject obj) -> std::string {
        if (obj == nullptr) {
          return "null";
        }
        // Handle jweaks. Ignore double local-ref.
        ScopedLocalRef<jobject> local_ref(env, env->NewLocalRef(obj));
        if (local_ref != nullptr) {
          ScopedLocalRef<jclass> local_class(env, env->GetObjectClass(local_ref.get()));
          jmethodID to_string = env->GetMethodID(local_class.get(),
                                                 "toString",
                                                 "()Ljava/lang/String;");
          DCHECK(to_string != nullptr);
          ScopedLocalRef<jobject> local_string(env,
                                               env->CallObjectMethod(local_ref.get(), to_string));
          if (local_string != nullptr) {
            ScopedUtfChars utf(env, reinterpret_cast<jstring>(local_string.get()));
            if (utf.c_str() != nullptr) {
              return utf.c_str();
            }
          }
          if (env->ExceptionCheck()) {
            // We can't do much better logging, really. So leave it with a Describe.
            env->ExceptionDescribe();
            env->ExceptionClear();
          }
          return "(Error calling toString)";
        }
        return "null";
      };
      std::string old_class_loader = call_to_string(library->GetClassLoader());
      std::string new_class_loader = call_to_string(class_loader);
      StringAppendF(error_msg, "Shared library \"%s\" already opened by "
          "ClassLoader %p(%s); can't open in ClassLoader %p(%s)",
          path.c_str(),
          library->GetClassLoader(),
          old_class_loader.c_str(),
          class_loader,
          new_class_loader.c_str());
      LOG(WARNING) << *error_msg;
      return false;
    }
    VLOG(jni) << "[Shared library \"" << path << "\" already loaded in "
              << " ClassLoader " << class_loader << "]";
    if (!library->CheckOnLoadResult()) {
      StringAppendF(error_msg, "JNI_OnLoad failed on a previous attempt "
          "to load \"%s\"", path.c_str());
      return false;
    }
    return true;
  }

  // Open the shared library.  Because we're using a full path, the system
  // doesn't have to search through LD_LIBRARY_PATH.  (It may do so to
  // resolve this library's dependencies though.)

  // Failures here are expected when java.library.path has several entries
  // and we have to hunt for the lib.

  // Below we dlopen but there is no paired dlclose, this would be necessary if we supported
  // class unloading. Libraries will only be unloaded when the reference count (incremented by
  // dlopen) becomes zero from dlclose.

  // Retrieve the library path from the classloader, if necessary.
  ScopedLocalRef<jstring> library_path(env, GetLibrarySearchPath(env, class_loader));

  Locks::mutator_lock_->AssertNotHeld(self);
  const char* path_str = path.empty() ? nullptr : path.c_str();
  bool needs_native_bridge = false;
  char* nativeloader_error_msg = nullptr;
  void* handle = android::OpenNativeLibrary(
      env,
      runtime_->GetTargetSdkVersion(),
      path_str,
      class_loader,
      (caller_location.empty() ? nullptr : caller_location.c_str()),
      library_path.get(),
      &needs_native_bridge,
      &nativeloader_error_msg);
  VLOG(jni) << "[Call to dlopen(\"" << path << "\", RTLD_NOW) returned " << handle << "]";

  if (handle == nullptr) {
    *error_msg = nativeloader_error_msg;
    android::NativeLoaderFreeErrorMessage(nativeloader_error_msg);
    VLOG(jni) << "dlopen(\"" << path << "\", RTLD_NOW) failed: " << *error_msg;
    return false;
  }

  if (env->ExceptionCheck() == JNI_TRUE) {
    LOG(ERROR) << "Unexpected exception:";
    env->ExceptionDescribe();
    env->ExceptionClear();
  }
  // Create a new entry.
  // TODO: move the locking (and more of this logic) into Libraries.
  bool created_library = false;
  {
    // Create SharedLibrary ahead of taking the libraries lock to maintain lock ordering.
    std::unique_ptr<SharedLibrary> new_library(
        new SharedLibrary(env,
                          self,
                          path,
                          handle,
                          needs_native_bridge,
                          class_loader,
                          class_loader_allocator));

    MutexLock mu(self, *Locks::jni_libraries_lock_);
    library = libraries_->Get(path);
    if (library == nullptr) {  // We won race to get libraries_lock.
      library = new_library.release();
      libraries_->Put(path, library);
      created_library = true;
    }
  }
  if (!created_library) {
    LOG(INFO) << "WOW: we lost a race to add shared library: "
        << "\"" << path << "\" ClassLoader=" << class_loader;
    return library->CheckOnLoadResult();
  }
  VLOG(jni) << "[Added shared library \"" << path << "\" for ClassLoader " << class_loader << "]";

  bool was_successful = false;
  void* sym = library->FindSymbol("JNI_OnLoad", nullptr, android::kJNICallTypeRegular);
  if (sym == nullptr) {
    VLOG(jni) << "[No JNI_OnLoad found in \"" << path << "\"]";
    was_successful = true;
  } else {
    // Call JNI_OnLoad.  We have to override the current class
    // loader, which will always be "null" since the stuff at the
    // top of the stack is around Runtime.loadLibrary().  (See
    // the comments in the JNI FindClass function.)
    ScopedLocalRef<jobject> old_class_loader(env, env->NewLocalRef(self->GetClassLoaderOverride()));
    self->SetClassLoaderOverride(class_loader);

    VLOG(jni) << "[Calling JNI_OnLoad in \"" << path << "\"]";
    using JNI_OnLoadFn = int(*)(JavaVM*, void*);
    JNI_OnLoadFn jni_on_load = reinterpret_cast<JNI_OnLoadFn>(sym);
    int version = (*jni_on_load)(this, nullptr);

    if (IsSdkVersionSetAndAtMost(runtime_->GetTargetSdkVersion(), SdkVersion::kL)) {
      // Make sure that sigchain owns SIGSEGV.
      EnsureFrontOfChain(SIGSEGV);
    }

    self->SetClassLoaderOverride(old_class_loader.get());

    if (version == JNI_ERR) {
      StringAppendF(error_msg, "JNI_ERR returned from JNI_OnLoad in \"%s\"", path.c_str());
    } else if (JavaVMExt::IsBadJniVersion(version)) {
      StringAppendF(error_msg, "Bad JNI version returned from JNI_OnLoad in \"%s\": %d",
                    path.c_str(), version);
      // It's unwise to call dlclose() here, but we can mark it
      // as bad and ensure that future load attempts will fail.
      // We don't know how far JNI_OnLoad got, so there could
      // be some partially-initialized stuff accessible through
      // newly-registered native method calls.  We could try to
      // unregister them, but that doesn't seem worthwhile.
    } else {
      was_successful = true;
    }
    VLOG(jni) << "[Returned " << (was_successful ? "successfully" : "failure")
              << " from JNI_OnLoad in \"" << path << "\"]";
  }

  library->SetResult(was_successful);
  return was_successful;
}
```

这段代码还挺长的。官方给的注释还是挺不错的。

一句话总结下来，这个函数检查指定路径的so是否已加载并与调用者的classloader匹配，若已加载则直接返回；否则，通过 `android::OpenNativeLibrary` 打开对应so，创建 `SharedLibrary` 对象记录信息，并调用库中的 `JNI_OnLoad` 函数进行初始化。

那么按照我们只关注加载流程的宗旨，我们只需跟进 `OpenNativeLibrary` 函数即可

```cpp
void* OpenNativeLibrary(JNIEnv* env,
                        int32_t target_sdk_version,
                        const char* path,
                        jobject class_loader,
                        const char* caller_location,
                        jstring library_path_j,
                        bool* needs_native_bridge,
                        char** error_msg) {
#if defined(ART_TARGET_ANDROID)
  if (class_loader == nullptr) {
    // class_loader is null only for the boot class loader (see
    // IsBootClassLoader call in JavaVMExt::LoadNativeLibrary), i.e. the caller
    // is in the boot classpath.
    *needs_native_bridge = false;
    if (caller_location != nullptr) {
      std::optional<NativeLoaderNamespace> ns = FindApexNamespace(caller_location);
      if (ns.has_value()) {
        const android_dlextinfo dlextinfo = {
            .flags = ANDROID_DLEXT_USE_NAMESPACE,
            .library_namespace = ns.value().ToRawAndroidNamespace(),
        };
        void* handle = android_dlopen_ext(path, RTLD_NOW, &dlextinfo);
        char* dlerror_msg = handle == nullptr ? strdup(dlerror()) : nullptr;
        ALOGD("Load %s using APEX ns %s for caller %s: %s",
              path,
              ns.value().name().c_str(),
              caller_location,
              dlerror_msg == nullptr ? "ok" : dlerror_msg);
        if (dlerror_msg != nullptr) {
          *error_msg = dlerror_msg;
        }
        return handle;
      }
    }

    // Check if the library is in NATIVELOADER_DEFAULT_NAMESPACE_LIBS and should
    // be loaded from the kNativeloaderExtraLibs namespace.
    {
      Result<void*> handle = TryLoadNativeloaderExtraLib(path);
      if (!handle.ok()) {
        *error_msg = strdup(handle.error().message().c_str());
        return nullptr;
      }
      if (handle.value() != nullptr) {
        return handle.value();
      }
    }

    // Handle issue b/349878424.
    static bool bypass_loading_for_b349878424 = ShouldBypassLoadingForB349878424();

    if (bypass_loading_for_b349878424 &&
        (strcmp("libsobridge.so", path) == 0 || strcmp("libwalkstack.so", path) == 0)) {
      // Load a different library to pretend the loading was successful. This
      // allows the device to boot.
      ALOGD("Loading libbase.so instead of %s due to b/349878424", path);
      path = "libbase.so";
    }

    // Fall back to the system namespace. This happens for preloaded JNI
    // libraries in the zygote.
    void* handle = OpenSystemLibrary(path, RTLD_NOW);
    char* dlerror_msg = handle == nullptr ? strdup(dlerror()) : nullptr;
    ALOGD("Load %s using system ns (caller=%s): %s",
          path,
          caller_location == nullptr ? "<unknown>" : caller_location,
          dlerror_msg == nullptr ? "ok" : dlerror_msg);
    if (dlerror_msg != nullptr) {
      *error_msg = dlerror_msg;
    }
    return handle;
  }

  // If the caller is in any of the system image partitions and the library is
  // in the same partition then load it without regards to public library
  // restrictions. This is only done if the library is specified by an absolute
  // path, so we don't affect the lookup process for libraries specified by name
  // only.
  if (caller_location != nullptr &&
      // Apps in the partition may have their own native libraries which should
      // be loaded with the app's classloader namespace, so only do this for
      // libraries in the partition-wide lib(64) directories.
      nativeloader::IsPartitionNativeLibPath(path) &&
      // Don't do this if the system image is older than V, to avoid any compat
      // issues with apps and shared libs in them.
      android::modules::sdklevel::IsAtLeastV()) {
    nativeloader::ApiDomain caller_api_domain = nativeloader::GetApiDomainFromPath(caller_location);
    if (caller_api_domain != nativeloader::API_DOMAIN_DEFAULT) {
      nativeloader::ApiDomain library_api_domain = nativeloader::GetApiDomainFromPath(path);

      if (library_api_domain == caller_api_domain) {
        bool is_bridged = false;
        if (library_path_j != nullptr) {
          ScopedUtfChars library_path_utf_chars(env, library_path_j);
          if (library_path_utf_chars[0] != '\0') {
            is_bridged = NativeBridgeIsPathSupported(library_path_utf_chars.c_str());
          }
        }

        Result<NativeLoaderNamespace> ns = GetNamespaceForApiDomain(caller_api_domain, is_bridged);
        if (!ns.ok()) {
          ALOGD("Failed to find ns for caller %s in API domain %d to load %s (is_bridged=%b): %s",
                caller_location,
                caller_api_domain,
                path,
                is_bridged,
                ns.error().message().c_str());
          *error_msg = strdup(ns.error().message().c_str());
          return nullptr;
        }

        *needs_native_bridge = ns.value().IsBridged();
        Result<void*> handle = ns.value().Load(path);
        ALOGD("Load %s using ns %s for caller %s in same partition (is_bridged=%b): %s",
              path,
              ns.value().name().c_str(),
              caller_location,
              is_bridged,
              handle.ok() ? "ok" : handle.error().message().c_str());
        if (!handle.ok()) {
          *error_msg = strdup(handle.error().message().c_str());
          return nullptr;
        }
        return handle.value();
      }
    }
  }

  NativeLoaderNamespace* ns;
  const char* ns_descr;
  {
    std::lock_guard<std::mutex> guard(g_namespaces_mutex);

    ns = g_namespaces->FindNamespaceByClassLoader(env, class_loader);
    ns_descr = "class loader";

    if (ns == nullptr) {
      // This is the case where the classloader was not created by ApplicationLoaders
      // In this case we create an isolated not-shared namespace for it.
      const std::string empty_dex_path;
      Result<NativeLoaderNamespace*> res =
          CreateClassLoaderNamespaceLocked(env,
                                           target_sdk_version,
                                           class_loader,
                                           nativeloader::API_DOMAIN_DEFAULT,
                                           /*is_shared=*/false,
                                           empty_dex_path,
                                           library_path_j,
                                           /*permitted_path_j=*/nullptr,
                                           /*uses_library_list_j=*/nullptr);
      if (!res.ok()) {
        ALOGD("Failed to create isolated ns for %s (caller=%s)",
              path,
              caller_location == nullptr ? "<unknown>" : caller_location);
        *error_msg = strdup(res.error().message().c_str());
        return nullptr;
      }
      ns = res.value();
      ns_descr = "isolated";
    }
  }

  *needs_native_bridge = ns->IsBridged();
  Result<void*> handle = ns->Load(path);
  ALOGD("Load %s using %s ns %s (caller=%s): %s",
        path,
        ns_descr,
        ns->name().c_str(),
        caller_location == nullptr ? "<unknown>" : caller_location,
        handle.ok() ? "ok" : handle.error().message().c_str());
  if (!handle.ok()) {
    *error_msg = strdup(handle.error().message().c_str());
    return nullptr;
  }
  return handle.value();

#else   // !ART_TARGET_ANDROID
  UNUSED(env, target_sdk_version, class_loader, caller_location);

  // Do some best effort to emulate library-path support. It will not
  // work for dependencies.
  //
  // Note: null has a special meaning and must be preserved.
  std::string library_path;  // Empty string by default.
  if (library_path_j != nullptr && path != nullptr && path[0] != '/') {
    ScopedUtfChars library_path_utf_chars(env, library_path_j);
    library_path = library_path_utf_chars.c_str();
  }

  std::vector<std::string> library_paths = base::Split(library_path, ":");

  for (const std::string& lib_path : library_paths) {
    *needs_native_bridge = false;
    const char* path_arg;
    std::string complete_path;
    if (path == nullptr) {
      // Preserve null.
      path_arg = nullptr;
    } else {
      complete_path = lib_path;
      if (!complete_path.empty()) {
        complete_path.append("/");
      }
      complete_path.append(path);
      path_arg = complete_path.c_str();
    }
    void* handle = dlopen(path_arg, RTLD_NOW);
    if (handle != nullptr) {
      return handle;
    }
    if (NativeBridgeIsSupported(path_arg)) {
      *needs_native_bridge = true;
      handle = NativeBridgeLoadLibrary(path_arg, RTLD_NOW);
      if (handle != nullptr) {
        return handle;
      }
      *error_msg = strdup(NativeBridgeGetError());
    } else {
      *error_msg = strdup(dlerror());
    }
  }
  return nullptr;
#endif  // !ART_TARGET_ANDROID
}
```

这段代码也挺长的，但其实很多部分对我们的分析不重要，这里调用的核心函数只有两个。 `android_dlopen_ext` 和 `OpenSystemLibrary` ，其中 `OpenSystemLibrary` 最终也会走到 `android_dlopen_ext` 或是 `dlopen` ，而 `android_dlopen_ext` 最终也会走到 `dlopen` ，所以这里我们直接跟进 `dlopen` 即可

```cpp
void* android_dlopen_ext(const char* filename, int flags, const android_dlextinfo* info) {
  return mock->mock_dlopen_ext(false, filename, flags, TO_MOCK_NAMESPACE(info->library_namespace));
}
```

又经过了几个无聊的中转函数，来到了 `do_dlopen`

```rust
void* do_dlopen(const char* name, int flags,
                const android_dlextinfo* extinfo,
                const void* caller_addr) {
  std::string trace_prefix = std::string("dlopen: ") + (name == nullptr ? "(nullptr)" : name);
  ScopedTrace trace(trace_prefix.c_str());
  ScopedTrace loading_trace((trace_prefix + " - loading and linking").c_str());
  soinfo* const caller = find_containing_library(caller_addr);
  android_namespace_t* ns = get_caller_namespace(caller);

  LD_LOG(kLogDlopen,
         "dlopen(name=\"%s\", flags=0x%x, extinfo=%s, caller=\"%s\", caller_ns=%s@%p, targetSdkVersion=%i) ...",
         name,
         flags,
         android_dlextinfo_to_string(extinfo).c_str(),
         caller == nullptr ? "(null)" : caller->get_realpath(),
         ns == nullptr ? "(null)" : ns->get_name(),
         ns,
         get_application_target_sdk_version());

  auto purge_guard = android::base::make_scope_guard([&]() { purge_unused_memory(); });

  auto failure_guard = android::base::make_scope_guard(
      [&]() { LD_LOG(kLogDlopen, "... dlopen failed: %s", linker_get_error_buffer()); });

  if ((flags & ~(RTLD_NOW|RTLD_LAZY|RTLD_LOCAL|RTLD_GLOBAL|RTLD_NODELETE|RTLD_NOLOAD)) != 0) {
    DL_OPEN_ERR("invalid flags to dlopen: %x", flags);
    return nullptr;
  }

  if (extinfo != nullptr) {
    if ((extinfo->flags & ~(ANDROID_DLEXT_VALID_FLAG_BITS)) != 0) {
      DL_OPEN_ERR("invalid extended flags to android_dlopen_ext: 0x%" PRIx64, extinfo->flags);
      return nullptr;
    }

    if ((extinfo->flags & ANDROID_DLEXT_USE_LIBRARY_FD) == 0 &&
        (extinfo->flags & ANDROID_DLEXT_USE_LIBRARY_FD_OFFSET) != 0) {
      DL_OPEN_ERR("invalid extended flag combination (ANDROID_DLEXT_USE_LIBRARY_FD_OFFSET without "
          "ANDROID_DLEXT_USE_LIBRARY_FD): 0x%" PRIx64, extinfo->flags);
      return nullptr;
    }

    if ((extinfo->flags & ANDROID_DLEXT_USE_NAMESPACE) != 0) {
      if (extinfo->library_namespace == nullptr) {
        DL_OPEN_ERR("ANDROID_DLEXT_USE_NAMESPACE is set but extinfo->library_namespace is null");
        return nullptr;
      }
      ns = extinfo->library_namespace;
    }
  }

  // Workaround for dlopen(/system/lib/<soname>) when .so is in /apex. http://b/121248172
  // The workaround works only when targetSdkVersion < Q.
  std::string name_to_apex;
  if (translateSystemPathToApexPath(name, &name_to_apex)) {
    const char* new_name = name_to_apex.c_str();
    LD_LOG(kLogDlopen, "dlopen considering translation from %s to APEX path %s",
           name,
           new_name);
    // Some APEXs could be optionally disabled. Only translate the path
    // when the old file is absent and the new file exists.
    // TODO(b/124218500): Re-enable it once app compat issue is resolved
    /*
    if (file_exists(name)) {
      LD_LOG(kLogDlopen, "dlopen %s exists, not translating", name);
    } else
    */
    if (!file_exists(new_name)) {
      LD_LOG(kLogDlopen, "dlopen %s does not exist, not translating",
             new_name);
    } else {
      LD_LOG(kLogDlopen, "dlopen translation accepted: using %s", new_name);
      name = new_name;
    }
  }
  // End Workaround for dlopen(/system/lib/<soname>) when .so is in /apex.

  std::string translated_name_holder;

  assert(!g_is_hwasan || !g_is_asan);
  const char* translated_name = name;
  if (g_is_asan && translated_name != nullptr && translated_name[0] == '/') {
    char original_path[PATH_MAX];
    if (realpath(name, original_path) != nullptr) {
      translated_name_holder = std::string(kAsanLibDirPrefix) + original_path;
      if (file_exists(translated_name_holder.c_str())) {
        soinfo* si = nullptr;
        if (find_loaded_library_by_realpath(ns, original_path, true, &si)) {
          DL_WARN("linker_asan dlopen NOT translating \"%s\" -> \"%s\": library already loaded", name,
                  translated_name_holder.c_str());
        } else {
          DL_WARN("linker_asan dlopen translating \"%s\" -> \"%s\"", name, translated_name);
          translated_name = translated_name_holder.c_str();
        }
      }
    }
  } else if (g_is_hwasan && translated_name != nullptr && translated_name[0] == '/') {
    char original_path[PATH_MAX];
    if (realpath(name, original_path) != nullptr) {
      // Keep this the same as CreateHwasanPath in system/linkerconfig/modules/namespace.cc.
      std::string path(original_path);
      auto slash = path.rfind('/');
      if (slash != std::string::npos || slash != path.size() - 1) {
        translated_name_holder = path.substr(0, slash) + "/hwasan" + path.substr(slash);
      }
      if (!translated_name_holder.empty() && file_exists(translated_name_holder.c_str())) {
        soinfo* si = nullptr;
        if (find_loaded_library_by_realpath(ns, original_path, true, &si)) {
          DL_WARN("linker_hwasan dlopen NOT translating \"%s\" -> \"%s\": library already loaded",
                  name, translated_name_holder.c_str());
        } else {
          DL_WARN("linker_hwasan dlopen translating \"%s\" -> \"%s\"", name, translated_name);
          translated_name = translated_name_holder.c_str();
        }
      }
    }
  }
  ProtectedDataGuard guard;
  soinfo* si = find_library(ns, translated_name, flags, extinfo, caller);
  loading_trace.End();

  if (si != nullptr) {
    void* handle = si->to_handle();
    LD_LOG(kLogDlopen,
           "... dlopen calling constructors: realpath=\"%s\", soname=\"%s\", handle=%p",
           si->get_realpath(), si->get_soname(), handle);
    si->call_constructors();
    failure_guard.Disable();
    LD_LOG(kLogDlopen,
           "... dlopen successful: realpath=\"%s\", soname=\"%s\", handle=%p",
           si->get_realpath(), si->get_soname(), handle);
    return handle;
  }

  return nullptr;
}
```

### 从这里开始算是进入正文了

我们来详细分析一下这个函数：

**参数**:

-   `const char* name`: 要加载的共享库路径或名称（如 "libmylib.so" 或绝对路径 /system/lib/libmylib.so）。可以为 nullptr（用于特殊情况，如检查命名空间）。
-   `int flags`: 加载标志，控制加载行为，常见值包括 `RTLD_NOW` （立即解析符号）、 `RTLD_LAZY` （延迟解析）、 `RTLD_LOCAL` （符号局部化）、 `RTLD_GLOBAL` （符号全局化）等。
-   `const android_dlextinfo* extinfo`: 扩展信息结构体，包含 Android 特有的加载选项（如命名空间、文件描述符加载等）。可以为 nullptr。
-   `const void* caller_add` r: 调用者的地址（通常是调用 dlopen 的函数的返回地址），用于确定调用者所在的共享库和命名空间。

**代码:**

直接跳过前面的这些内容，对我们来说

-   验证输入参数（库名、标志、扩展信息）。
-   确定加载的命名空间（基于调用者或扩展信息）。
-   处理特殊路径转换（如 APEX 或 ASan/HWASan 路径）。

```powershell
soinfo* si = find_library(ns, translated_name, flags, extinfo, caller);
  loading_trace.End();

  if (si != nullptr) {
    void* handle = si->to_handle();
    LD_LOG(kLogDlopen,
           "... dlopen calling constructors: realpath=\"%s\", soname=\"%s\", handle=%p",
           si->get_realpath(), si->get_soname(), handle);
    si->call_constructors();
    failure_guard.Disable();
    LD_LOG(kLogDlopen,
           "... dlopen successful: realpath=\"%s\", soname=\"%s\", handle=%p",
           si->get_realpath(), si->get_soname(), handle);
    return handle;
  }
```

这是此函数的核心部分，先通过 `find_library` 查找并加载so，返回目标so的 `soinfo` ，然后通过 `soinfo->call_constructor` 来初始化so，核心函数是 `find_library` ，我们跟进看看

```cpp
static soinfo* find_library(android_namespace_t* ns,
                            const char* name, int rtld_flags,
                            const android_dlextinfo* extinfo,
                            soinfo* needed_by) {
  soinfo* si = nullptr;

  if (name == nullptr) {
    si = solist_get_somain();
  } else if (!find_libraries(ns,
                             needed_by,
                             &name,
                             1,
                             &si,
                             nullptr,
                             0,
                             rtld_flags,
                             extinfo,
                             false /* add_as_children */)) {
    if (si != nullptr) {
      soinfo_unload(si);
    }
    return nullptr;
  }

  si->increment_ref_count();

  return si;
}
```

无需多言，来到 `find_librarys`

```rust
// add_as_children - add first-level loaded libraries (i.e. library_names[], but
// not their transitive dependencies) as children of the start_with library.
// This is false when find_libraries is called for dlopen(), when newly loaded
// libraries must form a disjoint tree.
bool find_libraries(android_namespace_t* ns,
                    soinfo* start_with,
                    const char* const library_names[],
                    size_t library_names_count,
                    soinfo* soinfos[],
                    std::vector<soinfo*>* ld_preloads,
                    size_t ld_preloads_count,
                    int rtld_flags,
                    const android_dlextinfo* extinfo,
                    bool add_as_children,
                    std::vector<android_namespace_t*>* namespaces) {
  // Step 0: prepare.
  std::unordered_map<const soinfo*, ElfReader> readers_map;
  LoadTaskList load_tasks;

  for (size_t i = 0; i < library_names_count; ++i) {
    const char* name = library_names[i];
    load_tasks.push_back(LoadTask::create(name, start_with, ns, &readers_map));
  }

  // If soinfos array is null allocate one on stack.
  // The array is needed in case of failure; for example
  // when library_names[] = {libone.so, libtwo.so} and libone.so
  // is loaded correctly but libtwo.so failed for some reason.
  // In this case libone.so should be unloaded on return.
  // See also implementation of failure_guard below.

  if (soinfos == nullptr) {
    size_t soinfos_size = sizeof(soinfo*)*library_names_count;
    soinfos = reinterpret_cast<soinfo**>(alloca(soinfos_size));
    memset(soinfos, 0, soinfos_size);
  }

  // list of libraries to link - see step 2.
  size_t soinfos_count = 0;

  auto scope_guard = android::base::make_scope_guard([&]() {
    for (LoadTask* t : load_tasks) {
      LoadTask::deleter(t);
    }
  });

  ZipArchiveCache zip_archive_cache;
  soinfo_list_t new_global_group_members;

  // Step 1: expand the list of load_tasks to include
  // all DT_NEEDED libraries (do not load them just yet)
  for (size_t i = 0; i<load_tasks.size(); ++i) {
    LoadTask* task = load_tasks[i];
    soinfo* needed_by = task->get_needed_by();

    bool is_dt_needed = needed_by != nullptr && (needed_by != start_with || add_as_children);
    task->set_extinfo(is_dt_needed ? nullptr : extinfo);
    task->set_dt_needed(is_dt_needed);

    // Note: start from the namespace that is stored in the LoadTask. This namespace
    // is different from the current namespace when the LoadTask is for a transitive
    // dependency and the lib that created the LoadTask is not found in the
    // current namespace but in one of the linked namespaces.
    android_namespace_t* start_ns = const_cast<android_namespace_t*>(task->get_start_from());

    LD_LOG(kLogDlopen, "find_library_internal(ns=%s@%p): task=%s, is_dt_needed=%d",
           start_ns->get_name(), start_ns, task->get_name(), is_dt_needed);

    if (!find_library_internal(start_ns, task, &zip_archive_cache, &load_tasks, rtld_flags)) {
      return false;
    }

    soinfo* si = task->get_soinfo();

    if (is_dt_needed) {
      needed_by->add_child(si);
    }

    // When ld_preloads is not null, the first
    // ld_preloads_count libs are in fact ld_preloads.
    bool is_ld_preload = false;
    if (ld_preloads != nullptr && soinfos_count < ld_preloads_count) {
      ld_preloads->push_back(si);
      is_ld_preload = true;
    }

    if (soinfos_count < library_names_count) {
      soinfos[soinfos_count++] = si;
    }

    // Add the new global group members to all initial namespaces. Do this secondary namespace setup
    // at the same time that libraries are added to their primary namespace so that the order of
    // global group members is the same in the every namespace. Only add a library to a namespace
    // once, even if it appears multiple times in the dependency graph.
    if (is_ld_preload || (si->get_dt_flags_1() & DF_1_GLOBAL) != 0) {
      if (!si->is_linked() && namespaces != nullptr && !new_global_group_members.contains(si)) {
        new_global_group_members.push_back(si);
        for (auto linked_ns : *namespaces) {
          if (si->get_primary_namespace() != linked_ns) {
            linked_ns->add_soinfo(si);
            si->add_secondary_namespace(linked_ns);
          }
        }
      }
    }
  }

  // Step 2: Load libraries in random order (see b/24047022)
  LoadTaskList load_list;
  for (auto&& task : load_tasks) {
    soinfo* si = task->get_soinfo();
    auto pred = [&](const LoadTask* t) {
      return t->get_soinfo() == si;
    };

    if (!si->is_linked() &&
        std::find_if(load_list.begin(), load_list.end(), pred) == load_list.end() ) {
      load_list.push_back(task);
    }
  }
  bool reserved_address_recursive = false;
  if (extinfo) {
    reserved_address_recursive = extinfo->flags & ANDROID_DLEXT_RESERVED_ADDRESS_RECURSIVE;
  }
  if (!reserved_address_recursive) {
    // Shuffle the load order in the normal case, but not if we are loading all
    // the libraries to a reserved address range.
    shuffle(&load_list);
  }

  // Set up address space parameters.
  address_space_params extinfo_params, default_params;
  size_t relro_fd_offset = 0;
  if (extinfo) {
    if (extinfo->flags & ANDROID_DLEXT_RESERVED_ADDRESS) {
      extinfo_params.start_addr = extinfo->reserved_addr;
      extinfo_params.reserved_size = extinfo->reserved_size;
      extinfo_params.must_use_address = true;
    } else if (extinfo->flags & ANDROID_DLEXT_RESERVED_ADDRESS_HINT) {
      extinfo_params.start_addr = extinfo->reserved_addr;
      extinfo_params.reserved_size = extinfo->reserved_size;
    }
  }

  for (auto&& task : load_list) {
    address_space_params* address_space =
        (reserved_address_recursive || !task->is_dt_needed()) ? &extinfo_params : &default_params;
    if (!task->load(address_space)) {
      return false;
    }
  }

  // The WebView loader uses RELRO sharing in order to promote page sharing of the large RELRO
  // segment, as it's full of C++ vtables. Because MTE globals, by default, applies random tags to
  // each global variable, the RELRO segment is polluted and unique for each process. In order to
  // allow sharing, but still provide some protection, we use deterministic global tagging schemes
  // for DSOs that are loaded through android_dlopen_ext, such as those loaded by WebView.
  bool dlext_use_relro =
      extinfo && extinfo->flags & (ANDROID_DLEXT_WRITE_RELRO | ANDROID_DLEXT_USE_RELRO);

  // Step 3: pre-link all DT_NEEDED libraries in breadth first order.
  bool any_memtag_stack = false;
  for (auto&& task : load_tasks) {
    soinfo* si = task->get_soinfo();
    if (!si->is_linked() && !si->prelink_image(dlext_use_relro)) {
      return false;
    }
    // si->memtag_stack() needs to be called after si->prelink_image() which populates
    // the dynamic section.
    if (si->memtag_stack()) {
      any_memtag_stack = true;
      LD_LOG(kLogDlopen,
             "... load_library requesting stack MTE for: realpath=\"%s\", soname=\"%s\"",
             si->get_realpath(), si->get_soname());
    }
    register_soinfo_tls(si);
  }
  if (any_memtag_stack) {
    if (auto* cb = __libc_shared_globals()->memtag_stack_dlopen_callback) {
      cb();
    } else {
      // find_library is used by the initial linking step, so we communicate that we
      // want memtag_stack enabled to __libc_init_mte.
      __libc_shared_globals()->initial_memtag_stack_abi = true;
    }
  }

  // Step 4: Construct the global group. DF_1_GLOBAL bit is force set for LD_PRELOADed libs because
  // they must be added to the global group. Note: The DF_1_GLOBAL bit for a library is normally set
  // in step 3.
  if (ld_preloads != nullptr) {
    for (auto&& si : *ld_preloads) {
      si->set_dt_flags_1(si->get_dt_flags_1() | DF_1_GLOBAL);
    }
  }

  // Step 5: Collect roots of local_groups.
  // Whenever needed_by->si link crosses a namespace boundary it forms its own local_group.
  // Here we collect new roots to link them separately later on. Note that we need to avoid
  // collecting duplicates. Also the order is important. They need to be linked in the same
  // BFS order we link individual libraries.
  std::vector<soinfo*> local_group_roots;
  if (start_with != nullptr && add_as_children) {
    local_group_roots.push_back(start_with);
  } else {
    CHECK(soinfos_count == 1);
    local_group_roots.push_back(soinfos[0]);
  }

  for (auto&& task : load_tasks) {
    soinfo* si = task->get_soinfo();
    soinfo* needed_by = task->get_needed_by();
    bool is_dt_needed = needed_by != nullptr && (needed_by != start_with || add_as_children);
    android_namespace_t* needed_by_ns =
        is_dt_needed ? needed_by->get_primary_namespace() : ns;

    if (!si->is_linked() && si->get_primary_namespace() != needed_by_ns) {
      auto it = std::find(local_group_roots.begin(), local_group_roots.end(), si);
      LD_LOG(kLogDlopen,
             "Crossing namespace boundary (si=%s@%p, si_ns=%s@%p, needed_by=%s@%p, ns=%s@%p, needed_by_ns=%s@%p) adding to local_group_roots: %s",
             si->get_realpath(),
             si,
             si->get_primary_namespace()->get_name(),
             si->get_primary_namespace(),
             needed_by == nullptr ? "(nullptr)" : needed_by->get_realpath(),
             needed_by,
             ns->get_name(),
             ns,
             needed_by_ns->get_name(),
             needed_by_ns,
             it == local_group_roots.end() ? "yes" : "no");

      if (it == local_group_roots.end()) {
        local_group_roots.push_back(si);
      }
    }
  }

  // Step 6: Link all local groups
  for (auto root : local_group_roots) {
    soinfo_list_t local_group;
    android_namespace_t* local_group_ns = root->get_primary_namespace();

    walk_dependencies_tree(root,
      [&] (soinfo* si) {
        if (local_group_ns->is_accessible(si)) {
          local_group.push_back(si);
          return kWalkContinue;
        } else {
          return kWalkSkip;
        }
      });

    soinfo_list_t global_group = local_group_ns->get_global_group();
    SymbolLookupList lookup_list(global_group, local_group);
    soinfo* local_group_root = local_group.front();

    bool linked = local_group.visit([&](soinfo* si) {
      // Even though local group may contain accessible soinfos from other namespaces
      // we should avoid linking them (because if they are not linked -> they
      // are in the local_group_roots and will be linked later).
      if (!si->is_linked() && si->get_primary_namespace() == local_group_ns) {
        const android_dlextinfo* link_extinfo = nullptr;
        if (si == soinfos[0] || reserved_address_recursive) {
          // Only forward extinfo for the first library unless the recursive
          // flag is set.
          link_extinfo = extinfo;
        }
        if (__libc_shared_globals()->load_hook) {
          __libc_shared_globals()->load_hook(si->load_bias, si->phdr, si->phnum);
        }
        lookup_list.set_dt_symbolic_lib(si->has_DT_SYMBOLIC ? si : nullptr);
        if (!si->link_image(lookup_list, local_group_root, link_extinfo, &relro_fd_offset) ||
            !get_cfi_shadow()->AfterLoad(si, solist_get_head())) {
          return false;
        }
      }

      return true;
    });

    if (!linked) {
      return false;
    }
  }

  // Step 7: Mark all load_tasks as linked and increment refcounts
  // for references between load_groups (at this point it does not matter if
  // referenced load_groups were loaded by previous dlopen or as part of this
  // one on step 6)
  if (start_with != nullptr && add_as_children) {
    start_with->set_linked();
  }

  for (auto&& task : load_tasks) {
    soinfo* si = task->get_soinfo();
    si->set_linked();
  }

  for (auto&& task : load_tasks) {
    soinfo* si = task->get_soinfo();
    soinfo* needed_by = task->get_needed_by();
    if (needed_by != nullptr &&
        needed_by != start_with &&
        needed_by->get_local_group_root() != si->get_local_group_root()) {
      si->increment_ref_count();
    }
  }

  return true;
}
```

注释把这段代码分为了七个步骤：

-   **Step 0: 准备** 初始化数据结构（ `readers_map` 、 `load_tasks` ），为每个请求的库创建 `LoadTask` ，分配 `soinfos` 数组（如果未提供），设置资源清理守卫（ `scope_guard` ），并初始化 ZIP 缓存和全局库列表。
-   **Step 1: 扩展加载任务（处理 DT_NEEDED）** 遍历加载任务，调用 `find_library_internal` 查找库并解析 `DT_NEEDED` 依赖，将依赖添加到任务列表。记录加载的 `soinfo` ，处理依赖关系（ `add_child` ）、预加载库（ `ld_preloads` ）和全局库（ `DF_1_GLOBAL` ），并将其分配到多个命名空间。
-   **Step 2: 随机化加载顺序** 从未链接的库中创建加载列表（ `load_list` ），并在非保留地址场景下随机化顺序（ `shuffle` ），以增强地址空间布局随机化（ `ASLR` ）安全性。
-   **Step 3: 设置地址空间参数并加载** 根据 `extinfo` 设置地址空间参数（如保留地址），遍历加载列表，调用 `task->load` 将库映射到内存（ `mmap` ），处理顶级库和依赖库的不同地址分配。
-   **Step 4: 预链接库（Pre-link）** 遍历任务，调用 `prelink_image` 解析 ELF 动态段，设置 `RELRO` 保护，检查 MTE（内存标签扩展）需求，注册 TLS（线程局部存储），并触发 MTE 回调或设置全局标志。
-   **Step 5: 处理全局组（Global Group）** 将预加载库（ `ld_preloads` ）标记为全局库（ `DF_1_GLOBAL` ），确保其符号在所有命名空间中可见，加入全局符号组。
-   **Step 6: 收集局部组根节点（Local Group Roots）** 识别跨命名空间的依赖库，收集局部组的根节点（ `local_group_roots` ），为后续链接准备，确保跨命名空间符号解析正确。
-   **Step 7: 链接局部组并更新状态** 遍历局部组根节点，构建局部和全局符号查找列表，调用 `link_image` 执行重定位和符号绑定，设置 CFI 保护。标记所有库为已链接，更新跨组引用计数，返回成功。

其中相对重要的有三步

1.  解析elf
    
2.  映射到内存
    
3.  重定位
    

他们对应的函数分别是 `find_library_internal``prelink_image` ， `LoadTask::load` 和 `soinfo::link_image` 我们依次来分析

#### find_library_internal

直接看重要的吧，这是调用链：find_library_internal->load_library

直接看load_library函数

```rust
static bool load_library(android_namespace_t* ns,
                         LoadTask* task,
                         LoadTaskList* load_tasks,
                         int rtld_flags,
                         const std::string& realpath,
                         bool search_linked_namespaces) {
  off64_t file_offset = task->get_file_offset();
  const char* name = task->get_name();
  const android_dlextinfo* extinfo = task->get_extinfo();

  LD_LOG(kLogDlopen,
         "load_library(ns=%s, task=%s, flags=0x%x, realpath=%s, search_linked_namespaces=%d)",
         ns->get_name(), name, rtld_flags, realpath.c_str(), search_linked_namespaces);

  if ((file_offset % page_size()) != 0) {
    DL_OPEN_ERR("file offset for the library \"%s\" is not page-aligned: %" PRId64, name, file_offset);
    return false;
  }
  if (file_offset < 0) {
    DL_OPEN_ERR("file offset for the library \"%s\" is negative: %" PRId64, name, file_offset);
    return false;
  }

  struct stat file_stat;
  if (TEMP_FAILURE_RETRY(fstat(task->get_fd(), &file_stat)) != 0) {
    DL_OPEN_ERR("unable to stat file for the library \"%s\": %m", name);
    return false;
  }
  if (file_offset >= file_stat.st_size) {
    DL_OPEN_ERR("file offset for the library \"%s\" >= file size: %" PRId64 " >= %" PRId64,
        name, file_offset, file_stat.st_size);
    return false;
  }

  // Check for symlink and other situations where
  // file can have different names, unless ANDROID_DLEXT_FORCE_LOAD is set
  if (extinfo == nullptr || (extinfo->flags & ANDROID_DLEXT_FORCE_LOAD) == 0) {
    soinfo* si = nullptr;
    if (find_loaded_library_by_inode(ns, file_stat, file_offset, search_linked_namespaces, &si)) {
      LD_LOG(kLogDlopen,
             "load_library(ns=%s, task=%s): Already loaded under different name/path \"%s\" - "
             "will return existing soinfo",
             ns->get_name(), name, si->get_realpath());
      task->set_soinfo(si);
      return true;
    }
  }

  if ((rtld_flags & RTLD_NOLOAD) != 0) {
    DL_OPEN_ERR("library \"%s\" wasn't loaded and RTLD_NOLOAD prevented it", name);
    return false;
  }

  struct statfs fs_stat;
  if (TEMP_FAILURE_RETRY(fstatfs(task->get_fd(), &fs_stat)) != 0) {
    DL_OPEN_ERR("unable to fstatfs file for the library \"%s\": %m", name);
    return false;
  }

  // do not check accessibility using realpath if fd is located on tmpfs
  // this enables use of memfd_create() for apps
  if ((fs_stat.f_type != TMPFS_MAGIC) && (!ns->is_accessible(realpath))) {
    // TODO(dimitry): workaround for http://b/26394120 - the exempt-list

    const soinfo* needed_by = task->is_dt_needed() ? task->get_needed_by() : nullptr;
    if (is_exempt_lib(ns, name, needed_by)) {
      // print warning only if needed by non-system library
      if (needed_by == nullptr || !is_system_library(needed_by->get_realpath())) {
        const soinfo* needed_or_dlopened_by = task->get_needed_by();
        const char* sopath = needed_or_dlopened_by == nullptr ? "(unknown)" :
                                                      needed_or_dlopened_by->get_realpath();
        // is_exempt_lib() always returns true for targetSdkVersion < 24,
        // so no need to check the return value of DL_ERROR_AFTER().
        // We still call it rather than DL_WARN() to get the extra clarification.
        DL_ERROR_AFTER(24, "library \"%s\" (\"%s\") needed or dlopened by \"%s\" "
                       "is not accessible by namespace \"%s\"",
                       name, realpath.c_str(), sopath, ns->get_name());
        add_dlwarning(sopath, "unauthorized access to",  name);
      }
    } else {
      // do not load libraries if they are not accessible for the specified namespace.
      const char* needed_or_dlopened_by = task->get_needed_by() == nullptr ?
                                          "(unknown)" :
                                          task->get_needed_by()->get_realpath();

      DL_OPEN_ERR("library \"%s\" needed or dlopened by \"%s\" is not accessible for the namespace \"%s\"",
             name, needed_or_dlopened_by, ns->get_name());

      // do not print this if a library is in the list of shared libraries for linked namespaces
      if (!maybe_accessible_via_namespace_links(ns, name)) {
        DL_WARN("library \"%s\" (\"%s\") needed or dlopened by \"%s\" is not accessible for the"
                " namespace: [name=\"%s\", ld_library_paths=\"%s\", default_library_paths=\"%s\","
                " permitted_paths=\"%s\"]",
                name, realpath.c_str(),
                needed_or_dlopened_by,
                ns->get_name(),
                android::base::Join(ns->get_ld_library_paths(), ':').c_str(),
                android::base::Join(ns->get_default_library_paths(), ':').c_str(),
                android::base::Join(ns->get_permitted_paths(), ':').c_str());
      }
      return false;
    }
  }

  soinfo* si = soinfo_alloc(ns, realpath.c_str(), &file_stat, file_offset, rtld_flags);

  task->set_soinfo(si);

  // Read the ELF header and some of the segments.
  if (!task->read(realpath.c_str(), file_stat.st_size)) {
    task->remove_cached_elf_reader();
    task->set_soinfo(nullptr);
    soinfo_free(si);
    return false;
  }

  // Find and set DT_RUNPATH, DT_SONAME, and DT_FLAGS_1.
  // Note that these field values are temporary and are
  // going to be overwritten on soinfo::prelink_image
  // with values from PT_LOAD segments.
  const ElfReader& elf_reader = task->get_elf_reader();
  for (const ElfW(Dyn)* d = elf_reader.dynamic(); d->d_tag != DT_NULL; ++d) {
    if (d->d_tag == DT_RUNPATH) {
      si->set_dt_runpath(elf_reader.get_string(d->d_un.d_val));
    }
    if (d->d_tag == DT_SONAME) {
      si->set_soname(elf_reader.get_string(d->d_un.d_val));
    }
    // We need to identify a DF_1_GLOBAL library early so we can link it to namespaces.
    if (d->d_tag == DT_FLAGS_1) {
      si->set_dt_flags_1(d->d_un.d_val);
    }
  }

#if !defined(__ANDROID__)
  // Bionic on the host currently uses some Android prebuilts, which don't set
  // DT_RUNPATH with any relative paths, so they can't find their dependencies.
  // b/118058804
  if (si->get_dt_runpath().empty()) {
    si->set_dt_runpath("$ORIGIN/../lib64:$ORIGIN/lib64");
  }
#endif

  for (const ElfW(Dyn)* d = elf_reader.dynamic(); d->d_tag != DT_NULL; ++d) {
    if (d->d_tag == DT_NEEDED) {
      const char* name = fix_dt_needed(elf_reader.get_string(d->d_un.d_val), elf_reader.name());
      LD_LOG(kLogDlopen, "load_library(ns=%s, task=%s): Adding DT_NEEDED task: %s",
             ns->get_name(), task->get_name(), name);
      load_tasks->push_back(LoadTask::create(name, si, ns, task->get_readers_map()));
    }
  }

  return true;
}
```

可以看到load_library 是 Android 动态链接器中处理单个共享库加载的函数，负责验证文件、检查已加载状态、分配 soinfo、初步解析 ELF 动态段(task->read)，并为 DT_NEEDED 依赖创建加载任务。它在 find_libraries 的 Step 1 中被 find_library_internal 调用，为后续映射（Step 3）和重定位（Step 7）准备元数据

#### prelink_image

```kotlin
bool soinfo::prelink_image(bool dlext_use_relro) {
  if (flags_ & FLAG_PRELINKED) return true;
  /* Extract dynamic section */
  ElfW(Word) dynamic_flags = 0;
  phdr_table_get_dynamic_section(phdr, phnum, load_bias, &dynamic, &dynamic_flags);

  /* We can't log anything until the linker is relocated */
  bool relocating_linker = (flags_ & FLAG_LINKER) != 0;
  if (!relocating_linker) {
    LD_DEBUG(any, "[ Linking \"%s\" ]", get_realpath());
    LD_DEBUG(any, "si->base = %p si->flags = 0x%08x", reinterpret_cast<void*>(base), flags_);
  }

  if (dynamic == nullptr) {
    if (!relocating_linker) {
      DL_ERR("missing PT_DYNAMIC in \"%s\"", get_realpath());
    }
    return false;
  } else {
    if (!relocating_linker) {
      LD_DEBUG(dynamic, "dynamic section @%p", dynamic);
    }
  }

#if defined(__arm__)
  (void) phdr_table_get_arm_exidx(phdr, phnum, load_bias,
                                  &ARM_exidx, &ARM_exidx_count);
#endif

  TlsSegment tls_segment;
  if (__bionic_get_tls_segment(phdr, phnum, load_bias, &tls_segment)) {
    // The loader does not (currently) support ELF TLS, so it shouldn't have
    // a TLS segment.
    CHECK(!relocating_linker && "TLS not supported in loader");
    if (!__bionic_check_tls_align(tls_segment.aligned_size.align.value)) {
      DL_ERR("TLS segment alignment in \"%s\" is not a power of 2: %zu", get_realpath(),
             tls_segment.aligned_size.align.value);
      return false;
    }
    tls_ = std::make_unique<soinfo_tls>();
    tls_->segment = tls_segment;
  }

  // Extract useful information from dynamic section.
  // Note that: "Except for the DT_NULL element at the end of the array,
  // and the relative order of DT_NEEDED elements, entries may appear in any order."
  //
  // source: http://www.sco.com/developers/gabi/1998-04-29/ch5.dynamic.html
  uint32_t needed_count = 0;
  for (ElfW(Dyn)* d = dynamic; d->d_tag != DT_NULL; ++d) {
    LD_DEBUG(dynamic, "dynamic entry @%p: d_tag=%p, d_val=%p",
             d, reinterpret_cast<void*>(d->d_tag), reinterpret_cast<void*>(d->d_un.d_val));
    switch (d->d_tag) {
      case DT_SONAME:
        // this is parsed after we have strtab initialized (see below).
        break;

      case DT_HASH:
        nbucket_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr)[0];
        nchain_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr)[1];
        bucket_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr + 8);
        chain_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr + 8 + nbucket_ * 4);
        break;

      case DT_GNU_HASH:
        gnu_nbucket_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr)[0];
        // skip symndx
        gnu_maskwords_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr)[2];
        gnu_shift2_ = reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr)[3];

        gnu_bloom_filter_ = reinterpret_cast<ElfW(Addr)*>(load_bias + d->d_un.d_ptr + 16);
        gnu_bucket_ = reinterpret_cast<uint32_t*>(gnu_bloom_filter_ + gnu_maskwords_);
        // amend chain for symndx = header[1]
        gnu_chain_ = gnu_bucket_ + gnu_nbucket_ -
            reinterpret_cast<uint32_t*>(load_bias + d->d_un.d_ptr)[1];

        if (!powerof2(gnu_maskwords_)) {
          DL_ERR("invalid maskwords for gnu_hash = 0x%x, in \"%s\" expecting power to two",
              gnu_maskwords_, get_realpath());
          return false;
        }
        --gnu_maskwords_;

        flags_ |= FLAG_GNU_HASH;
        break;

      case DT_STRTAB:
        strtab_ = reinterpret_cast<const char*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_STRSZ:
        strtab_size_ = d->d_un.d_val;
        break;

      case DT_SYMTAB:
        symtab_ = reinterpret_cast<ElfW(Sym)*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_SYMENT:
        if (d->d_un.d_val != sizeof(ElfW(Sym))) {
          DL_ERR("invalid DT_SYMENT: %zd in \"%s\"",
              static_cast<size_t>(d->d_un.d_val), get_realpath());
          return false;
        }
        break;

      case DT_PLTREL:
#if defined(USE_RELA)
        if (d->d_un.d_val != DT_RELA) {
          DL_ERR("unsupported DT_PLTREL in \"%s\"; expected DT_RELA", get_realpath());
          return false;
        }
#else
        if (d->d_un.d_val != DT_REL) {
          DL_ERR("unsupported DT_PLTREL in \"%s\"; expected DT_REL", get_realpath());
          return false;
        }
#endif
        break;

      case DT_JMPREL:
#if defined(USE_RELA)
        plt_rela_ = reinterpret_cast<ElfW(Rela)*>(load_bias + d->d_un.d_ptr);
#else
        plt_rel_ = reinterpret_cast<ElfW(Rel)*>(load_bias + d->d_un.d_ptr);
#endif
        break;

      case DT_PLTRELSZ:
#if defined(USE_RELA)
        plt_rela_count_ = d->d_un.d_val / sizeof(ElfW(Rela));
#else
        plt_rel_count_ = d->d_un.d_val / sizeof(ElfW(Rel));
#endif
        break;

      case DT_PLTGOT:
        // Ignored (because RTLD_LAZY is not supported).
        break;

      case DT_DEBUG:
        // Set the DT_DEBUG entry to the address of _r_debug for GDB
        // if the dynamic table is writable
        if ((dynamic_flags & PF_W) != 0) {
          d->d_un.d_val = reinterpret_cast<uintptr_t>(&_r_debug);
        }
        break;
#if defined(USE_RELA)
      case DT_RELA:
        rela_ = reinterpret_cast<ElfW(Rela)*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_RELASZ:
        rela_count_ = d->d_un.d_val / sizeof(ElfW(Rela));
        break;

      case DT_ANDROID_RELA:
        android_relocs_ = reinterpret_cast<uint8_t*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_ANDROID_RELASZ:
        android_relocs_size_ = d->d_un.d_val;
        break;

      case DT_ANDROID_REL:
        DL_ERR("unsupported DT_ANDROID_REL in \"%s\"", get_realpath());
        return false;

      case DT_ANDROID_RELSZ:
        DL_ERR("unsupported DT_ANDROID_RELSZ in \"%s\"", get_realpath());
        return false;

      case DT_RELAENT:
        if (d->d_un.d_val != sizeof(ElfW(Rela))) {
          DL_ERR("invalid DT_RELAENT: %zd", static_cast<size_t>(d->d_un.d_val));
          return false;
        }
        break;

      // Ignored (see DT_RELCOUNT comments for details).
      case DT_RELACOUNT:
        break;

      case DT_REL:
        DL_ERR("unsupported DT_REL in \"%s\"", get_realpath());
        return false;

      case DT_RELSZ:
        DL_ERR("unsupported DT_RELSZ in \"%s\"", get_realpath());
        return false;

#else
      case DT_REL:
        rel_ = reinterpret_cast<ElfW(Rel)*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_RELSZ:
        rel_count_ = d->d_un.d_val / sizeof(ElfW(Rel));
        break;

      case DT_RELENT:
        if (d->d_un.d_val != sizeof(ElfW(Rel))) {
          DL_ERR("invalid DT_RELENT: %zd", static_cast<size_t>(d->d_un.d_val));
          return false;
        }
        break;

      case DT_ANDROID_REL:
        android_relocs_ = reinterpret_cast<uint8_t*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_ANDROID_RELSZ:
        android_relocs_size_ = d->d_un.d_val;
        break;

      case DT_ANDROID_RELA:
        DL_ERR("unsupported DT_ANDROID_RELA in \"%s\"", get_realpath());
        return false;

      case DT_ANDROID_RELASZ:
        DL_ERR("unsupported DT_ANDROID_RELASZ in \"%s\"", get_realpath());
        return false;

      // "Indicates that all RELATIVE relocations have been concatenated together,
      // and specifies the RELATIVE relocation count."
      //
      // TODO: Spec also mentions that this can be used to optimize relocation process;
      // Not currently used by bionic linker - ignored.
      case DT_RELCOUNT:
        break;

      case DT_RELA:
        DL_ERR("unsupported DT_RELA in \"%s\"", get_realpath());
        return false;

      case DT_RELASZ:
        DL_ERR("unsupported DT_RELASZ in \"%s\"", get_realpath());
        return false;

#endif
      case DT_RELR:
      case DT_ANDROID_RELR:
        relr_ = reinterpret_cast<ElfW(Relr)*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_RELRSZ:
      case DT_ANDROID_RELRSZ:
        relr_count_ = d->d_un.d_val / sizeof(ElfW(Relr));
        break;

      case DT_RELRENT:
      case DT_ANDROID_RELRENT:
        if (d->d_un.d_val != sizeof(ElfW(Relr))) {
          DL_ERR("invalid DT_RELRENT: %zd", static_cast<size_t>(d->d_un.d_val));
          return false;
        }
        break;

      // Ignored (see DT_RELCOUNT comments for details).
      // There is no DT_RELRCOUNT specifically because it would only be ignored.
      case DT_ANDROID_RELRCOUNT:
        break;

      case DT_INIT:
        init_func_ = reinterpret_cast<linker_ctor_function_t>(load_bias + d->d_un.d_ptr);
        LD_DEBUG(dynamic, "%s constructors (DT_INIT) found at %p", get_realpath(), init_func_);
        break;

      case DT_FINI:
        fini_func_ = reinterpret_cast<linker_dtor_function_t>(load_bias + d->d_un.d_ptr);
        LD_DEBUG(dynamic, "%s destructors (DT_FINI) found at %p", get_realpath(), fini_func_);
        break;

      case DT_INIT_ARRAY:
        init_array_ = reinterpret_cast<linker_ctor_function_t*>(load_bias + d->d_un.d_ptr);
        LD_DEBUG(dynamic, "%s constructors (DT_INIT_ARRAY) found at %p", get_realpath(), init_array_);
        break;

      case DT_INIT_ARRAYSZ:
        init_array_count_ = static_cast<uint32_t>(d->d_un.d_val) / sizeof(ElfW(Addr));
        break;

      case DT_FINI_ARRAY:
        fini_array_ = reinterpret_cast<linker_dtor_function_t*>(load_bias + d->d_un.d_ptr);
        LD_DEBUG(dynamic, "%s destructors (DT_FINI_ARRAY) found at %p", get_realpath(), fini_array_);
        break;

      case DT_FINI_ARRAYSZ:
        fini_array_count_ = static_cast<uint32_t>(d->d_un.d_val) / sizeof(ElfW(Addr));
        break;

      case DT_PREINIT_ARRAY:
        preinit_array_ = reinterpret_cast<linker_ctor_function_t*>(load_bias + d->d_un.d_ptr);
        LD_DEBUG(dynamic, "%s constructors (DT_PREINIT_ARRAY) found at %p", get_realpath(), preinit_array_);
        break;

      case DT_PREINIT_ARRAYSZ:
        preinit_array_count_ = static_cast<uint32_t>(d->d_un.d_val) / sizeof(ElfW(Addr));
        break;

      case DT_TEXTREL:
#if defined(__LP64__)
        DL_ERR("\"%s\" has text relocations", get_realpath());
        return false;
#else
        has_text_relocations = true;
        break;
#endif

      case DT_SYMBOLIC:
        has_DT_SYMBOLIC = true;
        break;

      case DT_NEEDED:
        ++needed_count;
        break;

      case DT_FLAGS:
        if (d->d_un.d_val & DF_TEXTREL) {
#if defined(__LP64__)
          DL_ERR("\"%s\" has text relocations", get_realpath());
          return false;
#else
          has_text_relocations = true;
#endif
        }
        if (d->d_un.d_val & DF_SYMBOLIC) {
          has_DT_SYMBOLIC = true;
        }
        break;

      case DT_FLAGS_1:
        set_dt_flags_1(d->d_un.d_val);

        if ((d->d_un.d_val & ~SUPPORTED_DT_FLAGS_1) != 0) {
          DL_WARN("Warning: \"%s\" has unsupported flags DT_FLAGS_1=%p "
                  "(ignoring unsupported flags)",
                  get_realpath(), reinterpret_cast<void*>(d->d_un.d_val));
        }
        break;

      // Ignored: "Its use has been superseded by the DF_BIND_NOW flag"
      case DT_BIND_NOW:
        break;

      case DT_VERSYM:
        versym_ = reinterpret_cast<ElfW(Versym)*>(load_bias + d->d_un.d_ptr);
        break;

      case DT_VERDEF:
        verdef_ptr_ = load_bias + d->d_un.d_ptr;
        break;
      case DT_VERDEFNUM:
        verdef_cnt_ = d->d_un.d_val;
        break;

      case DT_VERNEED:
        verneed_ptr_ = load_bias + d->d_un.d_ptr;
        break;

      case DT_VERNEEDNUM:
        verneed_cnt_ = d->d_un.d_val;
        break;

      case DT_RUNPATH:
        // this is parsed after we have strtab initialized (see below).
        break;

      case DT_TLSDESC_GOT:
      case DT_TLSDESC_PLT:
        // These DT entries are used for lazy TLSDESC relocations. Bionic
        // resolves everything eagerly, so these can be ignored.
        break;

#if defined(__aarch64__)
      case DT_AARCH64_BTI_PLT:
      case DT_AARCH64_PAC_PLT:
      case DT_AARCH64_VARIANT_PCS:
        // Ignored: AArch64 processor-specific dynamic array tags.
        break;
      case DT_AARCH64_MEMTAG_MODE:
        memtag_dynamic_entries_.has_memtag_mode = true;
        memtag_dynamic_entries_.memtag_mode = d->d_un.d_val;
        break;
      case DT_AARCH64_MEMTAG_HEAP:
        memtag_dynamic_entries_.memtag_heap = d->d_un.d_val;
        break;
      // The AArch64 MemtagABI originally erroneously defined
      // DT_AARCH64_MEMTAG_STACK as `d_ptr`, which is why the dynamic tag value
      // is odd (`0x7000000c`). `d_val` is clearly the correct semantics, and so
      // this was fixed in the ABI, but the value (0x7000000c) didn't change
      // because we already had Android binaries floating around with dynamic
      // entries, and didn't want to create a whole new dynamic entry and
      // reserve a value just to fix that tiny mistake. P.S. lld was always
      // outputting DT_AARCH64_MEMTAG_STACK as `d_val` anyway.
      case DT_AARCH64_MEMTAG_STACK:
        memtag_dynamic_entries_.memtag_stack = d->d_un.d_val;
        break;
      // Same as above, except DT_AARCH64_MEMTAG_GLOBALS was incorrectly defined
      // as `d_val` (hence an even value of `0x7000000d`), when it should have
      // been `d_ptr` all along. lld has always outputted this as `d_ptr`.
      case DT_AARCH64_MEMTAG_GLOBALS:
        memtag_dynamic_entries_.memtag_globals = reinterpret_cast<void*>(load_bias + d->d_un.d_ptr);
        break;
      case DT_AARCH64_MEMTAG_GLOBALSSZ:
        memtag_dynamic_entries_.memtag_globalssz = d->d_un.d_val;
        break;
#endif

      default:
        if (!relocating_linker) {
          const char* tag_name;
          if (d->d_tag == DT_RPATH) {
            tag_name = "DT_RPATH";
          } else if (d->d_tag == DT_ENCODING) {
            tag_name = "DT_ENCODING";
          } else if (d->d_tag >= DT_LOOS && d->d_tag <= DT_HIOS) {
            tag_name = "unknown OS-specific";
          } else if (d->d_tag >= DT_LOPROC && d->d_tag <= DT_HIPROC) {
            tag_name = "unknown processor-specific";
          } else {
            tag_name = "unknown";
          }
          DL_WARN("Warning: \"%s\" unused DT entry: %s (type %p arg %p) (ignoring)",
                  get_realpath(),
                  tag_name,
                  reinterpret_cast<void*>(d->d_tag),
                  reinterpret_cast<void*>(d->d_un.d_val));
        }
        break;
    }
  }

  LD_DEBUG(dynamic, "si->base = %p, si->strtab = %p, si->symtab = %p",
           reinterpret_cast<void*>(base), strtab_, symtab_);

  // Validity checks.
  if (relocating_linker && needed_count != 0) {
    DL_ERR("linker cannot have DT_NEEDED dependencies on other libraries");
    return false;
  }
  if (nbucket_ == 0 && gnu_nbucket_ == 0) {
    DL_ERR("empty/missing DT_HASH/DT_GNU_HASH in \"%s\" "
        "(new hash type from the future?)", get_realpath());
    return false;
  }
  if (strtab_ == nullptr) {
    DL_ERR("empty/missing DT_STRTAB in \"%s\"", get_realpath());
    return false;
  }
  if (symtab_ == nullptr) {
    DL_ERR("empty/missing DT_SYMTAB in \"%s\"", get_realpath());
    return false;
  }

  // Second pass - parse entries relying on strtab. Skip this while relocating the linker so as to
  // avoid doing heap allocations until later in the linker's initialization.
  if (!relocating_linker) {
    for (ElfW(Dyn)* d = dynamic; d->d_tag != DT_NULL; ++d) {
      switch (d->d_tag) {
        case DT_SONAME:
          set_soname(get_string(d->d_un.d_val));
          break;
        case DT_RUNPATH:
          set_dt_runpath(get_string(d->d_un.d_val));
          break;
      }
    }
  }

  // Before API 23, the linker used the basename in place of DT_SONAME.
  // After we switched, apps with libraries without a DT_SONAME stopped working:
  // they could no longer be found by DT_NEEDED from another library.
  // The main executable does not need to have a DT_SONAME.
  // The linker has a DT_SONAME, but the soname_ field is initialized later on.
  if (soname_.empty() && this != solist_get_somain() && !relocating_linker &&
      get_application_target_sdk_version() < 23) {
    soname_ = basename(realpath_.c_str());
    // The `if` above means we don't get here for targetSdkVersion >= 23,
    // so no need to check the return value of DL_ERROR_AFTER().
    // We still call it rather than DL_WARN() to get the extra clarification.
    DL_ERROR_AFTER(23, "\"%s\" has no DT_SONAME (will use %s instead)",
                   get_realpath(), soname_.c_str());
  }

  // Validate each library's verdef section once, so we don't have to validate
  // it each time we look up a symbol with a version.
  if (!validate_verdef_section(this)) return false;

  // MTE globals requires remapping data segments with PROT_MTE as anonymous mappings, because file
  // based mappings may not be backed by tag-capable memory (see "MAP_ANONYMOUS" on
  // https://www.kernel.org/doc/html/latest/arch/arm64/memory-tagging-extension.html). This is only
  // done if the binary has MTE globals (evidenced by the dynamic table entries), as it destroys
  // page sharing. It's also only done on devices that support MTE, because the act of remapping
  // pages is unnecessary on non-MTE devices (where we might still run MTE-globals enabled code).
  if (should_tag_memtag_globals() &&
      remap_memtag_globals_segments(phdr, phnum, base) == 0) {
    tag_globals(dlext_use_relro);
    protect_memtag_globals_ro_segments(phdr, phnum, base);
  }

  flags_ |= FLAG_PRELINKED;
  return true;
}
```

这是重定位的过程，我也看不太懂

映射的过程最终调用了

```cpp
bool ElfReader::MapSegment(size_t seg_idx, size_t len) {
  const ElfW(Phdr)* phdr = &phdr_table_[seg_idx];

  void* start = reinterpret_cast<void*>(page_start(phdr->p_vaddr + load_bias_));

  // The ELF could be being loaded directly from a zipped APK,
  // the zip offset must be added to find the segment offset.
  const ElfW(Addr) offset = file_offset_ + page_start(phdr->p_offset);

  int prot = PFLAGS_TO_PROT(phdr->p_flags);

  void* seg_addr = mmap64(start, len, prot, MAP_FIXED | MAP_PRIVATE, fd_, offset);

  if (seg_addr == MAP_FAILED) {
    DL_ERR("couldn't map \"%s\" segment %zd: %m", name_.c_str(), seg_idx);
    return false;
  }

  // Mark segments as huge page eligible if they meet the requirements
  if ((phdr->p_flags & PF_X) && phdr->p_align == kPmdSize &&
      get_transparent_hugepages_supported()) {
    madvise(seg_addr, len, MADV_HUGEPAGE);
  }

  return true;
}
```

可以看到是通过mmap函数映射的

## 0x03总结

可以看到so加载流程实际上分为三步

1.  解析elf
    
2.  映射到内存
    
3.  重定位
    

这三步分别对应上述三个函数

至于相关操作涉及的细节这里不做讨论，主要是为了了解一下大致的流程。至此，应该能够对linker加载so的过程有一个大概的认识了。
