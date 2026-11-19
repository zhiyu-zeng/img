---
title: LUAJIT官方源码编译调试
source: https://fjqisba.github.io/2026/01/24/2026/LUAJIT%E5%AE%98%E6%96%B9%E6%BA%90%E7%A0%81%E7%BC%96%E8%AF%91%E8%B0%83%E8%AF%95/
source_host: fjqisba.github.io
clip_date: 2026-11-19T10:54:30+08:00
trace_id: af9cb870-1c8a-4856-8231-9b9fe382e313
content_hash: 99227fb6cdc00b5ca377edd6bd5a609445454942008f654b3a197f446f9aaf59
status: synced
tags: []
series: null
feed_source: fjqisba·Android/Hook
ai_summary: null
ai_summary_style: null
images_status:
  total: 0
  succeeded: 0
  failed_urls: []
notion_page_id: 41d75244-d011-81ca-9ff5-fd2e61b48ab9
ioc: null
---

## LUAJIT官方源码编译调试

项目地址： [https://luajit.org/download.html](https://luajit.org/download.html)

镜像仓库： [https://github.com/LuaJIT/LuaJIT](https://github.com/LuaJIT/LuaJIT)

## 搭建Visual Studio工程

这里我用的是VS 2022

1、先进入x64 Native Tools Command Prompt for VS 2022，执行一遍 `msvcbuild.bat` ，成功编译出 `luajit.exe`

2、修改 `msvcbuild.bat` 脚本，移除掉里面的删除obj缓存相关内容，重新执行一遍吧

```
@del *.obj *.manifest minilua.exe buildvm.exe
@del host\buildvm_arch.h
@del lj_bcdef.h lj_ffdef.h lj_libdef.h lj_recdef.h lj_folddef.h
BAT
```

3、src目录下建个工程，拖入所有的源码，编译提示一大堆函数已被重复定义

```bash
1>ljamalg.obj : error LNK2005: luaopen_base 已经在 lib_base.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_math 已经在 lib_math.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_string 已经在 lib_string.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_table 已经在 lib_table.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_io 已经在 lib_io.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_os 已经在 lib_os.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_package 已经在 lib_package.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_debug 已经在 lib_debug.obj 中定义
1>ljamalg.obj : error LNK2005: luaopen_bit 已经在 lib_bit.obj 中定义
ROUTEROS
```

移除 `ljamalg.c` 文件即可

4、继续编译，又会报错，缺少 `lj_vm.obj` ，将其添加到链接器的附加依赖项中

## Windows下编译Android

来个ARM64编译bat，需要使用x64 Native Tools Command Prompt工具

```sql
@if not defined INCLUDE goto :FAIL_ENV

@rem ========================================================================
@rem 1. 环境准备与路径配置
@rem ========================================================================
@setlocal
@echo [INFO] Initializing environment...

@rem 获取当前脚本所在目录(src)
@set "LJ_SRC_DIR=%~dp0"
@if "%LJ_SRC_DIR:~-1%"=="\" set "LJ_SRC_DIR=%LJ_SRC_DIR:~0,-1%"
@set "LJ_HOST_DIR=%LJ_SRC_DIR%\host"
@set "DASM_DIR=%LJ_SRC_DIR%\..\dynasm"

@echo [INFO] Source Dir: %LJ_SRC_DIR%

@rem ========================================================================
@rem 2. NDK 工具链配置 (请根据实际情况修改 NDK_ROOT)
@rem ========================================================================
@if not defined NDK_ROOT set "NDK_ROOT=C:\Users\fjqisba\AppData\Local\Android\Sdk\ndk\26.0.10792818"
@set "NDK_TOOLCHAIN=%NDK_ROOT%\toolchains\llvm\prebuilt\windows-x86_64"
@set "ANDROID_API=21"
@set "ANDROID_TARGET=aarch64-linux-android"

@rem 注意：NDK的clang通常是.cmd脚本，必须使用 call 调用
@set "ANDROID_CC=%NDK_TOOLCHAIN%\bin\%ANDROID_TARGET%%ANDROID_API%-clang.cmd"
@set "ANDROID_AR=%NDK_TOOLCHAIN%\bin\llvm-ar.exe"
@set "ANDROID_STRIP=%NDK_TOOLCHAIN%\bin\llvm-strip.exe"

@rem ========================================================================
@rem 3. 编译参数配置
@rem ========================================================================
@rem Host (Windows MSVC) 编译参数
@set LJCOMPILE=cl /nologo /c /MD /O2 /W3 /D_CRT_SECURE_NO_DEPRECATE /I "%LJ_SRC_DIR%"
@set LJLINK=link /nologo

@rem Host DynASM 参数 (针对 ARM64)
@set DASC=vm_arm64.dasc
@set DASMFLAGS=-D ENDIAN_LE -D FFI -D JIT -D FPU -D P64

@rem Target (Android ARM64) 编译参数
@rem 注意：LUAJIT_OS_LINUX 通常对应数字 2，但使用宏更清晰
@set TARGET_CFLAGS=-O2 -fPIC -fno-strict-aliasing -Wall -DLUAJIT_TARGET=LUAJIT_ARCH_ARM64 -DLUAJIT_OS=LUAJIT_OS_LINUX -D__ANDROID__
@set TARGET_LDFLAGS=-lm -ldl

@rem 需要编译的库文件列表 (LuaJIT 2.1 包含 lib_buffer.c)
@set ALL_LIB=lib_base.c lib_math.c lib_bit.c lib_string.c lib_table.c lib_io.c lib_os.c lib_package.c lib_debug.c lib_jit.c lib_ffi.c lib_buffer.c

@rem ========================================================================
@rem 4. 清理旧文件
@rem ========================================================================
@echo [INFO] Cleaning up...
@cd /d "%LJ_SRC_DIR%"
@del *.o *.obj *.lib *.exp *.dll *.exe *.a *.so 2>nul
@del host\*.obj host\*.exe 2>nul
@del lj_bcdef.h lj_ffdef.h lj_libdef.h lj_recdef.h lj_folddef.h lj_vm.S 2>nul

@rem ========================================================================
@rem 5. 宿主编译: minilua
@rem ========================================================================
@echo [INFO] Compiling Host Tool: minilua...
%LJCOMPILE% host\minilua.c /Fo"host\minilua.obj"
@if errorlevel 1 goto :FAIL
%LJLINK% /out:minilua.exe host\minilua.obj
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 6. 宿主运行: 处理 dynasm 生成 buildvm_arch.h
@rem ========================================================================
@echo [INFO] Generating buildvm_arch.h using minilua...
@if not exist "%DASM_DIR%\dynasm.lua" (
    @echo [ERROR] Cannot find dynasm.lua at %DASM_DIR%
    goto :FAIL
)
minilua "%DASM_DIR%\dynasm.lua" -LN %DASMFLAGS% -o host\buildvm_arch.h %DASC%
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 7. 宿主编译: buildvm
@rem ========================================================================
@echo [INFO] Compiling Host Tool: buildvm...
@rem buildvm 需要包含 buildvm_arch.h 以及指定目标架构
%LJCOMPILE% /I "%DASM_DIR%" /I "%LJ_HOST_DIR%" -DLUAJIT_TARGET=LUAJIT_ARCH_ARM64 -DLUAJIT_OS=LUAJIT_OS_LINUX host\buildvm*.c /Fo"host\\"
@if errorlevel 1 goto :FAIL
%LJLINK% /out:buildvm.exe host\buildvm*.obj
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 8. 宿主运行: buildvm 生成核心代码
@rem ========================================================================
@echo [INFO] Running buildvm to generate Core Sources...
buildvm -m elfasm -o lj_vm.S
buildvm -m bcdef -o lj_bcdef.h %ALL_LIB%
buildvm -m ffdef -o lj_ffdef.h %ALL_LIB%
buildvm -m libdef -o lj_libdef.h %ALL_LIB%
buildvm -m recdef -o lj_recdef.h %ALL_LIB%
buildvm -m vmdef -o jit\vmdef.lua %ALL_LIB%
buildvm -m folddef -o lj_folddef.h lj_opt_fold.c
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 9. 目标编译: 汇编核心 (lj_vm.S)
@rem ========================================================================
@echo [INFO] Compiling Android ARM64 ASM (lj_vm.S)...
@rem 注意：Windows下生成的文件名为 lj_vm.S (大写S)，Clang 编译时需要 -x assembler
call "%ANDROID_CC%" -c -x assembler %TARGET_CFLAGS% -o lj_vm.o lj_vm.S
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 10. 目标编译: C 源码 (核心库)
@rem ========================================================================
@echo [INFO] Compiling Android ARM64 C Sources...
call "%ANDROID_CC%" -c %TARGET_CFLAGS% lj_*.c lib_*.c
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 11. 目标编译: LuaJIT 可执行程序入口
@rem ========================================================================
@echo [INFO] Compiling Main Executable Entry...
call "%ANDROID_CC%" -c %TARGET_CFLAGS% luajit.c -o luajit.o
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 12. 链接生成库和可执行文件
@rem ========================================================================
@echo [INFO] Linking...

@rem A. 静态库 (.a)
@echo [INFO] Creating static library: libluajit.a
call "%ANDROID_AR%" rcs libluajit.a lj_*.o lib_*.o
@if errorlevel 1 goto :FAIL

@rem B. 动态库 (.so)
@echo [INFO] Creating shared library: libluajit.so
call "%ANDROID_CC%" -shared -o libluajit.so lj_*.o lib_*.o %TARGET_LDFLAGS%
@if errorlevel 1 goto :FAIL
call "%ANDROID_STRIP%" --strip-unneeded libluajit.so

@rem C. 可执行文件 (luajit)
@echo [INFO] Creating executable: luajit_android_arm64
call "%ANDROID_CC%" -o luajit_android_arm64 luajit.o libluajit.a %TARGET_LDFLAGS% -pie
@if errorlevel 1 goto :FAIL

@rem ========================================================================
@rem 完成
@rem ========================================================================
@echo.
@echo [SUCCESS] Build complete!
@echo Static Lib: %LJ_SRC_DIR%\libluajit.a
@echo Shared Lib: %LJ_SRC_DIR%\libluajit.so
@echo Executable: %LJ_SRC_DIR%\luajit_android_arm64
@goto :END

:FAIL_ENV
@echo [ERROR] Please run this from "x64 Native Tools Command Prompt" for VS.
@goto :END

:FAIL
@echo.
@echo [ERROR] Build failed! Please check the error messages above.
@exit /b 1

:END
@endlocal
LESS
```

## 跨平台编译的坑

如果你想在windows上交叉编译android上的代码，那么可能会有坑，需要注意下面几点

1、 `ffi.cdef` 定义结构体，两种平台的 **基础数据类型大小** 和 **内存对齐大小** 是不一致的，正确用法应该是指示出来，例如

```lua
ffi.cdef[[
  #pragma pack(push, 8)
    struct stat_arm64 {
        uint64_t        st_dev;
        uint64_t        st_ino;
        uint32_t        st_mode;
        uint32_t        st_nlink;
        uint32_t        st_uid;
        uint32_t        st_gid;
        uint64_t        st_rdev;
        uint64_t        __pad1;
        int64_t         st_size;
        int32_t         st_blksize;
        int32_t         __pad2;
        int64_t         st_blocks;
        int64_t         st_atim_sec;
        int64_t         st_atim_nsec;
        int64_t         st_mtim_sec;
        int64_t         st_mtim_nsec;
        int64_t         st_ctim_sec;
        int64_t         st_ctim_nsec;
        uint32_t        __unused4;
        uint32_t        __unused5;
  };
  #pragma pack(pop)
]]
LUA
```
