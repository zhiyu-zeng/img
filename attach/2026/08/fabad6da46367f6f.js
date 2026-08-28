// ============================================================
// libmsaoaidsec.so Frida 检测行为抓取脚本 (spawn 模式)
// 用法: frida -U -f com.mihoyo.hyperion --runtime=v8 -l spawn_detect.js
// 目标: 在 so 构造器检测执行前抢占 hook,抓取反调试/反注入行为
// ============================================================

// 1. 枚举 libc 导出符号表,建立 名字 -> 地址 映射
//    说明: 该 App 环境下 Module.findExportByName 会失效,必须用
//    enumerateExports() 逐一解析,拿到 exit/_exit/kill 等真实地址
var libc = Process.getModuleByName('libc.so');
var exportNames = {};
libc.enumerateExports().forEach(function (e) { exportNames[e.name] = e.address; });

// 生成原生调用栈(回溯),用于定位"检测代码在哪个库/哪个偏移"
// Backtracer.FUZZY: 启发式栈回溯,兼容无符号/被混淆的代码
function bt(ctx) {
    try {
        return Thread.backtrace(ctx, Backtracer.FUZZY)
            .map(function (a) { return DebugSymbol.fromAddress(a); }).join('\n');
    } catch (e) { return '(no bt)'; }
}

// 通用 hook 封装: 按名字解析地址 -> Interceptor.attach
// 注意回调里必须传 this.context(CPU 寄存器上下文),供 Thread.backtrace 用;
// 传整个 InvocationContext 会导致回溯打不出来
function hookByName(name, cb) {
    var addr = exportNames[name];
    if (!addr) { console.log('[-] ' + name + ' not found'); return; }
    try {
        Interceptor.attach(addr, { onEnter: function (a) { cb(name, a, this.context); } });
        console.log('[+] hooked ' + name + ' @ ' + addr);
    } catch (e) { console.log('[-] hook ' + name + ' fail: ' + e); }
}

// 2. 自杀函数族: 检测确认后 App 会走这些路径退出
//    exit/_exit/_Exit: 干净退出(无 crash 痕迹)
//    abort: 触发 SIGABRT
['exit', '_exit', '_Exit', 'abort'].forEach(function (n) {
    hookByName(n, function (name, a, ctx) {
        console.log('\n### DETECT: ' + name + '(' + a[0] + ') @ thread=' + Process.getCurrentThreadId());
        console.log(bt(ctx));
    });
});

// 3. 信号/杀进程: kill/tgkill/raise 用于向线程发信号(如 SIGSTOP 暂停)
//    raise 只取 a[0]=信号号; kill/tgkill 取 pid + 信号号
['kill', 'tgkill', 'raise'].forEach(function (n) {
    hookByName(n, function (name, a, ctx) {
        var extra = n === 'raise' ? 'sig=' + a[0] : 'pid=' + a[1] + ' sig=' + a[2];
        console.log('\n### DETECT: ' + name + ' ' + extra + ' @ thread=' + Process.getCurrentThreadId());
        console.log(bt(ctx));
    });
});

// 4. ptrace: 反调试的核心调用(检测自己是否被 ptrace 附加)
hookByName('ptrace', function (name, a, ctx) {
    console.log('\n[PTRACE] req=' + a[0] + ' pid=' + a[1]);
    console.log(bt(ctx));
});

// 5. syscall: 防止库绕过 libc 包装直接发起系统调用自杀
//    关注的 syscall 号 (arm64):
//      93=exit  94=exit_group  60=exit  62=exit_group(x86)
//      129=kill 131=tgkill 132=tgkill 133=tkill 231=exit_group
var syscallAddr = exportNames['syscall'];
if (syscallAddr) {
    Interceptor.attach(syscallAddr, {
        onEnter: function (a) {
            var n = a[0].toInt32();
            if ([93, 94, 129, 131, 132, 133, 60, 62, 231].indexOf(n) !== -1) {
                console.log('\n### DETECT: syscall(' + n + ') args=' + a[1] + ',' + a[2]);
                console.log(bt(this));
            }
        }
    });
    console.log('[+] hooked syscall');
}

// 6. openat: 监控对 /proc 的访问
//    /proc/self/task/<tid>/status -> TracerPid 反调试检查(本库的核心检测)
//    其它含 frida/gum/linjector 的路径 -> 可能在扫描特征文件
var openat = exportNames['openat'] || exportNames['openat64'];
if (openat) {
    Interceptor.attach(openat, {
        onEnter: function (a) {
            try {
                var s = a[1].readCString();
                if (s && /^\/proc\/self\/task\//.test(s)) {
                    console.log('[STATUS_READ] ' + s);
                    console.log(bt(this));
                } else if (s && /frida|gum|linjector/i.test(s)) {
                    console.log('[FRIDA_STR] ' + s);
                }
            } catch (e) {}
        }
    });
    console.log('[+] hooked openat');
}

console.log('[+] all hooks installed at spawn');
