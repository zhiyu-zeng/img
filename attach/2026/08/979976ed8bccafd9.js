'use strict';

/*
 * frida -U -f com.chaoxing.mobile -l hook_func.js
 *
 * 适配：
 *   Android arm64
 *   Frida 16.x
 *   linker64 反汇编基址 0x400000
 */

const TARGET_SO = 'libDexHelper.so';

/*
 * IDA 里显示：
 *   sub_431bc4 @ 0x431bc4
 *   sub_457c58 @ 0x457c58
 *
 * 若 IDA image base = 0x400000，则 Frida offset 为：
 *   0x431bc4 - 0x400000 = 0x31bc4
 *   0x457c58 - 0x400000 = 0x57c58
 */
const TARGET_FUNCS = [
    {
        name: 'sub_431bc4',
        offset: 0x31bc4,
        retType: 'void',
    },
    {
        name: 'sub_457c58',
        offset: 0x57c58,
        retType: 'int64',
    },
];

let targetHooked = false;
let linkerHooked = false;
let seq = 0;

/*
 * 如果你确认 IDA 没有 0x400000 image base，而 0x431bc4 本身就是 RVA，
 * 把上面的 offset 改回：
 *
 *   sub_431bc4: 0x431bc4
 *   sub_457c58: 0x457c58
 */

function log(s) {
    console.log('[DexHelperHook] ' + s);
}

function safeReadCString(p) {
    try {
        if (p && !p.isNull()) {
            return Memory.readCString(p);
        }
    } catch (e) {}
    return null;
}

function shortSoName(path) {
    if (!path) {
        return 'unknown';
    }
    const idx = path.lastIndexOf('/');
    if (idx >= 0) {
        return path.substring(idx + 1);
    }
    return path;
}

function ptrInRange(mod, addr) {
    return addr.compare(mod.base) >= 0 &&
           addr.compare(mod.base.add(mod.size)) < 0;
}

function moduleOffsetString(addr) {
    try {
        const m = Process.findModuleByAddress(addr);
        if (!m) {
            return '<unknown module>';
        }
        return m.name + ' + 0x' + addr.sub(m.base).toString(16);
    } catch (e) {
        return '<unknown module>';
    }
}

function printBacktrace(context) {
    let bt = [];

    try {
        bt = Thread.backtrace(context, Backtracer.ACCURATE);
    } catch (e) {
        try {
            bt = Thread.backtrace(context, Backtracer.FUZZY);
        } catch (_) {
            console.log('Backtrace failed: ' + e);
            return;
        }
    }

    console.log('Backtrace:');
    bt.forEach(function (addr, i) {
        let sym = '';
        try {
            sym = DebugSymbol.fromAddress(addr).toString();
        } catch (e) {
            sym = moduleOffsetString(addr);
        }
        console.log('    #' + i + ' ' + addr + ' ' + sym);
    });
}

function dumpTargetFuncArgs(name, args) {
    if (name === 'sub_431bc4') {
        /*
         * void sub_431bc4(int32_t arg1, int32_t arg2, int64_t arg3)
         */
        console.log('arg1 = ' + args[0].toInt32());
        console.log('arg2 = ' + args[1].toInt32());
        console.log('arg3 = ' + args[2]);
        return;
    }

    if (name === 'sub_457c58') {
        /*
         * int64_t sub_457c58(int64_t arg1, int32_t arg2, void* arg3)
         */
        console.log('arg1 = ' + args[0]);
        console.log('arg2 = ' + args[1].toInt32());
        console.log('arg3 = ' + args[2]);
        return;
    }

    console.log('x0 = ' + args[0]);
    console.log('x1 = ' + args[1]);
    console.log('x2 = ' + args[2]);
    console.log('x3 = ' + args[3]);
}

function hookTargetFunctions(reason) {
    if (targetHooked) {
        return true;
    }

    const mod = Process.findModuleByName(TARGET_SO);
    if (!mod) {
        return false;
    }

    log('Hooking ' + TARGET_SO + ', reason=' + reason);
    log('base=' + mod.base + ', size=0x' + mod.size.toString(16) + ', path=' + mod.path);

    const targets = [];

    for (let i = 0; i < TARGET_FUNCS.length; i++) {
        const item = TARGET_FUNCS[i];
        const addr = mod.base.add(item.offset);

        log(item.name + ' offset=0x' + item.offset.toString(16) + ', addr=' + addr);

        if (!ptrInRange(mod, addr)) {
            log('[-] ' + item.name + ' out of module range, skip all hooks');
            log('    module range: ' + mod.base + ' - ' + mod.base.add(mod.size));
            return false;
        }

        targets.push({
            name: item.name,
            addr: addr,
            retType: item.retType,
        });
    }

    for (let j = 0; j < targets.length; j++) {
        const t = targets[j];

        Interceptor.attach(t.addr, {
            onEnter(args) {
                console.log('');
                console.log('========== ENTER ' + t.name + ' ==========');
                console.log('addr = ' + t.addr + ' (' + moduleOffsetString(t.addr) + ')');

                dumpTargetFuncArgs(t.name, args);

                console.log('---- registers ----');
                console.log('pc = ' + this.context.pc);
                console.log('lr = ' + this.context.lr);
                console.log('sp = ' + this.context.sp);

                printBacktrace(this.context);
            },

            onLeave(retval) {
                if (t.retType !== 'void') {
                    console.log('========== LEAVE ' + t.name + ' ==========');
                    console.log('retval = ' + retval);
                }
            }
        });

        log('[+] attached ' + t.name + ' @ ' + t.addr);
    }

    targetHooked = true;
    log('[+] target hooks installed');
    return true;
}

function describeInitCall(func, sonamePtr) {
    let soname = safeReadCString(sonamePtr);
    if (!soname) {
        soname = 'unknown';
    }

    const shortName = shortSoName(soname);

    let moduleName = '';
    let offset = '';
    let modulePath = '';

    try {
        const m = Process.findModuleByAddress(func);
        if (m) {
            moduleName = m.name;
            modulePath = m.path;
            offset = '0x' + func.sub(m.base).toString(16);
        }
    } catch (e) {}

    return {
        func: func,
        soname: shortName,
        sonameRaw: soname,
        module: moduleName,
        modulePath: modulePath,
        off: offset,
    };
}

function isTargetInitInfo(info) {
    if (!info) {
        return false;
    }

    if (info.soname === TARGET_SO) {
        return true;
    }

    if (info.module === TARGET_SO) {
        return true;
    }

    if (info.sonameRaw && info.sonameRaw.indexOf(TARGET_SO) !== -1) {
        return true;
    }

    if (info.modulePath && info.modulePath.indexOf(TARGET_SO) !== -1) {
        return true;
    }

    return false;
}

function locStr(info) {
    if (info.module) {
        return info.module + ' + ' + info.off;
    }
    return '<unknown module>';
}

function getThreadStack(map, tid) {
    let s = map[tid];
    if (!s) {
        s = [];
        map[tid] = s;
    }
    return s;
}

function hookLinkerInitArray() {
    if (linkerHooked) {
        return;
    }

    /*
     * 全部偏移依据 linker64 反汇编核对，IDA base = 0x400000：
     *
     *   __dl__ZN6soinfo17call_constructorsEv @ 0x461290
     *   RVA = 0x61290
     *
     *   DT_INIT:
     *     0x461444  blr x20      => RVA 0x61444
     *     0x461448  返回落点     => RVA 0x61448
     *     func = x20
     *     soname = x21
     *
     *   DT_INIT_ARRAY:
     *     0x461580  blr x28      => RVA 0x61580
     *     0x461584  返回落点     => RVA 0x61584
     *     func = x28
     *     soname = x20
     */
    const HOOKS = [
        {
            tag: 'DT_INIT',
            call: 0x61444,
            ret: 0x61448,
            funcReg: 'x20',
            nameReg: 'x21',
        },
        {
            tag: 'DT_INIT_ARRAY',
            call: 0x61580,
            ret: 0x61584,
            funcReg: 'x28',
            nameReg: 'x20',
        },
    ];

    const linker = Process.findModuleByName('linker64');
    if (!linker) {
        log('[-] linker64 not found');
        return;
    }

    log('[+] linker64 @ ' + linker.base + ', size=0x' + linker.size.toString(16));
    log('[+] hook DT_INIT / DT_INIT_ARRAY call sites');

    const pendingByTid = {};

    HOOKS.forEach(function (h) {
        const callAddr = linker.base.add(h.call);
        const retAddr = linker.base.add(h.ret);

        if (!ptrInRange(linker, callAddr)) {
            log('[-] ' + h.tag + ' callAddr out of range: ' + callAddr);
            return;
        }

        if (!ptrInRange(linker, retAddr)) {
            log('[-] ' + h.tag + ' retAddr out of range: ' + retAddr);
            return;
        }

        log('[+] ' + h.tag + ' call hook @ ' + callAddr + ' linker64 + 0x' + h.call.toString(16));
        log('[+] ' + h.tag + ' ret  hook @ ' + retAddr + ' linker64 + 0x' + h.ret.toString(16));

        /*
         * 调用前：
         *   当前 PC 命中 blr 指令地址。
         *   这时 x20/x28 仍然保存着即将被调用的 init 函数地址。
         *
         * 关键点：
         *   如果这个 init 函数属于 libDexHelper.so，就在 blr 真正执行前安装目标函数 hook。
         */
        Interceptor.attach(callAddr, {
            onEnter(args) {
                const tid = this.threadId;
                const stack = getThreadStack(pendingByTid, tid);

                let func = ptr(0);
                let sonamePtr = ptr(0);

                try {
                    func = this.context[h.funcReg];
                    sonamePtr = this.context[h.nameReg];
                } catch (e) {}

                const info = describeInitCall(func, sonamePtr);
                info.id = ++seq;
                info.tag = h.tag;
                info.tid = tid;

                stack.push(info);

                const line =
                    '>>> [#' + info.id + '] CALL ' + h.tag +
                    ' @ ' + info.func +
                    ' (' + locStr(info) + ')' +
                    " for '" + info.soname + "'" +
                    ' tid=' + tid;

                if (isTargetInitInfo(info)) {
                    console.log('');
                    console.log('[DexHelperHook] [TARGET INIT] ' + line);

                    /*
                     * 这里是最关键的位置：
                     * libDexHelper.so 已经 map 完成，constructor 还没真正 blr 进去。
                     * 此时 hook base + offset，能覆盖 init 中即将调用的目标函数。
                     */
                    hookTargetFunctions('before ' + h.tag + ' constructor call');

                    console.log('[DexHelperHook] Target init caller backtrace:');
                    printBacktrace(this.context);
                } else {
                    /*
                     * 如果你想看所有 so 的 init 调用，可以取消下面这行注释。
                     */
                    // console.log(line);
                }
            }
        });

        /*
         * 调用返回后：
         *   如果某个 constructor 内反调试导致崩溃/退出/卡死，
         *   对应的 DONE 不会出现。
         */
        Interceptor.attach(retAddr, {
            onEnter(args) {
                const tid = this.threadId;
                const stack = getThreadStack(pendingByTid, tid);
                const info = stack.pop();

                if (!info) {
                    return;
                }

                if (isTargetInitInfo(info)) {
                    console.log(
                        '[DexHelperHook] <<< [#' + info.id + '] DONE ' + info.tag +
                        ' @ ' + info.func +
                        ' (' + locStr(info) + ')' +
                        " for '" + info.soname + "'" +
                        ' tid=' + tid
                    );
                }
            }
        });
    });

    linkerHooked = true;
}

function hookDlopenFallback() {
    const names = [
        'android_dlopen_ext',
        'dlopen',
    ];

    names.forEach(function (name) {
        const addr = Module.findExportByName(null, name);
        if (!addr) {
            return;
        }

        log('[+] hook ' + name + ' @ ' + addr);

        Interceptor.attach(addr, {
            onEnter(args) {
                this.path = null;

                try {
                    if (args[0] && !args[0].isNull()) {
                        this.path = Memory.readCString(args[0]);
                    }
                } catch (e) {}

                if (this.path && this.path.indexOf(TARGET_SO) !== -1) {
                    log(name + ' onEnter: ' + this.path);
                }
            },

            onLeave(retval) {
                if (this.path && this.path.indexOf(TARGET_SO) !== -1) {
                    log(name + ' onLeave: ' + this.path + ', retval=' + retval);

                    /*
                     * 注意：
                     * 这里通常已经晚于 DT_INIT / DT_INIT_ARRAY。
                     * 只是兜底，防止 linker call-site hook 没命中。
                     */
                    hookTargetFunctions(name + '.onLeave fallback');
                }
            }
        });
    });
}

function hookLinkerSymbolFallback() {
    /*
     * 有些系统 linker64 的 call site 偏移不一致。
     * 这个 fallback 尝试通过符号名找 call_constructors / call_array / call_function。
     * 如果系统符号被裁剪，可能找不到，没关系。
     */
    const linker = Process.findModuleByName('linker64');
    if (!linker) {
        return;
    }

    let symbols = [];
    try {
        symbols = linker.enumerateSymbols();
    } catch (e) {
        return;
    }

    symbols.forEach(function (sym) {
        const n = sym.name || '';

        const interesting =
            n.indexOf('call_constructors') !== -1 ||
            n.indexOf('call_array') !== -1 ||
            n.indexOf('call_function') !== -1;

        if (!interesting) {
            return;
        }

        log('[+] linker symbol fallback found: ' + n + ' @ ' + sym.address);
    });
}

function main() {
    log('script loaded');

    /*
     * 如果脚本加载时目标 so 已经在内存中，先尝试直接 hook。
     * 这种情况可能已经错过 init，但能覆盖后续调用。
     */
    hookTargetFunctions('already loaded');

    /*
     * 关键 hook：
     * 在 linker64 执行 DT_INIT / DT_INIT_ARRAY 的 blr 前拦截。
     */
    hookLinkerInitArray();

    /*
     * 打印一下符号 fallback 信息，辅助确认当前系统 linker 情况。
     */
    hookLinkerSymbolFallback();

    /*
     * 兜底。
     */
    hookDlopenFallback();

    log('init done');
}

setImmediate(main);
