---
title: Captain No Hook Mobile Hacking Labs | incogbyte
source: https://incogbyte.github.io/posts/captain-no-hook-mobilehackinglabs/
source_host: incogbyte.github.io
clip_date: 2026-09-22T10:25:19+08:00
trace_id: a26506e6-923f-49b4-b6f7-503342662a77
content_hash: 84dde22fcb6be77cd26109352143f1231e855899558d5dc9e155c30eeb175f95
status: synced
tags:
  - iOS逆向
  - Frida
series: null
feed_source: incogbyte·iOS/Mobile
ai_summary: 通过 Frida Hook 与静态分析绕过 Captain No Hook 的多重 iOS RASP 检测，并借助硬编码密钥 AES 解密出隐藏 flag。
ai_summary_style: key-points
images_status:
  total: 3
  succeeded: 3
  failed_urls: []
notion_page_id: 3e375244-d011-81cb-b182-da9b2a82be82
ioc:
  cves: []
  cwes: []
  hashes:
    - 75b14952ddfe2a78282659a6e004bb4a
    - d0721d92be78de45b644111bd41cc63a
  domains: []
  tools: []
  techniques: []
---

> 💡 **AI 总结（key-points）**
>
> 通过 Frida Hook 与静态分析绕过 Captain No Hook 的多重 iOS RASP 检测，并借助硬编码密钥 AES 解密出隐藏 flag。
> 
> - **检测清单：** performChecks 调度四项检查——可疑文件存在性、DYLD 已加载库（黑名单 FridaGadget / frida / cynject / libcycript）、开放端口（27042、4444、22、44）、P_SELECT 调试标志（0x800 位）。
> - **快速定位：** `frida-trace -U -f com.mobilehackinglab.Captain-Nohook -i "*hook*"` 直接列出 Swift 符号（is_noncompliant_device、checkDYLD、getFlag、whereIsflag 等），可跳过逐函数 Ghidra 逆向；静态侧用 `ipsw class-dump` 与 `ipsw swift-dump` 导出类信息。
> - **绕过手法：** 用 Interceptor.replace 让各检查函数恒定返回 0；并 hook `__dyld_get_image_name` / `__dyld_image_count` 隐藏可疑 dylib、让 `connect` 对敏感端口失败、改写 `getaddrinfo` 端口、拦截 `ptrace`、清掉 `__sysctl` 的 0x800 追踪位、令 `fileExistsAtPath` 与 `stat/access` 返回不存在、让 `canOpenURL` 对 cydia/sileo 等返回 NO。
> - **取 flag：** hook `ViewController.getFlag` 的 onLeave 读取 Swift 字符串返回值，或用 `ObjC.chooseSync` 遍历 UILabel 抓取；`whereIsflag` 会把按钮文字设为 "Arrr, find yerr hidden flag here!"。
> - **解密细节：** getFlag 使用 CryptoSwift 的 AES-CBC，密钥硬编码为 `hackallthethings`，密文 base64 为 `HhRVZ1fdevIW2GfW42oy9J4XrAz330o5amXtNc/t8+s=`。

### Introduction

The Captain No Hooks lab provides an in-depth exploration of iOS RASP (Runtime Application Self-Protection) defenses. This comprehensive guide focuses on how we can bypass these security mechanisms.

The lab description:

> Welcome to the iOS Application Security Lab: Captain No Hook Anti-Debugging Challenge. This challenge focuses on a fictitious app called Captain No Hook, which implements advanced anti-debugging and jailbreak detection techniques. Your objective is to bypass these protections and retrieve the hidden flag within the app.

#### Analysis

First, we need to download the IPA from [https://www.mobilehackinglab.com/path-player?courseid=lab-captain-nohook](https://www.mobilehackinglab.com/path-player?courseid=lab-captain-nohook)

The next step is to analyze the binary and the metadata in the **plist.file**

We can use the following script to automate the process:

```bash
#!/bin/bash

# Check if an IPA file was provided
if [ -z "$1" ]; then
  echo "Usage: $0 <path_to_ipa_file>"
  exit 1
fi

IPA_FILE="$1"

# Check if the IPA file exists
if [ ! -f "$IPA_FILE" ]; then
  echo "[@] Error: IPA file not found!"
  exit 1
fi

# Get the app name from the IPA file
APP_NAME="$(basename "$IPA_FILE" .ipa)"
OUTPUT_DIR="$(dirname "$IPA_FILE" | xargs readlink -f)"

# Create output directory
OUTPUT_DIR="$OUTPUT_DIR/$APP_NAME"
mkdir -p "$OUTPUT_DIR"

# Unzip the IPA contents
UNZIP_DIR="$OUTPUT_DIR/_extracted"
echo "[*] Extracting IPA contents..."
mkdir -p "$UNZIP_DIR"
unzip -q "$IPA_FILE" -d "$UNZIP_DIR"

# Locate the .app directory
APP_PATH=$(find "$UNZIP_DIR" -name "*.app" -type d)

if [ -z "$APP_PATH" ]; then
  echo "[@] No .app found in $UNZIP_DIR, exiting..."
  exit 1
fi

BINARY="$APP_PATH/$(basename "$APP_PATH" .app)"

# Check if the binary exists
if [ ! -f "$BINARY" ]; then
  echo "[@] No binary found in $APP_PATH, exiting..."
  exit 1
fi

# Create directories for class dumps
CLASS_DUMP_OUTPUT="$OUTPUT_DIR/class_dump"
SWIFT_DUMP_OUTPUT="$OUTPUT_DIR/swift_dump"
mkdir -p "$CLASS_DUMP_OUTPUT"
mkdir -p "$SWIFT_DUMP_OUTPUT"

# Dump Objective-C classes using class-dump
echo "[*] Dumping Objective-C classes for $APP_NAME..."
ipsw class-dump "$BINARY" --headers -o "$CLASS_DUMP_OUTPUT"

# Dump Swift classes using swift-dump
echo "[*] Dumping Swift classes for $APP_NAME..."
ipsw swift-dump "$BINARY" > "$SWIFT_DUMP_OUTPUT/$APP_NAME-mangled.txt"
ipsw swift-dump "$BINARY" --demangle > "$SWIFT_DUMP_OUTPUT/$APP_NAME-demangled.txt"

echo "[+] Decompilation completed for $APP_NAME"
```

In the info.plist, we didn't find anything particularly interesting:

```json
{
  "BuildMachineOSBuild": "23G93",
  "CFBundleDevelopmentRegion": "en",
  "CFBundleExecutable": "Captain Nohook",
  "CFBundleIcons": {
    "CFBundlePrimaryIcon": {
      "CFBundleIconFiles": [
        "AppIcon60x60"
      ],
      "CFBundleIconName": "AppIcon"
    }
  },
  "CFBundleIcons~ipad": {
    "CFBundlePrimaryIcon": {
      "CFBundleIconFiles": [
        "AppIcon60x60",
        "AppIcon76x76"
      ],
      "CFBundleIconName": "AppIcon"
    }
  },
  "CFBundleIdentifier": "com.mobilehackinglab.Captain-Nohook",
  "CFBundleInfoDictionaryVersion": "6.0",
  "CFBundleName": "Captain Nohook",
  "CFBundlePackageType": "APPL",
  "CFBundleShortVersionString": "1.0",
  "CFBundleSupportedPlatforms": [
    "iPhoneOS"
  ],
  "CFBundleVersion": "1",
  "DTCompiler": "com.apple.compilers.llvm.clang.1_0",
  "DTPlatformBuild": "21F77",
  "DTPlatformName": "iphoneos",
  "DTPlatformVersion": "17.5",
  "DTSDKBuild": "21F77",
  "DTSDKName": "iphoneos17.5",
  "DTXcode": "1540",
  "DTXcodeBuild": "15F31d",
  "LSRequiresIPhoneOS": true,
  "MinimumOSVersion": "15.4",
  "UIApplicationSceneManifest": {
    "UIApplicationSupportsMultipleScenes": false,
    "UISceneConfigurations": {
      "UIWindowSceneSessionRoleApplication": [
        {
          "UISceneConfigurationName": "Default Configuration",
          "UISceneDelegateClassName": "Captain_Nohook.SceneDelegate",
          "UISceneStoryboardFile": "Main"
        }
      ]
    }
  },
  "UIApplicationSupportsIndirectInputEvents": true,
  "UIDeviceFamily": [
    1,
    2
  ],
  "UILaunchStoryboardName": "LaunchScreen",
  "UIMainStoryboardFile": "Main",
  "UIRequiredDeviceCapabilities": [
    "arm64"
  ],
  "UISupportedInterfaceOrientations~ipad": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationPortraitUpsideDown",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight"
  ],
  "UISupportedInterfaceOrientations~iphone": [
    "UIInterfaceOrientationPortrait",
    "UIInterfaceOrientationLandscapeLeft",
    "UIInterfaceOrientationLandscapeRight"
  ]
}
```

In the Class-Dump, we found several interesting things, particularly the following:

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/d6b752fb1b17abed.png)

![](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/c79f23ee10072c26.png)

The next steps involve loading the binary into Ghidra and verifying all those checks one by one 😭. Because of this complexity, you can just skip to the TL;DR section 😂

### TL;DR Frida-trace found functions 👀

![a](https://cdn.jsdelivr.net/gh/zhiyu-zeng/img@main/img/2026/09/495ee26a44d434c6.gif)

`frida-trace -U -f "com.mobilehackinglab.Captain-Nohook" -i "*hook*"`

```bash
$s14Captain_Nohook11FailedCheckO8allCasesSayACGvgZ()
$s14Captain_Nohook11FailedCheckOMa()
$s14Captain_Nohook22is_noncompliant_deviceSbyF
$s14Captain_Nohook30ReverseEngineeringToolsCheckerC20amIReverseEngineeredSbyFZ
$s14Captain_Nohook30ReverseEngineeringToolsCheckerC16checkOpenedPortsSSyF
$s14Captain_Nohook30ReverseEngineeringToolsCheckerC6checkDYLDSSyF
$s14Captain_Nohook30ReverseEngineeringToolsCheckerC32checkExistenceOfSuspiciousFilesSSyF
$s14Captain_Nohook30ReverseEngineeringToolsCheckerC0cdE6StatusV6passed12failedChecksAESb_SayAA11FailedCheckO5check_SS11failMessagetGtcfC()
$s14Captain_Nohook14ViewControllerC4flagSo7UILabelCSgvg()
$s14Captain_Nohook14ViewControllerC11whereIsflagyySo8UIButtonCF()
$s14Captain_Nohook14ViewControllerC4flagSo7UILabelCSgvg()
$s14Captain_Nohook14ViewControllerC7getFlagSSyF()
$s14Captain_Nohook22is_noncompliant_deviceSbyF()
$s14Captain_Nohook30ReverseEngineeringToolsCheckerCMa()
$s14Captain_Nohook30ReverseEngineeringToolsCheckerC20amIReverseEngineeredSbyFZ()
$s14Captain_Nohook11FailedCheckOMa()
```

### TL;DR Final Script

```javascript
// Global error handler for ObjC decode errors
Process.setExceptionHandler(function(details) {
    console.log('[!] Exception caught:', details.message);
    console.log('[!] Stack trace:', details.backtrace);
    return true; // Continue execution
});

const SUSPICIOUS_PORTS      = [27042, 27043, 4444, 22, 44];
const SUSPICIOUS_LIBS       = ['frida', 'FridaGadget', 'libcycript', 'cynject'];
const SUSPICIOUS_FILE_PATHS = [
    '/usr/sbin/frida-server',
    '/usr/bin/frida-server',
    '/data/local/tmp/frida-server',
    '/data/local/tmp/cycript',
    '/usr/lib/libcycript.dylib'
];

// Helper function to safely convert ObjC objects to strings
function safeObjCToString(obj) {
    if (!obj || obj.isNull()) {
        return null;
    }
    
    try {
        // Try direct toString first
        return obj.toString();
    } catch (e1) {
        try {
            // Try creating ObjC.Object wrapper
            const wrapper = new ObjC.Object(obj);
            return wrapper.toString();
        } catch (e2) {
            try {
                // Try reading as raw memory
                return Memory.readUtf8String(obj);
            } catch (e3) {
                console.log('[!] Could not convert ObjC object to string:', e3.message);
                return null;
            }
        }
    }
}

// Helper function to read Swift strings
function readSwiftString(ptr) {
    if (!ptr || ptr.isNull()) {
        return null;
    }
    
    try {
        const firstWord = ptr.readU64();
        
        if ((firstWord & 0x8000000000000000) === 0) {
            let buffer = [];
            for (let i = 0; i < 15; i++) {
                const byte = ptr.add(i).readU8();
                if (byte === 0) break;
                buffer.push(byte);
            }
            return String.fromCharCode.apply(null, buffer);
        } else {
            const dataPtr = ptr.readPointer();
            const length = ptr.add(8).readU64() & 0x7FFFFFFFFFFFFFFF;
            
            if (length > 0 && length < 1000) { // Sanity check
                return Memory.readUtf8String(dataPtr, length);
            }
        }
    } catch (e) {
        console.log('[!] Error reading Swift string:', e.message);
    }
    
    // Fallback: try reading as C string
    try {
        return Memory.readUtf8String(ptr);
    } catch (e) {
        return null;
    }
}

const canOpenURL = [
    "cydia",
    "sileo",
    "zbra",
    "sileo-store",
]

function bypassMainChecks() {
    const targets = [
        '$s14Captain_Nohook22is_noncompliant_deviceSbyF',
        '$s14Captain_Nohook30ReverseEngineeringToolsCheckerC20amIReverseEngineeredSbyFZ',
        '$s14Captain_Nohook30ReverseEngineeringToolsCheckerC16checkOpenedPortsSSyF',
        '$s14Captain_Nohook30ReverseEngineeringToolsCheckerC6checkDYLDSSyF',
        '$s14Captain_Nohook30ReverseEngineeringToolsCheckerC32checkExistenceOfSuspiciousFilesSSyF'
    ];

    targets.forEach(sym => {
        const ptr = Module.findExportByName(null, sym);
        if (ptr)
            Interceptor.replace(ptr,
                new NativeCallback(() => (console.log(`[+] bypassed → ${sym}`), 0),
                                   'int', []));
    });
}

bypassMainChecks();

function hookWhereIsFlag() {
    const sym = Module.findExportByName(
        null,
        '$s14Captain_Nohook14ViewControllerC11whereIsflagyySo8UIButtonCF'
    );
    if (!sym) return;

    Interceptor.attach(sym, {
        onEnter() {
            console.log('Invoking whereIsflag() 🔥');

            try {
                ObjC.chooseSync(ObjC.classes.UILabel).forEach(lbl => {
                    try {
                        const text = lbl.text();
                        const textStr = safeObjCToString(text);
                        if (textStr) {
                            console.log('   •', textStr);
                        }
                    } catch (e) {
                        // Ignore individual label errors
                    }
                });
            } catch (e) {
                console.log('[!] Error in hookWhereIsFlag:', e.message);
            }
        }
    });
}

hookWhereIsFlag();

function getFlag() {
    const sym = Module.findExportByName(
        null,
        '$s14Captain_Nohook14ViewControllerC7getFlagSSyF' 
    );
    if (!sym) {
        console.log('[-] getFlag symbol not found');
        return;
    }

    const NSString = ObjC.classes.NSString;

    Interceptor.attach(sym, {
        onEnter() {
            console.log('[*] getFlag() called');
        },
        onLeave(retval) {
            console.log('[*] getFlag() returning...');
            
            try {
                let flagStr = null;
                
                if (!retval.isNull()) {
                    flagStr = readSwiftString(retval);
                    
                    if (!flagStr) {
                        try {
                            const nsStr = new ObjC.Object(retval);
                            flagStr = nsStr.toString();
                        } catch (e) {
                            console.log('[!] Not an NSString:', e.message);
                        }
                    }
                    
                    if (flagStr && flagStr.includes('FLAG{')) {
                        console.log('[+] Flag decrypted from return value 🙏', flagStr);
                        return;
                    }
                }
                
                console.log('[*]....');
                let flagFound = null;
                let labelCount = 0;
                
                ObjC.chooseSync(ObjC.classes.UILabel).forEach(label => {
                    labelCount++;
                    try {
                        const text = label.text();
                        if (text) {
                            const txt = text.toString();
                            if (txt.includes('FLAG{')) {
                                flagFound = txt;
                                console.log('[+] Found flag in label:', txt);
                            }
                        }
                    } catch (e) {
                        // Ignore labels that can't be read
                    }
                });
                
                console.log(`[*] Checked ${labelCount} labels`);

                if (flagFound) {
                    console.log('[+] Flag captured from UI 🤩', flagFound);
                    
                    try {
                        const newRetval = NSString.stringWithString_(flagFound);
                        // For Swift strings, we might need to return the underlying pointer
                        const swiftStringPtr = newRetval.handle;
                        retval.replace(swiftStringPtr);
                        console.log('[+] Replaced return value with flag');
                    } catch (e) {
                        console.log('[!] Could not replace return value:', e.message);
                        
                        if (!retval.isNull()) {
                            try {
                                Memory.writeUtf8String(retval, flagFound);
                                console.log('[+] Written flag to return value memory');
                            } catch (e2) {
                                console.log('[!] Could not write to memory:', e2.message);
                            }
                        }
                    }
                } else {
                    console.log('[-] Flag not found in UI labels 🤔');
                    
                    console.log('[*] Setting up setText: hook to catch flag...');
                    const setTextImpl = ObjC.classes.UILabel['- setText:'].implementation;
                    Interceptor.attach(setTextImpl, {
                        onEnter(args) {
                            try {
                                const text = new ObjC.Object(args[2]);
                                const str = text.toString();
                                if (str.includes('FLAG{')) {
                                    console.log('[+] FLAG FOUND via setText:', str);
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    });
                }
            } catch (e) {
                console.log('[!] Error in getFlag onLeave:', e.message);
                console.log('[!] Stack trace:', e.stack);
            }
        }
    });
}

getFlag();

const VERBOSE = true;

function log(msg) {
    if (VERBOSE) console.log('[Bypass] ' + msg);
}

const getImageName = Module.findExportByName(null, '__dyld_get_image_name');
if (getImageName) {
    Interceptor.attach(getImageName, {
        onLeave(retval) {
            if (retval.isNull()) return;

            try {
                const name = Memory.readCString(retval);
                if (name && SUSPICIOUS_LIBS.some(s => name.toLowerCase().includes(s.toLowerCase()))) {
                    log(`Hiding dylib "${name}"`);
                    retval.replace(ptr(0));
                }
            } catch (e) {
                // Ignore memory read errors
            }
        }
    });
}

const getImageCount = Module.findExportByName(null, '__dyld_image_count');
if (getImageCount) {
    let hidden = 0;
    Interceptor.attach(getImageName, {  // piggy-back to increment
        onLeave(retval) {
            if (!retval.isNull()) {
                try {
                    const name = Memory.readCString(retval);
                    if (name && SUSPICIOUS_LIBS.some(s => name.toLowerCase().includes(s.toLowerCase()))) {
                        hidden++;
                    }
                } catch (e) {
                    // Ignore memory read errors
                }
            }
        }
    });
    Interceptor.attach(getImageCount, {
        onLeave(retval) {
            if (hidden > 0) {
                const real = retval.toInt32();
                retval.replace(ptr(real - hidden));
            }
        }
    });
}

function toHostOrder(net16) {
    return ((net16 & 0xff) << 8) | ((net16 & 0xff00) >> 8);
}

/* getaddrinfo(): replace suspicious port strings                       */
const gai = Module.findExportByName(null, 'getaddrinfo');
if (gai) {
    Interceptor.attach(gai, {
        onEnter(args) {
            try {
                const portStr = Memory.readCString(args[1]);
                if (portStr) {
                    const port = parseInt(portStr);
                    if (SUSPICIOUS_PORTS.includes(port)) {
                        log(`Redirecting getaddrinfo(${port}) -> 80`);
                        args[1] = Memory.allocUtf8String('80');
                    }
                }
            } catch (e) {
                // Ignore memory read errors
            }
        }
    });
}

const connectPtr = Module.findExportByName(null, 'connect');
if (connectPtr) {
    const errnoPtrFunc = new NativeFunction(Module.findExportByName(null, '__error'),
                                            'pointer', []);
    Interceptor.attach(connectPtr, {
        onEnter(args) {
            try {
                /* sockaddr_in starts with sin_len (1B) sin_family (1B) port(big-endian) */
                this.sa = args[1];
                const netPort = Memory.readU16(this.sa.add(2));
                this.port     = toHostOrder(netPort);
                this.shouldFail = SUSPICIOUS_PORTS.includes(this.port);
            } catch (e) {
                this.shouldFail = false;
            }
        },
        onLeave(retval) {
            if (this.shouldFail) {
                log(`Failing connect() on port ${this.port}`);
                retval.replace(-1);
                try {
// ECONNREFUSED
                } catch (e) {
                    // Ignore errno write errors
                }
            }
        }
    });
}

const isPtrace = Module.findExportByName(null, 'ptrace');
if (isPtrace) {
    Interceptor.attach(isPtrace, {
        onEnter: function(args) {
            try {
                let arg0 = args[0];
                let arg1 = args[1];
                let arg2 = args[2];

                console.log('> ptrace was called\n');
                console.log('> Arg0 value is: ' + arg0 + "\n");
                console.log('> Arg1 value is: ' + arg1 + "\n");
                console.log('> Arg2 value is: ' + arg2 + "\n");
                args[0] = ptr(-1);
                console.log('> Modified args 0 ' + args[0] + ' Args 1 ' + args[1] + ' Args 2 ' + args[2]);
            } catch (e) {
                console.log('> Error in ptrace hook:', e.message);
            }
        }
    });
}

const isSysCtl = Module.findExportByName(null, "__sysctl");
if (isSysCtl) {
    Interceptor.attach(isSysCtl, {
        onEnter: function(args) {
            this.info = this.context.x2;
        },
        onLeave: function(retval) {
            try {
                const pointer01 = this.info.add(32);
                const pointerFlag = pointer01.readInt() & 0x800;
                if (pointerFlag === 0x800) {
                    console.log('> __sysctl was called and was disabled');
                    pointer01.writeInt(0);
                }
            } catch (e) {
                // Ignore memory access errors
            }
        }
    });
}

const fm = ObjC.classes.NSFileManager;
if (fm && fm['- fileExistsAtPath:']) {
    const impl = fm['- fileExistsAtPath:'].implementation;
    Interceptor.attach(impl, {
        onEnter(args) {
            try {
                const pathStr = safeObjCToString(args[2]);
                this.path = pathStr || '';
                this.hide = SUSPICIOUS_FILE_PATHS.some(p => this.path.includes(p));
            } catch (e) {
                this.hide = false;
                this.path = '';
            }
        },
        onLeave(retval) {
            if (this.hide) {
                log(`Pretending path does NOT exist → ${this.path}`);
// NO
            }
        }
    });
}

['stat', 'stat64', 'access', 'faccessat'].forEach(func => {
    const ptr = Module.findExportByName(null, func);
    if (!ptr) return;
    Interceptor.attach(ptr, {
        onEnter(args) {
            try {
                this.path = Memory.readUtf8String(args[0]);
                this.hide = SUSPICIOUS_FILE_PATHS.some(p => this.path && this.path.includes(p));
            } catch (e) {
                this.hide = false;
            }
        },
        onLeave(retval) {
            if (this.hide) {
                log(`Pretending ${func}() failed on ${this.path}`);
                retval.replace(-1);   // error
            }
        }
    });
});

if (ObjC.classes.UIApplication && ObjC.classes.UIApplication["- canOpenURL:"]) {
    Interceptor.attach(ObjC.classes.UIApplication["- canOpenURL:"].implementation, {
        onEnter(args) {
            this.is_flagged = false;
            this.path = null;
            try {
                // Extract the path
                const pathStr = safeObjCToString(args[2]);
                if (pathStr) {
                    this.path = pathStr;
                    let app = this.path.split(":")[0].toLowerCase();
                    if (canOpenURL.indexOf(app) >= 0) {
                        this.is_flagged = true;
                    }
                }
            } catch (e) {
                console.log('[!] Error in canOpenURL onEnter:', e.message);
                this.is_flagged = false;
            }
        },
        onLeave(retval) {
            try {
                if (!this.is_flagged || !this.path) {
                    return;
                }

                // ignore failed
                if (retval.isNull()) {
                    return;
                }
                console.log(`canOpenURL: check for ` +
                    this.path + ` was successful with: ` +
                    retval.toString() + `, marking it as failed.`);
                retval.replace(new NativePointer(0x00));
            } catch (e) {
                console.log('[!] Error in canOpenURL onLeave:', e.message);
            }
        }
    });
}

console.log('[*] Setting up additional monitoring...');

const viewController = ObjC.classes.Captain_Nohook_ViewController;
if (viewController) {
    const methods = viewController.$ownMethods;
    methods.forEach(method => {
        if (method.includes('flag') || method.includes('Flag')) {
            console.log(`[*] Found flag-related method: ${method}`);
        }
    });
}

console.log('[+] Bypass script loaded successfully!');
```

#### Ghidra Analysis

The following function implements a anti-tampering mechanism that scans loaded dynamic libraries to detect reverse engineering tools. The function creates a blacklist containing "FridaGadget", "frida", "cynject", and "libcycript" - common instrumentation frameworks used for iOS app analysis. The detection leverages Apple's dynamic loader APIs (\_dyld_image_count() and \_dyld_get_image_name()) to enumerate all loaded libraries in the process memory. For each library, it performs case-insensitive string matching against the blacklist. If any suspicious library is found, the function returns false with an error message; otherwise, it returns true.

```ruby

undefined4
$$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkDYLD_in__75B14952DDFE2A78282659A6E004BB 4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
          (void)

{
  undefined *puVar1;
  int iVar2;
  code *pcVar3;
  bool bVar4;
  undefined8 uVar5;
  Set<undefined> SVar6;
  Set<undefined> SVar7;
  IndexingIterator IVar8;
  
  puVar1 = PTR_$$type_metadata_for_Swift.String_10016c750;
  local_58 = (undefined *)0x0;
  local_68 = 0;
  local_60 = 0;
  local_90 = 0;
  local_a0 = (String)ZEXT816(0);
  _memset(auStack_c8,0,0x28);
  local_e8 = 0;
  local_e0 = 0;
  tVar12 = Swift::$_allocateUninitializedArray(4);
  pSVar10 = (String *)tVar12.1;
  SVar13 = Swift::String::init("FridaGadget",0xb,1);
  *pSVar10 = SVar13;
  SVar13 = Swift::String::init("frida",5,1);
  pSVar10[1] = SVar13;
  SVar13 = Swift::String::init("cynject",7,1);
  pSVar10[2] = SVar13;
  SVar13 = Swift::String::init("libcycript",10,1);
  pSVar10[3] = SVar13;
  uVar5 = Swift::$_finalizeUninitializedArray(tVar12._0_8_);
  SVar6 = Swift::Set::$init((char)uVar5);
  SVar7 = SVar6;
  local_58 = SVar6.unknown;
  __dyld_image_count();
  local_74 = 0;
  local_78 = SUB84(SVar7.unknown,0);
  Swift::Range::init((int)&local_70,&local_74,&local_78,
                     (int)PTR_$$type_metadata_for_Swift.UInt32_10016ce88,
                     PTR_$$protocol_witness_table_for_Swift.UInt32_:_Swift.Comparable_in_Swift_10016 d030
                    );
  local_80 = local_70;
  local_7c = local_6c;
  ___swift_instantiateConcreteTypeFromMangledName
            ((int *)&$$demangling_cache_variable_for_type_metadata_for_Swift.Range<Swift.UInt32>);
  Swift::Range<__int32>::$lazy_protocol_witness_table_accessor();
  (extension_Swift)::Swift::Collection::$makeIterator();
  while( true ) {
    IVar8.unknown =
         (undefined *)
         ___swift_instantiateConcreteTypeFromMangledName
                   (&
                    $$demangling_cache_variable_for_type_metadata_for_Swift.IndexingIterator<Swift.R ange<Swift.UInt32>>
                   );
    Swift::IndexingIterator::$next(IVar8);
    if ((local_84 & 1) != 0) {
      Swift::String::init("",0,1);
      _swift_bridgeObjectRelease(SVar6.unknown);
      return 1;
    }
    cString.unknown = (undefined *)(uint)local_88;
    local_90 = local_88;
    __dyld_get_image_name();
    if (cString.unknown == (undefined *)0x0) break;
    SVar13 = Swift::String::init(cString);
    local_a0 = SVar13;
    _swift_bridgeObjectRetain(SVar6.unknown);
    Swift::Set::$makeIterator((Set)SVar6.unknown);
    _memcpy(auStack_c8,auStack_48,0x28);
    while( true ) {
      IVar9.unknown =
           (undefined *)
           ___swift_instantiateConcreteTypeFromMangledName
                     (&
                      $$demangling_cache_variable_for_type_metadata_for_Swift.Set<Swift.String>.Iter ator
                     );
      Swift::Set::Iterator::$next(IVar9);
      iVar2 = local_d0;
      local_1a0 = SVar13.bridgeObject;
      if (local_d0 == 0) break;
      local_1a8 = SVar13.str;
      local_e8 = local_d8;
      local_e0 = local_d0;
      local_f8 = local_1a8;
      local_f0 = local_1a0;
      local_108 = local_d8;
      local_100 = local_d0;
      Swift::String::$lazy_protocol_witness_table_accessor();
      bVar4 = (extension_Foundation)::Swift::StringProtocol::$localizedCaseInsensitiveContains
                        ((char)&local_108);
      if (bVar4) {
        uVar5 = 1;
        local_118 = Swift::DefaultStringInterpolation::init(0x1b,1);
        DVar11.unknown = (undefined *)0x1;
        local_110 = uVar5;
        SVar13 = Swift::String::init("Suspicious library loaded: ",0x1b,1);
        Swift::DefaultStringInterpolation::appendLiteral(SVar13,DVar11);
        _swift_bridgeObjectRelease(SVar13.bridgeObject);
        local_128 = local_1a8;
        local_120 = local_1a0;
        Swift::DefaultStringInterpolation::$appendInterpolation
                  ((char)&local_128,(DefaultStringInterpolation)puVar1);
        DVar11.unknown = (undefined *)0x1;
        SVar13 = Swift::String::init("",0,1);
        Swift::DefaultStringInterpolation::appendLiteral(SVar13,DVar11);
        _swift_bridgeObjectRelease(SVar13.bridgeObject);
        DVar11.unknown = local_118.unknown;
        _swift_bridgeObjectRetain();
        $$outlined_destroy_of_Swift.DefaultStringInterpolation((int)&local_118);
        Swift::String::init(DVar11);
        _swift_bridgeObjectRelease(iVar2);
        $$outlined_destroy_of_Swift.Set<>.Iterator(auStack_c8);
        _swift_bridgeObjectRelease(local_1a0);
        _swift_bridgeObjectRelease(SVar6.unknown);
        return 0;
      }
      _swift_bridgeObjectRelease(iVar2);
    }
    $$outlined_destroy_of_Swift.Set<>.Iterator(auStack_c8);
    _swift_bridgeObjectRelease(local_1a0);
  }
  Swift::_assertionFailure
            ((StaticString)0x10015770a,(StaticString)0xb,(StaticString)0x2,0x100156270,0x44);
                    /* WARNING: Does not return */
  pcVar3 = (code *)SoftwareBreakpoint(1,0x10000e054);
  (*pcVar3)();
}
```

This function performChecks serves as a security orchestrator that executes multiple anti-tampering checks and aggregates their results. The function implements a comprehensive defense strategy by running various detection mechanisms and maintaining an overall security status. The system performs four distinct security checks through a switch statement: Suspicious Files Detection (case 1) scans for reverse engineering tool files, Dynamic Library Detection (case 6) checks for loaded instrumentation frameworks like Frida, Network Port Monitoring (case 7) detects unusual network activity, and Process Selection Flag Check (case 8) monitors for debugging indicators.

```php

undefined  [16]
$$static_Captain_Nohook.ReverseEngineeringToolsChecker.(performChecks_in__75B14952DDFE2A78282659A6E0 04BB4A)()_->_Captain_Nohook.ReverseEngineeringToolsChecker.ReverseEngineeringToolsStatus
          (void)

{
  byte bVar1;
  char cVar2;
  
  local_50 = 0;
  local_60 = 0;
  local_58 = 0;
  local_70 = '\0';
  local_29 = 1;
  local_48[0] = 1;
  pvVar10 = (void *)0x1;
  local_40 = Swift::String::init("",0,1);
  ___swift_instantiateConcreteTypeFromMangledName
            ((int *)&
                    $$demangling_cache_variable_for_type_metadata_for_(check:_Captain_Nohook.FailedC heck,failMessage:_Swift.String)
            );
  tVar11 = Swift::$_allocateUninitializedArray(0);
  local_50 = tVar11._0_8_;
  AVar4 = Captain_Nohook::FailedCheck::get_allCases();
  local_68 = CONCAT44(extraout_var,AVar4);
  ___swift_instantiateConcreteTypeFromMangledName
            ((int *)&$$demangling_cache_variable_for_type_metadata_for_[Captain_Nohook.FailedCheck])
  ;
  pcVar7 = Swift::Array<>::$lazy_protocol_witness_table_accessor();
  (extension_Swift)::Swift::Collection::$makeIterator();
LAB_10000d760:
  do {
    IVar8.unknown =
         (undefined *)
         ___swift_instantiateConcreteTypeFromMangledName
                   (&
                    $$demangling_cache_variable_for_type_metadata_for_Swift.IndexingIterator<[Captai n_Nohook.FailedCheck]>
                   );
    Swift::IndexingIterator::$next(IVar8);
    cVar2 = local_69;
    if (local_69 == '\n') {
      $$outlined_destroy_of_Swift.IndexingIterator<>(&local_60);
      uVar9 = local_50;
      dVar6 = (dword)local_29;
      _swift_bridgeObjectRetain();
      dVar6 = Captain_Nohook::ReverseEngineeringToolsChecker::ReverseEngineeringToolsStatus::init
                        (dVar6 & 1);
      $$outlined_destroy_of_[(check:_Captain_Nohook.FailedCheck,failMessage:_Swift.String)]
                (&local_50);
      $$outlined_destroy_of_(passed:_Swift.Bool,failMessage:_Swift.String)((int)local_48);
      auVar12._4_4_ = 0;
      auVar12._0_4_ = dVar6 & 1;
      auVar12._8_8_ = uVar9;
      return auVar12;
    }
    local_70 = local_69;
    switch(local_69) {
    case '\x01':
      uVar5 = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkExistenceOfSuspiciousFile s_in__75B14952DDFE2A78282659A6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
                        ();
      local_48[0] = (byte)uVar5 & 1;
      pvVar3 = local_40.bridgeObject;
      local_40.bridgeObject = pvVar10;
      local_40.str = pcVar7;
      _swift_bridgeObjectRelease(pvVar3);
      break;
    default:
      goto switchD_10000d7dc_caseD_2;
    case '\x06':
      uVar5 = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkDYLD_in__75B14952DDFE2A78 282659A6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
                        ();
      local_48[0] = (byte)uVar5 & 1;
      pvVar3 = local_40.bridgeObject;
      local_40.bridgeObject = pvVar10;
      local_40.str = pcVar7;
      _swift_bridgeObjectRelease(pvVar3);
      break;
    case '\a':
      uVar5 = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkOpenedPorts_in__75B14952D DFE2A78282659A6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
                        ();
      local_48[0] = (byte)uVar5 & 1;
      pvVar3 = local_40.bridgeObject;
      local_40.bridgeObject = pvVar10;
      local_40.str = pcVar7;
      _swift_bridgeObjectRelease(pvVar3);
      break;
    case '\b':
      local_48[0] = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkPSelectFlag_in__75B 14952DDFE2A78282659A6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
                              ();
      pvVar3 = local_40.bridgeObject;
      local_40.bridgeObject = pvVar10;
      local_40.str = pcVar7;
      _swift_bridgeObjectRelease(pvVar3);
    }
    bVar1 = local_48[0];
    if ((local_29 & 1) == 0) {
      bVar1 = 0;
    }
    local_29 = bVar1 & 1;
    if ((local_48[0] & 1) == 0) {
      pcVar7 = local_40.str;
      pvVar3 = local_40.bridgeObject;
      _swift_bridgeObjectRetain();
      local_88[0] = cVar2;
      local_80 = pcVar7;
      local_78 = pvVar3;
      pcVar7 = (char *)___swift_instantiateConcreteTypeFromMangledName
                                 ((int *)&
                                         $$demangling_cache_variable_for_type_metadata_for_[(check:_ Captain_Nohook.FailedCheck,failMessage:_Swift.String)]
                                 );
      Swift::Array<undefined>::append((char)local_88,(Array<undefined>)pcVar7);
    }
  } while( true );
switchD_10000d7dc_caseD_2:
  goto LAB_10000d760;
}
```

This function checkOpenedPorts implements a network-based anti-debugging mechanism that scans for suspicious open ports commonly used by reverse engineering tools. The function creates a hardcoded array of four specific port numbers: 27042 (0x69a2), 4444 (0x115c), 22 (0x16), and 44 (0x2c). The function iterates through each port in the array and calls canOpenLocalConnection to test if a local connection can be established. This technique detects active debugging servers, SSH tunnels, or instrumentation frameworks that expose network interfaces for remote control.

```ruby

undefined4
$$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkOpenedPorts_in__75B14952DDFE2A78282659A 6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
          (void)

{
  undefined *puVar1;
  bool bVar2;
  undefined8 uVar3;
  IndexingIterator IVar4;
  undefined8 *puVar5;
  undefined8 uVar6;
  DefaultStringInterpolation DVar7;
  tuple2.conflict12 tVar8;
  String SVar9;
  DefaultStringInterpolation local_70;
  undefined8 local_30;
  
  puVar1 = PTR_$$type_metadata_for_Swift.Int_10016cdf8;
  local_30 = 0;
  local_40 = 0;
  local_38 = 0;
  local_60 = 0;
  tVar8 = Swift::$_allocateUninitializedArray(4);
  puVar5 = (undefined8 *)tVar8.1;
  *puVar5 = 0x69a2;
  puVar5[1] = 0x115c;
  puVar5[2] = 0x16;
  puVar5[3] = 0x2c;
  uVar3 = Swift::$_finalizeUninitializedArray(tVar8._0_8_);
  local_30 = uVar3;
  _swift_bridgeObjectRetain();
  local_48 = uVar3;
  ___swift_instantiateConcreteTypeFromMangledName
            ((int *)&$$demangling_cache_variable_for_type_metadata_for_[Swift.Int]);
  Swift::Array<int>::$lazy_protocol_witness_table_accessor();
  (extension_Swift)::Swift::Collection::$makeIterator();
  do {
    IVar4.unknown =
         (undefined *)
         ___swift_instantiateConcreteTypeFromMangledName
                   (&
                    $$demangling_cache_variable_for_type_metadata_for_Swift.IndexingIterator<[Swift. Int]>
                   );
    Swift::IndexingIterator::$next(IVar4);
    if ((local_50 & 1) != 0) {
      $$outlined_destroy_of_Swift.IndexingIterator<>(&local_40);
      Swift::String::init("",0,1);
      _swift_bridgeObjectRelease(uVar3);
      return 1;
    }
    local_60 = local_58;
    bVar2 = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(canOpenLocalConnection_in__75B14 952DDFE2A78282659A6E004BB4A)(port:_Swift.Int)_->_Swift.Bool
                      (local_58);
  } while (!bVar2);
  uVar6 = 1;
  local_70 = Swift::DefaultStringInterpolation::init(0xd,1);
  DVar7.unknown = (undefined *)0x1;
  local_68 = uVar6;
  SVar9 = Swift::String::init("Port ",5,1);
  Swift::DefaultStringInterpolation::appendLiteral(SVar9,DVar7);
  _swift_bridgeObjectRelease(SVar9.bridgeObject);
  Swift::DefaultStringInterpolation::$appendInterpolation
            ((char)&stack0xfffffffffffffff0 + -0x68,(DefaultStringInterpolation)puVar1);
  DVar7.unknown = (undefined *)0x1;
  SVar9 = Swift::String::init(" is open",8,1);
  Swift::DefaultStringInterpolation::appendLiteral(SVar9,DVar7);
  _swift_bridgeObjectRelease(SVar9.bridgeObject);
  DVar7.unknown = local_70.unknown;
  _swift_bridgeObjectRetain();
  $$outlined_destroy_of_Swift.DefaultStringInterpolation((int)&local_70);
  Swift::String::init(DVar7);
  $$outlined_destroy_of_Swift.IndexingIterator<>(&local_40);
  _swift_bridgeObjectRelease(uVar3);
  return 0;
}
```

This function checkExistenceOfSuspiciousFiles implements a filesystem-based anti-tampering mechanism that scans for the presence of reverse engineering tools on the device. The function creates an array containing one specific file path: "/usr/sbin/frida-server", which is the standard installation location for Frida's server component. The function uses NSFileManager's fileExistsAtPath method to check if the Frida server binary exists at its typical installation path. This represents a static detection approach that targets jailbroken devices where users commonly install debugging tools in system directories.

```ruby

undefined4
$$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkExistenceOfSuspiciousFiles_in__75B14952 DDFE2A78282659A6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
          (void)

{
  undefined *puVar1;
  int iVar2;
  undefined8 uVar3;
  IndexingIterator IVar4;
  undefined *puVar5;
  
  puVar1 = PTR_$$type_metadata_for_Swift.String_10016c750;
  local_30 = 0;
  local_40 = 0;
  local_38 = 0;
  local_68 = 0;
  local_60 = 0;
  tVar10 = Swift::$_allocateUninitializedArray(1);
  SVar11 = Swift::String::init("/usr/sbin/frida-server",0x16,1);
  *(String *)tVar10.1 = SVar11;
  uVar3 = Swift::$_finalizeUninitializedArray(tVar10._0_8_);
  local_30 = uVar3;
  _swift_bridgeObjectRetain();
  local_48 = uVar3;
  ___swift_instantiateConcreteTypeFromMangledName
            ((int *)&$$demangling_cache_variable_for_type_metadata_for_[Swift.String]);
  Swift::Array<String>::$lazy_protocol_witness_table_accessor();
  (extension_Swift)::Swift::Collection::$makeIterator();
  while( true ) {
    IVar4.unknown =
         (undefined *)
         ___swift_instantiateConcreteTypeFromMangledName
                   (&
                    $$demangling_cache_variable_for_type_metadata_for_Swift.IndexingIterator<[Swift. String]>
                   );
    Swift::IndexingIterator::$next(IVar4);
    iVar2 = local_50;
    if (local_50 == 0) {
      $$outlined_destroy_of_Swift.IndexingIterator<>(&local_40);
      Swift::String::init("",0,1);
      _swift_bridgeObjectRelease(uVar3);
      return 1;
    }
    local_68 = local_58;
    local_60 = local_50;
    puVar5 = &_OBJC_CLASS_$_NSFileManager;
    _objc_opt_self();
    _objc_msgSend();
    _objc_retainAutoreleasedReturnValue();
    _swift_bridgeObjectRetain(iVar2);
    pNVar6 = (extension_Foundation)::Swift::String::_bridgeToObjectiveC();
    _swift_bridgeObjectRelease(iVar2);
    puVar7 = puVar5;
    _objc_msgSend(puVar5,"fileExistsAtPath:",pNVar6);
    _objc_release(pNVar6);
    _objc_release(puVar5);
    if (((uint)puVar7 & 1) != 0) break;
    _swift_bridgeObjectRelease(iVar2);
  }
  uVar8 = 1;
  local_78 = Swift::DefaultStringInterpolation::init(0x17,1);
  DVar9.unknown = (undefined *)0x1;
  local_70 = uVar8;
  SVar11 = Swift::String::init("Suspicious file found: ",0x17,1);
  Swift::DefaultStringInterpolation::appendLiteral(SVar11,DVar9);
  _swift_bridgeObjectRelease(SVar11.bridgeObject);
  Swift::DefaultStringInterpolation::$appendInterpolation
            ((char)&stack0xfffffffffffffff0 + -0x78,(DefaultStringInterpolation)puVar1);
  DVar9.unknown = (undefined *)0x1;
  SVar11 = Swift::String::init("",0,1);
  Swift::DefaultStringInterpolation::appendLiteral(SVar11,DVar9);
  _swift_bridgeObjectRelease(SVar11.bridgeObject);
  DVar9.unknown = local_78.unknown;
  _swift_bridgeObjectRetain();
  $$outlined_destroy_of_Swift.DefaultStringInterpolation((int)&local_78);
  Swift::String::init(DVar9);
  _swift_bridgeObjectRelease(iVar2);
  $$outlined_destroy_of_Swift.IndexingIterator<>(&local_40);
  _swift_bridgeObjectRelease(uVar3);
  return 0;
}
```

This function checkPSelectFlag implements a sophisticated system-level anti-debugging mechanism that examines process flags through the BSD sysctl interface. The function uses sysctl() with parameters \[1, 14, 1, getpid()\] to retrieve detailed process information from the kernel. The core detection logic focuses on the P_SELECT flag (0x40) in the process flags structure. After calling sysctl() to populate a large buffer with process information, the function extracts the process flags and performs a bitwise AND operation with 0x40 to check if the P_SELECT flag is set.

```ruby
bool $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(checkPSelectFlag_in__75B14952DDFE2A7828 2659A6E004BB4A)()_->_(passed:_Swift.Bool,failMessage:_Swift.String)
               (void)

{
  dword dVar1;
  dword dVar2;
  code *pcVar3;
  bool bVar4;
  Array<undefined> AVar5;
  pid_t pVar6;
  int *piVar7;
  
  local_28 = *(int *)PTR____stack_chk_guard_10016c338;
  _bzero(&local_2b0,0x288);
  local_2c8 = (int *)0x0;
  local_2d0 = 0;
  local_38 = 0;
  local_34 = 0;
  local_30 = 0;
  tVar16 = Swift::$_allocateUninitializedArray(4);
  puVar15 = (undefined4 *)tVar16.1;
  *puVar15 = 1;
  puVar15[1] = 0xe;
  puVar15[2] = 1;
  pVar6 = _getpid();
  puVar15[3] = (sdword)pVar6;
  piVar7 = (int *)Swift::$_finalizeUninitializedArray(tVar16._0_8_);
  _swift_bridgeObjectRetain();
  local_2d0 = 0x288;
  local_2c8 = piVar7;
  iVar8 = Swift::Array<undefined>::get_count((Array<undefined>)piVar7);
  _swift_bridgeObjectRelease(piVar7);
  local_2e0 = iVar8;
  __int32::$lazy_protocol_witness_table_accessor();
  __int32::$lazy_protocol_witness_table_accessor();
  int::$lazy_protocol_witness_table_accessor();
  (extension_Swift)::Swift::UnsignedInteger::$init((char)&local_2e0);
  iVar8 = ___swift_instantiateConcreteTypeFromMangledName
                    ((int *)&$$demangling_cache_variable_for_type_metadata_for_[Swift.Int32]);
  Swift::Array<undefined>::reserveCapacity(0,(Array<undefined>)iVar8);
  piVar9 = local_2c8;
  Swift::Array<undefined>::$get__baseAddressIfContiguous((Array<undefined>)local_2c8);
  piVar7 = local_2c8;
  if (piVar9 == (int *)0x0) {
    _swift_bridgeObjectRetain();
    local_2e8 = piVar7;
    Swift::Array<__int32>::$lazy_protocol_witness_table_accessor();
    bVar4 = (extension_Swift)::Swift::Collection::get_isEmpty();
    _swift_bridgeObjectRelease(local_2e8);
    if (!bVar4) {
      Swift::_fatalErrorMessage
                ((StaticString)0x10015770a,(StaticString)0xb,(StaticString)0x2,0x100157090,0);
                    /* WARNING: Does not return */
      pcVar3 = (code *)SoftwareBreakpoint(1,0x10000ed80);
      (*pcVar3)();
    }
  }
  local_3f0 = local_2c8;
  AVar5 = (Array<undefined>)local_2c8;
  local_3e8 = local_2c8;
  Swift::Array<undefined>::$get__baseAddressIfContiguous(AVar5);
  if (local_3e8 == (int *)0x0) {
    _swift_bridgeObjectRetain(local_3f0);
    local_2f0 = local_3f0;
    Swift::Array<__int32>::$lazy_protocol_witness_table_accessor();
    bVar4 = (extension_Swift)::Swift::Collection::get_isEmpty();
    _swift_bridgeObjectRelease(local_2f0);
    if (!bVar4) {
      _swift_bridgeObjectRetain(local_3f0);
      local_2f8 = local_3f0;
      ___swift_instantiateConcreteTypeFromMangledName
                ((int *)&
                        $$demangling_cache_variable_for_type_metadata_for_Swift._ArrayBuffer<Swift.I nt32>
                );
      Swift::_ArrayBuffer<__int32>::$lazy_protocol_witness_table_accessor();
      CVar12 = Swift::ContiguousArray::$init((char)&local_2f8);
      _swift_retain();
      _swift_release(CVar12.unknown);
      local_3f0 = (int *)CVar12;
      Swift::_ContiguousArrayBuffer::$get_owner((_ContiguousArrayBuffer)CVar12.unknown);
      local_3e8 = (int *)Swift::_ContiguousArrayBuffer::get_firstElementAddress
                                   ((_ContiguousArrayBuffer)CVar12.unknown);
      _swift_release(CVar12.unknown);
      goto LAB_10000eb84;
    }
  }
  Swift::Array<undefined>::$get__owner(AVar5);
  if (local_3e8 == (int *)0x0) {
    local_3e8 = (int *)0x0;
  }
LAB_10000eb84:
  if (local_3e8 == (int *)0x0) {
    local_308 = (int *)0xfffffffffffffffc;
  }
  else {
    local_308 = local_3e8;
  }
  iVar8 = _sysctl(local_308,(uint)local_2d4,&local_2b0,&local_2d0,(void *)0x0,0);
  _swift_unknownObjectRelease(local_3f0);
  uVar10 = (extension_Swift)::Swift::SignedInteger::get_isSigned();
  uVar11 = (extension_Swift)::Swift::SignedInteger::get_isSigned();
  if (((dword)uVar10 & 1) == ((dword)uVar11 & 1)) {
    (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
    (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
  }
  else {
    uVar13 = (extension_Swift)::Swift::SignedInteger::get_isSigned();
    if ((uVar13 & 1) == 0) {
      (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
      (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
    }
    else {
      (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
      (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
    }
  }
  if ((sdword)iVar8 != 0) {
    tVar16 = Swift::$_allocateUninitializedArray(1);
    SVar17 = Swift::String::init("Error occured when calling sysctl(). This check may not be reliabl e"
                                 ,0x43,1);
    ((String *)tVar16.1)[1].bridgeObject = PTR_$$type_metadata_for_Swift.String_10016c750;
    *(String *)tVar16.1 = SVar17;
    SVar19.str = (char *)Swift::$_finalizeUninitializedArray(tVar16._0_8_);
    SVar17 = Swift::$print();
    SVar18 = Swift::$print();
    SVar19.bridgeObject = SVar17.str;
    separator.bridgeObject = SVar18.str;
    separator.str = (char *)SVar17.bridgeObject;
    Swift::$print(SVar19,separator);
    _swift_bridgeObjectRelease(SVar18.bridgeObject);
    _swift_bridgeObjectRelease(SVar17.bridgeObject);
    _swift_bridgeObjectRelease(SVar19.str);
  }
  dVar2 = local_290;
  dVar1 = local_290 & 0x40;
  uVar10 = (extension_Swift)::Swift::SignedInteger::get_isSigned();
  uVar11 = (extension_Swift)::Swift::SignedInteger::get_isSigned();
  if (((dword)uVar10 & 1) == ((dword)uVar11 & 1)) {
    iVar8 = (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
    iVar14 = (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
    if (iVar8 < iVar14) {
      bVar4 = dVar1 == 0;
    }
    else {
      bVar4 = (dVar2 & 0x40) == 0;
    }
  }
  else {
    uVar13 = (extension_Swift)::Swift::SignedInteger::get_isSigned();
    if ((uVar13 & 1) == 0) {
      iVar8 = (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
      iVar14 = (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
      if (iVar8 < iVar14) {
        bVar4 = dVar1 == 0;
      }
      else {
        bVar4 = (dVar2 & 0x40) == 0;
      }
    }
    else {
      iVar8 = (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
      iVar14 = (extension_Swift)::Swift::FixedWidthInteger::get_bitWidth();
      if (iVar14 < iVar8) {
        bVar4 = (dVar2 & 0x40) == 0;
      }
      else {
        bVar4 = dVar1 == 0;
      }
    }
  }
  if (!bVar4) {
    Swift::String::init("Suspicious PFlag value",0x16,1);
    $$outlined_destroy_of_[Swift.Int32](&local_2c8);
  }
  else {
    Swift::String::init("",0,1);
    $$outlined_destroy_of_[Swift.Int32](&local_2c8);
  }
  if (*(int *)PTR____stack_chk_guard_10016c338 != local_28) {
                    /* WARNING: Subroutine does not return */
    ___stack_chk_fail();
  }
  return bVar4;
}
```

The following functions are responsible for hooking detections and more debug..

```
dword __thiscall Captain_Nohook::ReverseEngineeringToolsChecker::amIReverseEngineered(void)

{
  undefined auVar1 [16];

  auVar1 = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(performChecks_in__75B14952DDFE2A7 8282659A6E004BB4A)()_->_Captain_Nohook.ReverseEngineeringToolsChecker.ReverseEngineeringToolsStatu s
                     ();
  _swift_bridgeObjectRelease(auVar1._8_8_);
  return (auVar1._0_4_ ^ 1) & 1;
}
```

```javascript

/* static Captain_Nohook.ReverseEngineeringToolsChecker.amIReverseEngineeredWithFailedChecks() ->
   (reverseEngineered: Swift.Bool, failedChecks: [(check: Captain_Nohook.FailedCheck, failMessage:
   Swift.String)]) */

undefined  [16] __thiscall
Captain_Nohook::ReverseEngineeringToolsChecker::amIReverseEngineeredWithFailedChecks(void)

{
  undefined auVar1 [16];
  undefined auVar2 [16];
  
  auVar1 = $$static_Captain_Nohook.ReverseEngineeringToolsChecker.(performChecks_in__75B14952DDFE2A7 8282659A6E004BB4A)()_->_Captain_Nohook.ReverseEngineeringToolsChecker.ReverseEngineeringToolsStatu s
                     ();
  auVar2._8_8_ = auVar1._8_8_;
  _swift_bridgeObjectRetain();
  _swift_bridgeObjectRelease(auVar2._8_8_);
  auVar2._4_4_ = 0;
  auVar2._0_4_ = (auVar1._0_4_ ^ 1) & 1;
  return auVar2;
}
```

```

undefined8 Captain_Nohook::ImageResource::get_noHook(void)

{
  undefined8 *puVar1;
  undefined8 uVar2;
  undefined8 uVar3;

  puVar1 = noHook::unsafeMutableAddressor();
  uVar3 = *puVar1;
  uVar2 = puVar1[2];
  _swift_bridgeObjectRetain();
  _objc_retain(uVar2);
  return uVar3;
}
```

```php
undefined8 * Captain_Nohook::ImageResource::noHook::unsafeMutableAddressor(void)

{
  undefined8 local_18;

  if ($$one-time_initialization_token_for_noHook != -1) {
    _swift_once(&$$one-time_initialization_token_for_noHook,one_time_init_for_noHook,local_18);
  }
  return &_$s14Captain_Nohook13ImageResourceV6noHookACvpZ;
}
```

```rust

/* one-time initialization function for noHook */

void Captain_Nohook::ImageResource::one_time_init_for_noHook(void)

{
  undefined8 *puVar1;
  undefined8 bundle;
  void *pvVar2;
  String SVar3;
  
  SVar3 = Swift::String::init("no-hook",7,1);
  pvVar2 = SVar3.bridgeObject;
  puVar1 = _D0721D92BE78DE45B644111BD41CC63A::resourceBundle::unsafeMutableAddressor();
  bundle = *puVar1;
  _objc_retain();
  _$s14Captain_Nohook13ImageResourceV6noHookACvpZ = init(SVar3.str,pvVar2,bundle);
  DAT_100181c78 = pvVar2;
  DAT_100181c80 = bundle;
  return;
}
```

```rust

/* one-time initialization function for noHook */

void Captain_Nohook::ImageResource::one_time_init_for_noHook(void)

{
  undefined8 *puVar1;
  undefined8 bundle;
  void *pvVar2;
  String SVar3;
  
  SVar3 = Swift::String::init("no-hook",7,1);
  pvVar2 = SVar3.bridgeObject;
  puVar1 = _D0721D92BE78DE45B644111BD41CC63A::resourceBundle::unsafeMutableAddressor();
  bundle = *puVar1;
  _objc_retain();
  _$s14Captain_Nohook13ImageResourceV6noHookACvpZ = init(SVar3.str,pvVar2,bundle);
  DAT_100181c78 = pvVar2;
  DAT_100181c80 = bundle;
  return;
}
```

```ruby
Captain_Nohook::ViewController::getFlag(ViewController *this)

{
  undefined *puVar1;
  StaticString SVar2;
  char *pcVar3;
  int iVar4;
  code *pcVar5;
  dword dVar6;
  Array<undefined> AVar7;
  Array<__int8> AVar8;
  undefined4 extraout_var;
  Encoding EVar9;
  char *pcVar10;
  AES *this_00;
  undefined4 extraout_var_00;
  undefined4 extraout_var_01;
  undefined *puVar11;
  undefined4 extraout_var_02;
  undefined8 uVar12;
  Encoding EVar13;
  uint uVar14;
  void *pvVar15;
  ViewController *local_38;
  
  local_1a0 = 
  $$closure_#1_(__C.UIAlertAction)_->_()_in_Captain_Nohook.ViewController.getFlag()_->_Swift.String;
  local_198 = PTR_$$type_metadata_for_Swift.UInt8_10016d040;
  local_190.unknown = PTR_$$type_metadata_for_Swift.String_10016c750;
  local_188.unknown = "Fatal error";
  local_180 = "Unexpectedly found nil while unwrapping an Optional value";
  local_178 = "Captain_Nohook/ViewController.swift";
  local_38 = (ViewController *)0x0;
  local_48 = (String)ZEXT816(0);
  local_148 = (UIAlertController *)0x0;
  local_1a8 = this;
  local_168 = (undefined *)Encoding::$typeMetadataAccessor();
  local_160 = *(int *)(local_168 + -8);
  local_158 = *(int *)(local_160 + 0x40) + 0xfU & 0xfffffffffffffff0;
  (*(code *)PTR____chkstk_darwin_10016c2b0)();
  puVar1 = local_440 + -local_158;
  local_150.unknown = puVar1;
  local_38 = this;
  dVar6 = is_noncompliant_device();
  if ((dVar6 & 1) != 0) {
    local_1c8 = 0;
    auVar18 = __C::UIAlertController::typeMetadataAccessor();
    local_1b4 = 1;
    local_1d8 = Swift::String::init("Noncompliant device detected!",0x1d,1);
    SVar19 = Swift::String::init("Yerr hook won\'t work!",0x15,(byte)local_1b4 & 1);
    local_1b0 = __C::UIAlertController::$__allocating_init
                          (auVar18._0_8_,local_1d8.str,(int)local_1d8.bridgeObject,SVar19.str,
                           (int)SVar19.bridgeObject);
    local_148 = local_1b0;
    auVar18 = __C::UIAlertAction::typeMetadataAccessor();
    SVar19 = Swift::String::init("OK",2,(byte)local_1b4 & 1);
    local_1c0 = __C::UIAlertAction::$__allocating_init
                          (auVar18._0_8_,SVar19.str,(int)SVar19.bridgeObject,local_1c8,
                           (int)local_1a0,local_1c8);
    _objc_msgSend(local_1b0,"addAction:");
    _objc_release(local_1c0);
    _objc_msgSend(local_1a8,"presentViewController:animated:completion:",local_1b0,local_1b4 & 1,0);
    _objc_release(local_1b0);
  }
  iVar4 = local_170;
  local_230 = Swift::String::init("HhRVZ1fdevIW2GfW42oy9J4XrAz330o5amXtNc/t8+s=",0x2c,1);
  local_48 = local_230;
  tVar20 = Swift::$_allocateUninitializedArray(0x1f);
  local_220 = (undefined *)tVar20.1;
  *local_220 = 0x31;
  local_220[0x17] = 0x3d;
  local_220[0x18] = 0x3a;
  local_220[0x19] = 0x20;
  local_220[0x1a] = 0x3b;
  local_220[0x1b] = 0x3a;
  local_220[0x1c] = 0x35;
  local_220[0x1d] = 0x27;
  local_220[0x1e] = 0x35;
  local_210 = Swift::$_finalizeUninitializedArray(tVar20._0_8_);
  local_200 = local_218 + 0x11U & 0xfffffffffffffff0;
  local_208 = puVar1;
  local_58 = local_210;
  local_50 = local_210;
  (*(code *)PTR____chkstk_darwin_10016c2b0)();
  local_1f8 = (int)puVar1 - local_200;
  *(undefined *)(local_1f8 + 0x10) = 0x54;
  local_1f0 = (void *)___swift_instantiateConcreteTypeFromMangledName
                                ((int *)&
                                        $$demangling_cache_variable_for_type_metadata_for_[Swift.UIn t8]
                                );
  Swift::Array<__int8>::$lazy_protocol_witness_table_accessor();
  AVar7 = (extension_Swift)::Swift::Collection::$map();
  puVar1 = local_208;
  local_258 = CONCAT44(extraout_var,AVar7);
  local_1e8 = iVar4;
  local_1e0 = local_258;
  if (iVar4 != 0) {
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x10000965c);
    (*pcVar5)();
  }
  uVar12 = 1;
  local_268 = 1;
  local_60 = local_258;
  local_70 = (undefined *)Swift::DefaultStringInterpolation::init(1,1);
  DVar16.unknown = (undefined *)0x1;
  local_68 = uVar12;
  SVar19 = Swift::String::init("!",(__int16)local_268,1);
  local_260 = (undefined *)SVar19.bridgeObject;
  Swift::DefaultStringInterpolation::appendLiteral(SVar19,DVar16);
  EVar9.unknown = local_260;
  _swift_bridgeObjectRelease();
  local_250.unknown = (undefined *)&local_78;
  local_78 = local_258;
  Encoding::$get_utf8(EVar9);
  local_248 = Swift::Array<__int8>::$lazy_protocol_witness_table_accessor();
  EVar9.unknown = local_250.unknown;
  EVar13.unknown = local_150.unknown;
  (extension_Foundation)::Swift::String::$init(local_250);
  pcVar3 = local_180;
  SVar2.unknown = local_188.unknown;
  local_240 = EVar9.unknown;
  local_238 = EVar13.unknown;
  if (EVar13.unknown == (undefined *)0x0) {
    puVar1[-0x20] = 2;
    *(undefined8 *)(puVar1 + -0x18) = 0x1f;
    *(undefined4 *)(puVar1 + -0x10) = 0;
    Swift::_assertionFailure(SVar2,(StaticString)0xb,(StaticString)0x2,(uint)pcVar3,0x39);
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x100008fa0);
    (*pcVar5)();
  }
  local_2c8 = &local_88;
  local_2b8 = &local_70;
  local_278 = EVar9.unknown;
  local_270 = EVar13.unknown;
  local_88 = EVar9.unknown;
  local_80 = EVar13.unknown;
  Swift::DefaultStringInterpolation::$appendInterpolation((char)local_2c8,local_190);
  $$outlined_destroy_of_Swift.String((int)local_2c8);
  DVar16.unknown = (undefined *)0x1;
  SVar19 = Swift::String::init("",0,1);
  local_2c0 = SVar19.bridgeObject;
  Swift::DefaultStringInterpolation::appendLiteral(SVar19,DVar16);
  _swift_bridgeObjectRelease(local_2c0);
  local_2a8.unknown = local_70;
  local_2b0 = local_68;
  _swift_bridgeObjectRetain();
  $$outlined_destroy_of_Swift.DefaultStringInterpolation((int)local_2b8);
  local_98 = Swift::String::init(local_2a8);
  local_288 = &local_98;
  Encoding::$get_utf8((Encoding)local_98.str);
  local_2a0 = Swift::String::$lazy_protocol_witness_table_accessor();
  uVar12 = (extension_Foundation)::Swift::StringProtocol::$data();
  dVar6 = (dword)uVar12 & 1;
  uVar14 = (uint)dVar6;
  EVar9.unknown = local_150.unknown;
  (extension_Foundation)::Swift::StringProtocol::$data(local_150,SUB41(dVar6,0));
  local_290 = *(code **)(local_160 + 8);
  local_298 = EVar9.unknown;
  local_280 = uVar14;
  (*local_290)(local_150.unknown,local_168);
  $$outlined_destroy_of_Swift.String((int)local_288);
  pcVar3 = local_180;
  SVar2.unknown = local_188.unknown;
  if ((local_280 & 0xf000000000000000) == 0xf000000000000000) {
    puVar1[-0x20] = 2;
    *(undefined8 *)(puVar1 + -0x18) = 0x1f;
    *(undefined4 *)(puVar1 + -0x10) = 0;
    Swift::_assertionFailure(SVar2,(StaticString)0xb,(StaticString)0x2,(uint)pcVar3,0x39);
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x10000912c);
    (*pcVar5)();
  }
  local_2d8 = local_298;
  local_2d0 = local_280;
  local_300 = local_280;
  local_2f8 = local_298;
  local_a8 = local_298;
  local_a0 = local_280;
  local_b8 = Swift::String::init("hackallthethings",0x10,1);
  local_2e8 = &local_b8;
  Encoding::$get_utf8((Encoding)local_b8.str);
  uVar12 = (extension_Foundation)::Swift::StringProtocol::$data();
  uVar17 = SUB84(local_2a0,0);
  dVar6 = (dword)uVar12 & 1;
  uVar14 = (uint)dVar6;
  EVar9.unknown = local_150.unknown;
  (extension_Foundation)::Swift::StringProtocol::$data(local_150,SUB41(dVar6,0));
  local_2f0 = EVar9.unknown;
  local_2e0 = uVar14;
  (*local_290)(local_150.unknown,local_168);
  $$outlined_destroy_of_Swift.String((int)local_2e8);
  pcVar3 = local_180;
  SVar2.unknown = local_188.unknown;
  if ((local_2e0 & 0xf000000000000000) == 0xf000000000000000) {
    puVar1[-0x20] = 2;
    *(undefined8 *)(puVar1 + -0x18) = 0x20;
    *(undefined4 *)(puVar1 + -0x10) = 0;
    Swift::_assertionFailure(SVar2,(StaticString)0xb,(StaticString)0x2,(uint)pcVar3,0x39);
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x100009248);
    (*pcVar5)();
  }
  local_310 = local_2f0;
  local_308 = local_2e0;
  local_330 = local_2e0;
  local_328 = local_2f0;
  local_c8 = local_2f0;
  local_c0 = local_2e0;
  $$default_argument_1_of_Foundation.Data.init(base64Encoded:___shared_Swift.String,options:___C.NSD ataBase64DecodingOptions)_->_Foundation.Data?
            ();
  pcVar10 = local_230.str;
  pvVar15 = local_230.bridgeObject;
  Foundation::Data::$init((NSDataBase64DecodingOptions)local_230.str);
  pcVar3 = local_180;
  SVar2.unknown = local_188.unknown;
  local_438 = local_1e8;
  local_320 = pcVar10;
  local_318 = pvVar15;
  if (((uint)pvVar15 & 0xf000000000000000) == 0xf000000000000000) {
    puVar1[-0x20] = 2;
    *(undefined8 *)(puVar1 + -0x18) = 0x21;
    *(undefined4 *)(puVar1 + -0x10) = 0;
    Swift::_assertionFailure(SVar2,(StaticString)0xb,(StaticString)0x2,(uint)pcVar3,0x39);
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x1000092fc);
    (*pcVar5)();
  }
  local_3a0 = pvVar15;
  local_398 = pcVar10;
  local_340 = pcVar10;
  local_338 = pvVar15;
  local_d8 = pcVar10;
  local_d0 = pvVar15;
  this_00 = CryptoSwift::AES::typeMetadataAccessor();
  local_390 = this_00;
  AVar8 = (extension_CryptoSwift)::Foundation::Data::get_bytes(local_2f8,local_300);
  uVar12 = CONCAT44(extraout_var_00,AVar8);
  uVar14 = local_330;
  local_360 = uVar12;
  AVar8 = (extension_CryptoSwift)::Foundation::Data::get_bytes(local_328,local_330);
  local_388 = CryptoSwift::CBC::init(CONCAT44(extraout_var_01,AVar8));
  local_368 = local_100;
  local_e8 = &$$type_metadata_for_CryptoSwift.CBC;
  local_e0 = &$$protocol_witness_table_for_CryptoSwift.CBC_:_CryptoSwift.BlockMode_in_CryptoSwift;
  puVar11 = &DAT_10016d648;
  local_380 = uVar14;
  local_378 = uVar12;
  local_36c = uVar17;
  _swift_allocObject(&DAT_10016d648,0x29,7);
  *(undefined8 *)(puVar11 + 0x10) = local_388;
  *(uint *)(puVar11 + 0x18) = local_380;
  *(undefined8 *)(puVar11 + 0x20) = local_378;
  puVar11[0x28] = (byte)local_36c & 1;
  local_100[0] = puVar11;
  local_3c0 = CryptoSwift::AES::$__allocating_init(this_00,local_360,local_368,(AES)0x2);
  local_358 = local_438;
  local_348 = local_438;
  local_350 = local_3c0;
  if (local_438 == 0) {
    local_110 = local_3c0;
    AVar8 = (extension_CryptoSwift)::Foundation::Data::get_bytes(local_398,(uint)local_3a0);
    local_3b8 = CONCAT44(extraout_var_02,AVar8);
    local_3e8 = (extension_CryptoSwift)::CryptoSwift::Cipher::$decrypt
                          (local_3b8,local_390,0x10016dd08);
    local_3a8 = local_438;
    local_3b0 = local_3e8;
    _swift_bridgeObjectRelease(local_3b8);
    local_118 = local_3e8;
    _swift_bridgeObjectRetain();
    local_120 = local_3e8;
    pvVar15 = local_1f0;
    local_3e0.unknown = (undefined *)Foundation::Data::$init((char)&local_120);
    local_3d8 = pvVar15;
    local_130 = local_3e0.unknown;
    local_128 = pvVar15;
    Encoding::$get_utf8(local_3e0);
    EVar9.unknown = local_3e0.unknown;
    pvVar15 = local_3d8;
    (extension_Foundation)::Swift::String::$init(local_3e0);
    pcVar3 = local_180;
    SVar2.unknown = local_188.unknown;
    local_3d0 = EVar9.unknown;
    local_3c8 = pvVar15;
    if (pvVar15 == (void *)0x0) {
      puVar1[-0x20] = 2;
      *(undefined8 *)(puVar1 + -0x18) = 0x27;
      *(undefined4 *)(puVar1 + -0x10) = 0;
      Swift::_assertionFailure(SVar2,(StaticString)0xb,(StaticString)0x2,(uint)pcVar3,0x39);
                    /* WARNING: Does not return */
      pcVar5 = (code *)SoftwareBreakpoint(1,0x100009520);
      (*pcVar5)();
    }
    local_418 = EVar9.unknown;
    local_410 = pvVar15;
    local_3f8 = EVar9.unknown;
    local_3f0 = pvVar15;
    local_140 = EVar9.unknown;
    local_138 = pvVar15;
    outlined_consume(local_3e0.unknown,(uint)local_3d8);
    _swift_bridgeObjectRelease(local_3e8);
    _swift_release(local_3c0);
    outlined_consume(local_398,(uint)local_3a0);
    outlined_consume(local_328,local_330);
    outlined_consume(local_2f8,local_300);
    _swift_bridgeObjectRelease(local_258);
    _swift_bridgeObjectRelease(local_210);
    _swift_bridgeObjectRelease(local_230.bridgeObject);
    local_408 = local_418;
    local_400 = local_410;
  }
  else {
    local_430 = local_438;
    _swift_errorRetain();
    local_108 = local_430;
    _swift_errorRelease();
    _swift_errorRelease(local_430);
    local_428 = Swift::String::init("",0,1);
    outlined_consume(local_398,(uint)local_3a0);
    outlined_consume(local_328,local_330);
    outlined_consume(local_2f8,local_300);
    _swift_bridgeObjectRelease(local_258);
    _swift_bridgeObjectRelease(local_210);
    _swift_bridgeObjectRelease(local_230.bridgeObject);
    local_408 = local_428.str;
    local_400 = local_428.bridgeObject;
  }
  auVar18._8_8_ = local_400;
  auVar18._0_8_ = local_408;
  return auVar18;
}
```

```php
void __thiscall Captain_Nohook::ViewController::whereIsflag(ViewController *this,UIButton *param_1)

{
  undefined *puVar1;
  ViewController *pVVar2;
  StaticString SVar3;
  char *pcVar4;
  code *pcVar5;
  int iVar6;
  UIButton *pUVar7;
  Configuration CVar8;
  Configuration *pCVar9;
  AttributedString.conflict AVar10;
  Configuration *pCVar11;
  
  local_78 = (uint *)PTR__swift_isaMask_10016d120;
  local_c8.unknown = "Fatal error";
  local_c0 = "Unexpectedly found nil while implicitly unwrapping an Optional value";
  local_b8 = "Captain_Nohook/ViewController.swift";
  local_28 = (UIButton *)0x0;
  local_30 = (ViewController *)0x0;
  local_d0 = this;
  local_98 = param_1;
  local_20 = this;
  local_b0 = (undefined *)Foundation::AttributedString::CharacterView::typeMetadataAccessor();
  local_a8 = *(int *)(*(int *)(local_b0 + -8) + 0x40) + 0xfU & 0xfffffffffffffff0;
  (*(code *)PTR____chkstk_darwin_10016c2b0)();
  puVar1 = (undefined *)((int)&local_130 - local_a8);
  local_a0.unknown = puVar1;
  iVar6 = ___swift_instantiateConcreteTypeFromMangledName
                    ((int *)&
                            $$demangling_cache_variable_for_type_metadata_for_(extension_in_UIKit):_ _C.UIButton.Configuration?
                    );
  local_90 = *(int *)(*(int *)(iVar6 + -8) + 0x40) + 0xfU & 0xfffffffffffffff0;
  pUVar7 = local_98;
  (*(code *)PTR____chkstk_darwin_10016c2b0)();
  puVar1 = puVar1 + -local_90;
  local_80 = extraout_x8 + 0xfU & 0xfffffffffffffff0;
  local_88 = puVar1;
  (*(code *)PTR____chkstk_darwin_10016c2b0)();
  pCVar9 = (Configuration *)(puVar1 + -local_80);
  pCVar11 = pCVar9;
  local_70 = pCVar9;
  local_30 = this;
  local_28 = pUVar7;
  (**(code **)((*(uint *)this & *local_78) + 0x78))();
  pcVar4 = local_c0;
  SVar3.unknown = local_c8.unknown;
  local_68 = pUVar7;
  if (pUVar7 == (UIButton *)0x0) {
    *(undefined *)&pCVar9[-4].unknown = 2;
    pCVar9[-3].unknown = (undefined *)0x30;
    *(undefined4 *)&pCVar9[-2].unknown = 0;
    Swift::_assertionFailure(SVar3,(StaticString)0xb,(StaticString)0x2,(uint)pcVar4,0x44);
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x10000a018);
    (*pcVar5)();
  }
  local_e8 = pUVar7;
  local_d8 = pUVar7;
  (**(code **)((*(uint *)local_d0 & *local_78) + 0x90))();
  pVVar2 = local_d0;
  local_f8 = pCVar11;
  local_f0 = (extension_Foundation)::Swift::String::_bridgeToObjectiveC();
  _swift_bridgeObjectRelease(local_f8);
  _objc_msgSend(local_e8,"setText:",local_f0);
  _objc_release(local_f0);
  pUVar7 = local_e8;
  _objc_release();
  (**(code **)((*(uint *)pVVar2 & *local_78) + 0x78))();
  pcVar4 = local_c0;
  SVar3.unknown = local_c8.unknown;
  local_e0 = pUVar7;
  if (pUVar7 == (UIButton *)0x0) {
    *(undefined *)&pCVar9[-4].unknown = 2;
    pCVar9[-3].unknown = (undefined *)0x31;
    *(undefined4 *)&pCVar9[-2].unknown = 0;
    Swift::_assertionFailure(SVar3,(StaticString)0xb,(StaticString)0x2,(uint)pcVar4,0x44);
                    /* WARNING: Does not return */
    pcVar5 = (code *)SoftwareBreakpoint(1,0x10000a108);
    (*pcVar5)();
  }
  local_110 = pUVar7;
  local_100 = pUVar7;
  _objc_msgSend(pUVar7,"isHidden");
  local_104 = (dword)pUVar7;
  _objc_release(local_110);
  if ((local_104 & 1) == 0) {
    (extension_UIKit)::__C::UIButton::$get_configuration((UIButton *)(uint)local_104);
    CVar8 = Configuration::$typeMetadataAccessor();
    pAVar12 = (AttributedString *)0x1;
    pCVar9 = local_70;
    (**(code **)(*(int *)(CVar8.unknown + -8) + 0x30))();
    pUVar7 = local_98;
    local_114 = (dword)((sdword)pCVar9 == 0);
    if (local_114 == 0) {
      $$outlined_init_with_copy_of_(extension_in_UIKit):__C.UIButton.Configuration?
                (local_70,local_88);
      (extension_UIKit)::__C::UIButton::$set_configuration(pUVar7);
      $$outlined_destroy_of_(extension_in_UIKit):__C.UIButton.Configuration?(local_70);
    }
    else {
      pcVar5 = (code *)auStack_50;
      Configuration::$modify_attributedTitle(local_70);
      local_128 = pcVar5;
      local_120 = pAVar12;
      AVar10 = Foundation::AttributedString::typeMetadataAccessor();
      pAVar12 = local_120;
      (**(code **)(*(int *)(AVar10.unknown + -8) + 0x30))(local_120,1);
      pUVar7 = local_98;
      local_118 = (dword)((sdword)pAVar12 == 0);
      if (local_118 == 0) {
        (*local_128)(auStack_50,0);
        $$outlined_init_with_copy_of_(extension_in_UIKit):__C.UIButton.Configuration?
                  (local_70,local_88);
        (extension_UIKit)::__C::UIButton::$set_configuration(pUVar7);
        $$outlined_destroy_of_(extension_in_UIKit):__C.UIButton.Configuration?(local_70);
      }
      else {
        local_60 = Swift::String::init("Arrr, find yerr hidden flag here!",0x21,1);
        local_130.unknown = (undefined *)&local_60;
        Foundation::AttributedString::CharacterView::$lazy_protocol_witness_table_accessor();
        (extension_Swift)::Swift::RangeReplaceableCollection::$init((char)local_130.unknown);
        Foundation::AttributedString::set_characters(local_120,local_a0);
        pUVar7 = local_98;
        (*local_128)(auStack_50,0);
        (extension_UIKit)::__C::UIButton::$set_configuration(pUVar7);
      }
    }
  }
  return;
}
```
