'use strict';

const targetSo = "libDexHelper.so";
const maxTraceCount = 50000;
const printDisasm = true;
const stopOnReturn = true;

// 触发 trace 的 offset（相对 libDexHelper.so base）
// 只有当 prereqOffsets 里所有 offset 都走过之后，
// 再次执行流到达该 offset 时，才开始打印 trace。
// 修改为你需要的 offset，例如 0x12345
const traceStartOffset = ptr("0x385f0");

// 前置 offset 列表（相对 libDexHelper.so base）
// 必须列表里的每个 offset 都被执行过，才允许触发 traceStartOffset。
// 例如: ["0x1000", "0x2000", "0x3000"]
const prereqOffsets = [0x35968];

// 已命中的前置 offset 集合（存字符串形式的 offset）
const prereqHit = {};
let prereqRemaining = 0;

let targetModule = null;
let base = null;
let end = null;
let hookedJni = false;
let traceCount = 0;
let traceTid = null;
let tracingStarted = false;

function updateModule() {
    targetModule = Process.findModuleByName(targetSo);
    if (!targetModule) return false;

    base = targetModule.base;
    end = base.add(targetModule.size);
    return true;
}

function inTarget(addr) {
    return base && end && addr.compare(base) >= 0 && addr.compare(end) < 0;
}

function offsetOf(addr) {
    return addr.sub(base);
}

function isStartPoint(addr) {
    // offset 完全匹配触发点
    return offsetOf(addr).compare(traceStartOffset) === 0;
}

function initPrereqs() {
    // 归一化前置 offset，重置命中状态
    for (const k in prereqHit) delete prereqHit[k];
    prereqRemaining = 0;

    prereqOffsets.forEach(function (o) {
        const key = ptr(o).toString();
        if (!(key in prereqHit)) {
            prereqHit[key] = false;
            prereqRemaining++;
        }
    });
}

function allPrereqsDone() {
    return prereqRemaining === 0;
}

function markPrereq(addr) {
    // 若当前 offset 属于未命中的前置点，则标记命中
    if (prereqRemaining === 0) return;
    const key = offsetOf(addr).toString();
    if (key in prereqHit && prereqHit[key] === false) {
        prereqHit[key] = true;
        prereqRemaining--;
        console.log("[prereq] 命中前置 offset " + key + "，剩余 " + prereqRemaining);
        if (prereqRemaining === 0) {
            console.log("[prereq] 所有前置 offset 已命中，等待触发 offset " + traceStartOffset);
        }
    }
}

function hookJniOnLoad(addr, reason) {
    if (hookedJni) return;
    if (!addr || addr.isNull()) return;
    if (!updateModule()) return;

    hookedJni = true;

    console.log("\n[+] Hook JNI_OnLoad by " + reason);
    console.log("    base           = " + base);
    console.log("    JNI_OnLoad     = " + addr);
    console.log("    offset         = " + offsetOf(addr));
    console.log("    traceStartOff  = " + traceStartOffset);
    console.log("    traceStartAddr = " + base.add(traceStartOffset));
    console.log("");

    Interceptor.attach(addr, {
        onEnter(args) {
            console.log("[+] JNI_OnLoad entered");
            console.log("    tid      = " + this.threadId);
            console.log("    JavaVM   = " + args[0]);
            console.log("    reserved = " + args[1]);

            startTrace(this.threadId);
        },

        onLeave(retval) {
            console.log("\n[+] JNI_OnLoad leave, retval = " + retval);

            if (stopOnReturn && traceTid !== null) {
                try {
                    Stalker.unfollow(traceTid);
                    Stalker.garbageCollect();
                    console.log("[+] Stalker stopped");
                } catch (e) {
                    console.log("[-] Stalker stop failed: " + e);
                }
            }
        }
    });
}

function startTrace(tid) {
    traceTid = tid;
    traceCount = 0;
    tracingStarted = false;

    initPrereqs();

    console.log("[+] Start Stalker, tid = " + tid);
    if (prereqOffsets.length > 0) {
        console.log("[+] 需先命中 " + prereqRemaining + " 个前置 offset，再到 offset " + traceStartOffset + " 才开始 trace");
    } else {
        console.log("[+] 等待执行到 offset " + traceStartOffset + " 之后开始 trace");
    }

    Stalker.follow(tid, {
        events: {
            call: false,
            ret: false,
            exec: false,
            block: false,
            compile: false
        },

        transform(iterator) {
            let insn;

            while ((insn = iterator.next()) !== null) {
                const addr = insn.address;

                if (inTarget(addr)) {
                    const offStr = offsetOf(addr).toString();
                    const addrStr = addr.toString();
                    const isStart = isStartPoint(addr);
                    const text = printDisasm
                        ? targetSo + "+" + offStr + "  " + addrStr + "  " + insn.mnemonic + " " + insn.opStr
                        : targetSo + "+" + offStr;

                    iterator.putCallout(function () {
                        // 到达触发点之前不打印
                        if (!tracingStarted) {
                            // 先记录前置 offset 的命中情况
                            markPrereq(addr);

                            // 只有所有前置 offset 都走过，且到达触发点，才开始 trace
                            if (isStart && allPrereqsDone()) {
                                tracingStarted = true;
                                console.log("\n[+] 前置条件已满足，到达触发 offset " + traceStartOffset + "，开始 trace\n");
                            } else {
                                return;
                            }
                        }

                        if (traceCount < maxTraceCount) {
                            console.log(text);
                            traceCount++;
                        } else if (traceCount === maxTraceCount) {
                            console.log("[!] max trace count reached: " + maxTraceCount);
                            traceCount++;
                            try {
                                Stalker.unfollow(traceTid);
                                Stalker.garbageCollect();
                            } catch (e) {}
                        }
                    });
                }

                iterator.keep();
            }
        }
    });
}

function hookDlsym() {
    const dlsym = Module.findExportByName(null, "dlsym");
    if (!dlsym) {
        console.log("[-] dlsym not found");
        return;
    }

    console.log("[+] hook dlsym at " + dlsym);

    Interceptor.attach(dlsym, {
        onEnter(args) {
            this.name = null;

            try {
                this.name = args[1].readCString();
            } catch (e) {}

            this.isJniOnLoad = this.name === "JNI_OnLoad";
        },

        onLeave(retval) {
            if (!this.isJniOnLoad) return;

            updateModule();

            console.log("[+] dlsym JNI_OnLoad returned " + retval);

            if (targetModule && inTarget(retval)) {
                hookJniOnLoad(retval, "dlsym");
            }
        }
    });
}

function hookDlopenLog() {
    // 同时 hook dlopen 与 android_dlopen_ext，记录每一个被加载的 so
    ["android_dlopen_ext", "dlopen"].forEach(function (name) {
        const addr = Module.findExportByName(null, name);
        if (!addr) {
            console.log("[-] " + name + " not found");
            return;
        }

        console.log("[+] hook " + name + " at " + addr);

        Interceptor.attach(addr, {
            onEnter(args) {
                this.path = null;
                this.name = name;

                try {
                    this.path = args[0].readCString();
                } catch (e) {}

                console.log("[dlopen] " + name + " -> " + this.path);
            },

            onLeave(retval) {
                if (!this.path) return;

                const isTarget = this.path.indexOf(targetSo) !== -1;
                console.log("[dlopen] " + this.name + " done  handle = " + retval + "  path = " + this.path);

                if (isTarget) {
                    console.log("[+] " + this.name + " loaded target " + this.path);
                    updateModule();

                    if (targetModule) {
                        console.log("    base = " + base);
                        console.log("    size = 0x" + targetModule.size.toString(16));
                    }
                }
            }
        });
    });
}

function hookTerminators() {
    [
        "exit",
        "_exit",
        "abort",
        "raise",
        "kill",
        "tgkill",
        "pthread_kill"
    ].forEach(function (name) {
        const addr = Module.findExportByName(null, name);
        if (!addr) return;

        Interceptor.attach(addr, {
            onEnter(args) {
                console.log("\n[!] " + name + " called");
                console.log("    arg0 = " + args[0]);
                console.log("    arg1 = " + args[1]);
                console.log("    backtrace:");
                console.log(
                    Thread.backtrace(this.context, Backtracer.ACCURATE)
                        .map(DebugSymbol.fromAddress)
                        .join("\n")
                );
                console.log("");
            }
        });
    });
}

function main() {
    console.log("[*] target          = " + targetSo);
    console.log("[*] traceStartOffset = " + traceStartOffset);

    // hookTerminators();
    hookDlopenLog();
    hookDlsym();
}

setImmediate(main);