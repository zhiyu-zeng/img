var libc = Process.getModuleByName("libc.so");
var sys_openat = new NativeFunction(libc.getExportByName("openat"), "int", ["int", "pointer", "int", "int"]);
var sys_write = new NativeFunction(libc.getExportByName("write"), "long", ["int", "pointer", "ulong"]);
var sys_fsync = new NativeFunction(libc.getExportByName("fsync"), "int", ["int"]);

// 注意: 要写到 App 自己的数据目录(可写), 不要写 /data/local/tmp
var PATH = "/data/user/0/com.mihoyo.hyperion/files/frida_trace.txt";
var fd = -1;

function log(msg) {
    try {
        if (fd < 0) fd = sys_openat(-100, Memory.allocUtf8String(PATH), 1 | 64, 0);
        if (fd >= 0) {
            var s = msg + "\n";
            var buf = Memory.allocUtf8String(s);
            sys_write(fd, buf, buf.readUtf8String().length + 1);
            sys_fsync(fd);
        }
    } catch (e) {}
}

function bt(ctx) {
    if (!ctx) return "no-ctx";
    return Thread.backtrace(ctx, Backtracer.ACCURATE)
        .map(DebugSymbol.fromAddress).join(" <- ");
}

function hookModule(modName, syms) {
    try {
        var mod = Process.findModuleByName(modName);
        if (!mod) return;
        syms.forEach(function (sym) {
            try {
                var addr = mod.findExportByName(sym);
                if (!addr) return;
                Interceptor.attach(addr, {
                    onEnter: function (args) {
                        var extra = "";
                        var path = null;
                        if (sym === "android_dlopen_ext" || sym === "dlopen") {
                            extra = " -> " + safeStr(args[0]);
                        } else if (sym === "openat" || sym === "__openat_2") {
                            path = safeStr(args[1]);
                            extra = " -> " + path;
                        } else if (sym === "open" || sym === "__open_2" || sym === "fopen") {
                            path = safeStr(args[0]);
                            extra = " -> " + path;
                        } else if (sym === "syscall") {
                            extra = " nr=" + args[0];
                        } else if (sym === "kill") {
                            extra = " pid=" + args[0] + " sig=" + args[1];
                        } else if (sym === "tgkill") {
                            extra = " pid=" + args[0] + " tid=" + args[1] + " sig=" + args[2];
                        } else if (sym === "pthread_kill") {
                            extra = " tid=" + args[0] + " sig=" + args[1];
                        }
                        var interesting = false;
                        if (path && (path.indexOf("maps") !== -1 || path.indexOf("status") !== -1 ||
                                    path.indexOf("net/tcp") !== -1 || path.indexOf("cmdline") !== -1)) {
                            interesting = true;
                        }
                        if (sym === "exit" || sym === "_exit" || sym === "exit_group" || sym === "abort") {
                            interesting = true;
                        }
                        if (sym === "syscall") {
                            var nr = args[0].toInt32();
                            if ([93, 94, 129, 131, 117, 101].indexOf(nr) !== -1) interesting = true;
                        }
                        if (interesting) {
                            log("[+] " + sym + extra);
                            log("    bt: " + bt(this.context));
                        }
                    }
                });
            } catch (e) {
                log("[hook-err " + sym + "] " + e);
            }
        });
    } catch (e) {
        log("[mod-err " + modName + "] " + e);
    }
}

function safeStr(ptr) {
    try { return ptr.isNull() ? "null" : ptr.readUtf8String(); } catch (e) { return "?"; }
}

["libc.so", "libdl.so", "liblog.so", "libandroid_runtime.so", "libbase.so"].forEach(function (m) {
    var syms = [];
    if (m === "libc.so") syms = ["open", "openat", "__openat_2", "fopen", "exit", "_exit", "exit_group",
                                "abort", "kill", "tgkill", "pthread_kill", "syscall", "dlopen", "dlsym"];
    else if (m === "libdl.so") syms = ["android_dlopen_ext", "dlopen"];
    else if (m === "liblog.so") syms = ["__android_log_print"];
    else if (m === "libandroid_runtime.so") syms = ["android_os_Process_killProcess", "android_os_Process_killProcessGroup"];
    else if (m === "libbase.so") syms = [];
    hookModule(m, syms);
});

log("[*] hooks ready pid=" + Process.id);