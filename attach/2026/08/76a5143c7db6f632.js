'use strict';

const targetSo = "libDexHelper.so";
const maxTraceCount = 20000;
const printDisasm = true;
const stopOnReturn = true;

let targetModule = null;
let base = null;
let end = null;
let hookedJni = false;
let traceCount = 0;
let traceTid = null;

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

function hookJniOnLoad(addr, reason) {
    if (hookedJni) return;
    if (!addr || addr.isNull()) return;
    if (!updateModule()) return;

    hookedJni = true;

    console.log("\n[+] Hook JNI_OnLoad by " + reason);
    console.log("    base       = " + base);
    console.log("    JNI_OnLoad = " + addr);
    console.log("    offset     = " + offsetOf(addr));
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

    console.log("[+] Start Stalker, tid = " + tid);

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
                    const text = printDisasm
                        ? targetSo + "+" + offStr + "  " + addrStr + "  " + insn.mnemonic + " " + insn.opStr
                        : targetSo + "+" + offStr;

                    iterator.putCallout(function () {
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
    const addr = Module.findExportByName(null, "android_dlopen_ext");
    if (!addr) return;

    Interceptor.attach(addr, {
        onEnter(args) {
            this.path = null;

            try {
                this.path = args[0].readCString();
            } catch (e) {}
        },

        onLeave(retval) {
            if (this.path && this.path.indexOf(targetSo) !== -1) {
                console.log("[+] android_dlopen_ext loaded " + this.path);
                updateModule();

                if (targetModule) {
                    console.log("    base = " + base);
                    console.log("    size = 0x" + targetModule.size.toString(16));
                }
            }
        }
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
    console.log("[*] target = " + targetSo);

    hookTerminators();
    hookDlopenLog();
    hookDlsym();
}

setImmediate(main);