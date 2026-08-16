'use strict';

function printBacktrace(ctx) {
    try {
        console.log("Backtrace:");
        console.log(
            Thread.backtrace(ctx, Backtracer.FUZZY)
                .map(DebugSymbol.fromAddress)
                .join("\n")
        );
    } catch (e) {
        console.log("backtrace failed: " + e);
    }
}

// ------------------------------------------------------------
// JNI_OnLoad 调用监控
// ------------------------------------------------------------
// JNI_OnLoad 位于动态加载的 SO 内部, 必须在其被 dlopen 载入后
// 才能解析到导出符号并挂钩。因此在每次 dlopen / android_dlopen_ext
// 返回后调用 scanForJniOnLoad() 扫描新载入的模块。
//
// jint JNI_OnLoad(JavaVM *vm, void *reserved);
const jniHookedModules = {};

function tryHookJniOnLoad(module) {
    if (!module || jniHookedModules[module.name]) {
        return;
    }

    let jniPtr = null;
    try {
        jniPtr = Module.findExportByName(module.name, "JNI_OnLoad");
    } catch (e) {
        return;
    }
    if (!jniPtr) {
        return;
    }

    jniHookedModules[module.name] = true;
    console.log("[+] JNI_OnLoad @ " + jniPtr + " in " + module.name);

    Interceptor.attach(jniPtr, {
        onEnter(args) {
            console.log("[FLAG] >> JNI_OnLoad.onEnter (before reads)");
            this.vm = args[0];
            this.reserved = args[1];
            console.log("==============================");
            console.log("[JNI_OnLoad] module   : " + module.name);
            console.log("[JNI_OnLoad] addr     : " + jniPtr +
                        " (" + module.name + " + 0x" + jniPtr.sub(module.base).toString(16) + ")");
            console.log("[JNI_OnLoad] JavaVM*  : " + this.vm);
            console.log("[JNI_OnLoad] reserved : " + this.reserved);
            // printBacktrace(this.context);
        },
        onLeave(retval) {
            // 返回值即支持的 JNI 版本 (如 0x10006 = JNI_VERSION_1_6)
            console.log("[JNI_OnLoad] ret(version): 0x" + retval.toInt32().toString(16));
            console.log("==============================");
        }
    });
}

function scanForJniOnLoad() {
    try {
        Process.enumerateModules().forEach(function (m) {
            tryHookJniOnLoad(m);
        });
    } catch (e) {
        console.log("[-] scanForJniOnLoad failed: " + e);
    }
}

function hookDlopen() {

    const dlopenPtr = Module.findExportByName(null, "dlopen");
    if (dlopenPtr) {
        console.log("[+] dlopen @ " + dlopenPtr);

        Interceptor.attach(dlopenPtr, {
            onEnter(args) {
                console.log("[FLAG] >> dlopen.onEnter (before reads)");
                this.path = args[0].isNull() ? "NULL" : Memory.readCString(args[0]);
                this.flag = args[1].toInt32();
                console.log("==============================");
                console.log("[dlopen] path : " + this.path);
                console.log("[dlopen] flags: 0x" + this.flag.toString(16));
                // printBacktrace(this.context);
            },
            onLeave(retval) {
                console.log("[dlopen] handle: " + retval);
                console.log("==============================");
                // SO 已载入, 尝试挂钩其 JNI_OnLoad
                scanForJniOnLoad();
            }
        });
    } else {
        console.log("[-] dlopen not found");
    }
}

function hookAndroidDlopenExt() {
    const extPtr = Module.findExportByName(null, "android_dlopen_ext");
    if (extPtr) {

        console.log("[+] android_dlopen_ext @ " + extPtr);

        Interceptor.attach(extPtr, {
            onEnter(args) {
                console.log("[FLAG] >> android_dlopen_ext.onEnter (before reads)");
                this.path = args[0].isNull() ? "NULL" : Memory.readCString(args[0]);
                this.flag = args[1].toInt32();
                this.extinfo = args[2];
                console.log("==============================");
                console.log("[android_dlopen_ext] path : " + this.path);
                console.log("[android_dlopen_ext] flags: 0x" + this.flag.toString(16));
                console.log("[android_dlopen_ext] extinfo: " + this.extinfo);
                // printBacktrace(this.context);
            },
            onLeave(retval) {
                console.log("[android_dlopen_ext] handle: " + retval);
                console.log("==============================");
                // SO 已载入, 尝试挂钩其 JNI_OnLoad
                scanForJniOnLoad();
            }
        });
    } else {
        console.log("[-] android_dlopen_ext not found");
    }
}

function hookLinkerInitArray() {
    // 全部偏移依据 linker64 反汇编核对 (base = 0x400000):
    //   __dl__ZN6soinfo17call_constructorsEv @ 0x461290 (RVA 0x61290, 崩溃栈 +608 吻合)
    //
    //   DT_INIT (单个 init 函数):
    //     0x461444  blr x20      => RVA 0x61444   (func = x20, soname = x21)
    //     0x461448  返回落点       => RVA 0x61448
    //
    //   DT_INIT_ARRAY (init_array[] 循环):
    //     0x461580  blr x28      => RVA 0x61580   (func = x28, soname = x20)
    //     0x461584  返回落点       => RVA 0x61584
    //
    // 注意: DT_INIT 先于 init_array 执行, 反调试可能藏在其中任意一处。
    const HOOKS = [
        { tag: "DT_INIT",       call: 0x61444, ret: 0x61448, funcReg: "x20", nameReg: "x21" },
        { tag: "DT_INIT_ARRAY", call: 0x61580, ret: 0x61584, funcReg: "x28", nameReg: "x20" },
    ];

    const linker = Process.findModuleByName("linker64");
    if (!linker) {
        console.log("[-] linker64 not found");
        return;
    }
    console.log("[+] linker64 @ " + linker.base + " (hook DT_INIT / DT_INIT_ARRAY)");

    // 单一栈, 按执行顺序配对 CALL/DONE (支持构造函数内部再触发 dlopen 的嵌套场景)
    let index = 0;
    const pending = [];

    function describe(func, sonamePtr) {
        let soname = "unknown";
        try {
            if (sonamePtr && !sonamePtr.isNull()) {
                soname = Memory.readCString(sonamePtr);
            }
        } catch (e) {
            soname = "<read soname failed>";
        }
        const shortName = soname.indexOf("/") >= 0
            ? soname.substring(soname.lastIndexOf("/") + 1)
            : soname;

        let module = "";
        let off = "";
        try {
            const m = Process.findModuleByAddress(func);
            if (m) {
                module = m.name;
                off = "0x" + func.sub(m.base).toString(16);
            }
        } catch (e) { }

        return { func: func, soname: shortName, module: module, off: off };
    }

    function locStr(info) {
        return info.module ? (info.module + " + " + info.off) : "<unknown module>";
    }

    HOOKS.forEach(function (h) {
        const callAddr = linker.base.add(h.call);
        const retAddr = linker.base.add(h.ret);

        // 调用前: 打印 CALL
        Interceptor.attach(callAddr, {
            onEnter(args) {
                console.log("[FLAG] >> linker CALL hook (" + h.tag + ") onEnter (before reads)");
                const info = describe(this.context[h.funcReg], this.context[h.nameReg]);
                info.id = ++index;
                info.tag = h.tag;
                pending.push(info);
                console.log(">>> [#" + info.id + "] CALL " + h.tag + " @ " +
                            info.func + " (" + locStr(info) + ") for '" + info.soname + "'");
            }
        });

        // 调用返回后: 打印 DONE
        // 若某函数触发反调试导致崩溃/挂起, 它的 DONE 永远不会出现 ——
        // 那条 "只有 CALL 没有 DONE" 的记录就是反调试点。
        Interceptor.attach(retAddr, {
            onEnter(args) {
                console.log("[FLAG] >> linker RET hook (" + h.tag + ") onEnter (before reads)");
                const info = pending.pop();
                if (!info) {
                    return;
                }
                console.log("<<< [#" + info.id + "] DONE " + info.tag + " @ " +
                            info.func + " (" + locStr(info) + ") for '" + info.soname + "'");
            }
        });
    });
}

function hookPthreadCreate() {
    const pthreadCreatePtr = Module.findExportByName(null, "pthread_create");
    if (!pthreadCreatePtr) {
        console.log("[-] pthread_create not found");
        return;
    }
    console.log("[+] pthread_create @ " + pthreadCreatePtr);

    let threadIndex = 0;

    // int pthread_create(pthread_t *thread, const pthread_attr_t *attr,
    //                    void *(*start_routine)(void *), void *arg);
    Interceptor.attach(pthreadCreatePtr, {
        onEnter(args) {
            console.log("[FLAG] >> pthread_create.onEnter (before reads)");
            this.id = ++threadIndex;
            const startRoutine = args[2];
            const arg = args[3];

            // 解析 start_routine 所属模块 + 偏移, 便于定位反调试线程入口
            let loc = "<unknown module>";
            try {
                const m = Process.findModuleByAddress(startRoutine);
                if (m) {
                    loc = m.name + " + 0x" + startRoutine.sub(m.base).toString(16);
                }
            } catch (e) { }

            let sym = "";
            try {
                sym = DebugSymbol.fromAddress(startRoutine).toString();
            } catch (e) { }

            console.log("==============================");
            console.log("[pthread_create] #" + this.id + " start_routine: " + startRoutine +
                        " (" + loc + ")");
            if (sym) {
                console.log("[pthread_create] #" + this.id + " symbol       : " + sym);
            }
            console.log("[pthread_create] #" + this.id + " arg          : " + arg);
            // printBacktrace(this.context);
        },
        onLeave(retval) {
            console.log("[pthread_create] #" + this.id + " ret: " + retval.toInt32());
            console.log("==============================");
        }
    });
}

// 把地址解析成 模块 + 偏移, 便于定位线程/进程入口所在 SO
function resolveLoc(addr) {
    try {
        if (!addr || addr.isNull()) return "NULL";
        const m = Process.findModuleByAddress(addr);
        if (m) {
            return m.name + " + 0x" + addr.sub(m.base).toString(16);
        }
    } catch (e) { }
    return "<unknown module>";
}

function hookBionicClone() {
    const ptr = Module.findExportByName(null, "__bionic_clone");
    if (!ptr) {
        console.log("[-] __bionic_clone not found");
        return;
    }
    console.log("[+] __bionic_clone @ " + ptr);

    let idx = 0;

    // int __bionic_clone(uint32_t flags, void* child_stack, int* parent_tid,
    //                    void* tls, int* child_tid, int (*fn)(void*), void* arg);
    // (反编译展示为 9 个 int64 参数, 这里按 bionic 语义逐一解析)
    Interceptor.attach(ptr, {
        onEnter(args) {
            console.log("[FLAG] >> __bionic_clone.onEnter (before reads)");
            this.id = ++idx;
            const flags = args[0];
            const childStack = args[1];
            const fn = args[5];   // 子线程/进程入口
            const arg = args[6];

            let sym = "";
            try { sym = DebugSymbol.fromAddress(fn).toString(); } catch (e) { }

            console.log("==============================");
            console.log("[__bionic_clone] #" + this.id + " flags       : 0x" + flags.toString(16));
            console.log("[__bionic_clone] #" + this.id + " child_stack : " + childStack);
            console.log("[__bionic_clone] #" + this.id + " fn          : " + fn +
                        " (" + resolveLoc(fn) + ")");
            if (sym) {
                console.log("[__bionic_clone] #" + this.id + " symbol      : " + sym);
            }
            console.log("[__bionic_clone] #" + this.id + " arg         : " + arg);
            // printBacktrace(this.context);
        },
        onLeave(retval) {
            console.log("[__bionic_clone] #" + this.id + " ret(tid): " + retval.toInt32());
            console.log("==============================");
        }
    });
}

function hookClone() {
    const ptr = Module.findExportByName(null, "clone");
    if (!ptr) {
        console.log("[-] clone not found");
        return;
    }
    console.log("[+] clone @ " + ptr);

    let idx = 0;

    // int clone(int (*fn)(void*), void* child_stack, int flags, void* arg, ...);
    Interceptor.attach(ptr, {
        onEnter(args) {
            console.log("[FLAG] >> clone.onEnter (before reads)");
            this.id = ++idx;
            const fn = args[0];         // 子线程/进程入口
            const childStack = args[1];
            const flags = args[2];
            const arg = args[3];

            let sym = "";
            try { sym = DebugSymbol.fromAddress(fn).toString(); } catch (e) { }

            console.log("==============================");
            console.log("[clone] #" + this.id + " fn          : " + fn +
                        " (" + resolveLoc(fn) + ")");
            if (sym) {
                console.log("[clone] #" + this.id + " symbol      : " + sym);
            }
            console.log("[clone] #" + this.id + " child_stack : " + childStack);
            console.log("[clone] #" + this.id + " flags       : 0x" + flags.toInt32().toString(16));
            console.log("[clone] #" + this.id + " arg         : " + arg);
            // printBacktrace(this.context);
        },
        onLeave(retval) {
            console.log("[clone] #" + this.id + " ret: " + retval.toInt32());
            console.log("==============================");
        }
    });
}

setImmediate(function () {
    hookDlopen();
    hookAndroidDlopenExt();
    hookLinkerInitArray();
    hookPthreadCreate();
    hookBionicClone();
    hookClone();
    // 挂钩已载入模块的 JNI_OnLoad (后续 dlopen 载入的由 onLeave 兜底)
    scanForJniOnLoad();
});