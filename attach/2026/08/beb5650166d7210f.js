'use strict';

const TARGET_SO = "libDexHelper.so";
const OUT_DIR = "/data/data/com.chaoxing.mobile/files";

const NR_OPENAT = 56;
const NR_CLOSE = 57;
const NR_WRITE = 64;
const NR_GETPID = 172;
const NR_MPROTECT = 226;

const AT_FDCWD = ptr("0xffffffffffffff9c");

const O_WRONLY = 0x1;
const O_CREAT = 0x40;
const O_TRUNC = 0x200;
const MODE_0600 = 0x180;

const PROT_READ = 1;
const PROT_WRITE = 2;
const PROT_EXEC = 4;

let dumped = false;
let jniHooked = false;
let rawSyscall = null;
let rawSyscallCode = null;

function log(s) {
    console.log("[JniDump] " + s);
}

function safeReadCString(p) {
    try {
        if (!p || p.isNull()) return null;
        return p.readCString();
    } catch (e) {
        return null;
    }
}

function ptrToModuleOffset(addr) {
    try {
        const m = Process.findModuleByAddress(addr);
        if (m) {
            return m.name + " + 0x" + ptr(addr).sub(m.base).toString(16);
        }
    } catch (e) { }
    return "unknown @ " + addr;
}

function makeRawSyscall() {
    if (rawSyscall) return rawSyscall;

    if (Process.arch !== "arm64") {
        throw new Error("Only arm64 supported, current: " + Process.arch);
    }

    const pageSize = Process.pageSize;
    rawSyscallCode = Memory.alloc(pageSize);

    Memory.protect(rawSyscallCode, pageSize, "rwx");

    Memory.patchCode(rawSyscallCode, pageSize, function (pc) {
        const w = new Arm64Writer(pc, { pc: rawSyscallCode });

        w.putMovRegReg("x8", "x0");

        w.putMovRegReg("x0", "x1");
        w.putMovRegReg("x1", "x2");
        w.putMovRegReg("x2", "x3");
        w.putMovRegReg("x3", "x4");
        w.putMovRegReg("x4", "x5");
        w.putMovRegReg("x5", "x6");

        w.putInstruction(0xd4000001);
        w.putRet();
        w.flush();
    });

    Memory.protect(rawSyscallCode, pageSize, "rwx");

    rawSyscall = new NativeFunction(
        rawSyscallCode,
        "pointer",
        [
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer",
            "pointer"
        ],
        {
            exceptions: "propagate"
        }
    );

    log("raw syscall stub: " + rawSyscallCode);
    return rawSyscall;
}

function syscall6(nr, a0, a1, a2, a3, a4, a5) {
    if (!rawSyscall) makeRawSyscall();

    return rawSyscall(
        ptr(nr),
        a0,
        a1,
        a2,
        a3,
        a4,
        a5
    );
}

function retToInt(ret) {
    try {
        if (ret.compare(ptr("0xfffffffffffff000")) >= 0) {
            return ret.toInt32();
        }
        return ret.toUInt32();
    } catch (e) {
        return parseInt(ret.toString(), 16);
    }
}

function testSyscall() {
    try {
        const ret = syscall6(
            NR_GETPID,
            ptr(0),
            ptr(0),
            ptr(0),
            ptr(0),
            ptr(0),
            ptr(0)
        );
        log("getpid syscall ret: " + ret + " / " + retToInt(ret));
    } catch (e) {
        log("getpid syscall failed: " + e);
    }
}

function sysOpenAt(path, flags, mode) {
    const p = Memory.allocUtf8String(path);

    const ret = syscall6(
        NR_OPENAT,
        AT_FDCWD,
        p,
        ptr(flags),
        ptr(mode),
        ptr(0),
        ptr(0)
    );

    return retToInt(ret);
}

function sysWrite(fd, buf, size) {
    const ret = syscall6(
        NR_WRITE,
        ptr(fd),
        buf,
        ptr(size),
        ptr(0),
        ptr(0),
        ptr(0)
    );

    return retToInt(ret);
}

function sysClose(fd) {
    const ret = syscall6(
        NR_CLOSE,
        ptr(fd),
        ptr(0),
        ptr(0),
        ptr(0),
        ptr(0),
        ptr(0)
    );

    return retToInt(ret);
}

function sysMprotect(addr, size, prot) {
    const ret = syscall6(
        NR_MPROTECT,
        addr,
        ptr(size),
        ptr(prot),
        ptr(0),
        ptr(0),
        ptr(0)
    );

    return retToInt(ret);
}

function protFromRangeProtection(protection) {
    let prot = 0;

    if (!protection) return PROT_READ;

    if (protection.indexOf("r") !== -1) prot |= PROT_READ;
    if (protection.indexOf("w") !== -1) prot |= PROT_WRITE;
    if (protection.indexOf("x") !== -1) prot |= PROT_EXEC;

    prot |= PROT_READ;
    return prot;
}

function makePageReadable(page) {
    const pageSize = Process.pageSize;
    page = ptr(page);

    let oldProt = null;

    try {
        const r = Process.findRangeByAddress(page);
        if (r) oldProt = r.protection;
    } catch (e) {
        oldProt = null;
    }

    if (oldProt && oldProt.indexOf("r") !== -1) {
        return true;
    }

    const candidates = [];

    if (oldProt) {
        candidates.push(protFromRangeProtection(oldProt));
    }

    candidates.push(PROT_READ | PROT_EXEC);
    candidates.push(PROT_READ);
    candidates.push(PROT_READ | PROT_WRITE | PROT_EXEC);

    const tried = {};

    for (let i = 0; i < candidates.length; i++) {
        const prot = candidates[i];

        if (tried[prot]) continue;
        tried[prot] = true;

        const ret = sysMprotect(page, pageSize, prot);
        if (ret === 0) return true;
    }

    log("mprotect failed at " + page + ", old prot: " + oldProt);
    return false;
}

function mprotectWholeModule(base, size) {
    const pageSize = Process.pageSize;

    let off = 0;
    let total = 0;
    let ok = 0;
    let fail = 0;

    log("mprotect whole module readable");

    while (off < size) {
        const page = base.add(off);
        total++;

        if (makePageReadable(page)) {
            ok++;
        } else {
            fail++;
            log("mprotect failed at module offset 0x" + off.toString(16));
        }

        off += pageSize;
    }

    log("mprotect pages total=" + total + " ok=" + ok + " fail=" + fail);
}

function writeAll(fd, buf, size) {
    let written = 0;

    while (written < size) {
        const p = buf.add(written);
        const left = size - written;
        const n = sysWrite(fd, p, left);

        if (n < 0) {
            log("write failed ret=" + n);
            return false;
        }

        if (n === 0) {
            log("write returned 0");
            return false;
        }

        written += n;
    }

    return true;
}

function dumpModule(reason) {
    if (dumped) return;

    const m = Process.findModuleByName(TARGET_SO);

    if (!m) {
        log("module not found: " + TARGET_SO);
        return;
    }

    dumped = true;

    const base = m.base;
    const size = m.size;
    const outPath = OUT_DIR + "/" + TARGET_SO + "_" + base + "_after_JNI_OnLoad_memdump.so";

    log("========================================");
    log("dump reason: " + reason);
    log("module: " + m.name);
    log("base: " + base);
    log("size: 0x" + size.toString(16));
    log("path: " + m.path);
    log("out : " + outPath);

    const fd = sysOpenAt(
        outPath,
        O_WRONLY | O_CREAT | O_TRUNC,
        MODE_0600
    );

    if (fd < 0) {
        log("openat failed ret=" + fd);
        if (fd === -13) log("EACCES: output dir not writable by app uid");
        log("========================================");
        return;
    }

    log("fd: " + fd);

    mprotectWholeModule(base, size);

    const pageSize = Process.pageSize;
    const tmp = Memory.alloc(pageSize);
    const zero = Memory.alloc(pageSize);

    Memory.writeByteArray(zero, new Uint8Array(pageSize));

    let off = 0;
    let failed = false;
    let unreadableBeforeRetry = 0;
    let zeroFilled = 0;

    while (off < size) {
        const left = size - off;
        const readSize = left > pageSize ? pageSize : left;
        const src = base.add(off);

        let readOk = false;

        try {
            Memory.copy(tmp, src, readSize);
            readOk = true;
        } catch (e1) {
            unreadableBeforeRetry++;
            log("read failed offset=0x" + off.toString(16) + ", retry mprotect");

            if (makePageReadable(src)) {
                try {
                    Memory.copy(tmp, src, readSize);
                    readOk = true;
                    log("retry read ok offset=0x" + off.toString(16));
                } catch (e2) {
                    log("retry read failed offset=0x" + off.toString(16) + " " + e2);
                }
            }
        }

        if (readOk) {
            if (!writeAll(fd, tmp, readSize)) {
                failed = true;
                break;
            }
        } else {
            zeroFilled++;
            log("fill zero offset=0x" + off.toString(16));

            if (!writeAll(fd, zero, readSize)) {
                failed = true;
                break;
            }
        }

        off += readSize;
    }

    try {
        sysClose(fd);
    } catch (e) {
        log("close failed: " + e);
    }

    if (failed) {
        log("dump stopped early");
    } else {
        log("dump finished");
    }

    log("saved: " + outPath);
    log("unreadable before retry: " + unreadableBeforeRetry);
    log("zero filled pages: " + zeroFilled);
    log("========================================");
}

function findJNIOnLoadAddress(moduleName) {
    let addr = Module.findExportByName(moduleName, "JNI_OnLoad");

    if (addr) {
        return addr;
    }

    const m = Process.findModuleByName(moduleName);
    if (!m) return null;

    try {
        const symbols = m.enumerateSymbols();

        for (let i = 0; i < symbols.length; i++) {
            if (symbols[i].name === "JNI_OnLoad") {
                return symbols[i].address;
            }
        }
    } catch (e) { }

    return null;
}

function hookJNIOnLoad() {
    if (jniHooked) return;

    const m = Process.findModuleByName(TARGET_SO);

    if (!m) {
        log("target module not found when hook JNI_OnLoad");
        return;
    }

    const jni = findJNIOnLoadAddress(TARGET_SO);

    if (!jni) {
        log("JNI_OnLoad not found in " + TARGET_SO);
        log("fallback: dump immediately after dlopen");
        dumpModule("JNI_OnLoad not found, fallback after dlopen");
        return;
    }

    jniHooked = true;

    log("hook JNI_OnLoad at " + jni + " / " + ptrToModuleOffset(jni));

    Interceptor.attach(jni, {
        onEnter(args) {
            this.vm = args[0];
            this.reserved = args[1];

            log("========================================");
            log("JNI_OnLoad enter");
            log("addr: " + jni);
            log("offset: " + ptrToModuleOffset(jni));
            log("vm: " + this.vm);
            log("reserved: " + this.reserved);
            log("caller: " + this.returnAddress);
            log("caller offset: " + ptrToModuleOffset(this.returnAddress));
            log("dump at JNI_OnLoad enter");
            log("========================================");

            dumpModule("JNI_OnLoad_enter");
        }
    });
}

function hookDlopen(name) {
    const addr = Module.findExportByName(null, name);

    if (!addr) {
        log(name + " not found");
        return;
    }

    log("hook " + name + " at " + addr);

    Interceptor.attach(addr, {
        onEnter(args) {
            this.funcName = name;
            this.path = safeReadCString(args[0]);
            this.isTarget = false;

            if (this.path && this.path.indexOf(TARGET_SO) !== -1) {
                this.isTarget = true;

                log("========================================");
                log(name + " loading target");
                log("path: " + this.path);
                log("caller: " + this.returnAddress);
                log("offset: " + ptrToModuleOffset(this.returnAddress));
                log("========================================");
            }
        },

        onLeave(retval) {
            if (!this.isTarget) return;

            log(this.funcName + " returned: " + retval);
            log("target loaded, try hook JNI_OnLoad before ART calls it");

            hookJNIOnLoad();
        }
    });
}

function main() {
    log("script loaded");
    log("arch: " + Process.arch);

    makeRawSyscall();
    testSyscall();

    const m = Process.findModuleByName(TARGET_SO);

    if (m) {
        log(TARGET_SO + " already loaded");
        log("try hook JNI_OnLoad, but it may have already executed");
        hookJNIOnLoad();
        return;
    }

    hookDlopen("android_dlopen_ext");
    hookDlopen("dlopen");
}

setImmediate(main);